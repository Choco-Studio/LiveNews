// Fetches story images server-side so the browser can pixelate them on a
// canvas without CORS tainting. Only URLs that came from the news feeds are
// ever requested (looked up by story id), never arbitrary client input; even
// so they are third-party URLs: no request may reach the machine itself or its
// private network (checked on every redirect hop), bodies are read as a stream
// and cut at MAX_BYTES, and only real pictures of a usable size are kept (the
// size is read from the bytes: a 70x70 thumbnail or a 1x1 pixel never airs).
// A story may offer several candidates (an upgraded rendition first, then the
// original, then the next best): the first that passes is served.
// Pictures of LOCAL feeds (offline fixtures) are file: URLs; they are read
// only from the folders in `localRoots` and only if they really are images.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { guardedFetch, readCapped } from './net.js';
import { MIN_WIDTH, imageSize } from './pictures.js';

const MAX_BYTES = 6_000_000;
const MAX_ENTRIES = 120;
const MAX_CANDIDATES = 4;
// A failed fetch is remembered only briefly: a passing network error must not hide the picture for good.
const ERROR_TTL_MS = 60_000;
const ALLOWED = /^image\/(jpeg|png|webp|gif|avif)$/i;

// Magic numbers: a local file is served only if its bytes say it is a picture.
function sniff(buf) {
  if (buf.length > 8 && buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') return 'image/png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 6 && buf.toString('latin1', 0, 4) === 'GIF8') return 'image/gif';
  if (buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return '';
}

/** Too small or oddly shaped for the screen (only when the bytes say their size). */
export function badPictureSize(body) {
  const size = imageSize(body);
  if (!size) return null;
  if (size.w < MIN_WIDTH || size.h < 120) return `image too small (${size.w}x${size.h})`;
  if (size.w / size.h < 0.5 || size.w / size.h > 3.2) return `image shape not usable (${size.w}x${size.h})`;
  return null;
}

export class ImageCache {
  constructor({ fetchImpl = fetch, localRoots = () => [], log = console, now = () => Date.now(), lookup = null } = {}) {
    this.fetch = fetchImpl;
    this.log = log;
    this.now = now;
    this.lookup = lookup; // DNS for the private-address guard (tests inject one)
    this.localRoots = typeof localRoots === 'function' ? localRoots : () => localRoots;
    this.cache = new Map(); // id -> { type, body } | { error }
    this.keys = new Map(); // id -> the candidate list the entry was made from
    this.sources = new Map(); // id -> the URL that was served
    this.failedAt = new Map(); // id -> when its fetch failed
    this.inflight = new Map();
  }

  /**
   * The picture of story `id`, from the first usable URL of `urls` (a string or
   * a list, best first). Cached per story; a different list is a new picture.
   */
  async get(id, urls) {
    const list = (Array.isArray(urls) ? urls : [urls]).filter(Boolean).slice(0, MAX_CANDIDATES);
    const key = list.join('\n');
    if (this.cache.has(id)) {
      const hit = this.cache.get(id);
      const stale = this.keys.get(id) !== key || (hit.error && this.now() - (this.failedAt.get(id) ?? 0) > ERROR_TTL_MS);
      if (!stale) {
        this.cache.delete(id); // refresh LRU position
        this.cache.set(id, hit);
        return hit;
      }
      this.cache.delete(id);
      this.keys.delete(id);
    }
    const flight = this.inflight.get(id);
    if (flight && flight.key === key) return flight.p;
    const p = this.firstUsable(list)
      .catch((err) => {
        this.log.warn?.(`[images] ${id}: ${err.message}`);
        this.failedAt.set(id, this.now());
        return { error: err.message };
      })
      .then((entry) => {
        if (this.inflight.get(id)?.p === p) this.inflight.delete(id);
        const { url, ...clean } = entry;
        this.cache.set(id, clean);
        this.keys.set(id, key);
        if (url) this.sources.set(id, url);
        else this.sources.delete(id);
        while (this.cache.size > MAX_ENTRIES) {
          const oldest = this.cache.keys().next().value;
          this.cache.delete(oldest);
          this.keys.delete(oldest);
          this.sources.delete(oldest);
          this.failedAt.delete(oldest);
        }
        return clean;
      });
    this.inflight.set(id, { key, p });
    return p;
  }

  async firstUsable(list) {
    if (!list.length) throw new Error('invalid URL');
    let last = null;
    for (const url of list) {
      try {
        const entry = await this.download(url);
        const bad = badPictureSize(entry.body);
        if (bad) throw new Error(bad);
        return { ...entry, url };
      } catch (err) {
        last = err;
      }
    }
    throw last;
  }

  async readLocal(url) {
    let file;
    try {
      file = path.resolve(fileURLToPath(url));
    } catch {
      throw new Error('invalid URL');
    }
    const inside = (f, roots) => roots.some((root) => f.startsWith(root + path.sep));
    const roots = [...this.localRoots()].map((r) => path.resolve(r));
    if (!inside(file, roots) || !/\.(?:png|jpe?g|webp|gif)$/i.test(file)) throw new Error('invalid URL');
    // A symlink inside a picture folder must not lead outside it.
    const real = await fs.promises.realpath(file);
    const realRoots = await Promise.all(roots.map((r) => fs.promises.realpath(r).catch(() => r)));
    if (!inside(real, realRoots)) throw new Error('invalid URL');
    const stat = await fs.promises.stat(real);
    if (stat.size > MAX_BYTES) throw new Error('image too large');
    const body = await fs.promises.readFile(real);
    const type = sniff(body);
    if (!type) throw new Error('content type not allowed: not an image');
    return { type, body };
  }

  async download(url) {
    if (/^file:/i.test(url ?? '')) return this.readLocal(url);
    if (!/^https?:\/\//i.test(url)) throw new Error('invalid URL');
    const { res } = await guardedFetch(this.fetch, url, {
      timeoutMs: 10000,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; LiveNewsBot/0.1)', accept: 'image/*' },
      ...(this.lookup ? { lookup: this.lookup } : {}),
    });
    const cancel = async () => {
      try {
        await res.body?.cancel?.();
      } catch {}
    };
    if (!res.ok) {
      await cancel();
      throw new Error(`HTTP ${res.status}`);
    }
    const type = (res.headers.get('content-type') || '').split(';')[0].trim();
    if (!ALLOWED.test(type)) {
      await cancel();
      throw new Error(`content type not allowed: ${type}`);
    }
    const body = await readCapped(res, MAX_BYTES, { tooLarge: 'image too large' });
    return { type, body };
  }
}
