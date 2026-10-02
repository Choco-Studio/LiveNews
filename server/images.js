// Fetches story images server-side so the browser can pixelate them on a
// canvas without CORS tainting. Only URLs that came from the news feeds are
// ever requested (looked up by story id), never arbitrary client input.

const MAX_BYTES = 6_000_000;
const MAX_ENTRIES = 120;
const ALLOWED = /^image\/(jpeg|png|webp|gif|avif)$/i;

export class ImageCache {
  constructor({ fetchImpl = fetch } = {}) {
    this.fetch = fetchImpl;
    this.cache = new Map(); // id -> { type, body } | { error }
    this.inflight = new Map();
  }

  async get(id, url) {
    if (this.cache.has(id)) {
      const hit = this.cache.get(id);
      this.cache.delete(id); // refresh LRU position
      this.cache.set(id, hit);
      return hit;
    }
    if (this.inflight.has(id)) return this.inflight.get(id);
    const p = this.download(url)
      .catch((err) => ({ error: err.message }))
      .then((entry) => {
        this.inflight.delete(id);
        this.cache.set(id, entry);
        while (this.cache.size > MAX_ENTRIES) this.cache.delete(this.cache.keys().next().value);
        return entry;
      });
    this.inflight.set(id, p);
    return p;
  }

  async download(url) {
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
