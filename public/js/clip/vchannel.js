// The channel's own moments in the vertical picture (the vertical live: docs/publishing/playout.md §13): the ident
// with the AI notice, the break bumper, the spots, the UP NEXT promo, the countdown clock, the standby card, the
// breaking card and the start screen, each set for the 216x384 frame on the 1x grid instead of the middle of the
// horizontal card (which cut the bumper's words, the countdown's ring and every spot's titles in half).
//
// The spots are the one thing not redrawn: an advert is a 384x216 film. In the pre-rendered playout (?vertical=1,
// `adWindow`) the frame leaves a window open (transparent) and the playout's encoder fills it with the spot itself at
// 2x, centred (server/playout/encode.js renderGraph: 768x432 inside the 770x435 window of the 1080x1920 picture,
// every pixel of the spot a 2x2 block, nothing resampled); a page without the playout shows the spot scaled down in
// the window.
//
// Every word a viewer must read keeps to the safe column (x 8-188, layout.js SAFE) and above the feeds' band (y 300),
// centred on the column, as the clip's end card is (clip/cards.js). The AI notice is said where the horizontal ident
// says it and nowhere else: the ident before every programme, never in a break (graphics/disclosure.js).
//
//   drawVerticalChannel(ctx, t, scene, { adWindow, source, channel, memo, sprite }) -> true when the shot is one of these
//   CHANNEL_SHOTS, AD_WINDOW, adPlacement(k)
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
import { VW, VH, HW, HH, SAFE } from './layout.js';
import { groundOf } from './vertical.js';

/** The shots that are the channel's, not a programme's (the vertical frame draws them here). */
export const CHANNEL_SHOTS = Object.freeze(new Set(['start', 'standby', 'ad', 'ident', 'promo', 'countdown', 'breakingCard']));

/**
 * The spot's window in the vertical frame (1x): 154x87, centred on the safe column, in the stage's middle. At 5x it is
 * 770x435 and the spot at 2x (768x432) sits in it with a black hairline round it (on even pixels: 1 px left and right,
 * 2 above, 1 below).
 */
export const AD_WINDOW = Object.freeze({ x: SAFE.cx - 77, y: 116, w: 154, h: 87 });

/**
 * Where the spot goes in the picture at k times the canvas: the largest whole scale a (2 at 5x, 1 at 3x) that fits the
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

const CX = SAFE.cx;
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
function fitBlock(text, w, scales = [2, 1], max = 2) {
  for (const scale of scales) {
    const lines = wrapWords(text, w, scale, max + 1);
    if (lines.length <= max && !lines.some((l) => l.endsWith('…'))) return { scale, lines: balancedWords(text, w, scale, max) };
  }
  const scale = scales.at(-1);
  return { scale, lines: wrapWords(text, w, scale, max) };
}

/** The channel's ground and its frame: the dark graded field, the accent rules over the mast and over the feeds' band. */
function frame(ctx, t, dt, accent) {
  ctx.drawImage(groundOf(VW, VH, { cx: CX, cy: VH * 0.4 }), 0, 0);
  const half = Math.round((VW / 2 + Math.abs(VW / 2 - CX)) * easeOutQuint(seg(dt, 0, 0.5)));
  const x0 = Math.max(0, CX - half);
  const x1 = Math.min(VW, CX + half);
  if (x1 <= x0) return;
  ctx.fillStyle = ruleOf(accent);
  ctx.fillRect(x0, 30, x1 - x0, 2);
  ctx.fillRect(x0, 304, x1 - x0, 2);
}

/** The full logo at 1x centred on the column at y (it lands with the card). */
function smallLogo(ctx, dt, y = 42) {
  const p = easeOutQuint(seg(dt, 0.05, 0.4));
  if (p <= 0) return y + LOGO.h;
  ctx.save();
  try {
    ctx.beginPath();
    ctx.rect(0, y - 2, VW, LOGO.h + 4);
    ctx.clip();
    drawLogo(ctx, CX - (LOGO.w >> 1), y + Math.round((1 - p) * 8), { variant: 'full', scale: 1, t: null });
  } finally {
    ctx.restore();
  }
  return y + LOGO.h;
}

/** The big lock-up (the emblem at 4x over the wordmark at 2x, as on the clip's end card) from y; returns its foot. */
function bigLogo(ctx, dt, y, start = 0.05) {
  const parts = [
    { variant: 'mark', scale: 4, y, L: MARK },
    { variant: 'wordmark', scale: 2, y: y + MARK.h + 8, L: WORD },
  ];
  const p = easeOutQuint(seg(dt, start, 0.45));
  for (const part of parts) {
    if (p <= 0) continue;
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
  return parts[1].y + WORD.h;
}

/** A plate of the programme's colour with its name on it (2x when it fits the column), centred; returns its height. */
function namePlate(ctx, name, y, accent, p = 1) {
  const text = String(name || '').toUpperCase();
  if (!text) return 0;
  const big = measureText(text, 2) <= SAFE.w - 12;
  const tw = measureText(text, big ? 2 : 1);
  const pw = Math.min(SAFE.w, tw + 12);
  const ph = big ? 22 : 13;
  const vis = Math.round(pw * easeOutQuint(p));
  if (vis <= 0) return ph;
  const x = CX - (pw >> 1);
  ctx.save();
  try {
    ctx.beginPath();
    ctx.rect(x, y, vis, ph);
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

/** The break's rail: the whole break, emptying as it runs (slate track, accent fill), centred on the column. */
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

// ------------------------------------------------------------------------------------------------ the ident

let STARS = null;
/** The ident's sky above the earth: the palette's stars on black, seeded (baked once). */
function stars() {
  if (STARS) return STARS;
  const c = mk(VW, VH);
  const g = c.getContext('2d');
  g.fillStyle = P.black;
  g.fillRect(0, 0, VW, VH);
  const rnd = mulberry32(91);
  const cols = [P.slate, P.steel, P.fog];
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(rnd() * VW);
    const y = Math.floor(rnd() * 300);
    const b = rnd();
    if (x > 20 && x < 176 && y > 40 && y < 270) continue; // the lock-up and the notice stand on calm black
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
 * under the frame, its middle a third of the way across the foot; the lock-up arriving at 0.5 s, the slogan, and the AI
 * notice in the ident's type in three rows (AI-PRODUCED NEWS, PRESENTERS ARE AI CHARACTERS, FACTS FROM CREDITED SOURCES:
 * the end card's rows, graphics/disclosure.js).
 */
export function drawVerticalIdent(ctx, t, dt) {
  ctx.drawImage(stars(), 0, 0);
  try {
    EARTH = EARTH || mk(HW, HH);
    const e = EARTH.getContext('2d');
    e.clearRect(0, 0, HW, HH);
    drawIdentScene(e, dt, { words: false });
    // the cap and the sky's glow above it, the earth's middle under the frame's middle, the glow faded in from the
    // frame's black sky (no edge where the copy starts)
    const TOP = 96;
    ctx.drawImage(EARTH, (HW - VW) >> 1, TOP, VW, HH - TOP, 0, VH - (HH - TOP), VW, HH - TOP);
    ctx.drawImage(fade(), 0, VH - (HH - TOP));
  } catch {
    /* the sky alone */
  }
  const g = dt - 0.5;
  if (g < 0) return;
  const foot = bigLogo(ctx, g + 0.05, 46);
  rise(ctx, CHANNEL_SLOGAN, CX, foot + 8, seg(g, 0.15, 0.3), S.silver);
  const rows = noticeParts('NEWS');
  const y0 = foot + 30;
  rows.forEach((row, i) => drawText(ctx, row, CX, y0 + 11 * i, { ...IDENT_STYLES[i === 0 ? 0 : 1], align: 'center' }));
  NOTICE_DRAWS.n++;
}

// ------------------------------------------------------------------------------------------------ the break

/** The break bumper: when the channel is back (BACK IN / 1 MINUTE), what comes after it, the break's clock and rail. */
export function drawVerticalBumper(ctx, t, dt, { left = 60, total = 60, next = '', accent = P.red } = {}) {
  frame(ctx, t, dt, accent);
  smallLogo(ctx, dt, 42);
  const label = breakLabel(left);
  const m = /^BACK IN (.+)$/.exec(label);
  const rest = m ? m[1] : label;
  rise(ctx, 'BACK IN', CX, 90, seg(dt, 0.2, 0.3), S.fog2);
  const big = measureText(rest, 3) <= SAFE.w ? S.white3 : S.white2;
  rise(ctx, rest, CX, 110, seg(dt, 0.3, 0.32), big);
  const bw = Math.round(40 * easeOutQuint(seg(dt, 0.45, 0.35)));
  if (bw > 0) {
    ctx.fillStyle = ruleOf(accent);
    ctx.fillRect(CX - (bw >> 1), 142, bw, 2);
  }
  let y = 154;
  if (next) {
    rise(ctx, 'AFTER THE BREAK', CX, y, seg(dt, 0.55, 0.3), S.fog);
    y += 12;
    const { scale, lines } = fitBlock(next, SAFE.w, [2, 1], 2);
    lines.forEach((line, i) => rise(ctx, line, CX, y + i * (scale === 2 ? 18 : 11), seg(dt, 0.62 + i * 0.06, 0.3), scale === 2 ? S.white2 : S.white));
    y += lines.length * (scale === 2 ? 18 : 11) + 8;
  } else {
    rise(ctx, 'STAY WITH US', CX, y, seg(dt, 0.55, 0.3), S.white2);
    y += 26;
  }
  rise(ctx, `ADVERTISEMENT BREAK  ${clockLeft(left)}`, CX, Math.max(y, 214), seg(dt, 0.7, 0.3), S.silver);
  rail(ctx, Math.max(y, 214) + 16, left, total, accent, seg(dt, 0.5, 0.5));
}

/**
 * A spot: the ADVERTISEMENT tag and the break's clock over the window, the spot in it, what comes after the break
 * under it. `adWindow`: the window is left open for the playout's encoder (transparent); else the spot is drawn in it
 * scaled down from `source`. The 0.3 s of black between spots is black, as on air.
 */
export function drawVerticalSpot(ctx, t, dt, { ad = null, until = null, total = 0, next = '', accent = P.red, adWindow = false, source = null } = {}) {
  if (!ad || ad.black) {
    ctx.fillStyle = P.black;
    ctx.fillRect(0, 0, VW, VH);
    return;
  }
  frame(ctx, t, 1, accent);
  smallLogo(ctx, 1, 42);
  const left = Number.isFinite(until) ? Math.max(0, until - t) : null;
  // the tag as on air (graphics/bug.js drawAdTag): ADVERTISEMENT on black, BACK IN 0:42 on ink beside it
  const tag = 'ADVERTISEMENT';
  const back = left != null ? `BACK IN ${clockLeft(left)}` : '';
  const aw = measureText(tag) + 8;
  const bw = back ? measureText('BACK IN 0:00') + 8 : 0;
  const x = CX - ((aw + bw) >> 1);
  const ty = AD_WINDOW.y - 15;
  ctx.fillStyle = P.black;
  ctx.fillRect(x, ty, aw, 11);
  drawText(ctx, tag, x + 4, ty + 2, S.white);
  if (back) {
    ctx.fillStyle = P.ink;
    ctx.fillRect(x + aw, ty, bw, 11);
    drawText(ctx, back, x + aw + 4, ty + 2, S.silver);
  }
  const { x: wx, y: wy, w: ww, h: wh } = AD_WINDOW;
  // the window's frame: a slate line round a black hairline
  ctx.fillStyle = P.slate;
  ctx.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);
  ctx.fillStyle = P.black;
  ctx.fillRect(wx - 1, wy - 1, ww + 2, wh + 2);
  if (adWindow) ctx.clearRect(wx, wy, ww, wh);
  else if (source) {
    ctx.save();
    try {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(source, 0, 0, HW, HH, wx, wy, ww, wh);
    } finally {
      ctx.restore();
    }
  }
  let y = wy + wh + 12;
  if (next) {
    drawText(ctx, 'AFTER THE BREAK', CX, y, { ...S.fog, align: 'center' });
    y += 12;
    const { scale, lines } = fitBlock(next, SAFE.w, [2, 1], 2);
    lines.forEach((line, i) => drawText(ctx, line, CX, y + i * (scale === 2 ? 18 : 11), { ...(scale === 2 ? S.white2 : S.white), align: 'center' }));
    y += lines.length * (scale === 2 ? 18 : 11) + 6;
  }
  if (left != null && total > 0) rail(ctx, Math.max(y, 262), left, total, accent);
}

/** UP NEXT: the programme on its plate, its line, its presenters standing in the frame, their names. */
export function drawVerticalPromo(ctx, t, dt, card = {}, { nameOf = (id) => String(id || '').toUpperCase(), sprites = null } = {}) {
  const next = card?.next && typeof card.next === 'object' ? card.next : null;
  const accent = accentOf(next?.theme);
  frame(ctx, t, dt, accent);
  smallLogo(ctx, dt, 42);
  rise(ctx, String(card?.label || 'UP NEXT').toUpperCase(), CX, 84, seg(dt, 0.15, 0.3), S.yellow2);
  const ph = namePlate(ctx, next?.title || 'GLOBIT 24', 104, accent, seg(dt, 0.25, 0.35));
  let y = 104 + ph + 8;
  const tag = balancedWords(next?.tagline || '', SAFE.w, 1, 2);
  tag.forEach((line, i) => rise(ctx, line, CX, y + 11 * i, seg(dt, 0.4 + 0.06 * i, 0.3), S.white));
  y += tag.length * 11 + 4;
  // the presenters, cut out, standing side by side to the names' line (the rig's own figures: clip/sprite.js)
  const ids = Array.isArray(next?.presenters) ? next.presenters.slice(0, 3) : [];
  const figs = sprites ? ids.map((id) => sprites(id)).filter(Boolean) : [];
  const NAMES_Y = 274;
  if (figs.length) {
    const p = easeOutQuint(seg(dt, 0.35, 0.5));
    // side by side inside the safe column (the feeds' buttons stand at its right), overlapping when they must
    const sum = figs.reduce((a, f) => a + f.w, 0);
    const gap = figs.length > 1 ? Math.min(-4, Math.floor((SAFE.w - sum) / (figs.length - 1))) : 0;
    const total = sum + gap * (figs.length - 1);
    let x = CX - (total >> 1);
    const room = NAMES_Y - 4 - y;
    ctx.save();
    try {
      ctx.beginPath();
      ctx.rect(0, y, VW, NAMES_Y - 4 - y);
      ctx.clip();
      for (const f of figs) {
        // standing on the names' line; a figure taller than the room shows its head and shoulders, cut at the line
        const fy = (f.h > room ? y + 2 : NAMES_Y - 4 - f.h) + Math.round((1 - p) * 20);
        ctx.drawImage(f.canvas, x, fy);
        x += f.w + gap;
      }
    } finally {
      ctx.restore();
    }
    ctx.fillStyle = ruleOf(accent);
    ctx.fillRect(CX - (Math.min(SAFE.w, total) >> 1), NAMES_Y - 4, Math.min(SAFE.w, total), 2);
  }
  const names = ids.map((id) => nameOf(id)).filter(Boolean).join(' & ');
  if (names) rise(ctx, fitLine(`WITH ${names}`, SAFE.w, 1), CX, NAMES_Y + 2, seg(dt, 0.6, 0.3), S.cream);
  const footer = String(card?.footer || 'AFTER THE BREAK').toUpperCase();
  rise(ctx, footer, CX, NAMES_Y + 14, seg(dt, 0.75, 0.3), S.fog);
}

/** The countdown clock: the ring of 60 dots going out one a second, the time left in it, what comes at what time. */
export function drawVerticalCountdown(ctx, t, dt, { left = 30, next = null, at = 0, accent = P.red } = {}) {
  frame(ctx, t, dt, accent);
  smallLogo(ctx, dt, 42);
  const d = Math.max(0, dt);
  const lit = Math.max(0, Math.min(60, Math.ceil(Number(left) || 0)));
  const on = ruleOf(accent);
  const ring = easeOutQuint(seg(d, 0.05, 0.6));
  const RY = 146;
  for (let i = 0; i < 60; i++) {
    if (i / 60 > ring) break;
    const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
    const x = Math.round(CX + Math.cos(a) * 50);
    const y = Math.round(RY + Math.sin(a) * 50);
    const big = i % 15 === 0;
    ctx.fillStyle = i < lit ? (big ? P.white : on) : P.slate;
    ctx.fillRect(x - (big ? 1 : 0), y - (big ? 1 : 0), big ? 3 : 2, big ? 3 : 2);
  }
  if (d >= 0.3) {
    const txt = clockLeft(left);
    drawText(ctx, txt, CX, RY - 10, { ...S.white3, align: 'center' });
  }
  const { scale, lines } = fitBlock(next?.title || 'GLOBIT 24', SAFE.w, [2, 1], 2);
  let y = 210;
  lines.forEach((line, i) => rise(ctx, line, CX, y + i * (scale === 2 ? 18 : 11), seg(d, 0.35 + 0.06 * i, 0.3), scale === 2 ? S.white2 : S.white));
  y += lines.length * (scale === 2 ? 18 : 11) + 4;
  const mark = clockMark(at);
  rise(ctx, mark ? `AT ${mark}` : 'NEXT', CX, y, seg(d, 0.5, 0.3), S.fog);
  if (d >= 0.65) {
    drawText(ctx, 'THE NEWS ON THE HOUR', CX, y + 18, { ...S.microFog, align: 'center' });
    drawText(ctx, 'AND THE HALF HOUR', CX, y + 26, { ...S.microFog, align: 'center' });
  }
}

/** The standby card (the playout's filler too: BACK SHORTLY): the lock-up, the title and its line on a black plate. */
export function drawVerticalStandby(ctx, t, { title = "WE'LL BE RIGHT BACK", message = '' } = {}) {
  frame(ctx, t, 1, P.red);
  const foot = bigLogo(ctx, 1, 46);
  const lines = wrapWords(message || 'PREPARING THE NEXT BULLETIN', SAFE.w - 16, 1, 3);
  const head = fitBlock(title, SAFE.w - 16, [2, 1], 2);
  const lh = head.scale === 2 ? 18 : 11;
  const by = foot + 18;
  const bh = 14 + head.lines.length * lh + 6 + lines.length * 11 + 6;
  ctx.fillStyle = P.black;
  ctx.fillRect(SAFE.x, by, SAFE.w, bh);
  ctx.fillStyle = P.red;
  ctx.fillRect(SAFE.x, by, SAFE.w, 2);
  ctx.fillRect(SAFE.x + 6, by + 6, 4, 4); // a steady standby lamp
  ctx.fillStyle = P.darkRed;
  ctx.fillRect(SAFE.x, by + bh, SAFE.w, 1);
  head.lines.forEach((l, i) => drawText(ctx, l, CX, by + 14 + i * lh, { color: P.white, scale: head.scale, align: 'center' }));
  const my = by + 14 + head.lines.length * lh + 6;
  lines.forEach((l, i) => drawText(ctx, l, CX, my + i * 11, { ...S.silver, align: 'center' }));
}

/** BREAKING NEWS: the red band, the headline at 2x when it fits five lines, its source. */
export function drawVerticalBreaking(ctx, t, dt, { headline = '', source = '' } = {}) {
  frame(ctx, t, dt, P.red);
  smallLogo(ctx, dt, 42);
  const BY = 86;
  const bp = easeOutQuint(seg(dt, 0, 0.36));
  ctx.fillStyle = P.red;
  ctx.fillRect(0, BY, Math.round(VW * bp), 26);
  ctx.fillStyle = P.darkRed;
  ctx.fillRect(0, BY + 26, Math.round(VW * bp), 2);
  rise(ctx, 'BREAKING NEWS', CX, BY + 6, seg(dt, 0.2, 0.32), S.white2);
  const { scale, lines } = fitBlock(headline, SAFE.w, [2, 1], 6);
  const lh = scale === 2 ? 18 : 11;
  const top = BY + 42;
  lines.forEach((line, i) => rise(ctx, line, CX, top + i * lh, seg(dt, 0.42 + i * 0.08, 0.34), scale === 2 ? S.white2 : S.white));
  if (source) rise(ctx, fitLine(`SOURCE: ${source}`, SAFE.w, 1), CX, Math.min(290, top + lines.length * lh + 6), seg(dt, 0.75, 0.3), S.fog);
}

/** The start screen (a page opened without autostart): the lock-up and its prompt. */
export function drawVerticalStart(ctx, t, { prompt = 'CLICK TO TUNE IN' } = {}) {
  frame(ctx, t, 1, P.red);
  const foot = bigLogo(ctx, 1, 46);
  drawText(ctx, CHANNEL_SLOGAN, CX, foot + 8, { ...S.silver, align: 'center' });
  const pr = fitLine(String(prompt || '').toUpperCase(), SAFE.w - 30, 1);
  const pw = measureText(pr) + 30;
  const x = CX - (pw >> 1);
  ctx.fillStyle = P.white;
  ctx.fillRect(x, foot + 32, pw, 17);
  ctx.fillStyle = P.red;
  ctx.fillRect(x, foot + 32, 17, 17);
  drawText(ctx, pr, x + 23, foot + 37, { color: P.black });
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
