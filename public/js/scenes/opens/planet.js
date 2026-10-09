// WORLD NOW's big earth: the emblem's globe (world.js) rendered pixel by pixel for any camera, so
// the titles can fly from a close-up of Europe at night out to the emblem. Everything is drawn into
// one full-frame pixel buffer (palette colours only) and blitted once.
//
//   cam = {
//     cx, cy  disc centre on screen (may be far off screen), R radius in px,
//     tilt    latitude facing the camera (deg), lam longitude facing the camera (deg),
//     light   unit vector towards the sun in screen space (x right, y up, z towards the viewer),
//     atmo    0..1 the atmosphere's glow around the limb,
//     lights  0..1 how many of the night side's city lights are on (each light has its own rank),
//     wake    deg: only lights within this distance of London are on,
//     space   0..1 how much of the frame is black space with stars (the rest is left clear, so a
//             backdrop drawn under the buffer shows through, dissolved with the Bayer matrix),
//     grid    0..1 how much of the graticule shows (a close-up of the night side has none),
//     equator 0..1 how much of the red equator shows on the night side (the day always shows it),
//   }
//
// At the emblem's own camera (tilt 24, its light) a disc pixel is the one world.js's drawGlobe
// draws (same texture, light levels, dither phase and rim), so the titles hand over to the lock-up
// without a pop. Bigger discs sample a finer land mask (the world map's 1024 and 2048 levels).
import { P } from '../../palette.js';
import { landMip, cityLights } from '../worldmap.js';
import { u32, clamp, bayer, BAYER4 } from '../../gfx/index.js';
import { W, H, frameBuffer } from './kit.js';
import { globeTexture, GLOBE_STYLES, LONDON, evec } from './world.js';

const DEG = Math.PI / 180;
const C = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, u32(v)]));

// ---------------------------------------------------------------------------------------------
// Textures: bit 0 land, bit 1 graticule (every 30 degrees), bit 2 the equator; level 0 is the
// emblem's own 512x256 texture, levels 1 and 2 the same drawing at 1024 and 2048.

const TEX = [null, null, null];
export function planetTexture(level) {
  if (level <= 0) return TEX[0] || (TEX[0] = { d: globeTexture(), w: 512, h: 256 });
  if (TEX[level]) return TEX[level];
  const w = 512 << level;
  const h = 256 << level;
  const s = 1 << level;
  const d = new Uint8Array(w * h);
  try {
    const mip = landMip(3 - level);
    if (mip && mip.w === w && mip.h === h && mip.d) for (let i = 0; i < w * h; i++) d[i] = mip.d[i] > 127 ? 1 : 0;
  } catch {
    /* no land data: an ocean world */
  }
  for (const lat of [-60, -30, 30, 60]) {
    const j = clamp(Math.round(((90 - lat) / 180) * h - 0.5), 0, h - 1);
    for (let i = 0; i < w; i++) d[j * w + i] |= 2;
  }
  for (let i = 0; i < w; i++) d[(h / 2 - 1) * w + i] |= 4;
  for (let lon = -180; lon < 180; lon += 30) {
    const i = ((Math.round(((lon + 180) / 360) * w) % w) + w) % w;
    for (let j = 10 * s; j < h - 10 * s; j++) d[j * w + i] |= 2;
  }
  TEX[level] = { d, w, h };
  return TEX[level];
}

// ---------------------------------------------------------------------------------------------
// Camera

/**
 * Per-frame camera terms; returns cam. The centre and radius stay fractional: the disc is drawn from
 * the true circle, so its limb only ever moves the way the camera moves (rounding the centre and the
 * radius apart made the horizon step back and forth). The dither is fixed on the screen at (ax, ay)
 * (default: the rounded centre), so a pixel of a moving gradient changes once as the gradient passes,
 * never back and forth; anchored where the emblem stands, it matches the emblem's own phase there.
 */
export function aim(cam) {
  cam.R = Math.max(1, cam.R);
  cam.rr = cam.R + 0.5;
  if (!Number.isFinite(cam.ax)) cam.ax = Math.round(cam.cx);
  if (!Number.isFinite(cam.ay)) cam.ay = Math.round(cam.cy);
  cam.cl = Math.cos(cam.lam * DEG);
  cam.sl = Math.sin(cam.lam * DEG);
  cam.ct = Math.cos(cam.tilt * DEG);
  cam.st = Math.sin(cam.tilt * DEG);
  return cam;
}

/**
 * Screen position of an earth-frame vector (unit on the surface, longer when lifted):
 * out = [x, y, depth, visible]; visible as on the emblem: on the near side (a route that goes over
 * the horizon goes out of sight there, never loops round the limb).
 */
export function project(cam, v, out) {
  const x = v[0] * cam.cl - v[2] * cam.sl;
  const z = v[0] * cam.sl + v[2] * cam.cl;
  const vy = v[1] * cam.ct - z * cam.st;
  const vz = v[1] * cam.st + z * cam.ct;
  out[0] = cam.cx + x * cam.rr;
  out[1] = cam.cy - vy * cam.rr;
  out[2] = vz;
  out[3] = vz >= 0.05 ? 1 : 0;
  return out;
}

/** The light falling on an earth-frame vector's surface point (its normal), -1..1. */
export function litAt(cam, v) {
  const x = v[0] * cam.cl - v[2] * cam.sl;
  const z = v[0] * cam.sl + v[2] * cam.cl;
  const vy = v[1] * cam.ct - z * cam.st;
  const vz = v[1] * cam.st + z * cam.ct;
  const L = cam.light;
  return x * L[0] + vy * L[1] + vz * L[2];
}

// ---------------------------------------------------------------------------------------------
// The frame buffer

let FB = null;
let D = null;
const plot = (x, y, c) => {
  if (x >= 0 && x < W && y >= 0 && y < H) D[y * W + x] = c;
};
/** Plot through the Bayer matrix: drawn where the threshold at (x, y) is under a (0..1). */
const plotA = (x, y, c, a) => {
  if (a >= 1 || BAYER4[((y & 3) << 2) | (x & 3)] < a * 16) plot(x, y, c);
};

/** Starts a frame: black space (dissolved by `space`) with its stars. */
export function begin(cam, t = 0) {
  FB = frameBuffer('planet', W, H);
  D = FB.d;
  const sp = clamp(cam.space ?? 1, 0, 1);
  if (sp >= 1) D.fill(C.black);
  else if (sp <= 0) D.fill(0);
  else {
    // the field comes up from behind the planet outwards: space lingers longest at the edges
    const cx = cam.cx;
    const cy = cam.cy;
    const far = 1 / Math.hypot(W, H);
    for (let y = 0; y < H; y++) {
      const row = (y & 3) << 2;
      const dy = (y - cy) * (y - cy);
      for (let x = 0; x < W; x++) {
        const k = clamp(sp * 1.7 - 0.7 + Math.sqrt((x - cx) * (x - cx) + dy) * far * 1.4, 0, 1);
        D[y * W + x] = BAYER4[row | (x & 3)] < k * 16 ? C.black : 0;
      }
    }
  }
  if (sp > 0) stars(cam, sp, t);
}

/** Blits the frame onto ctx. */
export function end(ctx) {
  FB.cx.putImageData(FB.img, 0, 0);
  ctx.drawImage(FB.cv, 0, 0);
}

// Stars: a fixed field wider than the frame that drifts a little as the camera turns (they are
// far: 0.5 px a degree of longitude, 0.4 px a degree of tilt). Most are dim; a few bright ones
// carry a 1 px cross; none twinkles (the sky is not the story).
let STARS = null;
function starField() {
  if (STARS) return STARS;
  let s = 7331;
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
  const SW = W + 160;
  const SH = H + 80;
  const out = [];
  for (let i = 0; i < 190; i++) {
    const r = rnd();
    out.push({ x: rnd() * SW, y: rnd() * SH, c: r < 0.62 ? C.slate : r < 0.86 ? C.steel : r < 0.96 ? C.fog : C.silver, cross: r >= 0.985, th: rnd() });
  }
  STARS = { list: out, SW, SH };
  return STARS;
}
function stars(cam, sp, t) {
  const F = starField();
  const ox = cam.lam * 0.5 + 40;
  const oy = cam.tilt * 0.4 + 30;
  for (const st of F.list) {
    const x = Math.round(((((st.x + ox) % F.SW) + F.SW) % F.SW) - 80);
    const y = Math.round(((((st.y + oy) % F.SH) + F.SH) % F.SH) - 40);
    if (x < 0 || x >= W || y < 0 || y >= H || st.th >= sp) continue;
    plot(x, y, st.c);
    if (st.cross) {
      plot(x - 1, y, C.slate);
      plot(x + 1, y, C.slate);
      plot(x, y - 1, C.slate);
      plot(x, y + 1, C.slate);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// The disc

/**
 * The globe's pixels for this camera: the emblem's look (world.js LUT: land, graticule, equator x
 * five light levels, a lit or dark 1 px rim). `nightRim` replaces the dark rim's slate (a night
 * planet against space has no grey outline).
 */
export function disc(cam, nightRim = null) {
  const R = cam.R;
  const RR = R + 0.5;
  const RR2 = RR * RR;
  const rim = RR - 1.1;
  const T = planetTexture(R < 100 ? 0 : R < 200 ? 1 : 2);
  const tex = T.d;
  const TW = T.w;
  const TH = T.h;
  const lut = GLOBE_STYLES.world.lut;
  const darkRim = nightRim == null ? null : u32(nightRim);
  const sh = (((cam.lam / 360) * TW) % TW) + TW * 16;
  const { cx, cy, ax, ay, ct: CT, st: ST } = cam;
  const [L0, L1, L2] = cam.light;
  const grid = (cam.grid ?? 1) * 16; // graticule texels shown where the Bayer threshold is under it
  const equ = (cam.equator ?? 1) * 16; // the equator in the dark (light level 0)
  const y0 = Math.max(0, Math.ceil(cy - RR));
  const y1 = Math.min(H - 1, Math.floor(cy + RR));
  for (let y = y0; y <= y1; y++) {
    const dy = y - cy;
    const dy2 = dy * dy;
    if (dy2 > RR2) continue;
    const span = Math.sqrt(RR2 - dy2);
    const xa = Math.max(0, Math.ceil(cx - span));
    const xb = Math.min(W - 1, Math.floor(cx + span));
    const ny = -dy / RR;
    const by = ((y - ay) & 3) << 2;
    for (let x = xa; x <= xb; x++) {
      const dx = x - cx;
      const d2 = dx * dx + dy2;
      if (d2 > RR2) continue;
      const bth = BAYER4[by | ((x - ax) & 3)];
      const nx = dx / RR;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const gy = ny * CT + nz * ST;
      const gz = -ny * ST + nz * CT;
      const la = Math.asin(gy < -1 ? -1 : gy > 1 ? 1 : gy) / DEG;
      const lo = Math.atan2(nx, gz) / DEG;
      let row = Math.floor(((90 - la) / 180) * TH);
      row = row < 0 ? 0 : row > TH - 1 ? TH - 1 : row;
      const col = ((Math.fround(((lo + 180) / 360) * TW) + sh) | 0) & (TW - 1);
      const dif = nx * L0 + ny * L1 + nz * L2;
      let k;
      if (Math.sqrt(d2) > rim) k = dif > 0.05 ? 5 : 6;
      else {
        let v = (dif + 0.1) * 3.3;
        v = v < 0 ? 0 : v > 3.999 ? 3.999 : v;
        const f = Math.floor(v);
        k = Math.min(4, f + (v - f > (bth + 0.5) / 16 ? 1 : 0));
      }
      let tv = tex[row * TW + col];
      if (tv & 2 && grid < 16 && bth >= grid) tv &= 5;
      if (tv & 4 && k === 0 && equ < 16 && bth >= equ) tv &= 3;
      D[y * W + x] = k === 6 && darkRim !== null ? darkRim : lut[(tv << 3) | k];
    }
  }
}

// ---------------------------------------------------------------------------------------------
// The atmosphere: a glow outside the limb, brightest where the limb faces the sun and stronger all
// round when the sun is behind the planet (the dawn ring seen from orbit). Navy, blue, cyan steps
// dithered into space, 6 px deep.

const ATMO = [0, C.navy, C.blue, C.cyan];
export function atmosphere(cam) {
  const a = cam.atmo ?? 0;
  if (a <= 0) return;
  const { cx, cy, ax, ay, R } = cam;
  const RR = R + 0.5;
  const AW = 6;
  const RO = RR + AW;
  const [L0, L1, L2] = cam.light;
  const back = 1 + 0.7 * Math.max(0, -L2);
  const y0 = Math.max(0, Math.ceil(cy - RO));
  const y1 = Math.min(H - 1, Math.floor(cy + RO));
  for (let y = y0; y <= y1; y++) {
    const dy = y - cy;
    const dy2 = dy * dy;
    if (dy2 > RO * RO) continue;
    const outer = Math.sqrt(RO * RO - dy2);
    const inner = dy2 < RR * RR ? Math.sqrt(RR * RR - dy2) : 0;
    // the two runs of the ring on this row: left of the disc and right of it
    for (let side = 0; side < 2; side++) {
      const xa = Math.max(0, Math.ceil(side ? cx + inner : cx - outer));
      const xb = Math.min(W - 1, Math.floor(side ? cx + outer : cx - inner));
      for (let x = xa; x <= xb; x++) {
        const dx = x - cx;
        const r = Math.sqrt(dx * dx + dy2);
        const t = r - RR;
        if (t <= 0 || t > AW) continue;
        const face = (dx / r) * L0 + (-dy / r) * L1;
        const g = a * back * (0.16 + 0.84 * Math.max(0, face) ** 1.5) * Math.exp(-(t - 0.5) / 1.5);
        // dithered on the screen's fixed phase (as the disc): each pixel lights once as the limb nears
        const i = Math.floor(g * 3.2 + bayer(x - ax, y - ay) - 0.5);
        if (i > 0) D[y * W + x] = ATMO[i > 3 ? 3 : i];
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// City lights on the night side: the world map's clusters (cream cores, yellow and orange round
// them), plus a dim scatter of town lights round each city (brown and rust, on land only) that only
// a close camera resolves. Each light has a rank for `lights` and its distance from London for
// `wake`.

let LIGHTS = null;
function lightTable() {
  if (LIGHTS) return LIGHTS;
  const L = cityLights();
  if (!L) return null;
  const land = planetTexture(2);
  const onLand = (la, lo) => {
    const j = clamp(Math.floor(((90 - la) / 180) * land.h), 0, land.h - 1);
    const i = ((Math.floor(((lo + 180) / 360) * land.w) % land.w) + land.w) % land.w;
    return (land.d[j * land.w + i] & 1) === 1;
  };
  const lat = [];
  const lon = [];
  const kind = [];
  for (let q = 0; q < L.n; q++) {
    lat.push(L.lat[q]);
    lon.push(L.lon[q]);
    kind.push(L.kind[q]);
  }
  // town lights: the map's clusters start with their core (kind 3) and hold 3 + 2 x size^2 lights
  let s = 4219;
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
  for (let q = 0; q < L.n; q++) {
    if (L.kind[q] !== 3) continue;
    let n = 1;
    while (q + n < L.n && L.kind[q + n] !== 3) n++;
    const size = Math.sqrt(Math.max(1, (n - 3) / 2));
    const spread = 0.5 + 0.45 * size;
    const m = Math.round(5 + 7 * size * size);
    for (let k = 0; k < m; k++) {
      const a = rnd() * Math.PI * 2;
      const r = spread * Math.sqrt(-Math.log(1 - rnd() * 0.98));
      const la = L.lat[q] + Math.sin(a) * r;
      const lo = L.lon[q] + (Math.cos(a) * r) / Math.max(0.35, Math.cos(L.lat[q] * DEG));
      if (!onLand(la, lo)) continue;
      lat.push(la);
      lon.push(lo);
      kind.push(rnd() < 0.3 ? 5 : 4);
    }
  }
  const n = lat.length;
  const v = new Float32Array(n * 3);
  const rank = new Float32Array(n);
  const near = new Float32Array(n);
  const fade = new Float32Array(n); // each light's own threshold for dissolves (no screen dither: no flicker as it moves)
  const ldn = evec(...LONDON);
  for (let q = 0; q < n; q++) {
    const e = evec(lat[q], lon[q]);
    v[3 * q] = e[0];
    v[3 * q + 1] = e[1];
    v[3 * q + 2] = e[2];
    rank[q] = kind[q] === 3 ? rnd() * 0.3 : rnd();
    near[q] = e[0] * ldn[0] + e[1] * ldn[1] + e[2] * ldn[2];
    fade[q] = rnd();
  }
  LIGHTS = { n, v, rank, near, fade, kind: Uint8Array.from(kind) };
  return LIGHTS;
}

// kinds 0-3 from the map (3 = a city's core), 4-5 the town scatter
const LCOL = [C.yellow, C.orange, C.yellow, C.cream, C.brown, C.rust];
export function cityLightsOn(cam) {
  const amt = cam.lights ?? 0;
  if (amt <= 0) return;
  const T = lightTable();
  if (!T) return;
  const wake = Math.cos(clamp(cam.wake ?? 180, 0, 180) * DEG);
  const [L0, L1, L2] = cam.light;
  // the town scatter resolves only close up; big cities glow a pixel round their core
  const towns = clamp((cam.R - 110) / 90, 0, 1);
  const big = cam.R > 220;
  const { cl, sl, ct, st, rr, cx, cy } = cam;
  // two passes: the dim scatter under the cities
  for (let pass = 0; pass < 2; pass++) {
    for (let q = 0; q < T.n; q++) {
      const kd = T.kind[q];
      if ((kd >= 4) !== (pass === 0)) continue;
      if (T.rank[q] >= amt || T.near[q] < wake) continue;
      const ex = T.v[3 * q];
      const ey = T.v[3 * q + 1];
      const ez = T.v[3 * q + 2];
      const x = ex * cl - ez * sl;
      const z = ex * sl + ez * cl;
      const vy = ey * ct - z * st;
      const vz = ey * st + z * ct;
      if (vz < 0.06) continue;
      const px = Math.round(cx + x * rr);
      const py = Math.round(cy - vy * rr);
      if (px < 0 || px >= W || py < 0 || py >= H) continue;
      const th = T.fade[q];
      if (kd >= 4 && th >= towns) continue;
      const night = (-(x * L0 + vy * L1 + vz * L2) - 0.02) / 0.1;
      if (night <= th) continue;
      if (big && kd === 3) {
        // a close-up city core: a cream pixel in an orange glow (two sides lit, from its rank)
        const r = (T.rank[q] * 13) | 0;
        plot(px + (r & 1 ? 1 : -1), py, C.orange);
        plot(px, py + (r & 2 ? 1 : -1), C.orange);
        if (r & 4) plot(px + (r & 1 ? -1 : 1), py, C.rust);
      }
      D[py * W + px] = LCOL[kd];
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Marks on the surface

const TMP = [0, 0, 0, 0];
const E1 = [0, 0, 0];
const E2 = [0, 0, 0];

/** A circle on the surface (angular radius ang, deg) round a lat/lon, projected: a ripple. */
export function surfaceRing(cam, lat, lon, ang, color, a = 1) {
  if (a <= 0 || ang <= 0) return;
  const c = evec(lat, lon);
  // a tangent basis at c: east and north
  E1[0] = Math.cos(lon * DEG);
  E1[1] = 0;
  E1[2] = -Math.sin(lon * DEG);
  E2[0] = c[1] * E1[2] - c[2] * E1[1];
  E2[1] = c[2] * E1[0] - c[0] * E1[2];
  E2[2] = c[0] * E1[1] - c[1] * E1[0];
  const ca = Math.cos(ang * DEG);
  const sa = Math.sin(ang * DEG);
  const n = clamp(Math.round(2 * Math.PI * sa * cam.R * 1.6), 12, 900);
  const col = u32(color);
  const v = [0, 0, 0];
  for (let k = 0; k < n; k++) {
    const th = (2 * Math.PI * k) / n;
    const cs = Math.cos(th) * sa;
    const sn = Math.sin(th) * sa;
    v[0] = c[0] * ca + E1[0] * cs + E2[0] * sn;
    v[1] = c[1] * ca + E1[1] * cs + E2[1] * sn;
    v[2] = c[2] * ca + E1[2] * cs + E2[2] * sn;
    if (a < 1 && BAYER4[((k * 16) / n) & 15] >= a * 16) continue; // thinned along the ring, not by screen position
    project(cam, v, TMP);
    if (TMP[2] <= 0.02) continue;
    plot(Math.round(TMP[0]), Math.round(TMP[1]), col);
  }
}

// Routes are sampled once at 8x the emblem's density; a camera shows every `step`-th sample (a power
// of two from its size) and draws every other shown one (dotted). Steps are nested, so a zoom only
// adds or removes the dots between the ones on screen: no dot ever slides along a route.
export const ROUTE_FINE = 8;
const routeStep = (R) => {
  // switch half-way between the octaves (never at the reference size itself, where the camera settles)
  const want = (1.5 * ROUTE_FINE) / Math.max(1, R / ROUTE_REF);
  let s = ROUTE_FINE;
  while (s > 1 && s > want) s >>= 1;
  return s;
};
let ROUTE_REF = 54; // the radius at which a route shows the emblem's own dots
export function setRouteReference(R) {
  ROUTE_REF = R;
}

/**
 * A route drawn in the emblem's style: fine points (earth-frame, routePoints) up to fraction p,
 * dotted at the camera's density, red. A flying route (p < 1) carries a white head with a solid red
 * tail behind it; a landed one ends on a white pixel. `fade` (0..1) dissolves it dot by dot (each dot
 * its own threshold); `dim` draws it in dark red (a secondary route once it has landed).
 */
export function route(cam, pts, p, { fade = 1, dim = false, head = 1 } = {}) {
  if (p <= 0 || fade <= 0) return;
  const last = pts.length - 1;
  const upto = Math.round(last * Math.min(1, p));
  const flying = p < 1;
  const col = dim ? C.darkRed : C.red;
  const step = routeStep(cam.R);
  const dot = 2 * step;
  for (let i = 0; i <= upto; i++) {
    const tail = flying && upto - i < 4 * step;
    if (!(i % dot === 0 || i === upto || (tail && i % step === 0))) continue;
    if (fade < 1 && BAYER4[((i / step) | 0) & 15] >= fade * 16) continue;
    project(cam, pts[i], TMP);
    if (!TMP[3]) continue;
    plot(Math.round(TMP[0]), Math.round(TMP[1]), tail ? C.red : col);
  }
  project(cam, pts[upto], TMP);
  if (!TMP[3]) return;
  const hx = Math.round(TMP[0]);
  const hy = Math.round(TMP[1]);
  if (flying) {
    plot(hx, hy, C.white);
    if (head > 1) {
      plot(hx + 1, hy, C.cream);
      plot(hx, hy + 1, C.cream);
      plot(hx + 1, hy + 1, C.yellow);
    }
  } else if (TMP[2] > 0.08 && fade >= 1) plot(hx, hy, C.white);
}

/** A white plus on a lat/lon (a route landing), dissolved by a. */
export function flash(cam, lat, lon, a = 1) {
  project(cam, evec(lat, lon), TMP);
  if (TMP[2] <= 0.05) return;
  const x = Math.round(TMP[0]);
  const y = Math.round(TMP[1]);
  if (a < 0.5) return;
  plot(x, y, C.white);
  plot(x - 1, y, C.white);
  plot(x + 1, y, C.white);
  plot(x, y - 1, C.white);
  plot(x, y + 1, C.white);
}

/** London's pin: 3x3 red with a white centre (the emblem's marker), outlined in black when big. */
export function londonPin(cam, outline = false) {
  project(cam, evec(...LONDON), TMP);
  if (TMP[2] <= 0.05) return null;
  const lx = Math.round(TMP[0]);
  const ly = Math.round(TMP[1]);
  if (outline) for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (Math.abs(x) === 2 || Math.abs(y) === 2) plot(lx + x, ly + y, C.black);
  for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) plot(lx + x, ly + y, x || y ? C.red : C.white);
  return [lx, ly];
}

// ---------------------------------------------------------------------------------------------
// The sun clearing the limb: a white core in a cream and cyan glow, a long horizontal (anamorphic)
// streak and a short vertical one, in cyan, blue and navy dithered into whatever is under them.
// I = 0..1.

export function flare(sx, sy, I, cam = null) {
  if (I <= 0.02) return;
  sx = Math.round(sx);
  sy = Math.round(sy);
  // over the planet the streaks are a step dimmer: light across the globe, not a line cut into it
  const R2 = cam ? (cam.R + 0.5) * (cam.R + 0.5) : -1;
  const onDisc = (x, y) => R2 > 0 && (x - cam.cx) * (x - cam.cx) + (y - cam.cy) * (y - cam.cy) <= R2;
  // dithered in the sun's own phase: the glow and the streaks travel with it and never shimmer
  const put = (x, y, c, a) => {
    if (a >= 1 || BAYER4[(((y - sy) & 3) << 2) | ((x - sx) & 3)] < a * 16) plot(x, y, c);
  };
  // the glow: a dithered disc round the sun
  const gr = Math.round(4 + 10 * I);
  for (let y = -gr; y <= gr; y++) {
    for (let x = -gr; x <= gr; x++) {
      const r = Math.sqrt(x * x + y * y) / gr;
      if (r > 1) continue;
      const v = (1 - r) * (1 - r) * I * 3.4;
      if (v < 0.3) continue;
      put(sx + x, sy + y, v > 2.4 ? C.cream : v > 1.5 ? C.cyan : v > 0.8 ? C.blue : C.navy, Math.min(1, v * 1.2));
    }
  }
  // the streaks
  const len = Math.round(190 * I);
  for (let k = -len; k <= len; k++) {
    const e = 1 - Math.abs(k) / (len + 1);
    const v = e * e * I * 4 * (Math.abs(k) > 3 && onDisc(sx + k, sy) ? 0.55 : 1);
    if (v < 0.3) continue;
    put(sx + k, sy, v > 2.8 ? C.white : v > 1.7 ? C.cyan : v > 0.9 ? C.blue : C.navy, Math.min(1, v * 1.3));
  }
  const vl = Math.round(30 * I);
  for (let k = -vl; k <= vl; k++) {
    const e = 1 - Math.abs(k) / (vl + 1);
    const v = e * e * I * 3.2 * (Math.abs(k) > 3 && onDisc(sx, sy + k) ? 0.55 : 1);
    if (v < 0.3) continue;
    put(sx, sy + k, v > 2.4 ? C.white : v > 1.6 ? C.cyan : v > 0.8 ? C.blue : C.navy, Math.min(1, v * 1.3));
  }
  // the core: a white diamond
  const cr = Math.round(1 + 2 * I);
  for (let y = -cr; y <= cr; y++) for (let x = -cr; x <= cr; x++) if (Math.abs(x) + Math.abs(y) <= cr) plot(sx + x, sy + y, C.white);
}

/** Background jobs: the finer textures and the light table, one slice each. */
export function planetWarmJobs() {
  return [() => planetTexture(1), () => planetTexture(2), () => lightTable()];
}
