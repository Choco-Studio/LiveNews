// Openverse (api.openverse.org): a second source of openly licensed photographs for the picture desk, used only for
// the Flickr accounts of institutions (a presidency, a parliament, a ministry) that publish their own pictures of
// public figures and of their own events under a licence the rights desk clears.
//
// Read live on 17 Oct 2026 (docs/pictures/RIGHTS.md §3):
//   - the API answers anonymously, with limits announced in its headers: 20 requests a minute ("anon_burst") and 200
//     a day ("anon_sustained"); its terms ask that the limits be kept, the catalogue never scraped, no second machine
//     used to get round them, a product made with it say so ("made with Openverse, not endorsed by it"), and the
//     terms of the platforms hosting the works respected;
//   - Openverse does not verify the licences it indexes, and Flickr's licences are set by the uploader, not reviewed as
//     Commons' are;
//   - Flickr's robots.txt refuses every robot it does not name ("User-agent: * / Disallow: /"): the desk never reads a
//     flickr.com page. It reads only what Openverse indexed (the licence, the creator's Flickr address, the title, the
//     tags, when it was indexed) and fetches the picture itself from live.staticflickr.com (its robots.txt refuses
//     nothing), with the desk's identifying User-Agent.
//
// So a Flickr photo found through Openverse may air (`openverseTrust`) only when:
//   - its account is one of INSTITUTIONS (tier 1: the account's Flickr address and name checked by hand on 17 Oct). A
//     second tier, a long-standing account with many photos of its own, would need the account's age and size, which
//     only Flickr's pages (refused to robots) or Flickr's API (a key; commercial use needs Flickr's permission) give:
//     it stays off until the owner has such a key;
//   - its licence, as indexed, is one the rights desk clears (CC BY, CC BY-SA, CC0, a US government work);
//   - nothing in its title or tags names another agency's picture or credit (Reuters, AP, AFP, Getty, EPA...);
//   - it was indexed before the story, and any year its title gives is not after the story's (a FILE picture says the
//     year its title gives).
//
//   new OpenverseClient({ fetchImpl, agent, gapMs, perDay, store }).search(q, { extra }) -> [result] | null
//   openverseResult(raw) -> result;   openverseTrust(result, { storyAt }) -> { tier, why, year }
import { licenceOf, LICENCES } from './rights.js';
import { wikimediaAgent } from './wikimedia.js';

const DAY = 86_400_000;
export const OPENVERSE = 'https://api.openverse.org/v1/images/';

// Institutions' own Flickr accounts, each checked by hand on 17 Oct 2026 (its address, its name, when it joined, its
// photo count): tier 1. Their licence is still read on each result; an institution that posts NonCommercial pictures
// (NATO, NASA HQ) never passes that. [address, Flickr id, name]
const INSTITUTION_LIST = [
  ['president_of_ukraine', '165930373@N06', 'Office of the President of Ukraine'], // joined 2019, 9,237 photos
  ['european_parliament', '36612355@N08', 'European Parliament'], // 2009, 14,123
  ['number10gov', '49707497@N06', 'UK Prime Minister (No 10)'], // 2010, 30,259
  ['whitehouse', '202101414@N05', 'The White House'], // 2025, 14,293
  ['statephotos', '9364837@N06', 'U.S. Department of State'], // 2007, 50,511
  ['foreignoffice', '10246637@N04', 'UK Foreign, Commonwealth & Development Office'], // 2007, 14,018
  ['ukhomeoffice', '49956354@N04', 'UK Home Office'], // 2010, 2,381
  ['dfid', '14214150@N02', 'UK Department for International Development'], // 2007, 5,672
  ['agenciasenado', '49143546@N06', 'Senado Federal (Brazil)'], // 2010, 580,613
  ['palaciodoplanalto', '51178866@N04', 'Palácio do Planalto (Brazil)'], // 2010
  ['chathamhouse', '43398414@N04', 'Chatham House'], // 2009, 1,431
  ['eu2017ee', '145047505@N06', 'Estonian Presidency of the Council of the EU'], // 2016, 10,169
  ['governmentza', '90122870@N03', 'Government of South Africa (GCIS)'], // 2012, 62,755
];
export const INSTITUTIONS = new Map(INSTITUTION_LIST.flatMap(([alias, nsid, name]) => [[alias, name], [nsid, name]]));

// a re-upload of another agency's picture, or a credit to one (the laundering the coordinator warned of)
export const AGENCY_CREDIT = /\b(?:reuters|associated press|ap photo|\(ap\)|afp\b|agence france|getty|gettyimages|epa\b|epa-efe|efe\b|anadolu|xinhua|tass\b|sputnik|ria novosti|shutterstock|alamy|dpa\b|pa images|pa wire|press association|corbis|bloomberg|imago\b|sipa\b|zuma\b|abaca|all rights reserved|used with permission|courtesy of)\b/i;

/** Openverse's anonymous API, paced under its announced limits (20 a minute, `perDay` a day), with a kept day count. */
export class OpenverseClient {
  constructor({ fetchImpl = globalThis.fetch, agent = wikimediaAgent(), gapMs = 3200, perDay = 180, timeoutMs = 25_000, store = null, now = () => Date.now(), sleep = null, log = console } = {}) {
    this.fetch = fetchImpl;
    this.agent = agent;
    this.gapMs = gapMs;
    this.perDay = perDay;
    this.timeoutMs = timeoutMs;
    this.store = store; // a KeptAnswers: the day's count survives a restart
    this.now = now;
    this.sleep = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.log = log;
    this.queue = Promise.resolve();
    this.lastAt = 0;
    this.pausedUntil = 0;
    this.stats = { requests: 0, ok: 0, limited: 0, failed: 0, refusedBudget: 0 };
  }

  get paused() {
    return this.now() < this.pausedUntil;
  }

  dayKey() {
    return `ov:day:${new Date(this.now()).toISOString().slice(0, 10)}`;
  }

  used() {
    return Number(this.store?.get?.(this.dayKey()) || this.usedHere || 0);
  }

  count() {
    const n = this.used() + 1;
    this.usedHere = n;
    this.store?.set?.(this.dayKey(), n, 2 * DAY);
  }

  /** Search openly licensed photographs (commercial use and modification allowed). null: could not ask. */
  search(q, { pageSize = 20, extra = {} } = {}) {
    const run = async () => {
      if (this.paused) return null;
      if (this.used() >= this.perDay) {
        this.stats.refusedBudget++;
        return null;
      }
      const wait = this.lastAt + this.gapMs - this.now();
      if (wait > 0) await this.sleep(wait);
      this.lastAt = this.now();
      const u = new URL(OPENVERSE);
      u.searchParams.set('q', q);
      u.searchParams.set('license_type', 'commercial,modification');
      u.searchParams.set('mature', 'false');
      u.searchParams.set('page_size', String(pageSize));
      for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
      this.stats.requests++;
      this.count();
      let res;
      try {
        res = await this.fetch(u.toString(), { signal: AbortSignal.timeout?.(this.timeoutMs), headers: { 'user-agent': this.agent, accept: 'application/json' } });
      } catch (err) {
        this.stats.failed++;
        this.log.warn?.(`[pictures] openverse: ${err.message}`);
        return null;
      }
      if (res.status === 429) {
        this.stats.limited++;
        const ask = Number(res.headers?.get?.('retry-after')) * 1000;
        // the day's allowance spent: until tomorrow (UTC); a burst: what Retry-After asks, a minute at least
        const sustained = Number(res.headers?.get?.('x-ratelimit-available-anon_sustained')) === 0;
        const tomorrow = Math.ceil((this.now() + 1) / DAY) * DAY;
        this.pausedUntil = sustained ? tomorrow : this.now() + (Number.isFinite(ask) && ask > 0 ? Math.max(60_000, ask) : 60_000);
        return null;
      }
      if (!res.ok) {
        this.stats.failed++;
        return null;
      }
      const left = Number(res.headers?.get?.('x-ratelimit-available-anon_sustained'));
      if (Number.isFinite(left) && left <= 0) this.pausedUntil = Math.ceil((this.now() + 1) / DAY) * DAY;
      try {
        const data = await res.json();
        this.stats.ok++;
        return (data?.results || []).map(openverseResult).filter(Boolean);
      } catch {
        this.stats.failed++;
        return null;
      }
    };
    const job = this.queue.then(run, run);
    this.queue = job.catch(() => {});
    return job;
  }
}

/** One Openverse result as the desk reads it: its licence as Openverse indexes it, its Flickr account's id. */
export function openverseResult(r) {
  if (!r?.url || !/^https:\/\//.test(r.url)) return null;
  const v = r.license_version ? ` ${r.license_version}` : '';
  const code = String(r.license || '').toLowerCase();
  const name = code === 'cc0' ? 'CC0' : code === 'pdm' ? 'Public domain' : `CC ${code.toUpperCase()}${v}`;
  const account = /^https:\/\/www\.flickr\.com\/photos\/([^/?#]+)/.exec(String(r.creator_url || ''))?.[1] || null;
  return {
    id: r.id,
    title: String(r.title || '').slice(0, 300),
    url: r.url,
    page: r.foreign_landing_url || null,
    creator: r.creator || null,
    creatorUrl: r.creator_url || null,
    account,
    licenceName: name,
    licence: licenceOf(name, r.license_url || ''),
    source: r.source || r.provider || null,
    width: Number(r.width) || 0,
    height: Number(r.height) || 0,
    indexedOn: r.indexed_on ? Date.parse(r.indexed_on) || null : null,
    tags: (r.tags || []).map((t) => t?.name).filter(Boolean).slice(0, 40),
  };
}

/** The year a title gives ("12.10.2025", "2025-10-12", "October 2025", "... 2025"), or null. */
export function titleYear(title) {
  const t = String(title || '');
  const m = /\b\d{1,2}[./-]\d{1,2}[./-]((?:19|20)\d\d)\b/.exec(t) || /\b((?:19|20)\d\d)[./-]\d{1,2}[./-]\d{1,2}\b/.exec(t) || /(?<![\d.])((?:19|20)\d\d)(?![\d.])/.exec(t);
  return m ? Number(m[1]) : null;
}

/**
 * May this Openverse result air? { tier: 1 (an institution's own account) | 0, why, year }. Only Flickr, only the
 * institutions' accounts, only a licence the rights desk clears, no agency credit, indexed before the story and no year
 * after it.
 */
export function openverseTrust(result, { storyAt = Date.now() } = {}) {
  if (!result) return { tier: 0, why: 'no result' };
  if (result.source !== 'flickr') return { tier: 0, why: `source ${result.source || 'unknown'}` };
  const institution = INSTITUTIONS.get(result.account || '');
  if (!institution) return { tier: 0, why: 'not a verified institution\'s account (a long-standing account cannot be checked without Flickr\'s API)' };
  const terms = result.licence ? LICENCES[result.licence] : null;
  if (!terms || terms.why || !terms.commercial || !terms.derivative) return { tier: 0, why: `licence not cleared (${result.licenceName || 'none'})` };
  if (AGENCY_CREDIT.test(`${result.title} | ${(result.tags || []).join(' | ')}`)) return { tier: 0, why: "another agency's picture or credit" };
  if (!result.indexedOn || result.indexedOn > storyAt) return { tier: 0, why: 'not indexed before the story' };
  const year = titleYear(result.title);
  if (year && year > new Date(storyAt).getUTCFullYear()) return { tier: 0, why: 'its title gives a year after the story' };
  return { tier: 1, why: institution, year: year || null };
}
