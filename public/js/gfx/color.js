// Palette colour helpers. Graphics use palette colours only; alpha versions
// exist for shades and glass, with the alpha quantised to 1/32 steps so the
// string cache stays small (one entry per colour and step, never per frame).
import { P } from '../palette.js';

const RGB = new Map();
/** [r, g, b] of a #rrggbb colour (cached). */
export function rgbOf(hex) {
  let v = RGB.get(hex);
  if (!v) {
    const n = parseInt(String(hex).slice(1, 7), 16) || 0;
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    RGB.set(hex, v);
  }
  return v;
}

/** Packed little-endian RGBA for Uint32Array pixel buffers. */
export function u32(hex, a = 255) {
  const [r, g, b] = rgbOf(hex);
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

const STEPS = 32;
const RGBA = new Map();
/** CSS colour string of a palette colour at alpha a (quantised, cached). */
export function rgba(hex, a) {
  const q = Math.round((a < 0 ? 0 : a > 1 ? 1 : a) * STEPS);
  const key = `${hex}|${q}`;
  let s = RGBA.get(key);
  if (!s) {
    const [r, g, b] = rgbOf(hex);
    s = q >= STEPS ? hex : `rgba(${r},${g},${b},${q / STEPS})`;
    RGBA.set(key, s);
  }
  return s;
}

// One palette step darker for every channel colour (same hue family), so a picture can fade in
// or out by whole palette steps instead of alpha (no off-palette colours, no muddy blends).
const DOWN = {
  black: 'black', ink: 'black', slate: 'ink', steel: 'slate', fog: 'steel', silver: 'fog', white: 'silver',
  red: 'darkRed', darkRed: 'maroon', maroon: 'black', rust: 'brown', orange: 'rust', yellow: 'orange', cream: 'tan',
  skin: 'skinShade', skinShade: 'tanShade', tan: 'tanShade', tanShade: 'brown', brown: 'maroon', green: 'darkGreen',
  darkGreen: 'black', cyan: 'blue', blue: 'navy', navy: 'ink', pink: 'red', magenta: 'purple', purple: 'maroon',
};
let STEP_DOWN = null;
/** Map from a packed opaque palette colour to the one a step darker (built on first use). */
export function stepDownTable() {
  if (!STEP_DOWN) STEP_DOWN = new Map(Object.entries(DOWN).filter(([a, b]) => P[a] && P[b]).map(([a, b]) => [u32(P[a]), u32(P[b])]));
  return STEP_DOWN;
}
/** Darkens the opaque palette pixels of a Uint32Array by `steps` palette steps, in place. */
export function stepDown(d, steps = 1) {
  const T = stepDownTable();
  for (let i = 0; i < d.length; i++) {
    let c = d[i];
    if (!(c >>> 24)) continue;
    for (let k = 0; k < steps; k++) {
      const m = T.get((c | 0xff000000) >>> 0);
      if (m === undefined) break;
      c = m;
    }
    d[i] = c;
  }
  return d;
}
