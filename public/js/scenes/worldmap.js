// Animated locator world map (the "cut to the map" shot for world stories) and
// its small sibling for the studio video wall.
//
//   drawWorldMap(ctx, t, dt, { lat, lon, place, x, y, w, h, mini, label, now })
//     full-screen: w 384, h 216 (default). Fly-in 0-1.7 s on an eased arc, the
//     pin drops with a small bounce at 1.7 s and sends two ripples, the place
//     label wipes in at 2.1 s, neighbouring countries are named at 2.5 s; then
//     everything holds still.
//     mini (video wall locator, e.g. x 140, y 18, w 104, h 62, mini: true): the
//     same fly-in, a small pin and a micro place tag along the bottom.
//     No lat/lon: an idle world view panning by whole pixels, London marked.
//     now: epoch ms for the day/night terminator (default: the graphics clock).
//
// Every output pixel is shaded individually from the view: the land mask
// (Natural Earth, 4096x2048 bit-packed, plus a box-filtered mip pyramid) is
// sampled and thresholded so coastlines are crisp at every zoom, borders are
// vector polylines rasterised as 1 px lines, and all colours are exact palette
// colours (Bayer 4x4 between adjacent steps for depth, terrain and the night
// side). The base layer is rebuilt only when the view changes; when the view
// holds still the finished frame is reused as is.
import { P } from '../palette.js';
import { drawText, measureText } from '../font.js';
import { clamp, seg, easeOutQuint, easeInOut, easeInOutSine, dropBounce, ringPts, memo, nowMs, ellipsis, wrapLines } from '../gfx/index.js';
import { mulberry32 } from '../util.js';
import { LAND, BORDERS } from './worlddata.js';

const DEG = Math.PI / 180;
const FLY_T = 1.7; // seconds of fly-in (world -> target)
const PIN_T = 1.7; // pin starts to drop
const PIN_DROP = 0.5; // drop + bounce duration
const LABEL_T = PIN_T + 0.4; // label wipes in
const CONTEXT_T = LABEL_T + 0.4; // neighbouring countries are named
const START_LON_OFFSET = 24; // the fly starts this many degrees west of the target
const cached = memo(64);

// ---------------------------------------------------------------------------------------------
// Colours: exact palette colours only. Each tone has a lighter step (graticule), a darker step
// (borders, coastline) and night versions one step down.
// ---------------------------------------------------------------------------------------------
const pack = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return (0xff000000 | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0;
};
const T_SPACE = 0, T_STAR = 1, T_STAR2 = 2, T_DEEP = 3, T_OCEAN = 4, T_HALO = 5, T_LAND0 = 7, T_LAND1 = 11;
// [base, light, dark, night, nightLight, nightDark]. The map speaks the same language as the
// WORLD NOW globe: a navy-to-ink sea, land in neutral steps (lowland steel, dry land fog, ice
// silver), red only for the pin; city lights are the one warm note on the night side.
const TONES = {
  [T_SPACE]: ['black', 'black', 'black', 'black', 'black', 'black'],
  [T_STAR]: ['fog', 'fog', 'fog', 'fog', 'fog', 'fog'],
  [T_STAR2]: ['steel', 'steel', 'steel', 'steel', 'steel', 'steel'],
  [T_DEEP]: ['ink', 'slate', 'black', 'black', 'ink', 'black'],
  [T_OCEAN]: ['navy', 'slate', 'ink', 'ink', 'slate', 'black'],
  [T_HALO]: ['navy', 'navy', 'ink', 'ink', 'ink', 'black'],
  7: ['steel', 'steel', 'slate', 'slate', 'slate', 'ink'], // forest
  8: ['steel', 'steel', 'slate', 'slate', 'slate', 'ink'], // grass
  9: ['fog', 'fog', 'steel', 'steel', 'steel', 'slate'], // arid
  10: ['fog', 'fog', 'steel', 'steel', 'steel', 'slate'], // desert, tundra
  11: ['silver', 'silver', 'fog', 'fog', 'fog', 'steel'], // ice
};
// index = night << 7 | variant << 4 | tone; variant 0 plain, 1 minor graticule, 2 major graticule, 3 border/coast
const PAL = new Uint32Array(256);
for (let t = 0; t < 16; t++) {
  const row = TONES[t] || TONES[T_SPACE];
  for (let v = 0; v < 4; v++) {
    const day = v === 0 ? row[0] : v === 3 ? row[2] : row[1];
    const night = v === 0 ? row[3] : v === 3 ? row[5] : row[4];
    PAL[(v << 4) | t] = pack(P[day]);
    PAL[128 | (v << 4) | t] = pack(P[night]);
  }
}
const RGB = Object.fromEntries(['red', 'darkRed', 'maroon', 'pink', 'white', 'black', 'yellow', 'orange', 'cream', 'silver'].map((k) => [k, pack(P[k])]));

// Bayer 4x4 thresholds (0..1 and 0..255)
const B4 = Float32Array.from([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], (v) => (v + 0.5) / 16);
const B4_255 = Uint8Array.from(B4, (v) => Math.floor(v * 255));

// ---------------------------------------------------------------------------------------------
// Noise helpers (used once at load time for terrain tones and ocean depth)
// ---------------------------------------------------------------------------------------------
function hash2(ix, iy) {
  let h = (Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, oct = 4) {
  let a = 0.5, s = 0, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f); norm += a; f *= 2; a *= 0.5; }
  return s / norm;
}

// ---------------------------------------------------------------------------------------------
// Geometry data (lazy, staged so that the one-off cost does not land in a single frame)
// ---------------------------------------------------------------------------------------------
const TW = 720, TH = 360; // terrain-tone field: 0.5 deg cells
const GEO = { mips: null, texel0: 360 / LAND.w, terrain: null, depth: null, lines: null, lights: null };

function b64(s) {
  const bin = atob(s);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < a.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}

/**
 * Decodes the land RLE (per row: alternating ocean/land runs, LEB128 varints) into a bit-packed
 * mask, 1 bit per pixel (1 MB instead of 8). Every read is bounds-checked: a truncated or corrupt
 * stream ends the current row (and the decode) instead of reading or writing out of range.
 */
export function decodeLandBits(rle, W, H) {
  const bin = typeof rle === 'string' ? b64(rle) : rle;
  const stride = W >> 3;
  const bits = new Uint8Array(stride * H);
  const n = bin.length;
  let p = 0;
  for (let j = 0; j < H && p < n; j++) {
    const row = j * stride;
    let x = 0, cur = 0;
    while (x < W && p < n) {
      let run = 0, shift = 0, b = 0;
      do {
        b = bin[p++];
        run += (b & 127) * 2 ** shift;
        shift += 7;
      } while (b & 128 && p < n && shift < 35);
      if (run > W - x) run = W - x; // never past the end of the row
      if (cur && run > 0) {
        let a = x;
        const e = x + run;
        while (a < e && a & 7) { bits[row + (a >> 3)] |= 1 << (a & 7); a++; }
        while (a + 8 <= e) { bits[row + (a >> 3)] = 255; a += 8; }
        while (a < e) { bits[row + (a >> 3)] |= 1 << (a & 7); a++; }
      }
      x += run;
      cur ^= 1;
    }
  }
  return { w: W, h: H, stride, bits };
}

function* stageLand() {
  const W = LAND.w, H = LAND.h;
  const L0 = decodeLandBits(LAND.rle, W, H);
  yield;
  // level 1 straight from the bits (coverage 0..255 of each 2x2 block), then box-filtered levels
  const w1 = W >> 1, h1 = H >> 1, d1 = new Uint8Array(w1 * h1), st = L0.stride, bits = L0.bits;
  for (let y = 0; y < h1; y++) {
    const r0 = 2 * y * st, r1 = r0 + st;
    for (let x = 0; x < w1; x++) {
      const bx = 2 * x, byte = bx >> 3, sh = bx & 7;
      const c = ((bits[r0 + byte] >> sh) & 1) + ((bits[r0 + byte] >> (sh + 1)) & 1) + ((bits[r1 + byte] >> sh) & 1) + ((bits[r1 + byte] >> (sh + 1)) & 1);
      d1[y * w1 + x] = (c * 255 + 2) >> 2;
    }
  }
  yield;
  const mips = [L0, { w: w1, h: h1, d: d1 }];
  for (let l = 2; l <= 6; l++) {
    const q = mips[l - 1], nw = q.w >> 1, nh = q.h >> 1, d = new Uint8Array(nw * nh);
    for (let y = 0; y < nh; y++) {
      const r0 = 2 * y * q.w, r1 = r0 + q.w;
      for (let x = 0; x < nw; x++) {
        const k = 2 * x;
        d[y * nw + x] = (q.d[r0 + k] + q.d[r0 + k + 1] + q.d[r1 + k] + q.d[r1 + k + 1] + 2) >> 2;
      }
    }
    mips.push({ w: nw, h: nh, d });
  }
  GEO.mips = mips;
}

// Hand-placed climate hints [lon, lat, rx, ry, amount]; positive = drier, negative = wetter/greener.
const REGIONS = [
  // deserts and dry lands
  [8, 23, 28, 7, 0.55], [-6, 22, 12, 6, 0.5], [28, 26, 10, 5, 0.45], [0, 15, 30, 3, 0.16], [46, 24, 11, 8, 0.55], [55, 32, 9, 6, 0.34],
  [66, 30, 7, 4, 0.32], [71, 27, 3.5, 3, 0.3], [84, 40, 7, 3, 0.45], [105, 43, 14, 5, 0.45], [65, 46, 14, 5, 0.2], [98, 47, 12, 4, 0.18],
  [45, 6, 5, 4, 0.28], [20, -24, 7, 6, 0.45], [14, -23, 2, 5, 0.3], [22, -31, 5, 3, 0.22], [130, -25, 20, 8, 0.5], [-70, -22, 2.5, 7, 0.5],
  [-69, -44, 4, 8, 0.28], [-66, -30, 5, 6, 0.2], [-110, 31, 7, 5, 0.42], [-116, 38, 5, 6, 0.34], [-102, 40, 5, 10, 0.08], [34, 39, 6, 2.5, 0.18],
  [-4, 40, 3, 2, 0.08], [37, 16, 5, 4, 0.18], [40, -2, 3, 4, 0.16],
  // wet and forested lands
  [-62, -4, 12, 7, -0.36], [22, 0, 9, 6, -0.32], [-5, 7, 8, 3, -0.18], [102, 16, 7, 6, -0.24], [114, 0, 24, 6, -0.28], [112, 28, 8, 7, -0.3],
  [138, 36, 6, 6, -0.22], [88, 23, 4, 3, -0.28], [77, 10, 3, 5, -0.2], [-82, 36, 8, 7, -0.28], [-122, 47, 3, 6, -0.24], [-85, 12, 5, 5, -0.22],
  [10, 48, 12, 8, -0.18], [-4, 54, 5, 5, -0.16], [49, -18, 2, 7, -0.22], [-45, -22, 6, 6, -0.18], [90, 60, 42, 7, -0.24], [-100, 56, 30, 6, -0.22],
  [18, 62, 8, 6, -0.2], [30, 56, 12, 5, -0.14], [146, -6, 8, 3, -0.2], [-52, 4, 6, 3, -0.2], [30, -2, 6, 4, -0.15], [172, -40, 4, 6, -0.1],
];
// Mountain ranges as poly-lines [[lon,lat]...]: half-width (deg), relief amount, snow cover
const RANGES = [
  [[[-134, 60], [-125, 56], [-114, 50], [-112, 48], [-108, 40], [-106, 34], [-104, 24], [-100, 19]], 3, 0.3, 0.45],
  [[[-76, 8], [-78, 0], [-77, -12], [-71, -18], [-69, -26], [-70, -34], [-72, -44], [-73, -53]], 2.3, 0.34, 0.55],
  [[[68, 36], [76, 35], [86, 28], [96, 28], [100, 31]], 2.4, 0.5, 0.95], [[[80, 33], [96, 33]], 5, 0.4, 0.3],
  [[[6, 44.5], [10, 46.5], [14, 47]], 1.2, 0.42, 0.8], [[[-2, 43], [3, 42.6]], 0.7, 0.3, 0.4], [[[38, 43.8], [48, 41.8]], 0.9, 0.34, 0.75],
  [[[24, 49], [24, 46], [27, 46]], 1, 0.15, 0], [[[60, 68], [59, 58], [58, 52]], 1.2, 0.14, 0.1], [[[14, 67], [8, 61]], 1.3, 0.24, 0.45],
  [[[-9, 31], [-4, 33], [2, 35], [9, 36]], 1.4, 0.3, 0.2], [[[48, 36], [52, 31], [57, 27]], 1.6, 0.26, 0.2], [[[70, 43], [86, 42]], 1.6, 0.4, 0.8],
  [[[86, 50], [96, 49]], 2, 0.28, 0.6], [[[-82, 41], [-78, 38], [-82, 35]], 1.2, 0.12, 0], [[[148, -37], [150, -30], [146, -19]], 1.2, 0.14, 0.1],
  [[[166, -46], [171, -43], [174, -40]], 1.4, 0.4, 0.9], [[[-124, 47], [-122, 40], [-118, 35]], 1.4, 0.18, 0.3], [[[38, 12], [39, 6]], 3, 0.22, 0],
  [[[29, -3], [31, -9], [33, -14]], 1.4, 0.1, 0], [[[26, -29], [30, -26]], 1.2, 0.18, 0],
];
const RANGE_BB = RANGES.map(([pts, hw]) => {
  let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
  for (const [x, y] of pts) { a = Math.min(a, x); c = Math.max(c, x); b = Math.min(b, y); d = Math.max(d, y); }
  return [a - 2 * hw, b - 2 * hw, c + 2 * hw, d + 2 * hw];
});
// dryness by |latitude| (0 = rainforest, ~0.3 = grass, ~0.6 = arid / tundra)
const ZONAL = [[0, 0.1], [8, 0.14], [16, 0.3], [24, 0.42], [32, 0.4], [40, 0.34], [48, 0.27], [56, 0.16], [62, 0.22], [66, 0.42], [72, 0.6], [90, 0.6]];
// ice sheets [lon, lat, rx, ry, cover]
const ICE = [[-41, 73, 22, 10.5, 1.3], [-18.5, 64.8, 2.6, 0.9, 0.55], [-72, 79, 9, 3, 0.6], [16, 78.5, 6, 2, 0.5]];

function terrainValue(lon, lat) {
  const al = Math.abs(lat);
  let v = 0.6;
  for (let k = 1; k < ZONAL.length; k++) {
    if (al <= ZONAL[k][0]) { const a = ZONAL[k - 1], b = ZONAL[k]; v = a[1] + ((al - a[0]) / (b[0] - a[0])) * (b[1] - a[1]); break; }
  }
  const nz = fbm(lon * 0.3 + 11.3, lat * 0.3 + 4.7, 3);
  for (let i = 0; i < REGIONS.length; i++) {
    const r = REGIONS[i];
    let dx = lon - r[0];
    dx -= Math.round(dx / 360) * 360;
    const dy = lat - r[1];
    if (Math.abs(dx) > r[2] * 1.3 || Math.abs(dy) > r[3] * 1.3) continue;
    const d2 = ((dx * dx) / (r[2] * r[2]) + (dy * dy) / (r[3] * r[3])) * (0.7 + 0.6 * nz);
    if (d2 >= 1) continue;
    const f = 1 - d2;
    v += r[4] * f * f * (3 - 2 * f);
  }
  let ice = al > 67 ? Math.min(1, (al - 67) / 9) * 0.98 : 0;
  for (let i = 0; i < RANGES.length; i++) {
    const bb = RANGE_BB[i];
    if (lon < bb[0] || lon > bb[2] || lat < bb[1] || lat > bb[3]) continue;
    const [pts, hw, amt, snow] = RANGES[i];
    let best = 1e9;
    for (let k = 1; k < pts.length; k++) {
      const ax = pts[k - 1][0], ay = pts[k - 1][1], bx = pts[k][0], by = pts[k][1];
      let dxl = lon - ax; dxl -= Math.round(dxl / 360) * 360;
      const abx = bx - ax, aby = by - ay;
      const l2 = abx * abx + aby * aby;
      let tt = l2 ? (dxl * abx + (lat - ay) * aby) / l2 : 0;
      tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
      const ex = dxl - abx * tt, ey = lat - ay - aby * tt;
      const d = ex * ex + ey * ey;
      if (d < best) best = d;
    }
    const q = best / (hw * hw);
    if (q < 4) {
      const n = fbm(lon * 0.9 + 3.1, lat * 0.9 + 9.2, 3);
      const e = Math.exp(-q);
      v += amt * e * (0.55 + 0.9 * n);
      if (snow) ice = Math.max(ice, snow * e * clamp((n - 0.38) / 0.3, 0, 1));
    }
  }
  for (let i = 0; i < ICE.length; i++) {
    const r = ICE[i];
    const dx = lon - r[0], dy = lat - r[1];
    const d2 = ((dx * dx) / (r[2] * r[2]) + (dy * dy) / (r[3] * r[3])) * (0.8 + 0.4 * nz);
    if (d2 < 1) { const f = 1 - d2; ice = Math.max(ice, r[4] * f * (3 - 2 * f) * 1.4); }
  }
  v += (fbm(lon * 0.22, lat * 0.22, 4) - 0.47) * 0.4;
  v = v < 0 ? 0 : v > 0.79 ? 0.79 : v;
  return Math.max(v, ice > 1 ? 1 : ice);
}


function* stageTerrain() {
  const f = new Uint8Array(TW * TH);
  const m = GEO.mips[2];
  const cov = (lon, lat) => {
    const ix = Math.min(m.w - 1, Math.max(0, Math.floor(((lon + 180) / 360) * m.w)));
    const iy = Math.min(m.h - 1, Math.max(0, Math.floor(((90 - lat) / 180) * m.h)));
    return m.d[iy * m.w + ix];
  };
  const isLand = new Uint8Array(TW * TH);
  for (let j = 0; j < TH; j++) {
    const lat = 90 - (j + 0.5) * 0.5;
    for (let i = 0; i < TW; i++) {
      const lon = -180 + (i + 0.5) * 0.5;
      const c = cov(lon, lat);
      isLand[j * TW + i] = c > 127 ? 1 : 0;
      const hit = c > 0 || cov(lon + 0.3, lat) > 0 || cov(lon - 0.3, lat) > 0 || cov(lon, lat + 0.3) > 0 || cov(lon, lat - 0.3) > 0;
      f[j * TW + i] = hit ? Math.round(terrainValue(lon, lat) * 255) : 80;
    }
    if ((j & 7) === 7) yield;
  }
  GEO.terrain = f;

  // distance (deg) from every ocean cell to the nearest land -> depth field (open / deep ocean)
  const dist = new Float32Array(TW * TH);
  const INF = 999;
  for (let k = 0; k < TW * TH; k++) dist[k] = isLand[k] ? 0 : INF;
  for (let pass = 0; pass < 2; pass++) {
    // chamfer sweeps (forward then backward) with x wrap-around; run twice so the seam propagates
    for (let j = 0; j < TH; j++) {
      const kx = Math.max(0.15, Math.cos((90 - (j + 0.5) * 0.5) * DEG)) * 0.5, dg = Math.sqrt(kx * kx + 0.25);
      const row = j * TW, up = row - TW;
      for (let i = 0; i < TW; i++) {
        let d = dist[row + i];
        const l = dist[row + (i === 0 ? TW - 1 : i - 1)] + kx;
        if (l < d) d = l;
        if (j > 0) {
          const u = dist[up + i] + 0.5;
          if (u < d) d = u;
          const ul = dist[up + (i === 0 ? TW - 1 : i - 1)] + dg;
          if (ul < d) d = ul;
          const ur = dist[up + (i === TW - 1 ? 0 : i + 1)] + dg;
          if (ur < d) d = ur;
        }
        dist[row + i] = d;
      }
      if ((j & 63) === 63) yield;
    }
    for (let j = TH - 1; j >= 0; j--) {
      const kx = Math.max(0.15, Math.cos((90 - (j + 0.5) * 0.5) * DEG)) * 0.5, dg = Math.sqrt(kx * kx + 0.25);
      const row = j * TW, dn = row + TW;
      for (let i = TW - 1; i >= 0; i--) {
        let d = dist[row + i];
        const r = dist[row + (i === TW - 1 ? 0 : i + 1)] + kx;
        if (r < d) d = r;
        if (j < TH - 1) {
          const v = dist[dn + i] + 0.5;
          if (v < d) d = v;
          const dl = dist[dn + (i === 0 ? TW - 1 : i - 1)] + dg;
          if (dl < d) d = dl;
          const dr = dist[dn + (i === TW - 1 ? 0 : i + 1)] + dg;
          if (dr < d) d = dr;
        }
        dist[row + i] = d;
      }
      if ((j & 63) === 63) yield;
    }
  }
  const depth = new Uint8Array(TW * TH);
  for (let j = 0; j < TH; j++) {
    for (let i = 0; i < TW; i++) {
      const k = j * TW + i;
      const lon = -180 + (i + 0.5) * 0.5, lat = 90 - (j + 0.5) * 0.5;
      const n = 0.65 + 0.7 * fbm(lon * 0.35 + 40, lat * 0.35 + 17, 3);
      depth[k] = isLand[k] ? 0 : Math.min(255, Math.round(dist[k] * n * 20)); // 255 == ~12.75 deg
    }
    if ((j & 31) === 31) yield;
  }
  GEO.depth = depth;

  // terrain value (0..255) -> tone level + dither fraction. Level centres are the colour stops.
  const stops = [0.08, 0.34, 0.58, 0.78, 0.95];
  const lvl = new Uint8Array(256), fr = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    let L = 0, fs = 0;
    if (v >= stops[4]) L = 4;
    else if (v > stops[0]) {
      let k = 0;
      while (v > stops[k + 1]) k++;
      L = k;
      const q = (v - stops[k]) / (stops[k + 1] - stops[k]);
      const s = clamp((q - 0.38) / 0.24, 0, 1); // narrow dithered seams between terrain steps
      fs = s * s * (3 - 2 * s);
    }
    lvl[i] = L; fr[i] = Math.round(fs * 255);
  }
  // value x 4x4 dither cell -> final tone, so the per-pixel work is a single lookup.
  const landTone = new Uint8Array(4096), seaTone = new Uint8Array(4096);
  for (let v = 0; v < 256; v++) {
    for (let k = 0; k < 16; k++) {
      landTone[(v << 4) | k] = T_LAND0 + lvl[v] + (fr[v] > B4_255[k] ? 1 : 0);
      seaTone[(v << 4) | k] = T_OCEAN; // the sea is one flat navy (depth bands read as blotches)
    }
  }
  GEO.landTone = landTone; GEO.seaTone = seaTone;
}

// Major cities [lat, lon, size 1..5] -> clusters of night lights.
const CITIES = [
  [35.7, 139.7, 5], [28.6, 77.2, 5], [31.2, 121.5, 5], [23.8, 90.4, 4], [30.0, 31.2, 4], [19.1, 72.9, 5], [39.9, 116.4, 5], [19.4, -99.1, 4], [-23.5, -46.6, 5],
  [40.7, -74.0, 5], [24.9, 67.0, 4], [6.5, 3.4, 4], [41.0, 29.0, 4], [34.1, -118.2, 4], [-34.6, -58.4, 4], [22.6, 88.4, 4], [14.6, 121.0, 4], [55.8, 37.6, 4],
  [48.9, 2.35, 4], [51.5, -0.1, 4], [-6.2, 106.8, 4], [37.6, 127.0, 4], [13.8, 100.5, 3], [35.7, 51.4, 3], [-12.0, -77.0, 3], [41.9, -87.6, 4], [-4.3, 15.3, 3],
  [4.7, -74.1, 3], [-22.9, -43.2, 4], [-26.2, 28.0, 3], [33.3, 44.4, 3], [40.4, -3.7, 3], [52.5, 13.4, 3], [41.9, 12.5, 3], [24.7, 46.7, 3], [43.7, -79.4, 3],
  [38.9, -77.0, 3], [25.8, -80.2, 3], [29.8, -95.4, 3], [32.8, -96.8, 3], [37.8, -122.4, 3], [33.7, -84.4, 3], [-33.4, -70.7, 3], [-1.3, 36.8, 2], [9.0, 38.7, 2],
  [33.6, -7.6, 2], [36.8, 3.1, 2], [-8.8, 13.2, 2], [15.6, 32.5, 2], [-6.8, 39.3, 2], [-33.9, 18.4, 2], [50.45, 30.5, 3], [52.2, 21.0, 3], [48.2, 16.4, 2],
  [38.0, 23.7, 2], [34.5, 69.2, 2], [41.3, 69.3, 2], [10.8, 106.7, 4], [21.0, 105.8, 3], [13.1, 80.3, 3], [13.0, 77.6, 3], [17.4, 78.5, 3], [31.5, 74.3, 3],
  [23.1, 113.3, 4], [22.5, 114.1, 4], [29.6, 106.5, 3], [30.7, 104.1, 3], [30.6, 114.3, 3], [34.7, 135.5, 4], [25.0, 121.5, 3], [-37.8, 145.0, 3], [-33.9, 151.2, 3],
  [-27.5, 153.0, 2], [-32.0, 115.9, 2], [-36.8, 174.8, 2], [21.3, -157.9, 1], [49.3, -123.1, 2], [45.5, -73.6, 3], [23.1, -82.4, 2], [10.5, -66.9, 2], [-0.2, -78.5, 2],
  [-15.8, -47.9, 2], [-13.0, -38.5, 2], [-3.7, -38.5, 2], [-8.1, -34.9, 2], [6.2, -75.6, 2], [25.2, 55.3, 3], [32.1, 34.8, 3], [5.6, -0.2, 2], [5.3, -4.0, 2],
  [14.7, -17.5, 2], [12.0, 8.5, 2], [59.3, 18.1, 2], [59.9, 10.7, 2], [60.2, 25.0, 2], [55.7, 12.6, 2], [53.3, -6.3, 2], [38.7, -9.1, 2], [45.5, 9.2, 3],
  [53.5, -2.2, 2], [48.1, 11.6, 2], [44.4, 26.1, 2], [53.9, 27.6, 2], [59.9, 30.3, 3], [55.0, 82.9, 2], [56.8, 60.6, 2], [43.2, 76.9, 2], [1.35, 103.8, 4],
  [3.1, 101.7, 3], [16.8, 96.2, 3], [11.6, 104.9, 2], [6.9, 79.9, 2], [27.7, 85.3, 2], [45.8, 126.6, 2], [41.8, 123.4, 3], [39.1, 117.2, 3], [34.3, 108.9, 3],
  [32.1, 118.8, 3], [30.3, 120.2, 3], [36.1, 120.4, 2], [34.7, 113.6, 3], [47.9, 106.9, 2], [43.1, 131.9, 2], [43.1, 141.4, 2], [33.6, 130.4, 2], [35.2, 136.9, 3],
  [33.9, 35.5, 2], [31.9, 35.9, 2], [36.2, 37.2, 2], [35.0, 135.8, 2], [-4.0, 39.7, 1], [0.3, 32.6, 2], [-18.9, 47.5, 2], [-25.9, 32.6, 1], [-17.8, 31.0, 2],
  [30.0, -90.1, 2], [39.7, -105.0, 2], [47.6, -122.3, 2], [33.4, -112.1, 2], [42.4, -71.1, 3], [39.9, -75.2, 3], [44.9, -93.3, 2], [29.4, -98.5, 2], [36.2, -86.8, 2],
];

function* stageMisc() {
  // country borders (zigzag varint deltas)
  const bin = b64(BORDERS.data);
  let p = 0;
  const rd = () => {
    let v = 0, s = 0, b = 0;
    do { b = p < bin.length ? bin[p++] : 0; v += (b & 127) * 2 ** s; s += 7; } while (b & 128 && s < 35);
    return v;
  };
  const nLines = rd();
  const lines = [];
  for (let i = 0; i < nLines && p < bin.length; i++) {
    const n = rd();
    const pts = new Float32Array(n * 2);
    let qx = 0, qy = 0, minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    for (let k = 0; k < n; k++) {
      const zx = rd(), zy = rd();
      qx += zx & 1 ? -((zx + 1) / 2) : zx / 2;
      qy += zy & 1 ? -((zy + 1) / 2) : zy / 2;
      const lon = qx / BORDERS.scale, lat = qy / BORDERS.scale;
      pts[2 * k] = lon; pts[2 * k + 1] = lat;
      if (lon < minx) minx = lon; if (lon > maxx) maxx = lon; if (lat < miny) miny = lat; if (lat > maxy) maxy = lat;
    }
    lines.push({ pts, n, minx, maxx, miny, maxy });
  }
  GEO.lines = lines;
  yield;
  // night-light clusters (static: cities do not flicker)
  const rnd = mulberry32(20240607);
  const lon = [], lat = [], kind = [];
  for (const [la, lo, sz] of CITIES) {
    const n = 3 + sz * sz * 2;
    const spread = 0.1 + 0.1 * sz;
    for (let k = 0; k < n; k++) {
      const a = rnd() * Math.PI * 2, r = spread * Math.sqrt(-Math.log(1 - rnd() * 0.97)) * 0.7;
      lon.push(lo + (Math.cos(a) * r) / Math.max(0.35, Math.cos(la * DEG)));
      lat.push(la + Math.sin(a) * r);
      kind.push(k === 0 ? 3 : rnd() < 0.2 ? 1 : 0);
    }
  }
  GEO.lights = { lon: Float32Array.from(lon), lat: Float32Array.from(lat), kind: Uint8Array.from(kind), n: lon.length };
}

// Init runs as three generators (each yields every few ms of work) drained in the background,
// one slice per timer task, right after the module loads; drawWorldMap finishes whatever is left.
const TASKS = [stageLand(), stageTerrain(), stageMisc()];
let taskIdx = 0;
function stepInit() {
  if (taskIdx >= TASKS.length) return false;
  if (TASKS[taskIdx].next().done) taskIdx++;
  return taskIdx < TASKS.length;
}
function ensureInit() {
  while (stepInit());
}
// After the data is ready, run a few throw-away frames (also in background slices) so the render
// loops are JIT-optimised and the full-screen / mini buffers exist before the first real map shot.
let warmN = 0;
function warmStep() {
  if (typeof document === 'undefined' || warmN >= 12) return;
  try {
    if (!warmStep.ctx) warmStep.ctx = document.createElement('canvas').getContext('2d');
    const k = warmN++;
    drawWorldMap(warmStep.ctx, k * 0.1, 0.1 + k * 0.16, { lat: 48 + k, lon: 20 + k, w: 384, h: 216, place: 'WARM' });
    if (k % 3 === 2) drawWorldMap(warmStep.ctx, k * 0.1, k * 0.2, { lat: 10, lon: 10, w: 104, h: 62, mini: true });
  } catch {
    warmN = 99;
  }
  setTimeout(warmStep, 20);
}
if (typeof setTimeout === 'function' && typeof document !== 'undefined') {
  const kick = () => {
    if (stepInit()) setTimeout(kick, 0);
    else setTimeout(warmStep, 50);
  };
  setTimeout(kick, 0);
}

// ---------------------------------------------------------------------------------------------
// Sun position (subsolar point) from a UTC time in ms
// ---------------------------------------------------------------------------------------------
function sunPosition(ms) {
  const d = ms / 86400000 - 10957.5; // days since J2000
  const L = 280.46 + 0.9856474 * d;
  const g = (357.528 + 0.9856003 * d) * DEG;
  const lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG;
  const eps = (23.439 - 0.0000004 * d) * DEG;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lam));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)) / DEG;
  const gmst = 280.46061837 + 360.98564736629 * d;
  let lon = (ra - gmst) % 360;
  if (lon > 180) lon -= 360; else if (lon < -180) lon += 360;
  return { dec, lon };
}

// ---------------------------------------------------------------------------------------------
// View: where the camera is at dt. The fly-in pans and zooms on separate eased curves (the pan
// leads, the zoom follows) and the target travels to its spot along a gentle arc, so the move
// reads like a camera crane rather than a straight digital zoom.
// ---------------------------------------------------------------------------------------------
function computeView(w, h, mini, t, dt, lat, lon) {
  const s0 = w / 360; // world view: the whole globe across the width
  if (lat === null) {
    const s = s0 * (mini ? 1.7 : 1.4);
    // pan whole pixels so coastlines never swim and the base layer is rebuilt only on a pixel step
    const clon = Math.round(t * (mini ? 2.2 : 3.2) * s) / s - 20;
    const clat = Math.round((mini ? 18 : 16) * s) / s;
    return { clon, clat, s, kx: 1, ax: -1, ay: -1, idle: true };
  }
  const zoom = mini ? 4.5 : 5.5;
  const kxEnd = clamp(Math.cos(lat * DEG), 0.5, 1);
  const f = clamp(dt / FLY_T, 0, 1);
  const ez = easeInOut(clamp((f - 0.1) / 0.9, 0, 1)); // zoom starts a beat after the pan
  const ep = easeInOutSine(clamp(f / 0.92, 0, 1));
  const s = s0 * Math.pow(zoom, ez);
  const kx = 1 + (kxEnd - 1) * ez;
  const pinX = w / 2, pinY = mini ? h / 2 : Math.round(h * 0.42);
  const ax0 = w / 2 + START_LON_OFFSET * s0, ay0 = h / 2 - lat * s0;
  const arc = (mini ? 6 : 16) * Math.sin(Math.PI * ep);
  const ax = ax0 + (pinX - ax0) * ep, ay = ay0 + (pinY - ay0) * ep - arc;
  const clon = lon - (ax - w / 2) / (s * kx);
  const clat = lat + (ay - h / 2) / s;
  return { clon, clat, s, kx, ax, ay, idle: false };
}

// ---------------------------------------------------------------------------------------------
// Per-size render state
// ---------------------------------------------------------------------------------------------
const INSTANCES = new Map();

function getInstance(w, h) {
  const key = `${w}x${h}`;
  let rt = INSTANCES.get(key);
  if (rt) return rt;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const cctx = canvas.getContext('2d');
  const img = cctx.createImageData(w, h);
  const half = ((w + 1) >> 1) * ((h + 1) >> 1);
  rt = {
    w, h, canvas, cctx, img, u32: new Uint32Array(img.data.buffer),
    base: new Uint8Array(w * h), land: new Uint8Array(w * h), edge: new Uint8Array(w * h), bT: new Int16Array(half), bD: new Int16Array(half),
    cx0: new Int32Array(w), cx1: new Int32Array(w), cfx: new Float32Array(w),
    tx0: new Int32Array(w), tx1: new Int32Array(w), tfx: new Float32Array(w),
    colLon: new Float64Array(w), colC: new Float32Array(w), gcol: new Uint8Array(w),
    ry0: new Int32Array(h), ry1: new Int32Array(h), rfy: new Float32Array(h),
    ty0: new Int32Array(h), ty1: new Int32Array(h), tfy: new Float32Array(h),
    rowLat: new Float64Array(h), rowSpace: new Uint8Array(h), grow: new Uint8Array(h), rowA: new Float32Array(h), rowB: new Float32Array(h),
    lastClon: NaN, lastClat: NaN, lastS: NaN, lastKx: NaN, phase: NaN, minute: NaN, labelFor: null, context: null,
  };
  INSTANCES.set(key, rt);
  return rt;
}

// ---------------------------------------------------------------------------------------------
// Base layer: land / terrain tones / coast / borders / graticule  (rebuilt only when the view changes)
// ---------------------------------------------------------------------------------------------
function renderBase(rt, view) {
  const w = rt.w, h = rt.h;
  const sx = view.s * view.kx, sy = view.s;
  const mips = GEO.mips;
  const pxDeg = 1 / Math.sqrt(sx * sy);
  let lvl = Math.floor(Math.log2(pxDeg / GEO.texel0));
  lvl = lvl < 0 ? 0 : lvl > mips.length - 1 ? mips.length - 1 : lvl;
  const mip = mips[lvl], Wl = mip.w, Hl = mip.h;
  const bitsMode = lvl === 0;
  const m = mip.d, bits = mip.bits, rowStride = bitsMode ? mip.stride : Wl;
  const terr = GEO.terrain, depth = GEO.depth, LT = GEO.landTone, ST = GEO.seaTone;
  const { cx0, cx1, cfx, tx0, tx1, tfx, colLon, ry0, ry1, rfy, ty0, ty1, tfy, rowLat, rowSpace, land, edge, base, gcol, grow } = rt;
  const halfW = w / 2, halfH = h / 2;

  for (let x = 0; x < w; x++) {
    const lon = view.clon + (x + 0.5 - halfW) / sx;
    colLon[x] = lon;
    let u = (lon + 180) / 360;
    u -= Math.floor(u);
    let a = u * Wl - 0.5, a0 = Math.floor(a);
    cfx[x] = a - a0;
    if (a0 < 0) a0 += Wl;
    cx0[x] = a0; cx1[x] = a0 + 1 >= Wl ? 0 : a0 + 1;
    a = u * TW - 0.5; a0 = Math.floor(a);
    tfx[x] = a - a0;
    if (a0 < 0) a0 += TW;
    tx0[x] = a0; tx1[x] = a0 + 1 >= TW ? 0 : a0 + 1;
  }
  for (let y = 0; y < h; y++) {
    const lat = view.clat - (y + 0.5 - halfH) / sy;
    rowLat[y] = lat;
    if (lat > 90 || lat < -90) { rowSpace[y] = 1; continue; }
    rowSpace[y] = 0;
    let b = ((90 - lat) / 180) * Hl - 0.5, b0 = Math.floor(b);
    rfy[y] = b - b0;
    ry0[y] = (b0 < 0 ? 0 : b0 > Hl - 1 ? Hl - 1 : b0) * rowStride;
    b0++;
    ry1[y] = (b0 < 0 ? 0 : b0 > Hl - 1 ? Hl - 1 : b0) * rowStride;
    b = ((90 - lat) / 180) * TH - 0.5; b0 = Math.floor(b);
    tfy[y] = b - b0;
    ty0[y] = (b0 < 0 ? 0 : b0 > TH - 1 ? TH - 1 : b0) * TW;
    b0++;
    ty1[y] = (b0 < 0 ? 0 : b0 > TH - 1 ? TH - 1 : b0) * TW;
  }

  // pass 1: land flags (0 ocean, 1 land, 2 beyond the poles); shoreline pixels are flagged on the fly
  // (edge 1 = land pixel touching ocean -> coastline, 2 = ocean pixel touching land -> shallow halo)
  const thr = bitsMode ? 127 : 112;
  edge.fill(0);
  for (let y = 0; y < h; y++) {
    let i = y * w;
    if (rowSpace[y]) { land.fill(2, i, i + w); continue; }
    const o0 = ry0[y], o1 = ry1[y], fy = rfy[y];
    for (let x = 0; x < w; x++, i++) {
      const c0 = cx0[x], c1 = cx1[x];
      let a, b, c, d;
      if (bitsMode) {
        a = (bits[o0 + (c0 >> 3)] >> (c0 & 7)) & 1 ? 255 : 0;
        b = (bits[o0 + (c1 >> 3)] >> (c1 & 7)) & 1 ? 255 : 0;
        c = (bits[o1 + (c0 >> 3)] >> (c0 & 7)) & 1 ? 255 : 0;
        d = (bits[o1 + (c1 >> 3)] >> (c1 & 7)) & 1 ? 255 : 0;
      } else {
        a = m[o0 + c0]; b = m[o0 + c1]; c = m[o1 + c0]; d = m[o1 + c1];
      }
      let cv;
      if (a === b && c === d && a === c) cv = a;
      else {
        const fx = cfx[x];
        const top = a + (b - a) * fx;
        cv = top + (c + (d - c) * fx - top) * fy;
      }
      const L = cv > thr ? 1 : 0;
      land[i] = L;
      if (x > 0) {
        const p = land[i - 1];
        if (p !== L && p < 2) { if (L) { edge[i] = 1; edge[i - 1] = 2; } else { edge[i - 1] = 1; edge[i] = 2; } }
      }
      if (y > 0) {
        const p = land[i - w];
        if (p !== L && p < 2) { if (L) { edge[i] = 1; edge[i - w] = 2; } else { edge[i - w] = 1; edge[i] = 2; } }
      }
    }
  }

  // pass 2: tones (terrain / ocean depth, ordered-dithered between adjacent tones). The smooth 0.5-degree
  // fields are sampled once per 2x2 block (lazily) while the dither threshold is applied per pixel.
  const bw = (w + 1) >> 1;
  const bT = rt.bT, bD = rt.bD;
  bT.fill(-1); bD.fill(-1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    if (rowSpace[y]) {
      base.fill(T_SPACE, row, row + w); // beyond the poles: plain black
      continue;
    }
    const ye = y & ~1;
    const t0 = ty0[ye], t1 = ty1[ye], tfyv = tfy[ye], by4 = (y & 3) << 2, brow = (y >> 1) * bw;
    for (let x = 0; x < w; x++) {
      const i = row + x, L = land[i];
      if (L === 1) {
        const bi = brow + (x >> 1);
        let v = bT[bi];
        if (v < 0) {
          const xe = x & ~1, a0 = tx0[xe], a1 = tx1[xe], fx = tfx[xe];
          const a = terr[t0 + a0], b = terr[t0 + a1], c = terr[t1 + a0], d = terr[t1 + a1];
          const top = a + (b - a) * fx;
          v = bT[bi] = (top + (c + (d - c) * fx - top) * tfyv) | 0;
        }
        // the coastline is the land tone one step darker
        base[i] = LT[(v << 4) | by4 | (x & 3)] | (edge[i] ? 48 : 0);
      } else if (L === 0) {
        if (edge[i]) base[i] = T_HALO;
        else {
          const bi = brow + (x >> 1);
          let v = bD[bi];
          if (v < 0) {
            const xe = x & ~1, a0 = tx0[xe], a1 = tx1[xe], fx = tfx[xe];
            const a = depth[t0 + a0], b = depth[t0 + a1], c = depth[t1 + a0], d = depth[t1 + a1];
            const top = a + (b - a) * fx;
            v = bD[bi] = (top + (c + (d - c) * fx - top) * tfyv) | 0;
          }
          base[i] = ST[(v << 4) | by4 | (x & 3)];
        }
      } else base[i] = T_SPACE;
    }
  }

  // country borders (vector polylines -> 1 px lines), only once zoomed in
  if (view.s > 1.7 && GEO.lines) drawBorders(rt, view, clamp((view.s - 1.7) / 1.1, 0, 1));

  // graticule, on the ocean only (minor lines dotted)
  const step = view.s >= 2.2 ? 10 : 30;
  for (let x = 0; x < w; x++) {
    const half = 0.5 / sx;
    const a = Math.floor((colLon[x] - half) / step), b = Math.floor((colLon[x] + half) / step);
    gcol[x] = a === b ? 0 : (b * step) % 30 === 0 ? 2 : 1;
  }
  for (let y = 0; y < h; y++) {
    const half = 0.5 / sy;
    const a = Math.floor((rowLat[y] - half) / step), b = Math.floor((rowLat[y] + half) / step);
    grow[y] = a === b ? 0 : (b * step) % 30 === 0 ? 2 : 1;
  }
  for (let y = 0; y < h; y++) {
    const gy = grow[y], row = y * w;
    for (let x = 0; x < w; x++) {
      const g = gcol[x] > gy ? gcol[x] : gy;
      if (!g) continue;
      if (g === 1 && (x + y) & 1) continue;
      const i = row + x, b = base[i];
      if (b === T_DEEP || b === T_OCEAN) base[i] = b | (g << 4);
    }
  }
}

function drawBorders(rt, view, fade) {
  const { w, h, base } = rt;
  const sx = view.s * view.kx, sy = view.s;
  const clon = ((((view.clon + 180) % 360) + 360) % 360) - 180, clat = view.clat; // keep copies at -360/0/+360 in reach
  const lonL = clon - w / 2 / sx, lonR = clon + w / 2 / sx;
  const latT = clat + h / 2 / sy, latB = clat - h / 2 / sy;
  const halfW = w / 2, halfH = h / 2;
  const thrF = fade * 16;
  for (const ln of GEO.lines) {
    if (ln.maxy < latB || ln.miny > latT) continue;
    for (let k = -360; k <= 360; k += 360) {
      if (ln.maxx + k < lonL || ln.minx + k > lonR) continue;
      const pts = ln.pts;
      let px = (pts[0] + k - clon) * sx + halfW, py = (clat - pts[1]) * sy + halfH;
      for (let q = 1; q < ln.n; q++) {
        const nx = (pts[2 * q] + k - clon) * sx + halfW, ny = (clat - pts[2 * q + 1]) * sy + halfH;
        if (!((px < 0 && nx < 0) || (px > w && nx > w) || (py < 0 && ny < 0) || (py > h && ny > h))) {
          let x0 = Math.floor(px), y0 = Math.floor(py);
          const x1 = Math.floor(nx), y1 = Math.floor(ny);
          const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), stx = x0 < x1 ? 1 : -1, sty = y0 < y1 ? 1 : -1;
          let err = dx + dy, guard = dx - dy + 2;
          if (guard < 3000) {
            for (;;) {
              if (x0 >= 0 && x0 < w && y0 >= 0 && y0 < h) {
                const i = y0 * w + x0, b = base[i] & 15;
                if (b >= T_LAND0 && b <= T_LAND1 && (fade >= 1 || B4[((y0 & 3) << 2) | (x0 & 3)] * 16 < thrF)) base[i] = b | 48;
              }
              if (x0 === x1 && y0 === y1) break;
              const e2 = 2 * err;
              if (e2 >= dy) { err += dy; x0 += stx; }
              if (e2 <= dx) { err += dx; y0 += sty; }
              if (--guard < 0) break;
            }
          }
        }
        px = nx; py = ny;
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Pin sprite and ripples
// ---------------------------------------------------------------------------------------------
function makePin(R, H) {
  const w = 2 * R + 1;
  const shape = new Uint8Array(w * H);
  const cy = R, rr = (R + 0.45) * (R + 0.45);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - R, dy = y - cy;
      let inside = dx * dx + dy * dy <= rr;
      if (!inside && y > cy) {
        const k = (y - cy) / (H - 1 - cy);
        inside = Math.abs(dx) <= (R + 0.45) * (1 - k) * (1 - 0.18 * k);
      }
      shape[y * w + x] = inside ? 1 : 0;
    }
  }
  const px = new Uint32Array(w * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < w; x++) {
      if (!shape[y * w + x]) continue;
      const edge = !(x > 0 && shape[y * w + x - 1]) || !(x < w - 1 && shape[y * w + x + 1]) || !(y > 0 && shape[(y - 1) * w + x]) || !(y < H - 1 && shape[(y + 1) * w + x]);
      const dx = x - R, dy = y - cy;
      let c;
      if (edge) c = RGB.black;
      else if (dx * dx + dy * dy <= (R >= 5 ? (R * 0.42) * (R * 0.42) + 0.6 : 1)) c = RGB.white;
      else if (-dx * 0.75 - dy * 0.75 > R * 0.78) c = RGB.pink;
      else if (dx * 0.7 + dy * 0.45 > R * 0.55 || (y > cy + R * 0.7 && dx > 0)) c = RGB.darkRed;
      else c = RGB.red;
      px[y * w + x] = c;
    }
  }
  return { w, h: H, px, tipX: R, tipY: H - 1 };
}
const PIN_FULL = makePin(5, 16);
const PIN_MINI = makePin(3, 10);

function plot(u32, w, h, x, y, c) {
  if (x >= 0 && x < w && y >= 0 && y < h) u32[y * w + x] = c;
}

/** Height of the pin above its spot (px): a gravity fall, one small hop, then still. */
function pinLift(u, drop) {
  if (u >= 1) return 0;
  if (u < 0.62) {
    const k = u / 0.62;
    return drop * (1 - k * k);
  }
  if (u < 0.86) return 3 * Math.sin(((u - 0.62) / 0.24) * Math.PI);
  return 0;
}

/** Two ripples from the landing spot, fading through palette steps (red, dark red, maroon), then none. */
function drawRipples(rt, cx, cy, tl, mini) {
  const { u32, w, h } = rt;
  const rMax = mini ? 10 : 26;
  for (let k = 0; k < 2; k++) {
    const u = (tl - k * 0.42) / 0.95;
    if (u <= 0 || u >= 1) continue;
    const r = Math.round(3 + (rMax - 3) * easeOutQuint(u));
    const c = u < 0.45 ? RGB.red : u < 0.75 ? RGB.darkRed : RGB.maroon;
    const pts = ringPts(r);
    for (let q = 0; q < pts.length; q += 2) plot(u32, w, h, cx + pts[q], cy + pts[q + 1], c);
  }
}

function drawPin(rt, cx, cy, lift, sprite, shadowK) {
  const { u32, w, h } = rt;
  // flat ground shadow, solid palette black, growing as the pin comes down
  const rx = Math.round(sprite.w * 0.36 * shadowK);
  if (rx >= 1) for (let dx = -rx; dx <= rx; dx++) plot(u32, w, h, cx + dx, cy + 1, RGB.black);
  if (rx >= 3) for (let dx = -rx + 2; dx <= rx - 2; dx++) plot(u32, w, h, cx + dx, cy + 2, RGB.black);
  const x0 = cx - sprite.tipX, y0 = Math.round(cy - sprite.tipY - lift);
  for (let y = 0; y < sprite.h; y++) {
    for (let x = 0; x < sprite.w; x++) {
      const c = sprite.px[y * sprite.w + x];
      if (c) plot(u32, w, h, x0 + x, y0 + y, c);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Neighbouring countries: approximate label points [name, lat, lon] for context names
// ---------------------------------------------------------------------------------------------
const COUNTRIES = [
  ['ICELAND', 64.9, -18.6], ['IRELAND', 53.2, -8.1], ['UK', 53.0, -1.8], ['PORTUGAL', 39.6, -8.0], ['SPAIN', 40.2, -3.6],
  ['FRANCE', 46.6, 2.4], ['BELGIUM', 50.6, 4.6], ['NETHERLANDS', 52.3, 5.6], ['GERMANY', 51.1, 10.4], ['SWITZERLAND', 46.8, 8.2],
  ['AUSTRIA', 47.6, 14.1], ['ITALY', 42.8, 12.5], ['DENMARK', 56.0, 9.3], ['NORWAY', 61.4, 8.8], ['SWEDEN', 62.8, 16.3],
  ['FINLAND', 63.2, 26.3], ['POLAND', 52.1, 19.4], ['CZECHIA', 49.8, 15.5], ['HUNGARY', 47.2, 19.4], ['ROMANIA', 45.9, 24.9],
  ['BULGARIA', 42.7, 25.3], ['GREECE', 39.3, 22.0], ['SERBIA', 44.0, 20.8], ['CROATIA', 45.4, 15.9], ['UKRAINE', 49.0, 31.4],
  ['BELARUS', 53.5, 28.0], ['LITHUANIA', 55.3, 23.9], ['LATVIA', 56.9, 24.6], ['ESTONIA', 58.7, 25.5], ['RUSSIA', 58.0, 45.0],
  ['TURKEY', 39.0, 35.2], ['GEORGIA', 42.2, 43.5], ['KAZAKHSTAN', 48.2, 67.3], ['UZBEKISTAN', 41.4, 63.9], ['IRAN', 32.4, 53.7],
  ['IRAQ', 33.0, 43.7], ['SYRIA', 35.0, 38.5], ['LEBANON', 33.9, 35.9], ['ISRAEL', 31.4, 35.0], ['JORDAN', 31.2, 36.5],
  ['SAUDI ARABIA', 24.0, 45.0], ['YEMEN', 15.6, 47.6], ['OMAN', 20.6, 56.1], ['UAE', 23.9, 54.2], ['QATAR', 25.3, 51.2],
  ['AFGHANISTAN', 33.9, 67.7], ['PAKISTAN', 30.0, 69.4], ['INDIA', 22.0, 79.0], ['NEPAL', 28.4, 84.1], ['BANGLADESH', 23.7, 90.4],
  ['SRI LANKA', 7.9, 80.8], ['MYANMAR', 21.0, 96.0], ['THAILAND', 15.1, 101.0], ['LAOS', 19.5, 102.5], ['VIETNAM', 16.5, 107.5],
  ['CAMBODIA', 12.6, 104.9], ['MALAYSIA', 4.2, 102.0], ['INDONESIA', -2.5, 118.0], ['PHILIPPINES', 12.9, 121.8], ['CHINA', 35.0, 103.0],
  ['MONGOLIA', 46.9, 103.8], ['NORTH KOREA', 40.3, 127.4], ['SOUTH KOREA', 36.5, 127.9], ['JAPAN', 36.2, 138.3], ['TAIWAN', 23.7, 121.0],
  ['AUSTRALIA', -25.3, 133.8], ['NEW ZEALAND', -41.5, 172.5], ['PAPUA NEW GUINEA', -6.3, 145.0],
  ['MOROCCO', 31.8, -7.1], ['ALGERIA', 28.0, 1.7], ['TUNISIA', 34.0, 9.5], ['LIBYA', 26.3, 17.2], ['EGYPT', 26.8, 30.8],
  ['SUDAN', 15.5, 30.2], ['SOUTH SUDAN', 7.0, 30.0], ['ETHIOPIA', 9.1, 40.5], ['ERITREA', 15.2, 39.0], ['SOMALIA', 5.2, 46.2],
  ['KENYA', 0.4, 37.9], ['UGANDA', 1.4, 32.3], ['TANZANIA', -6.4, 34.9], ['RWANDA', -1.9, 29.9], ['DR CONGO', -2.9, 23.6],
  ['CONGO', -0.7, 15.2], ['GABON', -0.8, 11.6], ['CAMEROON', 6.0, 12.4], ['NIGERIA', 9.1, 8.7], ['NIGER', 17.6, 8.1],
  ['CHAD', 15.5, 18.7], ['MALI', 17.6, -4.0], ['MAURITANIA', 21.0, -10.9], ['SENEGAL', 14.5, -14.5], ['GUINEA', 10.4, -10.9],
  ['SIERRA LEONE', 8.5, -11.8], ['LIBERIA', 6.4, -9.4], ['IVORY COAST', 7.5, -5.5], ['GHANA', 7.9, -1.0], ['BURKINA FASO', 12.2, -1.6],
  ['CENTRAL AFRICAN REP.', 6.6, 20.9], ['ANGOLA', -12.3, 17.9], ['ZAMBIA', -13.1, 27.8], ['MALAWI', -13.3, 34.3], ['MOZAMBIQUE', -17.5, 35.5],
  ['ZIMBABWE', -19.0, 29.2], ['BOTSWANA', -22.3, 24.7], ['NAMIBIA', -22.0, 17.5], ['SOUTH AFRICA', -30.6, 23.5], ['MADAGASCAR', -19.5, 46.7],
  ['WESTERN SAHARA', 24.2, -12.9], ['GREENLAND', 72.0, -40.0], ['CANADA', 56.1, -106.3], ['USA', 39.8, -98.6], ['MEXICO', 23.6, -102.5],
  ['GUATEMALA', 15.8, -90.2], ['HONDURAS', 15.0, -86.6], ['NICARAGUA', 12.9, -85.2], ['COSTA RICA', 9.9, -84.0], ['PANAMA', 8.5, -80.8],
  ['CUBA', 21.8, -79.0], ['HAITI', 19.0, -72.6], ['DOMINICAN REP.', 18.8, -70.3], ['JAMAICA', 18.1, -77.3], ['COLOMBIA', 4.0, -73.5],
  ['VENEZUELA', 7.0, -66.0], ['GUYANA', 4.9, -58.9], ['SURINAME', 4.0, -56.0], ['ECUADOR', -1.5, -78.3], ['PERU', -9.2, -75.0],
  ['BRAZIL', -10.3, -53.1], ['BOLIVIA', -16.3, -64.0], ['PARAGUAY', -23.4, -58.4], ['CHILE', -27.0, -70.2], ['ARGENTINA', -35.0, -65.0],
  ['URUGUAY', -32.6, -55.8],
];

// ---------------------------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------------------------
export function drawWorldMap(ctx, t, dt, { lat = null, lon = null, place = '', x = 0, y = 0, w = 384, h = 216, mini = false, label = true, now = null } = {}) {
  ensureInit();
  w = Math.max(8, Math.round(w)); h = Math.max(8, Math.round(h));
  x = Math.round(x); y = Math.round(y);
  t = Number.isFinite(t) ? t : 0;
  dt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  lat = lat === null || lat === undefined || lat === '' ? NaN : Number(lat);
  lon = lon === null || lon === undefined || lon === '' ? NaN : Number(lon);
  const hasTarget = Number.isFinite(lat) && Number.isFinite(lon);
  const view = computeView(w, h, mini, t, dt, hasTarget ? clamp(lat, -89.9, 89.9) : null, hasTarget ? lon : null);
  const rt = getInstance(w, h);
  const viewChanged = view.clon !== rt.lastClon || view.clat !== rt.lastClat || view.s !== rt.lastS || view.kx !== rt.lastKx;
  if (viewChanged) {
    renderBase(rt, view);
    rt.lastClon = view.clon; rt.lastClat = view.clat; rt.lastS = view.s; rt.lastKx = view.kx;
  }

  // the composed picture only changes with the view, the minute (terminator) or the pin animation
  const ms = Number.isFinite(now) ? now : nowMs();
  const tp = dt - PIN_T;
  // phase: -1 idle, frame numbers while flying / dropping, a fixed value once at rest
  const phase = view.idle ? -1 : tp < 0 ? Math.round(dt * 60) : tp < PIN_DROP + 1.4 ? 1000 + Math.round(tp * 60) : 9999;
  const minute = Math.floor(ms / 60000);
  const cx = Math.round(view.ax), cy = Math.round(view.ay);
  if (viewChanged || phase !== rt.phase || minute !== rt.minute) {
    rt.phase = phase;
    rt.minute = minute;
    composeFrame(rt, view, ms, mini);
    if (view.idle) drawIdleMarker(rt, view, mini);
    else if (tp < 0) drawReticle(rt, cx, cy, dt, mini);
    else {
      const sprite = mini ? PIN_MINI : PIN_FULL;
      const u = tp / PIN_DROP;
      const lift = pinLift(u, (mini ? 12 : 20) + view.ay);
      if (u > 0.62) drawRipples(rt, cx, cy, tp - PIN_DROP * 0.62, mini);
      drawPin(rt, cx, cy, lift, sprite, u >= 1 ? 1 : clamp(u / 0.62, 0.3, 1));
    }
    rt.cctx.putImageData(rt.img, 0, 0);
  }
  ctx.drawImage(rt.canvas, x, y);

  if (view.idle || tp < 0 || !place) return;
  if (mini) {
    if (label) drawMiniTag(ctx, x, y, w, h, place, tp - PIN_DROP);
    return;
  }
  if (!label) return;
  const pin = rt.pin || (rt.pin = { cx: 0, cy: 0, head: 0 });
  pin.cx = cx;
  pin.cy = cy;
  pin.head = cy - PIN_FULL.tipY + PIN_FULL.w / 2;
  const box = drawLabel(rt, ctx, x, y, w, h, pin, place, lat, lon, dt);
  if (box && dt >= CONTEXT_T) drawContext(rt, ctx, x, y, w, h, view, pin, box, place, dt);
}

/** Palette lookup of the base layer with the day/night terminator (Bayer 4x4) and city lights. */
function composeFrame(rt, view, ms, mini) {
  const { u32, base, colLon, colC, rowLat, rowA, rowB, w, h } = rt;
  const sun = sunPosition(ms);
  const sinD = Math.sin(sun.dec), cosD = Math.cos(sun.dec);
  for (let xx = 0; xx < w; xx++) colC[xx] = Math.cos((colLon[xx] - sun.lon) * DEG);
  for (let yy = 0; yy < h; yy++) {
    const la = rowLat[yy] * DEG;
    rowA[yy] = Math.sin(la) * sinD;
    rowB[yy] = Math.cos(la) * cosD;
  }
  const nightScale = 1 / 0.3;
  let i = 0;
  for (let yy = 0; yy < h; yy++) {
    const a = rowA[yy], b = rowB[yy], t4 = (yy & 3) << 2;
    for (let xx = 0; xx < w; xx++, i++) {
      let idx = base[i];
      if ((0.06 - a - b * colC[xx]) * nightScale > B4[t4 | (xx & 3)]) idx |= 128;
      u32[i] = PAL[idx];
    }
  }
  // city lights on the night side (static)
  if (mini || !GEO.lights || view.s <= 0.9) return;
  const L = GEO.lights;
  const sx = view.s * view.kx, sy = view.s;
  for (let q = 0; q < L.n; q++) {
    let dl = L.lon[q] - view.clon;
    dl -= Math.round(dl / 360) * 360;
    const px = Math.floor(dl * sx + w / 2), py = Math.floor((view.clat - L.lat[q]) * sy + h / 2);
    if (px < 0 || px >= w || py < 0 || py >= h) continue;
    const bi = py * w + px, tone = base[bi] & 15;
    if (tone < T_LAND0 || tone > T_LAND1) continue;
    if ((0.06 - rowA[py] - rowB[py] * colC[px]) * nightScale < 0.8) continue;
    const kd = L.kind[q];
    u32[bi] = kd === 3 ? RGB.cream : kd === 1 ? RGB.orange : RGB.yellow;
  }
}

/** Idle view: the studio city (London) marked with a small steady red square. */
function drawIdleMarker(rt, view, mini) {
  const { u32, w, h } = rt;
  const sx = view.s * view.kx, sy = view.s;
  let dl = -0.13 - view.clon;
  dl -= Math.round(dl / 360) * 360;
  const px = Math.round(dl * sx + w / 2 - 0.5), py = Math.round((view.clat - 51.5) * sy + h / 2 - 0.5);
  const s = mini ? 1 : 2;
  for (let yy = -s; yy <= s; yy++) for (let xx = -s; xx <= s; xx++) plot(u32, w, h, px + xx, py + yy, Math.abs(xx) === s || Math.abs(yy) === s ? RGB.black : RGB.red);
}

/** While flying: four ticks close in on the target (steady, never blinking). */
function drawReticle(rt, cx, cy, dt, mini) {
  const { u32, w, h } = rt;
  const k = easeOutQuint(clamp(dt / FLY_T, 0, 1));
  const d = Math.round((mini ? 8 : 16) - (mini ? 5 : 11) * k);
  const len = mini ? 2 : 3;
  for (let q = 0; q < len; q++) {
    plot(u32, w, h, cx - d - q, cy, RGB.white); plot(u32, w, h, cx + d + q, cy, RGB.white);
    plot(u32, w, h, cx, cy - d - q, RGB.white); plot(u32, w, h, cx, cy + d + q, RGB.white);
  }
}

function coordText(lat, lon) {
  return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}  ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
}

/** Place label layout (cached per place): name at 2x in up to two lines, coordinates in micro type. */
function labelLayout(place, lat, lon) {
  return cached(`label|${place}|${lat.toFixed(2)}|${lon.toFixed(2)}`, () => {
    let scale = 2;
    let lines = wrapLines(place, 150, 2, 3);
    if (lines.length > 2) {
      scale = 1;
      lines = wrapLines(place, 150, 1, 3);
    }
    const coords = coordText(lat, lon);
    let tw = measureText(coords, 1, 'micro');
    for (const l of lines) tw = Math.max(tw, measureText(l, scale));
    const lineH = 7 * scale;
    const gap = scale === 2 ? 4 : 3;
    const bw = tw + 17;
    const bh = 6 + lines.length * lineH + (lines.length - 1) * gap + 5 + 5 + 6;
    return { scale, lines, coords, bw, bh, lineH, gap };
  });
}

/**
 * The place label: a black plate with a red bar on the pin side, the name at 2x and the
 * coordinates under it, joined to the pin by a 1 px leader. It wipes out from the pin, then the
 * text rises in. Kept in y 26..138 (the top row and the captions own the rest).
 */
function drawLabel(rt, ctx, ox, oy, w, h, pin, place, lat, lon, dt) {
  const tl = dt - LABEL_T;
  if (tl < 0) return null;
  let L = rt.labelFor;
  if (!L || L.place !== place || L.lat !== lat || L.lon !== lon) {
    L = { ...labelLayout(place, lat, lon), place, lat, lon, box: { x: 0, y: 0, w: 0, h: 0 } };
    rt.labelFor = L;
  }
  const gap = 14;
  const by = clamp(Math.round(pin.head - L.bh / 2), 26, Math.max(26, 138 - L.bh));
  // the label goes on the side where it hides less land (right on a tie), decided once per place
  if (L.right === undefined) {
    const fitsR = pin.cx + gap + L.bw <= w - 13;
    const fitsL = pin.cx - gap - L.bw >= 13;
    const landR = fitsR ? landUnder(rt, pin.cx + gap, by, L.bw, L.bh) : 2;
    const landL = fitsL ? landUnder(rt, pin.cx - gap - L.bw, by, L.bw, L.bh) : 2;
    L.right = landR <= landL + 0.08;
  }
  const right = L.right;
  let bx = right ? pin.cx + gap : pin.cx - gap - L.bw;
  bx = clamp(bx, 13, w - 13 - L.bw);
  const e = easeOutQuint(clamp(tl / 0.36, 0, 1));
  const vis = Math.max(1, Math.round((L.bw + gap) * e));
  ctx.save();
  ctx.beginPath();
  if (right) ctx.rect(ox + pin.cx + 6, oy + by - 1, vis, L.bh + 2);
  else ctx.rect(ox + pin.cx - 6 - vis, oy + by - 1, vis, L.bh + 2);
  ctx.clip();
  // leader from the pin head to the plate
  const ly = clamp(Math.round(pin.head), by + 3, by + L.bh - 4);
  ctx.fillStyle = P.white;
  if (right) ctx.fillRect(ox + pin.cx + 6, oy + ly, bx - pin.cx - 6, 1);
  else ctx.fillRect(ox + bx + L.bw, oy + ly, pin.cx - 6 - (bx + L.bw), 1);
  ctx.fillStyle = P.black;
  ctx.fillRect(ox + bx, oy + by, L.bw, L.bh);
  ctx.fillStyle = P.slate;
  ctx.fillRect(ox + bx, oy + by, L.bw, 1);
  ctx.fillStyle = P.red;
  ctx.fillRect(ox + (right ? bx : bx + L.bw - 3), oy + by, 3, L.bh);
  ctx.restore();
  // text rises in once the plate is out
  const tx = ox + bx + (right ? 9 : 7);
  let cy = oy + by + 6;
  L.lines.forEach((ln, i) => {
    riseIn(ctx, ln, tx, cy, seg(tl, 0.16 + i * 0.06, 0.3), L.scale, 'body', P.white, ox + bx, L.bw);
    cy += L.lineH + L.gap;
  });
  riseIn(ctx, L.coords, tx, cy - L.gap + 5, seg(tl, 0.3, 0.3), 1, 'micro', P.fog, ox + bx, L.bw);
  const box = L.box;
  box.x = bx;
  box.y = by;
  box.w = L.bw;
  box.h = L.bh;
  return box;
}

/** Fraction of land pixels under a rectangle of the current view. */
function landUnder(rt, x0, y0, bw, bh) {
  let n = 0, l = 0;
  for (let y = Math.max(0, y0); y < Math.min(rt.h, y0 + bh); y += 2) {
    for (let x = Math.max(0, x0); x < Math.min(rt.w, x0 + bw); x += 2) {
      n++;
      if (rt.land[y * rt.w + x] === 1) l++;
    }
  }
  return n ? l / n : 1;
}

function riseIn(ctx, text, x, y, p, scale, font, color, clipX, clipW) {
  if (p <= 0) return;
  const cap = font === 'micro' ? 5 : 7 * scale;
  const off = Math.round((1 - easeOutQuint(p)) * (cap + 2));
  ctx.save();
  ctx.beginPath();
  ctx.rect(clipX, y - 2 * scale, clipW, cap + 2 * scale + 1);
  ctx.clip();
  drawText(ctx, text, x, y + off, { color, scale, font });
  ctx.restore();
}

/**
 * Up to five neighbouring country names in micro type, placed where they do not collide with
 * the pin, the label or each other; computed once the camera has settled, then cached.
 */
function contextLabels(rtU32, w, h, view, pin, box, place) {
  {
    const sx = view.s * view.kx, sy = view.s;
    const up = String(place || '').toUpperCase();
    const cand = [];
    for (const [name, la, lo] of COUNTRIES) {
      if (up.includes(name)) continue;
      let dl = lo - view.clon;
      dl -= Math.round(dl / 360) * 360;
      const px = Math.round(dl * sx + w / 2), py = Math.round((view.clat - la) * sy + h / 2);
      const tw = measureText(name, 1, 'micro');
      const r = { x: px - (tw >> 1) - 1, y: py - 3, w: tw + 3, h: 8, name, d: Math.hypot(px - pin.cx, py - pin.cy), dark: false };
      if (r.x < 13 || r.x + r.w > w - 13 || r.y < 28 || r.y + r.h > 138) continue;
      if (r.d < 22) continue;
      cand.push(r);
    }
    cand.sort((a, b) => a.d - b.d);
    const placed = [];
    const hit = (a, b, m = 3) => a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;
    const keepOut = [box, { x: pin.cx - 8, y: pin.cy - 20, w: 16, h: 24 }];
    for (const r of cand) {
      if (placed.length >= 5) break;
      if (keepOut.some((k) => hit(r, k, 4)) || placed.some((p) => hit(r, p))) continue;
      placed.push(r);
    }
    // on light land (dry land, ice) the names are black; elsewhere silver with a black shadow
    for (const r of placed) {
      let lum = 0, n = 0;
      for (let yy = r.y; yy < r.y + r.h; yy += 2) {
        for (let xx = r.x; xx < r.x + r.w; xx += 2) {
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const c = rtU32[yy * w + xx];
          lum += (c & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + ((c >> 16) & 255) * 0.11;
          n++;
        }
      }
      r.dark = n > 0 && lum / n > 120;
    }
    return placed;
  }
}

function drawContext(rt, ctx, ox, oy, w, h, view, pin, box, place, dt) {
  const tc = dt - CONTEXT_T;
  if (tc < 0) return;
  // computed once per place when the camera has settled (it no longer moves after FLY_T)
  let C = rt.context;
  if (!C || C.place !== place || C.clon !== view.clon || C.clat !== view.clat || C.s !== view.s) {
    C = { place, clon: view.clon, clat: view.clat, s: view.s, list: contextLabels(rt.u32, w, h, view, pin, box, place) };
    rt.context = C;
  }
  const list = C.list;
  list.forEach((r, i) => {
    const p = seg(tc, i * 0.08, 0.3);
    if (p <= 0) return;
    const off = Math.round((1 - easeOutQuint(p)) * 6);
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox + r.x - 1, oy + r.y - 1, r.w + 2, r.h + 1);
    ctx.clip();
    drawText(ctx, r.name, ox + r.x + 1, oy + r.y + 1 + off, r.dark ? { color: P.black, font: 'micro' } : { color: P.silver, font: 'micro', shadow: P.black });
    ctx.restore();
  });
}

/**
 * Mini (video wall) locator: the place in micro type on a black tab along the top edge (the wall's
 * bottom rows stay clear because a solo presenter's head overlaps them).
 */
function drawMiniTag(ctx, ox, oy, w, h, place, tl) {
  if (tl < 0) return;
  const text = ellipsis(place, w - 10, 1);
  const tw = measureText(text, 1, 'micro') + 8;
  const e = easeOutQuint(clamp(tl / 0.3, 0, 1));
  const vis = Math.round(tw * e);
  if (vis <= 0) return;
  ctx.fillStyle = P.black;
  ctx.fillRect(ox, oy, vis, 9);
  ctx.fillStyle = P.red;
  ctx.fillRect(ox, oy, 2, 9);
  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, oy, vis, 9);
  ctx.clip();
  drawText(ctx, text, ox + 5, oy + 2, { color: P.white, font: 'micro' });
  ctx.restore();
}
