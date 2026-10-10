// MONEY MINUTE's title sequence (owner, 9 Oct: the other programmes' opens "as crafted" as WORLD
// NOW's). Nine and a half seconds on the programme's grid (cues.js, 114 BPM): after the close.
//
//   TIME-LAPSE  beats 0-8    the financial district from the golden hour to the blue hour: the
//                            camera rises over the rooftops and tracks along the skyline (layers in
//                            parallax, each moving in whole pixels), the sun goes down behind the far
//                            towers, clouds and the road's traffic stream, and the offices light up in
//                            bursts with the e-piano's chords; the tallest tower's crown comes on
//   THE TOWER   8-11.9       cut to that tower's top floors and crown, every office lit; the floors
//                            go dark on the beat from the foot upward, until one window is left: the bit
//   THE LEDGER  11.9-18      the binding opens out of the bit and the package's ledger builds, then
//                            the reveal; still for the last 0.8 s
//
// Nothing here is a chart: no figures, no bars, no lines that rise (money-minute.md 3.7). The towers
// are silhouettes against the sky, tinted by it (the far ones the most), so the city reads by its
// air; a skyline is never a row of rising columns.
import { P } from '../../palette.js';
import { u32, clamp, lerp, seg, smoothstep } from '../../gfx/index.js';
import { W, H, drawBit, TL } from './kit.js';
import { MONEY } from './money.js';
import { track, sequence, Layer, ditherAt } from './seq.js';
import { CUES, hitOf } from './cues.js';

const ID = 'money-minute';
const Q = CUES[ID];
const BEAT = 60 / Q.bpm;
const HIT = hitOf(ID);
const C = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, u32(v)]));

// The bit: the last lit window, where the ledger's binding opens (the pad's binding at centre stage
// is rows 42-51, opening out from x 192)
const BIT = { x: 190, y: 45 };

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------------
// The air: one value field over the frame (0 black ... 8 cream along the dusk ramp), drawn in flat
// steps with short dithered edges on the screen's fixed matrix. Everything in the city is tinted by
// it, the far skyline the most.

const HZ = 150; // the horizon (the camera never tilts: it stays put while the city sinks)
const RAMP = [C.black, C.ink, C.navy, C.purple, C.magenta, C.pink, C.orange, C.yellow, C.cream];
const STEP = 0.3; // the dithered share of each step

/** A value on the dusk ramp through the screen's matrix: flat steps, short dithered edges (w: the
 * dithered share of a step; narrower where the value changes slowly, so no edge is a wide checkerboard). */
function qv(v, x, y, w = STEP) {
  if (v <= 0) return RAMP[0];
  if (v >= 8) return RAMP[8];
  const k = v | 0;
  const f = v - k;
  const t = f <= 1 - w ? 0 : (f - (1 - w)) / w;
  return RAMP[k + (ditherAt(x, y) < t * 16 ? 1 : 0)];
}

/** The hour: 0 the golden hour, 1 the blue hour (a time-lapse: linear in time). */
const hourAt = (b) => clamp(b / 8.5, 0, 1.25);
const SUN_X = 258;
const SUN_R = 9;
const sunY = (b) => 90 + 9.5 * b;

const SKY = new Float32Array(W * H);
const GLOW = new Float32Array(W * H); // the sun's share of it
const EDGE_W = new Float32Array(H); // per row: the dithered share of a step (about 5 px of dither)
function airField(b) {
  const u = hourAt(b);
  const top = lerp(2.75, 0.75, Math.min(1, u)) - Math.max(0, u - 1) * 1.2;
  const hor = lerp(7.5, 3.4, Math.min(1, u)) - Math.max(0, u - 1) * 2;
  const hs = lerp(72, 36, Math.min(1, u));
  const glow = lerp(2.1, 0.7, Math.min(1, u));
  const reach = lerp(30, 46, Math.min(1, u));
  const sy = sunY(b);
  for (let y = 0; y < H; y++) {
    const h = HZ - y;
    const base = h >= 0 ? top + (hor - top) * Math.exp(-h / hs) : hor - (y - HZ) * 0.09;
    const slope = h > 0 ? ((hor - top) * Math.exp(-h / hs)) / hs : 0.09;
    EDGE_W[y] = clamp(5 * slope, 0.08, STEP);
    const row = y * W;
    const dy = y - sy;
    for (let x = 0; x < W; x++) {
      const dx = (x - SUN_X) * 0.8;
      const d = Math.sqrt(dx * dx + dy * dy);
      const g = glow * Math.exp(-d / reach);
      GLOW[row + x] = g;
      SKY[row + x] = base + g;
    }
  }
  return u;
}

// ---------------------------------------------------------------------------------------------
// The city: layers of silhouettes in material codes, baked once, each moving in whole pixels with
// the camera at its own rate. Their colours come from the air at the pixel each lands on.

const M = { body: 1, top: 2, right: 3, left: 4, glass: 5, fin: 6, crown: 7, beacon: 8, door: 9, skylight: 10 };
const LIT = [C.yellow, C.cream, C.tan];

class Strata {
  constructor({ w, h, sx, sy, x0, y0, tone, seed }) {
    Object.assign(this, { w, h, sx, sy, x0, y0, tone });
    this.mat = new Uint8Array(w * h);
    this.win = []; // [x, y, w, h, on (beats), colour]
    this.rand = rng(seed);
  }
  set(x, y, m) {
    if (x >= 0 && x < this.w && y >= 0 && y < this.h) this.mat[y * this.w + x] = m;
  }
  get(x, y) {
    return x >= 0 && x < this.w && y >= 0 && y < this.h ? this.mat[y * this.w + x] : 0;
  }
  rect(x, y, w, h, m = M.body) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, m);
  }
  /** Outline every body's silhouette: roof lines and both flanks (lit by the sun's side). */
  edges() {
    const { w, h, mat } = this;
    const out = mat.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const m = mat[y * w + x];
        if (m !== M.body && m !== M.glass && m !== M.fin) continue;
        if (y > 0 && mat[(y - 1) * w + x] === 0) out[y * w + x] = M.top;
        else if (x + 1 < w && mat[y * w + x + 1] === 0) out[y * w + x] = M.right;
        else if (x > 0 && mat[y * w + x - 1] === 0) out[y * w + x] = M.left;
      }
    }
    this.mat = out;
  }
}

/** When a window comes on: a few at the start, bursts with the chords, a trickle in between. */
function onTime(r, early = 0.08) {
  const p = r();
  if (p < early) return -1;
  const q = r();
  if (p < 0.62) {
    // a burst on a chord, the later ones bigger (two frames of spread: a burst, not a switch)
    const k = q < 0.12 ? 0 : q < 0.3 ? 1 : q < 0.62 ? 2 : 3;
    return Q.lights[k] + r() * 0.08;
  }
  if (p < 0.88) return 1 + r() * 7;
  return 99;
}

/** Office windows on a grid inside a building's body (on floors that are lit or not, as at dusk). */
function windows(L, x, top, w, base, { pc = 2, pr = 3, wh = 1, m = 1, early = 0.08, fill = 0.85, cols = [0, 0, 1, 2] } = {}) {
  const r = L.rand;
  for (let y = top + 2; y + wh <= base - 1; y += pr) {
    const floor = r(); // some floors are empty
    if (floor > fill) continue;
    const c = cols[(r() * cols.length) | 0];
    for (let xx = x + m; xx < x + w - m; xx += pc) {
      if (L.get(xx, y) !== M.body && L.get(xx, y) !== M.glass) continue;
      if (r() < 0.18) continue;
      L.win.push([xx, y, 1, wh, onTime(r, early), r() < 0.8 ? c : cols[(r() * cols.length) | 0]]);
    }
  }
}

// The far skyline: low and continuous, the haze (its few lights come on late)
function farLayer() {
  const L = new Strata({ w: 420, h: 100, sx: 0.12, sy: 0.12, x0: -8, y0: HZ - 52, tone: [3.3, 1.75, 1, 0.55], seed: 11 });
  const base = 60;
  for (let x = 0; x < L.w; ) {
    const w = 4 + ((L.rand() * 12) | 0);
    const h = 5 + ((L.rand() ** 1.6 * 24) | 0);
    L.rect(x, base - h, w, L.h - base + h);
    if (L.rand() < 0.2) L.rect(x + (w >> 1), base - h - 3 - ((L.rand() * 4) | 0), 1, 4);
    if (L.rand() < 0.25) L.rect(x + 1, base - h - 2, w - 2, 2);
    x += w - ((L.rand() * 2) | 0);
  }
  for (let i = 0; i < 160; i++) {
    const x = (L.rand() * L.w) | 0;
    const y = 30 + ((L.rand() * 28) | 0);
    if (L.get(x, y) && L.get(x, y - 2)) L.win.push([x, y, 1, 1, 3 + L.rand() * 6, L.rand() < 0.6 ? 2 : 1]);
  }
  return L;
}

// The middle distance: offices of every height, flat tops with plant, setbacks, pitched roofs, tanks
function midLayer() {
  const L = new Strata({ w: 470, h: 150, sx: 0.35, sy: 0.35, x0: -8, y0: HZ - 76, tone: [2.2, 1.1, 0.55, 0.3], seed: 23 });
  const base = 100;
  const shapes = [];
  for (let x = 0; x < L.w; ) {
    const w = 9 + ((L.rand() * 18) | 0);
    const h = 18 + ((L.rand() ** 1.3 * 52) | 0);
    const kind = L.rand();
    const top = base - h;
    L.rect(x, top, w, L.h - top);
    if (kind < 0.3) {
      // a setback: a narrower tier on top
      const tw = Math.max(5, w - 4 - ((L.rand() * 6) | 0));
      const th = 4 + ((L.rand() * 9) | 0);
      L.rect(x + ((w - tw) >> 1), top - th, tw, th);
      shapes.push([x, top - th, w, base]);
    } else if (kind < 0.45) {
      // a pitched roof
      for (let i = 0; i < (w >> 1); i++) L.rect(x + i, top - Math.min(i, 6), w - 2 * i, 1);
      shapes.push([x, top, w, base]);
    } else {
      shapes.push([x, top, w, base]);
      // plant on the roof: a tank on legs, a box, a mast
      const t = L.rand();
      if (t < 0.3) {
        const tx = x + 2 + ((L.rand() * (w - 6)) | 0);
        L.rect(tx, top - 5, 3, 3);
        L.set(tx + 1, top - 6, M.body);
        L.set(tx, top - 2, M.body);
        L.set(tx + 2, top - 2, M.body);
        L.set(tx, top - 1, M.body);
        L.set(tx + 2, top - 1, M.body);
      } else if (t < 0.6) L.rect(x + 1 + ((L.rand() * (w - 5)) | 0), top - 2, 3 + ((L.rand() * 3) | 0), 2);
      else if (t < 0.75) L.rect(x + (w >> 1), top - 6, 1, 6);
    }
    x += w + (L.rand() < 0.3 ? 1 + ((L.rand() * 3) | 0) : -((L.rand() * 3) | 0));
  }
  for (const [x, top, w, b] of shapes) windows(L, x, top, w, b, { pc: L.rand() < 0.5 ? 2 : 3, pr: 3, early: 0.05, cols: [0, 0, 1, 2] });
  L.edges();
  return L;
}

// The towers: drawn one by one (art-deco setbacks and a spire, a glass slab cut at a slant, a bullet,
// a pyramid top, and the tallest, centre stage when the camera stops: glass, a stepped crown that
// lights up at dusk and a mast with a strobe)
const HERO = { x: 282, w: 34, top: 26 }; // in the layer: at screen x 192 +- 17 when the camera stops (x0 - 0.6 * 100)
function heroLayer() {
  const L = new Strata({ w: 500, h: 200, sx: 0.6, sy: 0.6, x0: -30, y0: -8, tone: [1.3, 0.6, 0.25, 0.12], seed: 37 });
  const base = 200;
  const tower = (x, w, top, fn) => {
    L.rect(x, top, w, base - top);
    fn?.(x, w, top);
  };
  // art deco: three setbacks and a spire
  tower(14, 26, 66, (x, w, top) => {
    L.rect(x + 4, top - 10, w - 8, 10);
    L.rect(x + 8, top - 18, w - 16, 8);
    L.rect(x + 11, top - 24, w - 22, 6);
    L.rect(x + 12, top - 36, 2, 12);
    L.rect(x + 12.5 | 0, top - 40, 1, 4);
    windows(L, x, top, w, base - 30, { pc: 2, pr: 3, early: 0.06 });
    windows(L, x + 4, top - 10, w - 8, top, { pc: 2, pr: 3, early: 0.06 });
  });
  // a glass slab cut at a slant
  tower(62, 22, 74, (x, w, top) => {
    for (let i = 0; i < w; i++) L.rect(x + i, top - Math.round(i * 0.6), 1, Math.round(i * 0.6));
    for (let y = top - 12; y < base; y++) for (let i = 1; i < w; i += 3) if (L.get(x + i, y)) L.set(x + i, y, M.fin);
    windows(L, x, top, w, base - 30, { pc: 3, pr: 2, wh: 1, m: 2, early: 0.04, fill: 0.7, cols: [1, 1, 0] });
  });
  // a bullet: rounded top
  tower(118, 28, 88, (x, w, top) => {
    const r = w / 2;
    for (let i = 0; i < w; i++) {
      const dx = i + 0.5 - r;
      const hh = Math.round(Math.sqrt(Math.max(0, r * r - dx * dx)) * 1.3);
      L.rect(x + i, top - hh, 1, hh);
    }
    windows(L, x, top - 8, w, base - 30, { pc: 2, pr: 3, m: 3, early: 0.06, cols: [0, 1] });
  });
  // a low block in front of the glass slab
  tower(88, 30, 128, (x, w, top) => windows(L, x, top, w, base - 10, { pc: 2, pr: 3, early: 0.1 }));
  // a slab with a notch (left of the tallest)
  tower(206, 24, 92, (x, w, top) => {
    L.rect(x + 3, top - 6, 7, 6);
    L.rect(x + w - 6, top - 3, 3, 3);
    windows(L, x, top - 6, w, base - 30, { pc: 2, pr: 3, early: 0.08 });
  });
  tower(236, 18, 112, (x, w, top) => windows(L, x, top, w, base - 20, { pc: 2, pr: 3, early: 0.1, cols: [2, 0] }));
  // the tallest: glass, a stepped crown, a mast and its strobe
  tower(HERO.x - (HERO.w >> 1), HERO.w, HERO.top + 22, (x, w, top) => {
    L.rect(x + 3, top - 8, w - 6, 8);
    L.rect(x + 7, top - 15, w - 14, 7);
    L.rect(x + 11, top - 20, w - 22, 5);
    L.rect(x + (w >> 1), top - 30, 1, 10);
    // the curtain wall: fins every 3 px, a spandrel every 4
    for (let y = top; y < base; y++) {
      for (let i = 0; i < w; i++) {
        if (i % 3 === 1 && y % 4 !== 0) L.set(x + i, y, M.glass);
      }
    }
    windows(L, x, top, w, base - 16, { pc: 3, pr: 4, wh: 2, m: 1, early: 0.1, fill: 0.95, cols: [0, 0, 1] });
  });
  // the pyramid top
  tower(330, 26, 82, (x, w, top) => {
    for (let i = 0; i < 13; i++) L.rect(x + i, top - i, w - 2 * i, 1);
    L.rect(x + 12, top - 18, 2, 5);
    windows(L, x, top, w, base - 30, { pc: 2, pr: 3, early: 0.06 });
  });
  tower(368, 20, 104, (x, w, top) => windows(L, x, top, w, base - 20, { pc: 2, pr: 3, early: 0.08, cols: [0, 2] }));
  tower(400, 30, 70, (x, w, top) => {
    L.rect(x + 5, top - 8, w - 10, 8);
    L.rect(x + 14, top - 16, 2, 8);
    for (let y = top; y < base; y++) for (let i = 2; i < w; i += 4) if (L.get(x + i, y)) L.set(x + i, y, M.fin);
    windows(L, x, top, w, base - 30, { pc: 2, pr: 3, early: 0.06, cols: [1, 0] });
  });
  tower(446, 22, 96, (x, w, top) => windows(L, x, top, w, base - 20, { pc: 3, pr: 3, early: 0.08 }));
  tower(472, 26, 120, (x, w, top) => windows(L, x, top, w, base - 20, { pc: 2, pr: 3, early: 0.08 }));
  L.edges();
  // the crown's floodlights (on at dusk) and the strobe, after the edges so they stay
  const hx = HERO.x - (HERO.w >> 1);
  const ht = HERO.top + 22;
  for (const [x, y, w] of [[hx + 3, ht - 8, HERO.w - 6], [hx + 7, ht - 15, HERO.w - 14], [hx + 11, ht - 20, HERO.w - 22]]) L.rect(x, y, w, 1, M.crown);
  L.set(hx + (HERO.w >> 1), ht - 30, M.beacon);
  return L;
}

// The rooftops under the camera: parapets, a water tower on its legs, plant, a stair house with its
// door lit, a mast; it sinks out of the frame as the camera rises
function nearLayer() {
  const L = new Strata({ w: 560, h: 110, sx: 1, sy: 1, x0: -10, y0: 130, tone: [0.2, 0.1, 0, 0], seed: 53 });
  const roof = [[0, 50], [70, 44], [150, 54], [205, 40], [300, 48], [380, 38], [470, 46]];
  for (let i = 0; i < roof.length; i++) {
    const [x, y] = roof[i];
    const x1 = i + 1 < roof.length ? roof[i + 1][0] : L.w;
    L.rect(x, y, x1 - x, L.h - y);
    L.rect(x, y - 2, x1 - x, 1); // the parapet's coping on its posts
    for (let p = x; p < x1; p += 9) L.rect(p, y - 2, 2, 2);
  }
  // plant boxes and vents
  for (const [x, y, w, h] of [[20, 44, 10, 6], [96, 38, 6, 6], [118, 36, 14, 8], [236, 34, 8, 6], [330, 40, 12, 8], [520, 38, 9, 7]]) L.rect(x, y, w, h);
  // the water tower: a tank with a conical cap on four braced legs
  const wx = 420;
  L.rect(wx, 18, 14, 12);
  for (let i = 0; i < 4; i++) L.rect(wx + 1 + i, 17 - i, 12 - 2 * i, 1);
  L.rect(wx + 6, 12, 2, 2);
  for (const lx of [wx + 1, wx + 11]) L.rect(lx, 30, 2, 8);
  L.rect(wx + 1, 33, 12, 2);
  // a stair house with its lit door, and a mast
  L.rect(262, 28, 16, 12);
  L.rect(286, 26, 2, 14);
  L.edges();
  L.rect(268, 33, 3, 7, M.door);
  // skylights lit from the offices under them (2 px at least: this layer is the fastest)
  for (const [x, y, w] of [[34, 56, 8], [100, 50, 6], [168, 60, 10], [318, 54, 6], [486, 52, 8]]) L.rect(x, y, w, 2, M.skylight);
  return L;
}

let LAYERS = null;
const layers = () => (LAYERS ??= [farLayer(), midLayer(), heroLayer(), nearLayer()]);

// The camera: a steady track to the right (already moving at the cut in) and a rise that settles
// (the towers' 1 px windows never move two frames running: under half a pixel a frame; the
// rooftops, the fastest, carry nothing thinner than 2 px)
const CAM_X = track([[-4, -50], [0, 0], [8, 100], [12, 150]]);
// everything that slides steps 15 times a second: a layer's x and y (and a cloud) change on the same
// frame, never on two frames running (a 1 px window on a diagonal would light a pixel for one frame)
const stepped = (b) => Math.floor(b * BEAT * 15 + 1e-6) / 15 / BEAT;
const CAM_H = track([[-2, -8], [0, 0], [4.5, 26], [8, 34], [10, 35]]);

// Clouds: thin bars lit from below, streaming left in the time-lapse
const CLOUDS = [
  { x: 60, y: 64, len: 150, t: 7, v: 8 },
  { x: 290, y: 46, len: 180, t: 8, v: 6 },
  { x: 190, y: 92, len: 96, t: 5, v: 11 },
  { x: 440, y: 106, len: 120, t: 5, v: 13 },
];

function drawAir(L, b, u) {
  const d = L.d;
  for (let y = 0; y < H; y++) {
    const row = y * W;
    if (y < HZ) for (let x = 0; x < W; x++) d[row + x] = qv(SKY[row + x], x, y, EDGE_W[y]);
    else {
      // under the horizon: the far city's haze (the far skyline's own tone, a shade darker)
      const v = lerp(3.3, 1.75, Math.min(1, u)) - 0.3 + lerp(1.3, 0.6, Math.min(1, u)) * Math.exp(-(y - HZ) / 16);
      for (let x = 0; x < W; x++) d[row + x] = qv(v + GLOW[row + x], x, y, 0.1);
    }
  }
  // the clouds: flat-bottomed lenses streaming left, their undersides lit by the low sun, their tops
  // in shade; by the blue hour they are dark against the sky
  const lit = lerp(1.9, 0.5, Math.min(1, u));
  for (const c of CLOUDS) {
    const x0 = Math.round(c.x - c.v * stepped(b));
    for (let i = 0; i < c.len; i++) {
      const x = x0 + i;
      if (x < 0 || x >= W) continue;
      const e = Math.sin((Math.PI * (i + 0.5)) / c.len) ** 0.8;
      const th = Math.round(c.t * e + 0.2 * Math.sin(i * 0.31 + c.x));
      for (let j = 0; j < th; j++) {
        const y = c.y - j;
        const k = y * W + x;
        const up = th > 1 ? j / (th - 1) : 0; // 0 at the underside
        // the underside catches the light; the body is a shade under the sky, darker to the top
        d[k] = qv(j === 0 ? SKY[k] + lit : SKY[k] - 0.7 - 0.5 * up + 0.5 * lit * (1 - up), x, y, 0.2);
      }
    }
  }
  // the sun: a disc with a soft edge (cream at the core, yellow, orange as it sinks)
  const sy = sunY(b);
  const core = u < 0.5 ? C.cream : C.yellow;
  const rim = u < 0.5 ? C.yellow : C.orange;
  for (let y = Math.floor(sy - SUN_R - 1); y <= Math.ceil(sy + SUN_R + 1); y++) {
    if (y < 0 || y >= H) continue;
    for (let x = SUN_X - SUN_R - 1; x <= SUN_X + SUN_R + 1; x++) {
      const dist = Math.hypot(x - SUN_X, y - sy);
      const cov = SUN_R + 0.5 - dist;
      if (cov <= 0 || cov * 16 < ditherAt(x, y)) continue;
      d[y * W + x] = dist < SUN_R - 2.5 ? core : rim;
    }
  }
}

function drawStrata(L, S, b, u) {
  const d = L.d;
  const bq = stepped(b);
  const ox = Math.round(S.x0 - CAM_X(bq) * S.sx);
  const oy = Math.round(S.y0 + CAM_H(bq) * S.sy);
  const rimV = lerp(6.6, 3.2, Math.min(1, u));
  const rimOn = 1 - smoothstep(0.7, 1, u);
  const crown = b >= Q.lights[2];
  // the layer's own value (the far ones lighter: the air between), the haze along the horizon, the
  // sun's glow through it
  const [t0, t1, hzK, glK] = S.tone;
  // (the darkening comes late and quickly: a layer is never left half-dithered for long)
  const dusk = smoothstep(0.3, 0.8, u);
  const base = lerp(t0, t1, dusk);
  const haze = lerp(1.3, 0.6, dusk) * hzK;
  const strobe = ((b + 0.25) % 2) < 0.18;
  const y0 = Math.max(0, oy);
  const y1 = Math.min(H, oy + S.h);
  const x0 = Math.max(0, ox);
  const x1 = Math.min(W, ox + S.w);
  for (let y = y0; y < y1; y++) {
    const ly = y - oy;
    const lrow = ly * S.w;
    const row = y * W;
    const rowV = base + haze * Math.exp(-Math.abs(y - HZ) / 16);
    for (let x = x0; x < x1; x++) {
      const m = S.mat[lrow + x - ox];
      if (!m) continue;
      const k = row + x;
      const body = rowV + GLOW[k] * glK;
      let v = body;
      if (m === M.glass) v = body + 0.7;
      else if (m === M.fin) v = body + 1.1;
      else if (m === M.top || m === M.right || m === M.left) {
        // light wrap: the side facing the sun (and every roof line) catches it, strongest near it
        const facing = m === M.top || (m === M.right ? x < SUN_X : x > SUN_X);
        const r = facing ? (rimV - Math.abs(x - SUN_X) / 70) * rimOn : 0;
        v = Math.max(body + 0.6, r);
      } else if (m === M.crown) {
        if (crown) {
          d[k] = C.cream;
          continue;
        }
        v = body + 0.6;
      } else if (m === M.beacon) {
        if (strobe && u > 0.3) {
          d[k] = C.white;
          continue;
        }
      } else if (m === M.door) {
        d[k] = C.yellow;
        continue;
      } else if (m === M.skylight) {
        d[k] = S.mat[lrow - S.w + x - ox] !== M.skylight ? C.tan : C.tanShade; // lit from below, its far edge brighter
        continue;
      }
      d[k] = qv(v, x, y);
    }
  }
  for (const w of S.win) {
    if (b < w[4]) continue;
    const c = LIT[w[5]];
    for (let j = 0; j < w[3]; j++) {
      const y = w[1] + oy + j;
      if (y < 0 || y >= H) continue;
      for (let i = 0; i < w[2]; i++) {
        const x = w[0] + ox + i;
        if (x >= 0 && x < W) d[y * W + x] = c;
      }
    }
  }
}

// The elevated road between the middle distance and the towers: its deck and piers in silhouette,
// the traffic a time-lapse's streaks (tail lights going right on the far lane, headlights coming
// left on the near one), more of them as the evening comes on. Stepped with the layers, the streaks
// hold each pixel for two frames at least.
const ROAD = { y0: 166, k: 0.45, loop: 640 };
let TRAFFIC = null;
function traffic() {
  if (TRAFFIC) return TRAFFIC;
  const r = rng(97);
  const lane = () => {
    const out = [];
    for (let x = 0; x < ROAD.loop - 40; ) {
      const len = 6 + ((r() * 26) | 0);
      out.push([x, len, r(), r()]);
      x += len + 6 + ((r() * 18) | 0);
    }
    return out;
  };
  TRAFFIC = [lane(), lane()];
  return TRAFFIC;
}

function drawRoad(L, b, u) {
  const d = L.d;
  const bq = stepped(b);
  const ox = Math.round(-CAM_X(bq) * ROAD.k);
  const y = Math.round(ROAD.y0 + CAM_H(bq) * ROAD.k);
  if (y + 2 >= H) return;
  for (let x = 0; x < W; x++) {
    d[(y - 2) * W + x] = qv(SKY[(y - 2) * W + x] - 4.6, x, y - 2); // the parapet, lit by the city
    d[(y + 1) * W + x] = C.black;
    d[(y + 2) * W + x] = C.black;
    d[(y - 1) * W + x] = C.ink;
    d[y * W + x] = C.ink;
  }
  // piers
  for (let px = (((ox % 48) + 48) % 48) - 48; px < W; px += 48) {
    for (let yy = y + 3; yy < H; yy++) for (let i = 0; i < 3; i++) if (px + i >= 0 && px + i < W) d[yy * W + px + i] = C.black;
  }
  const busy = 0.3 + 0.6 * Math.min(1, u);
  const T = traffic();
  for (let l = 0; l < 2; l++) {
    const shift = l === 0 ? 26 * bq : -34 * bq; // px a beat, the time-lapse's pace
    const yy = y - 1 + l;
    for (const [x0, len, on, hue] of T[l]) {
      if (on > busy) continue;
      const c = l === 0 ? (hue < 0.5 ? C.orange : C.tan) : hue < 0.6 ? C.cream : C.yellow;
      const sx = ((((x0 + Math.round(shift) + ox) % ROAD.loop) + ROAD.loop) % ROAD.loop) - 40;
      for (let i = 0; i < len; i++) {
        const x = sx + i;
        if (x >= 0 && x < W) d[yy * W + x] = c;
      }
    }
  }
}

function city(L, b) {
  const u = airField(b);
  drawAir(L, b, u);
  const S = layers();
  drawStrata(L, S[0], b, u);
  drawStrata(L, S[1], b, u);
  drawRoad(L, b, u);
  drawStrata(L, S[2], b, u);
  drawStrata(L, S[3], b, u);
}

// ---------------------------------------------------------------------------------------------
// THE TOWER, close: the tallest tower's top floors and its crown against the blue hour, between two
// neighbours further off. Its offices are 4 px windows behind dark mullions and spandrels; each lit
// one is the logo's bit (yellow, its shade on the right and the foot, a cream corner), or a cooler
// or a dimmer room. The camera tilts down from the crown to the top floor; the floors go dark on the
// beat from the foot upward (the neighbours with the first), the crown's floodlights with the last,
// and the top floor closes in on one office: the bit.

const PITCH = 6;
const NCOL = 29; // window columns from x 106 (the bit's is the 15th)
const NROW = 30;
const COL0 = BIT.x - PITCH * 14;
const FACE = { x0: COL0 - 2, x1: COL0 + NCOL * PITCH }; // the face, a mullion on either edge
const TILT0 = 22; // under half a pixel a frame: the 1 px cornices never move two frames running
const TILT = track([[Q.cut - 1, TILT0 + 7.5], [Q.cut, TILT0], [Q.off[2] + 0.2, 0], [Q.off[2] + 0.6, 0]]);
const tiltAt = (b) => Math.round(TILT(stepped(b)));
// the crown's tiers over the top floor: [inset, height]; then the mast
const TIERS = [[10, 20], [26, 14], [42, 9]];
const MAST = 12;

let OFFICES = null;
function offices() {
  if (OFFICES) return OFFICES;
  const r = rng(71);
  const wave = (g, k) => g + 0.36 * k * (0.75 + 0.25 * r()); // within a beat's group, from the foot up
  const hero = [];
  for (let j = 0; j < NROW; j++) {
    // a floor is a row of offices: runs of lit windows (an open-plan office, one light for all of it)
    // between dark ones, not a scatter; how much of it is still lit varies floor to floor
    const busy = j === 0 ? 0.8 : 0.3 + 0.6 * r();
    const runs = new Int8Array(NCOL).fill(-1);
    for (let i = 0; i < NCOL; ) {
      const len = 2 + ((r() * 6) | 0);
      const tone = r() < 0.6 ? 0 : r() < 0.6 ? 1 : 2; // warm, a cooler strip light, a dim room
      const on = r() < busy;
      for (let k = 0; k < len && i < NCOL; k++, i++) runs[i] = on ? tone : -1;
      i += r() < 0.5 ? 0 : 1; // a column between offices, sometimes
    }
    for (let i = 0; i < NCOL; i++) {
      const bit = i === 14 && j === 0;
      // (now and then one office in a dark run is still on, or one in a lit run is out)
      let lit = bit ? 0 : runs[i] >= 0 ? (r() < 0.07 ? -1 : runs[i]) : r() < 0.04 ? 0 : -1;
      let off;
      if (bit) off = 99;
      else if (j >= 12) off = wave(Q.off[0], 1 - Math.min(1, (j - 12) / 16));
      else if (j >= 4) off = wave(Q.off[1], 1 - (j - 4) / 8);
      else if (j >= 1) off = Q.off[2] + 0.12 * (3 - j) * (0.75 + 0.25 * r());
      else off = Q.off[2] + 0.12 + 0.3 * (1 - Math.abs(i - 14) / 14); // the top floor closes in on the bit
      if (!bit && lit >= 0 && r() < 0.1) off = Q.cut + 0.25 + r() * (off - Q.cut - 0.25); // some leave early
      // an empty office's glass: ink, black lower down where the neighbours shade it; the sky's reflection
      // is a glint in the corner of the panes along one diagonal sheen across the face (not a scatter of
      // blue squares)
      const sheen = Math.abs(i * 0.9 - j * 1.3 - 6) < 3.2 && j < 16;
      const dark = j > 18 + ((i * 7) % 5) ? C.black : C.ink;
      const busyOne = lit === 0 && r() < 0.18 ? 1 + ((r() * 2) | 0) : 0; // someone at a desk
      hero.push({ lit, off, dark, busyOne, sheen });
    }
  }
  // the neighbours: 2 px windows on a 4 px grid, out with the first floors
  const side = [];
  for (const [x0, x1, top] of NEIGHBOURS) {
    for (let y = top + 3; y < H + TILT0; y += 4) {
      const busy = 0.25 + 0.6 * r();
      for (let x = x0 + 3; x + 2 <= x1 - 2; x += 4) {
        if (r() > busy) continue;
        side.push([x, y, r() < 0.65 ? C.yellow : r() < 0.6 ? C.cream : C.tan, Q.off[0] + r() * 0.45 - (r() < 0.2 ? 0.6 : 0)]);
      }
    }
  }
  // the far skyline at the foot and its few lights
  const far = [];
  const farLights = [];
  for (let x = 0; x < W; ) {
    const w = 5 + ((r() * 12) | 0);
    const top = 164 + ((r() * 26) | 0);
    far.push([x, w, top]);
    for (let y = top + 2; y < H; y += 3) for (let i = 1; i < w - 1; i += 2) if (r() < 0.22) farLights.push([x + i, y]);
    x += w;
  }
  OFFICES = { hero, side, far, farLights };
  return OFFICES;
}
// [x0, x1, top at the end of the tilt]: two towers further off, which the tilt moves less
const NEIGHBOURS = [[-4, 84, 96, 1, 'slant'], [300, 390, 122, -1, 'setback']]; // [.., the edge facing the tower, its roof]
const NEAR_K = 0.55;

function facade(L, b) {
  const d = L.d;
  const u = hourAt(b);
  airField(b);
  const ty = tiltAt(b);
  const O = offices();
  // the blue hour
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) d[y * W + x] = qv(SKY[y * W + x] - 0.3, x, y, EDGE_W[y]);
  // a far skyline at the foot, its lights fixed (it is far)
  const fy = Math.round(ty * 0.25);
  for (const [x0, w, top] of O.far) for (let y = Math.max(0, top + fy); y < H; y++) for (let x = x0; x < Math.min(W, x0 + w); x++) d[y * W + x] = C.black;
  if (b < Q.off[0] + 0.4) for (const [x, y] of O.farLights) if (y + fy < H) d[(y + fy) * W + x] = C.tan;
  // the neighbours: dark, an edge catching the sky, their offices
  const ny = Math.round(ty * NEAR_K);
  for (const [x0, x1, top, inner, roof] of NEIGHBOURS) {
    const t = top + ny;
    for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
      // the roof line: a slant rising to the edge nearest the tower, or a setback with a mast
      let rt = t;
      if (roof === 'slant') rt = t - Math.round(((inner > 0 ? x - x0 : x1 - 1 - x) / (x1 - x0)) * 14);
      else if (x >= x0 + 18 && x < x1 - 18) rt = t - 8;
      if (roof === 'setback' && x >= x0 + 40 && x < x0 + 42) rt = t - 22;
      const edgeX = inner > 0 ? x === x1 - 1 : x === x0;
      for (let y = Math.max(0, rt); y < H; y++) {
        let c = (x - x0) % 4 === 1 ? C.black : C.ink; // fins between the window columns
        if (edgeX || y === rt) c = C.slate;
        d[y * W + x] = c;
      }
    }
  }
  for (const [x, y, c, off] of O.side) {
    if (b >= off) continue;
    const yy = y + ny;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) if (yy + j >= 0 && yy + j < H && x + i >= 0 && x + i < W) d[(yy + j) * W + x + i] = c;
  }
  // the crown: three tiers with their floodlit cornices, a mast and its strobe
  const top = BIT.y + ty; // the top floor's window row
  const flood = b < Q.off[2];
  let y1 = top - 5;
  for (const [inset, h] of TIERS) {
    const x0 = FACE.x0 + inset;
    const x1 = FACE.x1 - inset;
    for (let y = y1 - h; y < y1; y++) {
      if (y < 0 || y >= H) continue;
      for (let x = x0; x < x1; x++) {
        let c = (x - COL0) % PITCH === 4 ? C.black : C.ink; // fins
        if (x === x0 || x === x1 - 1) c = C.slate;
        if (flood) {
          // uplights wash each tier from its foot; a lit cornice line on its top
          const up = (y1 - 1 - y) / h;
          if (y === y1 - h) c = C.cream;
          else if (up < 0.18) c = ditherAt(x, y) < (1 - up / 0.18) * 16 ? C.tan : c;
          else if (up < 0.4 && ditherAt(x, y) < (1 - (up - 0.18) / 0.22) * 6) c = C.tanShade;
        } else if (y === y1 - h) c = C.slate;
        d[y * W + x] = c;
      }
    }
    y1 -= h;
  }
  const mx = BIT.x + 1;
  for (let y = y1 - MAST; y < y1; y++) if (y >= 0 && y < H) d[y * W + mx] = d[y * W + mx + 1] = C.ink;
  if (((b + 0.25) % 2) < 0.18 && y1 - MAST - 1 >= 0) d[(y1 - MAST - 1) * W + mx] = C.white;
  // the cornice over the top floor
  for (let y = top - 5; y < top; y++) {
    if (y < 0 || y >= H) continue;
    for (let x = FACE.x0 - 2; x < FACE.x1 + 2; x++) d[y * W + x] = y === top - 5 ? C.steel : y === top - 4 ? C.slate : C.black;
  }
  // the face: offices behind dark mullions and spandrels, its edges catching the sky
  for (let y = Math.max(0, top); y < H; y++) {
    const gy = y - top;
    const j = (gy / PITCH) | 0;
    const cy = gy - j * PITCH;
    const row = y * W;
    for (let x = FACE.x0; x < FACE.x1; x++) {
      const k = row + x;
      if (x < FACE.x0 + 1 || x >= FACE.x1 - 1) {
        d[k] = C.slate;
        continue;
      }
      const gx = x - COL0;
      const i = Math.floor(gx / PITCH);
      const cx = gx - i * PITCH;
      if (cy >= 4 || cx >= 4 || i < 0 || i >= NCOL || j >= NROW) {
        d[k] = cy === 4 && cx < 4 ? C.ink : C.black;
        continue;
      }
      const o = O.hero[j * NCOL + i];
      if (o.lit < 0 || b >= o.off) {
        d[k] = o.sheen && cx + cy <= 1 ? C.navy : o.dark;
        continue;
      }
      const sh = cx === 3 || cy === 3;
      if (o.lit === 0) d[k] = o.busyOne && cx === o.busyOne && cy >= 2 ? C.tanShade : cx === 0 && cy === 0 ? C.cream : sh ? C.orange : C.yellow;
      else if (o.lit === 1) d[k] = sh ? C.tan : C.cream;
      else d[k] = sh ? C.tanShade : C.tan;
    }
  }
  return u;
}

// ---------------------------------------------------------------------------------------------
// The sequence

const SHIFT = HIT - TL.still;


let BG = null;
function before(ctx, dt) {
  const b = dt / BEAT;
  const L = LAYER;
  L.begin(0);
  if (b < Q.cut) city(L, b);
  else {
    facade(L, b);
    // the wall goes, leaving the bit on the field
    const p = seg(b, Q.last, SHIFT / BEAT - Q.last);
    if (p > 0) {
      const d = L.d;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (ditherAt(x, y) < p * 16) d[y * W + x] = 0;
      ctx.drawImage((BG ??= MONEY.background)(), 0, 0);
    }
    if (p > 0) {
      L.end(ctx);
      drawBit(ctx, BIT.x, BIT.y, 4);
      return;
    }
  }
  L.end(ctx);
}

const LAYER = new Layer('money-titles');

// the package's open from its first frame: its seed (at centre stage) gives way to the window's bit,
// which the binding opens out of
const REVEAL = {
  ...MONEY,
  absorb: -1,
  after(ctx, dt) {
    const s = Math.round(4 * (1 - seg(dt, 0.1, 0.12)));
    if (s > 0) drawBit(ctx, BIT.x + 2 - (s >> 1), BIT.y + 2 - (s >> 1), s);
  },
};
const SEQ = sequence({ hit: HIT, before, reveal: REVEAL, handAt: 0 });

/** MONEY MINUTE's title sequence at dt seconds (full frame). */
export function drawMoneyTitles(ctx, dt, info) {
  SEQ.draw(ctx, dt, info);
}

export const MONEY_TITLES = { ...MONEY, warmJobs: () => [...MONEY.warmJobs(), layers, offices, traffic] };
export const MONEY_SEQ = SEQ;
export const MONEY_BIT = BIT;

/** For checks: every office of the tower's face ({ i, j, lit, off }); the bit's is column 14 of the top floor. */
export const moneyOffices = () => offices().hero.map((o, n) => ({ i: n % NCOL, j: (n / NCOL) | 0, lit: o.lit, off: o.off }));
/** For checks: everything that slides at beat b, in whole pixels (layers, road and its traffic, clouds, the tilt). */
export function moneySlides(b) {
  const bq = stepped(b);
  const out = [];
  for (const S of layers()) out.push(Math.round(S.x0 - CAM_X(bq) * S.sx), Math.round(S.y0 + CAM_H(bq) * S.sy));
  out.push(Math.round(-CAM_X(bq) * ROAD.k), Math.round(ROAD.y0 + CAM_H(bq) * ROAD.k), Math.round(26 * bq), Math.round(-34 * bq));
  for (const c of CLOUDS) out.push(Math.round(c.x - c.v * bq));
  out.push(tiltAt(b));
  return out;
}
