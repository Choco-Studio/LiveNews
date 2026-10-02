// Cached text layout on top of font.js: wrapping, fitting and ellipsis are
// computed once per (text, width, scale) instead of every frame.
import { measureText, wrapText, normalizeText } from '../font.js';
import { memo } from './canvas.js';

const cached = memo(600);

/** Text shortened with "..." so it fits maxW at `scale`. */
export function ellipsis(text, maxW, scale = 1, force = false) {
  const src = normalizeText(text ?? '').trim();
  return cached(`el|${maxW}|${scale}|${force ? 1 : 0}|${src}`, () => {
    let s = src;
    if (!force && measureText(s, scale) <= maxW) return s;
    while (s.length && measureText(`${s}...`, scale) > maxW) s = s.slice(0, -1).trimEnd();
    return `${s}...`;
  });
}

/** Word wrap capped at maxLines (the last line ellipsised); over-long words are clipped. */
export function wrapLines(text, maxW, scale = 1, maxLines = 99) {
  const src = normalizeText(text ?? '').trim();
  return cached(`wl|${maxW}|${scale}|${maxLines}|${src}`, () => {
    let lines = wrapText(src, maxW, scale).map((l) => ellipsis(l, maxW, scale));
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      lines[maxLines - 1] = ellipsis(lines[maxLines - 1], maxW, scale, true);
    }
    return lines;
  });
}

/** Largest integer scale in [minS, maxS] at which text fits maxW. */
export function fitScale(text, maxW, maxS = 2, minS = 1) {
  for (let s = maxS; s > minS; s--) if (measureText(text, s) <= maxW) return s;
  return minS;
}

/** Cached measureText (font.js re-measures by walking every glyph). */
export function textW(text, scale = 1) {
  return cached(`mw|${scale}|${text}`, () => measureText(text, scale));
}

/** "NAME, NAME & NAME" from a list of names. */
export function nameList(list) {
  const a = (Array.isArray(list) ? list : []).map((n) => String(n ?? '').trim().toUpperCase()).filter(Boolean);
  if (a.length <= 1) return a[0] || '';
  return `${a.slice(0, -1).join(', ')} & ${a[a.length - 1]}`;
}
