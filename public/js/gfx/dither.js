// Ordered dithering, Bayer 4x4 only (docs/ART_DIRECTION.md): mixes two
// adjacent palette steps for light falloff and gradients. Never use it on
// text, faces, logos or anything smaller than 8 px.
import { mk } from './canvas.js';

export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Threshold in (0, 1) for pixel (x, y). */
export const bayer = (x, y) => (BAYER4[((y & 3) << 2) | (x & 3)] + 0.5) / 16;
/** Rank 0..15 for pixel (x, y). */
export const bayerRank = (x, y) => BAYER4[((y & 3) << 2) | (x & 3)];

const TILES = new Map();
const PATS = new WeakMap();
/** 4x4 tile covering k/16 of its pixels with `color`. */
function tile(color, k) {
  const key = `${color}|${k}`;
  let c = TILES.get(key);
  if (!c) {
    c = mk(4, 4);
    const cx = c.getContext('2d');
    cx.fillStyle = color;
    for (let i = 0; i < 16; i++) if (BAYER4[i] < k) cx.fillRect(i & 3, i >> 2, 1, 1);
    TILES.set(key, c);
  }
  return c;
}

/** Fill style that covers fraction `a` of the pixels with `color` (null when empty). */
export function ditherStyle(ctx, color, a) {
  const k = Math.round((a < 0 ? 0 : a > 1 ? 1 : a) * 16);
  if (k <= 0) return null;
  if (k >= 16) return color;
  const t = tile(color, k);
  let per = PATS.get(ctx);
  if (!per) {
    per = new Map();
    PATS.set(ctx, per);
  }
  let p = per.get(t);
  if (!p) {
    p = ctx.createPattern(t, 'repeat');
    per.set(t, p);
  }
  return p;
}

/** Covers a fraction `a` of the rect's pixels with a palette colour. */
export function dfill(ctx, x, y, w, h, color, a) {
  const s = ditherStyle(ctx, color, a);
  if (!s || w <= 0 || h <= 0) return;
  ctx.fillStyle = s;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/**
 * Dithered ramp between palette colours (packed u32 array): v in
 * [0, colors.length - 1], returns the colour for pixel (x, y).
 */
export function rampPick(packed, v, x, y) {
  const n = packed.length - 1;
  const i = Math.floor((v < 0 ? 0 : v > n ? n : v) + bayer(x, y) - 0.5);
  return packed[i < 0 ? 0 : i > n ? n : i];
}
