// Fallback open for programmes without their own (new ids from the editorial
// desk): the GLOBIT 24 globe mark opens like an iris, with a thin red orbit
// line drawing round it. Same package and clock as every other open.
import { P } from '../../palette.js';
import { drawLogo, measureLogo } from '../../logo.js';
import { seg, easeOutQuint, easeInOut, ring, ringPts } from '../../gfx/index.js';
import { backdrop, clipDisc, playOpen, CENTRE } from './kit.js';

const SCALE = 3;
const TAU = Math.PI * 2;
// logo.js 'mark': a 23 px globe at (0, 4) plus the bit at the top right (27 x 27 at 1x)
const GLOBE_C = { x: 11.5 * SCALE, y: (4 + 11.5) * SCALE };
const ORBIT = (() => {
  const pts = ringPts(40);
  const list = [];
  for (let i = 0; i < pts.length; i += 2) list.push([pts[i], pts[i + 1], (Math.atan2(pts[i], -pts[i + 1]) / TAU + 1) % 1]);
  list.sort((a, b) => a[2] - b[2]);
  return list;
})();

function emblem(ctx, dt, x, y) {
  if (dt < 0.2) return;
  const size = measureLogo({ variant: 'mark', scale: SCALE });
  const lx = Math.round(x - GLOBE_C.x);
  const ly = Math.round(y - GLOBE_C.y);
  const iris = Math.round(46 * easeOutQuint(seg(dt, 0.22, 0.65)));
  // a thin red orbit draws round the mark, then retracts before the glide
  const head = easeInOut(seg(dt, 0.3, 0.7));
  const tail = easeInOut(seg(dt, 1.05, 0.45));
  if (head > tail) {
    ctx.fillStyle = P.red;
    for (const [ox, oy, a] of ORBIT) if (a <= head && a >= tail) ctx.fillRect(x + ox, y + oy, 1, 1);
  }
  if (iris < 46) {
    ctx.save();
    clipDisc(ctx, x, y, iris);
    drawLogo(ctx, lx, ly, { variant: 'mark', scale: SCALE });
    ctx.restore();
    if (iris > 1) ring(ctx, x, y, iris, P.silver);
  } else drawLogo(ctx, lx, ly, { variant: 'mark', scale: SCALE });
  return size;
}

const background = () => backdrop({ key: 'generic', colors: [P.black, P.ink], cx: CENTRE.x, cy: CENTRE.y, reach: 230 });

export const GENERIC = {
  accent: P.red,
  style: { accent: P.red, plate: P.black, ink: 'light', bar: P.red },
  background,
  emblem,
  absorb: 0.26,
  shoulder: 30,
  bit: false, // the mark already carries the channel's bit
};

export function drawGeneric(ctx, dt, info) {
  playOpen(ctx, dt, info, GENERIC);
}
