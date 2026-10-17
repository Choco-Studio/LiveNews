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
//   throwLine / askLine / followLine / thanksLine   the presenter's lines of a link, varied by a seed
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

// An answer about what comes next (the prompt then asks for it): a future said as one, outside quotation marks.
// (round 6: never a present that goes on nor a forecast already beaten: "Omar, what comes next?" was answered "UK GDP growth
// has been stronger than expected in early 2026…", "And Rhea, what happens next?" "El Nino-induced drought is affecting
// roughly half of the country as three-year long war continues.", 12-14 Oct; nor someone's plan as a noun, nor "until"
// a year gone)
export const AHEAD = /\b(?:will|won['’]t|(?:is|are|was|were) (?:expected|due|set|scheduled|likely|poised|planning|preparing) to|(?<!\bthan |\bas )expect(?:s|ing)?\b|(?:over|in|within|for) the (?:next|coming) (?:\w+ )?(?:hours|days|weeks|months|years)\b|(?<!(?:['’]s|\bthe|\ba|\bits|\btheir|\bhis|\bher|\bour|\bwhose)\s)plans? to|planned for|(?:is|are) due\b|due (?:to (?:be|start|begin|open|close|finish|launch|meet|vote|rule|decide|report|return)|on|in|next)\b|next (?:week|month|year|steps?)|later this (?:week|month|year)|in the coming (?:days|weeks|months)|until (?:next|the end of|at least)\b|from next\b)/i;
const unquoted = (t) => String(t || '').replace(/“[^”]*”|"[^"]*"/g, ' ');

// What a presenter's question asks for, and what an answer that gives it says (round 6: an exchange whose answer misses its
// question is asked again in words the answer fits, or dropped; never aired as a non-answer). The answer is judged
// outside quotation marks. A question none of these name ("what else do we know?") any fact of the story answers.
const DATED = /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December|next (?:week|month|year)|later this (?:week|month|year)|by (?:the end of )?\d{4}|in \d{4}|within \d+ (?:days|weeks|months))\b/;
const LATER = /\b(?:this year|next year|on sale|launch(?:es)? (?:in|next)|from next|by \d{4}|in the (?:spring|summer|autumn|winter)|deadline|appeal|next mission|(?:have|has) \d+ (?:days|weeks|months) to)\b/i;
const METHOD = /\b(?:measured|measurements?|observed|(?<!\bproviding (?:\w+ )?)observations? (?:from|of|show|by|with)|crystals? show|data (?:from|show)|samples?|simulations?|scans?|analy[sz](?:ed|ing|is)|studied|tracked|surveyed|tested|compared|modelling|modeling|sequenc(?:ed|ing)|using (?:a |the )?(?:telescope|satellite|probe|rover|scanner|microscope|spectrometer|radar|sensors?|data|images)|randomi[sz]ed|followed \d[\d,]* (?:people|adults|patients|participants))\b/i;
const MECHANISM = /\b(?:works (?:by|without|like)|by (?:using|\w{3,}ing)\b|relies on|powered by|runs on|(?:uses|using) (?:[\w’'-]+ ){1,4}to (?!be\b)\w+|designed to|lets (?:users|people|you)|allows? (?:users|people|you|it)|turns? (?:\w+ ){0,3}into)/i;
const PRICE = /[$£€]\s?\d|\b\d[\d,.]*\s*(?:dollars|euros|pounds)\b|\bpriced at\b|\bcosts?\b|\bprice\b|\bfree\b/i;
const CAUSE = /\b(?:because|after|following|due to|driven by|thanks to|as a result|amid|caused by|fuel(?:l)?ed by|on the back of|blamed|reflects?|since|as (?:\w+ ){1,4}(?:rose|fell|grew|slowed|surged|dropped|increased|declined))\b/i;
const ASKS = [
  { q: /\bwhat (?:happens|comes) (?:next|now)\b|\bwhat comes after that\b|\bwhat is the next step\b|\bwhat should we watch for\b|\bfrom here\b|\band next\b|\bwhen will we know more\b|\bwhat['’]?s next\b|\bthe timetable\b|\bwhen (?:does it reach|can anyone)\b/i, a: (t) => AHEAD.test(t) || DATED.test(t) || LATER.test(t) },
  { q: /\bhow do they know\b|\bhow was (?:this|it) measured\b|\bwhat is the evidence\b/i, a: (t) => METHOD.test(t) },
  { q: /\bhow does it (?:actually )?work\b|\bhow it works\b|\bthe clever part\b/i, a: (t) => MECHANISM.test(t) },
  { q: /\bwhat (?:does it|will all this) cost\b|\bthe price tag\b/i, a: (t) => PRICE.test(t) },
  // (a catch is a limit or a cost, never good news: "…is no longer stuck on a few aging PS4 hard drives", round 6)
  { q: /\bwhat is the catch\b|\balways a but\b|\bthe small print\b/i, a: (t) => /\b(?:however|although|but|not yet|only|limited|won['’]t|can['’]t|doesn['’]t|isn['’]t|aren['’]t|without|lacks?|requires?|costs?|price[ds]?|unless|except|yet to|fewer|less|restricted|still|never)\b/i.test(t) && !/\bno longer\b/i.test(t) },
  { q: /\bwhat is behind (?:it|this)\b/i, a: (t) => CAUSE.test(t) },
];
/** True when an answer does not give what its question asks for ("what comes next?" answered with what has been). */
export const missesQuestion = (question, answer) => {
  const t = unquoted(answer);
  return ASKS.some((x) => x.q.test(String(question || '')) && !x.a(t));
};

/**
 * The presenter's one prompt after the report, addressed by first name and fitted to what the answer says:
 * what comes next, else what more is known. The one question a programme without questions still asks
 * (a two-way is a conversation; WORLD NOW's rule is about headlines and tosses).
 */
export function askLine(c, seed, answer = '') {
  const list = AHEAD.test(unquoted(answer))
    ? [`${c.first}, what happens next?`, `${c.first}, what comes next?`]
    : [`${c.first}, what else do we know?`, `${c.first}, what more can you tell us?`];
  return choose(list, `${seed}~ask`);
}

/**
 * A long programme's second prompt, after the first answer: what comes next when the answer says so, else what more
 * is known; never the first prompt's words again (`first`).
 */
export function followLine(c, seed, answer = '', first = '') {
  const list = AHEAD.test(unquoted(answer))
    ? [`And ${c.first}, what happens next?`, `${c.first}, what comes next?`, `And what comes next, ${c.first}?`]
    : [`${c.first}, what else do we know?`, `And what more can you tell us, ${c.first}?`, `${c.first}, what else is in the detail?`];
  // (never the first prompt's question again in other order: "Vic, what more can you tell us?" then "And what more can you
  // tell us, Vic?", real news 13 Oct)
  const core = (q) => String(q).toLowerCase().replace(new RegExp(`\\b${c.first.toLowerCase()}\\b`, 'g'), ' ').replace(/\band\b/g, ' ').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  const fresh = list.filter((q) => core(q) !== core(first));
  return choose(fresh.length ? fresh : list, `${seed}~follow`);
}

/** The presenter's thanks, after the answer. */
export function thanksLine(c, desk, seed) {
  return choose([`${c.name}, thank you.`, `${c.first}, thank you.`, `${c.name} at our ${desk.spoken} desk, thank you.`, `Thank you, ${c.first}.`], `${seed}~thanks`);
}
