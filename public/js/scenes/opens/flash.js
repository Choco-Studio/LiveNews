// NEWS IN 60 open: one minute on a stopwatch dial. The bezel draws round, a
// red hand sweeps the sixty ticks yellow in one smooth turn and lands on
// twelve, then "60" lights up segment by segment. Accent: yellow, with black
// text on the yellow title plate.
import { P } from '../../palette.js';
import { seg, easeInOut, ringPts } from '../../gfx/index.js';
import { backdrop, playOpen, CENTRE } from './kit.js';

const R = 32;
const TAU = Math.PI * 2;

// bezel pixels sorted clockwise from twelve, so it can draw round
const BEZEL = (() => {
  const pts = ringPts(R + 2);
  const list = [];
  for (let i = 0; i < pts.length; i += 2) list.push([pts[i], pts[i + 1], (Math.atan2(pts[i], -pts[i + 1]) / TAU + 1) % 1]);
  list.sort((a, b) => a[2] - b[2]);
  return list;
})();

// tick pixels: 60 ticks, every fifth one longer
const TICKS = (() => {
  const out = [];
  for (let k = 0; k < 60; k++) {
    const a = (k / 60) * TAU;
    const len = k % 5 === 0 ? 4 : 2;
    const px = [];
    for (let q = 0; q < len; q++) {
      const rr = R - 2 - q;
      px.push(Math.round(Math.sin(a) * rr), Math.round(-Math.cos(a) * rr));
    }
    out.push(px);
  }
  return out;
})();

// seven-segment "60": segments a..g as rects relative to the digit's top-left
const DW = 10;
const DH = 17;
const SEGS = {
  a: [1, 0, DW - 2, 2], b: [DW - 2, 1, 2, 7], c: [DW - 2, 9, 2, 7], d: [1, DH - 2, DW - 2, 2],
  e: [0, 9, 2, 7], f: [0, 1, 2, 7], g: [1, 8, DW - 2, 1],
};
const DIGITS = { 6: 'afgedc', 0: 'abcdef' };

function digit(ctx, ch, x, y, lit) {
  const order = DIGITS[ch];
  for (let i = 0; i < order.length; i++) {
    const [sx, sy, w, h] = SEGS[order[i]];
    ctx.fillStyle = i < lit ? P.yellow : P.ink;
    ctx.fillRect(x + sx, y + sy, w, h);
  }
}

function emblem(ctx, dt, x, y) {
  // bezel draws clockwise from twelve
  const bp = easeInOut(seg(dt, 0.12, 0.4));
  if (bp > 0) {
    ctx.fillStyle = P.steel;
    for (const [bx, by, a] of BEZEL) if (a <= bp) ctx.fillRect(x + bx, y + by, 1, 1);
    // crown on top
    if (bp >= 1) {
      ctx.fillRect(x - 3, y - R - 6, 7, 2);
      ctx.fillRect(x - 1, y - R - 4, 3, 2);
    }
  }
  // the minute sweep
  const sp = easeInOut(seg(dt, 0.4, 1.0));
  const ticksOn = dt > 0.28;
  if (ticksOn) {
    const lit = Math.floor(60 * sp + 1e-6);
    for (let k = 0; k < 60; k++) {
      const appear = seg(dt, 0.28 + (k / 60) * 0.2, 0.01);
      if (appear <= 0) continue;
      ctx.fillStyle = k < lit || sp >= 1 ? P.yellow : P.slate;
      const px = TICKS[k];
      for (let q = 0; q < px.length; q += 2) ctx.fillRect(x + px[q], y + px[q + 1], 1, 1);
    }
  }
  // digits light segment by segment once the minute is complete
  const dp = seg(dt, 1.3, 0.3);
  if (dp > 0) {
    const n = Math.ceil(6 * dp);
    digit(ctx, '6', x - DW - 2, y - 6, n);
    digit(ctx, '0', x + 2, y - 6, n);
  }
  // hand on top
  if (dt > 0.3) {
    const a = sp * TAU;
    const dx = Math.sin(a);
    const dy = -Math.cos(a);
    ctx.fillStyle = P.red;
    for (let s = -4; s <= R - 7; s++) ctx.fillRect(Math.round(x + dx * s), Math.round(y + dy * s), 1, 1);
    ctx.fillStyle = P.white;
    ctx.fillRect(x - 1, y - 1, 3, 3);
    ctx.fillStyle = P.red;
    ctx.fillRect(x, y, 1, 1);
  }
}

const background = () => backdrop({ key: 'flash', colors: [P.black, P.ink], cx: CENTRE.x, cy: CENTRE.y, reach: 230 });

export const FLASH = {
  accent: P.yellow,
  style: { accent: P.yellow, plate: P.yellow, plateHi: P.cream, ink: 'dark', bar: P.orange },
  background,
  emblem,
  absorb: 0.3,
  shoulder: 30,
};

export function drawNews60(ctx, dt, info) {
  playOpen(ctx, dt, info, FLASH);
}

