// The channel's own moments in the vertical picture (the vertical live: docs/publishing/playout.md §13): the ident
// with the AI notice, the break bumper, the spots, the UP NEXT promo, the countdown clock, the standby card, the
// breaking card and the start screen, and a programme's title sequence and end card, each set for the 216x384 frame on
// the 1x grid instead of the middle of the horizontal card (which cut the bumper's words, the countdown's ring, every
// spot's titles and every title sequence's name in half).
//
// The films are not redrawn: an advert and a programme's title sequence are 384x216 pictures. In the pre-rendered
// playout (?vertical=1, `adWindow`) the frame leaves a window open (transparent) and the playout's encoder fills it
// with the film itself at 2x, centred (server/playout/encode.js renderGraph: 768x432 inside the 770x435 window of the
// 1080x1920 picture, every pixel a 2x2 block, nothing resampled); a page without the playout shows it scaled down.
//
// Round 2 (owner, 24 Oct: "está como descentrado", "necesita claras mejoras la adaptación"): everything centred on the
// frame (layout.js SAFE, x 28-188 around x 108), every card's rows stacked round the middle of the safe area (y 34-300)
// instead of hanging from the top, the title sequences whole in the window, the end card set for the frame, and the
// live's story line in the title band (drawStoryLine). Every word a viewer must read keeps to the safe column and above
// the feeds' band (y 300). The AI notice is said where the horizontal ident says it and nowhere else: the ident before
// every programme, never in a break (graphics/disclosure.js).
//
//   drawVerticalChannel(ctx, t, scene, { adWindow, source, channel, memo, sprite }) -> true when the shot is the channel's
//   drawVerticalFilm(ctx, t, scene, { adWindow, source, channel }) -> true for a programme's title sequence or end card
//   drawStoryLine(ctx, t, { lines, since, accent })   the live's title band
//   CHANNEL_SHOTS, FILM_SHOTS, AD_WINDOW, adPlacement(k), windowOpen(scene)
import { P } from '../palette.js';
import { drawText, measureText } from '../font.js';
import { drawLogo, measureLogo, CHANNEL_SLOGAN } from '../logo.js';
import { seg, easeOutQuint } from '../gfx/index.js';
import { mk } from '../gfx/canvas.js';
import { bayer } from '../gfx/dither.js';
import { mulberry32 } from '../util.js';
import { THEME_ACCENT } from '../cast.js';
import { inkOn } from '../graphics/layout.js';
import { noticeParts, IDENT_STYLES, NOTICE_DRAWS } from '../graphics/disclosure.js';
import { breakLabel, clockLeft, clockMark } from '../scenes/cards.js';
import { drawIdentScene } from '../scenes/opens/ident.js';
import { VW, VH, HW, HH, SAFE, TITLE_BOX } from './layout.js';
import { groundOf } from './vertical.js';

/** The shots that are the channel's, not a programme's (the vertical frame draws them here). */
export const CHANNEL_SHOTS = Object.freeze(new Set(['start', 'standby', 'ad', 'ident', 'promo', 'countdown', 'breakingCard']));
/** A programme's own full-frame moments the vertical live sets for the frame (its title sequence, its end card). */
export const FILM_SHOTS = Object.freeze(new Set(['open', 'endcard']));

/**
 * The window a film plays in (1x): 154x87, centred on the frame across and down (its middle on row 191). At 5x it is
 * 770x435 and the
 * film at 2x (768x432) sits in it with a black hairline round it (on even pixels: 1 px left and right, 2 above, 1
 * below). server/playout/encode.js holds the same numbers (a test keeps them together).
 */
export const AD_WINDOW = Object.freeze({ x: SAFE.cx - 77, y: 148, w: 154, h: 87 });

/**
 * Where the film goes in the picture at k times the canvas: the largest whole scale a (2 at 5x, 1 at 3x) that fits the
 * window, centred in it. -> { a, x, y, w, h } in the scaled picture's pixels.
 */
export function adPlacement(k = 5) {
  const W = AD_WINDOW.w * k;
  const H = AD_WINDOW.h * k;
  const a = Math.max(1, Math.min(Math.floor(W / HW), Math.floor(H / HH)));
  // (on even pixels: a 2x pixel is then exactly one 4:2:0 chroma sample)
  const even = (v, lo, hi) => (v % 2 === 0 ? v : v + 1 <= hi ? v + 1 : Math.max(lo, v - 1));
  const w = HW * a;
  const h = HH * a;
  const x0 = AD_WINDOW.x * k;
  const y0 = AD_WINDOW.y * k;
  return { a, x: even(x0 + Math.floor((W - w) / 2), x0, x0 + W - w), y: even(y0 + Math.floor((H - h) / 2), y0, y0 + H - h), w, h };
}

/** Is the window open in this scene (a spot, not the black between spots; a programme's title sequence)? */
export const windowOpen = (scene) => (scene?.shot === 'ad' && !!scene.card?.ad && !scene.card.ad.black) || scene?.shot === 'open';

const CX = SAFE.cx;
/**
 * A card's rows stand round the frame's middle (row 191), between its two accent rules (rows 30 and 352, as far from
 * either edge), and never under the feeds' band (row 300): a tall card rises until its last row clears it.
 */
const MID = 191;
const RULES = [30, VH - 32];
const FOOT = 298;
const S = Object.freeze({
  white: { color: P.white },
  white2: { color: P.white, scale: 2 },
  white3: { color: P.white, scale: 3 },
  silver: { color: P.silver },
  fog: { color: P.fog },
  fog2: { color: P.fog, scale: 2 },
  cream: { color: P.cream },
  yellow2: { color: P.yellow, scale: 2 },
  microFog: { color: P.fog, font: 'micro' },
});
const LOGO = measureLogo({ variant: 'full', scale: 1 });
const MARK = measureLogo({ variant: 'mark', scale: 4 });
const WORD = measureLogo({ variant: 'wordmark', scale: 2 });

const accentOf = (theme, fallback = P.red) => THEME_ACCENT[theme] || fallback;
// (purple is too dark for a rule or a plate on the ink ground: fog stands in, as on the end card)
const ruleOf = (accent) => (accent === P.purple ? P.fog : accent);
const lineH = (scale) => (scale >= 3 ? 26 : scale === 2 ? 18 : 11);
const blockH = (n, scale) => (n ? n * lineH(scale) - (lineH(scale) - 7 * scale) : 0);

/** `text` slid up into place over its own line as p goes 0 to 1 (centred on cx). */
function rise(ctx, text, cx, y, p, style) {
  if (p <= 0 || !text) return;
  const scale = style.scale || 1;
  const h = 7 * scale;
  const off = Math.round((1 - easeOutQuint(p)) * (h + 3));
  ctx.save();
  try {
    ctx.beginPath();
    ctx.rect(0, y - 2 * scale, VW, h + 3 * scale + 1);
    ctx.clip();
    drawText(ctx, text, cx, y + off, { ...style, align: 'center' });
  } finally {
    ctx.restore();
  }
}

/** Whole words in lines no wider than `w` at `scale` (a word too long for a line is cut with an ellipsis), at most `max`. */
export function wrapWords(text, w, scale = 1, max = 2) {
  const words = String(text || '').toUpperCase().split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (measureText(next, scale) <= w) cur = next;
    else {
      if (cur) lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  const out = lines.slice(0, max).map((l) => fitLine(l, w, scale));
  if (lines.length > max) out[max - 1] = fitLine(`${out[max - 1]}…`, w, scale);
  return out;
}

/** wrapWords in the same number of lines made as even as they go (the narrowest width that keeps the count). */
export function balancedWords(text, w, scale = 1, max = 2) {
  const lines = wrapWords(text, w, scale, max);
  if (lines.length < 2 || lines.some((l) => l.endsWith('…'))) return lines;
  let best = lines;
  for (let tw = w - 2; tw > w / 3; tw -= 2) {
    const next = wrapWords(text, tw, scale, max + 1);
    if (next.length !== lines.length || next.some((l) => l.endsWith('…'))) break;
    best = next;
  }
  return best;
}

function fitLine(line, w, scale) {
  let s = line;
  while (s.length > 1 && measureText(s, scale) > w) s = `${s.replace(/…$/, '').slice(0, -1).trimEnd()}…`;
  return s;
}

/** The biggest scale (of `scales`) at which `text` fits `w` in at most `max` lines. -> { scale, lines } */
export function fitBlock(text, w, scales = [2, 1], max = 2) {
  for (const scale of scales) {
    const lines = wrapWords(text, w, scale, max + 1);
    if (lines.length <= max && !lines.some((l) => l.endsWith('…'))) return { scale, lines: balancedWords(text, w, scale, max) };
  }
  const scale = scales.at(-1);
  return { scale, lines: wrapWords(text, w, scale, max) };
}

/**
 * Rows stacked round the middle `mid`: each { h, gap (after it), draw(y) }. The block is centred as a whole, so a card
 * with less to say stands in the middle of the frame, never hanging from its top.
 */
function stack(rows, mid = MID) {
  const list = rows.filter(Boolean);
  const total = list.reduce((a, r, i) => a + r.h + (i < list.length - 1 ? r.gap || 0 : 0), 0);
  let y = Math.max(RULES[0] + 8, Math.min(Math.round(mid - total / 2), FOOT - total));
  for (const r of list) {
    r.draw?.(y);
    y += r.h + (r.gap || 0);
  }
}

/** A block of lines (fitBlock's result) as a stack row, each line rising in turn from `at` seconds. */
const textRows = (ctx, block, dt, at, gap, styleOf = (s) => (s === 3 ? S.white3 : s === 2 ? S.white2 : S.white)) => ({
  h: blockH(block.lines.length, block.scale),
  gap,
  draw: (y) => block.lines.forEach((line, i) => rise(ctx, line, CX, y + i * lineH(block.scale), seg(dt, at + i * 0.06, 0.3), styleOf(block.scale))),
});

/** The channel's ground and its frame: the dark graded field, the accent rules over the mast and over the feeds' band. */
function frame(ctx, t, dt, accent) {
  ctx.drawImage(groundOf(VW, VH, { cx: CX, cy: MID }), 0, 0);
  const half = Math.round((VW / 2) * easeOutQuint(seg(dt, 0, 0.5)));
  if (half <= 0) return;
  ctx.fillStyle = ruleOf(accent);
  for (const y of RULES) ctx.fillRect(CX - half, y, 2 * half, 2);
}

/** The full logo at 1x centred, landing with the card. */
const logoRow = (ctx, dt, gap) => ({
  h: LOGO.h,
  gap,
  draw: (y) => {
    const p = easeOutQuint(seg(dt, 0.05, 0.4));
    if (p <= 0) return;
    ctx.save();
    try {
      ctx.beginPath();
      ctx.rect(0, y - 2, VW, LOGO.h + 4);
      ctx.clip();
      drawLogo(ctx, CX - (LOGO.w >> 1), y + Math.round((1 - p) * 8), { variant: 'full', scale: 1, t: null });
    } finally {
      ctx.restore();
    }
  },
});

/** The big lock-up (the emblem at 4x over the wordmark at 2x, as on the clip's end card), arriving from `start`. */
const bigLogoRow = (ctx, dt, gap, start = 0.05) => ({
  h: MARK.h + 8 + WORD.h,
  gap,
  draw: (y) => {
    const p = easeOutQuint(seg(dt, start, 0.45));
    if (p <= 0) return;
    for (const part of [
      { variant: 'mark', scale: 4, y, L: MARK },
      { variant: 'wordmark', scale: 2, y: y + MARK.h + 8, L: WORD },
    ]) {
      ctx.save();
      try {
        ctx.beginPath();
        ctx.rect(0, part.y - 2, VW, part.L.h + 4);
        ctx.clip();
        drawLogo(ctx, CX - (part.L.w >> 1), part.y + Math.round((1 - p) * (part.L.h + 4)), { variant: part.variant, scale: part.scale, t: null });
      } finally {
        ctx.restore();
      }
    }
  },
});

/** A plate of the programme's colour with its name on it (2x when it fits the column), centred; returns its height. */
function namePlate(ctx, name, y, accent, p = 1) {
  const text = String(name || '').toUpperCase();
  if (!text) return 0;
  const big = measureText(text, 2) <= SAFE.w - 12;
  const tw = measureText(text, big ? 2 : 1);
  const pw = Math.min(SAFE.w, tw + 12);
  const ph = big ? 22 : 13;
  // (it opens from its middle)
  const vis = Math.round(pw * easeOutQuint(p));
  if (vis <= 0) return ph;
  const x = CX - (pw >> 1);
  ctx.save();
  try {
    ctx.beginPath();
    ctx.rect(CX - (vis >> 1), y, vis, ph);
    ctx.clip();
    if (accent === P.purple) {
      ctx.fillStyle = P.fog;
      ctx.fillRect(x, y, pw, ph);
      ctx.fillStyle = P.purple;
      ctx.fillRect(x + 1, y + 1, pw - 2, ph - 2);
    } else {
      ctx.fillStyle = accent;
      ctx.fillRect(x, y, pw, ph);
    }
    drawText(ctx, fitLine(text, pw - 12, big ? 2 : 1), x + 6, y + 4, { color: accent === P.purple ? P.white : inkOn(accent), scale: big ? 2 : 1 });
  } finally {
    ctx.restore();
  }
  return ph;
}
const plateH = (name) => (measureText(String(name || '').toUpperCase(), 2) <= SAFE.w - 12 ? 22 : 13);

/** The break's rail: the whole break, emptying as it runs (slate track, accent fill), centred. */
function rail(ctx, y, left, total, accent, p = 1) {
  const RW = 140;
  const x = CX - (RW >> 1);
  const share = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0;
  const rp = easeOutQuint(p);
  if (rp <= 0) return;
  ctx.fillStyle = P.slate;
  ctx.fillRect(x, y, Math.round(RW * rp), 2);
  ctx.fillStyle = ruleOf(accent);
  ctx.fillRect(x, y, Math.round(RW * rp * share), 2);
}

/** The accent bar under a heading, opening from its middle. */
function bar(ctx, y, accent, p, w = 40) {
  const bw = Math.round(w * easeOutQuint(p));
  if (bw <= 0) return;
  ctx.fillStyle = ruleOf(accent);
  ctx.fillRect(CX - (bw >> 1), y, bw, 2);
}

/**
 * The window a film plays in: a slate line round a black hairline, left open (transparent) for the playout's encoder,
 * or the film scaled down into it from `source` on a page without the playout.
 */
function filmWindow(ctx, { adWindow = false, source = null } = {}) {
  const { x, y, w, h } = AD_WINDOW;
  ctx.fillStyle = P.slate;
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = P.black;
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  if (adWindow) ctx.clearRect(x, y, w, h);
  else if (source) {
    ctx.save();
    try {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(source, 0, 0, HW, HH, x, y, w, h);
    } finally {
      ctx.restore();
    }
  }
}

// ------------------------------------------------------------------------------------------------ the ident

let STARS = null;
/** The ident's sky above the earth: the palette's stars on black, seeded (baked once), clear round the words. */
function stars() {
  if (STARS) return STARS;
  const c = mk(VW, VH);
  const g = c.getContext('2d');
  g.fillStyle = P.black;
  g.fillRect(0, 0, VW, VH);
  const rnd = mulberry32(91);
  const cols = [P.slate, P.steel, P.fog];
  for (let i = 0; i < 80; i++) {
    const x = Math.floor(rnd() * VW);
    const y = Math.floor(rnd() * 270);
    const b = rnd();
    if (x > 24 && x < 192 && y > 36 && y < 262) continue; // the lock-up and the notice stand on calm black
    g.fillStyle = cols[b > 0.93 ? 2 : b > 0.6 ? 1 : 0];
    g.fillRect(x, y, 1, 1);
  }
  STARS = c;
  return c;
}

let EARTH = null;
let FADE = null;
/** Black over the earth's sky, thinning out row by row (Bayer 4x4): the cap's glow rises out of the frame's black sky. */
function fade(h = 48) {
  if (FADE) return FADE;
  const c = mk(VW, h);
  const g = c.getContext('2d');
  g.fillStyle = P.black;
  for (let y = 0; y < h; y++) for (let x = 0; x < VW; x++) if (bayer(x, y) >= (y + 1) / h) g.fillRect(x, y, 1, 1);
  FADE = c;
  return c;
}

/**
 * The channel ident: the horizontal ident's earth from orbit (its terminator crossing Europe, scenes/opens/ident.js)
 * under the frame, the lock-up arriving at 0.5 s with the slogan, and the AI notice in the ident's type in three rows
 * (AI-PRODUCED NEWS, PRESENTERS ARE AI CHARACTERS, FACTS FROM CREDITED SOURCES: the end card's rows,
 * graphics/disclosure.js), the whole block centred over the earth.
 */
export function drawVerticalIdent(ctx, t, dt) {
  ctx.drawImage(stars(), 0, 0);
  const TOP = 96;
  try {
    EARTH = EARTH || mk(HW, HH);
    const e = EARTH.getContext('2d');
    e.clearRect(0, 0, HW, HH);
    drawIdentScene(e, dt, { words: false });
    // the cap and the sky's glow above it, the earth's middle under the frame's middle, the glow faded in from the
    // frame's black sky (no edge where the copy starts)
    ctx.drawImage(EARTH, (HW - VW) >> 1, TOP, VW, HH - TOP, 0, VH - (HH - TOP), VW, HH - TOP);
    ctx.drawImage(fade(), 0, VH - (HH - TOP));
  } catch {
    /* the sky alone */
  }
  const g = dt - 0.5;
  if (g < 0) return;
  const rows = noticeParts('NEWS');
  // (the block between the mast and the earth's glow, y 34-262)
  stack(
    [
      bigLogoRow(ctx, g + 0.05, 10),
      { h: 7, gap: 16, draw: (y) => rise(ctx, CHANNEL_SLOGAN, CX, y, seg(g, 0.15, 0.3), S.silver) },
      { h: blockH(rows.length, 1), draw: (y) => rows.forEach((row, i) => drawText(ctx, row, CX, y + 11 * i, { ...IDENT_STYLES[i === 0 ? 0 : 1], align: 'center' })) },
    ],
    148,
  );
  NOTICE_DRAWS.n++;
}

// ------------------------------------------------------------------------------------------------ the break

/** The break bumper: when the channel is back (BACK IN / 1 MINUTE), what comes after it, the break's clock and rail. */
export function drawVerticalBumper(ctx, t, dt, { left = 60, total = 60, next = '', accent = P.red } = {}) {
  frame(ctx, t, dt, accent);
  const label = breakLabel(left);
  const m = /^BACK IN (.+)$/.exec(label);
  const rest = m ? m[1] : label;
  const big = measureText(rest, 3) <= SAFE.w ? S.white3 : S.white2;
  const nextBlock = next ? fitBlock(next, SAFE.w, [2, 1], 2) : null;
  stack([
    logoRow(ctx, dt, 26),
    { h: 14, gap: 8, draw: (y) => rise(ctx, 'BACK IN', CX, y, seg(dt, 0.2, 0.3), S.fog2) },
    { h: 7 * (big.scale || 2), gap: 12, draw: (y) => rise(ctx, rest, CX, y, seg(dt, 0.3, 0.32), big) },
    { h: 2, gap: 16, draw: (y) => bar(ctx, y, accent, seg(dt, 0.45, 0.35)) },
    next ? { h: 7, gap: 7, draw: (y) => rise(ctx, 'AFTER THE BREAK', CX, y, seg(dt, 0.55, 0.3), S.fog) } : null,
    next ? textRows(ctx, nextBlock, dt, 0.62, 22) : { h: 14, gap: 22, draw: (y) => rise(ctx, 'STAY WITH US', CX, y, seg(dt, 0.55, 0.3), S.white2) },
    { h: 7, gap: 10, draw: (y) => rise(ctx, `ADVERTISEMENT BREAK  ${clockLeft(left)}`, CX, y, seg(dt, 0.7, 0.3), S.silver) },
    { h: 2, draw: (y) => rail(ctx, y, left, total, accent, seg(dt, 0.5, 0.5)) },
  ]);
}

/**
 * A spot: the ADVERTISEMENT tag and the break's clock over the window, the spot in it, what comes after the break under
 * it. The window is fixed (the encoder's numbers); the rows round it are centred on it. The 0.3 s of black between
 * spots is black, as on air.
 */
export function drawVerticalSpot(ctx, t, dt, { ad = null, until = null, total = 0, next = '', accent = P.red, adWindow = false, source = null } = {}) {
  if (!ad || ad.black) {
    ctx.fillStyle = P.black;
    ctx.fillRect(0, 0, VW, VH);
    return;
  }
  frame(ctx, t, 1, accent);
  const { y: wy, h: wh } = AD_WINDOW;
  const left = Number.isFinite(until) ? Math.max(0, until - t) : null;
  // the logo and the tag over the window
  drawLogo(ctx, CX - (LOGO.w >> 1), wy - 18 - 18 - LOGO.h, { variant: 'full', scale: 1, t: null });
  // the tag as on air (graphics/bug.js drawAdTag): ADVERTISEMENT on black, BACK IN 0:42 on ink beside it
  const tag = 'ADVERTISEMENT';
  const back = left != null ? `BACK IN ${clockLeft(left)}` : '';
  const aw = measureText(tag) + 8;
  const bw = back ? measureText('BACK IN 0:00') + 8 : 0;
  const x = CX - ((aw + bw) >> 1);
  const ty = wy - 18;
  ctx.fillStyle = P.black;
  ctx.fillRect(x, ty, aw, 11);
  drawText(ctx, tag, x + 4, ty + 2, S.white);
  if (back) {
    ctx.fillStyle = P.ink;
    ctx.fillRect(x + aw, ty, bw, 11);
    drawText(ctx, back, x + aw + 4, ty + 2, S.silver);
  }
  filmWindow(ctx, { adWindow, source });
  let y = wy + wh + 16;
  if (next) {
    drawText(ctx, 'AFTER THE BREAK', CX, y, { ...S.fog, align: 'center' });
    y += 14;
    const { scale, lines } = fitBlock(next, SAFE.w, [2, 1], 2);
    lines.forEach((line, i) => drawText(ctx, line, CX, y + i * lineH(scale), { ...(scale === 2 ? S.white2 : S.white), align: 'center' }));
    y += blockH(lines.length, scale) + 16;
  }
  if (left != null && total > 0) rail(ctx, y, left, total, accent);
}

/** UP NEXT: the programme on its plate, its line, its presenters standing in the frame, their names. */
export function drawVerticalPromo(ctx, t, dt, card = {}, { nameOf = (id) => String(id || '').toUpperCase(), sprites = null } = {}) {
  const next = card?.next && typeof card.next === 'object' ? card.next : null;
  const accent = accentOf(next?.theme);
  frame(ctx, t, dt, accent);
  const title = next?.title || 'GLOBIT 24';
  const tag = balancedWords(next?.tagline || '', SAFE.w, 1, 2);
  const ids = Array.isArray(next?.presenters) ? next.presenters.slice(0, 3) : [];
  const figs = sprites ? ids.map((id) => sprites(id)).filter(Boolean) : [];
  const names = ids.map((id) => nameOf(id)).filter(Boolean).join(' & ');
  const FIG_H = 104;
  stack([
    { h: 14, gap: 8, draw: (y) => rise(ctx, String(card?.label || 'UP NEXT').toUpperCase(), CX, y, seg(dt, 0.15, 0.3), S.yellow2) },
    { h: plateH(title), gap: 8, draw: (y) => namePlate(ctx, title, y, accent, seg(dt, 0.25, 0.35)) },
    tag.length ? { h: blockH(tag.length, 1), gap: 8, draw: (y) => tag.forEach((line, i) => rise(ctx, line, CX, y + 11 * i, seg(dt, 0.4 + 0.06 * i, 0.3), S.white)) } : null,
    figs.length
      ? {
          h: FIG_H,
          gap: 6,
          draw: (y) => {
            // the presenters, cut out, standing side by side on the names' rule, inside the safe column (overlapping
            // when they must), head and shoulders when taller than the room (the rig's own figures: clip/sprite.js)
            const p = easeOutQuint(seg(dt, 0.35, 0.5));
            if (p <= 0) return; // (after the programme's name, never before it)
            const sum = figs.reduce((a, f) => a + f.w, 0);
            const gap = figs.length > 1 ? Math.min(-4, Math.floor((SAFE.w - sum) / (figs.length - 1))) : 0;
            const total = sum + gap * (figs.length - 1);
            let x = CX - (total >> 1);
            ctx.save();
            try {
              ctx.beginPath();
              ctx.rect(0, y, VW, FIG_H);
              ctx.clip();
              for (const f of figs) {
                const fy = (f.h > FIG_H ? y + 2 : y + FIG_H - f.h) + Math.round((1 - p) * 20);
                ctx.drawImage(f.canvas, x, fy);
                x += f.w + gap;
              }
            } finally {
              ctx.restore();
            }
            ctx.fillStyle = ruleOf(accent);
            const rw = Math.min(SAFE.w, total);
            ctx.fillRect(CX - (rw >> 1), y + FIG_H, rw, 2);
          },
        }
      : null,
    names ? namesRow(ctx, `WITH ${names}`, dt, 0.6, 7) : null,
    { h: 7, draw: (y) => rise(ctx, String(card?.footer || 'AFTER THE BREAK').toUpperCase(), CX, y + 2, seg(dt, 0.75, 0.3), S.fog) },
  ]);
}

/** The presenters' names under their figures: one line, or two even ones when one does not fit (never cut). */
function namesRow(ctx, text, dt, at, gap) {
  const lines = balancedWords(text, SAFE.w, 1, 2);
  return { h: blockH(lines.length, 1) + 2, gap, draw: (y) => lines.forEach((l, i) => rise(ctx, l, CX, y + 2 + 11 * i, seg(dt, at + 0.06 * i, 0.3), S.cream)) };
}

/** The countdown clock: the ring of 60 dots going out one a second, the time left in it, what comes at what time. */
export function drawVerticalCountdown(ctx, t, dt, { left = 30, next = null, at = 0, accent = P.red } = {}) {
  frame(ctx, t, dt, accent);
  const d = Math.max(0, dt);
  const lit = Math.max(0, Math.min(60, Math.ceil(Number(left) || 0)));
  const on = ruleOf(accent);
  const R = 50;
  const title = fitBlock(next?.title || 'GLOBIT 24', SAFE.w, [2, 1], 2);
  const mark = clockMark(at);
  stack([
    logoRow(ctx, dt, 18),
    {
      h: 2 * R + 3,
      gap: 18,
      draw: (y) => {
        const cy = y + R + 1;
        const ring = easeOutQuint(seg(d, 0.05, 0.6));
        for (let i = 0; i < 60; i++) {
          if (i / 60 > ring) break;
          const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
          const x = Math.round(CX + Math.cos(a) * R);
          const yy = Math.round(cy + Math.sin(a) * R);
          const big = i % 15 === 0;
          ctx.fillStyle = i < lit ? (big ? P.white : on) : P.slate;
          ctx.fillRect(x - (big ? 1 : 0), yy - (big ? 1 : 0), big ? 3 : 2, big ? 3 : 2);
        }
        if (d >= 0.3) drawText(ctx, clockLeft(left), CX, cy - 10, { ...S.white3, align: 'center' });
      },
    },
    textRows(ctx, title, d, 0.35, 8),
    { h: 7, gap: 14, draw: (y) => rise(ctx, mark ? `AT ${mark}` : 'NEXT', CX, y, seg(d, 0.5, 0.3), S.fog) },
    {
      h: 15,
      draw: (y) => {
        if (d < 0.65) return;
        drawText(ctx, 'THE NEWS ON THE HOUR', CX, y, { ...S.microFog, align: 'center' });
        drawText(ctx, 'AND THE HALF HOUR', CX, y + 8, { ...S.microFog, align: 'center' });
      },
    },
  ]);
}

/** The standby card (the playout's filler too: BACK SHORTLY): the lock-up, the title and its line on a black plate. */
export function drawVerticalStandby(ctx, t, { title = "WE'LL BE RIGHT BACK", message = '' } = {}) {
  frame(ctx, t, 1, P.red);
  const lines = wrapWords(message || 'PREPARING THE NEXT BULLETIN', SAFE.w - 16, 1, 3);
  const head = fitBlock(title, SAFE.w - 16, [2, 1], 2);
  const bh = 14 + blockH(head.lines.length, head.scale) + 8 + blockH(lines.length, 1) + 10;
  stack([
    bigLogoRow(ctx, 1, 22),
    {
      h: bh + 1,
      draw: (by) => {
        ctx.fillStyle = P.black;
        ctx.fillRect(SAFE.x, by, SAFE.w, bh);
        ctx.fillStyle = P.red;
        ctx.fillRect(SAFE.x, by, SAFE.w, 2);
        ctx.fillRect(SAFE.x + 6, by + 6, 4, 4); // a steady standby lamp
        ctx.fillStyle = P.darkRed;
        ctx.fillRect(SAFE.x, by + bh, SAFE.w, 1);
        head.lines.forEach((l, i) => drawText(ctx, l, CX, by + 14 + i * lineH(head.scale), { color: P.white, scale: head.scale, align: 'center' }));
        const my = by + 14 + blockH(head.lines.length, head.scale) + 8;
        lines.forEach((l, i) => drawText(ctx, l, CX, my + i * 11, { ...S.silver, align: 'center' }));
      },
    },
  ]);
}

/** BREAKING NEWS: the red band edge to edge, the headline at 2x when it fits six lines, its source. */
export function drawVerticalBreaking(ctx, t, dt, { headline = '', source = '' } = {}) {
  frame(ctx, t, dt, P.red);
  const block = fitBlock(headline, SAFE.w, [2, 1], 6);
  stack([
    logoRow(ctx, dt, 18),
    {
      h: 28,
      gap: 16,
      draw: (y) => {
        const bp = easeOutQuint(seg(dt, 0, 0.36));
        ctx.fillStyle = P.red;
        ctx.fillRect(0, y, Math.round(VW * bp), 26);
        ctx.fillStyle = P.darkRed;
        ctx.fillRect(0, y + 26, Math.round(VW * bp), 2);
        rise(ctx, 'BREAKING NEWS', CX, y + 6, seg(dt, 0.2, 0.32), S.white2);
      },
    },
    textRows(ctx, block, dt, 0.42, source ? 10 : 0),
    source ? { h: 7, draw: (y) => rise(ctx, fitLine(`SOURCE: ${source}`, SAFE.w, 1), CX, y, seg(dt, 0.75, 0.3), S.fog) } : null,
  ]);
}

/** The start screen (a page opened without autostart): the lock-up and its prompt. */
export function drawVerticalStart(ctx, t, { prompt = 'CLICK TO TUNE IN' } = {}) {
  frame(ctx, t, 1, P.red);
  const pr = fitLine(String(prompt || '').toUpperCase(), SAFE.w - 30, 1);
  const pw = measureText(pr) + 30;
  stack([
    bigLogoRow(ctx, 1, 10),
    { h: 7, gap: 18, draw: (y) => drawText(ctx, CHANNEL_SLOGAN, CX, y, { ...S.silver, align: 'center' }) },
    {
      h: 17,
      draw: (y) => {
        const x = CX - (pw >> 1);
        ctx.fillStyle = P.white;
        ctx.fillRect(x, y, pw, 17);
        ctx.fillStyle = P.red;
        ctx.fillRect(x, y, 17, 17);
        drawText(ctx, pr, x + 23, y + 5, { color: P.black });
      },
    },
  ]);
}

// ------------------------------------------------------------------------------------------------ a programme's films

/**
 * A programme's title sequence in the vertical live: the programme's name on its plate over the window, the sequence
 * itself whole in the window (the encoder lays it there at 2x: its music, its moves, its name never cut), its
 * presenters and its line under it.
 */
export function drawVerticalOpen(ctx, t, dt, { title = '', tagline = '', names = '', accent = P.red, adWindow = false, source = null } = {}) {
  frame(ctx, t, dt, accent);
  const { y: wy, h: wh } = AD_WINDOW;
  namePlate(ctx, title, wy - 18 - plateH(title), accent, seg(dt, 0.1, 0.35));
  filmWindow(ctx, { adWindow, source });
  let y = wy + wh + 16;
  if (names) {
    const nl = balancedWords(`WITH ${names}`, SAFE.w, 1, 2);
    nl.forEach((l, i) => rise(ctx, l, CX, y + 11 * i, seg(dt, 0.4 + 0.06 * i, 0.3), S.cream));
    y += blockH(nl.length, 1) + 8;
  }
  balancedWords(tagline, SAFE.w, 1, 2).forEach((line, i) => rise(ctx, line, CX, y + 11 * i, seg(dt, 0.5 + 0.06 * i, 0.3), S.fog));
}

/** A programme's end card in the vertical live: its name on its plate, STAY WITH US large, the channel's line, the logo. */
export function drawVerticalEndcard(ctx, t, dt, { title = '', line1 = 'STAY WITH US', line2 = '', accent = P.red } = {}) {
  frame(ctx, t, dt, accent);
  const l1 = fitBlock(line1, SAFE.w, [3, 2, 1], 2);
  const l2 = line2 ? balancedWords(line2, SAFE.w, 1, 2) : [];
  stack([
    { h: plateH(title), gap: 22, draw: (y) => namePlate(ctx, title, y, accent, seg(dt, 0.05, 0.35)) },
    textRows(ctx, l1, dt, 0.25, 12),
    { h: 2, gap: 14, draw: (y) => bar(ctx, y, accent, seg(dt, 0.4, 0.35)) },
    l2.length ? { h: blockH(l2.length, 1), gap: 26, draw: (y) => l2.forEach((line, i) => rise(ctx, line, CX, y + 11 * i, seg(dt, 0.5 + 0.06 * i, 0.3), S.silver)) } : null,
    logoRow(ctx, dt - 0.5, 0),
  ]);
}

/**
 * A programme's film in the vertical live: its title sequence (in the window) or its end card (set for the frame).
 * False for any other shot.
 */
export function drawVerticalFilm(ctx, t, scene, { adWindow = false, source = null, channel = null } = {}) {
  const shot = scene?.shot;
  if (!FILM_SHOTS.has(shot)) return false;
  const program = scene.program || {};
  const accent = accentOf(program.theme);
  const dt = Math.max(0, t - (scene.shotSince || 0));
  if (shot === 'open') {
    const ids = Object.values(scene.cast || {}).filter(Boolean);
    const names = ids.map((id) => String(channel?.presenters?.[id]?.name || id).toUpperCase()).join(' & ');
    drawVerticalOpen(ctx, t, dt, { title: program.title || '', tagline: program.tagline || '', names, accent, adWindow, source });
  } else {
    const card = scene.card || {};
    drawVerticalEndcard(ctx, t, dt, { title: program.title || '', line1: card.line1 || 'STAY WITH US', line2: card.line2 || '', accent });
  }
  return true;
}

// ------------------------------------------------------------------------------------------------ the story line

/**
 * The vertical live's title band: the story on air in two lines at 2x when they fit, else up to three at 1x, centred
 * on the title band's plate (TITLE_BOX: a clip's hook covers it whole), the programme's accent bar down its left edge;
 * a new story wipes in from the middle. `lines`: the text already broken (storyLines).
 */
export function drawStoryLine(ctx, t, { lines = [], scale = 1, since = 0, accent = P.red } = {}) {
  if (!lines.length) return;
  const B = TITLE_BOX;
  const p = easeOutQuint(seg(t - since, 0, 0.35));
  const vis = Math.round(B.w * p);
  if (vis <= 0) return;
  ctx.save();
  try {
    ctx.beginPath();
    ctx.rect(B.x + ((B.w - vis) >> 1), B.y, vis, B.h);
    ctx.clip();
    ctx.fillStyle = P.black;
    ctx.fillRect(B.x, B.y, B.w, B.h);
    ctx.fillStyle = ruleOf(accent);
    ctx.fillRect(B.x, B.y, 2, B.h);
    const h = blockH(lines.length, scale);
    const y = B.y + Math.round((B.h - h) / 2);
    const cx = B.x + 1 + (B.w >> 1);
    lines.forEach((l, i) => drawText(ctx, l, cx, y + i * lineH(scale), { color: P.white, scale, align: 'center' }));
  } finally {
    ctx.restore();
  }
}

/**
 * A story's headline broken for the title band: two lines at 2x when they fit, else up to three at 1x; a headline too
 * long for three is cut at its last clause that fits (after a comma, a colon, a semicolon or a dash: never mid-thought),
 * and only past that with an ellipsis. -> { lines, scale }
 */
export function storyLines(text) {
  const w = TITLE_BOX.w - 16;
  const two = wrapWords(text, w, 2, 3);
  if (two.length <= 2 && !two.some((l) => l.endsWith('…'))) return { lines: balancedWords(text, w, 2, 2), scale: 2 };
  const fits = (s) => {
    const l = wrapWords(s, w, 1, 4);
    return l.length <= 3 && !l.some((x) => x.endsWith('…'));
  };
  let t = String(text || '').trim();
  if (!fits(t)) {
    const cuts = [...t.matchAll(/[,;:](?=\s)|\s[–—-](?=\s)/g)].map((m) => m.index).reverse();
    const cut = cuts.find((i) => i > 12 && fits(t.slice(0, i)));
    if (cut) t = t.slice(0, cut).trim();
  }
  return { lines: balancedWords(t, w, 1, 3), scale: 1 };
}

// ------------------------------------------------------------------------------------------------ the dispatch

/**
 * The channel's shot of `scene` in the vertical frame. `memo` keeps what a break's bumper said (the programme after
 * it) for its spots, and the promo's cut-outs (`sprite`: clip/sprite.js presenterSprite, handed in by clip/index.js).
 * Returns false for a programme's shot (the compositor draws it).
 */
export function drawVerticalChannel(ctx, t, scene, { adWindow = false, source = null, channel = null, memo = {}, sprite = null } = {}) {
  const shot = scene?.shot;
  if (!CHANNEL_SHOTS.has(shot)) return false;
  const card = scene.card || {};
  const dt = Math.max(0, t - (scene.shotSince || 0));
  const nameOf = (id) => String(channel?.presenters?.[id]?.name || id || '').toUpperCase();
  if (shot === 'ident') {
    if (card.kind === 'break') {
      const br = scene.adBreak;
      memo.next = card.next || '';
      memo.accent = accentOf(card.theme);
      drawVerticalBumper(ctx, t, dt, { left: br ? br.until - t : card.seconds, total: br?.total || card.seconds, next: card.next, accent: memo.accent });
    } else drawVerticalIdent(ctx, t, dt);
  } else if (shot === 'ad') {
    const br = scene.adBreak;
    drawVerticalSpot(ctx, t, dt, { ad: card.ad, until: br ? br.until : null, total: br?.total || 0, next: memo.next || '', accent: memo.accent || P.red, adWindow, source });
  } else if (shot === 'promo') {
    memo.sprites = memo.sprites || new Map();
    const sprites = sprite
      ? (id) => {
          if (!memo.sprites.has(id)) memo.sprites.set(id, sprite(id, { emotion: 'happy', scale: 2.1 }));
          return memo.sprites.get(id);
        }
      : null;
    drawVerticalPromo(ctx, t, dt, card, { nameOf, sprites });
  } else if (shot === 'countdown') {
    drawVerticalCountdown(ctx, t, dt, { left: Number.isFinite(card.until) ? card.until - t : 0, next: card.next, at: card.at, accent: accentOf(card.next?.theme) });
  } else if (shot === 'standby') {
    drawVerticalStandby(ctx, t, { message: card.message || 'PREPARING THE NEXT PROGRAMME' });
  } else if (shot === 'breakingCard') {
    drawVerticalBreaking(ctx, t, dt, { headline: card.headline, source: card.source });
  } else {
    drawVerticalStart(ctx, t, { prompt: card.prompt || 'CLICK TO TUNE IN' });
  }
  return true;
}
