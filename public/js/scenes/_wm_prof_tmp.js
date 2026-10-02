// Animated locator world map (the "cut to the map" shot for world stories).
//
//   drawWorldMap(ctx, t, dt, { lat, lon, place, x, y, w, h, mini })
//
// Every output pixel is shaded individually: its longitude/latitude is computed from the current view
// and the land mask (4096x2048, 0.088 deg/px, plus a box-filtered mip pyramid) is sampled and
// bilinearly thresholded, so coastlines are crisp at EVERY zoom with one uniform pixel size. Borders are
// vector polylines rasterised as 1-px lines, the graticule / terminator / shimmer use ordered dithering.
//
// Cost model: the "base" layer (land, terrain tones, coast, borders, graticule) is rebuilt only when the
// view changes (during the fly-in and every whole-pixel step while idling). Each frame then runs one cheap
// palette-index pass (ocean shimmer + day/night terminator), plots pin/rings, and uploads the ImageData.
import { P } from '/js/palette.js';
import { clamp, easeInOut, easeOut, mulberry32 } from '/js/util.js';
import { drawText, measureText, wrapText } from '/js/font.js';
import { LAND, BORDERS } from '/js/scenes/worlddata.js';

const DEG = Math.PI / 180;
const FLY_T = 1.6; // seconds of fly-in (world -> target)
const PIN_T = 1.6; // pin starts to drop
const PIN_DROP = 0.4; // drop + bounce duration
const LABEL_T = PIN_T + 0.42; // label starts sliding in
const LABEL_DUR = 0.4;
const START_LON_OFFSET = 24; // initial view centre is this many degrees west of the target

// ---------------------------------------------------------------------------------------------
// Colours: everything is derived from the channel palette (blends of palette colours only).
// ---------------------------------------------------------------------------------------------
const rgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const pack = (c) => (0xff000000 | (Math.round(c[2]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[0])) >>> 0;
const col = (k) => pack(rgb(P[k]));
const C = (k) => rgb(P[k]);

// Tones (low nibble of a base-layer index). Land tones are 7..11 so range checks stay cheap.
const T_SPACE = 0, T_OCEAN_DEEP = 3, T_OCEAN = 4, T_OCEAN_HI = 5, T_HALO = 6, T_LAND0 = 7, T_LAND1 = 11, T_COAST = 12, T_GLINT = 13;
const TONES = [
  C('black'), // 0 space
  C('fog'), // 1 star
  C('steel'), // 2 dim star
  mix(C('navy'), C('ink'), 0.55), // 3 deep ocean
  C('navy'), // 4 ocean
  mix(C('navy'), C('blue'), 0.3), // 5 ocean glint
  mix(C('navy'), C('blue'), 0.62), // 6 shallow halo next to land
  C('darkGreen'), // 7 forest
  C('green'), // 8 grass
  C('tan'), // 9 arid
  C('cream'), // 10 desert / tundra
  C('white'), // 11 ice
  mix(C('darkGreen'), C('black'), 0.5), // 12 coastline
  mix(C('blue'), C('white'), 0.3), // 13 water glint
  C('black'), C('black'),
];
// Variant (bits 4..6): 0 plain, 1 minor graticule, 2 major graticule, 3 border. Bit 7: night side.
const PAL = new Uint32Array(256);
const WHITE = C('white'), BLACK = C('black'), NIGHT = mix(C('black'), C('navy'), 0.22);
for (let t = 0; t < 16; t++) {
  for (let v = 0; v < 4; v++) {
    let c = TONES[t];
    if (v === 1) c = mix(c, WHITE, 0.1);
    else if (v === 2) c = mix(c, WHITE, 0.2);
    else if (v === 3) c = mix(c, BLACK, 0.34);
    PAL[(v << 4) | t] = pack(c);
    PAL[128 | (v << 4) | t] = pack(t < 3 ? c : mix(c, NIGHT, 0.6));
  }
}
const RGB = { red: col('red'), darkRed: col('darkRed'), pink: col('pink'), white: col('white'), black: col('black'), yellow: col('yellow'), orange: col('orange'), cream: col('cream'), silver: col('silver') };

// ---------------------------------------------------------------------------------------------
// Ordered-dither matrices
// ---------------------------------------------------------------------------------------------
function bayer(n) {
  const size = 1 << n, out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      for (let i = 0; i < n; i++) v = v * 4 + 2 * (((x ^ y) >> i) & 1) + ((y >> i) & 1);
      out[y * size + x] = (v + 0.5) / (size * size);
    }
  }
  return out;
}
const B4 = bayer(2); // 0..1
const B8 = bayer(3);
const B4_255 = Uint8Array.from(B4, (v) => Math.floor(v * 255));

// ---------------------------------------------------------------------------------------------
// Noise helpers (used offline-at-load for terrain tones and for the ocean shimmer tiles)
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
const GEO = { ready: false, mips: null, texel0: 360 / LAND.w, terrain: null, lines: null, lights: null, dash: null, smooth: null };

function b64(s) {
  const bin = atob(s);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < a.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}

function* stageLand() {
  const W = LAND.w, H = LAND.h;
  const bin = b64(LAND.rle);
  const d0 = new Uint8Array(W * H);
  let p = 0;
  for (let j = 0; j < H; j++) {
    let x = 0, cur = 0;
    while (x < W) {
      let run = 0, shift = 0, b;
      do { b = bin[p++]; run |= (b & 127) << shift; shift += 7; } while (b & 128);
      if (cur) d0.fill(255, j * W + x, j * W + x + run);
      x += run;
      cur ^= 1;
    }
  }
  yield;
  // box-filtered coverage pyramid: level k has texels of 0.088 * 2^k degrees
  const mips = [{ w: W, h: H, d: d0 }];
  for (let l = 1; l <= 6; l++) {
    const q = mips[l - 1], nw = q.w >> 1, nh = q.h >> 1, d = new Uint8Array(nw * nh);
    for (let y = 0; y < nh; y++) {
      const r0 = 2 * y * q.w, r1 = r0 + q.w;
      for (let x = 0; x < nw; x++) {
        const k = 2 * x;
        d[y * nw + x] = (q.d[r0 + k] + q.d[r0 + k + 1] + q.d[r1 + k] + q.d[r1 + k + 1] + 2) >> 2;
      }
    }
    mips.push({ w: nw, h: nh, d });
    if (l === 1) yield;
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

  // distance (deg) from every ocean cell to the nearest land -> depth field (shelf / open / deep ocean)
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
      depth[k] = isLand[k] ? 0 : Math.min(255, Math.round((dist[k] * n) * 20)); // 255 == ~12.75 deg
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
      const s = clamp((q - 0.22) / 0.56, 0, 1);
      fs = s * s * (3 - 2 * s);
    }
    lvl[i] = L; fr[i] = Math.round(fs * 255);
  }
  GEO.lvl = lvl; GEO.fr = fr;
  // ocean depth (0..255, 20 per degree) -> shelf (glint-light) / open / deep, again with dither fractions
  const olvl = new Uint8Array(256), ofr = new Uint8Array(256);
  const ostops = [0, 22, 150]; // 0 deg, ~1.1 deg, ~7.5 deg
  for (let i = 0; i < 256; i++) {
    let L = 0, fs = 0;
    if (i >= ostops[2]) L = 2;
    else {
      L = i >= ostops[1] ? 1 : 0;
      const q = (i - ostops[L]) / (ostops[L + 1] - ostops[L]);
      const s = clamp((q - 0.15) / 0.7, 0, 1);
      fs = s * s * (3 - 2 * s);
    }
    olvl[i] = L; ofr[i] = Math.round(fs * 255);
  }
  GEO.olvl = olvl; GEO.ofr = ofr;
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
  // boundaries
  const bin = b64(BORDERS.data);
  let p = 0;
  const rd = () => { let v = 0, s = 0, b; do { b = bin[p++]; v |= (b & 127) << s; s += 7; } while (b & 128); return v; };
  const nLines = rd();
  const lines = [];
  for (let i = 0; i < nLines; i++) {
    const n = rd();
    const pts = new Float32Array(n * 2);
    let qx = 0, qy = 0, minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    for (let k = 0; k < n; k++) {
      let zx = rd(), zy = rd();
      qx += zx & 1 ? -((zx + 1) >> 1) : zx >> 1;
      qy += zy & 1 ? -((zy + 1) >> 1) : zy >> 1;
      const lon = qx / BORDERS.scale, lat = qy / BORDERS.scale;
      pts[2 * k] = lon; pts[2 * k + 1] = lat;
      if (lon < minx) minx = lon; if (lon > maxx) maxx = lon; if (lat < miny) miny = lat; if (lat > maxy) maxy = lat;
    }
    lines.push({ pts, n, minx, maxx, miny, maxy });
  }
  GEO.lines = lines;
  yield;
  // night-light clusters
  const rnd = mulberry32(20240607);
  const lon = [], lat = [], kind = [];
  for (const [la, lo, sz] of CITIES) {
    const n = 2 + sz * sz;
    const spread = 0.1 + 0.1 * sz;
    for (let k = 0; k < n; k++) {
      const a = rnd() * Math.PI * 2, r = spread * Math.sqrt(-Math.log(1 - rnd() * 0.97)) * 0.7;
      lon.push(lo + (Math.cos(a) * r) / Math.max(0.35, Math.cos(la * DEG)));
      lat.push(la + Math.sin(a) * r);
      kind.push(k === 0 ? 3 : rnd() < 0.45 ? 1 : 0);
    }
  }
  GEO.lights = { lon: Float32Array.from(lon), lat: Float32Array.from(lat), kind: Uint8Array.from(kind), n: lon.length };
  // ocean glints: a sparse tile of 2-3 px "wave dashes" (256x256) revealed by a slowly scrolling smooth mask (128x128)
  const rr = mulberry32(7);
  const dash = new Uint8Array(256 * 256);
  for (let k = 0; k < 256 * 256 * 0.012; k++) {
    const gx = Math.floor(rr() * 256), gy = Math.floor(rr() * 256), len = rr() < 0.4 ? 3 : 2;
    for (let q = 0; q < len; q++) dash[gy * 256 + ((gx + q) & 255)] = 1;
  }
  const smooth = new Uint8Array(128 * 128), cells = 8, grid = new Float32Array(cells * cells);
  for (let i = 0; i < grid.length; i++) grid[i] = rr();
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const fx = (x / 128) * cells, fy = (y / 128) * cells, x0 = Math.floor(fx), y0 = Math.floor(fy);
      const u = fx - x0, v = fy - y0, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
      const a = grid[(y0 % cells) * cells + (x0 % cells)], b = grid[(y0 % cells) * cells + ((x0 + 1) % cells)];
      const c = grid[((y0 + 1) % cells) * cells + (x0 % cells)], d = grid[((y0 + 1) % cells) * cells + ((x0 + 1) % cells)];
      smooth[y * 128 + x] = Math.round((a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv) * 255);
    }
  }
  GEO.dash = dash;
  GEO.smooth = smooth;
}

// Init runs as three generators (each yields every few ms of work) and is drained in the background,
// one slice per timer task, right after the module loads; drawWorldMap finishes whatever is left on demand.
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
if (typeof setTimeout === 'function') {
  const kick = () => {
    if (stepInit()) setTimeout(kick, 0);
  };
  setTimeout(kick, 0);
}

// ---------------------------------------------------------------------------------------------
// Sun position (subsolar point) from the wall-clock UTC time
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
// View
// ---------------------------------------------------------------------------------------------
const HOTSPOTS = [
  [40.7, -74.0], [51.5, -0.1], [50.45, 30.5], [31.8, 35.2], [35.7, 51.4], [28.6, 77.2], [39.9, 116.4], [35.7, 139.7], [-33.9, 151.2],
  [-23.5, -46.6], [6.5, 3.4], [-1.3, 36.8], [55.8, 37.6], [19.4, -99.1], [38.9, -77.0], [24.7, 46.7],
];

function computeView(w, h, mini, t, dt, lat, lon) {
  const s0 = w / 360; // world view: the whole globe across the width
  if (lat === null) {
    const s = s0 * (mini ? 1.7 : 1.4);
    // pan whole pixels so coastlines never swim and the base layer is rebuilt only on a pixel step
    const clon = Math.round((t * (mini ? 2.2 : 3.2)) * s) / s - 20;
    const clat = Math.round((mini ? 10 : 12 + 5 * Math.sin(t * 0.06)) * s) / s;
    return { clon, clat, s, kx: 1, ax: -1, ay: -1, idle: true };
  }
  const zoom = mini ? 4.5 : 5.5;
  const kxEnd = clamp(Math.cos(lat * DEG), 0.5, 1);
  const f = clamp(dt / FLY_T, 0, 1);
  const ez = easeInOut(f);
  const ep = easeInOut(clamp(f * 1.18, 0, 1));
  const s = s0 * Math.pow(zoom, ez);
  const kx = 1 + (kxEnd - 1) * ez;
  const pinX = w / 2, pinY = mini ? h / 2 : Math.round(h * 0.43);
  const ax0 = w / 2 + START_LON_OFFSET * s0, ay0 = h / 2 - lat * s0;
  const ax = ax0 + (pinX - ax0) * ep, ay = ay0 + (pinY - ay0) * ep;
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
  rt = {
    w, h, canvas, cctx, img, u32: new Uint32Array(img.data.buffer),
    base: new Uint8Array(w * h), land: new Uint8Array(w * h), edge: new Uint8Array(w * h),
    cx0: new Int32Array(w), cx1: new Int32Array(w), cfx: new Float32Array(w),
    tx0: new Int32Array(w), tx1: new Int32Array(w), tfx: new Float32Array(w),
    colLon: new Float64Array(w), colC: new Float32Array(w), gcol: new Uint8Array(w),
    ry0: new Int32Array(h), ry1: new Int32Array(h), rfy: new Float32Array(h),
    ty0: new Int32Array(h), ty1: new Int32Array(h), tfy: new Float32Array(h),
    rowLat: new Float64Array(h), rowSpace: new Uint8Array(h), grow: new Uint8Array(h), rowA: new Float32Array(h), rowB: new Float32Array(h),
    key: null, lastClon: NaN, lastClat: NaN, lastS: NaN, lastKx: NaN,
  };
  INSTANCES.set(key, rt);
  return rt;
}

// ---------------------------------------------------------------------------------------------
// Base layer: land / terrain tones / coast / borders / graticule  (rebuilt only when the view changes)
// ---------------------------------------------------------------------------------------------
function renderBase(rt, view) {
  const T0 = performance.now();
  const w = rt.w, h = rt.h;
  const sx = view.s * view.kx, sy = view.s;
  const mips = GEO.mips;
  const pxDeg = 1 / Math.sqrt(sx * sy);
  let lvl = Math.floor(Math.log2(pxDeg / GEO.texel0));
  lvl = lvl < 0 ? 0 : lvl > mips.length - 1 ? mips.length - 1 : lvl;
  const mip = mips[lvl], Wl = mip.w, Hl = mip.h, m = mip.d;
  const terr = GEO.terrain, depth = GEO.depth, LVL = GEO.lvl, FR = GEO.fr, OLVL = GEO.olvl, OFR = GEO.ofr;
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
    ry0[y] = (b0 < 0 ? 0 : b0 > Hl - 1 ? Hl - 1 : b0) * Wl;
    b0++;
    ry1[y] = (b0 < 0 ? 0 : b0 > Hl - 1 ? Hl - 1 : b0) * Wl;
    b = ((90 - lat) / 180) * TH - 0.5; b0 = Math.floor(b);
    tfy[y] = b - b0;
    ty0[y] = (b0 < 0 ? 0 : b0 > TH - 1 ? TH - 1 : b0) * TW;
    b0++;
    ty1[y] = (b0 < 0 ? 0 : b0 > TH - 1 ? TH - 1 : b0) * TW;
  }

  const T1 = performance.now();
  // pass 1: land flags (0 ocean, 1 land, 2 beyond the poles); shoreline pixels are flagged on the fly
  // (edge bit 1 = land pixel touching ocean -> coastline, bit 2 = ocean pixel touching land -> shallow halo)
  const thr = lvl === 0 ? 127 : 112;
  edge.fill(0);
  for (let y = 0; y < h; y++) {
    let i = y * w;
    if (rowSpace[y]) { land.fill(2, i, i + w); continue; }
    const o0 = ry0[y], o1 = ry1[y], fy = rfy[y];
    for (let x = 0; x < w; x++, i++) {
      const c0 = cx0[x], c1 = cx1[x];
      const a = m[o0 + c0], b = m[o0 + c1], c = m[o1 + c0], d = m[o1 + c1];
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

  const T2 = performance.now();
  // pass 2: tones (terrain / ocean depth, ordered-dithered between adjacent tones)
  for (let y = 0; y < h; y++) {
    const row = y * w;
    if (rowSpace[y]) {
      for (let x = 0; x < w; x++) {
        const hv = hash2(x * 7 + 13, y * 5 + 7);
        base[row + x] = hv < 0.008 ? 1 : hv < 0.03 ? 2 : T_SPACE;
      }
      continue;
    }
    const t0 = ty0[y], t1 = ty1[y], tfyv = tfy[y], by4 = (y & 3) << 2;
    for (let x = 0; x < w; x++) {
      const i = row + x, L = land[i];
      if (L === 1) {
        if (edge[i]) base[i] = T_COAST;
        else {
          const a0 = tx0[x], a1 = tx1[x], fx = tfx[x];
          const a = terr[t0 + a0], b = terr[t0 + a1], c = terr[t1 + a0], d = terr[t1 + a1];
          const top = a + (b - a) * fx;
          const v = (top + (c + (d - c) * fx - top) * tfyv) | 0;
          base[i] = T_LAND0 + LVL[v] + (FR[v] > B4_255[by4 | (x & 3)] ? 1 : 0);
        }
      } else if (L === 0) {
        if (edge[i]) base[i] = T_HALO;
        else {
          const a0 = tx0[x], a1 = tx1[x], fx = tfx[x];
          const a = depth[t0 + a0], b = depth[t0 + a1], c = depth[t1 + a0], d = depth[t1 + a1];
          const top = a + (b - a) * fx;
          const v = (top + (c + (d - c) * fx - top) * tfyv) | 0;
          base[i] = T_OCEAN_HI - OLVL[v] + (OFR[v] > B4_255[by4 | (x & 3)] ? -1 : 0);
        }
      } else base[i] = T_SPACE;
    }
  }

  const T3 = performance.now();
  // country borders (vector polylines -> 1-px lines), fading in with zoom
  if (view.s > 1.7 && GEO.lines) drawBorders(rt, view, clamp((view.s - 1.7) / 1.1, 0, 1));

  const T4 = performance.now();
  // graticule
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
      let g = gcol[x] > gy ? gcol[x] : gy;
      if (!g) continue;
      if (g === 1 && ((x + y) & 1)) continue; // minor lines are dotted
      const i = row + x, b = base[i];
      if (b >= T_OCEAN_DEEP && b <= T_LAND1) base[i] = b | (g << 4);
    }
  }
  { const T5 = performance.now(); const P = globalThis.__prof; P.setup += T1 - T0; P.p1 += T2 - T1; P.p2 += T3 - T2; P.border += T4 - T3; P.grid += T5 - T4; P.n++; }
}

globalThis.__prof = globalThis.__prof || {};
function drawBorders(rt, view, fade) {
  const { w, h, base } = rt;
  const sx = view.s * view.kx, sy = view.s;
  const lonL = view.clon - w / 2 / sx, lonR = view.clon + w / 2 / sx;
  const latT = view.clat + h / 2 / sy, latB = view.clat - h / 2 / sy;
  const halfW = w / 2, halfH = h / 2, clon = view.clon, clat = view.clat;
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
          // Bresenham on pixel cells
          let x0 = Math.floor(px), y0 = Math.floor(py);
          const x1 = Math.floor(nx), y1 = Math.floor(ny);
          const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), stx = x0 < x1 ? 1 : -1, sty = y0 < y1 ? 1 : -1;
          let err = dx + dy, guard = dx - dy + 2;
          if (guard < 3000) {
            for (;;) {
              if (x0 >= 0 && x0 < w && y0 >= 0 && y0 < h) {
                const i = y0 * w + x0, b = base[i];
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
// Pin sprite, rings
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
      else if (dx * dx + dy * dy <= (R * 0.42) * (R * 0.42) + 0.6) c = RGB.white;
      else if (-dx * 0.75 - dy * 0.75 > R * 0.78) c = RGB.pink;
      else if (dx * 0.7 + dy * 0.45 > R * 0.55 || y > cy + R * 0.7 && dx > 0) c = RGB.darkRed;
      else c = RGB.red;
      px[y * w + x] = c;
    }
  }
  return { w, h: H, px, tipX: R, tipY: H - 1 };
}
const PIN_FULL = makePin(5, 16);
const PIN_MINI = makePin(3, 10);

const RING_CACHE = new Map();
function ringPoints(r) {
  let pts = RING_CACHE.get(r);
  if (pts) return pts;
  const out = [];
  const seen = new Set();
  const add = (x, y) => { const k = x * 4096 + y; if (!seen.has(k)) { seen.add(k); out.push(x, y); } };
  let x = r, y = 0, err = 1 - r;
  while (x >= y) {
    add(x, y); add(y, x); add(-y, x); add(-x, y); add(-x, -y); add(-y, -x); add(y, -x); add(x, -y);
    y++;
    if (err < 0) err += 2 * y + 1; else { x--; err += 2 * (y - x) + 1; }
  }
  pts = Int16Array.from(out);
  RING_CACHE.set(r, pts);
  return pts;
}

function plot(u32, w, h, x, y, c) {
  if (x >= 0 && x < w && y >= 0 && y < h) u32[y * w + x] = c;
}

function dropOffset(u, hgt) {
  if (u < 0.5) { const k = u / 0.5; return -hgt * (1 - k * k); }
  if (u < 0.78) return -5 * Math.sin(((u - 0.5) / 0.28) * Math.PI);
  if (u < 1) return -1.5 * Math.sin(((u - 0.78) / 0.22) * Math.PI);
  return 0;
}

function drawRings(rt, cx, cy, tLocal, mini, a0 = 1) {
  const { u32, w, h } = rt;
  const period = mini ? 1.5 : 1.8, rMax = mini ? 11 : 28, rMin = mini ? 2 : 4;
  for (let k = 0; k < 3; k++) {
    const u = (((tLocal - (k * period) / 3) % period) + period) % period / period;
    if (tLocal < (k * period) / 3) continue; // rings appear one after another
    const r = Math.round(rMin + (rMax - rMin) * easeOut(u));
    const alpha = Math.pow(1 - u, 1.1) * a0;
    const pts = ringPoints(r);
    const thr = alpha * 16;
    for (let q = 0; q < pts.length; q += 2) {
      const x = cx + pts[q], y = cy + pts[q + 1];
      if (B4[((y & 3) << 2) | (x & 3)] * 16 < thr) plot(u32, w, h, x, y, k === 1 ? RGB.white : RGB.red);
    }
    if (!mini && u < 0.5) {
      const p2 = ringPoints(Math.max(1, r - 1));
      for (let q = 0; q < p2.length; q += 2) {
        const x = cx + p2[q], y = cy + p2[q + 1];
        if (B4[((y & 3) << 2) | (x & 3)] * 16 < thr * 0.6) plot(u32, w, h, x, y, RGB.darkRed);
      }
    }
  }
}

function drawPin(rt, cx, cy, off, sprite, shadowK) {
  const { u32, w, h } = rt;
  // flat ground shadow (50% dither of the palette black)
  const rx = sprite.w * 0.62 * shadowK, ry = sprite.w * 0.2 * shadowK;
  if (rx >= 1) {
    const ix = Math.ceil(rx), iy = Math.ceil(ry);
    for (let dy = -iy; dy <= iy; dy++) {
      for (let dx = -ix; dx <= ix; dx++) {
        if ((dx * dx) / (rx * rx) + (dy * dy) / (Math.max(ry, 0.8) * Math.max(ry, 0.8)) <= 1 && ((cx + dx + cy + dy) & 1) === 0) plot(u32, w, h, cx + dx, cy + dy + 1, RGB.black);
      }
    }
  }
  const x0 = cx - sprite.tipX, y0 = Math.round(cy - sprite.tipY + off);
  for (let y = 0; y < sprite.h; y++) {
    for (let x = 0; x < sprite.w; x++) {
      const c = sprite.px[y * sprite.w + x];
      if (c) plot(u32, w, h, x0 + x, y0 + y, c);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------------------------
export function drawWorldMap(ctx, t, dt, o = {}) { const a = performance.now(); drawWorldMap0(ctx, t, dt, o); const P = globalThis.__prof; P.frame += performance.now() - a; }
function drawWorldMap0(ctx, t, dt, { lat = null, lon = null, place = '', x = 0, y = 0, w = 384, h = 216, mini = false } = {}) {
  ensureInit();
  w = Math.max(8, Math.round(w)); h = Math.max(8, Math.round(h));
  x = Math.round(x); y = Math.round(y);
  dt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  const hasTarget = Number.isFinite(lat) && Number.isFinite(lon);
  const view = computeView(w, h, mini, t, dt, hasTarget ? clamp(lat, -89.9, 89.9) : null, hasTarget ? lon : null);
  const rt = getInstance(w, h);

  if (view.clon !== rt.lastClon || view.clat !== rt.lastClat || view.s !== rt.lastS || view.kx !== rt.lastKx) {
    renderBase(rt, view);
    rt.lastClon = view.clon; rt.lastClat = view.clat; rt.lastS = view.s; rt.lastKx = view.kx;
  }

  // ---- per-frame pass: ocean shimmer + day/night terminator, palette lookup ----
  const { u32, base, colLon, colC, rowLat, rowA, rowB } = rt;
  const sun = sunPosition(Date.now());
  const sinD = Math.sin(sun.dec), cosD = Math.cos(sun.dec);
  for (let xx = 0; xx < w; xx++) colC[xx] = Math.cos((colLon[xx] - sun.lon) * DEG);
  for (let yy = 0; yy < h; yy++) {
    const la = rowLat[yy] * DEG;
    rowA[yy] = Math.sin(la) * sinD;
    rowB[yy] = Math.cos(la) * cosD;
  }
  const dash = GEO.dash, smooth = GEO.smooth;
  const step = Math.floor(t * 4);
  const oxD = step, oyD = Math.floor(step / 5), oxS = -Math.floor(t * 3), oyS = Math.floor(t * 2);
  const nightScale = 1 / 0.33;
  let i = 0;
  for (let yy = 0; yy < h; yy++) {
    const a = rowA[yy], b = rowB[yy];
    const t8 = (yy & 7) << 3, t4 = (yy & 3) << 2;
    const rd = ((yy + oyD) & 255) << 8, rs = ((yy + oyS) & 127) << 7;
    for (let xx = 0; xx < w; xx++, i++) {
      let idx = base[i];
      if (idx >= T_OCEAN_DEEP && idx <= T_OCEAN_HI && dash[rd | ((xx + oxD) & 255)] === 1 && smooth[rs | ((xx + oxS) & 127)] > 120 + B4_255[t4 | (xx & 3)] * 0.3) idx = T_GLINT;
      if ((0.08 - a - b * colC[xx]) * nightScale > B8[t8 | (xx & 7)]) idx |= 128;
      u32[i] = PAL[idx];
    }
  }

  const sx = view.s * view.kx, sy = view.s;

  // ---- night lights ----
  if (!mini && GEO.lights && view.s > 0.9) {
    const L = GEO.lights;
    const wob = Math.floor(t * 1.5);
    for (let q = 0; q < L.n; q++) {
      let dl = L.lon[q] - view.clon;
      dl -= Math.round(dl / 360) * 360;
      const px = Math.floor(dl * sx + w / 2), py = Math.floor((view.clat - L.lat[q]) * sy + h / 2);
      if (px < 0 || px >= w || py < 0 || py >= h) continue;
      const bi = py * w + px, tone = base[bi];
      if (tone < T_LAND0 || tone > T_LAND1 || (rowA[py] === undefined)) continue;
      const nv = (0.08 - rowA[py] - rowB[py] * colC[px]) * nightScale;
      if (nv < 0.62) continue;
      if (hash2(q, wob) < 0.04) continue; // a few flicker
      const kd = L.kind[q];
      u32[bi] = kd === 3 ? RGB.cream : kd === 1 ? RGB.orange : RGB.yellow;
    }
  }

  // ---- idle hotspots / target markers ----
  if (view.idle) {
    for (let q = 0; q < HOTSPOTS.length; q++) {
      const ph = (t * 0.55 + q * 0.37) % 1;
      if (ph > 0.7) continue;
      let dl = HOTSPOTS[q][1] - view.clon;
      dl -= Math.round(dl / 360) * 360;
      const px = Math.round(dl * sx + w / 2 - 0.5), py = Math.round((view.clat - HOTSPOTS[q][0]) * sy + h / 2 - 0.5);
      if (px < -12 || px > w + 12 || py < -12 || py > h + 12) continue;
      if (mini) { plot(u32, w, h, px, py, ph < 0.35 ? RGB.red : RGB.white); continue; }
      const r = Math.round(1 + (ph / 0.7) * 6);
      const pts = ringPoints(r), alpha = 1 - ph / 0.7;
      for (let z = 0; z < pts.length; z += 2) {
        const gx = px + pts[z], gy = py + pts[z + 1];
        if (B4[((gy & 3) << 2) | (gx & 3)] * 16 < alpha * 16) plot(u32, w, h, gx, gy, RGB.red);
      }
      plot(u32, w, h, px, py, RGB.white);
      plot(u32, w, h, px - 1, py, RGB.red); plot(u32, w, h, px + 1, py, RGB.red); plot(u32, w, h, px, py - 1, RGB.red); plot(u32, w, h, px, py + 1, RGB.red);
    }
  }

  // ---- pin, rings ----
  let pinInfo = null;
  if (!view.idle) {
    const cx = Math.round(view.ax), cy = Math.round(view.ay);
    const sprite = mini ? PIN_MINI : PIN_FULL;
    const tp = dt - PIN_T;
    if (tp < 0) {
      // reticle that blinks on the target while we fly in
      if (((dt * 4) % 1) < 0.62) {
        const d = mini ? 2 : 4, l = mini ? 1 : 2;
        for (let q = 0; q < l; q++) {
          plot(u32, w, h, cx - d - q, cy, RGB.white); plot(u32, w, h, cx + d + q, cy, RGB.white);
          plot(u32, w, h, cx, cy - d - q, RGB.white); plot(u32, w, h, cx, cy + d + q, RGB.white);
        }
        plot(u32, w, h, cx, cy, RGB.red);
      }
    } else {
      const hgt = (mini ? 12 : 20) + view.ay; // starts above the top edge
      const u = tp / PIN_DROP;
      const off = u >= 1 ? 0 : dropOffset(u, hgt);
      const landed = tp >= PIN_DROP * 0.5;
      if (landed) drawRings(rt, cx, cy, tp - PIN_DROP * 0.5, mini, 1);
      const shadowK = u >= 1 ? 1 : 0.35 + 0.65 * clamp(1 + off / hgt, 0, 1);
      drawPin(rt, cx, cy, off, sprite, shadowK);
      pinInfo = { cx, cy, head: cy - sprite.tipY + sprite.w / 2 };
    }
  }

  rt.cctx.putImageData(rt.img, 0, 0);
  ctx.drawImage(rt.canvas, x, y);

  // ---- label ----
  if (!mini && pinInfo && place) drawLabel(ctx, x, y, w, h, pinInfo, place, lat, lon, dt);
}

function coordText(lat, lon) {
  return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
}

function drawLabel(ctx, x, y, w, h, pin, place, lat, lon, dt) {
  const tl = dt - LABEL_T;
  if (tl < 0) return;
  const e = easeOut(tl / LABEL_DUR);
  // text layout: place name at 2x (wrapped to at most two lines), coordinates small underneath
  let scale = 2, lines = wrapText(place, 168, scale);
  if (lines.length > 2) { scale = 1; lines = wrapText(place, 168, scale); }
  const coords = coordText(lat, lon);
  let tw = measureText(coords, 1);
  for (const l of lines) tw = Math.max(tw, measureText(l, scale));
  const lineH = scale === 2 ? 14 : 7;
  const bw = tw + 14, bh = 4 + lines.length * lineH + (lines.length - 1) * 3 + 4 + 7 + 4;
  const gap = 12;
  let right = pin.cx + gap + bw <= w - 6;
  let bx = right ? pin.cx + gap : pin.cx - gap - bw;
  bx = clamp(bx, 4, w - 4 - bw);
  const minTop = 24, maxTop = h - 44 - bh;
  let by = clamp(Math.round(pin.head - bh / 2), minTop, Math.max(minTop, maxTop));

  ctx.save();
  // wipe in from the pin side
  const vis = Math.max(1, Math.round((bw + 6) * e));
  ctx.beginPath();
  if (right) ctx.rect(x + bx - 4, y + by - 2, vis, bh + 4);
  else ctx.rect(x + bx + bw + 4 - vis, y + by - 2, vis, bh + 4);
  ctx.clip();

  // leader from the pin head to the box
  const ly = clamp(pin.head, by + 3, by + bh - 4);
  ctx.fillStyle = P.white;
  if (right) ctx.fillRect(x + pin.cx + 6, y + ly, bx - pin.cx - 6, 1);
  else ctx.fillRect(x + bx + bw, y + ly, pin.cx - 6 - (bx + bw), 1);

  ctx.globalAlpha = 0.45;
  ctx.fillStyle = P.black;
  ctx.fillRect(x + bx + 2, y + by + 2, bw, bh);
  ctx.globalAlpha = 1;
  ctx.fillStyle = P.white;
  ctx.fillRect(x + bx, y + by, bw, bh);
  ctx.fillStyle = P.black;
  ctx.fillRect(x + bx + 1, y + by + 1, bw - 2, bh - 2);
  ctx.fillStyle = P.red;
  ctx.fillRect(x + bx + 1, y + by + 1, 3, bh - 2);
  ctx.fillStyle = P.darkRed;
  ctx.fillRect(x + bx + 4, y + by + 1, 1, bh - 2);

  let capY = y + by + 4; // drawText takes the cap line (top of the capital letters)
  for (const l of lines) {
    drawText(ctx, l, x + bx + 9, capY, { color: P.white, scale });
    capY += lineH + 3;
  }
  drawText(ctx, coords, x + bx + 9, capY + 1, { color: P.fog, scale: 1 });
  ctx.restore();
}
