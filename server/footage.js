// Footage: moving pictures of a story's PLACE for the correspondent links (owner 4 Oct: "cargar vídeos,
// pixelarlos con nuestro estilo y poner un reportero hablando sobre ello"). The client turns them into the
// channel's pixel style (public/js/footage/); this desk finds them and keeps a copy the client reads
// same-origin (/api/vid/<id>.webm).
//
// The rules are the FILE photo's (imagesearch.js), because footage is a file picture that moves:
//   - it shows the PLACE (a city, its harbour, its streets), never the event: the query is the place's name
//     alone, and clips whose title names an event (a fire, a flood, a protest), a person speaking (an
//     interview, a speech, a lecture) or a production (a trailer, a song, a match) are left out;
//   - never on a grave story: tourists on a sunny promenade under a story of deaths would mislead and hurt
//     (the link then shows its desk backdrop and the story's own picture);
//   - freely licensed (Wikimedia Commons), credited on air "FILE · <author> · <licence>".
// Commons is a shared service with tight limits (HTTP 429 seen at a handful of requests a minute from one
// address): one request at a time, two seconds apart, the pause a 429 asks for (a minute at least), every
// answer (also "nothing usable") cached by place, and the clip itself downloaded once (a 240p/360p WebM
// transcode, a few megabytes) into data/footage/.
//
//   footageQuery(location, { grave })     -> { q, name } | null
//   parseCommonsVideos(data)              -> [clip]   (Commons API reply, free licences, a playable WebM each)
//   usableFootage(clip, name)             -> bool
//   new FootageDesk({ dir, fetchImpl, enabled }).find(location, opts) -> { id, credit, ... } | null
//   .file(id) -> absolute path | null
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { guardedFetch, readCapped } from './net.js';
import { fileCredit } from './imagesearch.js';

export const FOOTAGE_LIMITS = { minSeconds: 8, maxSeconds: 1200, maxBytes: 14 * 1024 * 1024, minWidth: 300, aspect: 1.3 };
const FREE_LICENCE = /^(cc0|public domain|pd\b|pd-|cc[ -]by(-sa)?(\s|$|-)\s*\d?)/i;
// what a clip of the place must not be
const NOT_FOOTAGE =
  /\b(interview|lecture|speech|talk|talks|conference|presentation|press|trailer|teaser|game|games|match|goal|goals|highlights|song|music|musical|concert|dance|dancing|tutorial|how to|animation|animated|map|maps|webinar|podcast|ceremony|funeral|wedding|protest|protests|rally|march|parade|election|debate|campaign|commercial|advert|advertisement|documentary|film|movie|episode|news|report|tv|broadcast|cctv|dashcam|crash|accident|police|military|army|soldiers?|war|fire|fires|wildfire|flood|floods|flooding|storm|hurricane|typhoon|cyclone|earthquake|quake|tsunami|eruption|riot|attack|explosion|360|vr|3d|game ?play|minecraft|simulator|rendering|cgi|slideshow|screencast|logo|intro)\b/i;
// people and occasions: footage shows a place, never someone the story is not about (owner: the set never shows
// figures the channel did not report), never a child, never an event filmed elsewhere. People are looked for in
// the description too; occasions in the title only (descriptions say "visit our site", "official channel")
const PEOPLE =
  /\b(president|presidential|chancellor|ministers?|prime minister|king|queen|prince|princess|pope|mayor|governor|senator|ambassador|delegation|children|child|kids|baby|babies|pupils|victims?|refugees?|nude|naked|nudist|topless|trump|biden|obama|putin|merkel|scholz|macron)\b/i;
const OCCASION =
  /\b(greets?|meets?|meeting|visits?|visited|summit|signing|remarks|statement|briefing|address|addresses|award|awards|celebration|festival|carnival|demonstration|strike|vigil|memorial|portrait|selfie|vlog|unboxing|review|school|students|hospital|covid|pandemic|vaccine|government|officials?|parliament|congress|migrants?)\b/i;
// what makes a shot of a place: a clip airs only when its title says it is one (in the languages Commons
// uploaders title in most); matched without accents
const GOOD =
  /\b(aerial|drone|skyline|cityscape|panorama|panoramic|street|streets|downtown|harbou?r|port|river|riverside|waterfront|promenade|square|city|centre|center|old town|view|views|time-?lapse|time lapse|walk|walking|walkthrough|tram|boat|ferry|bridge|beach|coast|bay|market|landscape|countryside|village|town|scenery|mountains?|lake|canal|valley|island|flight over|flying over|fly ?over|overflight|vue|aerienne|ville|rue|plage|quai|vista|aerea|ciudad|calle|playa|puerto|centro|rua|cidade|praia|luftaufnahmen?|stadt|stra(?:ss|ß)e|hafen|altstadt|blick|aussicht|rundflug|zeitraffer|veduta|citta|strada|spiaggia|porto)\b/i;
// transcodes the client can decode everywhere (VP9 first, small first: the pixel style needs 192x108)
const DERIVATIVES = ['240p.vp9.webm', '360p.vp9.webm', '240p.webm', '360p.webm', '180p.vp9.webm', '480p.vp9.webm'];

const stripHtml = (s) => String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const fold = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/**
 * The query for a link's footage: the place's own name ("MARSEILLE, FRANCE" -> "Marseille"), never an
 * event word; null for a grave story or a place too broad to film (a peninsula, a sea, a country is fine).
 */
export function footageQuery(location, { grave = false } = {}) {
  if (grave || !location?.place) return null;
  const first = String(location.place).split(',')[0].trim();
  if (!first || /\b(?:ocean|sea|gulf|coast|peninsula|region|northern|southern|eastern|western|central)\b/i.test(first)) {
    // "YUCATÁN PENINSULA, MEXICO": the country's name films better than a peninsula's
    const country = String(location.place).split(',')[1]?.trim();
    if (!country) return null;
    return footageQuery({ place: country }, { grave });
  }
  const name = first.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (c) => c.toUpperCase());
  if (NOT_FOOTAGE.test(name)) return null;
  return { q: name, name };
}

/** Commons API reply -> clips: free licence, a playable WebM (a transcode, or a small WebM original). */
export function parseCommonsVideos(data) {
  const pages = Array.isArray(data?.query?.pages) ? data.query.pages : Object.values(data?.query?.pages || {});
  const out = [];
  for (const pg of [...pages].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))) {
    const vi = pg?.videoinfo?.[0];
    if (!vi) continue;
    const md = vi.extmetadata || {};
    const licence = stripHtml(md.LicenseShortName?.value);
    if (!FREE_LICENCE.test(licence)) continue;
    const ders = Array.isArray(vi.derivatives) ? vi.derivatives : [];
    let pick = null;
    for (const key of DERIVATIVES) {
      pick = ders.find((d) => String(d.transcodekey || '') === key && /^https:\/\//.test(d.src || ''));
      if (pick) break;
    }
    let src = pick?.src || null;
    let width = Number(pick?.width) || 0;
    let height = Number(pick?.height) || 0;
    if (!src && /webm/i.test(vi.mime || '') && Number(vi.height) <= 480 && Number(vi.size) <= FOOTAGE_LIMITS.maxBytes) {
      src = vi.url;
      width = Number(vi.width) || 0;
      height = Number(vi.height) || 0;
    }
    if (!src) continue;
    out.push({
      src,
      width,
      height,
      duration: Number(vi.duration) || 0,
      title: String(pg.title || '').replace(/^File:/, '').replace(/\.[a-z0-9]{3,4}$/i, ''),
      description: stripHtml(md.ImageDescription?.value).slice(0, 200),
      licence,
      page: vi.descriptionurl || null,
      credit: fileCredit(md.Artist?.value, licence),
    });
  }
  return out;
}

/** Does a clip pass the gates: its place named in its title, landscape, long enough, nothing it must not be. */
export function usableFootage(c, name) {
  if (!c?.src || !/^https:\/\/upload\.wikimedia\.org\//.test(c.src)) return false;
  if (!(c.duration >= FOOTAGE_LIMITS.minSeconds && c.duration <= FOOTAGE_LIMITS.maxSeconds)) return false;
  if (!(c.width >= FOOTAGE_LIMITS.minWidth) || !(c.height > 0) || c.width / c.height < FOOTAGE_LIMITS.aspect) return false;
  const text = `${c.title} ${c.description}`;
  if (NOT_FOOTAGE.test(c.title) || NOT_FOOTAGE.test(c.description)) return false;
  if (PEOPLE.test(fold(text)) || OCCASION.test(fold(c.title))) return false;
  // the title names a shot of a place ("Marseille par drone", "Vieux-Port de Marseille"), not just the place
  if (!GOOD.test(fold(c.title)) && !/(?:stra(?:ss|ß)e|platz|ufer|brucke)\b/i.test(fold(c.title))) return false; // and German compounds (Hauptstraße, Alexanderplatz)
  return !!name && fold(text).includes(fold(name));
}

/** The best usable clip: from the air first, then a middling length (20 s to 3 min), then the search order. */
export function bestFootage(list, name) {
  const usable = list.filter((c) => usableFootage(c, name));
  const score = (c) => (/\b(aerial|drone|skyline|panorama|luftaufnahmen?|aerienne|aerea)\b/i.test(fold(c.title)) ? 2 : 0) + (c.duration >= 20 && c.duration <= 180 ? 1 : 0);
  return usable.map((c, i) => ({ c, i, s: score(c) })).sort((a, b) => b.s - a.s || a.i - b.i)[0]?.c || null;
}

function commonsUrl(q) {
  const u = new URL('https://commons.wikimedia.org/w/api.php');
  const p = {
    action: 'query',
    format: 'json',
    formatversion: '2',
    generator: 'search',
    gsrnamespace: '6',
    gsrsearch: `${q} filetype:video`,
    gsrlimit: '20',
    prop: 'videoinfo',
    viprop: 'url|size|mime|derivatives|extmetadata',
    viextmetadatafilter: 'Artist|LicenseShortName|ImageDescription',
    origin: '*',
  };
  for (const [k, v] of Object.entries(p)) u.searchParams.set(k, v);
  return u.toString();
}

const UA = 'GLOBIT24/1.0 (pixel news channel; footage desk; https://github.com/choco-studio/livenews)';
const ID_RE = /^f[0-9a-f]{16}$/;

export class FootageDesk {
  /**
   * @param o.dir        where clips are kept (data/footage)
   * @param o.enabled    false: find() answers null at once (offline demo, FOOTAGE=off)
   * @param o.maxCacheBytes  clips beyond this are pruned, oldest first
   */
  constructor({ dir, fetchImpl = fetch, enabled = true, timeoutMs = 8000, gapMs = 2000, pauseMs = 15 * 60_000, maxCacheBytes = 400 * 1024 * 1024, log = console, now = Date.now } = {}) {
    this.dir = dir;
    this.fetch = fetchImpl;
    this.enabled = !!enabled && !!dir;
    this.timeoutMs = timeoutMs;
    this.gapMs = gapMs;
    this.pauseMs = pauseMs;
    this.maxCacheBytes = maxCacheBytes;
    this.log = log;
    this.now = now;
    this.places = new Map(); // name -> { at, clip|null }
    this.meta = new Map(); // id -> clip record
    this.queue = Promise.resolve();
    this.lastCall = 0;
    this.pausedUntil = 0;
    this.failures = 0;
    if (this.enabled) {
      try {
        fs.mkdirSync(this.dir, { recursive: true });
        const index = JSON.parse(fs.readFileSync(path.join(this.dir, 'index.json'), 'utf8'));
        for (const [id, m] of Object.entries(index?.clips || {})) if (ID_RE.test(id) && fs.existsSync(path.join(this.dir, `${id}.webm`))) this.meta.set(id, m);
        // the places found lately (a restart asks Commons nothing it answered in the last day)
        for (const [key, e] of Object.entries(index?.places || {})) if (this.meta.has(e?.id) && this.now() - e.at < 24 * 3600_000) this.places.set(key, { at: e.at, clip: this.meta.get(e.id) });
      } catch {
        /* a fresh cache */
      }
    }
  }

  /** The kept file of a clip id, or null. */
  file(id) {
    if (!ID_RE.test(String(id)) || !this.meta.has(id)) return null;
    const f = path.join(this.dir, `${id}.webm`);
    return fs.existsSync(f) ? f : null;
  }

  /** One Commons request at a time, `gapMs` apart; a 429 pauses the desk. */
  call(url) {
    const run = async () => {
      if (this.now() < this.pausedUntil) throw new Error('paused after a 429');
      const wait = this.lastCall + this.gapMs - this.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.lastCall = this.now();
      const ctrl = AbortSignal.timeout(this.timeoutMs);
      const res = await this.fetch(url, { signal: ctrl, headers: { 'user-agent': UA } });
      if (res.status === 429) {
        this.pauseAfter429(res);
        throw new Error('HTTP 429');
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    };
    const job = this.queue.then(run, run);
    this.queue = job.catch(() => {});
    return job;
  }

  /** A 429: the desk waits what Commons asks (Retry-After), at least a minute, at most `pauseMs`. */
  pauseAfter429(res) {
    const ask = Number(res.headers?.get?.('retry-after')) * 1000;
    const wait = Number.isFinite(ask) && ask > 0 ? Math.min(this.pauseMs, Math.max(60_000, ask)) : this.pauseMs;
    this.pausedUntil = this.now() + wait;
  }

  /**
   * Footage of a story's place, downloaded and ready to serve: { id, credit, title, page, duration, width,
   * height, start } (start: where the client begins, past a clip's opening titles), or null.
   */
  async find(location, { grave = false } = {}) {
    if (!this.enabled) return null;
    const fq = footageQuery(location, { grave });
    if (!fq) return null;
    const key = fold(fq.name);
    const hit = this.places.get(key);
    if (hit && this.now() - hit.at < (hit.clip ? 24 : 6) * 3600_000) return hit.clip;
    let clip = null;
    try {
      const list = parseCommonsVideos(await this.call(commonsUrl(fq.q)));
      const best = bestFootage(list, fq.name);
      if (best) clip = await this.download(best);
    } catch (err) {
      if (this.failures++ < 3) this.log.warn?.(`[footage] ${fq.q}: ${err.message}`);
      return null; // a failure is not remembered as "nothing there"
    }
    this.places.set(key, { at: this.now(), clip });
    if (this.places.size > 500) this.places.delete(this.places.keys().next().value);
    if (clip) this.saveIndex();
    return clip;
  }

  async download(c) {
    const id = `f${crypto.createHash('sha256').update(c.src).digest('hex').slice(0, 16)}`;
    const rec = {
      id,
      credit: c.credit,
      title: c.title,
      page: c.page,
      duration: c.duration,
      width: c.width,
      height: c.height,
      // past the opening titles a clip often has (a fifth of it, at most half a minute in; the deck also skips a
      // title card or a fade to black it lands on, and turns back before the closing credits)
      start: Math.round(Math.min(30, c.duration * 0.2) * 10) / 10,
    };
    if (this.file(id)) return this.meta.get(id);
    if (this.now() < this.pausedUntil) throw new Error('paused after a 429');
    const { res } = await guardedFetch(this.fetch, c.src, { timeoutMs: 30_000, headers: { 'user-agent': UA } });
    if (res.status === 429) {
      this.pauseAfter429(res);
      throw new Error('HTTP 429');
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await readCapped(res, FOOTAGE_LIMITS.maxBytes, { tooLarge: 'clip too large' });
    // a WebM (EBML) file, nothing else
    if (body.length < 4 || body.readUInt32BE(0) !== 0x1a45dfa3) throw new Error('not a WebM file');
    fs.writeFileSync(path.join(this.dir, `${id}.webm`), body);
    this.meta.set(id, rec);
    this.prune();
    return rec;
  }

  saveIndex() {
    try {
      const places = Object.fromEntries([...this.places].filter(([, e]) => e.clip && this.meta.has(e.clip.id)).map(([k, e]) => [k, { id: e.clip.id, at: e.at }]));
      fs.writeFileSync(path.join(this.dir, 'index.json'), JSON.stringify({ clips: Object.fromEntries(this.meta), places }));
    } catch (err) {
      this.log.warn?.(`[footage] index: ${err.message}`);
    }
  }

  /** Keep the cache under its size: the oldest clips go first. */
  prune() {
    const files = [...this.meta.keys()]
      .map((id) => {
        try {
          const st = fs.statSync(path.join(this.dir, `${id}.webm`));
          return { id, size: st.size, at: st.mtimeMs };
        } catch {
          return { id, size: 0, at: 0 };
        }
      })
      .sort((a, b) => a.at - b.at);
    let total = files.reduce((n, f) => n + f.size, 0);
    for (const f of files) {
      if (total <= this.maxCacheBytes) break;
      try {
        fs.unlinkSync(path.join(this.dir, `${f.id}.webm`));
      } catch {}
      this.meta.delete(f.id);
      total -= f.size;
    }
  }
}
