// PAY ATTENTION's question desk, part one: what the quiz may use (docs/programmes/pay-attention.md §3). Only what the
// channel aired, from the archive (server/archive.js), never the raw feeds; an event (a story's airings grouped by the
// news desk's sameStory) is eligible only when every airing passes, so a launch that later failed or a story that later
// turned to a death is out whole. The words on screen are the channel's own: the aired headline verbatim, or the
// source's title when the aired one is a cut that broke; never a sentence the desk wrote.
//
//   quizEvents(archive, { now, days, same })   eligible events of the window: [{ key, ids, words, image, place, figure,
//                                               programmes, first, last, category, source, latest, ... }]
//   excludedKind(text)                         the excluded kind a text falls in ('crime', 'politics'…) or null
//   quizWords(entry)                           the headline the quiz may show, or null
import { isGrave, notForFeatures, sentencesIn } from '../facts.js';
import { findPlaces, lookupPlace, placeSupported } from '../gazetteer.js';

const DAY = 86400_000;

// What is never asked about and never shown as an option (§3.1). Word lists, so step 1's gate checks every question by
// hand; each kind is named for that check. Each list is matched on the title, summary and aired text of every airing.
export const EXCLUDED = [
  ['harm', /\b(?:kill\w*|dead|deaths?|die[sd]?|dying|funerals?|injur\w*|hurt|victims?|casualt\w*|missing|rescue[sd]?|rescuers?|evacuat\w*|displac\w*|bod(?:y|ies))\b/i],
  ['disaster', /\b(?:fires?|fired? (?:at|on|upon)|blaze|burn(?:s|ed|t|ing)? down|destroy\w*|flood\w*|storms?|quakes?|earthquakes?|hurricanes?|typhoons?|cyclones?|tornado\w*|wildfires?|tsunamis?|landslides?|avalanches?|droughts?|heatwaves?|crash\w*|collisions?|collid\w*|explo(?:sion|sions|de[sd]?)|blasts?|derail\w*|capsiz\w*|sinks|sank|sunk|wreck\w*|gas leaks?|oil spills?|spills?|contaminat\w*|pollut\w*)\b/i],
  ['crime', /\b(?:polic(?:e|ing)|officers? (?:said|arrested)|courts?|judges?|trials?|jail\w*|prison\w*|sentenc\w*|charged|charges|arrest\w*|murder\w*|crimes?|criminal\w*|fraud\w*|scam\w*|con(?:s|ned)? (?:homeowners|people|customers|victims)|falsif\w*|forg(?:ed|ery)|evade tax|evasion|dodge tax|launder\w*|bribe\w*|corrupt\w*|scandal\w*|lawsuits?|su(?:e|es|ed|ing)\b|legal action|abuse\w*|assault\w*|raid\w*|detain\w*|detention|investigators?|under investigation|investigat(?:es|ed|ing)? (?:the |a |an )?(?:death|crash|attack|fraud|claims?|allegations?|case|complaints?)|police investigation|criminal investigation|justice department|department of justice|fbi|prosecut\w*|probes? into|exploit(?:ed|ation)|smuggl\w*|thefts?|stolen|steal\w*|robber\w*|hack(?:ed|ers?)|ransomware|cyber-?attacks?)\b/i],
  ['conflict', /\b(?:wars?|warfare|army|armies|armed|military|militar\w*|troops|soldiers?|missiles?|drones? (?:strikes?|attacks?)|(?:air)?strikes? (?:on|against)|attack\w*|terror\w*|bomb\w*|shoot\w*|shots? fired|guns?|gunm[ae]n|weapons?|ceasefire|fightback|offensive|rebels?|militias?|insurgen\w*|houthis?|hamas|hezbollah|taliban|nato|invasion|invad\w*|occupation|hostages?|sanction\w*|defen[cs]e (?:minister|ministry|forces)|frontline|front line|ukraine|russia|gaza|israel\w*|palestin\w*|(?:armed|security|special|government|rebel|federal|allied|enemy|ground|naval|paramilitary|regional) forces|forces (?:enter\w*|captur\w*|seiz\w*|advanc\w*|took|take|withdr\w*|clash\w*|launch\w*|fire[sd]?)|strategic (?:town|city|port|hill)|militants?|jihad\w*|al-shabaab|isis|islamic state|coups?|junta|tigray|darfur|sudan\w*|yemen\w*|syria\w*|somalia\w*|sahel|kashmir|iran\w*|north korea\w*|taiwan strait|south china sea|hormuz|crosshairs)\b/i],
  ['children', /\b(?:child|children|childhood|kids?|boys?|girls?|teen\w*|minors?|pupils?|schools?|schoolchildren|bab(?:y|ies)|toddlers?|infants?|nurser(?:y|ies)|adolescen\w*)\b/i],
  ['politics', /\b(?:elections?|elect(?:ed|s)?\b|vot(?:e|es|ed|ers?|ing)|ballot\w*|polls?\b|campaign\w*|part(?:y|ies)|ministers?|ministr(?:y|ies)|president\w*|prime minister|premier|chancellor|governments?|governor\w*|parliament\w*|senat\w*|congress\w*|mps?\b|meps?\b|lawmakers?|legislat\w*|politic\w*|mayors?|councils?|councillors?|labour|tor(?:y|ies)|conservatives?|liberal democrats?|democrats?|republicans?|reform uk|snp|white house|downing street|kremlin|eu\b|european union|european commission|brussels|un\b|united nations|g7|g20|summit|diplomat\w*|ambassador\w*|embass(?:y|ies)|treat(?:y|ies)|tariffs?|trade (?:war|deal|dispute)|post-brexit|brexit|regulat(?:or|ors|ion|ions)|watchdog|ban(?:s|ned|ning)?\b|policy|policies|protest\w*|demonstrat\w*|strikes? (?:by|over|action)|on strike|refugees?|migrants?|migration|asylum|deport\w*|immigra\w*|borders?|royal family|the royals|king charles|queen camilla|prince (?:william|harry|andrew)|princess|monarch\w*|pope|vatican|iea|opec|imf|world bank|central banks?|interest rates?|federal reserve|bank of england|ecb|think tank)\b/i, /\b(?:UK|British|the|new|former) PM\b|\bPM (?:says|said|to|vows|warns|has)\b/],
  ['health', /\b(?:cancer\w*|tumou?rs?|diseases?|diagnos\w*|hospital\w*|patients?|surger(?:y|ies)|operation on|illness\w*|ill\b|sick\w*|virus\w*|outbreaks?|pandemic|epidemic|dementia|alzheimer\w*|stroke\b|heart attack|overdos\w*|suicid\w*|mental health|nhs|medicines? (?:grow )?scarce|nodule)\b/i],
  ['money of people', /\b(?:salar(?:y|ies)|wages?|pay ?(?:rise|cut|deal)|earn(?:s|ed|ing)?\s+(?:up to\s+|over\s+|more than\s+|about\s+|around\s+)?[£$€]|i earn|income|pensions?|fined|fines?\b|damages|compensation|payouts?|net worth|fortune|wealth\w*|billionaires?|millionaires?|inheritance|tax(?:es)? (?:bill|affairs))\b/i],
  ['betting', /\b(?:bet(?:s|ting)?|bookmakers?|bookies|odds|tips?\b|tipster\w*|predictions?|predicted line-?ups?|gambl\w*|casino\w*|lotter(?:y|ies)|jackpot)\b/i],
  ['hardship', /\b(?:struggl\w*|shortages?|scarce|scarcity|crisis|cris[ie]s|recession|layoffs?|laid off|job (?:cuts|losses)|redundanc\w*|bankrupt\w*|insolven\w*|administration\b|(?:close[sd]?|closing|shut(?:s|ting)?)\s+(?:its\s+|the\s+|a\s+)?(?:[\w'’-]+\s+){0,3}(?:plant|factory|store|stores|shop|shops|branch|branches|site|mine|offices?|restaurants?|pubs?)|closures?|poverty|homeless\w*|hunger|famine|debt\w*|evict\w*|cost of living|inflation|price rises?)\b/i],
  ['promotion', /\b(?:\d+ (?:hours|days) (?:to|until|left)|job opportunit\w*|vacanc(?:y|ies)|we(?:'re| are) hiring|apply now|careers? at|your final chance|tickets?|ticket savings|discount\w*|promo codes?|deals? of the day|on sale|buy now|sponsored|giveaway)\b/i],
  ['failure of a person', /\b(?:flop(?:s|ped|ping)?|box[- ]office (?:bomb|disaster)|weak start|panned|slammed|mock\w*|ridicul\w*|gaffes?|embarrass\w*|humiliat\w*|backlash|outrage|rows? (?:over|with|between)|feud|criticis\w*|criticiz\w*|apologi[sz]\w*|resign\w*|sacked|fired\b|ousted|quits?\b|wavered|controvers\w*|accus\w*|allegation\w*|alleged\w*|denies|denied)\b/i],
];

// Reviews and first-person pieces: a verdict is not a fact to quiz on ("Mechanism's first Switch 2 case is as awesome
// as I hoped it would be", "OnePlus 16 is firm's most interesting phone", The Verge 12 Oct)
const FIRST_PERSON = /(?:^|[\s‘'"“])(?:I|I'm|I’m|I've|I’ve|My|my|We|we|We've|we've|Our|our)\s/;
const OPINION = /\b(?:as I hoped|hands-on|review(?:ed)?|first look|verdict|best and worst|most interesting|awesome|we tried|tested:|why (?:you|we|i)\b|in praise of|the case for|is the best|is the worst)\b/i;

// Kinds matched on the story's subject only (its headline, title and opening sentences): a passing "the government
// says" in a tunnel story's third sentence does not make it politics. Harm, disasters, crime, conflict and betting
// count anywhere in the story.
const SUBJECT_ONLY = new Set(['children', 'politics', 'health', 'money of people', 'hardship', 'promotion', 'failure of a person']);

// Senses that look excluded and are not: deep time and history ("Roman troops", "a 2,000-year-old burial"), cells
// and microbes ("an injection that destroys fat cells"), sky and space ("asteroid collisions"), sport's own words.
const LOOKALIKES = [
  /[^.!?]*\b(?:\d[\d,.]*\s+(?:million|billion)\s+years|(?:million|billion) years ago|prehistoric|dinosaurs?|fossil\w*|ice age|roman|romans|ancient|medieval|viking\w*|iron age|bronze age|stone age|neolithic|pharaoh\w*|emperors?|\d+(?:st|nd|rd|th)[- ]century|centuries[- ]old|[\d,]+[- ]year[- ]old (?:temple|tomb|burial|skeleton|fort|ship|wreck|city|settlement|coins?|remains|mummy|mummies|statue|site))\b[^.!?]*[.!?]?/gi,
  /\b(?:destroy\w*|kill\w*|attack\w*|target\w*)\s+(?:\w+\s+){0,2}(?:cells?|tumou?rs?|bacteria|viruses?|microbes|germs|pathogens|weeds|pests|parasites)\b|\bself-destruct\w*|\b(?:dead|dying)\s+(?:cells?|stars?|galax\w*)\b/gi,
  /\b(?:asteroids?|meteor\w*|comets?|galax\w*|stars?|planets?|particles?|protons?|black holes?|neutron stars?)\s+(?:collisions?|collid\w*|impacts?|crash\w*|explo\w*)\b|\b(?:collisions?|impacts?)\s+(?:of|between|with)\s+(?:\w+\s+)?(?:asteroids?|galax\w*|stars?|planets?|particles?|black holes?)\b|\bstar(?:s)? (?:die|dies|died|explode\w*)\b/gi,
  /\b(?:bets?|betting) (?:big |heavily |everything )?on\b/gi,
  /\bearn(?:s|ed|ing)?\s+(?:a|an|the|their|his|her)\s+(?:draw|point|win|victory|place|spot|call-up|start|recall|replay)\b|\bshootout\b|\bshot[- ]stopp\w*|\boffensive (?:line|coordinator|rebound\w*)\b/gi,
];
const withoutLookalikes = (text) => LOOKALIKES.reduce((t, re) => t.replace(re, ' '), String(text ?? ''));

/**
 * The excluded kind a story falls in, or null: `text` is the whole story, `subject` its headline, title and opening
 * sentences (the kinds in SUBJECT_ONLY look only there; with no subject given, the whole text is the subject).
 */
export function excludedKind(text, subject = text) {
  const t = withoutLookalikes(text);
  const s = withoutLookalikes(subject);
  for (const [kind, ...res] of EXCLUDED) if (res.some((re) => re.test(SUBJECT_ONLY.has(kind) ? s : t))) return kind;
  return null;
}

// A cut that stops where the source's title goes on with a phrase that can drop: a comma, a dash, a colon, or a phrase
// opener. "Carmaker to close Turin plant[, putting 2,400 jobs at risk]" is whole; "Chinese carmakers increasingly
// rely[ on overseas markets…]" is not (12 Oct).
const CLEAN_REST = /^(?:\s*,\s+(?:[a-z]+(?:ing|ed)\b|says?\b|said\b|according\b|as\b|after\b|with\b|while\b|but\b|amid\b|ahead\b|despite\b|reports?\b|study\b|records\b|\p{Lu}[\p{L}]*\s+(?:says?|finds?|reports?|suggests?)\b)|\s*[;:–—|]|\s+[-–—]\s|\s+(?:after|ahead of|amid|at|during|following|for the first time|in (?:the|a|an|its|their|his|her)\b|over|this (?:week|year|month|weekend)|next (?:week|year|month)|as (?:\w+ )?(?:grow|grows|surge|surges|rise|rises|fall|falls|continue|continues)\b|despite|with (?:a|an|the)\b|according to|(?:BBC|study|report|records|data) (?:finds|suggests?|shows?)))/iu;
// A last word no headline ends on: an article, a preposition, a comparison or a figure left open
const OPEN_END = /\b(?:a|an|the|to|of|in|on|at|for|with|by|from|as|than|and|or|but|is|are|was|were|be|its|their|his|her|up to|more|less|most|rely|style|\$\d[\d,.]*)$/i;
export const MAX_WORDS_CHARS = 72;

// A headline says what happened: it has a verb. Picture captions and notices do not ("Transporter-18 SmallSats
// Encapsulation", "Comparing Off-World Rover Driving Distances": NASA's feed, 13 Oct). A word-list judgement: the
// step-1 gate checks every question by hand.
const BARE_VERBS = new Set('is are was were be been has have had will would can could may might must shall should do does did let lets set sets get gets got make makes made take takes took find finds found map maps spot spots reach reaches open opens launch launches win wins won beat beats plan plans unveil unveils build builds test tests show shows reveal reveals return returns start starts begin begins end ends hit hits cut cuts raise raises rise rises fall falls grow grows drop drops land lands join joins leave leaves meet meets say says tell tells warn warns ask asks offer offers buy buys sell sells move moves turn turns bring brings break breaks keep keeps hold holds give gives go goes come comes run runs play plays need needs want wants help helps look looks lights light record records release releases restore restores celebrate celebrates discover discovers capture captures solve solves'.split(' '));
const FUNCTION_WORDS = new Set(['a', 'an', 'the', 'to', 'of', 'in', 'on', 'at', 'for', 'and', 'or', 'by', 'with', 'from', 'as', 'its', 'vs', 'v']);
export function labelLike(words) {
  const tokens = String(words ?? '').replace(/[“”"‘(),.:;!?–—]/g, ' ').replace(/’/g, "'").split(/\s+/).filter(Boolean);
  if (tokens.length < 3) return true;
  if (/^\p{Lu}\p{Ll}+ing$/u.test(tokens[0]) && /^\p{Lu}/u.test(tokens[1] || '')) return true; // "Comparing Off-World…"
  const content = tokens.filter((t) => /\p{L}/u.test(t) && !FUNCTION_WORDS.has(t.toLowerCase()));
  const titleCase = content.every((t) => /^\p{Lu}/u.test(t));
  const verbish = (t, i) => {
    const w = t.toLowerCase();
    if (/^(?:there|it|that|what|who|here|he|she)'s$/.test(w) || BARE_VERBS.has(w)) return true;
    if (i === 0) return false; // a first word ending in -s is a subject ("Scientists map…")
    if (/\p{Lu}/u.test(t.slice(1))) return false; // a name ("SmallSats", "NASA")
    if (!titleCase && /^\p{Lu}/u.test(t)) return false; // a name in a sentence-case headline
    return /(?:ed|en)$/.test(w) || (/s$/.test(w) && !/(?:ss|us|is)$/.test(w) && w.length > 3) || /ing$/.test(w);
  };
  return !tokens.some(verbish);
}

/** The headline the quiz may show for an archive entry: the aired one when whole, else the source's title (≤ 72), else null. */
export function quizWords(e) {
  const aired = String(e?.headline || '').replace(/\s+/g, ' ').trim();
  const title = String(e?.title || '').replace(/\s+/g, ' ').replace(/^(?:BREAKING|LIVE|WATCH|VIDEO|EXCLUSIVE)\s*[:|-]\s*/i, '').trim();
  const titleOk = title && title.length <= MAX_WORDS_CHARS && !OPEN_END.test(title.replace(/[.!?]+$/, ''));
  if (!aired) return titleOk ? title : null;
  const cut = title.length > aired.length && title.toLowerCase().startsWith(aired.toLowerCase());
  if (cut && !CLEAN_REST.test(title.slice(aired.length))) return titleOk ? title : null;
  if (OPEN_END.test(aired.replace(/[.!?]+$/, ''))) return titleOk ? title : null;
  return aired.length <= MAX_WORDS_CHARS ? aired : titleOk ? title : null;
}

// The world in regions, for WHERE IN THE WORLD?'s rule of three options in three regions (coarse on purpose: a pin's
// continent, by its coordinates)
export function regionOf({ lat, lon } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lon < -25) return lat >= 15 ? 'north-america' : 'latin-america';
  if (lon >= 110 && lat < -10) return 'oceania';
  if (lon >= 34 && lon < 63 && lat >= 12 && lat < 42) return 'middle-east';
  if (lat >= 36 && lon < 45) return 'europe';
  if (lon < 52 && lat < 36) return 'africa';
  return 'asia';
}

/** The country entry (gazetteer) of an archived location ("TEXAS, USA" → United States), or null. */
export function countryOf(location) {
  if (!location?.place) return null;
  const parts = String(location.place).split(',').map((p) => p.trim()).filter(Boolean);
  for (const p of [parts.join(', '), ...parts.slice().reverse()]) {
    const e = lookupPlace(p);
    if (!e || e.broad) continue;
    const c = e.kind === 'country' ? e : lookupPlace(e.country || '');
    if (c && c.kind === 'country') return c;
  }
  return null;
}

// Where the story happens, not where a company comes from: a text names the place (or a place in its country) after a
// locative preposition ("In Iceland, a fissure eruption…"), as its owner ("Egypt's Fayoum mummy portraits…") or as a
// dateline ("Norway: …"). "Indian brand CMF…" is no "where" (12 Oct).
const LOCATIVE = /\b(?:in|at|near|off|across|outside|around|over|throughout|inside|on the coast of|the coast of|to western|to eastern|to northern|to southern)\s+(?:the\s+)?$/i;
const insideOf = (e, country, placeEntry) => e === country || e === placeEntry || e.country === country.name;
function happensIn(texts, country, place) {
  const placeEntry = lookupPlace(String(place).split(',')[0]);
  for (const t of texts) {
    const s = String(t ?? '');
    for (const h of findPlaces(s)) {
      if (!insideOf(h.entry, country, placeEntry)) continue;
      if (LOCATIVE.test(s.slice(Math.max(0, h.index - 24), h.index))) return true;
      const after = s.slice(h.index + h.text.length, h.index + h.text.length + 3);
      if (/^['’]s\b/.test(after) || (h.index === 0 && /^\s*:/.test(after))) return true;
    }
  }
  return false;
}

export const MASK = '▮▮▮▮▮';
/**
 * The words with the place masked: every name of the place, of a place inside its country and of its people
 * ("Egypt's Fayoum mummy portraits…" → "▮▮▮▮▮'s Fayoum mummy portraits…"); one mask's length for every name, so its
 * length tells nothing. Null when fewer than three words are left to read.
 */
export function maskPlace(words, country, place) {
  const placeEntry = lookupPlace(String(place).split(',')[0]);
  const spans = findPlaces(words).filter((h) => insideOf(h.entry, country, placeEntry)).map((h) => [h.index, h.index + h.text.length]);
  if (country.demonymRe) for (const m of words.matchAll(new RegExp(country.demonymRe.source, 'gu'))) spans.push([m.index, m.index + m[0].length]);
  if (!spans.length) return words;
  spans.sort((a, b) => b[0] - a[0]);
  let out = words;
  let reach = Infinity;
  for (const [a, b] of spans) {
    if (b > reach) continue;
    out = out.slice(0, a) + MASK + out.slice(b);
    reach = a;
  }
  const readable = out.split(/\s+/).filter((w) => !w.includes('▮') && /\p{L}{2,}/u.test(w));
  return readable.length >= 3 ? out : null;
}

/**
 * A usable place (§4.1): the story's place, named in its aired words where the story happens. The words shown never
 * name it, its country or its people: a headline that does gets them masked (`masked`). Returns { country, label, lat,
 * lon, region, masked } or null.
 */
export function usablePlace(e, words) {
  const loc = e?.location;
  if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) return null;
  const country = countryOf(loc);
  if (!country) return null;
  const text = `${e.text || ''} ${e.summary || ''}`;
  const named = (x) => placeSupported(loc.place, x) || placeSupported(country.label, x);
  if (!named(text) && !named(words)) return null;
  if (!happensIn([words, e.title, text], country, loc.place)) return null;
  const masked = named(words) ? maskPlace(words, country, loc.place) : words;
  if (!masked || named(masked.replaceAll(MASK, ' '))) return null; // a name the mask could not find stays a give-away
  return { country: country.name, label: country.label, lat: country.lat, lon: country.lon, region: regionOf(country), masked: masked === words ? null : masked };
}

// WHERE's wrong pins: the week's eligible story places first, then these well-known countries, seven regions of them
// (the week's places alone were six countries on 13 Oct, too few for three questions in three regions each). Never a
// country named in a story the week left out: no playful pin on a country in the news for a war or a disaster.
export const NEUTRAL_COUNTRIES = Object.freeze([
  'France', 'Italy', 'Spain', 'Portugal', 'Norway', 'Sweden', 'Finland', 'Iceland', 'Ireland', 'Netherlands', 'Greece', 'Switzerland',
  'Japan', 'South Korea', 'Vietnam', 'Thailand', 'Indonesia', 'Philippines', 'Malaysia', 'Nepal', 'Mongolia', 'India',
  'Australia', 'New Zealand', 'Fiji', 'Canada', 'United States', 'Mexico', 'Cuba', 'Jamaica',
  'Brazil', 'Argentina', 'Chile', 'Peru', 'Colombia', 'Ecuador',
  'Kenya', 'Morocco', 'Egypt', 'South Africa', 'Ghana', 'Tanzania', 'Senegal', 'Namibia', 'Madagascar',
  'Jordan', 'Oman', 'United Arab Emirates', 'Qatar',
]);
const pinOf = (c) => ({ country: c.name, label: c.label, lat: c.lat, lon: c.lon, region: regionOf(c) });
/** The neutral countries as pins, without the ones in `avoid` (country names). */
export function neutralPlaces(avoid = new Set()) {
  return NEUTRAL_COUNTRIES.map((n) => lookupPlace(n)).filter((c) => c && c.kind === 'country' && !avoid.has(c.name)).map(pinOf);
}
/** The countries a text names (a city or region counts for its country). */
export function countriesIn(text) {
  const out = new Set();
  for (const h of findPlaces(String(text ?? ''))) {
    const c = h.entry.kind === 'country' ? h.entry : lookupPlace(h.entry.country || '');
    if (c && c.kind === 'country') out.add(c.name);
  }
  return out;
}

/** The country an event happened in, for an option pin (any eligible event's place; no give-away rule for options). */
export function optionPlace(e) {
  const loc = e?.location;
  if (!loc || !Number.isFinite(loc.lat)) return null;
  const country = countryOf(loc);
  return country ? { country: country.name, label: country.label, lat: country.lat, lon: country.lon, region: regionOf(country) } : null;
}

const QUALIFIER = /\b(?:about|around|nearly|almost|roughly|some|up to|more than|over|at least|less than|fewer than|under|approximately|an estimated|estimated|close to)\s*$/i;
const STOP = new Set(['not', 'the', 'and', 'for', 'with', 'more', 'less', 'than', 'from', 'that', 'this', 'per', 'cent', 'percent', 'a', 'an', 'of', 'to', 'in', 'on']);
const norm = (s) => String(s ?? '').toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ');
export const MAX_SENTENCE_CHARS = 150;

/**
 * A usable figure (§4.1): a figure the story aired, found verbatim in a sentence of its aired text whose words also hold
 * its label; not a model name ("Maia 300"), not a year. Returns { value, label, qualifier, exact, sentence, masked } or
 * null. `masked` hides the value and keeps the qualifier ("…can pay up to ▮▮▮ more").
 */
export function usableFigure(e) {
  const nums = Array.isArray(e?.numbers) ? e.numbers : [];
  const sentences = sentencesIn(String(e?.text || ''));
  for (const n of nums) {
    const value = String(n?.value || '').trim();
    if (!/\d/.test(value) || /^(?:19|20)\d\d$/.test(value)) continue;
    const labelWords = norm(n.label).split(/[^a-z]+/).filter((w) => w.length >= 3 && !STOP.has(w));
    if (!labelWords.length) continue;
    const v = norm(value).replace(/bn$/, 'bn').replace(/m$/, 'm');
    for (const s of sentences) {
      if (s.length > MAX_SENTENCE_CHARS) continue;
      const i = norm(s).indexOf(v);
      if (i < 0) continue;
      const before = s.slice(0, i);
      if (/\p{Lu}[\p{L}\d-]*\s*$/u.test(before) && !QUALIFIER.test(before)) continue; // "Maia 300", "OnePlus 16"
      if (/[\p{L}\d]$/u.test(before) || /^[\p{L}\d]/u.test(s.slice(i + v.length).replace(/^(?:bn|m|k|%)/i, ''))) continue; // inside a longer token
      const ns = norm(s);
      if (!labelWords.some((w) => ns.includes(w.slice(0, Math.max(4, w.length - 2))))) continue;
      const qualifier = (before.match(QUALIFIER)?.[0] || n.qualifier || '').trim();
      const masked = `${s.slice(0, i)}${'▮'.repeat(Math.min(6, Math.max(2, value.length)))}${s.slice(i + value.length)}`;
      return { value, label: String(n.label || '').trim(), qualifier: qualifier.toUpperCase(), exact: !qualifier, sentence: s, masked };
    }
  }
  return null;
}

// Day words: a TODAY OR NOT TODAY headline must not carry its own answer ("TechCrunch Disrupt 2026 starts tomorrow")
export const DAY_WORDS = /\b(?:today|tonight|tomorrow|yesterday|this (?:week|weekend|morning|afternoon|evening|year)|last (?:week|night|year)|next (?:week|year)|weekend|(?:mon|tues|wednes|thurs|fri|satur|sun)days?|january|february|march|april|may|june|july|august|september|october|november|december|(?:19|20)\d\d|\d{1,2}(?:st|nd|rd|th)\b|\d+ hours to|hours away|days? away|days? to go)\b/i;

/**
 * Why an archive entry cannot be used, or null. Every airing of an event is checked: read grave or serious, grave by
 * text, a bad-news feature subject (closures, job losses), an excluded kind, a review.
 */
export function entryOut(e) {
  if (e?.grave || e?.serious) return 'read grave or serious';
  const text = `${e?.title || ''}. ${e?.headline || ''}. ${e?.summary || ''} ${e?.text || ''}`;
  if (isGrave(text)) return 'grave';
  if (notForFeatures(text)) return 'hardship';
  const first = (x) => sentencesIn(String(x || ''))[0] || '';
  const kind = excludedKind(text, `${e?.title || ''}. ${e?.headline || ''}. ${first(e?.summary)} ${first(e?.text)}`);
  if (kind) return kind;
  const heads = `${e?.title || ''} | ${e?.headline || ''}`;
  if (OPINION.test(heads) || FIRST_PERSON.test(heads)) return 'opinion';
  return null;
}

/** Real stories only: the development runs' fixture stories have no web link, or one on a reserved host. */
export const realEntry = (e) => {
  const m = String(e?.link || '').match(/^https?:\/\/([^/:]+)/i);
  return !!m && !/(?:^localhost$|^127\.|^\[?::1|\.(?:invalid|test|example|localhost)$)/i.test(m[1]);
};

/**
 * The eligible events of the window: every airing in the last `days` (default 7) grouped by event (`same`, the news
 * desk's sameStory, else by id), kept only when every airing of the event passes. Each event carries the words the quiz
 * may show, its picture, its usable place and figure, every programme that aired it, its first and last airing and why
 * the others were left out (`out`, for the gate's report).
 */
export function quizEvents(archive, { now = Date.now(), days = 7, same = null, real = true } = {}) {
  const groups = archive.week({ days, now, same });
  const events = [];
  const out = {};
  const avoid = new Set(); // countries named in the stories left out (never a wrong pin)
  for (const g of groups) {
    const entries = real ? g.entries.filter(realEntry) : g.entries;
    if (!entries.length) continue;
    const why = entries.map(entryOut).find(Boolean);
    if (why) {
      out[why] = (out[why] || 0) + 1;
      for (const e of entries) for (const c of countriesIn(`${e.title || ''}. ${e.headline || ''}. ${e.summary || ''}`)) avoid.add(c);
      continue;
    }
    const latest = entries.at(-1);
    const words = quizWords(latest) || entries.map(quizWords).filter(Boolean).at(-1) || null;
    if (!words) {
      out['broken headline'] = (out['broken headline'] || 0) + 1;
      continue;
    }
    if (labelLike(words)) {
      out['not a headline'] = (out['not a headline'] || 0) + 1;
      continue;
    }
    const withImage = [...entries].reverse().find((e) => e.image);
    // corrections: the latest aired figure, and none that aired with two values within an hour
    const figures = entries.map((e) => ({ at: e.at, f: usableFigure(e) })).filter((x) => x.f);
    const figure = figures.length && !figures.some((x) => figures.some((y) => Math.abs(x.at - y.at) < 3600_000 && x.f.value !== y.f.value)) ? figures.at(-1).f : null;
    events.push({
      key: g.key,
      ids: g.ids,
      words,
      image: withImage?.image || null,
      place: usablePlace(latest, words),
      optionPlace: optionPlace(latest),
      figure,
      figureAt: figure ? figures.at(-1).at : null,
      programmes: [...new Set(entries.map((e) => e.programId).filter(Boolean))],
      first: entries[0].at,
      last: latest.at,
      category: latest.category || g.category || null,
      source: String(latest.source || '').split(' / ')[0] || null,
      latest,
    });
  }
  return { events, out, avoid, groups: groups.length };
}

// Names in a headline (capitalised words not at its start), to keep two options from being one story told twice
// ("Citroën unveils electric version of its 2CV" / "Citroën's iconic 2CV returns as all-electric model", 12 Oct)
const COMMON = new Set(['the', 'a', 'an', 'new', 'first', 'how', 'why', 'what', 'who', 'its', 'it', 'this', 'that', 'these', 'those', 'just', 'after', 'inside', 'revival', 'former', 'long-lost', 'scientists', 'study']);
export function namesIn(words) {
  const out = new Set();
  const tokens = String(words ?? '').split(/\s+/);
  tokens.forEach((t, i) => {
    const w = t.replace(/^[‘'"“(]+|[’'"”),.:;!?]+$/g, '').replace(/['’]s$/, '');
    if (w.length < 3) return;
    // a headline's first word is capitalised anyway: it counts only when shaped like a name ("OpenAI", "NASA",
    // "Citroën's"), never as a common noun ("Museum opens…", "Startup raises…")
    const nameLike = i > 0 || /\p{Lu}.*\p{Lu}/u.test(w.slice(1)) || /^\p{Lu}{2,}$/u.test(w) || /['’]s$/.test(t.replace(/[),.:;!?]+$/, ''));
    if (/^\p{Lu}/u.test(w) && nameLike && !COMMON.has(w.toLowerCase())) out.add(w.toLowerCase());
    if (/\d/.test(w) && /\p{L}/u.test(w)) out.add(w.toLowerCase()); // "2CV", "M5"
  });
  return out;
}

/** Do two events look like one story (a shared name), even when the desk's grouping kept them apart? */
export const shareName = (a, b) => [...namesIn(a.words)].some((n) => namesIn(b.words).has(n));

export const DAY_MS = DAY;
