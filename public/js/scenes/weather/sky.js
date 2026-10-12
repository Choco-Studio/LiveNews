// WORLD WEATHER's moving sky on the wall (round 3, owner 12 Oct: "el programa del tiempo necesita mejoras enormes"):
// the forecast's own cloud, rain, wind and pressure (server/weathersky.js: a 3-degree grid, a frame every 3 hours)
// played over the heat map as the weather bulletins do it: cloud that drifts and builds, rain in radar colours,
// isobars, the highs and lows travelling with the frames. Palette colours only, ordered dither, no blends.
//
//   decodeSky(sky)                   the episode's sky (base64 layers) as numbers, or null (cached per object)
//   new SkyClock(S).at(hour)         the layers at a fractional hour: Catmull-Rom between the frames (smooth, no
//                                    kink at each frame), clamped to each layer's range
//   sampleLayer(S, grid, lat, lon)   one layer at a place: bilinear on the grid, longitude wrapping
//   trackSystems(S) / systemsAt(tracks, hour)   the highs and lows matched frame to frame (the nearest of the same
//                                    kind), their positions in between
//   isobarSegments(field, w, h, level)   marching squares: the contour of one pressure level (grid coordinates)
//   cloudTexture()                   the cloud shape: a tileable fBm, equalised (uniform 0..1), with mips
//   composeSky(dst, base, w, h, view, clock, opts)   the sky over a map frame (Uint32 pixels, worldmap.js view)
//
// How the cloud looks like cloud: the cover (%) says how much of each place is cloud; the texture says where. A
// pixel is cloud where the texture is above 1 - cover (the texture is equalised, so a 60 % cover is 60 % of the
// area), thin at the edges and thick in the cores (fog, silver, white), lit from the west along each row. The
// texture is anchored to the Earth and advected by the forecast's wind: a feature sits at p + wind x time, so the
// time-lapse carries it downwind while the cover field builds and clears it. Rain is shaped by the same texture at
// twice the frequency (cells inside the bands) and drawn over the cloud, in radar colours by intensity.
//
// The per-pixel work runs on a coarse node grid (every 4 px: cover, rain, the wind's offset, pressure) read
// bilinearly along each row, and one texture read per pixel (two where it rains).
import { P } from '../../palette.js';

const DEG = Math.PI / 180;
const pack = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return (0xff000000 | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0;
};
export const PK = Object.freeze(Object.fromEntries(Object.entries(P).map(([k, v]) => [k, pack(v)])));
const B16 = Uint8Array.from([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]);
const B4 = Float32Array.from(B16, (v) => (v + 0.5) / 16);

// A collision-free hash of the palette's packed colours onto 0..255 (a multiplier found once), so the per-pixel
// code turns a colour into another through a 256-entry table instead of a Map. Only palette colours may be hashed.
const PAL_PK = [...new Set(Object.values(PK))];
export const HASH_M = (() => {
  let m = 0x9e3779b1;
  for (let k = 0; k < 1e6; k++, m = (Math.imul(m, 1664525) + 1013904223) >>> 0) {
    const seen = new Uint8Array(256);
    let ok = true;
    for (const c of PAL_PK) {
      const h = Math.imul(c, m | 1) >>> 24;
      if (seen[h]) {
        ok = false;
        break;
      }
      seen[h] = 1;
    }
    if (ok) return m | 1;
  }
  throw new Error('no palette hash');
})();
/** The palette colour's slot in a colour table. */
export const hashOf = (c) => Math.imul(c, HASH_M) >>> 24;
/** A palette -> palette map as a table of 256 (indexed by hashOf). */
export function colourTable(f) {
  const t = new Uint32Array(256);
  for (const c of PAL_PK) t[hashOf(c)] = f(c) >>> 0;
  return t;
}

const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

// ------------------------------------------------------------------------------------------- decode
const DECODED = new WeakMap();
const LAYERS = ['cloud', 'rain', 'u', 'v', 'mslp'];

function bytes(s, n) {
  if (typeof s !== 'string') return null;
  let bin;
  try {
    bin = atob(s);
  } catch {
    return null;
  }
  if (bin.length !== n) return null;
  return bin;
}

/** One layer back to its unit: % / mm per hour / m/s / hPa (server/weathersky.js encodeLayer). */
export function decodeLayer(kind, s, n) {
  const bin = bytes(s, n);
  if (!bin) return null;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const b = bin.charCodeAt(i);
    out[i] = kind === 'u' || kind === 'v' ? (b << 24) >> 24 : kind === 'cloud' ? b : kind === 'rain' ? b / 10 : b + 940;
  }
  return out;
}

/**
 * The episode's sky as numbers: { w, h, lat0, lon0, step, n, frames, hours, start, cloud: [Float32Array], rain, u,
 * v, mslp, systems, tracks }, or null when there is no sky or it does not decode (the map then plays still).
 */
export function decodeSky(sky) {
  if (!sky || typeof sky !== 'object') return null;
  const hit = DECODED.get(sky);
  if (hit !== undefined) return hit;
  let out = null;
  const w = sky.w | 0, h = sky.h | 0, step = Number(sky.step), n = w * h;
  if (w >= 4 && h >= 4 && step > 0 && Array.isArray(sky.hours)) {
    let frames = sky.hours.length;
    for (const k of LAYERS) frames = Math.min(frames, Array.isArray(sky[k]) ? sky[k].length : 0);
    const S = { w, h, n, step, lat0: Number(sky.lat0), lon0: Number(sky.lon0), hours: sky.hours.slice(0, frames).map(Number), start: Date.parse(sky.start) || 0, demo: !!sky.demo };
    let ok = frames >= 2 && Number.isFinite(S.lat0) && Number.isFinite(S.lon0);
    for (const k of LAYERS) {
      if (!ok) break;
      S[k] = [];
      for (let f = 0; f < frames && ok; f++) {
        const a = decodeLayer(k, sky[k][f], n);
        if (a) S[k].push(a);
        else ok = false;
      }
    }
    if (ok) {
      S.frames = frames;
      // the wind that carries the cloud texture, smoothed over about 9 degrees: the texture then travels with the
      // flow instead of being sheared into streaks by every local gust
      for (const k of ['u', 'v']) for (const f of S[k]) smoothGrid(f, w, h, 1, 2);
      S.systems = (Array.isArray(sky.systems) ? sky.systems : []).filter((s) => (s?.kind === 'H' || s?.kind === 'L') && Number.isFinite(s.lat) && Number.isFinite(s.lon) && s.frame >= 0 && s.frame < frames);
      S.tracks = trackSystems(S);
      out = S;
    }
  }
  DECODED.set(sky, out);
  return out;
}

/** A box blur of a grid in place (radius r cells, `passes` times; rows clamp, longitude wraps). */
export function smoothGrid(f, w, h, r = 1, passes = 1) {
  const tmp = new Float32Array(f.length);
  const n = 2 * r + 1;
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        let s = 0;
        for (let d = -r; d <= r; d++) s += f[j * w + ((((i + d) % w) + w) % w)];
        tmp[j * w + i] = s / n;
      }
    }
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        let s = 0;
        for (let d = -r; d <= r; d++) s += tmp[Math.max(0, Math.min(h - 1, j + d)) * w + i];
        f[j * w + i] = s / n;
      }
    }
  }
  return f;
}

/** The fractional frame of an hour of the sky (its hours need not be evenly spaced). */
export function frameOf(S, hour) {
  const hs = S.hours;
  if (!(hour > hs[0])) return 0;
  for (let k = 1; k < hs.length; k++) if (hour <= hs[k]) return k - 1 + (hour - hs[k - 1]) / (hs[k] - hs[k - 1] || 1);
  return hs.length - 1;
}

/** The layers at a fractional hour, tweened with Catmull-Rom through the frames (reuses its buffers). */
export class SkyClock {
  constructor(S) {
    this.S = S;
    this.cur = {};
    for (const k of LAYERS) this.cur[k] = new Float32Array(S.n);
    this.f = NaN;
  }

  at(hour) {
    const S = this.S;
    const f = frameOf(S, hour);
    if (f === this.f) return this.cur;
    this.f = f;
    const last = S.frames - 1;
    const k1 = Math.min(last, Math.floor(f)), u = f - k1;
    const k0 = Math.max(0, k1 - 1), k2 = Math.min(last, k1 + 1), k3 = Math.min(last, k1 + 2);
    // Catmull-Rom weights
    const u2 = u * u, u3 = u2 * u;
    const w0 = -0.5 * u3 + u2 - 0.5 * u, w1 = 1.5 * u3 - 2.5 * u2 + 1, w2 = -1.5 * u3 + 2 * u2 + 0.5 * u, w3 = 0.5 * u3 - 0.5 * u2;
    for (const k of LAYERS) {
      const a = S[k][k0], b = S[k][k1], c = S[k][k2], d = S[k][k3], o = this.cur[k];
      const lo = k === 'cloud' || k === 'rain' ? 0 : -1e9, hi = k === 'cloud' ? 100 : 1e9;
      if (u === 0) o.set(b);
      else {
        for (let i = 0; i < o.length; i++) {
          const v = w0 * a[i] + w1 * b[i] + w2 * c[i] + w3 * d[i];
          o[i] = v < lo ? lo : v > hi ? hi : v;
        }
      }
    }
    return this.cur;
  }
}

/** A layer at a place: bilinear on the grid (rows north to south), the longitude wrapping round. */
export function sampleLayer(S, grid, lat, lon) {
  let gx = (lon - S.lon0) / S.step;
  gx -= Math.floor(gx / S.w) * S.w;
  let gy = (S.lat0 - lat) / S.step;
  gy = gy < 0 ? 0 : gy > S.h - 1 ? S.h - 1 : gy;
  const i0 = Math.floor(gx), j0 = Math.min(S.h - 2, Math.floor(gy));
  const i1 = i0 + 1 >= S.w ? 0 : i0 + 1;
  const fx = gx - i0, fy = gy - j0;
  const a = grid[j0 * S.w + i0], b = grid[j0 * S.w + i1], c = grid[(j0 + 1) * S.w + i0], d = grid[(j0 + 1) * S.w + i1];
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

// ------------------------------------------------------------------------------------------- highs and lows
const wrapD = (d) => d - Math.round(d / 360) * 360;
/** Degrees between two places on a flat-ish map (longitude shrunk by latitude): enough to match systems. */
function apart(a, b) {
  return Math.hypot(wrapD(b.lon - a.lon) * Math.cos(((a.lat + b.lat) / 2) * DEG), b.lat - a.lat);
}

/**
 * A system's centre to a fraction of a cell: a parabola through the pressure of the cell and its neighbours along
 * each axis (the server finds them on the 3-degree grid; a centre that sits between two cells would otherwise hop
 * back and forth between them from frame to frame).
 */
export function refineCentre(S, s) {
  const f = S.mslp?.[s.frame];
  if (!f) return { lat: s.lat, lon: s.lon };
  const i = Math.round((s.lon - S.lon0) / S.step), j = Math.round((S.lat0 - s.lat) / S.step);
  if (j < 1 || j > S.h - 2) return { lat: s.lat, lon: s.lon };
  const at = (ii, jj) => f[jj * S.w + ((((ii % S.w) + S.w) % S.w))];
  const off = (a, b, c) => {
    const den = a - 2 * b + c;
    return Math.abs(den) < 1e-6 ? 0 : Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den));
  };
  const dx = off(at(i - 1, j), at(i, j), at(i + 1, j)), dy = off(at(i, j - 1), at(i, j), at(i, j + 1));
  return { lat: S.lat0 - (j + dy) * S.step, lon: S.lon0 + (i + dx) * S.step };
}

/**
 * The highs and lows as tracks: each system of a frame continues as the nearest system of the same kind in the next
 * frame within 12 degrees (the nearest pairs first, each used once); one not matched ends, a new one starts. Each
 * centre is refined to a fraction of a cell, then each track is smoothed over its neighbouring frames (1-2-1).
 * -> [{ id, kind, pts: [{ frame, lat, lon, hPa }] }]
 */
export function trackSystems(S) {
  const by = Array.from({ length: S.frames }, () => []);
  for (const s of S.systems || []) by[s.frame]?.push(s);
  const tracks = [];
  let open = by[0].map((s) => {
    const t = { id: tracks.length, kind: s.kind, pts: [{ frame: 0, lat: s.lat, lon: s.lon, hPa: s.hPa }] };
    tracks.push(t);
    return t;
  });
  for (let f = 1; f < S.frames; f++) {
    const next = by[f];
    const pairs = [];
    open.forEach((t, i) => {
      const p = t.pts[t.pts.length - 1];
      next.forEach((s, j) => {
        if (s.kind !== t.kind) return;
        const d = apart(p, s);
        if (d <= 12) pairs.push([d, i, j]);
      });
    });
    pairs.sort((a, b) => a[0] - b[0]);
    const usedT = new Set(), usedS = new Set();
    const still = [];
    for (const [, i, j] of pairs) {
      if (usedT.has(i) || usedS.has(j)) continue;
      usedT.add(i);
      usedS.add(j);
      const s = next[j];
      open[i].pts.push({ frame: f, lat: s.lat, lon: s.lon, hPa: s.hPa });
      still.push(open[i]);
    }
    next.forEach((s, j) => {
      if (usedS.has(j)) return;
      const t = { id: tracks.length, kind: s.kind, pts: [{ frame: f, lat: s.lat, lon: s.lon, hPa: s.hPa }] };
      tracks.push(t);
      still.push(t);
    });
    open = still;
  }
  for (const t of tracks) {
    const raw = t.pts.map((p) => ({ ...p, ...refineCentre(S, p) }));
    t.pts = raw.map((p, i) => {
      if (i === 0 || i === raw.length - 1) return p;
      const a = raw[i - 1], b = raw[i + 1];
      return { ...p, lat: (a.lat + 2 * p.lat + b.lat) / 4, lon: p.lon + (wrapD(a.lon - p.lon) + wrapD(b.lon - p.lon)) / 4 };
    });
  }
  return tracks;
}

/**
 * Where each high and low is at a fractional frame: between two matched frames on the line between them (eased,
 * the longitude the short way round); a system is shown from half a frame before its first point to half a frame
 * after its last, except `hold` (the one the voice is naming), shown at its nearest point.
 * -> [{ id, kind, lat, lon, hPa }]
 */
export function systemsAt(tracks, f, out = [], hold = null) {
  out.length = 0;
  for (const t of tracks) {
    const p = t.pts;
    const first = p[0].frame, last = p[p.length - 1].frame;
    if ((f < first - 0.5 || f > last + 0.5) && t.id !== hold) continue;
    let a = p[0], b = p[0], u = 0;
    if (f >= last) a = b = p[p.length - 1];
    else if (f > first) {
      for (let i = 0; i < p.length - 1; i++) {
        if (f >= p[i].frame && f <= p[i + 1].frame) {
          a = p[i];
          b = p[i + 1];
          u = (f - a.frame) / (b.frame - a.frame || 1);
          break;
        }
      }
    }
    const k = smooth(u);
    out.push({ id: t.id, kind: t.kind, lat: a.lat + (b.lat - a.lat) * k, lon: a.lon + wrapD(b.lon - a.lon) * k, hPa: Math.round(a.hPa + (b.hPa - a.hPa) * k) });
  }
  return out;
}

// ------------------------------------------------------------------------------------------- isobars
/**
 * Marching squares: the contour of `level` through a field on a w x h grid (longitude wrapping), as segments in
 * grid coordinates [x0, y0, x1, y1, ...] (x along a row, y down the rows). The saddle cells take the centre's side.
 */
export function isobarSegments(field, w, h, level, out = []) {
  out.length = 0;
  const lerp = (a, b) => (level - a) / (b - a || 1e-9);
  for (let j = 0; j < h - 1; j++) {
    for (let i = 0; i < w; i++) {
      const i1 = i + 1 >= w ? 0 : i + 1;
      const a = field[j * w + i], b = field[j * w + i1], c = field[(j + 1) * w + i1], d = field[(j + 1) * w + i];
      const m = (a > level ? 1 : 0) | (b > level ? 2 : 0) | (c > level ? 4 : 0) | (d > level ? 8 : 0);
      if (m === 0 || m === 15) continue;
      // the crossing on each edge: top (a-b), right (b-c), bottom (d-c), left (a-d)
      const T = [i + lerp(a, b), j], R = [i + 1, j + lerp(b, c)], B = [i + lerp(d, c), j + 1], L = [i, j + lerp(a, d)];
      const seg = (p, q) => out.push(p[0], p[1], q[0], q[1]);
      const centre = (a + b + c + d) / 4 > level;
      switch (m) {
        case 1: case 14: seg(L, T); break;
        case 2: case 13: seg(T, R); break;
        case 3: case 12: seg(L, R); break;
        case 4: case 11: seg(R, B); break;
        case 6: case 9: seg(T, B); break;
        case 7: case 8: seg(L, B); break;
        case 5: if (centre) { seg(L, B); seg(T, R); } else { seg(L, T); seg(R, B); } break;
        case 10: if (centre) { seg(L, T); seg(R, B); } else { seg(L, B); seg(T, R); } break;
        default:
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------- the cloud texture
const TEX = 256; // texels a side, tileable
let TEXTURE = null;

function hash(ix, iy, seed) {
  let h = (Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(seed, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Tileable value noise of period p (in lattice cells) at (x, y) in lattice units. */
function vnoise(x, y, p, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const x0 = ((ix % p) + p) % p, y0 = ((iy % p) + p) % p, x1 = (x0 + 1) % p, y1 = (y0 + 1) % p;
  const a = hash(x0, y0, seed), b = hash(x1, y0, seed), c = hash(x0, y1, seed), d = hash(x1, y1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Ranks of a field as 0..255 (a uniform histogram), so a threshold at 1 - cover leaves `cover` of the area. */
function equalise(f) {
  const n = f.length;
  const idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  idx.sort((a, b) => f[a] - f[b]);
  const out = new Uint8Array(n);
  for (let r = 0; r < n; r++) out[idx[r]] = Math.min(255, Math.floor((r / n) * 256));
  return out;
}

/**
 * The cloud texture: billowy fBm (six octaves, the lattice warped by a low octave so the heads round off), tileable
 * on 256 texels, equalised, with mips down to 32 (each mip equalised again, so the cover holds at every zoom).
 * -> [{ size, data: Uint8Array }] level 0 first.
 */
export function cloudTexture() {
  if (TEXTURE) return TEXTURE;
  const f = new Float32Array(TEX * TEX);
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      // a gentle domain warp (period 4 cells): rounded heads instead of a plain value-noise grid
      const wx = (vnoise(x / 64, y / 64, 4, 11) - 0.5) * 22, wy = (vnoise(x / 64 + 5.2, y / 64 + 1.3, 4, 12) - 0.5) * 22;
      let s = 0, a = 1, norm = 0;
      for (let o = 0; o < 6; o++) {
        const cells = 4 << o; // lattice cells across the tile
        const k = cells / TEX;
        s += a * vnoise((x + wx) * k, (y + wy) * k, cells, 3 + o);
        norm += a;
        a *= 0.56;
      }
      f[y * TEX + x] = s / norm;
    }
  }
  const levels = [{ size: TEX, data: equalise(f) }];
  let src = f, size = TEX;
  while (size > 32) {
    const half = size >> 1;
    const g = new Float32Array(half * half);
    for (let y = 0; y < half; y++) for (let x = 0; x < half; x++) g[y * half + x] = (src[2 * y * size + 2 * x] + src[2 * y * size + 2 * x + 1] + src[(2 * y + 1) * size + 2 * x] + src[(2 * y + 1) * size + 2 * x + 1]) / 4;
    levels.push({ size: half, data: equalise(g) });
    src = g;
    size = half;
  }
  TEXTURE = levels;
  return levels;
}
/** Degrees per texel of mip 0 (the tile covers 38.4 degrees). */
export const TEXEL_DEG = 0.15;

// ------------------------------------------------------------------------------------------- radar colours
/** Rain intensity (mm per hour, after the cells) to radar colour: light blue, blue, green, yellow, red. */
export const RADAR = [
  { mm: 0.35, c: PK.cyan, cover: 0.5 },
  { mm: 0.8, c: PK.blue, cover: 0.8 },
  { mm: 1.6, c: PK.green, cover: 1 },
  { mm: 3, c: PK.yellow, cover: 1 },
  { mm: 5.5, c: PK.red, cover: 1 },
];
const R_MM = Float32Array.from(RADAR, (r) => r.mm), R_C = Uint32Array.from(RADAR, (r) => r.c), R_COV = Float32Array.from(RADAR, (r) => r.cover);
/** The radar band of an intensity: -1 none, 0..4 (cyan .. red). */
export function radarBand(mm) {
  let b = -1;
  for (let i = 0; i < R_MM.length; i++) if (mm >= R_MM[i]) b = i;
  return b;
}

// cloud as a veil: every palette colour seen through 0 .. 4 levels of cloud (mixed toward white in linear light,
// snapped to the nearest palette colour in L*a*b*), so thin cloud dithers between two close colours instead of
// spattering white dots on the map
const CLOUD_MIX = [0, 0.12, 0.3, 0.56, 0.85];
const lin = (v) => {
  v /= 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const unlin = (v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
function lab(r, g, b) {
  const R = lin(r), G = lin(g), B = lin(b);
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const X = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.9505), Y = f(0.2126 * R + 0.7152 * G + 0.0722 * B), Z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.089);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}
const PAL_RGB = Object.values(P).map((hex) => {
  const n = parseInt(hex.slice(1), 16);
  return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], pk: pack(hex) };
});
for (const c of PAL_RGB) c.lab = lab(...c.rgb);
/** The palette colour nearest an RGB colour (L*a*b*, the lightness counted a little more). */
export function nearestPalette(r, g, b) {
  const L = lab(r, g, b);
  let best = PAL_RGB[0], bd = Infinity;
  for (const c of PAL_RGB) {
    const d = 1.4 * (c.lab[0] - L[0]) ** 2 + (c.lab[1] - L[1]) ** 2 + (c.lab[2] - L[2]) ** 2;
    if (d < bd) [bd, best] = [d, c];
  }
  return best.pk;
}
/** VEIL[level].get(colour): the colour through that much cloud (level 0 is the colour itself). */
export const VEIL = CLOUD_MIX.map((k) => {
  const m = new Map();
  for (const c of PAL_RGB) {
    if (!k) m.set(c.pk, c.pk);
    else {
      const [r, g, b] = c.rgb.map((v) => unlin(lin(v) * (1 - k) + k));
      m.set(c.pk, nearestPalette(r, g, b));
    }
  }
  return m;
});
const VEIL_T = VEIL.map((m) => colourTable((c) => m.get(c >>> 0) ?? c));
// cover below LOW is left clear: a bulletin draws the cloud that matters (the bands, the storms, the overcast)
const LOW = 0.32;

// ------------------------------------------------------------------------------------------- the compositor
const NODE = 4;
const STEER = 1.8;
const SCRATCH = new Map(); // w x h -> buffers

function scratch(w, h) {
  const key = w * 4096 + h;
  let s = SCRATCH.get(key);
  if (!s) {
    const nx = Math.ceil(w / NODE) + 2, ny = Math.ceil(h / NODE) + 2;
    s = {
      nx, ny,
      C: new Float32Array(nx * ny), R: new Float32Array(nx * ny), DU: new Float32Array(nx * ny), DV: new Float32Array(nx * ny), PR: new Float32Array(nx * ny),
      rC: new Float32Array(nx), rR: new Float32Array(nx), rU: new Float32Array(nx), rV: new Float32Array(nx), rP: new Float32Array(nx),
      u0: new Float32Array(w), v0: new Float32Array(h), band: new Int16Array(w), bandUp: new Int16Array(w),
    };
    if (SCRATCH.size > 6) SCRATCH.delete(SCRATCH.keys().next().value);
    SCRATCH.set(key, s);
  }
  return s;
}

/**
 * The sky over a map frame. `base` (the map's pixels, worldmap.js) and `dst` are w x h Uint32 (dst may be base);
 * `view` { clon, clat, s, kx } is the map's (x = w/2 + dLon * s * kx, y = h/2 + (clat - lat) * s). `cur` is the
 * layers at the moment shown (SkyClock.at). Options:
 *   tau      hours of wind carried by the cloud texture (the time-lapse's hour, plus the slow drift on air)
 *   cloud, rain, isobars   which layers (isobars every 4 hPa, 1 px, in `isoColor`)
 *   opacity  how thick the densest cloud gets (1: four veils, the map's colour nearly white)
 *   rows     [y0, y1] to compose only those rows
 */
export function composeSky(dst, base, w, h, view, S, cur, opts = {}) {
  const { tau = 0, cloud = true, rain = true, isobars = false, isoColor = PK.silver, opacity = 0.9, rows = null } = opts;
  const T = cloudTexture();
  const sc = scratch(w, h);
  const { nx, ny, C, R, DU, DV, PR } = sc;
  const sx = view.s * view.kx, sy = view.s;
  // the mip whose texel is nearest a pixel (in degrees)
  const pxDeg = 1 / Math.sqrt(sx * sy);
  const lvl = Math.max(0, Math.min(T.length - 1, Math.round(Math.log2(Math.max(1e-6, pxDeg / TEXEL_DEG)))));
  const tex = T[lvl].data, size = T[lvl].size, mask = size - 1;
  const tpd = 1 / (TEXEL_DEG * (1 << lvl)); // texels per degree at this mip
  const rlvl = Math.max(0, lvl - 1), rtex = T[rlvl].data, rsize = T[rlvl].size, rmask = rsize - 1, rk = (1 << lvl) / (1 << rlvl) * 2;
  const halfW = w / 2, halfH = h / 2;
  const cloudCells = cur.cloud, rainCells = cur.rain, uCells = cur.u, vCells = cur.v, pCells = cur.mslp;
  const gw = S.w, gh = S.h;
  // the node grid: the layers at every 4th pixel (and one past the edge)
  for (let j = 0; j < ny; j++) {
    const yy = j * NODE;
    let lat = view.clat - (yy + 0.5 - halfH) / sy;
    lat = lat > 89.9 ? 89.9 : lat < -89.9 ? -89.9 : lat;
    let gy = (S.lat0 - lat) / S.step;
    gy = gy < 0 ? 0 : gy > gh - 1 ? gh - 1 : gy;
    const j0 = Math.min(gh - 2, gy | 0), fy = gy - j0;
    const degPerHourX = 3600 / (111320 * Math.max(0.17, Math.cos(lat * DEG))), degPerHourY = 3600 / 111320;
    for (let i = 0; i < nx; i++) {
      const lon = view.clon + (i * NODE + 0.5 - halfW) / sx;
      let gx = (lon - S.lon0) / S.step;
      gx -= Math.floor(gx / gw) * gw;
      const i0 = gx | 0, i1 = i0 + 1 >= gw ? 0 : i0 + 1, fx = gx - i0;
      const a = j0 * gw + i0, b = j0 * gw + i1, c = a + gw, d = b + gw;
      const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
      const k = j * nx + i;
      C[k] = (cloudCells[a] * w00 + cloudCells[b] * w10 + cloudCells[c] * w01 + cloudCells[d] * w11) / 100;
      R[k] = rainCells[a] * w00 + rainCells[b] * w10 + rainCells[c] * w01 + rainCells[d] * w11;
      const U = uCells[a] * w00 + uCells[b] * w10 + uCells[c] * w01 + uCells[d] * w11;
      const V = vCells[a] * w00 + vCells[b] * w10 + vCells[c] * w01 + vCells[d] * w11;
      // the texture sampled upwind: a feature at p now was at p - wind x tau (cloud rides the flow aloft, about
      // twice the 10 m wind the layer gives)
      DU[k] = -U * STEER * degPerHourX * tau * tpd;
      DV[k] = V * STEER * degPerHourY * tau * tpd;
      PR[k] = pCells[a] * w00 + pCells[b] * w10 + pCells[c] * w01 + pCells[d] * w11;
    }
  }
  // the texture's coordinates of each column and row (anchored to the Earth), offset by a whole number of tiles so
  // they stay positive (an integer cut is then a floor)
  const { u0, v0, rC, rR, rU, rV, rP, band, bandUp } = sc;
  const OFF = 4096 * 256;
  for (let x = 0; x < w; x++) u0[x] = (view.clon + (x + 0.5 - halfW) / sx) * tpd + OFF;
  for (let y = 0; y < h; y++) v0[y] = -(view.clat - (y + 0.5 - halfH) / sy) * tpd + OFF;
  const soft = 1 / 0.32;
  const rMin = R_MM[0] * 0.4;
  const y0 = rows ? rows[0] : 0, y1 = rows ? rows[1] : h;
  const V1 = VEIL_T[1], V2 = VEIL_T[2], V3 = VEIL_T[3], V4 = VEIL_T[4];
  const HM = HASH_M;
  const inv = 1 / NODE;
  for (let y = y0; y < y1; y++) {
    const jn = (y * inv) | 0, fyn = (y - jn * NODE) * inv;
    const r0 = jn * nx, r1 = r0 + nx;
    for (let i = 0; i < nx; i++) {
      rC[i] = C[r0 + i] + (C[r1 + i] - C[r0 + i]) * fyn;
      rR[i] = R[r0 + i] + (R[r1 + i] - R[r0 + i]) * fyn;
      rU[i] = DU[r0 + i] + (DU[r1 + i] - DU[r0 + i]) * fyn;
      rV[i] = DV[r0 + i] + (DV[r1 + i] - DV[r0 + i]) * fyn;
      rP[i] = PR[r0 + i] + (PR[r1 + i] - PR[r0 + i]) * fyn;
    }
    const by = (y & 3) << 2;
    const vy = v0[y];
    // no isobars poleward of 72 degrees (sea-level pressure over the ice caps is an extrapolation, its contours noise)
    const isoRow = isobars && Math.abs(view.clat - (y + 0.5 - halfH) / sy) < 72;
    let o = y * w;
    let nPrev = -1;
    // node span by node span: the layers step linearly across each 4-pixel span
    for (let i = 0, xs = 0; xs < w; i++, xs += NODE) {
      const xe = xs + NODE < w ? xs + NODE : w;
      let c = rC[i], r = rR[i], du = rU[i], dv = rV[i], p = rP[i];
      const dc = (rC[i + 1] - c) * inv, dr = (rR[i + 1] - r) * inv, ddu = (rU[i + 1] - du) * inv, ddv = (rV[i + 1] - dv) * inv, dp = (rP[i + 1] - p) * inv;
      // a clear span (no cloud worth drawing, no rain): the map, and the isobars
      const clear = c <= LOW && rC[i + 1] <= LOW && (!rain || (r <= rMin && rR[i + 1] <= rMin));
      for (let x = xs; x < xe; x++, o++, c += dc, r += dr, du += ddu, dv += ddv, p += dp) {
        let col = base[o];
        // the isobars are drawn on the map, under the rain and the cloud (seen through the veil)
        if (isobars) {
          const bnd = (p * 0.25) | 0;
          if (isoRow && ((x > 0 && bnd !== band[x - 1]) || (y > y0 && bnd !== bandUp[x]))) col = isoColor;
          band[x] = bnd;
        }
        if (clear) {
          nPrev = -1;
          dst[o] = col;
          continue;
        }
        const bay = B4[by | (x & 3)];
        const u = u0[x] + du, v = vy + dv;
        const iu = u | 0, iv = v | 0;
        const xa = iu & mask, xb = (iu + 1) & mask, ya = (iv & mask) * size, yb = ((iv + 1) & mask) * size;
        const ta = tex[ya + xa], tb = tex[ya + xb], tc = tex[yb + xa], td = tex[yb + xb];
        let cv = 0;
        if (c > LOW) {
          const cc = (c - LOW) / (1 - LOW);
          cv = cc * cc * (3 - 2 * cc); // the area covered: cloud where the texture is above 1 - cv
        }
        const fu = u - iu, fv = v - iv;
        const N = ((ta + (tb - ta) * fu) * (1 - fv) + (tc + (td - tc) * fu) * fv) * (1 / 255);
        let drawn = false;
        if (rain && r > rMin) {
          // rain cells: the texture at twice the frequency, a factor 0.35 .. 1.85 around the layer's mean
          const ru = u * rk + 97.3, rv = v * rk + 41.7;
          const ju = ru | 0, jv = rv | 0;
          const gu = ru - ju, gv = rv - jv;
          const qa = (jv & rmask) * rsize, qb = ((jv + 1) & rmask) * rsize;
          const sa = rtex[qa + (ju & rmask)], sb = rtex[qa + ((ju + 1) & rmask)], sc2 = rtex[qb + (ju & rmask)], sd = rtex[qb + ((ju + 1) & rmask)];
          const N2 = ((sa + (sb - sa) * gu) * (1 - gv) + (sc2 + (sd - sc2) * gu) * gv) * (1 / 255);
          const mm = r * (0.35 + 1.5 * N2 * N2);
          let b = -1;
          for (let q = 0; q < 5; q++) if (mm >= R_MM[q]) b = q;
          if (b >= 0) {
            // crisp bands with a short dithered edge into the next one
            const edge = b < 4 ? (mm - R_MM[b]) / (R_MM[b + 1] - R_MM[b]) : 0;
            const band2 = edge > 0.72 && (edge - 0.72) / 0.28 > bay ? b + 1 : b;
            if (R_COV[band2] > bay) {
              col = R_C[band2];
              drawn = true;
            }
          }
        }
        if (!drawn && cloud && cv > 0) {
          const d = (N - (1 - cv)) * soft;
          if (d > 0) {
            // how thick (0..4 veils): thin at the edges, thick in the cores of a full cover; lit from the west
            const dn = nPrev < 0 ? 0 : N - nPrev;
            let L = (d > 1 ? 1 : d) * (0.8 + 3.2 * cv * cv) * opacity + (dn > 0.015 ? 0.5 : dn < -0.02 ? -0.5 : 0);
            L = L < 0 ? 0 : L > 4 ? 4 : L;
            const li = L | 0;
            const lv = li < 4 && L - li > bay ? li + 1 : li;
            if (lv > 0) {
              const hh = Math.imul(col, HM) >>> 24;
              col = lv === 1 ? V1[hh] : lv === 2 ? V2[hh] : lv === 3 ? V3[hh] : V4[hh];
            }
          }
        }
        nPrev = N;
        dst[o] = col;
      }
    }
    if (isobars) bandUp.set(band);
  }
}

/** The packed palette colours the compositor may write (tests). */
export const SKY_COLOURS = Object.freeze([...new Set([...VEIL.flatMap((m) => [...m.values()]), ...RADAR.map((r) => r.c), PK.silver])]);
