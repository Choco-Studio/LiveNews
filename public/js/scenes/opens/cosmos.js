// COSMOS DESK open: dawn on a ringed planet. The sun swings round from behind
// it (crescent to full light), its rings draw themselves around it and a moon
// sweeps one orbit leaving a short magenta trail before it parks. Accent:
// magenta; the starfield behind is still.
import { P } from '../../palette.js';
import { u32, clamp, seg, easeOut, easeOutQuint, easeInOut, bayer } from '../../gfx/index.js';
import { mulberry32 } from '../../util.js';
import { backdrop, frameBuffer, playOpen, CENTRE, ZOOM, W, H } from './kit.js';

const PR0 = 19; // planet radius in the lock-up (x ZOOM at centre stage)
const RING_IN = 1.36;
const RING_OUT = 1.92;
const RK = 0.24; // ring flattening (ry / rx)
const TILT = -0.28; // right side higher
const CTL = Math.cos(TILT);
const STL = Math.sin(TILT);

const BANDS = [
  [-0.7, [P.cream, P.tan, P.tanShade]],
  [-0.42, [P.skin, P.skinShade, P.brown]],
  [-0.1, [P.cream, P.tan, P.tanShade]],
  [0.04, [P.pink, P.magenta, P.purple]],
  [0.36, [P.cream, P.tan, P.tanShade]],
  [0.62, [P.skin, P.skinShade, P.brown]],
  [2, [P.cream, P.tan, P.tanShade]],
].map(([to, cs]) => [to, cs.map((c) => u32(c))]);
const C = Object.fromEntries(['black', 'ink', 'slate', 'steel', 'fog', 'silver', 'cream', 'tan', 'purple', 'magenta'].map((k) => [k, u32(P[k])]));

// per-pixel geometry, computed once per planet radius
const GEOS = new Map();
function geometry(PR) {
  let GEO = GEOS.get(PR);
  if (GEO) return GEO;
  const BW = 2 * Math.ceil(PR * RING_OUT) + 5;
  const BH = 2 * PR + 11;
  const BCX = BW >> 1;
  const BCY = BH >> 1;
  const n = BW * BH;
  const kind = new Uint8Array(n); // 0 empty, 1 planet, 2 ring front, 3 ring back
  const nx = new Float32Array(n);
  const ny = new Float32Array(n);
  const nz = new Float32Array(n);
  const band = new Uint8Array(n);
  const ringC = new Uint8Array(n);
  const ang = new Float32Array(n); // ring drawing order (angle 0..1)
  const shadow = new Uint8Array(n);
  const RR = PR + 0.5;
  for (let y = 0; y < BH; y++) {
    for (let x = 0; x < BW; x++) {
      const i = y * BW + x;
      const dx = x - BCX;
      const dy = y - BCY;
      const u = dx * CTL + dy * STL;
      const v = -dx * STL + dy * CTL;
      const e = Math.sqrt(u * u + (v / RK) * (v / RK)) / PR;
      const onPlanet = dx * dx + dy * dy <= RR * RR;
      const inRing = e >= RING_IN && e <= RING_OUT && !(e > 1.6 && e < 1.66);
      if (inRing && (v > 0 || !onPlanet)) {
        kind[i] = v > 0 ? 2 : 3;
        ringC[i] = e < 1.44 ? 0 : e < 1.6 ? 1 : 2;
        ang[i] = (Math.atan2(v / RK, u) / (Math.PI * 2) + 1.25) % 1;
        shadow[i] = v < 0 && u < 0 && Math.abs(v) < PR * RK * 1.15 && e < 1.8 ? 1 : 0;
        continue;
      }
      if (!onPlanet) continue;
      kind[i] = 1;
      nx[i] = dx / RR;
      ny[i] = -dy / RR;
      nz[i] = Math.sqrt(Math.max(0, 1 - nx[i] * nx[i] - ny[i] * ny[i]));
      const b = v / PR + 0.05 * Math.sin(u * 0.4);
      let k = BANDS.length - 1;
      for (let j = 0; j < BANDS.length; j++) if (b < BANDS[j][0]) {
        k = j;
        break;
      }
      band[i] = k;
      // the rings' shadow falls across the planet just above the front arc
      const ue = (u + (4 * PR) / PR0) / PR;
      const ve = (v - (2.5 * PR) / PR0) / PR;
      const es = Math.sqrt(ue * ue + (ve / RK) * (ve / RK));
      shadow[i] = v < 0 && es > RING_IN && es < 1.85 ? 1 : 0;
    }
  }
  GEO = { kind, nx, ny, nz, band, ringC, ang, shadow, BW, BH, BCX, BCY, PR };
  GEOS.set(PR, GEO);
  return GEO;
}

const L0 = [0.95, 0.05, -0.32]; // sun behind and to the right: a thin crescent
const L1 = [-0.56, 0.5, 0.66]; // the channel key light: upper left, in front
const LV = [0, 0, 0];

function renderPlanet(fb, G, light, ringP) {
  const { BW } = G;
  const d = fb.d;
  const [lx, ly, lz] = light;
  for (let i = 0; i < d.length; i++) {
    const k = G.kind[i];
    if (!k) {
      d[i] = 0;
      continue;
    }
    const x = i % BW;
    const y = (i / BW) | 0;
    if (k === 1) {
      const dif = G.nx[i] * lx + G.ny[i] * ly + G.nz[i] * lz;
      let lv = clamp((dif + 0.12) * 2.6, 0, 3.2) - (G.shadow[i] ? 1.1 : 0);
      lv = Math.floor(lv) + (lv - Math.floor(lv) > bayer(x, y) ? 1 : 0);
      const set = BANDS[G.band[i]][1];
      d[i] = lv <= 0 ? C.black : lv === 1 ? set[2] : lv === 2 ? set[1] : set[0];
    } else {
      if (G.ang[i] > ringP) {
        d[i] = 0;
        continue;
      }
      const lit = lx > -0.2; // the rings catch the light once the sun is round
      const rc = G.ringC[i];
      let c = rc === 1 ? (lit ? C.cream : C.tan) : rc === 0 ? (lit ? C.fog : C.steel) : lit ? C.silver : C.fog;
      if (k === 3 && G.shadow[i]) c = C.slate;
      d[i] = c;
    }
  }
  fb.cx.putImageData(fb.img, 0, 0);
}

function lightAt(dt) {
  const e = easeOut(seg(dt, 0.25, 1.25));
  for (let k = 0; k < 3; k++) LV[k] = L0[k] + (L1[k] - L0[k]) * e;
  const n = Math.hypot(LV[0], LV[1], LV[2]) || 1;
  LV[0] /= n;
  LV[1] /= n;
  LV[2] /= n;
  return LV;
}

// --- moon on its own orbit (wider and rounder than the rings)
const ORX = 44;
const ORY = 20;
const TH0 = -2.6; // start angle (radians, screen space)
const TH1 = TH0 + Math.PI * 2 + 1.25; // one turn and a bit, parking upper left
function orbitPt(th, k, out) {
  const ex = Math.cos(th) * ORX * k;
  const ey = Math.sin(th) * ORY * k;
  out[0] = ex * CTL - ey * STL;
  out[1] = ex * STL + ey * CTL;
  out[2] = Math.sin(th); // > 0 in front of the planet
  return out;
}
const OP = [0, 0, 0];

function drawMoon(ctx, x, y) {
  ctx.fillStyle = P.fog;
  ctx.fillRect(x - 1, y - 2, 3, 5);
  ctx.fillRect(x - 2, y - 1, 5, 3);
  ctx.fillStyle = P.silver;
  ctx.fillRect(x - 1, y - 1, 2, 2);
  ctx.fillStyle = P.white;
  ctx.fillRect(x - 1, y - 1, 1, 1);
  ctx.fillStyle = P.steel;
  ctx.fillRect(x + 1, y + 1, 1, 1);
  ctx.fillRect(x + 2, y, 1, 1);
}

function moonAndTrail(ctx, dt, x, y, k, PR, front) {
  if (dt < 0.2) return;
  const p = easeOutQuint(seg(dt, 0.2, 1.45));
  const th = TH0 + (TH1 - TH0) * p;
  // the trail: a short arc behind the moon that shortens as it slows
  const len = 1.5 * (1 - easeOut(seg(dt, 0.6, 0.95)));
  if (len > 0.02) {
    ctx.fillStyle = P.magenta;
    const steps = Math.ceil(len * 50);
    for (let s = 1; s <= steps; s++) {
      const a = th - (s / steps) * len;
      orbitPt(a, k, OP);
      if ((OP[2] > 0) !== front) continue;
      if (!front && OP[0] * OP[0] + OP[1] * OP[1] < (PR + 1) * (PR + 1)) continue;
      ctx.fillRect(Math.round(x + OP[0]), Math.round(y + OP[1]), 1, 1);
    }
  }
  orbitPt(th, k, OP);
  if ((OP[2] > 0) !== front) return;
  if (!front && OP[0] * OP[0] + OP[1] * OP[1] < (PR + 2) * (PR + 2)) return;
  drawMoon(ctx, Math.round(x + OP[0]), Math.round(y + OP[1]));
}

function emblem(ctx, dt, x, y, k = 1) {
  if (dt < 0.2) return;
  const PR = Math.round(PR0 * k);
  const G = geometry(PR);
  const { BW, BH, BCX, BCY } = G;
  moonAndTrail(ctx, dt, x, y, k, PR, false);
  const fb = frameBuffer('cosmos-planet', BW, BH);
  const settled = dt > 1.55;
  const key = settled ? 'final' : Math.round(dt * 240);
  if (fb.key !== key) {
    fb.key = key;
    renderPlanet(fb, G, lightAt(dt), easeInOut(seg(dt, 0.4, 0.75)));
  }
  // the planet rises a little as it is lit (ease-out), never pops in
  const rise = Math.round(14 * (1 - easeOutQuint(seg(dt, 0.2, 0.9))));
  ctx.save();
  if (rise > 0) {
    ctx.beginPath();
    ctx.rect(x - BCX, y - BCY - 4, BW, BH + 4 - rise);
    ctx.clip();
  }
  ctx.drawImage(fb.cv, x - BCX, y - BCY + rise);
  ctx.restore();
  moonAndTrail(ctx, dt, x, y, k, PR, true);
}

function starTexture(d, level) {
  const rnd = mulberry32(4242);
  const cols = [u32(P.steel), u32(P.fog), u32(P.silver), u32(P.white)];
  for (let i = 0; i < 150; i++) {
    const x = Math.floor(rnd() * W);
    const y = Math.floor(rnd() * H);
    const b = rnd();
    // keep the lock-up area calm
    if (x > 120 && x < 330 && y > 74 && y < 150) continue;
    const c = cols[b > 0.96 ? 3 : b > 0.82 ? 2 : b > 0.5 ? 1 : 0];
    d[y * W + x] = c;
    if (b > 0.985 && x > 0 && y > 0 && x < W - 1 && y < H - 1) {
      d[y * W + x - 1] = cols[0];
      d[y * W + x + 1] = cols[0];
      d[(y - 1) * W + x] = cols[0];
      d[(y + 1) * W + x] = cols[0];
    }
  }
  return level;
}

const background = () => backdrop({ key: 'cosmos', colors: [P.black, P.black, P.ink], cx: CENTRE.x, cy: CENTRE.y, reach: 240, texture: starTexture });

export const COSMOS = {
  accent: P.magenta,
  style: { accent: P.magenta, plate: P.black, ink: 'light', bar: P.magenta },
  background,
  emblem,
  absorb: 0.32,
  shoulder: 27,
  warm: () => {
    for (let r = PR0; r <= Math.round(PR0 * ZOOM); r++) geometry(r);
  },
};

export function drawCosmos(ctx, dt, info) {
  playOpen(ctx, dt, info, COSMOS);
}
