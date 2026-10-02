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

const { sin, cos, PI, round, floor, ceil, min, max, abs, sqrt, hypot } = Math;
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
/**
 * Per-pixel light at bake time. `ids` holds a part number per pixel (0 =
 * empty); for each lit pixel the distance to its part's edge is measured along
 * a few directions towards the light (the shortest wins, so light wraps round
 * curves), and fn(x, y, part, distance) returns a ramp index or -1.
 */
function distanceLight(ids, x0, y0, x1, y1, dirs, maxD, fn, out) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const id = ids[y * W + x];
      if (!id) continue;
      let best = maxD;
      for (let k = 0; k < dirs.length; k += 2) {
        const dx = dirs[k];
        const dy = dirs[k + 1];
        for (let s = 1; s < best; s++) {
          const sx = round(x + dx * s);
          const sy = round(y + dy * s);
          if (sx < 0 || sy < 0 || sx >= W || sy >= H || ids[sy * W + sx] !== id) {
            best = s;
            break;
          }
        }
      }
      out[y * W + x] = fn(x, y, id, best);
    }
  }
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
  for (let k = 0; k < 12; k++) {
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
// Light from the front (screen right), wrapping a little over and under: it
// gives the rim. The form comes from planes painted like a hand-shaded portrait:
// each a cluster of one tone, the ones that face the light lighter.
const FACE_DIRS = [1, 0, 1, -0.45, 1, 0.45];
const FACE_BACK = [1, 0];
const rimBand = (d) => (d <= 1 ? 0 : d <= 2 ? 1 : d <= 3 ? 2 : 9);
const FACE_PLANES = [
  // [ramp index, polygon in face units]
  [6, [44, 70, 79, 102, 70, 105, 60, 104, 50, 96, 40, 84]], // the neck under the jaw
  [4, [52, 72, 63, 69, 76, 71, 80, 82, 76, 92, 66, 97, 54, 90]], // jaw and lower cheek
  [3, [66, 10, 76, 14, 81, 24, 84, 34, 86, 40, 77, 41, 69, 34, 64, 22]], // forehead
  [2, [73, 39, 86, 40, 85, 44, 76, 43.5]], // brow ridge
  [5, [70, 45, 83, 46, 83, 54, 72, 54]], // the socket under the brow
  [4, [61, 58, 72, 55, 81, 59, 83, 66, 76, 70, 63, 68]], // cheek
  [3, [70, 57, 80, 59, 82, 64, 74, 65]], // cheekbone
  [3, [79, 55, 84, 63, 89, 71, 84, 72, 79, 64, 76, 57]], // side of the nose
  [2, [80, 49, 86, 54, 90, 62, 94, 71, 89, 71, 84, 63, 79, 55]], // ridge of the nose
  [6, [83, 73, 92, 74, 88, 75, 85, 76, 82, 75]], // under the nose
  [3, [79, 76, 85, 76, 87, 81, 86, 83, 79, 82]], // upper lip
  [3, [80, 85, 86, 86, 85, 88, 80, 88]], // lower lip
  [6, [78, 88, 85, 88, 82, 91, 78, 90.5]], // under the lower lip
  [3, [73, 92, 82, 91, 84, 95, 83, 99, 79, 101.5, 72, 98]], // chin
];
const EAR = [42, 47, 46, 48, 47.5, 52, 47, 58, 45.5, 62, 44, 66, 41, 66.5, 39.5, 63, 39, 58, 38.5, 52, 40, 48];
const EAR_BOWL = [42, 51, 44.6, 52, 45, 57, 44, 61, 42, 61, 41, 56];
/** Fill a polygon (face units) into a ramp-index buffer, only inside the mask. */
function polyIndex(idx, ids, arr, val) {
  NP = 0;
  localPts(arr);
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let i = 1; i < NP * 2; i += 2) {
    if (PT[i] < y0) y0 = PT[i];
    if (PT[i] > y1) y1 = PT[i];
  }
  for (let y = max(0, floor(y0)); y <= min(H - 1, ceil(y1)); y++) {
    const sy = y + 0.5;
    let k = 0;
    for (let i = 0, j = NP - 1; i < NP; j = i++) {
      const ay = PT[j * 2 + 1];
      const by = PT[i * 2 + 1];
      if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) XS[k++] = PT[j * 2] + ((sy - ay) / (by - ay)) * (PT[i * 2] - PT[j * 2]);
    }
    if (k < 2) continue;
    const a = max(0, round(min(XS[0], XS[1])));
    const b = min(W, round(max(XS[0], XS[1])));
    for (let x = a; x < b; x++) if (ids[y * W + x]) idx[y * W + x] = val;
  }
  NP = 0;
}
const faceBg = () => bake('hg-face-bg', W, H, (c) => {
  ditherField(c, 0, 0, W, H, [P.black, P.ink, P.slate], (x, y) => 0.95 - hypot((x - 40) / 260, (y - 90) / 200) * 1.1);
  glowBake(c, 340, 100, 90, 110, P.ink, 0.6);
});
const faceArt = () => bake('hg-face', W, H, (c) => {
  const ids = new Uint8Array(W * H);
  partMask(c, ids, 1, (k) => {
    localPts(FACE_S);
    fillPts(k, P.white);
    localPts(SHOULDER);
    fillPts(k, P.white);
  });
  // the skin in shadow: ink near the lit side, black further back (the line
  // between them follows the profile, at a fixed depth from the lit edge)
  const idx = new Int8Array(W * H).fill(-1);
  distanceLight(ids, 0, 0, W, H, FACE_BACK, 48, (x, y, id, d) => (d > 40 ? 6 : 5), idx);
  for (const [v, poly] of FACE_PLANES) polyIndex(idx, ids, poly, v);
  // the rim along every edge that faces the light, wrapping the nose and chin
  const rim = new Int8Array(W * H).fill(9);
  distanceLight(ids, 0, 0, W, H, FACE_DIRS, 5, (x, y, id, d) => rimBand(d), rim);
  for (let i = 0; i < W * H; i++) if (idx[i] >= 0 && rim[i] < idx[i]) idx[i] = rim[i];
  paintIndex(c, idx, GREYS);
  // close-cropped hair: black with a little texture, a lit edge at the hairline
  localPts(HAIR_S);
  fillPts(c, P.black);
  for (let k = 0; k < 40; k++) R(c, round(fx(12 + hash(k) * 44)), round(fy(4 + hash(k + 30) * 50)), 1, 1, P.ink);
  for (let i = 6; i < HAIR.length - 18; i += 2) R(c, round(fx(HAIR[i])) + 1, round(fy(HAIR[i + 1])), 1, 1, P.slate);
  // the ear: helix, the bowl in shadow, a lit rim on its upper edge, the lobe
  localPts(EAR);
  fillPts(c, P.slate);
  localPts(EAR_BOWL);
  fillPts(c, P.black);
  for (let i = 0; i < 12; i += 2) R(c, round(fx(EAR[i])), round(fy(EAR[i + 1])) + 1, 1, 1, P.steel);
  R(c, round(fx(46.6)), round(fy(55)), 2, 3, P.steel);
  line(c, fx(41.5), fy(64), fx(43.5), fy(65.5), P.ink);
  // the brow: short hairs over the lit ridge
  for (let k = 0; k < 9; k++) R(c, round(fx(72 + k * 1.3)), round(fy(44.6 + k * 0.1)), 1, 2, k & 1 ? P.ink : P.black);
  // the eye, half-closed in the effort: lid, lashes, the iris and a soft catchlight
  line(c, fx(74), fy(49.4), fx(80), fy(49.8), P.black);
  line(c, fx(80), fy(49.8), fx(81.5), fy(49.3), P.black);
  R(c, round(fx(77.6)), round(fy(50.2)), 3, 2, P.black);
  R(c, round(fx(76)), round(fy(50.6)), 2, 1, P.ink);
  R(c, round(fx(79)), round(fy(50.2)), 1, 1, P.fog);
  line(c, fx(75), fy(52.2), fx(79.5), fy(52), P.ink);
  // the nose: the crease of the wing and the nostril inside it
  line(c, fx(81), fy(69), fx(83.5), fy(73.2), P.ink);
  R(c, round(fx(86)), round(fy(73.6)), 2, 1, P.black);
  // the lips: the line between them
  line(c, fx(78.5), fy(84.4), fx(84.5), fy(84), P.black);
  // the neck: the long muscle from behind the ear, the strap of the vest
  line(c, fx(48), fy(74), fx(61), fy(117), P.black);
  line(c, fx(49), fy(74), fx(62), fy(117), P.ink);
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

// --- 5. the reveal: front, split-lit against concrete --------------------------------------
// Baked twice with per-pixel light: in the dark (only the back light's rim on
// his right side) and lit (a soft key from the upper left). The key comes up,
// he breathes; the red square on his chest is the brand's one colour.
const RX = 192;
const RT = 30; // top of the head
const RH = 30; // head height
const concrete = () => bake('hg-concrete', W, H, (c) => {
  ditherField(c, 0, 0, W, H, [P.black, P.ink, P.slate], (x, y) => 0.92 - hypot((x - 96) / 250, (y - 60) / 180) * 1.1);
  // formwork seams and tie holes, kept away from his head
  for (const x of [52, 332]) R(c, x, 0, 1, H, A(P.black, 0.6));
  R(c, 0, 150, W, 1, A(P.black, 0.5));
  for (let gx = 22; gx < W; gx += 58) {
    for (let gy = 40; gy < 200; gy += 56) {
      if (abs(gx - RX) < 70 && gy < 120) continue;
      R(c, gx, gy, 2, 2, A(P.black, 0.7));
      R(c, gx + 1, gy + 2, 2, 1, A(P.steel, 0.35));
    }
  }
});
// Parts back to front: 1 chest (skin), 2 vest, 3 left arm, 4 right arm, 5 neck, 6 head.
function revealParts(c, ids) {
  const x = RX;
  partMask(c, ids, 1, (k) => {
    pt(x - 9, 62);
    pt(x - 24, 67);
    pt(x - 35, 73);
    pt(x - 39, 84);
    pt(x - 34, 104);
    pt(x - 26, 132);
    pt(x - 28, 200);
    pt(x + 28, 200);
    pt(x + 26, 132);
    pt(x + 34, 104);
    pt(x + 39, 84);
    pt(x + 35, 73);
    pt(x + 24, 67);
    pt(x + 9, 62);
    fillPts(k, P.white);
  });
  partMask(c, ids, 2, (k) => {
    pt(x - 10, 63);
    pt(x - 16, 63);
    pt(x - 26, 94);
    pt(x - 27, 132);
    pt(x - 29, 200);
    pt(x + 29, 200);
    pt(x + 27, 132);
    pt(x + 26, 94);
    pt(x + 16, 63);
    pt(x + 10, 63);
    pt(x + 6, 78);
    pt(x, 83);
    pt(x - 6, 78);
    fillPts(k, P.white);
  });
  for (let sd = -1; sd <= 1; sd += 2) {
    partMask(c, ids, sd < 0 ? 3 : 4, (k) => {
      ellipse(k, x + sd * 34, 83, 9, 11, P.white);
      capsule(k, x + sd * 35, 86, x + sd * 38, 120, 8.5, 7, P.white);
      capsule(k, x + sd * 38, 120, x + sd * 37, 152, 6.6, 5, P.white);
      ellipse(k, x + sd * 37, 160, 5.2, 6.6, P.white);
    });
  }
  partMask(c, ids, 5, (k) => {
    pt(x - 7, 54);
    pt(x + 7, 54);
    pt(x + 8.5, 68);
    pt(x - 8.5, 68);
    fillPts(k, P.white);
  });
  partMask(c, ids, 6, (k) => {
    const hw = RH * 0.38;
    for (let y = 0; y < RH; y++) {
      const u = (y + 0.5) / RH;
      const half = (u < 0.5 ? sqrt(max(0, 1 - ((0.5 - u) / 0.5) ** 2 * 0.92)) : u < 0.78 ? 1 - (u - 0.5) * 0.42 : (1 - 0.28 * 0.42) * (1 - ((u - 0.78) / 0.22) * 0.58)) * hw;
      k.fillStyle = P.white;
      k.fillRect(round(x - half), RT + y, round(half * 2), 1);
    }
    ellipse(k, x - hw - 0.5, RT + RH * 0.52, 2, 3.6, P.white);
    ellipse(k, x + hw + 0.5, RT + RH * 0.52, 2, 3.6, P.white);
  });
}
// Light from the upper left, wrapping a little.
const KEY_DIRS = [-1, -0.55, -1, -0.1, -0.6, -1];
const revealArt = (lit) => bake(lit ? 'hg-reveal-lit' : 'hg-reveal-dark', W, H, (c) => {
  const ids = new Uint8Array(W * H);
  revealParts(c, ids);
  const idx = new Int8Array(W * H).fill(-1);
  const x0 = RX - 60;
  const x1 = RX + 60;
  distanceLight(ids, x0, RT - 2, x1, H, KEY_DIRS, 30, (x, y, id, d) => {
    if (!lit) return 6;
    // the vest: dark cloth that turns from the key across the chest (its own
    // edges hide behind the arms); the pecs catch a little more of it
    if (id === 2) {
      // a dithered turn (Bayer 4x4, light falloff on cloth only)
      let v = 4 + (x - RX + 26) / 16;
      if (y < 100 && hypot((x - (RX - 12)) / 12, (y - 92) / 8) < 1) v -= 0.6;
      const i = floor(v);
      const k = (v - i) * 16 > BAYER[(y & 3) * 4 + (x & 3)] + 0.5 ? i + 1 : i;
      return max(4, min(6, k));
    }
    let b = d <= 1 ? 1 : d <= 3 ? 2 : d <= 7 ? 3 : d <= 12 ? 4 : d <= 20 ? 5 : 6;
    // split light: his right side (screen right) falls into shadow
    b += max(0, floor((x - RX + 2) / 11));
    if (id === 6) {
      // eye sockets, the nose's shadow cast to the right, the lit cheekbone
      if (hypot((x - (RX - 6)) / 4.2, (y - (RT + 15)) / 2.6) < 1) b += 2;
      if (hypot((x - (RX + 6)) / 4.2, (y - (RT + 15)) / 2.6) < 1) b += 2;
      if (x > RX && x < RX + 5 && y > RT + 16 && y < RT + 21 && x - RX < (y - RT - 15)) b += 2;
      if (hypot((x - (RX - 7)) / 3, (y - (RT + 19)) / 2) < 1) b -= 1;
      if (y > RT + RH * 0.86) b += 1;
    }
    if (id === 5 && y < RT + RH + 4) b += 2; // under the jaw
    if (id === 3 || id === 4) b += 1; // the arms sit a step under the face
    return max(0, min(6, b));
  }, idx);
  // the back light: a rim on every edge that faces screen right
  for (let y = RT - 2; y < H; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * W + x;
      if (!ids[i]) continue;
      if (!ids[i + 1]) idx[i] = min(idx[i], 1);
      else if (!ids[i + 2]) idx[i] = min(idx[i], 3);
    }
  }
  paintIndex(c, idx, GREYS);
  if (!lit) return;
  const x = RX;
  const t = RT;
  // close-cropped hair
  for (let y = t - 1; y < t + 8; y++) {
    const u = (y + 0.5 - t) / RH;
    const half = sqrt(max(0, 1 - ((0.5 - u) / 0.5) ** 2 * 0.92)) * RH * 0.38 + 0.5;
    R(c, x - half, y, half * 2, 1, y < t + 2 ? P.ink : P.black);
  }
  R(c, x - 9, t + 1, 6, 1, P.slate);
  R(c, x + 4, t, 5, 1, P.fog);
  for (let k = 0; k < 10; k++) R(c, x - 9 + floor(hash(k + 3) * 18), t + 2 + floor(hash(k + 8) * 5), 1, 1, P.ink);
  // brows (the far one in shadow), the eyes: lid, iris, a soft catchlight, lower lid
  R(c, x - 10, t + 12, 7, 1, P.black);
  R(c, x - 9, t + 11, 5, 1, P.ink);
  R(c, x + 3, t + 12, 7, 1, P.black);
  for (let sd = -1; sd <= 1; sd += 2) {
    const ex = x + sd * 6;
    R(c, ex - 3, t + 14, 6, 1, P.black);
    R(c, ex - 2, t + 15, 4, 1, sd < 0 ? P.steel : P.slate);
    R(c, ex - 1, t + 15, 2, 1, P.black);
    R(c, ex - (sd < 0 ? 1 : 0), t + 15, 1, 1, sd < 0 ? P.fog : P.steel);
    R(c, ex - 2, t + 16, 4, 1, P.ink);
  }
  // nose: the lit bridge, the tip, nostrils; the mouth; the chin
  R(c, x - 2, t + 15, 1, 5, P.fog);
  R(c, x - 1, t + 20, 1, 1, P.silver);
  R(c, x - 3, t + 21, 2, 1, P.black);
  R(c, x + 2, t + 21, 2, 1, P.black);
  R(c, x - 2, t + 22, 4, 1, P.ink);
  R(c, x - 4, t + 23, 8, 1, P.ink);
  R(c, x - 4, t + 24, 8, 1, P.black);
  R(c, x - 3, t + 25, 3, 1, P.fog);
  R(c, x - 2, t + 27, 4, 1, P.ink);
  R(c, x - 6, t + 28, 1, 1, P.steel);
  // the ears
  R(c, x - 13, t + 14, 1, 4, P.fog);
  R(c, x + 12, t + 14, 1, 4, P.ink);
  // collarbones, the vest's neckline and straps, creases of the vest over the chest
  line(c, x - 3, 66, x - 16, 68, P.steel);
  line(c, x + 3, 66, x + 16, 68, P.ink);
  line(c, x - 6, 78, x, 83, P.ink);
  line(c, x + 6, 78, x, 83, P.black);
  line(c, x - 16, 64, x - 26, 94, P.slate);
  line(c, x - 24, 101, x - 6, 102, P.ink);
  line(c, x - 24, 118, x - 15, 150, P.ink);
  line(c, x - 20, 124, x - 12, 160, P.ink);
  line(c, x + 13, 112, x + 20, 160, P.black);
  // deltoids, biceps, forearms: the separations, one vein on the lit forearm
  line(c, x - 41, 92, x - 32, 98, P.ink);
  line(c, x + 41, 92, x + 32, 98, P.black);
  line(c, x - 43, 104, x - 42, 122, P.steel);
  line(c, x - 41, 128, x - 40, 140, P.slate);
  line(c, x - 40, 140, x - 41, 148, P.slate);
  // hands wrapped in tape, knuckles lit
  for (let sd = -1; sd <= 1; sd += 2) {
    const hx = x + sd * 37;
    for (let k = 0; k < 4; k++) R(c, hx - 4, 155 + k * 3, 9, 1, sd < 0 ? P.steel : P.slate);
    R(c, hx - 4, 166, 9, 1, sd < 0 ? P.fog : P.steel);
  }
  // the red square: the brand's pixel, on the lit side of his chest
  R(c, x - 19, 88, 6, 6, P.red);
  R(c, x - 14, 88, 1, 6, P.darkRed);
  R(c, x - 19, 93, 6, 1, P.darkRed);
  // sweat: specular points on the lit forehead and shoulder
  R(c, x - 6, t + 6, 1, 1, P.white);
  R(c, x - 31, 74, 2, 1, P.white);
  R(c, x - 42, 88, 1, 1, P.white);
});
function shotReveal(c, lt) {
  c.drawImage(concrete(), 0, 0);
  const breath = -round(((1 - cos(lt * 1.5)) / 2) * 1.2);
  c.drawImage(revealArt(false), 0, breath);
  const key = smooth(prog(lt, 0.5, 1.8));
  if (key > 0) {
    c.globalAlpha = key;
    c.drawImage(revealArt(true), 0, breath);
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
  const y = H - BAR + 1;
  const p = r.at > 0 ? sine((dt - r.at) / 0.3) : 1;
  const cur = label(RES_KEY[r.b], RES_LABEL[r.b], 1, r.b === 1 ? P.red : P.fog, 'body');
  if (p < 1) {
    const old = label(RES_KEY[r.prev], RES_LABEL[r.prev], 1, P.fog, 'body');
    art(ctx, old, 24, y - round(3 * p), la * (1 - p), 'left');
  }
  art(ctx, cur, 24, y + round(3 * (1 - p)), la * p, 'left');
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
  if (warmed > 16) return;
  const k = warmed++;
  const w = buf('hg-warm').c;
  if (k < 10) {
    const s = SHOTS[1 + (k >> 1)];
    if (dt < s.at) s.draw(w, k & 1 ? 3 : 1);
  } else if (k === 10) revealArt(false);
  else if (k === 11) revealArt(true);
  else if (k === 12) for (const b of [12, 8, 6, 4, 3, 2]) mos(b);
  else if (k === 13) {
    for (const b of [8, 6, 4, 3, 1]) {
      label(RES_KEY[b], RES_LABEL[b], 1, b === 1 ? P.red : P.fog, 'body');
    }
  } else if (k === 14) {
    buf('hg-tb');
    buf('hg-slate');
  } else if (k === 15) gymMark(2);
  else faceArt();
}

export default {
  id: 'hi-res-gym',
  brand: 'HI-RES GYM',
  duration: DURATION,
  voice: { gender: 'male', lang: 'en-US', pitch: 0.72, rate: 0.85 },
  // Sixteen words, the genre's long silences between them.
  script: [
    { at: 0.8, text: 'Low resolution.' },
    { at: 4.6, text: 'Blurry.' },
    { at: 8.4, text: 'So you trained.' },
    { at: 10.0, text: 'Every rep, another pixel.' },
    { at: 20.0, text: 'Hi-Res Gym. Train your resolution.' },
  ],
  // 60 bpm, 24 beats = the spot, so beats are seconds; every track is 24 beats.
  // A low A-minor pad changing chord on each cut, a felt-timpani heartbeat, toms
  // on the lockouts (9.05, 11.05 s), a quiet tick on each resolution step; then
  // the held breath: silence over the face until the drop falls (14.25 s), a low
  // thump, and the melody climbs through the reveal to land A5 on the slate.
  tune: {
    bpm: 60,
    room: 0.5,
    echo: { amount: 0.5, beats: 0.75, feedback: 0.3 },
    tracks: [
      {
        kind: 'harmony', inst: { wave: 'sine', a: 1.6, d: 2, s: 0.8, r: 1.6 }, gain: 0.9,
        notes: 'A2+E3+A3:7.8 F2+C3+A3:4 C3+G3+C4:3.8 G2+D3+B3:3.8 A2+E3+C4:4.6',
      },
      {
        kind: 'bass', inst: { wave: 'sine', a: 0.3, d: 1.5, s: 0.85, r: 1 }, gain: 0.85,
        notes: 'R:7.8 F1:4 C2:3.8 G1:3.8 A1:4.6',
      },
      {
        kind: 'lead', inst: { wave: 'sine', a: 0.005, d: 1.1, s: 0, r: 0.7, legato: 1 }, gain: 0.5,
        notes: 'R:1.6 E5:1 C5:1 A4:2 R:2.2 E5:1 D5:1 B4:2 R:3.8 G4:1 B4:1 C5:0.8 E5:1 A5:3 R:1.6',
      },
      {
        drums: [
          'R:0.8',
          'F:0.28@0.5 F:0.72@0.3 '.repeat(7),
          'F:1.25@0.5 T:1@0.6 F:1@0.5 T:0.75@0.6',
          'R:2.45 F:0.6@0.8 R:0.75',
          'F:0.28@0.35 F:0.72@0.22 '.repeat(3),
          'R:0.8 F:1@0.8 R:3.6',
        ].join(' '),
      },
      { drums: 'R:4 X:5.05@0.35 X:2@0.35 X:3.2@0.4 X:9.75@0.4' },
    ],
  },
  draw(ctx, t, dt) {
    warm(dt);
    run(ctx, dt);
  },
};
