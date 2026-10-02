// Palette colour helpers. Graphics use palette colours only; alpha versions
// exist for shades and glass, with the alpha quantised to 1/32 steps so the
// string cache stays small (one entry per colour and step, never per frame).

const RGB = new Map();
/** [r, g, b] of a #rrggbb colour (cached). */
export function rgbOf(hex) {
  let v = RGB.get(hex);
  if (!v) {
    const n = parseInt(String(hex).slice(1, 7), 16) || 0;
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    RGB.set(hex, v);
  }
  return v;
}

/** Packed little-endian RGBA for Uint32Array pixel buffers. */
export function u32(hex, a = 255) {
  const [r, g, b] = rgbOf(hex);
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

const STEPS = 32;
const RGBA = new Map();
/** CSS colour string of a palette colour at alpha a (quantised, cached). */
export function rgba(hex, a) {
  const q = Math.round((a < 0 ? 0 : a > 1 ? 1 : a) * STEPS);
  const key = `${hex}|${q}`;
  let s = RGBA.get(key);
  if (!s) {
    const [r, g, b] = rgbOf(hex);
    s = q >= STEPS ? hex : `rgba(${r},${g},${b},${q / STEPS})`;
    RGBA.set(key, s);
  }
  return s;
}
