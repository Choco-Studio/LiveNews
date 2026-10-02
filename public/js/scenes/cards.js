// Full-screen broadcast graphics: show open / close, standby test card, start
// screen, cold-open headline montage, breaking-news sting, key-fact card and
// the branded stinger wipe.
//
// Everything is drawn on the fixed 384x216 canvas with integer coordinates and
// the channel palette only. Smooth-looking gradients are ordered (Bayer)
// dithers between palette colours; translucent palette colours are used only
// for glows, shades and light sweeps. Static layers are cached on lazily
// created offscreen canvases.
import { P } from '../palette.js';
import { drawText, measureText, wrapText, normalizeText, ASCENT } from '../font.js';
import { r, mulberry32, clamp, easeOut, easeInOut, zoneTime, longDate } from '../util.js';

export const STINGER_DURATION = 0.8; // seconds

const W = 384;
const H = 216;
const TAU = Math.PI * 2;
const DEG = 180 / Math.PI;

// ---------------------------------------------------------------------------
// Small helpers

const round = Math.round;
const lerp = (a, b, k) => a + (b - a) * k;
/** Progress (0..1) of a timeline segment that starts at `start` and lasts `dur`. */
const seg = (x, start, dur) => clamp((x - start) / dur, 0, 1);
const easeIn = (x) => clamp(x, 0, 1) ** 3;
function easeOutBack(x, s = 1.70158) {
  const v = clamp(x, 0, 1) - 1;
  return 1 + (s + 1) * v * v * v + s * v * v;
}
/** Repeating accent: returns 0..1 while a periodic sweep is running, else -1. */
function every(time, start, period, dur) {
  if (time < start) return -1;
  const ph = (time - start) % period;
  return ph < dur ? ph / dur : -1;
}
function hash2(a, b) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d').imageSmoothingEnabled = false;
  return c;
}

const hexRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const u32 = (hex, a = 255) => {
  const [cr, cg, cb] = hexRgb(hex);
  return ((a << 24) | (cb << 16) | (cg << 8) | cr) >>> 0;
};
const rgbaCache = new Map();
/** A palette colour with alpha, for glows and shades. */
function rgba(hex, a) {
  const key = hex + a;
  let s = rgbaCache.get(key);
  if (!s) {
    const [cr, cg, cb] = hexRgb(hex);
    s = `rgba(${cr},${cg},${cb},${a})`;
    rgbaCache.set(key, s);
  }
  return s;
}

const memo = new Map();
function cached(key, fn) {
  let v = memo.get(key);
  if (v === undefined) {
    v = fn();
    if (memo.size > 300) memo.delete(memo.keys().next().value);
    memo.set(key, v);
  }
  return v;
}

// --- ordered dithering ------------------------------------------------------

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayerAt = (x, y) => (BAYER[((y & 3) << 2) | (x & 3)] + 0.5) / 16;

const patCache = new Map();
/** Fill style that covers `level` (0..1) of the pixels with `hex` in a Bayer pattern. */
function dither(hex, level) {
  const n = clamp(round(level * 16), 0, 16);
  if (n === 0) return null;
  if (n === 16) return hex;
  const key = hex + n;
  let p = patCache.get(key);
  if (!p) {
    const c = mkCanvas(4, 4);
    const x = c.getContext('2d');
    x.fillStyle = hex;
    for (let i = 0; i < 16; i++) if (BAYER[i] < n) x.fillRect(i & 3, i >> 2, 1, 1);
    p = x.createPattern(c, 'repeat');
    patCache.set(key, p);
  }
  return p;
}
function dfill(ctx, x, y, w, h, hex, level) {
  const f = dither(hex, level);
  if (!f) return;
  ctx.fillStyle = f;
  ctx.fillRect(x, y, w, h);
}

/** Build a canvas pixel by pixel; fn(x, y) returns a packed colour. */
function field(w, h, fn) {
  const c = mkCanvas(w, h);
  const x = c.getContext('2d');
  const img = x.createImageData(w, h);
  const d = new Uint32Array(img.data.buffer);
  for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) d[y * w + xx] = fn(xx, y);
  x.putImageData(img, 0, 0);
  return c;
}
/** Dithered colour ramp: v in [0, colors.length - 1]. */
function ramp(colors) {
  const u = colors.map((c) => u32(c));
  const n = u.length - 1;
  return (v, x, y) => {
    const i = Math.floor(clamp(v, 0, n) + bayerAt(x, y) - 0.5);
    return u[clamp(i, 0, n)];
  };
}

// --- shapes -----------------------------------------------------------------

/** Rows of a parallelogram: top-left at (x0, y0), left edge shifts `slope` px per row. */
function slabRows(x0, y0, w, h, slope, cb) {
  x0 = round(x0);
  y0 = round(y0);
  w = round(w);
  h = round(h);
  if (w <= 0 || h <= 0) return;
  if (!slope) {
    cb(x0, y0, w, h);
    return;
  }
  let row = 0;
  while (row < h) {
    const off = Math.floor(row * slope);
    let end = row + 1;
    while (end < h && Math.floor(end * slope) === off) end++;
    cb(x0 + off, y0 + row, w, end - row);
    row = end;
  }
}
function slab(ctx, x0, y0, w, h, slope, color) {
  ctx.fillStyle = color;
  slabRows(x0, y0, w, h, slope, (x, y, ww, hh) => ctx.fillRect(x, y, ww, hh));
}
function clipSlab(ctx, x0, y0, w, h, slope) {
  ctx.beginPath();
  slabRows(x0, y0, w, h, slope, (x, y, ww, hh) => ctx.rect(x, y, ww, hh));
  ctx.clip();
}
function clipRect(ctx, x, y, w, h) {
  ctx.beginPath();
  ctx.rect(round(x), round(y), round(w), round(h));
  ctx.clip();
}

/** 1px circle outline (midpoint algorithm), optionally dithered to `level`. */
function ring(ctx, cx, cy, rad, color, level = 1) {
  if (rad < 1) return;
  ctx.fillStyle = color;
  const n = level * 16;
  const plot = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    if (n >= 16 || BAYER[((y & 3) << 2) | (x & 3)] < n) ctx.fillRect(x, y, 1, 1);
  };
  let x = rad;
  let y = 0;
  let err = 1 - rad;
  while (x >= y) {
    plot(cx + x, cy + y);
    plot(cx + y, cy + x);
    plot(cx - y, cy + x);
    plot(cx - x, cy + y);
    plot(cx - x, cy - y);
    plot(cx - y, cy - x);
    plot(cx + y, cy - x);
    plot(cx + x, cy - y);
    y++;
    if (err < 0) err += 2 * y + 1;
    else {
      x--;
      err += 2 * (y - x) + 1;
    }
  }
}

/** Half widths of a pixel disc, one per row from -rad to +rad. */
function discSpans(rad) {
  return cached(`disc${rad}`, () => {
    const out = [];
    for (let dy = -rad; dy <= rad; dy++) out.push(Math.floor(Math.sqrt((rad + 0.5) ** 2 - dy * dy)));
    return out;
  });
}
function disc(ctx, cx, cy, rad, color) {
  ctx.fillStyle = color;
  discSpans(rad).forEach((hw, i) => ctx.fillRect(cx - hw, cy - rad + i, hw * 2 + 1, 1));
}
function discOutline(ctx, cx, cy, rad, color) {
  const sp = discSpans(rad);
  ctx.fillStyle = color;
  for (let i = 0; i < sp.length; i++) {
    const hw = sp[i];
    const nb = Math.min(i > 0 ? sp[i - 1] : -1, i < sp.length - 1 ? sp[i + 1] : -1);
    const inner = clamp(nb + 1, 0, hw);
    const y = cy - rad + i;
    ctx.fillRect(cx + inner, y, hw - inner + 1, 1);
    ctx.fillRect(cx - hw, y, hw - inner + 1, 1);
  }
}

// --- text -------------------------------------------------------------------

function fitScale(text, maxW, maxScale, minScale = 1) {
  for (let s = maxScale; s > minScale; s--) if (measureText(text, s) <= maxW) return s;
  return minScale;
}
function ellipsis(text, maxW, scale = 1, force = false) {
  let s = normalizeText(text).trim();
  if (!force && measureText(s, scale) <= maxW) return s;
  while (s.length && measureText(`${s}...`, scale) > maxW) s = s.slice(0, -1).trimEnd();
  return `${s}...`;
}
/** Word-wrap, clip over-long words and cap the line count with an ellipsis. */
function wrapClamp(text, maxW, scale, maxLines) {
  return cached(`wc|${text}|${maxW}|${scale}|${maxLines}`, () => {
    let lines = wrapText(normalizeText(text || ''), maxW, scale).map((l) => ellipsis(l, maxW, scale));
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      lines[maxLines - 1] = ellipsis(lines[maxLines - 1], maxW, scale, true);
    }
    return lines;
  });
}
/** Biggest layout (scale 2 in up to `big` lines, else scale 1) that fits. */
function layoutText(text, maxW, big = 3, small = 5) {
  return cached(`lay|${text}|${maxW}|${big}|${small}`, () => {
    const two = wrapText(normalizeText(text || ''), maxW, 2);
    if (two.length <= big && two.every((l) => measureText(l, 2) <= maxW)) return { scale: 2, lines: two, lh: 20 };
    return { scale: 1, lines: wrapClamp(text, maxW, 1, small), lh: 11 };
  });
}
/** Glyph x offsets for per-letter animation. */
function letters(text, scale) {
  return cached(`let|${text}|${scale}`, () => {
    const out = [];
    let prefix = '';
    for (const ch of normalizeText(text)) {
      out.push({ ch, x: prefix ? measureText(prefix, scale) + scale : 0 });
      prefix += ch;
    }
    return out;
  });
}
function chars(text) {
  return cached(`chars|${text}`, () => Array.from(normalizeText(text || '')));
}
/** Block-extruded text: a stack of offset copies gives 16-bit title depth. */
function extruded(ctx, text, x, y, scale, color, depthColor, depth = scale, align = 'left') {
  for (let d = depth; d >= 1; d--) drawText(ctx, text, x + d, y + d, { color: depthColor, scale, align });
  drawText(ctx, text, x, y, { color, scale, align });
}
/** Text that rises into place from behind a mask at its own baseline. */
function riseText(ctx, text, x, y, p, opts) {
  if (p <= 0) return;
  const s = opts.scale || 1;
  const top = y - ASCENT * s;
  const h = (ASCENT + 8) * s;
  const oy = round((1 - easeOut(p)) * 9 * s);
  ctx.save();
  clipRect(ctx, 0, top, W, h);
  drawText(ctx, text, x, y + oy, opts);
  ctx.restore();
}
/** Re-draw text in a light colour inside a slanted band (a glint). */
function textGlint(ctx, text, x, y, scale, bandX, bandW, color = P.white, align = 'left') {
  const top = y - ASCENT * scale;
  const h = (ASCENT + 8) * scale;
  ctx.save();
  clipSlab(ctx, bandX, top, bandW, h, -0.5);
  drawText(ctx, text, x, y, { color, scale, align });
  ctx.restore();
}
function typed(text, p) {
  const cs = chars(text);
  return cs.slice(0, Math.ceil(cs.length * clamp(p, 0, 1))).join('');
}

// ---------------------------------------------------------------------------
// World data: coarse coastlines (lon, lat pairs) for the globe and dot maps.

const LAND_POLYS = [
  // North America
  [-168, 66, -162, 70, -156, 71.2, -140, 69.8, -128, 70.2, -115, 68.7, -105, 68, -95, 71, -88, 68.5, -82, 69.5, -80, 66, -78, 62.5, -72, 61.5, -65, 60, -61, 56, -56, 52, -59.5, 47.5, -64, 48.8, -66, 45, -70, 43.5, -70, 41.7, -74, 40.5, -76, 38, -76, 35, -81, 31.5, -80, 27, -80.5, 25.2, -82, 26, -83, 28.5, -84.5, 30, -88, 30.3, -90, 29, -94, 29.6, -97.3, 27.5, -97.6, 22.5, -95.5, 18.7, -91.5, 18.6, -90.5, 21, -87, 21.5, -88.3, 17.5, -88.5, 15.8, -84, 15.8, -83.4, 13, -83.6, 10.8, -82, 9, -79.6, 9.6, -77.4, 8.6, -77.9, 7.2, -80, 7.5, -81.5, 8.2, -84, 9.5, -85.7, 11, -87.5, 13.2, -91.4, 14, -94, 16, -96.5, 15.7, -100, 17, -103.5, 18.3, -105.6, 20.5, -108, 25, -110.5, 27.8, -112.8, 30.5, -114.8, 31.8, -114, 30, -112.5, 27.5, -111, 25.5, -109.9, 22.9, -112, 24.8, -114.2, 28, -115.6, 30, -117.1, 32.5, -118.5, 34, -120.6, 34.6, -122.5, 37.5, -123.8, 39.8, -124.3, 42, -124, 46.2, -124.7, 48.4, -123.2, 49, -127.5, 50.5, -130.5, 54, -133, 57, -136, 58.3, -139.5, 59.7, -144, 60, -148, 60.7, -151.5, 59.3, -154, 57.4, -158, 56.5, -163, 55, -164.7, 54.6, -160, 58.5, -157.5, 58.7, -162, 59.8, -164.5, 60.6, -166, 62, -164.6, 63.3, -161, 64.2, -166, 65.5],
  // South America
  [-77.4, 8.6, -75.5, 10.5, -72, 11.8, -71.2, 12.5, -70, 11.5, -67.5, 10.6, -63, 10.7, -61, 10.3, -60, 8.5, -57, 6, -52, 5, -50, 1.7, -48.5, -0.5, -44.2, -2.5, -41, -2.9, -37, -4.8, -35, -6, -35, -9, -37.5, -12.5, -39, -15, -39.2, -17.8, -40.5, -21, -42, -23, -44.5, -23.3, -48.5, -26, -48.6, -28.5, -51, -31.5, -53, -33.8, -55, -34.9, -57.5, -34.5, -58.5, -34.2, -57.2, -36, -57.6, -38.2, -62, -39, -62.3, -40.6, -65, -41, -65, -42.4, -63.7, -42.8, -65.3, -44.5, -67.5, -46, -66, -48, -69, -50.5, -68.4, -52.3, -66.5, -55, -70, -55.2, -72, -53.5, -74.5, -52, -75.5, -47, -74, -44, -73.5, -41.5, -73.6, -37.5, -71.5, -32.5, -71.4, -28.5, -70.5, -23, -70.2, -18.4, -71.4, -17.6, -75, -15.3, -76.4, -13.5, -79, -8.2, -81.2, -6, -81.1, -4.3, -80, -2.3, -80.9, -1, -80, 1, -78.9, 1.7, -77.5, 4, -77.3, 6.5, -77.9, 7.2],
  // Eurasia
  [-9, 37, -8.9, 40.5, -8.8, 42.5, -9.2, 43.2, -7, 43.6, -3.8, 43.4, -1.8, 43.4, -1.2, 45.5, -1.2, 46.3, -2.2, 47.2, -4.5, 47.9, -4.7, 48.6, -3, 48.8, -1.5, 48.7, -1.4, 49.7, 0.2, 49.5, 1.5, 50.2, 1.7, 51, 3.5, 51.4, 5, 53.3, 7, 53.6, 8.6, 53.9, 8.4, 55.4, 8.1, 56.6, 10.3, 57.6, 10.5, 56.5, 10.2, 55.6, 9.6, 55, 10.9, 54.4, 12.5, 54.4, 14.3, 53.9, 16.5, 54.6, 18.6, 54.7, 19.9, 54.9, 21, 55.8, 21, 56.8, 21.6, 57.4, 23.5, 57.2, 24.3, 57.8, 23.4, 58.7, 24.5, 59.5, 28, 59.6, 29.5, 60, 28, 60.6, 26, 60.4, 22.9, 59.9, 21.4, 60.8, 21.3, 62.3, 22.3, 63.6, 25, 65, 25.4, 65.7, 23, 65.9, 21.5, 65.4, 21.2, 64.4, 19, 63.4, 17.6, 62.4, 17.3, 60.8, 18.7, 60, 18.5, 59.3, 16.6, 57.4, 16, 56.2, 14.3, 55.5, 12.9, 55.5, 12.6, 56.3, 11.8, 58.2, 11.2, 59, 10.5, 59.6, 8.5, 58.2, 6.6, 58, 5.6, 58.9, 5, 60.2, 5, 61.8, 6.5, 62.7, 8.6, 63.5, 10.5, 64.5, 12.4, 66.1, 14.7, 67.9, 16, 68.8, 18.5, 69.8, 21.5, 70.2, 24, 70.9, 28, 71.1, 30.7, 70.1, 33, 69.4, 37, 69, 40.7, 67.8, 41.3, 66.6, 38, 66.1, 35, 66.4, 33.2, 66.6, 34.8, 65, 36.9, 64.4, 37.5, 63.8, 40, 64.6, 40.5, 65, 43, 66.3, 44, 67, 44, 68.3, 46, 68, 46.4, 67.2, 48, 67.6, 53.5, 68.6, 57, 68.6, 60, 69, 60.6, 69.9, 64, 69.4, 66.8, 69.6, 67.2, 71.5, 69, 72.8, 72.8, 72.7, 72.5, 71.2, 72, 70.1, 73.6, 68.6, 72.6, 66.9, 74, 67.5, 74.7, 68.8, 73.2, 71.5, 75, 72.6, 76.7, 72, 78, 72.4, 80, 72.4, 80.5, 73.6, 86.8, 73.9, 87.2, 75.1, 92, 75.8, 96, 76.1, 101, 77, 104.3, 77.7, 106, 77.3, 107, 76.5, 112, 76.1, 113.5, 75.3, 112, 73.5, 113.5, 73.4, 117, 73.6, 119, 73.1, 123, 73, 126.6, 72.4, 128.5, 72.8, 129, 71, 131, 70.8, 132.4, 71.8, 135.6, 71.6, 138, 71.6, 139.9, 72.4, 141.3, 72.8, 143, 72.7, 149, 72.2, 150.4, 71.6, 152.9, 70.8, 158, 71, 160, 70.4, 159.7, 69.7, 162, 69.6, 166, 69.5, 168, 69.9, 170.5, 70.1, 175, 69.8, 180, 69, 180, 65, 178.7, 64.5, 177, 64, 179, 62.4, 174, 61.8, 170.7, 60.3, 166.3, 59.8, 165, 60.1, 163.5, 59.9, 162, 58, 163.2, 57.6, 162, 56.1, 161.7, 55.3, 159.5, 53.2, 158.4, 52.9, 156.8, 51, 156, 52.8, 155.4, 56, 155.9, 56.8, 156.8, 57.4, 158.4, 58, 160.2, 59.3, 162, 60.3, 160, 60.6, 158, 61.8, 154.2, 59.8, 151.3, 58.8, 148.3, 59.3, 145.5, 59.3, 142.2, 59, 138.5, 56.5, 136.8, 54.6, 137.2, 53.9, 139, 54.1, 141.3, 53.1, 141.4, 52.2, 140.5, 50.4, 140.1, 48.4, 138.2, 46.6, 136.8, 45.2, 135.5, 43.9, 133.5, 42.8, 131.9, 43, 130.8, 42.3, 129.7, 41, 129.4, 37.3, 129.4, 35.7, 127.4, 34.5, 126.4, 34.6, 126.3, 37.2, 125.3, 37.8, 124.6, 39.6, 122.9, 40.4, 121.1, 40.9, 121.5, 40.9, 119, 39.2, 118, 39, 117.5, 38.6, 118.8, 37.4, 120.8, 37.8, 122.5, 37.4, 121, 36.7, 120.4, 36, 119.2, 34.9, 120.5, 33.5, 121.5, 32, 121.9, 31, 121, 30.3, 121.9, 29.4, 121.4, 28, 120, 26.6, 119.5, 25.5, 118.7, 24.6, 116.5, 23, 115, 22.7, 113.7, 22.3, 112.5, 21.8, 110.5, 21.2, 110.4, 20.3, 109.6, 21.5, 108.5, 21.6, 107, 20.8, 106, 19.9, 105.7, 18.9, 106.5, 17.9, 107.4, 16.6, 108.4, 15.4, 109.3, 13.4, 109.2, 11.6, 108.3, 11, 107.2, 10.4, 106.5, 9.6, 105.1, 8.6, 104.8, 9.5, 105, 10.1, 104.3, 10.6, 103, 11, 102.6, 12.2, 100.9, 12.7, 100, 13.4, 99.2, 12.7, 99.2, 10, 100, 9.3, 100.4, 7.4, 101, 6.9, 102.1, 6.2, 103.4, 4.9, 103.4, 3.4, 104.2, 1.6, 103.5, 1.3, 101.3, 2.8, 100.4, 4.2, 100.3, 5.6, 98.4, 8, 98.5, 9.9, 98.6, 12, 98.2, 13.5, 97.6, 16.1, 95.4, 15.8, 94.2, 16.1, 94.5, 17.3, 93.6, 19.4, 92.5, 20.6, 92.2, 21.4, 91.5, 22.5, 90.5, 22.8, 89.8, 22, 89, 21.9, 88.2, 21.7, 86.5, 20.2, 85, 19.4, 83.2, 17.6, 82.2, 16.6, 81.1, 15.6, 80.3, 15.6, 80.1, 13.5, 79.8, 10.3, 79, 9.3, 78.3, 8.9, 77.5, 8, 76.6, 8.9, 75.7, 11.3, 74.9, 12.7, 74.4, 14.6, 73.5, 16, 72.8, 19.2, 72.9, 20.8, 72.6, 21.4, 70.5, 20.9, 69.2, 22.1, 69.6, 22.4, 68.2, 23.7, 67.4, 23.9, 66.4, 25.4, 64.5, 25.2, 61.5, 25.1, 59.6, 25.4, 57.4, 25.7, 56.5, 27.1, 55.7, 26.9, 54.7, 26.5, 53.5, 26.8, 52.5, 27.6, 51.5, 27.9, 50.1, 30.1, 49.6, 30, 48.6, 29.9, 48, 30.5, 47.9, 29, 48.4, 28.6, 48.8, 27.7, 49.3, 27, 50.1, 26.7, 50.2, 25.6, 50.8, 24.8, 51.4, 24.6, 51.6, 25.8, 51.6, 24.2, 52.6, 24.2, 54, 24.1, 54.7, 24.8, 55.4, 25.4, 56.1, 26.1, 56.4, 24.9, 57.4, 23.9, 58.7, 23.6, 59.8, 22.3, 59.3, 21.4, 58.5, 20.4, 58, 20.5, 57.7, 19.7, 57.8, 19, 56.6, 18.6, 55.3, 17.6, 55.3, 17.2, 54.2, 17, 53.1, 16.6, 52.2, 15.9, 52.2, 15.6, 51.2, 15.2, 49.6, 14.7, 48.7, 14, 48, 14, 47, 13.4, 45.9, 13.3, 45.1, 12.9, 43.5, 12.6, 43.2, 13.2, 42.9, 14.8, 42.6, 15.2, 42.8, 15.9, 42.6, 16.8, 42.3, 17, 41.8, 17.8, 40.9, 19.5, 40.2, 20.2, 39.8, 20.3, 39.1, 21.3, 39, 22.6, 38.5, 23.7, 37.4, 24.9, 37.2, 25.1, 36.6, 26, 35.6, 27.4, 35.1, 28.1, 34.6, 28.1, 34.8, 29, 34.3, 31.2, 34.6, 31.5, 35, 32.8, 35.5, 33.9, 35.9, 35.4, 36.1, 35.8, 36, 36.7, 35.5, 36.6, 34.7, 36.8, 34, 36.2, 32.5, 36.1, 31.7, 36.6, 30.6, 36.7, 30.4, 36.3, 29.7, 36.1, 28.7, 36.7, 27.6, 36.7, 27, 37.7, 26.3, 38.2, 26.8, 39, 26.2, 39.5, 26.6, 40.4, 28, 40.4, 29.2, 41.2, 28, 41, 26.4, 40.6, 25.4, 40.9, 24, 40.6, 23.6, 40.2, 22.8, 40.5, 22.6, 40, 23.3, 39.2, 22.9, 38.3, 24, 38.2, 23, 37.8, 22.8, 36.5, 22.1, 37.1, 21.1, 37, 21.5, 38, 21, 38.8, 20.2, 39.5, 19.4, 40.4, 19.4, 41.9, 18.5, 42.5, 16.9, 43.2, 15.6, 43.9, 14.9, 45, 13.7, 45.6, 12.6, 45.4, 12.3, 44.6, 13.5, 43.6, 14, 42.6, 15.1, 41.9, 16.1, 41.7, 17.5, 40.9, 18.4, 40.2, 18.3, 39.8, 17.2, 40.4, 16.6, 39.7, 17.1, 38.9, 16.6, 38.4, 15.9, 38, 15.7, 38.2, 16.1, 38.9, 15.7, 40, 15, 40.2, 14, 40.8, 13.6, 41.2, 12.2, 41.8, 11.2, 42.4, 10.5, 42.9, 10.2, 43.9, 8.9, 44.4, 8, 43.9, 7, 43.6, 6.2, 43.1, 5, 43.4, 4.2, 43.5, 3.1, 43.1, 3.2, 42, 2, 41.3, 0.8, 41, 0.1, 39.9, -0.3, 39.3, 0.2, 38.7, -0.7, 37.6, -1.4, 37.4, -2.1, 36.7, -4.4, 36.7, -5.4, 35.9, -6.2, 36.4, -6.5, 36.9, -7.5, 37.2, -8.8, 37],
  // Africa
  [-17.1, 14.7, -16.6, 19.5, -17, 21, -16.2, 22.5, -14.5, 26, -13, 27.7, -11.5, 28.2, -9.8, 29.8, -9.6, 32, -8.5, 33.4, -6.5, 34.2, -5.9, 35.8, -2, 35.2, 1, 36.5, 3, 36.8, 6.5, 37, 9.8, 37.3, 11, 37, 10.2, 35, 10.5, 34, 11.5, 33.3, 15.2, 32.3, 19, 30.3, 20, 32, 23, 32.6, 25, 31.6, 29, 30.9, 32, 31.3, 32.6, 29.9, 33.5, 27.5, 35.6, 23.9, 37.2, 21, 38.5, 18, 39.7, 15.5, 41.7, 13.4, 43.3, 12, 44, 10.5, 47, 11.2, 51.2, 11.8, 51, 10.4, 49.5, 7, 48, 4.5, 46, 2.2, 43.5, -0.5, 41.5, -1.8, 39.6, -4.5, 39.2, -7, 39.5, -10, 40.5, -11, 40.6, -15.2, 37.5, -17.5, 35.3, -22.3, 35.5, -24, 32.8, -25.9, 32.4, -28.7, 30.8, -30.6, 28, -32.8, 25.6, -34, 22, -34.2, 20, -34.8, 18.4, -34, 18.2, -32.4, 17.2, -29.5, 15.3, -27.2, 14.5, -22.8, 13.4, -20.8, 11.8, -17.2, 12.2, -14, 13.6, -11.4, 13.2, -9, 12.2, -6, 11.8, -4, 9.3, -1, 9.6, 1, 9.8, 3, 8.7, 4.5, 6.4, 4.3, 4.5, 6.3, 2.4, 6.4, 1.2, 6.1, -1.8, 4.9, -4, 5.2, -7.5, 4.4, -9.5, 5.5, -11.3, 6.7, -13, 8.4, -13.3, 9.5, -15.1, 11, -16.7, 12.3],
  // Madagascar
  [49.3, -12, 50.4, -15.5, 49.5, -17.5, 48.6, -20.5, 47.2, -24.8, 45.2, -25.5, 43.6, -23, 43.3, -21.6, 44.4, -19, 44, -17, 44.8, -16.2, 46.5, -15.7, 47.9, -13.6],
  // Australia
  [113.5, -22, 113.8, -26.5, 115, -30, 115, -34, 117.8, -35.1, 122, -33.9, 124, -33, 126, -32.3, 129, -31.6, 131.2, -31.5, 134, -32.6, 135.6, -34.8, 137.6, -33, 138, -35.6, 140, -37.5, 141, -38.1, 143.5, -38.8, 146.4, -39.1, 147.8, -37.9, 150, -37.5, 150.8, -34.6, 152.5, -32.4, 153.5, -28.5, 153, -25.3, 150.8, -22.5, 148.8, -20.3, 146.2, -18.8, 145.4, -16, 145.3, -14.8, 143.5, -14, 142.5, -10.7, 141.6, -12.8, 141.5, -15.5, 140.5, -17.5, 139, -17.2, 137.8, -16, 135.8, -15, 136.7, -12.2, 135, -12, 132.6, -11.5, 131, -12.2, 130, -13.3, 129.4, -15, 127.5, -14, 125.9, -14.6, 124.3, -16.5, 122.3, -17.4, 121.5, -19.5, 119, -20, 116.7, -20.7, 114.8, -21.8],
  // Greenland
  [-73, 78.2, -66, 80.8, -60, 82, -45, 82.8, -32, 83.6, -22, 82.5, -18, 80, -19, 76, -20, 73, -22.5, 70.5, -26, 68.5, -32, 68, -36, 65.8, -40, 64.8, -43, 60, -46, 60.8, -49.5, 62.5, -51, 64, -53, 66.5, -53.5, 69, -52, 70.8, -55, 73, -58, 75.6, -63, 76.5, -68, 77],
  // Arctic Canada
  [-90, 72, -80, 73.8, -72, 71.5, -66, 68, -61.8, 66.6, -64.5, 63, -68.5, 62.5, -73, 64.3, -77.8, 64.3, -78, 66.5, -73, 67.6, -76, 69.2, -84, 70, -88.8, 71.2],
  [-125, 72, -117, 75.8, -105, 73.5, -95, 74, -97, 77, -89, 77, -82, 76.5, -76, 78, -65, 80, -62, 82.3, -80, 83, -95, 81, -105, 79.5, -116, 77.5, -123, 76, -125.5, 74.5],
  // Islands
  [-24, 65.5, -22, 66.4, -18, 66.2, -14.5, 66.1, -13.6, 65, -15, 64.3, -18.5, 63.4, -21, 63.8, -22.6, 64.1],
  [-5.7, 50, -1.5, 50.6, 1.4, 51.2, 1.7, 52.7, 0.3, 53.5, -0.1, 54.4, -1.3, 54.9, -1.7, 55.8, -2.2, 56.4, -1.8, 57.6, -3.4, 58.6, -5, 58.6, -6.2, 57.5, -5.7, 56, -6.2, 55.3, -5, 54.8, -3.2, 54.6, -3, 53.4, -4.6, 53.2, -4.2, 52.3, -5.3, 51.7, -3.4, 51.4, -4.4, 51.2],
  [-10.3, 51.6, -6.3, 52.2, -6, 53.5, -5.6, 54.6, -7.2, 55.3, -8.4, 55.1, -10, 54.2, -9.6, 53],
  [129.8, 31.2, 131.5, 31.3, 132, 33.5, 133.5, 33.4, 135, 33.6, 136.8, 34.3, 139, 34.8, 140.8, 35.7, 141, 38, 141.9, 39.5, 141.4, 41.4, 140, 41.4, 140, 40, 139.8, 38.5, 138.5, 37.4, 136.8, 37.3, 135.6, 35.6, 133, 35.6, 131, 34.4, 129.6, 33.4],
  [140, 41.5, 141.7, 42.6, 143.3, 42, 145.5, 43.3, 144.2, 44.1, 141.8, 45.5, 141.3, 43.5, 140.3, 43.2],
  [95.3, 5.5, 97.5, 5.2, 100.3, 2.2, 103.6, -1, 106, -3.2, 106, -5.8, 104.5, -5.9, 102.3, -4, 100.8, -2, 98.7, 1.7, 96.5, 3.6],
  [105.2, -6.8, 106.5, -6, 108.3, -6.3, 110.5, -6.9, 112.6, -6.9, 114.4, -7.7, 114.5, -8.7, 111, -8.3, 108.3, -7.8, 106.4, -7.4],
  [109, 1.5, 109.6, 2, 111, 1.8, 113, 3.2, 115.5, 5.2, 117, 7, 118.5, 5.5, 119.2, 5.2, 118, 4.2, 118, 1, 117.5, 0.5, 116.5, -1.5, 116.2, -3.6, 114.5, -4, 113, -3.2, 111.7, -3, 110, -1.8, 109.3, -0.5],
  [119.5, -5.5, 120.5, -2.5, 120, 0.5, 121.5, 1, 124.5, 1.3, 125, 1.5, 123, 0.6, 121, -1, 123.3, -1, 121.8, -2, 122.6, -4.6, 121, -4, 120.3, -5.5],
  [131, -1.3, 134, -1, 136, -2.2, 138, -1.7, 141, -2.6, 144.5, -3.8, 146.5, -6, 147.8, -6.3, 147.5, -8, 150.5, -10.5, 148, -10.2, 146, -8, 143.5, -8.5, 142.5, -9.3, 141, -9.1, 139, -8.1, 138, -8.3, 137.8, -5.5, 135, -4.4, 133, -4, 132, -2.8],
  [120, 18.5, 122.2, 18.5, 122, 16.5, 121.6, 14.2, 124, 13, 123.4, 13.6, 121.2, 13.6, 120.6, 14.4, 120.2, 16.3],
  [122, 7, 124, 7, 125.5, 6, 126.6, 7.3, 126, 9.2, 123.6, 8.5, 122.5, 7.8],
  [120.2, 22.8, 121, 22, 121.9, 25, 121.5, 25.3, 120.2, 23.8],
  [79.8, 9.8, 81.9, 7.5, 81.3, 6.2, 80.1, 6, 79.8, 8],
  [172.7, -34.4, 174.5, -35.5, 175.8, -37, 178.5, -37.7, 177.9, -39.2, 176.8, -39.6, 175, -41.5, 174.6, -39.9, 173.8, -39.2, 174.6, -37.5],
  [172.7, -40.5, 174.3, -41.2, 173.4, -42.8, 171.2, -44.4, 169.2, -46.6, 166.5, -46, 168.2, -44, 171.5, -41.8],
  [-84.9, 21.9, -82, 23.2, -80, 23.1, -77, 21.6, -74.2, 20.2, -77.7, 19.9, -80.5, 21.8, -84, 21.8],
  [-74.5, 18.4, -72.6, 19.9, -70, 19.8, -68.4, 18.6, -71, 18, -74.4, 18.3],
  [52, 71, 56, 70.6, 61, 72, 69, 76.8, 64, 76.4, 57, 75, 54, 73.5],
  [12.4, 38, 15.6, 38.2, 15.1, 36.7, 12.6, 37.6],
  [8.4, 41, 9.8, 41, 9.6, 39, 8.4, 39],
];
const LAND_HOLES = [
  // Black Sea, Caspian, Hudson Bay
  [27.8, 42, 28.5, 43.7, 29.7, 45.3, 30.8, 46.5, 32.4, 46.4, 33.6, 44.6, 35.2, 44.8, 36.6, 45.3, 38, 44.6, 39.8, 43.5, 41.6, 41.6, 40, 41, 37, 41.1, 35, 42, 33, 42, 31, 41.2, 29.1, 41.2],
  [47, 45, 49.5, 46.5, 52, 46.7, 53, 45.3, 51.3, 44.5, 52.7, 42, 53.9, 40.5, 53, 39.5, 53.9, 37.3, 51, 36.8, 49, 37.5, 49.5, 40.4, 48, 42.5, 47.5, 43.5],
  [-94.5, 59, -92.5, 57, -88, 56.5, -85, 55.3, -82.3, 52.9, -80.5, 51.5, -79, 54, -78.5, 56.5, -77, 58.5, -78, 60.5, -77.6, 62, -82, 62.8, -86, 64, -88, 64.1, -91, 62.8, -94.2, 60.5],
];

let LAND = null;
/** 360x180 land mask, 1 degree per cell, row 0 = 90N, column 0 = 180W. */
function landMask() {
  if (LAND) return LAND;
  const c = mkCanvas(360, 180);
  const x = c.getContext('2d');
  const trace = (poly) => {
    x.beginPath();
    for (let i = 0; i < poly.length; i += 2) {
      const px = poly[i] + 180;
      const py = 90 - poly[i + 1];
      if (i) x.lineTo(px, py);
      else x.moveTo(px, py);
    }
    x.closePath();
    x.fill();
  };
  x.fillStyle = '#fff';
  LAND_POLYS.forEach(trace);
  x.globalCompositeOperation = 'destination-out';
  LAND_HOLES.forEach(trace);
  const d = x.getImageData(0, 0, 360, 180).data;
  LAND = new Uint8Array(360 * 180);
  for (let i = 0; i < LAND.length; i++) LAND[i] = d[i * 4 + 3] > 110 ? 1 : 0;
  return LAND;
}

// ---------------------------------------------------------------------------
// The channel globe: lit, tilted, with graticule, rim light, halo and city
// lights on the night side. Rendered per pixel into a small cached canvas.

const GLOBE_THEMES = {
  brand: { sea: [P.black, P.ink, P.navy], land: [P.navy, P.blue, P.cyan], rimSea: P.blue, rimLand: P.white, halo: [P.navy, P.blue], city: P.yellow },
  ghost: { sea: [P.black, P.ink], land: [P.ink, P.slate], rimSea: P.navy, rimLand: P.steel, halo: [P.ink, P.navy], city: P.steel },
};
const themeCache = new Map();
function globeTheme(name) {
  let th = themeCache.get(name);
  if (!th) {
    const g = GLOBE_THEMES[name] || GLOBE_THEMES.brand;
    th = {
      sea: g.sea.map((c) => u32(c)),
      land: g.land.map((c) => u32(c)),
      rimSea: u32(g.rimSea),
      rimLand: u32(g.rimLand),
      haloDark: u32(g.halo[0], 150),
      haloLit: u32(g.halo[1], 190),
      city: u32(g.city),
    };
    themeCache.set(name, th);
  }
  return th;
}

const GLOBES = new Map();
function globeTable(R) {
  let tb = GLOBES.get(R);
  if (tb) {
    GLOBES.delete(R);
    GLOBES.set(R, tb);
    return tb;
  }
  const M = R + 3;
  const S = 2 * M + 1;
  const rr = R + 0.5;
  const tilt = 0.42;
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const ln = Math.hypot(-0.62, -0.52, 0.59);
  const L = [-0.62 / ln, -0.52 / ln, 0.59 / ln];
  const rimQ = ((rr - 1.3) / rr) ** 2;
  const haloQ = ((rr + 1.7) / rr) ** 2;
  const px = [];
  const row = [];
  const lat = [];
  const lon = [];
  const bright = [];
  const thr = [];
  const flag = [];
  const haloPx = [];
  const haloLit = [];
  const latGrid = new Float32Array(S * S).fill(999);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const nx = (x - M) / rr;
      const ny = (y - M) / rr;
      const q = nx * nx + ny * ny;
      if (q > 1) {
        if (q <= haloQ) {
          haloPx.push(y * S + x);
          haloLit.push(nx * L[0] + ny * L[1] > 0.05 ? 1 : 0);
        }
        continue;
      }
      const nz = Math.sqrt(1 - q);
      const la = Math.asin(clamp(-ny * ct + nz * st, -1, 1)) * DEG;
      const lo = Math.atan2(nx, ny * st + nz * ct) * DEG;
      const sh = nx * L[0] + ny * L[1] + nz * L[2];
      px.push(y * S + x);
      row.push(y);
      lat.push(clamp(Math.floor(90 - la), 0, 179));
      lon.push(lo + 180);
      bright.push(clamp(sh * 0.85 + 0.28, 0, 1));
      thr.push(bayerAt(x, y));
      flag.push(q > rimQ ? (sh > 0.1 ? 1 : 4) : 0);
      latGrid[y * S + x] = la;
    }
  }
  for (let k = 0; k < px.length; k++) {
    const above = latGrid[px[k] - S];
    if (above !== 999 && Math.floor(above / 30) !== Math.floor(latGrid[px[k]] / 30)) flag[k] |= 2;
  }
  const canvas = mkCanvas(S, S);
  const gctx = canvas.getContext('2d');
  const img = gctx.createImageData(S, S);
  tb = {
    M,
    n: px.length,
    px: Int32Array.from(px),
    row: Int16Array.from(row),
    lat: Uint8Array.from(lat),
    lon: Float32Array.from(lon),
    bright: Float32Array.from(bright),
    thr: Float32Array.from(thr),
    flag: Uint8Array.from(flag),
    haloPx: Int32Array.from(haloPx),
    haloLit: Uint8Array.from(haloLit),
    canvas,
    gctx,
    img,
    u: new Uint32Array(img.data.buffer),
    key: '',
  };
  GLOBES.set(R, tb);
  if (GLOBES.size > 24) GLOBES.delete(GLOBES.keys().next().value);
  return tb;
}

/** Draw the channel globe centred at (cx, cy); rot in degrees of longitude. */
function globe(ctx, cx, cy, R, rot, t, theme = 'brand') {
  R = Math.max(2, round(R));
  const tb = globeTable(R);
  const rotD = ((rot % 360) + 360) % 360;
  const tw = Math.floor(t * 3);
  const key = `${theme}|${round(rotD * 2)}|${tw}`;
  if (tb.key !== key) {
    tb.key = key;
    const th = globeTheme(theme);
    const land = landMask();
    const { n, px, row, lat, lon, bright, thr, flag, u, haloPx, haloLit } = tb;
    const sea = th.sea;
    const ld = th.land;
    const ns = sea.length - 1;
    const nl = ld.length - 1;
    let prevRow = -1;
    let prevCell = -1;
    for (let k = 0; k < n; k++) {
      let lo = lon[k] + rotD;
      if (lo >= 360) lo -= 360;
      const li = lo | 0;
      const la = lat[k];
      const cell = (lo / 30) | 0;
      const rw = row[k];
      const merid = rw === prevRow && cell !== prevCell;
      prevRow = rw;
      prevCell = cell;
      const f = flag[k];
      const b = bright[k];
      let c;
      if (land[la * 360 + li]) {
        let i = (b * nl + thr[k]) | 0;
        if (i > nl) i = nl;
        c = ld[i];
        if (f & 1) c = th.rimLand;
        else if (b < 0.16 && hash2(la, li) < 0.06 && hash2(li + tw, la) < 0.8) c = th.city;
      } else {
        let i = (b * ns + thr[k]) | 0;
        if (i > ns) i = ns;
        if ((merid || f & 2) && b > 0.2 && i < ns) i++;
        c = sea[i];
        if (f & 1) c = th.rimSea;
      }
      u[px[k]] = c;
    }
    for (let j = 0; j < haloPx.length; j++) u[haloPx[j]] = haloLit[j] ? th.haloLit : th.haloDark;
    tb.gctx.putImageData(tb.img, 0, 0);
  }
  ctx.drawImage(tb.canvas, round(cx) - tb.M, round(cy) - tb.M);
}

// ---------------------------------------------------------------------------
// Shared backgrounds

const fieldCache = new Map();
/** Deep navy studio field with a dithered radial glow around (cx, cy). */
function brandField(cx = 192, cy = 100) {
  const key = `${cx},${cy}`;
  let c = fieldCache.get(key);
  if (!c) {
    const rmp = ramp([P.black, P.ink, P.navy]);
    c = field(W, H, (x, y) => {
      const dx = (x - cx) / 260;
      const dy = (y - cy) / 170;
      const d = Math.sqrt(dx * dx + dy * dy);
      return rmp(1.9 - d * 1.95, x, y);
    });
    fieldCache.set(key, c);
  }
  return c;
}

let DOTMAP = null;
/** Equirectangular dotted world map, one full turn = 384 px, wraps. */
function dotMap() {
  if (DOTMAP) return DOTMAP;
  const c = mkCanvas(W, H);
  const x = c.getContext('2d');
  const land = landMask();
  const rand = mulberry32(1234);
  const k = W / 360;
  for (let gy = 1; gy < H; gy += 3) {
    const lat = 84 - (gy - 22) / k;
    if (lat > 83 || lat < -56) continue;
    const li = clamp(Math.floor(90 - lat), 0, 179);
    for (let gx = 1; gx < W; gx += 3) {
      const lo = clamp(Math.floor(gx / k), 0, 359);
      if (!land[li * 360 + lo]) continue;
      x.fillStyle = rand() < 0.14 ? P.steel : P.slate;
      x.fillRect(gx, gy, 1, 1);
    }
  }
  DOTMAP = c;
  return c;
}
function drawMap(ctx, t, speed = 3, alpha = 0.55) {
  const m = dotMap();
  const off = ((Math.floor(t * speed) % W) + W) % W;
  ctx.globalAlpha = alpha;
  ctx.drawImage(m, -off, 0);
  ctx.drawImage(m, W - off, 0);
  ctx.globalAlpha = 1;
}

/** Slow diagonal light shafts. */
function drawBeams(ctx, t, color = P.white, a = 0.035) {
  const fill = rgba(color, a);
  for (let i = 0; i < 3; i++) {
    const w = 26 + i * 18;
    const span = W + 300;
    const x = ((i * 157 + t * (5 + i * 3)) % span) - 140;
    slab(ctx, x, 0, w, H, -0.5, fill);
  }
}

const SPECKS = (() => {
  const rand = mulberry32(11);
  return Array.from({ length: 30 }, () => ({ x: rand() * W, y: rand() * H, v: 2 + rand() * 7, ph: rand() * TAU, c: rand() < 0.3 }));
})();
/** Floating dust/light specks. */
function drawSpecks(ctx, t, n = 30) {
  for (let i = 0; i < n; i++) {
    const s = SPECKS[i];
    if (Math.sin(t * 1.7 + s.ph) < -0.2) continue;
    const y = (((s.y - t * s.v) % H) + H) % H;
    const x = s.x + Math.sin(t * 0.4 + s.ph) * 5;
    r(ctx, round(x), round(y), 1, 1, s.c ? P.silver : P.steel);
  }
}

/** Broadcast "signal" rings expanding from a point. */
function drawPulses(ctx, cx, cy, t, r0, r1, period, color, count = 2, level = 0.7) {
  for (let i = 0; i < count; i++) {
    const ph = (t / period + i / count) % 1;
    ring(ctx, cx, cy, round(lerp(r0, r1, ph)), color, level * (1 - ph));
  }
}

/** Horizontal light streaks crossing the frame once. */
function speedBars(ctx, time, bars) {
  for (const b of bars) {
    const p = seg(time, b.s, b.d);
    if (p <= 0 || p >= 1) continue;
    const x = lerp(-b.len - 40, W + 40, easeInOut(p));
    slab(ctx, x, b.y, b.len, b.h, -1, b.c);
  }
}

const stripeCache = new Map();
/**
 * Endless slanted stripes (cached strip, scrolled by t * speed) filling
 * x..x+W horizontally and `h` rows from y. Callers clip if needed.
 */
function stripes(ctx, t, { color, a, period, width, slope, speed, x = 0, y = 0, h = H, sx = 0, sh = h }) {
  const key = `${color}|${a}|${period}|${width}|${slope}|${h}`;
  let c = stripeCache.get(key);
  if (!c) {
    const reach = Math.ceil(Math.abs(slope) * h);
    c = mkCanvas(W + period * 2, h);
    const cx = c.getContext('2d');
    const fill = rgba(color, a);
    for (let px = -reach - period; px < c.width + reach + period; px += period) slab(cx, px, 0, width, h, slope, fill);
    stripeCache.set(key, c);
  }
  const off = ((Math.floor(t * speed) % period) + period) % period;
  ctx.drawImage(c, sx, 0, c.width - sx, Math.min(sh, h), x - period + off + sx, y, c.width - sx, Math.min(sh, h));
}

/** Red brand ribbon with sheen stripes, top highlight and bottom shade. */
function ribbon(ctx, x, y, w, h, t) {
  if (h <= 0 || w <= 0) return;
  r(ctx, x, y, w, h, P.red);
  ctx.save();
  clipRect(ctx, x, y, w, h);
  stripes(ctx, t, { color: P.darkRed, a: 0.32, period: 30, width: 11, slope: -0.5, speed: 9, x, y, h: 64, sh: h });
  ctx.restore();
  r(ctx, x, y, w, 1, P.pink);
  if (h > 8) r(ctx, x, y + h - 3, w, 3, P.darkRed);
}

/** Four-point lens sparkle; k runs 0..1 over its life. */
function sparkle(ctx, x, y, k, color = P.white) {
  if (k <= 0 || k >= 1) return;
  const s = round(Math.sin(k * Math.PI) * 6);
  if (s <= 0) return;
  r(ctx, x - s, y, 2 * s + 1, 1, rgba(color, 0.75));
  r(ctx, x, y - s, 1, 2 * s + 1, rgba(color, 0.75));
  if (s > 2) {
    r(ctx, x - 1, y - 1, 3, 3, color);
    r(ctx, x - (s >> 1), y, s + 1, 1, color);
    r(ctx, x, y - (s >> 1), 1, s + 1, color);
  } else r(ctx, x, y, 1, 1, color);
}

/** Rectangle outline, optionally dithered. */
function rectOutline(ctx, x, y, w, h, color, level = 1) {
  const f = dither(color, level);
  if (!f) return;
  ctx.fillStyle = f;
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y + 1, 1, h - 2);
  ctx.fillRect(x + w - 1, y + 1, 1, h - 2);
}

/** Moving light band confined to a rectangle. */
function sweep(ctx, x, y, w, h, p, bandW = 16, a = 0.22) {
  if (p < 0 || p > 1) return;
  const bx = lerp(x - bandW - h / 2, x + w + h / 2, easeInOut(p));
  ctx.save();
  clipRect(ctx, x, y, w, h);
  slab(ctx, bx, y, bandW, h, -0.5, rgba(P.white, a));
  slab(ctx, bx + bandW + 4, y, 3, h, -0.5, rgba(P.white, a));
  ctx.restore();
  return bx;
}

/** Channel lockup: mini globe tile + red name plate. Returns its size. */
function lockup(ctx, x, y, channel, scale, t) {
  const tw = measureText(channel, scale);
  const pad = 3 * scale;
  const bh = 7 * scale + pad * 2;
  const icon = bh;
  r(ctx, x, y, icon, bh, P.navy);
  r(ctx, x, y, icon, 1, P.blue);
  globe(ctx, x + (icon >> 1), y + (bh >> 1), (bh >> 1) - 3, t * 30, t);
  r(ctx, x + icon, y, tw + pad * 2, bh, P.red);
  r(ctx, x + icon, y, tw + pad * 2, 1, P.pink);
  r(ctx, x, y + bh, icon + tw + pad * 2, scale, P.darkRed);
  r(ctx, x + icon, y + bh, 4 * scale, scale, P.yellow);
  drawText(ctx, channel, x + icon + pad, y + pad, { color: P.white, scale, shadow: P.darkRed });
  return { w: icon + tw + pad * 2, h: bh + scale, textX: x + icon + pad, textY: y + pad };
}

/** Bottom-weighted shade so text reads over photos (stepped, palette black). */
function shadeBottom(ctx, y0, y1, maxA) {
  for (let y = y0; y < y1; y += 2) {
    const k = (y - y0) / (y1 - y0);
    const a = Math.round(maxA * k ** 1.25 * 20) / 20;
    if (a > 0) r(ctx, 0, y, W, 2, rgba(P.black, a));
  }
}

// ---------------------------------------------------------------------------
// TITLE CARD (show open)

const TITLE_BARS = [
  { y: 58, h: 2, len: 120, c: P.yellow, s: 0.22, d: 0.55 },
  { y: 66, h: 1, len: 70, c: P.white, s: 0.34, d: 0.5 },
  { y: 128, h: 3, len: 170, c: P.darkRed, s: 0.28, d: 0.6 },
  { y: 134, h: 1, len: 90, c: P.cyan, s: 0.4, d: 0.5 },
  { y: 142, h: 2, len: 110, c: P.red, s: 0.46, d: 0.55 },
];

export function drawTitleCard(ctx, t, dt, { channel = 'LIVENEWS', subtitle = 'WORLD NEWS · LIVE', date = '' } = {}) {
  const CY = 94;
  const RH = 40;
  ctx.drawImage(brandField(192, CY), 0, 0);
  drawMap(ctx, t, 3);
  drawBeams(ctx, t);
  if (dt > 0.6) drawPulses(ctx, 192, CY, t - 0.6, 62, 240, 2.6, P.blue, 2, 0.6);
  drawSpecks(ctx, t);
  // fade up from black with an ordered dissolve
  const fade = 1 - easeOut(seg(dt, 0.05, 0.6));
  if (fade > 0) dfill(ctx, 0, 0, W, H, P.black, fade);

  // globe zooms in behind the ribbon
  const gp = seg(dt, 0.18, 0.75);
  if (gp > 0) {
    const R = Math.max(2, Math.round((58 * easeOutBack(gp, 1.3)) / 2) * 2);
    globe(ctx, 192, CY, R, t * 12 + 150 + (1 - easeOut(gp)) * 120, t);
  }
  speedBars(ctx, dt, TITLE_BARS);

  // ribbon: a hairline that opens into the red band
  const lineP = easeOut(seg(dt, 0, 0.3));
  const openP = seg(dt, 0.26, 0.36);
  const rh = openP > 0 ? Math.max(2, round(RH * easeOutBack(openP, 1.5))) : 2;
  const top = CY - (rh >> 1);
  if (openP <= 0) {
    const lw = round(W * lineP);
    r(ctx, (W - lw) >> 1, CY - 1, lw, 2, P.white);
  } else {
    ribbon(ctx, 0, top, W, rh, t);
    if (openP < 1) {
      r(ctx, 0, top, W, 1, P.white);
      r(ctx, 0, top + rh - 1, W, 1, P.white);
    }
    const yl = round(W * easeOut(seg(dt, 0.55, 0.5)));
    r(ctx, 0, top + rh, yl, 1, P.yellow);
  }

  // light sweep across the ribbon (first pass, then every few seconds)
  const gl = every(dt, 1.25, 4.5, 0.6);
  if (gl >= 0 && openP >= 1) sweep(ctx, 0, top, W, rh - 3, gl, 22, 0.2);
  // lens sparkle on the globe's lit limb
  sparkle(ctx, 152, CY - 40, every(dt, 0.95, 5, 0.45));

  // channel name: letters drop into the ribbon one by one
  const sc = fitScale(channel, 344, 4, 2);
  const tw = measureText(channel, sc);
  const tx = (W - tw) >> 1;
  const capY = CY - round((7 * sc) / 2) - 1;
  if (openP > 0.4) {
    ctx.save();
    clipRect(ctx, 0, top + 1, W, rh - 1);
    letters(channel, sc).forEach(({ ch, x }, i) => {
      if (ch === ' ') return;
      const st = 0.48 + i * 0.045;
      const p = seg(dt, st, 0.3);
      if (p <= 0) return;
      const yo = round((1 - easeOutBack(p, 1.8)) * -(RH + 4));
      const landed = dt - st - 0.3;
      const col = landed > 0 && landed < 0.09 ? P.yellow : P.white;
      extruded(ctx, ch, tx + x, capY + yo, sc, col, P.darkRed, 2);
    });
    ctx.restore();
  }

  // subtitle tab unfolds under the ribbon
  const sp = seg(dt, 0.95, 0.35);
  if (sp > 0) {
    const sub = ellipsis(subtitle || '', 300);
    const sw = measureText(sub) + 26;
    const cw = round(sw * easeOut(sp));
    const sx = (W - cw) >> 1;
    const sy = CY + 24;
    r(ctx, sx, sy, cw, 13, P.black);
    r(ctx, sx, sy, Math.min(cw, 2), 13, P.yellow);
    r(ctx, sx + cw - 2, sy, Math.min(cw, 2), 13, P.yellow);
    ctx.save();
    clipRect(ctx, sx, sy, cw, 13);
    const tx0 = ((W - sw) >> 1) + 15;
    if (Math.floor(t * 1.6) % 2 === 0) r(ctx, tx0 - 8, sy + 5, 3, 3, P.red);
    drawText(ctx, sub, tx0, sy + 3, { color: P.white });
    ctx.restore();
  }

  // date line types on, flanked by rules
  const dp = seg(dt, 1.3, 0.55);
  if (dp > 0) {
    const ds = ellipsis(date || longDate(), 300);
    const dw = measureText(ds);
    const dx = (W - dw) >> 1;
    const dy = 170;
    drawText(ctx, typed(ds, dp), dx, dy, { color: P.silver, shadow: P.black });
    const rl = round(56 * easeOut(seg(dt, 1.4, 0.5)));
    if (rl > 0) {
      r(ctx, dx - 10 - rl, dy + 3, rl, 1, P.steel);
      r(ctx, dx + dw + 10, dy + 3, rl, 1, P.steel);
      r(ctx, dx - 8, dy + 2, 3, 3, P.red);
      r(ctx, dx + dw + 5, dy + 2, 3, 3, P.red);
    }
  }
}

// ---------------------------------------------------------------------------
// END CARD (show close)

export function drawEndCard(ctx, t, dt, { channel = 'LIVENEWS', line1 = 'STAY WITH US', line2 = 'NEXT BULLETIN SHORTLY' } = {}) {
  const X0 = 28;
  ctx.drawImage(brandField(290, 150), 0, 0);
  drawMap(ctx, t, -2);
  drawPulses(ctx, 318, 170, t, 104, 260, 3.2, P.navy, 2, 0.8);
  globe(ctx, 318, 170, 100, t * 5 + 60, t, 'ghost');
  drawBeams(ctx, t);
  drawSpecks(ctx, t);

  // line 1 and line 2 are measured first so the block can be centred
  const s1 = fitScale(line1 || '', 330, 3, 2);
  const l1 = wrapClamp(line1 || '', 330, s1, 2);
  const lh1 = s1 * 10;
  const s2 = line2 ? fitScale(line2, 300, 2) : 1;
  const t2 = line2 ? ellipsis(line2, 300, s2) : '';
  const blockH = 30 + 14 + l1.length * lh1 + (line2 ? 12 + 7 * s2 + 10 : 0);
  const Y0 = clamp(round((180 - blockH) / 2) + 6, 16, 60);

  // lockup slides in
  const lp = easeOut(seg(dt, 0.3, 0.5));
  const lk = lockup(ctx, round(X0 - 190 * (1 - lp)), Y0, channel, 2, t);
  const glk = every(dt, 1.4, 3.8, 0.5);
  if (glk >= 0) sweep(ctx, X0, Y0, lk.w, lk.h, glk, 10, 0.25);

  // line 1 rises in
  const y1 = Y0 + lk.h + 14 + ASCENT * s1;
  let maxW = 0;
  l1.forEach((ln, i) => {
    maxW = Math.max(maxW, measureText(ln, s1));
    const p = seg(dt, 0.55 + i * 0.1, 0.45);
    riseText(ctx, ln, X0, y1 + i * lh1, p, { color: P.white, scale: s1, shadow: P.black });
  });
  const ulY = y1 + (l1.length - 1) * lh1 + 7 * s1 + 5;
  const ul = round(maxW * easeOut(seg(dt, 0.8, 0.45)));
  if (ul > 0) {
    r(ctx, X0, ulY, ul, 3, P.red);
    r(ctx, X0, ulY, Math.min(ul, 12), 3, P.yellow);
  }

  // line 2: chevrons + typed text on a dark tab
  const p2 = seg(dt, 1.0, 0.5);
  if (p2 > 0 && t2) {
    const pad = 2 + 3 * s2;
    const w2 = measureText(t2, s2) + 12 * s2 + pad * 2 + 4;
    const th = 7 * s2 + pad * 2;
    const ty = ulY + 9;
    const cw = round(w2 * easeOut(seg(dt, 1.0, 0.3)));
    r(ctx, X0, ty, cw, th, P.black);
    r(ctx, X0, ty + th - 1, cw, 1, P.steel);
    ctx.save();
    clipRect(ctx, X0, ty, cw, th);
    const ph = Math.floor(t * 6) % 4;
    for (let i = 0; i < 3; i++) drawText(ctx, '▸', X0 + pad + i * 4 * s2, ty + pad, { color: i === ph ? P.yellow : P.darkRed, scale: s2 });
    drawText(ctx, typed(t2, seg(dt, 1.1, 0.6)), X0 + pad + 12 * s2 + 4, ty + pad, { color: P.yellow, scale: s2 });
    ctx.restore();
  }

  // outro progress rail + studio clock
  const RY = 192;
  const pr = round((W - X0 * 2) * easeInOut(seg(dt, 0.6, 2.3)));
  r(ctx, X0, RY + 1, W - X0 * 2, 1, P.slate);
  if (pr > 0) {
    r(ctx, X0, RY, pr, 3, P.red);
    r(ctx, X0 + pr - 2, RY - 1, 2, 5, P.yellow);
  }
  const cp = seg(dt, 1.3, 0.4);
  if (cp > 0) {
    const ck = `LONDON ${zoneTime().label}`;
    const cx0 = W - X0 - measureText(ck);
    drawText(ctx, typed(ck, cp), cx0, RY - 11, { color: P.fog });
    if (cp >= 1 && Math.floor(t * 1.5) % 2 === 0) r(ctx, cx0 - 7, RY - 9, 3, 3, P.red);
  }

  // opening wipe: brand bars sweep right-to-left revealing the card
  const wp = seg(dt, 0, 0.6);
  if (wp < 1) {
    const E = round(lerp(W - 30, -180, easeOut(wp)));
    slab(ctx, -400, 0, E + 400, H, 0.5, P.black);
    slab(ctx, E, 0, 26, H, 0.5, P.red);
    slab(ctx, E + 26, 0, 12, H, 0.5, P.darkRed);
    slab(ctx, E + 38, 0, 3, H, 0.5, P.yellow);
  }
}

// ---------------------------------------------------------------------------
// STANDBY (test card)

let TESTCARD = null;
let TESTCARD_KEY = '';
const TC = { cx: 192, cy: 108, R: 100 };

function testCardLayer(channel) {
  if (TESTCARD && TESTCARD_KEY === channel) return TESTCARD;
  const c = TESTCARD || mkCanvas(W, H);
  const x = c.getContext('2d');
  x.clearRect(0, 0, W, H);
  // background grid
  r(x, 0, 0, W, H, P.slate);
  for (let gx = 0; gx <= W; gx += 24) r(x, gx, 0, 1, H, P.steel);
  for (let gy = 12; gy < H; gy += 24) r(x, 0, gy, W, 1, P.steel);
  // castellated border
  for (let i = 0; i * 12 < W; i++) {
    r(x, i * 12, 0, 12, 4, i % 2 ? P.black : P.silver);
    r(x, i * 12, H - 4, 12, 4, i % 2 ? P.silver : P.black);
  }
  for (let i = 0; i * 12 < H; i++) {
    r(x, 0, i * 12, 4, 12, i % 2 ? P.silver : P.black);
    r(x, W - 4, i * 12, 4, 12, i % 2 ? P.black : P.silver);
  }
  // side swatches
  [P.red, P.yellow, P.green, P.blue].forEach((col, i) => {
    r(x, 24, 61 + i * 24, 24, 23, col);
    r(x, W - 48, 61 + i * 24, 24, 23, [P.white, P.fog, P.steel, P.black][i]);
  });

  // circle contents
  const { cx, cy, R } = TC;
  const inner = mkCanvas(W, H);
  const ix = inner.getContext('2d');
  r(ix, 0, 0, W, H, P.ink);
  const bars = [P.silver, P.yellow, P.cyan, P.green, P.magenta, P.red, P.blue];
  const bx0 = cx - R;
  const bw = Math.ceil((2 * R + 1) / bars.length);
  bars.forEach((col, i) => r(ix, bx0 + i * bw, 36, bw, 24, col));
  const greys = [P.black, P.ink, P.slate, P.steel, P.fog, P.silver, P.white];
  greys.forEach((col, i) => r(ix, bx0 + i * bw, 118, bw, 14, col));
  // frequency gratings
  const periods = [8, 6, 4, 3, 2];
  const gw = Math.ceil((2 * R + 1) / periods.length);
  periods.forEach((pp, i) => {
    const gx0 = bx0 + i * gw;
    r(ix, gx0, 132, gw, 20, P.black);
    for (let xx = 0; xx < gw; xx++) if (Math.floor(xx / (pp / 2)) % 2 === 0) r(ix, gx0 + xx, 132, 1, 20, P.white);
  });
  r(ix, 0, 152, W, 26, P.ink);
  r(ix, 0, 178, W, 40, P.darkRed);
  r(ix, cx - 30, 178, 60, 40, P.red);
  // centre cross
  r(ix, cx, 60, 1, 58, P.fog);
  r(ix, bx0, cy, 2 * R + 1, 1, P.fog);
  // mask to the disc
  const mask = mkCanvas(W, H);
  disc(mask.getContext('2d'), cx, cy, R, '#fff');
  ix.globalCompositeOperation = 'destination-in';
  ix.drawImage(mask, 0, 0);
  x.drawImage(inner, 0, 0);
  discOutline(x, cx, cy, R, P.white);
  discOutline(x, cx, cy, R + 1, P.black);

  // station name plate (overlaps the top of the circle)
  const sc = fitScale(channel, 120, 2);
  const nw = measureText(channel, sc) + 14;
  r(x, cx - (nw >> 1), 15, nw, 7 * sc + 8, P.black);
  r(x, cx - (nw >> 1), 15 + 7 * sc + 8, nw, 1, P.red);
  drawText(x, channel, cx, 19, { color: P.white, scale: sc, align: 'center' });

  TESTCARD = c;
  TESTCARD_KEY = channel;
  return c;
}

export function drawStandby(ctx, t, { channel = 'LIVENEWS', message = '' } = {}) {
  ctx.drawImage(testCardLayer(channel), 0, 0);
  const { cx } = TC;

  // a shimmer across the colour bars
  const sh = every(t, 0, 3.5, 0.9);
  if (sh >= 0) sweep(ctx, cx - 100, 36, 201, 24, sh, 12, 0.35);

  // message box
  const bx = 64;
  const bw = W - 128;
  const by = 62;
  const lines = wrapClamp(message || 'PREPARING THE NEXT BULLETIN', bw - 24, 1, 2);
  const bh = 41 + lines.length * 10;
  r(ctx, bx, by, bw, bh, P.black);
  r(ctx, bx, by, bw, 2, P.red);
  r(ctx, bx, by + bh, bw, 1, P.darkRed);
  const title = "WE'LL BE RIGHT BACK";
  const ts = fitScale(title, bw - 16, 2);
  drawText(ctx, title, cx, by + 9, { color: P.white, scale: ts, align: 'center' });
  const gl = every(t, 1.2, 4, 0.7);
  if (gl >= 0) {
    const tw = measureText(title, ts);
    textGlint(ctx, title, cx, by + 9, ts, lerp(cx - tw / 2 - 20, cx + tw / 2 + 30, easeInOut(gl)), 6, P.yellow, 'center');
  }
  lines.forEach((ln, i) => drawText(ctx, ln, cx, by + 30 + i * 10, { color: P.yellow, align: 'center' }));
  // bouncing dots
  const dy = by + bh - 8;
  for (let i = 0; i < 3; i++) {
    const hop = Math.max(0, Math.sin(t * 6 - i * 0.9)) > 0.6 ? 1 : 0;
    r(ctx, cx - 6 + i * 5, dy - hop, 2, 2, hop ? P.white : P.steel);
  }
  // blinking standby lamp
  if (Math.floor(t * 1.5) % 2 === 0) r(ctx, bx + 6, by + 8, 4, 4, P.red);
  r(ctx, bx + bw - 10, by + 8, 4, 4, Math.floor(t * 1.5) % 2 ? P.red : P.maroon);

  // clock
  const now = new Date();
  const clock = `${zoneTime().label}:${String(now.getSeconds()).padStart(2, '0')}`;
  const cw = measureText(clock, 2) + 12;
  r(ctx, cx - (cw >> 1), 155, cw, 20, P.black);
  r(ctx, cx - (cw >> 1), 174, cw, 1, P.steel);
  drawText(ctx, clock, cx, 159, { color: P.white, scale: 2, align: 'center' });

  // CRT roll bar and a little signal noise
  const ry = Math.floor((t * 22) % (H + 40)) - 40;
  r(ctx, 0, ry, W, 20, rgba(P.white, 0.04));
  r(ctx, 0, ry + 6, W, 8, rgba(P.white, 0.04));
  const rand = mulberry32(Math.floor(t * 20));
  for (let i = 0; i < 24; i++) r(ctx, Math.floor(rand() * W), Math.floor(rand() * H), 1, 1, rand() < 0.5 ? P.white : P.black);
}

// ---------------------------------------------------------------------------
// START SCREEN (before the viewer clicks)

const ORBIT = cached('orbit', () => {
  const pts = [];
  const seen = new Set();
  const rx = 104;
  const ry = 24;
  const a = -0.32;
  for (let i = 0; i < 1400; i++) {
    const th = (i / 1400) * TAU;
    const ex = Math.cos(th) * rx;
    const ey = Math.sin(th) * ry;
    const x = round(ex * Math.cos(a) - ey * Math.sin(a));
    const y = round(ex * Math.sin(a) + ey * Math.cos(a));
    const key = `${x},${y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pts.push([x, y, Math.sin(th) >= 0 ? 1 : 0, th]);
  }
  return pts;
});
function orbit(ctx, cx, cy, t, front) {
  const sat = (t * 0.7) % TAU;
  for (const [x, y, f, th] of ORBIT) {
    if (f !== front) continue;
    const d = (((th - sat) % TAU) + TAU) % TAU;
    const trail = d > TAU - 0.9;
    if (!trail && (x + y) & 1) continue;
    r(ctx, cx + x, cy + y, 1, 1, trail ? P.cyan : front ? P.blue : P.navy);
  }
  const sx = Math.cos(sat) * 104;
  const sy = Math.sin(sat) * 24;
  const fs = Math.sin(sat) >= 0 ? 1 : 0;
  if (fs === front) {
    const px = cx + round(sx * Math.cos(-0.32) - sy * Math.sin(-0.32));
    const py = cy + round(sx * Math.sin(-0.32) + sy * Math.cos(-0.32));
    r(ctx, px - 1, py - 1, 3, 3, P.white);
    r(ctx, px - 3, py, 7, 1, rgba(P.cyan, 0.6));
  }
}

export function drawStartScreen(ctx, t, { channel = 'LIVENEWS', prompt = 'CLICK TO TUNE IN' } = {}) {
  const GX = 294;
  const GY = 104;
  ctx.drawImage(brandField(GX, GY), 0, 0);
  drawMap(ctx, t, 4);
  drawBeams(ctx, t);
  drawPulses(ctx, GX, GY, t, 80, 260, 3, P.blue, 2, 0.6);
  drawSpecks(ctx, t);
  orbit(ctx, GX, GY, t, 0);
  globe(ctx, GX, GY, 76, t * 10, t);
  orbit(ctx, GX, GY, t, 1);

  const X0 = 20;
  // live tag
  r(ctx, X0, 50, 76, 12, P.black);
  if (Math.floor(t * 1.5) % 2 === 0) r(ctx, X0 + 4, 54, 4, 4, P.red);
  drawText(ctx, 'LIVE • 24 HOURS', X0 + 11, 53, { color: P.white });
  // channel plate
  const sc = fitScale(channel, 200, 4, 2);
  const tw = measureText(channel, sc);
  const ph = 7 * sc + 14;
  r(ctx, X0, 64, tw + 16, ph, P.red);
  r(ctx, X0, 64, tw + 16, 1, P.pink);
  r(ctx, X0, 64 + ph - 3, tw + 16, 3, P.darkRed);
  r(ctx, X0, 64 + ph, tw + 16, 2, P.yellow);
  extruded(ctx, channel, X0 + 8, 71, sc, P.white, P.darkRed, 2);
  const gl = every(t, 0.8, 3.6, 0.6);
  if (gl >= 0) sweep(ctx, X0, 64, tw + 16, ph - 3, gl, 14, 0.25);
  drawText(ctx, 'WORLD NEWS AROUND THE CLOCK', X0, 64 + ph + 9, { color: P.cream, shadow: P.black });

  // prompt pill
  const pr = ellipsis(prompt || '', 210);
  const pw = measureText(pr) + 34;
  const py = 152;
  const pulse = (Math.sin(t * 4) + 1) / 2;
  r(ctx, X0 - 1, py - 1, pw + 2, 20, pulse > 0.5 ? P.yellow : P.orange);
  r(ctx, X0, py, pw, 18, P.white);
  r(ctx, X0, py, 18, 18, P.red);
  // play triangle
  for (let i = 0; i < 4; i++) r(ctx, X0 + 7 + i, py + 5 + i, 1, 9 - 2 * i, P.white);
  const on = t % 1.2 < 0.85;
  if (on) drawText(ctx, pr, X0 + 25, py + 6, { color: P.black });
  const k = (t % 1.2) / 1.2;
  const g = 2 + round(easeOut(k) * 6);
  rectOutline(ctx, X0 - 1 - g, py - 1 - g, pw + 2 + g * 2, 20 + g * 2, P.yellow, 0.8 * (1 - k));
  sparkle(ctx, GX - 50, GY - 52, every(t, 1.5, 6, 0.5));

  // date / time line
  const info = `${longDate()}  •  LONDON ${zoneTime().label}`;
  r(ctx, 0, 199, W, 1, P.slate);
  drawText(ctx, ellipsis(info, W - 40), X0, 204, { color: P.fog });
}

// ---------------------------------------------------------------------------
// HEADLINE MONTAGE FRAME (cold open)

const CATEGORIES = {
  world: { a: P.navy, b: P.blue, label: 'WORLD' },
  politics: { a: P.purple, b: P.pink, label: 'POLITICS' },
  business: { a: P.maroon, b: P.rust, label: 'BUSINESS' },
  tech: { a: P.purple, b: P.magenta, label: 'TECH' },
  science: { a: P.darkGreen, b: P.green, label: 'SCIENCE' },
  health: { a: P.darkGreen, b: P.cyan, label: 'HEALTH' },
  climate: { a: P.darkGreen, b: P.green, label: 'CLIMATE' },
  sport: { a: P.navy, b: P.green, label: 'SPORT' },
  culture: { a: P.purple, b: P.yellow, label: 'CULTURE' },
  general: { a: P.ink, b: P.steel, label: 'NEWS' },
};
const CATEGORY_ALIASES = {
  mundo: 'world', international: 'world', internacional: 'world', europe: 'world',
  politica: 'politics', política: 'politics',
  economy: 'business', economia: 'business', economía: 'business', markets: 'business', finance: 'business',
  technology: 'tech', tecnologia: 'tech', tecnología: 'tech',
  ciencia: 'science', environment: 'climate',
  salud: 'health',
  sports: 'sport', deportes: 'sport',
  entertainment: 'culture', cultura: 'culture', arts: 'culture',
};
function category(name) {
  const k = String(name || 'general').toLowerCase().trim();
  return CATEGORIES[k] || CATEGORIES[CATEGORY_ALIASES[k]] || CATEGORIES.general;
}

const catFields = new Map();
function categoryBackground(ctx, t, cat) {
  let f = catFields.get(cat.label);
  if (!f) {
    const rmp = ramp([P.black, cat.a, cat.b]);
    f = field(W, H, (x, y) => rmp(1.55 - Math.hypot((x - 300) / 300, (y - 50) / 220) * 1.9, x, y));
    catFields.set(cat.label, f);
  }
  ctx.drawImage(f, 0, 0);
  drawMap(ctx, t, 5, 0.35);
  // marching diagonal stripes
  stripes(ctx, t, { color: cat.b, a: 0.08, period: 24, width: 10, slope: 0.5, speed: 14 });
  // giant repeating category words scrolling in opposite directions
  const word = `${cat.label} • `;
  const ww = measureText(word, 4) + 4;
  const col = rgba(cat.b, 0.16);
  for (let row = 0; row < 3; row++) {
    const dir = row % 2 ? 1 : -1;
    const sp = 12 + row * 5;
    const ox = (((t * sp * dir + row * 37) % ww) + ww) % ww;
    for (let x = -ox; x < W; x += ww) drawText(ctx, word, round(x), 34 + row * 38, { color: col, scale: 4 });
  }
}

export function drawHeadlineFrame(ctx, t, dt, { index = 0, total = 1, headline = '', source = '', category: catName = 'general', image = null } = {}) {
  const cat = category(catName);
  const DUR = 2.6;
  const X = 16;
  const lay = layoutText(headline, W - X - 16, 3, 5);
  const blockH = lay.lines.length * lay.lh;
  const textTop = 196 - blockH;
  const chipY = textTop - 17;

  // --- backdrop: image (or animated category field) pushes in from the right
  r(ctx, 0, 0, W, H, P.black);
  const ip = easeOut(seg(dt, 0, 0.55));
  const E = round(lerp(W + 70, -70, ip)); // slanted leading edge (top row)
  const ix = round((E + 70) * 0.35);
  const iy = -Math.min(10, Math.floor(dt * 4)); // slow upward drift (edge hides under the ticker)
  if (E < W) {
    ctx.save();
    clipSlab(ctx, E, 0, W + 200, H, 0.25);
    ctx.translate(ix, 0);
    if (image) ctx.drawImage(image, 0, iy);
    else categoryBackground(ctx, t, cat);
    ctx.restore();
  }
  if (ip < 1) {
    // dark left side and the brand edge
    slab(ctx, E - 400, 0, 400, H, 0.25, P.black);
    drawStripesInto(ctx, E, t);
    slab(ctx, E - 12, 0, 12, H, 0.25, P.red);
    slab(ctx, E - 15, 0, 3, H, 0.25, P.yellow);
  }
  if (image) {
    shadeBottom(ctx, chipY - 56, chipY + 10, 0.8);
    r(ctx, 0, chipY + 10, W, H - chipY - 10, rgba(P.black, 0.8));
    const s = every(dt, 1.1, 99, 1.1);
    if (s >= 0) sweep(ctx, 0, 0, W, chipY - 4, s, 40, 0.07);
  } else shadeBottom(ctx, chipY - 30, 202, 0.6);

  // --- TOP STORIES tag + progress pips (under the logo bug)
  const tagP = easeOut(seg(dt, 0.2, 0.4));
  const tagX = round(6 - 120 * (1 - tagP));
  const tagW = measureText('TOP STORIES') + 10;
  r(ctx, tagX, 24, tagW, 12, P.red);
  r(ctx, tagX, 35, tagW, 1, P.darkRed);
  drawText(ctx, 'TOP STORIES', tagX + 5, 27, { color: P.white });
  const n = clamp(Math.floor(total) || 1, 1, 20);
  const pw = clamp(Math.floor(150 / n) - 2, 3, 14);
  const pipP = seg(dt, 0.35, 0.3);
  for (let i = 0; i < n; i++) {
    if (pipP * n < i) break;
    const px = tagX + tagW + 4 + i * (pw + 2);
    const py = 28;
    r(ctx, px, py, pw, 4, rgba(P.black, 0.6));
    if (i < index) r(ctx, px, py + 1, pw, 2, P.white);
    else if (i === index) {
      r(ctx, px, py + 1, pw, 2, P.steel);
      r(ctx, px, py + 1, Math.max(1, round(pw * clamp(dt / DUR, 0, 1))), 2, P.yellow);
    } else r(ctx, px, py + 1, pw, 2, P.slate);
  }

  // --- headline block, bottom-anchored above the ticker
  // category chip + source
  const cp = easeOut(seg(dt, 0.35, 0.35));
  const label = cat.label;
  const cw = measureText(label) + 10;
  const src = ellipsis(source || '', 200);
  const chipFull = cw + (src ? measureText(src) + 12 : 0);
  if (cp > 0) {
    ctx.save();
    clipRect(ctx, X - 2, chipY, round(chipFull * cp), 12);
    r(ctx, X - 2, chipY, cw, 12, cat.b);
    drawText(ctx, label, X + 3, chipY + 3, { color: P.white, shadow: cat.a });
    if (src) {
      r(ctx, X - 2 + cw, chipY, chipFull - cw, 12, P.black);
      drawText(ctx, src, X + cw + 4, chipY + 3, { color: P.silver });
    }
    ctx.restore();
  }
  // accent bar grows down the left edge
  const ab = round((blockH + 17) * easeOut(seg(dt, 0.3, 0.5)));
  r(ctx, X - 8, chipY, 3, ab, P.red);
  // lines rise in one after another
  lay.lines.forEach((ln, i) => {
    const p = seg(dt, 0.45 + i * 0.09, 0.4);
    riseText(ctx, ln, X, textTop + i * lay.lh + 3 * lay.scale, p, { color: P.white, scale: lay.scale, shadow: P.black });
  });
}

/** Brand stripes on the dark side of the montage wipe. */
function drawStripesInto(ctx, E, t) {
  ctx.save();
  clipSlab(ctx, E - 400, 0, 400, H, 0.25);
  stripes(ctx, t, { color: P.navy, a: 0.5, period: 16, width: 6, slope: 0.25, speed: 20 });
  ctx.restore();
}

// ---------------------------------------------------------------------------
// BREAKING NEWS sting

let SIREN = null;
function sirenLayer(t) {
  if (!SIREN) {
    const c = mkCanvas(W, H);
    const x = c.getContext('2d');
    const img = x.createImageData(W, H);
    const ang = new Float32Array(W * H);
    const base = new Float32Array(W * H);
    const th = new Float32Array(W * H);
    const cx = 192;
    const cy = 66;
    for (let y = 0; y < H; y++) {
      for (let xx = 0; xx < W; xx++) {
        const i = y * W + xx;
        const dx = xx - cx;
        const dy = y - cy;
        ang[i] = Math.atan2(dy, dx) / TAU + 0.5;
        base[i] = 1.85 - Math.sqrt(dx * dx + dy * dy * 2.4) / 140;
        th[i] = bayerAt(xx, y) - 0.5;
      }
    }
    SIREN = { c, x, img, u: new Uint32Array(img.data.buffer), ang, base, th, key: -1, cols: [P.black, P.maroon, P.darkRed, P.red].map((h) => u32(h)) };
  }
  const k = Math.floor(t * 30);
  if (SIREN.key !== k) {
    SIREN.key = k;
    const { u, ang, base, th, cols } = SIREN;
    const rot = (t * 0.08) % 1;
    const N = 9;
    for (let i = 0; i < u.length; i++) {
      const s = (ang[i] + rot) * N;
      const v = base[i] + (s - (s | 0) < 0.5 ? 0.9 : 0) + th[i];
      u[i] = cols[v < 0 ? 0 : v >= 3 ? 3 : v | 0];
    }
    SIREN.x.putImageData(SIREN.img, 0, 0);
  }
  return SIREN.c;
}

function hazard(ctx, x, y, w, h, off, c1, c2) {
  ctx.save();
  clipRect(ctx, x, y, w, h);
  r(ctx, x, y, w, h, c1);
  const o = ((off % 14) + 14) % 14;
  for (let sx = x - 28 + o; sx < x + w + h; sx += 14) slab(ctx, sx, y, 7, h, -1, c2);
  ctx.restore();
}

export function drawBreakingCard(ctx, t, dt, { headline = '', source = '' } = {}) {
  // single hard flash on the cut
  if (dt < 0.05) {
    r(ctx, 0, 0, W, H, P.white);
    return;
  }
  ctx.drawImage(sirenLayer(t), 0, 0);
  if (dt < 0.14) dfill(ctx, 0, 0, W, H, P.red, 0.5);

  // hazard bands slide in from opposite sides
  const hp = easeOut(seg(dt, 0.05, 0.4));
  const flash = Math.floor(dt * 2.5) % 2 === 0;
  hazard(ctx, round(-W * (1 - hp)), 24, W, 7, t * 30, P.yellow, P.black);
  hazard(ctx, round(W * (1 - hp)), 193, W, 6, -t * 30, P.yellow, P.black);

  // impact shake after each slam
  const impact = (t0) => {
    const k = dt - t0;
    return k > 0 && k < 0.3 ? round(Math.sin(k * 75) * 4 * (1 - k / 0.3)) : 0;
  };
  const shx = impact(0.62);
  const shy = impact(0.44);
  ctx.save();
  ctx.translate(shx, shy);

  // red slab opens from its centre line
  const SY = 66;
  const SHh = 50;
  const op = seg(dt, 0.1, 0.26);
  const sh = op > 0 ? Math.max(2, round(SHh * easeOutBack(op, 1.6))) : 0;
  const sTop = SY - (sh >> 1);
  if (sh > 0) {
    r(ctx, -8, sTop + 3, W + 16, sh, rgba(P.black, 0.5));
    ribbon(ctx, -8, sTop, W + 16, sh, t * 2);
    r(ctx, -8, sTop - 2, W + 16, 2, flash ? P.yellow : P.white);
    r(ctx, -8, sTop + sh, W + 16, 2, flash ? P.white : P.yellow);
  }

  // BREAKING drops in, NEWS slams from the right
  const sc = 4;
  const full = 'BREAKING NEWS';
  const tw = measureText(full, sc);
  const tx = (W - tw) >> 1;
  const capY = SY - 14;
  const newsX = tx + measureText('BREAKING ', sc) + sc;
  if (sh > 0) {
    ctx.save();
    clipRect(ctx, -8, sTop, W + 16, sh);
    const p1 = seg(dt, 0.26, 0.18);
    if (p1 > 0) extruded(ctx, 'BREAKING', tx, capY - round(60 * (1 - easeIn(p1))), sc, P.white, P.black, 3);
    const p2 = seg(dt, 0.46, 0.16);
    if (p2 > 0) extruded(ctx, 'NEWS', newsX + round((W - newsX + 20) * (1 - easeIn(p2))), capY, sc, P.yellow, P.black, 3);
    const g = every(dt, 1.1, 1.8, 0.5);
    if (g >= 0) textGlint(ctx, 'BREAKING', tx, capY, sc, lerp(tx - 30, tx + tw + 30, g), 8, P.cream);
    ctx.restore();
    // impact streaks
    for (const [t0, x0, x1] of [
      [0.44, tx, tx + measureText('BREAKING', sc)],
      [0.62, newsX, tx + tw],
    ]) {
      const k = (dt - t0) / 0.25;
      if (k <= 0 || k >= 1) continue;
      const len = round(10 + 50 * easeOut(k));
      for (let i = 0; i < 4; i++) {
        const yy = capY + 2 + i * 8;
        r(ctx, round(x0 - 8 - len), yy, len, 1, rgba(P.white, 0.8 * (1 - k)));
        r(ctx, round(x1 + 8), yy, len, 1, rgba(P.white, 0.8 * (1 - k)));
      }
    }
  }
  ctx.restore();

  // headline box
  const BX = 16;
  const BW = W - 32;
  const lay = layoutText(headline, BW - 22, 3, 5);
  const by = 104;
  const bh = lay.lines.length * lay.lh + 12;
  const bp = easeOut(seg(dt, 0.95, 0.35));
  if (bp > 0) {
    const cw = round(BW * bp);
    r(ctx, BX + 2, by + 3, cw, bh, rgba(P.black, 0.45));
    r(ctx, BX, by, cw, bh, P.white);
    r(ctx, BX, by + bh - 2, cw, 2, P.silver);
    r(ctx, BX, by, Math.min(cw, 5), bh, P.red);
    ctx.save();
    clipRect(ctx, BX, by, cw, bh);
    lay.lines.forEach((ln, i) => {
      const p = seg(dt, 1.15 + i * 0.1, 0.4);
      riseText(ctx, ln, BX + 13, by + 6 + i * lay.lh + 3 * lay.scale, p, { color: P.black, scale: lay.scale });
    });
    ctx.restore();
    // source tag
    const sp = easeOut(seg(dt, 1.5, 0.3));
    if (source && sp > 0) {
      const s = ellipsis(source, 200);
      const sw = measureText(s) + measureText('SOURCE ') + 12;
      const sx = BX + BW - sw;
      ctx.save();
      clipRect(ctx, sx + round(sw * (1 - sp)), by + bh - 1, sw, 12);
      r(ctx, sx, by + bh - 1, sw, 12, P.yellow);
      const lw = drawText(ctx, 'SOURCE', sx + 6, by + bh + 2, { color: P.darkRed });
      drawText(ctx, s, sx + 6 + lw + 4, by + bh + 2, { color: P.black });
      ctx.restore();
    }
  }
}

// ---------------------------------------------------------------------------
// KEY FACT card

const MAGNITUDES = new Set(['THOUSAND', 'MILLION', 'BILLION', 'TRILLION', 'MN', 'BN', 'TN', 'PERCENT', 'PER CENT']);
function parseFact(fact) {
  return cached(`fact|${fact}`, () => {
    const s = normalizeText(fact || '').trim();
    const m = s.match(/^([$€]?)(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(%|[KMB]N?\b|BN\b|TN\b)?\s*(.*)$/);
    if (!m) return { big: null, rest: s };
    const [, pre, int, dec = '', suf = '', tail] = m;
    let rest = tail;
    let big = `${pre}${int}${dec}${suf}`;
    const nextWord = rest.split(/\s+/)[0] || '';
    if (!suf && MAGNITUDES.has(nextWord)) {
      big += ` ${nextWord}`;
      rest = rest.slice(nextWord.length).trim();
    }
    const value = Number(`${int.replace(/,/g, '')}${dec}`);
    const isYear = !pre && !suf && !dec && /^(1[89]|20|21)\d\d$/.test(int);
    return { big, rest, value, decimals: dec ? dec.length - 1 : 0, commas: int.includes(','), pre, after: big.slice(pre.length + int.length + dec.length), count: !isYear && value > 0 };
  });
}
function formatCount(f, k) {
  let s = (f.value * k).toFixed(f.decimals);
  if (f.commas) {
    const [a, b] = s.split('.');
    s = a.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (b ? `.${b}` : '');
  }
  return `${f.pre}${s}${f.after}`;
}

export function drawFactCard(ctx, t, dt, { fact = '', label = 'KEY FACT', source = '', image = null } = {}) {
  // backdrop: the story picture pushed back (darkened, tinted, slow drift)
  if (image) {
    r(ctx, 0, 0, W, H, P.black);
    ctx.drawImage(image, 0, -Math.min(10, Math.floor(dt * 3)));
    const v = easeOut(seg(dt, 0, 0.5));
    r(ctx, 0, 0, W, H, rgba(P.black, round(v * 11) / 20));
    r(ctx, 0, 0, W, H, rgba(P.navy, round(v * 6) / 20));
  } else {
    ctx.drawImage(brandField(192, 110), 0, 0);
    drawMap(ctx, t, 3);
    drawPulses(ctx, 192, 112, t, 90, 260, 3, P.navy, 2, 0.8);
  }
  drawBeams(ctx, t);
  drawSpecks(ctx, t, 18);

  // measure the content so the panel hugs it and sits centred
  const f = parseFact(fact);
  const PW = 292;
  const PX = (W - PW) >> 1;
  const inner = PW - 36;
  const fs = f.big ? fitScale(f.big, inner, 4, 2) : 0;
  const rest = f.rest ? layoutText(f.rest, inner, f.big ? 2 : 3, f.big ? 3 : 5) : null;
  const restH = rest ? (rest.lines.length - 1) * rest.lh + 7 * rest.scale : 0;
  const PAD_T = 24;
  let contentH = f.big ? 7 * fs + 2 + 9 + 3 + (rest ? 12 + restH : 0) : restH;
  contentH += source ? 22 : 6;
  const PH = PAD_T + contentH + 10;
  const PY = clamp(round(112 - PH / 2), 30, 120);
  const mid = PX + (PW >> 1);

  // panel unfolds: a line, then it opens vertically
  const lineP = easeOut(seg(dt, 0.05, 0.3));
  const openP = easeOutBack(seg(dt, 0.28, 0.32), 1.2);
  const cy = PY + (PH >> 1);
  if (openP <= 0) {
    const lw = round(PW * lineP);
    r(ctx, PX + ((PW - lw) >> 1), cy - 1, lw, 2, P.white);
    return;
  }
  const ph = Math.max(2, round(PH * openP));
  const py = cy - (ph >> 1);
  r(ctx, PX + 4, py + 4, PW, ph, rgba(P.black, 0.45));
  r(ctx, PX, py, PW, ph, rgba(P.ink, 0.9));
  r(ctx, PX, py, PW, 3, P.red);
  r(ctx, PX, py + ph - 2, PW, 2, P.darkRed);
  r(ctx, PX, py + 3, 1, ph - 5, P.slate);
  r(ctx, PX + PW - 1, py + 3, 1, ph - 5, P.slate);
  if (openP < 0.98) return;

  // label tab (red, fused with the top rule like a folder tab)
  const lp = easeOut(seg(dt, 0.5, 0.35));
  const lab = ellipsis(label || 'KEY FACT', PW - 80);
  const lw = measureText(lab) + 16;
  ctx.save();
  clipRect(ctx, PX + 12, PY - 9, round(lw * lp), 13);
  r(ctx, PX + 12, PY - 9, lw, 12, P.red);
  r(ctx, PX + 12, PY - 9, lw, 1, P.pink);
  drawText(ctx, lab, PX + 20, PY - 6, { color: P.white });
  ctx.restore();

  ctx.save();
  clipRect(ctx, PX, py, PW, ph);
  // tiny animated bar-chart icon (top right)
  const cp = easeOut(seg(dt, 0.6, 1.4));
  [6, 10, 4, 13].forEach((hgt, i) => {
    const hh = Math.max(1, round(hgt * cp * (0.85 + 0.15 * Math.sin(t * 3 + i))));
    r(ctx, PX + PW - 30 + i * 5, PY + 19 - hh, 3, hh, i === 3 ? P.yellow : P.steel);
  });
  r(ctx, PX + PW - 32, PY + 19, 22, 1, P.fog);

  let y = PY + PAD_T;
  if (f.big) {
    // the figure counts up, the meter fills with it
    const k = easeOut(seg(dt, 0.6, 1.3));
    const shown = f.count && k < 1 ? formatCount(f, k) : f.big;
    const bw = measureText(f.big, fs);
    const nx = mid - (bw >> 1);
    const ny = y;
    const settle = dt - 1.9;
    const col = settle > 0 && settle < 0.1 ? P.white : P.yellow;
    extruded(ctx, shown, nx, ny, fs, col, P.rust, 2);
    const g = every(dt, 2.2, 2.6, 0.55);
    if (g >= 0) textGlint(ctx, f.big, nx, ny, fs, lerp(nx - 30, nx + bw + 30, g), 7, P.cream);
    y += 7 * fs + 2 + 9;
    const segs = clamp(Math.floor((inner + 2) / 10), 8, 24);
    const mx = mid - ((segs * 10 - 2) >> 1);
    const lit = round(segs * k);
    const run = every(dt, 2.0, 2.6, 0.7);
    const runAt = run >= 0 ? Math.floor(run * (segs + 4)) - 2 : -9;
    for (let i = 0; i < segs; i++) {
      const on = i < lit;
      const head = (i === lit - 1 && k < 1) || Math.abs(i - runAt) < 1;
      r(ctx, mx + i * 10, y, 8, 3, head ? P.white : on ? (i % 6 === 5 ? P.orange : P.yellow) : P.slate);
    }
    y += 3;
    if (rest) {
      y += 12;
      rest.lines.forEach((ln, i) => {
        riseText(ctx, ln, mid, y + i * rest.lh, seg(dt, 1.5 + i * 0.1, 0.4), { color: P.white, scale: rest.scale, shadow: P.black, align: 'center' });
      });
      y += restH;
    }
  } else if (rest) {
    // no leading figure: type the fact in with a block cursor
    const total = rest.lines.reduce((a, l) => a + chars(l).length, 0);
    let budget = Math.floor(total * seg(dt, 0.65, Math.min(2.2, 0.045 * total)));
    let cursor = null;
    rest.lines.forEach((ln, i) => {
      const cs = chars(ln);
      const nshow = Math.min(cs.length, budget);
      budget -= nshow;
      const x0 = mid - (measureText(ln, rest.scale) >> 1);
      const ly = y + i * rest.lh;
      if (nshow > 0) drawText(ctx, cs.slice(0, nshow).join(''), x0, ly, { color: P.white, scale: rest.scale, shadow: P.black });
      if (nshow < cs.length && !cursor) cursor = [x0 + (nshow ? measureText(cs.slice(0, nshow).join(''), rest.scale) + rest.scale : 0), ly];
    });
    if (!cursor) {
      const last = rest.lines[rest.lines.length - 1];
      cursor = [mid + (measureText(last, rest.scale) >> 1) + 2 * rest.scale, y + (rest.lines.length - 1) * rest.lh];
    }
    if (dt < 0.65 || Math.floor(t * 3) % 2 === 0) r(ctx, cursor[0], cursor[1], 3 * rest.scale, 7 * rest.scale, P.yellow);
    y += restH;
  }

  // source line
  const sp = seg(dt, 1.9, 0.5);
  if (source && sp > 0) {
    const sy = y + 10;
    const s = ellipsis(`SOURCE: ${normalizeText(source)}`, PW - 30);
    r(ctx, PX + 12, sy - 4, round((PW - 24) * easeOut(sp)), 1, P.slate);
    drawText(ctx, typed(s, sp), PX + 12, sy + 2, { color: P.fog });
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// STINGER (transition overlay)

const STINGER_LAYERS = [
  { c: P.yellow, a: 0.0, b: 0.32, e: 0.68, f: 1.0 },
  { c: P.darkRed, a: 0.03, b: 0.37, e: 0.63, f: 0.97 },
  { c: P.red, a: 0.06, b: 0.42, e: 0.58, f: 0.94 },
];

export function drawStinger(ctx, t, p, { channel = 'LIVENEWS' } = {}) {
  if (!(p > 0 && p < 1)) return;
  const SL = 0.5;
  const SH = H * SL;
  let red = null;
  for (const L of STINGER_LAYERS) {
    const lead = lerp(0, W + SH, easeInOut(seg(p, L.a, L.b - L.a)));
    const tail = lerp(0, W + SH, easeInOut(seg(p, L.e, L.f - L.e)));
    if (lead - tail < 1) continue;
    slab(ctx, tail, 0, lead - tail, H, -SL, L.c);
    if (L.c === P.red) red = { lead, tail };
  }
  if (!red) return;
  // speed streaks and the bright leading/trailing edges of the main panel
  ctx.save();
  clipSlab(ctx, red.tail, 0, red.lead - red.tail, H, -SL);
  stripes(ctx, p * 1.5, { color: P.darkRed, a: 0.28, period: 34, width: 12, slope: -SL, speed: 160 });
  const cy = H >> 1;
  const sc = fitScale(channel, 250, 4, 2);
  const bandH = 7 * sc + 26;
  r(ctx, 0, cy - (bandH >> 1), W, bandH, rgba(P.darkRed, 0.55));
  r(ctx, 0, cy - (bandH >> 1), W, 1, rgba(P.pink, 0.6));
  r(ctx, 0, cy + (bandH >> 1), W, 2, rgba(P.maroon, 0.6));
  const streak = rgba(P.pink, 0.45);
  for (let i = 0; i < 7; i++) {
    const y = 14 + i * 31;
    if (Math.abs(y - cy) < bandH / 2 + 2) continue;
    const len = 40 + ((i * 53) % 70);
    const x = ((i * 97 + p * 1400) % (W + len + 120)) - len - 60 + y * -SL;
    r(ctx, round(x), y, len, i % 3 === 0 ? 2 : 1, streak);
  }
  slab(ctx, red.lead - 3, 0, 3, H, -SL, rgba(P.white, 0.5));
  slab(ctx, red.tail, 0, 3, H, -SL, rgba(P.white, 0.35));
  // logo sweeps through while the screen is covered
  const lp = seg(p, 0.24, 0.52);
  if (lp > 0 && lp < 1) {
    const tw = measureText(channel, sc);
    const gR = 7 * sc - 7;
    const total = gR * 2 + 10 + tw;
    const drift = round(lerp(-22, 22, lp) + (easeInOut(lp) - lp) * 40);
    const x0 = ((W - total) >> 1) + drift;
    globe(ctx, x0 + gR, cy, gR, t * 60, t);
    const tx = x0 + gR * 2 + 10;
    const ty = cy - round((7 * sc) / 2);
    extruded(ctx, channel, tx, ty, sc, P.white, P.maroon, 2);
    const ulw = round(tw * easeOut(seg(lp, 0.1, 0.5)));
    r(ctx, tx, ty + 7 * sc + 4, ulw, 2, P.yellow);
    textGlint(ctx, channel, tx, ty, sc, lerp(tx - 20, tx + tw + 20, easeInOut(seg(lp, 0.2, 0.6))), 6, P.yellow);
  }
  ctx.restore();
}
