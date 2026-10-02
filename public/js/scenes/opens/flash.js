// NEWS IN 60 open: one minute on a stopwatch. A steel bezel draws round an ink
// face, a silver hand sweeps the dial in one smooth turn, lighting the twelve
// five-minute ticks yellow and the minute ticks steel (1.3 s,
// sine in/out: never more than ~8 degrees a frame) and comes to rest at twelve,
// then "60" lights segment by segment in the lower half of the dial, below the
// hub, so the hand never crosses it. Accent: yellow, with black text on the
// yellow title plate; red stays in the bug, LIVE and BREAKING (news-60.md).
import { P } from '../../palette.js';
import { seg, easeInOut, easeInOutSine, ringPts, memoFn, Pix, discSpans } from '../../gfx/index.js';
import { lazyBackdrop, playOpen, CENTRE, ZOOM } from './kit.js';

const R0 = 32; // tick-ring radius in the lock-up (x ZOOM at centre stage); the bezel sits at R + 2
const TAU = Math.PI * 2;
const SWEEP_T = 0.25;
const SWEEP_DUR = 1.3;

/**
 * Per radius: the ink face and bezel baked as a sprite (2 px steel bezel with a silver
 * highlight on the key-light side and a slate inner edge), the bezel pixels sorted
 * clockwise from twelve as flat typed arrays (so it can draw round without allocating),
 * and the 60 ticks as an 8-fold symmetric pixel set (1 px, 2 px at the fives).
 */
const dial = memoFn(64, (R) => {
  const B = R + 2;
  const S = 2 * B + 1;
  // bezel (radius B) and its inner wall (B - 1), ordered clockwise from twelve so they draw round
  const ring = [];
  const outer = ringPts(B);
  for (let i = 0; i < outer.length; i += 2) {
    const x = outer[i];
    const y = outer[i + 1];
    const lit = -x * 0.7 - y * 0.7; // dot with the key light direction (upper left)
    ring.push([x, y, lit > B * 0.55 ? 1 : lit < -B * 0.45 ? 2 : 0]); // silver / slate / steel
  }
  const inner = ringPts(B - 1);
  // the inner wall catches light on the far (lower right) side and is in shadow under the lit rim
  for (let i = 0; i < inner.length; i += 2) ring.push([inner[i], inner[i + 1], inner[i] + inner[i + 1] > 0 ? 3 : 4]);
  for (const r of ring) r.push((Math.atan2(r[0], -r[1]) / TAU + 1) % 1);
  ring.sort((a, b) => a[3] - b[3]);
  const n = ring.length;
  const bx = new Int16Array(n);
  const by = new Int16Array(n);
  const ba = new Float32Array(n);
  const bc = new Uint8Array(n); // 0 steel, 1 silver, 2 slate (bezel); 3 slate, 4 black (inner wall)
  for (let i = 0; i < n; i++) {
    bx[i] = ring[i][0];
    by[i] = ring[i][1];
    bc[i] = ring[i][2];
    ba[i] = ring[i][3];
  }
  // face: a flat ink disc inside the inner wall; each pixel's angle lets it open with the bezel
  const face = new Pix(S, S);
  const faceAng = new Float32Array(S * S).fill(2);
  const sp = discSpans(B - 2);
  for (let i = 0; i < sp.length; i++) {
    face.rect(B - sp[i], 2 + i, sp[i] * 2 + 1, 1, P.ink);
    for (let x = B - sp[i]; x <= B + sp[i]; x++) faceAng[(2 + i) * S + x] = (Math.atan2(x - B, B - 2 - i) / TAU + 1) % 1;
  }
  // ticks: compute the first octant (ticks 0..7 = 0..42 degrees) and mirror it 8 ways
  const tx = [];
  const ty = [];
  const tk = [];
  const add = (k, x, y) => {
    tx.push(x);
    ty.push(y);
    tk.push(k);
  };
  for (let k = 0; k <= 7; k++) {
    const a = (k / 60) * TAU;
    const len = k % 5 === 0 ? 2 : 1;
    for (let q = 0; q < len; q++) {
      const rr = R - 2 - q;
      const x = Math.round(Math.sin(a) * rr);
      const y = -Math.round(Math.cos(a) * rr);
      // octant images: tick index for each reflection of angle a (degrees from twelve, clockwise)
      const imgs = [
        [k, x, y], [15 - k, -y, -x], [15 + k, -y, x], [30 - k, x, -y],
        [30 + k, -x, -y], [45 - k, y, x], [45 + k, y, -x], [60 - k, -x, y],
      ];
      for (const [kk, xx, yy] of imgs) add(((kk % 60) + 60) % 60, xx, yy);
    }
  }
  // dedupe (ticks on the axes map onto themselves)
  const seen = new Set();
  const fx = [];
  const fy = [];
  const fk = [];
  for (let i = 0; i < tx.length; i++) {
    const key = (tx[i] + 512) * 1024 + ty[i] + 512;
    if (seen.has(key)) continue;
    seen.add(key);
    fx.push(tx[i]);
    fy.push(ty[i]);
    fk.push(tk[i]);
  }
  return {
    B, S, face: face.canvas(), faceAng, bx, by, ba, bc, n,
    tx: Int16Array.from(fx), ty: Int16Array.from(fy), tk: Uint8Array.from(fk),
  };
});

const RING_COLOURS = [P.steel, P.silver, P.slate, P.slate, P.black];

// seven-segment digits: segments a..g as rects relative to the digit's top-left
const segsQ = memoFn(64, (q) => {
  const k = q / 20;
  const dw = Math.round(9 * k);
  const dh = Math.round(14 * k);
  const t = Math.max(2, Math.round(2 * k));
  const mid = (dh >> 1) - (t >> 1);
  const hv = mid - 1;
  return {
    dw, dh,
    a: [1, 0, dw - 2, t], b: [dw - t, 1, t, hv], c: [dw - t, mid + t, t, dh - mid - t - 1], d: [1, dh - t, dw - 2, t],
    e: [0, mid + t, t, dh - mid - t - 1], f: [0, 1, t, hv], g: [1, mid, dw - 2, Math.max(1, t - 1)],
  };
});
const segs = (k) => segsQ(Math.round(k * 20));
const DIGITS = { 6: 'afgedc', 0: 'abcdef' };

function digit(ctx, ch, x, y, color, S) {
  const order = DIGITS[ch];
  ctx.fillStyle = color;
  for (let i = 0; i < order.length; i++) {
    const r = S[order[i]];
    ctx.fillRect(x + r[0], y + r[1], r[2], r[3]);
  }
}

/** Hand angle (0..1 of a turn) at dt: one sine in/out turn, resting at twelve. */
const sweep = (dt) => easeInOutSine(seg(dt, SWEEP_T, SWEEP_DUR));

function hand(ctx, x, y, a, len, tail) {
  // a clean 1 px line from the tail to the tip (Bresenham from rounded end points)
  const dx = Math.sin(a * TAU);
  const dy = -Math.cos(a * TAU);
  let x0 = Math.round(x - dx * tail);
  let y0 = Math.round(y - dy * tail);
  const x1 = Math.round(x + dx * len);
  const y1 = Math.round(y + dy * len);
  const ax = Math.abs(x1 - x0);
  const ay = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = ax + ay;
  ctx.fillStyle = P.silver;
  for (let i = 0; i < 256; i++) {
    ctx.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= ay) {
      err += ay;
      x0 += sx;
    }
    if (e2 <= ax) {
      err += ax;
      y0 += sy;
    }
  }
}

function emblem(ctx, dt, x, y, k = 1) {
  const R = Math.round(R0 * k);
  const D = dial(R);
  const B = D.B;
  // the bezel draws round clockwise from twelve
  const bp = easeInOut(seg(dt, 0.1, 0.4));
  if (bp <= 0) return;
  if (bp >= 1) ctx.drawImage(D.face, x - B, y - B);
  else {
    // the face opens behind the bezel as it draws round: a clip of whole-pixel runs per row
    ctx.save();
    try {
      ctx.beginPath();
      const S = D.S;
      for (let row = 0; row < S; row++) {
        let run = -1;
        for (let col = 0; col <= S; col++) {
          const on = col < S && D.faceAng[row * S + col] <= bp;
          if (on && run < 0) run = col;
          else if (!on && run >= 0) {
            ctx.rect(x - B + run, y - B + row, col - run, 1);
            run = -1;
          }
        }
      }
      ctx.clip();
      ctx.drawImage(D.face, x - B, y - B);
    } finally {
      ctx.restore();
    }
  }
  for (let i = 0; i < D.n; i++) {
    if (D.ba[i] > bp) break; // sorted clockwise: the rest is not drawn yet
    ctx.fillStyle = RING_COLOURS[D.bc[i]];
    ctx.fillRect(x + D.bx[i], y + D.by[i], 1, 1);
  }
  if (bp >= 1) {
    // crown: a stem and a button, steel lit from the left
    const cw = Math.max(2, Math.round(3 * k));
    const ch = Math.max(2, Math.round(2 * k));
    const top = y - B - 1 - 2 * ch;
    ctx.fillStyle = P.steel;
    ctx.fillRect(x - 1, top + ch, 3, ch);
    ctx.fillRect(x - cw, top, cw * 2 + 1, ch);
    ctx.fillStyle = P.silver;
    ctx.fillRect(x - cw, top, cw, 1);
    ctx.fillStyle = P.slate;
    ctx.fillRect(x - cw, top + ch - 1, cw * 2 + 1, 1);
  }
  // ticks come on just behind the closing bezel, then light up as the hand passes
  if (dt > 0.42) {
    const sp = sweep(dt);
    const lit = sp >= 1 ? 60 : Math.floor(60 * sp + 1e-6);
    for (let i = 0; i < D.tx.length; i++) {
      const tk = D.tk[i];
      // only the twelve five-minute ticks light yellow; the minute ticks step slate -> steel
      const on = tk < lit || (tk === 0 && sp >= 1);
      ctx.fillStyle = tk % 5 === 0 ? (on ? P.yellow : P.steel) : on ? P.steel : P.slate;
      ctx.fillRect(x + D.tx[i], y + D.ty[i], 1, 1);
    }
  }
  // "60" lights in the lower half once the minute is complete: a three-step palette fade
  // (slate, orange, yellow, a frame or two each), like an LCD coming on; never half drawn
  const dp = dt - (SWEEP_T + SWEEP_DUR - 0.06);
  if (dp > 0) {
    const S = segs(k);
    const gap = Math.max(2, Math.round(2 * k));
    const dy = y + Math.round(5 * k);
    const col = dp < 0.06 ? P.slate : dp < 0.12 ? P.orange : P.yellow;
    digit(ctx, '6', x - S.dw - (gap >> 1) - 1, dy, col, S);
    digit(ctx, '0', x + (gap >> 1) + 1, dy, col, S);
  }
  // hand on top: silver with a white hub; its short tail stays above the digits
  if (dt > 0.42) {
    hand(ctx, x, y, sweep(dt), R - Math.round(5 * k), 2);
    ctx.fillStyle = P.white;
    ctx.fillRect(x - 1, y - 1, 3, 3);
    ctx.fillStyle = P.steel;
    ctx.fillRect(x, y, 1, 1);
  }
}

const background = lazyBackdrop({ key: 'flash', colors: [P.black, P.ink], cx: CENTRE.x, cy: CENTRE.y, reach: 230 });

export const FLASH = {
  accent: P.yellow,
  style: { accent: P.yellow, plate: P.yellow, plateHi: P.cream, ink: 'dark', bar: P.orange },
  background,
  emblem,
  extent: R0 + 2,
  absorb: 0.3,
  shoulder: 30,
  warmJobs: () => {
    const jobs = [];
    for (let r = R0; r <= Math.round(R0 * ZOOM); r += 2) jobs.push(() => dial(r), () => dial(r + 1));
    return jobs;
  },
};

export function drawNews60(ctx, dt, info) {
  playOpen(ctx, dt, info, FLASH);
}
