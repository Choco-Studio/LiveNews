// More original illustrations for the offline fixture stories (painted by
// make-images.mjs). These cover hard news as well as the gentler stories, so the
// offline channel shows a picture for most of what it reads: a canal in fog,
// a flooded street, a wildfire, a hurricane coast, a station during a strike, a
// central bank at dusk, a hospital at night, a closed car plant... Composition
// follows news photography (one subject, one motivated key light, depth through
// haze); grave scenes stay sober: no drama added that the story does not carry.
import { blob, hex, mix, noise1, noise2, ramp } from './raster.mjs';
import { H, W, clamp01, clouds, groundShadow, haze, pickOf, reflect, smooth, sparkle, tree } from './kit.mjs';

// ---------------------------------------------------------------- local tools

/** Diagonal rain: thin, faint streaks (wind from the left when `slant` > 0). */
function rain(c, r, n, { slant = 0.25, len = [18, 46], colour = '#c8d0dc', alpha = 0.22, y0 = 0, y1 = H } = {}) {
  for (let i = 0; i < n; i++) {
    const x = r() * (W + 200) - 100;
    const y = y0 + r() * (y1 - y0);
    const l = len[0] + r() * (len[1] - len[0]);
    c.line(x, y, x + l * slant, y + l, 1.2, colour, alpha * (0.4 + r() * 0.6));
  }
}

/**
 * A standing adult seen from a distance: 6.5 heads tall, shoulders wider than
 * hips, arms and legs as tapered limbs, lit from one side. `h` is the height in
 * pixels; `coat` the main colour; `walk` spreads the legs.
 */
function person(c, x, ground, h, { coat = '#2a2c34', legs = '#1a1c22', skin = '#b88a6a', light = -1, walk = 0, umbrella = null, alpha = 1, arm = 0 } = {}) {
  const u = h / 6.5; // one head
  const lit = (base, k) => mix(hex(base), hex('#f0e0c8'), k);
  const shade = (base) => (px) => (Math.sign(px - x) === Math.sign(light) ? lit(base, 0.18) : hex(base));
  // legs
  for (const side of [-1, 1]) {
    const hip = x + side * u * 0.28;
    const foot = x + side * u * (0.3 + walk * 0.5);
    c.poly([[hip - u * 0.26, ground - h * 0.48], [hip + u * 0.26, ground - h * 0.48], [foot + u * 0.15, ground], [foot - u * 0.17, ground]], legs, alpha);
  }
  // torso (coat to the knee for most people)
  const top = ground - h + u * 1.15;
  c.poly([[x - u * 0.82, top + u * 0.25], [x + u * 0.82, top + u * 0.25], [x + u * 0.68, ground - h * 0.3], [x - u * 0.68, ground - h * 0.3]], '#000', alpha, (px) => shade(coat)(px));
  c.ellipse(x - u * 0.62, top + u * 0.3, u * 0.32, u * 0.22, shade(coat)(x - u), alpha);
  c.ellipse(x + u * 0.62, top + u * 0.3, u * 0.32, u * 0.22, shade(coat)(x + u), alpha);
  // arms: one may be raised (holding an umbrella or a phone)
  for (const side of [-1, 1]) {
    const sx = x + side * u * 0.78;
    const raised = side === 1 && (umbrella || arm);
    const ex = sx + side * u * (raised ? 0.35 : 0.12);
    const ey = raised ? top + u * 0.4 : ground - h * 0.42;
    c.line(sx, top + u * 0.35, ex, ey, u * 0.34, Math.sign(side) === Math.sign(light) ? lit(coat, 0.12) : hex(coat), alpha);
  }
  // neck and head: a slightly tall oval, lit side warmer
  c.rect(x - u * 0.16, top - u * 0.15, u * 0.32, u * 0.4, mix(hex(skin), hex('#3a2a24'), 0.35), alpha);
  c.ellipse(x, top - u * 0.55, u * 0.42, u * 0.52, '#000', alpha, (px) => (Math.sign(px - x) === Math.sign(light) ? lit(skin, 0.1) : mix(hex(skin), hex('#2a1e1c'), 0.35)));
  c.ellipse(x, top - u * 0.86, u * 0.44, u * 0.26, '#1a1414', alpha);
  if (umbrella) {
    const ux = x + u * 0.5;
    const uy = top - u * 1.4;
    c.line(ux, uy, x + u * 1.0, top + u * 0.4, u * 0.08, '#141414', alpha);
    c.poly(
      Array.from({ length: 17 }, (_, i) => {
        const a = Math.PI + (i / 16) * Math.PI;
        return [ux + Math.cos(a) * u * 1.9, uy + Math.sin(a) * u * 0.9 + (i % 2) * u * 0.08];
      }),
      umbrella,
      alpha
    );
  }
}

/** A grid of windows on a façade, some lit warm, most dark; `lit` is the share that is on. */
function windows(c, r, x0, y0, x1, y1, { cols, rows, pad = 0.28, on = '#f2c878', off = '#1a2030', lit = 0.4, glowK = 0.08, cool = null } = {}) {
  const cw = (x1 - x0) / cols;
  const rh = (y1 - y0) / rows;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const wx = x0 + i * cw + cw * pad * 0.5;
      const wy = y0 + j * rh + rh * pad * 0.5;
      const ww = cw * (1 - pad);
      const wh = rh * (1 - pad);
      const isOn = r() < lit;
      const colour = isOn ? (cool && r() < 0.35 ? cool : on) : off;
      c.rect(wx, wy, ww, wh, colour);
      if (isOn) {
        c.rect(wx, wy + wh * 0.62, ww, wh * 0.38, mix(hex(colour), hex('#000000'), 0.25)); // the sill shadow / a blind
        if (glowK) c.glow(wx + ww / 2, wy + wh / 2, Math.max(ww, wh) * 1.6, colour, glowK);
      }
    }
  }
}

/** A container ship in profile: hull, stacked containers in muted colours, the bridge at the stern. */
function ship(c, r, x, waterY, len, { fog = 0, fogColour = '#c8c4bc', bow = 1 } = {}) {
  const air = hex(fogColour);
  const tone = (h, k = 0) => mix(mix(hex(h), hex('#000000'), k), air, fog);
  const hh = len * 0.085;
  // hull: a long dark-red/black body with a raked bow (bow = 1: bow on the right)
  const b = bow;
  const sx = b > 0 ? x : x + len;
  const ex = b > 0 ? x + len : x;
  const hull = [[sx, waterY - hh], [ex - b * len * 0.04, waterY - hh], [ex + b * len * 0.02, waterY - hh * 1.25], [ex - b * len * 0.06, waterY + hh * 0.35], [sx + b * len * 0.02, waterY + hh * 0.35]];
  c.poly(hull, '#000', 1, (px, py) => (py < waterY - hh * 0.45 ? tone('#3a2a2c', 0) : tone('#5a2622', 0.05 * (py - waterY + hh) / hh)));
  c.rect(Math.min(sx, ex), waterY - hh * 0.5, len, 3, tone('#8a7a70'));
  // containers: stacks of 3-6, colours of a working ship, top faces catching the light
  const colours = ['#7a3a2c', '#2c4a6a', '#8a6a2a', '#3a5a4a', '#6a6a6e', '#9a4a2a', '#2a3a5a', '#7a2a34', '#b0a080'];
  const cw = len * 0.045;
  const ch = hh * 0.55;
  const from = b > 0 ? x + len * 0.2 : x + len * 0.12;
  const to = b > 0 ? x + len * 0.86 : x + len * 0.78;
  for (let cx = from; cx < to - cw; cx += cw * 1.02) {
    const n = 3 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) {
      const top = waterY - hh - (k + 1) * ch;
      const colour = pickOf(r, colours);
      c.rect(cx, top, cw * 0.98, ch * 0.96, tone(colour, 0.08));
      c.rect(cx, top, cw * 0.98, 2, tone(colour, -0.4));
      for (let rib = 1; rib < 4; rib++) c.rect(cx + (cw * rib) / 4, top + 2, 1, ch * 0.9, tone(colour, 0.3));
    }
  }
  // the bridge and the funnel at the stern
  const bx = b > 0 ? x + len * 0.04 : x + len * 0.84;
  c.rect(bx, waterY - hh - hh * 2.6, len * 0.12, hh * 2.6, tone('#e4e0d8', 0.05));
  c.rect(bx - len * 0.01, waterY - hh - hh * 2.6, len * 0.14, hh * 0.35, tone('#f4f0e8'));
  for (let k = 0; k < 4; k++) c.rect(bx + 4, waterY - hh - hh * (2.2 - k * 0.5), len * 0.12 - 8, hh * 0.16, tone('#2a3038'));
  c.rect(bx + len * 0.03, waterY - hh - hh * 3.4, len * 0.04, hh * 0.85, tone('#2a2a30'));
}

/** A coconut palm: a curved, ringed trunk and a crown of drooping fronds; `wind` bends it all one way. */
function palm(c, r, x, ground, h, { wind = 0, trunk = '#4a3c30', leaf = '#2e3a26', light = '#6a7a4a', alpha = 1 } = {}) {
  const pts = [];
  const lean = (r() - 0.5) * 0.2 + wind * 0.35;
  const segs = 14;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    pts.push([x + Math.sin(t * 1.2) * h * lean + wind * t * t * h * 0.25, ground - t * h]);
  }
  for (let i = 0; i < segs; i++) {
    const w = h * 0.035 * (1 - (i / segs) * 0.4);
    c.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w, i % 2 ? trunk : mix(hex(trunk), hex('#000000'), 0.18), alpha);
  }
  const [tx, ty] = pts[segs];
  // fronds: arcs out from the crown, drooping, streaming downwind
  for (let k = 0; k < 13; k++) {
    const a = -Math.PI / 2 + (k / 12 - 0.5) * Math.PI * 1.7 + wind * 0.9;
    const len = h * (0.32 + r() * 0.12) * (1 + wind * 0.15);
    let px = tx;
    let py = ty;
    const steps = 9;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const droop = t * t * len * (0.55 - wind * 0.25);
      const nx = tx + Math.cos(a) * len * t + wind * t * len * 0.5;
      const ny = ty + Math.sin(a) * len * t * 0.55 + droop;
      const w = h * 0.03 * (1 - t * 0.7);
      c.line(px, py, nx, ny, w, mix(hex(leaf), hex(light), clamp01(0.6 - t * 0.5 - Math.sin(a) * 0.3)), alpha);
      // leaflets hanging from the rib
      if (s > 1) c.line(nx, ny, nx + (r() - 0.3) * w * 2 + wind * w * 3, ny + w * (2 + r() * 2), w * 0.55, leaf, alpha * 0.85);
      px = nx;
      py = ny;
    }
  }
  c.ellipse(tx, ty + h * 0.02, h * 0.035, h * 0.03, '#3a3020', alpha);
}

/** An umbrella pine (Mediterranean): a bare trunk and a flat, lumpy crown. */
function pine(c, r, x, ground, h, { tone = ramp([[0, '#0e120e'], [0.6, '#22281a'], [1, '#4a4a2a']]), light = { lx: 0.6, ly: -0.6, lz: 0.4 } } = {}) {
  c.line(x, ground, x + (r() - 0.5) * h * 0.2, ground - h * 0.62, h * 0.05, '#1a1410');
  const cx = x + (r() - 0.5) * h * 0.2;
  const cy = ground - h * 0.72;
  for (let k = 0; k < 6; k++) {
    const bx = cx + (r() - 0.5) * h * 0.55;
    const by = cy + (r() - 0.5) * h * 0.1;
    c.litPoly(blob(bx, by, h * 0.22, h * 0.1, Math.floor(r() * 1e6), 0.3), bx, by - h * 0.04, h * 0.24, h * 0.14, tone, { ...light, ambient: 0.2 });
  }
}

const ROAD = '#1c1e24';

// ---------------------------------------------------------------- scenes

export const NEWS_SCENES = {
  /** Container ships queue in morning fog at a lock of the Panama Canal; the lock wall and a towing locomotive in front. */
  canal(c, r) {
    const fogC = '#cfc9bd';
    c.gradient(0, H * 0.62, [[0, '#7c8794'], [0.45, '#b4b4ae'], [0.8, '#d8cfbe'], [1, '#e2d6c0']]);
    c.glow(W * 0.24, H * 0.36, 520, '#f4dcb0', 0.35);
    c.glow(W * 0.24, H * 0.36, 70, '#fff4dc', 0.6, 1.4);
    // far jungle hills, almost lost in the fog
    c.ridge(H * 0.5, 50, 0.0018, mix(hex('#6a7468'), hex(fogC), 0.62), 211, { octaves: 4 });
    c.ridge(H * 0.53, 30, 0.003, mix(hex('#4a5848'), hex(fogC), 0.5), 212, { octaves: 4 });
    // a band of fog lying on the water
    const fz = noise2(213);
    c.paintBox(0, H * 0.4, W, H * 0.64, (x, y) => [hex(fogC), clamp01(0.25 + fz.fbm(x * 0.002, y * 0.012, 4) * 0.5) * smooth(H * 0.4, H * 0.55, y) * smooth(H * 0.66, H * 0.57, y)]);
    // the water of the approach channel
    c.gradient(H * 0.6, H * 0.8, [[0, '#a8a69c'], [1, '#5e6460']]);
    // three ships in a queue, the nearest one entering the lock
    ship(c, r, W * 0.62, H * 0.555, 330, { fog: 0.72, fogColour: fogC });
    ship(c, r, W * 0.36, H * 0.575, 470, { fog: 0.5, fogColour: fogC });
    ship(c, r, W * 0.02, H * 0.625, 760, { fog: 0.18, fogColour: fogC });
    haze(c, H * 0.3, H * 0.62, fogC, 0.0, 0.12);
    reflect(c, H * 0.63, H * 0.8, '#6a6e66', 0.55, 214, { ripple: 5 });
    // the lock wall in front: weathered concrete with a rail track and a towing locomotive
    const cz = noise2(215);
    const concrete = ramp([[0, '#3a3a38'], [0.5, '#7a766c'], [1, '#b4ac9c']]);
    c.paintBox(0, H * 0.8, W, H, (x, y) => [concrete(clamp01(0.62 - (y - H * 0.8) / (H * 0.2) * 0.35 + cz.fbm(x * 0.01, y * 0.04, 4) * 0.25)), 1]);
    c.rect(0, H * 0.8, W, 5, '#c8c0b0');
    for (let x = 0; x < W; x += 70) c.rect(x, H * 0.8, 2, H * 0.2, '#4a4844', 0.4); // expansion joints
    for (const ry of [H * 0.855, H * 0.875]) c.rect(0, ry, W, 3, '#3a3634');
    // the "mule": a squat electric locomotive, lit from the sun on the left
    const mx = W * 0.6;
    const my = H * 0.85;
    const steel = ramp([[0, '#2a3038'], [0.55, '#8a949c'], [1, '#d8dce0']]);
    c.litPoly([[mx, my], [mx + 20, my - 70], [mx + 200, my - 70], [mx + 236, my - 30], [mx + 236, my], [mx, my]], mx + 110, my - 40, 150, 60, steel, { lx: -0.7, ly: -0.5, lz: 0.5, ambient: 0.3 });
    c.rect(mx + 30, my - 62, 60, 24, '#3a4250');
    c.rect(mx + 34, my - 58, 52, 16, mix(hex('#e8dcc0'), hex('#3a4250'), 0.5));
    c.rect(mx + 10, my - 6, 220, 8, '#1c1e22');
    c.line(mx + 210, my - 70, mx + 300, H * 0.6, 3, '#2a2c30', 0.8); // tow cable to the ship
    // bollards and a lamp post along the edge
    for (const bx of [W * 0.12, W * 0.34, W * 0.9]) c.litPoly(blob(bx, H * 0.8 - 8, 14, 16, Math.floor(bx), 0.08), bx, H * 0.8 - 12, 14, 16, ramp([[0, '#141414'], [1, '#6a6460']]), { lx: -0.7, ly: -0.5, lz: 0.4 });
    c.line(W * 0.22, H * 0.8, W * 0.22, H * 0.52, 5, '#2a2a2c');
    c.line(W * 0.22, H * 0.52, W * 0.25, H * 0.51, 4, '#2a2a2c');
  },

  /** Monsoon flooding: brown water fills a street of low houses in a coastal town; people wade under umbrellas (Kerala). */
  flood(c, r) {
    c.gradient(0, H * 0.5, [[0, '#5c6466'], [0.7, '#8c9090'], [1, '#a4a49c']]);
    clouds(c, 221, { y0: 0, y1: H * 0.4, scale: 0.002, cover: 0.0, soft: 0.5, lit: '#a8aaa4', shade: '#4c5254', alpha: 0.7, stretch: 3 });
    // palms behind the houses, grey in the rain
    for (let i = 0; i < 9; i++) palm(c, r, W * (0.05 + i * 0.115 + (r() - 0.5) * 0.04), H * 0.42, 190 + r() * 90, { leaf: '#3a443a', light: '#5a6656', trunk: '#4a4640', alpha: 0.75 });
    haze(c, 0, H * 0.5, '#9a9c96', 0.25, 0.1);
    // two rows of low houses along the street, receding to the right
    const vx = W * 0.72;
    const vy = H * 0.47;
    const walls = ['#c8b08a', '#8aa8a0', '#d8c8a8', '#b88878', '#a8b090', '#d0a070', '#9aa0b0', '#e0d0b8'];
    const tz = noise2(222);
    const house = (x0, x1, top, bottom, colour, roof) => {
      const wall = hex(colour);
      c.paintBox(x0, top, x1, bottom, (x, y) => [mix(mix(wall, hex('#3a3a36'), 0.25 + tz.fbm(x * 0.03, y * 0.05, 3) * 0.12), hex('#8a8c88'), 0.15), 1]);
      // rain stains under the eaves
      c.paintBox(x0, top, x1, top + (bottom - top) * 0.35, (x, y) => [hex('#3a3a34'), 0.2 * smooth(top + (bottom - top) * 0.35, top, y) * (0.6 + tz(x * 0.2, 3) * 0.4)]);
      if (roof) c.poly([[x0 - 8, top + 2], [x0 + (x1 - x0) * 0.15, top - (bottom - top) * 0.32], [x1 - (x1 - x0) * 0.15, top - (bottom - top) * 0.32], [x1 + 8, top + 2]], mix(hex('#7a3e2c'), hex('#5a5c58'), 0.35));
      else c.rect(x0 - 4, top - 6, x1 - x0 + 8, 8, '#4a4a46');
      const dw = (x1 - x0) * 0.16;
      c.rect(x0 + (x1 - x0) * 0.2, top + (bottom - top) * 0.35, dw, (bottom - top) * 0.65, '#2a2a28');
      c.rect(x0 + (x1 - x0) * 0.55, top + (bottom - top) * 0.3, dw * 1.4, (bottom - top) * 0.3, r() < 0.4 ? '#c8a060' : '#262a2c');
    };
    // left side: big near houses down to the vanishing point
    let x = -40;
    let scale = 1;
    while (x < vx - 40) {
      const w = (190 + r() * 80) * scale;
      const h = (300 + r() * 90) * scale;
      const bottom = vy + (H * 0.72 - vy) * scale;
      house(x, Math.min(x + w, vx - 30), bottom - h, bottom, pickOf(r, walls), r() < 0.5);
      x += w + 6 * scale;
      scale *= 0.62;
    }
    // right side: a shorter row
    x = W + 30;
    scale = 0.9;
    while (x > vx + 60) {
      const w = (200 + r() * 60) * scale;
      const h = (260 + r() * 80) * scale;
      const bottom = vy + (H * 0.7 - vy) * scale;
      house(Math.max(x - w, vx + 40), x, bottom - h, bottom, pickOf(r, walls), r() < 0.5);
      x -= w + 8 * scale;
      scale *= 0.6;
    }
    // power lines sagging across the street
    for (const [y0, y1] of [[H * 0.2, H * 0.3], [H * 0.24, H * 0.33]]) {
      for (let k = 0; k < 40; k++) {
        const t0 = k / 40;
        const t1 = (k + 1) / 40;
        const sag = (t) => Math.sin(t * Math.PI) * 26;
        c.line(t0 * W, y0 + (y1 - y0) * t0 + sag(t0), t1 * W, y0 + (y1 - y0) * t1 + sag(t1), 2, '#1e2020', 0.8);
      }
    }
    // the floodwater: muddy, reflecting the street, with drifting debris and rain rings
    const wy = H * 0.66;
    c.gradient(wy, H, [[0, '#7a6a52'], [1, '#4a3e30']]);
    reflect(c, wy, H, '#6a5a44', 0.6, 223, { ripple: 9, stretch: 0.12 });
    const ripples = noise2(224);
    c.paintBox(0, wy, W, H, (px, py) => [hex('#b8aa90'), clamp01(ripples.ridged(px * 0.02, py * 0.06, 3) - 0.62) * 0.6]);
    for (let i = 0; i < 90; i++) {
      const rx = r() * W;
      const ry = wy + r() ** 0.7 * (H - wy);
      const rr = 3 + (ry - wy) * 0.05;
      c.ellipse(rx, ry, rr * 2, rr * 0.5, '#c8bca4', 0.25);
    }
    // an auto-rickshaw stranded to its axles, its yellow roof and black body
    const ax = W * 0.6;
    const ay = H * 0.73;
    c.poly([[ax, ay], [ax + 10, ay - 70], [ax + 130, ay - 76], [ax + 150, ay - 20], [ax + 150, ay], [ax, ay]], '#1c1c1e');
    c.poly([[ax - 6, ay - 70], [ax + 136, ay - 80], [ax + 140, ay - 66], [ax - 2, ay - 58]], mix(hex('#d8a82a'), hex('#6a6a5a'), 0.3));
    c.rect(ax + 20, ay - 58, 60, 30, '#3a4040');
    c.rect(ax - 10, ay - 4, 172, 10, '#6a5a44', 0.8);
    // people wading, the water at their knees
    const people = [
      [W * 0.2, H * 0.83, 150, '#3a3c44', '#2a4a6a'],
      [W * 0.28, H * 0.8, 130, '#5a3a3a', '#1c1c20'],
      [W * 0.44, H * 0.75, 96, '#2a3a3a', null],
      [W * 0.84, H * 0.86, 170, '#4a4436', '#3a2a2a'],
    ];
    for (const [px, py, ph, coat, umb] of people) {
      person(c, px, py, ph, { coat, legs: '#2a2420', umbrella: umb, light: -1, walk: 0.3 });
      // the water line across the legs
      c.paintBox(px - ph * 0.2, py - ph * 0.28, px + ph * 0.2, py + 2, (xx, yy) => [hex('#6e5e48'), 0.92]);
      c.ellipse(px, py - ph * 0.28, ph * 0.2, ph * 0.03, '#a89a80', 0.55);
    }
    rain(c, r, 1400, { slant: 0.12, colour: '#d8dcd8', alpha: 0.16 });
  },

  /** A wildfire on a pine ridge at dusk; a column of smoke lit from below, car lights leaving on the road (Provence). */
  wildfire(c, r) {
    c.gradient(0, H * 0.7, [[0, '#2a2026'], [0.4, '#5a3a32'], [0.75, '#a0603a'], [1, '#c88048']]);
    // the sun, a dull red disc through the smoke
    c.ellipse(W * 0.2, H * 0.3, 34, 34, '#e87a4a', 0.8);
    c.glow(W * 0.2, H * 0.3, 260, '#e07040', 0.2);
    // the smoke column, rising from the ridge and leaning right
    const sm = noise2(231);
    const smoke = ramp([[0, '#241c1e'], [0.4, '#4a3632'], [0.75, '#9a5a3a'], [1, '#e89a5a']]);
    c.paintBox(0, 0, W, H * 0.62, (x, y) => {
      const lift = (H * 0.6 - y) / (H * 0.6);
      const cx = W * 0.58 + lift * lift * 360 + sm(y * 0.004, 7) * 60;
      const spread = 140 + lift * 420;
      const d = Math.abs(x - cx) / spread;
      const v = sm.fbm(x * 0.003, y * 0.004, 5) * 0.75 + (1 - d) * 0.95 - 0.15;
      if (v < 0.35) return null;
      const above = sm.fbm(x * 0.003, (y - 20) * 0.004, 5);
      const rim = clamp01(0.5 + (sm.fbm(x * 0.003, y * 0.004, 5) - above) * 4);
      const heat = clamp01(1 - lift * 1.4) * clamp01(1.3 - d);
      return [smoke(clamp01(heat * 0.85 + rim * 0.25)), smooth(0.35, 0.7, v) * 0.96];
    });
    // the burning ridge: a dark hill of pines, a ragged line of flame along its crest
    const ridgePts = c.ridge(H * 0.6, 60, 0.002, '#141012', 232, { octaves: 4 });
    const crest = (x) => {
      let best = H;
      for (const [px, py] of ridgePts) if (Math.abs(px - x) <= 4) best = Math.min(best, py);
      return best;
    };
    for (let i = 0; i < 70; i++) {
      const px = r() * W;
      pine(c, r, px, crest(px) + 26 + r() * 30, 50 + r() * 40, { tone: ramp([[0, '#0a0808'], [1, '#2a1a14']]) });
    }
    const fl = noise2(233);
    const fire = ramp([[0, '#5a1408'], [0.4, '#c03a10'], [0.75, '#f68a28'], [1, '#ffe0a0']]);
    c.paintBox(W * 0.32, H * 0.3, W * 0.9, H * 0.72, (x, y) => {
      const base = crest(x) + 18;
      const along = smooth(W * 0.32, W * 0.42, x) * smooth(W * 0.9, W * 0.78, x);
      const h = (20 + fl.fbm(x * 0.012, 2, 4) * 40 + Math.max(0, fl(x * 0.006, 9)) * 50) * along;
      const top = base - h * (0.8 + fl(x * 0.05, y * 0.04) * 0.4);
      if (y > base + 4 || y < top) return null;
      const u = clamp01((base - y) / Math.max(6, base - top));
      const a = smooth(1, 0.65, u + fl.fbm(x * 0.04, y * 0.05, 3) * 0.3);
      return a > 0 ? [fire(clamp01(1 - u * 0.7)), a] : null;
    });
    for (let k = 0; k < 7; k++) c.glow(W * (0.38 + k * 0.075), crest(W * (0.38 + k * 0.075)), 220, '#ff6a20', 0.22);
    // embers drifting in the smoke
    sparkle(c, r, 160, W * 0.35, H * 0.15, W * 0.95, H * 0.55, '#ffb060', 0.6, [1, 1, 2]);
    // nearer, unburnt hills and the road out, cars with their lights on
    c.ridge(H * 0.74, 30, 0.003, '#0e0c0e', 234, { octaves: 3 });
    const roadY = (x) => H * 0.86 - (x / W) * H * 0.05;
    for (let x = 0; x < W; x += 2) c.rect(x, roadY(x) - 9, 2, 18, ROAD);
    for (let x = 0; x < W; x += 60) c.rect(x, roadY(x) - 1, 26, 2, '#8a8070', 0.6);
    for (let k = 0; k < 9; k++) {
      const cx = W * (0.08 + k * 0.1 + r() * 0.03);
      const cy = roadY(cx) + 2;
      c.rect(cx - 16, cy - 12, 32, 12, '#121214');
      c.glow(cx - 12, cy - 6, 14, '#ff3a2a', 0.9, 1);
      c.glow(cx + 12, cy - 6, 14, '#ff3a2a', 0.9, 1);
    }
    c.rect(0, H * 0.9, W, H * 0.1, '#0a0a0c');
    // a water-bombing plane low over the hill
    const px = W * 0.3;
    const py = H * 0.4;
    c.poly([[px - 60, py], [px + 70, py - 6], [px + 80, py + 2], [px - 50, py + 8]], '#1a1416');
    c.poly([[px - 10, py - 2], [px + 20, py - 34], [px + 32, py - 32], [px + 16, py + 2]], '#1a1416');
    c.poly([[px - 56, py], [px - 70, py - 22], [px - 60, py - 22], [px - 44, py + 2]], '#1a1416');
  },

  /** A hurricane coming ashore: palms bent flat, surf over the sea wall, rain in sheets (Yucatán coast). */
  hurricane(c, r) {
    c.gradient(0, H * 0.62, [[0, '#1a2224'], [0.5, '#3a4644'], [1, '#6a726a']]);
    // low clouds racing past, stretched by the wind
    clouds(c, 241, { y0: 0, y1: H * 0.55, scale: 0.0016, cover: -0.1, soft: 0.55, lit: '#7a8480', shade: '#1e2626', alpha: 0.9, stretch: 6, lightUp: false });
    const rz = noise2(242);
    // rain sheets: broad, soft diagonal veils
    c.paintBox(0, 0, W, H, (x, y) => [hex('#9aa4a0'), clamp01(rz.fbm((x - y * 0.5) * 0.004, y * 0.0005, 3) * 0.5 + 0.05) * 0.4]);
    // the sea: grey-green, heaving, streaked with foam, breaking over the wall
    const seaY = H * 0.56;
    const sea = ramp([[0, '#1a2624'], [0.5, '#3a4a46'], [1, '#7a8a82']]);
    const sz = noise2(243);
    c.paintBox(0, seaY, W, H * 0.78, (x, y) => {
      const t = (y - seaY) / (H * 0.22);
      const swell = sz.fbm(x * 0.004, y * 0.02, 4);
      const foam = clamp01(sz.ridged(x * 0.008 + y * 0.004, y * 0.03, 3) - 0.55) * 2;
      const base = sea(clamp01(0.3 + swell * 0.4 + t * 0.2));
      return [mix(base, hex('#d8e0dc'), foam * 0.7), 1];
    });
    // the breaking wave against the sea wall: a white burst
    const wz = noise2(244);
    c.paintBox(W * 0.1, H * 0.4, W * 0.9, H * 0.8, (x, y) => {
      const cx = W * 0.46 + wz(y * 0.01, 3) * 50;
      const d = Math.hypot((x - cx) / (W * 0.28), (y - H * 0.7) / (H * 0.26));
      const v = wz.fbm(x * 0.01, y * 0.012, 4) * 0.6 + (1 - d) * 0.9;
      if (v < 0.42) return null;
      return [mix(hex('#9aa8a4'), hex('#eef2ee'), clamp01((v - 0.42) * 2.5)), smooth(0.42, 0.62, v) * 0.9];
    });
    // the promenade wall and its railing
    const wallTop = H * 0.76;
    c.paintBox(0, wallTop, W, H * 0.84, (x, y) => [mix(hex('#4a4a46'), hex('#6a6a62'), clamp01(0.5 + wz(x * 0.05, y * 0.1) * 0.3)), 1]);
    c.rect(0, wallTop, W, 4, '#8a8a80');
    for (let x = 10; x < W; x += 48) c.rect(x, wallTop - 46, 4, 46, '#2a2c2c');
    for (const ry of [wallTop - 46, wallTop - 24]) c.rect(0, ry, W, 3, '#2a2c2c');
    // the street, flooded and shining
    c.gradient(H * 0.84, H, [[0, '#2a3030'], [1, '#141818']]);
    reflect(c, H * 0.84, H, '#1e2424', 0.6, 245, { ripple: 12 });
    // palms bent hard by the wind
    for (const [px, ph] of [[W * 0.1, 420], [W * 0.24, 360], [W * 0.78, 400], [W * 0.92, 340]]) palm(c, r, px, H * 0.86, ph, { wind: 1, leaf: '#1e2a22', light: '#4a5a4c', trunk: '#2e2a26' });
    // a street lamp still burning
    c.line(W * 0.64, H * 0.86, W * 0.64, H * 0.46, 6, '#1a1c1c');
    c.line(W * 0.64, H * 0.46, W * 0.6, H * 0.45, 5, '#1a1c1c');
    c.glow(W * 0.6, H * 0.46, 120, '#f0c888', 0.35);
    c.glow(W * 0.6, H * 0.46, 12, '#fff0d0', 1, 1);
    rain(c, r, 1800, { slant: 0.9, len: [30, 70], colour: '#c8d0cc', alpha: 0.2 });
  },

  /** A great station hall during a rail strike: empty platforms, stopped trains, a departures board full of cancellations. */
  station(c, r) {
    const vx = W * 0.5;
    const vy = H * 0.5;
    // the glazed roof: a pale overcast sky through the panes, iron arches receding
    c.gradient(0, H * 0.5, [[0, '#a8b0b4'], [1, '#d8dad4']]);
    const iron = '#2a2e32';
    for (let k = 0; k < 9; k++) {
      const t = 1 / (1 + k * 0.55); // perspective scale of the k-th arch
      const hw = W * 0.62 * t;
      const top = vy - H * 0.62 * t;
      const steps = 40;
      for (let s = 0; s < steps; s++) {
        const a0 = Math.PI + (s / steps) * Math.PI;
        const a1 = Math.PI + ((s + 1) / steps) * Math.PI;
        c.line(vx + Math.cos(a0) * hw, vy + Math.sin(a0) * (vy - top), vx + Math.cos(a1) * hw, vy + Math.sin(a1) * (vy - top), Math.max(2, 14 * t), iron);
      }
    }
    // the glazing bars converging on the vanishing point
    for (let k = -8; k <= 8; k++) {
      const a = Math.PI * 1.5 + (k / 8) * Math.PI * 0.48;
      c.line(vx + Math.cos(a) * W * 0.62, vy + Math.sin(a) * H * 0.62, vx + Math.cos(a) * 40, vy + Math.sin(a) * 30, 3, iron, 0.7);
    }
    haze(c, 0, H * 0.5, '#c8ccc8', 0.0, 0.15);
    // platforms and tracks: a floor plane in perspective
    const floor = ramp([[0, '#3a3a3a'], [0.5, '#6a6864'], [1, '#8a8680']]);
    const fz = noise2(251);
    c.paintBox(0, vy, W, H, (x, y) => [floor(clamp01(0.3 + (y - vy) / (H - vy) * 0.5 + fz(x * 0.02, y * 0.02) * 0.06)), 1]);
    const ray = (xEdge, colour, w) => c.poly([[vx - 2, vy], [vx + 2, vy], [xEdge + w / 2, H], [xEdge - w / 2, H]], colour);
    // track beds (dark) between the platforms, with rails
    for (const xe of [W * -0.35, W * 1.35]) {
      ray(xe, '#26241f', 300);
      for (const off of [-70, 70]) c.line(vx + off * 0.01, vy, xe + off, H, 3, '#8a8a88', 0.8);
    }
    // the yellow safety lines along the platform edges
    for (const xe of [W * 0.08, W * 0.92]) c.line(vx, vy, xe, H, 4, '#c8a83a', 0.8);
    // two trains standing at the platforms, lights off
    const train = (side, body, stripe) => {
      const near = side < 0 ? 0 : W;
      const pts = [[vx + side * 30, vy - 30], [vx + side * 30, vy + 10], [near, H * 0.86], [near, H * 0.18]];
      const bodyC = hex(body);
      c.poly(pts, '#000', 1, (x, y) => mix(bodyC, hex('#0e1014'), 0.15 + Math.abs(x - near) / W * 0.3));
      // windows: dark bands receding
      for (let k = 0; k < 12; k++) {
        const t0 = k / 12;
        const t1 = (k + 0.7) / 12;
        const lerp = (a, b, t) => a + (b - a) * t;
        const xa = lerp(near, vx + side * 30, t0 ** 0.6);
        const xb = lerp(near, vx + side * 30, t1 ** 0.6);
        const ya0 = lerp(H * 0.3, vy - 22, t0 ** 0.6);
        const ya1 = lerp(H * 0.52, vy - 4, t0 ** 0.6);
        const yb0 = lerp(H * 0.3, vy - 22, t1 ** 0.6);
        const yb1 = lerp(H * 0.52, vy - 4, t1 ** 0.6);
        c.poly([[xa, ya0], [xb, yb0], [xb, yb1], [xa, ya1]], '#14181e');
      }
      c.poly([[near, H * 0.6], [vx + side * 30, vy], [vx + side * 30, vy + 3], [near, H * 0.64]], stripe);
    };
    train(-1, '#8a2a26', '#e8e0d4');
    train(1, '#d8dad8', '#b02a2a');
    // the departures board hanging from the roof: rows of amber, most of them flagged red
    const bx = vx - 150;
    const by = vy - 190;
    c.rect(bx - 10, by - 10, 320, 150, '#0e0e10');
    c.line(bx + 40, by - 10, bx + 40, by - 80, 3, iron);
    c.line(bx + 270, by - 10, bx + 270, by - 80, 3, iron);
    for (let row = 0; row < 8; row++) {
      const y = by + 6 + row * 16;
      const cancelled = r() < 0.75;
      for (let k = 0; k < 18; k++) c.rect(bx + 6 + k * 9, y, 6, 8, '#d89a3a', r() < 0.8 ? 0.8 : 0.3);
      c.rect(bx + 190, y, 100, 8, cancelled ? '#c8402a' : '#6a8a4a', 0.9);
    }
    c.glow(vx, by + 60, 240, '#e0a050', 0.06);
    // a few travellers waiting, in coats, small against the hall
    person(c, W * 0.38, H * 0.8, 120, { coat: '#3a3a40', light: 1 });
    person(c, W * 0.43, H * 0.82, 128, { coat: '#5a4a3a', light: 1, arm: 1 });
    person(c, W * 0.6, H * 0.72, 80, { coat: '#2a3a4a', light: 1 });
    person(c, W * 0.55, H * 0.66, 56, { coat: '#4a3a3a', light: 1 });
    groundShadow(c, W * 0.405, H * 0.81, 70, 8, 0.4);
  },

  /** A central bank's stone façade at dusk, lit from below, glass towers behind and a wet street in front. */
  exchange(c, r) {
    c.gradient(0, H * 0.7, [[0, '#0e1630'], [0.6, '#2a3658'], [1, '#6a5a6a']]);
    // glass towers behind, their window grids lit unevenly
    const towers = [[W * 0.02, 180, H * 0.08], [W * 0.18, 150, H * 0.18], [W * 0.66, 210, H * 0.02], [W * 0.84, 170, H * 0.14]];
    for (const [tx, tw, top] of towers) {
      c.paintBox(tx, top, tx + tw, H * 0.7, (x, y) => [mix(hex('#141c30'), hex('#2a3450'), clamp01((x - tx) / tw)), 1]);
      windows(c, r, tx + 6, top + 10, tx + tw - 6, H * 0.68, { cols: Math.round(tw / 22), rows: Math.round((H * 0.68 - top) / 26), lit: 0.35, on: '#e8d098', off: '#1c2438', cool: '#a8c0d8', glowK: 0.04 });
    }
    haze(c, 0, H * 0.7, '#3a4060', 0.0, 0.2);
    // the bank: a stone block with a colonnade and a pediment, uplit warm
    const x0 = W * 0.26;
    const x1 = W * 0.74;
    const top = H * 0.28;
    const base = H * 0.74;
    const sz = noise2(261);
    const stone = ramp([[0, '#3a3430'], [0.5, '#8a7a66'], [1, '#e8d4b4']]);
    const lightAt = (y) => clamp01(0.25 + smooth(top, base, y) * 0.6);
    c.paintBox(x0, top, x1, base, (x, y) => [stone(clamp01(lightAt(y) + sz.fbm(x * 0.02, y * 0.03, 3) * 0.08)), 1]);
    // the pediment
    c.poly([[x0 - 20, top], [W * 0.5, top - 120], [x1 + 20, top]], '#000', 1, (x, y) => stone(clamp01(0.3 + (y - top + 120) / 400)));
    c.poly([[x0 + 30, top - 10], [W * 0.5, top - 100], [x1 - 30, top - 10]], '#000', 1, () => stone(0.2));
    c.rect(x0 - 24, top - 4, x1 - x0 + 48, 16, '#000', 0.25);
    c.rect(x0 - 24, top, x1 - x0 + 48, 6, mix(stone(0.6), hex('#000000'), 0));
    // columns: lit fronts, shadowed recesses between them
    const n = 8;
    for (let k = 0; k < n; k++) {
      const cx = x0 + 30 + (k / (n - 1)) * (x1 - x0 - 60);
      c.paintBox(cx - 24, top + 30, cx + 24, base - 40, (x, y) => {
        const u = (x - cx) / 24;
        const round = Math.sqrt(Math.max(0, 1 - u * u));
        return [stone(clamp01(lightAt(y) * (0.45 + round * 0.6) + (Math.abs(Math.sin(u * 7)) < 0.15 ? -0.1 : 0))), 1];
      });
      c.rect(cx - 30, top + 22, 60, 10, stone(0.55));
      c.rect(cx - 30, base - 44, 60, 10, stone(0.75));
    }
    // between the columns, the dark doorways and windows
    for (let k = 0; k < n - 1; k++) {
      const cx = x0 + 30 + ((k + 0.5) / (n - 1)) * (x1 - x0 - 60);
      c.rect(cx - 18, top + 70, 36, 120, '#1a1614', 0.85);
      if (k === 3) c.rect(cx - 22, base - 170, 44, 130, '#2a1e14');
    }
    // steps and uplights
    for (let s = 0; s < 5; s++) c.rect(x0 - 40 - s * 12, base - 40 + s * 10, x1 - x0 + 80 + s * 24, 10, stone(0.8 - s * 0.08));
    for (let k = 0; k < 6; k++) c.glow(x0 + (k / 5) * (x1 - x0), base, 160, '#ffcc88', 0.18);
    // the street: wet asphalt, shining
    c.gradient(base + 10, H, [[0, '#1a1c24'], [1, '#0a0c12']]);
    reflect(c, base + 10, H, '#10141e', 0.5, 262, { ripple: 6 });
    // a pair of figures with umbrellas crossing, and a tram light far left
    person(c, W * 0.34, H * 0.94, 140, { coat: '#1e2028', umbrella: '#141418', light: 1, walk: 0.4 });
    person(c, W * 0.62, H * 0.96, 150, { coat: '#2a2224', light: 1, walk: 0.3 });
    for (let k = 0; k < 4; k++) c.glow(W * (0.05 + k * 0.3), H * 0.6, 60, '#f0b070', 0.15);
  },

  /** A city hospital at night: banks of lit windows, the emergency entrance canopy and an ambulance under it. */
  hospital(c, r) {
    c.gradient(0, H * 0.6, [[0, '#0a0e1a'], [1, '#1e2638']]);
    sparkle(c, r, 60, 0, 0, W, H * 0.25, '#a8b0c8', 0.3, [1, 1]);
    // the main block: pale concrete bands and long ribbons of windows
    const x0 = W * 0.06;
    const x1 = W * 0.94;
    const top = H * 0.12;
    const bottom = H * 0.66;
    c.rect(x0, top, x1 - x0, bottom - top, '#2a3040');
    const floors = 7;
    for (let f = 0; f < floors; f++) {
      const y = top + 14 + f * ((bottom - top - 30) / floors);
      c.rect(x0, y - 8, x1 - x0, 8, '#4a5266'); // floor band
      windows(c, r, x0 + 10, y, x1 - 10, y + (bottom - top - 30) / floors - 12, { cols: 26, rows: 1, pad: 0.12, lit: 0.55, on: '#d8e0e8', off: '#141a28', cool: '#f0d8a0', glowK: 0.03 });
    }
    // a lower wing with the emergency entrance
    c.rect(W * 0.3, H * 0.56, W * 0.5, H * 0.18, '#343a4a');
    // the canopy, a thin slab on posts, lit from beneath
    c.rect(W * 0.34, H * 0.6, W * 0.42, 14, '#d8dce0');
    for (const px of [W * 0.36, W * 0.56, W * 0.74]) c.rect(px, H * 0.6 + 14, 8, H * 0.14, '#5a6070');
    c.paintBox(W * 0.34, H * 0.62, W * 0.76, H * 0.74, (x, y) => [hex('#f2eedc'), 0.25 * smooth(H * 0.74, H * 0.62, y)]);
    // the glowing sign panel above the doors (no lettering)
    c.rect(W * 0.46, H * 0.565, 130, 26, '#e8eef4');
    c.glow(W * 0.46 + 65, H * 0.578, 110, '#c8e0ff', 0.3);
    // glass doors with warm light inside
    c.rect(W * 0.47, H * 0.64, 110, H * 0.1, '#e8d8b0');
    c.rect(W * 0.47 + 54, H * 0.64, 2, H * 0.1, '#5a5a50');
    // the ambulance: a white box van with a yellow chequer band, beacons dark
    const ax = W * 0.56;
    const ay = H * 0.8;
    const body = ramp([[0, '#5a6070'], [0.6, '#c8ccd4'], [1, '#f4f6f8']]);
    c.litPoly([[ax, ay], [ax, ay - 110], [ax + 190, ay - 110], [ax + 200, ay - 100], [ax + 200, ay - 70], [ax + 250, ay - 60], [ax + 262, ay - 30], [ax + 262, ay], [ax, ay]], ax + 120, ay - 60, 160, 80, body, { lx: -0.2, ly: -1, lz: 0.4, ambient: 0.35 });
    for (let k = 0; k < 14; k++) c.rect(ax + 4 + k * 18, ay - 44, 9, 10, k % 2 ? '#2a5a9a' : '#e8c83a');
    for (let k = 0; k < 14; k++) c.rect(ax + 13 + k * 18, ay - 34, 9, 10, k % 2 ? '#e8c83a' : '#2a5a9a');
    c.rect(ax + 205, ay - 92, 40, 26, '#1c2430');
    c.rect(ax + 60, ay - 116, 70, 8, '#4a5a7a');
    for (const wx of [ax + 46, ax + 212]) {
      c.ellipse(wx, ay + 2, 22, 22, '#0e0e10');
      c.ellipse(wx, ay + 2, 9, 9, '#5a5a60');
    }
    groundShadow(c, ax + 130, ay + 18, 160, 14, 0.6);
    // the forecourt: wet tarmac with painted bay lines, reflecting the light
    c.gradient(H * 0.74, H, [[0, '#262a34'], [1, '#101218']]);
    for (let k = 0; k < 6; k++) c.line(W * (0.1 + k * 0.17), H * 0.82, W * (0.06 + k * 0.17), H, 3, '#c8c0a0', 0.4);
    reflect(c, H * 0.86, H, '#141822', 0.6, 271, { ripple: 5 });
    // a nurse in scrubs and a man in a coat by the doors
    person(c, W * 0.44, H * 0.75, 84, { coat: '#3a6a7a', legs: '#3a6a7a', light: 1 });
    person(c, W * 0.5, H * 0.755, 88, { coat: '#3a3430', light: 1 });
  },

  /** A car plant at dusk after the closure was announced: sawtooth roofs, a shut gate, an empty car park. */
  factory(c, r) {
    c.gradient(0, H * 0.6, [[0, '#1e2032'], [0.6, '#5a4a5a'], [1, '#c08a6a']]);
    clouds(c, 281, { y0: H * 0.05, y1: H * 0.4, scale: 0.0022, cover: 0.15, lit: '#d8a080', shade: '#3a3448', alpha: 0.7, stretch: 4 });
    // the halls: long low buildings with sawtooth north-light roofs, dark against the sky
    const hall = '#1e1e24';
    const roofY = H * 0.46;
    c.rect(0, roofY, W, H * 0.2, hall);
    for (let x = -20; x < W; x += 64) {
      c.poly([[x, roofY], [x + 44, roofY - 34], [x + 50, roofY - 34], [x + 50, roofY], [x, roofY]], '#26262e');
      c.poly([[x + 44, roofY - 34], [x + 50, roofY - 34], [x + 50, roofY], [x + 46, roofY]], mix(hex('#8a7a7a'), hex(hall), 0.4));
    }
    // a tall chimney and a water tower, no smoke
    c.paintBox(W * 0.72, H * 0.08, W * 0.75, roofY, (x, y) => [mix(hex('#2a2224'), hex('#5a4440'), (x - W * 0.72) / (W * 0.03)), 1]);
    for (let y = H * 0.12; y < roofY; y += 26) c.rect(W * 0.72, y, W * 0.03, 3, '#1a1416');
    c.ellipse(W * 0.2, H * 0.24, 50, 24, '#2a2a30');
    c.rect(W * 0.2 - 50, H * 0.24, 100, 40, '#2a2a30');
    for (const lx of [-40, -12, 12, 40]) c.line(W * 0.2 + lx, H * 0.24 + 40, W * 0.2 + lx * 1.4, roofY, 3, '#1e1e24');
    // a long façade of windows, all dark but one office
    windows(c, r, W * 0.02, roofY + 30, W * 0.98, roofY + 90, { cols: 34, rows: 2, lit: 0.03, on: '#e8c890', off: '#2a2a34', glowK: 0.1 });
    // the car park: empty bays, puddles catching the sky
    c.gradient(H * 0.66, H, [[0, '#3a3438'], [1, '#18161a']]);
    for (let k = 0; k < 16; k++) c.line(W * (0.02 + k * 0.065), H * 0.7, W * (k * 0.065 - 0.05), H * 0.86, 2, '#a89a8a', 0.4);
    const pz = noise2(282);
    c.paintBox(0, H * 0.7, W, H, (x, y) => (pz.fbm(x * 0.004, y * 0.02, 3) > 0.3 ? [mix(hex('#8a6a6a'), hex('#c08a6a'), (y - H * 0.7) / (H * 0.3)), 0.5] : null));
    // the perimeter fence and the closed gate, chained
    for (let x = 0; x < W; x += 6) c.line(x, H * 0.86, x + 6, H * 0.74, 1, '#4a4448', 0.5);
    for (let x = 0; x < W; x += 6) c.line(x, H * 0.74, x + 6, H * 0.86, 1, '#4a4448', 0.5);
    c.rect(0, H * 0.74, W, 3, '#2a2628');
    c.rect(0, H * 0.86, W, 3, '#2a2628');
    for (let x = 0; x < W; x += 120) c.rect(x, H * 0.72, 5, H * 0.15, '#2a2628');
    const gx = W * 0.44;
    c.rect(gx, H * 0.7, 200, 8, '#3a3a40');
    c.rect(gx, H * 0.7, 8, H * 0.17, '#3a3a40');
    c.rect(gx + 192, H * 0.7, 8, H * 0.17, '#3a3a40');
    for (let k = 1; k < 12; k++) c.rect(gx + k * 16, H * 0.71, 3, H * 0.16, '#3a3a40');
    c.line(gx + 90, H * 0.78, gx + 112, H * 0.8, 3, '#8a8a8a');
    // one sodium lamp over the gate
    c.line(gx + 260, H * 0.88, gx + 260, H * 0.5, 5, '#1e1e22');
    c.glow(gx + 250, H * 0.5, 200, '#f0a050', 0.32);
    c.glow(gx + 250, H * 0.5, 10, '#fff0c0', 1, 1);
    c.paintBox(gx - 100, H * 0.7, gx + 400, H, (x, y) => [hex('#f0a050'), 0.12 * Math.max(0, 1 - Math.hypot(x - gx - 250, (y - H * 0.85) * 2) / 300)]);
    // workers by the gate, one holding a blank placard
    person(c, gx - 40, H * 0.9, 120, { coat: '#3a3a44', light: 1 });
    person(c, gx - 80, H * 0.92, 126, { coat: '#4a3a30', light: 1, arm: 1 });
    c.rect(gx - 62, H * 0.92 - 150, 50, 34, '#d8d0c0');
    person(c, gx + 230, H * 0.91, 118, { coat: '#2a3440', light: -1 });
  },
};

// Hard-news pictures keep their colour a little less than daylight scenes.
export const NEWS_GRADES = {
  canal: { saturation: 0.7, tint: 0.12, vignette: 0.32 },
  flood: { saturation: 0.62, tint: 0.16 },
  wildfire: { saturation: 0.85, tint: 0.08 },
  hurricane: { saturation: 0.6, tint: 0.18 },
  station: { saturation: 0.66, tint: 0.14 },
  exchange: { saturation: 0.78, tint: 0.12 },
  hospital: { saturation: 0.7, tint: 0.12 },
  factory: { saturation: 0.72, tint: 0.14 },
};
