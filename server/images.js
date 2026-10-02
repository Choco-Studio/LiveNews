// Fetches story images server-side so the browser can pixelate them on a
// canvas without CORS tainting. Only URLs that came from the news feeds are
// ever requested (looked up by story id), never arbitrary client input.
// Pictures of LOCAL feeds (offline fixtures) are file: URLs; they are read
// only from the folders in `localRoots` and only if they really are images.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_BYTES = 6_000_000;
const MAX_ENTRIES = 120;
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

export class ImageCache {
  constructor({ fetchImpl = fetch, localRoots = () => [], log = console, now = () => Date.now() } = {}) {
    this.fetch = fetchImpl;
    this.log = log;
    this.now = now;
    this.localRoots = typeof localRoots === 'function' ? localRoots : () => localRoots;
    this.cache = new Map(); // id -> { type, body } | { error }
    this.failedAt = new Map(); // id -> when its fetch failed
    this.inflight = new Map();
  }

  async get(id, url) {
    if (this.cache.has(id)) {
      const hit = this.cache.get(id);
      if (!(hit.error && this.now() - (this.failedAt.get(id) ?? 0) > ERROR_TTL_MS)) {
        this.cache.delete(id); // refresh LRU position
        this.cache.set(id, hit);
        return hit;
      }
      this.cache.delete(id);
    }
    if (this.inflight.has(id)) return this.inflight.get(id);
    const p = this.download(url)
      .catch((err) => {
        this.log.warn?.(`[images] ${id}: ${err.message}`);
        this.failedAt.set(id, this.now());
        return { error: err.message };
      })
      .then((entry) => {
        this.inflight.delete(id);
        this.cache.set(id, entry);
        while (this.cache.size > MAX_ENTRIES) {
          const oldest = this.cache.keys().next().value;
          this.cache.delete(oldest);
          this.failedAt.delete(oldest);
        }
        return entry;
      });
    this.inflight.set(id, p);
    return p;
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
    const res = await this.fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; LiveNewsBot/0.1)', accept: 'image/*' },
      signal: AbortSignal.timeout(10000),
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = (res.headers.get('content-type') || '').split(';')[0].trim();
    if (!ALLOWED.test(type)) throw new Error(`content type not allowed: ${type}`);
    const len = Number(res.headers.get('content-length') || 0);
    if (len > MAX_BYTES) throw new Error('image too large');
    const body = Buffer.from(await res.arrayBuffer());
    if (body.length > MAX_BYTES) throw new Error('image too large');
    return { type, body };
  }
}
