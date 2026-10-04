// MONEY MINUTE's set (round 4): a panelled room on the exchange after the close. Dark walnut panelling either
// side of the screen (raised panels in their stiles, a moulded frieze, a brass dado rail with a ledge, slats
// below it), bronze sconces washing the panels warm, a bronze Charging Bull and a bear on the ledge either
// side, each under its own little spot, and along the soffit an LED ticker running the programme's beats (no
// prices: the channel never shows a figure it did not report). Out of focus the wood keeps its warmth and the
// lamps and the ticker turn soft.
//
//   moneyWall(fr, cam, soft)        the room (after the wall's light, before the screen)
//   LIVE_DRAW['money-minute']       the ticker runs (live.js)
import { C } from '../pixbuf.js';
import { SET, kAt, sxOf, syOf } from './geometry.js';
import { LIVE_DRAW } from './live.js';
import { drawSconce } from './sconce.js';
import { textPixels } from '../../../font.js';

const W = 384, H = 216;
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bay = (x, y) => (B4[((y & 3) << 2) | (x & 3)] + 0.5) / 16;
const hash = (a, b, c = 0) => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35) ^ Math.imul(c + 0x27d4eb2f, 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
};

// the room in world units on the back wall
export const ROOM = {
  X: 250,
  soffit: -133, // the soffit's foot: the ticker band runs along its face
  ticker: [-133, -124],
  frieze: [-124, -114],
  panels: [-111, -19], // the raised panels' top and foot
  dado: [-16, -11], // the brass rail; its top is the ledge the bronzes stand on
  stiles: [80, 128, 178, 228], // stile centres from the screen's mount outward
  stileW: 7,
  sconces: [-153, 153], // on the stiles between the inner and the middle panels
  sconceY: -66,
};

// --------------------------------------------------------------------------- the bronzes (shape lists, 30 x 16)
// the Charging Bull's build: a small round rump, a massive shoulder, the head down, short thick horns curving
// forward, the tail lashing up; the bear: a long heavy body, the hump over the shoulders, the head low, round
// ears, a tapering snout; 'x' marks the eye
export const BULL = [
  ['e', 7, 7.5, 4.5, 4.5], ['e', 13.5, 8, 8, 4.6], ['e', 19.5, 6.3, 5.5, 5.3], ['e', 21.5, 10, 4, 3.2],
  ['e', 25.5, 10.4, 3, 2.6], ['e', 28, 11.6, 1.7, 1.6],
  ['c', 24.6, 8, 26.4, 5.4, 0.95], ['c', 26.4, 5.4, 28.6, 4.8, 0.75],
  ['c', 21, 12, 23.5, 15.3, 1.4], ['c', 18.5, 12, 17.8, 15.3, 1.35, 'far'], ['c', 6.5, 11, 4.6, 15.3, 1.4], ['c', 9.5, 11.5, 10, 15.3, 1.3, 'far'],
  ['c', 3, 5.5, 1.6, 3, 0.6], ['c', 1.6, 3, 2.6, 0.9, 0.55], ['e', 3, 0.8, 1, 0.8],
  ['x', 25.6, 9.4],
];
export const BEAR = [
  ['e', 14, 8.5, 10, 4.6], ['e', 19, 6.2, 5, 4.3], ['e', 6, 7.8, 4.6, 4.4],
  ['e', 24.3, 8.6, 3.2, 2.8], ['e', 27.6, 9.6, 2.1, 1.4], ['e', 23.2, 5.9, 1, 1],
  ['c', 20.5, 11, 21, 15.3, 1.8], ['c', 17, 11, 16.6, 15.3, 1.7, 'far'], ['c', 8, 11, 7.4, 15.3, 1.9], ['c', 11, 11, 11.4, 15.3, 1.6, 'far'],
  ['e', 1.6, 6.8, 0.8, 0.8],
  ['x', 25.2, 8.1],
];
function inShape(sh, x, y) {
  if (sh[0] === 'x') return false;
  if (sh[0] === 'e') {
    const dx = (x - sh[1]) / sh[3], dy = (y - sh[2]) / sh[4];
    return dx * dx + dy * dy <= 1;
  }
  const [, ax, ay, bx, by, r] = sh;
  const vx = bx - ax, vy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)));
  const dx = x - (ax + vx * t), dy = y - (ay + vy * t);
  return dx * dx + dy * dy <= r * r;
}
/** The shape list's mask at `pxu` pixels per local unit (30 x 16 box): 2 near side, 1 a far leg only. */
export function shapeMask(shapes, pxu, flip) {
  const w = Math.ceil(30 * pxu), h = Math.ceil(16 * pxu);
  const mask = new Uint8Array((w + 2) * (h + 2));
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      let lx = (i + 0.5) / pxu;
      if (flip) lx = 30 - lx;
      const ly = (j + 0.5) / pxu;
      let v = 0;
      for (const sh of shapes) {
        if (!inShape(sh, lx, ly)) continue;
        v = sh[6] === 'far' ? Math.max(v, 1) : 2;
        if (v === 2) break;
      }
      mask[(j + 1) * (w + 2) + (i + 1)] = v;
    }
  }
  return { w, h, at: (i, j) => mask[(j + 1) * (w + 2) + (i + 1)] };
}

// --------------------------------------------------------------------------- the room
export function moneyWall(fr, cam, soft) {
  const k = kAt(cam, SET.wallZ);
  const px = fr.px;
  const xa = Math.max(0, Math.round(sxOf(cam, k, -ROOM.X))), xb = Math.min(W, Math.round(sxOf(cam, k, ROOM.X)));
  const sy = (Y) => Math.round(syOf(cam, k, Y));
  const sxw = (X) => Math.round(sxOf(cam, k, X));
  const ya = Math.max(0, sy(ROOM.soffit)), yb = Math.min(H, sy(SET.floorY));
  if (xb <= xa || yb <= ya) return;
  const put = (x, y, c) => {
    if (x >= xa && x < xb && y >= 0 && y < yb) px[y * W + x] = c;
  };
  const fill = (x0, y0, x1, y1, c) => {
    for (let y = Math.max(0, y0); y < Math.min(yb, y1); y++) for (let x = Math.max(xa, x0); x < Math.min(xb, x1); x++) px[y * W + x] = c;
  };
  // the wall behind it all: the stiles' dark walnut
  fill(xa, ya, xb, yb, C.maroon);
  // the frieze: a band of the panels' brown, a lit moulding under it (a lip, its shadow)
  const fy0 = sy(ROOM.frieze[0]), fy1 = sy(ROOM.frieze[1]);
  fill(xa, fy0, xb, fy1, C.brown);
  if (!soft) {
    fill(xa, fy1, xb, fy1 + 1, C.tanShade);
    fill(xa, fy1 + 1, xb, fy1 + 2, C.black);
  }
  // the raised panels: a brown field in its frame, the bevel lit on its top and left, shadowed bottom and right,
  // a vertical grain in broken runs
  const py0 = sy(ROOM.panels[0]), py1 = sy(ROOM.panels[1]);
  const half = ROOM.stileW / 2;
  for (const s of [-1, 1]) {
    for (let i = 0; i + 1 < ROOM.stiles.length; i++) {
      const A = s * (ROOM.stiles[i] + half), B = s * (ROOM.stiles[i + 1] - half);
      const x0 = sxw(Math.min(A, B)), x1 = sxw(Math.max(A, B));
      if (x1 <= xa || x0 >= xb) continue;
      fill(x0, py0, x1, py1, C.brown);
      if (soft) continue;
      // the bevel: an outer ring one pixel wide, an inner ring where the raised field starts
      const inset = Math.max(2, Math.round(3.2 * k));
      fill(x0, py0, x1, py0 + 1, C.tanShade);
      fill(x0, py0, x0 + 1, py1, C.tanShade);
      fill(x0, py1 - 1, x1, py1, C.black);
      fill(x1 - 1, py0, x1, py1, C.black);
      fill(x0 + inset, py0 + inset, x1 - inset, py0 + inset + 1, C.maroon);
      fill(x0 + inset, py0 + inset, x0 + inset + 1, py1 - inset, C.maroon);
      fill(x0 + inset, py1 - inset - 1, x1 - inset, py1 - inset, C.tanShade);
      fill(x1 - inset - 1, py0 + inset, x1 - inset, py1 - inset, C.tanShade);
      // the grain: vertical runs in the raised field, seeded per panel column
      for (let x = x0 + inset + 2; x < x1 - inset - 1; x++) {
        const col = x - sxw(0);
        if (hash(col, s, 5) > 0.3) continue;
        let y = py0 + inset + 2 + Math.floor(hash(col, s, 6) * 6);
        while (y < py1 - inset - 2) {
          const len = 4 + Math.floor(hash(col, y, 7) * 12);
          const c = hash(col, y, 8) < 0.7 ? C.maroon : C.tanShade;
          for (let j = 0; j < len && y + j < py1 - inset - 1; j++) put(x, y + j, c);
          y += len + 3 + Math.floor(hash(col, y, 9) * 8);
        }
      }
    }
    // the stiles' edges toward the light
    if (!soft) for (const X of ROOM.stiles) {
      const xs = sxw(s * (X - half));
      fill(xs, fy1 + 2, xs + 1, yb, C.brown);
    }
  }
  // the lamps' warm light on the wood: from each sconce a scallop up and one down, lifting each surface one
  // step (maroon → brown, brown → tanShade, tanShade → tan), a clean shape with a one-pixel Bayer fringe
  const lift = new Map([[C.maroon >>> 0, C.brown], [C.brown >>> 0, C.tanShade], [C.tanShade >>> 0, C.tan]]);
  for (const X of ROOM.sconces) {
    const cx = sxOf(cam, k, X), cy = syOf(cam, k, ROOM.sconceY);
    const reachUp = 30 * k, reachDown = 22 * k, gap = 5 * k;
    for (let y = Math.max(0, Math.floor(cy - gap - reachUp)); y < Math.min(yb, Math.ceil(cy + gap + reachDown)); y++) {
      const dy = y + 0.5 - cy, dist = Math.max(0, Math.abs(dy) - gap), reach = dy < 0 ? reachUp : reachDown;
      if (dist >= reach) continue;
      const hw = 2.6 * k + Math.sqrt(dist * reach) * 0.42;
      for (let x = Math.floor(cx - hw - 1); x <= Math.ceil(cx + hw + 1); x++) {
        if (x < xa || x >= xb) continue;
        const dx = Math.abs(x + 0.5 - cx) / hw;
        const d = Math.hypot(dist / reach, dx * 0.9);
        if (d >= 1) continue; // a clean shape: flat light, no dither
        const c = lift.get(px[y * W + x] >>> 0);
        if (c) px[y * W + x] = soft ? (c === C.tan ? C.tanShade : c) : c;
      }
    }
  }
  // the dado: a brass rail (its top the ledge, lit), the slats below it
  const dy0 = sy(ROOM.dado[0]), dy1 = sy(ROOM.dado[1]);
  fill(xa, dy0, xb, dy1, soft ? C.tanShade : C.tanShade);
  if (!soft) {
    fill(xa, dy0, xb, dy0 + 1, C.cream);
    fill(xa, dy1 - 1, xb, dy1, C.brown);
    fill(xa, dy1, xb, dy1 + 1, C.black);
  }
  const pitch = Math.max(3, Math.round(5 * k)), ox = sxw(0);
  for (let y = dy1 + 1; y < yb; y++) for (let x = xa; x < xb; x++) {
    const gapc = ((((x - ox) % pitch) + pitch) % pitch) === pitch - 1;
    px[y * W + x] = gapc ? C.maroon : y - dy1 <= 1 + 2 * k ? C.tanShade : C.brown; // the rail's light on the slats' tops
  }
  // the sconces themselves
  for (const X of ROOM.sconces) drawSconce(fr, cam, X, ROOM.sconceY, soft);
  // the bronzes on the ledge, each under a small spot (a warm cone on the panel behind it)
  bronze(fr, cam, k, -203, BULL, false, soft, put);
  bronze(fr, cam, k, 203, BEAR, true, soft, put);
  // the ticker band along the soffit's face (its text runs in the live layer); a warm cove under it
  const ty0 = sy(ROOM.ticker[0]), ty1 = sy(ROOM.ticker[1]);
  fill(xa, Math.max(0, ty0 - 40), xb, ty0, C.black);
  fill(xa, ty0, xb, ty1, C.black);
  if (!soft) fill(xa, ty1 - 1, xb, ty1, C.darkGreen);
  TICK.y0 = ty0;
  TICK.y1 = ty1;
  TICK.x0 = xa;
  TICK.x1 = xb;
  TICK.k = k;
  TICK.soft = soft;
  tickerText(fr, 0);
}

/** A bronze on the ledge: the animal, shaded from the key at camera left, its plinth, and a spot's cone behind. */
function bronze(fr, cam, k, X, shapes, flip, soft, put) {
  const px = fr.px;
  const ledge = syOf(cam, k, ROOM.dado[0]);
  const pxu = 1.75 * k;
  const m = shapeMask(shapes, pxu, flip);
  const plinthH = Math.max(2, Math.round(5 * k));
  const ex = Math.round(sxOf(cam, k, X) - m.w / 2), ey = Math.round(ledge - plinthH - m.h);
  // the spot: a warm cone from above, widening down to the bronze (lifts the wood one step)
  if (!soft) {
    const lift = new Map([[C.maroon >>> 0, C.brown], [C.brown >>> 0, C.tanShade], [C.tanShade >>> 0, C.tan]]);
    const top = Math.round(syOf(cam, k, ROOM.frieze[1])) + 2, cx = ex + m.w / 2;
    for (let y = top; y < ey + m.h; y++) {
      const u = (y - top) / Math.max(1, ey + m.h - top);
      const hw = m.w * (0.18 + 0.42 * u);
      for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
        const d = Math.abs(x + 0.5 - cx) / hw;
        if (d >= 1) continue;
        if (x < 0 || x >= W || y < 0 || y >= H) continue;
        const c = lift.get(px[y * W + x] >>> 0);
        if (c) px[y * W + x] = c;
      }
    }
  }
  // the plinth: black, its top edge lit
  const p0 = Math.round(ex + m.w * 0.12), p1 = Math.round(ex + m.w * 0.88);
  for (let y = Math.round(ledge - plinthH); y < Math.round(ledge); y++) for (let x = p0; x < p1; x++) put(x, y, y === Math.round(ledge - plinthH) && !soft ? C.slate : C.black);
  // the animal: dark patinated bronze against its lit panel, the spot catching its back (a tan rim, cream where
  // the light grazes the crest), the body brown over maroon, its far legs and the edges away in black
  for (let j = 0; j < m.h; j++) {
    for (let i = 0; i < m.w; i++) {
      const v = m.at(i, j);
      if (!v) continue;
      const L = !m.at(i - 1, j), R = !m.at(i + 1, j), T = !m.at(i, j - 1), B = !m.at(i, j + 1);
      const T2 = T || !m.at(i, j - 2);
      let c;
      if (soft) c = v === 2 ? (j < m.h * 0.45 ? C.brown : C.maroon) : C.black;
      else if (v === 1) c = C.black; // a far leg, in shadow
      else if (T) c = j < m.h * 0.4 ? C.cream : C.tan;
      else if (T2 && j < m.h * 0.5) c = C.tanShade;
      else if (L) c = C.brown;
      else if (B || R) c = C.black;
      else c = j < m.h * 0.45 ? C.brown : C.maroon;
      put(ex + i, ey + j, c);
    }
  }
  if (!soft) for (const s0 of shapes) {
    if (s0[0] !== 'x') continue;
    const i = Math.floor((flip ? 30 - s0[1] : s0[1]) * pxu), j = Math.floor(s0[2] * pxu);
    if (m.at(i, j)) put(ex + i, ey + j, C.black);
  }
}

// --------------------------------------------------------------------------- the ticker
const TICKER = 'MONEY MINUTE • MARKETS • CURRENCIES • COMMODITIES • ENERGY • TECH • ';
const TICK = { y0: 0, y1: 0, x0: 0, x1: 0, k: 1, soft: false };
let GLYPH = null;
/** The ticker's text at an offset of `shift` pixels (it runs right to left, 18 px a second in the wide). */
function tickerText(fr, shift) {
  const { y0, y1, x0, x1, k, soft } = TICK;
  if (y1 <= 0 || y0 >= H || x1 <= x0) return;
  if (!GLYPH) {
    const g = textPixels(TICKER, 'micro');
    // the dots between the beats in green, the words in fog
    const dots = new Set();
    let x = 0;
    for (const ch of TICKER) {
      const w = ch === ' ' ? 2 : textPixels(ch, 'micro').width + 1;
      if (ch === '•') for (let i = 0; i < w - 1; i++) dots.add(x + i);
      x += w;
    }
    GLYPH = { g, dots };
  }
  const s = Math.max(1, Math.round(k * 1.25));
  const px = fr.px;
  const span = (GLYPH.g.width + 4) * s;
  const ty = y0 + Math.floor((y1 - 1 - y0 - 5 * s) / 2);
  for (let y = Math.max(0, y0); y < Math.min(H, y1 - 1); y++) px.fill(C.black, y * W + Math.max(0, x0), y * W + Math.min(W, x1));
  if (soft) {
    // out of focus: a soft line of light where the text runs
    for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) if (((x + Math.floor(shift)) % 9) < 6) px[(ty + 2 * s) * W + x] = C.slate;
    return;
  }
  let base = x0 - (((Math.floor(shift) % span) + span) % span);
  for (; base < x1; base += span) {
    for (const [gx, gy] of GLYPH.g.pixels) {
      for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
        const x = base + gx * s + i, y = ty + gy * s + j;
        if (x < Math.max(0, x0) || x >= Math.min(W, x1) || y < 0 || y >= H) continue;
        px[y * W + x] = GLYPH.dots.has(gx) ? C.green : C.fog;
      }
    }
  }
}

LIVE_DRAW['money-minute'] = (fr, cam, t) => {
  if (!TICK.x1) return;
  tickerText(fr, t * 18 * TICK.k / 0.76);
};
