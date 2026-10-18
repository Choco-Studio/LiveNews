// Election periods: who may not be re-staged, and what may not be published, near a vote (compliance.md §5.4).
//
// The rule (decided 17 Oct 2026 from the platforms' election policies, the EU's DSA election guidelines, Ofcom's
// Broadcasting Code section 6 and the national silence laws; reasons in compliance.md):
//   1. CANDIDATES. From 30 days before a national or regional vote or a referendum until the end of the day after
//      it, no politician of that country is re-staged (a candidate list is never complete: every politician of the
//      country counts as one). Named candidates of any vote in the calendar, local ones too (14 days), likewise.
//      Their words stay on air as the quote card: the feature waits, nothing is lost.
//   2. SILENCE. From the start of the country's legal silence (at least the day before) to the end of polling day,
//      nothing that is about that vote is published, and no politician of that country is re-staged.
//   3. A STALE CALENDAR FAILS CLOSED. A calendar older than 8 days (a snap election can be called) stops every
//      politician's recreation until it is read again.
// The calendar is Wikidata's (elections with a date, a country, a level and, where known, candidates), read by
// tools/compliance/elections.mjs into server/compliance/elections.json (committed) and by the server every day into
// data/compliance/elections.json (newer wins).
//
//   loadCalendar({ dataDir, now })                 -> { generatedAt, stale, elections: [...] }
//   electionHold({ speaker, story, identity, now, calendar })  -> { hold, reasons: [], elections: [] }
//   silenceHold({ text, countries, now, calendar }) -> { hold, until, elections }
//   countriesOf(text) / countriesOfSpeaker(speaker, identity)
//   fetchCalendar({ fetchImpl, now, days })        -> calendar (Wikidata SPARQL)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAZETTEER, findPlaces } from '../gazetteer.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CALENDAR_FILE = path.join(HERE, 'elections.json');
const DAY = 86400_000;

export const ELECTION_RULE = Object.freeze({
  windowDays: 30, // national, regional, referendum: every politician of the country
  localWindowDays: 14, // local votes and by-elections: their named candidates
  afterDays: 1, // to the end of the day after polling day (counts, results, other time zones)
  staleDays: 8,
  minSilenceDays: 1, // the day before polling day at least, everywhere (Ofcom 6.4 and most national laws)
});

// Legal pre-election silence, in days before polling day (polling day itself is always silent here). Source: the
// national laws as summarised by Wikipedia, "Election silence" (read 17 Oct 2026); the rest get the minimum.
export const SILENCE_DAYS = {
  Argentina: 2, Barbados: 2, Cambodia: 1, Cyprus: 2, 'Czech Republic': 3, Egypt: 2, Fiji: 2, France: 1, Greece: 2,
  Indonesia: 3, Montenegro: 2, Mozambique: 2, Nepal: 2, Paraguay: 2, Serbia: 2, Slovakia: 2, 'Sri Lanka': 2, Uruguay: 2,
};

// ------------------------------------------------------------------------------------------------ countries

const COUNTRY_ENTRIES = GAZETTEER.filter((e) => e.kind === 'country');
const ALIAS = new Map([
  ['united states of america', 'United States'], ['usa', 'United States'], ["people's republic of china", 'China'], ['kingdom of the netherlands', 'Netherlands'],
  ['russian federation', 'Russia'], ['republic of korea', 'South Korea'], ['state of palestine', 'Palestine'], ['czechia', 'Czech Republic'], ['türkiye', 'Turkey'],
]);
const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** A country's name as the gazetteer writes it ("United States of America" -> "United States"), or the input. */
export function countryName(name) {
  const f = fold(name);
  if (ALIAS.has(f)) return ALIAS.get(f);
  const e = COUNTRY_ENTRIES.find((c) => fold(c.name) === f || (c.aliases || []).some((a) => fold(a) === f));
  return e ? e.name : String(name || '').trim();
}

/** Every country a text names: its places' countries and its demonyms ("Brazilian President" -> Brazil). */
export function countriesOf(text) {
  const t = String(text ?? '');
  const out = new Set();
  if (!t.trim()) return out;
  for (const hit of findPlaces(t)) {
    const e = hit.entry;
    if (e.kind === 'country') out.add(e.name);
    else if (e.country) out.add(e.country);
  }
  for (const e of COUNTRY_ENTRIES) if (e.demonymRe && e.demonymRe.test(t)) out.add(e.name);
  return out;
}

/** The countries a speaker belongs to: their identity's citizenship (Wikidata), else their role and organisation. */
export function countriesOfSpeaker(speaker, identity = null) {
  const out = new Set();
  for (const c of identity?.countries || []) if (c?.name) out.add(countryName(c.name));
  for (const c of countriesOf(`${speaker?.role || ''} ${speaker?.org || ''}`)) out.add(c);
  return out;
}

// ------------------------------------------------------------------------------------------------ the calendar

/** Is this calendar too old to trust (a snap election may have been called since)? */
export function isStale(calendar, now = Date.now()) {
  const at = Date.parse(calendar?.generatedAt || '');
  return !Number.isFinite(at) || now - at > ELECTION_RULE.staleDays * DAY;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** The newest calendar: the server's daily copy (data/compliance/elections.json) or the committed one. */
export function loadCalendar({ dataDir = null, file = CALENDAR_FILE, now = Date.now() } = {}) {
  const candidates = [dataDir ? readJson(path.join(dataDir, 'compliance', 'elections.json')) : null, readJson(file)].filter((c) => c && Array.isArray(c.elections));
  candidates.sort((a, b) => (Date.parse(b.generatedAt || '') || 0) - (Date.parse(a.generatedAt || '') || 0));
  const cal = candidates[0] || { generatedAt: null, elections: [] };
  return { ...cal, stale: isStale(cal, now) };
}

const dayStart = (iso) => Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`);

/** The elections whose candidate window covers `now`: [{ election, phase: 'window'|'silence', from, to }] */
export function activeElections(calendar, now = Date.now()) {
  const out = [];
  for (const e of calendar?.elections || []) {
    const day = dayStart(e.date);
    if (!Number.isFinite(day)) continue;
    const local = e.level === 'local' || e.level === 'by-election';
    const from = day - (local ? ELECTION_RULE.localWindowDays : ELECTION_RULE.windowDays) * DAY;
    // (polling day's end in the furthest time zone, then the day after)
    const to = day + (1 + ELECTION_RULE.afterDays) * DAY + 12 * 3600_000;
    if (now < from || now > to) continue;
    const silenceDays = Math.max(ELECTION_RULE.minSilenceDays, SILENCE_DAYS[e.country] || 0);
    const silent = now >= day - silenceDays * DAY && now < day + DAY + 12 * 3600_000;
    out.push({ election: e, phase: silent ? 'silence' : 'window', from, to, local });
  }
  return out;
}

const nameKey = (s) => fold(s).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const ELECTION_WORDS = /\b(?:elections?|electoral|vote|votes|voting|voters?|ballots?|polls?|polling|campaign(?:s|ing)?|candidates?|referendum|primary|primaries|run-?off|midterms?|hustings|manifesto)\b/i;

/**
 * May this speaker be re-staged now? `speaker` = restage.js speakerProfile (name, role, org, kind); `story` the
 * story ({ title, summary, location }); `identity` the Wikidata identity ({ countries: [{ qid, name }] }).
 * -> { hold, reasons, elections }
 */
export function electionHold({ speaker, story = null, identity = null, now = Date.now(), calendar = null } = {}) {
  const reasons = [];
  const hit = [];
  if (!speaker) return { hold: false, reasons, elections: hit };
  const cal = calendar || loadCalendar({ now });
  const partisan = speaker.kind === 'politician' || /\b(?:party|campaign|candidate)\b/i.test(speaker.role || '');
  // a named candidate of any vote in the calendar (local ones too)
  const key = speaker.name ? nameKey(speaker.name) : '';
  const active = activeElections(cal, now);
  if (key) {
    for (const a of active) {
      if ((a.election.candidates || []).some((c) => nameKey(c) === key)) {
        reasons.push(`a candidate in ${a.election.name} (${a.election.date}): the quote card stays until the vote is over`);
        hit.push(a.election);
      }
    }
  }
  if (!partisan) return { hold: reasons.length > 0, reasons, elections: hit };
  if (cal.stale) {
    reasons.push('the election calendar is out of date: no politician is re-staged until it is read again');
    return { hold: true, reasons, elections: hit };
  }
  // every politician of a country with a national or regional vote or a referendum in its window
  let countries = countriesOfSpeaker(speaker, identity);
  // their citizenship on Wikidata (identity.js: P27), matched by the calendar's country item
  const qids = new Set(identity?.citizenship || speaker?.citizenship || []);
  // a politician whose country we cannot tell: the story's countries stand in (fail closed on the story's place)
  if (!countries.size && !qids.size) countries = new Set([...countriesOf(`${story?.title || ''}. ${story?.summary || ''}`), ...(story?.location?.place ? countriesOf(titleCase(story.location.place)) : [])]);
  for (const a of active) {
    if (a.local) continue;
    if (!countries.has(countryName(a.election.country)) && !(a.election.countryQid && qids.has(a.election.countryQid))) continue;
    const days = Math.max(0, Math.ceil((dayStart(a.election.date) - now) / DAY));
    reasons.push(`a politician of ${a.election.country} ${days ? `${days} days before` : 'during'} ${a.election.name} (${a.election.date}): the quote card stays until the vote is over`);
    hit.push(a.election);
  }
  return { hold: reasons.length > 0, reasons, elections: hit };
}

function titleCase(s) {
  return String(s || '').toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

/**
 * Is publishing `text` (a clip's words, its stories' titles) held by a silence period? A text about a vote
 * (election words) in a country now in its silence is held until polling day is over there.
 */
export function silenceHold({ text = '', countries = null, now = Date.now(), calendar = null } = {}) {
  const cal = calendar || loadCalendar({ now });
  const about = ELECTION_WORDS.test(String(text));
  const named = countries ? new Set([...countries].map(countryName)) : countriesOf(text);
  const held = [];
  let until = 0;
  for (const a of activeElections(cal, now)) {
    if (a.phase !== 'silence' || a.local) continue;
    if (!named.has(countryName(a.election.country))) continue;
    if (!about) continue;
    held.push(a.election);
    until = Math.max(until, dayStart(a.election.date) + DAY + 12 * 3600_000);
  }
  return { hold: held.length > 0, until: until ? new Date(until).toISOString() : null, elections: held };
}

// ------------------------------------------------------------------------------------------------ Wikidata

const SPARQL = 'https://query.wikidata.org/sparql';
const UA = 'GLOBIT24-compliance/1.0 (pixel news channel; election calendar for its recreation rule)';

const US_STATES = /\b(?:alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia (?:state|house|senate|gubernatorial)|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york state|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington state|west virginia|wisconsin|wyoming)\b/;

/** The level of a vote from its Wikidata label and types. */
export function levelOf(label, types = []) {
  const t = `${label} ${types.join(' ')}`.toLowerCase();
  if (/\breferendum|plebiscite\b/.test(t)) return 'referendum';
  if (/\bby-?election\b/.test(t)) return 'by-election';
  if (/\b(?:municipal|mayoral|mayor|local|county|city council|town council|borough|parish|district council|board of|school board|ward|commune|communal|council election|supervisors|navajo)\b/.test(t)) return 'local';
  if (/\b(?:gubernatorial|governor|state senate|state house|house of delegates|state assembly|state legislative|regional|provincial|province|state election|landtag|lieutenant governor|secretary of state|attorney general|comptroller|treasurer|senate election in|house of representatives elections? in|special election in|state elections|\d{4} [a-z .]+ elections$)\b/.test(t)) return 'regional';
  // a vote named after a place inside a country ("2026 Michigan House of Representatives election", "Ottawa municipal")
  // is that place's; a national one names the country or its people ("2026 Brazilian presidential election")
  const l = String(label).toLowerCase();
  if (US_STATES.test(l)) return 'regional';
  if (!/\b(?:general|presidential|parliamentary|federal|national|legislative|united states (?:senate|house|elections))\b/.test(l)) {
    const sub = findPlaces(String(label)).map((h) => h.entry).find((e) => e.kind === 'region' || e.kind === 'city');
    if (sub) return sub.kind === 'city' ? 'local' : 'regional';
  }
  return 'national';
}

/** Read the calendar from Wikidata: votes from `back` days ago to `days` ahead, deduplicated by country, day and level. */
export async function fetchCalendar({ fetchImpl = globalThis.fetch, now = Date.now(), days = 75, back = 3, timeoutMs = 60_000, wikimedia = null } = {}) {
  const from = new Date(now - back * DAY).toISOString().slice(0, 10);
  const to = new Date(now + days * DAY).toISOString().slice(0, 10);
  const query = `SELECT ?e ?eLabel ?date ?country ?countryLabel (GROUP_CONCAT(DISTINCT ?typeLabel; separator="|") AS ?types) (GROUP_CONCAT(DISTINCT ?candLabel; separator="|") AS ?cands) WHERE {
  ?e wdt:P31/wdt:P279* wd:Q40231; wdt:P585 ?date; wdt:P17 ?country.
  FILTER(?date >= "${from}T00:00:00Z"^^xsd:dateTime && ?date <= "${to}T00:00:00Z"^^xsd:dateTime)
  OPTIONAL { ?e wdt:P31 ?type. ?type rdfs:label ?typeLabel. FILTER(LANG(?typeLabel) = "en") }
  OPTIONAL { ?e wdt:P726 ?cand. ?cand rdfs:label ?candLabel. FILTER(LANG(?candLabel) = "en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} GROUP BY ?e ?eLabel ?date ?country ?countryLabel LIMIT 2000`;
  // through the station's one Wikimedia client (server/wikimedia.js): background work, the last priority, waiting out a
  // 429's pause in its queue rather than refused by it
  if (wikimedia) {
    const json = await wikimedia.json(`${SPARQL}?${new URLSearchParams({ query, format: 'json' })}`, { accept: 'application/sparql-results+json', timeoutMs, desk: 'elections', priority: 3, waits: true });
    return calendarFromRows(json?.results?.bindings || [], { now });
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let json;
  try {
    const res = await fetchImpl(`${SPARQL}?${new URLSearchParams({ query, format: 'json' })}`, { signal: ctl.signal, headers: { accept: 'application/sparql-results+json', 'user-agent': UA } });
    if (!res.ok) throw new Error(`wikidata HTTP ${res.status}`);
    json = await res.json();
  } finally {
    clearTimeout(timer);
  }
  return calendarFromRows(json?.results?.bindings || [], { now });
}

/** Rows of the SPARQL answer -> the calendar (exported for tests). */
export function calendarFromRows(rows, { now = Date.now() } = {}) {
  const v = (r, k) => r?.[k]?.value || '';
  const merged = new Map();
  for (const r of rows) {
    const name = v(r, 'eLabel');
    const date = v(r, 'date').slice(0, 10);
    const country = countryName(v(r, 'countryLabel'));
    if (!name || !date || !country || /^Q\d+$/.test(country)) continue;
    const level = levelOf(name, v(r, 'types').split('|').filter(Boolean));
    const qid = v(r, 'e').split('/').pop();
    const cands = v(r, 'cands').split('|').filter((c) => c && !/^Q\d+$/.test(c));
    // one entry per country, day and level (the US midterms are hundreds of items); local votes keep their own
    const key = level === 'local' || level === 'by-election' ? `${country}|${date}|${qid}` : `${country}|${date}|${level}`;
    const e = merged.get(key);
    if (e) {
      for (const c of cands) if (!e.candidates.includes(c)) e.candidates.push(c);
      e.items.push(qid);
      if (/general election|united states elections|presidential election|parliamentary election|legislative election/i.test(name) && !/general election|presidential|parliamentary|legislative/i.test(e.name)) e.name = name;
    } else {
      merged.set(key, { name: /^Q\d+$/.test(name) ? `${country} vote` : name, date, country, countryQid: v(r, 'country').split('/').pop() || null, level, candidates: cands, items: [qid] });
    }
  }
  const elections = [...merged.values()].sort((a, b) => a.date.localeCompare(b.date) || a.country.localeCompare(b.country));
  for (const e of elections) {
    // (hundreds of state races on one day are one entry, named for what it is)
    if (e.level === 'regional' && e.items.length > 1) e.name = `${e.date.slice(0, 4)} ${e.country} state and regional elections`;
    e.items = e.items.slice(0, 12);
  }
  return { generatedAt: new Date(now).toISOString(), source: 'Wikidata (query.wikidata.org), elections with a date (P585), a country (P17) and candidates (P726)', rule: ELECTION_RULE, elections };
}

/** Save a calendar where the server reads it (data/compliance/elections.json). */
export function saveCalendar(calendar, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(calendar, null, 1)}\n`);
  fs.renameSync(tmp, file);
}

/**
 * Keep the server's calendar fresh: read it at start (when older than a day) and every day after. Never throws;
 * a failed read keeps the old one (and an old one fails closed for politicians after ELECTION_RULE.staleDays).
 */
export function startElectionCalendar({ dataDir, fetchImpl = globalThis.fetch, log = console, everyMs = DAY, wikimedia = null } = {}) {
  if (!dataDir) return null;
  const file = path.join(dataDir, 'compliance', 'elections.json');
  const run = async () => {
    try {
      const have = readJson(file);
      if (have && Date.now() - (Date.parse(have.generatedAt || '') || 0) < everyMs * 0.9) return;
      const cal = await fetchCalendar({ fetchImpl, wikimedia });
      if (cal.elections.length) saveCalendar(cal, file);
      log.info?.(`[compliance] election calendar: ${cal.elections.length} votes in the next 75 days`);
    } catch (err) {
      log.warn?.(`[compliance] election calendar not refreshed: ${err.message}`);
    }
  };
  run();
  const timer = setInterval(run, everyMs);
  timer.unref?.();
  return { stop: () => clearInterval(timer), file };
}
