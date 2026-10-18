// One polite client for every Wikimedia service the picture desk reads (Wikipedia's and Commons' Action API, the
// Wikidata Query Service), and a small kept store of their answers.
//
// Wikimedia's API rate limits (mediawiki.org Wikimedia_APIs/Rate_limits, read 17 Oct 2026) are per client across ALL
// its sites: 10 requests a minute with no identifying User-Agent, 200 with a compliant one (a name and contact
// information), no more than 3 at once, and a 429 or 503 carries Retry-After (else wait at least 5 s). So: one queue
// for all Wikimedia hosts, one request at a time, `gapMs` apart, a compliant User-Agent (WIKIMEDIA_CONTACT names the
// operator), a 429/503 pauses the whole queue for what Retry-After asks (5 s at least, `maxPauseMs` at most), and every
// answer is kept on disk (data/pictures/answers.json) so the same question is never asked twice in its lifetime.
//
//   wikimediaAgent(contact)                       the User-Agent
//   new WikimediaClient({ fetchImpl, contact, gapMs }).json(url) -> parsed JSON (throws on HTTP errors, 'paused')
//   client.resumeIn()                             ms until a 429's pause ends (0: not paused); client.stats, .hosts
//   new KeptAnswers({ file, now }).get(key) / .set(key, value, ttlMs) / .save()
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_CONTACT = 'https://github.com/choco-studio/livenews';
export const wikimediaAgent = (contact = DEFAULT_CONTACT) => `GLOBIT24-picturedesk/1.0 (${String(contact || DEFAULT_CONTACT).replace(/[()\r\n]/g, ' ').trim()}) node/${process.versions?.node || '22'}`;

export class WikimediaClient {
  constructor({ fetchImpl = globalThis.fetch, contact = DEFAULT_CONTACT, gapMs = 1100, timeoutMs = 8000, sparqlTimeoutMs = 30_000, minPauseMs = 5000, maxPauseMs = 15 * 60_000, now = () => Date.now(), sleep = null, log = console } = {}) {
    this.fetch = fetchImpl;
    this.agent = wikimediaAgent(contact);
    this.gapMs = gapMs;
    this.timeoutMs = timeoutMs;
    // the Wikidata Query Service answers in its own time (10 s for a two-line query on 17 Oct, through the proxy; its own
    // limit is 60 s a query): a query cut at 8 s is a query asked again, so it gets longer
    this.sparqlTimeoutMs = sparqlTimeoutMs;
    this.minPauseMs = minPauseMs;
    this.maxPauseMs = maxPauseMs;
    this.now = now;
    this.sleep = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.log = log;
    this.queue = Promise.resolve();
    this.lastAt = 0;
    this.pausedUntil = 0;
    this.stats = { requests: 0, ok: 0, limited: 0, failed: 0 };
    this.hosts = {}; // host -> the same counts (which service answered what)
  }

  /** Milliseconds until a 429/503 pause ends (0: not paused). A background caller waits this out, then asks again. */
  resumeIn() {
    return Math.max(0, this.pausedUntil - this.now());
  }

  count(host, k) {
    this.stats[k]++;
    const h = (this.hosts[host] ||= { requests: 0, ok: 0, limited: 0, failed: 0 });
    h[k]++;
  }

  /** True while a 429/503 pause runs (callers then answer from what is kept, or not at all). */
  get paused() {
    return this.now() < this.pausedUntil;
  }

  pauseFor(res) {
    const ask = Number(res?.headers?.get?.('retry-after')) * 1000;
    const wait = Number.isFinite(ask) && ask > 0 ? Math.min(this.maxPauseMs, Math.max(this.minPauseMs, ask)) : this.minPauseMs * 4;
    this.pausedUntil = Math.max(this.pausedUntil, this.now() + wait);
    return wait;
  }

  /** GET a JSON answer through the queue. Throws 'paused' at once while paused (never waits a pause out). */
  json(url, { accept = 'application/json', timeoutMs = null } = {}) {
    let host = 'other';
    try {
      host = new URL(url).host;
    } catch {}
    const run = async () => {
      if (this.paused) throw Object.assign(new Error('wikimedia paused after a rate limit'), { paused: true });
      const wait = this.lastAt + this.gapMs - this.now();
      if (wait > 0) await this.sleep(wait);
      this.lastAt = this.now();
      this.count(host, 'requests');
      const ms = timeoutMs || (host === 'query.wikidata.org' ? this.sparqlTimeoutMs : this.timeoutMs);
      const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(ms) : undefined;
      let res;
      try {
        res = await this.fetch(url, { signal, headers: { 'user-agent': this.agent, 'api-user-agent': this.agent, accept } });
      } catch (err) {
        this.count(host, 'failed');
        throw err;
      }
      if (res.status === 429 || res.status === 503) {
        this.count(host, 'limited');
        this.limitedHost = host; // (which service asked for the pause: the ahead queue's next batch then needs it least)
        this.limitedAt = this.now();
        const waited = this.pauseFor(res);
        try {
          await res.body?.cancel?.();
        } catch {}
        throw Object.assign(new Error(`wikimedia HTTP ${res.status} (pausing ${Math.round(waited / 1000)} s)`), { status: res.status, paused: true });
      }
      if (!res.ok) {
        this.count(host, 'failed');
        try {
          await res.body?.cancel?.();
        } catch {}
        throw Object.assign(new Error(`wikimedia HTTP ${res.status}`), { status: res.status });
      }
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        this.count(host, 'ok');
        return data;
      } catch {
        this.count(host, 'failed');
        throw new Error('wikimedia answer is not JSON');
      }
    };
    const job = this.queue.then(run, run);
    this.queue = job.catch(() => {});
    return job;
  }
}

/** A plain HTTP JSON client with its own gap (NASA's image library), the same shape as WikimediaClient.json. */
export class PacedJson {
  constructor({ fetchImpl = globalThis.fetch, gapMs = 400, timeoutMs = 8000, agent = wikimediaAgent(), now = () => Date.now(), sleep = null } = {}) {
    this.fetch = fetchImpl;
    this.gapMs = gapMs;
    this.timeoutMs = timeoutMs;
    this.agent = agent;
    this.now = now;
    this.sleep = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.queue = Promise.resolve();
    this.lastAt = 0;
    this.pausedUntil = 0;
  }

  get paused() {
    return this.now() < this.pausedUntil;
  }

  json(url) {
    const run = async () => {
      if (this.paused) throw Object.assign(new Error('paused after a rate limit'), { paused: true });
      const wait = this.lastAt + this.gapMs - this.now();
      if (wait > 0) await this.sleep(wait);
      this.lastAt = this.now();
      const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(this.timeoutMs) : undefined;
      const res = await this.fetch(url, { signal, headers: { 'user-agent': this.agent, accept: 'application/json' } });
      if (res.status === 429 || res.status === 503) {
        const ask = Number(res.headers?.get?.('retry-after')) * 1000;
        this.pausedUntil = this.now() + (Number.isFinite(ask) && ask > 0 ? Math.min(15 * 60_000, Math.max(5000, ask)) : 60_000);
        throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status, paused: true });
      }
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
      return res.json();
    };
    const job = this.queue.then(run, run);
    this.queue = job.catch(() => {});
    return job;
  }
}

/**
 * Answers kept on disk with a lifetime each: { key: [expiresAt, value] }. Reads are from memory; save() writes the
 * file (atomically: a temporary file renamed over it). At most `max` entries (the soonest to expire go first).
 */
export class KeptAnswers {
  constructor({ file = null, now = () => Date.now(), max = 20_000, minSaveMs = 30_000, log = console } = {}) {
    this.minSaveMs = minSaveMs; // the file is written at most this often (a 24-hour desk asks in small batches)
    this.savedAt = 0;
    this.file = file;
    this.now = now;
    this.max = max;
    this.log = log;
    this.map = new Map();
    this.dirty = false;
    if (file) {
      try {
        const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
        const t = this.now();
        for (const [k, e] of Object.entries(doc?.answers || {})) if (Array.isArray(e) && e[0] > t) this.map.set(k, e);
      } catch {
        /* a fresh store */
      }
    }
  }

  has(key) {
    const e = this.map.get(key);
    if (!e) return false;
    if (e[0] <= this.now()) {
      this.map.delete(key);
      return false;
    }
    return true;
  }

  get(key) {
    return this.has(key) ? this.map.get(key)[1] : undefined;
  }

  set(key, value, ttlMs) {
    this.map.set(key, [this.now() + ttlMs, value]);
    this.dirty = true;
    if (this.map.size > this.max) {
      const order = [...this.map.entries()].sort((a, b) => a[1][0] - b[1][0]);
      for (const [k] of order.slice(0, this.map.size - this.max)) this.map.delete(k);
    }
    return value;
  }

  save({ force = false } = {}) {
    if (!this.file || !this.dirty) return;
    if (!force && this.now() - this.savedAt < this.minSaveMs) return;
    this.savedAt = this.now();
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ v: 1, answers: Object.fromEntries(this.map) }));
      fs.renameSync(tmp, this.file);
      this.dirty = false;
    } catch (err) {
      this.log.warn?.(`[pictures] could not keep answers: ${err.message}`);
    }
  }
}
