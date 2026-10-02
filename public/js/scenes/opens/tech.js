// TECH BYTES open: signals race in along thin cyan circuit traces from the
// frame edges, a chip shutters open around the bit, its pins catch the signal
// and the die boots a single byte; then the traces retract into the pins and
// the chip pulls back to the lock-up. Accent: cyan (thin lines only).
import { P } from '../../palette.js';
import { u32, seg, easeOutQuint, easeInOut, linePts, Pix, memo } from '../../gfx/index.js';
import { lazyBackdrop, playOpen, CENTRE, ZOOM, W, H } from './kit.js';

const cached = memo(64);
const BYTE = [1, 0, 1, 1, 0, 1, 0, 1]; // 0xB5, drawn as 4 x 2 cells

/** Chip dimensions at size factor k (1 = lock-up), cached per 1/100 of k. */
const DIMS = new Map();
function dims(k) {
  const q = Math.round(k * 100);
  const hit = DIMS.get(q);
  if (hit) return hit;
  const half = Math.round(23 * k);
  const d = {
    half,
    body: half * 2,
    pin: Math.round(5 * k),
    pinW: Math.max(3, Math.round(3 * k)),
    offs: [-15, -5, 5, 15].map((o) => Math.round(o * k)),
    cell: Math.round(5 * k),
    cellH: Math.round(6 * k),
    gap: Math.max(2, Math.round(2 * k)),
  };
  DIMS.set(q, d);
  return d;
}

/** Polyline (screen edge first) to pixels, as a flat Int16Array. */
function polyPix(verts) {
  const out = [];
  for (let k = 1; k < verts.length; k++) {
    const [x0, y0] = verts[k - 1];
    const [x1, y1] = verts[k];
    linePts(x0, y0, x1, y1, (x, y, i) => {
      if (k > 1 && i === 0) return;
      out.push(x, y);
    });
  }
  return Int16Array.from(out);
}

/** Traces from every pin to the frame edge, for the chip at centre stage. */
const traces = () => cached('traces', () => {
  const D = dims(ZOOM);
  const cx = CENTRE.x;
  const cy = CENTRE.y;
  const list = [];
  const add = (verts, pin, k) => {
    const pts = polyPix(verts);
    list.push({ pts, n: pts.length / 2, pin, s: 0.14 + (1.5 - Math.abs(k - 1.5)) * 0.06 + (list.length % 4) * 0.02 });
  };
  D.offs.forEach((o, k) => {
    const sp = Math.sign(o) * (Math.abs(o) + 8) * 1.7;
    const tip = cy - D.half - D.pin - 1;
    add([[cx + o + sp, -1], [cx + o + sp, tip - 10 - Math.abs(sp)], [cx + o, tip - 10], [cx + o, tip]], { x: o, y: -D.half - D.pin, v: true }, k);
    const btip = cy + D.half + D.pin;
    add([[cx + o + sp, H], [cx + o + sp, btip + 10 + Math.abs(sp)], [cx + o, btip + 10], [cx + o, btip]], { x: o, y: D.half, v: true }, k);
    const ltip = cx - D.half - D.pin - 1;
    const lx = ltip - 22 - Math.abs(sp);
    add([[-1, cy + o + sp * 0.5], [lx, cy + o + sp * 0.5], [lx + Math.abs(sp * 0.5), cy + o], [ltip, cy + o]], { x: -D.half - D.pin, y: o, v: false }, k);
    const rtip = cx + D.half + D.pin;
    const rx = rtip + 22 + Math.abs(sp);
    add([[W, cy + o + sp * 0.5], [rx, cy + o + sp * 0.5], [rx - Math.abs(sp * 0.5), cy + o], [rtip, cy + o]], { x: D.half, y: o, v: false }, k);
  });
  return list;
});

/** Chip body and pins at size factor k (baked per integer size). */
function chipSprite(k) {
  const D = dims(k);
  return cached(D.body * 10000 + D.pin * 100 + D.pinW, () => {
    const S = D.body + D.pin * 2;
    const p = new Pix(S, S);
    const o = D.pin;
    const pw = D.pinW;
    for (const off of D.offs) {
      const c = D.half + off + o - (pw >> 1);
      for (const [x, y, w, h, hx, hy, hw, hh] of [
        [c, 0, pw, o, c, 0, 1, o],
        [c, S - o, pw, o, c, S - o, 1, o],
        [0, c, o, pw, 0, c, o, 1],
        [S - o, c, o, pw, S - o, c, o, 1],
      ]) {
        p.rect(x, y, w, h, P.steel);
        p.rect(hx, hy, hw, hh, P.silver);
      }
    }
    p.rect(o, o, D.body, D.body, P.black);
    p.rect(o, o, D.body, 1, P.fog);
    p.rect(o, o + 1, 1, D.body - 1, P.slate);
    p.rect(o + D.body - 1, o + 1, 1, D.body - 1, P.ink);
    p.rect(o, o + D.body - 1, D.body, 1, P.ink);
    const dot = Math.max(2, Math.round(2 * k));
    p.rect(o + 2 * dot, o + 2 * dot, dot, dot, P.slate);
    return { cv: p.canvas(), S };
  });
}

/** The die: a cyan outline that draws round clockwise, then the byte boots cell by cell. */
function drawDie(ctx, dt, x, y, D) {
  const cw = D.cell;
  const ch = D.cellH;
  const g = D.gap;
  const gridW = 4 * cw + 3 * g;
  const gridH = 2 * ch + g;
  const w = gridW + 2 * (g + 1) + 2;
  const h = gridH + 2 * (g + 1) + 2 + 2 * g;
  const x0 = x - (w >> 1);
  const y0 = y - (h >> 1);
  const p = easeInOut(seg(dt, 0.72, 0.4));
  let len = Math.round(2 * (w + h) * p);
  const take = (n) => {
    const v = Math.min(n, len);
    len -= v;
    return v;
  };
  ctx.fillStyle = P.cyan;
  let v = take(w);
  if (v) ctx.fillRect(x0, y0, v, 1);
  v = take(h);
  if (v) ctx.fillRect(x0 + w - 1, y0, 1, v);
  v = take(w);
  if (v) ctx.fillRect(x0 + w - v, y0 + h - 1, v, 1);
  v = take(h);
  if (v) ctx.fillRect(x0, y0 + h - v, 1, v);
  const gx = x - (gridW >> 1);
  const gy = y - (gridH >> 1);
  for (let i = 0; i < 8; i++) {
    if (dt < 0.95 + i * 0.05) continue;
    const cx = gx + (i % 4) * (cw + g);
    const cy = gy + (i >> 2) * (ch + g);
    ctx.fillStyle = BYTE[i] ? P.cyan : P.slate;
    ctx.fillRect(cx, cy, cw, ch);
    if (BYTE[i]) {
      ctx.fillStyle = P.blue;
      ctx.fillRect(cx, cy + ch - 1, cw, 1);
    }
  }
}

function emblem(ctx, dt, x, y, k = 1) {
  // traces: the signal head runs in from the edge, then the tail follows it into the pin
  if (dt < 1.62) {
    for (const tr of traces()) {
      const head = Math.floor(easeInOut(seg(dt, tr.s, 0.5)) * tr.n);
      const tail = Math.floor(easeInOut(seg(dt, 1.1 + tr.s * 0.3, 0.4)) * tr.n);
      if (head <= tail) continue;
      ctx.fillStyle = P.cyan;
      for (let i = tail; i < head; i++) ctx.fillRect(tr.pts[i * 2], tr.pts[i * 2 + 1], 1, 1);
      if (head < tr.n) {
        ctx.fillStyle = P.white;
        ctx.fillRect(tr.pts[(head - 1) * 2], tr.pts[(head - 1) * 2 + 1], 1, 1);
      }
    }
  }
  // the chip shutters open from its centre line
  const open = easeOutQuint(seg(dt, 0.4, 0.34));
  if (open <= 0) return;
  const D = dims(k);
  const C = chipSprite(k);
  const half = C.S >> 1;
  const hh = Math.max(2, Math.round(C.S * open));
  const top = y - half + ((C.S - hh) >> 1);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - half, top, C.S, hh);
  ctx.clip();
  ctx.drawImage(C.cv, x - half, y - half);
  drawDie(ctx, dt, x, y, D);
  ctx.restore();
  // pins catch the signal as each trace arrives (one short white flash each)
  if (dt < 1.3) {
    ctx.fillStyle = P.white;
    for (const tr of traces()) {
      const arrive = tr.s + 0.5;
      if (dt < arrive || dt > arrive + 0.1) continue;
      const pin = tr.pin;
      if (pin.v) ctx.fillRect(x + pin.x - (D.pinW >> 1), y + pin.y, D.pinW, D.pin);
      else ctx.fillRect(x + pin.x, y + pin.y - (D.pinW >> 1), D.pin, D.pinW);
    }
  }
}

// static two-tone grid: slate crosses every 24 px, only where the backdrop is lit
function gridTexture(d, level) {
  const c = u32(P.slate);
  for (let y = 2; y < H; y += 24) {
    for (let x = 0; x < W; x += 24) {
      if (level(x, y) < 0.55) continue;
      for (let k = -1; k <= 1; k++) {
        if (x + k >= 0 && x + k < W) d[y * W + x + k] = c;
        if (y + k >= 0 && y + k < H) d[(y + k) * W + x] = c;
      }
    }
  }
}

const background = lazyBackdrop({ key: 'tech', colors: [P.black, P.ink], cx: CENTRE.x, cy: CENTRE.y, reach: 230, texture: gridTexture });

export const TECH = {
  accent: P.cyan,
  style: { accent: P.cyan, plate: P.black, ink: 'light', bar: P.cyan },
  background,
  emblem,
  absorb: 0.5,
  shoulder: 30,
  warm: () => {
    traces();
    for (let k = 1; k <= ZOOM + 0.001; k += 0.05) chipSprite(k);
  },
};

export function drawTechBytes(ctx, dt, info) {
  playOpen(ctx, dt, info, TECH);
}
