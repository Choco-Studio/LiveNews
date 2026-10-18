// PAY ATTENTION's graphics (docs/programmes/pay-attention.md §6): the quiz's boards, in the channel's board package
// (a black panel wiped in from the left, a slate top line, a micro kicker, text rising into place, nothing counted up)
// and the quiz's own look:
//   accent      P.purple, for fills only: always white type on it and a 1 px P.fog rim (purple alone on P.black is
//               2.0:1 and would vanish); never TECH BYTES' purple-and-magenta rings nor COSMOS's purple glow
//   lit         P.yellow (black type on it, 9.7:1): a player's lock-in lamp, the right tile, a right answer
//   dimmed      P.slate: the wrong tiles, a lamp that was wrong
//   players     told apart by a SHAPE (seat A a circle, seat B a square) and their name; never by colour alone, never
//               by a letter (the tiles are lettered A, B and C)
//   type        one size for each role on a board, never shrunk to fit: display 2x (the frame: the board's fixed
//               question), body 1x (tiles, headlines, letters, names, guesses), the micro face for kickers, labels and
//               credits. A text that does not fit its box is refused by the desk (quizFits), never cut or shrunk
//   safe area   every board inside x 13..371, y 28..134: clear of the channel's top row and of the captions
//
// The boards (each a pure function of the board's own clock `dt`, in seconds, and the times the director passes):
//   drawQuestionBoard   PICTURE THIS: the frame at 2x, the picture beside three lettered tiles (1x, up to three lines),
//                       sharpening in four steps (8, 16, 32, 64 blocks across) on the countdown's beats, the countdown
//                       bar, the lock-in marks, the reveal (the right tile gold, the others slate, the credit line)
//   drawLettersBoard    LETTER BY LETTER (and the tie-break): the headline as letter tiles, the buzzer lamps
//   drawWhereBoard      WHERE IN THE WORLD?: the masked headline, three pins on the world map, the zoom to the right one
//   drawHowManyBoard    HOW MANY?: the masked sentence, each guess labelled GUESS, the figure lit at the reveal
//   drawTodayBoard      TODAY OR NOT TODAY?: the headline card, two lamps a player, the stamp of the day, the tally
//   drawScoresStrip     the scores (a board, or a one-line strip over the studio)
//   drawDoubleCard      DOUBLE OR NOTHING: the desks offered, the pick, the double points
//   drawTableBoard      the week's table
//   drawRoundCard       a round's title and its scoring
import { P } from '../palette.js';
import { drawText, measureText } from '../font.js';
import { clamp, seg, easeOutQuint, easeInOutSine, clipRect, balanceLines, textW } from '../gfx/index.js';
import { pixelate } from '../pixelate.js';
import { drawWorldMap } from './worldmap.js';
import { SAFE, CX, CR, CW, LINE, SPACE, COL_W, TILE, LT, HEAD, SENT, CARD, layoutText, tileLayout, lettersLayout, lettersShown } from './quiz-fit.js';
import { drawFileCredit } from '../graphics/remote.js';
import { drawPreviewTag } from '../graphics/picture.js';

export { SAFE, TILE, TILE_TEXT_W, layoutText, tileLayout, fitsTile, lettersLayout, fitsLetters, lettersShown, revealPieces, fitsWhere, fitsSentence, fitsToday, quizFits } from './quiz-fit.js';

const PX = SAFE.left;
const PW = SAFE.right - SAFE.left; // 358
const PY = SAFE.top;
const PH = SAFE.bottom - SAFE.top; // 106

// every question board's header: the micro kicker's caps on rows 31..35, the frame's (2x) on rows 38..51
const KICKER_Y = PY + 3;
const FRAME_Y = PY + 10;

/** The bed runs at 112 BPM; the countdown ticks on its half notes (pay-attention.md §6), one cell of the bar each. */
export const HALF_NOTE = 120 / 112;

const S = {
  white: { color: P.white },
  silver: { color: P.silver },
  fog: { color: P.fog },
  black: { color: P.black },
  white2: { color: P.white, scale: 2 },
  white3: { color: P.white, scale: 3 },
  silver3: { color: P.silver, scale: 3 },
  yellow3: { color: P.yellow, scale: 3 },
  microFog: { color: P.fog, font: 'micro' },
  microWhite: { color: P.white, font: 'micro' },
  microSilver: { color: P.silver, font: 'micro' },
};
const STYLE = new Map();
/** A 1x style of a colour (allocated once: drawText takes an options object every call). */
const styleOf = (color) => STYLE.get(color) || (STYLE.set(color, { color }), STYLE.get(color));

/** A small layout cache (one entry per board content; rebuilt when the content changes). */
function cache(limit = 80) {
  const m = new Map();
  return (key, build) => {
    let v = m.get(key);
    if (v) return v;
    v = build();
    if (m.size >= limit) m.delete(m.keys().next().value);
    m.set(key, v);
    return v;
  };
}

const ease = (dt, at, dur) => easeOutQuint(seg(dt, at, dur));
const up = (s) => String(s ?? '').toUpperCase();

/** Text that rises into place inside a mask at its own rows (p: 0..1). */
function rise(ctx, text, x, y, p, style) {
  if (p <= 0 || !text) return;
  const scale = style.scale || 1;
  const h = (style.font === 'micro' ? 5 : 7) * scale;
  const off = Math.round((1 - easeOutQuint(p)) * (h + 3));
  ctx.save();
  try {
    clipRect(ctx, 0, y - 3 * scale, 384, h + 3 * scale + 1);
    drawText(ctx, text, x, y + off, style);
  } finally {
    ctx.restore();
  }
}

/** The board's panel: black, wiped in from the left over 0.3 s, a slate top line. Leaves the clip set (caller saves). */
function panel(ctx, dt, x, y, w, h) {
  const vis = Math.round(w * ease(dt, 0, 0.3));
  if (vis <= 0) return false;
  clipRect(ctx, x, y, vis, h);
  ctx.fillStyle = P.black;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = P.slate;
  ctx.fillRect(x, y, w, 1);
  return true;
}

/** A purple fill with its fog rim (the accent is never a bare fill on a dark ground). */
function purpleBox(ctx, x, y, w, h) {
  ctx.fillStyle = P.fog;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = P.purple;
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
}

/** A board vertically centred on the safe area's middle, never outside it. */
const place = (h) => clamp(Math.round(81 - h / 2), SAFE.top, SAFE.bottom - h);

// ---------------------------------------------------------------- the players' shapes

// Seat A is a circle, seat B a square: the same mass (37 and 36 pixels) and different silhouettes at 1x, on a 7 x 7
// cell level with a 1x capital (the square sits on the caps' baseline). Never a letter: the tiles are A, B and C.
const CIRCLE = [[2, 3], [1, 5], [0, 7], [0, 7], [0, 7], [1, 5], [2, 3]]; // per row: first column, run length
const SQUARE = [null, [0, 6], [0, 6], [0, 6], [0, 6], [0, 6], [0, 6]];
export const SEAT_SHAPES = Object.freeze({ A: 'circle', B: 'square' });

/** The seat's shape on its 7 x 7 cell (top-left x, y: the rows of a 1x capital drawn at y). */
export function drawSeat(ctx, seat, x, y, color) {
  const rows = seat === 'B' ? SQUARE : CIRCLE;
  ctx.fillStyle = color;
  for (let r = 0; r < 7; r++) {
    const run = rows[r];
    if (run) ctx.fillRect(x + run[0], y + r, run[1], 1);
  }
}

const NAME_MAX = 32; // the widest name a mark holds ("UNIT-8")
const MARK_W = 7 + 2 + NAME_MAX;
const markName = (name) => {
  let n = up(name);
  while (n.length > 2 && textW(n, 1) > NAME_MAX) n = n.slice(0, -1);
  return n;
};
/**
 * A player's mark: the shape and the name. `state`: 'lit' (their lamp: a gold shape, a white name), 'off' (an unlit
 * lamp: a slate shape, a fog name) or 'id' (who they are, on a strip or a table: both white).
 */
export function drawMark(ctx, seat, name, x, y, state = 'lit') {
  const st = state === true ? 'lit' : state === false ? 'off' : state;
  drawSeat(ctx, seat, x, y, st === 'lit' ? P.yellow : st === 'off' ? P.slate : P.white);
  const n = markName(name);
  drawText(ctx, n, x + 9, y, st === 'off' ? S.fog : S.white);
  return 9 + textW(n, 1);
}
const markWidth = (name) => 9 + textW(markName(name), 1);

/** A mark wiped on from the left (p 0..1; nothing under a whole pixel: never a one-pixel sliver of the shape). */
function wipeMark(ctx, seat, name, x, y, p, lit = 'lit') {
  const vis = Math.round(MARK_W * p);
  if (vis < 1) return;
  ctx.save();
  try {
    clipRect(ctx, x, y - 1, vis, 9);
    drawMark(ctx, seat, name, x, y, lit);
  } finally {
    ctx.restore();
  }
}

// (a board drawn without its players shows the shapes alone: never a made-up name)
const nameOf = (players, seat) => (players || []).find((p) => p.seat === seat)?.name || '';

/** A mask: a solid purple block in its fog rim, one row above and below the caps (never a glyph box). */
function maskBlock(ctx, x, y, w) {
  ctx.fillStyle = P.fog;
  ctx.fillRect(x, y - 1, w, 9);
  ctx.fillStyle = P.purple;
  ctx.fillRect(x + 1, y, w - 2, 7);
}

/**
 * A line's drawing, worked out once with its layout: runs of plain words as one string each (one cached text image a
 * run, not a word), masks, revealed words, and the gold between the words of one revealed span.
 */
function opsOf(line) {
  const ops = [];
  let cx = 0;
  let run = null;
  const flush = () => {
    if (run) ops.push(run);
    run = null;
  };
  line.words.forEach((wd, i) => {
    if (i) {
      // (a revealed span of several words is one gold box: the space between them is lit too)
      if (wd.segs[0].k === 'h' && line.words[i - 1].segs.at(-1).k === 'h') ops.push({ k: 'g', x: cx, w: SPACE });
      cx += SPACE;
    }
    if (wd.segs.length === 1 && wd.segs[0].k === 't') {
      if (run) run.s += ` ${wd.segs[0].s}`;
      else run = { k: 't', s: wd.segs[0].s, x: cx };
      cx += wd.w;
      return;
    }
    flush();
    wd.segs.forEach((sg, j) => {
      if (j) cx += 1;
      ops.push({ k: sg.k, s: sg.s, x: cx, w: sg.w, padL: sg.padL || 0 });
      cx += sg.w;
    });
  });
  flush();
  return ops;
}

/** One laid-out line at (x, y): text in `color`, masks as blocks, revealed words lit (gold, black type). */
function drawLine(ctx, line, x, y, color) {
  const st = styleOf(color);
  for (const op of line.ops || (line.ops = opsOf(line))) {
    if (op.k === 't') drawText(ctx, op.s, x + op.x, y, st);
    else if (op.k === 'm') maskBlock(ctx, x + op.x, y, op.w);
    else if (op.k === 'g') {
      ctx.fillStyle = P.yellow;
      ctx.fillRect(x + op.x, y - 2, op.w, 11);
    } else {
      ctx.fillStyle = P.yellow;
      ctx.fillRect(x + op.x, y - 2, op.w, 11);
      drawText(ctx, op.s, x + op.x + op.padL, y, S.black);
    }
  }
}

/** Lines rising into place one after another from `at` (align 'left' at x, or 'center' on x). */
function drawLines(ctx, L, x, y, color, dt = 99, at = -1, align = 'left') {
  L.lines.forEach((line, i) => {
    const p = seg(dt, at + i * 0.06, 0.32);
    if (p <= 0) return;
    const lx = align === 'center' ? Math.round(x - line.w / 2) : x;
    const ly = y + i * LINE;
    const off = Math.round((1 - easeOutQuint(p)) * 10);
    ctx.save();
    try {
      clipRect(ctx, lx - 2, ly - 3, line.w + 4, 12);
      drawLine(ctx, line, lx, ly + off, color);
    } finally {
      ctx.restore();
    }
  });
}

// ---------------------------------------------------------------- the credit line

// The programmes' titles as config/channel.json gives them (the director passes its own: `titles`)
const TITLES = { 'world-now': 'WORLD NOW', 'tech-bytes': 'TECH BYTES', cosmos: 'COSMOS DESK', 'money-minute': 'MONEY MINUTE', 'news-60': 'NEWS IN 60', 'world-weather': 'WORLD WEATHER', 'seven-days': 'SEVEN DAYS', 'full-time': 'FULL TIME' };
let LONDON = null;
function londonParts(t) {
  LONDON ||= new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const parts = LONDON.formatToParts(new Date(t));
  const get = (k) => parts.find((p) => p.type === k)?.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, weekday: up(get('weekday')), time: `${get('hour')}:${get('minute')}` };
}

/**
 * Where and when an answer aired, for the board's foot: { source: 'THE VERGE', title: 'TECH BYTES', day: 'TODAY' |
 * 'YESTERDAY' | 'MONDAY', time: '18:52' } (London). `aired`: the plan's { source, programme, at }; `now`: ms.
 */
const CREDIT_OF = new WeakMap();
export function creditOf(aired, { now = Date.now(), titles = null } = {}) {
  if (!aired || typeof aired !== 'object') return null;
  // (the boards ask every frame: the answer is kept per airing until the minute, or the titles, change)
  const minute = Math.floor(now / 60_000);
  const hit = CREDIT_OF.get(aired);
  if (hit && hit.minute === minute && hit.titles === titles) return hit.c;
  const title = up(aired.title || titles?.[aired.programme] || TITLES[aired.programme] || aired.programme || '');
  let c;
  if (!Number.isFinite(aired.at)) c = { source: up(aired.source), title, day: '', time: '' };
  else {
    const a = londonParts(aired.at);
    const n = londonParts(now);
    const y = londonParts(now - 86_400_000);
    const day = a.date === n.date ? 'TODAY' : a.date === y.date ? 'YESTERDAY' : a.weekday;
    c = { source: up(aired.source), title, day, time: a.time };
  }
  CREDIT_OF.set(aired, { minute, titles, c });
  return c;
}

const CREDITS = new WeakMap();
/**
 * The credit in lines of the micro face, at most `maxLines` lines of maxW: "SOURCE: THE VERGE" and "AS TOLD ON TECH
 * BYTES, TODAY 18:52" (`verb`: TOLD, or REPORTED for a figure), shortened in steps (the weekday to three letters, then
 * without "AS TOLD ON", then "SOURCE:") but never cut: a source too long for any step is wrapped.
 */
export function creditLines(c, maxW, maxLines = 2, verb = 'TOLD') {
  if (!c) return [];
  let byKey = CREDITS.get(c);
  if (!byKey) CREDITS.set(c, (byKey = new Map()));
  const key = maxW * 64 + maxLines * 2 + (verb === 'TOLD' ? 0 : 1);
  let hit = byKey.get(key);
  if (!hit) byKey.set(key, (hit = creditBuild(c, maxW, maxLines, verb)));
  return hit;
}
function creditBuild(c, maxW, maxLines, verb) {
  const mw = (t) => measureText(t, 1, 'micro');
  const short = c.day.length > 3 && !['TODAY', 'YESTERDAY'].includes(c.day) ? c.day.slice(0, 3) : c.day;
  const when = (d, lead) => [c.title && `${lead ? `AS ${verb} ON ` : ''}${c.title}`, [d, c.time].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const src = (pre) => (c.source ? `${pre ? 'SOURCE: ' : ''}${c.source}` : '');
  const tries = [
    [src(true), when(c.day, true)], [src(true), when(short, true)], [src(true), when(c.day, false)], [src(true), when(short, false)], [src(false), when(short, false)],
  ];
  if (maxLines === 1) {
    for (const [s, w] of tries) {
      const one = [s, w].filter(Boolean).join(' · ');
      if (mw(one) <= maxW) return [one];
    }
    return [[src(false), when(short, false)].filter(Boolean).join(' · ')];
  }
  for (const t of tries) {
    const lines = t.filter(Boolean);
    if (lines.every((l) => mw(l) <= maxW)) return lines.slice(0, maxLines);
  }
  // (a source no shortening fits: its words wrapped over the lines but the last, the airing on the last; dots only
  // when even that cannot hold it)
  const airing = [short, c.time].filter(Boolean).join(' ') || when(short, false);
  const words = src(false).split(' ');
  const out = [];
  let line = '';
  for (const wd of words) {
    const t = line ? `${line} ${wd}` : wd;
    if (line && mw(t) > maxW) {
      out.push(line);
      line = wd;
    } else line = t;
  }
  if (line) out.push(line);
  const room = Math.max(1, maxLines - 1);
  if (out.length > room) {
    out.length = room;
    let last = out[room - 1];
    while (last.length > 1 && mw(`${last}...`) > maxW) last = last.slice(0, -1).trimEnd();
    out[room - 1] = `${last}...`;
  }
  return maxLines > 1 ? [...out, airing] : [out[0]];
}

function drawCredit(ctx, lines, x, y, dt, at, align = 'left', w = 0) {
  lines.forEach((l, i) => {
    const lx = align === 'right' ? x + w - measureText(l, 1, 'micro') : x;
    rise(ctx, l, lx, y + i * 6, seg(dt, at + i * 0.06, 0.3), S.microFog);
  });
}

// ---------------------------------------------------------------- the countdown bar

/**
 * The countdown bar at (x, y), w wide: one cell a half note (the bed's ticks), all lit when the countdown starts,
 * going out from the right on each tick (never a sliding sub-pixel bar). `cd` = { at, dur } on the board's clock.
 */
export function countdownCells(cd, dt) {
  const n = Math.max(1, Math.round(cd.dur / HALF_NOTE));
  const gone = clamp(Math.floor((dt - cd.at) / HALF_NOTE + 1e-6), 0, n);
  return { n, lit: n - gone };
}
function drawCountdown(ctx, dt, x, y, w, cd) {
  if (!cd || dt < cd.at) return;
  const { n, lit } = countdownCells(cd, dt);
  const gap = 2;
  const cw = Math.max(2, Math.floor((w - gap * (n - 1)) / n));
  const vis = Math.round((cw * n + gap * (n - 1)) * ease(dt, cd.at, 0.15));
  ctx.save();
  try {
    clipRect(ctx, x, y, vis, 3);
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i < lit ? P.white : P.slate;
      ctx.fillRect(x + i * (cw + gap), y, cw, 3);
    }
  } finally {
    ctx.restore();
  }
}

/**
 * What a lock-in (PICTURE THIS, steps 2..4) or a buzz (LETTER BY LETTER, stages 1..3) is worth now, or '': "3 POINTS".
 * On DOUBLE OR NOTHING (`double`: the name of the player behind) the doubled value and whose it is, "6 FOR PENNY": the
 * board never shows a stake lower than the one being played for (the leader's single points go unsaid, never misstated).
 */
export function stakeOf(type, step, double = null) {
  const pts = type === 'picture' ? { 2: 3, 3: 2, 4: 1 }[step] : type === 'letters' ? { 1: 3, 2: 2, 3: 1 }[step] : 0;
  if (!pts) return '';
  return double ? `${pts * 2} FOR ${markName(double)}` : `${pts} POINT${pts > 1 ? 'S' : ''}`;
}
const STAKE_W = 34; // room for "3 POINTS" in the micro face and its gap (a longer stake shortens the bar further)
/** The countdown with the stake at its right end (the bar shortened to make room, so the two never touch). */
function drawFoot(ctx, dt, x, y, w, cd, stake) {
  if (!cd || dt < cd.at) return;
  const sw = stake ? Math.max(STAKE_W, measureText(stake, 1, 'micro') + 5) : STAKE_W;
  drawCountdown(ctx, dt, x, y, w - sw, cd);
  if (stake) drawText(ctx, stake, x + w - measureText(stake, 1, 'micro'), y - 1, S.microWhite);
}
/** The name of the player behind on a DOUBLE OR NOTHING board (o.double: their seat), or null. */
const doubleName = (o) => (o.double ? nameOf(o.players, o.double) : null);

// ---------------------------------------------------------------- kickers and frames

const ROUND_TITLES = { picture: 'PICTURE THIS', letters: 'LETTER BY LETTER', where: 'WHERE IN THE WORLD?', today: 'TODAY OR NOT TODAY?', howmany: 'HOW MANY?' };
const DESKS = { world: 'WORLD', business: 'BUSINESS', tech: 'TECHNOLOGY', science: 'SCIENCE', sport: 'SPORT' };
/** The fixed frame of a round: the board's question at 2x (the aired words never become a question). */
export function frameOf(type) {
  return { picture: 'WHICH STORY?', letters: 'NAME THE HEADLINE', where: 'WHERE IS IT?', today: 'TODAY OR NOT TODAY?', howmany: 'FILL IN THE NUMBER' }[type] || '';
}
/**
 * The kicker: "PICTURE THIS · 2 OF 3", "HEADLINE 4 OF 6" (TODAY OR NOT TODAY?: the round's name is its frame),
 * "DOUBLE OR NOTHING · TECHNOLOGY", "SUDDEN DEATH". o = { type, k, n, double (the desk), sudden, desk (LETTER BY LETTER) }.
 */
export function kickerOf({ type, k = 0, n = 0, double = null, sudden = false, desk = null } = {}) {
  if (sudden) return 'SUDDEN DEATH';
  if (double) return [`DOUBLE OR NOTHING · ${DESKS[double] || up(double)}`, k && n ? `${k} OF ${n}` : ''].filter(Boolean).join(' · ');
  if (type === 'today') return k && n ? `HEADLINE ${k} OF ${n}` : 'TODAY OR NOT TODAY?';
  const parts = [ROUND_TITLES[type] || up(type)];
  if (k && n) parts.push(`${k} OF ${n}`);
  if (desk && type === 'letters') parts.push(DESKS[desk] || up(desk));
  return parts.join(' · ');
}

// ---------------------------------------------------------------- PICTURE THIS: the question board

// The question column on the left (the kicker, the frame at 2x, the picture, the countdown and the credit under it) and
// the three tiles on the right, each with a gutter for the lock-in marks. Every tile has room for three 1x lines.
const PIC = Object.freeze({ x: CX, y: FRAME_Y + 17, w: 128, h: 64 }); // its slate frame on rows 54..119, two clear under the frame
// the countdown bar (rows 122..124, the stake beside it) and, at the reveal, the credit's two micro lines: caps on rows
// 121..125 and 127..131, a comma's tail on 132, one row clear of the board's last (133)
const FOOT_Y = PIC.y + PIC.h + 2;
// the picture's licence credit while it shows, drawn as the montage draws it (graphics/remote.js: the FILE tag, the
// credit in micro type on ink, a long one on two lines): under the board's right edge, rows 137..147 (157 on two lines,
// 168 with PREVIEW · NOT CLEARED under it), clear of the board's text and of the captions (from row 172)
export const PICTURE_CREDIT_Y = SAFE.bottom + 3;
function drawPictureCredit(ctx, c) {
  let y = PICTURE_CREDIT_Y;
  if (c.credit) {
    const lines = drawFileCredit(ctx, c.credit, y, c.tag || 'FILE');
    y += 11 + 9 * ((lines || 1) - 1);
  }
  if (c.uncleared) drawPreviewTag(ctx, y);
}
const GUTTER_X = TILE.x + TILE.w + 3; // the lock-in marks (MARK_W to the content's right edge)
/** The picture's steps: blocks across and down and each block's size in pixels (128 x 64: every block whole). */
export function pictureSteps(steps = [8, 16, 32, 64]) {
  return steps.map((b) => ({ blocks: b, rows: Math.max(1, Math.round((b * PIC.h) / PIC.w)), size: PIC.w / b }));
}

const FACES = new WeakMap();
/**
 * The picture's faces for its steps, built once per image: the full picture by the channel's own pixelation
 * (pixelate.js: 128 x 64, its 16 colours, ordered dithering) and each step its blocks averaged and snapped to those
 * same colours, so the picture sharpens without its colours changing. Call it ahead (it takes a few ms): the board
 * calls it on its first frame otherwise.
 */
export function preparePicture(img, steps = [8, 16, 32, 64]) {
  if (!img || typeof img !== 'object') return null;
  let f = FACES.get(img);
  if (f !== undefined && (f === null || f.key === steps.join(','))) return f;
  let full;
  let src;
  try {
    full = pixelate(img, PIC.w, PIC.h, { colors: 16 });
    src = full.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, PIC.w, PIC.h).data;
  } catch (err) {
    // (an image the page may not read, a cross-origin picture without CORS, or one not loaded: the slot stays dark;
    // the director preloads the picture from the station's own /api/img and plays another question without it)
    console.warn('[quiz] picture', err?.message || err);
    FACES.set(img, null);
    return null;
  }
  const pal = [];
  const seen = new Set();
  for (let i = 0; i < src.length; i += 4) {
    const k = (src[i] << 16) | (src[i + 1] << 8) | src[i + 2];
    if (!seen.has(k)) {
      seen.add(k);
      pal.push([src[i], src[i + 1], src[i + 2]]);
    }
  }
  if (!pal.length) pal.push([0, 0, 0]);
  const faces = pictureSteps(steps).map(({ blocks, rows, size }) => {
    const c = document.createElement('canvas');
    c.width = blocks;
    c.height = rows;
    const g = c.getContext('2d');
    const img2 = g.createImageData(blocks, rows);
    const d = img2.data;
    for (let by = 0; by < rows; by++) {
      for (let bx = 0; bx < blocks; bx++) {
        let r = 0;
        let gg = 0;
        let b = 0;
        let n = 0;
        for (let y = by * size; y < (by + 1) * size; y++) {
          for (let x = bx * size; x < (bx + 1) * size; x++) {
            const i = (y * PIC.w + x) * 4;
            r += src[i];
            gg += src[i + 1];
            b += src[i + 2];
            n++;
          }
        }
        r /= n;
        gg /= n;
        b /= n;
        let best = pal[0];
        let bd = Infinity;
        for (const p of pal) {
          const dd = (r - p[0]) ** 2 * 0.3 + (gg - p[1]) ** 2 * 0.59 + (b - p[2]) ** 2 * 0.11;
          if (dd < bd) {
            bd = dd;
            best = p;
          }
        }
        const o = (by * blocks + bx) * 4;
        d[o] = best[0];
        d[o + 1] = best[1];
        d[o + 2] = best[2];
        d[o + 3] = 255;
      }
    }
    g.putImageData(img2, 0, 0);
    return { blocks, rows, canvas: c };
  });
  f = { key: steps.join(','), faces, full };
  FACES.set(img, f);
  return f;
}

/** Which step the picture shows at dt: 0 before the first, 1..4, or 'full' from the reveal. */
export function pictureStepAt(dt, stepTimes, revealAt = Infinity) {
  if (dt >= revealAt) return 'full';
  let s = 0;
  stepTimes.forEach((t, i) => {
    if (dt >= t) s = i + 1;
  });
  return s;
}

const tileState = (letter, answer, revealed) => (!revealed ? 'open' : letter === answer ? 'right' : 'wrong');
const TILE_COLORS = {
  open: { rim: P.fog, fill: P.purple, badge: P.white, letter: P.black, text: P.white },
  right: { rim: P.yellow, fill: P.yellow, badge: P.black, letter: P.yellow, text: P.black },
  wrong: { rim: P.steel, fill: P.slate, badge: P.ink, letter: P.fog, text: P.silver },
};

/** One lettered tile: its rim, its badge with the letter, its text vertically centred (1, 2 or 3 lines). */
function drawTile(ctx, x, y, letter, L, state, gold = 1) {
  const c = TILE_COLORS[state];
  const h = TILE.h;
  ctx.fillStyle = c.rim;
  ctx.fillRect(x, y, TILE.w, h);
  ctx.fillStyle = c.fill;
  ctx.fillRect(x + 1, y + 1, TILE.w - 2, h - 2);
  // (the right tile turns gold from its badge across, over 0.2 s: `gold` is how far)
  if (state === 'right' && gold < 1) {
    const o = TILE_COLORS.open;
    const gx = x + Math.round(TILE.w * gold);
    ctx.fillStyle = o.rim;
    ctx.fillRect(gx, y, x + TILE.w - gx, h);
    ctx.fillStyle = o.fill;
    ctx.fillRect(gx, y + 1, x + TILE.w - 1 - gx, h - 2);
  }
  const lit = state === 'right' && gold >= 1;
  const cc = state === 'right' && !lit ? TILE_COLORS.open : c;
  ctx.fillStyle = state === 'right' ? c.badge : cc.badge;
  ctx.fillRect(x + 1, y + 1, TILE.badge, h - 2);
  drawText(ctx, letter, x + 1 + ((TILE.badge - textW(letter, 1)) >> 1), y + ((h - 7) >> 1), styleOf(state === 'right' ? c.letter : cc.letter));
  drawLines(ctx, L, x + 1 + TILE.badge + 3, y + ((h - L.h) >> 1), lit ? c.text : cc.text);
}

/**
 * PICTURE THIS (the question board): o = {
 *   question   the plan's question: { options: [{ letter, words }], answer, steps, aired }
 *   image      the story's picture (an HTMLImageElement or canvas, loaded), or null (a dark slot)
 *   kicker     the kicker (kickerOf), frame (default 'WHICH STORY?')
 *   players    [{ seat: 'A', name }, { seat: 'B', name }]
 *   optionsAt  when the host starts reading the options (the tiles come up), default 0.6
 *   countdown  { at, dur } (the bar; whole half notes)
 *   stepTimes  when the picture steps (default: 0, the countdown's start, two and four ticks into it)
 *   locks      [{ seat, answer: 'B', at }]
 *   double     on DOUBLE OR NOTHING, the seat of the player behind (the stake shows their doubled points)
 *   revealAt   the reveal (the right tile gold, the others slate, the full picture, the credit)
 *   credit     creditOf(aired) (or aired + now + titles)
 * }
 */
export function drawQuestionBoard(ctx, dt, o = {}) {
  const q = o.question;
  if (!q?.options?.length) return;
  const optionsAt = o.optionsAt ?? 0.6;
  const cd = o.countdown || null;
  const revealAt = o.revealAt ?? Infinity;
  const stepTimes = o.stepTimes || [0, cd ? cd.at : Infinity, cd ? cd.at + 2 * HALF_NOTE : Infinity, cd ? cd.at + 4 * HALF_NOTE : Infinity];
  let credited = false;
  ctx.save();
  try {
    if (!panel(ctx, dt, PX, PY, PW, PH)) return;
    rise(ctx, o.kicker || kickerOf({ type: 'picture' }), CX, KICKER_Y, seg(dt, 0.2, 0.35), S.microFog);
    rise(ctx, o.frame || frameOf('picture'), CX, FRAME_Y, seg(dt, 0.25, 0.35), S.white2);
    // the picture in its slate frame: a step on each beat, the full picture at the reveal
    ctx.fillStyle = P.slate;
    ctx.fillRect(PIC.x - 1, PIC.y - 1, PIC.w + 2, PIC.h + 2);
    ctx.fillStyle = P.ink;
    ctx.fillRect(PIC.x, PIC.y, PIC.w, PIC.h);
    const step = pictureStepAt(dt, stepTimes, revealAt);
    const faces = step && o.image ? preparePicture(o.image, q.steps || [8, 16, 32, 64]) : null;
    if (faces) {
      const smooth = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      const f = step === 'full' ? { canvas: faces.full, blocks: PIC.w, rows: PIC.h } : faces.faces[step - 1];
      ctx.drawImage(f.canvas, 0, 0, f.blocks, f.rows, PIC.x, PIC.y, PIC.w, PIC.h);
      ctx.imageSmoothingEnabled = smooth;
      credited = !!o.pictureCredit && dt >= 0.3; // (once the panel's wipe has uncovered the picture)
    }
    // the three tiles: up when the host starts reading them, one after another
    const revealed = dt >= revealAt;
    const locks = (o.locks || []).filter((l) => l && l.seat && l.answer);
    q.options.slice(0, 3).forEach((opt, i) => {
      const at = optionsAt + i * 0.15;
      const vis = Math.round(TILE.w * ease(dt, at, 0.25));
      if (vis < 1) return;
      const y = TILE.y + i * (TILE.h + TILE.gap);
      const L = tileLayout(opt.words);
      ctx.save();
      try {
        clipRect(ctx, TILE.x, y, vis, TILE.h);
        drawTile(ctx, TILE.x, y, opt.letter, dt >= at + 0.1 ? L : { lines: [], h: 0 }, tileState(opt.letter, q.answer, revealed), ease(dt, revealAt, 0.2));
      } finally {
        ctx.restore();
      }
      // the lock-in marks beside it: one centred, two stacked (laid out from every lock, so none moves when the next
      // lands); each wipes on at its moment
      const here = locks.filter((l) => l.answer === opt.letter).sort((a, b) => (a.seat < b.seat ? -1 : 1));
      here.forEach((l, k) => {
        const my = here.length === 1 ? y + 12 : y + 7 + k * 10;
        wipeMark(ctx, l.seat, nameOf(o.players, l.seat), GUTTER_X, my, ease(dt, l.at ?? 0, 0.15), revealed && opt.letter !== q.answer ? 'off' : 'lit');
      });
    });
    // the foot: the countdown bar, then at the reveal the credit (source and airing)
    if (!revealed) drawFoot(ctx, dt, PIC.x, FOOT_Y + 1, PIC.w, cd, stakeOf('picture', step, doubleName(o)));
    else drawCredit(ctx, creditLines(o.credit || creditOf(q.aired, o), COL_W, 2), CX, FOOT_Y, dt, revealAt + 0.25);
  } finally {
    ctx.restore();
  }
  // (outside the board's own clip: the credit sits under it, as long as the picture is on)
  if (credited) drawPictureCredit(ctx, o.pictureCredit);
}

// ---------------------------------------------------------------- LETTER BY LETTER

const TILE_FACES = cache(12);
/** The empty tiles of a headline, baked once (a purple tile in its fog rim per letter). */
function tileFace(words) {
  return TILE_FACES(String(words), () => {
    const L = lettersLayout(words);
    const c = document.createElement('canvas');
    c.width = CW;
    c.height = Math.max(1, L.rows) * LT.row;
    const g = c.getContext('2d');
    for (const cell of L.cells) if (cell.tile) purpleBox(g, cell.x - CX, cell.y - L.top, LT.w, LT.h);
    return c;
  });
}

/**
 * LETTER BY LETTER: o = { question: { words, reveal: { shown, order, stages }, aired }, kicker, players,
 *   stageTimes: [t1, t2, t3] (the stages on the beat), countdown { at, dur }, buzzes: [{ seat, at, stall }],
 *   revealAt, winner (the seat that named it, or null), double (DOUBLE OR NOTHING: the seat behind), credit }.
 */
export function drawLettersBoard(ctx, dt, o = {}) {
  const q = o.question;
  if (!q?.words) return;
  const L = lettersLayout(q.words);
  const revealAt = o.revealAt ?? Infinity;
  const revealed = dt >= revealAt;
  const times = o.stageTimes || [];
  // (the board's game clock stops at the winning buzz: no stage, no tick, while the player says the headline; a stall
  // does not stop it, the other player may still buzz)
  const win = o.winner ? (o.buzzes || []).find((b) => b.seat === o.winner && !b.stall) : null;
  const gt = win && Number.isFinite(win.at) ? Math.min(dt, win.at) : dt;
  let stage = 0;
  times.forEach((t, i) => {
    if (gt >= t) stage = i + 1;
  });
  const shown = lettersShown(q.reveal, stage);
  const prev = lettersShown(q.reveal, stage - 1);
  const stageAt = stage ? times[stage - 1] : 0;
  ctx.save();
  try {
    if (!panel(ctx, dt, PX, PY, PW, PH)) return;
    rise(ctx, o.kicker || kickerOf({ type: 'letters', desk: q.desk }), CX, KICKER_Y, seg(dt, 0.2, 0.35), S.microFog);
    rise(ctx, o.frame || frameOf('letters'), CX, FRAME_Y, seg(dt, 0.25, 0.35), S.white2);
    // the buzzer lamps, right of the frame: unlit, lit gold on a buzz, back to slate and OUT on a stall
    const players = o.players?.length ? o.players : [{ seat: 'A', name: '' }, { seat: 'B', name: '' }];
    let lx = CR;
    [...players].reverse().forEach((pl) => {
      const b = (o.buzzes || []).find((x) => x.seat === pl.seat && dt >= (x.at ?? Infinity));
      const out = b?.stall && dt >= b.at + 0.9;
      const w = markWidth(pl.name);
      const outW = out ? measureText('OUT', 1, 'micro') + 3 : 0;
      lx -= w + outW;
      if (dt >= 0.4) {
        drawMark(ctx, pl.seat, pl.name, lx, FRAME_Y + 4, b && !out ? 'lit' : 'off');
        if (out) drawText(ctx, 'OUT', lx + w + 3, FRAME_Y + 5, S.microFog);
      }
      lx -= 14;
    });
    // the tiles: the empty ones baked once, then the letters showing (new ones rise into their tiles on the stage's
    // beat, left to right over 0.3 s); at the reveal every letter, and gold when a player named it
    const tilesIn = ease(dt, 0.45, 0.35);
    if (tilesIn > 0) {
      ctx.save();
      try {
        clipRect(ctx, CX, L.top - 2, Math.round(CW * tilesIn), L.rows * LT.row + 2);
        const gold = revealed && o.winner ? ease(dt, revealAt, 0.3) : 0;
        if (!gold || gold < 1) ctx.drawImage(tileFace(q.words), CX, L.top);
        const fresh = L.cells.filter((c) => c.tile && shown.has(c.i) && !prev.has(c.i));
        for (const cell of L.cells) {
          const goldHere = gold > 0 && cell.x - CX <= CW * gold;
          if (cell.tile && goldHere) {
            ctx.fillStyle = P.yellow;
            ctx.fillRect(cell.x, cell.y, LT.w, LT.h);
          }
          const show = revealed || shown.has(cell.i);
          if (!show) continue;
          const ch = cell.ch;
          if (!cell.tile) {
            drawText(ctx, ch, cell.x, cell.y + 4, S.white);
            continue;
          }
          const k = fresh.indexOf(cell);
          const at = revealed && !shown.has(cell.i) ? revealAt : k >= 0 ? stageAt + (0.3 * k) / Math.max(1, fresh.length) : -1;
          const p = seg(dt, at, 0.15);
          if (p <= 0) continue;
          const off = Math.round((1 - easeOutQuint(p)) * 11);
          ctx.save();
          try {
            clipRect(ctx, cell.x + 1, cell.y + 1, LT.w - 2, LT.h - 2);
            drawText(ctx, ch, cell.x + ((LT.w - textW(ch, 1)) >> 1), cell.y + 4 + off, goldHere ? S.black : S.white);
          } finally {
            ctx.restore();
          }
        }
      } finally {
        ctx.restore();
      }
    }
    // the foot: the countdown, then the credit
    const footY = SAFE.bottom - 9;
    if (!revealed) drawFoot(ctx, gt, CX, footY + 1, 128 + STAKE_W, o.countdown || null, stakeOf('letters', stage, doubleName(o)));
    else drawCredit(ctx, creditLines(o.credit || creditOf(q.aired, o), CW, 1), CX, footY, dt, revealAt + 0.3);
  } finally {
    ctx.restore();
  }
}

// ---------------------------------------------------------------- WHERE IN THE WORLD?

/** The map's rectangle on the WHERE board (pins and tags stay inside it). */
export const MAP = Object.freeze({ x: CX + COL_W + 5, y: PY + 3, w: CR - (CX + COL_W + 5), h: PH - 6 });

const NAMED = new WeakMap();
/** The lock-ins with the players' names, seat A first (kept per lock list: the board asks every frame). */
function namedLocks(list, players) {
  if (!Array.isArray(list)) return [];
  const hit = NAMED.get(list);
  if (hit && hit.players === players) return hit.locks;
  const locks = list.filter((l) => l && l.seat && l.answer).map((l) => ({ ...l, name: nameOf(players, l.seat) })).sort((a, b) => (a.seat < b.seat ? -1 : 1));
  NAMED.set(list, { players, locks });
  return locks;
}

const DEG = Math.PI / 180;
/** The world map's own view arithmetic (worldmap.js composeView): whole pixels, never a band beyond the poles. */
export function mapView(v, w = MAP.w, h = MAP.h) {
  const s0 = w / 360;
  const lat0 = clamp(Number(v.lat) || 0, -80, 80);
  const s = s0 * clamp(Number(v.zoom) || 1, 1, 40);
  const kx = clamp(Math.cos(lat0 * DEG), 0.5, 1);
  const sx = s * kx;
  const lim = 90 - (h / 2 + 1) / s;
  let clat = lim > 0 ? clamp(lat0, -lim, lim) : 0;
  let clon = Number(v.lon) || 0;
  clon = Math.round(clon * sx) / sx;
  clat = Math.round(clat * s) / s;
  return { clon, clat, s, kx, w, h };
}
/** A place's pixel on a view (x, y inside the map). */
export function mapPoint(view, lat, lon) {
  let dl = lon - view.clon;
  dl -= Math.round(dl / 360) * 360;
  return { x: Math.round(view.w / 2 + dl * view.s * view.kx), y: Math.round(view.h / 2 + (view.clat - lat) * view.s) };
}

const PIN_MARGIN = { x: 26, y: 18 };
/** The view that frames three pins (the shortest arc of longitude holding them), as close as they allow (zoom 1..4). */
export function framePins(pins, w = MAP.w, h = MAP.h) {
  const lons = pins.map((p) => ((p.lon % 360) + 540) % 360 - 180).sort((a, b) => a - b);
  let gap = -1;
  let after = 0;
  lons.forEach((l, i) => {
    const next = i === lons.length - 1 ? lons[0] + 360 : lons[i + 1];
    if (next - l > gap) {
      gap = next - l;
      after = i;
    }
  });
  const start = lons[(after + 1) % lons.length];
  const ext = 360 - gap;
  const lon = start + ext / 2;
  const lats = pins.map((p) => p.lat);
  const lat = (Math.max(...lats) + Math.min(...lats)) / 2;
  const kx = clamp(Math.cos(clamp(lat, -80, 80) * DEG), 0.5, 1);
  const s0 = w / 360;
  const zx = ext > 0 ? (w - 2 * PIN_MARGIN.x) / (ext * s0 * kx) : 4;
  const latExt = Math.max(...lats) - Math.min(...lats);
  const zy = latExt > 0 ? (h - 2 * PIN_MARGIN.y) / (latExt * s0) : 4;
  return { lat, lon: ((lon + 540) % 360) - 180, zoom: clamp(Math.min(zx, zy, 4), 1, 4) };
}

/** A pin's tag: [letter | label] (the label on two lines when long), and the marks that lock in on it hang under it. */
function tagSize(opt, nMarks, names) {
  const label = up(opt.label || opt.country);
  const lines = textW(label, 1) > 90 ? balanceLines(label, 90, 1, 2) : [label];
  const lw = Math.max(...lines.map((l) => textW(l, 1)));
  const w = 1 + 9 + 3 + lw + 3 + 1;
  const h = lines.length * LINE + 1;
  const mw = nMarks ? Math.max(...names.map(markWidth)) : 0;
  return { lines, w, h, bw: Math.max(w, mw), bh: h + (nMarks ? 2 + nMarks * 9 - 2 : 0) };
}
const SIDES = [
  [1, 0], [-1, 0], [1, -1], [1, 1], [-1, -1], [-1, 1], [0, -1], [0, 1],
];
/** The tag's box for a pin at (px, py) on a side ([dx, dy]: right, left, above, below and the corners). */
function tagBox(px, py, t, [dx, dy]) {
  let x = dx > 0 ? px + 5 : dx < 0 ? px - 5 - t.bw : px - (t.w >> 1);
  let y = dy === 0 ? py - (t.h >> 1) : dy < 0 ? py - 5 - t.bh : py + 5;
  if (dx !== 0 && dy !== 0) {
    x = dx > 0 ? px + 2 : px - 2 - t.bw;
    y = dy < 0 ? py - 3 - t.bh : py + 3;
  }
  return { x, y, w: t.bw, h: t.bh };
}
const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** Where each pin's tag goes on a view: the sides that keep every tag inside the map, off the other pins and tags. */
function placeTags(points, tags, w, h) {
  const n = points.length;
  let best = null;
  let bestCost = Infinity;
  const pick = new Array(n).fill(0);
  const visit = (i, boxes, cost) => {
    if (cost >= bestCost) return;
    if (i === n) {
      bestCost = cost;
      best = pick.slice();
      return;
    }
    for (let s = 0; s < SIDES.length; s++) {
      const b = tagBox(points[i].x, points[i].y, tags[i], SIDES[s]);
      let c = s < 2 ? s * 0.5 : s < 6 ? 3 : 5;
      // inside the map, 2 px from its edge
      const out = Math.max(0, 2 - b.x) + Math.max(0, b.x + b.w - (w - 2)) + Math.max(0, 2 - b.y) + Math.max(0, b.y + b.h - (h - 2));
      c += out * 400;
      for (let j = 0; j < n; j++) if (j !== i) c += overlap(b, { x: points[j].x - 3, y: points[j].y - 3, w: 7, h: 7 }) * 200;
      for (const ob of boxes) c += overlap(b, { x: ob.x - 2, y: ob.y - 2, w: ob.w + 4, h: ob.h + 4 }) * 100;
      pick[i] = s;
      visit(i + 1, [...boxes, b], cost + c);
    }
  };
  visit(0, [], 0);
  return best || new Array(n).fill(0);
}

const WHERE_LAYOUTS = new WeakMap();
/**
 * WHERE's layout (cached per question and its lock-ins): the pins that have a place, the framing view, the final view
 * on the right pin, each tag's size and side, and the tags' boxes on the framing view (map pixels). The right tag keeps
 * its side for the move when that side still fits the final view.
 */
export function whereLayout(q, locks = []) {
  const lk = locks.map((l) => `${l.seat}${l.answer}${l.name || ''}`).join(',');
  let byLocks = WHERE_LAYOUTS.get(q);
  if (!byLocks) WHERE_LAYOUTS.set(q, (byLocks = new Map()));
  let L = byLocks.get(lk);
  if (L) return L;
  const opts = (q.options || []).slice(0, 3).filter((x) => Number.isFinite(x?.lat) && Number.isFinite(x?.lon));
  if (!opts.length) return null;
  const frame = framePins(opts);
  const v0 = mapView(frame);
  const right = opts.find((x) => x.letter === q.answer) || opts[0];
  // (the move always closes in: twice the framing zoom, 4 to 8 — a pan alone would not single the right pin out)
  const zEnd = clamp(frame.zoom * 2, 4, 8);
  const vEnd = mapView({ lat: right.lat, lon: right.lon, zoom: zEnd });
  const names = (letter) => locks.filter((l) => l.answer === letter).map((l) => l.name || l.seat);
  const tags = opts.map((x) => tagSize(x, names(x.letter).length, names(x.letter)));
  const pts = opts.map((x) => mapPoint(v0, x.lat, x.lon));
  const sides = placeTags(pts, tags, MAP.w, MAP.h);
  const ri = opts.indexOf(right);
  const pe = mapPoint(vEnd, right.lat, right.lon);
  const keep = tagBox(pe.x, pe.y, tags[ri], SIDES[sides[ri]]);
  const fitsEnd = keep.x >= 2 && keep.y >= 2 && keep.x + keep.w <= MAP.w - 2 && keep.y + keep.h <= MAP.h - 2;
  const endSide = fitsEnd ? sides[ri] : placeTags([pe], [tags[ri]], MAP.w, MAP.h)[0];
  const boxes = pts.map((pt, i) => tagBox(pt.x, pt.y, tags[i], SIDES[sides[i]]));
  L = { opts, frame, vEnd: { lat: right.lat, lon: right.lon, zoom: zEnd }, tags, sides, endSide, right: right.letter, pts, boxes };
  if (byLocks.size > 4) byLocks.delete(byLocks.keys().next().value);
  byLocks.set(lk, L);
  return L;
}

// The reveal on the map: the right tag gold and the wrong ones slate at once; 0.6 s later the wrong pins and tags wipe
// away (0.2 s), then the map moves onto the right pin (1.4 s)
const MOVE = Object.freeze({ at: 0.8, dur: 1.4 });
/** The view at dt: the frame until the reveal, then the move (eased, the zoom by its logarithm) onto the right pin. */
function viewAt(W2, dt, revealAt) {
  const k = easeInOutSine(seg(dt, revealAt + MOVE.at, MOVE.dur));
  if (k <= 0) return W2.frame;
  const a = W2.frame;
  const b = W2.vEnd;
  let dl = b.lon - a.lon;
  dl -= Math.round(dl / 360) * 360;
  return { lat: a.lat + (b.lat - a.lat) * k, lon: a.lon + dl * k, zoom: Math.exp(Math.log(a.zoom) + (Math.log(b.zoom) - Math.log(a.zoom)) * k) };
}

/**
 * WHERE IN THE WORLD?: o = { question: { words, masked, options: [{ letter, label, country, lat, lon }], answer, aired },
 *   kicker, players, pinsAt (the pins drop as the host names them, default 0.8), countdown { at, dur },
 *   locks: [{ seat, answer, at }], revealAt, credit }.
 */
export function drawWhereBoard(ctx, dt, o = {}) {
  const q = o.question;
  if (!q?.options?.length) return;
  const revealAt = o.revealAt ?? Infinity;
  const revealed = dt >= revealAt;
  const pinsAt = o.pinsAt ?? 0.8;
  const locks = namedLocks(o.locks, o.players);
  const W2 = whereLayout(q, locks);
  if (!W2) return;
  ctx.save();
  try {
    if (!panel(ctx, dt, PX, PY, PW, PH)) return;
    rise(ctx, o.kicker || kickerOf({ type: 'where' }), CX, KICKER_Y, seg(dt, 0.2, 0.35), S.microFog);
    rise(ctx, o.frame || frameOf('where'), CX, FRAME_Y, seg(dt, 0.25, 0.35), S.white2);
    // the headline: masked until the reveal, then whole with the hidden words lit
    const H1 = revealed && q.masked ? layoutText(q.masked, COL_W, HEAD.lines, q.words) : layoutText(q.masked || q.words, COL_W, HEAD.lines);
    drawLines(ctx, H1, CX, HEAD.y, P.white, dt, revealed && q.masked ? revealAt : 0.35);
    // the map, in a slate frame: still while the pins are up, then the move onto the right one
    const mp = ease(dt, 0.3, 0.3);
    if (mp > 0) {
      ctx.save();
      try {
        clipRect(ctx, MAP.x - 1, MAP.y - 1, Math.round((MAP.w + 2) * mp), MAP.h + 2);
        ctx.fillStyle = P.slate;
        ctx.fillRect(MAP.x - 1, MAP.y - 1, MAP.w + 2, MAP.h + 2);
        const view = viewAt(W2, dt, revealAt);
        const got = drawWorldMap(ctx, dt, dt, { view, x: MAP.x, y: MAP.y, w: MAP.w, h: MAP.h });
        const v = got && Number.isFinite(got.s) ? { ...got } : mapView(view);
        clipRect(ctx, MAP.x, MAP.y, MAP.w, MAP.h);
        W2.opts.forEach((opt, i) => {
          const at = pinsAt + i * 0.35;
          if (dt < at) return;
          const pt = mapPoint(v, opt.lat, opt.lon);
          const px = MAP.x + pt.x;
          const py = MAP.y + pt.y;
          const state = tileState(opt.letter, q.answer, revealed);
          const gone = state === 'wrong' ? ease(dt, revealAt + MOVE.at - 0.2, 0.2) : 0;
          if (gone >= 1) return;
          // the pin: a white square in a black outline (the right one gold at the reveal)
          ctx.fillStyle = P.black;
          ctx.fillRect(px - 2, py - 2, 5, 5);
          ctx.fillStyle = state === 'right' ? P.yellow : state === 'wrong' ? P.fog : P.white;
          ctx.fillRect(px - 1, py - 1, 3, 3);
          // its tag on the side the layout chose (the right one takes, at the reveal, the side it keeps through the move)
          const t = W2.tags[i];
          const side = state === 'right' ? SIDES[W2.endSide] : SIDES[W2.sides[i]];
          const b = tagBox(px, py, t, side);
          const tvis = Math.round(b.w * ease(dt, at + 0.1, 0.2) * (1 - gone));
          ctx.save();
          try {
            // (in from the left as it is named; a wrong one out to the left before the move)
            clipRect(ctx, b.x, b.y, tvis, b.h);
            if (tvis < 1) return;
            const c = TILE_COLORS[state];
            ctx.fillStyle = c.rim;
            ctx.fillRect(b.x, b.y, t.w, t.h);
            ctx.fillStyle = c.fill;
            ctx.fillRect(b.x + 1, b.y + 1, t.w - 2, t.h - 2);
            ctx.fillStyle = c.badge;
            ctx.fillRect(b.x + 1, b.y + 1, 9, t.h - 2);
            drawText(ctx, opt.letter, b.x + 1 + ((9 - textW(opt.letter, 1)) >> 1), b.y + ((t.h - 7) >> 1), styleOf(c.letter));
            t.lines.forEach((l, k) => drawText(ctx, l, b.x + 13, b.y + 2 + k * LINE, styleOf(c.text)));
          } finally {
            ctx.restore();
          }
          // the marks that locked in on it, under the tag, each on a black plate
          locks.filter((l) => l.answer === opt.letter).forEach((l, k) => {
            const mx = b.x;
            const my = b.y + t.h + 2 + k * 9;
            const mw = markWidth(l.name);
            const mp2 = ease(dt, l.at ?? 0, 0.15) * (1 - gone);
            const pw2 = Math.round((mw + 2) * mp2);
            if (pw2 < 1) return;
            ctx.fillStyle = P.black;
            ctx.fillRect(mx - 1, my - 1, pw2, 9);
            wipeMark(ctx, l.seat, l.name, mx, my, mp2, state === 'wrong' ? 'off' : 'lit');
          });
        });
      } finally {
        ctx.restore();
      }
    }
    if (!revealed) drawCountdown(ctx, dt, CX, FOOT_Y + 1, 128, o.countdown || null);
    else drawCredit(ctx, creditLines(o.credit || creditOf(q.aired, o), COL_W, 2), CX, FOOT_Y, dt, revealAt + 0.3);
  } finally {
    ctx.restore();
  }
}

// ---------------------------------------------------------------- HOW MANY?

// the two desks' guess boxes, side by side under the longest sentence (four lines end at y 95), up from the board's first
// moments, empty (three slate dots) until each player says their number: nothing jumps in when the guesses come, and
// the board's lower half is the game's (the sentence above it centred in its four lines' room)
export const GUESS_BOX = Object.freeze({ y: 99, h: 17, gap: 6 });
const GUESS_Y = GUESS_BOX.y + 5; // the guesses' row of text

/**
 * HOW MANY?: o = { question: { masked, sentence, figure: { value, label, qualifier, exact }, aired }, kicker, players,
 *   countdown { at, dur }, guesses: [{ seat, said, at, points }], revealAt, credit }.
 * Each desk has its box from the start: the player's shape and name, GUESS, and their number as they say it; at the
 * reveal the figure is lit in the sentence as it aired and the guess that scored is lit with its points.
 */
export function drawHowManyBoard(ctx, dt, o = {}) {
  const q = o.question;
  if (!q?.masked) return;
  const revealAt = o.revealAt ?? Infinity;
  const revealed = dt >= revealAt;
  ctx.save();
  try {
    if (!panel(ctx, dt, PX, PY, PW, PH)) return;
    rise(ctx, o.kicker || kickerOf({ type: 'howmany' }), CX, KICKER_Y, seg(dt, 0.2, 0.35), S.microFog);
    rise(ctx, o.frame || frameOf('howmany'), CX, FRAME_Y, seg(dt, 0.25, 0.35), S.white2);
    const L = revealed ? layoutText(q.masked, CW, SENT.lines, q.sentence) : layoutText(q.masked, CW, SENT.lines);
    // (a shorter sentence sits in the middle of the four lines' room, never above its top)
    const sy = SENT.y + Math.max(0, Math.round((SENT.lines * 10 - 3 - L.h) / 2));
    drawLines(ctx, L, CX, sy, P.white, dt, revealed ? revealAt : 0.35);
    const half = (CW - GUESS_BOX.gap) >> 1;
    ['A', 'B'].forEach((seat, i) => {
      const bp = ease(dt, 0.45 + 0.1 * i, 0.3);
      if (bp <= 0) return;
      const bx = CX + i * (half + GUESS_BOX.gap);
      const by = GUESS_BOX.y;
      const g = (o.guesses || []).find((x) => x.seat === seat) || null;
      ctx.save();
      try {
        clipRect(ctx, bx, by, Math.round(half * bp), GUESS_BOX.h);
        // the box: a slate rim on black
        ctx.fillStyle = P.slate;
        ctx.fillRect(bx, by, half, GUESS_BOX.h);
        ctx.fillStyle = P.black;
        ctx.fillRect(bx + 1, by + 1, half - 2, GUESS_BOX.h - 2);
        const gy = GUESS_Y;
        const x = bx + 5;
        const mw = drawMark(ctx, seat, nameOf(o.players, seat), x, gy, 'id');
        // the GUESS label: a slate plate, its word in the micro face
        const lx = x + mw + 5;
        const lw = measureText('GUESS', 1, 'micro') + 4;
        ctx.fillStyle = P.slate;
        ctx.fillRect(lx, gy - 1, lw, 9);
        drawText(ctx, 'GUESS', lx + 2, gy + 1, S.microSilver);
        const vx = lx + lw + 4;
        const p = g ? ease(dt, g.at ?? 0, 0.25) : 0;
        if (p <= 0) {
          // (empty until the player says it: three slate dots)
          ctx.fillStyle = P.slate;
          for (let k = 0; k < 3; k++) ctx.fillRect(vx + 3 * k, gy + 6, 1, 1);
          return;
        }
        const said = up(g.said);
        ctx.save();
        try {
          clipRect(ctx, vx - 2, gy - 3, Math.round((bx + half - vx) * p), 14);
          const scored = revealed && (g.points || 0) > 0;
          if (scored) {
            const gp = ease(dt, revealAt + 0.45, 0.2);
            const pw = textW(said, 1) + 4;
            const gw = Math.round(pw * gp);
            ctx.fillStyle = P.yellow;
            if (gw >= 1) ctx.fillRect(vx - 2, gy - 2, gw, 11);
            // (the number black where the plate has reached it, white beyond: never white type on gold)
            for (const [x0, w0, st] of [[vx - 2, gw, S.black], [vx - 2 + gw, pw - gw + 2, S.white]]) {
              if (w0 < 1) continue;
              ctx.save();
              try {
                clipRect(ctx, x0, gy - 3, w0, 12);
                drawText(ctx, said, vx, gy, st);
              } finally {
                ctx.restore();
              }
            }
            if (gp >= 1) drawText(ctx, `+${g.points}`, vx + textW(said, 1) + 6, gy, S.white);
          } else drawText(ctx, said, vx, gy, revealed ? S.silver : S.white);
        } finally {
          ctx.restore();
        }
      } finally {
        ctx.restore();
      }
    });
    const footY = SAFE.bottom - 9;
    // (the clock is both desks': centred under the two boxes, on neither; the credit takes the foot at the reveal)
    if (!revealed) drawCountdown(ctx, dt, CX + ((CW - 128) >> 1), footY + 1, 128, o.countdown || null);
    else drawCredit(ctx, creditLines(o.credit || creditOf(q.aired, o), CW, 1, 'REPORTED'), CX, footY, dt, revealAt + 0.3);
  } finally {
    ctx.restore();
  }
}

// ---------------------------------------------------------------- TODAY OR NOT TODAY?

const LAMPS = ['TODAY', 'EARLIER'];

/**
 * TODAY OR NOT TODAY?: o = { item: { words, answer: 'TODAY' | 'EARLIER', aired }, index (0..5), total (6), kicker,
 *   players, countdown { at, dur }, locks: [{ seat, answer, at }], revealAt, tally: { A: [true, false, …], B: […] }
 *   (the round's results before this headline), credit }.
 */
export function drawTodayBoard(ctx, dt, o = {}) {
  const it = o.item;
  if (!it?.words) return;
  const revealAt = o.revealAt ?? Infinity;
  const revealed = dt >= revealAt;
  const total = o.total || 6;
  ctx.save();
  try {
    if (!panel(ctx, dt, PX, PY, PW, PH)) return;
    rise(ctx, o.kicker || kickerOf({ type: 'today', k: (o.index ?? 0) + 1, n: total }), CX, KICKER_Y, seg(dt, 0.2, 0.35), S.microFog);
    rise(ctx, o.frame || frameOf('today'), CX, FRAME_Y, seg(dt, 0.25, 0.35), S.white2);
    // the headline card: purple in its fog rim, the headline in white
    const L = layoutText(it.words, CW - 2 * CARD.pad - 2, CARD.lines);
    const ch = L.h + 2 * CARD.pad + 2;
    const cp = ease(dt, 0.35, 0.25);
    if (cp > 0) {
      ctx.save();
      try {
        clipRect(ctx, CX, CARD.y, Math.round(CW * cp), ch);
        purpleBox(ctx, CX, CARD.y, CW, ch);
        drawLines(ctx, L, CX + CW / 2, CARD.y + CARD.pad + 1, P.white, dt, 0.45, 'center');
      } finally {
        ctx.restore();
      }
    }
    // each player: the mark, two lamps (the one they chose lit gold; dimmed to slate at the reveal if wrong), the
    // round's tally in pips (gold right, slate wrong, an empty pip to come)
    const by = CARD.y + 2 * LINE - 3 + 2 * CARD.pad + 2 + 7;
    const lampW = LAMPS.map((t) => textW(t, 1) + 6);
    const blockW = lampW[0] + 3 + lampW[1];
    (o.players || []).slice(0, 2).forEach((pl, i) => {
      if (dt < 0.5) return;
      const x = i === 0 ? CX : CR - Math.max(blockW, markWidth(pl.name));
      drawMark(ctx, pl.seat, pl.name, x, by, 'id');
      const lock = (o.locks || []).find((l) => l.seat === pl.seat && dt >= (l.at ?? Infinity));
      let lx = x;
      LAMPS.forEach((word, k) => {
        const chosen = lock?.answer === word;
        const wrong = revealed && chosen && word !== it.answer;
        const ly = by + 11;
        // (unlit: ink in a slate rim, fog type; chosen: gold, black type; chosen and wrong, at the reveal: slate, white
        // type, so what they chose still reads)
        ctx.fillStyle = chosen ? (wrong ? P.slate : P.yellow) : P.ink;
        ctx.fillRect(lx, ly, lampW[k], 13);
        if (!chosen) {
          ctx.fillStyle = P.slate;
          ctx.fillRect(lx, ly, lampW[k], 1);
          ctx.fillRect(lx, ly + 12, lampW[k], 1);
          ctx.fillRect(lx, ly, 1, 13);
          ctx.fillRect(lx + lampW[k] - 1, ly, 1, 13);
        }
        drawText(ctx, word, lx + 3, ly + 3, chosen ? (wrong ? S.white : S.black) : S.fog);
        lx += lampW[k] + 3;
      });
      // the tally: six pips, this headline's filled in at the reveal
      const past = [...(o.tally?.[pl.seat] || [])].slice(0, total);
      if (revealed && lock) past[o.index ?? past.length] = lock.answer === it.answer;
      const right = past.filter((r) => r === true).length;
      drawText(ctx, `${right} RIGHT`, x + total * 7 + 3, by + 27, right ? S.microWhite : S.microFog);
      for (let k = 0; k < total; k++) {
        const px = x + k * 7;
        const py = by + 28;
        const r = past[k];
        if (r === true || r === false) {
          ctx.fillStyle = r ? P.yellow : P.slate;
          ctx.fillRect(px, py, 5, 3);
        } else {
          ctx.fillStyle = P.slate;
          ctx.fillRect(px, py, 5, 1);
          ctx.fillRect(px, py + 2, 5, 1);
          ctx.fillRect(px, py, 1, 3);
          ctx.fillRect(px + 4, py, 1, 3);
        }
      }
    });
    // the stamp at the reveal: the answer, and the day and programme it aired ("EARLIER" over "SATURDAY · COSMOS DESK
    // 17:20"; "TODAY" over "TECH BYTES 19:08"), in a double white rim, pressed down between the players (it opens from
    // its middle row over 0.12 s)
    if (revealed) {
      const c = o.credit || creditOf(it.aired, o);
      const l1 = it.answer === 'TODAY' ? 'TODAY' : 'EARLIER';
      const room = CW - 2 * (blockW + 12) - 12;
      // ("TECH BYTES 19:08" for today; "COSMOS DESK, SATURDAY 17:20" for earlier: a comma, the 1x bullet reads as a plus)
      const when = (d) => (it.answer === 'TODAY' || !d ? [c?.title, c?.time] : [c?.title && `${c.title},`, d, c?.time]).filter(Boolean).join(' ');
      let l2 = when(c?.day);
      if (textW(l2, 1) > room && c?.day?.length > 3) l2 = when(c.day.slice(0, 3));
      const sw = Math.max(textW(l1, 1), textW(l2, 1)) + 12;
      const sh = 2 * LINE - 3 + 10;
      const sx = Math.round(CX + CW / 2 - sw / 2);
      const sy = by + 3;
      const open = Math.round(sh * ease(dt, revealAt, 0.12));
      ctx.save();
      try {
        clipRect(ctx, sx, sy + ((sh - open) >> 1), sw, open);
        ctx.fillStyle = P.white;
        ctx.fillRect(sx, sy, sw, sh);
        ctx.fillStyle = P.black;
        ctx.fillRect(sx + 1, sy + 1, sw - 2, sh - 2);
        ctx.fillStyle = P.white;
        ctx.fillRect(sx + 2, sy + 2, sw - 4, 1);
        ctx.fillRect(sx + 2, sy + sh - 3, sw - 4, 1);
        drawText(ctx, l1, sx + ((sw - textW(l1, 1)) >> 1), sy + 5, S.white);
        drawText(ctx, l2, sx + ((sw - textW(l2, 1)) >> 1), sy + 5 + LINE, S.silver);
      } finally {
        ctx.restore();
      }
      if (c?.source) drawCredit(ctx, [`SOURCE: ${c.source}`], CX, SAFE.bottom - 8, dt, revealAt + 0.2, 'right', CW);
    } else drawCountdown(ctx, dt, CX + ((CW - 128) >> 1), SAFE.bottom - 7, 128, o.countdown || null);
  } finally {
    ctx.restore();
  }
}

// ---------------------------------------------------------------- the scores, DOUBLE OR NOTHING, the table, a round

const BOARD_X = 40;
const BOARD_W = 304;

/**
 * The scores: o = { players, scores: { A, B }, title ('THE SCORES', 'HALF TIME', 'FINAL SCORE'), winner (a seat: its
 * score lit gold at the result), compact (a one-line strip on the top of the safe area, over the studio) }.
 */
export function drawScoresStrip(ctx, dt, o = {}) {
  const players = (o.players || []).slice(0, 2);
  if (players.length < 2) return;
  const sc = o.scores || {};
  ctx.save();
  try {
    if (o.compact) {
      // ● LOLA 12 │ ■ SAM 8, on a black strip at y 28..40 (or at o.y: the quiz's wide puts it on the stage under the
      // host's podium, clear of the board's marquee and every head: scenes/quiz-shot.js)
      const parts = players.map((pl) => ({ pl, s: String(sc[pl.seat] ?? 0) }));
      const w = parts.reduce((t, x) => t + markWidth(x.pl.name) + 6 + textW(x.s, 1), 0) + 21 + 12;
      const x0 = Math.round(192 - w / 2);
      const y0 = Number.isFinite(o.y) ? Math.round(o.y) : PY;
      if (!panel(ctx, dt, x0, y0, w, 13)) return;
      let x = x0 + 6;
      parts.forEach((x2, i) => {
        if (i) {
          ctx.fillStyle = P.slate;
          ctx.fillRect(x + 7, y0 + 3, 1, 7);
          x += 15;
        }
        x += drawMark(ctx, x2.pl.seat, x2.pl.name, x, y0 + 3, 'id') + 6;
        drawText(ctx, x2.s, x, y0 + 3, o.winner === x2.pl.seat ? styleOf(P.yellow) : S.white);
        x += textW(x2.s, 1);
      });
      return;
    }
    const h = 58;
    const y = place(h);
    if (!panel(ctx, dt, BOARD_X, y, BOARD_W, h)) return;
    rise(ctx, up(o.title || 'THE SCORES'), BOARD_X + 12, y + 7, seg(dt, 0.2, 0.3), S.microFog);
    const half = BOARD_W >> 1;
    ctx.fillStyle = P.slate;
    if (dt >= 0.3) ctx.fillRect(BOARD_X + half, y + 18, 1, 32);
    players.forEach((pl, i) => {
      const cx = BOARD_X + half * i + (half >> 1);
      const mw = markWidth(pl.name);
      if (dt >= 0.35 + i * 0.1) drawMark(ctx, pl.seat, pl.name, Math.round(cx - mw / 2), y + 19, 'id');
      const s = String(sc[pl.seat] ?? 0);
      const style = o.winner ? (o.winner === pl.seat ? S.yellow3 : S.silver3) : S.white3;
      rise(ctx, s, Math.round(cx - textW(s, 3) / 2), y + 32, seg(dt, 0.45 + i * 0.1, 0.35), style);
    });
  } finally {
    ctx.restore();
  }
}

/**
 * DOUBLE OR NOTHING: o = { players, player (the trailing seat, who picks), offered: ['science', 'tech'], pick (the
 * desk chosen), pickAt (when they say it), leader (the other seat) }.
 */
export function drawDoubleCard(ctx, dt, o = {}) {
  const offered = (o.offered || []).slice(0, 2);
  if (!offered.length || !o.player) return;
  const h = 84;
  const y = place(h);
  const pickAt = o.pick ? o.pickAt ?? 0 : Infinity;
  ctx.save();
  try {
    if (!panel(ctx, dt, BOARD_X, y, BOARD_W, h)) return;
    // the title on a purple band in its fog rim: white type on the accent
    const bp = ease(dt, 0.2, 0.3);
    if (bp > 0) {
      ctx.save();
      try {
        clipRect(ctx, BOARD_X + 8, y + 6, Math.round((BOARD_W - 16) * bp), 22);
        purpleBox(ctx, BOARD_X + 8, y + 6, BOARD_W - 16, 22);
        const t = 'DOUBLE OR NOTHING';
        drawText(ctx, t, BOARD_X + ((BOARD_W - textW(t, 2)) >> 1), y + 10, S.white2);
      } finally {
        ctx.restore();
      }
    }
    // who picks, and the desks on offer (the one picked lit gold, the other dimmed)
    const name = nameOf(o.players, o.player);
    const line = offered.length > 1 ? 'PICKS THE DESK' : 'PLAYS FOR DOUBLE POINTS';
    const lw = markWidth(name) + 6 + textW(line, 1);
    const lx = BOARD_X + ((BOARD_W - lw) >> 1);
    if (dt >= 0.45) {
      drawMark(ctx, o.player, name, lx, y + 35, 'id');
      drawText(ctx, line, lx + markWidth(name) + 6, y + 35, S.silver);
    }
    const tw = 104;
    const gap = 12;
    const total = offered.length * tw + (offered.length - 1) * gap;
    offered.forEach((desk, i) => {
      const tx = BOARD_X + ((BOARD_W - total) >> 1) + i * (tw + gap);
      const ty = y + 48;
      const p = ease(dt, 0.55 + i * 0.12, 0.25);
      if (p <= 0) return;
      const label = DESKS[desk] || up(desk);
      const state = dt >= pickAt ? (desk === o.pick ? 'right' : 'wrong') : 'open';
      const c = TILE_COLORS[state];
      ctx.save();
      try {
        clipRect(ctx, tx, ty, Math.round(tw * p), 15);
        ctx.fillStyle = c.rim;
        ctx.fillRect(tx, ty, tw, 15);
        ctx.fillStyle = c.fill;
        ctx.fillRect(tx + 1, ty + 1, tw - 2, 13);
        drawText(ctx, label, tx + ((tw - textW(label, 1)) >> 1), ty + 4, styleOf(c.text));
      } finally {
        ctx.restore();
      }
    });
    // the stake: double points for the player behind, single for the leader
    const other = o.leader || (o.player === 'A' ? 'B' : 'A');
    const stake = `DOUBLE POINTS FOR ${markName(name)} · SINGLE FOR ${markName(nameOf(o.players, other))}`;
    rise(ctx, stake, BOARD_X + ((BOARD_W - measureText(stake, 1, 'micro')) >> 1), y + 71, seg(dt, 0.8, 0.3), S.microFog);
  } finally {
    ctx.restore();
  }
}

const wins = (n) => {
  const whole = Math.floor(n);
  const half = n - whole >= 0.5;
  return half ? `${whole || ''}½` : String(whole);
};
/**
 * The week's table: o = { standings: [{ id, name, played, wins }] (most wins first), players (tonight's two: their
 * shapes beside their names), title }. At most eight rows; tonight's players always among them.
 */
/**
 * The table's rows: the standings (most wins first, as table.js orders them) with their ranks, equal records sharing
 * one (never an order the results do not make), at most eight rows and tonight's two players always among them.
 */
export function tableRows(standings, players = []) {
  const all = standings || [];
  let rows = all.map((r) => ({ ...r, rank: all.findIndex((x) => x.wins === r.wins && x.played === r.played) + 1 }));
  const tonight = new Set((players || []).map((p) => p.id || p.name));
  const MAX = 8;
  if (rows.length > MAX) {
    const keep = rows.slice(0, MAX);
    for (const r of rows.slice(MAX)) {
      if (!tonight.has(r.id)) continue;
      const k = keep.map((x, i) => [x, i]).reverse().find(([x]) => !tonight.has(x.id))?.[1];
      if (k !== undefined) keep[k] = r;
    }
    rows = keep.sort((a, b) => a.rank - b.rank);
  }
  return rows;
}

export function drawTableBoard(ctx, dt, o = {}) {
  const rows = tableRows(o.standings, o.players);
  if (!rows.length) return;
  const tonight = new Map((o.players || []).map((p) => [p.id || p.name, p]));
  const pitch = 10;
  const h = 18 + rows.length * pitch + 4; // eight rows: 102 px, inside the safe area
  const y = place(h);
  ctx.save();
  try {
    if (!panel(ctx, dt, BOARD_X, y, BOARD_W, h)) return;
    rise(ctx, up(o.title || "THIS WEEK'S TABLE"), BOARD_X + 12, y + 6, seg(dt, 0.2, 0.3), S.microFog);
    // the numbers right-aligned under their labels' right edges
    const colP = BOARD_X + BOARD_W - 64;
    const colW = BOARD_X + BOARD_W - 12;
    if (dt >= 0.3) {
      drawText(ctx, 'PLAYED', colP - measureText('PLAYED', 1, 'micro'), y + 6, S.microFog);
      drawText(ctx, 'WINS', colW - measureText('WINS', 1, 'micro'), y + 6, S.microFog);
    }
    rows.forEach((r, i) => {
      const ry = y + 17 + i * pitch;
      const p = seg(dt, 0.35 + i * 0.07, 0.3);
      if (p <= 0) return;
      const t = tonight.get(r.id);
      const name = up(r.name || r.id);
      const off = Math.round((1 - easeOutQuint(p)) * 10);
      ctx.save();
      try {
        clipRect(ctx, BOARD_X, ry - 2, BOARD_W, 10);
        const rank = String(r.rank);
        drawText(ctx, rank, BOARD_X + 18 - textW(rank, 1), ry + off, S.fog);
        if (t) drawSeat(ctx, t.seat, BOARD_X + 26, ry + off, P.white);
        drawText(ctx, name, BOARD_X + 38, ry + off, S.white);
        const pl = String(r.played);
        drawText(ctx, pl, colP - textW(pl, 1), ry + off, S.silver);
        const wv = wins(r.wins);
        drawText(ctx, wv, colW - textW(wv, 1), ry + off, S.white);
      } finally {
        ctx.restore();
      }
    });
  } finally {
    ctx.restore();
  }
}

const ORDINALS = ['ONE', 'TWO', 'THREE', 'FOUR'];
const RULES = {
  picture: 'LOCK IN EARLY: 3, 2 OR 1 POINTS',
  letters: 'FIRST TO NAME IT: 3, 2 OR 1 POINTS',
  where: 'THE RIGHT PIN: 2 POINTS',
  today: 'ONE POINT A HEADLINE',
  howmany: 'THE CLOSEST GUESS: 2 POINTS',
  howmanyExact: 'THE CLOSEST GUESS 2, EXACTLY RIGHT 3', // (a comma: the 1x bullet reads as a plus)
};
/** A round's card: o = { type, k (1..3), sudden (the tie-break), exact (HOW MANY?) }. "ROUND TWO", the title at 2x, its scoring. */
export function drawRoundCard(ctx, dt, o = {}) {
  const title = o.sudden ? 'SUDDEN DEATH' : ROUND_TITLES[o.type] || up(o.title || '');
  if (!title) return;
  const kicker = o.sudden ? 'TIE-BREAK' : o.k ? `ROUND ${ORDINALS[o.k - 1] || o.k}` : '';
  // (HOW MANY?: "exactly right 3" only when one of the round's figures aired without "about", "up to"... : o.exact)
  const rule = o.sudden ? 'FIRST TO NAME THE HEADLINE WINS' : (o.type === 'howmany' && o.exact ? RULES.howmanyExact : RULES[o.type]) || '';
  const h = 52;
  const y = place(h);
  ctx.save();
  try {
    if (!panel(ctx, dt, BOARD_X, y, BOARD_W, h)) return;
    rise(ctx, kicker, BOARD_X + 12, y + 8, seg(dt, 0.2, 0.3), S.microFog);
    rise(ctx, title, BOARD_X + 12, y + 18, seg(dt, 0.28, 0.35), S.white2);
    // (the accent's rule under the title: a purple bar in its fog rim)
    const rp = ease(dt, 0.4, 0.3);
    if (rp > 0) purpleBox(ctx, BOARD_X + 12, y + 35, Math.max(3, Math.round(textW(title, 2) * rp)), 3);
    rise(ctx, rule, BOARD_X + 12, y + 42, seg(dt, 0.5, 0.3), S.silver);
  } finally {
    ctx.restore();
  }
}
