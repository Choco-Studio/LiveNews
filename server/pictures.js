// Picture discovery: finds the best picture for a story in every legitimate
// place the server already reaches, and keeps junk off air.
//
// Sources, in the order a picture desk would look:
//  1. the feed item itself: media:content (also inside media:group, the widest
//     rendition), media:thumbnail, enclosures, Atom enclosure links, <image>,
//     itunes:image, and <img>/<picture> in the item's HTML (src, lazy-load
//     attributes and the largest srcset candidate);
//  2. the article page: og:image (+ width/height), twitter:image, the JSON-LD
//     NewsArticle/Article "image", <link rel="image_src">, itemprop="image",
//     and the AMP version of the page when the page itself names none;
//  3. known CDN thumbnail URLs are upgraded to a larger rendition when the URL
//     pattern is safe to change (never a signed URL); the original stays as
//     the fallback, so a wrong guess costs one failed request, not the picture.
// Quality gates: http(s) only (file: only for the operator's local feeds, inside
// their folder), no SVG/GIF, no tracking pixels, no logos/placeholders/icons by
// name, nothing known to be under 200 px wide or of an extreme shape; pictures
// of 640 px and more are preferred. Placeholders that only show up as "the same
// picture on many unrelated stories of one outlet" are caught by the desk.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const MIN_WIDTH = 200; // known narrower: an icon or thumbnail, never aired
export const GOOD_WIDTH = 640; // preferred: survives the full-screen shot
const MAX_RANK_WIDTH = 1600; // wider is not better for a 416x234 shot
const MAX_CANDIDATES = 5; // kept per story (best first, then fallbacks)

// What a candidate of each kind is usually worth when it does not say its size.
const DEFAULT_WIDTH = { media: 600, enclosure: 600, image: 560, inline: 420, thumbnail: 300, og: 1000, jsonld: 900, twitter: 900, image_src: 640, itemprop: 640, meta: 600 };

const asArray = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);

const ENTITY = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', '#39': "'", '#x27': "'", '#38': '&', '#x2F': '/', '#47': '/' };
const unescapeAttr = (s) => String(s).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => ENTITY[e] ?? ENTITY[e.toLowerCase()] ?? m);

// ---------------------------------------------------------------- gates

// Tracking/analytics hosts and pixel files.
const TRACKER_HOST = /(?:^|\.)(?:doubleclick\.net|feedburner\.com|feedsportal\.com|imrworldwide\.com|scorecardresearch\.com|quantserve\.com|pixel\.[a-z.]+|stats\.[a-z.]+|analytics\.[a-z.]+|gravatar\.com|google-analytics\.com|googletagmanager\.com|facebook\.com|addthis\.com|sharethis\.com|chartbeat\.(?:com|net)|parsely\.com|outbrain\.com|taboola\.com)$/i;
const TRACKER_FILE = /(?:^|[/_.-])(?:pixel|1x1|spacer|blank|transparent|clear|trans|beacon|tracking|tracker)\.(?:gif|png|jpe?g|webp)$/i;
const TRACKER_PATH = /\/(?:stats?|track|tracking|beacon|pixel|b\/ss|ad[sx]?)\/|\/1x1[/._]/i;
// Words that name a logo, a placeholder or a generic share card rather than a news picture.
const JUNK_WORD = /(?:^|[\W_])(?:logos?|placeholders?|default|fallback|blank|spacer|avatars?|icons?|favicons?|sprites?|badges?|buttons?|watermark|masthead|wordmark|apple-touch|no-?image|noimage|missing|generic|share-?default|social-?default|og-?default|site-?image|brand-?image|header-?image)(?:[\W_]|$)/i;
const BAD_FORMAT = /\.(?:svg|svgz|gif|ico|bmp|tiff?)(?:[?#]|$)/i;

/** Why a picture URL (and what is known of its size) must not air, or null when it may. */
export function rejectReason(url, { w = 0, h = 0, local = false } = {}) {
  if (typeof url !== 'string' || !url) return 'empty';
  if (local) {
    if (!/^file:/i.test(url)) return 'scheme';
  } else if (!/^https?:\/\//i.test(url)) return 'scheme';
  let u;
  try {
    u = new URL(url);
  } catch {
    return 'invalid';
  }
  const file = decodeURIComponent(u.pathname.split('/').pop() || '').toLowerCase();
  const dir = decodeURIComponent(u.pathname.split('/').slice(-2, -1)[0] || '').toLowerCase();
  if (BAD_FORMAT.test(u.pathname)) return 'format';
  if (!local && (TRACKER_HOST.test(u.hostname) || TRACKER_FILE.test(u.pathname) || TRACKER_PATH.test(u.pathname))) return 'tracker';
  if (JUNK_WORD.test(file) || /^(?:logos?|icons?|avatars?|placeholders?|sprites?|badges?)$/.test(dir)) return 'logo';
  if (w && w < MIN_WIDTH) return 'small';
  if (h && h < 120) return 'small';
  if (w && h && (w / h < 0.5 || w / h > 3.2)) return 'shape';
  return null;
}

/** A remote picture URL that may be fetched and aired (kept for older callers). */
export const isUsableImage = (url) => typeof url === 'string' && /^https?:\/\//i.test(url) && rejectReason(url) === null;

// ---------------------------------------------------------------- sizes and safe upgrades

// Query parameters that sign a URL: changing anything else breaks the signature.
const SIGNED = /[?&](?:s|sig|signature|token|hmac|hash|key|expires|policy|x-amz-[a-z-]+|auth|ixlib)=/i;

/** Width (and height) a picture URL itself declares, from well-known CDN and CMS patterns. */
export function sizeFromUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const p = u.pathname;
  const q = u.searchParams;
  let m;
  if (/ichef\.bbci\.co\.uk$/i.test(u.hostname) && (m = p.match(/\/(?:ace\/(?:standard|ws|branded_news)|news)\/(\d{2,4})\//))) return { w: +m[1], h: Math.round(+m[1] * 0.5625) };
  if (/(?:^|\.)npr\.org$/i.test(u.hostname) && q.get('s')) return { w: +q.get('s') || 0, h: 0 };
  if (/365dm\.com$/i.test(u.hostname) && (m = p.match(/\/(\d{2,4})x(\d{2,4})\//))) return { w: +m[1], h: +m[2] };
  if ((m = p.match(/\/w:(\d{2,4})\//))) return { w: +m[1], h: 0 };
  if ((m = p.match(/\/16x9_(\d{2,4})\//))) return { w: +m[1], h: Math.round(+m[1] * 0.5625) };
  if ((m = p.match(/[_-](\d{2,4})x(\d{2,4})\.(?:jpe?g|png|webp|avif)$/i))) return { w: +m[1], h: +m[2] };
  if ((m = p.match(/\/(\d{2,4})x(\d{2,4})\//))) return { w: +m[1], h: +m[2] };
  if ((m = p.match(/\/upload\/(?:[^/]*,)?w_(\d{2,4})/))) return { w: +m[1], h: 0 };
  for (const key of ['w', 'width', 'imwidth', 'wid']) {
    const v = Number(q.get(key));
    if (v > 0) return { w: v, h: Number(q.get(key === 'w' ? 'h' : 'height')) || 0 };
  }
  const resize = q.get('resize') || q.get('fit');
  if (resize && (m = resize.match(/^(\d{2,4})[,x](\d{2,4})$/))) return { w: +m[1], h: +m[2] };
  return null;
}

/**
 * Larger renditions of a thumbnail URL, to try before the original. Only
 * patterns whose larger sizes are known to exist on that CDN, or generic resize
 * parameters on URLs that are not signed. Returns [] when nothing is safe.
 */
export function upgradeUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return [];
  }
  const size = sizeFromUrl(url);
  const w = size?.w || 0;
  if (w >= 900) return [];
  const out = [];
  const swap = (from, to, width, height = 0) => {
    const next = url.replace(from, to);
    if (next !== url) out.push({ url: next, w: width, h: height });
  };
  const host = u.hostname;
  let m;
  if (/ichef\.bbci\.co\.uk$/i.test(host)) swap(/\/(ace\/(?:standard|ws|branded_news)|news)\/\d{2,4}\//, '/$1/976/', 976, 549);
  else if (/(?:^|\.)npr\.org$/i.test(host) && u.searchParams.get('s')) {
    u.searchParams.set('s', '1400');
    out.push({ url: u.href, w: 1400, h: 0 });
  } else if (/365dm\.com$/i.test(host) && w < 768) swap(/\/\d{2,4}x\d{2,4}\//, '/768x432/', 768, 432);
  else if (/(?:^|\.)france24\.com$|(?:^|\.)rfi\.fr$/i.test(host)) swap(/\/w:\d{2,4}\//, '/w:1024/', 1024, 0);
  else if (/(?:^|\.)cbc\.ca$/i.test(host)) swap(/\/16x9_\d{2,4}\//, '/16x9_940/', 940, 529);
  else if (SIGNED.test(u.search)) return [];
  else if ((m = u.pathname.match(/\/upload\/((?:[^/]*,)?)w_\d{2,4}/))) swap(/(\/upload\/(?:[^/]*,)?)w_\d{2,4}/, '$1w_1200', 1200, 0);
  else if (/-\d{2,4}x\d{2,4}\.(?:jpe?g|png|webp)$/i.test(u.pathname) && w && w < GOOD_WIDTH && /wp-content|uploads/i.test(u.pathname)) {
    // WordPress size suffix: the file without it is the original upload.
    u.pathname = u.pathname.replace(/-\d{2,4}x\d{2,4}(\.(?:jpe?g|png|webp))$/i, '$1');
    out.push({ url: u.href, w: 1200, h: 0 });
  } else if (w && w < GOOD_WIDTH) {
    // Generic resizers (Photon, imgix-like): a bigger width, height scaled to keep the shape.
    const keyW = ['w', 'width', 'imwidth', 'wid'].find((k) => u.searchParams.get(k));
    if (keyW) {
      const keyH = keyW === 'w' ? 'h' : 'height';
      const h = Number(u.searchParams.get(keyH)) || 0;
      u.searchParams.set(keyW, '1200');
      if (h) u.searchParams.set(keyH, String(Math.round((h * 1200) / w)));
      out.push({ url: u.href, w: 1200, h: h ? Math.round((h * 1200) / w) : 0 });
    } else if ((m = (u.searchParams.get('resize') || '').match(/^(\d{2,4})([,x])(\d{2,4})$/))) {
      u.searchParams.set('resize', `1200${m[2]}${Math.round((+m[3] * 1200) / +m[1])}`);
      out.push({ url: u.href, w: 1200, h: Math.round((+m[3] * 1200) / +m[1]) });
    }
  }
  return out.filter((c) => c.url !== url && rejectReason(c.url) === null);
}

// ---------------------------------------------------------------- feed items

const IMAGE_FILE = /\.(?:png|jpe?g|webp|avif)(?:[?#]|$)/i;
const LOCAL_IMAGE = /\.(?:png|jpe?g|webp)$/i;

/**
 * Resolve a picture reference found in a feed: absolute http(s) URLs as they
 * are; a relative path against the item's link (remote feeds) or, for the
 * operator's LOCAL feeds only, inside the feed's own folder as a file: URL
 * (never outside it, never an absolute path or another scheme).
 */
export function resolveRef(ref, { base = null, baseDir = null, from = null } = {}) {
  const raw = unescapeAttr(String(ref ?? '').trim());
  if (!raw || raw.length > 2048 || /^data:/i.test(raw)) return null;
  if (/^https?:\/\//i.test(raw)) return { url: raw, local: false };
  if (raw.startsWith('//')) return { url: `https:${raw}`, local: false };
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return null; // file:, javascript:, ...
  if (baseDir) {
    if (raw.startsWith('/') || raw.startsWith('\\') || !LOCAL_IMAGE.test(raw.split(/[?#]/)[0])) return null;
    // Relative to the referring file's folder (`from`), but never outside the feed's folder.
    const root = path.resolve(baseDir);
    const file = path.resolve(from ? path.resolve(from) : root, raw.split(/[?#]/)[0]);
    return file.startsWith(root + path.sep) ? { url: pathToFileURL(file).href, local: true } : null;
  }
  // Remote feeds: a relative reference is resolved only against an http(s) page URL (article pages).
  if (base && /^https?:\/\//i.test(base)) {
    try {
      return { url: new URL(raw, base).href, local: false };
    } catch {
      return null;
    }
  }
  return null;
}

const ATTR_RE = /([a-zA-Z_:][-\w:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
function attrsOf(tag) {
  const out = {};
  for (const m of tag.matchAll(ATTR_RE)) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  return out;
}

/** The largest candidate of a srcset ("a.jpg 320w, b.jpg 1024w" or "a.jpg 1x, b.jpg 2x"). */
export function largestSrcset(srcset) {
  let best = null;
  for (const part of String(srcset || '').split(/,\s+(?=\S)/)) {
    const [url, desc = ''] = part.trim().split(/\s+/);
    if (!url) continue;
    const w = /^\d+w$/.test(desc) ? parseInt(desc, 10) : /^[\d.]+x$/.test(desc) ? Math.round(parseFloat(desc) * 400) : 0;
    if (!best || w > best.w) best = { url, w };
  }
  return best;
}

/** <img>/<source> pictures inside an item's HTML (linear scan, bounded tags). */
function htmlPictures(html, push) {
  const s = String(html || '').slice(0, 200_000);
  for (const m of s.matchAll(/<(img|source)\b[^>]{0,2000}>/gi)) {
    const a = attrsOf(m[0]);
    const set = largestSrcset(a.srcset || a['data-srcset']);
    if (set) push(set.url, { w: set.w || Number(a.width) || 0, h: set.w ? 0 : Number(a.height) || 0, via: 'inline' });
    const src = a['data-src'] || a['data-original'] || a['data-lazy-src'] || a.src;
    if (src && m[1].toLowerCase() === 'img') push(src, { w: Number(a.width) || 0, h: Number(a.height) || 0, via: 'inline' });
  }
}

const text = (v) => (v === undefined || v === null ? '' : typeof v === 'object' ? text(Array.isArray(v) ? v[0] : v['#text']) : String(v));

/**
 * Every picture a feed item offers, as [{ url, w, h, via, local }] (unranked).
 * `link` resolves relative references of remote feeds; `baseDir` (local feeds
 * from the operator's list only) resolves them inside the feed's folder.
 */
export function feedCandidates(item, { link = null, baseDir = null } = {}) {
  const out = [];
  const push = (ref, { w = 0, h = 0, via }) => {
    const r = resolveRef(ref, { base: link, baseDir });
    if (r) out.push({ url: r.url, local: r.local, w: Number(w) || 0, h: Number(h) || 0, via });
  };
  const media = (nodes, via) => {
    for (const node of asArray(nodes)) {
      if (!node || typeof node !== 'object') continue;
      const url = node['@_url'] || node['@_href'];
      const kind = `${node['@_type'] || ''} ${node['@_medium'] || ''}`.trim();
      // A video or audio item may still carry a poster frame (its media:thumbnail children).
      const isImage = via === 'thumbnail' || (kind ? /image/i.test(kind) : !/\.(?:mp4|m3u8|mp3|m4a|webm|mov|ogg)(?:[?#]|$)/i.test(url || ''));
      if (url && isImage) push(url, { w: node['@_width'], h: node['@_height'], via });
      if (node['media:content']) media(node['media:content'], 'media');
      if (node['media:thumbnail']) media(node['media:thumbnail'], 'thumbnail');
    }
  };
  media(item['media:content'], 'media');
  media(item['media:group'], 'media');
  media(item['media:thumbnail'], 'thumbnail');
  for (const enc of asArray(item.enclosure)) {
    const url = enc?.['@_url'];
    if (url && (/image/i.test(enc['@_type'] || '') || (!enc['@_type'] && IMAGE_FILE.test(url)))) push(url, { via: 'enclosure' });
  }
  for (const l of asArray(item.link)) {
    if (l?.['@_rel'] === 'enclosure' && /image/i.test(l['@_type'] || '')) push(l['@_href'], { w: l['@_width'], via: 'enclosure' });
  }
  for (const img of asArray(item.image)) {
    const url = typeof img === 'string' ? img : img?.url || img?.['@_href'] || img?.['@_url'] || text(img);
    if (url) push(text(url), { w: img?.width || img?.['@_width'], h: img?.height || img?.['@_height'], via: 'image' });
  }
  const itunes = item['itunes:image'];
  if (itunes?.['@_href']) push(itunes['@_href'], { via: 'image' });
  for (const key of ['content:encoded', 'content', 'description', 'summary']) htmlPictures(text(item[key]), push);
  return out;
}

// ---------------------------------------------------------------- article pages

const ARTICLE_TYPES = /^(?:NewsArticle|Article|ReportageNewsArticle|AnalysisNewsArticle|BackgroundNewsArticle|OpinionNewsArticle|ReviewNewsArticle|BlogPosting|LiveBlogPosting|Report|ScholarlyArticle|TechArticle|WebPage)$/;

/**
 * The pictures of the article objects in a JSON-LD block: "image" (a URL, an
 * ImageObject, a list, or an {"@id"} reference into the block's @graph, as
 * Yoast and most CMSs write it), else "thumbnailUrl" / "primaryImageOfPage".
 */
function jsonLdImages(doc, push) {
  const nodes = [];
  const walk = (n, depth) => {
    if (!n || depth > 6 || nodes.length > 200) return;
    if (Array.isArray(n)) return n.slice(0, 50).forEach((x) => walk(x, depth + 1));
    if (typeof n !== 'object') return;
    nodes.push(n);
    if (n['@graph']) walk(n['@graph'], depth + 1);
  };
  walk(doc, 0);
  const byId = new Map(nodes.filter((n) => typeof n['@id'] === 'string').map((n) => [n['@id'], n]));
  const add = (img, depth = 0) => {
    for (const v of asArray(img).slice(0, 6)) {
      if (typeof v === 'string') {
        if (/^(?:https?:)?\/\/|^\//.test(v) && !/#[\w-]*$/.test(v)) push(v, { via: 'jsonld' });
      } else if (v && typeof v === 'object') {
        const ref = !v.url && !v.contentUrl && typeof v['@id'] === 'string' ? byId.get(v['@id']) : null;
        if (ref && depth < 2) add(ref, depth + 1);
        const url = v.url || v.contentUrl;
        if (typeof url === 'string') push(url, { w: Number(v.width?.value ?? v.width) || 0, h: Number(v.height?.value ?? v.height) || 0, via: 'jsonld' });
      }
    }
  };
  for (const n of nodes) {
    const types = asArray(n['@type']).map(String);
    if (!types.some((t) => ARTICLE_TYPES.test(t))) continue;
    if (n.image) add(n.image);
    else if (n.primaryImageOfPage) add(n.primaryImageOfPage);
    else if (n.thumbnailUrl) add(n.thumbnailUrl);
  }
}

/**
 * Pictures an article page declares for itself, as [{ url, w, h, via, local }],
 * plus the page's AMP version (`amp`), which often carries them when the page
 * does not. `baseDir` is set only for the local fixture pages of the operator's
 * own feeds (relative references stay inside that folder).
 */
export function pageCandidates(html, pageUrl, { baseDir = null, from = null } = {}) {
  const s = String(html || '').slice(0, 800_000);
  const out = [];
  const push = (ref, { w = 0, h = 0, via }) => {
    const r = resolveRef(ref, { base: pageUrl, baseDir, from });
    if (r) out.push({ url: r.url, local: r.local, w: Number(w) || 0, h: Number(h) || 0, via });
  };
  let amp = null;
  let og = null;
  for (const m of s.matchAll(/<meta\b[^>]{0,1500}>/gi)) {
    const a = attrsOf(m[0]);
    const key = (a.property || a.name || a.itemprop || '').toLowerCase();
    const content = a.content;
    if (!content) continue;
    if (key === 'og:image' || key === 'og:image:url' || key === 'og:image:secure_url') {
      if (og && og.url === content) continue;
      og = { url: content, w: 0, h: 0 };
      push(content, { via: 'og' });
    } else if ((key === 'og:image:width' || key === 'og:image:height') && out.length && out.at(-1).via === 'og') {
      out.at(-1)[key.endsWith('width') ? 'w' : 'h'] = Number(content) || 0;
    } else if (key === 'twitter:image' || key === 'twitter:image:src') push(content, { via: 'twitter' });
    else if (key === 'image' && a.itemprop) push(content, { via: 'itemprop' });
    else if (key === 'thumbnail' || key === 'parsely-image-url' || key === 'sailthru.image.full') push(content, { via: 'meta' });
  }
  for (const m of s.matchAll(/<link\b[^>]{0,1500}>/gi)) {
    const a = attrsOf(m[0]);
    const rel = (a.rel || '').toLowerCase();
    if (rel === 'image_src' && a.href) push(a.href, { via: 'image_src' });
    if (rel === 'amphtml' && a.href && !amp && !baseDir) amp = resolveRef(a.href, { base: pageUrl })?.url || null;
  }
  // JSON-LD blocks: found with indexOf (linear), parsed defensively.
  let from = 0;
  for (let n = 0; n < 12; n++) {
    const open = s.slice(from).search(/<script\b[^>]{0,300}application\/ld\+json[^>]{0,300}>/i);
    if (open < 0) break;
    const start = s.indexOf('>', from + open) + 1;
    const end = s.indexOf('</script>', start);
    if (start <= 0 || end < 0) break;
    try {
      jsonLdImages(JSON.parse(s.slice(start, Math.min(end, start + 200_000))), push);
    } catch {}
    from = end + 9;
  }
  return { candidates: out, amp: amp && /^https?:\/\//i.test(amp) ? amp : null };
}

// ---------------------------------------------------------------- ranking

/**
 * Rank candidates into the URLs to try, best first: gates applied, upgrades
 * inserted ahead of their originals, duplicates removed, pictures of 640 px and
 * more ahead of smaller ones. Returns [{ url, w, via, local }].
 */
export function rankPictures(candidates) {
  const seen = new Set();
  const list = [];
  for (const c of candidates) {
    const known = sizeFromUrl(c.url);
    const w = c.w || known?.w || 0;
    const h = c.h || known?.h || 0;
    const reason = rejectReason(c.url, { w, h, local: c.local });
    if (reason) continue;
    const order = list.length;
    if (!c.local) {
      for (const up of upgradeUrl(c.url)) list.push({ url: up.url, w: up.w, via: c.via, local: false, order: order - 0.5, upgraded: true });
    }
    list.push({ url: c.url, w: w || DEFAULT_WIDTH[c.via] || 400, known: !!w, via: c.via, local: !!c.local, order });
  }
  const score = (c) => Math.min(c.w, MAX_RANK_WIDTH) + (c.w >= GOOD_WIDTH ? 10_000 : 0);
  list.sort((a, b) => score(b) - score(a) || a.order - b.order);
  const out = [];
  for (const c of list) {
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    out.push({ url: c.url, w: c.w, via: c.via, local: c.local, ...(c.upgraded ? { upgraded: true } : {}) });
    if (out.length >= MAX_CANDIDATES) break;
  }
  return out;
}

/** Best remote picture URL of a feed item, or null (the original single-URL API). */
export function extractImage(item) {
  return rankPictures(feedCandidates(item).filter((c) => !c.local))[0]?.url || null;
}

// ---------------------------------------------------------------- picture bytes

/** Width and height from the first bytes of a PNG, JPEG, GIF or WebP; null when unknown. */
export function imageSize(buf) {
  if (!buf || buf.length < 24) return null;
  if (buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf.toString('latin1', 0, 4) === 'GIF8') return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
    const kind = buf.toString('latin1', 12, 16);
    if (kind === 'VP8X' && buf.length >= 30) return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
    if (kind === 'VP8 ' && buf.length >= 30) return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    if (kind === 'VP8L' && buf.length >= 25) {
      const b = buf.readUInt32LE(21);
      return { w: 1 + (b & 0x3fff), h: 1 + ((b >> 14) & 0x3fff) };
    }
    return null;
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let o = 2;
    while (o + 9 < buf.length) {
      if (buf[o] !== 0xff) {
        o++;
        continue;
      }
      const marker = buf[o + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        o += 2;
        continue;
      }
      const len = buf.readUInt16BE(o + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { w: buf.readUInt16BE(o + 7), h: buf.readUInt16BE(o + 5) };
      if (len < 2) return null;
      o += 2 + len;
    }
  }
  return null;
}
