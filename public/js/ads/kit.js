// Commercial-break toolkit (owner: ads-1). Integer-only pixel primitives, an
// ASCII sprite compiler with automatic outlines, little pixel people, a shot
// sequencer with transitions, motion/easing helpers, camera moves, kinetic
// type, product hero furniture and the shared end slate. Every draw function
// is a pure function of its inputs; module state is only lazily-built caches
// of static art and a few pooled scratch canvases (rewritten before each use).
// Nothing here allocates canvases, gradients or JSON per frame.
//
// AN AD MODULE default-exports { id, brand, duration, voice, script:[{at,text}],
// tune, draw(ctx, t, dt, info) } and usually draws with play(ctx, dt, info, SHOTS).
//
// SHOTS: play(ctx, dt, info, [{ at, draw(ctx, lt, info, dt), wipe, wd, ...o }])
//   lt = seconds since the shot started; the last shot holds while the VO overruns.
//   wipe (transition INTO this shot, wd seconds): 'cut' (default) | 'whip' (fast
//   smeared pan, o.dir = 1 | -1) | 'match' (match dissolve growing from the shared
//   shape at o.cx, o.cy) | 'iris' (circle opens at o.cx, o.cy) | 'irisInOut'
//   (closes to black on o.fx, o.fy then opens on o.cx, o.cy) | 'slide' (new shot
//   slides over, o.dir) | 'push' | 'blocks' | 'bars' | 'dissolve' | 'diag' | 'flash'.
// MOTION: key(t, [[t0, v0], [t1, v1, ease], ...]) keyframe track (numbers or arrays,
//   ease names in EASE or functions); tween(t, t0, t1, a, b, ease); spring(x),
//   wobble(t, t0, amp, hz, damp) damped jiggle after an impact; easeInBack (anticipation),
//   easeOutBack (overshoot), easeInOutBack, easeOutElastic, smooth; jump(t, t0, o) ->
//   { y, sx, sy } hop with crouch, stretch and landing squash; squashArt(ctx, art, cx,
//   by, sx, sy) draws cached art scaled about its bottom centre; blink(t, seed),
//   breath(t, period, amp) idle life.
// LIMBS: armPose(name), poseLerp(a, b, p) and poseAt(t, keys) tween hero() arm poses
//   with preserved bone lengths (arcs, not straight lines); pass the result as armL/armR.
// CAMERA: key() for x/y, withCam(ctx, x, y, fn) integer pan, par(x, depth) parallax,
//   kick(t, t0, dur, amp, seed) decaying comedy shake, zoomed(ctx, z, fx, fy, fn) scale
//   about a focus point (nearest neighbour: use for crash zooms or integer scales only;
//   for slow push-ins redraw art natively bigger, e.g. faceCU size or canFront scale).
// TYPE: kinetic(ctx, s, x, y, lt, { style: 'pop'|'drop'|'slide'|'stamp'|'wave'|'type' }),
//   words(ctx, s, x, y, lt, { per }) word-by-word, micro(ctx, s, x, y, o) 3x5 micro font,
//   microWidth(s), bigText, para, bubble, slogan, finePrint (micro font legal strip).
// PRODUCT: cylinder(ctx, label, cx, y, r, turn, o) 2.5D turntable of a label texture,
//   spotlight(ctx, cx, floorY, o), badge(ctx, cx, cy, r, p, o) starburst sticker,
//   glint(ctx, art, x, y, p) light sweep, glow, sparkle, shadow.
// END SLATE: endSlate(ctx, lt, { bg, product, mark, sub, tagline, tag, url, pill,
//   legal }) the shared layout and timing (logo 0.15 s, tagline 0.9 s, url 1.4 s,
//   legal 1.6 s, a light sweep every 3.5 s).
// BRAND: wordmark(str, style) cached custom lettering + drawMark; lazy(fn) memoises a
//   factory so `const MARK = lazy(() => wordmark(...))` costs nothing per frame.
// MUSIC: tune(...parts), rep(s, n) build tune strings (format in audio.js).
import { P } from '../palette.js';
import * as FONT from '../font.js';
import { clamp, easeOut, easeInOut, mulberry32 } from '../util.js';

const { drawText, measureText, wrapText } = FONT;
// Cached, frozen wrap (font.js wrapLines) when available: no array per frame.
const wrapL = FONT.wrapLines || wrapText;

export { P, drawText, measureText, wrapText, clamp, easeOut, easeInOut, mulberry32 };

export const W = 384;
export const H = 216;
const { round, floor, ceil, sqrt, sin, PI, min, max, abs } = Math;

// ---------------------------------------------------------------------------
// Timing & easing

/** 0..1 progress of v between a and b. */
export const prog = (v, a, b) => clamp((v - a) / (b - a), 0, 1);
export const lerp = (a, b, p) => a + (b - a) * p;
export const easeIn = (x) => clamp(x, 0, 1) ** 3;
export function easeOutBack(x, s = 1.70158) {
  const v = clamp(x, 0, 1) - 1;
  return 1 + (s + 1) * v ** 3 + s * v ** 2;
}
export function easeOutBounce(x) {
  let v = clamp(x, 0, 1);
  const n = 7.5625;
  const d = 2.75;
  if (v < 1 / d) return n * v * v;
  if (v < 2 / d) return n * (v -= 1.5 / d) * v + 0.75;
  if (v < 2.5 / d) return n * (v -= 2.25 / d) * v + 0.9375;
  return n * (v -= 2.625 / d) * v + 0.984375;
}
/** Integer sine wobble. */
export const wave = (v, hz, amp, ph = 0) => round(sin((v * hz + ph) * PI * 2) * amp);
/** Frame index of an n-frame loop at fps. */
export const frame = (v, fps, n) => ((floor(v * fps) % n) + n) % n;
/** Deterministic camera shake offset [dx, dy]. */
export function shake(v, amp, seed = 1) {
  if (amp <= 0) return [0, 0];
  const rr = mulberry32(floor(v * 30) * 977 + seed);
  return [round((rr() * 2 - 1) * amp), round((rr() * 2 - 1) * amp)];
}

/** Smoothstep. */
export const smooth = (x) => {
  const v = clamp(x, 0, 1);
  return v * v * (3 - 2 * v);
};
/** Anticipation: dips below 0 before accelerating to 1. */
export function easeInBack(x, s = 1.70158) {
  const v = clamp(x, 0, 1);
  return v * v * ((s + 1) * v - s);
}
export function easeInOutBack(x, s = 1.70158) {
  const v = clamp(x, 0, 1);
  const k = s * 1.525;
  return v < 0.5 ? ((2 * v) ** 2 * ((k + 1) * 2 * v - k)) / 2 : ((2 * v - 2) ** 2 * ((k + 1) * (v * 2 - 2) + k) + 2) / 2;
}
export function easeOutElastic(x, period = 0.3) {
  const v = clamp(x, 0, 1);
  if (v === 0 || v === 1) return v;
  return 2 ** (-10 * v) * sin(((v - period / 4) * (2 * PI)) / period) + 1;
}
/** 0 -> 1 with a natural overshoot and settle (critically under-damped spring). */
export const spring = (x, hz = 1.6, damp = 5) => (x <= 0 ? 0 : 1 - Math.exp(-damp * x) * Math.cos(2 * PI * hz * x));
/** Damped jiggle after an impact at t0 (0 before t0): follow-through for props and squash. */
export const wobble = (v, t0, amp = 1, hz = 4, damp = 6) => (v < t0 ? 0 : amp * Math.exp(-damp * (v - t0)) * sin(2 * PI * hz * (v - t0)));

const ease0 = (x) => clamp(x, 0, 1);
/** Easing curves by name, for key() / tween() and shot data. */
export const EASE = {
  linear: ease0,
  in: (x) => clamp(x, 0, 1) ** 3,
  out: (x) => 1 - (1 - clamp(x, 0, 1)) ** 3,
  inOut: (x) => easeInOut(clamp(x, 0, 1)),
  smooth,
  inBack: easeInBack,
  outBack: easeOutBack,
  inOutBack: easeInOutBack,
  outBounce: easeOutBounce,
  outElastic: easeOutElastic,
  spring: (x) => spring(x * 1.2),
  step: (x) => (x >= 1 ? 1 : 0),
};
const easeFn = (e) => (typeof e === 'function' ? e : EASE[e] || EASE.inOut);

/**
 * Keyframe track: keys = [[t0, v0], [t1, v1, ease?], ...] sorted by time.
 * Values are numbers or same-length arrays; `ease` shapes the segment that ends
 * at that key (default 'inOut'). Holds the first/last value outside the range.
 */
export function key(v, keys) {
  const n = keys.length;
  if (!n) return 0;
  if (v <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < n; i++) {
    const k1 = keys[i];
    if (v < k1[0]) {
      const k0 = keys[i - 1];
      const p = easeFn(k1[2])((v - k0[0]) / (k1[0] - k0[0] || 1));
      const a = k0[1];
      const b = k1[1];
      if (typeof a === 'number') return a + (b - a) * p;
      const out = new Array(a.length);
      for (let j = 0; j < a.length; j++) out[j] = a[j] + (b[j] - a[j]) * p;
      return out;
    }
  }
  return keys[n - 1][1];
}
/** a -> b between t0 and t1 with an easing (name or function). */
export const tween = (v, t0, t1, a, b, ease = 'inOut') => a + (b - a) * easeFn(ease)((v - t0) / (t1 - t0 || 1));

/**
 * A hop starting at t0 (feet leave the ground): 0.12 s crouch before it, a
 * parabolic flight of `dur` seconds with stretch, and a squash that springs back
 * after landing. Returns { y (<= 0 is up), sx, sy } to feed squashArt().
 */
export function jump(v, t0, { dur = 0.5, height = 20, crouch = 0.12, squash = 0.22 } = {}) {
  const lt = v - t0;
  if (lt < -crouch) return { y: 0, sx: 1, sy: 1 };
  if (lt < 0) {
    const p = smooth((lt + crouch) / crouch);
    return { y: 0, sx: 1 + squash * 0.7 * p, sy: 1 - squash * p };
  }
  if (lt < dur) {
    const p = lt / dur;
    const st = 0.18 * (1 - Math.sin(p * PI)); // stretched when fast (take-off, landing)
    return { y: -4 * height * p * (1 - p), sx: 1 - st * 0.5, sy: 1 + st };
  }
  const s = wobble(v, t0 + dur, squash, 3, 7);
  return { y: 0, sx: 1 + s * 0.8, sy: 1 - s };
}

/** Typewriter: first n characters after `lt` seconds at `cps`. */
export const typed = (s, lt, cps = 20) => s.slice(0, max(0, floor(lt * cps)));

/** Deterministic blink: true for ~0.12 s every 2.5-4.5 s (seeded per character). */
export function blink(v, seed = 1, every = 3.4) {
  const slot = floor(v / every);
  const r = ((slot * 7919 + seed * 104729) % 1000) / 1000;
  const at = slot * every + 0.3 + r * (every - 0.6);
  return v >= at && v < at + 0.12;
}
/** Idle breathing bob in whole pixels (period seconds). */
export const breath = (v, period = 3.2, amp = 1, ph = 0) => round(((1 - Math.cos(((v + ph) / period) * 2 * PI)) / 2) * amp);

/** Is the announcer speaking one of `lines` right now (for mouth flaps)? */
export function talking(info, dt, lines = null) {
  if (!info || !info.speaking) return false;
  if (lines && !lines.includes(info.line)) return false;
  return floor(dt * 9) % 3 !== 0;
}

// ---------------------------------------------------------------------------
// Colour

const ALPHA = new Map();
/** rgba() string of a palette colour with alpha (for shadows and glows). */
export function A(hex, a) {
  let row = ALPHA.get(hex);
  if (!row) ALPHA.set(hex, (row = new Array(101)));
  const k = clamp(round(a * 100), 0, 100);
  let v = row[k];
  if (!v) {
    const n = parseInt(hex.slice(1), 16);
    v = row[k] = `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${k / 100})`;
  }
  return v;
}

// ---------------------------------------------------------------------------
// Primitives (all coordinates rounded to whole pixels)

export function R(ctx, x, y, w, h, c) {
  if (c) ctx.fillStyle = c;
  ctx.fillRect(round(x), round(y), round(w), round(h));
}

/** Rectangle with clipped corners (rad 0..3). */
export function rrect(ctx, x, y, w, h, c, rad = 2) {
  x = round(x);
  y = round(y);
  w = round(w);
  h = round(h);
  ctx.fillStyle = c;
  if (rad <= 0 || w < 2 * rad + 1 || h < 2 * rad + 1) return ctx.fillRect(x, y, w, h);
  const steps = rad === 1 ? [1] : rad === 2 ? [2, 1] : [3, 1, 1];
  ctx.fillRect(x, y + rad, w, h - 2 * rad);
  for (let i = 0; i < rad; i++) {
    const inset = steps[i];
    ctx.fillRect(x + inset, y + i, w - inset * 2, 1);
    ctx.fillRect(x + inset, y + h - 1 - i, w - inset * 2, 1);
  }
}

/** Bordered rounded panel. */
export function panel(ctx, x, y, w, h, fill, border = P.black, rad = 2) {
  if (border) rrect(ctx, x, y, w, h, border, rad);
  rrect(ctx, x + 1, y + 1, w - 2, h - 2, fill, max(0, rad - 1));
}

export function disc(ctx, cx, cy, rad, c) {
  cx = round(cx);
  cy = round(cy);
  ctx.fillStyle = c;
  const rr = (rad + 0.5) ** 2;
  for (let dy = -rad; dy <= rad; dy++) {
    const hw = floor(sqrt(rr - dy * dy));
    ctx.fillRect(cx - hw, cy + dy, hw * 2 + 1, 1);
  }
}

export function oval(ctx, cx, cy, rx, ry, c) {
  cx = round(cx);
  cy = round(cy);
  ctx.fillStyle = c;
  for (let dy = -ry; dy <= ry; dy++) {
    const f = 1 - (dy / (ry + 0.5)) ** 2;
    const hw = floor((rx + 0.5) * sqrt(max(0, f)));
    ctx.fillRect(cx - hw, cy + dy, hw * 2 + 1, 1);
  }
}

/** One-pixel circle outline. */
export function ring(ctx, cx, cy, rad, c) {
  cx = round(cx);
  cy = round(cy);
  ctx.fillStyle = c;
  const rr = (rad + 0.5) ** 2;
  const hw = (dy) => (abs(dy) > rad ? -1 : floor(sqrt(rr - dy * dy)));
  for (let dy = -rad; dy <= rad; dy++) {
    const w0 = hw(dy);
    const lo = min(w0, min(hw(dy - 1), hw(dy + 1)) + 1);
    ctx.fillRect(cx + lo, cy + dy, w0 - lo + 1, 1);
    ctx.fillRect(cx - w0, cy + dy, w0 - lo + 1, 1);
  }
}

/** Scanline polygon fill (any simple polygon), pixel-exact spans. */
const POLY_XS = []; // reused crossing list (no array per call)
export function poly(ctx, pts, c) {
  ctx.fillStyle = c;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    y0 = min(y0, p[1]);
    y1 = max(y1, p[1]);
  }
  const xs = POLY_XS;
  for (let y = floor(y0); y <= ceil(y1); y++) {
    const sy = y + 0.5;
    xs.length = 0;
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[(i + 1) % pts.length];
      if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) xs.push(ax + ((sy - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = round(xs[k]);
      const b = round(xs[k + 1]);
      if (b > a) ctx.fillRect(a, y, b - a, 1);
    }
  }
}

/** Bresenham line, w x w pixel pen. */
export function line(ctx, x0, y0, x1, y1, c, w = 1) {
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
  for (let n = 0; n < 2000; n++) {
    ctx.fillRect(x0, y0, w, w);
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

// Ordered-dither fills through tiny repeating patterns anchored to the canvas.
const TILES = {
  checker: ['#.', '.#'],
  sparse: ['#.', '..'],
  dots: ['#...', '....', '..#.', '....'],
  hlines: ['#', '.'],
  vlines: ['#.'],
  diag: ['#...', '.#..', '..#.', '...#'],
};
const PATS = new WeakMap();
export function dither(ctx, x, y, w, h, c, kind = 'checker') {
  let m = PATS.get(ctx);
  if (!m) PATS.set(ctx, (m = new Map()));
  const key = kind + c;
  let pat = m.get(key);
  if (!pat) {
    const rows = TILES[kind] || TILES.checker;
    const cv = document.createElement('canvas');
    cv.width = rows[0].length;
    cv.height = rows.length;
    const cx = cv.getContext('2d');
    cx.fillStyle = c;
    rows.forEach((row, yy) => [...row].forEach((ch, xx) => ch === '#' && cx.fillRect(xx, yy, 1, 1)));
    pat = ctx.createPattern(cv, 'repeat');
    m.set(key, pat);
  }
  ctx.fillStyle = pat;
  ctx.fillRect(round(x), round(y), round(w), round(h));
}

/** Vertical gradient as flat bands joined by 4-row dithered seams. */
export function bands(ctx, x, y, w, h, colors) {
  const n = colors.length;
  const at = (i) => y + round((i * h) / n);
  for (let i = 0; i < n; i++) R(ctx, x, at(i), w, at(i + 1) - at(i), colors[i]);
  for (let i = 1; i < n; i++) {
    const yb = at(i);
    dither(ctx, x, yb - 4, w, 2, colors[i], 'sparse');
    dither(ctx, x, yb - 2, w, 2, colors[i], 'checker');
    dither(ctx, x, yb, w, 2, colors[i - 1], 'sparse');
  }
}

/** Twinkling 4-point star, s = 0..3. */
export function sparkle(ctx, x, y, s, c = P.white) {
  if (s <= 0) return;
  x = round(x);
  y = round(y);
  ctx.fillStyle = c;
  ctx.fillRect(x - s, y, 2 * s + 1, 1);
  ctx.fillRect(x, y - s, 1, 2 * s + 1);
  if (s >= 3) {
    ctx.fillRect(x - 1, y - 1, 3, 3);
  }
}
const TWINKLE = [0, 1, 2, 3, 2, 1, 0, 0];
export const twinkle = (v, ph = 0, fps = 12) => TWINKLE[frame(v + ph, fps, TWINKLE.length)];

/** Deterministic drifting particles (confetti, bubbles, rain...). */
export function particles(ctx, dt, { seed = 1, n = 20, x = 0, y = 0, w = W, h = H, vy = 30, vx = 0, sway = 0, colors = [P.white], size = 1, len = 1 } = {}) {
  const rand = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const px = rand() * w;
    const ph = rand();
    const sp = 0.6 + rand() * 0.8;
    const c = colors[floor(rand() * colors.length)];
    const yy = (((ph * h + dt * vy * sp) % h) + h) % h;
    const xx = (((px + dt * vx * sp + sin(dt * 3 + ph * 6.28) * sway) % w) + w) % w;
    R(ctx, x + xx, y + yy, size, size * len, c);
  }
}

/** Soft drop shadow under things. */
export function shadow(ctx, cx, y, rx, a = 0.35) {
  oval(ctx, cx, y, rx, max(1, round(rx / 5)), A(P.black, a));
}

// ---------------------------------------------------------------------------
// Full-screen per-pixel patterns (sunburst, ripples). The polar table of a
// centre is compact (angle in 1/4096 turns, distance in 1/8 px) and each pattern
// keeps its own canvas, re-rendered only when its phase moves by a whole step,
// so most frames are a single drawImage.

const POLAR = new Map();
function polar(cx, cy) {
  const key = cx * 4096 + cy;
  let t = POLAR.get(key);
  if (!t) {
    const ang = new Uint16Array(W * H);
    const dist = new Uint16Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        ang[y * W + x] = floor(((Math.atan2(dy, dx) / (2 * PI) + 1) % 1) * 4096) & 4095;
        dist[y * W + x] = min(65535, round(sqrt(dx * dx + dy * dy) * 8));
      }
    }
    t = { ang, dist };
    if (POLAR.size >= 6) POLAR.delete(POLAR.keys().next().value);
    POLAR.set(key, t);
  }
  return t;
}
const U32 = new Map();
function u32(hex) {
  let v = U32.get(hex);
  if (v === undefined) {
    const n = parseInt(hex.slice(1), 16);
    v = ((255 << 24) | ((n & 255) << 16) | (n & 0xff00) | (n >> 16)) >>> 0;
    U32.set(hex, v);
  }
  return v;
}
const PATTERNS = new Map();
function patternBuf(key) {
  let e = PATTERNS.get(key);
  if (!e) {
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const c = cv.getContext('2d');
    const img = c.createImageData(W, H);
    e = { cv, c, img, u32: new Uint32Array(img.data.buffer), step: NaN };
    if (PATTERNS.size >= 6) PATTERNS.delete(PATTERNS.keys().next().value);
    PATTERNS.set(key, e);
  }
  return e;
}

/** Rotating sunburst filling the whole frame. `turn` in revolutions. */
export function sunburst(ctx, cx, cy, turn, rays, c1, c2) {
  cx = round(cx);
  cy = round(cy);
  const e = patternBuf(`sb|${cx}|${cy}|${rays}|${c1}|${c2}`);
  // the pattern repeats every 1/rays turn; 48 steps per repeat is smooth at the edges
  const step = floor((((turn * rays) % 1) + 1) % 1 * 48);
  if (step !== e.step) {
    e.step = step;
    const { ang } = polar(cx, cy);
    const a = u32(c1);
    const b = u32(c2);
    const buf = e.u32;
    const off = round((step / 48 / rays) * 4096);
    const k = rays * 2;
    for (let i = 0; i < buf.length; i++) buf[i] = ((((ang[i] + off) & 4095) * k) >> 12) & 1 ? a : b;
    e.c.putImageData(e.img, 0, 0);
  }
  ctx.drawImage(e.cv, 0, 0);
}

/** Concentric rings cycling through colours; phase in ring widths. */
export function ripples(ctx, cx, cy, phase, width, colors) {
  cx = round(cx);
  cy = round(cy);
  const n = colors.length;
  const e = patternBuf(`rp|${cx}|${cy}|${width}|${colors.join()}`);
  // whole-pixel steps of the ring position
  const period = n * width;
  const step = ((round(phase * width) % period) + period) % period;
  if (step !== e.step) {
    e.step = step;
    const { dist } = polar(cx, cy);
    const cs = colors.map(u32);
    const buf = e.u32;
    const w8 = width * 8;
    const off = step * 8;
    for (let i = 0; i < buf.length; i++) buf[i] = cs[floor((dist[i] + period * 8 * 64 - off) / w8) % n];
    e.c.putImageData(e.img, 0, 0);
  }
  ctx.drawImage(e.cv, 0, 0);
}

/** Pooled full-frame scratch canvases (transitions, zooms); index = nesting slot. */
const POOL = [];
export function scratch(i = 0) {
  let e = POOL[i];
  if (!e) {
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    POOL[i] = e = { cv, c };
  }
  e.c.setTransform(1, 0, 0, 1, 0, 0);
  e.c.globalAlpha = 1;
  e.c.clearRect(0, 0, W, H);
  return e;
}

// ---------------------------------------------------------------------------
// Sprites: rows of characters, one colour key per character ('.' = clear).
// `outline` adds a 1px border of that key around the silhouette.

export function spr(rows, ox = 0, oy = 0, outline = 'K') {
  const h = rows.length;
  const w = max(...rows.map((r) => r.length));
  const grid = rows.map((r) => r.padEnd(w, '.'));
  const filled = (x, y) => y >= 0 && y < h && x >= 0 && x < w && grid[y][x] !== '.' && grid[y][x] !== ' ';
  let out = grid;
  if (outline) {
    out = [];
    for (let y = -1; y <= h; y++) {
      let ln = '';
      for (let x = -1; x <= w; x++) {
        if (filled(x, y)) ln += grid[y][x];
        else if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) ln += outline;
        else ln += '.';
      }
      out.push(ln);
    }
    ox -= 1;
    oy -= 1;
  }
  const groups = {};
  out.forEach((row, dy) => {
    let i = 0;
    while (i < row.length) {
      const ch = row[i];
      let j = i + 1;
      while (j < row.length && row[j] === ch) j++;
      if (ch !== '.' && ch !== ' ') (groups[ch] ||= []).push(ox + i, oy + dy, j - i);
      i = j;
    }
  });
  // outline first so the fills sit on top of it
  const entries = Object.entries(groups).sort((a, b) => (a[0] === outline ? -1 : b[0] === outline ? 1 : 0));
  return { groups: entries, w: out[0].length, h: out.length, ox, oy };
}

/** Paint a sprite at (x, y); flip mirrors around x (sprites centred on 0). */
export function draw(ctx, s, x, y, pal, flip = false) {
  x = round(x);
  y = round(y);
  for (const [k, runs] of s.groups) {
    const c = pal[k];
    if (!c) continue;
    ctx.fillStyle = c;
    for (let i = 0; i < runs.length; i += 3) {
      const len = runs[i + 2];
      ctx.fillRect(flip ? x - runs[i] - len : x + runs[i], y + runs[i + 1], len, 1);
    }
  }
}

/** Static art drawn once to an offscreen canvas. */
const ART = new Map();
export function cached(key, w, h, paint) {
  let cv = ART.get(key);
  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    paint(c);
    ART.set(key, cv);
  }
  return cv;
}

// ---------------------------------------------------------------------------
// Text

export function text(ctx, s, x, y, o = {}) {
  return drawText(ctx, s, round(x), round(y), o);
}

const RING1 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const RING2 = [...RING1, [-2, -2], [0, -2], [2, -2], [-2, 0], [2, 0], [-2, 2], [0, 2], [2, 2], [-1, -2], [1, -2], [-2, -1], [2, -1], [-2, 1], [2, 1], [-1, 2], [1, 2]];

/**
 * Chunky display text: outline (1 or 2px), optional extruded depth, cached
 * as static art. (x, y) = cap line, like drawText.
 */
export function bigText(ctx, s, x, y, { scale = 2, color = P.white, outline = P.black, ow = 1, depth = 0, depthColor = P.black, align = 'left' } = {}) {
  const tw = measureText(s, scale);
  const pad = ow + 1;
  const key = `bt|${s}|${scale}|${color}|${outline}|${ow}|${depth}|${depthColor}`;
  const cv = cached(key, tw + pad * 2 + scale, 7 * scale + pad * 2 + depth + 3 * scale, (c) => {
    const ox = pad;
    const oy = pad + 3 * scale; // cap line inside the canvas
    const ring = ow >= 2 ? RING2 : RING1;
    for (let d = depth; d >= 0; d--) {
      if (outline) for (const [dx, dy] of ring) drawText(c, s, ox + dx, oy + dy + d, { color: outline, scale });
      drawText(c, s, ox, oy + d, { color: d ? depthColor : color, scale });
    }
  });
  const dx = round(align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x) - pad;
  ctx.drawImage(cv, dx, round(y) - pad - 3 * scale);
  return tw;
}

/** Wrapped paragraph; returns its height. */
export function para(ctx, s, x, y, maxW, { scale = 1, color = P.white, align = 'left', lh = 10, shadow = null, outline = null, maxLines = 9 } = {}) {
  const lines = wrapL(s, maxW, scale);
  const nl = min(lines.length, maxLines);
  for (let i = 0; i < nl; i++) {
    const yy = y + i * lh * scale;
    if (outline) bigText(ctx, lines[i], x, yy, { scale, color, outline, align });
    else text(ctx, lines[i], x, yy, { scale, color, align, shadow });
  }
  return nl * lh * scale;
}

/** 3x5 micro font (font.js 'micro'): small print, labels. (x, y) = cap line. */
export function micro(ctx, s, x, y, { color = P.fog, align = 'left', shadow = null } = {}) {
  return drawText(ctx, s, round(x), round(y), { color, align, shadow, font: 'micro' });
}
export const microWidth = (s) => measureText(s, 1, 'micro');

/** Fine print strip along the bottom edge, in the micro font (up to 3 lines). */
export function finePrint(ctx, s, { color = P.fog, bg = P.black, lt = 99 } = {}) {
  const lines = wrapL(s, W - 26, 1, 'micro');
  const n = min(3, lines.length);
  const h = n * 7 + 4;
  if (bg) R(ctx, 0, H - h, W, h, bg);
  if (lt < 0.15) return h;
  for (let i = 0; i < n; i++) micro(ctx, lines[i], W / 2, H - h + 3 + i * 7, { color, align: 'center' });
  return h;
}

// Letter x offsets of a string at a scale (cached; matches font.js spacing).
const OFFS = new Map();
function letterOffsets(s, scale) {
  const k = `${scale}|${s}`;
  let o = OFFS.get(k);
  if (!o) {
    o = [];
    for (let i = 0; i < s.length; i++) o.push(i ? measureText(s.slice(0, i), scale) + scale : 0);
    if (OFFS.size > 400) OFFS.delete(OFFS.keys().next().value);
    OFFS.set(k, o);
  }
  return o;
}

/**
 * Kinetic display type (cap line at y). style:
 *  'pop'   letters rise in one by one with overshoot      'drop'  fall in and bounce
 *  'slide' the word whips in from the side (o.dir)        'stamp' slams in big, settles
 *  'wave'  pops in, then keeps a gentle travelling bob    'type'  typewriter + cursor
 * lt < 0 draws nothing. Returns the text width.
 */
export function kinetic(ctx, s, x, y, lt, o = {}) {
  const { style = 'pop', scale = 2, color = P.white, outline = P.black, ow = 1, depth = 0, depthColor = P.black, align = 'center', stagger = 0.035, dur = 0.28, from = 18, dir = -1, cps = 24, amp = 2, hz = 1.1 } = o;
  const S = String(s).toUpperCase();
  const tw = measureText(S, scale);
  const x0 = round(align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x);
  if (lt < 0) return tw;
  const st = { scale, color, outline, ow, depth, depthColor };
  if (style === 'stamp') {
    if (lt < 0.06) {
      const big = scale + max(1, round(scale / 2));
      const bw = measureText(S, big);
      bigText(ctx, S, round(x0 + tw / 2 - bw / 2), round(y - (big - scale) * 3.5), { ...st, scale: big });
    } else {
      const [dx, dy] = kick(lt, 0.06, 0.16, 2, 7);
      bigText(ctx, S, x0 + dx, y + dy, st);
    }
    return tw;
  }
  if (style === 'slide') {
    const p = prog(lt, 0, dur * 1.4);
    const off = round((1 - easeOutBack(p, 1.3)) * (W * 0.7)) * dir;
    if (p < 1) for (let k = 1; k <= 3; k++) R(ctx, x0 + off - dir * k * 9, y + k * 3, round(tw * 0.5), 1, A(color, 0.5 - k * 0.12));
    bigText(ctx, S, x0 + off, y, st);
    return tw;
  }
  if (style === 'type') {
    const n = min(S.length, floor(lt * cps));
    const part = S.slice(0, n);
    if (part) bigText(ctx, part, x0, y, st);
    if (n < S.length || floor(lt * 2.5) % 2 === 0) {
      const cx = x0 + (n ? measureText(part, scale) + scale : 0);
      R(ctx, cx, y, 2 * scale, 7 * scale, color);
    }
    return tw;
  }
  const offs = letterOffsets(S, scale);
  const last = stagger * (S.length - 1) + dur;
  if (lt >= last && style !== 'wave') {
    bigText(ctx, S, x0, y, st);
    return tw;
  }
  for (let i = 0; i < S.length; i++) {
    if (S[i] === ' ') continue;
    const p = prog(lt, i * stagger, i * stagger + dur);
    if (p <= 0) continue;
    let yy = y;
    if (style === 'drop') yy = y - round((1 - easeOutBounce(p)) * from * 2);
    else yy = y + round((1 - easeOutBack(p, 2.6)) * from * 0.6);
    if (style === 'wave' && p >= 1) yy = y - round(((1 - Math.cos((lt - last) * hz * 2 * PI - i * 0.6)) / 2) * amp);
    bigText(ctx, S[i], x0 + offs[i], yy, st);
  }
  return tw;
}

// Word layout of a line for words(): [{ w, x }] centred on 0 (cached).
const WORDS = new Map();
function wordLayout(s, scale) {
  const k = `${scale}|${s}`;
  let L = WORDS.get(k);
  if (!L) {
    const parts = String(s).toUpperCase().split(' ');
    const gap = 4 * scale;
    const ws = parts.map((w) => measureText(w, scale));
    const total = ws.reduce((a, b) => a + b, 0) + gap * (parts.length - 1);
    let x = -total / 2;
    L = parts.map((w, i) => {
      const e = { s: w, x: round(x), w: ws[i] };
      x += ws[i] + gap;
      return e;
    });
    L.total = total;
    if (WORDS.size > 200) WORDS.delete(WORDS.keys().next().value);
    WORDS.set(k, L);
  }
  return L;
}

/** A line revealed word by word (every `per` s) with a small pop, centred on x. */
export function words(ctx, s, x, y, lt, { per = 0.22, scale = 2, color = P.white, outline = P.black, ow = 1, depth = 0, depthColor = P.black, accent = null, accentIndex = -1 } = {}) {
  const L = wordLayout(s, scale);
  for (let i = 0; i < L.length; i++) {
    const p = prog(lt, i * per, i * per + 0.2);
    if (p <= 0) break;
    const yy = y + round((1 - easeOutBack(p, 2.4)) * 6);
    bigText(ctx, L[i].s, round(x + L[i].x), yy, { scale, color: i === accentIndex && accent ? accent : color, outline, ow, depth, depthColor });
  }
  return L.total;
}

/** Slogan on a ribbon; types in. Returns the ribbon's bottom y. */
export function slogan(ctx, s, cx, y, lt, { scale = 2, color = P.white, bg = P.red, edge = P.darkRed, cps = 26, maxW = W - 40 } = {}) {
  const lines = wrapL(s, maxW, scale);
  const lh = 10 * scale;
  let w = 0;
  for (const l of lines) w = max(w, measureText(l, scale));
  w += 8 * scale;
  const h = lines.length * lh + 2 * scale;
  const open = easeOut(prog(lt, 0, 0.25));
  const ww = round(w * open);
  const x = round(cx - ww / 2);
  if (ww < 4) return y + h;
  // ribbon tails
  R(ctx, x - 6, y + 4, 8, h - 2, edge);
  R(ctx, x + ww - 2, y + 4, 8, h - 2, edge);
  R(ctx, x - 6, y + 4 + h - 2, 2, 2, A(P.black, 0.3));
  rrect(ctx, x, y, ww, h, bg, 1);
  R(ctx, x, y + h - 2, ww, 2, edge);
  let budget = max(0, floor((lt - 0.2) * cps));
  lines.forEach((ln, i) => {
    const part = ln.slice(0, budget);
    budget -= ln.length;
    if (part) text(ctx, part, cx - measureText(ln, scale) / 2, y + 3 * scale - 1 + i * lh, { color, scale, shadow: edge });
  });
  return y + h;
}

/** Speech bubble with wrapped text. tail: 'down' | 'up' | 'left' | 'right' | null */
export function bubble(ctx, x, y, w, s, { tail = 'down', tx = null, fill = P.white, border = P.black, color = P.black, scale = 1, lh = 10, pad = 4 } = {}) {
  const lines = wrapL(s, w - pad * 2, scale);
  const h = lines.length * lh * scale + pad * 2 - (lh - 7) * scale;
  x = round(x);
  y = round(y);
  panel(ctx, x, y, w, h, fill, border, 2);
  const t0 = round(tx ?? x + w / 2);
  if (tail === 'down') {
    for (let i = 0; i < 5; i++) {
      R(ctx, t0 - 1, y + h - 1 + i, 6 - i + 1, 1, border);
      R(ctx, t0, y + h - 1 + i, max(0, 5 - i - 1), 1, fill);
    }
  } else if (tail === 'up') {
    for (let i = 0; i < 5; i++) {
      R(ctx, t0 - 1, y - i, 6 - i + 1, 1, border);
      R(ctx, t0, y - i + 1, max(0, 5 - i - 1), 1, fill);
    }
  }
  lines.forEach((ln, i) => text(ctx, ln, x + w / 2, y + pad + i * lh * scale, { color, scale, align: 'center' }));
  return h;
}

/** Save + clip to a pixel-stepped disc; the caller must ctx.restore(). */
export function clipCircle(ctx, cx, cy, rad) {
  cx = round(cx);
  cy = round(cy);
  rad = max(0, round(rad));
  ctx.save();
  ctx.beginPath();
  const rr = (rad + 0.5) ** 2;
  for (let dy = -rad; dy <= rad; dy++) {
    const hw = floor(sqrt(max(0, rr - dy * dy)));
    ctx.rect(cx - hw, cy + dy, hw * 2 + 1, 1);
  }
  ctx.clip();
}

/** Save + clip to a rectangle; the caller must ctx.restore(). */
export function clipRect(ctx, x, y, w, h) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(round(x), round(y), round(w), round(h));
  ctx.clip();
}

/** Star / burst polygon points (n spikes). */
export function starPts(cx, cy, n, r1, r2, rot = 0) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * PI) / n - PI / 2;
    const rr = i % 2 ? r2 : r1;
    pts.push([cx + Math.cos(a) * rr, cy + sin(a) * rr]);
  }
  return pts;
}

/** Puffy cloud made of discs. */
export function cloud(ctx, cx, cy, s, c, shade = null) {
  const u = s / 10;
  const parts = [[-9, 2, 6], [-3, -2, 8], [5, -1, 7], [11, 3, 5]];
  if (shade) for (const [dx, dy, rr] of parts) disc(ctx, cx + round(dx * u), cy + round(dy * u) + 1, round(rr * u), shade);
  for (const [dx, dy, rr] of parts) disc(ctx, cx + round(dx * u), cy + round(dy * u), round(rr * u), c);
  R(ctx, cx - round(14 * u), cy + round(2 * u), round(29 * u), round(5 * u), c);
}

// ---------------------------------------------------------------------------
// Shots, transitions and camera

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Clip to the revealed part of a wipe; caller must ctx.restore(). */
function wipeClip(ctx, kind, p, o = {}) {
  ctx.save();
  ctx.beginPath();
  if (kind === 'blocks') {
    const S = 16;
    for (let gy = 0; gy < 14; gy++) {
      for (let gx = 0; gx < 24; gx++) {
        const thr = (gx + gy) / 36;
        const q = clamp((p - thr * 0.6) / 0.4, 0, 1);
        const sz = round(S * q);
        if (sz > 0) ctx.rect(gx * S + floor((S - sz) / 2), gy * S + floor((S - sz) / 2), sz, sz);
      }
    }
  } else if (kind === 'iris') {
    const cx = round(o.cx ?? W / 2);
    const cy = round(o.cy ?? H / 2);
    const rad = round(p * p * 260);
    const rr = (rad + 0.5) ** 2;
    for (let dy = -rad; dy <= rad; dy += 2) {
      const hw = floor(sqrt(max(0, rr - dy * dy)) / 2) * 2;
      ctx.rect(cx - hw, cy + dy, hw * 2, 2);
    }
  } else if (kind === 'bars') {
    const n = 9;
    const bh = H / n;
    for (let i = 0; i < n; i++) ctx.rect(0, round(i * bh), W, round(bh * easeInOut(clamp(p * 1.4 - i * 0.05, 0, 1)) + 0.49));
  } else if (kind === 'dissolve') {
    const S = 8;
    for (let gy = 0; gy < H / S; gy++) {
      for (let gx = 0; gx < W / S; gx++) {
        if (p * 16 > BAYER[(gy % 4) * 4 + (gx % 4)]) ctx.rect(gx * S, gy * S, S, S);
      }
    }
  } else if (kind === 'match') {
    // 4px cells switch in order of distance from the shape both shots share,
    // jittered by Bayer order: the matched shape "becomes" the new shot first
    const S = 4;
    const cx = o.cx ?? W / 2;
    const cy = o.cy ?? H / 2;
    const far = Math.hypot(max(cx, W - cx), max(cy, H - cy));
    const reach = p * 1.25;
    for (let gy = 0; gy < H / S; gy++) {
      for (let gx = 0; gx < W / S; gx++) {
        const d = Math.hypot(gx * S + 2 - cx, gy * S + 2 - cy) / far;
        if (reach > d * 0.8 + (BAYER[(gy % 4) * 4 + (gx % 4)] / 16) * 0.25) ctx.rect(gx * S, gy * S, S, S);
      }
    }
  } else {
    // 'diag': stepped diagonal sweep left to right
    const S = 8;
    const reach = p * (W + H * 0.75);
    for (let y = 0; y < H; y += S) ctx.rect(0, y, max(0, round((reach - (y * 0.75)) / 4) * 4), S);
  }
  ctx.clip();
}

/** Clip to a pixel-stepped disc of radius rad (2-row steps). Caller restores. */
function discClip(ctx, cx, cy, rad) {
  ctx.save();
  ctx.beginPath();
  cx = round(cx);
  cy = round(cy);
  rad = max(0, round(rad));
  const rr = (rad + 0.5) ** 2;
  for (let dy = -rad; dy <= rad; dy += 2) {
    const hw = floor(sqrt(max(0, rr - dy * dy)));
    ctx.rect(cx - hw, cy + dy, hw * 2 + 1, 2);
  }
  ctx.clip();
}

/** Draw a full-frame image shifted by x with wrap-around (whip pans). */
function wrapDraw(ctx, cv, x) {
  x = round(x);
  ctx.drawImage(cv, x, 0);
  if (x > 0) ctx.drawImage(cv, x - W, 0);
  else if (x < 0) ctx.drawImage(cv, x + W, 0);
}

const WD = { whip: 0.36, match: 0.4, slide: 0.4, irisInOut: 0.8, flash: 0.3, fade: 0.8, black: 1.0, soft: 0.9 };

/**
 * Run a list of shots [{ at, draw(ctx, lt, info, dt), wipe, wd, cx, cy, fx, fy, dir }].
 * The last shot holds for as long as the ad runs (the voice-over may overrun).
 * wipe is the transition INTO the shot (see the header for the kinds).
 */
export function play(ctx, dt, info, list) {
  let i = 0;
  while (i + 1 < list.length && dt >= list[i + 1].at) i++;
  const s = list[i];
  const lt = dt - s.at;
  const kind = s.wipe || 'cut';
  const wd = s.wd ?? WD[kind] ?? 0.5;
  if (i === 0 || kind === 'cut' || lt >= wd) {
    s.draw(ctx, lt, info, dt);
    return;
  }
  const prev = list[i - 1];
  const plt = dt - prev.at;
  const p = lt / wd;
  const dir = s.dir ?? 1;
  if (kind === 'push') {
    const off = round(easeInOut(p) * W) * dir;
    ctx.save();
    ctx.translate(-off, 0);
    prev.draw(ctx, plt, info, dt);
    ctx.restore();
    ctx.save();
    ctx.translate(W * dir - off, 0);
    s.draw(ctx, lt, info, dt);
    ctx.restore();
  } else if (kind === 'slide') {
    const off = round((1 - easeOut(p)) * W) * dir;
    prev.draw(ctx, plt, info, dt);
    ctx.save();
    ctx.translate(off, 0);
    s.draw(ctx, lt, info, dt);
    R(ctx, dir > 0 ? -2 : W, 0, 2, H, P.black);
    ctx.restore();
  } else if (kind === 'whip') {
    // out on an accelerating pan, in on a decelerating one, smeared by speed
    const first = p < 0.5;
    const q = first ? easeIn(p * 2) : 1 - easeOut((p - 0.5) * 2);
    const b = scratch(0);
    if (first) prev.draw(b.c, plt, info, dt);
    else s.draw(b.c, lt, info, dt);
    const x0 = (first ? -q : q) * W * 0.6 * dir;
    const smear = round(q * 30) * dir;
    ctx.save();
    for (let k = 0; k < 4; k++) {
      ctx.globalAlpha = 1 / (k + 1);
      wrapDraw(ctx, b.cv, x0 + (smear * k) / 3);
    }
    ctx.restore();
    if (q > 0.3) {
      const rand = mulberry32(floor(dt * 30));
      for (let k = 0; k < 10; k++) R(ctx, 0, floor(rand() * H), W, 1, A(rand() < 0.5 ? P.white : P.black, 0.12 + q * 0.12));
    }
  } else if (kind === 'irisInOut') {
    R(ctx, 0, 0, W, H, P.black);
    if (p < 0.5) {
      discClip(ctx, s.fx ?? W / 2, s.fy ?? H / 2, (1 - easeIn(p * 2)) * 240);
      prev.draw(ctx, plt, info, dt);
    } else {
      discClip(ctx, s.cx ?? W / 2, s.cy ?? H / 2, easeOut((p - 0.5) * 2) * 240);
      s.draw(ctx, lt, info, dt);
    }
    ctx.restore();
  } else if (kind === 'flash') {
    if (p < 0.5) prev.draw(ctx, plt, info, dt);
    else s.draw(ctx, lt, info, dt);
    R(ctx, 0, 0, W, H, A(P.white, 0.85 * (1 - abs(p - 0.5) * 2)));
  } else if (kind === 'fade') {
    // true cross-dissolve: the new shot composited over the old with eased alpha
    prev.draw(ctx, plt, info, dt);
    const b = scratch(0);
    s.draw(b.c, lt, info, dt);
    ctx.save();
    ctx.globalAlpha = smooth(p);
    ctx.drawImage(b.cv, 0, 0);
    ctx.restore();
  } else if (kind === 'black') {
    // dip to black: out on the first half, in on the second (o.hold = black hold share)
    const hold = s.hold ?? 0.12;
    const a = p < 0.5 - hold / 2 ? smooth(p / (0.5 - hold / 2)) : p > 0.5 + hold / 2 ? smooth((1 - p) / (0.5 - hold / 2)) : 1;
    if (p < 0.5) prev.draw(ctx, plt, info, dt);
    else s.draw(ctx, lt, info, dt);
    R(ctx, 0, 0, W, H, A(P.black, a));
  } else if (kind === 'soft') {
    // slow wipe with a 24 px feathered edge (o.dir 1 = left to right)
    prev.draw(ctx, plt, info, dt);
    const b = scratch(0);
    s.draw(b.c, lt, info, dt);
    const F = 24;
    const edge = round(-F + smooth(p) * (W + 2 * F));
    ctx.save();
    for (let k = 0; k < F; k += 2) {
      // column band k px behind the edge is k/F opaque
      const a = (k + 1) / F;
      const x = dir > 0 ? edge - k : W - edge + k - 2;
      if (x < 0 || x >= W) continue;
      ctx.globalAlpha = a;
      ctx.drawImage(b.cv, x, 0, 2, H, x, 0, 2, H);
    }
    ctx.globalAlpha = 1;
    const solid = dir > 0 ? edge - F : W - edge + F;
    if (dir > 0 && solid > 0) ctx.drawImage(b.cv, 0, 0, min(W, solid), H, 0, 0, min(W, solid), H);
    else if (dir < 0 && solid < W) ctx.drawImage(b.cv, max(0, solid), 0, W - max(0, solid), H, max(0, solid), 0, W - max(0, solid), H);
    ctx.restore();
  } else {
    prev.draw(ctx, plt, info, dt);
    wipeClip(ctx, kind, p, s);
    s.draw(ctx, lt, info, dt);
    ctx.restore();
  }
}

/** Integer camera pan: everything fn draws is offset by (-x, -y). */
export function withCam(ctx, x, y, fn) {
  ctx.save();
  ctx.translate(-round(x), -round(y));
  fn(ctx);
  ctx.restore();
}
/** Parallax offset of a layer at `depth` (0 = sky, 1 = the camera's plane). */
export const par = (x, depth) => round(x * depth);
/** Decaying comedy shake [dx, dy] for `dur` seconds after t0. */
export function kick(v, t0, dur = 0.3, amp = 3, seed = 1) {
  if (v < t0 || v >= t0 + dur) return [0, 0];
  return shake(v, amp * (1 - (v - t0) / dur) + 0.5, seed);
}
/**
 * Draw fn scaled by z about the focus (fx, fy), nearest neighbour. Pixels
 * become uneven at fractional zooms, so keep it to crash zooms and integer holds.
 */
export function zoomed(ctx, z, fx, fy, fn, slot = 2) {
  if (abs(z - 1) < 0.002) return fn(ctx);
  const b = scratch(slot);
  fn(b.c);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(b.cv, fx - fx / z, fy - fy / z, W / z, H / z, 0, 0, W, H);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Pixel people (front view, ~31px tall). Colour keys:
// K outline, S/s skin, H/h hair, T/t top, C collar, X tie, b belt, P/p trousers,
// B shoes, D/d dress, W white, A/a hat.

export const BASE_PAL = {
  K: P.black, W: P.white, w: P.silver, S: P.skin, s: P.skinShade, H: P.brown, h: P.tan,
  T: P.blue, t: P.navy, C: P.white, X: P.red, b: P.ink, P: P.slate, p: P.ink, B: P.black,
  D: P.magenta, d: P.purple, A: P.yellow, a: P.orange, M: P.maroon, N: P.pink, Y: P.yellow,
};

const HEAD = spr([
  '....SSSSSS....',
  '..SSSSSSSSSS..',
  '.SSSSSSSSSSSS.',
  '.SSSSSSSSSSSS.',
  'SSSSSSSSSSSSSS',
  'SSSSSSSSSSSSSS',
  'SSSSSSSSSSSSSS',
  'SSSSSSSSSSSSSS',
  'SSSSSSSSSSSSSs',
  '.SSSSSSSSSSSs.',
  '.sSSSSSSSSSss.',
  '..ssSSSSSSss..',
  '....ssssss....',
], -7, 0);

const HAIR = {
  short: spr([
    '....HHHHHH....',
    '..HHHHHHHHHH..',
    '.HHhhHHHHHHHH.',
    'HHhHHHHHHHHHHH',
    'HHHHHHHHHHHHHH',
    'HHH.HHHH.HHHHH',
    'HH..........HH',
    'H............H',
  ], -7, -1),
  long: spr([
    '....HHHHHH....',
    '..HHHHHHHHHH..',
    '.HHhhHHHHHHHH.',
    'HHhHHHHHHHHHHH',
    'HhHHHHHHHHHHHH',
    'HhHH......HHHH',
    'HhH........HHH',
    'HH..........HH',
    'HH..........HH',
    'HH..........HH',
    'HH..........HH',
    'HHH........HHH',
    'HHH........HHH',
    'HHH........HHH',
    'HHH........HHH',
    '.HH........HH.',
  ], -7, -1),
  bun: spr([
    '.....HHHH.....',
    '....HhHHHH....',
    '.....HHHH.....',
    '....HHHHHH....',
    '..HhhHHHHHHH..',
    '.HhHHHHHHHHHH.',
    'HHHHHHHHHHHHHH',
    'HHHH......HHHH',
    'HH..........HH',
    'H............H',
  ], -7, -4),
  spiky: spr([
    '.H...H...H..H.',
    '.HH.HHH.HH.HH.',
    '.HHHHHHHHHHHH.',
    'HHHhhHHHHHHHHH',
    'HHhHHHHHHHHHHH',
    'HHHHHHHHHHHHHH',
    'HHHHH.HHH.HHHH',
    'HH..........HH',
    'H............H',
  ], -7, -3),
  bald: spr([
    'HH..........HH',
    'HH..........HH',
    'H............H',
  ], -7, 5),
  bob: spr([
    '....HHHHHH....',
    '..HHHHHHHHHH..',
    '.HHhhHHHHHHHH.',
    'HHhHHHHHHHHHHH',
    'HhHHHHHHHHHHHH',
    'HhHHHHHHHHHHHH',
    'HHH........HHH',
    'HH..........HH',
    'HH..........HH',
    'HH..........HH',
    'HHH........HHH',
    'HHH........HHH',
  ], -7, -1),
  towel: spr([
    '...WWWWWWWW...',
    '.WWWwWWWWWWWW.',
    'WWWWWWWwWWWWWW',
    'WWwWWWWWWwWWWW',
    'WWWWWWWWWWWWWW',
    'wWWWWWWWWWWWWw',
    '.wwwwwwwwwwww.',
  ], -7, -3),
  sunhat: spr([
    '......AAAA......',
    '....AAAAAAAA....',
    '...AAAAAAAAAA...',
    '...aaaaaaaaaa...',
    'AAAAAAAAAAAAAAAA',
    '.AAAAAAAAAAAAAA.',
    '..H..........H..',
  ], -8, -3),
};

const TORSO = spr([
  '..TTTTTTTT..',
  '.TTTTCCTTTT.',
  'TTTTCXXCTTTT',
  'TTTTTXXTTTTT',
  'TTTTTXXTTTTt',
  'tTTTTXXTTTTt',
  'tTTTTXXTTTTt',
  'tTTTTTXTTTTt',
  'tTTTTTTTTTTt',
  'bbbbbbbbbbbb',
], -6, 0);
const TORSO_S = spr([
  '..TTTTTTTT..',
  '.TTTTCCTTTT.',
  'TTTTTTTTTTTT',
  'tTTTTTTTTTTt',
  'tTTTTTTTTTTt',
  'tTTTTTTTTTTt',
  'bbbbbbbbbbbb',
], -6, 0);

const LEGS = {
  stand: spr([
    '.PPPPPPPPPP.',
    '.PPPPpPPPPP.',
    '.PPPP..PPPP.',
    '.PPPP..PPPP.',
    '.pPPP..PPPp.',
    '.BBBB..BBBB.',
    'BBBBB..BBBBB',
  ], -6, 0),
  walk: spr([
    '.PPPPPPPPPP.',
    '.PPPPpPPPPP.',
    '.PPPP..PPPP.',
    '.pPPP..PPPP.',
    '.BBBB..PPPp.',
    'BBBBB..BBBB.',
    '.......BBBBB',
  ], -6, 0),
  skirt: spr([
    '.DDDDDDDDDD.',
    'DDDDDDDDDDDD',
    'DDDDDDDDDDDd',
    '..SS....SS..',
    '..SS....SS..',
    '.BBB....BBB.',
    '.BBB....BBB.',
  ], -6, 0),
  short: spr([
    '.PPPPPPPPPP.',
    '.PPPP..PPPP.',
    '.pPPP..PPPp.',
    '.BBBB..BBBB.',
    'BBBBB..BBBBB',
  ], -6, 0),
};

const ARMS = {
  down: spr(['.TT', 'tTT', 'tTT', 'tTT', 'tTT', 'tTT', 'tTT', 'SSS', 'sSS'], -9, 0),
  downS: spr(['.TT', 'tTT', 'tTT', 'tTT', 'SSS', 'sSS'], -9, 0),
  up: spr(['SS....', 'SS....', 'TT....', 'TT....', 'TTT...', '.TT...', '.TTT..', '..TT..', '..TTT.', '...TTT', '....TT'], -11, -7),
  out: spr(['..TTTTT', 'SSTTTTT', 'SS.....'], -12, 1),
  hold: spr(['.TT....', 'tTT....', 'tTT....', 'tTT....', 'tTTTTSS', '.tTTTSS'], -9, 0),
  phone: spr(['..SS', '..SS', '.TT.', 'TTT.', 'TT..', 'TT..', 'TTT.', '.TTT', '..TT'], -11, -6),
};

const palCache = new WeakMap();
function mergePal(pal) {
  if (!pal) return BASE_PAL;
  let m = palCache.get(pal);
  if (!m) palCache.set(pal, (m = { ...BASE_PAL, ...pal }));
  return m;
}

/** Face features relative to the head centre (x) and head top (y). */
function face(ctx, x, y, o, pal) {
  const K = pal.K;
  const lx = o.look || 0;
  const eyes = o.eyes || 'open';
  const ex = [x - 4 + lx, x + 2 + lx];
  if (eyes === 'open' || eyes === 'sad' || eyes === 'angry') {
    for (const e of ex) R(ctx, e, y + 6, 2, 2, K);
    if (eyes === 'sad') {
      R(ctx, x - 5, y + 5, 2, 1, K);
      R(ctx, x - 3, y + 4, 1, 1, K);
      R(ctx, x + 3, y + 5, 2, 1, K);
      R(ctx, x + 2, y + 4, 1, 1, K);
    } else if (eyes === 'angry') {
      R(ctx, x - 5, y + 4, 2, 1, K);
      R(ctx, x - 3, y + 5, 1, 1, K);
      R(ctx, x + 3, y + 4, 2, 1, K);
      R(ctx, x + 2, y + 5, 1, 1, K);
    }
  } else if (eyes === 'happy') {
    for (const e of [x - 5, x + 1]) {
      R(ctx, e, y + 7, 1, 1, K);
      R(ctx, e + 1, y + 6, 2, 1, K);
      R(ctx, e + 3, y + 7, 1, 1, K);
    }
  } else if (eyes === 'closed') {
    R(ctx, x - 5, y + 7, 4, 1, K);
    R(ctx, x + 1, y + 7, 4, 1, K);
  } else if (eyes === 'sleepy') {
    R(ctx, x - 5, y + 6, 4, 1, K);
    R(ctx, x + 1, y + 6, 4, 1, K);
    R(ctx, x - 4 + lx, y + 7, 2, 1, K);
    R(ctx, x + 2 + lx, y + 7, 2, 1, K);
  } else if (eyes === 'wide') {
    for (const e of [x - 5, x + 1]) {
      R(ctx, e, y + 5, 4, 4, pal.W);
      R(ctx, e + 1 + (lx > 0 ? 1 : 0), y + 6, 2, 2, K);
    }
  } else if (eyes === 'shades') {
    R(ctx, x - 6, y + 5, 13, 1, K);
    R(ctx, x - 6, y + 6, 6, 2, K);
    R(ctx, x + 1, y + 6, 6, 2, K);
    R(ctx, x - 5, y + 6, 1, 1, P.steel);
    R(ctx, x + 2, y + 6, 1, 1, P.steel);
  } else if (eyes === 'x') {
    for (const e of [x - 5, x + 1]) {
      R(ctx, e, y + 5, 1, 1, K);
      R(ctx, e + 2, y + 5, 1, 1, K);
      R(ctx, e + 1, y + 6, 1, 1, K);
      R(ctx, e, y + 7, 1, 1, K);
      R(ctx, e + 2, y + 7, 1, 1, K);
    }
  } else if (eyes === 'hearts') {
    for (const e of [x - 6, x + 1]) {
      R(ctx, e, y + 5, 2, 1, P.red);
      R(ctx, e + 3, y + 5, 2, 1, P.red);
      R(ctx, e, y + 6, 5, 1, P.red);
      R(ctx, e + 1, y + 7, 3, 1, P.red);
      R(ctx, e + 2, y + 8, 1, 1, P.red);
    }
  } else if (eyes === 'cucumber') {
    for (const e of [x - 6, x + 1]) {
      R(ctx, e + 1, y + 4, 3, 1, P.darkGreen);
      R(ctx, e, y + 5, 5, 3, P.darkGreen);
      R(ctx, e + 1, y + 8, 3, 1, P.darkGreen);
      R(ctx, e + 1, y + 5, 3, 3, P.green);
      R(ctx, e + 2, y + 6, 1, 1, P.cream);
    }
  }
  if (o.blush) {
    R(ctx, x - 6, y + 8, 2, 1, P.pink);
    R(ctx, x + 4, y + 8, 2, 1, P.pink);
  }
  if (o.mustache) R(ctx, x - 3, y + 9, 6, 1, pal.H);
  if (o.beard) {
    const b = o.beard;
    const by = y + 9;
    R(ctx, x - 6, by - 1, 1, 2 + b, pal.H);
    R(ctx, x + 5, by - 1, 1, 2 + b, pal.H);
    R(ctx, x - 5, by + 1, 11, 1 + b, pal.H);
    R(ctx, x - 4, by + 1 + b, 9, 2 + b, pal.H);
    R(ctx, x - 2, by + 3 + b, 5, 1 + b, pal.H);
    if (b >= 2) R(ctx, x - 1, by + 4 + b * 2, 3, b, pal.H);
  }
  const m = o.mouth || 'smile';
  const my = y + 9;
  if (m === 'smile') {
    R(ctx, x - 2, my + 1, 4, 1, K);
    R(ctx, x - 3, my, 1, 1, K);
    R(ctx, x + 2, my, 1, 1, K);
  } else if (m === 'grin') {
    R(ctx, x - 3, my, 6, 1, K);
    R(ctx, x - 3, my + 1, 1, 1, K);
    R(ctx, x + 2, my + 1, 1, 1, K);
    R(ctx, x - 2, my + 1, 4, 1, pal.W);
    R(ctx, x - 2, my + 2, 4, 1, K);
  } else if (m === 'flat') {
    R(ctx, x - 2, my + 1, 4, 1, K);
  } else if (m === 'o') {
    R(ctx, x - 1, my, 2, 2, K);
  } else if (m === 'O') {
    R(ctx, x - 1, my - 1, 2, 1, K);
    R(ctx, x - 2, my, 4, 2, K);
    R(ctx, x - 1, my + 2, 2, 1, K);
    R(ctx, x - 1, my + 1, 2, 1, pal.N);
  } else if (m === 'frown') {
    R(ctx, x - 2, my, 4, 1, K);
    R(ctx, x - 3, my + 1, 1, 1, K);
    R(ctx, x + 2, my + 1, 1, 1, K);
  } else if (m === 'wavy') {
    for (let i = 0; i < 6; i++) R(ctx, x - 3 + i, my + (i % 2 ? 0 : 1), 1, 1, K);
  } else if (m === 'open') {
    R(ctx, x - 2, my, 4, 1, K);
    R(ctx, x - 2, my + 1, 4, 1, pal.M);
    R(ctx, x - 1, my + 2, 2, 1, K);
  }
}

/**
 * Draw a pixel person standing on ground line gy, centred on x.
 * o: { pal, hair, eyes, mouth, look, armL, armR, legs, step, bob, small, blush,
 *      mustache, beard, sweat, hat }
 * Returns the y of the top of the head.
 */
export function person(ctx, x, gy, o = {}) {
  const pal = mergePal(o.pal);
  x = round(x);
  const small = !!o.small;
  const tH = small ? 7 : 10;
  const legsKind = o.legs || 'stand';
  const lH = legsKind === 'none' ? 0 : small ? 5 : 7;
  const top = round(gy - (13 + tH + lH) + (o.bob || 0));
  const ty = top + 13;
  // legs
  if (legsKind !== 'none') {
    const ly = ty + tH;
    if (small) draw(ctx, LEGS.short, x, ly, pal);
    else if (legsKind === 'walk') {
      const f = (o.step || 0) % 4;
      if (f === 1) draw(ctx, LEGS.walk, x, ly, pal);
      else if (f === 3) draw(ctx, LEGS.walk, x, ly, pal, true);
      else draw(ctx, LEGS.stand, x, ly, pal);
    } else draw(ctx, LEGS[legsKind] || LEGS.stand, x, ly, pal);
  }
  draw(ctx, small ? TORSO_S : TORSO, x, ty, pal);
  const armSpr = (k) => (k === 'down' && small ? ARMS.downS : ARMS[k] || ARMS.down);
  draw(ctx, armSpr(o.armL || 'down'), x, ty, pal);
  draw(ctx, armSpr(o.armR || 'down'), x, ty, pal, true);
  if (o.hair === 'long') draw(ctx, HAIR.long, x, top, pal);
  draw(ctx, HEAD, x, top, pal);
  face(ctx, x, top, o, pal);
  const hair = HAIR[o.hair || 'short'];
  if (hair && o.hair !== 'long') draw(ctx, hair, x, top, pal);
  else if (o.hair === 'long') {
    // fringe only (the long sides were drawn behind the head)
    draw(ctx, HAIR.bob, x, top, pal);
  }
  if (o.hat) draw(ctx, HAIR[o.hat], x, top, pal);
  if (o.sweat) {
    const sy = top + 2 + (o.sweat % 4);
    R(ctx, x + 8, sy, 1, 1, P.cyan);
    R(ctx, x + 8, sy + 1, 2, 2, P.blue);
  }
  return top;
}

/** A tiny heart (7x6), the font has none. */
export function heart(ctx, x, y, c = P.red, hi = P.pink) {
  x = round(x);
  y = round(y);
  R(ctx, x + 1, y, 2, 1, c);
  R(ctx, x + 4, y, 2, 1, c);
  R(ctx, x, y + 1, 7, 2, c);
  R(ctx, x + 1, y + 3, 5, 1, c);
  R(ctx, x + 2, y + 4, 3, 1, c);
  R(ctx, x + 3, y + 5, 1, 1, c);
  if (hi) R(ctx, x + 1, y + 1, 1, 1, hi);
}

/** Big heart, size = half-width in pixels. */
export function bigHeart(ctx, cx, cy, size, c = P.red) {
  const s = size;
  disc(ctx, cx - round(s / 2), cy - round(s / 4), round(s / 2), c);
  disc(ctx, cx + round(s / 2), cy - round(s / 4), round(s / 2), c);
  poly(ctx, [[cx - s - 0.5, cy - s / 4 + 0.5], [cx + s + 1.5, cy - s / 4 + 0.5], [cx + 0.5, cy + s + 1]], c);
}

// ---------------------------------------------------------------------------
// Big pixel people (~52px tall): sprite head, hair and torso, procedural
// limbs (thick outlined Bresenham strokes) so any pose is possible.
// Extra keys: E brows, Y buckle, L sleeve (defaults to T).

const HEAD_L = spr([
  '..........SSSSSSSS..........',
  '.......SSSSSSSSSSSSSS.......',
  '.....SSSSSSSSSSSSSSSSSS.....',
  '....SSSSSSSSSSSSSSSSSSSS....',
  '...SSSSSSSSSSSSSSSSSSSSSS...',
  '...SSSSSSSSSSSSSSSSSSSSSS...',
  '..SSSSSSSSSSSSSSSSSSSSSSSS..',
  '..SSSSSSSSSSSSSSSSSSSSSSSS..',
  '..SSSSSSSSSSSSSSSSSSSSSSSS..',
  '..SSSSSSSSSSSSSSSSSSSSSSSS..',
  '.sSSSSSSSSSSSSSSSSSSSSSSSSs.',
  'ssSSSSSSSSSSSSSSSSSSSSSSSSss',
  'ssSSSSSSSSSSSSSSSSSSSSSSSSss',
  '.sSSSSSSSSSSSSSSSSSSSSSSSSs.',
  '..SSSSSSSSSSSSSSSSSSSSSSSs..',
  '..SSSSSSSSSSSSSSSSSSSSSSSs..',
  '...SSSSSSSSSSSSSSSSSSSSSs...',
  '...sSSSSSSSSSSSSSSSSSSSss...',
  '....sSSSSSSSSSSSSSSSSSss....',
  '.....ssSSSSSSSSSSSSSSss.....',
  '.......sssSSSSSSSSsss.......',
  '..........ssssssss..........',
], -14, 0);

const HAIR_L = {
  short: spr([
    '..........HHHHHHHH..........',
    '.......HHHHHHHHHHHHHH.......',
    '.....HHHHHHhhhhHHHHHHHH.....',
    '....HHHHHhhHHHHHHHHHHHHH....',
    '...HHHHhhHHHHHHHHHHHHHHHH...',
    '..HHHHhHHHHHHHHHHHHHHHHHHH..',
    '..HHHHHHHHHHHHHHHHHHHHHHHH..',
    '.HHHHHHHHHHHHHHHHHHHHHHHHHH.',
    '.HHHHHHHHHHHHHHHHHHHHHHHHHH.',
    '.HHH.HHHHHHHHHHH..HHHHHHHHH.',
    '.HH...HHHHHHHH.....HHHHHHHH.',
    '.HH.....HHHH........HHHHHHH.',
    '.HH..................HHHHH..',
    '..H...................HHH...',
  ], -14, -2),
  bob: spr([
    '..........HHHHHHHH..........',
    '.......HHHHHHHHHHHHHH.......',
    '.....HHHHHHhhhhHHHHHHHH.....',
    '....HHHHHhhHHHHHHHHHHHHH....',
    '...HHHHhhHHHHHHHHHHHHHHHH...',
    '..HHHHhHHHHHHHHHHHHHHHHHHH..',
    '..HHHHHHHHHHHHHHHHHHHHHHHH..',
    '.HHHHHHHHHHHHHHHHHHHHHHHHHH.',
    '.HHHHHHHHHHHHHHHHHHHHHHHHHH.',
    'HHHHHHHHHHHHHHHHHHHHHHHHHHHH',
    'HHHHHHHHHHHHHHHHHHHHHHHHHHHH',
    'HHHH....................HHHH',
    'HHH......................HHH',
    'HHH......................HHH',
    'HHH......................HHH',
    'HHH......................HHH',
    'HHHH....................HHHH',
    'HHHH....................HHHH',
    '.HHH....................HHH.',
    '..HH....................HH..',
  ], -14, -2),
  long: spr([
    'HHH......................HHH',
    'HHH......................HHH',
    'HHHH....................HHHH',
    'HHHH....................HHHH',
    'HHHHH..................HHHHH',
    'HHHHH..................HHHHH',
    'HHHHH..................HHHHH',
    'HHHHH..................HHHHH',
    'HHHHH..................HHHHH',
    'HHHHH..................HHHHH',
    'HHHHH..................HHHHH',
    'HHHHH..................HHHHH',
    'HHHH....................HHHH',
    '.HHH....................HHH.',
  ], -14, 16),
  bun: spr([
    '...........HHHHHH...........',
    '..........HhhHHHHH..........',
    '..........HHHHHHHH..........',
    '...........HHHHHH...........',
    '..........HHHHHHHH..........',
    '.......HHHHHHHHHHHHHH.......',
    '.....HHHhhhHHHHHHHHHHHH.....',
    '....HHhhHHHHHHHHHHHHHHHH....',
    '...HHhHHHHHHHHHHHHHHHHHHH...',
    '..HHHHHHHHHHHHHHHHHHHHHHHH..',
    '..HHHHHHHHHHHHHHHHHHHHHHHH..',
    '.HHHHHHH...HHHHHH...HHHHHHH.',
    '.HHHH..................HHHH.',
    '.HHH....................HHH.',
    '.HH......................HH.',
    '.HH......................HH.',
  ], -14, -6),
  spiky: spr([
    '....H.....H.....H.....H.....',
    '....HH...HHH...HHH...HH.....',
    '....HHH.HHHHH.HHHHH.HHH.....',
    '...HHHHHHHHHHHHHHHHHHHHHH...',
    '...HHHHHHhhhHHHHHHHHHHHHH...',
    '..HHHHHhhHHHHHHHHHHHHHHHHH..',
    '..HHHHhHHHHHHHHHHHHHHHHHHH..',
    '.HHHHHHHHHHHHHHHHHHHHHHHHHH.',
    '.HHHHHHHHHHHHHHHHHHHHHHHHHH.',
    '.HHHHHH.HHHHHHH.HHHHHHHHHHH.',
    '.HHH.....HHHHH....HHHHHHHHH.',
    '.HH.......HHH.......HHHHHHH.',
    '.HH..................HHHHH..',
    '..H...................HHH...',
  ], -14, -5),
  bald: spr([
    '.HH......................HH.',
    'HHH......................HHH',
    'HHH......................HHH',
    '.HH......................HH.',
  ], -14, 8),
  towel: spr([
    '.........WWWWWWWWWW.........',
    '......WWWWWWWWWWWWWWWW......',
    '....WWWWwWWWWWWWWWWWWWWW....',
    '...WWWWWWwWWWWWWWWWWwWWWW...',
    '..WWWWWWWWwwWWWWWWWwWWWWWW..',
    '..WwWWWWWWWWwwWWWwwWWWWWWW..',
    '.WWWwwWWWWWWWWwwwWWWWWWwWWW.',
    '.WWWWWwwwWWWWWWWWWWWwwWWWWW.',
    '.wWWWWWWWwwwwWWWWwwwWWWWWWw.',
    '.wwwwwwwwwwwwwwwwwwwwwwwwww.',
  ], -14, -4),
};

const TORSO_ROWS = [
  '.....TTTTTTTTTTTT.....',
  '...TTTTTTCCCCTTTTTT...',
  '..TTTTTTTCXXCTTTTTTT..',
  '.TTTTTTTTCXXCTTTTTTTT.',
  'TTTTTTTTTTXXTTTTTTTTTT',
  'TTTTTTTTTTXXTTTTTTTTTt',
  'TTTTTTTTTXXXXTTTTTTTTt',
  'tTTTTTTTTXXXXTTTTTTTTt',
  'tTTTTTTTTXXXXTTTTTTTTt',
  'tTTTTTTTTXXXXTTTTTTTTt',
  'tTTTTTTTTTXXTTTTTTTTTt',
  'tTTTTTTTTTTTTTTTTTTTTt',
  'tTTTTTTTTTTTTTTTTTTTTt',
  'tTTTTTTTTTTTTTTTTTTTtt',
  'bbbbbbbbbbYYbbbbbbbbbb',
  'bbbbbbbbbbYYbbbbbbbbbb',
];
const TORSO_L = spr(TORSO_ROWS, -11, 22);
const TORSO_LS = spr([0, 1, 2, 3, 4, 6, 9, 11, 13, 14, 15].map((i) => TORSO_ROWS[i]), -11, 22);

const ARM_POSES = {
  down: [[-1, 7], [-1, 14]],
  up: [[-5, -7], [-8, -15]],
  wave: [[-7, -2], [-9, -12]],
  out: [[-7, 1], [-14, 0]],
  hold: [[-1, 9], [7, 8]],
  mouth: [[0, 8], [9, -7]],
  hips: [[-6, 7], [0, 12]],
  flex: [[-9, 0], [-8, -9]],
  point: [[-6, 3], [-14, -1]],
  ear: [[-6, 2], [-3, -11]],
  forward: [[-1, 8], [3, 14]],
};

/** A named arm pose as [[elbowX, elbowY], [handX, handY]] (left-arm space, x < 0 = out). */
export const armPose = (name) => (Array.isArray(name) ? name : ARM_POSES[name] || ARM_POSES.down);

const angLerp = (a, b, p) => {
  let d = b - a;
  while (d > PI) d -= 2 * PI;
  while (d < -PI) d += 2 * PI;
  return a + d * p;
};
/**
 * Blend two arm poses as a two-bone chain (shoulder->elbow, elbow->hand): the
 * angles interpolate and the bone lengths stay put, so the hand travels on an
 * arc. `swing` adds radians to the forearm (waves, flourishes).
 */
export function poseLerp(a, b, p, swing = 0) {
  const [e0, h0] = armPose(a);
  const [e1, h1] = armPose(b);
  const u0 = Math.atan2(e0[1], e0[0]);
  const u1 = Math.atan2(e1[1], e1[0]);
  const l0 = Math.hypot(e0[0], e0[1]);
  const l1 = Math.hypot(e1[0], e1[1]);
  const f0 = Math.atan2(h0[1] - e0[1], h0[0] - e0[0]);
  const f1 = Math.atan2(h1[1] - e1[1], h1[0] - e1[0]);
  const m0 = Math.hypot(h0[0] - e0[0], h0[1] - e0[1]);
  const m1 = Math.hypot(h1[0] - e1[0], h1[1] - e1[1]);
  const ua = angLerp(u0, u1, p);
  const ul = l0 + (l1 - l0) * p;
  const fa = angLerp(f0, f1, p) + swing;
  const fl = m0 + (m1 - m0) * p;
  const ex = Math.cos(ua) * ul;
  const ey = sin(ua) * ul;
  return [[ex, ey], [ex + Math.cos(fa) * fl, ey + sin(fa) * fl]];
}
/** Arm pose over time: keys = [[t, pose, ease?], ...] like key(). */
export function poseAt(v, keys, swing = 0) {
  const n = keys.length;
  if (v <= keys[0][0]) return poseLerp(keys[0][1], keys[0][1], 0, swing);
  for (let i = 1; i < n; i++) {
    if (v < keys[i][0]) {
      const k0 = keys[i - 1];
      const p = easeFn(keys[i][2])((v - k0[0]) / (keys[i][0] - k0[0] || 1));
      return poseLerp(k0[1], keys[i][1], p, swing);
    }
  }
  return poseLerp(keys[n - 1][1], keys[n - 1][1], 0, swing);
}

/** Thick outlined polyline (limbs, tails, cables). */
export function stroke(ctx, pts, w, col, ol) {
  const o = floor(w / 2);
  if (ol) for (let i = 0; i + 1 < pts.length; i++) line(ctx, pts[i][0] - o - 1, pts[i][1] - o - 1, pts[i + 1][0] - o - 1, pts[i + 1][1] - o - 1, ol, w + 2);
  for (let i = 0; i + 1 < pts.length; i++) line(ctx, pts[i][0] - o, pts[i][1] - o, pts[i + 1][0] - o, pts[i + 1][1] - o, col, w);
}

function armL(ctx, sx, sy, side, pose, pal, k, sleeves, wiggle) {
  const p = Array.isArray(pose) ? pose : ARM_POSES[pose] || ARM_POSES.down;
  // poses are authored for the left arm (negative x = outward)
  const m = -side;
  const e = [sx + m * round(p[0][0] * k), sy + round(p[0][1] * k)];
  const hd = [sx + m * round((p[1][0] + (pose === 'wave' ? wiggle : 0)) * k), sy + round(p[1][1] * k)];
  const s = [sx, sy];
  // outline both segments first so the elbow joint stays clean
  line(ctx, s[0] - 3, s[1] - 3, e[0] - 3, e[1] - 3, pal.K, 7);
  line(ctx, e[0] - 3, e[1] - 3, hd[0] - 3, hd[1] - 3, pal.K, 7);
  stroke(ctx, [s, e], 5, pal.L || pal.T, null);
  stroke(ctx, [e, hd], 5, sleeves === 'short' ? pal.S : pal.L || pal.T, null);
  disc(ctx, hd[0], hd[1], 3, pal.K);
  disc(ctx, hd[0], hd[1], 2, pal.S);
  R(ctx, hd[0] + (side < 0 ? 0 : -1), hd[1] + 1, 2, 1, pal.s);
  return hd;
}

function faceL(ctx, x, y, o, pal) {
  const K = pal.K;
  const E = pal.E || K;
  const lx = round(o.look || 0);
  const ly = round(o.lookY || 0);
  const eyes = o.eyes || 'open';
  const brows = o.brows || (eyes === 'sad' ? 'sad' : eyes === 'angry' ? 'angry' : eyes === 'wide' ? 'up' : 'flat');
  const L0 = x - 7;
  const R0 = x + 4;
  const eyeOpen = (x0) => {
    R(ctx, x0 + lx, y + 10 + ly, 3, 4, K);
    R(ctx, x0 + lx, y + 10 + ly, 1, 1, pal.W);
  };
  if (eyes === 'open' || eyes === 'sad' || eyes === 'angry') {
    eyeOpen(L0);
    eyeOpen(R0);
  } else if (eyes === 'happy') {
    for (const x0 of [L0, R0]) {
      R(ctx, x0 - 1, y + 12, 1, 2, K);
      R(ctx, x0, y + 11, 3, 1, K);
      R(ctx, x0 + 3, y + 12, 1, 2, K);
    }
  } else if (eyes === 'closed') {
    R(ctx, L0 - 1, y + 12, 5, 1, K);
    R(ctx, R0 - 1, y + 12, 5, 1, K);
    R(ctx, L0 - 1, y + 13, 1, 1, K);
    R(ctx, R0 + 3, y + 13, 1, 1, K);
  } else if (eyes === 'sleepy') {
    for (const x0 of [L0, R0]) {
      R(ctx, x0 - 1, y + 11, 5, 1, K);
      R(ctx, x0 + lx, y + 12, 3, 2, K);
    }
  } else if (eyes === 'wide') {
    for (const x0 of [L0, R0]) {
      R(ctx, x0 - 2, y + 8, 7, 7, K);
      R(ctx, x0 - 1, y + 9, 5, 5, pal.W);
      R(ctx, x0 + (lx > 0 ? 2 : lx < 0 ? 0 : 1), y + 10 + ly, 2, 2, K);
    }
  } else if (eyes === 'shades') {
    R(ctx, x - 12, y + 9, 24, 2, K);
    R(ctx, x - 11, y + 10, 9, 5, K);
    R(ctx, x + 2, y + 10, 9, 5, K);
    R(ctx, x - 10, y + 11, 2, 1, P.steel);
    R(ctx, x + 3, y + 11, 2, 1, P.steel);
    R(ctx, x - 9, y + 12, 1, 1, P.steel);
    R(ctx, x + 4, y + 12, 1, 1, P.steel);
  } else if (eyes === 'x') {
    for (const x0 of [L0, R0]) {
      line(ctx, x0 - 1, y + 9, x0 + 3, y + 13, K);
      line(ctx, x0 + 3, y + 9, x0 - 1, y + 13, K);
    }
  } else if (eyes === 'hearts') {
    for (const x0 of [L0 - 2, R0 - 2]) heart(ctx, x0, y + 9, P.red, P.pink);
  } else if (eyes === 'stars') {
    for (const x0 of [L0 + 1, R0 + 1]) {
      R(ctx, x0 - 2, y + 11, 5, 1, P.yellow);
      R(ctx, x0, y + 9, 1, 5, P.yellow);
      R(ctx, x0 - 1, y + 10, 3, 3, P.yellow);
    }
  } else if (eyes === 'cucumber') {
    for (const x0 of [L0 - 2, R0 - 2]) {
      disc(ctx, x0 + 3, y + 11, 4, P.darkGreen);
      disc(ctx, x0 + 3, y + 11, 3, P.green);
      disc(ctx, x0 + 3, y + 11, 2, P.cream);
      R(ctx, x0 + 2, y + 10, 1, 1, P.green);
      R(ctx, x0 + 4, y + 12, 1, 1, P.green);
    }
  } else if (eyes === 'spiral') {
    for (const x0 of [L0, R0]) {
      R(ctx, x0 - 1, y + 9, 5, 1, K);
      R(ctx, x0 + 3, y + 9, 1, 5, K);
      R(ctx, x0 - 1, y + 13, 5, 1, K);
      R(ctx, x0 - 1, y + 11, 1, 2, K);
      R(ctx, x0 + 1, y + 11, 1, 1, K);
    }
  }
  // brows
  if (!['shades', 'cucumber', 'hearts'].includes(eyes) && brows !== 'none') {
    const B = (bx, rows) => rows.forEach((dy, i) => R(ctx, bx + i, y + dy, 1, 1, E));
    if (brows === 'sad') {
      B(L0 - 1, [8, 8, 7, 6]);
      B(R0, [6, 7, 8, 8]);
    } else if (brows === 'angry') {
      B(L0 - 1, [6, 7, 8, 9]);
      B(R0, [9, 8, 7, 6]);
    } else if (brows === 'up') {
      B(L0 - 1, [6, 5, 5, 6]);
      B(R0, [6, 5, 5, 6]);
    } else {
      B(L0 - 1, [8, 7, 7, 8]);
      B(R0, [8, 7, 7, 8]);
    }
  }
  if (o.glasses) {
    for (const x0 of [L0, R0]) {
      R(ctx, x0 - 2, y + 8, 7, 1, K);
      R(ctx, x0 - 2, y + 14, 7, 1, K);
      R(ctx, x0 - 2, y + 8, 1, 7, K);
      R(ctx, x0 + 4, y + 8, 1, 7, K);
      R(ctx, x0 - 1, y + 9, 1, 1, P.white);
    }
    R(ctx, x - 2, y + 10, 4, 1, K);
  }
  // nose + cheeks
  R(ctx, x - 1, y + 14, 2, 1, pal.s);
  if (o.blush) {
    R(ctx, x - 11, y + 15, 3, 1, P.pink);
    R(ctx, x + 8, y + 15, 3, 1, P.pink);
  }
  if (o.tears) {
    const ty = y + 14 + (floor(o.tears * 8) % 6);
    R(ctx, L0, ty, 1, 2, P.cyan);
    R(ctx, R0 + 2, ty, 1, 2, P.cyan);
  }
  if (o.mustache) {
    R(ctx, x - 5, y + 15, 10, 2, pal.H);
    R(ctx, x - 6, y + 16, 1, 2, pal.H);
    R(ctx, x + 5, y + 16, 1, 2, pal.H);
  }
  if (o.beard) {
    const b = o.beard;
    R(ctx, x - 12, y + 12, 2, 4 + b * 2, pal.H);
    R(ctx, x + 10, y + 12, 2, 4 + b * 2, pal.H);
    R(ctx, x - 11, y + 16, 22, 2 + b * 2, pal.H);
    R(ctx, x - 9, y + 18 + b * 2, 18, 2 + b, pal.H);
    R(ctx, x - 6, y + 20 + b * 3, 12, 1 + b * 2, pal.H);
    if (b >= 2) R(ctx, x - 3, y + 21 + b * 5, 6, b * 2, pal.H);
    R(ctx, x - 3, y + 16, 6, 2, pal.S);
  }
  const m = o.mouth || 'smile';
  const my = y + 16;
  if (m === 'smile') {
    R(ctx, x - 3, my + 1, 6, 1, K);
    R(ctx, x - 4, my, 1, 1, K);
    R(ctx, x + 3, my, 1, 1, K);
  } else if (m === 'grin') {
    R(ctx, x - 4, my - 1, 8, 1, K);
    R(ctx, x - 4, my, 1, 2, K);
    R(ctx, x + 3, my, 1, 2, K);
    R(ctx, x - 3, my, 6, 1, pal.W);
    R(ctx, x - 3, my + 1, 6, 1, pal.M);
    R(ctx, x - 1, my + 1, 3, 1, pal.N);
    R(ctx, x - 3, my + 2, 6, 1, K);
  } else if (m === 'flat') {
    R(ctx, x - 2, my + 1, 4, 1, K);
  } else if (m === 'o') {
    R(ctx, x - 1, my - 1, 2, 1, K);
    R(ctx, x - 2, my, 1, 2, K);
    R(ctx, x + 1, my, 1, 2, K);
    R(ctx, x - 1, my, 2, 2, pal.M);
    R(ctx, x - 1, my + 2, 2, 1, K);
  } else if (m === 'O') {
    R(ctx, x - 2, my - 2, 4, 1, K);
    R(ctx, x - 3, my - 1, 1, 5, K);
    R(ctx, x + 2, my - 1, 1, 5, K);
    R(ctx, x - 2, my - 1, 4, 5, pal.M);
    R(ctx, x - 2, my + 2, 4, 2, pal.N);
    R(ctx, x - 2, my + 4, 4, 1, K);
  } else if (m === 'frown') {
    R(ctx, x - 3, my, 6, 1, K);
    R(ctx, x - 4, my + 1, 1, 1, K);
    R(ctx, x + 3, my + 1, 1, 1, K);
  } else if (m === 'wavy') {
    for (let i = 0; i < 8; i++) R(ctx, x - 4 + i, my + (i % 2), 1, 1, K);
  } else if (m === 'open') {
    R(ctx, x - 3, my - 1, 6, 1, K);
    R(ctx, x - 3, my, 1, 2, K);
    R(ctx, x + 2, my, 1, 2, K);
    R(ctx, x - 2, my, 4, 2, pal.M);
    R(ctx, x - 1, my + 1, 2, 1, pal.N);
    R(ctx, x - 2, my + 2, 4, 1, K);
  } else if (m === 'teeth') {
    R(ctx, x - 5, my - 1, 10, 4, K);
    R(ctx, x - 4, my, 8, 2, pal.W);
    R(ctx, x - 1, my, 1, 2, K);
    R(ctx, x + 2, my, 1, 2, K);
    R(ctx, x - 3, my, 1, 2, K);
  } else if (m === 'tongue') {
    R(ctx, x - 3, my, 6, 1, K);
    R(ctx, x - 1, my + 1, 3, 2, pal.N);
    R(ctx, x - 1, my + 3, 3, 1, K);
  } else if (m === 'kiss') {
    R(ctx, x - 1, my - 1, 2, 1, K);
    R(ctx, x, my, 1, 1, K);
    R(ctx, x - 1, my + 1, 2, 1, K);
  }
}

/**
 * Draw a big pixel person standing on ground line gy, centred on x.
 * o: { pal, hair, eyes, brows, mouth, look, lookY, armL, armR, legs ('stand' |
 *      'walk' | 'skirt' | 'none'), step, bob, small, blush, tears, mustache, beard,
 *      sleeves ('long' | 'short'), wiggle, hat }
 * Returns { top, handL, handR } (top = head top y; hands = [x, y]).
 */
export function hero(ctx, x, gy, o = {}) {
  const pal = mergePal(o.pal);
  x = round(x);
  const small = !!o.small;
  const legs = o.legs || 'stand';
  const k = small ? 0.75 : 1;
  const torsoH = small ? 11 : 16;
  const legH = legs === 'none' ? 0 : small ? 9 : 12;
  const f = (o.step || 0) % 4;
  const walkBob = legs === 'walk' && (f === 1 || f === 3) ? -1 : 0;
  const top = round(gy - (22 + torsoH + legH) + (o.bob || 0) + walkBob);
  const hipY = top + 22 + torsoH;
  // long hair hangs behind everything
  if (o.hair === 'long') draw(ctx, HAIR_L.long, x, top, pal);
  // legs
  if (legs !== 'none') {
    const fy = gy - 4;
    const lift = (side) => (legs === 'walk' && ((side < 0 && f === 1) || (side > 0 && f === 3)) ? 3 : 0);
    if (legs === 'skirt') {
      for (const side of [-1, 1]) stroke(ctx, [[x + side * 4, hipY], [x + side * 4, fy - lift(side)]], 3, pal.S, pal.K);
    } else {
      for (const side of [-1, 1]) stroke(ctx, [[x + side * 4, hipY - 1], [x + side * 5, fy - lift(side)]], 6, pal.P, pal.K);
      R(ctx, x - 7, hipY - 2, 14, 4, pal.P);
      R(ctx, x - 1, hipY + 1, 1, legH - 6, pal.p);
    }
    for (const side of [-1, 1]) {
      const sx = x + side * 5 + (side < 0 ? -5 : -2);
      const sy = fy - lift(side);
      R(ctx, sx - 1, sy - 1, 9, 5, pal.K);
      R(ctx, sx, sy, 7, 3, pal.B);
      R(ctx, sx + (side < 0 ? 0 : 3), sy, 4, 1, A(P.white, 0.25));
    }
    if (legs === 'skirt') {
      poly(ctx, [[x - 12, hipY - 3], [x + 12, hipY - 3], [x + 16, hipY + 7], [x - 16, hipY + 7]], pal.K);
      poly(ctx, [[x - 11, hipY - 3], [x + 11, hipY - 3], [x + 15, hipY + 6], [x - 15, hipY + 6]], pal.D);
      R(ctx, x + 6, hipY - 2, 3, 8, pal.d);
    }
  }
  draw(ctx, small ? TORSO_LS : TORSO_L, x, top, pal);
  const sy = top + (small ? 24 : 25);
  const handL = armL(ctx, x - 10, sy, -1, o.armL || 'down', pal, k, o.sleeves, o.wiggle || 0);
  const handR = armL(ctx, x + 9, sy, 1, o.armR || 'down', pal, k, o.sleeves, -(o.wiggle || 0));
  draw(ctx, HEAD_L, x, top, pal);
  faceL(ctx, x, top, o, pal);
  if (o.hair === 'puff') {
    for (const [dx, dy, rr] of [[-10, 2, 6], [10, 2, 6], [-6, -3, 7], [6, -3, 7], [0, -5, 8], [-13, 9, 4], [13, 9, 4]]) disc(ctx, x + dx, top + dy, rr + 1, pal.K);
    for (const [dx, dy, rr] of [[-10, 2, 6], [10, 2, 6], [-6, -3, 7], [6, -3, 7], [0, -5, 8], [-13, 9, 4], [13, 9, 4]]) disc(ctx, x + dx, top + dy, rr, pal.H);
    R(ctx, x - 7, top - 6, 3, 2, pal.h);
    R(ctx, x - 9, top - 3, 2, 2, pal.h);
  } else if (o.hair === 'long') draw(ctx, HAIR_L.bob, x, top, pal);
  else if (o.hair !== 'none') draw(ctx, HAIR_L[o.hair || 'short'] || HAIR_L.short, x, top, pal);
  if (o.hat === 'sunhat') {
    oval(ctx, x, top + 1, 25, 5, pal.K);
    oval(ctx, x, top, 24, 4, pal.A);
    rrect(ctx, x - 13, top - 13, 26, 14, pal.K, 3);
    rrect(ctx, x - 12, top - 12, 24, 13, pal.A, 3);
    R(ctx, x - 12, top - 3, 24, 3, pal.a);
    R(ctx, x - 9, top - 10, 4, 2, P.white);
  } else if (o.hat === 'cap') {
    rrect(ctx, x - 13, top - 5, 26, 12, pal.K, 3);
    rrect(ctx, x - 12, top - 4, 24, 10, pal.A, 3);
    R(ctx, x - 2, top + 4, 22, 3, pal.K);
    R(ctx, x - 1, top + 4, 20, 2, pal.a);
  } else if (o.hat === 'headband') {
    R(ctx, x - 13, top + 5, 26, 4, pal.K);
    R(ctx, x - 12, top + 6, 24, 2, pal.A);
  }
  // hands raised to the face stay in front of it
  for (const [pose, hd] of [[o.armL, handL], [o.armR, handR]]) {
    if (pose === 'mouth' || pose === 'ear' || o.handsFront) {
      disc(ctx, hd[0], hd[1], 3, pal.K);
      disc(ctx, hd[0], hd[1], 2, pal.S);
    }
  }
  if (o.sweat) {
    const s = floor(o.sweat * 6) % 5;
    R(ctx, x + 13, top + 4 + s, 2, 1, P.cyan);
    R(ctx, x + 12, top + 5 + s, 3, 3, P.blue);
    R(ctx, x + 13, top + 5 + s, 1, 1, P.white);
  }
  return { top, handL, handR };
}

// ---------------------------------------------------------------------------
// Display lettering for brand wordmarks. Glyphs are pen-stroke skeletons on a
// 4 x 6 grid, rendered once (cached) at native resolution with a round or
// square pen, banded fills, highlight crescents, outlines and extrusion —
// custom lettering per brand, never the body font.

const SK = {
  A: [4, [[0, 6], [0, 1.8], [0.6, 0.5], [1.4, 0], [2.6, 0], [3.4, 0.5], [4, 1.8], [4, 6]], [[0, 3.6], [4, 3.6]]],
  B: [4, [[0, 6], [0, 0], [2.6, 0], [3.5, 0.4], [3.8, 1.4], [3.5, 2.4], [2.6, 2.9], [0, 2.9]], [[2.6, 2.9], [3.6, 3.3], [4, 4.4], [3.6, 5.6], [2.6, 6], [0, 6]]],
  C: [4, [[4, 1.2], [3.4, 0.3], [2.2, 0], [1, 0.2], [0.2, 1], [0, 2.4], [0, 3.6], [0.2, 5], [1, 5.8], [2.2, 6], [3.4, 5.7], [4, 4.8]]],
  D: [4, [[0, 0], [0, 6], [2.2, 6], [3.4, 5.5], [4, 4.2], [4, 1.8], [3.4, 0.5], [2.2, 0], [0, 0]]],
  E: [3.6, [[3.6, 0], [0, 0], [0, 6], [3.6, 6]], [[0, 2.9], [3, 2.9]]],
  F: [3.6, [[3.6, 0], [0, 0], [0, 6]], [[0, 2.9], [3, 2.9]]],
  G: [4, [[4, 1.2], [3.4, 0.3], [2.2, 0], [1, 0.2], [0.2, 1], [0, 2.4], [0, 3.6], [0.2, 5], [1, 5.8], [2.2, 6], [3.4, 5.7], [4, 4.8], [4, 3.4], [2.4, 3.4]]],
  H: [4, [[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
  I: [0, [[0, 0], [0, 6]]],
  J: [3.6, [[3.6, 0], [3.6, 4.4], [3.1, 5.6], [1.8, 6], [0.5, 5.6], [0, 4.6]]],
  K: [4, [[0, 0], [0, 6]], [[4, 0], [0.4, 3.3]], [[1.6, 2.3], [4, 6]]],
  L: [3.4, [[0, 0], [0, 6], [3.4, 6]]],
  M: [5, [[0, 6], [0, 0], [2.5, 3.6], [5, 0], [5, 6]]],
  N: [4, [[0, 6], [0, 0], [4, 6], [4, 0]]],
  O: [4.2, [[2.1, 0], [0.8, 0.3], [0.1, 1.4], [0, 3], [0.1, 4.6], [0.8, 5.7], [2.1, 6], [3.4, 5.7], [4.1, 4.6], [4.2, 3], [4.1, 1.4], [3.4, 0.3], [2.1, 0]]],
  P: [4, [[0, 6], [0, 0], [2.6, 0], [3.6, 0.4], [4, 1.6], [3.6, 2.8], [2.6, 3.2], [0, 3.2]]],
  Q: [4.2, [[2.1, 0], [0.8, 0.3], [0.1, 1.4], [0, 3], [0.1, 4.6], [0.8, 5.7], [2.1, 6], [3.4, 5.7], [4.1, 4.6], [4.2, 3], [4.1, 1.4], [3.4, 0.3], [2.1, 0]], [[2.6, 4.4], [4.4, 6.4]]],
  R: [4, [[0, 6], [0, 0], [2.6, 0], [3.6, 0.4], [4, 1.6], [3.6, 2.8], [2.6, 3.2], [0, 3.2]], [[2.2, 3.2], [4, 6]]],
  S: [4, [[3.9, 0.9], [3.1, 0.1], [1.2, 0], [0.3, 0.5], [0, 1.5], [0.3, 2.4], [1.2, 2.9], [2.8, 3.1], [3.7, 3.6], [4, 4.6], [3.7, 5.5], [2.8, 6], [0.9, 6], [0, 5.2]]],
  T: [4, [[0, 0], [4, 0]], [[2, 0], [2, 6]]],
  U: [4, [[0, 0], [0, 4.4], [0.6, 5.6], [2, 6], [3.4, 5.6], [4, 4.4], [4, 0]]],
  V: [4, [[0, 0], [2, 6], [4, 0]]],
  W: [5.6, [[0, 0], [1.3, 6], [2.8, 2], [4.3, 6], [5.6, 0]]],
  X: [4, [[0, 0], [4, 6]], [[4, 0], [0, 6]]],
  Y: [4, [[0, 0], [2, 3.2], [4, 0]], [[2, 3.2], [2, 6]]],
  Z: [4, [[0, 0], [4, 0], [0, 6], [4, 6]]],
  0: [3.6, [[1.8, 0], [0.6, 0.4], [0, 1.6], [0, 4.4], [0.6, 5.6], [1.8, 6], [3, 5.6], [3.6, 4.4], [3.6, 1.6], [3, 0.4], [1.8, 0]]],
  1: [1.6, [[0, 1.2], [1.6, 0], [1.6, 6]]],
  2: [4, [[0.1, 1.3], [0.8, 0.3], [2, 0], [3.2, 0.3], [3.9, 1.3], [3.7, 2.5], [0, 6], [4, 6]]],
  3: [4, [[0, 0.8], [1, 0], [2.8, 0], [3.7, 0.6], [3.8, 1.7], [3, 2.8], [1.6, 2.9], [3, 3], [3.9, 3.9], [4, 4.8], [3.4, 5.7], [2.2, 6], [0.8, 5.9], [0, 5.2]]],
  4: [4, [[3, 6], [3, 0], [0, 4.2], [4, 4.2]]],
  5: [4, [[3.8, 0], [0.4, 0], [0.2, 2.6], [1.4, 2.2], [2.8, 2.3], [3.7, 3], [4, 4.2], [3.6, 5.5], [2.4, 6], [0.9, 5.9], [0, 5.2]]],
  6: [4, [[3.6, 0.4], [2.4, 0], [1.2, 0.3], [0.3, 1.3], [0, 3], [0, 4.4], [0.6, 5.6], [2, 6], [3.4, 5.6], [4, 4.4], [3.6, 3.2], [2.4, 2.7], [1.2, 2.9], [0.1, 3.6]]],
  7: [4, [[0, 0], [4, 0], [1.4, 6]]],
  8: [4, [[2, 2.8], [0.7, 2.4], [0.3, 1.4], [0.8, 0.3], [2, 0], [3.2, 0.3], [3.7, 1.4], [3.3, 2.4], [2, 2.8], [0.6, 3.4], [0, 4.5], [0.6, 5.6], [2, 6], [3.4, 5.6], [4, 4.5], [3.4, 3.4], [2, 2.8]]],
  9: [4, [[3.9, 2.4], [2.8, 3.1], [1.4, 3.1], [0.4, 2.5], [0, 1.5], [0.5, 0.4], [2, 0], [3.4, 0.4], [4, 1.6], [4, 3.6], [3.5, 5.2], [2.4, 6], [0.6, 5.8]]],
  '-': [3, [[0, 3.2], [3, 3.2]]],
  '.': [0, [[0, 6], [0, 6]]],
  '!': [0, [[0, 0], [0, 3.8]], [[0, 6], [0, 6]]],
  "'": [0, [[0, 0], [0, 1.4]]],
  '?': [3.6, [[0, 1], [0.8, 0.1], [2, 0], [3.2, 0.3], [3.6, 1.3], [3, 2.4], [1.8, 3.1], [1.8, 4]], [[1.8, 6], [1.8, 6]]],
  '+': [4, [[2, 1.4], [2, 4.8]], [[0.3, 3.1], [3.7, 3.1]]],
  '/': [3, [[3, 0], [0, 6]]],
  ':': [0, [[0, 2], [0, 2]], [[0, 5.6], [0, 5.6]]],
  ' ': [2.2],
};

function penSpans(r, square) {
  const out = [];
  if (square) {
    for (let dy = -r; dy <= r; dy++) out.push([dy, -r, 2 * r + 1]);
  } else {
    const rr = (r + 0.5) ** 2;
    for (let dy = -r; dy <= r; dy++) {
      const hw = floor(sqrt(rr - dy * dy));
      out.push([dy, -hw, hw * 2 + 1]);
    }
  }
  return out;
}

/** Stamp pen centres (deduplicated integer points) with radius r. */
function stampAll(c, pts, r, square, color, dx = 0, dy = 0) {
  if (r < 0) return;
  c.fillStyle = color;
  const spans = penSpans(r, square);
  for (const [x, y] of pts) for (const [sy, sx, w] of spans) c.fillRect(x + sx + dx, y + sy + dy, w, 1);
}

/** Lay out a word: returns pen-centre points per letter plus metrics. */
function layoutWord(str, st) {
  const h = st.h ?? 24;
  const r = st.pen ?? 3;
  const uy = (h - 2 * r - 1) / 6;
  const ux = uy * (st.wide ?? 0.9);
  const gap = st.gap ?? 2;
  const slant = st.slant ?? 0;
  const letters = [];
  let cur = 0;
  const S = String(str).toUpperCase();
  for (let i = 0; i < S.length; i++) {
    const g = SK[S[i]] || SK[' '];
    const [gw, ...strokes] = g;
    const bob = typeof st.wave === 'function' ? st.wave(i) : Array.isArray(st.wave) ? st.wave[i % st.wave.length] || 0 : 0;
    const set = new Set();
    const pts = [];
    for (const pl of strokes) {
      for (let k = 0; k < pl.length; k++) {
        const a = pl[k];
        const b = pl[min(k + 1, pl.length - 1)];
        const ax = cur + r + a[0] * ux;
        const ay = r + a[1] * uy + bob;
        const bx = cur + r + b[0] * ux;
        const by = r + b[1] * uy + bob;
        const n = max(1, ceil(Math.hypot(bx - ax, by - ay) * 2));
        for (let s = 0; s <= n; s++) {
          const yy = ay + ((by - ay) * s) / n;
          const xx = ax + ((bx - ax) * s) / n + (h - yy) * slant;
          const px = round(xx);
          const py = round(yy);
          const key = px * 4096 + py;
          if (!set.has(key)) {
            set.add(key);
            pts.push([px, py]);
          }
        }
      }
    }
    const lw = round(gw * ux) + 2 * r + 1;
    letters.push({ ch: S[i], x: cur, w: lw, pts, bob });
    cur += lw + gap;
  }
  return { letters, width: cur - gap + ceil(h * slant), h, r };
}

const WORDMARKS = new Map(); // str -> [{ st, wm }]
const MARK_BY_STYLE = new WeakMap(); // style object -> Map(str -> wm)
function sameStyle(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (typeof a === 'function') return a.toString() === b.toString();
  if (typeof a !== 'object') return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!sameStyle(a[i], b[i])) return false;
    return true;
  }
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) if (!sameStyle(a[k], b[k])) return false;
  return true;
}
/** Memoise a factory: `const MARK = lazy(() => wordmark(...))` builds once. */
export function lazy(fn) {
  let done = false;
  let v;
  return () => {
    if (!done) {
      v = fn();
      done = true;
    }
    return v;
  };
}
/**
 * Render (once) a brand wordmark. Style:
 *  h, pen, square, wide, gap, slant, wave(i) | [..]
 *  fill: [colours top→bottom] or per-letter via colors: [[..], [..]]
 *  hi: highlight crescent colour, outline: [[colour, width], ...] inner→outer,
 *  depth, depthColor, deco(c, info)
 * Returns { cv, w, h, ox, oy, letters } — draw with drawMark().
 */
export function wordmark(str, st = {}) {
  // Fast paths: the same style object (see lazy()), else a structural match
  // against marks already built for this string. No JSON per frame.
  let byStyle = MARK_BY_STYLE.get(st);
  let wm = byStyle?.get(str);
  if (wm) return wm;
  let list = WORDMARKS.get(str);
  if (!list) WORDMARKS.set(str, (list = []));
  for (const e of list) {
    if (sameStyle(e.st, st)) {
      if (!byStyle) MARK_BY_STYLE.set(st, (byStyle = new Map()));
      byStyle.set(str, e.wm);
      return e.wm;
    }
  }
  const L = layoutWord(str, st);
  const outlines = st.outline ?? [[P.black, 2]];
  const ow = outlines.reduce((s, o) => s + o[1], 0);
  const depth = st.depth ?? 0;
  const pad = ow + 2;
  const cw = L.width + pad * 2 + 2;
  const ch = L.h + pad * 2 + depth + 4;
  const cv = document.createElement('canvas');
  cv.width = cw;
  cv.height = ch;
  const c = cv.getContext('2d');
  const sq = !!st.square;
  const r = L.r;
  const all = [];
  for (const l of L.letters) for (const [x, y] of l.pts) all.push([x + pad, y + pad]);
  // outer outline + extrusion
  const outer = outlines[outlines.length - 1][0];
  for (let d = depth; d >= 0; d--) stampAll(c, all, r + ow, sq, outer, 0, d);
  if (depth > 0) for (let d = depth; d >= 1; d--) stampAll(c, all, r + ow - outlines[outlines.length - 1][1], sq, st.depthColor ?? P.black, 0, d);
  // inner outlines
  let rad = r + ow;
  for (let i = outlines.length - 1; i >= 0; i--) {
    stampAll(c, all, rad, sq, outlines[i][0]);
    rad -= outlines[i][1];
  }
  // banded fill (per letter colours optional)
  const fillLetter = (l, cols, rr, dx = 0, dy = 0) => {
    const pts = l.pts.map(([x, y]) => [x + pad, y + pad]);
    const n = cols.length;
    for (let b = 0; b < n; b++) {
      const y0 = pad + l.bob + round((b * L.h) / n) - (b === 0 ? 4 : 0);
      const y1 = pad + l.bob + round(((b + 1) * L.h) / n) + (b === n - 1 ? 4 : 0);
      c.save();
      c.beginPath();
      c.rect(0, y0, cw, y1 - y0);
      c.clip();
      stampAll(c, pts, rr, sq, cols[b], dx, dy);
      c.restore();
    }
  };
  L.letters.forEach((l, i) => {
    const cols = st.colors ? st.colors[i % st.colors.length] : st.fill ?? [P.white];
    fillLetter(l, cols, r);
    if (st.hi && r >= 2) {
      stampAll(c, l.pts.map(([x, y]) => [x + pad, y + pad]), r - 1, sq, st.hi, -1, -1);
      fillLetter(l, cols, r - 1, 0, 0);
    }
  });
  const info = { pad, letters: L.letters, r, h: L.h, w: L.width };
  if (st.deco) st.deco(c, info);
  wm = { cv, w: L.width, h: L.h, ox: pad, oy: pad, letters: L.letters, depth };
  list.push({ st, wm });
  if (!byStyle) MARK_BY_STYLE.set(st, (byStyle = new Map()));
  byStyle.set(str, wm);
  return wm;
}

/** Draw a wordmark with its glyph box top centred at (cx, y). Returns left x. */
export function drawMark(ctx, wm, cx, y, { reveal = 1, drop = 0 } = {}) {
  const x0 = round(cx - wm.w / 2) - wm.ox;
  const y0 = round(y) - wm.oy;
  if (reveal >= 1 && !drop) {
    ctx.drawImage(wm.cv, x0, y0);
    return x0 + wm.ox;
  }
  // per-letter entrance: letters pop up from below in sequence
  const n = wm.letters.length;
  wm.letters.forEach((l, i) => {
    const p = clamp(reveal * (n + 3) - i * 1, 0, 1);
    if (p <= 0) return;
    const dy = round((1 - easeOutBack(p, 2.4)) * (drop || 30));
    const sx = l.x + (i === 0 ? 0 : wm.ox - 1);
    const sw = l.w + (i === 0 ? wm.ox : 2) + (i === n - 1 ? wm.ox + 8 : 0);
    ctx.drawImage(wm.cv, sx, 0, sw, wm.cv.height, x0 + sx, y0 + dy, sw, wm.cv.height);
  });
  return x0 + wm.ox;
}

const SILS = new WeakMap();
function silhouette(cv, color) {
  let m = SILS.get(cv);
  if (!m) SILS.set(cv, (m = new Map()));
  let s = m.get(color);
  if (!s) {
    s = document.createElement('canvas');
    s.width = cv.width;
    s.height = cv.height;
    const c = s.getContext('2d');
    c.drawImage(cv, 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = color;
    c.fillRect(0, 0, s.width, s.height);
    m.set(color, s);
  }
  return s;
}

/**
 * Light sweep across a piece of cached art drawn at (x, y): a stair-stepped
 * diagonal band of light clipped to the art's own silhouette. p: 0..1.
 */
export function glint(ctx, art, x, y, p, { width = 8, color = P.white, alpha = 0.7, slope = 0.6 } = {}) {
  if (p <= 0 || p >= 1) return;
  const sil = silhouette(art, color);
  const hh = art.height;
  const span = art.width + hh * slope + width * 2;
  const bx = round(-hh * slope - width + p * span);
  x = round(x);
  y = round(y);
  ctx.save();
  ctx.beginPath();
  for (let yy = 0; yy < hh; yy += 2) {
    const sx = bx + round((hh - yy) * slope);
    ctx.rect(x + sx, y + yy, width, 2);
    ctx.rect(x + sx + width + 3, y + yy, 2, 2);
  }
  ctx.clip();
  ctx.globalAlpha = alpha;
  ctx.drawImage(sil, x, y);
  ctx.restore();
}

/** Soft dithered glow: concentric translucent discs. */
export function glow(ctx, cx, cy, rad, color, a = 0.12, steps = 4) {
  for (let i = steps; i >= 1; i--) disc(ctx, cx, cy, round((rad * i) / steps), A(color, a));
}

/** Small rounded "web address" pill for end slates. */
export function urlPill(ctx, s, cx, y, { bg = P.black, color = P.white, border = P.white } = {}) {
  const w = measureText(s) + 14;
  panel(ctx, round(cx - w / 2), y, w, 13, bg, border, 2);
  return text(ctx, s, cx, y + 3, { color, align: 'center' });
}

/** Draw cached art scaled about its bottom centre (cx, by): squash & stretch. */
export function squashArt(ctx, art, cx, by, sx = 1, sy = 1) {
  const w = max(1, round(art.width * sx));
  const h = max(1, round(art.height * sy));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(art, round(cx - w / 2), round(by - h), w, h);
}

// ---------------------------------------------------------------------------
// Product hero furniture

/**
 * 2.5D turntable: wraps a label texture (any width = one full turn) around a
 * vertical cylinder of radius r with its top-left at (cx - r, y). turn in
 * revolutions; the key light stays put while the label turns under it.
 * o: { light (-1..1 across the face, default -0.4), shade, spec, rim }
 */
export function cylinder(ctx, label, cx, y, r, turn, { light = -0.4, shade = true, spec = true, h = label.height } = {}) {
  cx = round(cx);
  y = round(y);
  const lw = label.width;
  const t = turn - floor(turn);
  for (let i = -r; i < r; i++) {
    const xn = (i + 0.5) / r;
    const u = Math.asin(xn) / (2 * PI) + t;
    const col = floor((u - floor(u)) * lw) % lw;
    ctx.drawImage(label, col, 0, 1, h, cx + i, y, 1, h);
    if (!shade) continue;
    const d = abs(xn - light);
    if (abs(xn) > 0.82) R(ctx, cx + i, y, 1, h, A(P.black, 0.42));
    else if (abs(xn) > 0.6 && xn > light) R(ctx, cx + i, y, 1, h, A(P.black, 0.22));
    if (spec && d < 0.07) R(ctx, cx + i, y, 1, h, A(P.white, 0.55));
    else if (spec && d < 0.16) R(ctx, cx + i, y, 1, h, A(P.white, 0.2));
  }
}

/** Theatre spotlight: stepped translucent cone from above plus a floor pool. */
export function spotlight(ctx, cx, floorY, { top = -4, w0 = 16, w1 = 64, color = P.white, a = 0.05, layers = 3, pool = P.slate, poolRx = null } = {}) {
  for (let i = 0; i < layers; i++) {
    const k = i * 0.22;
    poly(ctx, [[cx - w0 * (1 + k), top], [cx + w0 * (1 + k), top], [cx + w1 * (1 + k), floorY], [cx - w1 * (1 + k), floorY]], A(color, a));
  }
  if (pool) {
    const rx = poolRx ?? w1;
    oval(ctx, cx, floorY, rx, max(2, round(rx / 7)), pool);
    oval(ctx, cx, floorY, round(rx * 0.75), max(1, round(rx / 10)), A(color, 0.12));
  }
}

/** Starburst sticker; s = scale 0..1 (feed spring() for a pop). Draw text on top. */
export function badge(ctx, cx, cy, r, s, { n = 14, fill = P.yellow, outline = P.black, rot = 0, inner = 0.8, ring: ringC = null } = {}) {
  const rr = round(r * s);
  if (rr < 2) return 0;
  poly(ctx, starPts(cx, cy, n, rr + 2, rr * inner + 2, rot), outline);
  poly(ctx, starPts(cx, cy, n, rr, rr * inner, rot), fill);
  if (ringC && rr > 8) ring(ctx, cx, cy, round(rr * inner) - 3, ringC);
  return rr;
}

// ---------------------------------------------------------------------------
// The shared end slate: the same layout and beat for every brand, so the
// break feels like one channel. Product left (drawn by the ad), wordmark
// top right, tagline ribbon, URL pill and micro-font legal line.

/**
 * o: { bg(ctx, lt), product(ctx, lt), mark: wordmark | () => wordmark, markX, markY,
 *      sub: wordmark | fn (second lettering under the mark), subY, line: text under the mark,
 *      lineColor, lineY, tagline, tag: { bg, edge, color }, tagX, tagY, url, pill: { bg, border, color },
 *      urlX, urlY, legal, legalColor, legalBg }
 * Timing: mark letters 0.15-0.85 s, sub 0.7 s, line 0.95 s, tagline 1.0 s, url 1.5 s,
 * legal 1.7 s, light sweep across the mark every 3.5 s.
 */
export function endSlate(ctx, lt, o = {}) {
  const { markX = 262, markY = 30, subY = null, lineY = null, tagX = W / 2, tagY = 146, urlX = tagX, urlY = 172 } = o;
  o.bg?.(ctx, lt);
  o.product?.(ctx, lt);
  let below = markY;
  if (o.mark) {
    const mk = typeof o.mark === 'function' ? o.mark() : o.mark;
    const x0 = drawMark(ctx, mk, markX, markY, { reveal: prog(lt, 0.15, 0.85), drop: 34 });
    if (lt > 1.2) glint(ctx, mk.cv, x0 - mk.ox, markY - mk.oy, ((lt - 1.2) % 3.5) / 0.7, { width: 6 });
    below = markY + mk.h + mk.depth + 6;
  }
  if (o.sub && lt > 0.7) {
    const sb = typeof o.sub === 'function' ? o.sub() : o.sub;
    const sy = subY ?? below;
    drawMark(ctx, sb, markX, sy - round((1 - easeOutBack(prog(lt, 0.7, 1.0), 2.2)) * 10));
    below = sy + sb.h + sb.depth + 6;
  }
  if (o.line && lt > 0.95) micro(ctx, o.line, markX, lineY ?? below + 2, { color: o.lineColor || P.white, align: 'center' });
  if (o.tagline && lt > 1.0) slogan(ctx, o.tagline, tagX, tagY, lt - 1.0, { scale: 2, ...(o.tag || {}) });
  if (o.url && lt > 1.5) {
    const p = easeOutBack(prog(lt, 1.5, 1.75), 2.5);
    urlPill(ctx, o.url, urlX, urlY + round((1 - p) * 8), o.pill || {});
  }
  if (o.legal) finePrint(ctx, o.legal, { lt: lt - 1.7, color: o.legalColor || P.fog, bg: o.legalBg === undefined ? P.black : o.legalBg });
}

// ---------------------------------------------------------------------------
// Close-up faces (push-ins): the same chibi characters drawn natively large.

function arc(cx, cy, rx, ry, a0, a1, n = 12) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + Math.cos(a) * rx, cy + sin(a) * ry]);
  }
  return pts;
}
function sq(ctx, pts, col, w = 2) {
  for (let i = 0; i + 1 < pts.length; i++) line(ctx, pts[i][0] - floor(w / 2), pts[i][1] - floor(w / 2), pts[i + 1][0] - floor(w / 2), pts[i + 1][1] - floor(w / 2), col, w);
}

/**
 * Big face for close-ups. (cx, cy) = face centre, s = head half-width (≈40).
 * o: { pal, hair: 'short'|'bob'|'spiky'|'bun'|'bald'|'towel'|'puff', eyes, brows,
 *      mouth, look, blush, glasses, beard, tears, sweat, shoulders }
 */
export function faceCU(ctx, cx, cy, s, o = {}) {
  const pal = mergePal(o.pal);
  cx = round(cx);
  cy = round(cy);
  const K = pal.K;
  const rx = s;
  const ry = round(s * 0.92);
  const u = s / 40;
  const U = (v) => round(v * u);
  // shoulders / body
  if (o.shoulders !== false) {
    const by = cy + ry - U(4);
    rrect(ctx, cx - U(56) - 2, by - 2, U(112) + 4, H, K, 3);
    rrect(ctx, cx - U(56), by, U(112), H, pal.T, 3);
    R(ctx, cx - U(56), by, U(10), H, pal.t);
    poly(ctx, [[cx - U(14), by], [cx + U(14), by], [cx, by + U(18)]], pal.C);
    if (pal.X !== pal.T) poly(ctx, [[cx - U(4), by + U(4)], [cx + U(4), by + U(4)], [cx + U(6), by + U(40)], [cx - U(6), by + U(40)]], pal.X);
    R(ctx, cx - U(8), by - U(8), U(16), U(10), pal.s);
  }
  if (o.hair === 'bob' || o.hair === 'long') {
    const bottom = cy + (o.hair === 'long' ? U(52) : U(26));
    const hw = rx + U(8);
    oval(ctx, cx, cy - U(4), hw + 2, ry + U(4) + 2, K);
    R(ctx, cx - hw - 2, cy - U(4), hw * 2 + 5, bottom - cy + U(4) + 2, K);
    oval(ctx, cx, cy - U(4), hw, ry + U(4), pal.H);
    R(ctx, cx - hw, cy - U(4), hw * 2 + 1, bottom - cy + U(4), pal.H);
    R(ctx, cx - hw + U(3), cy, U(3), bottom - cy - U(2), pal.h);
  }
  // ears
  for (const sd of [-1, 1]) {
    disc(ctx, cx + sd * (rx - U(1)), cy + U(4), U(8) + 2, K);
    disc(ctx, cx + sd * (rx - U(1)), cy + U(4), U(8), pal.s);
  }
  // head with lower-right shade
  oval(ctx, cx, cy, rx + 2, ry + 2, K);
  oval(ctx, cx, cy, rx, ry, pal.s);
  oval(ctx, cx - U(3), cy - U(3), rx - U(3), ry - U(3), pal.S);
  // eyes
  const ex = U(15);
  const ey = cy + U(2);
  const lx = round((o.look || 0) * U(3));
  const eyes = o.eyes || 'open';
  for (const sd of [-1, 1]) {
    const x = cx + sd * ex;
    if (eyes === 'open' || eyes === 'wide' || eyes === 'sad' || eyes === 'angry') {
      const er = eyes === 'wide' ? U(10) : U(8);
      oval(ctx, x, ey, er - U(1) + 2, er + U(2) + 2, K);
      oval(ctx, x, ey, er - U(1), er + U(2), pal.W);
      const ir = eyes === 'wide' ? U(4) : U(6);
      disc(ctx, x + lx, ey + U(1), ir, o.iris || P.navy);
      disc(ctx, x + lx, ey + U(1), max(1, ir - U(3)), K);
      R(ctx, x + lx - U(3), ey - U(3), U(3), U(3), pal.W);
      R(ctx, x + lx + U(2), ey + U(3), U(1) || 1, U(1) || 1, pal.W);
    } else if (eyes === 'happy') {
      sq(ctx, arc(x, ey + U(4), U(8), U(7), PI * 1.1, PI * 1.9), K, U(3));
    } else if (eyes === 'closed') {
      sq(ctx, arc(x, ey - U(2), U(8), U(5), PI * 0.15, PI * 0.85), K, U(3));
    } else if (eyes === 'sleepy') {
      oval(ctx, x, ey + U(2), U(8), U(5), K);
      oval(ctx, x, ey + U(2), U(6), U(3), pal.W);
      disc(ctx, x + lx, ey + U(3), U(3), K);
      R(ctx, x - U(9), ey - U(3), U(18), U(5), pal.S);
      R(ctx, x - U(9), ey + U(1), U(18), U(2), K);
    } else if (eyes === 'hearts') {
      bigHeart(ctx, x, ey, U(8), P.red);
      R(ctx, x - U(6), ey - U(4), U(2), U(2), P.pink);
    } else if (eyes === 'stars') {
      poly(ctx, starPts(x, ey, 5, U(10) + 2, U(4) + 2, 0), K);
      poly(ctx, starPts(x, ey, 5, U(10), U(4), 0), P.yellow);
      R(ctx, x - U(2), ey - U(3), U(2), U(2), P.white);
    } else if (eyes === 'x') {
      sq(ctx, [[x - U(6), ey - U(6)], [x + U(6), ey + U(6)]], K, U(3));
      sq(ctx, [[x + U(6), ey - U(6)], [x - U(6), ey + U(6)]], K, U(3));
    } else if (eyes === 'cucumber') {
      disc(ctx, x, ey, U(10) + 1, P.darkGreen);
      disc(ctx, x, ey, U(9), P.green);
      disc(ctx, x, ey, U(7), P.cream);
      for (let k = 0; k < 6; k++) R(ctx, x + round(Math.cos(k) * U(4)), ey + round(sin(k) * U(4)), 1, 1, P.green);
    }
    // brows
    const br = o.brows || (eyes === 'sad' ? 'sad' : eyes === 'angry' ? 'angry' : eyes === 'wide' ? 'up' : 'flat');
    if (eyes !== 'cucumber' && br !== 'none') {
      const by = ey - U(14) - (br === 'up' ? U(4) : 0);
      const tilt = br === 'sad' ? -U(4) : br === 'angry' ? U(4) : 0;
      const inner = [x - sd * U(7), by + tilt];
      const outer = [x + sd * U(7), by - (br === 'flat' ? U(1) : 0)];
      sq(ctx, [outer, [x, by - U(2)], inner], pal.E || K, U(3));
    }
  }
  if (o.glasses) {
    for (const sd of [-1, 1]) {
      const x = cx + sd * ex;
      R(ctx, x - U(11), ey - U(10), U(22), 2, K);
      R(ctx, x - U(11), ey + U(10), U(22), 2, K);
      R(ctx, x - U(11), ey - U(10), 2, U(22), K);
      R(ctx, x + U(11) - 2, ey - U(10), 2, U(22), K);
      R(ctx, x - U(8), ey - U(7), U(4), 1, P.white);
    }
    R(ctx, cx - U(4), ey - U(4), U(8), 2, K);
  }
  // nose + cheeks
  R(ctx, cx - U(2), cy + U(12), U(4), U(2), pal.s);
  if (o.blush) {
    oval(ctx, cx - U(25), cy + U(16), U(6), U(3), P.pink);
    oval(ctx, cx + U(25), cy + U(16), U(6), U(3), P.pink);
  }
  if (o.beard) {
    const b = o.beard;
    poly(ctx, [[cx - rx + U(2), cy + U(6)], [cx + rx - U(2), cy + U(6)], [cx + U(26), cy + ry + U(b * 6)], [cx, cy + ry + U(8 + b * 9)], [cx - U(26), cy + ry + U(b * 6)]], pal.H);
    oval(ctx, cx, cy + U(24), U(10), U(5), pal.S);
  }
  if (o.mustache) poly(ctx, [[cx - U(14), cy + U(22)], [cx, cy + U(16)], [cx + U(14), cy + U(22)], [cx, cy + U(20)]], pal.H);
  // mouth
  const my = cy + U(24);
  const m = o.mouth || 'smile';
  if (m === 'smile') sq(ctx, arc(cx, my - U(6), U(10), U(7), PI * 0.2, PI * 0.8), K, U(3));
  else if (m === 'frown') sq(ctx, arc(cx, my + U(6), U(9), U(6), PI * 1.2, PI * 1.8), K, U(3));
  else if (m === 'flat') R(ctx, cx - U(7), my, U(14), U(3), K);
  else if (m === 'grin' || m === 'open' || m === 'O') {
    const pts = m === 'O' ? arc(cx, my + U(2), U(7), U(9), 0, PI * 2, 16) : [[cx - U(13), my - U(4)], [cx + U(13), my - U(4)], ...arc(cx, my - U(4), U(13), U(12), 0, PI, 10)];
    const big = pts.map(([x, y]) => [x + Math.sign(x - cx) * 2, y + (y > my ? 2 : -2)]);
    poly(ctx, big, K);
    poly(ctx, pts, pal.M);
    if (m === 'grin') R(ctx, cx - U(11), my - U(4), U(22), U(4), pal.W);
    disc(ctx, cx, my + U(m === 'O' ? 6 : 5), U(5), pal.N);
  } else if (m === 'wavy') {
    const pts = [];
    for (let i = 0; i <= 8; i++) pts.push([cx - U(12) + i * U(3), my + (i % 2 ? -U(2) : U(2))]);
    sq(ctx, pts, K, U(3));
  } else if (m === 'teeth') {
    R(ctx, cx - U(14), my - U(5), U(28), U(11), K);
    R(ctx, cx - U(12), my - U(3), U(24), U(7), pal.W);
    for (let i = -2; i <= 2; i++) R(ctx, cx + i * U(5), my - U(3), 1, U(7), P.silver);
  }
  if (o.tears) {
    const ty = (floor(o.tears * 10) % 8) * U(2);
    for (const sd of [-1, 1]) {
      R(ctx, cx + sd * ex - U(2), ey + U(10) + ty, U(4), U(6), P.cyan);
      R(ctx, cx + sd * ex - U(1), ey + U(10) + ty, U(1) || 1, U(2), P.white);
    }
  }
  // hair on top
  const hh = o.hair || 'short';
  if (hh === 'short' || hh === 'bob' || hh === 'long' || hh === 'spiky') {
    const top = [];
    for (let i = 0; i <= 14; i++) {
      const a = PI + (i / 14) * PI;
      top.push([cx + Math.cos(a) * (rx + U(3)), cy - U(2) + sin(a) * (ry + U(5))]);
    }
    const fringe = hh === 'spiky'
      ? [[cx + rx + U(3), cy - U(4)], [cx + U(26), cy - U(14)], [cx + U(18), cy - U(8)], [cx + U(10), cy - U(18)], [cx, cy - U(10)], [cx - U(10), cy - U(18)], [cx - U(18), cy - U(8)], [cx - U(26), cy - U(14)], [cx - rx - U(3), cy - U(4)]]
      : [[cx + rx + U(3), cy + U(2)], [cx + U(30), cy - U(14)], [cx + U(10), cy - U(18)], [cx - U(6), cy - U(13)], [cx - U(22), cy - U(20)], [cx - rx - U(3), cy + U(2)]];
    const shape = [...top, ...fringe];
    poly(ctx, shape.map(([x, y]) => [x + Math.sign(x - cx) * 2, y - 2]), K);
    poly(ctx, shape, pal.H);
    sq(ctx, arc(cx - U(6), cy - U(28), U(16), U(10), PI * 1.15, PI * 1.55), pal.h, U(3));
    if (hh === 'spiky') {
      for (let i = -2; i <= 2; i++) {
        const sx = cx + i * U(14);
        poly(ctx, [[sx - U(8), cy - ry + U(4)], [sx + U(2), cy - ry - U(14)], [sx + U(8), cy - ry + U(4)]], K);
        poly(ctx, [[sx - U(6), cy - ry + U(4)], [sx + U(2), cy - ry - U(11)], [sx + U(6), cy - ry + U(4)]], pal.H);
      }
    }
  } else if (hh === 'bun') {
    disc(ctx, cx, cy - ry - U(6), U(12) + 2, K);
    disc(ctx, cx, cy - ry - U(6), U(12), pal.H);
    const cap = arc(cx, cy - U(4), rx + U(3), ry + U(2), PI, PI * 2, 14);
    poly(ctx, [...cap, [cx + rx, cy - U(6)], [cx, cy - U(20)], [cx - rx, cy - U(6)]], pal.H);
  } else if (hh === 'towel') {
    const cap = arc(cx, cy - U(6), rx + U(6), ry + U(10), PI, PI * 2, 14);
    poly(ctx, [...cap.map(([x, y]) => [x, y - 2]), [cx + rx + U(6), cy - U(8)], [cx - rx - U(6), cy - U(8)]], K);
    poly(ctx, [...cap, [cx + rx + U(5), cy - U(10)], [cx - rx - U(5), cy - U(10)]], P.white);
    for (let i = 0; i < 4; i++) sq(ctx, arc(cx, cy - U(6), rx - U(4) - i * U(6), ry - i * U(5), PI * 1.15, PI * 1.6), P.silver, 2);
  } else if (hh === 'puff') {
    for (const [dx, dy, rr] of [[-26, -18, 18], [26, -18, 18], [-12, -34, 20], [12, -34, 20], [0, -40, 18], [-36, 0, 12], [36, 0, 12]]) disc(ctx, cx + U(dx), cy + U(dy), U(rr) + 2, K);
    for (const [dx, dy, rr] of [[-26, -18, 18], [26, -18, 18], [-12, -34, 20], [12, -34, 20], [0, -40, 18], [-36, 0, 12], [36, 0, 12]]) disc(ctx, cx + U(dx), cy + U(dy), U(rr), pal.H);
  } else if (hh === 'bald') {
    for (const sd of [-1, 1]) {
      oval(ctx, cx + sd * (rx - U(4)), cy - U(6), U(6), U(12), pal.H);
    }
    R(ctx, cx - U(14), cy - ry + U(8), U(8), U(4), A(P.white, 0.5));
  }
  if (o.sweat) {
    const sy = (floor(o.sweat * 8) % 6) * U(2);
    disc(ctx, cx + rx - U(4), cy - U(16) + sy, U(4), P.blue);
    R(ctx, cx + rx - U(5), cy - U(24) + sy, U(2), U(6), P.blue);
    R(ctx, cx + rx - U(6), cy - U(18) + sy, U(2), U(2), P.white);
  }
}

// ---------------------------------------------------------------------------
// Jingles: helpers to write full-length tunes so the brand sting lands on the
// end slate (the strings stay in the documented note format).

/** Repeat a phrase n times. */
export const rep = (s, n) => Array.from({ length: n }, () => s).join(' ');
/** Join phrases into one tune string. */
export const tune = (...parts) => parts.filter(Boolean).join(' ');
