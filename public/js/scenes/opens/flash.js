// NEWS IN 60 open: one minute on a stopwatch dial. The bezel draws round, a
// red hand sweeps the sixty ticks yellow in one smooth turn and lands on
// twelve, then "60" lights up segment by segment. Accent: yellow, with black
// text on the yellow title plate.
import { P } from '../../palette.js';
import { seg, easeInOut, ringPts, memo } from '../../gfx/index.js';
import { backdrop, playOpen, CENTRE } from './kit.js';

const R0 = 32; // dial radius in the lock-up (x ZOOM at centre stage)
const TAU = Math.PI * 2;
const cached = memo(48);

/** Bezel pixels sorted clockwise from twelve (so it can draw round) and tick pixels, per radius. */
function dial(R) {
  return cached(`dial|${R}`, () => {
    const pts = ringPts(R + 2);
    const bezel = [];
    for (let i = 0; i < pts.length; i += 2) bezel.push([pts[i], pts[i + 1], (Math.atan2(pts[i], -pts[i + 1]) / TAU + 1) % 1]);
    bezel.sort((a, b) => a[2] - b[2]);
    const k = R / R0;
    const ticks = [];
    for (let t = 0; t < 60; t++) {
      const a = (t / 60) * TAU;
      const len = Math.round((t % 5 === 0 ? 4 : 2) * k);
      const px = [];
      for (let q = 0; q < len; q++) {
        const rr = R - 2 - q;
        px.push(Math.round(Math.sin(a) * rr), Math.round(-Math.cos(a) * rr));
      }
      ticks.push(px);
    }
    return { bezel, ticks };
  });
}

// seven-segment digits: segments a..g as rects relative to the digit's top-left
function segs(k) {
  return cached(`segs|${Math.round(k * 20)}`, () => {
    const dw = Math.round(10 * k);
    const dh = Math.round(17 * k);
    const t = Math.max(2, Math.round(2 * k));
    const mid = (dh >> 1) - (t >> 1);
    const hv = mid - 1;
    return {
      dw, dh,
      a: [1, 0, dw - 2, t], b: [dw - t, 1, t, hv], c: [dw - t, mid + t, t, dh - mid - t - 1], d: [1, dh - t, dw - 2, t],
      e: [0, mid + t, t, dh - mid - t - 1], f: [0, 1, t, hv], g: [1, mid, dw - 2, Math.max(1, t - 1)],
    };
  });
}
const DIGITS = { 6: 'afgedc', 0: 'abcdef' };

function digit(ctx, ch, x, y, lit, S) {
  const order = DIGITS[ch];
  for (let i = 0; i < order.length; i++) {
    const [sx, sy, w, h] = S[order[i]];
    ctx.fillStyle = i < lit ? P.yellow : P.ink;
    ctx.fillRect(x + sx, y + sy, w, h);
  }
}

function emblem(ctx, dt, x, y, k = 1) {
  const R = Math.round(R0 * k);
  const { bezel: BEZEL, ticks: TICKS } = dial(R);
  // bezel draws clockwise from twelve
  const bp = easeInOut(seg(dt, 0.12, 0.4));
  if (bp > 0) {
    ctx.fillStyle = P.steel;
    for (const [bx, by, a] of BEZEL) if (a <= bp) ctx.fillRect(x + bx, y + by, 1, 1);
    // crown on top
    if (bp >= 1) {
      const cw = Math.round(3 * k);
      ctx.fillRect(x - cw, y - R - Math.round(6 * k), cw * 2 + 1, Math.round(2 * k));
      ctx.fillRect(x - 1, y - R - Math.round(4 * k), 3, Math.round(2 * k));
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
    const S = segs(k);
    const gap = Math.round(2 * k);
    const dy = y - Math.round(S.dh * 0.35);
    digit(ctx, '6', x - S.dw - gap, dy, n, S);
    digit(ctx, '0', x + gap, dy, n, S);
  }
  // hand on top
  if (dt > 0.3) {
    const a = sp * TAU;
    const dx = Math.sin(a);
    const dy = -Math.cos(a);
    ctx.fillStyle = P.red;
    for (let s = -Math.round(4 * k); s <= R - Math.round(7 * k); s++) ctx.fillRect(Math.round(x + dx * s), Math.round(y + dy * s), 1, 1);
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

