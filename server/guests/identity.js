// Who a named speaker is, from Wikidata (no key): a re-staged person (server/guests/restage.js) is checked to be a
// real public figure, an adult and alive, and their presentation and age bracket shape the generic look. Kept for 30
// days in data/guests/identity/ (a recurring figure looks the same every time). A failed or rate-limited lookup is
// no identity: the source's own words decide, and a person the check rules out is never re-staged.
//
//   new IdentityDesk({ dir, fetchImpl, timeoutMs, now }).lookup(name, { role }) -> { qid, presentation, age, born,
//     description } | { refused: 'under 18' | 'deceased' } | null
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const API = 'https://www.wikidata.org/w/api.php';
const DAY = 86400_000;
const UA = 'GLOBIT24-guests/1.0 (pixel news channel; identity check of quoted public figures)';
const GENDER = { Q6581097: 'man', Q2449503: 'man', Q6581072: 'woman', Q1052281: 'woman' };

const claimTime = (e, p) => {
  const v = e?.claims?.[p]?.[0]?.mainsnak?.datavalue?.value?.time;
  return v ? Date.parse(v.replace(/^\+/, '').replace(/-00/g, '-01')) : null;
};
const claimIds = (e, p) => (e?.claims?.[p] || []).map((c) => c?.mainsnak?.datavalue?.value?.id).filter(Boolean);

/** The age bracket of the generic look from a birth date. */
export function ageBracket(born, now = Date.now()) {
  if (!Number.isFinite(born)) return null;
  const y = (now - born) / (365.25 * DAY);
  return y < 18 ? 'minor' : y < 40 ? 'adult' : y < 62 ? 'middle' : 'senior';
}

/**
 * The identity from Wikidata's answers: the first candidate that is a human (P31 Q5) with an English Wikipedia
 * article, whose description agrees with the role the source gives when it gives one.
 */
export function pickIdentity(entities, { role = null, now = Date.now() } = {}) {
  const words = String(role || '').toLowerCase().match(/[a-z]{4,}/g) || [];
  for (const e of entities) {
    if (!claimIds(e, 'P31').includes('Q5')) continue;
    if (!e.sitelinks?.enwiki) continue;
    const description = e.descriptions?.en?.value || '';
    if (words.length && !words.some((w) => description.toLowerCase().includes(w)) && words.every((w) => !['spokesperson', 'official'].includes(w))) continue;
    if (claimTime(e, 'P570')) return { refused: 'deceased', qid: e.id };
    const born = claimTime(e, 'P569');
    const age = ageBracket(born, now);
    if (age === 'minor') return { refused: 'under 18', qid: e.id };
    const g = claimIds(e, 'P21')[0];
    return { qid: e.id, presentation: GENDER[g] || 'neutral', age, born: Number.isFinite(born) ? new Date(born).toISOString().slice(0, 10) : null, description };
  }
  return null;
}

export class IdentityDesk {
  constructor({ dir, fetchImpl = globalThis.fetch, timeoutMs = 4000, ttlDays = 30, now = () => Date.now(), log = console } = {}) {
    this.dir = dir;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.ttl = ttlDays * DAY;
    this.now = now;
    this.log = log;
    this.pausedUntil = 0; // after a refusal (rate limit) the desk rests 30 minutes
  }

  file(name) {
    return this.dir ? path.join(this.dir, `${crypto.createHash('sha1').update(name.toLowerCase()).digest('hex').slice(0, 16)}.json`) : null;
  }

  async getJson(params) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${API}?${new URLSearchParams({ format: 'json', ...params })}`, { signal: ctl.signal, headers: { 'user-agent': UA, accept: 'application/json' } });
      if (!res.ok) throw Object.assign(new Error(`wikidata HTTP ${res.status}`), { status: res.status });
      const text = await res.text();
      if (!text.trim().startsWith('{')) throw Object.assign(new Error('wikidata: not JSON (rate limited?)'), { status: 429 });
      return JSON.parse(text);
    } finally {
      clearTimeout(timer);
    }
  }

  /** The identity of a named person (cached), or null when it cannot be told. Never throws. */
  async lookup(name, { role = null } = {}) {
    const n = String(name || '').trim();
    if (!n) return null;
    const f = this.file(n);
    try {
      if (f && fs.existsSync(f)) {
        const doc = JSON.parse(fs.readFileSync(f, 'utf8'));
        if (this.now() - doc.at < this.ttl) return doc.identity;
      }
    } catch { /* a broken cache entry is looked up again */ }
    if (this.now() < this.pausedUntil) return null;
    try {
      const found = await this.getJson({ action: 'wbsearchentities', search: n, language: 'en', type: 'item', limit: '5' });
      const ids = (found.search || []).map((x) => x.id).slice(0, 5);
      if (!ids.length) return this.keep(f, null);
      const got = await this.getJson({ action: 'wbgetentities', ids: ids.join('|'), props: 'claims|sitelinks|descriptions', languages: 'en', sitefilter: 'enwiki' });
      const identity = pickIdentity(ids.map((id) => got.entities?.[id]).filter(Boolean), { role, now: this.now() });
      return this.keep(f, identity);
    } catch (err) {
      if (err.status === 429 || err.status === 403) this.pausedUntil = this.now() + 30 * 60_000;
      this.log.warn?.(`[guests] identity of a speaker: ${err.message}`);
      return null;
    }
  }

  keep(f, identity) {
    try {
      if (f) {
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.writeFileSync(f, JSON.stringify({ at: this.now(), identity }));
      }
    } catch { /* the cache is a convenience */ }
    return identity;
  }
}
