// COSMOS DESK's back wall (round 4): a planetarium. The whole wall behind the presenters is one curved LED
// wall playing the sky as seen from orbit: deep space with stars of every brightness, the Milky Way's band
// running across it with its dark dust lanes, a nebula glowing in the far corner, a crescent Moon rising
// beside the screen, and low down the Earth's limb, its thin blue atmosphere lit edge-on and the lights of its
// night side. Over it, as a planetarium draws them, two constellations in thin purple lines with their names.
// Out of focus (singles) the stars fade to a few soft points, the Milky Way and the limb to soft bands.
//
//   drawSpace(fr, cam, box, soft)   box: the wall's screen rect to fill
//   LIVE_DRAW.cosmos                a satellite crossing, a meteor now and then (live.js; the stars twinkle)
import { C } from '../pixbuf.js';
import { SET, kAt, sxOf, syOf } from './geometry.js';
import { livePoint, BLINK, LIVE_DRAW } from './live.js';
import { bokeh, RAMPS } from './light.js';

const W = 384, H = 216;
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bay = (x, y) => (B4[((y & 3) << 2) | (x & 3)] + 0.5) / 16;
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
// smooth value noise (deterministic), 0..1
function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const s = (t) => t * t * (3 - 2 * t);
  const a = hash(xi, yi, 7), b = hash(xi + 1, yi, 7), c = hash(xi, yi + 1, 7), d = hash(xi + 1, yi + 1, 7);
  const u = s(xf), v = s(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y) => 0.55 * noise(x, y) + 0.3 * noise(x * 2.1 + 5, y * 2.1 + 3) + 0.15 * noise(x * 4.3 + 11, y * 4.3 + 7);

// the sky on the wall (world units on the back wall)
export const SKY = {
  X: 250,
  top: -127,
  earth: { X: -40, Y: 1180, R: 1196 }, // the limb's top at Y -16 (X -40): behind the presenters' shoulders, under the screen
  moon: { X: -212, Y: -92, R: 26 },
  // the Milky Way: a band through (X0, Y0) → (X1, Y1), its half width
  milky: { X0: -260, Y0: 10, X1: 260, Y1: -120, hw: 34 },
  nebula: { X: 200, Y: -68, rx: 40, ry: 30 },
};
// the stars, once: [X, Y, mag 0 faint .. 3 brightest, tint]
const STARS = (() => {
  const r = rng(907), out = [];
  const { X0, Y0, X1, Y1, hw } = SKY.milky;
  const L = Math.hypot(X1 - X0, Y1 - Y0), ux = (X1 - X0) / L, uy = (Y1 - Y0) / L;
  for (let i = 0; i < 1100; i++) {
    let X = -SKY.X + r() * 2 * SKY.X, Y = SKY.top + r() * 150;
    // the band is denser: half the stars are drawn toward it
    if (i % 2) {
      const t = r() * L, off = (r() + r() + r() - 1.5) * hw * 0.8;
      X = X0 + ux * t - uy * off;
      Y = Y0 + uy * t + ux * off;
    }
    const v = r();
    const mag = v > 0.985 ? 3 : v > 0.93 ? 2 : v > 0.7 ? 1 : 0;
    const tint = mag >= 2 ? (r() < 0.2 ? 'orange' : r() < 0.25 ? 'blue' : null) : null;
    out.push([X, Y, mag, tint, i]);
  }
  return out;
})();

// the Earth's city lights: points on its land masses (clusters along coasts), in world units
const CITY_LIGHTS = (() => {
  const r = rng(515), out = [];
  const e = SKY.earth;
  for (let i = 0; i < 2600 && out.length < 420; i++) {
    const X = -SKY.X + r() * 2 * SKY.X, Y = -20 + r() * 80;
    const dE = Math.hypot(X - e.X, Y - e.Y) - e.R;
    if (dE > -6) continue;
    if (fbm(X * 0.02 + 3, Y * 0.06) < 0.53) continue; // land
    const v = r();
    out.push([X, Y, v < 0.25 ? C.yellow : v < 0.8 ? C.orange : C.rust]);
  }
  return out;
})();

/** Is (X, Y) on the Earth's disc? */
const onEarth = (X, Y) => {
  const e = SKY.earth;
  return (X - e.X) * (X - e.X) + (Y - e.Y) * (Y - e.Y) < e.R * e.R;
};

export function drawSpace(fr, cam, box, soft) {
  const k = kAt(cam, SET.wallZ);
  const px = fr.px;
  const xa = Math.max(0, box.x0), xb = Math.min(W, box.x1), ya = Math.max(0, box.y0), yb = Math.min(H, box.y1);
  if (xb <= xa || yb <= ya) return;
  const e = SKY.earth, m = SKY.milky, nb = SKY.nebula;
  const L = Math.hypot(m.X1 - m.X0, m.Y1 - m.Y0), ux = (m.X1 - m.X0) / L, uy = (m.Y1 - m.Y0) / L;
  for (let y = ya; y < yb; y++) {
    const Y = cam.y + (y + 0.5 - cam.hy) / k;
    const row = y * W;
    for (let x = xa; x < xb; x++) {
      const X = cam.x + (x + 0.5 - 192) / k;
      // the Earth: its night side, the atmosphere's lit edge, then its glow fading into space
      const dE = Math.hypot(X - e.X, Y - e.Y) - e.R; // < 0 inside the disc
      const b = bay(x, y);
      if (dE < 0) {
        // the night side: ink near the limb (the airglow), black further in, a few city lights and cloud
        let c = dE > -4 ? C.navy : dE > -14 ? C.ink : C.black;
        if (dE > -1.4 / k - 0.6 && !soft) c = C.cyan;
        else if (dE > -2.4 && !soft) c = C.blue;
        if (soft && dE > -3) c = C.blue;
        if (!soft && dE < -6 && fbm(X * 0.03, Y * 0.12 + 9) > 0.68 && c === C.black) c = C.ink; // cloud
        px[row + x] = c;
        continue;
      }
      // the atmosphere's glow above the limb: navy, then a Bayer fade into the black
      if (dE < (soft ? 9 : 6)) {
        const t = dE / (soft ? 9 : 6);
        px[row + x] = t < 0.45 ? C.navy : t < 1 && b > (t - 0.45) / 0.55 ? C.navy : C.ink;
        continue;
      }
      let c = C.black;
      // the Milky Way: a soft band (ink, its heart a sparse slate), cut by dark dust lanes
      const along = (X - m.X0) * ux + (Y - m.Y0) * uy, across = -(X - m.X0) * uy + (Y - m.Y0) * ux;
      const band = 1 - Math.abs(across) / m.hw;
      if (band > 0 && along > 0 && along < L) {
        const dust = fbm(along * 0.035, across * 0.09 + 2);
        const v = band * (0.55 + 0.6 * fbm(along * 0.02 + 7, across * 0.05)) - (dust > 0.62 ? (dust - 0.62) * 3 : 0);
        if (v > 0.72 && b < (v - 0.72) * 2.4 && !soft) c = C.slate;
        else if (v > 0.38 + (soft ? 0.08 : 0)) c = v > 0.5 || b < (v - 0.38) / 0.12 ? C.ink : C.black;
      }
      // the nebula: purple and maroon wisps, a few magenta knots (never a bright patch)
      const nx = (X - nb.X) / nb.rx, ny = (Y - nb.Y) / nb.ry;
      const nd = nx * nx + ny * ny;
      if (nd < 1.6) {
        const f = fbm(X * 0.05 + 1, Y * 0.07 + 4) * (1.6 - nd) / 1.6;
        if (f > 0.4) c = f > 0.52 && b < (f - 0.52) * 4 && !soft ? C.magenta : f > 0.46 ? C.purple : b < (f - 0.4) / 0.06 ? C.purple : c === C.black ? C.maroon : c;
        else if (f > 0.3 && c === C.black && b < (f - 0.3) / 0.1) c = C.maroon;
      }
      px[row + x] = c;
    }
  }
  const clip = (x, y) => x >= xa && x < xb && y >= ya && y < yb;
  // the night side's city lights: fixed points on the land (a camera move carries them, never re-picks them)
  if (!soft) {
    for (const [X, Y, c] of CITY_LIGHTS) {
      const x = Math.round(sxOf(cam, k, X) - 0.5), y = Math.round(syOf(cam, k, Y) - 0.5);
      if (clip(x, y)) px[y * W + x] = c;
    }
  }
  // the stars (in front of the band and the nebula, behind the Moon and the Earth)
  for (const [X, Y, mag, tint, i] of STARS) {
    if (onEarth(X, Y) || Math.hypot(X - SKY.moon.X, Y - SKY.moon.Y) < SKY.moon.R + 2) continue;
    const x = Math.round(sxOf(cam, k, X) - 0.5), y = Math.round(syOf(cam, k, Y) - 0.5);
    if (!clip(x, y)) continue;
    if (soft) {
      // out of focus only the brightest show, as small soft discs
      if (mag >= 2) bokeh(fr, x + 0.5, y + 0.5, Math.max(1.5, 1.2 * k), tint === 'orange' ? RAMPS.warm : RAMPS.cool, { fill: tint === 'orange' ? C.brown : C.slate, rim: tint === 'orange' ? C.tanShade : C.steel, clip });
      continue;
    }
    const core = tint === 'orange' ? C.tan : tint === 'blue' ? C.blue : [C.slate, C.steel, C.fog, C.silver][mag];
    const under = px[y * W + x];
    if (under === core) continue;
    px[y * W + x] = core;
    // a share of them twinkle (a beat one step dimmer, or out for a faint one)
    if (i % 3 === 0) livePoint(x, y, core, mag === 0 ? under : mag === 1 ? C.slate : C.steel, BLINK.TWINKLE, hash(i, 5));
    if (mag === 3) {
      // the brightest: a small cross, its arms one step dimmer
      const arm = tint === 'orange' ? C.tanShade : tint === 'blue' ? C.navy : C.steel;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (clip(x + dx, y + dy)) px[(y + dy) * W + x + dx] = arm;
    }
  }
  moon(fr, cam, k, soft, clip);
}

/** A crescent Moon rising beside the screen: its lit limb silver and fog, the rest in earthshine (ink, maria black). */
function moon(fr, cam, k, soft, clip) {
  const mo = SKY.moon;
  const cx = sxOf(cam, k, mo.X), cy = syOf(cam, k, mo.Y), r = mo.R * k;
  const px = fr.px;
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
    for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      if (!clip(x, y)) continue;
      const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / r;
      const d = dx * dx + dy * dy;
      if (d > 1) continue;
      // a crescent lit from the lower right: the disc minus a disc shifted toward the upper left
      const lit = (dx + 0.42) * (dx + 0.42) + (dy + 0.3) * (dy + 0.3) > 0.9;
      const mare = fbmish(dx, dy);
      let c;
      if (soft) c = lit ? C.fog : C.ink;
      else if (lit) c = d > 0.86 ? C.fog : mare ? C.steel : C.silver;
      else c = C.ink; // the dark side in earthshine, one flat tone (no features to read as a face)
      px[y * W + x] = c;
    }
  }
}
const fbmish = (dx, dy) => fbm(dx * 3 + 4, dy * 3 + 2) > 0.58;

// --------------------------------------------------------------------------- what moves (live.js)
LIVE_DRAW.cosmos = (fr, cam, t, style, clipRows, soft, wall) => {
  if (soft) return;
  const k = kAt(cam, SET.wallZ);
  const px = fr.px;
  const pad = wall ? Math.ceil(9 * wall.k) : 0;
  const ok = (x, y) => x >= 0 && x < W && y >= 0 && y < H && (!clipRows || y < clipRows[x]) && (!wall || x < wall.x0 - pad || x >= wall.x1 + pad || y >= wall.y1 + pad || y < wall.y0 - pad);
  const dark = (c) => c === C.black || c === C.ink || c === C.maroon || c === C.slate;
  // a satellite crossing every 50 s on a slow diagonal: a steady point (sunlit), steel
  {
    const cyc = 50, u = (t % cyc) / cyc;
    const X = -260 + u * 520, Y = -118 + u * 46;
    const x = Math.round(sxOf(cam, k, X)), y = Math.round(syOf(cam, k, Y));
    if (ok(x, y) && dark(px[y * W + x]) && !onEarth(X, Y)) px[y * W + x] = C.fog;
  }
  // a meteor every 23 s: a short bright streak for 0.4 s, its tail fading
  {
    const cyc = 23, ph = t % cyc;
    if (ph < 0.4) {
      const n = Math.floor(t / cyc);
      const X0 = 90 + hash(n, 1) * 140, Y0 = -126 + hash(n, 2) * 30;
      const u = ph / 0.4;
      for (let j = 0; j < 7; j++) {
        const d = u * 46 - j * 2.2;
        if (d < 0) continue;
        const X = X0 - d * 0.8, Y = Y0 + d * 0.5;
        const x = Math.round(sxOf(cam, k, X)), y = Math.round(syOf(cam, k, Y));
        if (ok(x, y) && dark(px[y * W + x])) px[y * W + x] = j === 0 ? C.white : j < 3 ? C.silver : j < 5 ? C.fog : C.steel;
      }
    }
  }
};
