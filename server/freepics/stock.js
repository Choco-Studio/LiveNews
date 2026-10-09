// Phase-2 sources of the free-picture desk (docs/roadmap/FOTOS_LIBRES.md §3.3): what Wikidata and Commons do not
// cover. Both return file records shaped like commons.js's, so the same gates judge them.
//
//   new Pixabay({ key }).search(q)    level 5, stock: generic scenes and products (the Pixabay Content License:
//                                     commercial use and changes allowed). Never an AI-generated or low-quality
//                                     picture; results cached 24 h, as Pixabay's terms ask.
//   new NasaImages().search(q)        level 3, official: NASA's image library (US federal works: public domain),
//                                     for science and space. A picture credited to anyone but NASA is dropped
//                                     (the library holds some third-party copyrighted ones).
import { readLicence } from './licence.js';
import { stripHtml } from './commons.js';
import { USER_AGENT } from './wikidata.js';

const DAY = 86400_000;
const get = async (fetchImpl, url, timeoutMs) => {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { headers: { 'user-agent': USER_AGENT, accept: 'application/json' }, signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
};
const mimeOf = (url) => (/\.png(\?|$)/i.test(url) ? 'image/png' : /\.webp(\?|$)/i.test(url) ? 'image/webp' : 'image/jpeg');

/** A Pixabay API hit → the desk's file record, or null (AI-generated, low quality, not a photo). */
export function parsePixabayHit(h) {
  if (!h || h.type !== 'photo' || h.isAiGenerated || h.isLowQuality || !h.largeImageURL) return null;
  const w = Number(h.imageWidth) || 0;
  const hh = Number(h.imageHeight) || 0;
  const scale = w > 1280 ? 1280 / w : 1;
  const tags = String(h.tags || '');
  return {
    name: `pixabay:${h.id}`,
    url: h.largeImageURL,
    width: Math.round(w * scale),
    height: Math.round(hh * scale),
    fullWidth: w,
    mime: mimeOf(h.largeImageURL),
    title: [...new Set(tags.split(',').map((t) => t.trim()).filter(Boolean))].join(', '),
    description: '',
    tags,
    licence: readLicence('Pixabay Content License'),
    licenceName: 'Pixabay Content License',
    licenceUrl: 'https://pixabay.com/service/license-summary/',
    author: stripHtml(h.user),
    credit: 'Pixabay',
    date: null,
    uploaded: null,
    categories: [],
    restrictions: [],
    assessments: [],
    page: h.pageURL,
    source: 'Pixabay',
  };
}

export class Pixabay {
  constructor({ key, fetchImpl = fetch, timeoutMs = 8000 } = {}) {
    this.key = key;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.cache = new Map(); // query -> { at, files }
  }

  get enabled() {
    return !!this.key;
  }

  async search(q, { limit = 12 } = {}) {
    const query = String(q ?? '').replace(/\s+/g, ' ').trim().slice(0, 100);
    if (!query || !this.enabled) return [];
    const hit = this.cache.get(query);
    if (hit && Date.now() - hit.at < DAY) return hit.files;
    const u = new URL('https://pixabay.com/api/');
    for (const [k, v] of Object.entries({ key: this.key, q: query, image_type: 'photo', orientation: 'horizontal', safesearch: 'true', min_width: '1280', per_page: String(Math.max(3, Math.min(50, limit))), lang: 'en' })) u.searchParams.set(k, v);
    const data = await get(this.fetch, u.toString(), this.timeoutMs);
    const files = (data?.hits || []).map(parsePixabayHit).filter(Boolean);
    this.cache.set(query, { at: Date.now(), files });
    if (this.cache.size > 500) this.cache.delete(this.cache.keys().next().value);
    return files;
  }
}

// credits that say the picture is someone else's, not NASA's
const NOT_NASA = /©|copyright|courtesy of|getty|reuters|associated press|\bap\b|afp|shutterstock|used with permission/i;

/** A NASA library item → a file record (sizes filled in later from its metadata), or null. */
export function parseNasaItem(item) {
  const d = item?.data?.[0];
  const href = item?.links?.find((l) => l.rel === 'preview' || l.render === 'image')?.href;
  if (!d || d.media_type !== 'image' || !href || !d.nasa_id) return null;
  const who = stripHtml([d.photographer, d.secondary_creator].filter(Boolean).join(' '));
  const text = `${d.description || ''} ${who}`;
  if (NOT_NASA.test(text)) return null;
  // the credit must SAY NASA: the library also holds partners' pictures that are not public domain ("ESA/ATG
  // medialab" under a NASA record, round 5, 8 Oct); a record with no credit at all stands on its NASA centre
  if (who ? !/\b(nasa|jpl|caltech\/jpl|goddard|kennedy space center|johnson space center|marshall space flight)\b/i.test(who) || /\b(esa|jaxa|csa|cnes|dlr|isro|roscosmos|ast\b)/i.test(who) : !d.center) return null;
  // an artist's concept, a rendering or a graphic is not a photograph of anything
  if (/\b(artist'?s? (concept|impression|rendering|illustration)|illustration|rendering|animation|graphic|infographic|diagram|chart|simulation)\b/i.test(`${d.title} ${d.description || ''}`)) return null;
  const base = href.replace(/~(thumb|small|medium|large|orig)\.(jpe?g|png)$/i, '');
  return {
    name: `nasa:${d.nasa_id}`,
    nasaId: d.nasa_id,
    url: `${base}~large.jpg`.replace(/ /g, '%20'),
    width: 0,
    height: 0,
    fullWidth: 0,
    mime: 'image/jpeg',
    title: stripHtml(d.title).slice(0, 200),
    description: stripHtml(d.description).slice(0, 400),
    tags: (d.keywords || []).join(', '),
    licence: readLicence('PD-USGov-NASA'),
    licenceName: 'Public domain (NASA)',
    licenceUrl: 'https://www.nasa.gov/nasa-brand-center/images-and-media/',
    author: who || `NASA ${d.center || ''}`.trim(),
    credit: 'NASA',
    date: d.date_created ? d.date_created.slice(0, 10) : null,
    uploaded: null,
    categories: [],
    restrictions: [],
    assessments: [],
    page: `https://images.nasa.gov/details/${encodeURIComponent(d.nasa_id)}`,
    source: 'NASA',
  };
}

export class NasaImages {
  constructor({ fetchImpl = fetch, timeoutMs = 8000 } = {}) {
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.cache = new Map();
  }

  get enabled() {
    return true;
  }

  /** Images for a query, newest first; the first `sized` get their real size from their metadata (others are dropped). */
  async search(q, { limit = 10, sized = 4 } = {}) {
    const query = String(q ?? '').replace(/\s+/g, ' ').trim().slice(0, 100);
    if (!query) return [];
    const hit = this.cache.get(query);
    if (hit && Date.now() - hit.at < DAY) return hit.files;
    const u = new URL('https://images-api.nasa.gov/search');
    for (const [k, v] of Object.entries({ q: query, media_type: 'image', page_size: String(limit) })) u.searchParams.set(k, v);
    const data = await get(this.fetch, u.toString(), this.timeoutMs);
    const files = (data?.collection?.items || []).map(parseNasaItem).filter(Boolean).slice(0, sized);
    await Promise.all(
      files.map(async (f) => {
        try {
          const meta = await get(this.fetch, `https://images-assets.nasa.gov/image/${encodeURIComponent(f.nasaId)}/metadata.json`, this.timeoutMs);
          const w = Number(meta['File:ImageWidth'] || meta['EXIF:ImageWidth'] || meta['Composite:ImageSize']?.split?.(/[x ]/)[0]) || 0;
          const h = Number(meta['File:ImageHeight'] || meta['EXIF:ImageHeight'] || meta['Composite:ImageSize']?.split?.(/[x ]/)[1]) || 0;
          // "~large" is at most 1920 wide
          const scale = w > 1920 ? 1920 / w : 1;
          Object.assign(f, { fullWidth: w, width: Math.round(w * scale), height: Math.round(h * scale) });
        } catch {
          /* no size: the gates drop it */
        }
      }),
    );
    const sizedFiles = files.filter((f) => f.width > 0);
    this.cache.set(query, { at: Date.now(), files: sizedFiles });
    return sizedFiles;
  }
}
