// WORLD WEATHER's weather centre as a studio (round 3, owner 12 Oct: the programme looked like a slide, "necesita
// mejoras enormes"): a dark set with a large curved video wall, a glossy floor that mirrors it, an LED line along
// its foot, a lighting rig overhead, and the wall's light on the presenter. Palette colours only, ordered dither.
//
//   new WallCam(o).set(pan)    the curved wall seen by the camera: per screen column the wall's column, its depth
//                              and the glass's top and bottom rows (a concave wall: its ends are nearer the lens, so
//                              its edges bow outwards), the screen <-> wall mapping both ways
//   drawSet(fb, cam, wb, o)    the set, the wall's picture (wb: the wall's pixels at the centre's scale) mapped onto
//                              the curve, the floor's reflection, the LED line (o.led: 'cyan' | 'orange' for warnings)
//   softWall(fb, src, sw, sh, o)   a small picture of the wall shown out of focus behind a close shot: blurred, then
//                              enlarged with an ordered-dither bilinear (soft edges, palette colours only)
//   lightFigure(px, o)         the light on the presenter: a rim from the wall behind him (one step up each colour's
//                              ramp on the silhouette's edge) and the wall's cool spill a few pixels in from it
//
// The set is drawn into the frame's pixels (Uint32, 384 x 216) before any text, so the channel's graphics and the
// wall's labels sit on top of it.
import { P } from '../../palette.js';
import { PK, colourTable, HASH_M } from './sky.js';

const W = 384, H = 216;
const B16 = Uint8Array.from([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]);
const B4 = Float32Array.from(B16, (v) => (v + 0.5) / 16);

// one step down / up each colour's ramp (a surface in shade / catching a light)
const DOWN_N = {
  white: 'silver', silver: 'fog', fog: 'steel', steel: 'slate', slate: 'ink', ink: 'black', black: 'black',
  cyan: 'blue', blue: 'navy', navy: 'ink', green: 'darkGreen', darkGreen: 'ink', yellow: 'orange', orange: 'rust',
  rust: 'brown', red: 'darkRed', darkRed: 'maroon', maroon: 'black', cream: 'tan', tan: 'tanShade', tanShade: 'brown',
  brown: 'maroon', purple: 'ink', magenta: 'purple', pink: 'magenta', skin: 'skinShade', skinShade: 'tanShade',
};
const UP_N = {
  black: 'ink', ink: 'slate', slate: 'steel', steel: 'fog', fog: 'silver', silver: 'white', white: 'white',
  navy: 'blue', blue: 'cyan', cyan: 'white', darkGreen: 'green', green: 'cream', maroon: 'darkRed', darkRed: 'red',
  red: 'pink', brown: 'tanShade', tanShade: 'tan', tan: 'cream', cream: 'white', rust: 'orange', orange: 'yellow',
  yellow: 'cream', purple: 'magenta', magenta: 'pink', pink: 'cream', skinShade: 'skin', skin: 'cream',
};
// the wall's cool light on dark cloth and hair (skin keeps its warmth)
const SPILL_N = { black: 'ink', ink: 'slate', slate: 'steel', steel: 'fog', brown: 'tanShade', maroon: 'purple', navy: 'blue', purple: 'magenta' };
const table = (names) => {
  const m = new Map();
  for (const [a, b] of Object.entries(names)) m.set(PK[a], PK[b]);
  return m;
};
const DOWN = table(DOWN_N), UP = table(UP_N), SPILL = table(SPILL_N);
export const darker = (c) => DOWN.get(c >>> 0) ?? c;
export const lighter = (c) => UP.get(c >>> 0) ?? c;
// the same as tables of 256 for the per-pixel loops (palette colours only: studio.js / sky.js hashOf)
const DOWN_T = colourTable(darker), UP_T = colourTable(lighter), SPILL_T = colourTable((c) => SPILL.get(c >>> 0) ?? c);
const H8 = (c) => Math.imul(c, HASH_M) >>> 24;

// ------------------------------------------------------------------------------------------- the wall
/** The wall shot's set: horizon (lens height), the glass at the centre, the curve, the wall picture's width. */
export const SET = { yc: 100, yT: 28, yB: 164, curve: 0.075, wbw: 400 };

export class WallCam {
  constructor(o = {}) {
    Object.assign(this, SET, o);
    this.wbh = this.yB - this.yT;
    this.u = new Float32Array(W);
    this.d = new Float32Array(W);
    this.top = new Int16Array(W);
    this.bot = new Int16Array(W);
    this.map = new Int32Array(W * H);
    this.pan = NaN;
  }

  /** The camera panned `pan` px (the wall's axis moves the other way, a little less than the presenter). */
  set(pan) {
    pan = Math.round(pan * 4) / 4;
    if (pan === this.pan) return this;
    this.pan = pan;
    const xc = W / 2 - pan, k = this.curve, half = W / 2;
    this.xc = xc;
    const { u, d, top, bot, map, wbw, yc, yT, yB } = this;
    const vT = yc - yT; // glass rows above the horizon at the centre
    map.fill(-1);
    for (let x = 0; x < W; x++) {
      const t = (x + 0.5 - xc) / half;
      const dd = 1 - k * t * t;
      d[x] = dd;
      // the wall's own column: the arc's length (a nearer part of the wall shows less of it per pixel)
      u[x] = wbw / 2 + half * (t - (k * t * t * t) / 3);
      top[x] = Math.round(yc - vT / dd);
      bot[x] = Math.round(yc + (yB - yc) / dd);
      const ui = Math.max(0, Math.min(wbw - 1, Math.floor(u[x])));
      for (let y = Math.max(0, top[x]); y < Math.min(H, bot[x]); y++) {
        let v = Math.floor((y + 0.5 - yc) * dd + vT);
        v = v < 0 ? 0 : v > this.wbh - 1 ? this.wbh - 1 : v;
        map[y * W + x] = v * wbw + ui;
      }
    }
    return this;
  }

  /** A point of the wall's picture (u, v) on screen. */
  toScreen(uu, vv) {
    // u(x) rises with x: find the column, then the row through its depth
    const { u } = this;
    let lo = 0, hi = W - 1;
    if (uu <= u[0]) lo = hi = 0;
    else if (uu >= u[W - 1]) lo = hi = W - 1;
    else {
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (u[m] <= uu) lo = m;
        else hi = m;
      }
    }
    const x = lo + (hi > lo ? (uu - u[lo]) / (u[hi] - u[lo]) : 0);
    const dd = this.d[Math.max(0, Math.min(W - 1, Math.round(x)))];
    return { x, y: this.yc + (vv - (this.yc - this.yT)) / dd };
  }

  /** A screen point on the wall's picture. */
  toWall(x, y) {
    const xi = Math.max(0, Math.min(W - 1, Math.round(x)));
    return { u: this.u[xi], v: (y - this.yc) * this.d[xi] + (this.yc - this.yT) };
  }
}

const RIG_LAMPS = [44, 108, 172, 236, 300, 364];

/**
 * The set and the wall into fb: the dark backdrop with the lighting rig, the wall's bezel, its picture on the curve
 * (dimmer toward its ends, as an LED wall seen off axis), the plinth's LED line and the floor mirroring the wall.
 */
export function drawSet(fb, cam, wb, { led = 'cyan', t = 0 } = {}) {
  const { top, bot, map, d } = cam;
  const ledCore = led === 'orange' ? PK.orange : PK.cyan, ledHalo = led === 'orange' ? PK.rust : PK.blue, ledGlow = led === 'orange' ? PK.brown : PK.navy;
  const truss = 5;
  for (let x = 0; x < W; x++) {
    const tp = top[x], bt = bot[x];
    const off = Math.abs(x + 0.5 - cam.xc) / (W / 2); // 0 centre .. ~1 at the frame's edge
    // above the wall: the dark set, the rig's bar and its lamps' light falling down the backdrop
    for (let y = 0; y < tp - 2 && y < H; y++) {
      let c = PK.black;
      if (y === truss) c = PK.slate;
      else if (y === truss + 1) c = PK.ink;
      fb[y * W + x] = c;
    }
    // the bezel: two rows of black, the outer one catching the light
    for (let y = Math.max(0, tp - 2); y < tp; y++) fb[y * W + x] = y === tp - 2 ? PK.ink : PK.black;
    // the glass: the wall's picture, one step darker in a dither toward the ends
    const dim = off > 0.62 ? Math.min(0.75, (off - 0.62) * 1.9) : 0;
    for (let y = Math.max(0, tp); y < Math.min(H, bt); y++) {
      const i = y * W + x;
      const m = map[i];
      let c = m >= 0 ? wb[m] : PK.black;
      if (dim > 0 && dim > B4[((y & 3) << 2) | (x & 3)]) c = DOWN_T[H8(c)];
      fb[i] = c;
    }
    // the bezel under the glass, the plinth with its LED line, then the floor
    let y = bt;
    if (y < H) fb[y * W + x] = PK.black, y++;
    if (y < H) fb[y * W + x] = PK.ink, y++;
    if (y < H) fb[y * W + x] = PK.black, y++;
    const ledY = y;
    if (y < H) fb[y * W + x] = ledCore, y++;
    if (y < H) fb[y * W + x] = ledHalo, y++;
    const floor0 = y;
    // the floor: black, the LED's glow on its first rows, the wall mirrored in its polish (two steps darker, in
    // streaks along the floor's grain, thinning with distance; three steps down past the first rows)
    for (; y < H; y++) {
      const i = y * W + x;
      const dy = y - floor0;
      const bay = B4[((y & 3) << 2) | (x & 3)];
      let c = PK.black;
      const ry = ledY - 4 - Math.round(dy * 1.3 * d[x]); // the reflected row of the glass
      const streak = dy % 3 !== 2;
      const k = 0.9 - dy * 0.03;
      if (streak && ry >= tp && ry < bt && k > bay) {
        const m = map[ry * W + x];
        if (m >= 0) {
          c = DOWN_T[H8(DOWN_T[H8(wb[m])])];
          if (dy > 5) c = DOWN_T[H8(c)];
        }
      }
      if (c === PK.black && dy < 3 && (dy === 0 || 0.5 - dy * 0.17 > bay)) c = ledGlow;
      fb[i] = c;
    }
  }
  // the lamps on the rig: a housing, a warm lens, a cone of light down the backdrop (behind the top row's graphics
  // at the sides, seen between them in the middle)
  for (const lx0 of RIG_LAMPS) {
    const lx = Math.round(lx0 - cam.pan * 0.5);
    for (let dx = -1; dx <= 1; dx++) {
      put(fb, lx + dx, truss + 1, PK.steel);
      put(fb, lx + dx, truss + 2, dx === 0 ? PK.cream : PK.slate);
    }
    for (let dy = 3; dy < 12; dy++) {
      const half = 1 + dy * 0.45;
      for (let dx = -Math.ceil(half); dx <= Math.ceil(half); dx++) {
        const x = lx + dx, y = truss + dy;
        if (x < 0 || x >= W || y >= top[Math.max(0, Math.min(W - 1, x))] - 2) continue;
        const k = (1 - Math.abs(dx) / (half + 0.5)) * (1 - dy / 12) * 0.9;
        if (k > B4[((y & 3) << 2) | (x & 3)]) fb[y * W + x] = dy < 6 ? PK.slate : PK.ink;
      }
    }
  }
}

function put(fb, x, y, c) {
  if (x >= 0 && x < W && y >= 0 && y < H) fb[y * W + x] = c;
}

// ------------------------------------------------------------------------------------------- out of focus
const RGB = Object.values(P).map((hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, PK[Object.keys(P).find((k) => P[k] === hex)]];
});
function nearest(r, g, b) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < RGB.length; i++) {
    const c = RGB[i];
    const dr = r - c[0], dg = g - c[1], db = b - c[2];
    const dd = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
    if (dd < bd) [bd, best] = [dd, i];
  }
  return RGB[best][3];
}
let BLUR = null;
/** A 3 x 3 box blur of a small palette picture, back to the nearest palette colours. */
function blur(src, sw, sh) {
  if (!BLUR || BLUR.length !== sw * sh) BLUR = new Uint32Array(sw * sh);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= sh) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= sw) continue;
          const c = src[yy * sw + xx];
          const wgt = dx === 0 && dy === 0 ? 2 : 1;
          r += (c & 255) * wgt;
          g += ((c >>> 8) & 255) * wgt;
          b += ((c >>> 16) & 255) * wgt;
          n += wgt;
        }
      }
      BLUR[y * sw + x] = nearest(r / n, g / n, b / n);
    }
  }
  return BLUR;
}

/**
 * A small picture of the wall, out of focus, into fb's rows y0..y1: blurred, `dim` steps darker (a defocused wall
 * is dimmer than the face in front of it), then enlarged `k` times with an ordered dither between each pixel's
 * nearest texels (the soft edges are dithered, never blended).
 */
export function softWall(fb, src, sw, sh, { k = 4, ox = 0, oy = 0, y0 = 0, y1 = H, dim = 0 } = {}) {
  const s = blur(src, sw, sh);
  for (let d = 0; d < dim; d++) for (let i = 0; i < s.length; i++) s[i] = DOWN_T[H8(s[i])];
  const inv = 1 / k;
  // the texel each pixel takes: its column for each of the matrix's four rows (the jitter depends on x and y & 3)
  if (!SOFT_TU || SOFT_TU.k !== k || SOFT_TU.ox !== ox || SOFT_TU.sw !== sw) {
    SOFT_TU = { k, ox, sw, cols: [0, 1, 2, 3].map((p) => Int16Array.from({ length: W }, (_, x) => Math.max(0, Math.min(sw - 1, Math.floor((x - ox) * inv - 0.5 + B4[(((p + 2) & 3) << 2) | ((x + 1) & 3)]))))) };
  }
  for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) {
    const by = (y & 3) << 2;
    const v = (y - oy) * inv - 0.5;
    const tus = SOFT_TU.cols[y & 3];
    // the row of texels for each of the four columns of the matrix
    const r0 = Math.max(0, Math.min(sh - 1, Math.floor(v + B4[by]))) * sw, r1 = Math.max(0, Math.min(sh - 1, Math.floor(v + B4[by | 1]))) * sw;
    const r2 = Math.max(0, Math.min(sh - 1, Math.floor(v + B4[by | 2]))) * sw, r3 = Math.max(0, Math.min(sh - 1, Math.floor(v + B4[by | 3]))) * sw;
    let o = y * W;
    for (let x = 0; x < W; x += 4, o += 4) {
      fb[o] = s[r0 + tus[x]];
      fb[o + 1] = s[r1 + tus[x + 1]];
      fb[o + 2] = s[r2 + tus[x + 2]];
      fb[o + 3] = s[r3 + tus[x + 3]];
    }
  }
}
let SOFT_TU = null;

// ------------------------------------------------------------------------------------------- light on him
/**
 * The light on the presenter (his frame: Uint32, 0 = clear). The wall behind him rims his silhouette: an edge
 * pixel whose neighbour above or to the side is clear goes one step up its ramp (the side in `rim` fully, the
 * other side in a dither, the top fully); then the wall's cool spill lifts dark cloth one step in a dither that
 * thins over `spill` pixels in from the rimmed side. `from`..`to` limit the columns looked at. `litTo` (a row): the
 * wall lights him only where it is behind him; below its foot (the plinth, the black floor) the rim and the spill
 * thin out over 4 px, so his legs stand in front of the dark plinth instead of glowing against it. Returns his box
 * [x0, y0, x1, y1] (inclusive), or null.
 */
export function lightFigure(px, { rim = 1, spill = 3, top = true, both = 0.5, from = 0, to = W, litTo = H } = {}) {
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  const c0 = Math.max(0, from | 0), c1 = Math.min(W, to | 0);
  for (let y = 0; y < H; y++) {
    const o = y * W;
    for (let x = c0; x < c1; x++) {
      if (px[o + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  const out = LIT && LIT.length === px.length ? LIT : (LIT = new Uint32Array(px.length));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out[y * W + x] = px[y * W + x];
  for (let y = y0; y <= y1; y++) {
    const by = (y & 3) << 2;
    // how much of the wall is behind this row: all of it above its foot, nothing 4 px below it
    const lit = y < litTo ? 1 : 1 - (y - litTo + 1) / 5;
    if (lit <= 0) continue;
    for (let x = x0; x <= x1; x++) {
      const i = y * W + x;
      const c = px[i];
      if (!c) continue;
      const bay = B4[by | (x & 3)];
      if (lit < 1 && lit <= bay) continue;
      const L = x > 0 ? px[i - 1] : 0, R = x < W - 1 ? px[i + 1] : 0, U = y > 0 ? px[i - W] : 0;
      // distance in from the rimmed side (1 = the edge pixel)
      let din = 99;
      for (let k = 1; k <= spill + 1; k++) {
        const xx = x + rim * k;
        if (xx < 0 || xx >= W || !px[i + rim * k]) {
          din = k;
          break;
        }
      }
      let o = c;
      const rimSide = rim > 0 ? !R : !L, other = rim > 0 ? !L : !R;
      if (rimSide || (top && !U) || (other && both > bay)) o = UP_T[H8(c)];
      else if (din <= spill + 1 && (1 - (din - 1) / (spill + 1)) * 0.75 > bay) o = SPILL_T[H8(c)];
      out[i] = o;
    }
  }
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px[y * W + x] = out[y * W + x];
  return [x0, y0, x1, y1];
}
let LIT = null;
