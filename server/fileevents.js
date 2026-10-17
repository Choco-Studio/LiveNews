// FILE pictures the picture desk may air when the story's own subject has no picture (coordinator, round 7):
//
//   1. the same named actor doing the same kind of thing, labelled FILE and the year it was taken ("FILE 2023"): a
//      movement or a union protesting, a union on strike, a legislature sitting or voting, a bloc's summit. The file
//      must name the actor (its Wikidata labels in eight languages, its aliases, its Commons category) and the action
//      (in the languages the actor's photographers write in), and say when it was taken, before the story. Never under
//      a death or disaster toll, never a violent scene (no riot, no tear gas, no injured), never an armed group or a
//      police force as the actor; under a grave story, never a private person's face in the foreground (the face
//      reader's verdict, server/faces.js);
//   2. the seat of the government or the legislature of the country a story about government names first (the White
//      House, the Palace of Westminster, the Berlaymont), by its Wikidata picture: an institution, FILE. Never under a
//      story of violence, a death or a toll.
//
//   storyAction(flags)              -> { id, ... } | null   the kind of thing the headline says the actor does
//   actorKind(facts)                -> 'movement' | 'union' | 'party' | 'legislature' | 'bloc' | 'company' | 'org' | null
//   eventFileProblem(file, {...})   -> null | why            may this Commons file stand for the actor's action?
//   fileYear(file, storyAt)         -> { year, at } | null   when it was taken
//   seatFor(flags, place)           -> { country, title, kind } | null
import { severity } from './facts.js';
import { findPlaces, lookupPlace } from './gazetteer.js';

const DAY = 86_400_000;

export const fold = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
const words = (s) => fold(String(s || '').replace(/^File:/, '').replace(/\.[a-z0-9]{3,4}$/i, '').replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2').replace(/[_|,;:()[\]"'’-]+/g, ' ')).replace(/\s+/g, ' ');
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (w) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(fold(w))}(?![\\p{L}\\p{N}])`, 'u');

// ---------------------------------------------------------------------------------------------------- the actions

// a natural disaster or an outbreak in the headline: its toll is never illustrated by another day's picture
const DISASTER_TOLL = /\b(?:fires?|blaze|wildfires?|floods?|flooding|storms?|hurricanes?|typhoons?|cyclones?|tornado(?:es)?|earthquakes?|quakes?|tsunamis?|landslides?|mudslides?|eruptions?|explosions?|blasts?|collapses?|derail\w*|crash(?:es)?|outbreaks?|epidemics?|pandemics?|famine|ebola|cholera|measles|mpox|plague|bird flu|avian flu|dengue|malaria)\b/i;
// a scene the FILE picture must never show (another day's violence put under today's story misleads)
const VIOLENT_SCENE = /\b(?:riots?|rioters|rioting|clash\w*|tear ?gas|teargas|water cannons?|police (?:charge|violence|brutality|clash\w*)|charge of|injur\w*|wounded|blood\w*|burn\w*|arson|fires?|flames|looting|looters|molotov|barricades?|arrest\w*|detain\w*|kettl\w*|violence|violent|weapons?|guns?|rifles?|dead|death|killed|corpses?|bodies|funeral|victims?|memorial|mourn\w*|vigil|émeute\w*|emeute\w*|affrontements?|krawall\w*|ausschreitung\w*|disturbios|enfrentamientos?|scontri)\b/i;

// what the headline says the actor does, and the words a file uses for it (English, French, German, Spanish,
// Italian, Portuguese, Dutch, Polish: the languages Commons photographers caption protests and parliaments in)
export const ACTIONS = [
  {
    id: 'protest',
    story: /\b(?:protests?|protesters?|protesting|protested|demonstrat(?:e|es|ed|ing|ion|ions|ors)|rall(?:y|ies|ied|ying)|march(?:es|ed|ing)?|marchers|walk-?outs?|sit-?ins?|mobili[sz]\w*)\b/i,
    file: /\b(?:protests?|protesters?|protesting|demonstrations?|demonstrators?|rally|rallies|march|marches|marchers|manifestations?|manifestants?|manifestaci[oó]n\w*|manifestantes|manifestazion\w*|manifesta[cç](?:[aã]o|[oõ]es)|kundgebung\w*|demonstration\w*|demo|protesta\w*|protest\w*|marcha\w*|marche\w*|betoging\w*|demonstratie\w*|gilets jaunes|yellow vests?|picket\w*)\b/i,
    actors: ['movement', 'union', 'party', 'org'],
  },
  {
    id: 'strike',
    // (a strike by workers: never an air strike, a missile strike, "strikes a deal", "strikes back")
    story: /\b(?:(?:workers?|staff|nurses|doctors|medics|teachers|drivers|pilots|crews?|unions?|members|employees|dockers|miners|guards|controllers|cleaners|porters|lecturers|farmers|actors|writers)\b(?:\s+\S+){0,3}?\s+(?:to\s+)?(?:go\s+on\s+|stage\s+(?:a\s+)?|begin\s+(?:a\s+)?|walk\s+out\s+in\s+)?strikes?|strikes?\s+(?:over|for|against)\s+(?:pay|wages|jobs|pensions|conditions|cuts|hours)|(?:general|national|nationwide|rail|train|tube|bus|postal|port|airport|teachers'?|doctors'?|nurses'?|pay|union|24-hour|48-hour|one-day|indefinite|wildcat)\s+strikes?|on strike|striking workers|strikers|walkouts?|industrial action|picket\w*)\b/i,
    file: /\b(?:strikes?|strikers|striking|picket\w*|gr[eè]ves?|grevistes|grévistes|huelgas?|huelguistas|streik\w*|warnstreik\w*|scioper\w*|staking|strajk\w*)\b/i,
    actors: ['union', 'company', 'org'],
  },
  {
    id: 'session',
    story: /\b(?:votes?|voted|voting|debates?|debated|debating|session|sitting|plenary|passes|passed|approves?|approved|rejects?|rejected|adopts?|adopted|bill|motion|budget|hearing|inquiry|impeach\w*|no-confidence|confidence vote|sworn in)\b/i,
    file: /\b(?:plenary|plenar\w*|sessions?|sitting|debates?|votes?|voting|chamber|hemicycle|h[eé]micycle|assembly hall|plenarsaal|plenarsitzung|sitzung|s[eé]ance|sesi[oó]n|seduta|sess[aã]o|aula|zittingszaal|posiedzenie)\b/i,
    actors: ['legislature'],
  },
  {
    id: 'summit',
    story: /\bsummits?\b/i,
    file: /\b(?:summits?|sommet|gipfel\w*|cumbre|vertice|cimeira|cupula|szczyt)\b/i,
    actors: ['bloc'],
  },
];

/** The kind of thing the headline says its actor does (or null); never under a death or a disaster toll. */
export function storyAction(flags) {
  const title = String(flags?.title || '');
  if (!title || flags.deathOf || DISASTER_TOLL.test(title)) return null;
  if (severity(`${title} ${flags.summary || ''}`) >= 3) return null; // people harmed: a toll
  for (const a of ACTIONS) if (a.story.test(title)) return a;
  return null;
}

// ---------------------------------------------------------------------------------------------------- the actor

const ARMED = /\b(?:militant|terrorist|armed (?:group|organi[sz]ation|forces)|paramilitary|military|army|navy|air force|police|law enforcement|intelligence agency|secret service|gang|cartel|criminal|guerrilla|insurgent|rebel|militia|jihadist)\b/i;
const KINDS = [
  ['legislature', /\b(?:legislature|parliament|unicameral|bicameral|lower house|upper house|house of representatives|house of commons|house of lords|senate|national assembly|chamber of deputies|congress|duma|bundestag|knesset|diet|sejm|cortes|riksdag|storting|folketing)\b/i],
  ['bloc', /\b(?:intergovernmental organi[sz]ation|international organi[sz]ation|political union|economic union|supranational union|intergovernmental political forum|regional organi[sz]ation|military alliance|trade bloc|group of (?:seven|twenty|eight))\b/i],
  ['union', /\b(?:trade union|labor union|labour union|national trade union cent(?:er|re)|union federation|confederation of (?:labour|labor)|students'? union|teachers'? union|federation of trade unions)\b/i],
  ['movement', /\b(?:social movement|protest movement|political movement|civil rights movement|youth movement|student movement|mass movement|grassroots movement|protests?|demonstrations?|advocacy group|activist group|pressure group|campaign group)\b/i],
  ['party', /\bpolitical part(?:y|ies)\b/i],
  ['company', /\b(?:company|business|enterprise|corporation|conglomerate|manufacturer|airline|automaker|retailer|public company|subsidiary)\b/i],
  ['org', /\b(?:organi[sz]ation|non-governmental|nonprofit|non-profit|charity|association|federation|foundation)\b/i],
];

/** What kind of actor an item is (its Wikidata types), or null (a person, a place, an armed group, a police force). */
export function actorKind(facts) {
  const types = (facts?.types || []).join(' | ');
  if (!types || (facts?.types || []).includes('human') || ARMED.test(types)) return null;
  for (const [kind, re] of KINDS) if (re.test(types)) return kind;
  return null;
}

// ---------------------------------------------------------------------------------------------------- the file

const MONTHS = 'january|february|march|april|may|june|july|august|september|october|november|december|janvier|fevrier|février|mars|avril|mai|juin|juillet|aout|août|septembre|octobre|novembre|decembre|décembre|januar|februar|marz|märz|juni|juli|oktober|dezember|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre';
const MONTH_NO = (m) => {
  const i = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const alt = { fev: 1, fév: 1, avr: 3, mai: 4, jui: 5, aou: 7, aoû: 7, ene: 0, abr: 3, ago: 7, dic: 11, dez: 11, okt: 9, mär: 2, mrz: 2 };
  const k = fold(m).slice(0, 3);
  if (/^juil/.test(fold(m)) || /^juli/.test(fold(m)) || /^julio/.test(fold(m))) return 6;
  if (/^juin/.test(fold(m)) || /^juni/.test(fold(m)) || /^junio/.test(fold(m))) return 5;
  return i.includes(k) ? i.indexOf(k) : alt[k] ?? alt[String(m).toLowerCase().slice(0, 3)] ?? null;
};

/** When a Commons file was taken: its EXIF date, else a full date in its title, description or categories, else a year. */
export function fileYear(file, storyAt = Date.now()) {
  const storyYear = new Date(storyAt).getUTCFullYear();
  const ok = (y) => y >= 1990 && y <= storyYear;
  const taken = /\b((?:19|20)\d\d)[-:/.](\d\d)[-:/.](\d\d)/.exec(String(file?.taken || ''));
  if (taken && ok(Number(taken[1]))) return { year: Number(taken[1]), at: Date.UTC(Number(taken[1]), Number(taken[2]) - 1, Number(taken[3])), how: 'taken' };
  const text = `${String(file?.title || '').replace(/^File:/, '')} | ${file?.description || ''} | ${file?.categories || ''}`;
  const iso = /\b((?:19|20)\d\d)[-._](\d\d)[-._](\d\d)\b/.exec(text);
  if (iso && ok(Number(iso[1])) && Number(iso[2]) >= 1 && Number(iso[2]) <= 12) return { year: Number(iso[1]), at: Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])), how: 'date in the file' };
  const dmy = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th|er)?\\.?\\s+(${MONTHS})\\s+((?:19|20)\\d\\d)\\b`, 'i').exec(text);
  if (dmy && ok(Number(dmy[3])) && MONTH_NO(dmy[2]) !== null) return { year: Number(dmy[3]), at: Date.UTC(Number(dmy[3]), MONTH_NO(dmy[2]), Number(dmy[1])), how: 'date in the file' };
  const years = [...String(file?.title || '').matchAll(/(?<!\d)((?:19|20)\d\d)(?!\d)/g)].map((m) => Number(m[1])).filter(ok);
  if (years.length === 1) return { year: years[0], at: null, how: 'year in the title' };
  return null;
}

/**
 * May this Commons file stand for the actor doing this kind of thing, as a FILE picture of another day? null when it
 * may, else why not. `names`: the actor's names (labels, aliases, Commons category, as the story writes it).
 */
export function eventFileProblem(file, { names = [], action, storyAt = Date.now(), minYears = 10 } = {}) {
  if (!file || !action) return 'no file';
  const about = words(`${file.title} | ${file.description || ''} | ${file.objectName || ''} | ${file.categories || ''}`);
  const named = names.filter((n) => fold(n).replace(/[^a-z0-9]/g, '').length >= 3).some((n) => wordRe(words(n)).test(about));
  if (!named) return 'does not name the actor';
  if (!action.file.test(about)) return `does not show a ${action.id}`;
  if (VIOLENT_SCENE.test(about)) return 'a violent scene';
  const when = fileYear(file, storyAt);
  if (!when) return 'no date';
  const storyYear = new Date(storyAt).getUTCFullYear();
  if (when.year < storyYear - minYears) return `too old (${when.year})`;
  // another day's picture: taken before the story (a picture of this very day, if it is one, is not a FILE picture)
  if (when.at !== null ? when.at > storyAt - 2 * DAY : when.year >= storyYear) return when.at !== null && when.at > storyAt ? 'taken after the story' : 'possibly the story\'s own event';
  return null;
}

/** The Commons search for an actor's action: its name and the action's plain word. */
export function eventQuery(name, action) {
  const word = { protest: 'protest', strike: 'strike', session: 'plenary session', summit: 'summit' }[action.id];
  return `"${name}" ${word}`;
}

// ---------------------------------------------------------------------------------------------------- the seats

// the seat of each government and legislature, by its exact English Wikipedia title (its Wikidata picture is used;
// each title checked on 17 Oct 2026: a body's article, whose picture is a logo, or a missing one, is left out as null)
export const SEATS = {
  'United States': { government: 'White House', legislature: 'United States Capitol' },
  'United Kingdom': { government: '10 Downing Street', legislature: 'Palace of Westminster' },
  France: { government: 'Élysée Palace', legislature: 'Palais Bourbon' },
  Germany: { government: 'Federal Chancellery (Berlin)', legislature: 'Reichstag building' },
  Russia: { government: 'Moscow Kremlin', legislature: null },
  "People's Republic of China": { government: 'Zhongnanhai', legislature: 'Great Hall of the People' },
  China: { government: 'Zhongnanhai', legislature: 'Great Hall of the People' },
  Japan: { government: 'Prime Minister\'s Official Residence (Japan)', legislature: 'National Diet Building' },
  India: { government: 'Rashtrapati Bhavan', legislature: 'Parliament House (New Delhi)' },
  Australia: { government: 'Parliament House, Canberra', legislature: 'Parliament House, Canberra' },
  Canada: { government: 'Parliament Hill', legislature: 'Parliament Hill' },
  Brazil: { government: 'Palácio do Planalto', legislature: 'National Congress Palace' },
  Italy: { government: 'Palazzo Chigi', legislature: 'Palazzo Montecitorio' },
  Spain: { government: 'Palace of Moncloa', legislature: 'Palacio de las Cortes, Madrid' },
  Ukraine: { government: 'Presidential Office Building (Kyiv)', legislature: 'Verkhovna Rada building' },
  Turkey: { government: 'Presidential Complex (Turkey)', legislature: null },
  Mexico: { government: 'National Palace (Mexico)', legislature: 'Legislative Palace of San Lázaro' },
  Argentina: { government: 'Casa Rosada', legislature: 'Palace of the Argentine National Congress' },
  'South Africa': { government: 'Union Buildings', legislature: 'Houses of Parliament, Cape Town' },
  'South Korea': { government: null, legislature: 'National Assembly Building (South Korea)' },
  Poland: { government: 'Chancellery of the Prime Minister of Poland', legislature: null },
  Hungary: { government: 'Carmelite Monastery of Buda', legislature: 'Hungarian Parliament Building' },
  Netherlands: { government: 'Binnenhof', legislature: 'Binnenhof' },
  Ireland: { government: null, legislature: 'Leinster House' },
  'New Zealand': { government: 'Beehive (New Zealand)', legislature: 'Parliament House, Wellington' },
  Kenya: { government: 'State House, Nairobi', legislature: 'Parliament Buildings (Kenya)' },
  Sweden: { government: 'Rosenbad', legislature: 'Riksdag building' },
  Norway: { government: null, legislature: 'Storting building' },
  Denmark: { government: 'Christiansborg Palace', legislature: 'Christiansborg Palace' },
  Finland: { government: 'Government Palace (Finland)', legislature: null },
  Belgium: { government: null, legislature: 'Palace of the Nation' },
  Austria: { government: 'Federal Chancellery (Austria)', legislature: 'Austrian Parliament Building' },
  Switzerland: { government: 'Federal Palace of Switzerland', legislature: 'Federal Palace of Switzerland' },
  Greece: { government: 'Maximos Mansion', legislature: null },
  Colombia: { government: 'Casa de Nariño', legislature: 'Capitolio Nacional' },
  Chile: { government: 'La Moneda Palace', legislature: null },
  Peru: { government: 'Government Palace (Peru)', legislature: 'Legislative Palace (Peru)' },
  Philippines: { government: 'Malacañang Palace', legislature: 'Batasang Pambansa Complex' },
  Indonesia: { government: 'Merdeka Palace', legislature: null },
  'European Union': { government: 'Berlaymont building', legislature: 'Louise Weiss building' },
};
const LEGISLATIVE = /\b(?:parliament\w*|senate|senators?|congress\w*|lawmakers?|legislat\w*|mps|meps?|bill|bills|vote|votes|voted|midterms?|house of (?:representatives|commons|lords)|commons|lords|bundestag|duma|knesset|rada|sejm|diet|national assembly|impeach\w*|filibuster|speaker)\b/i;
// the word after a country that makes the state the headline's actor: its government, or a state's act
const GOV_WORD = /^(?:government|govt|senate|senators|congress|house|parliament|parliamentary|president|presidency|prime|pm|premier|chancellor|minister|ministers|ministry|lawmakers|legislators|mps|cabinet|officials|administration|treasury|foreign|defence|defense|interior|justice|health|finance|home|state|leader|leaders|accuses?|arrests?|bans?|seizes?|sanctions?|expels?|summons?|threatens?|warns?|condemns?|demands?|denies|rejects?|recognises?|recognizes?|signs?|approves?|orders?|deploys?|imposes?|lifts?|suspends?|recalls?|closes?|reopens?|restores?|joins?|quits?|leaves?|votes?|vows?|announces?|blocks?|detains?|charges?|deports?|hosts?|passes|adopts?|unveils?|plans?|moves?|pledges?|agrees?|backs?)$/i;
// the EU acting at the head of the headline (never its watchdogs or courts, whose seats are elsewhere)
const EU_ACTS = /^(?:the\s+)?(?:eu|european union|european commission|brussels)(?:\s+(?:leaders|ministers|lawmakers|countries|states|members|commission|parliament|chief|executive|officials|envoys))?\s+(?!watchdog|court|regulator|auditor|ombudsman|agency)\p{Ll}+/iu;

/**
 * The seat to show for a story about government: the country its headline (or its kicker) names in its first words,
 * or the EU, and the building its kind asks (the legislature for a vote, a bill, MPs; else the government). Never under
 * violence, a death or a toll.
 */
export function seatFor(flags) {
  const title = String(flags?.title || '');
  const eu = EU_ACTS.exec(title);
  if ((!flags?.statecraft && !eu) || flags.violent || flags.deathOf || flags.sport || DISASTER_TOLL.test(title)) return null;
  if (severity(`${title} ${flags.summary || ''}`) >= 3) return null;
  const kind = LEGISLATIVE.test(title) ? 'legislature' : 'government';
  // the headline after its kicker ("Australia politics live: ...", "'Dark day for Turkey': ..."), and the kicker
  const kick = /^[^:]{2,40}:\s+(?=\S)/.exec(title);
  const head = kick && !/\d:\d/.test(kick[0]) ? title.slice(kick[0].length) : title;
  const at = (text, index) => (text.slice(0, index).match(/\S+/g) || []).length;
  const countryOf = (h) => (h.entry.kind === 'country' ? h.entry.name : h.entry.country);
  const usable = (list) => list.filter((h) => h.entry && !h.entry.broad && (h.entry.kind === 'country' || h.entry.kind === 'city') && SEATS[countryOf(h)]).sort((a, b) => a.index - b.index);
  // (the EU acting at the head of the headline: "EU imposes sanctions...", "EU leaders push back...")
  if (eu) return { country: 'European Union', title: SEATS['European Union'][kind], kind };
  // the country the headline opens on (or its demonym: "Australian industry...", "Irish justice minister says"), or the
  // one its kicker names; never one met later ("Talks on Ukraine continue in Geneva")
  // and the state is the actor: the word after the country is its government ("US Senate votes", "Irish justice
  // minister says", "Kenya's health ministry") or its act ("France imposes"), or a politics kicker; never a person
  // or a thing of that country ("US marine veteran aims...", "Australian industry reliant on gas")
  const words = head.match(/\S+/g) || [];
  const acts = (i) => GOV_WORD.test(String(words[i] || '').replace(/[’']s$/, '').replace(/[^\p{L}-]/gu, ''));
  let country = null;
  const first = usable(findPlaces(head))[0];
  if (first && at(head, first.index) <= 1 && acts(at(head, first.index) + first.text.split(/\s+/).length)) country = countryOf(first);
  if (!country && kick && (/\bpolitics\b/i.test(kick[0]) || acts(0))) country = usable(findPlaces(kick[0])).map(countryOf)[0] || null;
  if (!country && acts(1)) country = Object.keys(SEATS).find((c) => lookupPlace(c)?.demonymRe?.test(words[0] || '')) || null;
  const seat = country ? SEATS[country] : null;
  const name = seat && (seat[kind] || seat.government || seat.legislature);
  return name ? { country, title: name, kind: seat[kind] ? kind : seat.government ? 'government' : 'legislature' } : null;
}
