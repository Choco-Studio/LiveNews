// Pixel-exact primitives: rects, discs, 1 px rings and lines, slanted slabs
// and clip helpers. Coordinates are rounded so nothing lands between pixels.
import { BAYER4 } from './dither.js';

const { round, floor, sqrt, max, abs } = Math;

export function rect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(round(x), round(y), round(w), round(h));
}

export function clipRect(ctx, x, y, w, h) {
  ctx.beginPath();
  ctx.rect(round(x), round(y), max(0, round(w)), max(0, round(h)));
  ctx.clip();
}

const SPANS = new Map();
/** Half widths of a pixel disc, one per row from -rad to +rad (cached). */
export function discSpans(rad) {
  rad = max(0, round(rad));
  let s = SPANS.get(rad);
  if (!s) {
    s = new Int16Array(rad * 2 + 1);
    for (let dy = -rad; dy <= rad; dy++) s[dy + rad] = floor(sqrt(max(0, (rad + 0.45) ** 2 - dy * dy)));
    SPANS.set(rad, s);
  }
  return s;
}

/** Filled disc (style may be a colour or a dither pattern). */
export function disc(ctx, cx, cy, rad, style) {
  if (rad < 0.5) return;
  const sp = discSpans(rad);
  const n = (sp.length - 1) >> 1;
  cx = round(cx);
  cy = round(cy);
  ctx.fillStyle = style;
  for (let i = 0; i < sp.length; i++) ctx.fillRect(cx - sp[i], cy - n + i, sp[i] * 2 + 1, 1);
}

const RINGS = new Map();
/** Integer points of a 1 px circle (midpoint algorithm), flat [x0, y0, x1, y1, ...]. */
export function ringPts(rad) {
  rad = max(0, rad | 0);
  let pts = RINGS.get(rad);
  if (pts) return pts;
  const out = [];
  const seen = new Set();
  const add = (x, y) => {
    const k = (x + 2048) * 4096 + y + 2048;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(x, y);
    }
  };
  let x = rad;
  let y = 0;
  let err = 1 - rad;
  while (x >= y) {
    add(x, y); add(y, x); add(-y, x); add(-x, y);
    add(-x, -y); add(-y, -x); add(y, -x); add(x, -y);
    y++;
    if (err < 0) err += 2 * y + 1;
    else {
      x--;
      err += 2 * (y - x) + 1;
    }
  }
  pts = Int16Array.from(out);
  RINGS.set(rad, pts);
  return pts;
}

/** 1 px ring; `a` (0..1) of its pixels are drawn in a Bayer 4x4 order. */
export function ring(ctx, cx, cy, rad, color, a = 1) {
  if (a <= 0 || rad < 0) return;
  const pts = ringPts(rad);
  const thr = a * 16;
  ctx.fillStyle = color;
  cx = round(cx);
  cy = round(cy);
  for (let i = 0; i < pts.length; i += 2) {
    const x = cx + pts[i];
    const y = cy + pts[i + 1];
    if (thr >= 16 || BAYER4[((y & 3) << 2) | (x & 3)] < thr) ctx.fillRect(x, y, 1, 1);
  }
}

/** Bresenham line, calling fn(x, y, i) for each pixel. */
export function linePts(x0, y0, x1, y1, fn) {
  x0 = round(x0);
  y0 = round(y0);
  x1 = round(x1);
  y1 = round(y1);
  const dx = abs(x1 - x0);
  const dy = -abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let i = 0; i < 4096; i++) {
    fn(x0, y0, i);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/** 1 px line in one colour. */
export function line(ctx, x0, y0, x1, y1, color) {
  ctx.fillStyle = color;
  linePts(x0, y0, x1, y1, (x, y) => ctx.fillRect(x, y, 1, 1));
}

/** Rows of a parallelogram: top-left at (x0, y0), left edge shifts `slope` px per row. */
export function slabRows(x0, y0, w, h, slope, cb) {
  x0 = round(x0);
  y0 = round(y0);
  w = round(w);
  h = round(h);
  if (w <= 0 || h <= 0) return;
  if (!slope) {
    cb(x0, y0, w, h);
    return;
  }
  let row = 0;
  while (row < h) {
    const off = floor(row * slope);
    let end = row + 1;
    while (end < h && floor(end * slope) === off) end++;
    cb(x0 + off, y0 + row, w, end - row);
    row = end;
  }
}
export function slab(ctx, x0, y0, w, h, slope, color) {
  ctx.fillStyle = color;
  slabRows(x0, y0, w, h, slope, (x, y, ww, hh) => ctx.fillRect(x, y, ww, hh));
}
export function clipSlab(ctx, x0, y0, w, h, slope) {
  ctx.beginPath();
  slabRows(x0, y0, w, h, slope, (x, y, ww, hh) => ctx.rect(x, y, ww, hh));
  ctx.clip();
}

/** 1 px rectangle outline. */
export function frame(ctx, x, y, w, h, color) {
  x = round(x);
  y = round(y);
  w = round(w);
  h = round(h);
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y + 1, 1, h - 2);
  ctx.fillRect(x + w - 1, y + 1, 1, h - 2);
}
