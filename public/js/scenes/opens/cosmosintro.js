// COSMOS DESK's intro for the vertical clips (docs/publishing/shorts-v2.md §6; its cue sheet: cues.js INTRO_CUES). The
// owner, 26 Oct: "un acercamiento desde fuera de la galaxia, con todas las estrellas y puntitos moviéndose dando un
// efecto potente"; "que lleve hasta Saturno, que es el icono"; "que parezca una galaxia de verdad cuando te acercas,
// como el espacio real"; the letters worked for ("puntitos no queda muy creativo"); no boxes of text; four seconds at
// most. Six beats at 92 BPM (3.9 s), one unbroken fall on the clips' 216 x 384 frame, moving from its first frame:
//
//   GALAXY  beats 0-1.75  a spiral galaxy seen from outside it, tilted: a cream core, two blue-white arms threaded with
//                         pink nebulae and cut by dark dust lanes, its older disc a warm glow; the camera already
//                         falling toward a point in its near arm; three of its stars catch the light (the bells)
//   ARM     1.75-2.6      the glow resolves into stars as the camera reaches the arm, and they stream past it; the
//                         camera swings round as it falls, so the galaxy it leaves becomes a band across the sky
//   SATURN  2.4-4.4       out of the streaming stars a point of light ahead swells into Saturn, head on: the Sun is
//                         behind it, so it comes in dark, a thin crescent and a bright limb on its upper right, its
//                         rings lit (no glare, no flash: the owner, 26 Oct, "que no meta un destello"); the camera
//                         slows the whole way in and swings round the planet a few degrees ("una rotación alrededor de
//                         Saturno de unos grados"), the sky sliding behind it, as day comes round the planet from the
//                         stroke (beat 3) to the hit
//   TITLE   4.4-5         a little past the emblem's size the camera eases back to it ("puedes hacer el acercamiento y
//                         que se aleje para colocarse donde quiere. Pero hazlo fluido"), its moon running a last orbit;
//                         COSMOS rises in under it letter by letter, the programme's logotype, DESK between two rules
//                         under that (beat 4.6); on the hit a shine runs across it
//   LOCK    5-6           the emblem and the title over the galaxy's band, the camera still drifting back as the
//                         clip dissolves in; the cut on the sixth beat
//
// How it is drawn: about 80,000 points in space (the galaxy's, the Sun's neighbourhood's, the sky's) seen through one
// lens, the camera's distance on a logarithmic track (powers of ten: 120 units to 0.0003), the world turning about
// Saturn (a pitch and a roll through the arm, a swing round it at the end). Each point gives the light a star at its
// distance would (falling as the square of the distance, so the galaxy's glow holds its brightness as it resolves into
// stars), into three light buffers by colour and one of dust;
// a point that moves draws its travel since the last frame, its light spread along it. The light is then brought to
// the channel's palette on three ramps (warm, blue, pink) through the screen's Bayer matrix: a photograph's gradients
// in 32 colours. Saturn is the title sequence's own renderer (cosmostitles.js planet()), so the intro lands on the
// emblem itself.
import { P } from '../../palette.js';
import { textPixels, drawText, measureText } from '../../font.js';
import { u32, clamp, lerp, seg, smoothstep, easeOutQuint, easeInOut, easeInOutSine } from '../../gfx/index.js';
import { mulberry32 } from '../../util.js';
import { ZOOM } from './kit.js';
import { PR0, TH1, L0, L1, RING_IN, RING_OUT, RK, CTL, STL } from './cosmos.js';
import { track, Layer, ditherAt } from './seq.js';
import { planet, orbit, moon } from './cosmostitles.js';
import { INTRO_CUES } from './cues.js';

const VW = 216;
const VH = 384;
const NPX = VW * VH;
const Q = INTRO_CUES.cosmos;
const BEAT = 60 / Q.bpm;
const FRAME = 1 / 30 / BEAT; // one frame, in beats
const C = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, u32(v)]));

// ---------------------------------------------------------------------------------------------
// The camera. Saturn at the origin, the camera on the axis in front of it looking at it from `D`, which falls on a
// logarithmic track: slowly while the galaxy can be read, fast through the arm and the Sun's neighbourhood, slowing to
// Saturn, past it a little and back. The world turns about Saturn as the camera falls (a pitch that brings the galaxy's disc edge-on, so
// it ends as a band through the emblem, and a roll that lays the band on a slant).

const REST = { x: 108, y: 150 }; // Saturn's place on the frame at the end: the emblem's
const F = 175; // px: the lens
const SATURN_R = 5.65e-5; // Saturn's radius in world units
// Saturn's radius on the frame from the arm on: a point of light at the middle of the frame, where the streaming stars
// come from, growing head on as the camera closes in; the camera slows the whole way (each frame's growth a little less
// than the last's, from a third to nothing: a glide, never a brake), passes the emblem's size, and eases back to it as
// the title comes in (the owner, 26 Oct: "puedes hacer el acercamiento y que se aleje para colocarse donde quiere. Pero
// hazlo fluido"), the turn without a stop or a jolt; a slow drift on through the dissolve
const SAT_R = [
  [2.6, 1.5], [2.8, 5.2], [Q.sun, 13], [3.2, 23], [3.45, 34], [3.75, 44], [4.1, 50], [4.4, 51.5],
  [4.75, 49], [5.1, 44], [5.5, 40], [Q.cut, 37.5], [Q.cut + 1, 35.5],
];
const dOf = (R) => (SATURN_R * F) / R;
const LN_D = track([
  [-1, Math.log(74)], [0, Math.log(57)], [1, Math.log(28)], [1.75, Math.log(8)], [2.15, Math.log(0.5)], [2.4, Math.log(0.03)],
  ...SAT_R.map(([b, R]) => [b, Math.log(dOf(R))]),
]);
// Saturn's place (the lens's axis on the frame): low at the start, so the galaxy sits in the middle of the tall frame;
// the emblem's place from the arm on, where Saturn comes in
const VPX = track([[-1, REST.x], [0, REST.x]]);
const VPY = track([[-1, REST.y + 46], [0.3, REST.y + 46], [2.2, REST.y]]);
const INC = (62 * Math.PI) / 180; // the disc's tilt to the camera at the start
const CI = Math.cos(INC);
const SI = Math.sin(INC);
const PITCH = -(Math.PI / 2 - INC); // to edge-on
const ROLL = -0.5;
const TURN = (b) => easeInOut(seg(b, 1.5, 2.6));
// then, as Saturn comes in, the camera swings round it to the right, a few degrees (the owner, 26 Oct: "si quieres que la
// luz se tape puedes hacer una rotación alrededor de Saturno de unos grados"): the sky slides left behind the planet,
// the near stars across it the other way, and the Sun behind Saturn comes round its limb as day (lightAt)
const YAW = -0.26;
const SWING = (b) => easeInOutSine(seg(b, 2.5, Q.cut - 2.5));
function cameraAt(b, out) {
  const e = TURN(b);
  out.D = Math.exp(LN_D(b));
  out.vx = VPX(b);
  out.vy = VPY(b);
  out.cp = Math.cos(PITCH * e);
  out.sp = Math.sin(PITCH * e);
  out.cr = Math.cos(ROLL * e);
  out.sr = Math.sin(ROLL * e);
  out.cw = Math.cos(YAW * SWING(b));
  out.sw = Math.sin(YAW * SWING(b));
  return out;
}
// a point (world, Saturn at the origin) on the frame: [x, y, distance in front of the camera], false behind it
function project(x, y, z, cam, out) {
  const y1 = y * cam.cp - z * cam.sp;
  const z1 = y * cam.sp + z * cam.cp;
  const x2 = x * cam.cr - y1 * cam.sr;
  const y2 = x * cam.sr + y1 * cam.cr;
  // the swing: round Saturn, about the frame's upright
  const x3 = x2 * cam.cw + z1 * cam.sw;
  const dz = z1 * cam.cw - x2 * cam.sw + cam.D;
  if (dz <= cam.D * 1e-3) return false;
  out[0] = cam.vx + (x3 * F) / dz;
  out[1] = cam.vy + (y2 * F) / dz;
  out[2] = dz;
  return true;
}

// ---------------------------------------------------------------------------------------------
// The points, in typed arrays: position, colour (0 warm, 1 blue, 2 pink, 3 dust) and weight. The galaxy's first, then
// the Sun's neighbourhood's, then the sky's (a backdrop too far for the camera's fall to move or dim).

let PTS = null;
function points() {
  if (PTS) return PTS;
  const rnd = mulberry32(2611);
  const gauss = () => {
    let u = 0;
    for (let i = 0; i < 4; i++) u += rnd();
    return (u - 2) / 0.577;
  };
  const X = [];
  const Y = [];
  const Z = [];
  const K = [];
  const Wt = [];
  const add = (x, y, z, k, w) => {
    X.push(x);
    Y.push(y);
    Z.push(z);
    K.push(k);
    Wt.push(w);
  };
  // the galaxy: disc coordinates (u, v in its plane, h out of it) about its centre; Saturn sits in the near arm at
  // radius 15 on the first arm, and the galaxy is placed so that point is the origin
  const PITCH_A = 0.3; // the arms' pitch (about 17 degrees)
  const R0 = 4;
  const armTh = (r, arm) => arm * Math.PI + Math.log(r / R0) / PITCH_A;
  const th0 = armTh(15, 0);
  const u0 = 15 * Math.cos(th0);
  const v0 = 15 * Math.sin(th0);
  const disc = (u, v, h, k, w) => {
    const du = u - u0;
    const dv = v - v0;
    add(du, -dv * CI - h * SI, dv * SI - h * CI, k, w);
  };
  const polar = (r, th, h, k, w) => disc(r * Math.cos(th), r * Math.sin(th), h, k, w);
  // the bulge: old stars, warm, a flattened ball
  for (let i = 0; i < 7000; i++) {
    const u = gauss() * 3;
    const v = gauss() * 3;
    disc(u, v, gauss() * 1.8 * Math.exp(-Math.hypot(u, v) / 5), 0, 0.55);
  }
  // the older disc: an exponential glow, mostly warm
  for (let i = 0; i < 12000; i++) {
    const r = Math.min(42, -Math.log(1 - rnd() * 0.98) * 10);
    polar(r, rnd() * Math.PI * 2, gauss() * 0.35, rnd() < 0.7 ? 0 : 1, 0.42);
  }
  // the arms: young blue-white stars, wider with radius; one in twenty a bright giant
  for (let arm = 0; arm < 2; arm++) {
    for (let i = 0; i < 11000; i++) {
      const t = rnd() ** 0.85;
      const r = 3.5 + t * 38;
      polar(r + gauss() * 0.8, armTh(r, arm) + gauss() * (0.1 + 0.08 * t), gauss() * 0.25, 1, rnd() < 0.05 ? 3 : 0.8);
    }
  }
  // nebulae: pink knots strung along the arms' leading edges
  for (let n = 0; n < 140; n++) {
    const r = 6 + rnd() * 30;
    const th = armTh(r, n % 2) + 0.06;
    const cu = r * Math.cos(th);
    const cv = r * Math.sin(th);
    for (let i = 0; i < 22; i++) disc(cu + gauss() * 0.35, cv + gauss() * 0.35, gauss() * 0.15, 2, 1.6);
  }
  // dust: thin lanes along the arms' inner edges (the light behind them dimmed, seen from afar; a shadow, never a hole)
  for (let arm = 0; arm < 2; arm++) {
    for (let i = 0; i < 4000; i++) {
      const r = 5 + rnd() * 30;
      polar(r, armTh(r, arm) - 0.17 + gauss() * 0.035, gauss() * 0.12, 3, 1);
    }
  }
  // the arm round Saturn, star by star: from a quarter of a unit to seven (log-uniform, so every scale of the dive
  // into the arm has its stars), flat in the disc's plane; each a little brighter the farther out (the arm's surface as
  // bright as the rest of it from afar: no knot where the camera is going)
  for (let i = 0; i < 7000; i++) {
    const r = Math.exp(Math.log(0.25) + rnd() * (Math.log(7) - Math.log(0.25)));
    const th = rnd() * Math.PI * 2;
    const giant = rnd() < 0.05;
    disc(u0 + r * Math.cos(th), v0 + r * Math.sin(th), gauss() * (0.05 + 0.04 * r), rnd() < 0.7 ? 1 : 0, (giant ? 2.6 : 0.7) * (r / 7) ** 2);
  }
  const nGalaxy = X.length;
  // the Sun's neighbourhood: stars at every distance from Saturn (log-uniform, 0.003 to 5 units), so that at every
  // scale of the fall some are passing; none in the cone between the camera's last approach and Saturn
  for (let i = 0; i < 5000; i++) {
    const r = Math.exp(Math.log(0.003) + rnd() * (Math.log(5) - Math.log(0.003)));
    const ct = rnd() * 2 - 1;
    const st = Math.sqrt(1 - ct * ct);
    const ph = rnd() * Math.PI * 2;
    const x = r * st * Math.cos(ph);
    const y = r * st * Math.sin(ph);
    const z = r * ct;
    if (z < 0 && Math.hypot(x, y) < -z * 0.4 && r < 0.05) continue;
    // as bright, at its own distance, as any other (its light falls with the square of it): every scale of the fall
    // has its stars, and the field Saturn ends on is even, a few brighter than the rest
    add(x, y, z, rnd() < 0.45 ? 1 : 0, (0.35 + 2.4 * rnd() ** 4) * (r / 0.05) ** 2);
  }
  const nLocal = X.length;
  // the sky: a backdrop of faint stars in every direction
  for (let i = 0; i < 320; i++) {
    const ct = rnd() * 2 - 1;
    const st = Math.sqrt(1 - ct * ct);
    const ph = rnd() * Math.PI * 2;
    add(st * Math.cos(ph) * 5000, st * Math.sin(ph) * 5000, ct * 5000, rnd() < 0.5 ? 1 : 0, rnd() < 0.15 ? 2.4 : 1);
  }
  PTS = { x: Float64Array.from(X), y: Float64Array.from(Y), z: Float64Array.from(Z), k: Uint8Array.from(K), w: Float32Array.from(Wt), nGalaxy, nLocal, n: X.length };
  return PTS;
}

// ---------------------------------------------------------------------------------------------
// The light: four buffers (warm, blue, pink, dust), filled each frame and brought to the palette

const LIGHT = [new Float32Array(NPX), new Float32Array(NPX), new Float32Array(NPX)];
const DUST = new Float32Array(NPX);
const EXPOSE = 7200; // the light a galaxy's point of weight 1 gives at distance 1, in the buffers' units
// the Sun's neighbours' (their weight carries their distance): bright while they stream past, a calm field once the camera
// has stopped (a blizzard of equal stars is no sky)
const EXPOSE_NEAR = (b) => lerp(0.07, 0.014, smoothstep(2.8, 3.5, b));
const CAP = 46; // the most one point gives a pixel (a star never burns the frame white by itself)
const DUST_K = 5200;
const SKY = 1.5;
const LMAX = 56; // the light that reaches the ramp's top

function splat(buf, x, y, v) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  if (x0 < 0 || y0 < 0 || x0 >= VW - 1 || y0 >= VH - 1) {
    if (x0 >= 0 && y0 >= 0 && x0 < VW && y0 < VH) buf[y0 * VW + x0] += v;
    return;
  }
  const fx = x - x0;
  const fy = y - y0;
  const i = y0 * VW + x0;
  buf[i] += v * (1 - fx) * (1 - fy);
  buf[i + 1] += v * fx * (1 - fy);
  buf[i + VW] += v * (1 - fx) * fy;
  buf[i + VW + 1] += v * fx * fy;
}
function streak(buf, x0, y0, x1, y1, v) {
  const run = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.min(140, Math.ceil(run));
  // the light spread along the travel (never as faint as its share: a streak stays visible), brightest at its head
  const each = Math.min(CAP, v / n ** 0.7);
  for (let k = 0; k <= n; k++) {
    const f = k / n;
    const x = Math.round(lerp(x1, x0, f));
    const y = Math.round(lerp(y1, y0, f));
    if (x >= 0 && y >= 0 && x < VW && y < VH) buf[y * VW + x] += each * (1 - 0.7 * f);
  }
}

const CAM = { D: 1, cp: 1, sp: 0, cr: 1, sr: 0, cw: 1, sw: 0, vx: REST.x, vy: REST.y };
const CAM0 = { D: 1, cp: 1, sp: 0, cr: 1, sr: 0, cw: 1, sw: 0, vx: REST.x, vy: REST.y };
const S = [0, 0, 0];
const S0 = [0, 0, 0];
function gather(b) {
  const p = points();
  for (const L of LIGHT) L.fill(0);
  DUST.fill(0);
  const cam = cameraAt(b, CAM);
  const cam0 = cameraAt(b - FRAME, CAM0);
  const near = EXPOSE_NEAR(b);
  for (let i = 0; i < p.n; i++) {
    if (!project(p.x[i], p.y[i], p.z[i], cam, S)) continue;
    if (S[0] < -150 || S[0] > VW + 150 || S[1] < -150 || S[1] > VH + 150) continue;
    const k = p.k[i];
    const dz = S[2];
    if (i >= p.nLocal) {
      // the sky: no fall-off, never streaks
      splat(LIGHT[k], S[0], S[1], SKY * p.w[i]);
      continue;
    }
    if (k === 3) {
      // dust dims the light only from afar (near, its grains are no lane): a 2 x 2 footprint
      const v = ((p.w[i] * DUST_K) / (dz * dz)) * smoothstep(4, 20, dz);
      if (v > 0.001) {
        splat(DUST, S[0], S[1], v);
        splat(DUST, S[0] + 1, S[1] + 1, v);
      }
      continue;
    }
    const v = Math.min(CAP * 4, (p.w[i] * (i < p.nGalaxy ? EXPOSE : near)) / (dz * dz));
    if (v < 0.004) continue;
    if (project(p.x[i], p.y[i], p.z[i], cam0, S0)) {
      const run = Math.hypot(S[0] - S0[0], S[1] - S0[1]);
      if (run > 1.5) {
        streak(LIGHT[k], S0[0], S0[1], S[0], S[1], v);
        continue;
      }
    }
    splat(LIGHT[k], S[0], S[1], Math.min(CAP, v));
  }
}

// the glow real space has in a lens (the core's halo, the band's haze, a bright star's bloom): the light, a quarter of
// the frame's size, blurred twice and laid back over itself
const GW = VW / 4;
const GH = VH / 4;
const GLOW = [new Float32Array(GW * GH), new Float32Array(GW * GH), new Float32Array(GW * GH)];
const GTMP = new Float32Array(GW * GH);
const GLOW_K = 0.55;
function blur(g) {
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < GH; y++) {
      for (let x = 0; x < GW; x++) {
        let a = 0;
        for (let k = -2; k <= 2; k++) a += g[y * GW + clamp(x + k, 0, GW - 1)];
        GTMP[y * GW + x] = a / 5;
      }
    }
    for (let y = 0; y < GH; y++) {
      for (let x = 0; x < GW; x++) {
        let a = 0;
        for (let k = -2; k <= 2; k++) a += GTMP[clamp(y + k, 0, GH - 1) * GW + x];
        g[y * GW + x] = a / 5;
      }
    }
  }
}
function bloom() {
  for (let c = 0; c < 3; c++) {
    const L = LIGHT[c];
    const g = GLOW[c];
    g.fill(0);
    for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) g[(y >> 2) * GW + (x >> 2)] += Math.min(CAP, L[y * VW + x]) / 16;
    blur(g);
    for (let y = 0; y < VH; y++) {
      const gy = Math.min(GH - 1.001, Math.max(0, y / 4 - 0.375));
      const y0 = Math.floor(gy);
      const fy = gy - y0;
      for (let x = 0; x < VW; x++) {
        const gx = Math.min(GW - 1.001, Math.max(0, x / 4 - 0.375));
        const x0 = Math.floor(gx);
        const fx = gx - x0;
        const i = y0 * GW + x0;
        L[y * VW + x] += GLOW_K * ((g[i] * (1 - fx) + g[i + 1] * fx) * (1 - fy) + (g[i + GW] * (1 - fx) + g[i + GW + 1] * fx) * fy);
      }
    }
  }
}

// the palette's ramps, dark to light
const RAMPS = [
  [C.black, C.maroon, C.brown, C.tanShade, C.tan, C.cream, C.white], // warm
  [C.black, C.ink, C.slate, C.navy, C.steel, C.blue, C.fog, C.silver, C.white], // blue
  [C.black, C.maroon, C.purple, C.magenta, C.pink, C.cream, C.white], // pink
];
const LOG_MAX = Math.log1p(LMAX);
// the eye's adaptation: when the frame's light passes this mean, it is brought down to it (the dive into the arm, a
// sky full of light, never burns the frame white); never brought up
const MEAN = 1.1;
const TOE = 0.12;
// how much of the light a lane of dust lets through: at most it takes a little over half (the owner, 26 Oct: "dentro de
// la galaxia hay como una espiral negra": a lane is a shadow in the glow, as in the photographs, never a black spiral)
const dim = (dust) => 0.42 + 0.58 * Math.exp(-dust * 0.35);
export let lastExposure = 1; // (for checks)
function exposure() {
  const [Lw, Lb, Lp] = LIGHT;
  let tot = 0;
  for (let i = 0; i < NPX; i++) tot += (Lw[i] + Lb[i] + Lp[i]) * dim(DUST[i]);
  lastExposure = Math.min(1, MEAN / Math.max(1e-6, tot / NPX));
  return lastExposure;
}
function develop(d, expo) {
  const [Lw, Lb, Lp] = LIGHT;
  for (let y = 0; y < VH; y++) {
    for (let x = 0; x < VW; x++) {
      const i = y * VW + x;
      const sum = Lw[i] + Lb[i] + Lp[i];
      if (sum < 0.02) {
        d[i] = C.black;
        continue;
      }
      // (below the toe, black: the faintest glow is space, not a mesh of dither)
      const L = sum * dim(DUST[i]) * expo - TOE;
      if (L <= 0) {
        d[i] = C.black;
        continue;
      }
      const level = Math.min(1, Math.log1p(L) / LOG_MAX);
      const ramp = Lp[i] > 0.35 * sum ? RAMPS[2] : Lw[i] >= Lb[i] ? RAMPS[0] : RAMPS[1];
      const at = level * (ramp.length - 1);
      let k = Math.floor(at);
      if ((at - k) * 16 > ditherAt(x, y)) k++;
      d[i] = ramp[Math.min(ramp.length - 1, k)];
    }
  }
}

// three of the galaxy's giants catch the light as the camera starts, on the bells: a four-point glint riding with them
const GLINT_PTS = [];
function glints(L, b) {
  const p = points();
  if (!GLINT_PTS.length) {
    // bright arm stars on the frame at the start, near its thirds
    const cam = cameraAt(0, {});
    for (const [wx, wy] of [[70, 120], [150, 165], [92, 200]]) {
      let best = -1;
      let bd = Infinity;
      for (let i = 0; i < p.nGalaxy; i++) {
        if (p.k[i] !== 1 || p.w[i] < 2) continue;
        if (!project(p.x[i], p.y[i], p.z[i], cam, S)) continue;
        const dd = Math.hypot(S[0] - wx, S[1] - wy);
        if (dd < bd) {
          bd = dd;
          best = i;
        }
      }
      GLINT_PTS.push(best);
    }
  }
  const cam = cameraAt(b, CAM);
  Q.glints.forEach((g, n) => {
    const t = seg(b, g, 0.9);
    const i = GLINT_PTS[n];
    if (t <= 0 || t >= 1 || i < 0 || !project(p.x[i], p.y[i], p.z[i], cam, S)) return;
    const x = Math.round(S[0]);
    const y = Math.round(S[1]);
    const len = Math.round(2 + 7 * Math.sin(Math.PI * t));
    for (let j = 1; j <= len; j++) {
      const c = j < len * 0.4 ? C.white : j < len * 0.75 ? C.silver : C.fog;
      L.plot(x + j, y, c);
      L.plot(x - j, y, c);
      L.plot(x, y + j, c);
      L.plot(x, y - j, c);
    }
    L.plot(x, y, C.white);
  });
}

// a few of the stars at rest twinkle now and then once the camera has stopped (a four-point glint for a third of a
// beat, each star at its own time)
const TWINKLE = [[30, 60], [188, 96], [24, 300], [194, 330], [60, 360], [170, 24], [140, 290], [14, 190]];
function twinkles(L, b) {
  if (b < Q.lock - 0.5) return;
  TWINKLE.forEach(([x, y], i) => {
    const t = ((b * 0.8 + i * 0.37) % 2) / 0.4;
    if (t >= 1) return;
    const a = Math.sin(Math.PI * t);
    const len = Math.round(1 + 3 * a);
    for (let j = 1; j <= len; j++) {
      const c = j === 1 ? C.white : C.fog;
      L.plot(x + j, y, c);
      L.plot(x - j, y, c);
      L.plot(x, y + j, c);
      L.plot(x, y - j, c);
    }
    L.plot(x, y, C.white);
  });
}

// ---------------------------------------------------------------------------------------------
// Saturn: the emblem's own planet, at the size the camera's distance gives it, lit from the Sun behind it; its moon runs
// a last orbit as it settles and parks lower left, as in the emblem

// the light: the Sun is behind Saturn the whole way in (never seen: no glare, no flash; the owner, 26 Oct: "que no meta
// un destello"), up and to the right, so the planet comes in as a thin crescent on that limb with its rings lit; as the
// camera swings round to that side (SWING) the crescent widens and day comes round the planet, through the emblem's own
// first light to the channel's key light (cosmos.js L0, L1: the title sequence's dawn)
const unit = (v) => {
  const n = Math.hypot(...v);
  return v.map((c) => c / n);
};
const LS = unit([0.7, 0.4, -0.6]);
const LA = unit(L0);
const LB = unit(L1);
const arc = (u, v) => Math.acos(clamp(u[0] * v[0] + u[1] * v[1] + u[2] * v[2], -1, 1));
const ARC1 = arc(LS, LA);
const ARC2 = arc(LA, LB);
// from the stroke to the hit, turning at an even pace along the whole way round (the light's every degree as long as the
// next: the crescent widens and day crosses the planet without a lurch)
const DAWN = (b) => easeInOutSine(seg(b, Q.sun, Q.lock - Q.sun));
const LV = [0, 0, 0];
function lightAt(b) {
  const s = DAWN(b) * (ARC1 + ARC2);
  const [u, v, om, t] = s <= ARC1 ? [LS, LA, ARC1, s / ARC1] : [LA, LB, ARC2, (s - ARC1) / ARC2];
  const k0 = Math.sin((1 - t) * om) / Math.sin(om);
  const k1 = Math.sin(t * om) / Math.sin(om);
  for (let k = 0; k < 3; k++) LV[k] = u[k] * k0 + v[k] * k1;
  return LV;
}
// the Sun's light through the edge of the planet's air while it is behind it: a thin bright line along the limb toward
// it, the crescent's own edge (as the probes see a backlit Saturn), fading as day comes round; never over the front of
// the rings
function limbLight(L, sat, light) {
  const R = sat.R;
  const k = smoothstep(0.08, 0.45, -light[2]) * smoothstep(3, 9, R);
  if (k <= 0.02) return;
  const th0 = Math.atan2(-light[1], light[0]);
  const span = 1.3;
  for (const [dr, top] of [[0.6, 1], [1.6, 0.45]]) {
    const r = R - dr;
    if (r < 2) continue;
    const steps = Math.ceil(r * span * 3);
    for (let i = 0; i <= steps; i++) {
      const a = -span + (2 * span * i) / steps;
      const x = Math.round(sat.cx + Math.cos(th0 + a) * r);
      const y = Math.round(sat.cy + Math.sin(th0 + a) * r);
      const dx = x - sat.cx;
      const dy = y - sat.cy;
      const u = dx * CTL + dy * STL;
      const v = -dx * STL + dy * CTL;
      const e = Math.sqrt(u * u + (v / RK) * (v / RK)) / R;
      if (v > 0 && e >= RING_IN && e <= RING_OUT) continue; // (the front of the rings: v > 0, cosmostitles.js planet())
      const f = Math.cos((a / span) * (Math.PI / 2)) * k * top;
      if (f * 16 <= ditherAt(x, y)) continue;
      L.plot(x, y, f > 0.62 ? C.cream : f > 0.3 ? C.tan : C.tanShade);
    }
  }
}
const SAT = { cx: 0, cy: 0, R: 0 };
function saturnAt(b) {
  SAT.cx = VPX(b);
  SAT.cy = VPY(b);
  SAT.R = (SATURN_R * F) / Math.exp(LN_D(b));
  return SAT;
}
const PRL = Math.round(PR0 * ZOOM);
const TH0 = TH1 - Math.PI * 1.4;
const MOON = (b) => easeOutQuint(seg(b, 3.9, Q.lock - 3.9 + 0.1));
const OP = [0, 0, 0];
function moonAndTrail(L, b, sat, front) {
  const R = sat.R;
  if (b < 3.9) return;
  const k = (R / PRL) * ZOOM;
  const th = TH0 + (TH1 - TH0) * MOON(b);
  const len = 1.2 * (1 - easeOutQuint(seg(b, 4.6, 0.8)));
  if (len > 0.02) {
    const steps = Math.ceil(len * 60);
    for (let s = 1; s <= steps; s++) {
      orbit(th - (s / steps) * len, k, OP);
      if ((OP[2] > 0) !== front) continue;
      if (!front && OP[0] * OP[0] + OP[1] * OP[1] < (R + 1) * (R + 1)) continue;
      L.plot(Math.round(sat.cx + OP[0]), Math.round(sat.cy + OP[1]), C.magenta);
    }
  }
  orbit(th, k, OP);
  if ((OP[2] > 0) !== front) return;
  if (!front && OP[0] * OP[0] + OP[1] * OP[1] < (R + 2) * (R + 2)) return;
  moon(L, Math.round(sat.cx + OP[0]), Math.round(sat.cy + OP[1]));
}
function saturn(L, b, sat, light) {
  const R = sat.R;
  if (R < 0.8) return;
  const x = Math.round(sat.cx);
  const y = Math.round(sat.cy);
  if (R < 2.5) {
    // still a point of light ahead (the crescent's glint)
    L.plot(x, y, C.cream);
    if (R > 1.5) {
      L.plot(x + 1, y, C.tan);
      L.plot(x, y + 1, C.tan);
    }
    return;
  }
  moonAndTrail(L, b, sat, false);
  planet(L, sat.cx, sat.cy, R, light, true);
  planet(L, sat.cx, sat.cy, R, light, false);
  limbLight(L, sat, light);
  moonAndTrail(L, b, sat, true);
}

// ---------------------------------------------------------------------------------------------
// The logotype: COSMOS in the channel's 5x7 face at four times its size, each of its pixels a 4 x 4 block with its
// outer corners rounded where the letter turns; filled top to bottom from white through cream and pink to magenta
// (Saturn's light over the programme's colour), a white edge along its tops and a purple one along its undersides, a
// black outline and a violet glow round it. The letters rise in one after another with a little overshoot; on the hit
// a shine runs across them. DESK under it at twice the size, its letters spaced, between two magenta rules.

const SC = 4;
const TOP = 214; // COSMOS's cap line
const DESK_Y = 252;
const ROWS = 7 * SC;
let LETTERS = null;
function letters() {
  if (LETTERS) return LETTERS;
  const glyphs = [...'COSMOS'].map((ch) => textPixels(ch, 'body'));
  const width = glyphs.reduce((a, g) => a + g.width, 0) + (glyphs.length - 1);
  let cx = Math.round(VW / 2 - (width * SC) / 2);
  LETTERS = glyphs.map((g, i) => {
    const l = { x: cx, w: g.width, pixels: g.pixels, on: new Set(g.pixels.map(([x, y]) => `${x},${y}`)), at: Q.title + 0.06 * i };
    cx += (g.width + 1) * SC;
    return l;
  });
  return LETTERS;
}
const MASK = new Uint8Array(NPX); // 0 empty, else 1 + the row within the letters (0..27)
const easeBack = (t) => {
  const c = 1.7;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
};
function logotype(L, b) {
  if (b < Q.title) return;
  const ls = letters();
  const x0 = ls[0].x - 4;
  const x1 = ls.at(-1).x + ls.at(-1).w * SC + 4;
  const y0 = TOP - 4;
  const y1 = TOP + ROWS + 22;
  for (let y = y0; y <= y1; y++) MASK.fill(0, y * VW + x0, y * VW + x1 + 1);
  for (const l of ls) {
    const p = seg(b, l.at, 0.38);
    if (p <= 0) continue;
    const dy = Math.round((1 - easeBack(p)) * 18);
    for (const [gx, gy] of l.pixels) {
      const bx = l.x + gx * SC;
      const by = TOP + gy * SC + dy;
      for (let j = 0; j < SC; j++) {
        for (let i = 0; i < SC; i++) {
          // round a block's outer corner where the letter turns (no neighbour on either side of that corner)
          const cxn = i === 0 ? -1 : i === SC - 1 ? 1 : 0;
          const cyn = j === 0 ? -1 : j === SC - 1 ? 1 : 0;
          if (cxn && cyn && !l.on.has(`${gx + cxn},${gy}`) && !l.on.has(`${gx},${gy + cyn}`)) continue;
          const x = bx + i;
          const y = by + j;
          if (x < x0 || y < y0 || x > x1 || y > y1) continue;
          MASK[y * VW + x] = 1 + clamp(gy * SC + j, 0, ROWS - 1);
        }
      }
    }
  }
  const shine = seg(b, Q.lock + 0.1, 0.6);
  const sx = lerp(x0 - 30, x1 + 30, easeInOut(shine));
  const d = L.d;
  const m = (x, y) => (x >= x0 && y >= y0 && x <= x1 && y <= y1 ? MASK[y * VW + x] : 0);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const v = MASK[y * VW + x];
      if (v) {
        const r = v - 1;
        let c = r < 2 ? C.white : r < 10 ? C.cream : r < 18 ? C.pink : r < 25 ? C.magenta : C.purple;
        if (!m(x, y - 1)) c = C.white;
        else if (!m(x, y + 1) && r > 4) c = C.purple;
        if (shine > 0 && shine < 1 && Math.abs(x + (y - TOP) * 0.6 - sx) < 3.5) c = C.white;
        d[y * VW + x] = c;
        continue;
      }
      if (m(x - 1, y) || m(x + 1, y) || m(x, y - 1) || m(x, y + 1)) d[y * VW + x] = C.black;
      else if ((m(x - 2, y) || m(x + 2, y) || m(x, y - 2) || m(x, y + 2) || m(x - 1, y - 1) || m(x + 1, y + 1) || m(x - 1, y + 1) || m(x + 1, y - 1)) && ditherAt(x, y) < 7) d[y * VW + x] = C.purple;
    }
  }
}
// DESK: wiped out from its middle, its letters spaced, a magenta rule each side
function desk(ctx, b) {
  const p = easeOutQuint(seg(b, Q.title + 0.4, 0.4));
  if (p <= 0) return;
  const word = [...'DESK'];
  const gap = 6;
  const ws = word.map((ch) => measureText(ch, 2));
  const total = ws.reduce((a, w) => a + w, 0) + gap * (word.length - 1);
  const x0 = Math.round(VW / 2 - total / 2);
  const ls = letters();
  const left = ls[0].x;
  const right = ls.at(-1).x + ls.at(-1).w * SC;
  const half = Math.round(((right - left) / 2) * p);
  ctx.save();
  try {
    ctx.beginPath();
    ctx.rect(VW / 2 - half, DESK_Y - 2, half * 2, 20);
    ctx.clip();
    let x = x0;
    word.forEach((ch, i) => {
      drawText(ctx, ch, x, DESK_Y, { color: P.white, scale: 2 });
      x += ws[i] + gap;
    });
    ctx.fillStyle = P.magenta;
    ctx.fillRect(left, DESK_Y + 6, x0 - 8 - left, 2);
    ctx.fillRect(x0 + total + 8, DESK_Y + 6, right - (x0 + total + 8), 2);
  } finally {
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------------------------

const LAYER = new Layer('cosmos-intro', VW, VH);

/** The intro's frame at t seconds (the whole frame). */
export function drawCosmosIntro(ctx, t) {
  const b = t / BEAT;
  const L = LAYER;
  L.begin(C.black);
  gather(b);
  const expo = exposure();
  bloom();
  develop(L.d, expo);
  glints(L, b);
  twinkles(L, b);
  const sat = saturnAt(b);
  const light = lightAt(b);
  saturn(L, b, sat, light);
  logotype(L, b);
  L.end(ctx);
  desk(ctx, b);
}

export const COSMOS_INTRO = Object.freeze({
  id: 'cosmos',
  cues: Q,
  draw: drawCosmosIntro,
  warm: () => [points(), letters()],
});
/** Saturn's radius on the frame at beat b (for checks). */
export const cosmosIntroSaturn = (b) => (SATURN_R * F) / Math.exp(LN_D(b));
/** The light on Saturn at beat b, a unit vector toward the Sun (for checks). */
export const cosmosIntroLight = (b) => [...lightAt(b)];
/** Saturn's centre on the frame at beat b (for checks). */
export const cosmosIntroSaturnAt = (b) => ({ x: VPX(b), y: VPY(b) });
/** The logotype's box at rest (for checks): { x0, x1, y0, y1 } of COSMOS and DESK together. */
export function cosmosIntroTitle() {
  const ls = letters();
  return { x0: ls[0].x - 1, x1: ls.at(-1).x + ls.at(-1).w * SC, y0: TOP - 1, y1: DESK_Y + 14 };
}
