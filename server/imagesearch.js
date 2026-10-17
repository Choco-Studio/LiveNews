// Image search: a real photo for a story the feeds, the article pages and the same-event cluster left
// without one (owner 22:40: on air only REAL photos found on the web, never a drawn one; the
// orchestrator, gpt6luna, cannot draw either).
//
// A searched picture is a FILE photo: it shows the story's PLACE (a city, a landmark, the canal, the
// port), never the event itself. So the query is built from the place the story names plus, for a
// story about a named structure, that structure ("Panama canal", "Lisbon tram"), and NEVER from event
// words (a flood, a fire, a storm, a protest, a crash): a picture of another flood under a flood story
// would mislead, even labelled. Grave stories get the place alone. People are never searched for. Every
// result is credited "FILE · <author> · <licence>" and kept to freely licensed pictures:
//   commons  Wikimedia Commons (default, no key): CC0 / public domain / CC BY / CC BY-SA only
//   google   Google Programmable Search (GOOGLE_CSE_KEY + GOOGLE_CSE_CX), Creative Commons rights filter
//   bing     Bing Image Search (BING_IMAGE_KEY), licence filter "Share"
//
//   fileQuery(story) -> { q, place, subject } | null   (the query policy above; exported for tests)
//   new ImageSearch({ providers, google, bing, fetchImpl, timeoutMs }).find(story) -> picture | null
//   .search(q) -> [picture]   (the orchestrator's tool: /api/tools/image-search?q=)
// A picture is { url, width, height, credit, license, page, title, via: 'search:<provider>', kind: 'file' }.
import { locate } from './gazetteer.js';
import { isGrave } from './facts.js';
import { cleanCredit } from './pictures.js';
import { LICENCES, licenceOf } from './rights.js';

export const MIN_SEARCH_WIDTH = 640; // a file photo must survive the full-screen shot
const ASPECT = [1.2, 2.4]; // landscape: the wall and the full shot are 16:9
const MIMES = /^image\/(jpeg|png|webp)$/i;
// not a photograph of the place
const NOT_A_PHOTO = /\b(map|maps|locator|flag|flags|logo|logos|coat of arms|emblem|seal|diagram|chart|graph|icon|symbol|plan|svg|drawing|painting|engraving|illustration|poster|stamp|banknote|coin|signature|scan)\b/i;
// structures a story can be about that a file photo may show (their own name before or after)
const SUBJECTS = [
  'canal', 'port', 'harbour', 'harbor', 'bridge', 'station', 'airport', 'tram', 'tramway', 'metro', 'railway', 'parliament',
  'stadium', 'cathedral', 'museum', 'observatory', 'telescope', 'dam', 'power station', 'solar farm', 'wind farm', 'central bank',
  'stock exchange', 'old town', 'glacier', 'reef', 'national park', 'waterfront', 'skyline', 'market', 'university', 'spaceport',
];
const SUBJECT_RE = new RegExp(`\\b(${SUBJECTS.map((s) => s.replace(/ /g, '\\s+')).join('|')})(?:e?s)?\\b`, 'i');
// event words: never in a query (a file picture shows the place, not another event like this one)
const EVENT_WORDS = /\b(flood|floods|flooding|fire|fires|wildfire|blaze|storm|hurricane|typhoon|cyclone|earthquake|quake|tsunami|eruption|erupts?|protest|protests|riot|attack|bomb|explosion|crash|collision|derail|war|strike|shooting|killed|dead|death|deaths|injured|evacuat\w*|landslide|drought|heatwave)\b/i;
// Commons licences kept: those the rights desk clears (server/rights.js): never NonCommercial (the channel will be
// monetised), never NoDerivatives (every picture is pixelated), never a licence it cannot name with its version.
// (The old pattern let "CC BY-NC 2.0" and "CC BY-ND 4.0" through on their "CC BY" prefix.)
export const clearedLicence = (name, code = '', url = '') => {
  const id = licenceOf(code || name, url) || licenceOf(name, url);
  return id && LICENCES[id] && !LICENCES[id].why ? id : null;
};

/** A site's name for a credit: "www.flickr.com/photos/x" -> "FLICKR" (a credit never carries a domain). */
export const siteName = (host) => String(host ?? '').replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '').split('.')[0].toUpperCase();
const stripHtml = (s) => String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** The licence as aired: "CC BY-SA 4.0" -> "CC BY-SA", "Public domain" -> "PD". */
export function shortLicence(name) {
  const s = stripHtml(name);
  if (/^cc0/i.test(s)) return 'CC0';
  if (/^(public domain|pd\b|pd-)/i.test(s)) return 'PD';
  const m = /^cc[ -](by(?:-sa)?)/i.exec(s);
  return m ? `CC ${m[1].toUpperCase()}` : s.toUpperCase();
}

/** "FILE · J. SMITH · CC BY-SA" within the credit limit (the author shortened first). */
export function fileCredit(author, licence, host = '') {
  const lic = licence ? shortLicence(licence) : '';
  let who = stripHtml(author).replace(/\s*\([^)]*\)\s*/g, ' ').split(/[,;|]| - /)[0].trim() || host || 'WIKIMEDIA COMMONS';
  const fit = (w) => ['FILE', w, lic].filter(Boolean).join(' · ');
  while (fit(who).length > 40 && who.includes(' ')) who = who.slice(0, who.lastIndexOf(' '));
  if (fit(who).length > 40) who = who.slice(0, Math.max(3, 40 - fit('').length));
  return cleanCredit(fit(who)) || fit(who);
}

/**
 * The file-photo query for a story (see the policy at the top), or null: no named place, a story about a
 * person rather than a place, or nothing a picture could honestly show.
 */
export function fileQuery(story) {
  const title = stripHtml(story?.title || story?.headline || '');
  const summary = stripHtml(story?.summary || '');
  if (!title) return null;
  const loc = locate(title, summary);
  if (!loc?.place) return null;
  // the gazetteer's labels are upper case ("LISBON, PORTUGAL"): the query reads "Lisbon tram"
  const placeName = loc.place.split(',')[0].trim().toLowerCase().replace(/(^|[\s-])\p{L}/gu, (c) => c.toUpperCase());
  const grave = isGrave(`${title} ${summary}`);
  let subject = null;
  if (!grave) {
    const m = SUBJECT_RE.exec(title) || SUBJECT_RE.exec(summary);
    if (m) subject = m[1].toLowerCase().replace(/\s+/g, ' ');
  }
  // a broad region (a continent, an ocean) is no place a picture can show
  if (loc.entry?.broad) return null;
  const q = [placeName, subject].filter(Boolean).join(' ');
  if (EVENT_WORDS.test(q)) return null;
  return { q, place: loc.place, subject, grave };
}

/** Does a found picture pass the gates (size, shape, a photograph, not of an event)? */
export function usableResult(p) {
  if (!p || typeof p.url !== 'string' || !/^https:\/\//i.test(p.url)) return false;
  if (!(p.width >= MIN_SEARCH_WIDTH) || !(p.height > 0)) return false;
  const a = p.width / p.height;
  if (a < ASPECT[0] || a > ASPECT[1]) return false;
  if (p.mime && !MIMES.test(p.mime)) return false;
  const text = `${p.title || ''} ${p.description || ''}`;
  if (NOT_A_PHOTO.test(text)) return false;
  if (EVENT_WORDS.test(text)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// providers: each turns a query into candidate pictures

function commonsUrl(q, { full = false, limit = 12 } = {}) {
  const u = new URL('https://commons.wikimedia.org/w/api.php');
  const p = {
    action: 'query',
    format: 'json',
    formatversion: '2',
    generator: 'search',
    gsrnamespace: '6',
    gsrsearch: `${q} filetype:bitmap -map -flag -logo`,
    gsrlimit: String(Math.max(1, Math.min(50, limit))),
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: '1280',
    iiextmetadatafilter: full ? 'Artist|Credit|LicenseShortName|License|LicenseUrl|Restrictions|Categories|ImageDescription|DateTimeOriginal|ObjectName|NonFree' : 'Artist|LicenseShortName|License|LicenseUrl|ImageDescription|DateTimeOriginal',
    origin: '*',
  };
  for (const [k, v] of Object.entries(p)) u.searchParams.set(k, v);
  return u.toString();
}

/** Commons API reply -> pictures (search order kept; free licences only). */
export function parseCommons(data) {
  const pages = Array.isArray(data?.query?.pages) ? data.query.pages : Object.values(data?.query?.pages || {});
  const out = [];
  for (const pg of [...pages].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))) {
    const ii = pg?.imageinfo?.[0];
    if (!ii) continue;
    const md = ii.extmetadata || {};
    const licence = stripHtml(md.LicenseShortName?.value);
    if (!clearedLicence(licence, stripHtml(md.License?.value), stripHtml(md.LicenseUrl?.value))) continue;
    const url = ii.thumburl || ii.url;
    const width = ii.thumbwidth || ii.width;
    const height = ii.thumbheight || ii.height;
    out.push({
      url,
      width,
      height,
      mime: ii.mime,
      title: String(pg.title || '').replace(/^File:/, '').replace(/\.[a-z]{3,4}$/i, ''),
      description: stripHtml(md.ImageDescription?.value).slice(0, 200),
      license: licence,
      page: ii.descriptionurl || null,
      credit: fileCredit(md.Artist?.value, licence),
      via: 'search:commons',
      kind: 'file',
    });
  }
  return out;
}

const COMMONS_WIKI = 'https://commons.wikimedia.org/wiki/';
/**
 * A Commons API page -> the file record the rights desk reads (server/picturedesk.js): the picture to serve (a 1280 px
 * rendition), its licence as an id (server/rights.js licenceOf, from Commons' own machine code first), its author,
 * description, categories and non-copyright restrictions (personality rights, trademarks), and whether Commons marks
 * it as made by an image generator. Null for a missing file.
 */
/** Where Commons serves its pictures from: the originals' host and, since 2026, the renditions' own host. */
export const COMMONS_MEDIA = /^https:\/\/(?:upload|thumb)\.wikimedia\.org\//;
/** A Commons media URL without its utm_ tracking tags (the same picture, a stable cache key). */
export function cleanMediaUrl(url) {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) if (/^utm_/i.test(k)) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return url || null;
  }
}

/**
 * A standard-size rendition (960 or 500 px wide, thumbnail sizes Wikimedia serves from its cache) for an original that
 * Commons returned as itself (no thumbnail asked was smaller); null when Commons already gave a rendition or the
 * original is too small to need one.
 */
export function standardRendition(ii) {
  const w = Number(ii?.width) || 0;
  const h = Number(ii?.height) || 0;
  const url = String(ii?.url || '');
  if (!w || !h || (ii.thumburl && ii.thumburl !== ii.url)) return null;
  const m = /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/([0-9a-f])\/([0-9a-f]{2})\/([^/?#]+\.(?:jpe?g|png|webp))$/i.exec(url);
  if (!m) return null;
  const width = [960, 500].find((x) => x < w);
  if (!width) return null;
  return { url: `https://thumb.wikimedia.org/wikipedia/commons/thumb/${m[1]}/${m[2]}/${m[3]}/${width}px-${m[3]}`, width, height: Math.round((h * width) / w) };
}

export function fileFromCommons(pg, { now = Date.now() } = {}) {
  const ii = pg?.imageinfo?.[0];
  if (!ii || pg.missing) return null;
  const md = ii.extmetadata || {};
  const v = (k) => stripHtml(md[k]?.value ?? '');
  const licence = licenceOf(v('License') || v('LicenseShortName'), v('LicenseUrl')) || licenceOf(v('LicenseShortName'), v('LicenseUrl'));
  const categories = v('Categories');
  const description = v('ImageDescription').slice(0, 400);
  // Commons serves renditions from thumb.wikimedia.org (2026) or upload.wikimedia.org, with utm_ tags that are dropped;
  // an original no wider than the 1280 px asked comes back as itself, and Wikimedia rate-limits robots' downloads of
  // originals hard (HTTP 429, Retry-After 600 s, seen 17 Oct): a standard-size rendition is asked instead
  const std = standardRendition(ii);
  const thumbUrl = cleanMediaUrl(std?.url || ii.thumburl || ii.url);
  return {
    title: pg.title,
    url: thumbUrl,
    width: Number(std?.width || ii.thumbwidth || ii.width) || 0,
    height: Number(std?.height || ii.thumbheight || ii.height) || 0,
    origWidth: Number(ii.width) || 0,
    mime: /\.png$/i.test(thumbUrl || '') ? 'image/png' : /\.webp$/i.test(thumbUrl || '') ? 'image/webp' : /\.jpe?g$/i.test(thumbUrl || '') ? 'image/jpeg' : ii.mime,
    page: ii.descriptionurl || `${COMMONS_WIKI}${encodeURIComponent(String(pg.title).replace(/ /g, '_'))}`,
    licence,
    licenceName: v('LicenseShortName'),
    author: v('Artist') || v('Credit') || null,
    credit: v('Credit') || null,
    description,
    objectName: v('ObjectName'),
    categories: categories.slice(0, 1500),
    // when it was taken, as the file says (a FILE picture of an earlier event says its year)
    taken: v('DateTimeOriginal').slice(0, 60) || null,
    restrictions: v('Restrictions').split('|').map((x) => x.trim()).filter(Boolean),
    ai: /\b(?:ai-generated|images generated by|generated by artificial intelligence|pd-algorithm)\b/i.test(`${categories} ${description}`),
    nonFree: /^true$/i.test(v('NonFree')),
    checkedAt: now,
  };
}

/** Commons search reply -> file records (search order kept), every licence as Commons gives it (the desk decides). */
export function parseCommonsFiles(data, opts = {}) {
  const pages = Array.isArray(data?.query?.pages) ? data.query.pages : Object.values(data?.query?.pages || {});
  return [...pages].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((pg) => fileFromCommons(pg, opts)).filter(Boolean);
}

function googleUrl(q, { key, cx }) {
  const u = new URL('https://www.googleapis.com/customsearch/v1');
  const p = { key, cx, q, searchType: 'image', num: '10', imgSize: 'large', imgType: 'photo', safe: 'active', rights: 'cc_publicdomain|cc_attribute|cc_sharealike' };
  for (const [k, v] of Object.entries(p)) u.searchParams.set(k, v);
  return u.toString();
}

/** Google Programmable Search reply -> pictures. */
export function parseGoogle(data) {
  return (data?.items || []).map((it) => ({
    url: it.link,
    width: it.image?.width,
    height: it.image?.height,
    mime: it.mime,
    title: stripHtml(it.title),
    description: stripHtml(it.snippet),
    license: 'CC',
    page: it.image?.contextLink || null,
    credit: fileCredit('', 'CC', siteName(it.displayLink)),
    via: 'search:google',
    kind: 'file',
  }));
}

function bingUrl(q) {
  const u = new URL('https://api.bing.microsoft.com/v7.0/images/search');
  const p = { q, count: '10', safeSearch: 'Strict', imageType: 'Photo', aspect: 'Wide', minWidth: String(MIN_SEARCH_WIDTH), license: 'Share' };
  for (const [k, v] of Object.entries(p)) u.searchParams.set(k, v);
  return u.toString();
}

/** Bing Image Search reply -> pictures. */
export function parseBing(data) {
  return (data?.value || []).map((it) => ({
    url: it.contentUrl,
    width: it.width,
    height: it.height,
    mime: it.encodingFormat ? `image/${String(it.encodingFormat).toLowerCase().replace('jpg', 'jpeg')}` : null,
    title: stripHtml(it.name),
    description: '',
    license: 'CC',
    page: it.hostPageUrl || null,
    credit: fileCredit('', 'CC', siteName(it.hostPageDisplayUrl)),
    via: 'search:bing',
    kind: 'file',
  }));
}

// ---------------------------------------------------------------------------

export class ImageSearch {
  /**
   * @param o.providers  ['commons'] by default; 'google' / 'bing' only with their keys
   * @param o.google     { key, cx }   @param o.bing { key }
   */
  constructor({ providers = ['commons'], google = {}, bing = {}, fetchImpl = fetch, timeoutMs = 5000, log = console, wikimedia = null } = {}) {
    this.fetch = fetchImpl;
    this.wikimedia = wikimedia; // server/wikimedia.js WikimediaClient: the polite queue shared with the picture desk
    this.timeoutMs = timeoutMs;
    this.log = log;
    this.google = google;
    this.bing = bing;
    this.providers = providers.filter((p) => (p === 'google' ? google.key && google.cx : p === 'bing' ? bing.key : p === 'commons'));
    this.cache = new Map(); // query -> { at, results }
    this.failures = 0;
  }

  get enabled() {
    return this.providers.length > 0;
  }

  async getJson(url, headers = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'GLOBIT24/1.0 (pixel news channel; picture desk)', ...headers } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /** Every usable picture the providers give for a query (in provider order; an hour's cache). */
  async search(q) {
    const query = String(q ?? '').trim().slice(0, 120);
    if (!query || !this.enabled) return [];
    const hit = this.cache.get(query);
    if (hit && Date.now() - hit.at < 3600_000) return hit.results;
    const results = [];
    for (const p of this.providers) {
      try {
        if (p === 'commons') results.push(...parseCommons(await this.getJson(commonsUrl(query))));
        else if (p === 'google') results.push(...parseGoogle(await this.getJson(googleUrl(query, this.google))));
        else if (p === 'bing') results.push(...parseBing(await this.getJson(bingUrl(query), { 'Ocp-Apim-Subscription-Key': this.bing.key })));
      } catch (err) {
        if (this.failures++ < 3) this.log.warn?.(`[images] ${p} search failed (${err.message})`);
      }
    }
    const usable = results.filter(usableResult);
    this.cache.set(query, { at: Date.now(), results: usable });
    if (this.cache.size > 300) this.cache.delete(this.cache.keys().next().value);
    return usable;
  }

  /**
   * Commons files for a FILE-photo query, with everything the rights desk needs (licence, author, categories,
   * restrictions); null when Commons could not be asked (a rate limit, a failure), [] when it found nothing.
   */
  async searchFiles(q, { limit = 12 } = {}) {
    const query = String(q ?? '').trim().slice(0, 120);
    if (!query || !this.providers.includes('commons')) return [];
    try {
      const url = commonsUrl(query, { full: true, limit });
      const data = this.wikimedia ? await this.wikimedia.json(url) : await this.getJson(url);
      return parseCommonsFiles(data);
    } catch (err) {
      if (this.failures++ < 3) this.log.warn?.(`[images] commons search failed (${err.message})`);
      return null;
    }
  }

  /** A file photo for a story (its place, see fileQuery), or null. */
  async find(story) {
    const fq = fileQuery(story);
    if (!fq) return null;
    const list = await this.search(fq.q);
    // the place's own name in the picture's title or description, when any result has it
    const name = fq.place.split(',')[0].trim().toLowerCase();
    const named = list.find((p) => `${p.title} ${p.description}`.toLowerCase().includes(name));
    const pick = named || list[0] || null;
    return pick ? { ...pick, query: fq.q } : null;
  }
}
