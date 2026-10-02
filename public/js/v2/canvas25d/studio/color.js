// Palette maths for the studio set (owner: STUDIO SET stream).
//
// Everything the set draws is an exact palette colour (public/js/palette.js),
// so light, tints, reflections and dimming are palette REMAPS, never alpha
// blends. This module gives the colour facts the set, its tests and the lab
// measure with: CIE L* per colour (sRGB → linear → Y → L*), u32 ↔ palette
// name lookups, the "one step darker" ramp map used to dim wall content, a
// nearest-palette search in CIE Lab, and the colour families the programme
// bibles count (saturated colours, tints).
import { P } from '../../../palette.js';
import { C } from '../pixbuf.js';

export const NAMES = Object.keys(P);

const lin = (v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const fLab = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);

/** CIE L* (0..100) of an sRGB colour given as r, g, b in 0..255. */
export function lstarRGB(r, g, b) {
  const Y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return 116 * fLab(Y) - 16;
}

/** CIE Lab of r, g, b (D65). */
export function labRGB(r, g, b) {
  const R = lin(r), G = lin(g), B = lin(b);
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const fx = fLab(X), fy = fLab(Y), fz = fLab(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** L* of a little-endian u32 pixel (0xAABBGGRR, as in pixbuf.js Frames). */
export function lstar32(c) {
  return lstarRGB(c & 255, (c >>> 8) & 255, (c >>> 16) & 255);
}

/** L* of every palette colour by name, e.g. LSTAR.ink ≈ 18, LSTAR.slate ≈ 29, LSTAR.steel ≈ 44. */
export const LSTAR = Object.fromEntries(NAMES.map((n) => [n, lstar32(C[n])]));

// u32 → palette name (exact matches only)
const BY32 = new Map(NAMES.map((n) => [C[n] >>> 0, n]));
/** Palette name of a u32 pixel, or null when the colour is not in the palette. */
export const nameOf = (c) => BY32.get(c >>> 0) || null;
export const isPalette = (c) => BY32.has(c >>> 0);

// L* lookup for any pixel: palette colours from a Map, others computed (tests, captures)
const L_CACHE = new Map(NAMES.map((n) => [C[n] >>> 0, LSTAR[n]]));
export function lstarOf(c) {
  c >>>= 0;
  let v = L_CACHE.get(c);
  if (v === undefined) {
    v = lstar32(c);
    if (L_CACHE.size < 4096) L_CACHE.set(c, v);
  }
  return v;
}

/** The colours the bibles call saturated (money-minute.md §5 item 12; news-60.md item 8). */
export const SATURATED = new Set(['red', 'darkRed', 'rust', 'orange', 'yellow', 'green', 'darkGreen', 'cyan', 'blue', 'navy', 'pink', 'magenta', 'purple']);
export const NEUTRAL = new Set(['black', 'ink', 'slate', 'steel', 'fog', 'silver', 'white']);
export const SKIN = new Set(['skin', 'skinShade', 'tan', 'tanShade']);

/**
 * One step darker along a hue-consistent ramp (the art direction's "two adjacent ramp steps").
 * Used to dim wall content by whole palette steps and to place reflections.
 */
export const DARKER = {
  white: 'silver', silver: 'fog', fog: 'steel', steel: 'slate', slate: 'ink', ink: 'black', black: 'black',
  cream: 'tan', tan: 'tanShade', tanShade: 'brown', brown: 'maroon', maroon: 'black',
  skin: 'skinShade', skinShade: 'brown', yellow: 'orange', orange: 'rust', rust: 'brown',
  red: 'darkRed', darkRed: 'maroon', pink: 'darkRed', magenta: 'purple', purple: 'ink',
  green: 'darkGreen', darkGreen: 'ink', cyan: 'blue', blue: 'navy', navy: 'ink',
};
export const darker32 = (c, steps = 1) => {
  let n = nameOf(c);
  if (!n) return c;
  for (let i = 0; i < steps; i++) n = DARKER[n];
  return C[n];
};

const LAB = NAMES.map((n) => labRGB(C[n] & 255, (C[n] >>> 8) & 255, (C[n] >>> 16) & 255));

/**
 * Nearest palette colour (CIE Lab distance) to r, g, b among `allowed` names (default: all).
 * Returns the palette name.
 */
export function nearestName(r, g, b, allowed = null) {
  const [L, A, B] = labRGB(r, g, b);
  let best = 'black', bd = Infinity;
  for (let i = 0; i < NAMES.length; i++) {
    const n = NAMES[i];
    if (allowed && !allowed.has(n)) continue;
    const q = LAB[i];
    const d = (L - q[0]) ** 2 + (A - q[1]) ** 2 + (B - q[2]) ** 2;
    if (d < bd) {
      bd = d;
      best = n;
    }
  }
  return best;
}

/**
 * Census of a set of pixels: { total, byName: { name: count }, offPalette, meanL }.
 * `mask(i)` (optional) selects the pixel indices that count.
 */
export function census(px, mask = null, i0 = 0, i1 = px.length) {
  const byName = {};
  let total = 0, off = 0, sumL = 0;
  for (let i = i0; i < i1; i++) {
    if (mask && !mask(i)) continue;
    const c = px[i] >>> 0;
    const n = BY32.get(c);
    total++;
    sumL += lstarOf(c);
    if (n) byName[n] = (byName[n] || 0) + 1;
    else off++;
  }
  return { total, byName, offPalette: off, meanL: total ? sumL / total : 0 };
}

/** Share (0..1) of a census made of the given colour names. */
export function share(cs, names) {
  if (!cs.total) return 0;
  let n = 0;
  for (const k of names) n += cs.byName[k] || 0;
  return n / cs.total;
}
