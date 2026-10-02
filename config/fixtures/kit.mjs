// Shared painting tools for the offline fixture illustrations (make-images.mjs,
// scenes-news.mjs): skies, haze, trees, shadows, water and glitter, all lit from
// one motivated key light and textured with noise so nothing reads as a bare
// geometric primitive once the channel pixelates it.
import { hex, mix, noise1, noise2, ramp } from './raster.mjs';

export const W = 1280;
export const H = 720;

export const clamp01 = (v) => Math.min(1, Math.max(0, v));
export const smooth = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const pickOf = (r, list) => list[Math.floor(r() * list.length)];

// ---------------------------------------------------------------- shared painting tools

/** Soft cloud field from fractal noise, lit from one side (tops warm, bellies cool). */
export function clouds(c, seed, { y0 = 0, y1 = H * 0.5, scale = 0.003, cover = 0.1, soft = 0.25, lit = '#f2e2cc', shade = '#5a6278', alpha = 0.9, stretch = 2.6, lightUp = true } = {}) {
  const n = noise2(seed);
  const toneOf = ramp([[0, shade], [1, lit]]);
  c.paintBox(0, y0, W, y1, (x, y) => {
    const v = n.fbm(x * scale, y * scale * stretch, 5);
    const d = smooth(cover, cover + soft, v);
    if (d <= 0) return null;
    const above = n.fbm(x * scale, (y - (lightUp ? 14 : -14)) * scale * stretch, 5);
    const light = clamp01(0.55 + (v - above) * 6);
    const fade = smooth(y1, y1 - (y1 - y0) * 0.25, y);
    return [toneOf(light), d * alpha * fade];
  });
}

/** Pull a band of the picture toward the haze colour, more at the bottom of the band (distance). */
export function haze(c, y0, y1, colour, k0, k1) {
  const h = hex(colour);
  c.paintBox(0, y0, W, y1, (x, y) => [h, k0 + (k1 - k0) * clamp01((y - y0) / (y1 - y0))]);
}

/**
 * A broadleaf tree: a tapered, slightly bent trunk with a fork, under a crown
 * of irregular lobes. Lobes at the back are drawn first and darker; each lobe
 * is a rounded volume lit from the key light, with leaf texture from noise.
 */
export function tree(c, r, x, groundY, height, { tone, bark = ramp([[0, '#2a221e'], [1, '#6a5a4c']]), light = { lx: -0.7, ly: -0.5, lz: 0.5 }, crownW = 0.75, lobes = 11, mottled = false } = {}) {
  const leaf = noise2(Math.floor(r() * 1e9));
  const trunkTop = groundY - height * 0.5;
  const lean = (r() - 0.5) * height * 0.12;
  const tw = height * 0.045;
  const trunk = [
    [x - tw, groundY],
    [x - tw * 0.55 + lean * 0.6, trunkTop + height * 0.1],
    [x - tw * 0.3 + lean, trunkTop],
    [x + tw * 0.3 + lean, trunkTop],
    [x + tw * 0.55 + lean * 0.6, trunkTop + height * 0.1],
    [x + tw, groundY],
  ];
  c.litPoly(trunk, x + lean * 0.5, (groundY + trunkTop) / 2, tw * 1.2, height * 0.6, bark, { ...light, ambient: 0.25, jitter: mottled ? (px, py) => (leaf(px * 0.08, py * 0.03) > 0.25 ? 0.35 : 0) : null });
  // two forks into the crown
  for (const side of [-1, 1]) c.line(x + lean, trunkTop + height * 0.04, x + lean + side * height * (0.12 + r() * 0.08), trunkTop - height * 0.12, tw * 0.7, bark(0.25));
  const cx = x + lean;
  const cy = trunkTop - height * 0.22;
  const rx = height * crownW * 0.5;
  const ry = height * 0.36;
  const parts = [];
  for (let i = 0; i < lobes; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r());
    const s = 0.35 + r() * 0.3;
    parts.push({ x: cx + Math.cos(a) * rx * d * 0.7, y: cy + Math.sin(a) * ry * d * 0.6 - ry * 0.05, s, back: Math.sin(a) < -0.2 });
  }
  parts.sort((p, q) => Number(q.back) - Number(p.back) || p.y - q.y);
  // the crown's mass first (dark), so gaps between lobes read as depth, not holes
  c.litPoly(blob(cx, cy, rx * 0.95, ry * 0.85, Math.floor(r() * 1e9), 0.22), cx, cy, rx, ry, tone, { ...light, ambient: 0.05, jitter: () => -0.25 });
  for (const p of parts) {
    const lrx = rx * p.s;
    const lry = ry * p.s * 0.9;
    c.litPoly(blob(p.x, p.y, lrx, lry, Math.floor(r() * 1e9), 0.3), p.x, p.y, lrx, lry, tone, {
      ...light,
      ambient: p.back ? 0.08 : 0.15,
      // leaf clusters, not noise: a coarse pattern of lit and shaded clumps
      jitter: (px, py) => smooth(-0.2, 0.4, leaf(px * 0.045, py * 0.05)) * 0.24 - 0.1 + (p.back ? -0.12 : 0),
    });
  }
}

/** Shadow of something on the ground: a soft, flattened, darkening blob. */
export function groundShadow(c, cx, cy, rx, ry, k = 0.45, colour = '#10141e') {
  const h = hex(colour);
  c.paintBox(cx - rx, cy - ry, cx + rx, cy + ry, (x, y) => {
    const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
    return d < 1 ? [h, k * (1 - d) ** 1.5] : null;
  });
}

/**
 * Water: reflect what is above the waterline (y0) into the rows below, broken
 * up by ripples and darkened toward `colour`; `k` is how much of the water colour shows.
 */
export function reflect(c, y0, y1, colour, k, seed, { ripple = 6, stretch = 0.08 } = {}) {
  const n = noise2(seed);
  const wc = hex(colour);
  const src = c.d.slice();
  c.paintBox(0, y0, c.w, y1, (x, y) => {
    const dy = y - y0;
    const sx = Math.round(x + n(x * 0.004, y * stretch) * ripple * (1 + dy * 0.02));
    const sy = Math.round(y0 - dy * 1.05 - 1 + n(x * 0.02, y * 0.3) * 2);
    if (sy < 0 || sx < 0 || sx >= c.w) return [wc, 1];
    const i = (sy * c.w + sx) * 3;
    const m = clamp01(k + dy / (y1 - y0) * 0.35);
    return [mix([src[i], src[i + 1], src[i + 2]], wc, m), 1];
  });
}

/** Additive dust of tiny highlights (water glitter, embers, stars). */
export function sparkle(c, r, n, x0, y0, x1, y1, colour, strength, sizes = [1, 1, 2]) {
  for (let i = 0; i < n; i++) {
    const x = x0 + r() * (x1 - x0);
    const y = y0 + r() * (y1 - y0);
    c.glow(x, y, pickOf(r, sizes) * 2.2, colour, strength * (0.4 + r() * 0.6), 1);
  }
}
