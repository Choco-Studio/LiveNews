// COSMOS DESK's title sequence (owner, 9 Oct: the other programmes' opens "as crafted" as WORLD
// NOW's). About nine and a half seconds on the programme's grid (cues.js, 82 BPM):
//
//   DEEP FIELD  beats 0-3     the camera glides through a field of stars that stream past it, a
//                             magenta nebula drifting behind; stars flare as it passes (the bells)
//   FLYBY       3-6           the ringed planet sweeps in huge from the lower left, backlit: a
//                             dark disc with a thin crescent, its rings a band across the frame;
//                             the sun bursts at its limb
//   DAWN        4.5-9.5       from the burst, day swings round onto the planet while it is still
//                             big (its bands, a storm, the ringlets) and the camera pulls back (the
//                             emblem's own dawn, seen big), the moon runs its orbit, the nebula
//                             fades and the field comes up; the stars come to rest exactly where
//                             the backdrop has them
//   TITLE       9.75-12       the package's reveal; still for the last 0.8 s
//
// The planet is the emblem's own (cosmos.js: bands on 5-tone ramps, limb darkening, rings with a
// Cassini gap, the rings' shadow) drawn pixel by pixel from the true circle at any size; at centre
// stage it is the emblem's pixels (tested), so the hand-over never pops.
import { P } from '../../palette.js';
import { u32, clamp, lerp, seg, smoothstep, easeOut, easeInOut, easeOutQuint } from '../../gfx/index.js';
import { W, H, CENTRE, ZOOM } from './kit.js';
import { COSMOS, PR0, RING_IN, RING_OUT, RK, CTL, STL, BANDS, L0, L1, ORX, ORY, TH0, TH1, starList } from './cosmos.js';
import { track, sequence, Layer, ditherAt } from './seq.js';
import { CUES, hitOf } from './cues.js';

const ID = 'cosmos';
const Q = CUES[ID];
const BEAT = 60 / Q.bpm;
const HIT = hitOf(ID);
const PRL = Math.round(PR0 * ZOOM); // the planet at centre stage
const C = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, u32(v)]));

// ---------------------------------------------------------------------------------------------
// The planet: centre, radius and the light over the beats (from the lower left, huge, to centre
// stage); the light starts the emblem's own way (behind and to the right: a crescent) and swings
// round to the channel's key light as the camera pulls back

const PX = track([[2, -240], [Q.flyby, -70], [Q.burst, 30], [Q.pull, 108], [7.5, 160], [8.7, 186], [Q.settle, CENTRE.x]]);
const PY = track([[2, 420], [Q.flyby, 310], [Q.burst, 236], [Q.pull, 168], [7.5, 126], [8.7, 104], [Q.settle, CENTRE.y]]);
const PRR = track([[2, Math.log(300)], [Q.flyby, Math.log(270)], [Q.burst, Math.log(210)], [Q.pull, Math.log(150)], [7.5, Math.log(86)], [8.7, Math.log(44)], [Q.settle, Math.log(PRL)]]);
// day comes round from the sun's burst at the limb, while the planet is still big
const DAWN = (b) => easeInOut(seg(b, Q.burst, 7.8 - Q.burst));
// the flyby's sun: behind the planet and up to the right (a thin crescent on its upper right limb);
// it swings round through the emblem's own first light (L0) to the key light
const LS = [0.42, 0.3, -0.86];
const LV = [0, 0, 0];
function lightAt(b) {
  const e = DAWN(b);
  const a = Math.min(1, e * 2);
  const c = Math.max(0, e * 2 - 1);
  for (let k = 0; k < 3; k++) LV[k] = e < 0.5 ? LS[k] + (L0[k] - LS[k]) * a : L0[k] + (L1[k] - L0[k]) * c;
  const n = Math.hypot(LV[0], LV[1], LV[2]) || 1;
  LV[0] /= n;
  LV[1] /= n;
  LV[2] /= n;
  return LV;
}

const PL = { cx: 0, cy: 0, R: 0 };
function planetAt(b) {
  PL.cx = PX(b);
  PL.cy = PY(b);
  PL.R = b >= Q.settle ? PRL : Math.exp(PRR(b));
  return PL;
}

// ---------------------------------------------------------------------------------------------
// The planet, pixel by pixel (cosmos.js geometry() and renderPlanet() at a fractional centre and
// any size; identical at an integer centre and the emblem's radius)

const LAYER = new Layer('cosmos-titles');
const RINGLETS = (R) => smoothstep(70, 150, R); // fine ringlets only a close camera resolves
function planet(L, cx, cy, R, light, back) {
  const d = L.d;
  const RR = R + 0.5;
  const RR2 = RR * RR;
  const limb2 = (RR - 1.15) * (RR - 1.15);
  const [lx, ly, lz] = light;
  // the rings catch the light while the sun is round to the side (cosmos.js: lx > -0.2); as day comes
  // round they turn over through the screen's fixed matrix instead of all at once
  const litK = clamp((lx + 0.35) / 0.3, 0, 1) * 16;
  const wave = (0.4 * PRL) / R;
  const sh4 = (4 * R) / PR0;
  const sh25 = (2.5 * R) / PR0;
  const reach = R * RING_OUT + 2;
  const fine = RINGLETS(R);
  const y0 = Math.max(0, Math.ceil(cy - reach));
  const y1 = Math.min(H - 1, Math.floor(cy + reach));
  const x0 = Math.max(0, Math.ceil(cx - reach));
  const x1 = Math.min(W - 1, Math.floor(cx + reach));
  for (let y = y0; y <= y1; y++) {
    const dy = y - cy;
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const u = dx * CTL + dy * STL;
      const v = -dx * STL + dy * CTL;
      const e = Math.sqrt(u * u + (v / RK) * (v / RK)) / R;
      const r2 = dx * dx + dy * dy;
      const onPlanet = r2 <= RR2;
      const inRing = e >= RING_IN && e <= RING_OUT && !(e > 1.6 && e < 1.66);
      if (inRing && (v > 0 || !onPlanet)) {
        // drawn in two passes: the back of the rings (behind the planet) and the front
        if ((v <= 0) !== back) continue;
        const rc = e < 1.44 ? 0 : e < 1.6 ? 1 : 2;
        const lit = litK >= 16 || (litK > 0 && ditherAt(x, y) < litK);
        let c = rc === 1 ? (lit ? C.cream : C.tan) : rc === 0 ? (lit ? C.fog : C.steel) : lit ? C.silver : C.fog;
        if (v <= 0 && u < 0 && Math.abs(v) < R * RK * 1.15 && e < 1.8) c = C.slate;
        // ringlets belong to the ring (their radius in e, never in screen pixels: they scale with it,
        // never slide) and fade before they are thinner than two pixels
        else if (fine > 0 && Math.sin(e * 86) > 1 - 0.55 * fine) c = rc === 1 ? (lit ? C.tan : C.tanShade) : rc === 0 ? C.steel : C.fog;
        d[y * W + x] = c;
        continue;
      }
      if (!onPlanet || back) continue;
      const RRi = RR;
      const nx = dx / RRi;
      const ny = -dy / RRi;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      let bb = v / R + 0.05 * Math.sin(u * wave);
      let k = BANDS.length - 1;
      for (let j = 0; j < BANDS.length; j++) {
        if (bb < BANDS[j][0]) {
          k = j;
          break;
        }
      }
      const ue = (u + sh4) / R;
      const ve = (v - sh25) / R;
      const es = Math.sqrt(ue * ue + (ve / RK) * (ve / RK));
      const shadow = v < 0 && es > RING_IN && es < 1.85;
      const dif = nx * lx + ny * ly + nz * lz;
      const limbK = 0.7 + 0.3 * nz;
      let lv = Math.floor(clamp((dif + 0.1) * 3.7 * limbK, 0, 4.2));
      if (shadow && lv > 1) lv = Math.max(lv - 2, 1);
      if (lv > 4) lv = 4;
      // close up the bands carry fine streaks and a storm (the emblem's size has neither)
      if (fine > 0 && lv > 1) {
        // broad belts with gentle waves (a gas giant's), one palette step darker
        const belt = Math.sin((v / R) * 15 + 0.7 * Math.sin((u / R) * 5.3));
        if (belt > 1 - 0.45 * fine) lv -= 1;
        const sx = (u / R - 0.28) / 0.2;
        const sy = (v / R - 0.3) / 0.075;
        const st = sx * sx + sy * sy;
        if (st < fine) lv = st < 0.35 * fine ? Math.min(4, lv + 1) : Math.max(1, lv - 1);
      }
      d[y * W + x] = lv === 0 ? (r2 > limb2 ? C.slate : C.black) : BANDS[k][1][lv];
    }
  }
}

// the moon on the emblem's orbit (k: the orbit's size factor; ZOOM at centre stage)
const OP = [0, 0, 0];
function orbit(th, k, out) {
  const ex = Math.cos(th) * ORX * k;
  const ey = Math.sin(th) * ORY * k;
  out[0] = ex * CTL - ey * STL;
  out[1] = ex * STL + ey * CTL;
  out[2] = Math.sin(th);
  return out;
}
function moon(L, x, y) {
  const put = (xx, yy, w, h, c) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) L.plot(x + xx + i, y + yy + j, c);
  };
  // cosmos.js drawMoon, in the layer
  put(-1, -2, 3, 5, C.fog);
  put(-2, -1, 5, 3, C.fog);
  put(-1, -1, 2, 2, C.silver);
  put(-1, -1, 1, 1, C.white);
  put(1, 1, 1, 1, C.steel);
  put(2, 0, 1, 1, C.steel);
}
const MOON = (b) => easeOutQuint(seg(b, Q.pull + 0.4, Q.settle - Q.pull - 0.3));
function moonAndTrail(L, b, cx, cy, R, front) {
  if (b < Q.pull + 0.4) return;
  const k = (R / PRL) * ZOOM;
  const p = MOON(b);
  const th = TH0 + (TH1 - TH0) * p;
  const len = 1.5 * (1 - easeOut(seg(b, Q.pull + 1.6, 1.4)));
  if (len > 0.02) {
    const steps = Math.ceil(len * 50 * Math.max(1, k / ZOOM));
    for (let s = 1; s <= steps; s++) {
      const a = th - (s / steps) * len;
      orbit(a, k, OP);
      if ((OP[2] > 0) !== front) continue;
      if (!front && OP[0] * OP[0] + OP[1] * OP[1] < (R + 1) * (R + 1)) continue;
      L.plot(Math.round(cx + OP[0]), Math.round(cy + OP[1]), C.magenta);
    }
  }
  orbit(th, k, OP);
  if ((OP[2] > 0) !== front) return;
  if (!front && OP[0] * OP[0] + OP[1] * OP[1] < (R + 2) * (R + 2)) return;
  moon(L, Math.round(cx + OP[0]), Math.round(cy + OP[1]));
}

// ---------------------------------------------------------------------------------------------
// Stars: the backdrop's own, travelling out from the vanishing point to the places the backdrop
// has them (so the field they end on is the backdrop itself), and more that stream past and leave

const VP = { x: CENTRE.x, y: 104 };
const STOP = Q.settle; // the camera comes to rest
// how far the camera still has to travel (depth units; stars' final depth 100)
const TRAVEL = track([[-2, 420], [0, 300], [Q.flyby, 170], [Q.pull, 70], [8.5, 10], [STOP, 0]]);
let STARS = null;
function stars() {
  if (STARS) return STARS;
  let s = 99173;
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
  const list = starList().map((st) => ({ fx: st.x, fy: st.y, c: st.c, cross: st.cross, z: 100, home: true }));
  // passers: final positions far outside the frame, at nearer final depths (faster)
  for (let i = 0; i < 260; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 260 + rnd() * 700;
    list.push({ fx: VP.x + Math.cos(a) * r * 1.4, fy: VP.y + Math.sin(a) * r, c: rnd() < 0.55 ? 1 : rnd() < 0.7 ? 2 : 3, cross: false, z: 40 + rnd() * 50, home: false });
  }
  STARS = list;
  return list;
}
const SCOL = () => [C.steel, C.fog, C.silver, C.white];
function starAt(st, travel, out) {
  const k = st.z / (st.z + travel);
  out[0] = VP.x + (st.fx - VP.x) * k;
  out[1] = VP.y + (st.fy - VP.y) * k;
  return out;
}
const SP = [0, 0];
const SQ = [0, 0];
function drawStars(L, b) {
  const cols = SCOL();
  const tr = TRAVEL(b);
  const tr0 = TRAVEL(b - 1 / 30 / BEAT);
  for (const st of stars()) {
    starAt(st, tr, SP);
    const x = Math.round(SP[0]);
    const y = Math.round(SP[1]);
    if (x < -40 || x > W + 40 || y < -40 || y > H + 40) continue;
    // nearer and faster stars are brighter, and draw their last frame's travel (a streak, not a strobe)
    starAt(st, tr0, SQ);
    const run = Math.hypot(SP[0] - SQ[0], SP[1] - SQ[1]);
    let c = st.c;
    if (!st.home) c = Math.min(3, Math.max(0, st.c - (tr > 220 ? 1 : 0)));
    if (run > 1.5) {
      const n = Math.min(24, Math.ceil(run));
      for (let i = n; i >= 1; i--) {
        const f = i / n;
        const px = Math.round(lerp(SP[0], SQ[0], f));
        const py = Math.round(lerp(SP[1], SQ[1], f));
        L.plot(px, py, cols[Math.max(0, c - 1 - Math.floor(f * 2))]);
      }
    }
    L.plot(x, y, cols[c]);
    if (st.cross && tr < 1) {
      L.plot(x - 1, y, cols[0]);
      L.plot(x + 1, y, cols[0]);
      L.plot(x, y - 1, cols[0]);
      L.plot(x, y + 1, cols[0]);
    }
  }
}

// a star flares as the camera passes it, on the bells: a four-point glint for a beat
function glints(L, b) {
  const list = stars();
  for (let g = 0; g < Q.glints.length; g++) {
    const p = seg(b, Q.glints[g], 0.9);
    if (p <= 0 || p >= 1) continue;
    // the brightest home stars, one per bell, on the frame's thirds
    const st = list[[7, 41, 88][g % 3] % list.length];
    starAt(st, TRAVEL(b), SP);
    const x = Math.round(SP[0]);
    const y = Math.round(SP[1]);
    const a = Math.sin(Math.PI * p);
    const len = Math.round(2 + 6 * a);
    for (let i = 1; i <= len; i++) {
      const c = i < len * 0.4 ? C.white : i < len * 0.75 ? C.silver : C.fog;
      L.plot(x + i, y, c);
      L.plot(x - i, y, c);
      L.plot(x, y + i, c);
      L.plot(x, y - i, c);
    }
    L.plot(x, y, C.white);
  }
}

// ---------------------------------------------------------------------------------------------
// The nebula: an emission cloud the camera flies into. Glowing gas (maroon to pink) brightest in thin
// filaments, cut by dark lanes of dust. Domain-warped fractal noise baked
// once at two thirds of the screen's resolution over more than the frame, sampled smoothly and dithered
// on the screen's fixed matrix. It grows from the vanishing point as the camera travels, the near dust
// and filaments faster than the far glow (two depths), and drifts a little.

const NW = 320;
const NH = 180;
const NSPAN = 1.25; // the bake covers 1.25 frames, so the drift never reaches its edge
let NEB = null;
function nebula() {
  if (NEB) return NEB;
  let s = 5813;
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
  const G = 5;
  const grid = Array.from({ length: 6 }, (_, o) => {
    const n = G << o;
    return { n, v: Float32Array.from({ length: (n + 1) * (n + 1) }, rnd) };
  });
  const noise = (x, y, o) => {
    const { n, v } = grid[o];
    const fx = ((x % 1) + 1) % 1 * n;
    const fy = ((y % 1) + 1) % 1 * n;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const sx = tx * tx * tx * (tx * (tx * 6 - 15) + 10);
    const sy = ty * ty * ty * (ty * (ty * 6 - 15) + 10);
    // periodic: the warp carries coordinates past the bake's edge, which must not show a seam
    const at = (i, j) => v[((j % n) * (n + 1)) + (i % n)];
    return lerp(lerp(at(ix, iy), at(ix + 1, iy), sx), lerp(at(ix, iy + 1), at(ix + 1, iy + 1), sx), sy);
  };
  const fbm = (x, y, oct = 6, o0 = 0) => {
    let f = 0;
    let a = 0.5;
    let t = 0;
    for (let o = o0; o < Math.min(6, o0 + oct); o++) {
      f += a * noise(x, y, o);
      t += a;
      a *= 0.5;
    }
    return f / t;
  };
  const glow = new Float32Array(NW * NH);
  const near = new Float32Array(NW * NH); // filaments (+) and dust (-), the nearer depth
  for (let y = 0; y < NH; y++) {
    for (let x = 0; x < NW; x++) {
      const u = x / NW;
      const w = y / NH;
      // the warp: the gas folds over itself in curls instead of sitting in blobs
      const qx = fbm(u * 1.3 + 0.17, w * 1.3 + 0.61, 5);
      const qy = fbm(u * 1.3 + 0.83, w * 1.3 + 0.29, 5);
      const d = fbm(u + 0.9 * qx, w + 0.9 * qy, 5);
      // the cloud's body: a broad diagonal mass from the lower left to the upper right, thickest right of centre
      const along = u * 0.8 + (1 - w) * 0.6;
      const across = (w - (0.95 - u * 0.75)) / 0.34;
      const body = Math.exp(-across * across) * smoothstep(0.15, 0.7, along);
      const g = clamp((d - 0.42) * 3.2, 0, 1) * body;
      // filaments: the ridges of a second warped field, thin and bright where the gas is dense
      const r = 1 - Math.abs(2 * fbm(u * 1.6 + 1.7 * qx, w * 1.6 + 1.7 * qy, 4, 1) - 1);
      const fil = Math.pow(r, 5) * smoothstep(0.08, 0.5, g + 0.15 * body);
      // dust: dark lanes across the bright part
      const lane = 1 - Math.abs(2 * fbm(u * 2.1 + 0.6 * qy + 3.1, w * 2.1 + 0.6 * qx, 4) - 1);
      const dust = Math.pow(lane, 4) * smoothstep(0.1, 0.45, g);
      glow[y * NW + x] = g;
      near[y * NW + x] = fil * 0.9 - dust * 1.1;
    }
  }
  NEB = { glow, near };
  return NEB;
}
const sample = (A, nx, ny) => {
  const ix = Math.floor(nx);
  const iy = Math.floor(ny);
  if (ix < 0 || iy < 0 || ix >= NW - 1 || iy >= NH - 1) return 0;
  const tx = nx - ix;
  const ty = ny - iy;
  const i = iy * NW + ix;
  return lerp(lerp(A[i], A[i + 1], tx), lerp(A[i + NW], A[i + NW + 1], tx), ty);
};
const NEB_COL = [0, C.maroon, C.purple, C.magenta, C.pink];
// the camera's push into the cloud (1 = the bake's own scale) and its slow drift, over the beats
const NZOOM = track([[-1, 0.94], [0, 1], [Q.flyby, 1.22], [Q.pull, 1.42], [Q.settle, 1.55]]);
function drawNebula(L, b, amount) {
  if (amount <= 0) return;
  const N = nebula();
  const zg = NZOOM(b);
  const zn = 1 + (zg - 1) * 1.35; // the nearer depth grows faster
  const k = NW / (W * NSPAN);
  const ox = NW / 2 + b * 1.6; // the drift, in bake pixels
  const oy = NH / 2 + 8 + b * 0.5;
  for (let y = 0; y < H; y++) {
    const dy = y - VP.y;
    const gy = oy + (dy * k) / zg;
    const ny = oy + (dy * k) / zn;
    for (let x = 0; x < W; x++) {
      const dx = x - VP.x;
      const g = sample(N.glow, ox + (dx * k) / zg, gy);
      const n = sample(N.near, ox + (dx * k) / zn, ny);
      // the glow alone reaches magenta; pink is the filaments' own
      const e = clamp(g * 0.78 + n, 0, 1) * amount;
      const th = (ditherAt(x, y) + 0.5) / 16;
      const lvl = Math.floor(e * 4.3 + th - 0.5);
      if (lvl > 0) L.d[y * W + x] = NEB_COL[Math.min(4, lvl)];
    }
  }
}

// ---------------------------------------------------------------------------------------------
// The sun bursting at the limb as it comes round from behind: an eight-point star (no flare streak)

function burst(L, b, pl, light) {
  const p = seg(b, Q.burst - 0.7, 2.2);
  if (p <= 0 || p >= 1) return;
  const a = Math.sin(Math.PI * p) ** 1.5;
  const n = Math.hypot(light[0], light[1]) || 1;
  const sx = Math.round(pl.cx + (light[0] / n) * (pl.R + 1));
  const sy = Math.round(pl.cy - (light[1] / n) * (pl.R + 1));
  const len = Math.round(6 + 46 * a);
  const dl = Math.round(len * 0.42);
  for (let i = 1; i <= len; i++) {
    const c = i < len * 0.25 ? C.white : i < len * 0.55 ? C.cream : C.yellow;
    if (i > len * 0.8 && (i & 1)) continue;
    L.plot(sx + i, sy, c);
    L.plot(sx - i, sy, c);
    L.plot(sx, sy + i, c);
    L.plot(sx, sy - i, c);
    if (i <= dl) {
      L.plot(sx + i, sy + i, c);
      L.plot(sx - i, sy - i, c);
      L.plot(sx + i, sy - i, c);
      L.plot(sx - i, sy + i, c);
    }
  }
  // a soft glow round the core (cream then yellow, dithered on the screen's matrix)
  const gr = Math.round(3 + 9 * a);
  for (let y = -gr; y <= gr; y++) {
    for (let x = -gr; x <= gr; x++) {
      const r = Math.sqrt(x * x + y * y) / gr;
      if (r > 1) continue;
      const g = (1 - r) * (1 - r) * a * 2.2;
      if (g * 16 > ditherAt(sx + x, sy + y)) L.plot(sx + x, sy + y, g > 0.9 ? C.cream : C.yellow);
    }
  }
  const cr = Math.round(1 + 3 * a);
  for (let y = -cr; y <= cr; y++) for (let x = -cr; x <= cr; x++) if (Math.abs(x) + Math.abs(y) <= cr) L.plot(sx + x, sy + y, C.white);
}

// ---------------------------------------------------------------------------------------------
// The sequence

function before(ctx, dt) {
  const b = dt / BEAT;
  const L = LAYER;
  if (b >= STOP) {
    // at rest: the backdrop itself (its stars are where the travelling ones came to rest)
    ctx.drawImage(COSMOS.background(), 0, 0);
    L.begin(0);
  } else {
    // black space; the field comes up behind the planet as the camera settles
    const field = smoothstep(Q.pull + 1, STOP, b);
    if (field > 0) ctx.drawImage(COSMOS.background(), 0, 0);
    L.begin(0);
    const d = L.d;
    const keep = 1 - field;
    if (keep > 0) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (ditherAt(x, y) < keep * 16) d[y * W + x] = C.black;
    }
    drawNebula(L, b, 1 - smoothstep(Q.pull, Q.settle - 0.8, b));
    drawStars(L, b);
    glints(L, b);
  }
  if (b >= Q.flyby - 1) {
    const pl = planetAt(b);
    const light = lightAt(b);
    moonAndTrail(L, b, pl.cx, pl.cy, pl.R, false);
    planet(L, pl.cx, pl.cy, pl.R, light, true);
    planet(L, pl.cx, pl.cy, pl.R, light, false);
    moonAndTrail(L, b, pl.cx, pl.cy, pl.R, true);
    burst(L, b, pl, light);
  }
  L.end(ctx);
}

const SEQ = sequence({ hit: HIT, before, reveal: COSMOS });

/** COSMOS DESK's title sequence at dt seconds (full frame). */
export function drawCosmosTitles(ctx, dt, info) {
  SEQ.draw(ctx, dt, info);
}

export const COSMOS_TITLES = { ...COSMOS, warmJobs: () => [...COSMOS.warmJobs(), nebula, stars] };
export const COSMOS_SEQ = SEQ;
/** The planet at beat b (for checks). */
export const cosmosPlanet = (b) => ({ ...planetAt(b) });
/** Draws the planet alone into the layer (for checks); returns the layer's pixels. */
export function cosmosPlanetPixels(cx, cy, R, light) {
  LAYER.begin(0);
  planet(LAYER, cx, cy, R, light, true);
  planet(LAYER, cx, cy, R, light, false);
  return LAYER.d;
}
