// The canvas25d rig core (owner: HANDS & GESTURES stream): turns a
// performance description into a pose for any instant t, then solves it into
// a skeleton for character.js.
//
// Layers, evaluated in order and all pure functions of t (so any frame can be
// rendered on its own, deterministically):
//   1. rest pose                       gestures/index.js REST
//   2. emotion                         expression.js (face presets, crossfaded 0.45 s)
//   3. gestures                        here: keyframe tracks; override channels (arms,
//                                      hands, props) blend toward each gesture, body/
//                                      head/face channels add
//   4. look at partner                 behaviour.js (eyes lead, head follows)
//   5. idle (always on)                idle.js (breathing, weight shift, head
//                                      micro-motion, seeded blinks, saccades)
//   6. speech                          speech.js (visemes → mouth, emphasis → brows +
//                                      small nods); behaviour.js listening nods
// Then partner space is mirrored to screen space for whoever sits on the
// right (solve), and both arms are solved with 3D two-bone IK (elbow pole hints).
//
// Gesture events: perf.gestures = [{ name, t0, speed?, n?, variant?, amp? }] sorted by t0.
//   variant  a named variant of the gesture (gestures/index.js defOf)
//   n        count 1..5 for count-like gestures
//   amp      0.5..1: grave = smaller and a little slower (arcs scale toward rest; the
//            timing never stretches below 0.8 of the speed)
// Blending:
//   - overlap ≤ 0.4 s (the next gesture starts while this one settles, as in the approved
//     rig demo): the next one fades in across the overlap (≤ 0.6 s);
//   - INTERRUPTION (an arm gesture starts while another arm gesture is mid-flight): the new
//     one starts FROM the current pose (its tracks are offset by the pose at its t0, the
//     offset decaying to zero at its apex), takes over in 0.12 s, and the interrupted one's
//     head/body motion fades out over 0.3 s; head-only gestures layer on top of arm gestures;
//   - fingers follow the hand 40 ms late; every gesture ends at rest ('R' keys).
// The follow-through pose (hair, earrings) evaluates only body and head channels at t − 0.12
// (evaluateLag), without speech, so it costs a fraction of a full evaluation.
//
// FROZEN layer signatures (CONTRACTS "rig layer signatures"; change only by a
// dated CONTRACTS entry agreed by HANDS and FACES):
//   applyEmotion(c, perf, t, persona)          applyLook(c, perf, t, gestLook) → gestLook
//   applyIdle(c, persona, perf, t, seed, gestLook)   applySpeech(c, persona, perf, t) → frame
//   applyListen(c, perf, t, seed)              solveFace(c, face, m)
// Everything a layer needs travels in perf (side: +1 | -1 | 0 solo, seed, look[] entries
// { t0, t1, target, amt? }, gestures[] entries { name, t0, speed?, n?, variant?, amp? }).
// FACES adds channels through expression.js FACE_REST (reset here every frame).
import { REST, GESTURES, ARM_CHANNELS, defOf, rateOf } from './gestures/index.js';
import { evalTrack, copy } from './tracks.js';
import { applyEmotion, solveFace, FACE_REST } from './expression.js';
import { applyLook, applyListen } from './behaviour.js';
import { applyIdle } from './idle.js';
import { applySpeech } from './speech.js';
import { glassesAnchor } from './glasses.js';
import { clamp, smooth } from './space.js';

export { evalTrack } from './tracks.js';
export { EMOTIONS } from './expression.js';

const REST_KEYS = Object.keys(REST);
const REST_ARR = REST_KEYS.map((k) => Array.isArray(REST[k]));

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
  for (let i = 0; i < REST_KEYS.length; i++) {
    const k = REST_KEYS[i];
    if (REST_ARR[i]) copy(c[k], REST[k]);
    else c[k] = REST[k];
  }
  c.wide = 0;
  c.blink = 0;
  c.breathe = 0;
  for (const k in FACE_REST) c[k] = FACE_REST[k];
}

// ---------------------------------------------------------------------------
// Layer 3: gestures

const TMP = [0, 0, 0, 0, 0];
const TMP0 = [0, 0, 0, 0, 0];
const FINGER_LAG = 0.04; // s: the fingers follow the hand
const SETTLE_OVERLAP = 0.4; // s: a longer overlap between two arm gestures is an interruption
const INTERRUPT_FADE = 0.12; // s: the interrupting gesture takes over this fast (it starts from the pose)

function endOf(g, d) {
  return g.t0 + d.dur / rateOf(g);
}

/** Is gesture i interrupted by a later ARM gesture (overlap > SETTLE_OVERLAP)? Returns that start time or Infinity. */
function interruptAt(list, i, d) {
  if (!d.arm) return Infinity;
  const end = endOf(list[i], d);
  for (let j = i + 1; j < list.length; j++) {
    const g = list[j];
    if (g.t0 >= end - SETTLE_OVERLAP) break;
    const dj = defOf(g);
    if (dj && dj.arm) return g.t0;
  }
  return Infinity;
}

/** The previous ARM gesture still running at g.t0 with more than a settle's overlap, or -1. */
function interruptedIndex(list, i) {
  const g = list[i];
  for (let j = i - 1; j >= 0; j--) {
    const dj = defOf(list[j]);
    if (!dj || !dj.arm) continue;
    if (endOf(list[j], dj) - g.t0 > SETTLE_OVERLAP) return j;
    return -1;
  }
  return -1;
}

/** Weight of a gesture instance at t (fade in across the overlap with the previous one, out at its end). */
function gestureWeight(list, i, d, t, interrupting) {
  const g = list[i];
  const dur = d.dur / rateOf(g);
  const lt = t - g.t0;
  if (lt < 0 || lt > dur) return 0;
  let fadeIn = 0.12;
  if (interrupting) fadeIn = INTERRUPT_FADE;
  else if (i > 0) {
    const p = list[i - 1];
    const dp = defOf(p);
    const pEnd = dp ? endOf(p, dp) : -Infinity;
    if (pEnd > g.t0) fadeIn = Math.max(fadeIn, Math.min(0.6, pEnd - g.t0));
  }
  return smooth(lt / fadeIn) * smooth((dur - lt) / 0.08);
}

/** Arm pose (override channels) of list[0..upto) at time t, into `out` (a channel object). */
function armPoseAt(list, upto, t, out) {
  for (const k of ARM_CHANNELS) {
    if (Array.isArray(REST[k])) copy(out[k], REST[k]);
    else out[k] = REST[k];
  }
  applyGestureRange(out, list, upto, t, MODE_ARM);
}

const MODE_ALL = 0, MODE_ARM = 1, MODE_LAG = 2;

/**
 * The pose an interrupting gesture starts from (override channels at its t0), memoised on the
 * event object (it depends only on earlier events, which never change once appended).
 */
function fromPose(list, i) {
  const g = list[i];
  const prev = list[i - 1];
  if (g._from && g._fromPrev === prev && g._fromPrevT0 === prev.t0) return g._from;
  const f = g._from || newChannels();
  armPoseAt(list, i, g.t0, f);
  g._from = f;
  g._fromT = 0; // the blend time depends on this pose
  g._fromPrev = prev;
  g._fromPrevT0 = prev.t0;
  return f;
}

const TMPW = [0, 0, 0];
/** How long the hand takes to blend from the interrupted pose into this gesture (memoised on the event). */
function fromTime(g, d, from) {
  if (g._fromT && g._fromTFor === from) return g._fromT;
  let dist = 0;
  for (const ch of d._ch) {
    if (ch.ch !== 'wrist' && ch.ch !== 'wristF') continue;
    const v = evalTrack(ch.keys, d.apex, TMPW);
    const f = from[ch.ch];
    dist = Math.max(dist, Math.hypot(v[0] - f[0], v[1] - f[1], v[2] - f[2]));
  }
  g._fromT = Math.max(0.15, d.apex, 0.25 + dist / 40);
  g._fromTFor = from;
  return g._fromT;
}

function applyGestureRange(c, list, upto, t, mode) {
  let gestLook = 0;
  for (let i = 0; i < upto; i++) {
    const g = list[i];
    if (g.t0 > t) break;
    const d = defOf(g);
    if (!d) continue;
    if (mode === MODE_ARM && !d.arm) continue;
    const ii = d.arm ? interruptedIndex(list, i) : -1;
    const w = gestureWeight(list, i, d, t, ii >= 0);
    if (w <= 0) continue;
    const rate = rateOf(g);
    const lt = (t - g.t0) * rate;
    const amp = g.amp == null ? 1 : clamp(g.amp, 0.5, 1);
    // an interrupted gesture hands its head/body motion over to the interrupter
    const cut = interruptAt(list, i, d);
    // (its arm channels too: once the interrupter has taken over, the old gesture must not come back
    // when the new one ends)
    const wAdd = cut === Infinity ? w : w * (1 - smooth((t - cut) / 0.3));
    const wArm = cut === Infinity ? w : w * (1 - smooth((t - cut - INTERRUPT_FADE) / 0.3));
    const from = ii >= 0 && mode !== MODE_LAG ? fromPose(list, i) : null;
    // the offset from the interrupted pose decays by the apex, or later when the hand has far to go
    const decay = from ? 1 - smooth(lt / fromTime(g, d, from)) : 0;
    const chs = d._ch;
    for (let q = 0; q < chs.length; q++) {
      const ch = chs[q];
      if (mode === MODE_LAG ? !ch.lag : mode === MODE_ARM ? !ch.override : false) continue;
      const tt = ch.finger ? Math.max(0, lt - FINGER_LAG) : lt;
      if (ch.override) {
        const dst = c[ch.ch];
        if (ch.arr) {
          const v = evalTrack(ch.keys, tt, TMP);
          if (from) {
            const f0 = from[ch.ch], s0 = ch.start;
            for (let k = 0; k < v.length; k++) v[k] += (f0[k] - s0[k]) * decay;
          }
          if (amp < 1 && (ch.ch === 'wrist' || ch.ch === 'wristF' || ch.ch === 'dir' || ch.ch === 'dirF')) {
            const r = ch.rest, k2 = ch.ch[0] === 'w' ? amp : 0.5 + amp * 0.5;
            for (let k = 0; k < v.length; k++) v[k] = r[k] + (v[k] - r[k]) * k2;
          }
          for (let k = 0; k < dst.length; k++) dst[k] += (v[k] - dst[k]) * wArm;
        } else {
          let v = evalTrack(ch.keys, tt);
          if (from) v += (from[ch.ch] - ch.start) * decay;
          c[ch.ch] += (v - c[ch.ch]) * wArm;
        }
      } else {
        c[ch.ch] += (evalTrack(ch.keys, tt) - ch.rest) * wAdd * amp;
        if (ch.ch === 'lookX') gestLook = Math.max(gestLook, wAdd);
      }
    }
  }
  return gestLook;
}

/** Apply perf.gestures (sorted by t0); returns how strongly they drive the eyes (lookX). */
function applyGestures(c, list, t) {
  return applyGestureRange(c, list, list.length, t, MODE_ALL);
}

// ---------------------------------------------------------------------------
// Pose evaluation

/**
 * Performance description:
 *   { side: +1 partner on screen-right | -1 | 0 solo, seed, gestures: [{ name, t0, speed?, n?, variant?, amp? }],
 *     emotions: [{ t0, name }], speech: buildSpeech(...) | liveSpeech(...) | null,
 *     look: [{ t0, t1, target? }] looks, listen: bool (no speech: small listening nods),
 *     gain: mouth openness, papers: bool (the script stack is on the desk) }
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

/**
 * The follow-through pose: only what hair and earrings react to (body and head position),
 * from the gesture, look and idle layers. No arms, no face, no speech (a live speech
 * source cannot be sampled in the past anyway).
 */
export function evaluateLag(L, perf, t, c = newChannels()) {
  c.yaw = 0;
  c.roll = 0;
  c.pitch = 0;
  c.hx = 0;
  c.hy = 0;
  c.bx = 0;
  c.by = 0;
  c.lean = 0;
  c.lookX = 0;
  c.lookY = 0;
  const seed = perf.seed ?? (L.id.length * 31 + 7);
  let gestLook = applyGestureRange(c, perf.gestures || [], (perf.gestures || []).length, t, MODE_LAG);
  gestLook = applyLook(c, perf, t, gestLook);
  applyIdle(c, L.persona, perf, t, seed, gestLook);
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
  const arm = () => ({ shoulder: [0, 0, 0], elbow: [0, 0, 0], wrist: [0, 0, 0], handDir: [0, 0, 1], hand: { curl: [0, 0, 0, 0, 0], spread: 0, facing: -1, sup: 0 } });
  return {
    body: { x: 0, y: 0, lean: 0, breathe: 0 },
    shoulder: { L: 0, R: 0 },
    head: { x: 0, y: 0, yaw: 0, pitch: 0, roll: 0 },
    arms: { L: arm(), R: arm() },
    face: {},
    hairLag: 0,
    props: { papers: false, hold: 0, tilt: 0 },
  };
}

const TW = [0, 0, 0];
const PW = [0, 0, 0];
const ANCHOR = [0, 0];
// a head frame in BODY space (head-local units → body units) for glasses.js glassesAnchor
const BODY_HEAD = {
  L: null, cx: 0, cy: 0, s: 1, roll: 0, cr: 1, sr: 0, yaw: 0, pitch: 0, jaw: 0, gb: 0,
  toScreen(x, y) {
    return [this.cx + (x * this.cr - y * this.sr), this.cy + (x * this.sr + y * this.cr)];
  },
  toLocal(px, py) {
    const dx = px - this.cx, dy = py - this.cy;
    return [dx * this.cr + dy * this.sr, -dx * this.sr + dy * this.cr];
  },
  toScreenInto(x, y, out) {
    out[0] = this.cx + (x * this.cr - y * this.sr);
    out[1] = this.cy + (x * this.sr + y * this.cr);
    return out;
  },
  toLocalInto(px, py, out) {
    const dx = px - this.cx, dy = py - this.cy;
    out[0] = dx * this.cr + dy * this.sr;
    out[1] = -dx * this.sr + dy * this.cr;
    return out;
  },
};

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
  sk.props ||= { papers: false, hold: 0, tilt: 0 };
  sk.props.hold = clamp(c.hold, 0, 1);
  sk.props.tilt = clamp(c.tilt, 0, 1);

  const T = L.torso;
  const A = L.arm;
  const armScale = (A.upper + A.fore) / 37;
  const reach = clamp(c.reach, 0, 1);
  for (let pass = 0; pass < 2; pass++) {
    const sideKey = pass === 0 ? near : far;
    const suffix = pass === 0 ? '' : 'F';
    const arm = sk.arms[sideKey];
    const sx = sideKey === 'R' ? 1 : -1;
    const lift = c.breathe * 0.45 + (sideKey === near ? c.shN : c.shF);
    arm.shoulder[0] = T.shoulderJoint[0] * sx;
    arm.shoulder[1] = T.shoulderJoint[1] - lift;
    arm.shoulder[2] = 0;
    const w = pass === 0 ? c.wrist : c.wristF;
    TW[0] = arm.shoulder[0] + w[0] * m * armScale;
    TW[1] = arm.shoulder[1] + w[1] * armScale + lift * 0.6;
    TW[2] = w[2] * armScale;
    const d = pass === 0 ? c.dir : c.dirF;
    const dl = Math.hypot(d[0], d[1], d[2]) || 1;
    arm.handDir[0] = (d[0] * m) / dl;
    arm.handDir[1] = d[1] / dl;
    arm.handDir[2] = d[2] / dl;
    if (pass === 0 && reach > 0.001) reachGlasses(L, sk, arm, reach);
    const pole = pass === 0 ? c.pole : c.poleF;
    PW[0] = pole[0] * m;
    PW[1] = pole[1];
    PW[2] = pole[2];
    ik(arm.shoulder, TW, A.upper, A.fore, PW, arm.elbow, arm.wrist);
    const cu = pass === 0 ? c.curl : c.curlF;
    for (let q = 0; q < 5; q++) arm.hand.curl[q] = clamp(cu[q], -0.15, 1);
    arm.hand.spread = pass === 0 ? c.spread : c.spreadF;
    arm.hand.facing = pass === 0 ? c.facing : c.facingF;
    arm.hand.sup = clamp(pass === 0 ? c.sup : c.supF, 0, 1);
  }
  return sk;
}

/** Move the wrist target (TW) so the index fingertip lands on the glasses bridge (glasses.js anchor). */
function reachGlasses(L, sk, arm, reach) {
  const h = sk.head;
  BODY_HEAD.L = L;
  BODY_HEAD.cx = L.headAt[0] + h.x;
  BODY_HEAD.cy = L.headAt[1] + h.y;
  BODY_HEAD.roll = h.roll;
  BODY_HEAD.cr = Math.cos(h.roll);
  BODY_HEAD.sr = Math.sin(h.roll);
  BODY_HEAD.yaw = h.yaw;
  BODY_HEAD.pitch = h.pitch;
  glassesAnchor(BODY_HEAD, 'bridge', ANCHOR);
  // the fingertip sits ~0.92 hand lengths along the hand direction from the wrist, in front of the face
  const H = L.arm.hand * 0.92;
  const ax = ANCHOR[0] - arm.handDir[0] * H, ay = ANCHOR[1] - arm.handDir[1] * H, az = 7.5 - arm.handDir[2] * H;
  TW[0] += (ax - TW[0]) * reach;
  TW[1] += (ay - TW[1]) * reach;
  TW[2] += (az - TW[2]) * reach;
}

/** Convenience: evaluate + solve with follow-through, reusing per-actor scratch objects. */
export function poseAt(actor, t) {
  actor._c ||= newChannels();
  actor._lag ||= newChannels();
  actor._sk ||= newSkeleton();
  const perf = actor.perf;
  const c = evaluate(actor.look, perf, t, actor._c);
  const lag = perf.lagPose === false ? null : evaluateLag(actor.look, perf, t - 0.12, actor._lag);
  const sk = solve(actor.look, c, perf.side ?? 1, actor._sk, lag);
  sk.props.papers = !!(perf.papers || (Array.isArray(actor.look.props) && actor.look.props.includes('papers')));
  return sk;
}

/** Names of every gesture the rig can perform (all 20 cues.js ACTIONS). */
export const GESTURE_NAMES = Object.keys(GESTURES);
