// Top row of the graphics package: the channel bug (top-left, 13 px high,
// 48 px wide: the doc's limit), the LIVE / REPLAY tag with its static red
// square, the programme name for a few seconds after the open, and the London
// clock (top-right, HH:MM, static colon). Everything wipes in when the
// graphics come on and the bug's glint plays only then.
import { P } from '../palette.js';
import { drawText, measureText } from '../font.js';
import { W, TOP, inkOn, easeOut, easeIn, clamp01, rect, clipStart, clipEnd } from './layout.js';

// The 11x11 brand globe (logo.js GLOBE_S) redrawn for 1x on air: at this size
// two straight white seams read as crosshairs, so the seams are one meridian
// ellipse and the equator in silver, dimmed to a lighter red where the globe
// turns into shadow. R red, D shadow, H highlight, S lit seam, h seam in shadow.
const GLOBE = [
  '...RRRRR...',
  '..RHRSRRR..',
  '.RHRSRSRRR.',
  'RRRSRRRSRRR',
  'RRRSRRRSRRD',
  'SSSSSSSShhD',
  'RRRSRRRhRDD',
  'RRRSRRRhDDD',
  '.RRRSRhDDD.',
  '..RRRhDDD..',
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
const COLOR = { K: P.black, R: P.red, D: P.darkRed, H: P.pink, h: P.pink, W: P.white, S: P.silver, Y: P.yellow, C: P.cream };
// Each colour under the glint (missing = untouched), as in logo.js.
const GLINT = { R: 'H', D: 'R', H: 'W', h: 'W', S: 'W', Y: 'C', C: 'W', K: null };

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

// LIVE / REPLAY sit in the micro face on the wordmark's 5 px cap line (y + 4), so
// the brand reads first; the static 3x3 square shares their centre line.
const TAG_TEXT_X = 10;
const LIVE_W = TAG_TEXT_X + measureText('LIVE', 1, 'micro') + 4;
const REPLAY_W = TAG_TEXT_X + measureText('REPLAY', 1, 'micro') + 4;
const CLOCK_LABEL = 'LONDON';
const LIVE_STYLE = Object.freeze({ color: P.white, font: 'micro' });
const REPLAY_STYLE = Object.freeze({ color: P.yellow, font: 'micro' });
const CLOCK_LABEL_STYLE = Object.freeze({ color: P.fog, font: 'micro' });
const CLOCK_STYLE = Object.freeze({ color: P.white });
const inkStyles = new Map();
const inkStyle = (color) => {
  let st = inkStyles.get(color);
  if (!st) inkStyles.set(color, (st = Object.freeze({ color: inkOn(color) })));
  return st;
};

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
    if (g > 0 && g < 1) {
      clipStart(ctx, TOP.x, y, bugW, h);
      try {
        drawGlint(ctx, TOP.x, y, easeOut(g));
      } finally {
        clipEnd(ctx);
      }
    }
  }

  // LIVE (black plate, static red square) or REPLAY (black plate, yellow text and
  // square: yellow on black, so it never merges with a yellow programme tag)
  let x = TOP.x + BUG.w + 1;
  const tagW = v.replay ? REPLAY_W : LIVE_W;
  const tagP = easeOut((since - 0.08) / 0.3);
  const shown = Math.round(tagW * tagP);
  if (shown > 0) {
    clipStart(ctx, x, y, shown, h);
    try {
      rect(ctx, x, y, tagW, h, P.black);
      rect(ctx, x + 4, y + 5, 3, 3, v.replay ? P.yellow : P.red);
      drawText(ctx, v.replay ? 'REPLAY' : 'LIVE', x + TAG_TEXT_X, y + 4, v.replay ? REPLAY_STYLE : LIVE_STYLE);
    } finally {
      clipEnd(ctx);
    }
  }
  x += tagW + 1;

  // programme name in its accent, for a few seconds after the open (NEWS IN 60: the whole episode)
  if (v.program && v.programIn !== null) {
    const pw = measureText(v.program.title) + 8;
    const pin = easeOut((t - v.programIn) / 0.35);
    const pout = v.programOut === null ? 0 : easeIn((t - v.programOut) / 0.25);
    const vis = Math.round(pw * pin * (1 - pout));
    if (vis > 0) {
      clipStart(ctx, x, y, vis, h);
      try {
        rect(ctx, x, y, pw, h, v.program.color);
        drawText(ctx, v.program.title, x + 4, y + 3, inkStyle(v.program.color));
      } finally {
        clipEnd(ctx);
      }
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
    clipStart(ctx, W - TOP.x - cvis, y, cvis, h);
    try {
      rect(ctx, cx, y, cw, h, P.black);
      drawText(ctx, CLOCK_LABEL, cx + 4, y + 4, CLOCK_LABEL_STYLE);
      drawText(ctx, v.clock, cx + 4 + labelW + 4, y + 3, CLOCK_STYLE);
    } finally {
      clipEnd(ctx);
    }
  }
}

const AD_LABEL = 'ADVERTISEMENT';
const AD_W = measureText(AD_LABEL, 1, 'micro') + 8;
const AD_STYLE = Object.freeze({ color: P.white, font: 'micro' });
const AD_LEFT_STYLE = Object.freeze({ color: P.silver, font: 'micro' });
// the countdown's box is sized for "BACK IN 0:00" (digits change width: the box never jitters)
const AD_LEFT_W = measureText('BACK IN 0:00', 1, 'micro') + 8;

/**
 * The "ADVERTISEMENT" tag over commercials (wipes in with the ad) and, during a break, when the channel is
 * back: "BACK IN 0:42" counting down (owner, 3 Oct: an advert must never be mistaken for a programme).
 * `until` = the break's end on the render clock (seconds), or null.
 */
export function drawAdTag(ctx, t, onAt, until = null) {
  const p = clamp01((t - onAt - 0.2) / 0.3);
  const left = Number.isFinite(until) ? until - t : null;
  const w = AD_W + (left != null ? AD_LEFT_W : 0);
  const vis = Math.round(w * easeOut(p));
  if (vis <= 0) return;
  clipStart(ctx, TOP.x, TOP.y, vis, 9);
  try {
    rect(ctx, TOP.x, TOP.y, AD_W, 9, P.black);
    drawText(ctx, AD_LABEL, TOP.x + 4, TOP.y + 2, AD_STYLE);
    if (left != null) {
      rect(ctx, TOP.x + AD_W, TOP.y, AD_LEFT_W, 9, P.ink);
      const s = Math.max(0, Math.ceil(left));
      drawText(ctx, `BACK IN ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, TOP.x + AD_W + 4, TOP.y + 2, AD_LEFT_STYLE);
    }
  } finally {
    clipEnd(ctx);
  }
}
