// FULL TIME's boards for the vertical picture (docs/publishing/vertical.md §3.3). The horizontal RESULT card and the
// SCORE CENTRE (scenes/cards-sport.js) are 304 and 300 px wide; on the 216 px stage they are laid out again in the
// same language: a black panel with its slate rule and the RESULT kicker beside the sport's icon, the names in one type
// size (2x when both fit, else 1x on up to two lines), the scores at 3x landing from above, the winner in white with
// the score in the programme's accent, FT or DRAW once both scores are in; the board's rows flipping in one by one, each
// result on two lines (home over away) so no name is ever cut.
//
//   drawVerticalScoreline(ctx, dt, card, box, accent)   card: { score: { a, b, sa, sb, home, draw, sport, stage }, source }
//   drawVerticalScoreboard(ctx, dt, card, box, accent)  card: { scores: [{ a, b, sa, sb, sport, day }], title, source, rowTimes }
//   drawVerticalComingUp(ctx, dt, card, box, accent)    card: { fixtures: [{ event, when, date, sport }], title, source, leafTimes }
//   drawVerticalChalkboard(ctx, dt, card, box)          card: { chalk: { yards | metres, label, sport } }
import { P } from '../palette.js';
import { drawText, measureText } from '../font.js';
import { seg, easeOutQuint, clipRect, ellipsis, balanceLines, textW } from '../gfx/index.js';
import { drawIcon, iconOf, sidesOf, drawChalkboard } from '../scenes/cards-sport.js';
import { nextLeaf } from '../scenes/cards-more.js';

const S = {
  white: { color: P.white },
  silver: { color: P.silver },
  white2: { color: P.white, scale: 2 },
  silver2: { color: P.silver, scale: 2 },
  white3: { color: P.white, scale: 3 },
  silver3: { color: P.silver, scale: 3 },
  microFog: { color: P.fog, font: 'micro' },
  microWhite: { color: P.white, font: 'micro' },
};
const M = 8;
const PAD = 10;
/** Micro text cut to `w` px with dots (gfx ellipsis measures the body face). */
function microFit(text, w) {
  let s = String(text || '');
  if (measureText(s, 1, 'micro') <= w) return s;
  while (s && measureText(`${s}...`, 1, 'micro') > w) s = s.slice(0, -1).trimEnd();
  return `${s}...`;
}

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
function land(ctx, text, x, y, p, style) {
  if (p <= 0) return;
  const off = Math.round((1 - easeOutQuint(p)) * -10);
  ctx.save();
  try {
    clipRect(ctx, x - 2, y - 2, textW(text, 3) + 4, 25);
    drawText(ctx, text, x, y + off, style);
  } finally {
    ctx.restore();
  }
}
/** The panel wiping in from the left, its slate rule, the kicker and the sport's icon; false while it is closed. */
function panel(ctx, dt, x, y, w, h, kicker, icon, acc) {
  const vis = Math.round(w * easeOutQuint(seg(dt, 0, 0.3)));
  if (vis <= 0) return false;
  clipRect(ctx, x, y, vis, h);
  ctx.fillStyle = P.black;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = P.slate;
  ctx.fillRect(x, y, w, 1);
  let kx = x + PAD;
  if (icon) {
    drawIcon(ctx, icon, kx, y + 6, P.fog, P.slate);
    kx += 15;
  }
  drawText(ctx, kicker, kx, y + 9, S.microFog);
  ctx.fillStyle = acc;
  ctx.fillRect(x, y + 1, 2, h - 1);
  return true;
}
/** Two names in one type size: 2x on one line each when both fit, else 1x on up to two lines each. */
function names(a, b, maxW) {
  const ns = [a, b].map((n) => String(n || '').toUpperCase());
  if (ns.every((t) => textW(t, 2) <= maxW)) return ns.map((t) => ({ lines: [t], scale: 2 }));
  return ns.map((t) => ({ lines: textW(t, 1) <= maxW ? [t] : balanceLines(t, maxW, 1, 2).map((l) => ellipsis(l, maxW, 1)), scale: 1 }));
}

export function drawVerticalScoreline(ctx, dt, card, box, acc = P.orange) {
  const sc = card?.score;
  if (!sc?.a || !sc?.b) return false;
  const x = box.x + M;
  const w = box.w - 2 * M;
  // the home side first when the source names one, else the winner first (the source's order on a draw)
  const homeIsB = sc.home && sc.home === sc.b;
  const rows = homeIsB ? [{ name: sc.b, score: sc.sb, won: false, side: 'HOME' }, { name: sc.a, score: sc.sa, won: !sc.draw, side: 'AWAY' }] : [{ name: sc.a, score: sc.sa, won: !sc.draw, side: sc.home ? 'HOME' : '' }, { name: sc.b, score: sc.sb, won: false, side: sc.home ? 'AWAY' : '' }];
  const scoreW = Math.max(...rows.map((r) => textW(String(r.score), 3)));
  const nameW = w - 2 * PAD - scoreW - 8;
  const laid = names(rows[0].name, rows[1].name, nameW).map((n, i) => ({ ...rows[i], ...n }));
  const rowH = (r) => Math.max(25, r.lines.length * (r.scale === 2 ? 16 : 10) + (r.side ? 8 : 0));
  const src = card.source ? microFit(`SOURCE: ${String(card.source).toUpperCase()}`, w - 2 * PAD) : '';
  const stage = sc.stage ? String(sc.stage).toUpperCase() : '';
  const top = 22;
  const h = top + rowH(laid[0]) + 6 + rowH(laid[1]) + 22 + (stage ? 9 : 0) + (src ? 10 : 0) + 4;
  const y0 = box.y + Math.max(2, Math.round((box.h - h) / 2));
  ctx.save();
  try {
    if (!panel(ctx, dt, x, y0, w, h, 'RESULT', iconOf(sc.sport), acc)) return true;
    let y = y0 + top;
    const draw = sc.draw;
    laid.forEach((r, i) => {
      const rh = rowH(r);
      const lh = r.scale === 2 ? 16 : 10;
      const at = 0.35 + i * 0.12;
      const style = r.won || draw ? (r.scale === 2 ? S.white2 : S.white) : r.scale === 2 ? S.silver2 : S.silver;
      const textH = r.lines.length * lh - (lh - 7 * r.scale) + (r.side ? 8 : 0);
      const ty = y + ((rh - textH) >> 1);
      r.lines.forEach((l, k) => rise(ctx, l, x + PAD, ty + k * lh, seg(dt, at + k * 0.06, 0.34), style));
      if (r.side && dt >= 0.9) drawText(ctx, r.side, x + PAD, ty + r.lines.length * lh - (lh - 7 * r.scale) + 3, S.microFog);
      const t = String(r.score);
      land(ctx, t, x + w - PAD - textW(t, 3), y + ((rh - 21) >> 1), seg(dt, 0.65 + i * 0.12, 0.3), r.won ? { color: acc, scale: 3 } : draw ? S.white3 : S.silver3);
      y += rh + 6;
      if (i === 0 && dt >= 0.3) {
        ctx.fillStyle = P.ink;
        ctx.fillRect(x + PAD, y - 4, w - 2 * PAD, 1);
      }
    });
    // FT or DRAW, under the scores, once both have landed (the verdict after the evidence)
    const tp = easeOutQuint(seg(dt, 0.95, 0.15));
    const tag = draw ? 'DRAW' : 'FT';
    if (tp > 0) {
      const tw = textW(tag, 1) + 10;
      const tx = x + w - PAD - tw;
      ctx.save();
      try {
        clipRect(ctx, tx, y, Math.max(1, Math.round(tw * tp)), 12);
        ctx.fillStyle = draw ? P.slate : acc;
        ctx.fillRect(tx, y, tw, 12);
        drawText(ctx, tag, tx + 5, y + 3, { color: draw ? P.white : P.black });
      } finally {
        ctx.restore();
      }
    }
    y += 18;
    if (stage && dt >= 0.95) {
      drawText(ctx, stage, x + PAD, y, S.microFog);
      y += 9;
    }
    if (src) drawText(ctx, src, x + PAD, y + 2, S.microFog);
  } finally {
    ctx.restore();
  }
  return true;
}

export function drawVerticalScoreboard(ctx, dt, card, box, acc = P.orange) {
  const rows = (card?.scores || []).slice(0, 6);
  if (!rows.length) return false;
  const x = box.x + M;
  const w = box.w - 2 * M;
  const head = 16;
  const pitch = rows.length <= 4 ? 34 : 24;
  const credit = card.source ? `SOURCE${/\s\/\s/.test(card.source) ? 'S' : ''}: ${String(card.source).toUpperCase()}` : '';
  const h = head + rows.length * pitch + 4 + (credit ? 9 : 0);
  const y0 = box.y + Math.max(2, Math.round((box.h - h) / 2));
  ctx.fillStyle = P.slate;
  ctx.fillRect(x - 1, y0 - 1, w + 2, h + 2);
  ctx.fillStyle = P.black;
  ctx.fillRect(x, y0, w, h);
  const title = ellipsis(String(card.title || 'THE LATEST RESULTS').toUpperCase(), w - 16, 1);
  drawText(ctx, title, x + ((w - textW(title, 1)) >> 1), y0 + 4, { color: acc });
  ctx.fillStyle = P.slate;
  ctx.fillRect(x + 6, y0 + head - 3, w - 12, 1);
  if (credit) {
    let c = credit;
    while (measureText(c, 1, 'micro') > w - 12 && c.includes(' / ')) c = c.slice(0, c.lastIndexOf(' / '));
    c = microFit(c, w - 12);
    drawText(ctx, c, x + w - 6 - measureText(c, 1, 'micro'), y0 + h - 8, S.microFog);
  }
  const times = card.rowTimes || rows.map((_, i) => 0.6 + i * 0.9);
  const big = rows.length <= 4;
  rows.forEach((r, i) => {
    const at = times[i] ?? 0.6 + i * 0.9;
    if (dt < at) return;
    const p = easeOutQuint(seg(dt, at, 0.18));
    const ry = y0 + head + i * pitch + 1;
    const rh = pitch - 2;
    const open = Math.max(1, Math.round(rh * p));
    ctx.save();
    try {
      clipRect(ctx, x + 2, ry + ((rh - open) >> 1), w - 4, open);
      const icon = iconOf(r.sport);
      let nx = x + 6;
      if (icon) {
        drawIcon(ctx, icon, nx, ry + ((rh - 11) >> 1), P.fog, P.slate);
        nx += 15;
      }
      const sa = Number(r.sa);
      const sb = Number(r.sb);
      const aLit = !(sb > sa);
      const bLit = !(sa > sb);
      const sc = big ? 2 : 1;
      const sw = Math.max(textW(String(r.sa), sc), textW(String(r.sb), sc));
      const scoreX = x + w - 6 - sw - (r.day ? measureText(String(r.day).toUpperCase(), 1, 'micro') + 6 : 0);
      const nameW = scoreX - nx - 6;
      // two lines, home over away: a 2x score's 14 px with a pixel between them on a big board, 1x on a full one
      const line = big ? 16 : 10;
      const top = ry + ((rh - (line + 7 * sc)) >> 1);
      for (const [k, name, score, lit] of [[0, r.a, r.sa, aLit], [1, r.b, r.sb, bLit]]) {
        const yy = top + k * line;
        drawText(ctx, ellipsis(String(name || '').toUpperCase(), nameW, 1), nx, yy + (big ? 4 : 0), { color: lit ? P.white : P.silver });
        const s = String(score);
        // the winner's score in the accent; a draw's two in white (the RESULT card's rule: nobody won)
        drawText(ctx, s, scoreX + sw - textW(s, sc), yy, { color: sa === sb ? P.white : lit ? acc : P.silver, scale: sc });
      }
      if (r.day) {
        const d = String(r.day).toUpperCase();
        drawText(ctx, d, x + w - 6 - measureText(d, 1, 'micro'), ry + ((rh - 5) >> 1), S.microFog);
      }
      ctx.fillStyle = P.ink;
      if (i < rows.length - 1) ctx.fillRect(x + 6, ry + rh + 1, w - 12, 1);
    } finally {
      ctx.restore();
    }
  });
  return true;
}

/**
 * COMING UP set for the vertical stage: the title in the accent, then a row a fixture (two or three): its calendar
 * leaf (the month on the accent, the day at 3x, the weekday) dropping in when its date is read, the two sides on two
 * lines beside it with "V" between them, the time under them. Every word inside the box.
 */
export function drawVerticalComingUp(ctx, dt, card, box, acc = P.orange) {
  const fixtures = (card?.fixtures || []).slice(0, 3);
  if (fixtures.length < 2) return false;
  const x = box.x + M;
  const w = box.w - 2 * M;
  const pv = easeOutQuint(seg(dt, 0, 0.3));
  if (pv <= 0) return true;
  ctx.save();
  try {
    clipRect(ctx, x, box.y + 4, Math.round(w * pv), box.h - 8);
    ctx.fillStyle = P.black;
    ctx.fillRect(x, box.y + 4, w, box.h - 8);
    ctx.fillStyle = P.slate;
    ctx.fillRect(x, box.y + 4, w, 1);
    const title = String(card.title || 'COMING UP').toUpperCase();
    drawText(ctx, ellipsis(title, w - 2 * PAD, 1), x + PAD, box.y + 10, { color: acc });
    const LW = 34;
    const LH = 40;
    const rowH = Math.floor((box.h - 8 - 22 - 12) / fixtures.length);
    fixtures.forEach((f, i) => {
      const at = card.leafTimes ? Math.max(0.3, card.leafTimes[i] ?? Infinity) : 0.3 + i * 0.35;
      if (dt < at) return;
      const p = easeOutQuint(seg(dt, at, 0.35));
      const ry = box.y + 26 + i * rowH;
      const ly = ry + Math.max(0, (rowH - LH) >> 1) - Math.round((1 - p) * 8);
      const lx = x + PAD;
      const leaf = nextLeaf(f);
      ctx.save();
      try {
        clipRect(ctx, lx, ry, LW, rowH);
        ctx.fillStyle = P.silver;
        ctx.fillRect(lx, ly, LW, LH);
        ctx.fillStyle = acc;
        ctx.fillRect(lx, ly, LW, 9);
        const head = microFit(leaf.head, LW - 4);
        drawText(ctx, head, lx + ((LW - measureText(head, 1, 'micro')) >> 1), ly + 2, { color: P.black, font: 'micro' });
        if (leaf.big) {
          const bs = textW(leaf.big, 3) <= LW - 4 ? 3 : 2;
          drawText(ctx, leaf.big, lx + ((LW - textW(leaf.big, bs)) >> 1), ly + (bs === 3 ? 12 : 15), { color: P.ink, scale: bs });
          drawText(ctx, leaf.foot, lx + ((LW - measureText(leaf.foot, 1, 'micro')) >> 1), ly + 34, { color: P.ink, font: 'micro' });
        } else {
          const foot = microFit(leaf.foot, LW - 4);
          drawText(ctx, foot, lx + ((LW - measureText(foot, 1, 'micro')) >> 1), ly + 20, { color: P.ink, font: 'micro' });
        }
      } finally {
        ctx.restore();
      }
      // the sides beside the leaf (each whole: two lines with V between), the time under them, the sport's icon at the
      // right. A side too long for its column gives up the icon's room first, then is set in the micro face, never cut
      // mid-name ("WOLVERHAMPTON WANDERER…" under the icon)
      const tx = lx + LW + 8;
      const sides = sidesOf(f.event).map((sd) => String(sd).toUpperCase());
      const icon = iconOf(f.sport);
      let tw = x + w - PAD - tx - (icon ? 14 : 0);
      const showIcon = !!icon && sides.every((sd) => textW(sd, 1) <= tw);
      if (icon && !showIcon) tw += 14;
      let ty = ry + Math.max(0, (rowH - (sides.length > 1 ? 34 : 18)) >> 1);
      sides.forEach((side, k) => {
        if (k) {
          rise(ctx, 'V', tx, ty, seg(dt, at + 0.1, 0.3), S.microFog);
          ty += 7;
        }
        const whole = textW(side, 1) <= tw;
        rise(ctx, whole ? side : microFit(side, tw), tx, whole ? ty : ty + 1, seg(dt, at + 0.15 + k * 0.08, 0.34), whole ? S.white : S.microWhite);
        ty += 10;
      });
      const when = String(f.when || '').toUpperCase();
      if (when) rise(ctx, microFit(when, tw), tx, ty + 1, seg(dt, at + 0.3, 0.3), S.microFog);
      if (showIcon) drawIcon(ctx, icon, x + w - PAD - 9, ry + (rowH >> 1) - 4, P.fog, P.slate);
    });
    if (card.source) drawText(ctx, microFit(`SOURCE: ${String(card.source).toUpperCase()}`, w - 2 * PAD), x + PAD, box.y + box.h - 12, S.microFog);
  } finally {
    ctx.restore();
  }
  return true;
}

/** THE MOMENT ON THE BOARD set for the vertical stage: the channel's chalkboard, its ground to scale inside the box. */
export function drawVerticalChalkboard(ctx, dt, card, box) {
  const k = card?.chalk;
  const raw = Number(k?.metres !== undefined && k?.yards === undefined ? k?.metres : k?.yards);
  if (!k || !(raw >= 1 && raw <= 70) || !['football', 'american-football', 'rugby'].includes(k.sport || 'football')) return false;
  // (the board's wooden frame is 4 px either side of the box it is given: the box is the safe column itself)
  drawChalkboard(ctx, dt, card, { x: box.x + M, y: box.y + 4, w: box.w - 2 * M, h: box.h - 8 });
  return true;
}
