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
import { GROUPS } from '../character.js';
import { registerOutfit, torsoFrame } from './outfit.js';

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
// stroke(): tapered quadratic Bezier, shaded as a tube

const MAXSEG = 12;
const SX = new Float64Array(MAXSEG + 1), SY = new Float64Array(MAXSEG + 1), SR = new Float64Array(MAXSEG + 1);

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
      const px = x + 0.5;
      let best = 2, bu = 0, bex = 0, bey = 0, br = 1, bside = 0;
      for (let j = 0; j < n; j++) {
        const sx = SX[j], sy = SY[j];
        const dx = SX[j + 1] - sx, dy = SY[j + 1] - sy;
        const l2 = dx * dx + dy * dy || 1e-9;
        let t = ((px - sx) * dx + (py - sy) * dy) / l2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = px - (sx + dx * t), ey = py - (sy + dy * t);
        const r = SR[j] + (SR[j + 1] - SR[j]) * t;
        if (r <= 0.05) continue;
        const d = Math.sqrt(ex * ex + ey * ey) / r;
        if (d < best) {
          best = d;
          bu = (j + t) / n;
          bex = ex;
          bey = ey;
          br = r;
          bside = dx * ey - dy * ex;
        }
      }
      if (best >= 1) continue;
      const nx = bex / br, ny = bey / br;
      const tt = tone ? tone(nx, ny, bu, bside < 0 ? -best : best) : toneN(m, nx * 0.95, ny * 0.95);
      if (tt < 0) continue;
      const i = y * w + x;
      mat[i] = m;
      tn[i] = tt;
      grp[i] = g;
      z[i] = cz;
    }
  }
}

/**
 * An irregular rounded clump centred at screen (cx, cy), radius r px: a disc whose edge is
 * pushed in and out by `wob` (0..0.3) with phase `ph`, shaded with a lit crescent toward the key,
 * a deep crease on the far side and `bias` added to every tone. `sph(nx, ny)` optionally mixes in
 * the larger form's normal (a curl on a round head of hair is lit like the head).
 */
const BLOB = { sx: 0, sy: 0, mix: 0 };
export function blob(buf, m, cx, cy, r, wob, ph, bias = 0, sph = null) {
  const R = r * (1 + wob);
  const x0 = Math.max(1, Math.floor(cx - R)), y0 = Math.max(1, Math.floor(cy - R));
  const x1 = Math.min(buf.w - 1, Math.ceil(cx + R) + 1), y1 = Math.min(buf.h - 1, Math.ceil(cy + R) + 1);
  if (x1 <= x0 || y1 <= y0) return;
  buf._touch(x0, y0, x1, y1);
  const { w, mat, tone: tn, grp, z, clipY } = buf;
  const g = buf.g, cz = buf.cz, clip = buf.clip;
  if (sph) sph(cx, cy, BLOB);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (clip && y >= clipY[x]) continue;
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const a = Math.atan2(dy, dx);
      const rr = r * (1 + wob * Math.sin(a * 3 + ph) * 0.7 + wob * 0.3 * Math.sin(a * 5 - ph * 1.7));
      const d2 = (dx * dx + dy * dy) / (rr * rr);
      if (d2 >= 1) continue;
      let nx = dx / rr, ny = dy / rr;
      if (sph) {
        nx = nx * (1 - BLOB.mix) + BLOB.sx * BLOB.mix;
        ny = ny * (1 - BLOB.mix) + BLOB.sy * BLOB.mix;
      }
      // explicit cluster tones: a lit crescent toward the key, the body, a shaded far side
      const lit = -0.6 * nx - 0.8 * ny;
      let t = (lit > 0.5 && d2 > 0.2 ? 0 : lit < -0.35 ? 2 : 1) + bias;
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
  const neckY = toS(0, 0)[1];
  const litEdge = opts.litEdge ?? -0.8, shadeEdge = opts.shadeEdge ?? 0.58, deepEdge = opts.deepEdge ?? 0.9;
  const under = (opts.under ?? 0) * s; // occlusion band height under the chin / collar (px)
  return (x, y) => {
    const nx = (x + 0.5 - c[0]) / halfW;
    const top = (y + 0.5 - topY) / s;
    const ax = nx < 0 ? -nx : nx;
    if (top < 2.0 && ax > 0.36 && ax < 0.9) return nx < 0 ? 0 : 1;
    if (under > 0 && y + 0.5 - neckY < under && ax < 0.3) return 2;
    if (nx < litEdge) return 0;
    if (nx < shadeEdge) return 1;
    if (nx < deepEdge) return 2;
    return 3;
  };
}

/** Short soft fold strokes in body space (tone lines with a lit edge beside them). */
function fold(o, mat, group, pts, shade = 2, lit = 0, litSide = -1) {
  bodyPaint(o, pts, mat, shade, group);
  if (lit >= 0 && o.s >= 2.6) bodyPaint(o, pts, mat, lit, group, litSide);
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
  if (t >= 1) {
    // armpit drape: two soft folds from under each arm toward the chest
    for (const side of [-1, 1]) {
      const sh = side < 0 ? 1 : 2;
      fold(o, m.jacket, gJ, [[side * (T.sideHW - 0.6), 15.5], [side * (T.sideHW - 3.2), 13.0], [side * (T.sideHW - 5.4), 12.4]], sh + 0, side < 0 ? 0 : -1);
      if (t === 2) fold(o, m.jacket, gJ, [[side * (T.sideHW - 0.8), 21.5], [side * (T.sideHW - 3.6), 19.4]], sh, -1);
    }
    // the open fronts: a slight roll where each front edge turns back, and the button
    for (const side of [-1, 1]) bodyPaint(o, [[side * 3.4, vY - 1.0], [side * 3.0, T.bottom]], m.jacket, side < 0 ? 0 : 2, gJ, side < 0 ? -1 : 1);
    const [bx, by] = o.toS(-4.4, vY + 3.4);
    buf.paint(Math.round(bx), Math.round(by), m.jacket, 3, gJ);
    if (t === 2) buf.paint(Math.round(bx) + 1, Math.round(by), m.jacket, 3, gJ);
  }
  if (t === 2) {
    // shoulder seams (soft shoulders, no padding) and a patch pocket on the far chest
    for (const side of [-1, 1]) bodyPaint(o, [[side * (nk + 5.4), 0.6], [side * (T.shoulderHW * 0.84), T.shoulderTop + 0.9]], m.jacket, side < 0 ? 1 : 3, gJ);
    const px0 = T.shoulderHW * 0.38, py0 = 12.6, pw = 5.0, ph = 4.4;
    bodyPaint(o, [[px0, py0], [px0, py0 + ph], [px0 + pw, py0 + ph], [px0 + pw, py0]], m.jacket, 3, gJ);
    bodyPaint(o, [[px0 + 0.3, py0 + 0.6], [px0 + pw - 0.3, py0 + 0.6]], m.jacket, 2, gJ);
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
  buf.poly(body, m.jacket, clothTone(o, { litEdge: -0.8, shadeEdge: 0.55, under: 4.5 }));
  const gJ = gb + G.jacket;
  if (t >= 1) {
    // set-in shoulder seams and the drape of a fitted knit: armpit folds, a soft centre crease
    for (const side of [-1, 1]) {
      fold(o, m.jacket, gJ, [[side * (T.sideHW - 0.5), 14.8], [side * (T.sideHW - 3.0), 12.8], [side * (T.sideHW - 5.6), 12.6]], side < 0 ? 1 : 2, side < 0 ? 0 : -1);
      if (t === 2) {
        bodyPaint(o, [[side * (nk + 3.6), 1.0], [side * (T.shoulderHW * 0.86), T.shoulderTop + 1.4]], m.jacket, side < 0 ? 1 : 3, gJ);
        fold(o, m.jacket, gJ, [[side * (T.sideHW - 1.0), 22.0], [side * (T.sideHW - 4.0), 20.0]], 2, -1);
      }
    }
    if (t === 2) bodyPaint(o, [[0.6, 8.5], [0.9, 13.5]], m.jacket, 2, gJ);
  }
  // ---- the roll collar: a soft tube up the neck, folded over once, with vertical ribs
  buf.part(gb + LOOK + 1, 9, clip);
  const neckHW = L.neck.hw;
  const topY = -5.6, foldY = -2.9, baseY = 1.0;
  const pts = bodyPoly(o, lift, [
    [-(neckHW + 0.9), topY], [-(neckHW + 0.5), topY - 0.7], [0, topY - 0.95], [neckHW + 0.5, topY - 0.7], [neckHW + 0.9, topY],
    [neckHW + 1.5, foldY], [nk + 1.6, baseY - 0.6], [nk + 0.6, baseY + 0.4], [0, baseY + 1.1], [-(nk + 0.6), baseY + 0.4], [-(nk + 1.6), baseY - 0.6], [-(neckHW + 1.5), foldY],
  ]);
  const c = o.toS(0, 0);
  const fy = o.toS(0, foldY)[1];
  const ribStep = Math.max(2, Math.round(0.8 * s));
  const hw = (neckHW + 1.5) * s;
  buf.poly(pts, m.collar, (x, y) => {
    const nx = (x + 0.5 - c[0]) / hw;
    // the fold line: a dark crease with the lit lip of the roll above it
    if (t >= 1 && Math.abs(y + 0.5 - fy) < 0.5 + (t === 2 ? 0.25 : 0)) return 3;
    if (t >= 1 && y + 0.5 < fy && y + 0.5 > fy - s * 1.2) return nx < 0.3 ? 0 : 1;
    let tt = nx < -0.55 ? 0 : nx < 0.45 ? 1 : 2;
    if (t === 2) {
      const k = ((x - Math.round(c[0])) % ribStep + ribStep) % ribStep;
      if (k === 0 && tt < 2) tt += 1;
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
    [-nk - 2.0, -1.4], [nk + 2.0, -1.4], [nk + 1.6, 6.0], [3.4, vY], [3.0, T.bottom + 2], [-3.0, T.bottom + 2], [-3.4, vY], [-nk - 1.6, 6.0],
  ]);
  const c = o.toS(0, 0);
  buf.poly(topPts, m.shirt, (x) => (x + 0.5 < c[0] - 1.5 * s ? 1 : x + 0.5 > c[0] + 2.0 * s ? 2 : 1));
  const neck = [];
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI * (i / 12);
    neck.push(...o.toS(-Math.cos(a) * (nk + 0.1), -1.9 + Math.sin(a) * 3.4));
  }
  buf.poly(neck, m.skin, (x) => (x + 0.5 > c[0] + nk * 0.4 * s ? 2 : 1));
  // ---- button bands down both front edges (their own group: a 1 px edge on the body)
  buf.part(gb + LOOK + 0, 9, clip);
  for (const side of [-1, 1]) {
    const band = bodyPoly(o, lift, [
      [side * (nk + 2.0), -1.6], [side * (nk + 3.4), -1.4], [side * (nk + 3.0), 6.4], [side * 4.9, vY], [side * 4.5, T.bottom + 2],
      [side * 3.0, T.bottom + 2], [side * 3.4, vY], [side * (nk + 1.6), 6.0],
    ]);
    buf.poly(band, m.band, side < 0 ? 0 : 2);
  }
  if (t === 2) {
    // buttons on the wearer's right band (screen left), below the neckline
    const gBand = gb + LOOK + 0;
    for (const by of [vY + 1.5, vY + 8.5]) {
      const [bx, byy] = o.toS(-4.0, by);
      buf.paint(Math.round(bx), Math.round(byy), m.band, 3, gBand);
      buf.paint(Math.round(bx) + 1, Math.round(byy), m.band, 2, gBand);
    }
  }
  // ---- drape: soft knit folds under the arms and a shoulder seam dropped off the shoulder
  const gJ = gb + G.jacket;
  if (t >= 1) {
    for (const side of [-1, 1]) {
      fold(o, m.jacket, gJ, [[side * (T.sideHW - 0.6), 14.0], [side * (T.sideHW - 3.4), 12.4], [side * (T.sideHW - 6.0), 12.8]], side < 0 ? 1 : 2, side < 0 ? 0 : -1);
      if (t === 2) {
        bodyPaint(o, [[side * (T.shoulderHW * 0.7), T.shoulderTop * 0.6], [side * (T.shoulderHW * 0.93), T.shoulderTop + 3.0]], m.jacket, side < 0 ? 1 : 3, gJ);
        fold(o, m.jacket, gJ, [[side * (T.sideHW - 1.0), 21.0], [side * (T.sideHW - 4.4), 19.6]], 2, -1);
      }
    }
  }
  if (L.necklace) drawChain(o, L.necklace, t);
}

/** A fine chain with a small bar pendant, resting in the neckline. */
function drawChain(o, [hi, lo], t) {
  if (t === 0) return;
  const { buf, L, toS, s } = o;
  const a = decal(hi), b = decal(lo);
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
// UNIT-8: neck column, casing shell, shoulder caps and the plain chest plate

function chassis(o) {
  const { buf, L, m, s, gb, G, clip } = o;
  const { T, lift, outline } = torsoFrame(o);
  const t = tier(s);
  const nk = T.neckHW;
  // ---- neck column: two machined grooves over the neck capsule
  buf.part(gb + LOOK + 5, 5, clip);
  const neckHW = L.neck.hw;
  const col = bodyPoly(o, lift, [[-neckHW, -5.2], [neckHW, -5.2], [neckHW + 0.3, 0.5], [-neckHW - 0.3, 0.5]]);
  const c0 = o.toS(0, 0);
  const g1 = o.toS(0, -3.6)[1], g2 = o.toS(0, -1.6)[1];
  buf.poly(col, m.joint, (x, y) => {
    const yy = y + 0.5;
    if (t >= 1 && (Math.abs(yy - g1) < 0.5 || Math.abs(yy - g2) < 0.5)) return 3;
    const nx = (x + 0.5 - c0[0]) / (neckHW * s);
    return nx < -0.45 ? 0 : nx < 0.4 ? 1 : 2;
  });
  // ---- shell
  buf.part(gb + G.jacket, 8, clip);
  const body = [];
  for (const [x, y] of outline) body.push(x, y);
  buf.poly(body, m.jacket, clothTone(o, { litEdge: -0.78, shadeEdge: 0.5, deepEdge: 0.86 }));
  // collar ring where the neck meets the shell
  buf.part(gb + LOOK + 6, 9, clip);
  const ring = bodyPoly(o, lift, [[-(nk + 1.2), -1.4], [nk + 1.2, -1.4], [nk + 1.6, 0.6], [nk * 0.6, 1.6], [-nk * 0.6, 1.6], [-(nk + 1.6), 0.6]]);
  buf.poly(ring, m.joint, (x) => (x + 0.5 < c0[0] - nk * 0.4 * s ? 1 : 2));
  // ---- the chest plate: plain, inset, one 1 px silver seam along its lit top edge
  buf.part(gb + LOOK + 4, 9, clip);
  const top = 5.0, bot = 19.5, hwT = 7.8, hwB = 4.6;
  const plate = bodyPoly(o, lift, [
    [-hwT + 1.4, top], [hwT - 1.4, top], [hwT, top + 1.6], [hwB, bot - 1.6], [hwB - 1.6, bot], [-hwB + 1.6, bot], [-hwB, bot - 1.6], [-hwT, top + 1.6],
  ]);
  const pc = o.toS(0, (top + bot) / 2);
  buf.poly(plate, m.plate, (x, y) => {
    const nx = (x + 0.5 - pc[0]) / (hwT * s);
    return nx < -0.78 ? 0 : nx < 0.7 ? 1 : 2;
  });
  if (t >= 1) {
    const seam = decal(P.silver);
    const a = o.toS(-hwT + 1.6, top + 0.15), b = o.toS(hwT - 1.6, top + 0.15);
    const y = Math.round(a[1]) + (t === 2 ? 1 : 0);
    for (let x = Math.round(a[0]) + 1; x < Math.round(b[0]); x++) buf.paint(x, y, seam, 1, gb + LOOK + 4);
  }
  // ---- shoulder caps: separate plates over each shoulder joint (a 1 px edge on the shell)
  if (t >= 1) {
    buf.part(gb + LOOK + 7, 9, clip);
    for (const side of [-1, 1]) {
      const cap = bodyPoly(o, lift, [
        [side * (T.shoulderHW * 0.6), T.shoulderTop * 0.55], [side * (T.shoulderHW * 0.9), T.shoulderTop + 0.1], [side * (T.shoulderHW * 1.0), T.shoulderTop + 3.6],
        [side * (T.shoulderHW * 0.98), T.shoulderTop + 6.6], [side * (T.shoulderHW * 0.8), T.shoulderTop + 5.2], [side * (T.shoulderHW * 0.62), T.shoulderTop + 2.6],
      ]);
      buf.poly(cap, m.jacket, side < 0 ? 0 : 2);
    }
  }
}

registerOutfit('knitBlazer', knitBlazer);
registerOutfit('turtleneck', turtleneck);
registerOutfit('cardigan', cardigan);
registerOutfit('chassis', chassis);

export const OUTFITS_B = ['knitBlazer', 'turtleneck', 'cardigan', 'chassis'];
