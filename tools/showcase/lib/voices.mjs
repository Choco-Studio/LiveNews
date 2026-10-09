// Showcase recorder: neural voices. Spawns tools/showcase/voice_worker.py once
// (Kokoro; the voice stream's tuned presenter presets and broadcast chain when
// they load) and turns each utterance the page speaks into a request with the
// right voice: the presenter cast in the speaking slot gets their preset, an
// ad's voice-over gets a neutral announcer of the ad's gender and accent, and
// anything unknown falls back to the fake browser voice the page picked.

import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawn } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');

/** Fake browser voices the page offers (name -> Kokoro voice). Gender words make the engine's picker work. */
export const FAKE_VOICES = [
  { name: 'Kokoro George (male)', lang: 'en-GB', kokoro: 'bm_george' },
  { name: 'Kokoro Daniel (male)', lang: 'en-GB', kokoro: 'bm_daniel' },
  { name: 'Kokoro Emma (female)', lang: 'en-GB', kokoro: 'bf_emma' },
  { name: 'Kokoro Lily (female)', lang: 'en-GB', kokoro: 'bf_lily' },
  { name: 'Kokoro Eric (male)', lang: 'en-US', kokoro: 'am_eric' },
  { name: 'Kokoro Liam (male)', lang: 'en-US', kokoro: 'am_liam' },
  { name: 'Kokoro Bella (female)', lang: 'en-US', kokoro: 'af_bella' },
  { name: 'Kokoro Nova (female)', lang: 'en-US', kokoro: 'af_nova' },
];

// Commercial voice-overs when server/voice/adcast.json is missing: deadpan
// announcers nobody on the desk uses.
const ANNOUNCERS = {
  'male:gb': { voice: 'bm_lewis:0.7+bm_daniel:0.3', lang: 'en-gb' },
  'male:us': { voice: 'am_adam:0.7+am_eric:0.3', lang: 'en-us' },
  'female:gb': { voice: 'bf_alice:0.7+bf_lily:0.3', lang: 'en-gb' },
  'female:us': { voice: 'af_sarah:0.7+af_nicole:0.3', lang: 'en-us' },
};

// Without any casting file: the orchestrator's default casting.
const DEFAULT_CAST = {
  paco: 'bm_george', lola: 'af_heart', max: 'am_puck', ada: 'bf_emma', nova: 'af_nova', unit8: 'am_echo', penny: 'bf_isabella', sam: 'am_michael',
};

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

/**
 * The channel's own casting, as the server's voice service reads it:
 * presenters from server/voice/casting.json (voice blend, Kokoro speed, lang,
 * pauses, robot effect), advert voice-overs from server/voice/adcast.json (per
 * ad id, else a default per gender and accent). tools/voice/presets.json (the
 * voice stream's presets) and the default cast are the fallbacks.
 */
export function loadPresets() {
  const files = {
    casting: path.join(REPO, 'server', 'voice', 'casting.json'),
    adcast: path.join(REPO, 'server', 'voice', 'adcast.json'),
    presets: path.join(REPO, 'tools', 'voice', 'presets.json'),
  };
  const casting = readJson(files.casting) || {};
  const presenters = Object.fromEntries(Object.entries(casting).filter(([, v]) => v && typeof v === 'object' && typeof v.voice === 'string'));
  const adcast = readJson(files.adcast) || {};
  const presets = readJson(files.presets)?.presets || {};
  return {
    file: Object.keys(presenters).length ? files.casting : Object.keys(presets).length ? files.presets : null,
    files: { casting: Object.keys(presenters).length ? files.casting : null, adcast: Object.keys(adcast).length ? files.adcast : null, presets: Object.keys(presets).length ? files.presets : null },
    presenters,
    adcast,
    ids: new Set(Object.keys(presets)),
  };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** The advert's voice-over cast, the way server/voice/service.js adCast() picks it. */
function adCast(ad, req, adcast) {
  const own = ad?.id ? adcast?.[ad.id] : null;
  if (own?.voice) return { cast: own, label: `VO ${ad.id} (adcast.json)` };
  const v = ad?.voice || {};
  const female = v.gender === 'female' || /^f/i.test(String(v.gender ?? ''));
  const us = /us/i.test(String(v.lang ?? req.lang ?? ''));
  const def = adcast?.default?.[`${female ? 'female' : 'male'}-${us ? 'us' : 'gb'}`];
  if (def?.voice) return { cast: def, label: `VO ${ad?.id ?? '?'} (adcast.json default)` };
  const a = ANNOUNCERS[`${female ? 'female' : 'male'}:${us ? 'us' : 'gb'}`];
  // Ads ask for 0.85-0.95 browser rates: a slow, deadpan read, kept natural.
  return { cast: { ...a, speed: +clamp((Number(v.rate) || 0.92) * 1.02, 0.86, 1.0).toFixed(3) }, label: `announcer ${female ? 'female' : 'male'} ${us ? 'US' : 'GB'}` };
}

/** Page speech request -> worker request fields ({ voice, speed?, lang?, effect?, pauses? }) + a label for the timeline. */
export function voiceFor(req, presets) {
  const ad = req.ad;
  if (ad || req.slot === 'ad' || (req.slot && /^ad/.test(req.slot))) {
    const { cast, label } = adCast(ad, req, presets.adcast);
    return { voice: cast.voice, lang: cast.lang ?? null, speed: Number(cast.speed) || null, label };
  }
  if (req.presenter) {
    const c = presets.presenters?.[req.presenter];
    if (c) {
      return {
        voice: c.voice,
        speed: Number(c.speed) || null,
        lang: c.lang ?? null,
        effect: c.effect === 'robot' ? 'robot' : null,
        pauses: c.pauses && typeof c.pauses === 'object' ? c.pauses : null,
        label: `${req.presenter} (casting.json)`,
      };
    }
    if (presets.ids.has(req.presenter)) return { voice: req.presenter, label: `${req.presenter} (preset)` };
    if (DEFAULT_CAST[req.presenter]) return { voice: DEFAULT_CAST[req.presenter], label: `${req.presenter} (default cast)` };
  }
  const fake = FAKE_VOICES.find((f) => f.name === req.voiceName);
  const kokoro = req.voiceKokoro || fake?.kokoro || (/gb/i.test(req.lang || '') ? 'bm_george' : 'am_eric');
  const lang = /gb/i.test(req.lang || fake?.lang || '') ? 'en-gb' : 'en-us';
  return { voice: kokoro, lang, speed: +clamp(Number(req.rate) || 1, 0.8, 1.2).toFixed(3), label: `${kokoro} (browser voice ${req.voiceName ?? '?'})` };
}

/** Worker request for one utterance with the voice voiceFor() chose. */
export function workerRequest(text, v) {
  return { text, voice: v.voice, speed: v.speed ?? null, lang: v.lang ?? null, effect: v.effect ?? null, pauses: v.pauses ?? null };
}

/** One persistent worker; requests are served in order. */
export class VoiceWorker {
  constructor({ cache, python = process.env.PYTHON || 'python3', env = {} } = {}) {
    this.cache = cache;
    fs.mkdirSync(cache, { recursive: true });
    this.proc = spawn(python, [path.join(HERE, '..', 'voice_worker.py')], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    });
    this.stderr = [];
    this.proc.stdin.on('error', () => {}); // a dead worker answers 'worker closed', never crashes the recorder
    this.proc.stderr.on('data', (d) => {
      const s = String(d);
      this.stderr.push(s);
      if (this.stderr.length > 400) this.stderr.splice(0, 200);
      if (process.env.SHOWCASE_DEBUG) process.stderr.write(s);
    });
    this.waiting = [];
    this.ready = new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      this.proc.on('exit', (code) => {
        reject(new Error(`voice worker exited (${code}): ${this.stderr.join('').slice(-800)}`));
        for (const w of this.waiting.splice(0)) w.resolve({ ok: false, error: `worker exited ${code}` });
      });
    });
    readline.createInterface({ input: this.proc.stdout }).on('line', (line) => {
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      if ('ready' in msg) {
        if (msg.ready) this.readyResolve(msg);
        else this.proc.kill();
        return;
      }
      const w = this.waiting.shift();
      w?.resolve(msg);
    });
  }

  request(obj) {
    return new Promise((resolve) => {
      if (!this.proc.stdin.writable) return resolve({ ok: false, error: 'worker closed' });
      this.waiting.push({ resolve });
      this.proc.stdin.write(`${JSON.stringify({ cache: this.cache, ...obj })}\n`, (err) => {
        if (err) resolve({ ok: false, error: String(err.message || err) });
      });
    });
  }

  async close() {
    try {
      await Promise.race([this.request({ cmd: 'quit' }), new Promise((r) => setTimeout(r, 3000))]);
    } catch { /* ignore */ }
    this.proc.kill();
  }
}

/**
 * A few workers sharing one job queue. Urgent jobs (the page is waiting, the
 * clock is held) jump the queue; prefetch jobs (sentences of the episode or ad
 * already on air, predicted with the page's own sentence splitter and speech
 * normaliser) fill idle time, so most utterances are ready when spoken.
 * Identical requests are synthesised once.
 */
export class VoicePool {
  constructor({ size = 2, cache, env = {} } = {}) {
    this.workers = Array.from({ length: Math.max(1, size) }, () => new VoiceWorker({ cache, env }));
    this.ready = Promise.any(this.workers.map((w) => w.ready));
    this.queue = [];
    this.jobs = new Map(); // key -> { promise, started, urgent }
    this.idle = [];
    this.stats = { prefetched: 0, prefetchHits: 0, urgent: 0 };
    for (const w of this.workers) w.ready.then(() => this.#free(w), () => {});
  }

  static key(req) {
    return JSON.stringify([req.text, req.voice, req.speed ?? null, req.lang ?? null, req.effect ?? null, req.pauses ?? null]);
  }

  /** req: { text, voice, speed?, lang?, effect? } -> worker reply. */
  request(req, { urgent = true } = {}) {
    const key = VoicePool.key(req);
    let job = this.jobs.get(key);
    if (job) {
      if (urgent && !job.started && !job.urgent) {
        job.urgent = true;
        this.queue.splice(this.queue.indexOf(job), 1);
        this.queue.unshift(job);
      }
      if (urgent && job.prefetch) this.stats.prefetchHits++;
      return job.promise;
    }
    job = { key, req, urgent, prefetch: !urgent, started: false };
    job.promise = new Promise((resolve) => {
      job.resolve = resolve;
    });
    this.jobs.set(key, job);
    if (urgent) {
      this.stats.urgent++;
      this.queue.unshift(job);
    } else {
      this.stats.prefetched++;
      this.queue.push(job);
    }
    this.#pump();
    return job.promise;
  }

  #free(w) {
    this.idle.push(w);
    this.#pump();
  }

  #pump() {
    while (!this.closed && this.idle.length && this.queue.length) {
      const w = this.idle.shift();
      const job = this.queue.shift();
      job.started = true;
      w.request({ id: job.key.slice(0, 40), ...job.req }).then((res) => {
        if (!res.ok) this.jobs.delete(job.key); // let a later request retry
        job.resolve(res);
        this.#free(w);
      });
    }
  }

  get pending() {
    return this.queue.length;
  }

  async close() {
    this.closed = true;
    this.queue.length = 0;
    await Promise.all(this.workers.map((w) => w.close()));
  }
}
