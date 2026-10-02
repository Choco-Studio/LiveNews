// Presenter kit A (owner: PRESENTERS A stream; PRESENTERS B may import it
// read-only): small, allocation-free helpers for hand-pixelled hair and
// wardrobe on top of the procedural parts.
//
// Why a kit: the owner asked that nothing looks "drawn with triangles,
// squares and circles". Every presenter therefore shades hair as clumps
// with separations and broken highlight strokes, and clothes with planes,
// folds, stitching and a continuous rim, instead of one flat fill per shape.
// The helpers keep those rules identical across the cast.
//
//   hash01(n)                         deterministic 0..1 per integer (per-clump variation)
//   LocalXY                           head-local coordinates of a screen pixel, no allocation:
//                                       const q = localXY(head); q.at(px, py); q.x, q.y
//   localBox(head, x0, y0, x1, y1)    screen box of a head-local rectangle (roll aware), shared array
//   HeadWidthLUT                      headHW as a table: const w = new HeadWidthLUT(); w.set(H, jaw).at(y)
//   clumpTone(t, v, u, o)             strand/clump shading of a base tone (see below)
//   rimMat(hex)                       decal material for painted rims (black outline next to it)
//   rimTopRight(buf, g, x0, x1, y0, y1, mat, maxDrop)  continuous top rim on a group's right half
//   selOutEdge(buf, x0, y0, x1, y1, g, gNext, from, to) darker local line where group g meets gNext
//   hairLight(buf, head, g, mat, fromX, toX, topY, botY, maxDrop)  partial top rim (upper right)
//   paintLine(buf, ax, ay, bx, by, mat, tone, g)       1 px Bresenham line painted over group g
//   dashLine(buf, ax, ay, bx, by, mat, tone, g, on, off) the same, dashed (stitching)
import { P } from '../../../palette.js';
import { material, line } from '../pixbuf.js';
import { headHW } from '../head.js';

/** Deterministic hash of an integer to 0..1 (no state, no allocation). */
export function hash01(n) {
  let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Head-local coordinates for per-pixel loops: one object per frame and head,
 * reused for every pixel (head.toLocal allocates an array per call).
 */
export class LocalXY {
  constructor() {
    this.cx = 0;
    this.cy = 0;
    this.c = 1;
    this.s = 0;
    this.k = 1;
    this.x = 0;
    this.y = 0;
  }

  set(head) {
    this.cx = head.cx;
    this.cy = head.cy;
    this.c = head.cr;
    this.s = head.sr;
    this.k = 1 / head.s;
    return this;
  }

  at(px, py) {
    const dx = px - this.cx, dy = py - this.cy;
    this.x = (dx * this.c + dy * this.s) * this.k;
    this.y = (-dx * this.s + dy * this.c) * this.k;
  }
}

/**
 * head.js headHW as a lookup table (per look and jaw opening, rebuilt only when either changes):
 * hair drawers ask for the skull's half-width at every pixel, and headHW's two Math.pow per call
 * were the hot spot of the bob at close-ups. Linear interpolation at 1/20 u.
 */
export class HeadWidthLUT {
  constructor() {
    this.H = null;
    this.jaw = NaN;
    this.y0 = 0;
    this.n = 0;
    this.v = new Float32Array(1024);
  }

  set(H, jaw = 0) {
    if (this.H === H && this.jaw === jaw) return this;
    this.H = H;
    this.jaw = jaw;
    this.y0 = H.top - 4;
    this.n = Math.min(1022, Math.ceil((H.chinY + jaw + 4 - this.y0) * 20));
    for (let i = 0; i <= this.n; i++) this.v[i] = headHW(H, this.y0 + i / 20, jaw);
    return this;
  }

  at(y) {
    let f = (y - this.y0) * 20;
    if (f <= 0) return this.v[0];
    if (f >= this.n) return this.v[this.n];
    const i = f | 0;
    f -= i;
    return this.v[i] + (this.v[i + 1] - this.v[i]) * f;
  }
}

const BOX = [0, 0, 0, 0];
/** Screen-pixel box holding the head-local rectangle (x0,y0)-(x1,y1) after roll; shared array. */
export function localBox(head, x0, y0, x1, y1, out = BOX) {
  const { cx, cy, s, cr, sr } = head;
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (let i = 0; i < 4; i++) {
    const x = i & 1 ? x1 : x0, y = i & 2 ? y1 : y0;
    const px = cx + s * (x * cr - y * sr), py = cy + s * (x * sr + y * cr);
    if (px < a) a = px;
    if (px > c) c = px;
    if (py < b) b = py;
    if (py > d) d = py;
  }
  out[0] = a - 1;
  out[1] = b - 1;
  out[2] = c + 1;
  out[3] = d + 1;
  return out;
}

/**
 * Clump shading for hair. `t` is the tone from the overall form (0 lit .. 3
 * deep), `v` the across-strand coordinate and `u` the along-strand
 * coordinate (head units). Options `o` (reused object, no allocation):
 *   cw     clump width (units)            s      px per unit
 *   seed   per-look variation             sep    draw clump separations (true at close-ups)
 *   hiLo, hiHi  along-strand window (units) where highlight strokes may sit (the sheen band)
 *   hiW    share of a clump's width the highlight stroke covers (0..1)
 *   gap    along-strand period of the breaks in separations (units, 0 = continuous)
 *   keepLit  glossy hair (a bob): the lit area stays lit as tapered clump-shaped
 *          sheen inside the window, with separations one step down
 * Rules (pixel-art hair, not texture): the form's lit area is NOT a flat
 * light patch: it becomes the base tone carrying highlight strokes, one per
 * clump, tapered at both ends and staggered per clump; separations are 1 px
 * shade lines at each clump's far edge, broken along the strand so they never
 * read as stripes; the deep tone is only used inside already shaded areas, so
 * clusters stay clean.
 */
export function clumpTone(t, v, u, o) {
  const cw = o.cw;
  const k = Math.floor(v / cw);
  const w = v / cw - k; // 0..1 across the clump
  const h = hash01(k * 7 + o.seed);
  if (o.sep && t <= 2) {
    const sepW = Math.min(0.45, 1.05 / (cw * o.s));
    if (w > 1 - sepW) {
      const per = o.gap;
      const on = per <= 0 || ((u + h * per) % per + per) % per < per * 0.78;
      if (on) return o.keepLit && t === 0 ? 1 : t <= 1 ? 2 : 3;
    }
  }
  if (o.keepLit && t === 0) {
    // glossy hair keeps its lit sheen; each clump's far side drops one step, in a tapered window
    const lo = o.hiLo + h * 0.9, hi = o.hiHi - (1 - h) * 0.9;
    if (u < lo || u > hi) return 1;
    const e = (u - lo) / (hi - lo);
    return w < 0.9 * Math.sqrt(Math.sin(Math.PI * e)) - 0.1 ? 0 : 1;
  }
  if (o.keepLit && t === 1) return 1;
  if (t <= 1) {
    // one highlight stroke per clump inside the sheen window, staggered and tapered
    const lo = o.hiLo + h * 1.1, hi = o.hiHi - (1 - h) * 1.1;
    if (u > lo && u < hi) {
      const e = (u - lo) / (hi - lo);
      const taper = Math.sqrt(Math.sin(Math.PI * e));
      const a = 0.12 + h * 0.12;
      const width = (t === 0 ? o.hiW * 1.45 : o.hiW * 0.75) * taper;
      if (w > a && w < a + width) return 0;
    }
  }
  return t === 0 ? 1 : t;
}

/** A decal material that paints a rim colour; its outer outline stays black. */
export function rimMat(hex = P.silver) {
  return material(`cast-a:rim:${hex}`, { ramp: [hex], line: P.black, decal: true });
}

/**
 * Continuous rim along the top edge of group `g` for columns x0..x1 (the
 * screen-right shoulder), scanning rows y0..y1. The resolve pass only rims
 * pixels whose right neighbour is empty, which leaves a dotted rim on sloped
 * shoulders; this paints the top pixel of every column instead. maxDrop stops
 * the rim where the edge turns down the side (that part gets resolve's rim).
 */
export function rimTopRight(buf, g, x0, x1, y0, y1, mat, maxDrop = 99) {
  const w = buf.w, grp = buf.grp, m = buf.mat;
  x0 = Math.max(1, Math.round(x0));
  x1 = Math.min(w - 2, Math.round(x1));
  y0 = Math.max(1, Math.round(y0));
  y1 = Math.min(buf.h - 2, Math.round(y1));
  let prev = -1;
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const i = y * w + x;
      if (!m[i]) continue;
      if (grp[i] !== g) break; // something else is in front: no rim here
      if (prev >= 0 && y - prev > maxDrop) return;
      if (!m[i - w]) {
        m[i] = mat;
        buf.tone[i] = 0;
      }
      prev = y;
      break;
    }
  }
}

/**
 * Selective outline at a boundary inside the figure (sel-out): pixels of `matFrom` in group `g`
 * that touch a pixel of group `gNext` (e.g. the hairline against the forehead) switch to `matTo`,
 * the same ramp with a darker LOCAL line colour, so resolve's inner line there is maroon or brown
 * instead of the black outline. Box in screen pixels; no allocation.
 */
export function selOutEdge(buf, x0, y0, x1, y1, g, gNext, matFrom, matTo) {
  const w = buf.w, mat = buf.mat, grp = buf.grp;
  x0 = Math.max(1, Math.floor(x0));
  y0 = Math.max(1, Math.floor(y0));
  x1 = Math.min(w - 2, Math.ceil(x1));
  y1 = Math.min(buf.h - 2, Math.ceil(y1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * w + x;
      if (mat[i] !== matFrom || grp[i] !== g) continue;
      if ((mat[i + w] && grp[i + w] === gNext) || (mat[i - 1] && grp[i - 1] === gNext) || (mat[i + 1] && grp[i + 1] === gNext)) mat[i] = matTo;
    }
  }
}

/**
 * Hair light: a continuous 1 px rim along the top of group g, only from head-local x `fromX`
 * rightwards (the key is camera-left, the hair light upper right), stopping where the edge turns
 * down. Use with `hair.rimTop: false` so the far-left of the crown keeps its own tone.
 */
export function hairLight(buf, head, g, mat, fromX, toX, topY, botY, maxDrop) {
  const { cx, cy, s } = head;
  rimTopRight(buf, g, cx + fromX * s, cx + toX * s, cy + topY * s, cy + botY * s, mat, maxDrop);
}

/** 1 px line painted over pixels of group g (0 = any). */
export function paintLine(buf, ax, ay, bx, by, mat, tone, g = 0) {
  line(ax, ay, bx, by, (x, y) => buf.paint(x, y, mat, tone, g));
}

/** Dashed 1 px line (stitching): `on` px drawn, `off` px skipped. */
export function dashLine(buf, ax, ay, bx, by, mat, tone, g = 0, on = 2, off = 1) {
  let n = 0;
  const per = on + off;
  line(ax, ay, bx, by, (x, y) => {
    if (n++ % per < on) buf.paint(x, y, mat, tone, g);
  });
}
