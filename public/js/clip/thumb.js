// A full programme's thumbnail (docs/publishing/vertical.md §6): one of the programme's own frames, with its name and
// its lead in the channel's own type, on the 384x216 grid (scaled 5x by nearest neighbour to 1920x1080 by the
// publishing desk, so it is exactly as crisp as the channel). Nothing on it the programme did not show.
//
//   drawThumb(ctx, { frame, programme, lines, accent, kicker, side })
//     frame      an image (canvas, ImageBitmap, HTMLImageElement) of the programme at 384x216
//     side       where the type goes: 'left', or 'right' over the studio's wall, clear of a presenter standing left
//     programme  its title (COSMOS DESK)
//     lines      the lead, up to three lines: 3x when each is ≤ 11 characters, else 2x (≤ 16): thumbLines
//     kicker     a small line over the lead (FULL PROGRAMME · 17 OCT)
import { P } from '../palette.js';
import { drawText, measureText } from '../font.js';
import { TOP } from '../graphics/layout.js';
import { drawBugOnly, drawProgrammeTag } from './graphics.js';

const W = 384;
const H = 216;
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

const WEAK = new Set(['A', 'AN', 'THE', 'OF', 'TO', 'IN', 'ON', 'FOR', 'WITH', 'AND', 'OR', 'AT', 'BY', 'FROM', 'AS', 'IS', 'ITS']);

/**
 * The lead in at most `max` lines of at most `chars` characters, whole words. A lead too long for it is cut at its
 * own break (a colon, a comma, a dash) when the part before fits, else after the most words that fit, never on a
 * weak word (of, to, the...). null when nothing sensible fits.
 */
export function thumbLines(text, { chars = 11, max = 3 } = {}) {
  const clean = String(text || '').toUpperCase().replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  const wrap = (t) => {
    const lines = [''];
    for (const w of t.split(' ').filter(Boolean)) {
      const cur = lines[lines.length - 1];
      if (!cur) lines[lines.length - 1] = w;
      else if (`${cur} ${w}`.length <= chars) lines[lines.length - 1] = `${cur} ${w}`;
      else lines.push(w);
    }
    return lines.length <= max && lines.every((l) => l.length <= chars) ? lines : null;
  };
  const whole = wrap(clean);
  if (whole) return whole;
  const head = /^(.{6,}?)\s*[:,–—-]\s/.exec(clean);
  if (head && wrap(head[1])) return wrap(head[1]);
  const words = clean.replace(/[.!?]$/, '').split(' ');
  for (let n = words.length - 1; n >= 2; n--) {
    if (WEAK.has(words[n - 1])) continue;
    const w = wrap(words.slice(0, n).join(' '));
    if (w) return w;
  }
  return null;
}

/** Text with a one-pixel black shadow below-right (the channel's type over a picture). */
function shadowed(ctx, text, x, y, style) {
  const s = style.scale || 1;
  drawText(ctx, text, x + s, y + s, { ...style, color: P.black });
  drawText(ctx, text, x, y, style);
}

/** The type's block width: the programme plate, the lead (with its bar) and the kicker, whichever is widest. */
function blockWidth(name, ls, kicker) {
  const sc = ls.every((l) => l.length <= 11) ? 3 : 2;
  return Math.max(name ? measureText(name, 2) + 12 : 0, ...ls.map((l) => 10 + measureText(l, sc)), kicker ? measureText(kicker, 1) : 0);
}

export const THUMB_BAND = 232;

export function drawThumb(ctx, { frame = null, programme = '', lines = [], accent = P.red, kicker = '', side = 'left' } = {}) {
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = P.ink;
  ctx.fillRect(0, 0, W, H);
  if (frame) ctx.drawImage(frame, 0, 0, W, H);
  const right = side === 'right';
  const name = String(programme || '').toUpperCase();
  const ls = (lines || []).filter(Boolean).slice(0, 3);
  const kick = String(kicker || '').toUpperCase();
  const bw = blockWidth(name, ls, kick);
  // up to 60 % of the frame on the type's side: the picture dimmed by an ordered dither of black (pixel-true, no
  // blur), as dense as it goes behind the whole type block (nothing of the picture's own lettering reads through
  // it), fading over the last 32 pixels; the other side, where the presenter stands, untouched
  const band = THUMB_BAND;
  const full = Math.min(band - 32, Math.max(120, TOP.x + bw + 6));
  for (let y = 0; y < H; y++) {
    for (let i = 0; i < full + 32; i++) {
      const k = i <= full ? 1 : 1 - (i - full) / 32;
      const level = Math.round(k * 13); // up to 13 of 16 pixels black
      const x = right ? W - 1 - i : i;
      if (BAYER[y & 3][x & 3] < level) {
        ctx.fillStyle = P.black;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  // the bug, clean as on air (the upload's description, YouTube's own label and the file's C2PA say it is AI-produced)
  drawBugOnly(ctx, 9, 0, TOP.x, TOP.y);
  // the programme's name on its accent (the on-air programme tag's design, at 2x); on the right the block sits flush
  // to the right margin, its lines ranged left within it
  const x = right ? W - TOP.x - bw : TOP.x;
  let y = 36;
  // behind the block itself (the plate to the lead's last line) the dither goes solid: no lettering of the picture's
  // own (a wall's board) reads between the lines; on the dimmed picture its edge is all but invisible
  const leadSc = ls.length && ls.every((l) => l.length <= 11) ? 3 : 2;
  const leadH = ls.length ? ls.length * (leadSc === 3 ? 27 : 18) - ((leadSc === 3 ? 27 : 18) - 7 * leadSc) : 0;
  const blockH = (name ? 7 * 2 + 10 + 12 : 0) + leadH;
  if (blockH) {
    ctx.fillStyle = P.black;
    ctx.fillRect(x - 4, y - 4, bw + 8, blockH + 8);
  }
  if (name) {
    const w = measureText(name, 2) + 12;
    const h = 7 * 2 + 10;
    if (accent === P.purple) {
      ctx.fillStyle = P.fog;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = P.purple;
      ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    } else {
      ctx.fillStyle = accent;
      ctx.fillRect(x, y, w, h);
    }
    const ink = [P.yellow, P.cyan, P.green, P.cream, P.white, P.silver, P.orange, P.pink].includes(accent) ? P.black : P.white;
    drawText(ctx, name, x + 6, y + 5, { color: ink, scale: 2 });
    y += h + 12;
  }
  // the lead at 3x (≤ 11 characters a line), else 2x (≤ 16), white over the dimmed picture, the accent's bar beside it
  if (ls.length) {
    const sc = ls.every((l) => l.length <= 11) ? 3 : 2;
    const pitch = sc === 3 ? 27 : 18;
    const h = ls.length * pitch - (pitch - 7 * sc);
    ctx.fillStyle = accent === P.purple ? P.fog : accent;
    ctx.fillRect(x, y, sc, h);
    ls.forEach((l, i) => shadowed(ctx, l, x + 10, y + i * pitch, { color: P.white, scale: sc }));
  }
  // the kicker at the foot (FULL PROGRAMME · 17 OCT)
  if (kick) shadowed(ctx, kick, x, H - 20, { color: P.silver });
}
