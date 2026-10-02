// Offscreen canvases, 1x pixel buffers and bounded memo caches: static art is
// baked once and blitted every frame.
import { u32 } from './color.js';

export const HAS_DOM = typeof document !== 'undefined';

/** New canvas with smoothing off (w, h rounded up to at least 1). */
export function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  c.getContext('2d').imageSmoothingEnabled = false;
  return c;
}

/** Canvas holding a packed Uint32 pixel buffer. */
export function toCanvas(buf, w, h) {
  const c = mk(w, h);
  const cx = c.getContext('2d');
  const img = cx.createImageData(w, h);
  new Uint32Array(img.data.buffer).set(buf);
  cx.putImageData(img, 0, 0);
  return c;
}

/** 1x pixel buffer used to bake sprites; colours are hex strings or packed u32. */
export class Pix {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.d = new Uint32Array(w * h);
  }

  px(x, y, c) {
    x |= 0;
    y |= 0;
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = typeof c === 'number' ? c : u32(c);
  }

  get(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.d[y * this.w + x] : 0;
  }

  rect(x, y, w, h, c) {
    const v = typeof c === 'number' ? c : u32(c);
    for (let yy = Math.max(0, y); yy < Math.min(this.h, y + h); yy++) {
      for (let xx = Math.max(0, x); xx < Math.min(this.w, x + w); xx++) this.d[yy * this.w + xx] = v;
    }
  }

  canvas() {
    return toCanvas(this.d, this.w, this.h);
  }
}

/**
 * A memo cache with an entry limit (oldest evicted first). Returns
 * cached(key, build) which builds a value once per key.
 */
export function memo(limit = 256) {
  const m = new Map();
  const cached = (key, build) => {
    let v = m.get(key);
    if (v === undefined) {
      v = build();
      if (m.size >= limit) m.delete(m.keys().next().value);
      m.set(key, v);
    }
    return v;
  };
  cached.clear = () => m.clear();
  cached.size = () => m.size;
  return cached;
}

/** A pattern fill created once per (canvas, context) pair. */
export function patternOf(ctx, cv, repeat = 'repeat') {
  if (!cv.__pat) cv.__pat = new WeakMap();
  let p = cv.__pat.get(ctx);
  if (!p) {
    p = ctx.createPattern(cv, repeat);
    cv.__pat.set(ctx, p);
  }
  return p;
}
