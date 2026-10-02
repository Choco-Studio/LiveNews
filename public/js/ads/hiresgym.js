// HI-RES GYM — a parody of moody sports-brand commercials. Black and white,
// one red accent, slow motion, a whispered motivational voice-over. The joke
// is literal: the footage itself starts at 48 x 27 and sharpens with every
// rep, while the letterbox and a small resolution readout stay crisp on top.
// "Train your resolution."
//
// Six shots, 24 s, at 60 bpm (one beat = one second, so cues land on seconds):
//  1  0.0 LOCKER   a man on a bench under one pendant light, head bowed.   48 x 27
//                                                  VO "They said you were low resolution."
//  2  4.4 RUN      dawn embankment, backlit, slow-motion stride, tracking.  64 x 36 -> 96 x 54
//                                                  VO "Blurry." "Two hundred and forty lines. At best."
//  3  9.2 LIFT     one top light, a deadlift; each lockout adds pixels.     128 x 72 -> 192 x 108
//                                                  VO "So you trained." "Every rep... another pixel."
//  4 13.6 FACE     profile close-up; a drop of sweat runs, hangs, falls,
//                  and the picture comes into full focus.                384 x 216
//                                                  VO "Until they could see every detail."
//  5 16.6 REVEAL   front, rim-lit both sides, slow push-in, the red mark.
//  6 19.4 SLATE    the mark resolves from fat cells; tagline; small print.
//                                                  VO "Hi-Res Gym. Train your resolution."
//
// Every frame is a pure function of the ad clock. The athletes are procedural
// puppets (adult proportions, forward kinematics plus IK for planted feet),
// painted as silhouettes and lit with stacked offset layers (rim, fill, core).
// The low-resolution look is a real downsample of the finished frame through
// pooled canvases; scenery is baked once; nothing is allocated per frame.
import { P, W, H, A, R, drawText, measureText, litShape, prog, lerp } from './kit.js';

const { sin, cos, PI, round, floor, ceil, min, max, abs, sqrt, hypot } = Math;
const TAU = PI * 2;

// --- timing ------------------------------------------------------------------------
const T_LOCKER = 0;
const T_RUN = 4.4;
const T_LIFT = 9.2;
const T_FACE = 13.6;
const T_REVEAL = 16.6;
const T_SLATE = 19.4;
const DURATION = 24.0;
const BAR = 18; // letterbox bars on the footage shots

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

// --- raster helpers (crisp spans, no allocation; same as grandbuffer.js) ---------------
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
      if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) {
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
  PT[NP * 2] = x;
  PT[NP * 2 + 1] = y;
  NP++;
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

// --- resolution: the picture is downsampled for real ---------------------------------
// Each cell size b gets its own small canvas with smoothing on (a true average),
// blown back up with nearest neighbour. Steps cross-fade over a short "focus pull".
const MOS = {};
function present(ctx, src, b, alpha) {
  if (alpha <= 0.01) return;
  ctx.globalAlpha = min(1, alpha);
  if (b <= 1) ctx.drawImage(src, 0, 0);
  else {
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
    m.c.clearRect(0, 0, W / b, H / b);
    m.c.drawImage(src, 0, 0, W, H, 0, 0, W / b, H / b);
    const smoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(m.cv, 0, 0, W / b, H / b, 0, 0, W, H);
    ctx.imageSmoothingEnabled = smoothing;
  }
  ctx.globalAlpha = 1;
}
// [time, cell size, cross-fade seconds]: every step lands on a cut, a lockout or the drop.
const RES = [0, 8, 0, T_RUN, 6, 0, 7.1, 4, 0.35, 10.55, 3, 0.3, 12.55, 2, 0.3, 15.2, 1, 0.55];
const RES_LABEL = { 8: 'RES 48 X 27', 6: 'RES 64 X 36', 4: 'RES 96 X 54', 3: 'RES 128 X 72', 2: 'RES 192 X 108', 1: 'RES 384 X 216' };
const RES_KEY = { 8: 'hg-res-8', 6: 'hg-res-6', 4: 'hg-res-4', 3: 'hg-res-3', 2: 'hg-res-2', 1: 'hg-res-1' };
const RS = { b: 8, prev: 8, mix: 1 };
function resAt(dt) {
  let i = 0;
  while (i + 3 < RES.length && dt >= RES[i + 3]) i += 3;
  RS.b = RES[i + 1];
  RS.prev = i ? RES[i - 2] : RES[1];
  RS.mix = RES[i + 2] > 0 ? smooth((dt - RES[i]) / RES[i + 2]) : 1;
  return RS;
}

// --- lettering --------------------------------------------------------------------------
// The brand face: heavy condensed capitals (3 px stems), sheared into italics.
const GYM = {
  H: '###...###|###...###|###...###|###...###|###...###|#########|#########|###...###|###...###|###...###|###...###|###...###|###...###',
  I: '###|###|###|###|###|###|###|###|###|###|###|###|###',
  R: '########.|#########|###...###|###...###|###...###|#########|########.|###.###..|###..###.|###..###.|###...###|###...###|###...###',
  E: '########|########|###.....|###.....|###.....|#######.|#######.|###.....|###.....|###.....|###.....|########|########',
  S: '.########|#########|###......|###......|###......|########.|.########|......###|......###|......###|......###|#########|########.',
  '-': '......|......|......|......|......|######|######|######|......|......|......|......|......',
  G: '.########|#########|###......|###......|###......|###..####|###..####|###...###|###...###|###...###|###...###|#########|.########',
  Y: '###...###|###...###|###...###|###...###|####.####|.#######.|..#####..|...###...|...###...|...###...|...###...|...###...|...###...',
  M: '####...####|#####.#####|###########|###.###.###|###..#..###|###.....###|###.....###|###.....###|###.....###|###.....###|###.....###|###.....###|###.....###',
};
const LETTERING = new Map();
/** The wordmark baked once at `scale`, white, sheared 1 px per 4 rows, with the red slash device. */
function gymMark(scale) {
  const key = `hg-mark-${scale}`;
  const hit = LETTERING.get(key);
  if (hit) return hit;
  const word = 'HI-RES GYM';
  let w = 14;
  for (const ch of word) w += (ch === ' ' ? 5 : GYM[ch].indexOf('|')) + 2;
  const cv = bake(key, (w + 4) * scale, 14 * scale, (c) => {
    const px = (x, y, col) => {
      c.fillStyle = col;
      c.fillRect(x * scale, y * scale, scale, scale);
    };
    // the slash: a red parallelogram, the brand's only colour
    for (let y = 0; y < 13; y++) for (let x = 0; x < 6; x++) px(x + floor((12 - y) / 4) + 1, y, y > 10 ? P.darkRed : P.red);
    let x0 = 14;
    for (const ch of word) {
      if (ch === ' ') {
        x0 += 7;
        continue;
      }
      const g = GYM[ch].split('|');
      for (let y = 0; y < 13; y++) {
        for (let i = 0; i < g[y].length; i++) if (g[y][i] === '#') px(x0 + i + floor((12 - y) / 4), y, y > 10 ? P.silver : P.white);
      }
      x0 += g[0].length + 2;
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

// --- the athlete in profile ---------------------------------------------------------------
// Joints are solved into module state (J), then painted as one silhouette by
// paintSide(c, colour, ox, oy) so litShape can stack rim / fill / core layers.
const J = {
  f: 1, u: 16, lean: 0, head: 0, hx: 0, hy: 0, sx: 0, sy: 0, nx: 0, ny: 0, cx: 0, cy: 0,
  knee: new Float64Array(4), ankle: new Float64Array(4), toe: new Float64Array(4), heel: new Float64Array(4),
  elbow: new Float64Array(4), wrist: new Float64Array(4), hand: new Float64Array(4),
};
// near = index 0, far = index 2 in each joint array
const IK = new Float64Array(2);
function ik(jx, jy, tx, ty, l1, l2, px, py) {
  let dx = tx - jx;
  let dy = ty - jy;
  let d = hypot(dx, dy) || 1e-6;
  const dm = l1 + l2 - 0.05;
  if (d > dm) {
    dx *= dm / d;
    dy *= dm / d;
    d = dm;
  }
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = sqrt(max(0, l1 * l1 - a * a));
  const mx = jx + (dx * a) / d;
  const my = jy + (dy * a) / d;
  const side = (px - mx) * -dy + (py - my) * dx >= 0 ? 1 : -1;
  IK[0] = mx + side * (-dy / d) * h;
  IK[1] = my + side * (dx / d) * h;
}
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
  legEnds(i, kx, ky, kx + f * sin(sa) * 1.5 * u, ky + cos(sa) * 1.5 * u, sa + pf);
}
/** Leg by IK to a planted ankle. */
function solveLegIK(i, ax, ay) {
  const { f, u } = J;
  ik(J.hx, J.hy, ax, ay, 1.6 * u, 1.5 * u, ax + f * 3 * u, (J.hy + ay) / 2);
  legEnds(i, IK[0], IK[1], ax, ay, 0);
}
function legEnds(i, kx, ky, ax, ay, footAng) {
  const { f, u } = J;
  J.knee[i] = kx;
  J.knee[i + 1] = ky;
  J.ankle[i] = ax;
  J.ankle[i + 1] = ay;
  const fx = f * cos(footAng);
  const fy = -sin(footAng);
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
  // calf
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
  // neck and head (with a nose and chin so the profile reads)
  capsule(c, J.nx + ox, J.ny + oy, J.cx + ox - f * 0.1 * u, J.cy + oy + 0.2 * u, 0.22 * u, 0.2 * u, col);
  const ha = lean + J.head;
  const hx = f * cos(ha);
  const hy = sin(ha);
  ellipse(c, J.cx + ox, J.cy + oy, 0.43 * u, 0.5 * u, col);
  capsule(c, J.cx + ox + hx * 0.2 * u, J.cy + oy + hy * 0.2 * u + 0.18 * u, J.cx + ox + hx * 0.36 * u, J.cy + oy + hy * 0.36 * u + 0.34 * u, 0.16 * u, 0.12 * u, col);
  ellipse(c, J.cx + ox + hx * 0.45 * u, J.cy + oy + hy * 0.45 * u + 0.04 * u, 0.08 * u, 0.1 * u, col);
}
/** The whole athlete in one colour, offset (ox, oy): litShape paints it once per layer. */
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
// Close enough that at 48 x 27 the shape still reads: a man under a lamp.
const locker = () => bake('hg-locker', W, H, (c) => {
  R(c, 0, 0, W, H, P.black);
  for (let k = 0; k < 11; k++) {
    const x = 16 + k * 32;
    R(c, x, 24, 31, 150, P.steel);
    R(c, x, 24, 31, 1, P.fog);
    R(c, x, 24, 1, 150, P.fog);
    R(c, x + 30, 24, 1, 150, P.slate);
    for (let v = 0; v < 5; v++) R(c, x + 8, 34 + v * 4, 15, 1, P.slate);
    R(c, x + 23, 100, 3, 12, P.fog);
  }
  R(c, 0, 174, W, 2, P.ink);
  shadeBake(c, 0, 0, W, H, 0.6, (x, y) => hypot((x - 192) / 130, (y - 70) / 120) - 0.25);
  shadeBake(c, 0, 0, W, H, 0.55, (x, y) => hypot((x - 192) / 170, (y - 70) / 150) - 0.4);
  shadeBake(c, 0, 0, W, H, 0.5, (x, y) => hypot((x - 192) / 220, (y - 70) / 190) - 0.55);
  glowBake(c, 192, 192, 150, 22, P.slate, 0.9);
  R(c, 70, 160, 244, 2, P.steel);
  R(c, 70, 162, 244, 5, P.slate);
  R(c, 70, 167, 244, 1, P.black);
  for (const x of [86, 294]) R(c, x, 168, 5, 30, P.ink);
  R(c, 191, 0, 1, 10, P.ink);
  pt(182, 20);
  pt(202, 20);
  pt(197, 10);
  pt(187, 10);
  fillPts(c, P.black);
  R(c, 187, 10, 10, 1, P.slate);
  ellipse(c, 192, 20.5, 9, 1.8, P.white);
  c.globalAlpha = 0.05;
  for (let k = 0; k < 3; k++) {
    pt(184 + k * 2, 21);
    pt(200 - k * 2, 21);
    pt(300 - k * 26, 198);
    pt(84 + k * 26, 198);
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
function seated(c, x, seatY, u, bow) {
  const sy = seatY - (2.3 - 0.32 * bow) * u;
  const sw = 0.95 * u;
  // legs: thighs come at the camera (short), shins drop to the floor
  for (let sd = -1; sd <= 1; sd += 2) {
    const kx = x + sd * 0.56 * u;
    const ky = seatY + 0.5 * u;
    rimCap(c, kx, ky, x + sd * 0.6 * u, seatY + 1.95 * u, 0.24 * u, 0.15 * u, P.black, P.slate);
    rimCap(c, x + sd * 0.38 * u, seatY - 0.15 * u, kx, ky, 0.42 * u, 0.34 * u, P.black, P.steel);
  }
  // torso, hunched: a lit edge across the shoulders, then the dark body
  seatedTorso(x, sy, seatY, sw, u, 0);
  fillPts(c, P.steel);
  seatedTorso(x, sy, seatY, sw, u, 1.5);
  fillPts(c, P.black);
  // head: bowed it drops in front of the shoulders and shows the crown
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
  // towel round the neck, bright under the lamp
  rimCap(c, x - 0.34 * u, sy - 0.02 * u, x - 0.28 * u, sy + 1.15 * u, 0.17 * u, 0.15 * u, P.ink, P.fog);
  rimCap(c, x + 0.34 * u, sy - 0.02 * u, x + 0.28 * u, sy + 1.15 * u, 0.17 * u, 0.15 * u, P.ink, P.fog);
  capsule(c, x - 0.34 * u, sy - 0.05 * u, x + 0.34 * u, sy - 0.05 * u, 0.15 * u, 0.15 * u, P.slate);
  // arms: elbows on the knees, hands clasped between them
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
  c.drawImage(locker(), 0, 0);
  const bow = 1 - ramp(lt, 2.5, 4.1);
  const br = (1 - cos(lt * 1.7)) / 2;
  seated(c, 192, 160 - br * 0.8, 24, bow);
}

// --- 2. the run: dawn, backlit, slow motion ---------------------------------------------
const SUN_X = 92;
const SUN_Y = 128;
const sky = () => bake('hg-sky', W, H, (c) => {
  ditherField(c, 0, 0, W, 152, [P.slate, P.steel, P.fog, P.silver], (x, y) => y / 150);
  glowBake(c, SUN_X, SUN_Y, 130, 90, P.white, 0.55);
  ellipse(c, SUN_X, SUN_Y, 15, 15, P.white);
  // the river
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
  // a bridge low across the river
  R(c, 0, 50, CITY_W, 3, P.steel);
  for (let x = 20; x < CITY_W; x += 90) {
    R(c, x, 36, 3, 24, P.steel);
    line(c, x + 1, 36, x - 40, 50, P.steel);
    line(c, x + 1, 36, x + 42, 50, P.steel);
  }
});
const RAIL_W = 64;
const rail = () => bake('hg-rail', RAIL_W, 66, (c) => {
  // railing (y 0..14), embankment wall (14..40), path (40..66)
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
  // the runner
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

// --- 3. the lift: one light, a deadlift, every lockout adds pixels ------------------------
const gym = () => bake('hg-gym', W, H, (c) => {
  R(c, 0, 0, W, H, P.black);
  glowBake(c, 192, 80, 150, 100, P.ink, 0.95);
  // a squat rack at the edge of the light
  for (const x of [300, 340]) {
    R(c, x, 40, 4, 136, P.ink);
    for (let y = 60; y < 170; y += 8) R(c, x + 1, y, 2, 1, P.black);
  }
  R(c, 296, 92, 52, 3, P.ink);
  // platform and floor pool
  R(c, 0, 176, W, 40, P.black);
  R(c, 70, 176, 244, 4, P.ink);
  R(c, 70, 176, 244, 1, P.slate);
  glowBake(c, 186, 180, 120, 14, P.steel, 0.7);
  // the light above and its cone
  ellipse(c, 186, 16, 14, 2, P.white);
  c.globalAlpha = 0.045;
  for (let k = 0; k < 4; k++) {
    pt(174 + k * 3, 17);
    pt(198 - k * 3, 17);
    pt(300 - k * 24, 180);
    pt(72 + k * 24, 180);
    fillPts(c, P.silver);
  }
  c.globalAlpha = 1;
});
const LIFT_Q = [0, 0, 0.35, 0, 1.25, 1, 1.75, 1, 2.35, 0, 2.45, 0, 3.25, 1, 3.75, 1, 4.45, 0];
const LIFT_LAYERS = [[P.silver, 0, 0], [P.slate, 0, 1], [P.black, 0, 3]];
function plate(c, x, y, r) {
  ellipse(c, x, y, r, r, P.black);
  ellipse(c, x, y - 1, r - 1, r - 1, P.slate);
  ellipse(c, x, y, r - 1, r - 1, P.black);
  // the red collar: the spot's accent colour
  ellipse(c, x, y, r - 4, r - 4, P.darkRed);
  ellipse(c, x, y, r - 5, r - 5, P.black);
  ellipse(c, x, y, 3, 3, P.steel);
  ellipse(c, x, y, 2, 2, P.silver);
  R(c, round(x - r * 0.5), round(y - r + 2), round(r * 0.6), 1, P.steel);
}
function shotLift(c, lt) {
  c.drawImage(gym(), 0, 0);
  const q = keys(lt, LIFT_Q);
  const x = 160;
  const fy = 177;
  const u = 19;
  J.f = 1;
  J.u = u;
  J.lean = lerp(1.0, -0.06, smooth(q) ** 0.85);
  J.head = lerp(-0.35, 0.05, q);
  const barX = x + 0.32 * u;
  const barY = lerp(fy - 20, fy - 2.84 * u, q);
  const T = 2.15 * u;
  const grip = 2.36 * u;
  // shoulders stay over the bar: the hips are wherever that puts them
  const sx = barX;
  const sy = barY - grip;
  solveTrunk(sx - sin(J.lean) * T * 0.88, sy + cos(J.lean) * T * 0.88);
  solveLegIK(0, x - 0.05 * u, fy - 0.2 * u);
  solveLegIK(2, x - 0.15 * u, fy - 0.2 * u);
  for (let i = 0; i <= 2; i += 2) {
    J.elbow[i] = sx + 0.06 * u;
    J.elbow[i + 1] = sy + 1.2 * u;
    J.wrist[i] = barX;
    J.wrist[i + 1] = barY - 0.3 * u;
    J.hand[i] = barX;
    J.hand[i + 1] = barY;
  }
  // chalk lifts off the hands at each lockout
  const lock = max(0, max(1 - abs(lt - 1.5) / 0.9, 1 - abs(lt - 3.5) / 0.9));
  litShape(c, paintSide, LIFT_LAYERS);
  nearLimbs(c, P.steel, P.black, 0, -1);
  if (lock > 0) {
    c.globalAlpha = 0.4 * lock;
    for (let k = 0; k < 7; k++) {
      const a = hash(k + 40) * TAU;
      const d = (1 - lock) * 10 + 2;
      R(c, round(barX + cos(a) * d * 1.5), round(barY - 4 + sin(a) * d - (1 - lock) * 6), 1, 1, P.white);
    }
    c.globalAlpha = 1;
  }
  // the bar end and the near plate, in front of everything
  plate(c, barX, barY, 20);
  R(c, round(barX - 1), round(barY - 1), 3, 3, P.white);
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
let FO = 0; // breathing offset
function facePts(arr, ox, oy) {
  for (let i = 0; i < arr.length; i += 2) pt(FX + arr[i] * FK + ox, FY + FO + arr[i + 1] * FK + oy);
}
function paintFace(c, col, ox, oy) {
  facePts(FACE_S, ox, oy);
  fillPts(c, col);
}
const FACE_LAYERS = [[P.white, 0, 0], [P.fog, -1, 0], [P.steel, -3, 0], [P.slate, -6, 0], [P.ink, -12, 0], [P.black, -24, 1]];
// A separation light on the wall behind the head; dark in front of the face,
// where the key light comes from out of frame.
const faceBg = () => bake('hg-face-bg', W, H, (c) => {
  ditherField(c, 0, 0, W, H, [P.black, P.ink, P.slate], (x, y) => 0.95 - hypot((x - 40) / 260, (y - 90) / 200) * 1.1);
  glowBake(c, 340, 100, 90, 110, P.ink, 0.6);
});
// The drop's path down the face (local units), then it falls free.
const DROP = [64, 34, 67, 46, 70, 60, 72, 74, 74, 86, 76, 96, 79, 102];
function shotFace(c, lt) {
  c.drawImage(faceBg(), 0, 0);
  FO = -((1 - cos(lt * 1.6)) / 2) * 1.2;
  litShape(c, paintFace, FACE_LAYERS);
  // close-cropped hair over the crown and the back of the head
  facePts(HAIR_S, 0, 0);
  fillPts(c, P.black);
  for (let k = 0; k < 14; k++) R(c, round(FX + (12 + hash(k) * 24) * FK), round(FY + FO + (12 + hash(k + 30) * 34) * FK), 1, 1, P.ink);
  // ear: a dark shape with a lit front rim
  ellipse(c, FX + 42.6 * FK, FY + FO + 56 * FK, 4.6 * FK, 8.6 * FK, P.slate);
  ellipse(c, FX + 42 * FK, FY + FO + 56 * FK, 4.4 * FK, 8.4 * FK, P.ink);
  line(c, FX + 41 * FK, FY + FO + 51 * FK, FX + 40 * FK, FY + FO + 60 * FK, P.black);
  // brow ridge, eye socket, eye (the lid closes once, slowly)
  const blink = max(0, 1 - abs(lt - 0.95) / 0.12);
  pt(FX + 70 * FK, FY + FO + 44.5 * FK);
  pt(FX + 80 * FK, FY + FO + 45.5 * FK);
  pt(FX + 79 * FK, FY + FO + 53.5 * FK);
  pt(FX + 70 * FK, FY + FO + 54 * FK);
  fillPts(c, P.ink);
  pt(FX + 71 * FK, FY + FO + 48.5 * FK);
  pt(FX + 79.5 * FK, FY + FO + (49.6 + blink * 1.4) * FK);
  pt(FX + 78.5 * FK, FY + FO + 52 * FK);
  pt(FX + 72 * FK, FY + FO + 52.4 * FK);
  fillPts(c, blink > 0.6 ? P.slate : P.black);
  if (blink < 0.6) R(c, round(FX + 77.5 * FK), round(FY + FO + 50 * FK), 1, 1, P.white);
  R(c, round(FX + 71 * FK), round(FY + FO + 48 * FK), round(8.5 * FK), 1, P.black);
  R(c, round(FX + 70 * FK), round(FY + FO + 43.5 * FK), round(12 * FK), 1, P.steel);
  // nostril, the line of the lips, the jaw
  ellipse(c, FX + 87.5 * FK, FY + FO + 73.5 * FK, 2.2, 1.2, P.black);
  line(c, FX + 84 * FK, FY + FO + 84 * FK, FX + 79 * FK, FY + FO + 84.5 * FK, P.black);
  line(c, FX + 60 * FK, FY + FO + 92 * FK, FX + 74 * FK, FY + FO + 102 * FK, P.ink);
  // two beads of sweat on the lit brow
  R(c, round(FX + 82 * FK), round(FY + FO + 30 * FK), 1, 2, P.white);
  R(c, round(FX + 84 * FK), round(FY + FO + 37 * FK), 1, 1, P.white);
  // the drop: slides, gathers at the chin, falls in slow motion
  let dx;
  let dy;
  let stretch = 0;
  const slide = prog(lt, 0.15, 1.35);
  if (lt < 1.35) {
    const s = sine(slide) * (DROP.length / 2 - 1);
    const i = min(DROP.length / 2 - 2, floor(s));
    const f = s - i;
    dx = FX + lerp(DROP[i * 2], DROP[i * 2 + 2], f) * FK;
    dy = FY + FO + lerp(DROP[i * 2 + 1], DROP[i * 2 + 3], f) * FK;
  } else if (lt < 1.55) {
    dx = FX + 79 * FK;
    dy = FY + FO + 102 * FK + (lt - 1.35) * 6;
    stretch = (lt - 1.35) * 8;
  } else {
    const ft = lt - 1.55;
    dx = FX + 79 * FK + ft * 3;
    dy = FY + FO + 102 * FK + 1.2 + 70 * ft * ft;
    stretch = max(0, 1.6 - ft * 3);
  }
  ellipse(c, dx, dy + stretch / 2, 2.2, 2.6 + stretch / 2, P.steel);
  ellipse(c, dx - 0.3, dy + stretch / 2 - 0.3, 1.7, 2.1 + stretch / 2, P.fog);
  ellipse(c, dx - 0.6, dy + stretch / 2 - 0.6, 1, 1.4 + stretch / 3, P.silver);
  R(c, round(dx - 1), round(dy - 1 + stretch / 4), 1, 1, P.white);
}

// --- 5. the reveal: front, rim-lit, slow push-in -----------------------------------------
const revealBg = () => bake('hg-reveal-bg', W, H, (c) => {
  R(c, 0, 0, W, H, P.black);
  glowBake(c, 192, 70, 170, 120, P.ink, 0.8);
  // two soft strip lights out of focus, the source of the rims
  for (const x of [34, 350]) glowBake(c, x, 110, 16, 110, P.slate, 0.8);
});
let RU = 36;
let RY = 28;
let RC = 0; // chin lift
/** Chest-up silhouette in one colour (procedural, so the push-in redraws it natively). */
function paintBust(c, col) {
  const u = RU;
  const x = 192;
  const top = RY;
  for (let sd = -1; sd <= 1; sd += 2) {
    capsule(c, x + sd * 0.936 * u, top + 1.7 * u, x + sd * 1.098 * u, top + 3.2 * u, 0.36 * u, 0.27 * u, col);
    ellipse(c, x + sd * 1.035 * u, top + 2.45 * u, 0.33 * u, 0.42 * u, col);
    capsule(c, x + sd * 1.098 * u, top + 3.2 * u, x + sd * 0.99 * u, top + 4.8 * u, 0.28 * u, 0.24 * u, col);
    ellipse(c, x + sd * 0.891 * u, top + 1.62 * u, 0.37 * u, 0.38 * u, col);
    ellipse(c, x + sd * 0.37 * u, top + 0.53 * u - RC, 0.07 * u, 0.13 * u, col);
  }
  pt(x - 0.24 * u, top + 1.0 * u);
  pt(x - 0.522 * u, top + 1.12 * u);
  pt(x - 0.828 * u, top + 1.36 * u);
  pt(x - 0.9 * u, top + 2.0 * u);
  pt(x - 0.738 * u, top + 3.4 * u);
  pt(x - 0.684 * u, top + 5 * u);
  pt(x + 0.684 * u, top + 5 * u);
  pt(x + 0.738 * u, top + 3.4 * u);
  pt(x + 0.9 * u, top + 2.0 * u);
  pt(x + 0.828 * u, top + 1.36 * u);
  pt(x + 0.522 * u, top + 1.12 * u);
  pt(x + 0.24 * u, top + 1.0 * u);
  fillPts(c, col);
  capsule(c, x, top + 0.82 * u - RC, x, top + 1.3 * u, 0.26 * u, 0.31 * u, col);
  ellipse(c, x, top + 0.5 * u - RC, 0.37 * u, 0.5 * u, col);
  ellipse(c, x, top + 0.83 * u - RC, 0.27 * u, 0.19 * u, col);
}
// Rim light by masks, on a figure-sized scratch. For each light direction the
// silhouette S is dilated once towards the light (D = S shifted 0..GAP px);
// a band of width w is then S minus D shifted by w: the pixels within w of an
// edge that faces the light across at least GAP empty pixels, so the narrow
// gaps between arm and torso stay dark.
const RB_X = 112; // scratch window over the bust
const RB_W = 160;
const GAP = 6;
// [dx, dy, then (colour, width) pairs, widest first]
const LIGHTS = [
  [-1, 0, P.ink, 8, P.steel, 3, P.silver, 1],
  [1, 0, P.ink, 8, P.slate, 3, P.fog, 1],
  [0, -1, P.slate, 3],
];
function rimLit(ctx, paint) {
  const S = buf('hg-sil', RB_W, H);
  S.c.translate(-RB_X, 0);
  paint(S.c, P.white);
  const T = buf('hg-tint', RB_W, H);
  T.c.drawImage(S.cv, 0, 0);
  T.c.globalCompositeOperation = 'source-in';
  T.c.fillStyle = P.black;
  T.c.fillRect(0, 0, RB_W, H);
  ctx.drawImage(T.cv, RB_X, 0);
  for (let l = 0; l < LIGHTS.length; l++) {
    const L = LIGHTS[l];
    const D = buf('hg-dil', RB_W, H);
    for (let k = 0; k <= GAP; k++) D.c.drawImage(S.cv, -L[0] * k, -L[1] * k);
    for (let b = 2; b < L.length; b += 2) {
      const B = buf('hg-band', RB_W, H);
      B.c.drawImage(S.cv, 0, 0);
      B.c.globalCompositeOperation = 'destination-out';
      B.c.drawImage(D.cv, -L[0] * L[b + 1], -L[1] * L[b + 1]);
      B.c.globalCompositeOperation = 'source-in';
      B.c.fillStyle = L[b];
      B.c.fillRect(0, 0, RB_W, H);
      ctx.drawImage(B.cv, RB_X, 0);
    }
  }
}
function shotReveal(c, lt) {
  c.drawImage(revealBg(), 0, 0);
  const push = sine(lt / 3.2);
  RU = 36 + push * 4;
  RY = 30 - push * 5 - ((1 - cos(lt * 1.5)) / 2) * 0.8;
  RC = ramp(lt, 1.2, 2.0) * 1.5;
  rimLit(c, paintBust);
  const u = RU;
  const x = 192;
  const top = RY;
  // body: collarbones, the scoop of the tank top and its straps, arms parted
  // from the torso by a faint line, the red mark
  for (let sd = -1; sd <= 1; sd += 2) {
    line(c, x + sd * 0.06 * u, top + 1.14 * u, x + sd * 0.54 * u, top + 1.2 * u, P.slate);
    capsule(c, x + sd * 0.9 * u, top + 1.32 * u, x + sd * 0.72 * u, top + 1.3 * u, 0.06 * u, 0.03 * u, P.slate);
    line(c, x + sd * 0.42 * u, top + 1.16 * u, x + sd * 0.5 * u, top + 2.35 * u, P.ink);
    line(c, x + sd * 0.42 * u, top + 1.5 * u, x + sd * 0.12 * u, top + 1.72 * u, P.ink);
    line(c, x + sd * 0.828 * u, top + 2.02 * u, x + sd * 0.738 * u, top + 3.4 * u, P.ink);
    line(c, x + sd * 0.81 * u, top + 2.3 * u, x + sd * 0.864 * u, top + 3.1 * u, P.black);
  }
  line(c, x - 0.12 * u, top + 1.72 * u, x + 0.12 * u, top + 1.72 * u, P.ink);
  const mw = round(u * 0.16);
  for (let k = 0; k < round(u * 0.09); k++) R(c, round(x - 0.55 * u + mw * 0.5 - k), round(top + 2.55 * u + k), mw, 1, P.red);
  // face under a soft top key: brow, deep sockets with a glint, nose, cheeks, lips, chin
  const hy = top + 0.5 * u - RC;
  ellipse(c, x, hy - 0.25 * u, 0.36 * u, 0.26 * u, P.black);
  for (let k = 0; k < 10; k++) R(c, round(x + (hash(k + 60) - 0.5) * 0.6 * u), round(hy - 0.4 * u + hash(k + 61) * 0.22 * u), 1, 1, P.ink);
  ellipse(c, x, hy - 0.13 * u, 0.25 * u, 0.06 * u, P.ink);
  R(c, round(x - 0.27 * u), round(hy - 0.07 * u), round(0.54 * u), 1, P.slate);
  for (let sd = -1; sd <= 1; sd += 2) {
    ellipse(c, x + sd * 0.15 * u, hy + 0.03 * u, 0.09 * u, 0.045 * u, P.black);
    R(c, round(x + sd * 0.15 * u - 1), round(hy + 0.03 * u), 2, 1, P.ink);
    ellipse(c, x + sd * 0.2 * u, hy + 0.17 * u, 0.07 * u, 0.035 * u, P.ink);
    R(c, round(x + sd * 0.07 * u), round(hy + 0.26 * u), 1, 1, P.black);
    line(c, x + sd * 0.2 * u, hy + 0.56 * u, x + sd * 0.06 * u, top + 1.12 * u, P.ink);
  }
  R(c, round(x - 0.15 * u), round(hy + 0.03 * u), 1, 1, P.silver);
  R(c, round(x + 0.15 * u), round(hy + 0.03 * u), 1, 1, P.fog);
  R(c, round(x), round(hy - 0.02 * u), 1, round(0.22 * u), P.slate);
  R(c, round(x - 1), round(hy + 0.21 * u), 3, 1, P.steel);
  R(c, round(x - 0.1 * u), round(hy + 0.34 * u), round(0.2 * u), 1, P.black);
  R(c, round(x - 0.07 * u), round(hy + 0.37 * u), round(0.14 * u), 1, P.slate);
  ellipse(c, x, hy + 0.47 * u, 0.07 * u, 0.025 * u, P.slate);
  // sweat glints on the shoulders
  for (let k = 0; k < 5; k++) {
    const sd = k % 2 ? 1 : -1;
    R(c, round(x + sd * (0.68 + hash(k) * 0.3) * u), round(top + (1.32 + hash(k + 9) * 0.3) * u), 1, 1, P.white);
  }
}

// --- 6. end slate ---------------------------------------------------------------------------
const LEGAL1 = 'RESULTS MAY VARY. RESOLUTION CAPPED AT 384 X 216. MEMBERSHIP RENEWS EVERY FRAME.';
const LEGAL2 = 'NO PIXELS WERE ANTI-ALIASED IN THE MAKING OF THIS ADVERTISEMENT.';
const SLATE_RES = [0, 8, 0.35, 6, 0.5, 4, 0.62, 3, 0.74, 2, 0.86, 1];
function slateCell(lt) {
  let b = 8;
  for (let i = 0; i < SLATE_RES.length; i += 2) if (lt >= SLATE_RES[i]) b = SLATE_RES[i + 1];
  return b;
}
function shotSlate(ctx, lt) {
  R(ctx, 0, 0, W, H, P.black);
  // the mark arrives in fat cells and resolves (the brand's device), then holds
  const mark = gymMark(2);
  const a = ramp(lt, 0.1, 0.5);
  if (a > 0) {
    const F = buf('hg-slate');
    F.c.fillStyle = P.black;
    F.c.fillRect(0, 0, W, H);
    F.c.drawImage(mark, round(192 - mark.width / 2), 70);
    present(ctx, F.cv, slateCell(lt), a);
  }
  const ra = ramp(lt, 1.0, 1.6);
  if (ra > 0) {
    const w = round(64 * ra);
    R(ctx, 192 - w, 106, w * 2, 1, P.slate);
  }
  art(ctx, label('hg-tag', 'TRAIN YOUR RESOLUTION.', 2, P.silver, 'body'), 192, 116, ramp(lt, 1.2, 1.9));
  const la = ramp(lt, 2.0, 2.6);
  art(ctx, label('hg-legal1', LEGAL1, 1, P.steel), 192, 192, la);
  art(ctx, label('hg-legal2', LEGAL2, 1, P.steel), 192, 200, la);
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
    if (s.tr === 'dip' && i && lt < s.d && lt < s.d / 2) SHOTS[i - 1].draw(c, dt - SHOTS[i - 1].at);
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
    if (r.mix < 1) present(ctx, F.cv, r.prev, 1);
    present(ctx, F.cv, r.b, r.mix < 1 ? r.mix : 1);
    R(ctx, 0, 0, W, BAR, P.black);
    R(ctx, 0, H - BAR, W, BAR, P.black);
    // the readout, crisp in the bottom bar; it turns red when the picture is whole
    const la = ramp(dt, 0.8, 1.4);
    const cv = label(RES_KEY[r.b], RES_LABEL[r.b], 1, r.b === 1 ? P.red : P.steel);
    art(ctx, cv, 24, H - BAR + 6, la, 'left');
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

export default {
  id: 'hi-res-gym',
  brand: 'HI-RES GYM',
  duration: DURATION,
  voice: { gender: 'male', lang: 'en-US', pitch: 0.72, rate: 0.85 },
  script: [
    { at: 0.6, text: 'They said you were low resolution.' },
    { at: 4.8, text: 'Blurry.' },
    { at: 5.9, text: 'Two hundred and forty lines. At best.' },
    { at: 9.6, text: 'So you trained.' },
    { at: 11.3, text: 'Every rep... another pixel.' },
    { at: 14.3, text: 'Until they could see every detail.' },
    { at: 19.7, text: 'Hi-Res Gym. Train your resolution.' },
  ],
  // 60 bpm, 24 beats = the spot, so beats are seconds. A low A-minor pad and a
  // heartbeat under the whisper; the pulse firms up for the lift with a tom on
  // each lockout (10.5 s, 12.5 s); a quiet tick each time the picture gains
  // resolution; a swell into the reveal (16.6 s) and one low hit on the slate.
  tune: {
    bpm: 60,
    room: 0.5,
    echo: { amount: 0.5, beats: 0.75, feedback: 0.3 },
    tracks: [
      {
        kind: 'harmony', inst: { wave: 'sine', a: 1.6, d: 2, s: 0.8, r: 1.6 }, gain: 1,
        notes: 'A2+E3+A3:9 F2+C3+A3:4.5 C3+G3+C4:1.5 G2+D3+B3:1.6 A2+E3+C4:2.9 F2+C3+A3:2 A2+E3+A3:2.5',
      },
      {
        kind: 'bass', inst: { wave: 'sine', a: 0.3, d: 1.5, s: 0.85, r: 1 }, gain: 0.9,
        notes: 'R:9 F1:4.5 C2:1.5 G1:1.6 A1:2.9 F1:2 A1:2.5',
      },
      {
        kind: 'lead', inst: { wave: 'sine', a: 0.005, d: 1.1, s: 0, r: 0.7, legato: 1 }, gain: 0.55,
        notes: 'R:1.5 E5:1 C5:1 A4:2.5 R:1 E5:1 D5:1 B4:2.5 R:2 C5:1 A4:1 F4:2.5 R:1 G4:1.5 B4:1.6 C5:1 E5:1 A5:1.4 R:2 A4:1 E5:2.5',
      },
      {
        drums: [
          'R:1',
          'K:0.28@0.4 K:0.72@0.25 '.repeat(8),
          'K:0.5@0.7 K:0.5@0.3 K:0.5@0.7 T:0.5@0.8 K:0.5@0.7 K:0.5@0.3 K:0.5@0.7 T:0.5@0.8',
          'K:0.28@0.4 K:0.72@0.25 K:0.28@0.4 K:0.72@0.25',
          'W:1.6@0.45',
          'K:0.6@1 T:0.4@0.7 R:1.9',
          'K:1@0.9 R:3.5',
        ].join(' '),
      },
      { drums: 'R:7.1 X:3.45@0.5 X:2@0.5 X:2.65@0.5 X:8.8@0.6' },
    ],
  },
  draw(ctx, t, dt) {
    run(ctx, dt);
  },
};
