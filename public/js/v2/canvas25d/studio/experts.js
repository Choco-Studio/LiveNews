// The experts' studios (server/experts.js; owner 9 Oct: "los fondos pulelos"). Each of the channel's eight
// analysts joins from a studio of their desk, drawn behind them in the correspondents' shots (studio/remote.js:
// the location MCU, the two-way's right box). One virtual set per desk, in the channel's palette and pixel style:
//   markets      ECONOMICS   an office high over the city at dusk: towers with lit windows, a chart on the sill
//   bureau       DIPLOMACY   wood panelling, an old map of the world under a brass picture light, a sconce
//   field        CLIMATE     a window on snowy mountains and green hills, wind turbines turning, clouds, plants
//   observatory  SPACE       inside a dome at night: ribs, the open slit full of stars, the telescope, red lamps
//   lab          TECHNOLOGY  server racks with blinking lights, an oscilloscope, a cyan light strip
//   clinic       HEALTH      pale walls, a lightbox with a chest X-ray, a heart monitor, blinds
//   gallery      CULTURE     a slate wall, paintings in gold frames under track spots
//   chambers     LEGAL       shelves of bound law reports, a green banker's lamp, a brass scales
// Composition (the expert stands on the left third, REMOTE in studio/remote.js): calm, mid-dark tones behind the
// head so the face stays the brightest, warmest thing; the desk's story on the right two thirds; the edges a step
// darker (a lens falloff). No text anywhere: set text is whole or not there, and these are seen cropped.
// Each studio is built once into a cached layer; a few pixels move on top of it every frame (windows going on
// and off, turbines, stars, LEDs, the heart monitor), slow and small, never pulling the eye from the speaker.
//
//   drawExpertStudio(px, name, t)   the studio `name` into a 384x216 u32 frame at time t (s); false if unknown
//   EXPERT_STUDIOS                  the names
import { C, bayer } from '../pixbuf.js';
import { isLand } from './wall.js';

const W = 384, H = 216;

// ------------------------------------------------------------------------------------------------ toolkit

// one palette step darker / lighter, keeping the hue (relighting a built layer)
const DOWN = new Map(), UP = new Map();
for (const [a, b] of Object.entries({
  white: 'silver', silver: 'fog', fog: 'steel', steel: 'slate', slate: 'ink', ink: 'black', black: 'black',
  red: 'darkRed', darkRed: 'maroon', maroon: 'black', rust: 'brown', orange: 'rust', yellow: 'orange', cream: 'tan',
  skin: 'skinShade', skinShade: 'tanShade', tan: 'tanShade', tanShade: 'brown', brown: 'maroon',
  green: 'darkGreen', darkGreen: 'ink', cyan: 'blue', blue: 'navy', navy: 'ink', pink: 'magenta', magenta: 'purple', purple: 'maroon',
})) DOWN.set(C[a], C[b]);
for (const [a, b] of Object.entries({
  black: 'ink', ink: 'slate', slate: 'steel', steel: 'fog', fog: 'silver', silver: 'white', white: 'white',
  maroon: 'brown', brown: 'tanShade', tanShade: 'tan', tan: 'skin', skin: 'cream', skinShade: 'skin', cream: 'white',
  darkRed: 'red', red: 'pink', rust: 'orange', orange: 'yellow', yellow: 'cream',
  darkGreen: 'green', green: 'green', navy: 'blue', blue: 'blue', cyan: 'cyan', purple: 'magenta', magenta: 'pink', pink: 'pink',
})) UP.set(C[a], C[b]);

/** A seeded generator (mulberry32): the same studio every build. */
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

// the lens falloff's mask (falloff below), and whether the live layer is drawing: a live pixel in the falloff
// takes its step down too, so a light at the frame's edge is never brighter than the layer round it
const FALL = new Uint8Array(W * H);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const dx = (x - 170) / 250, dy = (y - 92) / 150;
    const d = Math.sqrt(dx * dx + dy * dy);
    FALL[y * W + x] = d >= 1.08 || (d >= 0.92 && (d - 0.92) / 0.16 >= bayer(x, y)) ? 1 : 0;
  }
}
let live = false;

const put = (px, x, y, c) => {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = y * W + x;
  px[i] = live && FALL[i] ? DOWN.get(c) ?? c : c;
};

function rect(px, x0, y0, x1, y1, c) {
  x0 = Math.max(0, Math.round(x0));
  y0 = Math.max(0, Math.round(y0));
  x1 = Math.min(W, Math.round(x1));
  y1 = Math.min(H, Math.round(y1));
  for (let y = y0; y < y1; y++) px.fill(c, y * W + x0, y * W + x1);
}

/**
 * Flat bands of `cols` from top to bottom (or left to right) over a rect, each change a narrow dithered seam:
 * it must read as pixel art, never as a smooth gradient.
 */
function bands(px, x0, y0, x1, y1, cols, horizontal = false, seam = 0.4) {
  const n = cols.length - 1;
  for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
      const f = horizontal ? ((x - x0) / Math.max(1, x1 - x0 - 1)) * n : ((y - y0) / Math.max(1, y1 - y0 - 1)) * n;
      let i = Math.min(n, Math.floor(f));
      const fr = f - i;
      if (i < n && fr > 1 - seam && (fr - (1 - seam)) / seam > bayer(x, y)) i++;
      px[y * W + x] = cols[i];
    }
  }
}

/**
 * Relight an ellipse by up to `steps` palette steps (UP lightens, DOWN darkens), falling to none at its edge:
 * flat rings with dithered seams. `only(c)` limits it to some colours.
 */
function relight(px, cx, cy, rx, ry, steps, map = UP, only = null, seam = 0.5) {
  const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(W, Math.ceil(cx + rx));
  const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(H, Math.ceil(cy + ry));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      const d = dx * dx + dy * dy;
      if (d >= 1) continue;
      const v = (1 - Math.sqrt(d)) * steps;
      let n = Math.floor(v);
      const fr = v - n;
      if (fr > 1 - seam && (fr - (1 - seam)) / seam > bayer(x, y)) n++;
      if (!n) continue;
      const i = y * W + x;
      let c = px[i];
      if (only && !only(c)) continue;
      for (let k = 0; k < n; k++) c = map.get(c) ?? c;
      px[i] = c;
    }
  }
}

/** The lens falloff: one palette step darker outside a wide ellipse round the frame's centre (dithered). */
function falloff(px) {
  for (let i = 0; i < W * H; i++) if (FALL[i]) px[i] = DOWN.get(px[i]) ?? px[i];
}

/** A 1 px line (Bresenham). */
function seg(px, x0, y0, x1, y1, c) {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx + dy;
  for (;;) {
    put(px, x0, y0, c);
    if (x0 === x1 && y0 === y1) return;
    const e2 = 2 * e;
    if (e2 >= dy) {
      e += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      e += dx;
      y0 += sy;
    }
  }
}

function disc(px, cx, cy, r, c) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) put(px, x, y, c);
    }
  }
}

/** A frame `t` px thick round a rect: lit colour on the top and left, shade on the bottom and right. */
function frameRect(px, x0, y0, x1, y1, t, lit, base, shade) {
  for (let k = 0; k < t; k++) {
    const c = k === 0 ? lit : k === t - 1 && t > 2 ? shade : base;
    rect(px, x0 + k, y0 + k, x1 - k, y0 + k + 1, k === 0 ? lit : base);
    rect(px, x0 + k, y0 + k, x0 + k + 1, y1 - k, k === 0 ? lit : base);
    rect(px, x0 + k, y1 - k - 1, x1 - k, y1 - k, k === 0 ? shade : c);
    rect(px, x1 - k - 1, y0 + k, x1 - k, y1 - k, k === 0 ? shade : c);
  }
}

/**
 * A gilt frame `t` px thick: an outer moulding lit on the top and left, a bevel catching the light, a run of
 * small ornaments, an inner shadow; its shadow on the wall below and to the right.
 */
function gilt(px, x0, y0, x1, y1, t = 4) {
  for (let k = 0; k < t; k++) {
    const a = x0 + k, b = y0 + k, c = x1 - 1 - k, d = y1 - 1 - k;
    const lit = k === 0 ? C.orange : k === 1 ? C.yellow : k === t - 1 ? C.brown : C.orange;
    const shade = k === 0 ? C.brown : k === 1 ? C.orange : k === t - 1 ? C.maroon : C.rust;
    rect(px, a, b, c + 1, b + 1, lit);
    rect(px, a, b, a + 1, d + 1, lit);
    rect(px, a, d, c + 1, d + 1, shade);
    rect(px, c, b, c + 1, d + 1, shade);
    // the ornament: a bead every third pixel along the middle moulding
    if (k === 2 && t >= 4) {
      for (let x = a + 1; x < c; x += 3) put(px, x, b, C.yellow), put(px, x, d, C.orange);
      for (let y = b + 1; y < d; y += 3) put(px, a, y, C.yellow), put(px, c, y, C.orange);
    }
  }
  for (const [x, y] of [[x0, y0], [x1 - 1, y0], [x0, y1 - 1], [x1 - 1, y1 - 1]]) put(px, x, y, C.yellow); // the corners' rosettes
  rect(px, x0 + 2, y1, x1 + 1, y1 + 1, C.black); // its shadow on the wall
  rect(px, x1, y0 + 2, x1 + 1, y1 + 1, C.black);
}

// ------------------------------------------------------------------------------------------------ markets

const MARKETS = { sill: 150, towers: [[6, 34, 64], [206, 28, 74], [236, 26, 44], [264, 34, 18], [300, 30, 58], [332, 52, 32]] };

function markets(px, r, st) {
  // dusk through a wall of glass: deep blue overhead, the last warm band on the horizon (behind the shoulders)
  bands(px, 0, 0, W, MARKETS.sill, [C.ink, C.navy, C.navy, C.purple, C.darkRed, C.rust, C.rust]);
  // the far city along the horizon: low slate blocks, a few lights
  for (let x = 0; x < W; ) {
    const w = 5 + ((r() * 14) | 0), h = 6 + ((r() * 20) | 0);
    rect(px, x, 134 - h, x + w, MARKETS.sill, C.slate);
    for (let wy = 136 - h; wy < 146; wy += 4) for (let wx = x + 1; wx < x + w - 1; wx += 3) if (r() < 0.16) put(px, wx, wy, C.orange);
    x += w + ((r() * 3) | 0);
  }
  // the near towers, each with a grid of windows (some lit), a lit left edge from the sunset
  st.windows = [];
  for (const [x, w, top] of MARKETS.towers) {
    rect(px, x, top, x + w, MARKETS.sill, C.ink);
    rect(px, x, top, x + 1, MARKETS.sill, C.slate);
    for (let wy = top + 4; wy < MARKETS.sill - 4; wy += 5) {
      for (let wx = x + 3; wx < x + w - 3; wx += 4) {
        const lit = r() < 0.42;
        const c = lit ? [C.yellow, C.cream, C.orange, C.orange][(r() * 4) | 0] : C.black;
        rect(px, wx, wy, wx + 2, wy + 2, c);
        if (r() < 0.06) st.windows.push({ x: wx, y: wy, on: c === C.black ? C.orange : c, period: 5 + r() * 14, phase: r() * 20 });
      }
    }
  }
  // the spire on the tallest tower, its aircraft light (animated)
  const sp = MARKETS.towers[3];
  seg(px, sp[0] + 17, sp[2] - 12, sp[0] + 17, sp[2], C.slate);
  st.beacon = [sp[0] + 17, sp[2] - 13];
  // a soft streak of reflection on the glass (right of the head): every other pixel a step lighter
  for (let y = 0; y < MARKETS.sill; y++) {
    const sx = 214 + Math.round((MARKETS.sill - y) * 0.35);
    for (let k = 0; k < 12; k++) if ((k + y) % 2 === 0 && (k > 1 && k < 10 || bayer(sx + k, y) > 0.5)) put(px, sx + k, y, UP.get(px[y * W + sx + k]) ?? C.white);
  }
  // the window's frame: thin black mullions
  for (const x of [58, 228]) rect(px, x, 0, x + 3, MARKETS.sill, C.black), rect(px, x, 0, x + 1, MARKETS.sill, C.ink);
  rect(px, 0, 0, W, 3, C.black);
  // the sill and the dark wood cabinet under it
  rect(px, 0, MARKETS.sill, W, MARKETS.sill + 1, C.tanShade);
  rect(px, 0, MARKETS.sill + 1, W, MARKETS.sill + 5, C.brown);
  rect(px, 0, MARKETS.sill + 5, W, MARKETS.sill + 6, C.black);
  bands(px, 0, MARKETS.sill + 6, W, H, [C.brown, C.maroon, C.maroon, C.black]);
  for (let x = 40; x < W; x += 96) rect(px, x, MARKETS.sill + 10, x + 1, H, C.black), rect(px, x + 1, MARKETS.sill + 10, x + 2, H, C.brown);
  // a monitor on the sill, a market chart (no figures): a grid, a line that climbs with a dip
  const m = { x0: 272, y0: 106, x1: 352, y1: 146 };
  rect(px, m.x0, m.y0, m.x1, m.y1, C.black);
  rect(px, m.x0 + 2, m.y0 + 2, m.x1 - 2, m.y1 - 2, C.ink);
  for (let y = m.y0 + 8; y < m.y1 - 2; y += 8) for (let x = m.x0 + 3; x < m.x1 - 2; x += 2) put(px, x, y, C.slate);
  rect(px, 308, m.y1, 316, MARKETS.sill, C.black);
  rect(px, 300, MARKETS.sill - 2, 324, MARKETS.sill, C.slate);
  const pts = [];
  let v = 0.25;
  for (let x = m.x0 + 4; x < m.x1 - 4; x += 3) {
    v = Math.min(0.92, Math.max(0.08, v + (r() - 0.38) * 0.14));
    pts.push([x, Math.round(m.y1 - 5 - v * (m.y1 - m.y0 - 10))]);
  }
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i];
    for (let yy = y + 1; yy < m.y1 - 3; yy++) if ((x + yy) % 2 === 0 || yy > y + 4) put(px, x, yy, (yy - y) % 4 === 0 ? C.ink : C.darkGreen);
    if (i) seg(px, pts[i - 1][0], pts[i - 1][1], x, y, C.green);
  }
  st.chartEnd = pts.at(-1);
  st.windows = st.windows.filter((w) => !(w.x + 1 >= m.x0 - 2 && w.x <= m.x1 + 2 && w.y + 1 >= m.y0 - 2) && !(w.x + 1 >= 58 && w.x <= 61) && !(w.x + 1 >= 228 && w.x <= 231));
  falloff(px);
}

function marketsLive(px, t, st) {
  for (const w of st.windows) {
    const on = ((t + w.phase) % w.period) / w.period < 0.7;
    const c = on ? w.on : C.black;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) put(px, w.x + i, w.y + j, c);
  }
  if (t % 1.6 < 0.22) put(px, st.beacon[0], st.beacon[1], C.red);
  else put(px, st.beacon[0], st.beacon[1], C.darkRed);
  const [cx, cy] = st.chartEnd;
  const p = (t % 2) / 2;
  put(px, cx, cy, p < 0.5 ? C.white : C.green);
  if (p < 0.3) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) put(px, cx + dx, cy + dy, C.green);
  // an airliner crossing the dusk, high and slow (one pass a minute)
  const q = (t % 60) / 60;
  if (q < 0.5) {
    const x = Math.round(-10 + q * 2 * (W + 20)), y = 14 + Math.round(q * 12);
    if (x >= 0 && x < W && px[y * W + x] !== C.black) {
      put(px, x, y, C.silver);
      if (t % 1.2 < 0.15) put(px, x + 1, y, C.red);
    }
  }
}

// ------------------------------------------------------------------------------------------------ bureau

const BUREAU = { map: [216, 46, 372, 134], stiles: [0, 76, 152, 228, 304, 380], dado: 146 };

function bureau(px, r, st) {
  bands(px, 0, 0, W, H, [C.brown, C.brown, C.maroon]);
  // raised panels: stiles and rails, each panel bevelled (lit top-left, shade bottom-right)
  for (let i = 0; i + 1 < BUREAU.stiles.length; i++) {
    const x0 = BUREAU.stiles[i] + 6, x1 = BUREAU.stiles[i + 1];
    for (const [y0, y1] of [[12, BUREAU.dado - 6], [BUREAU.dado + 14, H + 4]]) {
      rect(px, x0, y0, x1, y0 + 1, C.maroon);
      rect(px, x0, y0, x0 + 1, y1, C.maroon);
      rect(px, x0 + 1, y1 - 1, x1, y1, C.tanShade);
      rect(px, x1 - 1, y0 + 1, x1, y1, C.tanShade);
      // the raised field: lit bevel, a field a touch lighter at the top
      const fx0 = x0 + 6, fx1 = x1 - 6, fy0 = y0 + 6, fy1 = y1 - 6;
      bands(px, fx0, fy0, fx1, fy1, [C.brown, C.brown, C.maroon]);
      rect(px, fx0 - 2, fy0 - 2, fx1 + 2, fy0, C.tanShade);
      rect(px, fx0 - 2, fy0 - 2, fx0, fy1 + 2, C.tanShade);
      rect(px, fx0 - 2, fy1, fx1 + 2, fy1 + 2, C.maroon);
      rect(px, fx1, fy0, fx1 + 2, fy1 + 2, C.maroon);
    }
  }
  for (const x of BUREAU.stiles) rect(px, x, 0, x + 1, H, C.maroon);
  // the dado rail: a moulding in three tones and its shadow
  rect(px, 0, BUREAU.dado, W, BUREAU.dado + 1, C.tan);
  rect(px, 0, BUREAU.dado + 1, W, BUREAU.dado + 4, C.tanShade);
  rect(px, 0, BUREAU.dado + 4, W, BUREAU.dado + 6, C.brown);
  rect(px, 0, BUREAU.dado + 6, W, BUREAU.dado + 7, C.black);
  // the sconce on the left (a warm pool round it) and the picture light over the map
  relight(px, 34, 52, 52, 56, 2.2);
  rect(px, 30, 44, 38, 62, C.orange);
  rect(px, 30, 44, 31, 62, C.yellow);
  rect(px, 26, 34, 42, 44, C.cream);
  rect(px, 27, 34, 41, 36, C.white);
  rect(px, 26, 43, 42, 44, C.tan);
  const [mx0, my0, mx1, my1] = BUREAU.map;
  relight(px, (mx0 + mx1) / 2, my0 - 6, 120, 92, 1.6);
  // the map: an old chart on parchment, the land in tan with a brown coast, a faint graticule, aged edges
  const ix0 = mx0 + 4, iy0 = my0 + 4, ix1 = mx1 - 4, iy1 = my1 - 4;
  const land = (x, y) => isLand(78 - ((y - iy0 + 0.5) / (iy1 - iy0)) * 136, -180 + ((x - ix0 + 0.5) / (ix1 - ix0)) * 360);
  for (let y = iy0; y < iy1; y++) {
    for (let x = ix0; x < ix1; x++) {
      const edge = Math.min(x - ix0, ix1 - 1 - x, y - iy0, iy1 - 1 - y);
      let c = C.cream;
      if (land(x, y)) c = !land(x - 1, y) || !land(x + 1, y) || !land(x, y - 1) || !land(x, y + 1) ? C.tanShade : C.tan;
      else if ((x - ix0) % 25 === 12 || (y - iy0) % 21 === 10) c = (x + y) % 2 ? C.tan : C.cream;
      if (edge < 3 && edge + bayer(x, y) * 3 < 3) c = DOWN.get(c) ?? c;
      px[y * W + x] = c;
    }
  }
  gilt(px, mx0, my0, mx1, my1, 4);
  // the picture light: a brass bar on two arms, its wash on the map's top
  const lc = (mx0 + mx1) / 2, ly = my0 - 9;
  rect(px, lc - 34, ly, lc + 34, ly + 3, C.orange);
  rect(px, lc - 34, ly, lc + 34, ly + 1, C.yellow);
  rect(px, lc - 34, ly + 3, lc + 34, ly + 4, C.rust);
  seg(px, lc - 24, ly + 4, lc - 20, my0, C.rust);
  seg(px, lc + 24, ly + 4, lc + 20, my0, C.rust);
  relight(px, lc, my0 + 2, 70, 26, 1.2, UP, (c) => c === C.cream || c === C.tan || c === C.tanShade);
  // the world's capitals as small pins (they glow in turn)
  st.pins = [];
  for (const [la, lo] of [[51.5, -0.1], [38.9, -77], [48.9, 2.35], [39.9, 116.4], [55.75, 37.6], [-15.8, -47.9], [28.6, 77.2], [-1.3, 36.8], [35.7, 139.7], [30.0, 31.2], [-35.3, 149.1], [19.4, -99.1]]) {
    st.pins.push([Math.round(ix0 + ((lo + 180) / 360) * (ix1 - ix0)), Math.round(iy0 + ((78 - la) / 136) * (iy1 - iy0)), r() * 6]);
  }
  for (const [x, y] of st.pins) put(px, x, y, C.darkRed);
  falloff(px);
}

function bureauLive(px, t, st) {
  for (const [x, y, ph] of st.pins) {
    const p = ((t + ph) % 6) / 6;
    if (p < 0.12) {
      put(px, x, y, C.red);
      if (p < 0.06) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) put(px, x + dx, y + dy, C.darkRed);
    }
  }
}

// ------------------------------------------------------------------------------------------------ field

const FIELD = { win: [170, 12, 376, 150], mull: 270 };

function field(px, r, st) {
  const [wx0, wy0, wx1, wy1] = FIELD.win;
  // the room: a slate wall, brighter toward the window
  bands(px, 0, 0, W, H, [C.ink, C.slate, C.slate, C.steel], true);
  bands(px, 0, 150, W, H, [C.slate, C.ink]);
  relight(px, 150, 70, 130, 110, 1.2);
  // the sky
  bands(px, wx0, wy0, wx1, 112, [C.navy, C.blue, C.blue, C.fog, C.silver]);
  st.sky = new Uint8Array(W * H);
  // far mountains: a ridge with snow above the line, lit slopes facing left
  const ridge = (x) => 84 - 20 * Math.max(0, Math.sin((x - 150) / 26)) ** 1.6 - 14 * Math.max(0, Math.sin((x - 120) / 41 + 1)) ** 2 - 4 * Math.sin(x / 7);
  for (let x = wx0; x < wx1; x++) {
    const top = Math.round(ridge(x));
    const slope = ridge(x + 1) - ridge(x - 1);
    for (let y = top; y < 112; y++) {
      const snow = y < 72 + 4 * Math.sin(x / 5) + (y - top) * 0.2 && y - top < 12;
      let c = snow ? (slope > 0 ? C.white : C.silver) : slope > 0 ? C.steel : C.slate;
      if (!snow && y - top > 14) c = (x + y) % 2 ? C.slate : C.steel;
      if (y >= top) px[y * W + x] = c;
    }
  }
  // green hills in two ranges, rounded
  const hill1 = (x) => 98 - 9 * Math.sin((x - 170) / 30) - 4 * Math.sin(x / 11);
  const hill2 = (x) => 116 - 6 * Math.sin((x - 200) / 22 + 2) - 3 * Math.sin(x / 8);
  for (let x = wx0; x < wx1; x++) {
    const a = Math.round(hill1(x)), b = Math.round(hill2(x));
    for (let y = a; y < wy1; y++) px[y * W + x] = y < a + 2 ? C.green : (x + y) % 3 === 0 && y < b ? C.green : C.darkGreen;
    for (let y = b; y < wy1; y++) px[y * W + x] = y < b + 2 ? C.green : y > 138 && (x * 7 + y) % 5 === 0 ? C.green : C.darkGreen;
  }
  // trees along the near hill (dark rounded tops)
  for (let x = wx0 + 6; x < wx1 - 4; x += 9 + ((r() * 9) | 0)) {
    const y = Math.round(hill2(x)) - 2;
    disc(px, x, y, 2.6, C.ink);
    put(px, x - 1, y - 1, C.darkGreen);
  }
  for (let x = wx0; x < wx1; x++) for (let y = wy0, top = Math.min(ridge(x), hill1(x)); y < top; y++) st.sky[y * W + x] = 1;
  // three wind turbines on the far hill: white towers (the blades turn, live)
  st.turbines = [];
  for (const [x, h] of [[300, 26], [326, 22], [350, 18]]) {
    const base = Math.round(hill1(x)) + 1, hub = base - h;
    seg(px, x, hub, x, base, C.white);
    seg(px, x + 1, hub + 3, x + 1, base, C.silver);
    st.turbines.push({ x, y: hub, len: Math.round(h * 0.46), phase: r() * 6 });
  }
  st.clouds = [[0.05, 26, 1.0], [0.42, 40, 0.75], [0.74, 22, 0.85]];
  // the window: a white frame, a mullion, the sill
  frameRect(px, wx0 - 3, wy0 - 3, wx1 + 3, wy1 + 1, 3, C.white, C.silver, C.fog);
  rect(px, FIELD.mull, wy0, FIELD.mull + 3, wy1, C.silver);
  rect(px, FIELD.mull, wy0, FIELD.mull + 1, wy1, C.white);
  for (let y = wy0; y < wy1; y++) st.sky[y * W + FIELD.mull] = st.sky[y * W + FIELD.mull + 1] = st.sky[y * W + FIELD.mull + 2] = 0;
  rect(px, wx0 - 6, wy1, wx1 + 6, wy1 + 2, C.white);
  rect(px, wx0 - 6, wy1 + 2, wx1 + 6, wy1 + 5, C.silver);
  rect(px, wx0 - 6, wy1 + 5, wx1 + 6, wy1 + 6, C.slate);
  // plants: a tall one on the right in a terracotta pot, a small one on a shelf on the left
  const leaf = (x, y, rx, ry, a) => {
    for (let j = -ry; j <= ry; j++) for (let i = -rx; i <= rx; i++) {
      if ((i * i) / (rx * rx) + (j * j) / (ry * ry) > 1) continue;
      const u = Math.round(x + i * Math.cos(a) - j * Math.sin(a)), v = Math.round(y + i * Math.sin(a) + j * Math.cos(a));
      put(px, u, v, j < 0 ? C.green : C.darkGreen);
    }
  };
  for (let k = 0; k < 16; k++) {
    const a = -Math.PI / 2 + (r() - 0.5) * 2.2, len = 30 + r() * 50;
    const x = 362 + Math.cos(a) * len * 0.55, y = 182 + Math.sin(a) * len;
    seg(px, 362, 182, x, y, C.darkGreen);
    leaf(x, y, 7, 3, a + Math.PI / 2 + (r() - 0.5));
  }
  rect(px, 346, 180, 380, H, C.rust);
  rect(px, 344, 178, 382, 183, C.orange);
  rect(px, 372, 183, 380, H, C.brown);
  rect(px, 0, 120, 60, 123, C.silver);
  rect(px, 0, 123, 60, 125, C.slate);
  rect(px, 18, 106, 34, 120, C.rust);
  rect(px, 18, 106, 34, 108, C.orange);
  for (let k = 0; k < 6; k++) leaf(26 + (r() - 0.5) * 16, 100 - r() * 10, 5, 2, r() * 3);
  falloff(px);
}

function fieldLive(px, t, st) {
  // clouds drifting right, behind the mountains (only on sky pixels)
  const [wx0, , wx1] = FIELD.win;
  for (const [x0, y, sz] of st.clouds) {
    const span = wx1 - wx0 + 80;
    const cx = wx0 - 40 + (((x0 + t / 240) % 1) * span);
    for (const [dx, dy, rr] of [[0, 0, 7], [8, -3, 8], [17, 0, 6], [-8, 2, 5], [24, 2, 4]]) {
      const R = rr * sz;
      for (let j = Math.floor(-R); j <= R; j++) {
        for (let i = Math.floor(-R); i <= R; i++) {
          if (i * i + j * j > R * R) continue;
          const x = Math.round(cx + dx * sz + i), yy = Math.round(y + dy * sz + j);
          if (x < 0 || x >= W || yy < 0 || yy >= H || !st.sky[yy * W + x]) continue;
          put(px, x, yy, j > R * 0.35 ? C.silver : C.white);
        }
      }
    }
  }
  // the turbines' blades (three, a slow turn)
  for (const tb of st.turbines) {
    const a0 = t * 1.1 + tb.phase;
    for (let k = 0; k < 3; k++) {
      const a = a0 + (k * Math.PI * 2) / 3;
      seg(px, tb.x, tb.y, tb.x + Math.cos(a) * tb.len, tb.y + Math.sin(a) * tb.len, C.white);
    }
    put(px, tb.x, tb.y, C.silver);
  }
}

// ------------------------------------------------------------------------------------------------ observatory

const OBS = { slit: [220, 314], ring: 150, scope: [[344, 206], [262, 52]], r: 15 };

function observatory(px, r, st) {
  rect(px, 0, 0, W, H, C.black);
  // the dome's panels between ribs converging overhead, each a touch lighter on its lit (left) side
  const cx = 267, top = -190, ribs = [];
  for (let k = -7; k <= 7; k++) ribs.push(cx + k * 62);
  const ribX = (bx, y) => cx + (bx - cx) * ((y - top) / (OBS.ring - top)) ** 0.8;
  for (let y = 0; y < OBS.ring; y++) {
    for (let k = 0; k + 1 < ribs.length; k++) {
      const x0 = Math.round(ribX(ribs[k], y)), x1 = Math.round(ribX(ribs[k + 1], y));
      for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
        const f = (x - x0) / Math.max(1, x1 - x0);
        px[y * W + x] = f < 0.18 || (f < 0.3 && bayer(x, y) > (f - 0.18) / 0.12) ? C.ink : C.black;
      }
    }
  }
  relight(px, 150, 160, 260, 150, 1.2, UP, (c) => c === C.black);
  for (const bx of ribs) {
    for (let y = 0; y < OBS.ring; y++) {
      const x = Math.round(ribX(bx, y));
      put(px, x - 1, y, C.slate);
      put(px, x, y, C.steel);
      put(px, x + 1, y, C.slate);
      put(px, x + 2, y, C.black);
    }
  }
  // the ring the dome turns on, and the wall under it in the red of the night lamps
  rect(px, 0, OBS.ring, W, OBS.ring + 1, C.steel);
  rect(px, 0, OBS.ring + 1, W, OBS.ring + 5, C.slate);
  rect(px, 0, OBS.ring + 5, W, OBS.ring + 6, C.black);
  for (let x = 4; x < W; x += 12) put(px, x, OBS.ring + 3, C.ink);
  bands(px, 0, OBS.ring + 6, W, H, [C.maroon, C.black, C.black]);
  // the slit: the night through it, the Milky Way across it, stars
  const [sx0, sx1] = OBS.slit;
  bands(px, sx0, 0, sx1, OBS.ring, [C.black, C.ink, C.ink, C.navy]);
  for (let y = 0; y < OBS.ring; y++) {
    for (let x = sx0; x < sx1; x++) {
      const d = Math.abs((x - sx0) * 0.8 + y * 0.6 - 74);
      if (d < 16 && (d < 6 || bayer(x, y) > (d - 6) / 10)) px[y * W + x] = d < 5 && (x * 5 + y * 3) % 7 < 2 ? C.steel : C.slate;
    }
  }
  st.stars = [];
  for (let k = 0; k < 120; k++) {
    const x = sx0 + 2 + ((r() * (sx1 - sx0 - 4)) | 0), y = 2 + ((r() * (OBS.ring - 8)) | 0);
    const c = r() < 0.14 ? C.white : r() < 0.45 ? C.silver : C.fog;
    put(px, x, y, c);
    if (c === C.white && r() < 0.5) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) put(px, x + dx, y + dy, C.fog);
    if (r() < 0.3) st.stars.push([x, y, c, 1.5 + r() * 4, r() * 6]);
  }
  // the slit's shutter rails
  for (const x of [sx0 - 4, sx1]) {
    rect(px, x, 0, x + 4, OBS.ring, C.slate);
    rect(px, x, 0, x + 1, OBS.ring, C.fog);
    rect(px, x + 3, 0, x + 4, OBS.ring, C.black);
    for (let y = 6; y < OBS.ring; y += 14) put(px, x + 2, y, C.ink);
  }
  // the telescope on its pier: a white tube aimed at the slit (lit from the left), black bands, the dark dew
  // shield, a finder, a counterweight
  const [[ax, ay], [bx, by]] = OBS.scope;
  const len = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / len, uy = (by - ay) / len, nx = -uy, ny = ux;
  const tube = (ox, oy, rad, from, to, tone) => {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const qx = x - ax - ox, qy = y - ay - oy;
        const along = qx * ux + qy * uy, across = qx * nx + qy * ny;
        if (along < from || along > to || Math.abs(across) > rad) continue;
        px[y * W + x] = tone(along, across / rad);
      }
    }
  };
  const pivot = [ax + ux * 46, ay + uy * 46];
  // the pier and the fork
  rect(px, pivot[0] - 9, pivot[1] + 8, pivot[0] + 9, H, C.slate);
  rect(px, pivot[0] - 9, pivot[1] + 8, pivot[0] - 7, H, C.steel);
  rect(px, pivot[0] + 7, pivot[1] + 8, pivot[0] + 9, H, C.ink);
  rect(px, pivot[0] - 16, 200, pivot[0] + 16, 204, C.ink);
  seg(px, pivot[0] - 16, 200, pivot[0] + 16, 200, C.steel);
  // the counterweight on its shaft, behind the tube
  seg(px, pivot[0], pivot[1], pivot[0] + 30, pivot[1] + 18, C.steel);
  rect(px, pivot[0] + 26, pivot[1] + 12, pivot[0] + 38, pivot[1] + 24, C.slate);
  rect(px, pivot[0] + 26, pivot[1] + 12, pivot[0] + 38, pivot[1] + 13, C.fog);
  const body = (al, ac) => (len - al < 20 ? (ac < -0.55 ? C.slate : C.ink) : ac < -0.62 ? C.white : ac < 0.1 ? C.silver : ac < 0.62 ? C.fog : C.steel);
  tube(0, 0, OBS.r, 0, len, body);
  for (const at of [12, 50, len - 22]) tube(0, 0, OBS.r + 1, at, at + 3, (al, ac) => (ac < -0.4 ? C.slate : C.black));
  tube(0, 0, OBS.r - 3, len - 2, len, () => C.black);
  tube(nx * -(OBS.r + 4), ny * -(OBS.r + 4), 3, 70, len - 34, (al, ac) => (ac < 0 ? C.silver : C.fog));
  tube(nx * -(OBS.r + 4), ny * -(OBS.r + 4), 3, len - 36, len - 32, () => C.black);
  st.led = [Math.round(pivot[0] - 3), Math.round(pivot[1] + 20)];
  rect(px, st.led[0] - 2, st.led[1] - 2, st.led[0] + 3, st.led[1] + 3, C.ink);
  // red night lamps on the ring and their glow below (never a white light in a dome at night)
  for (const lx of [24, 196, 372]) {
    relight(px, lx, OBS.ring + 12, 30, 16, 1.4, new Map([[C.black, C.maroon], [C.maroon, C.darkRed], [C.ink, C.maroon], [C.slate, C.brown]]));
    rect(px, lx - 2, OBS.ring + 6, lx + 3, OBS.ring + 9, C.red);
    put(px, lx - 1, OBS.ring + 6, C.pink);
  }
  falloff(px);
}

function observatoryLive(px, t, st) {
  for (const [x, y, c, per, ph] of st.stars) {
    const p = ((t + ph) % per) / per;
    put(px, x, y, p < 0.15 ? C.white : p < 0.5 ? c : DOWN.get(c));
  }
  // a meteor through the slit now and then
  const p = t % 13;
  if (p < 0.5) {
    const k = p / 0.5;
    const x = OBS.slit[1] - 6 - k * 60, y = 12 + k * 30;
    for (let i = 0; i < 6; i++) {
      const tx = Math.round(x + i * 1.5), ty = Math.round(y - i * 1);
      if (tx > OBS.slit[0] && tx < OBS.slit[1] && ty >= 0) put(px, tx, ty, i === 0 ? C.white : i < 3 ? C.silver : C.fog);
    }
  }
  put(px, st.led[0], st.led[1], t % 2 < 1.6 ? C.green : C.darkGreen);
}

// ------------------------------------------------------------------------------------------------ lab

const LAB = { racks: [242, 290, 338], top: 14, scope: [178, 94, 234, 134] };

function lab(px, r, st) {
  bands(px, 0, 0, W, H, [C.ink, C.ink, C.black]);
  // acoustic panels: seams every 32 px, a faint lit top edge
  for (let x = 0; x < 240; x += 32) rect(px, x, 30, x + 1, 170, C.black);
  rect(px, 0, 30, 240, 31, C.slate);
  // a soft wash on the wall behind the speaker (a dark top on a dark wall needs it to separate)
  relight(px, 120, 96, 130, 100, 1.2, UP, (c) => c === C.ink || c === C.black);
  // a cyan light strip along the wall, its glow
  rect(px, 0, 22, 240, 23, C.cyan);
  rect(px, 0, 23, 240, 24, C.blue);
  for (let x = 0; x < 240; x++) for (let y = 24; y < 29; y++) if (bayer(x, y) < (29 - y) / 8) px[y * W + x] = C.navy;
  // the server racks: black cabinets of 8 px units (vented faces, drive bays, handles), a column of status
  // lights on each, a cool light from above
  st.leds = [];
  for (const x0 of LAB.racks) {
    rect(px, x0, LAB.top, x0 + 46, H, C.black);
    rect(px, x0 + 2, LAB.top + 2, x0 + 44, H, C.ink);
    rect(px, x0, LAB.top, x0 + 46, LAB.top + 1, C.steel);
    for (let y = LAB.top + 4; y < 204; y += 8) {
      const kind = r();
      rect(px, x0 + 3, y, x0 + 43, y + 7, kind < 0.45 ? C.slate : C.ink);
      rect(px, x0 + 3, y, x0 + 43, y + 1, kind < 0.45 ? C.steel : C.slate);
      rect(px, x0 + 3, y + 7, x0 + 43, y + 8, C.black);
      rect(px, x0 + 3, y + 1, x0 + 4, y + 7, C.fog); // the handles
      rect(px, x0 + 42, y + 1, x0 + 43, y + 7, C.steel);
      if (kind < 0.45) for (let x = x0 + 7; x < x0 + 28; x += 2) put(px, x, y + 3, C.black), put(px, x + 1, y + 5, C.black);
      else for (let x = x0 + 7; x < x0 + 28; x += 4) rect(px, x, y + 2, x + 3, y + 6, C.black), put(px, x, y + 2, C.slate);
      const n = 1 + ((r() * 3) | 0);
      for (let k = 0; k < n; k++) {
        const lx = x0 + 31 + k * 3, ly = y + 3;
        const roll = r();
        const c = roll < 0.6 ? C.green : roll < 0.82 ? C.cyan : roll < 0.95 ? C.yellow : C.red;
        const off = c === C.cyan ? C.navy : c === C.green ? C.darkGreen : c === C.yellow ? C.rust : C.maroon;
        rect(px, lx, ly, lx + 2, ly + 1, off);
        st.leds.push([lx, ly, c, r() < 0.3 ? 0 : 0.3 + r() * 3, r() * 5]);
      }
    }
    rect(px, x0 + 44, LAB.top, x0 + 46, H, C.black);
  }
  relight(px, 312, LAB.top - 20, 120, 110, 1.3, UP, (c) => c === C.ink || c === C.slate || c === C.steel);
  // the cable tray over the racks
  rect(px, 236, 6, W, 9, C.slate);
  rect(px, 236, 6, W, 7, C.fog);
  for (let x = 240; x < W; x += 10) rect(px, x, 9, x + 1, LAB.top, C.slate);
  // a desk under the scope, the scope's monitor: a black screen, a green grid (the trace is live)
  rect(px, 150, 150, 240, 152, C.slate);
  rect(px, 150, 152, 240, H, C.black);
  const [sx0, sy0, sx1, sy1] = LAB.scope;
  rect(px, sx0, sy0, sx1, sy1, C.slate);
  rect(px, sx0 + 2, sy0 + 2, sx1 - 2, sy1 - 2, C.black);
  for (let y = sy0 + 4; y < sy1 - 2; y += 6) for (let x = sx0 + 3; x < sx1 - 2; x += 2) put(px, x, y, C.ink);
  for (let x = sx0 + 6; x < sx1 - 2; x += 8) for (let y = sy0 + 3; y < sy1 - 2; y += 2) put(px, x, y, C.ink);
  rect(px, (sx0 + sx1) / 2 - 3, sy1, (sx0 + sx1) / 2 + 3, 150, C.ink);
  falloff(px);
}

function labLive(px, t, st) {
  for (const [x, y, c, hz, ph] of st.leds) {
    if (!hz || ((t + ph) * hz) % 1 < 0.6) put(px, x, y, c), put(px, x + 1, y, c);
  }
  const [sx0, sy0, sx1, sy1] = LAB.scope;
  const mid = (sy0 + sy1) / 2;
  let py = null;
  for (let x = sx0 + 3; x < sx1 - 3; x++) {
    const y = Math.round(mid + Math.sin((x - sx0) * 0.32 - t * 3) * 9 * (0.7 + 0.3 * Math.sin(t * 0.7)));
    if (py !== null) seg(px, x - 1, py, x, y, C.cyan);
    py = y;
  }
}

// ------------------------------------------------------------------------------------------------ clinic

const CLINIC = { rail: 148, box: [252, 40, 372, 126], ecg: [196, 96, 246, 128] };

function clinic(px, r, st) {
  bands(px, 0, 0, W, CLINIC.rail, [C.fog, C.fog, C.steel]);
  relight(px, 60, 20, 170, 120, 1);
  rect(px, 0, CLINIC.rail, W, CLINIC.rail + 1, C.blue);
  rect(px, 0, CLINIC.rail + 1, W, CLINIC.rail + 5, C.navy);
  rect(px, 0, CLINIC.rail + 5, W, CLINIC.rail + 6, C.ink);
  bands(px, 0, CLINIC.rail + 6, W, H, [C.steel, C.slate]);
  // blinds on the left: slats over the daylight
  frameRect(px, 2, 16, 64, 128, 2, C.white, C.silver, C.steel);
  for (let y = 18; y < 126; y++) {
    const k = (y - 18) % 5;
    rect(px, 4, y, 62, y + 1, k === 0 ? C.white : k === 1 ? C.silver : k === 4 ? C.steel : C.fog);
  }
  for (const x of [20, 46]) rect(px, x, 18, x + 1, 126, C.steel);
  // the lightbox and its chest X-ray (bone light on dark film)
  const [bx0, by0, bx1, by1] = CLINIC.box;
  relight(px, (bx0 + bx1) / 2, (by0 + by1) / 2, 100, 74, 1);
  frameRect(px, bx0, by0, bx1, by1, 3, C.fog, C.steel, C.slate);
  rect(px, bx0 + 3, by0 + 3, bx1 - 3, by1 - 3, C.white);
  const fx0 = bx0 + 7, fy0 = by0 + 7, fx1 = bx1 - 7, fy1 = by1 - 7, sp = (fx0 + fx1) / 2;
  rect(px, fx0, fy0, fx1, fy1, C.ink);
  // the lungs: two darker fields
  for (const side of [-1, 1]) {
    const lx = sp + side * 22;
    for (let y = fy0 + 8; y < fy1 - 6; y++) for (let x = lx - 16; x < lx + 16; x++) {
      const d = ((x - lx) / 16) ** 2 + ((y - (fy0 + fy1) / 2 - 2) / 30) ** 2;
      if (d < 1) px[y * W + x] = d < 0.7 || bayer(x, y) > 0.5 ? C.black : C.ink;
    }
  }
  // spine, ribs, collarbones, the heart's shadow
  for (let y = fy0 + 2; y < fy1; y++) {
    rect(px, sp - 2, y, sp + 2, y + 1, (y - fy0) % 6 === 0 ? C.steel : C.fog);
    put(px, sp - 2, y, C.steel);
  }
  for (let i = 0; i < 8; i++) {
    const y0 = fy0 + 14 + i * 8;
    for (const side of [-1, 1]) {
      let px0 = sp + side * 2, py0 = y0;
      for (let s = 1; s <= 24; s++) {
        const a = s / 24;
        const x = sp + side * (2 + a * 34 - a * a * 6), y = y0 - 4 * Math.sin(a * Math.PI * 0.9) + a * a * 12;
        seg(px, px0, py0, x, y, a > 0.8 ? C.steel : a > 0.55 ? C.fog : C.silver);
        px0 = x;
        py0 = y;
      }
    }
  }
  for (const side of [-1, 1]) seg(px, sp + side * 3, fy0 + 8, sp + side * 34, fy0 + 4, C.silver);
  for (let y = fy0 + 38; y < fy0 + 62; y++) for (let x = sp - 22; x < sp - 2; x++) {
    const d = ((x - sp + 10) / 13) ** 2 + ((y - fy0 - 50) / 13) ** 2;
    if (d < 1 && px[y * W + x] !== C.silver && px[y * W + x] !== C.fog && bayer(x, y) < 0.55) px[y * W + x] = C.slate;
  }
  // the heart monitor on a wall shelf: a black screen with a faint grid (the trace is live), a red heart light
  const [ex0, ey0, ex1, ey1] = CLINIC.ecg;
  rect(px, ex0 - 4, ey1 + 1, ex1 + 4, ey1 + 3, C.silver);
  rect(px, ex0 - 4, ey1 + 3, ex1 + 4, ey1 + 4, C.slate);
  for (const bx of [ex0 + 2, ex1 - 4]) seg(px, bx, ey1 + 4, bx + 2, ey1 + 9, C.steel);
  frameRect(px, ex0, ey0, ex1, ey1, 2, C.slate, C.ink, C.black);
  rect(px, ex0 + 2, ey0 + 2, ex1 - 2, ey1 - 2, C.black);
  for (let y = ey0 + 6; y < ey1 - 2; y += 6) for (let x = ex0 + 4; x < ex1 - 2; x += 3) put(px, x, y, C.ink);
  st.heart = [ex1 - 7, ey0 + 5];
  falloff(px);
}

function clinicLive(px, t, st) {
  const [ex0, ey0, ex1, ey1] = CLINIC.ecg;
  const mid = ey0 + 22, x0 = ex0 + 3, x1 = ex1 - 3, span = x1 - x0;
  const beat = 0.85; // s per beat
  const head = ((t / 2.2) % 1) * span; // the sweep
  const wave = (u) => {
    const ph = (u % beat) / beat;
    if (ph < 0.08) return -Math.sin((ph / 0.08) * Math.PI) * 2;
    if (ph > 0.2 && ph < 0.24) return 4;
    if (ph >= 0.24 && ph < 0.29) return -13;
    if (ph >= 0.29 && ph < 0.33) return 6;
    if (ph > 0.5 && ph < 0.66) return -Math.sin(((ph - 0.5) / 0.16) * Math.PI) * 3;
    return 0;
  };
  let prev = null;
  for (let i = 0; i < span; i++) {
    const age = (head - i + span) % span; // px since the sweep passed
    if (age > span - 8) {
      prev = null;
      continue;
    }
    const y = Math.round(mid + wave((t - age * (2.2 / span)) + 10));
    const c = age < 3 ? C.white : age < span * 0.6 ? C.green : C.darkGreen;
    if (prev !== null) seg(px, x0 + i - 1, prev, x0 + i, y, c);
    else put(px, x0 + i, y, c);
    prev = y;
  }
  const ph = (t % beat) / beat;
  const [hx, hy] = st.heart;
  const c = ph > 0.22 && ph < 0.4 ? C.red : C.darkRed;
  for (const [dx, dy] of [[0, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [2, 1], [3, 1], [0, 2], [1, 2], [2, 2], [1, 3]]) put(px, hx + dx - 1, hy + dy - 1, c);
}

// ------------------------------------------------------------------------------------------------ gallery

// (the landscape starts right of x 212: the two-way crops x 36..212 round the expert's head, never half a frame)
const GALLERY = { land: [216, 30, 330, 106], portrait: [340, 38, 380, 102], field: [4, 34, 58, 108], floor: 196, spots: [[34, 30], [272, 30], [360, 36]] };

function gallery(px, r, st) {
  bands(px, 0, 0, W, GALLERY.floor, [C.ink, C.slate, C.slate, C.slate, C.ink]);
  // pools of light under the spots
  for (const [x, y] of GALLERY.spots) relight(px, x, y + 34, 70, 66, 1.6);
  // the track and its spots
  rect(px, 0, 4, W, 7, C.black);
  rect(px, 0, 4, W, 5, C.slate);
  for (const [x] of GALLERY.spots) {
    rect(px, x - 2, 7, x + 3, 10, C.black);
    rect(px, x - 4, 10, x + 5, 16, C.ink);
    rect(px, x - 4, 10, x - 3, 16, C.steel);
    rect(px, x - 3, 16, x + 4, 17, C.cream);
  }
  // a landscape in oils: an evening sky, the sun low, hills, a river
  const [lx0, ly0, lx1, ly1] = GALLERY.land;
  const ix0 = lx0 + 4, iy0 = ly0 + 4, ix1 = lx1 - 4, iy1 = ly1 - 4;
  bands(px, ix0, iy0, ix1, iy1 - 24, [C.navy, C.blue, C.fog, C.cream, C.yellow], false, 0.9);
  for (const [cx, cy, w] of [[ix0 + 18, iy0 + 9, 16], [ix0 + 58, iy0 + 15, 12], [ix0 + 90, iy0 + 7, 10]]) {
    for (let k = 0; k < w; k++) put(px, cx + k, cy + (k % 5 === 0 ? -1 : 0), k % 4 ? C.silver : C.white);
    for (let k = 2; k < w - 3; k++) put(px, cx + k, cy + 1, C.fog);
  }
  disc(px, ix0 + 76, iy1 - 30, 6, C.cream);
  disc(px, ix0 + 76, iy1 - 30, 4, C.white);
  for (let x = ix0; x < ix1; x++) {
    const h1 = Math.round(iy1 - 30 + 4 * Math.sin((x - ix0) / 9) + 3 * Math.sin((x - ix0) / 4));
    const h2 = Math.round(iy1 - 18 + 3 * Math.sin((x - ix0) / 14 + 2));
    for (let y = h1; y < iy1; y++) px[y * W + x] = y < h2 ? ((x + y) % 3 ? C.darkGreen : C.green) : C.darkGreen;
  }
  for (let y = iy1 - 9; y < iy1; y++) for (let x = ix0 + 20 + (iy1 - y) * 2; x < ix0 + 60 + (iy1 - y) * 3 && x < ix1; x++) px[y * W + x] = (x + y * 3) % 7 === 0 ? C.fog : C.navy;
  for (let k = 0; k < 7; k++) {
    const x = ix0 + 6 + ((r() * 40) | 0), y = iy1 - 22 - ((r() * 6) | 0);
    disc(px, x, y, 2.2, C.ink);
    put(px, x, y + 3, C.maroon);
  }
  gilt(px, lx0, ly0, lx1, ly1, 4);
  // a small portrait: a dark ground, a sitter in black with a lace collar
  const [px0, py0, px1, py1] = GALLERY.portrait;
  bands(px, px0 + 3, py0 + 3, px1 - 3, py1 - 3, [C.brown, C.maroon, C.black]);
  const pc = (px0 + px1) / 2;
  for (let y = py0 + 36; y < py1 - 3; y++) for (let x = px0 + 3; x < px1 - 3; x++) if (Math.abs(x - pc) < 6 + (y - py0 - 36) * 0.9) px[y * W + x] = C.black;
  rect(px, pc - 5, py0 + 36, pc + 6, py0 + 38, C.cream);
  for (let y = py0 + 14; y < py0 + 36; y++) for (let x = pc - 7; x < pc + 7; x++) {
    const d = ((x - pc) / 6.5) ** 2 + ((y - py0 - 25) / 10) ** 2;
    if (d < 1) px[y * W + x] = x < pc - 1 ? C.skin : C.skinShade;
  }
  for (let y = py0 + 12; y < py0 + 20; y++) for (let x = pc - 8; x < pc + 8; x++) if (((x - pc) / 8) ** 2 + ((y - py0 - 19) / 7) ** 2 < 1 && y < py0 + 18) px[y * W + x] = C.maroon;
  for (const ex of [pc - 3, pc + 2]) put(px, ex, py0 + 24, C.maroon);
  put(px, pc, py0 + 27, C.tanShade);
  rect(px, pc - 2, py0 + 30, pc + 2, py0 + 31, C.brown);
  gilt(px, px0, py0, px1, py1, 4);
  // a colour field (left): two soft blocks on rust, a thin black frame
  const [fx0, fy0, fx1, fy1] = GALLERY.field;
  rect(px, fx0, fy0, fx1, fy1, C.black);
  rect(px, fx0 + 2, fy0 + 2, fx1 - 2, fy1 - 2, C.maroon);
  for (const [y0, y1, c] of [[fy0 + 6, fy0 + 38, C.rust], [fy0 + 44, fy1 - 6, C.darkRed]]) {
    for (let y = y0; y < y1; y++) for (let x = fx0 + 6; x < fx1 - 6; x++) {
      const e = Math.min(x - fx0 - 6, fx1 - 7 - x, y - y0, y1 - 1 - y);
      if (e > 1 || bayer(x, y) < 0.5) px[y * W + x] = c;
    }
  }
  // the floor: dark boards, a skirting
  rect(px, 0, GALLERY.floor, W, GALLERY.floor + 3, C.ink);
  bands(px, 0, GALLERY.floor + 3, W, H, [C.brown, C.maroon]);
  for (let y = GALLERY.floor + 6; y < H; y += 5) rect(px, 0, y, W, y + 1, C.maroon);
  st.motes = Array.from({ length: 14 }, (_, k) => [GALLERY.spots[k % 3][0], r() * 60, r() * 30, 4 + r() * 6]);
  falloff(px);
}

function galleryLive(px, t, st) {
  // dust turning in the spots' light, slow
  for (const [sx, y0, ph, per] of st.motes) {
    const k = ((t / per + ph / 30) % 1);
    const x = Math.round(sx - 14 + 28 * ((ph * 7) % 1) + Math.sin(t / 3 + ph) * 4), y = Math.round(20 + y0 + k * 30);
    if (x >= 0 && x < W && y < GALLERY.floor) {
      const c = px[y * W + x];
      if (c === C.steel || c === C.slate) put(px, x, y, c === C.steel ? C.fog : C.steel);
    }
  }
}

// ------------------------------------------------------------------------------------------------ chambers

const CHAMBERS = { boards: [18, 60, 102, 144, 186], uprights: [0, 128, 256, 380], desk: 168 };

function chambers(px, r, st) {
  rect(px, 0, 0, W, H, C.black);
  // books on each shelf: spines of bound reports, lit on the left edge, gold bands on the wider ones
  const colours = [C.maroon, C.darkRed, C.darkGreen, C.navy, C.brown, C.maroon, C.brown, C.darkRed, C.tanShade];
  for (let s = 0; s + 1 < CHAMBERS.boards.length + 1; s++) {
    const floor = s < CHAMBERS.boards.length ? CHAMBERS.boards[s] : H;
    const ceil = s ? CHAMBERS.boards[s - 1] + 4 : -30;
    for (let x = 2; x < W - 2; ) {
      const w = 3 + ((r() * 5) | 0);
      const h = Math.min(floor - ceil - 3, 26 + ((r() * 10) | 0));
      if (r() < 0.05) {
        x += 3;
        continue;
      }
      const c = colours[(r() * colours.length) | 0];
      rect(px, x, floor - h, x + w, floor, c);
      rect(px, x + w - 1, floor - h, x + w, floor, C.black);
      rect(px, x, floor - h, x + w - 1, floor - h + 1, DOWN.get(c));
      if (w >= 4 && r() < 0.6) {
        const gold = r() < 0.7 ? C.rust : C.orange;
        for (const y of [floor - h + 4, floor - h + 6, floor - 5]) rect(px, x + 1, y, x + w - 1, y + 1, gold);
      }
      x += w;
    }
  }
  // the shelves and the uprights
  for (const y of CHAMBERS.boards) {
    rect(px, 0, y, W, y + 1, C.tan);
    rect(px, 0, y + 1, W, y + 4, C.tanShade);
    rect(px, 0, y + 4, W, y + 5, C.brown);
    rect(px, 0, y + 5, W, y + 7, C.black);
  }
  for (const x of CHAMBERS.uprights) {
    rect(px, x, 0, x + 5, H, C.brown);
    rect(px, x, 0, x + 1, H, C.tanShade);
    rect(px, x + 4, 0, x + 5, H, C.maroon);
  }
  // the room is lit by the lamp: the shelves fall into shadow away from it, most of all behind the speaker
  relight(px, 110, 80, 230, 190, 1.7, DOWN);
  // the desk on the right, the green banker's lamp and its pool, a brass scales
  rect(px, 196, CHAMBERS.desk, W, CHAMBERS.desk + 1, C.tan);
  rect(px, 196, CHAMBERS.desk + 1, W, CHAMBERS.desk + 5, C.tanShade);
  rect(px, 196, CHAMBERS.desk + 5, W, CHAMBERS.desk + 6, C.black);
  bands(px, 196, CHAMBERS.desk + 6, W, H, [C.brown, C.maroon]);
  rect(px, 196, CHAMBERS.desk, 197, H, C.tan);
  relight(px, 334, CHAMBERS.desk + 2, 70, 16, 2.2, UP, (c) => c === C.tan || c === C.tanShade || c === C.brown);
  relight(px, 334, 120, 60, 44, 1.2);
  rect(px, 326, CHAMBERS.desk - 4, 344, CHAMBERS.desk, C.orange);
  rect(px, 326, CHAMBERS.desk - 4, 344, CHAMBERS.desk - 3, C.yellow);
  rect(px, 333, 138, 336, CHAMBERS.desk - 4, C.orange);
  put(px, 333, 140, C.yellow);
  for (let y = 0; y < 14; y++) {
    const half = 12 + Math.round(y * 0.9);
    rect(px, 334 - half, 126 + y, 335 + half, 127 + y, y < 2 ? C.green : y === 13 ? C.ink : C.darkGreen);
    put(px, 334 - half, 126 + y, C.green);
  }
  rect(px, 318, 140, 352, 141, C.cream);
  rect(px, 322, 141, 348, 142, C.yellow);
  // the scales of justice in brass
  const sx = 266, sy = 132;
  rect(px, sx - 7, CHAMBERS.desk - 3, sx + 8, CHAMBERS.desk, C.rust);
  rect(px, sx - 7, CHAMBERS.desk - 3, sx + 8, CHAMBERS.desk - 2, C.orange);
  rect(px, sx, sy, sx + 2, CHAMBERS.desk - 3, C.orange);
  put(px, sx, sy, C.yellow);
  seg(px, sx - 13, sy + 3, sx + 14, sy + 1, C.orange);
  for (const [ex, ey] of [[sx - 13, sy + 3], [sx + 14, sy + 1]]) {
    seg(px, ex, ey, ex - 4, ey + 12, C.rust);
    seg(px, ex, ey, ex + 4, ey + 12, C.rust);
    rect(px, ex - 5, ey + 12, ex + 6, ey + 13, C.yellow);
    rect(px, ex - 4, ey + 13, ex + 5, ey + 14, C.orange);
  }
  st.motes = Array.from({ length: 10 }, () => [r() * 70, r(), 5 + r() * 6]);
  falloff(px);
}

function chambersLive(px, t, st) {
  // dust in the lamp's light
  for (const [x0, ph, per] of st.motes) {
    const k = (t / per + ph) % 1;
    const x = Math.round(300 + x0 + Math.sin(t / 2.5 + ph * 9) * 3), y = Math.round(144 + k * 22);
    const c = px[y * W + x];
    if (c !== C.black) put(px, x, y, UP.get(c) ?? c);
  }
}

// ------------------------------------------------------------------------------------------------ registry

const STUDIOS = {
  markets: [markets, marketsLive, 11],
  bureau: [bureau, bureauLive, 23],
  field: [field, fieldLive, 37],
  observatory: [observatory, observatoryLive, 41],
  lab: [lab, labLive, 53],
  clinic: [clinic, clinicLive, 67],
  gallery: [gallery, galleryLive, 71],
  chambers: [chambers, chambersLive, 89],
};
export const EXPERT_STUDIOS = Object.keys(STUDIOS);

const BUILT = new Map(); // name -> { px, st }

/** The studio `name` into px (u32, 384x216) at time t (s). False when there is no such studio. */
export function drawExpertStudio(px, name, t = 0) {
  const def = STUDIOS[name];
  if (!def) return false;
  let b = BUILT.get(name);
  if (!b) {
    const layer = new Uint32Array(W * H);
    const st = {};
    def[0](layer, rng(def[2]), st);
    b = { px: layer, st };
    BUILT.set(name, b);
  }
  px.set(b.px);
  live = true;
  try {
    def[1](px, t, b.st);
  } finally {
    live = false;
  }
  return true;
}
