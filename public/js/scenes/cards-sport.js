// FULL TIME's graphics (docs/programmes/full-time.md §6), in the cards' package where they are boards (black panel
// wiped in from the left, slate top line, micro kicker, the programme accent as the one colour, text rising into place,
// nothing counted up), and a frame of their own where the bible makes them a place:
//   SPORT ICONS        eleven 11 x 11 pictograms, drawn pixel by pixel, one per sport
//   SCORELINE          the result a story states: two rows (winner on top) or, when the source says who was at home,
//                      the results services' HOME score - score AWAY; FT or DRAW beside it
//   SCOREBOARD         SCORE CENTRE: the stadium's LED board on its gantry over the stand, a floodlight either side, one
//                      row flipping in as each result is read
//   COMING UP          a calendar leaf a date, the event under it ("WALES" v "ALBANIA")
//   CHALKBOARD         THE MOMENT ON THE BOARD: a chalk tactics board, top-down, and only what the source states: a
//                      dotted line from that distance to the goal, its length beside it
// Every board keeps clear of the top row and of the captions (y 28..134), like the other boards. No crest, no logo, no
// player: names in the channel's type.
import { P } from '../palette.js';
import { drawText, measureText } from '../font.js';
import { clamp, seg, easeOutQuint, clipRect, ellipsis, balanceLines, textW } from '../gfx/index.js';
import { nextLeaf } from './cards-more.js';

const W = 384;
const H = 216;
const SAFE_TOP = 28;
const SAFE_BOTTOM = 134;
const PX = 40;
const PW = W - 2 * PX;
const INNER = PW - 24;

const S = {
  white: { color: P.white },
  white2: { color: P.white, scale: 2 },
  white3: { color: P.white, scale: 3 },
  silver: { color: P.silver },
  silver2: { color: P.silver, scale: 2 },
  silver3: { color: P.silver, scale: 3 },
  fog: { color: P.fog },
  microFog: { color: P.fog, font: 'micro' },
  microWhite: { color: P.white, font: 'micro' },
  microBlack: { color: P.black, font: 'micro' },
  microInk: { color: P.ink, font: 'micro' },
  ink2: { color: P.ink, scale: 2 },
  ink3: { color: P.ink, scale: 3 },
};

/** Text that rises into place inside a mask at its own rows (p: 0..1). */
function rise(ctx, text, x, y, p, style) {
  if (p <= 0 || !text) return;
  const scale = style.scale || 1;
  const h = (style.font === 'micro' ? 5 : 7) * scale;
  const off = Math.round((1 - easeOutQuint(p)) * (h + 3));
  ctx.save();
  try {
    clipRect(ctx, 0, y - 3 * scale, W, h + 3 * scale + 1);
    drawText(ctx, text, x, y + off, style);
  } finally {
    ctx.restore();
  }
}

const place = (h) => clamp(Math.round(80 - h / 2), SAFE_TOP, SAFE_BOTTOM - h);
const srcText = (source) => (source ? ellipsis(`SOURCE: ${String(source).toUpperCase()}`, INNER, 1) : '');

/** The board's panel: black, wiped in from the left over 0.3 s, a slate top line and the kicker (an icon before it). */
function panel(ctx, dt, PY, PH, kicker, icon = null, acc = P.orange) {
  const vis = Math.round(PW * easeOutQuint(seg(dt, 0, 0.3)));
  if (vis <= 0) return false;
  clipRect(ctx, PX, PY, vis, PH);
  ctx.fillStyle = P.black;
  ctx.fillRect(PX, PY, PW, PH);
  ctx.fillStyle = P.slate;
  ctx.fillRect(PX, PY, PW, 1);
  let x = PX + 12;
  if (icon && ICONS[icon]) {
    drawIcon(ctx, icon, x, PY + 6, acc);
    x += 15;
  }
  drawText(ctx, kicker, x, PY + 10, S.microFog);
  return true;
}

/** A small cache: one layout per board content (rebuilt when the content changes). */
function cache(limit = 40) {
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

// ---------------------------------------------------------------- the sport icons

// 11 x 11, '#' the icon's colour, '+' its shade (a darker step), '.' nothing. Each reads as its sport at 1x: a ball, a
// racket, a car side-on, a bat and ball, an oval ball, a helmet, a basketball, a glove, a bicycle, a flag on a green, a
// runner.
export const ICONS = {
  football: [
    '...#####...',
    '..#++#++#..',
    '.#++###++#.',
    '####+++####',
    '###+++++###',
    '####+++####',
    '#+#######+#',
    '#++##+##++#',
    '.#+#+++#+#.',
    '..#######..',
    '...#####...',
  ],
  tennis: [
    '.####....##',
    '#+#+##...##',
    '##+#+#.....',
    '#+#+##.....',
    '##+#+#.....',
    '.####......',
    '....##.....',
    '.....##....',
    '......##...',
    '.......##..',
    '........##.',
  ],
  f1: [
    '...........',
    '...........',
    '###........',
    '.#...#.....',
    '.#..###....',
    '#########..',
    '###########',
    '#++#...#++#',
    '#++#...#++#',
    '.##.....##.',
    '...........',
  ],
  cricket: [
    '.........#.',
    '........#..',
    '.......###.',
    '......####.',
    '.....####..',
    '....####...',
    '...####....',
    '..####.....',
    '..###...##.',
    '...#...#++#',
    '.......#++#',
  ],
  rugby: [
    '......####.',
    '....##+++##',
    '...#+++#++#',
    '..#++#+#++#',
    '.#++#+#++#.',
    '.#+#+#++#..',
    '#++#+++#...',
    '#++++##....',
    '#+++#......',
    '.###.......',
    '...........',
  ],
  'american-football': [
    '...#####...',
    '.##+++++#..',
    '#+++++++##.',
    '#++++++++#.',
    '#+++##+++##',
    '#++#..#+#.#',
    '.#+#..####.',
    '.#++#.#..#.',
    '..##..####.',
    '...........',
    '...........',
  ],
  basketball: [
    '...#####...',
    '..#++#++#..',
    '.#+++#+++#.',
    '#+#++#++#+#',
    '#++#+#+#++#',
    '###########',
    '#++#+#+#++#',
    '#+#++#++#+#',
    '.#+++#+++#.',
    '..#++#++#..',
    '...#####...',
  ],
  boxing: [
    '..#####....',
    '.#+++++#...',
    '#++++++##..',
    '#+++++#++#.',
    '#+++++#++#.',
    '#++++++##..',
    '.#+++++#...',
    '.#######...',
    '.#+++++#...',
    '.#######...',
    '...........',
  ],
  cycling: [
    '...........',
    '...........',
    '..###...##.',
    '...#....#..',
    '...######..',
    '....#.#.#..',
    '.###.#.###.',
    '#...###...#',
    '#.+#+.#.+.#',
    '#...#.#...#',
    '.###...###.',
  ],
  golf: [
    '...#.......',
    '...###.....',
    '...#####...',
    '...###.....',
    '...#.......',
    '...#.......',
    '...#.......',
    '...#.......',
    '..+#+......',
    '.+++++++...',
    '+++++++++++',
  ],
  athletics: [
    '......##...',
    '......##...',
    '....###....',
    '...#.###...',
    '..#..#..#..',
    '.....##....',
    '....#..#...',
    '...#....#..',
    '..#......#.',
    '.#.........',
    '...........',
  ],
};
// the sports the desk names, to an icon (a league's own name never: NFL is the helmet, NBA the basketball; baseball, ice
// hockey and the rest have none: no icon is better than a wrong one)
const ICON_OF = { football: 'football', tennis: 'tennis', f1: 'f1', cricket: 'cricket', rugby: 'rugby', 'american-football': 'american-football', basketball: 'basketball', boxing: 'boxing', cycling: 'cycling', golf: 'golf', athletics: 'athletics' };
export const iconOf = (sport) => ICON_OF[sport] || null;

/** One icon at (x, y), in `color` with its shade a step darker (the shade is the ink on a pale icon). */
export function drawIcon(ctx, name, x, y, color = P.white, shade = null) {
  const rows = ICONS[name];
  if (!rows) return;
  const dark = shade || (color === P.white || color === P.silver ? P.steel : P.ink);
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const ch = rows[r][c];
      if (ch === '.') continue;
      ctx.fillStyle = ch === '#' ? color : dark;
      ctx.fillRect(x + c, y + r, 1, 1);
    }
  }
}

// ---------------------------------------------------------------- SCORELINE

/** A team's name on a board: in capitals, at 2x when it fits the column, else 1x on up to two lines. */
function nameLines(name, maxW) {
  const t = String(name || '').toUpperCase();
  if (textW(t, 2) <= maxW) return { lines: [t], scale: 2 };
  return { lines: balanceLines(t, maxW, 1, 2), scale: 1 };
}

const SCORE_LAYOUTS = cache();
function scoreLayout(sc, source) {
  return SCORE_LAYOUTS(`${sc.a}|${sc.b}|${sc.sa}|${sc.sb}|${sc.home}|${sc.draw}|${sc.stage || ''}|${source}`, () => {
    const top = 24;
    const src = srcText(source);
    const tag = sc.draw ? 'DRAW' : 'FT';
    const stage = sc.stage ? String(sc.stage).toUpperCase() : '';
    if (sc.home) {
      // HOME score - score AWAY: the home side the source names, on the left
      const homeIsA = sc.home === sc.a;
      const home = homeIsA ? { name: sc.a, score: sc.sa, won: !sc.draw } : { name: sc.b, score: sc.sb, won: false };
      const away = homeIsA ? { name: sc.b, score: sc.sb, won: false } : { name: sc.a, score: sc.sa, won: !sc.draw };
      const boxW = Math.max(textW(String(home.score), 3), textW(String(away.score), 3)) + 8;
      const mid = PX + (PW >> 1);
      const colW = (INNER >> 1) - boxW - 10;
      const hn = { ...nameLines(home.name, colW), ...home };
      const an = { ...nameLines(away.name, colW), ...away };
      const bh = 34;
      const h = top + bh + 10 + (src ? 13 : 0) + 9;
      const PY = place(h);
      return { kind: 'h', PY, PH: h, top, bh, mid, boxW, hn, an, tag, stage, src, srcY: PY + top + bh + 10 };
    }
    // two rows: the winner on top (the source's order on a draw), FT or DRAW beside them
    const rows = [
      { name: sc.a, score: sc.sa, won: !sc.draw },
      { name: sc.b, score: sc.sb, won: false },
    ];
    const scoreW = Math.max(...rows.map((r) => textW(String(r.score), 3)));
    const tagW = 26;
    const nameW = INNER - scoreW - tagW - 14;
    const laid = rows.map((r) => ({ ...r, ...nameLines(r.name, nameW) }));
    const rowH = (r) => Math.max(21, r.lines.length * (r.scale === 2 ? 16 : 10));
    const bh = rowH(laid[0]) + 6 + rowH(laid[1]);
    const h = top + bh + (stage ? 10 : 0) + (src ? 13 : 0) + 9;
    const PY = place(h);
    return { kind: 'v', PY, PH: h, top, bh, laid, rowH: laid.map(rowH), scoreW, tagW, nameW, tag, stage, src, srcY: PY + top + bh + (stage ? 10 : 0) + 6 };
  });
}

/** A score landing: the digits drop into their slot from above (p 0..1), at 3x. */
function landScore(ctx, text, x, y, p, style) {
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

/** SCORELINE: o = { score: { a, b, sa, sb, winner, home, draw, sport, stage? }, source }. */
export function drawScoreline(ctx, dt, o, acc = P.orange) {
  const sc = o.score;
  if (!sc) return;
  const L = scoreLayout(sc, o.source);
  ctx.save();
  try {
    if (!panel(ctx, dt, L.PY, L.PH, 'RESULT', iconOf(sc.sport), acc)) return;
    const y0 = L.PY + L.top;
    if (L.kind === 'h') {
      // the two boxes meet at the middle; the names stand outside them, right and left aligned; HOME and AWAY under them
      const bx1 = L.mid - 3 - L.boxW;
      const bx2 = L.mid + 3;
      for (const [bx, side, at] of [[bx1, L.hn, 0.55], [bx2, L.an, 0.7]]) {
        const p = easeOutQuint(seg(dt, at - 0.2, 0.25));
        if (p <= 0) continue;
        ctx.fillStyle = side.won ? acc : P.ink;
        ctx.fillRect(bx, y0 + 2, L.boxW, 25);
        const t = String(side.score);
        landScore(ctx, t, bx + ((L.boxW - textW(t, 3)) >> 1), y0 + 5, seg(dt, at, 0.3), side.won ? S.ink3 : S.white3);
      }
      const nameAt = (side, right, at) => {
        const lh = side.scale === 2 ? 16 : 10;
        const total = side.lines.length * lh - (lh - 7 * side.scale);
        side.lines.forEach((l, k) => {
          const w = textW(l, side.scale);
          const x = right ? bx1 - 10 - w : bx2 + L.boxW + 10;
          rise(ctx, l, x, y0 + 14 - (total >> 1) + k * lh, seg(dt, at + k * 0.06, 0.34), side.scale === 2 ? (side.won ? S.white2 : S.silver2) : side.won ? S.white : S.silver);
        });
      };
      nameAt(L.hn, true, 0.35);
      nameAt(L.an, false, 0.45);
      if (dt >= 0.9) {
        drawText(ctx, 'HOME', bx1 - 10 - measureText('HOME', 1, 'micro'), y0 + 30, S.microFog);
        drawText(ctx, 'AWAY', bx2 + L.boxW + 10, y0 + 30, S.microFog);
        const tw = measureText(L.tag, 1, 'micro');
        drawText(ctx, L.tag, L.mid - (tw >> 1), y0 + 30, S.microWhite);
        if (L.stage) drawText(ctx, L.stage, PX + PW - 12 - measureText(L.stage, 1, 'micro'), L.PY + 10, S.microFog);
      }
    } else {
      const scoreX = PX + PW - 12 - L.tagW - 6 - L.scoreW;
      let y = y0;
      L.laid.forEach((r, i) => {
        const h = L.rowH[i];
        const at = 0.35 + i * 0.12;
        // the winner in white with its score in the accent; the loser in silver (a draw: both white)
        const lh = r.scale === 2 ? 16 : 10;
        const total = r.lines.length * lh - (lh - 7 * r.scale);
        const style = r.won || L.tag === 'DRAW' ? (r.scale === 2 ? S.white2 : S.white) : r.scale === 2 ? S.silver2 : S.silver;
        r.lines.forEach((l, k) => rise(ctx, l, PX + 12, y + ((h - total) >> 1) + k * lh, seg(dt, at + k * 0.06, 0.34), style));
        const t = String(r.score);
        landScore(ctx, t, scoreX + (L.scoreW - textW(t, 3)), y + ((h - 21) >> 1), seg(dt, 0.65 + i * 0.12, 0.3), r.won ? { color: acc, scale: 3 } : L.tag === 'DRAW' ? S.white3 : S.silver3);
        y += h + 6;
        // a hairline between the two rows
        if (i === 0 && dt >= 0.3) {
          ctx.fillStyle = P.ink;
          ctx.fillRect(PX + 12, y - 4, INNER - L.tagW - 6, 1);
        }
      });
      // FT (or DRAW) in a small block beside the rows, the accent's ink on it
      // (wiped on from the left over 0.15 s once the second score has landed, the verdict after the evidence)
      const tp = easeOutQuint(seg(dt, 0.95, 0.15));
      if (tp > 0) {
        const tx = PX + PW - 12 - L.tagW;
        const ty = y0 + (L.bh >> 1) - 6;
        const tw = Math.max(1, Math.round(L.tagW * tp));
        ctx.save();
        try {
          clipRect(ctx, tx, ty, tw, 12);
          ctx.fillStyle = L.tag === 'DRAW' ? P.slate : acc;
          ctx.fillRect(tx, ty, tw, 12);
          drawText(ctx, L.tag, tx + ((L.tagW - textW(L.tag, 1)) >> 1), ty + 3, { color: L.tag === 'DRAW' ? P.white : P.black });
        } finally {
          ctx.restore();
        }
      }
      if (L.stage && dt >= 0.95) drawText(ctx, L.stage, PX + 12, y0 + L.bh + 3, S.microFog);
    }
    if (L.src) drawText(ctx, L.src, PX + 12, L.srcY, S.microFog);
  } finally {
    ctx.restore();
  }
}

// ---------------------------------------------------------------- SCOREBOARD (SCORE CENTRE)

// (the full width of the safe area with its rim; the gantry over it, clear of the top row's bug and clock at y 8..21)
const BOARD = { x: 42, y: 36, w: 300 };

/** The stand, the gantry and the two floodlights behind the board (drawn once per size and cached). */
let groundCache = null;
function ground(ctx, night) {
  const key = night ? 'night' : 'day';
  if (!groundCache || groundCache.key !== key) {
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
    const g = c.getContext('2d');
    // the sky: night navy to black, or a pale evening slate
    const sky = g.createLinearGradient(0, 0, 0, 140);
    sky.addColorStop(0, night ? P.black : P.slate);
    sky.addColorStop(1, night ? P.ink : P.steel);
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    // the stand: dark tiers rising to the right and left, a lit exit here and there, the roof's edge
    for (let i = 0; i < 9; i++) {
      const y = 120 + i * 11;
      g.fillStyle = i % 2 ? P.black : P.ink;
      g.fillRect(0, y, W, 11);
      g.fillStyle = P.slate;
      g.fillRect(0, y, W, 1);
      // a row of seats, and from the third tier down a still crowd: heads as a two-tone texture, a muted scarf here
      // and there (no animation: a full ground is the promise, a twinkling one is noise)
      for (let x = (i * 3) % 4; x < W; x += 4) {
        // a deterministic hash per seat: some empty, the rest heads in two tones, a rare muted scarf
        const hash = ((x * 73856093) ^ (i * 19349663)) >>> 0;
        g.fillStyle = P.slate;
        if (hash % 5) g.fillRect(x, y + 7, 2, 1);
        if (i >= 2 && hash % 7 > 1) {
          const h = (hash >>> 3) % 23;
          g.fillStyle = h < 11 ? P.slate : h < 20 ? P.steel : h === 21 ? P.darkRed : P.navy;
          g.fillRect(x + ((hash >>> 8) % 2), y + 3 + ((hash >>> 9) % 2), 2, 2);
        }
      }
    }
    // the floodlight towers either side, outside the board: a lattice mast and a head of lamps with a soft halo
    // (static: no beams), the heads under the top row so the bug and the clock never sit on them
    for (const x of [14, W - 26]) {
      g.fillStyle = P.slate;
      g.fillRect(x + 5, 40, 2, 110);
      for (let y = 44; y < 150; y += 6) g.fillRect(x + 3, y, 6, 1);
      const halo = g.createRadialGradient(x + 6, 35, 1, x + 6, 35, 24);
      halo.addColorStop(0, night ? 'rgba(254,174,52,0.55)' : 'rgba(234,212,170,0.25)');
      halo.addColorStop(1, 'rgba(254,174,52,0)');
      g.fillStyle = halo;
      g.fillRect(x - 18, 22, 48, 38);
      g.fillStyle = P.steel;
      g.fillRect(x, 30, 12, 10);
      g.fillStyle = night ? P.cream : P.silver;
      for (let r = 0; r < 2; r++) for (let k = 0; k < 3; k++) g.fillRect(x + 1 + k * 4, 31 + r * 5, 2, 3);
    }
    // the gantry: a steel truss the board hangs from, its two hangers
    g.fillStyle = P.steel;
    g.fillRect(BOARD.x - 8, BOARD.y - 10, BOARD.w + 16, 2);
    g.fillRect(BOARD.x - 8, BOARD.y - 4, BOARD.w + 16, 1);
    for (let x = BOARD.x - 8; x < BOARD.x + BOARD.w + 8; x += 8) {
      g.fillRect(x, BOARD.y - 9, 1, 5);
      g.fillRect(x + 1, BOARD.y - 8, 1, 1);
    }
    groundCache = { key, c };
  }
  ctx.drawImage(groundCache.c, 0, 0);
}

/**
 * The board's columns: the icon's on the left, the day's on the right (only when a row has a day), the home names
 * right-aligned to the score column and the away names left-aligned after it. One type size for every name on a board
 * (a real board's, and a mixed one reads as broken): 1x, with the score column moved off the middle when the names need
 * it; on a board of up to four rows a name too long for that goes on two 1x lines; on the compact board (five or six
 * rows) every name drops to the micro face together. Cut, with dots, only when even that cannot hold it.
 */
const BOARD_LAYOUTS = cache();
export function boardLayout(rows) {
  return BOARD_LAYOUTS(rows.map((r) => `${r.a}|${r.b}|${r.sa}|${r.sb}|${r.day || ''}|${r.sport || ''}`).join('~'), () => {
    const big = rows.length <= 4;
    const pitch = big ? 18 : rows.length === 6 ? 12 : 13;
    const sc = big ? 2 : 1;
    const bx = BOARD.x;
    const bw = BOARD.w;
    const L = bx + 4 + 11 + 5;
    const R = bx + bw - 6 - (rows.some((r) => r.day) ? 17 : 0);
    const scores = rows.map((r) => `${r.sa}-${r.sb}`);
    const scoreW = Math.max(...scores.map((t) => textW(t, sc))) + 8;
    const up = (n) => String(n || '').toUpperCase();
    const fit = (wa, wb) => {
      // the score column as near the middle as the widest names allow, or null when they cannot share the row
      const lo = L + wa + 6;
      const hi = R - wb - 6 - scoreW;
      return lo <= hi ? clamp(bx + ((bw - scoreW) >> 1), lo, hi) : null;
    };
    const widest = (key, w) => Math.max(...rows.map((r) => w(up(r[key]))));
    const one = (t) => textW(t, 1);
    const micro = (t) => measureText(t, 1, 'micro');
    let font = 'one';
    let x = fit(widest('a', one), widest('b', one));
    let wrapW = 0;
    if (x === null && big) {
      // two lines for the long names, each column at most half the room
      wrapW = (R - L - scoreW - 12) >> 1;
      const lines = (t) => (one(t) <= wrapW ? [t] : balanceLines(t, wrapW, 1, 2));
      const ok = rows.every((r) => [up(r.a), up(r.b)].every((t) => lines(t).length <= 2 && lines(t).every((l) => one(l) <= wrapW)));
      if (ok) {
        font = 'wrap';
        x = fit(widest('a', (t) => Math.max(...lines(t).map(one))), widest('b', (t) => Math.max(...lines(t).map(one))));
      }
    }
    if (x === null) {
      font = 'micro';
      x = fit(widest('a', micro), widest('b', micro));
    }
    if (x === null) {
      font = 'cut';
      x = bx + ((bw - scoreW) >> 1);
    }
    const homeW = x - 6 - L;
    const awayW = R - (x + scoreW + 6);
    const cut = (t, w) => {
      let c = t;
      while (c.length > 4 && micro(`${c}...`) > w) c = c.slice(0, -1).trimEnd();
      return micro(t) <= w ? t : `${c}...`;
    };
    const name = (t, w) => {
      if (font === 'one') return { lines: [t] };
      if (font === 'wrap') return { lines: one(t) <= wrapW ? [t] : balanceLines(t, wrapW, 1, 2) };
      return { lines: [font === 'micro' ? t : cut(t, w)], micro: true };
    };
    const laid = rows.map((r, i) => {
      const aWon = !r.draw && Number(r.sa) > Number(r.sb);
      const bWon = !r.draw && Number(r.sb) > Number(r.sa);
      return { ...r, s: scores[i], a: name(up(r.a), homeW), b: name(up(r.b), awayW), aLit: aWon || !!r.draw, bLit: bWon || !!r.draw };
    });
    return { big, pitch, sc, scoreX: x, scoreW, laid, font };
  });
}

/** The board's face for a height: the slate rim, the black, the grid of unlit LEDs (7,500 pixels: never a frame's work). */
const FACES = new Map();
function boardFace(bh) {
  let c = FACES.get(bh);
  if (c) return c;
  const w = BOARD.w + 4;
  const h = bh + 4;
  c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const g = c.getContext('2d');
  g.fillStyle = P.slate;
  g.fillRect(0, 0, w, h);
  g.fillStyle = P.black;
  g.fillRect(2, 2, BOARD.w, bh);
  g.fillStyle = P.ink;
  for (let y = 3; y < bh + 1; y += 2) for (let x = 3; x < BOARD.w + 1; x += 2) g.fillRect(x, y, 1, 1);
  FACES.set(bh, c);
  return c;
}

/** A name of one or two lines, its block centred on the row; right-aligned at x when `right`. */
function boardText(ctx, n, x, ry, rh, right, color) {
  const style = n.micro ? { color, font: 'micro' } : { color };
  const lh = n.micro ? 5 : 7;
  const gap = n.lines.length > 1 ? 2 : 0;
  const total = n.lines.length * lh + gap * (n.lines.length - 1);
  n.lines.forEach((l, k) => {
    const w = n.micro ? measureText(l, 1, 'micro') : textW(l, 1);
    drawText(ctx, l, right ? x - w : x, ry + ((rh - total) >> 1) + k * (lh + gap), style);
  });
}

/**
 * SCOREBOARD (SCORE CENTRE, full frame): o = { scores: [{ a, b, sa, sb, draw, sport, day? }], title, source, rowTimes?,
 * night? }.
 * Row i flips in at rowTimes[i] seconds (the moment its line is read), else every 0.9 s from 0.6 s.
 */
export function drawScoreboard(ctx, dt, o, acc = P.orange) {
  const rows = (o.scores || []).slice(0, 6);
  ground(ctx, o.night !== false);
  if (!rows.length) return;
  const B = boardLayout(rows);
  const head = 16;
  // (the sources on the board's foot, as every board credits its own: "SOURCES: SKY SPORTS / BBC SPORT")
  const credit = o.source ? `SOURCE${/\s\/\s/.test(o.source) ? 'S' : ''}: ${String(o.source).toUpperCase()}` : '';
  const bh = head + rows.length * B.pitch + 6 + (credit ? 8 : 0);
  const by = clamp(Math.round(SAFE_TOP + 4 + (SAFE_BOTTOM - SAFE_TOP - 8 - bh) / 2), SAFE_TOP + 2, SAFE_BOTTOM - bh - 2);
  const bx = BOARD.x;
  const bw = BOARD.w;
  // the board: black, a slate rim, a fine grid of unlit LEDs behind the type (drawn once a height, then copied)
  ctx.drawImage(boardFace(bh), bx - 2, by - 2);
  // the hangers from the gantry to the board
  ctx.fillStyle = P.steel;
  ctx.fillRect(bx + 20, BOARD.y - 4, 1, by - BOARD.y + 2);
  ctx.fillRect(bx + bw - 21, BOARD.y - 4, 1, by - BOARD.y + 2);
  // the title in the accent, centred, with the board's clock-face rule under it
  const title = ellipsis(String(o.title || 'THE LATEST RESULTS').toUpperCase(), bw - 20, 1);
  drawText(ctx, title, bx + ((bw - textW(title, 1)) >> 1), by + 4, { color: acc });
  ctx.fillStyle = P.slate;
  ctx.fillRect(bx + 8, by + head - 3, bw - 16, 1);
  if (credit) {
    let c = credit;
    while (measureText(c, 1, 'micro') > bw - 16 && c.includes(' / ')) c = c.slice(0, c.lastIndexOf(' / '));
    drawText(ctx, c, bx + bw - 8 - measureText(c, 1, 'micro'), by + bh - 9, S.microFog);
  }
  const times = o.rowTimes || rows.map((_, i) => 0.6 + i * 0.9);
  B.laid.forEach((r, i) => {
    const at = times[i] ?? 0.6 + i * 0.9;
    if (dt < at) return;
    // the row flips in: drawn into a band that opens from its middle over 0.18 s
    const p = easeOutQuint(seg(dt, at, 0.18));
    const ry = by + head + i * B.pitch + 2;
    const rh = B.pitch - 2;
    const open = Math.max(1, Math.round(rh * p));
    ctx.save();
    try {
      clipRect(ctx, bx + 2, ry + ((rh - open) >> 1), bw - 4, open);
      const icon = iconOf(r.sport);
      if (icon) drawIcon(ctx, icon, bx + 4, ry + ((rh - 11) >> 1), P.fog, P.slate);
      // the winner in white, the loser in silver (a draw: both white); the score in the programme's accent (the LED's
      // amber, and never NEWS IN 60's yellow)
      boardText(ctx, r.a, B.scoreX - 6, ry, rh, true, r.aLit ? P.white : P.silver);
      boardText(ctx, r.b, B.scoreX + B.scoreW + 6, ry, rh, false, r.bLit ? P.white : P.silver);
      drawText(ctx, r.s, B.scoreX + ((B.scoreW - textW(r.s, B.sc)) >> 1), ry + ((rh - 7 * B.sc) >> 1), { color: acc, scale: B.sc });
      if (r.day) drawText(ctx, String(r.day).toUpperCase(), bx + bw - 6 - measureText(String(r.day).toUpperCase(), 1, 'micro'), ry + ((rh - 5) >> 1), S.microFog);
    } finally {
      ctx.restore();
    }
  });
}

// ---------------------------------------------------------------- COMING UP

/** An event's two sides ("WALES V ALBANIA" -> ["WALES", "ALBANIA"]); an event by its own name stays whole. */
export function sidesOf(event) {
  const m = /^(.+?)\s+(?:V|VS|V\.|VS\.|VERSUS)\s+(.+)$/i.exec(String(event || ''));
  return m ? [m[1].toUpperCase(), m[2].toUpperCase()] : [String(event || '').toUpperCase()];
}

const COMING_LAYOUTS = cache();
export function comingLayout(fixtures, title, source) {
  return COMING_LAYOUTS(`${fixtures.map((f) => `${f.event}~${f.date}~${f.when}~${f.sport || ''}`).join('|')}|${title}|${source}`, () => {
    const n = fixtures.length;
    const colW = Math.floor(INNER / n);
    const LW = 40;
    const LH = 42;
    // The event on one line when it fits its column ("WALES V ALBANIA"), else a side a line with a small "V" between.
    // One type size for every name on the board, as on the scoreboard: 1x with the columns evenly spaced; else 1x with
    // the columns spaced by what each needs (a leaf and its icon, 70 px, or its widest name); else all in the micro face,
    // the same two ways; a side is cut with dots only when even that cannot hold it.
    const sidesAll = fixtures.map((f) => sidesOf(f.event));
    const build = (micro) => sidesAll.map((sides) => {
      const one = sides.length === 2 ? `${sides[0]} V ${sides[1]}` : sides[0];
      const w = (t) => (micro ? measureText(t, 1, 'micro') : textW(t, 1));
      const lines = w(one) <= colW - 6 ? [{ text: one, micro }] : sides.map((x) => ({ text: x, micro }));
      return { lines, ext: Math.max(70, ...lines.map((l) => w(l.text))) };
    });
    const left = PX + 8;
    const span = PW - 16;
    // (two names of neighbouring columns never closer than three word spaces: they would read as one)
    const GAP = 12;
    const even = (cs) => cs.every((c, i) => {
      const cx = PX + 12 + colW * (i + 0.5);
      return cx - c.ext / 2 >= left && cx + c.ext / 2 <= left + span && (i + 1 >= n || colW >= c.ext / 2 + cs[i + 1].ext / 2 + GAP);
    }) && cs.map((_, i) => PX + 12 + Math.round(colW * (i + 0.5)));
    const flex = (cs) => {
      const need = cs.reduce((t, c) => t + c.ext, 0) + GAP * (n - 1);
      if (need > span) return null;
      const extra = (span - need) / n;
      let x = left;
      return cs.map((c) => {
        const cx = Math.round(x + (c.ext + extra) / 2);
        x += c.ext + extra + GAP;
        return cx;
      });
    };
    let laid = build(false);
    let at = even(laid) || flex(laid);
    if (!at) {
      laid = build(true);
      at = even(laid) || flex(laid);
    }
    if (!at) {
      // (the last resort: each side cut to an even share of the board)
      const share = Math.floor((span - GAP * (n - 1)) / n);
      laid = laid.map((c) => ({ ext: share, lines: c.lines.map((l) => ({ ...l, text: ellipsis(l.text, share, 1) })) }));
      at = flex(laid);
    }
    const cols = fixtures.map((f, i) => ({ cx: at[i], leaf: nextLeaf(f), lines: laid[i].lines, icon: iconOf(f.sport) }));
    const top = 20;
    const namesY = top + LH + 7;
    const namesH = Math.max(...cols.map((c) => (c.lines.length === 1 ? 7 : c.lines.length * 10 + (c.lines.length - 1) * 8 - 3)));
    const bh = LH + 7 + namesH;
    const h = top + bh + 8;
    const PY = place(h);
    // (the credit on the kicker's row, right-aligned: the calendar needs the room under it)
    const t = String(title || 'COMING UP').toUpperCase();
    const room = PW - 24 - measureText(t, 1, 'micro') - 12;
    let src = source ? String(source).toUpperCase() : '';
    while (src && measureText(src, 1, 'micro') > room) src = src.includes(' / ') ? src.slice(0, src.lastIndexOf(' / ')) : '';
    return { PY, PH: h, cols, LW, LH, top, namesY, src, title: t };
  });
}

/** COMING UP / THE WEEKEND AHEAD: o = { fixtures: [{ event, when, date, sport }] (two or three), title, source }. */
export function drawComingUp(ctx, dt, o, acc = P.orange) {
  const fixtures = (o.fixtures || []).slice(0, 3);
  if (fixtures.length < 2) return;
  const L = comingLayout(fixtures, o.title, o.source);
  ctx.save();
  try {
    if (!panel(ctx, dt, L.PY, L.PH, L.title, null, acc)) return;
    if (L.src) drawText(ctx, L.src, PX + PW - 12 - measureText(L.src, 1, 'micro'), L.PY + 10, S.microFog);
    L.cols.forEach((c, i) => {
      const at = 0.3 + i * 0.35;
      if (dt < at) return;
      const p = easeOutQuint(seg(dt, at, 0.35));
      const lx = c.cx - (L.LW >> 1);
      const ly0 = L.PY + L.top;
      const y = ly0 - Math.round((1 - p) * 8);
      ctx.save();
      try {
        clipRect(ctx, lx, ly0 - 1, L.LW, L.LH + 1);
        ctx.fillStyle = P.silver;
        ctx.fillRect(lx, y, L.LW, L.LH);
        ctx.fillStyle = acc;
        ctx.fillRect(lx, y, L.LW, 9);
        ctx.fillStyle = P.black;
        ctx.fillRect(lx + 8, y, 2, 2);
        ctx.fillRect(lx + L.LW - 10, y, 2, 2);
        const head = ellipsis(c.leaf.head, L.LW - 4, 1);
        drawText(ctx, head, lx + ((L.LW - measureText(head, 1, 'micro')) >> 1), y + 3, S.microBlack);
        if (c.leaf.big) {
          const bs = textW(c.leaf.big, 3) <= L.LW - 4 ? 3 : 2;
          drawText(ctx, c.leaf.big, lx + ((L.LW - textW(c.leaf.big, bs)) >> 1), y + (bs === 3 ? 12 : 15), bs === 3 ? S.ink3 : S.ink2);
          drawText(ctx, c.leaf.foot, lx + ((L.LW - measureText(c.leaf.foot, 1, 'micro')) >> 1), y + 35, S.microInk);
        } else {
          const foot = ellipsis(c.leaf.foot, L.LW - 4, 1);
          drawText(ctx, foot, lx + ((L.LW - textW(foot, 1)) >> 1), y + 22, { color: P.ink });
        }
      } finally {
        ctx.restore();
      }
      // the sport's icon beside the leaf, level with its date (none for a sport without one)
      if (c.icon) drawIcon(ctx, c.icon, lx - 15, y + 16, P.fog, P.slate);
      let ny = L.PY + L.namesY;
      c.lines.forEach((l, k) => {
        if (k) {
          drawText(ctx, 'V', c.cx - (measureText('V', 1, 'micro') >> 1), ny - 2, S.microFog);
          ny += 8;
        }
        const w = l.micro ? measureText(l.text, 1, 'micro') : textW(l.text, 1);
        rise(ctx, l.text, c.cx - (w >> 1), ny + (l.micro ? 1 : 0), seg(dt, at + 0.15 + k * 0.08, 0.34), l.micro ? S.microWhite : S.white);
        ny += 10;
      });
    });
  } finally {
    ctx.restore();
  }
}

// ---------------------------------------------------------------- CHALKBOARD (THE MOMENT ON THE BOARD)

// (the channel's palette only: fresh chalk is its white, the ground's lines the same white thinned on the board's green)
const CHALK = P.white;
const CHALK_DIM = 'rgba(255,255,255,0.5)';
const CHALK_FAINT = 'rgba(255,255,255,0.3)';
const BOARD_GREEN = P.darkGreen;

/** A chalk line: continuous, its strength wavering along it (chalk on a board, never dashed nor ruled). */
function chalkLine(ctx, x0, y0, x1, y1) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) {
    const t = n ? i / n : 0;
    const x = Math.round(x0 + (x1 - x0) * t);
    const y = Math.round(y0 + (y1 - y0) * t);
    ctx.fillStyle = ((x * 31 + y * 17) % 9) < 2 ? CHALK_FAINT : CHALK_DIM;
    ctx.fillRect(x, y, 1, 1);
  }
}
/** The ground's outline: its end line and two touchlines, open at the bottom (the ground goes on past the board). */
const chalkGround = (ctx, x, y, w, h) => {
  chalkLine(ctx, x, y, x + w, y);
  chalkLine(ctx, x, y, x, y + h);
  chalkLine(ctx, x + w, y, x + w, y + h);
};
const chalkRect = (ctx, x, y, w, h, c) => {
  chalkLine(ctx, x, y, x + w, y, c);
  chalkLine(ctx, x, y + h, x + w, y + h, c);
  chalkLine(ctx, x, y, x, y + h, c);
  chalkLine(ctx, x + w, y, x + w, y + h, c);
};

/** A chalk line of dashes (the ground's dashed lines: rugby's 10 m line). */
function chalkDash(ctx, x0, x1, y) {
  for (let x = x0; x < x1; x += 6) chalkLine(ctx, x, y, Math.min(x + 3, x1), y);
}

/**
 * THE MOMENT ON THE BOARD: o = { chalk: { yards | metres, label?, sport } }, the ground top-down with the goal at the top:
 *   football           the pitch's end to scale: the penalty area, the six-yard box, the spot and the arc, the goal
 *   american-football  the posts on the end line, the end zone hatched, a line every ten yards from the goal line
 *   rugby              the posts (an H) on the try line, the in-goal behind it, the 22, the dashed 10 m and halfway
 * The dotted line runs from the distance the source states straight to the posts or the goal and is drawn over 0.8 s;
 * its length is written under the ground ("30 YARDS", "45 METRES", or the source's own words: "THE PENALTY SPOT").
 */
const CHALK_SPORTS = new Set(['football', 'american-football', 'rugby']);

export function drawChalkboard(ctx, dt, o) {
  const k = o.chalk;
  // (only the three grounds it knows, and only a distance it can draw to scale: never a made-up ground nor a moved mark)
  const raw = Number(k?.metres !== undefined && k?.yards === undefined ? k.metres : k?.yards);
  if (!k || !CHALK_SPORTS.has(k.sport || 'football') || !(raw >= 1 && raw <= 70)) return;
  const bw = 196;
  const bh = SAFE_BOTTOM - SAFE_TOP - 6;
  const bx = (W - bw) >> 1;
  const by = SAFE_TOP + 3;
  const vis = easeOutQuint(seg(dt, 0, 0.3));
  if (vis <= 0) return;
  ctx.save();
  try {
    clipRect(ctx, bx - 4, by - 4, Math.round((bw + 8) * vis), bh + 8);
    // the frame (wood, lit from above: a light edge on its top and left, a dark one on its bottom and right) and the board
    ctx.fillStyle = P.tanShade;
    ctx.fillRect(bx - 4, by - 4, bw + 8, bh + 8);
    ctx.fillStyle = P.tan;
    ctx.fillRect(bx - 4, by - 4, bw + 8, 1);
    ctx.fillRect(bx - 4, by - 4, 1, bh + 8);
    ctx.fillStyle = P.brown;
    ctx.fillRect(bx - 4, by + bh + 3, bw + 8, 1);
    ctx.fillRect(bx + bw + 3, by - 4, 1, bh + 8);
    ctx.fillStyle = P.black;
    ctx.fillRect(bx, by, bw, 1);
    ctx.fillStyle = BOARD_GREEN;
    ctx.fillRect(bx, by, bw, bh);
    // the ground, top-down and to scale: 1 unit = s px, as deep as the distance needs (40 to 80), 70 across (an American
    // football field 53, a rugby pitch 70 metres); the label under it, at 2x
    const sport = k.sport || 'football';
    const metres = k.metres !== undefined && k.yards === undefined;
    const dist = raw;
    const depth = clamp(Math.ceil((dist + 10) / 10) * 10, 40, 80);
    const s = (bh - 36) / depth;
    const gw = Math.round((sport === 'american-football' ? 53 : 70) * s);
    const gx = bx + ((bw - gw) >> 1);
    const top = by + 10;
    const gh = Math.round(depth * s);
    const cx = gx + (gw >> 1);
    const Y = (u) => top + Math.round(u * s);
    if (sport === 'football') {
      chalkGround(ctx, gx, top, gw, gh);
      chalkRect(ctx, cx - Math.round(22 * s), top, Math.round(44 * s), Math.round(18 * s));
      chalkRect(ctx, cx - Math.round(10 * s), top, Math.round(20 * s), Math.round(6 * s));
      // the goal on the line, the penalty spot, and the arc: the part of the ten-yard circle round the spot outside the box
      ctx.fillStyle = CHALK;
      ctx.fillRect(cx - Math.round(4 * s), top - 2, Math.round(8 * s) + 1, 2);
      ctx.fillRect(cx, Y(12), 1, 1);
      const r = 10 * s;
      let last = null;
      for (let a = 0; a <= Math.PI; a += 0.02) {
        const x = Math.round(cx + r * Math.cos(a));
        const y = Math.round(Y(12) + r * Math.sin(a));
        if (y <= Y(18)) continue;
        if (last && last[0] === x && last[1] === y) continue;
        chalkLine(ctx, x, y, x, y);
        last = [x, y];
      }
    } else if (sport === 'rugby') {
      // the in-goal behind the try line, the posts on it; the 22, the dashed 10 m line and halfway when the ground shows them
      chalkGround(ctx, gx, top - 6, gw, gh + 6);
      chalkLine(ctx, gx, top, gx + gw, top);
      for (const [u, dash] of [[22, false], [40, true], [50, false]]) {
        if (u >= depth) continue;
        if (dash) chalkDash(ctx, gx, gx + gw, Y(u));
        else chalkLine(ctx, gx, Y(u), gx + gw, Y(u));
      }
      ctx.fillStyle = CHALK;
      ctx.fillRect(cx - 4, top - 1, 9, 1);
      ctx.fillRect(cx - 4, top - 5, 1, 8);
      ctx.fillRect(cx + 4, top - 5, 1, 8);
    } else {
      // the posts on the end line (a crossbar on one stem), the end zone hatched, the goal line and every ten yards
      chalkGround(ctx, gx, top, gw, gh);
      ctx.save();
      try {
        clipRect(ctx, gx + 1, top + 1, gw - 1, Y(10) - top - 1);
        for (let d = -Math.round(10 * s); d < gw; d += 5) chalkLine(ctx, gx + d, Y(10), gx + d + Math.round(10 * s), top);
      } finally {
        ctx.restore();
      }
      for (let yd = 10; yd < depth; yd += 10) chalkLine(ctx, gx, Y(yd), gx + gw, Y(yd));
      ctx.fillStyle = CHALK;
      ctx.fillRect(cx - 6, top - 3, 13, 1);
      ctx.fillRect(cx - 6, top - 7, 1, 4);
      ctx.fillRect(cx + 6, top - 7, 1, 4);
      ctx.fillRect(cx, top - 2, 1, 3);
    }
    // the line from the distance to the goal, drawn as it is said, dotted; then its length under the ground
    const from = Y(dist);
    const goal = sport === 'football' ? top : top - 1;
    // (bold chalk, 2 x 2 dots: unlike the ground's thin lines; a cross where it starts)
    const p = seg(dt, 0.45, 0.8);
    const to = Math.round(from - (from - goal) * p);
    ctx.fillStyle = CHALK;
    for (let y = from - 4; y >= to; y -= 4) ctx.fillRect(cx, y, 2, 2);
    if (dt >= 0.45) {
      for (let d = -2; d <= 2; d++) {
        ctx.fillRect(cx + d, from + d, 2, 1);
        ctx.fillRect(cx + d, from - d, 2, 1);
      }
    }
    if (dt >= 1.25) {
      // the length under the ground, written large in chalk (2x, or 1x when long), a letter at a time as a hand writes
      // it (whole letters: never half a glyph on screen)
      const label = String(k.label || `${Math.round(dist)} ${String(k.unit || (metres ? 'METRES' : 'YARDS')).toUpperCase()}`).toUpperCase();
      const ls = textW(label, 2) <= bw - 12 ? 2 : 1;
      const lx = bx + ((bw - textW(label, ls)) >> 1);
      const shown = label.slice(0, Math.max(1, Math.ceil(label.length * seg(dt, 1.25, 0.45)))).trimEnd();
      drawText(ctx, shown, lx, by + bh - 6 - 7 * ls, { color: CHALK, scale: ls });
    }
  } finally {
    ctx.restore();
  }
}
