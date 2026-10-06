// The channel's correspondents (owner 4 Oct: "en las partes en directo ... poner un reportero hablando sobre
// ello"; OWNER_FEEDBACK 23:05: correspondents are a first-class feature, "live 'from our correspondent' links").
// A correspondent link takes one story of a programme that has them (config `correspondents`, `crosses`) to the
// channel's correspondent for the region where it happens: the presenter reads the story and hands over, the
// correspondent reports it (over pictures of the place), answers one prompt, and is thanked.
//
// The correspondents are the channel's own characters, like its presenters: they report what the sources say
// and never claim to be at the scene (no "here in", "behind me", "on the ground", no LIVE label: wave 3 §3.6).
// The pictures behind them are pictures of the place (FILE), never of the event.
//
//   DESKS                         the desks a correspondent can cover, with the strap label per sub-region
//   deskOf(location)              the desk and its strap label for a story's location, or null
//   rosterOf(program, presenters) the programme's correspondents: [{ id, name, first, desk }]
//   presenceClaim(text)           true when a line claims the speaker is at the scene (never aired)
//   throwLine / askLine / thanksLine   the presenter's lines of a link, varied by a seed
import { lookupPlace } from './gazetteer.js';

export const DESKS = {
  'europe-africa': { regions: { europe: 'EUROPE DESK', africa: 'AFRICA DESK' }, spoken: { europe: 'Europe', africa: 'Africa' } },
  americas: { regions: { americas: 'AMERICAS DESK' }, spoken: { americas: 'Americas' } },
  'asia-mideast': { regions: { asia: 'ASIA-PACIFIC DESK', mideast: 'MIDDLE EAST DESK' }, spoken: { asia: 'Asia-Pacific', mideast: 'Middle East' } },
};
const DESK_OF_REGION = { europe: 'europe-africa', africa: 'europe-africa', americas: 'americas', asia: 'asia-mideast', mideast: 'asia-mideast' };

// countries by region where coordinates alone would mislead (Turkey's centre sits in the Middle East box,
// Seville and Malta are south of Tunis)
const AFRICA = new Set(
  'algeria,angola,benin,botswana,burkina faso,burundi,cameroon,cape verde,central african republic,chad,comoros,congo,democratic republic of the congo,dr congo,djibouti,egypt,equatorial guinea,eritrea,eswatini,ethiopia,gabon,gambia,ghana,guinea,guinea-bissau,ivory coast,kenya,lesotho,liberia,libya,madagascar,malawi,mali,mauritania,mauritius,morocco,mozambique,namibia,niger,nigeria,rwanda,senegal,seychelles,sierra leone,somalia,south africa,south sudan,sudan,tanzania,togo,tunisia,uganda,zambia,zimbabwe'.split(',')
);
const MIDEAST = new Set(['israel', 'palestine', 'gaza', 'west bank', 'lebanon', 'syria', 'jordan', 'iraq', 'iran', 'saudi arabia', 'yemen', 'oman', 'united arab emirates', 'uae', 'qatar', 'bahrain', 'kuwait']);
const EUROPE = new Set(['turkey', 'cyprus', 'malta', 'spain', 'portugal', 'italy', 'greece', 'russia', 'georgia', 'armenia', 'azerbaijan', 'ukraine']);

const fold = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** The region of a country name, when the lists know it. */
function regionOfCountry(name) {
  const c = fold(name);
  if (!c) return null;
  if (MIDEAST.has(c)) return 'mideast';
  if (EUROPE.has(c)) return 'europe';
  if (AFRICA.has(c)) return 'africa';
  return null;
}

/** The region of a point, by coordinates (a rough world split; the country lists above come first). */
function regionOfPoint(lat, lon) {
  if (lon < -25) return 'americas';
  if (lat >= 12 && lat <= 42 && lon >= 34 && lon <= 63) return 'mideast';
  if (lon >= 60 || lon <= -150 || (lat < -10 && lon >= 100)) return 'asia';
  if (lat < 36 && lon < 52) return 'africa';
  if (lon >= 45 && lat >= 42) return 'asia';
  return 'europe';
}

/**
 * The desk for a story's location { place: 'MARSEILLE, FRANCE', lat, lon }: { desk, region, label, spoken }
 * (desk: a key of DESKS; label: the strap's "EUROPE DESK"; spoken: "Europe"), or null without coordinates.
 * The country named in the place (or the gazetteer's country of its first part) decides when it is known.
 */
export function deskOf(location) {
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lon)) return null;
  const parts = String(location.place || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  let region = null;
  for (const p of [parts.at(-1), parts[0]].filter(Boolean)) {
    region = regionOfCountry(p);
    if (region) break;
    const e = lookupPlace(p);
    region = regionOfCountry(e?.kind === 'country' ? e.name : e?.country);
    if (region || e?.country) break;
  }
  region ||= regionOfPoint(location.lat, location.lon);
  const desk = DESK_OF_REGION[region];
  return { desk, region, label: DESKS[desk].regions[region], spoken: DESKS[desk].spoken[region] };
}

const firstName = (name) => String(name || '').replace(/^(?:Dr|Mr|Ms|Mrs|Prof)\.?\s+/i, '').split(/\s+/)[0];

/** The programme's correspondents (config `correspondents`, presenters with a known `desk`). */
export function rosterOf(program, presenters) {
  const ids = Array.isArray(program?.correspondents) ? program.correspondents : [];
  return ids
    .map((id) => ({ id, p: presenters?.[id] }))
    .filter(({ p }) => p && DESKS[p.desk])
    .map(({ id, p }) => ({ id, name: p.name, first: firstName(p.name), desk: p.desk }));
}

// A line that puts its speaker at the scene, or claims reporting the channel did not do: never aired.
const PRESENCE = new RegExp(
  [
    String.raw`\b(?:here|right here|out here) (?:in|at|on|outside)\b`,
    String.raw`\bbehind me\b`,
    String.raw`\bon the ground\b`,
    String.raw`\bi(?:'m| am) (?:standing|here|now|at|in|outside|on)\b`,
    String.raw`\bwe(?:'re| are) (?:here|live|standing|outside)\b`,
    String.raw`\b(?:live|reporting) from\b`,
    String.raw`\bi (?:can )?(?:see|hear)\b`,
    String.raw`\bi(?:'ve| have)? (?:seen|spoken|spoke|talked|met|visited|witnessed)\b`,
    String.raw`\b(?:told me|told us|my sources|our sources|sources tell)\b`,
    String.raw`\bthis (?:morning|afternoon|evening) (?:here|i)\b`,
  ].join('|'),
  'i'
);
export const presenceClaim = (text) => PRESENCE.test(String(text || '').replace(/[’]/g, "'"));

function hash(s) {
  let h = 2166136261;
  for (const ch of String(s)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}
const choose = (list, key) => list[hash(key) % list.length];

/** The presenter's hand-over to the correspondent, the last sentence of the story they read. */
export function throwLine(c, desk, seed) {
  const sub = desk.spoken;
  return choose(
    [
      `Our ${sub} correspondent ${c.name} has more.`,
      `${c.name} is following it for us at our ${sub} desk.`,
      `Our ${sub} correspondent, ${c.name}, has been following it.`,
      `${c.name}, at our ${sub} desk, has the detail.`,
    ],
    `${seed}~throw`
  );
}

// An answer about what comes next (the prompt then asks for it).
export const AHEAD = /\b(?:will|expects?|expected|plans?|planned|is due|are due|due to|set to|until|next (?:week|month|year|steps?)|continues?|continue to)\b/i;

/**
 * The presenter's one prompt after the report, addressed by first name and fitted to what the answer says:
 * what comes next, else what more is known. The one question a programme without questions still asks
 * (a two-way is a conversation; WORLD NOW's rule is about headlines and tosses).
 */
export function askLine(c, seed, answer = '') {
  const list = AHEAD.test(answer)
    ? [`${c.first}, what happens next?`, `${c.first}, what comes next?`]
    : [`${c.first}, what else do we know?`, `${c.first}, what more can you tell us?`];
  return choose(list, `${seed}~ask`);
}

/** The presenter's thanks, after the answer. */
export function thanksLine(c, desk, seed) {
  return choose([`${c.name}, thank you.`, `${c.first}, thank you.`, `${c.name} at our ${desk.spoken} desk, thank you.`, `Thank you, ${c.first}.`], `${seed}~thanks`);
}
