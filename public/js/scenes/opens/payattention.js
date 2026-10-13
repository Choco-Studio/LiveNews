// PAY ATTENTION open: the two players' lamps (pay-attention.md §6). A circle and a square, the shapes the players are
// told apart by (never by colour alone, never by a letter), lit gold side by side in their black housings on a purple
// plaque with its 1-px fog rim (purple only as a fill, never alone on the dark: the rim), as on the quiz studio's desk
// fronts. The same package and clock as every open: the plaque grows round the bit at centre stage, the circle lights,
// then the square, and the emblem glides to its slot, the plate wiping out of it. The plate itself is purple with white
// type (8.9:1), its rim fog: the programme's accent as the bible allows it, a fill under white type.
//
// The emblem is painted pixel by pixel from its true shapes at any centre and size (paintLamps), so PAY ATTENTION's
// title sequence (payattentiontitles.js) cuts to the same pixels the package then glides.
//
//   paintLamps(T, x, y, k, st)   T = { d: Uint32Array, w, h, ox, oy }; st = { a: lit, b: lit } (0 unlit, 1 lit, 2 flash)
import { P } from '../../palette.js';
import { u32, seg, easeOutQuint } from '../../gfx/index.js';
import { lazyBackdrop, playOpen, CENTRE, frameBuffer } from './kit.js';

const C = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, u32(v)]));

/** The plaque in units (k = 1 in the lock-up): half width and half height, its corner radius. */
export const PLAQUE = Object.freeze({ hw: 22, hh: 11, r: 2 });
/** The lamps: the circle's centre and radius, the square's centre and half side (units). */
export const LAMPS = Object.freeze({ circle: { u: -10, r: 6.5 }, square: { u: 10, h: 6 } });
/** Right half-width at size 1, the outline included (the slot is placed from it). */
export const EXTENT = PLAQUE.hw + 1;

function plaqueSD(u, v) {
  const { hw, hh, r } = PLAQUE;
  const qx = Math.abs(u) - (hw - r), qy = Math.abs(v) - (hh - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}
/** Signed distance to a lamp's shape (units): the circle's disc, the square's box. */
function lampSD(which, u, v) {
  if (which === 'a') return Math.hypot(u - LAMPS.circle.u, v) - LAMPS.circle.r;
  const h = LAMPS.square.h;
  const qx = Math.abs(u - LAMPS.square.u) - h, qy = Math.abs(v) - h;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
}

/** The settled emblem: both lamps lit. */
export const LAMPS_STILL = Object.freeze({ a: 1, b: 1 });

/**
 * Paint the plaque and its lamps centred on (x, y) at size k into T. Every pixel is tested at its centre against the
 * true shapes; the rims are one pixel at every size. A lamp unlit: an ink face with a fog outline (the shape reads
 * either way); lit: gold, its highlight cream up and to the left, its lower edge orange; flashing: the cream heart
 * grown (the beat it lights on).
 */
export function paintLamps(T, x, y, k, st = LAMPS_STILL) {
  const d = T.d, tw = T.w, th = T.h, ox = T.ox | 0, oy = T.oy | 0;
  // centred on a pixel (odd counts both ways): in the lock-up the plate's box is 27 rows (its top line, 25 of purple,
  // its bar) and the plaque stands in it with two rows above and two below, never half a pixel high; and the circle is
  // as wide as it is tall (an even width over an odd height left a one-pixel nub at each side of its middle row)
  x += 0.5;
  y += 0.5;
  const px1 = 1 / k;
  const x0 = Math.floor(x - (PLAQUE.hw + 2) * k) - 1, x1 = Math.ceil(x + (PLAQUE.hw + 2) * k) + 1;
  const y0 = Math.floor(y - (PLAQUE.hh + 2) * k) - 1, y1 = Math.ceil(y + (PLAQUE.hh + 2) * k) + 1;
  for (let py = y0; py <= y1; py++) {
    const v = (py + 0.5 - y) / k;
    const ty = py - oy;
    if (ty < 0 || ty >= th) continue;
    for (let px = x0; px <= x1; px++) {
      const tx = px - ox;
      if (tx < 0 || tx >= tw) continue;
      const u = (px + 0.5 - x) / k;
      const sd = plaqueSD(u, v);
      if (sd > px1) continue;
      let c;
      if (sd > 0) c = C.black; // the outline
      else if (sd > -px1) c = C.fog; // the rim
      else c = C.purple;
      for (const w of ['a', 'b']) {
        const ld = lampSD(w, u, v);
        if (ld > px1) continue;
        if (ld > 0) {
          c = C.black; // the housing
          break;
        }
        const s = st[w] | 0;
        const edge = ld > -px1;
        if (!s) {
          c = edge ? C.fog : C.ink;
          break;
        }
        // lit: the lower edge's shade, the highlight up-left (larger on the flash), gold elsewhere
        const cu = w === 'a' ? LAMPS.circle.u : LAMPS.square.u;
        const rr = w === 'a' ? LAMPS.circle.r : LAMPS.square.h;
        // the highlight: a small block up and to the left (a disc that small prints as a plus sign), grown on the flash
        const hu = u - cu + rr * 0.34, hv = v + rr * 0.34, hs = rr * (s === 2 ? 0.42 : 0.24);
        const hot = Math.abs(hu) < hs && Math.abs(hv) < hs;
        c = edge && v > 0 ? C.orange : hot ? C.cream : C.yellow;
        break;
      }
      d[ty * tw + tx] = c;
    }
  }
}

// the emblem's own build (the plain open and the lock-up): the plaque grows round the bit, the circle lights, then the
// square, a flash on each
const GROW_AT = 0.3;
const GROW = 0.28;
const LIGHT_A = 0.82;
const LIGHT_B = 1.08;
export const BUILD_DONE = 1.3;

/** The lamps' state at the open's instant dt (the plain open's build); settled from BUILD_DONE. */
export function lampsAt(dt) {
  if (dt >= BUILD_DONE) return LAMPS_STILL;
  const st = (at) => (dt < at ? 0 : dt < at + 0.12 ? 2 : 1);
  return { a: st(LIGHT_A), b: st(LIGHT_B) };
}

function emblem(ctx, dt, x, y, k = 1) {
  const g = easeOutQuint(seg(dt, GROW_AT, GROW));
  if (g <= 0) return;
  const kk = k * (0.35 + 0.65 * g);
  const st = lampsAt(dt);
  // a sprite buffer round the plaque, painted again only when it changes (settled, only its place and size do)
  const w = Math.ceil((PLAQUE.hw + 3) * 2 * kk) + 4, h = Math.ceil((PLAQUE.hh + 3) * 2 * kk) + 4;
  const fb = frameBuffer('quiz-emblem', w, h);
  const ox = Math.floor(x - w / 2), oy = Math.floor(y - h / 2);
  const key = `${x}|${y}|${kk}|${st.a}|${st.b}`;
  if (fb.key !== key) {
    fb.d.fill(0);
    paintLamps({ d: fb.d, w, h, ox, oy }, x, y, kk, st);
    fb.cx.putImageData(fb.img, 0, 0);
    fb.key = key;
  }
  ctx.drawImage(fb.cv, ox, oy);
}

// the open's field: the quiz studio's dark (black to ink, no coloured glow: never COSMOS's purple)
const background = lazyBackdrop({ key: 'quiz', colors: [P.black, P.ink], cx: CENTRE.x, cy: CENTRE.y, reach: 220 });

const STYLE = { accent: P.purple, plate: P.purple, plateHi: P.fog, plateRim: P.fog, ink: 'light', bar: P.fog, barH: 1 };

// (the plate's fog rim: its top line, plateHi; its sides, plateRim, drawn by the package with the plate, so the still
// lock-up of the UP NEXT promo has it too; the bar under it, fog)

export const QUIZ_OPEN = {
  accent: P.purple,
  style: STYLE,
  background,
  emblem,
  extent: EXTENT,
  absorb: 0.36,
  shoulder: 16, // the bit pops off the plaque's top-right corner
  popAt: 2.35,
  warmJobs: () => [background],
};

export function drawPayAttention(ctx, dt, info) {
  playOpen(ctx, dt, info, QUIZ_OPEN);
}

