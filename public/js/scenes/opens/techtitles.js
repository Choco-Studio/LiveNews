// TECH BYTES' title sequence (owner, 9 Oct: the other programmes' opens "as crafted" as WORLD NOW's).
// About nine seconds on the programme's own grid (cues.js, 104 BPM), one continuous camera move:
//
//   RUN    beats 0-7.5     low over a dark circuit board between two buses of traces; a signal
//                          leaves under the camera on every beat and races ahead to the horizon,
//                          lighting its trace; components stand on the board like a city at night;
//                          on beat 7 every trace fires at once and the side buses light as it passes
//   CRANE  7.5-10.75       the camera rises and tips down over the processor while its traces light
//                          from the frame edges into its pins (the emblem's own signals)
//   BOOT   10.75-12.1      straight overhead the board is exactly the emblem's frame: the package's
//                          open takes over mid-build (the die boots on the theme's motif)
//   TITLE  12.1-15         the package's reveal; still for the last 0.8 s
//
// The board is a plane rendered per pixel through a pinhole camera; every trace is box-filtered by
// the pixel's footprint and dithered on the screen's fixed matrix, so nothing shimmers as it
// streams past. Overhead at height F the board maps one unit to one pixel and its middle is the
// emblem's own frame (the TECH backdrop, the chip, the traces), so the hand-over never pops.
import { P } from '../../palette.js';
import { u32, clamp, lerp, seg, smoothstep, easeInOut, BAYER4 } from '../../gfx/index.js';
import { W, H, CENTRE, ZOOM } from './kit.js';
import { TECH, traces, chipSprite } from './tech.js';
import { track, sequence, Layer, ditherAt } from './seq.js';
import { CUES, hitOf } from './cues.js';

const ID = 'tech-bytes';
const Q = CUES[ID];
const BEAT = 60 / Q.bpm;
const HIT = hitOf(ID);
const HAND = 0.75; // the package clock's instant the open takes over at (traces in, chip open, die not yet drawing)

const F = 200; // focal length (px); overhead at height F the board is one unit a pixel
const ZC = 760; // the processor's distance down the board
const CX = CENTRE.x;
const CY = CENTRE.y;
const DEG = Math.PI / 180;

const C = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, u32(v)]));
// the board works in palette indices (fast to darken), written out as colours at the end
const NAMES = ['black', 'ink', 'slate', 'steel', 'fog', 'silver', 'white', 'navy', 'blue', 'cyan'];
const K = Object.fromEntries(NAMES.map((k, i) => [k, i]));
const U = Uint32Array.from(NAMES.map((k) => u32(P[k])));
// one step darker: white > cyan > blue > navy > ink > black; silver > fog > steel > slate > ink
const DARK = Uint8Array.from([0, 0, 1, 2, 3, 4, 9, 1, 7, 8]);
const fogged = (i, n) => {
  while (n-- > 0 && i) i = DARK[i];
  return i;
};

// ---------------------------------------------------------------------------------------------
// The camera: low over the board, then a crane up and over the processor

// the run is at 20 units over the board; the crane rises past the overhead height and settles onto
// it (the emblem's frame is never seen closer than one unit a pixel: no magnified pixels), straight
// over the processor before it tips fully down, so the last move is a pure push in
const CR = Q.crane;
const CAM_Z = track([[-2, -110], [0, 0], [CR, ZC - 330], [CR + 1.3, ZC - 175], [10.15, ZC], [Q.land, ZC]]);
// (a swoop on the run: down to 15 units past the first package, up again before the crane)
const CAM_H = track([[-2, Math.log(20)], [0, Math.log(20)], [3, Math.log(15.5)], [5.6, Math.log(21.5)], [CR, Math.log(25)], [CR + 0.9, Math.log(62)], [CR + 1.8, Math.log(165)], [10.15, Math.log(300)], [Q.land, Math.log(F)]]);
const CAM_P = track([[0, -19], [CR, -21], [CR + 0.9, -40], [CR + 2.1, -80], [10.15, -90], [Q.land, -90]]);
const CAM_Y = track([[-2, -1], [0, -3], [2.5, 3.5], [5, -2.5], [CR, 0], [Q.land, 0]]);
const CAM_R = track([[-2, 0], [0, -2], [2.5, 3], [5, -2.5], [CR, 0], [Q.land, 0]]);
const CAM_X = track([[0, 2], [3.5, -2.5], [CR, 0], [Q.land, 0]]);
const OVERHEAD = 10.15; // from here the camera looks straight down

const CAM = { x: 0, h: 1, z: 0, fx: 0, fy: 0, fz: 1, rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0, b: 0 };
function camera(b) {
  CAM.b = b;
  CAM.x = CAM_X(b);
  CAM.z = CAM_Z(b);
  CAM.h = b >= Q.land ? F : Math.exp(CAM_H(b)); // landed: exactly one unit a pixel
  const p = CAM_P(b) * DEG;
  const y = CAM_Y(b) * DEG;
  const r = CAM_R(b) * DEG;
  CAM.fx = Math.sin(y) * Math.cos(p);
  CAM.fy = Math.sin(p);
  CAM.fz = Math.cos(y) * Math.cos(p);
  const rx = Math.cos(y);
  const rz = -Math.sin(y);
  // up = forward x right (before the roll)
  const ux = CAM.fy * rz;
  const uy = CAM.fz * rx - CAM.fx * rz;
  const uz = -CAM.fy * rx;
  // the roll turns right and up about the forward axis
  const cr = Math.cos(r);
  const sr = Math.sin(r);
  CAM.rx = rx * cr + ux * sr;
  CAM.ry = uy * sr;
  CAM.rz = rz * cr + uz * sr;
  CAM.ux = ux * cr - rx * sr;
  CAM.uy = uy * cr;
  CAM.uz = uz * cr - rz * sr;
  return CAM;
}

/** Screen position of a board point (X, height Y, Z): out = [x, y, depth]; depth <= 0 behind the camera. */
function project(X, Y, Z, out) {
  const vx = X - CAM.x;
  const vy = Y - CAM.h;
  const vz = Z - CAM.z;
  const df = vx * CAM.fx + vy * CAM.fy + vz * CAM.fz;
  out[2] = df;
  if (df <= 1e-6) return out;
  out[0] = CX + (F * (vx * CAM.rx + vy * CAM.ry + vz * CAM.rz)) / df;
  out[1] = CY - (F * (vx * CAM.ux + vy * CAM.uy + vz * CAM.uz)) / df;
  return out;
}

// ---------------------------------------------------------------------------------------------
// The emblem's frame on the board round the processor (one unit a pixel). Its backdrop is computed,
// not baked: the package's graded field (kit.js backdrop: black to ink through the Bayer matrix at
// the screen's own phase) with the TECH grid's slate crosses, evaluated where each pixel lands, so it
// is exact overhead and never a magnified texture on the way. The chip is the emblem's sprite, baked
// with box-filtered levels for the distance.

const REACH = 230;
const WIDE = REACH * 1.35;
/** The TECH backdrop's colour at a frame point (col, row), for a screen pixel (sx, sy) and footprint fp. */
function backdropAt(col, row, fp, sx, sy) {
  const dx = (col - CX) / WIDE;
  const dy = (row - CY) / REACH;
  const level = clamp((1 - Math.sqrt(dx * dx + dy * dy)) * 2.1 - 0.55, 0, 1);
  // the TECH grid: a 3 px slate cross every 24 px where the field is lit (its texture in tech.js)
  if (level >= 0.55 || fp > 1) {
    const gc = Math.round(col / 24) * 24;
    const gr = 2 + Math.round((row - 2) / 24) * 24;
    if (gc >= 0 && gc < W && gr < H) {
      const ex = col - gc;
      const ey = row - gr;
      // (seen from further than one unit a pixel the 3 px crosses fade instead of blurring into a carpet of
      // dithered dots: they resolve as the camera lands)
      const cov = Math.max(cover(ex, 1.5, fp) * cover(ey, 0.5, fp), cover(ex, 0.5, fp) * cover(ey, 1.5, fp)) * smoothstep(2.6, 1.15, fp);
      const gl = clamp((1 - Math.sqrt(((gc - CX) / WIDE) ** 2 + ((gr - CY) / REACH) ** 2)) * 2.1 - 0.55, 0, 1);
      if (gl >= 0.55 && cov * 16 > BAYER0(sx, sy)) return K.slate;
    }
  }
  return Math.floor(level + (BAYER0(sx, sy) + 0.5) / 16 - 0.5) >= 1 ? K.ink : K.black;
}
// the package's backdrops dither in the screen's own phase (gfx bayer at (x, y))
const BAYER0 = (x, y) => BAYER4[((y & 3) << 2) | (x & 3)];

let CHIP = null;
const PAL = NAMES.map((k) => [k, ...rgb(P[k])]);
function rgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function nearest(r, g, b) {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < PAL.length; i++) {
    const [, pr, pg, pb] = PAL[i];
    const d = (r - pr) * (r - pr) * 0.3 + (g - pg) * (g - pg) * 0.59 + (b - pb) * (b - pb) * 0.11;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}
/** The emblem's chip at its centre-stage size, with box-filtered levels: { x0, y0, levels[{ w, h, c, a }] }. */
function chipLevels() {
  if (CHIP) return CHIP;
  const S = chipSprite(ZOOM);
  const w0 = S.S + 1;
  let px = null;
  try {
    const d = S.cv.getContext('2d').getImageData(0, 0, w0, w0).data;
    if (d && d.length === w0 * w0 * 4) px = d;
  } catch {
    /* no pixels (tests): an empty chip */
  }
  const levels = [];
  let w = w0;
  let h = w0;
  let rgba = new Float32Array(w * h * 4);
  for (let i = 0; i < w * h; i++) for (let k = 0; k < 4; k++) rgba[4 * i + k] = px ? px[4 * i + k] / (k === 3 ? 255 : 1) : 0;
  const pack = (src, ww, hh) => {
    const c = new Uint8Array(ww * hh);
    const a = new Float32Array(ww * hh);
    for (let i = 0; i < ww * hh; i++) {
      a[i] = src[4 * i + 3];
      c[i] = a[i] > 0 ? nearest(src[4 * i], src[4 * i + 1], src[4 * i + 2]) : 0;
    }
    return { w: ww, h: hh, c, a };
  };
  levels.push(pack(rgba, w, h));
  for (let L = 1; L <= 5; L++) {
    const nw = Math.ceil(w / 2);
    const nh = Math.ceil(h / 2);
    const n = new Float32Array(nw * nh * 4);
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let al = 0;
        for (let j = 0; j < 2; j++) {
          for (let i = 0; i < 2; i++) {
            const k = 4 * (Math.min(h - 1, 2 * y + j) * w + Math.min(w - 1, 2 * x + i));
            const aa = rgba[k + 3];
            r += rgba[k] * aa;
            g += rgba[k + 1] * aa;
            b += rgba[k + 2] * aa;
            al += aa;
          }
        }
        const o = 4 * (y * nw + x);
        n[o] = al ? r / al : 0;
        n[o + 1] = al ? g / al : 0;
        n[o + 2] = al ? b / al : 0;
        n[o + 3] = al / 4;
      }
    }
    levels.push(pack(n, nw, nh));
    rgba = n;
    w = nw;
    h = nh;
  }
  CHIP = { x0: CX - (S.S >> 1), y0: CY - (S.S >> 1), w: w0, levels };
  return CHIP;
}

// ---------------------------------------------------------------------------------------------
// The procedural board beyond the emblem's frame

const hash = (a, b, c = 0) => {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
/** Coverage of a line of half-width hw at distance d from its axis, for a pixel footprint fp. */
const cover = (d, hw, fp) => clamp(0.5 + (hw - Math.abs(d)) / Math.max(fp, 1e-3), 0, 1);

const BUS_IN = 7; // the corridor's buses: 8 traces a side from |X| = 7, 3 units apart
const BUS_N = 8;
const BUS_PITCH = 3;
const BUS_HW = 0.35;
const SEG = 48; // board blocks
const BUS_END = ZC - 132; // the buses end in vias before the processor's frame
const JOG = 4.5; // the buses jog outwards and back at 45 degrees every 140 units
/** The buses' outward offset at Z, and whether Z is on a jog (a 45 degree run). */
function jogAt(Z, out) {
  const j = Math.floor((Z - 60) / 140);
  const local = Z - 60 - j * 140;
  const o = j < 0 ? 0 : j & 1 ? 0 : JOG;
  const prev = j <= 0 ? 0 : (j - 1) & 1 ? 0 : JOG;
  if (j >= 0 && local < JOG) {
    out[0] = lerp(prev, o, local / JOG);
    out[1] = prev !== o ? 1 : 0;
  } else {
    out[0] = j < 0 ? 0 : o;
    out[1] = 0;
  }
  return out;
}
const JG = [0, 0];

// a signal per beat: it leaves under the camera and races ahead along half the traces of one bus
const PULSE_V = 230; // units a second
const PULSES = [
  ...Q.pulses.map((b, i) => ({ t: b * BEAT, z0: CAM_Z(b) + 10, side: i % 2 ? 1 : -1, odd: (i >> 1) % 2 })),
  { t: Q.wave * BEAT, z0: CAM_Z(Q.wave) + 4, side: 0, odd: -1 }, // the wave: both buses, every trace
];
const WAVE = PULSES[PULSES.length - 1];
// per frame: where each signal's front is and how long it has rested in the vias (glowAt reads these)
const FRONT = new Float64Array(PULSES.length);
const REST = new Float64Array(PULSES.length);
const LIVE = new Uint8Array(PULSES.length);
function pulseFronts(ts) {
  for (let i = 0; i < PULSES.length; i++) {
    const p = PULSES[i];
    LIVE[i] = ts >= p.t ? 1 : 0;
    const f = p.z0 + (ts - p.t) * PULSE_V;
    FRONT[i] = Math.min(BUS_END, f);
    REST[i] = f > BUS_END ? (f - BUS_END) / PULSE_V : 0;
  }
}
// e^(-x) on 0..8 in 512 steps (the glows' decay, read per pixel)
const EXP = Float32Array.from({ length: 513 }, (_, i) => Math.exp(-(i / 64)));
const decay = (x) => (x >= 8 ? 0 : EXP[(x * 64) | 0]);

/** How lit the board's side buses are at Z as the wave passes (0..1). */
function waveAt(Z) {
  const i = PULSES.length - 1;
  if (!LIVE[i] || Z > FRONT[i]) return 0;
  return decay((FRONT[i] - Z) / PULSE_V / 0.28 + REST[i] / 0.28);
}

/** The glow a corridor trace (side, k) has at Z: 0..1, and 2 at a signal's head. */
function glowAt(side, k, Z) {
  let g = 0;
  for (let i = 0; i < PULSES.length; i++) {
    if (!LIVE[i]) continue;
    const p = PULSES[i];
    if ((p.side && p.side !== side) || (p.odd >= 0 && (k & 1) !== p.odd)) continue;
    const front = FRONT[i];
    if (Z > front) continue;
    const behind = front - Z;
    if (behind < 4 && REST[i] === 0) return 2;
    const v = decay((behind / PULSE_V + REST[i]) / 0.34);
    if (v > g) g = v;
  }
  return g;
}

/**
 * A board colour at (X, Z); fpa: footprint across lines running away (X), fpb: along them (Z); ma,
 * mb: the same stretched over the frame's motion (for every feature but the buses, which run with it).
 */
function board(X, Z, fpa, fpb, ma, mb, ts, th) {
  const ax = Math.abs(X);
  // the corridor's buses
  if (Z < BUS_END + 3 && ax > BUS_IN - 4 && ax < BUS_IN + BUS_PITCH * (BUS_N - 1) + JOG + 3) {
    const side = X < 0 ? -1 : 1;
    jogAt(Z, JG);
    const rel = ax - BUS_IN - JG[0];
    const k = clamp(Math.round(rel / BUS_PITCH), 0, BUS_N - 1);
    const dx = (rel - k * BUS_PITCH) * (JG[1] ? Math.SQRT1_2 : 1);
    // (the buses run towards the vanishing point, so turning and rising slide them along themselves:
    // they keep their own footprint)
    let c = cover(dx, BUS_HW, JG[1] ? Math.max(fpa, fpb) : fpa);
    // far away the bus is a tint (a quarter of it is copper), never a moiré
    c = lerp(c, 0.23, smoothstep(BUS_PITCH * 0.5, BUS_PITCH * 1.5, fpa));
    // the buses end in a row of vias
    const dv = Math.sqrt((rel - k * BUS_PITCH) ** 2 + (Z - BUS_END) ** 2);
    if (dv < 1.8) {
      if (cover(dv - 1.1, 0.4, Math.max(ma, mb)) * 16 > th) return K.steel;
      if (dv < 0.7) return K.black;
    }
    if (Z <= BUS_END && rel > -2 && c * 16 > th) {
      const g = glowAt(side, k, Z);
      return g >= 2 ? K.white : g > 0.62 ? K.cyan : g > 0.36 ? K.blue : g > 0.16 ? K.navy : K.slate;
    }
    return K.black;
  }
  // blocks beside the corridor: buses across, pad fields, vias
  if (ax >= 36) {
    const bx = Math.floor(X / SEG);
    const bz = Math.floor(Z / SEG);
    const r = hash(bx, bz);
    const lx = X - bx * SEG;
    const lz = Z - bz * SEG;
    if (r < 0.42) {
      const j = clamp(Math.round((lz - 8) / 4), 0, 8);
      const dz = lz - (8 + 4 * j);
      const len = 12 + hash(bx, bz, j + 1) * 30;
      if (lx > 4 && lx < 4 + len) {
        let c = cover(dz, BUS_HW, mb) * cover(Math.min(lx - 4, 4 + len - lx), 8, ma);
        c = lerp(c, 0, smoothstep(2, 6, mb));
        if (c * 16 > th) {
          const w = waveAt(Z);
          return w > 0.6 ? K.blue : w > 0.25 ? K.navy : K.slate;
        }
      }
      return K.black;
    }
    if (r < 0.62) {
      const pxl = (((lx - 6) % 7) + 7) % 7;
      const pzl = (((lz - 6) % 7) + 7) % 7;
      if (lx > 4 && lx < 44 && lz > 4 && lz < 44) {
        // (a field of 2-unit pads turns to dots long before it blurs: it fades out early, as the crane rises)
        const c = cover(pxl - 1, 0.9, ma) * cover(pzl - 1, 0.9, mb);
        const fm = Math.max(ma, mb);
        if (lerp(c, 0, smoothstep(1.1, 2.6, fm)) * 16 > th) return fm > 0.8 ? K.slate : K.steel;
      }
      return K.black;
    }
    if (r < 0.75) {
      const dv = Math.sqrt((lx - 24) * (lx - 24) + (lz - 24) * (lz - 24));
      if (cover(dv - 1.4, 0.45, Math.max(ma, mb)) * 16 > th) return K.slate;
    }
  }
  return K.black;
}

// ---------------------------------------------------------------------------------------------
// Components standing on the board, lit from the upper left; packages with silver legs and tall
// capacitors with a bright top, drawn far to near after the board

const BOXES = (() => {
  const out = [];
  // down the corridor's middle, under the camera: small SMD resistors (black body, silver ends)
  for (let z0 = 18; z0 < BUS_END - 20; z0 += 26 + Math.round(hash(z0, 11) * 10)) {
    out.push({ x0: -1.6, x1: 1.6, z0, z1: z0 + 1.8, h: 0.9, smd: true });
  }
  // beside the buses: rows of tiny capacitors
  for (let z0 = 40; z0 < BUS_END - 30; z0 += 34 + Math.round(hash(z0, 12) * 14)) {
    for (const side of [-1, 1]) {
      if (hash(z0, side + 13) < 0.35) continue;
      const x0 = side * (BUS_IN + BUS_PITCH * BUS_N + 4 + hash(z0, side + 14) * 3);
      out.push({ x0: Math.min(x0, x0 + side * 2.2), x1: Math.max(x0, x0 + side * 2.2), z0, z1: z0 + 1.4, h: 1.1, smd: true });
    }
  }
  // landmarks that pass close by on the run, so it has a shape (a big package on the left, two tall
  // capacitors on the right, a second package on the right before the crane), not a uniform corridor
  const marks = [
    { x0: -64, x1: -37, z0: 142, z1: 170, h: 2.8, big: true },
    { x0: 36, x1: 42, z0: 246, z1: 252, h: 10, tall: true },
    { x0: 45, x1: 50, z0: 258, z1: 263, h: 8.5, tall: true },
    { x0: 37, x1: 66, z0: 336, z1: 366, h: 3, big: true },
  ];
  out.push(...marks);
  const clear = (x0, x1, z0, z1) => !marks.some((m) => x0 < m.x1 + 3 && x1 > m.x0 - 3 && z0 < m.z1 + 3 && z1 > m.z0 - 3);
  for (let i = 0; i < 30; i++) {
    const z0 = 30 + i * 21 + hash(i, 7) * 9;
    if (z0 > ZC - 175) break;
    for (const side of [-1, 1]) {
      if (hash(i, side + 3) < 0.2) continue;
      const tall = hash(i, side, 3) < 0.22;
      const w = tall ? 4 + Math.round(hash(i, side, 1) * 2) : 6 + Math.round(hash(i, side, 1) * 8);
      const d = tall ? w : 5 + Math.round(hash(i, side, 2) * 7);
      const ht = tall ? 5.5 + hash(i, side, 4) * 3 : 1.4 + hash(i, side, 4) * 1.4;
      const x0 = side < 0 ? -(38 + hash(i, side, 5) * 30) - w : 38 + hash(i, side, 5) * 30;
      if (clear(x0, x0 + w, z0, z0 + d)) out.push({ x0, x1: x0 + w, z0, z1: z0 + d, h: ht, tall });
    }
  }
  return out;
})();

const PTS = Array.from({ length: 8 }, () => [0, 0, 0]);
const QD = [0, 0, 0, 0, 0, 0, 0, 0];
/** Fill a convex quad (screen corners a..d) with colour col. */
function quad(L, a, b, c, d, col) {
  QD[0] = a[0]; QD[1] = a[1]; QD[2] = b[0]; QD[3] = b[1]; QD[4] = c[0]; QD[5] = c[1]; QD[6] = d[0]; QD[7] = d[1];
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let i = 1; i < 8; i += 2) {
    if (QD[i] < y0) y0 = QD[i];
    if (QD[i] > y1) y1 = QD[i];
  }
  const ya = Math.max(0, Math.ceil(y0 - 0.5));
  const yb = Math.min(H - 1, Math.floor(y1 - 0.5));
  for (let y = ya; y <= yb; y++) {
    const yc = y + 0.5;
    let xl = Infinity;
    let xr = -Infinity;
    for (let i = 0; i < 4; i++) {
      const x0 = QD[2 * i];
      const y0e = QD[2 * i + 1];
      const x1 = QD[(2 * i + 2) % 8];
      const y1e = QD[(2 * i + 3) % 8];
      if ((y0e <= yc && y1e > yc) || (y1e <= yc && y0e > yc)) {
        const x = x0 + ((yc - y0e) / (y1e - y0e)) * (x1 - x0);
        if (x < xl) xl = x;
        if (x > xr) xr = x;
      }
    }
    const xa = Math.max(0, Math.ceil(xl - 0.5));
    const xb = Math.min(W - 1, Math.floor(xr - 0.5));
    for (let x = xa; x <= xb; x++) L.d[y * W + x] = col;
  }
}
const LEG = [0, 0, 0];
function boxes(L, fogS, fogE) {
  const list = [];
  for (const bx of BOXES) {
    const zc = (bx.z0 + bx.z1) / 2;
    if (zc < CAM.z - 40 || zc > CAM.z + fogE + 40) continue;
    list.push([Math.hypot((bx.x0 + bx.x1) / 2 - CAM.x, zc - CAM.z, CAM.h), bx]);
  }
  list.sort((a, b) => b[0] - a[0]);
  for (const [dist, b] of list) {
    const steps = Math.floor(clamp((dist - fogS) / (fogE - fogS), 0, 1) * 4.99);
    if (steps >= 5) continue;
    const corners = [[b.x0, 0, b.z0], [b.x1, 0, b.z0], [b.x1, 0, b.z1], [b.x0, 0, b.z1], [b.x0, b.h, b.z0], [b.x1, b.h, b.z0], [b.x1, b.h, b.z1], [b.x0, b.h, b.z1]];
    let behind = false;
    for (let i = 0; i < 8; i++) {
      project(corners[i][0], corners[i][1], corners[i][2], PTS[i]);
      if (PTS[i][2] < 1) behind = true;
    }
    if (behind) continue;
    const f = (c) => U[fogged(c, steps)];
    const [p0, p1, p2, p3, p4, p5, p6, p7] = PTS;
    // a package's silver legs along its long sides, on the board
    if (!b.tall) {
      for (const zz of [b.z0 - 0.6, b.z1 + 0.6]) {
        for (let xx = b.x0 + 1; xx < b.x1 - 0.5; xx += 1.5) {
          project(xx, 0.3, zz, LEG);
          if (LEG[2] > 1) L.plot(Math.round(LEG[0] - 0.5), Math.round(LEG[1] - 0.5), f(K.silver));
        }
      }
    }
    if (CAM.z < b.z0) quad(L, p0, p1, p5, p4, f(b.tall ? K.fog : K.slate)); // facing the camera
    if (CAM.x < b.x0) quad(L, p3, p0, p4, p7, f(b.tall ? K.silver : K.steel)); // the lit side
    if (CAM.x > b.x1) quad(L, p1, p2, p6, p5, f(b.tall ? K.steel : K.ink)); // the shaded side
    quad(L, p4, p5, p6, p7, f(b.tall ? K.silver : K.black)); // the top
    if (b.smd) {
      // a chip resistor's silver end caps across its top
      const e = (b.x1 - b.x0) * 0.22;
      for (const [xa, xb] of [[b.x0, b.x0 + e], [b.x1 - e, b.x1]]) {
        const q0 = project(xa, b.h, b.z0, [0, 0, 0]);
        const q1 = project(xb, b.h, b.z0, [0, 0, 0]);
        const q2 = project(xb, b.h, b.z1, [0, 0, 0]);
        const q3 = project(xa, b.h, b.z1, [0, 0, 0]);
        if (q0[2] > 1 && q1[2] > 1 && q2[2] > 1 && q3[2] > 1) quad(L, q0, q1, q2, q3, f(K.silver));
      }
      continue;
    }
    if (b.big) {
      // a big package's markings: its pin-1 dimple and a printed line across the top
      const mark = (X, Z, col) => {
        project(X, b.h, Z, LEG);
        if (LEG[2] > 1) L.plot(Math.round(LEG[0] - 0.5), Math.round(LEG[1] - 0.5), f(col));
      };
      mark(b.x0 + 2.5, b.z0 + 2.5, K.steel);
      const zl = lerp(b.z0, b.z1, 0.55);
      for (let X = b.x0 + 5; X < b.x1 - 5; X += 0.8) mark(X, zl, K.slate);
    }
    // the top's lit front edge (a package) or its dark vent cross (a capacitor)
    const n = Math.max(2, Math.round(Math.hypot(p5[0] - p4[0], p5[1] - p4[1])));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(lerp(p4[0], p5[0], i / n) - 0.5);
      const y = Math.round(lerp(p4[1], p5[1], i / n) - 0.5);
      L.plot(x, y, f(b.tall ? K.silver : K.steel));
    }
  }
}

// ---------------------------------------------------------------------------------------------
// The emblem's traces and its pins' flashes on the board (the package's own formula and clock)

const TP = [0, 0, 0];
const TQ = [0, 0, 0];
function linePix(L, x0, y0, x1, y1, c) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) L.plot(Math.round(lerp(x0, x1, n ? i / n : 0)), Math.round(lerp(y0, y1, n ? i / n : 0)), c);
}
function emblemTraces(L, dtE, dormant, steps) {
  for (const tr of traces()) {
    const head = Math.floor(easeInOut(seg(dtE, tr.s, 0.5)) * tr.n);
    const tail = Math.floor(easeInOut(seg(dtE, 1.1 + tr.s * 0.3, 0.4)) * tr.n);
    let prev = false;
    for (let i = 0; i < tr.n; i++) {
      const lit = i >= tail && i < head;
      const dim = !lit && dormant > 0 && i >= head;
      if (!lit && !dim) {
        prev = false;
        continue;
      }
      const sx = tr.pts[i * 2];
      const sy = tr.pts[i * 2 + 1];
      project(sx - CX, 0, ZC + CY - sy, TP);
      if (TP[2] <= 1) {
        prev = false;
        continue;
      }
      const x = Math.round(TP[0]);
      const y = Math.round(TP[1]);
      const c = U[fogged(lit ? (head < tr.n && i === head - 1 ? K.white : K.cyan) : K.slate, steps)];
      // a magnified stretch is joined up (never a dotted trace)
      if (prev && (Math.abs(TQ[0] - x) > 1 || Math.abs(TQ[1] - y) > 1)) {
        if (lit) linePix(L, TQ[0], TQ[1], x, y, c);
      }
      if (lit) L.plot(x, y, c);
      else L.plotA(x, y, c, dormant);
      TQ[0] = x;
      TQ[1] = y;
      prev = true;
    }
  }
}
function pinFlashes(ctx, dtE) {
  if (dtE >= 1.3) return;
  for (const tr of traces()) {
    const a = dtE - (tr.s + 0.5);
    if (a < 0 || a >= 0.12) continue;
    const n = tr.n;
    const lx = tr.pts[(n - 1) * 2];
    const ly = tr.pts[(n - 1) * 2 + 1];
    const sx = lx + Math.sign(lx - tr.pts[(n - 2) * 2]);
    const sy = ly + Math.sign(ly - tr.pts[(n - 2) * 2 + 1]);
    project(sx - CX, 0, ZC + CY - sy, TP);
    if (TP[2] <= 1) continue;
    ctx.fillStyle = a < 0.06 ? P.cyan : P.silver;
    ctx.fillRect(Math.round(TP[0]), Math.round(TP[1]), 1, 1);
  }
}

// ---------------------------------------------------------------------------------------------
// The board, per pixel

const LAYER = new Layer('tech-board');
function floor(ts, overhead) {
  const D = LAYER.begin(C.black);
  const K = chipLevels();
  const { x: cx0, z: cz0, h } = CAM;
  const { fx, fy, fz, rx, ry, rz, ux, uy, uz } = CAM;
  const fogS = 60 + h * 1.25;
  const fogE = 280 + h * 1.5;
  const fogS2 = fogS * fogS;
  pulseFronts(ts);
  const glow = F * 0.012;
  for (let sy = 0; sy < H; sy++) {
    const v = CY - sy;
    const bx = F * fx + v * ux;
    const by = F * fy + v * uy;
    const bz = F * fz + v * uz;
    for (let sx = 0; sx < W; sx++) {
      const u = sx - CX;
      const dx = bx + u * rx;
      const dy = by + u * ry;
      const dz = bz + u * rz;
      const th = ditherAt(sx, sy);
      if (dy >= -1e-9) {
        // above the horizon: the dark, with a thin navy line and an ink one where the board meets it
        if (dy < glow) D[sy * W + sx] = dy < glow * 0.45 ? C.navy : C.ink;
        continue;
      }
      const t = -h / dy;
      // fog first: past the fog's end the board is black, nothing to sample
      const d2 = t * t * (F * F + u * u + v * v);
      let steps = 0;
      if (d2 > fogS2) {
        steps = Math.floor(((Math.sqrt(d2) - fogS) / (fogE - fogS)) * 4 + (th + 0.5) / 16);
        if (steps >= 5) {
          D[sy * W + sx] = C.black;
          continue;
        }
      }
      const X = cx0 + t * dx;
      const Z = cz0 + t * dz;
      // footprints: across lines that run away from the camera, and along them (grazing)
      const kk = (h * uy) / (dy * dy);
      const gx = t * ux + dx * kk;
      const gz = t * uz + dz * kk;
      const fpa = t;
      const fpb = Math.sqrt(gx * gx + gz * gz);
      const fp = Math.max(fpa, fpb);
      // the same footprints stretched over the frame's motion (for small features)
      const ma = Math.max(fpa * (1 + MOTION.sweep), fpa + MOTION.dx);
      const mb = Math.max(fpb * (1 + MOTION.sweep), fpb + MOTION.dz);
      let c;
      const col = X + CX;
      const row = ZC + CY - Z;
      if (col >= -0.5 && col < W - 0.5 && row >= -0.5 && row < H - 0.5) {
        c = -1;
        if (!overhead) {
          const ci = Math.floor(col + 0.5) - K.x0;
          const cj = Math.floor(row + 0.5) - K.y0;
          if (ci >= 0 && cj >= 0 && ci < K.w && cj < K.w) {
            const fm = Math.max(ma, mb);
            const Lv = fm < 2 ? 0 : Math.min(5, Math.floor(Math.log2(fm)));
            const lev = K.levels[Lv];
            const q = Math.min(lev.h - 1, cj >> Lv) * lev.w + Math.min(lev.w - 1, ci >> Lv);
            if (lev.a[q] * 16 > th) c = lev.c[q];
          }
        }
        if (c < 0) c = backdropAt(col, row, Math.max(ma, mb), sx, sy);
      } else c = board(X, Z, fpa, fpb, ma, mb, ts, th);
      D[sy * W + sx] = U[steps ? fogged(c, steps) : c];
    }
  }
  return { fogS, fogE };
}

// The camera's motion over a frame (1/30 s): world travel and screen sweep from turning and rising.
// Small features (pads, crosses, vias, short traces) are filtered over it, like a motion blur: a
// detail that moves further than its own size in a frame becomes a soft tint, never a strobe.
const MOTION = { dx: 0, dz: 0, sweep: 0 };
function motion(b) {
  const b1 = b + 1 / 30 / BEAT;
  MOTION.dx = Math.abs(CAM_X(b1) - CAM_X(b));
  MOTION.dz = Math.abs(CAM_Z(b1) - CAM_Z(b));
  const turn = (Math.abs(CAM_P(b1) - CAM_P(b)) + Math.abs(CAM_Y(b1) - CAM_Y(b)) + Math.abs(CAM_R(b1) - CAM_R(b))) * DEG;
  // (capped: a blur longer than a few pixels would turn the board into smears)
  MOTION.sweep = Math.min(2.5, turn * F + Math.abs(CAM_H(b1) - CAM_H(b)) * 60);
}

function before(ctx, dt) {
  const b = dt / BEAT;
  motion(b);
  camera(b);
  const overhead = b >= OVERHEAD;
  const fog = floor(dt, overhead);
  boxes(LAYER, fog.fogS, fog.fogE);
  // the processor's traces: dormant ones fade as the camera arrives (the emblem shows only lit ones)
  const dE = dt - SEQ.shift;
  const far = Math.hypot(CAM.z - ZC, CAM.h);
  const steps = Math.floor(clamp((far - fog.fogS) / (fog.fogE - fog.fogS), 0, 1) * 4.99);
  emblemTraces(LAYER, dE, 1 - smoothstep(Q.crane, Q.land - 0.4, b), steps);
  LAYER.end(ctx);
  if (overhead) {
    // straight overhead the chip is the emblem's own sprite at the camera's scale (a pure push in:
    // it grows about a fixed centre, never a resampled texture)
    const k = (ZOOM * F) / CAM.h;
    const S = chipSprite(k);
    const half = S.S >> 1;
    ctx.drawImage(S.cv, CX - half, CY - half);
  }
  pinFlashes(ctx, dE);
}

const SEQ = sequence({ hit: HIT, before, reveal: TECH, handAt: HAND });

/** TECH BYTES' title sequence at dt seconds (full frame). */
export function drawTechTitles(ctx, dt, info) {
  SEQ.draw(ctx, dt, info);
}

export const TECH_TITLES = { ...TECH, warmJobs: () => [...TECH.warmJobs(), chipLevels] };
export const TECH_SEQ = SEQ;
/** The camera at beat b (for checks). */
export const techCamera = (b) => ({ ...camera(b) });
