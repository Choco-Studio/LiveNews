// WORLD WEATHER's title sequence (owner, 9 Oct: the other programmes' opens "as crafted" as WORLD
// NOW's). Nine seconds on the programme's grid (cues.js, 92 BPM): up through the weather.
//
//   THE STORM   beats 0-4    inside a storm, rising: banks of cumulus slide down past the camera in
//                            three depths, rain slants through them, lightning lights them from
//                            within (a strike, then a distant sheet)
//   THE CLIMB   4-7          the rain stops; the banks pale as the camera climbs into the cloud deck,
//                            light coming down through it
//   ABOVE       7-11.5       the sky clears and the sun comes up over the heads of the sea of cloud;
//                            the sea falls away, the sky deepens to the night above the
//                            weather, the sun's rays come out, and one cloud rises from the sea and
//                            settles in front of it: the emblem
//   TITLE       11.5-14      the package's reveal; still for the last 0.8 s
//
// The sun and the last cloud are the emblem's own (weather.js: drawn pixel by pixel at any centre
// and size); from the breakout on they stand where the emblem has them, so the hand-over never
// pops. Through the cloud the banks move at most 3 px a frame, each pixel sampling them at its own
// fixed instant in the frame and their thin bands twice as deep as they move; the rain steps 15
// times a second: no edge or streak lights a pixel for a single frame.
import { P } from '../../palette.js';
import { u32, clamp, lerp, seg, smoothstep, easeInOut } from '../../gfx/index.js';
import { W, H, CENTRE, ZOOM, TL, drawHopBit } from './kit.js';
import { WEATHER_OPEN, drawSun, drawCloud } from './weather.js';
import { track, sequence, Layer, ditherAt } from './seq.js';
import { CUES, hitOf } from './cues.js';

const ID = 'world-weather';
const Q = CUES[ID];
const BEAT = 60 / Q.bpm;
const HIT = hitOf(ID);
const SHIFT = HIT - TL.still;
const C = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, u32(v)]));

// the emblem at centre stage: the sun's centre and the cloud's anchor (weather.js emblem at k = ZOOM)
const SUN = { x: CENTRE.x - 6 * ZOOM, y: CENTRE.y - 5 * ZOOM };
const WISP = { x: Math.round(CENTRE.x - 7 * ZOOM), y: Math.round(CENTRE.y + 12 * ZOOM) };

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------------
// Cloud: banks of cumulus seen side on (rounded heads on a flat base, lit from above), in three
// depths that slide down past the rising camera at their own rates; the last of them, the top of
// the cloud layer, are the sea of cloud the camera breaks out over

// the cloud's ramp, black to white, through the screen's matrix with short dithered edges
const CR = [C.black, C.ink, C.slate, C.steel, C.fog, C.silver, C.white];
function cq(v, x, y) {
  if (v <= 0) return CR[0];
  if (v >= 6) return CR[6];
  const k = v | 0;
  const t = (v - k - 0.62) / 0.38;
  return CR[k + (t > 0 && ditherAt(x, y) < t * 16 ? 1 : 0)];
}
// the sky's ramp above the weather, night to day blue
const SR = [C.black, C.ink, C.navy, C.blue];
function sq(v, x, y) {
  if (v <= 0) return SR[0];
  if (v >= 3) return SR[3];
  const k = v | 0;
  const t = (v - k - 0.6) / 0.4;
  return SR[k + (t > 0 && ditherAt(x, y) < t * 16 ? 1 : 0)];
}

// The camera's height (px of the middle depth): the storm, a faster climb, the breakout, slowing
// (the middle depth at most 3 px a frame in the cloud, and a bank's bands twice as deep as it moves:
// they stay two frames on every pixel they cross; a little faster as the sea falls away)
const RISE = track([[-2, -80], [0, 0], [Q.climb, 165], [5.5, 245], [Q.breakout, 320], [Q.breakout + 2, 455], [10.6, 592], [12.5, 620]]);
const DEPTHS = [
  { k: 0.5, gap: 70, size: 0.55, haze: 0.55 }, // far: small, slow, hazy
  { k: 1, gap: 110, size: 1, haze: 0.25 },
  { k: 1.5, gap: 170, size: 1.6, haze: 0 }, // near: big, fast, the most contrast
];
const TOP = 252; // the cloud layer's top (the sea's banks are from here up)
/** 0 in the storm .. 1 at the top of the cloud. */
const PALE = (b) => smoothstep(Q.climb - 0.5, Q.breakout - 0.4, b);

let BANKS = null;
function banks() {
  if (BANKS) return BANKS;
  const r = rng(29);
  const out = [];
  const bank = (di, yw, x0, w, solid = 0, rand = r) => {
    const D = DEPTHS[di];
    const top = new Float32Array(w);
    const bot = new Float32Array(w);
    // heads along the bank, smaller to its ends
    for (let cx = 0; cx < w; ) {
      const env = Math.sin(Math.PI * clamp((cx + 4) / w, 0.05, 0.95));
      const rr = (11 + rand() * 17) * D.size * (0.4 + 0.6 * env);
      for (let x = Math.max(0, Math.floor(cx - rr)); x < Math.min(w, Math.ceil(cx + rr)); x++) {
        const h = Math.sqrt(Math.max(0, rr * rr - (x - cx) ** 2)) - rr * 0.12;
        if (h > top[x]) top[x] = h;
      }
      cx += rr * (0.9 + rand() * 0.5);
    }
    const thick = solid || (8 + rand() * 10) * D.size;
    for (let x = 0; x < w; x++) {
      const e = Math.min(x, w - 1 - x) / (10 * D.size);
      bot[x] = top[x] > 0 ? (solid ? thick : thick * Math.min(1, Math.sqrt(Math.max(0, e)))) : -1; // the sea's base runs on
    }
    out.push({ di, yw, x0: Math.round(x0), w, top, bot, soft: solid ? 90 : 0 });
  };
  for (let di = 0; di < 3; di++) {
    const D = DEPTHS[di];
    for (let yw = -240; yw < TOP; yw += D.gap * (0.7 + 0.6 * r())) {
      const w = Math.round((150 + r() * 250) * D.size);
      bank(di, yw, -w * 0.3 + r() * (W + w * 0.6), w);
    }
    // the sea: wide banks close together at the top of the layer, the frame's width and more (the
    // near depth keeps streaming past in front of it until the breakout)
    if (di === 2) continue;
    for (let yw = TOP; yw < TOP + 70; yw += 12 / D.k + r() * 8) {
      for (let x = -60 - r() * 80; x < W + 60; x += 230 * D.size) bank(di, yw, x, Math.round((260 + r() * 120) * D.size), 150);
    }
  }
  // the climb: more banks under the deck at every depth, passing pale below it as it comes down,
  // so the lower frame never empties (their own seed: the storm's banks stay where they were; the
  // far ones stop short of the sea, so none peeks over it after the breakout)
  const r2 = rng(53);
  for (let di = 0; di < 3; di++) {
    const D = DEPTHS[di];
    for (let yw = 40; yw < (di === 0 ? 200 : TOP - 6); yw += D.gap * (0.35 + 0.3 * r2())) {
      const w = Math.round((120 + r2() * 200) * D.size);
      bank(di, yw, -w * 0.3 + r2() * (W + w * 0.6), w, 0, r2);
    }
  }
  out.sort((p, q) => p.di - q.di || q.yw - p.yw); // far first; within a depth, the higher behind
  BANKS = out;
  return out;
}

/** The murk between the banks (a value on the cloud ramp): ink in the storm, fog near the top. */
const murkAt = (b) => lerp(1.3, 4.1, PALE(b));
// the light on the banks over the climb: [rim, light, body, shadow] on the cloud ramp; dark
// silhouettes with lit heads in the storm, pale in the climb, sunlit above; the far ones toward the murk
function tones(di, b) {
  const pale = PALE(b);
  const above = smoothstep(Q.breakout - 0.6, Q.breakout + 0.4, b); // in the sun
  const m = murkAt(b);
  const haze = DEPTHS[di].haze;
  const tone = (v) => v + (m - v) * haze;
  const rim = lerp(2.75, 5.2, pale) + above * 0.65;
  // each tone held flat on a step of the ramp, changing step quickly (no bank left half-dithered)
  const flat = (v) => Math.floor(v) + smoothstep(0.42, 0.58, v - Math.floor(v)) * 0.99;
  return [flat(tone(rim)), flat(tone(rim - 0.95)), flat(tone(rim - lerp(2.4, 1.8, pale))), flat(tone(rim - lerp(3, 2.55, pale)))];
}

const FRAME = 1 / 30;

function drawBanks(L, b) {
  const d = L.d;
  const R = RISE(b);
  const R0 = RISE(b - FRAME / BEAT);
  const lv = levels(b);
  const lit = lv[0] > 0 || lv[1] > 0;
  const outline = smoothstep(Q.breakout + 1.2, Q.breakout + 2, b); // against the sky, the emblem's ink edge (once the sea slows)
  for (const B of banks()) {
    const D = DEPTHS[B.di];
    const yb = CENTRE.y + (R - B.yw) * D.k;
    if (yb - 40 * D.size > H || yb + 40 * D.size < 0) continue;
    // how far the bank came down over the last frame (the shutter is the frame)
    const mv = Math.max(0, (R - R0) * D.k);
    const span = 1 + mv;
    const [vr, vl, vb, vs] = tones(B.di, b);
    // a band thinner than the motion would light a pixel for one frame: the thin ones widen with it
    const wide = 2 * mv + 0.6;
    const rimW = Math.max(1.5 * D.size + 0.5, 2 * D.size, wide);
    const lightW = rimW + Math.max(4 * D.size, wide);
    const olW = 1;
    const x0 = Math.max(0, B.x0);
    const x1 = Math.min(W, B.x0 + B.w);
    for (let x = x0; x < x1; x++) {
      const i = x - B.x0;
      const t = B.top[i];
      if (t <= 0) continue;
      const yTop = yb - t;
      const hb = B.bot[i] + t; // the bank's height in this column
      // the side of a head away from the light (its top falling to the right) a tone darker
      const slope = (B.top[Math.min(B.w - 1, i + 1)] - B.top[Math.max(0, i - 1)]) * 0.5;
      const away = slope < -0.55 ? 0.6 : 0; // (on the rim only: no dark seams down the heads)
      const sh = B.soft ? hb : Math.max(lightW, hb - Math.max(3 * D.size, wide));
      const fadeAt = B.soft ? hb - B.soft : 1e9; // the sea's base melts into the murk
      const ya = Math.max(0, Math.floor(yTop - olW - 1 - mv));
      const yz = Math.min(H - 1, Math.ceil(yTop + hb + 0.5));
      for (let y = ya; y <= yz; y++) {
        // each pixel looks at the bank at its own fixed instant within the frame (its place in the
        // screen's matrix): it meets the profile's bands in order, each for as long as it passes
        const dd = y - 0.5 - yTop + ((ditherAt(x, y) + 0.5) / 16) * span;
        if (dd < -olW || dd >= hb) continue;
        if (dd < 0) {
          if (outline <= 0 || ditherAt(x, y) >= outline * 16) continue;
          d[y * W + x] = C.ink;
          continue;
        }
        if (dd > fadeAt && ditherAt(x, y) < ((dd - fadeAt) / B.soft) * 16) continue;
        let v = dd < rimW ? vr - away : dd < lightW ? vl : dd < sh ? vb : vs;
        if (lit) v += 2.4 * lightningAt(lv, y * W + x); // backlit from within near the strike
        d[y * W + x] = cq(v, x, y);
      }
    }
  }
}

// the lightning: the strike (lighting the cloud from within, its forked bolt seen) and, later, a
// distant sheet of it high on the right, on their beats
const FLASHES = [
  { at: Q.flash, x: 96, y: 70, k: 1 },
  { at: Q.sheet, x: 300, y: 36, k: 0.5 },
];
// each flash's falloff over the frame, and the sun's (computed once: an exponential a pixel is dear)
const fall = (cx, cy, r) => {
  const t = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) t[y * W + x] = Math.exp(-Math.hypot(x - cx, y - cy) / r);
  return t;
};
let FALLS = null;
const falls = () => (FALLS ??= { flash: FLASHES.map((f) => fall(f.x, f.y, 125)), sunWide: fall(SUN.x, SUN.y, 90), sunNear: fall(SUN.x, SUN.y, 16) });
/** The lightning's light at pixel k (the flashes' levels at this beat, `lv`). */
function lightningAt(lv, k) {
  const F = falls().flash;
  let v = 0;
  for (let i = 0; i < lv.length; i++) if (lv[i] > 0) v += lv[i] * F[i][k];
  return v;
}
const LV = [0, 0];
function levels(b) {
  for (let i = 0; i < FLASHES.length; i++) LV[i] = flashLevel(b - FLASHES[i].at) * FLASHES[i].k;
  return LV;
}
let BOLT = null;
function bolt() {
  if (BOLT) return BOLT;
  const r = rng(7);
  const pts = [];
  let x = 78;
  for (let y = -4; y < 150; y += 4) {
    x += (r() - 0.45) * 7;
    pts.push([Math.round(x), y]);
  }
  const fork = [];
  let fx = pts[16][0];
  for (let y = pts[16][1]; y < pts[16][1] + 46; y += 4) {
    fx += 2 + r() * 3;
    fork.push([Math.round(fx), y]);
  }
  BOLT = { pts, fork };
  return BOLT;
}
/** A flash's light (1 at the strike, gone in a quarter second, stepping down: never back up). */
const flashLevel = (db) => {
  const t = db * BEAT;
  return t < 0 ? 0 : t < 0.07 ? 1 : t < 0.14 ? 0.7 : t < 0.21 ? 0.45 : t < 0.3 ? 0.22 : 0;
};

// ---------------------------------------------------------------------------------------------
// Rain: slanting streaks, stepped 15 times a second

let DROPS = null;
function drops() {
  if (DROPS) return DROPS;
  const r = rng(13);
  DROPS = [];
  for (let i = 0; i < 170; i++) DROPS.push([r() * (W + 120), r() * (H + 60), 0.7 + r() * 0.6, r() < 0.35]);
  return DROPS;
}
const stepped = (b) => Math.floor(b * BEAT * 15 + 1e-6) / 15 / BEAT;

// ---------------------------------------------------------------------------------------------
// The frame

const SKY = new Layer('weather-sky');
const FRONT = new Layer('weather-front');

/** The sky above the weather at beat b (a value on the night-blue ramp), the sun's glow in it. */
function skyValue(b, x, y, glow) {
  const deep = smoothstep(Q.breakout, 10.6, b); // the higher, the darker
  const top = lerp(2.25, 0.85, deep);
  const low = lerp(2.95, 1.2, deep);
  let v = top + (low - top) * clamp(y / H, 0, 1);
  if (glow > 0) v += glow * falls().sunNear[y * W + x];
  return v;
}

/** Behind the banks: the storm's murk, the climb's pale light, then the sky above the weather. */
function background(L, b) {
  const d = L.d;
  const pale = PALE(b);
  const lv = levels(b);
  const lit = lv[0] > 0 || lv[1] > 0;
  const { sunWide } = falls();
  const sky = smoothstep(Q.breakout - 1.1, Q.breakout - 0.2, b);
  const glow = b >= Q.breakout - 1 ? 1 - smoothstep(Q.breakout + 2, 10.6, b) : 0;
  // the sky only over the sea of cloud: under its heads it is still the cloud's own pale murk
  const seaLine = CENTRE.y + (RISE(b) - TOP) - 6;
  for (let y = 0; y < H; y++) {
    const murk = murkAt(b) + lerp(0.2, 0.6, pale) * (1 - y / H);
    // the sky clears from the top down to the sea's heads (a short soft edge, not a dissolve)
    const edge = lerp(-12, seaLine, sky);
    const skyHere = y < seaLine ? clamp((edge - y) / 8 + 0.5, 0, 1) : 0;
    for (let x = 0; x < W; x++) {
      if (skyHere > 0 && ditherAt(x, y) < skyHere * 16) {
        d[y * W + x] = sq(skyValue(b, x, y, glow), x, y);
        continue;
      }
      const k = y * W + x;
      let v = murk;
      if (pale > 0) v += pale * 1.2 * sunWide[k]; // the light coming down through the cloud, brightest under the sun
      if (lit) v += 3 * lightningAt(lv, k);
      d[k] = cq(v, x, y);
    }
  }
}

function rain(L, b) {
  const stop = Q.climb + 0.6;
  if (b > stop) return;
  const d = L.d;
  const bq = stepped(b);
  const t = bq * BEAT;
  const fade = 1 - smoothstep(Q.climb - 0.4, stop, b);
  for (const [x0, y0, sp, near] of drops()) {
    if ((x0 * 7.13) % 1 > fade) continue;
    const fall = t * 420 * sp;
    const y = ((y0 + fall) % (H + 60)) - 30;
    const x = ((x0 - fall * 0.32) % (W + 120) + W + 120) % (W + 120) - 60;
    const len = near ? 9 : 6;
    const c = near ? C.fog : C.steel;
    for (let i = 0; i < len; i++) {
      const px = Math.round(x - i * 0.32);
      const py = Math.round(y - i);
      if (px >= 0 && px < W && py >= 0 && py < H) d[py * W + px] = c;
    }
  }
}

function lightning(L, b) {
  const t = (b - FLASHES[0].at) * BEAT;
  if (t < 0 || t > 0.14) return;
  const d = L.d;
  const { pts, fork } = bolt();
  const c = t < 0.1 ? C.white : C.silver; // the bolt, then its afterimage
  const plot = (path) => {
    for (let i = 0; i + 1 < path.length; i++) {
      const [x0, y0] = path[i];
      const [x1, y1] = path[i + 1];
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let s = 0; s <= n; s++) {
        const x = Math.round(x0 + ((x1 - x0) * s) / n);
        const y = Math.round(y0 + ((y1 - y0) * s) / n);
        if (x >= 0 && x < W && y >= 0 && y < H) d[y * W + x] = c;
      }
    }
  };
  plot(pts);
  plot(fork);
}

/** The sun's rays: out after the breakout; turning as the emblem's turn, on the same clock. */
const raysAt = (b) => easeInOut(seg(b, Q.breakout + 0.5, 1.8));
const turnAt = (dt) => ((dt - SHIFT - 0.45) / 3.2) * (Math.PI / 6);
/** The last cloud: up from the sea to its place in front of the sun. */
const WX = track([[Q.wisp, WISP.x + 70], [Q.wisp + 1.6, WISP.x + 14], [Q.settle, WISP.x], [Q.settle + 2, WISP.x]]);
const WY = track([[Q.wisp, H + 24], [Q.wisp + 1.6, WISP.y + 26], [Q.settle, WISP.y], [Q.settle + 2, WISP.y]]);

let BG = null;
function before(ctx, dt) {
  const b = dt / BEAT;
  const L = SKY;
  L.begin(0);
  background(L, b);
  // the night above the weather comes down to the field the package plays on
  const p = smoothstep(10.4, SHIFT / BEAT + TL.glide / BEAT - 0.05, b);
  if (p > 0) {
    const d = L.d;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (ditherAt(x, y) < p * 16) d[y * W + x] = 0;
    ctx.drawImage((BG ??= WEATHER_OPEN.background)(), 0, 0);
  }
  L.end(ctx);
  // the sun, above the cloud layer (seen through its last gaps as the camera nears the top)
  if (b >= Q.breakout - 1) drawSun(ctx, SUN.x, SUN.y, ZOOM, 1, raysAt(b), turnAt(dt));
  const Fr = FRONT;
  Fr.begin(0);
  drawBanks(Fr, b);
  Fr.end(ctx);
  if (b >= Q.wisp) drawCloud(ctx, WX(b), WY(b), ZOOM);
  // the bit pops out of the sun's shoulder on the package's clock, as the emblem does
  drawHopBit(ctx, dt - SHIFT, CENTRE.x, CENTRE.y, null, Math.round(WEATHER_OPEN.shoulder * ZOOM), WEATHER_OPEN.popAt);
  if (b < Q.climb + 0.7) {
    Fr.begin(0);
    rain(Fr, b);
    lightning(Fr, b);
    Fr.end(ctx);
  }
}

const SEQ = sequence({ hit: HIT, before, reveal: WEATHER_OPEN });

/** WORLD WEATHER's title sequence at dt seconds (full frame). */
export function drawWeatherTitles(ctx, dt, info) {
  SEQ.draw(ctx, dt, info);
}

export const WEATHER_TITLES = { ...WEATHER_OPEN, warmJobs: () => [...WEATHER_OPEN.warmJobs(), banks, drops, bolt, falls] };
export const WEATHER_SEQ = SEQ;
/** For checks: the sun's rays and turn, the last cloud's anchor at beat b. */
export const weatherEmblem = (b) => ({ rays: raysAt(b), turn: turnAt(b * BEAT), wisp: { x: WX(b), y: WY(b) } });
export { SUN as WEATHER_SUN, WISP as WEATHER_WISP };
/** For checks: the background and the banks at beat b (their own layers' pixels). */
export function weatherLayers(b) {
  SKY.begin(0);
  background(SKY, b);
  FRONT.begin(0);
  drawBanks(FRONT, b);
  return { bg: SKY.d.slice(), banks: FRONT.d.slice() };
}
/** For checks: the camera's height (px of the middle depth) at beat b. */
export const weatherRise = (b) => RISE(b);
/** For checks: the screen row of the highest head of the sea at its slowest depth, at beat b. */
export function weatherSeaTop(b) {
  let y = Infinity;
  for (const B of banks()) {
    if (B.yw < TOP) continue;
    const D = DEPTHS[B.di];
    let t = 0;
    for (let i = 0; i < B.w; i++) t = Math.max(t, B.top[i]);
    y = Math.min(y, CENTRE.y + (RISE(b) - B.yw) * D.k - t);
  }
  return y;
}
