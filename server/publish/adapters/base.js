// One interface for every network (docs/publishing/platforms.md): an adapter turns a queued item into the exact
// requests its network's API documents, and either describes them (dry run: the default, always, until the owner
// switches a network on) or makes them, with a rate limit and retries.
//
//   const a = new YouTubeAdapter({ env, fetchImpl, dryRun: true });
//   a.configured()        every credential it needs is in the environment (never read from a file, never printed)
//   a.plan(item)          the requests, in order, secrets redacted: [{ step, method, url, headers, body, file }]
//   await a.publish(item) -> { ok, dryRun, requests, remoteId, url, error, retryable }
//
// Credentials: environment variables only (docs/publishing/setup.md lists them). Every request, response and error
// that is logged or returned goes through redact(), which replaces each credential's value wherever it appears.
import fs from 'node:fs';
import { manualAnywhere } from '../mode.js';

export class PublishError extends Error {
  constructor(message, { status = null, retryable = false, retryAfter = null, body = null } = {}) {
    super(message);
    this.status = status;
    this.retryable = retryable;
    this.retryAfter = retryAfter;
    this.body = body;
  }
}

/** Replace every secret value (and any bearer token) in a string or object, deeply. */
export function redact(value, secrets = []) {
  const list = secrets.filter((s) => typeof s === 'string' && s.length >= 4).sort((a, b) => b.length - a.length);
  const scrub = (s) => {
    let out = String(s);
    for (const sec of list) out = out.split(sec).join('<redacted>');
    return out.replace(/(Bearer|OAuth)\s+[A-Za-z0-9._~+/=-]{8,}/g, '$1 <redacted>').replace(/\/bot\d+:[A-Za-z0-9_-]{20,}/g, '/bot<redacted>');
  };
  const walk = (v) => {
    if (typeof v === 'string') return scrub(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, /^(authorization|access_token|refresh_token|client_secret|password|token|key)$/i.test(k) && typeof x === 'string' ? '<redacted>' : walk(x)]));
    return v;
  };
  return walk(value);
}

/** A token bucket of `perMinute` requests a minute, and a cap of `perDay` publishes a rolling day. */
export class RateLimiter {
  constructor({ perMinute = 60, perDay = Infinity, now = () => Date.now() } = {}) {
    this.perMinute = perMinute;
    this.perDay = perDay;
    this.now = now;
    this.calls = [];
    this.posts = [];
  }

  /** Milliseconds until a request may go (0: now). */
  waitForRequest() {
    const t = this.now();
    this.calls = this.calls.filter((x) => t - x < 60_000);
    if (this.calls.length < this.perMinute) return 0;
    return 60_000 - (t - this.calls[0]);
  }

  takeRequest() {
    this.calls.push(this.now());
  }

  /** May another publish go out today (rolling 24 h)? */
  canPost() {
    const t = this.now();
    this.posts = this.posts.filter((x) => t - x < 24 * 3600_000);
    return this.posts.length < this.perDay;
  }

  takePost() {
    this.posts.push(this.now());
  }
}

const sleepReal = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Run `fn` with retries: network errors, 429 and 5xx are retried with exponential backoff (2 s, 4 s, 8 s; a
 * Retry-After header wins), anything else fails at once. Returns fn's value or throws the last error.
 */
export async function withRetries(fn, { attempts = 4, base = 2000, sleep = sleepReal, onRetry = () => {} } = {}) {
  let last = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn(i);
    } catch (err) {
      last = err;
      const retryable = err?.retryable ?? (err instanceof PublishError ? false : true);
      if (!retryable || i === attempts - 1) throw err;
      const wait = Number.isFinite(err?.retryAfter) ? err.retryAfter * 1000 : base * 2 ** i;
      onRetry(err, i + 1, wait);
      await sleep(wait);
    }
  }
  throw last;
}

/** Turn an HTTP response into data or a PublishError (429 and 5xx retryable). */
export async function readResponse(res) {
  const text = await res.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  if (res.ok) return { status: res.status, body, headers: res.headers };
  const retryAfter = Number(res.headers?.get?.('retry-after'));
  throw new PublishError(`HTTP ${res.status}`, { status: res.status, retryable: res.status === 429 || res.status >= 500, retryAfter: Number.isFinite(retryAfter) ? retryAfter : null, body });
}

export class Adapter {
  /** The adapter's id (a PLATFORMS key), its display name and the environment variables it needs. */
  static id = 'base';
  static label = 'Base';
  static env = [];
  static limits = { perMinute: 30, perDay: 20 };

  constructor({ env = process.env, fetchImpl = globalThis.fetch, dryRun = true, log = () => {}, now = () => Date.now(), sleep = sleepReal, limiter = null } = {}) {
    this.env = env;
    this.fetchImpl = fetchImpl;
    this.dryRun = dryRun !== false;
    this.log = log;
    this.now = now;
    this.sleep = sleep;
    const L = this.constructor.limits;
    this.limiter = limiter || new RateLimiter({ perMinute: L.perMinute, perDay: L.perDay, now });
  }

  get id() {
    return this.constructor.id;
  }

  /** The names of the missing environment variables ([] when configured). */
  missing() {
    return this.constructor.env.filter((k) => !String(this.env[k] || '').trim());
  }

  configured() {
    return this.missing().length === 0;
  }

  /** Every credential value (to redact). */
  secrets() {
    return this.constructor.env.map((k) => this.env[k]).filter(Boolean);
  }

  /** A placeholder for a credential in a dry-run plan: never its value. */
  cred(name) {
    return `<${name}>`;
  }

  /**
   * The AI-disclosure fields this adapter actually sends for an item, as the compliance contract names them
   * ({ containsSyntheticMedia }, { is_aigc }, { is_ai_generated }; {} for a network with no field). The publisher's
   * gate checks these, so it checks what goes out, not what the item claims.
   */
  aiFlags() {
    return {};
  }

  /**
   * The words a reader sees in the post this adapter sends for an item (the text, and on a network that composes
   * its own message, what it adds): what the compliance gate measures against the story's sources.
   */
  postText(item) {
    return String(item?.text || '');
  }

  /** The documented requests for an item. Subclasses implement it. */
  plan() {
    throw new Error('plan() not implemented');
  }

  fileInfo(file) {
    try {
      return { path: file, bytes: fs.statSync(file).size };
    } catch {
      return { path: file, bytes: null };
    }
  }

  /** Hand publishing (PUBLISH_MODE=manual, the beta: mode.js): this adapter never reaches its network. */
  get manual() {
    return manualAnywhere(this.env);
  }

  /**
   * Describe (dry run) or make (live) the item's requests. Never throws: the result says what happened. In hand
   * publishing (PUBLISH_MODE=manual) it only ever describes them, whatever the switches.
   */
  async publish(item) {
    const requests = redact(this.plan(item), this.secrets());
    if (this.dryRun || this.manual) return { ok: true, dryRun: true, requests, remoteId: null, url: null, configured: this.configured(), missing: this.missing(), ...(this.manual ? { manual: true } : {}) };
    if (!this.configured()) return { ok: false, dryRun: false, requests, error: `not configured: set ${this.missing().join(', ')} in the environment`, retryable: false };
    if (!this.limiter.canPost()) return { ok: false, dryRun: false, requests, error: 'daily cap reached', retryable: true };
    try {
      const r = await withRetries(() => this.live(item), { sleep: this.sleep, onRetry: (err, n, wait) => this.log(`[${this.id}] retry ${n} in ${Math.round(wait / 1000)} s: ${redact(err.message, this.secrets())}`) });
      this.limiter.takePost();
      return { ok: true, dryRun: false, requests, ...redact(r, this.secrets()) };
    } catch (err) {
      return { ok: false, dryRun: false, requests, error: redact(String(err?.message || err), this.secrets()), status: err?.status ?? null, body: redact(err?.body ?? null, this.secrets()), retryable: !!err?.retryable };
    }
  }

  /** One HTTP request within the rate limit (live only; never in hand publishing). */
  async request(method, url, { headers = {}, body = undefined } = {}) {
    if (this.manual) throw new PublishError('PUBLISH_MODE is manual: the owner publishes by hand, no request goes to the network', { retryable: false });
    for (;;) {
      const wait = this.limiter.waitForRequest();
      if (!wait) break;
      await this.sleep(wait);
    }
    this.limiter.takeRequest();
    let res;
    try {
      res = await this.fetchImpl(url, { method, headers, body });
    } catch (err) {
      throw new PublishError(`network: ${err?.message || err}`, { retryable: true });
    }
    return readResponse(res);
  }

  /** The live publish (subclasses). Returns { remoteId, url }. */
  async live() {
    throw new PublishError('live publishing not implemented for this network', { retryable: false });
  }
}
