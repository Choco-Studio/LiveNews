// Captions (subtitles) with their own unmistakable voice: teletext-style
// yellow caps on solid black line boxes (the art direction's one allowed
// coloured-text pair), so they never read as another strap line. At most two
// balanced lines of ~44 characters. A long sentence is split into pages at
// phrase boundaries (graphics/breaks.js), paced to the speech and never
// stepping back, so no line is ever dropped; pages roll up instead of
// popping. The block sits 6 px above the lower third or the ticker and moves
// smoothly when the strap comes and goes; over full-screen graphics that own
// the bottom it moves to the top.
import { P } from '../palette.js';
import { drawText, measureText } from '../font.js';
import { W, CAPTION, easeOut, easeInOut, clamp01, clipped } from './layout.js';
import { layoutText } from './breaks.js';

export const CAPTION_TIMING = {
  cps: 15, // speech pace when nothing better is known (matches audio.js mute pace)
  lead: 4, // characters: turn the page just before its first word is spoken
  minPage: 1.2, // seconds a page stays up at least
  grace: 0.5, // after the speech timeline stops, wait this long before pacing on by the clock
  roll: 0.22, // page change
  hold: 0.5, // caption lingers after speech before fading
  fade: 0.25,
};
const C = CAPTION_TIMING;
export const CAPTION_COLOR = P.yellow;
const BOX = P.black;
const EMPTY = Object.freeze([]);

/**
 * Split a sentence into pages of at most two lines of `maxW` pixels, breaking
 * at phrase boundaries with balanced lines. Each page knows the character
 * offset it starts at (frozen, cached).
 */
export function paginate(text, maxW = CAPTION.maxW) {
  return layoutText(text, { maxW, perPage: 2 });
}

/**
 * Which page is on air `elapsed` seconds into a sentence. `spoken` (optional)
 * is how many characters have been spoken; without it the clock pace is used.
 */
export function pageAt(pages, elapsed, spoken = null) {
  const at = Number.isFinite(spoken) ? spoken : elapsed * C.cps;
  let k = 0;
  while (k + 1 < pages.length && at >= pages[k + 1].start - C.lead && elapsed >= (k + 1) * C.minPage) k++;
  return k;
}

/** Tracks the caption on screen: current page, the one it replaced, fades. */
export class CaptionState {
  constructor() {
    this.reset();
  }

  reset() {
    this.text = null;
    this.pages = EMPTY;
    this.since = 0;
    this.page = -1;
    this.lines = EMPTY;
    this.prevLines = EMPTY;
    this.changeAt = -Infinity;
    this.clearAt = null;
    this.lastChar = null; // last character index reported by the speech timeline
    this.lastCharAt = 0;
  }

  /**
   * `text` is the sentence being spoken (null when nobody speaks), `since` the
   * time it started (optional), `charIndex` the speech timeline's position
   * inside it when known (optional).
   */
  update(t, text, since = null, charIndex = null) {
    if (text && text !== this.text) {
      const pages = paginate(text);
      if (!pages.length) text = null; // whitespace only: nothing to show
      else {
        this.text = text;
        this.pages = pages;
        this.since = Number.isFinite(since) ? since : t;
        this.page = -1;
        this.lastChar = null;
      }
    }
    if (!text) {
      if (this.text !== null && this.clearAt === null) this.clearAt = t;
      if (this.clearAt !== null && t - this.clearAt >= C.hold + C.fade) this.reset();
      return;
    }
    this.clearAt = null;
    const elapsed = t - this.since;
    let spoken = null;
    if (Number.isFinite(charIndex) && charIndex >= 0 && charIndex <= text.length) {
      spoken = charIndex;
      this.lastChar = charIndex;
      this.lastCharAt = t;
    } else if (this.lastChar !== null) {
      // the timeline stopped (end of its estimate, or the voice overran it): carry on
      // from the last known word at the clock pace, after a short grace
      spoken = this.lastChar + Math.max(0, t - this.lastCharAt - C.grace) * C.cps;
    }
    // within one sentence the caption only ever moves forward
    const k = Math.max(pageAt(this.pages, elapsed, spoken), this.page);
    if (k !== this.page) {
      this.prevLines = this.lines;
      this.lines = this.pages[k].lines;
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
    const bx = Math.floor(W / 2 - w / 2) - CAPTION.padX;
    const by = y0 + i * CAPTION.pitch;
    ctx.fillStyle = BOX;
    ctx.fillRect(bx, by, w + 2 * CAPTION.padX, CAPTION.pitch);
    drawText(ctx, lines[i], bx + CAPTION.padX, by + CAPTION.capY, { color: CAPTION_COLOR });
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
  const before = ctx.globalAlpha;
  ctx.globalAlpha = before * alpha;
  try {
    // one uniform roll through the window: both blocks travel its full height, so
    // the old page is out of sight before it is dropped even when it was taller
    clipped(ctx, 0, top, W, boxH, () => {
      if (k < 1 && oldH) drawBlock(ctx, s.prevLines, bottom - oldH - Math.round(k * boxH));
      drawBlock(ctx, s.lines, bottom - newH + Math.round((1 - k) * boxH));
    });
  } finally {
    ctx.globalAlpha = before;
  }
}
