// WORLD NOW's title sequence (owner, 9 Oct: "real newscasts have a far more crafted intro, several
// seconds long, with great effects"). About ten seconds on one beat grid (worldcues.js), one
// continuous camera move from orbit to the lock-up, and the network's lock-up as its last act, so
// the cut keeps the same pixels as every other open.
//
//   NIGHT    0-4 beats   Europe at night under a slanted horizon, the dawn ring on the limb;
//                        London's pin pips once a beat and the lights come on outwards from it
//   NETWORK  4-9         routes leave London and land one a beat (New York, New Delhi, Nairobi),
//                        each named with its local time; the network blooms across the planet
//   SUNRISE  9-12        the camera pulls back to the whole planet, the sun clears the limb (a
//                        flare), day sweeps over Europe and Africa, space gives way to the field,
//                        and a silver ring closes on the globe (the network open's iris)
//   TITLE    12.4-15     the package's reveal (kit.js): the globe glides to its slot, the plate,
//                        the title (one glint across its chrome), tagline, credits, the bit
//   still    15-16.3     the lock-up holds for the cut
//
// A pure function of dt, drawn in whole pixels with palette colours.
import { P } from '../../palette.js';
import { drawText, measureText } from '../../font.js';
import { clamp, lerp, seg, easeOut, easeInOut, easeOutQuint, smoothstep, ring, clockIn } from '../../gfx/index.js';
import { playOpen, TL, CENTRE, ZOOM, W } from './kit.js';
import { WORLD, R0, LIGHT, TILT_DEG, LAM_END, LONDON, ROUTES, ROUTE_H, arcPoints, drawWorldGlobe } from './world.js';
import * as planet from './planet.js';
import { WN_BEAT, WN_CUES, WN_HIT, WN_DURATION } from './worldcues.js';

export { WN_DURATION, WN_HIT };

/** Seconds the reveal is shifted on the package's clock: kit TL.still lands on the hit. */
const SHIFT = WN_HIT - TL.still;
/** The package's reveal starts (the globe leaves centre stage). */
export const WN_REVEAL = SHIFT + TL.glide;

// ---------------------------------------------------------------------------------------------
// Tracks: keyframes in beats, monotone cubic between them (no overshoot, no stop at a key).

function track(keys) {
  const n = keys.length;
  const b = keys.map((k) => k[0]);
  const v = keys.map((k) => k[1]);
  const m = new Array(n).fill(0);
  const d = [];
  for (let i = 0; i < n - 1; i++) d.push((v[i + 1] - v[i]) / (b[i + 1] - b[i]));
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i]);
  return (x) => {
    if (x <= b[0]) return v[0];
    if (x >= b[n - 1]) return v[n - 1];
    let i = 0;
    while (x > b[i + 1]) i++;
    const h = b[i + 1] - b[i];
    const t = (x - b[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * v[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * v[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

const RL = R0 * ZOOM; // the globe's size at centre stage (where the package takes over)
// the camera: disc centre, radius (in log space: a zoom reads evenly), the latitude and longitude
// facing it. From Europe at night (the disc's centre far below the frame) out to centre stage.
const CAM_X = track([[0, 144], [3.5, 157], [5, 206], [7, 200], [9, 193], [12.2, CENTRE.x]]);
const CAM_Y = track([[0, 452], [3.5, 423], [5, 318], [7, 172], [9, 126], [12.2, CENTRE.y]]);
const CAM_R = track([[0, Math.log(396)], [3.5, Math.log(344)], [5, Math.log(236)], [7, Math.log(128)], [9, Math.log(82)], [12.2, Math.log(RL)]]);
const CAM_T = track([[0, 0], [3.5, 3], [5, 8], [7, 16], [9, 21], [12.2, TILT_DEG]]);
// the turn runs on through the reveal and settles on the emblem's longitude
const CAM_L = track([[0, -3], [3.5, -8], [5, -14], [7, -11], [9, -14], [11.5, -15], [13.9, LAM_END]]);
// the sun: behind the planet (upper left: the dawn ring) until the network blooms, on the limb
// at the sunrise cue, then the emblem's own light
const SUN = [
  track([[0, -0.3], [8, -0.3], [WN_CUES.sunrise, -0.62], [11.5, LIGHT[0]]]),
  track([[0, 0.3], [8, 0.3], [WN_CUES.sunrise, 0.78], [11.5, LIGHT[1]]]),
  track([[0, -0.9], [8, -0.9], [WN_CUES.sunrise, 0], [11.5, LIGHT[2]]]),
];

// the lights come on outwards from London: across Europe in the first bars, the world by the bloom
const WAKE = track([[0, 2], [1, 7], [2, 15], [3, 27], [4, 42], [6, 100], [8, 180]]);

/** The centre longitude at dt (seconds): the reveal's globe keeps turning on the same track. */
export const lamAt = (dt) => CAM_L(dt / WN_BEAT);

const newCam = () => ({ cx: 0, cy: 0, R: 0, tilt: 0, lam: 0, light: [0, 0, 1], atmo: 0, lights: 0, wake: 0, space: 1, grid: 1, equator: 1 });
const CAM0 = newCam();
function camera(b, CAM = CAM0) {
  CAM.cx = CAM_X(b);
  CAM.cy = CAM_Y(b);
  CAM.R = Math.exp(CAM_R(b));
  CAM.tilt = CAM_T(b);
  CAM.lam = CAM_L(b);
  if (b >= 11.5) {
    CAM.light[0] = LIGHT[0];
    CAM.light[1] = LIGHT[1];
    CAM.light[2] = LIGHT[2];
  } else {
    const x = SUN[0](b);
    const y = SUN[1](b);
    const z = SUN[2](b);
    const n = Math.hypot(x, y, z) || 1;
    CAM.light[0] = x / n;
    CAM.light[1] = y / n;
    CAM.light[2] = z / n;
  }
  CAM.atmo = 1 - smoothstep(9.5, 11.5, b);
  CAM.lights = 1 - smoothstep(10, 11.25, b);
  CAM.wake = WAKE(b);
  CAM.space = 1 - smoothstep(9.75, 11.25, b);
  CAM.grid = 1 - smoothstep(130, 230, CAM.R); // the graticule reads at mid range, never on the close-up
  CAM.equator = smoothstep(9.5, 11, b); // the red equator comes with the day (at night it would read as a route)
  return planet.aim(CAM);
}

// ---------------------------------------------------------------------------------------------
// The network

const CITY = {
  london: LONDON,
  newYork: ROUTES[0],
  nairobi: ROUTES[1],
  newDelhi: ROUTES[2],
  saoPaulo: [-23.5, -46.6],
  mexicoCity: [19.4, -99.1],
  beijing: [39.9, 116.4],
  singapore: [1.35, 103.8],
  johannesburg: [-26.2, 28.0],
  lagos: [6.5, 3.4],
  cairo: [30.0, 31.2],
  tokyo: [35.7, 139.7],
  sydney: [-33.9, 151.2],
};
const [L1, L2, L3] = WN_CUES.land;
const FLIGHT = 0.9; // beats in the air: launched just after the beat before, landing on the beat
// brand routes: the emblem's three (same arcs, the same height), one a beat
const BRAND = [
  { to: CITY.newYork, land: L1 },
  { to: CITY.newDelhi, land: L2 },
  { to: CITY.nairobi, land: L3 },
];
// the bloom: the second wave lands together, the third a beat later (dark red once landed)
const WAVE = [
  [CITY.newYork, CITY.saoPaulo, WN_CUES.bloom],
  [CITY.newYork, CITY.mexicoCity, WN_CUES.bloom],
  [CITY.newDelhi, CITY.beijing, WN_CUES.bloom],
  [CITY.newDelhi, CITY.singapore, WN_CUES.bloom],
  [CITY.nairobi, CITY.johannesburg, WN_CUES.bloom],
  [CITY.london, CITY.lagos, WN_CUES.bloom],
  [CITY.saoPaulo, CITY.lagos, WN_CUES.bloom + 1],
  [CITY.lagos, CITY.cairo, WN_CUES.bloom + 1],
  [CITY.beijing, CITY.tokyo, WN_CUES.bloom + 1],
  [CITY.singapore, CITY.sydney, WN_CUES.bloom + 1],
].map(([from, to, land]) => ({ from, to, land }));

// arcs are sampled for the size they are drawn at (dots ~2 px apart at any size; the emblem's own
// density at centre stage and below)
const ARCS = new Map();
function arcFor(from, to, h, R) {
  const dense = Math.max(1, Math.min(8, Math.round((R / RL) * 2) / 2));
  const key = `${from}|${to}|${h}|${dense}`;
  let a = ARCS.get(key);
  if (!a) ARCS.set(key, (a = arcPoints(from, to, h, dense)));
  return a;
}
const heightOf = (from, to) => {
  const d = Math.acos(clamp(Math.sin(from[0] * DEG) * Math.sin(to[0] * DEG) + Math.cos(from[0] * DEG) * Math.cos(to[0] * DEG) * Math.cos((to[1] - from[1]) * DEG), -1, 1));
  return 0.06 + 0.12 * (d / Math.PI);
};
const DEG = Math.PI / 180;
const flightAt = (b, land) => easeInOut(seg(b, land - FLIGHT, FLIGHT));

function network(cam, b) {
  const head = cam.R > 150 ? 2 : 1;
  const fadeOut = 1 - smoothstep(10, 11.4, b);
  for (const w of WAVE) {
    const p = flightAt(b, w.land);
    if (p <= 0 || fadeOut <= 0) continue;
    planet.route(cam, arcFor(w.from, w.to, heightOf(w.from, w.to), cam.R), p, { dim: p >= 1, fade: fadeOut, head });
  }
  for (const r of BRAND) {
    const p = flightAt(b, r.land);
    if (p > 0) planet.route(cam, arcFor(LONDON, r.to, ROUTE_H, cam.R), p, { head });
  }
  // landings: a ripple on the surface
  for (const r of BRAND) landing(cam, b, r.to, r.land, 1);
  for (const w of WAVE) landing(cam, b, w.to, w.land, 0.7 * fadeOut);
}
function landing(cam, b, at, land, a) {
  const p = seg(b, land, 0.9);
  if (p <= 0 || p >= 1 || a <= 0) return;
  // a white flash on the city for two frames, then a red ripple
  if (p < 0.09) planet.flash(cam, at[0], at[1], a);
  planet.surfaceRing(cam, at[0], at[1], 0.9 + 3 * easeOut(p), P.red, a * (1 - p));
}

function pings(cam, b) {
  for (const at of WN_CUES.pings) {
    const p = seg(b, at, 0.85);
    if (p <= 0 || p >= 1) continue;
    planet.surfaceRing(cam, LONDON[0], LONDON[1], 1 + 5.5 * easeOut(p), P.red, 1 - p);
  }
}

// ---------------------------------------------------------------------------------------------
// Place names: the city on a black plate with the channel's 1 px red rule under it and the local
// time in micro, beside its pin on the side with room, wiped out in reading order and taken back the
// same way. Two at most on screen.

export const WN_PLACES = [
  { name: 'LONDON', tz: 'Europe/London', at: LONDON, from: 0.5, to: 3.6 },
  { name: 'NEW YORK', tz: 'America/New_York', at: CITY.newYork, from: L1, to: L1 + 1.85 },
  { name: 'NEW DELHI', tz: 'Asia/Kolkata', at: CITY.newDelhi, from: L2, to: L2 + 1.85 },
  { name: 'NAIROBI', tz: 'Africa/Nairobi', at: CITY.nairobi, from: L3, to: L3 + 1.85 },
];
const PT = [0, 0, 0, 0];
const PIN = [0, 0, 0];
const LDN = [0, 0, 0, 0];
const BOX = { x: 0, y: 0, side: 1 };
function londonXY(cam) {
  PIN[0] = Math.cos(LONDON[0] * DEG) * Math.sin(LONDON[1] * DEG);
  PIN[1] = Math.sin(LONDON[0] * DEG);
  PIN[2] = Math.cos(LONDON[0] * DEG) * Math.cos(LONDON[1] * DEG);
  return planet.project(cam, PIN, LDN);
}
/**
 * Where a place's plate goes: right of its pin, else centred above it, else left of it; the first
 * that stays in the frame (x 12..W-12, y 30..180) and clear of London's pin (a name beside another
 * pin reads as that pin's). side: 1 right, 0 above, -1 left.
 */
// a plate keeps the side it opened on (it follows its pin, never jumps sides): the side is chosen on
// the camera of the moment it is fully out, so every frame stays a pure function of dt
const SIDE_CAM = newCam();
const PT2 = [0, 0, 0, 0];
function sideOf(pl, bw, bh) {
  if (pl.side !== undefined && pl.sideW === bw) return pl.side;
  const cam = camera(pl.from + 0.35, SIDE_CAM);
  PIN[0] = Math.cos(pl.at[0] * DEG) * Math.sin(pl.at[1] * DEG);
  PIN[1] = Math.sin(pl.at[0] * DEG);
  PIN[2] = Math.cos(pl.at[0] * DEG) * Math.cos(pl.at[1] * DEG);
  planet.project(cam, PIN, PT2);
  pl.side = placeBox(Math.round(PT2[0]), Math.round(PT2[1]), bw, bh, pl.at === LONDON ? null : londonXY(cam)).side;
  pl.sideW = bw;
  return pl.side;
}
function placeAt(px, py, bw, bh, side) {
  BOX.side = side;
  BOX.x = clamp(side > 0 ? px + 7 : side < 0 ? px - 7 - bw : Math.round(px - bw / 2), 12, W - 12 - bw);
  BOX.y = clamp(side === 0 ? py - 26 : py - 16, 30, 180 - bh);
  return BOX;
}
function placeBox(px, py, bw, bh, ldn) {
  const clear = (x, y) => !ldn || ldn[2] < 0.05 || ldn[0] < x - 10 || ldn[0] > x + bw + 10 || ldn[1] < y - 10 || ldn[1] > y + bh + 10;
  const fits = (x, y) => x >= 12 && x + bw <= W - 12 && y >= 30 && y + bh <= 180;
  const cand = [
    [px + 7, py - 16, 1],
    [clamp(Math.round(px - bw / 2), 12, W - 12 - bw), py - 26, 0],
    [px - 7 - bw, py - 16, -1],
  ];
  for (const [x, y, side] of cand) {
    if (fits(x, y) && clear(x, y)) {
      BOX.x = x;
      BOX.y = y;
      BOX.side = side;
      return BOX;
    }
  }
  const [x, y, side] = cand[0];
  BOX.x = clamp(x, 12, W - 12 - bw);
  BOX.y = clamp(y, 30, 180 - bh);
  BOX.side = side;
  return BOX;
}
function placeNames(ctx, cam, b) {
  for (const pl of WN_PLACES) {
    const pin = seg(b, pl.from, 0.35);
    const out = seg(b, pl.to - 0.3, 0.3);
    if (pin <= 0 || out >= 1) continue;
    PIN[0] = Math.cos(pl.at[0] * DEG) * Math.sin(pl.at[1] * DEG);
    PIN[1] = Math.sin(pl.at[0] * DEG);
    PIN[2] = Math.cos(pl.at[0] * DEG) * Math.cos(pl.at[1] * DEG);
    planet.project(cam, PIN, PT);
    if (PT[2] < 0.05) continue;
    const time = clockIn(pl.tz).time;
    const nameW = measureText(pl.name);
    const timeW = measureText(time, 1, 'micro');
    const bw = nameW + 4 + timeW + 6;
    const bh = 12;
    const px = Math.round(PT[0]);
    const py = Math.round(PT[1]);
    const box = placeAt(px, py, bw, bh, sideOf(pl, bw, bh));
    const bx = box.x;
    const by = box.y;
    // the plate wipes out in reading order (from its left edge) and is taken back the same way
    const vis = Math.round(bw * easeOutQuint(pin) * (1 - easeInOut(out)));
    if (vis <= 0) continue;
    const x0 = bx;
    // leader: from the pin's corner to the plate's nearest lower corner (straight up when above)
    ctx.fillStyle = P.fog;
    const lx = box.side > 0 ? px + 2 : box.side < 0 ? px - 2 : px;
    const ly0 = py - 2;
    const tx = box.side > 0 ? bx : box.side < 0 ? bx + bw - 1 : px;
    const ly1 = by + bh;
    for (let y = ly0; y > ly1; y--) {
      const k = (ly0 - y) / Math.max(1, ly0 - ly1);
      ctx.fillRect(Math.round(lerp(lx, tx, k)), y, 1, 1);
    }
    ctx.fillStyle = P.black;
    ctx.fillRect(x0, by, vis, bh);
    ctx.fillStyle = P.red;
    ctx.fillRect(x0, by + bh, vis, 1);
    ctx.save();
    try {
      ctx.beginPath();
      ctx.rect(x0, by, vis, bh);
      ctx.clip();
      const w = drawText(ctx, pl.name, bx + 3, by + 3, { color: P.white });
      drawText(ctx, time, bx + 3 + w + 4, by + 5, { color: P.silver, font: 'micro' });
    } finally {
      ctx.restore();
    }
  }
}

// ---------------------------------------------------------------------------------------------
// The sun on the limb

function sunrise(cam, b) {
  if (b < 8.5 || b > 11.5) return;
  const L = cam.light;
  const I = Math.exp(-((L[2] / 0.24) ** 2)) * (1 - smoothstep(10.6, 11.3, b));
  const n = Math.hypot(L[0], L[1]) || 1;
  planet.flare(cam.cx + (L[0] / n) * (cam.R + 1), cam.cy - (L[1] / n) * (cam.R + 1), I, cam);
}

// ---------------------------------------------------------------------------------------------
// The sequence

/** The silver ring that closes on the globe as the camera settles (the network open's iris). */
function iris(ctx, b, cam) {
  const p = seg(b, WN_CUES.lock, 1);
  if (p <= 0 || p >= 1) return;
  const r = Math.round(lerp(cam.R + 40, cam.R + 1, easeOutQuint(p)));
  ring(ctx, cam.cx, cam.cy, r, r > cam.R + 3 ? P.silver : P.steel, p < 0.15 ? p / 0.15 : 1);
}

function before(ctx, dt) {
  const b = dt / WN_BEAT;
  const cam = camera(b);
  if (cam.space < 1) ctx.drawImage(WORLD.background(), 0, 0);
  planet.begin(cam);
  planet.disc(cam, cam.atmo > 0.5 ? P.ink : null);
  planet.atmosphere(cam);
  planet.cityLightsOn(cam);
  pings(cam, b);
  network(cam, b);
  planet.londonPin(cam, smoothstep(110, 160, cam.R));
  sunrise(cam, b);
  planet.end(ctx);
  placeNames(ctx, cam, b);
  iris(ctx, b, cam);
}

// the reveal: the package's own act 2 on the shifted clock, with the settled globe still turning on
// the camera's track, and one glint across the title's chrome before the still
const REVEAL = {
  ...WORLD,
  emblem(ctx, dtS, x, y, k) {
    drawWorldGlobe(ctx, x, y, Math.round(R0 * k), lamAt(dtS + SHIFT));
  },
  after: glint,
};

const GLINT_AT = TL.title + 0.36;
const GLINT_DUR = 0.36;
let GL = null;
/** A diagonal band of white (6 px) crossing the title's silver half, left to right. */
function glint(ctx, dtS, L) {
  const p = seg(dtS, GLINT_AT, GLINT_DUR);
  if (p <= 0 || p >= 1 || !L?.titles?.length) return;
  const T = L.titles[0];
  if (!GL || GL.src !== T.cv) GL = { src: T.cv, px: titlePixels(T) };
  if (!GL.px) return;
  const span = T.w + 20;
  const bx = Math.round(lerp(-14, span - 6, easeInOut(p)));
  const y0 = L.plateY + 2;
  ctx.fillStyle = P.white;
  const px = GL.px;
  for (let i = 0; i < px.length; i += 2) {
    const x = px[i];
    const y = px[i + 1];
    const d = x + (y >> 1) - bx;
    if (d >= 0 && d < 6) ctx.fillRect(L.titleX + x, y0 + y, 1, 1);
  }
}
/** The title's silver pixels (x, y pairs in its canvas), or null where pixels cannot be read. */
function titlePixels(T) {
  try {
    const c = T.cv.getContext('2d');
    const img = c.getImageData(0, 0, T.cv.width, T.cv.height);
    const out = [];
    const sil = [0xc0, 0xcb, 0xdc];
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const i = (y * img.width + x) * 4;
        if (img.data[i + 3] > 0 && img.data[i] === sil[0] && img.data[i + 1] === sil[1] && img.data[i + 2] === sil[2]) out.push(x, y);
      }
    }
    return out.length ? Int16Array.from(out) : null;
  } catch {
    return null;
  }
}

/** WORLD NOW's title sequence at dt seconds (full frame). */
export function drawWorldNowTitles(ctx, dt, info) {
  if (dt < WN_REVEAL) before(ctx, dt);
  else playOpen(ctx, Math.min(dt, WN_DURATION + 60) - SHIFT, info, REVEAL);
}

export const WORLD_TITLES = { ...REVEAL, warmJobs: () => [...WORLD.warmJobs(), ...planet.planetWarmJobs()] };
