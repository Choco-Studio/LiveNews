// FULL TIME open: the stopwatch at 90:00 (full-time.md §6). A referee's digital stopwatch, not NEWS IN 60's dial: a
// wide pebble of a body (a dark face inside a bezel lit from the upper left, as every emblem), two pushers on its top
// edge (the reset in steel, the start in the accent orange) and a wide LCD window whose seven-segment digits read 90:00
// in orange over their unlit ghosts. The same package and clock as every open: the body grows round the bit at centre
// stage, the clock runs up from 89:57 to 90:00 with the start pusher going down, and the watch glides to its slot,
// the plate wiping out of it. Accent: orange (P.orange), the programme's.
//
// The watch is painted pixel by pixel from its true shapes at any centre and size (paintWatch), so FULL TIME's title
// sequence (fulltimetitles.js) hangs the same watch on the stadium's board, as its clock, and lifts it out to centre
// stage without a pop. Rectangles (the window, the segments, the pushers) are snapped to whole pixels from the watch's
// centre, every digit from its own snapped origin, so the four digits are always the same shape; the body's rounded
// outline is tested at pixel centres. At size 1 (the lock-up) every edge falls on a pixel.
//
//   paintWatch(T, x, y, k, st)   T = { d: Uint32Array, w, h, ox, oy } (a frame or a sprite buffer)
//   st = { digits: '9000', colon: true, lit: 1 (0: the window dark), press: 0..1 (the start pusher down) }
import { P } from '../../palette.js';
import { u32, seg, easeOutQuint } from '../../gfx/index.js';
import { lazyBackdrop, playOpen, CENTRE, frameBuffer } from './kit.js';

const C = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, u32(v)]));

/** The watch in units (k = 1 in the lock-up): the body's half width, top and foot, its corner radius. */
export const BODY = Object.freeze({ hw: 23, top: -15, bot: 15, r: 8 });
/** The LCD window (its slate frame included), exclusive ends. */
export const LCD = Object.freeze({ x0: -20, x1: 20, y0: -10, y1: 6 });
/** The pushers on the top edge: [x0, x1) each, 3 units tall above the body. */
export const PUSHERS = Object.freeze([[-15, -8], [8, 15]]);
const PUSH_H = 3;
/** The digits: four 7 x 12 cells and a colon, x origins (units); the cells' top row. */
const CELLS = [-18, -9, 2, 11];
const COLON_X = -1;
const DIGIT_Y = -8;
// seven segments in a 7 x 12 cell: [x0, x1, y0, y1), two units thick, the corners left open
const SEG = {
  a: [1, 6, 0, 2], b: [5, 7, 1, 6], c: [5, 7, 6, 11], d: [1, 6, 10, 12], e: [0, 2, 6, 11], f: [0, 2, 1, 6], g: [1, 6, 5, 7],
};
const DIGIT = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];
const SEGS = Object.keys(SEG);

/** Right half-width at size 1, the outline included (the slot is placed from it). */
export const EXTENT = BODY.hw + 1;

/** Signed distance (units) from (u, v) to the body's rounded rectangle: < 0 inside. Also returns its normal. */
const N = { x: 0, y: 0 };
function bodySD(u, v) {
  const { hw, top, bot, r } = BODY;
  const cy = (top + bot) / 2;
  const hh = (bot - top) / 2;
  const qx = Math.abs(u) - (hw - r);
  const qy = Math.abs(v - cy) - (hh - r);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  const out = Math.hypot(ox, oy);
  const sd = out + Math.min(Math.max(qx, qy), 0) - r;
  // the outward normal: along the corner's radius, else the nearest side's
  if (ox > 0 || oy > 0) {
    N.x = (ox / (out || 1)) * Math.sign(u);
    N.y = (oy / (out || 1)) * Math.sign(v - cy);
  } else if (qx > qy) {
    N.x = Math.sign(u);
    N.y = 0;
  } else {
    N.x = 0;
    N.y = Math.sign(v - cy);
  }
  return sd;
}

/** A snapped rectangle in screen pixels from unit edges about an origin (ox, oy) at size k. */
const snap = (o, u, k) => o + Math.round(u * k);

/**
 * Paint the watch centred on (x, y) at size k into T. st.digits: four characters '0'-'9' (others blank); st.lit: 1 (the
 * digits lit), 0 (the window dark: only the ghosts), between: lit while 0.5 or more; st.press: the start pusher's travel.
 */
export function paintWatch(T, x, y, k, st = WATCH_STILL) {
  const d = T.d, tw = T.w, th = T.h, ox = T.ox | 0, oy = T.oy | 0;
  const X = Math.round(x), Y = Math.round(y);
  const fx = x - X, fy = y - Y; // the sub-pixel remainder: the body's curve follows it, the snapped parts round with it
  const put = (px, py, c) => {
    const tx = px - ox, ty = py - oy;
    if (tx >= 0 && tx < tw && ty >= 0 && ty < th) d[ty * tw + tx] = c;
  };
  const px1 = 1 / k;
  const x0 = Math.floor(x - (BODY.hw + 2) * k) - 1, x1 = Math.ceil(x + (BODY.hw + 2) * k) + 1;
  const y0 = Math.floor(y + (BODY.top - PUSH_H - 2) * k) - 1, y1 = Math.ceil(y + (BODY.bot + 2) * k) + 1;
  // the body: a 1 px black outline, the bezel (two units, lit from the upper left), the face
  const bez = Math.max(px1 * 1.01, 2);
  for (let py = y0; py <= y1; py++) {
    const v = (py + 0.5 - y) / k;
    for (let px = x0; px <= x1; px++) {
      const u = (px + 0.5 - x) / k;
      const sd = bodySD(u, v);
      if (sd > px1) continue;
      if (sd > 0) {
        put(px, py, C.black);
        continue;
      }
      if (sd > -bez) {
        const lit = -(N.x + N.y) * Math.SQRT1_2;
        put(px, py, lit > 0.62 ? (sd > -px1 && lit > 0.93 && k >= 0.9 ? C.white : C.silver) : lit > -0.25 ? C.steel : C.slate);
        continue;
      }
      put(px, py, C.ink);
    }
  }
  // the pushers on the top edge: a black outline, steel (reset) and orange (start, it goes down when pressed)
  const press = Math.round((st.press || 0) * Math.max(1, Math.round(k)));
  PUSHERS.forEach(([a, b], i) => {
    const xa = snap(X, a + fx, k), xb = snap(X, b + fx, k);
    const yb = snap(Y, BODY.top + fy, k); // the body's top edge
    const ya = snap(Y, BODY.top - PUSH_H + fy, k) + (i === 1 ? press : 0);
    const face = i === 1 ? C.orange : C.steel;
    const hi = i === 1 ? C.yellow : C.silver;
    const lo = i === 1 ? C.rust : C.slate;
    for (let py = ya - 1; py < yb; py++) {
      for (let px = xa - 1; px <= xb; px++) {
        const edge = py === ya - 1 || px === xa - 1 || px === xb;
        if (edge) {
          // (the outline stops where the body begins)
          if (py >= ya - 1) put(px, py, C.black);
          continue;
        }
        put(px, py, py === ya ? hi : px === xb - 1 ? lo : face);
      }
    }
  });
  // the window: a slate frame, black inside
  const lx0 = snap(X, LCD.x0 + fx, k), lx1 = snap(X, LCD.x1 + fx, k);
  const ly0 = snap(Y, LCD.y0 + fy, k), ly1 = snap(Y, LCD.y1 + fy, k);
  const fr = Math.max(1, Math.round(k));
  for (let py = ly0; py < ly1; py++) {
    for (let px = lx0; px < lx1; px++) {
      const frame = px < lx0 + fr || px >= lx1 - fr || py < ly0 + fr || py >= ly1 - fr;
      put(px, py, frame ? C.slate : C.black);
    }
  }
  // the digits: every cell from its own snapped origin with the same snapped offsets (four identical shapes)
  const lit = (st.lit ?? 1) >= 0.5;
  const digits = String(st.digits ?? '9000');
  const sx = (u) => Math.round(u * k);
  const t2 = sx(2); // the segments' thickness
  for (let i = 0; i < 4; i++) {
    const cx = snap(X, CELLS[i] + fx, k);
    const cy = snap(Y, DIGIT_Y + fy, k);
    const on = lit ? DIGIT[digits.charCodeAt(i) - 48] || '' : '';
    for (const s of SEGS) {
      const [a, b, c, e] = SEG[s];
      // thickness kept the same everywhere: the far edge is the near edge plus the snapped thickness when the
      // segment is two units across
      const xa = cx + sx(a), xb = b - a === 2 ? xa + t2 : cx + sx(b);
      const ya = cy + sx(c), yb = e - c === 2 ? ya + t2 : cy + sx(e);
      const col = on.includes(s) ? C.orange : C.maroon;
      for (let py = ya; py < yb; py++) for (let px = xa; px < xb; px++) put(px, py, col);
    }
  }
  // the colon, lit with the digits
  const ccx = snap(X, COLON_X + fx, k);
  for (const cyu of [DIGIT_Y + 2, DIGIT_Y + 8]) {
    const ya = snap(Y, cyu + fy, k);
    for (let py = ya; py < ya + t2; py++) for (let px = ccx; px < ccx + t2; px++) put(px, py, lit && st.colon !== false ? C.orange : C.maroon);
  }
}

/** The settled watch: 90:00, lit. */
export const WATCH_STILL = Object.freeze({ digits: '9000', colon: true, lit: 1, press: 0 });

// the emblem's own build (the plain 4 s open and the lock-up): the body grows round the bit, the window comes on at
// 89:57, a second each 0.2 s to 90:00 with the start pusher going down on it
const GROW_AT = 0.3;
const GROW = 0.28;
const RUN_AT = 0.62;
const RUN = [[0.62, '8957'], [0.82, '8958'], [1.02, '8959'], [1.22, '9000']];
export const BUILD_DONE = 1.42;

/** The watch's state at the open's instant dt (the plain open's build); settled from BUILD_DONE. */
export function watchAt(dt) {
  if (dt >= BUILD_DONE) return WATCH_STILL;
  let digits = '8957';
  for (const [t, d] of RUN) if (dt >= t) digits = d;
  const press = dt >= 1.18 && dt < 1.36 ? 1 : 0;
  return { digits, colon: true, lit: dt >= RUN_AT ? 1 : 0, press };
}

function emblem(ctx, dt, x, y, k = 1) {
  const g = easeOutQuint(seg(dt, GROW_AT, GROW));
  if (g <= 0) return;
  const kk = k * (0.35 + 0.65 * g);
  const st = watchAt(dt);
  // a sprite buffer round the watch, painted again only when it changes (settled, only its place and size do)
  const w = Math.ceil((BODY.hw + 3) * 2 * kk) + 4, h = Math.ceil((BODY.bot - BODY.top + PUSH_H + 6) * kk) + 4;
  const fb = frameBuffer('sport-emblem', w, h);
  const ox = Math.floor(x - w / 2), oy = Math.floor(y + (BODY.top - PUSH_H - 3) * kk) - 1;
  const key = `${x}|${y}|${kk}|${st.digits}|${st.lit}|${st.press}`;
  if (fb.key !== key) {
    fb.d.fill(0);
    paintWatch({ d: fb.d, w, h, ox, oy }, x, y, kk, st);
    fb.cx.putImageData(fb.img, 0, 0);
    fb.key = key;
  }
  ctx.drawImage(fb.cv, ox, oy);
}

// the open's field: night over a pitch (black to the dark green of the grass where the watch stands)
const background = lazyBackdrop({ key: 'sport', colors: [P.black, P.darkGreen], cx: CENTRE.x, cy: CENTRE.y, reach: 230 });

export const SPORT_OPEN = {
  accent: P.orange,
  style: { accent: P.orange, plate: P.black, ink: 'light', bar: P.orange },
  background,
  emblem,
  extent: EXTENT,
  absorb: 0.36,
  shoulder: 17, // the bit pops off the start pusher
  popAt: 2.35,
  warmJobs: () => [background],
};

export function drawFullTime(ctx, dt, info) {
  playOpen(ctx, dt, info, SPORT_OPEN);
}

export const __test = { bodySD, DIGIT };
