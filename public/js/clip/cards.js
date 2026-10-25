// A clip's own cards (docs/publishing/vertical.md §5): the hook title laid over its first frames and the end card
// after its last, in both formats, drawn with the channel's own pieces (the bug, the 5x7 face, the logo, the
// programme's accent) on the 1x grid. The publishing desk renders them through public/lab/clip.html and composites
// them over the master recording before the 5x scale (tools/publish/factory.mjs, server/publish/render.js), so they are exactly as crisp as the
// picture under them.
//
//   drawHook(ctx, { format, lines, programme, accent, profile })   transparent everywhere but the title's own pixels
//   drawEndCard(ctx, t, { format, programme, accent, stream, backdrop, cta })   t: seconds since the card's first frame;
//                                                                it carries the channel ident's AI notice (graphics/disclosure.js)
//   endCardText({ format, programme, stream, cta })   the words it shows, in order (cta: an END_CTAS name)
//   END_CARD_SECONDS, END_CARD_NOTICE
import { P } from '../palette.js';
import { drawText, measureText } from '../font.js';
import { drawLogo, measureLogo } from '../logo.js';
import { seg, easeOutQuint } from '../gfx/index.js';
import { VW, VH, HW, HH, V, SAFE, MAST, TITLE_BOX } from './layout.js';
import { drawBugOnly, drawProgrammeTag } from './graphics.js';
import { groundOf } from './vertical.js';
import { noticeParts, IDENT_ROWS, IDENT_STYLES, NOTICE_DRAWS } from '../graphics/disclosure.js';
import { watchLine } from '../airmode.js';

export const END_CARD_SECONDS = 2.6;
/** The end card's disclosure, as it reads (the ident's words: graphics/disclosure.js): checked by the publishing gate. */
export const END_CARD_NOTICE = Object.freeze(noticeParts('NEWS'));
const S = {
  white: { color: P.white },
  white2: { color: P.white, scale: 2 },
  silver: { color: P.silver },
  fog: { color: P.fog },
};
const DARK_INK = new Set([P.yellow, P.cyan, P.green, P.cream, P.white, P.silver, P.orange, P.pink]);

/** The size of a format's picture at 1x. */
export const sizeOf = (format) => (format === 'vertical' ? { w: VW, h: VH } : { w: HW, h: HH });

/**
 * The hook title. Vertical: the mast (the bug, the programme's tag) and the title band (y 32-71) in the master's own
 * design, the two lines at 2x beside an accent bar, held for the whole clip. Horizontal: a plate under the top row,
 * the same two lines, for the clip's first seconds.
 */
export function drawHook(ctx, { format = 'vertical', lines = [], programme = '', accent = P.red, t = 9, profile = 'normal' } = {}) {
  const ls = (lines || []).slice(0, 3).map((l) => String(l).toUpperCase());
  // two short lines at 2x; a whole headline too long for that in the body face, up to three lines (moments.js)
  const big = ls.length <= 2 && ls.every((l) => measureText(l, 2) <= (format === 'vertical' ? TITLE_BOX.w - 16 : 300));
  const sc = big ? 2 : 1;
  const pitch = big ? 18 : 10;
  const lineH = 7 * sc;
  if (format === 'vertical' && profile === 'tall') {
    // the quiz's tall stage owns the title band (its boards say the question): the hook takes the mast, the bug at its
    // left and one line at 2x at its right on a black plate, in place of the programme's tag (the plate covers the
    // master's tag); everywhere else the card is clear, so the set shows round it
    const bw = drawBugOnly(ctx, t, 0, MAST.left, 10);
    const line = ls.join(' ');
    // 2x when it fits beside the bug, else the body face (never over the bug); at 2x the type's image runs 2 px past
    // its measure, so its right edge stands 2 px in from the mast's
    const big = measureText(line, 2) <= MAST.right - 2 - 6 - (MAST.left + bw + 4);
    const w = measureText(line, big ? 2 : 1);
    const right = MAST.right - (big ? 2 : 0);
    // on a black plate that covers the master's programme tag (the set shows round it)
    const tagW = programme ? measureText(programme) + 8 : 0;
    const x0 = Math.max(MAST.left + bw + 2, Math.min(right - w - 9, MAST.right - tagW - 1));
    ctx.fillStyle = P.black;
    ctx.fillRect(x0, 6, MAST.right + 3 - x0, 21);
    ctx.fillStyle = accent === P.purple ? P.fog : accent;
    ctx.fillRect(right - w - 6, big ? 9 : 10, 2, big ? 14 : 13);
    drawText(ctx, line, right - w, big ? 9 : 13, big ? S.white2 : S.white);
    return;
  }
  if (format === 'vertical') {
    // the mast as the master draws it (the bug, the programme's tag), and the hook on the title band's plate (centred
    // on the frame, the accent bar down its left edge, the lines centred on it: TITLE_BOX, which also covers the vertical
    // live's story line in a master made on air); the rest of the card is clear: the programme's set shows round it
    drawBugOnly(ctx, t, 0, MAST.left, 10);
    if (programme) {
      const w = measureText(programme) + 8;
      drawProgrammeTag(ctx, MAST.right - w, 10, programme, accent);
    }
    const n = ls.length;
    const h = n * pitch - (pitch - lineH);
    const B = TITLE_BOX;
    const y = B.y + Math.round((B.h - h) / 2);
    ctx.fillStyle = P.black;
    ctx.fillRect(B.x, B.y, B.w, B.h);
    ctx.fillStyle = accent === P.purple ? P.fog : accent;
    ctx.fillRect(B.x, B.y, 2, B.h);
    const cx = B.x + 1 + (B.w >> 1);
    ls.forEach((l, i) => drawText(ctx, l, Math.round(cx - measureText(l, sc) / 2), y + i * pitch, big ? S.white2 : S.white));
    return;
  }
  if (profile === 'tall') {
    // horizontal, a programme whose boards own the top of the frame (PAY ATTENTION): one line at 2x on a plate at the
    // top row's right end, where a clip has no clock and no LIVE tag, clear of the bug and the tag
    const line = ls.join(' ');
    const w = measureText(line, 2);
    const x = HW - 13 - w - 10;
    ctx.fillStyle = P.black;
    ctx.fillRect(x, 5, w + 10, 20);
    ctx.fillStyle = accent === P.purple ? P.fog : accent;
    ctx.fillRect(x, 5, 2, 20);
    drawText(ctx, line, x + 7, 8, S.white2);
    return;
  }
  // horizontal: under the bug's row (y 26), left at the strap's edge
  const w = Math.max(0, ...ls.map((l) => measureText(l, sc))) + 20;
  const n = ls.length;
  const h = n * pitch - (pitch - lineH) + 12;
  const x = 13;
  const y = 26;
  ctx.fillStyle = P.black;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = accent === P.purple ? P.fog : accent;
  ctx.fillRect(x, y, 2, h);
  ls.forEach((l, i) => drawText(ctx, l, x + 10, y + 6 + i * pitch, big ? S.white2 : S.white));
}

/** Text rising into place (p 0..1) inside its own rows. */
function rise(ctx, text, x, y, p, style, align = 'left') {
  if (p <= 0) return;
  const scale = style.scale || 1;
  const hh = (style.font === 'micro' ? 5 : 7) * scale;
  const off = Math.round((1 - easeOutQuint(p)) * (hh + 3));
  ctx.save();
  try {
    ctx.beginPath();
    ctx.rect(0, y - 3 * scale, 4000, hh + 3 * scale + 1);
    ctx.clip();
    drawText(ctx, text, x, y + off, { ...style, align });
  } finally {
    ctx.restore();
  }
}

/**
 * An end card's invitation, by name (docs/publishing/shorts-v2.md A5): a series asks for the next one at the moment the
 * viewer has just played one (PAY ATTENTION: FOLLOW FOR THE NEXT QUESTION). `lead` in the small face over `big`, as
 * FROM stands over the programme's plate. A feed's own button says FOLLOW or SUBSCRIBE: one card goes to every feed.
 */
export const END_CTAS = Object.freeze({ 'next-question': Object.freeze({ lead: 'FOLLOW FOR THE', big: 'NEXT QUESTION' }) });

/**
 * The words an end card shows, in order: { slogan, from, watch, cta, rows }. `stream` (airmode.js streamOf): 'live'
 * says WATCH LIVE, 'recorded' that the channel airs 24 hours a day, 'none' (no stream, the manual beta) says nothing
 * about where to watch: `watch` is null. `cta`: an END_CTAS name, or none.
 */
export function endCardText({ format = 'vertical', programme = '', stream = 'none', cta = null } = {}) {
  const vertical = format === 'vertical';
  return {
    slogan: 'THE WORLD, PIXEL BY PIXEL',
    from: programme ? `FROM ${String(programme).toUpperCase()}` : null,
    watch: watchLine(stream, { vertical }),
    cta: END_CTAS[cta] || null,
    rows: vertical ? noticeParts('NEWS') : [...IDENT_ROWS],
  };
}

/**
 * The end card: the channel's logo landing and glinting, the slogan, the programme it came from, where to watch (only
 * when there is a stream: endCardText), and the AI notice in the channel ident's design (AI-PRODUCED NEWS in white,
 * then PRESENTERS ARE AI CHARACTERS · FACTS FROM CREDITED SOURCES in silver, the body face with its shadow:
 * graphics/disclosure.js). Vertical (round 10): on the programme's own set behind tinted glass (`backdrop`:
 * clip/vset.js, the set the clip stood in), framed by its accent rules, the programme on its accent plate at 2x, where
 * to watch at 2x when it fits, the notice in three rows at the foot of the safe area. No URL is drawn (the post carries
 * the links), so a card never goes stale.
 */
export function drawEndCard(ctx, t, { format = 'vertical', programme = '', accent = P.red, stream = 'none', backdrop = null, cta = null } = {}) {
  const text = endCardText({ format, programme, stream, cta });
  const { w, h } = sizeOf(format);
  const vertical = format === 'vertical';
  if (vertical && backdrop?.glass) ctx.drawImage(backdrop.glass, 0, 0);
  else ctx.drawImage(groundOf(w, h, { cy: h * 0.42 }), 0, 0);
  // vertical: centred on the safe column (the feed's buttons cover the right edge)
  const cx = vertical ? SAFE.cx : Math.round(w / 2);
  const acc = accent === P.purple ? P.fog : accent;
  if (vertical) {
    // the programme's accent rules opening from the column's middle, over the mast and over the feeds' band
    const half = Math.round((VW / 2 + Math.abs(VW / 2 - cx)) * easeOutQuint(seg(t, 0, 0.5)));
    const x0 = Math.max(0, cx - half);
    const x1 = Math.min(VW, cx + half);
    ctx.fillStyle = acc;
    if (x1 > x0) {
      ctx.fillRect(x0, 30, x1 - x0, 2);
      ctx.fillRect(x0, 304, x1 - x0, 2);
    }
  }
  // the logo: horizontal, the full lock-up at 3x; vertical (216 wide: the lock-up at 2x is 250), the emblem at 4x over
  // the wordmark's plate at 2x (the bug without its own small globe: one globe on the card)
  // (with an invitation the emblem stands at 3x: its rows hold the invitation inside the marquee, over the notice)
  const mark = vertical && text.cta ? 3 : 4;
  const parts = vertical
    ? [{ variant: 'mark', scale: mark, y: 46 }, { variant: 'wordmark', scale: 2, y: 46 + 27 * mark + 10 }]
    : [{ variant: 'full', scale: 3, y: 34 }];
  const p = easeOutQuint(seg(t, 0.05, 0.45));
  let bottom = 0;
  for (const part of parts) {
    const L = measureLogo({ variant: part.variant, scale: part.scale });
    bottom = part.y + L.h;
    if (p <= 0) continue;
    ctx.save();
    try {
      ctx.beginPath();
      ctx.rect(0, part.y - 2, w, L.h + 4);
      ctx.clip();
      drawLogo(ctx, cx - (L.w >> 1), part.y + Math.round((1 - p) * (L.h + 4)), { variant: part.variant, scale: part.scale, t: t >= 0.6 ? 6 + (t - 0.6) : null });
    } finally {
      ctx.restore();
    }
  }
  let y = bottom + (vertical ? 6 : 10);
  // (a vertical card with an invitation gives it the slogan's row too: the emblem, the wordmark and the programme say
  // whose it is, and the marquee holds the invitation clear of its frame only so)
  const slogan = !(vertical && text.cta);
  if (slogan) rise(ctx, text.slogan, cx, y, seg(t, 0.45, 0.35), S.silver, 'center');
  if (!vertical) {
    y += 18;
    const rw = Math.round(40 * easeOutQuint(seg(t, 0.65, 0.3)));
    if (rw > 0) {
      ctx.fillStyle = accent;
      ctx.fillRect(cx - (rw >> 1), y, rw, 2);
    }
    y += 10;
    if (text.from) {
      rise(ctx, text.from, cx, y, seg(t, 0.8, 0.35), S.white, 'center');
      y += 14;
    }
    // where to watch, only when the channel streams (airmode.js watchLine: WATCH LIVE for a live stream alone)
    if (text.watch) {
      rise(ctx, text.watch, cx, y, seg(t, 0.95, 0.35), S.fog, 'center');
      y += 14;
    }
    if (text.cta) rise(ctx, `${text.cta.lead} ${text.cta.big}`, cx, y, seg(t, 1.0, 0.35), S.white, 'center');
    // the AI notice, in the ident's type, at the frame's foot: the ident's two rows
    text.rows.forEach((row, i) => rise(ctx, row, cx, h - 30 + 11 * i, seg(t, 1.1 + 0.1 * i, 0.3), IDENT_STYLES[i === 0 ? 0 : 1], 'center'));
    if (seg(t, 1.1, 0.3) > 0) NOTICE_DRAWS.n++;
    return;
  }
  // FROM, the programme on its accent plate at 2x (as its tag beside the bug, made large)
  if (slogan) y += 13;
  if (programme) {
    const name = String(programme).toUpperCase();
    rise(ctx, 'FROM', cx, y, seg(t, 0.7, 0.3), S.fog, 'center');
    y += 10;
    const big = measureText(name, 2) <= SAFE.w - 12;
    const tw = measureText(name, big ? 2 : 1);
    const pw = tw + 12;
    const ph = big ? 22 : 13;
    const pp = easeOutQuint(seg(t, 0.8, 0.3));
    const vis = Math.round(pw * pp);
    if (vis > 0) {
      ctx.save();
      try {
        ctx.beginPath();
        ctx.rect(cx - (pw >> 1), y, vis, ph);
        ctx.clip();
        if (accent === P.purple) {
          ctx.fillStyle = P.fog;
          ctx.fillRect(cx - (pw >> 1), y, pw, ph);
          ctx.fillStyle = P.purple;
          ctx.fillRect(cx - (pw >> 1) + 1, y + 1, pw - 2, ph - 2);
        } else {
          ctx.fillStyle = accent;
          ctx.fillRect(cx - (pw >> 1), y, pw, ph);
        }
        drawText(ctx, name, cx - (pw >> 1) + 6, y + 4, { color: inkOn(accent), scale: big ? 2 : 1 });
      } finally {
        ctx.restore();
      }
    }
    y += ph + 5;
  }
  // the invitation under the programme, as FROM over its plate: FOLLOW FOR THE in the small face, NEXT QUESTION at 2x,
  // inside the marquee (the emblem at 3x made the room); where to watch then stands under the stage
  if (text.cta) {
    rise(ctx, text.cta.lead, cx, y, seg(t, 1.0, 0.3), S.fog, 'center');
    const big = measureText(text.cta.big, 2) <= SAFE.w - 12;
    rise(ctx, text.cta.big, cx, y + 10, seg(t, 1.05, 0.35), big ? S.white2 : S.white, 'center');
    // (what follows, under the stage: clear of the marquee's frame)
    y = Math.max(y + 10 + (big ? 14 : 7) + 4, V.stage.y + V.stage.h + 2);
  }
  // where to watch, only when the channel streams (NEWS 24/7 at 2x; with WATCH LIVE, too wide for 2x, the body face)
  if (text.watch) {
    const big = measureText(text.watch, 2) <= SAFE.w - 12;
    rise(ctx, text.watch, cx, y, seg(t, 0.95, 0.35), big ? S.white2 : S.white, 'center');
    y += big ? 20 : 12;
  } else if (!text.cta) y += 8;
  // the AI notice in the ident's type, three rows at the foot of the safe area (never under the feeds' band)
  const rows = text.rows;
  const dy = Math.min(V.caps.y + V.caps.h - 1 - rows.length * 11 + 3, y);
  rows.forEach((row, i) => rise(ctx, row, cx, dy + 11 * i, seg(t, 1.1 + 0.1 * i, 0.3), IDENT_STYLES[i === 0 ? 0 : 1], 'center'));
  if (seg(t, 1.1, 0.3) > 0) NOTICE_DRAWS.n++;
}

export const inkOn = (c) => (DARK_INK.has(c) ? P.black : P.white);
