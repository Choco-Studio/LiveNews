// WORLD WEATHER's boards for the vertical picture (docs/publishing/vertical.md §3.6). The horizontal boards
// (scenes/weather/boards.js) are two columns 168 px wide and a five-by-three grid 345 px wide: on a 216 px stage they
// are laid out again, one column, in the same language (black plates, colour heads, the weather centre's symbols, the
// temperature on a chip of its colour at 2x, a row wiping in when its place is named and framed while it is said).
//
//   HOT & COLD           HOT over COLD, the three places the voice counts down on each side (3, 2, 1), then the gap
//                        between the two ends once every one is said
//   THE NEXT THREE DAYS  the three days' heads, then each city on a line of its own over its three days (symbol, high
//                        on its chip, low)
//
//   drawVerticalWeatherBoard(ctx, t, board, state, box) -> true when it drew (state: the weather centre's own,
//   scenes/weather/index.js weatherView: { since, spoken: Map(id -> t), hot, hotAt, done, anySaid })
//
// The map shots (the world, a zone, a warning) are composed by the weather centre itself at the stage's size
// (scenes/weather/index.js drawWeatherVertical); only the close-up is a window on the horizontal frame.
import { P } from '../palette.js';
import { drawText, measureText } from '../font.js';
import { tempColor } from '../scenes/weather/field.js';
import { drawIcon } from '../scenes/weather/icons.js';
import { weatherView, drawWeatherVertical } from '../scenes/weather/index.js';
import { groundOf } from './vertical.js';
import { VW, SAFE } from './layout.js';

const easeOut = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : 1 - (1 - u) ** 4);
const clamp01 = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u);
const DARK_INK = new Set([P.yellow, P.cyan, P.green, P.cream, P.white, P.silver, P.orange, P.tan]);
const inkOn = (c) => (DARK_INK.has(c) ? P.black : P.white);

function rect(ctx, x, y, w, h, c) {
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
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
/** The temperature at 2x on a chip of its colour, 16 px high, at least `w` wide; returns its width. */
function chip(ctx, x, y, w, value) {
  const txt = `${value}`;
  const tw = measureText(txt, 2);
  const cw = Math.max(w, tw + 9);
  const bg = tempColor(value);
  const ink = inkOn(bg);
  rect(ctx, x, y, cw, 16, bg);
  const tx = Math.round(x + (cw - tw - 4) / 2);
  drawText(ctx, txt, tx, y + 1, { color: ink, scale: 2 });
  rect(ctx, tx + tw + 1, y + 1, 3, 3, ink);
  return cw;
}
/** A place's name in at most `w` px (whole words, else cut with no dots: the board's own names are short). */
function fit(name, w) {
  let s = String(name || '').toUpperCase();
  while (s && measureText(s) > w) s = s.includes(' ') ? s.slice(0, s.lastIndexOf(' ')) : s.slice(0, -1);
  return s;
}

const M = 8; // the column's margin in the stage
const ROW = 16;
const PITCH = 18;

function hotCold(ctx, t, board, o, box) {
  const t0 = t - o.since;
  const x = box.x + M;
  const w = box.w - 2 * M;
  const sides = [
    ['hot', board.hot, 'HOT', 'HIGHEST HIGHS', P.rust, P.orange],
    ['cold', board.cold, 'COLD', 'LOWEST LOWS', P.navy, P.cyan],
  ];
  const sideH = 11 + 3 + 3 * PITCH;
  const total = 2 * sideH + 6 + 18;
  // one width for every temperature chip on the board (a table's value column: no ragged edge between 41° and 39°)
  const counted = [...(board.hot || []).slice(0, 3), ...(board.cold || []).slice(0, 3)];
  const cw = Math.max(30, ...counted.map((r) => measureText(`${r.value}`, 2) + 9));
  let y = box.y + Math.max(2, Math.round((box.h - total) / 2));
  for (const [side, list, head, sub, plate, accent] of sides) {
    const p = clamp01((t0 - 0.2) / 0.35);
    if (p > 0) {
      const vis = wipe(ctx, x, y, w, 11, plate, p);
      if (vis >= w * 0.6) {
        drawText(ctx, head, x + 4, y + 2, { color: P.white });
        drawText(ctx, sub, x + w - 4, y + 3, { color: side === 'hot' ? P.cream : P.silver, font: 'micro', align: 'right' });
      }
    }
    // the counted three, in rank order (the voice names 3, then 2, then 1: each wipes in as it is named)
    (list || []).slice(0, 3).forEach((row, i) => {
      const ry = y + 14 + i * PITCH;
      const at = o.spoken?.get?.(row.id);
      const said = at != null;
      const lit = said && o.hot === row.id;
      rect(ctx, x, ry, 14, ROW, lit ? accent : P.ink);
      drawText(ctx, `${i + 1}`, x + 7, ry + 5, { color: lit ? P.black : said ? P.silver : P.steel, align: 'center' });
      const q = said ? clamp01((t - at) / 0.3) : 0;
      const vis = wipe(ctx, x + 15, ry, w - 15, ROW, lit ? P.slate : P.black, q);
      if (vis < w - 15) rect(ctx, x + 15 + vis, ry, w - 15 - vis, ROW, P.black);
      if (q < 0.5) return;
      drawText(ctx, fit(row.name, w - 15 - 8 - cw - 22), x + 20, ry + 5, { color: P.white });
      drawIcon(ctx, row.kind || 'cloudy', x + w - cw - 12, ry + 8, t, { phase: (i + 1) * 0.31 });
      chip(ctx, x + w - cw - 1, ry, cw, row.value);
      if (lit && t - (o.hotAt || 0) < 2.6) brackets(ctx, x - 2, ry - 2, x + w + 1, ry + ROW + 1, P.white);
    });
    y += sideH + 6;
  }
  // the gap between the two ends, once every counted place is said
  if (o.done != null && t >= o.done && board.hot?.[0] && board.cold?.[0]) {
    const gap = board.hot[0].value - board.cold[0].value;
    const label = 'BETWEEN THE TWO ENDS';
    const tw = measureText(`${gap}`, 2) + 6;
    const lw = measureText(label, 1, 'micro');
    const gw = tw + lw + 14;
    const gx = x + Math.round((w - gw) / 2);
    const vis = wipe(ctx, gx, y, gw, 16, P.black, clamp01((t - o.done) / 0.35));
    if (vis >= gw * 0.7) {
      drawText(ctx, `${gap}`, gx + 4, y + 1, { color: P.yellow, scale: 2 });
      rect(ctx, gx + 4 + tw - 5, y + 1, 3, 3, P.yellow);
      drawText(ctx, label, gx + tw + 8, y + 6, { color: P.silver, font: 'micro' });
    }
  }
  return true;
}

function outlook(ctx, t, board, o, box) {
  const t0 = t - o.since;
  const days = (board.days || []).slice(0, 3);
  const cities = (board.cities || []).slice(0, 5);
  const x = box.x + M;
  const w = box.w - 2 * M;
  const cell = Math.floor((w - 2) / 3);
  const block = 11 + ROW + 3;
  const total = 13 + cities.length * block;
  // one width for every high's chip in the grid (19° as wide as 22°: the columns line up)
  const cw = Math.max(26, ...cities.flatMap((c) => (c.days || []).slice(0, 3).map((d) => measureText(`${d.max}`, 2) + 9)));
  let y = box.y + Math.max(2, Math.round((box.h - total) / 2));
  // the day heads
  days.forEach((d, j) => {
    const cx = x + j * (cell + 1);
    const vis = wipe(ctx, cx, y, cell, 11, P.navy, clamp01((t0 - 0.2 - j * 0.06) / 0.35));
    if (vis >= cell * 0.6) drawText(ctx, String(d.name || '').toUpperCase(), cx + cell / 2, y + 2, { color: P.white, align: 'center' });
  });
  y += 13;
  cities.forEach((c, i) => {
    const p = clamp01((t0 - 0.4 - i * 0.08) / 0.3);
    if (p > 0) {
      const said = o.spoken?.has?.(c.id);
      const lit = o.hot === c.id;
      // the city's name over its three days; lit (a slate band, a cyan edge) while it is said
      const vis = wipe(ctx, x, y, w, 11 + ROW, lit ? P.slate : P.black, p);
      if (vis >= w * 0.5) {
        rect(ctx, x, y, 2, 11 + ROW, lit ? P.cyan : said ? P.blue : P.ink);
        drawText(ctx, fit(c.name, w - 10), x + 6, y + 2, { color: lit || !o.anySaid ? P.white : said ? P.silver : P.fog });
        (c.days || []).slice(0, 3).forEach((d, j) => {
          const cx = x + 2 + j * (cell + 1);
          const q = clamp01((t0 - 0.5 - i * 0.08 - j * 0.05) / 0.3);
          if (q < 0.7) return;
          drawIcon(ctx, d.kind || 'cloudy', cx + 8, y + 11 + 8, t, { phase: i * 0.43 + j * 0.29 });
          chip(ctx, cx + 17, y + 11, cw, d.max);
          const lo = `${d.min}`;
          const lx = cx + 17 + cw + 3;
          if (lx + measureText(lo) + 3 <= cx + cell) {
            drawText(ctx, lo, lx, y + 11 + 5, { color: lit ? P.silver : P.fog });
            rect(ctx, lx + measureText(lo) + 1, y + 11 + 5, 2, 2, lit ? P.silver : P.fog);
          }
        });
        if (lit && t - (o.hotAt || 0) < 2.6) brackets(ctx, x - 2, y - 2, x + w + 1, y + 11 + ROW + 1, P.white);
      }
    }
    y += block;
  });
  return true;
}

export function drawVerticalWeatherBoard(ctx, t, board, state, box) {
  if (!board || !state) return false;
  ctx.save();
  try {
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();
    if (board.kind === 'hotcold') return hotCold(ctx, t, board, state, box);
    if (board.kind === 'outlook') return outlook(ctx, t, board, state, box);
    return false;
  } finally {
    ctx.restore();
  }
}

/**
 * Give the vertical compositor its weather stage: the board set again when one is up, on the glass over the weather
 * centre's wall (clip/vset.js); the world, a zone or a warning composed again at the stage's size
 * (scenes/weather/index.js drawWeatherVertical: the map the stage's full width, every word in the safe column), framed
 * as a window; the close-up, the horizontal frame's full height centred on the presenter, standing on the centre's LED
 * line (weatherCloseup, drawn under every band like a studio single).
 */
export function installWeather(comp) {
  comp.weather = (t, scene, box) => {
    const v = weatherView(t);
    if (!v) return false;
    if (v.board && v.state) {
      if (typeof comp.glassPanel === 'function') comp.glassPanel(t);
      else comp.ctx.drawImage(groundOf(box.w, box.h), box.x, box.y);
      return drawVerticalWeatherBoard(comp.ctx, t, v.board, v.state, box);
    }
    if (drawWeatherVertical(comp.ctx, t, { x: 0, y: box.y, w: VW, h: box.h }, { x0: SAFE.x, x1: SAFE.right })) {
      comp.windowed = { y0: box.y, y1: box.y + box.h };
      return true;
    }
    // (the close-up: drawn under the bands by weatherCloseup)
    if (comp.tall) return true;
    if (Number.isFinite(v.presenterX)) {
      comp.middle(scene, v.presenterX);
      return true;
    }
    return false;
  };
  comp.weatherCloseup = (t) => {
    const v = weatherView(t);
    if (!v || v.board || v.shot !== 'mcu' || !Number.isFinite(v.presenterX) || typeof comp.tallWindow !== 'function') return null;
    return comp.tallWindow(t, v.presenterX);
  };
}
