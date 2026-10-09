// Turns a photo into pixel art: cover-crop, downscale, boost contrast,
// reduce to an adaptive palette (k-means) and apply ordered (Bayer) dithering.

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);

function coverDraw(ctx, img, w, h, focusY = 0.4) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const scale = Math.max(w / iw, h / ih);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (iw - sw) / 2;
  const sy = Math.max(0, Math.min(ih - sh, (ih - sh) * focusY));
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
}

function kmeans(data, k, iterations = 8) {
  // Sample pixels for speed
  const samples = [];
  const step = Math.max(1, Math.floor(data.length / 4 / 3000));
  for (let i = 0; i < data.length; i += 4 * step) samples.push([data[i], data[i + 1], data[i + 2]]);
  // k-means++ style init: spread centers by picking far-away samples
  const centers = [samples[Math.floor(samples.length / 2)].slice()];
  while (centers.length < k) {
    let best = null;
    let bestD = -1;
    for (let i = 0; i < samples.length; i += 7) {
      const s = samples[i];
      let d = Infinity;
      for (const c of centers) d = Math.min(d, (s[0] - c[0]) ** 2 + (s[1] - c[1]) ** 2 + (s[2] - c[2]) ** 2);
      if (d > bestD) {
        bestD = d;
        best = s;
      }
    }
    centers.push(best.slice());
  }
  for (let it = 0; it < iterations; it++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (const s of samples) {
      let bi = 0;
      let bd = Infinity;
      for (let c = 0; c < k; c++) {
        const cc = centers[c];
        const d = (s[0] - cc[0]) ** 2 + (s[1] - cc[1]) ** 2 + (s[2] - cc[2]) ** 2;
        if (d < bd) {
          bd = d;
          bi = c;
        }
      }
      const sum = sums[bi];
      sum[0] += s[0];
      sum[1] += s[1];
      sum[2] += s[2];
      sum[3]++;
    }
    sums.forEach((sum, c) => {
      if (sum[3]) centers[c] = [sum[0] / sum[3], sum[1] / sum[3], sum[2] / sum[3]];
    });
  }
  return centers.map((c) => c.map(Math.round));
}

/**
 * @param {HTMLImageElement} img
 * @param {number} w  output width in pixels
 * @param {number} h  output height in pixels
 * @returns {HTMLCanvasElement}
 */
// focusY: where the crop sits on a picture taller than the frame (0 top, 1 bottom); a portrait keeps the face (0.18)
export function pixelate(img, w, h, { colors = 16, dither = 22, contrast = 1.12, saturation = 1.25, focusY = 0.4 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  coverDraw(ctx, img, w, h, Number.isFinite(focusY) ? focusY : 0.4);
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;

  // Punchier colors read better at low resolution
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    for (let c = 0; c < 3; c++) {
      let v = l + (d[i + c] - l) * saturation;
      v = (v - 128) * contrast + 128;
      d[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }

  const palette = kmeans(d, colors);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const t = BAYER4[(y & 3) * 4 + (x & 3)] * dither;
      const r = d[i] + t;
      const g = d[i + 1] + t;
      const b = d[i + 2] + t;
      let best = palette[0];
      let bd = Infinity;
      for (const p of palette) {
        const dist = (r - p[0]) ** 2 * 0.3 + (g - p[1]) ** 2 * 0.59 + (b - p[2]) ** 2 * 0.11;
        if (dist < bd) {
          bd = dist;
          best = p;
        }
      }
      d[i] = best[0];
      d[i + 1] = best[1];
      d[i + 2] = best[2];
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`no se pudo cargar ${src}`));
    img.src = src;
  });
}
