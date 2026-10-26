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
//   SUN     2.6-3.3       the Sun's neighbourhood: its stars rush past; the Sun itself, close by, flares and fills the
//                         frame with its light (the stroke, beat 3)
//   SATURN  3-5           Saturn swells out of the glare to the emblem's place, lit from the Sun behind the camera,
//                         its moon running a last orbit; COSMOS rises in under it letter by letter, the programme's
//                         logotype, DESK between two rules under that (beat 4.6); on the hit a shine runs across it
//   LOCK    5-6           the emblem and the title over the galaxy's band; the cut on the sixth beat
//
// How it is drawn: about 80,000 points in space (the galaxy's, the Sun's neighbourhood's, the sky's) seen through one
// lens, the camera's distance on a logarithmic track (powers of ten: 120 units to 0.0003), the world turning about
// Saturn. Each point gives the light a star at its distance would (falling as the square of the distance, so the
// galaxy's glow holds its brightness as it resolves into stars), into three light buffers by colour and one of dust;
// a point that moves draws its travel since the last frame, its light spread along it. The light is then brought to
// the channel's palette on three ramps (warm, blue, pink) through the screen's Bayer matrix: a photograph's gradients
// in 32 colours. Saturn is the title sequence's own renderer (cosmostitles.js planet()), so the intro lands on the
// emblem itself.
import { P } from '../../palette.js';
import { textPixels, drawText, measureText } from '../../font.js';
import { u32, clamp, lerp, seg, smoothstep, easeOutQuint, easeInOut } from '../../gfx/index.js';
import { mulberry32 } from '../../util.js';
import { ZOOM } from './kit.js';
import { PR0, TH1 } from './cosmos.js';
import { track, Layer, ditherAt } from './seq.js';
import { planet, orbit, moon, sunBurst } from './cosmostitles.js';
import { INTRO_CUES } from './cues.js';

const VW = 216;
const VH = 384;
const NPX = VW * VH;
const Q = INTRO_CUES.cosmos;
const BEAT = 60 / Q.bpm;
const FRAME = 1 / 30 / BEAT; // one frame, in beats
const C = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, u32(v)]));

// ---------------------------------------------------------------------------------------------
// The camera. Saturn at the origin, the camera on the axis behind it looking at it from `D`, which falls on a
// logarithmic track: slowly while the galaxy can be read, fast through the arm and the Sun's neighbourhood, slowly again
// as Saturn settles. The world turns about Saturn as the camera falls (a pitch that brings the galaxy's disc edge-on, so
// it ends as a band through the emblem, and a roll that lays the band on a slant).

const VP = { x: 108, y: 150 }; // Saturn's place on the frame: the emblem's
const F = 175; // px: the lens
const SATURN_R = 5.65e-5; // Saturn's radius in world units: 38 px at the lock
const LN_D = track([
  [-1, Math.log(74)], [0, Math.log(57)], [1, Math.log(28)], [1.75, Math.log(8)], [2.4, Math.log(0.35)],
  [Q.sun, Math.log(0.004)], [4, Math.log(0.0007)], [Q.lock, Math.log(0.00026)], [Q.cut + 1, Math.log(0.000236)],
]);
const INC = (62 * Math.PI) / 180; // the disc's tilt to the camera at the start
const CI = Math.cos(INC);
const SI = Math.sin(INC);
const PITCH = -(Math.PI / 2 - INC); // to edge-on
const ROLL = -0.5;
const TURN = (b) => easeInOut(seg(b, 1.5, 2.6));
function cameraAt(b, out) {
  const e = TURN(b);
  out.D = Math.exp(LN_D(b));
  out.cp = Math.cos(PITCH * e);
  out.sp = Math.sin(PITCH * e);
  out.cr = Math.cos(ROLL * e);
  out.sr = Math.sin(ROLL * e);
  return out;
}
// a point (world, Saturn at the origin) on the frame: [x, y, distance in front of the camera], false behind it
function project(x, y, z, cam, out) {
  const y1 = y * cam.cp - z * cam.sp;
  const z1 = y * cam.sp + z * cam.cp;
  const dz = z1 + cam.D;
  if (dz <= cam.D * 1e-3) return false;
  const x2 = x * cam.cr - y1 * cam.sr;
  const y2 = x * cam.sr + y1 * cam.cr;
  out[0] = VP.x + (x2 * F) / dz;
  out[1] = VP.y + (y2 * F) / dz;
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
  // dust: lanes along the arms' inner edges (the light behind them dimmed, seen from afar)
  for (let arm = 0; arm < 2; arm++) {
    for (let i = 0; i < 6000; i++) {
      const r = 5 + rnd() * 30;
      polar(r, armTh(r, arm) - 0.2 + gauss() * 0.06, gauss() * 0.15, 3, 1);
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
    add(x, y, z, rnd() < 0.45 ? 1 : 0, (0.5 + rnd() * 1.5) * (r / 0.05) ** 2);
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
const EXPOSE_NEAR = 0.012; // the Sun's neighbours' (their weight carries their distance: a field of stars, not a blizzard)
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
  const each = Math.min(CAP, v / n ** 0.85);
  for (let k = 0; k <= n; k++) {
    const f = k / n;
    const x = Math.round(lerp(x1, x0, f));
    const y = Math.round(lerp(y1, y0, f));
    if (x >= 0 && y >= 0 && x < VW && y < VH) buf[y * VW + x] += each * (1 - 0.7 * f);
  }
}

const CAM = { D: 1, cp: 1, sp: 0, cr: 1, sr: 0 };
const CAM0 = { D: 1, cp: 1, sp: 0, cr: 1, sr: 0 };
const S = [0, 0, 0];
const S0 = [0, 0, 0];
function gather(b) {
  const p = points();
  for (const L of LIGHT) L.fill(0);
  DUST.fill(0);
  const cam = cameraAt(b, CAM);
  const cam0 = cameraAt(b - FRAME, CAM0);
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
    const v = Math.min(CAP * 4, (p.w[i] * (i < p.nGalaxy ? EXPOSE : EXPOSE_NEAR)) / (dz * dz));
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
export let lastExposure = 1; // (for checks)
function develop(d) {
  const [Lw, Lb, Lp] = LIGHT;
  let tot = 0;
  for (let i = 0; i < NPX; i++) tot += (Lw[i] + Lb[i] + Lp[i]) * Math.exp(-DUST[i] * 0.5);
  const expo = Math.min(1, MEAN / Math.max(1e-6, tot / NPX));
  lastExposure = expo;
  for (let y = 0; y < VH; y++) {
    for (let x = 0; x < VW; x++) {
      const i = y * VW + x;
      const sum = Lw[i] + Lb[i] + Lp[i];
      if (sum < 0.02) {
        d[i] = C.black;
        continue;
      }
      const L = sum * Math.exp(-DUST[i] * 0.5) * expo;
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

// ---------------------------------------------------------------------------------------------
// The Sun: close beside the camera's path, just before Saturn. It grows from a bright star to a disc of light as the
// camera nears it, flares as it passes (beat 3), and its glare fades over a third of a beat, Saturn swelling out of it.

const SUN = [0.00011, -0.00009, -0.004];
function sun(L, b) {
  const cam = cameraAt(Math.min(b, Q.sun - 0.02), CAM);
  if (!project(SUN[0], SUN[1], SUN[2], cam, S)) return;
  // (no nearer than this: where it was as it passed, its glare staying there as it fades)
  const dz = Math.max(S[2], 0.0009);
  const sx = VP.x + ((S[0] - VP.x) * S[2]) / dz;
  const sy = VP.y + ((S[1] - VP.y) * S[2]) / dz;
  const fade = b < Q.sun ? 1 : (1 - seg(b, Q.sun, 0.36)) ** 1.5;
  const R3 = Math.min(98, 0.09 / dz) * fade;
  if (R3 < 0.6) return;
  // a bloom of solid rings: white in cream in yellow, its edge broken through the matrix
  const R2 = R3 * 0.62;
  const R1 = R3 * 0.34;
  const d = L.d;
  for (let y = Math.max(0, Math.floor(sy - R3)); y <= Math.min(VH - 1, Math.ceil(sy + R3)); y++) {
    for (let x = Math.max(0, Math.floor(sx - R3)); x <= Math.min(VW - 1, Math.ceil(sx + R3)); x++) {
      const r = Math.hypot(x - sx, y - sy);
      if (r < R1) d[y * VW + x] = C.white;
      else if (r < R2) d[y * VW + x] = C.cream;
      else if (r < R3 && ditherAt(x, y) < 16 * (1 - (r - R2) / (R3 - R2)) * 0.9) d[y * VW + x] = C.yellow;
    }
  }
  sunBurst(L, Math.round(sx), Math.round(sy), Math.min(1, R3 / 40), 72);
}

// ---------------------------------------------------------------------------------------------
// Saturn: the emblem's own planet, lit from the Sun now behind the camera (up and to the right, in front), at the size
// the camera's distance gives it; its moon runs a last orbit as it settles and parks lower left, as in the emblem

const LIGHT_DIR = (() => {
  const v = [0.48, 0.42, 0.77];
  const n = Math.hypot(...v);
  return v.map((c) => c / n);
})();
const PRL = Math.round(PR0 * ZOOM);
const TH0 = TH1 - Math.PI * 1.4;
const MOON = (b) => easeOutQuint(seg(b, 3.9, Q.lock - 3.9 + 0.1));
const OP = [0, 0, 0];
function moonAndTrail(L, b, R, front) {
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
      L.plot(Math.round(VP.x + OP[0]), Math.round(VP.y + OP[1]), C.magenta);
    }
  }
  orbit(th, k, OP);
  if ((OP[2] > 0) !== front) return;
  if (!front && OP[0] * OP[0] + OP[1] * OP[1] < (R + 2) * (R + 2)) return;
  moon(L, Math.round(VP.x + OP[0]), Math.round(VP.y + OP[1]));
}
function saturn(L, b) {
  const R = (SATURN_R * F) / Math.exp(LN_D(b));
  if (R < 0.8) return;
  if (R < 2.5) {
    // still a point of light ahead
    L.plot(VP.x, VP.y, C.cream);
    if (R > 1.5) {
      L.plot(VP.x + 1, VP.y, C.tan);
      L.plot(VP.x, VP.y + 1, C.tan);
    }
    return;
  }
  moonAndTrail(L, b, R, false);
  planet(L, VP.x, VP.y, R, LIGHT_DIR, true);
  planet(L, VP.x, VP.y, R, LIGHT_DIR, false);
  moonAndTrail(L, b, R, true);
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
    const l = { x: cx, w: g.width, pixels: g.pixels, on: new Set(g.pixels.map(([x, y]) => `${x},${y}`)), at: Q.title + 0.09 * i };
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
    const p = seg(b, l.at, 0.5);
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
  const shine = seg(b, Q.lock, 0.6);
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
  const p = easeOutQuint(seg(b, 4.6, 0.45));
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
  develop(L.d);
  glints(L, b);
  saturn(L, b);
  sun(L, b);
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
/** The logotype's box at rest (for checks): { x0, x1, y0, y1 } of COSMOS and DESK together. */
export function cosmosIntroTitle() {
  const ls = letters();
  return { x0: ls[0].x - 1, x1: ls.at(-1).x + ls.at(-1).w * SC, y0: TOP - 1, y1: DESK_Y + 14 };
}
