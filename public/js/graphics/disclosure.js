// The channel's AI disclosure on screen (docs/publishing/compliance.md §3; AI Act Art. 50(4)-(5); the EU Code of
// Practice on transparency of AI-generated content, Commitment 1: an icon whose main element is the capital "AI",
// shown at the start, at intervals and after every break, clear against any background).
//
// One mark, one colour language: YELLOW MEANS MADE BY AI. The mark docks to the bug's right edge, the same yellow
// plate the RECREATION label stands on, black "AI" in double-struck 5x7 caps with its corners knocked off (a pixel
// nod to the EU icon's pill). It never leaves the screen while the graphics are up. At the programme's start, after
// every break and every five minutes it opens for a few seconds into the channel's words on a black plate,
// AI · PRODUCED NEWS (FORECAST, SPORT, QUIZ by programme), the EU icon's "AI GENERATED" in our type, and closes again.
//
// Frames: a clip cut to 9:16 or 1:1 is recorded with ?frame=9x16 (or 9x16@<x>, 1x1, 4x5): the graphics that carry a
// disclosure (this mark, the recreation's label and name, the captions) are laid out inside that window, so the crop
// keeps them whole and legible; the clock and the ticker stay out of a clip.
//
//   FRAME                          the active window { active, aspect, x, w, cx }
//   setFrame(spec) / frameFromSearch(search)
//   markOpen(t, from, onAt)        0..1, how far the mark is open at render time t (deterministic)
//   nounOf(programId)              NEWS, FORECAST, SPORT or QUIZ
//   markWidth(open, noun)          its width in px
//   drawMark(ctx, x, y, open, noun)
//   drawBoldAI(ctx, x, y, color)   the double-struck AI (also the recreation label's)
//   AI_W                           the bold AI's width
import { P } from '../palette.js';
import { drawText, measureText } from '../font.js';
import { W, TOP, rect, easeOut, easeIn, clamp01 } from './layout.js';

// ------------------------------------------------------------------------------------------------ frames

/** The window disclosures are laid out in (the whole 384 px width unless a clip frame is set). */
export const FRAME = { active: false, aspect: '16:9', x: 0, w: W, cx: W / 2 };

const ASPECTS = { '9x16': 9 / 16, '1x1': 1, '4x5': 4 / 5, '3x4': 3 / 4 };

/**
 * Set the clip frame: '9x16' (centred), '9x16@140' (left edge at x = 140), '1x1', '4x5', or null for the full
 * 16:9 frame. The window is the crop of the 216 px tall canvas at that aspect, in whole pixels, inside the canvas.
 */
export function setFrame(spec) {
  const m = /^(9x16|1x1|4x5|3x4)(?:@(\d{1,3}))?$/.exec(String(spec ?? '').trim());
  if (!m) {
    Object.assign(FRAME, { active: false, aspect: '16:9', x: 0, w: W, cx: W / 2 });
    return FRAME;
  }
  const w = Math.floor(216 * ASPECTS[m[1]]);
  const x = m[2] !== undefined ? Math.max(0, Math.min(W - w, Number(m[2]))) : Math.round((W - w) / 2);
  Object.assign(FRAME, { active: true, aspect: m[1].replace('x', ':'), x, w, cx: x + w / 2 });
  return FRAME;
}

/** The frame a page's URL asks for (?frame=9x16). */
export function frameFromSearch(search) {
  try {
    return new URLSearchParams(String(search || '')).get('frame');
  } catch {
    return null;
  }
}

if (typeof location !== 'undefined' && location?.search) setFrame(frameFromSearch(location.search));

// ------------------------------------------------------------------------------------------------ the mark

/** When the mark opens: at the graphics' start (the open, a return from a break), then every `every` s. */
export const MARK_TIMING = Object.freeze({ hold: 8, every: 300, again: 6, open: 0.35, close: 0.25, delay: 0.4 });

/**
 * How far the mark is open (0 closed .. 1 open) at render time t. It first opens at `from` (just after the
 * programme's name has left the top row, or when the graphics come on) for `hold` s, then every `every` s after the
 * graphics came on (`onAt`) for `again` s, and again after every break (the graphics come on again: a new onAt).
 */
export function markOpen(t, from, onAt = from) {
  const pulse = (start, hold) => {
    const s = t - start;
    if (!(s >= 0)) return 0;
    if (s < MARK_TIMING.open) return easeOut(s / MARK_TIMING.open);
    if (s < hold) return 1;
    return 1 - easeIn(clamp01((s - hold) / MARK_TIMING.close));
  };
  const first = pulse(from, MARK_TIMING.hold);
  if (t < from + MARK_TIMING.hold + MARK_TIMING.close) return first;
  const k = Math.floor((t - onAt) / MARK_TIMING.every);
  return k >= 1 ? pulse(onAt + k * MARK_TIMING.every, MARK_TIMING.again) : 0;
}

/** The programme's noun in the open mark (the server's disclosure.js programmeWording says the same). */
export const MARK_NOUN = Object.freeze({ 'world-weather': 'FORECAST', 'full-time': 'SPORT', 'pay-attention': 'QUIZ' });
export const nounOf = (programId) => MARK_NOUN[programId] || 'NEWS';

const PAD = 3; // the plate's side padding
export const AI_W = measureText('AI') + 1; // double-struck: one pixel wider
const PLATE_W = PAD + AI_W + PAD;
const WORDS_STYLE = Object.freeze({ color: P.white, font: 'micro' });
const wordsOf = (noun) => `PRODUCED ${String(noun || 'NEWS').toUpperCase()}`;
const wordsW = (noun) => measureText(wordsOf(noun), 1, 'micro') + 8;

/** The mark's width when `open` (0..1) with the programme's noun (NEWS, FORECAST, SPORT, QUIZ). */
export function markWidth(open = 0, noun = 'NEWS') {
  return PLATE_W + Math.round(wordsW(noun) * clamp01(open));
}

/** The double-struck "AI" (5x7 caps drawn twice, one pixel apart) with its cap line at y. */
export function drawBoldAI(ctx, x, y, color = P.black) {
  drawText(ctx, 'AI', x, y, { color });
  drawText(ctx, 'AI', x + 1, y, { color });
}

/** A plate with its four corner pixels knocked off (the pill, in pixels). */
function pill(ctx, x, y, w, h, color) {
  rect(ctx, x + 1, y, w - 2, h, color);
  rect(ctx, x, y + 1, 1, h - 2, color);
  rect(ctx, x + w - 1, y + 1, 1, h - 2, color);
}

/** The channel's statement under the ident's wordmark (server/compliance/disclosure.js CHANNEL.ident, in our type). */
export const IDENT_LINE = 'AI-PRODUCED NEWS · ANIMATED PRESENTERS · SYNTHETIC VOICES';
const IDENT_REST = IDENT_LINE.replace(/^AI-/, '');
const IDENT_STYLE = Object.freeze({ color: P.silver, shadow: P.black });
/** Width of the ident's statement: the AI plate, then the words. */
export const IDENT_W = PLATE_W + 4 + measureText(IDENT_REST);

/** The ident's statement centred on cx, the plate's top at y: [AI] PRODUCED NEWS · ANIMATED PRESENTERS · … */
export function drawIdentLine(ctx, cx, y) {
  const x = Math.round(cx - IDENT_W / 2);
  pill(ctx, x, y, PLATE_W, TOP.h, P.yellow);
  drawBoldAI(ctx, x + PAD, y + 3, P.black);
  drawText(ctx, IDENT_REST, x + PLATE_W + 4, y + 3, IDENT_STYLE);
  return IDENT_W;
}

/**
 * The mark at (x, y), TOP.h tall: the yellow AI plate, and when open the black plate of words beside it, revealed
 * left to right in whole pixels. Returns its width.
 */
export function drawMark(ctx, x, y, open = 0, noun = 'NEWS') {
  const h = TOP.h;
  const ww = Math.round(wordsW(noun) * clamp01(open));
  if (ww > 0) {
    // the words' plate tucks under the AI plate's right edge, so the two read as one label
    ctx.save();
    try {
      ctx.beginPath();
      ctx.rect(Math.round(x + PLATE_W - 1), Math.round(y), ww + 1, h);
      ctx.clip();
      const full = wordsW(noun);
      rect(ctx, x + PLATE_W - 1, y, full + 1, h, P.black);
      rect(ctx, x + PLATE_W - 1 + full, y + 1, 1, h - 2, P.black);
      drawText(ctx, wordsOf(noun), x + PLATE_W + 3, y + 4, WORDS_STYLE);
    } finally {
      ctx.restore();
    }
  }
  pill(ctx, x, y, PLATE_W, h, P.yellow);
  drawBoldAI(ctx, x + PAD, y + 3, P.black);
  return PLATE_W + ww;
}
