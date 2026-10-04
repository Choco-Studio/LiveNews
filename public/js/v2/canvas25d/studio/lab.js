// TECH BYTES's back wall (round 4): the set is a circuit board. The hero screen is the chip — a package with
// pins along its edges — and copper traces run out from it across a blue solder-mask wall, bend at 45°, end in
// pads and vias by the display cabinets, with silkscreen marks in micro type. Data pulses run out along the
// traces (live layer). The traces keep clear of the presenters' heads (they route above and below them).
//
//   pcbWall(fr, cam, soft)        the board: field, traces, pads, marks, the chip's pins (after the light)
//   LIVE_DRAW['tech-bytes']       the pulses (live.js)
import { C } from '../pixbuf.js';
import { SET, kAt, sxOf, syOf } from './geometry.js';
import { LIVE_DRAW, livePoint, BLINK } from './live.js';
import { textPixels } from '../../../font.js';

const W = 384, H = 216;
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bay = (x, y) => (B4[((y & 3) << 2) | (x & 3)] + 0.5) / 16;

// The board's extent on the back wall (world units) and the traces of its left half (mirrored for the right):
// polylines from the chip's edge outward, each ending in a pad ('pad') or a via ('via').
export const BOARD = { X: 214, top: -134 };
const S = SET.screen;
const L_TRACES = [
  // over the heads: out of the chip's left edge, up at 45°, out to the cabinet
  { pts: [[-79, -104], [-92, -104], [-104, -116], [-150, -116]], end: 'pad' },
  { pts: [[-79, -98], [-96, -98], [-112, -114]], end: 'via' },
  { pts: [[-79, -92], [-100, -92], [-108, -100], [-138, -100], [-146, -92]], end: 'pad' },
  // out of the chip's top edge to the soffit
  { pts: [[-60, -113], [-60, -122], [-68, -130], [-120, -130]], end: 'via' },
  { pts: [[-46, -113], [-46, -126]], end: 'via' },
  { pts: [[-30, -113], [-30, -120], [-36, -126], [-88, -126], [-94, -120], [-128, -120]], end: 'pad' },
  // under the chip, between the presenters, down toward the desk
  { pts: [[-52, -16], [-52, -6], [-60, 2], [-140, 2]], end: 'pad' },
  { pts: [[-36, -16], [-36, 8], [-44, 16], [-98, 16]], end: 'via' },
  { pts: [[-20, -16], [-20, 12]], end: 'via' },
  // the outer bus by the cabinet: a pair running down the wall
  { pts: [[-144, -110], [-144, 30]], end: null },
  { pts: [[-148, -86], [-148, 30]], end: null },
];
// buses: four parallel traces out of the chip's upper left edge, bending up and running to the cabinet
for (let i = 0; i < 4; i++) {
  const y = -108 + i * 3.2, bend = -84 - i * 3.2;
  L_TRACES.push({ pts: [[-79, y], [bend, y], [bend - 10, y - 10], [-150, y - 10]], end: i % 2 ? null : 'via', bus: true });
}
export const TRACES = [...L_TRACES, ...L_TRACES.map((t) => ({ ...t, pts: t.pts.map(([x, y]) => [-x, y]), mirror: true }))];
// components on the board (outside the head zones): [X, Y, w, h, kind] kind 'ic' (a black package with pins) | 'r'
// (a resistor: black with silver ends) | 'c' (a capacitor: a steel can)
const PARTS = [
  [-124, -126, 14, 7, 'ic'], [124, -126, 14, 7, 'ic'], [-44, 6, 12, 8, 'ic'], [44, 6, 12, 8, 'ic'],
  [-96, -122, 5, 2.4, 'r'], [96, -122, 5, 2.4, 'r'], [-136, -94, 2.4, 5, 'r'], [136, -94, 2.4, 5, 'r'],
  [-70, 12, 5, 2.4, 'r'], [70, 12, 5, 2.4, 'r'], [-112, -104, 4, 4, 'c'], [112, -104, 4, 4, 'c'], [-26, 20, 4, 4, 'c'], [26, 20, 4, 4, 'c'],
];
// silkscreen marks: [text, X, Y]
const MARKS = [['U1', -64, -2], ['R12', -126, -108], ['C7', -118, -124], ['TB-24', 96, -124], ['J3', 124, 8], ['Q2', 112, -94]];

function seg(fr, ax, ay, bx, by, w, c, xa, xb, ya, yb) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay))));
  for (let i = 0; i <= n; i++) {
    const x = Math.round(ax + ((bx - ax) * i) / n), y = Math.round(ay + ((by - ay) * i) / n);
    for (let dy = 0; dy < w; dy++) for (let dx = 0; dx < w; dx++) {
      const X = x + dx, Y = y + dy;
      if (X >= xa && X < xb && Y >= ya && Y < yb) fr.px[Y * W + X] = c;
    }
  }
}

export function pcbWall(fr, cam, soft) {
  const k = kAt(cam, SET.wallZ);
  const px = fr.px;
  const xa = Math.max(0, Math.round(sxOf(cam, k, -BOARD.X))), xb = Math.min(W, Math.round(sxOf(cam, k, BOARD.X)));
  const ya = Math.max(0, Math.round(syOf(cam, k, BOARD.top))), yb = Math.min(H, Math.round(syOf(cam, k, SET.floorY)));
  if (xb <= xa || yb <= ya) return;
  // the field: blue solder mask lit from the cove above: a band of the cove's blue light at the top, the
  // navy board, falling back to ink toward the desk (light from above), each step a short Bayer band
  const yTop = syOf(cam, k, BOARD.top);
  for (let y = ya; y < yb; y++) {
    const dy = (y + 0.5 - yTop) / k; // world units below the board's top
    const row = y * W;
    // (flat steps, no dither: the cove's wash a band of slate, the board navy)
    const c = !soft && dy < 7 ? C.slate : C.navy;
    for (let x = xa; x < xb; x++) px[row + x] = c;
  }
  hexPanels(fr, cam, k, soft, xa, xb, ya, yb);
  const tw = Math.max(1, Math.round(1.3 * k)); // trace width in pixels
  const trace = soft ? C.blue : C.steel;
  for (const t of TRACES) {
    const P = t.pts.map(([X, Y]) => [sxOf(cam, k, X) - tw / 2, syOf(cam, k, Y) - tw / 2]);
    // out of focus a trace is a soft glowing line: a steel band with a blue core
    if (soft) for (let i = 0; i + 1 < P.length; i++) seg(fr, P[i][0] - 1, P[i][1] - 1, P[i + 1][0] - 1, P[i + 1][1] - 1, tw + 2, C.steel, xa, xb, ya, yb);
    for (let i = 0; i + 1 < P.length; i++) seg(fr, P[i][0], P[i][1], P[i + 1][0], P[i + 1][1], tw, trace, xa, xb, ya, yb);
    if (!t.end) continue;
    const [ex, ey] = P[P.length - 1];
    const r = t.end === 'pad' ? Math.max(1.6, 2.6 * k) : Math.max(1.2, 1.8 * k);
    const cx = ex + tw / 2, cy = ey + tw / 2;
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      if (x < xa || x >= xb || y < ya || y >= yb) continue;
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d > r) continue;
      // a pad: a silver disc with a lit top-left; a via: a steel ring round a dark hole (out of focus a soft disc)
      if (t.end === 'pad') px[y * W + x] = soft ? (d > r - 1 ? C.fog : C.steel) : d < r - 1 && x + 0.5 < cx && y + 0.5 < cy ? C.silver : C.fog;
      else px[y * W + x] = d < r * 0.45 ? C.black : soft ? C.slate : C.steel;
    }
  }
  // the components
  for (const [X, Y, w, h, kind] of PARTS) {
    const x0 = Math.round(sxOf(cam, k, X - w / 2)), x1 = Math.round(sxOf(cam, k, X + w / 2));
    const y0 = Math.round(syOf(cam, k, Y - h / 2)), y1 = Math.round(syOf(cam, k, Y + h / 2));
    const put = (x, y, c) => {
      if (x >= xa && x < xb && y >= ya && y < yb) px[y * W + x] = c;
    };
    const W0 = Math.max(1, x1 - x0), H0 = Math.max(1, y1 - y0);
    for (let y = y0; y < y0 + H0; y++) for (let x = x0; x < x0 + W0; x++) {
      let c = C.black;
      if (kind === 'r' && (W0 >= H0 ? x === x0 || x === x0 + W0 - 1 : y === y0 || y === y0 + H0 - 1)) c = soft ? C.slate : C.fog;
      if (kind === 'c') c = y === y0 ? (soft ? C.slate : C.fog) : soft ? C.slate : C.steel;
      if (kind === 'ic' && !soft && y === y0 && x > x0) c = C.slate; // its top edge catches the light
      put(x, y, c);
    }
    if (kind === 'ic') {
      // pins along its long sides, one dot per 2 px
      for (let x = x0 + 1; x < x0 + W0 - 1; x += 2) {
        put(x, y0 - 1, soft ? C.slate : C.steel);
        put(x, y0 + H0, soft ? C.slate : C.steel);
      }
      if (!soft) put(x0 + 1, y0 + 1, C.slate); // pin 1's dot
    }
  }
  if (!soft) {
    // silkscreen marks in micro type (fog, the board's white ink at night)
    const s = Math.max(1, Math.round(k * 1.25));
    for (const [txt, X, Y] of MARKS) {
      const g = textPixels(txt, 'micro');
      const x0 = Math.round(sxOf(cam, k, X)), y0 = Math.round(syOf(cam, k, Y));
      for (const [gx, gy] of g.pixels) for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
        const x = x0 + gx * s + i, y = y0 + gy * s + j;
        if (x >= xa && x < xb && y >= ya && y < yb && px[y * W + x] === C.navy) px[y * W + x] = C.slate;
      }
    }
  }
  // the chip's pins: short silver legs out of the screen's package on all four sides
  const pinLen = 4, pitch = 6, b = 2.8 + 1.5; // outside the bezel
  const pin = soft ? C.slate : C.fog;
  const leg = (X0, Y0, X1, Y1) => {
    const x0 = Math.round(sxOf(cam, k, X0)), x1 = Math.round(sxOf(cam, k, X1)), y0 = Math.round(syOf(cam, k, Y0)), y1 = Math.round(syOf(cam, k, Y1));
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1) + (y0 === y1 ? 0 : -1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1) + (x0 === x1 ? 0 : -1); x++) {
      if (x >= xa && x < xb && y >= ya && y < yb) px[y * W + x] = pin;
    }
  };
  for (let Y = S.y0 + 6; Y <= S.y1 - 4; Y += pitch) {
    leg(S.x0 - b - pinLen, Y, S.x0 - b, Y);
    leg(S.x1 + b, Y, S.x1 + b + pinLen, Y);
  }
  for (let X = S.x0 + 8; X <= S.x1 - 6; X += pitch) leg(X, S.y0 - b - pinLen, X, S.y0 - b);
}

// Behind each presenter, a backlit panel of frosted hexagons set into the board (a tech set's light wall): the
// light brightest at its heart behind the head, falling off to the board's navy at its edges, the hex frame in
// thin dark lines. It is the head's ground in every framing (TECH BYTES' lighter head zone, 28-35 L*).
export const HEX = { X0: 84, X1: 146, Y0: -86, Y1: -8, cell: 15.5 };
const SQ3 = Math.sqrt(3);
/** The hexagon (pointy-top grid) under (X, Y): its centre and the distance to its edge (0 centre .. 1 edge). */
const HC = { X: 0, Y: 0, d: 0 };
function hexCell(X, Y, size) {
  const x = ((SQ3 / 3) * X - Y / 3) / size, z = ((2 / 3) * Y) / size, y = -x - z;
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  HC.d = Math.max(Math.abs(x - rx), Math.abs(y - ry), Math.abs(z - rz)) * 2;
  HC.X = size * (SQ3 * rx + (SQ3 / 2) * rz);
  HC.Y = size * 1.5 * rz;
  return HC;
}
function hexPanels(fr, cam, k, soft, xa, xb, ya, yb) {
  const px = fr.px;
  for (const sx of [-1, 1]) {
    const XA = sx > 0 ? HEX.X0 : -HEX.X1, XB = sx > 0 ? HEX.X1 : -HEX.X0;
    const x0 = Math.max(xa, Math.round(sxOf(cam, k, XA))), x1 = Math.min(xb, Math.round(sxOf(cam, k, XB)));
    const y0 = Math.max(ya, Math.round(syOf(cam, k, HEX.Y0))), y1 = Math.min(yb, Math.round(syOf(cam, k, HEX.Y1)));
    const cX = sx * (HEX.X0 + HEX.X1) / 2, cY = -90; // lit from the top (the head's ring stays slate)
    const lineW = Math.min(0.2, 0.75 / (HEX.cell * k)); // about a pixel, as a share of the cell's radius
    for (let y = y0; y < y1; y++) {
      const Y = cam.y + (y + 0.5 - cam.hy) / k;
      for (let x = x0; x < x1; x++) {
        const X = cam.x + (x + 0.5 - 192) / k;
        // square tiles (a light wall of frosted panels), each lit as a whole by its centre's distance from the
        // light above: steel near the top, slate below; each tile's top edge catches the light, the grout navy
        const T = HEX.cell, gx = Math.floor((X * sx - HEX.X0) / T), gy = Math.floor((Y - HEX.Y0) / T);
        const tX = HEX.X0 + (gx + 0.5) * T, tY = HEX.Y0 + (gy + 0.5) * T;
        const dx = (tX - Math.abs(cX)) / 40, dy = (tY - cY) / 34;
        const l = 1 - Math.sqrt(dx * dx + dy * dy);
        let c = l > 0.5 ? C.steel : C.slate;
        const fx = (X * sx - HEX.X0) / T - gx, fy = (Y - HEX.Y0) / T - gy;
        const gw = lineW * 0.5;
        if (fx < gw || fy < gw) c = C.navy;
        else if (!soft && fy < gw + 1 / (T * k)) c = c === C.steel ? C.fog : C.steel;
        px[y * W + x] = c;
      }
    }
    // the panel's frame: a black reveal round it, its top edge lit
    const fx0 = Math.round(sxOf(cam, k, XA)), fx1 = Math.round(sxOf(cam, k, XB));
    const fy0 = Math.round(syOf(cam, k, HEX.Y0)), fy1 = Math.round(syOf(cam, k, HEX.Y1));
    const span = (a, b2, c0, d, col) => {
      for (let y = Math.max(ya, c0); y < Math.min(yb, d); y++) for (let x = Math.max(xa, a); x < Math.min(xb, b2); x++) px[y * W + x] = col;
    };
    span(fx0 - 1, fx1 + 1, fy0 - 1, fy0, soft ? C.ink : C.black);
    span(fx0 - 1, fx1 + 1, fy1, fy1 + 1, C.black);
    span(fx0 - 1, fx0, fy0, fy1, C.black);
    span(fx1, fx1 + 1, fy0, fy1, C.black);
  }
}

// --------------------------------------------------------------------------- the pulses (live.js)
/** A point at distance d along a polyline (world units); null past its end. */
function along(pts, d) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const l = Math.hypot(bx - ax, by - ay);
    if (d <= l) return [ax + ((bx - ax) * d) / l, ay + ((by - ay) * d) / l];
    d -= l;
  }
  return null;
}
const LEN = TRACES.map((t) => {
  let l = 0;
  for (let i = 0; i + 1 < t.pts.length; i++) l += Math.hypot(t.pts[i + 1][0] - t.pts[i][0], t.pts[i + 1][1] - t.pts[i][1]);
  return l;
});

LIVE_DRAW['tech-bytes'] = (fr, cam, t, style, clipRows, soft) => {
  const k = kAt(cam, SET.wallZ);
  const px = fr.px;
  const trace = soft ? C.blue : C.steel;
  const tw = Math.max(1, Math.round(1.3 * k));
  TRACES.forEach((tr, i) => {
    if (!tr.end) return; // the bus carries no pulse
    // each trace fires a pulse every 3.5-7 s, running out from the chip at 60 units/s
    const period = 3.5 + ((i * 37) % 35) / 10, phase = ((i * 53) % 100) / 100;
    const u = ((t / period + phase) % 1) * period * 60;
    if (u > LEN[i]) return;
    for (let j = 0; j < 3; j++) {
      const p = along(tr.pts, u - j * 2.2);
      if (!p) continue;
      const x0 = Math.round(sxOf(cam, k, p[0]) - tw / 2), y0 = Math.round(syOf(cam, k, p[1]) - tw / 2);
      // the pulse covers the trace's width (out of focus a little more): cyan head, blue then fog tail
      const c = j === 0 ? (soft ? C.white : C.cyan) : j === 1 ? (soft ? C.cyan : C.blue) : C.fog;
      for (let dy = 0; dy < tw; dy++) for (let dx = 0; dx < tw; dx++) {
        const x = x0 + dx, y = y0 + dy;
        if (x < 0 || x >= W || y < 0 || y >= H || (clipRows && y >= clipRows[x])) continue;
        if (px[y * W + x] !== trace) continue;
        px[y * W + x] = c;
      }
    }
  });
};

export { livePoint, BLINK };
