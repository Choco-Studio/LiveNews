// Idle life of the hands on the desk (owner: HANDS & GESTURES stream).
//
// Owner 20:40: "few gestures, it ends up repetitive" → besides planned gestures,
// idle micro-gestures: hands shifting on the desk, a hand resting on the
// papers, fingers that do not stay frozen. A presenter between gestures never
// holds one identical pose for minutes: every few seconds the hands settle into
// a slightly different, comfortable position (closer together, apart, one hand
// on the edge of the script, forward on the forearms...), sliding over the
// desk with a small lift, fingers following ~60 ms later; now and then the
// index finger lifts and taps the desk twice. The tap does not depend on
// perf.listen (the stage flips it at every turn, so a tap in flight would pop;
// and the owner wants listeners almost still, 22:50 note 6).
//
// Pure in t (seeded by perf.seed), allocation-free, O(1) per evaluation:
// time is cut into slots of P seconds; slot k holds one pose drawn from a hash
// of (seed, k) and the transition from the previous slot's pose happens at a
// hashed offset inside the slot. The first slot is always the reference rest
// pose (nothing moves in the first ~6 s of an actor's clock), so the
// owner-approved rest and the motion baseline are untouched.
//
// Gestures win: the offsets are scaled by (1 − e) per arm, where e rises over
// 0.25 s from a gesture's own t0 (never before it: live events are appended at
// t0 = now, so anything earlier would pop) and falls over 0.6 s after its end,
// so after a gesture the hand settles back into its idle pose.
import { defOf, rateOf } from './index.js';

// Poses: wrist offsets [dx, dy, dz] in partner space (Paco's proportions; +x toward the partner) for
// the near arm (N) and the far arm (F), and a curl offset added to every finger of that hand.
// dy < 0 lifts the hand onto the 0.7 u thick script.
const POSES = [
  { N: [0, 0, 0], F: [0, 0, 0], cN: 0, cF: 0 }, // the reference rest
  { N: [-1.3, 0, 0.5], F: [1.3, 0, 0.5], cN: 0.06, cF: 0.06 }, // closer together over the script
  { N: [1.1, 0, -0.7], F: [-1.0, 0, -0.6], cN: -0.05, cF: -0.04 }, // apart, more relaxed
  { N: [-2.4, -0.55, 1.6], F: [0.3, 0, 0], cN: -0.14, cF: 0.04 }, // near hand flat on the script
  { N: [-0.3, 0, 0], F: [2.4, -0.55, 1.6], cN: 0.04, cF: -0.14 }, // far hand flat on the script
  { N: [-0.6, 0, 1.4], F: [0.6, 0, 1.4], cN: 0.02, cF: 0.02 }, // forward on the forearms
  { N: [0.8, 0, -1.2], F: [-0.4, 0, 0.5], cN: -0.08, cF: 0.08 }, // near hand drawn back
];
const NP = POSES.length;

/** Deterministic hash of (seed, k, salt) → [0, 1). */
function h01(seed, k, salt) {
  let x = (seed ^ Math.imul(k + 0x3c6ef372, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca77)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

const smoother = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * u * (u * (u * 6 - 15) + 10));
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

function poseIndex(seed, k) {
  if (k <= 0) return 0;
  // a fifth of the slots keep the pose drawn for the slot before (a pause in the fidgeting)
  const j = h01(seed, k, 7) < 0.2 ? k - 1 : k;
  return j <= 0 ? 0 : Math.floor(h01(seed, j, 3) * NP);
}

/** Timing of an actor's slots: period, phase, transition length (robots: rarer, crisper). */
function slotTiming(L, seed, out) {
  const energy = L.persona && L.persona.energy != null ? L.persona.energy : 0.7;
  const robot = L.handStyle === 'robot';
  out.P = (9.5 - 3 * Math.min(1, Math.max(0, energy))) * (robot ? 1.45 : 1);
  out.phase = h01(seed, 0, 11) * 2;
  out.robot = robot;
  out.amp = robot ? 0.6 : 1;
  return out;
}
const TIM = { P: 8, phase: 0, robot: false, amp: 1 };

/** How strongly planned gestures own each arm at t: eN (near), eF (far), 0..1. */
function gestureOwn(perf, t, out) {
  out[0] = 0;
  out[1] = 0;
  const list = perf.gestures;
  if (!list) return out;
  for (let i = 0; i < list.length; i++) {
    const g = list[i];
    if (g.t0 > t) break;
    const d = defOf(g);
    if (!d || !(d.armN || d.armF)) continue;
    const end = g.t0 + d.dur / rateOf(g);
    if (t > end + 0.6) continue;
    const e = smooth((t - g.t0) / 0.25) * (1 - smooth((t - end) / 0.6));
    if (d.armN && e > out[0]) out[0] = e;
    if (d.armF && e > out[1]) out[1] = e;
  }
  return out;
}
const OWN = [0, 0];

/**
 * Add the idle hand pose of `perf` at time t to the arm channels of `c` (before the gesture layer).
 * perf.armIdle === false turns it off.
 */
export function applyArmIdle(c, L, perf, t) {
  if (perf.armIdle === false) return;
  const seed = (perf.seed ?? 7) >>> 0;
  const T = slotTiming(L, seed, TIM);
  const tt = t - T.phase;
  const k = Math.floor(tt / T.P);
  if (k < 1) return applyTap(c, perf, seed, T, t);
  gestureOwn(perf, t, OWN);
  const wN = (1 - OWN[0]) * T.amp, wF = (1 - OWN[1]) * T.amp;
  if (wN <= 0 && wF <= 0) return;
  const a = POSES[poseIndex(seed, k - 1)], b = POSES[poseIndex(seed, k)];
  // the move happens between 15 % and 65 % of the slot, over 0.9-1.4 s (robot 0.7 s)
  const start = k * T.P + T.P * (0.15 + 0.5 * h01(seed, k, 1));
  const dur = T.robot ? 0.7 : 0.9 + 0.5 * h01(seed, k, 2);
  const u = (tt - start) / dur;
  const e = T.robot ? smooth(u) : smoother(u);
  const ef = T.robot ? e : smoother((tt - start - 0.06) / dur); // fingers follow the hand
  // the hand lifts a little while it slides (an arc, never a drag through the desk)
  const lift = a === b || u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI * u);
  addArm(c.wrist, a.N, b.N, e, lift, wN);
  addArm(c.wristF, a.F, b.F, e, lift, wF);
  const cN = (a.cN + (b.cN - a.cN) * ef) * wN, cF = (a.cF + (b.cF - a.cF) * ef) * wF;
  for (let q = 0; q < 5; q++) {
    c.curl[q] += cN * (q === 0 ? 0.5 : 1);
    c.curlF[q] += cF * (q === 0 ? 0.5 : 1);
  }
  applyTap(c, perf, seed, T, t, wN);
}

function addArm(w, a, b, e, lift, wt) {
  if (wt <= 0) return;
  const dist = Math.abs(b[0] - a[0]) + Math.abs(b[2] - a[2]);
  w[0] += (a[0] + (b[0] - a[0]) * e) * wt;
  w[1] += (a[1] + (b[1] - a[1]) * e - lift * Math.min(0.9, 0.35 * dist)) * wt;
  w[2] += (a[2] + (b[2] - a[2]) * e) * wt;
}

/** Now and then the near index finger lifts and taps twice (same odds speaking or listening: no pop at a turn). */
function applyTap(c, perf, seed, T, t, wt = 1) {
  if (T.robot) return;
  const P2 = T.P * 0.5;
  const tt = t - T.phase - P2 * 0.5;
  const k = Math.floor(tt / P2);
  if (k < 1) return;
  if (h01(seed, k, 5) > 0.14) return;
  const u = tt - k * P2 - P2 * (0.2 + 0.5 * h01(seed, k, 6));
  if (u <= 0 || u >= 0.72) return;
  let own = wt;
  if (own === 1) {
    gestureOwn(perf, t, OWN);
    own = 1 - OWN[0];
  }
  // two taps: the finger lifts and comes down twice (sin² bumps: no velocity jump at either end)
  const v = u < 0.36 ? Math.sin((u / 0.36) * Math.PI) ** 2 : u < 0.72 ? 0.75 * Math.sin(((u - 0.36) / 0.36) * Math.PI) ** 2 : 0;
  c.curl[1] -= 0.38 * Math.max(0, v) * own;
}
