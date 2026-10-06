// WORLD WEATHER's temperature field: the land coloured by the day's highs, as the weather maps on Spanish
// television do it (owner 3 Oct: "que se vaya viendo por zonas la temperatura"), in the channel's palette with
// ordered dither between neighbouring steps (pixel art: no blends, no alpha).
//
// The field is interpolated from the forecast's cities (inverse distance weighting on the sphere) and eased
// toward a latitude climate where no city is near (the Sahara, Siberia, the poles), on a 2-degree grid computed
// once per report and day; a pixel reads the grid bilinearly, so a camera move costs a lookup per pixel.
//
//   const f = temperatureField(cities, 'today')   f.at(lat, lon) -> °C     tempColor(c) -> palette hex
//   f.tint -> (lat, lon, x, y) => packed colour (worldmap.js view mode)
import { P } from '../../palette.js';

// °C -> palette, coldest to hottest
export const RAMP = [
  [-12, P.purple],
  [-2, P.blue],
  [6, P.darkGreen],
  [13, P.green],
  [19, P.cream],
  [24, P.tan],
  [30, P.rust],
  [36, P.darkRed],
];
const pack = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return (0xff000000 | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0;
};
const PACKED = RAMP.map(([, c]) => pack(c));
const B4 = Float32Array.from([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], (v) => (v + 0.5) / 16);
const DEG = Math.PI / 180;

/** Position of a temperature on the ramp (0 .. RAMP.length - 1, fractional). */
export function rampPos(c) {
  if (!(c > RAMP[0][0])) return 0;
  for (let i = 1; i < RAMP.length; i++) {
    if (c <= RAMP[i][0]) return i - 1 + (c - RAMP[i - 1][0]) / (RAMP[i][0] - RAMP[i - 1][0]);
  }
  return RAMP.length - 1;
}

/** The palette colour of a temperature (the nearest step: chips, legends). */
export function tempColor(c) {
  return RAMP[Math.round(rampPos(c))][1];
}

/** The climate a place with no city near tends to: warm tropics, cold poles (a gentle prior, not a forecast). */
function climate(lat) {
  const a = Math.abs(lat);
  return a <= 15 ? 27 : 27 - (a - 15) * 0.62;
}

const STEP = 2; // degrees per grid cell
const GW = 360 / STEP + 1, GH = 180 / STEP + 1;

/** A 1-degree grid (server/weatherfield.js: base64 int8, half degrees, rows north to south) as a field. */
export function gridField(grid, day = 'today') {
  const b64 = grid?.[day];
  const w = grid?.w | 0, h = grid?.h | 0;
  if (typeof b64 !== 'string' || w < 2 || h < 2) return null;
  let bin;
  try {
    bin = atob(b64);
  } catch {
    return null;
  }
  if (bin.length !== w * h) return null;
  const scale = Number(grid.scale) || 0.5, lat0 = Number(grid.lat0) || 89.5, lon0 = Number(grid.lon0) || -179.5, step = Number(grid.step) || 1;
  const f = new Float32Array(w * h);
  for (let i = 0; i < f.length; i++) f[i] = ((bin.charCodeAt(i) << 24) >> 24) * scale;
  const at = (lat, lon) => {
    const v = Math.max(0, Math.min(h - 1.0001, (lat0 - lat) / step));
    let u = ((lon - lon0) / step) % w;
    if (u < 0) u += w;
    const i0 = Math.floor(u), j0 = Math.floor(v);
    const i1 = (i0 + 1) % w, j1 = Math.min(h - 1, j0 + 1);
    const fu = u - i0, fv = v - j0;
    const a = f[j0 * w + i0], b = f[j0 * w + i1], c = f[j1 * w + i0], d = f[j1 * w + i1];
    return (a * (1 - fu) + b * fu) * (1 - fv) + (c * (1 - fu) + d * fu) * fv;
  };
  const tint = (lat, lon, x, y) => {
    const p = rampPos(at(lat, lon));
    const i = Math.min(RAMP.length - 2, Math.floor(p));
    return p - i > B4[((y & 3) << 2) | (x & 3)] ? PACKED[i + 1] : PACKED[i];
  };
  return { at, tint, day, n: w * h, source: grid.source || null };
}

/**
 * The field of `day` ('today' | 'tomorrow') highs: the server's heat map when the report has one (real
 * temperatures at many places, `grid`), else interpolated from the cities given ({ lat, lon, today: { max } }).
 */
export function temperatureField(cities, day = 'today', heat = null) {
  const g = heat ? gridField(heat, day) : null;
  if (g) return g;
  const pts = [];
  for (const c of cities || []) {
    const v = c?.[day]?.max;
    if (!Number.isFinite(v) || !Number.isFinite(c.lat) || !Number.isFinite(c.lon)) continue;
    pts.push({ la: c.lat * DEG, lo: c.lon * DEG, cl: Math.cos(c.lat * DEG), sl: Math.sin(c.lat * DEG), v });
  }
  const grid = new Float32Array(GW * GH);
  for (let j = 0; j < GH; j++) {
    const lat = 90 - j * STEP;
    const sl = Math.sin(lat * DEG), cl = Math.cos(lat * DEG);
    const prior = climate(lat);
    for (let i = 0; i < GW; i++) {
      const lon = -180 + i * STEP;
      // the prior counts as a city 15 degrees away; a city's weather fades out beyond ~25 degrees, so the far
      // north, the deserts and the poles keep their climate instead of the nearest city's
      let wsum = 1 / (15 * 15);
      let vsum = prior * wsum;
      for (const p of pts) {
        const cosd = sl * p.sl + cl * p.cl * Math.cos(lon * DEG - p.lo);
        const d = Math.acos(Math.max(-1, Math.min(1, cosd))) / DEG; // degrees of arc
        if (d > 60) continue;
        const w = Math.exp(-(d * d) / (25 * 25)) / (d * d + 4);
        wsum += w;
        vsum += w * p.v;
      }
      grid[j * GW + i] = vsum / wsum;
    }
  }
  const at = (lat, lon) => {
    let u = (lon + 180) / STEP;
    u -= Math.floor(u / (GW - 1)) * (GW - 1);
    const v = Math.max(0, Math.min(GH - 1.001, (90 - lat) / STEP));
    const i = Math.min(GW - 2, Math.floor(u)), j = Math.floor(v);
    const fu = u - i, fv = v - j;
    const a = grid[j * GW + i], b = grid[j * GW + i + 1], c = grid[(j + 1) * GW + i], d = grid[(j + 1) * GW + i + 1];
    return (a * (1 - fu) + b * fu) * (1 - fv) + (c * (1 - fu) + d * fu) * fv;
  };
  const tint = (lat, lon, x, y) => {
    const p = rampPos(at(lat, lon));
    const i = Math.min(RAMP.length - 2, Math.floor(p));
    const f = p - i;
    return f > B4[((y & 3) << 2) | (x & 3)] ? PACKED[i + 1] : PACKED[i];
  };
  return { at, tint, day, n: pts.length };
}
