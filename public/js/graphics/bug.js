// Top row of the graphics package: the channel bug (top-left, 13 px high,
// 48 px wide: the doc's limit), the LIVE / REPLAY tag with its static red
// square, the programme name for a few seconds after the open, and the London
// clock (top-right, HH:MM, static colon). Everything wipes in when the
// graphics come on and the bug's glint plays only then.
import { P } from '../palette.js';
import { drawText, measureText } from '../font.js';
import { W, TOP, inkOn, easeOut, easeIn, clamp01, rect, clipped } from './layout.js';

// The 11x11 brand globe (logo.js GLOBE_S) redrawn for 1x on air: at this size
// white seams read as crosshairs, so the equator is silver and the meridian
// lens a lighter red. R red, D shadow, H highlight/seam, S equator.
const GLOBE = [
  '...RRRRR...',
  '..RHRRRRR..',
  '.RHHRRRHRR.',
  'RRHRRRRRHRR',
  'RRHRRRRRHRD',
  'SSSSSSSSSSD',
  'RRHRRRRRHDD',
  'RRHRRRRRHDD',
  '.RRHRRRHDD.',
  '..RRRRDDD..',
  '...DDDDD...',
];
// Hand-set 5 px wordmark (a logo, not the micro text face): round G and O.
const WORD = {
  G: ['.###', '#...', '#.##', '#..#', '.##.'],
  L: ['#..', '#..', '#..', '#..', '###'],
  O: ['.##.', '#..#', '#..#', '#..#', '.##.'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  I: ['#', '#', '#', '#', '#'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  2: ['##.', '..#', '.#.', '#..', '###'],
  4: ['#.#', '#.#', '###', '..#', '..#'],
};
const COLOR = { K: P.black, R: P.red, D: P.darkRed, H: P.pink, W: P.white, S: P.silver, Y: P.yellow, C: P.cream };
// Each colour under the glint (missing = untouched), as in logo.js.
const GLINT = { R: 'H', D: 'R', H: 'W', S: 'W', Y: 'C', C: 'W', K: null };

/** Paint `text` from WORD into px (keys) at x, top row y; returns the x after it. */
function paintWord(px, text, x, y, key) {
  for (const ch of text) {
    const rows = WORD[ch];
    rows.forEach((row, dy) => [...row].forEach((c, dx) => c === '#' && (px[y + dy][x + dx] = key)));
    x += rows[0].length + 1;
  }
  return x - 1;
}

/** Build the bug as rows of colour keys: black plate, globe + bit, GLOBIT, red "24" tag. */
function buildBug() {
  const h = TOP.h;
  const textY = 4; // 5 px caps centred in 13 rows
  const textX = 13;
  const textEnd = textX + [...'GLOBIT'].reduce((w, ch) => w + WORD[ch][0].length + 1, -1);
  const tagX = textEnd + 2;
  const tagW = 9;
  const w = tagX + tagW + 1;
  const px = Array.from({ length: h }, () => new Array(w).fill('K'));
  GLOBE.forEach((row, y) => [...row].forEach((k, x) => k !== '.' && (px[y + 1][x] = k)));
  // the yellow "bit" popping off the globe's top-right edge
  for (const [x, y] of [[11, 1], [12, 1], [11, 2], [12, 2]]) px[y][x] = 'Y';
  paintWord(px, 'GLOBIT', textX, textY, 'W');
  for (let y = 1; y < h - 1; y++) for (let x = tagX; x < tagX + tagW; x++) px[y][x] = y === h - 2 ? 'D' : 'R';
  paintWord(px, '24', tagX + 1, textY, 'W');
  return { w, h, px };
}

const BUG = buildBug();
export const BUG_W = BUG.w;

let bugCanvas = null;
function bugSprite() {
  if (bugCanvas) return bugCanvas;
  bugCanvas = document.createElement('canvas');
  bugCanvas.width = BUG.w;
  bugCanvas.height = BUG.h;
  const c = bugCanvas.getContext('2d');
  BUG.px.forEach((row, y) => row.forEach((k, x) => {
    c.fillStyle = COLOR[k];
    c.fillRect(x, y, 1, 1);
  }));
  return bugCanvas;
}

/** One diagonal glint across the bug (0 <= p < 1), in whole pixels. */
function drawGlint(ctx, x0, y0, p) {
  const span = BUG.w + BUG.h + 6;
  const head = Math.floor(p * span) - 3;
  for (const off of [0, 1, 3]) {
    const d = head - off;
    for (let y = 0; y < BUG.h; y++) {
      const x = d - y;
      if (x < 0 || x >= BUG.w) continue;
      const to = GLINT[BUG.px[y][x]];
      if (!to) continue;
      ctx.fillStyle = COLOR[to];
      ctx.fillRect(x0 + x, y0 + y, 1, 1);
    }
  }
}

const LIVE_W = 4 + 3 + 3 + measureText('LIVE') + 4;
const REPLAY_W = 4 + 3 + 3 + measureText('REPLAY') + 4;
const CLOCK_LABEL = 'LONDON';

/**
 * Draw the top row. `v` = { onAt, replay, program: {title, color} | null,
 * programIn, programOut, clock: 'HH:MM' } where onAt is when the graphics came
 * on (the glint plays once, just after) and programIn/Out are the programme tag's wipe times.
 */
export function drawTopRow(ctx, t, v) {
  const y = TOP.y;
  const h = TOP.h;
  const since = t - v.onAt;

  // bug: wipes in left to right over 0.3 s
  const bugP = easeOut(since / 0.3);
  const bugW = Math.round(BUG.w * bugP);
  if (bugW > 0) {
    ctx.drawImage(bugSprite(), 0, 0, bugW, h, TOP.x, y, bugW, h);
    const g = (since - 0.6) / 0.9;
    if (g > 0 && g < 1) clipped(ctx, TOP.x, y, bugW, h, () => drawGlint(ctx, TOP.x, y, easeOut(g)));
  }

  // LIVE (black plate, static red square) or REPLAY (black plate, yellow text and
  // square: yellow on black, so it never merges with a yellow programme tag)
  let x = TOP.x + BUG.w + 1;
  const tagW = v.replay ? REPLAY_W : LIVE_W;
  const tagP = easeOut((since - 0.08) / 0.3);
  const shown = Math.round(tagW * tagP);
  if (shown > 0) {
    clipped(ctx, x, y, shown, h, () => {
      if (v.replay) {
        rect(ctx, x, y, tagW, h, P.black);
        rect(ctx, x + 4, y + 5, 3, 3, P.yellow);
        drawText(ctx, 'REPLAY', x + 10, y + 3, { color: P.yellow });
      } else {
        rect(ctx, x, y, tagW, h, P.black);
        rect(ctx, x + 4, y + 5, 3, 3, P.red);
        drawText(ctx, 'LIVE', x + 10, y + 3, { color: P.white });
      }
    });
  }
  x += tagW + 1;

  // programme name in its accent, for a few seconds after the open
  if (v.program && v.programIn !== null) {
    const pw = measureText(v.program.title) + 8;
    const pin = easeOut((t - v.programIn) / 0.35);
    const pout = v.programOut === null ? 0 : easeIn((t - v.programOut) / 0.25);
    const vis = Math.round(pw * pin * (1 - pout));
    if (vis > 0) {
      clipped(ctx, x, y, vis, h, () => {
        rect(ctx, x, y, pw, h, v.program.color);
        drawText(ctx, v.program.title, x + 4, y + 3, { color: inkOn(v.program.color) });
      });
    }
  }

  // clock: wipes in right to left
  const timeW = measureText(v.clock);
  const labelW = measureText(CLOCK_LABEL, 1, 'micro');
  const cw = 4 + labelW + 4 + timeW + 4;
  const cx = W - TOP.x - cw;
  const cp = easeOut((since - 0.05) / 0.3);
  const cvis = Math.round(cw * cp);
  if (cvis > 0) {
    clipped(ctx, W - TOP.x - cvis, y, cvis, h, () => {
      rect(ctx, cx, y, cw, h, P.black);
      drawText(ctx, CLOCK_LABEL, cx + 4, y + 4, { color: P.fog, font: 'micro' });
      drawText(ctx, v.clock, cx + 4 + labelW + 4, y + 3, { color: P.white });
    });
  }
}

const AD_LABEL = 'ADVERTISEMENT';
const AD_W = measureText(AD_LABEL, 1, 'micro') + 8;

/** Small, quiet "ADVERTISEMENT" tag over commercials (fades in with the ad). */
export function drawAdTag(ctx, t, onAt) {
  const p = clamp01((t - onAt - 0.2) / 0.3);
  const vis = Math.round(AD_W * easeOut(p));
  if (vis <= 0) return;
  clipped(ctx, TOP.x, TOP.y, vis, 9, () => {
    rect(ctx, TOP.x, TOP.y, AD_W, 9, P.black);
    drawText(ctx, AD_LABEL, TOP.x + 4, TOP.y + 2, { color: P.silver, font: 'micro' });
  });
}
