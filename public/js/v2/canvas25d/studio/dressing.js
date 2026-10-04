// Set dressing: each programme's own studio (owner, 3 Oct: "haz una ronda de pulida para decorar los platós y
// dejarlos bien"; round 4, 4 Oct: "quiero platós realmente bien hechos. Puedes añadir animaciones"). The network's
// architecture stays (the hero screen in its mount, the desk and its red plate, a soffit with an LED cove along
// the top, pillars with light inlays either side); the back of the set is each programme's own world:
//   WORLD NOW     floor-to-ceiling glass over the city by night (city.js), slim mullions, a bar of world clocks
//                 over the screen; red light lines
//   TECH BYTES    a circuit board (lab.js): the screen its chip, traces with data pulses, a light wall of tiles
//                 behind each presenter, a display cabinet each side with four backlit niches and a product in
//                 each; a terminal line with the show's name; blue light lines, the cyan desk line
//   COSMOS DESK   a planetarium LED wall (space.js): the sky from orbit with the Earth's limb, the Milky Way, a
//                 nebula, a crescent Moon, two constellations drawn over it, the Moon's phases over the screen;
//                 magenta light lines, a starry desk front
//   MONEY MINUTE  a business set after the close: a slatted wood wall washed from its rail, a bull and a bear
//                 etched in two edge-lit glass panels on standoffs, an LED ticker of the programme's beats (no
//                 prices), the bronze sconces of the style, a wood front with broken-run grain
//   NEWS IN 60    a flash studio: a broadcast studio clock (sixty second-LEDs, the first quarter lit yellow,
//                 "60" at its heart) on the left, the rundown board (RUNDOWN, five numbered beats, the one on
//                 air marked yellow) on the right, a thin yellow band on the desk
// Everything is drawn in world units (the back wall Z = SET.wallZ, the pillars SET.flatsZ, WORLD NOW's city its
// own far plane), so the camera's moves and zooms carry it; every pixel is a palette colour; out of focus
// (cam.soft) lights turn to bokeh. What moves (windows, beacons, pulses, stars, the cursor, the desk line's
// sweep) is live.js's layer over the cached set: the dressing registers those pixels as it draws them.
//
//   drawDressing(fr, cam, style, soft)   on the wall, after the light and before the screen
//   FLATS[id]                            the programme's pillars, instead of the network's black flats
//   DESK_FRONTS[id]                      the desk front's panel colours, pattern and light (set.js rasterDesk)
import { C } from '../pixbuf.js';
import { SET, kAt, sxOf, syOf } from './geometry.js';
import { textPixels } from '../../../font.js';
import { drawCity, GLASS_COL } from './city.js';
import { DESK_SWEEP, livePoint, BLINK, liveArm } from './live.js';
import { pcbWall } from './lab.js';
import { drawSpace, SKY } from './space.js';
import { moneyWall } from './money.js';
import { glowH, glowV, RAMPS } from './light.js';

const W = 384, H = 216;
const FLATS_X = 196; // the set flats' inner edge (set.js FLAT_X, world X at SET.flatsZ)

// --------------------------------------------------------------------------- helpers (world units → spans)
function rectW(fr, cam, X0, Y0, X1, Y1, c, Z = SET.wallZ) {
  const k = kAt(cam, Z);
  const x0 = Math.round(sxOf(cam, k, X0)), x1 = Math.round(sxOf(cam, k, X1));
  const y0 = Math.round(syOf(cam, k, Y0)), y1 = Math.round(syOf(cam, k, Y1));
  if (x1 <= 0 || x0 >= W || y1 <= 0 || y0 >= H) return;
  fr.span(x0, y0, Math.max(x1, x0 + 1), Math.max(y1, y0 + 1), c);
}
/** A dot of at least one pixel at (X, Y). */
function dotW(fr, cam, X, Y, c, size = 1, Z = SET.wallZ) {
  const k = kAt(cam, Z);
  const s = Math.max(1, Math.round(size * k));
  const x = Math.round(sxOf(cam, k, X) - s / 2), y = Math.round(syOf(cam, k, Y) - s / 2);
  if (x + s <= 0 || x >= W || y + s <= 0 || y >= H) return;
  fr.span(x, y, x + s, y + s, c);
}
/** A line of at least one pixel from (X0, Y0) to (X1, Y1), stepped in pixels. */
function lineW(fr, cam, X0, Y0, X1, Y1, c, Z = SET.wallZ) {
  const k = kAt(cam, Z);
  const ax = sxOf(cam, k, X0), ay = syOf(cam, k, Y0), bx = sxOf(cam, k, X1), by = syOf(cam, k, Y1);
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay))));
  const w = Math.max(1, Math.floor(k * 0.9 + 0.2));
  for (let i = 0; i <= n; i++) {
    const x = Math.round(ax + ((bx - ax) * i) / n), y = Math.round(ay + ((by - ay) * i) / n);
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    fr.span(x, y, x + w, y + w, c);
  }
}
/** Filled circle (pixel-centre rule) with a per-pixel colour function f(dx, dy, r) → colour | 0. */
function discW(fr, cam, X, Y, R, f, Z = SET.wallZ) {
  const k = kAt(cam, Z);
  const cx = sxOf(cam, k, X), cy = syOf(cam, k, Y), r = R * k;
  const x0 = Math.max(0, Math.floor(cx - r - 1)), x1 = Math.min(W, Math.ceil(cx + r + 1));
  const y0 = Math.max(0, Math.floor(cy - r - 1)), y1 = Math.min(H, Math.ceil(cy + r + 1));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / r;
      const d = dx * dx + dy * dy;
      if (d > 1) continue;
      const c = f(dx, dy, d);
      if (c) fr.px[y * W + x] = c;
    }
  }
}
function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => ((a = (Math.imul(a ^ (a >>> 15), 2246822519) + 0x9e3779b9) >>> 0) / 4294967296);
}
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x, y) => (B4[((y & 3) << 2) | (x & 3)] + 0.5) / 16;

// --------------------------------------------------------------------------- WORLD NOW: the window on the world
// The newsroom's back wall is glass, floor to ceiling, over the city by night (city.js), as at CNN New York or
// Sky News: the hero screen hangs in front of it in a black mount, slim mullions divide the panes, a soffit
// with the network's red cove runs along the top, and the set's pillars carry red light inlays.
const GLASS = { X: 250, top: -127, mullions: [86, 158, 230] };

// the world-clock bar over the screen: four small faces, each with its city's code (micro type)
const CLOCKS = [['NYC', 7, 0], ['LON', 12, 0], ['TYO', 20, 0], ['SYD', 22, 0]];
const FACE7 = ['..###..', '.#...#.', '#.....#', '#.....#', '#.....#', '.#...#.', '..###..'];
function clockBar(fr, cam, soft) {
  if (soft) return;
  const k = kAt(cam, SET.wallZ);
  const s = Math.max(1, Math.round(k * 1.25));
  // as wide as the screen's frame (set.js drawScreen: a border of round(2k) px)
  const b = Math.max(1, Math.round(2 * k));
  const x0 = Math.round(sxOf(cam, k, SET.screen.x0)) - b, x1 = Math.round(sxOf(cam, k, SET.screen.x1)) + b;
  const yc = Math.round(syOf(cam, k, -121));
  const bh = 9 * s;
  const y0 = yc - (bh >> 1), y1 = y0 + bh;
  if (y1 <= 0 || y0 >= H) return;
  fr.span(x0, y0, x1, y1, C.black);
  fr.span(x0, y0, x1, y0 + 1, C.ink);
  const px = fr.px;
  const put = (x, y, c) => {
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
      const X = x + i, Y = y + j;
      if (X >= 0 && X < W && Y >= 0 && Y < H) px[Y * W + X] = c;
    }
  };
  const groups = CLOCKS.map(([code]) => textPixels(code, 'micro'));
  const gw = groups.map((g) => (7 + 2 + g.width) * s);
  const gap = 5 * s;
  const total = gw.reduce((a, b) => a + b, 0) + gap * (CLOCKS.length - 1);
  let x = Math.round((x0 + x1 - total) / 2);
  CLOCKS.forEach(([, hour], n) => {
    const fy = yc - Math.floor(3.5 * s);
    for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) {
      if (FACE7[j][i] === '#') put(x + i * s, fy + j * s, C.steel);
      else if ((j > 0 && j < 6 && i > 0 && i < 6) && !(j === 1 && (i === 1 || i === 5)) && !(j === 5 && (i === 1 || i === 5))) put(x + i * s, fy + j * s, C.ink);
    }
    // the hands: the minute hand up (on the hour), the hour hand toward its hour, the red hub
    const cxp = x + 3 * s, cyp = fy + 3 * s;
    put(cxp, cyp - s, C.silver);
    put(cxp, cyp - 2 * s, C.silver);
    const a = ((hour % 12) / 12) * Math.PI * 2;
    put(cxp + Math.round(Math.sin(a) * 1.6) * s, cyp - Math.round(Math.cos(a) * 1.6) * s, C.fog);
    put(cxp, cyp, C.red);
    const g = groups[n];
    const tx = x + (7 + 2) * s, ty = yc - Math.floor((g.cap * s) / 2);
    for (const [gx, gy] of g.pixels) put(tx + gx * s, ty + gy * s, C.fog);
    x += gw[n] + gap;
  });
}

/**
 * The programme's LED cove along the top of the set (real sets carry their colour in light lines: Seven
 * News's blue fascia band, Bloomberg's cyan rings): a 1 px line of the accent at the ceiling line, its glow a
 * checker row under it, across the set between the flats. `dash` > 0 breaks it into segments (a light budget).
 */
function cove(fr, cam, c, glow, { Y = -128, dash = 0, soft = false } = {}) {
  if (soft) return;
  const k = kAt(cam, SET.wallZ);
  const y = Math.round(syOf(cam, k, Y));
  if (y < 0 || y >= H - 1) return;
  const kf = kAt(cam, SET.flatsZ);
  const x0 = Math.max(0, Math.round(sxOf(cam, kf, -FLATS_X))), x1 = Math.min(W, Math.round(sxOf(cam, kf, FLATS_X)));
  const ox = Math.round(sxOf(cam, k, 0));
  const px = fr.px;
  for (let x = x0; x < x1; x++) {
    if (dash && ((((x - ox) % dash) + dash) % dash) >= dash * 0.6) continue;
    px[y * W + x] = c;
    if (glow && ((x + y + 1) & 1)) px[(y + 1) * W + x] = glow;
  }
}
/** A vertical LED ribbon of the accent at wall X (1 px, whole pixels), from Y0 to Y1. */
function ribbon(fr, cam, X, Y0, Y1, c, soft) {
  if (soft) return;
  const k = kAt(cam, SET.wallZ);
  const x = Math.round(sxOf(cam, k, X));
  if (x < 0 || x >= W) return;
  const y0 = Math.max(0, Math.round(syOf(cam, k, Y0))), y1 = Math.min(H, Math.round(syOf(cam, k, Y1)));
  for (let y = y0; y < y1; y++) fr.px[y * W + x] = c;
}

function worldNow(fr, cam, style, soft) {
  const k = kAt(cam, SET.wallZ);
  const box = {
    x0: Math.round(sxOf(cam, k, -GLASS.X)), x1: Math.round(sxOf(cam, k, GLASS.X)),
    y0: Math.round(syOf(cam, k, GLASS.top)), y1: Math.round(syOf(cam, k, SET.floorY)),
  };
  drawCity(fr, cam, box, soft);
  // the glass: a faint reflection of the studio in each pane, two diagonal strokes one step up (in focus)
  if (!soft) glassSheen(fr, cam, k, box);
  // mullions: black, their face toward the key one pixel lighter; out of focus wider and ink
  const mw = Math.max(1, Math.round((soft ? 3.4 : 2.4) * k));
  for (const m of GLASS.mullions) for (const sx of [-1, 1]) {
    const x = Math.round(sxOf(cam, k, sx * m) - mw / 2);
    const ya = Math.max(0, box.y0), yb = Math.min(H, box.y1);
    fr.span(x, ya, x + mw, yb, soft ? C.ink : C.black);
    if (!soft && mw >= 2) fr.span(x, ya, x + 1, yb, C.ink);
    for (let xx = Math.max(0, x - 1); xx < Math.min(W, x + mw + 1); xx++) GLASS_COL[xx] = 0;
  }
  // the hero screen's mount: a black frame round the bezel, so the screen reads as a solid object on the glass
  const S = SET.screen, m = 5;
  rectW(fr, cam, S.x0 - m, S.y0 - m, S.x1 + m, S.y1 + m, C.black);
  if (!soft) rectW(fr, cam, S.x0 - m, S.y0 - m, S.x1 + m, S.y0 - m + 1, C.ink);
  // a slim stem from the mount to the soffit (it hangs from the grid)
  rectW(fr, cam, -2, GLASS.top - 4, 2, S.y0 - m, C.black);
  clockBar(fr, cam, soft);
  // the soffit along the top, the network's red cove under it throwing light down the glass
  soffit(fr, cam, RAMPS.red, soft);
}

/** The soffit along the top of the set: black, its lip lit, the programme's LED cove under it glowing down. */
function soffit(fr, cam, ramp, soft, Y = GLASS.top) {
  const k = kAt(cam, SET.wallZ);
  rectW(fr, cam, -2000, -400, 2000, Y, C.black);
  const yc = Math.round(syOf(cam, k, Y));
  if (yc < 0 || yc >= H) return;
  const kf = kAt(cam, SET.flatsZ);
  const x0 = Math.max(0, Math.round(sxOf(cam, kf, -FLATS_X))), x1 = Math.min(W, Math.round(sxOf(cam, kf, FLATS_X)));
  // (flat rows: a Bayer fringe along the top of the frame reads as a dotted line)
  if (soft) glowH(fr, x0, x1, yc, ramp, { glow: 'both', reach: 1, solid: true });
  else {
    fr.span(x0, yc - 1, x1, yc, C.ink);
    glowH(fr, x0, x1, yc, ramp, { glow: 'down', reach: 1, solid: true });
  }
}

/** Two clean diagonal strokes per pane, one step up the ramp (the studio's lights on the glass). */
function glassSheen(fr, cam, k, box) {
  const px = fr.px;
  const up = new Map([[C.black >>> 0, C.ink], [C.ink >>> 0, C.slate], [C.navy >>> 0, C.slate]]);
  const panes = [];
  const edges = [-GLASS.X, ...GLASS.mullions.map((m) => -m).reverse(), ...GLASS.mullions, GLASS.X];
  for (let i = 0; i + 1 < edges.length; i++) if (Math.abs(edges[i] + edges[i + 1]) > 20) panes.push([edges[i], edges[i + 1]]);
  const yTop = Math.max(0, box.y0), yEnd = Math.min(H, box.y0 + Math.round((box.y1 - box.y0) * 0.34));
  for (const [A, B] of panes) {
    const xa = Math.max(0, Math.round(sxOf(cam, k, A))), xb = Math.min(W, Math.round(sxOf(cam, k, B)));
    const pw = xb - xa;
    if (pw < 8) continue;
    for (let y = yTop; y < yEnd; y++) {
      const fy = (y - yTop) / Math.max(1, yEnd - yTop);
      for (let x = xa; x < xb; x++) {
        const d = (x - xa) - Math.round(pw * 0.32) + Math.round((y - yTop) * 0.9);
        const inStroke = (d >= 0 && d < 3) || (d >= 6 && d < 7);
        if (!inStroke) continue;
        if (fy > 0.6 && bayer(x, y) < (fy - 0.6) / 0.4) continue;
        const c = up.get(px[y * W + x] >>> 0);
        if (c) px[y * W + x] = c;
      }
    }
  }
}

/** The set's pillars (the set flats): black columns with a light inlay of the programme's colour and its glow. */
function pillars(fr, cam, soft, ramp) {
  const kf = kAt(cam, SET.flatsZ);
  for (const sx of [-1, 1]) {
    const inner = sx * FLATS_X;
    const xi = Math.round(sxOf(cam, kf, inner));
    const xo = sx > 0 ? W : 0;
    fr.span(Math.min(xi, xo), 0, Math.max(xi, xo), H, C.black);
    // the inner edge catches the studio light
    const ew = Math.max(1, Math.round(1.6 * kf));
    if (sx > 0) fr.span(xi, 0, xi + ew, H, soft ? C.ink : C.slate);
    else fr.span(xi - ew, 0, xi, H, C.ink);
    // the inlay: a vertical red line set into the face, its glow both sides (out of focus a wider soft bar)
    const xl = Math.round(sxOf(cam, kf, sx * (FLATS_X + 12)));
    const y0 = Math.round(syOf(cam, kf, -400)), y1 = Math.round(syOf(cam, kf, SET.floorY));
    // (the halo only: a Bayer fringe on the black face reads as a dotted column)
    if (soft) {
      fr.span(xl - 1, y0, xl + 2, y1, ramp.halo);
      glowV(fr, xl - 1, y0, y1, ramp, { reach: 0 });
      glowV(fr, xl + 1, y0, y1, ramp, { reach: 0 });
    } else glowV(fr, xl, y0, y1, ramp, { reach: 0 });
  }
}

// --------------------------------------------------------------------------- TECH BYTES: the display wall
// A product lab after hours: on each side, between the light and the softbox, a black display cabinet with
// three backlit niches (a cyan LED strip along each top, the light falling down the back panel, a glass
// shelf edge), each showing one product, hand-pixelled at the wide's pixel size (scaled by whole pixels in
// tighter shots). Products, inner to outer rows: a gamepad, a retro handheld, a camera | a VR headset, a
// drone, a little UNIT-8 figure.
//   k black, i ink, s slate, t steel, f fog, v silver, w white, c cyan, b blue, n navy, r red, y yellow,
//   g green, d darkGreen, m magenta, o orange, e darkRed (TECH BYTES never shows COSMOS's magenta or purple:
//   the little UNIT-8's antenna light is red)
const PC = { k: 'black', i: 'ink', s: 'slate', t: 'steel', f: 'fog', v: 'silver', w: 'white', c: 'cyan', b: 'blue', n: 'navy', r: 'red', e: 'darkRed', y: 'yellow', g: 'green', d: 'darkGreen', m: 'magenta', o: 'orange' };
const PRODUCTS = {
  headphones: [
    '....kkkkkkk....',
    '..kkfffffffkk..',
    '.kft.......tsk.',
    '.kt.........sk.',
    'kt...........sk',
    'kkkk.......kkkk',
    'kwrek.....kwrek',
    'krrek.....krrek',
    'krrek.....krrek',
    '.kkk.......kkk.',
  ],
  gamepad: [
    '...kkkkkkkkkkk...',
    '..kfffffffffffk..',
    '.kftktttttttyttk.',
    'kftkkkttttttbtrtk',
    'kttktttsktttgttsk',
    'kttttttkskttttssk',
    'ksssskkkkkkksssk.',
    '.kssk.......kssk.',
    '..kk.........kk..',
  ],
  handheld: [
    '.kkkkkkkkk.',
    'kvvvvvvvvfk',
    'kvkkkkkkkfk',
    'kvkdgggdkfk',
    'kvkgdddgkfk',
    'kvkdddddkfk',
    'kvkkkkkkkfk',
    'kvvvvvvvvfk',
    'kvkvvvvrvfk',
    'kkkkvvrvvfk',
    'kvkvvvvvvfk',
    'kvvvvvssvfk',
    'kffffffffsk',
    '.kkkkkkkkk.',
  ],
  camera: [
    '.....kkkkk.......',
    '....kfffffk...kk.',
    'kkkkkkkkkkkkkkrrk',
    'kfffffkkkkkffffsk',
    'ktttkkvvvvvkkttsk',
    'ktttkvsnnnsvkttsk',
    'ktttkvnbbwnvkttsk',
    'ktttkvsnnnsvkttsk',
    'ktttkkvvvvvkktssk',
    'ksssssskkkssssssk',
    '.kkkkkkkkkkkkkkk.',
  ],
  headset: [
    '....kkkkkkkkk....',
    '...k.........k...',
    '..kkkkkkkkkkkkk..',
    '.kvwvvvvvvvvvvfk.',
    'kkvvvvvvvvvvvffkk',
    'kkvvvvvvvvvvvffkk',
    '.kvvvvvvvvvvvffk.',
    '.kfffkkkkkkkfffk.',
    '..kkk.......kkk..',
  ],
  joystick: [
    '....kkk....',
    '...krwrk...',
    '...krrrk...',
    '...kerek...',
    '....kkk....',
    '.....k.....',
    '.....k.....',
    '..kkkkkkk..',
    '.kffffffffk',
    'kttttttkrrk',
    'ksssssssssk',
    'kkkkkkkkkkk',
  ],
  drone: [
    'fffff.......fffff',
    '..k...........k..',
    '..k...........k..',
    '.kkkkkkfffkkkkkk.',
    '......kttttk.....',
    '......ktbctk.....',
    '......kkkkkk.....',
    '....k.......k....',
    '...kk.......kk...',
  ],
  robot: [
    '.....r.....',
    '.....k.....',
    '..kkkkkkk..',
    '.kvvvvvvvk.',
    'kvvvvvvvvfk',
    'kvkkkkkkkfk',
    'kvkwwkwwkfk',
    'kvkkkkkkkfk',
    'kvvvvvvvffk',
    '.kkkkkkkkk.',
    '..kttttfk..',
    '.kttckttfk.',
    'ktttttttffk',
    'kkkkkkkkkkk',
  ],
};
const CABINET = {
  X0: 152,
  X1: 207,
  niches: [[-116, -88], [-84, -56], [-52, -24], [-20, 8]],
  items: [['headphones', 'gamepad', 'handheld', 'camera'], ['headset', 'joystick', 'drone', 'robot']],
};

function spritePx(fr, rows, x, y, s, soft) {
  const px = fr.px;
  for (let j = 0; j < rows.length; j++) {
    for (let i = 0; i < rows[j].length; i++) {
      const ch = rows[j][i];
      if (ch === '.') continue;
      let c = C[PC[ch]];
      if (soft) c = ch === 'k' || ch === 'i' ? C.ink : C.slate;
      for (let dy = 0; dy < s; dy++) {
        const Y = y + j * s + dy;
        if (Y < 0 || Y >= H) continue;
        for (let dx = 0; dx < s; dx++) {
          const X = x + i * s + dx;
          if (X >= 0 && X < W) px[Y * W + X] = c;
        }
      }
    }
  }
}

function displayCabinet(fr, cam, sx, soft) {
  const k = kAt(cam, SET.wallZ);
  const XA = sx > 0 ? CABINET.X0 : -CABINET.X1, XB = sx > 0 ? CABINET.X1 : -CABINET.X0;
  const x0 = Math.round(sxOf(cam, k, XA)), x1 = Math.round(sxOf(cam, k, XB));
  const yTop = Math.round(syOf(cam, k, CABINET.niches[0][0] - 4)), yBot = Math.round(syOf(cam, k, 30));
  if (x1 <= 0 || x0 >= W || yBot <= 0 || yTop >= H) return;
  // the cabinet: black, its top edge and the side toward the light caught by the studio's light
  fr.span(x0, yTop, x1, yBot, C.black);
  if (!soft) {
    fr.span(x0, yTop, x1, yTop + 1, C.slate);
    if (sx > 0) fr.span(x0, yTop, x0 + 1, yBot, C.slate);
    else fr.span(x1 - 1, yTop, x1, yBot, C.ink);
  }
  const s = Math.max(1, Math.round(k * 1.4));
  const inset = Math.max(2, Math.round(3 * k));
  const px = fr.px;
  CABINET.niches.forEach(([Y0, Y1], n) => {
    const nx0 = x0 + inset, nx1 = x1 - inset;
    const ny0 = Math.round(syOf(cam, k, Y0)), ny1 = Math.round(syOf(cam, k, Y1));
    // the back panel, lit from the strip at the top: navy, a checker step, slate, a checker step, ink
    // (rows in pixels, scaled with the zoom); its side edges a pixel darker
    const r1 = Math.max(1, Math.round(1.4 * k)), step = Math.max(1, Math.round(1.4 * k)), r2 = Math.max(2, Math.round(4.2 * k));
    for (let y = Math.max(0, ny0); y < Math.min(H, ny1); y++) {
      const d = y - ny0 - 2; // below the strip and its housing
      for (let x = Math.max(0, nx0); x < Math.min(W, nx1); x++) {
        let c = C.ink;
        if (!soft && d >= 0) {
          const chk = (x + y) & 1;
          if (d < r1) c = C.navy;
          else if (d < r1 + step) c = chk ? C.navy : C.slate;
          else if (d < r1 + step + r2) c = C.slate;
          else if (d < r1 + 2 * step + r2) c = chk ? C.slate : C.ink;
          if ((x === nx0 || x === nx1 - 1) && c !== C.ink) c = c === C.navy ? C.slate : C.ink;
        }
        px[y * W + x] = c;
      }
    }
    if (ny1 <= 0 || ny0 >= H) return;
    if (!soft) {
      // the LED strip along the top (its end caps dark), its housing under it
      const cap = Math.max(1, Math.round(2.8 * k));
      fr.span(nx0, ny0, nx1, ny0 + 1, C.navy);
      fr.span(nx0 + cap, ny0, nx1 - cap, ny0 + 1, C.cyan);
      fr.span(nx0, ny0 + 1, nx1, ny0 + 2, C.navy);
    }
    // the glass shelf: a lit edge, its shadow
    fr.span(nx0, ny1 - 2, nx1, ny1 - 1, soft ? C.slate : C.fog);
    fr.span(nx0, ny1 - 1, nx1, ny1, C.slate);
    // the product, centred on the shelf, a soft pool of the strip's light on the back panel behind it
    const rows = PRODUCTS[CABINET.items[sx > 0 ? 1 : 0][n]];
    const w = rows[0].length * s, h = rows.length * s;
    const sxp = Math.round((nx0 + nx1 - w) / 2), syp = ny1 - 2 - h;
    if (!soft) {
      const cx = sxp + w / 2, cy = ny1 - 2 - h * 0.45, rx = w * 0.5 + 4 * s, ry = h * 0.55 + 3 * s;
      for (let y = Math.max(ny0 + 2, Math.floor(cy - ry)); y < Math.min(ny1 - 2, Math.ceil(cy + ry)); y++) {
        for (let x = Math.max(nx0 + 1, Math.floor(cx - rx)); x < Math.min(nx1 - 1, Math.ceil(cx + rx)); x++) {
          const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
          const v = 1 - (dx * dx + dy * dy);
          if (v <= 0 || px[y * W + x] !== C.ink) continue;
          if (v > 0.45 || v / 0.45 > bayer(x, y)) px[y * W + x] = C.slate;
        }
      }
    }
    spritePx(fr, rows, sxp, syp, s, soft);
  });
}

/**
 * A lightbox strip over the screen (as WORLD NOW's clock bar): black, an ink top edge, a line of micro type
 * centred in it from coloured runs [[text, colour], ...] (real sets carry the show's name on the set).
 */
function headerStrip(fr, cam, runs, soft) {
  if (soft) return;
  const k = kAt(cam, SET.wallZ);
  const s = Math.max(1, Math.round(k * 1.25));
  const b = Math.max(1, Math.round(2 * k));
  const x0 = Math.round(sxOf(cam, k, SET.screen.x0)) - b, x1 = Math.round(sxOf(cam, k, SET.screen.x1)) + b;
  const yc = Math.round(syOf(cam, k, -121));
  const bh = 9 * s, y0 = yc - (bh >> 1);
  if (y0 + bh <= 0 || y0 >= H) return;
  fr.span(x0, y0, x1, y0 + bh, C.black);
  fr.span(x0, y0, x1, y0 + 1, C.ink);
  const glyphs = runs.map(([t, c]) => [textPixels(t, 'micro'), c, t]);
  const widthOf = (t, g) => g.width + (t.endsWith(' ') ? 2 : 0) + (t.startsWith(' ') ? 2 : 0);
  const total = glyphs.reduce((a, [g, , t]) => a + (widthOf(t, g) + 1) * s, 0) - s;
  let x = Math.round((x0 + x1 - total) / 2);
  const ty = yc - Math.floor((5 * s) / 2);
  for (const [g, c, t] of glyphs) {
    const lead = t.startsWith(' ') ? 2 * s : 0;
    const blink = t === '_'; // a terminal cursor blinks (live.js)
    for (const [gx, gy] of g.pixels) {
      fr.span(x + lead + gx * s, ty + gy * s, x + lead + (gx + 1) * s, ty + (gy + 1) * s, c);
      if (blink) for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) livePoint(x + lead + gx * s + i, ty + gy * s + j, c, C.black, BLINK.CURSOR);
    }
    x += (widthOf(t, g) + 1) * s;
  }
}

function techBytes(fr, cam, style, soft) {
  // the set is a circuit board (lab.js): the screen its chip, traces out to the cabinets, pulses along them
  pcbWall(fr, cam, soft);
  // the show's name in a terminal line over the screen: a prompt, the name, the blinking cursor
  headerStrip(fr, cam, [['>', C.blue], [' TECH BYTES', C.fog], ['_', C.cyan]], soft);
  displayCabinet(fr, cam, -1, soft);
  displayCabinet(fr, cam, 1, soft);
  soffit(fr, cam, RAMPS.blue, soft);
}

// --------------------------------------------------------------------------- COSMOS: the planetarium set
// The planetarium wall is space.js's; over it, as a planetarium draws them, two constellations (stars as small
// crosses joined by thin purple lines that stop short of each star, each named in micro type, a name whole or
// not at all), and over the screen a strip of the Moon's eight phases.
// [name, x, y, mag] in chart units (x right, y down), mag 1 (brightest) .. 3; lines as index pairs
const DIPPER = {
  name: 'URSA MAJOR',
  stars: [['Dubhe', 0, 0, 1], ['Merak', 2, 11, 2], ['Phecda', 15, 14, 2], ['Megrez', 16, 4, 3], ['Alioth', 27, 1, 2], ['Mizar', 37, -2, 2], ['Alkaid', 48, -8, 2]],
  lines: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6]],
};
const CASSIOPEIA = {
  name: 'CASSIOPEIA',
  stars: [['Caph', 0, 0, 2], ['Schedar', 9, 9, 2], ['Navi', 19, 3, 2], ['Ruchbah', 28, 11, 2], ['Segin', 38, 4, 3]],
  lines: [[0, 1], [1, 2], [2, 3], [3, 4]],
};
// round 4: over the planetarium wall, above the heads (the Big Dipper over UNIT-8, Cassiopeia over Nova)
const SKY_CHARTS = [
  { c: DIPPER, X: 94, Y: -104, u: 1.0, label: [14, 9] },
  { c: CASSIOPEIA, X: -150, Y: -110, u: 1.0, label: [4, 15] },
];

function starPx(fr, x, y, mag, tint, soft) {
  const px = fr.px;
  const set = (X, Y, c) => {
    if (X >= 0 && X < W && Y >= 0 && Y < H) px[Y * W + X] = c;
  };
  if (soft) {
    set(x, y, mag === 1 ? C.fog : C.steel);
    return;
  }
  const core = tint ? C[tint] : mag === 1 ? C.white : mag === 2 ? C.silver : C.fog;
  set(x, y, core);
  if (mag <= 2) {
    // a small cross: the arms one step dimmer
    const arm = tint === 'orange' ? C.tan : tint === 'blue' ? C.navy : mag === 1 ? C.silver : C.steel;
    set(x - 1, y, arm);
    set(x + 1, y, arm);
    set(x, y - 1, arm);
    set(x, y + 1, arm);
    if (mag === 1) {
      const tip = tint === 'orange' ? C.brown : tint === 'blue' ? C.slate : C.steel;
      set(x - 2, y, tip);
      set(x + 2, y, tip);
      set(x, y - 2, tip);
      set(x, y + 2, tip);
    }
  }
}

function chartLine(fr, ax, ay, bx, by, gapA, gapB, c) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay))));
  const len = Math.hypot(bx - ax, by - ay);
  for (let i = 0; i <= n; i++) {
    const t = i / n, d = t * len;
    if (d < gapA || len - d < gapB) continue;
    const x = Math.round(ax + (bx - ax) * t), y = Math.round(ay + (by - ay) * t);
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    const o = fr.px[y * W + x];
    if (o === C.black || o === C.ink) fr.px[y * W + x] = c;
  }
}

function constellation(fr, cam, ch, soft) {
  const k = kAt(cam, SET.wallZ);
  const P = ch.c.stars.map(([, x, y, mag, tint]) => [sxOf(cam, k, ch.X + x * ch.u), syOf(cam, k, ch.Y + y * ch.u), mag, tint]);
  // the lines stop a pixel short of each star's cross (two pixels for the brightest)
  const gap = (m) => (m === 1 ? 3 : 2) * Math.max(1, Math.round(k * 0.9));
  if (!soft) for (const [a, b] of ch.c.lines) chartLine(fr, P[a][0], P[a][1], P[b][0], P[b][1], gap(P[a][2]), gap(P[b][2]), C.purple);
  for (const [x, y, mag, tint] of P) starPx(fr, Math.round(x), Math.round(y), mag, tint, soft);
  if (soft) return;
  // its name in micro type, dim (slate), at whole-pixel scale
  const g = textPixels(ch.c.name, 'micro');
  const s = Math.max(1, Math.round(k * 1.1));
  const lx = Math.round(sxOf(cam, k, ch.X + ch.label[0])), ly = Math.round(syOf(cam, k, ch.Y + ch.label[1]));
  // a name is shown whole or not at all (a framing that cuts it, or the flats over it, drops it)
  const kf = kAt(cam, SET.flatsZ);
  const fl = Math.round(sxOf(cam, kf, -FLATS_X)), fr0 = Math.round(sxOf(cam, kf, FLATS_X));
  if (lx < Math.max(1, fl + 2) || lx + g.width * s > Math.min(W - 1, fr0 - 2) || ly < 1 || ly + g.cap * s > H - 1) return;
  // nor under the graphics' top row (the bug on the left, the clock on the right: y < 24)
  if (ly < 24 && (lx < 112 || lx + g.width * s > 272)) return;
  for (const [gx, gy] of g.pixels) {
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
      const x = lx + gx * s + i, y = ly + gy * s + j;
      if (x >= 0 && x < W && y >= 0 && y < H) fr.px[y * W + x] = C.steel;
    }
  }
}

// the Moon's phases over the screen: 7 px discs (whole-pixel scale), lit limb silver, dark side ink with a
// slate rim, the new Moon a slate ring
function moonPhases(fr, cam, soft) {
  if (soft) return;
  const k = kAt(cam, SET.wallZ);
  const s = Math.max(1, Math.round(k * 1.25));
  const R = 3.5 * s;
  const x0 = sxOf(cam, k, SET.screen.x0 + 6), x1 = sxOf(cam, k, SET.screen.x1 - 6);
  const yc = Math.round(syOf(cam, k, -121.5));
  const px = fr.px;
  // a black strip behind the row (as wide as the screen's frame), its top edge ink
  const b = Math.max(1, Math.round(2 * k));
  const bx0 = Math.round(sxOf(cam, k, SET.screen.x0)) - b, bx1 = Math.round(sxOf(cam, k, SET.screen.x1)) + b;
  const by0 = yc - Math.floor(R) - 1 - s, by1 = yc + Math.ceil(R) + 1 + s;
  fr.span(bx0, by0, bx1, by1, C.black);
  fr.span(bx0, by0, bx1, by0 + 1, C.ink);
  for (let p = 0; p < 8; p++) {
    const cx = Math.round(x0 + ((x1 - x0) * p) / 7);
    // phase angle: 0 new, 0.5 full; the terminator's x (in radius units) for each row
    // the terminator per phase, pushed toward the readable at 7 px (a true crescent is a 1 px sliver)
    const waxing = p <= 4;
    const t = [1, 0.35, 0, -0.45, -1, -0.45, 0, 0.35][p];
    for (let j = 0; j < 7 * s; j++) {
      for (let i = 0; i < 7 * s; i++) {
        const dx = (i + 0.5 - R) / R, dy = (j + 0.5 - R) / R;
        const d = dx * dx + dy * dy;
        if (d > 1) continue;
        const half = Math.sqrt(Math.max(0, 1 - dy * dy));
        // lit if beyond the terminator on the lit side (waxing: the right side)
        const u = waxing ? dx : -dx;
        const lit = p === 0 ? false : u > t * half;
        let c = lit ? (d > 0.62 && u < 0 ? C.fog : C.silver) : d > 0.55 ? C.slate : C.ink;
        if (p === 0) c = d > 0.55 ? C.slate : C.black;
        const X = cx - Math.floor(R) + i, Y = yc - Math.floor(R) + j;
        if (X >= 0 && X < W && Y >= 0 && Y < H) px[Y * W + X] = c;
      }
    }
  }
}

function cosmos(fr, cam, style, soft) {
  // the planetarium wall (space.js): the sky from orbit across the whole back of the set
  const k = kAt(cam, SET.wallZ);
  drawSpace(fr, cam, {
    x0: Math.round(sxOf(cam, k, -SKY.X)), x1: Math.round(sxOf(cam, k, SKY.X)),
    y0: Math.round(syOf(cam, k, SKY.top)), y1: Math.round(syOf(cam, k, SET.floorY)),
  }, soft);
  // the planetarium's overlay: two constellations in thin purple lines with their names, over the heads
  for (const ch of SKY_CHARTS) constellation(fr, cam, ch, soft);
  // the hero screen in its black mount, the Moon's phases over it, the soffit's magenta cove
  const S = SET.screen, m = 5;
  rectW(fr, cam, S.x0 - m, S.y0 - m, S.x1 + m, S.y1 + m, C.black);
  if (!soft) rectW(fr, cam, S.x0 - m, S.y0 - m, S.x1 + m, S.y0 - m + 1, C.ink);
  moonPhases(fr, cam, soft);
  soffit(fr, cam, RAMPS.magenta, soft);
}

// --------------------------------------------------------------------------- MONEY MINUTE: the business set
// The panelled room after the close is money.js's (walnut panels, bronze sconces, the bull and the bear on the
// ledge, the LED ticker along the soffit); here the hero screen's mount and the room's own warm cove.
function moneyMinute(fr, cam, style, soft) {
  moneyWall(fr, cam, soft);
  const S = SET.screen, m = 5;
  rectW(fr, cam, S.x0 - m, S.y0 - m, S.x1 + m, S.y1 + m, C.black);
  if (!soft) rectW(fr, cam, S.x0 - m, S.y0 - m, S.x1 + m, S.y0 - m + 1, C.ink);
}

// --------------------------------------------------------------------------- NEWS IN 60: the flash studio
// The minute, as a broadcast studio clock on the left: a black face in a bevelled ring, sixty second-LEDs
// round it (the first quarter lit yellow, the rest unlit slate), twelve hour marks inside, "60" at its
// heart. On the right, the rundown board: RUNDOWN in yellow, five numbered rows of the bulletin's beats, the
// one on air marked with a yellow bar. Both sit beside the wall, clear of Sam in every framing (a close shot
// never cuts them), and the room's yellow stays under the bible's 1.5 %.
function studioClock(fr, cam, X, Y, soft) {
  const k = kAt(cam, SET.wallZ);
  // centred on a pixel corner, radii in whole pixels: the circles come out symmetric and even
  const cx = Math.round(sxOf(cam, k, X)), cy = Math.round(syOf(cam, k, Y));
  const R = Math.round(34 * k); // the LED ring's radius in pixels
  const px = fr.px;
  const set = (x, y, c) => {
    if (x >= 0 && x < W && y >= 0 && y < H) px[y * W + x] = c;
  };
  // the housing: an ink ring with a slate bevel lit from the top-left, the black face inside
  const RI = R + Math.max(2, Math.round(2 * k)), RO = RI + Math.max(2, Math.round(2.4 * k));
  for (let y = Math.floor(cy - RO - 1); y <= Math.ceil(cy + RO + 1); y++) {
    for (let x = Math.floor(cx - RO - 1); x <= Math.ceil(cx + RO + 1); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
      if (d > RO) continue;
      let c = C.black;
      if (d > RI) c = soft ? C.ink : (dx + dy) / d < -0.5 ? C.slate : C.ink;
      set(x, y, c);
    }
  }
  if (soft) return;
  // sixty second-LEDs, the first quarter lit (12 o'clock clockwise); a dot each, 2x2 when the zoom allows
  const ds = Math.max(1, Math.round(1.4 * k));
  for (let i = 0; i < 60; i++) {
    const a = -Math.PI / 2 + (i / 60) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * R - ds / 2), y = Math.round(cy + Math.sin(a) * R - ds / 2);
    const c = i < 15 ? C.yellow : C.slate;
    for (let j = 0; j < ds; j++) for (let q = 0; q < ds; q++) set(x + q, y + j, c);
  }
  // twelve hour marks inside (steel, the four quarters fog)
  for (let h = 0; h < 12; h++) {
    const a = -Math.PI / 2 + (h / 12) * Math.PI * 2;
    const r0 = R - 5 * k, r1 = R - (h % 3 === 0 ? 10 : 8) * k;
    const n = Math.max(1, Math.round(r0 - r1));
    for (let t = 0; t <= n; t++) {
      const r = r0 + ((r1 - r0) * t) / n;
      set(Math.round(cx + Math.cos(a) * r - 0.5), Math.round(cy + Math.sin(a) * r - 0.5), h % 3 === 0 ? C.fog : C.steel);
    }
  }
  // "60" at the heart, body type at whole-pixel scale
  const g = textPixels('60', 'body');
  const s = Math.max(1, Math.round(k * 1.25));
  const tx = Math.round(cx - (g.width * s) / 2), ty = Math.round(cy - (g.cap * s) / 2);
  for (const [gx, gy] of g.pixels) for (let j = 0; j < s; j++) for (let q = 0; q < s; q++) set(tx + gx * s + q, ty + gy * s + j, C.fog);
}

const RUNDOWN = ['WORLD', 'POLITICS', 'BUSINESS', 'SCIENCE', 'SPORT'];
function rundownBoard(fr, cam, X0, Y0, X1, Y1, soft) {
  const k = kAt(cam, SET.wallZ);
  // the board: black with an ink frame, its top edge lit
  rectW(fr, cam, X0 - 2.5, Y0 - 2.5, X1 + 2.5, Y1 + 2.5, C.ink);
  if (!soft) rectW(fr, cam, X0 - 2.5, Y0 - 2.5, X1 + 2.5, Y0 - 1.3, C.slate);
  rectW(fr, cam, X0, Y0, X1, Y1, C.black);
  if (soft) return;
  const s = Math.max(1, Math.round(k * 1.25));
  const px = fr.px;
  const text = (str, x, y, c) => {
    const g = textPixels(str, 'micro');
    for (const [gx, gy] of g.pixels) for (let j = 0; j < s; j++) for (let q = 0; q < s; q++) {
      const X = x + gx * s + q, Y = y + gy * s + j;
      if (X >= 0 && X < W && Y >= 0 && Y < H) px[Y * W + X] = c;
    }
    return g.width * s;
  };
  const bx0 = Math.round(sxOf(cam, k, X0)), by0 = Math.round(syOf(cam, k, Y0));
  const bx1 = Math.round(sxOf(cam, k, X1)), by1 = Math.round(syOf(cam, k, Y1));
  const pad = 3 * s;
  // the header and its rule
  text('RUNDOWN', bx0 + pad, by0 + pad, C.yellow);
  const ry = by0 + pad + 5 * s + 2 * s;
  fr.span(bx0 + pad, ry, bx1 - pad, ry + 1, C.slate);
  // the rows
  const rowH = Math.max(7 * s, Math.floor((by1 - ry - pad) / RUNDOWN.length));
  RUNDOWN.forEach((name, i) => {
    const y = ry + 3 * s + i * rowH;
    if (y + 5 * s > by1 - 1) return;
    const live = i === 0;
    if (live) fr.span(bx0 + pad - 2 * s, y - s, bx0 + pad - s, y + 6 * s, C.yellow);
    const nx = bx0 + pad + text(`0${i + 1}`, bx0 + pad, y, live ? C.fog : C.steel) + 3 * s;
    text(name, nx, y, live ? C.silver : C.steel);
  });
}

function news60(fr, cam, style, soft) {
  // the cove in orange, the yellow's warm neighbour (news-60.md allows orange up to 8 %; the yellow stays
  // under its 1.5 % for the clock's lit quarter, the rundown and the desk), and a ribbon either side of the
  // anchor's bay: the light lines frame the screen and Sam, the clock and the rundown hang outside them
  cove(fr, cam, C.orange, C.brown, { soft });
  ribbon(fr, cam, -128, -128, 30, C.orange, soft);
  ribbon(fr, cam, 128, -128, 30, C.orange, soft);
  studioClock(fr, cam, -186, -72, soft);
  rundownBoard(fr, cam, 146, -112, 224, -34, soft);
}

// --------------------------------------------------------------------------- entry points
/** The dressing switch (tests of the bare architecture; labs): set.js setDressing() also clears its caches. */
export const DRESSING = { on: true };

const DRESS = { 'world-now': worldNow, 'tech-bytes': techBytes, cosmos, 'money-minute': moneyMinute, 'news-60': news60 };
// the desk line's sweep of light (live.js): every 24 s a run of light crosses the desk in 2.6 s
DESK_SWEEP['world-now'] = { line: C.red, hot: C.pink, every: 24, cross: 2.6 };
DESK_SWEEP['tech-bytes'] = { line: C.cyan, hot: C.white, warm: C.silver, every: 18, cross: 2.2 };
DESK_SWEEP.cosmos = { line: C.magenta, hot: C.pink, every: 30, cross: 3.2 };

/** A programme's own set flats (pillars), drawn instead of the network's black flats (set.js drawFlats). */
export const FLATS = {
  'world-now': (fr, cam, style, soft) => pillars(fr, cam, soft, RAMPS.red),
  'tech-bytes': (fr, cam, style, soft) => pillars(fr, cam, soft, RAMPS.blue),
  cosmos: (fr, cam, style, soft) => pillars(fr, cam, soft, RAMPS.magenta),
  'money-minute': (fr, cam, style, soft) => pillars(fr, cam, soft, RAMPS.warm), // walnut columns, a brass inlay
};

/** The programme's dressing on the back wall (after the light, before the screen and the flats). */
export function drawDressing(fr, cam, style, soft = false) {
  if (!DRESSING.on) return;
  const f = DRESS[style?.id];
  if (!f) return;
  f(fr, cam, style, soft);
  liveArm(style.id); // what moves in it may move (live.js)
}

/**
 * The desk front per programme: { hi, lo } panel colours (palette names) and an optional pattern:
 * 'grain' (wood: tanShade lines), 'stars' (silver points), 'stripe' (a band of the accent at the panel's foot).
 */
export const DESK_FRONTS = {
  // the home desk: black glass, glossy, the red LED's light on its front, red slits in its seams, a red light at its foot
  'world-now': { hi: 'black', lo: 'black', pattern: 'slits', slit: 'red', glow: 'red', sheen: true, base: 'red', zone: 'black', slab: 2.4 },
  // the steel plinth: a lit slab, the cyan line's light on its slate front, blue slits, a blue light at its foot
  'tech-bytes': { hi: 'slate', lo: 'black', pattern: 'slits', slit: 'blue', glow: 'cyan', sheen: true, base: 'blue', zone: 'ink', slab: 2.4 },
  // the darkest desk: a starry black front under a slab, the magenta line's light on it, a magenta foot light
  cosmos: { hi: 'black', lo: 'black', pattern: 'stars', slit: 'magenta', glow: 'magenta', sheen: true, base: 'magenta', zone: 'black', slab: 2.4 },
  // walnut under a slab, broken-run grain, a brass light at its foot (no LED slits: lime on wood reads as neon)
  'money-minute': { hi: 'brown', lo: 'black', pattern: 'grain', top: 'tanShade', sheen: true, base: 'warm', zone: 'black', slab: 2.4 },
  'news-60': { hi: 'ink', lo: 'black', pattern: 'stripe', stripe: 'yellow', slit: 'orange' },
};
