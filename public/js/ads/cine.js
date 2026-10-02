// CINE — shared toolkit for the ads-3 commercials (SafeSector, ScreechNet,
// Corners, Serene): grown-up parody spots shot like real commercials.
//   - a crisp scanline rasteriser (no anti-aliasing) with per-span form
//     shading, so shapes read as lit volumes without outlines;
//   - baked light: per-pixel "shaders" quantised to palette ramps with a 4x4
//     Bayer between adjacent steps (art direction: dither light falloff only);
//   - a shot sequencer with eased cuts, alpha fades, dips and dithered dissolves;
//   - a thin display typeface (sans + an automatic high-contrast "didone")
//     for wordmarks, tracked body type, the end slate and the small print;
//   - a pose-able adult figure (bust and full body, ~6.5 heads tall) with a
//     calm face: small eyes, brows, a quiet mouth that opens 1-2 px at most.
//   - jank-free baking: resumable (generator) bakes prewarmed in idle-time
//     slices, so a cut never waits for its set to be painted.
// Owner: ads-3. Importable in Node (no DOM touched at import time). Nothing
// here allocates canvases, gradients or ImageData per frame: static art is
// baked once into cached canvases and polygons use fixed scratch buffers.
import { P } from '../palette.js';
import { drawText, measureText } from '../font.js';

export { P, drawText, measureText };
export const W = 384;
export const H = 216;
const { round, floor, ceil, min, max, sqrt, sin, cos, abs, PI } = Math;

// ---------------------------------------------------------------- timing

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, p) => a + (b - a) * p;
/** 0..1 progress of v through [a, b]. */
export const prog = (v, a, b) => clamp((v - a) / (b - a || 1));
export const easeIn = (x) => clamp(x) ** 2;
export const easeOut = (x) => 1 - (1 - clamp(x)) ** 2;
export const easeInOut = (x) => {
  x = clamp(x);
  return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
};
export const smooth = (x) => {
  x = clamp(x);
  return x * x * (3 - 2 * x);
};
/** Slow, cinematic: long gentle start and a long settle (quintic smootherstep). */
export const glide = (x) => {
  x = clamp(x);
  return x * x * x * (x * (x * 6 - 15) + 10);
};
export const EASE = { lin: (x) => clamp(x), in: easeIn, out: easeOut, inOut: easeInOut, smooth, glide };

/** Keyframes [[t, v, ease?], ...]; the ease (name or fn) shapes the segment arriving at that key. */
export function track(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (t < k[0]) {
      const a = keys[i - 1];
      const e = typeof k[2] === 'function' ? k[2] : EASE[k[2] || 'inOut'];
      return a[1] + (k[1] - a[1]) * e((t - a[0]) / (k[0] - a[0]));
    }
  }
  return keys[keys.length - 1][1];
}

/** 0 -> 1 -> 0 over [a, b] with eased edges of length `edge`. */
export const window01 = (t, a, b, edge = 0.3) => min(smooth((t - a) / edge), smooth((b - t) / edge));

/** Deterministic hash noise in [0, 1) for integer-ish inputs. */
export function hash(n) {
  const s = sin(n * 127.1 + 311.7) * 43758.5453;
  return s - floor(s);
}

/** Natural blinks: ~every 3-5 s, 0.14 s long; returns lid closure 0..1. */
export function blinkAt(t, seed = 1) {
  const period = 3.1 + hash(seed) * 1.6;
  const k = floor((t + seed * 0.7) / period);
  const start = k * period + hash(k + seed * 13) * 1.2 - seed * 0.7;
  const d = t - start;
  if (d < 0 || d > 0.16) return 0;
  return sin((d / 0.16) * PI);
}

/** Calm speech mouth 0..1 from time while `on` (no gaping: callers draw at most 2 px). */
export function talkAt(t, on) {
  if (!on) return 0;
  const v = 0.5 + 0.32 * sin(t * 13.1) + 0.22 * sin(t * 7.3 + 1.1) - 0.18 * sin(t * 3.1);
  return clamp(v);
}

// ---------------------------------------------------------------- colour

const RGB = new Map();
export function rgb(hex) {
  let v = RGB.get(hex);
  if (!v) {
    const n = parseInt(hex.slice(1, 7), 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    RGB.set(hex, v);
  }
  return v;
}
const hx = (n) => clamp(round(n), 0, 255).toString(16).padStart(2, '0');
// Memo: a -> b -> p -> result, so a mix() repeated every frame is three Map
// lookups on existing keys (no string building, no parsing, no allocation).
const MIX = new Map();
/** Mix two hex colours; memoised, safe to call in per-frame code. */
export function mix(a, b, p) {
  let mb = MIX.get(a);
  if (!mb) MIX.set(a, (mb = new Map()));
  let mp = mb.get(b);
  if (!mp) mb.set(b, (mp = new Map()));
  let out = mp.get(p);
  if (out === undefined) {
    const A = rgb(a);
    const B = rgb(b);
    out = `#${hx(lerp(A[0], B[0], p))}${hx(lerp(A[1], B[1], p))}${hx(lerp(A[2], B[2], p))}`;
    mp.set(p, out);
  }
  return out;
}
/** n colours evenly through the given stops. */
export function ramp(stops, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const u = (i / (n - 1)) * (stops.length - 1);
    const k = min(stops.length - 2, floor(u));
    out.push(mix(stops[k], stops[k + 1], u - k));
  }
  return out;
}

// ---------------------------------------------------------------- canvases

export function canvas(w, h) {
  let cv;
  if (typeof document !== 'undefined') {
    cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
  } else cv = new OffscreenCanvas(w, h);
  const c = cv.getContext('2d');
  c.imageSmoothingEnabled = false;
  return cv;
}

const BAKED = new Map();
const JOBS = new Map(); // key -> { key, cv, it, ms } bakes started but not finished
let deferring = false;
/** How long each bake took (ms of work), for the lab's performance checks. */
export const BAKE_MS = new Map();

function finish(job) {
  BAKED.set(job.key, job.cv);
  BAKE_MS.set(job.key, job.ms);
  JOBS.delete(job.key);
}

/**
 * Static art painted once into a cached w x h canvas: paint(ctx, canvas).
 * `paint` may be a generator function that yields every few rows of heavy
 * per-pixel work: then prewarm() can bake it in small idle-time slices. When a
 * frame needs art that is not finished yet, the rest is painted at once.
 */
export function bake(key, w, h, paint) {
  const cv = BAKED.get(key);
  if (cv) return cv;
  let job = JOBS.get(key);
  if (!job) {
    const t0 = performance.now();
    const c = canvas(w, h);
    const r = paint(c.getContext('2d'), c);
    job = { key, cv: c, it: r && typeof r.next === 'function' ? r : null, ms: performance.now() - t0 };
    if (!job.it) {
      finish(job);
      return c;
    }
    JOBS.set(key, job);
  }
  if (deferring) return job.cv; // prewarm only registers the job (never drawn unfinished)
  const t0 = performance.now();
  while (!job.it.next().done);
  job.ms += performance.now() - t0;
  finish(job);
  return job.cv;
}

/**
 * Memoise an art getter: `const SET = lazy(() => bake(...))` returns the same
 * finished canvas on every call without re-creating the paint closure (never
 * caches an unfinished canvas handed out while prewarming).
 */
export function lazy(fn) {
  let v = null;
  return () => {
    if (v) return v;
    const r = fn();
    if (!deferring) v = r;
    return r;
  };
}

/** lazy() for parameterised getters: `const art = lazyBy((size) => bake(...))`. */
export function lazyBy(fn) {
  const memo = new Map();
  return (k) => {
    const v = memo.get(k);
    if (v) return v;
    const r = fn(k);
    if (!deferring) memo.set(k, r);
    return r;
  };
}

const WARM = new WeakSet();
/**
 * Bakes everything in `list` (thunks that call bake getters) in idle time, in
 * slices of ~4 ms, so no frame ever waits for a whole bake (browser only;
 * a no-op in Node). Safe to call every frame: starts once per list.
 */
export function prewarm(list, delayMs = 0) {
  if (WARM.has(list) || typeof window === 'undefined') return;
  WARM.add(list);
  let i = 0;
  const idle = typeof requestIdleCallback === 'function' ? (fn) => requestIdleCallback(fn, { timeout: 250 }) : (fn) => setTimeout(fn, 16);
  const tick = () => {
    const until = performance.now() + 4;
    do {
      let job = null;
      for (const j of JOBS.values()) {
        job = j;
        break;
      }
      if (job) {
        const t0 = performance.now();
        const done = job.it.next().done;
        job.ms += performance.now() - t0;
        if (done) finish(job);
      } else if (i < list.length) {
        deferring = true;
        try {
          list[i++]();
        } catch {
          /* a failed bake is retried (synchronously) when a frame needs it */
        } finally {
          deferring = false;
        }
      } else return;
    } while (performance.now() < until);
    idle(tick);
  };
  setTimeout(() => idle(tick), delayMs);
}

export const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Threshold in (0, 1) of the 4x4 Bayer matrix at pixel (x, y). */
export const bayer = (x, y) => (BAYER[((y & 3) << 2) | (x & 3)] + 0.5) / 16;

/**
 * Per-pixel painter (bake time only), as a generator that yields every few
 * rows: fn(x, y) returns a position 0..1 along `colors` (a ramp) or -1 for
 * "leave as is" (values just below 0 are clamped to 0, so a full-frame bake is
 * always opaque); between two ramp steps the 4x4 Bayer picks one.
 * Use `yield* shadeSteps(...)` inside generator paints, shadeInto() elsewhere.
 */
export function* shadeSteps(ctx, x0, y0, w, h, colors, fn) {
  // painted into a scratch canvas and composited (no getImageData readback)
  const tmp = canvas(w, h);
  const tc = tmp.getContext('2d');
  const img = tc.createImageData(w, h);
  const d = img.data;
  const cs = colors.map(rgb);
  const n = cs.length - 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = fn(x + x0, y + y0);
      // -1 (anything <= -0.5, or NaN) means "leave as is"; a shader that dips a
      // hair below 0 by accident is clamped instead, so bakes never leave holes
      if (!(v > -0.5)) continue;
      const u = clamp(v) * n;
      let i = floor(u);
      if (i < n && u - i > bayer(x + x0, y + y0)) i++;
      const c = cs[min(i, n)];
      const o = (y * w + x) * 4;
      d[o] = c[0];
      d[o + 1] = c[1];
      d[o + 2] = c[2];
      d[o + 3] = 255;
    }
    if ((y & 3) === 3) yield;
  }
  tc.putImageData(img, 0, 0);
  ctx.drawImage(tmp, x0, y0);
}

/** Synchronous shadeSteps (for plain, non-generator paints). */
export function shadeInto(ctx, x0, y0, w, h, colors, fn) {
  const it = shadeSteps(ctx, x0, y0, w, h, colors, fn);
  while (!it.next().done);
}

/**
 * Dithered overlay: paints colour position v(x, y) from `colors` only where
 * the 4x4 Bayer threshold is below density(x, y) (0..1), so a reflection or
 * glow fades out with an ordered-dither edge instead of a hard one.
 */
export function* ditherSteps(ctx, x0, y0, w, h, colors, density, v = () => 0.5) {
  yield* shadeSteps(ctx, x0, y0, w, h, colors, (x, y) => (density(x, y) > bayer(x, y) ? v(x, y) : -1));
}
export function ditherInto(ctx, x0, y0, w, h, colors, density, v = () => 0.5) {
  shadeInto(ctx, x0, y0, w, h, colors, (x, y) => (density(x, y) > bayer(x, y) ? v(x, y) : -1));
}

/** Cached transparent canvas painted by a shader (resumable, see shadeSteps). */
export function shader(key, w, h, colors, fn) {
  return bake(key, w, h, function* paint(c) {
    yield* shadeSteps(c, 0, 0, w, h, colors, fn);
  });
}

/**
 * A soft light pool: concentric dithered alpha steps of one colour (baked).
 * Draw it with ctx.globalCompositeOperation 'lighter'/'screen' or plain alpha.
 */
export function pool(key, rx, ry, color, steps = 5, peak = 0.5) {
  const w = ceil(rx * 2);
  const h = ceil(ry * 2);
  return bake(key, w, h, function* paint(c) {
    const img = c.createImageData(w, h);
    const d = img.data;
    const [r, g, b] = rgb(color);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = (x + 0.5 - rx) / rx;
        const dy = (y + 0.5 - ry) / ry;
        const q = 1 - sqrt(dx * dx + dy * dy);
        if (q <= 0) continue;
        const u = q * steps;
        let i = floor(u);
        if (u - i > bayer(x, y)) i++;
        if (i <= 0) continue;
        const o = (y * w + x) * 4;
        d[o] = r;
        d[o + 1] = g;
        d[o + 2] = b;
        d[o + 3] = round((min(i, steps) / steps) * peak * 255);
      }
      if ((y & 7) === 7) yield;
    }
    c.putImageData(img, 0, 0);
  });
}

// ---------------------------------------------------------------- raster

export function rect(ctx, x, y, w, h, c) {
  const x0 = round(x);
  const y0 = round(y);
  ctx.fillStyle = c;
  ctx.fillRect(x0, y0, round(x + w) - x0, round(y + h) - y0);
}

/** 1 px line (Bresenham), drawn as runs. */
export function line(ctx, x0, y0, x1, y1, c) {
  x0 = round(x0);
  y0 = round(y0);
  x1 = round(x1);
  y1 = round(y1);
  ctx.fillStyle = c;
  const dx = abs(x1 - x0);
  const dy = -abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let guard = 0; guard < 2000; guard++) {
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

// Scratch buffers: one polygon path and the spans of the shape being drawn.
const PX = new Float64Array(512);
const PY = new Float64Array(512);
let PN = 0;
const XS = new Float64Array(64);
const SL = new Int16Array(2048);
const SR = new Int16Array(2048);
const SY = new Int16Array(2048);
let SN = 0;

/** Start a polygon in the scratch path; add points with pt(), draw with fill(). */
export function begin() {
  PN = 0;
}
export function pt(x, y) {
  if (PN < 512) {
    PX[PN] = x;
    PY[PN] = y;
    PN++;
  }
}
/** Elliptical arc of points (angles in radians, screen y down). */
export function arc(cx, cy, rx, ry, a0, a1, n = 8) {
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pt(cx + cos(a) * rx, cy + sin(a) * ry);
  }
}

function collect() {
  SN = 0;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < PN; i++) {
    if (PY[i] < minY) minY = PY[i];
    if (PY[i] > maxY) maxY = PY[i];
  }
  const y0 = max(-1, ceil(minY - 0.5));
  const y1 = min(H + 1, floor(maxY - 0.5));
  for (let y = y0; y <= y1; y++) {
    const sy = y + 0.5;
    let k = 0;
    for (let i = 0, j = PN - 1; i < PN; j = i++) {
      const ya = PY[i];
      const yb = PY[j];
      if (ya <= sy !== yb <= sy && k < 64) XS[k++] = PX[i] + ((sy - ya) * (PX[j] - PX[i])) / (yb - ya);
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
    for (let a = 0; a + 1 < k; a += 2) {
      const xl = round(XS[a]);
      const xr = round(XS[a + 1]);
      if (xr > xl && SN < 2048) {
        SL[SN] = xl;
        SR[SN] = xr;
        SY[SN] = y;
        SN++;
      }
    }
  }
}

/**
 * Paint the collected spans. `sh` (optional, build it once at module level):
 *   { d: dark colour, f: fraction of the span width (0..1), m: min px,
 *     dd, df, dm: an optional darker core band at the very edge (soft two-step shadow),
 *     side: 1 dark on the right (key light from the left) | -1,
 *     l: lit edge colour, lf, lm (same on the lit side), r: rim colour (1 px on the dark edge) }
 */
function paint(ctx, c, sh) {
  ctx.fillStyle = c;
  for (let i = 0; i < SN; i++) ctx.fillRect(SL[i], SY[i], SR[i] - SL[i], 1);
  if (!sh) return;
  const side = sh.side ?? 1;
  if (sh.d) {
    ctx.fillStyle = sh.d;
    const f = sh.f ?? 0.3;
    const m = sh.m ?? 1;
    for (let i = 0; i < SN; i++) {
      const w = SR[i] - SL[i];
      const k = min(w, max(m, round(w * f)));
      ctx.fillRect(side > 0 ? SR[i] - k : SL[i], SY[i], k, 1);
    }
  }
  if (sh.dd) {
    ctx.fillStyle = sh.dd;
    const f = sh.df ?? 0.12;
    const m = sh.dm ?? 1;
    for (let i = 0; i < SN; i++) {
      const w = SR[i] - SL[i];
      const k = min(w, max(m, round(w * f)));
      ctx.fillRect(side > 0 ? SR[i] - k : SL[i], SY[i], k, 1);
    }
  }
  if (sh.l) {
    ctx.fillStyle = sh.l;
    const f = sh.lf ?? 0.2;
    const m = sh.lm ?? 1;
    for (let i = 0; i < SN; i++) {
      const w = SR[i] - SL[i];
      const k = min(w, max(m, round(w * f)));
      ctx.fillRect(side > 0 ? SL[i] : SR[i] - k, SY[i], k, 1);
    }
  }
  if (sh.r) {
    ctx.fillStyle = sh.r;
    for (let i = 0; i < SN; i++) ctx.fillRect(side > 0 ? SR[i] - 1 : SL[i], SY[i], 1, 1);
  }
}

/** Fill the scratch polygon (even-odd), optionally form-shaded. */
export function fill(ctx, c, sh = null) {
  if (PN < 3) return;
  collect();
  paint(ctx, c, sh);
}

/** Convenience: polygon from a flat [x0, y0, x1, y1, ...] list (use for static shapes). */
export function poly(ctx, pts, c, sh = null, dx = 0, dy = 0) {
  begin();
  for (let i = 0; i + 1 < pts.length; i += 2) pt(pts[i] + dx, pts[i + 1] + dy);
  fill(ctx, c, sh);
}

/** Crisp filled ellipse, optionally form-shaded. */
export function ellipse(ctx, cx, cy, rx, ry, c, sh = null) {
  SN = 0;
  if (rx <= 0 || ry <= 0) return;
  const y0 = ceil(cy - ry - 0.5);
  const y1 = floor(cy + ry - 0.5);
  for (let y = y0; y <= y1 && SN < 2048; y++) {
    const dy = (y + 0.5 - cy) / ry;
    const q = 1 - dy * dy;
    if (q <= 0) continue;
    const hw = rx * sqrt(q);
    const xl = round(cx - hw);
    const xr = round(cx + hw);
    if (xr > xl) {
      SL[SN] = xl;
      SR[SN] = xr;
      SY[SN] = y;
      SN++;
    }
  }
  paint(ctx, c, sh);
}

/** A limb / rod from (x0, y0) to (x1, y1) with end radii r0, r1 (rounded caps). */
export function capsule(ctx, x0, y0, x1, y1, r0, r1, c, sh = null) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = sqrt(dx * dx + dy * dy) || 1;
  const a = Math.atan2(dy, dx);
  begin();
  arc(x1, y1, r1, r1, a - PI / 2, a + PI / 2, r1 > 2 ? 6 : 3);
  arc(x0, y0, r0, r0, a + PI / 2, a + (PI * 3) / 2, r0 > 2 ? 6 : 3);
  if (len > 0) fill(ctx, c, sh);
}

// ---------------------------------------------------------------- sequencer

let BUF = null;
function buffer() {
  if (!BUF) {
    const cv = canvas(W, H);
    BUF = { cv, c: cv.getContext('2d') };
  }
  BUF.c.setTransform(1, 0, 0, 1, 0, 0);
  BUF.c.globalAlpha = 1;
  BUF.c.globalCompositeOperation = 'source-over';
  // opaque black first: a hole in the outgoing shot must never show what the
  // last transition (possibly of another ad) left in this buffer
  BUF.c.fillStyle = '#000000';
  BUF.c.fillRect(0, 0, W, H);
  return BUF;
}

// 17 cached 4x4 dither masks (level k: k of 16 pixels opaque).
const MASKS = [];
function mask(ctx, level) {
  let m = MASKS[level];
  if (!m) {
    const cv = canvas(4, 4);
    const c = cv.getContext('2d');
    c.fillStyle = '#000';
    for (let i = 0; i < 16; i++) if (BAYER[i] < level) c.fillRect(i & 3, i >> 2, 1, 1);
    m = ctx.createPattern(cv, 'repeat');
    MASKS[level] = m;
  }
  return m;
}

/** Shot defaults: a dissolve lasts 0.6 s, a dip 0.8 s, a fade 0.5 s. */
const TD = { dissolve: 0.6, dip: 0.8, fade: 0.5, black: 0.5 };

/**
 * Plays a list of shots [{ at, draw(ctx, lt, info, t), tr, td }] at ad time t.
 * tr = transition INTO the shot: 'cut' (default) | 'fade' (alpha cross-fade) |
 * 'dissolve' (4x4 ordered-dither cross-fade, palette-pure) | 'dip' (through
 * black) | 'black' (in from black). The last shot holds while the VO overruns.
 */
export function film(ctx, t, info, shots) {
  // the studio never clears before an ad draws: start every frame opaque so
  // no stray pixel of the previous frame (or programme) can ever show through
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, W, H);
  let i = 0;
  while (i + 1 < shots.length && t >= shots[i + 1].at) i++;
  const s = shots[i];
  const lt = t - s.at;
  const kind = s.tr || 'cut';
  const td = s.td ?? TD[kind] ?? 0.5;
  if (kind === 'cut' || lt >= td || (i === 0 && kind !== 'black')) {
    s.draw(ctx, lt, info, t);
    return;
  }
  const p = lt / td;
  if (kind === 'black') {
    s.draw(ctx, lt, info, t);
    ctx.globalAlpha = 1 - smooth(p);
    rect(ctx, 0, 0, W, H, P.black);
    ctx.globalAlpha = 1;
    return;
  }
  const prev = shots[i - 1];
  const plt = t - prev.at;
  if (kind === 'dip') {
    if (p < 0.5) prev.draw(ctx, plt, info, t);
    else s.draw(ctx, lt, info, t);
    ctx.globalAlpha = 1 - abs(p - 0.5) * 2;
    rect(ctx, 0, 0, W, H, '#000000');
    ctx.globalAlpha = 1;
    return;
  }
  s.draw(ctx, lt, info, t);
  const b = buffer();
  prev.draw(b.c, plt, info, t);
  if (kind === 'fade') {
    ctx.globalAlpha = 1 - smooth(p);
    ctx.drawImage(b.cv, 0, 0);
    ctx.globalAlpha = 1;
  } else {
    // keep 16 - level of 16 pixels of the old frame
    const level = clamp(round(smooth(p) * 16), 0, 16);
    if (level < 16) {
      b.c.globalCompositeOperation = 'destination-out';
      b.c.fillStyle = mask(b.c, level);
      b.c.fillRect(0, 0, W, H);
      b.c.globalCompositeOperation = 'source-over';
      ctx.drawImage(b.cv, 0, 0);
    }
  }
}

/** Integer camera offset for everything fn draws (pixel art pans in whole pixels). */
export function cam(ctx, x, y, fn) {
  ctx.save();
  ctx.translate(-round(x), -round(y));
  fn(ctx);
  ctx.restore();
}

/** Draw a baked layer with parallax: offset = camera * depth, rounded. */
export function layer(ctx, cv, x, y, camX = 0, camY = 0, depth = 1) {
  ctx.drawImage(cv, round(x - camX * depth), round(y - camY * depth));
}

/** Cinema letterbox bars of height h (2.39:1 at h = 27). */
export function letterbox(ctx, h = 24, c = '#000000') {
  rect(ctx, 0, 0, W, h, c);
  rect(ctx, 0, H - h, W, h, c);
}

const VIG_KEYS = new Map(); // amount -> bake key (built once, not per frame)
/** The vignette art for `amount` (baked once, resumable). */
export const vignetteArt = lazyBy((amount = 0.55) => {
  let key = VIG_KEYS.get(amount);
  if (!key) VIG_KEYS.set(amount, (key = `vig${amount}`));
  return bake(key, W, H, function* paint(c) {
    const img = c.createImageData(W, H);
    const d = img.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = (x - W / 2) / (W * 0.62);
        const dy = (y - H / 2) / (H * 0.7);
        const q = clamp((dx * dx + dy * dy - 0.35) / 0.9);
        const u = q * 4;
        let k = floor(u);
        if (u - k > bayer(x, y)) k++;
        if (k <= 0) continue;
        d[(y * W + x) * 4 + 3] = round((k / 4) * amount * 255);
      }
      if ((y & 7) === 7) yield;
    }
    c.putImageData(img, 0, 0);
  });
});
/** Vignette (baked once per amount, dithered): darkens the corners by up to `amount`. */
export function vignette(ctx, amount = 0.55) {
  ctx.drawImage(vignetteArt(amount), 0, 0);
}

// ---------------------------------------------------------------- type

// Thin display face, cap height 9, 1 px strokes. The "didone" style is derived
// automatically: vertical stems and "\" diagonals doubled, foot/head serifs.
const THIN_SRC = {
  A: ['...#...', '...#...', '..#.#..', '..#.#..', '.#...#.', '.#...#.', '.#####.', '#.....#', '#.....#'],
  B: ['#####.', '#....#', '#....#', '#...#.', '#####.', '#....#', '#....#', '#....#', '#####.'],
  C: ['..###.', '.#...#', '#.....', '#.....', '#.....', '#.....', '#.....', '.#...#', '..###.'],
  D: ['####..', '#...#.', '#....#', '#....#', '#....#', '#....#', '#....#', '#...#.', '####..'],
  E: ['#####', '#....', '#....', '#....', '####.', '#....', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '#....', '####.', '#....', '#....', '#....', '#....'],
  G: ['..###.', '.#...#', '#.....', '#.....', '#..###', '#....#', '#....#', '.#...#', '..###.'],
  H: ['#....#', '#....#', '#....#', '#....#', '######', '#....#', '#....#', '#....#', '#....#'],
  I: ['#', '#', '#', '#', '#', '#', '#', '#', '#'],
  J: ['...#', '...#', '...#', '...#', '...#', '...#', '...#', '#..#', '.##.'],
  K: ['#...#.', '#..#..', '#.#...', '##....', '##....', '#.#...', '#..#..', '#...#.', '#....#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#.....#', '##...##', '#.#.#.#', '#.#.#.#', '#..#..#', '#..#..#', '#.....#', '#.....#', '#.....#'],
  N: ['#....#', '##...#', '##...#', '#.#..#', '#.#..#', '#..#.#', '#...##', '#...##', '#....#'],
  O: ['..###..', '.#...#.', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '.#...#.', '..###..'],
  P: ['#####.', '#....#', '#....#', '#....#', '#####.', '#.....', '#.....', '#.....', '#.....'],
  Q: ['..###..', '.#...#.', '#.....#', '#.....#', '#.....#', '#.....#', '#...#.#', '.#...#.', '..###.#'],
  R: ['#####.', '#....#', '#....#', '#....#', '#####.', '#..#..', '#...#.', '#...#.', '#....#'],
  S: ['.####.', '#....#', '#.....', '.#....', '..##..', '....#.', '.....#', '#....#', '.####.'],
  T: ['#######', '...#...', '...#...', '...#...', '...#...', '...#...', '...#...', '...#...', '...#...'],
  U: ['#....#', '#....#', '#....#', '#....#', '#....#', '#....#', '#....#', '#....#', '.####.'],
  V: ['#.....#', '#.....#', '.#...#.', '.#...#.', '.#...#.', '..#.#..', '..#.#..', '...#...', '...#...'],
  W: ['#...#...#', '#...#...#', '#...#...#', '.#.#.#.#.', '.#.#.#.#.', '.#.#.#.#.', '..#...#..', '..#...#..', '..#...#..'],
  X: ['#.....#', '.#...#.', '.#...#.', '..#.#..', '...#...', '..#.#..', '.#...#.', '.#...#.', '#.....#'],
  Y: ['#.....#', '.#...#.', '.#...#.', '..#.#..', '...#...', '...#...', '...#...', '...#...', '...#...'],
  Z: ['######', '.....#', '....#.', '....#.', '...#..', '..#...', '.#....', '#.....', '######'],
  0: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  1: ['.#', '##', '.#', '.#', '.#', '.#', '.#', '.#', '.#'],
  2: ['.###.', '#...#', '....#', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  3: ['.###.', '#...#', '....#', '....#', '..##.', '....#', '....#', '#...#', '.###.'],
  4: ['...#.', '..##.', '.#.#.', '.#.#.', '#..#.', '#####', '...#.', '...#.', '...#.'],
  5: ['#####', '#....', '#....', '####.', '....#', '....#', '....#', '#...#', '.###.'],
  6: ['.###.', '#....', '#....', '####.', '#...#', '#...#', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '...#.', '..#..', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '#...#', '.###.', '#...#', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '#...#', '.####', '....#', '....#', '....#', '.###.'],
  '.': ['.', '.', '.', '.', '.', '.', '.', '.', '#'],
  ',': ['.', '.', '.', '.', '.', '.', '.', '#', '#'],
  "'": ['#', '#', '.', '.', '.', '.', '.', '.', '.'],
  '-': ['....', '....', '....', '....', '####', '....', '....', '....', '....'],
  '·': ['.', '.', '.', '.', '#', '.', '.', '.', '.'],
  ':': ['.', '.', '#', '.', '.', '.', '.', '#', '.'],
  '/': ['....#', '...#.', '...#.', '..#..', '..#..', '..#..', '.#...', '.#...', '#....'],
  '&': ['.##...', '#..#..', '#..#..', '.##...', '.#..#.', '#.#.#.', '#..#..', '#..##.', '.##..#'],
  '°': ['.#.', '#.#', '.#.', '...', '...', '...', '...', '...', '...'],
};
const THIN_H = 9;
const SPACE_W = 4;

// Didot-like letters whose verticals stay hairlines (only the diagonal is heavy).
const HAIR_STEMS = new Set(['N', 'M', 'W', 'Z']);
function didone(rows, ch = '') {
  const h = rows.length;
  const w = rows[0].length;
  const g = [];
  for (let y = 0; y < h; y++) g.push(Array.from({ length: w + 3 }, (_, x) => x > 0 && x <= w && rows[y][x - 1] === '#'));
  const on = (x, y) => y >= 0 && y < h && x >= 0 && x < w + 3 && g[y][x];
  const out = g.map((r) => r.slice());
  for (let x = 1; x <= w; x++) {
    let y = 0;
    while (y < h) {
      if (!on(x, y)) {
        y++;
        continue;
      }
      let e = y;
      while (on(x, e + 1)) e++;
      if (e - y + 1 >= 4 && !HAIR_STEMS.has(ch)) for (let k = y; k <= e; k++) out[k][x + 1] = true;
      y = e + 1;
    }
  }
  // "\" diagonals of 3+ steps get a second pixel to the right
  for (let y = 0; y < h; y++) {
    for (let x = 1; x <= w; x++) {
      if (!on(x, y)) continue;
      const chain = (on(x - 1, y - 1) && on(x + 1, y + 1)) || (on(x + 1, y + 1) && on(x + 2, y + 2)) || (on(x - 1, y - 1) && on(x - 2, y - 2));
      const vertical = on(x, y - 1) || on(x, y + 1);
      if (chain && !vertical) out[y][x + 1] = true;
    }
  }
  // serifs where a doubled stem meets the cap line or the baseline
  for (const y of [0, h - 1]) {
    const inner = y === 0 ? 1 : h - 2;
    for (let x = 1; x <= w + 1; x++) {
      if (out[y][x] && out[y][x + 1] && out[inner][x] && out[inner][x + 1]) {
        if (!out[y][x - 1] && x - 1 >= 0) out[y][x - 1] = 'serif';
        if (x + 2 < w + 3 && !out[y][x + 2]) out[y][x + 2] = 'serif';
      }
    }
  }
  let x0 = w + 3;
  let x1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w + 3; x++) {
      if (out[y][x]) {
        x0 = min(x0, x);
        x1 = max(x1, x);
      }
    }
  }
  return out.map((r) => r.slice(x0, x1 + 1).map((v) => (v ? '#' : '.')).join(''));
}

const GLYPHS = { sans: new Map(), didone: new Map() };
function glyphRows(ch, style) {
  const set = GLYPHS[style] || GLYPHS.sans;
  let rows = set.get(ch);
  if (rows === undefined) {
    const src = THIN_SRC[ch];
    rows = src ? (style === 'didone' ? didone(src, ch) : src) : null;
    set.set(ch, rows);
  }
  return rows;
}

const GLYPH_CV = new Map(); // style -> colour -> scale -> Map(ch -> canvas), no key strings per frame
function glyphCanvas(ch, style, color, scale) {
  let ms = GLYPH_CV.get(style);
  if (!ms) GLYPH_CV.set(style, (ms = new Map()));
  let mc = ms.get(color);
  if (!mc) ms.set(color, (mc = new Map()));
  let m = mc.get(scale);
  if (!m) mc.set(scale, (m = new Map()));
  let cv = m.get(ch);
  if (cv === undefined) {
    const rows = glyphRows(ch, style);
    if (!rows) cv = null;
    else {
      cv = canvas(rows[0].length * scale, THIN_H * scale);
      const c = cv.getContext('2d');
      c.fillStyle = color;
      rows.forEach((r, y) => {
        for (let x = 0; x < r.length; x++) if (r[x] === '#') c.fillRect(x * scale, y * scale, scale, scale);
      });
    }
    m.set(ch, cv);
  }
  return cv;
}

function glyphW(ch, style) {
  if (ch === ' ') return SPACE_W;
  const rows = glyphRows(ch, style);
  return rows ? rows[0].length : SPACE_W;
}

/** Width of a thin-face string at scale 1 with `track` px between letters. */
export function thinWidth(s, { style = 'sans', track = 1, scale = 1 } = {}) {
  let w = 0;
  for (let i = 0; i < s.length; i++) w += glyphW(s[i], style) + (i ? track : 0);
  return w * scale;
}

/**
 * Thin display type (uppercase). y is the cap top. `reveal` 0..1 draws only
 * the first part of the letters (left to right) for typed / wiped entrances.
 */
export function thin(ctx, s, x, y, { color = P.white, style = 'sans', track = 1, scale = 1, align = 'left', reveal = 1 } = {}) {
  const w = thinWidth(s, { style, track, scale });
  let cx = round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x);
  const cy = round(y);
  const n = reveal >= 1 ? s.length : floor(s.length * clamp(reveal));
  for (let i = 0; i < n; i++) {
    const ch = s[i];
    const cv = ch === ' ' ? null : glyphCanvas(ch, style, color, scale);
    if (cv) ctx.drawImage(cv, cx, cy);
    cx += (glyphW(ch, style) + track) * scale;
  }
  return w;
}

// Tracked lines are baked once into small canvases (font -> track -> colour ->
// string), so a super redrawn every frame is one drawImage and no allocation.
const TRACKED = new Map();
function nest(m, k) {
  let v = m.get(k);
  if (!v) m.set(k, (v = new Map()));
  return v;
}
function trackedArt(s, color, track, font) {
  const m = nest(nest(nest(TRACKED, font), track), color);
  let art = m.get(s);
  if (!art) {
    const fm = font === 'micro' ? { lh: 8, asc: 2 } : { lh: 11, asc: 3 };
    let w = 0;
    for (let i = 0; i < s.length; i++) w += measureText(s[i], 1, font) + (i ? track + 1 : 0);
    const cv = canvas(max(1, w + 2), fm.lh);
    const c = cv.getContext('2d');
    let cx = 0;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch !== ' ') drawText(c, ch, cx, fm.asc, { color, font });
      cx += measureText(ch, 1, font) + track + 1;
    }
    art = { cv, w, asc: fm.asc };
    m.set(s, art);
  }
  return art;
}

/** Body (5x7) or micro (3x5) text with extra letter spacing; y = cap top. */
export function tracked(ctx, s, x, y, { color = P.white, track = 1, font = 'body', align = 'left' } = {}) {
  const art = trackedArt(s, color, track, font);
  const w = art.w;
  const cx = round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x);
  ctx.drawImage(art.cv, cx, round(y) - art.asc);
  return w;
}
export function trackedWidth(s, { track = 1, font = 'body' } = {}) {
  let w = 0;
  for (let i = 0; i < s.length; i++) w += measureText(s[i], 1, font) + (i ? track + 1 : 0);
  return w;
}

/** Centred body text (font.js y is the baseline-ish cap top + ascent). */
export function text(ctx, s, x, y, { color = P.white, font = 'body', align = 'left' } = {}) {
  return drawText(ctx, s, round(x), round(y), { color, font, align });
}

/**
 * The legal line: micro type, centred, wrapped (to as many lines as it needs at
 * maxW), drawn at y (top of the block), baked once per string and colour. Fades
 * in with `a` (0..1) so it never pops. Style bible: P.fog or P.silver only.
 */
const PRINT = new Map();
export function printArt(s, color = P.fog, maxW = 344) {
  const m = nest(nest(PRINT, color), maxW);
  let art = m.get(s);
  if (!art) {
    const lines = [];
    let cur = '';
    for (const word of s.split(' ')) {
      const next = cur ? `${cur} ${word}` : word;
      if (measureText(next, 1, 'micro') > maxW && cur) {
        lines.push(cur);
        cur = word;
      } else cur = next;
    }
    if (cur) lines.push(cur);
    const cv = canvas(maxW + 8, lines.length * 7 + 2);
    const c = cv.getContext('2d');
    for (let i = 0; i < lines.length; i++) drawText(c, lines[i], (maxW + 8) / 2, 2 + i * 7, { color, font: 'micro', align: 'center' });
    art = { cv, lines: lines.length, w: maxW + 8 };
    m.set(s, art);
  }
  return art;
}
export function smallPrint(ctx, s, y, { color = P.fog, a = 1, maxW = 344, cx = W / 2 } = {}) {
  if (a <= 0) return;
  const art = printArt(s, color, maxW);
  ctx.globalAlpha = clamp(a);
  ctx.drawImage(art.cv, round(cx - art.w / 2), round(y) - 2);
  ctx.globalAlpha = 1;
}

/**
 * Supers (on-screen titles): a hairline rule that draws outward, then a line of
 * tracked text that fades up. Used for location cards and lower thirds.
 */
export function superTitle(ctx, s, x, y, lt, { color = P.silver, rule = P.steel, track = 2, font = 'micro', align = 'left', ruleW = 0, a = 1 } = {}) {
  const p = smooth(lt / 0.6);
  if (p <= 0 || a <= 0) return;
  ctx.globalAlpha = a;
  const w = ruleW || trackedWidth(s, { track, font });
  const rw = round(w * p);
  const rx = align === 'center' ? round(x - rw / 2) : align === 'right' ? round(x - rw) : round(x);
  if (rule) rect(ctx, rx, y + (font === 'micro' ? 8 : 10), rw, 1, rule);
  ctx.globalAlpha = a * smooth((lt - 0.25) / 0.5);
  tracked(ctx, s, x, y, { color, track, font, align });
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- figures

// Pre-built shading recipes (key light from camera-left: the dark side is screen right).
export function shadeOf(d, f = 0.28, m = 1, extra = null) {
  return { d, f, m, side: 1, ...(extra || {}) };
}

/**
 * Reusable pose object for bust(): create one per character at module level
 * with figure(), then set fields per frame (no allocation).
 *   x, y: centre of the head / top of the skull; hh: head height (crown to chin);
 *   turn -1..1 (features slide toward screen right when > 0), nod px, tiltX px;
 *   look -1..1 eye direction, blink 0..1, mouth 0..1, smile 0..1, brow -1..1;
 *   shoulders: half width in head heights; hair: 'bob' | 'short' | 'messy' | 'long' | 'bun';
 *   garment: 'cardigan' | 'jacket' | 'hoodie' | 'dress' | 'tee' | 'apron';
 *   glasses: frame colour or null; pal: colours (see DEFAULT_PAL).
 */
export const DEFAULT_PAL = {
  skin: P.skin,
  skinD: P.skinShade,
  skinL: mix(P.skin, P.cream, 0.45),
  lip: mix(P.skinShade, P.darkRed, 0.25),
  eye: P.black,
  white: mix(P.cream, P.skin, 0.25),
  hair: P.brown,
  hairD: P.maroon,
  hairL: mix(P.brown, P.tan, 0.5),
  top: P.navy,
  topD: P.ink,
  topL: mix(P.navy, P.steel, 0.5),
  shirt: P.cream,
  shirtD: mix(P.cream, P.fog, 0.6),
  rim: null,
};

export function figure(o = {}) {
  return {
    x: 0, y: 0, hh: 24, turn: 0, nod: 0, tiltX: 0, look: 0, blink: 0, mouth: 0, smile: 0.2, brow: 0,
    shoulders: 0.92, hair: 'short', garment: 'jacket', glasses: null, beard: false, earring: null,
    pal: { ...DEFAULT_PAL, ...(o.pal || {}) },
    armL: { a: 0.12, e: 0.2, len: 1, fore: 1, hand: 'rest' },
    armR: { a: 0.12, e: 0.2, len: 1, fore: 1, hand: 'rest' },
    ...o,
    ...(o.pal ? { pal: { ...DEFAULT_PAL, ...o.pal } } : {}),
  };
}

// Face profile: half-width of the head at u (0 crown .. 1 chin), as a fraction of the half width.
function headHalf(u) {
  if (u < 0.5) {
    const v = (0.5 - u) / 0.5;
    return sqrt(max(0, 1 - v * v * 0.92));
  }
  if (u < 0.78) return 1 - (u - 0.5) * 0.45;
  const v = (u - 0.78) / 0.22;
  return (1 - 0.28 * 0.45) * (1 - v * 0.62) - v * v * 0.08;
}

function headSpans(cx, top, hh, hw, extra = 0, u0 = 0, u1 = 1) {
  SN = 0;
  const yA = round(top + u0 * hh);
  const yB = round(top + u1 * hh);
  for (let y = yA; y < yB && SN < 2048; y++) {
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

const SH = new WeakMap(); // pal -> prebuilt shading recipes
function recipes(pal) {
  let r = SH.get(pal);
  if (!r) {
    const rim = pal.rim ? { r: pal.rim } : {};
    const skinM = pal.skinM || mix(pal.skin, pal.skinD, 0.5);
    const topM = pal.topM || mix(pal.top, pal.topD, 0.5);
    const hairM = pal.hairM || mix(pal.hair, pal.hairD, 0.5);
    r = {
      skin: { d: skinM, f: 0.3, m: 1, dd: pal.skinD, df: 0.13, side: 1, ...rim },
      skinSoft: { d: skinM, f: 0.25, m: 1, side: 1 },
      hair: { d: hairM, f: 0.34, m: 1, dd: pal.hairD, df: 0.14, side: 1, l: pal.hairL, lf: 0.12, lm: 1, ...rim },
      top: { d: topM, f: 0.32, m: 1, dd: pal.topD, df: 0.12, side: 1, l: pal.topL, lf: 0.04, lm: 1, ...rim },
      limb: { d: topM, f: 0.4, m: 1, dd: pal.topD, df: 0.18, side: 1, ...rim },
      hand: { d: skinM, f: 0.35, m: 1, dd: pal.skinD, df: 0.12, side: 1 },
      shirt: { d: pal.shirtD, f: 0.3, m: 1, side: 1 },
      skinTurned: { d: skinM, f: 0.2, m: 1, dd: pal.skinD, df: 0.13, side: 1, ...rim },
      bun: { d: pal.hairD, f: 0.45, m: 1, side: 1 },
      hairMass: { d: pal.hairD, f: 0.4, m: 1, side: 1, ...rim },
      mouthIn: mix(pal.lip, P.black, 0.5),
      sil: null,
    };
    SH.set(pal, r);
  }
  return r;
}

/** Geometry of a bust pose (shared by body, arms and hands). */
const G = { hw: 0, chin: 0, neckB: 0, shY: 0, shL: 0, shR: 0, hx: 0, top: 0 };
function geom(o) {
  const hh = o.hh;
  G.hw = hh * 0.37;
  G.hx = o.x + o.tiltX;
  G.top = o.y + o.nod;
  G.chin = o.y + hh;
  G.neckB = G.chin + hh * 0.22;
  G.shY = G.neckB + hh * 0.06;
  G.shL = o.x - hh * o.shoulders;
  G.shR = o.x + hh * o.shoulders;
}

/** Torso, neck, head, hair and face (arms are separate so a desk can sit between). */
export function bust(ctx, o, bottom = H + 2) {
  geom(o);
  const { pal } = o;
  const rc = recipes(pal);
  const hh = o.hh;
  const cx = o.x;
  hairBack(ctx, o);
  // torso: rounded shoulders falling to a slightly narrower waist
  const sw = hh * o.shoulders;
  const shY = G.shY;
  begin();
  pt(cx - hh * 0.22, G.neckB - hh * 0.04);
  pt(cx - sw * 0.72, shY);
  pt(cx - sw * 0.95, shY + hh * 0.14);
  pt(cx - sw * 1.02, shY + hh * 0.42);
  pt(cx - sw * 0.94, bottom);
  pt(cx + sw * 0.94, bottom);
  pt(cx + sw * 1.02, shY + hh * 0.42);
  pt(cx + sw * 0.95, shY + hh * 0.14);
  pt(cx + sw * 0.72, shY);
  pt(cx + hh * 0.22, G.neckB - hh * 0.04);
  fill(ctx, pal.top, rc.top);
  // neckline and garment details
  const nY = G.neckB - hh * 0.06;
  if (o.back) {
    // seen from behind: no lapels, buttons or drawstrings
  } else if (o.garment === 'jacket' || o.garment === 'cardigan') {
    const deep = o.garment === 'jacket' ? 1.15 : 0.95;
    begin();
    pt(cx - hh * 0.2, nY);
    pt(cx + hh * 0.2, nY);
    pt(cx + hh * 0.05, nY + hh * deep);
    pt(cx - hh * 0.05, nY + hh * deep);
    fill(ctx, pal.shirt, rc.shirt);
    // lapel edges (darker), a hint of collar
    line(ctx, cx - hh * 0.2, nY, cx - hh * 0.04, nY + hh * deep, pal.topD);
    line(ctx, cx + hh * 0.2, nY, cx + hh * 0.05, nY + hh * deep, pal.topD);
    if (o.garment === 'jacket') {
      line(ctx, cx - hh * 0.28, nY + hh * 0.05, cx - hh * 0.12, nY + hh * 0.62, pal.topL);
      if (o.tie) {
        begin();
        pt(cx - 1, nY + 1);
        pt(cx + 1.5, nY + 1);
        pt(cx + hh * 0.07, nY + hh * 0.9);
        pt(cx, nY + hh * 1.0);
        pt(cx - hh * 0.07, nY + hh * 0.9);
        fill(ctx, o.tie);
      }
    } else {
      // cardigan buttons
      for (let k = 1; k < 4; k++) rect(ctx, round(cx + hh * 0.07), round(nY + hh * deep + k * hh * 0.32), 1, 1, pal.topL);
    }
  } else if (o.garment === 'hoodie') {
    // hood folds around the neck, drawstrings
    begin();
    arc(cx, nY - hh * 0.02, hh * 0.42, hh * 0.22, 0, PI, 8);
    fill(ctx, pal.topD);
    begin();
    arc(cx, nY - hh * 0.06, hh * 0.3, hh * 0.14, 0, PI, 6);
    fill(ctx, pal.top);
    line(ctx, cx - hh * 0.12, nY + hh * 0.1, cx - hh * 0.14, nY + hh * 0.6, pal.shirt);
    line(ctx, cx + hh * 0.1, nY + hh * 0.1, cx + hh * 0.12, nY + hh * 0.55, pal.shirt);
  } else if (o.garment === 'dress') {
    begin();
    arc(cx, nY - hh * 0.05, hh * 0.38, hh * 0.32, 0, PI, 8);
    fill(ctx, pal.skin, rc.skinSoft);
  } else if (o.garment === 'apron') {
    begin();
    pt(cx - hh * 0.18, nY);
    pt(cx + hh * 0.18, nY);
    pt(cx + hh * 0.06, nY + hh * 0.4);
    pt(cx - hh * 0.06, nY + hh * 0.4);
    fill(ctx, pal.shirt, rc.shirt);
    begin();
    pt(cx - sw * 0.55, nY + hh * 0.75);
    pt(cx + sw * 0.55, nY + hh * 0.75);
    pt(cx + sw * 0.66, bottom);
    pt(cx - sw * 0.66, bottom);
    fill(ctx, o.apron || pal.topD, { d: pal.topD, f: 0.22, m: 1, side: 1 });
    line(ctx, cx - sw * 0.5, nY + hh * 0.75, cx - hh * 0.2, nY, o.apron || pal.topD);
    line(ctx, cx + sw * 0.5, nY + hh * 0.75, cx + hh * 0.2, nY, o.apron || pal.topD);
  } else {
    begin();
    arc(cx, nY - hh * 0.06, hh * 0.26, hh * 0.16, 0, PI, 6);
    fill(ctx, pal.topD);
  }
  // neck (chin shadow at the top; from behind just the nape)
  const nw = hh * 0.2;
  rect(ctx, round(G.hx - nw), round(G.chin - hh * 0.1), round(nw * 2), round(G.neckB - G.chin + hh * 0.08), pal.skin);
  rect(ctx, round(G.hx + nw * 0.25), round(G.chin - hh * 0.1), round(nw * 0.75), round(G.neckB - G.chin + hh * 0.08), pal.skinD);
  if (!o.back) rect(ctx, round(G.hx - nw), round(G.chin - hh * 0.02), round(nw * 2), max(1, round(hh * 0.07)), pal.skinD);
  else if (pal.rim) rect(ctx, round(G.hx + nw) - 1, round(G.chin - hh * 0.1), 1, round(G.neckB - G.chin + hh * 0.08), pal.rim);
  head(ctx, o);
}

/** Head, hair and face at the pose's head position. */
export function head(ctx, o) {
  const { pal } = o;
  const rc = recipes(pal);
  const hh = o.hh;
  const hw = hh * 0.37;
  const cx = o.x + o.tiltX;
  const top = o.y + o.nod;
  const turn = o.turn;
  if (o.back) {
    // seen from behind: the hair covers the head, an ear and the nape show
    const eYb = top + hh * 0.5;
    if (o.garment === 'hoodie') ellipse(ctx, cx, top + hh * 1.12, hw * 1.25, hh * 0.3, pal.top, rc.top);
    ellipse(ctx, cx + hw + 0.5, eYb, max(1, hh * 0.06), hh * 0.1, pal.skinD);
    ellipse(ctx, cx - hw - 0.5, eYb, max(1, hh * 0.06), hh * 0.1, pal.skinD);
    headSpans(cx, top - hh * 0.04, hh * 1.0, hw + (o.hair === 'messy' ? 1.2 : 0.6), 0, 0, o.hair === 'bun' ? 0.76 : 0.86);
    paint(ctx, pal.hair, rc.hair);
    if (o.hair === 'bun') {
      // hair combed back to a low chignon at the nape: a few strands converge on it
      ctx.fillStyle = mix(pal.hair, pal.hairL, 0.6);
      for (let k = -1; k <= 1; k++) {
        for (let i = 0; i < 14; i++) {
          const u = i / 14;
          const sx = cx + k * hw * 0.45 * (1 - u * 0.7) + hw * 0.08 * u;
          ctx.fillRect(round(sx), round(top + hh * (0.08 + u * 0.6)), 1, 1);
        }
      }
      ellipse(ctx, cx + hw * 0.05, top + hh * 0.8, hh * 0.25, hh * 0.15, pal.hair, rc.bun);
      ctx.fillStyle = pal.hairL;
      ctx.fillRect(round(cx - hw * 0.4), round(top + hh * 0.74), round(hw * 0.5), 1);
      ctx.fillStyle = pal.hairD;
      ctx.fillRect(round(cx - hw * 0.25), round(top + hh * 0.84), round(hw * 0.7), 1);
    }
    if (o.hair === 'messy') {
      // tufts break the dome's outline; strands run down the back
      ctx.fillStyle = pal.hair;
      for (let k = 0; k < 7; k++) {
        const u = (k - 3) / 3.4;
        const tx = cx + u * hw * 0.95;
        const ty = top - hh * 0.04 + (1 - sqrt(max(0, 1 - u * u))) * hh * 0.42;
        ctx.fillRect(round(tx - 1), round(ty - 2 - (k & 1)), 2 + (k % 3 === 0 ? 1 : 0), 3);
      }
      if (pal.rim) {
        ctx.fillStyle = pal.rim;
        ctx.fillRect(round(cx + hw * 0.62), round(top + hh * 0.06), 2, 1);
        ctx.fillRect(round(cx + hw * 0.85), round(top + hh * 0.2), 1, 2);
      }
      ctx.fillStyle = pal.hairD;
      ctx.fillRect(round(cx - hw * 0.3), round(top + hh * 0.3), 1, round(hh * 0.3));
      ctx.fillRect(round(cx + hw * 0.25), round(top + hh * 0.42), 1, round(hh * 0.28));
      ctx.fillStyle = pal.hair;
      ctx.fillRect(round(cx - hw * 0.5), round(top + hh * 0.84), 2, 2);
      ctx.fillRect(round(cx + hw * 0.1), round(top + hh * 0.86), 3, 1);
    }
    return;
  }
  // ears
  const eY = top + hh * 0.5;
  ellipse(ctx, cx - hw - 0.5 + turn * hw * 0.25, eY, max(1, hh * 0.06), hh * 0.1, pal.skin);
  ellipse(ctx, cx + hw + 0.5 + turn * hw * 0.25, eY, max(1, hh * 0.06), hh * 0.1, pal.skinD);
  // face
  headSpans(cx, top, hh, hw);
  paint(ctx, pal.skin, turn > 0.25 ? rc.skinTurned : rc.skin);
  // a soft lit plane on the key side of the forehead / cheek
  ctx.fillStyle = pal.skinL;
  const lx = round(cx - hw * 0.62 + turn * hw * 0.3);
  ctx.fillRect(lx, round(top + hh * 0.3), max(1, round(hw * 0.32)), max(1, round(hh * 0.12)));
  ctx.fillRect(lx, round(top + hh * 0.58), max(1, round(hw * 0.22)), max(1, round(hh * 0.1)));
  if (o.beard) {
    headSpans(cx, top, hh, hw, 0.5, 0.66, 1.02);
    paint(ctx, o.beard, { d: pal.hairD, f: 0.3, m: 1, side: 1 });
  }
  face(ctx, o, cx, top, hh, hw);
  hair(ctx, o, cx, top, hh, hw, rc);
}

/** Long hair / bob mass behind the head and neck (drawn before the torso). */
function hairBack(ctx, o) {
  if (o.hair !== 'long' && o.hair !== 'bob') return;
  const { pal } = o;
  const hh = o.hh;
  const hw = hh * 0.37;
  const cx = o.x + o.tiltX;
  const top = o.y + o.nod;
  const len = o.hair === 'long' ? 1.55 : 0.96;
  const wide = o.hair === 'long' ? 1.12 : 1.2;
  begin();
  arc(cx + o.turn * hw * 0.1, top + hh * 0.42, hw * wide, hh * 0.5, PI, PI * 2, 10);
  pt(cx + hw * wide, top + hh * len - hh * 0.1);
  pt(cx + hw * (wide - 0.25), top + hh * len);
  pt(cx - hw * (wide - 0.25), top + hh * len);
  pt(cx - hw * wide, top + hh * len - hh * 0.1);
  fill(ctx, pal.hair, recipes(pal).hairMass);
}

function face(ctx, o, cx, top, hh, hw) {
  const { pal } = o;
  const turn = o.turn;
  const fx = cx + turn * hw * 0.32; // features centre
  const eyeY = round(top + hh * 0.5);
  const sep = hw * 0.48;
  const ew = max(2, round(hh * 0.1));
  const look = round(o.look * 0.6);
  for (let s = -1; s <= 1; s += 2) {
    const far = s * turn > 0; // the eye on the side the face turns towards is further from us
    const ex = round(fx + s * sep * (far ? 1 - abs(turn) * 0.3 : 1) - ew / 2);
    const w = far ? max(2, ew - 1) : ew;
    // brow
    const by = eyeY - max(2, round(hh * 0.1)) - (o.brow > 0.3 ? 1 : 0);
    ctx.fillStyle = pal.hairD;
    ctx.fillRect(ex - (s < 0 ? 1 : 0), by + (o.brow < -0.3 && s < 0 ? 1 : 0), w + 1, 1);
    if (o.blink > 0.5) {
      ctx.fillStyle = pal.skinD;
      ctx.fillRect(ex, eyeY, w, 1);
    } else {
      // upper lid / lash line, then the iris below it, a touch of white beside it
      ctx.fillStyle = pal.skinD;
      ctx.fillRect(ex, eyeY - 1, w, 1);
      ctx.fillStyle = pal.white;
      ctx.fillRect(ex, eyeY, w, 1);
      ctx.fillStyle = pal.eye;
      const ix = clamp(ex + ((w - 1) >> 1) + (look > 0 ? 1 : look < 0 ? -1 : 0) + (turn > 0.3 ? 1 : turn < -0.3 ? -1 : 0), ex, ex + w - 1);
      ctx.fillRect(ix, eyeY, w >= 3 ? 2 : 1, 1);
      if (hh >= 30) ctx.fillRect(ex, eyeY - 1, w, 1);
    }
    if (o.glasses) {
      ctx.fillStyle = o.glasses;
      const gx = ex - 1;
      const gy = eyeY - 2;
      const gw = w + 2;
      ctx.fillRect(gx, gy, gw, 1);
      ctx.fillRect(gx, gy + 3, gw, 1);
      ctx.fillRect(gx - 1, gy + 1, 1, 2);
      ctx.fillRect(gx + gw, gy + 1, 1, 2);
    }
  }
  if (o.glasses) {
    ctx.fillStyle = o.glasses;
    ctx.fillRect(round(fx - sep + ew / 2 + 1), eyeY - 2, max(1, round(sep * 2 - ew - 2)), 1);
  }
  // nose: a shadow plane on the far side and a nostril
  const nY = round(top + hh * 0.66);
  const nx = round(fx + hw * 0.08 + turn * hw * 0.12);
  ctx.fillStyle = pal.skinD;
  ctx.fillRect(nx, round(top + hh * 0.56), 1, max(1, nY - round(top + hh * 0.56)));
  ctx.fillRect(nx - 1, nY, 2, 1);
  // mouth: quiet line, corners lifted by smile, opens 1-2 px at most
  const mY = round(top + hh * 0.79);
  const mw = max(3, round(hw * 0.62));
  const mx = round(fx - mw / 2 + turn * hw * 0.06);
  const open = o.mouth > 0.66 ? 2 : o.mouth > 0.25 ? 1 : 0;
  ctx.fillStyle = pal.lip;
  ctx.fillRect(mx, mY, mw, 1);
  if (o.smile > 0.45) {
    ctx.fillRect(mx - 1, mY - 1, 1, 1);
    ctx.fillRect(mx + mw, mY - 1, 1, 1);
  }
  if (open) {
    ctx.fillStyle = recipes(pal).mouthIn;
    ctx.fillRect(mx + 1, mY + 1, mw - 2, open);
    ctx.fillStyle = pal.lip;
    ctx.fillRect(mx + 1, mY + 1 + open, mw - 2, 1);
  } else if (hh >= 22) {
    ctx.fillStyle = pal.skinL;
    ctx.fillRect(mx + 1, mY + 2, mw - 2, 1);
  }
}

function hair(ctx, o, cx, top, hh, hw, rc) {
  const { pal } = o;
  const turn = o.turn;
  const style = o.hair;
  if (style === 'none') return;
  const part = cx + turn * hw * 0.3 - hw * 0.25;
  if (style === 'bald') {
    headSpans(cx, top, hh, hw, 0.6, 0.38, 0.56);
    ctx.fillStyle = pal.hair;
    for (let i = 0; i < SN; i++) {
      ctx.fillRect(SL[i], SY[i], 2, 1);
      ctx.fillRect(SR[i] - 2, SY[i], 2, 1);
    }
    return;
  }
  // cap of hair: top of the head down to the hairline (slanted from the parting)
  const cap = style === 'messy' ? 0.3 : 0.24;
  SN = 0;
  const extra = style === 'messy' ? 1.2 : style === 'short' ? 0.6 : 1;
  const yA = round(top - (style === 'messy' ? hh * 0.08 : hh * 0.04));
  const yB = round(top + hh * (style === 'short' ? 0.44 : style === 'bun' ? 0.42 : 0.6));
  for (let y = yA; y < yB && SN < 2048; y++) {
    const u = (y + 0.5 - top) / hh;
    const half = headHalf(clamp(u, 0, 1)) * hw + extra;
    let xl = round(cx - half);
    let xr = round(cx + half);
    if (u > cap) {
      // below the hairline only the sides remain: thicker on the parting's far side
      const side = style === 'bob' || style === 'long' ? hw * 0.32 : style === 'messy' ? hw * 0.22 : hw * 0.14;
      const fall = (u - cap) / 0.3;
      const wl = max(1, round(side * (1 + (style === 'bob' ? 0.4 : 0)) - fall));
      const wr = max(1, round(side - fall * 0.5));
      if (SN < 2046) {
        SL[SN] = xl;
        SR[SN] = xl + wl;
        SY[SN] = y;
        SN++;
        SL[SN] = xr - wr;
        SR[SN] = xr;
        SY[SN] = y;
        SN++;
      }
      continue;
    }
    // fringe: a soft slant down from the parting
    if (u > cap - 0.08 && (style === 'bob' || style === 'long')) {
      const k = (u - (cap - 0.08)) / 0.08;
      const gapL = round(part - hw * 0.1 * k);
      const gapR = round(part + hw * 0.9 * k);
      if (SN < 2046 && gapR > gapL) {
        SL[SN] = xl;
        SR[SN] = max(xl + 1, gapL);
        SY[SN] = y;
        SN++;
        SL[SN] = min(xr - 1, gapR);
        SR[SN] = xr;
        SY[SN] = y;
        SN++;
        continue;
      }
    }
    if (style === 'messy' && u < 0.02 && (y & 1)) {
      xl += 1;
      xr -= 2;
    }
    SL[SN] = xl;
    SR[SN] = xr;
    SY[SN] = y;
    SN++;
  }
  paint(ctx, pal.hair, rc.hair);
  // a strand line at the parting and a highlight band (key light upper left)
  ctx.fillStyle = pal.hairD;
  ctx.fillRect(round(part), round(top - hh * 0.02), 1, max(1, round(hh * 0.18)));
  if (style === 'bun') ellipse(ctx, cx + hw * 0.5, top + hh * 0.02, hh * 0.16, hh * 0.13, pal.hair, rc.hair);
  if (style === 'messy') {
    ctx.fillStyle = pal.hair;
    ctx.fillRect(round(cx - hw * 0.6), round(top + hh * 0.24), 2, 2);
    ctx.fillRect(round(cx + hw * 0.1), round(top + hh * 0.26), 3, 1);
  }
}

/** Arm geometry: shoulder -> elbow -> wrist for side -1 (screen left) or 1. */
const ARM = { sx: 0, sy: 0, ex: 0, ey: 0, wx: 0, wy: 0 };
function armGeom(o, side) {
  geom(o);
  const a = side < 0 ? o.armL : o.armR;
  const hh = o.hh;
  ARM.sx = (side < 0 ? G.shL : G.shR) - side * hh * 0.3;
  ARM.sy = G.shY + hh * 0.24;
  const up = hh * 1.3 * (a.len ?? 1);
  const fo = hh * 1.15 * (a.fore ?? 1);
  if (a.to) {
    // two-bone IK: put the wrist on the target, elbow outward (bend 1) or inward (-1)
    const tx = a.to.x - ARM.sx;
    const ty = a.to.y - ARM.sy;
    const d = clamp(sqrt(tx * tx + ty * ty), abs(up - fo) + 0.01, up + fo - 0.01);
    const A = Math.acos(clamp((up * up + d * d - fo * fo) / (2 * up * d), -1, 1));
    // of the two solutions keep the elbow hanging low (bend 1; -1 picks the high
    // one), outward on a tie, so it never flips sides during a movement;
    // a.elbow = 'out' always keeps it on the outer side (reaching sideways)
    const base = Math.atan2(ty, tx);
    const e1y = ARM.sy + sin(base + A) * up;
    const e2y = ARM.sy + sin(base - A) * up;
    let pick;
    if (a.elbow === 'out' || abs(e1y - e2y) < 1.5) {
      const e1x = ARM.sx + cos(base + A) * up;
      const e2x = ARM.sx + cos(base - A) * up;
      pick = (e1x - o.x) * side > (e2x - o.x) * side ? 1 : -1;
    } else pick = e1y > e2y ? 1 : -1;
    const ang = base + pick * (a.bend ?? 1) * A;
    ARM.ex = ARM.sx + cos(ang) * up;
    ARM.ey = ARM.sy + sin(ang) * up;
    const fx = a.to.x - ARM.ex;
    const fy = a.to.y - ARM.ey;
    const fl = sqrt(fx * fx + fy * fy) || 1;
    ARM.wx = ARM.ex + (fx / fl) * fo;
    ARM.wy = ARM.ey + (fy / fl) * fo;
    return a;
  }
  // a: upper arm angle from hanging straight down, positive = out to the side
  const a1 = a.a;
  ARM.ex = ARM.sx + side * sin(a1) * up;
  ARM.ey = ARM.sy + cos(a1) * up;
  // e: elbow bend, positive folds the forearm inward / up toward the body centre
  const a2 = a1 - a.e;
  ARM.wx = ARM.ex + side * sin(a2) * fo;
  ARM.wy = ARM.ey + cos(a2) * fo;
  return a;
}

/** One arm (sleeve + hand); call after bust() and after any desk drawn over the body. */
export function arm(ctx, o, side, { sleeve = true, bare = false } = {}) {
  const a = armGeom(o, side);
  const { pal } = o;
  const rc = recipes(pal);
  const hh = o.hh;
  const r0 = hh * 0.24;
  const r1 = hh * 0.19;
  if (bare) {
    // a bare arm: slimmer, skin shaded like the face (rim included)
    capsule(ctx, ARM.sx, ARM.sy, ARM.ex, ARM.ey, hh * 0.14, hh * 0.11, pal.skin, rc.skin);
    capsule(ctx, ARM.ex, ARM.ey, ARM.wx, ARM.wy, hh * 0.11, hh * 0.085, pal.skin, rc.skin);
  } else if (sleeve) {
    capsule(ctx, ARM.sx, ARM.sy, ARM.ex, ARM.ey, r0, r1, pal.top, rc.limb);
    capsule(ctx, ARM.ex, ARM.ey, ARM.wx, ARM.wy, r1, hh * 0.16, pal.top, rc.limb);
    // cuff
    if (o.cuff) ellipse(ctx, ARM.wx, ARM.wy, hh * 0.15, hh * 0.12, o.cuff);
  }
  hand(ctx, o, ARM.wx, ARM.wy, side, a.hand, a.handAng);
}

/** Wrist position of an arm (after the pose is set), for props held in the hand. */
export function wrist(o, side) {
  armGeom(o, side);
  return ARM;
}

/** Hand shapes at the wrist: 'rest' (flat, on a surface), 'open' (palm up/out), 'hold', 'point', 'fist'. */
export function hand(ctx, o, x, y, side, kind = 'rest', ang = null) {
  const { pal } = o;
  const rc = recipes(pal);
  const hh = o.hh;
  const s = hh * 0.13;
  if (kind === 'open') {
    // palm raised, fingers up, thumb out to the side
    begin();
    pt(x - s, y);
    pt(x - s * 1.1, y - s * 2.1);
    pt(x - s * 0.4, y - s * 2.6);
    pt(x + s * 0.6, y - s * 2.5);
    pt(x + s * 1.0, y - s * 1.7);
    pt(x + s, y);
    fill(ctx, pal.skin, rc.hand);
    capsule(ctx, x + side * s * 0.9, y - s * 0.6, x + side * s * 1.9, y - s * 1.5, s * 0.4, s * 0.35, pal.skin);
    return;
  }
  if (kind === 'point') {
    ellipse(ctx, x, y, s * 1.1, s * 0.9, pal.skin, rc.hand);
    capsule(ctx, x, y, x + side * s * 2.4, y - s * 0.5, s * 0.35, s * 0.3, pal.skin);
    return;
  }
  if (kind === 'fist' || kind === 'hold') {
    ellipse(ctx, x, y + s * 0.2, s * 1.05, s * 1.1, pal.skin, rc.hand);
    if (kind === 'hold') rect(ctx, round(x - s * 0.9), round(y - s * 0.2), round(s * 1.8), 1, pal.skinD);
    return;
  }
  // rest: a flat hand seen from above-front, fingers toward the centre line
  const dir = ang ?? -side;
  begin();
  pt(x - s * 1.1, y - s * 0.7);
  pt(x + s * 1.1, y - s * 0.7);
  pt(x + s * 1.2 + dir * s * 0.9, y + s * 0.5);
  pt(x + dir * s * 1.4, y + s * 1.0);
  pt(x - s * 1.2 + dir * s * 0.9, y + s * 0.5);
  fill(ctx, pal.skin, rc.hand);
  ctx.fillStyle = pal.skinD;
  ctx.fillRect(round(x - s * 0.8 + dir * s * 0.6), round(y + s * 0.4), max(1, round(s * 1.6)), 1);
}

// ---------------------------------------------------------------- profile

// Head in profile facing right, in head heights from the crown (x toward the face).
const PROFILE = [
  0.0, 0.0, 0.2, 0.03, 0.32, 0.12, 0.39, 0.25, 0.42, 0.37, 0.39, 0.44, 0.41, 0.49, 0.47, 0.58, 0.51, 0.63, 0.49, 0.65,
  0.44, 0.66, 0.43, 0.71, 0.46, 0.74, 0.43, 0.775, 0.45, 0.8, 0.41, 0.84, 0.405, 0.88, 0.43, 0.93, 0.38, 0.99, 0.3,
  1.0, 0.12, 0.96, -0.02, 0.86, -0.12, 0.76, -0.24, 0.66, -0.31, 0.5, -0.3, 0.28, -0.2, 0.09,
];
const NECK = [0.18, 0.92, 0.24, 1.32, -0.2, 1.32, -0.16, 0.78];
const PROFILE_HAIR = {
  messy: [0.38, 0.31, 0.37, 0.19, 0.31, 0.09, 0.25, -0.01, 0.17, -0.06, 0.1, -0.1, 0.02, -0.07, -0.06, -0.11, -0.14, -0.06, -0.22, -0.05, -0.3, 0.03, -0.36, 0.13, -0.39, 0.27, -0.36, 0.42, -0.33, 0.56, -0.27, 0.69, -0.19, 0.67, -0.14, 0.5, -0.07, 0.38, 0.03, 0.3, 0.13, 0.27, 0.22, 0.25, 0.28, 0.3, 0.33, 0.35],
  short: [0.33, 0.17, 0.2, 0.0, -0.05, -0.04, -0.24, 0.06, -0.33, 0.24, -0.33, 0.44, -0.26, 0.56, -0.14, 0.46, -0.05, 0.3, 0.12, 0.2, 0.3, 0.2],
};

/**
 * A head in profile (facing right; flip = true faces left) for close-ups.
 * o: { x, y (crown), hh, pal, hair: 'messy' | 'short', eye: 0 open .. 1 closed,
 * mouth 0..1, smile 0..1, light: lit-edge colour (key from the face side),
 * litF: fraction of each span lit }.
 */
export function profile(ctx, o) {
  const { pal } = o;
  const hh = o.hh;
  const f = o.flip ? -1 : 1;
  // plain arithmetic instead of (ox + () * hf)/(oy + () * hh) closures (no per-frame allocation)
  const ox = o.x;
  const oy = o.y;
  const hf = hh * f;
  const side = -f; // the dark side is the back of the head
  // rim from the face side: a fixed 2 px edge, a half-lit band, then shadow
  if (!o._rc || o._rc.flip !== f) {
    o._rc = {
      flip: f,
      lit: o.light
        ? { d: pal.skinD, f: 0.5, m: 1, side, l: o.light, lf: 0, lm: o.rimPx ?? 2, dd: mix(pal.skinD, P.black, 0.35), df: 0.2 }
        : { d: pal.skinD, f: 0.4, m: 1, side },
      half: o.light ? { l: mix(pal.skin, o.light, 0.45), lf: 0.1, lm: 2, side } : null,
      ear: { d: pal.skinD, f: 0.5, m: 1, side },
      hair: { d: pal.hairD, f: 0.55, m: 1, side, l: o.light ? mix(pal.hair, o.light, 0.4) : pal.hairL, lf: 0, lm: 1 },
    };
  }
  const { lit, half } = o._rc;
  begin();
  for (let i = 0; i < NECK.length; i += 2) pt((ox + (NECK[i]) * hf), (oy + (NECK[i + 1]) * hh));
  fill(ctx, pal.skin, lit);
  // jaw shadow on the neck
  begin();
  pt((ox + (0.18) * hf), (oy + (0.95) * hh));
  pt((ox + (0.3) * hf), (oy + (1.0) * hh));
  pt((ox + (0.2) * hf), (oy + (1.12) * hh));
  pt((ox + (-0.1) * hf), (oy + (0.9) * hh));
  fill(ctx, pal.skinD);
  begin();
  for (let i = 0; i < PROFILE.length; i += 2) pt((ox + (PROFILE[i]) * hf), (oy + (PROFILE[i + 1]) * hh));
  fill(ctx, pal.skin, lit);
  if (half) {
    // a softer second band just inside the rim (light wrapping round the cheek)
    begin();
    for (let i = 0; i < PROFILE.length; i += 2) pt((ox + (PROFILE[i]) * hf) - f * 2, (oy + (PROFILE[i + 1]) * hh));
    collect();
    ctx.fillStyle = half.l;
    for (let i = 0; i < SN; i++) {
      const w = SR[i] - SL[i];
      const k = min(w, max(2, round(w * 0.08)));
      ctx.fillRect(f > 0 ? SR[i] - k : SL[i], SY[i], k, 1);
    }
  }
  // ear: skin with a darker inner fold
  ellipse(ctx, (ox + (-0.06) * hf), (oy + (0.53) * hh), hh * 0.06, hh * 0.1, pal.skin, o._rc.ear);
  ellipse(ctx, (ox + (-0.055) * hf), (oy + (0.54) * hh), hh * 0.025, hh * 0.055, pal.skinD);
  // eye, brow, nostril, mouth line
  const eyeY = (oy + (0.47) * hh);
  ctx.fillStyle = pal.hairD;
  ctx.fillRect(round(min((ox + (0.29) * hf), (ox + (0.4) * hf))), round((oy + (0.4) * hh)), round(hh * 0.11), max(1, round(hh * 0.02)));
  const closed = (o.eye ?? 0) > 0.5;
  ctx.fillStyle = closed ? mix(pal.skinD, P.black, 0.3) : pal.eye || P.black;
  const ew = max(2, round(hh * 0.07));
  const ex = round(f > 0 ? (ox + (0.315) * hf) : (ox + (0.315) * hf) - ew);
  ctx.fillRect(ex, round(eyeY), ew, 1);
  if (!closed) {
    ctx.fillRect(round(f > 0 ? (ox + (0.335) * hf) : (ox + (0.335) * hf) - 1), round(eyeY + 1), max(1, round(hh * 0.025)), max(1, round(hh * 0.025)));
    if (o.light) {
      ctx.fillStyle = o.light;
      ctx.fillRect(round(f > 0 ? (ox + (0.36) * hf) : (ox + (0.36) * hf) - 1), round(eyeY + 1), 1, 1);
    }
  }
  ctx.fillStyle = mix(pal.skinD, P.black, 0.35);
  ctx.fillRect(round(f > 0 ? (ox + (0.43) * hf) : (ox + (0.43) * hf) - 2), round((oy + (0.645) * hh)), 2, 1);
  ctx.fillStyle = pal.lip || pal.skinD;
  const open = (o.mouth ?? 0) > 0.5 ? 1 : 0;
  ctx.fillRect(round(f > 0 ? (ox + (0.37) * hf) : (ox + (0.37) * hf) - round(hh * 0.07)), round((oy + (0.775) * hh)) + (o.smile > 0.5 ? -1 : 0), round(hh * 0.07), 1 + open);
  // hair
  const hp = PROFILE_HAIR[o.hair] || PROFILE_HAIR.short;
  begin();
  for (let i = 0; i < hp.length; i += 2) pt((ox + (hp[i]) * hf), (oy + (hp[i + 1]) * hh));
  fill(ctx, pal.hair, o._rc.hair);
  // a few strands catching the light
  if (o.light) {
    ctx.fillStyle = mix(pal.hair, o.light, 0.25);
    for (let i = 0; i < 5; i++) {
      const u = 0.06 + i * 0.07;
      ctx.fillRect(round((ox + (u) * hf)), round((oy + (0.02 + i * 0.035 + (i & 1) * 0.02) * hh)), max(2, round(hh * 0.05)), 1);
    }
  }
}

// ---------------------------------------------------------------- full figures

/**
 * A standing adult (about 6.6 heads tall) for wide shots. o: { x (centre), gy
 * (ground y), hh (head height), pal, hair, dress: bool, coat: bool, turn,
 * lean px, armL/armR {a, e}, step 0..1, silhouette: rim colour (draws the
 * figure dark with a 1 px rim on the screen-right edge) }.
 */
export function standing(ctx, o) {
  const hh = o.hh;
  const H8 = hh * 6.6;
  const top = o.gy - H8 + (o.dip || 0);
  const cx = o.x + (o.lean || 0);
  const { pal } = o;
  // silhouette recipes are built once per figure object (no per-frame objects)
  if (o.silhouette && !o._sil) {
    const side = o.rimSide ?? 1;
    o._sil = {
      top: { d: pal.topD, f: 0.6, m: 1, side, r: o.silhouette },
      skin: { d: pal.skinD, f: 0.6, m: 1, side, r: o.silhouette },
      hair: { d: pal.hairD, f: 0.6, m: 1, side, r: o.silhouette },
    };
  }
  const dark = o.silhouette ? o._sil.top : recipes(pal).top;
  const skinSh = o.silhouette ? o._sil.skin : recipes(pal).skin;
  const hairSh = o.silhouette ? o._sil.hair : recipes(pal).hair;
  const shY = top + hh * 1.35;
  const sw = hh * (o.shoulders ?? 0.82);
  const hipY = top + hh * 3.5;
  const hipW = hh * (o.dress ? 0.62 : 0.6);
  // legs (trousers / stockings) from hip to ground
  const legC = o.legs || pal.topD;
  const kneeY = top + hh * 5.0;
  const st = (o.step || 0) * hh * 0.35;
  if (!o.dress || o.slit) {
    capsule(ctx, cx - hh * 0.22, hipY, cx - hh * 0.22 - st, o.gy - hh * 0.2, hh * 0.21, hh * 0.13, legC, dark);
    capsule(ctx, cx + hh * 0.22, hipY, cx + hh * 0.2 + st, o.gy - hh * 0.2, hh * 0.21, hh * 0.13, legC, dark);
  } else {
    capsule(ctx, cx - hh * 0.14, kneeY, cx - hh * 0.16, o.gy - hh * 0.2, hh * 0.1, hh * 0.08, pal.skin, skinSh);
    capsule(ctx, cx + hh * 0.14, kneeY, cx + hh * 0.16, o.gy - hh * 0.2, hh * 0.1, hh * 0.08, pal.skin, skinSh);
  }
  // shoes
  const shoe = o.shoes || P.black;
  ellipse(ctx, cx - hh * 0.25 - st, o.gy - hh * 0.07, hh * 0.2, hh * 0.09, shoe);
  ellipse(ctx, cx + hh * 0.25 + st, o.gy - hh * 0.07, hh * 0.2, hh * 0.09, shoe);
  // torso (+ dress / coat skirt)
  begin();
  pt(cx - hh * 0.2, shY - hh * 0.12);
  pt(cx - sw * 0.85, shY);
  pt(cx - sw, shY + hh * 0.25);
  pt(cx - hipW * 0.82, top + hh * 2.7);
  if (o.dress || o.coat) {
    pt(cx - hipW * 1.0, hipY);
    pt(cx - hipW * (o.coat ? 1.15 : 1.3), top + hh * (o.coat ? 4.9 : 5.6));
    pt(cx + hipW * (o.coat ? 1.15 : 1.3), top + hh * (o.coat ? 4.9 : 5.6));
    pt(cx + hipW * 1.0, hipY);
  } else {
    pt(cx - hipW, hipY + hh * 0.2);
    pt(cx + hipW, hipY + hh * 0.2);
  }
  pt(cx + hipW * 0.82, top + hh * 2.7);
  pt(cx + sw, shY + hh * 0.25);
  pt(cx + sw * 0.85, shY);
  pt(cx + hh * 0.2, shY - hh * 0.12);
  fill(ctx, pal.top, dark);
  if (o.belt) rect(ctx, round(cx - hipW * 0.85), round(top + hh * 2.95), round(hipW * 1.7), 1, o.belt);
  // neck + head
  rect(ctx, round(cx - hh * 0.14), round(top + hh * 0.9), round(hh * 0.28), round(hh * 0.4), pal.skin);
  if (!o.silhouette) rect(ctx, round(cx + hh * 0.02), round(top + hh * 0.9), round(hh * 0.12), round(hh * 0.4), pal.skinD);
  // arms
  for (const side of [-1, 1]) {
    const a = side < 0 ? o.armL : o.armR;
    const sx = cx + side * (sw - hh * 0.12);
    const sy = shY + hh * 0.15;
    const up = hh * 1.35;
    const fo = hh * 1.2;
    const ex = sx + side * sin(a.a) * up;
    const ey = sy + cos(a.a) * up;
    const a2 = a.a - a.e;
    const wx = ex + side * sin(a2) * fo;
    const wy = ey + cos(a2) * fo;
    a.wx = wx;
    a.wy = wy;
    if (a.behind) continue;
    capsule(ctx, sx, sy, ex, ey, hh * 0.17, hh * 0.14, o.sleeves || pal.top, dark);
    capsule(ctx, ex, ey, wx, wy, hh * 0.14, hh * 0.11, o.bareArms ? pal.skin : o.sleeves || pal.top, o.bareArms ? skinSh : dark);
    ellipse(ctx, wx, wy + hh * 0.08, hh * 0.12, hh * 0.15, pal.skin, skinSh);
  }
  // head: small-scale version (hair mass + face plane + quiet features)
  const hw = hh * 0.37;
  const hx = cx + (o.headX || 0);
  const ht = top + (o.headY || 0);
  headSpans(hx, ht, hh, hw);
  paint(ctx, pal.skin, skinSh);
  const hairStyle = o.hair || 'short';
  if (hairStyle === 'bun') {
    const bx = hx - (o.turn || 0) * hw * 0.7;
    ellipse(ctx, bx, ht + hh * 0.12, hh * 0.24, hh * 0.2, pal.hair, hairSh);
  }
  if (hairStyle !== 'none') {
    SN = 0;
    const long = hairStyle === 'long' || hairStyle === 'bob';
    const yB = ht + hh * (hairStyle === 'long' ? 1.35 : hairStyle === 'bob' ? 0.95 : 0.4);
    for (let y = round(ht - hh * 0.06); y < yB && SN < 2048; y++) {
      const u = (y + 0.5 - ht) / hh;
      const half = (u <= 1 ? headHalf(clamp(u)) : 0.8) * hw + (long ? 1 : 0.5);
      let xl = round(hx - half);
      let xr = round(hx + half);
      if (u > 0.26) {
        if (!long) {
          SL[SN] = xl;
          SR[SN] = xl + 1;
          SY[SN] = y;
          SN++;
          continue;
        }
        // behind the face: only the sides, falling to the shoulders
        const k = max(1, round(hw * 0.38));
        const facing = o.turn || 0;
        if (facing > 0.6) {
          SL[SN] = xl;
          SR[SN] = xl + k * 2;
        } else if (facing < -0.6) {
          SL[SN] = xr - k * 2;
          SR[SN] = xr;
        } else {
          SL[SN] = xl;
          SR[SN] = xl + k;
          SY[SN] = y;
          SN++;
          SL[SN] = xr - k;
          SR[SN] = xr;
        }
        SY[SN] = y;
        SN++;
        continue;
      }
      if (u < 0) {
        xl += 1;
        xr -= 1;
      }
      SL[SN] = xl;
      SR[SN] = xr;
      SY[SN] = y;
      SN++;
    }
    paint(ctx, pal.hair, hairSh);
  }
  if (!o.silhouette && hh >= 11) {
    const fx = hx + (o.turn || 0) * hw * 0.35;
    const ey = round(ht + hh * 0.52);
    ctx.fillStyle = pal.hairD;
    ctx.fillRect(round(fx - hw * 0.5), ey, 2, 1);
    ctx.fillRect(round(fx + hw * 0.2), ey, 2, 1);
    ctx.fillStyle = pal.skinD;
    ctx.fillRect(round(fx + hw * 0.05), round(ht + hh * 0.66), 1, 1);
    ctx.fillStyle = pal.lip;
    ctx.fillRect(round(fx - hw * 0.25), round(ht + hh * 0.8), max(2, round(hw * 0.5)), 1);
  }
}
