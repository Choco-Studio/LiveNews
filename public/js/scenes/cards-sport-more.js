// FULL TIME's further boards, the visual-variety round (owner, 18 Oct: "necesitan algunas diapositivas más o cosas que
// no lo hagan muy repetitivo"; docs/programmes/full-time.md §5-§6, docs/roadmap/critique/visual-variety.md). In the
// sport boards' package (scenes/cards-sport.js: the black panel wiped in from the left, the slate top line, the micro
// kicker with the sport's icon, the programme's orange as the one colour, text rising into place), each a pure function
// of its own clock and of what the desk has: the story's own words and the edition's own results, never a table, a
// fixture, a scorer or a record the stories do not state (§3.6), no crests, no kits, no logos.
//
//   drawSportSlate     a sport's slate as the running order turns to it: its icon large, its name as the strap names
//                      it, how many of its stories follow together
//   drawMomentBoard    MOMENT OF THE DAY's title board: the label, the story's headline, its sport
//   drawStandingBoard  WHERE THEY STAND: the side the sentence names and its place in the sentence's own words
//   drawFormBoard      THE RUN: the side, its run as a number and, when the words give the outcome, a cell a result
//   drawScoresWall     SCORE CENTRE's second picture: the results as a wall of tiles (the sport's icon, the winner and
//                      the score), each coming up as it is read
import { P } from '../palette.js';
import { drawText, measureText } from '../font.js';
import { seg, easeOutQuint, clipRect, textW, balanceLines } from '../gfx/index.js';
import { sportKit, drawIcon, ICONS, iconOf } from './cards-sport.js';

const K = () => sportKit; // (read at draw time)
const up = (s) => String(s ?? '').toUpperCase();
const ease = (dt, at, dur) => easeOutQuint(seg(dt, at, dur));
const NUMBERS = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT'];

/** An icon at an integer scale (each icon pixel `k` pixels), in the accent with its shade. */
function bigIcon(ctx, name, x, y, k, color = P.orange) {
  const rows = ICONS[name];
  if (!rows) return false;
  const dark = color === P.white || color === P.silver ? P.steel : P.ink;
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const ch = rows[r][c];
      if (ch === '.') continue;
      ctx.fillStyle = ch === '#' ? color : dark;
      ctx.fillRect(x + c * k, y + r * k, k, k);
    }
  }
  return true;
}

/**
 * A sport's slate: o = { sport (the icon's sport), name ('RUGBY LEAGUE', as the strap), count (its stories together) }.
 * The icon builds in at 4x on its ink plate, the name at 3x beside it (2x when long), the orange rule, the count.
 */
export function drawSportSlate(ctx, dt, o = {}) {
  const Q = K();
  const name = up(o.name || '');
  if (!name) return;
  const icon = iconOf(o.sport);
  const PH = 64;
  const PY = Q.place(PH);
  ctx.save();
  try {
    if (!Q.panel(ctx, dt, PY, PH, 'AROUND THE GROUNDS', null)) return;
    let x = Q.PX + 14;
    if (icon) {
      const p = ease(dt, 0.15, 0.35);
      if (p > 0) {
        ctx.fillStyle = P.ink;
        ctx.fillRect(x - 3, PY + 16, 50, 50 - 6);
        ctx.save();
        try {
          clipRect(ctx, x - 3, PY + 16, 50, Math.round(44 * p));
          bigIcon(ctx, icon, x + 2, PY + 18, 4);
        } finally {
          ctx.restore();
        }
      }
      x += 56;
    }
    const room = Q.PX + Q.PW - 14 - x;
    const scale = textW(name, 3) <= room ? 3 : 2;
    Q.rise(ctx, name, x, PY + 20, seg(dt, 0.3, 0.35), scale === 3 ? Q.S.white3 : Q.S.white2);
    const rw = Math.min(room, textW(name, scale));
    const rp = ease(dt, 0.45, 0.3);
    if (rp > 0) {
      ctx.fillStyle = P.orange;
      ctx.fillRect(x, PY + 20 + 7 * scale + 4, Math.max(3, Math.round(rw * rp)), 2);
    }
    const n = Number(o.count) || 0;
    const line = n >= 2 ? `${NUMBERS[n] || n} STORIES` : '';
    if (line) Q.rise(ctx, line, x, PY + 20 + 7 * scale + 11, seg(dt, 0.55, 0.3), Q.S.microFog);
  } finally {
    ctx.restore();
  }
}

/**
 * MOMENT OF THE DAY's title board: o = { headline, sport, label ('MOMENT OF THE DAY'), source }. The label at 2x
 * between two orange rules, the headline at 1x on up to three lines, the sport's icon.
 */
export function drawMomentBoard(ctx, dt, o = {}) {
  const Q = K();
  const label = up(o.label || 'MOMENT OF THE DAY');
  const head = up(o.headline || '');
  const lines = head ? balanceLines(head, Q.INNER - 30, 1, 3) : [];
  const PH = 48 + lines.length * 10;
  const PY = Q.place(PH);
  ctx.save();
  try {
    if (!Q.panel(ctx, dt, PY, PH, 'FULL TIME', iconOf(o.sport))) return;
    const lw = textW(label, 2);
    const x = Q.PX + 12;
    const rp = ease(dt, 0.2, 0.35);
    if (rp > 0) {
      ctx.fillStyle = P.orange;
      ctx.fillRect(x, PY + 21, Math.round(lw * rp), 2);
      ctx.fillRect(x, PY + 41, Math.round(lw * rp), 2);
    }
    Q.rise(ctx, label, x, PY + 26, seg(dt, 0.3, 0.35), Q.S.white2);
    lines.forEach((l, i) => Q.rise(ctx, l, x, PY + 48 + i * 10, seg(dt, 0.5 + i * 0.07, 0.34), Q.S.silver));
    // a star of eight points in the accent at the label's end: the moment, never a medal or a trophy (no prize claimed)
    const sx = x + lw + 10;
    const sy = PY + 26;
    if (dt >= 0.45 && sx + 13 < Q.PX + Q.PW) {
      ctx.fillStyle = P.orange;
      ctx.fillRect(sx + 6, sy, 1, 13);
      ctx.fillRect(sx, sy + 6, 13, 1);
      ctx.fillRect(sx + 3, sy + 3, 7, 7);
      ctx.fillStyle = P.yellow;
      ctx.fillRect(sx + 5, sy + 5, 3, 3);
    }
  } finally {
    ctx.restore();
  }
}

/**
 * WHERE THEY STAND: o = { standing: { team, text, source } }. The side's name at 2x, its place in the sentence's own
 * words in an orange box (black type), the source.
 */
export function drawStandingBoard(ctx, dt, o = {}) {
  const Q = K();
  const st = o.standing || {};
  const team = up(st.team || '');
  const text = up(st.text || '');
  if (!team || !text) return;
  const lines = balanceLines(text, Q.INNER - 12, 1, 2);
  const tscale = textW(team, 2) <= Q.INNER ? 2 : 1;
  const PH = 60 + lines.length * 10; // (the side, the orange box, then the credit under it)
  const PY = Q.place(PH);
  ctx.save();
  try {
    if (!Q.panel(ctx, dt, PY, PH, 'WHERE THEY STAND', iconOf(o.sport))) return;
    const x = Q.PX + 12;
    Q.rise(ctx, team, x, PY + 21, seg(dt, 0.25, 0.35), tscale === 2 ? Q.S.white2 : Q.S.white);
    const by = PY + 21 + 7 * tscale + 6;
    const bw = Math.max(...lines.map((l) => textW(l, 1))) + 12;
    const bp = ease(dt, 0.5, 0.3);
    if (bp > 0) {
      ctx.save();
      try {
        clipRect(ctx, x, by, Math.round(bw * bp), lines.length * 10 + 5);
        ctx.fillStyle = P.orange;
        ctx.fillRect(x, by, bw, lines.length * 10 + 5);
        lines.forEach((l, i) => drawText(ctx, l, x + 6, by + 4 + i * 10, { color: P.black }));
      } finally {
        ctx.restore();
      }
    }
    const src = Q.srcText(st.source || o.source);
    if (src && dt >= 0.8) drawText(ctx, src, x, PY + PH - 9, Q.S.microFog);
  } finally {
    ctx.restore();
  }
}

/**
 * THE RUN: o = { form: { team, count, label, cells, source } }. The side at 2x; the count at 3x in the accent and its
 * label; under them a cell a result when the words give the outcome (L, W or D, each landing in turn, a defeat on
 * slate, a win in orange, a draw on ink), never an outcome they do not give.
 */
export function drawFormBoard(ctx, dt, o = {}) {
  const Q = K();
  const f = o.form || {};
  const team = up(f.team || '');
  const count = Number(f.count);
  if (!team || !(count >= 2)) return;
  const cells = String(f.cells || '').slice(0, 10);
  const label = up(f.label || '');
  const tscale = textW(team, 2) <= Q.INNER ? 2 : 1;
  const PH = 62 + (cells ? 18 : 0);
  const PY = Q.place(PH);
  ctx.save();
  try {
    if (!Q.panel(ctx, dt, PY, PH, 'THE RUN', iconOf(o.sport))) return;
    const x = Q.PX + 12;
    Q.rise(ctx, team, x, PY + 21, seg(dt, 0.25, 0.35), tscale === 2 ? Q.S.white2 : Q.S.white);
    const ny = PY + 21 + 7 * tscale + 6;
    const num = String(count);
    Q.landScore(ctx, num, x, ny, seg(dt, 0.45, 0.3), { color: P.orange, scale: 3 });
    const lx = x + textW(num, 3) + 8;
    const lines = balanceLines(label, Q.PX + Q.PW - 12 - lx, 1, 2);
    lines.forEach((l, i) => Q.rise(ctx, l, lx, ny + 2 + i * 10, seg(dt, 0.55 + i * 0.06, 0.3), Q.S.white));
    if (cells) {
      const cy = ny + 27;
      for (let i = 0; i < cells.length; i++) {
        const p = ease(dt, 0.8 + i * 0.08, 0.15);
        if (p <= 0) continue;
        const cx = x + i * 16;
        const c = cells[i];
        ctx.fillStyle = c === 'W' ? P.orange : c === 'L' ? P.slate : P.ink;
        ctx.fillRect(cx, cy + Math.round((1 - p) * 4), 13, 13);
        drawText(ctx, c, cx + ((13 - textW(c, 1)) >> 1), cy + 3 + Math.round((1 - p) * 4), { color: c === 'W' ? P.black : P.white });
      }
    }
    const src = Q.srcText(f.source || o.source);
    if (src && dt >= 0.9) drawText(ctx, src, Q.PX + Q.PW - 12 - measureText(src, 1, 'micro'), PY + PH - 9, Q.S.microFog);
  } finally {
    ctx.restore();
  }
}

/**
 * SCORE CENTRE's wall: o = { scores: [{ a, b, sa, sb, winner, draw, sport, day? }], rowTimes (s each tile comes up,
 * Infinity: not yet), title, source }. Two columns of tiles, up to three rows: the sport's icon, the winner (white) and
 * the other side (silver) with their scores, DRAW or FT on the tile's foot; the results services' order (the winner
 * first) and never a home or away claim.
 */
export function drawScoresWall(ctx, dt, o = {}) {
  const Q = K();
  const rows = (o.scores || []).slice(0, 6);
  if (!rows.length) return;
  const times = o.rowTimes || rows.map(() => 0);
  const PH = 18 + Math.ceil(rows.length / 2) * 29 + 12; // (the rows of tiles, then the credit under them)
  const PY = Q.place(PH);
  const title = up(o.title || 'THE RESULTS');
  ctx.save();
  try {
    if (!Q.panel(ctx, dt, PY, PH, title, null)) return;
    const cols = 2;
    const tw = Math.floor((Q.INNER - 8) / cols);
    const th = 26;
    rows.forEach((r, i) => {
      const at = times[i];
      if (!Number.isFinite(at) || dt < at) return;
      const p = ease(dt, at, 0.25);
      const col = i % cols;
      const row = Math.floor(i / cols);
      const tx = Q.PX + 12 + col * (tw + 8);
      const ty = PY + 18 + row * (th + 3);
      ctx.save();
      try {
        clipRect(ctx, tx, ty, Math.round(tw * p), th);
        ctx.fillStyle = P.ink;
        ctx.fillRect(tx, ty, tw, th);
        ctx.fillStyle = r.draw ? P.slate : P.orange;
        ctx.fillRect(tx, ty, 2, th);
        const icon = iconOf(r.sport);
        if (icon) drawIcon(ctx, icon, tx + 6, ty + 7, P.white);
        const won = !r.draw && r.winner;
        const first = won ? r.winner : r.a;
        const second = won ? (r.winner === r.a ? r.b : r.a) : r.b;
        const s1 = won && r.winner === r.b ? r.sb : r.sa;
        const s2 = won && r.winner === r.b ? r.sa : r.sb;
        const nx = tx + (icon ? 21 : 7);
        const sx = tx + tw - 6;
        const nameW = sx - 22 - nx;
        // (one face for the tile's two names: 1x when both fit, else both in the micro face, never a name cut)
        const micro = textW(up(first), 1) > nameW || textW(up(second), 1) > nameW;
        const nameStyle = (c) => (micro ? { color: c, font: 'micro' } : { color: c });
        drawText(ctx, up(first), nx, ty + (micro ? 5 : 4), nameStyle(P.white));
        drawText(ctx, up(second), nx, ty + (micro ? 16 : 15), nameStyle(r.draw ? P.white : P.silver));
        const a1 = String(s1);
        const a2 = String(s2);
        drawText(ctx, a1, sx - textW(a1, 1), ty + 4, r.draw ? Q.S.white : { color: P.orange });
        drawText(ctx, a2, sx - textW(a2, 1), ty + 15, r.draw ? Q.S.white : Q.S.silver);
        if (r.day) drawText(ctx, up(r.day), sx - 22 - measureText(up(r.day), 1, 'micro'), ty + 4, Q.S.microFog);
      } finally {
        ctx.restore();
      }
    });
    const src = Q.srcText(o.source);
    if (src && dt >= 0.5) drawText(ctx, src, Q.PX + 12, PY + PH - 9, Q.S.microFog);
  } finally {
    ctx.restore();
  }
}

const FRAME_W = 384; // the channel's frame (set.js W)

/**
 * A FULL TIME headline frame without a picture (the visual-variety round, owner 18 Oct: the frames of a picture-less
 * edition aired as one text template three times over): the story's sport large on the montage's field, sliding in
 * from the right. o = { sport (its key), index (the frame's) }. Returns false when the sport has no
 * icon (no icon is better than a wrong one: the field stays as it was).
 */
export function drawSportBackdrop(ctx, dt, o = {}) {
  const icon = iconOf(o.sport);
  if (!icon) return false;
  // (6x at the frame's right edge, under the captions' two rows (y 74) and beside the chip and the headline, which sit on
  // the left above y 143: the 7x emblem met the caption's plate, a left one the chip; the frames differ by their sport)
  const k = 6;
  const size = 11 * k;
  const y = 74;
  const p = ease(dt, 0, 0.45);
  const x = Math.round(FRAME_W - 18 - size + (1 - p) * 24);
  // a slate rule under it, the icon's ground
  ctx.fillStyle = P.slate;
  ctx.fillRect(x - 6, y + size + 3, size + 12, 1);
  bigIcon(ctx, icon, x, y, k, P.orange);
  return true;
}
