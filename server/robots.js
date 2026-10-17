// The outlets' robots.txt (RFC 9309), read before the news desk opens any page of theirs: an article page for the
// writer's text (news.js readArticle), an article page or its AMP page for a picture (pagePictures / resolveImage), and
// every redirect hop of those. The feeds themselves are not pages the desk crawls (the operator subscribed to them;
// the outlet publishes them to be read) and are not checked here.
//
// What is obeyed, as the RFC says:
//   groups   the group(s) naming our product token (GLOBIT24, or GLOBIT: an outlet may write either, in any case, with
//            or without a version or a hyphen), all of them combined; when no group names us, the "*" group(s); when
//            neither exists, everything is allowed. Exact token comparison, never a substring: a group for "bot" or
//            "news" or "Mozilla" is not ours.
//   rules    Allow / Disallow matched against the page's path and query, "*" for any run of characters and "$" for
//            the end; the longest matching rule wins, an Allow over a Disallow of the same length; no matching rule
//            means allowed. /robots.txt itself is always allowed.
//   fetch    2xx: the file is read (at most 512 KiB, the rest ignored) and obeyed. 4xx: no file, everything allowed
//            (except 429, a "slow down", which counts as unreachable); a 404 or 410 is kept the day, any other 4xx (a
//            bot shield's 403) an hour. 5xx, a network failure, a timeout or more than five redirects: unreachable,
//            everything disallowed until the next try (RETRY_MS later).
//   closed   beyond the RFC: an origin whose page answers 401, 403 or 429 is not asked for another page for CLOSED_MS
//            (RETRY_MS after a 429): a server that refuses us is not knocked on story after story.
//   cache    a file read (or a 4xx) is kept TTL_MS, about a day: in memory, and in a small disk cache (one JSON file per
//            origin holding only the rules that apply to us, not the outlet's file) so a restart does not read it again.
//   delay    a Crawl-delay in the group we obey spaces our page requests to that origin; a page whose turn would come
//            more than `maxWaitMs` later is not fetched now (the reader tries it at its next pass).
//
//   new Robots({ fetchImpl, dir, now, sleep, log, lookup, ttlMs, retryMs, maxWaitMs })
//   robots.check(url)  -> { allowed, reason: 'allowed'|'disallowed'|'no-robots'|'unreachable', rule, entry }
//   robots.gate(url)   -> resolves when the page may be fetched (after any Crawl-delay), else throws RobotsRefusal
//   parseRobots(text), rulesFor(parsed), isAllowed(rules, pathAndQuery), agentIsUs(value)
import fs from 'node:fs';
import path from 'node:path';
import { guardedFetch, readCapped } from './net.js';

/** The channel's user-agent for every page and feed the news desk reads: its name and the repository, never an e-mail. */
export const USER_AGENT = 'Mozilla/5.0 (compatible; GLOBIT24/1.0; +https://github.com/choco-studio/livenews)';
/** The product token an outlet names in its robots.txt to address us. */
export const ROBOTS_TOKEN = 'GLOBIT24';
const OUR_TOKENS = new Set(['globit24', 'globit']);
const CACHE_VERSION = 1;

export const TTL_MS = 24 * 3600_000;
export const RETRY_MS = 30 * 60_000;
export const SHORT_MS = 3600_000;
export const CLOSED_MS = 6 * 3600_000;
export const MAX_BYTES = 512 * 1024;

/** A page the outlet's robots.txt keeps from us (reason 'disallowed'), or not to be asked now ('unreachable', 'delay', 'closed'). */
export class RobotsRefusal extends Error {
  constructor(url, { reason, rule = null, retryAt = null, origin = null } = {}) {
    super(
      reason === 'disallowed'
        ? `robots.txt disallows ${pathOf(url)}${rule ? ` (${rule.allow ? 'Allow' : 'Disallow'}: ${rule.path})` : ''}`
        : reason === 'delay'
          ? 'robots.txt crawl-delay: later'
          : reason === 'closed'
            ? 'the server refused our last page: not asked again yet'
            : 'robots.txt unreachable: not fetched until the next try',
    );
    this.code = 'ROBOTS';
    this.reason = reason;
    this.rule = rule;
    this.retryAt = retryAt;
    this.origin = origin;
    this.url = url;
  }
}

function pathOf(url) {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return String(url).slice(0, 80);
  }
}

/** Percent-encode what is not printable ASCII and upper-case the escapes, so a rule and a path compare octet for octet. */
export function normPath(s) {
  let out = '';
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (c > 0x20 && c < 0x7f) out += ch;
    else {
      try {
        out += encodeURIComponent(ch);
      } catch {
        out += '%EF%BF%BD';
      }
    }
  }
  return out.replace(/%[0-9a-f]{2}/gi, (m) => m.toUpperCase());
}

function normPattern(p) {
  const s = p.startsWith('/') || p.startsWith('*') ? p : `/${p}`;
  return normPath(s);
}

/** Does a user-agent line's value name us? "*" is not us (it is the fallback group). */
export function agentIsUs(value) {
  const token = String(value || '').trim().toLowerCase().split(/[\/\s]/)[0];
  return OUR_TOKENS.has(token.replace(/[^a-z0-9]/g, ''));
}

/** The groups of a robots.txt: [{ agents: [...], rules: [{ allow, path }], delay }]. Lines outside a group are ignored. */
export function parseRobots(text) {
  const groups = [];
  let cur = null;
  let inAgents = false;
  for (const raw of String(text ?? '').replace(/^﻿/, '').split(/\r\n|\r|\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = /^([A-Za-z][A-Za-z _-]{0,30}?)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase().replace(/[\s_-]/g, '');
    const value = m[2].trim();
    if (key === 'useragent') {
      if (!cur || !inAgents) {
        cur = { agents: [], rules: [], delay: null };
        groups.push(cur);
      }
      cur.agents.push(value);
      inAgents = true;
    } else if (key === 'allow' || key === 'disallow') {
      if (!cur) continue;
      inAgents = false;
      if (value) cur.rules.push({ allow: key === 'allow', path: normPattern(value) });
    } else if (key === 'crawldelay') {
      if (!cur) continue;
      inAgents = false;
      const n = Number(value.replace(',', '.'));
      if (Number.isFinite(n) && n >= 0) cur.delay = Math.max(cur.delay ?? 0, n);
    }
    // sitemap, host, clean-param and the rest: neither rules for us nor group boundaries
  }
  return { groups };
}

/** The rules we obey in a parsed file: our token's groups combined, else the "*" groups combined, else none. */
export function rulesFor(parsed) {
  const groups = parsed?.groups || [];
  const ours = groups.filter((g) => g.agents.some(agentIsUs));
  const chosen = ours.length ? ours : groups.filter((g) => g.agents.some((a) => a.trim() === '*'));
  const delays = chosen.map((g) => g.delay).filter((d) => d !== null);
  return {
    agent: ours.length ? ROBOTS_TOKEN : chosen.length ? '*' : null,
    rules: chosen.flatMap((g) => g.rules),
    delay: delays.length ? Math.max(...delays) : null,
  };
}

/** Every product token a file names (the report checks none of them is ours by accident). */
export function namedAgents(parsed) {
  return [...new Set((parsed?.groups || []).flatMap((g) => g.agents.map((a) => a.trim())).filter(Boolean))];
}

/** "*" wildcard matching of a whole string, without backtracking blow-ups (a rule comes from a third party). */
function globMatch(p, s) {
  let i = 0;
  let j = 0;
  let star = -1;
  let mark = 0;
  while (j < s.length) {
    if (i < p.length && p[i] !== '*' && p[i] === s[j]) {
      i++;
      j++;
    } else if (i < p.length && p[i] === '*') {
      star = i++;
      mark = j;
    } else if (star >= 0) {
      i = star + 1;
      j = ++mark;
    } else return false;
  }
  while (i < p.length && p[i] === '*') i++;
  return i === p.length;
}

/** Does a rule's path match this path-and-query? (a prefix match; "$" at the end anchors it) */
export function ruleMatches(pattern, target) {
  const anchored = pattern.endsWith('$');
  return globMatch(anchored ? pattern.slice(0, -1) : `${pattern}*`, target);
}

/** The longest matching rule decides; an Allow wins a tie; no match is allowed. */
export function isAllowed(rules, target) {
  const t = normPath(target || '/');
  if (t === '/robots.txt') return { allowed: true, rule: null };
  let best = null;
  for (const r of rules || []) {
    if (!ruleMatches(r.path, t)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow && !best.allow)) best = r;
  }
  return { allowed: !best || best.allow, rule: best };
}

const fileOf = (dir, origin) => path.join(dir, `${origin.replace('://', '_').replace(/[^a-z0-9.-]/gi, '_')}.json`);

export class Robots {
  constructor({ fetchImpl = fetch, dir = null, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = console, lookup = null, ttlMs = TTL_MS, retryMs = RETRY_MS, maxWaitMs = 3000, timeoutMs = 8000 } = {}) {
    this.fetch = fetchImpl;
    this.dir = dir;
    this.now = now;
    this.sleep = sleep;
    this.log = log;
    this.lookup = lookup;
    this.ttlMs = ttlMs;
    this.retryMs = retryMs;
    this.maxWaitMs = maxWaitMs;
    this.timeoutMs = timeoutMs;
    this.mem = new Map(); // origin -> entry
    this.pending = new Map(); // origin -> promise of the entry being read
    this.nextSlot = new Map(); // origin -> earliest time of our next page request (Crawl-delay)
    this.closed = new Map(); // origin -> until when its server is not asked again (it answered 401, 403 or 429)
    this.told = new Set(); // origins whose first refusal was logged (once per origin)
    this.reads = 0; // robots.txt files requested (tests, the report)
    if (dir) this.prune();
  }

  /** The policy for a URL's origin: from memory, else the disk cache, else the outlet's robots.txt (read once at a time). */
  async policy(url) {
    const origin = new URL(url).origin.toLowerCase();
    const t = this.now();
    const held = this.mem.get(origin);
    if (held && t < held.until) return held;
    if (!held) {
      const disk = this.readDisk(origin);
      if (disk && t < disk.until && t >= disk.at) {
        this.mem.set(origin, disk);
        return disk;
      }
    }
    if (this.pending.has(origin)) return this.pending.get(origin);
    const p = this.load(origin).finally(() => this.pending.delete(origin));
    this.pending.set(origin, p);
    return p;
  }

  async load(origin) {
    const at = this.now();
    this.reads++;
    let entry;
    try {
      const { res } = await guardedFetch(this.fetch, `${origin}/robots.txt`, {
        timeoutMs: this.timeoutMs,
        maxRedirects: 5,
        headers: { 'user-agent': USER_AGENT, accept: 'text/plain, */*;q=0.5' },
        ...(this.lookup ? { lookup: this.lookup } : {}),
      });
      const status = res.status;
      if (status >= 200 && status < 300) {
        const parsed = parseRobots((await readCapped(res, MAX_BYTES, { truncate: true })).toString('utf8'));
        const mine = rulesFor(parsed);
        entry = { origin, kind: 'ok', status, agent: mine.agent, rules: mine.rules, delay: mine.delay, named: namedAgents(parsed).slice(0, 300), at, until: at + this.ttlMs };
      } else {
        try {
          await res.body?.cancel?.();
        } catch {}
        // 4xx: no file for us, everything allowed; a 404 or 410 (no file at all) for the day, any other 4xx (a bot
        // shield's 403, a passing 406) only for the hour, so a refusal that is not "no file" is soon asked again
        entry =
          status >= 400 && status < 500 && status !== 429
            ? { origin, kind: 'unavailable', status, rules: [], delay: null, at, until: at + (status === 404 || status === 410 ? this.ttlMs : Math.min(this.ttlMs, SHORT_MS)) }
            : { origin, kind: 'unreachable', status, rules: [], delay: null, at, until: at + this.retryMs };
      }
    } catch (err) {
      entry = { origin, kind: 'unreachable', status: null, error: String(err?.message || err).slice(0, 120), rules: [], delay: null, at, until: at + this.retryMs };
    }
    this.mem.set(origin, entry);
    this.writeDisk(entry);
    return entry;
  }

  /** May this page be fetched? (no waiting: gate() adds the Crawl-delay) */
  async check(url) {
    let u;
    try {
      u = new URL(url);
    } catch {
      return { allowed: false, reason: 'invalid', rule: null, entry: null };
    }
    if (!/^https?:$/.test(u.protocol)) return { allowed: false, reason: 'invalid', rule: null, entry: null };
    const entry = await this.policy(u.href);
    if (u.pathname === '/robots.txt' && !u.search) return { allowed: true, reason: 'allowed', rule: null, entry };
    if (entry.kind === 'unreachable') return { allowed: false, reason: 'unreachable', rule: null, entry };
    if (entry.kind === 'unavailable') return { allowed: true, reason: 'no-robots', rule: null, entry };
    const r = isAllowed(entry.rules, u.pathname + u.search);
    return { allowed: r.allowed, reason: r.allowed ? 'allowed' : 'disallowed', rule: r.rule, entry };
  }

  /** A page of this origin answered 401, 403 or 429: no other page of it is asked for a while (memory only). */
  serverRefused(url, status) {
    if (![401, 403, 429].includes(status)) return;
    try {
      const origin = new URL(url).origin.toLowerCase();
      this.closed.set(origin, this.now() + (status === 429 ? this.retryMs : CLOSED_MS));
    } catch {}
  }

  /** Resolves when the page may be fetched now (after its turn under a Crawl-delay); throws RobotsRefusal otherwise. */
  async gate(url, { maxWaitMs = this.maxWaitMs } = {}) {
    try {
      const shut = this.closed.get(new URL(url).origin.toLowerCase());
      if (shut && this.now() < shut) throw new RobotsRefusal(url, { reason: 'closed', retryAt: shut });
    } catch (err) {
      if (err instanceof RobotsRefusal) throw err;
    }
    const c = await this.check(url);
    const origin = c.entry?.origin || null;
    if (!c.allowed) {
      if (c.reason === 'disallowed' && origin && !this.told.has(origin)) {
        this.told.add(origin);
        this.log.info?.(`[robots] ${origin} keeps ${pathOf(url)} from ${ROBOTS_TOKEN} (${c.rule.allow ? 'Allow' : 'Disallow'}: ${c.rule.path}): the story keeps its feed's text and pictures`);
      }
      throw new RobotsRefusal(url, { reason: c.reason === 'invalid' ? 'disallowed' : c.reason, rule: c.rule, retryAt: c.entry?.until ?? null, origin });
    }
    const delayMs = Math.max(0, Number(c.entry?.delay) || 0) * 1000;
    if (delayMs > 0 && origin) {
      const t = this.now();
      const slot = Math.max(t, this.nextSlot.get(origin) || 0);
      if (slot - t > maxWaitMs) throw new RobotsRefusal(url, { reason: 'delay', retryAt: slot, origin });
      this.nextSlot.set(origin, slot + delayMs);
      if (slot > t) await this.sleep(slot - t);
    }
    return c;
  }

  readDisk(origin) {
    if (!this.dir) return null;
    try {
      const e = JSON.parse(fs.readFileSync(fileOf(this.dir, origin), 'utf8'));
      return e?.v === CACHE_VERSION && e.origin === origin && Array.isArray(e.rules) ? e : null;
    } catch {
      return null;
    }
  }

  writeDisk(entry) {
    if (!this.dir) return;
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      const f = fileOf(this.dir, entry.origin);
      fs.writeFileSync(`${f}.tmp`, JSON.stringify({ v: CACHE_VERSION, ...entry }));
      fs.renameSync(`${f}.tmp`, f);
    } catch (err) {
      if (!this.diskWarned) this.log.warn?.(`[robots] cache: ${err.message}`);
      this.diskWarned = true;
    }
  }

  /** The disk cache stays small: an origin not read for a week is forgotten. */
  prune() {
    try {
      const since = this.now() - 7 * 86400_000;
      for (const name of fs.readdirSync(this.dir)) {
        if (!name.endsWith('.json')) continue;
        const f = path.join(this.dir, name);
        if (fs.statSync(f).mtimeMs < since) fs.unlinkSync(f);
      }
    } catch {
      /* no cache folder yet */
    }
  }
}
