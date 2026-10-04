// Footage in the channel's pixel style (owner 4 Oct: "cargar vídeos, pixelarlos con nuestro estilo"): a video
// frame becomes pixel art the way a photo does (pixelate.js: punchier colour, a small palette of its own,
// ordered Bayer dither), with what moving pictures need on top:
//   - one palette per shot of the clip, not per frame: the k-means palette is taken from the first frame and
//     kept until the picture changes (a cut in the footage), so nothing flickers while the camera moves;
//   - the colour → palette mapping through a 32x32x32 lookup table built once per palette, so a frame costs
//     one table read per pixel (a 192x108 frame in well under a millisecond);
//   - the dither is fixed to the screen (a 4x4 Bayer cell), so a still part of the picture keeps its pattern.
// Pure functions over 0xAABBGGRR pixels (canvas ImageData read as Uint32): no DOM here, so the tests run it.
//
//   gradeInto(src, n, out)              pixelate.js's grade (saturation 1.25, contrast 1.12) into RGB bytes
//   paletteOf(rgb, n, k)                the deterministic k-means palette of a graded frame: { k, rgb, u32 }
//   lutOf(palette)                      its lookup table (Uint8Array 32768: palette index per 5-bit RGB cell)
//   quantise(rgb, w, h, pal, lut, out)  dithered, palette-mapped pixels into out (u32)
// (deck.js keeps a shot's palette until the light's histogram jumps: FOOTAGE.cut)

export const FOOTAGE = { colours: 16, dither: 22, saturation: 1.25, contrast: 1.12, cut: 0.16 };

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);

const clamp8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Grade n pixels of src (u32 0xAABBGGRR) into out (Uint8Array n*3): saturation then contrast, as pixelate.js. */
export function gradeInto(src, n, out, { saturation = FOOTAGE.saturation, contrast = FOOTAGE.contrast } = {}) {
  for (let i = 0; i < n; i++) {
    const c = src[i];
    const r = c & 255, g = (c >>> 8) & 255, b = (c >>> 16) & 255;
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    const o = i * 3;
    out[o] = clamp8(((l + (r - l) * saturation - 128) * contrast + 128) | 0);
    out[o + 1] = clamp8(((l + (g - l) * saturation - 128) * contrast + 128) | 0);
    out[o + 2] = clamp8(((l + (b - l) * saturation - 128) * contrast + 128) | 0);
  }
  return out;
}

/**
 * The frame's palette: k-means on about 3000 samples, deterministic (the first centre is the middle sample,
 * each next the farthest from those chosen; 8 rounds), as wall.js does for a picture.
 */
export function paletteOf(rgb, n, k = FOOTAGE.colours) {
  const step = Math.max(1, Math.floor(n / 3000));
  const C = new Float32Array(k * 3);
  const mid = Math.floor(Math.floor(n / step) / 2) * step * 3;
  C[0] = rgb[mid];
  C[1] = rgb[mid + 1];
  C[2] = rgb[mid + 2];
  let kk = 1;
  while (kk < k) {
    let best = -1, bd = 0;
    for (let i = 0; i < n; i += step * 7) {
      const o = i * 3;
      let d = Infinity;
      for (let c = 0; c < kk; c++) {
        const dr = rgb[o] - C[c * 3], dg = rgb[o + 1] - C[c * 3 + 1], db = rgb[o + 2] - C[c * 3 + 2];
        const e = dr * dr + dg * dg + db * db;
        if (e < d) d = e;
      }
      if (d > bd) {
        bd = d;
        best = o;
      }
    }
    if (best < 0) break; // fewer distinct colours than k
    C[kk * 3] = rgb[best];
    C[kk * 3 + 1] = rgb[best + 1];
    C[kk * 3 + 2] = rgb[best + 2];
    kk++;
  }
  const S = new Float64Array(kk * 4);
  for (let it = 0; it < 8; it++) {
    S.fill(0);
    for (let i = 0; i < n; i += step) {
      const o = i * 3;
      let bi = 0, bd = Infinity;
      for (let c = 0; c < kk; c++) {
        const dr = rgb[o] - C[c * 3], dg = rgb[o + 1] - C[c * 3 + 1], db = rgb[o + 2] - C[c * 3 + 2];
        const e = dr * dr + dg * dg + db * db;
        if (e < bd) {
          bd = e;
          bi = c;
        }
      }
      S[bi * 4] += rgb[o];
      S[bi * 4 + 1] += rgb[o + 1];
      S[bi * 4 + 2] += rgb[o + 2];
      S[bi * 4 + 3]++;
    }
    for (let c = 0; c < kk; c++) {
      const m = S[c * 4 + 3];
      if (m) for (let j = 0; j < 3; j++) C[c * 3 + j] = S[c * 4 + j] / m;
    }
  }
  const out = new Uint8Array(kk * 3), u32 = new Uint32Array(kk);
  for (let c = 0; c < kk; c++) {
    const r = Math.round(C[c * 3]), g = Math.round(C[c * 3 + 1]), b = Math.round(C[c * 3 + 2]);
    out[c * 3] = r;
    out[c * 3 + 1] = g;
    out[c * 3 + 2] = b;
    u32[c] = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
  }
  return { k: kk, rgb: out, u32 };
}

/** A fixed palette (the channel's P, say) as a palette record: hex strings → { k, rgb, u32 }. */
export function paletteFrom(hexes) {
  const k = hexes.length, rgb = new Uint8Array(k * 3), u32 = new Uint32Array(k);
  hexes.forEach((h, c) => {
    const v = parseInt(String(h).replace('#', ''), 16);
    const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
    rgb[c * 3] = r;
    rgb[c * 3 + 1] = g;
    rgb[c * 3 + 2] = b;
    u32[c] = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
  });
  return { k, rgb, u32 };
}

/** The palette's lookup table: for each 5-bit RGB cell (its centre), the nearest colour by the eye's weights. */
export function lutOf(pal) {
  const lut = new Uint8Array(32768);
  const P = pal.rgb, k = pal.k;
  for (let r = 0; r < 32; r++) {
    const R = r * 8 + 4;
    for (let g = 0; g < 32; g++) {
      const G = g * 8 + 4;
      for (let b = 0; b < 32; b++) {
        const B = b * 8 + 4;
        let bi = 0, bd = Infinity;
        for (let c = 0; c < k; c++) {
          const dr = R - P[c * 3], dg = G - P[c * 3 + 1], db = B - P[c * 3 + 2];
          // pixelate.js's weights: a dark blue step costs less than a green one
          const e = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
          if (e < bd) {
            bd = e;
            bi = c;
          }
        }
        lut[(r << 10) | (g << 5) | b] = bi;
      }
    }
  }
  return lut;
}

/** Dithered, palette-mapped pixels of the graded frame rgb (w*h*3) into out (u32 w*h). */
export function quantise(rgb, w, h, pal, lut, out, dither = FOOTAGE.dither) {
  const U = pal.u32;
  for (let y = 0; y < h; y++) {
    const by = (y & 3) << 2;
    for (let x = 0; x < w; x++) {
      const i = y * w + x, o = i * 3;
      const t = BAYER[by | (x & 3)] * dither;
      const r = clamp8(rgb[o] + t) >> 3, g = clamp8(rgb[o + 1] + t) >> 3, b = clamp8(rgb[o + 2] + t) >> 3;
      out[i] = U[lut[(r << 10) | (g << 5) | b]];
    }
  }
  return out;
}
