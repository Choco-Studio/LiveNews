// Fallback open for programmes without their own (new ids from the editorial
// desk): the GLOBIT 24 mark comes alive. Its red globe, cel-shaded like the
// logo with the white equator and meridian-lens seams, opens like an iris and
// spins down; the logo's yellow bit pops out of its shoulder and, like in every
// open, hops onto the title plate. Same package and clock as the others.
import { P } from '../../palette.js';
import { u32, seg, easeOutQuint, ring } from '../../gfx/index.js';
import { backdrop, clipDisc, frameBuffer, playOpen, CENTRE, ZOOM } from './kit.js';

const R0 = 30;
const DEG = Math.PI / 180;
const MERID = 50; // the lens seams sit at +-50 degrees when settled
const C = Object.fromEntries(['red', 'darkRed', 'pink', 'white', 'silver', 'maroon'].map((k) => [k, u32(P[k])]));
const L = (() => {
  const v = [-0.5, 0.55, 0.67];
  const n = Math.hypot(...v);
  return v.map((a) => a / n);
})();

function spin(dt) {
  return 200 * (1 - easeOutQuint(seg(dt, 0.2, 1.3)));
}

function renderGlobe(fb, R, rot) {
  const d = fb.d;
  const S = fb.w;
  const c = S >> 1;
  const RR = R + 0.5;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const dx = x - c;
      const dy = y - c;
      if (dx * dx + dy * dy > RR * RR) {
        d[i] = 0;
        continue;
      }
      const nx = dx / RR;
      const ny = -dy / RR;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const dif = nx * L[0] + ny * L[1] + nz * L[2];
      // flat cel bands like the logo: red body, dark red crescent (no glossy highlight)
      let col = dif > 0.12 ? C.red : C.darkRed;
      const lit = dif > 0.12;
      // seams of light: the equator row and two meridians either side of the centre
      if (dy === 0) col = lit ? C.white : C.silver;
      else {
        // screen-x distance from each meridian's projected curve, so seams stay 1 px wide
        const cl = Math.sqrt(Math.max(0, 1 - ny * ny));
        for (const m of [-MERID, MERID]) {
          const a = (m - rot) * DEG;
          if (Math.cos(a) <= 0.05) continue;
          if (Math.abs(nx - Math.sin(a) * cl) * RR < 0.55) col = lit ? C.white : C.silver;
        }
      }
      d[i] = col;
    }
  }
  fb.cx.putImageData(fb.img, 0, 0);
}

function emblem(ctx, dt, x, y, k = 1) {
  if (dt < 0.2) return;
  const R = Math.round(R0 * k);
  const S = 2 * R + 3;
  const fb = frameBuffer('generic-globe', S, S);
  const rot = spin(dt);
  const key = Math.round(rot * 4);
  if (fb.key !== key) {
    fb.key = key;
    renderGlobe(fb, R, rot);
  }
  const iris = Math.round((R + 3) * easeOutQuint(seg(dt, 0.2, 0.6)));
  if (iris < R + 3) {
    ctx.save();
    clipDisc(ctx, x, y, iris);
    ctx.drawImage(fb.cv, x - (S >> 1), y - (S >> 1));
    ctx.restore();
    if (iris > 1) ring(ctx, x, y, iris, P.silver);
  } else ctx.drawImage(fb.cv, x - (S >> 1), y - (S >> 1));
}

const background = () => backdrop({ key: 'generic', colors: [P.black, P.ink], cx: CENTRE.x, cy: CENTRE.y, reach: 230 });

export const GENERIC = {
  accent: P.red,
  style: { accent: P.red, plate: P.black, ink: 'light', bar: P.red },
  background,
  emblem,
  absorb: 0.26,
  shoulder: 30,
  popAt: 0.8, // the logo's bit sits on the globe's shoulder from the start, as in the mark
  warm: () => {
    for (let r = R0; r <= Math.round(R0 * ZOOM); r++) frameBuffer('generic-globe', 2 * r + 3, 2 * r + 3);
  },
};

export function drawGeneric(ctx, dt, info) {
  playOpen(ctx, dt, info, GENERIC);
}
