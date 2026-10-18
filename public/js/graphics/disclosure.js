// The channel's AI disclosure on screen (docs/publishing/compliance.md §3; AI Act Art. 50(4)-(5): clearly and
// distinguishably, at the latest at the first exposure; the EU Code of Practice on transparency of AI-generated
// content: at the start, at regular intervals and after every interruption for live and long video).
//
// Owner, 18 Oct: "Quita la etiqueta IA, queda bastante mal". The yellow AI plate docked to the bug is gone: the logo
// stands clean. The same words now come at the moments a viewer first meets the channel, in its own type:
//
//   THE NOTICE      AI-PRODUCED NEWS · PRESENTERS ARE AI CHARACTERS · FACTS FROM CREDITED SOURCES
//                   one line in the top row's micro face on its black plate, tucked under the bug like a programme
//                   credit: white for what the channel is, silver for the rest, the programme's accent between them.
//                   It wipes in under the programme's name as a programme starts (the first exposure), again every
//                   time the graphics come back from a break (after an interruption), and every ten minutes in between
//                   (regular intervals), for a few seconds each time. (FORECAST, SPORT, QUIZ by programme.)
//   THE IDENT       the break ident's statement under the wordmark: AI-PRODUCED NEWS, then the rest of the notice
//                   (scenes/opens/ident.js; every break and between programmes)
//   A CLIP          its first seconds carry the notice too (a clip cut from mid-programme never shows the opening):
//                   under the bug in a horizontal clip, as a super over the stage's foot in a vertical one, drawn by
//                   the publishing desk's card page (clip/cards.js drawClipNotice) and composited over the clip's first
//                   NOTICE_TIMING.clip seconds; its end card says it again
//
// Never over a re-staged guest: the RECREATION label (graphics/recreation.js) keeps its place, its yellow plate and
// its double-struck AI, in every frame, untouched (the deep-fake case, Art. 50(4) first subparagraph).
//
// Frames: a clip cut to 9:16 or 1:1 is recorded with ?frame=9x16 (or 9x16@<x>, 1x1, 4x5): the graphics that carry a
// disclosure (the notice, the recreation's label and name, the captions) are laid out inside that window, so the crop
// keeps them whole and legible; the clock and the ticker stay out of a clip.
//
//   FRAME                          the active window { active, aspect, x, w, cx }
//   setFrame(spec) / frameFromSearch(search)
//   nounOf(programId)              NEWS, FORECAST, SPORT or QUIZ
//   noticeParts(noun)              ['AI-PRODUCED NEWS', 'PRESENTERS ARE AI CHARACTERS', 'FACTS FROM CREDITED SOURCES']
//   NOTICE_LINE                    the parts joined by " · " (the server's CHANNEL.notice says the same)
//   NOTICE_TIMING                  when it shows on air and how long it holds in a clip
//   noticeLayout(frame, noun)      where the on-air notice goes: { x, y, w, h, rows, font, cap }
//   drawNotice(ctx, layout, p, accent)          p: 0..1, how much of it is wiped in
//   drawNoticeText(ctx, cx, y, { noun, accent }) its words on one row, no plate (the horizontal end card)
//   clipNoticeLayout(format, opts) / drawClipNotice(ctx, format, opts)   a clip's first-seconds notice
//   IDENT_LINE, IDENT_W, drawIdentLine(ctx, cx, y)                       the ident's statement
//   drawBoldAI(ctx, x, y, color), AI_W     the double-struck AI of the RECREATION label (unchanged)
import { P } from '../palette.js';
import { drawText, measureText } from '../font.js';
import { W, TOP, rect, clamp01 } from './layout.js';
import { V, SAFE, VW, VH } from '../clip/layout.js';

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

// ------------------------------------------------------------------------------------------------ the words

/** The programme's noun (the server's disclosure.js programmeWording says the same). */
export const NOTICE_NOUN = Object.freeze({ 'world-weather': 'FORECAST', 'full-time': 'SPORT', 'pay-attention': 'QUIZ' });
export const nounOf = (programId) => NOTICE_NOUN[programId] || 'NEWS';

/** The notice's three parts: what the channel is, who presents it, where the facts come from. */
export function noticeParts(noun = 'NEWS') {
  return [`AI-PRODUCED ${String(noun || 'NEWS').toUpperCase()}`, 'PRESENTERS ARE AI CHARACTERS', 'FACTS FROM CREDITED SOURCES'];
}
export const NOTICE_SEP = ' · ';
export const NOTICE_LINE = noticeParts('NEWS').join(NOTICE_SEP);

/**
 * When the notice shows. On air: `delay` s after the graphics come on (a programme's start, every return from a break)
 * it wipes in and holds `hold` s; then every `every` s (from its last showing) for `again` s. It stands only on a
 * presenter's shot, where the space under the top row is the set's (the studio's wide and close, the weather centre):
 * never over a re-staged guest, a picture and its credit, a board's title, the headline frame or a correspondent's
 * plates; when it falls due on one of those it waits for the next presenter's shot. Cut short (a guest, a card)
 * before `least` s, it comes back in full at the next one. In a clip: the first `clip` s.
 */
export const NOTICE_TIMING = Object.freeze({ delay: 0.7, hold: 7, every: 600, again: 6, least: 4, wipeIn: 0.3, wipeOut: 0.25, clip: 4 });
/** The shots the on-air notice may stand on (graphics/index.js). */
export const NOTICE_SHOTS = Object.freeze(new Set(['wide', 'close', 'weather']));

// ------------------------------------------------------------------------------------------------ the notice on air

const PLATE_H = 9; // a micro-face plate: 2 px, the 5 px capitals, 2 px (the top row's LIVE and LONDON)
const PAD = 4;
const MICRO = 'micro';
const HEAD_STYLE = Object.freeze({ color: P.white, font: MICRO });
const REST_STYLE = Object.freeze({ color: P.silver, font: MICRO });
const sepStyles = new Map();
const sepStyle = (accent) => {
  let s = sepStyles.get(accent);
  if (!s) sepStyles.set(accent, (s = Object.freeze({ color: accent === P.purple ? P.fog : accent, font: MICRO })));
  return s;
};

/**
 * Where the on-air notice goes: under the top row (1 px below the bug), its left edge on the bug's. The full frame
 * takes it on one line; a clip's narrow window stacks the three parts, each whole.
 * -> { x, y, w, h, rows: [[part, ...]], font: 'micro', cap: 5 }
 */
const layouts = new Map();
export function noticeLayout(frame = FRAME, noun = 'NEWS') {
  // (cached: drawn every frame while it shows)
  const key = `${frame?.active ? `${frame.x}|${frame.w}` : 'full'}|${noun}`;
  const hit = layouts.get(key);
  if (hit) return hit;
  const L = layoutOf(frame, noun);
  if (layouts.size < 64) layouts.set(key, Object.freeze(L));
  return L;
}
function layoutOf(frame, noun) {
  const parts = noticeParts(noun);
  const x = frame?.active ? frame.x + 4 : TOP.x;
  const room = frame?.active ? frame.w - 8 : W - 2 * TOP.x;
  const one = measureText(parts.join(NOTICE_SEP), 1, MICRO) + 2 * PAD;
  const rows = one <= room ? [parts] : parts.map((p) => [p]);
  const w = Math.max(...rows.map((r) => measureText(r.join(NOTICE_SEP), 1, MICRO))) + 2 * PAD;
  const h = rows.length * (PLATE_H - 2) + 2;
  return { x, y: TOP.y + TOP.h + 1, w, h, rows, font: MICRO, cap: 5 };
}

/** One row of parts from x on the cap line y: the first part white, the others silver, the accent's dot between. */
function drawParts(ctx, parts, x, y, accent, first) {
  let cx = x;
  parts.forEach((part, i) => {
    if (i > 0) {
      drawText(ctx, NOTICE_SEP, cx, y, sepStyle(accent));
      cx += measureText(NOTICE_SEP, 1, MICRO);
    }
    drawText(ctx, part, cx, y, first && i === 0 ? HEAD_STYLE : REST_STYLE);
    cx += measureText(part, 1, MICRO);
  });
}

/** The notice's words on one row without a plate (a card's ground is calm), centred on cx: returns their width. */
export function drawNoticeText(ctx, cx, y, { noun = 'NEWS', accent = P.red } = {}) {
  const parts = noticeParts(noun);
  const w = measureText(parts.join(NOTICE_SEP), 1, MICRO);
  drawParts(ctx, parts, Math.round(cx - w / 2), y, accent, true);
  return w;
}

/** The notice, `p` (0..1) of it wiped in from the left in whole pixels. Returns its width. */
export function drawNotice(ctx, L, p = 1, accent = P.red) {
  const vis = Math.round(L.w * clamp01(p));
  if (vis <= 0) return 0;
  ctx.save();
  try {
    ctx.beginPath();
    ctx.rect(Math.round(L.x), Math.round(L.y), vis, L.h);
    ctx.clip();
    rect(ctx, L.x, L.y, L.w, L.h, P.black);
    L.rows.forEach((row, i) => drawParts(ctx, row, L.x + PAD, L.y + 2 + i * (PLATE_H - 2), accent, i === 0));
  } finally {
    ctx.restore();
  }
  return L.w;
}

// ------------------------------------------------------------------------------------------------ a clip's notice

const BODY_PITCH = 10; // body face: 7 px capitals, 3 px between rows
/**
 * A clip's first-seconds notice. Horizontal: the on-air notice under the bug (where a clip has no LIVE tag and no
 * clock: the hook plate starts under it, clip/cards.js), or, when the quiz's one-line hook holds the top row's right
 * end, 5 px lower. Vertical: a super over the stage's foot, inside the platforms' safe column (the feeds cover the top
 * strip, the right edge and the foot), in the body face (35 px capitals on 1920: legible at the published size),
 * the accent's bar at its left like the channel's name supers.
 * -> { x, y, w, h, rows, font, cap }
 */
export function clipNoticeLayout(format = 'vertical', { noun = 'NEWS', profile = 'normal' } = {}) {
  if (format !== 'vertical') {
    const L = noticeLayout({ active: false }, noun);
    return profile === 'tall' ? { ...L, y: L.y + 5 } : L;
  }
  const rows = noticeParts(noun).map((p) => [p]);
  const w = 2 + Math.max(...rows.map((r) => measureText(r[0]))) + 2 * PAD + 1;
  const h = rows.length * BODY_PITCH + 3;
  return { x: SAFE.x, y: V.stage.y + V.stage.h - h - 6, w, h, rows, font: 'body', cap: 7 };
}

/** Draw a clip's notice (transparent everywhere else: the card page composites it over the clip's first seconds). */
export function drawClipNotice(ctx, format = 'vertical', { noun = 'NEWS', profile = 'normal', accent = P.red, p = 1 } = {}) {
  const L = clipNoticeLayout(format, { noun, profile });
  if (format !== 'vertical') return drawNotice(ctx, L, p, accent);
  const vis = Math.round(L.w * clamp01(p));
  if (vis <= 0) return 0;
  ctx.save();
  try {
    ctx.beginPath();
    ctx.rect(L.x, L.y, vis, L.h);
    ctx.clip();
    rect(ctx, L.x, L.y, 2, L.h, accent === P.purple ? P.fog : accent);
    rect(ctx, L.x + 2, L.y, L.w - 2, L.h, P.ink);
    L.rows.forEach((row, i) => drawText(ctx, row[0], L.x + 2 + PAD, L.y + 2 + i * BODY_PITCH, { color: i === 0 ? P.white : P.silver }));
  } finally {
    ctx.restore();
  }
  return L.w;
}

/** Is a box { x0, y0, x1, y1 } clear of the vertical feeds' covered areas (the safe column, x 8-188, y 32-300)? */
export const inVerticalSafe = (b) => b.x0 >= SAFE.x && b.x1 <= SAFE.right && b.y0 >= 32 && b.y1 <= 300 && b.x0 >= 0 && b.y1 <= VH && b.x1 <= VW;

// ------------------------------------------------------------------------------------------------ the ident

/** The channel's statement under the ident's wordmark (server/compliance/disclosure.js CHANNEL.ident). */
export const IDENT_LINE = NOTICE_LINE;
const IDENT_HEAD = noticeParts('NEWS')[0];
const IDENT_REST = noticeParts('NEWS').slice(1).join(NOTICE_SEP);
const IDENT_HEAD_STYLE = Object.freeze({ color: P.white, shadow: P.black });
const IDENT_REST_STYLE = Object.freeze({ color: P.silver, shadow: P.black });
/** Width of the ident's statement (its longer row). */
export const IDENT_W = Math.max(measureText(IDENT_HEAD), measureText(IDENT_REST));
export const IDENT_H = 7 + 4 + 7;

/** The ident's statement centred on cx, from y: AI-PRODUCED NEWS, and under it the rest of the notice. */
export function drawIdentLine(ctx, cx, y) {
  drawText(ctx, IDENT_HEAD, Math.round(cx - measureText(IDENT_HEAD) / 2), y, IDENT_HEAD_STYLE);
  drawText(ctx, IDENT_REST, Math.round(cx - measureText(IDENT_REST) / 2), y + 11, IDENT_REST_STYLE);
  return IDENT_W;
}

// ------------------------------------------------------------------------------------------------ the RECREATION label's AI

export const AI_W = measureText('AI') + 1; // double-struck: one pixel wider

/** The double-struck "AI" (5x7 caps drawn twice, one pixel apart) with its cap line at y (the RECREATION label's). */
export function drawBoldAI(ctx, x, y, color = P.black) {
  drawText(ctx, 'AI', x, y, { color });
  drawText(ctx, 'AI', x + 1, y, { color });
}
