// Captions (subtitles): at most two balanced lines in teletext-style black
// boxes. A long sentence is paged two lines at a time, paced to the speech, so
// no line is ever dropped; pages roll up instead of popping. The block sits
// above the lower third or the ticker and moves smoothly when the strap comes
// and goes; over full-screen graphics that own the bottom it moves to the top.
import { P } from '../palette.js';
import { drawText, measureText, wrapLines } from '../font.js';
import { W, CAPTION, easeOut, easeInOut, clamp01, clipped } from './layout.js';

export const CAPTION_TIMING = {
  cps: 15, // speech pace when nothing better is known (matches audio.js mute pace)
  lead: 4, // characters: turn the page just before its first word is spoken
  minPage: 1.2, // seconds a page stays up at least
  roll: 0.22, // page change
  hold: 0.5, // caption lingers after speech before fading
  fade: 0.25,
};
const C = CAPTION_TIMING;
const BOX = 'rgba(24,20,37,0.82)';
const EMPTY = Object.freeze([]);

const pageMemo = new Map();

/**
 * Split a sentence into pages of at most two lines. Lines are balanced (the
 * narrowest wrap with the same line count) so a two-line caption is not one
 * long line and a widow. Each page knows the character offset it starts at.
 */
export function paginate(text, maxW = CAPTION.maxW) {
  const key = `${maxW}|${text}`;
  let pages = pageMemo.get(key);
  if (pages) return pages;
  const full = wrapLines(text, maxW);
  let lines = full;
  if (full.length > 1) {
    let lo = Math.floor(maxW / 2);
    let hi = maxW;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (wrapLines(text, mid).length <= full.length) hi = mid;
      else lo = mid + 1;
    }
    lines = wrapLines(text, hi);
  }
  pages = [];
  let start = 0;
  for (let i = 0; i < lines.length; i += 2) {
    const chunk = lines.slice(i, i + 2);
    pages.push(Object.freeze({ lines: Object.freeze(chunk), start }));
    for (const l of chunk) start += l.length + 1;
  }
  if (pageMemo.size > 300) pageMemo.delete(pageMemo.keys().next().value);
  pageMemo.set(key, pages);
  return pages;
}

/** Which page is on air `elapsed` seconds into a sentence (or at a known character index). */
export function pageAt(pages, elapsed, charIndex = null) {
  const spoken = Number.isFinite(charIndex) ? charIndex : elapsed * C.cps;
  let k = 0;
  while (k + 1 < pages.length && spoken >= pages[k + 1].start - C.lead && elapsed >= (k + 1) * C.minPage) k++;
  return k;
}

/** Tracks the caption on screen: current page, the one it replaced, fades. */
export class CaptionState {
  constructor() {
    this.text = null;
    this.since = 0;
    this.page = -1;
    this.lines = EMPTY;
    this.prevLines = EMPTY;
    this.changeAt = -Infinity;
    this.clearAt = null;
  }

  update(t, text, { since = null, charIndex = null } = {}) {
    if (!text) {
      if (this.text !== null && this.clearAt === null) this.clearAt = t;
      if (this.clearAt !== null && t - this.clearAt >= C.hold + C.fade) {
        this.text = null;
        this.lines = EMPTY;
        this.prevLines = EMPTY;
        this.page = -1;
        this.clearAt = null;
      }
      return;
    }
    if (text !== this.text || this.clearAt !== null) {
      if (text !== this.text) {
        this.text = text;
        this.since = Number.isFinite(since) ? since : t;
        this.page = -1;
      }
      this.clearAt = null;
    }
    const pages = paginate(text);
    const valid = Number.isFinite(charIndex) && charIndex >= 0 && charIndex <= text.length ? charIndex : null;
    const k = pageAt(pages, t - this.since, valid);
    if (k !== this.page) {
      this.prevLines = this.lines;
      this.lines = pages[k].lines;
      this.page = k;
      this.changeAt = t;
    }
  }

  get active() {
    return this.lines.length > 0;
  }
}

const blockH = (lines) => lines.length * CAPTION.pitch;

function drawBlock(ctx, lines, y0) {
  for (let i = 0; i < lines.length; i++) {
    const w = measureText(lines[i]);
    const bx = Math.floor(W / 2 - w / 2) - 4;
    const by = y0 + i * CAPTION.pitch;
    ctx.fillStyle = BOX;
    ctx.fillRect(bx, by, w + 8, CAPTION.pitch);
    drawText(ctx, lines[i], W / 2, by + 2, { color: P.white, align: 'center' });
  }
}

/**
 * Draw the caption block. `place` = { bottom } (anchored above something) or
 * { top } (anchored under the top row).
 */
export function drawCaptions(ctx, t, s, place) {
  if (!s.active) return;
  const alpha = s.clearAt === null ? 1 : 1 - clamp01((t - s.clearAt - C.hold) / C.fade);
  if (alpha <= 0) return;
  const k = easeOut((t - s.changeAt) / C.roll);
  const newH = blockH(s.lines);
  const oldH = k < 1 ? blockH(s.prevLines) : 0;
  const boxH = Math.max(newH, oldH);
  const bottom = place.top !== undefined ? place.top + Math.round(easeInOut(k) * newH + (1 - easeInOut(k)) * oldH) : place.bottom;
  const top = bottom - boxH;
  ctx.globalAlpha = alpha;
  clipped(ctx, 0, top, W, boxH, () => {
    if (k < 1 && oldH) drawBlock(ctx, s.prevLines, bottom - oldH - Math.round(k * newH));
    drawBlock(ctx, s.lines, bottom - newH + Math.round((1 - k) * newH));
  });
  ctx.globalAlpha = 1;
}
