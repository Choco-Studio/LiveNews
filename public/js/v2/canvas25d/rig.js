// The canvas25d rig core (owner: HANDS & GESTURES stream): turns a
// performance description into a pose for any instant t, then solves it into
// a skeleton for character.js.
//
// Layers, evaluated in order and all pure functions of t (so any frame can be
// rendered on its own, deterministically):
//   1. rest pose                       gestures/index.js REST
//   2. emotion                         expression.js (face presets, crossfaded 0.45 s)
//   3. gestures                        here: keyframe tracks; a gesture fades in over
//                                      its overlap with the previous one, arm
//                                      channels override, body/head/face add
//   4. look at partner                 behaviour.js (eyes lead, head follows)
//   5. idle (always on)                idle.js (breathing, weight shift, head
//                                      micro-motion, seeded blinks, saccades)
//   6. speech                          speech.js (visemes → mouth, emphasis → brows +
//                                      small nods); behaviour.js listening nods
// Then partner space is mirrored to screen space for whoever sits on the
// right (solve), and both arms are solved with 3D two-bone IK (elbow pole hints).
// FROZEN layer signatures (CONTRACTS "rig layer signatures"; change only by a
// dated CONTRACTS entry agreed by HANDS and FACES):
//   applyEmotion(c, perf, t, persona)          applyLook(c, perf, t, gestLook) → gestLook
//   applyIdle(c, persona, perf, t, seed, gestLook)   applySpeech(c, persona, perf, t) → frame
//   applyListen(c, perf, t, seed)              solveFace(c, face, m)
// Everything a layer needs travels in perf (side: +1 | -1 | 0 solo, seed, look[] entries
// { t0, t1, target, amt? }, gestures[] entries { name, t0, speed?, n?, variant?, amp? }).
// FACES adds channels through expression.js FACE_REST (reset here every frame).
import { REST, GESTURES, ARM_CHANNELS } from './gestures/index.js';
import { evalTrack, copy } from './tracks.js';
import { applyEmotion, solveFace, FACE_REST } from './expression.js';
import { applyLook, applyListen } from './behaviour.js';
import { applyIdle } from './idle.js';
import { applySpeech } from './speech.js';
import { clamp, smooth } from './space.js';

export { evalTrack } from './tracks.js';
export { EMOTIONS } from './expression.js';

// ---------------------------------------------------------------------------
// Channels

function newChannels() {
  const c = {};
  for (const [k, v] of Object.entries(REST)) c[k] = Array.isArray(v) ? v.slice() : v;
  c.wide = 0;
  c.blink = 0;
  c.breathe = 0;
  for (const k in FACE_REST) c[k] = FACE_REST[k]; // channels the FACES stream adds
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
  for (const k in FACE_REST) c[k] = FACE_REST[k];
}

// ---------------------------------------------------------------------------
// Layer 3: gestures

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

/** Apply perf.gestures (sorted by t0); returns how strongly they drive the eyes (lookX). */
function applyGestures(c, list, t) {
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
  return gestLook;
}

// ---------------------------------------------------------------------------
// Pose evaluation

/**
 * Performance description:
 *   { side: +1 partner on screen-right | -1, seed, gestures: [{ name, t0, speed? }],
 *     emotions: [{ t0, name }], speech: buildSpeech(...) | liveSpeech(...) | null,
 *     look: [{ t0, t1 }] partner looks, listen: bool (no speech: small listening nods),
 *     gain: mouth openness }
 */
export function evaluate(L, perf, t, c = newChannels()) {
  resetChannels(c);
  const persona = L.persona;
  const seed = perf.seed ?? (L.id.length * 31 + 7);
  applyEmotion(c, perf, t, persona); // 2
  let gestLook = applyGestures(c, perf.gestures || [], t); // 3
  gestLook = applyLook(c, perf, t, gestLook); // 4
  applyIdle(c, persona, perf, t, seed, gestLook); // 5
  const fr = applySpeech(c, persona, perf, t); // 6
  if (!fr.speaking && perf.listen) applyListen(c, perf, t, seed);
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
  solveFace(c, sk.face, m);
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
