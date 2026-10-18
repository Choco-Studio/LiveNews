// A clip's own cards (docs/publishing/vertical.md §5): the hook title laid over its first frames and the end card
// after its last, in both formats, drawn with the channel's own pieces (the bug, the 5x7 face, the logo, the
// programme's accent) on the 1x grid. The publishing desk renders them through public/lab/clip.html and composites
// them over the master recording before the 5x scale (tools/publish/factory.mjs, server/publish/render.js), so they are exactly as crisp as the
// picture under them.
//
//   drawHook(ctx, { format, lines, programme, accent, profile })   transparent everywhere but the title's own pixels
//   drawNoticeCard(ctx, { format, noun, accent, profile })     the AI notice for the clip's first seconds, alone on a
//                                                              transparent card (graphics/disclosure.js drawClipNotice)
//   drawEndCard(ctx, t, { format, programme, accent, live, noun })   t: seconds since the card's first frame
//   END_CARD_SECONDS, END_CARD_NOTICE
import { P } from '../palette.js';
import { drawText, measureText } from '../font.js';
import { drawLogo, measureLogo } from '../logo.js';
import { seg, easeOutQuint } from '../gfx/index.js';
import { VW, VH, HW, HH, V, SAFE } from './layout.js';
import { drawBugOnly, drawProgrammeTag } from './graphics.js';
import { groundOf } from './vertical.js';
import { noticeParts, drawClipNotice, drawNoticeText, NOTICE_TIMING } from '../graphics/disclosure.js';

export const END_CARD_SECONDS = 2.6;
/** The end card's disclosure, as it reads (graphics/disclosure.js noticeParts): checked by the publishing gate. */
export const END_CARD_NOTICE = Object.freeze(noticeParts('NEWS'));
/** How long a clip's first-seconds notice holds (the card page draws it; the factory composites it). */
export const NOTICE_SECONDS = NOTICE_TIMING.clip;
const S = {
  white: { color: P.white },
  white2: { color: P.white, scale: 2 },
  silver: { color: P.silver },
  fog: { color: P.fog },
  microFog: { color: P.fog, font: 'micro' },
  microSilver: { color: P.silver, font: 'micro' },
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
  const big = ls.length <= 2 && ls.every((l) => measureText(l, 2) <= (format === 'vertical' ? SAFE.right - 15 : 300));
  const sc = big ? 2 : 1;
  const pitch = big ? 18 : 10;
  const lineH = 7 * sc;
  if (format === 'vertical' && profile === 'tall') {
    // the quiz's tall stage owns the title band (its boards say the question): the hook takes the mast, the bug at its
    // left and one line at 2x at its right, in place of the programme's tag
    ctx.fillStyle = P.black;
    ctx.fillRect(0, 0, VW, V.title.y);
    const bw = drawBugOnly(ctx, t, 0, 8, 10);
    const line = ls.join(' ');
    // 2x when it fits beside the bug, else the body face (never over the bug); at 2x the type's image runs 2 px past
    // its measure, so its right edge stands 2 px in from the safe column's
    const big = measureText(line, 2) <= SAFE.right - 2 - 6 - (8 + bw + 4);
    const w = measureText(line, big ? 2 : 1);
    const right = SAFE.right - (big ? 2 : 0);
    ctx.fillStyle = accent === P.purple ? P.fog : accent;
    ctx.fillRect(right - w - 6, big ? 9 : 10, 2, big ? 14 : 13);
    drawText(ctx, line, right - w, big ? 9 : 13, big ? S.white2 : S.white);
    return;
  }
  if (format === 'vertical') {
    ctx.fillStyle = P.black;
    ctx.fillRect(0, 0, VW, V.stage.y);
    drawBugOnly(ctx, t, 0, 8, 10);
    if (programme) {
      const w = measureText(programme) + 8;
      drawProgrammeTag(ctx, SAFE.right - w, 10, programme, accent);
    }
    const n = ls.length;
    const h = n * pitch - (pitch - lineH);
    const y = V.title.y + Math.round((V.title.h - h) / 2);
    ctx.fillStyle = accent === P.purple ? P.fog : accent;
    ctx.fillRect(8, y, 2, h);
    ls.forEach((l, i) => drawText(ctx, l, 15, y + i * pitch, big ? S.white2 : S.white));
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
  // horizontal: under the bug's row and the AI notice under it (y 22-30, drawNoticeCard: both hold the clip's first
  // four seconds), left at the bug's edge
  const w = Math.max(0, ...ls.map((l) => measureText(l, sc))) + 20;
  const n = ls.length;
  const h = n * pitch - (pitch - lineH) + 12;
  const x = 13;
  const y = 33;
  ctx.fillStyle = P.black;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = accent === P.purple ? P.fog : accent;
  ctx.fillRect(x, y, 2, h);
  ls.forEach((l, i) => drawText(ctx, l, x + 10, y + 6 + i * pitch, big ? S.white2 : S.white));
}

/**
 * The AI notice of a clip's first seconds, alone on a transparent card (the factory composites it over the clip's first
 * NOTICE_SECONDS, then wipes it out): under the bug in a horizontal clip, a super over the stage's foot in a vertical
 * one. A clip cut from mid-programme never shows the programme's opening, so it says it here, from its first frame.
 */
export function drawNoticeCard(ctx, { format = 'vertical', noun = 'NEWS', accent = P.red, profile = 'normal' } = {}) {
  return drawClipNotice(ctx, format, { noun, accent, profile });
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
 * The end card: the channel's logo landing and glinting on its ground, the slogan, the programme it came from in its
 * accent, where to watch, and the AI notice (AI-PRODUCED NEWS, PRESENTERS ARE AI CHARACTERS, FACTS FROM CREDITED
 * SOURCES: graphics/disclosure.js). No URL is drawn (the post carries the links), so a card never goes stale.
 */
export function drawEndCard(ctx, t, { format = 'vertical', programme = '', accent = P.red, live = true, noun = 'NEWS' } = {}) {
  const { w, h } = sizeOf(format);
  ctx.drawImage(groundOf(w, h, { cy: h * 0.42 }), 0, 0);
  const vertical = format === 'vertical';
  // vertical: centred on the safe column (the feed's buttons cover the right edge)
  const cx = vertical ? SAFE.cx : Math.round(w / 2);
  // the logo: horizontal, the full lock-up at 3x; vertical (216 wide: the lock-up at 2x is 250), the emblem at 4x over
  // the channel's bug at 2x
  const parts = vertical
    ? [{ variant: 'mark', scale: 4, y: 46 }, { variant: 'bug', scale: 2, y: 46 + 27 * 4 + 10 }]
    : [{ variant: 'full', scale: 3, y: 44 }];
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
  const L = { h: bottom - parts[0].y };
  const ly = parts[0].y;
  let y = ly + L.h + (vertical ? 12 : 10);
  rise(ctx, 'THE WORLD, PIXEL BY PIXEL', cx, y, seg(t, 0.45, 0.35), S.silver, 'center');
  y += vertical ? 22 : 18;
  const rw = Math.round(40 * easeOutQuint(seg(t, 0.65, 0.3)));
  if (rw > 0) {
    ctx.fillStyle = accent;
    ctx.fillRect(cx - (rw >> 1), y, rw, 2);
  }
  y += vertical ? 12 : 10;
  if (programme) {
    rise(ctx, `FROM ${String(programme).toUpperCase()}`, cx, y, seg(t, 0.8, 0.35), S.white, 'center');
    y += 14;
  }
  rise(ctx, live ? (vertical ? 'NEWS 24/7 · WATCH LIVE' : 'NEWS 24 HOURS A DAY · WATCH LIVE') : vertical ? 'NEWS 24/7' : 'NEWS 24 HOURS A DAY', cx, y, seg(t, 0.95, 0.35), S.fog, 'center');
  // the AI notice, at the foot of the safe area (vertical: three rows in the body face, 35 px capitals on 1920) or of
  // the frame (horizontal: the on-air notice's one row, micro face, 25 px capitals on 1080)
  if (vertical) {
    const [head, ...rest] = noticeParts(noun);
    const dy = Math.max(270, y + 20);
    rise(ctx, head, cx, dy, seg(t, 1.1, 0.3), S.white, 'center');
    rise(ctx, rest[0], cx, dy + 11, seg(t, 1.2, 0.3), S.silver, 'center');
    rise(ctx, rest[1], cx, dy + 22, seg(t, 1.3, 0.3), S.silver, 'center');
  } else {
    const p = easeOutQuint(seg(t, 1.1, 0.3));
    if (p > 0) {
      const ny = h - 17;
      ctx.save();
      try {
        ctx.beginPath();
        ctx.rect(0, ny - 3, w, 9);
        ctx.clip();
        drawNoticeText(ctx, cx, ny + Math.round((1 - p) * 8), { noun, accent });
      } finally {
        ctx.restore();
      }
    }
  }
}

export const inkOn = (c) => (DARK_INK.has(c) ? P.black : P.white);
