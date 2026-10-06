// WORLD NOW's window on the city (round 4, redrawn after the owner's "algo falla en el fondo… no me entregues
// esto como bien si puedes ver tú mismo que es un ñordo"; the sky by the hour: "que dependiendo la hora del día el
// cielo cambie"). The newsroom's back wall is floor-to-ceiling glass over a city, as at CNN's Hudson Yards or Sky
// News's Osterley. The view is drawn the way a pixel artist paints a skyline, in few clean layers that each read
// on their own:
//   sky       four bands from the top down to the horizon, two-row dither steps between them; stars at night,
//             clouds by day, the sun low on the horizon at dawn and at the golden hour
//   far       a low continuous skyline: the haze
//   mid       a row of buildings standing in the glow, a few windows lit, the odd mast or tank on a roof
//   heroes    a handful of tall towers placed clear of the presenters' heads: lit floors, an edge catching the
//             light, crowns (a spire, an art-deco top, a sloped roof), aviation lights, and a TV tower
//   ground    below the horizon, seen from high up: the street grid in true perspective (streets running to the
//             vanishing point, avenues in rows opening out toward the camera), the blocks' lights, a river with its
//             bridges, and the far city packed into a band of light along the horizon
// The horizon sits at the camera's eye height in every framing (the city is far enough to be at infinity), so the
// presenters' heads are against the glow. The city stands on its own far plane (CITY.Z): it moves less than the set
// in a move. Out of focus (singles) it is the same city, its lights a step dimmer and its fine edges gone.
//
// The hour (London, the channel's clock) picks one of five phases, each a palette: night, dawn, day (through the
// studio's tinted glass: never brighter than the faces), the golden hour, the blue hour. Without a clock
// (setSkyClock) the city stays at night (tests, labs): the picture is a pure function of the phase.
//
//   drawCity(fr, cam, box, soft, phase)   box: screen rect {x0, y0, x1, y1} to fill (the glass)
//   setSkyClock(fn) | setSkyHour(h)       the hour source (fn() → hours 0-24) or a fixed hour; skyPhase() → 0..4
//   GLASS_COL                             columns the plane may cross (the dressing clears the mullions)
//   LIVE_DRAW['world-now']                a plane crossing the sky, cars on the avenues (live.js)
import { C } from '../pixbuf.js';
import { F } from './geometry.js';
import { livePoint, BLINK, LIVE_DRAW } from './live.js';

const W = 384, H = 216;
// horizon: the skyline's foot, a few units under the camera's eye height
export const CITY = { Z: 3200, horizon: 4 };

function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => ((a = (Math.imul(a ^ (a >>> 15), 2246822519) + 0x9e3779b9) >>> 0) / 4294967296);
}
const hash = (a, b, c = 0) => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35) ^ Math.imul(c + 0x27d4eb2f, 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
};
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bay = (x, y) => (B4[((y & 3) << 2) | (x & 3)] + 0.5) / 16;

// --------------------------------------------------------------------------- the hour and its palette
// band tops (units above the horizon): sky[0] over 124, sky[1] down to 60, sky[2] down to 22, sky[3] to the horizon
const BANDS = [124, 60, 22];
const PHASE_NAMES = ['night', 'dawn', 'day', 'golden', 'dusk'];
const pal = (o) => {
  const out = {};
  for (const [k, v] of Object.entries(o)) out[k] = Array.isArray(v) ? v.map((n) => C[n]) : typeof v === 'string' && C[v] !== undefined ? C[v] : v;
  return out;
};
export const PHASES = [
  // night: black, ink, the city's navy glow; every light on
  pal({ sky: ['black', 'ink', 'navy', 'navy'], stars: 46, far: 'slate', farLit: 'steel', mid: 'ink', near2: 'ink', near: 'black', roof: 'ink', roofEdge: 'slate', hero: 'black', edge: 'slate', crown: 'tanShade', lit: 1, dark: null, ground: 'ink', main: 'orange', minor: 'brown', lamps: 1, blocks: 1, water: ['black', 'navy'], beacons: true, sun: null, clouds: 0 }),
  // dawn: the night lifting, a band of rust under purple, the sun just up on the left; lights going off
  pal({ sky: ['ink', 'navy', 'purple', 'rust'], stars: 8, far: 'purple', farLit: null, mid: 'ink', near2: 'ink', near: 'black', roof: 'ink', roofEdge: 'purple', hero: 'black', edge: 'rust', crown: 'tanShade', lit: 0.35, dark: null, ground: 'ink', main: 'orange', minor: 'brown', lamps: 0.6, blocks: 0.4, water: ['black', 'purple'], beacons: true, sun: { X: -398, h: 30, r: 13 }, clouds: 0 }),
  // day, seen through the studio's tinted glass (never brighter than the faces): a navy zenith over a steel sky,
  // clouds, the buildings lit (slate, their sunlit edges fog), the windows dark glass, no lamps
  pal({ sky: ['navy', 'navy', 'steel', 'steel'], stars: 0, far: 'slate', farLit: null, mid: 'slate', near2: 'slate', near: 'ink', roof: 'slate', roofEdge: 'steel', hero: 'ink', edge: 'fog', crown: 'steel', lit: 0, dark: 'ink', ground: 'slate', main: 'steel', minor: 'ink', lamps: 0, blocks: 0, water: ['navy', 'steel'], beacons: false, sun: null, clouds: 7 }),
  // the golden hour: purple over dark red over rust at the horizon, the sun setting on the right, the towers'
  // west faces catching it; the first lights coming on
  pal({ sky: ['navy', 'purple', 'darkRed', 'rust'], stars: 0, far: 'maroon', farLit: null, mid: 'black', near2: 'maroon', near: 'black', roof: 'maroon', roofEdge: 'rust', hero: 'black', edge: 'rust', crown: 'tan', lit: 0.3, dark: null, ground: 'maroon', main: 'orange', minor: 'brown', lamps: 0.6, blocks: 0.35, water: ['black', 'rust'], beacons: true, sun: { X: 398, h: 28, r: 14 }, clouds: 0 }),
  // the blue hour: ink over navy, the last of the sun a purple band and a thin dark red line; the city lit
  pal({ sky: ['ink', 'navy', 'navy', 'purple'], stars: 14, far: 'slate', farLit: 'steel', mid: 'ink', near2: 'ink', near: 'black', roof: 'ink', roofEdge: 'slate', hero: 'black', edge: 'slate', crown: 'tanShade', lit: 0.9, dark: null, ground: 'ink', main: 'orange', minor: 'brown', lamps: 1, blocks: 0.9, water: ['black', 'purple'], beacons: true, sun: null, clouds: 0, line: 'darkRed' }),
];
export const SKYTIME = { hour: 23, clock: null };
/** The hour source: fn() → hours 0-24 (London); null keeps the fixed hour. */
export function setSkyClock(fn) {
  SKYTIME.clock = typeof fn === 'function' ? fn : null;
}
/** A fixed hour (labs, tests): night by default. */
export function setSkyHour(h) {
  SKYTIME.hour = h;
  SKYTIME.clock = null;
}
/** The phase now: 0 night, 1 dawn, 2 day, 3 golden hour, 4 blue hour. */
export function skyPhase() {
  let h = SKYTIME.hour;
  if (SKYTIME.clock) {
    try {
      const v = SKYTIME.clock();
      if (Number.isFinite(v)) h = v;
    } catch {
      /* a broken clock keeps the fixed hour */
    }
  }
  h = ((h % 24) + 24) % 24;
  if (h >= 5.5 && h < 7.5) return 1;
  if (h >= 7.5 && h < 17) return 2;
  if (h >= 17 && h < 19) return 3;
  if (h >= 19 && h < 21) return 4;
  return 0;
}
export const phaseName = (i) => PHASE_NAMES[i] || 'night';
let PAL = PHASES[0];
// the phase of the frame being drawn (set.js picks it once per frame, with the cache key)
let FRAME_PHASE = 0;
export function framePhase(p) {
  FRAME_PHASE = p | 0;
}

// --------------------------------------------------------------------------- the city (city units on its plane)
// the heroes, placed by hand: in the wide (x = 192 + X * 0.31) the left pair stands between the pillar and Paco,
// the right pair between Lola and the pillar; the rest wait off screen for moves and singles
const HEROES = [
  { X: -420, w: 44, h: 150, crown: 'spire', lit: 0.34, cool: true },
  { X: -338, w: 32, h: 100, crown: 'slant', lit: 0.22 },
  { X: 362, w: 40, h: 124, crown: 'deco', lit: 0.3 },
  { X: 448, tv: true, h: 170 },
  { X: -700, w: 46, h: 126, crown: 'deco', lit: 0.26 },
  { X: -930, w: 38, h: 142, crown: 'spire', lit: 0.3, cool: true },
  { X: 700, w: 40, h: 136, crown: 'antenna', lit: 0.28, cool: true },
  { X: 900, w: 44, h: 110, crown: 'slant', lit: 0.24 },
  { X: -560, w: 30, h: 92, crown: 'antenna', lit: 0.2 },
  { X: 560, w: 30, h: 96, crown: 'flat', lit: 0.22 },
];
function buildCity() {
  const r = rng(2611);
  const far = [], mid = [];
  // the far skyline: blocks packed shoulder to shoulder, a gap now and then (never a sliver: ≥ 10 units)
  for (let X = -1900; X < 1900; ) {
    const w = 16 + r() * 34;
    far.push({ X0: X, X1: X + w, h: 12 + r() * 26, step: r() < 0.3 ? 4 + r() * 8 : 0, seed: far.length });
    X += w + (r() < 0.18 ? 10 + r() * 14 : 0);
  }
  // the mid row: lower than the glow band's top, so every roof reads against it
  const heroAt = (a, b) => HEROES.some((t) => !t.tv && b > t.X - t.w / 2 - 4 && a < t.X + t.w / 2 + 4);
  for (let X = -1900; X < 1900; ) {
    const w = 18 + r() * 34;
    if (!heroAt(X, X + w)) {
      const roof = r();
      mid.push({
        X0: X, X1: X + w, h: 20 + r() * 34,
        roof: roof < 0.18 ? 'mast' : roof < 0.34 ? 'tank' : roof < 0.46 ? 'step' : 'flat',
        lit: 0.05 + r() * 0.2, cool: r() < 0.3, seed: 300 + mid.length,
      });
    }
    X += w + (r() < 0.3 ? 8 + r() * 16 : 0);
  }
  // the nearer rows (the city between the studio and the skyline, their feet out of the picture): row 2 tops
  // around the horizon, row 3 below it (we look down on its roofs)
  const near2 = [], near3 = [];
  for (let X = -1900; X < 1900; ) {
    const w = 30 + r() * 44;
    near2.push({ X0: X, X1: X + w, h: -10 + r() * 62, lit: 0.12 + r() * 0.22, cool: r() < 0.35, roof: r(), seed: 1200 + near2.length });
    X += w + (r() < 0.4 ? 12 + r() * 24 : 0);
  }
  for (let X = -1900; X < 1900; ) {
    const w = 52 + r() * 70;
    near3.push({ X0: X, X1: X + w, h: -46 - r() * 50, lit: 0.26 + r() * 0.24, cool: r() < 0.3, roof: r(), seed: 1600 + near3.length });
    X += w + (r() < 0.55 ? 16 + r() * 34 : 0);
  }
  // the day's clouds: [X, h above the horizon, width, seed] in city units
  const clouds = [];
  for (let i = 0; i < 9; i++) clouds.push([-1600 + i * 380 + r() * 160, 74 + r() * 56, 70 + r() * 90, 300 + i]);
  return { far, mid, near2, near3, clouds };
}
const TOWN = buildCity();

const WARM = [C.orange, C.tan, C.tanShade, C.tan, C.orange, C.yellow];
const COOL = [C.fog, C.steel, C.fog, C.silver];
// out of focus: each light one step dimmer
const MUTE = new Map([
  ['yellow', 'tan'], ['orange', 'tanShade'], ['tan', 'tanShade'], ['tanShade', 'brown'], ['rust', 'brown'],
  ['fog', 'steel'], ['silver', 'fog'], ['steel', 'slate'], ['red', 'darkRed'],
].map(([a, b]) => [C[a] >>> 0, C[b]]));

// --------------------------------------------------------------------------- projection on the city plane
const P = { k: 1, cx: 0, cy: 0, hy: 0, hz: 0, camZ: 0 };
function plane(cam) {
  P.k = (F * cam.zoom) / (CITY.Z - cam.z);
  P.cx = cam.x;
  P.cy = cam.y;
  P.hy = cam.hy;
  P.hz = cam.y + CITY.horizon;
  P.camZ = cam.z;
  return P;
}
const sx = (X) => 192 + (X - P.cx) * P.k;
const sy = (Y) => P.hy + (Y - P.cy) * P.k;
/** Screen row of a height above the horizon (negative: below it). */
const rowOf = (h) => sy(P.hz - h);

const STEP = 4; // units of dither between two sky bands
function skyColour(h, x, y) {
  const s = PAL.sky;
  for (let i = 0; i < 3; i++) {
    const t = BANDS[i];
    if (h > t + STEP) return s[i];
    if (h > t - STEP) return (t + STEP - h) / (2 * STEP) > bay(x, y) ? s[i + 1] : s[i];
  }
  if (h > -2) return s[3];
  // below the horizon: the glow's last band, then the ground
  if (h > -2 - STEP) return (h + 2 + STEP) / STEP > bay(x, y) ? s[3] : PAL.ground;
  return PAL.ground;
}

// --------------------------------------------------------------------------- drawing
const STATE = { glassCol: new Uint8Array(W), box: { x0: 0, y0: 0, x1: 0, y1: 0 } };
export const GLASS_COL = STATE.glassCol;
const AVENUES = new Int16Array(40);

export function drawCity(fr, cam, box, soft, phase = FRAME_PHASE) {
  plane(cam);
  PAL = PHASES[phase] || PHASES[0];
  const px = fr.px;
  const xa = Math.max(0, box.x0), xb = Math.min(W, box.x1), ya = Math.max(0, box.y0), yb = Math.min(H, box.y1);
  if (xb <= xa || yb <= ya) return;
  Object.assign(STATE.box, { x0: xa, y0: ya, x1: xb, y1: yb });
  STATE.glassCol.fill(0, 0, W);
  STATE.glassCol.fill(1, xa, xb);
  AVENUES.fill(0);
  const k = P.k;
  const yh = rowOf(0);
  const m = soft ? (c) => MUTE.get(c >>> 0) ?? c : (c) => c;
  const put = (x, y, c) => {
    if (x >= xa && x < xb && y >= ya && y < yb) px[y * W + x] = c;
  };
  const fill = (x0, y0, x1, y1, c) => {
    for (let y = Math.max(ya, y0); y < Math.min(yb, y1); y++) for (let x = Math.max(xa, x0); x < Math.min(xb, x1); x++) px[y * W + x] = c;
  };
  // 1. the sky and the ground's base
  for (let y = ya; y < yb; y++) {
    const h = (yh - (y + 0.5)) / k;
    const row = y * W;
    for (let x = xa; x < xb; x++) px[row + x] = skyColour(h, x, y);
  }
  if (PAL.line) {
    // the blue hour's last light: a thin line along the horizon
    const y = Math.round(yh) - 1;
    if (y >= ya && y < yb) for (let x = xa; x < xb; x++) px[y * W + x] = PAL.line;
  }
  if (!soft && PAL.stars) {
    const r = rng(77);
    for (let n = 0; n < PAL.stars; n++) {
      const X = -1500 + r() * 3000, hh = BANDS[0] + 8 + r() * 80;
      const x = Math.round(sx(X)), y = Math.round(rowOf(hh));
      if (x >= xa && x < xb && y >= ya && y < yb && px[y * W + x] === PAL.sky[0]) {
        const c = n % 9 === 0 ? C.fog : C.steel;
        px[y * W + x] = c;
        if (n % 3 === 0) livePoint(x, y, c, PAL.sky[0], BLINK.TWINKLE, hash(n, 3));
      }
    }
  }
  if (PAL.clouds) clouds(put, k, xa, xb, soft);
  if (PAL.sun) sun(px, put, k, xa, xb, ya, yb, soft);
  // 2. the ground, from high up
  ground(fr, k, yh, xa, xb, ya, yb, m);
  // 3. the far skyline: the haze (a rare dim light at night)
  const yFoot = Math.round(yh);
  for (const b of TOWN.far) {
    const x0 = Math.round(sx(b.X0)), x1 = Math.round(sx(b.X1));
    if (x1 <= xa || x0 >= xb) continue;
    const y0 = Math.round(rowOf(b.h));
    fill(x0, y0, x1, yFoot, PAL.far);
    if (b.step) {
      const sw = Math.max(1, Math.round((x1 - x0) * 0.3)), mx = (x0 + x1) >> 1;
      fill(mx - sw, Math.round(rowOf(b.h + b.step)), mx + sw, y0, PAL.far);
    }
    if (!soft && PAL.farLit) for (let y = y0 + 2; y < yFoot - 1; y += 3) for (let x = x0 + 1; x < x1 - 1; x += 3) {
      if (hash(b.seed, x - x0, y - y0) < 0.05) put(x, y, PAL.farLit);
    }
  }
  // 4. the mid row
  const pitchX = Math.max(2, Math.round(7 * k)), pitchY = Math.max(3, Math.round(10 * k));
  const ww = Math.max(1, Math.round(2.6 * k));
  for (const b of TOWN.mid) {
    const x0 = Math.round(sx(b.X0)), x1 = Math.round(sx(b.X1));
    if (x1 <= xa || x0 >= xb || x1 - x0 < 2) continue;
    const y0 = Math.round(rowOf(b.h));
    fill(x0, y0, x1, yFoot, PAL.mid);
    // by day the sun on their faces: the edge toward the light (the left) one step lighter
    if (!soft && PAL.lit === 0) fill(x0, y0, x0 + 1, yFoot, C.steel);
    const mx = (x0 + x1) >> 1;
    if (b.roof === 'mast') {
      const mh = Math.max(3, Math.round(16 * k));
      fill(mx, y0 - mh, mx + 1, y0, PAL.mid);
    } else if (b.roof === 'tank') {
      const tw = Math.max(2, Math.round(6 * k)), th = Math.max(2, Math.round(5 * k));
      fill(mx - (tw >> 1), y0 - th, mx - (tw >> 1) + tw, y0, PAL.mid);
    } else if (b.roof === 'step') {
      const sw = Math.max(1, Math.round((x1 - x0) * 0.28));
      fill(mx - sw, y0 - Math.max(2, Math.round(7 * k)), mx + sw, y0, PAL.mid);
    }
    windows(put, b, x0, x1, y0 + Math.max(2, Math.round(4 * k)), yFoot - 1, pitchX, pitchY, ww, PAL.mid, m, b.cool ? COOL : WARM, false);
  }
  // 5. the heroes
  for (const t of HEROES) {
    if (t.tv) tvTower(fr, put, soft, m);
    else hero(fr, put, fill, t, k, m, soft, xa, xb);
  }
  // 6. the nearer rows: row 2 around the horizon, row 3 below it, their roofs seen from above, bigger windows
  nearRow(px, put, fill, TOWN.near2, k, yb, m, soft, 1.25, PAL.near2);
  nearRow(px, put, fill, TOWN.near3, k, yb, m, soft, 1.7, PAL.near);
}

/** A row of nearer buildings: a roof seen from above (its lit front edge, the odd plant room), the facade below. */
function nearRow(px, put, fill, row, k, yb, m, soft, scale, body) {
  const pitchX = Math.max(2, Math.round(7 * scale * k)), pitchY = Math.max(3, Math.round(10 * scale * k));
  const ww = Math.max(1, Math.round(2.6 * scale * k));
  const roofH = Math.max(1, Math.round(5 * scale * k * (scale > 1.5 ? 1 : 0.6)));
  for (const b of row) {
    const x0 = Math.round(sx(b.X0)), x1 = Math.round(sx(b.X1));
    if (x1 - x0 < 3) continue;
    const y0 = Math.round(rowOf(b.h));
    if (y0 >= yb) continue;
    // the roof's top face (we are above it when it is below the horizon), then the facade
    const below = b.h < 0;
    const fy = below ? y0 + roofH : y0;
    if (below) {
      fill(x0, y0, x1, fy, PAL.roof);
      if (!soft) fill(x0, fy - 1, x1, fy, PAL.roofEdge); // the parapet catching the light
      if (b.roof < 0.5) {
        const bw = Math.max(2, Math.round((x1 - x0) * 0.2)), bx = x0 + Math.round((x1 - x0) * (0.15 + b.roof));
        fill(bx, y0 - Math.max(1, Math.round(3 * scale * k)), bx + bw, y0 + 1, body);
      }
    } else if (!soft) fill(x0, y0, x1, y0 + 1, PAL.roofEdge);
    fill(x0, fy, x1, yb, body);
    // the side toward the light
    if (!soft) fill(x0, fy, x0 + 1, yb, PAL.lit === 0 ? C.slate : PAL.roof);
    windows(put, b, x0, x1, fy + Math.max(2, Math.round(3 * scale * k)), yb, pitchX, pitchY, ww, body, m, b.cool ? COOL : WARM, b.roof > 0.6);
  }
}

/** Lit windows of a building on a pixel grid (by day: panes of dark glass instead). */
function windows(put, b, x0, x1, yTop, yEnd, pitchX, pitchY, ww, body, m, lights, office) {
  const lit = PAL.lit, dark = PAL.dark;
  let row = 0;
  for (let y = yTop; y < yEnd; y += pitchY, row++) {
    const floorOn = hash(b.seed, row, 7) < (office ? 0.55 : 0.5);
    let col = 0;
    for (let x = x0 + 2; x + ww <= x1 - 1; x += pitchX, col++) {
      const h = hash(b.seed, row, col + 11);
      if (dark) {
        // daylight: the glass reads dark against the lit facade, floor by floor
        if (floorOn && h < 0.6) for (let dy = 0; dy < ww; dy++) for (let dx = 0; dx < ww; dx++) put(x + dx, y + dy, dark);
        continue;
      }
      const on = floorOn ? h < b.lit * 2.2 * lit : h < b.lit * 0.25 * lit;
      if (!on) continue;
      const lc = m(lights[Math.floor(hash(b.seed, row, col) * lights.length)]);
      for (let dy = 0; dy < ww; dy++) for (let dx = 0; dx < ww; dx++) put(x + dx, y + dy, lc);
      if (ww === 1 && h < b.lit * 0.3) livePoint(x, y, lc, body, BLINK.WINDOW, hash(col, row, b.seed));
    }
  }
}

/** A hero tower: its body, the edge toward the light, lit floors, its crown and aviation light. */
function hero(fr, put, fill, t, k, m, soft, xa, xb) {
  const px = fr.px;
  const x0 = Math.round(sx(t.X - t.w / 2)), x1 = Math.round(sx(t.X + t.w / 2));
  if (x1 <= xa - 20 || x0 >= xb + 20) return;
  const body = PAL.hero;
  const y0 = Math.round(rowOf(t.h)), yF = Math.round(rowOf(-10)); // its foot a little below the horizon (nearer)
  fill(x0, y0, x1, yF, body);
  // the lit edge: toward the studio at night (its light), toward the sun at dawn and at the golden hour
  const sunSide = PAL.sun ? (PAL.sun.X < 0 ? -1 : 1) : t.X < 0 ? 1 : -1;
  const ex = sunSide > 0 ? x1 - 1 : x0;
  if (!soft) fill(ex, y0, ex + 1, yF, PAL.edge);
  // by day a glass tower carries the sky in a reflection streak
  if (!soft && PAL.lit === 0) {
    const rx = x0 + Math.round((x1 - x0) * 0.35);
    fill(rx, y0 + 2, rx + Math.max(1, Math.round(3 * k)), yF, C.slate);
  }
  const pitchX = Math.max(2, Math.round(6 * k)), pitchY = Math.max(3, Math.round(9 * k));
  const ww = Math.max(1, Math.round(2.6 * k));
  const seed = 900 + Math.round(t.X);
  windows(put, { seed, lit: t.lit }, x0 + (sunSide < 0 ? 1 : 0), x1 - (sunSide > 0 ? 1 : 0), y0 + Math.max(3, Math.round(6 * k)), yF - 1, pitchX, pitchY, ww, body, m, t.cool ? COOL : WARM, true);
  // the crown
  const mid = (x0 + x1) >> 1, half = (x1 - x0) / 2, sk = Math.max(1, k * 1.6);
  const beacon = (x, y) => {
    if (!PAL.beacons || x < 0 || x >= W || y < 0 || y >= H) return;
    const under = px[y * W + x];
    put(x, y, m(C.red));
    if (!soft) livePoint(x, y, C.red, under, BLINK.BEACON, hash(seed, 1));
  };
  // a mast: one pixel, a step off whatever it stands against so it always reads
  const mast = (x, ya, yb2) => {
    for (let y = ya; y < yb2; y++) if (x >= 0 && x < W && y >= 0 && y < H) put(x, y, px[y * W + x] === C.black ? C.ink : body === C.black ? C.black : C.ink);
  };
  const edgeX = (hw) => (sunSide > 0 ? mid + hw - 1 : mid - hw);
  if (t.crown === 'spire') {
    let yy = y0;
    for (const [frac, hgt] of [[0.7, 8], [0.44, 9], [0.22, 10]]) {
      const hw = Math.max(1, Math.round(half * frac)), hh = Math.max(2, Math.round(hgt * sk));
      fill(mid - hw, yy - hh, mid + hw, yy, body);
      if (!soft) fill(edgeX(hw), yy - hh, edgeX(hw) + 1, yy, PAL.edge);
      yy -= hh;
    }
    const mh = Math.max(5, Math.round(24 * sk));
    mast(mid, yy - mh, yy);
    beacon(mid, yy - mh - 1);
  } else if (t.crown === 'deco') {
    // three setbacks, a band of light under each
    let yy = y0;
    for (const frac of [0.82, 0.6, 0.36]) {
      const hw = Math.max(1, Math.round(half * frac)), hh = Math.max(2, Math.round(7 * sk));
      fill(mid - hw, yy - hh, mid + hw, yy, body);
      if (!soft) fill(mid - hw + 1, yy - 2, mid + hw - 1, yy - 1, PAL.crown);
      yy -= hh;
    }
    const mh = Math.max(3, Math.round(10 * sk));
    mast(mid, yy - mh, yy);
    beacon(mid, yy - mh - 1);
  } else if (t.crown === 'slant') {
    // a sloped roof rising toward the studio, its lit edge
    const rise = Math.max(3, Math.round((x1 - x0) * 0.5));
    for (let x = x0; x < x1; x++) {
      const u = t.X < 0 ? (x - x0) / Math.max(1, x1 - x0 - 1) : (x1 - 1 - x) / Math.max(1, x1 - x0 - 1);
      const yy = y0 - Math.round(u * rise);
      fill(x, yy, x + 1, y0, body);
      if (!soft) put(x, yy, PAL.edge);
    }
    beacon(t.X < 0 ? x1 - 1 : x0, y0 - rise - 1);
  } else if (t.crown === 'antenna') {
    const mh = Math.max(4, Math.round(18 * sk));
    mast(mid, y0 - mh, y0);
    beacon(mid, y0 - mh - 1);
  }
}

/** The TV tower: a shaft widening to its foot, the pod with its lit ring, the mast and its two red lights. */
function tvTower(fr, put, soft, m) {
  const t = HEROES.find((h) => h.tv);
  const px = fr.px;
  const body = PAL.hero;
  const cx = Math.round(sx(t.X));
  const yTop = Math.round(rowOf(t.h)), yPod = Math.round(rowOf(t.h * 0.7)), yFoot = Math.round(rowOf(-6));
  for (let y = yPod; y < yFoot; y++) {
    const u = (y - yPod) / Math.max(1, yFoot - yPod);
    for (let dx = u < 0.45 ? 0 : -1; dx <= (u < 0.8 ? 0 : 1); dx++) put(cx + dx, y, body);
  }
  const pw = Math.max(2, Math.round(9 * P.k)), ph = Math.max(1, Math.round(4 * P.k));
  for (let y = yPod - ph; y <= yPod + ph; y++) {
    const w = y === yPod - ph || y === yPod + ph ? pw - 1 : pw;
    for (let dx = -w; dx <= w; dx++) put(cx + dx, y, body);
  }
  if (PAL.lit > 0) for (let dx = -pw + 1; dx <= pw - 1; dx += 2) put(cx + dx, yPod, m(C.orange));
  else for (let dx = -pw + 1; dx <= pw - 1; dx++) put(cx + dx, yPod - ph, PAL.edge); // by day the pod's top in the sun
  for (let y = yTop; y < yPod - ph; y++) if (cx >= 0 && cx < W && y >= 0 && y < H) put(cx, y, px[y * W + cx] === C.black ? C.ink : body);
  if (!soft && PAL.beacons) {
    for (const [y, seed] of [[yTop - 1, 0.37], [Math.round(rowOf(t.h * 0.86)), 0.87]]) {
      if (cx < 0 || cx >= W || y < 0 || y >= H) continue;
      const under = px[y * W + cx];
      put(cx, y, C.red);
      livePoint(cx, y, C.red, under, BLINK.BEACON, seed);
    }
  }
}

/** The day's clouds: flat lenses, steel with a fog top lit from above, their undersides slate. */
function clouds(put, k, xa, xb, soft) {
  for (const [X, h, w, seed] of TOWN.clouds) {
    const cx0 = sx(X - w / 2), cx1 = sx(X + w / 2), cy = rowOf(h);
    const rows = Math.max(2, Math.round(9 * k));
    for (let j = 0; j < rows; j++) {
      const y = Math.round(cy) + j;
      const u = (j + 0.5) / rows, half = (Math.sin(Math.PI * Math.min(1, u * 1.15)) * (cx1 - cx0)) / 2;
      const mx = (cx0 + cx1) / 2 + (hash(seed, j, 1) - 0.5) * 4;
      for (let x = Math.round(mx - half); x < Math.round(mx + half); x++) {
        if (x < xa || x >= xb) continue;
        put(x, y, soft ? C.steel : j === 0 ? C.fog : j >= rows - 1 ? C.slate : C.steel);
      }
    }
  }
}

/** The sun low on the horizon: a disc (cream heart, yellow rim) in rings of orange then rust light. */
function sun(px, put, k, xa, xb, ya, yb, soft) {
  const s = PAL.sun;
  const cx = sx(s.X), cy = rowOf(s.h), r = Math.max(3, s.r * k);
  const R = r * 2.4;
  for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) {
    for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
      if (x < xa || x >= xb || y < ya || y >= yb) continue;
      const d = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.4);
      if (px[y * W + x] === PAL.ground) continue; // below the horizon the ground hides it
      if (d < r * 0.55) put(x, y, soft ? C.yellow : C.cream);
      else if (d < r) put(x, y, C.yellow);
      else if (d < r * 1.6) put(x, y, C.orange);
      else if (d < R && (d < r * 2 || bay(x, y) < 0.5)) put(x, y, C.rust);
    }
  }
}

/**
 * The city below the horizon, from high up: its street grid in true perspective on the ground plane (the studio
 * stands GROUND.h units above it). Streets run to the vanishing point on the horizon as straight lines, avenues
 * cross them in rows that open out toward the camera; the blocks between light up as wholes (busy or dark); a river
 * winds down from the horizon with its bridges; where the grid is too fine for the pixels (near the horizon) the
 * far city is a band of packed light.
 */
export const GROUND = { h: 260, street: 240 };
// the river: its centre's lateral X at a depth D (it comes down from the horizon behind Paco to the lower left)
const riverX = (D) => -560 - (D - 4300) * 0.07 + 150 * Math.sin(D / 2500);
const RIVER_W = 130;
function ground(fr, k, yh, xa, xb, ya, yb, m) {
  const px = fr.px;
  const g0 = Math.max(ya, Math.ceil(yh + 1));
  if (g0 >= yb) return;
  const f = k * (CITY.Z - P.camZ); // F * zoom
  const sOf = (y) => (y + 0.5 - yh) / GROUND.h; // the ground's scale on a row (px per unit)
  const xOf = (X, y) => 192 + (X - P.cx) * sOf(y);
  const base = PAL.ground, horizon = PAL.sky[3];
  const free = (c) => c === base || c === horizon;
  const put = (x, y, c) => {
    if (x >= xa && x < xb && y >= g0 && y < yb && free(px[y * W + x])) px[y * W + x] = m(c);
  };
  const day = PAL.lamps === 0;
  // where the grid is fine enough to draw (streets ≥ 4 px apart): rows below yGrid
  const yGrid = Math.max(g0, Math.ceil(yh + (4 / GROUND.street) * GROUND.h));
  // 1. the river: dark water, the sky's light in short ripples on it
  const onRiver = new Uint8Array(W * (yb - g0));
  const [water, ripple] = PAL.water;
  for (let y = g0; y < yb; y++) {
    const sc = sOf(y), D = f / sc, cx = xOf(riverX(D), y), hw = (RIVER_W / 2) * sc;
    for (let x = Math.max(xa, Math.floor(cx - hw)); x < Math.min(xb, Math.ceil(cx + hw)); x++) {
      onRiver[(y - g0) * W + x] = 1;
      px[y * W + x] = hash(Math.round((x + 0.5 - 192) / sc / 14), y, 9) < 0.14 ? ripple : water;
    }
  }
  const dry = (x, y) => !onRiver[(y - g0) * W + x];
  // 2. the far city: rows of packed light where the grid is too fine for the pixels (by day: roofs in the haze)
  for (let y = g0; y < Math.min(yb, yGrid); y++) {
    const sp = GROUND.street * sOf(y);
    const dens = (0.3 * Math.pow(1 - sp / 4, 2) + 0.06) * (day ? 0.6 : PAL.lamps);
    const dRow = 1 / sOf(y);
    for (let x = xa; x < xb; x++) {
      if (!dry(x, y)) continue;
      const X = P.cx + (x + 0.5 - 192) * dRow;
      const h = hash(Math.round(X / (6 * dRow)), y - Math.round(yh), 5);
      if (h < dens) put(x, y, day ? (h < dens * 0.5 ? C.steel : C.ink) : h < dens * 0.18 ? C.yellow : h < dens * 0.65 ? C.orange : C.tanShade);
    }
  }
  // 3. the avenues: horizontal lines in rows that open out toward the camera; a bridge over the river
  const avIndex = new Int16Array(H).fill(-1); // the block row each screen row belongs to
  let n = 0, prevY = g0;
  for (let i = 1; i < 40; i++) {
    const y = Math.round(yh + 2.2 * Math.pow(i, 1.5));
    if (y >= yb) break;
    for (let yy = prevY; yy < Math.min(yb, y); yy++) avIndex[yy] = i;
    prevY = y;
    if (y < g0) continue;
    AVENUES[++n] = y;
    const dRow = 1 / sOf(y);
    for (let x = xa; x < xb; x++) {
      const X = P.cx + (x + 0.5 - 192) * dRow;
      // a dark stretch now and then (more of them while the lamps are only coming on)
      if (!day && hash(Math.floor(X / GROUND.street), i, 2) < 0.12 + 0.4 * (1 - PAL.lamps)) continue;
      if (!dry(x, y)) {
        if (i % 3 === 0) px[y * W + x] = m(day ? C.steel : C.tan); // a bridge
        continue;
      }
      put(x, y, i % 3 === 0 ? PAL.main : PAL.minor);
    }
  }
  for (let yy = prevY; yy < yb; yy++) avIndex[yy] = 99;
  // 4. the streets: straight lines to the vanishing point on the horizon, from where they are 4 px apart
  const sB = sOf(yb - 1);
  const stMin = Math.floor((P.cx + (xa - 192) / sB) / GROUND.street) - 1, stMax = Math.ceil((P.cx + (xb - 192) / sB) / GROUND.street) + 1;
  for (let st = stMin; st <= stMax; st++) {
    const X = st * GROUND.street;
    const c = st % 3 === 0 ? PAL.main : PAL.minor;
    let x0 = xOf(X, yGrid);
    for (let y = yGrid + 1; y < yb; y++) {
      const x1 = xOf(X, y);
      const a = Math.round(Math.min(x0, x1)), b2 = Math.round(Math.max(x0, x1));
      const darkRun = !day && hash(st, avIndex[y], 4) < 0.12 + 0.4 * (1 - PAL.lamps);
      if (!darkRun) for (let x = a; x <= b2; x++) if (x >= xa && x < xb && dry(x, y)) put(x, y, c);
      x0 = x1;
    }
  }
  // 5. the blocks: their lights, a block busy or dark as a whole (by day: some roofs darker)
  for (let y = yGrid; y < yb; y++) {
    const sc = sOf(y);
    for (let x = xa; x < xb; x++) {
      if (!dry(x, y)) continue;
      const X = P.cx + (x + 0.5 - 192) / sc;
      const busy = hash(Math.floor(X / GROUND.street), avIndex[y], 6);
      if (day) {
        if (busy > 0.6 && ((x + y) & 1) === 0 && hash(Math.floor(X / 20), y, 8) < 0.5) put(x, y, C.ink);
        continue;
      }
      const dens = busy < 0.25 ? 0 : (busy - 0.25) * 0.16 * PAL.blocks;
      const h = hash(Math.floor(X / Math.max(6, 1 / sc)), y - Math.round(yh), 7);
      if (h < dens) put(x, y, h < dens * 0.2 ? C.yellow : h < dens * 0.55 ? C.tan : busy > 0.85 ? C.fog : C.tanShade);
    }
  }
}

// --------------------------------------------------------------------------- what moves (live.js)
LIVE_DRAW['world-now'] = (fr, cam, t, style, clipRows, soft, wall) => {
  if (soft) return;
  plane(cam);
  const px = fr.px;
  const box = STATE.box;
  // the hero screen, its mount, its stem and the clock bar over it: nothing passes in front of them
  const pad = wall ? Math.ceil(9 * wall.k) : 0;
  const ok = (x, y) => x >= box.x0 && x < box.x1 && y >= box.y0 && y < box.y1 && STATE.glassCol[x] && (!clipRows || y < clipRows[x]) && (!wall || x < wall.x0 - pad || x >= wall.x1 + pad || y >= wall.y1 + pad);
  // a plane crossing the high sky every 75 s: a steady red light and a white strobe (by day a slate speck)
  const cyc = 75, u = (t % cyc) / cyc;
  const X = 1000 - u * 2000, h = BANDS[0] + 20 + 8 * Math.sin(u * 2.1);
  const x = Math.round(sx(X)), y = Math.round(rowOf(h));
  const sky = (xx, yy, c) => {
    if (ok(xx, yy) && px[yy * W + xx] === PAL.sky[0]) px[yy * W + xx] = c;
  };
  if (PAL.lit === 0) sky(x, y, C.slate);
  else {
    sky(x, y, C.red);
    if ((t * 1000) % 1300 < 90) sky(x + 2, y, C.white);
  }
  // cars on the avenues: headlights (fog) one way, tail lights (darkRed) the other (by day dark specks)
  for (let n = 3; n < 12; n++) {
    const ay = AVENUES[n];
    if (!ay) continue;
    for (let c = 0; c < 3; c++) {
      const speed = 14 + hash(n, c) * 22, dir = c % 2 ? 1 : -1;
      const X0 = -900 + ((((t * speed * dir + hash(c, n) * 1800) % 1800) + 1800) % 1800);
      const xx = Math.round(sx(X0));
      if (ok(xx, ay) && px[ay * W + xx] === PAL.ground) px[ay * W + xx] = PAL.lit === 0 ? C.ink : dir > 0 ? C.fog : C.darkRed;
    }
  }
};
