// A fourth set of original illustrations for the offline fixture stories
// (painted by make-images.mjs): the science desk (a research ship in the
// Antarctic pack ice, tomatoes in an orbital greenhouse, a honeybee under a
// clouded sun, a Galápagos giant tortoise, footprints in a Welsh beach) and the
// business desk (a central bank, two stock markets, a jet on the assembly line,
// cocoa pods, an electric car on charge, rice terraces, solar roofs over a Lagos
// market, a rainy high street). Offline test material only: on air the channel
// shows real pictures found by the picture desk. Same rules as the other sets:
// one subject, one motivated key light, depth through haze, forms shaped by
// noise rather than bare primitives, so each reads at video-wall size.
import { blob, hex, mix, noise1, noise2, ramp } from './raster.mjs';
import { H, W, clamp01, clouds, groundShadow, haze, pickOf, reflect, smooth, sparkle } from './kit.mjs';

// ---------------------------------------------------------------- local tools

/** A standing figure seen from a distance: legs, coat, head and hair (a few pixels once pixelated). */
function figure(c, x, ground, h, { coat = '#22242c', legs = '#16181e', skin = '#9a7a64', hair = '#141212', alpha = 1, lean = 0, umbrella = null } = {}) {
  const u = h / 6.5;
  for (const side of [-1, 1]) c.poly([[x + side * u * 0.1 - u * 0.2, ground - h * 0.47], [x + side * u * 0.1 + u * 0.2, ground - h * 0.47], [x + side * u * 0.38 + u * 0.13, ground], [x + side * u * 0.38 - u * 0.13, ground]], legs, alpha);
  const top = ground - h + u * 1.1;
  c.poly([[x - u * 0.72 + lean, top + u * 0.25], [x - u * 0.45 + lean, top], [x + u * 0.45 + lean, top], [x + u * 0.72 + lean, top + u * 0.25], [x + u * 0.62, ground - h * 0.4], [x - u * 0.62, ground - h * 0.4]], coat, alpha);
  c.ellipse(x + lean * 1.2, top - u * 0.45, u * 0.4, u * 0.5, skin, alpha);
  c.ellipse(x + lean * 1.2, top - u * 0.72, u * 0.43, u * 0.27, hair, alpha);
  if (umbrella) {
    c.line(x + lean + u * 0.5, top + u * 0.6, x + lean + u * 0.2, top - u * 1.8, Math.max(1.5, u * 0.08), '#1a1a1a', alpha);
    c.poly([[x + lean - u * 1.9, top - u * 1.2], [x + lean + u * 0.2, top - u * 2.4], [x + lean + u * 2.3, top - u * 1.2], [x + lean + u * 1.2, top - u * 1.45], [x + lean + u * 0.2, top - u * 1.3], [x + lean - u * 0.9, top - u * 1.45]], umbrella, alpha);
  }
}

/** Lit windows over a facade: irregular rows, most dark. */
function windows(c, r, x0, y0, x1, y1, { w = 6, h = 8, gx = 14, gy = 16, lit = 0.35, warm = '#f2c27a', cool = '#a8c4e0', dark = null, alpha = 1 } = {}) {
  for (let y = y0 + 4; y < y1 - h; y += gy) {
    for (let x = x0 + 4; x < x1 - w; x += gx) {
      if (r() > lit) {
        if (dark) c.rect(x, y, w, h, dark, alpha * 0.8);
        continue;
      }
      c.rect(x + Math.round(r() * 2 - 1), y, w, h, r() < 0.75 ? warm : cool, alpha * (0.55 + r() * 0.45));
    }
  }
}

/** Rain: thin slanted streaks, denser and fainter far away. */
function rain(c, r, n, { slant = 0.18, len = [18, 40], colour = '#c8d4e0', alpha = 0.22 } = {}) {
  for (let i = 0; i < n; i++) {
    const x = r() * (W + 200) - 100;
    const y = r() * H;
    const l = len[0] + r() * (len[1] - len[0]);
    c.line(x, y, x + l * slant, y + l, 1.2, colour, alpha * (0.4 + r() * 0.6));
  }
}

/** A row of classical columns between y0 and y1: fluted shafts lit from one side, a capital and a base each. */
function colonnade(c, x0, x1, y0, y1, n, { stone, light = 1 } = {}) {
  const step = (x1 - x0) / n;
  const cw = step * 0.46;
  for (let i = 0; i < n; i++) {
    const cx = x0 + step * (i + 0.5);
    c.paintBox(cx - cw / 2, y0 + 14, cx + cw / 2, y1 - 10, (x) => {
      const u = (x - (cx - cw / 2)) / cw; // 0 left .. 1 right
      const round = Math.sin(u * Math.PI);
      const flute = 0.06 * Math.cos(u * Math.PI * 9);
      return [stone(clamp01((light > 0 ? 0.25 + (1 - u) * 0.55 : 0.25 + u * 0.55) * round + 0.15 + flute)), 1];
    });
    c.rect(cx - cw * 0.7, y0, cw * 1.4, 14, stone(0.75));
    c.rect(cx - cw * 0.7, y0 + 12, cw * 1.4, 3, stone(0.35));
    c.rect(cx - cw * 0.66, y1 - 10, cw * 1.32, 10, stone(0.62));
  }
}

// ---------------------------------------------------------------- scenes

export const DESK_SCENES = {
  /** A red research ship among pack ice at the Antarctic dusk, a tabular iceberg on the horizon, the low sun behind. */
  research(c, r) {
    const hz = H * 0.56;
    c.gradient(0, hz, [[0, '#1a2440'], [0.45, '#4a5070'], [0.8, '#b08a90'], [1, '#f0c49a']]);
    clouds(c, 501, { y0: H * 0.05, y1: H * 0.4, scale: 0.0018, cover: 0.18, lit: '#f6d2b4', shade: '#4a4c66', alpha: 0.7, stretch: 4 });
    c.glow(W * 0.2, hz - 4, 520, '#ffc890', 0.5);
    c.glow(W * 0.2, hz - 4, 60, '#fff2d8', 1.2, 1.5);
    // the iceberg: a flat-topped wall of ice, its sunward face warm, the far face blue
    const ice = ramp([[0, '#4a5a7a'], [0.5, '#9ab0c8'], [0.85, '#e8e4e8'], [1, '#fff6ec']]);
    const bz = noise1(502);
    const bx0 = W * 0.64;
    const bx1 = W * 0.93;
    c.poly([[bx0, hz], [bx0 + 14, hz - 46], [bx1 - 30, hz - 50], [bx1, hz - 38], [bx1 + 10, hz]], '#000', 1, (px, py) => ice(clamp01(0.62 - (px - bx0) / (bx1 - bx0) * 0.35 + bz(px * 0.05) * 0.06 + (py < hz - 44 ? 0.25 : 0))));
    // the sea under a cold sky, broken by floes; the ship's reflection added after it is painted
    const sea = noise2(503);
    const seaTone = ramp([[0, '#0c1424'], [0.5, '#24304a'], [0.85, '#6a6a80'], [1, '#e8b890']]);
    c.paintBox(0, hz, W, H, (px, py) => {
      const k = (py - hz) / (H - hz);
      const v = sea.fbm(px * 0.004 / (0.2 + k), py * 0.05 / (0.2 + k), 4);
      const sun = Math.exp(-(((px - W * 0.2) / (90 + k * 300)) ** 2)) * (1 - k) * 0.6;
      return [seaTone(clamp01(0.3 + v * 0.25 + sun + (v > 0.4 ? 0.12 : 0))), 1];
    });
    // the ship: red hull side-lit by the low sun, white superstructure, funnel, mast, the A-frame at the stern
    const sx = W * 0.47;
    const sy = hz + 22;
    const hull = ramp([[0, '#2a0a0c'], [0.45, '#7a1a1a'], [0.8, '#c03a2a'], [1, '#e8805a']]);
    c.poly([[sx - 250, sy - 36], [sx + 214, sy - 36], [sx + 262, sy - 58], [sx + 250, sy - 30], [sx + 206, sy], [sx - 236, sy]], '#000', 1, (px, py) => hull(clamp01(0.75 - (px - (sx - 250)) / 520 * 0.4 - (py - (sy - 40)) / 50 * 0.25)));
    c.rect(sx - 240, sy - 8, 446, 6, '#1a1214');
    const white = ramp([[0, '#5a5a6a'], [0.6, '#cfcad0'], [1, '#fff4e8']]);
    const deck = [[sx - 170, sy - 36, 230, 30], [sx - 140, sy - 64, 170, 28], [sx - 120, sy - 88, 110, 24]];
    for (const [x, y, w, h] of deck) {
      c.paintBox(x, y, x + w, y + h, (px) => [white(clamp01(0.85 - (px - x) / w * 0.4)), 1]);
      c.rect(x, y + h - 3, w, 3, '#3a3a46', 0.6);
      for (let wx = x + 8; wx < x + w - 10; wx += 14) c.rect(wx, y + 8, 8, 6, r() < 0.4 ? '#f6d08a' : '#2a3040');
    }
    c.rect(sx - 20, sy - 120, 30, 34, '#c03a2a');
    c.rect(sx - 20, sy - 122, 30, 6, '#1a1214');
    c.line(sx - 80, sy - 88, sx - 76, sy - 170, 3, '#d8d0cc');
    c.line(sx - 100, sy - 150, sx - 52, sy - 150, 2, '#d8d0cc');
    c.glow(sx - 76, sy - 172, 8, '#ffe0a0', 0.9);
    // the stern A-frame and a crane jib over the working deck
    c.line(sx + 120, sy - 36, sx + 150, sy - 104, 5, '#e8a03a');
    c.line(sx + 180, sy - 36, sx + 150, sy - 104, 5, '#c8862a');
    c.line(sx + 40, sy - 36, sx + 100, sy - 92, 4, '#d8d0cc');
    c.line(sx + 150, sy - 104, sx + 150, sy - 50, 1.5, '#1a1a1a');
    reflect(c, sy, H * 0.78, '#1c2438', 0.55, 504, { ripple: 5, stretch: 0.1 });
    // pack ice: irregular floes, snow-white tops lit pink, blue-grey edges, more and bigger toward the camera
    const floeTop = ramp([[0, '#7a86a0'], [0.6, '#d0d4e0'], [1, '#fff0e4']]);
    for (let i = 0; i < 46; i++) {
      const k = r();
      const fy = hz + 30 + k ** 0.7 * (H - hz - 20);
      const size = 12 + k * k * 130;
      const fx = r() * W;
      if (Math.abs(fx - sx) < 280 && fy < sy + 30) continue;
      const pts = blob(fx, fy, size * (1.4 + r()), size * 0.3, 600 + i, 0.35, 28);
      c.poly(pts.map(([x, y]) => [x, y + size * 0.12]), '#2a3448', 0.9);
      c.litPoly(pts, fx, fy, size * 1.6, size * 0.4, floeTop, { lx: -0.8, ly: -0.4, lz: 0.6, ambient: 0.45 });
    }
    sparkle(c, r, 90, 0, hz, W * 0.5, H * 0.7, '#ffe2c0', 0.5);
  },

  /** Tomato plants under magenta grow-lights in a small greenhouse aboard a space station; the Earth's limb in the window. */
  greenhouse(c, r) {
    // the module: padded wall panels, seams, a checklist, equipment with status lights, cable runs
    const wall = ramp([[0, '#0c0e14'], [0.5, '#262830'], [0.85, '#4e5058'], [1, '#7a7a80']]);
    const wz = noise2(511);
    c.paintBox(0, 0, W, H, (px, py) => {
      const cell = (Math.floor(px / 160) * 7 + Math.floor(py / 120) * 3) % 5;
      const seam = px % 160 < 3 || py % 120 < 3 ? -0.12 : 0;
      return [wall(clamp01(0.3 + cell * 0.02 + seam + wz.fbm(px * 0.012, py * 0.012, 3) * 0.06 - Math.abs(py - H * 0.45) / H * 0.25)), 1];
    });
    // a laminated checklist and a velcro strip on the panel under the window
    c.rect(W * 0.1, H * 0.66, 120, 150, '#c8c4b8');
    for (let y = H * 0.66 + 16; y < H * 0.66 + 140; y += 12) c.rect(W * 0.1 + 12, y, 70 + r() * 30, 3, '#4a4a52');
    c.rect(W * 0.1 + 130, H * 0.7, 80, 14, '#3a3a40');
    // an equipment box with status lights, left of the chamber
    c.rect(W * 0.38, H * 0.58, 130, 90, '#3a3c44');
    c.rect(W * 0.38, H * 0.58, 130, 8, '#5a5c64');
    for (let i = 0; i < 5; i++) c.glow(W * 0.38 + 18 + i * 22, H * 0.58 + 30, 6, pickOf(r, ['#4aff8a', '#4aff8a', '#ffb04a', '#4ab0ff']), 0.9, 1.2);
    // the window, upper left: black space, the blue limb of the Earth with cloud bands
    const wx = W * 0.2;
    const wy = H * 0.3;
    const R = 150;
    const cl = noise2(512);
    c.circle(wx, wy, R + 24, '#44464e');
    c.circle(wx, wy, R + 12, '#16181e');
    c.circle(wx, wy, R, '#02030a', 1, (px, py) => {
      const ex = W * 0.1;
      const ey = H * 1.9;
      const er = 1180;
      const d = Math.hypot(px - ex, py - ey);
      if (d > er + 16) return [2, 3, 10];
      if (d > er) return mix(hex('#6aa8f0'), hex('#02030a'), (d - er) / 16);
      const ocean = mix(hex('#1a4a8a'), hex('#0a2a5a'), clamp01((er - d) / 400));
      const v = cl.fbm(px * 0.01, py * 0.028, 5);
      return v > 0.08 ? mix(ocean, hex('#f4f8ff'), clamp01((v - 0.08) * 2.2)) : ocean;
    });
    c.glow(wx - 40, wy + 60, 240, '#4a8ae0', 0.22);
    for (let a = 0; a < 10; a++) c.circle(wx + Math.cos((a / 10) * Math.PI * 2) * (R + 18), wy + Math.sin((a / 10) * Math.PI * 2) * (R + 18), 5, '#80828a');
    // handrail and a cable bundle
    c.line(0, H * 0.86, W, H * 0.84, 10, '#b8a43a');
    c.line(0, H * 0.86 + 5, W, H * 0.84 + 5, 3, '#5a4a1a');
    c.line(W * 0.36, 0, W * 0.37, H, 14, '#1a1c22');
    for (let i = 0; i < 4; i++) c.line(W * 0.355 + i * 6, 0, W * 0.365 + i * 6, H, 2, pickOf(r, ['#3a5a8a', '#8a3a3a', '#5a5a5a', '#2a6a4a']));
    // the plant chamber: magenta LED light from above; a dense canopy of leaves with ripe fruit in it
    const bx = W * 0.52;
    const by = H * 0.14;
    const bw = 520;
    const bh = 470;
    c.rect(bx - 16, by - 16, bw + 32, bh + 32, '#5c5e66');
    c.rect(bx - 16, by - 16, bw + 32, 4, '#8a8c94');
    c.paintBox(bx, by, bx + bw, by + bh, (px, py) => [mix(hex('#e83a9a'), hex('#2a0c26'), clamp01((py - by) / bh) ** 0.8), 1]);
    c.rect(bx, by, bw, 30, '#ffd8f4');
    for (let lx = bx + 8; lx < bx + bw - 8; lx += 18) c.rect(lx, by + 8, 10, 12, pickOf(r, ['#ff2a8a', '#ff6ad0', '#ff4aa0', '#9a6aff']));
    c.glow(bx + bw / 2, by + 24, 460, '#ff3aa0', 0.32);
    // stems first, then three depths of serrated leaves (back ones darker), then the fruit
    const leafTone = ramp([[0, '#06120a'], [0.45, '#1e4a22'], [0.75, '#5a8a3a'], [1, '#f0b0e0']]);
    for (let p = 0; p < 4; p++) {
      const x0 = bx + 70 + p * 125;
      c.rect(x0 - 46, by + bh - 34, 92, 34, '#2e1c16');
      c.rect(x0 - 46, by + bh - 34, 92, 5, '#4a3020');
      let x = x0;
      for (let y = by + bh - 34; y > by + 80; y -= 22) {
        const nx = x + (r() - 0.5) * 14;
        c.line(x, y, nx, y - 22, 5, '#2e5a24');
        x = nx;
      }
    }
    const leafAt = (lx, ly, s, depth, seed) => {
      const a = (r() - 0.5) * 1.6;
      const pts = blob(lx, ly, 34 * s, 15 * s, seed, 0.5, 26).map(([px, py]) => [lx + (px - lx) * Math.cos(a) - (py - ly) * Math.sin(a), ly + (px - lx) * Math.sin(a) + (py - ly) * Math.cos(a)]);
      c.litPoly(pts, lx, ly, 36 * s, 18 * s, leafTone, { lx: 0, ly: -1, lz: 0.45, ambient: 0.2, jitter: () => -depth * 0.18 });
      c.line(lx - Math.cos(a) * 28 * s, ly - Math.sin(a) * 28 * s, lx + Math.cos(a) * 28 * s, ly + Math.sin(a) * 28 * s, 1.5, '#0e2a12', 0.6);
    };
    for (let depth = 2; depth >= 0; depth--) {
      for (let i = 0; i < 46; i++) {
        const lx = bx + 24 + r() * (bw - 48);
        const ly = by + 60 + r() ** 0.8 * (bh - 120);
        leafAt(lx, ly, 0.8 + r() * 0.5 - depth * 0.1, depth, 530 + depth * 100 + i);
      }
    }
    const red = ramp([[0, '#3a0606'], [0.55, '#c0281a'], [0.85, '#f0604a'], [1, '#ffd0d0']]);
    for (let k = 0; k < 9; k++) {
      const tx = bx + 50 + r() * (bw - 100);
      const ty = by + 120 + r() * (bh - 220);
      for (let j = 0; j < 3 + Math.floor(r() * 3); j++) {
        const fx = tx + (r() - 0.5) * 40;
        const fy = ty + (r() - 0.3) * 30;
        const fr = 11 + r() * 5;
        c.litPoly(blob(fx, fy, fr, fr * 0.92, 700 + k * 10 + j, 0.06, 20), fx, fy, fr, fr, red, { lx: -0.2, ly: -0.95, lz: 0.5, ambient: 0.18 });
        c.poly([[fx - 4, fy - fr + 1], [fx, fy - fr - 5], [fx + 4, fy - fr + 1]], '#2a5a24');
      }
    }
    c.rect(bx, by + bh - 6, bw, 6, '#8a8a90');
    // the magenta light spills onto the frame, the wall and the rail
    c.glow(bx + bw / 2, by + bh, 420, '#c02a80', 0.16);
    c.glow(bx - 20, by + bh * 0.5, 160, '#c02a80', 0.12);
  },

  /** A honeybee working a thistle head, close up; behind it a meadow out of focus and the sun as a bright smudge in cloud. */
  bees(c, r) {
    // background: an out-of-focus meadow under a bright, hazy sky
    c.gradient(0, H, [[0, '#b4c0c4'], [0.35, '#d6d2c0'], [0.6, '#7c8a58'], [1, '#34442a']]);
    c.glow(W * 0.8, H * 0.12, 460, '#fff6e0', 0.75);
    c.glow(W * 0.8, H * 0.12, 90, '#ffffff', 0.9, 1.5);
    for (let i = 0; i < 80; i++) {
      const x = r() * W;
      const y = H * 0.42 + r() * H * 0.58;
      const s = 16 + r() * 64;
      const tone = hex(pickOf(r, ['#8a6aa8', '#b08ac8', '#c8b04a', '#6a8a3a', '#9a7ab8', '#e8d8a8', '#5a7a3a']));
      c.paintBox(x - s, y - s, x + s, y + s, (px, py) => {
        const d = Math.hypot(px - x, py - y) / s;
        return d < 1 ? [tone, 0.26 * (1 - d * d)] : null;
      });
    }
    // the thistle, lower left of centre: stem with a leaf, spiny green bracts, a dome of purple florets
    const stem = ramp([[0, '#1a2a12'], [1, '#6a8a4a']]);
    const hx = W * 0.4;
    const hy = H * 0.66;
    c.line(hx - 30, H, hx, hy + 60, 18, stem(0.45));
    c.litPoly(blob(hx - 110, H * 0.9, 90, 18, 531, 0.5, 30), hx - 110, H * 0.9, 90, 18, ramp([[0, '#14240e'], [1, '#6a8a42']]), { lx: 0.4, ly: -0.9, lz: 0.5, ambient: 0.25 });
    const bract = ramp([[0, '#14220e'], [0.6, '#4e6e34'], [1, '#a8b86a']]);
    c.litPoly(blob(hx, hy + 40, 105, 70, 532, 0.1), hx, hy + 40, 105, 70, bract, { lx: 0.5, ly: -0.8, lz: 0.5, ambient: 0.2, jitter: (px, py) => (Math.sin(px * 0.25 + py * 0.4) > 0.6 ? -0.18 : 0) });
    for (let i = 0; i < 18; i++) {
      const a = Math.PI * (0.05 + r() * 0.9);
      c.line(hx + Math.cos(a) * 100, hy + 40 + Math.sin(a) * 50, hx + Math.cos(a) * 128, hy + 40 + Math.sin(a) * 64, 2, '#b8c07a');
    }
    const floret = ramp([[0, '#2a0a3a'], [0.5, '#7a2a9a'], [0.85, '#c46ada'], [1, '#f4d0ff']]);
    for (let i = 0; i < 520; i++) {
      const a = Math.PI * (1.02 + r() * 0.96);
      const d = 0.15 + Math.sqrt(r()) * 0.85;
      const fx = hx + Math.cos(a) * 110 * d;
      const fy = hy + 6 + Math.sin(a) * 50 * d;
      const len = 26 + r() * 22;
      const tilt = Math.cos(a) * 0.5;
      c.line(fx, fy, fx + tilt * len, fy - len, 3, floret(clamp01(0.35 + (fx - hx) / 260 + (hy - fy) / 160 + (r() - 0.5) * 0.35)));
    }
    // the bee, big, on top of the head facing left: glassy wings over a banded abdomen, a fuzzy thorax,
    // a dark head with a large compound eye and elbowed antennae, legs gripping, a pollen load on the hind leg
    const bx = hx + 20;
    const by = hy - 92;
    const fuzz = noise2(533);
    const amber = ramp([[0, '#2a1606'], [0.45, '#8a5a1a'], [0.8, '#d8a04a'], [1, '#ffe4a8']]);
    const dark = ramp([[0, '#0c0806'], [0.6, '#3a2814'], [1, '#8a6a40']]);
    // legs behind the body
    for (const [x0, x1, y1] of [[bx - 40, bx - 70, by + 92], [bx + 10, bx + 0, by + 100], [bx + 60, bx + 110, by + 96]]) {
      c.line(x0, by + 40, (x0 + x1) / 2 + 8, by + 70, 7, '#2a1c10');
      c.line((x0 + x1) / 2 + 8, by + 70, x1, y1, 5, '#1a120a');
    }
    c.litPoly(blob(bx + 96, by + 78, 26, 20, 534, 0.2), bx + 96, by + 78, 26, 20, ramp([[0, '#6a4a0a'], [1, '#ffd84a']]), { lx: 0.4, ly: -0.8, lz: 0.5, ambient: 0.3 });
    // abdomen: a tapered oval pointing back and down, amber with dark bands, furry edges
    const ax = bx + 120;
    const ay = by + 34;
    c.poly(blob(ax, ay, 112, 62, 535, 0.05).map(([x, y]) => [x, y + (x - ax) * 0.18]), '#000', 1, (px, py) => {
      const u = (px - (ax - 112)) / 224;
      const band = Math.sin(u * Math.PI * 6.5 + 0.6) > 0.55;
      const nx = (px - ax) / 112;
      const ny = (py - ay - (px - ax) * 0.18) / 62;
      const lit = clamp01(0.3 + Math.max(0, 0.4 * nx - 0.7 * ny + 0.5 * Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))) * 0.9 + fuzz(px * 0.3, py * 0.3) * 0.08);
      return band ? dark(lit) : amber(lit);
    });
    // thorax: a round, fuzzy volume
    c.paintBox(bx - 70, by - 60, bx + 40, by + 70, (px, py) => {
      const nx = (px - (bx - 14)) / 58;
      const ny = (py - (by + 6)) / 56;
      const d = Math.hypot(nx, ny);
      if (d > 1 + fuzz(px * 0.25, py * 0.25) * 0.18) return null;
      const lit = 0.2 + Math.max(0, 0.45 * nx - 0.65 * ny + 0.55 * Math.sqrt(Math.max(0, 1 - Math.min(1, d * d)))) * 0.85 + fuzz(px * 0.5, py * 0.5) * 0.22;
      return [amber(clamp01(lit)), 1];
    });
    // head: dark, with a big compound eye catching the light, a jaw, elbowed antennae
    c.litPoly(blob(bx - 92, by + 16, 34, 38, 536, 0.06), bx - 92, by + 16, 34, 38, dark, { lx: 0.5, ly: -0.7, lz: 0.5, ambient: 0.15 });
    c.litPoly(blob(bx - 96, by + 6, 18, 26, 537, 0.05), bx - 96, by + 6, 18, 26, ramp([[0, '#040404'], [0.8, '#2a2a36'], [1, '#8a8aa8']]), { lx: 0.3, ly: -0.9, lz: 0.4, ambient: 0.1 });
    c.glow(bx - 100, by - 6, 7, '#ffffff', 0.7, 1.2);
    c.line(bx - 112, by + 40, bx - 124, by + 54, 4, '#1a120a');
    for (const s of [0, 1]) {
      c.line(bx - 98 + s * 10, by - 18, bx - 116 + s * 14, by - 70, 3, '#14100a');
      c.line(bx - 116 + s * 14, by - 70, bx - 150 + s * 10, by - 84 + s * 6, 3, '#14100a');
    }
    // wings: two pairs, translucent, veined, catching the sky
    for (const [ox, oy, a, len] of [[10, -40, -0.32, 150], [44, -24, -0.12, 120]]) {
      const cx = bx + ox + len * 0.45;
      const cy = by + oy;
      const pts = blob(cx, cy, len * 0.55, 30, 538 + ox, 0.06).map(([x, y]) => [cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)]);
      c.poly(pts, '#e8f0ff', 0.28);
      c.poly(pts.slice(0, 30), '#ffffff', 0.12);
      for (let v = 0; v < 4; v++) c.line(bx + ox, by + oy + 6, pts[6 + v * 6][0], pts[6 + v * 6][1], 1.2, '#3a3a48', 0.55);
    }
    c.glow(bx + 70, by - 60, 70, '#ffffff', 0.2);
  },

  /** A Galápagos giant tortoise on dry volcanic ground among scrub and a tree cactus, the sea and a hazy island behind. */
  tortoise(c, r) {
    const hz = H * 0.4;
    c.gradient(0, hz, [[0, '#7898b6'], [0.7, '#c6d2d6'], [1, '#e6e2d6']]);
    clouds(c, 541, { y0: H * 0.02, y1: H * 0.3, scale: 0.0025, cover: 0.2, lit: '#fffaf0', shade: '#a8b4bc', alpha: 0.8 });
    c.glow(W * 0.12, H * 0.04, 520, '#fff4dc', 0.35);
    // the sea and a low island in haze
    c.rect(0, hz - 28, W, 28, '#7898aa');
    c.ridge(hz - 28, 24, 0.003, '#9aa8b2', 542, { bottom: hz - 18, octaves: 3 });
    // dry ground: red-brown lava soil, gravel, black rocks, pale tufts of dry grass
    const soil = ramp([[0, '#2a1a12'], [0.5, '#64462e'], [0.85, '#9e7a56'], [1, '#d0b088']]);
    const sz = noise2(543);
    const land = c.ridge(hz - 6, 10, 0.004, '#64462e', 544, { octaves: 2 });
    c.paintBox(0, hz - 20, W, H, (px, py) => {
      const top = (land.find(([x]) => x >= px) || land.at(-2))[1];
      if (py < top) return null;
      const k = (py - hz) / (H - hz);
      const grain = sz(px * 0.25 / (0.3 + k), py * 0.25 / (0.3 + k)) > 0.55 ? -0.12 : 0;
      return [soil(clamp01(0.55 + sz.fbm(px * 0.006 / (0.3 + k), py * 0.012 / (0.3 + k), 4) * 0.3 + grain - k * 0.12)), 1];
    });
    const grass = ramp([[0, '#5a4a2a'], [1, '#d8c890']]);
    for (let i = 0; i < 60; i++) {
      const k = r();
      const gx = r() * W;
      const gy = hz + 8 + k * (H - hz - 8);
      const gs = 6 + k * 26;
      for (let b = 0; b < 9; b++) c.line(gx, gy, gx + (r() - 0.5) * gs, gy - gs * (0.6 + r() * 0.6), 1.4 + k, grass(0.3 + r() * 0.7), 0.85);
    }
    const rock = ramp([[0, '#060608'], [0.6, '#2a2828'], [1, '#6a645e']]);
    for (let i = 0; i < 34; i++) {
      const k = r();
      const ry = hz + 12 + k * (H - hz);
      const rs = 4 + k * k * 36;
      const rx = r() * W;
      if (Math.abs(rx - W * 0.42) < 300 && ry > H * 0.55 && ry < H * 0.9) continue;
      c.litPoly(blob(rx, ry, rs * 1.3, rs * 0.7, 545 + i, 0.3, 20), rx, ry, rs * 1.3, rs * 0.7, rock, { lx: -0.7, ly: -0.6, lz: 0.5, ambient: 0.2 });
    }
    // grey, twiggy scrub in the middle distance
    const twig = ramp([[0, '#2a2622'], [1, '#9a9488']]);
    for (let i = 0; i < 14; i++) {
      const x = r() * W;
      const y = hz + 6 + r() * 50;
      const s = 22 + r() * 40;
      for (let k = 0; k < 16; k++) c.line(x, y, x + (r() - 0.5) * s * 2, y - r() * s, 1.6, twig(0.3 + r() * 0.6));
    }
    // a tree cactus (Opuntia): a reddish scaly trunk and a crown of flat oval paddles with spines
    const tx = W * 0.84;
    const bark = ramp([[0, '#2a1a12'], [1, '#9a6a4a']]);
    c.litPoly([[tx - 14, H * 0.68], [tx - 9, H * 0.3], [tx + 9, H * 0.3], [tx + 14, H * 0.68]], tx, H * 0.5, 14, 200, bark, { lx: -0.8, ly: 0, lz: 0.5, ambient: 0.2, jitter: (px, py) => (Math.sin(py * 0.35 + px * 0.2) > 0.7 ? -0.2 : 0) });
    const pad = ramp([[0, '#162412'], [0.6, '#46663a'], [1, '#a2b468']]);
    for (const [dx, dy, a, s] of [[-50, 0.28, 0.5, 1], [46, 0.24, -0.4, 1], [0, 0.17, 0.05, 1.1], [-96, 0.36, 0.9, 0.9], [88, 0.33, -0.8, 0.9], [-30, 0.22, 0.2, 0.8], [26, 0.14, -0.1, 0.8]]) {
      const px = tx + dx;
      const py = H * dy;
      const pts = blob(px, py, 34 * s, 22 * s, 546 + dx, 0.08).map(([x, y]) => [px + (x - px) * Math.cos(a) - (y - py) * Math.sin(a), py + (x - px) * Math.sin(a) + (y - py) * Math.cos(a)]);
      c.litPoly(pts, px, py, 36 * s, 26 * s, pad, { lx: -0.7, ly: -0.6, lz: 0.5, ambient: 0.2 });
      for (let k = 0; k < 6; k++) c.rect(px + (r() - 0.5) * 40 * s, py + (r() - 0.5) * 24 * s, 2, 2, '#e8e0b8', 0.8);
    }
    // the tortoise: a high domed shell of scutes with growth rings, a flared serrated rim, pillar legs, a long neck
    const ox = W * 0.42;
    const oy = H * 0.74;
    groundShadow(c, ox + 10, oy + 74, 320, 38, 0.6, '#1a100a');
    const skin = ramp([[0, '#12100c'], [0.55, '#4a4034'], [0.85, '#7e705e'], [1, '#b0a088']]);
    const scale = (px, py) => (sz(px * 0.18, py * 0.18) > 0.35 ? -0.16 : sz(px * 0.18, py * 0.18) < -0.4 ? 0.08 : 0);
    // back legs (shadowed), then the shell, then the front leg and neck over it
    for (const [lx, w] of [[150, 46], [210, 40]]) c.litPoly(blob(ox + lx, oy + 40, w * 0.62, 46, 547 + lx, 0.12), ox + lx, oy + 40, w * 0.62, 46, skin, { lx: -0.6, ly: -0.5, lz: 0.5, ambient: 0.08, jitter: scale });
    const shell = ramp([[0, '#0c0a08'], [0.4, '#34302a'], [0.75, '#6e6454'], [1, '#bcae94']]);
    const scx = ox + 30;
    const scy = oy - 30;
    const SRX = 230;
    const SRY = 150;
    const seeds = [];
    for (let row = -2; row <= 2; row++) for (let col = -2; col <= 2; col++) seeds.push([scx + col * 92 + (row % 2) * 46 + (r() - 0.5) * 18, scy + row * 64 + (r() - 0.5) * 12, r()]);
    const shellPts = blob(scx, scy, SRX, SRY, 550, 0.03).filter(([, y]) => y <= oy + 18);
    shellPts.push([scx + SRX * 0.98, oy + 18], [scx - SRX * 0.98, oy + 18]);
    c.poly(shellPts, '#000', 1, (px, py) => {
      const nx = (px - scx) / SRX;
      const ny = (py - scy) / SRY;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      let lit = 0.12 + 0.88 * Math.max(0, -nx * 0.5 - ny * 0.62 + nz * 0.6);
      let d1 = Infinity;
      let d2 = Infinity;
      let tone = 0;
      for (const [sx, sy, t] of seeds) {
        const d = Math.hypot(px - sx, (py - sy) * 1.3);
        if (d < d1) {
          d2 = d1;
          d1 = d;
          tone = t;
        } else if (d < d2) d2 = d;
      }
      const groove = d2 - d1;
      if (groove < 5) lit -= 0.32 * (1 - groove / 5);
      else lit += Math.sin(d1 * 0.32) * 0.035 + (tone - 0.5) * 0.06 - smooth(30, 60, groove) * 0.04;
      lit += sz.fbm(px * 0.04, py * 0.04, 3) * 0.06;
      // the rim: marginal scutes flare out above the legs
      if (py > oy - 6) lit = 0.32 + (Math.sin(px * 0.11) > 0.6 ? -0.15 : 0.05);
      return shell(clamp01(lit));
    });
    for (let x = scx - SRX + 10; x < scx + SRX - 10; x += 22) c.poly([[x, oy + 16], [x + 11, oy + 26], [x + 22, oy + 16]], '#1a1612');
    // front leg: a scaled pillar with blunt claws
    c.litPoly(blob(ox - 150, oy + 36, 40, 54, 551, 0.1), ox - 150, oy + 36, 40, 54, skin, { lx: -0.6, ly: -0.5, lz: 0.5, ambient: 0.15, jitter: scale });
    for (let k = 0; k < 4; k++) c.ellipse(ox - 178 + k * 16, oy + 88, 6, 4, '#c8bca0');
    c.litPoly(blob(ox - 40, oy + 46, 34, 44, 552, 0.1), ox - 40, oy + 46, 34, 44, skin, { lx: -0.6, ly: -0.5, lz: 0.5, ambient: 0.12, jitter: scale });
    // neck: thick, folded skin, reaching up and left; head with a beak-like mouth
    const neck = [[ox - 160, oy - 26], [ox - 230, oy - 86], [ox - 290, oy - 104], [ox - 310, oy - 82], [ox - 270, oy - 54], [ox - 196, oy + 20]];
    c.poly(neck, '#000', 1, (px, py) => skin(clamp01(0.42 + (oy - 60 - py) / 120 + Math.sin((px + py) * 0.22) * 0.07 + scale(px, py) * 0.6)));
    c.litPoly(blob(ox - 318, oy - 94, 38, 27, 553, 0.08), ox - 318, oy - 94, 38, 27, skin, { lx: -0.5, ly: -0.7, lz: 0.5, ambient: 0.2, jitter: scale });
    c.circle(ox - 330, oy - 102, 4, '#050404');
    c.glow(ox - 331, oy - 104, 3, '#ffffff', 0.5, 1.2);
    c.line(ox - 354, oy - 86, ox - 322, oy - 80, 2.5, '#1a1410');
  },

  /** Footprints in a layer of old mud uncovered on a Welsh beach at low tide; a headland, a broken storm sky, a shaft of sun. */
  footprints(c, r) {
    const hz = H * 0.34;
    c.gradient(0, hz, [[0, '#262c34'], [0.6, '#5a6068'], [1, '#aaa69e']]);
    clouds(c, 561, { y0: 0, y1: hz, scale: 0.0022, cover: 0.04, lit: '#dcd8d0', shade: '#2a2e36', alpha: 0.95, stretch: 2.4 });
    c.paintBox(0, 0, W, H * 0.55, (px, py) => {
      const lane = Math.abs(px - (W * 0.3 + py * 0.22)) / (46 + py * 0.16);
      return lane < 1 ? [hex('#fff4dc'), 0.15 * (1 - lane) ** 1.5] : null;
    });
    c.glow(W * 0.36, hz - 8, 280, '#fff0d0', 0.3);
    // the headland on the right: a grassy top, a face of layered rock, a scree foot that runs into the sand
    const cliff = ramp([[0, '#121418'], [0.5, '#363a40'], [0.85, '#62666a'], [1, '#949288']]);
    const cz = noise2(562);
    const cliffTop = (x) => hz - 30 - smooth(W * 0.62, W * 0.84, x) * 120 - cz(x * 0.008, 1) * 12;
    const cliffFoot = (x) => hz + 30 + smooth(W * 0.62, W, x) * 40 + cz(x * 0.02, 5) * 6;
    c.paintBox(W * 0.58, hz - 180, W, hz + 90, (px, py) => {
      const top = cliffTop(px);
      if (py < top || py > cliffFoot(px)) return null;
      if (py < top + 9 + cz(px * 0.05, 2) * 4) return [mix(hex('#2a3a22'), hex('#5a6a3a'), clamp01(0.5 + cz(px * 0.05, py * 0.1))), 1];
      const strata = Math.sin(py * 0.16 + cz(px * 0.006, py * 0.004) * 3) * 0.1;
      const scree = smooth(cliffFoot(px) - 26, cliffFoot(px), py);
      return [cliff(clamp01(0.48 + strata + cz.fbm(px * 0.02, py * 0.02, 3) * 0.16 - scree * 0.12 + (cz(px * 0.2, py * 0.2) > 0.5 ? scree * 0.2 : 0))), 1];
    });
    // the sea: a band of grey water with soft surf lines
    const seaTone = ramp([[0, '#1a2026'], [0.6, '#4a5258'], [1, '#dcdcd4']]);
    const sz = noise2(564);
    c.paintBox(0, hz, W * 0.66, hz + 44, (px, py) => {
      const k = (py - hz) / 44;
      const foam = smooth(0.5, 0.8, sz.fbm(px * 0.004, py * 0.09, 4) + Math.sin(py * 0.4) * 0.25) * (0.4 + k * 0.6);
      const sun = Math.exp(-(((px - W * 0.38) / 160) ** 2)) * 0.3;
      return [seaTone(clamp01(0.38 + sz.fbm(px * 0.01, py * 0.05, 3) * 0.15 + foam * 0.5 + sun)), 1 - smooth(W * 0.6, W * 0.66, px)];
    });
    // wet sand reflecting the sky, then the peat shelf: grey-brown, glistening, crumbling at its edge
    const sand = ramp([[0, '#3a3530'], [0.6, '#8a8070'], [1, '#dcd4c4']]);
    c.paintBox(0, hz + 36, W, H, (px, py) => {
      if (px > W * 0.58 && py < cliffFoot(px)) return null;
      const k = (py - hz - 36) / (H - hz - 36);
      const sheen = Math.exp(-(((px - W * 0.36) / 240) ** 2)) * (1 - k) * 0.45;
      return [sand(clamp01(0.5 + sz.fbm(px * 0.006, py * 0.03, 3) * 0.16 + sheen - k * 0.1)), smooth(hz + 36, hz + 48, py)];
    });
    const peat = ramp([[0, '#14100c'], [0.45, '#3a3028'], [0.8, '#685e52'], [1, '#b4b2aa']]);
    const top = (x) => H * 0.5 + Math.sin(x * 0.004) * 14 + sz(x * 0.012, 3) * 10;
    c.paintBox(0, H * 0.44, W, H, (px, py) => {
      const t = top(px);
      if (py < t) return null;
      const k = (py - t) / (H - t);
      const sheen = smooth(0.2, 0.55, sz.fbm(px * 0.0025, py * 0.012, 3)) * (0.5 - k * 0.3);
      const edge = py - t < 4 ? 0.3 : py - t < 9 ? -0.15 : 0;
      return [peat(clamp01(0.42 + sz.fbm(px * 0.015, py * 0.04, 3) * 0.14 + sheen + edge)), 1];
    });
    // the footprints, a trail leading away: each a hollow with a sunlit far rim, a shadowed inner wall,
    // the heel holding a little water that mirrors the sky, five toe dents
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      const persp = (1 - t * 0.78) ** 1.1;
      const fx = W * (0.34 + t * 0.12) + (i % 2 ? 58 : -58) * persp;
      const fy = H * (0.98 - t * 0.44);
      const a = (i % 2 ? 0.12 : -0.12) - 0.05;
      const rx = 54 * persp;
      const ry = rx * (0.45 + 0.4 * persp);
      const turn = ([x, y]) => [fx + (x - fx) * Math.cos(a) - (y - fy) * Math.sin(a), fy + (x - fx) * Math.sin(a) + (y - fy) * Math.cos(a)];
      const outline = blob(fx, fy, rx, ry * 2, 565 + i, 0.06, 30).map(([x, y]) => [x + (y < fy ? (fy - y) * 0.1 : 0) * (i % 2 ? 1 : -1), y]).map(turn);
      c.poly(outline.map(([x, y]) => [x, y - 5 * persp]), '#e0d8c6', 0.85); // the far rim, catching the light
      c.poly(outline, '#241c16');
      c.poly(outline.map(([x, y]) => [fx + (x - fx) * 0.84, fy + (y - fy) * 0.84 + 3 * persp]), '#3c322a');
      c.poly(blob(fx, fy + ry * 0.9, rx * 0.62, ry * 0.75, 575 + i, 0.1, 18).map(turn), '#9aa2ac', 0.9);
      c.poly(blob(fx - rx * 0.1, fy + ry * 0.75, rx * 0.22, ry * 0.18, 585 + i, 0.1, 12).map(turn), '#aab0b6', 0.5);
      for (let k = 0; k < 5; k++) {
        const [tx, ty] = turn([fx - rx * 0.72 + k * rx * 0.36 + (i % 2 ? rx * 0.15 : -rx * 0.15), fy - ry * 2.15 + Math.abs(k - 1.2) * ry * 0.16]);
        c.ellipse(tx, ty - 2 * persp, rx * (k === 0 ? 0.22 : 0.15), ry * 0.22, '#cfc6b4', 0.5);
        c.ellipse(tx, ty, rx * (k === 0 ? 0.22 : 0.15), ry * 0.22, '#2a2018');
      }
    }
    // two researchers by the layer further along, one kneeling with a ruler, one standing with a notebook
    figure(c, W * 0.76, H * 0.56, 96, { coat: '#d0702a', legs: '#20222a' });
    figure(c, W * 0.81, H * 0.565, 62, { coat: '#2a4a6a', legs: '#20222a', lean: 10 });
    c.line(W * 0.83, H * 0.57, W * 0.87, H * 0.56, 3, '#f0e8d8');
  },

  /** A central bank at dusk: a stone portico of columns, steps, a single flag, lamps coming on, a few people crossing. */
  bank(c, r) {
    c.gradient(0, H * 0.62, [[0, '#1e2840'], [0.6, '#5a6684'], [1, '#c09a88']]);
    clouds(c, 601, { y0: 0, y1: H * 0.35, scale: 0.002, cover: 0.2, lit: '#e8c0a8', shade: '#3a4260', alpha: 0.7, stretch: 3 });
    const stone = ramp([[0, '#2a2a30'], [0.4, '#6a6866'], [0.8, '#b0a898'], [1, '#e8dcc4']]);
    const sz = noise2(602);
    const x0 = W * 0.12;
    const x1 = W * 0.88;
    const roof = H * 0.2;
    const base = H * 0.72;
    // pediment and entablature
    c.poly([[x0 - 20, roof + 60], [W * 0.5, roof - 40], [x1 + 20, roof + 60]], '#000', 1, (px, py) => stone(clamp01(0.55 + (W * 0.5 - px) / W * 0.3 + sz(px * 0.03, py * 0.03) * 0.05)));
    c.poly([[x0 + 40, roof + 50], [W * 0.5, roof - 14], [x1 - 40, roof + 50]], '#000', 1, (px, py) => stone(clamp01(0.32 + sz(px * 0.03, py * 0.03) * 0.05)));
    c.rect(x0 - 30, roof + 60, x1 - x0 + 60, 50, stone(0.62));
    c.rect(x0 - 30, roof + 104, x1 - x0 + 60, 6, stone(0.3));
    for (let x = x0 - 24; x < x1 + 24; x += 18) c.rect(x, roof + 62, 8, 8, stone(0.4));
    // the dark interior behind the columns, one tall lit window
    c.rect(x0, roof + 110, x1 - x0, base - roof - 110, '#16161c');
    windows(c, r, x0 + 20, roof + 140, x1 - 20, base - 40, { w: 26, h: 60, gx: 70, gy: 100, lit: 0.12, warm: '#d8a860', dark: '#22222a' });
    colonnade(c, x0, x1, roof + 110, base, 8, { stone, light: 1 });
    // steps
    for (let k = 0; k < 6; k++) c.rect(x0 - 40 - k * 18, base + k * 14, x1 - x0 + 80 + k * 36, 14, stone(0.62 - k * 0.04 + (k % 2 ? 0.04 : 0)));
    c.rect(0, base + 84, W, H - base - 84, '#2a2a30');
    // the flag on the roof, and street lamps with warm pools
    c.line(W * 0.5, roof - 40, W * 0.5, roof - 150, 3, '#c8c4bc');
    c.poly([[W * 0.5, roof - 150], [W * 0.5 + 70, roof - 142], [W * 0.5 + 66, roof - 110], [W * 0.5, roof - 116]], '#7a2a2a');
    for (const lx of [W * 0.05, W * 0.95]) {
      c.line(lx, H, lx, H * 0.48, 6, '#1a1a1e');
      c.glow(lx, H * 0.47, 90, '#ffc878', 0.5);
      c.circle(lx, H * 0.47, 9, '#fff0c8');
    }
    for (const [fx, h, coat] of [[W * 0.3, 70, '#2a2a34'], [W * 0.33, 66, '#5a3a2a'], [W * 0.66, 74, '#1e2430']]) figure(c, fx, H * 0.96, h, { coat });
  },

  /** A stock exchange's classical facade on a narrow street at dusk, a giant flag, yellow cabs streaking past. */
  wallst(c, r) {
    c.gradient(0, H, [[0, '#121a2a'], [0.5, '#2a3448'], [1, '#141820']]);
    const stone = ramp([[0, '#1e1e24'], [0.45, '#5e5a58'], [0.85, '#a89a86'], [1, '#e0d0b4']]);
    const sz = noise2(611);
    // towers on both sides, windows lit
    for (const [x, w, top] of [[0, W * 0.2, -40], [W * 0.82, W * 0.18, -20]]) {
      c.paintBox(x, top, x + w, H, (px, py) => [mix(hex('#20242e'), hex('#3a404c'), sz(px * 0.01, py * 0.01) * 0.5 + 0.3), 1]);
      windows(c, r, x, top, x + w, H * 0.8, { w: 10, h: 14, gx: 22, gy: 26, lit: 0.45 });
    }
    // the exchange: pediment and six columns, floodlit warm from below
    const x0 = W * 0.24;
    const x1 = W * 0.78;
    const top = H * 0.12;
    const base = H * 0.68;
    c.poly([[x0 - 20, top + 60], [W * 0.51, top - 20], [x1 + 20, top + 60]], '#000', 1, (px, py) => stone(clamp01(0.5 + (py - top) / 300 + sz(px * 0.03, py * 0.03) * 0.05)));
    c.rect(x0 - 26, top + 60, x1 - x0 + 52, 40, stone(0.6));
    c.rect(x0, top + 100, x1 - x0, base - top - 100, '#141418');
    // the flag hung between the columns: horizontal stripes and a dark canton (no emblem)
    const fx0 = x0 + 30;
    const fx1 = x1 - 30;
    const fz = noise1(612);
    c.paintBox(fx0, top + 110, fx1, base - 60, (px, py) => {
      const wave = fz(px * 0.01) * 6;
      const stripe = Math.floor((py + wave - top - 110) / 22) % 2 === 0;
      const canton = px < fx0 + (fx1 - fx0) * 0.38 && py + wave < top + 110 + 22 * 7;
      const shade = 0.75 + Math.sin(px * 0.03 + fz(px * 0.004) * 2) * 0.18;
      const colour = canton ? hex('#1a2a5a') : stripe ? hex('#9a2a2a') : hex('#e8e0d4');
      return [mix(hex('#000000'), colour, shade), 1];
    });
    colonnade(c, x0, x1, top + 100, base, 6, { stone, light: -1 });
    c.glow(W * 0.5, base, 420, '#ffc070', 0.25);
    // the street: wet asphalt, cabs as streaks of yellow and red light, a crowd silhouette on the steps
    c.rect(0, base, W, H - base, '#16181e');
    for (let k = 0; k < 5; k++) c.rect(x0 - 40 - k * 16, base + k * 10, x1 - x0 + 80 + k * 32, 10, stone(0.45 - k * 0.05));
    for (let i = 0; i < 6; i++) {
      const y = H * 0.86 + r() * H * 0.08;
      const x = r() * W;
      const len = 120 + r() * 220;
      c.rect(x, y, len, 10, '#e8b42a', 0.5);
      c.rect(x, y - 6, len, 4, '#f8e8a0', 0.25);
      c.glow(x + len, y + 4, 26, '#ff4a2a', 0.5);
    }
    for (let i = 0; i < 14; i++) figure(c, x0 + r() * (x1 - x0), base + 40 + r() * 20, 44 + r() * 10, { coat: pickOf(r, ['#14161c', '#2a2a34', '#3a2a24']), alpha: 0.9 });
  },

  /** Night in Tokyo's financial district: a wall-sized share board of green and red figures over a crossing, umbrellas. */
  tokyo(c, r) {
    c.gradient(0, H, [[0, '#06080e'], [0.6, '#141826'], [1, '#0a0c12']]);
    const sz = noise2(621);
    // buildings, a forest of windows
    for (let x = -20; x < W; ) {
      const w = 90 + r() * 140;
      const top = H * (0.02 + r() * 0.2);
      c.paintBox(x, top, x + w, H * 0.72, (px, py) => [mix(hex('#141824'), hex('#24283a'), 0.3 + sz(px * 0.02, py * 0.02) * 0.3), 1]);
      windows(c, r, x, top, x + w, H * 0.7, { w: 8, h: 10, gx: 16, gy: 18, lit: 0.4, warm: '#e8d8a8', cool: '#a8c8e8' });
      x += w + 6;
    }
    // the share board: dark panel, rows of figures as short glowing bars, green up and red down, a header strip
    const bx = W * 0.16;
    const by = H * 0.12;
    const bw = W * 0.68;
    const bh = H * 0.44;
    c.rect(bx - 10, by - 10, bw + 20, bh + 20, '#2a2c34');
    c.rect(bx, by, bw, bh, '#04060a');
    c.rect(bx, by, bw, 26, '#1a2a4a');
    for (let x = bx + 14; x < bx + bw - 60; x += 56) c.rect(x, by + 9, 36, 8, '#c8d8f0', 0.8);
    for (let row = 0; row < 9; row++) {
      const y = by + 40 + row * ((bh - 50) / 9);
      for (let col = 0; col < 4; col++) {
        const x = bx + 20 + col * (bw / 4);
        const up = r() < 0.72;
        const hue = up ? '#3aff7a' : '#ff4a4a';
        c.rect(x, y, 70, 12, '#a8b8c8', 0.7);
        c.rect(x + 86, y, 54 + r() * 30, 12, hue, 0.9);
        c.poly(up ? [[x + 160, y + 12], [x + 168, y], [x + 176, y + 12]] : [[x + 160, y], [x + 168, y + 12], [x + 176, y]], hue);
      }
    }
    c.glow(bx + bw / 2, by + bh / 2, 520, '#3aff7a', 0.12);
    // a line chart climbing to a high along the bottom of the board
    let px = bx + 20;
    let py = by + bh - 20;
    while (px < bx + bw - 20) {
      const nx = px + 12;
      const ny = Math.max(by + bh - 80, Math.min(by + bh - 8, py - 1.2 + (r() - 0.45) * 8));
      c.line(px, py, nx, ny, 3, '#3aff7a');
      px = nx;
      py = ny;
    }
    // the crossing: wet street, reflections of the board, pedestrians with umbrellas
    const street = H * 0.72;
    c.rect(0, street, W, H - street, '#0e1016');
    reflect(c, street, H, '#0a0c12', 0.55, 622, { ripple: 4, stretch: 0.12 });
    for (let k = 0; k < 12; k++) c.rect(W * 0.08 + k * 96, H * 0.84, 60, 10, '#c8ccd0', 0.35);
    for (let i = 0; i < 16; i++) {
      const fx = r() * W;
      const fy = street + 40 + r() * (H - street - 50);
      figure(c, fx, fy, 50 + (fy - street) * 0.4, { coat: pickOf(r, ['#0a0a10', '#1a1a24', '#2a2030']), alpha: 0.95, umbrella: pickOf(r, ['#0e0e14', '#1a1a22', '#e8e4dc', '#2a2a3a']) });
    }
    rain(c, r, 500, { colour: '#a8c0d8', alpha: 0.18 });
  },

  /** A new airliner on the final assembly line: a long hangar, work lights, scaffolds at the engines, a few engineers. */
  jets(c, r) {
    // the hangar: a ribbed roof vanishing to the far doors, cool light through roof panels
    const vx = W * 0.5;
    const vy = H * 0.42;
    c.gradient(0, H, [[0, '#1a1e26'], [0.45, '#3a4250'], [1, '#22262e']]);
    const steel = ramp([[0, '#14161c'], [0.6, '#4a5260'], [1, '#9aa4b0']]);
    for (let k = 0; k < 14; k++) {
      const t = k / 14;
      const y = vy - (1 - t) ** 1.6 * vy * 1.1;
      c.line(0, y + (vy - y) * 0.2, W, y + (vy - y) * 0.2, 3 + (1 - t) * 6, steel(0.3 + t * 0.3));
      c.glow(vx, y, 260 * (1 - t) + 40, '#d8e4f0', 0.08);
    }
    // the far doors stand open on a pale overcast day: a soft bright opening, not a box
    c.paintBox(vx - 300, vy - 90, vx + 300, vy + 90, (px, py) => {
      const d = Math.max(Math.abs(px - vx) / 300, Math.abs(py - vy) / 90);
      return d < 1 ? [hex('#dce6ec'), 0.85 * smooth(1, 0.7, d)] : null;
    });
    for (let k = -4; k <= 4; k++) c.line(vx + k * 70, vy - 90, vx + k * 70, vy + 90, 3, '#8a96a2', 0.5);
    // the floor: polished concrete with painted lines, reflecting the plane
    const floor = H * 0.7;
    c.paintBox(0, floor, W, H, (px, py) => [mix(hex('#3a3e46'), hex('#5a5e66'), 0.4 + Math.sin((px - vx) / (py - vy + 1) * 6) * 0.04), 1]);
    for (const s of [-1, 1]) c.line(vx + s * 60, floor, vx + s * 900, H, 6, '#d8b83a', 0.6);
    // the airliner, three-quarter view: white fuselage, swept wings, the tail fin, engines under the wings
    const body = ramp([[0, '#5a626e'], [0.55, '#c8ccd2'], [0.85, '#eef0f2'], [1, '#ffffff']]);
    const fy = H * 0.5;
    c.poly([[W * 0.12, fy + 40], [W * 0.2, fy - 8], [W * 0.76, fy - 22], [W * 0.92, fy - 30], [W * 0.95, fy - 10], [W * 0.78, fy + 40], [W * 0.2, fy + 64]], '#000', 1, (px, py) => {
      // a cylinder: the top catches the roof lights, the belly falls into shadow
      const topY = fy - 8 - (px - W * 0.2) * 0.03;
      const botY = fy + 64 - (px - W * 0.2) * 0.05;
      const u = clamp01((py - topY) / Math.max(1, botY - topY));
      return body(clamp01(0.95 - u * 0.75 + Math.sin(u * Math.PI) * 0.1));
    });
    c.poly([[W * 0.12, fy + 40], [W * 0.2, fy - 8], [W * 0.18, fy + 30]], '#2a3038'); // nose shadow
    c.poly([[W * 0.15, fy + 18], [W * 0.18, fy + 4], [W * 0.2, fy + 6], [W * 0.17, fy + 20]], '#1a2028'); // cockpit windows
    for (let x = W * 0.24; x < W * 0.76; x += 18) c.rect(x, fy + 4 - (x - W * 0.2) * 0.03, 6, 7, '#2a3a4a');
    c.poly([[W * 0.8, fy - 24], [W * 0.88, fy - 190], [W * 0.95, fy - 190], [W * 0.92, fy - 30]], '#000', 1, (px, py) => body(clamp01(0.6 + (px - W * 0.8) / 400)));
    c.poly([[W * 0.42, fy + 30], [W * 0.66, fy + 34], [W * 0.98, fy + 120], [W * 0.92, fy + 130]], '#000', 1, (px, py) => body(clamp01(0.5 + (py - fy) / 300)));
    c.poly([[W * 0.42, fy + 20], [W * 0.6, fy + 22], [W * 0.5, fy - 70], [W * 0.46, fy - 72]], body(0.45));
    // engines with a scaffold and a work light, engineers at their feet
    for (const [ex, ey, s] of [[W * 0.58, fy + 96, 1], [W * 0.48, fy + 60, 0.7]]) {
      c.litPoly(blob(ex, ey, 70 * s, 42 * s, 631 + s * 10, 0.03), ex, ey, 70 * s, 42 * s, body, { lx: -0.5, ly: -0.7, lz: 0.5, ambient: 0.2 });
      c.ellipse(ex - 56 * s, ey, 14 * s, 36 * s, '#14181e');
    }
    c.rect(W * 0.52, fy + 140, 140, 8, '#e8b42a');
    for (let k = 0; k < 4; k++) c.line(W * 0.52 + k * 46, fy + 148, W * 0.52 + k * 46, floor + 50, 4, '#c8961a');
    c.glow(W * 0.66, fy + 120, 140, '#fff4d8', 0.4);
    for (const [px, h, coat] of [[W * 0.5, 84, '#e8902a'], [W * 0.56, 80, '#2a4a7a'], [W * 0.7, 86, '#e8902a']]) figure(c, px, floor + 70, h, { coat, legs: '#2a2e36' });
    reflect(c, floor, H, '#3a3e46', 0.7, 632, { ripple: 2 });
  },

  /** Ripe cocoa pods hanging from a trunk in the shade of a plantation, sunlight breaking through the canopy. */
  cocoa(c, r) {
    c.gradient(0, H, [[0, '#2a3a1e'], [0.5, '#1a2614'], [1, '#0e140a']]);
    // the canopy: layers of out-of-focus leaves with shafts of light
    const leaf = ramp([[0, '#0a140a'], [0.5, '#2a4a1e'], [0.85, '#6a8a3a'], [1, '#c8d878']]);
    for (let i = 0; i < 120; i++) {
      const x = r() * W;
      const y = r() * H;
      const s = 30 + r() * 90;
      c.litPoly(blob(x, y, s, s * 0.5, 640 + i, 0.4, 20), x, y, s, s * 0.5, leaf, { lx: 0.4, ly: -0.8, lz: 0.4, ambient: 0.1, a: 0.5, jitter: () => -0.25 });
    }
    c.paintBox(0, 0, W, H, (px, py) => {
      const lane = Math.abs(px - (W * 0.7 - py * 0.35)) / 50;
      return lane < 1 ? [hex('#fff4c8'), 0.12 * (1 - lane)] : null;
    });
    // the trunk: grey-brown bark with lichen, lit from the right
    const bark = ramp([[0, '#14100c'], [0.5, '#4a3e32'], [0.85, '#8a7a66'], [1, '#c8b8a0']]);
    const bz = noise2(641);
    c.paintBox(W * 0.4, 0, W * 0.6, H, (px, py) => {
      const w = 90 + Math.sin(py * 0.004) * 10;
      const cx = W * 0.5 + Math.sin(py * 0.003) * 20;
      const u = (px - cx) / w;
      if (Math.abs(u) > 1) return null;
      const lichen = bz(px * 0.04, py * 0.02) > 0.45 ? 0.2 : 0;
      return [bark(clamp01(0.35 + u * 0.35 + bz.fbm(px * 0.05, py * 0.01, 3) * 0.25 + lichen)), 1];
    });
    // pods: ridged rugby-ball shapes, yellow-orange ripe and green unripe, on short stalks from the trunk
    const ripe = ramp([[0, '#3a1a06'], [0.5, '#a85a12'], [0.85, '#e8a83a'], [1, '#fff0a0']]);
    const green = ramp([[0, '#14240a'], [0.6, '#5a8a2a'], [1, '#c8e078']]);
    for (const [px, py, a, tone, s] of [[W * 0.42, H * 0.4, 0.3, ripe, 1.1], [W * 0.58, H * 0.32, -0.25, ripe, 1], [W * 0.56, H * 0.62, -0.1, green, 0.95], [W * 0.43, H * 0.74, 0.2, ripe, 1.05], [W * 0.6, H * 0.84, -0.3, green, 0.8]]) {
      const pts = blob(px, py, 46 * s, 92 * s, 642 + Math.floor(px), 0.04).map(([x, y]) => [px + (x - px) * Math.cos(a) - (y - py) * Math.sin(a), py + (x - px) * Math.sin(a) + (y - py) * Math.cos(a)]);
      c.litPoly(pts, px, py, 50 * s, 96 * s, tone, { lx: 0.6, ly: -0.6, lz: 0.5, ambient: 0.15, jitter: (x, y) => (Math.sin(((x - px) * Math.cos(a) + (y - py) * Math.sin(a)) * 0.22) > 0.6 ? -0.18 : 0) });
      c.line(px - Math.sin(a) * 90 * s, py - Math.cos(a) * 92 * s, W * 0.5 + (px < W * 0.5 ? -60 : 60), py - 110 * s, 6, '#3a2a1a');
    }
    // fallen leaves and a split pod on the ground, beans showing
    c.paintBox(0, H * 0.9, W, H, (px, py) => [mix(hex('#2a1e12'), hex('#5a4228'), clamp01(0.5 + Math.sin(px * 0.05) * 0.2)), 1]);
    c.litPoly(blob(W * 0.26, H * 0.93, 50, 22, 643, 0.1), W * 0.26, H * 0.93, 50, 22, ripe, { lx: 0.6, ly: -0.6, lz: 0.5, ambient: 0.2 });
    for (let k = 0; k < 7; k++) c.ellipse(W * 0.26 - 30 + k * 10, H * 0.93 - 4 + (k % 2) * 6, 6, 4, '#e8dcc8');
  },

  /** An electric car charging at a kerbside post at night; cyan light on wet paving, a quiet residential street. */
  evcharge(c, r) {
    c.gradient(0, H, [[0, '#080a12'], [0.55, '#141a26'], [1, '#0a0c10']]);
    const sz = noise2(651);
    // terraced houses behind, a few windows lit, a street lamp
    for (let x = -20; x < W; ) {
      const w = 140 + r() * 80;
      const top = H * (0.2 + r() * 0.06);
      c.paintBox(x, top, x + w, H * 0.6, (px, py) => [mix(hex('#1a1c24'), hex('#2e2a2a'), 0.4 + sz(px * 0.02, py * 0.02) * 0.3), 1]);
      c.poly([[x - 6, top], [x + w / 2, top - 50], [x + w + 6, top]], '#14141a');
      windows(c, r, x + 10, top + 10, x + w - 10, H * 0.56, { w: 22, h: 30, gx: 46, gy: 70, lit: 0.3, warm: '#e8b870', dark: '#0e0e14' });
      x += w;
    }
    c.line(W * 0.12, H * 0.9, W * 0.12, H * 0.22, 6, '#1a1a1e');
    c.glow(W * 0.12, H * 0.21, 140, '#ffb860', 0.35);
    // pavement and road, wet
    const kerb = H * 0.66;
    c.rect(0, H * 0.6, W, kerb - H * 0.6, '#2a2c32');
    c.rect(0, kerb, W, H - kerb, '#121418');
    // the charging post: a slim column with a cyan ring light and a cable to the car
    const cx = W * 0.72;
    c.rect(cx - 16, H * 0.36, 32, kerb - H * 0.36, '#c8ccd0');
    c.rect(cx - 16, H * 0.36, 8, kerb - H * 0.36, '#e8ecf0');
    c.rect(cx - 12, H * 0.42, 24, 30, '#14161a');
    c.glow(cx, H * 0.45, 70, '#3ae8ff', 0.7);
    c.rect(cx - 10, H * 0.44, 20, 4, '#9af8ff');
    // the car: a low, smooth hatchback, paint catching the cyan and the lamp
    const paint = ramp([[0, '#14181e'], [0.4, '#4a5664'], [0.75, '#9aa8b6'], [1, '#e8f6ff']]);
    c.glow(W * 0.42, H * 0.5, 420, '#ffd8a0', 0.12);
    const ky = H * 0.78;
    const body = [[W * 0.14, ky + 10], [W * 0.18, ky - 50], [W * 0.3, ky - 70], [W * 0.38, ky - 120], [W * 0.56, ky - 124], [W * 0.66, ky - 74], [W * 0.7, ky - 50], [W * 0.7, ky + 10]];
    c.poly(body, '#000', 1, (px, py) => paint(clamp01(0.3 + (ky - 30 - py) / 130 + Math.exp(-(((px - cx) / 140) ** 2)) * 0.35 + (py > ky - 46 && py < ky - 40 ? 0.3 : 0))));
    c.poly([[W * 0.36, ky - 112], [W * 0.4, ky - 116], [W * 0.54, ky - 118], [W * 0.62, ky - 76], [W * 0.33, ky - 72]], '#0a1018');
    c.line(W * 0.47, ky - 118, W * 0.47, ky - 72, 4, '#1a2430');
    for (const wx of [W * 0.25, W * 0.6]) {
      c.circle(wx, ky + 10, 40, '#08080a');
      c.circle(wx, ky + 10, 24, '#3a3e46');
      c.circle(wx, ky + 10, 8, '#8a8e96');
    }
    c.rect(W * 0.66, ky - 40, 22, 10, '#3ae8ff', 0.8);
    c.line(cx, H * 0.47, W * 0.68, ky - 34, 4, '#1a1a1e');
    reflect(c, kerb + 70, H, '#0e1014', 0.5, 652, { ripple: 3, stretch: 0.15 });
    c.glow(cx, kerb + 90, 160, '#3ae8ff', 0.12);
  },

  /** Rice terraces at harvest in the hills of Southeast Asia: golden steps of grain, workers in conical hats, morning mist. */
  rice(c, r) {
    c.gradient(0, H * 0.4, [[0, '#9ab0c0'], [0.7, '#e0dccc'], [1, '#f0e4c4']]);
    c.glow(W * 0.78, H * 0.1, 420, '#fff2d0', 0.45);
    c.ridge(H * 0.26, 50, 0.0022, '#8a9aa4', 661, { octaves: 4 });
    haze(c, H * 0.1, H * 0.34, '#e8e4d8', 0.1, 0.5);
    c.ridge(H * 0.34, 40, 0.003, '#5a7058', 662, { octaves: 4 });
    haze(c, H * 0.28, H * 0.4, '#e8e4d8', 0.05, 0.4);
    // the terraces: curved bands, each a step of golden rice with a darker earth wall below it
    const gold = ramp([[0, '#4a3a12'], [0.5, '#a8862a'], [0.85, '#e0c060'], [1, '#fff0a0']]);
    const green = ramp([[0, '#2a3a12'], [0.6, '#6a8a2a'], [1, '#b8c860']]);
    const tz = noise2(663);
    c.paintBox(0, H * 0.36, W, H, (px, py) => {
      const k = (py - H * 0.36) / (H * 0.64);
      const band = (py + Math.sin(px * 0.004 + k * 2) * (40 + k * 60) + tz(px * 0.003, 1) * 30) / (14 + k * 46);
      const f = band - Math.floor(band);
      const ripe = (Math.floor(band) * 7) % 5 !== 0;
      if (f > 0.84) return [mix(hex('#3a2a18'), hex('#6a5034'), tz(px * 0.05, py * 0.05) * 0.5 + 0.5), 1];
      const tone = (ripe ? gold : green)(clamp01(0.45 + (0.84 - f) * 0.4 + tz.fbm(px * 0.02 / (0.3 + k), py * 0.04, 3) * 0.25 - (1 - k) * 0.12));
      return [tone, 1];
    });
    haze(c, H * 0.36, H * 0.55, '#f0e8d4', 0.35, 0);
    // harvesters in conical hats, bundles of cut rice beside them
    for (const [fx, fy, h] of [[W * 0.3, H * 0.78, 110], [W * 0.38, H * 0.8, 104], [W * 0.62, H * 0.66, 70], [W * 0.68, H * 0.65, 64]]) {
      figure(c, fx, fy, h, { coat: pickOf(r, ['#3a4a6a', '#5a3a2a', '#e8e0d0']), lean: 6 });
      c.poly([[fx - h * 0.2, fy - h * 0.86], [fx + 4, fy - h * 1.02], [fx + h * 0.22, fy - h * 0.86]], '#e8d8a8');
      c.ellipse(fx + h * 0.3, fy - 4, h * 0.14, h * 0.08, '#c8a84a');
    }
  },

  /** Midday over a Lagos market: rusty roofs fitted with solar panels, and in front a fruit stall under a big umbrella. */
  lagos(c, r) {
    c.gradient(0, H * 0.4, [[0, '#7aa0c4'], [0.8, '#d6dad2'], [1, '#eee2ca']]);
    c.glow(W * 0.6, 0, 560, '#fffaf0', 0.5);
    const sz = noise2(671);
    // the city behind in haze: concrete blocks of uneven heights, water tanks, a mast
    for (let x = -20; x < W; ) {
      const w = 90 + r() * 140;
      const top = H * (0.12 + r() * 0.14);
      const wall = hex(pickOf(r, ['#b8aa94', '#c8b8a0', '#a89c8c', '#d4c4a8']));
      c.paintBox(x, top, x + w, H * 0.42, (px, py) => [mix(wall, hex('#d8dcd8'), 0.35 + sz(px * 0.02, py * 0.02) * 0.1), 1]);
      for (let wy = top + 12; wy < H * 0.4; wy += 24) for (let wx = x + 8; wx < x + w - 14; wx += 26) c.rect(wx, wy, 12, 12, '#6a6260', 0.5);
      if (r() < 0.5) c.ellipse(x + w * 0.7, top - 10, 16, 12, '#2a3a5a', 0.7);
      x += w + 4 + r() * 10;
    }
    // the market roofs: rows of corrugated iron, rust and patches, solar panels angled to the sun
    const rust = ramp([[0, '#3a1e10'], [0.5, '#8a4a24'], [0.8, '#b87a4a'], [1, '#d8a878']]);
    const panel = ramp([[0, '#0a1424'], [0.6, '#1e3456'], [1, '#6a8ab8']]);
    for (let k = 0; k < 3; k++) {
      const y = H * (0.42 + k * 0.08);
      const drop = 26 + k * 10;
      c.paintBox(0, y, W, y + drop + 8, (px, py) => {
        const edge = y + Math.sin(px * 0.01 + k) * 3 + sz(px * 0.01, k) * 5;
        if (py < edge) return null;
        const groove = Math.sin(px * (0.35 + k * 0.1)) * 0.1;
        const patch = sz(px * 0.006, py * 0.02 + k * 3) > 0.35 ? 0.15 : 0;
        return [rust(clamp01(0.45 + groove + patch + (py - edge) / -120 + sz.fbm(px * 0.03, py * 0.05, 3) * 0.15)), 1];
      });
      for (let px = 30 + k * 40 + r() * 40; px < W - 100; px += 140 + r() * 90) {
        const pw = 80 + k * 20;
        const ph = 18 + k * 6;
        c.poly([[px, y + ph + 6], [px + 14, y + 2], [px + pw + 14, y + 2], [px + pw, y + ph + 6]], '#000', 1, (qx, qy) => panel(clamp01(0.3 + (y + ph - qy) / 60 + ((qx - px) % (pw / 4) < 2 ? 0.25 : 0))));
        c.glow(px + pw * 0.6, y + 6, 26 + k * 8, '#f0f8ff', 0.3);
        c.line(px + pw / 2, y + ph + 6, px + pw / 2, y + drop + 6, 2, '#2a2420');
      }
    }
    // the street between the roofs and the camera: shaded, busy
    c.paintBox(0, H * 0.66, W, H, (px, py) => [mix(hex('#3a2e26'), hex('#6a5444'), clamp01(0.4 + sz(px * 0.01, py * 0.01) * 0.3)), 1]);
    for (let i = 0; i < 12; i++) figure(c, r() * W, H * 0.74 + r() * 20, 60 + r() * 16, { coat: pickOf(r, ['#e8b42a', '#2a6aa8', '#c83a2a', '#f0ece4', '#3a8a4a', '#8a2a6a']), skin: '#5a3a28', hair: '#100c0a', alpha: 0.9 });
    // the stall in front: a striped umbrella, a table of fruit in pyramids, the trader in a patterned dress
    const ux = W * 0.3;
    const uy = H * 0.56;
    const cloth = ramp([[0, '#3a0e0a'], [0.6, '#c83a2a'], [1, '#f0a07a']]);
    const cloth2 = ramp([[0, '#3a2a06'], [0.6, '#e8b42a'], [1, '#fff0a0']]);
    for (let k = 0; k < 8; k++) {
      const a0 = Math.PI + (k / 8) * Math.PI;
      const a1 = Math.PI + ((k + 1) / 8) * Math.PI;
      const tone = k % 2 ? cloth : cloth2;
      c.poly([[ux, uy - 120], [ux + Math.cos(a0) * 230, uy + Math.sin(a0) * 40 - 20], [ux + Math.cos(a1) * 230, uy + Math.sin(a1) * 40 - 20]], '#000', 1, (px) => tone(clamp01(0.55 + (px - ux) / 900 + (k === 6 || k === 5 ? 0.2 : 0))));
    }
    c.line(ux, uy - 120, ux, H * 0.94, 6, '#3a2a1e');
    groundShadow(c, ux, H * 0.95, 260, 30, 0.5, '#1a120c');
    c.rect(ux - 200, H * 0.8, 400, 18, '#5a3a22');
    c.rect(ux - 190, H * 0.8 + 18, 380, H * 0.14, '#3a2618');
    const fruit = [ramp([[0, '#5a2a04'], [0.6, '#e88a1a'], [1, '#ffd88a']]), ramp([[0, '#2a3a0a'], [0.6, '#8ab02a'], [1, '#e0f08a']]), ramp([[0, '#4a0a0a'], [0.6, '#c8281a'], [1, '#ff9a8a']])];
    for (let p = 0; p < 6; p++) {
      const tone = fruit[p % 3];
      const px = ux - 170 + p * 66;
      for (let row = 0; row < 4; row++) {
        for (let k = 0; k <= 3 - row; k++) {
          const fx = px + k * 15 + row * 7.5;
          const fy = H * 0.8 - 8 - row * 13;
          c.litPoly(blob(fx, fy, 8, 7, 680 + p * 20 + row * 5 + k, 0.08, 14), fx, fy, 8, 7, tone, { lx: 0.4, ly: -0.8, lz: 0.5, ambient: 0.25 });
        }
      }
    }
    figure(c, ux + 120, H * 0.97, 230, { coat: '#2a5a9a', legs: '#2a5a9a', skin: '#5a3a28', hair: '#0c0a08' });
    c.ellipse(ux + 120, H * 0.97 - 230 * 0.95, 26, 16, '#e8b42a');
  },

  /** A British high street in the rain at dusk: shopfronts receding on both sides, lit windows, umbrellas, wet paving. */
  highstreet(c, r) {
    const vx = W * 0.52;
    const vy = H * 0.42;
    c.gradient(0, vy + 20, [[0, '#2a3242'], [0.7, '#5a6474'], [1, '#8a8c90']]);
    clouds(c, 681, { y0: 0, y1: vy, scale: 0.003, cover: 0.1, lit: '#9aa0aa', shade: '#2a303c', alpha: 0.8 });
    const brick = ramp([[0, '#1a1210'], [0.5, '#4a2e26'], [0.85, '#7a5040'], [1, '#a87a62']]);
    const sz = noise2(682);
    // the road and pavements, wet
    c.poly([[0, H], [vx - 8, vy], [vx + 8, vy], [W, H]], '#1e2026');
    c.poly([[0, H * 0.78], [vx - 10, vy], [vx - 6, vy], [W * 0.18, H]], '#2a2c32');
    c.poly([[W, H * 0.78], [vx + 10, vy], [vx + 6, vy], [W * 0.82, H]], '#2a2c32');
    // the two terraces: brick above, a bright band of shop windows below, each unit with its own fascia
    const side = (dir) => {
      const outer = dir < 0 ? 0 : W;
      const face = [[outer, -40], [vx + dir * 10, vy - 40], [vx + dir * 10, vy + 4], [outer, H * 0.8]];
      c.poly(face, '#000', 1, (px, py) => brick(clamp01(0.42 + sz.fbm(px * 0.02, py * 0.03, 3) * 0.2 + (Math.floor(py / 7) % 2) * 0.04)));
      for (let k = 0; k < 9; k++) {
        const t0 = k / 9;
        const t1 = (k + 0.82) / 9;
        const xa = outer + (vx + dir * 10 - outer) * t0 ** 0.55;
        const xb = outer + (vx + dir * 10 - outer) * t1 ** 0.55;
        const ya = (x) => vy + 4 + (H * 0.8 - vy - 4) * Math.abs(x - vx) / Math.abs(outer - vx);
        const yt = (x) => vy - 40 + (-40 - vy + 40) * Math.abs(x - vx) / Math.abs(outer - vx) * 0.55;
        const glass = [[xa, yt(xa) + (ya(xa) - yt(xa)) * 0.55], [xb, yt(xb) + (ya(xb) - yt(xb)) * 0.55], [xb, ya(xb) - (ya(xb) - yt(xb)) * 0.04], [xa, ya(xa) - (ya(xa) - yt(xa)) * 0.04]];
        c.poly(glass, '#000', 1, (px, py) => mix(hex('#ffe2b0'), hex('#c88a4a'), clamp01((py - glass[0][1]) / Math.max(1, glass[3][1] - glass[0][1]) * 0.5 + sz(px * 0.05, py * 0.05) * 0.2)));
        const fascia = [[xa, glass[0][1] - (ya(xa) - yt(xa)) * 0.12], [xb, glass[1][1] - (ya(xb) - yt(xb)) * 0.12], [xb, glass[1][1]], [xa, glass[0][1]]];
        c.poly(fascia, pickOf(r, ['#1a3a2a', '#3a1a1a', '#1a2a4a', '#2a2a2a', '#4a3a1a']));
        // goods and price cards in the window
        for (let g = 0; g < 4; g++) {
          const gx = xa + (xb - xa) * (g + 0.5) / 4;
          const gy = glass[3][1] - (glass[3][1] - glass[0][1]) * 0.35;
          const gs = Math.abs(xb - xa) / 10;
          c.rect(gx - gs, gy - gs * 2, gs * 2, gs * 2, pickOf(r, ['#c83a2a', '#3a6a3a', '#e8e0d0', '#2a3a6a']), 0.85);
          c.rect(gx - gs * 0.8, gy + gs * 0.2, gs * 1.6, gs, '#fffaf0');
          c.rect(gx - gs * 0.5, gy + gs * 0.5, gs, Math.max(1, gs * 0.3), '#c81a1a');
        }
        c.glow((xa + xb) / 2, (glass[0][1] + glass[3][1]) / 2, Math.abs(xb - xa) * 1.2, '#ffc880', 0.18);
        // upper windows
        const uy = yt(xa) + (glass[0][1] - yt(xa)) * 0.35;
        c.rect(Math.min(xa, xb) + Math.abs(xb - xa) * 0.25, uy, Math.abs(xb - xa) * 0.45, (glass[0][1] - yt(xa)) * 0.3, r() < 0.4 ? '#e8c07a' : '#14141a');
      }
    };
    side(-1);
    side(1);
    // reflections of the windows in the wet paving: warm vertical streaks
    for (let i = 0; i < 26; i++) {
      const dir = i % 2 ? 1 : -1;
      const t = r();
      const x = vx + dir * (W * 0.5) * t ** 0.55;
      const y = vy + 10 + (H * 0.8 - vy) * t;
      c.rect(x - 4 - t * 10, y, 8 + t * 20, (H - y) * 0.5, '#ffc880', 0.08 + t * 0.12);
    }
    // shoppers under umbrellas at different distances
    for (const [fx, h, u] of [[W * 0.36, 180, '#14141a'], [W * 0.62, 150, '#7a1a1a'], [W * 0.46, 96, '#1a2a4a'], [W * 0.57, 70, '#e8e4dc'], [W * 0.42, 54, '#2a2a2a'], [W * 0.7, 120, '#1a1a1e']]) {
      const ground = vy + (H - vy) * (h / 200) * 0.95;
      figure(c, fx, ground, h, { coat: pickOf(r, ['#1a1a20', '#3a2a24', '#2a3040', '#4a3a2a']), umbrella: u });
    }
    rain(c, r, 800, { colour: '#c8d4e4', alpha: 0.2 });
  },

  /** A small robot vacuum on two short legs climbing a wooden staircase in a quiet home, afternoon light from a window. */
  stairs(c, r) {
    const wall = ramp([[0, '#3a3430'], [0.6, '#a89a8a'], [1, '#e8dcc8']]);
    const wz = noise2(701);
    c.paintBox(0, 0, W, H, (px, py) => [wall(clamp01(0.5 + wz.fbm(px * 0.01, py * 0.01, 3) * 0.08 - px / W * 0.25)), 1]);
    // the window: a bright pane with a soft frame, its light falling in a slanted patch across the steps
    c.rect(W * 0.62, H * 0.06, 260, 300, '#f8f2e4');
    c.rect(W * 0.62 + 126, H * 0.06, 8, 300, '#8a7a6a');
    c.rect(W * 0.62, H * 0.06 + 146, 260, 8, '#8a7a6a');
    c.glow(W * 0.7, H * 0.25, 420, '#fff0d0', 0.35);
    // the staircase rising to the right: treads and risers, oak with grain, the light patch on them
    const oak = ramp([[0, '#2a1a0e'], [0.5, '#7a5230'], [0.85, '#b88a5a'], [1, '#e8c898']]);
    const gz = noise2(702);
    const steps = 7;
    for (let k = steps - 1; k >= 0; k--) {
      const x0 = W * 0.04 + k * 150;
      const y0 = H * 0.98 - k * 82;
      // riser
      c.paintBox(x0, y0 - 82, x0 + 150 + W, y0, (px, py) => {
        const light = px > W * 0.4 + (H - py) * 0.6 && px < W * 0.75 + (H - py) * 0.6 ? 0.2 : 0;
        return [oak(clamp01(0.3 + light + gz(px * 0.005, py * 0.08) * 0.08)), 1];
      });
      // tread with its nosing
      c.paintBox(x0, y0 - 98, x0 + 150 + W, y0 - 82, (px, py) => {
        const light = px > W * 0.4 + (H - py) * 0.6 && px < W * 0.75 + (H - py) * 0.6 ? 0.25 : 0;
        return [oak(clamp01(0.55 + light + gz(px * 0.003, py * 0.3) * 0.12)), 1];
      });
      c.rect(x0, y0 - 84, 150 + W, 3, '#1a1008', 0.6);
    }
    // the banister and spindles
    c.line(0, H * 0.62, W, H * 0.02, 12, '#5a3a20');
    for (let k = 0; k < 9; k++) {
      const x = 40 + k * 150;
      c.line(x, H * 0.98 - (k - 0.2) * 82 - 98, x, H * 0.62 - x * (H * 0.6 / W), 6, '#e8e0d0');
    }
    // the robot: a round white disc body with a dark lidar turret, two short jointed legs on the step above
    const rx = W * 0.04 + 3 * 150 + 70;
    const ry = H * 0.98 - 3 * 82 - 110;
    const shell = ramp([[0, '#4a4e56'], [0.6, '#c8ccd2'], [1, '#ffffff']]);
    groundShadow(c, rx, ry + 16, 80, 10, 0.5, '#1a1008');
    for (const s of [-1, 1]) {
      c.line(rx + s * 30, ry, rx + s * 46, ry - 40, 8, '#2a2c32');
      c.line(rx + s * 46, ry - 40, rx + s * 40 + 30, ry - 74, 7, '#2a2c32');
      c.ellipse(rx + s * 40 + 32, ry - 76, 12, 5, '#14161a');
    }
    c.litPoly(blob(rx, ry - 6, 76, 26, 703, 0.02), rx, ry - 6, 76, 26, shell, { lx: 0.6, ly: -0.7, lz: 0.5, ambient: 0.2 });
    c.rect(rx - 76, ry - 2, 152, 8, '#3a3e46');
    c.litPoly(blob(rx - 6, ry - 28, 18, 10, 704, 0.02), rx - 6, ry - 28, 18, 10, ramp([[0, '#08080a'], [1, '#5a5e66']]), { lx: 0.6, ly: -0.7, lz: 0.5 });
    c.glow(rx + 40, ry - 10, 6, '#4ae8ff', 0.9, 1.2);
  },

  /** A satellite internet terminal on a fence post at the edge of a wide farm field at golden hour, cattle far off. */
  satfarm(c, r) {
    const hz = H * 0.58;
    c.gradient(0, hz, [[0, '#4a6a9a'], [0.6, '#c8b8a0'], [1, '#f0c890']]);
    clouds(c, 711, { y0: H * 0.04, y1: H * 0.4, scale: 0.0022, cover: 0.2, lit: '#ffe0b8', shade: '#6a6a7a', alpha: 0.75, stretch: 3 });
    c.glow(W * 0.12, hz - 20, 520, '#ffc880', 0.5);
    c.ridge(hz - 6, 18, 0.003, '#6a6a5a', 712, { bottom: hz + 4, octaves: 3 });
    // the field: stubble rows converging to the horizon, warm on the sunward side
    const field = ramp([[0, '#3a2e18'], [0.5, '#8a6e3a'], [0.85, '#c8a868'], [1, '#f0d898']]);
    const fz = noise2(713);
    c.paintBox(0, hz, W, H, (px, py) => {
      const k = (py - hz) / (H - hz);
      const row = Math.sin(((px - W * 0.5) / (0.02 + k)) * 0.05) > 0.6 ? -0.12 : 0;
      return [field(clamp01(0.5 + row + fz.fbm(px * 0.01 / (0.2 + k), py * 0.05, 3) * 0.2 + (W - px) / W * 0.15 - k * 0.1)), 1];
    });
    for (let i = 0; i < 7; i++) {
      const x = W * (0.55 + r() * 0.35);
      const y = hz + 8 + r() * 10;
      c.ellipse(x, y, 12, 6, '#2a1e16');
      c.rect(x - 9, y + 3, 3, 8, '#1a120c');
      c.rect(x + 6, y + 3, 3, 8, '#1a120c');
    }
    // a fence line along the field edge
    for (let k = 0; k < 14; k++) {
      const t = k / 13;
      const x = W * 0.02 + t * W * 0.5;
      const y0 = H * 0.98 - t * (H * 0.98 - hz - 10);
      c.line(x, y0, x, y0 - 120 * (1 - t * 0.85), 8 * (1 - t * 0.7), '#4a3a28');
      if (k) c.line(x - W * 0.5 / 13, y0 + (H * 0.98 - hz - 10) / 13 - 80 * (1 - (t - 1 / 13) * 0.85), x, y0 - 80 * (1 - t * 0.85), 2, '#2a2a2a');
    }
    // the terminal: a flat white dish on a short mast bolted to the nearest post, a cable running down
    const tx = W * 0.2;
    const ty = H * 0.58;
    c.line(W * 0.08, H * 0.98, W * 0.08, H * 0.5, 16, '#5a4632');
    c.line(W * 0.08, ty + 10, tx, ty + 40, 6, '#c8c8c8');
    // a flat rectangular antenna panel tilted to the sky: lit face, dark edge, a short arm to the mast
    const dish = ramp([[0, '#5a5e64'], [0.6, '#d0d4d8'], [1, '#ffffff']]);
    const face = [[tx - 70, ty - 40], [tx + 46, ty - 64], [tx + 76, ty + 6], [tx - 40, ty + 30]];
    c.poly(face.map(([x, y]) => [x + 6, y + 10]), '#2a2c30');
    c.poly(face, '#000', 1, (px, py) => dish(clamp01(0.85 - (px - tx + 70) / 400 + (py - ty) / 300)));
    c.line(tx - 70, ty - 40, tx + 46, ty - 64, 3, '#ffffff', 0.8);
    c.line(tx + 10, ty + 40, tx + 10, H * 0.98, 3, '#1a1a1a');
    c.glow(tx - 40, ty - 30, 80, '#fff0d0', 0.3);
  },

  /** A self-driving bus at a night stop in Seoul: a long glowing interior, rain on the road, lit signs (no legible text). */
  nightbus(c, r) {
    c.gradient(0, H, [[0, '#0a0c16'], [0.6, '#181c2a'], [1, '#0c0e14']]);
    const sz = noise2(721);
    for (let x = -20; x < W; ) {
      const w = 100 + r() * 160;
      const top = H * (0.02 + r() * 0.16);
      c.paintBox(x, top, x + w, H * 0.6, (px, py) => [mix(hex('#141826'), hex('#262a3c'), 0.3 + sz(px * 0.02, py * 0.02) * 0.3), 1]);
      windows(c, r, x, top, x + w, H * 0.56, { w: 8, h: 10, gx: 16, gy: 18, lit: 0.35 });
      // vertical sign boxes in colour, abstract glyph blocks
      if (r() < 0.6) {
        const sx = x + w - 40;
        const col = pickOf(r, ['#ff4a8a', '#4ae8ff', '#ffd84a', '#8a6aff']);
        c.rect(sx, top + 30, 30, 160, '#0a0a10');
        for (let g = 0; g < 5; g++) c.rect(sx + 7, top + 40 + g * 30, 16, 18, col, 0.9);
        c.glow(sx + 15, top + 110, 80, col, 0.25);
      }
      x += w + 6;
    }
    const road = H * 0.66;
    c.rect(0, road, W, H - road, '#101218');
    c.rect(0, road - 20, W, 20, '#2a2c34');
    // the bus: a long low body, rounded front, a band of warm interior light, passengers' silhouettes
    const bx = W * 0.18;
    const by = H * 0.4;
    const bw = W * 0.66;
    const bh = H * 0.26;
    const paint = ramp([[0, '#14181e'], [0.5, '#5a6a7a'], [1, '#d8e8f0']]);
    c.poly([[bx, by + 30], [bx + 30, by], [bx + bw, by], [bx + bw + 20, by + 30], [bx + bw + 20, by + bh], [bx, by + bh]], '#000', 1, (px, py) => paint(clamp01(0.55 - (py - by) / bh * 0.5)));
    c.rect(bx + 40, by + 20, bw - 40, bh * 0.45, '#ffe8c0');
    c.paintBox(bx + 40, by + 20, bx + bw, by + 20 + bh * 0.45, (px, py) => [hex('#c89a5a'), 0.2 + Math.sin(px * 0.02) * 0.05]);
    for (let k = 0; k < 9; k++) {
      const px = bx + 70 + k * (bw - 80) / 9;
      c.rect(px, by + 20, 6, bh * 0.45, '#2a2e36');
      if (r() < 0.5) {
        c.ellipse(px + 30, by + 40, 9, 11, '#3a2a24');
        c.rect(px + 20, by + 50, 20, 26, '#3a3440');
      }
    }
    c.rect(bx, by + bh * 0.72, bw + 20, 6, '#4ae8ff', 0.8);
    c.glow(bx + bw / 2, by + bh * 0.72, 300, '#4ae8ff', 0.12);
    for (const wx of [bx + 120, bx + bw - 120]) {
      c.circle(wx, by + bh, 36, '#08080a');
      c.circle(wx, by + bh, 18, '#4a4e56');
    }
    c.glow(bx + bw + 14, by + bh * 0.6, 50, '#fff4d8', 0.7);
    reflect(c, road + 10, H, '#0c0e14', 0.5, 722, { ripple: 4, stretch: 0.14 });
    rain(c, r, 600, { colour: '#a8c4e0', alpha: 0.18 });
  },

  /** Small six-wheeled delivery robots on a sunny Barcelona pavement, the chamfered corner of an Eixample block behind. */
  robots(c, r) {
    c.gradient(0, H * 0.3, [[0, '#6a9ac8'], [1, '#c8dce8']]);
    // the building: warm stone, rows of tall windows with wrought-iron balconies, shutters
    const stone = ramp([[0, '#5a4a3a'], [0.5, '#b89e7e'], [0.85, '#e0ccae'], [1, '#f4e6cc']]);
    const sz = noise2(731);
    c.paintBox(0, 0, W, H * 0.62, (px, py) => [stone(clamp01(0.62 + sz.fbm(px * 0.01, py * 0.02, 3) * 0.1 - (px > W * 0.55 ? 0.18 : 0))), 1]);
    for (let fl = 0; fl < 4; fl++) {
      const y = H * 0.06 + fl * 92;
      for (let k = 0; k < 9; k++) {
        const x = 40 + k * 140 + (k > 4 ? 30 : 0);
        c.rect(x, y, 56, 74, '#2a2a30');
        c.rect(x, y, 26, 74, pickOf(r, ['#3a5a4a', '#5a4a3a', '#4a5a6a']));
        c.rect(x - 10, y + 70, 76, 5, '#2a2622');
        for (let b = 0; b < 8; b++) c.line(x - 8 + b * 10, y + 70, x - 8 + b * 10, y + 50, 1.5, '#1a1816');
        c.line(x - 10, y + 50, x + 66, y + 50, 2, '#1a1816');
      }
    }
    // shop fronts at street level, an awning, and the pavement of hexagonal tiles
    c.rect(0, H * 0.5, W, H * 0.12, '#3a3430');
    c.rect(W * 0.1, H * 0.5, 260, H * 0.12, '#e8d8b0', 0.8);
    c.poly([[W * 0.08, H * 0.5], [W * 0.1 + 280, H * 0.5], [W * 0.1 + 300, H * 0.56], [W * 0.06, H * 0.56]], '#8a2a2a');
    const tile = ramp([[0, '#6a6a6a'], [0.6, '#b0aca4'], [1, '#e0dcd4']]);
    c.paintBox(0, H * 0.62, W, H, (px, py) => {
      const k = (py - H * 0.62) / (H * 0.38);
      const s = 18 + k * 30;
      const hx = Math.abs(((px / s + (Math.floor(py / (s * 0.8)) % 2) * 0.5) % 1) - 0.5);
      const edge = hx > 0.44 || (py / (s * 0.8)) % 1 < 0.08;
      return [tile(clamp01(0.6 - k * 0.1 + (edge ? -0.25 : 0) + sz(px * 0.02, py * 0.02) * 0.06)), 1];
    });
    c.paintBox(0, H * 0.62, W, H, (px, py) => (px > W * 0.55 + (py - H * 0.62) * 0.4 ? [hex('#1a1e2a'), 0.3] : null)); // shadow of the building opposite
    // the robots: rounded white bodies on six wheels, an orange flag on a whip aerial, a lid seam, a little screen
    const body = ramp([[0, '#5a5e66'], [0.6, '#d8dade'], [1, '#ffffff']]);
    for (const [x, y, s] of [[W * 0.3, H * 0.86, 1], [W * 0.58, H * 0.76, 0.7], [W * 0.76, H * 0.7, 0.5]]) {
      groundShadow(c, x + 10 * s, y + 46 * s, 120 * s, 16 * s, 0.5, '#1a1a1e');
      c.litPoly(blob(x, y, 100 * s, 54 * s, 732 + Math.floor(x), 0.04), x, y, 100 * s, 60 * s, body, { lx: -0.6, ly: -0.7, lz: 0.5, ambient: 0.25 });
      c.line(x - 90 * s, y - 10 * s, x + 90 * s, y - 14 * s, 2, '#7a7e86');
      c.rect(x + 40 * s, y - 4 * s, 34 * s, 16 * s, '#1a2a3a');
      for (let w = 0; w < 3; w++) c.circle(x - 70 * s + w * 70 * s, y + 46 * s, 16 * s, '#141418');
      c.line(x - 70 * s, y - 40 * s, x - 76 * s, y - 150 * s, 2, '#2a2a2a');
      c.poly([[x - 76 * s, y - 150 * s], [x - 40 * s, y - 140 * s], [x - 76 * s, y - 128 * s]], '#f07a1a');
    }
    figure(c, W * 0.12, H * 0.9, 210, { coat: '#2a3a5a', legs: '#1a1e2a' });
  },

  /** A data centre on the lava fields near Reykjavik: a long low hall, steam from geothermal pipes, wind turbines, cold light. */
  datacentre(c, r) {
    const hz = H * 0.56;
    c.gradient(0, hz, [[0, '#5a6a7a'], [0.6, '#a8b0b4'], [1, '#d8d8d0']]);
    clouds(c, 741, { y0: 0, y1: H * 0.42, scale: 0.002, cover: 0.08, lit: '#e8e8e4', shade: '#6a7480', alpha: 0.85, stretch: 3 });
    c.ridge(hz - 30, 50, 0.0025, '#6a7480', 742, { bottom: hz, octaves: 4 });
    haze(c, hz - 90, hz, '#c8ccc8', 0.0, 0.4);
    // wind turbines on the ridge
    for (const [x, h] of [[W * 0.7, 200], [W * 0.8, 170], [W * 0.88, 150]]) {
      c.line(x, hz - 30, x, hz - 30 - h, 6, '#e8ecec');
      const a = r() * Math.PI * 2;
      for (let b = 0; b < 3; b++) {
        const aa = a + (b * Math.PI * 2) / 3;
        c.line(x, hz - 30 - h, x + Math.cos(aa) * h * 0.45, hz - 30 - h + Math.sin(aa) * h * 0.45, 4, '#f4f6f6');
      }
    }
    // mossy lava field
    const moss = ramp([[0, '#14180e'], [0.5, '#3a4a2a'], [0.85, '#6a7a4a'], [1, '#a8b07a']]);
    const mz = noise2(743);
    c.paintBox(0, hz, W, H, (px, py) => {
      const k = (py - hz) / (H - hz);
      const lump = mz.fbm(px * 0.01 / (0.3 + k), py * 0.02 / (0.3 + k), 4);
      return [moss(clamp01(0.45 + lump * 0.4 - k * 0.1)), 1];
    });
    // the data centre: a long grey hall with ribbed cladding, cooling units on the roof, a blue light at the door
    const x0 = W * 0.12;
    const x1 = W * 0.66;
    const top = hz - 70;
    const clad = ramp([[0, '#2a2e34'], [0.6, '#6a7078'], [1, '#a8b0b8']]);
    c.paintBox(x0, top, x1, hz + 30, (px, py) => [clad(clamp01(0.5 + Math.sin(px * 0.5) * 0.06 - (py - top) / 400)), 1]);
    c.rect(x0, top - 6, x1 - x0, 6, '#3a3e44');
    for (let x = x0 + 30; x < x1 - 40; x += 70) {
      c.rect(x, top - 26, 46, 20, '#5a6068');
      c.circle(x + 23, top - 16, 7, '#2a2e34');
    }
    c.rect(x0 + 60, hz - 10, 40, 40, '#14181e');
    c.glow(x0 + 80, hz - 14, 40, '#4ab0ff', 0.6);
    // geothermal pipes running across the field, and steam rising from a vent behind the hall
    c.line(0, hz + 60, W, hz + 40, 10, '#8a8e92');
    c.line(0, hz + 64, W, hz + 44, 3, '#3a3e42');
    const steam = noise2(744);
    c.paintBox(W * 0.6, H * 0.05, W * 0.95, hz, (px, py) => {
      const cx = W * 0.74 + (hz - py) * 0.25;
      const w = 30 + (hz - py) * 0.4;
      const d = Math.abs(px - cx) / w;
      if (d > 1) return null;
      const v = steam.fbm(px * 0.01, py * 0.015, 4);
      return [hex('#f0f2f2'), clamp01((1 - d) * (0.5 + v) * (0.3 + (py - H * 0.05) / hz * 0.6))];
    });
  },

  /** A medicine drone, a small fixed-wing plane, over the green terraced hills of Rwanda; a parcel drifts down under a red parachute. */
  medidrone(c, r) {
    c.gradient(0, H * 0.5, [[0, '#6a96c4'], [0.8, '#c8d8dc'], [1, '#e0e4d4']]);
    clouds(c, 751, { y0: H * 0.02, y1: H * 0.36, scale: 0.0024, cover: 0.18, lit: '#ffffff', shade: '#a8b4c0', alpha: 0.85 });
    // hills, layered into haze, terraced in curved green bands, banana trees and a health centre's roof
    const tones = ['#7a9a8a', '#5a8a5a', '#3a6a32'];
    for (let k = 0; k < 3; k++) {
      const base = H * (0.46 + k * 0.14);
      const g = ramp([[0, mix(hex(tones[k]), hex('#000000'), 0.35)], [1, mix(hex(tones[k]), hex('#ffffff'), 0.15)]]);
      const hz2 = noise2(752 + k);
      const pts = c.ridge(base, 60 - k * 10, 0.0026 + k * 0.001, tones[k], 760 + k, { octaves: 4 });
      c.paintBox(0, base - 80, W, H, (px, py) => {
        const top = (pts.find(([x]) => x >= px) || pts.at(-2))[1];
        if (py < top) return null;
        const terrace = Math.sin((py - top) * (0.12 - k * 0.025) + hz2(px * 0.004, 1) * 3) > 0.5 ? -0.12 : 0.05;
        return [g(clamp01(0.55 + terrace + hz2.fbm(px * 0.01, py * 0.02, 3) * 0.2)), 1];
      });
      haze(c, base - 70, base + 40, '#d8e0d8', 0.3 - k * 0.1, 0);
    }
    const leaf = ramp([[0, '#14280e'], [1, '#7aa04a']]);
    for (let i = 0; i < 12; i++) {
      const x = r() * W;
      const y = H * 0.82 + r() * H * 0.16;
      c.line(x, y, x, y - 50, 5, '#4a3a22');
      for (let l = 0; l < 6; l++) c.line(x, y - 50, x + (r() - 0.5) * 90, y - 50 - r() * 40, 7, leaf(0.3 + r() * 0.6));
    }
    c.poly([[W * 0.66, H * 0.76], [W * 0.72, H * 0.72], [W * 0.82, H * 0.73], [W * 0.78, H * 0.77]], '#c8c8c0');
    c.rect(W * 0.67, H * 0.765, 130, 34, '#e8e0d0');
    c.rect(W * 0.71, H * 0.78, 18, 20, '#3a2a1e');
    // the drone: a white fixed-wing body with a red tail, banking gently; the parcel below on its parachute
    const dx = W * 0.4;
    const dy = H * 0.24;
    const k = 1.7; // the subject: big enough to read on the video wall
    const P = ([x, y]) => [dx + (x - dx) * k, dy + (y - dy) * k];
    const white = ramp([[0, '#6a6e74'], [0.6, '#dcdee2'], [1, '#ffffff']]);
    c.poly([[dx - 160, dy + 10], [dx + 160, dy - 14], [dx + 150, dy - 4], [dx - 150, dy + 22]].map(P), white(0.85));
    c.poly([[dx - 160, dy + 22], [dx + 150, dy - 4], [dx + 150, dy - 1], [dx - 160, dy + 25]].map(P), '#5a5e66');
    c.poly([[dx - 60, dy + 4], [dx + 70, dy - 2], [dx + 60, dy + 14], [dx - 50, dy + 18]].map(P), '#000', 1, (px, py) => white(clamp01(0.8 - (py - dy) / (40 * k))));
    c.poly([[dx - 64, dy + 6], [dx - 90, dy - 24], [dx - 78, dy - 24], [dx - 52, dy + 6]].map(P), '#c8282a');
    c.circle(dx + 74 * k, dy + 4 * k, 6 * k, '#2a2a2e');
    for (const s2 of [-1, 1]) c.line(dx + 76 * k, dy + 4 * k + s2 * 14, dx + 76 * k, dy + 4 * k - s2 * 14, 2, '#8a8e96', 0.6); // the propeller disc
    c.line(W * 0.55, H * 0.36, W * 0.55, H * 0.46, 1.5, '#e8e8e8', 0.8);
    c.poly([[W * 0.52, H * 0.36], [W * 0.55, H * 0.33], [W * 0.58, H * 0.36]], '#d8282a');
    c.rect(W * 0.545, H * 0.46, 14, 12, '#c8a87a');
  },

  /** A summer afternoon in a European city: a sun-bleached square on one side, people in the deep shade of an avenue of plane trees on the other. */
  shade(c, r) {
    c.gradient(0, H * 0.45, [[0, '#8ab0d4'], [0.7, '#d8e0e4'], [1, '#f4ecd8']]);
    c.glow(W * 0.15, 0, 520, '#fffaf0', 0.55);
    const sz = noise2(781);
    // pale stone buildings across the square, washed out by the heat; shutters closed
    for (let x = -20; x < W; ) {
      const w = 160 + r() * 120;
      const top = H * (0.12 + r() * 0.06);
      c.paintBox(x, top, x + w, H * 0.5, (px, py) => [mix(hex('#e8dcc4'), hex('#fff8ec'), 0.4 + sz(px * 0.02, py * 0.02) * 0.2), 1]);
      for (let wy = top + 24; wy < H * 0.46; wy += 52) for (let wx = x + 16; wx < x + w - 30; wx += 44) c.rect(wx, wy, 18, 30, '#7a8a8a', 0.8);
      c.rect(x, top, w, 8, '#b8a888');
      x += w + 2;
    }
    // the square: bright paving shimmering, nobody in the sun
    c.paintBox(0, H * 0.5, W, H, (px, py) => [mix(hex('#c8b898'), hex('#f4ead4'), clamp01(0.6 + sz.fbm(px * 0.01, py * 0.04, 3) * 0.2 - (py - H * 0.5) / H * 0.3)), 1]);
    // the avenue on the right: a dark band of shade under the canopy, mottled with spots of sun
    const shadeLine = (y) => W * 0.42 - (y - H * 0.5) * 0.5;
    c.paintBox(0, H * 0.5, W, H, (px, py) => {
      if (px < shadeLine(py)) return null;
      const spot = sz(px * 0.02, py * 0.04) > 0.45 ? 0.45 : 0.82;
      return [hex('#2a2a26'), spot * 0.8];
    });
    // plane trees: pale mottled trunks, broad canopies lit from the left
    const leaf = ramp([[0, '#0e1a0c'], [0.5, '#2e4a22'], [0.85, '#6a8a3a'], [1, '#b8c86a']]);
    const bark = ramp([[0, '#3a3a30'], [0.6, '#8a8a74'], [1, '#d8d4b8']]);
    for (const [x, y, s] of [[W * 0.58, H * 0.62, 0.6], [W * 0.72, H * 0.7, 0.8], [W * 0.9, H * 0.84, 1.1]]) {
      c.litPoly([[x - 12 * s, y], [x - 8 * s, y - 220 * s], [x + 8 * s, y - 220 * s], [x + 12 * s, y]], x, y - 110 * s, 14 * s, 120 * s, bark, { lx: -0.8, ly: 0, lz: 0.5, ambient: 0.2, jitter: (px, py) => (sz(px * 0.1, py * 0.05) > 0.3 ? 0.25 : 0) });
      c.litPoly(blob(x, y - 280 * s, 230 * s, 120 * s, 782 + Math.floor(x), 0.25), x, y - 280 * s, 230 * s, 120 * s, leaf, { lx: -0.7, ly: -0.6, lz: 0.5, ambient: 0.1, jitter: (px, py) => smooth(-0.2, 0.4, sz(px * 0.03, py * 0.04)) * 0.25 - 0.1 });
    }
    // people on benches in the shade, one walking with a sun hat across the bright square
    c.rect(W * 0.66, H * 0.8, 160, 10, '#3a2a1a');
    for (const [fx, h, coat] of [[W * 0.68, 110, '#e8e0d0'], [W * 0.73, 104, '#3a5a8a'], [W * 0.82, 130, '#8a3a2a']]) figure(c, fx, H * 0.86, h, { coat, alpha: 0.95 });
    figure(c, W * 0.22, H * 0.78, 120, { coat: '#f0e8d8', legs: '#4a5a6a' });
    c.ellipse(W * 0.22, H * 0.78 - 120 * 0.9, 26, 7, '#d8c8a0');
    groundShadow(c, W * 0.24, H * 0.785, 60, 8, 0.5, '#6a5a44');
  },
};

export const DESK_GRADES = {
  research: { saturation: 0.72, tint: 0.14 },
  greenhouse: { saturation: 0.8, tint: 0.08, vignette: 0.42 },
  bees: { saturation: 0.75, tint: 0.1, vignette: 0.3 },
  tortoise: { saturation: 0.68, tint: 0.16 },
  footprints: { saturation: 0.6, tint: 0.16 },
  bank: { saturation: 0.65, tint: 0.16 },
  wallst: { saturation: 0.72, tint: 0.12 },
  tokyo: { saturation: 0.8, tint: 0.08, vignette: 0.3 },
  jets: { saturation: 0.62, tint: 0.14 },
  cocoa: { saturation: 0.75, tint: 0.12 },
  evcharge: { saturation: 0.8, tint: 0.08 },
  rice: { saturation: 0.7, tint: 0.14 },
  lagos: { saturation: 0.7, tint: 0.14 },
  highstreet: { saturation: 0.7, tint: 0.12 },
  stairs: { saturation: 0.7, tint: 0.14 },
  satfarm: { saturation: 0.72, tint: 0.14 },
  nightbus: { saturation: 0.8, tint: 0.08, vignette: 0.32 },
  robots: { saturation: 0.7, tint: 0.14 },
  datacentre: { saturation: 0.6, tint: 0.16 },
  medidrone: { saturation: 0.72, tint: 0.12 },
  shade: { saturation: 0.68, tint: 0.14, vignette: 0.28 },
};
