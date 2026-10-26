// WORLD NOW's intro for the vertical clips (docs/publishing/shorts-v2.md §6; its cue sheet: cues.js INTRO_CUES). The
// owner, 26 Oct, after TECH BYTES' drone ("perfecto"): "ahora pasemos al de World Now", then "tiene que ser un hook,
// que se vea espectacular", and "ten cuidado con no poner luces ni carreteras en el agua". As COSMOS DESK's and TECH
// BYTES': a music that holds the eye, four seconds at most, the letters worked for, no boxes of text, no flash. Six beats
// at 96 BPM (3.75 s), one unbroken shot on the clips' 216 x 384 frame, moving from its first frame:
//
//   ORBIT   beats 0-1     low over Europe at night, flying fast toward London: the continent's lights streaming under
//                         the camera, the earth's curve across the top of the frame, tilted, its air glowing blue and
//                         warming toward the dawn ahead; stars over it
//   SUNRISE 1             (the stroke) the sun clears the earth's edge ahead: a white burst, its rays and a streak across
//                         the lens, the air along the edge lit gold; day starts across the ground from the horizon
//   PULL    1-3.5         the camera climbs away and swings round, its look turning down onto the planet as it comes
//                         level, until the whole earth is in the frame, the day coming round onto it; from London the
//                         emblem's three routes take off, one a quarter beat (New York, New Delhi, Nairobi), and arc out
//                         over it, each landing with a ring; the camera comes to rest on the emblem's globe
//   TITLE   3.75-4.5      a red bar sweeps across under the globe and leaves WORLD in its wake; NOW between two red
//                         rules under it; on the hit a shine runs across the letters
//   LOCK    4.5-6         the emblem and the title; the cut on the sixth beat
//
// How it is drawn: the earth is a unit sphere seen through one lens (260 px) from a camera over a point of it, looking
// along its heading at a pitch from straight down (turned by a roll), each pixel's ray met with the sphere. The ground is
// the channel's land mask (the world map's, at the level its pixel's footprint wants, filtered so a coast is never a
// staircase), lit by the sun as the emblem's globe is (its ramps, its graticule and red equator once it is day; a warm
// band where the sun is low). The night side's lights are the world map's cities and the towns round them, each on land
// (no light on the water: the owner), laid on the frame as points spread by how far off they are, given a lens's glow
// (kept off the sea) and brought to the palette's sodium ramp through the screen's Bayer matrix. The air is a glow round
// the limb by how close each ray passes the earth: navy by night, blue by day, gold looking toward a sun low behind it.
import { P } from '../../palette.js';
import { textPixels, drawText, measureText } from '../../font.js';
import { u32, clamp, seg, easeOutQuint, easeInOut, easeInOutSine } from '../../gfx/index.js';
import { Layer, ditherAt } from './seq.js';
import { INTRO_CUES } from './cues.js';
import { landMip, cityLights, warmMapData } from '../worldmap.js';
import { LONDON, ROUTES, LIGHT, ROUTE_H, evec, routePoints } from './world.js';

const VW = 216;
const VH = 384;
const NPX = VW * VH;
const Q = INTRO_CUES['world-now'];
const DEG = Math.PI / 180;
const BEAT = 60 / Q.bpm;
const C = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, u32(v)]));
const KM = 6371; // the earth's radius: a unit of the sphere
const sstep5 = (x) => {
  const v = clamp(x, 0, 1);
  return v * v * v * (v * (6 * v - 15) + 10);
};
const smooth = (a, e, x) => {
  const v = clamp((x - a) / (e - a), 0, 1);
  return v * v * (3 - 2 * v);
};
// a quintic from p0 to p1 over t in 0..1, leaving at v0 with acceleration a0 and arriving at rest (both per unit of t)
const quintic = (p0, p1, v0, a0, t) => {
  const t2 = t * t;
  const t3 = t2 * t;
  const t4 = t3 * t;
  const t5 = t4 * t;
  const h0 = 1 - 10 * t3 + 15 * t4 - 6 * t5;
  const h1 = t - 6 * t3 + 8 * t4 - 3 * t5;
  const h2 = 0.5 * t2 - 1.5 * t3 + 1.5 * t4 - 0.5 * t5;
  return h0 * p0 + h1 * v0 + h2 * a0 + (1 - h0) * p1;
};
const hash2 = (ix, iy, s) => {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(s, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// ---------------------------------------------------------------------------------------------
// The camera: over a point of the earth (its sub-point), at a height, looking along its heading at a pitch from straight
// down, turned by a roll. It starts a kilometre and a half over the Thames by Tower Bridge, looking down the river past
// Canary Wharf, and climbs away fast (its height's log at one pace, then one long glide to rest), on along its heading
// as it climbs, keeping the horizon high in the frame;
// over the earth's edge the sun rises; then its look turns down and round onto the planet and it comes to rest on the
// emblem's camera: straight down on the emblem's face (24 N, 12 W: Europe and Africa, the north tipped toward us), north
// up, the globe 56 px in radius at the emblem's place.

const REST = { x: 108, y: 150 }; // the lens's middle on the frame: the globe's place at the end (the emblem's)
const F = 260; // px: the lens
const R_END = 56; // the globe's radius at rest, px
const D_END = 1 / Math.sin(Math.atan(R_END / F)); // the camera's distance from the earth's middle at rest
const START = [51.5058, -0.068]; // over the Thames by Tower Bridge
const FACE = [24, -12];
const U0 = Math.log(1.4 / KM);
const U1 = Math.log(D_END - 1);
const HEAD0 = 96 * DEG; // down the river, east: the City, Canary Wharf, then Europe and the dawn
const LIMB_EL = 20 * DEG; // the horizon kept this far over the look while the camera climbs
const ROLL0 = -12 * DEG;
const AHEAD = 0.55; // the way on over the ground for each unit of height climbed
const DRIFT_FROM = Math.log(700 / KM); // above this the camera drifts toward the emblem's face
// The climb's pace (the owner, of the first cut: "el cambio de velocidad es demasiado brusco"; it had sped up to nearly
// twice its first pace and braked): its rate (the height's log, a beat) already going on the first frame, coming up a
// little to a steady climb, held, then easing off in one long glide to rest: the shape's share of the way at each step.
const STEPS = 400;
const climbShape = (x) => (0.86 + 0.14 * smooth(0, 0.2, x)) * (1 - sstep5((x - 0.48) / 0.52));
const CLIMB = (() => {
  const g = new Float64Array(STEPS + 1);
  for (let i = 1; i <= STEPS; i++) g[i] = g[i - 1] + climbShape((i - 0.5) / STEPS);
  return g.map((v) => v / g[STEPS]);
})();
/** The camera's height's log at beat b. */
function logHeight(b) {
  const x = clamp(b / Q.settle, 0, 1) * STEPS;
  const i = Math.min(STEPS - 1, Math.floor(x));
  return U0 + (U1 - U0) * (CLIMB[i] + (CLIMB[i + 1] - CLIMB[i]) * (x - i));
}
const NS = evec(...START);
const NF = evec(...FACE);
const T0 = (() => {
  const la = START[0] * DEG;
  const lo = START[1] * DEG;
  const e = [Math.cos(lo), 0, -Math.sin(lo)];
  const n = [-Math.sin(la) * Math.sin(lo), Math.cos(la), -Math.sin(la) * Math.cos(lo)];
  return [0, 1, 2].map((k) => n[k] * Math.cos(HEAD0) + e[k] * Math.sin(HEAD0));
})();
// the way: the camera's place and look at a point p of it (p runs 0 to Q.settle, the way's own beats)
const PATH = {};
function pathAt(p, o = PATH) {
  const u = logHeight(p);
  const h = Math.exp(u);
  // on along the heading as it climbs, then drifting to the emblem's face
  const s = AHEAD * (h - Math.exp(U0));
  const tx = NS[0] * Math.cos(s) + T0[0] * Math.sin(s);
  const ty = NS[1] * Math.cos(s) + T0[1] * Math.sin(s);
  const tz = NS[2] * Math.cos(s) + T0[2] * Math.sin(s);
  const w = sstep5((u - DRIFT_FROM) / (U1 - DRIFT_FROM));
  const om = Math.acos(clamp(tx * NF[0] + ty * NF[1] + tz * NF[2], -1, 1));
  const ka = om > 1e-6 ? Math.sin((1 - w) * om) / Math.sin(om) : 1 - w;
  const kb = om > 1e-6 ? Math.sin(w * om) / Math.sin(om) : w;
  const nx = tx * ka + NF[0] * kb;
  const ny = ty * ka + NF[1] * kb;
  const nz = tz * ka + NF[2] * kb;
  o.lat = Math.asin(clamp(ny, -1, 1)) / DEG;
  o.lon = Math.atan2(nx, nz) / DEG;
  o.u = u;
  // (the turns spread over the whole way, each as gentle as it can be: the look comes down once the sun is up)
  const over = Math.asin(1 / (1 + h)) - LIMB_EL; // (eased into nothing as the earth shrinks: never a kink)
  o.pitch = 0.5 * (over + Math.sqrt(over * over + 36 * DEG * DEG)) * (1 - smooth(Q.sun + 0.05, Q.settle - 0.05, p));
  o.head = HEAD0 * (1 - smooth(0.3, Q.settle - 0.05, p));
  o.roll = ROLL0 * (1 - smooth(0, Q.settle - 0.05, p));
  return o;
}

const CAM = {};
function cameraAt(b, c = CAM) {
  placeCamera(c, pathAt(clamp(b, 0, Q.settle)));
  sunAt(b, c);
  return c;
}
// the camera's frame at a point of the way: its place, its look (forward, right, up; and right and up before the roll)
function placeCamera(c, p) {
  const la = p.lat * DEG;
  const lo = p.lon * DEG;
  const nx = Math.cos(la) * Math.sin(lo);
  const ny = Math.sin(la);
  const nz = Math.cos(la) * Math.cos(lo);
  const ex = Math.cos(lo);
  const ez = -Math.sin(lo);
  const qx = -Math.sin(la) * Math.sin(lo);
  const qy = Math.cos(la);
  const qz = -Math.sin(la) * Math.cos(lo);
  const h = Math.exp(p.u);
  const D = 1 + h;
  c.h = h;
  c.D = D;
  c.nx = nx;
  c.ny = ny;
  c.nz = nz;
  c.px = nx * D;
  c.py = ny * D;
  c.pz = nz * D;
  c.pitch = p.pitch;
  c.head = p.head;
  c.roll = p.roll;
  c.lat = p.lat;
  c.lon = p.lon;
  // the heading over the ground, and the side to its right
  const ch = Math.cos(p.head);
  const sh = Math.sin(p.head);
  const tx = qx * ch + ex * sh;
  const ty = qy * ch;
  const tz = qz * ch + ez * sh;
  const sx = ex * ch - qx * sh;
  const sy = -qy * sh;
  const sz = ez * ch - qz * sh;
  const cp = Math.cos(p.pitch);
  const sp = Math.sin(p.pitch);
  c.fx = -nx * cp + tx * sp;
  c.fy = -ny * cp + ty * sp;
  c.fz = -nz * cp + tz * sp;
  // up and right before the roll (the sun is set in these), then rolled
  c.u0x = nx * sp + tx * cp;
  c.u0y = ny * sp + ty * cp;
  c.u0z = nz * sp + tz * cp;
  c.r0x = sx;
  c.r0y = sy;
  c.r0z = sz;
  const cr = Math.cos(p.roll);
  const sr = Math.sin(p.roll);
  c.rx = sx * cr + c.u0x * sr;
  c.ry = sy * cr + c.u0y * sr;
  c.rz = sz * cr + c.u0z * sr;
  c.ux = -sx * sr + c.u0x * cr;
  c.uy = -sy * sr + c.u0y * cr;
  c.uz = -sz * sr + c.u0z * cr;
  c.alpha = Math.asin(1 / D); // the earth's angular radius
  return c;
}
// a point of the world (earth units) on the frame: [x, y, depth]
function project(c, x, y, z, out) {
  const vx = x - c.px;
  const vy = y - c.py;
  const vz = z - c.pz;
  const zc = vx * c.fx + vy * c.fy + vz * c.fz;
  out[0] = REST.x + (F * (vx * c.rx + vy * c.ry + vz * c.rz)) / zc;
  out[1] = REST.y - (F * (vx * c.ux + vy * c.uy + vz * c.uz)) / zc;
  out[2] = zc;
  return out;
}
// is a point of the world (on or over the surface) in sight: in front of the lens and not behind the earth
function inSight(c, x, y, z) {
  const dx = x - c.px;
  const dy = y - c.py;
  const dz = z - c.pz;
  const L2 = dx * dx + dy * dy + dz * dz;
  if (dx * c.fx + dy * c.fy + dz * c.fz <= 0) return false;
  const bq = c.px * dx + c.py * dy + c.pz * dz;
  const disc = bq * bq - L2 * (c.D * c.D - 1);
  if (disc <= 0) return true;
  const t = (-bq - Math.sqrt(disc)) / L2;
  return t >= 1 - 1e-3;
}

// The sun, set in the camera's frame before its roll: just behind the earth's edge ahead (a little left), it rises over
// it on the stroke; then it comes round to the emblem's own light (LIGHT: upper left, toward us) as the camera pulls
// back, the day coming round onto the planet.
const SUN_AZ = -9 * DEG;
const SUN_END = [LIGHT[0], LIGHT[1], -LIGHT[2]]; // (right, up, forward)
function sunAt(b, c) {
  const limb = Math.asin(1 / c.D) - c.pitch; // the earth's edge straight ahead, over the look
  const el = limb - 2.6 * DEG + 5.6 * DEG * sstep5((b - (Q.sun - 0.45)) / 0.9);
  let a0 = Math.cos(el) * Math.sin(SUN_AZ);
  let a1 = Math.sin(el);
  let a2 = Math.cos(el) * Math.cos(SUN_AZ);
  const w = easeInOutSine(seg(b, Q.sun + 0.3, Q.settle - Q.sun));
  if (w > 0) {
    const dot = clamp(a0 * SUN_END[0] + a1 * SUN_END[1] + a2 * SUN_END[2], -1, 1);
    const om = Math.acos(dot);
    const ka = Math.sin((1 - w) * om) / Math.sin(om);
    const kb = Math.sin(w * om) / Math.sin(om);
    a0 = a0 * ka + SUN_END[0] * kb;
    a1 = a1 * ka + SUN_END[1] * kb;
    a2 = a2 * ka + SUN_END[2] * kb;
  }
  c.sx = a0 * c.r0x + a1 * c.u0x + a2 * c.fx;
  c.sy = a0 * c.r0y + a1 * c.u0y + a2 * c.fy;
  c.sz = a0 * c.r0z + a1 * c.u0z + a2 * c.fz;
  // how far the sun is past the earth's edge, seen from the camera
  c.over = Math.acos(clamp(-(c.sx * c.nx + c.sy * c.ny + c.sz * c.nz), -1, 1)) - c.alpha;
}

// ---------------------------------------------------------------------------------------------
// London from its plan, in kilometres east and north of Charing Cross (good to a hundred kilometres round): the Thames
// black through it under its bridges, the parks dark, the districts each with its own street grid of sodium lamps, main roads every few streets and along the districts' edges, the arterial roads out and
// the rings round (the M25 the outer), the City and Canary Wharf brightest, the towns round it; the traffic's lights
// moving on the big roads. Each line of light spread over the pixels it crosses by the share of them it covers, so the
// same plan draws a street close to and the city's glow from a hundred kilometres up.

const LAT0 = 51.507;
const LON0 = -0.1;
const KX = 111.32 * Math.cos(LAT0 * DEG);
const KY = 110.57;
const toLocal = (lat, lon) => [(lon - LON0) * KX, (lat - LAT0) * KY];
const BOX = 110; // km: the plan's reach
const inBox = (lat, lon) => {
  const [x, y] = toLocal(lat, lon);
  return Math.abs(x) < BOX && Math.abs(y) < BOX;
};
// the Thames, west to east (Hampton Court to the estuary)
const THAMES_PTS = [
  [-0.42, 51.43], [-0.36, 51.405], [-0.31, 51.41], [-0.322, 51.44], [-0.305, 51.46], [-0.285, 51.483], [-0.26, 51.484],
  [-0.245, 51.47], [-0.23, 51.488], [-0.215, 51.468], [-0.19, 51.462], [-0.172, 51.479], [-0.15, 51.484],
  [-0.127, 51.486], [-0.122, 51.5], [-0.117, 51.508], [-0.1, 51.5095], [-0.085, 51.5075], [-0.072, 51.5055],
  [-0.055, 51.503], [-0.042, 51.507], [-0.03, 51.508], [-0.024, 51.497], [-0.018, 51.489], [-0.008, 51.4855],
  [0.002, 51.493], [0.004, 51.503], [0.009, 51.5075], [0.016, 51.503], [0.02, 51.494], [0.035, 51.4905],
  [0.06, 51.494], [0.08, 51.4985], [0.11, 51.506], [0.14, 51.505], [0.17, 51.488], [0.2, 51.475], [0.24, 51.465],
  [0.3, 51.46], [0.36, 51.458], [0.42, 51.47], [0.5, 51.49],
].map(([lon, lat]) => toLocal(lat, lon));
// (rounded through its points: a river has no corners)
const THAMES = (() => {
  const out = [];
  const n = THAMES_PTS.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = THAMES_PTS[Math.max(0, i - 1)];
    const p1 = THAMES_PTS[i];
    const p2 = THAMES_PTS[i + 1];
    const p3 = THAMES_PTS[Math.min(n - 1, i + 2)];
    for (let k = 0; k < 4; k++) {
      const t = k / 4;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([0, 1].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
    }
  }
  out.push(THAMES_PTS[n - 1]);
  return out;
})();
const THAMES_CUM = (() => {
  const cum = [0];
  for (let i = 1; i < THAMES.length; i++) cum.push(cum[i - 1] + Math.hypot(THAMES[i][0] - THAMES[i - 1][0], THAMES[i][1] - THAMES[i - 1][1]));
  return cum;
})();
const riverWidth = (x) => 0.24 + Math.max(0, x - 12) * 0.05; // km: wider down toward the estuary
// its bridges (Hammersmith to Tower Bridge), at their arc length down the river
const BRIDGES = [-0.23, -0.214, -0.19, -0.175, -0.167, -0.152, -0.127, -0.1225, -0.12, -0.112, -0.104, -0.098, -0.092, -0.088, -0.0754].map((lon) => {
  const [bx] = toLocal(LAT0, lon);
  let best = 0;
  let bd = Infinity;
  for (let i = 1; i < THAMES.length; i++) {
    const [ax] = THAMES[i - 1];
    const [cx] = THAMES[i];
    if ((bx - ax) * (bx - cx) <= 0) {
      const f = (bx - ax) / (cx - ax || 1);
      const d = Math.abs(f - 0.5);
      if (d < bd) {
        bd = d;
        best = THAMES_CUM[i - 1] + f * (THAMES_CUM[i] - THAMES_CUM[i - 1]);
      }
    }
  }
  return best;
});
// the parks, dark: [lat, lon, half width km, half height km]
const PARKS = [
  [51.507, -0.17, 1.35, 0.45], [51.528, -0.155, 0.6, 0.5], [51.562, -0.165, 1, 0.8], [51.443, -0.275, 1.8, 1.5],
  [51.477, 0.0, 0.4, 0.38], [51.536, -0.04, 0.6, 0.3], [51.479, -0.157, 0.4, 0.3], [51.435, -0.235, 1.2, 1],
  [51.62, 0.03, 1.2, 3.5], [51.57, -0.27, 0.5, 0.5], [51.465, -0.11, 0.35, 0.3], [51.5, -0.155, 0.3, 0.25],
].map(([lat, lon, w, h]) => {
  const [x, y] = toLocal(lat, lon);
  return { x, y, w, h };
});
// the brightest quarters: the City, Canary Wharf, the West End
const BRIGHT = [[51.514, -0.088, 1.2, 0.7], [51.505, -0.019, 0.8, 0.45], [51.512, -0.135, 1, 0.6]].map(([lat, lon, w, h]) => {
  const [x, y] = toLocal(lat, lon);
  return { x, y, w, h };
});
// the towns round London: [lat, lon, radius km, brightness]
const TOWNS = [
  [51.88, -0.42, 4, 0.8], [51.75, -0.34, 3, 0.6], [51.66, -0.4, 3.5, 0.7], [51.51, -0.59, 3.5, 0.7], [51.45, -0.97, 5, 0.85],
  [51.24, -0.57, 3, 0.55], [51.11, -0.19, 3.5, 0.65], [51.27, 0.52, 3.5, 0.6], [51.38, 0.53, 4, 0.75], [51.54, 0.71, 4.5, 0.8],
  [51.58, 0.46, 3.5, 0.65], [51.73, 0.47, 3.5, 0.6], [51.77, 0.11, 3, 0.55], [51.9, -0.2, 3, 0.6], [50.83, -0.14, 5, 0.85],
  [52.2, 0.12, 4, 0.7], [51.75, -1.26, 4, 0.7], [52.04, -0.76, 4.5, 0.75], [51.24, -0.17, 2.5, 0.5], [51.33, 0.27, 2.5, 0.5],
  [51.4, -0.75, 3, 0.55], [51.62, -0.75, 3, 0.55], [51.85, 0.9, 3.5, 0.6], [51.08, 1.08, 3, 0.55], [51.13, 0.26, 2.5, 0.5],
].map(([lat, lon, r, e]) => {
  const [x, y] = toLocal(lat, lon);
  return { lat, lon, x, y, r, e };
});
// the arterial roads out of the centre (bearings, degrees from east), the rings (radius km, width km, light), the
// motorways on beyond the M25
const SPOKES = [8, 34, 61, 84, 103, 126, 151, 176, 199, 222, 243, 265, 289, 311, 336];
const RINGS = [[2.6, 0.035, 1.8], [9.5, 0.04, 1.6], [26, 0.06, 1.2]];
const MOTORWAYS = [48, 92, 100, 182, 208, 238, 262, 300, 334];

function vnoise(x, y, s) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, s);
  const b = hash2(ix + 1, iy, s);
  const c = hash2(ix, iy + 1, s);
  const d = hash2(ix + 1, iy + 1, s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
const fbm = (x, y, s) => 0.6 * vnoise(x, y, s) + 0.3 * vnoise(x * 2.3, y * 2.3, s + 1) + 0.1 * vnoise(x * 5.1, y * 5.1, s + 2);
// the share of a pixel `f` wide that a line `w` wide covers, its middle `d` off the pixel's (a box filter)
const cover = (d, w, f) => Math.max(0, Math.min(w / 2, d + f / 2) - Math.max(-w / 2, d - f / 2)) / f;
// a family of parallel lines `s` apart and `w` wide across coordinate q, seen `f` wide: the share lit (their mean once
// many fall in a pixel)
function family(q, s, w, f) {
  const mean = w / s;
  if (f >= 2 * s) return mean;
  const d = Math.abs((((q / s) % 1) + 1.5) % 1 - 0.5) * s;
  const v = cover(d, w, f);
  return v + (mean - v) * smooth(0.6 * s, 2 * s, f);
}
// lamps along a street every `s`, as a factor round 1 (1 once they run together)
const lampsAlong = (q, s, f) => family(q, s, s * 0.32, f) / 0.32;

const RIV = { d: 0, s: 0 };
function thames(x, y) {
  let bd = Infinity;
  let bs = 0;
  for (let i = 1; i < THAMES.length; i++) {
    const ax = THAMES[i - 1][0];
    const ay = THAMES[i - 1][1];
    const dx = THAMES[i][0] - ax;
    const dy = THAMES[i][1] - ay;
    const t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1);
    const ex = x - ax - dx * t;
    const ey = y - ay - dy * t;
    const d = ex * ex + ey * ey;
    if (d < bd) {
      bd = d;
      bs = THAMES_CUM[i - 1] + t * (THAMES_CUM[i] - THAMES_CUM[i - 1]);
    }
  }
  RIV.d = Math.sqrt(bd);
  RIV.s = bs;
  return RIV;
}
// the districts: the ground parted into cells (a jittered grid's Voronoi, about a mile across), each with its own street
// grid (its bearing, its spacing, how bright it is); the cells' edges are main roads
const DIST = 1.5; // km
const DSTR = { th: 0, o1: 0, o2: 0, s: 0.12, k: 1, edge: 1 };
function district(x, y) {
  const gx = Math.floor(x / DIST);
  const gy = Math.floor(y / DIST);
  let d1 = Infinity;
  let d2 = Infinity;
  let c1x = 0;
  let c1y = 0;
  let c2x = 0;
  let c2y = 0;
  let bi = 0;
  let bj = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = (gx + i + 0.12 + 0.76 * hash2(gx + i, gy + j, 31)) * DIST;
      const cy = (gy + j + 0.12 + 0.76 * hash2(gx + i, gy + j, 37)) * DIST;
      const d = (x - cx) ** 2 + (y - cy) ** 2;
      if (d < d1) {
        d2 = d1;
        c2x = c1x;
        c2y = c1y;
        d1 = d;
        c1x = cx;
        c1y = cy;
        bi = gx + i;
        bj = gy + j;
      } else if (d < d2) {
        d2 = d;
        c2x = cx;
        c2y = cy;
      }
    }
  }
  DSTR.edge = (d2 - d1) / (2 * Math.max(1e-6, Math.hypot(c2x - c1x, c2y - c1y)));
  DSTR.th = (hash2(bi, bj, 41) - 0.5) * 1.6;
  DSTR.o1 = hash2(bi, bj, 43);
  DSTR.o2 = hash2(bi, bj, 47);
  DSTR.s = 0.1 + 0.07 * hash2(bi, bj, 53);
  DSTR.k = 0.6 + 0.8 * hash2(bi, bj, 59) ** 1.5;
  return DSTR;
}
// the nearest arterial road out of the centre: how far off it a point is (km)
function arterialOff(x, y, r) {
  const ang = Math.atan2(y, x) / DEG;
  let best = 180;
  for (let k = 0; k < SPOKES.length; k++) {
    const a = SPOKES[k] + 2.5 * Math.sin(r / 3.3 + k * 1.7) + 1.5 * Math.sin(r / 1.1 + k);
    const da = Math.abs(((ang - a + 540) % 360) - 180);
    if (da < best) best = da;
  }
  return r * Math.sin(Math.min(90, best) * DEG);
}
// the rings' wobble: the M25 is no circle
const ringR = (R, phi) => R * (1 + 0.08 * Math.sin(2 * phi + R) + 0.05 * Math.sin(3 * phi + 1.3 * R) + 0.025 * Math.sin(5 * phi + R));

// how built up the ground is (0..1): Greater London's ragged sprawl (thicker along the roads out), the towns round it,
// the parks dark
function urban(x, y) {
  const r = Math.hypot(x, y);
  const n = fbm(x / 5, y / 5, 3);
  let u = Math.exp(-((r / 17) ** 2.6)) * (0.55 + 0.9 * n);
  if (r > 8) u = Math.max(u, 0.5 * Math.exp(-(arterialOff(x, y, r) ** 2) / 0.5) * Math.exp(-(r - 8) / 16) * (0.4 + 0.9 * n));
  for (const t of TOWNS) {
    const d2 = ((x - t.x) ** 2 + (y - t.y) ** 2) / (t.r * t.r);
    if (d2 < 6) u = Math.max(u, t.e * Math.exp(-d2) * (0.5 + 0.9 * fbm(x / 2, y / 2, 5)));
  }
  u = smooth(0.12, 0.62, u) * Math.min(1.2, 0.4 + u);
  for (const p of PARKS) {
    const d2 = ((x - p.x) / p.w) ** 2 + ((y - p.y) / p.h) ** 2;
    if (d2 < 1.6) u *= clamp((d2 - 0.85) / 0.6, 0.03, 1);
  }
  return u;
}
// London's light at a point seen `f` km wide at beat b; sets WATER (the Thames' share of the pixel), TRAFFIC (1 a car's
// headlights, 2 its tail lights)
let WATER = 0;
let TRAFFIC = 0;
function londonLight(x, y, f, b) {
  WATER = 0;
  TRAFFIC = 0;
  const u = urban(x, y);
  const r = Math.hypot(x, y);
  // seen from high the streets run together, brighter than their lines' mean (the eye's long exposure)
  const gain = 1 + 2.2 * smooth(0.04, 1.6, f);
  let v = 0;
  if (u > 0.01) {
    const D = district(x, y);
    const cs = Math.cos(D.th);
    const sn = Math.sin(D.th);
    const q1 = x * cs + y * sn + D.o1 * D.s;
    const q2 = -x * sn + y * cs + D.o2 * D.s;
    const s2 = D.s * 1.3;
    // the streets, their lamps every thirty-odd metres; every sixth a main road
    const lamps = family(q1, D.s, 0.012, f) * lampsAlong(q2, 0.034, f) + family(q2, s2, 0.012, f) * lampsAlong(q1, 0.034, f);
    const mains = family(q1 + D.s * 0.5, D.s * 6, 0.022, f) + family(q2 + s2 * 0.5, s2 * 6, 0.022, f);
    // ...and the districts' edges
    const meanEdge = (0.026 * 2) / DIST;
    const ce = cover(Math.abs(D.edge), 0.026, f);
    const edges = ce + (meanEdge - ce) * smooth(0.4 * DIST, 1.5 * DIST, f);
    v = u * (0.55 * D.k * lamps + 1.2 * mains + 1.1 * edges * (1 - smooth(0.1, 0.3, f)));
    for (const q of BRIGHT) {
      const d2 = ((x - q.x) / q.w) ** 2 + ((y - q.y) / q.h) ** 2;
      if (d2 < 2.5) {
        v *= 1 + 1.6 * Math.exp(-d2 * 1.5);
      }
    }
  }
  // the arterial roads and the rings, the motorways on beyond; the traffic on them, seen close to
  if (r > 2.4) {
    let lit = 0;
    const roadU = Math.min(1, u * 2 + 0.3);
    if (r < 30) {
      const ad = arterialOff(x, y, r);
      const c0 = cover(ad, 0.032, f);
      lit += 2.3 * roadU * c0;
      if (c0 > 0.3 && f < 0.03) {
        const inb = (((r * 9 + b * 6.5) % 1) + 1) % 1;
        const out = (((r * 9 - b * 6.5 + 0.5) % 1) + 1) % 1;
        if (inb < 0.12) TRAFFIC = 1;
        else if (out < 0.12) TRAFFIC = 2;
      }
    } else {
      let bm = 180;
      const ang = Math.atan2(y, x) / DEG;
      for (const a of MOTORWAYS) bm = Math.min(bm, Math.abs(((ang - a - 3 * Math.sin(r / 9) + 540) % 360) - 180));
      lit += 1.4 * Math.exp(-(r - 30) / 40) * cover(r * Math.sin(Math.min(90, bm) * DEG), 0.05, f);
    }
    const phi = Math.atan2(y, x);
    for (const [R, w, e] of RINGS) lit += e * cover(Math.abs(r - ringR(R, phi)), w, f);
    v += lit;
  }
  v *= gain;
  // the Thames: black water (no light on it), its bridges across it
  if (x > -28 && x < 45 && y > -14 && y < 6) {
    const rv = thames(x, y);
    const w = riverWidth(x);
    if (rv.d < w / 2 + f) {
      const wet = Math.min(1, cover(rv.d, w, f) * (f > w ? f / w : 1));
      WATER = wet;
      v *= 1 - wet;
      if (rv.d < w * 0.62) for (const s of BRIDGES) v += 2.6 * cover(Math.abs(rv.s - s), 0.022, f) * (1 - smooth(0.25, 0.5, f));
      if (wet > 0.5) TRAFFIC = 0;
    }
  }
  // a tower's lights here and there in the bright quarters, seen close to: white points
  if (f < 0.14 && u > 0.35 && WATER < 0.5) {
    const ix = Math.floor(x / 0.085);
    const iy = Math.floor(y / 0.085);
    if (hash2(ix, iy, 17) < 0.03 * u * (1 + DSTR.k)) v += 6 * cover(Math.hypot(x - (ix + 0.5) * 0.085, y - (iy + 0.5) * 0.085), 0.022, f) * (1 - smooth(0.07, 0.14, f));
  }
  return v;
}

// ---------------------------------------------------------------------------------------------
// The lights: the world map's cities and the towns round each, every one on land

// the land mask at a footprint (km), filtered: 0 sea .. 1 land
function landAt(lat, lon, fkm) {
  const lvl = clamp(Math.floor(Math.log2(Math.max(1, fkm / 9.8))), 0, 4);
  const m = landMip(lvl);
  if (!m) return 0;
  const u = ((lon + 180) / 360) * m.w - 0.5;
  const v = ((90 - lat) / 180) * m.h - 0.5;
  const iu = Math.floor(u);
  const iv = clamp(Math.floor(v), 0, m.h - 2);
  const fu = u - iu;
  const fv = clamp(v - iv, 0, 1);
  const u0 = ((iu % m.w) + m.w) % m.w;
  const u1 = (u0 + 1) % m.w;
  // (the finest level is a bit a texel)
  const px = m.bits ? (uu, vv) => ((m.bits[vv * m.stride + (uu >> 3)] >> (uu & 7)) & 1) * 255 : (uu, vv) => m.d[vv * m.w + uu];
  const a = px(u0, iv);
  const b = px(u1, iv);
  const c = px(u0, iv + 1);
  const e = px(u1, iv + 1);
  return ((a + (b - a) * fu) * (1 - fv) + (c + (e - c) * fu) * fv) / 255;
}
// [x, y, z, radius km, brightness] each
let LIGHTS = null;
function lightsTable() {
  if (LIGHTS) return LIGHTS;
  warmMapData();
  const L = cityLights();
  const v = [];
  const add = (lat, lon, r, e, plan = 0) => {
    if (landAt(lat, lon, 5) < 0.55) return; // never on the water
    if (!plan && inBox(lat, lon)) return; // (London's plan draws its own)
    v.push([...evec(lat, lon), r, e, plan]);
  };
  if (L) {
    for (let i = 0; i < L.n; i++) add(L.lat[i], L.lon[i], 3.6, [0.85, 1.25, 0.85, 2.1][L.kind[i]] ?? 0.7);
    // the towns round each city (as planet.js scatters them): the night side glitters
    let sd = 4219;
    const rnd = () => ((sd = (sd * 1103515245 + 12345) >>> 0) / 4294967296);
    for (let q = 0; q < L.n; q++) {
      if (L.kind[q] !== 3) continue;
      let n = 1;
      while (q + n < L.n && L.kind[q + n] !== 3) n++;
      const size = Math.sqrt(Math.max(1, (n - 3) / 2));
      const spread = 0.6 + 0.5 * size;
      const m = Math.round(24 + 26 * size * size);
      for (let k = 0; k < m; k++) {
        const a = rnd() * Math.PI * 2;
        const rr = spread * Math.sqrt(-Math.log(1 - rnd() * 0.98));
        const la = L.lat[q] + Math.sin(a) * rr;
        const lo = L.lon[q] + (Math.cos(a) * rr) / Math.max(0.35, Math.cos(L.lat[q] * DEG));
        add(la, lo, 2, 0.3 + 0.55 * rnd() ** 2);
      }
    }
  }
  // London and its towns, once the plan is too fine for them (flagged)
  add(LAT0, LON0, 16, 2.2, 1);
  for (const t of TOWNS) add(t.lat, t.lon, t.r * 1.1, t.e * 1.1, 1);
  LIGHTS = v;
  return v;
}

// ---------------------------------------------------------------------------------------------
// The frame: each pixel's ray met with the earth (or passing it: the air's glow); the lights laid on; their glow; then
// the colours

const LIGHT_BUF = new Float32Array(NPX);
const KIND = new Uint8Array(NPX); // 0 space, 1 ground
const LAND = new Uint8Array(NPX); // 1 land
const DIF = new Float32Array(NPX); // the sun on the ground (its normal's), -1..1
const GRIDK = new Uint8Array(NPX); // 1 a graticule line, 2 the equator
const HALO = new Float32Array(NPX); // space: the air's glow round the limb
const HALO_SUN = new Float32Array(NPX); // ...how much of it the sun lights
const FWD = new Float32Array(NPX); // ...how straight the ray looks toward the sun
const WET = new Float32Array(NPX); // the Thames' share of a pixel
const TRAF = new Uint8Array(NPX); // the traffic: 1 headlights, 2 tail lights

const HALO_W = 0.022; // the air's depth, earth units
const GRID_STEP = 30;
function trace(c, b) {
  const grid = smooth(Q.settle - 1.2, Q.settle, b);
  const D2 = c.D * c.D;
  const plan = 1 - smooth(Math.log(500 / KM), Math.log(1400 / KM), Math.log(c.h)); // London's plan, until it is too fine
  // the air's glow: over the earth's edge by an angle, thinning with it (from close by, the sky's lower reaches glow)
  const tau = Math.min(12 * DEG, HALO_W / Math.sqrt(D2 - 1));
  LIGHT_BUF.fill(0);
  for (let y = 0; y < VH; y++) {
    for (let x = 0; x < VW; x++) {
      const i = y * VW + x;
      const ox = x + 0.5 - REST.x;
      const oy = y + 0.5 - REST.y;
      const dx = c.fx * F + ox * c.rx - oy * c.ux;
      const dy = c.fy * F + ox * c.ry - oy * c.uy;
      const dz = c.fz * F + ox * c.rz - oy * c.uz;
      const a = dx * dx + dy * dy + dz * dz;
      const bq = c.px * dx + c.py * dy + c.pz * dz;
      const disc = bq * bq - a * (D2 - 1);
      if (disc <= 0) {
        // space: the air's glow by how close the ray passes the earth; the sun on the air where it passes closest
        KIND[i] = 0;
        TRAF[i] = 0;
        const rho = Math.sqrt(Math.max(0, D2 - (bq * bq) / a));
        const gam = Math.acos(clamp(-bq / (c.D * Math.sqrt(a)), -1, 1)); // the ray's angle off the earth's middle
        HALO[i] = Math.exp(-Math.max(0, gam - c.alpha) / tau);
        const t = -bq / a;
        HALO_SUN[i] = ((c.px + t * dx) * c.sx + (c.py + t * dy) * c.sy + (c.pz + t * dz) * c.sz) / Math.max(1e-6, rho);
        FWD[i] = Math.max(0, (dx * c.sx + dy * c.sy + dz * c.sz) / Math.sqrt(a));
        continue;
      }
      KIND[i] = 1;
      const t = (-bq - Math.sqrt(disc)) / a;
      const gx = c.px + t * dx;
      const gy = c.py + t * dy;
      const gz = c.pz + t * dz;
      const la = Math.sqrt(a);
      const cosInc = Math.max(0.12, -(dx * gx + dy * gy + dz * gz) / la);
      const fkm = (KM * t * la * F) / (a * cosInc); // the pixel's footprint
      const lat = Math.asin(clamp(gy, -1, 1)) / DEG;
      const lon = Math.atan2(gx, gz) / DEG;
      const lv = landAt(lat, lon, fkm);
      LAND[i] = lv > 0.5 ? 1 : 0;
      DIF[i] = gx * c.sx + gy * c.sy + gz * c.sz;
      WET[i] = 0;
      TRAF[i] = 0;
      // London's lights from its plan (on land only)
      if (plan > 0 && Math.abs(lat - LAT0) < 1.1 && Math.abs(lon - LON0) < 1.8) {
        const lx = (lon - LON0) * KX;
        const ly = (lat - LAT0) * KY;
        const edge = Math.max(Math.abs(lx), Math.abs(ly));
        if (edge < BOX) {
          const night = smooth(0.06, -0.1, DIF[i]);
          LIGHT_BUF[i] = londonLight(lx, ly, fkm, b) * plan * night * smooth(BOX, BOX * 0.8, edge) * smooth(0.3, 0.7, lv);
          WET[i] = WATER;
          TRAF[i] = plan > 0.5 && night > 0.5 ? TRAFFIC : 0;
        }
      }
      // the graticule and the equator, coming in as the camera settles (a line a pixel wide)
      GRIDK[i] = 0;
      if (grid > 0) {
        const fd = fkm / 111.2;
        const lk = Math.round(lat / GRID_STEP) * GRID_STEP;
        if (Math.abs(lat - lk) < fd / 2) GRIDK[i] = lk === 0 ? 2 : 1;
        else if (Math.abs(lat) < 80) {
          const mk = Math.round(lon / GRID_STEP) * GRID_STEP;
          if (Math.abs(lon - mk) * Math.cos(lat * DEG) < fd / 2) GRIDK[i] = 1;
        }
        if (GRIDK[i] && ditherAt(x, y) >= grid * 16) GRIDK[i] = 0;
      }
    }
  }
  // the lights, each spread by how far off it is (a city close to is a pool of light, far off a point), on the night side
  const pts = lightsTable();
  const P3 = [0, 0, 0];
  for (let q = 0; q < pts.length; q++) {
    const [ex, ey, ez, rk, e, fromPlan] = pts[q];
    const amt = fromPlan ? 1 - plan : 1;
    if (amt <= 0) continue;
    if (ex * c.px + ey * c.py + ez * c.pz < 1.0004) continue; // over the horizon
    const night = smooth(0.06, -0.1, ex * c.sx + ey * c.sy + ez * c.sz);
    if (night <= 0) continue;
    project(c, ex, ey, ez, P3);
    if (P3[2] <= 0 || P3[0] < -10 || P3[0] > VW + 10 || P3[1] < -10 || P3[1] > VH + 10) continue;
    const f = (P3[2] * KM) / F;
    const rpx = rk / f;
    const v = e * amt * night * (rpx >= 0.6 ? 1 : ((rpx * rpx) / 0.36) ** 0.28);
    splat(P3[0], P3[1], Math.max(0.6, rpx), v);
  }
  bloom();
}
// a light at (x, y), r px in radius: on the ground's land pixels only
function splat(x, y, r, v) {
  if (r <= 1) {
    const x0 = Math.floor(x - 0.5);
    const y0 = Math.floor(y - 0.5);
    const fx = x - 0.5 - x0;
    const fy = y - 0.5 - y0;
    const add = (xx, yy, w) => {
      if (xx < 0 || yy < 0 || xx >= VW || yy >= VH) return;
      const i = yy * VW + xx;
      if (LAND[i] && KIND[i] && WET[i] < 0.5) LIGHT_BUF[i] += v * w * 2;
    };
    add(x0, y0, (1 - fx) * (1 - fy));
    add(x0 + 1, y0, fx * (1 - fy));
    add(x0, y0 + 1, (1 - fx) * fy);
    add(x0 + 1, y0 + 1, fx * fy);
    return;
  }
  const R = Math.ceil(r * 1.6);
  const xi = Math.round(x);
  const yi = Math.round(y);
  for (let yy = yi - R; yy <= yi + R; yy++) {
    if (yy < 0 || yy >= VH) continue;
    for (let xx = xi - R; xx <= xi + R; xx++) {
      if (xx < 0 || xx >= VW) continue;
      const i = yy * VW + xx;
      if (!KIND[i] || !LAND[i] || WET[i] >= 0.5) continue;
      const d2 = ((xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2) / (r * r);
      if (d2 < 2.6) LIGHT_BUF[i] += v * Math.exp(-d2 * 1.4) * (0.6 + 0.8 * hash2(xx, yy, 23));
    }
  }
}

// the light's glow in the lens: a quarter of the frame, blurred twice, laid back over itself
const GW = VW / 4;
const GH = VH / 4;
const GL = new Float32Array(GW * GH);
const GT = new Float32Array(GW * GH);
const GLOW_K = 0.6;
const RAW = new Float32Array(NPX); // the light before its glow
function bloom() {
  const B = LIGHT_BUF;
  GL.fill(0);
  RAW.set(B);
  for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) GL[(y >> 2) * GW + (x >> 2)] += Math.max(0, Math.min(8, B[y * VW + x]) - 1.6) / 16; // (the bright lights glow; the lamps' mesh does not fill the blocks)
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < GH; y++) {
      for (let x = 0; x < GW; x++) {
        let s = 0;
        for (let k = -2; k <= 2; k++) s += GL[y * GW + clamp(x + k, 0, GW - 1)];
        GT[y * GW + x] = s / 5;
      }
    }
    for (let y = 0; y < GH; y++) {
      for (let x = 0; x < GW; x++) {
        let s = 0;
        for (let k = -2; k <= 2; k++) s += GT[clamp(y + k, 0, GH - 1) * GW + x];
        GL[y * GW + x] = s / 5;
      }
    }
  }
  for (let y = 0; y < VH; y++) {
    const gy = Math.min(GH - 1.001, Math.max(0, y / 4 - 0.375));
    const y0 = Math.floor(gy);
    const fy = gy - y0;
    for (let x = 0; x < VW; x++) {
      const gx = Math.min(GW - 1.001, Math.max(0, x / 4 - 0.375));
      const x0 = Math.floor(gx);
      const fx = gx - x0;
      const i = y0 * GW + x0;
      B[y * VW + x] += GLOW_K * ((GL[i] * (1 - fx) + GL[i + 1] * fx) * (1 - fy) + (GL[i + GW] * (1 - fx) + GL[i + GW + 1] * fx) * fy);
    }
  }
}

// the palette's ramps: the lights (the sodium's amber to white), the emblem's globe by day (its LUT: ocean, land,
// graticule, equator, five light levels), the air by night, by day and toward a low sun
const LAMP = [C.maroon, C.brown, C.rust, C.orange, C.yellow, C.cream, C.white];
const DAY = {
  sea: [C.black, C.ink, C.ink, C.navy, C.navy],
  land: [C.ink, C.slate, C.steel, C.fog, C.silver],
  grid: [C.ink, C.slate, C.slate, C.steel, C.steel],
  equator: [C.maroon, C.darkRed, C.darkRed, C.red, C.red],
};
const AIR_NIGHT = [C.black, C.ink, C.navy, C.navy];
const AIR_CITY = [C.black, C.ink, C.maroon, C.brown]; // the sky over a city at night, lit from below
const AIR_DAY = [C.black, C.navy, C.blue, C.cyan, C.white];
const AIR_DAWN = [C.black, C.maroon, C.darkRed, C.rust, C.orange, C.yellow, C.cream, C.white];
const LMAX = Math.log1p(9);
function develop(d, c) {
  const dawn = smooth(-4 * DEG, 0, c.over) * (1 - smooth(10 * DEG, 30 * DEG, c.over)); // the sun low behind the limb
  const city = 1 - smooth(Math.log(15 / KM), Math.log(120 / KM), Math.log(c.h)); // the city's glow in the sky over it
  for (let y = 0; y < VH; y++) {
    for (let x = 0; x < VW; x++) {
      const i = y * VW + x;
      const th = ditherAt(x, y);
      const t = th / 16;
      if (!KIND[i]) {
        const h = HALO[i];
        if (h < 0.03) continue;
        const warm = dawn * FWD[i] ** 28;
        if (city > 0 && h * city > 0.15) {
          d[i] = AIR_CITY[Math.min(3, Math.floor(h * city * 3.2 + t))];
          continue;
        }
        const sun = smooth(-0.2, 0.35, HALO_SUN[i]);
        if (warm * h > 0.08) d[i] = AIR_DAWN[Math.min(7, Math.floor(warm * h * 8 + t))];
        else if (sun * 16 > th + 0.5 && sun > 0.02) d[i] = AIR_DAY[Math.min(4, Math.floor(h * (2 + 2.2 * sun) + t))];
        else d[i] = AIR_NIGHT[Math.min(3, Math.floor(h * 2.6 + t))];
        continue;
      }
      if (TRAF[i]) {
        d[i] = TRAF[i] === 1 ? C.white : C.red;
        continue;
      }
      const dif = DIF[i];
      const land = LAND[i] === 1 && WET[i] < 0.5 + (t - 0.5) * 0.6;
      const g = GRIDK[i];
      // day: the emblem's ramps by the light's level; a warm band where the sun is low; night: the land a little
      // moonlit, the sea black
      const day = smooth(-0.05, 0.1, dif);
      let col;
      if (day * 16 > th + 0.5 && day > 0.01) {
        const lv = clamp((dif + 0.1) * 3.3, 0, 3.999);
        const k = Math.min(4, Math.floor(lv) + (lv - Math.floor(lv) > t ? 1 : 0));
        col = (g === 2 ? DAY.equator : g === 1 ? DAY.grid : land ? DAY.land : DAY.sea)[k];
        const low = Math.exp(-(((dif - 0.03) / 0.05) ** 2));
        if (!g && low * 12 > th) col = land ? (low > 0.75 ? C.rust : C.brown) : C.maroon;
      } else col = g === 2 ? C.maroon : land && th < 6 ? C.ink : C.black;
      // the lights over it (their glow kept off the sea)
      const v = land ? LIGHT_BUF[i] : RAW[i] + (LIGHT_BUF[i] - RAW[i]) * 0.12;
      if (v > 0.02) {
        const li = (Math.log1p(v * 1.6) / LMAX) * LAMP.length;
        const k = Math.floor(li + t - 0.35);
        if (k >= 0) col = LAMP[Math.min(LAMP.length - 1, k)];
      }
      d[i] = col;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// The stars (fixed in the sky: they turn as the camera turns), the sun's burst

const STARS = (() => {
  let s = 4021;
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
  const out = [];
  for (let i = 0; i < 1400; i++) {
    const z = rnd() * 2 - 1;
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    const k = rnd();
    out.push({ x: r * Math.cos(a), y: z, z: r * Math.sin(a), c: k < 0.6 ? C.slate : k < 0.85 ? C.steel : k < 0.96 ? C.fog : C.silver, cross: k > 0.988 });
  }
  return out;
})();
function drawStars(d, c) {
  for (const s of STARS) {
    const zc = s.x * c.fx + s.y * c.fy + s.z * c.fz;
    if (zc <= 0.2) continue;
    const x = Math.round(REST.x + (F * (s.x * c.rx + s.y * c.ry + s.z * c.rz)) / zc - 0.5);
    const y = Math.round(REST.y - (F * (s.x * c.ux + s.y * c.uy + s.z * c.uz)) / zc - 0.5);
    if (x < 1 || y < 1 || x >= VW - 1 || y >= VH - 1) continue;
    const i = y * VW + x;
    if (KIND[i] || HALO[i] > 0.1) continue;
    d[i] = s.c;
    if (s.cross) for (const j of [i - 1, i + 1, i - VW, i + VW]) if (!KIND[j]) d[j] = C.slate;
  }
}

// the sun, once it is past the earth's edge: a white core in a cream disc, rays of yellow and orange, a streak across the
// lens; fullest as it clears the edge, fading as it goes on round
function drawSun(d, c) {
  const I = smooth(-0.5 * DEG, 2.2 * DEG, c.over) * (1 - smooth(8 * DEG, 22 * DEG, c.over));
  if (I <= 0.01) return;
  const sx = c.sx * c.rx + c.sy * c.ry + c.sz * c.rz;
  const sy = c.sx * c.ux + c.sy * c.uy + c.sz * c.uz;
  const sz = c.sx * c.fx + c.sy * c.fy + c.sz * c.fz;
  if (sz <= 0.05) return;
  const X = REST.x + (F * sx) / sz;
  const Y = REST.y - (F * sy) / sz;
  const put = (x, y, col, a, overEarth = false) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= VW || yi >= VH) return;
    const i = yi * VW + xi;
    if (KIND[i] && !overEarth) return; // behind the earth
    if (a >= 1 || ditherAt(xi, yi) < a * 16) d[i] = col;
  };
  // the streak across the lens (along the frame's horizontal, over everything: it is in the glass)
  const sl = 30 + 70 * I;
  for (let s = -sl; s <= sl; s += 1) {
    const k = 1 - Math.abs(s) / sl;
    put(X + s, Y, k > 0.75 ? C.cream : k > 0.4 ? C.yellow : C.orange, k * k * I * 1.4, true);
  }
  // the rays
  const len = 7 + 24 * I;
  for (const [ax, ay, long] of [[1, 0, 1], [0, 1, 1], [0.7071, 0.7071, 0], [0.7071, -0.7071, 0]]) {
    const L = long ? len : len * 0.5;
    for (let s = -L; s <= L; s += 0.5) {
      const k = 1 - Math.abs(s) / L;
      put(X + ax * s, Y + ay * s, k > 0.7 ? C.cream : k > 0.35 ? C.yellow : C.orange, Math.min(1, k * 1.8) * I);
    }
  }
  // the disc
  const r = 1.2 + 2.2 * I;
  for (let yy = -6; yy <= 6; yy++) {
    for (let xx = -6; xx <= 6; xx++) {
      const q = Math.hypot(xx, yy);
      if (q <= r) put(X + xx, Y + yy, q < r * 0.55 ? C.white : C.cream, 1);
      else if (q <= r + 2) put(X + xx, Y + yy, C.yellow, 0.55 * I);
    }
  }
}

const P3 = [0, 0, 0];
// the routes out of London: drawn out from London over a beat each, a red line with a bright head; a ring where each
// lands; London's marker once London is a point
const ROUTE_RUN = 1;
let ROUTE_PTS = null;
const routes = () => ROUTE_PTS || (ROUTE_PTS = ROUTES.map((dst) => routePoints(LONDON, dst, ROUTE_H, 8)));
const ROUTE_ORDER = [0, 2, 1]; // New York, New Delhi, Nairobi (world.js ROUTES: New York, Nairobi, New Delhi)
function drawRoutes(d, c, b) {
  const R = routes();
  ROUTE_ORDER.forEach((r, n) => {
    const p = easeInOut(seg(b, Q.launch[n], ROUTE_RUN));
    if (p <= 0) return;
    const pts = R[r];
    const upto = (pts.length - 1) * p;
    const last = Math.floor(upto);
    let px = null;
    let py = null;
    for (let k = 0; k <= last + 1 && k < pts.length; k++) {
      let [x, y, z] = pts[k];
      if (k === last + 1) {
        const f = upto - last;
        const [x0, y0, z0] = pts[last];
        x = x0 + (x - x0) * f;
        y = y0 + (y - y0) * f;
        z = z0 + (z - z0) * f;
      }
      if (!inSight(c, x, y, z)) {
        px = null;
        continue;
      }
      project(c, x, y, z, P3);
      if (P3[2] <= 0) {
        px = null;
        continue;
      }
      if (px !== null) {
        const n2 = Math.max(1, Math.ceil(Math.hypot(P3[0] - px, P3[1] - py) * 1.5));
        for (let s = 1; s <= n2; s++) {
          const fx = px + ((P3[0] - px) * s) / n2;
          const fy = py + ((P3[1] - py) * s) / n2;
          const xi = Math.floor(fx);
          const yi = Math.floor(fy);
          if (xi < 0 || yi < 0 || xi >= VW || yi >= VH) continue;
          const head = (upto - k) / (pts.length - 1); // how far behind the head
          const hot = p < 1 && head < 0.012;
          d[yi * VW + xi] = hot ? C.white : p < 1 && head < 0.05 ? C.pink : C.red;
          // its glow: dark red either side (the head's wider and pink)
          for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const X = xi + ax;
            const Y = yi + ay;
            if (X < 0 || Y < 0 || X >= VW || Y >= VH) continue;
            const j = Y * VW + X;
            if (d[j] === C.red || d[j] === C.white || d[j] === C.pink) continue;
            if (hot) d[j] = C.pink;
            else if (ditherAt(X, Y) < 7) d[j] = C.darkRed;
          }
        }
      }
      px = P3[0];
      py = P3[1];
    }
    // it lands: a ring opens round the city
    const land = seg(b, Q.launch[n] + ROUTE_RUN, 0.6);
    if (land > 0 && land < 1) {
      const [x, y, z] = pts[pts.length - 1];
      if (inSight(c, x, y, z)) {
        project(c, x, y, z, P3);
        ringAt(d, P3[0], P3[1], 1.5 + 7 * easeOutQuint(land), C.red, 1 - land);
      }
    }
    if (p >= 1) {
      const [x, y, z] = pts[pts.length - 1];
      if (inSight(c, x, y, z)) {
        project(c, x, y, z, P3);
        const xi = Math.floor(P3[0]);
        const yi = Math.floor(P3[1]);
        if (xi >= 0 && yi >= 0 && xi < VW && yi < VH) d[yi * VW + xi] = C.white;
      }
    }
  });
  // London's marker: a red square, its middle white, once the city is a point of light; a ripple as each route leaves
  const show = smooth(Q.launch[0] - 0.6, Q.launch[0] - 0.1, b);
  const L = evec(...LONDON);
  if (show > 0 && inSight(c, L[0] * 1.0005, L[1] * 1.0005, L[2] * 1.0005)) {
    project(c, L[0], L[1], L[2], P3);
    const lx = Math.round(P3[0] - 0.5);
    const ly = Math.round(P3[1] - 0.5);
    for (let n = 0; n < 3; n++) {
      const rp = seg(b, Q.launch[n] - 0.1, 0.7);
      if (rp > 0 && rp < 1) ringAt(d, lx + 0.5, ly + 0.5, 2 + 9 * easeOutQuint(rp), C.red, (1 - rp) * show);
    }
    for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) {
      const X = lx + xx;
      const Y = ly + yy;
      if (X < 0 || Y < 0 || X >= VW || Y >= VH) continue;
      if (ditherAt(X, Y) < show * 16) d[Y * VW + X] = xx || yy ? C.red : C.white;
    }
  }
}
function ringAt(d, x, y, r, col, a = 1) {
  const n = Math.max(12, Math.ceil(r * 7));
  for (let k = 0; k < n; k++) {
    const t = (k / n) * Math.PI * 2;
    const X = Math.floor(x + Math.cos(t) * r);
    const Y = Math.floor(y + Math.sin(t) * r);
    if (X < 0 || Y < 0 || X >= VW || Y >= VH) continue;
    if (a >= 1 || ditherAt(X, Y) < a * 16) d[Y * VW + X] = col;
  }
}

// ---------------------------------------------------------------------------------------------
// The logotype: WORLD in the channel's 5x7 face at four times its size, each of its pixels a 4 x 4 block, filled top to
// bottom from white through silver and fog to steel (the emblem's chrome), a white edge along its tops and an ink one
// along its undersides, a black outline. A red bar sweeps across from the left and leaves the letters in its wake; NOW
// under it at twice the size, its letters spaced, between two red rules, opening from its middle; on the hit a shine runs
// across the letters.

const SC = 4;
const TOP = 226; // WORLD's cap line
const NOW_Y = 264;
const ROWS = 7 * SC;
const WIPE = 0.5; // beats the bar takes across
const BAR_W = 6;
let LETTERS = null;
function letters() {
  if (LETTERS) return LETTERS;
  const glyphs = [...'WORLD'].map((ch) => textPixels(ch, 'body'));
  const width = glyphs.reduce((a, g) => a + g.width, 0) + (glyphs.length - 1);
  let cx = Math.round(VW / 2 - (width * SC) / 2);
  LETTERS = glyphs.map((g) => {
    const l = { x: cx, w: g.width, pixels: g.pixels };
    cx += (g.width + 1) * SC;
    return l;
  });
  return LETTERS;
}
const MASK = new Uint8Array(NPX);
const titleSpan = () => {
  const ls = letters();
  return { x0: ls[0].x, x1: ls.at(-1).x + ls.at(-1).w * SC };
};
// the bar's leading edge at beat b (from left of the word to past its end), or null before and after
function barAt(b) {
  const p = seg(b, Q.title, WIPE);
  if (p <= 0 || p >= 1) return null;
  const { x0, x1 } = titleSpan();
  return Math.round(x0 - BAR_W - 4 + (x1 - x0 + 2 * BAR_W + 8) * easeInOut(p));
}
function logotype(L, b) {
  if (b < Q.title) return;
  const ls = letters();
  const { x0: wx0, x1: wx1 } = titleSpan();
  const x0 = wx0 - 3;
  const x1 = wx1 + 3;
  const y0 = TOP - 3;
  const y1 = TOP + ROWS + 3;
  const edge = barAt(b);
  const shown = edge === null ? wx1 + 8 : edge - BAR_W; // the letters are in to here
  for (let y = y0; y <= y1; y++) MASK.fill(0, y * VW + x0, y * VW + x1 + 1);
  for (const l of ls) {
    for (const [gx, gy] of l.pixels) {
      for (let j = 0; j < SC; j++) {
        const r = gy * SC + j;
        for (let i = 0; i < SC; i++) {
          const X = l.x + gx * SC + i;
          if (X <= shown) MASK[(TOP + r) * VW + X] = 1 + r;
        }
      }
    }
  }
  const d = L.d;
  const m = (x, y) => (x >= x0 && y >= y0 && x <= x1 && y <= y1 ? MASK[y * VW + x] : 0);
  const shine = seg(b, Q.lock, 0.5);
  const sx = wx0 - 20 + (wx1 - wx0 + 40) * easeInOut(shine);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const v = MASK[y * VW + x];
      if (v) {
        const r = v - 1;
        let col = r < 2 ? C.white : r < 11 ? C.silver : r < 20 ? C.fog : C.steel;
        if (!m(x, y - 1)) col = C.white;
        else if (!m(x, y + 1) && r > 4) col = C.ink;
        if (shine > 0 && shine < 1 && Math.abs(x - sx + (y - TOP) * 0.5) < 2) col = C.white;
        d[y * VW + x] = col;
        continue;
      }
      if (m(x - 1, y) || m(x + 1, y) || m(x, y - 1) || m(x, y + 1)) d[y * VW + x] = C.black;
    }
  }
  if (edge !== null) {
    // the bar: red, a white leading edge, a dark red trailing one, a little taller than the letters
    for (let y = TOP - 3; y <= TOP + ROWS + 2; y++) {
      for (let x = edge - BAR_W; x <= edge; x++) {
        L.plot(x, y, x === edge ? C.white : x === edge - BAR_W ? C.darkRed : C.red);
      }
    }
  }
}
// NOW: opening from its middle once WORLD is in, its letters spaced, a red rule each side
function now(ctx, b) {
  const p = easeOutQuint(seg(b, Q.title + WIPE * 0.8, 0.45));
  if (p <= 0) return;
  const word = [...'NOW'];
  const gap = 5;
  const ws = word.map((ch) => measureText(ch, 2));
  const total = ws.reduce((a, w) => a + w, 0) + gap * (word.length - 1);
  const x0 = Math.round(VW / 2 - total / 2);
  const { x0: left, x1: right } = titleSpan();
  const half = Math.round(((right - left) / 2) * p);
  ctx.save();
  try {
    ctx.beginPath();
    ctx.rect(VW / 2 - half, NOW_Y - 2, half * 2, 20);
    ctx.clip();
    let x = x0;
    word.forEach((ch, i) => {
      drawText(ctx, ch, x, NOW_Y, { color: P.white, scale: 2 });
      x += ws[i] + gap;
    });
    ctx.fillStyle = P.red;
    ctx.fillRect(left, NOW_Y + 6, x0 - 8 - left, 2);
    ctx.fillRect(x0 + total + 8, NOW_Y + 6, right - (x0 + total + 8), 2);
  } finally {
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------------------------

const LAYER = new Layer('world-intro', VW, VH);

/** The intro's frame at t seconds (the whole frame). */
export function drawWorldIntro(ctx, t) {
  const b = t / BEAT;
  const L = LAYER;
  L.begin(C.black);
  const c = cameraAt(b);
  trace(c, b);
  develop(L.d, c);
  drawStars(L.d, c);
  drawSun(L.d, c);
  drawRoutes(L.d, c, b);
  logotype(L, b);
  L.end(ctx);
  now(ctx, b);
}

export const WORLD_INTRO = Object.freeze({
  id: 'world-now',
  cues: Q,
  draw: drawWorldIntro,
  warm: () => [landMip(0), lightsTable(), routes(), letters()],
});
/** The camera at beat b (for checks): its place, height, look and the sun past the earth's edge (earth units, radians). */
export const worldIntroCamera = (b) => {
  const c = cameraAt(b, {});
  return { lat: c.lat, lon: c.lon, h: c.h, D: c.D, pitch: c.pitch, head: c.head, roll: c.roll, over: c.over, px: c.px, py: c.py, pz: c.pz };
};
/** The globe's radius on the frame at beat b, px (once the camera looks straight down at it). */
export const worldIntroRadius = (b) => F * Math.tan(Math.asin(1 / cameraAt(b, {}).D));
/** The logotype's box at rest (for checks): { x0, x1, y0, y1 } of WORLD and NOW together. */
export function worldIntroTitle() {
  const { x0, x1 } = titleSpan();
  return { x0: x0 - 1, x1, y0: TOP - 1, y1: NOW_Y + 14 };
}
/** The lights (for checks): [x, y, z, radius km, brightness] each, every one on land. */
export const worldIntroLights = () => lightsTable();
/** The land mask's value (0 sea .. 1 land) at a place, for checks. */
export const worldIntroLand = (lat, lon) => landAt(lat, lon, 5);
