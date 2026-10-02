// HI-RES GYM — a parody of moody sports-brand commercials. Black and white,
// one red accent, slow motion, a low motivational voice-over and long
// silences. The joke is literal: the footage itself starts at 48 x 27 and gains
// resolution on a cut, on each lockout of a deadlift and on the fall of a drop
// of sweat, while the letterbox and a resolution readout stay crisp on top.
// "Train your resolution."
//
// Six shots, 24 s, at 60 bpm (one beat = one second, so cues land on seconds):
//  1  0.0 LOCKER   a man on a bench under one pendant light lifts his head; the
//                  camera creeps in, so the 8 px cells crawl.           48 x 27
//                                                  VO "Low resolution."
//  2  3.6 RUN      dawn embankment, backlit, a slow-motion stride.      64 x 36
//                                                  VO "Blurry."
//  3  7.8 LIFT     front on, one top light over a platform in a dark gym; a
//                  deadlift; each lockout adds pixels; chalk off the floor.
//                                                  96 x 54 -> 128 x 72
//                                                  VO "So you trained." "Every rep, another pixel."
//  4 11.8 FACE     profile close-up, the held breath: a drop of sweat runs, hangs
//                  at the chin and falls, and the picture snaps to full resolution.
//  5 15.6 REVEAL   front, against a concrete wall: a silhouette, then the key light
//                  comes up on him. The red square on his chest.       384 x 216
//  6 19.4 SLATE    the wordmark resolves out of fat cells; tagline; legal.
//                                                  VO "Hi-Res Gym. Train your resolution."
//
// Every frame is a pure function of the ad clock. The runner and the lifter are
// procedural (adult proportions, IK, lit by stacked silhouette layers); the
// close-up and the reveal are baked once with per-pixel light (the distance to
// the edge that faces the light, quantised to the palette ramp) and drawn with
// a breathing offset. The low resolution is a real downsample of the finished
// frame through pooled canvases. Nothing is allocated per frame, and every bake
// is done during the first shot.
import { P, W, H, A, R, drawText, measureText, litShape, motes, prog, lerp } from './kit.js';

const { sin, cos, PI, round, floor, ceil, min, max, abs, sqrt, hypot, exp } = Math;
const TAU = PI * 2;

// --- timing ------------------------------------------------------------------------
const T_LOCKER = 0;
const T_RUN = 3.6;
const T_LIFT = 7.8;
const T_FACE = 11.8;
const T_REVEAL = 15.6;
const T_SLATE = 19.4;
const DURATION = 24.0;
const BAR = 18; // letterbox bars on the footage shots
// The deadlift (lift-shot clock): lockouts at 1.25 and 3.25 s, set-down at 2.35 s.
const LIFT_Q = [0, 0, 0.35, 0, 1.25, 1, 1.75, 1, 2.35, 0, 2.45, 0, 3.25, 1, 3.75, 1, 4.45, 0];
const LOCK1 = T_LIFT + 1.25;
const LOCK2 = T_LIFT + 3.25;
const DROP_FALL = 2.45; // face-shot clock: the drop leaves the chin
const SNAP = T_FACE + DROP_FALL;

// --- motion helpers ------------------------------------------------------------------
const c01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (x) => {
  const v = c01(x);
  return v * v * (3 - 2 * v);
};
const sine = (x) => (1 - cos(PI * c01(x))) / 2;
const mod = (a, n) => ((a % n) + n) % n;
const ramp = (t, a, b) => sine(prog(t, a, b));
/** Keyframe track on a flat [t0, v0, t1, v1, ...] array, sine-eased between keys. */
function keys(t, k) {
  if (t <= k[0]) return k[1];
  for (let i = 2; i < k.length; i += 2) {
    if (t < k[i]) return k[i - 1] + (k[i + 1] - k[i - 1]) * sine((t - k[i - 2]) / (k[i] - k[i - 2]));
  }
  return k[k.length - 1];
}
/** Same, but on a looping phase p in [0, 1) with keys covering 0..1. */
const loopKeys = (p, k) => keys(mod(p, 1), k);
const hash = (i) => {
  const s = sin(i * 127.1 + 311.7) * 43758.5453;
  return s - floor(s);
};

// --- raster helpers (crisp spans, no allocation) ----------------------------------------
const XS = new Float64Array(128);
function fillPoly(ctx, pts, n, c) {
  if (n < 3) return;
  ctx.fillStyle = c;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let i = 1; i < n * 2; i += 2) {
    if (pts[i] < y0) y0 = pts[i];
    if (pts[i] > y1) y1 = pts[i];
  }
  const ya = max(-2, floor(y0));
  const yb = min(1024, ceil(y1));
  for (let y = ya; y <= yb; y++) {
    const sy = y + 0.5;
    let k = 0;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const ay = pts[j * 2 + 1];
      const by = pts[i * 2 + 1];
      if (((ay <= sy && by > sy) || (by <= sy && ay > sy)) && k < 128) {
        const ax = pts[j * 2];
        XS[k++] = ax + ((sy - ay) / (by - ay)) * (pts[i * 2] - ax);
      }
    }
    for (let a = 1; a < k; a++) {
      const v = XS[a];
      let b = a - 1;
      while (b >= 0 && XS[b] > v) {
        XS[b + 1] = XS[b];
        b--;
      }
      XS[b + 1] = v;
    }
    for (let m = 0; m + 1 < k; m += 2) {
      const a = round(XS[m]);
      const b = round(XS[m + 1]);
      if (b > a) ctx.fillRect(a, y, b - a, 1);
    }
  }
}
const PT = new Float64Array(800);
let NP = 0;
function pt(x, y) {
  if (NP < 400) {
    PT[NP * 2] = x;
    PT[NP * 2 + 1] = y;
    NP++;
  }
}
function fillPts(ctx, c) {
  fillPoly(ctx, PT, NP, c);
  NP = 0;
}
function ellipse(ctx, cx, cy, rx, ry, c) {
  if (rx <= 0 || ry <= 0) return;
  ctx.fillStyle = c;
  const y0 = ceil(cy - ry - 0.5);
  const y1 = floor(cy + ry - 0.5);
  for (let y = y0; y <= y1; y++) {
    const dy = (y + 0.5 - cy) / ry;
    const hw = rx * sqrt(max(0, 1 - dy * dy));
    const a = round(cx - hw);
    const b = round(cx + hw);
    if (b > a) ctx.fillRect(a, y, b - a, 1);
  }
}
const CAP = new Float64Array(32);
function capsule(ctx, ax, ay, bx, by, ra, rb, c) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = hypot(dx, dy) || 1e-6;
  const ux = dx / len;
  const uy = dy / len;
  let n = 0;
  for (let i = 0; i <= 6; i++) {
    const a = PI / 2 + (PI * i) / 6;
    CAP[n++] = ax + (ux * cos(a) - uy * sin(a)) * ra;
    CAP[n++] = ay + (uy * cos(a) + ux * sin(a)) * ra;
  }
  for (let i = 0; i <= 6; i++) {
    const a = -PI / 2 + (PI * i) / 6;
    CAP[n++] = bx + (ux * cos(a) - uy * sin(a)) * rb;
    CAP[n++] = by + (uy * cos(a) + ux * sin(a)) * rb;
  }
  fillPoly(ctx, CAP, n / 2, c);
}
function line(ctx, x0, y0, x1, y1, c) {
  x0 = round(x0);
  y0 = round(y0);
  x1 = round(x1);
  y1 = round(y1);
  ctx.fillStyle = c;
  const dx = abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let i = 0; i < 600; i++) {
    ctx.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const rgbOf = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
/** Bake-time ordered-dither field: f(x, y) -> 0..1 picks along a colour ramp. */
function ditherField(c, x0, y0, w, h, ramp, f) {
  const img = c.getImageData(x0, y0, w, h);
  const d = img.data;
  const rgb = ramp.map(rgbOf);
  const n = ramp.length - 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = c01(f(x0 + x, y0 + y)) * n;
      const i = floor(v);
      const k = (v - i) * 16 > BAYER[((y0 + y) & 3) * 4 + ((x0 + x) & 3)] + 0.5 ? min(n, i + 1) : i;
      const o = (y * w + x) * 4;
      d[o] = rgb[k][0];
      d[o + 1] = rgb[k][1];
      d[o + 2] = rgb[k][2];
      d[o + 3] = 255;
    }
  }
  c.putImageData(img, x0, y0);
}
/** Bake-time light pool in four Bayer-dithered steps (no visible rings). */
function glowBake(c, cx, cy, rx, ry, hex, a) {
  const x0 = max(0, floor(cx - rx));
  const y0 = max(0, floor(cy - ry));
  const w = min(c.canvas.width, ceil(cx + rx)) - x0;
  const h = min(c.canvas.height, ceil(cy + ry)) - y0;
  if (w <= 0 || h <= 0) return;
  const img = c.getImageData(x0, y0, w, h);
  const d = img.data;
  const [r, g, b] = rgbOf(hex);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const q = hypot((x0 + x + 0.5 - cx) / rx, (y0 + y + 0.5 - cy) / ry);
      if (q >= 1) continue;
      const step = min(4, floor((1 - q) ** 1.5 * 4 + (BAYER[((y0 + y) & 3) * 4 + ((x0 + x) & 3)] + 0.5) / 16));
      if (!step) continue;
      const t = (step / 4) * a;
      const o = (y * w + x) * 4;
      d[o] += (r - d[o]) * t;
      d[o + 1] += (g - d[o + 1]) * t;
      d[o + 2] += (b - d[o + 2]) * t;
    }
  }
  c.putImageData(img, x0, y0);
}
/** Bake-time falloff: darken by factor k where f(x, y) beats the Bayer threshold. */
function shadeBake(c, x0, y0, w, h, k, f) {
  const img = c.getImageData(x0, y0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (c01(f(x0 + x, y0 + y)) * 16 > BAYER[((y0 + y) & 3) * 4 + ((x0 + x) & 3)] + 0.5) {
        const o = (y * w + x) * 4;
        d[o] *= k;
        d[o + 1] *= k;
        d[o + 2] *= k;
      }
    }
  }
  c.putImageData(img, x0, y0);
}
/** Static art painted once (read-friendly canvas for the bake, copied to a plain one). */
const BAKED = new Map();
function bake(key, w, h, paint) {
  let cv = BAKED.get(key);
  if (cv) return cv;
  const tmp = document.createElement('canvas');
  tmp.width = w;
  tmp.height = h;
  const c = tmp.getContext('2d', { willReadFrequently: true });
  c.imageSmoothingEnabled = false;
  paint(c);
  cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const out = cv.getContext('2d');
  out.imageSmoothingEnabled = false;
  out.drawImage(tmp, 0, 0);
  BAKED.set(key, cv);
  return cv;
}
const BUF = {};
function buf(name, w = W, h = H) {
  let b = BUF[name];
  if (!b) {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    b = BUF[name] = { cv, c };
  }
  b.c.setTransform(1, 0, 0, 1, 0, 0);
  b.c.globalAlpha = 1;
  b.c.globalCompositeOperation = 'source-over';
  b.c.clearRect(0, 0, b.cv.width, b.cv.height);
  return b;
}
/** Paint a ramp-index buffer (or -1 = transparent) into the canvas. */
function paintIndex(c, idx, ramp) {
  const img = c.getImageData(0, 0, W, H);
  const d = img.data;
  const rgb = ramp.map(rgbOf);
  for (let i = 0; i < W * H; i++) {
    const k = idx[i];
    const o = i * 4;
    if (k < 0) {
      d[o + 3] = 0;
      continue;
    }
    d[o] = rgb[k][0];
    d[o + 1] = rgb[k][1];
    d[o + 2] = rgb[k][2];
    d[o + 3] = 255;
  }
  c.putImageData(img, 0, 0);
}
/** Rasterise whatever paint(c) draws into a part-id buffer (later parts cover earlier). */
function partMask(c, ids, id, paint) {
  c.clearRect(0, 0, W, H);
  paint(c);
  const d = c.getImageData(0, 0, W, H).data;
  for (let i = 0; i < W * H; i++) if (d[i * 4 + 3] > 0) ids[i] = id;
}
// The grey ramp, light to dark (index 0..6).
const GREYS = [P.white, P.silver, P.fog, P.steel, P.slate, P.ink, P.black];

// --- resolution: the picture is downsampled for real ---------------------------------
// Each cell size b gets its own small canvas with smoothing on (a true average),
// blown back up with nearest neighbour. Steps cross-fade over a short "focus pull".
const MOS = {};
function mos(b) {
  let m = MOS[b];
  if (!m) {
    const cv = document.createElement('canvas');
    cv.width = W / b;
    cv.height = H / b;
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    m = MOS[b] = { cv, c };
  }
  return m;
}
function present(ctx, src, b, alpha) {
  if (alpha <= 0.01) return;
  ctx.globalAlpha = min(1, alpha);
  if (b <= 1) ctx.drawImage(src, 0, 0);
  else {
    const m = mos(b);
    m.c.clearRect(0, 0, W / b, H / b);
    m.c.drawImage(src, 0, 0, W, H, 0, 0, W / b, H / b);
    const smoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(m.cv, 0, 0, W / b, H / b, 0, 0, W, H);
    ctx.imageSmoothingEnabled = smoothing;
  }
  ctx.globalAlpha = 1;
}
// [time, cell size, cross-fade seconds]: the first step lands in the black of the
// dip into the run, then one on each lockout and the last on the falling drop.
const RES = [0, 8, 0, T_RUN + 0.4, 6, 0, LOCK1, 4, 0.3, LOCK2, 3, 0.3, SNAP, 1, 0.45];
const RES_LABEL = { 8: 'RES 48 X 27', 6: 'RES 64 X 36', 4: 'RES 96 X 54', 3: 'RES 128 X 72', 1: 'RES 384 X 216' };
const RES_KEY = { 8: 'hg-res-8', 6: 'hg-res-6', 4: 'hg-res-4', 3: 'hg-res-3', 1: 'hg-res-1' };
const RS = { b: 8, prev: 8, mix: 1, at: 0 };
/** Lab only: `fullRes` shows the footage without the mosaic (for inspecting the art). */
export const LAB = { fullRes: false };
function resAt(dt) {
  let i = 0;
  while (i + 3 < RES.length && dt >= RES[i + 3]) i += 3;
  RS.b = RES[i + 1];
  RS.prev = i ? RES[i - 2] : RES[1];
  RS.at = RES[i];
  RS.mix = RES[i + 2] > 0 ? smooth((dt - RES[i]) / RES[i + 2]) : 1;
  return RS;
}

// --- lettering --------------------------------------------------------------------------
// The brand face: condensed capitals with 2 px stems, sheared into italics. The
// hyphen is the brand's device: one red square, a single pixel of the picture.
const GYM = {
  H: '##..##|##..##|##..##|##..##|######|######|##..##|##..##|##..##|##..##|##..##',
  I: '##|##|##|##|##|##|##|##|##|##|##',
  R: '#####.|######|##..##|##..##|##..##|#####.|####..|##.##.|##..##|##..##|##..##',
  E: '#####|#####|##...|##...|##...|####.|####.|##...|##...|#####|#####',
  S: '.#####|######|##....|##....|#####.|.#####|....##|....##|....##|######|#####.',
  G: '.#####|######|##....|##....|##.###|##.###|##..##|##..##|##..##|######|.#####',
  Y: '##..##|##..##|##..##|##..##|######|.####.|..##..|..##..|..##..|..##..|..##..',
  M: '##....##|###..###|########|##.##.##|##....##|##....##|##....##|##....##|##....##|##....##|##....##',
};
const LETTERING = new Map();
/** The wordmark baked once at `scale`: white italic caps, the hyphen a red square. */
function gymMark(scale) {
  const key = `hg-mark-${scale}`;
  const hit = LETTERING.get(key);
  if (hit) return hit;
  const word = 'HI-RES GYM';
  let w = 2;
  for (const ch of word) w += (ch === ' ' ? 3 : ch === '-' ? 5 : GYM[ch].indexOf('|')) + 1;
  const cv = bake(key, w * scale, 11 * scale, (c) => {
    const px = (x, y, col) => {
      c.fillStyle = col;
      c.fillRect(x * scale, y * scale, scale, scale);
    };
    const shear = (y) => floor((10 - y) / 4);
    let x0 = 0;
    for (const ch of word) {
      if (ch === ' ') {
        x0 += 4;
        continue;
      }
      if (ch === '-') {
        for (let y = 4; y < 7; y++) for (let i = 0; i < 3; i++) px(x0 + 1 + i + shear(y), y, P.red);
        x0 += 6;
        continue;
      }
      const g = GYM[ch].split('|');
      for (let y = 0; y < 11; y++) {
        for (let i = 0; i < g[y].length; i++) if (g[y][i] === '#') px(x0 + i + shear(y), y, P.white);
      }
      x0 += g[0].length + 1;
    }
  });
  LETTERING.set(key, cv);
  return cv;
}
/** Letter-spaced caps baked once ('micro' 3x5 or 'body' 5x7). */
function label(key, s, track, color, font = 'micro') {
  const hit = LETTERING.get(key);
  if (hit) return hit;
  const cap = font === 'micro' ? 5 : 7;
  const asc = font === 'micro' ? 2 : 3;
  let w = 0;
  for (const ch of s) w += (ch === ' ' ? 2 : measureText(ch, 1, font)) + track;
  const cv = bake(key, max(1, w - track + 1), cap + asc + 2, (c) => {
    let x = 0;
    for (const ch of s) {
      if (ch === ' ') x += 2 + track;
      else {
        drawText(c, ch, x, asc, { color, font });
        x += measureText(ch, 1, font) + track;
      }
    }
  });
  LETTERING.set(key, cv);
  return cv;
}
function art(ctx, cv, x, y, alpha = 1, align = 'center') {
  if (alpha <= 0.01) return;
  ctx.globalAlpha = min(1, alpha);
  ctx.drawImage(cv, round(align === 'center' ? x - cv.width / 2 : x), round(y));
  ctx.globalAlpha = 1;
}

// --- the runner in profile ----------------------------------------------------------------
// Joints are solved into module state (J), then painted as one silhouette by
// paintSide(c, colour, ox, oy) so litShape can stack rim / fill / core layers.
const J = {
  f: 1, u: 16, lean: 0, head: 0, hx: 0, hy: 0, sx: 0, sy: 0, nx: 0, ny: 0, cx: 0, cy: 0,
  knee: new Float64Array(4), ankle: new Float64Array(4), toe: new Float64Array(4), heel: new Float64Array(4),
  elbow: new Float64Array(4), wrist: new Float64Array(4), hand: new Float64Array(4),
};
/** Torso and head from the hip, the lean and the head tilt. */
function solveTrunk(hx, hy) {
  const { f, u, lean } = J;
  J.hx = hx;
  J.hy = hy;
  const T = 2.15 * u;
  J.sx = hx + f * sin(lean) * T * 0.88;
  J.sy = hy - cos(lean) * T * 0.88;
  J.nx = hx + f * sin(lean) * T;
  J.ny = hy - cos(lean) * T;
  const ha = lean + J.head;
  J.cx = J.nx + f * sin(ha) * 0.72 * u + f * cos(ha) * 0.08 * u;
  J.cy = J.ny - cos(ha) * 0.72 * u + sin(ha) * 0.08 * u;
}
/** Leg by angles: thigh from vertical (+ forward), knee bend, foot flex. */
function solveLegFK(i, th, kn, pf) {
  const { f, u } = J;
  const kx = J.hx + f * sin(th) * 1.6 * u;
  const ky = J.hy + cos(th) * 1.6 * u;
  const sa = th - kn;
  const ax = kx + f * sin(sa) * 1.5 * u;
  const ay = ky + cos(sa) * 1.5 * u;
  J.knee[i] = kx;
  J.knee[i + 1] = ky;
  J.ankle[i] = ax;
  J.ankle[i + 1] = ay;
  const fx = f * cos(sa + pf);
  const fy = -sin(sa + pf);
  J.toe[i] = ax + fx * 0.78 * u;
  J.toe[i + 1] = ay + fy * 0.78 * u + 0.1 * u;
  J.heel[i] = ax - fx * 0.16 * u;
  J.heel[i + 1] = ay - fy * 0.16 * u + 0.12 * u;
}
/** Arm by world angles: upper arm from hanging (+ forward), elbow bend (+ forward). */
function solveArm(i, a, e) {
  const { f, u } = J;
  const ex = J.sx + f * sin(a) * 1.2 * u;
  const ey = J.sy + cos(a) * 1.2 * u;
  const fa = a + e;
  J.elbow[i] = ex;
  J.elbow[i + 1] = ey;
  J.wrist[i] = ex + f * sin(fa) * 1.0 * u;
  J.wrist[i + 1] = ey + cos(fa) * 1.0 * u;
  J.hand[i] = J.wrist[i] + f * sin(fa) * 0.36 * u;
  J.hand[i + 1] = J.wrist[i + 1] + cos(fa) * 0.36 * u;
}
// Athletic profile torso in (along the spine 0..1, across in u; + is the chest).
const TORSO_A = [0, -0.44, 0.3, -0.36, 0.62, -0.46, 0.86, -0.42, 1.0, -0.26, 1.04, -0.08, 1.02, 0.14, 0.9, 0.44, 0.74, 0.56, 0.52, 0.4, 0.3, 0.33, 0, 0.42];
function paintLeg(c, i, col, ox, oy) {
  const { u } = J;
  capsule(c, J.hx + ox, J.hy + oy, J.knee[i] + ox, J.knee[i + 1] + oy, 0.4 * u, 0.25 * u, col);
  capsule(c, J.knee[i] + ox, J.knee[i + 1] + oy, J.ankle[i] + ox, J.ankle[i + 1] + oy, 0.23 * u, 0.12 * u, col);
  const mx = J.knee[i] + (J.ankle[i] - J.knee[i]) * 0.3 - J.f * 0.1 * u;
  const my = J.knee[i + 1] + (J.ankle[i + 1] - J.knee[i + 1]) * 0.3;
  ellipse(c, mx + ox, my + oy, 0.26 * u, 0.34 * u, col);
  capsule(c, J.heel[i] + ox, J.heel[i + 1] + oy, J.toe[i] + ox, J.toe[i + 1] + oy, 0.2 * u, 0.15 * u, col);
}
function paintArm(c, i, col, ox, oy) {
  const { u } = J;
  ellipse(c, J.sx + ox, J.sy + oy + 0.1 * u, 0.36 * u, 0.36 * u, col);
  capsule(c, J.sx + ox, J.sy + oy, J.elbow[i] + ox, J.elbow[i + 1] + oy, 0.27 * u, 0.2 * u, col);
  capsule(c, J.elbow[i] + ox, J.elbow[i + 1] + oy, J.wrist[i] + ox, J.wrist[i + 1] + oy, 0.21 * u, 0.14 * u, col);
  capsule(c, J.wrist[i] + ox, J.wrist[i + 1] + oy, J.hand[i] + ox, J.hand[i + 1] + oy, 0.17 * u, 0.15 * u, col);
}
function paintTrunk(c, col, ox, oy) {
  const { f, u, lean } = J;
  const T = 2.15 * u;
  const ux = f * sin(lean);
  const uy = -cos(lean);
  const nx = f * cos(lean);
  const ny = sin(lean);
  for (let i = 0; i < TORSO_A.length; i += 2) pt(J.hx + ox + ux * TORSO_A[i] * T + nx * TORSO_A[i + 1] * u, J.hy + oy + uy * TORSO_A[i] * T + ny * TORSO_A[i + 1] * u);
  fillPts(c, col);
  ellipse(c, J.hx + ox - nx * 0.12 * u, J.hy + oy + 0.05 * u, 0.46 * u, 0.42 * u, col);
  capsule(c, J.nx + ox, J.ny + oy, J.cx + ox - f * 0.1 * u, J.cy + oy + 0.2 * u, 0.22 * u, 0.2 * u, col);
  const ha = lean + J.head;
  const hx = f * cos(ha);
  const hy = sin(ha);
  ellipse(c, J.cx + ox, J.cy + oy, 0.43 * u, 0.5 * u, col);
  capsule(c, J.cx + ox + hx * 0.2 * u, J.cy + oy + hy * 0.2 * u + 0.18 * u, J.cx + ox + hx * 0.36 * u, J.cy + oy + hy * 0.36 * u + 0.34 * u, 0.16 * u, 0.12 * u, col);
  ellipse(c, J.cx + ox + hx * 0.45 * u, J.cy + oy + hy * 0.45 * u + 0.04 * u, 0.08 * u, 0.1 * u, col);
}
/** The whole runner in one colour, offset (ox, oy): litShape paints it once per layer. */
function paintSide(c, col, ox, oy) {
  paintArm(c, 2, col, ox, oy);
  paintLeg(c, 2, col, ox, oy);
  paintLeg(c, 0, col, ox, oy);
  paintTrunk(c, col, ox, oy);
  paintArm(c, 0, col, ox, oy);
}
/** The near limbs again with their own rim, so they separate from the body behind them. */
function nearLimbs(ctx, rim, core, dx, dy) {
  paintLeg(ctx, 0, rim, dx, dy);
  paintLeg(ctx, 0, core, 0, 0);
  paintArm(ctx, 0, rim, dx, dy);
  paintArm(ctx, 0, core, 0, 0);
}

// --- 1. the locker room ----------------------------------------------------------------
// Close enough that at 48 x 27 the shape still reads: a man under a lamp. The
// camera creeps sideways and in, so the coarse cells visibly crawl: live footage.
const LOCK_W = W + 32;
const locker = () => bake('hg-locker', LOCK_W, H, (c) => {
  R(c, 0, 0, LOCK_W, H, P.black);
  for (let k = 0; k < 13; k++) {
    const x = 8 + k * 32;
    R(c, x, 24, 31, 150, P.steel);
    R(c, x, 24, 31, 1, P.fog);
    R(c, x, 24, 1, 150, P.fog);
    R(c, x + 30, 24, 1, 150, P.slate);
    for (let v = 0; v < 5; v++) R(c, x + 8, 34 + v * 4, 15, 1, P.slate);
    R(c, x + 23, 100, 3, 12, P.fog);
  }
  R(c, 0, 174, LOCK_W, 2, P.ink);
  const cx = LOCK_W / 2;
  shadeBake(c, 0, 0, LOCK_W, H, 0.6, (x, y) => hypot((x - cx) / 130, (y - 70) / 120) - 0.25);
  shadeBake(c, 0, 0, LOCK_W, H, 0.55, (x, y) => hypot((x - cx) / 170, (y - 70) / 150) - 0.4);
  shadeBake(c, 0, 0, LOCK_W, H, 0.5, (x, y) => hypot((x - cx) / 220, (y - 70) / 190) - 0.55);
  glowBake(c, cx, 192, 150, 22, P.slate, 0.9);
  R(c, cx - 122, 160, 244, 2, P.steel);
  R(c, cx - 122, 162, 244, 5, P.slate);
  R(c, cx - 122, 167, 244, 1, P.black);
  for (const x of [cx - 106, cx + 102]) R(c, x, 168, 5, 30, P.ink);
  R(c, cx - 1, 0, 1, 10, P.ink);
  pt(cx - 10, 20);
  pt(cx + 10, 20);
  pt(cx + 5, 10);
  pt(cx - 5, 10);
  fillPts(c, P.black);
  R(c, cx - 5, 10, 10, 1, P.slate);
  ellipse(c, cx, 20.5, 9, 1.8, P.white);
  c.globalAlpha = 0.05;
  for (let k = 0; k < 3; k++) {
    pt(cx - 8 + k * 2, 21);
    pt(cx + 8 - k * 2, 21);
    pt(cx + 108 - k * 26, 198);
    pt(cx - 108 + k * 26, 198);
    fillPts(c, P.silver);
  }
  c.globalAlpha = 1;
});
/** Seated, seen from the front, lit from straight above: every part gets a rim on top. */
function rimCap(c, ax, ay, bx, by, ra, rb, base, rim) {
  capsule(c, ax, ay - 1, bx, by - 1, ra, rb, rim);
  capsule(c, ax, ay, bx, by, ra, rb, base);
}
function seatedTorso(x, sy, seatY, sw, u, dy) {
  pt(x - 0.3 * u, sy - 0.1 * u + dy);
  pt(x - sw, sy + 0.08 * u + dy);
  pt(x - sw + 0.12 * u, sy + 0.95 * u);
  pt(x - 0.62 * u, seatY - 0.05 * u);
  pt(x + 0.62 * u, seatY - 0.05 * u);
  pt(x + sw - 0.12 * u, sy + 0.95 * u);
  pt(x + sw, sy + 0.08 * u + dy);
  pt(x + 0.3 * u, sy - 0.1 * u + dy);
}
function seated(c, x, seatY, u, bow, rise) {
  const sy = seatY - (2.3 - 0.32 * bow + rise) * u;
  const sw = 0.95 * u;
  for (let sd = -1; sd <= 1; sd += 2) {
    const kx = x + sd * 0.56 * u;
    const ky = seatY + 0.5 * u;
    rimCap(c, kx, ky, x + sd * 0.6 * u, seatY + 1.95 * u, 0.24 * u, 0.15 * u, P.black, P.slate);
    rimCap(c, x + sd * 0.38 * u, seatY - 0.15 * u, kx, ky, 0.42 * u, 0.34 * u, P.black, P.steel);
  }
  seatedTorso(x, sy, seatY, sw, u, 0);
  fillPts(c, P.steel);
  seatedTorso(x, sy, seatY, sw, u, 1.5);
  fillPts(c, P.black);
  const hy = sy - (0.62 - 0.55 * bow) * u;
  ellipse(c, x, hy - 1.5, 0.38 * u, 0.5 * u, P.silver);
  ellipse(c, x, hy, 0.38 * u, 0.5 * u, P.black);
  ellipse(c, x, hy - (0.18 - 0.2 * bow) * u, 0.39 * u, (0.3 + 0.18 * bow) * u, P.black);
  ellipse(c, x, hy - 0.5 * u + 1, 0.22 * u, 1, P.fog);
  if (bow < 0.6) {
    // face up: the brow and the nose catch the top light, the eyes stay in shadow
    c.globalAlpha = c01((0.6 - bow) / 0.4);
    R(c, round(x - 0.22 * u), round(hy - 0.06 * u), round(0.44 * u), 1, P.slate);
    R(c, round(x), round(hy + 0.04 * u), 1, round(0.22 * u), P.slate);
    R(c, round(x - 0.12 * u), round(hy + 0.36 * u), round(0.24 * u), 1, P.slate);
    c.globalAlpha = 1;
  }
  rimCap(c, x - 0.34 * u, sy - 0.02 * u, x - 0.28 * u, sy + 1.15 * u, 0.17 * u, 0.15 * u, P.ink, P.fog);
  rimCap(c, x + 0.34 * u, sy - 0.02 * u, x + 0.28 * u, sy + 1.15 * u, 0.17 * u, 0.15 * u, P.ink, P.fog);
  capsule(c, x - 0.34 * u, sy - 0.05 * u, x + 0.34 * u, sy - 0.05 * u, 0.15 * u, 0.15 * u, P.slate);
  for (let sd = -1; sd <= 1; sd += 2) {
    const jx = x + sd * (sw - 0.15 * u);
    const jy = sy + 0.18 * u;
    const ex = x + sd * 0.72 * u;
    const ey = seatY + 0.28 * u;
    rimCap(c, jx, jy, ex, ey, 0.27 * u, 0.21 * u, P.black, P.fog);
    rimCap(c, ex, ey, x + sd * 0.16 * u, seatY + 0.78 * u, 0.2 * u, 0.15 * u, P.black, P.slate);
  }
  ellipse(c, x, seatY + 0.86 * u, 0.24 * u, 0.2 * u, P.ink);
  ellipse(c, x, seatY + 0.82 * u, 0.2 * u, 0.12 * u, P.slate);
}
function shotLocker(c, lt) {
  // a slow creep sideways and in: 3 px a second
  const drift = lt * 3.2;
  c.drawImage(locker(), -round(4 + drift), 0);
  const lift = ramp(lt, 1.0, 2.5);
  const br = (1 - cos(lt * 1.7)) / 2;
  seated(c, LOCK_W / 2 - 4 - drift * 1.15, 160 - br * 0.8, 24 + lt * 0.5, 1 - lift, lift * 0.08);
}

// --- 2. the run: dawn, backlit, slow motion ---------------------------------------------
const SUN_X = 92;
const SUN_Y = 128;
const sky = () => bake('hg-sky', W, H, (c) => {
  ditherField(c, 0, 0, W, 152, [P.slate, P.steel, P.fog, P.silver], (x, y) => y / 150);
  glowBake(c, SUN_X, SUN_Y, 130, 90, P.white, 0.55);
  ellipse(c, SUN_X, SUN_Y, 15, 15, P.white);
  R(c, 0, 146, W, 6, P.fog);
  R(c, 0, 146, W, 1, P.white);
});
const CITY_W = 512;
const city = () => bake('hg-city', CITY_W, 60, (c) => {
  for (let k = 0; k < 40; k++) {
    const w = 8 + floor(hash(k + 3) * 18);
    const h = 8 + floor(hash(k + 9) * 34) + (k % 7 === 3 ? 18 : 0);
    const x = floor(hash(k + 21) * CITY_W);
    R(c, x, 60 - h, w, h, P.steel);
    if (x + w > CITY_W) R(c, x - CITY_W, 60 - h, w, h, P.steel);
  }
  R(c, 0, 50, CITY_W, 3, P.steel);
  for (let x = 20; x < CITY_W; x += 90) {
    R(c, x, 36, 3, 24, P.steel);
    line(c, x + 1, 36, x - 40, 50, P.steel);
    line(c, x + 1, 36, x + 42, 50, P.steel);
  }
});
const RAIL_W = 64;
const rail = () => bake('hg-rail', RAIL_W, 66, (c) => {
  R(c, 0, 0, RAIL_W, 2, P.black);
  for (let x = 0; x < RAIL_W; x += 8) R(c, x, 2, 2, 12, P.black);
  R(c, 0, 14, RAIL_W, 26, P.ink);
  R(c, 0, 14, RAIL_W, 1, P.steel);
  for (let y = 20; y < 40; y += 7) R(c, 0, y, RAIL_W, 1, P.black);
  for (let x = 6; x < RAIL_W; x += 22) R(c, x, 15, 1, 25, P.black);
  R(c, 0, 40, RAIL_W, 26, P.slate);
  R(c, 0, 40, RAIL_W, 1, P.fog);
  R(c, 0, 52, RAIL_W, 1, P.ink);
  R(c, 30, 41, 1, 25, P.ink);
});
// Run cycle on a 0..1 phase: thigh (+ forward) and knee bend, eased between keys.
const RUN_TH = [0, -0.5, 0.15, -0.12, 0.3, 0.45, 0.45, 0.78, 0.5, 0.66, 0.75, 0.1, 1, -0.5];
const RUN_KN = [0, 0.35, 0.15, 1.75, 0.3, 1.3, 0.45, 0.4, 0.5, 0.2, 0.75, 0.45, 1, 0.35];
const RUN_PF = [0, 0.7, 0.2, 0.3, 0.45, -0.1, 0.5, -0.2, 0.75, 0.1, 1, 0.7];
const RUN_LAYERS = [[P.white, 0, 0], [P.slate, 1, 0], [P.black, 2, 1]];
const STRIDE = 1.5; // seconds per full cycle (slow motion)
function shotRun(c, lt) {
  c.drawImage(sky(), 0, 0);
  const scroll = lt * 64;
  const cityOff = mod(lt * 5, CITY_W);
  c.drawImage(city(), -cityOff, 92);
  c.drawImage(city(), CITY_W - cityOff, 92);
  const r = rail();
  for (let x = -mod(scroll, RAIL_W); x < W; x += RAIL_W) c.drawImage(r, round(x), 136);
  const p = lt / STRIDE + 0.1;
  J.f = 1;
  J.u = 17;
  J.lean = 0.14;
  J.head = -0.08;
  const bob = cos(mod(p, 0.5) * TAU * 2) * 0.12 * J.u;
  solveTrunk(176 + sin(lt * 0.9) * 2, 188 - 3.3 * J.u - bob);
  solveLegFK(0, loopKeys(p, RUN_TH), loopKeys(p, RUN_KN), loopKeys(p, RUN_PF));
  solveLegFK(2, loopKeys(p + 0.5, RUN_TH), loopKeys(p + 0.5, RUN_KN), loopKeys(p + 0.5, RUN_PF));
  const sw = sin(mod(p, 1) * TAU - 0.9);
  solveArm(0, 0.1 + 0.95 * sw, 1.35 + 0.35 * sw);
  solveArm(2, 0.1 - 0.95 * sw, 1.35 - 0.35 * sw);
  litShape(c, paintSide, RUN_LAYERS);
  nearLimbs(c, A(P.fog, 0.9), P.black, -1, 0);
  // white soles and the one red detail: the shoe stripe
  for (let i = 2; i >= 0; i -= 2) {
    line(c, J.heel[i], J.heel[i + 1] + 0.2 * J.u, J.toe[i], J.toe[i + 1] + 0.12 * J.u, i ? P.fog : P.silver);
    if (!i) line(c, J.heel[i] + 3, J.heel[i + 1] - 1, (J.heel[i] + J.toe[i]) / 2 + 2, (J.heel[i + 1] + J.toe[i + 1]) / 2 - 1, P.red);
  }
  // breath in the cold air, once per stride
  const bq = mod(p, 1);
  if (bq < 0.5) {
    c.globalAlpha = 0.35 * (1 - bq * 2);
    ellipse(c, J.cx + 10 + bq * 18, J.cy + 4 - bq * 4, 3 + bq * 8, 2 + bq * 4, P.white);
    c.globalAlpha = 1;
  }
  // foreground lamp posts sweep past
  for (let x = W + 40 - mod(lt * 118 + 150, 330); x > -20; x -= 330) {
    R(c, round(x), 20, 5, 180, P.black);
    R(c, round(x) - 6, 18, 17, 4, P.black);
  }
}

// --- 3. the lift: front on, one top light, a deadlift -------------------------------------
// The gym is dressed but kept in the dark: a plate tree and a bench at the edges of
// the light, a mirror's edge, chalk marks on the platform; dust turns in the cone.
const LX = 192; // the lifter's centre line
const LFY = 186; // the platform
const LU = 18; // head height
const gym = () => bake('hg-gym', W, H, (c) => {
  R(c, 0, 0, W, H, P.black);
  glowBake(c, LX, 84, 160, 104, P.ink, 0.95);
  // a mirror wall's edge, far right, catching a sliver of the light
  R(c, 330, 30, 1, 150, P.slate);
  R(c, 331, 30, 40, 150, P.ink);
  shadeBake(c, 331, 30, 40, 150, 0.6, (x) => (x - 333) / 30);
  // plate tree at the left: a post with three plates seen edge-on, top-lit
  R(c, 66, 92, 4, 86, P.ink);
  R(c, 66, 92, 4, 1, P.slate);
  for (let k = 0; k < 3; k++) {
    const py = 104 + k * 26;
    R(c, 52, py, 32, 22, P.black);
    R(c, 52, py, 32, 1, P.slate);
    R(c, 53, py + 1, 30, 1, P.ink);
    R(c, 54, py + 10, 28, 1, P.ink);
  }
  // a flat bench at the right
  R(c, 268, 150, 52, 6, P.ink);
  R(c, 268, 150, 52, 1, P.slate);
  R(c, 274, 156, 4, 24, P.black);
  R(c, 310, 156, 4, 24, P.black);
  R(c, 270, 178, 46, 2, P.ink);
  // platform: dark boards, chalk marks, the light pool and its reflection
  R(c, 0, 178, W, 38, P.black);
  R(c, 64, LFY - 8, 256, 10, P.ink);
  R(c, 64, LFY - 8, 256, 1, P.slate);
  for (let x = 96; x < 320; x += 32) R(c, x, LFY - 7, 1, 9, P.black);
  glowBake(c, LX, LFY - 2, 116, 12, P.steel, 0.6);
  for (const [x, w] of [[150, 9], [222, 7], [188, 4]]) R(c, x, LFY - 4, w, 1, P.fog);
  // the light above and its cone
  ellipse(c, LX, 14, 16, 2, P.white);
  R(c, LX - 18, 11, 36, 2, P.black);
  c.globalAlpha = 0.045;
  for (let k = 0; k < 4; k++) {
    pt(LX - 13 + k * 3, 15);
    pt(LX + 13 - k * 3, 15);
    pt(LX + 112 - k * 24, LFY);
    pt(LX - 112 + k * 24, LFY);
    fillPts(c, P.silver);
  }
  c.globalAlpha = 1;
});
const LJ = { hipY: 0, shY: 0, headY: 0, barY: 0, kneeY: 0, kneeX: 0 };
/** The lifter's joints (front view) for a lift phase q (0 bar on the floor .. 1 lockout). */
function solveLifter(q) {
  const u = LU;
  const e = smooth(q);
  LJ.hipY = LFY - lerp(2.35, 3.3, e) * u;
  LJ.shY = LFY - lerp(3.8, 5.35, e) * u;
  LJ.headY = LJ.shY - lerp(0.75, 1.02, e) * u;
  LJ.barY = LFY - lerp(0.85, 2.85, e) * u;
  LJ.kneeY = LFY - lerp(1.5, 1.75, e) * u;
  LJ.kneeX = lerp(0.74, 0.42, e) * u;
}
/** The lifter in one colour (offset), for the layered top light: an athlete, not a bear. */
function paintLifter(c, col, ox, oy) {
  const u = LU;
  const x = LX + ox;
  const { hipY, shY, headY, kneeY, kneeX, barY } = LJ;
  for (let sd = -1; sd <= 1; sd += 2) {
    capsule(c, x + sd * 0.36 * u, hipY + oy, x + sd * kneeX, kneeY + oy, 0.36 * u, 0.26 * u, col);
    capsule(c, x + sd * kneeX, kneeY + oy, x + sd * 0.42 * u, LFY - 0.2 * u + oy, 0.24 * u, 0.15 * u, col);
    ellipse(c, x + sd * 0.46 * u, LFY - 0.1 * u + oy, 0.26 * u, 0.11 * u, col);
  }
  // torso: lats tapering to the belt
  pt(x - 0.28 * u, shY - 0.2 * u + oy);
  pt(x - 0.96 * u, shY + 0.06 * u + oy);
  pt(x - 0.9 * u, shY + 0.42 * (hipY - shY) + oy);
  pt(x - 0.56 * u, hipY - 0.1 * u + oy);
  pt(x - 0.62 * u, hipY + 0.4 * u + oy);
  pt(x + 0.62 * u, hipY + 0.4 * u + oy);
  pt(x + 0.56 * u, hipY - 0.1 * u + oy);
  pt(x + 0.9 * u, shY + 0.42 * (hipY - shY) + oy);
  pt(x + 0.96 * u, shY + 0.06 * u + oy);
  pt(x + 0.28 * u, shY - 0.2 * u + oy);
  fillPts(c, col);
  capsule(c, x - 0.5 * u, shY - 0.04 * u + oy, x + 0.5 * u, shY - 0.04 * u + oy, 0.2 * u, 0.2 * u, col);
  capsule(c, x, shY + oy, x, headY + 0.3 * u + oy, 0.22 * u, 0.2 * u, col);
  ellipse(c, x, headY + oy, 0.37 * u, 0.5 * u, col);
  for (let sd = -1; sd <= 1; sd += 2) {
    ellipse(c, x + sd * 0.9 * u, shY + 0.24 * u + oy, 0.32 * u, 0.36 * u, col);
    capsule(c, x + sd * 0.9 * u, shY + 0.3 * u + oy, x + sd * 0.84 * u, barY - 0.2 * u + oy, 0.26 * u, 0.19 * u, col);
  }
}
// The top light: a bright edge on every top-facing contour, falling off in steps.
const LIFT_TOP = [[P.silver, 0, 0], [P.fog, 0, 1], [P.steel, 0, 2], [P.slate, 0, 4], [P.black, 0, 7]];
function plateEdge(c, x, y, dir) {
  // two bumper plates seen edge-on: a dark rubber rim, the top lit, the outer face red
  const r = 0.86 * LU;
  for (let k = 0; k < 2; k++) {
    const px = x + dir * k * 5;
    ellipse(c, px, y, 3, r, P.black);
    ellipse(c, px, y - 1, 2, r - 1, P.ink);
    R(c, px - 2, y - r, 4, 1, P.steel);
    R(c, px - 1, y - r, 2, 1, P.silver);
  }
  const ox = x + dir * 8;
  ellipse(c, ox, y, 1.6, r - 1, P.darkRed);
  R(c, ox - (dir > 0 ? 0 : 1), y - r * 0.7, 1, r * 1.1, P.red);
  R(c, x + dir * 11, y - 2, 3 * dir, 4, P.slate);
  R(c, x + dir * 11, y - 2, 3 * dir, 1, P.fog);
}
const MOTES = { x: 112, y: 30, w: 160, h: 140, n: 26, seed: 7, drift: 5, fall: 1, color: P.silver, alpha: 0.45, inside: null };
function shotLift(c, lt) {
  c.drawImage(gym(), 0, 0);
  motes(c, lt + 20, MOTES);
  const q = keys(lt, LIFT_Q);
  solveLifter(q);
  const u = LU;
  const { hipY, shY, headY, barY } = LJ;
  // a thin back-light rim on his right side only, then the graded top light
  paintLifter(c, P.slate, 1, 0);
  litShape(c, paintLifter, LIFT_TOP);
  // the lifting belt: a broad band and its buckle
  R(c, LX - 0.62 * u, hipY - 0.16 * u, 1.24 * u, 0.36 * u, P.black);
  R(c, LX - 0.62 * u, hipY - 0.16 * u, 1.24 * u, 1, P.slate);
  R(c, LX - 0.13 * u, hipY - 0.1 * u, 0.26 * u, 0.22 * u, P.steel);
  R(c, LX - 0.09 * u, hipY - 0.1 * u, 0.18 * u, 1, P.silver);
  // the face under the top light: brow and nose lit, the eyes in shadow
  R(c, LX - 0.26 * u, headY - 0.16 * u, 0.52 * u, 1, P.steel);
  R(c, LX, headY - 0.08 * u, 1, 0.28 * u, P.slate);
  R(c, LX - 0.12 * u, headY + 0.28 * u, 0.24 * u, 1, P.ink);
  // arms again, a dark gap and an edge each, so they separate from the body
  for (let sd = -1; sd <= 1; sd += 2) {
    const ax = LX + sd * 0.9 * u;
    capsule(c, ax + sd, shY + 0.62 * u, LX + sd * 0.84 * u + sd, barY - 0.2 * u, 0.26 * u, 0.2 * u, sd > 0 ? P.slate : P.ink);
    capsule(c, ax, shY + 0.62 * u, LX + sd * 0.84 * u, barY - 0.2 * u, 0.25 * u, 0.19 * u, P.black);
    R(c, ax - sd * 0.28 * u - (sd > 0 ? 1 : 0), shY + 0.66 * u, 1, max(1, barY - shY - 1.1 * u), P.black);
  }
  // the bar: a 2 px line, lit on top; the plates at its ends; chalked hands over it
  R(c, LX - 3.05 * u, barY - 1, 6.1 * u, 1, P.white);
  R(c, LX - 3.05 * u, barY, 6.1 * u, 1, P.steel);
  plateEdge(c, LX - 2.6 * u, barY, -1);
  plateEdge(c, LX + 2.6 * u, barY, 1);
  for (let sd = -1; sd <= 1; sd += 2) {
    const hx = LX + sd * 0.84 * u;
    ellipse(c, hx, barY, 0.3 * u, 0.26 * u, P.slate);
    R(c, hx - 0.25 * u, barY - 0.24 * u, 0.5 * u, 1, P.silver);
    R(c, hx - 0.1 * u, barY - 0.05 * u, 1, 1, P.white);
  }
  // chalk off the hands at each lockout
  const lock = max(0, max(1 - abs(lt - 1.5) / 0.9, 1 - abs(lt - 3.5) / 0.9));
  if (lock > 0) {
    c.globalAlpha = 0.4 * lock;
    for (let k = 0; k < 8; k++) {
      const a = hash(k + 40) * TAU;
      const d = (1 - lock) * 10 + 2;
      R(c, round(LX + (k & 1 ? 1 : -1) * 0.84 * u + cos(a) * d), round(barY - 3 + sin(a) * d * 0.6 - (1 - lock) * 6), 1, 1, P.white);
    }
    c.globalAlpha = 1;
  }
  // set-down: chalk dust rolls out along the platform from under the plates
  const sd = prog(lt, 2.3, 3.3);
  if (sd > 0 && sd < 1) {
    for (let k = 0; k < 14; k++) {
      const side = k & 1 ? 1 : -1;
      const sp = 0.4 + hash(k + 80) * 0.6;
      const x = LX + side * (2.6 * u + sd * sp * 26);
      const y = LFY - 1 - sd * sp * 6 * hash(k + 90);
      c.fillStyle = A(P.silver, 0.5 * (1 - sd));
      c.fillRect(round(x), round(y), 1 + (k % 3 === 0 ? 1 : 0), 1);
    }
  }
}

// --- 4. the face: a drop of sweat, and focus ----------------------------------------------
// Profile facing right, in local units (crown y 0, chin ~y 100), scaled by FK.
const FACE = [
  8, 40, 6, 28, 12, 14, 24, 5, 40, 0, 56, 1, 68, 6, 76, 14, 81, 24, 84, 34, 86, 40, 85, 44, 83, 47, 86, 54, 90, 62,
  93, 68, 94, 71, 92, 74, 88, 75, 85, 76, 85, 79, 87, 81, 87, 83, 84, 84, 86, 86, 85, 88, 82, 91, 84, 95, 83, 99,
  79, 102, 70, 104, 60, 103, 58, 108, 60, 118, 63, 130, 66, 150, 20, 150, 22, 118, 18, 100, 16, 88, 12, 76, 8, 62,
  6, 50,
];
const HAIR = [40, 0, 56, 1, 66, 5, 58, 9, 46, 13, 34, 22, 24, 34, 18, 48, 14, 62, 8, 62, 6, 50, 8, 40, 6, 28, 12, 14, 24, 5];
const SHOULDER = [22, 116, 2, 124, -40, 134, -40, 160, 24, 160];
/** Catmull-Rom subdivision of a closed polygon (flat x, y list), built once at load. */
function smoothPath(src, steps) {
  const n = src.length / 2;
  const out = new Float64Array(n * steps * 2);
  let o = 0;
  for (let i = 0; i < n; i++) {
    const i0 = (i - 1 + n) % n;
    const i2 = (i + 1) % n;
    const i3 = (i + 2) % n;
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      for (let a = 0; a < 2; a++) {
        const p0 = src[i0 * 2 + a];
        const p1 = src[i * 2 + a];
        const p2 = src[i2 * 2 + a];
        const p3 = src[i3 * 2 + a];
        out[o++] = 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3);
      }
    }
  }
  return out;
}
const FACE_S = smoothPath(FACE, 3);
const HAIR_S = smoothPath(HAIR, 3);
const FK = 1.75;
const FX = 58;
const FY = -24;
const fx = (v) => FX + v * FK;
const fy = (v) => FY + v * FK;
function localPts(arr) {
  for (let i = 0; i < arr.length; i += 2) pt(fx(arr[i]), fy(arr[i + 1]));
}
const EAR = [42, 47, 46, 48, 47.5, 52, 47, 58, 45.5, 62, 44, 66, 41, 66.5, 39.5, 63, 39, 58, 38.5, 52, 40, 48];
const faceBg = () => bake('hg-face-bg', W, H, (c) => {
  ditherField(c, 0, 0, W, H, [P.black, P.ink, P.slate], (x, y) => 0.95 - hypot((x - 40) / 260, (y - 90) / 200) * 1.1);
  glowBake(c, 340, 100, 90, 110, P.ink, 0.6);
});
// The close-up is lit as a height field inside the drawn profile: the face's
// depth grows with the distance from its outline (a rounded solid), plus sculpted
// bumps and hollows (brow ridge, eye socket, cheekbone, the hollow under it, jaw,
// nose wing, lips, chin, the neck's long muscle). Normals come from that height;
// the key from the front (screen right, a little above) casts shadows across it,
// so the brow shades the eye, the nose the cheek and the jaw the neck.
const FACE_KEY = (() => {
  const l = hypot(0.8, -0.42, 0.42);
  return [0.8 / l, -0.42 / l, 0.42 / l];
})();
const FACE_HALF = (() => {
  const l = hypot(FACE_KEY[0], FACE_KEY[1], FACE_KEY[2] + 1);
  return [FACE_KEY[0] / l, FACE_KEY[1] / l, (FACE_KEY[2] + 1) / l];
})();
// [x, y (face units), radius x, radius y, height in px (+ bump, - hollow)]
const FACE_BUMPS = [
  [77, 41.5, 9, 3.2, 7], // brow ridge
  [77, 49.5, 6, 3.6, -8], // eye socket
  [79, 49.5, 2.6, 1.8, 3], // the eyeball under the lid
  [70, 59, 8, 5, 7], // cheekbone
  [63, 71, 9, 8, -4], // the hollow under it
  [86, 64, 5, 8, 9], // the nose
  [82, 70, 3.2, 3, 5], // the nose's wing
  [82, 79, 4, 2.6, 4], // upper lip
  [81, 86, 3.6, 2.2, 4], // lower lip
  [79, 96, 6, 4.5, 5], // chin
  [53, 90, 9, 11, 5], // the angle of the jaw
  [44, 38, 14, 13, -3], // temple
  [56, 112, 4, 18, 3], // the neck's long muscle, top
  [61, 128, 4, 14, 3], // and towards the collarbone
];
/** Chamfer distance (in px) from the edge of part `id`, inside the box. */
function chamfer(ids, id, d, x0, y0, x1, y1) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const o = y * W + x;
      if (ids[o] !== id) {
        d[o] = 0;
        continue;
      }
      const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1 || ids[o - 1] !== id || ids[o + 1] !== id || ids[o - W] !== id || ids[o + W] !== id;
      d[o] = edge ? 3 : 1e6;
    }
  }
  for (let y = max(1, y0); y < y1; y++) {
    for (let x = max(1, x0); x < min(W - 1, x1); x++) {
      const o = y * W + x;
      if (ids[o] !== id) continue;
      d[o] = min(d[o], d[o - 1] + 3, d[o - W] + 3, d[o - W - 1] + 4, d[o - W + 1] + 4);
    }
  }
  for (let y = min(H - 2, y1 - 1); y >= y0; y--) {
    for (let x = min(W - 2, x1 - 1); x >= max(1, x0); x--) {
      const o = y * W + x;
      if (ids[o] !== id) continue;
      d[o] = min(d[o], d[o + 1] + 3, d[o + W] + 3, d[o + W + 1] + 4, d[o + W - 1] + 4);
    }
  }
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (ids[y * W + x] === id) d[y * W + x] /= 3;
}
// Skin, close up: one more step of light than the reveal (the key is nearer).
const FACE_STEPS = [0.1, 6, 0.22, 5, 0.4, 4, 0.6, 3, 0.82, 2, 9, 1];
const faceArt = () => bake('hg-face', W, H, (c) => {
  // parts: 1 head and neck, 2 shoulder, 3 ear
  const ids = new Uint8Array(W * H);
  partMask(c, ids, 2, (k) => {
    localPts(SHOULDER);
    fillPts(k, P.white);
  });
  partMask(c, ids, 1, (k) => {
    localPts(FACE_S);
    fillPts(k, P.white);
  });
  partMask(c, ids, 3, (k) => {
    localPts(EAR);
    fillPts(k, P.white);
  });
  // height: a rounded solid from the outline, then the sculpted forms
  const d = new Float32Array(W * H);
  const h = new Float32Array(W * H);
  for (const [id, r] of [[1, 34], [2, 30], [3, 5]]) {
    chamfer(ids, id, d, 0, 0, W, H);
    for (let o = 0; o < W * H; o++) {
      if (ids[o] !== id) continue;
      const q = min(1, d[o] / r);
      h[o] = r * sqrt(1 - (1 - q) * (1 - q)) + (id === 3 ? 26 : 0);
    }
  }
  for (const [bx, by, rx, ry, a] of FACE_BUMPS) {
    const cx = fx(bx);
    const cy = fy(by);
    const sx = rx * FK;
    const sy = ry * FK;
    for (let y = max(0, floor(cy - sy * 3)); y < min(H, ceil(cy + sy * 3)); y++) {
      for (let x = max(0, floor(cx - sx * 3)); x < min(W, ceil(cx + sx * 3)); x++) {
        const o = y * W + x;
        if (ids[o] !== 1) continue;
        h[o] += a * exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2));
      }
    }
  }
  // the ear's bowl is a hollow
  {
    const cx = fx(43);
    const cy = fy(56);
    for (let y = floor(cy - 14); y < cy + 14; y++) {
      for (let x = floor(cx - 8); x < cx + 8; x++) {
        const o = y * W + x;
        if (ids[o] === 3) h[o] -= 4 * exp(-(((x - cx) / 4) ** 2 + ((y - cy) / 8) ** 2));
      }
    }
  }
  // light every pixel: normal from the height, the key traced for shadows
  const idx = new Int8Array(W * H).fill(-1);
  const hAt = (x, y, id) => {
    const o = y * W + x;
    return ids[o] === id ? h[o] : null;
  };
  const steps = hypot(FACE_KEY[0], FACE_KEY[1]);
  const rise = FACE_KEY[2] / steps;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const o = y * W + x;
      const id = ids[o];
      if (!id) continue;
      const hl = hAt(x - 1, y, id) ?? h[o];
      const hr = hAt(x + 1, y, id) ?? h[o];
      const hu = hAt(x, y - 1, id) ?? h[o];
      const hd = hAt(x, y + 1, id) ?? h[o];
      let nx = -(hr - hl) / 2;
      let ny = -(hd - hu) / 2;
      let nz = 1;
      const nl = hypot(nx, ny, nz);
      nx /= nl;
      ny /= nl;
      nz /= nl;
      let v = max(0, nx * FACE_KEY[0] + ny * FACE_KEY[1] + nz * FACE_KEY[2]);
      if (v > 0) {
        // march towards the light over the height field
        const sx = FACE_KEY[0] / steps;
        const sy = FACE_KEY[1] / steps;
        for (let s = 2; s < 60; s++) {
          const qx = round(x + sx * s);
          const qy = round(y + sy * s);
          if (qx < 0 || qy < 0 || qx >= W || qy >= H) break;
          const q = qy * W + qx;
          if (ids[q] && h[q] > h[o] + rise * s + 0.6) {
            v *= 0.18;
            break;
          }
        }
      }
      const spec = v > 0.5 ? max(0, nx * FACE_HALF[0] + ny * FACE_HALF[1] + nz * FACE_HALF[2]) ** 50 : 0;
      v = 0.05 + 0.95 * v;
      let g = 1;
      for (let i = 0; i < FACE_STEPS.length; i += 2) {
        if (v < FACE_STEPS[i]) {
          g = FACE_STEPS[i + 1];
          break;
        }
      }
      if (spec > 0.7) g = 0;
      idx[o] = g;
    }
  }
  paintIndex(c, idx, GREYS);
  // close-cropped hair: black with a grain, the lit edge of the hairline
  localPts(HAIR_S);
  fillPts(c, P.black);
  for (let k = 0; k < 70; k++) R(c, round(fx(12 + hash(k) * 46)), round(fy(4 + hash(k + 30) * 54)), 1, 1, k & 1 ? P.ink : P.slate);
  for (let i = 6; i < HAIR.length - 18; i += 2) R(c, round(fx(HAIR[i])) + 1, round(fy(HAIR[i + 1])), 1, 1, P.slate);
  // the ear's rim and lobe
  for (let i = 0; i < 12; i += 2) R(c, round(fx(EAR[i])), round(fy(EAR[i + 1])) + 1, 1, 1, P.steel);
  line(c, fx(41.5), fy(64), fx(43.5), fy(65.5), P.ink);
  // the brow: short hairs over the lit ridge
  for (let k = 0; k < 9; k++) R(c, round(fx(72 + k * 1.3)), round(fy(44.4 + k * 0.08)), 1, 2, k & 1 ? P.ink : P.black);
  // the eye, half-closed in the effort: lid and lashes, iris, a soft catchlight
  line(c, fx(74.5), fy(49.4), fx(80), fy(49.8), P.black);
  line(c, fx(80), fy(49.8), fx(81.5), fy(49.3), P.black);
  R(c, round(fx(77.6)), round(fy(50.2)), 3, 2, P.black);
  R(c, round(fx(79.2)), round(fy(50.2)), 1, 1, P.fog);
  line(c, fx(75.5), fy(52.2), fx(79.5), fy(52), P.slate);
  // the nostril, inside the wing, and the crease above it
  line(c, fx(80.5), fy(67.5), fx(82.5), fy(72.5), P.slate);
  R(c, round(fx(84.6)), round(fy(73.4)), 2, 1, P.ink);
  // the line between the lips
  line(c, fx(79.5), fy(84.3), fx(85), fy(84), P.ink);
  // the vest's strap over the shoulder
  pt(fx(8), fy(121));
  pt(fx(16), fy(119));
  pt(fx(10), fy(160));
  pt(fx(0), fy(160));
  fillPts(c, P.black);
  line(c, fx(16), fy(119), fx(10), fy(160), P.slate);
  // two beads of sweat on the lit brow
  R(c, round(fx(82)), round(fy(30)), 1, 2, P.white);
  R(c, round(fx(84.5)), round(fy(37)), 1, 1, P.white);
});
// The drop's path down the face (local), then it hangs at the chin and falls.
const DROP = [66, 36, 69, 48, 71.5, 62, 73.5, 76, 75.5, 88, 77.5, 97, 79.5, 102];
function drop(c, x, y, stretch) {
  // a bead 3 x 5 px or more: a dark lower edge, a body that takes the light, a catchlight
  ellipse(c, x + 0.4, y + stretch * 0.5 + 0.4, 2, 2.9 + stretch * 0.5, P.slate);
  ellipse(c, x, y + stretch * 0.5, 1.8, 2.6 + stretch * 0.5, P.fog);
  ellipse(c, x - 0.4, y + stretch * 0.5 - 0.5, 1, 1.6 + stretch * 0.3, P.silver);
  R(c, round(x - 1), round(y - 1 + stretch * 0.2), 1, 1, P.white);
}
function shotFace(c, lt) {
  c.drawImage(faceBg(), 0, 0);
  const fo = -round(((1 - cos(lt * 1.6)) / 2) * 1.2);
  c.drawImage(faceArt(), 0, fo);
  const slideEnd = 1.95;
  if (lt < slideEnd) {
    const s = sine(prog(lt, 0.25, slideEnd)) * (DROP.length / 2 - 1);
    const i = min(DROP.length / 2 - 2, floor(s));
    const f = s - i;
    const x = fx(lerp(DROP[i * 2], DROP[i * 2 + 2], f));
    const y = fy(lerp(DROP[i * 2 + 1], DROP[i * 2 + 3], f)) + fo;
    // the wet trail it leaves on the skin
    for (let k = 1; k < 6; k++) {
      const s2 = max(0, s - k * 0.12);
      const j = min(DROP.length / 2 - 2, floor(s2));
      const g = s2 - j;
      R(c, round(fx(lerp(DROP[j * 2], DROP[j * 2 + 2], g))), round(fy(lerp(DROP[j * 2 + 1], DROP[j * 2 + 3], g)) + fo), 1, 1, A(P.silver, 0.5 - k * 0.08));
    }
    if (lt > 0.25) drop(c, x, y, 0);
  } else if (lt < DROP_FALL) {
    // it gathers at the chin and swells
    const g = prog(lt, slideEnd, DROP_FALL);
    drop(c, fx(79.5), fy(102) + fo + g * 2, g * 2.4);
  } else {
    const ft = lt - DROP_FALL;
    drop(c, fx(79.5) + ft * 4, fy(102) + fo + 2.4 + 90 * ft * ft, max(0, 2.4 - ft * 6));
  }
}

// --- sculpt: ellipsoids lit per pixel at bake time -------------------------------------------
// A figure is a list of ellipsoid parts placed in frames (the body, the head) that
// turn in 3D; the view is orthographic. For every pixel the front-most surface wins,
// normals blend where two parts meet (no creases at the joins), the key light is
// traced for shadows (the brow shades the eyes, the jaw the neck), and the result is
// quantised to the grey ramp by material. Nothing here runs per frame: the art is
// baked once per lighting and drawn as a canvas.
const rotY = (t) => Float64Array.of(cos(t), 0, -sin(t), 0, 1, 0, sin(t), 0, cos(t));
const rotX = (t) => Float64Array.of(1, 0, 0, 0, cos(t), sin(t), 0, -sin(t), cos(t));
const rotZ = (t) => Float64Array.of(cos(t), -sin(t), 0, sin(t), cos(t), 0, 0, 0, 1);
const ID3 = Float64Array.of(1, 0, 0, 0, 1, 0, 0, 0, 1);
function mul3(a, b) {
  const o = new Float64Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return o;
}
const V3 = new Float64Array(3);
// A frame: rotation R, origin o (world) and uniform scale k, so a figure is
// designed in its own units (about 34 to a head) and placed at any size.
/** Frame-local point to world (screen x, y; z towards the lens) into V3. */
function toWorld(f, x, y, z) {
  const R = f.R;
  const k = f.k;
  V3[0] = f.o[0] + (R[0] * x + R[1] * y + R[2] * z) * k;
  V3[1] = f.o[1] + (R[3] * x + R[4] * y + R[5] * z) * k;
  V3[2] = f.o[2] + (R[6] * x + R[7] * y + R[8] * z) * k;
  return V3;
}
/** World point to frame-local into V3. */
function toLocal(f, x, y, z) {
  const R = f.R;
  const dx = (x - f.o[0]) / f.k;
  const dy = (y - f.o[1]) / f.k;
  const dz = (z - f.o[2]) / f.k;
  V3[0] = R[0] * dx + R[3] * dy + R[6] * dz;
  V3[1] = R[1] * dx + R[4] * dy + R[7] * dz;
  V3[2] = R[2] * dx + R[5] * dy + R[8] * dz;
  return V3;
}
/** An ellipsoid part: centre and semi-axes in frame f, extra local rotation E, material (id or fn). */
function part(list, f, cx, cy, cz, ax, ay, az, E, mat) {
  const Q = mul3(f.R, E || ID3);
  toWorld(f, cx, cy, cz);
  const m = new Float64Array(9);
  ax *= f.k;
  ay *= f.k;
  az *= f.k;
  const ax3 = [ax, ay, az];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[i * 3 + j] = Q[j * 3 + i] / ax3[i];
  const hx = hypot(Q[0] * ax, Q[1] * ay, Q[2] * az);
  const hy = hypot(Q[3] * ax, Q[4] * ay, Q[5] * az);
  list.push({ m, c0: V3[0], c1: V3[1], c2: V3[2], x0: V3[0] - hx - 1, x1: V3[0] + hx + 1, y0: V3[1] - hy - 1, y1: V3[1] + hy + 1, mat, f });
}
/** An ellipsoid along a bone a -> b (frame-local), side radius r1, front-back radius r2. */
function bone(list, f, a, b, r1, r2, ext, mat, at = 0.5, ox = 0, oy = 0, oz = 0) {
  let dx = b[0] - a[0];
  let dy = b[1] - a[1];
  let dz = b[2] - a[2];
  const len = hypot(dx, dy, dz) || 1;
  dx /= len;
  dy /= len;
  dz /= len;
  // x across the bone (side to side), z front to back
  let xx = dy;
  let xy = -dx;
  const xl = hypot(xx, xy) || 1;
  xx /= xl;
  xy /= xl;
  const zx = xy * dz;
  const zy = -xx * dz;
  const zz = xx * dy - xy * dx;
  const E = Float64Array.of(xx, dx, zx, xy, dy, zy, 0, dz, zz);
  part(list, f, a[0] + (b[0] - a[0]) * at + ox, a[1] + (b[1] - a[1]) * at + oy, a[2] + (b[2] - a[2]) * at + oz, r1, len / 2 + ext, r2, E, mat);
}
// Materials and how each turns light into a grey (GREYS index, 0 white .. 6 black).
const M_SKIN = 0;
const M_CLOTH = 1;
const M_HAIR = 2;
const M_TAPE = 3;
const M_EYE = 4;
const M_RED = 5;
const M_DEEP = 6; // skin in a hollow (eye sockets): half the light
const STEPS = [
  [0.16, 6, 0.32, 5, 0.54, 4, 0.8, 3, 9, 2], // skin
  [0.5, 6, 9, 5], // cloth
  [0.45, 6, 0.85, 5, 9, 4], // hair
  [0.15, 5, 0.35, 4, 0.6, 3, 0.86, 2, 9, 1], // tape
  [0.4, 6, 0.75, 5, 9, 4], // eye
  [0.4, 8, 9, 7], // red: darkRed, red
];
const RIM_MIN = [1, 4, 3, 1, 4, 7]; // brightest the back light may push each material
const BLEND = 5; // px of depth over which two meeting parts blend their normals
const lightStep = (mat, v) => {
  const s = STEPS[mat];
  for (let i = 0; i < s.length; i += 2) if (v < s[i]) return s[i + 1];
  return s[s.length - 1];
};
// Key from the upper left in front, back light from the right behind, the lens on +z.
const KEY = (() => {
  const l = hypot(-0.8, -0.55, 0.28);
  return [-0.8 / l, -0.55 / l, 0.28 / l];
})();
const BACK = (() => {
  const l = hypot(0.86, -0.22, -0.46);
  return [0.86 / l, -0.22 / l, -0.46 / l];
})();
const HALF = (() => {
  const l = hypot(KEY[0], KEY[1], KEY[2] + 1);
  return [KEY[0] / l, KEY[1] / l, (KEY[2] + 1) / l];
})();
/**
 * Render a sculpt into an index buffer (-1 = empty) and a depth buffer over the box
 * x0..x1, y0..y1. `lit` false keeps only the back light (a silhouette with a rim).
 */
function sculpt(prims, x0, y0, x1, y1, lit, idx, zb, mt = null) {
  const n = prims.length;
  for (let y = y0; y < y1; y++) {
    const py = y + 0.5;
    for (let x = x0; x < x1; x++) {
      const px = x + 0.5;
      let z1 = -1e9;
      let z2 = -1e9;
      let i1 = -1;
      let i2 = -1;
      for (let k = 0; k < n; k++) {
        const p = prims[k];
        if (px < p.x0 || px > p.x1 || py < p.y0 || py > p.y1) continue;
        const m = p.m;
        const dx = px - p.c0;
        const dy = py - p.c1;
        const dz = -p.c2;
        const ux = m[0] * dx + m[1] * dy + m[2] * dz;
        const uy = m[3] * dx + m[4] * dy + m[5] * dz;
        const uz = m[6] * dx + m[7] * dy + m[8] * dz;
        const a = m[2] * m[2] + m[5] * m[5] + m[8] * m[8];
        const b = 2 * (ux * m[2] + uy * m[5] + uz * m[8]);
        const c = ux * ux + uy * uy + uz * uz - 1;
        const disc = b * b - 4 * a * c;
        if (disc < 0) continue;
        const z = (-b + sqrt(disc)) / (2 * a);
        if (z > z1) {
          z2 = z1;
          i2 = i1;
          z1 = z;
          i1 = k;
        } else if (z > z2) {
          z2 = z;
          i2 = k;
        }
      }
      const o = y * W + x;
      if (i1 < 0) {
        idx[o] = -1;
        continue;
      }
      zb[o] = z1;
      // normal of the winning part, blended with the part just behind it near a join
      let nx = 0;
      let ny = 0;
      let nz = 0;
      for (let pass = 0; pass < 2; pass++) {
        const k = pass ? i2 : i1;
        if (pass && (k < 0 || z1 - z2 > BLEND)) break;
        const p = prims[k];
        const m = p.m;
        const zz = pass ? z2 : z1;
        const dx = px - p.c0;
        const dy = py - p.c1;
        const dz = zz - p.c2;
        const ux = m[0] * dx + m[1] * dy + m[2] * dz;
        const uy = m[3] * dx + m[4] * dy + m[5] * dz;
        const uz = m[6] * dx + m[7] * dy + m[8] * dz;
        let gx = m[0] * ux + m[3] * uy + m[6] * uz;
        let gy = m[1] * ux + m[4] * uy + m[7] * uz;
        let gz = m[2] * ux + m[5] * uy + m[8] * uz;
        const gl = hypot(gx, gy, gz) || 1;
        const w = pass ? 0.5 - 0.5 * ((z1 - z2) / BLEND) : 1;
        gx /= gl;
        gy /= gl;
        gz /= gl;
        nx += gx * w;
        ny += gy * w;
        nz += gz * w;
      }
      const nl = hypot(nx, ny, nz) || 1;
      nx /= nl;
      ny /= nl;
      nz /= nl;
      // material of the hit, from the part's own frame
      const hit = prims[i1];
      let mat = hit.mat;
      if (typeof mat === 'function') {
        toLocal(hit.f, px, py, z1);
        mat = mat(V3[0], V3[1], V3[2]);
        if (mat === M_CLOTH && hit.f.fold) {
          // drape: the cloth's folds tilt the normal across the body
          const fo = hit.f.fold(V3[0], V3[1], V3[2]);
          const R = hit.f.R;
          nx += R[0] * fo;
          ny += R[3] * fo;
          nz += R[6] * fo;
          const fl = hypot(nx, ny, nz) || 1;
          nx /= fl;
          ny /= fl;
          nz /= fl;
        }
      }
      let v = 0.03;
      let spec = 0;
      if (lit) {
        let d = nx * KEY[0] + ny * KEY[1] + nz * KEY[2];
        if (d > 0) {
          // shadow: is any part between this point and the key light?
          const sx = px + nx * 1.5;
          const sy = py + ny * 1.5;
          const sz = z1 + nz * 1.5;
          for (let k = 0; k < n; k++) {
            const m = prims[k].m;
            const dx = sx - prims[k].c0;
            const dy = sy - prims[k].c1;
            const dz = sz - prims[k].c2;
            const ux = m[0] * dx + m[1] * dy + m[2] * dz;
            const uy = m[3] * dx + m[4] * dy + m[5] * dz;
            const uz = m[6] * dx + m[7] * dy + m[8] * dz;
            const c = ux * ux + uy * uy + uz * uz - 1;
            if (c < 0) continue;
            const mx = m[0] * KEY[0] + m[1] * KEY[1] + m[2] * KEY[2];
            const my = m[3] * KEY[0] + m[4] * KEY[1] + m[5] * KEY[2];
            const mz = m[6] * KEY[0] + m[7] * KEY[1] + m[8] * KEY[2];
            const a = mx * mx + my * my + mz * mz;
            const b = 2 * (ux * mx + uy * my + uz * mz);
            const disc = b * b - 4 * a * c;
            if (disc >= 0 && (-b - sqrt(disc)) / (2 * a) > 0) {
              d *= 0.22;
              break;
            }
          }
          spec = d > 0.55 ? max(0, nx * HALF[0] + ny * HALF[1] + nz * HALF[2]) ** 40 : 0;
        }
        v = 0.07 + 0.93 * max(0, d);
        if (mat === M_DEEP) v *= 0.62;
      }
      const base = mat === M_DEEP ? M_SKIN : mat;
      let g = lightStep(base, v);
      // the back light: a bright edge where the surface turns towards it
      const r = nx * BACK[0] + ny * BACK[1] + nz * BACK[2];
      if (r > 0.3) {
        const lim = RIM_MIN[base];
        const rimG = base === M_RED ? 7 : r > 0.52 ? lim : min(6, lim + 2);
        if (base === M_RED ? true : rimG < g) g = rimG;
      }
      if (spec > 0.72 && (base === M_SKIN || base === M_TAPE)) g = base === M_SKIN ? 1 : 0;
      idx[o] = g;
      if (mt) mt[o] = base;
    }
  }
}

// --- 5. the reveal: three-quarter, split-lit against concrete -----------------------------------
// The hero frame at full resolution: a sculpted athlete turned three-quarters
// towards the key light, looking off past the lens into the light, sweat
// catching it. Baked twice: in the dark (only the back light's rim) and lit; the
// key comes up over the dark one. He breathes: three baked chest positions,
// stepped a pixel at a time.
const RX = 214; // the figure's centre line
const RYAW = 0.62; // body turned three-quarters to screen left
const concrete = () => bake('hg-concrete', W, H, (c) => {
  ditherField(c, 0, 0, W, H, [P.black, P.ink, P.slate], (x, y) => 0.92 - hypot((x - 120) / 250, (y - 70) / 180) * 1.1);
  // formwork seams and tie holes, kept away from his head
  for (const x of [52, 150, 352]) R(c, x, 0, 1, H, A(P.black, 0.6));
  R(c, 0, 150, W, 1, A(P.black, 0.5));
  for (let gx = 22; gx < W; gx += 58) {
    for (let gy = 40; gy < 200; gy += 56) {
      if (abs(gx - RX) < 60 && gy < 140) continue;
      R(c, gx, gy, 2, 2, A(P.black, 0.7));
      R(c, gx + 1, gy + 2, 2, 1, A(P.steel, 0.35));
    }
  }
});
// The tank top: a scoop neck, straps over the trapezius, deep armholes; the red
// square printed on the near side of the chest. Body-local x is his left.
function topMat(x, y, z) {
  const ax = abs(x);
  if (x > 7.5 && x < 13.5 && y > 89 && y < 95 && z > 3) return M_RED;
  let neck = ax < 8.5 ? 94 - (ax / 8.5) ** 2 * 14 : ax < 15 ? 68 : 200;
  if (z < -5) neck = min(neck, 79);
  if (y < neck) return M_SKIN;
  const arm = y < 86 ? 15 : 15 + min(1, (y - 86) / 26) * 9;
  return ax > arm ? M_SKIN : M_CLOTH;
}
// Head-local: close-cropped hair above a hairline that sits high on the forehead,
// drops at the temples and runs to the nape; the eye sockets are hollows.
function headMat(x, y, z) {
  // the hairline: high and slightly receding at the temples in front, down to the
  // sideburns in front of the ears, low at the nape
  const ax = abs(x);
  const front = -8 + ax * 0.08 - max(0, ax - 5.5) * 0.3;
  const hair = z > 4 ? front : z > -5 ? front + ((4 - z) / 9) * (2.5 - front) : 2.5 + min(1, (-5 - z) / 6) * 7;
  if (y < hair) return M_HAIR;
  if (z > 5 && ((abs(x) - 4.4) / 3.7) ** 2 + ((y - 1.2) / 2.8) ** 2 < 1) return M_DEEP;
  return M_SKIN;
}
const RV = { body: null, head: null };
/** Cloth folds (body-local): soft vertical drape below the chest, diagonal pulls from the armpits. */
function topFold(x, y) {
  let f = 0;
  if (y > 100) f += 0.32 * sin(x * 0.62 + sin(y * 0.07) * 1.6) * min(1, (y - 100) / 14);
  if (y > 92 && y < 130 && abs(x) > 9) f += 0.28 * sin((abs(x) * 0.8 - y * 0.42) * 0.9) * (x > 0 ? 1 : -1);
  return f;
}
const REVEAL_K = 1.12; // design units to pixels: a 38 px head
/** The athlete for a breath phase b (0 out .. 1 in): parts in the body and head frames. */
function revealFigure(b) {
  const list = [];
  const K = REVEAL_K;
  const Y0 = 32; // the crown stays put when the figure is scaled
  const body = { R: rotY(RYAW), o: [RX, Y0 - Y0 * K, 0], k: K, fold: topFold };
  const rise = b * 1.1; // shoulders and head rise on the in-breath
  const head = { R: mul3(rotY(RYAW + 0.2), rotX(0.08)), o: [0, 0, 0], k: K };
  toWorld(body, -1, 49 - rise, 3);
  head.o = [V3[0], V3[1], V3[2]];
  RV.body = body;
  RV.head = head;
  // torso: rib cage, the pecs, the collarbone ridge, traps, lats, abdomen, obliques
  part(list, body, 0, 103 - rise * 0.5, 0, 23, 28, 13 + b * 0.8, null, topMat);
  for (let s = -1; s <= 1; s += 2) {
    part(list, body, s * 10.5, 92 - rise, 8.5 + b * 0.6, 11.5, 8, 5.8, rotZ(s * 0.16), topMat);
    part(list, body, s * 11, 77 - rise, -3, 12, 5.5, 7.5, rotZ(s * 0.42), topMat);
    part(list, body, s * 17, 113 - rise * 0.5, -3, 8.5, 21, 9, rotZ(s * 0.12), topMat);
    part(list, body, s * 12.5, 152, -1, 7.5, 32, 8.5, null, topMat);
  }
  part(list, body, 0, 82.5 - rise, 3.5, 15, 5, 7, null, topMat);
  part(list, body, 0, 166, 1, 17.5, 50, 10.5, null, topMat);
  // neck, leaning forward
  part(list, body, 0, 68 - rise, 0.5, 7.4, 11, 7.6, rotX(0.3), M_SKIN);
  // arms, the elbows a little bent so the taped fists hang forward of the hips:
  // deltoid caps, upper arm with biceps and triceps, forearm, wrist wrap and fist
  for (let s = -1; s <= 1; s += 2) {
    const near = s > 0;
    const sh = [s * 24, 83 - rise, -1];
    const el = [s * 28.5, 127, near ? 3 : 1];
    const wr = [s * 25, 160, near ? 22 : 18];
    const tip = [s * 23, 175, near ? 29 : 25];
    part(list, body, s * 24, 89 - rise, 0, 7.4, 10.5, 8, rotZ(s * 0.22), M_SKIN);
    part(list, body, s * 22, 87 - rise, 6, 6, 8, 5, null, M_SKIN);
    bone(list, body, sh, el, 7.4, 7.8, 3, M_SKIN);
    bone(list, body, sh, el, 5.8, 5.4, -10, M_SKIN, 0.55, 0, 0, 3.2);
    bone(list, body, sh, el, 5.8, 5.4, -9, M_SKIN, 0.45, 0, 0, -3.4);
    bone(list, body, el, wr, 6.8, 6.4, -5, M_SKIN, 0.3);
    bone(list, body, el, wr, 5, 4.5, -7, M_SKIN, 0.72);
    part(list, body, wr[0], wr[1], wr[2], 5.2, 4.2, 5, null, M_TAPE);
    bone(list, body, wr, tip, 4.8, 3.9, -2, M_TAPE, 0.55);
  }
  // the head: skull, face mass, brow, cheekbones, jaw, ears, eyes, nose, lips, chin
  part(list, head, 0, -3, -1.5, 11.5, 14, 13, null, headMat);
  part(list, head, 0, 6, 2.5, 9.8, 10.5, 9.5, null, headMat);
  part(list, head, 0, -2.4, 9.6, 8.6, 2.2, 2.5, null, M_SKIN);
  for (let s = -1; s <= 1; s += 2) {
    part(list, head, s * 6.4, 3.6, 7.6, 3.6, 2.6, 3, null, M_SKIN);
    part(list, head, s * 8.3, 9.5, -0.5, 3.4, 5.2, 6, null, M_SKIN);
    part(list, head, s * 11.6, 1, -3, 2, 4.6, 3.2, null, M_SKIN);
    part(list, head, s * 4.4, 1.4, 8.1, 2.4, 2.2, 2.4, null, M_EYE);
  }
  part(list, head, 0, 3, 13, 2.1, 5, 3, rotX(-0.35), M_SKIN);
  part(list, head, 0, 6.4, 14.3, 2.3, 2, 2.2, null, M_SKIN);
  part(list, head, 0, 10.4, 10.6, 4.4, 1.6, 2.2, null, M_SKIN);
  part(list, head, 0, 12.6, 10.1, 3.9, 1.6, 2.2, null, M_SKIN);
  part(list, head, 0, 14.4, 8, 4.3, 3.3, 3.4, null, M_SKIN);
  return list;
}
/** Draw a 1 px feature at a head-local point if nothing is in front of it. */
function feature(c, zb, f, x, y, z, w, col) {
  toWorld(f, x, y, z);
  const px = floor(V3[0]);
  const py = floor(V3[1]);
  if (px < 0 || py < 0 || px >= W || py >= H) return;
  if (zb[py * W + px] - V3[2] > 1.6) return;
  c.fillStyle = col;
  c.fillRect(px, py, w, 1);
}
const BREATHS = 3;
const revealArt = (lit, b) => bake(`hg-reveal-${lit ? 'lit' : 'dark'}-${b}`, W, H, (c) => {
  const prims = revealFigure(b / (BREATHS - 1));
  const idx = new Int8Array(W * H).fill(-1);
  const zb = new Float32Array(W * H);
  const mt = new Int8Array(W * H).fill(-1);
  sculpt(prims, RX - 70, 22, RX + 60, H, lit, idx, zb, mt);
  if (lit) {
    // a buzz cut: the lit hair broken into a fine grain, a ragged hairline
    for (let y = 22; y < 90; y++) {
      for (let x = RX - 70; x < RX + 60; x++) {
        const o = y * W + x;
        if (mt[o] !== M_HAIR) continue;
        const edge = mt[o + 1] === M_SKIN || mt[o - 1] === M_SKIN || mt[o + W] === M_SKIN;
        if (idx[o] <= 4 && BAYER[(y & 3) * 4 + (x & 3)] > (edge ? 4 : 10)) idx[o] = min(6, idx[o] + 1);
        else if (edge && idx[o] >= 5 && hash(x * 7 + y * 13) > 0.6) idx[o] = 5;
      }
    }
  }
  paintIndex(c, idx, REVEAL_RAMP);
  if (!lit) return;
  const f = RV.head;
  // brows: short strokes along the ridge with a gap over the nose (the far one foreshortened)
  for (let k = 0; k <= 5; k++) feature(c, zb, f, 2.2 + k, -3.3 + k * 0.1, 11.4 - k * 0.32, 1, k < 3 ? P.black : P.ink);
  for (let k = 0; k <= 3; k++) feature(c, zb, f, -2.2 - k, -3.3 + k * 0.1, 11.4 - k * 0.32, 1, P.ink);
  // the eyes look off past the lens into the light: upper lid, iris, a catchlight
  for (let s = -1; s <= 1; s += 2) {
    for (let k = -2; k <= 2; k++) feature(c, zb, f, s * 4.4 + k * 0.9, 0.2, 10.4, 1, P.black);
    feature(c, zb, f, s * 4.4 - 1, 1.3, 10.6, 1, P.black);
    if (s > 0) feature(c, zb, f, s * 4.4 - 1.9, 1.2, 10.6, 1, P.slate);
  }
  // nostril, the line of the lips, the corner of the mouth
  feature(c, zb, f, 1.4, 7.6, 13.4, 1, P.black);
  feature(c, zb, f, -1.2, 7.6, 13.4, 1, P.ink);
  for (let k = -3; k <= 3; k++) feature(c, zb, f, k, 11.5, 11.4 - abs(k) * 0.35, 1, k > 1 ? P.black : P.ink);
  // the ear's bowl
  feature(c, zb, f, 12.6, 0, -2.4, 1, P.ink);
  feature(c, zb, f, 12.6, 2, -2.4, 1, P.ink);
  // the tape wraps: a few turns across each fist (darker lines where visible)
  const bd = RV.body;
  for (let s = -1; s <= 1; s += 2) {
    const z0 = s > 0 ? 22 : 18;
    for (let k = 0; k < 4; k++) {
      const u = k / 4;
      for (let j = -4; j <= 4; j++) {
        toWorld(bd, s * (25 - u * 2) + j * 0.9, 160 + u * 14 + j * 0.3, z0 + u * 7 + 4.2);
        const px = floor(V3[0]);
        const py = floor(V3[1]);
        const o = py * W + px;
        if (idx[o] >= 0 && idx[o] <= 3 && abs(zb[o] - V3[2]) < 3) {
          c.fillStyle = idx[o] <= 1 ? P.fog : P.slate;
          c.fillRect(px, py, 1, 1);
        }
      }
    }
  }
});
const REVEAL_RAMP = [...GREYS, P.red, P.darkRed];
function shotReveal(c, lt) {
  c.drawImage(concrete(), 0, 0);
  // the breath: out, in, out over 3.4 s, stepped through the baked phases
  const br = (1 - cos(((lt + 0.4) / 3.4) * TAU)) / 2;
  const ph = min(BREATHS - 1, floor(br * BREATHS));
  const key = smooth(prog(lt, 0.5, 1.8));
  if (key < 1) c.drawImage(revealArt(false, 0), 0, 0);
  if (key > 0) {
    c.globalAlpha = key;
    c.drawImage(revealArt(true, key < 1 ? 0 : ph), 0, 0);
    c.globalAlpha = 1;
  }
}

// --- 6. end slate ---------------------------------------------------------------------------
// Legal: ten words, in fog, on screen from the wordmark to the end (3.6 s).
const LEGAL1 = 'RESOLUTION CAPPED AT 384 X 216.';
const LEGAL2 = 'MEMBERSHIP RENEWS EVERY FRAME.';
const SLATE_RES = [0, 12, 0.25, 8, 0.4, 6, 0.52, 4, 0.64, 3, 0.76, 2, 0.88, 1];
function slateCell(lt) {
  let b = 12;
  for (let i = 0; i < SLATE_RES.length; i += 2) if (lt >= SLATE_RES[i]) b = SLATE_RES[i + 1];
  return b;
}
function shotSlate(ctx, lt) {
  R(ctx, 0, 0, W, H, P.black);
  // the mark arrives in fat cells and resolves (the brand's device), then holds
  const mark = gymMark(2);
  const a = ramp(lt, 0.1, 0.45);
  if (a > 0) {
    const F = buf('hg-slate');
    F.c.fillStyle = P.black;
    F.c.fillRect(0, 0, W, H);
    F.c.drawImage(mark, round(192 - mark.width / 2), 72);
    present(ctx, F.cv, slateCell(lt), a);
  }
  const ra = ramp(lt, 1.0, 1.5);
  if (ra > 0) {
    const w = round(56 * ra);
    R(ctx, 192 - w, 104, w * 2, 1, P.slate);
  }
  art(ctx, label('hg-tag', 'TRAIN YOUR RESOLUTION.', 2, P.silver, 'body'), 192, 112, ramp(lt, 1.2, 1.8));
  const la = ramp(lt, 0.9, 1.4);
  art(ctx, label('hg-legal1', LEGAL1, 1, P.fog), 192, 184, la);
  art(ctx, label('hg-legal2', LEGAL2, 1, P.fog), 192, 192, la);
}

// --- shot list, transitions and the camera's "resolution" -------------------------------------
// Footage shots render into one pooled frame, which is presented through the
// current cell size; the letterbox and the readout are drawn crisp on top.
const SHOTS = [
  { at: T_LOCKER, draw: shotLocker, footage: true },
  { at: T_RUN, draw: shotRun, footage: true, tr: 'dip', d: 0.8 },
  { at: T_LIFT, draw: shotLift, footage: true, tr: 'dissolve', d: 0.6 },
  { at: T_FACE, draw: shotFace, footage: true, tr: 'dissolve', d: 0.6 },
  { at: T_REVEAL, draw: shotReveal, footage: true },
  { at: T_SLATE, draw: shotSlate, tr: 'dip', d: 1.0 },
];
function footage(c, dt) {
  let i = 0;
  while (i + 1 < SHOTS.length && dt >= SHOTS[i + 1].at) i++;
  const s = SHOTS[i];
  const lt = dt - s.at;
  if (!i || !s.tr || lt >= s.d || s.tr === 'dip') {
    if (s.tr === 'dip' && i && lt < s.d / 2) SHOTS[i - 1].draw(c, dt - SHOTS[i - 1].at);
    else s.draw(c, lt);
    return;
  }
  const prev = SHOTS[i - 1];
  prev.draw(c, dt - prev.at);
  const b = buf('hg-tb');
  s.draw(b.c, lt);
  c.globalAlpha = sine(lt / s.d);
  c.drawImage(b.cv, 0, 0);
  c.globalAlpha = 1;
}
/** The readout in the bottom bar: each new value pushes up into place over 0.3 s. */
function readout(ctx, dt, r) {
  const la = ramp(dt, 0.8, 1.4);
  if (la <= 0.01) return;
  // rows 201-207: centred in the bar and inside the 8 px action-safe margin
  const y = H - BAR;
  const p = r.at > 0 ? sine((dt - r.at) / 0.3) : 1;
  const cur = label(RES_KEY[r.b], RES_LABEL[r.b], 1, r.b === 1 ? P.red : P.fog, 'body');
  if (p < 1) {
    const old = label(RES_KEY[r.prev], RES_LABEL[r.prev], 1, P.fog, 'body');
    art(ctx, old, 24, y - round(2 * p), la * (1 - p), 'left');
  }
  art(ctx, cur, 24, y + round(2 * (1 - p)), la * p, 'left');
}
function run(ctx, dt) {
  let i = 0;
  while (i + 1 < SHOTS.length && dt >= SHOTS[i + 1].at) i++;
  const s = SHOTS[i];
  const lt = dt - s.at;
  const inSlate = !s.footage && !(s.tr === 'dip' && lt < s.d / 2);
  if (inSlate) s.draw(ctx, lt);
  else {
    const F = buf('hg-frame');
    footage(F.c, dt);
    const r = resAt(dt);
    if (LAB.fullRes) present(ctx, F.cv, 1, 1);
    else {
      if (r.mix < 1) present(ctx, F.cv, r.prev, 1);
      present(ctx, F.cv, r.b, r.mix < 1 ? r.mix : 1);
    }
    R(ctx, 0, 0, W, BAR, P.black);
    R(ctx, 0, H - BAR, W, BAR, P.black);
    readout(ctx, dt, r);
  }
  // dips through black
  if (i && s.tr === 'dip' && lt < s.d) {
    ctx.globalAlpha = 1 - abs(lt / s.d - 0.5) * 2;
    R(ctx, 0, 0, W, H, P.black);
    ctx.globalAlpha = 1;
  }
  if (dt < 0.6) {
    ctx.globalAlpha = 1 - sine(dt / 0.6);
    R(ctx, 0, 0, W, H, P.black);
    ctx.globalAlpha = 1;
  }
}
// Pre-bake during the opening shot, one job per frame, so no cut ever waits for
// a bake: every shot at two instants, the reveal's two lightings, every
// resolution canvas, the readout labels and the slate's lettering.
let warmed = 0;
function warm(dt) {
  if (warmed > 15 + BREATHS) return;
  const k = warmed++;
  const w = buf('hg-warm').c;
  if (k < 10) {
    const s = SHOTS[1 + (k >> 1)];
    if (dt < s.at) s.draw(w, k & 1 ? 3 : 1);
  } else if (k === 10) revealArt(false, 0);
  else if (k === 11) revealArt(true, 0);
  else if (k === 12) for (const b of [12, 8, 6, 4, 3, 2]) mos(b);
  else if (k === 13) {
    for (const b of [8, 6, 4, 3, 1]) {
      label(RES_KEY[b], RES_LABEL[b], 1, b === 1 ? P.red : P.fog, 'body');
    }
  } else if (k === 14) {
    buf('hg-tb');
    buf('hg-slate');
  } else if (k === 15) gymMark(2);
  else if (k === 16) faceArt();
  else revealArt(true, k - 16);
}

export default {
  id: 'hi-res-gym',
  brand: 'HI-RES GYM',
  duration: DURATION,
  voice: { gender: 'male', lang: 'en-US', pitch: 0.72, rate: 0.85 },
  // Fifteen words, the genre's long silences between them.
  script: [
    { at: 0.8, text: 'Low resolution.' },
    { at: 4.6, text: 'Blurry.' },
    { at: 8.4, text: 'So you trained.' },
    { at: 10.4, text: 'Every rep, another pixel.' },
    { at: 20.0, text: 'Hi-Res Gym. Train your resolution.' },
  ],
  // 75 bpm, so one beat is 0.8 s and every cue of the picture falls on an
  // exact sixteenth (the cuts at 3.6/7.8/11.8/15.6/19.4 s are beats 4.5, 9.75,
  // 14.75, 19.5, 24.25): 30 beats = the spot, then a 2.5-beat rest so the
  // looping bed never restarts over the slate; every track is 32.5 beats.
  // A low A-minor pad changing chord on each cut, a felt-timpani heartbeat, toms
  // on the lockouts (9.05, 11.05 s), a quiet tick on each resolution step; then
  // the held breath: silence over the face until the drop falls (14.25 s), a low
  // thump, and the melody climbs through the reveal to land A5 on the slate.
  tune: {
    bpm: 75,
    room: 0.5,
    echo: { amount: 0.5, beats: 0.9375, feedback: 0.3 },
    tracks: [
      {
        kind: 'harmony', inst: { wave: 'sine', a: 1.6, d: 2, s: 0.8, r: 1.6 }, gain: 0.9,
        notes: 'A2+E3+A3:9.75 F2+C3+A3:5 C3+G3+C4:4.75 G2+D3+B3:4.75 A2+E3+C4:5.75 R:2.5',
      },
      {
        kind: 'bass', inst: { wave: 'sine', a: 0.3, d: 1.5, s: 0.85, r: 1 }, gain: 0.85,
        notes: 'R:9.75 F1:5 C2:4.75 G1:4.75 A1:5.75 R:2.5',
      },
      {
        kind: 'lead', inst: { wave: 'sine', a: 0.005, d: 1.1, s: 0, r: 0.7, legato: 1 }, gain: 0.5,
        notes: 'R:2 E5:1.25 C5:1.25 A4:2.5 R:2.75 E5:1.25 D5:1.25 B4:2.5 R:4.75 G4:1.25 B4:1.25 C5:1 E5:1.25 A5:3.75 R:4.5',
      },
      {
        drums: [
          'R:1',
          'F:0.375@0.5 F:0.875@0.3 '.repeat(7),
          'F:1.5625@0.5 T:1.25@0.6 F:1.25@0.5 T:0.9375@0.6',
          'R:3.0625 F:0.75@0.8 R:0.9375',
          'F:0.375@0.35 F:0.875@0.22 '.repeat(3),
          'R:1 F:1.25@0.8 R:7',
        ].join(' '),
      },
      { drums: 'R:5 X:6.3125@0.35 X:2.5@0.35 X:4@0.4 X:14.6875@0.4' },
    ],
  },
  draw(ctx, t, dt) {
    warm(dt);
    run(ctx, dt);
  },
};
