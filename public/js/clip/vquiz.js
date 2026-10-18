// PAY ATTENTION's boards for the vertical picture (docs/publishing/vertical.md §3.5). The horizontal boards
// (scenes/cards-quiz.js) are 358 px panels with a question column beside a picture, a map or tiles; a phone is 216 px
// wide, so every board is set again in one column, in the quiz's own package and with its own clockwork: the black
// panel wiped in from the left, the micro kicker, the frame (2x when it fits the column, else 1x), the masked words
// with their purple masks and gold reveals (quiz-fit.js layoutText at the column's width), the players told apart by
// shape and name, the countdown in half-note cells, the credit at the reveal. Same data, same times (the director's
// card { board, o }), same rules: a headline is never cut or shrunk, it wraps.
//
// In the vertical frame the quiz takes the tall stage (216 x 216, y 32-247: clip/vertical.js profileOf): the boards
// below lay themselves out in a box { x, y, w, h } of that size.
//
//   installQuiz(compositor)   the compositor's quiz(t, scene, dt) draws the board shot
//   drawVerticalQuizBoard(ctx, t, dt, card, box)
//   VQUIZ                     the boards by name (the lab: public/lab/vquiz.html)
import { P } from '../palette.js';
import { drawText, measureText } from '../font.js';
import { clamp, seg, easeOutQuint, easeInOutSine, clipRect, balanceLines, textW, ellipsis } from '../gfx/index.js';
import { drawWorldMap } from '../scenes/worldmap.js';
import { drawSeat, drawMark, creditOf, creditLines, countdownCells, stakeOf, frameOf, kickerOf, preparePicture, pictureStepAt, mapView, mapPoint, framePins, tableRows, HALF_NOTE, layoutText, lettersShown, tileLayout, TILE_TEXT_W } from '../scenes/cards-quiz.js';
import { LINE, SPACE } from '../scenes/quiz-fit.js';

const S = {
  white: { color: P.white },
  silver: { color: P.silver },
  fog: { color: P.fog },
  black: { color: P.black },
  white2: { color: P.white, scale: 2 },
  white3: { color: P.white, scale: 3 },
  silver3: { color: P.silver, scale: 3 },
  yellow3: { color: P.yellow, scale: 3 },
  yellow: { color: P.yellow },
  microFog: { color: P.fog, font: 'micro' },
  microWhite: { color: P.white, font: 'micro' },
  microSilver: { color: P.silver, font: 'micro' },
};
const STYLE = new Map();
const styleOf = (color) => STYLE.get(color) || (STYLE.set(color, { color }), STYLE.get(color));
const ease = (dt, at, dur) => easeOutQuint(seg(dt, at, dur));
const up = (s) => String(s ?? '').toUpperCase();
const TILE_COLORS = {
  open: { rim: P.fog, fill: P.purple, badge: P.white, letter: P.black, text: P.white },
  right: { rim: P.yellow, fill: P.yellow, badge: P.black, letter: P.yellow, text: P.black },
  wrong: { rim: P.steel, fill: P.slate, badge: P.ink, letter: P.fog, text: P.silver },
};
const tileState = (letter, answer, revealed) => (!revealed ? 'open' : letter === answer ? 'right' : 'wrong');
const nameOf = (players, seat) => (players || []).find((p) => p.seat === seat)?.name || '';
const NAME_MAX = 32;
const markName = (name) => {
  let n = up(name);
  while (n.length > 2 && textW(n, 1) > NAME_MAX) n = n.slice(0, -1);
  return n;
};
const markWidth = (name) => 9 + textW(markName(name), 1);
const MARK_W = 9 + NAME_MAX;

/** The column's geometry in a box: the panel (4 px in) and the content (12 px in). */
function cols(box) {
  return { px: box.x + 4, py: box.y + 4, pw: box.w - 8, ph: box.h - 8, x: box.x + 12, r: box.x + box.w - 12, cw: box.w - 24, bare: !!box.bare };
}
/**
 * On the glass (bare) a board's entrance is pre-rolled by PRE seconds: its kicker, its frame, its question and its
 * players' marks are whole on the shot's first frame, so a clip that opens on a board opens on a composed frame. Only
 * the entrance (`entry(C, dt)`); what follows the voice and the plan (the locks, the countdown, the reveal) keeps the
 * board's own clock.
 */
const PRE = 0.9;
const entry = (C, dt) => (C.bare ? dt + PRE : dt);
// a board that is all entrance (the round's card, the scores, the table): settled from its first frame on the glass
const SETTLED = 2.5;
const settled = (C, dt) => (C.bare ? dt + SETTLED : dt);

function rise(ctx, text, x, y, p, style) {
  if (p <= 0 || !text) return;
  const scale = style.scale || 1;
  const h = (style.font === 'micro' ? 5 : 7) * scale;
  const off = Math.round((1 - easeOutQuint(p)) * (h + 3));
  ctx.save();
  try {
    clipRect(ctx, x - 2, y - 3 * scale, 4000, h + 3 * scale + 1);
    drawText(ctx, text, x, y + off, style);
  } finally {
    ctx.restore();
  }
}

/**
 * The panel wiped in from the left (leaves the clip set: the caller saves and restores). Bare (the vertical frame's
 * glass and marquee already stand behind the board, whole from the shot's first frame): no panel and no wipe.
 */
function panel(ctx, dt, x, y, w, h, bare = false) {
  if (bare) {
    clipRect(ctx, x, y, w, h);
    return true;
  }
  const vis = Math.round(w * ease(dt, 0, 0.3));
  if (vis <= 0) return false;
  clipRect(ctx, x, y, vis, h);
  ctx.fillStyle = P.black;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = P.slate;
  ctx.fillRect(x, y, w, 1);
  return true;
}

function purpleBox(ctx, x, y, w, h) {
  ctx.fillStyle = P.fog;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = P.purple;
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
}

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

// ---------------------------------------------------------------- masked lines (quiz-fit.js layouts, drawn as the boards do)

function maskBlock(ctx, x, y, w) {
  ctx.fillStyle = P.fog;
  ctx.fillRect(x, y - 1, w, 9);
  ctx.fillStyle = P.purple;
  ctx.fillRect(x + 1, y, w - 2, 7);
}
const OPS = new WeakMap();
function opsOf(line) {
  let ops = OPS.get(line);
  if (ops) return ops;
  ops = [];
  let cx = 0;
  let run = null;
  const flush = () => {
    if (run) ops.push(run);
    run = null;
  };
  line.words.forEach((wd, i) => {
    if (i) {
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
  OPS.set(line, ops);
  return ops;
}
function drawLine(ctx, line, x, y, color) {
  const st = styleOf(color);
  for (const op of opsOf(line)) {
    if (op.k === 't') drawText(ctx, op.s, x + op.x, y, st);
    else if (op.k === 'm') maskBlock(ctx, x + op.x, y, op.w);
    else {
      ctx.fillStyle = P.yellow;
      ctx.fillRect(x + op.x, y - 2, op.w, 11);
      if (op.k === 'h') drawText(ctx, op.s, x + op.x + op.padL, y, S.black);
    }
  }
}
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

// ---------------------------------------------------------------- the header, the foot

/** The kicker and the frame: 2x when the frame fits the column (beside `beside` px kept free), else 1x. Returns the y under it. */
function header(ctx, dt0, C, kicker, frame, beside = 0) {
  // (on the glass the kicker in the body face, the frame under it: both read at a phone's size)
  const dt = entry(C, dt0);
  const k = C.bare ? 9 : 0;
  if (C.bare) rise(ctx, ellipsis(up(kicker), C.cw, 1), C.x, C.py + 6, seg(dt, 0.2, 0.35), S.fog);
  else rise(ctx, kicker, C.x, C.py + 7, seg(dt, 0.2, 0.35), S.microFog);
  const big = textW(frame, 2) <= C.cw - beside;
  rise(ctx, frame, C.x, C.py + 15 + k, seg(dt, 0.25, 0.35), big ? S.white2 : S.white);
  return C.py + 15 + k + (big ? 14 : 7) + 7;
}

function drawCountdown(ctx, dt, x, y, w, cd, h = 3) {
  if (!cd || dt < cd.at) return;
  const { n, lit } = countdownCells(cd, dt);
  const gap = 2;
  const cw = Math.max(2, Math.floor((w - gap * (n - 1)) / n));
  const vis = Math.round((cw * n + gap * (n - 1)) * ease(dt, cd.at, 0.15));
  ctx.save();
  try {
    clipRect(ctx, x, y, vis, h);
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i < lit ? P.white : P.slate;
      ctx.fillRect(x + i * (cw + gap), y, cw, h);
    }
  } finally {
    ctx.restore();
  }
}
const STAKE_W = 34;
function drawFoot(ctx, dt, x, y, w, cd, stake) {
  if (!cd || dt < cd.at) return;
  const sw = stake ? Math.max(STAKE_W, measureText(stake, 1, 'micro') + 5) : STAKE_W;
  drawCountdown(ctx, dt, x, y, w - sw, cd);
  if (stake) drawText(ctx, stake, x + w - measureText(stake, 1, 'micro'), y - 1, S.microWhite);
}
function drawCredit(ctx, lines, x, y, dt, at, align = 'left', w = 0) {
  lines.forEach((l, i) => {
    const lx = align === 'right' ? x + w - measureText(l, 1, 'micro') : align === 'center' ? x + Math.round((w - measureText(l, 1, 'micro')) / 2) : x;
    rise(ctx, l, lx, y + i * 6, seg(dt, at + i * 0.06, 0.3), S.microFog);
  });
}
const doubleName = (o) => (o.double ? nameOf(o.players, o.double) : null);

// ---------------------------------------------------------------- HOW MANY?

function vHowMany(ctx, dt, o, box) {
  const q = o.question;
  if (!q?.masked) return;
  const C = cols(box);
  const revealAt = o.revealAt ?? Infinity;
  const revealed = dt >= revealAt;
  ctx.save();
  try {
    if (!panel(ctx, dt, C.px, C.py, C.pw, C.ph, C.bare)) return;
    let y = header(ctx, dt, C, o.kicker || kickerOf({ type: 'howmany' }), o.frame || frameOf('howmany'));
    const L = revealed ? layoutText(q.masked, C.cw, 12, q.sentence) : layoutText(q.masked, C.cw, 12);
    drawLines(ctx, L, C.x, y + 2, P.white, revealed ? dt : entry(C, dt), revealed ? revealAt : 0.35);
    y += 2 + L.h + 10;
    // the desks' guess boxes, one under the other, up from the first moments (empty: three slate dots)
    // (on the glass a guess box is 25 px and the guess stands at 2x when it fits: the game's own numbers large)
    const GB = C.bare ? { h: 25, pitch: 29, gy: 9 } : { h: 17, pitch: 21, gy: 5 };
    ['A', 'B'].forEach((seat, i) => {
      const bp = ease(entry(C, dt), 0.45 + 0.1 * i, 0.3);
      if (bp <= 0) return;
      const bx = C.x;
      const by = y + i * GB.pitch;
      const bw = C.cw;
      const g = (o.guesses || []).find((x) => x.seat === seat) || null;
      ctx.save();
      try {
        clipRect(ctx, bx, by, Math.round(bw * bp), GB.h);
        ctx.fillStyle = P.slate;
        ctx.fillRect(bx, by, bw, GB.h);
        ctx.fillStyle = P.black;
        ctx.fillRect(bx + 1, by + 1, bw - 2, GB.h - 2);
        const gy = by + GB.gy;
        const mw = drawMark(ctx, seat, nameOf(o.players, seat), bx + 5, gy, 'id');
        const lx = bx + 5 + mw + 5;
        const lw = measureText('GUESS', 1, 'micro') + 4;
        ctx.fillStyle = P.slate;
        ctx.fillRect(lx, gy - 1, lw, 9);
        drawText(ctx, 'GUESS', lx + 2, gy + 1, S.microSilver);
        const vx = lx + lw + 4;
        const p = g ? ease(dt, g.at ?? 0, 0.25) : 0;
        if (p <= 0) {
          ctx.fillStyle = P.slate;
          for (let k = 0; k < 3; k++) ctx.fillRect(vx + 3 * k, gy + 6, 1, 1);
          return;
        }
        const said = up(g.said);
        if (C.bare && textW(said, 2) + 10 <= bx + bw - vx) {
          // on the glass: the guess at 2x, lit gold at the reveal when it scored, its points beside it
          ctx.save();
          try {
            clipRect(ctx, vx - 2, by + 2, Math.round((bx + bw - vx) * p), GB.h - 4);
            const scored = revealed && (g.points || 0) > 0 && ease(dt, revealAt + 0.45, 0.2) >= 1;
            drawText(ctx, said, vx, gy - 4, { color: scored ? P.yellow : revealed ? P.silver : P.white, scale: 2 });
            if (scored) drawText(ctx, `+${g.points}`, vx + textW(said, 2) + 4, gy, S.white);
          } finally {
            ctx.restore();
          }
          return;
        }
        ctx.save();
        try {
          clipRect(ctx, vx - 2, gy - 3, Math.round((bx + bw - vx) * p), 14);
          const scored = revealed && (g.points || 0) > 0;
          if (scored) {
            const gp = ease(dt, revealAt + 0.45, 0.2);
            const pw = textW(said, 1) + 4;
            const gw = Math.round(pw * gp);
            ctx.fillStyle = P.yellow;
            if (gw >= 1) ctx.fillRect(vx - 2, gy - 2, gw, 11);
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
    const footY = C.py + C.ph - 14;
    // the space under the guesses has a job, all question long (the board is on screen while the host reads it; the
    // countdown often runs over the players' faces): YOUR GUESS? at 2x over an empty answer box at 3x height, its
    // cursor blinking on the bed's half notes, the countdown under it while it runs; at the reveal the answer lands in
    // the box in the reveal's yellow (the box widens to it), its label under it. The box is one width whatever the
    // answer, so it gives nothing away. On a short stage, the countdown at the foot.
    const midTop = y + 2 * GB.pitch + (C.bare ? 2 : 6);
    const midH = footY - 6 - midTop;
    const cx = C.x + (C.cw >> 1);
    const fig = q.figure || null;
    const value = up(fig ? `${fig.qualifier ? `${fig.qualifier} ` : ''}${fig.value}` : '');
    // (a short board keeps the module, compact: a 21-row box, the answer at 2x, the countdown at the foot)
    const full = midH >= 58;
    const compact = !full && midH >= 42;
    const big = full && value && textW(value, 3) <= C.cw - 10 ? 3 : 2;
    // (on the glass the module is settled from the board's first frame, like its header: nothing half open)
    const me = C.bare ? settled(C, dt) : entry(C, dt);
    if (full || compact) {
      const my = midTop + ((midH - (full ? 58 : 41)) >> 1);
      const p = ease(me, 0.75, 0.3);
      if (p > 0) {
        const head = revealed ? 'THE ANSWER' : 'YOUR GUESS?';
        const hw = textW(head, 2);
        if (revealed) drawText(ctx, head, cx - (hw >> 1), my, S.white2);
        else rise(ctx, head, cx - (hw >> 1), my, seg(me, 0.75, 0.3), S.white2);
        const bw0 = Math.min(C.cw, 96);
        const bw = revealed && value ? Math.min(C.cw, Math.max(bw0, textW(value, big) + 12)) : bw0;
        const bh = full ? 27 : 21;
        const by = my + 20;
        const open = Math.round(bw * p);
        ctx.fillStyle = P.slate;
        ctx.fillRect(cx - (open >> 1), by, open, bh);
        ctx.fillStyle = P.black;
        if (open > 2) ctx.fillRect(cx - (open >> 1) + 1, by + 1, open - 2, bh - 2);
        if (p >= 1) {
          if (!revealed) {
            // the cursor: a 3x caret on the half notes
            if (Math.floor(dt / HALF_NOTE) % 2 === 0) {
              ctx.fillStyle = P.white;
              ctx.fillRect(cx - 1, by + 3, 3, bh - 6);
            }
          } else if (value) {
            const vw = textW(value, big);
            rise(ctx, value, cx - (vw >> 1), by + (big === 3 ? 3 : full ? 6 : 3), seg(dt, revealAt + 0.15, 0.3), { color: P.yellow, scale: big });
          }
        }
        const cd = o.countdown || null;
        if (!revealed && cd && dt >= cd.at) {
          if (full) drawCountdown(ctx, dt, C.x + ((C.cw - 140) >> 1), by + bh + 6, 140, cd, 5);
          else drawCountdown(ctx, dt, C.x + ((C.cw - 128) >> 1), footY + 4, 128, cd);
        }
        const label = revealed && full ? up(fig?.label || '') : '';
        if (label) rise(ctx, label, cx - (measureText(label, 1, 'micro') >> 1), by + bh + 6, seg(dt, revealAt + 0.3, 0.3), S.microSilver);
      }
    } else {
      // a long question leaves a strip under the guesses: on the glass it still has a job, the module's words alone
      // (YOUR GUESS? at 2x; at the reveal the answer at 2x in the reveal's yellow), centred in it
      if (C.bare && midH >= 16) {
        if (revealed && value) {
          // THE ANSWER over the figure when the strip has room for both (the figure at 3x when it has more), else
          // the figure alone at 2x
          const labelled = midH >= 25;
          const vs = labelled && midH >= 32 && textW(value, 3) <= C.cw ? 3 : textW(value, 2) <= C.cw ? 2 : 1;
          const bh = (labelled ? 11 : 0) + 7 * vs;
          const my = midTop + ((midH - bh) >> 1);
          if (labelled) drawText(ctx, 'THE ANSWER', cx - (textW('THE ANSWER', 1) >> 1), my, S.silver);
          const vw = textW(value, vs);
          rise(ctx, value, cx - (vw >> 1), my + (labelled ? 11 : 0), seg(dt, revealAt + 0.15, 0.3), { color: P.yellow, scale: vs });
        } else if (!revealed) {
          const head = 'YOUR GUESS?';
          drawText(ctx, head, cx - (textW(head, 2) >> 1), midTop + ((midH - 14) >> 1), S.white2);
        }
      }
      if (!revealed) drawCountdown(ctx, dt, C.x + ((C.cw - 128) >> 1), footY + 4, 128, o.countdown || null);
    }
    if (revealed) drawCredit(ctx, creditLines(o.credit || creditOf(q.aired, o), C.cw, 2, 'REPORTED'), C.x, footY, dt, revealAt + 0.3);
  } finally {
    ctx.restore();
  }
}

// ---------------------------------------------------------------- WHERE IN THE WORLD?

const DEG = Math.PI / 180;
const SIDES = [[1, 0], [-1, 0], [1, -1], [1, 1], [-1, -1], [-1, 1], [0, -1], [0, 1]];
function tagSize(opt, nMarks, names) {
  const label = up(opt.label || opt.country);
  const lines = textW(label, 1) > 80 ? balanceLines(label, 80, 1, 2) : [label];
  const lw = Math.max(...lines.map((l) => textW(l, 1)));
  const w = 1 + 9 + 3 + lw + 3 + 1;
  const h = lines.length * LINE + 1;
  const mw = nMarks ? Math.max(...names.map(markWidth)) : 0;
  return { lines, w, h, bw: Math.max(w, mw), bh: h + (nMarks ? 2 + nMarks * 9 - 2 : 0) };
}
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
const WHERE = new WeakMap();
function whereLayoutV(q, locks, mw, mh) {
  const key = `${mw}x${mh}|${locks.map((l) => `${l.seat}${l.answer}${l.name || ''}`).join(',')}`;
  let per = WHERE.get(q);
  if (!per) WHERE.set(q, (per = new Map()));
  let L = per.get(key);
  if (L) return L;
  const opts = (q.options || []).slice(0, 3).filter((x) => Number.isFinite(x?.lat) && Number.isFinite(x?.lon));
  if (!opts.length) return null;
  const frame = framePins(opts, mw, mh);
  const v0 = mapView(frame, mw, mh);
  const right = opts.find((x) => x.letter === q.answer) || opts[0];
  const zEnd = clamp(frame.zoom * 2, 4, 8);
  const vEnd = mapView({ lat: right.lat, lon: right.lon, zoom: zEnd }, mw, mh);
  const names = (letter) => locks.filter((l) => l.answer === letter).map((l) => l.name || l.seat);
  const tags = opts.map((x) => tagSize(x, names(x.letter).length, names(x.letter)));
  const pts = opts.map((x) => mapPoint(v0, x.lat, x.lon));
  const sides = placeTags(pts, tags, mw, mh);
  const ri = opts.indexOf(right);
  const pe = mapPoint(vEnd, right.lat, right.lon);
  const keep = tagBox(pe.x, pe.y, tags[ri], SIDES[sides[ri]]);
  const fitsEnd = keep.x >= 2 && keep.y >= 2 && keep.x + keep.w <= mw - 2 && keep.y + keep.h <= mh - 2;
  const endSide = fitsEnd ? sides[ri] : placeTags([pe], [tags[ri]], mw, mh)[0];
  L = { opts, frame, vEnd: { lat: right.lat, lon: right.lon, zoom: zEnd }, tags, sides, endSide };
  if (per.size > 4) per.delete(per.keys().next().value);
  per.set(key, L);
  return L;
}
const MOVE = { at: 0.8, dur: 1.4 };
function viewAt(W2, dt, revealAt) {
  const k = easeInOutSine(seg(dt, revealAt + MOVE.at, MOVE.dur));
  if (k <= 0) return W2.frame;
  const a = W2.frame;
  const b = W2.vEnd;
  let dl = b.lon - a.lon;
  dl -= Math.round(dl / 360) * 360;
  return { lat: a.lat + (b.lat - a.lat) * k, lon: a.lon + dl * k, zoom: Math.exp(Math.log(a.zoom) + (Math.log(b.zoom) - Math.log(a.zoom)) * k) };
}
const NAMED = new WeakMap();
function namedLocks(list, players) {
  if (!Array.isArray(list)) return [];
  const hit = NAMED.get(list);
  if (hit && hit.players === players) return hit.locks;
  const locks = list.filter((l) => l && l.seat && l.answer).map((l) => ({ ...l, name: nameOf(players, l.seat) })).sort((a, b) => (a.seat < b.seat ? -1 : 1));
  NAMED.set(list, { players, locks });
  return locks;
}

function vWhere(ctx, dt, o, box) {
  const q = o.question;
  if (!q?.options?.length) return;
  const C = cols(box);
  const revealAt = o.revealAt ?? Infinity;
  const revealed = dt >= revealAt;
  const pinsAt = o.pinsAt ?? 0.8;
  const locks = namedLocks(o.locks, o.players);
  ctx.save();
  try {
    if (!panel(ctx, dt, C.px, C.py, C.pw, C.ph, C.bare)) return;
    let y = header(ctx, dt, C, o.kicker || kickerOf({ type: 'where' }), o.frame || frameOf('where'));
    const H1 = revealed && q.masked ? layoutText(q.masked, C.cw, 5, q.words) : layoutText(q.masked || q.words, C.cw, 5);
    drawLines(ctx, H1, C.x, y + 1, P.white, revealed && q.masked ? dt : entry(C, dt), revealed && q.masked ? revealAt : 0.35);
    // (room for the headline's longer layout, masked or whole, so the map never moves at the reveal)
    const Hmax = Math.max(H1.h, layoutText(q.masked || q.words, C.cw, 5).h, q.masked ? layoutText(q.masked, C.cw, 5, q.words).h : 0);
    y += 1 + Hmax + 7;
    const footH = 14;
    const MX = C.px + 2;
    const MW = C.pw - 4;
    const MY = y;
    const MH = C.py + C.ph - footH - 3 - MY;
    const W2 = whereLayoutV(q, locks, MW, MH);
    if (!W2) return;
    const mp = ease(entry(C, dt), 0.3, 0.3);
    if (mp > 0) {
      ctx.save();
      try {
        clipRect(ctx, MX - 1, MY - 1, Math.round((MW + 2) * mp), MH + 2);
        ctx.fillStyle = P.slate;
        ctx.fillRect(MX - 1, MY - 1, MW + 2, MH + 2);
        const view = viewAt(W2, dt, revealAt);
        drawWorldMap(ctx, dt, dt, { view, x: MX, y: MY, w: MW, h: MH });
        const v = mapView(view, MW, MH);
        clipRect(ctx, MX, MY, MW, MH);
        W2.opts.forEach((opt, i) => {
          const at = pinsAt + i * 0.35;
          if (dt < at) return;
          const pt = mapPoint(v, opt.lat, opt.lon);
          const px = MX + pt.x;
          const py = MY + pt.y;
          const state = tileState(opt.letter, q.answer, revealed);
          const gone = state === 'wrong' ? ease(dt, revealAt + MOVE.at - 0.2, 0.2) : 0;
          if (gone >= 1) return;
          ctx.fillStyle = P.black;
          ctx.fillRect(px - 2, py - 2, 5, 5);
          ctx.fillStyle = state === 'right' ? P.yellow : state === 'wrong' ? P.fog : P.white;
          ctx.fillRect(px - 1, py - 1, 3, 3);
          const t = W2.tags[i];
          const side = state === 'right' ? SIDES[W2.endSide] : SIDES[W2.sides[i]];
          const b = tagBox(px, py, t, side);
          const tvis = Math.round(b.w * ease(dt, at + 0.1, 0.2) * (1 - gone));
          ctx.save();
          try {
            clipRect(ctx, b.x, b.y, tvis, b.h);
            if (tvis >= 1) {
              const c = TILE_COLORS[state];
              ctx.fillStyle = c.rim;
              ctx.fillRect(b.x, b.y, t.w, t.h);
              ctx.fillStyle = c.fill;
              ctx.fillRect(b.x + 1, b.y + 1, t.w - 2, t.h - 2);
              ctx.fillStyle = c.badge;
              ctx.fillRect(b.x + 1, b.y + 1, 9, t.h - 2);
              drawText(ctx, opt.letter, b.x + 1 + ((9 - textW(opt.letter, 1)) >> 1), b.y + ((t.h - 7) >> 1), styleOf(c.letter));
              t.lines.forEach((l, k) => drawText(ctx, l, b.x + 13, b.y + 2 + k * LINE, styleOf(c.text)));
            }
          } finally {
            ctx.restore();
          }
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
    const footY = C.py + C.ph - footH + 1;
    if (!revealed) drawCountdown(ctx, dt, C.x + ((C.cw - 128) >> 1), footY + 4, 128, o.countdown || null);
    else drawCredit(ctx, creditLines(o.credit || creditOf(q.aired, o), C.cw, 2), C.x, footY, dt, revealAt + 0.3);
  } finally {
    ctx.restore();
  }
}

// ---------------------------------------------------------------- LETTER BY LETTER

const LT = { w: 11, h: 15, row: 18, word: 6, s: 1 };
// on the glass the tiles at 2x when every word fits the column and the rows fit the board: the game's own pieces large
// (a narrower tile, 13 px, for a headline with a long word: the 2x letter is 10 px)
const LT2 = { w: 15, h: 21, row: 25, word: 8, s: 2 };
const LT2N = { w: 13, h: 19, row: 23, word: 7, s: 2 };
const LETTER_RE = /[\p{L}\p{N}]/u;
const LETTERS = new Map();
/** The letter tiles at the column's width (quiz-fit.js lettersLayout's rules: words whole, rows centred). */
function lettersLayoutV(words, cw, T = LT) {
  const key = `${cw}|${T.s}|${words}`;
  let L = LETTERS.get(key);
  if (L) return L;
  const chars = [...String(words ?? '')];
  const ws = [];
  let cur = [];
  chars.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      if (cur.length) ws.push(cur);
      cur = [];
    } else cur.push({ i, ch, tile: LETTER_RE.test(ch), w: LETTER_RE.test(ch) ? T.w : measureText(ch, T.s) });
  });
  if (cur.length) ws.push(cur);
  const widthOf = (wd) => wd.reduce((t, c, k) => t + c.w + (k ? 1 : 0), 0);
  const rows = [];
  let row = null;
  for (const wd of ws) {
    const w = widthOf(wd);
    if (row && row.w + T.word + 1 + w <= cw) {
      row.words.push(wd);
      row.w += T.word + 1 + w;
    } else {
      row = { words: [wd], w };
      rows.push(row);
    }
  }
  const cells = [];
  rows.forEach((r, ri) => {
    let x = Math.round((cw - r.w) / 2);
    const y = ri * T.row;
    r.words.forEach((wd, wi) => {
      if (wi) x += T.word + 1;
      wd.forEach((c, k) => {
        if (k) x += 1;
        cells.push({ ...c, x, y });
        x += c.w;
      });
    });
  });
  L = { cells, rows: rows.length, h: rows.length * T.row - 3, T, fits: rows.every((r) => r.w <= cw) };
  if (LETTERS.size > 40) LETTERS.delete(LETTERS.keys().next().value);
  LETTERS.set(key, L);
  return L;
}

function vLetters(ctx, dt, o, box) {
  const q = o.question;
  if (!q?.words) return;
  const C = cols(box);
  const revealAt = o.revealAt ?? Infinity;
  const revealed = dt >= revealAt;
  const times = o.stageTimes || [];
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
    if (!panel(ctx, dt, C.px, C.py, C.pw, C.ph, C.bare)) return;
    let y = header(ctx, dt, C, o.kicker || kickerOf({ type: 'letters', desk: q.desk }), o.frame || frameOf('letters'));
    // the buzzer lamps on their own row: unlit, lit gold on a buzz, slate and OUT on a stall
    const players = o.players?.length ? o.players : [{ seat: 'A', name: '' }, { seat: 'B', name: '' }];
    let lx = C.x;
    players.forEach((pl) => {
      const b = (o.buzzes || []).find((x) => x.seat === pl.seat && dt >= (x.at ?? Infinity));
      const out = b?.stall && dt >= b.at + 0.9;
      const w = markWidth(pl.name);
      if (entry(C, dt) >= 0.4) {
        drawMark(ctx, pl.seat, pl.name, lx, y, b && !out ? 'lit' : 'off');
        if (out) drawText(ctx, 'OUT', lx + w + 3, y + 1, S.microFog);
      }
      lx += w + (out ? measureText('OUT', 1, 'micro') + 3 : 0) + 14;
    });
    y += 14;
    const footH = 14;
    const room = C.py + C.ph - footH - y;
    const fit = (T) => {
      const l = C.bare ? lettersLayoutV(q.words, C.cw, T) : null;
      return l && l.fits && l.h <= room ? l : null;
    };
    const L = fit(LT2) || fit(LT2N) || lettersLayoutV(q.words, C.cw);
    const T = L.T;
    const top = y + Math.max(0, Math.round((room - L.h) / 2));
    const tilesIn = ease(entry(C, dt), 0.45, 0.35);
    if (tilesIn > 0) {
      ctx.save();
      try {
        clipRect(ctx, C.x, top - 2, Math.round(C.cw * tilesIn), L.rows * T.row + 2);
        const gold = revealed && o.winner ? ease(dt, revealAt, 0.3) : 0;
        const fresh = L.cells.filter((c) => c.tile && shown.has(c.i) && !prev.has(c.i));
        for (const cell of L.cells) {
          const cx = C.x + cell.x;
          const cy = top + cell.y;
          const goldHere = gold > 0 && cell.x <= C.cw * gold;
          if (cell.tile) {
            if (goldHere) {
              ctx.fillStyle = P.yellow;
              ctx.fillRect(cx, cy, T.w, T.h);
            } else purpleBox(ctx, cx, cy, T.w, T.h);
          }
          const show = revealed || shown.has(cell.i);
          if (!show) continue;
          if (!cell.tile) {
            drawText(ctx, cell.ch, cx, cy + (T.s === 2 ? 4 : 4), T.s === 2 ? S.white2 : S.white);
            continue;
          }
          const k = fresh.indexOf(cell);
          const at = revealed && !shown.has(cell.i) ? revealAt : k >= 0 ? stageAt + (0.3 * k) / Math.max(1, fresh.length) : -1;
          const p = seg(dt, at, 0.15);
          if (p <= 0) continue;
          const off = Math.round((1 - easeOutQuint(p)) * (T.h - 4));
          ctx.save();
          try {
            clipRect(ctx, cx + 1, cy + 1, T.w - 2, T.h - 2);
            drawText(ctx, cell.ch, cx + ((T.w - textW(cell.ch, T.s)) >> 1), cy + (T.s === 2 ? 4 : 4) + off, goldHere ? (T.s === 2 ? { color: P.black, scale: 2 } : S.black) : T.s === 2 ? S.white2 : S.white);
          } finally {
            ctx.restore();
          }
        }
      } finally {
        ctx.restore();
      }
    }
    const footY = C.py + C.ph - footH + 1;
    if (!revealed) drawFoot(ctx, gt, C.x + ((C.cw - 128 - STAKE_W) >> 1), footY + 4, 128 + STAKE_W, o.countdown || null, stakeOf('letters', stage, doubleName(o)));
    else drawCredit(ctx, creditLines(o.credit || creditOf(q.aired, o), C.cw, 2), C.x, footY, dt, revealAt + 0.3);
  } finally {
    ctx.restore();
  }
}

// ---------------------------------------------------------------- TODAY OR NOT TODAY?

const LAMPS = ['TODAY', 'EARLIER'];
function vToday(ctx, dt, o, box) {
  const it = o.item;
  if (!it?.words) return;
  const C = cols(box);
  const revealAt = o.revealAt ?? Infinity;
  const revealed = dt >= revealAt;
  const total = o.total || 6;
  ctx.save();
  try {
    if (!panel(ctx, dt, C.px, C.py, C.pw, C.ph, C.bare)) return;
    let y = header(ctx, dt, C, o.kicker || kickerOf({ type: 'today', k: (o.index ?? 0) + 1, n: total }), o.frame || frameOf('today'));
    const pad = 4;
    const L = layoutText(it.words, C.cw - 2 * pad - 2, 4);
    const ch = L.h + 2 * pad + 2;
    const cp = ease(entry(C, dt), 0.35, 0.25);
    if (cp > 0) {
      ctx.save();
      try {
        clipRect(ctx, C.x, y, Math.round(C.cw * cp), ch);
        purpleBox(ctx, C.x, y, C.cw, ch);
        drawLines(ctx, L, C.x + C.cw / 2, y + pad + 1, P.white, entry(C, dt), 0.45, 'center');
      } finally {
        ctx.restore();
      }
    }
    y += ch + 9;
    const lampW = LAMPS.map((t) => textW(t, 1) + 6);
    const blockW = lampW[0] + 3 + lampW[1];
    (o.players || []).slice(0, 2).forEach((pl, i) => {
      if (dt < 0.5) return;
      const x = C.x;
      const by = y + i * 40;
      drawMark(ctx, pl.seat, pl.name, x, by, 'id');
      const lock = (o.locks || []).find((l) => l.seat === pl.seat && dt >= (l.at ?? Infinity));
      let lx = x;
      LAMPS.forEach((word, k) => {
        const chosen = lock?.answer === word;
        const wrong = revealed && chosen && word !== it.answer;
        const ly = by + 11;
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
    // the stamp at the reveal, right of the players: the answer and when it aired
    if (revealed) {
      const c = o.credit || creditOf(it.aired, o);
      const l1 = it.answer === 'TODAY' ? 'TODAY' : 'EARLIER';
      const room = C.cw - blockW - 10;
      const parts = it.answer === 'TODAY' ? [[c?.title, c?.time].filter(Boolean).join(' ')] : [c?.title || '', [c?.day && c.day.length > 3 ? c.day.slice(0, 3) : c?.day, c?.time].filter(Boolean).join(' ')];
      const lines = [l1, ...parts.filter(Boolean)].map((l) => ellipsis(l, room - 12, 1));
      const sw = Math.max(...lines.map((l) => textW(l, 1))) + 12;
      const sh = lines.length * LINE - 3 + 10;
      const sx = C.x + C.cw - sw;
      const sy = y + Math.max(0, ((80 - 9) - sh) >> 1);
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
        lines.forEach((l, k) => drawText(ctx, l, sx + ((sw - textW(l, 1)) >> 1), sy + 5 + k * LINE, k ? S.silver : S.white));
      } finally {
        ctx.restore();
      }
      if (c?.source) drawCredit(ctx, [`SOURCE: ${c.source}`], C.x, C.py + C.ph - 10, dt, revealAt + 0.2, 'right', C.cw);
    } else drawCountdown(ctx, dt, C.x + ((C.cw - 128) >> 1), C.py + C.ph - 9, 128, o.countdown || null);
  } finally {
    ctx.restore();
  }
}

// ---------------------------------------------------------------- PICTURE THIS

const PICW = 128;
const PICH = 64;
function vPicture(ctx, dt, o, box) {
  const q = o.question;
  if (!q?.options?.length) return;
  const C = cols(box);
  const optionsAt = o.optionsAt ?? 0.6;
  const cd = o.countdown || null;
  const revealAt = o.revealAt ?? Infinity;
  const revealed = dt >= revealAt;
  const stepTimes = o.stepTimes || [0, cd ? cd.at : Infinity, cd ? cd.at + 2 * HALF_NOTE : Infinity, cd ? cd.at + 4 * HALF_NOTE : Infinity];
  ctx.save();
  try {
    if (!panel(ctx, dt, C.px, C.py, C.pw, C.ph, C.bare)) return;
    // the players' shapes and names on the frame's row (the tiles' marks below are their shapes alone)
    const players = (o.players || []).slice(0, 2);
    const legendW = players.reduce((t, p) => t + markWidth(p.name) + 8, 0);
    let y = header(ctx, dt, C, o.kicker || kickerOf({ type: 'picture' }), o.frame || frameOf('picture'), legendW);
    if (entry(C, dt) >= 0.4) {
      let lx = C.r - legendW + 8;
      for (const p of players) {
        drawMark(ctx, p.seat, p.name, lx, C.py + 18, 'id');
        lx += markWidth(p.name) + 8;
      }
    }
    // the picture, centred, in its slate frame: a step on each beat, the whole picture at the reveal
    const px = C.x + ((C.cw - PICW) >> 1);
    const py = y - 2;
    ctx.fillStyle = P.slate;
    ctx.fillRect(px - 1, py - 1, PICW + 2, PICH + 2);
    ctx.fillStyle = P.ink;
    ctx.fillRect(px, py, PICW, PICH);
    const step = pictureStepAt(dt, stepTimes, revealAt);
    const faces = step && o.image ? preparePicture(o.image, q.steps || [8, 16, 32, 64]) : null;
    if (faces) {
      const smooth = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      const f = step === 'full' ? { canvas: faces.full, blocks: PICW, rows: PICH } : faces.faces[step - 1];
      ctx.drawImage(f.canvas, 0, 0, f.blocks, f.rows, px, py, PICW, PICH);
      ctx.imageSmoothingEnabled = smooth;
    }
    y = py + PICH + 4;
    if (!revealed) drawFoot(ctx, dt, px, y + 1, PICW, cd, stakeOf('picture', step, doubleName(o)));
    else drawCredit(ctx, creditLines(o.credit || creditOf(q.aired, o), C.cw, 1), C.x, y - 1, dt, revealAt + 0.25, 'center', C.cw);
    y += 9;
    // the three tiles (the desk's 150 px text width, three lines at most), each with its lock-in shapes at the right
    const tw = 1 + 9 + 3 + TILE_TEXT_W + 3 + 1;
    const tx = C.x + ((C.cw - tw - 12) >> 1);
    const locks = (o.locks || []).filter((l) => l && l.seat && l.answer);
    const layouts = q.options.slice(0, 3).map((opt) => tileLayout(opt.words));
    const th = Math.max(...layouts.map((L) => L.h)) + 6;
    q.options.slice(0, 3).forEach((opt, i) => {
      const at = optionsAt + i * 0.15;
      const vis = Math.round(tw * ease(dt, at, 0.25));
      if (vis < 1) return;
      const ty = y + i * (th + 3);
      const L = layouts[i];
      const state = tileState(opt.letter, q.answer, revealed);
      const gold = ease(dt, revealAt, 0.2);
      ctx.save();
      try {
        clipRect(ctx, tx, ty, vis, th);
        const c = TILE_COLORS[state];
        ctx.fillStyle = c.rim;
        ctx.fillRect(tx, ty, tw, th);
        ctx.fillStyle = c.fill;
        ctx.fillRect(tx + 1, ty + 1, tw - 2, th - 2);
        if (state === 'right' && gold < 1) {
          const oc = TILE_COLORS.open;
          const gx = tx + Math.round(tw * gold);
          ctx.fillStyle = oc.rim;
          ctx.fillRect(gx, ty, tx + tw - gx, th);
          ctx.fillStyle = oc.fill;
          ctx.fillRect(gx, ty + 1, tx + tw - 1 - gx, th - 2);
        }
        const lit = state === 'right' && gold >= 1;
        const cc = state === 'right' && !lit ? TILE_COLORS.open : c;
        ctx.fillStyle = state === 'right' ? c.badge : cc.badge;
        ctx.fillRect(tx + 1, ty + 1, 9, th - 2);
        drawText(ctx, opt.letter, tx + 1 + ((9 - textW(opt.letter, 1)) >> 1), ty + ((th - 7) >> 1), styleOf(state === 'right' ? c.letter : cc.letter));
        if (dt >= at + 0.1) drawLines(ctx, L, tx + 13, ty + ((th - L.h) >> 1), lit ? c.text : cc.text);
      } finally {
        ctx.restore();
      }
      const here = locks.filter((l) => l.answer === opt.letter).sort((a, b) => (a.seat < b.seat ? -1 : 1));
      here.forEach((l, k) => {
        const p = ease(dt, l.at ?? 0, 0.15);
        if (p <= 0) return;
        drawSeat(ctx, l.seat, tx + tw + 4, ty + (here.length === 1 ? (th - 7) >> 1 : 2 + k * 9), revealed && opt.letter !== q.answer ? P.slate : P.yellow);
      });
    });
  } finally {
    ctx.restore();
  }
}

// ---------------------------------------------------------------- the round's card, DOUBLE OR NOTHING, the scores, the table

const ORDINALS = ['ONE', 'TWO', 'THREE', 'FOUR'];
const ROUND_TITLES = { picture: 'PICTURE THIS', letters: 'LETTER BY LETTER', where: 'WHERE IN THE WORLD?', today: 'TODAY OR NOT TODAY?', howmany: 'HOW MANY?' };
const RULES = { picture: 'LOCK IN EARLY: 3, 2 OR 1 POINTS', letters: 'FIRST TO NAME IT: 3, 2 OR 1 POINTS', where: 'THE RIGHT PIN: 2 POINTS', today: 'ONE POINT A HEADLINE', howmany: 'THE CLOSEST GUESS: 2 POINTS', howmanyExact: 'THE CLOSEST GUESS 2, EXACTLY RIGHT 3' };
const DESKS = { world: 'WORLD', business: 'BUSINESS', tech: 'TECHNOLOGY', science: 'SCIENCE', sport: 'SPORT' };
const centred = (C, h) => C.py + Math.max(0, Math.round((C.ph - h) / 2));

function vRound(ctx, dt0, o, box) {
  const title = o.sudden ? 'SUDDEN DEATH' : ROUND_TITLES[o.type] || up(o.title || '');
  if (!title) return;
  const C = cols(box);
  const dt = settled(C, dt0);
  const kicker = o.sudden ? 'TIE-BREAK' : o.k ? `ROUND ${ORDINALS[o.k - 1] || o.k}` : '';
  const rule = o.sudden ? 'FIRST TO NAME THE HEADLINE WINS' : (o.type === 'howmany' && o.exact ? RULES.howmanyExact : RULES[o.type]) || '';
  // the round's name is the clip's first picture: 3x when it fits one line of the column, else 2x on up to two (on
  // the glass: 3x on up to two lines, the round's number at 2x in gold over it)
  const three = C.bare ? balanceLines(title, C.cw, 3, 2) : [title];
  const big = C.bare ? !three[three.length - 1]?.endsWith('...') : textW(title, 3) <= C.cw;
  const ts = big ? 3 : 2;
  const lh = big ? 25 : 18;
  const tl = big ? three : balanceLines(title, C.cw, 2, 2);
  const rl = balanceLines(rule, C.cw, 1, 2);
  const kh = C.bare ? 9 : 0;
  const h = 12 + kh + tl.length * lh + 8 + rl.length * 11 + 8;
  const y = centred(C, h);
  ctx.save();
  try {
    if (!panel(ctx, dt, C.px, y, C.pw, h, C.bare)) return;
    if (C.bare) rise(ctx, kicker, C.x, y + 4, seg(dt, 0.2, 0.3), { color: P.yellow, scale: 2 });
    else rise(ctx, kicker, C.x, y + 8, seg(dt, 0.2, 0.3), S.microFog);
    tl.forEach((l, i) => rise(ctx, l, C.x, y + 17 + kh + i * lh, seg(dt, 0.28 + i * 0.06, 0.35), big ? S.white3 : S.white2));
    const ry = y + 17 + kh + tl.length * lh - 1;
    const rp = ease(dt, 0.4, 0.3);
    if (rp > 0) purpleBox(ctx, C.x, ry, Math.max(3, Math.round(Math.max(...tl.map((l) => textW(l, ts))) * rp)), 3);
    rl.forEach((l, i) => rise(ctx, l, C.x, ry + 8 + i * 11, seg(dt, 0.5 + i * 0.06, 0.3), S.silver));
  } finally {
    ctx.restore();
  }
}

function vDouble(ctx, dt, o, box) {
  const offered = (o.offered || []).slice(0, 2);
  if (!offered.length || !o.player) return;
  const C = cols(box);
  const h = 118;
  const y = centred(C, h);
  const pickAt = o.pick ? o.pickAt ?? 0 : Infinity;
  ctx.save();
  try {
    if (!panel(ctx, dt, C.px, y, C.pw, h, C.bare)) return;
    const de = settled(C, dt);
    const bp = ease(de, 0.2, 0.3);
    if (bp > 0) {
      ctx.save();
      try {
        clipRect(ctx, C.x, y + 8, Math.round(C.cw * bp), 40);
        purpleBox(ctx, C.x, y + 8, C.cw, 40);
        ['DOUBLE OR', 'NOTHING'].forEach((l, i) => drawText(ctx, l, C.x + ((C.cw - textW(l, 2)) >> 1), y + 13 + i * 18, S.white2));
      } finally {
        ctx.restore();
      }
    }
    const name = nameOf(o.players, o.player);
    const line = offered.length > 1 ? 'PICKS THE DESK' : 'PLAYS FOR DOUBLE POINTS';
    const lw = markWidth(name) + 6 + textW(line, 1);
    const lx = C.x + ((C.cw - lw) >> 1);
    if (de >= 0.45) {
      drawMark(ctx, o.player, name, lx, y + 56, 'id');
      drawText(ctx, line, lx + markWidth(name) + 6, y + 56, S.silver);
    }
    const tw = offered.length > 1 ? (C.cw - 8) >> 1 : 120;
    const total = offered.length * tw + (offered.length - 1) * 8;
    offered.forEach((desk, i) => {
      const tx = C.x + ((C.cw - total) >> 1) + i * (tw + 8);
      const ty = y + 70;
      const p = ease(de, 0.55 + i * 0.12, 0.25);
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
    const other = o.leader || (o.player === 'A' ? 'B' : 'A');
    const stake = [`DOUBLE POINTS FOR ${markName(name)}`, `SINGLE FOR ${markName(nameOf(o.players, other))}`];
    if (C.bare) stake.forEach((s, i) => rise(ctx, s, C.x + ((C.cw - textW(s, 1)) >> 1), y + 92 + i * 10, seg(de, 0.8 + i * 0.05, 0.3), i ? S.fog : S.silver));
    else stake.forEach((s, i) => rise(ctx, s, C.x + ((C.cw - measureText(s, 1, 'micro')) >> 1), y + 94 + i * 8, seg(de, 0.8 + i * 0.05, 0.3), S.microFog));
  } finally {
    ctx.restore();
  }
}

function vScores(ctx, dt, o, box) {
  const players = (o.players || []).slice(0, 2);
  if (players.length < 2) return;
  const C = cols(box);
  if (C.bare) return vScoresBig(ctx, dt, o, C, players);
  const sc = o.scores || {};
  const h = 62;
  const y = centred(C, h);
  ctx.save();
  try {
    if (!panel(ctx, dt, C.px, y, C.pw, h, C.bare)) return;
    rise(ctx, up(o.title || 'THE SCORES'), C.x, y + 7, seg(dt, 0.2, 0.3), S.microFog);
    const half = C.pw >> 1;
    ctx.fillStyle = P.slate;
    if (dt >= 0.3) ctx.fillRect(C.px + half, y + 18, 1, 36);
    players.forEach((pl, i) => {
      const cx = C.px + half * i + (half >> 1);
      const mw = markWidth(pl.name);
      if (dt >= 0.35 + i * 0.1) drawMark(ctx, pl.seat, pl.name, Math.round(cx - mw / 2), y + 20, 'id');
      const s = String(sc[pl.seat] ?? 0);
      const style = o.winner ? (o.winner === pl.seat ? S.yellow3 : S.silver3) : S.white3;
      rise(ctx, s, Math.round(cx - textW(s, 3) / 2), y + 34, seg(dt, 0.45 + i * 0.1, 0.35), style);
    });
  } finally {
    ctx.restore();
  }
}

/** A player's shape at 2x (cards-quiz.js drawSeat's own seven rows, each pixel two by two). */
function seat2(ctx, seat, x, y, color) {
  const proxy = {
    set fillStyle(c) {
      ctx.fillStyle = c;
    },
    fillRect(a, b, w, h) {
      ctx.fillRect(x + a * 2, y + b * 2, w * 2, h * 2);
    },
  };
  drawSeat(proxy, seat, 0, 0, color);
}

/**
 * The final scores on the glass, set to fill it: the title, then each player in a half, the shape and the name at 2x,
 * the score at 5x under it (the winner's in gold), landing in turn.
 */
function vScoresBig(ctx, dt0, o, C, players) {
  const dt = settled(C, dt0);
  const sc = o.scores || {};
  const h = 10 + 9 + 12 + 14 + 10 + 35 + 8;
  const y = centred(C, h);
  ctx.save();
  try {
    if (!panel(ctx, dt, C.px, y, C.pw, h, true)) return;
    const title = up(o.title || 'THE SCORES');
    rise(ctx, title, C.x + ((C.cw - textW(title, 1)) >> 1), y + 6, seg(dt, 0.2, 0.3), S.fog);
    const half = C.pw >> 1;
    ctx.fillStyle = P.slate;
    if (dt >= 0.3) ctx.fillRect(C.px + half, y + 30, 1, h - 34);
    players.forEach((pl, i) => {
      const cx = C.px + half * i + (half >> 1);
      let name = up(pl.name);
      while (name.length > 2 && textW(name, 2) > half - 22) name = name.slice(0, -1);
      const mw = 14 + 4 + textW(name, 2);
      if (dt >= 0.35 + i * 0.1) {
        const mx = Math.round(cx - mw / 2);
        seat2(ctx, pl.seat, mx, y + 30, P.white);
        drawText(ctx, name, mx + 18, y + 30, S.white2);
      }
      const s = String(sc[pl.seat] ?? 0);
      const style = o.winner ? (o.winner === pl.seat ? { color: P.yellow, scale: 5 } : { color: P.silver, scale: 5 }) : { color: P.white, scale: 5 };
      rise(ctx, s, Math.round(cx - textW(s, 5) / 2), y + 55, seg(dt, 0.45 + i * 0.1, 0.35), style);
    });
  } finally {
    ctx.restore();
  }
}

const wins = (n) => {
  const whole = Math.floor(n);
  return n - whole >= 0.5 ? `${whole || ''}½` : String(whole);
};
/** A name for the week's table in `avail` px at 1x: whole, else "PENNY S.", else "PENNY", cut only past all three. */
export function tableName(name, avail) {
  const full = up(name);
  const parts = full.split(/\s+/).filter(Boolean);
  const short = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : full;
  return [full, short, parts[0] || full].find((n) => textW(n, 1) <= avail) || ellipsis(full, avail, 1);
}

function vTable(ctx, dt, o, box) {
  const rows = tableRows(o.standings, o.players);
  if (!rows.length) return;
  const C = cols(box);
  if (C.bare) return vTableBig(ctx, dt, o, C, rows);
  const tonight = new Map((o.players || []).map((p) => [p.id || p.name, p]));
  const pitch = 11;
  const h = 20 + rows.length * pitch + 5;
  const y = centred(C, h);
  ctx.save();
  try {
    if (!panel(ctx, dt, C.px, y, C.pw, h, C.bare)) return;
    rise(ctx, up(o.title || "THIS WEEK'S TABLE"), C.x, y + 7, seg(dt, 0.2, 0.3), S.microFog);
    const colP = C.r - 40;
    const colW = C.r;
    if (dt >= 0.3) {
      drawText(ctx, 'PLAYED', colP - measureText('PLAYED', 1, 'micro'), y + 7, S.microFog);
      drawText(ctx, 'WINS', colW - measureText('WINS', 1, 'micro'), y + 7, S.microFog);
    }
    rows.forEach((r, i) => {
      const ry = y + 19 + i * pitch;
      const p = seg(dt, 0.35 + i * 0.07, 0.3);
      if (p <= 0) return;
      const t = tonight.get(r.id);
      const off = Math.round((1 - easeOutQuint(p)) * 10);
      ctx.save();
      try {
        clipRect(ctx, C.px, ry - 2, C.pw, 11);
        const rank = String(r.rank);
        drawText(ctx, rank, C.x + 6 - textW(rank, 1), ry + off, S.fog);
        if (t) drawSeat(ctx, t.seat, C.x + 12, ry + off, P.white);
        // the name whole when it fits before the PLAYED column, else as the boards call the player ("PENNY S.",
        // "PENNY"): never a name cut mid-word ("PENNY STER…")
        const avail = colP - measureText('PLAYED', 1, 'micro') - 6 - (C.x + 24);
        drawText(ctx, tableName(r.name || r.id, avail), C.x + 24, ry + off, S.white);
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

/**
 * The week's table on the glass, set to fill it: the title, then a row a player at 2x (the shape, the name as the
 * boards call them, the wins), the rank and the games played in the body face beside them; tonight's two players'
 * shapes in gold. Up to eight rows (tableRows), never a name cut mid-word.
 */
/**
 * The table's title over a short week, as the round's card sets its name: its first words at 2x in gold, the last
 * word at 3x (THIS WEEK'S / TABLE), or null when either line is too wide for the column.
 */
function tableTitle(title, cw) {
  const words = title.split(/\s+/).filter(Boolean);
  if (words.length < 2) return textW(title, 3) <= cw ? { kick: '', main: title } : null;
  const kick = words.slice(0, -1).join(' ');
  const main = words[words.length - 1];
  return textW(kick, 2) <= cw && textW(main, 3) <= cw ? { kick, main } : null;
}

function vTableBig(ctx, dt0, o, C, rows) {
  const dt = settled(C, dt0);
  const tonight = new Map((o.players || []).map((p) => [p.id || p.name, p]));
  const title = up(o.title || "THIS WEEK'S TABLE");
  // the rows share the board: a short week stands large (up to three players: the names at 3x when every one fits,
  // the wins at 5x, how many played under the name; four: 2x names, the wins at 3x), a full one keeps 20 px a row
  const shortTable = rows.length <= 4;
  const big = rows.length <= 3;
  const tt = shortTable ? tableTitle(title, C.cw) : null;
  const titleH = tt ? (tt.kick ? 48 : 30) : 22;
  const pitch = clamp(Math.floor((C.ph - 12 - titleH) / Math.max(1, rows.length)), 20, big ? 48 : shortTable ? 34 : 23);
  const ws = big && pitch >= 44 ? 5 : pitch >= 30 ? 3 : 2;
  const colW = C.r;
  const nx = C.x + 28;
  const winsW = Math.max(...rows.map((r) => textW(wins(r.wins), ws)));
  // (on a large row the name runs to the wins; PLAYED is a line under it, not a column)
  const large = ws === 5;
  const colP = C.r - (ws === 3 ? 52 : 44);
  const room = large ? colW - winsW - 10 - nx : colP - 12 - 4 - nx;
  // (at 3x a long name goes by its first name, PENNY for PENNY STERLING, as the host calls the players)
  const names3 = rows.map((r) => tableName(r.name || r.id, Math.floor(room / 3)));
  const ns = large && names3.every((n) => !n.endsWith('...') && textW(n, 3) <= room) ? 3 : 2;
  const h = titleH + rows.length * pitch;
  const y = centred(C, h);
  ctx.save();
  try {
    if (!panel(ctx, dt, C.px, y - 4, C.pw, h + 8, true)) return;
    if (tt) {
      if (tt.kick) drawText(ctx, tt.kick, C.x, y + 2, { color: P.yellow, scale: 2 });
      drawText(ctx, tt.main, C.x, y + (tt.kick ? 19 : 2), S.white3);
    } else rise(ctx, title, C.x, y + 6, seg(dt, 0.2, 0.3), S.fog);
    const hy = y + titleH - 10;
    if (dt >= 0.3) {
      if (!large) drawText(ctx, 'PLAYED', colP - measureText('PLAYED', 1, 'micro'), hy, S.microFog);
      drawText(ctx, 'WINS', colW - measureText('WINS', 1, 'micro'), hy, S.microFog);
    }
    rows.forEach((r, i) => {
      const nh = ns === 3 ? 21 : 14;
      const blockH = large ? 35 : 21;
      const ry = y + titleH + i * pitch + Math.max(0, (pitch - blockH) >> 1);
      const p = seg(dt, 0.35 + i * 0.07, 0.3);
      if (p <= 0) return;
      const t = tonight.get(r.id);
      const off = Math.round((1 - easeOutQuint(p)) * 16);
      ctx.save();
      try {
        // (a line's image carries padding above its caps: the clip keeps it, so the line is whole on its first frame)
        if (large) clipRect(ctx, C.px, ry - 8, C.pw, blockH + 14);
        else clipRect(ctx, C.px, ry - 3, C.pw, 26);
        // a large row: the name and its PLAYED line centred on the wins' 35 rows
        const ny = large ? ry + ((blockH - (nh + 9)) >> 1) : ry;
        const rank = String(r.rank);
        drawText(ctx, rank, C.x + 6 - textW(rank, 1), ny + (ns === 3 ? 7 : 4) + off, S.fog);
        if (t) seat2(ctx, t.seat, C.x + 10, ny + (ns === 3 ? 4 : 0) + off, P.yellow);
        const name = ns === 3 ? names3[i] : tableName(r.name || r.id, Math.floor(room / 2));
        drawText(ctx, name, nx, ny + off, ns === 3 ? S.white3 : S.white2);
        const pl = String(r.played);
        if (large) drawText(ctx, `PLAYED ${pl}`, nx, ny + nh + 4 + off, S.microFog);
        else drawText(ctx, pl, colP - textW(pl, 1), ry + 4 + off, S.silver);
        const wv = wins(r.wins);
        const wy = large ? ry : ry + (ws === 3 ? -3 : 0);
        drawText(ctx, wv, colW - textW(wv, ws), wy + off, ws === 5 ? WINS5 : ws === 3 ? S.white3 : S.white2);
      } finally {
        ctx.restore();
      }
    });
  } finally {
    ctx.restore();
  }
}
const WINS5 = Object.freeze({ color: P.white, scale: 5 });

export const VQUIZ = Object.freeze({ picture: vPicture, letters: vLetters, where: vWhere, howmany: vHowMany, today: vToday, round: vRound, double: vDouble, final: vScores, table: vTable });

/** The board shot in a box (the card the director put on air: { board, o, epoch }). False: not a board it knows. */
export function drawVerticalQuizBoard(ctx, t, dt, card, box) {
  const draw = VQUIZ[card?.board];
  if (!draw) return false;
  draw(ctx, Number.isFinite(card?.epoch) ? Math.max(0, t - card.epoch) : dt, card.o || {}, box);
  return true;
}

/** The quiz's ground behind a board: the room's dark (black at the edges, ink behind the middle). */
let GROUND = null;
function ground(w, h) {
  if (GROUND && GROUND.width === w && GROUND.height === h) return GROUND;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = P.black;
  g.fillRect(0, 0, w, h);
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const ink = [0x26, 0x2b, 0x44];
  const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - w / 2) / (w * 0.6);
      const dy = (y - h * 0.45) / (h * 0.6);
      const v = clamp((1 - Math.sqrt(dx * dx + dy * dy)) * 2.1 - 0.55, 0, 1);
      if (v * 16 > B[((y & 3) << 2) | (x & 3)] + 0.5) {
        const i = (y * w + x) * 4;
        d[i] = ink[0];
        d[i + 1] = ink[1];
        d[i + 2] = ink[2];
      }
    }
  }
  g.putImageData(img, 0, 0);
  GROUND = c;
  return c;
}

/**
 * Wire the boards into the vertical compositor (clip/index.js calls it): each board on the glass in the quiz's marquee
 * (clip/vset.js), bare, whole from the shot's first frame; without the compositor's glass, on the room's dark ground.
 */
export function installQuiz(comp) {
  comp.drawMark = drawMark;
  comp.quiz = (t, scene, dt, box) => {
    const b = box || comp.stageBox(scene);
    if (!VQUIZ[scene.card?.board]) return false;
    if (typeof comp.glassPanel === 'function') {
      comp.glassPanel(t);
      // (inside the marquee: its 6 px band, 2 px clear of it)
      return drawVerticalQuizBoard(comp.ctx, t, dt, scene.card, { x: b.x + 2, y: b.y + 4, w: b.w - 4, h: b.h - 8, bare: true });
    }
    comp.ctx.drawImage(ground(b.w, b.h), b.x, b.y);
    return drawVerticalQuizBoard(comp.ctx, t, dt, scene.card, b);
  };
}
