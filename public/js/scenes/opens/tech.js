// TECH BYTES open: signals race in along thin cyan circuit traces from the
// frame edges, a chip shutters open around the bit, its pins catch the signal
// and the die boots a single byte; then the traces retract into the pins and
// the chip pulls back to the lock-up. The chip is an object, not an icon: a
// dark epoxy package lit from the upper left (silver bevel on the key side,
// shaded sides and pins on the far side, solder-bright pin tips, a moulded
// pin-1 dimple) with a recessed die whose surface carries a fine grid.
// Accent: cyan (thin lines and the booted cells only).
import { P } from '../../palette.js';
import { u32, seg, easeOutQuint, easeInOut, linePts, Pix, memoFn } from '../../gfx/index.js';
import { lazyBackdrop, playOpen, CENTRE, ZOOM, W, H } from './kit.js';

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
let TRACES = null;
const traces = () => TRACES || (TRACES = buildTraces());
const buildTraces = () => {
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
};

/** Chip body and pins at size factor k (baked per integer size). */
const chipSpriteK = memoFn(64, (key, D, k) => {
  const S = D.body + D.pin * 2 + 1; // +1: drop shadow
  const p = new Pix(S, S);
  const o = D.pin;
  const pw = D.pinW;
  const B = D.body;
  // pins: steel legs; the key side (top, left) is lit, the far side (bottom, right) is in
  // shade; each tip carries a bright solder spot on its lit corner
  for (const off of D.offs) {
    const c = D.half + off + o - (pw >> 1);
    // top and bottom rows (vertical legs): lit column on the left, shaded column on the right
    for (const [y0, lit] of [[0, true], [o + B, false]]) {
      p.rect(c, y0, pw, o, lit ? P.steel : P.slate);
      p.rect(c, y0, 1, o, lit ? P.silver : P.steel);
      p.rect(c + pw - 1, y0, 1, o, lit ? P.slate : P.ink);
      p.px(c, lit ? y0 : y0 + o - 1, lit ? P.white : P.fog); // solder tip
    }
    // left and right columns (horizontal legs): lit row on top, shaded row below
    for (const [x0, lit] of [[0, true], [o + B, false]]) {
      p.rect(x0, c, o, pw, lit ? P.steel : P.slate);
      p.rect(x0, c, o, 1, lit ? P.silver : P.steel);
      p.rect(x0, c + pw - 1, o, 1, lit ? P.slate : P.ink);
      p.px(lit ? x0 : x0 + o - 1, c, lit ? P.white : P.fog);
    }
  }
  // drop shadow on the board/field, down and right
  p.rect(o + 1, o + B, B, 1, P.black);
  p.rect(o + B, o + 1, 1, B, P.black);
  // package: black epoxy top face, a 2 px bevel lit on the key side, shaded on the far side
  p.rect(o, o, B, B, P.black);
  p.rect(o, o, B, 1, P.silver);
  p.rect(o, o + 1, 1, B - 1, P.silver);
  p.rect(o + 1, o + 1, B - 2, 1, P.steel);
  p.rect(o + 1, o + 2, 1, B - 3, P.steel);
  p.rect(o + B - 1, o + 1, 1, B - 1, P.slate);
  p.rect(o + 1, o + B - 1, B - 1, 1, P.slate);
  p.rect(o + B - 2, o + 2, 1, B - 3, P.ink);
  p.rect(o + 2, o + B - 2, B - 3, 1, P.ink);
  p.px(o, o, P.white); // the specular corner
  // moulded pin-1 dimple: a small pit, dark on its lit rim, catching light on its far rim
  const dot = Math.max(2, Math.round(2 * k));
  const dx = o + 3 * dot;
  p.rect(dx, dx, dot, dot, P.ink);
  p.rect(dx, dx, dot, 1, P.black);
  p.rect(dx + dot - 1, dx + 1, 1, dot - 1, P.slate);
  // recessed die window: shadowed inner edge on the key side, lit inner edge on the far side,
  // and a fine grid on the die surface
  const { x0, y0, w, h } = dieRect(D, o + D.half, o + D.half);
  p.rect(x0, y0, w, h, P.ink);
  for (let yy = y0 + 2; yy < y0 + h - 1; yy += 3) for (let xx = x0 + 2; xx < x0 + w - 1; xx += 3) p.px(xx, yy, P.black);
  p.rect(x0 - 1, y0 - 1, w + 2, 1, P.black);
  p.rect(x0 - 1, y0, 1, h + 1, P.black);
  p.rect(x0, y0 + h, w + 1, 1, P.slate);
  p.rect(x0 + w, y0, 1, h, P.slate);
  return { cv: p.canvas(), S: S - 1 };
});
function chipSprite(k) {
  const D = dims(k);
  return chipSpriteK(D.body * 10000 + D.pin * 100 + D.pinW, D, k);
}

/** The die window (inside the cyan outline) for a chip centred at (cx, cy). */
function dieRect(D, cx, cy) {
  const gridW = 4 * D.cell + 3 * D.gap;
  const gridH = 2 * D.cellH + D.gap;
  const w = gridW + 2 * (D.gap + 1) + 2;
  const h = gridH + 2 * (D.gap + 1) + 2 + 2 * D.gap;
  return { x0: cx - (w >> 1), y0: cy - (h >> 1), w, h, gridW, gridH };
}

/** The die: a cyan outline that draws round clockwise, then the byte boots cell by cell. */
function drawDie(ctx, dt, x, y, D) {
  const cw = D.cell;
  const ch = D.cellH;
  const g = D.gap;
  const R = dieRect(D, x, y);
  const { x0, y0, w, h } = R;
  const p = easeInOut(seg(dt, 0.72, 0.4));
  let len = Math.round(2 * (w + h) * p);
  ctx.fillStyle = P.cyan;
  let v = Math.min(w, len);
  len -= v;
  if (v) ctx.fillRect(x0, y0, v, 1);
  v = Math.min(h, len);
  len -= v;
  if (v) ctx.fillRect(x0 + w - 1, y0, 1, v);
  v = Math.min(w, len);
  len -= v;
  if (v) ctx.fillRect(x0 + w - v, y0 + h - 1, v, 1);
  v = Math.min(h, len);
  if (v) ctx.fillRect(x0, y0 + h - v, 1, v);
  const gx = x - (R.gridW >> 1);
  const gy = y - (R.gridH >> 1);
  for (let i = 0; i < 8; i++) {
    if (dt < 0.95 + i * 0.05) continue;
    const cx = gx + (i % 4) * (cw + g);
    const cy = gy + (i >> 2) * (ch + g);
    if (BYTE[i]) {
      ctx.fillStyle = P.cyan;
      ctx.fillRect(cx, cy, cw, ch);
      ctx.fillStyle = P.blue;
      ctx.fillRect(cx, cy + ch - 1, cw, 1);
      ctx.fillRect(cx + cw - 1, cy, 1, ch - 1);
    } else {
      ctx.fillStyle = P.slate;
      ctx.fillRect(cx, cy, cw, ch);
      ctx.fillStyle = P.black;
      ctx.fillRect(cx, cy, cw, 1);
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
  try {
    ctx.beginPath();
    ctx.rect(x - half, top, C.S + 1, hh + (open >= 1 ? 1 : 0));
    ctx.clip();
    ctx.drawImage(C.cv, x - half, y - half);
    drawDie(ctx, dt, x, y, D);
  } finally {
    ctx.restore();
  }
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
  extent: 28, // half the package plus a pin
  absorb: 0.5,
  shoulder: 30,
  warmJobs: () => {
    const jobs = [traces];
    for (let k = 1; k <= ZOOM + 0.001; k += 0.05) jobs.push(() => chipSprite(k));
    return jobs;
  },
};

export function drawTechBytes(ctx, dt, info) {
  playOpen(ctx, dt, info, TECH);
}
