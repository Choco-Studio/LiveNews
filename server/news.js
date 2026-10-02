import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';
import { config, ROOT } from './config.js';

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

export function cleanHtml(html) {
  return decodeEntities(
    String(html)
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/h\d>/gi, BLOCK)
      .replace(/<[^>]+>/g, ' ')
  )
    // block breaks become sentence breaks unless a sentence already ended
    .replace(/([.!?…:;])?\s*\u0001[\s\u0001]*/g, (_, p) => (p ? `${p} ` : '. '))
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
  // WordPress: "The post <title> appeared first on <Site Name>." (site = capitalised words or a domain)
  /(?:^|(?<=[.!?…"”]))\s*The post .{1,200}? appeared first on (?:(?:[A-Z0-9][\w.&'’-]*|[a-z0-9-]+(?:\.[a-z0-9-]+)+)\s?){1,6}\.?\s*$/,
];
export const stripBoilerplate = (summary) => BOILERPLATE_RES.reduce((s, re) => s.replace(re, ''), String(summary)).trim();

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
const LIVE_RES = [/[-–—]\s*live\b(?![-'’])/i, /\blive updates?\b/i, /\blive blog\b/i, /^\s*live\s*[:|]/i];
export const isLiveBlog = (title) => LIVE_RES.some((re) => re.test(String(title ?? '')));

const TRACKER_RE = /imrworldwide|doubleclick|feedburner|pixel|1x1|tracking|gravatar|\/stats?\b|\.gif(\?|$)/i;

function isUsableImage(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url) && !TRACKER_RE.test(url) && !/\.svg(\?|$)/i.test(url);
}

/** Pick the best image candidate from an RSS/Atom item. */
export function extractImage(item) {
  const candidates = [];
  const pushMedia = (m) => {
    for (const node of asArray(m)) {
      const url = node?.['@_url'] || node?.['@_href'];
      const type = node?.['@_type'] || node?.['@_medium'] || '';
      if (url && (!type || /image/i.test(type))) {
        candidates.push({ url, w: Number(node['@_width']) || 0 });
      }
      // media:group > media:content
      if (node?.['media:content']) pushMedia(node['media:content']);
      if (node?.['media:thumbnail']) pushMedia(node['media:thumbnail']);
    }
  };
  pushMedia(item['media:content']);
  pushMedia(item['media:group']);
  pushMedia(item['media:thumbnail']);
  for (const enc of asArray(item.enclosure)) {
    if (/image/i.test(enc?.['@_type'] || '') || /\.(jpe?g|png|webp)(\?|$)/i.test(enc?.['@_url'] || '')) {
      candidates.push({ url: enc['@_url'], w: 0 });
    }
  }
  for (const link of asArray(item.link)) {
    if (link?.['@_rel'] === 'enclosure' && /image/i.test(link?.['@_type'] || '')) {
      candidates.push({ url: link['@_href'], w: 0 });
    }
  }
  const html = [text(item['content:encoded']), text(item.content), text(item.description), text(item.summary)].join(' ');
  for (const m of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
    candidates.push({ url: decodeEntities(m[1]), w: 0 });
  }
  const usable = candidates.filter((c) => isUsableImage(c.url));
  usable.sort((a, b) => b.w - a.w);
  return usable[0]?.url || null;
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

/** Normalize the parsed XML of an RSS 2.0 or Atom feed into story objects. */
export function parseFeed(xml, feed) {
  const doc = parser.parse(xml);
  const items = doc?.rss?.channel?.item ?? doc?.feed?.entry ?? doc?.['rdf:RDF']?.item ?? [];
  const stories = [];
  for (const item of asArray(items)) {
    const title = cleanHtml(text(item.title));
    const link = itemLink(item);
    if (!title || !link) continue;
    const rawSummary = text(item.description) || text(item.summary) || text(item['content:encoded']) || text(item.content);
    const summary = stripBoilerplate(cleanHtml(rawSummary)).slice(0, 900);
    const dateStr = text(item.pubDate) || text(item.published) || text(item.updated) || text(item['dc:date']);
    const published = Date.parse(dateStr) || Date.now();
    stories.push({
      id: storyId(link.replace(/[?#].*$/, '')),
      title,
      summary,
      link,
      source: feed.name,
      category: feed.category || 'general',
      weight: Number(feed.weight) || 1,
      published,
      image: extractImage(item),
    });
  }
  return stories;
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
  return recency * trend * (s.weight || 1) * image * substance * passedOver;
}

export class NewsDesk {
  constructor({ fetchImpl = fetch, log = console } = {}) {
    this.fetch = fetchImpl;
    this.log = log;
    this.stories = new Map(); // id -> story
    this.covered = new Map(); // id -> timestamp when it was used in a bulletin
    this.lastRefresh = 0;
    this.feedStatus = {};
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
    if (/^file:/i.test(url) || !/^[a-z][a-z0-9+.-]*:/i.test(url)) {
      const file = /^file:/i.test(url) ? fileURLToPath(url) : path.resolve(ROOT, url);
      return (await fs.promises.readFile(file)).subarray(0, 3_000_000).toString('utf8');
    }
    return this.fetchText(url);
  }

  async fetchText(url, { timeoutMs = 10000, maxBytes = 3_000_000 } = {}) {
    if (!/^https?:\/\//i.test(url)) throw new Error(`not an http(s) URL: ${String(url).slice(0, 80)}`);
    const res = await this.fetch(url, {
      headers: { 'user-agent': UA, accept: '*/*' },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.subarray(0, maxBytes).toString('utf8');
  }

  async refresh() {
    const feeds = this.loadFeeds();
    const results = await Promise.allSettled(
      feeds.map(async (feed) => {
        const xml = await this.readFeed(feed.url);
        return parseFeed(xml, feed);
      })
    );
    const maxAge = config.maxStoryAgeHours * 3600_000;
    const now = Date.now();
    const titleKeys = new Set([...this.stories.values()].map((s) => normalizeTitleKey(s.title)));
    let added = 0;
    results.forEach((r, i) => {
      const feed = feeds[i];
      if (r.status === 'rejected') {
        this.feedStatus[feed.name] = { ok: false, error: String(r.reason?.message || r.reason) };
        this.log.warn?.(`[news] ${feed.name}: ${r.reason?.message || r.reason}`);
        return;
      }
      this.feedStatus[feed.name] = { ok: true, items: r.value.length };
      for (const s of r.value) {
        if (now - s.published > maxAge) continue;
        if (this.stories.has(s.id)) continue;
        const key = normalizeTitleKey(s.title);
        if (key && titleKeys.has(key)) continue; // same headline from another feed
        titleKeys.add(key);
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
    this.updateTrending();
    this.lastRefresh = now;
    this.log.info?.(`[news] ${added} new stories, ${this.stories.size} total`);
    return added;
  }

  /** Count how many distinct outlets are reporting each story's event. */
  updateTrending() {
    const list = [...this.stories.values()];
    for (const s of list) s.kw ??= keywords(s.title);
    for (const s of list) {
      const sources = new Set([s.source]);
      for (const o of list) {
        if (o !== s && !sources.has(o.source) && sameEvent(s.kw, o.kw)) sources.add(o.source);
      }
      s.outlets = sources.size;
    }
  }

  uncovered() {
    return [...this.stories.values()].filter((s) => !this.covered.has(s.id)).sort((a, b) => b.published - a.published);
  }

  /**
   * The most interesting uncovered stories, one per event, at most
   * `perSource` from the same outlet. The writer makes the final selection.
   */
  candidates(count, { perSource = 3, categories = null, now = Date.now() } = {}) {
    const ranked = this.uncovered()
      .filter((s) => !categories || categories.includes(s.category))
      .map((s) => ({ s, score: interestScore(s, now) }))
      .sort((a, b) => b.score - a.score);
    const picked = [];
    const perSourceCount = new Map();
    for (const { s } of ranked) {
      if (picked.length >= count) break;
      if ((perSourceCount.get(s.source) || 0) >= perSource) continue;
      s.kw ??= keywords(s.title);
      if (picked.some((p) => sameEvent(p.kw, s.kw))) continue;
      picked.push(s);
      perSourceCount.set(s.source, (perSourceCount.get(s.source) || 0) + 1);
    }
    return picked;
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
      aired.kw ??= keywords(aired.title);
      for (const s of this.stories.values()) {
        s.kw ??= keywords(s.title);
        if (!this.covered.has(s.id) && sameEvent(aired.kw, s.kw)) this.covered.set(s.id, now);
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

  /** Try og:image / twitter:image from the article page when the feed has none. */
  async resolveImage(story) {
    if (story.image || story.imageChecked) return story.image;
    story.imageChecked = true;
    try {
      const html = await this.fetchText(story.link, { timeoutMs: 8000, maxBytes: 400_000 });
      const m =
        html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/i);
      const url = m ? new URL(decodeEntities(m[1]), story.link).href : null;
      if (isUsableImage(url)) story.image = url;
    } catch (err) {
      this.log.warn?.(`[news] og:image ${story.source}: ${err.message}`);
    }
    return story.image;
  }
}
