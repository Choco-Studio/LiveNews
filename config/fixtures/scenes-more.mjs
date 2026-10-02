// A third set of original illustrations for the offline fixture stories (painted
// by make-images.mjs): the places of the gentler and science stories, so the
// offline channel finds a picture for most of what it reads (temple ruins in
// the Andes, Venice's sea gates, a reef, a comet at dusk, a glacier, Martian
// strata, a drone show over the Han river, a refinery, an airport at dusk,
// glowing fungi, a fjord tunnel, a coffee estate). Same rules as the others:
// one subject, one motivated key light, depth through haze, organic forms
// built from noise rather than bare primitives.
import { blob, hex, mix, noise1, noise2, ramp } from './raster.mjs';
import { H, W, clamp01, clouds, groundShadow, haze, pickOf, reflect, smooth, sparkle } from './kit.mjs';

// ---------------------------------------------------------------- local tools

// paintBox callbacks take colours as [r, g, b]
const SNOW = hex('#e8ecf0');
const MIST = hex('#e4e6e2');
const SURFACE = hex('#c8f0f0');
const SHAFT = hex('#d8fff4');
const TAIL = hex('#d8e8ff');
const LAKE = hex('#5a7a7a');
const ROCK_HAZE = hex('#6a7280');
const MULLION = hex('#2a2430');
const TERMINAL = hex('#2a2632');
const ROOF_EDGE = hex('#c8b8b0');
const WATERFALL = hex('#d8e0e4');
const ROAD = hex('#2e3032');
const RAIL = hex('#9a9a94');
const CORONA = hex('#e4ecff');

/** A distant standing figure (a few pixels after the channel's pixelation): head, coat, legs. */
function figure(c, x, ground, h, { coat = '#22242c', skin = '#9a7a64', alpha = 1, bend = 0 } = {}) {
  const u = h / 6.5;
  for (const side of [-1, 1]) c.poly([[x + side * u * 0.1 - u * 0.2, ground - h * 0.47], [x + side * u * 0.1 + u * 0.2, ground - h * 0.47], [x + side * u * 0.42 + u * 0.12, ground], [x + side * u * 0.42 - u * 0.12, ground]], '#16181e', alpha);
  const top = ground - h + u * 1.1;
  c.poly([[x - u * 0.7 + bend, top + u * 0.2], [x + u * 0.7 + bend, top + u * 0.2], [x + u * 0.6, ground - h * 0.42], [x - u * 0.6, ground - h * 0.42]], coat, alpha);
  c.ellipse(x + bend * 1.2, top - u * 0.45, u * 0.42, u * 0.5, skin, alpha);
  c.ellipse(x + bend * 1.2, top - u * 0.75, u * 0.44, u * 0.25, '#141212', alpha);
}

/** Stars: many faint, a few bright, thinning toward the horizon glow. */
function stars(c, r, n, y1, { warm = 0.15 } = {}) {
  for (let i = 0; i < n; i++) {
    const x = r() * W;
    const y = r() ** 1.4 * y1;
    const k = (1 - y / y1) * (0.3 + r() * 0.7);
    c.glow(x, y, r() < 0.04 ? 4 : 1.8, r() < warm ? '#ffe2c0' : '#e8eeff', k * (r() < 0.04 ? 1.2 : 0.8), 1);
  }
}

/** Lit windows scattered over a building face: irregular rows, most dark, some warm, some cool. */
function windows(c, r, x0, y0, x1, y1, { w = 6, h = 8, gx = 14, gy = 16, lit = 0.35, warm = '#f2c27a', cool = '#a8c4e0', alpha = 1 } = {}) {
  for (let y = y0 + 4; y < y1 - h; y += gy) {
    for (let x = x0 + 4; x < x1 - w; x += gx) {
      if (r() > lit) continue;
      c.rect(x + Math.round(r() * 2 - 1), y, w, h, r() < 0.75 ? warm : cool, alpha * (0.55 + r() * 0.45));
    }
  }
}

// ---------------------------------------------------------------- scenes

export const MORE_SCENES = {
  /** Ruins of a stepped stone temple on a terraced slope of the northern Andes, morning cloud in the valleys (Peru). */
  temple(c, r) {
    c.gradient(0, H * 0.55, [[0, '#5a7896'], [0.5, '#9cb2c2'], [0.85, '#d6d4c4'], [1, '#e8dcc2']]);
    clouds(c, 301, { y0: H * 0.02, y1: H * 0.3, scale: 0.0026, cover: 0.18, lit: '#f4ead8', shade: '#8a98a8', alpha: 0.85, stretch: 3 });
    c.glow(W * 0.12, H * 0.18, 520, '#fff0d0', 0.3);
    // four ranges, receding into blue haze; the far ones sharp and snow-dusted
    const far = c.ridge(H * 0.36, 110, 0.0016, '#8a9cb0', 302, { octaves: 5, sharp: true });
    const snow = noise2(303);
    // snow only on the highest summits, in streaks down their gullies
    c.paintBox(0, H * 0.12, W, H * 0.4, (x, y) => {
      const top = (far.find(([px]) => px >= x) || far.at(-2))[1];
      if (top > H * 0.27 || y < top || y > top + 30) return null;
      return snow.fbm(x * 0.03, y * 0.08, 3) > 0.1 - (y - top) / 60 ? [SNOW, 0.7 * smooth(top + 30, top, y)] : null;
    });
    c.ridge(H * 0.42, 70, 0.0024, '#6a7e84', 304, { octaves: 5, sharp: true });
    // cloud lying in the valley
    const mist = noise2(305);
    c.paintBox(0, H * 0.36, W, H * 0.5, (x, y) => [MIST, clamp01(mist.fbm(x * 0.003, y * 0.02, 4) * 0.9 + 0.2) * smooth(H * 0.36, H * 0.43, y) * smooth(H * 0.52, H * 0.45, y)]);
    c.ridge(H * 0.5, 50, 0.003, '#4c6248', 306, { octaves: 5 });
    // the near slope with agricultural terraces: curved bands, each lit on its lip
    const slope = noise1(307);
    const grass = ramp([[0, '#2a3a20'], [0.45, '#55693a'], [0.8, '#8a9a54'], [1, '#c2c27a']]);
    const tex = noise2(308);
    c.paintBox(0, H * 0.5, W, H, (x, y) => {
      const base = H * 0.56 + (x / W) * H * 0.05 + slope(x * 0.003) * 30;
      if (y < base) return null;
      const band = ((y - base) / 26 + slope(x * 0.006 + 9) * 0.6) % 1;
      const lip = band < 0.18 ? 0.35 : band > 0.85 ? -0.25 : 0;
      return [grass(clamp01(0.5 + lip + tex.fbm(x * 0.02, y * 0.05, 3) * 0.3 - (y - base) / H * 0.4)), 1];
    });
    // the temple: three stepped platforms of rough-cut stone, a central stairway, painted wall fragments
    const cx = W * 0.56;
    const gy = H * 0.74;
    const stone = ramp([[0, '#3a3228'], [0.4, '#7a6a54'], [0.75, '#b0a080'], [1, '#d8caa4']]);
    const blocks = noise2(309);
    const tiers = [[400, 74], [300, 64], [200, 56]];
    let y = gy;
    for (const [hw, th] of tiers) {
      const top = y - th;
      // the ledge above throws a band of shadow onto the face below it
      groundShadow(c, cx, y + 4, hw + 30, 10, 0.5, '#1a1410');
      // the face toward the light (left) and the shaded right return
      c.paintBox(cx - hw, top, cx + hw, y, (px, py) => {
        const row = Math.floor((py - top) / 12);
        const bx = Math.floor((px + row * 17) / (22 + (row % 3) * 6));
        const joint = (py - top) % 12 < 1.5 || (px + row * 17) % (22 + (row % 3) * 6) < 1.5;
        const v = 0.55 + blocks(bx * 1.7, row * 2.3) * 0.25 + blocks.fbm(px * 0.05, py * 0.05, 3) * 0.12 - (px - cx) / hw * 0.18;
        return [stone(clamp01(joint ? v - 0.3 : v)), 1];
      });
      // the lit top edge, broken where stones are missing; tufts of grass growing on the ledge
      const gap = noise1(Math.floor(hw));
      for (let x = cx - hw; x < cx + hw; x += 6) {
        if (gap(x * 0.05) > 0.45) c.rect(x, top - 1, 6, 8, mix(hex('#6a7e84'), hex('#9cb2c2'), 0.5));
        else c.rect(x, top, 6, 3, '#e2d6b4', 0.7);
        if (gap(x * 0.09 + 50) > 0.55) c.ellipse(x + 3, top - 2, 7, 3, '#5a6a34');
      }
      c.poly([[cx + hw, top], [cx + hw + th * 0.5, top + th * 0.25], [cx + hw + th * 0.5, y + th * 0.2], [cx + hw, y]], stone(0.18));
      y = top + 6;
    }
    // a dark doorway on the top platform
    c.poly([[cx + 70, y - 2], [cx + 70, y - 34], [cx + 96, y - 34], [cx + 96, y - 2]], '#1c1612');
    // stairway up the middle
    c.paintBox(cx - 34, y, cx + 34, gy, (px, py) => [stone(((py - y) % 9 < 3 ? 0.85 : 0.5) - (px - cx) / 300), 1]);
    // the painted wall: faded red and ochre bands with a stepped motif on the lowest tier
    for (let k = 0; k < 6; k++) {
      const px = cx - 330 + k * 42;
      c.rect(px, gy - 50, 30, 10, k % 2 ? '#8a3a2a' : '#b0743a', 0.55);
      c.rect(px + 10, gy - 40, 10, 10, '#8a3a2a', 0.45);
    }
    // excavation: a canvas shade on poles, two archaeologists, a sieve frame
    c.poly([[cx - 520, gy - 96], [cx - 380, gy - 108], [cx - 360, gy - 84], [cx - 500, gy - 72]], '#c8c2b0');
    c.poly([[cx - 500, gy - 72], [cx - 360, gy - 84], [cx - 360, gy - 80], [cx - 500, gy - 68]], '#8a8478');
    for (const px of [cx - 516, cx - 382]) c.line(px, gy - 100, px, gy + 6, 3, '#3a3026');
    figure(c, cx - 470, gy + 6, 50, { coat: '#6a5a3e' });
    figure(c, cx - 420, gy + 4, 46, { coat: '#3e4a5a', bend: 6 });
    c.rect(cx + 400, gy - 14, 40, 14, '#5a4a36');
    groundShadow(c, cx + 60, gy + 14, 420, 22, 0.35);
    // foreground: tussock grass and a few boulders, out of focus and darker
    const lichen = noise2(310);
    for (let i = 0; i < 7; i++) {
      const bx = r() * W;
      const by = H * 0.92 + r() * H * 0.08;
      c.litPoly(blob(bx, by, 30 + r() * 40, 16 + r() * 18, Math.floor(r() * 1e6), 0.3), bx, by, 60, 30, ramp([[0, '#1a1814'], [0.6, '#4a4436'], [1, '#7a705a']]), { lx: -0.7, ly: -0.6, lz: 0.4, ambient: 0.06, jitter: (px, py) => (lichen(px * 0.08, py * 0.08) > 0.35 ? 0.2 : 0) });
    }
    haze(c, H * 0.88, H, '#1c2418', 0, 0.35);
  },

  /** Venice's sea gates raised across a lagoon inlet at dusk; the city's bell tower and domes low on the horizon. */
  venice(c, r) {
    c.gradient(0, H * 0.58, [[0, '#26304e'], [0.45, '#6a5e7a'], [0.8, '#d0927a'], [1, '#f2c08a']]);
    clouds(c, 311, { y0: H * 0.04, y1: H * 0.42, scale: 0.0024, cover: 0.22, lit: '#f4b890', shade: '#4a4a66', alpha: 0.75, stretch: 5, lightUp: false });
    c.glow(W * 0.3, H * 0.57, 520, '#ffc890', 0.4);
    // the city on the horizon: a low band of roofs, domes and the tall bell tower, blue with distance
    const sky = hex('#4a4660');
    const hz = H * 0.575;
    const roofs = noise1(312);
    c.paintBox(W * 0.48, hz - 40, W, hz, (x, y) => (y > hz - 14 - Math.abs(roofs(x * 0.05)) * 18 ? [sky, 0.9] : null));
    for (const [dx, R] of [[W * 0.66, 26], [W * 0.7, 20], [W * 0.82, 30]]) c.ellipse(dx, hz - 22, R, R * 0.9, sky, 0.9);
    c.rect(W * 0.6, hz - 130, 12, 120, sky, 0.95);
    c.poly([[W * 0.6 - 2, hz - 130], [W * 0.6 + 6, hz - 160], [W * 0.6 + 14, hz - 130]], sky, 0.95);
    // water: calm, reflecting the warm sky, with long low swells
    c.gradient(hz, H, [[0, '#d8a080'], [0.4, '#6a6070'], [1, '#22283a']]);
    reflect(c, hz, H * 0.82, '#3a3a50', 0.35, 313, { ripple: 4, stretch: 0.06 });
    // the barrier: a row of yellow gates tilted up out of the water, running from near (left) to far (right)
    const gates = 10;
    for (let k = gates - 1; k >= 0; k--) {
      const t = k / (gates - 1);
      const s = 1.7 - t * 1.25;
      const x = W * 0.03 + (1 - (1 - t) ** 1.35) * W * 0.6;
      const base = hz + 150 - t * 120;
      const gw = 46 * s;
      const gh = 58 * s;
      const air = t * 0.5;
      const face = mix(hex('#d8a030'), hex('#9a8a90'), air);
      const lit = mix(hex('#f0c460'), hex('#b0a0a0'), air);
      const side = mix(hex('#7a4a14'), hex('#6a6070'), air);
      c.poly([[x, base], [x + gw, base], [x + gw * 0.9, base - gh], [x + gw * 0.1, base - gh]], face);
      c.poly([[x + gw * 0.1, base - gh], [x + gw * 0.9, base - gh], [x + gw * 0.88, base - gh * 0.86], [x + gw * 0.12, base - gh * 0.86]], lit);
      c.poly([[x + gw, base], [x + gw * 1.14, base - 5 * s], [x + gw * 1.03, base - gh - 3 * s], [x + gw * 0.9, base - gh]], side);
      // ribs on the gate face, foam where the sea meets it, and its broken reflection
      for (let i = 1; i < 4; i++) c.rect(x + gw * (0.1 + i * 0.2), base - gh * 0.84, Math.max(1, s * 1.5), gh * 0.8, side, 0.5);
      c.rect(x - 6 * s, base - 2, gw + 16 * s, 3 * s + 1, '#ece4d4', 0.55);
      for (let i = 0; i < 5; i++) c.rect(x + gw * 0.1, base + 4 + i * 5 * s, gw * (0.8 - i * 0.1), 2 * s, face, 0.22 - i * 0.035);
    }
    // a work boat in the foreground with a lit cabin, and wooden mooring posts
    const bx = W * 0.08;
    const by = H * 0.86;
    c.poly([[bx, by], [bx + 220, by], [bx + 250, by - 26], [bx - 10, by - 22]], '#1c1e26');
    c.rect(bx + 40, by - 62, 70, 40, '#2a2c34');
    c.rect(bx + 50, by - 54, 22, 14, '#f2c27a', 0.9);
    c.rect(bx + 80, by - 54, 22, 14, '#f2c27a', 0.8);
    c.glow(bx + 76, by - 46, 60, '#f2c27a', 0.25);
    const wood = ramp([[0, '#1a140e'], [1, '#6a5038']]);
    for (const [px, n] of [[W * 0.86, 3], [W * 0.94, 2], [W * 0.77, 1]]) {
      for (let i = 0; i < n; i++) {
        const x = px + i * 14 - n * 7;
        c.litPoly([[x - 9, H], [x + 9, H], [x + 7, H * 0.62 - i * 8], [x - 7, H * 0.62 - i * 8]], x, H * 0.82, 9, 140, wood, { lx: -0.8, ly: -0.2, lz: 0.4 });
      }
      c.line(px - n * 7 - 4, H * 0.7, px + n * 7 + 4, H * 0.7, 3, '#120e0a');
    }
    sparkle(c, r, 260, W * 0.1, hz + 4, W * 0.6, H * 0.8, '#ffe0b0', 0.45);
  },

  /** A recovering reef: branching and table corals in shafts of sunlight, a shoal of small fish (Great Barrier Reef). */
  reef(c, r) {
    c.gradient(0, H, [[0, '#4aa0b4'], [0.35, '#1e6a8a'], [0.75, '#123e62'], [1, '#0c2a48']]);
    // the surface seen from below and the shafts of light it sends down
    const surf = noise2(321);
    c.paintBox(0, 0, W, H * 0.12, (x, y) => [SURFACE, clamp01(surf.fbm(x * 0.01, y * 0.08, 3) * 0.8 + 0.1) * smooth(H * 0.12, 0, y) * 0.7]);
    c.paintBox(0, 0, W, H, (x, y) => {
      const u = x + y * 0.35;
      const v = Math.sin(u * 0.012 + surf(u * 0.002, 3) * 4) * 0.5 + 0.5;
      return v > 0.82 ? [SHAFT, (v - 0.82) * 0.9 * smooth(H, H * 0.1, y)] : null;
    });
    // sand and rubble on the floor
    const sandTone = ramp([[0, '#1a3a4a'], [0.6, '#5a8a8a'], [1, '#a8c4b0']]);
    c.paintBox(0, H * 0.76, W, H, (x, y) => {
      const top = H * 0.8 + surf(x * 0.004, 7) * 30;
      return y > top ? [sandTone(clamp01(0.55 + surf.fbm(x * 0.02, y * 0.04, 3) * 0.3 - (y - top) / H)), 1] : null;
    });
    // corals, colour returning (ochre, rose, violet), a few still pale: boulder and brain corals (knobbly domes
    // with grooves), staghorn thickets, and fans; the far ones lost in the blue
    const palettes = [['#3a2a3a', '#8a5a7a', '#d8a0b8'], ['#3a2e1e', '#8a6a3a', '#d8b878'], ['#2a2a44', '#5a5a8a', '#a8a0d0'], ['#3a3a3a', '#a8a8a0', '#ecece4'], ['#2a3a2a', '#5a7a4a', '#a8c88a']];
    const groove = noise2(322);
    const corals = [];
    for (let i = 0; i < 34; i++) corals.push({ x: r() * W, y: H * 0.68 + r() * H * 0.3, s: 0.5 + r() * 0.9, kind: pickOf(r, ['boulder', 'boulder', 'branch', 'branch', 'fan']), p: pickOf(r, palettes) });
    corals.sort((a2, b2) => a2.y - b2.y);
    for (const k of corals) {
      const tone = ramp([[0, k.p[0]], [0.55, k.p[1]], [1, k.p[2]]]);
      const depth = clamp01((k.y - H * 0.68) / (H * 0.3));
      const fog = 0.6 - depth * 0.55;
      const tint = (t) => mix(tone(t), hex('#1e5a7a'), fog);
      if (k.kind === 'boulder') {
        const R = 60 * k.s;
        const dome = blob(k.x, k.y - R * 0.45, R, R * 0.62, Math.floor(r() * 1e6), 0.2);
        c.litPoly(dome, k.x, k.y - R * 0.4, R, R * 0.62, tint, { lx: -0.2, ly: -0.95, lz: 0.5, ambient: 0.12, jitter: (px, py) => (Math.abs(groove(px * 0.06, py * 0.09)) < 0.08 ? -0.35 : 0) });
      } else if (k.kind === 'branch') {
        const grow = (x, y, a2, len, w, d) => {
          const ex = x + Math.cos(a2) * len;
          const ey = y + Math.sin(a2) * len;
          c.line(x, y, ex, ey, w, tint(0.3 + d * 0.15 + (a2 < -1.8 ? 0.1 : 0)));
          if (d >= 3) return c.circle(ex, ey, w * 0.65, tint(0.95));
          for (const da of [-0.5, 0.05, 0.45]) if (r() < 0.8) grow(ex, ey, a2 + da + (r() - 0.5) * 0.3, len * 0.7, w * 0.72, d + 1);
        };
        for (let j = 0; j < 3; j++) grow(k.x + (j - 1) * 14 * k.s, k.y, -Math.PI / 2 + (j - 1) * 0.35, 34 * k.s, 8 * k.s, 0);
      } else {
        // a sea fan: a fine lattice spreading from one stem, edge-lit from above
        const fx = k.x;
        const fy = k.y;
        const R = 70 * k.s;
        c.paintBox(fx - R, fy - R * 1.2, fx + R, fy, (px, py) => {
          const dx = (px - fx) / R;
          const dy = (fy - py) / (R * 1.2);
          const rr = dx * dx + (dy - 0.55) ** 2 * 1.6;
          if (rr > 0.42 || dy < 0) return null;
          const net = Math.abs(Math.sin(px * 0.5 + groove(px * 0.02, py * 0.02) * 4)) < 0.2 || Math.abs(Math.sin(py * 0.45)) < 0.16;
          return net ? [tint(0.55 + dy * 0.4), 0.85] : null;
        });
        c.line(fx, fy, fx, fy - R * 0.4, 4 * k.s, tint(0.3));
      }
    }
    // a shoal of small fish crossing the light, and a pair of larger ones nearer
    for (let i = 0; i < 70; i++) {
      const fx = W * 0.35 + (r() - 0.5) * 520 + Math.sin(i) * 40;
      const fy = H * 0.36 + (r() - 0.5) * 140 + (fx - W * 0.35) * 0.12;
      const L = 7 + r() * 5;
      c.ellipse(fx, fy, L, L * 0.36, '#cfe8ec', 0.75);
      c.poly([[fx - L, fy], [fx - L - 5, fy - 3], [fx - L - 5, fy + 3]], '#cfe8ec', 0.7);
    }
    for (const [fx, fy, L] of [[W * 0.78, H * 0.52, 30], [W * 0.86, H * 0.58, 24]]) {
      c.litPoly(blob(fx, fy, L, L * 0.38, Math.floor(fx), 0.06), fx, fy, L, L * 0.4, ramp([[0, '#1a2a3a'], [0.6, '#c8a040'], [1, '#f0e0a0']]), { lx: 0, ly: -1, lz: 0.4 });
      c.poly([[fx + L * 0.9, fy], [fx + L * 1.45, fy - L * 0.4], [fx + L * 1.45, fy + L * 0.4]], '#8a7030');
    }
    sparkle(c, r, 200, 0, 0, W, H * 0.8, '#e0fff8', 0.35);
  },

  /** A comet low in the west just after sunset, its tail curving up; people with binoculars on a hilltop. */
  comet(c, r) {
    c.gradient(0, H * 0.82, [[0, '#060a1c'], [0.45, '#14204a'], [0.75, '#4a3a5a'], [0.92, '#c87a5a'], [1, '#f2a868']]);
    stars(c, r, 900, H * 0.7);
    // the comet: a bright head and a broad, softly curving dust tail
    const hx = W * 0.3;
    const hy = H * 0.5;
    const tail = noise2(331);
    c.paintBox(0, 0, W, H * 0.7, (x, y) => {
      // distance along a curve rising up and to the left of the head
      const dx = hx - x;
      const dy = hy - y;
      if (dy < -10 || dx < -40) return null;
      const along = Math.hypot(dx, dy);
      const curve = dx - dy * 0.22 - (dy * dy) / 2600;
      const off = Math.abs(curve) / (8 + along * 0.18);
      const v = Math.exp(-off * off) * Math.exp(-along / 380) * (0.8 + tail.fbm(along * 0.01, off * 2, 3) * 0.4);
      return v > 0.02 ? [TAIL, clamp01(v * 0.95)] : null;
    });
    c.glow(hx, hy, 30, '#ffffff', 1.2, 1.2);
    c.glow(hx, hy, 90, '#a8d0ff', 0.35);
    // rolling hills, a farmhouse light or two, the crest where the watchers stand
    c.ridge(H * 0.8, 30, 0.002, '#1a1626', 332, { octaves: 4 });
    const crest = c.ridge(H * 0.86, 50, 0.0016, '#0c0a12', 333, { octaves: 4 });
    for (const [lx, ly] of [[W * 0.12, H * 0.81], [W * 0.68, H * 0.8], [W * 0.9, H * 0.82]]) {
      c.rect(lx, ly, 4, 3, '#f2c27a');
      c.glow(lx + 2, ly + 1, 14, '#f2a050', 0.4);
    }
    const ground = (x) => (crest.find(([px]) => px >= x) || crest.at(-2))[1];
    for (const [fx, h, b] of [[W * 0.6, 62, 0], [W * 0.635, 56, 2], [W * 0.7, 66, -1], [W * 0.73, 40, 0]]) {
      const gy = ground(fx) + 2;
      figure(c, fx, gy, h, { coat: '#08080c', skin: '#0a0a10', bend: b });
      // binoculars raised toward the comet
      c.line(fx - 2, gy - h * 0.86, fx - 12, gy - h * 0.9, 4, '#08080c');
    }
  },

  /** An Alpine glacier seen across its meltwater lake: the snout a grey-blue ice cliff, the tongue rising between dark rock walls. */
  glacier(c, r) {
    c.gradient(0, H * 0.45, [[0, '#6e7a8a'], [0.6, '#aab2ba'], [1, '#cfd2d2']]);
    clouds(c, 341, { y0: 0, y1: H * 0.3, scale: 0.0022, cover: 0.08, lit: '#e8eaec', shade: '#7a8290', alpha: 0.85, stretch: 3 });
    const rock = ramp([[0, '#16181c'], [0.45, '#3e4044'], [0.8, '#6a6a66'], [1, '#9a9890']]);
    const rz = noise2(342);
    // far peaks under snow, then the two valley walls framing the ice (dark, with snow in the gullies)
    // far summits under snow, shaded on their right flanks
    const peaks = c.ridge(H * 0.3, 70, 0.002, '#c4ccd4', 345, { octaves: 5, sharp: true });
    const peakTop = (x) => (peaks.find(([px]) => px >= x) || peaks.at(-2))[1];
    const pz = noise2(346);
    c.paintBox(0, H * 0.1, W, H * 0.45, (x, y) => (y > peakTop(x) + 8 && pz.ridged(x * 0.01, y * 0.02, 3) > 0.7 ? [ROCK_HAZE, 0.3 * smooth(peakTop(x), peakTop(x) + 50, y)] : null));
    // the ice first: the tongue comes down from the upper left, seamed by moraines that follow the flow
    const ice = ramp([[0, '#3a5670'], [0.4, '#7c9cb4'], [0.75, '#c6d8e4'], [1, '#f2f6f8']]);
    const iz = noise2(343);
    const snout = H * 0.66;
    const iceTop = (x) => H * 0.38 + Math.abs(x - W * 0.5) * 0.06 + iz(x * 0.004, 3) * 10;
    c.paintBox(0, H * 0.3, W, snout + 2, (x, y) => {
      const top = iceTop(x);
      if (y < top) return null;
      const t = (y - top) / (snout - top + 1);
      // moraines follow the flow down the middle of the valley; crevasses cross it, bowed downstream
      const flow = (x - W * 0.5) / (180 + (y - H * 0.38) * 2.4);
      const moraine = Math.abs(flow - 0.22 - iz(y * 0.01, 2) * 0.06) < 0.03 || Math.abs(flow + 0.3 - iz(y * 0.012, 3) * 0.06) < 0.025;
      const crev = Math.abs(Math.sin(y * 0.1 - flow * flow * 5 + iz(x * 0.01, y * 0.01) * 2)) < 0.07 + t * 0.03 && iz.fbm(x * 0.015, y * 0.02, 3) > 0.08;
      const v = 0.88 - t * 0.3 + iz.fbm(x * 0.02, y * 0.04, 3) * 0.12 - Math.max(0, flow) * 0.12;
      return [moraine ? rock(0.35 + v * 0.3) : crev ? ice(0.3) : ice(clamp01(v)), 1];
    });
    // then the valley walls in front of its edges: dark rock, snow in the gullies
    const wallTop = (x) => {
      const left = H * 0.2 + (x / W) * H * 1.6;
      const right = H * 0.22 + (1 - x / W) * H * 1.5;
      return Math.min(left, right) + rz(x * 0.006, 1) * 36 + rz(x * 0.03, 2) * 8;
    };
    c.paintBox(0, H * 0.1, W, H * 0.74, (x, y) => {
      const top = wallTop(x);
      if (y < top) return null;
      const side = x < W * 0.5 ? 1 : -1;
      const v = rz.fbm(x * 0.012, y * 0.01, 5) + (side > 0 ? 0.1 : -0.05);
      const gully = rz.ridged(x * 0.01 + y * 0.006 * side, y * 0.012, 2) > 0.86 && y < H * 0.55;
      return [gully ? mix(SNOW, hex('#8a94a0'), clamp01((y - top) / 260)) : rock(clamp01(0.42 + v * 0.45)), 1];
    });
    // the snout: a broken ice cliff into the lake, blue in its shadowed hollows
    const cliffTop = (x) => snout - 40 + iz(x * 0.015, 8) * 22 + iz(x * 0.08, 10) * 5;
    c.paintBox(W * 0.16, snout - 70, W * 0.88, H * 0.72, (x, y) => {
      if (y < cliffTop(x) || y > H * 0.72 || Math.abs(x - W * 0.52) > W * 0.34 + iz(y * 0.05, 12) * 14) return null;
      const col = iz.fbm(x * 0.02, y * 0.004, 3);
      return [ice(clamp01(0.36 + col * 0.3 - (y - cliffTop(x)) / 300 + (x < W * 0.45 ? 0.1 : -0.05))), 1];
    });
    // the lake: milky green-grey, still, with a few floes; the near shore of grey moraine
    c.paintBox(0, H * 0.72, W, H, () => [LAKE, 1]);
    reflect(c, H * 0.72, H * 0.92, '#4e6c70', 0.5, 344, { ripple: 3, stretch: 0.05 });
    for (let i = 0; i < 9; i++) {
      const bx = W * 0.22 + r() * W * 0.55;
      const by = H * 0.74 + r() * H * 0.12;
      c.litPoly(blob(bx, by, 10 + r() * 22, 4 + r() * 5, Math.floor(r() * 1e6), 0.3), bx, by, 24, 7, ice, { lx: -0.6, ly: -0.8, lz: 0.5 });
    }
    const shore = (x) => H * 0.9 + rz(x * 0.005, 11) * 16 - (x / W) * 20;
    c.paintBox(0, H * 0.84, W, H, (x, y) => (y > shore(x) ? [rock(clamp01(0.35 + rz.fbm(x * 0.05, y * 0.08, 3) * 0.35)), 1] : null));
    // a survey stake with an orange flag and two researchers on the shore
    const gx = W * 0.2;
    const gy = shore(W * 0.2) + 18;
    c.line(gx + 70, gy, gx + 70, gy - 74, 3, '#2a2a2a');
    c.poly([[gx + 71, gy - 74], [gx + 98, gy - 68], [gx + 71, gy - 62]], '#e0602a');
    figure(c, gx, gy, 56, { coat: '#c04a2a' });
    figure(c, gx + 30, gy + 2, 52, { coat: '#2a4a6a', bend: 4 });
  },

  /** Layered sedimentary rock in an ancient Martian lake bed under a butterscotch sky; a rover small in the distance. */
  mars(c, r) {
    c.gradient(0, H * 0.5, [[0, '#6a4a3a'], [0.6, '#b08060'], [1, '#d8b08a']]);
    c.glow(W * 0.8, H * 0.1, 300, '#f0d0b0', 0.2);
    // far crater rim
    c.ridge(H * 0.5, 20, 0.0012, '#a07858', 351, { octaves: 4 });
    // the mesa of layered rock: strata with their own tones, eroded edges, lit from the left
    const strata = ramp([[0, '#5a3426'], [0.25, '#8a5a40'], [0.5, '#b07a56'], [0.75, '#c8946a'], [1, '#dcb088']]);
    const sz = noise2(352);
    // the mesa's skyline: a cap rock with a stepped, eroded edge
    const top = (x) => H * 0.3 + Math.max(0, (x - W * 0.62) / W) * 900 + sz(x * 0.003, 1) * 20 - Math.max(0, (W * 0.18 - x) / W) * 300 + Math.floor((sz(x * 0.012, 7) + 1) * 2.5) * 9;
    c.paintBox(0, H * 0.2, W, H * 0.72, (x, y) => {
      const t = top(x);
      if (y < t || y > H * 0.72) return null;
      const layer = (y + sz(x * 0.004, 2) * 8) / 11;
      const band = Math.floor(layer);
      const tone = 0.15 + ((band * 0.618) % 1) * 0.7;
      const lit = clamp01(0.55 - (x - W * 0.3) / W * 0.7 + sz.fbm(x * 0.02, y * 0.04, 3) * 0.3);
      // each layer's lip catches the light, the undercut beneath it is in shadow
      const f = layer % 1;
      const edge = f < 0.14 ? 0.22 : f > 0.8 ? -0.3 : 0;
      return [strata(clamp01(tone * 0.55 + lit * 0.5 + edge - (y - t < 6 ? -0.15 : 0))), 1];
    });
    // a scree apron below the cliff
    c.paintBox(0, H * 0.62, W, H * 0.8, (x, y) => (y > H * 0.66 + sz(x * 0.006, 3) * 24 ? [strata(clamp01(0.45 + sz.fbm(x * 0.05, y * 0.05, 3) * 0.3)), 1] : null));
    // rippled sand in the foreground, with rocks and their long shadows
    const sand = ramp([[0, '#6a4430'], [0.6, '#b07e58'], [1, '#e0b88c']]);
    c.paintBox(0, H * 0.74, W, H, (x, y) => {
      const ripple = Math.sin((x * 0.04 + y * 0.18) + sz(x * 0.01, y * 0.01) * 3) * 0.5 + 0.5;
      return y > H * 0.76 + sz(x * 0.003, 4) * 10 ? [sand(clamp01(0.45 + ripple * 0.2 + sz.fbm(x * 0.03, y * 0.05, 3) * 0.2 - (y - H * 0.76) / H * 0.4)), 1] : null;
    });
    for (let i = 0; i < 22; i++) {
      const bx = r() * W;
      const by = H * 0.78 + r() ** 0.7 * H * 0.22;
      const s = 0.4 + (by - H * 0.78) / (H * 0.22) * 1.3;
      groundShadow(c, bx + 18 * s, by + 3, 30 * s, 6 * s, 0.4, '#3a2014');
      c.litPoly(blob(bx, by - 6 * s, 16 * s, 10 * s, Math.floor(r() * 1e6), 0.35), bx, by - 6 * s, 16 * s, 10 * s, strata, { lx: -0.8, ly: -0.5, lz: 0.4, ambient: 0.1 });
    }
    // the rover, far off on the apron: body, mast and camera head, six wheels
    const rx = W * 0.3;
    const ry = H * 0.7;
    c.rect(rx - 26, ry - 18, 52, 12, '#d8c8b0');
    c.rect(rx - 26, ry - 8, 52, 4, '#5a4a40');
    c.line(rx + 14, ry - 18, rx + 16, ry - 46, 3, '#c8b8a0');
    c.rect(rx + 10, ry - 52, 14, 8, '#e0d4c0');
    for (const wx of [-22, -2, 18]) c.circle(rx + wx, ry, 5, '#3a3028');
    groundShadow(c, rx + 10, ry + 4, 40, 5, 0.4, '#3a2014');
  },

  /** A drone show over the Han river at night: a thousand lights forming a whale above the bridges; crowds on the bank (Seoul). */
  drones(c, r) {
    c.gradient(0, H * 0.62, [[0, '#04060e'], [0.6, '#0c1430'], [1, '#26244a']]);
    stars(c, r, 160, H * 0.4);
    // the city across the river: towers of different heights, lit windows, a glow over the skyline
    const hz = H * 0.6;
    c.glow(W * 0.5, hz, 700, '#3a3060', 0.5);
    const towers = [];
    for (let x = -20; x < W + 40; ) {
      const w = 30 + r() * 70;
      towers.push({ x, w, h: 40 + r() ** 2 * 230 });
      x += w + r() * 10;
    }
    for (const t of towers) {
      const tone = mix(hex('#141a30'), hex('#2a2a4a'), r() * 0.6);
      c.rect(t.x, hz - t.h, t.w, t.h, tone);
      c.rect(t.x, hz - t.h, Math.max(2, t.w * 0.18), t.h, mix(tone, hex('#4a4a70'), 0.35));
      windows(c, r, t.x, hz - t.h, t.x + t.w, hz, { w: 3, h: 3, gx: 7, gy: 8, lit: 0.3, warm: '#f2c27a', cool: '#9ab8e8', alpha: 0.8 });
    }
    // the whale: about a thousand lights along its body, fins and tail, slightly tilted, cool white
    const wx = W * 0.5;
    const wy = H * 0.24;
    const pts = [];
    for (let i = 0; i < 900; i++) {
      const u = r() * 2 - 1;
      const v = r() * 2 - 1;
      // body: a tapered ellipse; tail flukes beyond its right end; a pectoral fin below
      const bodyX = u * 300;
      const half = 70 * Math.sqrt(Math.max(0, 1 - u * u)) * (u < -0.6 ? 0.9 : 1);
      if (Math.abs(v) <= 1) pts.push([bodyX, v * half]);
    }
    for (let i = 0; i < 160; i++) {
      const k = r();
      const side = r() < 0.5 ? -1 : 1;
      pts.push([300 + k * 90, side * (k * 70) * (0.6 + r() * 0.4) - k * 20]);
    }
    for (let i = 0; i < 70; i++) {
      const k = r();
      pts.push([-120 + k * 90, 50 + k * 70 + r() * 10]);
    }
    for (const [px, py] of pts) {
      const x = wx + px * 0.98 + py * 0.15;
      const y = wy + py * 0.98 - px * 0.12 + Math.sin(px * 0.02) * 10;
      c.glow(x, y, 2.6, '#dff4ff', 0.9, 1);
    }
    c.glow(wx, wy, 380, '#4a6aa0', 0.15);
    // the river: dark, holding the lights in long streaks; a bridge with lit arches
    c.gradient(hz, H, [[0, '#141830'], [1, '#05060c']]);
    reflect(c, hz, H * 0.86, '#0a0c18', 0.45, 361, { ripple: 3, stretch: 0.12 });
    const by = hz + 26;
    c.rect(0, by, W, 10, '#1a1c2a');
    for (let x = 30; x < W; x += 120) {
      c.poly(Array.from({ length: 13 }, (_, i) => [x + i * 10, by + 10 + Math.sin((i / 12) * Math.PI) * 24]), '#05060c');
      c.glow(x + 60, by + 4, 10, '#f2c27a', 0.6);
    }
    for (let x = 0; x < W; x += 16) c.rect(x, by - 2, 3, 2, '#f2d29a', 0.8);
    // the crowd on the near bank: a band of heads and shoulders against the water, a few phones lit
    const crowd = noise1(362);
    for (let x = -10; x < W + 10; x += 9 + r() * 6) {
      const h = 34 + crowd(x * 0.05) * 8 + r() * 10;
      const gy = H + 4;
      c.ellipse(x, gy - h, 7, 8, '#06070c');
      c.poly([[x - 13, gy], [x - 11, gy - h + 10], [x + 11, gy - h + 10], [x + 13, gy]], '#06070c');
      if (r() < 0.08) {
        c.rect(x + 4, gy - h - 12, 5, 8, '#c8dcff');
        c.glow(x + 6, gy - h - 8, 10, '#a8c8ff', 0.4);
      }
    }
  },

  /** A refinery on the coast at dusk: columns and tanks lit from below, a flare stack burning, a tanker at the jetty. */
  refinery(c, r) {
    c.gradient(0, H * 0.62, [[0, '#2a2c3a'], [0.5, '#5a4a52'], [0.85, '#b07a5a'], [1, '#d89a6a']]);
    clouds(c, 371, { y0: H * 0.05, y1: H * 0.45, scale: 0.002, cover: 0.15, lit: '#d89a7a', shade: '#3a3a4a', alpha: 0.85, stretch: 4, lightUp: false });
    const hz = H * 0.6;
    const steel = ramp([[0, '#0e1016'], [0.5, '#2a2c34'], [1, '#6a6460']]);
    // tanks: squat cylinders with lit domed tops
    for (const [tx, R] of [[W * 0.08, 70], [W * 0.2, 56], [W * 0.68, 64], [W * 0.82, 80], [W * 0.95, 50]]) {
      c.rect(tx - R, hz - R * 0.7, R * 2, R * 0.7, steel(0.35));
      c.rect(tx - R, hz - R * 0.7, R * 0.6, R * 0.7, steel(0.55));
      c.ellipse(tx, hz - R * 0.7, R, R * 0.16, steel(0.7));
      for (let k = 1; k < 4; k++) c.rect(tx - R, hz - R * 0.7 + k * R * 0.17, R * 2, 1, steel(0.2));
    }
    // columns and towers with platforms and ladders, a few work lights
    for (const [cx, h, w] of [[W * 0.33, 260, 26], [W * 0.38, 200, 20], [W * 0.43, 300, 30], [W * 0.5, 180, 18], [W * 0.56, 240, 24]]) {
      c.rect(cx - w / 2, hz - h, w, h, steel(0.3));
      c.rect(cx - w / 2, hz - h, w * 0.3, h, steel(0.5));
      for (let y = hz - h + 30; y < hz - 10; y += 34) {
        c.rect(cx - w, y, w * 2, 3, steel(0.4));
        if (r() < 0.5) {
          c.rect(cx + w * 0.7, y - 4, 3, 3, '#f2d27a');
          c.glow(cx + w * 0.7, y - 3, 12, '#f2b25a', 0.35);
        }
      }
    }
    // pipe racks along the ground
    for (let k = 0; k < 4; k++) c.rect(W * 0.25, hz - 20 - k * 7, W * 0.4, 3, steel(0.25 + k * 0.05));
    // the flare: a thin stack, a ragged flame and its glow on the clouds
    const fx = W * 0.62;
    c.rect(fx - 4, hz - 340, 8, 340, steel(0.3));
    const flame = noise2(372);
    c.paintBox(fx - 40, hz - 420, fx + 40, hz - 330, (x, y) => {
      const dx = (x - fx) / 30;
      const dy = (hz - 340 - y) / 80;
      const v = 1 - dx * dx * 2 - dy + flame.fbm(x * 0.05, y * 0.05, 3) * 0.6;
      return v > 0 ? [mix(hex('#f06a2a'), hex('#fff0c0'), clamp01(v)), clamp01(v * 1.5)] : null;
    });
    c.glow(fx, hz - 370, 260, '#f08a3a', 0.35);
    // water, the jetty and a tanker
    c.gradient(hz, H, [[0, '#6a5a5a'], [1, '#14161e']]);
    reflect(c, hz, H * 0.85, '#1e2028', 0.45, 373, { ripple: 4 });
    const sy = H * 0.8;
    c.poly([[W * 0.1, sy], [W * 0.72, sy], [W * 0.76, sy - 40], [W * 0.06, sy - 40]], '#1a1c22');
    c.rect(W * 0.08, sy - 44, W * 0.66, 4, '#5a4a40');
    c.rect(W * 0.6, sy - 110, 70, 70, '#2a2c32');
    windows(c, r, W * 0.6, sy - 110, W * 0.6 + 70, sy - 44, { w: 6, h: 4, gx: 12, gy: 12, lit: 0.6 });
    for (let x = W * 0.14; x < W * 0.56; x += 40) c.line(x, sy - 44, x + 20, sy - 52, 3, '#3a3a40');
  },

  /** An airport at dusk: the long terminal roof lit from inside, a jet climbing out over rows of runway lights (Bangkok). */
  airport(c, r) {
    c.gradient(0, H * 0.66, [[0, '#1c1e3a'], [0.5, '#5a3e5a'], [0.82, '#d0806a'], [1, '#f2b07a']]);
    clouds(c, 381, { y0: H * 0.1, y1: H * 0.5, scale: 0.0024, cover: 0.24, lit: '#f0a080', shade: '#3a3050', alpha: 0.7, stretch: 6, lightUp: false });
    const hz = H * 0.62;
    // the terminal: a long low hall under a wave-shaped roof, warm light behind the glass
    const roof = (x) => hz - 70 - Math.sin((x / W) * Math.PI * 3) * 10;
    c.paintBox(0, hz - 100, W, hz, (x, y) => {
      if (y < roof(x)) return null;
      const glass = y > roof(x) + 10 && y < hz - 6;
      const mullion = x % 26 < 2;
      return glass ? [mullion ? MULLION : mix(hex('#f2c27a'), hex('#8a6a5a'), clamp01((y - roof(x)) / 70) * 0.5 + (Math.sin(x * 0.07) * 0.5 + 0.5) * 0.2), 1] : [TERMINAL, 1];
    });
    c.paintBox(0, hz - 104, W, hz - 60, (x, y) => (Math.abs(y - roof(x)) < 4 ? [ROOF_EDGE, 1] : null));
    // control tower
    c.rect(W * 0.86, hz - 230, 16, 160, '#1c1a26');
    c.poly([[W * 0.86 - 22, hz - 230], [W * 0.86 + 38, hz - 230], [W * 0.86 + 30, hz - 262], [W * 0.86 - 14, hz - 262]], '#24222e');
    c.rect(W * 0.86 - 16, hz - 256, 48, 18, '#7aa0b8');
    // the apron and runway: rows of lights converging toward the horizon
    c.gradient(hz, H, [[0, '#3a3240'], [1, '#141218']]);
    for (let row = 0; row < 3; row++) {
      for (let k = 0; k < 40; k++) {
        const t = k / 40;
        const x = W * (0.5 - (row - 1) * 0.06) + (t * t) * W * (row - 1) * 0.9;
        const y = hz + 6 + t * t * (H - hz);
        c.glow(x, y, 2 + t * 6, row === 1 ? '#f2e2c0' : '#7ab0f0', 0.9, 1);
      }
    }
    // the jet climbing out, landing lights on, seen against the sunset
    const jx = W * 0.32;
    const jy = H * 0.3;
    const a = -0.32;
    const pt = (u, v) => [jx + u * Math.cos(a) - v * Math.sin(a), jy + u * Math.sin(a) + v * Math.cos(a)];
    const shape = (list) => list.map(([u, v]) => pt(u, v));
    c.poly(shape([[-120, -6], [110, -8], [130, 0], [110, 8], [-120, 7]]), '#14141c');
    c.poly(shape([[-10, 0], [40, 0], [-30, 70], [-50, 70]]), '#14141c');
    c.poly(shape([[-10, 0], [40, 0], [-20, -40], [-36, -40]]), '#1a1a24');
    c.poly(shape([[-110, 0], [-90, 0], [-120, -40], [-132, -40]]), '#14141c');
    const [lx, ly] = pt(120, 2);
    c.glow(lx, ly, 26, '#fff4dc', 0.9, 1.4);
    // palms at the edge of the frame
    for (const [px, h] of [[W * 0.04, 260], [W * 0.1, 200], [W * 0.96, 230]]) {
      c.line(px, H, px + 18, H - h, 7, '#0c0a10');
      for (let k = 0; k < 7; k++) {
        const ang = (k / 7) * Math.PI * 2;
        c.line(px + 18, H - h, px + 18 + Math.cos(ang) * 70, H - h + Math.sin(ang) * 30 + 20, 5, '#0c0a10');
      }
    }
  },

  /** Small mushrooms glowing green among moss and roots on a rainforest floor at night (Brazil). */
  mushroom(c, r) {
    c.gradient(0, H, [[0, '#04080a'], [0.6, '#0a1410'], [1, '#060a08']]);
    // trunks and hanging vines in the dark, faintly lit
    for (let i = 0; i < 9; i++) {
      const x = r() * W;
      const w = 30 + r() * 90;
      c.paintBox(x - w / 2, 0, x + w / 2, H * 0.8, (px, py) => [mix(hex('#06100c'), hex('#14261c'), clamp01(0.4 + Math.sin((px - x) / w * 3) * 0.3)), 0.85]);
    }
    for (let i = 0; i < 26; i++) {
      const x = r() * W;
      c.line(x, 0, x + (r() - 0.5) * 40, H * (0.2 + r() * 0.4), 2, '#0e1c14', 0.8);
    }
    // the forest floor: a mossy log across the frame, roots, leaf litter
    const moss = ramp([[0, '#08120c'], [0.5, '#1e3a22'], [1, '#4a7a3a']]);
    const mz = noise2(391);
    const logTop = (x) => H * 0.62 + Math.sin(x * 0.002 + 1) * 30 + mz(x * 0.01, 1) * 6;
    c.paintBox(0, H * 0.5, W, H * 0.86, (x, y) => {
      const top = logTop(x);
      if (y < top || y > top + 110) return null;
      const t = (y - top) / 110;
      return [moss(clamp01(0.75 - t * 0.6 + mz.fbm(x * 0.03, y * 0.05, 3) * 0.3)), 1];
    });
    c.paintBox(0, H * 0.8, W, H, (x, y) => [moss(clamp01(0.2 + mz.fbm(x * 0.02, y * 0.03, 4) * 0.35)), 1]);
    // the mushrooms: thin stems, domed caps glowing green, lighting the moss around them
    const cluster = [[W * 0.4, 0], [W * 0.46, 0.2], [W * 0.52, -0.1], [W * 0.57, 0.15], [W * 0.62, 0], [W * 0.3, 0.05], [W * 0.7, -0.05]];
    for (const [cx] of cluster) c.glow(cx, logTop(cx) - 10, 120, '#4aff9a', 0.16);
    for (const [cx, off] of cluster) {
      for (let k = 0; k < 4; k++) {
        const x = cx + (r() - 0.5) * 50;
        const base = logTop(x) + 6;
        const h = 18 + r() * 30 + off * 20;
        const R = 9 + r() * 8;
        c.line(x, base, x + (r() - 0.5) * 6, base - h, 3, '#bfe8c8', 0.9);
        c.ellipse(x, base - h, R, R * 0.55, '#7affb8', 0.95);
        c.ellipse(x - R * 0.3, base - h - R * 0.2, R * 0.4, R * 0.2, '#e8fff0', 0.8);
        c.glow(x, base - h, R * 3, '#5aff9a', 0.4);
      }
    }
    sparkle(c, r, 60, W * 0.2, H * 0.3, W * 0.8, H * 0.7, '#8affc0', 0.5, [1, 2]);
  },

  /** A steep fjord under low cloud; the road along the shore disappears into a new tunnel portal (west coast of Norway). */
  fjord(c, r) {
    c.gradient(0, H * 0.58, [[0, '#5a6674'], [1, '#a8b2b8']]);
    clouds(c, 401, { y0: 0, y1: H * 0.35, scale: 0.002, cover: 0.02, lit: '#c8cfd4', shade: '#6a7480', alpha: 0.95, stretch: 3 });
    const rock = ramp([[0, '#141a1c'], [0.5, '#34403e'], [0.8, '#5a6a5e'], [1, '#8a9a84']]);
    const fz = noise2(402);
    const hz = H * 0.58;
    // the far end of the fjord: a pale ridge in the haze, closing the view
    c.ridge(hz - 30, 24, 0.004, '#8e9aa2', 404, { bottom: hz, octaves: 3 });
    // the walls of the fjord: very steep, dark, green on the lower slopes, receding in haze
    const wall = (x, side) => side < 0 ? H * 0.12 + Math.pow(x / (W * 0.42), 1.6) * (hz - H * 0.12) : H * 0.08 + Math.pow((W - x) / (W * 0.5), 1.4) * (hz - H * 0.08);
    for (const [side, haze0] of [[1, 0], [-1, 0]]) {
      c.paintBox(0, 0, W, hz, (x, y) => {
        const top = wall(x, side) + fz(x * 0.01, side) * 18;
        const inSide = side < 0 ? x < W * 0.46 : x > W * 0.44;
        if (!inSide || y < top) return null;
        const v = fz.fbm(x * 0.012, y * 0.01, 5);
        const green = y > hz - 120 + fz(x * 0.02, 3) * 30;
        return [mix(rock(clamp01(0.35 + v * 0.45 + (green ? 0.25 : 0))), hex('#a8b2b8'), haze0 + (1 - Math.abs(x - W * 0.45) / (W * 0.45)) * 0.35), 1];
      });
    }
    // a waterfall on the right wall
    c.paintBox(W * 0.7, H * 0.18, W * 0.72, hz, (x, y) => [WATERFALL, 0.55 + fz(x * 0.2, y * 0.05) * 0.3]);
    // the water: still, dark, mirroring the walls
    c.gradient(hz, H, [[0, '#6a767c'], [1, '#1a2224']]);
    reflect(c, hz, H, '#1e2a2c', 0.45, 403, { ripple: 2, stretch: 0.04 });
    // the shore road: a narrow ledge along the foot of the right wall, running into a concrete portal
    const road = (x) => hz + 30 - (x - W * 0.55) * 0.05;
    const rockShore = ramp([[0, '#101416'], [1, '#3a4440']]);
    c.paintBox(W * 0.52, hz - 10, W, H, (x, y) => {
      const ry = road(x);
      if (y < ry - 2) return null;
      if (y < ry + 8) return [y < ry ? RAIL : ROAD, 1];
      return y < ry + 40 + fz(x * 0.02, 9) * 10 ? [rockShore(clamp01(0.4 + fz.fbm(x * 0.05, y * 0.05, 3) * 0.4)), 1] : null;
    });
    for (let x = W * 0.56; x < W; x += 16) c.rect(x, road(x) - 7, 2, 7, '#b8b8b0');
    const px = W * 0.62;
    const py = road(px) + 8;
    // the portal: a concrete hood with a dark arch, lit inside, cut into the rock face
    c.poly([[px - 64, py], [px - 58, py - 74], [px + 58, py - 78], [px + 64, py]], '#7e807c');
    c.poly([[px - 64, py - 70], [px + 64, py - 76], [px + 70, py - 86], [px - 70, py - 80]], '#a8aaa4');
    c.poly(Array.from({ length: 17 }, (_, i) => [px - 44 + i * 5.5, py - Math.sin((i / 16) * Math.PI) * 58]), '#0c0e10');
    for (let i = 0; i < 5; i++) c.glow(px - 30 + i * 15, py - 46 + Math.abs(i - 2) * 4, 5, '#f2c27a', 0.7);
    // a car with its headlights on, heading for the tunnel
    const carX = W * 0.84;
    c.rect(carX, road(carX) - 12, 34, 11, '#3a4a6a');
    c.rect(carX + 6, road(carX) - 18, 20, 7, '#2a3448');
    c.glow(carX - 2, road(carX) - 6, 16, '#fff4dc', 0.7);
    // a red farmhouse far up the fjord
    c.rect(W * 0.24, hz - 18, 14, 10, '#8a2a20');
    c.poly([[W * 0.24 - 2, hz - 18], [W * 0.24 + 7, hz - 24], [W * 0.24 + 16, hz - 18]], '#3a2a24');
  },

  /** A coffee estate on rolling hills after the harvest: contour rows of bushes, red cherries, a picker with a basket (Brazil). */
  coffee(c, r) {
    c.gradient(0, H * 0.45, [[0, '#8aa8c0'], [0.7, '#d4dccc'], [1, '#ece2c4']]);
    clouds(c, 411, { y0: H * 0.02, y1: H * 0.3, scale: 0.0026, cover: 0.2, lit: '#fff4e0', shade: '#a8b0b8', alpha: 0.85 });
    c.glow(W * 0.85, H * 0.15, 480, '#fff0c8', 0.3);
    c.ridge(H * 0.38, 40, 0.002, '#9aa8a0', 412, { octaves: 4 });
    c.ridge(H * 0.44, 50, 0.0025, '#6a8060', 413, { octaves: 4 });
    // hills striped with contour rows of dark, rounded bushes; red soil between them
    const bush = ramp([[0, '#0e1e10'], [0.5, '#2a4a24'], [0.85, '#5a7a3a'], [1, '#8aa050']]);
    const soil = ramp([[0, '#3a1e14'], [1, '#8a4a2a']]);
    const hz = noise2(414);
    const hill = (x) => H * 0.48 + Math.sin(x * 0.003) * 30 + hz(x * 0.002, 1) * 30;
    c.paintBox(0, H * 0.4, W, H, (x, y) => {
      const top = hill(x);
      if (y < top) return null;
      const depth = (y - top) / (H - top);
      const spacing = 8 + depth * 40;
      const row = (y - top + Math.sin(x * 0.004 + depth * 3) * 20 * depth) / spacing;
      const f = row % 1;
      const leaf = hz.fbm(x * (0.05 - depth * 0.03), y * 0.05, 3);
      if (f < 0.68) return [bush(clamp01(0.3 + (0.68 - f) * 0.9 + leaf * 0.35 - depth * 0.1)), 1];
      return [soil(clamp01(0.5 + leaf * 0.3)), 1];
    });
    // ripe cherries on the nearest bushes
    for (let i = 0; i < 260; i++) {
      const x = r() * W;
      const y = H * 0.82 + r() * H * 0.18;
      c.circle(x, y, 2 + r() * 2.5, r() < 0.8 ? '#b0281e' : '#e06a2a', 0.9);
    }
    // a picker between the rows, basket at the hip
    const fx = W * 0.62;
    const fy = H * 0.86;
    figure(c, fx, fy, 120, { coat: '#d8d0b8', skin: '#7a5a44', bend: 4 });
    c.ellipse(fx, fy - 120 * 0.92, 22, 6, '#c8b88a');
    c.ellipse(fx + 26, fy - 50, 18, 14, '#8a6a3a');
  },

  /** A total solar eclipse over the hills of northern Spain: the corona around a black disc, the horizon glowing all round. */
  eclipse(c, r) {
    c.gradient(0, H * 0.7, [[0, '#060a1a'], [0.5, '#121a36'], [0.85, '#3a3450'], [1, '#c8865a']]);
    stars(c, r, 120, H * 0.5, { warm: 0.3 });
    const ex = W * 0.6;
    const ey = H * 0.3;
    const R = 56;
    // the corona: streamers of pale light, uneven, longer along the sun's equator
    const cz = noise2(421);
    c.paintBox(ex - 320, ey - 260, ex + 320, ey + 260, (x, y) => {
      const dx = x - ex;
      const dy = y - ey;
      const d = Math.hypot(dx, dy);
      if (d < R) return null;
      const a = Math.atan2(dy, dx);
      const streak = 0.6 + cz(Math.cos(a) * 3 + 10, Math.sin(a) * 3) * 0.5 + Math.abs(Math.cos(a)) * 0.4;
      const v = Math.exp(-(d - R) / (40 * streak + 10)) * (0.7 + cz(a * 8, d * 0.02) * 0.3);
      return v > 0.02 ? [CORONA, clamp01(v)] : null;
    });
    c.circle(ex, ey, R, '#020208');
    c.glow(ex + R * 0.68, ey - R * 0.72, 10, '#ffffff', 1.2, 1.2); // a bead of light at the edge
    c.glow(ex - R * 0.9, ey + R * 0.3, 4, '#ff8a6a', 0.8, 1.2); // a prominence
    // the hills: layered, dark, with a village's lights and people watching from a field
    c.ridge(H * 0.74, 40, 0.002, '#2a2234', 422, { octaves: 4 });
    c.ridge(H * 0.8, 50, 0.0016, '#14101c', 423, { octaves: 4 });
    const field = c.ridge(H * 0.88, 20, 0.003, '#0a080e', 424, { octaves: 3 });
    for (let i = 0; i < 18; i++) {
      const lx = W * 0.05 + r() * W * 0.35;
      c.rect(lx, H * 0.79 + r() * 12, 3, 2, '#f2c27a', 0.8);
    }
    const ground = (x) => (field.find(([px]) => px >= x) || field.at(-2))[1];
    for (const [fx, h] of [[W * 0.66, 70], [W * 0.7, 64], [W * 0.75, 72], [W * 0.79, 46], [W * 0.84, 66]]) figure(c, fx, ground(fx) + 4, h, { coat: '#06050a', skin: '#08070c' });
  },

  /** Midday heat in an empty square of Seville: white walls, a church tower, hard shadows, air shimmering over the paving. */
  heat(c, r) {
    c.gradient(0, H * 0.5, [[0, '#7aa0c8'], [0.6, '#c4d0d8'], [1, '#f2e8d4']]);
    c.glow(W * 0.75, H * 0.02, 520, '#fffaf0', 0.55);
    const hz = H * 0.58;
    const wall = ramp([[0, '#8a6a4a'], [0.5, '#d8c4a4'], [0.85, '#f4ecdc'], [1, '#ffffff']]);
    const wz = noise2(431);
    // the far side of the square: whitewashed houses with ochre trim, shutters closed against the sun
    let x = -20;
    while (x < W + 20) {
      const w = 110 + r() * 120;
      const h = 150 + r() * 90;
      const top = hz - h;
      c.paintBox(x, top, x + w, hz, (px, py) => [wall(clamp01(0.82 + wz.fbm(px * 0.02, py * 0.02, 3) * 0.08 - (py > hz - 12 ? 0.2 : 0))), 1]);
      c.rect(x, top, w, 8, '#c8904a');
      for (let wx = x + 16; wx < x + w - 24; wx += 34) {
        for (let wy = top + 30; wy < hz - 50; wy += 56) {
          c.rect(wx, wy, 16, 28, '#3a5a4a');
          c.rect(wx + 1, wy + 26, 14, 4, '#1a1a1a', 0.4);
        }
      }
      x += w;
    }
    // the church tower behind, ochre and white, its belfry open
    const tx = W * 0.32;
    c.rect(tx, H * 0.08, 60, hz - H * 0.08, '#e8d4b0');
    c.rect(tx + 40, H * 0.08, 20, hz - H * 0.08, '#c4a880');
    c.rect(tx + 12, H * 0.12, 14, 30, '#2a2018');
    c.rect(tx + 34, H * 0.12, 14, 30, '#2a2018');
    c.poly([[tx - 4, H * 0.08], [tx + 30, H * 0.02], [tx + 64, H * 0.08]], '#b0703a');
    // the square: pale paving, the deep shadow of an orange tree, nobody about
    const pave = ramp([[0, '#6a5a48'], [0.6, '#c8b494'], [1, '#ece0c8']]);
    c.paintBox(0, hz, W, H, (px, py) => {
      const joint = (Math.floor(px / 40 + py * 0.02) + Math.floor((py - hz) / 18)) % 2 === 0;
      return [pave(clamp01(0.78 - (py - hz) / H * 0.25 + (joint ? 0.03 : 0) + wz.fbm(px * 0.03, py * 0.05, 3) * 0.05)), 1];
    });
    groundShadow(c, W * 0.18, H * 0.86, 220, 40, 0.6, '#3a2a20');
    const leaf = ramp([[0, '#14240e'], [0.6, '#3a5a24'], [1, '#6a8a3a']]);
    c.line(W * 0.16, H * 0.86, W * 0.17, H * 0.62, 12, '#3a2a1e');
    c.litPoly(blob(W * 0.17, H * 0.56, 110, 70, 432, 0.25), W * 0.17, H * 0.56, 110, 70, leaf, { lx: 0.6, ly: -0.8, lz: 0.5, ambient: 0.1 });
    for (let i = 0; i < 14; i++) c.circle(W * 0.1 + r() * 140, H * 0.5 + r() * 90, 4, '#e88a2a', 0.9);
    // heat shimmer: the far walls waver in a band just above the paving
    const src = c.d.slice();
    c.paintBox(0, hz - 40, W, hz + 20, (px, py) => {
      const sx = Math.round(px + Math.sin(py * 0.6 + px * 0.01) * 2);
      if (sx < 0 || sx >= W) return null;
      const i = (py * W + sx) * 3;
      return [[src[i], src[i + 1], src[i + 2]], 0.8];
    });
    // a street thermometer on a pole, glowing amber
    c.line(W * 0.9, H * 0.92, W * 0.9, H * 0.6, 5, '#2a2a2a');
    c.rect(W * 0.9 - 30, H * 0.56, 60, 30, '#1a1a1a');
    c.rect(W * 0.9 - 24, H * 0.565, 48, 20, '#f08a2a', 0.9);
    c.glow(W * 0.9, H * 0.575, 40, '#f08a2a', 0.3);
  },

  /** A tidal turbine platform in a fast-running channel off northern Scotland under a broken sky; a lighthouse on the headland. */
  tidal(c, r) {
    c.gradient(0, H * 0.55, [[0, '#4a5a6e'], [0.6, '#8a9aa8'], [1, '#c8ccc4']]);
    clouds(c, 441, { y0: 0, y1: H * 0.45, scale: 0.0022, cover: 0.12, lit: '#e8e4d8', shade: '#5a6474', alpha: 0.9, stretch: 3 });
    c.glow(W * 0.2, H * 0.3, 400, '#fff0d0', 0.25);
    const hz = H * 0.55;
    // low islands and the headland with its lighthouse
    c.ridge(hz - 6, 14, 0.004, '#5a6670', 442, { bottom: hz, octaves: 3 });
    const head = ramp([[0, '#1a1e1c'], [1, '#4a5a44']]);
    c.poly([[W * 0.7, hz], [W * 0.78, hz - 60], [W * 0.9, hz - 74], [W, hz - 70], [W, hz]], '#2a3430', 1, (px, py) => head(clamp01(0.5 + (py - hz) / 200)));
    c.rect(W * 0.86, hz - 124, 14, 52, '#e8e4dc');
    c.rect(W * 0.86 - 2, hz - 132, 18, 10, '#2a2a2a');
    c.glow(W * 0.86 + 7, hz - 127, 14, '#fff0b0', 0.6);
    // the sea: fast water with long streaks and white caps
    const sea = noise2(443);
    const seaTone = ramp([[0, '#14202a'], [0.5, '#2e4250'], [0.85, '#6a7e88'], [1, '#d8e0e0']]);
    c.paintBox(0, hz, W, H, (px, py) => {
      const k = (py - hz) / (H - hz);
      const v = sea.fbm(px * 0.003 / (0.15 + k), py * 0.04 / (0.15 + k), 4);
      const streak = Math.abs(Math.sin(px * 0.01 / (0.2 + k) + py * 0.002 + v * 4)) > 0.96 ? 0.35 : 0;
      return [seaTone(clamp01(0.35 + v * 0.3 + streak + (v > 0.45 ? 0.3 : 0) - k * 0.1)), 1];
    });
    // the platform: a yellow hull riding the tide, a crane frame, a work light, the turbine arms in the water
    const px = W * 0.42;
    const py = H * 0.72;
    c.poly([[px - 160, py], [px + 160, py], [px + 140, py + 26], [px - 140, py + 26]], '#c89a2a');
    c.poly([[px - 160, py], [px + 160, py], [px + 150, py - 10], [px - 150, py - 10]], '#e8c050');
    c.rect(px - 40, py - 60, 80, 50, '#d8d4c8');
    c.rect(px - 32, py - 52, 24, 14, '#3a4a5a');
    c.line(px + 60, py - 10, px + 100, py - 120, 6, '#c8c0a8');
    c.line(px + 100, py - 120, px + 150, py - 60, 4, '#c8c0a8');
    for (const s of [-1, 1]) {
      c.line(px + s * 110, py + 20, px + s * 150, py + 60, 10, '#1a2228', 0.8);
      c.rect(px + s * 150 - 10, py + 50, 20, 24, '#2a3440', 0.7);
    }
    c.rect(px - 180, py + 20, 360, 6, '#e8ecec', 0.5); // the wake along the hull
  },
};

export const MORE_GRADES = {
  temple: { saturation: 0.72, tint: 0.14, vignette: 0.3 },
  venice: { saturation: 0.75, tint: 0.12 },
  reef: { saturation: 0.7, tint: 0.08, shadow: '#0a1a2a' },
  comet: { saturation: 0.8, tint: 0.1 },
  glacier: { saturation: 0.6, tint: 0.16 },
  mars: { saturation: 0.75, tint: 0.1, shadow: '#2a1a14' },
  drones: { saturation: 0.85, tint: 0.06, vignette: 0.3 },
  refinery: { saturation: 0.75, tint: 0.12 },
  airport: { saturation: 0.8, tint: 0.1 },
  mushroom: { saturation: 0.85, tint: 0.04, shadow: '#04100a' },
  fjord: { saturation: 0.62, tint: 0.14 },
  coffee: { saturation: 0.72, tint: 0.14 },
  eclipse: { saturation: 0.8, tint: 0.08 },
  heat: { saturation: 0.7, tint: 0.16, vignette: 0.25 },
  tidal: { saturation: 0.62, tint: 0.14 },
};
