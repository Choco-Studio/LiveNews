// One polite client for every Wikimedia service the station reads (Wikipedia's, Commons' and Wikidata's Action API, the
// Wikidata Query Service): the picture desk, the footage desk, the guests' identity desk, the election calendar and
// the orchestrator's image search all ask through it (round 10), and a small kept store of their answers.
//
// Wikimedia's API rate limits (mediawiki.org Wikimedia_APIs/Rate_limits, read 17 Oct 2026) are per client across ALL
// its sites: 10 requests a minute with no identifying User-Agent, 200 with a compliant one (a name and contact
// information), no more than 3 at once, and a 429 or 503 carries Retry-After (else wait at least 5 s). So: one queue
// for all Wikimedia hosts, one request at a time, `gapMs` apart, a compliant User-Agent (WIKIMEDIA_CONTACT names the
// operator), a 429/503 pauses the whole queue for what Retry-After asks (5 s at least, `maxPauseMs` at most), and every
// answer is kept on disk (data/pictures/answers.json) so the same question is never asked twice in its lifetime.
//
//   wikimediaAgent(contact)                       the User-Agent
//   new WikimediaClient({ fetchImpl, contact, gapMs }).json(url, { desk, priority, waits }) -> parsed JSON (throws on
//                                                 HTTP errors, 'paused'); priority 0 (the episode being made) to 3
//   client.within({ desk, priority }, fn)         the defaults of every request fn makes, however deep
//   client.media(url, get, { desk })              a media file, same agent, counted, its own pause
//   client.resumeIn()                             ms until a 429's pause ends (0: not paused); client.status()
//   new KeptAnswers({ file, now }).get(key) / .set(key, value, ttlMs) / .save()
import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';

// the desk and the priority of the requests made inside WikimediaClient.within()
const CONTEXT = new AsyncLocalStorage();

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
    this.jobs = []; // the requests waiting, taken by priority, then in the order asked
    this.seq = 0;
    this.pumping = false;
    this.lastAt = 0;
    this.pausedUntil = 0;
    this.mediaPausedUntil = 0; // (media files: upload.wikimedia.org has limits of its own, see media())
    this.stats = { requests: 0, ok: 0, limited: 0, failed: 0 };
    this.hosts = {}; // host -> the same counts (which service answered what)
    this.desks = {}; // desk -> the same counts, and `refused`: asked while paused (who spends the allowance)
  }

  /** True while a 429/503 pause runs (callers then answer from what is kept, or not at all). */
  get paused() {
    return this.now() < this.pausedUntil;
  }

  /** Milliseconds until a 429/503 pause ends (0: not paused). A background caller waits this out, then asks again. */
  resumeIn() {
    return Math.max(0, this.pausedUntil - this.now());
  }

  /**
   * Run `fn` with these defaults for every request it makes, however deep (AsyncLocalStorage): { desk, priority }.
   * The picture desk's batches carry their tier's priority down to its searches this way.
   */
  within(ctx, fn) {
    return CONTEXT.run({ ...(CONTEXT.getStore() || {}), ...ctx }, fn);
  }

  count(host, k, desk = null) {
    this.stats[k]++;
    const h = (this.hosts[host] ||= { requests: 0, ok: 0, limited: 0, failed: 0 });
    h[k]++;
    if (desk) {
      const d = (this.desks[desk] ||= { requests: 0, ok: 0, limited: 0, failed: 0, refused: 0 });
      d[k]++;
    }
  }

  refuse(desk) {
    const d = (this.desks[desk] ||= { requests: 0, ok: 0, limited: 0, failed: 0, refused: 0 });
    d.refused++;
    return Object.assign(new Error('wikimedia paused after a rate limit'), { paused: true });
  }

  pauseFor(res, field = 'pausedUntil') {
    const ask = Number(res?.headers?.get?.('retry-after')) * 1000;
    const wait = Number.isFinite(ask) && ask > 0 ? Math.min(this.maxPauseMs, Math.max(this.minPauseMs, ask)) : this.minPauseMs * 4;
    this[field] = Math.max(this[field], this.now() + wait);
    return wait;
  }

  /**
   * GET a JSON answer through the one queue every desk shares: one request at a time, `gapMs` apart, the highest
   * priority first (0: the episode being made; 1: the next programmes; 2: the rest; 3: background), then in the order
   * asked. While a 429's pause runs a request is refused at once (the episode airs with what is known), unless it is
   * one that `waits` (background work): it stays in the queue until the pause is over. `desk` names who asks, in the
   * counts (`desks`). Throws on HTTP errors and 'paused'.
   */
  json(url, { accept = 'application/json', timeoutMs = null, priority = null, desk = null, waits = null } = {}) {
    const ctx = CONTEXT.getStore() || {};
    let host = 'other';
    try {
      host = new URL(url).host;
    } catch {}
    const job = { url, host, accept, timeoutMs, priority: priority ?? ctx.priority ?? 2, desk: desk || ctx.desk || 'other', waits: waits ?? ctx.waits ?? false, seq: this.seq++ };
    // (during a pause, what cannot wait is refused now: never left behind background work the queue sleeps on)
    if (this.paused && !job.waits) return Promise.reject(this.refuse(job.desk));
    const done = new Promise((resolve, reject) => Object.assign(job, { resolve, reject }));
    this.jobs.push(job);
    this.pump();
    return done;
  }

  /** The next job: the highest priority (the lowest number), then the first asked. */
  take() {
    let k = 0;
    for (let i = 1; i < this.jobs.length; i++) {
      const a = this.jobs[i];
      const b = this.jobs[k];
      if (a.priority < b.priority || (a.priority === b.priority && a.seq < b.seq)) k = i;
    }
    return this.jobs.splice(k, 1)[0];
  }

  async pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.jobs.length) {
        if (this.paused) {
          // a pause: what cannot wait is refused now; what waits stays queued, and the queue sleeps the pause out
          for (const j of this.jobs.filter((x) => !x.waits)) {
            this.jobs.splice(this.jobs.indexOf(j), 1);
            j.reject(this.refuse(j.desk));
          }
          if (!this.jobs.length) break;
          await this.sleep(this.resumeIn() + 50);
          continue;
        }
        const wait = this.lastAt + this.gapMs - this.now();
        if (wait > 0) await this.sleep(wait);
        // (taken after the gap: a request of the episode being made, asked meanwhile, goes first)
        const job = this.take();
        if (!job) break;
        if (this.paused && !job.waits) {
          job.reject(this.refuse(job.desk));
          continue;
        }
        if (this.paused) {
          this.jobs.push(job);
          continue;
        }
        try {
          job.resolve(await this.request(job));
        } catch (err) {
          job.reject(err);
        }
      }
    } finally {
      this.pumping = false;
    }
  }

  async request({ url, host, accept, timeoutMs, desk }) {
    this.lastAt = this.now();
    this.count(host, 'requests', desk);
    const ms = timeoutMs || (host === 'query.wikidata.org' ? this.sparqlTimeoutMs : this.timeoutMs);
    const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(ms) : undefined;
    let res;
    try {
      res = await this.fetch(url, { signal, headers: { 'user-agent': this.agent, 'api-user-agent': this.agent, accept } });
    } catch (err) {
      this.count(host, 'failed', desk);
      throw err;
    }
    if (res.status === 429 || res.status === 503) {
      this.count(host, 'limited', desk);
      this.limitedHost = host; // (which service asked for the pause: the ahead queue's next batch then needs it least)
      this.limitedAt = this.now();
      const waited = this.pauseFor(res);
      try {
        await res.body?.cancel?.();
      } catch {}
      throw Object.assign(new Error(`wikimedia HTTP ${res.status} (pausing ${Math.round(waited / 1000)} s)`), { status: res.status, paused: true });
    }
    if (!res.ok) {
      this.count(host, 'failed', desk);
      try {
        await res.body?.cancel?.();
      } catch {}
      throw Object.assign(new Error(`wikimedia HTTP ${res.status}`), { status: res.status });
    }
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      this.count(host, 'ok', desk);
      return data;
    } catch {
      this.count(host, 'failed', desk);
      throw new Error('wikimedia answer is not JSON');
    }
  }

  /**
   * A media file (a footage clip on upload.wikimedia.org): fetched by `get(headers)` with the same User-Agent, counted
   * for its desk, refused while a 429 on media pauses it; a 429 or 503 pauses media for what Retry-After asks. Media
   * keep a pause of their own: upload.wikimedia.org limits them apart from the API (a media 429 answers nothing about
   * the API's allowance, and pausing the API for it would cost the desk its decisions). -> the response
   */
  async media(url, get, { desk = null } = {}) {
    const ctx = CONTEXT.getStore() || {};
    const who = desk || ctx.desk || 'other';
    let host = 'other';
    try {
      host = new URL(url).host;
    } catch {}
    if (this.now() < this.mediaPausedUntil) throw this.refuse(who);
    this.count(host, 'requests', who);
    let res;
    try {
      res = await get({ 'user-agent': this.agent });
    } catch (err) {
      this.count(host, 'failed', who);
      throw err;
    }
    if (res.status === 429 || res.status === 503) {
      this.count(host, 'limited', who);
      this.pauseFor(res, 'mediaPausedUntil');
    } else this.count(host, res.ok ? 'ok' : 'failed', who);
    return res;
  }

  /** The counts, by host and by desk, and the pause (for /api/pictures/ahead and /api/wikimedia). */
  status() {
    return { ...this.stats, queued: this.jobs.length, pausedFor: this.resumeIn(), hosts: this.hosts, desks: this.desks };
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

  /**
   * save(), without holding the station: the answers written out a few hundred at a time, the event loop handed back
   * every `sliceMs`, the file written asynchronously (round 10: the 5 MB file held the station 240 ms each time it was
   * written at once). One at a time; an answer kept meanwhile is written next time.
   */
  async saveAsync({ force = false, sliceMs = 15, breathe = () => new Promise((resolve) => setImmediate(resolve)) } = {}) {
    if (!this.file || !this.dirty || this.saving) return false;
    if (!force && this.now() - this.savedAt < this.minSaveMs) return false;
    this.saving = true;
    this.savedAt = this.now();
    this.dirty = false;
    try {
      const parts = [];
      let t0 = performance.now();
      for (const [k, e] of this.map) {
        parts.push(`${JSON.stringify(k)}:${JSON.stringify(e)}`);
        if (performance.now() - t0 > sliceMs) {
          await breathe();
          t0 = performance.now();
        }
      }
      await breathe();
      const text = `{"v":1,"answers":{${parts.join(',')}}}`;
      await fs.promises.mkdir(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      await fs.promises.writeFile(tmp, text);
      await fs.promises.rename(tmp, this.file);
      return true;
    } catch (err) {
      this.dirty = true;
      this.log.warn?.(`[pictures] could not keep answers: ${err.message}`);
      return false;
    } finally {
      this.saving = false;
    }
  }
}
