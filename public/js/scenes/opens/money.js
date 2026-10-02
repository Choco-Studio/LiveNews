// MONEY MINUTE open: a market chart builds itself. The baseline and grid draw
// out, five green bars rise one after another (ease-out, no bounce) and a
// white trend line climbs across them to an arrow head. Accent: green.
import { P } from '../../palette.js';
import { seg, easeOutQuint, easeInOut, linePts, memo } from '../../gfx/index.js';
import { backdrop, playOpen, CENTRE } from './kit.js';

const cached = memo(48);
const BARS = [13, 21, 17, 29, 40];

/** Chart geometry at size factor k, cached per integer layout. */
function layout(k) {
  const bw = Math.round(8 * k);
  const gap = Math.round(4 * k);
  const base = Math.round(22 * k);
  const hs = BARS.map((h) => Math.round(h * k));
  return cached(`mm|${bw}|${gap}|${base}|${hs.join(',')}`, () => {
    const span = BARS.length * bw + (BARS.length - 1) * gap;
    const pts = hs.map((h, i) => [Math.round(-span / 2 + i * (bw + gap) + bw / 2), base - h - Math.round(6 * k)]);
    pts[pts.length - 1][1] -= Math.round(2 * k);
    const px = [];
    for (let j = 1; j < pts.length; j++) {
      linePts(pts[j - 1][0], pts[j - 1][1], pts[j][0], pts[j][1], (x, y, i) => {
        if (j > 1 && i === 0) return;
        px.push(x, y);
      });
    }
    return { bw, gap, base, hs, span, line: Int16Array.from(px), tip: pts[pts.length - 1], grid: [12, 24, 36].map((g) => Math.round(g * k)) };
  });
}

function emblem(ctx, dt, x, y, k = 1) {
  const L = layout(k);
  const x0 = x - (L.span >> 1);
  const by = y + L.base;
  // baseline and grid draw out from the centre
  const g = easeOutQuint(seg(dt, 0.12, 0.4));
  if (g > 0) {
    const half = Math.round(((L.span >> 1) + 6) * g);
    ctx.fillStyle = P.slate;
    L.grid.forEach((gy, i) => {
      const hw = Math.round(half * (1 - (i + 1) * 0.1));
      ctx.fillRect(x - hw, by - gy, hw * 2, 1);
    });
    ctx.fillStyle = P.fog;
    ctx.fillRect(x - half, by, half * 2, 1);
  }
  // the bars rise one after another
  const shade = Math.max(2, Math.round(2 * k));
  L.hs.forEach((h, i) => {
    const hh = Math.round(h * easeOutQuint(seg(dt, 0.34 + i * 0.1, 0.42)));
    if (hh <= 0) return;
    const bx = x0 + i * (L.bw + L.gap);
    const top = by - hh;
    // restrained bars: dark green bodies with a lit green cap, the accent kept to a sliver
    ctx.fillStyle = P.darkGreen;
    ctx.fillRect(bx, top, L.bw, hh);
    ctx.fillStyle = P.black;
    ctx.fillRect(bx + L.bw - shade + 1, top, shade - 1, hh);
    ctx.fillStyle = P.green;
    ctx.fillRect(bx, top, L.bw - shade + 1, Math.min(hh, 2));
  });
  // trend line climbs across them (1 px white with a 1 px black underline)
  const n = L.line.length / 2;
  const upto = Math.round(n * easeInOut(seg(dt, 0.9, 0.5)));
  for (let i = 0; i < upto; i++) {
    const lx = x + L.line[i * 2];
    const ly = y + L.line[i * 2 + 1];
    ctx.fillStyle = P.black;
    ctx.fillRect(lx, ly + 1, 1, 1);
    ctx.fillStyle = P.white;
    ctx.fillRect(lx, ly, 1, 1);
  }
  if (upto > 0 && upto < n) {
    ctx.fillStyle = P.white;
    ctx.fillRect(x + L.line[(upto - 1) * 2] - 1, y + L.line[(upto - 1) * 2 + 1] - 1, 3, 3);
  }
  // the arrow head grows out of the tip once the line arrives
  const ap = easeOutQuint(seg(dt, 1.36, 0.22));
  if (ap > 0) {
    const tx = x + L.tip[0];
    const ty = y + L.tip[1];
    // corner of the head sits just beyond the tip, arms run left and down
    const s = Math.max(1, Math.round(Math.round(6 * k) * ap));
    const cx = tx + 1;
    const cy = ty - 1;
    ctx.fillStyle = P.white;
    ctx.fillRect(cx - s + 1, cy, s, 1);
    ctx.fillRect(cx, cy, 1, s);
  }
}

const background = () => backdrop({ key: 'money', colors: [P.black, P.ink], cx: CENTRE.x, cy: CENTRE.y, reach: 230 });

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
