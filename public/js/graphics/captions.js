// Captions (subtitles) in the broadcast subtitle convention: white caps on
// solid black line boxes, centred and ragged, so they never read as another
// strap line (straps are left-aligned ink bars with an accent) and the yellow
// stays where the programme bibles allow it. Two balanced lines of at most ~44
// characters, or one line at a time while a strap is up, so the bottom third
// stays light. A long sentence is split into pages at phrase boundaries
// (graphics/breaks.js 'caption' style: an extra page is cheaper than a line
// that cuts "the Great / Barrier Reef"), paced to the speech and never
// stepping back, so no line is ever dropped; each page wipes in diagonally from the
// bottom-left over the one it replaces, and the last one wipes off after the speech. The block
// sits 6 px above the lower third or the ticker and moves smoothly when the
// strap comes and goes; over full-screen graphics that own the bottom it moves
// to the top.
import { P } from '../palette.js';
import { drawText, measureText } from '../font.js';
import { W, CAPTION, easeInOut } from './layout.js';
import { layoutText } from './breaks.js';
import { CHANNEL } from '../pace.js';

// PACE: page holds and timings from the one pacing table (pace.js CHANNEL.captions):
//   cps (speech pace when nothing better is known, = audio.js mute pace), lead (chars: turn the page just
//   before its first word), minPage (s a page stays up at least), grace (after the speech timeline stops),
//   wipe (diagonal page change), hold (caption lingers after speech), out (its diagonal wipe off)
export const CAPTION_TIMING = CHANNEL.captions;
const C = CAPTION_TIMING;
export const CAPTION_COLOR = P.white;
const BOX = P.black;
const EMPTY = Object.freeze([]);
const STYLE = Object.freeze({ color: CAPTION_COLOR });

/**
 * Split a sentence into pages of at most `perPage` (1 or 2) lines of `maxW`
 * pixels, breaking at phrase boundaries with balanced lines. Each page knows
 * the character offset it starts at (frozen, cached).
 */
export function paginate(text, maxW = CAPTION.maxW, perPage = 2) {
  return layoutText(text, { maxW, perPage: perPage === 1 ? 1 : 2, style: 'caption' });
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

/** Tracks the caption on screen: current page, the one it replaced, the exit. */
export class CaptionState {
  constructor() {
    this.reset();
  }

  reset() {
    this.text = null;
    this.pages = EMPTY;
    this.perPage = 2;
    this.since = 0;
    this.page = -1;
    this.minPage = 0; // first page allowed after a re-layout (pages only move forward)
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
   * inside it when known (optional), `perPage` 2 or 1 (a strap is up).
   */
  update(t, text, since = null, charIndex = null, perPage = 2) {
    const per = perPage === 1 ? 1 : 2;
    if (text && text !== this.text) {
      const pages = paginate(text, CAPTION.maxW, per);
      if (!pages.length) text = null; // whitespace only: nothing to show
      else {
        this.text = text;
        this.pages = pages;
        this.perPage = per;
        this.since = Number.isFinite(since) ? since : t;
        this.page = -1;
        this.minPage = 0;
        this.lastChar = null;
      }
    } else if (text && per !== this.perPage) {
      // the strap came or went mid-sentence: re-layout and carry on from the page
      // that holds the words on screen now (repeating them beats losing them)
      const from = this.page >= 0 ? this.pages[this.page].start : 0;
      const pages = paginate(text, CAPTION.maxW, per);
      let k = 0;
      while (k + 1 < pages.length && pages[k + 1].start <= from) k++;
      this.pages = pages;
      this.perPage = per;
      this.page = -1;
      this.minPage = k;
    }
    if (!text) {
      if (this.text !== null && this.clearAt === null) this.clearAt = t;
      if (this.clearAt !== null && t - this.clearAt >= C.hold + C.out) this.reset();
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
    const k = Math.max(pageAt(this.pages, elapsed, spoken), this.page, this.minPage);
    if (k !== this.page) {
      const lines = this.pages[k].lines;
      if (!sameLines(lines, this.lines)) {
        this.prevLines = this.lines;
        this.lines = lines;
        this.changeAt = t;
      }
      this.page = k;
    }
  }

  get active() {
    return this.lines.length > 0;
  }
}

function sameLines(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

const blockH = (lines) => lines.length * CAPTION.pitch;

function drawBlock(ctx, lines, y0) {
  for (let i = 0; i < lines.length; i++) {
    const w = measureText(lines[i]);
    const bx = Math.floor(W / 2 - w / 2) - CAPTION.padX;
    const by = y0 + i * CAPTION.pitch;
    ctx.fillStyle = BOX;
    ctx.fillRect(bx, by, w + 2 * CAPTION.padX, CAPTION.pitch);
    drawText(ctx, lines[i], bx + CAPTION.padX, by + CAPTION.capY, STYLE);
  }
}

// Pages wipe in diagonally, from the bottom-left corner to the top-right (owner 5 Oct),
// with the page they replace erased by the same front, so two pages never share a line.
// The front is a pixel staircase (STEP px columns, rising 1 px for every SLOPE px across):
// whole pixels, no soft edge. The last page leaves the same way after its hold.
const STEP = 2;
const SLOPE = 2;

function blockSpan(lines) {
  let w = 0;
  for (const line of lines) w = Math.max(w, measureText(line));
  return w + 2 * CAPTION.padX;
}

/** Clip to the part of the frame [L, R] x [T, B] the front has (`passed`) or has not yet reached. */
function clipFront(ctx, L, R, T, B, d, passed) {
  ctx.save();
  ctx.beginPath();
  for (let x = L; x < R; x += STEP) {
    const up = Math.max(0, Math.min(B - T, Math.floor((d - (x - L)) / SLOPE)));
    if (passed) {
      if (up > 0) ctx.rect(x, B - up, STEP, up);
    } else if (B - up > T) ctx.rect(x, T, STEP, B - up - T);
  }
  ctx.clip();
}

/**
 * Draw the caption block. `place` = { bottom } (anchored above something) or
 * { top } (anchored under the top row).
 */
export function drawCaptions(ctx, t, s, place) {
  if (!s.active) return;
  const atTop = place.top !== undefined;
  const yOf = (lines) => (atTop ? place.top : place.bottom - blockH(lines));
  let from = EMPTY;
  let to = s.lines;
  let k = 1;
  if (s.clearAt !== null) {
    // after the speech: hold, then wipe off
    const p = (t - s.clearAt - C.hold) / C.out;
    if (p >= 1) return;
    if (p > 0) {
      from = s.lines;
      to = EMPTY;
      k = easeInOut(p);
    }
  } else {
    const p = (t - s.changeAt) / C.wipe;
    if (p < 1) {
      from = s.prevLines;
      k = easeInOut(Math.max(0, p));
    }
  }
  if (k >= 1) {
    if (to.length) drawBlock(ctx, to, yOf(to));
    return;
  }
  const span = Math.max(blockSpan(from), blockSpan(to));
  const L = Math.floor(W / 2 - span / 2) - 1;
  const R = L + span + 2;
  const T = Math.min(from.length ? yOf(from) : Infinity, to.length ? yOf(to) : Infinity);
  const B = Math.max(from.length ? yOf(from) + blockH(from) : -Infinity, to.length ? yOf(to) + blockH(to) : -Infinity);
  const d = Math.round(k * (R - L + (B - T) * SLOPE));
  if (from.length) {
    clipFront(ctx, L, R, T, B, d, false);
    try {
      drawBlock(ctx, from, yOf(from));
    } finally {
      ctx.restore();
    }
  }
  if (to.length) {
    clipFront(ctx, L, R, T, B, d, true);
    try {
      drawBlock(ctx, to, yOf(to));
    } finally {
      ctx.restore();
    }
  }
}
