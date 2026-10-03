import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { XMLParser } from 'fast-xml-parser';
import { config, ROOT } from './config.js';
import { GOOD_WIDTH, feedCandidates, pageCandidates, rankPictures } from './pictures.js';
import { guardedFetch, readCapped } from './net.js';
import { degreesApart, findPlaces, locate, lookupPlace } from './gazetteer.js';
import { onBeat } from './topics.js';
import { sameWord } from './facts.js';

export { extractImage, isUsableImage } from './pictures.js';

const UA = 'Mozilla/5.0 (compatible; LiveNewsBot/0.1; +https://github.com/choco-studio/livenews)';
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  htmlEntities: true,
  processEntities: true,
});

const asArray = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);

function text(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === 'object') return text(v['#text'] ?? '');
  return '';
}

const NAMED_ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", hellip: '…', laquo: '«', raquo: '»', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', ndash: '–', mdash: '—' };

const codePoint = (n, fallback) => (Number.isInteger(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : fallback);

const ACCENTS = { acute: '\u0301', grave: '\u0300', circ: '\u0302', uml: '\u0308', tilde: '\u0303', cedil: '\u0327', ring: '\u030a' };

export function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => codePoint(parseInt(h, 16), m))
    .replace(/&#(\d+);/g, (m, d) => codePoint(Number(d), m))
    .replace(/&([a-z])(acute|grave|circ|uml|tilde|cedil|ring);/gi, (_, l, a) => (l + ACCENTS[a.toLowerCase()]).normalize('NFC'))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

const BLOCK = '\u0001'; // marks HTML block ends while tags are stripped
const BLOCK_TAG = /^<(?:br\s*\/?|\/p|\/li|\/h\d)\s*>$/i;
// Nothing on air needs more than this much of an item's raw HTML.
export const MAX_RAW_HTML = 20_000;

/**
 * Strip tags with one left-to-right pass (indexOf, no backtracking regex): a
 * hostile item made of thousands of "<" can no longer stall the event loop.
 * Comments and <script>/<style> bodies go; block ends become BLOCK marks; a
 * "<" with no closing ">" is plain text, as before.
 */
function stripTags(html) {
  const s = String(html);
  const lower = s.toLowerCase();
  let out = '';
  let i = 0;
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt < 0 || lt === s.length - 1) {
      out += s.slice(i);
      break;
    }
    out += s.slice(i, lt);
    if (s.startsWith('<!--', lt)) {
      const end = s.indexOf('-->', lt + 4);
      out += ' ';
      i = end < 0 ? s.length : end + 3;
      continue;
    }
    const raw = lower.slice(lt + 1, lt + 7);
    const body = raw.startsWith('script') ? 'script' : raw.startsWith('style') ? 'style' : null;
    if (body && /[\s>/]/.test(lower[lt + 1 + body.length] || '>')) {
      const close = lower.indexOf(`</${body}`, lt);
      const gt = close < 0 ? -1 : s.indexOf('>', close);
      out += ' ';
      i = gt < 0 ? s.length : gt + 1;
      continue;
    }
    if (s[lt + 1] === '>') {
      out += '<>';
      i = lt + 2;
      continue;
    }
    const gt = s.indexOf('>', lt + 1);
    if (gt < 0) {
      out += s.slice(lt);
      break;
    }
    out += BLOCK_TAG.test(s.slice(lt, gt + 1)) ? BLOCK : ' ';
    i = gt + 1;
  }
  return out;
}

export function cleanHtml(html) {
  return decodeEntities(stripTags(String(html ?? '').slice(0, MAX_RAW_HTML)))
    .replace(/[^\S\u0001]+/g, ' ')
    // block breaks become sentence breaks unless a sentence already ended
    .replace(/([.!?…:;])? ?\u0001[ \u0001]*/g, (_, p) => (p ? `${p} ` : '. '))
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+/, '')
    .trim();
}

// Feed boilerplate that is not part of the story. Each pattern only matches a
// trailing fragment that stands on its own (after a sentence end, or the
// capitalised link text glued to the excerpt), so a real sentence such as
// "Experts say children should read more." is never cut.
const BOILERPLATE_RES = [
  // "… Useful text. Read more…" / "Continue reading »" / "Leer la noticia completa."
  /(?:^|(?<=[.!?…»"”':]))\s*(?:Leer la noticia completa|Continue reading|Read more)\s*(?:\.{1,3}|…|»|→)?\s*$/i,
  // link text glued to the excerpt without a full stop: "… the end Read more »" (capitalised only)
  /(?<=[a-z0-9,;)])\s+(?:Continue reading|Read more)\s*(?:\.{3}|…|»|→)?\s*$/,
  /(?<=[.!?])\s*Comments?\s*$/i,
  // WordPress: "The post <title> appeared first on <Site Name>." (site = capitalised words or a domain).
  // Words of the site name are separated by mandatory spaces, so a long run of capitals can be
  // split only one way: the regex stays linear on hostile input (no catastrophic backtracking).
  /(?:^|(?<=[.!?…"”]))\s*The post .{1,200}? appeared first on (?:[A-Z0-9][\w.&'’-]*|[a-z0-9-]+(?:\.[a-z0-9-]+)+)(?: (?:[A-Z0-9][\w.&'’-]*|[a-z0-9-]+(?:\.[a-z0-9-]+)+)){0,5}\.?\s*$/,
];
// Feed summaries are capped before any regex runs: nothing on air needs more than the first few paragraphs.
const MAX_SUMMARY_SCAN = 5000;
export const stripBoilerplate = (summary) => BOILERPLATE_RES.reduce((s, re) => s.replace(re, ''), String(summary).slice(0, MAX_SUMMARY_SCAN)).trim();

// Explicit breaking-news markers only ("Record-breaking heatwave" is not breaking news).
const BREAKING_START = /^\s*breaking(?: news)?\s*[:|–—-]/i;
const BREAKING_END = /(?:,|\s[|–—-])\s*breaking\s*$/i; // the separator needs a space: "record-breaking" has none
const BREAKING_WORD = /(?<![\w\-–—])BREAKING(?![\w\-–—])/; // the capitalised word, not part of a compound
const BREAKING_LEAD = /^\s*BREAKING(?![\w\-–—])/;
const ULTIMA_HORA = /última hora/i;
// In a headline written in capitals, capitals say nothing: only a leading BREAKING counts.
const shouting = (t) => {
  const letters = t.replace(/[^A-Za-z]/g, '');
  return letters.length >= 8 && letters === letters.toUpperCase();
};
export const isBreaking = (title) => {
  const t = String(title ?? '');
  if (BREAKING_START.test(t) || BREAKING_END.test(t) || ULTIMA_HORA.test(t)) return true;
  return shouting(t) ? BREAKING_LEAD.test(t) : BREAKING_WORD.test(t);
};

// Live blogs ("Election night – live", "Live updates: …") are rolling coverage,
// not breaking news: The Guardian alone runs several a day, sport included. They
// are flagged so the writer can call them developing stories, but they never
// trigger the BREAKING banner.
const LIVE_RES = [
  /[-–—]\s*(?:[\w-]+\s+)?live\b(?![-'’])/i, // "Election night – live", "UK inflation – business live"
  /\blive updates?\b/i,
  /\blive blog\b/i,
  /^\s*live\s*[:|]/i,
  /(?:^|\s)\w+\s+live\s*:/i, // "Ukraine war live: …", "Politics live: …", "Middle East crisis live: …"
  /\bas it happened\b/i,
  /\blive!/i,
];
export const isLiveBlog = (title) => LIVE_RES.some((re) => re.test(String(title ?? '')));

// Short words that stay in capitals when a shouting headline is sentence-cased.
const ACRONYMS = new Set('US UK UN EU AI NASA NATO WHO IMF ECB BBC CNN ABC NBC CBS NPR FBI CIA NHS GDP CEO UAE DRC IPO EV EVS COP OPEC G7 G20 TV USA UFO VR AR IT 5G 4G FIFA UEFA IAEA OECD ASEAN UNHCR UNICEF UNESCO NOAA'.split(' '));

// Ordinary short words of headlines: in a headline written in capitals, a 2-4 letter word NOT on this list is
// taken for an acronym and keeps its capitals ("NASA AND ESA LAUNCH..." keeps ESA); letter-digit codes (Q3, G7,
// COP29, 5G) always do.
const COMMON_SHORT = new Set(
  ('a an and are as at be but by do for from go has had have he her him his how if in into is it its me my no not now of off on ' +
    'one or our out over own say says see she so than that the then they this to too two up us was way we were what when who why ' +
    'will with you all any age ago aid air arm art ask bad bag ban bar bay bed bet bid big bit box boy bus buy can car cat cut day ' +
    'die dog dry due ear eat end era eye far fat fed few fit fly fog fun gap gas get gun guy hit hot ice ill ink jam jet job joy key ' +
    'kid kit lab law lay leg let lie lot low mad man map men mix mob mud net new nil oil old pay pet pin pit pop pot put rag ran rat ' +
    'raw red rid rig row run sad sat saw sea set six sky son spa spy sun tax tea ten tie tip toe ton top toy try van via vow war wet ' +
    'win won yes yet zoo able also area army away baby back ball band bank base bear beat been best bill bird blow blue boat body ' +
    'bomb bond book boom boss both bowl bulk burn busy call calm came camp card care case cash cast cell chef chip city clan club ' +
    'coal coat code cold come cook cool cops copy core cost crew crop cuts dark data date dead deal dear debt deep deny desk diet ' +
    'dish does done door down draw drop drug dust duty each earn ease east easy edge else even ever exam exit face fact fail fair ' +
    'fall fame farm fast fate fear feed feel fees feet fell felt file fill film find fine fire firm fish five flag flat flee fled ' +
    'flew flow food foot ford form four free from fuel full fund gain game gate gave gear gift girl give glad goal goes gold golf ' +
    'gone good grew grid grow gulf hail hair half hall halt hand hang hard harm hate have head heal hear heat held hell help here ' +
    'hero hide high hike hill hire hits hold hole home hope host hour huge hunt hurt idea iron item jail jobs join joke jump jury ' +
    'just keen keep kept kick kill kind king knew know lack lady laid lake land lane last late lead leak left less life lift like ' +
    'line link list live load loan lock long look lord lose loss lost loud love luck made mail main make male many mark mass mayor ' +
    'meal mean meat meet menu mild mile milk mind mine miss mode mood moon more most move much must name navy near neck need news ' +
    'next nice nine none norm nose note nuts odds okay once only onto open oral over pace pack page paid pain pair palm park part ' +
    'pass past path peak pick pier pile pill pink plan play plea plot plus poll pool poor port pose post pour pray prey pull pure ' +
    'push race rail rain rank rare rate read real rear rely rent rest rice rich ride ring rise risk road rock role roll roof room ' +
    'root rose rule rush safe said sail sale salt same sand save scan seal seat seed seek seem seen self sell send sent ship shop ' +
    'shot show shut sick side sign silk sing sink site size skin slip slow snow soft soil sold sole some song soon sort soul spot ' +
    'star stay step stop such suit sure swap take tale talk tall tank tape task team tech tell tend term test text than them then ' +
    'they thin this tide tied ties till time tiny tips told toll tone took tool tops torn tour town toys tram tree trip true tube ' +
    'tune turn twin type unit upon used user vast very vice view visa void vote wage wait wake walk wall want ward warm warn wash ' +
    'wave ways weak wear week well went were west what when whom wide wife wild will wind wine wing wins wire wise wish with wolf ' +
    'wood word wore work worn yard year your zero zone act add aim ant ape arc ash ate awe axe bat bee beg bin bow bud bug bun cab ' +
    'cap cow cry cub cue cup dam den dew dig dim dip doc dot dub dug duo dye egg ego elf elm eve fan fax fee fig fin fix flu foe fox ' +
    'fry fur gag gel gem gig gin god got gum gut hat hay hen hop hub hue hug hut icy inn ion ivy jaw jog jug kin lap lid lip log ' +
    'mat mop mug nab nap nod nor nun nut oak oar oat odd opt orb ore owe owl pad pal pan paw pea pen pie pig ply pod pro pub pun ' +
    'pup ram rap ray rib rim rip rob rod rot rub rug rum rye sag sap sew sip sir sit ski sob sow soy sub sue sum tab tag tan tap ' +
    'tar tin tow tub tug urn use vet wag web wig wit woe wok yak yam zip').split(' ')
);
const LETTER_DIGIT = /^(?:[A-Z]{1,4}\d{1,4}[A-Z]?|\d{1,3}[A-Z]{1,2})$/;

/** "THOUSANDS FLEE AS WILDFIRE SPREADS NEAR LOS ANGELES" -> "Thousands flee as wildfire spreads near Los Angeles". */
export function sentenceCase(title) {
  const t = String(title ?? '');
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (letters.length < 8 || letters !== letters.toUpperCase()) return t;
  // acronyms and codes as the outlet wrote them, before everything goes to lower case
  const kept = new Set();
  for (const w of t.match(/[A-Z0-9]+/g) || []) {
    // a guess only for 2-3 letters (4-letter acronyms come from the ACRONYMS list: "RAID", "FANS" are words)
    if (LETTER_DIGIT.test(w) || (/^[A-Z]{2,3}$/.test(w) && !COMMON_SHORT.has(w.toLowerCase()) && !lookupPlace(w))) kept.add(w);
  }
  const words = t.toLowerCase().split(/(\s+)/);
  // Place names keep their capitals (the gazetteer knows them; longest first, up to 3 words).
  for (let i = 0; i < words.length; i += 2) {
    for (let n = 5; n >= 1; n -= 2) {
      const span = words.slice(i, i + n).join('');
      const bare = span.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '').replace(/['’]s$/, '');
      if (bare.length < 3) continue;
      const e = lookupPlace(bare);
      if (e && [e.name, ...e.aliases].some((a) => a.toLowerCase() === bare)) {
        for (let k = i; k < Math.min(i + n, words.length); k += 2) words[k] = words[k].replace(/\p{L}+/gu, (w) => w[0].toUpperCase() + w.slice(1));
        break;
      }
    }
  }
  return words
    // a word the place pass capitalised ("Los" of Los Angeles) stays as it is
    .map((w, i) => (i % 2 ? w : w.replace(/[\p{L}\d]+/gu, (x) => (ACRONYMS.has(x.toUpperCase()) ? x.toUpperCase() : /^\p{Lu}/u.test(x) ? x : kept.has(x.toUpperCase()) ? x.toUpperCase() : x))))
    .join('')
    .replace(/^[^\p{L}]*\p{Ll}/u, (c) => c.toUpperCase());
}

/** A headline as it is said on air: without the outlet's "BREAKING:" or "– live" markers (they belong to the strap). */
export const plainTitle = (title) =>
  sentenceCase(
    String(title ?? '')
      .replace(/^\s*breaking(?: news)?\s*[:|–—-]\s*/i, '')
      .replace(/\s*(?:,|\s[|–—-])\s*breaking\s*$/i, '')
      .replace(/^\s*live(?: updates)?\s*[:|]\s*/i, '')
      .replace(/\s*[-–—]\s*(?:[\w-]+\s+)?live(?: updates| blog)?!?\s*$/i, '')
      .replace(/\s*[-–—:]\s*as it happened\s*$/i, '')
      .replace(/\s*[:|]\s*live updates?\s*$/i, '')
      .replace(/^(\s*\w+)\s+live\s*:\s*/i, '$1: ')
      .replace(/(\s\w+)\s+live\s*:\s*/i, '$1: ')
      .replace(/\s*\blive!\s*/i, ' ')
      .trim()
  ).replace(/^\p{Ll}/u, (c) => c.toUpperCase());

/**
 * A picture shipped next to a LOCAL feed (offline demos and fixtures): a
 * relative path in the item's media tags or HTML, resolved inside the feed's
 * own folder. Remote feeds never get this.
 */
export function extractLocalImage(item, baseDir) {
  return rankPictures(feedCandidates(item, { baseDir }).filter((c) => c.local))[0]?.url || null;
}

/** The pictures of a feed item, best first (file: URLs only for local feeds, inside their folder). */
export function itemPictures(item, { baseDir = null, link = null } = {}) {
  // Relative references of a remote feed resolve against the item's own web page.
  const list = rankPictures(feedCandidates(item, { baseDir, link: !baseDir && /^https?:\/\//i.test(link || '') ? link : null }));
  return baseDir ? list : list.filter((c) => !c.local);
}

/** The file behind a feed URL that points to the local disk, or null for a web feed. */
export function localFeedPath(url) {
  if (/^file:/i.test(url)) return fileURLToPath(url);
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) return path.resolve(ROOT, url);
  return null;
}

function itemLink(item) {
  for (const l of asArray(item.link)) {
    if (typeof l === 'string') return l.trim();
    if (l?.['@_href'] && (!l['@_rel'] || l['@_rel'] === 'alternate')) return l['@_href'];
  }
  const guid = text(item.guid);
  return /^https?:/.test(guid) ? guid : '';
}

export const storyId = (key) => 's' + crypto.createHash('sha1').update(key).digest('hex').slice(0, 10);

/**
 * Normalize the parsed XML of an RSS 2.0 or Atom feed into story objects.
 * `baseDir` is given only for local feeds from the operator's list: their
 * stories may carry pictures stored next to the feed file.
 */
// A feed lists its newest items first; nothing on air needs more than this many of one feed's items (a
// hostile or mis-sized feed of 12,000 items would otherwise flood the desk).
export const MAX_FEED_ITEMS = 150;
// Stories the desk holds at most (a few hundred is a busy day for a full feed list).
export const MAX_DESK = 3000;
// Characters that never belong on air: controls, bidi overrides, zero-width marks, soft hyphens, emoji and
// pictographs (the bitmap font draws them as gaps and the voice spells them).
const UNSPEAKABLE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff\ufe0e\ufe0f]|\p{Extended_Pictographic}|[\u{1f1e6}-\u{1f1ff}\u{1f3fb}-\u{1f3ff}]/gu;
// "[wave]"-style tokens in feed text would be read as stage directions by the writer's cue parser.
const CUE_TOKEN = /\[[A-Za-z]{1,8}(?::[A-Za-z_]{1,16})?\]/g;
/** Feed text made safe for the strap and the voice. */
export const onAirText = (s) => String(s ?? '').replace(UNSPEAKABLE, ' ').replace(CUE_TOKEN, ' ').replace(/\s+/g, ' ').trim();

export function parseFeed(xml, feed, { baseDir = null, now = Date.now() } = {}) {
  const doc = parser.parse(xml);
  const items = doc?.rss?.channel?.item ?? doc?.feed?.entry ?? doc?.['rdf:RDF']?.item ?? [];
  const stories = [];
  for (const [index, item] of asArray(items).slice(0, MAX_FEED_ITEMS).entries()) {
    // Raw text is capped before any cleaning: a title needs a line, a summary a few paragraphs.
    const title = onAirText(plainSpaces(cleanHtml(text(item.title).slice(0, 2000)))).slice(0, 300);
    const link = itemLink(item);
    if (!title || !/\p{L}/u.test(title) || !link) continue;
    const rawSummary = text(item.description) || text(item.summary) || text(item['content:encoded']) || text(item.content);
    const summary = onAirText(stripBoilerplate(cleanHtml(rawSummary.slice(0, MAX_RAW_HTML)))).slice(0, 900);
    const dateStr = text(item.pubDate) || text(item.published) || text(item.updated) || text(item['dc:date']);
    // Undated items: "now", one second older per position (feeds list the newest first),
    // so the desk ranks them the same way on every run.
    const published = Date.parse(dateStr) || now - index * 1000;
    const pictures = itemPictures(item, { baseDir, link });
    const credits = creditsOf(pictures);
    // A local feed's item may link to a local article page (offline fixtures), inside the feed's folder.
    const page = baseDir ? localPage(link, baseDir) : null;
    const story = {
      id: storyId(link.replace(/[?#].*$/, '')),
      title,
      summary,
      link,
      source: feed.name,
      category: feed.category || 'general',
      weight: Number(feed.weight) || 1,
      published,
      image: pictures[0]?.url || null,
      ...(pictures.length ? { imageWidth: pictures[0].w, imageVia: `feed:${pictures[0].via}` } : {}),
      ...(pictures.length > 1 ? { images: pictures.map((p) => p.url) } : {}),
      ...(credits ? { imageCredits: credits } : {}),
      ...(page ? { page } : {}),
      ...(baseDir ? { local: true } : {}),
      ...(isLiveBlog(title) ? { live: true } : {}),
    };
    stampCredit(story);
    stories.push(story);
  }
  return stories;
}

const plainSpaces = (s) => s.replace(/\s+/g, ' ').trim();

/** A local fixture article page: a relative .html path inside the feed's folder, as a file: URL. */
function localPage(link, baseDir) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(link) || !/\.html?$/i.test(link) || link.startsWith('/') || link.startsWith('\\')) return null;
  const root = path.resolve(baseDir);
  const file = path.resolve(root, link);
  return file.startsWith(root + path.sep) ? pathToFileURL(file).href : null;
}

export function normalizeTitleKey(title) {
  return title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').split(' ').filter((w) => w.length > 3).slice(0, 8).join(' ');
}

// Words that carry no topic information, for story similarity.
const STOPWORDS = new Set(
  ('the a an and or but of to in on at for from by with as is are was were be been has have had will would ' +
    'can could may might says said say new news live update updates after over into about than more most ' +
    'its it his her their they them this that these those who what when where why how not no yes all also ' +
    'just first last year years day days week amid against while under out off up down two three one ' +
    'el la los las de del en un una y que por para con se su al lo como mas sus')
    .split(' ')
);

export function keywords(title) {
  return new Set(
    title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  );
}

/** Two headlines are about the same event if they share enough keywords. */
export function sameEvent(a, b) {
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  const union = a.size + b.size - shared;
  return shared >= 2 && shared / (union || 1) >= 0.2;
}

/**
 * Editorial interest score: big stories are covered by several outlets at
 * once; fresher is better; feed weight, pictures and a real summary help.
 */
export function interestScore(s, now = Date.now()) {
  const ageH = Math.max(0, (now - s.published) / 3600_000);
  const recency = 1 / (1 + ageH / 6);
  const trend = 1 + 0.9 * Math.min(4, (s.outlets || 1) - 1);
  const image = s.image ? 1.15 : 1;
  const substance = (s.summary || '').length > 80 ? 1 : 0.7;
  const passedOver = 0.6 ** (s.offered || 0);
  // What the outlet itself calls breaking news tops the desk; rolling live pages sink (no clear news line).
  const urgency = isBreaking(s.title) ? 3 : s.live ? 0.5 : 1;
  // A story back on a closed desk (NewsDesk.recycle) sinks a little, by a different amount each time round,
  // so the next bulletin is not the last one again in the same order.
  const rerun = s.recycled ? 0.6 + 0.3 * ((storyHash(`${s.id}#${s.recycled}`) % 1000) / 1000) : 1;
  return recency * trend * (s.weight || 1) * image * substance * passedOver * urgency * rerun;
}

function storyHash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A programme's own beat counts for more: its first category weighs 1.5x the others. */
export const PRIMARY_CATEGORY_WEIGHT = 1.5;

// ---------------------------------------------------------------- same event?
// Two reports are one event only when nothing says otherwise: they name no places that disagree ("Tokyo
// stocks close at a record high" / "New York stocks..."; "Storm hits Florida coast" / "...Texas coast"), the
// place coming from the headline or else the summary's first sentence ("Central bank raises interest rates
// unexpectedly" is Brazil's when the summary says so); no names that disagree ("new iPhone" / "new iPad");
// no incidents of different kinds ("London bridge attack" / "London fraud scheme"; a recall / a factory
// opening; rates held / rates raised); no different causes ("after engine fire" / "after window blows out").

const firstSentenceOf = (text) => String(text || '').split(/(?<=[.!?])\s+(?=[A-Z0-9"“])/)[0].slice(0, 300);

/** The place a report is about: the headline's most precise place, else the summary's first sentence's (or null). */
function storyPlace(s) {
  const head = locate(s.title || '', '');
  if (head && !head.entry.broad) {
    // "Kenya ..." with "near Nairobi" in the first sentence: the city, inside the country the headline names
    const deeper = head.entry.kind === 'country' ? locate(s.title || '', firstSentenceOf(s.summary)) : null;
    return deeper && !deeper.entry.broad ? deeper.entry : head.entry;
  }
  const body = locate('', firstSentenceOf(s.summary));
  return body && !body.entry.broad ? body.entry : null;
}

/** Do two places agree? true / false, or null when one is unknown. A country holds its cities and regions. */
export function placesAgree(a, b) {
  if (!a || !b) return null;
  if (a === b) return true;
  const ca = a.country || a.name;
  const cb = b.country || b.name;
  if (ca !== cb) return false;
  if (a.kind === 'country' || b.kind === 'country') return true;
  // Two places inside one country: the same spot (a city and the region around it), not two states or cities.
  return degreesApart(a, b) <= (a.kind === 'city' && b.kind === 'city' ? 1 : 5);
}

const foldWord = (w) => w.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * Names in a headline: capitalised words past the first ("Hurricane Elena ... Yucatán" -> elena, yucatan),
 * possessives folded. Empty for a headline in Title Case or capitals (every word is capitalised there).
 */
export function namesOf(title) {
  const words = String(title || '').split(/\s+/).map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').replace(/['’]s$/u, '')).filter(Boolean);
  const long = words.filter((w) => w.length > 3);
  if (long.length >= 3 && long.filter((w) => /^\p{Lu}/u.test(w)).length / long.length >= 0.8) return new Set();
  const out = new Set();
  words.forEach((w, i) => {
    if (i > 0 && w.length >= 2 && /\p{Lu}/u.test(w)) out.add(foldWord(w));
  });
  return out;
}

// Kinds of incident and decision: two reports whose headlines name different kinds are two events.
const INCIDENT_KINDS = [
  ['violence', /^(?:attacks?|attacked|assault|shootings?|shot|gunman|gunmen|gunfire|stabbings?|stabbed|bombs?|bombings?|bombed|explosions?|blasts?|airstrikes?)$/],
  ['theft', /^(?:robbery|robberies|robbed|heist|theft|thefts|stolen|burglary|looting)$/],
  ['fraud', /^(?:fraud|scam|scams|scheme|embezzlement|bribery|corruption|laundering)$/],
  ['wildfire', /^(?:wildfires?|bushfires?)$/],
  ['fire', /^(?:fires?|blaze|burning|arson)$/],
  ['flood', /^(?:floods?|flooding|flooded)$/],
  ['quake', /^(?:earthquakes?|quake|tremor|aftershocks?)$/],
  ['storm', /^(?:storms?|hurricanes?|typhoons?|cyclones?|tornado(?:es)?)$/],
  ['eruption', /^(?:volcano(?:es)?|volcanic|erupts?|erupted|eruptions?|lava)$/],
  ['crash', /^(?:crash|crashes|crashed|collision|derail(?:s|ed|ment)?|capsized?)$/],
  ['recall', /^(?:recalls?|recalled)$/],
  ['launch', /^(?:opens|opened|unveils|unveiled|launches|launched)$/],
  ['closure', /^(?:closes|closed|closure|shuts|shut)$/],
  ['raise', /^(?:raises|raised|hikes|hiked|lifts|increases)$/],
  ['lower', /^(?:cuts|lowers|lowered|slashes|reduces)$/],
  ['hold', /^(?:holds|held|keeps|pauses|freezes)$/],
  ['approve', /^(?:announces|approves|approved|backs|passes|signs)$/],
  ['reject', /^(?:rejects|rejected|scraps|blocks|vetoes|withdraws)$/],
];
const kindsOf = (kw) => {
  const out = new Set();
  for (const w of kw) for (const [kind, re] of INCIDENT_KINDS) if (re.test(w)) out.add(kind);
  return out;
};
const KIND_WORD = (w) => INCIDENT_KINDS.some(([, re]) => re.test(w));
// Kinds one event can carry under two names: a hurricane floods, a wildfire is a fire.
const KIND_FAMILY = { storm: 'weather', flood: 'weather', wildfire: 'wildfire', fire: 'wildfire' };
const family = (k) => KIND_FAMILY[k] || k;
const sharedKinds = (a, b) => [...a].filter((k) => [...b].some((x) => family(x) === family(k)));
const disjoint = (a, b) => a.size > 0 && b.size > 0 && !sharedKinds(a, b).length;
// Rare physical events: two reports of an earthquake, a storm, a flood, an eruption or a wildfire in the same place
// within a day and a half are one event; a fire, an opening, an arrest or a fraud in a big city are not.
const PHYSICAL = new Set(['quake', 'storm', 'flood', 'eruption', 'wildfire']);
// Decisions one place takes once ("Norway raises rates"): the same decision in the same place is one event.
const DECISIONS = new Set(['raise', 'lower', 'hold']);
// Opposite outcomes are two reports of different things ("court jails..." / "court frees...").
const OPPOSITES = [
  [/^(?:jails?|jailed|convicts?|convicted|sentences?|sentenced|guilty)$/, /^(?:frees?|freed|acquits?|acquitted|clears?|cleared|releases?|released)$/],
  [/^(?:wins?|won|victory)$/, /^(?:loses?|lost|defeat|defeated)$/],
  [/^(?:approves?|approved|backs|passes|passed|upholds?|upheld)$/, /^(?:rejects?|rejected|blocks?|blocked|vetoes|vetoed|overturns?|overturned)$/],
  [/^(?:rises?|rose|climbs?|climbed|jumps?|jumped|gains?|gained|soars?|soared|surges?|surged)$/, /^(?:falls?|fell|drops?|dropped|slides?|slid|slumps?|slumped|plunges?|plunged|sinks?|sank)$/],
  [/^(?:opens?|opened|reopens?|reopened)$/, /^(?:closes?|closed|shuts?)$/],
  [/^(?:arrives?|arrived|lands?|landed)$/, /^(?:departs?|departed|leaves)$/],
];
const opposite = (a, b) => OPPOSITES.some(([x, y]) => {
  const ax = [...a].some((w) => x.test(w));
  const ay = [...a].some((w) => y.test(w));
  const bx = [...b].some((w) => x.test(w));
  const by = [...b].some((w) => y.test(w));
  return (ax && !ay && by && !bx) || (ay && !ax && bx && !by);
});
// "Earthquake drill held at Chile schools" is not the earthquake; "second storm forms" is another storm.
const FRAME_SHIFT = /\b(?:drills?|exercises?|anniversary|memorial|commemorat\w*|remember\w*|rehearsals?|simulations?|years? (?:after|since|on))\b/i;
const ANOTHER = /\b(?:second|another|third|fresh|new)\s+(?:storm|quake|earthquake|eruption|fire|wildfire|flood|hurricane|typhoon|cyclone|tornado|attack|blast|outbreak|strike)\b/i;
// Words that name who acts, not what happened: two reports that share only these are about different things
// ("London mayor opens new cycle lane" / "London mayor launches knife-crime review").
const ROLE_WORDS = new Set(
  ('police judge judges court courts mayor minister ministers government officials official president governor council councils ministry ' +
    'authorities authority prosecutors prosecutor union unions company companies firm firms central bank banks chief chiefs leader leaders ' +
    'spokesman spokeswoman agency army military state city country man woman men women residents group groups team teams boss').split(' ')
);
// Words two unrelated reports from one place easily share ("Paris metro strike" / "Paris museum strike"):
// a picture is lent on a shared subject (tram, coral, reef), never on one of these alone.
const GENERIC_WORDS = new Set(
  ('strike strikes protest protests record records plans plan deal talks vote votes election elections prices price rates rate ' +
    'workers staff thousands people city cities country government officials police court state national local world global ' +
    'opens opened closes closed rises rise falls fall cuts high low year month week day night first second third report reports ' +
    'warns warning calls call asks says hits hit makes make gets takes faces start starts ends end business market markets ' +
    'shows show signs sign parts part sets set back again near big top major former latest still now amid').split(' ')
);
const CAUSE_PHRASE = /\b(?:after|over|following|because of|due to)\s+(.+)$/i;
/** The content words of a headline's "after ..." phrase ("after engine fire" -> engine, fire). */
const causeOf = (title) => {
  const m = String(title || '').match(CAUSE_PHRASE);
  return m ? keywords(m[1]) : new Set();
};
const jaccard = (a, b) => {
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / (a.size + b.size - shared || 1);
};
const sharedCount = (a, b) => {
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n;
};
/** Words of `a` that `b` has too, inflections allowed ("recovers" ~ "recovery"), among those `keep` accepts. */
const softShared = (a, b, keep = () => true) => {
  let n = 0;
  for (const w of a) if (keep(w) && (b.has(w) || [...b].some((x) => keep(x) && sameWord(w, x)))) n++;
  return n;
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms).unref?.());

/** Credits a list of ranked picture candidates carry, by URL ({ url: [credit, via] }), or null. */
function creditsOf(list) {
  const out = {};
  for (const c of list) if (c.credit) out[c.url] = [c.credit, c.creditVia];
  return Object.keys(out).length ? out : null;
}

/**
 * Who a picture is credited to (every picture on air has a credit): the
 * credit the feed or the page gives for that very picture (media:credit,
 * JSON-LD creditText / copyrightHolder / author, og:site_name), else the
 * outlet whose picture it is (the lender, for a borrowed one). `url` is the
 * rendition really served, when known. Returns { credit, via }.
 */
export function pictureCredit(s, url = s?.image) {
  if (!s?.image) return null;
  const own = url && url !== s.image ? s.imageCredits?.[url] : null;
  if (own) return { credit: own[0], via: own[1] };
  if (s.imageCredit) return { credit: s.imageCredit, via: s.imageCreditVia || 'outlet' };
  return creditNow(s);
}

function creditNow(s) {
  const c = s.imageCredits?.[s.image];
  if (c) return { credit: c[0], via: c[1] };
  return { credit: s.imageLender || s.source, via: 'outlet' };
}

function stampCredit(s) {
  const c = s.image ? creditNow(s) : null;
  if (c) {
    s.imageCredit = c.credit;
    s.imageCreditVia = c.via;
  } else {
    delete s.imageCredit;
    delete s.imageCreditVia;
  }
}

/** Copy a picture from one report to another, crediting the outlet whose picture it is. */
function lendPicture(from, to, { linked = true } = {}) {
  to.image = from.image;
  to.imageWidth = from.imageWidth;
  if (from.images) to.images = [...from.images];
  else delete to.images;
  if (from.imageCredits) to.imageCredits = { ...from.imageCredits };
  else delete to.imageCredits;
  to.imageVia = linked ? 'cluster' : 'duplicate';
  to.imageLender = from.imageLender || from.source;
  if (linked) to.imageFrom = from.id;
  stampCredit(to);
}

function forgetPicture(s) {
  s.image = null;
  for (const k of ['images', 'imageWidth', 'imageVia', 'imageCredit', 'imageCreditVia', 'imageCredits', 'imageLender', 'imageFrom']) delete s[k];
}

export class NewsDesk {
  constructor({ fetchImpl = fetch, log = console, lookup = null } = {}) {
    this.fetch = fetchImpl;
    this.log = log;
    this.lookup = lookup; // DNS for the private-address guard (tests inject one)
    this.stories = new Map(); // id -> story
    this.covered = new Map(); // id -> timestamp when it was used in a bulletin
    // Recycling (a closed desk: the offline slate, or a quiet night with `recycle: 'all'`) brings back the
    // stories aired longest ago, never those of the last few episodes: each markCovered() call is one episode.
    this.coverSeq = 0;
    this.coveredSeq = new Map(); // id -> coverSeq of the episode that covered it
    this.localOnly = false; // every feed of the operator's list is a local file (offline demo)
    this.lastRefresh = 0;
    this.feedStatus = {};
    this.localImageRoots = new Set(); // folders of local feeds, whose pictures may be served
    this.placeholders = new Set(); // picture URLs an outlet puts on many unrelated stories (logos, share cards)
    this.pageImageUse = new Map(); // page picture URL -> ids of the stories that use it
    this.failedPictures = new Set(); // picture URLs that would not download or were too small
  }

  loadFeeds() {
    return JSON.parse(fs.readFileSync(config.feedsFile, 'utf8'));
  }

  /**
   * Feed XML. Feeds listed in the feeds file may also be local (offline demos
   * and fixtures): a file: URL or a path relative to the repo. Only the
   * operator's feed list gets this; links found inside feeds never do.
   */
  async readFeed(url) {
    const file = localFeedPath(url);
    if (file) return (await fs.promises.readFile(file)).subarray(0, 3_000_000).toString('utf8');
    // The operator chose this URL: it may live on a private host (a local feed server).
    return this.fetchText(url, { allowPrivate: true });
  }

  /**
   * Text behind a URL, read as a stream and cut at `maxBytes`. Links found in
   * feeds (article pages) never reach the machine itself or its private
   * network, on any redirect hop; only the operator's feed list may.
   */
  async fetchText(url, { timeoutMs = 10000, maxBytes = 3_000_000, allowPrivate = false } = {}) {
    if (!/^https?:\/\//i.test(url)) throw new Error(`not an http(s) URL: ${String(url).slice(0, 80)}`);
    const { res } = await guardedFetch(this.fetch, url, {
      timeoutMs,
      allowPrivate,
      headers: { 'user-agent': UA, accept: '*/*' },
      ...(this.lookup ? { lookup: this.lookup } : {}),
    });
    if (!res.ok) {
      try {
        await res.body?.cancel?.();
      } catch {}
      throw new Error(`HTTP ${res.status}`);
    }
    return (await readCapped(res, maxBytes, { truncate: true })).toString('utf8');
  }

  async refresh() {
    const feeds = this.loadFeeds();
    this.localOnly = feeds.length > 0 && feeds.every((f) => !!localFeedPath(f.url));
    const startedAt = Date.now();
    const results = await Promise.allSettled(
      feeds.map(async (feed) => {
        const xml = await this.readFeed(feed.url);
        const file = localFeedPath(feed.url);
        const baseDir = file ? path.dirname(file) : null;
        if (baseDir) this.localImageRoots.add(baseDir);
        return parseFeed(xml, feed, { baseDir, now: startedAt });
      })
    );
    const maxAge = config.maxStoryAgeHours * 3600_000;
    const now = Date.now();
    const titleKeys = new Map([...this.stories.values()].map((s) => [normalizeTitleKey(s.title), s]));
    let added = 0;
    results.forEach((r, i) => {
      const feed = feeds[i];
      if (r.status === 'rejected') {
        this.feedStatus[feed.name] = { ok: false, error: String(r.reason?.message || r.reason).slice(0, 200) };
        this.log.warn?.(`[news] ${feed.name}: ${r.reason?.message || r.reason}`);
        return;
      }
      this.feedStatus[feed.name] = { ok: true, items: r.value.length };
      const fresh = r.value.filter((s) => now - s.published <= maxAge);
      this.dropPlaceholders(fresh);
      for (const s of fresh) {
        if (this.stories.has(s.id)) continue;
        const key = normalizeTitleKey(s.title);
        if (key && titleKeys.has(key)) {
          // Same headline from another feed: the first report stays, and takes this one's picture if it has none.
          const kept = titleKeys.get(key);
          if (kept && !kept.image && s.image) lendPicture(s, kept, { linked: false });
          continue;
        }
        titleKeys.set(key, s);
        this.stories.set(s.id, s);
        added++;
      }
    });
    // Forget stale stories, and keep the desk to MAX_DESK stories (the oldest go first)
    for (const [id, s] of this.stories) {
      if (now - s.published > maxAge) this.stories.delete(id);
    }
    if (this.stories.size > MAX_DESK) {
      const oldest = [...this.stories.values()].sort((a, b) => a.published - b.published).slice(0, this.stories.size - MAX_DESK);
      for (const s of oldest) this.stories.delete(s.id);
    }
    for (const [id, t] of this.covered) {
      if (now - t > maxAge * 2) {
        this.covered.delete(id);
        this.coveredSeq.delete(id);
      }
    }
    for (const [url, list] of this.pageImageUse) if (!list.some((id) => this.stories.has(id))) this.pageImageUse.delete(url);
    this.updateTrending();
    // Reports without a picture borrow one from another outlet's report of the same event.
    this.borrowPictures();
    this.lastRefresh = now;
    this.log.info?.(`[news] ${added} new stories, ${this.stories.size} total`);
    return added;
  }

  /**
   * Logos and generic share cards: a picture URL one outlet puts on three or
   * more items of a feed, or on two items about different events, is not a
   * news picture. It is remembered, and every story falls back to its next one.
   */
  dropPlaceholders(stories) {
    const uses = new Map();
    for (const s of stories) for (const url of new Set(s.images || (s.image ? [s.image] : []))) uses.set(url, [...(uses.get(url) || []), s]);
    const marked = [];
    for (const [url, list] of uses) {
      if (this.placeholders.has(url)) continue;
      if (list.length >= 3 || (list.length === 2 && !this.sameStory(list[0], list[1]))) {
        this.markPlaceholder(url);
        marked.push(url);
      }
    }
    for (const s of stories) this.withoutPlaceholders(s);
    // A card that only now shows up on several items was also on stories already on the desk.
    if (marked.length) for (const s of this.stories.values()) if (this.withoutPlaceholders(s)) this.borrowPictures([s]);
  }

  markPlaceholder(url) {
    this.placeholders.add(url);
    if (this.placeholders.size > 2000) this.placeholders.delete(this.placeholders.values().next().value);
  }

  /** Remove known placeholders from a story's pictures; true when its picture changed. */
  withoutPlaceholders(s) {
    const list = (s.images || (s.image ? [s.image] : [])).filter((u) => !this.placeholders.has(u));
    const current = s.images || (s.image ? [s.image] : []);
    if (list.length === current.length) return false;
    if (!list.length) forgetPicture(s);
    else {
      if (s.image !== list[0]) s.imageWidth = 0;
      s.image = list[0];
      if (list.length > 1) s.images = list;
      else delete s.images;
      stampCredit(s);
    }
    return true;
  }

  /** The gazetteer place a story is about (headline, else the summary's first sentence), cached; null when none. */
  whereOf(s) {
    if (s.where === undefined) s.where = storyPlace(s);
    return s.where;
  }

  /** What the same-event tests read from a story, cached on it. */
  eventFacts(s) {
    s.kw ??= keywords(s.title || '');
    if (!s.ev || s.ev.title !== s.title) {
      const placeWords = new Set(findPlaces(s.title || '').flatMap((h) => [...keywords(h.text)]));
      const names = namesOf(s.title);
      const topic = new Set([...s.kw].filter((w) => !placeWords.has(w)));
      s.ev = {
        title: s.title,
        names,
        // names that are not places: a storm, a person, a company, a product
        people: new Set([...names].filter((n) => !placeWords.has(n) && !lookupPlace(n))),
        topic,
        // what happened, without the place, who acted, the kind of event and the filler words
        subject: new Set([...topic].filter((w) => !GENERIC_WORDS.has(w) && !ROLE_WORDS.has(w) && !KIND_WORD(w) && !/^\d/.test(w))),
        kinds: kindsOf(s.kw),
        cause: causeOf(s.title),
        frame: FRAME_SHIFT.test(s.title || ''),
        another: ANOTHER.test(s.title || ''),
      };
    }
    return s.ev;
  }

  /**
   * Same event: nothing tells them apart (places that disagree, from the headline or the summary's first
   * sentence; names, incidents, causes or outcomes that differ; a drill, an anniversary, "a second storm"),
   * and something ties them together: a shared name that is not a place ("Hurricane Elena"), the same rare
   * physical event in the same place (an earthquake in Japan, a wildfire near Marseille), the same decision
   * in the same place ("Norway raises rates"), or two words of what happened ("tram line", "coral reef")
   * besides the place, who acted and filler. Used to cluster reports, count outlets, keep one report per
   * event in a programme and cover the others with it.
   */
  sameStory(a, b) {
    const ea = this.eventFacts(a);
    const eb = this.eventFacts(b);
    const agree = placesAgree(this.whereOf(a), this.whereOf(b));
    if (agree === false) return false;
    // each names someone or somewhere the other does not, and they share no name: two events
    const onlyA = [...ea.names].filter((n) => !eb.names.has(n));
    const onlyB = [...eb.names].filter((n) => !ea.names.has(n));
    if (onlyA.length && onlyB.length && sharedCount(ea.names, eb.names) === 0) return false;
    if (disjoint(ea.kinds, eb.kinds)) return false;
    if (ea.cause.size >= 2 && eb.cause.size >= 2 && sharedCount(ea.cause, eb.cause) === 0) return false;
    if (opposite(a.kw, b.kw) || ea.frame !== eb.frame || ea.another || eb.another) return false;
    const kinds = sharedKinds(ea.kinds, eb.kinds);
    if (sharedCount(ea.people, eb.people) > 0 && sameEvent(a.kw, b.kw)) return true;
    if (agree === true && kinds.some((k) => PHYSICAL.has(family(k)) || PHYSICAL.has(k))) return true;
    if (agree === true && kinds.some((k) => DECISIONS.has(k)) && softShared(ea.topic, eb.topic, (w) => !KIND_WORD(w) && !ROLE_WORDS.has(w)) >= 1) return true;
    return sameEvent(a.kw, b.kw) && softShared(ea.subject, eb.subject) >= 2;
  }

  /**
   * Stricter, for lending a picture (a wrong picture on air is worse than none): the same event AND either
   * a shared name that is not a place, or a known place on both sides that agrees, with the same rare
   * physical event or decision, or most of what happened in common (two shared subject words covering
   * two thirds of the shorter headline's, or half of both): "Fire at London warehouse" never lends to
   * "London flat fire".
   */
  samePictureEvent(a, b) {
    if (!this.sameStory(a, b)) return false;
    const ea = this.eventFacts(a);
    const eb = this.eventFacts(b);
    const agree = placesAgree(this.whereOf(a), this.whereOf(b));
    if (sharedCount(ea.people, eb.people) > 0) return true;
    if (agree !== true) return false;
    if (ea.cause.size && eb.cause.size && sharedCount(ea.cause, eb.cause) === 0) return false;
    const kinds = sharedKinds(ea.kinds, eb.kinds);
    if (kinds.some((k) => PHYSICAL.has(k) || PHYSICAL.has(family(k)) || DECISIONS.has(k))) return true;
    const shared = softShared(ea.subject, eb.subject);
    const small = Math.min(ea.subject.size, eb.subject.size) || 1;
    return shared >= 2 && (shared / small >= 2 / 3 || shared / (ea.subject.size + eb.subject.size - shared || 1) >= 0.5);
  }

  /** Stories that share a keyword with `s` (through the keyword index), excluding `s`. */
  related(s) {
    const index = this.keywordIndex();
    const seen = new Set();
    this.eventFacts(s);
    for (const w of s.kw) {
      const bucket = index.get(w);
      // a word on very many headlines ("record", "new") says nothing about the event
      if (!bucket || bucket.length > 200) continue;
      for (const o of bucket) if (o !== s) seen.add(o);
    }
    return seen;
  }

  /** The keyword index of the desk (word -> stories), rebuilt when the desk changed. */
  keywordIndex() {
    if (this.kwIndex && this.kwIndexSize === this.stories.size && !this.kwIndexDirty) return this.kwIndex;
    const index = new Map();
    for (const s of this.stories.values()) {
      this.eventFacts(s);
      for (const w of s.kw) {
        if (!index.has(w)) index.set(w, []);
        index.get(w).push(s);
      }
    }
    this.kwIndex = index;
    this.kwIndexSize = this.stories.size;
    this.kwIndexDirty = false;
    return index;
  }

  /**
   * Count how many distinct outlets are reporting each story's event. Only stories sharing two keywords
   * can be the same event, so each story is compared with those found through a keyword index, not with
   * the whole desk (thousands of stories cost milliseconds, not seconds).
   */
  updateTrending() {
    this.kwIndexDirty = true;
    const index = this.keywordIndex();
    for (const s of this.stories.values()) {
      const seen = new Map();
      for (const w of s.kw) {
        const bucket = index.get(w);
        if (!bucket || bucket.length > 200) continue;
        for (const o of bucket) if (o !== s && o.source !== s.source) seen.set(o, (seen.get(o) || 0) + 1);
      }
      const sources = new Set([s.source]);
      for (const [o, shared] of seen) {
        // one shared word is enough only for an earthquake, a storm... in the same place (sameStory decides)
        if (!sources.has(o.source) && (shared >= 2 || (s.ev.kinds.size && o.ev.kinds.size)) && this.sameStory(s, o)) sources.add(o.source);
      }
      s.outlets = sources.size;
    }
  }

  /**
   * Same-event cluster: a report with no picture of its own takes the picture
   * of another outlet's report of the same event (the widest one), and records
   * whose it is (`imageCredit`, `imageFrom`). A borrowed picture follows its
   * donor: when the donor loses it, the borrower does too.
   */
  borrowPictures(targets = null) {
    const all = [...this.stories.values()];
    const donors = all.filter((o) => o.image && !o.imageFrom && o.imageVia !== 'duplicate' && !this.failedPictures.has(o.image));
    let lent = 0;
    for (const s of targets || all) {
      if (s.imageFrom) {
        const d = this.stories.get(s.imageFrom);
        if (d && d.image === s.image && !this.failedPictures.has(s.image)) continue;
        forgetPicture(s);
      }
      if (s.image) continue;
      let best = null;
      for (const o of donors) {
        if (o === s || o.source === s.source || !this.samePictureEvent(s, o)) continue;
        if (!best || (o.imageWidth || 0) > (best.imageWidth || 0)) best = o;
      }
      if (best) {
        lendPicture(best, s);
        lent++;
      }
    }
    return lent;
  }

  /**
   * A picture that would not download, or was too small: it is forgotten
   * (with its fallbacks) here and on the stories that borrowed it, and another
   * outlet's picture of the same event may stand in. True if one did.
   */
  pictureFailed(story) {
    for (const url of story.images || (story.image ? [story.image] : [])) {
      this.failedPictures.add(url);
      if (this.failedPictures.size > 2000) this.failedPictures.delete(this.failedPictures.values().next().value);
    }
    forgetPicture(story);
    this.borrowPictures([story]);
    return !!story.image;
  }

  uncovered() {
    return [...this.stories.values()].filter((s) => !this.covered.has(s.id)).sort((a, b) => b.published - a.published);
  }

  /**
   * The most interesting uncovered stories, one per event, at most
   * `perSource` from the same outlet. The writer makes the final selection.
   * `avoid` lowers categories another programme due soon will want as its
   * own beat ({ science: 0.5 }: COSMOS airs next, leave it the science), or
   * is a function giving each story its factor.
   * `beat` keeps a section's stories only on the programme's topics
   * ({ tech: ['SPACE', ...] }: COSMOS takes a rocket, not a games console).
   * `fill` lets the per-outlet cap give way when the pool would otherwise
   * come up short (a long programme on a section with one or two outlets).
   */
  candidates(count, { perSource = 3, categories = null, now = Date.now(), avoid = null, beat = null, fill = false } = {}) {
    const primary = categories && categories.length > 1 ? categories[0] : null;
    const ranked = this.uncovered()
      .filter((s) => !categories || categories.includes(s.category))
      .map((s) => ({ s, score: interestScore(s, now) * (s.category === primary ? PRIMARY_CATEGORY_WEIGHT : 1) * (typeof avoid === 'function' ? avoid(s) : avoid?.[s.category] ?? 1) }))
      .sort((a, b) => b.score - a.score);
    const picked = [];
    const perSourceCount = new Map();
    // Variety of outlets first; then, with `fill`, when a section has only one or two outlets (a niche beat, a
    // small feed list, the offline demo), the rest of the pool from them rather than a programme starved of stories.
    for (const capped of fill ? [true, false] : [true]) {
      for (const { s } of ranked) {
        if (picked.length >= count) break;
        if (picked.includes(s) || (capped && (perSourceCount.get(s.source) || 0) >= perSource)) continue;
        if (beat && !onBeat(s, beat)) continue;
        if (picked.some((p) => this.sameStory(p, s))) continue;
        picked.push(s);
        perSourceCount.set(s.source, (perSourceCount.get(s.source) || 0) + 1);
      }
    }
    // The second pass appended its stories after the first pass's: back into ranking order.
    const rank = new Map(ranked.map(({ s }, i) => [s, i]));
    return picked.sort((a, b) => rank.get(a) - rank.get(b));
  }

  /** Kept for compatibility: the top `count` candidates. */
  pickStories(count) {
    return this.candidates(count);
  }

  /** Mark stories as aired, plus other outlets' reports of the same events (one call = one episode). */
  markCovered(ids) {
    const now = Date.now();
    const seq = ++this.coverSeq;
    const cover = (id) => {
      this.covered.set(id, now);
      this.coveredSeq.set(id, seq);
    };
    for (const id of ids) {
      cover(id);
      const aired = this.stories.get(id);
      if (!aired) continue;
      for (const s of this.stories.values()) {
        if (!this.covered.has(s.id) && s !== aired && this.sameStory(aired, s)) cover(s.id);
      }
    }
  }

  /** Candidates the editor passed over sink in the ranking, then drop out. */
  markOffered(ids) {
    const now = Date.now();
    for (const id of ids) {
      const s = this.stories.get(id);
      if (!s) continue;
      s.offered = (s.offered || 0) + 1;
      if (s.offered >= 3) {
        this.covered.set(id, now);
        this.coveredSeq.set(id, this.coverSeq);
      }
    }
  }

  /**
   * Bring back up to `count` covered stories (those `filter` accepts), the ones
   * aired longest ago first, never one aired in the last `gap` episodes nor
   * less than `minAgeMs` ago. A closed desk (the offline slate) would
   * otherwise run dry after one rotation and air replays for ever; a real
   * 24/7 channel re-runs its stories too, in new bulletins. Returns how many
   * came back.
   */
  recycle(count, { filter = null, gap = 5, minAgeMs = 0, now = Date.now() } = {}) {
    if (!(count > 0)) return 0;
    const list = [];
    for (const [id, at] of this.covered) {
      const s = this.stories.get(id);
      if (!s || (filter && !filter(s)) || now - at < minAgeMs) continue;
      const seq = this.coveredSeq.get(id) ?? 0;
      if (this.coverSeq - seq < gap) continue;
      list.push({ s, at, seq });
    }
    list.sort((a, b) => a.seq - b.seq || a.at - b.at);
    const back = list.slice(0, count);
    for (const { s } of back) {
      this.covered.delete(s.id);
      this.coveredSeq.delete(s.id);
      s.offered = 0;
      s.recycled = (s.recycled || 0) + 1;
      // A re-run is not breaking news any more: the outlet's marker goes (the strap, the lead rule, the alert).
      if (isBreaking(s.title)) {
        s.title = plainTitle(s.title);
        s.kw = undefined;
      }
    }
    return back.length;
  }

  get(id) {
    return this.stories.get(id);
  }

  /** A compact view of the desk for dev tools: the most interesting stories first. */
  deskView(limit = 80, now = Date.now()) {
    return [...this.stories.values()]
      .map((s) => ({ s, score: interestScore(s, now) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ s, score }) => ({
        id: s.id,
        title: s.title,
        source: s.source,
        category: s.category,
        hasImage: !!s.image,
        // where the picture was found (feed:media, page:og, cluster...), who it is credited to and why
        imageVia: s.image ? s.imageVia || 'feed' : null,
        imageCredit: s.image ? pictureCredit(s).credit : null,
        imageCreditVia: s.image ? pictureCredit(s).via : null,
        outlets: s.outlets || 1,
        covered: this.covered.has(s.id),
        breaking: isBreaking(s.title),
        live: !!s.live,
        score: Math.round(score * 1000) / 1000,
      }));
  }

  /** Pictures an article page declares (og:image, twitter:image, JSON-LD, image_src; its AMP page if needed). */
  async pagePictures(link) {
    const html = await this.fetchText(link, { timeoutMs: 8000, maxBytes: 600_000 });
    const { candidates, amp } = pageCandidates(html, link);
    if (candidates.length || !amp) return candidates;
    return pageCandidates(await this.fetchText(amp, { timeoutMs: 6000, maxBytes: 600_000 }), amp).candidates;
  }

  /** The same, for an offline fixture page: a local file inside the folder of one of the operator's local feeds. */
  async localPagePictures(story) {
    const file = path.resolve(fileURLToPath(story.page));
    const root = [...this.localImageRoots].map((r) => path.resolve(r)).find((r) => file.startsWith(r + path.sep));
    if (!root) throw new Error('page outside the local feed folders');
    const handle = await fs.promises.open(file, 'r');
    try {
      const buf = Buffer.alloc(600_000);
      const { bytesRead } = await handle.read(buf, 0, buf.length, 0);
      return pageCandidates(buf.subarray(0, bytesRead).toString('utf8'), null, { baseDir: root, from: path.dirname(file) }).candidates;
    } finally {
      await handle.close();
    }
  }

  /**
   * Look for a story's own picture on its article page when the feed gave none,
   * or only a small one (< 640 px). Each story is tried once. An outlet's page
   * picture that turns up on an unrelated story of the same outlet is a generic
   * share card: it is dropped from both. Local fixture stories read their local page.
   */
  async resolveImage(story) {
    if (story.imageChecked) return story.image;
    const small = story.image && story.imageWidth && story.imageWidth < GOOD_WIDTH && !story.imageFrom;
    if (story.image && !story.imageFrom && !small) return story.image;
    if (story.local && !story.page) return story.image;
    if (!story.local && !/^https?:\/\//i.test(story.link || '')) return story.image;
    story.imageChecked = true;
    try {
      const found = story.local ? await this.localPagePictures(story) : await this.pagePictures(story.link);
      const ownCredits = story.imageCredits || {};
      const own =
        story.image && !story.imageFrom
          ? (story.images || [story.image]).map((url, i) => ({ url, w: i === 0 ? story.imageWidth || 0 : 0, via: 'feed', local: /^file:/i.test(url), ...(ownCredits[url] ? { credit: ownCredits[url][0], creditVia: ownCredits[url][1] } : {}) }))
          : [];
      const ranked = rankPictures([...found.filter((c) => !c.local || story.local), ...own]).filter((c) => !this.placeholders.has(c.url));
      const best = ranked[0];
      if (best && best.via !== 'feed' && (!own.length || best.w > (story.imageWidth || 0))) {
        forgetPicture(story);
        story.image = best.url;
        story.imageWidth = best.w;
        story.imageVia = `page:${best.via}`;
        if (ranked.length > 1) story.images = ranked.map((c) => c.url);
        const credits = creditsOf(ranked);
        if (credits) story.imageCredits = credits;
        stampCredit(story);
        this.notePagePicture(story, best.url);
      }
    } catch (err) {
      this.log.warn?.(`[news] page picture ${story.source}: ${err.message}`);
    }
    return story.image;
  }

  notePagePicture(story, url) {
    const ids = (this.pageImageUse.get(url) || []).filter((id) => id !== story.id && this.stories.has(id));
    const clash = ids.map((id) => this.stories.get(id)).filter((o) => o.source === story.source && !this.sameStory(o, story));
    this.pageImageUse.set(url, [...ids, story.id]);
    if (!clash.length) return;
    this.markPlaceholder(url);
    for (const s of [story, ...clash]) this.withoutPlaceholders(s);
  }

  /**
   * The picture desk for a set of stories (the candidates of an episode):
   * article pages are read for those without a picture (and those with a small
   * one), a few at a time, within `budgetMs`; then, for the stories still
   * without one, the pages of other outlets' reports of the same event; then
   * pictures are borrowed across the same-event cluster (credited). Late pages
   * keep resolving in the background and help the next stage. Returns counts
   * for the pipeline log.
   */
  async findPictures(stories, { budgetMs = 6000, concurrency = 4 } = {}) {
    const had = new Set(stories.filter((s) => s.image).map((s) => s.id));
    const needs = (s) => !s.imageChecked && (!s.image || s.imageFrom || (s.imageWidth && s.imageWidth < GOOD_WIDTH)) && !(s.local && !s.page) && (s.local || /^https?:\/\//i.test(s.link || ''));
    const todo = stories.filter(needs).sort((a, b) => Number(!!a.image && !a.imageFrom) - Number(!!b.image && !b.imageFrom));
    const deadline = Date.now() + budgetMs;
    const run = async (list) => {
      let next = 0;
      const worker = async () => {
        while (next < list.length && Date.now() < deadline) await this.resolveImage(list[next++]);
      };
      const left = deadline - Date.now();
      if (list.length && left > 0) await Promise.race([Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, worker)), wait(left)]);
    };
    await run(todo);
    // Still without a picture of its own: another outlet's report of the same event may have one on its article
    // page (the cluster lends pictures, not only from feeds). Those pages are read next, within the same budget.
    const all = [...this.stories.values()];
    const siblings = [];
    for (const s of stories) {
      if (s.image && !s.imageFrom) continue;
      for (const o of all) if (o !== s && o.source !== s.source && !o.image && needs(o) && !siblings.includes(o) && !todo.includes(o) && this.samePictureEvent(s, o)) siblings.push(o);
    }
    await run(siblings.slice(0, 8));
    this.borrowPictures(stories);
    const withPicture = stories.filter((s) => s.image);
    return {
      pictures: withPicture.length,
      of: stories.length,
      found: withPicture.filter((s) => !had.has(s.id) && String(s.imageVia).startsWith('page:')).length,
      borrowed: withPicture.filter((s) => s.imageFrom).length,
    };
  }
}
