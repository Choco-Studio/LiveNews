// The canvas25d rig: turns a performance description into a pose for any
// instant t, then solves it into a skeleton for character.js.
//
// Layers, evaluated in order and all pure functions of t (so any frame can be
// rendered on its own, deterministically):
//   1. rest pose                       (gestures.js REST)
//   2. emotion                         face presets, crossfaded 0.45 s
//   3. gestures                        keyframe tracks; a gesture fades in over
//                                      its overlap with the previous one, arm
//                                      channels override, body/head/face add
//   4. look at partner                 eyes lead, head follows
//   5. idle (always on)                breathing, weight shift, head micro-motion,
//                                      seeded blinks 2-6 s (some doubles), saccades
//   6. speech                          visemes → mouth, emphasis → brows + small nods
// Then partner space is mirrored to screen space for whoever sits on the
// right, and both arms are solved with 3D two-bone IK (elbow pole hints).
import { REST, GESTURES, ARM_CHANNELS } from './gestures.js';
import { speechFrame, mouthParams } from './visemes.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

// ---------------------------------------------------------------------------
// Keyframe tracks

const TENSION = 0.85;

function tangent(keys, k, comp) {
  const key = keys[k];
  if (key[2] === 's' || k === 0 || k === keys.length - 1) return 0;
  const a = keys[k - 1], b = keys[k + 1];
  const va = comp < 0 ? a[1] : a[1][comp], vb = comp < 0 ? b[1] : b[1][comp];
  return (TENSION * (vb - va)) / (b[0] - a[0]);
}

function evalComp(keys, t, comp, k) {
  const a = keys[k], b = keys[k + 1];
  const h = b[0] - a[0];
  const u = (t - a[0]) / h;
  const u2 = u * u, u3 = u2 * u;
  const va = comp < 0 ? a[1] : a[1][comp], vb = comp < 0 ? b[1] : b[1][comp];
  const ma = tangent(keys, k, comp), mb = tangent(keys, k + 1, comp);
  return (2 * u3 - 3 * u2 + 1) * va + (u3 - 2 * u2 + u) * h * ma + (-2 * u3 + 3 * u2) * vb + (u3 - u2) * h * mb;
}

/** Value of a track at time t; arrays are written into `out`. */
export function evalTrack(keys, t, out) {
  const n = keys.length;
  const arr = Array.isArray(keys[0][1]);
  if (t <= keys[0][0] || n === 1) return arr ? copy(out, keys[0][1]) : keys[0][1];
  if (t >= keys[n - 1][0]) return arr ? copy(out, keys[n - 1][1]) : keys[n - 1][1];
  let k = 0;
  while (k < n - 2 && keys[k + 1][0] <= t) k++;
  if (!arr) return evalComp(keys, t, -1, k);
  for (let c = 0; c < keys[0][1].length; c++) out[c] = evalComp(keys, t, c, k);
  return out;
}

function copy(out, v) {
  for (let i = 0; i < v.length; i++) out[i] = v[i];
  return out;
}

// ---------------------------------------------------------------------------
// Deterministic randomness

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth 1D noise in -1..1 made of incommensurate sines (no allocation, any t). */
function wobble(t, seed) {
  return 0.5 * Math.sin(t * 1.13 + seed * 1.7) + 0.3 * Math.sin(t * 2.31 + seed * 2.9) + 0.2 * Math.sin(t * 3.77 + seed * 4.3);
}

const SCHEDULES = new Map();
/** Blink and saccade timetables for a seed, generated once for 15 minutes. */
function schedule(seed, persona) {
  const key = `${seed}|${persona.blinkMin}|${persona.blinkMax}`;
  let s = SCHEDULES.get(key);
  if (s) return s;
  const rnd = mulberry(seed * 7919 + 13);
  const blinks = [];
  let t = 0.6 + rnd() * 1.5;
  while (t < 900) {
    blinks.push(t);
    if (rnd() < 0.2) blinks.push(t + 0.27 + rnd() * 0.06); // a double blink now and then
    t += persona.blinkMin + rnd() * (persona.blinkMax - persona.blinkMin);
  }
  const sacc = [];
  t = 0;
  let x = 0, y = 0;
  while (t < 900) {
    sacc.push(t, x, y);
    t += 0.5 + rnd() * 1.9;
    // mostly small fixations near the lens, sometimes a slightly bigger glance
    const big = rnd() < 0.18;
    x = (rnd() - 0.5) * (big ? 1.1 : 0.45);
    y = (rnd() - 0.5) * (big ? 0.6 : 0.25);
  }
  s = { blinks, sacc };
  SCHEDULES.set(key, s);
  return s;
}

function upperBound(arr, t, stride = 1) {
  let lo = 0, hi = arr.length / stride - 1;
  if (hi < 0 || arr[0] > t) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (arr[mid * stride] <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Eyelid closure 0..1 for a blink that started dt seconds ago: fast close, short hold, slower open. */
function blinkCurve(dt) {
  if (dt < 0) return 0;
  if (dt < 0.06) return smooth(dt / 0.06);
  if (dt < 0.1) return 1;
  if (dt < 0.22) return 1 - smooth((dt - 0.1) / 0.12);
  return 0;
}

// ---------------------------------------------------------------------------
// Emotions (face presets; mouth stays with speech)

export const EMOTIONS = {
  neutral: { brow: 0, browIn: 0, smile: 0, squint: 0, lid: 0, wide: 0 },
  happy: { brow: 0.25, browIn: 0, smile: 0.62, squint: 0.35, lid: 0, wide: 0 },
  serious: { brow: -0.1, browIn: 0.55, smile: -0.12, squint: 0, lid: 0.22, wide: 0 },
  surprised: { brow: 0.95, browIn: -0.1, smile: 0, squint: 0, lid: 0, wide: 0.6 },
  sad: { brow: 0.1, browIn: -0.75, smile: -0.4, squint: 0, lid: 0.3, wide: 0 },
  thinking: { brow: 0.1, browIn: 0.25, smile: -0.05, squint: 0.1, lid: 0.15, wide: 0, lookY: -0.45, lookX: -0.4 },
};
const FACE_KEYS = ['brow', 'browIn', 'smile', 'squint', 'lid', 'wide', 'lookX', 'lookY'];

// ---------------------------------------------------------------------------
// Pose evaluation

function newChannels() {
  const c = {};
  for (const [k, v] of Object.entries(REST)) c[k] = Array.isArray(v) ? v.slice() : v;
  c.wide = 0;
  c.blink = 0;
  c.breathe = 0;
  return c;
}

function resetChannels(c) {
  for (const [k, v] of Object.entries(REST)) {
    if (Array.isArray(v)) copy(c[k], v);
    else c[k] = v;
  }
  c.wide = 0;
  c.blink = 0;
  c.breathe = 0;
}

const TMP = [0, 0, 0, 0, 0];
const ADD_SKIP = new Set(ARM_CHANNELS);

/** Weight of a gesture instance at t: fades in across its overlap with the one before. */
function gestureWeight(list, i, t) {
  const g = list[i];
  const def = GESTURES[g.name];
  const speed = g.speed || 1;
  const dur = def.dur / speed;
  const lt = t - g.t0;
  if (lt < 0 || lt > dur) return 0;
  let fadeIn = 0.12;
  if (i > 0) {
    const p = list[i - 1];
    const pEnd = p.t0 + GESTURES[p.name].dur / (p.speed || 1);
    if (pEnd > g.t0) fadeIn = Math.max(fadeIn, Math.min(0.6, pEnd - g.t0));
  }
  return smooth(lt / fadeIn) * smooth((dur - lt) / 0.08);
}

/**
 * Performance description:
 *   { side: +1 partner on screen-right | -1, seed, gestures: [{ name, t0, speed? }],
 *     emotions: [{ t0, name }], speech: buildSpeech(...) | null, look: [{ t0, t1 }] partner looks,
 *     listen: bool (no speech: small listening nods), gain: mouth openness }
 */
export function evaluate(L, perf, t, c = newChannels()) {
  resetChannels(c);
  const persona = L.persona;
  const seed = perf.seed ?? (L.id.length * 31 + 7);

  // 2. emotion crossfade
  const emos = perf.emotions || [];
  let cur = EMOTIONS.neutral, prev = EMOTIONS.neutral, k = 1;
  for (let i = 0; i < emos.length; i++) {
    if (emos[i].t0 > t) break;
    prev = i > 0 ? EMOTIONS[emos[i - 1].name] || EMOTIONS.neutral : EMOTIONS.neutral;
    cur = EMOTIONS[emos[i].name] || EMOTIONS.neutral;
    k = smooth((t - emos[i].t0) / 0.45);
  }
  for (const key of FACE_KEYS) c[key] += (prev[key] || 0) + ((cur[key] || 0) - (prev[key] || 0)) * k;
  c.smile += persona.smile; // a pleasant resting face per persona

  // 3. gestures
  const list = perf.gestures || [];
  let gestLook = 0;
  for (let i = 0; i < list.length; i++) {
    const w = gestureWeight(list, i, t);
    if (w <= 0) continue;
    const g = list[i];
    const def = GESTURES[g.name];
    const lt = (t - g.t0) * (g.speed || 1);
    for (const [ch, keys] of Object.entries(def.tracks)) {
      const rest = REST[ch];
      if (ADD_SKIP.has(ch)) {
        if (Array.isArray(rest)) {
          const v = evalTrack(keys, lt, TMP);
          const dst = c[ch];
          for (let q = 0; q < dst.length; q++) dst[q] += (v[q] - dst[q]) * w;
        } else c[ch] += (evalTrack(keys, lt) - c[ch]) * w;
      } else {
        c[ch] += (evalTrack(keys, lt) - rest) * w;
        if (ch === 'lookX') gestLook = Math.max(gestLook, w);
      }
    }
  }

  // 4. look at the partner (eyes lead by ~0.12 s, head follows)
  for (const lk of perf.look || []) {
    const inE = smooth((t - lk.t0) / 0.12) * (1 - smooth((t - lk.t1 + 0.05) / 0.15));
    const inH = smooth((t - lk.t0 - 0.06) / 0.38) * (1 - smooth((t - lk.t1) / 0.42));
    c.lookX += 0.8 * inE;
    c.yaw += 0.4 * inH;
    c.lean += 0.015 * inH;
    c.hx += 0.4 * inH;
    gestLook = Math.max(gestLook, inE);
  }

  // 5. idle layer
  const p = persona;
  const br = 0.5 - 0.5 * Math.cos((t * 2 * Math.PI) / (4.1 + 0.3 * Math.sin(seed)) + seed);
  c.breathe = br;
  c.bx += p.sway * (0.45 * Math.sin(t * 0.68 + seed) + 0.22 * Math.sin(t * 1.53 + seed * 2));
  c.lean += p.sway * 0.006 * Math.sin(t * 0.55 + seed * 3);
  const hm = p.headMotion;
  c.yaw += hm * 0.045 * wobble(t * 0.35, seed);
  c.pitch += hm * 0.025 * wobble(t * 0.3, seed + 5);
  c.roll += hm * 0.018 * wobble(t * 0.27, seed + 9);
  c.hy += br * 0.35;
  const sch = schedule(seed, p);
  // blinks (also triggered on big head turns in real life; the schedule covers it well enough)
  const bi = upperBound(sch.blinks, t);
  let blink = 0;
  for (let q = Math.max(0, bi - 1); q <= bi && q >= 0; q++) blink = Math.max(blink, blinkCurve(t - sch.blinks[q]));
  c.blink = blink;
  // saccades: 45 ms eased jumps between fixations, damped while a gesture drives the eyes
  const si = upperBound(sch.sacc, t, 3);
  if (si >= 0) {
    const t0 = sch.sacc[si * 3];
    const px = si > 0 ? sch.sacc[si * 3 - 2] : 0, py = si > 0 ? sch.sacc[si * 3 - 1] : 0;
    const u = smooth((t - t0) / 0.045);
    const sx = px + (sch.sacc[si * 3 + 1] - px) * u, sy = py + (sch.sacc[si * 3 + 2] - py) * u;
    const damp = perf.speech ? 0.45 : 1;
    c.lookX += sx * damp * (1 - gestLook * 0.8);
    c.lookY += sy * damp * (1 - gestLook * 0.8);
  }

  // 6. speech
  const fr = speechFrame(perf.speech, t, null);
  c.speaking = fr.speaking;
  mouthParams(fr, c, perf.gain ?? 1);
  if (fr.speaking) {
    const e = fr.emph * p.energy;
    c.brow += 0.42 * e;
    c.pitch += 0.03 * e - 0.012;
    c.hy += 0.25 * e;
    // phrase-level head arcs: a slow drift that changes direction each sentence
    c.yaw += 0.05 * p.headMotion * Math.sin(t * 0.9 + fr.sentenceIndex * 2.1);
    c.roll += 0.012 * p.headMotion * Math.sin(t * 0.7 + fr.sentenceIndex);
  } else if (perf.listen) {
    // listening: an occasional small nod
    const q = (t + seed) % 5.2;
    if (q < 0.6) c.pitch += 0.06 * Math.sin((q / 0.6) * Math.PI);
  }
  c.face = c; // face params live on the channel object
  return c;
}

// ---------------------------------------------------------------------------
// Solve: partner space → screen space, IK

function ik(S, T, L1, L2, pole, E, Wt) {
  let dx = T[0] - S[0], dy = T[1] - S[1], dz = T[2] - S[2];
  let d = Math.hypot(dx, dy, dz) || 1e-6;
  const maxD = (L1 + L2) * 0.995, minD = Math.abs(L1 - L2) + 0.5;
  const dc = clamp(d, minD, maxD);
  dx /= d;
  dy /= d;
  dz /= d;
  d = dc;
  Wt[0] = S[0] + dx * d;
  Wt[1] = S[1] + dy * d;
  Wt[2] = S[2] + dz * d;
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  // pole direction made perpendicular to the shoulder→wrist axis
  const pd = pole[0] * dx + pole[1] * dy + pole[2] * dz;
  let px = pole[0] - dx * pd, py = pole[1] - dy * pd, pz = pole[2] - dz * pd;
  const pl = Math.hypot(px, py, pz) || 1;
  px /= pl;
  py /= pl;
  pz /= pl;
  E[0] = S[0] + dx * a + px * h;
  E[1] = S[1] + dy * a + py * h;
  E[2] = S[2] + dz * a + pz * h;
}

function newSkeleton() {
  const arm = () => ({ shoulder: [0, 0, 0], elbow: [0, 0, 0], wrist: [0, 0, 0], handDir: [0, 0, 1], hand: { curl: [0, 0, 0, 0, 0], spread: 0, facing: -1 } });
  return {
    body: { x: 0, y: 0, lean: 0, breathe: 0 },
    shoulder: { L: 0, R: 0 },
    head: { x: 0, y: 0, yaw: 0, pitch: 0, roll: 0 },
    arms: { L: arm(), R: arm() },
    face: {},
    hairLag: 0,
  };
}

const TW = [0, 0, 0];

/**
 * Solve channels into a skeleton (screen-space body coordinates).
 * @param side  +1 when the partner/wall is to the screen-right of this presenter, -1 otherwise
 */
export function solve(L, c, side, sk = newSkeleton(), lagC = null) {
  const m = side >= 0 ? 1 : -1;
  sk.body.x = c.bx * m;
  sk.body.y = c.by;
  sk.body.lean = c.lean * m;
  sk.body.breathe = c.breathe;
  const near = m > 0 ? 'R' : 'L', far = m > 0 ? 'L' : 'R';
  sk.shoulder[near] = c.shN;
  sk.shoulder[far] = c.shF;
  sk.head.x = c.hx * m;
  sk.head.y = c.hy - (c.shN + c.shF) * 0.15;
  sk.head.yaw = c.yaw * m;
  sk.head.pitch = c.pitch;
  sk.head.roll = c.roll * m;
  const f = sk.face;
  f.blink = c.blink;
  f.lookX = clamp(c.lookX * m, -1, 1);
  f.lookY = clamp(c.lookY, -1, 1);
  // a sceptical touch: the brow on the near side rides a little higher when raised
  f.browL = c.brow * 1.0 * 0.9;
  f.browR = c.brow * 0.9;
  f.browIn = c.browIn;
  f.smile = clamp(c.smile, -1, 1);
  f.squint = clamp(c.squint, 0, 1);
  f.lid = clamp(c.lid, 0, 1);
  f.wide = clamp(c.wide, 0, 1);
  f.open = c.open;
  f.wide2 = c.wide;
  f.round = c.round;
  f.teeth = c.teeth;
  f.tongue = c.tongue;
  f.press = c.press;
  f.tuck = c.tuck;
  f.jaw = c.jaw || 0;
  // follow-through for hair and earrings: where the head was ~0.12 s ago
  sk.hairLag = lagC ? clamp(((lagC.hx + lagC.bx) * m - (c.hx + c.bx) * m) * 0.9 + (lagC.yaw - c.yaw) * m * 6 + (lagC.roll - c.roll) * m * 10, -1.6, 1.6) : 0;

  const T = L.torso;
  const A = L.arm;
  const armScale = (A.upper + A.fore) / 37;
  for (const [sideKey, suffix] of [[near, ''], [far, 'F']]) {
    const arm = sk.arms[sideKey];
    const sx = sideKey === 'R' ? 1 : -1;
    const lift = c.breathe * 0.45 + (sideKey === near ? c.shN : c.shF);
    arm.shoulder[0] = T.shoulderJoint[0] * sx;
    arm.shoulder[1] = T.shoulderJoint[1] - lift;
    arm.shoulder[2] = 0;
    const w = c[`wrist${suffix}`];
    TW[0] = arm.shoulder[0] + w[0] * m * armScale;
    TW[1] = arm.shoulder[1] + w[1] * armScale + lift * 0.6;
    TW[2] = w[2] * armScale;
    const pole = c[`pole${suffix}`];
    const pw = [pole[0] * m, pole[1], pole[2]];
    ik(arm.shoulder, TW, A.upper, A.fore, pw, arm.elbow, arm.wrist);
    const d = c[`dir${suffix}`];
    const dl = Math.hypot(d[0], d[1], d[2]) || 1;
    arm.handDir[0] = (d[0] * m) / dl;
    arm.handDir[1] = d[1] / dl;
    arm.handDir[2] = d[2] / dl;
    const cu = c[`curl${suffix}`];
    for (let q = 0; q < 5; q++) arm.hand.curl[q] = clamp(cu[q], -0.15, 1);
    arm.hand.spread = c[`spread${suffix}`];
    arm.hand.facing = c[`facing${suffix}`];
  }
  return sk;
}

/** Convenience: evaluate + solve with follow-through, reusing per-actor scratch objects. */
export function poseAt(actor, t) {
  actor._c ||= newChannels();
  actor._lag ||= newChannels();
  actor._sk ||= newSkeleton();
  const c = evaluate(actor.look, actor.perf, t, actor._c);
  const lag = evaluate(actor.look, actor.perf, t - 0.12, actor._lag);
  return solve(actor.look, c, actor.perf.side ?? 1, actor._sk, lag);
}
