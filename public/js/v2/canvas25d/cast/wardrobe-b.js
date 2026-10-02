// Drawing kit and wardrobe for PRESENTERS B (owner: PRESENTERS B stream):
// Max Circuit, Ada Volt, Dr Nova Reyes and UNIT-8.
//
// What lives here (imported by cast/max.js, ada.js, nova.js, unit8.js):
//   stroke()        tapered quadratic-Bezier stroke rasterised straight into a
//                   PartBuffer, shaded as a tube (hair clumps, folds, rods)
//   blob()          an irregular rounded clump (curl clusters) with its own
//                   lit crescent and deep crease, so curls read as clusters
//   local()         allocation-free head-local coordinates for per-pixel loops
//   bodyPaint()     1 px tone lines in body space (seams, folds, stitching)
//   outfits         registered with cast/outfit.js registerOutfit():
//                     'knitBlazer'  unstructured blazer over a crew-neck knit (Max)
//                     'turtleneck'  fine-gauge roll-neck, no jacket (Ada)
//                     'cardigan'    open knit cardigan over a round-neck top (Nova)
//                     'chassis'     UNIT-8's casing: neck column, shell, chest plate
// Group ids: the look-owned range 40-55 (character.js GROUPS.look). Folds and
// seams are tone changes inside the garment's own group (no extra outlines);
// lapels, collars and plates are separate groups so the line system draws a
// 1 px edge where they sit over the garment (selective outline: each extra
// material's line is a darker local colour, not black).
// Everything is pixel-art by construction: every pixel is a palette colour
// from a 4-step ramp, and detail is gated by the face LOD tiers
// (s < 1.35 wide, s < 2.2 medium, s >= 2.2 close-up).
import { P } from '../../../palette.js';
import { decal, line, toneN } from '../pixbuf.js';
import { clamp } from '../space.js';
import { headHW } from '../head.js';
import { GROUPS } from '../character.js';
import { registerOutfit, torsoFrame } from './outfit.js';
import { rimMat, rimTopRight } from './kit-a.js';

export const LOOK = GROUPS.look ?? 40; // first look-owned group id
export const tier = (s) => (s < 1.35 ? 0 : s < 2.2 ? 1 : 2);

// ---------------------------------------------------------------------------
// Head-local coordinates without allocation

/** Head-local (units) of screen pixel centre (px, py) into out[0], out[1]; roll respected. */
export function local(head, px, py, out) {
  const dx = px - head.cx, dy = py - head.cy;
  out[0] = (dx * head.cr + dy * head.sr) / head.s;
  out[1] = (-dx * head.sr + dy * head.cr) / head.s;
  return out;
}

/** Head-local units → screen px into out. */
export function screen(head, x, y, out) {
  out[0] = head.cx + head.s * (x * head.cr - y * head.sr);
  out[1] = head.cy + head.s * (x * head.sr + y * head.cr);
  return out;
}

// ---------------------------------------------------------------------------
// Fast per-pixel helpers (hair drawers call them for every pixel of a large box)

const HW_STEP = 1 / 32;
const HW_TABLES = new WeakMap();
/** headHW(L.head, y, 0) from a per-look table (1/32 u steps, built once); ≤ 0 outside the head. */
export function hwAt(L, y) {
  let tb = HW_TABLES.get(L);
  if (!tb) {
    const H = L.head;
    const y0 = H.top - 4, n = Math.ceil((H.chinY + 4 - y0) / HW_STEP) + 1;
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = headHW(H, y0 + i * HW_STEP, 0);
    tb = { y0, n, a };
    HW_TABLES.set(L, tb);
  }
  const i = Math.round((y - tb.y0) / HW_STEP);
  return i < 0 || i >= tb.n ? -1 : tb.a[i];
}

/** atan2 approximation (|error| < 0.0015 rad), enough for outline wobbles and lobes. */
export function fastAtan2(y, x) {
  const ax = x < 0 ? -x : x, ay = y < 0 ? -y : y;
  const mx = ax > ay ? ax : ay;
  if (mx === 0) return 0;
  const a = (ax < ay ? ax : ay) / mx;
  const s2 = a * a;
  let r = ((-0.0464964749 * s2 + 0.15931422) * s2 - 0.327622764) * s2 * a + a;
  if (ay > ax) r = 1.57079637 - r;
  if (x < 0) r = 3.14159274 - r;
  return y < 0 ? -r : r;
}

/** Deterministic 0..1 hash of an integer and a seed (per-strand variation; no state, no allocation). */
export function hashInt(n, seed = 0) {
  let h = Math.imul((n | 0) ^ Math.imul(seed | 0, 0x27d4eb2d) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Strand shading for straight or combed hair (pixel-art rules, not texture). `form` is the tone of
 * the hair mass from the light (0 lit .. 3 deep), `v` the across-strand coordinate and `u` the
 * along-strand coordinate (units). Options `o` (one reused object):
 *   sw     clump width (units)        s     px per unit           seed  per-look variation
 *   lo, hi along-strand window of the sheen (units): one highlight stroke per clump inside it,
 *          staggered and tapered, lifting the clump one step (two at its core when `spec`)
 *   sep    1 px separations at each clump's far edge, broken along the strand (close-ups)
 *   gap    along-strand period of those breaks (units)
 * Lit areas never become a flat light patch: they carry the strokes; the deep tone stays inside
 * shaded areas, so the clusters stay clean.
 */
export function strandTone(form, v, u, o) {
  const sw = o.sw;
  const k = Math.floor(v / sw);
  const w = v / sw - k; // 0..1 across the clump
  const h = hashInt(k, o.seed);
  if (o.sep && form >= 1 && h < (o.sepShare ?? 1)) {
    const sepW = Math.min(0.45, 1.05 / (sw * o.s));
    if (w > 1 - sepW) {
      const per = o.gap;
      if (((u + h * per) % per + per) % per < per * (o.sepOn ?? 0.72)) return form >= 2 ? 3 : 2;
    }
  }
  if (form <= 2 && h > (o.skip || 0)) {
    const lo = o.lo + (h - 0.5) * o.stagger, hi = o.hi + (hashInt(k, o.seed + 7) - 0.5) * o.stagger;
    if (u > lo && u < hi) {
      const e = (u - lo) / (hi - lo);
      const taper = Math.sqrt(Math.sin(Math.PI * e));
      const a = 0.18 + h * 0.2;
      const width = o.hiW * taper;
      if (w > a && w < a + width) {
        if (o.spec && h > 0.62 && e > 0.38 && e < 0.62 && w > a + width * 0.3 && w < a + width * 0.7) return form - 2 < 0 ? 0 : form - 2;
        return form - 1 < 0 ? 0 : form - 1;
      }
    }
  }
  return form;
}

// ---------------------------------------------------------------------------
// stroke(): tapered quadratic Bezier, shaded as a tube

const MAXSEG = 12;
const SX = new Float64Array(MAXSEG + 1), SY = new Float64Array(MAXSEG + 1), SR = new Float64Array(MAXSEG + 1);
let ONLY = 0; // when set, stroke() only repaints pixels already in this group (folds inside a garment)

/**
 * Rasterise a tapered stroke (screen px) from A via control B to C, radius r0 → r1, into the
 * current group of `buf`. tone(nx, ny, u, a) returns 0..3 (or -1 to skip) from the tube normal
 * (nx, ny, screen space, |n| ≤ 1), the position u along (0 root → 1 tip) and a, the signed
 * distance across (-1 .. 1, negative on the stroke's left when walking from A to C).
 * Default tone: plain tube shading with the material's thresholds. `belly` (px) widens the middle
 * (a leaf-shaped clump: thin root, full body, soft point).
 */
export function stroke(buf, m, ax, ay, bx, by, cx, cy, r0, r1, tone = null, n = 8, belly = 0) {
  n = Math.max(2, Math.min(MAXSEG, n | 0));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i <= n; i++) {
    const u = i / n, v = 1 - u;
    const x = v * v * ax + 2 * u * v * bx + u * u * cx;
    const y = v * v * ay + 2 * u * v * by + u * u * cy;
    const r = r0 + (r1 - r0) * u + belly * Math.sin(Math.PI * Math.min(1, u * 1.15));
    SX[i] = x;
    SY[i] = y;
    SR[i] = r;
    if (x - r < minX) minX = x - r;
    if (x + r > maxX) maxX = x + r;
    if (y - r < minY) minY = y - r;
    if (y + r > maxY) maxY = y + r;
  }
  const x0 = Math.max(1, Math.floor(minX)), y0 = Math.max(1, Math.floor(minY));
  const x1 = Math.min(buf.w - 1, Math.ceil(maxX) + 1), y1 = Math.min(buf.h - 1, Math.ceil(maxY) + 1);
  if (x1 <= x0 || y1 <= y0) return;
  buf._touch(x0, y0, x1, y1);
  const { w, mat, tone: tn, grp, z, clipY } = buf;
  const g = buf.g, cz = buf.cz, clip = buf.clip;
  for (let y = y0; y < y1; y++) {
    const py = y + 0.5;
    for (let x = x0; x < x1; x++) {
      if (clip && y >= clipY[x]) continue;
      if (ONLY && (grp[y * w + x] !== ONLY || !mat[y * w + x])) continue;
      const px = x + 0.5;
      // nearest segment by (distance / radius)², one square root per pixel at the end
      let best = 4, bu = 0, bex = 0, bey = 0, br = 1, bside = 0;
      for (let j = 0; j < n; j++) {
        const sx = SX[j], sy = SY[j];
        const dx = SX[j + 1] - sx, dy = SY[j + 1] - sy;
        const l2 = dx * dx + dy * dy || 1e-9;
        let t = ((px - sx) * dx + (py - sy) * dy) / l2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = px - (sx + dx * t), ey = py - (sy + dy * t);
        const r = SR[j] + (SR[j + 1] - SR[j]) * t;
        if (r <= 0.05) continue;
        const d2 = (ex * ex + ey * ey) / (r * r);
        if (d2 < best) {
          best = d2;
          bu = (j + t) / n;
          bex = ex;
          bey = ey;
          br = r;
          bside = dx * ey - dy * ex;
        }
      }
      if (best >= 1) continue;
      best = Math.sqrt(best);
      const nx = bex / br, ny = bey / br;
      const tt = tone ? tone(nx, ny, bu, bside < 0 ? -best : best) : toneN(m, nx * 0.95, ny * 0.95);
      if (tt < 0) continue;
      const i = y * w + x;
      mat[i] = m;
      tn[i] = tt;
      if (!ONLY) {
        grp[i] = g;
        z[i] = cz;
      }
    }
  }
}

/**
 * A soft fabric fold inside a garment (body-space points a → b via c, half-width `hw` units at its
 * middle, tapering at both ends): a shaded core with a lit lip on the side toward the key. Only
 * repaints pixels of `group`, so a fold never changes the silhouette.
 */
export function fabricFold(o, mat, group, a, c, b, hw, lit = 0, core = 2) {
  const { buf, toS, s } = o;
  const [ax, ay] = toS(a[0], a[1]);
  const [cx, cy] = toS(c[0], c[1]);
  const [bx, by] = toS(b[0], b[1]);
  ONLY = group;
  stroke(buf, mat, ax, ay, cx, cy, bx, by, 0.2, 0.2, (nx, ny, u, aa) => {
    // a soft valley: the shaded core along the middle, the lit lip on the side toward the key
    const litSide = -0.6 * nx - 0.8 * ny > 0.15;
    if (Math.abs(aa) > 0.45) return litSide ? lit : -1;
    return core;
  }, 8, hw * s);
  ONLY = 0;
}

/**
 * An irregular rounded clump centred at screen (cx, cy), radius r px: a disc whose edge is
 * pushed in and out by `wob` (0..0.3) with phase `ph`, shaded with a lit crescent toward the key,
 * a deep crease on the far side and `bias` added to every tone. `sph(nx, ny)` optionally mixes in
 * the larger form's normal (a curl on a round head of hair is lit like the head). `hi` false keeps
 * the crescent one step down (only clusters that face the key get the highlight colour).
 */
const BLOB = { sx: 0, sy: 0, mix: 0 };
export function blob(buf, m, cx, cy, r, wob, ph, bias = 0, sph = null, hi = true) {
  const R = r * (1 + wob);
  const x0 = Math.max(1, Math.floor(cx - R)), y0 = Math.max(1, Math.floor(cy - R));
  const x1 = Math.min(buf.w - 1, Math.ceil(cx + R) + 1), y1 = Math.min(buf.h - 1, Math.ceil(cy + R) + 1);
  if (x1 <= x0 || y1 <= y0) return;
  buf._touch(x0, y0, x1, y1);
  const { w, mat, tone: tn, grp, z, clipY } = buf;
  const g = buf.g, cz = buf.cz, clip = buf.clip;
  if (sph) sph(cx, cy, BLOB);
  // lobes: sin(3a + ph) and sin(5a - 1.7 ph) from the unit direction (no atan2 / sin per pixel)
  const c3 = Math.cos(ph), s3 = Math.sin(ph), c5 = Math.cos(-1.7 * ph), s5 = Math.sin(-1.7 * ph);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (clip && y >= clipY[x]) continue;
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const dl2 = dx * dx + dy * dy;
      if (dl2 >= R * R) continue;
      const il = dl2 > 1e-9 ? 1 / Math.sqrt(dl2) : 0;
      const ca = dx * il, sa = dy * il;
      const sa2 = sa * sa, ca2 = ca * ca;
      const sin3 = sa * (3 - 4 * sa2), cos3 = ca * (4 * ca2 - 3);
      const sin5 = sa * (16 * sa2 * sa2 - 20 * sa2 + 5), cos5 = ca * (16 * ca2 * ca2 - 20 * ca2 + 5);
      const rr = r * (1 + wob * (sin3 * c3 + cos3 * s3) * 0.7 + wob * 0.3 * (sin5 * c5 + cos5 * s5));
      const d2 = dl2 / (rr * rr);
      if (d2 >= 1) continue;
      let nx = dx / rr, ny = dy / rr;
      if (sph) {
        nx = nx * (1 - BLOB.mix) + BLOB.sx * BLOB.mix;
        ny = ny * (1 - BLOB.mix) + BLOB.sy * BLOB.mix;
      }
      // explicit cluster tones: a lit crescent toward the key, the body, a shaded far side
      const lit = -0.6 * nx - 0.8 * ny;
      let t = (lit > 0.55 && d2 > 0.25 ? (hi ? 0 : 1) : lit < -0.35 ? 2 : 1) + bias;
      // the crease where this clump tucks under its neighbour (far side, outer ring)
      if (d2 > 0.6 && dx + dy * 0.8 > rr * 0.3) t = 3;
      const i = y * w + x;
      mat[i] = m;
      tn[i] = t < 0 ? 0 : t > 3 ? 3 : t;
      grp[i] = g;
      z[i] = cz;
    }
  }
}

// ---------------------------------------------------------------------------
// A rim light that never sparkles: only continuous runs of column tops get it

const TOPS = new Int16Array(400);
/**
 * Paint `rim` (a decal material) on the topmost pixel of every column x0..x1 (scanning rows y0..y1)
 * whose top belongs to groups g0..g1, but only along runs of at least `minRun` columns whose tops
 * step by ≤ 1 px, and only where keep(x, y) allows (e.g. the upper part of a head of hair). A
 * scalloped or clumpy outline then gets short continuous arcs instead of isolated bright pixels.
 */
export function rimRuns(buf, g0, g1, x0, x1, y0, y1, rim, minRun = 3, keep = null) {
  x0 = Math.max(1, Math.round(x0));
  x1 = Math.min(buf.w - 2, Math.round(x1), x0 + TOPS.length - 1);
  y0 = Math.max(1, Math.round(y0));
  y1 = Math.min(buf.h - 2, Math.round(y1));
  const w = buf.w, M = buf.mat, Gr = buf.grp;
  for (let x = x0; x <= x1; x++) {
    let top = -1;
    for (let y = y0; y <= y1; y++) {
      const i = y * w + x;
      if (!M[i]) continue;
      if (Gr[i] >= g0 && Gr[i] <= g1 && (!keep || keep(x, y))) top = y;
      break;
    }
    TOPS[x - x0] = top;
  }
  let start = x0;
  for (let x = x0; x <= x1 + 1; x++) {
    const t = x <= x1 ? TOPS[x - x0] : -1;
    const prev = x > start ? TOPS[x - 1 - x0] : -1;
    const cont = x <= x1 && t >= 0 && (x === start || (prev >= 0 && Math.abs(t - prev) <= 1));
    if (cont) continue;
    if (x - start >= minRun) for (let q = start; q < x; q++) buf.paint(q, TOPS[q - x0], rim, 0);
    start = t >= 0 ? x : x + 1;
  }
}

// ---------------------------------------------------------------------------
// Body-space helpers for outfits (o = { buf, L, m, sk, toS, s, gb, G, clip })

/** Paint a 1 px polyline (body-space points [[x, y], ...]) in `mat` / `tone`, only over `group`. */
export function bodyPaint(o, pts, mat, tone, group, dx = 0) {
  const { buf, toS } = o;
  let prev = null;
  for (const p of pts) {
    const q = toS(p[0], p[1]);
    if (prev) line(prev[0] + dx, prev[1], q[0] + dx, q[1], (x, y) => buf.paint(x, y, mat, tone, group));
    prev = q;
  }
}

/** Catmull-Rom through control points (any units), `sub` samples per span: organic outlines. */
export function smoothPts(ctrl, sub) {
  const out = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    for (let k = 0; k < sub; k++) {
      const t = k / sub, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(ctrl[ctrl.length - 1]);
  return out;
}

/** Polygon from body-space points, with the breathing / shrug lift of torsoFrame. */
function bodyPoly(o, lift, pts) {
  const out = [];
  for (const [x, y] of pts) out.push(...o.toS(x, lift(x < 0 ? -1 : 1, y)));
  return out;
}

/**
 * Cloth tone for a torso panel: a lit strip toward the key, broad base, shade on the far side,
 * shoulder tops catching light, a soft occlusion band under the collar. Returns fn(x, y).
 */
function clothTone(o, opts = {}) {
  const { toS, s, L } = o;
  const T = L.torso;
  const c = toS(0, 10);
  const halfW = T.shoulderHW * s;
  const topY = toS(0, T.shoulderTop)[1];
  const litEdge = opts.litEdge ?? -0.8, shadeEdge = opts.shadeEdge ?? 0.58, deepEdge = opts.deepEdge ?? 0.9;
  const chest = (opts.chest ?? 1) && s >= 1.35; // the widening lit plane needs room to read
  return (x, y) => {
    const nx = (x + 0.5 - c[0]) / halfW;
    const top = (y + 0.5 - topY) / s; // units below the shoulder line
    const ax = nx < 0 ? -nx : nx;
    if (top < 2.0 && ax > 0.36 && ax < 0.9) return nx < 0 ? 0 : 1;
    // the torso turns away more toward the waist: the terminator slants in as it goes down
    const k = top < 0 ? 0 : top > 28 ? 1 : top / 28;
    // the lit strip on the key side is widest across the upper chest and narrows toward the waist
    const lit = litEdge + (chest ? 0.16 * (1 - k) * (1 - k) : 0) + 0.04 * k;
    if (nx < lit) return 0;
    if (nx < shadeEdge - 0.1 * k) return 1;
    if (nx < deepEdge - 0.05 * k) return 2;
    return 3;
  };
}

/**
 * Seated drape inside a garment group: with the hands on the desk the cloth pulls from under the
 * arms toward the front, so two diagonal tension folds per side (one in the medium), softer and
 * shorter for knits (`soft`). Medium shots get a single 1 px line; the wide gets none.
 */
function drape(o, mat, group, t, soft = 0) {
  if (t === 0) return;
  const T = o.L.torso;
  const k = 1 - soft * 0.3;
  // from under the arm (its start hides behind the sleeve) sweeping down toward the front
  // (the sleeves cover |x| > ~shoulderHW - 2 rUpper, so the folds start just under the sleeve edge)
  const xa = T.sideHW - 5.0, xb = T.sideHW - 11.5 * k;
  for (const side of [-1, 1]) {
    if (t === 1) {
      bodyPaint(o, [[side * (xa - 3), 13.2], [side * xb, 17.6]], mat, side < 0 ? 1 : 2, group);
      continue;
    }
    const lit = side < 0 ? 0 : 1, core = side < 0 ? 2 : 3;
    fabricFold(o, mat, group, [side * xa, 13.4], [side * (xa - 3.4 * k), 14.6], [side * xb, 18.4 - soft], 0.7 * k, lit, core);
    if (o.s >= 3 && !soft) fabricFold(o, mat, group, [side * (xa + 0.4), 21.0], [side * (xa - 2.2), 22.0], [side * (xb + 2.8), 23.6 - soft], 0.45 * k, lit, core);
  }
}

// ---------------------------------------------------------------------------
// MAX: unstructured blazer, open, over a dark crew-neck knit

function knitBlazer(o) {
  const { buf, L, m, s, gb, G, clip } = o;
  const { T, lift, outline } = torsoFrame(o);
  const t = tier(s);
  const vY = T.vDepth;
  const nk = T.neckHW;

  // ---- jacket body (full silhouette; the knit is cut into it afterwards)
  buf.part(gb + G.jacket, 8, clip);
  const body = [];
  for (const [x, y] of outline) body.push(x, y);
  buf.poly(body, m.jacket, clothTone(o, { litEdge: -0.82, shadeEdge: 0.6 }));

  // ---- knit: the long open V from the collar to the bottom (an unbuttoned jacket)
  buf.part(gb + G.shirt, 6, clip);
  const knitPts = bodyPoly(o, lift, [
    [-nk - 1.3, -1.9], [nk + 1.3, -1.9], [nk + 0.6, 4.0], [3.0, vY - 2], [2.4, T.bottom + 2],
    [-2.4, T.bottom + 2], [-3.0, vY - 2], [-nk - 0.6, 4.0],
  ]);
  const kc = o.toS(0, 0);
  buf.poly(knitPts, m.shirt, 1);
  // crew-neck rib band hugging the neck, then the neck shadow inside it
  buf.part(gb + LOOK + 1, 7, clip);
  const rib = [];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const a = Math.PI * (i / N);
    rib.push(...o.toS(-Math.cos(a) * (nk + 0.55), -1.7 + Math.sin(a) * 3.2));
  }
  for (let i = N; i >= 0; i--) {
    const a = Math.PI * (i / N);
    rib.push(...o.toS(-Math.cos(a) * (nk - 0.35), -2.4 + Math.sin(a) * 2.0));
  }
  const ribStep = Math.max(2, Math.round(0.85 * s));
  buf.poly(rib, m.rib, (x, y) => {
    if (t < 2) return x + 0.5 < kc[0] ? 1 : 2;
    const k = ((x - Math.round(kc[0])) % ribStep + ribStep) % ribStep;
    return k === 0 ? 2 : x + 0.5 < kc[0] - 1.5 * s ? 0 : 1;
  });

  // ---- lapels: soft notch lapels in their own group (1 px darker-local edge where they lie on the body)
  buf.part(gb + LOOK + 0, 9, clip);
  for (const side of [-1, 1]) {
    const pts = bodyPoly(o, lift, [
      [side * (nk + 0.25), -2.0], [side * (nk + 2.9), 2.4], [side * (nk + 3.5), 4.6], [side * (nk + 5.2), 5.0],
      [side * (nk + 4.4), 8.6], [side * 3.3, vY - 1.2], [side * 3.0, vY - 2.0], [side * (nk + 0.6), 4.0], [side * (nk + 1.3), -1.9],
    ]);
    const lit = side < 0;
    const edgeX = o.toS(side * (nk + 3.0), 0)[0];
    buf.poly(pts, m.lapel, (x) => {
      if (!lit) return 2;
      return Math.abs(x + 0.5 - edgeX) < s * 0.9 ? 0 : 1;
    });
    if (t >= 1) {
      // the gorge notch: a short dark cut between collar and lapel
      bodyPaint(o, [[side * (nk + 3.4), 4.5], [side * (nk + 4.3), 5.2]], m.lapel, 3, gb + LOOK + 0);
    }
    if (t === 2 && lit) {
      // pick stitching 1 px inside the lit lapel's outer edge
      bodyPaint(o, [[side * (nk + 4.5), 6.0], [side * (nk + 3.7), 8.9], [side * 3.4, vY - 3.2]], m.lapel, 0, gb + LOOK + 0, 1);
    }
  }

  // ---- seams and folds (tone lines inside the jacket group)
  const gJ = gb + G.jacket;
  drape(o, m.jacket, gJ, t, 0);
  if (t >= 1) {
    // the open fronts: a slight roll where each front edge turns back, and the button
    for (const side of [-1, 1]) bodyPaint(o, [[side * 3.4, vY - 1.0], [side * 3.0, T.bottom]], m.jacket, side < 0 ? 0 : 2, gJ, side < 0 ? -1 : 1);
    if (t === 2) {
      // the button on the open front: a small dark disc with a lit rim toward the key
      const [bx, by] = o.toS(-4.6, vY + 3.4);
      const r = Math.max(1, Math.round(o.s * 0.3));
      for (let j = 0; j <= r; j++) for (let i = 0; i <= r; i++) buf.paint(Math.round(bx) + i, Math.round(by) + j, m.jacket, i === 0 && j === 0 ? 1 : 3, gJ);
    }
  }
  if (t === 2) {
    // shoulder seams (soft shoulders, no padding) and a patch pocket on the far chest
    for (const side of [-1, 1]) bodyPaint(o, [[side * (nk + 5.4), 0.6], [side * (T.shoulderHW * 0.84), T.shoulderTop + 0.9]], m.jacket, side < 0 ? 1 : 3, gJ);
    const px0 = T.shoulderHW * 0.36, py0 = 8.6, pw = 4.6, ph = 3.9;
    bodyPaint(o, [[px0, py0], [px0 + pw, py0]], m.jacket, 0, gJ); // the pocket's top edge catches the key
    bodyPaint(o, [[px0, py0 + 0.4], [px0 + pw, py0 + 0.4]], m.jacket, 3, gJ, 0);
    bodyPaint(o, [[px0 + pw, py0 + 0.6], [px0 + pw - 0.1, py0 + ph]], m.jacket, 3, gJ);
    bodyPaint(o, [[px0 + 0.4, py0 + ph], [px0 + pw - 0.2, py0 + ph]], m.jacket, 2, gJ);
  }
}

// ---------------------------------------------------------------------------
// ADA: fine-gauge roll-neck, no jacket

function turtleneck(o) {
  const { buf, L, m, s, gb, G, clip } = o;
  const { T, lift, outline } = torsoFrame(o);
  const t = tier(s);
  const nk = T.neckHW;
  buf.part(gb + G.jacket, 8, clip);
  const body = [];
  for (const [x, y] of outline) body.push(x, y);
  buf.poly(body, m.jacket, clothTone(o, { litEdge: -0.8, shadeEdge: 0.55 }));
  const gJ = gb + G.jacket;
  drape(o, m.jacket, gJ, t, 1);
  if (t === 2) {
    // set-in shoulder seams of a fitted knit
    for (const side of [-1, 1]) bodyPaint(o, [[side * (nk + 3.6), 1.0], [side * (T.shoulderHW * 0.86), T.shoulderTop + 1.4]], m.jacket, side < 0 ? 1 : 3, gJ);
  }
  // ---- the roll collar: a soft knit tube up the neck, folded over once: the roll bulges a little at the
  // fold and casts a crease shadow on the band below, which flares into the shoulders; vertical ribs
  buf.part(gb + LOOK + 1, 9, clip);
  const neckHW = L.neck.hw;
  const topY = -5.0, foldY = -2.4, baseY = 1.0;
  const right = smoothPts([
    [0, topY - 0.75], [neckHW + 0.5, topY - 0.5], [neckHW + 1.25, topY + 0.3], [neckHW + 1.75, foldY - 0.7],
    [neckHW + 1.9, foldY + 0.25], [neckHW + 1.55, foldY + 1.15], [nk + 1.5, baseY - 0.9], [nk + 2.5, baseY + 0.15],
    [nk + 0.9, baseY + 1.0], [0, baseY + 1.45],
  ], 3);
  const ring = [];
  for (const [x, y] of right) ring.push([x, y]);
  for (let i = right.length - 2; i > 0; i--) ring.push([-right[i][0], right[i][1]]);
  const pts = bodyPoly(o, lift, ring);
  const c = o.toS(0, 0);
  const fy = o.toS(0, foldY + 0.3)[1];
  const ty = o.toS(0, topY - 0.75)[1];
  const ribStep = Math.max(2, Math.round(0.85 * s));
  const hw = (neckHW + 1.9) * s;
  buf.poly(pts, m.collar, (x, y) => {
    const nx = (x + 0.5 - c[0]) / hw;
    const yy = y + 0.5;
    let tt;
    if (t >= 1 && yy > fy - 0.5 && yy < fy + 0.5 + (t === 2 ? 0.6 : 0)) return 3; // the crease under the roll
    if (yy < fy) {
      // the roll: a soft cylinder lit from the left, its rounded top edge catching the key
      tt = nx < -0.5 ? 0 : nx < 0.42 ? 1 : nx < 0.82 ? 2 : 3;
      if (t === 2 && yy < ty + 1.6 && nx < 0.1) tt = 0;
    } else {
      // the band below sits in the roll's shadow at first, then opens toward the shoulders
      tt = nx < -0.7 ? 0 : nx < 0.5 ? 1 : nx < 0.85 ? 2 : 3;
      if (t >= 1 && yy < fy + 0.5 + s * 0.9 && tt < 2) tt = 2; // just under the crease: the roll's shadow
    }
    if (t === 2 && tt <= 1) {
      const k = ((x - Math.round(c[0])) % ribStep + ribStep) % ribStep;
      if (k === 0) tt += 1; // ribs: one step darker, only in the lit and mid tones
    }
    return tt;
  });
}

// ---------------------------------------------------------------------------
// NOVA: open knit cardigan over a round-neck top

function cardigan(o) {
  const { buf, L, m, s, gb, G, clip } = o;
  const { T, lift, outline } = torsoFrame(o);
  const t = tier(s);
  const nk = T.neckHW;
  const vY = T.vDepth;
  // ---- cardigan body
  buf.part(gb + G.jacket, 8, clip);
  const body = [];
  for (const [x, y] of outline) body.push(x, y);
  buf.poly(body, m.jacket, clothTone(o, { litEdge: -0.8, shadeEdge: 0.56 }));
  // ---- the top inside the opening: a round neckline showing a little skin
  buf.part(gb + G.shirt, 6, clip);
  const topPts = bodyPoly(o, lift, [
    [-nk - 2.0, -1.4], [nk + 2.0, -1.4], [nk + 1.6, 6.0], [1.2, vY + 0.6], [-1.2, vY + 0.6], [-nk - 1.6, 6.0],
  ]);
  const c = o.toS(0, 0);
  buf.poly(topPts, m.shirt, (x) => (x + 0.5 < c[0] - 1.5 * s ? 1 : x + 0.5 > c[0] + 2.0 * s ? 2 : 1));
  const neck = [];
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI * (i / 12);
    neck.push(...o.toS(-Math.cos(a) * (nk + 0.1), -1.9 + Math.sin(a) * 3.4));
  }
  buf.poly(neck, m.skin, (x) => (x + 0.5 > c[0] + nk * 0.4 * s ? 2 : 1));
  // ---- button bands: up both edges of the V, then one band down the closed front (own group: a 1 px edge)
  buf.part(gb + LOOK + 0, 9, clip);
  for (const side of [-1, 1]) {
    const band = bodyPoly(o, lift, [
      [side * (nk + 2.0), -1.6], [side * (nk + 3.4), -1.4], [side * (nk + 3.0), 6.4], [side * 2.6, vY + 0.4], [side * 1.0, vY + 1.2], [side * 0.9, vY - 0.6], [side * (nk + 1.6), 6.0],
    ]);
    buf.poly(band, m.band, side < 0 ? 0 : 2);
  }
  const front = bodyPoly(o, lift, [[-2.2, vY - 0.2], [1.0, vY + 0.6], [1.2, T.bottom + 2], [-2.0, T.bottom + 2]]);
  buf.poly(front, m.band, 1);
  if (t >= 1) {
    // buttons down the closed front, a darker centre and a lit lip
    const gBand = gb + LOOK + 0;
    for (let by = vY + 2.2; by < T.bottom; by += 6.5) {
      const [bx, byy] = o.toS(-0.5, by);
      buf.paint(Math.round(bx), Math.round(byy), m.band, 3, gBand);
      if (t === 2) {
        buf.paint(Math.round(bx) + 1, Math.round(byy), m.band, 2, gBand);
        buf.paint(Math.round(bx), Math.round(byy) - 1, m.band, 0, gBand);
      }
    }
  }
  // ---- drape: soft knit folds under the arms and a shoulder seam dropped off the shoulder
  const gJ = gb + G.jacket;
  drape(o, m.jacket, gJ, t, 1);
  if (t === 2) {
    for (const side of [-1, 1]) bodyPaint(o, [[side * (T.shoulderHW * 0.7), T.shoulderTop * 0.6], [side * (T.shoulderHW * 0.93), T.shoulderTop + 3.0]], m.jacket, side < 0 ? 1 : 3, gJ);
  }
  if (L.necklace) drawChain(o, L.necklace, t);
}

/** A fine chain with a small bar pendant, resting in the neckline. */
function drawChain(o, [hi, lo], t) {
  if (t === 0) return;
  const { buf, L, toS, s } = o;
  // medium shots: one quiet tone (a bright chain at 1-2 px per link would read as noise)
  const a = decal(t === 2 ? hi : lo), b = decal(lo);
  const nk = L.torso.neckHW;
  let prev = null;
  for (let i = 0; i <= 16; i++) {
    const ang = Math.PI * (i / 16);
    const [x, y] = toS(-Math.cos(ang) * (nk - 0.3), 0.4 + Math.sin(ang) * 3.4);
    const p = [Math.round(x), Math.round(y)];
    if (prev) line(prev[0], prev[1], p[0], p[1], (px, py) => buf.paint(px, py, i < 9 ? a : b, 1));
    prev = p;
  }
  const [px, py] = toS(0, 4.4);
  const len = Math.max(1, Math.round(s * 0.55));
  for (let j = 1; j <= len; j++) buf.paint(Math.round(px), Math.round(py) + j, j === 1 ? a : b, 1);
}

// ---------------------------------------------------------------------------
// UNIT-8: neck column, graphite shell, articulated shoulder caps, the plain chest plate

/** Rounded rectangle (body units) as a polygon with the torso's shoulder lift: corners rt (top) / rb (bottom). */
function roundedPlate(o, lift, x0, x1t, x1b, y0, y1, rt, rb) {
  const out = [];
  const arc = (cx, cy, r, a0, a1) => {
    for (let k = 0; k <= 4; k++) {
      const a = a0 + ((a1 - a0) * k) / 4;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      out.push(...o.toS(x, lift(x < 0 ? -1 : 1, y)));
    }
  };
  const P2 = Math.PI / 2;
  arc(-x1t + rt, y0 + rt, rt, Math.PI, Math.PI + P2); // top left
  arc(x1t - rt, y0 + rt, rt, -P2, 0); // top right
  arc(x1b - rb, y1 - rb, rb, 0, P2); // bottom right
  arc(-x1b + rb, y1 - rb, rb, P2, Math.PI); // bottom left
  return out;
}

function chassis(o) {
  const { buf, L, m, s, gb, G, clip } = o;
  const F = torsoFrame(o);
  const { T, lift, outline } = F;
  const t = tier(s);
  const nk = T.neckHW;
  const c0 = o.toS(0, 0);
  // ---- neck column: a machined cylinder with two grooves (rings), lit on the key side
  buf.part(gb + LOOK + 5, 5, clip);
  const neckHW = L.neck.hw;
  const col = bodyPoly(o, lift, [[-neckHW, -6.2], [neckHW, -6.2], [neckHW + 0.3, 0.5], [-neckHW - 0.3, 0.5]]);
  const g1 = o.toS(0, -4.2)[1], g2 = o.toS(0, -2.0)[1];
  buf.poly(col, m.joint, (x, y) => {
    const yy = y + 0.5;
    if (t >= 1 && (Math.abs(yy - g1) < 0.5 || Math.abs(yy - g2) < 0.5)) return 3;
    if (t === 2 && (Math.abs(yy - g1 - 1) < 0.5 || Math.abs(yy - g2 - 1) < 0.5) && x + 0.5 < c0[0]) return 0; // the ring's lit lower lip
    const nx = (x + 0.5 - c0[0]) / (neckHW * s);
    return nx < -0.5 ? 0 : nx < 0.35 ? 1 : 2;
  });
  // ---- shell: graphite, lit strip on the key side, the far third in shade
  buf.part(gb + G.jacket, 8, clip);
  const body = [];
  for (const [x, y] of outline) body.push(x, y);
  buf.poly(body, m.jacket, clothTone(o, { litEdge: -0.78, shadeEdge: 0.5, deepEdge: 0.86 }));
  const gJ = gb + G.jacket;
  if (t === 2) {
    // abdomen (close-ups): two flexible segments under the chest, a dark seam with its lower lip lit
    // on the key side, stopping short of the flanks so they never read as stripes
    for (const y of [24.5, 29.5]) {
      bodyPaint(o, [[-T.sideHW * 0.72, y], [T.sideHW * 0.72, y]], m.jacket, 3, gJ);
      bodyPaint(o, [[-T.sideHW * 0.72, y + 1 / s], [-T.sideHW * 0.25, y + 1 / s]], m.jacket, 0, gJ);
    }
  }
  // collar ring where the neck meets the shell: a flat steel ring, lit on its upper-left
  buf.part(gb + LOOK + 6, 9, clip);
  const ring = bodyPoly(o, lift, [[-(nk + 1.3), -1.5], [nk + 1.3, -1.5], [nk + 1.8, 0.4], [nk * 0.7, 1.7], [-nk * 0.7, 1.7], [-(nk + 1.8), 0.4]]);
  const ry = o.toS(0, -1.5)[1];
  buf.poly(ring, m.plate, (x, y) => {
    if (t >= 1 && y + 0.5 - ry < 1 && x + 0.5 < c0[0] + nk * 0.3 * s) return 0;
    return x + 0.5 < c0[0] - nk * 0.5 * s ? 1 : x + 0.5 < c0[0] + nk * 0.6 * s ? 2 : 3;
  });
  // ---- the chest plate: plain, raised, a 1 px silver seam along its top (cosmos.md: no lights, no meter)
  buf.part(gb + LOOK + 4, 9, clip);
  const top = 5.4, bot = 19.6, hwT = 8.6, hwB = 7.2;
  const plate = roundedPlate(o, lift, 0, hwT, hwB, top, bot, 1.6, 2.6);
  const pc = o.toS(0, (top + bot) / 2);
  buf.poly(plate, m.plate, (x) => {
    const nx = (x + 0.5 - pc[0]) / (hwT * s);
    return nx < -0.84 ? 0 : nx < 0.62 ? 1 : 2;
  });
  if (t >= 1) {
    const seam = decal(P.silver);
    const gP = gb + LOOK + 4;
    const a = o.toS(-hwT + 1.6, lift(-1, top)), b = o.toS(hwT - 1.6, lift(1, top));
    const y = Math.round(a[1]) + 1;
    for (let x = Math.round(a[0]) + 1; x < Math.round(b[0]); x++) buf.paint(x, y, seam, 1, gP);
  }
  // ---- shoulder caps: articulated plates over each shoulder joint (a 1 px edge on the shell),
  // lit along the top on the key side, a pivot fastener at close-up
  if (t >= 1) {
    buf.part(gb + LOOK + 7, 9, clip);
    const gC = gb + LOOK + 7;
    for (const side of [-1, 1]) {
      const cap = bodyPoly(o, lift, [
        [side * (T.shoulderHW * 0.58), T.shoulderTop * 0.5], [side * (T.shoulderHW * 0.84), T.shoulderTop - 0.1], [side * (T.shoulderHW * 0.97), T.shoulderTop + 1.6],
        [side * (T.shoulderHW * 1.01), T.shoulderTop + 4.4], [side * (T.shoulderHW * 0.97), T.shoulderTop + 7.0], [side * (T.shoulderHW * 0.8), T.shoulderTop + 6.0],
        [side * (T.shoulderHW * 0.62), T.shoulderTop + 3.0],
      ]);
      const ct = o.toS(0, T.shoulderTop)[1];
      buf.poly(cap, m.jacket, (x, y) => {
        const dy = (y + 0.5 - ct) / s;
        if (side < 0) return dy < 1.2 ? 0 : 1;
        return dy < 1.0 ? 1 : 2;
      });
      if (t === 2) {
        const [px, py] = o.toS(side * T.shoulderHW * 0.86, T.shoulderTop + 3.6);
        buf.paint(Math.round(px), Math.round(py), decal(P.black), 1, gC);
        if (s >= 3.2 && side < 0) buf.paint(Math.round(px) - 1, Math.round(py) - 1, decal(P.fog), 1, gC);
      }
    }
  }
  // ---- a continuous silver rim along the screen-right shoulder (the resolve rim alone is dotted there)
  if (s >= 1.35) {
    const [ax] = o.toS(nk + 1.5, 0);
    const [bx] = o.toS(T.shoulderHW + 1, 0);
    const [, ty] = o.toS(0, -3);
    const [, by] = o.toS(0, T.shoulderTop + 8);
    rimTopRight(buf, gJ, ax, bx, ty, by, rimMat(P.silver), Math.max(2, Math.round(s * 1.6)));
  }
}

registerOutfit('knitBlazer', knitBlazer);
registerOutfit('turtleneck', turtleneck);
registerOutfit('cardigan', cardigan);
registerOutfit('chassis', chassis);

export const OUTFITS_B = ['knitBlazer', 'turtleneck', 'cardigan', 'chassis'];
