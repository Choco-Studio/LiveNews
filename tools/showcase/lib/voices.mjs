// Showcase recorder: neural voices. Spawns tools/showcase/voice_worker.py once
// (Kokoro; the voice stream's tuned presenter presets and broadcast chain when
// they load) and turns each utterance the page speaks into a request with the
// right voice: the presenter cast in the speaking slot gets their preset, an
// ad's voice-over gets a neutral announcer of the ad's gender and accent, and
// anything unknown falls back to the fake browser voice the page picked.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawn } from 'node:child_process';

const HERE = path.dirname(new URL(import.meta.url).pathname);
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

// Commercial voice-overs: deadpan announcers nobody on the desk uses.
const ANNOUNCERS = {
  'male:gb': { voice: 'bm_lewis:0.7+bm_daniel:0.3', lang: 'en-gb' },
  'male:us': { voice: 'am_adam:0.7+am_eric:0.3', lang: 'en-us' },
  'female:gb': { voice: 'bf_alice:0.7+bf_lily:0.3', lang: 'en-gb' },
  'female:us': { voice: 'af_sarah:0.7+af_nicole:0.3', lang: 'en-us' },
};

// Without presets.json: the orchestrator's default casting.
const DEFAULT_CAST = {
  paco: 'bm_george', lola: 'af_heart', max: 'am_puck', ada: 'bf_emma', nova: 'af_nova', unit8: 'am_echo', penny: 'bf_isabella', sam: 'am_michael',
};

export function loadPresets() {
  for (const file of [path.join(REPO, 'server', 'voice', 'casting.json'), path.join(REPO, 'tools', 'voice', 'presets.json')]) {
    try {
      const j = JSON.parse(fs.readFileSync(file, 'utf8'));
      const presets = j.presets ?? j.cast ?? j;
      if (presets && typeof presets === 'object' && Object.keys(presets).length) return { file, ids: new Set(Object.keys(presets)) };
    } catch { /* not there yet */ }
  }
  return { file: null, ids: new Set() };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Page speech request -> worker request ({ voice, speed?, lang?, effect? }) + a label for the timeline. */
export function voiceFor(req, presets) {
  const ad = req.ad;
  if (ad || req.slot === 'ad' || (req.slot && /^ad/.test(req.slot))) {
    const v = ad?.voice || {};
    const g = /^f/i.test(String(v.gender ?? '')) ? 'female' : 'male';
    const accent = /gb|uk/i.test(String(v.lang ?? req.lang ?? '')) ? 'gb' : 'us';
    const a = ANNOUNCERS[`${g}:${accent}`];
    // Ads ask for 0.85-0.95 browser rates: a slow, deadpan read, kept natural.
    const speed = clamp((Number(v.rate) || 0.92) * 1.02, 0.86, 1.0);
    return { voice: a.voice, lang: a.lang, speed: +speed.toFixed(3), label: `announcer ${g} ${accent.toUpperCase()}` };
  }
  if (req.presenter) {
    if (presets.ids.has(req.presenter)) return { voice: req.presenter, label: `${req.presenter} (preset)` };
    if (DEFAULT_CAST[req.presenter]) return { voice: DEFAULT_CAST[req.presenter], label: `${req.presenter} (default cast)` };
  }
  const fake = FAKE_VOICES.find((f) => f.name === req.voiceName);
  const kokoro = req.voiceKokoro || fake?.kokoro || (/gb/i.test(req.lang || '') ? 'bm_george' : 'am_eric');
  const lang = /gb/i.test(req.lang || fake?.lang || '') ? 'en-gb' : 'en-us';
  return { voice: kokoro, lang, speed: +clamp(Number(req.rate) || 1, 0.8, 1.2).toFixed(3), label: `${kokoro} (browser voice ${req.voiceName ?? '?'})` };
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
    return JSON.stringify([req.text, req.voice, req.speed ?? null, req.lang ?? null, req.effect ?? null]);
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
