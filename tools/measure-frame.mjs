#!/usr/bin/env node
// Palette census and CIE L* of named zones in a captured frame (requested by
// docs/programmes/tech-bytes.md §4; owner: STUDIO SET stream).
//
//   node tools/measure-frame.mjs frame.png [--zones "name:x0,y0,x1,y1;..."] [--mask mask.png] [--json]
//
// frame.png  a 384x216 capture (tools/shoot.mjs frame) or any PNG (8-bit RGB/RGBA, any scale:
//            an integer-upscaled capture is read back at 384x216 by sampling pixel centres)
// --zones    rectangles in 384x216 coordinates, exclusive ends; default: the art-direction zones
//            (head zones, wall, sides, the quiet graphics zone, the whole frame)
// --mask     a PNG of the same size whose non-black pixels are EXCLUDED (presenter silhouettes,
//            graphics); render the studio twice (presenters on / off) or use the lab's
//            presenters: false option to measure set pixels only
// Output: per zone the pixel count, mean / min / max L*, the share of each palette colour, the
// share of saturated colours and of off-palette pixels.
//
// Library use: import { readPNG, writePNG, measure, ZONES } from './tools/measure-frame.mjs'.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';

const here = new URL('../public/js/', import.meta.url);
const { P } = await import(new URL('palette.js', here));

// ---------------------------------------------------------------------------
// PNG (8-bit greyscale / RGB / RGBA / palette, non-interlaced)

export function readPNG(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${file}: not a PNG`);
  let p = 8, w = 0, h = 0, depth = 0, type = 0, plte = null, trns = null;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), kind = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (kind === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8];
      type = data[9];
      if (data[12]) throw new Error('interlaced PNG not supported');
    } else if (kind === 'PLTE') plte = data;
    else if (kind === 'tRNS') trns = data;
    else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    p += 12 + len;
  }
  if (depth !== 8) throw new Error('only 8-bit PNGs are supported');
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = new Uint8Array(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? out[y * stride + x - ch] : 0;
      const b = y ? out[(y - 1) * stride + x] : 0;
      const c = x >= ch && y ? out[(y - 1) * stride + x - ch] : 0;
      let v = raw[src + x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + x] = v & 255;
    }
  }
  const px = new Uint32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    let r, g, b, al = 255;
    if (type === 2) [r, g, b] = [out[i * 3], out[i * 3 + 1], out[i * 3 + 2]];
    else if (type === 6) [r, g, b, al] = [out[i * 4], out[i * 4 + 1], out[i * 4 + 2], out[i * 4 + 3]];
    else if (type === 0) r = g = b = out[i];
    else if (type === 4) [r, al] = [out[i * 2], out[i * 2 + 1]], (g = b = r);
    else {
      const k = out[i];
      [r, g, b] = [plte[k * 3], plte[k * 3 + 1], plte[k * 3 + 2]];
      if (trns && k < trns.length) al = trns[k];
    }
    px[i] = ((al << 24) | (b << 16) | (g << 8) | r) >>> 0;
  }
  return { w, h, px };
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (b) => {
  let c = 0xffffffff;
  for (const v of b) c = CRC[(c ^ v) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(kind, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const kd = Buffer.concat([Buffer.from(kind, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(kd));
  return Buffer.concat([len, kd, crc]);
}

/** Write little-endian 0xAABBGGRR pixels as an RGB PNG, optionally upscaled by an integer. */
export function writePNG(file, w, h, px, scale = 1) {
  const W = w * scale, Hh = h * scale;
  const raw = Buffer.alloc((W * 3 + 1) * Hh);
  for (let y = 0; y < Hh; y++) {
    raw[y * (W * 3 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      const c = px[((y / scale) | 0) * w + ((x / scale) | 0)];
      const o = y * (W * 3 + 1) + 1 + x * 3;
      raw[o] = c & 255;
      raw[o + 1] = (c >>> 8) & 255;
      raw[o + 2] = (c >>> 16) & 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(Hh, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

/** Read any PNG back at 384x216 (an integer-upscaled capture is sampled at pixel centres). */
export function readFrame(file, W = 384, H = 216) {
  const img = readPNG(file);
  if (img.w === W && img.h === H) return img;
  const sx = img.w / W, sy = img.h / H;
  const px = new Uint32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px[y * W + x] = img.px[Math.floor((y + 0.5) * sy) * img.w + Math.floor((x + 0.5) * sx)];
  return { w: W, h: H, px };
}

// ---------------------------------------------------------------------------
// Colour facts (the same maths as public/js/v2/canvas25d/studio/color.js, without its imports)

const lin = (v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
export function lstar(c) {
  const Y = 0.2126 * lin(c & 255) + 0.7152 * lin((c >>> 8) & 255) + 0.0722 * lin((c >>> 16) & 255);
  return Y > 216 / 24389 ? 116 * Math.cbrt(Y) - 16 : (24389 / 27) * Y;
}
const NAME = new Map(Object.entries(P).map(([k, hex]) => {
  const n = parseInt(hex.slice(1), 16);
  return [(0xff000000 | ((n & 0xff) << 16) | (n & 0xff00) | ((n >> 16) & 0xff)) >>> 0, k];
}));
export const SATURATED = ['red', 'darkRed', 'rust', 'orange', 'yellow', 'green', 'darkGreen', 'cyan', 'blue', 'navy', 'pink', 'magenta', 'purple'];

/** Art-direction zones (wide shot), 384x216 coordinates, exclusive ends. */
export const ZONES = {
  frame: [0, 0, 384, 216],
  headL: [80, 40, 140, 110],
  headR: [244, 40, 304, 110],
  wall: [140, 18, 244, 80],
  sideL: [0, 0, 60, 150],
  sideR: [324, 0, 384, 150],
  ceiling: [0, 0, 384, 10],
  quiet: [0, 150, 384, 216],
};

/**
 * Measure zones of a frame. px: Uint32 pixels (w x h); mask(i) → true to exclude a pixel.
 * Returns { zone: { n, meanL, minL, maxL, colours: { name: share }, saturated, offPalette } }.
 */
export function measure(px, w, zones = ZONES, mask = null) {
  const out = {};
  for (const [name, [x0, y0, x1, y1]] of Object.entries(zones)) {
    let n = 0, sum = 0, mn = Infinity, mx = -Infinity, off = 0, sat = 0;
    const counts = {};
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * w + x;
        if (mask && mask(i)) continue;
        const c = (px[i] | 0xff000000) >>> 0;
        const L = lstar(c);
        n++;
        sum += L;
        if (L < mn) mn = L;
        if (L > mx) mx = L;
        const nm = NAME.get(c);
        if (!nm) off++;
        else {
          counts[nm] = (counts[nm] || 0) + 1;
          if (SATURATED.includes(nm)) sat++;
        }
      }
    }
    const colours = {};
    for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) colours[k] = +(v / Math.max(1, n)).toFixed(4);
    out[name] = { n, meanL: +(sum / Math.max(1, n)).toFixed(2), minL: +mn.toFixed(1), maxL: +mx.toFixed(1), colours, saturated: +(sat / Math.max(1, n)).toFixed(4), offPalette: +(off / Math.max(1, n)).toFixed(4) };
  }
  return out;
}

function parseZones(s) {
  const z = {};
  for (const part of s.split(';').filter(Boolean)) {
    const [name, rect] = part.split(':');
    z[name.trim()] = rect.split(',').map(Number);
  }
  return z;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('usage: node tools/measure-frame.mjs frame.png [--zones "name:x0,y0,x1,y1;..."] [--mask mask.png] [--json]');
    process.exit(1);
  }
  const opt = (k) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : null;
  };
  const img = readFrame(file);
  let mask = null;
  if (opt('--mask')) {
    const m = readFrame(opt('--mask'));
    mask = (i) => (m.px[i] & 0xffffff) !== 0;
  }
  const res = measure(img.px, img.w, opt('--zones') ? parseZones(opt('--zones')) : ZONES, mask);
  if (args.includes('--json')) console.log(JSON.stringify(res, null, 1));
  else {
    for (const [name, r] of Object.entries(res)) {
      const top = Object.entries(r.colours).slice(0, 5).map(([k, v]) => `${k} ${(v * 100).toFixed(1)}%`).join(', ');
      console.log(`${name.padEnd(8)} n=${String(r.n).padStart(6)}  L* mean ${r.meanL.toFixed(1)} [${r.minL}..${r.maxL}]  sat ${(r.saturated * 100).toFixed(1)}%  off ${(r.offPalette * 100).toFixed(1)}%  ${top}`);
    }
  }
}
