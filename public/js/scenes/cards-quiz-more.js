// PAY ATTENTION's further boards, the visual-variety round (owner, 18 Oct: "necesitan algunas diapositivas más o cosas
// que no lo hagan muy repetitivo"; docs/programmes/pay-attention.md §6, docs/roadmap/critique/visual-variety.md). In the
// quiz's board package (scenes/cards-quiz.js: the black panel wiped in from the left, the slate top line, the micro
// kicker, text rising into place, purple only as a fill in its fog rim, gold only for what is right or lit), each a
// pure function of its own clock:
//
//   drawRoundTransition   a round's card as a transition: the round's own emblem in pixels (a framed picture, three
//                         letter tiles, a globe and its pin, a calendar leaf, a counter, the bolt of sudden death), the
//                         stage's bulbs chasing along the card's edges, the title, its scoring, and from round two on
//                         the score so far
//   drawHalftimeBoard     the half-time race: each player's lane, the bar running out to their points, the points each
//                         round gave, who leads by how much
//   drawRevealView        a question's reveal on a picture of its own (the board's second view, after the players'
//                         faces): PICTURE THIS's picture large and whole beside the right headline, WHERE's map across
//                         the board zooming onto the right country, LETTER BY LETTER's headline as it aired (the
//                         programme's own strap, its time and its source), HOW MANY?'s figure on a line with the two
//                         guesses where they fell
//
// Nothing here says a word the desk did not give: every headline, place, figure, programme, time and source is the
// question's own (its aired record); the scores are the game's.
import { P } from '../palette.js';
import { drawText, measureText } from '../font.js';
import { clamp, seg, easeOutQuint, easeInOutSine, clipRect, textW } from '../gfx/index.js';
import { pixelate } from '../pixelate.js';
import { drawWorldMap } from './worldmap.js';
import { SAFE, CX, CR, CW, LINE, layoutText } from './quiz-fit.js';
import { quizKit, drawSeat, drawMark, creditOf, creditLines, preparePicture, mapView, mapPoint, framePins } from './cards-quiz.js';
import { drawFileCredit } from '../graphics/remote.js';

const K = () => quizKit; // (read at draw time: the two modules import each other's pieces)
const BOARD_X = 40;
const BOARD_W = 304;
const PX = SAFE.left;
const PY = SAFE.top;
const PW = SAFE.right - SAFE.left; // 358
const PH = SAFE.bottom - SAFE.top; // 106

const STY = new Map();
const st = (color, scale = 1, font = null) => {
  const k = `${color}|${scale}|${font || ''}`;
  if (!STY.has(k)) STY.set(k, font ? { color, scale, font } : scale > 1 ? { color, scale } : { color });
  return STY.get(k);
};
const ease = (dt, at, dur) => easeOutQuint(seg(dt, at, dur));
const up = (s) => String(s ?? '').toUpperCase();

// ---------------------------------------------------------------- the emblems (16 x 16 pixels, drawn at 2x)

// . clear, w white, f fog, s slate, i ink, p purple, y gold (lit), b black
const EMBLEMS = Object.freeze({
  picture: [
    '................',
    '.ffffffffffffff.',
    '.fiiiiiiiiiiiif.',
    '.fiiiiiiiiyyiif.',
    '.fiiiiiiiiyyiif.',
    '.fiiiiiiiiiiiif.',
    '.fiiiwiiiiiiiif.',
    '.fiiwwwiiiiiiif.',
    '.fiwwwwwiiswiif.',
    '.fwwwwwwwsswwif.',
    '.fwwwwwwwwwwwwf.',
    '.fwwwwwwwwwwwwf.',
    '.ffffffffffffff.',
    '................',
    '................',
    '................',
  ],
  letters: [
    '................',
    '................',
    '................',
    'ffff.ffff.ffff..',
    'fppf.fppf.fppf..',
    'fwpf.fppf.fwpf..',
    'fwwf.fpwf.fwwf..',
    'fwpf.fppf.fwpf..',
    'ffff.ffff.ffff..',
    '................',
    'yyyy.ssss.ssss..',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  where: [
    '.....ffffff.....',
    '...ffiiiiiiff...',
    '..fiiwwiiiiiif..',
    '.fiiwwwwiiiiiif.',
    '.fiiwwwiiiwwiif.',
    'fiiiiwiiiwwwwiif',
    'fiiiiiiiiwwwwiif',
    'fiiiiiiiiiwwiiif',
    'fiiiwwiiiiiiiiif',
    'fiiiwwwiiiiyyiif',
    '.fiiiwwiiiiyyif.',
    '.fiiiiwiiiiiyif.',
    '..fiiiiiiiiiyf..',
    '...ffiiiiiiff...',
    '.....ffffff.....',
    '................',
  ],
  today: [
    '................',
    '..ss......ss....',
    '.ffffffffffffff.',
    '.fppppppppppppf.',
    '.fppppppppppppf.',
    '.fwwwwwwwwwwwwf.',
    '.fwwwwwwwwwwwwf.',
    '.fwwwwwwwwwwywf.',
    '.fwwwwwwwwwyywf.',
    '.fwwwwyywwyywwf.',
    '.fwwwwwyyyywwwf.',
    '.fwwwwwwyywwwwf.',
    '.fwwwwwwwwwwwwf.',
    '.ffffffffffffff.',
    '................',
    '................',
  ],
  howmany: [
    '................',
    '................',
    '.fffff.fffff....',
    '.fiwif.fwwwf....',
    '.fwwif.fiiwf....',
    '.fiwif.fiwwf....',
    '.fiwif.fwiif....',
    '.fiwif.fwiif....',
    '.fwwwf.fwwwf....',
    '.fffff.fffff....',
    '................',
    '.ssssssssssssss.',
    '.s....y.......s.',
    '................',
    '................',
    '................',
  ],
  sudden: [
    '................',
    '........yyy.....',
    '.......yyy......',
    '......yyy.......',
    '.....yyy........',
    '....yyyyyyy.....',
    '.......yyy......',
    '......yyy.......',
    '.....yyy........',
    '....yy..........',
    '...y............',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
});
const EMBLEM_COLOR = { w: P.white, f: P.fog, s: P.slate, i: P.ink, p: P.purple, y: P.yellow, b: P.black };

/** A round's emblem at (x, y), `scale` px a cell, built row by row (a cell at a time, whole pixels). */
export function drawEmblem(ctx, name, x, y, scale = 2, p = 1) {
  const rows = EMBLEMS[name];
  if (!rows) return;
  const shown = Math.round(rows.length * clamp(p, 0, 1));
  for (let r = 0; r < shown; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      const col = EMBLEM_COLOR[row[c]];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x + c * scale, y + r * scale, scale, scale);
    }
  }
}
export const EMBLEM_NAMES = Object.freeze(Object.keys(EMBLEMS));

/** The stage's bulbs along a card's top and bottom edges: a chase that runs for `run` s, then all lit (white). */
function bulbs(ctx, dt, x, y, w, h, run = 1.6) {
  const n = Math.floor((w - 4) / 6);
  const chase = dt < run ? Math.floor(dt / 0.09) : -1;
  for (let i = 0; i < n; i++) {
    const lit = chase < 0 ? true : (i + chase) % 3 !== 0;
    ctx.fillStyle = lit ? P.white : P.slate;
    const bx = x + 3 + i * 6;
    ctx.fillRect(bx, y + 2, 2, 2);
    ctx.fillRect(bx, y + h - 4, 2, 2);
  }
}

// ---------------------------------------------------------------- a round's transition

/**
 * A round's card as a transition: o = { type, k (1..3), sudden, double, exact (HOW MANY?'s exact bonus), players,
 * scores { A, B } (the score so far, shown from round two on and on DOUBLE OR NOTHING's card) }.
 */
export function drawRoundTransition(ctx, dt, o = {}) {
  const Q = K();
  const title = o.sudden ? 'SUDDEN DEATH' : Q.ROUND_TITLES[o.type] || up(o.title || '');
  if (!title) return;
  const kicker = o.sudden ? 'TIE-BREAK' : o.k ? `ROUND ${Q.ORDINALS[o.k - 1] || o.k}` : '';
  const rule = o.sudden ? 'FIRST TO NAME THE HEADLINE WINS' : (o.type === 'howmany' && o.exact ? Q.RULES.howmanyExact : Q.RULES[o.type]) || '';
  const emblem = o.sudden ? 'sudden' : o.type;
  const h = 78;
  const y = Q.place(h);
  const showScore = !!(o.players?.length === 2 && o.scores && (o.k >= 2 || o.sudden));
  ctx.save();
  try {
    if (!Q.panel(ctx, dt, BOARD_X, y, BOARD_W, h)) return;
    bulbs(ctx, dt, BOARD_X, y, BOARD_W, h);
    // the emblem builds in row by row on its plate (an ink square in a slate rim)
    const ex = BOARD_X + 14;
    const ey = y + 15;
    const ep = ease(dt, 0.15, 0.5);
    if (ep > 0) {
      ctx.fillStyle = P.slate;
      ctx.fillRect(ex - 3, ey - 3, 38, 38);
      ctx.fillStyle = P.black;
      ctx.fillRect(ex - 2, ey - 2, 36, 36);
      drawEmblem(ctx, emblem, ex, ey, 2, ep);
    }
    const tx = ex + 46;
    Q.rise(ctx, kicker, tx, y + 13, seg(dt, 0.2, 0.3), Q.S.microFog);
    Q.rise(ctx, title, tx, y + 22, seg(dt, 0.3, 0.35), Q.S.white2);
    const rp = ease(dt, 0.45, 0.3);
    if (rp > 0) Q.purpleBox(ctx, tx, y + 39, Math.max(3, Math.round(Math.min(textW(title, 2), BOARD_X + BOARD_W - 12 - tx) * rp)), 3);
    Q.rise(ctx, rule, tx, y + 46, seg(dt, 0.55, 0.3), Q.S.silver);
    if (showScore) {
      // the score so far, on the card's foot: ● LOLA 4 · ■ SAM 7 (white: who leads is said, never lit gold)
      const parts = o.players.slice(0, 2).map((pl) => ({ pl, s: String(o.scores[pl.seat] ?? 0) }));
      const w = parts.reduce((t, x2) => t + Q.markWidth(x2.pl.name) + 5 + textW(x2.s, 1), 0) + 13;
      let x = BOARD_X + BOARD_W - 12 - w;
      if (dt >= 0.7) {
        drawText(ctx, 'SO FAR', x - 6 - measureText('SO FAR', 1, 'micro'), y + 60, Q.S.microFog);
        parts.forEach((x2, i) => {
          if (i) {
            ctx.fillStyle = P.slate;
            ctx.fillRect(x + 4, y + 60, 1, 7);
            x += 9;
          }
          x += drawMark(ctx, x2.pl.seat, x2.pl.name, x, y + 60, 'id') + 5;
          drawText(ctx, x2.s, x, y + 60, Q.S.white);
          x += textW(x2.s, 1);
        });
      }
    }
  } finally {
    ctx.restore();
  }
}

// ---------------------------------------------------------------- the half-time race

/**
 * The half-time race: o = { players, scores { A, B }, rounds: [{ A, B }, ...] (each round's points), title }. Each
 * player's lane: the shape and name, a track with a tick a point, the bar running out to their points (in 0.9 s, the
 * leader's a beat later), the points at 2x, and under the bar what each round gave. The foot says who leads by how
 * much, or that they are level.
 */
export function drawHalftimeBoard(ctx, dt, o = {}) {
  const Q = K();
  const players = (o.players || []).slice(0, 2);
  if (players.length < 2) return;
  const sc = o.scores || {};
  const rounds = (o.rounds || []).filter(Boolean);
  const top = Math.max(1, ...players.map((pl) => Number(sc[pl.seat]) || 0));
  const scale = Math.max(10, Math.ceil(top / 5) * 5); // the track's points: a whole number of fives, at least ten
  const h = 86;
  const y = Q.place(h);
  ctx.save();
  try {
    if (!Q.panel(ctx, dt, BOARD_X, y, BOARD_W, h)) return;
    Q.rise(ctx, up(o.title || 'HALF-TIME'), BOARD_X + 12, y + 6, seg(dt, 0.15, 0.3), Q.S.microFog);
    const trackX = BOARD_X + 74;
    const trackW = 166;
    players.forEach((pl, i) => {
      const ly = y + 18 + i * 28;
      if (dt >= 0.25 + i * 0.08) drawMark(ctx, pl.seat, pl.name, BOARD_X + 12, ly + 4, 'id');
      // the track: slate, a tick every five points
      const tp = ease(dt, 0.3 + i * 0.08, 0.3);
      if (tp <= 0) return;
      ctx.save();
      try {
        clipRect(ctx, trackX, ly, Math.round((trackW + 1) * tp), 16);
        ctx.fillStyle = P.slate;
        ctx.fillRect(trackX, ly + 5, trackW, 5);
        for (let k = 0; k <= scale; k += 5) {
          ctx.fillStyle = P.steel;
          ctx.fillRect(trackX + Math.round((trackW * k) / scale), ly + 11, 1, 2);
        }
      } finally {
        ctx.restore();
      }
      // the bar: white, out to the points (the race: both run, the leader's lands a beat later)
      const pts = Number(sc[pl.seat]) || 0;
      const lead = pts === top && players.some((x) => x !== pl && (Number(sc[x.seat]) || 0) < pts);
      const bp = easeInOutSine(seg(dt, 0.55 + (lead ? 0.25 : 0), 0.9));
      const bw = Math.round((trackW * Math.min(pts, scale) * bp) / scale);
      if (bw > 0) {
        ctx.fillStyle = P.fog;
        ctx.fillRect(trackX, ly + 4, bw, 7);
        ctx.fillStyle = P.white;
        ctx.fillRect(trackX, ly + 4, bw, 6);
      }
      // the points at 2x, counted only as the bar lands (never a number counting up)
      const s = String(pts);
      Q.rise(ctx, s, trackX + trackW + 10, ly + 1, seg(dt, 1.2 + (lead ? 0.25 : 0), 0.3), Q.S.white2);
      // each round's points under the bar
      const per = rounds.map((r, k) => `R${k + 1} ${Number(r?.[pl.seat]) || 0}`).join('  ·  ');
      if (per) Q.rise(ctx, per, trackX, ly + 15, seg(dt, 1.35, 0.3), Q.S.microFog);
    });
    const a = Number(sc[players[0].seat]) || 0;
    const b = Number(sc[players[1].seat]) || 0;
    const foot = a === b ? 'LEVEL AT HALF-TIME' : `${Q.markName((a > b ? players[0] : players[1]).name)} LEADS BY ${Math.abs(a - b)}`;
    Q.rise(ctx, foot, BOARD_X + BOARD_W - 12 - measureText(foot, 1, 'micro'), y + h - 10, seg(dt, 1.6, 0.3), Q.S.microWhite);
  } finally {
    ctx.restore();
  }
}

// ---------------------------------------------------------------- the reveal views

const VIEW_PIC = Object.freeze({ x: CX, y: PY + 5, w: 192, h: 96 }); // the picture large: rows 33..128, 3 px a block at 64 across
const VIEW_COL = Object.freeze({ x: VIEW_PIC.x + VIEW_PIC.w + 8, w: CR - (VIEW_PIC.x + VIEW_PIC.w + 8) }); // the right column: x 217..367
/** WHERE's map across the board on the reveal view (pins and tags stay inside it). */
export const VIEW_MAP = Object.freeze({ x: CX, y: PY + 12, w: CW, h: 58 });
const BIG = new WeakMap();

/** The picture large, by the channel's own pixelation at the view's size (built once per image). */
function bigPicture(img) {
  if (!img || typeof img !== 'object') return null;
  if (BIG.has(img)) return BIG.get(img);
  let c = null;
  try {
    c = pixelate(img, VIEW_PIC.w, VIEW_PIC.h, { colors: 16 });
  } catch {
    c = null;
  }
  BIG.set(img, c);
  return c;
}

/** The headline's lines in a gold box (the right answer): black type on gold, the box sized to the lines. */
function goldLines(ctx, L, x, y, w, p) {
  const bh = L.lines.length * LINE + 5;
  const vis = Math.round(w * clamp(p, 0, 1));
  if (vis < 1) return bh;
  ctx.save();
  try {
    clipRect(ctx, x, y, vis, bh);
    ctx.fillStyle = P.yellow;
    ctx.fillRect(x, y, w, bh);
    K().drawLines(ctx, L, x + 4, y + 3, P.black);
  } finally {
    ctx.restore();
  }
  return bh;
}

/** The lock-in marks of a reveal view: who chose what, lit when right, out when wrong. */
function choiceMarks(ctx, o, x, y, revealed, answer, dt) {
  const Q = K();
  const locks = (o.locks || []).filter((l) => l && l.seat && l.answer).sort((a, b) => (a.seat < b.seat ? -1 : 1));
  let yy = y;
  for (const l of locks) {
    if (dt < 0.1) break;
    const right = l.answer === answer;
    const w = drawMark(ctx, l.seat, Q.nameOf(o.players, l.seat), x, yy, revealed ? (right ? 'lit' : 'off') : 'id');
    drawText(ctx, l.answer, x + w + 4, yy, revealed && right ? st(P.yellow) : Q.S.silver);
    yy += 9;
  }
  return yy;
}

/**
 * PICTURE THIS's reveal view: the picture large (its last step until the reveal, then whole), and beside it the
 * players' choices, the right letter and its headline in gold, the credit; the picture's licence credit under the board.
 */
function drawPictureReveal(ctx, vdt, rdt, o) {
  const Q = K();
  const q = o.question;
  const revealed = rdt >= 0;
  ctx.fillStyle = P.slate;
  ctx.fillRect(VIEW_PIC.x - 1, VIEW_PIC.y - 1, VIEW_PIC.w + 2, VIEW_PIC.h + 2);
  ctx.fillStyle = P.ink;
  ctx.fillRect(VIEW_PIC.x, VIEW_PIC.y, VIEW_PIC.w, VIEW_PIC.h);
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  if (revealed) {
    const big = bigPicture(o.image);
    if (big) ctx.drawImage(big, VIEW_PIC.x, VIEW_PIC.y, VIEW_PIC.w, VIEW_PIC.h);
  } else {
    // (the picture's last step, 64 blocks across: 3 px each at this size)
    const faces = o.image ? preparePicture(o.image, q.steps || [8, 16, 32, 64]) : null;
    const f = faces?.faces?.[faces.faces.length - 1];
    if (f) ctx.drawImage(f.canvas, 0, 0, f.blocks, f.rows, VIEW_PIC.x, VIEW_PIC.y, VIEW_PIC.w, VIEW_PIC.h);
  }
  ctx.imageSmoothingEnabled = smooth;
  const x = VIEW_COL.x;
  Q.rise(ctx, revealed ? 'THE ANSWER' : 'WHICH STORY?', x, PY + 5, seg(vdt, 0.1, 0.25), Q.S.microFog);
  let y = choiceMarks(ctx, o, x, PY + 14, revealed, q.answer, vdt) + 3;
  if (revealed) {
    const opt = (q.options || []).find((op) => op.letter === q.answer);
    if (opt) {
      drawText(ctx, opt.letter, x, y, st(P.yellow, 2));
      const L = layoutText(opt.words, VIEW_COL.w - 8, 4);
      y += 17;
      y += goldLines(ctx, L, x, y, VIEW_COL.w, ease(rdt, 0.05, 0.25)) + 3;
    }
    const c = o.credit || creditOf(q.aired, o);
    const lines = creditLines(c, VIEW_COL.w, 2);
    if (y + lines.length * 6 <= SAFE.bottom - 1) Q.drawCredit(ctx, lines, x, y, rdt, 0.3);
  }
}

/** WHERE's reveal view: the map across the board, the three pins, the move onto the right country, the headline whole. */
function drawWhereReveal(ctx, vdt, rdt, o) {
  const Q = K();
  const q = o.question;
  const revealed = rdt >= 0;
  const opts = (q.options || []).slice(0, 3).filter((x) => Number.isFinite(x?.lat) && Number.isFinite(x?.lon));
  if (!opts.length) return;
  const M = VIEW_MAP;
  const frame = framePins(opts, M.w, M.h);
  const right = opts.find((x) => x.letter === q.answer) || opts[0];
  const zEnd = clamp(frame.zoom * 2.5, 4, 9);
  const k = easeInOutSine(seg(rdt, 0.7, 1.5));
  let dl = right.lon - frame.lon;
  dl -= Math.round(dl / 360) * 360;
  const view = k <= 0 ? frame : { lat: frame.lat + (right.lat - frame.lat) * k, lon: frame.lon + dl * k, zoom: Math.exp(Math.log(frame.zoom) + (Math.log(zEnd) - Math.log(frame.zoom)) * k) };
  Q.rise(ctx, revealed ? `THE ANSWER: ${up(right.label || right.country)}` : 'WHERE IS IT?', CX, PY + 3, seg(vdt, 0.1, 0.25), revealed ? st(P.yellow, 1, 'micro') : Q.S.microFog);
  ctx.save();
  try {
    ctx.fillStyle = P.slate;
    ctx.fillRect(M.x - 1, M.y - 1, M.w + 2, M.h + 2);
    const got = drawWorldMap(ctx, vdt, vdt, { view, x: M.x, y: M.y, w: M.w, h: M.h });
    const v = got && Number.isFinite(got.s) ? { ...got } : mapView(view, M.w, M.h);
    clipRect(ctx, M.x, M.y, M.w, M.h);
    for (const opt of opts) {
      const isRight = opt.letter === q.answer;
      const gone = revealed && !isRight ? ease(rdt, 0.4, 0.25) : 0;
      if (gone >= 1) continue;
      const pt = mapPoint(v, opt.lat, opt.lon);
      const px = M.x + pt.x;
      const py = M.y + pt.y;
      ctx.fillStyle = P.black;
      ctx.fillRect(px - 2, py - 2, 5, 5);
      ctx.fillStyle = revealed ? (isRight ? P.yellow : P.fog) : P.white;
      ctx.fillRect(px - 1, py - 1, 3, 3);
      // the pin's letter beside it (the label is the foot's, at the reveal)
      const lx = clamp(px + 5, M.x + 2, M.x + M.w - 11);
      const ly = clamp(py - 4, M.y + 2, M.y + M.h - 10);
      const c = revealed ? (isRight ? Q.TILE_COLORS.right : Q.TILE_COLORS.wrong) : Q.TILE_COLORS.open;
      ctx.fillStyle = c.rim;
      ctx.fillRect(lx, ly, 9, 9);
      ctx.fillStyle = c.badge;
      ctx.fillRect(lx + 1, ly + 1, 7, 7);
      drawText(ctx, opt.letter, lx + 2, ly + 1, st(c.letter));
    }
  } finally {
    ctx.restore();
  }
  // the headline whole under the map (the hidden words lit at the reveal: rows 102..119), the credit on the foot (127)
  const y = M.y + M.h + 4;
  const L = revealed && q.masked ? layoutText(q.masked, CW, 2, q.words) : layoutText(q.masked || q.words, CW, 2);
  Q.drawLines(ctx, L, CX, y, P.white, vdt, revealed && q.masked ? vdt - rdt : 0.2);
  if (revealed) {
    const c = o.credit || creditOf(q.aired, o);
    Q.drawCredit(ctx, creditLines(c, CW, 1), CX, SAFE.bottom - 7, rdt, 0.4, 'right', CW);
  }
}

/**
 * LETTER BY LETTER's reveal view: the headline as it aired, on the programme's own strap (its accent, its title, the
 * day and time it aired, its source), the winner's mark and points; before the reveal the strap waits with its words
 * covered (slate blocks a word).
 */
function drawLettersReveal(ctx, vdt, rdt, o) {
  const Q = K();
  const q = o.question;
  const revealed = rdt >= 0;
  const c = o.credit || creditOf(q.aired, o);
  // (the strap in the quiz's own colours: the programme's title on the purple in its fog rim, never another
  // programme's accent on the quiz's boards)
  Q.rise(ctx, 'AS IT AIRED', CX, PY + 4, seg(vdt, 0.1, 0.25), Q.S.microFog);
  // the strap: the programme's block in its accent, then the headline's black field with a slate rule on top
  const sy = PY + 22;
  const title = c?.title || '';
  const tw = textW(title, 1) + 12;
  const bp = ease(vdt, 0.15, 0.3);
  ctx.save();
  try {
    clipRect(ctx, CX, sy, Math.round(CW * bp), 58);
    Q.purpleBox(ctx, CX, sy, tw, 13);
    drawText(ctx, title, CX + 6, sy + 3, Q.S.white);
    const when = [c?.day, c?.time].filter(Boolean).join(' ');
    if (when) drawText(ctx, when, CX + tw + 6, sy + 4, Q.S.microFog);
    ctx.fillStyle = P.ink;
    ctx.fillRect(CX, sy + 13, CW, 44);
    ctx.fillStyle = P.fog;
    ctx.fillRect(CX, sy + 13, CW, 1);
    const L = layoutText(q.words, CW - 16, 3);
    const hy = sy + 13 + ((44 - L.lines.length * LINE) >> 1) + 2;
    if (revealed) Q.drawLines(ctx, L, CX + 8, hy, P.white, rdt, 0.05);
    else {
      // covered words: a slate block a word, as wide as the word
      for (let i = 0; i < L.lines.length; i++) {
        let x = CX + 8;
        for (const wd of L.lines[i].words || []) {
          ctx.fillStyle = P.slate;
          ctx.fillRect(x, hy + i * LINE, wd.w, 7);
          x += wd.w + 4;
        }
      }
    }
  } finally {
    ctx.restore();
  }
  // the winner and the source under the strap
  const fy = sy + 62;
  if (revealed && o.winner) {
    const w = drawMark(ctx, o.winner, Q.nameOf(o.players, o.winner), CX, fy, 'lit');
    drawText(ctx, 'NAMED IT', CX + w + 5, fy, Q.S.silver);
  } else if (revealed) drawText(ctx, 'NOBODY NAMED IT', CX, fy, Q.S.silver);
  if (revealed && c?.source) {
    const s = `SOURCE: ${c.source}`;
    Q.drawCredit(ctx, [s], CX, fy + 1, rdt, 0.3, 'right', CW);
  }
}

/** A figure as a number, in its own units ("$1.3 billion", "68.7%", "250,000", "900 million"), or null. */
export function figureNumber(text) {
  const s = String(text ?? '').toLowerCase().replace(/,(?=\d{3}\b)/g, '');
  const m = /(-?\d+(?:\.\d+)?)\s*(%|per ?cent|k\b|thousand|m\b|mn\b|million|bn\b|b\b|billion|trillion|tn\b)?/.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const u = m[2] || '';
  const mul = /^(k|thousand)$/.test(u) ? 1e3 : /^(m|mn|million)$/.test(u) ? 1e6 : /^(bn|b|billion)$/.test(u) ? 1e9 : /^(trillion|tn)$/.test(u) ? 1e12 : 1;
  return n * mul;
}

/**
 * HOW MANY?'s reveal view: the figure as it aired at 3x (gold at the reveal) with its label, and a line with the two
 * guesses where they fell and the figure's own place: how close each came. A guess that cannot be read as a number
 * keeps its box, with no place on the line.
 */
function drawHowManyReveal(ctx, vdt, rdt, o) {
  const Q = K();
  const q = o.question;
  const revealed = rdt >= 0;
  const fig = q.figure || {};
  const truth = figureNumber(fig.value);
  const guesses = (o.guesses || []).filter((g) => g && g.seat).map((g) => ({ ...g, n: figureNumber(g.said) }));
  Q.rise(ctx, revealed ? 'THE ANSWER' : 'HOW CLOSE?', CX, PY + 4, seg(vdt, 0.1, 0.25), Q.S.microFog);
  // the figure: masked until the reveal, then the value as it aired, the qualifier beside it, the label under
  const value = up(fig.value || '');
  const vw = textW(value, 3);
  const vx = Math.round(192 - vw / 2);
  if (revealed) {
    Q.rise(ctx, value, vx, PY + 14, seg(rdt, 0, 0.3), st(P.yellow, 3));
    if (fig.qualifier) drawText(ctx, up(fig.qualifier), vx - 6 - measureText(up(fig.qualifier), 1, 'micro'), PY + 22, Q.S.microFog);
  } else {
    ctx.fillStyle = P.slate;
    ctx.fillRect(Math.round(192 - Math.max(30, vw) / 2), PY + 14, Math.max(30, vw), 21);
  }
  const label = up(fig.label || '');
  if (label) drawText(ctx, label, Math.round(192 - measureText(label, 1, 'micro') / 2), PY + 39, Q.S.microFog);
  // the line: from 0 (or under the lowest) to past the highest, the guesses and the figure placed on it
  const nums = [truth, ...guesses.map((g) => g.n)].filter((x) => Number.isFinite(x));
  const lx = CX + 24;
  const lw = CW - 48;
  const ly = PY + 66;
  const lp = ease(vdt, 0.2, 0.4);
  ctx.fillStyle = P.slate;
  ctx.fillRect(lx, ly, Math.round(lw * lp), 2);
  if (nums.length >= 2 && Number.isFinite(truth)) {
    const lo0 = Math.min(...nums);
    const hi0 = Math.max(...nums);
    const span = Math.max(hi0 - lo0, Math.abs(hi0) * 0.1, 1e-9);
    const lo = lo0 >= 0 && lo0 - span * 0.35 < 0 ? 0 : lo0 - span * 0.35;
    const hi = hi0 + span * 0.35;
    const at = (n) => Math.round(lx + ((n - lo) / (hi - lo)) * lw);
    // each guess above the line: its shape over a tick, its words under the line
    guesses.forEach((g, i) => {
      if (!Number.isFinite(g.n) || vdt < 0.35 + i * 0.1) return;
      const x = clamp(at(g.n), lx, lx + lw);
      const right = revealed && g.points > 0;
      ctx.fillStyle = right ? P.yellow : P.white;
      ctx.fillRect(x, ly - 6, 1, 6);
      drawSeat(ctx, g.seat, x - 3, ly - 15, right ? P.yellow : P.white);
      const said = up(g.said).slice(0, 18);
      const sw = textW(said, 1);
      drawText(ctx, said, clamp(x - (sw >> 1), CX, CR - sw), ly + 6 + i * 10, right ? st(P.yellow) : Q.S.white);
    });
    if (revealed) {
      const x = clamp(at(truth), lx, lx + lw);
      const p = ease(rdt, 0.1, 0.3);
      ctx.fillStyle = P.yellow;
      ctx.fillRect(x - 1, ly - Math.round(10 * p), 3, Math.round(10 * p) + 4);
    }
  } else {
    // no common scale: the guesses in their boxes on the line
    guesses.forEach((g, i) => {
      if (vdt < 0.35 + i * 0.1) return;
      const x = CX + 40 + i * 160;
      const w = drawMark(ctx, g.seat, Q.nameOf(o.players, g.seat), x, ly + 6, revealed && g.points > 0 ? 'lit' : 'id');
      drawText(ctx, up(g.said).slice(0, 16), x + w + 5, ly + 6, revealed && g.points > 0 ? st(P.yellow) : Q.S.white);
    });
  }
  if (revealed) {
    const c = o.credit || creditOf(q.aired, o);
    Q.drawCredit(ctx, creditLines(c, CW, 1, 'REPORTED'), CX, SAFE.bottom - 7, rdt, 0.4, 'right', CW);
  }
}

/**
 * PICTURE THIS's opening picture: the question's picture across the whole frame at its first step (8 blocks across:
 * a field of colour, never more than the board's first step shows), the round's kicker and the frame on a plate in the
 * safe area's top left, the picture's licence credit under the safe area as the montage draws it. o = { question,
 * image, kicker, pictureCredit, frame }. The board takes the picture from there, at the same step, as the options are
 * read (the reading rule: the options on screen from their first word).
 */
export function drawPictureOpen(ctx, dt, o = {}) {
  const Q = K();
  const steps = o.steps || o.question?.steps;
  if (!o.image && !steps) return;
  const faces = o.image ? preparePicture(o.image, steps || [8, 16, 32, 64]) : null;
  const f = faces?.faces?.[0];
  // (the frame's 2:1 band, 384 x 192 from row 12: whole blocks of 48 px; the rows above and below the room's dark)
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  const wipe = Math.round(384 * ease(dt, 0, 0.35));
  if (f && wipe > 0) {
    ctx.save();
    try {
      clipRect(ctx, 0, 12, wipe, 192);
      ctx.drawImage(f.canvas, 0, 0, f.blocks, f.rows, 0, 12, 384, 192);
    } finally {
      ctx.restore();
    }
  }
  ctx.imageSmoothingEnabled = smooth;
  // the plate: black on the picture, the kicker and the frame at 2x
  const frame = o.frame || 'WHICH STORY?';
  const pw = Math.max(textW(frame, 2), measureText(o.kicker || '', 1, 'micro')) + 16;
  ctx.save();
  try {
    if (!Q.panel(ctx, dt - 0.2, PX, PY, pw, 32)) return;
    Q.rise(ctx, o.kicker || 'PICTURE THIS', PX + 8, PY + 5, seg(dt, 0.35, 0.3), Q.S.microFog);
    Q.rise(ctx, frame, PX + 8, PY + 14, seg(dt, 0.45, 0.35), Q.S.white2);
  } finally {
    ctx.restore();
  }
  if (o.pictureCredit?.credit && dt >= 0.35) drawFileCredit(ctx, o.pictureCredit.credit, SAFE.bottom + 3, o.pictureCredit.tag || 'FILE');
}

const VIEWS = { picture: drawPictureReveal, where: drawWhereReveal, letters: drawLettersReveal, howmany: drawHowManyReveal };
/** Does a question type have a reveal view? */
export const hasRevealView = (type) => !!VIEWS[type];

/**
 * A question's reveal view: card = { board: type, o: { ...the board's own options, viewAt (when the view went on air,
 * on the board's clock), revealAt } }, `dt` on the board's clock (its first cut). The panel wipes in from the view's
 * own start; the reveal lands at revealAt.
 */
export function drawRevealView(ctx, dt, card) {
  const draw = VIEWS[card?.board];
  const o = card?.o || {};
  if (!draw || !o.question) return;
  const vdt = dt - (Number.isFinite(o.viewAt) ? o.viewAt : 0);
  const rdt = dt - (Number.isFinite(o.revealAt) ? o.revealAt : Infinity);
  ctx.save();
  try {
    if (!K().panel(ctx, vdt, PX, PY, PW, PH)) return;
    draw(ctx, vdt, rdt, o);
  } finally {
    ctx.restore();
  }
  // (outside the board's clip: the picture's licence credit under it, as the montage draws it, while the picture shows)
  if (card.board === 'picture' && o.pictureCredit?.credit && vdt >= 0.3) drawFileCredit(ctx, o.pictureCredit.credit, SAFE.bottom + 3, o.pictureCredit.tag || 'FILE');
}
