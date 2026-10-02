// Cached text layout on top of font.js: wrapping, fitting and ellipsis are
// computed once per (text, width, scale) instead of every frame. Caches are
// nested Maps keyed by the string itself and a numeric parameter key, so a
// cache hit allocates nothing (no key strings built per frame).
import { measureText, wrapText, normalizeText } from '../font.js';

/** Two-level cache: text -> numeric key -> value, with a bound on distinct texts. */
function textCache(limit = 400) {
  const outer = new Map();
  return (text, num, build) => {
    let inner = outer.get(text);
    if (!inner) {
      if (outer.size >= limit) outer.delete(outer.keys().next().value);
      inner = new Map();
      outer.set(text, inner);
    }
    let v = inner.get(num);
    if (v === undefined) {
      v = build();
      inner.set(num, v);
    }
    return v;
  };
}

/**
 * The same two-level cache around a fixed build(text, num, a, b, c): the call site passes no
 * closure, so a hit allocates nothing.
 */
function textCacheFn(limit, build) {
  const outer = new Map();
  return (text, num, a, b, c) => {
    let inner = outer.get(text);
    if (!inner) {
      if (outer.size >= limit) outer.delete(outer.keys().next().value);
      inner = new Map();
      outer.set(text, inner);
    }
    let v = inner.get(num);
    if (v === undefined) {
      v = build(text, num, a, b, c);
      inner.set(num, v);
    }
    return v;
  };
}

const ELL = textCacheFn(600, (raw, num, maxW, scale, force) => {
  let s = normalizeText(raw).trim();
  if (!force && measureText(s, scale) <= maxW) return s;
  while (s.length && measureText(`${s}...`, scale) > maxW) s = s.slice(0, -1).trimEnd();
  return `${s}...`;
});
/** Text shortened with "..." so it fits maxW at `scale` (normalised to the font's caps). */
export function ellipsis(text, maxW, scale = 1, force = false) {
  const raw = typeof text === 'string' ? text : String(text ?? '');
  return ELL(raw, maxW * 64 + scale * 2 + (force ? 1 : 0), maxW, scale, force);
}

const WRAP = textCacheFn(400, (raw, num, maxW, scale, maxLines) => {
  let lines = wrapText(normalizeText(raw).trim(), maxW, scale).map((l) => ellipsis(l, maxW, scale));
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[maxLines - 1] = ellipsis(lines[maxLines - 1], maxW, scale, true);
  }
  return Object.freeze(lines);
});
/** Word wrap capped at maxLines (the last line ellipsised); over-long words are clipped. Frozen result. */
export function wrapLines(text, maxW, scale = 1, maxLines = 99) {
  const raw = typeof text === 'string' ? text : String(text ?? '');
  return WRAP(raw, (maxW * 8 + scale) * 128 + Math.min(127, maxLines), maxW, scale, maxLines);
}

const BAL = textCacheFn(400, (raw, num, maxW, scale, maxLines) => {
  const first = wrapLines(raw, maxW, scale, maxLines);
  if (first.length < 2 || first[first.length - 1].endsWith('...')) return first;
  let lo = Math.ceil(maxW / first.length), hi = maxW, best = first;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const try2 = wrapText(normalizeText(raw).trim(), mid, scale);
    if (try2.length === first.length && try2.every((l) => measureText(l, scale) <= mid)) {
      best = Object.freeze(try2);
      hi = mid - 1;
    } else lo = mid + 1;
  }
  return best;
});
/**
 * Word wrap with balanced lines: the fewest lines that fit maxW, then the narrowest width that
 * keeps that line count, so the last line is never a one-word widow (cached, frozen).
 */
export function balanceLines(text, maxW, scale = 1, maxLines = 99) {
  const raw = typeof text === 'string' ? text : String(text ?? '');
  return BAL(raw, (maxW * 8 + scale) * 128 + Math.min(127, maxLines), maxW, scale, maxLines);
}

/** Largest integer scale in [minS, maxS] at which text fits maxW. */
export function fitScale(text, maxW, maxS = 2, minS = 1) {
  for (let s = maxS; s > minS; s--) if (measureText(text, s) <= maxW) return s;
  return minS;
}

const MW = textCacheFn(800, (text, scale) => measureText(text, scale));
/** Cached measureText. */
export function textW(text, scale = 1) {
  return MW(text, scale);
}

// Letters with no base form under NFD, spelled the way an English caption would
const ASCII_MAP = {
  Ł: 'L', ł: 'l', Ø: 'O', ø: 'o', Æ: 'AE', æ: 'ae', Œ: 'OE', œ: 'oe', ß: 'SS', Đ: 'D', đ: 'd', Þ: 'TH', þ: 'th', Ð: 'D', ð: 'd',
  ı: 'i', '’': "'", '‘': "'", '´': "'", '`': "'", '“': '"', '”': '"', '«': '"', '»': '"', '–': '-', '—': '-', '…': '...',
};
const ASCII = new Map();
/**
 * Plain ASCII for the bitmap font (place names, headlines from feeds): accents stripped
 * ("CÔTE D'IVOIRE" -> "COTE D'IVOIRE", "SÃO PAULO" -> "SAO PAULO"), special letters spelled out
 * ("ŁÓDŹ" -> "LODZ"), curly quotes straightened. Cached per string (a hit allocates nothing).
 */
export function asciiText(text) {
  const s = typeof text === 'string' ? text : String(text ?? '');
  let v = ASCII.get(s);
  if (v !== undefined) return v;
  v = '';
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7f]*$/.test(s)) v = s;
  else for (const c of s.normalize('NFD')) v += ASCII_MAP[c] ?? (c >= '̀' && c <= 'ͯ' ? '' : c);
  if (ASCII.size >= 600) ASCII.delete(ASCII.keys().next().value);
  ASCII.set(s, v);
  return v;
}

/** "NAME, NAME & NAME" from a list of names. */
export function nameList(list) {
  const a = (Array.isArray(list) ? list : []).map((n) => String(n ?? '').trim().toUpperCase()).filter(Boolean);
  if (a.length <= 1) return a[0] || '';
  return `${a.slice(0, -1).join(', ')} & ${a[a.length - 1]}`;
}

export { textCache, textCacheFn };
