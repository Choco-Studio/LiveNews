// Opening title sequences: one per programme, each with its own look and
// theme jingle, all signed off by the GLOBIT 24 brand.
//
//   drawOpen(ctx, t, dt, programId, info)  full frame; dt = seconds since the open started
//   openFor(programId) -> { duration, tune } (the director waits `duration` and plays `tune` once)
//   OPENS[id] = { duration, tune, draw(ctx, t, dt, info) }
//   info = { title, tagline, presenters: ['PACO PIXEL', ...], date, channel }
//
// Everything is drawn on the fixed 384x216 canvas in whole pixels with the
// channel palette (translucent palette colours only for glows and light).
// Big titles are not upscaled bitmaps: the 5x7 font is rebuilt at 4x with
// 1-pixel detail (chamfered corners, bridged diagonals, dithered face
// gradient, edge light, outline and extrusion) and cached per letter.
// Heavy static work (globe tables, planet, PCB, stopwatch faces) is baked on
// lazily created offscreen canvases and warmed in the background.
import { P } from '../palette.js';
import { drawText, measureText, wrapText, normalizeText } from '../font.js';
import { r, mulberry32, clamp, easeOut, easeInOut } from '../util.js';
import { drawStripes } from '../set.js';
import { drawLogo } from '../logo.js';
import { LAND } from './worlddata.js';

const W = 384;
const H = 216;
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const { floor, round, min, max, abs, sin, cos, sqrt } = Math;
const HAS_DOM = typeof document !== 'undefined';

// ---------------------------------------------------------------------------
// Timing helpers

const lerp = (a, b, k) => a + (b - a) * k;
/** Progress (0..1) of a segment that starts at `start` and lasts `dur`. */
const seg = (x, start, dur) => clamp((x - start) / dur, 0, 1);
const easeIn = (x) => clamp(x, 0, 1) ** 3;
function easeOutBack(x, s = 1.70158) {
  const v = clamp(x, 0, 1) - 1;
  return 1 + (s + 1) * v * v * v + s * v * v;
}
function easeOutBounce(x) {
  let v = clamp(x, 0, 1);
  const n = 7.5625;
  const d = 2.75;
  if (v < 1 / d) return n * v * v;
  if (v < 2 / d) return n * (v -= 1.5 / d) * v + 0.75;
  if (v < 2.5 / d) return n * (v -= 2.25 / d) * v + 0.9375;
  return n * (v -= 2.625 / d) * v + 0.984375;
}
/** Repeating accent: 0..1 while a periodic event runs, else -1. */
function every(x, start, period, dur) {
  if (x < start) return -1;
  const ph = (x - start) % period;
  return ph < dur ? ph / dur : -1;
}
function hash(n) {
  n = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  n ^= n >>> 13;
  n = Math.imul(n, 0xc2b2ae35);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}
const hash2 = (a, b) => hash(Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul((b | 0) + 0x165667b1, 0x61c88647));
const typed = (text, p) => text.slice(0, round(text.length * clamp(p, 0, 1)));
const wrap180 = (a) => ((((a + 180) % 360) + 360) % 360) - 180;

// ---------------------------------------------------------------------------
// Colour + canvas helpers

const RGB = new Map();
function rgbOf(hex) {
  let v = RGB.get(hex);
  if (!v) {
    const n = parseInt(hex.slice(1), 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    RGB.set(hex, v);
  }
  return v;
}
function u32(hex, a = 255) {
  const [R, G, B] = rgbOf(hex);
  return ((a << 24) | (B << 16) | (G << 8) | R) >>> 0;
}
const RGBA = new Map();
/** A palette colour at alpha a (quantised), for glows and light only. */
function rgba(hex, a) {
  const q = round(clamp(a, 0, 1) * 40);
  const key = hex + q;
  let s = RGBA.get(key);
  if (!s) {
    const [R, G, B] = rgbOf(hex);
    s = `rgba(${R},${G},${B},${q / 40})`;
    RGBA.set(key, s);
  }
  return s;
}

function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = max(1, w | 0);
  c.height = max(1, h | 0);
  c.getContext('2d').imageSmoothingEnabled = false;
  return c;
}
function toCanvas(buf, w, h) {
  const c = mk(w, h);
  const cx = c.getContext('2d');
  const img = cx.createImageData(w, h);
  new Uint32Array(img.data.buffer).set(buf);
  cx.putImageData(img, 0, 0);
  return c;
}

/** 1x pixel buffer used to bake sprites. */
class Pix {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.d = new Uint32Array(w * h);
  }

  px(x, y, c) {
    x |= 0;
    y |= 0;
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = typeof c === 'number' ? c : u32(c);
  }

  rect(x, y, w, h, c) {
    const v = typeof c === 'number' ? c : u32(c);
    for (let yy = max(0, y); yy < min(this.h, y + h); yy++) {
      for (let xx = max(0, x); xx < min(this.w, x + w); xx++) this.d[yy * this.w + xx] = v;
    }
  }

  canvas() {
    return toCanvas(this.d, this.w, this.h);
  }
}

/** Per-frame pixel layer (cleared and uploaded each frame). */
class Frame {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.cv = mk(w, h);
    this.cx = this.cv.getContext('2d');
    this.img = this.cx.createImageData(w, h);
    this.d = new Uint32Array(this.img.data.buffer);
  }

  flush() {
    this.cx.putImageData(this.img, 0, 0);
    return this.cv;
  }
}

const MEMO = new Map();
function cached(key, fn) {
  let v = MEMO.get(key);
  if (v === undefined) {
    v = fn();
    MEMO.set(key, v);
  }
  return v;
}

// Ordered (Bayer 4x4) dithering: fades, gradients and soft shapes stay crisp.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x, y) => (BAYER[((y & 3) << 2) | (x & 3)] + 0.5) / 16;
const PATS = new Map();
function ditherStyle(ctx, color, k) {
  const key = `${color}|${k}`;
  let p = PATS.get(key);
  if (!p) {
    const c = mk(4, 4);
    const cx = c.getContext('2d');
    cx.fillStyle = color;
    for (let i = 0; i < 16; i++) if (BAYER[i] < k) cx.fillRect(i & 3, i >> 2, 1, 1);
    p = ctx.createPattern(c, 'repeat');
    PATS.set(key, p);
  }
  return p;
}
/** Covers a fraction `a` of the rect's pixels with a palette colour (ordered dither). */
function dfill(ctx, x, y, w, h, color, a) {
  const k = round(clamp(a, 0, 1) * 16);
  if (k <= 0 || w <= 0 || h <= 0) return;
  if (k >= 16) {
    r(ctx, x, y, w, h, color);
    return;
  }
  ctx.fillStyle = ditherStyle(ctx, color, k);
  ctx.fillRect(round(x), round(y), round(w), round(h));
}

/** Filled disc from row spans (fillStyle may be a colour or a dither pattern). */
function disc(ctx, cx, cy, rad, style) {
  if (rad < 0.5) return;
  ctx.fillStyle = style;
  const R = rad + 0.4;
  const n = floor(R);
  for (let dy = -n; dy <= n; dy++) {
    const hw = floor(sqrt(max(0, R * R - dy * dy)));
    ctx.fillRect(round(cx) - hw, round(cy) + dy, hw * 2 + 1, 1);
  }
}

const RINGS = new Map();
/** Integer points of a 1px circle (midpoint algorithm), flat [x0,y0,x1,y1,...]. */
function ringPts(rad) {
  rad = max(0, rad | 0);
  let pts = RINGS.get(rad);
  if (pts) return pts;
  const out = [];
  const seen = new Set();
  const add = (x, y) => {
    const k = (x + 512) * 1024 + y + 512;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(x, y);
    }
  };
  let x = rad;
  let y = 0;
  let err = 1 - rad;
  while (x >= y) {
    add(x, y); add(y, x); add(-y, x); add(-x, y);
    add(-x, -y); add(-y, -x); add(y, -x); add(x, -y);
    y++;
    if (err < 0) err += 2 * y + 1;
    else {
      x--;
      err += 2 * (y - x) + 1;
    }
  }
  pts = Int16Array.from(out);
  RINGS.set(rad, pts);
  return pts;
}
/** Dithered 1px ring: `a` (0..1) of its pixels are drawn. */
function ring(ctx, cx, cy, rad, color, a = 1) {
  if (a <= 0 || rad < 0) return;
  const pts = ringPts(rad);
  const thr = a * 16;
  ctx.fillStyle = color;
  cx = round(cx);
  cy = round(cy);
  for (let i = 0; i < pts.length; i += 2) {
    const x = cx + pts[i];
    const y = cy + pts[i + 1];
    if (BAYER[((y & 3) << 2) | (x & 3)] < thr) ctx.fillRect(x, y, 1, 1);
  }
}

/** Bresenham line, calling fn(x, y, i). */
function linePts(x0, y0, x1, y1, fn) {
  x0 = round(x0);
  y0 = round(y0);
  x1 = round(x1);
  y1 = round(y1);
  const dx = abs(x1 - x0);
  const dy = -abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let i = 0; i < 4000; i++) {
    fn(x0, y0, i);
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

/** Four-point star glint; k runs 0..1 over its life, size = arm length at peak. */
function sparkle(ctx, x, y, k, size = 5, color = P.white, arm = P.cyan) {
  if (k <= 0 || k >= 1) return;
  const s = round(sin(k * Math.PI) * size);
  x = round(x);
  y = round(y);
  if (s <= 0) {
    r(ctx, x, y, 1, 1, color);
    return;
  }
  r(ctx, x - s, y, s * 2 + 1, 1, arm);
  r(ctx, x, y - s, 1, s * 2 + 1, arm);
  const c = max(1, s >> 1);
  r(ctx, x - c, y, c * 2 + 1, 1, color);
  r(ctx, x, y - c, 1, c * 2 + 1, color);
  if (s > 3) {
    r(ctx, x - 1, y - 1, 3, 3, color);
    r(ctx, x - 1, y - 1, 1, 1, arm);
    r(ctx, x + 1, y + 1, 1, 1, arm);
    r(ctx, x + 1, y - 1, 1, 1, arm);
    r(ctx, x - 1, y + 1, 1, 1, arm);
  }
}

function clipRect(ctx, x, y, w, h) {
  ctx.beginPath();
  ctx.rect(round(x), round(y), max(0, round(w)), max(0, round(h)));
  ctx.clip();
}

/** Integer camera shake that decays over `dur` after `at`. */
function shake(dt, at, dur, amp) {
  const k = seg(dt, at, dur);
  if (dt < at || k >= 1) return [0, 0];
  const a = amp * (1 - k) ** 1.5;
  const f = floor(dt * 60);
  return [round((hash(f * 2 + 11) * 2 - 1) * a), round((hash(f * 2 + 7) * 2 - 1) * a)];
}

/** Self-copy a horizontal slice of the frame sideways (glitch). */
function slice(ctx, y, h, dx) {
  const cv = ctx.canvas;
  if (!cv || !dx) return;
  y = clamp(round(y), 0, H - 1);
  h = clamp(round(h), 1, H - y);
  try {
    ctx.drawImage(cv, 0, y, W, h, round(dx), y, W, h);
  } catch { /* canvas not readable: skip the glitch */ }
}

// ---------------------------------------------------------------------------
// Title lettering: the 5x7 font rebuilt at 4x with 1px detail.

const BITS = new Map();
/** Font-level (1x) bitmap of a string: { w, h: 7, bits }. */
function textBits(text) {
  let m = BITS.get(text);
  if (m) return m;
  const w = max(1, measureText(text, 1));
  const c = mk(w + 2, 12);
  const cx = c.getContext('2d');
  drawText(cx, text, 0, 0, { color: '#ffffff', scale: 1 });
  const data = cx.getImageData(0, 0, w, 7).data;
  const bits = new Uint8Array(w * 7);
  for (let i = 0; i < w * 7; i++) bits[i] = data[i * 4 + 3] > 127 ? 1 : 0;
  m = { w, h: 7, bits };
  BITS.set(text, m);
  return m;
}

/** Scaled mask with chamfered outer corners and bridged diagonal joints. */
function bigMask(text, s) {
  const g = textBits(text);
  const w = g.w * s;
  const h = g.h * s;
  const m = new Uint8Array(w * h);
  const G = (x, y) => (x >= 0 && y >= 0 && x < g.w && y < g.h ? g.bits[y * g.w + x] : 0);
  const set = (x, y, v) => {
    if (x >= 0 && y >= 0 && x < w && y < h) m[y * w + x] = v;
  };
  for (let gy = 0; gy < g.h; gy++) {
    for (let gx = 0; gx < g.w; gx++) {
      if (!G(gx, gy)) continue;
      for (let yy = 0; yy < s; yy++) m.fill(1, (gy * s + yy) * w + gx * s, (gy * s + yy) * w + gx * s + s);
    }
  }
  if (s >= 3) {
    const k = max(0, floor(s / 2) - 1);
    for (let gy = 0; gy < g.h; gy++) {
      for (let gx = 0; gx < g.w; gx++) {
        if (!G(gx, gy)) continue;
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const ox = G(gx + dx, gy);
          const oy = G(gx, gy + dy);
          const dg = G(gx + dx, gy + dy);
          const cxp = gx * s + (dx > 0 ? s - 1 : 0);
          const cyp = gy * s + (dy > 0 ? s - 1 : 0);
          if (!ox && !oy && !dg) set(cxp, cyp, 0);
          else if (!ox && !oy && dg) {
            const bx = dx > 0 ? (gx + 1) * s : gx * s - 1;
            const by = dy > 0 ? (gy + 1) * s : gy * s - 1;
            for (let a = 0; a <= k; a++) {
              for (let b = 0; a + b <= k; b++) {
                set(bx + dx * a, cyp - dy * b, 1);
                set(cxp - dx * a, by + dy * b, 1);
              }
            }
          }
        }
      }
    }
  }
  return { w, h, m };
}

/**
 * One lettering sprite. Style: face (gradient stops, top to bottom), sharp,
 * hi (top edge), lo (bottom edge), ext (extrusion depth) + extC, out
 * (outline), glow { r, color, a }.
 */
function titleSprite(text, s, st) {
  const M = bigMask(text, s);
  const ext = st.ext || 0;
  const gl = st.glow ? st.glow.r : 0;
  const pad = 1 + gl;
  const w = M.w + pad * 2 + ext;
  const h = M.h + pad * 2 + ext;
  const px = new Uint32Array(w * h);
  const occ = new Uint8Array(w * h);
  const mm = (x, y) => (x >= 0 && y >= 0 && x < M.w && y < M.h ? M.m[y * M.w + x] : 0);
  for (let d = ext; d >= 1; d--) {
    const c = u32(st.extC[min(st.extC.length - 1, floor(((d - 1) / ext) * st.extC.length))]);
    for (let y = 0; y < M.h; y++) {
      for (let x = 0; x < M.w; x++) {
        if (!M.m[y * M.w + x]) continue;
        const i = (y + pad + d) * w + x + pad + d;
        px[i] = c;
        occ[i] = 1;
      }
    }
  }
  const stops = st.face.map((c) => u32(c));
  const n = stops.length - 1;
  const sharp = st.sharp ?? 2;
  const hi = st.hi ? u32(st.hi) : 0;
  const lo = st.lo ? u32(st.lo) : 0;
  const capH = 7 * s;
  for (let y = 0; y < M.h; y++) {
    for (let x = 0; x < M.w; x++) {
      if (!M.m[y * M.w + x]) continue;
      let c;
      if (hi && !mm(x, y - 1)) c = hi;
      else if (lo && !mm(x, y + 1)) c = lo;
      else if (n === 0) c = stops[0];
      else {
        const p = clamp((y / (capH - 1)) * n, 0, n);
        const k = min(n - 1, floor(p));
        const f = clamp((p - k - 0.5) * sharp + 0.5, 0, 1);
        c = f > bayer(x, y) ? stops[k + 1] : stops[k];
      }
      const i = (y + pad) * w + x + pad;
      px[i] = c;
      occ[i] = 2;
    }
  }
  const near = (o, x, y) => (x > 0 && o[y * w + x - 1]) || (x < w - 1 && o[y * w + x + 1]) || (y > 0 && o[(y - 1) * w + x]) || (y < h - 1 && o[(y + 1) * w + x]);
  if (st.out) {
    const oc = u32(st.out);
    const o = occ.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!o[i] && near(o, x, y)) {
          px[i] = oc;
          occ[i] = 3;
        }
      }
    }
  }
  for (let k = 1; k <= gl; k++) {
    const c = u32(st.glow.color, round(st.glow.a * 255 * (1 - (k - 1) / (gl + 0.5))));
    const o = occ.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!o[i] && near(o, x, y)) {
          px[i] = c;
          occ[i] = 4;
        }
      }
    }
  }
  const face = new Uint32Array(w * h);
  for (let i = 0; i < w * h; i++) if (occ[i] === 2) face[i] = 0xffffffff;
  return { cv: toCanvas(px, w, h), fm: toCanvas(face, w, h), px, w, h, pad, dis: [] };
}

/** Per-letter layout of a title at scale s, plus a composited full sprite. */
function titleSet(text, s, st) {
  return cached(`T|${st.id}|${s}|${text}`, () => {
    const letters = [];
    let pen = 0;
    for (const ch of normalizeText(text)) {
      if (ch === ' ') {
        pen += 3 * s;
        continue;
      }
      const spr = cached(`L|${st.id}|${s}|${ch}`, () => titleSprite(ch, s, st));
      letters.push({ ch, x: pen, spr, i: letters.length, cw: measureText(ch, 1) * s });
      pen += (measureText(ch, 1) + 1) * s;
    }
    const fw = max(0, pen - s);
    const ext = st.ext || 0;
    const pad = 1 + (st.glow ? st.glow.r : 0);
    const w = fw + pad * 2 + ext;
    const h = 7 * s + pad * 2 + ext;
    const full = mk(w, h);
    const fm = mk(w, h);
    for (const L of letters) {
      full.getContext('2d').drawImage(L.spr.cv, L.x, 0);
      fm.getContext('2d').drawImage(L.spr.fm, L.x, 0);
    }
    return { text, s, letters, fw, fh: 7 * s, pad, ext, w, h, full, fm, tints: new Map(), tmp: null };
  });
}

/** Draw a title with its face's top-left at (x, y). */
function drawTitle(ctx, T, x, y) {
  ctx.drawImage(T.full, round(x) - T.pad, round(y) - T.pad);
}
function drawLetter(ctx, T, L, x, y, img = L.spr.cv) {
  ctx.drawImage(img, round(x + L.x) - T.pad, round(y) - T.pad);
}
/** Solid silhouette of a title in one colour (for RGB split / flashes). */
function tintOf(T, color) {
  let c = T.tints.get(color);
  if (!c) {
    c = mk(T.w, T.h);
    const cx = c.getContext('2d');
    cx.drawImage(T.full, 0, 0);
    cx.globalCompositeOperation = 'source-in';
    cx.fillStyle = color;
    cx.fillRect(0, 0, T.w, T.h);
    T.tints.set(color, c);
  }
  return c;
}
/** Diagonal light band across the title's face pixels; p runs 0..1. */
function glint(ctx, T, x, y, p, width = 5, color = P.white) {
  if (p < 0 || p > 1) return;
  if (!T.tmp) T.tmp = mk(T.w, T.h);
  const c = T.tmp.getContext('2d');
  c.globalCompositeOperation = 'source-over';
  c.clearRect(0, 0, T.w, T.h);
  const span = T.w + T.h + width * 2 + 4;
  const head = round(easeInOut(p) * span) - T.h - width - 2;
  c.fillStyle = color;
  for (let yy = 0; yy < T.h; yy++) {
    const xx = head + (T.h - yy);
    c.fillRect(xx, yy, width, 1);
    c.fillRect(xx - 3, yy, 1, 1);
  }
  c.globalCompositeOperation = 'destination-in';
  c.drawImage(T.fm, 0, 0);
  c.globalCompositeOperation = 'source-over';
  ctx.drawImage(T.tmp, round(x) - T.pad, round(y) - T.pad);
}
/** A letter sprite with only the pixels whose Bayer rank is below k (0..16). */
function dissolved(spr, k) {
  k = clamp(round(k), 0, 16);
  if (k >= 16) return spr.cv;
  let c = spr.dis[k];
  if (!c) {
    const out = new Uint32Array(spr.px.length);
    for (let y = 0; y < spr.h; y++) {
      for (let x = 0; x < spr.w; x++) {
        if (BAYER[((y & 3) << 2) | (x & 3)] < k) out[y * spr.w + x] = spr.px[y * spr.w + x];
      }
    }
    c = toCanvas(out, spr.w, spr.h);
    spr.dis[k] = c;
  }
  return c;
}
/** Largest scale (maxS..minS) at which text fits maxW. */
function fitScale(text, maxW, maxS = 4, minS = 2) {
  for (let s = maxS; s > minS; s--) if (measureText(text, s) <= maxW) return s;
  return minS;
}

// ---------------------------------------------------------------------------
// Shared lockup pieces: credits line and the channel bug

function nameList(list) {
  const a = (Array.isArray(list) ? list : []).map((n) => String(n ?? '').trim().toUpperCase()).filter(Boolean);
  if (!a.length) return '';
  if (a.length === 1) return a[0];
  return `${a.slice(0, -1).join(', ')} & ${a[a.length - 1]}`;
}
function ellipsize(text, maxW, scale = 1) {
  if (measureText(text, scale) <= maxW) return text;
  let s = text;
  while (s.length > 1 && measureText(`${s}...`, scale) > maxW) s = s.slice(0, -1);
  return `${s.trimEnd()}...`;
}
/** Up to two lines that fit maxW (the last one ellipsised). */
function fitLines(text, maxW, maxLines = 2) {
  return cached(`FL|${maxW}|${maxLines}|${text}`, () => {
    const lines = wrapText(String(text ?? ''), maxW, 1);
    if (lines.length > maxLines) {
      lines.length = maxLines;
      lines[maxLines - 1] += '...';
    }
    return lines.map((l) => ellipsize(l, maxW));
  });
}
/** "WITH NAME & NAME", fitted. Returns { label, names, w } or null. */
function credits(info, maxW) {
  const names = nameList(info.presenters);
  if (!names) return null;
  return cached(`CR|${maxW}|${names}`, () => {
    const lw = measureText('WITH ', 1) + 3;
    const n = ellipsize(names, maxW - lw);
    return { label: 'WITH', names: n, w: lw + measureText(n, 1) };
  });
}
/** Draw the credits line (label + names), typed on with p. */
function drawCredits(ctx, cr, x, y, p, labelC, nameC, shadow = null) {
  if (!cr || p <= 0) return;
  const full = `${cr.label} ${cr.names}`;
  const shown = typed(full, p);
  const lab = shown.slice(0, cr.label.length);
  drawText(ctx, lab, x, y, { color: labelC, shadow });
  if (shown.length > cr.label.length + 1) {
    drawText(ctx, shown.slice(cr.label.length + 1), x + measureText(`${cr.label} `, 1) + 3, y, { color: nameC, shadow });
  }
}

let BUG = { w: 74, h: 13 };
/** The GLOBIT 24 bug, wiped on from the left with a red leading edge. */
function drawBug(ctx, x, y, p, t) {
  if (p <= 0) return;
  const vis = round((BUG.w + 3) * easeOut(p));
  ctx.save();
  clipRect(ctx, x - 1, y - 1, vis, BUG.h + 2);
  try {
    const s = drawLogo(ctx, x, y, { variant: 'bug', scale: 1, t, align: 'left' });
    if (s && s.w > 0 && s.h > 0) BUG = { w: s.w, h: s.h };
  } catch {
    r(ctx, x, y, 74, 13, P.black);
    r(ctx, x + 56, y + 1, 17, 11, P.red);
    drawText(ctx, 'GLOBIT', x + 4, y + 3, { color: P.white });
    drawText(ctx, '24', x + 59, y + 3, { color: P.white });
  }
  ctx.restore();
  if (p < 1) r(ctx, x - 1 + vis, y - 1, 2, BUG.h + 2, P.red);
}
const bugX = () => W - 14 - BUG.w;
const bugY = () => H - 13 - BUG.h;

// Real local times (formatters are created once per zone; text refreshed per second)
const FMT = new Map();
const TIMES = new Map();
function cityTime(tz) {
  const sec = floor(Date.now() / 1000);
  const c = TIMES.get(tz);
  if (c && c.sec === sec) return c.label;
  let label = '--:--';
  try {
    let f = FMT.get(tz);
    if (!f) {
      f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      FMT.set(tz, f);
    }
    const parts = f.formatToParts(new Date());
    const hh = parts.find((q) => q.type === 'hour')?.value ?? '00';
    const mi = parts.find((q) => q.type === 'minute')?.value ?? '00';
    label = `${hh === '24' ? '00' : hh}:${mi}`;
  } catch { /* unknown zone */ }
  TIMES.set(tz, { sec, label });
  return label;
}

// ===========================================================================
// WORLD NOW — flagship: a dot-matrix globe, red brand bars, world clocks
// ===========================================================================

const WN_BPM = 135;
const WN_B = 60 / WN_BPM;
const WN_HIT = 2 * WN_B; // globe pushes in
const WN_SLAM = 6 * WN_B; // title slams into the band
const WN_SPIN = 2.5;
const WN_ZOOM = [[0, 64], [0.034, 74], [0.067, 84], [0.1, 90], [0.15, 88], [0.21, 86], [0.28, 84]];
const WN_BAND = { y: 78, h: 36, end: 250 };

const WN_TUNE = {
  bpm: WN_BPM,
  wave: 'square',
  // brass-like fanfare in D minor, resolving to a bright D major chord
  notes: 'R:2 D4+A4+D5:1 F5:0.5 E5:0.5 D5:0.75 A4:0.25 C5:0.5 D5:0.5 D5+A5:1.5 G5:0.25 F5:0.25 E5:0.5 G5:0.5 A5:0.5 D5+F#5+A5+D6:2',
  // timpani roll, then pounding low strokes
  bass: 'D2:0.25 D2:0.25 D2:0.25 D2:0.25 D2:0.25 D2:0.25 D2:0.25 D2:0.25 D2:1 A1:0.5 A1:0.5 D2:0.5 R:0.5 F2:0.5 C2:0.5 D2:1.5 G1:0.5 C2:0.5 A1:0.5 A1:0.25 A1:0.25 D2:2',
  bassWave: 'triangle',
  drums: 'S:0.25 S:0.25 S:0.25 S:0.25 S:0.25 S:0.25 S:0.25 S:0.25 K:1 H:0.5 K:0.5 S:0.5 H:0.5 K:0.5 S:0.25 S:0.25 K:1 S:0.5 K:0.5 K:0.5 S:0.5 S:0.25 S:0.25 K:2',
};

const WN_CITIES = [
  ['LONDON', 51.5, -0.1, 'Europe/London'],
  ['NEW YORK', 40.7, -74.0, 'America/New_York'],
  ['TOKYO', 35.7, 139.7, 'Asia/Tokyo'],
  ['SYDNEY', -33.9, 151.2, 'Australia/Sydney'],
  ['DUBAI', 25.2, 55.3, 'Asia/Dubai'],
  ['NAIROBI', -1.3, 36.8, 'Africa/Nairobi'],
  ['SAO PAULO', -23.5, -46.6, 'America/Sao_Paulo'],
  ['NEW DELHI', 28.6, 77.2, 'Asia/Kolkata'],
  ['BEIJING', 39.9, 116.4, 'Asia/Shanghai'],
  ['MOSCOW', 55.8, 37.6, 'Europe/Moscow'],
  ['PARIS', 48.9, 2.35, 'Europe/Paris'],
  ['LOS ANGELES', 34.1, -118.2, 'America/Los_Angeles'],
  ['CAIRO', 30.0, 31.2, 'Africa/Cairo'],
  ['MEXICO CITY', 19.4, -99.1, 'America/Mexico_City'],
  ['LAGOS', 6.5, 3.4, 'Africa/Lagos'],
  ['SINGAPORE', 1.35, 103.8, 'Asia/Singapore'],
  ['HONOLULU', 21.3, -157.9, 'Pacific/Honolulu'],
  ['BUENOS AIRES', -34.6, -58.4, 'America/Argentina/Buenos_Aires'],
  ['ANCHORAGE', 61.2, -149.9, 'America/Anchorage'],
];
const WN_ARCS = ['NEW YORK', 'SAO PAULO', 'LAGOS', 'NAIROBI', 'DUBAI', 'NEW DELHI', 'MOSCOW'];

// --- the globe: real coastlines (Natural Earth mask) on a 512x256 texture --

const GTW = 512;
const GTH = 256;
const G_TILT = 22 * DEG;
const G_CT = cos(G_TILT);
const G_ST = sin(G_TILT);
const G_L = (() => {
  const v = [-0.52, 0.5, 0.69];
  const n = Math.hypot(...v);
  return v.map((a) => a / n);
})();
let GTEX = null;

/** Equirectangular texture: bit0 land, bit1 graticule, bit2 equator. */
function globeTex() {
  if (GTEX) return GTEX;
  const tex = new Uint8Array(GTW * GTH);
  try {
    const bin = atob(LAND.rle);
    const SW = LAND.w;
    const SH = LAND.h;
    const fx = SW / GTW;
    const fy = SH / GTH;
    const cov = new Float32Array(GTW);
    const thr = fx * fy * 0.5;
    let p = 0;
    for (let j = 0; j < SH && p < bin.length; j++) {
      let x = 0;
      let cur = 0;
      while (x < SW && p < bin.length) {
        let run = 0;
        let shift = 0;
        let b;
        do {
          b = bin.charCodeAt(p++);
          run |= (b & 127) << shift;
          shift += 7;
        } while (b & 128 && p < bin.length);
        if (cur && run > 0) {
          const e = min(SW, x + run);
          const i0 = floor(x / fx);
          const i1 = floor((e - 1) / fx);
          if (i0 === i1) cov[i0] += e - x;
          else {
            cov[i0] += (i0 + 1) * fx - x;
            for (let i = i0 + 1; i < i1; i++) cov[i] += fx;
            cov[i1] += e - i1 * fx;
          }
        }
        x += run;
        cur ^= 1;
      }
      if ((j + 1) % fy === 0) {
        const row = ((j + 1) / fy - 1) * GTW;
        for (let i = 0; i < GTW; i++) {
          tex[row + i] = cov[i] > thr ? 1 : 0;
          cov[i] = 0;
        }
      }
    }
  } catch { /* no land data: an ocean world */ }
  for (const lat of [-60, -30, 30, 60]) {
    const j = clamp(round(((90 - lat) / 180) * GTH - 0.5), 0, GTH - 1);
    for (let i = 0; i < GTW; i++) tex[j * GTW + i] |= 2;
  }
  for (let i = 0; i < GTW; i++) tex[127 * GTW + i] |= 4;
  for (let lon = -180; lon < 180; lon += 30) {
    const i = ((round(((lon + 180) / 360) * GTW) % GTW) + GTW) % GTW;
    for (let j = 8; j < GTH - 8; j++) tex[j * GTW + i] |= 2;
  }
  GTEX = tex;
  return tex;
}

// colour per texel type (8) x pixel class (16): lvl*2 + dot, 10 rim lit, 11 rim dark
const WN_LUT = (() => {
  const L = new Uint32Array(128);
  const ocean = [[P.black, P.black], [P.black, P.ink], [P.ink, P.ink], [P.ink, P.navy], [P.navy, P.blue]];
  const land = [[P.ink, P.slate], [P.slate, P.steel], [P.slate, P.fog], [P.steel, P.silver], [P.fog, P.white]];
  const grid = [[P.ink, P.ink], [P.ink, P.navy], [P.navy, P.navy], [P.navy, P.blue], [P.blue, P.blue]];
  const equ = [[P.maroon, P.maroon], [P.maroon, P.darkRed], [P.darkRed, P.red], [P.red, P.red], [P.red, P.pink]];
  for (let tv = 0; tv < 8; tv++) {
    for (let lvl = 0; lvl < 5; lvl++) {
      for (let dot = 0; dot < 2; dot++) {
        const set = tv & 4 ? equ : tv & 1 ? land : tv & 2 ? grid : ocean;
        L[(tv << 4) | (lvl * 2 + dot)] = u32(set[lvl][dot]);
      }
    }
    L[(tv << 4) | 10] = u32(tv & 1 ? P.white : P.cyan);
    L[(tv << 4) | 11] = u32(tv & 1 ? P.slate : P.navy);
  }
  return L;
})();

const GTABLES = new Map();
function globeTable(R) {
  let T = GTABLES.get(R);
  if (T) return T;
  const M = 4;
  const S = 2 * R + 1 + 2 * M;
  const c = R + M;
  const cv = mk(S, S);
  const cx = cv.getContext('2d');
  const img = cx.createImageData(S, S);
  const buf = new Uint32Array(img.data.buffer);
  const idx = [];
  const row = [];
  const lon = [];
  const cls = [];
  const RR = R + 0.5;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x - c;
      const dy = y - c;
      const d2 = dx * dx + dy * dy;
      const i = y * S + x;
      const nx = dx / RR;
      const ny = -dy / RR;
      if (d2 <= RR * RR) {
        const nz = sqrt(max(0, 1 - nx * nx - ny * ny));
        const gy = ny * G_CT + nz * G_ST;
        const gz = -ny * G_ST + nz * G_CT;
        const la = Math.asin(clamp(gy, -1, 1)) / DEG;
        const lo = Math.atan2(nx, gz) / DEG;
        idx.push(i);
        row.push(clamp(floor(((90 - la) / 180) * GTH), 0, GTH - 1) * GTW);
        lon.push(((lo + 180) / 360) * GTW);
        const dif = nx * G_L[0] + ny * G_L[1] + nz * G_L[2];
        let k;
        if (sqrt(d2) > RR - 1.1) k = dif > 0.02 ? 10 : 11;
        else {
          const v = clamp((dif + 0.12) * 3.1, 0, 3.999);
          let lvl = floor(v) + (v - floor(v) > bayer(x, y) ? 1 : 0);
          if (dif > 0.965) lvl = 4;
          lvl = min(4, lvl);
          k = lvl * 2 + ((x & 1) === 0 && (y & 1) === 0 ? 1 : 0);
        }
        cls.push(k);
      } else {
        // atmosphere halo, brighter on the lit limb
        const d = sqrt(d2) - RR;
        const lit = nx * G_L[0] + ny * G_L[1] > 0.05;
        let col = 0;
        if (d < 1.2) col = lit ? u32(P.cyan, 150) : u32(P.blue, 70);
        else if (d < 2.4) col = lit ? u32(P.blue, 90) : u32(P.navy, 70);
        else if (d < 3.6 && lit) col = u32(P.navy, 80);
        buf[i] = col;
      }
    }
  }
  T = { cv, cx, img, buf, c, S, idx: Int32Array.from(idx), row: Int32Array.from(row), lon: Float32Array.from(lon), cls: Uint8Array.from(cls) };
  GTABLES.set(R, T);
  return T;
}

/** Render the globe centred on (x, y); lam0 = longitude at the centre. */
function drawGlobeWN(ctx, x, y, R, lam0) {
  const T = globeTable(R);
  const tex = globeTex();
  const sh = (((lam0 / 360) * GTW) % GTW) + GTW * 16;
  const { idx, row, lon, cls, buf } = T;
  const n = idx.length;
  for (let k = 0; k < n; k++) {
    const i = ((lon[k] + sh) | 0) & (GTW - 1);
    buf[idx[k]] = WN_LUT[(tex[row[k] + i] << 4) | cls[k]];
  }
  T.cx.putImageData(T.img, 0, 0);
  ctx.drawImage(T.cv, round(x) - T.c, round(y) - T.c);
}

/** Earth-frame unit vector for a lat/lon. */
const evec = (lat, lon) => [cos(lat * DEG) * sin(lon * DEG), sin(lat * DEG), cos(lat * DEG) * cos(lon * DEG)];
/** Project an earth-frame vector (any length) for centre longitude lam0. */
function gproj(v, lam0, R, out) {
  const cl = cos(lam0 * DEG);
  const sl = sin(lam0 * DEG);
  const x = v[0] * cl - v[2] * sl;
  const z = v[0] * sl + v[2] * cl;
  const vy = v[1] * G_CT - z * G_ST;
  const vz = v[1] * G_ST + z * G_CT;
  const RR = R + 0.5;
  out[0] = x * RR;
  out[1] = -vy * RR;
  out[2] = vz;
  out[3] = x * x + vy * vy;
  return out;
}

function wnLambda(dt) {
  return dt < WN_SPIN ? 470 * (1 - seg(dt, 0, WN_SPIN)) ** 3 : -2.2 * (dt - WN_SPIN);
}
function wnRadius(dt) {
  if (dt < WN_HIT) return 52;
  let R = 84;
  for (const [k, v] of WN_ZOOM) if (dt - WN_HIT >= k) R = v;
  return R;
}
function wnPos(dt) {
  const k = easeInOut(seg(dt, 2.26, 0.42));
  return [round(lerp(192, 280, k)), round(lerp(108, 100, k))];
}

/** City-flick events: whichever city crosses the centre meridian while the globe spins. */
const wnEvents = () => cached('wnEvents', () => {
  const ev = [];
  let last = -1;
  for (let dt = 0; dt <= WN_SPIN; dt += 1 / 240) {
    const lam = wnLambda(dt);
    let best = -1;
    let bd = 13;
    WN_CITIES.forEach(([, , lon], i) => {
      const d = abs(wrap180(lon - lam));
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    if (best >= 0 && best !== last) {
      ev.push({ t: dt, c: best });
      last = best;
    }
  }
  return ev;
});

const wnArcs = () => cached('wnArcs', () => {
  const a = evec(51.5, -0.1);
  return WN_ARCS.map((name, k) => {
    const city = WN_CITIES.find((c) => c[0] === name);
    const b = evec(city[1], city[2]);
    const om = Math.acos(clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1));
    const n = max(16, round((om / DEG) * 1.3));
    const lift = min(0.24, 0.07 + om * 0.13);
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const s = i / n;
      const ka = sin((1 - s) * om) / sin(om);
      const kb = sin(s * om) / sin(om);
      const h = 1 + lift * sin(Math.PI * s);
      pts.push([(a[0] * ka + b[0] * kb) * h, (a[1] * ka + b[1] * kb) * h, (a[2] * ka + b[2] * kb) * h]);
    }
    return { pts, end: b, k };
  });
});

const wnBg = () => cached('wnBg', () => {
  const p = new Pix(W, H);
  const stops = [P.navy, P.ink, P.black, P.black].map((c) => u32(c));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.hypot((x - 262) * 0.75, y - 104) / 180;
      const pos = clamp(d * 2.6 - 0.25, 0, 2.999);
      const k = floor(pos);
      const f = clamp((pos - k - 0.5) * 1.6 + 0.5, 0, 1);
      let c = f > bayer(x, y) ? stops[k + 1] : stops[k];
      if (x % 6 === 3 && y % 6 === 3) c = k < 1 ? u32(P.blue) : k < 2 ? u32(P.navy) : u32(P.ink);
      p.d[y * W + x] = c;
    }
  }
  return p.canvas();
});

const WN_BARS = [
  { y: 92, h: 26, c: 'red', s: 0.04, d: 0.44, len: 470 },
  { y: 82, h: 6, c: 'darkRed', s: 0.1, d: 0.4, len: 230 },
  { y: 124, h: 3, c: 'pink', s: 0.15, d: 0.36, len: 150 },
  { y: 34, h: 12, c: 'red', s: 0.22, d: 0.44, len: 280 },
  { y: 158, h: 16, c: 'darkRed', s: 0.28, d: 0.46, len: 330 },
  { y: 186, h: 4, c: 'white', s: 0.38, d: 0.32, len: 120 },
  { y: 56, h: 3, c: 'pink', s: 0.44, d: 0.3, len: 100 },
  { y: 140, h: 7, c: 'red', s: 0.5, d: 0.36, len: 180 },
];
const BAR_COLORS = {
  red: [P.pink, P.red, P.darkRed],
  darkRed: [P.red, P.darkRed, P.maroon],
  pink: [P.white, P.pink, P.red],
  white: [P.white, P.white, P.silver],
  yellow: [P.cream, P.yellow, P.orange],
  black: [P.ink, P.black, P.black],
};
/** Slanted bar sprite ("/" ends), lit top row and shaded bottom rows. */
function barSprite(len, h, color) {
  return cached(`bar|${len}|${h}|${color}`, () => {
    const [hi, mid, lo] = BAR_COLORS[color] || [color, color, color];
    const p = new Pix(len + h, h);
    for (let y = 0; y < h; y++) {
      const c = h > 3 && y === 0 ? hi : h > 6 && y >= h - 2 ? lo : mid;
      p.rect(h - 1 - y, y, len, 1, c);
    }
    return p.canvas();
  });
}
function barX(b, dt) {
  const p = seg(dt, b.s, b.d);
  return round(-b.len - b.h + (W + b.len + b.h * 2) * easeInOut(p));
}

function wnBandShape(ctx, y, h, flash) {
  const { end } = WN_BAND;
  for (let yy = 0; yy < h; yy++) {
    const x1 = end + ((h - 1 - yy) >> 1) - (h >> 2);
    const c = flash === 1 ? P.white : flash === 2 ? P.pink : yy === 0 ? P.pink : yy >= h - 3 && h > 8 ? P.darkRed : P.red;
    r(ctx, 0, y + yy, x1, 1, c);
    if (h > 8) {
      r(ctx, x1 + 6, y + yy, 4, 1, P.red);
      r(ctx, x1 + 14, y + yy, 2, 1, P.darkRed);
    }
  }
}

function drawWorldNow(ctx, t, dt, info) {
  const [sx, sy] = (() => {
    const a = shake(dt, WN_SLAM, 0.32, 3.5);
    const b = shake(dt, WN_HIT, 0.2, 2);
    return [a[0] + b[0], a[1] + b[1]];
  })();
  ctx.save();
  ctx.translate(sx, sy);
  r(ctx, -6, -6, W + 12, H + 12, P.black);

  const lam = wnLambda(dt);
  const R = wnRadius(dt);
  const [gx, gy] = wnPos(dt);
  const bar0 = WN_BARS[0];
  const reveal = dt < bar0.s + bar0.d ? clamp(barX(bar0, dt), 0, W) : W;

  // red hairline before the first bar
  if (dt < bar0.s + 0.25) {
    const lw = round(W * easeOut(seg(dt, 0, 0.14)));
    r(ctx, (W - lw) >> 1, 104, lw, 1, P.red);
    if (lw > 4) r(ctx, (W >> 1) - 1, 103, 3, 3, P.pink);
  }

  if (reveal > 0) {
    ctx.save();
    if (reveal < W) clipRect(ctx, 0, -6, reveal, H + 12);
    ctx.drawImage(wnBg(), 0, 0);
    wnStreaks(ctx, dt);
    // shockwave when the globe pushes in
    const sw = seg(dt, WN_HIT, 0.42);
    if (sw > 0 && sw < 1) {
      const rr = round(R + 6 + 90 * easeOut(sw));
      ring(ctx, gx, gy, rr, P.cyan, 1 - sw);
      ring(ctx, gx, gy, rr - 3, P.blue, (1 - sw) * 0.6);
    }
    drawGlobeWN(ctx, gx, gy, R, lam);
    if (dt >= WN_HIT && dt < WN_HIT + 0.07) ring(ctx, gx, gy, R + 1, P.white, 1);
    wnPings(ctx, dt, gx, gy, R, lam);
    wnArcsDraw(ctx, dt, gx, gy, R, lam);
    wnPanel(ctx, dt);
    ctx.restore();
  }

  // the sweeping brand bars
  for (const b of WN_BARS) {
    const p = seg(dt, b.s, b.d);
    if (p <= 0 || p >= 1) continue;
    ctx.drawImage(barSprite(b.len, b.h, b.c), barX(b, dt), b.y);
  }

  wnLockup(ctx, t, dt, info);
  ctx.restore();
}

function wnStreaks(ctx, dt) {
  // slow light streaks drifting through the background
  for (let i = 0; i < 7; i++) {
    const speed = 18 + hash(i * 3) * 40;
    const len = 20 + floor(hash(i * 5 + 1) * 60);
    const y = 10 + floor(hash(i * 7 + 2) * 190);
    const x = floor((dt * speed + hash(i) * 600) % (W + len + 40)) - len - 20;
    r(ctx, x, y, len, 1, rgba(i % 3 ? P.navy : P.blue, 0.7));
    r(ctx, x + len - 3, y, 3, 1, rgba(P.cyan, 0.5));
  }
}

function wnPings(ctx, dt, gx, gy, R, lam) {
  const ev = wnEvents();
  const tmp = [0, 0, 0, 0];
  for (let k = ev.length - 1; k >= 0; k--) {
    const e = ev[k];
    if (e.t > dt) continue;
    const age = dt - e.t;
    if (age > 0.7) break;
    const c = WN_CITIES[e.c];
    gproj(evec(c[1], c[2]), lam, R, tmp);
    if (tmp[2] < 0.1) continue;
    const x = round(gx + tmp[0]);
    const y = round(gy + tmp[1]);
    const u = age / 0.7;
    ring(ctx, x, y, 1 + round(easeOut(u) * 8), P.red, 1 - u);
    if (u < 0.6) ring(ctx, x, y, 1 + round(easeOut(u) * 4), P.pink, 1 - u);
    r(ctx, x, y, 1, 1, P.white);
  }
}

function wnArcsDraw(ctx, dt, gx, gy, R, lam) {
  const start = 2.72;
  if (dt < start) return;
  const arcs = wnArcs();
  const tmp = [0, 0, 0, 0];
  for (const a of arcs) {
    const p = easeOut(seg(dt, start + a.k * 0.08, 0.5));
    if (p <= 0) continue;
    const n = a.pts.length - 1;
    const upto = round(n * p);
    const head = p < 1 ? upto : floor(((dt - start) * 0.55 + a.k * 0.37) % 1.4 * n);
    for (let i = 0; i <= upto; i++) {
      gproj(a.pts[i], lam, R, tmp);
      if (tmp[2] < 0 && tmp[3] < 1.0) continue;
      const x = round(gx + tmp[0]);
      const y = round(gy + tmp[1]);
      const dh = head - i;
      if (dh >= 0 && dh < 3) r(ctx, x, y, 1, 1, dh === 0 ? P.white : P.pink);
      else if ((i & 1) === 0) r(ctx, x, y, 1, 1, tmp[2] < 0 ? P.darkRed : P.red);
    }
    if (p >= 1) {
      gproj(a.end, lam, R, tmp);
      if (tmp[2] > 0.05) {
        const x = round(gx + tmp[0]);
        const y = round(gy + tmp[1]);
        r(ctx, x - 1, y, 3, 1, P.red);
        r(ctx, x, y - 1, 1, 3, P.red);
        r(ctx, x, y, 1, 1, P.white);
        const u = every(dt, start + 0.6 + a.k * 0.31, 2.2, 0.6);
        if (u >= 0) ring(ctx, x, y, 2 + round(u * 6), P.red, 1 - u);
      }
    }
  }
  // the studio: London
  gproj(evec(51.5, -0.1), lam, R, tmp);
  if (tmp[2] > 0) {
    const x = round(gx + tmp[0]);
    const y = round(gy + tmp[1]);
    r(ctx, x - 1, y - 1, 3, 3, floor(dt * 3) % 2 ? P.white : P.red);
  }
}

function wnPanel(ctx, dt) {
  const pin = seg(dt, 0.95, 0.3);
  const pout = seg(dt, 2.2, 0.22);
  if (pin <= 0 || pout >= 1) return;
  const ev = wnEvents();
  let cur = -1;
  for (let k = 0; k < ev.length; k++) if (ev[k].t <= dt) cur = k;
  if (cur < 0) return;
  const x = 112;
  const w = 160;
  const y = round(164 + (1 - easeOutBack(pin, 1.4)) * 60 + easeIn(pout) * 60);
  r(ctx, x, y, w, 32, P.black);
  r(ctx, x, y, w, 1, P.slate);
  r(ctx, x, y, 4, 32, P.red);
  r(ctx, x + 4, y, 1, 32, P.darkRed);
  r(ctx, x + 10, y + 21, w - 18, 1, P.ink);
  const e = ev[cur];
  const prev = cur > 0 ? ev[cur - 1] : null;
  const roll = easeOut(seg(dt, e.t, 0.07));
  ctx.save();
  clipRect(ctx, x + 6, y + 2, w - 8, 18);
  const name = WN_CITIES[e.c][0];
  drawText(ctx, name, x + 11, y + 5 + round((1 - roll) * 16), { color: P.white, scale: 2 });
  if (prev && roll < 1) drawText(ctx, WN_CITIES[prev.c][0], x + 11, y + 5 - round(roll * 16), { color: P.fog, scale: 2 });
  ctx.restore();
  drawText(ctx, 'LOCAL TIME', x + 11, y + 24, { color: P.fog });
  drawText(ctx, cityTime(WN_CITIES[e.c][3]), x + w - 8, y + 24, { color: P.yellow, align: 'right' });
}

function wnLockup(ctx, t, dt, info) {
  const { y: BY, h: BH } = WN_BAND;
  const T = titleSet(info.title, fitScale(info.title, 226), ST_WN);
  const ty = BY + ((BH - T.fh) >> 1);
  const tx = 20;

  // tagline tab drops out from under the band
  const tp = easeOut(seg(dt, 2.86, 0.24));
  if (tp > 0) {
    const line = fitLines(info.tagline, 300, 1)[0] || '';
    const tw = measureText(line) + 34;
    const yy = round(BY + BH - 16 + tp * 20);
    r(ctx, 0, yy, tw, 15, P.black);
    r(ctx, 0, yy + 15, tw, 1, P.navy);
    r(ctx, tw, yy, 2, 16, P.red);
    r(ctx, 16, yy + 6, 3, 3, P.red);
    drawText(ctx, line, 24, yy + 4, { color: P.white });
  }

  // band: a white line draws, then opens with overshoot
  const lp = seg(dt, 2.3, 0.2);
  const op = seg(dt, 2.48, 0.18);
  if (lp > 0) {
    if (op <= 0) {
      const lw = round((WN_BAND.end + 4) * easeOut(lp));
      r(ctx, 0, BY + (BH >> 1) - 1, lw, 2, P.white);
      r(ctx, lw - 3, BY + (BH >> 1) - 2, 3, 4, P.white);
    } else {
      const hh = max(2, round(BH * easeOutBack(op, 2.2)));
      const flash = dt >= WN_SLAM && dt < WN_SLAM + 0.034 ? 1 : dt >= WN_SLAM + 0.034 && dt < WN_SLAM + 0.07 ? 2 : 0;
      wnBandShape(ctx, BY + ((BH - hh) >> 1), hh, flash);
      // band accents: thin bars above and below
      const ap = easeOut(seg(dt, 2.58, 0.3));
      r(ctx, 0, BY - 5, round(96 * ap), 2, P.red);
      r(ctx, 0, BY + BH + 1, round(210 * ap), 1, P.darkRed);
      // light sweep across the band
      const sp = every(dt, 3.1, 3.2, 0.7);
      if (sp >= 0 && op >= 1) {
        ctx.save();
        clipRect(ctx, 0, BY + 1, W, BH - 4);
        const bx = round(lerp(-60, W + 40, easeInOut(sp)));
        for (let yy = 0; yy < BH; yy++) r(ctx, bx + (BH - yy) / 2, BY + yy, 14, 1, rgba(P.white, 0.14));
        ctx.restore();
      }
    }
  }

  // the slam
  const fall = seg(dt, WN_SLAM - 0.16, 0.16);
  if (fall > 0) {
    let y = ty;
    if (dt < WN_SLAM) y = round(lerp(-46, ty, easeIn(fall)));
    else y = ty - round(4 * sin(Math.PI * seg(dt, WN_SLAM, 0.13))) + (dt < WN_SLAM + 0.2 && dt > WN_SLAM + 0.13 ? 1 : 0);
    if (dt < WN_SLAM) {
      // motion trail
      ctx.drawImage(tintOf(T, P.darkRed), tx - T.pad, y - T.pad - 10);
    }
    drawTitle(ctx, T, tx, y);
    if (dt >= WN_SLAM && dt < WN_SLAM + 0.05) ctx.drawImage(tintOf(T, P.white), tx - T.pad, y - T.pad);
    glint(ctx, T, tx, y, seg(dt, 3.15, 0.55), 6);
    const g2 = every(dt, 5.0, 2.6, 0.55);
    if (g2 >= 0) glint(ctx, T, tx, y, g2, 6);
  }
  // impact sparks
  const ip = dt - WN_SLAM;
  if (ip > 0 && ip < 0.5) {
    for (let i = 0; i < 18; i++) {
      const x0 = 24 + hash(i * 13) * (T.fw + 10);
      const vx = (hash(i * 7 + 1) - 0.5) * 140;
      const vy = -60 - hash(i * 5 + 2) * 120;
      const top = i % 2 === 0;
      const x = round(x0 + vx * ip);
      const y = round((top ? BY : BY + BH) + (top ? vy : -vy * 0.4) * ip + 260 * ip * ip);
      const c = i % 3 === 0 ? P.white : i % 3 === 1 ? P.pink : P.yellow;
      if (ip < 0.5 - hash(i) * 0.2) r(ctx, x, y, i % 4 === 0 ? 2 : 1, 1, c);
    }
  }

  // date over the band, credits under it
  const dp = seg(dt, 2.9, 0.3);
  if (dp > 0 && info.date) {
    r(ctx, 20, 64, 3, 3, P.red);
    drawText(ctx, typed(ellipsize(info.date, 220), dp), 27, 62, { color: P.silver });
  }
  const cr = credits(info, 220);
  drawCredits(ctx, cr, 20, 144, seg(dt, 3.02, 0.35), P.fog, P.white);

  // world clocks along the bottom
  const cp = seg(dt, 3.12, 0.3);
  if (cp > 0) {
    ctx.save();
    clipRect(ctx, 0, 190, 20 + round(250 * easeOut(cp)), 14);
    let x = 20;
    for (const i of [0, 1, 2]) {
      const c = WN_CITIES[i];
      r(ctx, x, 197, 2, 2, P.red);
      x += 6;
      x += drawText(ctx, c[0], x, 195, { color: P.fog }) + 4;
      let tm = cityTime(c[3]);
      if (floor(t) % 2) tm = tm.replace(':', ' ');
      x += drawText(ctx, tm, x, 195, { color: P.white }) + 12;
    }
    ctx.restore();
  }
  drawBug(ctx, bugX(), bugY(), seg(dt, 3.22, 0.25), dt - 3.22);
}

const ST_WN = { id: 'wn', face: [P.white, P.white, P.silver, P.silver], sharp: 6, hi: P.white, lo: P.fog, ext: 3, extC: [P.darkRed, P.darkRed, P.maroon], out: P.black };

// ===========================================================================
// TECH BYTES — circuit board, binary rain, the title assembling from bits
// ===========================================================================

const TB_BPM = 150;
const TB_B = 60 / TB_BPM;
const TB_LOCK = 6 * TB_B; // title locks in with a glitch
const CHIP = { x: 66, y: 56, w: 252, h: 64 };
const TB_TAG_Y = 146;
const TB_WITH_Y = 162;

const TB_TUNE = {
  bpm: TB_BPM,
  wave: 'square',
  // boot bleeps, then a driving A minor / F / C / G-E arpeggio
  notes: 'C6:0.125 R:0.375 C6:0.125 R:0.375 G6:0.125 R:0.125 C7:0.25 R:0.5 '
    + 'A4:0.25 C5:0.25 E5:0.25 A5:0.25 C6:0.25 A5:0.25 E5:0.25 C5:0.25 '
    + 'F4:0.25 A4:0.25 C5:0.25 F5:0.25 A5:0.25 F5:0.25 C5:0.25 A4:0.25 '
    + 'C5:0.25 E5:0.25 G5:0.25 C6:0.25 E6:0.25 C6:0.25 G5:0.25 E5:0.25 '
    + 'G4:0.25 B4:0.25 D5:0.25 G5:0.25 B5:0.25 G#5:0.25 B5:0.25 E6:0.25 '
    + 'G#5:0.25 B5:0.25 A4+C5+E5+A5:2',
  bass: 'R:2 A2:0.5 A3:0.5 A2:0.5 A3:0.5 F2:0.5 F3:0.5 F2:0.5 F3:0.5 C3:0.5 C4:0.5 C3:0.5 C4:0.5 G2:0.5 G3:0.5 E2:0.5 E3:0.5 E2:0.25 E2:0.25 A2:2',
  bassWave: 'sawtooth',
  drums: 'R:1.5 H:0.25 H:0.25 '
    + 'K:0.5 H:0.5 S:0.5 H:0.5 K:0.5 H:0.5 S:0.5 H:0.5 K:0.5 H:0.5 S:0.5 H:0.5 K:0.5 H:0.5 S:0.5 H:0.25 H:0.25 '
    + 'S:0.25 S:0.25 K:2',
};

const ST_TB = { id: 'tb', face: [P.white, P.white, P.cyan, P.cyan], sharp: 6, hi: P.white, lo: P.blue, ext: 3, extC: [P.magenta, P.purple, P.purple], out: P.black };

/** Polyline (outer end first) -> flat Int16Array of pixels. */
function polyPix(verts) {
  const out = [];
  for (let k = 1; k < verts.length; k++) {
    const [x0, y0] = verts[k - 1];
    const [x1, y1] = verts[k];
    linePts(x0, y0, x1, y1, (x, y, i) => {
      if (k > 1 && i === 0) return;
      out.push(x, y);
    });
  }
  return Int16Array.from(out);
}

const tbBoard = () => cached('tbBoard', () => {
  const traces = [];
  const pins = [];
  const vias = [];
  const cx = 192;
  const add = (verts, pin, kind, i) => {
    const pts = polyPix(verts);
    const s = kind === 'out' ? 1.05 + hash(i + 300) * 0.3 : 0.3 + hash(i * 3 + 1) * 0.55;
    const d = kind === 'out' ? 0.12 : 0.28 + hash(i * 5 + 2) * 0.24;
    traces.push({ pts, n: pts.length / 2, s, d, pin, kind });
  };
  for (let k = 0; k < 12; k++) {
    for (const side of [-1, 1]) {
      const xp = cx + side * (5 + 10 * k);
      // top: fan out to the frame edge
      const yb = 46 - 3 * k;
      const verts = k === 0
        ? [[xp, -1], [xp, CHIP.y - 7]]
        : [[xp + side * 3 * k, -1], [xp + side * 3 * k, yb - 3 * k], [xp, yb], [xp, CHIP.y - 7]];
      const pin = { x: xp - 1, y: CHIP.y - 6, w: 3, h: 6 };
      pins.push(pin);
      add(verts, pin, 'in', traces.length);
      // bottom: short runs out to vias
      const yv = CHIP.y + CHIP.h + 9 + ((k + (side > 0 ? 1 : 0)) % 3) * 4;
      const bpin = { x: xp - 1, y: CHIP.y + CHIP.h, w: 3, h: 6 };
      pins.push(bpin);
      add([[xp, CHIP.y + CHIP.h + 6], [xp, yv - 2]], bpin, 'out', traces.length);
      vias.push({ x: xp, y: yv, trace: traces.length - 1 });
    }
  }
  for (let k = 0; k < 3; k++) {
    for (const vs of [-1, 1]) {
      const yp = CHIP.y + 32 + vs * (4 + 8 * k);
      for (const side of [-1, 1]) {
        const xEdge = side < 0 ? CHIP.x - 7 : CHIP.x + CHIP.w + 6;
        const xb = side < 0 ? 54 - 3 * k : W - 55 + 3 * k;
        const verts = [[side < 0 ? -1 : W, yp + vs * 3 * k], [xb + side * 3 * k, yp + vs * 3 * k], [xb, yp], [xEdge, yp]];
        const pin = side < 0 ? { x: CHIP.x - 6, y: yp - 1, w: 6, h: 3 } : { x: CHIP.x + CHIP.w, y: yp - 1, w: 6, h: 3 };
        pins.push(pin);
        add(verts, pin, 'in', traces.length);
      }
    }
  }
  return { traces, pins, vias };
});

function tbBoardLayer(lit) {
  return cached(`tbLayer${lit ? 1 : 0}`, () => {
    const { traces, vias } = tbBoard();
    const p = new Pix(W, H);
    const c = u32(lit ? P.magenta : P.ink);
    for (const tr of traces) for (let i = 0; i < tr.pts.length; i += 2) p.px(tr.pts[i], tr.pts[i + 1], c);
    for (const v of vias) {
      p.rect(v.x - 2, v.y - 2, 5, 5, lit ? P.purple : P.ink);
      p.rect(v.x - 1, v.y - 1, 3, 3, lit ? P.magenta : P.slate);
      p.px(v.x, v.y, P.black);
    }
    return p.canvas();
  });
}

const tbChip = () => cached('tbChip', () => {
  const p = new Pix(CHIP.w, CHIP.h);
  p.rect(0, 0, CHIP.w, CHIP.h, P.black);
  p.rect(0, 0, CHIP.w, 1, P.steel);
  p.rect(0, 0, 1, CHIP.h, P.slate);
  p.rect(CHIP.w - 1, 0, 1, CHIP.h, P.ink);
  p.rect(0, CHIP.h - 1, CHIP.w, 1, P.ink);
  p.rect(1, 1, CHIP.w - 2, 1, P.slate);
  // die
  for (let y = 5; y < CHIP.h - 5; y++) {
    for (let x = 6; x < CHIP.w - 6; x++) {
      const edge = y === 5 || y === CHIP.h - 6 || x === 6 || x === CHIP.w - 7;
      p.d[y * CHIP.w + x] = u32(edge ? P.ink : (x + y) % 4 === 0 && ((x >> 2) + (y >> 2)) % 2 ? P.ink : P.black);
    }
  }
  // pin-1 dot + tiny markings
  p.rect(10, 9, 3, 3, P.slate);
  p.px(11, 10, P.black);
  return p.canvas();
});

const tbRain = () => cached('tbRain', () => {
  // vertical strips of binary digits with a bright head at the bottom (3x5 digits)
  const ONE = ['.#.', '##.', '.#.', '.#.', '###'];
  const ZERO = ['###', '#.#', '#.#', '#.#', '###'];
  const strips = [];
  for (let v = 0; v < 6; v++) {
    const n = 20;
    const p = new Pix(3, n * 7);
    const rand = mulberry32(77 + v * 13);
    for (let k = 0; k < n; k++) {
      const g = rand() < 0.5 ? ONE : ZERO;
      const f = k / (n - 1); // 0 top (tail) .. 1 bottom (head)
      const col = k === n - 1 ? P.white : f > 0.85 ? P.pink : f > 0.6 ? P.magenta : f > 0.3 ? P.purple : P.ink;
      g.forEach((row, y) => [...row].forEach((ch, x) => ch === '#' && p.px(x, k * 7 + y, col)));
    }
    strips.push(p.canvas());
  }
  return strips;
});

const tbScan = () => cached('tbScan', () => {
  const p = new Pix(W, H);
  const c = u32(P.black, 60);
  for (let y = 1; y < H; y += 2) for (let x = 0; x < W; x++) p.d[y * W + x] = c;
  return p.canvas();
});

let TB_FRAME = null;
function drawTechBytes(ctx, t, dt, info) {
  r(ctx, 0, 0, W, H, P.black);
  const board = tbBoard();

  // binary rain (behind everything)
  const strips = tbRain();
  const rainOn = seg(dt, 0.25, 0.4);
  if (rainOn > 0) {
    const fast = dt < TB_LOCK ? 1 : 0.45;
    for (let i = 0; i < 40; i++) {
      if (hash(i * 9) > rainOn) continue;
      const x = 2 + i * 10 - (i & 1) * 3;
      const sp = (40 + hash(i * 3 + 1) * 70) * fast;
      const len = 140;
      const y = floor((dt * sp + hash(i * 5) * 300) % (H + len)) - 8;
      const img = strips[i % strips.length];
      if (dt > 2.3 && i % 3) continue; // thinner rain under the lockup
      ctx.drawImage(img, x, y - img.height);
    }
  }

  // circuit traces light up from the frame edges into the chip
  ctx.drawImage(tbBoardLayer(false), 0, 0);
  const allLit = dt > 1.6;
  if (allLit) ctx.drawImage(tbBoardLayer(true), 0, 0);
  else if (dt > 0.25) {
    if (!TB_FRAME) TB_FRAME = new Frame(W, H);
    const F = TB_FRAME;
    F.d.fill(0);
    const lit = u32(P.magenta);
    const cyan = u32(P.cyan);
    const white = u32(P.white);
    for (const tr of board.traces) {
      const p = seg(dt, tr.s, tr.d);
      if (p <= 0) continue;
      const head = floor(p * tr.n);
      for (let i = 0; i < min(head, tr.n); i++) F.d[tr.pts[i * 2 + 1] * W + tr.pts[i * 2]] = lit;
      if (p < 1) {
        for (let j = 0; j < 4; j++) {
          const i = head - j;
          if (i < 0 || i >= tr.n) continue;
          const x = tr.pts[i * 2];
          const y = tr.pts[i * 2 + 1];
          if (x >= 0 && y >= 0 && x < W && y < H) F.d[y * W + x] = j === 0 ? white : cyan;
        }
      }
    }
    ctx.drawImage(F.flush(), 0, 0);
  }
  // ambient data pulses once everything is lit
  if (dt > 1.2) {
    const tr = board.traces;
    for (let k = 0; k < 9; k++) {
      const period = 0.9 + (k % 3) * 0.25;
      const cyc = floor((dt + k * 0.31) / period);
      const ph = ((dt + k * 0.31) % period) / period;
      const T = tr[floor(hash2(k, cyc) * tr.length)];
      const i = floor(ph * T.n);
      for (let j = 0; j < 4; j++) {
        const q = i - j;
        if (q < 0 || q >= T.n) continue;
        r(ctx, T.pts[q * 2], T.pts[q * 2 + 1], 1, 1, j === 0 ? P.white : j === 1 ? P.cyan : P.blue);
      }
    }
  }
  // vias light when their output fires
  for (const v of board.vias) {
    const tr = board.traces[v.trace];
    const a = dt - (tr.s + tr.d);
    if (a > 0 && a < 0.2) r(ctx, v.x - 1, v.y - 1, 3, 3, P.cyan);
  }

  // the chip powers up
  const cp = seg(dt, 0.92, 0.22);
  if (cp > 0) {
    const hh = round(CHIP.h * easeOutBack(cp, 1.6));
    const top = CHIP.y + ((CHIP.h - hh) >> 1);
    ctx.save();
    clipRect(ctx, CHIP.x - 8, top, CHIP.w + 16, hh);
    for (const pin of board.pins) r(ctx, pin.x, pin.y, pin.w, pin.h, P.silver);
    ctx.drawImage(tbChip(), CHIP.x, CHIP.y);
    ctx.restore();
    if (cp < 1) {
      r(ctx, CHIP.x, top, CHIP.w, 1, P.cyan);
      r(ctx, CHIP.x, top + hh - 1, CHIP.w, 1, P.cyan);
    }
    // pins flash as each signal arrives
    for (const tr of board.traces) {
      const a = dt - (tr.s + tr.d);
      const pin = tr.pin;
      if (a > -0.02 && a < 0.16) r(ctx, pin.x, pin.y, pin.w, pin.h, a < 0.06 ? P.white : P.cyan);
      else if (a >= 0.16 && cp >= 1) r(ctx, pin.x + (pin.w > pin.h ? 0 : 1), pin.y + (pin.w > pin.h ? 1 : 0), pin.w > pin.h ? pin.w : 1, pin.w > pin.h ? 1 : pin.h, P.white);
    }
    // die frame glows once powered
    const pw = seg(dt, 1.3, 0.3);
    if (pw > 0) {
      const c = floor(dt * 10) % 7 === 0 && dt < 2.4 ? P.cyan : P.magenta;
      const k = round(pw * (CHIP.w - 12));
      r(ctx, CHIP.x + 6, CHIP.y + 5, k, 1, c);
      r(ctx, CHIP.x + CHIP.w - 6 - k, CHIP.y + CHIP.h - 6, k, 1, c);
      dfill(ctx, CHIP.x + 7, CHIP.y + 6, CHIP.w - 14, CHIP.h - 12, P.purple, 0.12 * pw);
      drawTextTiny(ctx, 'GB24-TBX', CHIP.x + CHIP.w - 12, CHIP.y + CHIP.h - 13, P.slate, 'right');
    }
  }

  // the title assembles from bits
  const s = fitScale(info.title, CHIP.w - 26);
  const T = titleSet(info.title, s, ST_TB);
  const tx = round(192 - T.fw / 2);
  const ty = CHIP.y + ((CHIP.h - T.fh) >> 1) - 1;
  if (dt < TB_LOCK) tbBits(ctx, dt, info.title, s, tx, ty);
  else {
    const q = seg(dt, TB_LOCK, 0.38);
    const f = floor(dt * 60);
    let a = q < 1 ? round(5 * (1 - q) ** 1.5) : 0;
    const micro = every(dt, TB_LOCK + 1.1, 1.3, 0.1);
    if (micro >= 0) a = 2;
    if (a > 0) {
      ctx.drawImage(tintOf(T, P.magenta), tx - T.pad - a, ty - T.pad + (f & 1));
      ctx.drawImage(tintOf(T, P.cyan), tx - T.pad + a, ty - T.pad - (f & 1));
    }
    if (q < 0.12) ctx.drawImage(tintOf(T, P.white), tx - T.pad, ty - T.pad);
    else drawTitle(ctx, T, tx, ty);
    glint(ctx, T, tx, ty, seg(dt, TB_LOCK + 0.5, 0.5), 5, P.white);
    const g2 = every(dt, TB_LOCK + 2.4, 2.4, 0.5);
    if (g2 >= 0) glint(ctx, T, tx, ty, g2, 5, P.white);
    if ((q < 1 && hash(f) < 0.7) || micro >= 0) {
      for (let k = 0; k < 3; k++) {
        const yy = ty - 6 + floor(hash2(f, k) * (T.fh + 12));
        slice(ctx, yy, 2 + floor(hash2(f, k + 9) * 5), round((hash2(f, k + 3) - 0.5) * 16 * (micro >= 0 ? 0.5 : 1 - q)));
      }
    }
  }

  // command line + credits
  if (dt < 1.0) {
    const cmd = '> RUN TECH_BYTES.EXE';
    const p = seg(dt, 0.05, 0.45);
    const shown = typed(cmd, p);
    const w = drawText(ctx, shown, 24, 186, { color: P.cyan });
    if (floor(dt * 8) % 2 === 0) r(ctx, 24 + w + 2, 186, 5, 7, P.cyan);
  }
  const tag = fitLines(info.tagline, 330, 1)[0] || '';
  const tp = seg(dt, 2.6, 0.55);
  if (tp > 0 && tag) {
    const tw = measureText(tag) + 10;
    const x = round(192 - tw / 2);
    r(ctx, x - 8, TB_TAG_Y - 4, tw + 16, 15, P.black);
    r(ctx, x - 8, TB_TAG_Y + 10, tw + 16, 1, P.purple);
    drawText(ctx, '>', x, TB_TAG_Y, { color: P.magenta });
    const w = drawText(ctx, typed(tag, tp), x + 10, TB_TAG_Y, { color: P.white });
    if (tp < 1 || floor(dt * 3) % 2 === 0) r(ctx, x + 12 + w, TB_TAG_Y, 5, 7, P.cyan);
  }
  const cr = credits(info, 300);
  const wp = seg(dt, 2.95, 0.3);
  if (cr && wp > 0) {
    const x = round(192 - cr.w / 2);
    const yo = round((1 - easeOutBack(wp, 2)) * 6);
    ctx.save();
    clipRect(ctx, 0, TB_WITH_Y - 3, W, 12);
    drawCredits(ctx, cr, x, TB_WITH_Y + yo, 1, P.magenta, P.cyan);
    ctx.restore();
  }
  drawBug(ctx, bugX(), bugY(), seg(dt, 3.15, 0.25), dt - 3.15);

  // scanline sweep + CRT scanlines
  const sw = seg(dt, TB_LOCK, 0.55);
  if (sw > 0 && sw < 1) {
    const yy = round(lerp(-8, H + 8, sw));
    r(ctx, 0, yy, W, 1, rgba(P.cyan, 0.8));
    r(ctx, 0, yy - 3, W, 3, rgba(P.cyan, 0.18));
    r(ctx, 0, yy - 9, W, 6, rgba(P.cyan, 0.07));
  }
  const sw2 = every(dt, 3.4, 2.6, 0.9);
  if (sw2 >= 0) {
    const yy = round(lerp(-8, H + 8, sw2));
    r(ctx, 0, yy, W, 1, rgba(P.cyan, 0.3));
    r(ctx, 0, yy - 4, W, 4, rgba(P.cyan, 0.06));
  }
  ctx.drawImage(tbScan(), 0, 0);
  // boot flicker
  if (dt < 0.3 && floor(dt * 30) % 3 === 0) dfill(ctx, 0, 0, W, H, P.purple, 0.25);
}

/** Bits (font pixels) flying in from the edges to build the title. */
function tbBits(ctx, dt, text, s, tx, ty) {
  const g = textBits(text);
  for (let gy = 0; gy < 7; gy++) {
    for (let gx = 0; gx < g.w; gx++) {
      if (!g.bits[gy * g.w + gx]) continue;
      const id = gy * 997 + gx;
      const st = 1.3 + (gx / g.w) * 0.6 + hash(id) * 0.16;
      const p = seg(dt, st, 0.34);
      if (p <= 0) continue;
      const ang = hash(id + 7) * TAU;
      const dist = 200 + hash(id + 3) * 120;
      const x0 = 192 + cos(ang) * dist;
      const y0 = 88 + sin(ang) * dist * 0.6;
      const e = easeOut(p);
      const x = round(lerp(x0, tx + gx * s, e));
      const y = round(lerp(y0, ty + gy * s, e));
      const sz = p < 0.4 ? 1 : p < 0.8 ? max(2, s >> 1) : s;
      const c = p >= 1 ? (hash2(id, floor(dt * 20)) < 0.15 ? P.cyan : P.white) : hash(id + 1) < 0.5 ? P.cyan : P.magenta;
      if (p < 1 && p > 0.15) r(ctx, round(lerp(x0, tx + gx * s, easeOut(p - 0.12))), round(lerp(y0, ty + gy * s, easeOut(p - 0.12))), 1, 1, P.purple);
      r(ctx, x, y, sz, sz, c);
    }
  }
}

// 3x5 micro lettering for chip markings
const TINY = {
  G: '.##|#..|#.#|#.#|.##', B: '##.|#.#|##.|#.#|##.', T: '###|.#.|.#.|.#.|.#.', X: '#.#|#.#|.#.|#.#|#.#',
  2: '##.|..#|.#.|#..|###', 4: '#.#|#.#|###|..#|..#', '-': '...|...|###|...|...',
};
function drawTextTiny(ctx, text, x, y, color, align = 'left') {
  const w = text.length * 4 - 1;
  let pen = align === 'right' ? x - w : x;
  ctx.fillStyle = color;
  for (const ch of text) {
    const g = TINY[ch];
    if (g) g.split('|').forEach((row, yy) => [...row].forEach((c, xx) => c === '#' && ctx.fillRect(pen + xx, y + yy, 1, 1)));
    pen += 4;
  }
}

// ===========================================================================
// COSMOS DESK — hyperspace jump, a ringed planet rising, title in starlight
// ===========================================================================

const CO_BPM = 100;
const CO_B = 60 / CO_BPM;
const CO_DROP = 2 * CO_B; // 1.2 s: drop out of hyperspace
const CO_PLANET = { x: 102, y: 150, R: 44 };
const CO_COL = 210;

const CO_TUNE = {
  bpm: CO_BPM,
  wave: 'triangle',
  // shimmering E-lydian rise into hyperspace, a floating melody, Emaj7 landing
  notes: 'E4:0.25 B4:0.25 F#5:0.25 G#5:0.25 B5:0.25 D#6:0.25 F#6:0.25 B6:0.25 '
    + 'B5:1 A#5:0.5 F#5:0.5 G#5:1.5 D#5:0.5 F#5:1 E5+G#5+B5+D#6:2',
  bass: 'R:1 E2:1 E3:1 C#3:1 A2:2 B2:1 E2+B2:2',
  bassWave: 'sine',
  drums: 'H:0.25 H:0.25 H:0.25 H:0.25 H:0.25 H:0.25 S:0.25 S:0.25 K:2 K:1 H:0.5 H:0.5 S:0.5 S:0.5 K:2',
};

const ST_CO = { id: 'co', face: [P.white, P.white, P.silver, P.fog], sharp: 2.5, hi: P.white, lo: P.steel, ext: 2, extC: [P.purple, P.ink], out: P.black, glow: { r: 2, color: P.magenta, a: 0.32 } };

const coStars = () => cached('coStars', () => {
  const rand = mulberry32(4242);
  return Array.from({ length: 260 }, () => ({
    x: (rand() * 2 - 1) * 1.7,
    y: (rand() * 2 - 1) * 1.0,
    z0: rand(),
    c: rand(),
  }));
});
function coS(dt) {
  if (dt <= CO_DROP) return 2.6 * (dt / CO_DROP) ** 3;
  return 2.6 + 0.045 * (dt - CO_DROP);
}
function coV(dt) {
  return dt <= CO_DROP ? (2.6 * 3 * (dt / CO_DROP) ** 2) / CO_DROP : 0.045;
}

/** Simple value noise for the nebula. */
function vnoise(x, y) {
  const ix = floor(x);
  const iy = floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const h = (a, b) => hash2(a, b);
  const a = h(ix, iy);
  const b = h(ix + 1, iy);
  const c = h(ix, iy + 1);
  const d = h(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y) => (vnoise(x, y) * 0.5 + vnoise(x * 2, y * 2) * 0.27 + vnoise(x * 4, y * 4) * 0.15 + vnoise(x * 8, y * 8) * 0.08);

const coBg = () => cached('coBg', () => {
  const p = new Pix(W, H);
  const rand = mulberry32(99);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // diagonal nebula band from the upper right towards the lower left
      const band = 1 - abs((x - 384) * 0.38 + (y - 0) * 0.92 + 40) / 120;
      const n = fbm(x / 70, y / 55) * 0.85 + band * 0.42 - 0.1;
      const v = n + (bayer(x, y) - 0.5) * 0.12;
      let c = P.black;
      if (v > 0.74) c = P.pink;
      else if (v > 0.66) c = P.magenta;
      else if (v > 0.56) c = P.purple;
      else if (v > 0.46) c = (x + y) & 1 ? P.purple : P.ink;
      else if (v > 0.38) c = P.ink;
      else if (v > 0.32 && (x & 1) === (y & 1)) c = P.ink;
      p.d[y * W + x] = u32(c);
    }
  }
  for (let i = 0; i < 170; i++) {
    const x = floor(rand() * W);
    const y = floor(rand() * H);
    const b = rand();
    p.px(x, y, b > 0.92 ? P.white : b > 0.7 ? P.silver : b > 0.4 ? P.fog : P.steel);
    if (b > 0.97) {
      p.px(x - 1, y, P.steel);
      p.px(x + 1, y, P.steel);
      p.px(x, y - 1, P.steel);
      p.px(x, y + 1, P.steel);
    }
  }
  return p.canvas();
});

const CO_BANDS = [
  [-0.82, [P.cream, P.tan, P.tanShade]],
  [-0.6, [P.pink, P.magenta, P.purple]],
  [-0.38, [P.cream, P.tan, P.tanShade]],
  [-0.22, [P.skin, P.skinShade, P.brown]],
  [0.02, [P.cream, P.tan, P.tanShade]],
  [0.2, [P.pink, P.magenta, P.purple]],
  [0.3, [P.cream, P.skin, P.tanShade]],
  [0.55, [P.skin, P.skinShade, P.brown]],
  [0.78, [P.cream, P.tan, P.tanShade]],
  [2, [P.pink, P.magenta, P.purple]],
];
const coPlanet = () => cached('coPlanet', () => {
  const { R } = CO_PLANET;
  const RX = R * 1.98;
  const K = 0.27;
  const tilt = -0.3;
  const ct = cos(tilt);
  const st = sin(tilt);
  const Wd = ceil2(RX * 2 + 6);
  const Hd = ceil2(R * 2 + 8);
  const cx = Wd >> 1;
  const cy = Hd >> 1;
  const p = new Pix(Wd, Hd);
  const L = [0.62, 0.5, 0.6];
  const ln = Math.hypot(...L);
  const RR = R + 0.5;
  const ringCol = (e) => {
    if (e < 1.26 || e > 1.97) return null;
    if (e < 1.36) return [P.steel, P.slate];
    if (e < 1.55) return [P.cream, P.tan];
    if (e < 1.6) return [P.silver, P.fog];
    if (e < 1.65) return null; // Cassini gap
    if (e < 1.86) return [P.fog, P.steel];
    return [P.steel, P.slate];
  };
  for (let y = 0; y < Hd; y++) {
    for (let x = 0; x < Wd; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const u = dx * ct + dy * st;
      const v = -dx * st + dy * ct;
      const e = sqrt(u * u + (v / K) * (v / K)) / R;
      const rc = ringCol(e);
      const d2 = dx * dx + dy * dy;
      const onPlanet = d2 <= RR * RR;
      const front = v > 0;
      if (rc && (front || !onPlanet)) {
        // ring, darker where the planet shadows it (behind, to the lower left)
        const shadow = !front && u < 0 && abs(v) < R * K * 1.1;
        const lit = (u * 0.7 - v * 0.3) / (RX) > -0.2;
        let c = lit ? rc[0] : rc[1];
        if (shadow && e < 1.75) c = P.ink;
        if ((x + y) % 2 === 0 && e > 1.4 && e < 1.5) c = rc[1];
        p.d[y * Wd + x] = u32(c);
        continue;
      }
      if (!onPlanet) continue;
      const nx = dx / RR;
      const ny = -dy / RR;
      const nz = sqrt(max(0, 1 - nx * nx - ny * ny));
      const dif = (nx * L[0] + ny * L[1] + nz * L[2]) / ln;
      let b = v / R + 0.05 * sin(u * 0.35) + 0.03 * sin(u * 0.9 + v);
      let set = CO_BANDS[CO_BANDS.length - 1][1];
      for (const [to, cs] of CO_BANDS) {
        if (b < to) {
          set = cs;
          break;
        }
      }
      // shadow of the rings across the planet (just above the front arc)
      const ue = (u + 6) / R;
      const ve = (v - 3) / R;
      const es = sqrt(ue * ue + (ve / K) * (ve / K));
      const ringShadow = v < 0 && es > 1.3 && es < 1.85;
      const lv = clamp((dif + 0.15) * 2.6, 0, 3.4) - (ringShadow ? 1.1 : 0);
      const k = floor(lv) + (lv - floor(lv) > bayer(x, y) ? 1 : 0);
      let c;
      if (k <= 0) c = (x + y) & 1 ? P.black : P.ink;
      else if (k === 1) c = set[2];
      else if (k === 2) c = set[1];
      else c = set[0];
      if (sqrt(d2) > RR - 1.2 && dif > 0.25) c = P.cream;
      p.d[y * Wd + x] = u32(c);
    }
  }
  // atmosphere on the lit limb
  for (const [ox, oy] of ringPtsArr(R + 1)) {
    const dif = ox * L[0] - oy * L[1];
    if (dif > 4) p.d[(cy + oy) * Wd + cx + ox] = p.d[(cy + oy) * Wd + cx + ox] || u32(P.pink, 150);
  }
  return { cv: p.canvas(), cx, cy, w: Wd, h: Hd, ct, st, K, RX };
});
function ceil2(v) {
  return Math.ceil(v / 2) * 2 + 1;
}
function ringPtsArr(rad) {
  const pts = ringPts(rad);
  const out = [];
  for (let i = 0; i < pts.length; i += 2) out.push([pts[i], pts[i + 1]]);
  return out;
}

const coMoon = () => cached('coMoon', () => {
  const R = 5;
  const p = new Pix(2 * R + 1, 2 * R + 1);
  for (let y = -R; y <= R; y++) {
    for (let x = -R; x <= R; x++) {
      if (x * x + y * y > (R + 0.4) * (R + 0.4)) continue;
      const nz = sqrt(max(0, 1 - (x * x + y * y) / (R * R)));
      const dif = (x * 0.6 - y * 0.5 + nz * 0.6) / 1;
      const c = dif > 0.75 ? P.white : dif > 0.45 ? P.silver : dif > 0.15 ? P.fog : dif > -0.15 ? P.steel : P.slate;
      p.px(x + R, y + R, c);
    }
  }
  p.px(R + 1, R - 1, P.fog);
  p.px(R - 2, R + 2, P.steel);
  return p.canvas();
});

const CO_ROCKET = [
  '..RR.........',
  '..RRSS.......',
  '...SWWWWWW...',
  '..SWWCCWWWWS.',
  '..SWWCCWWWWWW',
  '..SFFFFFFFS..',
  '..RRSS.......',
  '..RR.........',
];
const coRocket = () => cached('coRocket', () => {
  const map = { R: P.red, S: P.silver, W: P.white, C: P.cyan, F: P.fog };
  const p = new Pix(13, 8);
  CO_ROCKET.forEach((row, y) => [...row].forEach((ch, x) => map[ch] && p.px(x, y, map[ch])));
  return p.canvas();
});
function coRocketPos(u) {
  return [lerp(-18, 404, u), lerp(132, 22, u) - 26 * sin(Math.PI * u)];
}

let CO_FRAME = null;
function drawCosmos(ctx, t, dt, info) {
  r(ctx, 0, 0, W, H, P.black);
  const after = dt > CO_DROP;
  if (after) {
    ctx.drawImage(coBg(), 0, 0);
    // twinkles
    for (let i = 0; i < 14; i++) {
      const k = every(dt + hash(i) * 3, 0, 1.6 + hash(i * 3) * 1.4, 0.5);
      if (k < 0) continue;
      sparkle(ctx, floor(hash(i * 7 + 1) * W), floor(hash(i * 11 + 2) * 150), k, 2 + (i % 3), P.white, i % 2 ? P.cyan : P.pink);
    }
  }

  // 3D starfield: warp streaks, then a slow drift
  if (!CO_FRAME) CO_FRAME = new Frame(W, H);
  const F = CO_FRAME;
  F.d.fill(0);
  const S = coS(dt);
  const V = coV(dt);
  const cols = [u32(P.white), u32(P.silver), u32(P.cyan), u32(P.fog), u32(P.steel), u32(P.pink)];
  const fade = after ? 0.55 : 1;
  for (const s of coStars()) {
    let z = (((s.z0 - S) % 1) + 1) % 1;
    if (z < 0.03) continue;
    const zt = min(1.2, z + V * 0.028 + 0.004);
    const hx = 192 + (s.x / z) * 58;
    const hy = 104 + (s.y / z) * 58;
    if (hx < -40 || hx > W + 40 || hy < -40 || hy > H + 40) continue;
    const tx = 192 + (s.x / zt) * 58;
    const ty = 104 + (s.y / zt) * 58;
    const near = z < 0.25 ? 0 : z < 0.5 ? (s.c < 0.3 ? 2 : 1) : z < 0.75 ? 3 : 4;
    if (after && hash2(floor(s.c * 1000), floor(dt * 6)) > fade + 0.3) continue;
    const c = cols[s.c > 0.92 && near < 3 ? 5 : near];
    const tail = cols[min(4, near + 2)];
    linePts(tx, ty, hx, hy, (x, y, i) => {
      if (x >= 0 && y >= 0 && x < W && y < H) F.d[y * W + x] = i === 0 && V > 0.5 ? tail : c;
    });
  }
  ctx.drawImage(F.flush(), 0, 0);

  // hyperspace core glow
  if (!after) {
    const I = clamp(V / 6.5, 0, 1);
    disc(ctx, 192, 104, 6 + 46 * I, ditherStyle(ctx, P.purple, round(6 * I)));
    disc(ctx, 192, 104, 3 + 20 * I, ditherStyle(ctx, P.magenta, round(8 * I)));
    disc(ctx, 192, 104, 1 + 7 * I, I > 0.15 ? P.white : P.silver);
    if (I > 0.6) disc(ctx, 192, 104, 2 + 3 * I, P.cream);
  }

  // planet rises, moon orbits, rocket crosses
  const pl = coPlanet();
  const rise = easeOut(seg(dt, CO_DROP - 0.05, 1.3));
  if (rise > 0) {
    const px = CO_PLANET.x;
    const py = round(lerp(CO_PLANET.y + 150, CO_PLANET.y, rise));
    const th = dt * 1.15 + 1.1;
    const mx = round(px + (cos(th) * pl.RX * 0.86) * pl.ct - (sin(th) * pl.RX * 0.86 * pl.K) * pl.st);
    const my = round(py + (cos(th) * pl.RX * 0.86) * pl.st + (sin(th) * pl.RX * 0.86 * pl.K) * pl.ct);
    const moonFront = sin(th) > 0;
    if (!moonFront) ctx.drawImage(coMoon(), mx - 5, my - 5);
    ctx.drawImage(pl.cv, px - pl.cx, py - pl.cy);
    if (moonFront) ctx.drawImage(coMoon(), mx - 5, my - 5);
    // ring glint
    const g = every(dt, 2.6, 3.0, 0.6);
    if (g >= 0) sparkle(ctx, px - round(pl.RX * 0.62), py + 14, g, 4, P.white, P.cream);
  }
  const ru = seg(dt, 1.65, 2.1);
  if (ru > 0 && ru < 1) {
    // smoke trail
    for (let k = 14; k >= 1; k--) {
      const [x, y] = coRocketPos(max(0, ru - k * 0.011));
      const j = hash2(k, floor(dt * 20));
      const c = k < 3 ? P.silver : k < 7 ? P.fog : k < 11 ? P.steel : P.slate;
      r(ctx, round(x - 2 + j * 2), round(y + 2 + (j - 0.5) * k * 0.4), k < 5 ? 2 : 1, k < 5 ? 2 : 1, c);
    }
    const [x, y] = coRocketPos(ru);
    const rx = round(x) - 6;
    const ry = round(y) - 4;
    const fl = floor(dt * 24) % 3;
    r(ctx, rx - 2 - fl, ry + 3, 3 + fl, 2, P.orange);
    r(ctx, rx - 1, ry + 3, 2, 2, P.yellow);
    if (fl === 2) r(ctx, rx - 5, ry + 3, 1, 1, P.yellow);
    ctx.drawImage(coRocket(), rx, ry);
  }

  // title in starlight
  const words = String(info.title || '').trim().split(/\s+/);
  const lines = words.length > 1 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [words[0] || ''];
  const maxW = W - CO_COL - 18;
  const s = min(...lines.map((l) => fitScale(l, maxW)));
  let idx = 0;
  let y = 30;
  const sets = lines.map((l) => titleSet(l, s, ST_CO));
  for (const T of sets) {
    for (const L of T.letters) {
      const st = 2.0 + idx * 0.07;
      idx++;
      const k = seg(dt, st + 0.08, 0.3);
      const cxl = CO_COL + L.x + (L.cw >> 1);
      const cyl = y + (T.fh >> 1);
      if (dt > st && dt < st + 0.42) sparkle(ctx, cxl, cyl, seg(dt, st, 0.42), 9, P.white, P.cyan);
      if (k > 0) drawLetter(ctx, T, L, CO_COL, y, dissolved(L.spr, k * 16));
    }
    y += T.fh + 5;
  }
  // starlight glints sweep and sparkle on the letters
  const yT = 30;
  let yy = yT;
  for (const T of sets) {
    glint(ctx, T, CO_COL, yy, seg(dt, 3.0, 0.6), 4, P.white);
    const g2 = every(dt, 4.6, 2.8, 0.6);
    if (g2 >= 0) glint(ctx, T, CO_COL, yy, g2, 4, P.white);
    yy += T.fh + 5;
  }
  if (dt > 3.2) {
    const k = every(dt, 3.2, 1.1, 0.45);
    const n = floor((dt - 3.2) / 1.1);
    const T = sets[n % sets.length];
    const L = T.letters[floor(hash(n * 31) * T.letters.length)];
    if (L && k >= 0) sparkle(ctx, CO_COL + L.x + 1, 30 + (n % sets.length) * (T.fh + 5) + 1, k, 4, P.white, P.cyan);
  }

  // tagline + credits
  const tagY = y + 6;
  const tag = fitLines(info.tagline, maxW, 1)[0] || '';
  const tp = seg(dt, 2.75, 0.5);
  if (tp > 0 && tag) {
    r(ctx, CO_COL, tagY - 4, round(easeOut(tp) * (maxW + 6)), 1, P.purple);
    const shown = typed(tag, tp);
    const w = drawText(ctx, shown, CO_COL, tagY + 2, { color: P.cream });
    if (tp < 1) sparkle(ctx, CO_COL + w + 3, tagY + 5, 0.5, 2, P.white, P.cyan);
  }
  const cr = credits(info, maxW);
  drawCredits(ctx, cr, CO_COL, tagY + 16, seg(dt, 3.0, 0.4), P.fog, P.white);
  drawBug(ctx, bugX(), bugY(), seg(dt, 3.25, 0.25), dt - 3.25);

  // drop-out flash
  const fl = seg(dt, CO_DROP, 0.32);
  if (dt >= CO_DROP && fl < 1) {
    dfill(ctx, 0, 0, W, H, P.white, (1 - fl) ** 1.5);
    if (fl < 0.4) dfill(ctx, 0, 0, W, H, P.cyan, 0.3);
  }
  // shooting star in the hold
  const ss = every(dt, 3.9, 3.3, 0.35);
  if (ss >= 0) {
    const x = round(lerp(170, 60, ss));
    const y = round(lerp(18, 60, ss));
    for (let k = 0; k < 10; k++) r(ctx, x + k, y - round(k * 0.4), 1, 1, k < 2 ? P.white : k < 5 ? P.silver : P.steel);
  }
}

// ===========================================================================
// MONEY MINUTE — a rising chart, candlesticks, departure-board tickers, gold
// ===========================================================================

const MM_BPM = 146;
const MM_B = 60 / MM_BPM;
const MM_TITLE = 5 * MM_B; // ~2.05 s
const MM_TY = 72;

const MM_TUNE = {
  bpm: MM_BPM,
  wave: 'square',
  // "cha-ching" pickup, a strutting major riff, big C major finish
  notes: 'G4:0.25 C5:0.25 E5:0.25 G5:0.25 C6:0.5 R:0.25 G5:0.25 A5:0.5 G5:0.5 '
    + 'E5:0.5 F5:0.25 G5:0.25 R:0.25 C5:0.25 E5:0.5 F5:0.5 A5:0.5 C6:0.5 A5:0.25 C6:0.25 '
    + 'D6:0.75 C6:0.25 B5:0.5 G5:0.5 C5+E5+G5+C6:2',
  bass: 'C3:0.5 G2:0.5 C3:0.5 C4:0.5 A2:0.5 A3:0.5 F2:0.5 F3:0.5 G2:0.5 G3:0.5 F2:0.5 F3:0.5 A2:0.5 A3:0.5 G2:0.5 G3:0.5 G2:0.5 B2:0.5 C3:2',
  bassWave: 'triangle',
  drums: 'K:0.5 H:0.5 K:0.5 H:0.5 S:0.5 H:0.5 K:0.5 H:0.5 S:0.5 H:0.5 K:0.5 H:0.5 S:0.5 H:0.5 K:0.5 H:0.5 H:0.5 S:0.25 S:0.25 K:2',
};

const ST_MM = { id: 'mm', face: [P.cream, P.yellow, P.yellow, P.orange], sharp: 3, hi: P.white, lo: P.rust, ext: 3, extC: [P.tanShade, P.brown, P.maroon], out: P.black };

const mmChart = () => cached('mmChart', () => {
  const rand = mulberry32(1987);
  const pts = [];
  let v = 0.12;
  for (let i = 0; i <= 47; i++) {
    const f = i / 47;
    const trend = 0.1 + 0.78 * f ** 1.35;
    v = trend + (rand() - 0.5) * 0.09 + (i > 18 && i < 24 ? -0.07 : 0);
    pts.push([i * 8, round(196 - clamp(v, 0, 1) * 150)]);
  }
  pts[47][1] = 44;
  // line + fill, baked
  const p = new Pix(W, H);
  const yAt = new Int16Array(W);
  for (let k = 1; k < pts.length; k++) {
    const [x0, y0] = pts[k - 1];
    const [x1, y1] = pts[k];
    for (let x = x0; x <= x1 && x < W; x++) yAt[x] = round(lerp(y0, y1, (x - x0) / (x1 - x0)));
  }
  for (let x = 0; x < W; x++) {
    for (let y = yAt[x] + 2; y < H; y++) {
      const f = (y - yAt[x]) / 60;
      if (bayer(x, y) < 0.55 - f * 0.45) p.d[y * W + x] = u32(P.darkGreen);
    }
  }
  for (let k = 1; k < pts.length; k++) {
    linePts(pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], (x, y) => {
      p.px(x, y + 1, P.darkGreen);
      p.px(x, y + 2, P.darkGreen);
    });
  }
  for (let k = 1; k < pts.length; k++) {
    linePts(pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], (x, y) => {
      p.px(x, y, P.green);
      p.px(x, y - 1, u32(P.green, 90));
    });
  }
  return { cv: p.canvas(), pts, yAt };
});

const mmBg = () => cached('mmBg', () => {
  const p = new Pix(W, H);
  p.d.fill(u32(P.black));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = (y / H) * 1.1 - 0.35 + abs(x - 192) / 900;
      if (bayer(x, y) < v * 0.55) p.d[y * W + x] = u32(P.darkGreen);
    }
  }
  return p.canvas();
});
const mmGridTile = () => cached('mmGrid', () => {
  const p = new Pix(24, 24);
  for (let i = 0; i < 24; i += 2) {
    p.px(i, 0, u32(P.darkGreen, 255));
    p.px(0, i, u32(P.darkGreen, 255));
  }
  return p.canvas();
});

const MM_TICKS = [['PIXL', '+2.4%'], ['BYTE', '+1.8%'], ['GOLD', '-0.6%'], ['COIN', '+3.1%']];
const FLAP_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+-%.';
function mmBoard(ctx, dt) {
  const y = 8;
  const cells = [];
  MM_TICKS.forEach(([sym, chg], i) => {
    const alt = floor(max(0, dt - 3.0) / 1.4);
    const change = i === alt % MM_TICKS.length && dt > 3.0 ? `${chg[0]}${(parseFloat(chg.slice(1)) + 0.1 * ((alt % 3) + 1)).toFixed(1)}%` : chg;
    const str = `${sym} ${change}`;
    [...str].forEach((ch, j) => cells.push({ ch, group: i, col: j < sym.length ? P.yellow : ch === ' ' ? null : chg[0] === '-' ? P.red : P.green, alt: i === alt % MM_TICKS.length && dt > 3.0 }));
    if (i < MM_TICKS.length - 1) cells.push({ ch: ' ', gap: true });
  });
  const cw = 8;
  const total = cells.length * cw;
  const x0 = round(192 - total / 2);
  const op = easeOut(seg(dt, 0.25, 0.3));
  if (op <= 0) return;
  const bw = round((total + 12) * op);
  r(ctx, 192 - (bw >> 1), y - 3, bw, 19, P.black);
  r(ctx, 192 - (bw >> 1), y + 16, bw, 1, P.darkGreen);
  if (op < 1) return;
  cells.forEach((c, i) => {
    if (c.gap) return;
    const x = x0 + i * cw;
    r(ctx, x, y - 1, cw - 1, 15, P.ink);
    r(ctx, x, y + 6, cw - 1, 1, P.black);
    if (c.ch === ' ') return;
    const settle = 0.55 + i * 0.028 + hash(i) * 0.25;
    const resettle = c.alt ? 3.0 + (floor((dt - 3.0) / 1.4)) * 1.4 + 0.25 + i * 0.01 : -1;
    const flipping = dt < settle || (resettle > 0 && dt < resettle && dt > resettle - 0.25);
    const f = floor(dt * 32);
    const ch = flipping ? FLAP_CHARS[floor(hash2(i, f) * FLAP_CHARS.length)] : c.ch;
    drawText(ctx, ch, x + 1, y + 3, { color: flipping ? P.fog : c.col || P.white });
    if (flipping && f % 2 === 0) r(ctx, x, y - 1, cw - 1, 7, P.slate);
    r(ctx, x, y + 6, cw - 1, 1, P.black);
  });
}

const COIN_R = 6;
const mmCoinFrames = () => cached('mmCoins', () => {
  const frames = [];
  const R = COIN_R;
  for (let f = 0; f < 8; f++) {
    const th = (f / 8) * Math.PI;
    const ww = abs(cos(th));
    const p = new Pix(2 * R + 1, 2 * R + 1);
    const rx = max(0.6, R * ww + 0.3);
    for (let y = -R; y <= R; y++) {
      for (let x = -R; x <= R; x++) {
        const e = (x * x) / (rx * rx) + (y * y) / ((R + 0.4) * (R + 0.4));
        if (e > 1) continue;
        let c = P.yellow;
        const edge = (abs(x) + 1) * (abs(x) + 1) / (rx * rx) + (y * y) / ((R + 0.4) * (R + 0.4)) > 1 || (y * y) / ((R - 0.6) * (R - 0.6)) + (x * x) / (rx * rx) > 1;
        if (rx < 1.6) c = y < -R + 2 ? P.cream : x < 0 ? P.orange : P.rust;
        else if (edge) c = x > 0 || y > R - 2 ? P.rust : P.orange;
        else if (x < -rx * 0.3 && y < 0) c = P.cream;
        else if (rx > 3.5 && abs(x) <= 0 && abs(y) <= R - 3) c = P.orange;
        else if (rx > 3.5 && abs(y) === 2 && abs(x) <= 1) c = P.orange;
        p.px(x + R, y + R, c);
      }
    }
    frames.push(p.canvas());
  }
  return frames;
});
function coin(ctx, x, y, phase) {
  const frames = mmCoinFrames();
  const f = ((floor(phase) % 8) + 8) % 8;
  ctx.drawImage(frames[f], round(x) - COIN_R, round(y) - COIN_R);
}

function drawMoneyMinute(ctx, t, dt, info) {
  const [sx, sy] = shake(dt, MM_TITLE + 0.32, 0.18, 1.5);
  ctx.save();
  ctx.translate(sx, sy);
  r(ctx, -4, -4, W + 8, H + 8, P.black);
  ctx.drawImage(mmBg(), 0, 0);
  // scrolling graph paper
  const tile = mmGridTile();
  const pat = cached('mmGridPat', () => ctx.createPattern(tile, 'repeat'));
  const gp = seg(dt, 0, 0.35);
  if (gp > 0) {
    pat.setTransform(new DOMMatrix([1, 0, 0, 1, -floor(dt * 10) % 24, 4]));
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, round(W * easeOut(gp)), H);
  }

  // candlesticks pop up as the chart head passes
  const ch = mmChart();
  const headX = round(lerp(-2, 376, easeInOut(seg(dt, 0.2, 1.55))));
  for (let i = 0; i < 22; i++) {
    const x = 10 + i * 17;
    if (x > headX) break;
    const pp = easeOutBack(seg(dt, 0.2 + (x / 376) * 1.2, 0.2), 2.4);
    const base = ch.yAt[min(W - 1, x)] + 10 + floor(hash(i * 3) * 14);
    const up = hash(i * 7) > 0.28;
    const bh = round((6 + hash(i * 5) * 16) * pp);
    const top = base - bh;
    r(ctx, x + 2, top - round(4 * pp), 1, bh + round(8 * pp), up ? P.darkGreen : P.maroon);
    r(ctx, x, top, 5, bh, up ? P.green : P.red);
    r(ctx, x + 4, top, 1, bh, up ? P.darkGreen : P.darkRed);
    if (bh > 1) r(ctx, x, top, 4, 1, up ? P.cream : P.pink);
  }
  // the chart line draws itself
  ctx.save();
  clipRect(ctx, 0, 0, headX + 1, H);
  ctx.drawImage(ch.cv, 0, 0);
  ctx.restore();
  const hy = ch.yAt[clamp(headX, 0, W - 1)];
  if (headX > 0) {
    ring(ctx, headX, hy, 3 + (floor(dt * 12) % 2), P.yellow, 0.7);
    r(ctx, headX - 1, hy - 1, 3, 3, P.white);
    if (headX >= 376) {
      // breakout arrow at the top
      const ap = easeOutBack(seg(dt, 1.7, 0.25), 2);
      const ay = round(hy - 6 - 8 * ap);
      for (let k = 0; k < 5; k++) r(ctx, headX - k, ay + k, 2 * k + 1, 1, P.green);
      r(ctx, headX - 1, ay + 5, 3, 5, P.green);
    }
  }

  // tickers on a split-flap board
  mmBoard(ctx, dt);

  // dim the chart behind the lockup
  const dim = seg(dt, 1.9, 0.3);
  if (dim > 0) dfill(ctx, 0, 54, W, 106, P.black, 0.5 * dim);

  // coin fountain
  const cs = dt - (MM_TITLE - 0.25);
  if (cs > 0 && cs < 2.2) {
    for (let i = 0; i < 9; i++) {
      const lt = cs - i * 0.045;
      if (lt <= 0) continue;
      const x0 = 192 + (hash(i * 3) - 0.5) * 120;
      const vx = (hash(i * 5 + 1) - 0.5) * 220;
      const vy = -300 - hash(i * 7 + 2) * 70;
      const x = x0 + vx * lt;
      const y = 228 + vy * lt + 430 * lt * lt;
      if (y > H + 10) continue;
      coin(ctx, x, y, lt * 22 + i);
    }
  }

  // the title in gold: letters drop like coins into slots
  const s = fitScale(info.title, W - 70);
  const T = titleSet(info.title, s, ST_MM);
  const tx = round(192 - T.fw / 2);
  const ty = MM_TY;
  T.letters.forEach((L, i) => {
    const st = MM_TITLE + i * 0.035;
    const p = seg(dt, st, 0.34);
    if (p <= 0) return;
    const yo = round((1 - easeOutBounce(p)) * -34);
    drawLetter(ctx, T, L, tx, ty + yo);
    if (p < 0.12) ctx.drawImage(L.spr.fm, round(tx + L.x) - T.pad, ty + yo - T.pad);
  });
  const done = MM_TITLE + T.letters.length * 0.035 + 0.34;
  glint(ctx, T, tx, ty, seg(dt, done + 0.05, 0.5), 6, P.white);
  const g2 = every(dt, done + 2.0, 2.2, 0.5);
  if (g2 >= 0) glint(ctx, T, tx, ty, g2, 6, P.white);
  // spinning coins bracket the title
  const bp = easeOutBack(seg(dt, done - 0.1, 0.3), 2);
  if (bp > 0) {
    const cy = ty + (T.fh >> 1) + 1;
    coin(ctx, tx - 14 - round((1 - bp) * 30), cy, dt * 10);
    coin(ctx, tx + T.fw + 16 + round((1 - bp) * 30), cy, dt * 10 + 4);
  }
  // gold rules
  const rp = easeOut(seg(dt, done - 0.05, 0.35));
  if (rp > 0) {
    const half = round(170 * rp);
    r(ctx, 192 - half, ty + T.fh + 9, half * 2, 1, P.yellow);
    r(ctx, 192 - half, ty + T.fh + 10, half * 2, 1, P.orange);
    r(ctx, 192 - round(half * 0.6), ty - 9, round(half * 1.2), 1, P.orange);
  }
  // tagline plate + credits
  const tag = fitLines(info.tagline, 300, 1)[0] || '';
  const tp = easeOut(seg(dt, done + 0.05, 0.3));
  if (tp > 0 && tag) {
    const tw = measureText(tag) + 20;
    const vw = round(tw * tp);
    const y = ty + T.fh + 17;
    r(ctx, 192 - (vw >> 1), y, vw, 15, P.darkGreen);
    r(ctx, 192 - (vw >> 1), y, vw, 1, P.green);
    ctx.save();
    clipRect(ctx, 192 - (vw >> 1), y, vw, 15);
    drawText(ctx, tag, 192, y + 5, { color: P.white, align: 'center' });
    ctx.restore();
  }
  const cr = credits(info, 300);
  if (cr) drawCredits(ctx, cr, round(192 - cr.w / 2), ty + T.fh + 40, seg(dt, done + 0.2, 0.35), P.green, P.cream);
  drawBug(ctx, bugX(), bugY(), seg(dt, done + 0.3, 0.25), dt - done - 0.3);
  ctx.restore();
}

// ===========================================================================
// NEWS IN 60 — a stopwatch counting down at speed, hard cuts, a title punch
// ===========================================================================

const N6_BPM = 190;
const N6_B = 60 / N6_BPM;
const N6_PUNCH = 5 * N6_B; // ~1.58 s
const N6_SLAB = { x: 98, y: 70, w: 258, h: 48 };

const N6_TUNE = {
  bpm: N6_BPM,
  wave: 'square',
  // ticking clock, a rising fill, the punch, a racing riff and the stab
  notes: 'E6:0.25 R:0.25 B5:0.25 R:0.25 E6:0.25 R:0.25 B5:0.25 R:0.25 E6:0.25 R:0.25 B5:0.25 R:0.25 E6:0.25 R:0.25 B5:0.25 R:0.25 '
    + 'C6:0.25 D6:0.25 E6:0.25 F#6:0.25 G5+B5+D6+G6:1 '
    + 'D6:0.5 B5:0.5 G5:0.5 B5:0.25 D6:0.25 E6:0.5 D6:0.5 B5:0.5 A5:0.5 G5+B5+D6+G6:2',
  bass: 'G2:0.5 G2:0.5 G2:0.5 G2:0.5 G2:0.5 G2:0.5 G2:0.5 G2:0.5 D2:0.25 D2:0.25 D2:0.25 D2:0.25 G2:1 '
    + 'G2:0.5 G3:0.5 E2:0.5 E3:0.5 C2:0.5 C3:0.5 D2:0.5 D3:0.5 G2:2',
  bassWave: 'square',
  drums: 'K:0.5 H:0.5 K:0.5 H:0.5 K:0.5 H:0.5 K:0.5 H:0.5 S:0.25 S:0.25 S:0.25 S:0.25 K:1 '
    + 'K:0.5 H:0.5 S:0.5 H:0.5 K:0.5 H:0.5 S:0.5 S:0.5 K:2',
};

const ST_N6 = { id: 'n6', face: [P.black, P.black], hi: P.slate, lo: P.black, ext: 3, extC: [P.orange, P.rust, P.rust], out: P.black };
const ST_N6R = { id: 'n6r', face: [P.pink, P.red, P.red], sharp: 3, hi: P.white, lo: P.darkRed, ext: 3, extC: [P.darkRed, P.maroon, P.maroon], out: P.black };

/** Stopwatch body (ring, ticks, crown stem) baked per radius. */
function watchSprite(R, inv = false) {
  return cached(`watch|${R}|${inv ? 1 : 0}`, () => {
    const th = max(3, round(R * 0.09));
    const top = round(R * 0.24) + 2;
    const S = 2 * R + 5;
    const p = new Pix(S, S + top);
    const cx = R + 2;
    const cy = R + 2 + top;
    const ringC = inv ? [P.slate, P.black, P.black] : [P.cream, P.yellow, P.orange];
    const faceC = inv ? P.yellow : P.black;
    // crown stem
    const sw = max(4, round(R * 0.13));
    p.rect(cx - (sw >> 1) - 1, cy - R - top + 2, sw + 2, top, P.black);
    p.rect(cx - (sw >> 1), cy - R - top + 3, sw, top, ringC[1]);
    p.rect(cx - (sw >> 1), cy - R - top + 3, 1, top, ringC[0]);
    for (let y = -R - 1; y <= R + 1; y++) {
      for (let x = -R - 1; x <= R + 1; x++) {
        const d = sqrt(x * x + y * y);
        if (d > R + 0.6) continue;
        let c;
        if (d > R - 0.4) c = P.black;
        else if (d > R - th) {
          const lit = -x - y;
          c = lit > R * 0.5 ? ringC[0] : lit < -R * 0.5 ? ringC[2] : ringC[1];
          if (d > R - th + 1 && d < R - th + 2 && lit > 0) c = ringC[0];
        } else if (d > R - th - 1) c = inv ? P.orange : P.ink;
        else c = faceC;
        p.px(cx + x, cy + y, c);
      }
    }
    // ticks
    for (let k = 0; k < 60; k++) {
      const a = (k / 60) * TAU;
      const big = k % 5 === 0;
      const r0 = R - th - 2;
      const len = big ? max(3, round(R * 0.11)) : max(1, round(R * 0.04));
      for (let q = 0; q < len; q++) {
        const rr = r0 - q;
        p.px(round(cx + sin(a) * rr), round(cy - cos(a) * rr), inv ? (big ? P.black : P.rust) : big ? P.white : P.steel);
        if (big && R > 60) p.px(round(cx + sin(a) * rr + cos(a)), round(cy - cos(a) * rr + sin(a)), inv ? P.black : P.white);
      }
    }
    return { cv: p.canvas(), cx, cy, top };
  });
}

// seven-segment digits: [a, b, c, d, e, f, g]
const SEG7 = ['1111110', '0110000', '1101101', '1111001', '0110011', '1011011', '1011111', '1110000', '1111111', '1111011'];
function seg7(ctx, x, y, w, h, th, digit, on, off, hi) {
  const bits = SEG7[digit] || SEG7[0];
  const hh = (h - th) >> 1;
  const hseg = (sx, sy, len, c) => {
    for (let k = 0; k < th; k++) {
      const inset = floor(abs(k - (th - 1) / 2));
      r(ctx, sx + inset + 1, sy + k, len - 2 * inset - 2, 1, c);
    }
  };
  const vseg = (sx, sy, len, c) => {
    for (let k = 0; k < th; k++) {
      const inset = floor(abs(k - (th - 1) / 2));
      r(ctx, sx + k, sy + inset + 1, 1, len - 2 * inset - 2, c);
    }
  };
  const parts = [
    () => [hseg, x + (th >> 1), y, w - th],
    () => [vseg, x + w - th, y + (th >> 1), hh + 1],
    () => [vseg, x + w - th, y + hh + (th >> 1), hh + 1],
    () => [hseg, x + (th >> 1), y + 2 * hh, w - th],
    () => [vseg, x, y + hh + (th >> 1), hh + 1],
    () => [vseg, x, y + (th >> 1), hh + 1],
    () => [hseg, x + (th >> 1), y + hh, w - th],
  ];
  for (let i = 0; i < 7; i++) {
    const lit = bits[i] === '1';
    if (!lit && !off) continue;
    const [fn, a, b, len] = parts[i]();
    fn(a, b, len, lit ? on : off);
    if (lit && hi && fn === hseg) r(ctx, a + (th >> 1) + 1, b + 1, max(1, len - th - 2), 1, hi);
    if (lit && hi && fn === vseg) r(ctx, a + 1, b + (th >> 1) + 1, 1, max(1, len - th - 2), hi);
  }
}
function number2(ctx, cx, cy, n, dh, on, off, hi, shadow) {
  const dw = round(dh * 0.56);
  const th = max(2, round(dh * 0.13));
  const gap = max(2, round(dh * 0.14));
  const x0 = round(cx - dw - gap / 2);
  const y0 = round(cy - dh / 2);
  const tens = floor(n / 10);
  const ones = n % 10;
  if (shadow) {
    const d = max(2, round(dh / 24));
    seg7(ctx, x0 + d, y0 + d, dw, dh, th, tens, shadow, null, null);
    seg7(ctx, x0 + dw + gap + d, y0 + d, dw, dh, th, ones, shadow, null, null);
  }
  seg7(ctx, x0, y0, dw, dh, th, tens, on, off, hi);
  seg7(ctx, x0 + dw + gap, y0, dw, dh, th, ones, on, off, hi);
}
function hand(ctx, cx, cy, ang, len, tail, color) {
  const dx = sin(ang);
  const dy = -cos(ang);
  ctx.fillStyle = color;
  for (let s = -tail; s <= len; s++) ctx.fillRect(round(cx + dx * s), round(cy + dy * s), 1, 1);
  if (len > 40) for (let s = -tail; s <= len * 0.7; s++) ctx.fillRect(round(cx + dx * s + 1), round(cy + dy * s), 1, 1);
}
function stopwatch(ctx, cx, cy, R, n, ang, { inv = false, digits = true, press = 0 } = {}) {
  const S = watchSprite(R, inv);
  ctx.drawImage(S.cv, round(cx) - S.cx, round(cy) - S.cy);
  // crown button
  const bw = round(R * 0.32);
  const bh = max(3, round(R * 0.09));
  const by = round(cy - R - S.top - bh + 2 + press);
  r(ctx, round(cx) - (bw >> 1) - 1, by - 1, bw + 2, bh + 2, P.black);
  r(ctx, round(cx) - (bw >> 1), by, bw, bh, inv ? P.slate : P.yellow);
  r(ctx, round(cx) - (bw >> 1), by, bw, 1, inv ? P.steel : P.cream);
  r(ctx, round(cx) - (bw >> 1), by + bh - 1, bw, 1, inv ? P.black : P.orange);
  if (digits) {
    const dh = round(R * 0.62);
    number2(ctx, cx, cy + round(R * 0.06), n, dh, inv ? P.black : P.yellow, inv ? rgba(P.orange, 0.35) : rgba(P.slate, 0.45), inv ? null : P.cream, null);
  }
  hand(ctx, cx, cy, ang, R - round(R * 0.2), round(R * 0.14), P.red);
  r(ctx, round(cx) - 1, round(cy) - 1, 3, 3, inv ? P.black : P.white);
  r(ctx, round(cx), round(cy), 1, 1, P.red);
}

function n6Count(dt) {
  return clamp(60 - floor(seg(dt, 0.12, N6_PUNCH - 0.16) * 61), 0, 60);
}

function drawNews60(ctx, t, dt, info) {
  const [sx, sy] = shake(dt, N6_PUNCH + 0.07, 0.3, 4);
  ctx.save();
  ctx.translate(sx, sy);
  if (dt < N6_PUNCH) n6Countdown(ctx, dt);
  else n6Lockup(ctx, t, dt, info);
  ctx.restore();
}

function n6Countdown(ctx, dt) {
  const n = n6Count(dt);
  const shot = min(4, floor(dt / N6_B));
  const lt = dt - shot * N6_B;
  const ang = dt * 13;
  const eighth = floor(dt / (N6_B / 2));
  switch (shot) {
    case 0: {
      r(ctx, -4, -4, W + 8, H + 8, P.black);
      drawStripes(ctx, 0, 0, W, H, dt * 3, P.black, P.ink);
      disc(ctx, 192, 112, 86, P.black);
      stopwatch(ctx, 192, 116, 72, n, ang, { press: lt < 0.09 ? 3 : 0 });
      break;
    }
    case 1: {
      r(ctx, -4, -4, W + 8, H + 8, P.yellow);
      drawStripes(ctx, 0, 0, W, 10, dt * 6, P.yellow, P.black);
      drawStripes(ctx, 0, H - 10, W, 10, -dt * 6, P.yellow, P.black);
      const push = round(lt * 12);
      number2(ctx, 192, 110, n, 150 + push, P.black, rgba(P.orange, 0.45), null, P.orange);
      break;
    }
    case 2: {
      r(ctx, -4, -4, W + 8, H + 8, P.black);
      stopwatch(ctx, 108 + round(lt * 10), 114, 62, n, ang);
      const lit = eighth % 4;
      for (let k = 0; k < 4; k++) {
        const bx = 214 + (k % 2) * 82;
        const by = 30 + (k >> 1) * 82;
        r(ctx, bx, by, 76, 76, k === lit ? P.yellow : P.ink);
        if (k === lit) {
          r(ctx, bx, by + 70, 76, 6, P.orange);
          drawText(ctx, String(n), bx + 38, by + 24, { color: P.black, scale: 4, align: 'center' });
        }
      }
      break;
    }
    case 3: {
      r(ctx, -4, -4, W + 8, H + 8, P.yellow);
      for (let k = 0; k < 9; k++) {
        const y = 14 + k * 23;
        const x = floor((-(dt * 900) - hash(k) * 400) % 500) + 500 - 100;
        r(ctx, x, y, 60 + floor(hash(k * 3) * 80), 2, P.orange);
      }
      stopwatch(ctx, 232, 114, 80 + round(lt * 16), n, ang, { inv: true });
      r(ctx, 0, 0, 22, H, P.black);
      r(ctx, 22, 0, 4, H, P.orange);
      break;
    }
    default: {
      r(ctx, -4, -4, W + 8, H + 8, P.black);
      stopwatch(ctx, 192, 150, 150, n, ang, { digits: false });
      number2(ctx, 192, 140, n, 96, P.yellow, rgba(P.slate, 0.4), P.cream, P.darkRed);
      break;
    }
  }
  // flash block on every hard cut
  if (lt < 0.035 && shot > 0) {
    const side = shot % 2;
    r(ctx, side ? W - 128 : 0, 0, 128, H, shot % 2 ? P.white : P.yellow);
  }
  // red "seconds" tag
  r(ctx, 8, 8, 44, 13, P.red);
  r(ctx, 8, 20, 44, 1, P.darkRed);
  drawText(ctx, 'SEC', 30, 11, { color: P.white, align: 'center' });
  if (dt > N6_PUNCH - 0.07) dfill(ctx, 0, 0, W, H, P.white, seg(dt, N6_PUNCH - 0.07, 0.07));
}

function n6Lockup(ctx, t, dt, info) {
  const lt = dt - N6_PUNCH;
  r(ctx, -4, -4, W + 8, H + 8, P.black);
  drawStripes(ctx, 0, 0, W, H, dt * 2, P.black, P.ink);
  const vg = cached('n6vig', () => {
    const p = new Pix(W, H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const d = Math.hypot((x - 210) / 240, (y - 94) / 150);
        if (d < 0.75 && bayer(x, y) < (0.75 - d) * 2.2) p.d[y * W + x] = u32(P.black);
      }
    }
    return p.canvas();
  });
  ctx.drawImage(vg, 0, 0);

  // radial burst
  if (lt < 0.45) {
    const k = lt / 0.45;
    ctx.fillStyle = k < 0.3 ? P.white : P.yellow;
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * TAU + 0.12;
      const r0 = 40 + k * 160;
      const r1 = r0 + 70 * (1 - k);
      for (let d = r0; d < r1; d += 3) ctx.fillRect(round(226 + cos(a) * d), round(94 + sin(a) * d * 0.7), 2, 2);
    }
  }
  // hazard bars
  const hz = easeOut(seg(lt, 0.08, 0.2));
  if (hz > 0) {
    const hw = round(W * hz);
    drawStripes(ctx, 0, 0, hw, 8, dt * 3, P.yellow, P.black);
    drawStripes(ctx, W - hw, H - 8, hw, 8, -dt * 3, P.yellow, P.black);
    r(ctx, 0, 8, hw, 1, P.orange);
    r(ctx, W - hw, H - 9, hw, 1, P.orange);
  }

  // the slab
  const { x: SX, y: SY, w: SW, h: SH } = N6_SLAB;
  const slab = cached('n6slab', () => {
    const p = new Pix(SW + SH / 2 + 8, SH + 4);
    for (let y = 0; y < SH; y++) {
      const off = (SH - 1 - y) >> 1;
      const c = y < 2 ? P.cream : y >= SH - 4 ? P.orange : P.yellow;
      p.rect(off, y, SW, 1, c);
      p.rect(off + SW + 4, y, 4, 1, P.red);
    }
    for (let y = SH; y < SH + 4; y++) p.rect(((SH - 1 - y) >> 1) + 4, y, SW, 1, P.rust);
    return p.canvas();
  });
  const sp = seg(lt, 0, 0.12);
  const sw = round(SW * easeOutBack(sp, 1.4));
  ctx.save();
  clipRect(ctx, SX - 30, SY - 4, sw + 40, SH + 12);
  ctx.drawImage(slab, SX - 12, SY);
  ctx.restore();
  if (lt < 0.07) r(ctx, SX - 12, SY - 2, sw + 30, 2, P.white);

  // title punch
  const words = normalizeText(info.title || '').split(' ');
  const last = words.length > 1 && /^\d+$/.test(words[words.length - 1]) ? words.pop() : '';
  const head = words.join(' ');
  const s = fitScale(info.title, SW - 34);
  const T1 = titleSet(head, s, ST_N6);
  const T2 = last ? titleSet(last, s, ST_N6R) : null;
  const tw = T1.fw + (T2 ? 3 * s + T2.fw : 0);
  const tx = round(SX + 14 + (SW - 28 - tw) / 2);
  const ty = SY + ((SH - T1.fh) >> 1) - 1;
  const lettersOf = (T, ox, i0) => T.letters.forEach((L, i) => {
    const st = 0.06 + (i0 + i) * 0.028;
    const p = seg(lt, st, 0.1);
    if (p <= 0) return;
    const yo = p < 1 ? round(-6 * (1 - easeOutBack(p, 3))) : 0;
    if (p < 0.5) ctx.drawImage(L.spr.fm, round(ox + L.x) - T.pad, ty + yo - T.pad);
    else drawLetter(ctx, T, L, ox, ty + yo);
  });
  lettersOf(T1, tx, 0);
  if (T2) lettersOf(T2, tx + T1.fw + 3 * s, T1.letters.length);
  const gl = every(lt, 0.7, 2.0, 0.45);
  if (gl >= 0) {
    glint(ctx, T1, tx, ty, gl, 4, P.slate);
    if (T2) glint(ctx, T2, tx + T1.fw + 3 * s, ty, gl, 4, P.white);
  }

  // the stopwatch icon, stepped pop with overshoot
  const ip = lt < 0.05 ? 0 : lt < 0.1 ? 22 : lt < 0.15 ? 34 : lt < 0.21 ? 32 : 30;
  if (ip) {
    const tick = floor(lt * 4);
    const wob = lt * 4 - tick < 0.25 ? 0.08 * sin((lt * 4 - tick) * TAU * 2) : 0;
    stopwatch(ctx, 74, 98, ip, 60, (tick / 60) * TAU * 5 + wob, { digits: true });
  }

  // corner blocks flash on the beat
  const beat = floor(dt / (N6_B / 2));
  if (lt > 0.3) {
    const k = beat % 4;
    const bx = [SX + SW + 18, SX + SW + 18, SX - 14, SX - 14][k];
    const by = [SY - 14, SY + SH + 6, SY + SH + 6, SY - 14][k];
    if (k < 2) r(ctx, bx, by, 8, 8, k % 2 ? P.red : P.yellow);
  }

  // tagline + credits slam in from the right
  const tag = fitLines(info.tagline, 280, 1)[0] || '';
  const tp = easeOutBack(seg(lt, 0.4, 0.22), 1.6);
  if (tp > 0 && tag) {
    const x = round(SX + 14 + (1 - tp) * 260);
    const y = SY + SH + 14;
    r(ctx, x - 6, y - 4, measureText(tag) + 12, 15, P.black);
    r(ctx, x - 6, y - 4, 3, 15, P.yellow);
    drawText(ctx, tag, x + 2, y, { color: P.white });
  }
  const cr = credits(info, 260);
  const cp = easeOutBack(seg(lt, 0.52, 0.22), 1.6);
  if (cr && cp > 0) drawCredits(ctx, cr, round(SX + 22 + (1 - cp) * 260), SY + SH + 30, 1, P.fog, P.yellow);
  drawBug(ctx, bugX(), bugY() - 4, seg(lt, 0.7, 0.2), lt - 0.7);

  // the punch flash
  if (lt < 0.035) r(ctx, -4, -4, W + 8, H + 8, P.white);
  else if (lt < 0.07) dfill(ctx, 0, 0, W, H, P.yellow, 0.75);
}

// ===========================================================================
// Fallback: a generic GLOBIT 24 open for any other programme
// ===========================================================================

const GEN_TUNE = {
  bpm: 146,
  wave: 'square',
  notes: 'C5:0.5 G4:0.25 C5:0.25 E5:0.5 G5:0.5 C6:1 B5:0.5 G5:0.5 A5:0.5 G5:0.25 E5:0.25 F5:0.5 A5:0.5 G5:1 E5:0.5 F5:0.5 D5:0.5 B4:0.5 C5+E5+G5+C6:2',
  bass: 'C3:1 C3:1 A2:1 F2:1 G2:1 G2:1 F2:1 G2:1 G2:0.5 B2:0.5 C3:2',
  bassWave: 'triangle',
  drums: 'K:1 S:1 K:1 S:1 K:1 S:1 K:1 S:1 K:0.5 S:0.5 K:2',
};
const ST_GEN = { id: 'gen', face: [P.white, P.white, P.silver, P.silver], sharp: 6, hi: P.white, lo: P.fog, ext: 3, extC: [P.darkRed, P.darkRed, P.maroon], out: P.black };

function drawGeneric(ctx, t, dt, info) {
  r(ctx, 0, 0, W, H, P.black);
  drawStripes(ctx, 0, 0, W, H, dt, P.ink, P.black);
  const gp = seg(dt, 0, 0.4);
  if (gp < 1) dfill(ctx, 0, 0, W, H, P.black, 1 - gp);
  // brand bars sweep through
  for (const b of WN_BARS) {
    const p = seg(dt, b.s, b.d);
    if (p > 0 && p < 1) ctx.drawImage(barSprite(b.len, b.h, b.c), barX(b, dt), b.y);
  }
  const text = String(info.title || 'GLOBIT 24');
  let s = fitScale(text, 340);
  let lines = [text];
  if (measureText(text, s) > 340) {
    lines = wrapText(text, 340, 3).slice(0, 2);
    s = 3;
  }
  const BH = lines.length * (7 * s + 6) + 12;
  const BY = round(92 - BH / 2);
  const op = seg(dt, 0.55, 0.25);
  if (op > 0) {
    const hh = max(2, round(BH * easeOutBack(op, 1.8)));
    const y0 = BY + ((BH - hh) >> 1);
    r(ctx, 0, y0, W, hh, P.red);
    r(ctx, 0, y0, W, 1, P.pink);
    if (hh > 8) r(ctx, 0, y0 + hh - 3, W, 3, P.darkRed);
  }
  lines.forEach((ln, i) => {
    const T = titleSet(ln, s, ST_GEN);
    const p = seg(dt, 0.8 + i * 0.12, 0.3);
    if (p <= 0) return;
    const x = round(192 - T.fw / 2);
    const y = BY + 8 + i * (7 * s + 6);
    ctx.save();
    clipRect(ctx, 0, BY, W, BH);
    drawTitle(ctx, T, x, y + round((1 - easeOutBack(p, 1.6)) * (BH + 4)));
    ctx.restore();
    glint(ctx, T, x, y, seg(dt, 1.6, 0.5), 6);
  });
  const tag = fitLines(info.tagline, 330, 1)[0] || '';
  if (tag) drawText(ctx, typed(tag, seg(dt, 1.3, 0.5)), 192 - (measureText(tag) >> 1), BY + BH + 12, { color: P.white });
  const cr = credits(info, 330);
  if (cr) drawCredits(ctx, cr, round(192 - cr.w / 2), BY + BH + 28, seg(dt, 1.6, 0.4), P.fog, P.silver);
  drawBug(ctx, bugX(), bugY(), seg(dt, 2.0, 0.25), dt - 2.0);
}

// ===========================================================================
// Registry + public API
// ===========================================================================

export const OPENS = {
  'world-now': { duration: 4.5, tune: WN_TUNE, draw: drawWorldNow },
  'tech-bytes': { duration: 4.5, tune: TB_TUNE, draw: drawTechBytes },
  cosmos: { duration: 4.5, tune: CO_TUNE, draw: drawCosmos },
  'money-minute': { duration: 4.0, tune: MM_TUNE, draw: drawMoneyMinute },
  'news-60': { duration: 3.5, tune: N6_TUNE, draw: drawNews60 },
};
const FALLBACK = { duration: 4.0, tune: GEN_TUNE, draw: drawGeneric };

function normInfo(info) {
  const i = info || {};
  return {
    title: String(i.title || i.channel || 'GLOBIT 24'),
    tagline: String(i.tagline || ''),
    presenters: Array.isArray(i.presenters) ? i.presenters : [],
    date: String(i.date || ''),
    channel: String(i.channel || 'GLOBIT 24'),
  };
}

/** Draw the opening titles of a programme (full frame). */
export function drawOpen(ctx, t, dt, programId, info) {
  const open = OPENS[programId] || FALLBACK;
  const d = Number.isFinite(dt) ? max(0, dt) : 0;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  try {
    open.draw(ctx, Number.isFinite(t) ? t : d, d, normInfo(info));
  } catch (err) {
    // never leave the screen broken: a plain branded card instead
    r(ctx, 0, 0, W, H, P.black);
    r(ctx, 0, 90, W, 36, P.red);
    drawText(ctx, normInfo(info).title, 192, 101, { color: P.white, scale: 2, align: 'center' });
    if (!drawOpen.warned) {
      drawOpen.warned = true;
      console.warn('[opens] draw failed', err);
    }
  }
  ctx.restore();
}

/** Timing and theme tune for a programme's open. */
export function openFor(programId) {
  const open = OPENS[programId] || FALLBACK;
  return { duration: open.duration, tune: open.tune };
}

// Warm the heavy caches in the background so the first open never stutters.
if (HAS_DOM && typeof setTimeout === 'function') {
  const jobs = [
    () => globeTex(),
    ...[52, 64, 74, 84, 90, 88, 86].map((R) => () => globeTable(R)),
    () => wnBg(),
    () => tbBoardLayer(false),
    () => tbBoardLayer(true),
    () => coBg(),
    () => coPlanet(),
    () => mmChart(),
    () => watchSprite(150),
    () => watchSprite(72),
  ];
  let j = 0;
  const step = () => {
    if (j >= jobs.length) return;
    try {
      jobs[j++]();
    } catch {
      j = jobs.length;
    }
    setTimeout(step, 40);
  };
  setTimeout(step, 600);
}
