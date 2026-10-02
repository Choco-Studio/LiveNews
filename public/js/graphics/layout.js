// Geometry, colours and easing shared by the on-screen graphics package.
// Positions follow docs/ART_DIRECTION.md section 4 (EBU R95 safe areas, bug
// top-left, clock top-right, lower third 166-194, ticker 202-216).
import { P } from '../palette.js';

export const W = 384;
export const H = 216;

export const SAFE = {
  action: { x: 13, y: 8 }, // bug, clock and any text
  graphics: { x: 19, y: 11 }, // straps
};

/** Top row: bug, LIVE tag, programme tag (left) and clock (right). */
export const TOP = { x: SAFE.action.x, y: SAFE.action.y, h: 13 };

/** Lower third: an 11 px tag row over a 17 px headline bar. */
export const STRAP = {
  x: SAFE.graphics.x,
  right: W - SAFE.graphics.x, // 365
  tagY: 166,
  tagH: 11,
  barY: 177,
  barH: 17,
  bottom: 194,
};

/** Ticker band at the foot of the screen. */
export const TICKER = { y: 202, h: 14, textX: SAFE.graphics.x, right: W - SAFE.action.x };

/** Captions: centred, at most two lines, kept clear of the strap and the ticker. */
export const CAPTION = {
  maxW: W - 48,
  pitch: 11,
  gap: 4, // space above whatever sits below the captions
  bottomFree: TICKER.y - 4, // bottom edge when no strap is on screen
  bottomStrap: STRAP.tagY - 4, // bottom edge above a lower third
  top: 40, // top edge when a full-screen graphic owns the bottom of the frame
};

// Light accents carry black text, dark ones white (legibility beats elegance).
const DARK_INK = new Set([P.yellow, P.cyan, P.green, P.cream, P.white, P.silver, P.orange]);
/** Text colour that reads on a flat block of `color`. */
export const inkOn = (color) => (DARK_INK.has(color) ? P.black : P.white);

export const clamp01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x);
export const easeOut = (x) => 1 - (1 - clamp01(x)) ** 3;
export const easeIn = (x) => clamp01(x) ** 3;
export const easeInOut = (x) => {
  const v = clamp01(x);
  return v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2;
};
export const lerp = (a, b, k) => a + (b - a) * k;

/** Fill a rectangle with whole pixels. */
export function rect(ctx, x, y, w, h, color) {
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** Run `fn` with drawing clipped to a rectangle (skipped when empty). */
export function clipped(ctx, x, y, w, h, fn) {
  if (w <= 0 || h <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  ctx.clip();
  fn();
  ctx.restore();
}
