import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { XMLParser } from 'fast-xml-parser';
import { config, ROOT } from './config.js';
import { GOOD_WIDTH, feedCandidates, pageCandidates, rankPictures } from './pictures.js';
import { guardedFetch, readCapped } from './net.js';
import { locate, lookupPlace } from './gazetteer.js';
import { onBeat } from './topics.js';

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
const ACRONYMS = new Set('US UK UN EU AI NASA NATO WHO IMF ECB BBC CNN ABC NBC CBS NPR FBI CIA NHS GDP CEO UAE DRC IPO EV EVS COP OPEC G7 G20 TV USA UFO VR AR IT 5G 4G'.split(' '));

/** "THOUSANDS FLEE AS WILDFIRE SPREADS NEAR LOS ANGELES" -> "Thousands flee as wildfire spreads near Los Angeles". */
export function sentenceCase(title) {
  const t = String(title ?? '');
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (letters.length < 8 || letters !== letters.toUpperCase()) return t;
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
    .map((w, i) => (i % 2 ? w : w.replace(/[\p{L}\d]+/gu, (x) => (ACRONYMS.has(x.toUpperCase()) ? x.toUpperCase() : x))))
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
export function parseFeed(xml, feed, { baseDir = null, now = Date.now() } = {}) {
  const doc = parser.parse(xml);
  const items = doc?.rss?.channel?.item ?? doc?.feed?.entry ?? doc?.['rdf:RDF']?.item ?? [];
  const stories = [];
  for (const [index, item] of asArray(items).entries()) {
    // Raw text is capped before any cleaning: a title needs a line, a summary a few paragraphs.
    const title = plainSpaces(cleanHtml(text(item.title).slice(0, 2000))).slice(0, 300);
    const link = itemLink(item);
    if (!title || !link) continue;
    const rawSummary = text(item.description) || text(item.summary) || text(item['content:encoded']) || text(item.content);
    const summary = stripBoilerplate(cleanHtml(rawSummary.slice(0, MAX_RAW_HTML))).slice(0, 900);
    const dateStr = text(item.pubDate) || text(item.published) || text(item.updated) || text(item['dc:date']);
    // Undated items: "now", one second older per position (feeds list the newest first),
    // so the desk ranks them the same way on every run.
    const published = Date.parse(dateStr) || now - index * 1000;
    const pictures = itemPictures(item, { baseDir, link });
    // A local feed's item may link to a local article page (offline fixtures), inside the feed's folder.
    const page = baseDir ? localPage(link, baseDir) : null;
    stories.push({
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
      ...(page ? { page } : {}),
      ...(baseDir ? { local: true } : {}),
      ...(isLiveBlog(title) ? { live: true } : {}),
    });
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
  return recency * trend * (s.weight || 1) * image * substance * passedOver * urgency;
}

/** A programme's own beat counts for more: its first category weighs 1.5x the others. */
export const PRIMARY_CATEGORY_WEIGHT = 1.5;

// Two reports are only treated as the same event when they do not name places in different countries:
// "Tokyo stocks close at a record high" and "New York stocks close at a record high" are two stories.
const countryOf = (title) => {
  const loc = locate(title, '');
  return loc && !loc.entry.broad ? loc.entry.country || loc.entry.name : null;
};
const jaccard = (a, b) => {
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / (a.size + b.size - shared || 1);
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms).unref?.());

/** Copy a picture from one report to another, crediting the outlet whose picture it is. */
function lendPicture(from, to, { linked = true } = {}) {
  to.image = from.image;
  to.imageWidth = from.imageWidth;
  if (from.images) to.images = [...from.images];
  else delete to.images;
  to.imageVia = linked ? 'cluster' : 'duplicate';
  if (from.source !== to.source) to.imageCredit = from.source;
  else delete to.imageCredit;
  if (linked) to.imageFrom = from.id;
}

function forgetPicture(s) {
  s.image = null;
  for (const k of ['images', 'imageWidth', 'imageVia', 'imageCredit', 'imageFrom']) delete s[k];
}

export class NewsDesk {
  constructor({ fetchImpl = fetch, log = console, lookup = null } = {}) {
    this.fetch = fetchImpl;
    this.log = log;
    this.lookup = lookup; // DNS for the private-address guard (tests inject one)
    this.stories = new Map(); // id -> story
    this.covered = new Map(); // id -> timestamp when it was used in a bulletin
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
        this.feedStatus[feed.name] = { ok: false, error: String(r.reason?.message || r.reason) };
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
    // Forget stale stories
    for (const [id, s] of this.stories) {
      if (now - s.published > maxAge) this.stories.delete(id);
    }
    for (const [id, t] of this.covered) {
      if (now - t > maxAge * 2) this.covered.delete(id);
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
      if (list.length >= 3 || (list.length === 2 && !this.samePictureEvent(list[0], list[1]))) {
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
    }
    return true;
  }

  /** The country a story's headline names, cached on the story (null: none, or only a region like "Europe"). */
  whereOf(s) {
    if (s.where === undefined) s.where = countryOf(s.title || '');
    return s.where;
  }

  /** Same event: enough shared keywords, and no places in two different countries. */
  sameStory(a, b) {
    a.kw ??= keywords(a.title);
    b.kw ??= keywords(b.title);
    if (!sameEvent(a.kw, b.kw)) return false;
    const [wa, wb] = [this.whereOf(a), this.whereOf(b)];
    return !(wa && wb && wa !== wb);
  }

  /** Stricter, for lending a picture: a wrong picture on air is worse than none. */
  samePictureEvent(a, b) {
    return this.sameStory(a, b) && jaccard(a.kw, b.kw) >= 0.25;
  }

  /** Count how many distinct outlets are reporting each story's event. */
  updateTrending() {
    const list = [...this.stories.values()];
    for (const s of list) s.kw ??= keywords(s.title);
    for (const s of list) {
      const sources = new Set([s.source]);
      for (const o of list) {
        if (o !== s && !sources.has(o.source) && this.sameStory(s, o)) sources.add(o.source);
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

  /** Mark stories as aired, plus other outlets' reports of the same events. */
  markCovered(ids) {
    const now = Date.now();
    for (const id of ids) {
      this.covered.set(id, now);
      const aired = this.stories.get(id);
      if (!aired) continue;
      for (const s of this.stories.values()) {
        if (!this.covered.has(s.id) && s !== aired && this.sameStory(aired, s)) this.covered.set(s.id, now);
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
      if (s.offered >= 3) this.covered.set(id, now);
    }
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
        // where the picture was found (feed:media, page:og, cluster...) and whose it is when borrowed
        imageVia: s.image ? s.imageVia || 'feed' : null,
        imageCredit: s.image ? s.imageCredit || null : null,
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
      const own = story.image && !story.imageFrom ? (story.images || [story.image]).map((url, i) => ({ url, w: i === 0 ? story.imageWidth || 0 : 0, via: 'feed', local: /^file:/i.test(url) })) : [];
      const ranked = rankPictures([...found.filter((c) => !c.local || story.local), ...own]).filter((c) => !this.placeholders.has(c.url));
      const best = ranked[0];
      if (best && best.via !== 'feed' && (!own.length || best.w > (story.imageWidth || 0))) {
        forgetPicture(story);
        story.image = best.url;
        story.imageWidth = best.w;
        story.imageVia = `page:${best.via}`;
        if (ranked.length > 1) story.images = ranked.map((c) => c.url);
        this.notePagePicture(story, best.url);
      }
    } catch (err) {
      this.log.warn?.(`[news] page picture ${story.source}: ${err.message}`);
    }
    return story.image;
  }

  notePagePicture(story, url) {
    const ids = (this.pageImageUse.get(url) || []).filter((id) => id !== story.id && this.stories.has(id));
    const clash = ids.map((id) => this.stories.get(id)).filter((o) => o.source === story.source && !this.samePictureEvent(o, story));
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
