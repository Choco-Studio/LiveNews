// WORLD WEATHER's tropical cyclone on the wall (round 4: the sky's grid is 3 degrees, so a cyclone, real or the demo's
// ORLA, had no cloud of its own and the warning shot showed a storm over a clear sea). A symbol, like the turning
// icon it replaces: a spiral of cloud bands round a dense core and a clear eye, sized by the storm's category and
// turning slowly the way the storm does (anticlockwise in the north, clockwise in the south). It is drawn in the
// cloud's own veils (each map colour mixed toward white, snapped to the palette) with the ordered dither, into the
// wall's picture after the sky, so it rides the curved wall, its dimming and the floor's reflection like the rest of
// the sky. It is a graphic, never observed data: clean geometric bands, its place GDACS's, its size its category's.
// The forecast's own rain stays drawn over it (data before symbol).
//
//   stormRadius(cat)                         degrees: a tropical storm 3.5, each category about one more
//   stormDensity(r, theta, rot, south, eye)  how much cloud (0..1) at r (0 centre .. 1 the outer bands' end) and
//                                            theta (radians, anticlockwise from east, north up), the spiral turned
//                                            by rot (radians, the storm's turn: positive is its own sense)
//   stormTurn(t)                             rot at t seconds (a turn every TURN seconds)
//   drawStormCloud(dst, base, w, h, view, storm, t, o)   into a picture (Uint32, the wall's): storm { lat, lon,
//                                            cat }, view the map's { clon, clat, s, kx }; o.minR the smallest radius
//                                            in px (a world view keeps the symbol legible); returns { x, y, r } or null
import { VEIL_T, HASH_M, RADAR } from './sky.js';

const B16 = Uint8Array.from([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]);
const B4 = Float32Array.from(B16, (v) => (v + 0.5) / 16);
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const wrap = (d) => d - Math.round(d / 360) * 360;

/** Seconds a turn: slow and calm (the warning is serious; the old icon turned in four). */
export const TURN = 22;
/** The band's pitch: a logarithmic spiral, theta = rot - PITCH ln r (the bands trail the turn). */
const PITCH = 2.1;
const ARMS = 2;
/** Where the bands end (in r) after their feathered tips. */
export const REACH = 1.12;

/** The storm's radius in degrees: a tropical storm 3.5, a category 5 about 8 (the cloud shield, not the winds). */
export function stormRadius(cat) {
  const c = Math.max(0, Math.min(5, Number(cat) || 0));
  return 3.5 + 0.9 * c;
}

/** The spiral's angle at t (radians, in the storm's own sense). */
export const stormTurn = (t) => ((t % TURN) / TURN) * Math.PI * 2;

/**
 * Cloud (0..1) at (r, theta) of a storm turned by rot. The eye (r < eye) is clear; the eyewall round it the densest;
 * the central dense overcast to r 0.34 with a faint swirl in it; then ARMS bands on a logarithmic spiral, narrowing
 * and thinning outward, feathered out by REACH, over a thin haze that holds the storm together.
 */
export function stormDensity(r, theta, rot, south = false, eye = 0.08) {
  if (r >= REACH || r < eye) return 0;
  const a = south ? -theta : theta; // the south's storm is the north's in a mirror
  const phi = a + PITCH * Math.log(Math.max(1e-3, r)) - rot;
  const swirl = Math.cos(ARMS * phi); // 1 on a band's spine
  if (r < eye + 0.1) return 1; // the eyewall
  const core = 0.9 + 0.1 * swirl;
  // the bands: their spine at swirl 1, narrower and thinner outward, their tips feathered
  const arm = 0.5 + 0.5 * swirl;
  const thr = 0.32 + 0.36 * r;
  const band = smooth((arm - thr) / (1 - thr));
  const amp = (1 - smooth((r - 0.62) / (REACH - 0.62))) * (1.02 - 0.42 * r);
  const haze = 0.16 * (1 - smooth((r - 0.4) / 0.6));
  const outer = Math.max(band * amp, haze);
  const k = smooth((r - 0.3) / 0.14); // the core opens into the bands
  return core * (1 - k) + outer * k;
}

const RAIN = new Set(RADAR.map((x) => x.c >>> 0));

/**
 * The storm into a picture: inside its disc the forecast's own cloud gives way to the symbol (eased out to the sky
 * round it with the dither), the bands are the map's colours through the cloud's veils, the eye the map itself;
 * the forecast's rain stays on top.
 */
export function drawStormCloud(dst, base, w, h, view, storm, t, { minR = 0 } = {}) {
  if (!storm || !Number.isFinite(storm.lat) || !Number.isFinite(storm.lon)) return null;
  const cx = w / 2 + wrap(storm.lon - view.clon) * view.s * view.kx, cy = h / 2 + (view.clat - storm.lat) * view.s;
  const R = Math.max(minR, stormRadius(storm.cat?.cat ?? storm.cat) * view.s);
  if (R < 1.5) return null;
  const reach = R * REACH + 1;
  if (cx + reach < 0 || cx - reach >= w || cy + reach < 0 || cy - reach >= h) return null;
  const south = storm.lat < 0;
  const rot = stormTurn(t);
  const eye = Math.max(0.07, 0.9 / R); // at least about a pixel
  const x0 = Math.max(0, Math.floor(cx - reach)), x1 = Math.min(w - 1, Math.ceil(cx + reach));
  const y0 = Math.max(0, Math.floor(cy - reach)), y1 = Math.min(h - 1, Math.ceil(cy + reach));
  const V = VEIL_T, HM = HASH_M;
  for (let y = y0; y <= y1; y++) {
    const dy = cy - (y + 0.5); // north up
    const by = (y & 3) << 2;
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const r = Math.hypot(dx, dy) / R;
      if (r >= REACH + 0.06) continue;
      const o = y * w + x;
      const now = dst[o];
      const bay = B4[by | (x & 3)];
      // the disc: the symbol over the map; its rim eases back to the sky around it (dithered)
      const inside = r < 1 ? 1 : 1 - (r - 1) / (REACH + 0.06 - 1);
      if (inside <= bay) continue;
      if (RAIN.has(now >>> 0) && now !== base[o]) continue; // the forecast's rain stays
      let col = base[o];
      const d = stormDensity(r, Math.atan2(dy, dx), rot, south, eye);
      if (d > 0) {
        const L = d * 4.3;
        const li = L | 0;
        const lv = li >= 4 ? 4 : L - li > bay ? li + 1 : li;
        if (lv > 0) col = V[lv][Math.imul(col, HM) >>> 24];
      }
      dst[o] = col;
    }
  }
  return { x: cx, y: cy, r: R };
}
