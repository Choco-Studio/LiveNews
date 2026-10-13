// FULL TIME's pitchside platform (docs/programmes/full-time.md §6, build step 5): no glass, no room. The desk stands on
// a raised platform at the corner of a floodlit pitch; behind the presenters the ground, painted as a pixel artist paints
// a stadium, in a few clean layers on their own depth planes (so the camera's moves give the depth, and nothing moves
// by itself):
//   sky        the channel's sky by the hour (city.js skyPhase: night, dawn, day, golden hour, blue hour), flat bands
//              with a tall Bayer ramp between them
//   towers     four floodlight towers: a pair in the far corners, beyond the stand's ends (GROUND.far), and a pair at the
//              near corners in front of it (GROUND.near); a lattice mast and a head of lamps in four banks; at night
//              static posterised halos; at dusk the banks come on one at a time as the sky reddens; by day off
//   stand      the far stand (GROUND.stand.Z): the roof's fascia and its dark underside, the upper tier dark with rows
//              of empty seats, aisles and a few lit exits, the balcony, the lower tier holding a still crowd at low
//              contrast (heads as a two-tone texture over their shoulders, a few muted scarves; never animated), the
//              pitch-side wall; in the open corners a low terrace under the towers
//   scoreboard on a gantry over the stand's roof, in the slot above the hero screen: an LED board showing the channel's
//              clock (the lit digits are live.js's layer, turning over each minute), a plain orange pennant on a pole
//              beside it (three frames, slow; live.js)
//   boards     the advertising boards along the far touchline: unlit black panels and, every few metres, the channel's
//              orange band with FULL TIME in dark type (no brand), shown whole or not at all, never behind a person
//   pitch      the striped pitch from the boards to the platform's edge, in true perspective: mowing stripes running to
//              the vanishing point (flat darkGreen, the stripe mown away from the light a Bayer step down toward ink,
//              mirrored about the halfway line), the halfway line
// Out of focus (cam.soft: the singles) the ground is the same ground with its fine detail gone: the crowd a flat tone,
// the pitch flat, no lines, no text, the lamps a step dimmer.
//
//   groundKey()                       the hour's state as a number (phase * 8 + banks lit): the background cache key
//   drawGround(fr, cam, box, soft, guard)   box: the screen rect to fill (the open back of the set)
//   LIVE_DRAW['full-time']            the scoreboard's digits and the pennant
import { C } from '../pixbuf.js';
import { F, SET } from './geometry.js';
import { SKYTIME, skyPhase } from './city.js';
import { LIVE_DRAW } from './live.js';
import { L_OF } from './light.js';
import { textPixels } from '../../../font.js';

const W = 384, H = 216;
const B16 = Uint8Array.from([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]);
const bay16 = (x, y) => B16[((y & 3) << 2) | (x & 3)];

// --------------------------------------------------------------------------- geometry (world units, Y down)
export const GROUND = {
  canopyY: -129, // the canopy's fascia on the set plane (dressing.js draws it; the network's soffit line)
  // the pitch's surface (the platform's deck is SET.floorY: raised 68 above it). Its level sets the boards' row: in the
  // wide just under the screen's foot (the screen hides the band between the presenters, so the wide carries two bands
  // and the screen's emblem, not four FULL TIMEs), in the network's two-shot clear above the presenters' crowns
  pitchY: 120,
  stand: {
    Z: 6000,
    half: 800, // the stand's ends (world X): beyond them the open corners, a low terrace under the towers
    roof: -186, // the roof's fascia top
    fascia: -174, // the fascia's foot (its underside below, dark)
    under: -162, // the underside's foot: the upper tier starts
    balcony: -102, // the balcony front (the upper tier's foot)
    lower: -90, // the lower tier's top
    corner: -26, // the corner terraces' top
    wall: 82, // the lower tier's foot: the pitch-side wall below
    exits: [-700, 700], // lit exits (vomitories) in the upper tier, world X (clear of every head in every framing)
    seat: 6, // world units per pixel of a seat at scale 1 (a seat is 2 x 3 such pixels)
    aisle: 16, // a stair every 16 seats
  },
  boards: { Z: 5700, top: 80, every: 400, pad: 3 }, // FULL TIME bands at X = 0, ±400, ±800... (clear of the near masts)
  board: { Z: 6000, X: 0, Y0: -336 }, // the scoreboard (wide: y 6-12, a row of sky above and below it, over the screen)
  pennant: { X: 102, top: -336 }, // its pole beside the board (the cloth is live)
  stripe: 240, // mowing stripe width
  touch: 5640, // the far touchline's Z (just in front of the boards)
  // the towers: X, Z, head centre Y, lamp grid (cols x 4 banks), lamp pitch (units), halo radius (units), mast width
  far: { X: 925, Z: 6400, Y: -186, cols: 3, pitch: 6.4, gapless: true, gapx: true, halo: 50, mast: 6.4, far: true },
  // (the near pair close enough that their feet are behind the desk in the wide: never a mast standing on the pitch)
  near: { X: 476, Z: 2800, Y: -111, cols: 5, pitch: 5.6, gapless: false, halo: 34, mast: 8.4 },
};

// --------------------------------------------------------------------------- the hour
/** The hour (0-24, London) from the studio clock (setSkyClock) or the fixed hour. */
export function groundHour() {
  let h = SKYTIME.hour;
  if (SKYTIME.clock) {
    try {
      const v = SKYTIME.clock();
      if (Number.isFinite(v)) h = v;
    } catch {
      /* a broken clock keeps the fixed hour */
    }
  }
  return ((h % 24) + 24) % 24;
}
/**
 * Floodlight banks lit (0-4) for a phase and hour: all at night and in the blue hour; at the golden hour one bank
 * comes on every 24 minutes from 17:00 as the sky reddens; none by day or at dawn (never a night ground at breakfast).
 */
export function banksLit(phase, h) {
  if (phase === 0 || phase === 4) return 4;
  if (phase === 3) return Math.max(0, Math.min(4, Math.floor((h - 17) / 0.4)));
  return 0;
}
const STATE = { key: 0 };
/** The hour's state, phase * 8 + banks lit (set.js puts it in the background cache key, once per frame). */
export function groundKey() {
  const phase = skyPhase();
  STATE.key = phase * 8 + banksLit(phase, groundHour());
  return STATE.key;
}

// --------------------------------------------------------------------------- the palettes by phase
// names → u32 (arrays kept). pitch: [stripe A, stripe B] as a Bayer share (-16..16) over darkGreen: > 0 toward green,
// < 0 toward ink
const pal = (o) => {
  const out = {};
  for (const [k, v] of Object.entries(o)) out[k] = Array.isArray(v) ? v.map((n) => (typeof n === 'string' ? C[n] : n)) : typeof v === 'string' && C[v] !== undefined ? C[v] : v;
  return out;
};
const NIGHT = { sky: ['ink', 'ink', 'ink', 'navy'], town: 'black', roof: 'ink', roofEdge: 'slate', under: 'black', seatBg: 'black', seat: 'ink', exit: 'tan', exitEdge: 'brown', balcony: 'ink', balconyEdge: 'slate', crowdBg: 'ink', step: 'black', heads: ['slate', 'steel'], softSky: 'ink', softTier: 'ink', softHead: 'slate', body: 'black', scarves: ['maroon', 'brown', 'purple', 'navy'], wall: 'black', board: 'black', boardEdge: 'ink', pitch: [0, -4], line: 'steel', tower: 'slate', towerDark: 'ink', head: 'steel', lamp: 'white', lampOff: 'slate', halo: ['steel', 'slate', 'ink'], band: 'orange', pole: 'steel' };
const PALS = [
  // night: a black sky, the floodlit pitch, the stand dark with its lower tier in the spill
  pal(NIGHT),
  // dawn: the night lifting behind the stand, the ground cold and in shadow, the floodlights off
  pal({ ...NIGHT, sky: ['ink', 'navy', 'purple', 'rust'], softSky: 'navy', town: 'black', roofEdge: 'purple', exit: 'ink', exitEdge: 'black', heads: ['slate', 'slate'], pitch: [0, -7], line: 'slate', tower: 'ink', towerDark: 'black', head: 'ink', lamp: 'slate', halo: null, band: 'rust', pole: 'slate' }),
  // day: the stand in sun and shadow (the roof shades the upper tier, the sun on the lower), the pitch in the sun
  pal({ ...NIGHT, sky: ['navy', 'steel', 'steel', 'fog'], softSky: 'steel', town: 'slate', roof: 'slate', roofEdge: 'fog', exit: 'black', exitEdge: 'ink', balcony: 'slate', balconyEdge: 'steel', crowdBg: 'slate', step: 'ink', heads: ['steel', 'ink'], softTier: 'slate', softHead: 'steel', body: 'ink', wall: 'ink', boardEdge: 'slate', pitch: [0, -3], line: 'fog', tower: 'steel', towerDark: 'slate', head: 'fog', lamp: 'fog', lampOff: 'fog', halo: null, pole: 'fog' }),
  // the golden hour: the sky reddening behind the stand, its roof catching the last light, the banks coming on
  pal({ ...NIGHT, sky: ['navy', 'purple', 'darkRed', 'rust'], softSky: 'purple', town: 'maroon', roofEdge: 'rust', balcony: 'maroon', balconyEdge: 'brown', heads: ['brown', 'slate'], boardEdge: 'maroon', pitch: [0, -4] }),
  // the blue hour: the last light a purple band over the roof, every bank on
  pal({ ...NIGHT, sky: ['ink', 'navy', 'navy', 'purple'], softSky: 'navy' }),
];
export const PHASE_PALS = PALS;

// out of focus: each light a step dimmer, the bright lines gone
const MUTE = new Map([['white', 'silver'], ['silver', 'fog'], ['fog', 'steel'], ['steel', 'slate'], ['orange', 'brown'], ['rust', 'brown'], ['tan', 'tanShade'], ['cream', 'tan']].map(([a, b]) => [C[a] >>> 0, C[b]]));
const mute = (c) => MUTE.get(c >>> 0) ?? c;

// --------------------------------------------------------------------------- helpers
const hash = (a, b, c = 0) => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35) ^ Math.imul(c + 0x27d4eb2f, 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
};
const kOf = (cam, Z) => (F * cam.zoom) / (Z - cam.z);
const lOf = (c) => L_OF.get(c >>> 0) ?? 50;
const mod = (a, n) => ((a % n) + n) % n;
/** The left edge of a w px wide object centred at screen x cx, rounded symmetrically about the frame's centre line
 *  (a pair at ±X lands on mirrored pixels: a plain round() breaks its .5 ties the same way on both sides). */
const symX0 = (cx, w) => {
  const off = cx - 192, a = Math.round(Math.abs(off) - w / 2);
  return off >= 0 ? 192 + a : 192 - a - w;
};

// the frame's clip box (the open back of the set) and its pixels
const BOX = { x0: 0, y0: 0, x1: W, y1: H };
let PX = null;
function fill(x0, y0, x1, y1, c) {
  x0 = Math.max(BOX.x0, Math.round(x0));
  x1 = Math.min(BOX.x1, Math.round(x1));
  y0 = Math.max(BOX.y0, Math.round(y0));
  y1 = Math.min(BOX.y1, Math.round(y1));
  if (x1 <= x0) return;
  for (let y = y0; y < y1; y++) PX.fill(c, y * W + x0, y * W + x1);
}
const put = (x, y, c) => {
  if (x >= BOX.x0 && x < BOX.x1 && y >= BOX.y0 && y < BOX.y1) PX[y * W + x] = c;
};
/** Paint c only over a darker pixel (a light never darkens what it falls on). */
const lift = (x, y, c) => {
  if (x < BOX.x0 || x >= BOX.x1 || y < BOX.y0 || y >= BOX.y1) return;
  const o = y * W + x;
  if (lOf(PX[o]) < lOf(c)) PX[o] = c;
};

// what the scoreboard and the pennant need from the last drawn frame (live.js draws them over the cached set)
export const LIVE_STATE = { board: null, pennant: null, pal: PALS[0] };

// heads and bodies of the seated presenters for a camera (screen px, with a 6 px margin): no sign behind a person
function peopleBoxes(cam) {
  const kp = kOf(cam, SET.presenterZ);
  const s = Math.max(0.5, Math.round(22 * kp) / 22);
  const out = [];
  for (const X of [SET.seatX.A, SET.seatX.B]) {
    const x = 192 + (X - cam.x) * kp, y = cam.hy + (SET.neckY - cam.y) * kp;
    out.push({ x0: x - 36 * s - 6, x1: x + 36 * s + 6, y0: y - 30 * s - 6, y1: H });
  }
  return out;
}
const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

// --------------------------------------------------------------------------- the sky and the town beyond
// The channel's sky by the hour: the city's four bands (city.js PHASES) at the city's heights above the horizon (px at
// zoom 1: the top colour above 38, then 19, then 7, the last light below), each change a Bayer ramp up to 10 px tall
// (never more than 45 % of the way to the next change). The horizon sits at the camera's eye height; through the open
// corners, below it, the town beyond the ground: a low roofline in one flat colour.
const SKY_E = [38, 19, 7];
const RAMP = 5;
function skyAt(s, h, x, y, rw) {
  for (let i = 0; i < 3; i++) {
    const t = SKY_E[i], hw = rw[i];
    if (h > t + hw) return s[i];
    if (h > t - hw) return s[i] === s[i + 1] ? s[i] : (t + hw - h) / (2 * hw) * 16 > bay16(x, y) ? s[i + 1] : s[i];
  }
  return s[3];
}
const RW = new Float64Array(3);
function sky(cam, P, yEnd, soft) {
  // out of focus the bands melt into one flat tone (no band edge crossing behind a head in a single)
  if (soft) {
    fill(BOX.x0, BOX.y0, BOX.x1, yEnd, P.softSky);
    return;
  }
  const s = P.sky, z = cam.zoom;
  for (let i = 0; i < 3; i++) {
    const up = i === 0 ? 60 : SKY_E[i - 1] - SKY_E[i], down = i === 2 ? SKY_E[2] : SKY_E[i] - SKY_E[i + 1];
    RW[i] = Math.max(0.5 / z, Math.min(RAMP / z, 0.45 * Math.min(up, down)));
  }
  for (let y = BOX.y0; y < Math.min(BOX.y1, yEnd); y++) {
    const h = (cam.hy - (y + 0.5)) / z;
    const row = y * W;
    // a row outside every ramp is one colour (filled at once); a ramp's share within 2/16 of an end snaps flat
    let flat = -1;
    for (let i = 0; i < 3; i++) if (Math.abs(h - SKY_E[i]) < RW[i] && s[i] !== s[i + 1]) flat = i;
    if (flat < 0) {
      PX.fill(skyAt(s, h, 0, y, RW), row + BOX.x0, row + BOX.x1);
      continue;
    }
    const t = SKY_E[flat], hw = RW[flat];
    let q = Math.round(((t + hw - h) / (2 * hw)) * 16);
    if (q <= 2 || q >= 14) {
      PX.fill(q >= 14 ? s[flat + 1] : s[flat], row + BOX.x0, row + BOX.x1);
      continue;
    }
    const a = s[flat], b = s[flat + 1];
    for (let x = BOX.x0; x < BOX.x1; x++) PX[row + x] = q > bay16(x, y) ? b : a;
  }
}
// the town's roofline (on a far plane, the horizon at the eye): blocks 160-320 units wide, 30-160 units over the horizon
const TOWN = { Z: 24000 };
function town(cam, P, yEnd) {
  const k = kOf(cam, TOWN.Z);
  const yh = cam.hy;
  for (let x = BOX.x0; x < BOX.x1; x++) {
    const X = cam.x + (x + 0.5 - 192) / k;
    // the block under this column: seeded widths along the line
    const cell = Math.floor(Math.abs(X) / 240); // mirrored about the ground's centre line, as the set
    const hgt = 30 + hash(cell, 3, 77) * 130;
    const y0 = Math.max(BOX.y0, Math.round(yh - hgt * k));
    for (let y = y0; y < Math.min(BOX.y1, yEnd); y++) PX[y * W + x] = P.town;
  }
}

// --------------------------------------------------------------------------- the floodlight towers
const TOWERS = [];
for (const t of [GROUND.far, GROUND.near]) for (const sx of [-1, 1]) TOWERS.push({ ...t, X: sx * t.X, kind: t === GROUND.far ? 'far' : 'near' });
export const TOWER_LIST = TOWERS;

/** A tower's head (screen rect) for a camera: { x0, y0, w, h, s, lw, gap, cx, cy, R, k }. */
export function towerHead(cam, t) {
  const k = kOf(cam, t.Z);
  const s = Math.max(1, Math.round(k * t.pitch * (t.gapless ? 1 : 0.5)));
  // (gapx: the far heads' lamp columns apart, the banks' rows touching: a lamp grid at one pixel a lamp)
  const lw = s, gap = t.gapless ? 0 : s, gx = t.gapx ? s : gap;
  const w = t.cols * lw + (t.cols - 1) * gx + 2 * s, h = 4 * lw + 3 * gap + 2 * s;
  const cx = 192 + (t.X - cam.x) * k, cy = cam.hy + (t.Y - cam.y) * k;
  const x0 = symX0(cx, w), y0 = Math.round(cy - h / 2);
  return { x0, y0, w, h, s, lw, gap, gx, cx: x0 + w / 2, cy: y0 + h / 2, R: t.halo * k, k };
}

function towerMast(cam, t, hd, P, soft) {
  const k = hd.k;
  const mw = Math.max(1, Math.round(t.mast * k));
  const x0 = symX0(hd.cx, mw);
  const yBase = Math.round(cam.hy + (GROUND.pitchY - cam.y) * k);
  const y0 = hd.y0 + hd.h;
  const c = P.tower, d = P.towerDark;
  if (mw < 3 || soft) {
    fill(x0, y0, x0 + mw, yBase, soft ? d : c);
    return;
  }
  // a lattice: two rails (the one toward the pitch lit by its light, so the pair mirrors), a rung every 4 px and a
  // diagonal brace between (whole pixels)
  for (let y = y0; y < yBase; y++) {
    put(x0, y, t.X < 0 ? d : c);
    put(x0 + mw - 1, y, t.X < 0 ? c : d);
    const r = (y - y0) % 4;
    if (r === 0) for (let x = x0 + 1; x < x0 + mw - 1; x++) put(x, y, d);
    else put(x0 + 1 + ((r - 1) % Math.max(1, mw - 2)), y, d);
  }
}

function towerHeadDraw(t, hd, P, banks, soft) {
  const { x0, y0, w, h, s, lw, gap, gx } = hd;
  // the housing (its top catching the light), then the lamps: bank j (from the top) lit when j < banks
  fill(x0, y0, x0 + w, y0 + h, P.towerDark);
  if (!soft) fill(x0, y0, x0 + w, y0 + s, P.head);
  for (let j = 0; j < 4; j++) {
    // (the far heads a step dimmer: distance)
    const c = j < banks ? (soft || t.far ? mute(P.lamp) : P.lamp) : P.lampOff;
    for (let i = 0; i < t.cols; i++) {
      const lx = x0 + s + i * (lw + gx), ly = y0 + s + j * (lw + gap);
      fill(lx, ly, lx + lw, ly + lw, c);
    }
  }
}

/** A static halo round a lit head: posterised rings that only lift darker pixels (no Bayer fringe, never moving). */
function halo(hd, P, banks, soft) {
  if (!P.halo || banks <= 0) return;
  const R = hd.R * (0.55 + 0.45 * (banks / 4)) * (soft ? 1.2 : 1);
  const [c0, c1, c2] = P.halo;
  const cx = hd.cx, cy = hd.cy;
  for (let y = Math.floor(cy - R - 1); y <= Math.ceil(cy + R + 1); y++) {
    for (let x = Math.floor(cx - R - 1); x <= Math.ceil(cx + R + 1); x++) {
      if (x >= hd.x0 && x < hd.x0 + hd.w && y >= hd.y0 && y < hd.y0 + hd.h) continue; // the head itself
      const d = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.15) / R;
      if (d >= 1) continue;
      lift(x, y, d < 0.5 ? c0 : d < 0.74 ? c1 : c2);
    }
  }
}

// --------------------------------------------------------------------------- the stand
/**
 * The seats of the crowd, seeded once: per seat (column from the stand's centre line, mirrored, so the stand is
 * symmetric like the set; row from the tier's top) 0 empty, else 1 + head side (0/1) + 2 * head tone (0/1), + 4 for a
 * muted scarf whose colour is bits 3-4.
 */
const SEAT_COLS = 512, SEAT_ROWS = 128;
const SEATS = new Uint8Array(SEAT_COLS * SEAT_ROWS);
for (let cy = 0; cy < SEAT_ROWS; cy++) {
  for (let cx = 0; cx < SEAT_COLS; cx++) {
    const h = hash(cx, cy, 41);
    if (h < 0.1) continue;
    SEATS[cy * SEAT_COLS + cx] = 1 + (h < 0.55 ? 0 : 1) + (h > 0.8 ? 2 : 0) + (h > 0.955 ? 4 + (Math.floor(hash(cx, cy, 7) * 4) << 3) : 0);
  }
}
/**
 * The crowd in [xa, xb) x [ya, yb): seat by seat on the stand's whole-pixel grid (a camera move carries it rigidly),
 * a seat 2 x 3 px at scale s: a head (one of two tones) over its shoulders, the step below; an empty seat its seat
 * back; a muted scarf on the shoulders now and then; a stair every 16 seats. Out of focus the heads melt into one dim
 * tone and the shoulders, scarves and seat backs into the tier.
 */
function crowd(P, xa, xb, ya, yb, ox, s, soft) {
  const cw = 2 * s, ch = 3 * s;
  const hA = soft ? P.softHead : P.heads[0], hB = soft ? P.softHead : P.heads[1];
  const aisle = GROUND.stand.aisle;
  xa = Math.max(BOX.x0, xa);
  xb = Math.min(BOX.x1, xb);
  for (let y = Math.max(BOX.y0, ya); y < Math.min(BOX.y1, yb); y++) {
    const ry = y - ya, cy = Math.min(SEAT_ROWS - 1, Math.floor(ry / ch)), iy = Math.floor((ry % ch) / s);
    const row = y * W;
    if (iy === 2) {
      if (!soft && P.step !== P.crowdBg && xb > xa) PX.fill(P.step, row + xa, row + xb); // the step under the row
      continue;
    }
    const srow = cy * SEAT_COLS;
    for (let x = xa; x < xb; x++) {
      const rx = x - ox, rm = rx >= 0 ? rx : -rx - 1; // mirrored about the stand's centre line
      const cx = Math.floor(rm / cw);
      if (cx % aisle === 0) continue; // the stair
      const v = SEATS[srow + Math.min(SEAT_COLS - 1, cx)];
      if (!v) {
        if (iy === 1 && !soft) PX[row + x] = P.seat; // an empty seat: its seat back
        continue;
      }
      if (iy === 0) {
        // the head's side, mirrored with the column
        const side = (v - 1) & 1, ix = Math.floor((rm % cw) / s);
        if (ix === side) PX[row + x] = (v - 1) & 2 ? hB : hA;
      } else if (!soft) PX[row + x] = v & 4 ? P.scarves[(v >> 3) & 3] : P.body;
    }
  }
}

function stand(cam, P, soft) {
  const G = GROUND.stand;
  const k = kOf(cam, G.Z);
  const yOf = (Y) => Math.round(cam.hy + (Y - cam.y) * k);
  const xOf = (X) => 192 + (X - cam.x) * k;
  const yRoof = yOf(G.roof), yFascia = yOf(G.fascia), yUnder = yOf(G.under), yBal = yOf(G.balcony), yLow = yOf(G.lower), yWall = yOf(G.wall);
  const yCorner = yOf(G.corner);
  const yFoot = Math.round(cam.hy + (GROUND.boards.top - cam.y) * kOf(cam, GROUND.boards.Z)) + 1;
  const xa = Math.round(xOf(-G.half)), xb = Math.round(xOf(G.half));
  const s = Math.max(1, Math.round(k * G.seat));
  const ox = Math.round(xOf(0));
  // the open corners: a low terrace of the same crowd under the towers, its back wall's top catching the light
  for (const [ca, cb] of [[BOX.x0, xa], [xb, BOX.x1]]) {
    if (cb <= ca) continue;
    fill(ca, yCorner, cb, yWall, soft ? P.softTier : P.crowdBg);
    if (!soft) fill(ca, yCorner, cb, yCorner + 1, P.balconyEdge);
    crowd(P, ca, cb, yCorner + s, yWall, ox, s, soft);
    fill(ca, yWall, cb, yFoot, P.wall);
  }
  if (xb <= BOX.x0 || xa >= BOX.x1) return;
  // the roof: its fascia (its top edge catching the light), the underside dark; the stand's ends dark. Out of focus
  // the roof, its underside and the balcony melt into the tier's one tone, and the roofline is a soft Bayer step from
  // the sky (a defocused edge, never a hard line behind a head in a single)
  fill(xa, yRoof, xb, yFascia, soft ? P.softTier : P.roof);
  if (!soft) fill(xa, yRoof, xb, yRoof + 1, P.roofEdge);
  fill(xa, yFascia, xb, yUnder, soft ? P.softTier : P.under);
  // the upper tier: rows of empty seats (a seat-back pixel in every seat, an aisle every 16 seats), dark
  const cw = 2 * s;
  fill(xa, yUnder, xb, yBal, soft ? P.softTier : P.seatBg);
  if (!soft) {
    for (let y = yUnder + s; y < yBal; y++) {
      if (Math.floor((y - yUnder) / s) % 3 !== 1) continue;
      for (let x = Math.max(BOX.x0, xa); x < Math.min(BOX.x1, xb); x++) {
        const rx = x - ox, rm = rx >= 0 ? rx : -rx - 1; // mirrored about the stand's centre line
        if (Math.floor((rm % cw) / s) !== 0 || Math.floor(rm / cw) % G.aisle === 0) continue;
        put(x, y, P.seat);
      }
    }
  }
  // the lit exits (vomitories): a small warm opening at the foot of the tier, its dark frame
  for (const X of G.exits) {
    const ex = symX0(xOf(X), 2 * s);
    fill(ex - s, yBal - 4 * s, ex + 3 * s, yBal, P.exitEdge);
    fill(ex, yBal - 3 * s, ex + 2 * s, yBal, soft ? mute(P.exit) : P.exit);
  }
  // the balcony front, its top edge
  fill(xa, yBal, xb, yLow, soft ? P.softTier : P.balcony);
  if (!soft) fill(xa, yBal, xb, yBal + 1, P.balconyEdge);
  // the lower tier: the still crowd (out of focus one dim tone)
  fill(xa, yLow, xb, yWall, soft ? P.softTier : P.crowdBg);
  crowd(P, xa, xb, yLow, yWall, ox, s, soft);
  // the stand's ends: a dark gable from the roof down to the corner terrace
  fill(xa, yRoof, xa + s, yCorner, soft ? P.softTier : P.under);
  fill(xb - s, yRoof, xb, yCorner, soft ? P.softTier : P.under);
  if (soft && P.softSky !== P.softTier) {
    const R = 3;
    for (let y = Math.max(BOX.y0, yRoof - R); y < Math.min(BOX.y1, yRoof + R); y++) {
      const q = Math.round(((yRoof + R - (y + 0.5)) / (2 * R)) * 16); // the sky's share, 16 at the top
      for (let x = Math.max(BOX.x0, xa); x < Math.min(BOX.x1, xb); x++) PX[y * W + x] = q > bay16(x, y) ? P.softSky : P.softTier;
    }
  }
  // the pitch-side wall under the tier
  fill(xa, yWall, xb, yFoot, P.wall);
}

// --------------------------------------------------------------------------- the scoreboard and the pennant
// the board's LED matrix: four 3x5 digits and a colon, a dot a pixel at the wide (whole pixels closer in), the unlit
// dots dark red-brown (an LED panel reads by its unlit dots); the lit digits are the live layer's
function scoreboard(cam, P, soft, guard) {
  const B = GROUND.board;
  const k = kOf(cam, B.Z);
  const s = Math.max(1, Math.round(k * 6));
  const dw = 17 * s; // HH:MM, a dot a column: digits at 0, 4, 10, 14, the colon at 8
  const w = dw + 4 * s, h = 7 * s; // a frame, the five rows of dots, a frame
  const cx = 192 + (B.X - cam.x) * k;
  const x0 = Math.round(cx - w / 2), y0 = Math.round(cam.hy + (B.Y0 - cam.y) * k);
  const r = { x0, y0, x1: x0 + w, y1: y0 + h };
  LIVE_STATE.board = null;
  LIVE_STATE.pennant = null;
  if (soft || !guard(r)) return;
  // the gantry's two legs down to the roof (the hero screen hides them in the wide)
  const yRoof = Math.round(cam.hy + (GROUND.stand.roof - cam.y) * k);
  fill(x0 + 3 * s, y0 + h, x0 + 4 * s, yRoof, P.towerDark);
  fill(x0 + w - 4 * s, y0 + h, x0 + w - 3 * s, yRoof, P.towerDark);
  // the board: black in an ink frame, its top edge catching the light
  fill(x0, y0, x0 + w, y0 + h, C.ink);
  fill(x0, y0, x0 + w, y0 + s, P.head);
  fill(x0 + s, y0 + s, x0 + w - s, y0 + h - s, C.black);
  const dx0 = x0 + 2 * s, dy0 = y0 + s;
  for (let d = 0; d < 4; d++) {
    const gx = dx0 + digitX(d) * s;
    for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) fill(gx + i * s, dy0 + j * s, gx + (i + 1) * s, dy0 + (j + 1) * s, C.maroon);
  }
  LIVE_STATE.board = { x0: dx0, y0: dy0, s };
  // the pennant's pole beside the board (whole with its cloth, or not at all)
  const px = Math.round(192 + (GROUND.pennant.X - cam.x) * k);
  const pTop = Math.round(cam.hy + (GROUND.pennant.top - cam.y) * k);
  if (!guard({ x0: px - s, y0: pTop, x1: px + 9 * s, y1: pTop + 5 * s })) return;
  fill(px, pTop, px + s, yRoof, P.pole);
  LIVE_STATE.pennant = { x: px + s, y: pTop, s };
}

/** A digit's first column on the board (HH:MM: the colon at column 8). */
const digitX = (d) => d * 4 + (d >= 2 ? 2 : 0);

// the pennant's three frames (8x4 at s 1: o its colour, r its shadow edge), slow: 0.9 s each
const PENNANT = [
  ['oooooooo', 'ooooor..', 'ooor....', 'or......'],
  ['ooooooo.', 'oooooooo', 'ooooor..', 'oor.....'],
  ['oooooo..', 'ooooooor', 'oooooor.', 'ooor....'],
];
export const PENNANT_FRAMES = PENNANT;
/** The pennant's frame at time t (0, 1, 2; 0.9 s each). */
export const pennantFrame = (t) => Math.floor(mod(t, 2.7) / 0.9) % 3;
// the digits (3x5)
const DIGITS = [
  ['###', '#.#', '#.#', '#.#', '###'], ['.#.', '##.', '.#.', '.#.', '###'], ['###', '..#', '###', '#..', '###'], ['###', '..#', '.##', '..#', '###'],
  ['#.#', '#.#', '###', '..#', '..#'], ['###', '#..', '###', '..#', '###'], ['###', '#..', '###', '#.#', '###'], ['###', '..#', '.#.', '.#.', '.#.'],
  ['###', '#.#', '###', '#.#', '###'], ['###', '#.#', '###', '..#', '###'],
];
/** The clock on the board: [H, H, M, M] from the studio clock (the same clock as the sky's phase). */
export function boardTime() {
  const m = mod(Math.round(groundHour() * 60), 1440);
  return [Math.floor(m / 600), Math.floor(m / 60) % 10, Math.floor((m % 60) / 10), m % 10];
}

LIVE_DRAW['full-time'] = (fr, cam, t, style, clipRows, soft) => {
  if (soft) return;
  const px = fr.px;
  const L = LIVE_STATE;
  const set = (x, y, c, s) => {
    for (let a = 0; a < s; a++) for (let b = 0; b < s; b++) {
      const X = x + b, Y = y + a;
      if (X < 0 || X >= W || Y < 0 || Y >= H || (clipRows && Y >= clipRows[X])) continue;
      px[Y * W + X] = c;
    }
  };
  if (L.board) {
    const { x0, y0, s } = L.board;
    const dig = boardTime();
    for (let d = 0; d < 4; d++) {
      const g = DIGITS[dig[d]];
      const gx = x0 + digitX(d) * s;
      for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j][i] === '#') set(gx + i * s, y0 + j * s, C.orange, s);
    }
    // the colon, steady (a blinking colon is a flicker)
    for (const j of [1, 3]) set(x0 + 8 * s, y0 + j * s, C.orange, s);
  }
  if (L.pennant) {
    const { x, y, s } = L.pennant;
    const f = PENNANT[pennantFrame(t)];
    const band = L.pal.band, shade = band === C.rust ? C.brown : C.rust;
    for (let j = 0; j < 4; j++) for (let i = 0; i < 8; i++) {
      const ch = f[j][i];
      if (ch !== '.') set(x + i * s, y + j * s, ch === 'o' ? band : shade, s);
    }
  }
};

// --------------------------------------------------------------------------- the boards
let BAND_TEXT = null;
function boards(cam, P, soft, guard) {
  const G = GROUND.boards;
  const k = kOf(cam, G.Z);
  const y0 = Math.round(cam.hy + (G.top - cam.y) * k), y1 = Math.round(cam.hy + (GROUND.pitchY - cam.y) * k);
  if (y1 <= BOX.y0 || y0 >= BOX.y1) return y1;
  // the boards: unlit black panels, their top edge
  fill(BOX.x0, y0, BOX.x1, y1, P.board);
  if (!soft) fill(BOX.x0, y0, BOX.x1, y0 + 1, P.boardEdge);
  BAND_TEXT ??= textPixels('FULL TIME', 'micro');
  const g = BAND_TEXT;
  const s = Math.max(1, Math.floor((y1 - y0 - 2) / (g.cap + 2)));
  const bw = (g.width + 2 * G.pad) * s;
  const people = peopleBoxes(cam);
  const n = Math.ceil(2400 / G.every);
  for (let i = -n; i <= n; i++) {
    const cx = 192 + (i * G.every - cam.x) * k;
    const bx0 = symX0(cx, bw), bx1 = bx0 + bw;
    if (bx1 <= BOX.x0 || bx0 >= BOX.x1) continue;
    const r = { x0: bx0, y0: y0 + 1, x1: bx1, y1 };
    // the channel's orange band: out of focus a dim block, in focus the band and FULL TIME in dark type, whole or not
    // at all (inside the frame, clear of the screen, the columns, the graphics and every person)
    if (soft) {
      // out of focus: the band's light blurred to a dim rounded glow (its corners melt into the black board), no type
      const c = mute(P.band), cr = Math.max(1, s);
      fill(bx0 + cr, y0 + 1, bx1 - cr, y1, c);
      fill(bx0, y0 + 1 + cr, bx0 + cr, y1 - cr, c);
      fill(bx1 - cr, y0 + 1 + cr, bx1, y1 - cr, c);
      continue;
    }
    if (!guard(r) || people.some((b) => overlaps(r, b))) continue;
    fill(bx0, y0 + 1, bx1, y1, P.band);
    const tx = bx0 + G.pad * s, ty = y0 + 1 + Math.floor((y1 - y0 - 1 - g.cap * s) / 2);
    for (const [gx, gy] of g.pixels) fill(tx + gx * s, ty + gy * s, tx + (gx + 1) * s, ty + (gy + 1) * s, C.black);
  }
  return y1;
}

// --------------------------------------------------------------------------- the pitch
function pitch(cam, P, soft, yTop) {
  const f = F * cam.zoom, dY = GROUND.pitchY - cam.y;
  const g0 = C.darkGreen, up = C.green, dn = C.ink;
  const yA = Math.max(BOX.y0, yTop), yB = BOX.y1;
  const xs = BOX.x0, xe = BOX.x1;
  const SW = GROUND.stripe;
  // the far touchline's row (a pixel row where the line's Z falls)
  const yTouch = Math.round(cam.hy + dY * (f / (GROUND.touch - cam.z)) - 0.5);
  for (let y = yA; y < yB; y++) {
    const dy = y + 0.5 - cam.hy;
    if (dy <= 0) continue;
    const kr = dy / dY; // px per unit on this row
    const row = y * W;
    if (soft) {
      PX.fill(g0, row + xs, row + xe); // out of focus the stripes melt into one flat green
      continue;
    }
    // the stripes: runs between the stripe edges (straight lines to the vanishing point), flat within a stripe, the
    // pattern mirrored about the halfway line (the stripe either side of it the same)
    let n = Math.floor((cam.x + (xs + 0.5 - 192) / kr) / SW);
    let x = xs;
    const br = (y & 3) << 2;
    while (x < xe) {
      const xb = Math.min(xe, Math.ceil(192 + ((n + 1) * SW - cam.x) * kr - 0.5));
      const v = P.pitch[(n < 0 ? -n - 1 : n) & 1];
      if (v === 0) PX.fill(g0, row + x, row + Math.max(x, xb));
      else {
        const q = Math.abs(v), c1 = v > 0 ? up : dn;
        for (let xx = x; xx < xb; xx++) PX[row + xx] = q > B16[br + (xx & 3)] ? c1 : g0;
      }
      x = Math.max(x + 1, xb);
      n++;
    }
    // the halfway line, a faint line in the floodlights from the touchline under the boards toward the camera (the far
    // touchline itself is left out: in the network's two-shot it would run along the presenters' crowns)
    if (y > yTouch) {
      const hx = Math.round(192 - cam.x * kr - 0.5);
      if (hx >= xs && hx < xe) PX[row + hx] = P.line;
    }
  }
}

// --------------------------------------------------------------------------- the whole ground
/**
 * The ground behind the platform into `box` (screen px, the open back of the set): sky, far towers, stand, scoreboard,
 * boards, pitch, near towers, halos. `guard(rect)` says whether a sign (the scoreboard, a FULL TIME band) may stand
 * whole at a rect (the dressing's frame: clear of the screen, the columns, the canopy and the graphics' top row).
 */
export function drawGround(fr, cam, box, soft, guard = () => true) {
  PX = fr.px;
  BOX.x0 = Math.max(0, box.x0);
  BOX.x1 = Math.min(W, box.x1);
  BOX.y0 = Math.max(0, box.y0);
  BOX.y1 = Math.min(H, box.y1);
  const key = STATE.key;
  const phase = (key >> 3) % PALS.length, banks = key & 7;
  const P = PALS[phase];
  LIVE_STATE.pal = P;
  const kS = kOf(cam, GROUND.stand.Z);
  const yCorner = Math.round(cam.hy + (GROUND.stand.corner - cam.y) * kS) + 1;
  sky(cam, P, yCorner, soft);
  town(cam, P, yCorner);
  // the far towers stand in the open corners, behind the terraces (drawn first: the terraces hide their feet)
  const heads = [];
  for (const t of TOWERS) {
    if (t.kind !== 'far') continue;
    const hd = towerHead(cam, t);
    towerMast(cam, t, hd, P, soft);
    towerHeadDraw(t, hd, P, banks, soft);
    heads.push(hd);
  }
  stand(cam, P, soft);
  scoreboard(cam, P, soft, guard);
  const yBoards = boards(cam, P, soft, guard);
  pitch(cam, P, soft, yBoards);
  for (const t of TOWERS) {
    if (t.kind !== 'near') continue;
    const hd = towerHead(cam, t);
    towerMast(cam, t, hd, P, soft);
    towerHeadDraw(t, hd, P, banks, soft);
    heads.push(hd);
  }
  // the halos last: glare in the lens over whatever stands behind a head (lift only)
  for (const hd of heads) halo(hd, P, banks, soft);
}
