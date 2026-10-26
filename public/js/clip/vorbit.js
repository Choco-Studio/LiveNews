// COSMOS DESK's locator for the vertical picture (docs/publishing/vertical.md §3.4): the place seen from orbit, not on a
// flat map. The Earth hangs in the programme's display, the place turning in to its middle over the shot's first second
// and a half, lit from the upper left so the day side shows its seas, land, ice and cloud and a crescent of night on the
// right shows its cities' lights, the air a thin cyan rim on the lit limb. The place is marked as an instrument marks a
// target: a pink core, four ticks, a ring going out from it every 1.6 s.
//
//   drawOrbit(ctx, { cx, cy, R, lat, lon, dt, t, accent })   the globe (radius R px) centred at (cx, cy); false when
//                                                             it cannot be drawn (no canvas, no map data yet)
//   orbitMarker(lat, lon, dt)                                 where the place is on the globe this frame ({ x, y } in
//                                                             radii from its middle, y down)
//   coordsOf(lat, lon)                                        "78°N 15°E"
import { P } from '../palette.js';
import { u32 } from '../gfx/color.js';
import { clamp } from '../gfx/index.js';
import { toCanvas } from '../gfx/canvas.js';
import { landMip, cityLights, warmMapData } from '../scenes/worldmap.js';

const DEG = Math.PI / 180;
const C = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, u32(v)]));
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bay = (x, y) => (B4[((y & 3) << 2) | (x & 3)] + 0.5) / 16;
// the sun in the view (x right, y up, z toward the viewer): from the upper left and in front, so the night is a
// crescent on the right limb
const SUN = (() => {
  const v = [-0.52, 0.4, 0.75];
  const l = Math.hypot(...v);
  return v.map((a) => a / l);
})();
// where the turn-in starts from (degrees behind the place) and how long it takes (s)
const TURN = { lat: 28, lon: 64, dur: 1.6 };

/** The view's centre this frame: the place, reached after TURN.dur (eased), from behind it to the west and south. */
function viewAt(lat, lon, dt) {
  const u = clamp((dt ?? TURN.dur) / TURN.dur, 0, 1);
  const e = 1 - (1 - u) ** 3;
  return { lat: clamp(lat - TURN.lat * (1 - e), -89, 89), lon: lon - TURN.lon * (1 - e) };
}

/** A point on the globe in the view: { x, y, z } (unit sphere, y up, z toward the viewer) for the view centred on v. */
function toView(lat, lon, v) {
  const p = lat * DEG, l = (lon - v.lon) * DEG, p0 = v.lat * DEG;
  const cp = Math.cos(p);
  return { x: cp * Math.sin(l), y: Math.cos(p0) * Math.sin(p) - Math.sin(p0) * cp * Math.cos(l), z: Math.sin(p0) * Math.sin(p) + Math.cos(p0) * cp * Math.cos(l) };
}

/** Where the place is on the globe this frame, in radii from the globe's middle (y down), and whether it faces us. */
export function orbitMarker(lat, lon, dt) {
  const q = toView(lat, lon, viewAt(lat, lon, dt));
  return { x: q.x, y: -q.y, front: q.z > 0 };
}

/** "78°N 15°E": whole degrees, the hemisphere's letter after each. */
export function coordsOf(lat, lon) {
  const lo = ((((lon + 180) % 360) + 360) % 360) - 180;
  return `${Math.round(Math.abs(lat))}°${lat >= 0 ? 'N' : 'S'} ${Math.round(Math.abs(lo))}°${lo >= 0 ? 'E' : 'W'}`;
}

// ------------------------------------------------------------------------------------------- the surface

function landAt(lat, lon, lvl) {
  const m = landMip(lvl);
  if (!m) return -1;
  const u = ((((lon + 180) / 360) % 1) + 1) % 1 * m.w - 0.5;
  const v = ((90 - lat) / 180) * m.h - 0.5;
  const iu = Math.floor(u), iv = clamp(Math.floor(v), 0, m.h - 2);
  const fu = u - iu, fv = clamp(v - iv, 0, 1);
  const u0 = ((iu % m.w) + m.w) % m.w, u1 = (u0 + 1) % m.w;
  const px = m.bits ? (uu, vv) => ((m.bits[vv * m.stride + (uu >> 3)] >> (uu & 7)) & 1) * 255 : (uu, vv) => m.d[vv * m.w + uu];
  const a = px(u0, iv), b = px(u1, iv), c = px(u0, iv + 1), e = px(u1, iv + 1);
  return ((a + (b - a) * fu) * (1 - fv) + (c + (e - c) * fu) * fv) / 255;
}

// smooth value noise on the sphere (3D, so no seam at the date line): cloud and the deserts' ragged edges
const hash3 = (a, b, c) => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35) ^ Math.imul(c + 0x27d4eb2f, 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
};
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const s = (t) => t * t * (3 - 2 * t);
  const u = s(x - xi), v = s(y - yi), w = s(z - zi);
  let out = 0;
  for (let k = 0; k < 8; k++) {
    const dx = k & 1, dy = (k >> 1) & 1, dz = k >> 2;
    out += hash3(xi + dx, yi + dy, zi + dz) * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
  }
  return out;
}
const fbm3 = (x, y, z) => 0.55 * noise3(x, y, z) + 0.3 * noise3(x * 2.1 + 5, y * 2.1 + 3, z * 2.1 + 1) + 0.15 * noise3(x * 4.2 + 9, y * 4.2 + 7, z * 4.2 + 4);

// the great deserts, as boxes their noise roughens (lat0, lat1, lon0, lon1): tan land in the day
const DESERTS = [[14, 33, -17, 34], [13, 32, 34, 60], [-31, -19, 114, 142], [37, 47, 88, 112], [24, 40, 52, 72], [-27, -18, 14, 26], [-26, -16, -71, -66]];
function desert(lat, lon, n) {
  for (const [a, b, c, d] of DESERTS) {
    const m = Math.min(lat - a, b - lat, (lon - c) * 0.8, (d - lon) * 0.8);
    if (m > -3 && m + (n - 0.5) * 8 > 1) return true;
  }
  return false;
}

// ------------------------------------------------------------------------------------------- the globe

const CACHE = { key: '', canvas: null };
let LIGHTS = null;
function lightsOf() {
  if (LIGHTS) return LIGHTS;
  const L = cityLights();
  if (!L) return null;
  const out = [];
  for (let i = 0; i < L.n; i++) out.push([L.lat[i], L.lon[i], L.kind[i]]);
  LIGHTS = out;
  return out;
}

/**
 * The globe as a canvas (2R + 8 square, its middle at R + 4), for the place `lat, lon` at turn-in time `dt` (cached
 * once it has settled). Null without the map data or a canvas.
 */
function globe(R, lat, lon, dt) {
  if (typeof document === 'undefined') return null;
  const settled = dt >= TURN.dur;
  const v = viewAt(lat, lon, dt);
  const key = `${R}|${lat}|${lon}|${settled ? 'S' : v.lat.toFixed(2) + ',' + v.lon.toFixed(2)}`;
  if (CACHE.key === key) return CACHE.canvas;
  warmMapData();
  if (!landMip(3)) return null;
  const S = 2 * R + 8, M = R + 4;
  const px = new Uint32Array(S * S);
  const lvl = R > 70 ? 2 : 3;
  const p0 = v.lat * DEG, sp0 = Math.sin(p0), cp0 = Math.cos(p0);
  const rim = 2.6 / R;
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const x = (i + 0.5 - M) / R, y = -(j + 0.5 - M) / R;
      const r2 = x * x + y * y;
      const o = j * S + i;
      const b = bay(i, j);
      if (r2 > 1) {
        // the air round the limb: cyan then blue on the lit side, navy on the dark, fading out on the Bayer steps
        const r = Math.sqrt(r2);
        if (r > 1 + rim) continue;
        const lit = (x * SUN[0] + y * SUN[1]) / r;
        const f = (r - 1) / rim;
        if (lit > 0.1) px[o] = f < 0.4 ? C.cyan : f < 1 && b > f ? C.blue : 0;
        else if (lit > -0.35) px[o] = f < 0.6 && b > f ? C.navy : 0;
        continue;
      }
      const z = Math.sqrt(1 - r2);
      const lat1 = Math.asin(clamp(z * sp0 + y * cp0, -1, 1)) / DEG;
      const lon1 = v.lon + Math.atan2(x, z * cp0 - y * sp0) / DEG;
      // the sun on the ground, and the limb's darkening (the light grazes it)
      const d = x * SUN[0] + y * SUN[1] + z * SUN[2];
      const land = landAt(lat1, lon1, lvl) > 0.5;
      const cl = Math.cos(lat1 * DEG);
      const wx = cl * Math.cos(lon1 * DEG), wy = cl * Math.sin(lon1 * DEG), wz = Math.sin(lat1 * DEG);
      const ice = land ? Math.abs(lat1) > 66 + (lat1 < 0 ? -4 : 6) : lat1 > 79 || lat1 < -70;
      let c;
      if (d > 0.1) {
        // the day side: three tones by the light, the brightest where the sun is highest
        const hi = d > 0.72, mid = d > 0.34 || (d > 0.24 && b < (d - 0.24) / 0.1);
        if (ice) c = hi ? C.white : mid ? C.silver : C.fog;
        else if (land) {
          const n = fbm3(wx * 6, wy * 6, wz * 6);
          if (desert(lat1, lon1, n)) c = hi ? C.tan : mid ? C.tanShade : C.brown;
          else c = hi ? C.midGreen : mid ? C.darkGreen : C.deepGreen;
        } else c = hi ? C.blue : mid ? C.navy : C.ink;
        // the sea's glint, where the sun's reflection meets the view
        if (!land && !ice) {
          const hz = z * (SUN[2] + 1) + x * SUN[0] + y * SUN[1];
          if (hz > 1.88) c = C.cyan;
        }
        // cloud: a few soft streaks over the day (the land and sea must still read), thinner toward the terminator
        const cn = fbm3(wx * 3.2 + 11, wy * 3.2, wz * 7 + 3);
        const cv = (cn - 0.64) * 5 * Math.min(1, d * 2);
        if (cv > 0 && b < cv) c = cv > 0.45 && d > 0.5 ? C.white : C.silver;
      } else if (d > -0.06) {
        // the terminator: the day's darkest tone stepping into the night
        const t = (d + 0.06) / 0.16;
        c = b < t ? (ice ? C.steel : land ? C.deepGreen : C.ink) : land ? C.ink : C.black;
      } else c = land ? C.ink : C.black;
      px[o] = c;
    }
  }
  // the night side's cities: their light where the sun has set (the clusters' cores yellow, the rest orange)
  const L = lightsOf();
  if (L) {
    for (const [la, lo, kind] of L) {
      const q = toView(la, lo, v);
      if (q.z < 0.08) continue;
      const d = q.x * SUN[0] + q.y * SUN[1] + q.z * SUN[2];
      if (d > -0.04) continue;
      const i = Math.floor(M + q.x * R), j = Math.floor(M - q.y * R);
      if (i < 0 || j < 0 || i >= S || j >= S) continue;
      px[j * S + i] = kind >= 3 ? C.yellow : kind >= 1 ? C.orange : C.rust;
    }
  }
  const canvas = toCanvas(px, S, S);
  if (settled) {
    CACHE.key = key;
    CACHE.canvas = canvas;
  }
  return canvas;
}

/**
 * The place from orbit: the globe (radius R) centred at (cx, cy), the place's marker on it. Returns false when the
 * globe cannot be drawn (the caller shows its flat map).
 */
export function drawOrbit(ctx, { cx, cy, R, lat, lon, dt = 9, t = 0, accent = P.magenta } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  const g = globe(R, lat, lon, dt);
  if (!g) return false;
  ctx.drawImage(g, Math.round(cx - R - 4), Math.round(cy - R - 4));
  // the marker: a pink core in the accent's ring of ticks, a ring going out from it every 1.6 s
  const m = orbitMarker(lat, lon, dt);
  if (!m.front) return true;
  const mx = Math.round(cx + m.x * R), my = Math.round(cy + m.y * R);
  const ph = (Math.max(0, t) % 1.6) / 1.6;
  const rr = 3 + ph * 8;
  ctx.fillStyle = ph < 0.45 ? P.pink : ph < 0.8 ? accent : P.purple;
  for (let k = 0; k < 28; k++) {
    const a = (k / 28) * Math.PI * 2;
    ctx.fillRect(Math.round(mx + Math.cos(a) * rr), Math.round(my + Math.sin(a) * rr), 1, 1);
  }
  ctx.fillStyle = P.black;
  ctx.fillRect(mx - 2, my - 2, 4, 4);
  ctx.fillStyle = accent;
  for (const [dx, dy, w, h] of [[-7, 0, 3, 1], [5, 0, 3, 1], [0, -7, 1, 3], [0, 5, 1, 3]]) ctx.fillRect(mx + dx, my + dy, w, h);
  ctx.fillStyle = P.pink;
  ctx.fillRect(mx - 1, my - 1, 2, 2);
  return true;
}
