// Light in pixel art for the 2.5D set (round 4, owner: "quiero platós realmente bien hechos"): what makes a
// studio read as lit rather than painted. Every helper works in screen pixels and only ever writes palette
// colours; a glow only LIFTS dark pixels (it never paints over a brighter one), so it can be laid over any
// layer in any order.
//
//   RAMPS[name]                       a light colour's ramp: core (the LED), hot (its brightest pixels), halo
//                                     (1 px round it), outer (the Bayer fringe of its glow on a dark surface)
//   glowH(fr, x0, x1, y, ramp, opt)   a horizontal LED line with its glow above and/or below
//   glowV(fr, x, y0, y1, ramp, opt)   a vertical one with its glow either side
//   lift(fr, x, y, c)                 paint c only over a darker pixel
//   bokeh(fr, cx, cy, r, ramp, opt)   an out-of-focus light: a disc with a brighter rim
//   litBy(c)                          the next step up a surface's ramp (a pixel catching a light)
import { C } from '../pixbuf.js';

const W = 384, H = 216;

// L* of each palette colour (palette.js, sRGB → CIE L*), for "lift only" writes
const LSTAR = {
  black: 7.5, ink: 18.2, maroon: 18.8, purple: 31.5, slate: 29.4, navy: 32.7, brown: 32.7, darkGreen: 34.9, darkRed: 36.6,
  tanShade: 42.5, steel: 44.3, rust: 47, magenta: 48.7, red: 51.9, skinShade: 54.2, blue: 59.8, tan: 61, fog: 63.5,
  orange: 64, pink: 64.7, green: 72.3, skin: 72.9, yellow: 77, silver: 81.3, cyan: 84.4, cream: 85.7, white: 100,
};
export const L_OF = new Map(Object.entries(LSTAR).map(([n, l]) => [C[n] >>> 0, l]));
const lOf = (c) => L_OF.get(c >>> 0) ?? 50;

export const RAMPS = {
  red: { core: C.red, hot: C.pink, halo: C.darkRed, outer: C.maroon },
  blue: { core: C.blue, hot: C.cyan, halo: C.navy, outer: C.navy },
  cyan: { core: C.cyan, hot: C.white, halo: C.blue, outer: C.navy },
  magenta: { core: C.magenta, hot: C.pink, halo: C.purple, outer: C.purple },
  orange: { core: C.orange, hot: C.yellow, halo: C.rust, outer: C.brown },
  yellow: { core: C.yellow, hot: C.cream, halo: C.orange, outer: C.brown },
  green: { core: C.green, hot: C.cream, halo: C.darkGreen, outer: C.darkGreen },
  warm: { core: C.tan, hot: C.cream, halo: C.tanShade, outer: C.brown },
  white: { core: C.silver, hot: C.white, halo: C.steel, outer: C.slate },
  cool: { core: C.fog, hot: C.silver, halo: C.steel, outer: C.slate },
};

/** Paint c at (x, y) only where the pixel is darker than c (a light never darkens what it falls on). */
export function lift(fr, x, y, c) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const o = y * W + x;
  if (lOf(fr.px[o]) < lOf(c)) fr.px[o] = c;
}

const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bay = (x, y) => (B4[((y & 3) << 2) | (x & 3)] + 0.5) / 16;

/**
 * A horizontal LED line from x0 to x1 (exclusive) on row y: the core, then its glow on the surface: the halo
 * row next to it, then `reach` rows of the outer colour fading out in Bayer (glow: 'down' | 'up' | 'both').
 * `clip(x, y)` (optional) says where the glow may fall.
 */
export function glowH(fr, x0, x1, y, ramp, { glow = 'both', reach = 2, halo = true, clip = null } = {}) {
  x0 = Math.max(0, Math.round(x0));
  x1 = Math.min(W, Math.round(x1));
  if (x1 <= x0 || y < 0 || y >= H) return;
  const px = fr.px;
  for (let x = x0; x < x1; x++) px[y * W + x] = ramp.core;
  for (const dir of glow === 'both' ? [-1, 1] : glow === 'up' ? [-1] : [1]) {
    for (let d = 1; d <= reach + 1; d++) {
      const yy = y + dir * d;
      if (yy < 0 || yy >= H) break;
      const isHalo = halo && d === 1;
      const share = isHalo ? 1 : 1 - (d - 1) / (reach + 1);
      for (let x = x0; x < x1; x++) {
        if (clip && !clip(x, yy)) continue;
        if (!isHalo && share < 1 && bay(x, yy) >= share * 0.75) continue;
        lift(fr, x, yy, isHalo ? ramp.halo : ramp.outer);
      }
    }
  }
}

/** A vertical LED line on column x from y0 to y1 (exclusive), its glow either side (side: -1 | 1 | 0 both). */
export function glowV(fr, x, y0, y1, ramp, { side = 0, reach = 2, halo = true, clip = null } = {}) {
  y0 = Math.max(0, Math.round(y0));
  y1 = Math.min(H, Math.round(y1));
  if (y1 <= y0 || x < 0 || x >= W) return;
  const px = fr.px;
  for (let y = y0; y < y1; y++) px[y * W + x] = ramp.core;
  for (const dir of side === 0 ? [-1, 1] : [side]) {
    for (let d = 1; d <= reach + 1; d++) {
      const xx = x + dir * d;
      if (xx < 0 || xx >= W) break;
      const isHalo = halo && d === 1;
      const share = isHalo ? 1 : 1 - (d - 1) / (reach + 1);
      for (let y = y0; y < y1; y++) {
        if (clip && !clip(xx, y)) continue;
        if (!isHalo && share < 1 && bay(xx, y) >= share * 0.75) continue;
        lift(fr, xx, y, isHalo ? ramp.halo : ramp.outer);
      }
    }
  }
}

/**
 * An out-of-focus light (bokeh): a disc of radius r px centred at (cx, cy): the fill colour, a rim one step
 * brighter on its upper-left arc, lifted over the darker pixels only (so two discs overlap as light does).
 */
export function bokeh(fr, cx, cy, r, ramp, { fill = ramp.halo, rim = ramp.core, clip = null } = {}) {
  const x0 = Math.max(0, Math.floor(cx - r - 1)), x1 = Math.min(W, Math.ceil(cx + r + 1));
  const y0 = Math.max(0, Math.floor(cy - r - 1)), y1 = Math.min(H, Math.ceil(cy + r + 1));
  const r2 = r * r, ri = (r - 1.05) * (r - 1.05);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const d = dx * dx + dy * dy;
      if (d > r2) continue;
      if (clip && !clip(x, y)) continue;
      const edge = d > ri;
      lift(fr, x, y, edge && dx + dy < r * 0.35 ? rim : fill);
    }
  }
}

// one step up each surface's ramp: a pixel catching a light (a lit edge, a specular streak)
const UP = new Map([
  ['black', 'ink'], ['ink', 'slate'], ['slate', 'steel'], ['steel', 'fog'], ['fog', 'silver'], ['silver', 'white'],
  ['maroon', 'darkRed'], ['darkRed', 'red'], ['navy', 'blue'], ['blue', 'cyan'], ['purple', 'magenta'], ['brown', 'tanShade'],
  ['tanShade', 'tan'], ['tan', 'cream'], ['darkGreen', 'green'],
].map(([a, b]) => [C[a] >>> 0, C[b]]));
export const litBy = (c) => UP.get(c >>> 0) ?? c;
