// THE GRAND BUFFER — a parody of old-money luxury-hotel commercials. The joke
// is buffering sold as heritage: since 1897 the hotel has perfected the art of
// the wait. A slow, plummy voice-over, a string-quartet bed that ends on an
// unresolved chord ("almost there"), gold serif lettering on night navy,
// marble and brass, and the loading spinner treated as a precious heirloom.
//
// Six shots, 24.6 s, joined by slow dissolves, a dip to black and one match
// cut (the lobby clock pushes in and becomes the heirloom's ring of pearls):
//  1  0.0 EXTERIOR  night rain; the camera cranes down the facade to the doorman.
//                                                      VO "In a world that refreshes every second..."
//  2  4.0 LOBBY     a guest rings the desk bell; the concierge keeps writing
//                   and raises one finger. And holds it.
//                                                      VO "...one hotel has never once been in a hurry."
//  3  9.0 HEIRLOOM  beauty shot: eight pearls under a glass dome, lit one by
//                   one as a gloved hand turns a brass crank. Slow push-in.
//                                                      VO "Every spinner is still turned by hand."
//  4 12.8 SUITE     a housekeeper plumps a pillow, puts it back, and starts
//                   again: the action loops, like a buffer.
//                                                      VO "Every suite... almost ready."
//  5 16.6 DINNER    a guest checks his watch; the waiter lifts the cloche and
//                   on the plate sits the spinner.     VO "Dinner will be served... shortly."
//  6 20.0 SLATE     serif wordmark, a gold hairline that stops at 99 %, small
//                   print.                             VO "The Grand Buffer. You're almost there."
//
// Every frame is a pure function of the ad clock. People are procedural
// puppets with adult proportions (6.8 heads), flat key-light shading from the
// left and a silver rim, posed by eased keys so each gesture travels its whole
// arc. Scenery is baked once into cached canvases; polygons fill through one
// preallocated span buffer; transitions use pooled scratch canvases.
import { P, W, H, A, R, bands, drawText, measureText, glint, prog, lerp } from './kit.js';

const { sin, cos, PI, round, floor, ceil, min, max, abs, sqrt, hypot, atan2 } = Math;
const TAU = PI * 2;

// --- timing ------------------------------------------------------------------------
const T_EXT = 0;
const T_LOBBY = 4.0;
const T_JEWEL = 9.0;
const T_SUITE = 12.8;
const T_DINNER = 16.6;
const T_SLATE = 20.0;
const DURATION = 24.6;

// --- motion helpers ------------------------------------------------------------------
const c01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (x) => {
  const v = c01(x);
  return v * v * (3 - 2 * v);
};
/** Sine in-out: the default for anything a person or a camera does. */
const sine = (x) => (1 - cos(PI * c01(x))) / 2;
const io = (x) => {
  const v = c01(x);
  return v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2;
};
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
const hash = (i) => {
  const s = sin(i * 127.1 + 311.7) * 43758.5453;
  return s - floor(s);
};

// --- raster helpers (crisp spans, no allocation) --------------------------------------
const XS = new Float64Array(128);
/** Scanline fill of a polygon given as a flat [x0, y0, x1, y1, ...] array of n points. */
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
// A shared point list: pt() appends, fillPts() fills and resets.
const PT = new Float64Array(160);
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
/** Axis-aligned ellipse with fractional centre and radii. */
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
const EL = new Float64Array(40);
/** Ellipse on rotated axes: (fx, fy) is the unit "front" axis (radius rx), up is perpendicular (radius ry). */
function ellipseAx(ctx, cx, cy, fx, fy, rx, ry, c) {
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU;
    const ca = cos(a) * rx;
    const sa = sin(a) * ry;
    EL[i * 2] = cx + fx * ca + fy * sa;
    EL[i * 2 + 1] = cy + fy * ca - fx * sa;
  }
  fillPoly(ctx, EL, 18, c);
}
const CAP = new Float64Array(32);
/** Tapered capsule from (ax, ay) radius ra to (bx, by) radius rb, round ends. */
function capsule(ctx, ax, ay, bx, by, ra, rb, c) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = hypot(dx, dy) || 1e-6;
  const ux = dx / len;
  const uy = dy / len;
  let n = 0;
  for (let i = 0; i <= 6; i++) {
    const a = PI / 2 + (PI * i) / 6;
    const ca = cos(a);
    const sa = sin(a);
    CAP[n++] = ax + (ux * ca - uy * sa) * ra;
    CAP[n++] = ay + (uy * ca + ux * sa) * ra;
  }
  for (let i = 0; i <= 6; i++) {
    const a = -PI / 2 + (PI * i) / 6;
    const ca = cos(a);
    const sa = sin(a);
    CAP[n++] = bx + (ux * ca - uy * sa) * rb;
    CAP[n++] = by + (uy * ca + ux * sa) * rb;
  }
  fillPoly(ctx, CAP, n / 2, c);
}
/** Limb lit from the upper left: the shade colour survives as a sliver on the far side. */
function limb(ctx, ax, ay, bx, by, ra, rb, base, shade) {
  if (!shade || ra < 1.2) {
    capsule(ctx, ax, ay, bx, by, ra, rb, base);
    return;
  }
  capsule(ctx, ax, ay, bx, by, ra, rb, shade);
  capsule(ctx, ax - 0.6, ay - 0.3, bx - 0.6, by - 0.3, ra - 0.6, max(0.6, rb - 0.6), base);
}
/** Bresenham line for 1 px details. */
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
// 4x4 Bayer thresholds for baked light falloff (art direction: Bayer 4x4 only).
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Bake-time ordered-dither field: f(x, y) -> 0..1 picks along a colour ramp. */
function ditherField(c, x0, y0, w, h, ramp, f) {
  const img = c.getImageData(x0, y0, w, h);
  const d = img.data;
  const rgb = ramp.map((hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]);
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

const rgbOf = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
/** Bake-time light pool: up to `a` of `hex` blended in four Bayer-dithered steps (no rings). */
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
/** Bake-time falloff: darken by factor k where f(x, y) (0..1) beats the Bayer threshold. */
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

/**
 * Static art painted once. Bakes that read pixels back (dither, glow, shade)
 * paint on a read-friendly canvas, then the result is copied to a plain one.
 */
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

// --- pooled scratch canvases -----------------------------------------------------------
const BUF = {};
function buf(name) {
  let b = BUF[name];
  if (!b) {
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    b = BUF[name] = { cv, c };
  }
  b.c.setTransform(1, 0, 0, 1, 0, 0);
  b.c.globalAlpha = 1;
  b.c.clearRect(0, 0, W, H);
  return b;
}

// --- lettering --------------------------------------------------------------------------
// A small Didone-style serif (11 px caps): 2 px stems, 1 px hairlines and
// bracketed serifs. Only the letters the brand needs.
const SERIF = {
  A: '.....#.....|....###....|....###....|...#.##....|...#..##...|..#...##...|..#######..|.#.....##..|.#......##.|.#......##.|###....####',
  B: '#######...|.##...##..|.##....##.|.##....##.|.##...##..|.#######..|.##....##.|.##.....##|.##.....##|.##....##.|########..',
  D: '#######....|.##....##..|.##.....##.|.##......##|.##......##|.##......##|.##......##|.##......##|.##.....##.|.##....##..|#######....',
  E: '#########|.##.....#|.##......|.##......|.##...#..|.######..|.##...#..|.##......|.##......|.##.....#|#########',
  F: '#########|.##.....#|.##......|.##......|.##...#..|.######..|.##...#..|.##......|.##......|.##......|####.....',
  G: '...######.|.##.....##|##.......#|##........|##........|##...#####|##.....##.|##.....##.|##.....##.|.##....##.|...#####..',
  H: '####...####|.##.....##.|.##.....##.|.##.....##.|.##.....##.|.#########.|.##.....##.|.##.....##.|.##.....##.|.##.....##.|####...####',
  I: '####|.##.|.##.|.##.|.##.|.##.|.##.|.##.|.##.|.##.|####',
  L: '####.....|.##......|.##......|.##......|.##......|.##......|.##......|.##......|.##......|.##.....#|#########',
  M: '###.......###|.##.......##.|.###.....###.|.#.##...#.##.|.#.##...#.##.|.#..##.#..##.|.#..##.#..##.|.#...###..##.|.#...##...##.|.#....#...##.|###...#..####',
  N: '###.....###|.##......#.|.###.....#.|.#.##....#.|.#..##...#.|.#...##..#.|.#....##.#.|.#.....###.|.#......##.|.#.......#.|###......#.',
  O: '...#####...|..##...##..|.##.....##.|##.......##|##.......##|##.......##|##.......##|##.......##|.##.....##.|..##...##..|...#####...',
  P: '#######...|.##...##..|.##....##.|.##....##.|.##...##..|.######...|.##.......|.##.......|.##.......|.##.......|####......',
  R: '#######...|.##...##..|.##....##.|.##....##.|.##...##..|.######...|.##..##...|.##...##..|.##...##..|.##....##.|####...###',
  S: '..####.#|.##...##|##.....#|##......|.###....|..####..|....###.|......##|#.....##|##...##.|#.####..',
  T: '##########|#...##...#|....##....|....##....|....##....|....##....|....##....|....##....|....##....|....##....|..######..',
  U: '####...###.|.##.....#..|.##.....#..|.##.....#..|.##.....#..|.##.....#..|.##.....#..|.##.....#..|.##.....#..|..##...#...|...####....',
};
const GOLD_ROWS = [P.cream, P.cream, P.yellow, P.yellow, P.yellow, P.yellow, P.yellow, P.orange, P.orange, P.orange, P.orange];
const serifWidth = (s, track) => {
  let w = 0;
  for (const ch of s) w += (ch === ' ' ? 5 : SERIF[ch].indexOf('|')) + track;
  return w - track;
};
/** Serif lettering baked once: rows tinted top to bottom, optional 1 px drop shadow. */
const LETTERING = new Map();
function serif(key, s, track, rows = GOLD_ROWS, shadow = P.black) {
  const hit = LETTERING.get(key);
  if (hit) return hit;
  const w = serifWidth(s, track);
  const cv = bake(key, w + 2, 13, (c) => {
    let x = 0;
    for (const ch of s) {
      if (ch === ' ') {
        x += 5 + track;
        continue;
      }
      const g = SERIF[ch].split('|');
      for (let pass = shadow ? 0 : 1; pass < 2; pass++) {
        for (let y = 0; y < g.length; y++) {
          c.fillStyle = pass ? rows[y] : shadow;
          for (let i = 0; i < g[y].length; i++) if (g[y][i] === '#') c.fillRect(x + i + (pass ? 0 : 1), y + (pass ? 0 : 1), 1, 1);
        }
      }
      x += g[0].length + track;
    }
  });
  LETTERING.set(key, cv);
  return cv;
}
/** Letter-spaced small caps baked once ('micro' 3x5 or 'body' 5x7); '*' draws a centred dot. */
function label(key, s, track, color, font = 'micro') {
  const hit = LETTERING.get(key);
  if (hit) return hit;
  const cap = font === 'micro' ? 5 : 7;
  const asc = font === 'micro' ? 2 : 3;
  let w = 0;
  for (const ch of s) w += (ch === ' ' ? 2 : ch === '*' ? 1 : measureText(ch, 1, font)) + track;
  const cv = bake(key, max(1, w - track + 1), cap + asc + 2, (c) => {
    let x = 0;
    for (const ch of s) {
      if (ch === ' ') x += 2 + track;
      else if (ch === '*') {
        c.fillStyle = color;
        c.fillRect(x, asc + (cap >> 1), 1, 1);
        x += 1 + track;
      } else {
        drawText(c, ch, x, asc, { color, font });
        x += measureText(ch, 1, font) + track;
      }
    }
  });
  LETTERING.set(key, cv);
  return cv;
}
/** Cached art centred on x, top at y, faded by alpha. */
function art(ctx, cv, cx, y, alpha = 1) {
  if (alpha <= 0.01) return;
  ctx.globalAlpha = min(1, alpha);
  ctx.drawImage(cv, round(cx - cv.width / 2), round(y));
  ctx.globalAlpha = 1;
}

// --- the spinner (the house emblem) ----------------------------------------------------
/** Eight dots on a ring; `lit` (float) is the head, two dots trail behind it. */
function dots(ctx, cx, cy, r, d, lit, on, mid, off) {
  const head = floor(mod(lit, 8));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU - PI / 2;
    const age = (head - k + 8) % 8;
    ellipse(ctx, cx + cos(a) * r, cy + sin(a) * r, d, d, age === 0 ? on : age <= 2 ? mid : off);
  }
}

// --- people ---------------------------------------------------------------------------
// Front-view and profile puppets measured in head heights (u). A style S holds
// colours and cut; a pose Q holds angles and blends. All writes go to pooled
// buffers, the hand positions come back in HAND.
const HAND = new Float64Array(4); // screen-left hand x, y; screen-right hand x, y
const IK = new Float64Array(2);
/** Two-bone IK: elbow for a shoulder at (jx, jy) reaching (tx, ty), bent towards the pole (px, py). */
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
  const side = (px - mx) * (-dy) + (py - my) * dx >= 0 ? 1 : -1;
  IK[0] = mx + side * (-dy / d) * h;
  IK[1] = my + side * (dx / d) * h;
}
/** Hand target swung on an arc round the shoulder (jx, jy) from A to B: reaches stay long, like a pendulum. */
function swing(out, jx, jy, ax, ay, bx, by, p) {
  const ra = hypot(ax - jx, ay - jy);
  const rb = hypot(bx - jx, by - jy);
  const aa = atan2(ay - jy, ax - jx);
  let ab = atan2(by - jy, bx - jx);
  if (ab - aa > PI) ab -= TAU;
  else if (aa - ab > PI) ab += TAU;
  const a = aa + (ab - aa) * p;
  const r = ra + (rb - ra) * p;
  out[0] = jx + cos(a) * r;
  out[1] = jy + sin(a) * r;
  return out;
}
/** Upper arm, forearm, cuff and hand from shoulder (jx, jy) via elbow (ex, ey) to wrist (wx, wy). */
function armParts(ctx, jx, jy, ex, ey, wx, wy, u, S, finger, slot, far) {
  const top = far ? S.topS : S.top;
  const shade = far ? S.topF || S.topS : S.topS;
  limb(ctx, jx, jy, ex, ey, 0.22 * u, 0.19 * u, top, shade);
  limb(ctx, ex, ey, wx, wy, 0.19 * u, 0.15 * u, top, shade);
  const len = hypot(wx - ex, wy - ey) || 1;
  const dx = (wx - ex) / len;
  const dy = (wy - ey) / len;
  if (S.cuff) capsule(ctx, wx - dx * 0.1 * u, wy - dy * 0.1 * u, wx, wy, 0.15 * u, 0.15 * u, S.cuff);
  const tx = wx + dx * 0.38 * u;
  const ty = wy + dy * 0.38 * u;
  capsule(ctx, wx, wy, tx, ty, 0.15 * u, 0.12 * u, S.hand || S.skin);
  if (finger > 0.05) line(ctx, tx, ty, tx + dx * 0.4 * u * finger, ty + dy * 0.4 * u * finger, S.hand || S.skin);
  HAND[slot] = tx;
  HAND[slot + 1] = ty;
}
/**
 * Front arm by angles: a = upper arm from hanging (+ outward), b = elbow bend
 * (+ folds the forearm in and up), fl = forearm foreshortening (1 = flat).
 */
function armFront(ctx, x, fy, u, S, sd, a, b, fl, finger, lift) {
  const jx = x + sd * (S.sw - 0.17) * u;
  const jy = fy - 5.25 * u - lift;
  const ex = jx + sd * sin(a) * 1.18 * u;
  const ey = jy + cos(a) * 1.18 * u;
  const f2 = a - b;
  const wx = ex + sd * sin(f2) * 0.98 * u * fl;
  const wy = ey + cos(f2) * 0.98 * u * fl;
  armParts(ctx, jx, jy, ex, ey, wx, wy, u, S, finger, sd < 0 ? 0 : 2, false);
}
/** Front arm reaching a hand target (tx, ty) with the elbow bending outward. */
function armReach(ctx, x, fy, u, S, sd, tx, ty, lift) {
  const jx = x + sd * (S.sw - 0.17) * u;
  const jy = fy - 5.25 * u - lift;
  ik(jx, jy, tx, ty, 1.18 * u, 0.98 * u + 0.3 * u, jx + sd * 0.7 * u, jy + 2.4 * u);
  const ex = IK[0];
  const ey = IK[1];
  const len = hypot(tx - ex, ty - ey) || 1;
  const k = (0.98 * u) / (0.98 * u + 0.3 * u);
  armParts(ctx, jx, jy, ex, ey, ex + (tx - ex) * k, ey + (ty - ey) * k, u, S, 0, sd < 0 ? 0 : 2, false);
  return len;
}
function hairFront(ctx, hx, hy, rx, ry, u, S) {
  NP = 0;
  for (let i = 0; i <= 8; i++) {
    const a = PI + (i / 8) * PI;
    pt(hx + cos(a) * (rx + 0.5), hy + sin(a) * (ry + 0.45));
  }
  pt(hx + rx + 0.3, hy + 0.06 * u);
  pt(hx + rx * 0.72, hy - 0.2 * u);
  pt(hx + rx * 0.1, hy - 0.28 * u);
  pt(hx - rx * 0.45, hy - 0.25 * u);
  pt(hx - rx - 0.3, hy + 0.08 * u);
  fillPts(ctx, S.hair);
  // silver rim light on the crown (art direction: 1 px, every head)
  R(ctx, round(hx - rx * 0.35), round(hy - ry - 0.45), max(2, round(rx * 0.95)), 1, A(P.silver, 0.6));
}
/**
 * Front-view adult (or seen from behind with S.back). Q: breath 0..1, turn
 * -1..1, down 0..1 (looking down), eyes 0..1, look -1..1. Arms by screen side
 * (0 = screen left, 1 = screen right): by angles a/b/fl (+ finger0) or by a
 * hand target reach0 / reach1 ([x, y] or null).
 */
function frontPerson(ctx, x, fy, u, S, Q) {
  const lift = (Q.breath || 0) * 0.45;
  const sw = S.sw * u;
  if (S.legs) {
    for (let sd = -1; sd <= 1; sd += 2) {
      const hx = x + sd * 0.27 * u;
      const kx = x + sd * 0.25 * u;
      const ax = x + sd * 0.23 * u;
      limb(ctx, hx, fy - 3.3 * u, kx, fy - 1.75 * u, 0.3 * u, 0.22 * u, S.legs, S.legsS);
      limb(ctx, kx, fy - 1.75 * u, ax, fy - 0.3 * u, 0.2 * u, 0.13 * u, S.legs, S.legsS);
      ellipse(ctx, ax + sd * 0.05 * u, fy - 0.13 * u, 0.2 * u, 0.13 * u, S.shoe);
    }
  }
  const nY = fy - 5.66 * u - lift;
  const sY = fy - 5.4 * u - lift;
  const hemY = fy - S.hem * u;
  NP = 0;
  pt(x - 0.19 * u, nY);
  pt(x - sw * 0.6, nY + 0.1 * u);
  pt(x - sw, sY);
  pt(x - sw + 0.07 * u, fy - 4.9 * u);
  pt(x - S.ww * u, fy - 3.95 * u);
  pt(x - S.hw * u, hemY);
  pt(x + S.hw * u, hemY);
  pt(x + S.ww * u, fy - 3.95 * u);
  pt(x + sw - 0.07 * u, fy - 4.9 * u);
  pt(x + sw, sY);
  pt(x + sw * 0.6, nY + 0.1 * u);
  pt(x + 0.19 * u, nY);
  fillPts(ctx, S.top);
  // the far side falls into shade (key light from camera left)
  pt(x + sw * 0.3, nY + 0.1 * u);
  pt(x + sw * 0.6, nY + 0.1 * u);
  pt(x + sw, sY);
  pt(x + sw - 0.07 * u, fy - 4.9 * u);
  pt(x + S.ww * u, fy - 3.95 * u);
  pt(x + S.hw * u, hemY);
  pt(x + S.hw * u * 0.42, hemY);
  pt(x + S.ww * u * 0.38, fy - 3.95 * u);
  fillPts(ctx, S.topS);
  if (!S.back) {
    pt(x - 0.2 * u, nY);
    pt(x + 0.2 * u, nY);
    pt(x, fy - S.v * u);
    fillPts(ctx, S.shirt);
    if (S.vest) {
      pt(x - 0.12 * u, fy - (S.v + 0.5) * u);
      pt(x + 0.12 * u, fy - (S.v + 0.5) * u);
      pt(x, fy - (S.v - 0.05) * u);
      fillPts(ctx, S.vest);
    }
    R(ctx, round(x), round(fy - S.v * u), 1, max(1, round((S.v - S.hem) * u)), S.topS);
    if (S.bow) R(ctx, round(x - 1), round(nY + 1), 3, 1, S.bow);
    if (S.buttons) for (let k = 0; k < 3; k++) R(ctx, round(x + 1), round(fy - (S.v - 0.5 - k * 0.45) * u), 1, 1, S.buttons);
  } else if (S.belt) {
    R(ctx, round(x - S.ww * u), round(fy - 3.95 * u), round(S.ww * u * 2), 1, S.belt);
  }
  // rim light on the far shoulder
  line(ctx, x + sw * 0.55, nY + 0.12 * u, x + sw - 0.5, sY + 0.3, A(P.silver, 0.5));
  // head
  const hx = x + (Q.turn || 0) * 0.06 * u;
  const hy = fy - 6.3 * u - lift + (Q.down || 0) * 0.06 * u;
  const rx = 0.36 * u;
  const ry = 0.49 * u;
  limb(ctx, x, nY + 0.3 * u, x, hy + 0.3 * u, 0.18 * u, 0.18 * u, S.skin, S.skinS);
  if (S.back) {
    ellipse(ctx, hx, hy, rx + 0.4, ry + 0.3, S.hair);
    ellipse(ctx, hx - 0.6, hy - 0.4, rx - 0.6, ry - 0.6, S.hairL || S.hair);
    if (S.bun) {
      ellipse(ctx, hx, hy - 0.12 * u, 0.22 * u, 0.2 * u, S.hairS || S.hair);
      R(ctx, round(hx - 0.1 * u), round(hy - 0.3 * u), 2, 1, A(P.silver, 0.45));
    }
    R(ctx, round(hx - rx * 0.4), round(hy - ry - 0.3), max(2, round(rx)), 1, A(P.silver, 0.55));
    if (S.collar) capsule(ctx, x - 0.3 * u, nY + 0.15 * u, x + 0.3 * u, nY + 0.15 * u, 0.16 * u, 0.16 * u, S.collar);
  } else {
    ellipse(ctx, hx, hy, rx, ry, S.skinS);
    ellipse(ctx, hx - 0.6, hy - 0.2, rx - 0.6, ry - 0.3, S.skin);
    R(ctx, round(hx - rx - 0.6), round(hy - 0.04 * u), 1, max(1, round(0.16 * u)), S.skin);
    R(ctx, round(hx + rx - 0.2), round(hy - 0.04 * u), 1, max(1, round(0.16 * u)), S.skinS);
    hairFront(ctx, hx, hy, rx, ry, u, S);
    // face: small dark eyes (no whites), a nose shadow, a quiet mouth
    const ey = round(hy + 0.03 * u + (Q.down || 0) * 0.04 * u);
    const lk = (Q.look || 0) * 0.6;
    const exL = round(hx - 0.17 * u + lk);
    const exR = round(hx + 0.11 * u + lk);
    const open = (Q.eyes ?? 1) > 0.5 && !(Q.down > 0.5);
    const big = u >= 13 ? 1 : 0;
    R(ctx, exL - big, ey, 1 + big, 1, open ? S.eye || P.black : S.skinS);
    R(ctx, exR, ey, 1 + big, 1, open ? S.eye || P.black : S.skinS);
    if (S.brows) {
      const by = ey - max(2, round(0.14 * u)) + (Q.down > 0.5 ? 1 : 0);
      R(ctx, exL - 1 - big, by, 2 + big, 1, S.brows);
      R(ctx, exR, by, 2 + big, 1, S.brows);
    }
    R(ctx, round(hx + 0.02 * u), round(hy + 0.12 * u), 1, 1 + big, S.skinS);
    R(ctx, round(hx - 0.08 * u), round(hy + 0.31 * u), max(2, round(0.17 * u)), 1, S.mouth || S.skinS);
  }
  // arms last: they hang over the coat and gesture in front of it (or the
  // caller draws them later with frontArms, after a desk or a table)
  if (Q.arms !== false) frontArms(ctx, x, fy, u, S, Q);
}
function frontArms(ctx, x, fy, u, S, Q) {
  const lift = (Q.breath || 0) * 0.45;
  if (Q.reach1) armReach(ctx, x, fy, u, S, 1, Q.reach1[0], Q.reach1[1], lift);
  else armFront(ctx, x, fy, u, S, 1, Q.a1 ?? 0.12, Q.b1 ?? 0.1, Q.fl1 ?? 1, 0, lift);
  if (Q.reach0) armReach(ctx, x, fy, u, S, -1, Q.reach0[0], Q.reach0[1], lift);
  else armFront(ctx, x, fy, u, S, -1, Q.a0 ?? 0.12, Q.b0 ?? 0.1, Q.fl0 ?? 1, Q.finger0 || 0, lift);
}

// Profile torso outline in (along the spine 0..1, across in u; + is the front).
const TORSO_F = [0, -0.45, 0.35, -0.34, 0.7, -0.4, 0.95, -0.28, 1.02, -0.12, 1.02, 0.1, 0.93, 0.26, 0.72, 0.5, 0.52, 0.33, 0.33, 0.3, 0, 0.4];
function legSide(ctx, hx, hy, u, S, f, th, kn, far) {
  const kx = hx + f * sin(th) * 1.6 * u;
  const ky = hy + cos(th) * 1.6 * u;
  const sa = th - kn;
  const ax = kx + f * sin(sa) * 1.5 * u;
  const ay = ky + cos(sa) * 1.5 * u;
  const base = far ? S.legsS : S.legs;
  const shade = far ? S.legsF || S.legsS : S.legsS;
  limb(ctx, hx, hy, kx, ky, 0.3 * u, 0.21 * u, base, shade);
  limb(ctx, kx, ky, ax, ay, 0.2 * u, 0.13 * u, base, shade);
  const fx = f * cos(sa);
  const fyy = -sin(sa);
  capsule(ctx, ax - fx * 0.12 * u, ay - fyy * 0.12 * u + 0.08 * u, ax + fx * 0.7 * u, ay + fyy * 0.7 * u + 0.08 * u, 0.15 * u, 0.11 * u, S.shoe);
  return ky;
}
function armSide(ctx, sx, sy, u, S, f, a, e, far, slot) {
  const ex = sx + f * sin(a) * 1.18 * u;
  const ey = sy + cos(a) * 1.18 * u;
  const fa = a + e;
  armParts(ctx, sx, sy, ex, ey, ex + f * sin(fa) * 0.98 * u, ey + cos(fa) * 0.98 * u, u, S, 0, slot, far);
}
/**
 * Profile adult facing f (+1 right). Q: lean (rad, + forward), hipX/hipY (u),
 * thN/knN, thF/knF (thigh from vertical + forward, knee bend), aN/eN, aF/eF
 * (upper arm from hanging + forward, elbow bend + forward), head (tilt).
 */
function sidePerson(ctx, x, fy, u, S, Q, f) {
  const lean = Q.lean || 0;
  const hx = x + (Q.hipX || 0) * u;
  const hy = fy - 3.3 * u + (Q.hipY || 0) * u;
  const ux = f * sin(lean);
  const uy = -cos(lean);
  const nx = f * cos(lean);
  const ny = sin(lean);
  const T = 2.15 * u;
  const sx = hx + ux * T * 0.9 - nx * 0.04 * u;
  const sy = hy + uy * T * 0.9 - ny * 0.04 * u;
  armSide(ctx, sx, sy, u, S, f, Q.aF || 0, Q.eF || 0, true, 2);
  const k1 = legSide(ctx, hx, hy, u, S, f, Q.thF || 0, Q.knF || 0, true);
  const k2 = legSide(ctx, hx, hy, u, S, f, Q.thN || 0, Q.knN || 0, false);
  for (let i = 0; i < TORSO_F.length; i += 2) pt(hx + ux * TORSO_F[i] * T + nx * TORSO_F[i + 1] * u, hy + uy * TORSO_F[i] * T + ny * TORSO_F[i + 1] * u);
  fillPts(ctx, S.top);
  if (S.skirt) {
    // a skirt hangs from the waist to just below the knees
    const wbx = hx + ux * 0.3 * T - nx * 0.36 * u;
    const wby = hy + uy * 0.3 * T - ny * 0.36 * u;
    const wfx = hx + ux * 0.3 * T + nx * 0.34 * u;
    const wfy = hy + uy * 0.3 * T + ny * 0.34 * u;
    const kN = hx + f * sin(Q.thN || 0) * 1.6 * u;
    const kF = hx + f * sin(Q.thF || 0) * 1.6 * u;
    const kx = (f > 0 ? max(kN, kF) : min(kN, kF)) + f * 0.42 * u;
    const kY = max(k1, k2) + 0.35 * u;
    pt(wbx, wby);
    pt(wfx, wfy);
    pt(kx, kY);
    pt(min(hx, wbx) * (f > 0 ? 1 : 0) + max(hx, wbx) * (f > 0 ? 0 : 1) - f * 0.5 * u, kY);
    fillPts(ctx, S.skirt);
    if (S.apron) {
      pt(wfx, wfy);
      pt(wfx - nx * 0.4 * u, wfy - ny * 0.4 * u);
      pt(kx - f * 0.55 * u, kY - 0.15 * u);
      pt(kx, kY - 0.15 * u);
      fillPts(ctx, S.apron);
    }
  }
  if (S.apron) {
    // bib
    pt(hx + ux * 0.32 * T + nx * 0.33 * u, hy + uy * 0.32 * T + ny * 0.33 * u);
    pt(hx + ux * 0.7 * T + nx * 0.49 * u, hy + uy * 0.7 * T + ny * 0.49 * u);
    pt(hx + ux * 0.72 * T + nx * 0.22 * u, hy + uy * 0.72 * T + ny * 0.22 * u);
    pt(hx + ux * 0.32 * T + nx * 0.08 * u, hy + uy * 0.32 * T + ny * 0.08 * u);
    fillPts(ctx, S.apron);
  }
  // rim light down the back
  line(ctx, hx + ux * 0.98 * T - nx * 0.2 * u, hy + uy * 0.98 * T - ny * 0.2 * u, hx + ux * 0.62 * T - nx * 0.42 * u, hy + uy * 0.62 * T - ny * 0.42 * u, A(P.silver, 0.4));
  // neck and head
  const nkx = hx + ux * T;
  const nky = hy + uy * T;
  const ha = lean + (Q.head || 0);
  const hux = f * sin(ha);
  const huy = -cos(ha);
  const hnx = f * cos(ha);
  const hny = sin(ha);
  limb(ctx, nkx, nky, nkx + hux * 0.4 * u, nky + huy * 0.4 * u, 0.17 * u, 0.17 * u, S.skin, S.skinS);
  if (S.collar) capsule(ctx, nkx - hnx * 0.15 * u, nky - hny * 0.15 * u, nkx + hnx * 0.2 * u, nky + hny * 0.2 * u, 0.13 * u, 0.13 * u, S.collar);
  const cx = nkx + hux * 0.8 * u + hnx * 0.06 * u;
  const cy = nky + huy * 0.8 * u + hny * 0.06 * u;
  ellipseAx(ctx, cx - hnx * 0.1 * u + hux * 0.06 * u, cy - hny * 0.1 * u + huy * 0.06 * u, hnx, hny, 0.47 * u, 0.5 * u, S.hair);
  ellipseAx(ctx, cx + hnx * 0.08 * u - hux * 0.05 * u, cy + hny * 0.08 * u - huy * 0.05 * u, hnx, hny, 0.38 * u, 0.43 * u, S.skin);
  // nose, eye, ear
  R(ctx, round(cx + hnx * 0.47 * u - hux * 0.04 * u), round(cy + hny * 0.47 * u - huy * 0.04 * u), 1, 1, S.skin);
  R(ctx, round(cx + hnx * 0.26 * u + hux * 0.06 * u), round(cy + hny * 0.26 * u + huy * 0.06 * u), 1, 1, (Q.eyes ?? 1) > 0.5 ? P.black : S.skinS);
  R(ctx, round(cx - hnx * 0.06 * u), round(cy - hny * 0.06 * u), 1, 1, S.skinS);
  if (S.bun) ellipseAx(ctx, cx - hnx * 0.46 * u + hux * 0.12 * u, cy - hny * 0.46 * u + huy * 0.12 * u, hnx, hny, 0.17 * u, 0.17 * u, S.hairS || S.hair);
  R(ctx, round(cx + hux * 0.5 * u - hnx * 0.1 * u), round(cy + huy * 0.5 * u - hny * 0.1 * u), 2, 1, A(P.silver, 0.5));
  armSide(ctx, sx, sy, u, S, f, Q.aN || 0, Q.eN || 0, false, 0);
}

// Wardrobe (palette tokens only).
const DOORMAN = {
  sw: 0.84, ww: 0.56, hw: 0.7, hem: 1.6, v: 5.45, legs: P.black, legsS: P.black, shoe: P.black,
  top: P.maroon, topS: P.black, shirt: P.cream, buttons: P.yellow, skin: P.tan, skinS: P.tanShade,
  hair: P.black, hand: P.silver, cuff: P.maroon, mouth: P.tanShade,
};
const CONCIERGE = {
  sw: 0.86, ww: 0.54, hw: 0.6, hem: 3.0, v: 4.7, top: P.ink, topS: P.black, shirt: P.white, vest: P.slate,
  bow: P.black, skin: P.skin, skinS: P.skinShade, hair: P.silver, brows: P.fog, cuff: P.white, mouth: P.skinShade,
};
const GUEST = {
  back: true, sw: 0.74, ww: 0.47, hw: 0.72, hem: 1.25, legs: P.black, legsS: P.black, shoe: P.black,
  top: P.tan, topS: P.tanShade, belt: P.tanShade, skin: P.skin, skinS: P.skinShade, hair: P.brown, hairL: P.brown,
  hairS: P.maroon, bun: true, collar: P.tanShade, hand: P.skin, cuff: P.tan,
};
const MAID = {
  sw: 0.7, top: P.black, topS: P.black, topF: P.black, skirt: P.black, apron: P.cream, legs: P.black, legsS: P.black,
  shoe: P.black, skin: P.skin, skinS: P.skinShade, hair: P.tanShade, hairS: P.brown, bun: true, collar: P.white,
  cuff: P.white,
};
const DINER = {
  sw: 0.88, ww: 0.56, hw: 0.6, hem: 3.0, v: 4.75, top: P.ink, topS: P.black, shirt: P.white, bow: P.black,
  skin: P.tan, skinS: P.tanShade, hair: P.black, brows: P.black, cuff: P.white, mouth: P.tanShade,
};
const WAITER = {
  sw: 0.84, ww: 0.54, hw: 0.58, hem: 3.1, v: 5.0, legs: P.black, legsS: P.black, shoe: P.black, top: P.silver, topS: P.fog, shirt: P.white, bow: P.black,
  skin: P.skin, skinS: P.skinShade, hair: P.brown, brows: P.brown, hand: P.white, cuff: P.silver, mouth: P.skinShade,
  buttons: P.steel,
};
// Pose objects are module state, rewritten every frame (no allocation).
const QD = {};
const QC = {};
const QG = {};
const QM = {};
const QN = {};
const QW = {};
const REACH = [0, 0];

// --- 1. exterior: rain, a crane down the facade ----------------------------------------
const FAC_H = 300;
const GROUND = 268;
function winBake(c, x, y, w, h, state) {
  R(c, x - 1, y - 1, w + 2, h + 2, P.black);
  if (state === 2) {
    R(c, x, y, w, h, P.orange);
    R(c, x + 1, y + 1, w - 2, h - 2, P.yellow);
    R(c, x + 2, y + 2, w - 4, max(1, round(h * 0.3)), P.cream);
    R(c, x, y, 2, h, P.darkRed);
    R(c, x + w - 2, y, 2, h, P.darkRed);
  } else if (state === 1) {
    R(c, x, y, w, h, P.brown);
    R(c, x + 1, y + 1, w - 2, round(h * 0.4), P.tanShade);
  } else {
    R(c, x, y, w, h, P.ink);
    R(c, x + w - 3, y + 1, 1, round(h * 0.45), A(P.steel, 0.7));
  }
  R(c, x + floor(w / 2), y, 1, h, P.black);
  R(c, x, y + round(h * 0.36), w, 1, P.black);
  R(c, x - 2, y + h + 1, w + 4, 1, P.steel);
  R(c, x - 2, y + h + 2, w + 4, 1, P.black);
}
function cornice(c, x, y, w) {
  R(c, x - 2, y, w + 4, 1, P.fog);
  R(c, x - 2, y + 1, w + 4, 2, P.steel);
  R(c, x - 2, y + 3, w + 4, 1, P.black);
  for (let k = x; k < x + w; k += 4) R(c, k, y + 4, 2, 1, P.ink);
}
const facade = () => bake('gb-facade', W, FAC_H, (c) => {
  bands(c, 0, 0, W, 210, [P.black, P.black, P.black, P.ink]);
  R(c, 0, 210, W, FAC_H - 210, P.ink);
  for (let i = 0; i < 16; i++) R(c, floor(hash(i) * W), floor(hash(i + 40) * 70), 1, 1, A(P.fog, 0.35 + hash(i + 9) * 0.3));
  // the neighbours, dark
  R(c, 0, 126, 22, 174, P.black);
  R(c, 362, 114, 22, 186, P.black);
  for (let k = 0; k < 5; k++) {
    R(c, 6, 140 + k * 24, 6, 9, k === 2 ? P.brown : P.ink);
    R(c, 370, 128 + k * 24, 6, 9, k === 3 ? P.brown : P.ink);
  }
  // wings
  for (const x0 of [22, 270]) {
    const w = 92;
    R(c, x0, 104, w, GROUND - 104, P.slate);
    // mansard roof with dormers
    pt(x0 - 2, 104);
    pt(x0 + 6, 84);
    pt(x0 + w - 6, 84);
    pt(x0 + w + 2, 104);
    fillPts(c, P.ink);
    R(c, x0 + 6, 84, w - 12, 1, P.steel);
    for (let k = 0; k < 4; k++) {
      const dx = x0 + 12 + k * 22;
      R(c, dx - 1, 88, 10, 14, P.slate);
      R(c, dx - 2, 87, 12, 1, P.fog);
      winBake(c, dx + 1, 91, 6, 8, (k + (x0 > 200 ? 1 : 0)) % 3 === 0 ? 2 : 0);
    }
    cornice(c, x0, 104, w);
    for (let fl = 0; fl < 4; fl++) {
      const wy = 114 + fl * 27;
      for (let b = 0; b < 5; b++) {
        const wx = x0 + 7 + b * 17;
        const hsh = hash(fl * 13 + b * 7 + (x0 > 200 ? 101 : 0));
        winBake(c, wx, wy, 9, 16, hsh > 0.55 ? 2 : hsh > 0.35 ? 1 : 0);
      }
      R(c, x0, wy + 21, w, 1, P.steel);
      R(c, x0, wy + 22, w, 1, P.ink);
    }
    // quoins at the corners
    for (let y = 108; y < 222; y += 6) {
      R(c, x0, y, 4, 4, P.steel);
      R(c, x0 + w - 4, y + 3, 4, 4, P.steel);
    }
  }
  // central pavilion
  const px = 114;
  const pw = 156;
  R(c, px, 72, pw, GROUND - 72, P.slate);
  pt(px - 3, 74);
  pt(px + 10, 46);
  pt(px + pw - 10, 46);
  pt(px + pw + 3, 74);
  fillPts(c, P.ink);
  for (let k = 0; k < 4; k++) R(c, px + 12 + k * 2, 50 + k * 6, pw - 24 - k * 4, 1, A(P.slate, 0.8));
  R(c, px + 10, 46, pw - 20, 1, P.steel);
  // oculus
  for (const ox of [px + 40, px + pw - 40]) {
    c.fillStyle = P.black;
    c.fillRect(ox - 5, 56, 10, 10);
    R(c, ox - 4, 57, 8, 8, P.brown);
    R(c, ox - 3, 58, 6, 3, P.yellow);
  }
  // the roof sign: gold serif letters on a slim black frame
  const sign = serif('gb-roof', 'THE GRAND BUFFER', 1);
  const sx = round(192 - sign.width / 2);
  R(c, sx - 4, 41, sign.width + 8, 2, P.black);
  for (let k = sx; k < sx + sign.width; k += 14) R(c, k, 41, 1, 6, P.black);
  c.globalAlpha = 0.07;
  c.fillStyle = P.yellow;
  c.fillRect(sx - 6, 24, sign.width + 12, 18);
  c.globalAlpha = 1;
  c.drawImage(sign, sx, 28);
  cornice(c, px, 72, pw);
  // pilasters
  for (const x of [px + 2, px + 34, px + pw - 40, px + pw - 8]) {
    R(c, x, 78, 6, 144, P.steel);
    R(c, x, 78, 1, 144, P.fog);
    R(c, x + 5, 78, 1, 144, P.ink);
  }
  for (let fl = 0; fl < 5; fl++) {
    const wy = 82 + fl * 27;
    for (let b = 0; b < 4; b++) {
      const wx = px + 12 + b * 37 + (b > 1 ? 4 : 0) - (b === 0 ? 0 : 0);
      if (b === 0 || b === 3) {
        winBake(c, wx + 1, wy + 2, 12, 17, hash(fl * 5 + b + 300) > 0.45 ? 2 : 1);
      } else {
        winBake(c, wx + 6, wy, 14, 20, hash(fl * 5 + b + 200) > 0.3 ? 2 : 1);
        if (fl === 1) {
          // balcony
          R(c, wx + 2, wy + 22, 22, 1, P.black);
          for (let k = 0; k < 22; k += 3) R(c, wx + 2 + k, wy + 18, 1, 4, P.black);
          R(c, wx + 2, wy + 18, 22, 1, P.black);
        }
      }
    }
    R(c, px, wy + 24, pw, 1, P.steel);
    R(c, px, wy + 25, pw, 1, P.ink);
  }
  // ground floor: rusticated arcade
  R(c, 22, 222, 340, GROUND - 222, P.slate);
  for (let y = 226; y < GROUND; y += 6) R(c, 22, y, 340, 1, P.ink);
  R(c, 20, 221, 344, 2, P.fog);
  for (let k = 0; k < 10; k++) {
    const ax = k < 5 ? 30 + k * 17 : 278 + (k - 5) * 17;
    if (k === 4 || k === 5) continue;
    const lit = hash(k + 500) > 0.3;
    R(c, ax - 1, 231, 13, 31, P.black);
    R(c, ax, 233, 11, 29, lit ? P.brown : P.ink);
    if (lit) {
      R(c, ax + 1, 234, 9, 10, P.tanShade);
      R(c, ax + 2, 235, 7, 5, P.yellow);
      R(c, ax + 3, 235, 5, 2, P.cream);
    }
    R(c, ax + 5, 233, 1, 29, P.black);
    R(c, ax, 245, 11, 1, P.black);
    R(c, ax, 232, 11, 1, P.black);
    R(c, ax + 1, 231, 9, 1, P.black);
  }
  // the entrance: a brass revolving door under a canopy
  R(c, 172, 226, 40, GROUND - 226, P.black);
  R(c, 174, 228, 36, GROUND - 228, P.orange);
  R(c, 176, 230, 32, 26, P.yellow);
  R(c, 178, 231, 28, 8, P.cream);
  for (const x of [174, 183, 191, 200, 209]) R(c, x, 228, 1, GROUND - 228, P.tanShade);
  R(c, 172, 254, 40, 1, P.tanShade);
  // canopy
  R(c, 156, 213, 72, 9, P.black);
  R(c, 157, 214, 70, 7, P.maroon);
  R(c, 157, 214, 70, 1, P.yellow);
  R(c, 157, 220, 70, 1, P.orange);
  const cl = label('gb-canopy', 'THE GRAND BUFFER', 1, P.cream);
  c.drawImage(cl, round(192 - cl.width / 2), 215);
  R(c, 159, 222, 1, 40, P.orange);
  R(c, 224, 222, 1, 40, P.orange);
  // steps
  R(c, 164, 262, 56, 2, P.steel);
  R(c, 160, 264, 64, 2, P.slate);
  R(c, 156, 266, 72, 2, P.steel);
  // lanterns either side of the door
  for (const lx of [148, 236]) {
    glowBake(c, lx, 240, 20, 18, P.yellow, 0.3);
    R(c, lx, 246, 1, 16, P.black);
    R(c, lx - 2, 234, 5, 8, P.black);
    R(c, lx - 1, 235, 3, 6, P.cream);
    R(c, lx - 2, 233, 5, 1, P.orange);
  }
  // wet pavement, the warm lights smeared into it
  R(c, 0, GROUND, W, FAC_H - GROUND, P.black);
  R(c, 0, GROUND, W, 1, P.slate);
  R(c, 0, 292, W, 1, P.ink);
  c.globalAlpha = 0.22;
  for (let y = GROUND + 2; y < GROUND + 26; y += 2) R(c, 178, y, 28, 1, y < GROUND + 12 ? P.yellow : P.orange);
  for (const lx of [148, 236]) for (let y = GROUND + 2; y < GROUND + 18; y += 2) R(c, lx - 1, y, 3, 1, P.yellow);
  for (let k = 0; k < 10; k++) {
    const ax = k < 5 ? 30 + k * 17 : 278 + (k - 5) * 17;
    if (k === 4 || k === 5 || hash(k + 500) <= 0.3) continue;
    for (let y = GROUND + 3; y < GROUND + 13; y += 3) R(c, ax + 3, y, 5, 1, P.tanShade);
  }
  c.globalAlpha = 1;
});
const lampHead = () => bake('gb-lamp', 15, 24, (c) => {
  R(c, 6, 10, 3, 14, P.black);
  R(c, 2, 2, 11, 9, P.black);
  R(c, 3, 3, 9, 7, P.cream);
  R(c, 4, 3, 7, 2, P.white);
  R(c, 1, 1, 13, 1, P.black);
  R(c, 5, 0, 5, 1, P.black);
});
const LAMP_X = [16, 368];
function shotExterior(ctx, lt) {
  const camY = round(84 * io(prog(lt, 0.15, 3.85)));
  ctx.drawImage(facade(), 0, -camY);
  // someone on the fourth floor turns in for the night: one window dims, slowly
  const off = ramp(lt, 2.2, 2.9);
  if (off > 0) {
    ctx.globalAlpha = off;
    R(ctx, 210, 163 - camY, 14, 20, P.brown);
    R(ctx, 211, 164 - camY, 12, 8, P.tanShade);
    R(ctx, 217, 163 - camY, 1, 20, P.black);
    R(ctx, 210, 170 - camY, 14, 1, P.black);
    ctx.globalAlpha = 1;
  }
  // doorman by the door: still, breathing, he turns his head a touch to us
  QD.breath = (1 - cos(lt * 1.6)) / 2;
  QD.turn = -ramp(lt, 2.4, 3.4) * 0.6;
  QD.a0 = 0.08;
  QD.b0 = 0.05;
  QD.a1 = 0.08;
  QD.b1 = 0.05;
  QD.reach0 = null;
  frontPerson(ctx, 226, 265 - camY, 5.6, DOORMAN, QD);
  // foreground lamp posts rise faster than the facade (parallax)
  for (let i = 0; i < 2; i++) {
    const lx = LAMP_X[i];
    const y = round(236 - camY * 1.35);
    const lc = lampHead();
    if (y < H) {
      ctx.globalAlpha = 0.08;
      ellipse(ctx, lx, y + 6, 22, 18, P.yellow);
      ctx.globalAlpha = 1;
      ctx.drawImage(lc, lx - 7, y);
      R(ctx, lx - 1, y + 24, 3, H, P.black);
    }
  }
  rain(ctx, lt, 0.3);
  // the dateline super, letter-spaced, fades in and out
  art(ctx, label('gb-geneva', 'GENEVA * SINCE 1897', 3, P.cream), 192, 197, ramp(lt, 2.8, 3.4));
}
function rain(ctx, lt, a) {
  ctx.fillStyle = A(P.fog, a);
  for (let i = 0; i < 64; i++) {
    const sp = 230 + hash(i + 7) * 90;
    const len = 4 + floor(hash(i + 3) * 4);
    const y = mod(hash(i + 11) * 400 + lt * sp, H + 16) - 8;
    const x = mod(hash(i) * W - y * 0.18 - lt * 20, W);
    ctx.fillRect(round(x), round(y), 1, len);
  }
}

// --- 2. the lobby: the bell, the finger ------------------------------------------------
// A medium two-shot over the reception desk, so the gag reads: the guest (from
// behind, left) taps the bell; the concierge goes on writing and raises one
// finger beside his face. The house clock between them is the spinner.
const LW = W + 24;
const CLOCK_X = 180;
const CLOCK_Y = 44;
const lobby = () => bake('gb-lobby', LW, H, (c) => {
  R(c, 0, 0, LW, H, P.ink);
  R(c, 0, 0, LW, 10, P.black);
  R(c, 0, 10, LW, 2, P.brown);
  R(c, 0, 12, LW, 1, P.orange);
  R(c, 0, 13, LW, 1, P.black);
  for (let x = 6; x < LW; x += 52) {
    R(c, x, 22, 44, 78, P.ink);
    R(c, x, 22, 44, 1, P.slate);
    R(c, x, 22, 1, 78, P.slate);
    R(c, x, 99, 44, 1, P.black);
    R(c, x + 43, 22, 1, 78, P.black);
  }
  // sconce at the far left
  glowBake(c, 36, 44, 46, 40, P.yellow, 0.22);
  R(c, 35, 46, 3, 9, P.orange);
  R(c, 34, 40, 5, 6, P.cream);
  R(c, 35, 39, 3, 1, P.white);
  // key cabinet behind the concierge's shoulder
  const kx = 286;
  R(c, kx, 18, 88, 80, P.maroon);
  R(c, kx + 2, 20, 84, 76, P.brown);
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 10; col++) {
      const cx = kx + 4 + col * 8;
      const cy = 22 + row * 10 + 1;
      R(c, cx, cy, 7, 9, P.black);
      if (hash(row * 10 + col + 33) > 0.3) {
        R(c, cx + 3, cy + 2, 1, 3, P.orange);
        R(c, cx + 2, cy + 5, 3, 2, P.cream);
      }
    }
  }
  R(c, kx + 2, 20, 84, 1, P.tanShade);
  // the clock: brass bezel, cream face; the eight dots are drawn live
  glowBake(c, CLOCK_X, CLOCK_Y, 40, 34, P.yellow, 0.1);
  ellipse(c, CLOCK_X, CLOCK_Y, 22, 22, P.maroon);
  ellipse(c, CLOCK_X, CLOCK_Y, 19, 19, P.tanShade);
  ellipse(c, CLOCK_X, CLOCK_Y, 18, 18, P.orange);
  ellipse(c, CLOCK_X - 0.5, CLOCK_Y - 0.5, 17, 17, P.yellow);
  ellipse(c, CLOCK_X, CLOCK_Y, 15, 15, P.cream);
  ellipse(c, CLOCK_X + 1, CLOCK_Y + 1, 14, 14, A(P.tan, 0.35));
  ellipse(c, CLOCK_X, CLOCK_Y, 14, 14, P.cream);
  // desk lamp light on the wall
  glowBake(c, 330, 84, 44, 30, P.yellow, 0.2);
});
const desk = () => bake('gb-desk', LW, H, (c) => {
  R(c, 0, 103, LW, 1, P.white);
  R(c, 0, 104, LW, 3, P.cream);
  R(c, 0, 107, LW, 1, P.tan);
  R(c, 0, 108, LW, 1, P.yellow);
  R(c, 0, 109, LW, 1, P.orange);
  R(c, 0, 110, LW, H - 110, P.brown);
  R(c, 0, 114, LW, 1, P.tanShade);
  for (let x = 6; x < LW; x += 64) {
    R(c, x, 120, 56, 96, P.maroon);
    R(c, x + 1, 121, 54, 95, P.brown);
    R(c, x + 1, 121, 54, 1, P.tanShade);
    R(c, x + 1, 121, 1, 95, P.tanShade);
  }
  shadeBake(c, 0, 110, LW, H - 110, 0.62, (x, y) => (y - 140) / 70);
  // the bell, the ledger, the lamp
  R(c, 157, 102, 13, 1, P.tanShade);
  ellipse(c, 163.5, 99.5, 5, 3.5, P.orange);
  ellipse(c, 162.5, 98.5, 3.5, 2.5, P.yellow);
  R(c, 161, 97, 2, 1, P.cream);
  R(c, 163, 94, 1, 2, P.orange);
  R(c, 216, 101, 44, 3, P.cream);
  R(c, 216, 101, 44, 1, P.white);
  R(c, 238, 101, 1, 3, P.tan);
  for (let k = 0; k < 3; k++) R(c, 220 + k * 5, 102, 3, 1, A(P.steel, 0.6));
  R(c, 329, 88, 2, 15, P.orange);
  R(c, 323, 102, 14, 2, P.orange);
  R(c, 323, 102, 14, 1, P.yellow);
  pt(320, 89);
  pt(340, 89);
  pt(336, 78);
  pt(324, 78);
  fillPts(c, P.cream);
  R(c, 324, 78, 12, 1, P.white);
  R(c, 321, 88, 18, 1, P.tan);
});
const column = () => bake('gb-column', 32, H, (c) => {
  const cols = [P.white, P.cream, P.cream, P.cream, P.cream, P.cream, P.cream, P.cream, P.cream, P.cream, P.tan, P.tan, P.tan, P.tan, P.tan, P.tanShade, P.tanShade, P.tanShade, P.brown, P.brown, P.maroon, P.maroon, P.black, P.black];
  for (let i = 0; i < cols.length; i++) R(c, 4 + i, 12, 1, 204, cols[i]);
  for (let x = 8; x < 26; x += 4) R(c, x, 12, 1, 204, A(P.black, 0.16));
  for (let k = 0; k < 6; k++) line(c, 5 + k * 3, 30 + k * 31, 14 + k * 2, 52 + k * 31, A(P.fog, 0.4));
  R(c, 0, 0, 32, 4, P.black);
  R(c, 1, 4, 30, 3, P.orange);
  R(c, 1, 4, 30, 1, P.yellow);
  R(c, 2, 7, 28, 5, P.tanShade);
  R(c, 2, 7, 28, 1, P.cream);
  shadeBake(c, 0, 0, 32, H, 0.6, (x, y) => (y - 120) / 90);
});
// The guest's arm: rest, reach, tap the bell, hold, back. Values 0..1.
const L_REACH = [0, 0, 1.0, 0, 1.6, 1, 2.05, 1, 2.65, 0];
const L_TAP = [0, 0, 1.68, 0, 1.76, 1, 1.86, 0];
const W0 = [0, 0];
const W1 = [0, 0];
function shotLobby(ctx, lt) {
  const truck = io(prog(lt, 0, 5.6));
  const off = round(4 + truck * 12);
  ctx.drawImage(lobby(), -off, 0);
  // the clock-spinner ticks round, one dot every half second
  dots(ctx, CLOCK_X - off, CLOCK_Y, 10, 2, (T_LOBBY + lt) * 2, P.black, P.steel, P.silver);
  // concierge: writes; at the bell he raises one finger without looking up
  const cx = 240 - off;
  const raise = ramp(lt, 2.4, 3.25);
  const wr = 1 - smooth(prog(lt, 2.3, 2.8)) * 0.85;
  QC.breath = (1 - cos(lt * 1.5)) / 2;
  QC.down = 1;
  QC.turn = 0;
  QC.look = 0;
  QC.arms = false;
  W1[0] = cx + 9 + sin(lt * 5.3) * 2.2 * wr;
  W1[1] = 101.5 + sin(lt * 10.6) * 0.7 * wr;
  W0[0] = cx - 9 - sin(PI * raise) * 6 - raise * 6;
  W0[1] = lerp(103, 62, raise);
  QC.reach0 = W0;
  QC.reach1 = W1;
  QC.finger0 = smooth(prog(lt, 2.95, 3.3));
  frontPerson(ctx, cx, 150, 15, CONCIERGE, QC);
  ctx.drawImage(desk(), -off, 0);
  frontArms(ctx, cx, 150, 15, CONCIERGE, QC);
  line(ctx, HAND[2], HAND[3], HAND[2] + 3, HAND[3] - 4, P.black);
  // the guest, nearer the lens, drifts a little faster with the camera
  const gx = 122 - round(truck * 16);
  const reach = keys(lt, L_REACH);
  const gl = (1 - cos(lt * 1.3 + 1)) / 2;
  swing(REACH, gx + 0.57 * 19, 228 - 5.25 * 19 - gl * 0.45, gx + 12, 228 - 2.7 * 19, 163 - off, 97, reach);
  REACH[1] += keys(lt, L_TAP) * 2;
  QG.reach1 = REACH;
  QG.breath = gl;
  QG.a0 = 0.06;
  QG.b0 = 0.1;
  QG.fl0 = 1;
  // she takes the finger in, and tilts her head a touch: patience
  QG.turn = ramp(lt, 3.5, 4.3) * 0.9;
  frontPerson(ctx, gx, 228, 19, GUEST, QG);
  ctx.drawImage(column(), -12 - round(truck * 22), 0);
}

// --- 3. the heirloom: pearls under glass, turned by hand ------------------------------
const velvet = () => bake('gb-velvet', W, H, (c) => {
  ditherField(c, 0, 0, W, H, [P.black, P.ink, P.slate], (x, y) => {
    const d = hypot((x - 236) / 210, (y - 40) / 170);
    return (1 - d) * 1.12;
  });
});
// The slow push-in scales every coordinate about the product (module state,
// so the helpers below cost no closures per frame).
const JX = 250;
const JY = 116;
let ZS = 1;
const zx = (v) => JX + (v - JX) * ZS;
const zy = (v) => JY + (v - JY) * ZS;
function gloveHand(ctx, gx, gy, s) {
  // a black tailcoat sleeve catching the key light on top, a white cuff, and a
  // white-gloved hand closed round the crank knob, knuckles to camera
  const ex = W + 44;
  const ey = gy + 34 * s;
  const wx = gx + 11 * s;
  const wy = gy + 5 * s;
  capsule(ctx, ex, ey - 2, wx + 4 * s, wy - 1, 11 * s, 7.5 * s, P.steel);
  capsule(ctx, ex, ey - 1, wx + 4 * s, wy, 11 * s, 7.5 * s, P.slate);
  capsule(ctx, ex + 1, ey + 2, wx + 5 * s, wy + 2, 10 * s, 6.5 * s, P.ink);
  capsule(ctx, wx + 3 * s, wy, wx - 1 * s, wy - 1.5 * s, 6.4 * s, 6 * s, P.silver);
  capsule(ctx, wx + 3 * s, wy - 1, wx - 1 * s, wy - 2.5 * s, 5.6 * s, 5 * s, P.white);
  // the seam between cuff and glove
  line(ctx, wx - 1.5 * s, wy - 7 * s, wx - 2.5 * s, wy + 4 * s, P.steel);
  // back of the hand
  ellipse(ctx, gx + 3.5 * s, gy + 1.5 * s, 6 * s, 5.2 * s, P.fog);
  ellipse(ctx, gx + 2.8 * s, gy + 0.6 * s, 5.4 * s, 4.6 * s, P.silver);
  // four curled fingers
  for (let k = 0; k < 4; k++) {
    const fy = gy - 2.4 * s + k * 2.2 * s;
    capsule(ctx, gx - 1 * s, fy, gx - 4.2 * s, fy + 0.8 * s, 1.4 * s, 1.2 * s, P.silver);
    R(ctx, round(gx - 4 * s), round(fy + 1.3 * s), round(3.5 * s), 1, P.fog);
  }
  // thumb over the top, a highlight on the knuckles
  capsule(ctx, gx + 3 * s, gy - 4.4 * s, gx - 2.8 * s, gy - 5.2 * s, 1.6 * s, 1.3 * s, P.silver);
  R(ctx, round(gx + 1 * s), round(gy - 6 * s), round(4 * s), 1, P.white);
  R(ctx, round(gx + 0.5 * s), round(gy - 2 * s), 1, round(6 * s), P.white);
}
function shotJewel(ctx, lt) {
  ctx.drawImage(velvet(), 0, 0);
  ZS = 1 + 0.16 * sine(lt / 4.6);
  const s = ZS;
  // pedestal: black lacquer with a gold inlay
  const pTop = zy(162);
  const pw = 46 * s;
  R(ctx, zx(JX - 46), pTop, pw * 2, H - pTop, P.black);
  R(ctx, zx(JX - 40), pTop, 7 * s, H - pTop, P.ink);
  R(ctx, zx(JX - 38), pTop, 1, H - pTop, P.steel);
  R(ctx, zx(JX + 44), pTop, 1, H - pTop, A(P.slate, 0.8));
  R(ctx, zx(JX - 46), zy(170), pw * 2, 1, P.orange);
  ellipse(ctx, JX, pTop, pw, 7 * s, P.ink);
  ellipse(ctx, JX, pTop + 0.5, pw - 1, 6 * s, P.black);
  // velvet cushion
  ellipse(ctx, JX, zy(154), 31 * s, 8 * s, P.maroon);
  ellipse(ctx, JX - 1, zy(152), 29 * s, 6 * s, P.darkRed);
  ellipse(ctx, JX - 8 * s, zy(150), 14 * s, 3 * s, A(P.red, 0.3));
  // stand
  R(ctx, round(JX - 1), zy(JY + 22), 2, zy(149) - zy(JY + 22), P.orange);
  R(ctx, round(JX - 1), zy(JY + 22), 1, zy(149) - zy(JY + 22), P.yellow);
  ellipse(ctx, JX, zy(148), 5 * s, 1.6 * s, P.orange);
  // the ring and its eight pearls
  const rr = 22 * s;
  const cy = zy(JY - 10);
  const n = ceil(TAU * rr * 1.2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const lightSide = cos(a + PI * 0.75);
    R(ctx, round(JX + cos(a) * rr), round(cy + sin(a) * rr), 1, 1, lightSide > 0.5 ? P.yellow : lightSide > -0.4 ? P.orange : P.tanShade);
  }
  // turned by hand: the crank drives the pearls (8 per turn)
  const turn = max(0, lt - 1.7) * 0.55 * TAU;
  const head = floor(mod((turn / TAU) * 8, 8));
  const pr = 4.2 * s;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU - PI / 2;
    const px = JX + cos(a) * rr;
    const py = cy + sin(a) * rr;
    const age = (head - k + 8) % 8;
    const glow = age === 0 ? 1 : age === 1 ? 0.5 : age === 2 ? 0.22 : 0;
    if (glow > 0) {
      ctx.globalAlpha = 0.16 * glow;
      ellipse(ctx, px, py, pr + 5, pr + 5, P.yellow);
      ellipse(ctx, px, py, pr + 2.5, pr + 2.5, P.yellow);
      ctx.globalAlpha = 1;
    }
    ellipse(ctx, px, py, pr + 1, pr + 1, P.orange);
    ellipse(ctx, px, py, pr, pr, P.tan);
    ellipse(ctx, px - 0.6, py - 0.6, pr - 0.8, pr - 0.8, glow > 0.9 ? P.white : P.cream);
    if (glow > 0.3 && glow < 0.9) {
      ctx.globalAlpha = 0.5;
      ellipse(ctx, px - 0.6, py - 0.6, pr - 1.4, pr - 1.4, P.white);
      ctx.globalAlpha = 1;
    }
    R(ctx, round(px - pr * 0.5), round(py - pr * 0.5), 2, 1, P.white);
    R(ctx, round(px - pr * 0.5), round(py - pr * 0.5) + 1, 1, 1, P.white);
  }
  // the bell jar: edge highlights only, like real glass
  const gl = zx(JX - 38);
  const gr = zx(JX + 38);
  const gTop = zy(80);
  const gBot = pTop - 1;
  const domeR = (gr - gl) / 2;
  ctx.globalAlpha = 0.05;
  R(ctx, gl, gTop, gr - gl, gBot - gTop, P.fog);
  ctx.globalAlpha = 1;
  ctx.fillStyle = A(P.silver, 0.3);
  ctx.fillRect(round(gl), round(gTop), 1, round(gBot - gTop));
  ctx.fillRect(round(gr), round(gTop), 1, round(gBot - gTop));
  const na = ceil(PI * domeR * 1.4);
  for (let i = 0; i <= na; i++) {
    const a = PI + (i / na) * PI;
    ctx.fillRect(round(JX + cos(a) * domeR), round(gTop + sin(a) * domeR * 0.85), 1, 1);
  }
  ctx.fillStyle = A(P.white, 0.38);
  ctx.fillRect(round(gl + 5 * s), round(gTop - domeR * 0.15), 2, round(gBot - gTop - 10));
  const nb = ceil(domeR * 0.9);
  for (let i = 0; i <= nb; i++) {
    const a = PI * 1.12 + (i / nb) * PI * 0.28;
    ctx.fillRect(round(JX + cos(a) * (domeR - 5 * s)), round(gTop + sin(a) * (domeR - 5 * s) * 0.85), 2, 1);
  }
  R(ctx, round(gl - 2), round(gBot - 1), round(gr - gl + 5), 2, P.orange);
  R(ctx, round(gl - 2), round(gBot - 1), round(gr - gl + 5), 1, P.yellow);
  ellipse(ctx, JX, gTop - domeR * 0.85 - 2, 2.5 * s, 2.5 * s, A(P.silver, 0.45));
  // brass crank on the pedestal front
  const ax = zx(JX + 26);
  const ay = zy(186);
  const hx = ax + cos(turn - PI / 2) * 8 * s;
  const hy = ay + sin(turn - PI / 2) * 8 * s;
  ellipse(ctx, ax, ay, 4 * s, 4 * s, P.tanShade);
  ellipse(ctx, ax, ay, 3 * s, 3 * s, P.orange);
  R(ctx, round(ax - 1), round(ay - 1), 1, 1, P.yellow);
  line(ctx, ax, ay, hx, hy, P.orange);
  line(ctx, ax + 1, ay, hx + 1, hy, P.tanShade);
  ellipse(ctx, hx, hy, 2 * s, 2 * s, P.yellow);
  // a gloved hand comes in from the right and takes the crank
  const reach = ramp(lt, 0.8, 1.7);
  gloveHand(ctx, lerp(W + 40, hx + 5 * s, reach), lerp(hy + 30, hy + 1, reach), s * 1.4);
  // the super: name of the piece, then the provenance
  const a1 = ramp(lt, 1.6, 2.4);
  art(ctx, serif('gb-heirloom', 'THE HEIRLOOM', 2), 92, 88, a1);
  art(ctx, serif('gb-spinner', 'SPINNER', 2), 92, 104, a1);
  if (a1 > 0) R(ctx, round(92 - 30 * a1), 121, round(60 * a1), 1, A(P.orange, 0.8));
  art(ctx, label('gb-hand', 'HAND-TURNED IN GENEVA', 1, P.silver), 92, 127, ramp(lt, 2.2, 3.0));
}

// --- 4. the suite: the pillow that is never quite done ----------------------------------
// She stands at the head of the bed (the pillow's depth) so her hands can reach it.
const suite = () => bake('gb-suite', W, H, (c) => {
  R(c, 0, 0, W, 150, P.ink);
  R(c, 0, 0, W, 10, P.black);
  R(c, 0, 10, W, 1, P.slate);
  // tall window: moonlight and a sleeping city
  R(c, 20, 20, 82, 106, P.black);
  ditherField(c, 22, 22, 78, 102, [P.ink, P.navy], (x, y) => 1 - (y - 22) / 124);
  ellipse(c, 82, 40, 6, 6, P.silver);
  ellipse(c, 81.5, 39.5, 5, 5, P.white);
  for (let k = 0; k < 9; k++) {
    const bx = 22 + k * 9;
    const bh = 12 + floor(hash(k + 70) * 24);
    R(c, bx, 124 - bh, 9, bh, P.black);
    if (hash(k + 90) > 0.4) R(c, bx + 3, 126 - bh + 4, 1, 1, P.yellow);
  }
  R(c, 60, 22, 2, 102, P.black);
  R(c, 22, 72, 78, 2, P.black);
  R(c, 18, 124, 86, 3, P.slate);
  R(c, 18, 124, 86, 1, P.fog);
  for (const [x, w] of [[6, 20], [96, 20]]) {
    R(c, x, 14, w, 136, P.maroon);
    for (let k = 2; k < w; k += 5) R(c, x + k, 14, 2, 136, P.darkRed);
    R(c, x, 14, w, 2, P.orange);
    shadeBake(c, x, 14, w, 136, 0.7, (xx, y) => (y - 90) / 60);
  }
  R(c, 2, 12, 118, 2, P.orange);
  R(c, 0, 146, W, 4, P.black);
  R(c, 0, 146, W, 1, P.slate);
  // floor: dark boards receding, moonlight lying across them
  R(c, 0, 150, W, H - 150, P.black);
  c.globalAlpha = 0.45;
  for (let k = -14; k < 16; k++) line(c, 300 + k * 26, 150, 300 + k * 26 * 1.6, H, P.maroon);
  c.globalAlpha = 1;
  glowBake(c, 92, 186, 90, 30, P.fog, 0.18);
  // headboard, tufted velvet, warmed by a sconce
  R(c, 202, 72, 182, 78, P.black);
  R(c, 204, 74, 180, 76, P.slate);
  for (let y = 80; y < 146; y += 8) for (let x = 210 + ((y / 8) % 2) * 6; x < 384; x += 12) R(c, x, y, 1, 1, P.ink);
  R(c, 204, 74, 180, 1, P.steel);
  glowBake(c, 352, 66, 70, 52, P.yellow, 0.26);
  R(c, 351, 50, 3, 8, P.orange);
  R(c, 349, 44, 7, 6, P.cream);
  R(c, 350, 43, 5, 1, P.white);
  // the bed: duvet in moonlight, the turned-down sheet, the far pillow
  pt(200, 132);
  pt(W, 132);
  pt(W, 198);
  pt(176, 198);
  fillPts(c, P.steel);
  pt(202, 134);
  pt(W, 134);
  pt(W, 160);
  pt(193, 160);
  fillPts(c, P.fog);
  R(c, 192, 160, 192, 4, P.silver);
  R(c, 191, 164, 193, 1, P.fog);
  for (let x = 210; x < W; x += 24) line(c, x, 166, x - 8, 196, A(P.slate, 0.7));
  // a dark runner thrown across the foot of the bed
  pt(186, 176);
  pt(W, 176);
  pt(W, 196);
  pt(178, 196);
  fillPts(c, P.maroon);
  R(c, 185, 176, W - 185, 1, P.darkRed);
  R(c, 180, 190, W - 180, 1, P.orange);
  pt(176, 198);
  pt(W, 198);
  pt(W, 210);
  pt(178, 210);
  fillPts(c, P.slate);
  R(c, 176, 198, W - 176, 1, P.fog);
  pt(178, 196);
  pt(W, 196);
  pt(W, 206);
  pt(179, 206);
  fillPts(c, P.black);
  R(c, 179, 196, W - 179, 1, P.maroon);
  ellipse(c, 312, 136, 22, 6, P.fog);
  ellipse(c, 311, 135, 21, 5, P.silver);
  R(c, 296, 139, 30, 1, A(P.steel, 0.6));
});
// The plumping routine, 2.2 s, then it starts again from the top.
const LOOP = 2.2;
const M_LEAN = [0, 0.1, 0.45, 0.8, 0.8, 0.14, 1.25, 0.12, 1.6, 0.78, 1.9, 0.72, 2.2, 0.1];
const M_ARM = [0, 0.25, 0.45, 0.95, 0.8, 0.8, 1.0, 0.9, 1.1, 0.75, 1.2, 0.9, 1.3, 0.8, 1.6, 0.95, 1.9, 1.0, 2.2, 0.25];
const M_ELB = [0, 0.2, 0.45, 0.3, 0.8, 0.95, 1.25, 0.95, 1.6, 0.3, 1.9, 0.35, 2.2, 0.2];
const M_PIL = [0, 0, 0.45, 0, 0.8, 1, 1.4, 1, 1.6, 0, 2.2, 0];
const PIL_X = 224;
const PIL_Y = 136;
function pillow(ctx, x, y, w, sq) {
  ellipse(ctx, x, y, w * sq, 6, P.fog);
  ellipse(ctx, x - 1, y - 1, w * sq - 1, 5, P.white);
  R(ctx, round(x - w * sq * 0.5), round(y + 3), round(w * sq), 1, A(P.steel, 0.6));
}
function shotSuite(ctx, lt) {
  ctx.drawImage(suite(), 0, 0);
  const p = mod(lt + 0.15, LOOP);
  const pil = keys(p, M_PIL);
  // on the bed the pillow sits behind her hands; held, it is in front of her
  if (pil < 0.02) pillow(ctx, PIL_X, PIL_Y, 17, 1);
  QM.lean = keys(p, M_LEAN);
  QM.hipX = -QM.lean * 0.35;
  QM.hipY = QM.lean * 0.22;
  QM.thN = -0.06 + QM.lean * 0.18;
  QM.knN = QM.lean * 0.3;
  QM.thF = 0.06 + QM.lean * 0.2;
  QM.knF = QM.lean * 0.28;
  const arm = keys(p, M_ARM);
  const elb = keys(p, M_ELB);
  const pat = (p > 0.95 && p < 1.35 ? sin(((p - 0.95) / 0.4) * TAU * 2) : 0) * 0.1;
  QM.aN = arm - QM.lean * 0.45;
  QM.eN = elb + pat;
  QM.aF = arm - QM.lean * 0.45 + 0.06;
  QM.eF = elb - pat;
  QM.head = 0.14 + QM.lean * 0.2;
  QM.eyes = 1;
  sidePerson(ctx, 172, 158, 12.6, MAID, QM, 1);
  if (pil >= 0.02) {
    const hx = (HAND[0] + HAND[2]) / 2 + 6;
    const hy = (HAND[1] + HAND[3]) / 2;
    const e = smooth(pil);
    pillow(ctx, lerp(PIL_X, hx, e), lerp(PIL_Y, hy, e), lerp(17, 12, pil), 1 - abs(pat) * 1.4);
    ellipse(ctx, HAND[0] + 1, HAND[1], 1.8, 1.6, P.skin);
  }
}

// --- 5. dinner: the cloche ---------------------------------------------------------------
const diningBack = () => bake('gb-dining', W, H, (c) => {
  R(c, 0, 0, W, H, P.maroon);
  for (let y = 4; y < 124; y += 8) for (let x = ((y / 8) % 2) * 6; x < W; x += 12) R(c, x, y, 1, 2, A(P.darkRed, 0.55));
  R(c, 0, 0, W, 8, P.black);
  R(c, 0, 8, W, 1, P.orange);
  // a dark lake at dusk in a slim gilt frame
  const fx = 214;
  const fy = 22;
  const fw = 120;
  const fh = 62;
  R(c, fx, fy, fw, fh, P.orange);
  R(c, fx, fy, fw, 1, P.yellow);
  R(c, fx + 1, fy + 1, fw - 2, fh - 2, P.tanShade);
  R(c, fx + 2, fy + 2, fw - 4, fh - 4, P.black);
  ditherField(c, fx + 3, fy + 3, fw - 6, fh - 6, [P.black, P.ink, P.slate], (x, y) => 0.95 - (y - fy) / (fh * 0.7));
  for (let k = 0; k < 4; k++) {
    pt(fx + 3 + k * 28, fy + fh - 18);
    pt(fx + 17 + k * 28, fy + fh - 30 + (k % 2) * 6);
    pt(fx + 31 + k * 28, fy + fh - 18);
    fillPts(c, P.black);
  }
  R(c, fx + 3, fy + fh - 18, fw - 6, 15, P.ink);
  R(c, fx + 3, fy + fh - 16, fw - 6, 1, A(P.steel, 0.5));
  // candlelight on the wall
  glowBake(c, 84, 100, 80, 60, P.yellow, 0.2);
  // wainscot
  R(c, 0, 118, W, 32, P.brown);
  R(c, 0, 118, W, 1, P.tanShade);
  for (let x = 8; x < W; x += 40) {
    R(c, x, 122, 32, 26, P.maroon);
    R(c, x + 1, 123, 30, 25, P.brown);
  }
});
const TABLE_Y = 148;
const diningTable = () => bake('gb-table', W, H, (c) => {
  // the top lit by the candles, the drop of the cloth in its own shade
  R(c, 0, TABLE_Y, W, 8, P.cream);
  R(c, 0, TABLE_Y, W, 1, P.white);
  R(c, 0, TABLE_Y + 8, W, H - TABLE_Y - 8, P.steel);
  R(c, 0, TABLE_Y + 8, W, 1, P.fog);
  for (let x = 10; x < W; x += 28) {
    R(c, x, TABLE_Y + 9, 1, H, P.slate);
    R(c, x + 1, TABLE_Y + 9, 1, H, A(P.fog, 0.5));
  }
  shadeBake(c, 0, TABLE_Y + 9, W, H - TABLE_Y - 9, 0.6, (x, y) => (y - TABLE_Y - 14) / 50);
  // candelabra
  const cx = 84;
  R(c, cx - 7, TABLE_Y + 1, 15, 3, P.fog);
  R(c, cx - 7, TABLE_Y + 1, 15, 1, P.white);
  R(c, cx - 1, 116, 3, 33, P.silver);
  R(c, cx, 116, 1, 33, P.white);
  R(c, cx - 16, 116, 33, 2, P.silver);
  for (const k of [-16, 0, 16]) {
    R(c, cx + k - 1, 102, 3, 14, P.cream);
    R(c, cx + k - 1, 102, 1, 14, P.white);
    R(c, cx + k - 2, 115, 5, 1, P.fog);
  }
  // the unused place setting, then the guest's plate
  ellipse(c, 300, TABLE_Y + 4, 15, 3, P.fog);
  ellipse(c, 300, TABLE_Y + 3.5, 14, 2.5, P.white);
  R(c, 282, TABLE_Y + 2, 1, 5, P.fog);
  R(c, 318, TABLE_Y + 2, 1, 5, P.fog);
  ellipse(c, 172, TABLE_Y + 4, 16, 3.5, P.fog);
  ellipse(c, 172, TABLE_Y + 3.5, 15, 3, P.white);
  R(c, 151, TABLE_Y + 2, 1, 5, P.fog);
  R(c, 193, TABLE_Y + 2, 1, 5, P.fog);
});
function flame(ctx, x, y, lt, k) {
  const f = sin(lt * 9 + k * 2) + sin(lt * 13.7 + k);
  ctx.globalAlpha = 0.07;
  ellipse(ctx, x, y - 2, 12, 10, P.yellow);
  ctx.globalAlpha = 1;
  R(ctx, x, y - 4 - (f > 0.8 ? 1 : 0), 1, 4 + (f > 0.8 ? 1 : 0), P.yellow);
  R(ctx, x, y - 2, 1, 2, P.cream);
}
const D_WATCH = [0, 0, 0.45, 0, 1.0, 1, 1.75, 1, 2.3, 0];
const CL_X = 172;
const WREST = [0, 0];
const WWATCH = [0, 0];
function shotDinner(ctx, lt) {
  ctx.drawImage(diningBack(), 0, 0);
  // the seated guest checks his watch, later looks down at what is served
  const watch = keys(lt, D_WATCH);
  const look = ramp(lt, 2.95, 3.35);
  QN.breath = (1 - cos(lt * 1.4)) / 2;
  QN.down = watch > 0.6 || look > 0.5 ? 1 : 0;
  QN.turn = look * 0.4 - watch * 0.3;
  QN.arms = false;
  WWATCH[0] = lerp(130, 140, watch);
  WWATCH[1] = lerp(TABLE_Y + 4, 127, watch) - sin(PI * watch) * 2;
  WREST[0] = 153;
  WREST[1] = TABLE_Y + 5;
  QN.reach0 = WWATCH;
  QN.reach1 = WREST;
  frontPerson(ctx, 144, 208, 14, DINER, QN);
  // the waiter, standing, hand on the cloche; at "shortly" he lifts it
  const lift = ramp(lt, 2.45, 3.05);
  REACH[0] = CL_X + 1 + lift * 8;
  REACH[1] = TABLE_Y - 15 - lift * 15;
  QW.breath = (1 - cos(lt * 1.2 + 2)) / 2;
  QW.down = lift > 0.6 ? 1 : 0;
  QW.turn = -0.5;
  QW.look = -1;
  QW.arms = false;
  QW.reach0 = REACH;
  QW.reach1 = null;
  QW.a1 = 0.1;
  QW.b1 = 0.1;
  frontPerson(ctx, 200, 186, 14, WAITER, QW);
  ctx.drawImage(diningTable(), 0, 0);
  for (let k = -16; k <= 16; k += 16) flame(ctx, 84 + k, 102, lt, k);
  frontArms(ctx, 144, 208, 14, DINER, QN);
  if (watch > 0.15) R(ctx, round(HAND[0] - 1), round(HAND[1] + 2), 2, 1, P.yellow);
  // under the cloche: the spinner, served
  if (lift > 0.2) {
    const a = ramp(lt, 2.6, 3.0);
    ctx.globalAlpha = 0.18 * a;
    ellipse(ctx, CL_X, TABLE_Y - 4, 11, 9, P.yellow);
    ctx.globalAlpha = a;
    dots(ctx, CL_X, TABLE_Y - 4, 6, 1.5, (T_DINNER + lt) * 5, P.yellow, P.orange, P.tanShade);
    ctx.globalAlpha = 1;
  }
  frontArms(ctx, 200, 186, 14, WAITER, QW);
  const kx = REACH[0] - 1;
  const ky = REACH[1] + 15;
  ellipse(ctx, kx, ky - 6, 13, 9, P.fog);
  ellipse(ctx, kx - 1, ky - 7, 12, 8, P.silver);
  R(ctx, round(kx - 13), round(ky - 2), 27, 2, P.fog);
  R(ctx, round(kx - 13), round(ky - 2), 27, 1, P.silver);
  R(ctx, round(kx - 8), round(ky - 12), 3, 2, P.white);
  R(ctx, round(kx - 1), round(ky - 17), 3, 2, P.fog);
  ellipse(ctx, HAND[0], HAND[1], 2.2, 1.8, P.white);
}

// --- 6. end slate ------------------------------------------------------------------------
const slateBg = () => bake('gb-slate', W, H, (c) => {
  ditherField(c, 0, 0, W, H, [P.black, P.ink], (x, y) => 1 - hypot((x - 192) / 260, (y - 92) / 150));
});
const SLATE_LEGAL = 'CHECK-OUT TIME: CALCULATING. LUGGAGE MAY ARRIVE IN 2-4 BUSINESS DECADES.';
const SLATE_LEGAL2 = 'PLEASE DO NOT REFRESH THE CONCIERGE.';
function shotSlate(ctx, lt) {
  ctx.drawImage(slateBg(), 0, 0);
  const e = ramp(lt, 0.2, 1.0);
  if (e > 0) {
    ctx.globalAlpha = e;
    dots(ctx, 192, 54, 8, 1.6, (T_SLATE + lt) * 3, P.yellow, P.orange, P.tanShade);
    ctx.globalAlpha = 1;
  }
  const mark = serif('gb-mark', 'THE GRAND BUFFER', 3);
  // the wordmark fades up and settles two pixels, then a slow glint crosses it
  const rev = ramp(lt, 0.45, 1.5);
  const mx = round(192 - mark.width / 2);
  const my = 76 + round((1 - rev) * 2);
  if (rev > 0) {
    ctx.globalAlpha = rev;
    ctx.drawImage(mark, mx, my);
    ctx.globalAlpha = 1;
  }
  if (lt > 2.6) glint(ctx, mark, mx, 76, prog(lt, 2.6, 3.6), { width: 6, alpha: 0.55 });
  // hairline with a centre lozenge
  const hw = round(70 * ramp(lt, 1.1, 1.8));
  if (hw > 0) {
    R(ctx, 192 - hw - 4, 97, hw, 1, P.orange);
    R(ctx, 196, 97, hw, 1, P.orange);
    R(ctx, 191, 96, 3, 3, P.yellow);
  }
  art(ctx, label('gb-sub', 'HOTEL * GENEVA * SINCE 1897', 2, P.fog), 192, 104, ramp(lt, 1.5, 2.1));
  // the tagline on the VO, and a progress hairline that stops at 99 %
  art(ctx, label('gb-tag', "YOU'RE ALMOST THERE.", 2, P.cream, 'body'), 192, 128, ramp(lt, 1.6, 2.3));
  const pa = ramp(lt, 1.9, 2.4);
  if (pa > 0) {
    ctx.globalAlpha = pa;
    R(ctx, 142, 146, 100, 1, P.slate);
    R(ctx, 142, 146, round(99 * io(prog(lt, 2.0, 3.4))), 1, P.yellow);
    ctx.globalAlpha = 1;
    art(ctx, label('gb-99', '99%', 1, P.steel), 252, 144, pa);
  }
  const la = ramp(lt, 2.6, 3.2);
  art(ctx, label('gb-legal', SLATE_LEGAL, 1, P.steel), 192, 194, la);
  art(ctx, label('gb-legal2', SLATE_LEGAL2, 1, P.steel), 192, 202, la);
}

// --- shot list and transitions -------------------------------------------------------------
// tr: 'dissolve' (cross-fade) | 'dip' (through black) | 'match' (the outgoing
// shot pushes in so its point (fx, fy) grows by z onto (tx, ty) while the new
// shot dissolves in: the lobby clock becomes the heirloom's ring) over d seconds.
const SHOTS = [
  { at: T_EXT, draw: shotExterior },
  { at: T_LOBBY, draw: shotLobby, tr: 'dissolve', d: 0.8 },
  { at: T_JEWEL, draw: shotJewel, tr: 'match', d: 1.0, fx: 164, fy: 44, tx: 250, ty: 106, z: 2.2 },
  { at: T_SUITE, draw: shotSuite, tr: 'dissolve', d: 0.8 },
  { at: T_DINNER, draw: shotDinner, tr: 'dissolve', d: 0.8 },
  { at: T_SLATE, draw: shotSlate, tr: 'dip', d: 1.0 },
];
function run(ctx, dt) {
  let i = 0;
  while (i + 1 < SHOTS.length && dt >= SHOTS[i + 1].at) i++;
  const s = SHOTS[i];
  const lt = dt - s.at;
  if (!i || !s.tr || lt >= s.d) s.draw(ctx, lt);
  else {
    const prev = SHOTS[i - 1];
    const p = lt / s.d;
    if (s.tr === 'dip') {
      if (p < 0.5) prev.draw(ctx, dt - prev.at);
      else s.draw(ctx, lt);
      ctx.globalAlpha = 1 - abs(p - 0.5) * 2;
      R(ctx, 0, 0, W, H, P.black);
      ctx.globalAlpha = 1;
    } else if (s.tr === 'match') {
      const a = buf('gb-ta');
      prev.draw(a.c, dt - prev.at);
      const e = io(p / 0.8);
      const z = 1 + (s.z - 1) * e;
      const cx = lerp(s.fx, s.tx, e);
      const cy = lerp(s.fy, s.ty, e);
      R(ctx, 0, 0, W, H, P.black);
      ctx.drawImage(a.cv, s.fx - cx / z, s.fy - cy / z, W / z, H / z, 0, 0, W, H);
      const b = buf('gb-tb');
      s.draw(b.c, lt);
      ctx.globalAlpha = smooth(prog(p, 0.2, 0.95));
      ctx.drawImage(b.cv, 0, 0);
      ctx.globalAlpha = 1;
    } else {
      prev.draw(ctx, dt - prev.at);
      const b = buf('gb-tb');
      s.draw(b.c, lt);
      ctx.globalAlpha = sine(p);
      ctx.drawImage(b.cv, 0, 0);
      ctx.globalAlpha = 1;
    }
  }
  // fade up from black at the top of the spot
  if (dt < 0.7) {
    ctx.globalAlpha = 1 - sine(dt / 0.7);
    R(ctx, 0, 0, W, H, P.black);
    ctx.globalAlpha = 1;
  }
}

export default {
  id: 'grand-buffer',
  brand: 'THE GRAND BUFFER',
  duration: DURATION,
  voice: { gender: 'male', lang: 'en-GB', pitch: 0.9, rate: 0.9 },
  script: [
    { at: 0.5, text: 'In a world that refreshes every second...' },
    { at: 4.4, text: 'one hotel has never once been in a hurry.' },
    { at: 9.4, text: 'Every spinner is still turned by hand.' },
    { at: 13.1, text: 'Every suite... almost ready.' },
    { at: 16.8, text: 'Dinner will be served... shortly.' },
    { at: 20.4, text: "The Grand Buffer. You're almost there." },
  ],
  // A string quartet and harp in D major at 78 bpm: eight bars, 32 beats =
  // 24.6 s = the spot. The desk bell rings on beat 7.5 (5.77 s, the guest's
  // tap), and the last bar sits on A7 and never resolves to D: almost there.
  tune: {
    bpm: 78,
    room: 0.42,
    echo: { amount: 0.6, beats: 0.75, feedback: 0.22 },
    tracks: [
      {
        kind: 'bass', inst: { wave: 'tri', a: 0.09, d: 0.7, s: 0.8, r: 0.45 }, gain: 0.9,
        notes: 'D2:4 B1:4 G1:4 A1:4 F#2:4 G2:4 E2:4 A1:4',
      },
      {
        kind: 'harmony', inst: { wave: 'sine', a: 0.4, d: 1.2, s: 0.75, r: 0.9 }, gain: 0.85,
        notes: 'D4+F#4+A4:4 D4+F#4+B4:4 D4+G4+B4:4 C#4+E4+A4:4 D4+F#4+A4:4 D4+G4+B4:4 D4+G4+B4:4 C#4+G4+A4:4',
      },
      {
        kind: 'harmony', inst: { wave: 'tri', a: 0.003, d: 0.55, s: 0, r: 0.35, legato: 1 }, gain: 0.55, pan: 0.25,
        notes: [
          'D3:0.5 A3:0.5 D4:0.5 F#4:0.5 A4:0.5 F#4:0.5 D4:0.5 A3:0.5',
          'B2:0.5 F#3:0.5 B3:0.5 D4:0.5 F#4:0.5 D4:0.5 B3:0.5 F#3:0.5',
          'G2:0.5 D3:0.5 G3:0.5 B3:0.5 D4:0.5 B3:0.5 G3:0.5 D3:0.5',
          'A2:0.5 E3:0.5 A3:0.5 C#4:0.5 E4:0.5 C#4:0.5 A3:0.5 E3:0.5',
          'F#2:0.5 A3:0.5 D4:0.5 F#4:0.5 A4:0.5 F#4:0.5 D4:0.5 A3:0.5',
          'G2:0.5 D3:0.5 G3:0.5 B3:0.5 D4:0.5 B3:0.5 G3:0.5 D3:0.5',
          'E3:0.5 G3:0.5 B3:0.5 D4:0.5 G4:0.5 D4:0.5 B3:0.5 G3:0.5',
          'A2:0.5 E3:0.5 G3:0.5 C#4:0.5 E4:0.5 G4:0.5 A4:1',
        ].join(' '),
      },
      {
        kind: 'lead', inst: { wave: 'tri', a: 0.16, d: 0.6, s: 0.85, r: 0.45, vib: [16, 5.2, 0.3], legato: 1 }, gain: 0.65,
        notes: 'R:8 A4:2 F#4:1 A4:1 D5:3 B4:1 A4:3 R:1 F#4:2 A4:1 D5:1 B4:3 G4:1 B4:1 A4:1 G4:1 E4:1 C#5:4',
      },
      { kind: 'harmony', inst: 'bell', gain: 0.45, notes: 'R:7.5 A6:1 R:23.5' },
    ],
  },
  draw(ctx, t, dt) {
    run(ctx, dt);
  },
};
