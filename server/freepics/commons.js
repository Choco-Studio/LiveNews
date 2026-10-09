// Wikimedia Commons for the free-picture desk (docs/roadmap/FOTOS_LIBRES.md §3.3, level 1): the files an entity
// points to (Wikidata P18), and a search inside its Commons category (P373). Every file comes back with what the
// legal gate and the provenance check need: its licence as Commons states it, the author, the credit line, the
// categories (hidden ones too: deletion requests and licence reviews are hidden categories), restrictions,
// quality assessments and dates.
//
// Commons answers 429 to bursts: requests go out one at a time with a gap, a 429 waits for Retry-After once, and
// file details are asked for in batches of up to 50 titles.
//
//   new Commons({ fetchImpl, gapMs }).files(['File:A.jpg', ...]) -> [file]     (in the order asked; missing dropped)
//   .search(text, { category, limit }) -> [file]                                  (bitmap files, Commons' relevance order)
//   parseFile(page) -> file | null                                                (pure, exported for tests)
//   file: { name, url, width, height, mime, title, description, licence: {id, version, label}, licenceName,
//           licenceUrl, author, credit, date, uploaded, categories: [..], restrictions: [..], assessments: [..], page }
import { readLicence } from './licence.js';
import { USER_AGENT } from './wikidata.js';

const API = 'https://commons.wikimedia.org/w/api.php';
const META = 'Artist|Credit|LicenseShortName|LicenseUrl|UsageTerms|ImageDescription|ObjectName|DateTimeOriginal|Categories|Restrictions|Assessments|Copyrighted|AttributionRequired';

export const stripHtml = (s) =>
  String(s ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const list = (s) => stripHtml(s).split('|').map((x) => x.trim()).filter(Boolean);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** A Commons API page (prop=imageinfo with extmetadata) -> the desk's file record, or null. */
export function parseFile(page) {
  const ii = page?.imageinfo?.[0];
  if (!ii || page.missing) return null;
  const md = ii.extmetadata || {};
  const v = (k) => md[k]?.value;
  const licenceName = stripHtml(v('LicenseShortName') || v('UsageTerms'));
  const licenceUrl = stripHtml(v('LicenseUrl'));
  return {
    name: String(page.title || ''),
    url: ii.thumburl || ii.url,
    original: ii.url,
    width: ii.thumbwidth || ii.width,
    height: ii.thumbheight || ii.height,
    fullWidth: ii.width,
    mime: ii.mime,
    title: stripHtml(v('ObjectName')) || String(page.title || '').replace(/^File:/, '').replace(/\.[a-z]{3,4}$/i, ''),
    description: stripHtml(v('ImageDescription')).slice(0, 400),
    licence: readLicence(licenceName, licenceUrl),
    licenceName,
    licenceUrl,
    author: stripHtml(v('Artist')).slice(0, 200),
    credit: stripHtml(v('Credit')).slice(0, 200),
    date: stripHtml(v('DateTimeOriginal')).slice(0, 40) || null,
    uploaded: ii.timestamp || null,
    categories: list(v('Categories')),
    restrictions: list(v('Restrictions')),
    assessments: list(v('Assessments')),
    page: ii.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(String(page.title || '').replace(/ /g, '_'))}`,
  };
}

export class Commons {
  constructor({ fetchImpl = fetch, gapMs = 300, timeoutMs = 10000, thumbWidth = 1280, log = console } = {}) {
    this.fetch = fetchImpl;
    this.gapMs = gapMs;
    this.timeoutMs = timeoutMs;
    this.thumbWidth = thumbWidth;
    this.log = log;
    this.queue = Promise.resolve();
    this.last = 0;
    this.cache = new Map(); // file name -> file (details do not change within a run)
  }

  /** One API call, after the previous one and the gap; a 429 waits for Retry-After (max 20 s) and tries once more. */
  api(params) {
    const run = async () => {
      const gap = this.last + this.gapMs - Date.now();
      if (gap > 0) await wait(gap);
      const u = new URL(API);
      for (const [k, val] of Object.entries({ format: 'json', formatversion: '2', ...params })) u.searchParams.set(k, val);
      for (let attempt = 0; ; attempt++) {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), this.timeoutMs);
        try {
          const res = await this.fetch(u.toString(), { headers: { 'user-agent': USER_AGENT, accept: 'application/json' }, signal: ctl.signal });
          this.last = Date.now();
          if (res.status === 429 && attempt === 0) {
            const header = Number(res.headers?.get?.('retry-after'));
            const after = Math.min(20, Number.isFinite(header) && header >= 0 ? header : 5);
            await wait(after * 1000);
            continue;
          }
          if (!res.ok) throw new Error(`Commons HTTP ${res.status}`);
          return await res.json();
        } finally {
          clearTimeout(timer);
        }
      }
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  infoParams() {
    return { prop: 'imageinfo', iiprop: 'url|size|mime|timestamp|extmetadata', iiurlwidth: String(this.thumbWidth), iiextmetadatafilter: META, iiextmetadatalanguage: 'en' };
  }

  /** Details of named files ("File:X.jpg" or "X.jpg"), in the order asked; files Commons does not have are dropped. */
  async files(names) {
    const want = [...new Set((names || []).filter(Boolean).map((n) => (/^file:/i.test(n) ? `File:${n.slice(5)}` : `File:${n}`).replace(/_/g, ' ')))];
    const todo = want.filter((n) => !this.cache.has(n));
    for (let i = 0; i < todo.length; i += 50) {
      const batch = todo.slice(i, i + 50);
      const data = await this.api({ action: 'query', titles: batch.join('|'), ...this.infoParams() });
      // Commons normalises titles ("File:a b.JPG" may come back as "File:A b.JPG"): map them back
      const norm = new Map((data?.query?.normalized || []).map((n) => [n.to, n.from]));
      for (const pg of data?.query?.pages || []) {
        const f = parseFile(pg);
        const asked = norm.get(pg.title) || pg.title;
        this.cache.set(asked, f);
        if (asked !== pg.title) this.cache.set(pg.title, f);
      }
      for (const n of batch) if (!this.cache.has(n)) this.cache.set(n, null);
    }
    return want.map((n) => this.cache.get(n)).filter(Boolean);
  }

  /** Bitmap files matching `text` (optionally inside a category and its direct files), Commons' relevance order. */
  async search(text, { category = null, limit = 12 } = {}) {
    const q = [String(text ?? '').trim(), category ? `incategory:"${String(category).replace(/"/g, '')}"` : '', 'filetype:bitmap'].filter(Boolean).join(' ');
    const data = await this.api({ action: 'query', generator: 'search', gsrnamespace: '6', gsrsearch: q, gsrlimit: String(Math.min(50, limit)), ...this.infoParams() });
    const pages = [...(data?.query?.pages || [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    const out = [];
    for (const pg of pages) {
      const f = parseFile(pg);
      if (!f) continue;
      this.cache.set(f.name, f);
      out.push(f);
    }
    return out;
  }
}
