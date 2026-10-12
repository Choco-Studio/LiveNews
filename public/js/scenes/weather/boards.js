// WORLD WEATHER's full-frame boards (round 3): HOT & COLD and THE NEXT THREE DAYS, in the channel's card language
// (cards.js: black plates on the graded field, a slate top rule, micro fog labels, 2x white figures, one accent
// per element, eased wipes, nothing counts up or types on) with the weather centre's chips and symbols.
//
//   drawHotCold(ctx, t, board, o)    two columns, HOT (the day's highs) and COLD (the lows), five rows each: rank,
//                                    place, symbol, the temperature on a chip of its colour. The voice counts down
//                                    3, 2, 1 on each side: a row wipes in when its place is named (o.spoken: id ->
//                                    time named) and is framed while it is being said (o.hot); the places not said
//                                    (4, 5) wait dimmed and light up with the gap between the two ends at the close
//   drawOutlook(ctx, t, board, o)    five cities x three days: the weekday, the symbol (animated), the high on its
//                                    chip and the low; the city being said is framed and its row lit
//
// o: { since (the board's first frame), spoken: Map(id -> t), hot, hotAt, done (t when every place is said) }.
// Both keep y 26..166 (the top row above, the captions and the ticker below).
import { P } from '../../palette.js';
import { drawText, measureText } from '../../font.js';
import { tempColor } from './field.js';
import { drawIcon } from './icons.js';

const W = 384;
const X0 = 19, X1 = W - 19;
const easeOut = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : 1 - (1 - u) ** 4);
const clamp01 = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u);
const DARK_INK = new Set([P.yellow, P.cyan, P.green, P.cream, P.white, P.silver, P.orange, P.tan]);
const inkOn = (c) => (DARK_INK.has(c) ? P.black : P.white);

function rect(ctx, x, y, w, h, c) {
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** A plate that wipes in from the left over `dur` (p: 0..1 of its width shown). */
function wipe(ctx, x, y, w, h, c, p) {
  const vis = Math.round(w * easeOut(p));
  rect(ctx, x, y, vis, h, c);
  return vis;
}

function brackets(ctx, x0, y0, x1, y1, color) {
  ctx.fillStyle = color;
  const L = 3;
  for (const [x, y, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
    ctx.fillRect(dx > 0 ? x : x - L + 1, y, L, 1);
    ctx.fillRect(x, dy > 0 ? y : y - L + 1, 1, L);
  }
}

/** A temperature at 2x on a chip of its colour (w px wide, 16 high); dim: the chip waits in slate. */
function tempChip(ctx, x, y, w, value, dim = false) {
  const bg = dim ? P.ink : tempColor(value);
  rect(ctx, x, y, w, 16, bg);
  const txt = `${value}`;
  const ink = dim ? P.steel : inkOn(bg);
  const tw = measureText(txt, 2);
  const tx = Math.round(x + (w - tw - 4) / 2);
  drawText(ctx, txt, tx, y + 1, { color: ink, scale: 2 });
  rect(ctx, tx + tw + 1, y + 1, 3, 3, ink); // the degree mark
  if (!dim) rect(ctx, x, y + 15, w, 1, bg === P.darkRed || bg === P.purple ? P.black : P.black);
}

/** The board's title: 2x white, a short accent rule under it, a micro line on the right. */
function title(ctx, t0, text, sub, accent) {
  const p = clamp01(t0 / 0.35);
  if (p <= 0) return;
  const tw = measureText(text, 2);
  ctx.save();
  try {
    ctx.beginPath();
    ctx.rect(X0, 26, Math.round((tw + 8) * easeOut(p)), 20);
    ctx.clip();
    drawText(ctx, text, X0, 28, { color: P.white, scale: 2, shadow: P.black });
  } finally {
    ctx.restore();
  }
  rect(ctx, X0, 44, Math.round(Math.min(tw, 46) * easeOut((t0 - 0.15) / 0.3)), 2, accent);
  if (sub && t0 > 0.3) {
    const sw = measureText(sub, 1, 'micro');
    rect(ctx, X1 - sw - 6, 33, sw + 6, 9, P.black);
    drawText(ctx, sub, X1 - sw - 3, 35, { color: P.fog, font: 'micro' });
  }
}

// ------------------------------------------------------------------------------------------- HOT & COLD
const HC = { y0: 64, pitch: 20, rowH: 18, colW: 168, gap: 10, headY: 50 };

/** The rows of a side: ranks 1..5, the order the voice counts them (3, 2, 1) and which are said. */
export function hotColdRows(list) {
  return (list || []).slice(0, 5).map((p, i) => ({ ...p, rank: i + 1, said: i < 3 }));
}

function hcRow(ctx, t, x, y, row, side, state) {
  const { spoken, hot, hotAt, done, reveal } = state;
  const w = HC.colW, h = HC.rowH;
  const accent = side === 'hot' ? P.orange : P.cyan;
  const at = spoken.get(row.id);
  // a counted row wipes in when it is named; the others wait dimmed from the start, lit at the close
  const said = row.said && at != null;
  const p = said ? clamp01((t - at) / 0.3) : row.said ? 0 : clamp01((t - reveal) / 0.3);
  const lit = said || (!row.said && done != null && t >= done);
  const kLit = !row.said && done != null ? clamp01((t - done) / 0.3) : 1;
  // the rank's slot is always there (the countdown's empty places)
  rect(ctx, x, y, 14, h, said && hot === row.id ? accent : P.ink);
  drawText(ctx, `${row.rank}`, x + 7, y + 6, { color: said && hot === row.id ? P.black : lit ? P.silver : P.steel, align: 'center' });
  if (p <= 0) {
    rect(ctx, x + 15, y, w - 15, h, P.black);
    return;
  }
  const vis = wipe(ctx, x + 15, y, w - 15, h, hot === row.id && said ? P.slate : P.black, p);
  if (vis < w - 15) rect(ctx, x + 15 + vis, y, w - 15 - vis, h, P.black);
  if (p < 0.5) return;
  const dim = !lit || kLit < 1;
  const name = String(row.name || '').toUpperCase();
  drawText(ctx, name, x + 20, y + 6, { color: dim ? P.steel : P.white });
  drawIcon(ctx, row.kind || 'cloudy', x + w - 46, y + 9, t, { phase: row.rank * 0.31 });
  tempChip(ctx, x + w - 34, y + 1, 32, row.value, dim);
  if (said && hot === row.id && t - hotAt < 2.6) brackets(ctx, x - 2, y - 2, x + w + 1, y + h + 1, P.white);
}

export function drawHotCold(ctx, t, board, o) {
  const t0 = t - o.since;
  title(ctx, t0, 'HOT & COLD', 'TODAY ROUND THE PLANET', P.orange);
  const sides = [['hot', board.hot, X0, 'HOT', 'HIGHEST HIGHS', P.rust], ['cold', board.cold, X0 + HC.colW + HC.gap, 'COLD', 'LOWEST LOWS', P.navy]];
  const state = { ...o, reveal: o.since + 0.6 };
  for (const [side, list, x, head, sub, plate] of sides) {
    const p = clamp01((t0 - 0.2) / 0.35);
    if (p <= 0) continue;
    // the column's head: its colour plate, the word, what it ranks
    const vis = wipe(ctx, x, HC.headY, HC.colW, 11, plate, p);
    if (vis >= HC.colW * 0.6) {
      drawText(ctx, head, x + 4, HC.headY + 2, { color: P.white });
      drawText(ctx, sub, x + HC.colW - 4, HC.headY + 3, { color: side === 'hot' ? P.cream : P.silver, font: 'micro', align: 'right' });
    }
    const rows = hotColdRows(list);
    rows.forEach((row, i) => {
      const y = HC.y0 + i * HC.pitch;
      if (t0 < 0.35 + i * 0.06) return;
      hcRow(ctx, t, x, y, row, side, state);
    });
  }
  // the gap between the two ends, once every counted place is said
  if (o.done != null && t >= o.done && board.hot?.[0] && board.cold?.[0]) {
    const gap = board.hot[0].value - board.cold[0].value;
    const p = clamp01((t - o.done) / 0.35);
    const label = 'BETWEEN THE TWO ENDS';
    const tw = measureText(`${gap}`, 2) + 6, lw = measureText(label, 1, 'micro');
    const w = tw + lw + 14;
    const x = X1 - w, y = 30;
    const vis = wipe(ctx, x, y, w, 14, P.black, p);
    if (vis >= w * 0.7) {
      drawText(ctx, `${gap}`, x + 4, y + 1, { color: P.yellow, scale: 2 });
      rect(ctx, x + 4 + tw - 5, y + 1, 3, 3, P.yellow);
      drawText(ctx, label, x + tw + 8, y + 5, { color: P.silver, font: 'micro' });
    }
  }
}

// ------------------------------------------------------------------------------------------- the next three days
const OL = { headY: 50, y0: 62, pitch: 20, rowH: 18, nameW: 104, colW: 80, gap: 1 };

export function drawOutlook(ctx, t, board, o) {
  const t0 = t - o.since;
  title(ctx, t0, 'THE NEXT THREE DAYS', 'HIGH  LOW  °C', P.blue);
  const days = (board.days || []).slice(0, 3);
  const cities = (board.cities || []).slice(0, 5);
  const cx0 = X0 + OL.nameW + 2;
  // the day heads
  const ph = clamp01((t0 - 0.2) / 0.35);
  if (ph > 0) {
    days.forEach((d, j) => {
      const x = cx0 + j * (OL.colW + OL.gap);
      const vis = wipe(ctx, x, OL.headY, OL.colW, 11, P.navy, clamp01((t0 - 0.2 - j * 0.06) / 0.35));
      if (vis >= OL.colW * 0.6) drawText(ctx, d.name || '', x + OL.colW / 2, OL.headY + 2, { color: P.white, align: 'center' });
    });
  }
  cities.forEach((c, i) => {
    const y = OL.y0 + i * OL.pitch;
    const p = clamp01((t0 - 0.4 - i * 0.08) / 0.3);
    if (p <= 0) return;
    const said = o.spoken.has(c.id);
    const lit = o.hot === c.id;
    // the city's plate (lit while it is said), an accent edge once it has been
    const vis = wipe(ctx, X0, y, OL.nameW, OL.rowH, lit ? P.slate : P.black, p);
    if (vis < OL.nameW * 0.5) return;
    rect(ctx, X0, y, 3, OL.rowH, lit ? P.cyan : said ? P.blue : P.ink);
    drawText(ctx, String(c.name || '').toUpperCase(), X0 + 8, y + 6, { color: lit || !o.anySaid ? P.white : said ? P.silver : P.fog });
    (c.days || []).slice(0, 3).forEach((d, j) => {
      const x = cx0 + j * (OL.colW + OL.gap);
      const q = clamp01((t0 - 0.5 - i * 0.08 - j * 0.05) / 0.3);
      const v2 = wipe(ctx, x, y, OL.colW, OL.rowH, lit ? P.slate : P.black, q);
      if (v2 < OL.colW * 0.7) return;
      drawIcon(ctx, d.kind || 'cloudy', x + 10, y + 9, t, { phase: i * 0.43 + j * 0.29 });
      tempChip(ctx, x + 20, y + 1, 32, d.max);
      const lo = `${d.min}`;
      drawText(ctx, lo, x + 56, y + 6, { color: lit ? P.silver : P.fog });
      rect(ctx, x + 56 + measureText(lo) + 1, y + 6, 2, 2, lit ? P.silver : P.fog);
    });
    if (lit && t - o.hotAt < 2.6) brackets(ctx, X0 - 2, y - 2, cx0 + 3 * OL.colW + 2 * OL.gap + 1, y + OL.rowH + 1, P.white);
  });
}
