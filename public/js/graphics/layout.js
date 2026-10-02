// Geometry, colours and easing shared by the on-screen graphics package.
// Positions follow docs/ART_DIRECTION.md section 4 (EBU R95 safe areas, bug
// top-left, clock top-right, lower third 166-194, ticker 202-216).
import { P } from '../palette.js';
import { clamp01, lerp, easeOut, easeIn, easeInOut } from '../util.js';

// One set of curves for the whole channel (util.js); re-exported for the graphics modules.
export { clamp01, lerp, easeOut, easeIn, easeInOut };

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

/** Ticker band at the foot of the screen; text never passes action-safe on the right. */
export const TICKER = { y: 202, h: 14, textX: SAFE.graphics.x, right: W - SAFE.action.x };

/**
 * Captions: centred, at most two lines of about 44 characters (broadcast
 * subtitle practice is 37-42 characters, about two thirds of the width), kept
 * 6 px clear of whatever sits below them.
 */
export const CAPTION = {
  maxW: 264,
  pitch: 12, // one line box: 3 px above the caps (room for accents), 7 px caps, 2 px below
  capY: 3,
  padX: 5,
  gap: 6,
  bottomFree: TICKER.y - 6, // bottom edge when no strap is on screen
  bottomStrap: STRAP.tagY - 6, // bottom edge above a lower third
  top: 46, // top edge over full-screen graphics (10 px under the montage's TOP STORIES row, y 25-36)
};

// Light accents carry black text, dark ones white (legibility beats elegance).
const DARK_INK = new Set([P.yellow, P.cyan, P.green, P.cream, P.white, P.silver, P.orange]);
/** Text colour that reads on a flat block of `color`. */
export const inkOn = (color) => (DARK_INK.has(color) ? P.black : P.white);

/** Fill a rectangle with whole pixels. */
export function rect(ctx, x, y, w, h, color) {
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/**
 * Run `fn` with drawing clipped to a rectangle (skipped when empty). The
 * restore sits in a finally: a throw inside `fn` must never leave the clip on
 * the shared context, or every later frame would be clipped to this rectangle.
 */
export function clipped(ctx, x, y, w, h, fn) {
  if (w <= 0 || h <= 0) return;
  ctx.save();
  try {
    ctx.beginPath();
    ctx.rect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    ctx.clip();
    fn();
  } finally {
    ctx.restore();
  }
}
