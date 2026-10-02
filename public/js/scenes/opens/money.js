// MONEY MINUTE open: a market chart builds itself. The baseline and grid draw
// out, five green bars rise one after another (ease-out, no bounce) and a
// trend line climbs across them to an arrow head. Accent: green.
import { P } from '../../palette.js';
import { u32, seg, easeOutQuint, easeInOut, linePts } from '../../gfx/index.js';
import { backdrop, playOpen, CENTRE, W, H } from './kit.js';

const BARS = [13, 21, 17, 29, 40];
const BW = 8;
const GAP = 4;
const SPAN = BARS.length * BW + (BARS.length - 1) * GAP; // 56
const BASE = 22; // baseline below the emblem centre

// trend line through points above the bar tops, ending in the arrow tip
const LINE = (() => {
  const pts = BARS.map((h, i) => [-SPAN / 2 + i * (BW + GAP) + BW / 2, BASE - h - 6]);
  pts[pts.length - 1][1] -= 2;
  const out = [];
  for (let k = 1; k < pts.length; k++) {
    linePts(pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], (x, y, i) => {
      if (k > 1 && i === 0) return;
      out.push(x, y);
    });
  }
  return { px: Int16Array.from(out), tip: pts[pts.length - 1] };
})();

function emblem(ctx, dt, x, y) {
  const x0 = x - SPAN / 2;
  const by = y + BASE;
  // baseline and grid draw out from the centre
  const g = easeOutQuint(seg(dt, 0.12, 0.4));
  if (g > 0) {
    const half = Math.round((SPAN / 2 + 6) * g);
    ctx.fillStyle = P.slate;
    for (const gy of [12, 24, 36]) {
      const hw = Math.round(half * (1 - gy / 120));
      ctx.fillRect(x - hw, by - gy, hw * 2, 1);
    }
    ctx.fillStyle = P.fog;
    ctx.fillRect(x - half, by, half * 2, 1);
  }
  // the bars rise one after another
  BARS.forEach((h, i) => {
    const p = easeOutQuint(seg(dt, 0.34 + i * 0.1, 0.42));
    const hh = Math.round(h * p);
    if (hh <= 0) return;
    const bx = x0 + i * (BW + GAP);
    const top = by - hh;
    ctx.fillStyle = P.green;
    ctx.fillRect(bx, top, BW, hh);
    ctx.fillStyle = P.darkGreen;
    ctx.fillRect(bx + BW - 2, top, 2, hh);
    if (hh > 1) {
      ctx.fillStyle = P.cream;
      ctx.fillRect(bx, top, BW - 2, 1);
    }
  });
  // trend line climbs across them, then the arrow head lands
  const lp = easeInOut(seg(dt, 0.9, 0.5));
  const n = LINE.px.length / 2;
  const upto = Math.round(n * lp);
  for (let i = 0; i < upto; i++) {
    const lx = x + LINE.px[i * 2];
    const ly = y + LINE.px[i * 2 + 1];
    ctx.fillStyle = P.black;
    ctx.fillRect(lx, ly + 1, 1, 1);
    ctx.fillStyle = P.white;
    ctx.fillRect(lx, ly, 1, 1);
  }
  if (upto > 0 && upto < n) {
    ctx.fillStyle = P.white;
    ctx.fillRect(x + LINE.px[(upto - 1) * 2] - 1, y + LINE.px[(upto - 1) * 2 + 1] - 1, 3, 3);
  }
  const ap = easeOutQuint(seg(dt, 1.36, 0.22));
  if (ap > 0) {
    // arrow head pointing up and to the right, growing from the tip
    const tx = x + LINE.tip[0];
    const ty = y + LINE.tip[1];
    const s = Math.max(1, Math.round(5 * ap));
    ctx.fillStyle = P.white;
    for (let k = 0; k < s; k++) {
      ctx.fillRect(tx - k, ty - 1 + k - s + 1 + 1, 1, 1);
      ctx.fillRect(tx + 1 - k + (s - 1), ty, 1, 1);
    }
    ctx.fillRect(tx - s + 1, ty - s + 1, s, 1);
    ctx.fillRect(tx, ty - s + 1, 1, s);
  }
}

// ledger texture: faint dotted rules every 12 px where the backdrop is lit
function ledger(d, level) {
  const c = u32(P.ink);
  const c2 = u32(P.slate);
  for (let y = 6; y < H; y += 12) {
    for (let x = 0; x < W; x += 2) {
      const lv = level(x, y);
      if (lv < 0.2) continue;
      d[y * W + x] = lv > 0.9 ? c2 : c;
    }
  }
}

const background = () => backdrop({ key: 'money', colors: [P.black, P.ink], cx: CENTRE.x, cy: CENTRE.y, reach: 230, texture: ledger });

export const MONEY = {
  accent: P.green,
  style: { accent: P.green, plate: P.black, ink: 'light', bar: P.green },
  background,
  emblem,
  absorb: 0.36,
  shoulder: 30,
};

export function drawMoneyMinute(ctx, dt, info) {
  playOpen(ctx, dt, info, MONEY);
}
