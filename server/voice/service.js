// Neural voices for the channel (VOICE_ENGINE=kokoro). One Kokoro worker stays
// alive; every spoken segment of an episode is synthesised ahead of air in the
// presenter's cast voice (server/voice/casting.json), read the way a newsreader
// would say it (public/js/voice/speechtext.js: numbers, money, acronyms, the
// presenter's phrasing and pauses), and cached under data/voice/. A segment
// whose clip is ready carries `audio: { url, duration, words, phrases, levels }`
// and every voiced segment carries `voiceId`, so a clip that finishes after the
// episode was queued can still be picked up by the client when it airs.
// Advert voice-overs are rendered once, in idle time, for /api/voice/ads.
//
// Nothing here may stop the channel: without Python, the model or the worker
// script the service logs once and every presenter keeps the browser voice.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { KokoroWorker } from './worker.js';
import { VoiceCache } from './cache.js';
import { segmentRequest, adLineRequest, clipId, clientAudio, isSpoken, estimateSeconds, ID_RE } from './plan.js';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const RETRY_MS = 10 * 60_000; // after the engine failed, try again this much later
const PIN_MS = 6 * 3600_000; // clips of recent episodes are never pruned within this time
const FINGERPRINT_FILES = ['engine.py', 'dsp.py', 'textnorm.py', 'loudness.py', 'audio_io.py', 'tone.json', 'presets.json'];

const sleep = (ms) => new Promise((r) => {
  const t = setTimeout(r, ms);
  t.unref?.();
});

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export class VoiceService {
  /**
   * @param {object} o
   * @param {object} o.config  the `voice` block of server/config.js
   * @param {string} o.root    repository root (tools/voice, public/js live under it)
   * @param {Function} [o.createWorker] (opts) => worker with start/request/close/alive (tests: a fake)
   * @param {Function} [o.loadSpeech]   () => speechtext module (tests may pass one)
   * @param {Function} [o.loadAds]      () => array of ad modules ({ id, voice, script })
   */
  constructor({ config = {}, root, log = console, createWorker, loadSpeech, loadAds, castingFile, adcastFile } = {}) {
    this.cfg = {
      engine: config.engine === 'kokoro' ? 'kokoro' : 'browser',
      python: config.python || 'python3',
      kokoroDir: config.kokoroDir || '',
      threads: Number(config.threads) || 0,
      budgetMs: Math.max(0, Number(config.budgetSeconds ?? 90) * 1000),
      firstBudgetMs: Math.max(0, Number(config.firstBudgetSeconds ?? 480) * 1000),
      dir: config.dir || path.join(root || '.', 'data', 'voice'),
      maxBytes: Math.max(10, Number(config.cacheMb ?? 300)) * 1024 * 1024,
      workers: Math.max(1, Math.min(8, Math.floor(Number(config.workers) || 1))),
    };
    this.root = root || path.resolve(HERE, '..', '..');
    this.log = log;
    this.script = path.join(this.root, 'tools', 'voice', 'kokoro_worker.py');
    this.speechFile = path.join(this.root, 'public', 'js', 'voice', 'speechtext.js');
    this.castingFile = castingFile || path.join(HERE, 'casting.json');
    this.adcastFile = adcastFile || path.join(HERE, 'adcast.json');
    this.createWorker =
      createWorker ||
      ((opts) => new KokoroWorker({ ...opts, log }));
    this.loadSpeech = loadSpeech || (() => import(pathToFileURL(this.speechFile).href));
    this.loadAds =
      loadAds ||
      (async () => {
        const m = await import(pathToFileURL(path.join(this.root, 'public', 'js', 'ads', 'index.js')).href);
        // the break bumper's continuity voice is voiced like an advert's script (never picked as an ad)
        return m.CONTINUITY ? [...m.ADS, m.CONTINUITY] : m.ADS;
      });
    this.cache = new VoiceCache({ dir: this.cfg.dir, maxBytes: this.cfg.maxBytes, log });
    // One lane per worker process (VOICE_WORKERS); lanes beyond the first start only when there is a queue.
    this.lanes = Array.from({ length: this.cfg.workers }, () => ({ worker: null, starting: null, busy: false }));
    this.state = 'idle'; // idle | ready | unavailable
    this.coldStart = true; // until the first episode's voice stage (see voiceEpisode)
    this.lastError = null;
    this.disabledUntil = 0;
    this.crashes = [];
    this.queue = []; // { id, req, priority, seq, waiters: [{resolve, reject}] }
    this.jobs = new Map(); // id -> queued/in-flight job (one synthesis per clip id)
    this.seq = 0;
    this.pinned = new Map(); // id -> last use (ms); Infinity = always keep (adverts)
    this.ads = {}; // adId -> { lineText: audio }
    this.adFit = {}; // adId -> [{ line, duration, slot, over }]
    this.adsStarted = false;
    this.speech = undefined; // module | null once loaded
    this.fingerprint = null;
    this.stats = { synthesised: 0, cached: 0, failed: 0, seconds: 0, elapsed: 0 };
    this.prunedAt = 0;
  }

  /** On when VOICE_ENGINE=kokoro and the worker and the speech planner are installed. */
  get enabled() {
    return this.cfg.engine === 'kokoro' && fs.existsSync(this.script) && fs.existsSync(this.speechFile);
  }

  status() {
    return {
      engine: this.cfg.engine,
      enabled: this.enabled,
      state: this.state,
      error: this.lastError,
      queue: this.queue.length,
      voices: this.worker?.info?.voices?.length ?? null,
      stats: this.stats,
      ads: Object.fromEntries(Object.entries(this.ads).map(([id, lines]) => [id, Object.keys(lines).length])),
      adFit: this.adFit,
    };
  }

  // ------------------------------------------------------------------ setup

  engineFingerprint() {
    if (this.fingerprint !== null) return this.fingerprint;
    const h = crypto.createHash('sha256');
    for (const name of FINGERPRINT_FILES) {
      try {
        h.update(name).update(fs.readFileSync(path.join(this.root, 'tools', 'voice', name)));
      } catch { /* a missing file is part of the fingerprint too */ }
    }
    this.fingerprint = h.digest('hex').slice(0, 12);
    return this.fingerprint;
  }

  async speechModule() {
    if (this.speech !== undefined) return this.speech;
    try {
      this.speech = await this.loadSpeech();
    } catch (err) {
      // The worker normalises text itself; only the presenter phrasing is lost.
      this.log.warn?.(`[voice] speech planner unavailable (${err.message}); the worker phrases the text itself`);
      this.speech = null;
    }
    return this.speech;
  }

  unavailable(err) {
    const reason = String(err?.message || err || 'unknown error').slice(0, 300);
    this.lastError = reason;
    this.disabledUntil = Date.now() + RETRY_MS;
    if (this.state !== 'unavailable') {
      this.log.warn?.(`[voice] Kokoro unavailable (${reason}); presenters use the browser voices (retrying in ${RETRY_MS / 60000} min)`);
    }
    this.state = 'unavailable';
  }

  /** The first lane's worker (status, tests). */
  get worker() {
    return this.lanes[0].worker;
  }

  /** A running worker for `lane`, starting one if needed. Resolves false when the engine is unavailable. */
  async ensureWorker(lane = 0) {
    const L = this.lanes[lane];
    if (L.worker?.alive) return true;
    if (Date.now() < this.disabledUntil) return false;
    if (L.starting) return L.starting;
    L.starting = (async () => {
      const env = {};
      if (this.cfg.kokoroDir) env.KOKORO_DIR = this.cfg.kokoroDir;
      if (this.cfg.threads > 0) env.KOKORO_THREADS = String(this.cfg.threads);
      const worker = this.createWorker({ python: this.cfg.python, script: this.script, env });
      try {
        const info = await worker.start();
        L.worker = worker;
        if (this.state !== 'ready') {
          this.log.info?.(`[voice] Kokoro ready (${info?.voices?.length ?? '?'} voices): presenters speak with neural voices`);
        }
        this.state = 'ready';
        this.lastError = null;
        return true;
      } catch (err) {
        try {
          worker.kill?.();
        } catch { /* ignore */ }
        this.unavailable(err);
        return false;
      } finally {
        L.starting = null;
      }
    })();
    return L.starting;
  }

  // ------------------------------------------------------------------ queue

  pin(id, until = Date.now()) {
    const prev = this.pinned.get(id) ?? 0;
    this.pinned.set(id, Math.max(prev, until));
    if (this.pinned.size > 4000) {
      const cutoff = Date.now() - PIN_MS;
      for (const [k, t] of this.pinned) if (t < cutoff) this.pinned.delete(k);
    }
  }

  /** Synthesise clip `id` (once, however many segments ask). Resolves with its metadata. */
  synth(id, req, priority = 0) {
    const known = this.jobs.get(id);
    if (known) {
      known.priority = Math.min(known.priority, priority);
      return new Promise((resolve, reject) => known.waiters.push({ resolve, reject }));
    }
    const job = { id, req, priority, seq: this.seq++, waiters: [] };
    const p = new Promise((resolve, reject) => job.waiters.push({ resolve, reject }));
    this.jobs.set(id, job);
    this.queue.push(job);
    this.pump();
    return p;
  }

  settle(job, err, meta) {
    this.jobs.delete(job.id);
    for (const w of job.waiters) {
      if (err) w.reject(err);
      else w.resolve(meta);
    }
  }

  // Episodes (priority 0) before adverts (1); first come, first served within a priority.
  take() {
    let best = 0;
    for (let i = 1; i < this.queue.length; i++) {
      const a = this.queue[i];
      const b = this.queue[best];
      if (a.priority < b.priority || (a.priority === b.priority && a.seq < b.seq)) best = i;
    }
    return this.queue.splice(best, 1)[0];
  }

  pump() {
    // Lane 0 always serves; further lanes join while there is more queued than lanes at work.
    for (let i = 0; i < this.lanes.length; i++) {
      const busy = this.lanes.filter((l) => l.busy).length;
      if (!this.lanes[i].busy && this.queue.length > (i === 0 ? 0 : busy)) this.lane(i);
    }
  }

  async lane(i) {
    const L = this.lanes[i];
    L.busy = true;
    try {
      while (this.queue.length) {
        const job = this.take();
        if (!(await this.ensureWorker(i))) {
          // Engine down: everything waiting falls back to browser voices.
          const err = new Error(this.lastError || 'voice engine unavailable');
          this.settle(job, err);
          for (const j of this.queue.splice(0)) this.settle(j, err);
          break;
        }
        await this.run(job, L.worker);
      }
    } finally {
      L.busy = false;
    }
  }

  async run(job, worker = this.worker) {
    const out = this.cache.audioPath(job.id);
    const t0 = Date.now();
    try {
      this.cache.ensureDir();
      // Generous: on a busy machine Kokoro can run 10x slower than real time, and
      // killing a slow but healthy worker only adds a model reload.
      const timeoutMs = 240_000 + estimateSeconds(job.req.text) * 30_000;
      const reply = await worker.request({ ...job.req, out, levels: true }, { timeoutMs });
      const meta = {
        id: job.id,
        duration: reply.duration,
        words: Array.isArray(reply.words) ? reply.words : [],
        phrases: Array.isArray(reply.phrases) ? reply.phrases : [],
        levels: reply.levels && Array.isArray(reply.levels.values) ? { rate: reply.levels.rate, values: reply.levels.values } : null,
        voice: reply.voice,
        speed: reply.speed,
        lang: reply.lang,
        effect: reply.effect || null,
        lufs: reply.lufs ?? null,
        truePeak: reply.truePeak ?? null,
        createdAt: new Date().toISOString(),
      };
      if (!Number.isFinite(meta.duration) || meta.duration <= 0) throw new Error('worker returned no audio');
      this.cache.put(job.id, meta);
      this.stats.synthesised++;
      this.stats.seconds += meta.duration;
      this.stats.elapsed += (Date.now() - t0) / 1000;
      this.settle(job, null, meta);
      if (this.cache.writes % 25 === 0) this.prune();
    } catch (err) {
      this.stats.failed++;
      if (worker && !worker.alive) {
        // The worker died or hung: three times within ten minutes and the engine rests.
        const now = Date.now();
        this.crashes = this.crashes.filter((t) => now - t < RETRY_MS);
        this.crashes.push(now);
        if (this.crashes.length >= 3) this.unavailable(new Error(`worker failed 3 times: ${err.message}`));
      }
      this.settle(job, err);
    }
  }

  prune() {
    const now = Date.now();
    const keep = new Set();
    for (const [id, t] of this.pinned) if (now - t < PIN_MS) keep.add(id);
    try {
      const r = this.cache.prune(keep, now);
      this.prunedAt = now;
      if (r.removed) this.log.info?.(`[voice] cache: removed ${r.removed} old clips (${(r.bytes / 1048576).toFixed(0)} MB kept)`);
      return r;
    } catch (err) {
      this.log.warn?.(`[voice] cache prune failed: ${err.message}`);
      return null;
    }
  }

  // --------------------------------------------------------------- episodes

  /**
   * Producer stage: voice every spoken segment of the episode in production.
   * Waits for the clips up to the budget; the rest keep rendering and attach
   * themselves to their segments when done. Returns a note for the pipeline.
   */
  async voiceEpisode(ctx) {
    const t0 = Date.now();
    if (!this.enabled) return { voice: 'browser' };
    if (!(await this.ensureWorker())) return { voice: 'browser', error: this.lastError };
    if (!this.prunedAt) this.prune();
    const speech = await this.speechModule();
    const casting = readJson(this.castingFile, {});
    const presets = readJson(path.join(this.root, 'tools', 'voice', 'presets.json'), {}).presets || {};
    const fp = this.engineFingerprint();
    const segments = ctx.episode?.segments || [];
    let clips = 0;
    let cached = 0;
    let failed = 0;
    let speechSeconds = 0;
    const pending = [];
    for (const seg of segments) {
      if (!isSpoken(seg)) continue;
      const presenter = ctx.presenters?.[seg.anchor];
      if (!presenter?.id) continue;
      let req;
      try {
        req = segmentRequest(seg, { presenterId: presenter.id, presenter, casting, presets, speech });
      } catch (err) {
        this.log.warn?.(`[voice] cannot plan a segment: ${err.message}`);
        continue;
      }
      const id = clipId(req, fp);
      seg.voiceId = id;
      this.pin(id);
      clips++;
      const meta = this.cache.get(id);
      if (meta) {
        seg.audio = clientAudio(id, meta);
        cached++;
        this.stats.cached++;
        speechSeconds += meta.duration;
        continue;
      }
      pending.push(
        this.synth(id, req, 0).then(
          (m) => {
            seg.audio = clientAudio(id, m);
            speechSeconds += m.duration;
          },
          (err) => {
            failed++;
            if (failed === 1) this.log.warn?.(`[voice] ${ctx.program?.title || 'episode'}: a clip failed (${err.message}); that segment uses the browser voice`);
          }
        )
      );
    }
    // Advert voice-overs render in idle time, after the first episode's clips.
    this.ensureAds().catch(() => {});
    const all = Promise.all(pending);
    const rendered = () => segments.filter((s) => s.audio).length;
    all.then(() => {
      if (!pending.length) return;
      const secs = (Date.now() - t0) / 1000;
      this.log.info?.(
        `[voice] ${ctx.program?.title || 'episode'}: ${rendered()}/${clips} clips (${cached} cached), ` +
          `${speechSeconds.toFixed(0)} s of speech in ${secs.toFixed(0)} s${failed ? `, ${failed} failed` : ''}`
      );
    });
    // A cold start (the first episode since the service started: nothing on air, no clips cached for it)
    // waits for every clip up to firstBudgetMs, so the channel's first programme airs with all its voices
    // (owner 07:45: the first WORLD NOW aired 6 of 19 segments without them and read much worse); later
    // episodes are produced minutes ahead and keep the normal budget (their late clips attach before air).
    const budget = this.coldStart ? Math.max(this.cfg.budgetMs, this.cfg.firstBudgetMs) : this.cfg.budgetMs;
    this.coldStart = false;
    let late = false;
    if (pending.length) {
      late = await Promise.race([all.then(() => false), sleep(budget).then(() => true)]);
    }
    const ready = rendered();
    return { voice: 'kokoro', clips, cached, ready, ...(late ? { late: clips - ready - failed } : {}), ...(failed ? { failed } : {}) };
  }

  // ---------------------------------------------------------------- adverts

  adCast(ad, adcast) {
    const own = adcast[ad.id];
    if (own?.voice) return own;
    const v = ad.voice || {};
    const key = `${v.gender === 'female' ? 'female' : 'male'}-${/us/i.test(v.lang || '') ? 'us' : 'gb'}`;
    return adcast.default?.[key] || { voice: 'bm_daniel:0.6+bm_fable:0.4', speed: 0.92, lang: 'en-gb' };
  }

  /** Render every advert's voice-over lines (once; lowest priority). */
  async ensureAds() {
    if (this.adsStarted || !this.enabled || Date.now() < (this.adsRetryAt || 0)) return;
    this.adsStarted = true;
    let ads;
    try {
      ads = await this.loadAds();
    } catch (err) {
      // An advert module mid-edit must not cost the voice-overs for good: try again later.
      this.log.warn?.(`[voice] adverts not voiced yet (${err.message})`);
      this.adsStarted = false;
      this.adsRetryAt = Date.now() + RETRY_MS;
      return;
    }
    const speech = await this.speechModule();
    const adcast = readJson(this.adcastFile, {});
    const fp = this.engineFingerprint();
    for (const ad of ads || []) {
      if (!ad?.id || !Array.isArray(ad.script)) continue;
      const cast = this.adCast(ad, adcast);
      const lines = ad.script.filter((l) => l && typeof l.text === 'string' && /[\p{L}\p{N}]/u.test(l.text));
      const done = [];
      for (const [i, line] of lines.entries()) {
        const req = adLineRequest(line.text, { cast, speech });
        const id = clipId(req, fp);
        this.pin(id, Infinity);
        const put = (m) => {
          const { levels, ...audio } = clientAudio(id, m); // no face to animate: keep the manifest small
          (this.ads[ad.id] ||= {})[line.text] = audio;
          done[i] = m.duration;
          if (done.filter(Number.isFinite).length === lines.length) this.checkAdFit(ad, lines, done);
        };
        const meta = this.cache.get(id);
        if (meta) put(meta);
        else this.synth(id, req, 1).then(put, () => {});
      }
    }
  }

  // Every line should end before the next one is due (the director waits for
  // the voice, so an overrun delays the rest of the spot).
  checkAdFit(ad, lines, durations) {
    const fit = [];
    for (let i = 0; i < lines.length; i++) {
      const slot = (lines[i + 1]?.at ?? ad.duration) - lines[i].at;
      const over = durations[i] - slot;
      fit.push({ line: i, duration: Math.round(durations[i] * 100) / 100, slot: Math.round(slot * 100) / 100, ...(over > 0.05 ? { over: Math.round(over * 100) / 100 } : {}) });
    }
    this.adFit[ad.id] = fit;
    const worst = fit.filter((f) => f.over).sort((a, b) => b.over - a.over)[0];
    if (worst) this.log.info?.(`[voice] advert ${ad.id}: line ${worst.line + 1} runs ${worst.over} s past its slot`);
  }

  /** Voice-over clips by advert id and line text, for the director. */
  adManifest() {
    return this.ads;
  }

  // ------------------------------------------------------------------- http

  /**
   * GET /api/voice/<id>.ogg (the clip), /api/voice/<id>.json (its timing, 404
   * until rendered), /api/voice/ads (advert voice-overs), /api/voice/status.
   * Returns false when the path is not ours.
   */
  handle(req, res, pathname) {
    const json = (status, body, cache = 'no-store') => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache });
      res.end(JSON.stringify(body));
    };
    if (pathname === '/api/voice/ads' || pathname === '/api/voice/status') {
      json(200, pathname === '/api/voice/ads' ? this.adManifest() : this.status());
      return true;
    }
    const m = /^\/api\/voice\/(v[0-9a-f]{20})\.(ogg|json)$/.exec(pathname);
    if (!m || !ID_RE.test(m[1])) return false;
    const [, id, ext] = m;
    if (ext === 'json') {
      const meta = this.cache.get(id);
      if (meta) json(200, clientAudio(id, meta), 'public, max-age=31536000, immutable');
      else json(404, { error: 'not ready' });
      return true;
    }
    const file = this.cache.audioPath(id);
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) return json(404, { error: 'not found' });
      res.writeHead(200, {
        'content-type': 'audio/ogg',
        'content-length': st.size,
        'cache-control': 'public, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
      });
      fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
    });
    return true;
  }

  // Stop the workers now: the server is going away, so a clip still rendering
  // would only be orphaned (its metadata is written here).
  close() {
    for (const L of this.lanes) {
      try {
        L.worker?.kill();
      } catch { /* ignore */ }
      L.worker = null;
    }
  }
}
