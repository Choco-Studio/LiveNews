// A tiny software rasterizer and PNG encoder (no dependencies) used to paint
// the original illustrations of the offline fixture stories. Scenes are drawn
// at twice the output size with hard edges and box-filtered down, which gives
// soft anti-aliased shapes that the channel's pixelate filter turns into
// clean pixel art.
import zlib from 'node:zlib';

export const hex = (h) => {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const col = (c) => (typeof c === 'string' ? hex(c) : c);

/** Deterministic PRNG (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth 1D value noise in [-1, 1]. */
export function noise1(seed) {
  const r = rng(seed);
  const table = Array.from({ length: 256 }, () => r() * 2 - 1);
  return (x) => {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    return table[i & 255] * (1 - u) + table[(i + 1) & 255] * u;
  };
}

/** Smooth 2D value noise in [-1, 1], with `fbm(x, y, octaves)` (fractal sum) and `ridged(...)`. */
export function noise2(seed) {
  const r = rng(seed);
  const perm = Uint8Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const vals = Float32Array.from({ length: 256 }, () => r() * 2 - 1);
  const at = (ix, iy) => vals[perm[(perm[ix & 255] + iy) & 255]];
  const n = (x, y) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * ux;
    const b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * ux;
    return a + (b - a) * uy;
  };
  n.fbm = (x, y, octaves = 4, lacunarity = 2.03, gain = 0.5) => {
    let v = 0;
    let amp = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      v += n(x + o * 17.3, y - o * 9.1) * amp;
      norm += amp;
      x *= lacunarity;
      y *= lacunarity;
      amp *= gain;
    }
    return v / norm;
  };
  n.ridged = (x, y, octaves = 4) => {
    let v = 0;
    let amp = 0.5;
    for (let o = 0; o < octaves; o++) {
      v += (1 - Math.abs(n(x + o * 13.7, y + o * 7.9))) ** 2 * amp;
      x *= 2.07;
      y *= 2.07;
      amp *= 0.5;
    }
    return v;
  };
  return n;
}

/**
 * A colour ramp through stops [[t, colour], ...] (t 0..1): build 3-4 tone
 * hue-shifted ramps (cool, desaturated shadows; warm, light highlights).
 */
export function ramp(stops) {
  const s = stops.map(([t, c]) => [t, typeof c === 'string' ? hex(c) : c]);
  return (t) => {
    t = Math.min(1, Math.max(0, t));
    let k = 0;
    while (k < s.length - 2 && t > s[k + 1][0]) k++;
    const [ta, ca] = s[k];
    const [tb, cb] = s[k + 1];
    return mix(ca, cb, Math.min(1, Math.max(0, (t - ta) / Math.max(1e-6, tb - ta))));
  };
}

/** An organic outline around (cx, cy): an ellipse whose radius wanders with noise (bushes, rocks, clouds, crowns). */
export function blob(cx, cy, rx, ry, seed, rough = 0.25, n = 56) {
  const nz = noise1(seed);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + rough * (nz(i * 0.55) * 0.7 + nz(i * 1.9 + 40) * 0.3);
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return pts;
}

export class Canvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.d = new Float32Array(w * h * 3);
  }

  blend(x, y, c, a = 1) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const i = (y * this.w + x) * 3;
    const d = this.d;
    d[i] += (c[0] - d[i]) * a;
    d[i + 1] += (c[1] - d[i + 1]) * a;
    d[i + 2] += (c[2] - d[i + 2]) * a;
  }

  add(x, y, c, k) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    this.d[i] += c[0] * k;
    this.d[i + 1] += c[1] * k;
    this.d[i + 2] += c[2] * k;
  }

  fill(c) {
    c = col(c);
    for (let i = 0; i < this.d.length; i += 3) this.d.set(c, i);
  }

  /** Vertical gradient through colour stops [[t, colour], ...] over rows y0..y1. */
  gradient(y0, y1, stops, x0 = 0, x1 = this.w) {
    const s = stops.map(([t, c]) => [t, col(c)]);
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(this.h, y1); y++) {
      const t = (y - y0) / Math.max(1, y1 - y0);
      let k = 0;
      while (k < s.length - 2 && t > s[k + 1][0]) k++;
      const [ta, ca] = s[k];
      const [tb, cb] = s[k + 1];
      const c = mix(ca, cb, Math.min(1, Math.max(0, (t - ta) / Math.max(1e-6, tb - ta))));
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(this.w, x1); x++) this.blend(x, y, c, 1);
    }
  }

  rect(x, y, w, h, c, a = 1) {
    c = col(c);
    for (let yy = Math.max(0, Math.round(y)); yy < Math.min(this.h, Math.round(y + h)); yy++) {
      for (let xx = Math.max(0, Math.round(x)); xx < Math.min(this.w, Math.round(x + w)); xx++) this.blend(xx, yy, c, a);
    }
  }

  /** Even-odd scanline fill of a polygon [[x, y], ...]; `shade(x, y)` may return a per-pixel colour. */
  poly(pts, c, a = 1, shade = null) {
    c = col(c);
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of pts) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const xs = [];
    for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(this.h - 1, Math.ceil(maxY)); y++) {
      const cy = y + 0.5;
      xs.length = 0;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i];
        const [xj, yj] = pts[j];
        if (yi > cy !== yj > cy) xs.push(xi + ((cy - yi) / (yj - yi)) * (xj - xi));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const from = Math.max(0, Math.ceil(xs[k] - 0.5));
        const to = Math.min(this.w - 1, Math.floor(xs[k + 1] - 0.5));
        for (let x = from; x <= to; x++) this.blend(x, y, shade ? shade(x, y) : c, a);
      }
    }
  }

  ellipse(cx, cy, rx, ry, c, a = 1, shade = null) {
    c = col(c);
    for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(this.h - 1, Math.ceil(cy + ry)); y++) {
      const dy = (y + 0.5 - cy) / ry;
      if (Math.abs(dy) > 1) continue;
      const half = rx * Math.sqrt(1 - dy * dy);
      for (let x = Math.max(0, Math.ceil(cx - half - 0.5)); x <= Math.min(this.w - 1, Math.floor(cx + half - 0.5)); x++) {
        this.blend(x, y, shade ? shade(x, y) : c, a);
      }
    }
  }

  circle(cx, cy, r, c, a = 1, shade = null) {
    this.ellipse(cx, cy, r, r, c, a, shade);
  }

  /** Run `fn(x, y)` -> [colour, alpha] | null over a box: clouds, smoke, water, textures. */
  paintBox(x0, y0, x1, y1, fn) {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(this.h, Math.ceil(y1)); y++) {
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(this.w, Math.ceil(x1)); x++) {
        const out = fn(x, y);
        if (out) this.blend(x, y, out[0], out[1] ?? 1);
      }
    }
  }

  /**
   * A lit volume: the polygon is shaded as a rounded form inside the ellipse
   * (cx, cy, rx, ry) by a light from direction (lx, ly) (screen space, z up),
   * through `tone(t)` (0 = core shadow .. 1 = highlight). `jitter(x, y)` adds
   * texture (leaves, rock) to the light value.
   */
  litPoly(pts, cx, cy, rx, ry, tone, { lx = -0.6, ly = -0.6, lz = 0.5, ambient = 0.18, jitter = null, a = 1 } = {}) {
    const len = Math.hypot(lx, ly, lz);
    const L = [lx / len, ly / len, lz / len];
    this.poly(pts, '#000000', a, (x, y) => {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      const d = Math.min(1, nx * nx + ny * ny);
      const nz = Math.sqrt(1 - d);
      let lit = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
      lit = ambient + (1 - ambient) * lit;
      if (jitter) lit += jitter(x, y);
      return tone(lit);
    });
  }

  /** A thick line as a quad. */
  line(x0, y0, x1, y1, width, c, a = 1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * (width / 2);
    const ny = (dx / len) * (width / 2);
    this.poly(
      [
        [x0 + nx, y0 + ny],
        [x1 + nx, y1 + ny],
        [x1 - nx, y1 - ny],
        [x0 - nx, y0 - ny],
      ],
      c,
      a
    );
  }

  /** Additive radial light: brightest at the centre, falling to nothing at r. */
  glow(cx, cy, r, c, strength = 1, power = 2) {
    c = col(c);
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(this.h - 1, Math.ceil(cy + r)); y++) {
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(this.w - 1, Math.ceil(cx + r)); x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
        if (d < 1) this.add(x, y, c, strength * (1 - d) ** power);
      }
    }
  }

  /** A filled band under a noisy ridge line: hills, mountains, waves, canopies. */
  ridge(baseY, amp, freq, c, seed, { bottom = this.h, octaves = 3, sharp = false, shade = null } = {}) {
    const n = noise1(seed);
    const pts = [[0, bottom]];
    for (let x = 0; x <= this.w; x += 4) {
      let v = 0;
      let f = freq;
      let a = 1;
      for (let o = 0; o < octaves; o++) {
        const s = n(x * f + o * 37.1);
        v += (sharp ? 1 - Math.abs(s) * 2 : s) * a;
        f *= 2.1;
        a *= 0.45;
      }
      pts.push([x, baseY - v * amp]);
    }
    pts.push([this.w, bottom]);
    this.poly(pts, c, 1, shade);
    return pts;
  }

  /**
   * Photographic colour grade: pull saturation down, tint the shadows cool and
   * the highlights warm, add a gentle S-curve and a vignette. Keeps the
   * illustrations sober (news pictures, not posters) after the channel's
   * pixelate filter boosts saturation again.
   */
  grade({ saturation = 0.62, shadow = '#16203a', highlight = '#fff1dc', tint = 0.22, contrast = 0.12, vignette = 0.38 } = {}) {
    const sh = hex(shadow);
    const hi = hex(highlight);
    const { w, h, d } = this;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 3;
        let r = d[i] / 255;
        let g = d[i + 1] / 255;
        let b = d[i + 2] / 255;
        const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        r = l + (r - l) * saturation;
        g = l + (g - l) * saturation;
        b = l + (b - l) * saturation;
        const ks = tint * (1 - l) ** 2;
        const kh = tint * 0.5 * l * l;
        r += (sh[0] / 255 - r) * ks + (hi[0] / 255 - r) * kh;
        g += (sh[1] / 255 - g) * ks + (hi[1] / 255 - g) * kh;
        b += (sh[2] / 255 - b) * ks + (hi[2] / 255 - b) * kh;
        const curve = (v) => v + contrast * (v - 0.5) * (1 - Math.abs(2 * v - 1));
        const dx = (x + 0.5) / w - 0.5;
        const dy = (y + 0.5) / h - 0.5;
        const v = 1 - vignette * Math.min(1, (dx * dx + dy * dy) * 2.2) ** 1.5;
        d[i] = curve(r) * v * 255;
        d[i + 1] = curve(g) * v * 255;
        d[i + 2] = curve(b) * v * 255;
      }
    }
    return this;
  }

  /** Box-filter down by an integer factor. */
  downsample(k) {
    const out = new Canvas(Math.floor(this.w / k), Math.floor(this.h / k));
    for (let y = 0; y < out.h; y++) {
      for (let x = 0; x < out.w; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        for (let j = 0; j < k; j++) {
          for (let i = 0; i < k; i++) {
            const p = ((y * k + j) * this.w + x * k + i) * 3;
            r += this.d[p];
            g += this.d[p + 1];
            b += this.d[p + 2];
          }
        }
        const q = (y * out.w + x) * 3;
        out.d[q] = r / (k * k);
        out.d[q + 1] = g / (k * k);
        out.d[q + 2] = b / (k * k);
      }
    }
    return out;
  }
}

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** Encode a canvas as an 8-bit RGB PNG. */
export function encodePng(canvas) {
  const { w, h, d } = canvas;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w * 3; x++) raw[y * (w * 3 + 1) + 1 + x] = Math.max(0, Math.min(255, Math.round(d[y * w * 3 + x])));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
