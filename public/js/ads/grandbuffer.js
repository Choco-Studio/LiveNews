// THE GRAND BUFFER — a parody of old-money luxury-hotel commercials. The joke
// is buffering sold as heritage: since 1897 the hotel has perfected the art of
// the wait. A slow, plummy voice-over, a string-quartet bed that ends on an
// unresolved leading note ("almost there"), gold serif lettering on night
// navy, marble and brass, and the loading spinner treated as an heirloom.
//
// Six shots, 24.6 s, joined by slow dissolves, one graphic match and a dip:
//  1  0.0 EXTERIOR  night rain; the camera cranes down the facade to the doorman
//                   under his umbrella, who touches his cap; one window goes dark.
//                                                VO "In a world that refreshes every second..."
//  2  3.8 LOBBY     over the guest's shoulder (locked off): she taps the desk bell;
//                   the concierge goes on writing and raises one finger. And holds it.
//                                                VO "...one hotel has never once been in a hurry."
//  3  8.6 HEIRLOOM  graphic match: the eight dots of the lobby clock become eight
//                   pearls under a glass dome; the camera glides in; a gloved hand
//                   turns the brass crank that lights them one by one.
//                                                VO "Every spinner is still turned by hand."
//  4 12.2 SUITE     by lamplight a housekeeper lifts a pillow, plumps it, puts it
//                   back, smooths it... and starts again: the action loops, like a buffer.
//                                                VO "Every suite... almost ready."
//  5 15.6 DINNER    a guest checks his watch while the waiter waits, hand on the
//                   cloche; cut to the plate: the cloche lifts, the spinner is served.
//                                                VO "Dinner will be served... shortly."
//  6 19.6 SLATE     serif wordmark, a gold hairline that stops at 99 %, legal.
//                                                VO "The Grand Buffer. You're almost there."
//
// Every frame is a pure function of the ad clock. People are form-shaded
// figures (about 6.8 heads tall, key light from camera left, a silver rim on
// dark cloth) posed by eased keys and two-bone IK, so every gesture travels its
// whole arc. Scenery and lettering are baked once, and pre-baked one shot per
// frame under the opening fade so no cut waits for a bake; polygons fill
// through one preallocated span buffer; transitions use pooled canvases.
import { P, W, H, A, R, bands, drawText, measureText, glint, prog, lerp } from './kit.js';

const { sin, cos, PI, round, floor, ceil, min, max, abs, sqrt, hypot } = Math;
const TAU = PI * 2;

// --- timing ------------------------------------------------------------------------
const T_EXT = 0;
const T_LOBBY = 3.8;
const T_JEWEL = 8.6;
const T_SUITE = 12.2;
const T_DINNER = 15.6;
const T_INSERT = 2.0; // inside the dinner shot: the cut to the plate
const T_SLATE = 19.6;
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
/** Quadratic Bezier point (one axis). */
const bez = (a, c, b, t) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * c + t * t * b;

// --- raster helpers (crisp spans, no allocation) --------------------------------------
// Every filled shape is first collected as horizontal spans; paintSpans() fills
// them and, given a shading recipe, lays form shading over them: a mid-tone band
// on the side away from the key light (camera left), a darker core at the very
// edge, a lit edge on the key side and an optional 1 px rim on the dark edge.
// Recipes are module-level constants: { d, f, m, dd, df, l, lf, lm, r, side }.
const SL = new Int16Array(4096);
const SR = new Int16Array(4096);
const SY = new Int16Array(4096);
let SN = 0;
const XS = new Float64Array(128);
function spanPoly(pts, n) {
  SN = 0;
  if (n < 3) return;
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
      if (b > a && SN < 4096) {
        SL[SN] = a;
        SR[SN] = b;
        SY[SN] = y;
        SN++;
      }
    }
  }
}
function spanEllipse(cx, cy, rx, ry) {
  SN = 0;
  if (rx <= 0 || ry <= 0) return;
  const y0 = ceil(cy - ry - 0.5);
  const y1 = floor(cy + ry - 0.5);
  for (let y = y0; y <= y1 && SN < 4096; y++) {
    const dy = (y + 0.5 - cy) / ry;
    const hw = rx * sqrt(max(0, 1 - dy * dy));
    const a = round(cx - hw);
    const b = round(cx + hw);
    if (b > a) {
      SL[SN] = a;
      SR[SN] = b;
      SY[SN] = y;
      SN++;
    }
  }
}
function band(ctx, c, f, m, onRight) {
  ctx.fillStyle = c;
  for (let i = 0; i < SN; i++) {
    const w = SR[i] - SL[i];
    const k = min(w, max(m, round(w * f)));
    ctx.fillRect(onRight ? SR[i] - k : SL[i], SY[i], k, 1);
  }
}
function paintSpans(ctx, c, sh) {
  ctx.fillStyle = c;
  for (let i = 0; i < SN; i++) ctx.fillRect(SL[i], SY[i], SR[i] - SL[i], 1);
  if (!sh) return;
  const right = (sh.side ?? 1) > 0;
  if (sh.d) band(ctx, sh.d, sh.f ?? 0.3, sh.m ?? 1, right);
  if (sh.dd) band(ctx, sh.dd, sh.df ?? 0.12, sh.dm ?? 1, right);
  if (sh.l) band(ctx, sh.l, sh.lf ?? 0.15, sh.lm ?? 1, !right);
  if (sh.r) band(ctx, sh.r, 0, 1, right);
}
function fillPoly(ctx, pts, n, c, sh = null) {
  spanPoly(pts, n);
  paintSpans(ctx, c, sh);
}
// A shared point list: pt() appends, fillPts() fills and resets.
const PT = new Float64Array(256);
let NP = 0;
function pt(x, y) {
  if (NP < 128) {
    PT[NP * 2] = x;
    PT[NP * 2 + 1] = y;
    NP++;
  }
}
function fillPts(ctx, c, sh = null) {
  fillPoly(ctx, PT, NP, c, sh);
  NP = 0;
}
/** Axis-aligned ellipse with fractional centre and radii (optionally form-shaded). */
function ellipse(ctx, cx, cy, rx, ry, c, sh = null) {
  spanEllipse(cx, cy, rx, ry);
  paintSpans(ctx, c, sh);
}
const CAP = new Float64Array(32);
/** Tapered capsule from (ax, ay) radius ra to (bx, by) radius rb, round ends. */
function capsule(ctx, ax, ay, bx, by, ra, rb, c, sh = null) {
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
  fillPoly(ctx, CAP, n / 2, c, sh);
}
/**
 * A limb lit as a cylinder in any direction: L = { base, shade, lit, rim }.
 * The shade survives on the side away from the key light (upper left), the
 * lit strip on the near side, the rim as one pixel beyond the shade.
 */
function limb(ctx, ax, ay, bx, by, ra, rb, L) {
  if (!L.shade || ra < 1.6) {
    capsule(ctx, ax, ay, bx, by, ra, rb, L.base);
    return;
  }
  const dx = bx - ax;
  const dy = by - ay;
  const len = hypot(dx, dy) || 1e-6;
  let nx = -dy / len;
  let ny = dx / len;
  if (nx * -0.8 + ny * -0.6 < 0) {
    nx = -nx;
    ny = -ny;
  }
  if (L.rim) capsule(ctx, ax - nx, ay - ny, bx - nx, by - ny, ra, rb, L.rim);
  capsule(ctx, ax, ay, bx, by, ra, rb, L.shade);
  capsule(ctx, ax + nx * ra * 0.3, ay + ny * ra * 0.3, bx + nx * rb * 0.3, by + ny * rb * 0.3, ra * 0.72, rb * 0.72, L.base);
  if (L.lit && ra >= 2.4) capsule(ctx, ax + nx * ra * 0.78, ay + ny * ra * 0.78, bx + nx * rb * 0.78, by + ny * rb * 0.78, ra * 0.2, rb * 0.2, L.lit);
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
/**
 * A translucent light pool baked once as a sprite: four Bayer-dithered alpha
 * steps of one colour, so live practicals (candles, pearls) glow softly
 * without flat discs. Drawn with drawImage (and globalAlpha for flicker).
 */
const GLOW_KEYS = new Map();
function glowSprite(rx, ry, hex, a) {
  const id = (rx * 64 + ry) * 8 + round(a * 7);
  let row = GLOW_KEYS.get(hex);
  if (!row) GLOW_KEYS.set(hex, (row = new Map()));
  let key = row.get(id);
  if (!key) row.set(id, (key = `gb-glow-${hex}-${rx}-${ry}-${a}`));
  return bake(key, rx * 2, ry * 2, (c) => {
    for (let y = 0; y < ry * 2; y++) {
      for (let x = 0; x < rx * 2; x++) {
        const q = hypot((x + 0.5 - rx) / rx, (y + 0.5 - ry) / ry);
        if (q >= 1) continue;
        const step = min(4, floor((1 - q) ** 1.6 * 4 + (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16));
        if (!step) continue;
        c.fillStyle = A(hex, (step / 4) * a);
        c.fillRect(x, y, 1, 1);
      }
    }
  });
}
function glowAt(ctx, spr, cx, cy, alpha = 1) {
  if (alpha <= 0.01) return;
  ctx.globalAlpha = min(1, alpha);
  ctx.drawImage(spr, round(cx - spr.width / 2), round(cy - spr.height / 2));
  ctx.globalAlpha = 1;
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
// Adults as form-shaded busts: torso, neck and head filled span by span with
// the recipes of their style S (shade band and core on screen right, a lit edge
// on screen left, a rim on dark cloth), garments drawn as cut and seams (lapels,
// collars, bow ties, buttons, aprons, a coat's back seam and belt), hair as a
// lit mass with a parting and strands, faces with lids, brows, a nose plane and
// a quiet mouth. Arms are lit cylinders solved by two-bone IK (elbows hang low
// and outward, so they never flip mid-move), with a shirt cuff and a hand drawn
// per pose. A pose F is a module-level object rewritten every frame.
const SKIN = { d: P.tan, f: 0.3, m: 1, dd: P.skinShade, df: 0.1, side: 1 };
const SKIN_TAN = { d: P.skinShade, f: 0.3, m: 1, dd: P.tanShade, df: 0.1, side: 1 };
const SUIT_SH = { d: P.black, f: 0.32, m: 1, l: P.slate, lf: 0.06, lm: 1, r: P.steel, side: 1 };
const SUIT_ARM = { base: P.ink, shade: P.black, lit: P.slate, rim: P.silver };
const SHIRT_SH = { d: P.silver, f: 0.32, m: 1, side: 1 };
const HAIR_SILVER = { d: P.fog, f: 0.36, m: 1, dd: P.steel, df: 0.1, l: P.white, lf: 0.1, lm: 1, side: 1 };
const HAIR_BROWN = { d: P.maroon, f: 0.38, m: 1, l: P.tanShade, lf: 0.12, lm: 1, side: 1 };
const HAIR_BLACK = { d: P.black, f: 0.3, m: 1, l: P.slate, lf: 0.1, lm: 1, side: 1 };
const BUN_SH = { d: P.maroon, f: 0.45, m: 1, side: 1 };

const CONCIERGE = {
  kind: 'tail', top: P.ink, topSh: SUIT_SH, arm: SUIT_ARM, waist: 0.86,
  vest: P.slate, vestSh: { d: P.ink, f: 0.3, m: 1, side: 1 }, shirt: P.white, shirtSh: SHIRT_SH,
  bow: P.black, lapelD: P.black, lapelL: P.slate, button: P.steel, pin: P.yellow, square: P.white, rimHi: P.silver,
  skin: P.skin, skinSh: SKIN, skinD: P.skinShade, skinL: P.cream, lip: P.skinShade, lash: P.tanShade, brow: P.fog,
  hair: P.silver, hairSh: HAIR_SILVER, hairD: P.steel, hairHi: P.white, hairStyle: 'part', cuff: P.white,
};
const GUEST = {
  kind: 'coatBack', top: P.tan, topSh: { d: P.tanShade, f: 0.3, m: 1, dd: P.brown, df: 0.07, l: P.skin, lf: 0.07, lm: 1, side: 1 },
  arm: { base: P.tan, shade: P.tanShade, lit: P.skin, rim: null }, waist: 0.9,
  seam: P.tanShade, belt: P.tanShade, button: P.brown, rimHi: P.cream,
  skin: P.skin, skinSh: SKIN, skinD: P.skinShade, skinL: P.cream, lip: P.skinShade, lash: P.tanShade, brow: P.brown,
  hair: P.brown, hairSh: HAIR_BROWN, hairD: P.maroon, hairHi: P.tanShade, hairStyle: 'bun', cuff: null,
};
const MAID = {
  kind: 'dress', top: P.ink, topSh: SUIT_SH, arm: { base: P.ink, shade: P.black, lit: P.slate, rim: P.steel }, waist: 0.8,
  collar: P.white, collarSh: { d: P.silver, f: 0.4, m: 1, side: 1 }, apron: P.white, apronSh: { d: P.silver, f: 0.3, m: 1, dd: P.fog, df: 0.08, side: 1 },
  rimHi: P.steel,
  skin: P.skin, skinSh: SKIN, skinD: P.skinShade, skinL: P.cream, lip: P.skinShade, lash: P.tanShade, brow: P.brown,
  hair: P.brown, hairSh: HAIR_BROWN, hairD: P.maroon, hairHi: P.tanShade, hairStyle: 'bun', cuff: P.white,
};
const DINER = {
  kind: 'dinner', top: P.ink, topSh: SUIT_SH, arm: SUIT_ARM, waist: 0.9,
  shirt: P.white, shirtSh: SHIRT_SH, bow: P.black, lapelD: P.black, lapelL: P.slate, button: P.steel, square: P.white, rimHi: P.silver,
  skin: P.tan, skinSh: SKIN_TAN, skinD: P.skinShade, skinL: P.skin, lip: P.tanShade, lash: P.brown, brow: P.black,
  hair: P.black, hairSh: HAIR_BLACK, hairD: P.black, hairHi: P.slate, hairStyle: 'slick', cuff: P.white,
};
const WAITER = {
  kind: 'mess', top: P.silver, topSh: { d: P.fog, f: 0.32, m: 1, dd: P.steel, df: 0.08, l: P.white, lf: 0.06, lm: 1, side: 1 },
  arm: { base: P.silver, shade: P.fog, lit: P.white, rim: null }, waist: 0.86,
  shirt: P.white, shirtSh: SHIRT_SH, bow: P.black, lapelD: P.fog, lapelL: P.white, button: P.steel, rimHi: null,
  skin: P.skin, skinSh: SKIN, skinD: P.skinShade, skinL: P.cream, lip: P.skinShade, lash: P.tanShade, brow: P.brown,
  hair: P.brown, hairSh: HAIR_BROWN, hairD: P.maroon, hairHi: P.tanShade, hairStyle: 'part', cuff: P.silver,
  hand: P.white, handSh: { d: P.silver, f: 0.35, m: 1, side: 1 }, handD: P.fog, handL: P.white,
};

/** A pose: position, size and look (module-level, rewritten per frame). */
const person = () => ({ x: 0, top: 0, hh: 24, sw: 0.9, turn: 0, down: 0, look: 0, tilt: 0, back: false });

// Half-width of a head at u (0 crown .. 1 chin) as a fraction of the half width.
function headHalf(u) {
  if (u < 0.5) {
    const v = (0.5 - u) / 0.5;
    return sqrt(max(0, 1 - v * v * 0.92));
  }
  if (u < 0.78) return 1 - (u - 0.5) * 0.45;
  const v = (u - 0.78) / 0.22;
  return (1 - 0.28 * 0.45) * (1 - v * 0.62) - v * v * 0.08;
}
function headSpans(cx, top, hh, hw, extra, u0, u1) {
  SN = 0;
  const yA = round(top + u0 * hh);
  const yB = round(top + u1 * hh);
  for (let y = yA; y < yB && SN < 4096; y++) {
    const u = (y + 0.5 - top) / hh;
    if (u < 0 || u > 1) continue;
    const half = headHalf(u) * hw + extra;
    const xl = round(cx - half);
    const xr = round(cx + half);
    if (xr > xl) {
      SL[SN] = xl;
      SR[SN] = xr;
      SY[SN] = y;
      SN++;
    }
  }
}
function pushSpan(a, b, y) {
  if (b > a && SN < 4096) {
    SL[SN] = a;
    SR[SN] = b;
    SY[SN] = y;
    SN++;
  }
}

function face(ctx, F, S, cx, top, hh, hw) {
  const turn = F.turn;
  const fx = cx + turn * hw * 0.34;
  const down = F.down;
  const eyeY = round(top + hh * (0.5 + down * 0.04));
  const sep = hw * 0.47;
  const ew = max(2, round(hh * 0.11));
  // ears
  ellipse(ctx, cx - hw - 0.4 + turn * hw * 0.3, top + hh * 0.52, max(1, hh * 0.06), hh * 0.1, S.skin);
  ellipse(ctx, cx + hw + 0.4 + turn * hw * 0.3, top + hh * 0.52, max(1, hh * 0.06), hh * 0.1, S.skinD);
  for (let s = -1; s <= 1; s += 2) {
    const far = s * turn > 0.05;
    const w = far ? max(1, ew - 1) : ew;
    const ex = round(fx + s * sep * (far ? 1 - abs(turn) * 0.35 : 1) - w / 2);
    // brow: a short stroke above the socket
    const by = eyeY - max(2, round(hh * 0.12)) + (down > 0.5 ? 1 : 0);
    ctx.fillStyle = S.brow;
    ctx.fillRect(ex - (s < 0 ? 1 : 0), by, w + 1, 1);
    if (down > 0.5 || F.blink > 0.5) {
      // lids lowered (reading, looking down): the lash line, a crease above
      ctx.fillStyle = S.lash;
      ctx.fillRect(ex, eyeY, w, 1);
      ctx.fillStyle = S.skinD;
      if (hh >= 20) ctx.fillRect(ex + (s > 0 ? 1 : 0), eyeY - 1, max(1, w - 1), 1);
    } else {
      ctx.fillStyle = S.skinD;
      ctx.fillRect(ex, eyeY - 1, w, 1);
      ctx.fillStyle = P.cream;
      ctx.fillRect(ex, eyeY, w, 1);
      ctx.fillStyle = P.black;
      const lk = F.look > 0.3 ? 1 : F.look < -0.3 ? -1 : 0;
      const ix = min(ex + w - 1, max(ex, ex + ((w - 1) >> 1) + lk));
      ctx.fillRect(ix, eyeY, w >= 3 ? 2 : 1, 1);
    }
  }
  // nose: the shadow plane on the far side and the underside
  const nTop = round(top + hh * 0.55);
  const nY = round(top + hh * (0.68 + down * 0.03));
  const nx = round(fx + hw * 0.1);
  ctx.fillStyle = S.skinD;
  ctx.fillRect(nx, nTop, 1, max(1, nY - nTop));
  ctx.fillRect(nx - 2, nY, 3, 1);
  // mouth: a quiet line; the lower lip catches the light under it
  const mY = round(top + hh * (0.8 + down * 0.02));
  const mw = max(3, round(hw * 0.58));
  const mx = round(fx - mw / 2 + hw * 0.05);
  ctx.fillStyle = S.lip;
  ctx.fillRect(mx, mY, mw, 1);
  if (hh >= 20) {
    // facial planes: the lit forehead and cheekbone on the key side
    ctx.fillStyle = S.skinL;
    ctx.fillRect(mx + 1, mY + 2, max(1, mw - 3), 1);
    ctx.fillRect(round(cx - hw * 0.66 + turn * hw * 0.35), round(top + hh * 0.3), max(1, round(hw * 0.3)), 1);
    ctx.fillRect(round(cx - hw * 0.62 + turn * hw * 0.35), round(top + hh * 0.62), max(1, round(hw * 0.18)), 1);
    // a soft shadow under the cheekbone on the far side
    ctx.fillStyle = S.skinD;
    ctx.fillRect(round(cx + hw * 0.5 + turn * hw * 0.2), round(top + hh * 0.66), 1, max(1, round(hh * 0.08)));
  }
}

function hairFront(ctx, F, S, cx, top, hh, hw) {
  const style = S.hairStyle;
  const cap = style === 'bun' ? 0.29 : style === 'slick' ? 0.21 : 0.24;
  const sideTo = style === 'bun' ? 0.55 : 0.47;
  const extra = style === 'bun' ? 0.8 : 1;
  const part = cx - hw * 0.32 + F.turn * hw * 0.3;
  SN = 0;
  const yA = round(top - hh * 0.07);
  const yB = round(top + hh * sideTo);
  for (let y = yA; y < yB; y++) {
    const u = (y + 0.5 - top) / hh;
    const half = headHalf(c01(u)) * hw + extra;
    let xl = round(cx - half);
    let xr = round(cx + half);
    if (u < -0.02) {
      // the crown rounds off: shorter top rows
      xl += 1;
      xr -= 1;
    }
    if (u > cap) {
      // below the hairline only the sides remain, tapering to the ears
      const fall = (u - cap) / (sideTo - cap);
      const wl = max(1, round(hw * (style === 'bun' ? 0.34 : 0.2) * (1 - fall * 0.55)));
      const wr = max(1, round(hw * (style === 'bun' ? 0.3 : 0.17) * (1 - fall * 0.55)));
      pushSpan(xl, xl + wl, y);
      pushSpan(xr - wr, xr, y);
      continue;
    }
    if (style === 'part' && u > cap - 0.07) {
      // the side parting lets the forehead show through on the near side
      const k = (u - (cap - 0.07)) / 0.07;
      pushSpan(xl, round(part - hw * 0.1 * k), y);
      pushSpan(round(part + hw * 0.15 + hw * 0.5 * k), xr, y);
      continue;
    }
    pushSpan(xl, xr, y);
  }
  paintSpans(ctx, S.hair, S.hairSh);
  // the parting, combed strands, one highlight cluster on the key side
  ctx.fillStyle = S.hairD;
  if (style !== 'slick') ctx.fillRect(round(part), round(top - hh * 0.04), 1, max(1, round(hh * 0.15)));
  ctx.fillRect(round(cx + hw * 0.25), round(top + hh * 0.02), max(1, round(hw * 0.35)), 1);
  ctx.fillStyle = S.hairHi;
  ctx.fillRect(round(cx - hw * 0.62), round(top + hh * 0.02), max(2, round(hw * 0.4)), 1);
  ctx.fillRect(round(cx - hw * 0.78), round(top + hh * 0.08), max(1, round(hw * 0.24)), 1);
  if (style === 'slick') {
    ctx.fillRect(round(cx - hw * 0.1), round(top - hh * 0.03), max(2, round(hw * 0.5)), 1);
  }
  // rim light on the crown (art direction: 1 px silver on every head)
  ctx.fillStyle = P.silver;
  ctx.fillRect(round(cx + hw * 0.1), round(top - hh * 0.07), max(2, round(hw * 0.6)), 1);
  if (style === 'bun') {
    // the bun peeks out behind the crown on the far side
    ellipse(ctx, cx + hw * 0.55 - F.turn * hw * 0.9, top + hh * 0.06, hh * 0.15, hh * 0.12, S.hair, BUN_SH);
  }
}

function headBack(ctx, F, S, cx, top, hh, hw) {
  ellipse(ctx, cx - hw - 0.4, top + hh * 0.52, max(1, hh * 0.06), hh * 0.1, S.skinD);
  ellipse(ctx, cx + hw + 0.4, top + hh * 0.52, max(1, hh * 0.06), hh * 0.1, S.skinD);
  headSpans(cx, top - hh * 0.05, hh, hw + 0.8, 0, 0, 0.86);
  paintSpans(ctx, S.hair, S.hairSh);
  // combed back: strands converge on a low chignon at the nape
  for (let k = -2; k <= 2; k++) {
    ctx.fillStyle = k < 0 ? S.hairHi : S.hairD;
    for (let i = 0; i < 14; i++) {
      const u = i / 14;
      const sx = cx + k * hw * 0.3 * (1 - u * 0.8) + hw * 0.05 * u;
      ctx.fillRect(round(sx), round(top + hh * (0.04 + u * 0.66)), 1, 1);
    }
  }
  ellipse(ctx, cx + hw * 0.05, top + hh * 0.82, hh * 0.28, hh * 0.17, S.hair, BUN_SH);
  ctx.fillStyle = S.hairHi;
  ctx.fillRect(round(cx - hh * 0.18), round(top + hh * 0.74), max(2, round(hh * 0.2)), 1);
  ctx.fillRect(round(cx - hh * 0.22), round(top + hh * 0.79), max(1, round(hh * 0.08)), 1);
  ctx.fillStyle = S.hairD;
  ctx.fillRect(round(cx - hh * 0.04), round(top + hh * 0.87), max(2, round(hh * 0.24)), 1);
  // rim on the crown and down the far side of the hair
  ctx.fillStyle = P.silver;
  ctx.fillRect(round(cx + hw * 0.05), round(top - hh * 0.05), max(2, round(hw * 0.6)), 1);
  ctx.fillRect(round(cx + hw + 0.4), round(top + hh * 0.16), 1, max(1, round(hh * 0.16)));
}

const G = { chin: 0, neckB: 0, shY: 0, sw: 0 };
/** Torso, neck, garment and head of an adult (arms are separate, so a desk can sit between). */
function bust(ctx, F, S, bottom) {
  const hh = F.hh;
  const cx = F.x;
  const top = F.top;
  const hx = cx + F.tilt;
  const sw = hh * F.sw * (1 - abs(F.turn) * 0.12);
  const chin = top + hh;
  const neckB = chin + hh * 0.2;
  const shY = neckB + hh * 0.07;
  G.chin = chin;
  G.neckB = neckB;
  G.shY = shY;
  G.sw = sw;
  const waist = S.waist;
  pt(cx - hh * 0.21, neckB - hh * 0.05);
  pt(cx - sw * 0.7, shY);
  pt(cx - sw * 0.93, shY + hh * 0.13);
  pt(cx - sw * 1.0, shY + hh * 0.42);
  pt(cx - sw * 0.95, shY + hh * 1.3);
  pt(cx - sw * waist, bottom);
  pt(cx + sw * waist, bottom);
  pt(cx + sw * 0.95, shY + hh * 1.3);
  pt(cx + sw * 1.0, shY + hh * 0.42);
  pt(cx + sw * 0.93, shY + hh * 0.13);
  pt(cx + sw * 0.7, shY);
  pt(cx + hh * 0.21, neckB - hh * 0.05);
  fillPts(ctx, S.top, S.topSh);
  // the shoulders' top edge: the key on the near one, the rim on the far one
  if (S.rimHi) line(ctx, cx + sw * 0.45, shY - hh * 0.02, cx + sw * 0.9, shY + hh * 0.1, S.rimHi);
  if (S.topSh.l) line(ctx, cx - sw * 0.9, shY + hh * 0.1, cx - sw * 0.5, shY - hh * 0.01, S.topSh.l);
  // neck: lit on the key side, a shadow under the jaw
  const nw = hh * 0.19;
  R(ctx, hx - nw, chin - hh * 0.12, nw * 2, neckB - chin + hh * 0.12, S.skin);
  R(ctx, hx + nw * 0.3, chin - hh * 0.12, nw * 0.7, neckB - chin + hh * 0.12, S.skinD);
  if (!F.back) R(ctx, hx - nw, chin - hh * 0.02, nw * 2, max(1, hh * 0.07), S.skinD);
  garment(ctx, F, S, cx, hh, neckB, shY, sw, bottom);
  if (F.back) headBack(ctx, F, S, hx, top, hh, hh * 0.37);
  else {
    const hw = hh * 0.37;
    headSpans(hx, top, hh, hw, 0, 0, 1);
    paintSpans(ctx, S.skin, S.skinSh);
    face(ctx, F, S, hx, top, hh, hw);
    hairFront(ctx, F, S, hx, top, hh, hw);
  }
}

function garment(ctx, F, S, cx, hh, neckB, shY, sw, bottom) {
  const nY = neckB - hh * 0.05;
  const k = S.kind;
  if (k === 'coatBack') {
    // a camel coat seen from behind: stand collar, shoulder seams, back seam, half belt
    pt(cx - hh * 0.32, nY - hh * 0.04);
    pt(cx + hh * 0.32, nY - hh * 0.04);
    pt(cx + hh * 0.36, nY + hh * 0.16);
    pt(cx - hh * 0.36, nY + hh * 0.16);
    fillPts(ctx, S.top, S.topSh);
    line(ctx, cx - hh * 0.34, nY + hh * 0.17, cx + hh * 0.34, nY + hh * 0.17, S.seam);
    line(ctx, cx - hh * 0.36, nY + hh * 0.2, cx - sw * 0.86, shY + hh * 0.14, S.seam);
    line(ctx, cx + hh * 0.36, nY + hh * 0.2, cx + sw * 0.86, shY + hh * 0.14, S.seam);
    line(ctx, cx, nY + hh * 0.2, cx, bottom, S.seam);
    // drape from the shoulder blades
    line(ctx, cx - sw * 0.5, shY + hh * 0.5, cx - sw * 0.34, shY + hh * 1.6, S.seam);
    line(ctx, cx + sw * 0.52, shY + hh * 0.55, cx + sw * 0.4, shY + hh * 1.5, S.topSh.dd);
    const by = round(shY + hh * 1.86);
    if (by < bottom) {
      R(ctx, cx - sw * 0.55, by, sw * 1.1, 2, S.belt);
      R(ctx, cx - sw * 0.55, by, sw * 1.1, 1, S.topSh.l);
      R(ctx, cx - sw * 0.45, by, 1, 2, S.button);
      R(ctx, cx + sw * 0.45 - 1, by, 1, 2, S.button);
    }
    return;
  }
  if (k === 'dress') {
    // housekeeper: black dress, a round white collar, the apron's bib and straps
    const ay = shY + hh * 0.42;
    pt(cx - hh * 0.36, ay);
    pt(cx + hh * 0.34, ay);
    pt(cx + hh * 0.42, bottom);
    pt(cx - hh * 0.44, bottom);
    fillPts(ctx, S.apron, S.apronSh);
    line(ctx, cx - hh * 0.36, ay, cx - sw * 0.62, shY + hh * 0.02, S.apron);
    line(ctx, cx + hh * 0.34, ay, cx + sw * 0.6, shY + hh * 0.02, S.collarSh.d);
    const wy = round(shY + hh * 1.55);
    if (wy < bottom) R(ctx, cx - sw * 0.8, wy, sw * 1.6, 2, S.apronSh.dd);
    ellipse(ctx, cx - hh * 0.14, nY + hh * 0.04, hh * 0.17, hh * 0.1, S.collar, S.collarSh);
    ellipse(ctx, cx + hh * 0.14, nY + hh * 0.04, hh * 0.17, hh * 0.1, S.collar, S.collarSh);
    R(ctx, cx, nY - hh * 0.02, 1, hh * 0.16, S.collarSh.d);
    return;
  }
  // tailored jackets: a V of shirt (and waistcoat), lapels with a lit roll, bow tie
  const deep = hh * (k === 'mess' ? 0.9 : 1.2);
  if (k === 'tail') {
    pt(cx - hh * 0.3, nY + hh * 0.12);
    pt(cx + hh * 0.3, nY + hh * 0.12);
    pt(cx + hh * 0.16, nY + deep + hh * 0.55);
    pt(cx - hh * 0.16, nY + deep + hh * 0.55);
    fillPts(ctx, S.vest, S.vestSh);
  }
  pt(cx - hh * 0.21, nY);
  pt(cx + hh * 0.21, nY);
  pt(cx + hh * 0.06, nY + deep * (k === 'tail' ? 0.6 : 1));
  pt(cx - hh * 0.06, nY + deep * (k === 'tail' ? 0.6 : 1));
  fillPts(ctx, S.shirt, S.shirtSh);
  // wing collar points and the bow tie
  R(ctx, cx - hh * 0.2, nY - 1, 2, 2, S.shirt);
  R(ctx, cx + hh * 0.2 - 2, nY - 1, 2, 2, S.shirtSh.d);
  const by = round(nY + 1);
  const bw = max(2, round(hh * 0.13));
  R(ctx, cx - bw - 1, by - 1, bw, 3, S.bow);
  R(ctx, cx + 1, by - 1, bw, 3, S.bow);
  R(ctx, cx - 1, by, 2, 1, S.bow);
  R(ctx, cx - bw - 1, by - 1, 1, 1, P.steel);
  // lapels: a dark edge and the lit roll of the near lapel
  line(ctx, cx - hh * 0.22, nY, cx - hh * 0.07, nY + deep, S.lapelD);
  line(ctx, cx + hh * 0.22, nY, cx + hh * 0.07, nY + deep, S.lapelD);
  line(ctx, cx - hh * 0.32, nY + hh * 0.06, cx - hh * 0.13, nY + deep * 0.8, S.lapelL);
  // peak lapel notches
  line(ctx, cx - hh * 0.3, nY + hh * 0.34, cx - hh * 0.4, nY + hh * 0.3, S.lapelD);
  line(ctx, cx + hh * 0.3, nY + hh * 0.34, cx + hh * 0.4, nY + hh * 0.3, S.lapelD);
  if (k === 'tail') {
    for (let j = 0; j < 3; j++) R(ctx, cx, nY + deep * 0.68 + j * hh * 0.2, 1, 1, S.button);
    // Les Clefs d'Or: crossed gold keys on the concierge's lapel
    const kx = round(cx - hh * 0.38);
    const ky = round(nY + hh * 0.46);
    ctx.fillStyle = S.pin;
    ctx.fillRect(kx, ky, 1, 1);
    ctx.fillRect(kx + 2, ky, 1, 1);
    ctx.fillRect(kx + 1, ky + 1, 1, 1);
    ctx.fillRect(kx, ky + 2, 1, 1);
    ctx.fillRect(kx + 2, ky + 2, 1, 1);
  } else if (k === 'dinner') {
    for (let j = 0; j < 3; j++) R(ctx, cx, nY + hh * 0.3 + j * hh * 0.22, 1, 1, S.button);
  } else if (k === 'mess') {
    for (let j = 0; j < 3; j++) {
      R(ctx, cx - hh * 0.32, nY + deep + j * hh * 0.3, 1, 1, S.button);
      R(ctx, cx + hh * 0.32, nY + deep + j * hh * 0.3, 1, 1, S.button);
    }
  }
  if (S.square) {
    // the pocket square on the left breast (screen right)
    const qx = round(cx + hh * 0.42);
    const qy = round(nY + hh * 0.55);
    R(ctx, qx, qy, 3, 1, S.square);
    R(ctx, qx + 1, qy - 1, 1, 1, S.square);
  }
  // where the coat closes, a crease runs off the button
  line(ctx, cx - hh * 0.05, nY + deep + hh * 0.6, cx - sw * 0.5, bottom, S.lapelD);
}

// Arms: joints solved into ARM, then painted.
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
  const side = (px - mx) * -dy + (py - my) * dx >= 0 ? 1 : -1;
  IK[0] = mx + side * (-dy / d) * h;
  IK[1] = my + side * (dx / d) * h;
}
const ARM = { sx: 0, sy: 0, ex: 0, ey: 0, wx: 0, wy: 0, dx: 0, dy: 1 };
/** Solve an arm of pose F (side -1 screen left, 1 screen right) with the wrist on (tx, ty). */
function armTo(F, side, tx, ty, pole = 1) {
  const hh = F.hh;
  const sw = hh * F.sw * (1 - abs(F.turn) * 0.12);
  ARM.sx = F.x + side * (sw - hh * 0.27);
  ARM.sy = F.top + hh * 1.27 + hh * 0.3;
  const up = hh * 1.28;
  const fo = hh * 1.1;
  ik(ARM.sx, ARM.sy, tx, ty, up, fo, ARM.sx + side * hh * 1.2 * pole, ARM.sy + hh * 2.2);
  ARM.ex = IK[0];
  ARM.ey = IK[1];
  const fx = tx - ARM.ex;
  const fy = ty - ARM.ey;
  const fl = hypot(fx, fy) || 1;
  ARM.dx = fx / fl;
  ARM.dy = fy / fl;
  ARM.wx = ARM.ex + ARM.dx * fo;
  ARM.wy = ARM.ey + ARM.dy * fo;
}
function armDraw(ctx, F, S, kind, ext = 1) {
  const hh = F.hh;
  limb(ctx, ARM.sx, ARM.sy, ARM.ex, ARM.ey, hh * 0.22, hh * 0.18, S.arm);
  limb(ctx, ARM.ex, ARM.ey, ARM.wx, ARM.wy, hh * 0.185, hh * 0.15, S.arm);
  if (S.cuff) {
    capsule(ctx, ARM.wx - ARM.dx * hh * 0.07, ARM.wy - ARM.dy * hh * 0.07, ARM.wx + ARM.dx * hh * 0.02, ARM.wy + ARM.dy * hh * 0.02, hh * 0.125, hh * 0.125, S.cuff);
  }
  hand(ctx, S, kind, ARM.wx + ARM.dx * hh * 0.03, ARM.wy + ARM.dy * hh * 0.03, ARM.dx, ARM.dy, hh * 0.13, ext);
}
/**
 * Hands by pose, at the wrist (x, y) with the forearm's direction (dx, dy):
 * 'point' a loose fist with the index finger raised (ext 0..1 straightens it),
 * 'pen' a writing grip, 'rest' flat on a surface, 'back' seen from behind
 * reaching forward, 'grip' closed round a handle, 'flat' palm pressed sideways.
 */
function hand(ctx, S, kind, x, y, dx, dy, s, ext) {
  const skin = S.hand || S.skin;
  const sh = S.handSh || S.skinSh;
  const dk = S.handD || S.skinD;
  const hi = S.handL || S.skinL;
  const px = x + dx * s * 0.9;
  const py = y + dy * s * 0.9;
  if (kind === 'point') {
    ellipse(ctx, px, py, s * 0.95, s * 1.1, skin, sh);
    // the index finger, rising out of the fist as ext goes to 1
    const fl = round(s * 2.3 * ext);
    if (fl > 0) {
      const fx = round(px - s * 0.35);
      const fy = round(py - s * 1.0) - fl;
      R(ctx, fx - 1, fy, 1, fl + 1, skin);
      R(ctx, fx, fy, 1, fl + 1, sh.d);
      R(ctx, fx - 1, fy, 1, 1, hi);
    }
    // curled fingers (creases) and the thumb folded across the front
    R(ctx, px - s * 0.25, py - s * 0.1, s * 1.05, 1, dk);
    R(ctx, px - s * 0.2, py + s * 0.5, s * 0.9, 1, dk);
    capsule(ctx, px - s * 0.95, py + s * 0.15, px - s * 0.05, py - s * 0.35, s * 0.32, s * 0.28, skin);
    R(ctx, px - s * 0.85, py - s * 0.25, 1, 1, hi);
    return;
  }
  if (kind === 'pen') {
    ellipse(ctx, px, py, s * 1.0, s * 0.85, skin, sh);
    R(ctx, px - s * 0.3, py + s * 0.3, s * 1.0, 1, dk);
    R(ctx, px - s * 0.8, py - s * 0.5, 1, 1, hi);
    line(ctx, px + s * 0.4, py - s * 0.2, px + s * 1.5, py - s * 2.2, P.black);
    R(ctx, px + s * 1.5, py - s * 2.3, 1, 1, P.yellow);
    return;
  }
  if (kind === 'rest') {
    ellipse(ctx, px, py, s * 1.25, s * 0.62, skin, sh);
    R(ctx, px - s * 0.9, py - s * 0.5, s * 0.8, 1, hi);
    ctx.fillStyle = dk;
    for (let j = 0; j < 3; j++) ctx.fillRect(round(px - s * 0.5 + j * s * 0.5), round(py + s * 0.35), 1, 1);
    return;
  }
  if (kind === 'back') {
    capsule(ctx, px - dx * s * 0.4, py - dy * s * 0.4, px + dx * s * 0.9, py + dy * s * 0.9, s * 0.85, s * 0.62, skin, sh);
    // the knuckle row catches the key; a darker fingertip edge
    R(ctx, px - s * 0.6, py - s * 0.1, max(2, s * 0.9), 1, hi);
    R(ctx, px + dx * s * 1.2 - 1, py + dy * s * 1.2, 2, 1, dk);
    return;
  }
  if (kind === 'flat') {
    ellipse(ctx, px, py, s * 0.65, s * 1.15, skin, sh);
    R(ctx, px - s * 0.4, py - s * 0.3, s * 0.8, 1, dk);
    R(ctx, px - s * 0.4, py + s * 0.3, s * 0.8, 1, dk);
    R(ctx, px - s * 0.55, py - s * 0.8, 1, 1, hi);
    return;
  }
  // grip
  ellipse(ctx, px, py, s * 1.0, s * 0.95, skin, sh);
  R(ctx, px - s * 0.3, py, s * 1.0, 1, dk);
  R(ctx, px - s * 0.3, py + s * 0.5, s * 0.9, 1, dk);
  R(ctx, px - s * 0.85, py - s * 0.45, 1, 1, hi);
}

// --- 1. exterior: rain, a crane down the facade to the doorman -------------------------
const FAC_H = 300;
const GROUND = 268;
const OFF_X = 210; // the window that goes dark
const OFF_Y = 163;
function winBake(c, x, y, w, h, state) {
  R(c, x - 1, y - 1, w + 2, h + 2, P.black);
  if (state === 2) {
    // a warm room behind sheer curtains: dim amber, one lamp a little brighter
    R(c, x, y, w, h, P.brown);
    R(c, x + 1, y + 2, w - 2, h - 4, P.tanShade);
    R(c, x + 1, y + h - 6, 3, 3, P.orange);
    R(c, x + 2, y + h - 5, 1, 1, P.yellow);
    R(c, x, y, 1, h, P.maroon);
    R(c, x + w - 1, y, 1, h, P.maroon);
  } else if (state === 1) {
    R(c, x, y, w, h, P.maroon);
    R(c, x + 1, y + 1, w - 2, round(h * 0.4), P.brown);
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
    R(c, 6, 140 + k * 24, 6, 9, k === 2 ? P.maroon : P.ink);
    R(c, 370, 128 + k * 24, 6, 9, k === 3 ? P.maroon : P.ink);
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
      winBake(c, dx + 1, 91, 6, 8, k === (x0 > 200 ? 2 : 1) ? 2 : 0);
    }
    cornice(c, x0, 104, w);
    for (let fl = 0; fl < 4; fl++) {
      const wy = 114 + fl * 27;
      for (let b = 0; b < 5; b++) {
        const wx = x0 + 7 + b * 17;
        const hsh = hash(fl * 13 + b * 7 + (x0 > 200 ? 101 : 0));
        winBake(c, wx, wy, 9, 16, hsh > 0.74 ? 2 : hsh > 0.52 ? 1 : 0);
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
  // oculus windows, unlit
  for (const ox of [px + 40, px + pw - 40]) {
    ellipse(c, ox, 61, 5, 5, P.black);
    ellipse(c, ox, 61, 4, 4, P.ink);
    R(c, ox + 1, 58, 1, 3, A(P.steel, 0.7));
  }
  // the roof sign: gold serif letters on a slim black frame, lit from below
  const sign = serif('gb-roof', 'THE GRAND BUFFER', 1);
  const sx = round(192 - sign.width / 2);
  R(c, sx - 4, 41, sign.width + 8, 2, P.black);
  for (let k = sx; k < sx + sign.width; k += 14) R(c, k, 41, 1, 6, P.black);
  c.drawImage(sign, sx, 28);
  for (let k = 0; k < 4; k++) {
    const lx = round(sx + 8 + (k * (sign.width - 16)) / 3);
    R(c, lx - 1, 40, 3, 1, P.black);
    R(c, lx, 39, 1, 1, P.cream);
  }
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
      const wx = px + 12 + b * 37 + (b > 1 ? 4 : 0);
      if (b === 0 || b === 3) {
        winBake(c, wx + 1, wy + 2, 12, 17, hash(fl * 5 + b + 300) > 0.7 ? 2 : hash(fl * 5 + b + 310) > 0.5 ? 1 : 0);
      } else {
        const forced = wx + 6 === OFF_X && wy === OFF_Y;
        winBake(c, wx + 6, wy, 14, 20, forced || hash(fl * 5 + b + 200) > 0.68 ? 2 : hash(fl * 5 + b + 210) > 0.5 ? 1 : 0);
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
    const lit = hash(k + 500) > 0.55;
    R(c, ax - 1, 231, 13, 31, P.black);
    R(c, ax, 233, 11, 29, lit ? P.brown : P.ink);
    if (lit) {
      R(c, ax + 1, 234, 9, 10, P.tanShade);
      R(c, ax + 2, 236, 3, 3, P.orange);
    }
    R(c, ax + 5, 233, 1, 29, P.black);
    R(c, ax, 245, 11, 1, P.black);
    R(c, ax, 232, 11, 1, P.black);
    R(c, ax + 1, 231, 9, 1, P.black);
  }
  // the entrance: a brass revolving door under a canopy, the warmest light in the street
  R(c, 172, 226, 40, GROUND - 226, P.black);
  R(c, 174, 228, 36, GROUND - 228, P.tanShade);
  R(c, 176, 230, 32, 26, P.orange);
  R(c, 178, 232, 28, 10, P.yellow);
  R(c, 182, 233, 20, 3, P.cream);
  for (const x of [174, 183, 191, 200, 209]) R(c, x, 228, 1, GROUND - 228, P.brown);
  R(c, 172, 254, 40, 1, P.brown);
  // canopy
  R(c, 156, 213, 72, 9, P.black);
  R(c, 157, 214, 70, 7, P.maroon);
  R(c, 157, 214, 70, 1, P.tanShade);
  R(c, 157, 220, 70, 1, P.brown);
  const cl = label('gb-canopy', 'THE GRAND BUFFER', 1, P.cream);
  c.drawImage(cl, round(192 - cl.width / 2), 215);
  R(c, 159, 222, 1, 40, P.tanShade);
  R(c, 224, 222, 1, 40, P.tanShade);
  // steps
  R(c, 164, 262, 56, 2, P.steel);
  R(c, 160, 264, 64, 2, P.slate);
  R(c, 156, 266, 72, 2, P.steel);
  // lanterns either side of the door
  for (const lx of [148, 236]) {
    glowBake(c, lx, 240, 20, 18, P.yellow, 0.26);
    R(c, lx, 246, 1, 16, P.black);
    R(c, lx - 2, 234, 5, 8, P.black);
    R(c, lx - 1, 235, 3, 6, P.cream);
    R(c, lx - 2, 233, 5, 1, P.tanShade);
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
    if (k === 4 || k === 5 || hash(k + 500) <= 0.55) continue;
    for (let y = GROUND + 3; y < GROUND + 13; y += 3) R(c, ax + 3, y, 5, 1, P.tanShade);
  }
  c.globalAlpha = 1;
});
// The doorman: about 62 px tall, under a black umbrella; he touches his cap.
const UMB = { x0: 0, x1: 0, y0: 0, y1: 0 }; // rain does not fall under the umbrella
const COAT_SH = { d: P.black, f: 0.3, m: 1, l: P.brown, lf: 0.16, lm: 1, r: P.steel, side: 1 };
const DOOR_ARM = { base: P.maroon, shade: P.black, lit: P.brown, rim: null };
const GLOVE = { hand: P.white, handSh: { d: P.silver, f: 0.4, m: 1, side: 1 }, handD: P.fog, handL: P.white, skin: P.white };
const QDM = person();
function doorman(ctx, x, fy, lt) {
  const hh = 9;
  const top = fy - hh * 6.8;
  UMB.x0 = UMB.x1 = 0;
  if (top - 14 > H) return;
  // reflection in the wet pavement
  ctx.globalAlpha = 0.3;
  for (let k = 1; k < 10; k += 2) R(ctx, x - 6 + ((k >> 1) & 1), fy + k, 12, 1, P.maroon);
  ctx.globalAlpha = 1;
  // trousers and shoes
  R(ctx, x - 4, fy - 18, 3, 16, P.black);
  R(ctx, x + 1, fy - 18, 3, 16, P.black);
  R(ctx, x - 4, fy - 18, 1, 15, P.ink);
  R(ctx, x - 5, fy - 2, 4, 2, P.black);
  R(ctx, x + 1, fy - 2, 4, 2, P.black);
  R(ctx, x - 5, fy - 2, 2, 1, P.steel);
  R(ctx, x + 1, fy - 2, 2, 1, P.slate);
  // the long coat, double-breasted, flared to the knee
  const sy = top + hh * 1.3;
  pt(x - 2, sy - 1);
  pt(x - 8, sy + 1);
  pt(x - 9, sy + 5);
  pt(x - 7, top + hh * 3.1);
  pt(x - 9, fy - 17);
  pt(x + 9, fy - 17);
  pt(x + 7, top + hh * 3.1);
  pt(x + 9, sy + 5);
  pt(x + 8, sy + 1);
  pt(x + 2, sy - 1);
  fillPts(ctx, P.maroon, COAT_SH);
  R(ctx, x - 7, top + hh * 3.05, 14, 1, P.black);
  R(ctx, x, top + hh * 3.05, 1, 1, P.yellow);
  ctx.fillStyle = P.yellow;
  for (let k = 0; k < 3; k++) {
    ctx.fillRect(round(x - 3), round(sy + 3 + k * 4), 1, 1);
    ctx.fillRect(round(x + 2), round(sy + 3 + k * 4), 1, 1);
  }
  line(ctx, x, sy, x, fy - 18, P.black);
  R(ctx, x - 9, sy + 1, 3, 1, P.yellow);
  R(ctx, x + 6, sy + 1, 3, 1, P.orange);
  // neck and head under the peaked cap
  R(ctx, x - 1, top + hh - 1, 3, 3, P.skin);
  R(ctx, x + 1, top + hh - 1, 1, 3, P.skinShade);
  headSpans(x, top, hh, hh * 0.37, 0, 0, 1);
  paintSpans(ctx, P.skin, SKIN);
  R(ctx, x - 2, top + 5, 1, 1, P.black);
  R(ctx, x + 1, top + 5, 1, 1, P.black);
  R(ctx, x, top + 6, 1, 1, P.skinShade);
  R(ctx, x - 1, top + 7, 3, 1, P.skinShade);
  R(ctx, x - 4, top - 1, 9, 3, P.maroon);
  R(ctx, x - 3, top - 2, 7, 1, P.maroon);
  R(ctx, x - 3, top - 2, 3, 1, P.brown);
  R(ctx, x - 4, top + 2, 9, 1, P.yellow);
  R(ctx, x + 2, top + 2, 3, 1, P.orange);
  R(ctx, x - 4, top + 3, 8, 1, P.black);
  R(ctx, x, top, 1, 1, P.yellow);
  // the umbrella, held in his right hand (screen left)
  const ux = x - 7;
  const uy = top - 3;
  const hx = ux;
  const hy = top + hh * 2.45;
  limb(ctx, x - 7, sy + 2, x - 9, sy + 10, 1.6, 1.4, DOOR_ARM);
  limb(ctx, x - 9, sy + 10, hx + 1, hy, 1.4, 1.2, DOOR_ARM);
  R(ctx, hx, uy, 1, hy - uy, P.black);
  ellipse(ctx, hx + 0.5, hy, 1.6, 1.6, P.white);
  pt(ux - 17, uy + 1);
  for (let i = 1; i < 8; i++) {
    const a = PI + (i / 8) * PI;
    pt(ux + cos(a) * 17, uy + sin(a) * 9);
  }
  pt(ux + 17, uy + 1);
  for (let i = 7; i >= 1; i--) pt(ux - 17 + (i / 8) * 34, uy + 1 + (i & 1 ? 0 : 1));
  fillPts(ctx, P.black);
  // panels catch the street light on the left; ribs; the ferrule
  for (let i = 1; i < 4; i++) {
    const a = PI + (i / 8) * PI;
    line(ctx, ux, uy - 9, ux + cos(a) * 16, uy + sin(a) * 8 + 1, i === 2 ? P.slate : P.ink);
  }
  line(ctx, ux - 15, uy - 3, ux - 7, uy - 8, P.slate);
  R(ctx, ux, uy - 11, 1, 2, P.silver);
  UMB.x0 = ux - 17;
  UMB.x1 = ux + 17;
  UMB.y0 = uy - 8;
  UMB.y1 = fy;
  // raindrops burst on the canopy
  for (let k = 0; k < 7; k++) {
    const ph = hash(k + 70) * 7 + lt * 2.3;
    if (ph - floor(ph) < 0.18) {
      const u = (hash(k * 3 + floor(ph)) * 2 - 1) * 0.85;
      const rx = ux + u * 17;
      const ry = uy - 9 * sqrt(max(0, 1 - u * u)) - 1;
      R(ctx, rx, ry, 1, 1, P.fog);
      R(ctx, rx + (u > 0 ? 1 : -1), ry - 1, 1, 1, A(P.fog, 0.5));
    }
  }
  // his left hand: hanging, then up to the brim of the cap (a greeting), held
  const greet = keys(lt, [0, 0, 2.55, 0, 3.25, 1]);
  QDM.x = x;
  QDM.top = top;
  QDM.hh = hh;
  QDM.sw = 0.95;
  QDM.turn = 0;
  armTo(QDM, 1, lerp(x + 9, x + 4, greet), lerp(top + hh * 3.35, top + 1.5, greet), 1.2);
  limb(ctx, ARM.sx, ARM.sy, ARM.ex, ARM.ey, 1.8, 1.5, DOOR_ARM);
  limb(ctx, ARM.ex, ARM.ey, ARM.wx, ARM.wy, 1.5, 1.3, DOOR_ARM);
  ellipse(ctx, ARM.wx + ARM.dx, ARM.wy + ARM.dy, 1.5, 1.6, P.white, GLOVE.handSh);
}
function shotExterior(ctx, lt) {
  const camY = round(84 * io(prog(lt, 0.15, 3.7)));
  ctx.drawImage(facade(), 0, -camY);
  // someone on the fourth floor turns in for the night: one window dims, slowly
  const off = ramp(lt, 1.9, 2.6);
  if (off > 0) {
    ctx.globalAlpha = off;
    winBake(ctx, OFF_X, OFF_Y - camY, 14, 20, 0);
    ctx.globalAlpha = 1;
  }
  // the doorman stands nearer the lens than the facade: he rises a touch faster
  doorman(ctx, 272, round(293 - camY * 1.1), lt);
  rain(ctx, lt, 0.3);
  // the dateline super, letter-spaced
  art(ctx, label('gb-geneva', 'GENEVA * SINCE 1897', 3, P.cream), 168, 197, ramp(lt, 2.4, 3.0));
}
function rain(ctx, lt, a) {
  ctx.fillStyle = A(P.fog, a);
  for (let i = 0; i < 64; i++) {
    const sp = 230 + hash(i + 7) * 90;
    const len = 4 + floor(hash(i + 3) * 4);
    const y = mod(hash(i + 11) * 400 + lt * sp, H + 16) - 8;
    const x = mod(hash(i) * W - y * 0.18 - lt * 20, W);
    if (x >= UMB.x0 && x <= UMB.x1 && y + len >= UMB.y0 && y <= UMB.y1) continue;
    ctx.fillRect(round(x), round(y), 1, len);
  }
}

// --- 2. the lobby: the bell, the finger ------------------------------------------------
// Locked off, over the guest's shoulder: she taps the bell; the concierge goes on
// writing and raises one finger beside his face without looking up. The house
// clock on the wall between them has the spinner for a face.
const DESK_Y = 117; // the polished front edge of the counter
const CLOCK_X = 166;
const CLOCK_Y = 44;
const CLOCK_R = 9; // the ring of dots: the match lines the pearls up on it
const BELL_X = 178;
const BELL_Y = 113;
const C_X = 252; // the concierge
const G_X = 96; // the guest
const lobby = () => bake('gb-lobby', W, H, (c) => {
  R(c, 0, 0, W, H, P.ink);
  R(c, 0, 0, W, 8, P.black);
  R(c, 0, 8, W, 1, P.tanShade);
  R(c, 0, 9, W, 1, P.brown);
  R(c, 0, 10, W, 1, P.black);
  // panelled walls: slate mouldings lit from the left
  for (const [x, w] of [[2, 58], [66, 58], [130, 74]]) {
    R(c, x, 18, w, 1, P.slate);
    R(c, x, 18, 1, 86, P.slate);
    R(c, x + w - 1, 18, 1, 86, P.black);
    R(c, x, 103, w, 1, P.black);
    R(c, x + 5, 24, w - 10, 1, P.black);
    R(c, x + 5, 24, 1, 74, P.black);
    R(c, x + w - 6, 24, 1, 74, P.slate);
    R(c, x + 5, 97, w - 10, 1, P.slate);
  }
  // behind the concierge: a warm wood panel under a downlight
  R(c, 210, 14, 86, 96, P.maroon);
  R(c, 212, 16, 82, 92, P.brown);
  R(c, 212, 16, 82, 1, P.tanShade);
  R(c, 212, 16, 1, 92, P.tanShade);
  R(c, 218, 22, 70, 1, P.maroon);
  R(c, 218, 22, 1, 80, P.maroon);
  R(c, 287, 22, 1, 80, P.tanShade);
  R(c, 218, 101, 70, 1, P.tanShade);
  glowBake(c, 252, 26, 64, 70, P.yellow, 0.24);
  R(c, 246, 11, 13, 2, P.black);
  R(c, 248, 13, 9, 1, P.cream);
  // the key cabinet at the right
  const kx = 302;
  R(c, kx, 16, 78, 92, P.maroon);
  R(c, kx + 2, 18, 74, 88, P.brown);
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 9; col++) {
      const cx = kx + 4 + col * 8;
      const cy = 20 + row * 10 + 1;
      R(c, cx, cy, 7, 9, P.black);
      if (hash(row * 10 + col + 33) > 0.35) {
        R(c, cx + 3, cy + 2, 1, 3, P.tanShade);
        R(c, cx + 2, cy + 5, 3, 2, P.cream);
      }
    }
  }
  R(c, kx + 2, 18, 74, 1, P.tanShade);
  shadeBake(c, kx, 16, 78, 92, 0.75, (x) => (x - kx - 30) / 50);
  // a sconce at the far left
  glowBake(c, 26, 44, 40, 36, P.yellow, 0.2);
  R(c, 25, 46, 3, 9, P.tanShade);
  R(c, 24, 40, 5, 6, P.cream);
  R(c, 25, 39, 3, 1, P.white);
  // the clock: brass bezel, cream face; its eight dots are drawn live
  glowBake(c, CLOCK_X, CLOCK_Y, 32, 28, P.yellow, 0.08);
  ellipse(c, CLOCK_X, CLOCK_Y, 17, 17, P.black);
  ellipse(c, CLOCK_X, CLOCK_Y, 16, 16, P.tanShade);
  ellipse(c, CLOCK_X - 0.5, CLOCK_Y - 0.5, 15, 15, P.orange);
  ellipse(c, CLOCK_X - 1, CLOCK_Y - 1, 13.5, 13.5, P.yellow);
  ellipse(c, CLOCK_X, CLOCK_Y, 13, 13, P.tanShade);
  ellipse(c, CLOCK_X, CLOCK_Y, 12.2, 12.2, P.tan);
  ellipse(c, CLOCK_X - 0.6, CLOCK_Y - 0.6, 11.6, 11.6, P.cream);
  R(c, CLOCK_X - 1, CLOCK_Y + 17, 3, 2, P.tanShade);
  // the desk lamp's light on the wall at the right
  glowBake(c, 340, 92, 46, 30, P.yellow, 0.16);
});
const desk = () => bake('gb-desk', W, H, (c) => {
  // marble top: a sliver of the surface, a few veins, the polished front edge, a brass rail
  R(c, 0, 111, W, 6, P.cream);
  R(c, 0, 111, W, 1, P.tan);
  for (let k = 0; k < 14; k++) {
    const vx = floor(hash(k + 120) * W);
    line(c, vx, 112, vx + 6 + floor(hash(k + 140) * 8), 115, A(P.tan, 0.6));
  }
  R(c, 0, DESK_Y, W, 1, P.white);
  R(c, 0, DESK_Y + 1, W, 1, P.tan);
  R(c, 0, DESK_Y + 2, W, 1, P.yellow);
  R(c, 0, DESK_Y + 3, W, 1, P.orange);
  R(c, 0, DESK_Y + 4, W, 1, P.tanShade);
  R(c, 0, DESK_Y + 5, W, H - DESK_Y - 5, P.brown);
  for (let x = 6; x < W; x += 64) {
    R(c, x, 128, 56, 96, P.maroon);
    R(c, x + 1, 129, 54, 95, P.brown);
    R(c, x + 1, 129, 54, 1, P.tanShade);
    R(c, x + 1, 129, 1, 95, P.tanShade);
  }
  shadeBake(c, 0, DESK_Y + 5, W, H - DESK_Y - 5, 0.62, (x, y) => (y - 150) / 66);
  // a brass plaque on the counter front
  R(c, 228, 134, 46, 9, P.tanShade);
  R(c, 229, 135, 44, 7, P.orange);
  R(c, 229, 135, 44, 1, P.yellow);
  const pl = label('gb-plaque', 'CONCIERGE', 1, P.maroon);
  c.drawImage(pl, round(251 - pl.width / 2), 134);
  // the open ledger
  R(c, 222, 112, 19, 4, P.cream);
  R(c, 242, 112, 19, 4, P.cream);
  R(c, 222, 112, 39, 1, P.white);
  R(c, 241, 112, 1, 4, P.tan);
  for (let k = 0; k < 2; k++) {
    R(c, 224, 113 + k * 2, 14, 1, A(P.steel, 0.5));
    R(c, 244, 113 + k * 2, 14, 1, A(P.steel, 0.5));
  }
  // the lamp
  ellipse(c, 340, 115, 7, 1.6, P.tanShade);
  R(c, 339, 95, 2, 20, P.orange);
  R(c, 339, 95, 1, 20, P.yellow);
  pt(328, 95);
  pt(352, 95);
  pt(348, 82);
  pt(332, 82);
  fillPts(c, P.cream);
  R(c, 332, 82, 16, 1, P.white);
  R(c, 329, 94, 23, 1, P.tan);
  R(c, 344, 84, 4, 10, P.tan);
});
/** The desk bell: brass dome and plunger (pressed: down a pixel, a brighter glint). */
function bell(ctx, pressed) {
  ellipse(ctx, BELL_X, BELL_Y + 3, 6, 1.6, P.tanShade);
  ellipse(ctx, BELL_X, BELL_Y, 5, 3.6, P.orange, { d: P.tanShade, f: 0.3, m: 1, side: 1 });
  R(ctx, BELL_X - 3, BELL_Y - 2, 3, 1, P.yellow);
  R(ctx, BELL_X - 2, BELL_Y - 3, 1, 1, pressed ? P.white : P.cream);
  R(ctx, BELL_X, BELL_Y - 6 + pressed, 1, 3, P.tanShade);
  R(ctx, BELL_X - 1, BELL_Y - 6 + pressed, 3, 1, P.orange);
}
const QC = person();
const QG = person();
// The guest's hand: rest, reach, tap the bell (on the tune's bell, beat 7.5 at
// 78 bpm = 5.77 s), hold, back to her side.
const TAP = 7.5 * (60 / 78) - T_LOBBY;
const L_REACH = [0, 0, 0.7, 0, 1.6, 1, TAP + 0.75, 1, TAP + 1.55, 0];
const L_TAP = [0, 0, TAP - 0.3, 0, TAP - 0.1, -1, TAP, 1, TAP + 0.22, 0];
function shotLobby(ctx, lt) {
  ctx.drawImage(lobby(), 0, 0);
  // the clock-spinner ticks round, one dot every half second
  dots(ctx, CLOCK_X, CLOCK_Y, CLOCK_R, 1.8, (T_LOBBY + lt) * 2, P.black, P.steel, P.fog);
  // the concierge writes; at the bell he raises one finger without looking up
  QC.x = C_X;
  QC.top = 40 + round((1 - cos(lt * 1.5)) / 2);
  QC.hh = 24;
  QC.sw = 0.92;
  QC.down = 1;
  bust(ctx, QC, CONCIERGE, DESK_Y + 8);
  ctx.drawImage(desk(), 0, 0);
  const tap = keys(lt, L_TAP);
  bell(ctx, tap > 0.5 ? 1 : 0);
  const wr = 1 - smooth(prog(lt, TAP + 0.3, TAP + 0.9)) * 0.85;
  armTo(QC, -1, 233 + sin(lt * 5.3) * 2.2 * wr + (mod(lt, 1.6) > 1.45 ? -2 : 0) * wr, 112 + sin(lt * 10.6) * 0.6 * wr, 1);
  armDraw(ctx, QC, CONCIERGE, 'pen');
  const raise = ramp(lt, TAP + 0.45, TAP + 1.3);
  const settle = sin(PI * prog(lt, TAP + 1.2, TAP + 1.6)) * 0.8;
  armTo(QC, 1, bez(263, 292, 281, raise), bez(112, 104, 66, raise) - settle, 1);
  armDraw(ctx, QC, CONCIERGE, raise > 0.12 ? 'point' : 'rest', smooth(prog(lt, TAP + 0.95, TAP + 1.35)));
  // the guest, from behind, nearer the lens; she tilts her head a touch: patience
  QG.x = G_X;
  QG.top = 60 + round((1 - cos(lt * 1.3 + 1)) / 2);
  QG.hh = 30;
  QG.sw = 0.86;
  QG.back = true;
  QG.tilt = round(ramp(lt, TAP + 1.6, TAP + 2.3) * 2);
  bust(ctx, QG, GUEST, H + 2);
  armTo(QG, -1, 70, 168, 0.4);
  armDraw(ctx, QG, GUEST, 'back');
  const reach = keys(lt, L_REACH);
  armTo(QG, 1, bez(124, 152, 172, reach), bez(168, 150, 104, reach) + tap * 2, 1);
  armDraw(ctx, QG, GUEST, 'back');
}

// --- 3. the heirloom: pearls under glass, turned by hand ------------------------------
const velvet = () => bake('gb-velvet', W, H, (c) => {
  ditherField(c, 0, 0, W, H, [P.black, P.ink, P.slate], (x, y) => {
    const d = hypot((x - 236) / 210, (y - 40) / 170);
    return (1 - d) * 1.12;
  });
});
// The camera maps the shot's own coordinates (the ring of pearls at (JX, JY - 10))
// to the screen: at the cut the ring sits exactly on the lobby clock's ring of
// dots (a graphic match), then the camera glides in to the hero framing and keeps
// pushing slowly. Module state, so the helpers cost no closures per frame.
const JX = 250;
const JY = 116;
let ZS = 1;
let CX0 = JX;
let CY0 = JY - 10;
const zx = (v) => CX0 + (v - JX) * ZS;
const zy = (v) => CY0 + (v - (JY - 10)) * ZS;
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
  line(ctx, wx - 1.5 * s, wy - 7 * s, wx - 2.5 * s, wy + 4 * s, P.steel);
  // back of the hand, then four curled fingers with a seam between each
  ellipse(ctx, gx + 3.5 * s, gy + 1.5 * s, 6 * s, 5.2 * s, P.fog);
  ellipse(ctx, gx + 2.8 * s, gy + 0.6 * s, 5.4 * s, 4.6 * s, P.silver);
  for (let k = 0; k < 4; k++) {
    const fy = gy - 2.4 * s + k * 2.2 * s;
    capsule(ctx, gx - 1 * s, fy, gx - 4.2 * s, fy + 0.8 * s, 1.4 * s, 1.2 * s, k === 3 ? P.fog : P.silver);
    R(ctx, round(gx - 4 * s), round(fy + 1.3 * s), round(3.5 * s), 1, P.fog);
    R(ctx, round(gx - 3.6 * s), round(fy - 0.6 * s), round(1.6 * s), 1, P.white);
  }
  // thumb over the top, the stitched points on the back of the glove
  capsule(ctx, gx + 3 * s, gy - 4.4 * s, gx - 2.8 * s, gy - 5.2 * s, 1.6 * s, 1.3 * s, P.silver);
  R(ctx, round(gx + 1 * s), round(gy - 6 * s), round(4 * s), 1, P.white);
  for (let k = 0; k < 3; k++) line(ctx, gx + 2 * s + k * 1.6 * s, gy - 1.5 * s, gx + 3 * s + k * 1.6 * s, gy + 3 * s, P.fog);
}
const HEAD0 = floor(mod(T_JEWEL * 2, 8)); // the clock's lit dot at the cut
function shotJewel(ctx, lt) {
  ctx.drawImage(velvet(), 0, 0);
  const e = sine(prog(lt, 0.35, 2.4));
  ZS = lerp(CLOCK_R / 22, 1, e) * (1 + 0.07 * sine(prog(lt, 2.4, 4.6)));
  CX0 = lerp(CLOCK_X, 238, e);
  CY0 = lerp(CLOCK_Y, 102, e);
  const s = ZS;
  // pedestal: black lacquer with a gold inlay
  const pTop = zy(162);
  const pw = 46 * s;
  R(ctx, zx(JX - 46), pTop, pw * 2, H - pTop, P.black);
  R(ctx, zx(JX - 40), pTop, 7 * s, H - pTop, P.ink);
  R(ctx, zx(JX - 38), pTop, 1, H - pTop, P.steel);
  R(ctx, zx(JX + 44), pTop, 1, H - pTop, A(P.slate, 0.8));
  R(ctx, zx(JX - 46), zy(170), pw * 2, 1, P.orange);
  ellipse(ctx, CX0, pTop, pw, 7 * s, P.ink);
  ellipse(ctx, CX0, pTop + 0.5, pw - 1, 6 * s, P.black);
  // velvet cushion
  ellipse(ctx, CX0, zy(154), 31 * s, 8 * s, P.maroon);
  ellipse(ctx, CX0 - 1, zy(152), 29 * s, 6 * s, P.darkRed, { d: P.maroon, f: 0.3, m: 1, side: 1 });
  // stand
  const st = zy(JY + 22);
  R(ctx, round(CX0 - 1), st, 2, zy(149) - st, P.orange);
  R(ctx, round(CX0 - 1), st, 1, zy(149) - st, P.yellow);
  ellipse(ctx, CX0, zy(148), 5 * s, 1.6 * s, P.orange);
  // the ring and its eight pearls
  const rr = 22 * s;
  const cy = CY0;
  const n = ceil(TAU * rr * 1.2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const lightSide = cos(a + PI * 0.75);
    R(ctx, round(CX0 + cos(a) * rr), round(cy + sin(a) * rr), 1, 1, lightSide > 0.5 ? P.yellow : lightSide > -0.4 ? P.orange : P.tanShade);
  }
  // turned by hand: the crank drives the pearls (8 per turn)
  const turn = max(0, lt - 2.15) * 0.55 * TAU;
  const head = (HEAD0 + floor(mod((turn / TAU) * 8, 8))) % 8;
  const pr = 4.2 * s;
  const halo = glowSprite(max(3, round(pr + 5)), max(3, round(pr + 5)), P.yellow, 0.3);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU - PI / 2;
    const px = CX0 + cos(a) * rr;
    const py = cy + sin(a) * rr;
    const age = (head - k + 8) % 8;
    const glow = age === 0 ? 1 : age === 1 ? 0.5 : age === 2 ? 0.22 : 0;
    if (glow > 0) glowAt(ctx, halo, px, py, glow);
    ellipse(ctx, px, py, pr + 1, pr + 1, P.orange);
    ellipse(ctx, px, py, pr, pr, P.tan);
    ellipse(ctx, px - 0.6, py - 0.6, pr - 0.8, pr - 0.8, glow > 0.9 ? P.white : P.cream);
    if (glow > 0.3 && glow < 0.9) ellipse(ctx, px - 0.8, py - 0.8, pr - 1.6, pr - 1.6, P.white);
    if (pr > 2.6) {
      R(ctx, round(px - pr * 0.5), round(py - pr * 0.5), 2, 1, P.white);
      R(ctx, round(px - pr * 0.5), round(py - pr * 0.5) + 1, 1, 1, P.white);
    }
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
    ctx.fillRect(round(CX0 + cos(a) * domeR), round(gTop + sin(a) * domeR * 0.85), 1, 1);
  }
  ctx.fillStyle = A(P.white, 0.38);
  ctx.fillRect(round(gl + 5 * s), round(gTop - domeR * 0.15), 2, round(gBot - gTop - 10 * s));
  const nb = ceil(domeR * 0.9);
  for (let i = 0; i <= nb; i++) {
    const a = PI * 1.12 + (i / nb) * PI * 0.28;
    ctx.fillRect(round(CX0 + cos(a) * (domeR - 5 * s)), round(gTop + sin(a) * (domeR - 5 * s) * 0.85), 2, 1);
  }
  R(ctx, round(gl - 2), round(gBot - 1), round(gr - gl + 5), 2, P.orange);
  R(ctx, round(gl - 2), round(gBot - 1), round(gr - gl + 5), 1, P.yellow);
  ellipse(ctx, CX0, gTop - domeR * 0.85 - 2, 2.5 * s, 2.5 * s, A(P.silver, 0.45));
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
  const reach = ramp(lt, 1.3, 2.15);
  if (reach > 0) gloveHand(ctx, lerp(W + 40, hx + 5 * s, reach), lerp(hy + 30, hy + 1, reach), s * 1.4);
  // the super: name of the piece, then the provenance
  const a1 = ramp(lt, 1.7, 2.3);
  art(ctx, serif('gb-heirloom', 'THE HEIRLOOM', 2), 92, 86, a1);
  art(ctx, serif('gb-spinner', 'SPINNER', 2), 92, 102, a1);
  if (a1 > 0) R(ctx, round(92 - 30 * a1), 119, round(60 * a1), 1, A(P.orange, 0.8));
  art(ctx, label('gb-hand', 'HAND-TURNED IN GENEVA', 1, P.silver), 92, 125, ramp(lt, 2.1, 2.7));
}

// --- 4. the suite: the pillow that is never quite done ----------------------------------
// The housekeeper stands at the bedside in three-quarter view, lit by the
// bedside lamp; the bed runs in from the left under a moonlit window.
const suite = () => bake('gb-suite', W, H, (c) => {
  R(c, 0, 0, W, H, P.ink);
  R(c, 0, 0, W, 6, P.black);
  R(c, 0, 6, W, 1, P.slate);
  // the window: night sky, a silver moon, the roofs of the old town
  const wx = 292;
  const wy = 16;
  const ww = 78;
  const wh = 104;
  R(c, wx - 3, wy - 3, ww + 6, wh + 6, P.black);
  ditherField(c, wx, wy, ww, wh, [P.black, P.ink, P.slate], (x, y) => 0.25 + ((y - wy) / wh) * 0.7);
  ellipse(c, wx + 56, wy + 22, 4.5, 4.5, P.silver);
  R(c, wx + 54, wy + 20, 2, 1, P.white);
  for (let k = 0; k < 7; k++) {
    const bx = wx + k * 12 - 2;
    const bh = 10 + floor(hash(k + 70) * 18);
    pt(bx, wy + wh);
    pt(bx, wy + wh - bh);
    pt(bx + 6, wy + wh - bh - 5);
    pt(bx + 12, wy + wh - bh);
    pt(bx + 12, wy + wh);
    fillPts(c, P.black);
    if (hash(k + 90) > 0.55) R(c, bx + 4, wy + wh - bh + 4, 1, 1, P.tanShade);
  }
  R(c, wx + 38, wy, 1, wh, P.black);
  R(c, wx, wy + 40, ww, 1, P.black);
  R(c, wx - 5, wy + wh + 3, ww + 10, 3, P.slate);
  R(c, wx - 5, wy + wh + 3, ww + 10, 1, P.fog);
  // heavy curtains in slate: folds lit on the lamp side
  for (const [x0, w] of [[wx - 16, 18], [wx + ww - 2, 16]]) {
    R(c, x0, 10, w, 150, P.slate);
    for (let k = 0; k < w; k += 5) {
      R(c, x0 + k, 10, 1, 150, P.steel);
      R(c, x0 + k + 3, 10, 2, 150, P.ink);
    }
    shadeBake(c, x0, 10, w, 150, 0.7, (x, y) => (y - 110) / 60);
  }
  R(c, wx - 18, 8, ww + 36, 5, P.slate);
  R(c, wx - 18, 8, ww + 36, 1, P.steel);
  // the bedside lamp's warm pool at the left
  glowBake(c, 18, 70, 120, 90, P.yellow, 0.22);
  // headboard: tufted slate velvet, a lit top roll, buttons
  R(c, 20, 60, 190, 72, P.black);
  R(c, 22, 62, 186, 70, P.slate);
  R(c, 22, 62, 186, 2, P.steel);
  R(c, 22, 64, 186, 1, P.fog);
  for (let y = 70; y < 128; y += 9) {
    for (let x = 28 + ((y / 9) & 1) * 7; x < 206; x += 14) {
      R(c, x, y, 1, 1, P.ink);
      R(c, x - 3, y + 4, 2, 1, P.ink);
      R(c, x + 2, y + 4, 2, 1, P.ink);
    }
  }
  shadeBake(c, 22, 62, 186, 70, 0.78, (x) => (x - 100) / 120);
  // nightstand and lamp at the far left
  R(c, 0, 104, 22, 112, P.maroon);
  R(c, 0, 104, 22, 2, P.brown);
  R(c, 0, 106, 22, 1, P.tanShade);
  R(c, 8, 90, 3, 14, P.tanShade);
  R(c, 9, 90, 1, 14, P.orange);
  pt(-2, 90);
  pt(20, 90);
  pt(16, 74);
  pt(2, 74);
  fillPts(c, P.cream);
  R(c, 2, 74, 14, 1, P.white);
  R(c, 0, 89, 21, 1, P.tan);
  // floor beyond the bed, under the window
  R(c, 212, 168, W - 212, H - 168, P.black);
  R(c, 212, 168, W - 212, 1, P.ink);
});
const bed = () => bake('gb-bed', W, H, (c) => {
  // the duvet's top: moonlight on the right, lamplight on the left, soft folds
  pt(18, 126);
  pt(214, 126);
  pt(236, 172);
  pt(0, 172);
  fillPts(c, P.silver, { d: P.fog, f: 0.22, m: 1, l: P.white, lf: 0.18, lm: 1, side: 1 });
  for (let k = 0; k < 5; k++) {
    const x = 40 + k * 38;
    line(c, x, 130, x - 10 + (k & 1) * 6, 170, P.fog);
    line(c, x + 1, 130, x - 9 + (k & 1) * 6, 170, P.white);
  }
  // the turned-down corner: the duvet folded back shows the sheet
  pt(150, 128);
  pt(214, 128);
  pt(226, 152);
  fillPts(c, P.white);
  pt(150, 128);
  pt(226, 152);
  pt(176, 150);
  fillPts(c, P.fog);
  line(c, 150, 128, 226, 152, P.steel);
  // a navy runner across the foot of the bed
  pt(14, 156);
  pt(230, 156);
  pt(234, 166);
  pt(6, 166);
  fillPts(c, P.slate);
  line(c, 12, 157, 230, 157, P.steel);
  line(c, 8, 165, 233, 165, P.ink);
  // the side of the bed falls into shade
  pt(0, 172);
  pt(236, 172);
  pt(236, 216);
  pt(0, 216);
  fillPts(c, P.fog);
  R(c, 0, 172, 236, 1, P.white);
  shadeBake(c, 0, 173, 236, 43, 0.72, (x, y) => (y - 176) / 34);
  shadeBake(c, 0, 173, 236, 43, 0.8, (x, y) => (y - 196) / 24);
  for (let x = 20; x < 236; x += 30) line(c, x, 174, x - 2, 216, A(P.steel, 0.6));
  // the far pillow, already perfect, with its chocolate
  pillow(c, 72, 124, 54, 18, 1);
  R(c, 70, 120, 5, 3, P.brown);
  R(c, 70, 120, 5, 1, P.yellow);
  R(c, 74, 121, 1, 2, P.maroon);
});
const PILLOW_SH = { d: P.silver, f: 0.36, m: 1, dd: P.fog, df: 0.12, l: P.white, lf: 0.1, side: 1 };
/** A feather pillow: soft corners, three tones lit from the left, piping; sq < 1 squeezes it. */
function pillow(ctx, cx, cy, w, h, sq) {
  const hw = (w / 2) * sq;
  const hh = (h / 2) * (1 + (1 - sq) * 0.7);
  pt(cx - hw, cy - hh);
  pt(cx, cy - hh + 1.4);
  pt(cx + hw, cy - hh);
  pt(cx + hw - 2, cy);
  pt(cx + hw, cy + hh);
  pt(cx, cy + hh - 0.8);
  pt(cx - hw, cy + hh);
  pt(cx - hw + 2, cy);
  fillPts(ctx, P.white, PILLOW_SH);
  line(ctx, cx - hw + 2, cy - hh + 1, cx + hw - 3, cy - hh + 1, P.silver);
  line(ctx, cx - hw + 3, cy + hh - 1, cx + hw - 2, cy + hh - 1, P.fog);
  line(ctx, cx - hw * 0.3, cy - hh * 0.2, cx + hw * 0.2, cy + hh * 0.35, P.silver);
}
// The plumping routine, 2.6 s, then it starts again from the top. The pillow's
// path (0 on the bed .. 1 at her chest), the pats and the smoothing hand.
const LOOP = 2.6;
const M_HOLD = [0, 0, 0.45, 0, 0.95, 1, 1.55, 1, 2.0, 0, 2.6, 0];
const M_REACH = [0, 0.3, 0.42, 1, 2.0, 1, 2.35, 0.3, 2.6, 0.3];
// Hand targets round the pillow: x in half-widths from its centre (-1 left
// edge), y in pixels from its centre. Both tracks end where they start, so the
// loop has no seam: the smoothing hand is already where the next lift begins.
const M_LX = [0, 0.45, 0.42, -1, 2.0, -1, 2.35, 0.55, 2.6, 0.45];
const M_LY = [0, -6, 0.42, 1, 2.0, 1, 2.12, -6, 2.6, -6];
const M_RX = [0, 0.8, 0.42, 1, 2.0, 1, 2.2, 0.8, 2.6, 0.8];
const M_RY = [0, -3, 0.42, 1, 2.0, 1, 2.2, -3, 2.6, -3];
const PB_X = 196;
const PB_Y = 126;
const PH_X = 210;
const PH_Y = 104;
const QM = person();
function shotSuite(ctx, lt) {
  ctx.drawImage(suite(), 0, 0);
  const p = mod(lt + 0.35, LOOP);
  const hold = keys(p, M_HOLD);
  const reach = keys(p, M_REACH);
  const pat = p > 1.0 && p < 1.5 ? max(0, sin(((p - 1.0) / 0.5) * TAU * 2)) : 0;
  const lean = reach * (1 - hold);
  QM.x = 240 - round(lean * 5);
  QM.top = 42 + round(lean * 4);
  QM.hh = 26;
  QM.sw = 0.88;
  QM.turn = -0.42;
  QM.down = 0;
  QM.look = -1;
  bust(ctx, QM, MAID, H + 2);
  ctx.drawImage(bed(), 0, 0);
  // the pillow: on the bed, or lifted in front of her
  const e = smooth(hold);
  const px = lerp(PB_X, PH_X, e);
  const py = lerp(PB_Y, PH_Y, e) - sin(PI * hold) * 3;
  const pw = lerp(50, 44, e);
  const ph = lerp(18, 26, e);
  const sq = 1 - pat * 0.13;
  pillow(ctx, px, py, pw, ph, sq);
  // hands: on both sides of the pillow, or one smoothing it flat; between
  // routines they lift off it a little
  const half = (pw / 2) * sq + 1;
  const off = (1 - reach) * 8;
  const smoothing = p > 2.05 || p < 0.3;
  armTo(QM, -1, px + keys(p, M_LX) * half - off * 0.6, py + keys(p, M_LY) - off, 1);
  armDraw(ctx, QM, MAID, smoothing ? 'rest' : 'flat');
  armTo(QM, 1, px + keys(p, M_RX) * half + off * 0.2, py + keys(p, M_RY) - off, 1);
  armDraw(ctx, QM, MAID, smoothing ? 'rest' : 'flat');
}

// --- 5. dinner: the watch, then the cloche ----------------------------------------------
const diningBack = () => bake('gb-dining', W, H, (c) => {
  R(c, 0, 0, W, H, P.ink);
  // wallpaper: a faint slate lattice
  for (let y = 10; y < 104; y += 12) {
    for (let x = ((y / 12) & 1) * 8; x < W; x += 16) {
      R(c, x, y, 1, 1, P.slate);
      R(c, x - 2, y + 3, 1, 1, A(P.slate, 0.6));
      R(c, x + 2, y + 3, 1, 1, A(P.slate, 0.6));
    }
  }
  R(c, 0, 0, W, 6, P.black);
  R(c, 0, 6, W, 1, P.tanShade);
  // a dark lake at dusk in a slim gilt frame, high on the right
  const fx = 290;
  const fy = 18;
  const fw = 80;
  const fh = 52;
  R(c, fx, fy, fw, fh, P.orange);
  R(c, fx, fy, fw, 1, P.yellow);
  R(c, fx + 1, fy + 1, fw - 2, fh - 2, P.tanShade);
  ditherField(c, fx + 3, fy + 3, fw - 6, fh - 6, [P.black, P.ink, P.slate], (x, y) => 0.95 - (y - fy) / (fh * 0.7));
  for (let k = 0; k < 3; k++) {
    pt(fx + 3 + k * 26, fy + fh - 14);
    pt(fx + 16 + k * 26, fy + fh - 24 + (k % 2) * 5);
    pt(fx + 29 + k * 26, fy + fh - 14);
    fillPts(c, P.black);
  }
  R(c, fx + 3, fy + fh - 14, fw - 6, 11, P.ink);
  R(c, fx + 3, fy + fh - 12, fw - 6, 1, A(P.steel, 0.5));
  // candlelight on the wall
  glowBake(c, 70, 100, 90, 70, P.yellow, 0.2);
  glowBake(c, 34, 50, 26, 24, P.yellow, 0.18);
  R(c, 33, 52, 3, 8, P.tanShade);
  R(c, 33, 46, 3, 6, P.cream);
  R(c, 34, 44, 1, 2, P.yellow);
  // wainscot
  R(c, 0, 104, W, 50, P.brown);
  R(c, 0, 104, W, 2, P.tanShade);
  R(c, 0, 106, W, 1, P.maroon);
  for (let x = 6; x < W; x += 40) {
    R(c, x, 112, 32, 40, P.maroon);
    R(c, x + 1, 113, 30, 39, P.brown);
    R(c, x + 1, 113, 30, 1, P.tanShade);
  }
  shadeBake(c, 0, 104, W, 50, 0.7, (x) => (x - 120) / 260);
});
const TABLE_Y = 150; // the far edge of the tablecloth, at the diners
const diningTable = () => bake('gb-table', W, H, (c) => {
  // the cloth: lit by the candles from the left, a pressed fold, the drop in shade
  pt(0, TABLE_Y);
  pt(W, TABLE_Y);
  pt(W, 178);
  pt(0, 178);
  fillPts(c, P.silver);
  shadeBake(c, 0, TABLE_Y, W, 28, 0.86, (x) => (x - 160) / 280);
  R(c, 0, TABLE_Y, W, 1, P.fog);
  R(c, 0, 177, W, 1, P.white);
  R(c, 0, 178, W, H - 178, P.steel);
  shadeBake(c, 0, 178, W, H - 178, 0.62, (x, y) => (y - 182) / 24);
  for (let x = 14; x < W; x += 30) R(c, x, 179, 1, H - 179, P.slate);
  // candelabra
  const cx = 64;
  R(c, cx - 8, 156, 17, 3, P.fog);
  R(c, cx - 8, 156, 17, 1, P.white);
  R(c, cx - 1, 118, 3, 38, P.silver);
  R(c, cx, 118, 1, 38, P.white);
  R(c, cx - 16, 118, 33, 2, P.silver);
  R(c, cx - 16, 118, 33, 1, P.white);
  for (const k of [-16, 0, 16]) {
    R(c, cx + k - 1, 102, 3, 16, P.cream);
    R(c, cx + k - 1, 102, 1, 16, P.white);
    R(c, cx + k - 2, 117, 5, 1, P.fog);
  }
  // the second place setting, and the guest's plate under its cloche
  ellipse(c, 300, 162, 16, 3.5, P.fog);
  ellipse(c, 300, 161.5, 15, 3, P.white);
  R(c, 280, 160, 1, 6, P.fog);
  R(c, 320, 160, 1, 6, P.fog);
  ellipse(c, CL_X, 158, 17, 3.8, P.fog);
  ellipse(c, CL_X, 157.5, 16, 3.2, P.white);
});
function flame(ctx, x, y, lt, k) {
  const f = sin(lt * 9 + k * 2) + sin(lt * 13.7 + k);
  glowAt(ctx, glowSprite(10, 9, P.yellow, 0.22), x, y - 3, 0.8 + f * 0.08);
  R(ctx, x, y - 4 - (f > 0.8 ? 1 : 0), 1, 4 + (f > 0.8 ? 1 : 0), P.yellow);
  R(ctx, x, y - 2, 1, 2, P.cream);
}
const CL_X = 176;
const D_WATCH = [0, 0, 0.25, 0, 0.8, 1, 1.45, 1, 1.95, 0.2];
const QN = person();
const QW = person();
const CLOCHE_SH = { d: P.fog, f: 0.3, m: 1, dd: P.steel, df: 0.1, l: P.white, lf: 0.14, lm: 1, side: 1 };
function cloche(ctx, cx, base, rx, ry) {
  spanEllipse(cx, base, rx, ry);
  // keep only the upper half: a dome
  let j = 0;
  for (let i = 0; i < SN; i++) {
    if (SY[i] < base) {
      SL[j] = SL[i];
      SR[j] = SR[i];
      SY[j] = SY[i];
      j++;
    }
  }
  SN = j;
  paintSpans(ctx, P.silver, CLOCHE_SH);
  R(ctx, cx - rx, base - 1, rx * 2, 2, P.fog);
  R(ctx, cx - rx, base - 1, rx * 2, 1, P.white);
  // a horizon band of the room reflected round the dome, a candle's glint
  R(ctx, cx - rx * 0.8, base - ry * 0.42, rx * 1.6, 1, P.steel);
  R(ctx, cx - rx * 0.55, base - ry * 0.72, 2, max(2, ry * 0.25), P.white);
  R(ctx, cx - rx * 0.62, base - ry * 0.55, 1, 1, P.orange);
  ellipse(ctx, cx, base - ry - 1.5, max(1.5, rx * 0.16), max(1, ry * 0.1), P.fog);
  R(ctx, cx - 1, base - ry - 2, 1, 1, P.white);
}
function shotDinnerWide(ctx, lt) {
  ctx.drawImage(diningBack(), 0, 0);
  // the seated guest checks his watch, head bowed to it, then lowers his arm
  const watch = keys(lt, D_WATCH);
  QN.x = 128;
  QN.top = 50 + round((1 - cos(lt * 1.4)) / 2);
  QN.hh = 27;
  QN.sw = 0.94;
  QN.down = watch > 0.45 ? 1 : 0;
  QN.turn = watch * 0.22;
  bust(ctx, QN, DINER, TABLE_Y + 6);
  // the waiter, standing, leaning in a little, gloved hand on the cloche
  QW.x = 214;
  QW.top = 30 + round((1 - cos(lt * 1.2 + 2)) / 2);
  QW.hh = 27;
  QW.sw = 0.9;
  QW.down = 1;
  QW.turn = -0.3;
  bust(ctx, QW, WAITER, TABLE_Y + 6);
  ctx.drawImage(diningTable(), 0, 0);
  for (let k = -16; k <= 16; k += 16) flame(ctx, 64 + k, 102, lt, k);
  cloche(ctx, CL_X, 157, 14, 15);
  armTo(QW, -1, CL_X + 3, 140, 1);
  armDraw(ctx, QW, WAITER, 'grip');
  // the diner's hands: one resting, the other up to read the watch
  armTo(QN, -1, 112, 160, 0.6);
  armDraw(ctx, QN, DINER, 'rest');
  armTo(QN, 1, lerp(146, 140, watch), lerp(161, 122, watch), 1);
  armDraw(ctx, QN, DINER, watch > 0.3 ? 'grip' : 'rest');
  if (watch > 0.3) {
    R(ctx, ARM.wx - 2, ARM.wy - 1, 3, 2, P.yellow);
    R(ctx, ARM.wx - 1, ARM.wy - 1, 1, 1, P.cream);
  }
}
// The insert: the plate from above. A gloved hand lifts the cloche out of frame;
// on the plate, eight truffles in a ring, lit one after another: the spinner.
const plateBg = () => bake('gb-plate', W, H, (c) => {
  ditherField(c, 0, 0, W, H, [P.steel, P.fog, P.silver], (x, y) => 0.98 - hypot((x - 40) / 420, (y + 10) / 300) * 1.15);
  R(c, 0, 186, W, 1, P.fog);
  R(c, 0, 187, W, 1, P.silver);
  glowBake(c, 30, 10, 200, 110, P.yellow, 0.1);
  // the plate: shadow, rim, gold band, the well
  ellipse(c, 196, 134, 84, 38, P.steel);
  ellipse(c, 192, 130, 82, 36, P.fog);
  ellipse(c, 191, 129, 80, 35, P.white, { d: P.silver, f: 0.16, m: 1, side: 1 });
  ellipse(c, 191, 129, 67, 29, P.yellow);
  ellipse(c, 191, 129, 66, 28.4, P.white);
  ellipse(c, 192, 130, 56, 24, P.silver);
  ellipse(c, 191, 129, 55, 23, P.white);
  // cutlery
  for (const [x, knife] of [[90, false], [100, false], [286, true], [296, true]]) {
    R(c, x, 104, 3, 56, P.fog);
    R(c, x, 104, 1, 56, P.white);
    R(c, x + 3, 106, 1, 56, P.steel);
    if (!knife) for (let k = 0; k < 3; k++) R(c, x - 1 + k * 2, 96, 1, 9, P.silver);
    else R(c, x, 92, 4, 14, P.silver);
  }
  // a wine glass, top right
  ellipse(c, 334, 50, 16, 7, P.fog);
  ellipse(c, 334, 50, 14.5, 5.8, P.silver);
  ellipse(c, 335, 51, 12, 4.4, P.maroon);
  R(c, 326, 48, 5, 1, P.white);
});
const TRUFFLE_DARK = { d: P.black, f: 0.45, m: 1, l: P.slate, lf: 0.2, lm: 1, side: 1 };
const TRUFFLE_GOLD = { d: P.orange, f: 0.4, m: 1, dd: P.tanShade, df: 0.12, l: P.cream, lf: 0.2, lm: 1, side: 1 };
const TRUFFLE_WARM = { d: P.brown, f: 0.4, m: 1, l: P.tanShade, lf: 0.2, lm: 1, side: 1 };
function shotPlate(ctx, t) {
  ctx.drawImage(plateBg(), 0, 0);
  // eight truffles in a ring; the lit one walks round like a loading spinner
  const head = floor(mod(t * 7, 8));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU - PI / 2;
    const x = 191 + cos(a) * 31;
    const y = 128 + sin(a) * 13;
    const age = (head - k + 8) % 8;
    ellipse(ctx, x + 1.5, y + 2.5, 5, 2.4, P.fog);
    if (age === 0) ellipse(ctx, x, y, 4.6, 3.8, P.yellow, TRUFFLE_GOLD);
    else if (age <= 2) ellipse(ctx, x, y, 4.6, 3.8, P.tanShade, TRUFFLE_WARM);
    else ellipse(ctx, x, y, 4.6, 3.8, P.ink, TRUFFLE_DARK);
    R(ctx, x - 2, y - 2, 1, 1, age === 0 ? P.white : P.fog);
  }
  // steam, once the cloche is off
  const st = prog(t, 0.75, 1.3);
  if (st > 0) {
    for (let w = 0; w < 3; w++) {
      for (let i = 0; i < 9; i++) {
        const u = mod(i / 9 + t * 0.35 + w * 0.31, 1);
        const sx = 172 + w * 19 + sin(u * 5 + w * 2 + t * 1.5) * (2 + u * 4);
        const sy = 122 - u * 46;
        ctx.fillStyle = A(P.white, 0.45 * st * (1 - u) * (u < 0.1 ? u * 10 : 1));
        ctx.fillRect(round(sx), round(sy), 1, 2);
      }
    }
  }
  // the cloche lifts straight up and out of frame
  const lift = sine(prog(t, 0.25, 1.0));
  const oy = -lift * 190;
  if (lift < 0.35) {
    ctx.globalAlpha = 0.45 * (1 - lift / 0.35);
    ellipse(ctx, 194, 134, 70, 28, P.steel);
    ctx.globalAlpha = 1;
  }
  if (oy > -170) {
    cloche(ctx, 191, 134 + oy, 70, 60);
    // the gloved hand on the knob, the white sleeve running out of frame
    const kx = 191;
    const ky = 134 + oy - 64;
    capsule(ctx, kx + 8, ky - 4, kx + 60, ky - 70, 7, 9, P.fog);
    capsule(ctx, kx + 8, ky - 5, kx + 60, ky - 71, 5.5, 7.5, P.silver);
    capsule(ctx, kx + 5, ky - 2, kx + 10, ky - 7, 5, 5, P.white);
    ellipse(ctx, kx + 1, ky + 1, 6, 5, P.silver, { d: P.fog, f: 0.35, m: 1, side: 1 });
    for (let k = 0; k < 3; k++) R(ctx, kx - 4 + k * 3, ky + 3, 2, 1, P.fog);
    R(ctx, kx - 3, ky - 3, 3, 1, P.white);
  }
}
function shotDinner(ctx, lt) {
  if (lt < T_INSERT) shotDinnerWide(ctx, lt);
  else shotPlate(ctx, lt - T_INSERT);
}

// --- 6. end slate ------------------------------------------------------------------------
const slateBg = () => bake('gb-slate', W, H, (c) => {
  ditherField(c, 0, 0, W, H, [P.black, P.ink], (x, y) => 1 - hypot((x - 192) / 260, (y - 92) / 150));
});
// Legal: nine words, in fog, on screen from the wordmark to the end (3.5 s).
const SLATE_LEGAL = 'CHECK-OUT TIME: CALCULATING.';
const SLATE_LEGAL2 = 'PLEASE DO NOT REFRESH THE CONCIERGE.';
const GLINT_OPTS = { width: 6, alpha: 0.55 };
function shotSlate(ctx, lt) {
  ctx.drawImage(slateBg(), 0, 0);
  const e = ramp(lt, 0.5, 1.0);
  if (e > 0) {
    ctx.globalAlpha = e;
    dots(ctx, 192, 54, 8, 1.6, (T_SLATE + lt) * 2, P.yellow, P.orange, P.tanShade);
    ctx.globalAlpha = 1;
  }
  const mark = serif('gb-mark', 'THE GRAND BUFFER', 3);
  // the wordmark fades up and settles two pixels, then holds; one slow glint
  const rev = ramp(lt, 0.6, 1.3);
  const mx = round(192 - mark.width / 2);
  const my = 76 + round((1 - rev) * 2);
  if (rev > 0) {
    ctx.globalAlpha = rev;
    ctx.drawImage(mark, mx, my);
    ctx.globalAlpha = 1;
  }
  if (lt > 2.4) glint(ctx, mark, mx, 76, prog(lt, 2.4, 3.4), GLINT_OPTS);
  // hairline with a centre lozenge
  const hw = round(70 * ramp(lt, 1.0, 1.6));
  if (hw > 0) {
    R(ctx, 192 - hw - 4, 97, hw, 1, P.orange);
    R(ctx, 196, 97, hw, 1, P.orange);
    R(ctx, 191, 96, 3, 3, P.yellow);
  }
  art(ctx, label('gb-sub', 'HOTEL * GENEVA * SINCE 1897', 2, P.fog), 192, 104, ramp(lt, 1.2, 1.7));
  // the tagline on the VO, and a progress hairline that stops at 99 %
  art(ctx, label('gb-tag', "YOU'RE ALMOST THERE.", 2, P.cream, 'body'), 192, 128, ramp(lt, 1.6, 2.2));
  const pa = ramp(lt, 1.9, 2.3);
  if (pa > 0) {
    ctx.globalAlpha = pa;
    R(ctx, 142, 146, 100, 1, P.slate);
    R(ctx, 142, 146, round(99 * io(prog(lt, 2.0, 3.3))), 1, P.yellow);
    ctx.globalAlpha = 1;
    art(ctx, label('gb-99', '99%', 1, P.fog), 252, 144, pa);
  }
  const la = ramp(lt, 0.8, 1.3);
  art(ctx, label('gb-legal', SLATE_LEGAL, 1, P.fog), 192, 190, la);
  art(ctx, label('gb-legal2', SLATE_LEGAL2, 1, P.fog), 192, 198, la);
}

// --- shot list and transitions -------------------------------------------------------------
// tr: 'dissolve' (cross-fade) | 'dip' (through black) | 'match' (a graphic
// match: the new shot opens framed so its ring of pearls sits on the clock's
// ring of dots and dissolves in on a slower curve) over d seconds.
const SHOTS = [
  { at: T_EXT, draw: shotExterior },
  { at: T_LOBBY, draw: shotLobby, tr: 'dissolve', d: 0.8 },
  { at: T_JEWEL, draw: shotJewel, tr: 'match', d: 1.0 },
  { at: T_SUITE, draw: shotSuite, tr: 'dissolve', d: 0.8 },
  { at: T_DINNER, draw: shotDinner, tr: 'dissolve', d: 0.8 },
  { at: T_SLATE, draw: shotSlate, tr: 'dip', d: 1.0 },
];
// Pre-bake: while the opening shot plays, render one other shot per frame
// (at lt 1 and lt 3, which reach every baked layer, the insert included) into
// a hidden canvas, so no cut ever waits for a bake. Shot draws are pure.
let warmed = 0;
const WARM_LT = [1, 3];
function warm(dt) {
  if (warmed >= (SHOTS.length - 1) * 2 + 1) return;
  if (warmed === 0) {
    buf('gb-tb');
    warmed++;
    return;
  }
  const k = warmed - 1;
  const s = SHOTS[1 + (k >> 1)];
  warmed++;
  if (dt >= s.at) return; // already on air: it baked itself
  s.draw(buf('gb-warm').c, WARM_LT[k & 1]);
}
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
    } else {
      prev.draw(ctx, dt - prev.at);
      const b = buf('gb-tb');
      s.draw(b.c, lt);
      ctx.globalAlpha = s.tr === 'match' ? smooth(prog(p, 0.1, 0.95)) : sine(p);
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
    { at: 4.2, text: 'one hotel has never once been in a hurry.' },
    { at: 9.0, text: 'Every spinner is still turned by hand.' },
    { at: 12.5, text: 'Every suite... almost ready.' },
    { at: 15.9, text: 'Dinner will be served... shortly.' },
    { at: 20.2, text: "The Grand Buffer. You're almost there." },
  ],
  // A string quartet and harp in D major at 78 bpm: eight bars, 32 beats =
  // 24.6 s = the spot. The desk bell rings on beat 7.5 (5.77 s, the guest's
  // tap); the last bar sits on A7 and the melody stops on its leading note,
  // C#, never resolving to D: almost there. Every track is 32 beats.
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
        notes: 'R:6 A4:2 F#4:1 A4:1 D5:3 B4:1 A4:3 R:1 F#4:2 A4:1 D5:1 B4:3 G4:1 B4:1 A4:1 G4:1 E4:1 C#5:2',
      },
      { kind: 'harmony', inst: 'bell', gain: 0.45, notes: 'R:7.5 A6:1 R:23.5' },
    ],
  },
  draw(ctx, t, dt) {
    warm(dt);
    run(ctx, dt);
  },
};
