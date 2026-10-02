// Bitmap text for the video wall (owner: STUDIO SET stream).
//
// The wall is drawn into plain Uint32 buffers, so text is turned into 1-bit
// masks once per (text, font, scale) using the channel font (public/js/font.js
// drawText: the same glyphs as the graphics package) and then stamped in any
// palette colour. font.js renders glyphs through a DOM canvas; without a DOM
// (node tests) textMask() returns null and the wall simply has no text.
import { drawText, measureText, fontMetrics } from '../../../font.js';

const MASKS = new Map();
const LIMIT = 256;

/**
 * 1-bit mask of a text line: { w, h, top, mask } where `top` is the number of rows above
 * the cap line (accents), or null without a DOM. Cached (bounded).
 */
export function textMask(text, font = 'body', scale = 1) {
  const s = String(text ?? '');
  if (!s) return null;
  const key = `${font}|${scale}|${s}`;
  if (MASKS.has(key)) return MASKS.get(key);
  let out = null;
  try {
    if (typeof document !== 'undefined') {
      const m = fontMetrics(font);
      const w = Math.max(1, Math.ceil(measureText(s, scale, font)) + scale);
      const h = (m.lineHeight + 1) * scale;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      drawText(ctx, s, 0, m.ascent * scale, { color: '#ffffff', scale, font });
      const d = ctx.getImageData(0, 0, w, h).data;
      const mask = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) mask[i] = d[i * 4 + 3] > 128 ? 1 : 0;
      out = { w, h, top: m.ascent * scale, width: measureText(s, scale, font), cap: m.cap * scale, mask };
    }
  } catch {
    out = null;
  }
  if (MASKS.size >= LIMIT) MASKS.delete(MASKS.keys().next().value);
  MASKS.set(key, out);
  return out;
}

/** Width in px of a text line (works without a DOM). */
export const textWidth = (text, font = 'body', scale = 1) => measureText(String(text ?? ''), scale, font);
/** Cap height in px. */
export const capHeight = (font = 'body', scale = 1) => fontMetrics(font).cap * scale;

/**
 * Stamp text into a w x h Uint32 buffer with its cap line's top-left at (x, y).
 * align 'left' | 'center' | 'right' moves x. Returns the drawn width.
 */
export function stampText(buf, w, h, text, x, y, color, font = 'body', scale = 1, align = 'left') {
  const m = textMask(text, font, scale);
  const tw = textWidth(text, font, scale);
  const x0 = Math.round(align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x);
  if (!m) return tw;
  const y0 = Math.round(y) - m.top;
  for (let j = 0; j < m.h; j++) {
    const yy = y0 + j;
    if (yy < 0 || yy >= h) continue;
    const row = j * m.w, out = yy * w;
    for (let i = 0; i < m.w; i++) {
      if (!m.mask[row + i]) continue;
      const xx = x0 + i;
      if (xx >= 0 && xx < w) buf[out + xx] = color;
    }
  }
  return tw;
}
