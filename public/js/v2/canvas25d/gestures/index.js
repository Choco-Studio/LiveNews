// Gesture library for the canvas25d rig, authored as keyframe tracks
// (owner: HANDS & GESTURES stream).
//
// Files: gestures/index.js (this file: rest pose, channel list, the registry),
// gestures/shapes.js (hand shapes), gestures/library.js (the 7 owner-approved
// gestures), gestures/arms.js (the other arm gestures), gestures/heads.js
// (head and body gestures), gestures/beats.js (speech beats and delivery
// variants, registered with registerVariants()). New gestures go in new files under gestures/
// registered with registerGestures(); names match public/js/cues.js ACTIONS
// (all 20 exist).
//
// Space: "partner space" in rig units. +x points toward the co-presenter
// (the rig mirrors it for whoever sits on the right), y down, z toward the
// camera. Arm channels are for the NEAR arm (toward the partner / the video
// wall) and the FAR arm (suffix F). Wrist positions are offsets from that
// arm's shoulder joint, in Paco's proportions (other presenters are scaled
// by arm length).
//
// Each track is [[time, value, flag?], ...]. Values may be 'R' (the rest
// value of that channel), numbers or [x, y, z]. Interpolation is a cardinal
// spline through the keys (tracks.js); flag 's' makes the motion ease into
// and out of that key (a hold or the end of an overshoot). The 12-principles
// beats are written explicitly: anticipation key, eased arc keys, an
// overshoot key, a settle key, and hand-direction keys that lag the wrist
// by ~60 ms for follow-through (the rig adds 40 ms of finger lag on top).
//
// Channels
//   override (arms and props): wrist, dir (hand direction), curl [thumb..pinky 0 open → 1 curled],
//                    spread, facing (+1 palm to camera, -1 back), sup (0..1: the palm turns up
//                    instead of down as it leaves the camera), pro (±1, baked: the side that "down"
//                    means for this gesture, gestures/orient.js), palm [x, y, z] + palmW (0..1: the
//                    palm keeps this direction, for sweeps across the front), pole (elbow hint),
//                    F suffix = far arm;
//                    hold / tilt (the papers prop: 0 on the desk .. 1 held / upright);
//                    reach (0..1: the near hand's index goes to the glasses, glasses.js glassesAnchor)
//   additive (body/head/face): yaw, pitch, roll, hx, hy, lean, bx, by, shN, shF (shoulder lift),
//                    brow, browIn, smile, squint, lid, lookX, lookY
//
// A definition: { dur, desc, stroke, apex, hold, focus?, tracks, variants?, forN? }
//   stroke  s from t0 when the main movement starts (end of the anticipation)
//   apex    s from t0 when the stroke lands (the planner puts it on the stressed word)
//   hold    s from t0 when the release starts (release to rest takes ≥ 0.4 s)
//   focus   'near' | 'far' | 'both' | 'head': which hand the lab zooms on
//   variants { name: partial definition } (same timing fields, own tracks)
//   forN(n)  → a definition for count-like gestures (n = 1..5), cached per n

import { LIBRARY } from './library.js';
import { ARMS } from './arms.js';
import { HEADS } from './heads.js';
import { BEATS, FAR_BEATS } from './beats.js';
import { pronationSide, palmNormal } from './orient.js';
import { evalTrack } from '../tracks.js';

export const REST = {
  wrist: [-5.6, 19.3, 13.5],
  wristF: [5.6, 19.3, 13.5],
  dir: [-0.8, 0.12, 0.58],
  dirF: [0.8, 0.12, 0.58],
  // relaxed hands on the desk: fingers loosely bent, not fists
  curl: [0.3, 0.42, 0.46, 0.5, 0.56],
  curlF: [0.3, 0.42, 0.46, 0.5, 0.56],
  spread: 0.15,
  spreadF: 0.15,
  facing: -1,
  facingF: -1,
  sup: 0,
  supF: 0,
  // the side the palm turns to as it leaves the camera (gestures/orient.js), in partner space: +1 / −1. Each
  // gesture bakes its own (prepareDef), so a hand never flips its palm mid-gesture; the rest values are the
  // resting hands' own sides (set below from REST.dir / REST.dirF)
  pro: 1,
  proF: -1,
  // a palm direction in partner space and its weight: where a hand SWEEPS across the front (an outward
  // lift, an offer, papers held edge-on), the camera-relative `facing` has a pole near the lens and would
  // roll the hand; with palmW 1 the palm keeps this direction instead (made perpendicular to the hand)
  palm: [0, -1, 0],
  palmF: [0, -1, 0],
  palmW: 0,
  palmWF: 0,
  pole: [0.55, 0.9, -0.7],
  poleF: [-0.55, 0.9, -0.7],
  hold: 0,
  tilt: 0,
  reach: 0,
  // body units added to the glasses aim while the index is at the hinge (negative = up): the push that adjusts
  // the frame (critic r3: a rigid touch read as touching the temple)
  reachY: 0,
  yaw: 0, pitch: 0, roll: 0, hx: 0, hy: 0, lean: 0, bx: 0, by: 0, shN: 0, shF: 0,
  brow: 0, browIn: 0, smile: 0, squint: 0, lid: 0, lookX: 0, lookY: 0,
};

REST.pro = pronationSide(REST.dir, 1);
REST.proF = pronationSide(REST.dirF, -1);
// the resting palms' own directions: a gesture's baked `palm` starts and ends on them (no wobble on blends)
{
  const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  REST.palm = palmNormal(nrm(REST.dir), REST.facing, REST.sup, REST.pro, [0, 0, 0]);
  // (the far palm is the exact mirror, so a mirrored definition still ends exactly at rest)
  REST.palmF = [-REST.palm[0], REST.palm[1], REST.palm[2]];
}

/** Channels that OVERRIDE (a gesture blends them toward its own value); every other channel adds. */
export const ARM_CHANNELS = ['wrist', 'wristF', 'dir', 'dirF', 'curl', 'curlF', 'spread', 'spreadF', 'facing', 'facingF', 'sup', 'supF', 'pro', 'proF', 'palm', 'palmF', 'palmW', 'palmWF', 'pole', 'poleF', 'hold', 'tilt', 'reach', 'reachY'];
const OVERRIDE = new Set(ARM_CHANNELS);
/** Hand-shape channels: evaluated 40 ms late (fingers follow the hand). */
export const FINGER_CHANNELS = new Set(['curl', 'curlF', 'spread', 'spreadF']);
/** Channels the lag pose needs (hair / earring follow-through): body and head position. */
export const LAG_CHANNELS = new Set(['yaw', 'roll', 'hx', 'bx', 'pitch', 'hy', 'by', 'lean']);

/** Every gesture by name: { dur, desc, stroke, apex, hold, tracks, variants?, forN? }. */
export const GESTURES = {};

// The desk top under the wrists (partner space, Paco's proportions: REST.wrist sits on it). An
// anticipation that presses the hand down never sinks it through the desk: keys below DESK_PRESS are
// compressed to a shallow press with a little forward slide along the top (the approved gestures stay
// inside their motion-baseline tolerances).
const DESK_PRESS = 20.0;
function deskPress(v) {
  if (v[1] <= DESK_PRESS) return v;
  const ex = v[1] - DESK_PRESS;
  return [v[0], DESK_PRESS + ex * 0.25, v[2] + ex * 0.35];
}

/**
 * The pronation side of one arm of a definition (partner space: near arm side +1, far −1): the side of its
 * decisive pose, where the hand is most edge-on to the lens (|sin acos(facing)| largest, the apex on a tie):
 * only there does the side change the picture. null when the hand never leaves "back to camera".
 */
function bakePro(g, far) {
  const ft = g.tracks[far ? 'facingF' : 'facing'], dt = g.tracks[far ? 'dirF' : 'dir'];
  if (!ft || !dt) return null;
  const restDir = far ? REST.dirF : REST.dir;
  let best = 0.1, bestT = -1;
  const apex = g.apex ?? g.dur * 0.4;
  for (let t = 0; t <= g.dur + 1e-9; t += 0.02) {
    const f = evalTrack(ft, t);
    const e = Math.sqrt(Math.max(0, 1 - f * f)) - Math.abs(t - apex) * 1e-3;
    if (e > best) {
      best = e;
      bestT = t;
    }
  }
  if (bestT < 0) return null;
  const d = evalTrack(dt, bestT, [0, 0, 0]);
  return pronationSide(d[0] === 0 && d[1] === 0 && d[2] === 0 ? restDir : d, far ? -1 : 1);
}

/**
 * The palm of a SWEEP (definition field `transport: [tIn, tOut]`): inside the window the apex's palm direction
 * is carried along the hand's path without twist (parallel transport: each step only removes the part along
 * the new hand direction), so the hand does not roll while its fingers swing past the lens, where the
 * camera-relative `facing` has its pole (critic r3: the lift / point_screen flutter). Before tIn and after tOut
 * the authored camera-relative palm comes back by a smooth turn about the hand axis (the shorter way), so
 * the gesture starts and ends on the resting palm. Baked once into `palm` keys every 0.04 s, palmW 1.
 */
const TR_DT = 1 / 120;
function bakeTransport(g, far) {
  const win = g.transport;
  const dirT = g.tracks[far ? 'dirF' : 'dir'];
  if (!win || !dirT || g.tracks[far ? 'palmF' : 'palm']) return;
  const facT = g.tracks[far ? 'facingF' : 'facing'], supT = g.tracks[far ? 'supF' : 'sup'];
  const proT = g.tracks[far ? 'proF' : 'pro'];
  const pro = proT ? proT[0][1] : far ? REST.proF : REST.pro;
  const N = Math.ceil(g.dur / TR_DT) + 1;
  const F = new Float64Array(N * 3), A = new Float64Array(N * 3), Q = new Float64Array(N * 3);
  const v = [0, 0, 0], nn = [0, 0, 0];
  for (let k = 0; k < N; k++) {
    const t = Math.min(g.dur, k * TR_DT);
    evalTrack(dirT, t, v);
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    v[0] /= l;
    v[1] /= l;
    v[2] /= l;
    const fc = facT ? evalTrack(facT, t) : REST.facing;
    const sp = supT ? Math.min(1, Math.max(0, evalTrack(supT, t))) : 0;
    palmNormal(v, fc, sp, pro, nn);
    for (let c = 0; c < 3; c++) {
      F[k * 3 + c] = v[c];
      A[k * 3 + c] = nn[c];
    }
  }
  // transport from the apex both ways
  const ka = Math.min(N - 1, Math.max(0, Math.round(g.apex / TR_DT)));
  for (let c = 0; c < 3; c++) Q[ka * 3 + c] = A[ka * 3 + c];
  const step = (from, to) => {
    const d = Q[from * 3] * F[to * 3] + Q[from * 3 + 1] * F[to * 3 + 1] + Q[from * 3 + 2] * F[to * 3 + 2];
    let x = Q[from * 3] - F[to * 3] * d, y = Q[from * 3 + 1] - F[to * 3 + 1] * d, z = Q[from * 3 + 2] - F[to * 3 + 2] * d;
    const l = Math.hypot(x, y, z) || 1;
    Q[to * 3] = x / l;
    Q[to * 3 + 1] = y / l;
    Q[to * 3 + 2] = z / l;
  };
  for (let k = ka + 1; k < N; k++) step(k - 1, k);
  for (let k = ka - 1; k >= 0; k--) step(k + 1, k);
  // the twist from the transported palm to the authored one (about the hand axis), wrapped at the window edges and
  // unwrapped outward from them, faded in toward both ends
  const angleAt = (k) => {
    const o = k * 3;
    const px = Q[o], py = Q[o + 1], pz = Q[o + 2], ax = A[o], ay = A[o + 1], az = A[o + 2];
    const cx = py * az - pz * ay, cy = pz * ax - px * az, cz = px * ay - py * ax;
    return Math.atan2(cx * F[o] + cy * F[o + 1] + cz * F[o + 2], px * ax + py * ay + pz * az);
  };
  const E = new Float64Array(N);
  const kIn = Math.min(ka, Math.max(0, Math.round(win[0] / TR_DT))), kOut = Math.max(ka, Math.min(N - 1, Math.round(win[1] / TR_DT)));
  const unwrap = (prev, a) => {
    while (a - prev > Math.PI) a -= 2 * Math.PI;
    while (a - prev < -Math.PI) a += 2 * Math.PI;
    return a;
  };
  E[kIn] = angleAt(kIn);
  for (let k = kIn - 1; k >= 0; k--) E[k] = unwrap(E[k + 1], angleAt(k));
  E[kOut] = angleAt(kOut);
  for (let k = kOut + 1; k < N; k++) E[k] = unwrap(E[k - 1], angleAt(k));
  // the turn at either end is at most half a turn (the same palm, the shorter way round)
  const c0 = 2 * Math.PI * Math.round(E[0] / (2 * Math.PI)), c1 = 2 * Math.PI * Math.round(E[N - 1] / (2 * Math.PI));
  for (let k = 0; k <= kIn; k++) E[k] -= c0;
  for (let k = kOut; k < N; k++) E[k] -= c1;
  const sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const kh = Math.max(ka, Math.min(kOut, Math.round(g.hold / TR_DT)));
  const keys = [];
  const KEY_DT = 0.04;
  const nk = Math.max(2, Math.round(g.dur / KEY_DT) + 1);
  for (let i = 0; i < nk; i++) {
    const t = i === nk - 1 ? g.dur : Math.min(g.dur, i * KEY_DT);
    const k = Math.min(N - 1, Math.round(t / TR_DT));
    // the turn is spread over the whole approach (rest → apex) and the whole release (hold → rest), so it
    // rides on the arm's own motion; inside the window it uses the twist measured at the window edge
    let th = 0;
    if (k < ka) th = (k < kIn ? E[k] : E[kIn]) * sm(1 - k / Math.max(1, ka));
    else if (k > kh) th = (k > kOut ? E[k] : E[kOut]) * sm((k - kh) / Math.max(1, N - 1 - kh));
    const ct = Math.cos(th), st = Math.sin(th);
    const o = k * 3;
    const px = Q[o], py = Q[o + 1], pz = Q[o + 2], fx = F[o], fy = F[o + 1], fz = F[o + 2];
    // rotate the transported palm about f by th: P cos + (f × P) sin
    const out = [px * ct + (fy * pz - fz * py) * st, py * ct + (fz * px - fx * pz) * st, pz * ct + (fx * py - fy * px) * st];
    keys.push([+t.toFixed(4), out.map((x) => +x.toFixed(4))]);
  }
  // the ends are the resting palm exactly (the definition starts and ends at rest; palmW changes nothing there)
  keys[0][1] = (far ? REST.palmF : REST.palm).slice();
  keys[keys.length - 1][1] = (far ? REST.palmF : REST.palm).slice();
  g.tracks[far ? 'palmF' : 'palm'] = keys;
  g.tracks[far ? 'palmWF' : 'palmW'] = [[0, 0], [0.06, 1, 's'], [g.dur - 0.06, 1, 's'], [g.dur, 0]];
}

/** Resolve 'R' keys and precompute the channel list the rig walks every frame (no Object.entries per frame). */
export function prepareDef(g) {
  if (g._ch) return g;
  for (const [ch, keys] of Object.entries(g.tracks)) {
    for (const k of keys) {
      if (k[1] === 'R') k[1] = REST[ch];
      else if ((ch === 'wrist' || ch === 'wristF') && Array.isArray(k[1])) k[1] = deskPress(k[1]);
    }
  }
  // the palm's turning side, constant for the whole gesture (gestures/orient.js): baked after 'R' resolution
  for (const far of [false, true]) {
    const name = far ? 'proF' : 'pro';
    if (g.tracks[name]) continue;
    const v = bakePro(g, far);
    if (v == null) continue;
    // constant while the hand is off "back to camera"; back to the resting side once facing has returned to −1
    // (where the side changes nothing), so every override track still ends at rest
    const rest = far ? REST.proF : REST.pro;
    const ft = g.tracks[far ? 'facingF' : 'facing'];
    let tEnd = g.dur;
    for (let t = g.dur; t >= 0; t -= 0.02) {
      if (Math.abs(evalTrack(ft, t) + 1) > 0.01) break;
      tEnd = t;
    }
    if (v === rest) g.tracks[name] = [[0, v], [g.dur, v]];
    else if (tEnd < g.dur - 0.03) g.tracks[name] = [[0, v], [tEnd, v, 's'], [g.dur, rest, 's']];
    else g.tracks[name] = [[0, v], [g.dur - 0.02, v, 's'], [g.dur, rest, 's']];
  }
  if (g.transport) {
    g.apex ??= Math.min(g.dur * 0.4, (g.stroke ?? Math.min(0.3, g.dur * 0.15)) + 0.35);
    bakeTransport(g, false);
    bakeTransport(g, true);
  }
  g._ch = Object.entries(g.tracks).map(([ch, keys]) => ({
    ch,
    keys,
    override: OVERRIDE.has(ch),
    finger: FINGER_CHANNELS.has(ch),
    lag: LAG_CHANNELS.has(ch),
    rest: REST[ch],
    arr: Array.isArray(REST[ch]),
    far: ch.endsWith('F'), // a far-arm channel (wristF, dirF, curlF...)
    start: Array.isArray(keys[0][1]) ? keys[0][1].slice() : keys[0][1],
  }));
  g.arm = g._ch.some((c) => c.override);
  // which arm each definition drives (the rig's arm idle layer yields only on those)
  g.armN = g._ch.some((c) => c.override && !c.ch.endsWith('F') && c.ch !== 'hold' && c.ch !== 'tilt');
  g.armF = g._ch.some((c) => c.override && c.ch.endsWith('F'));
  g.stroke ??= Math.min(0.3, g.dur * 0.15);
  g.apex ??= Math.min(g.dur * 0.4, g.stroke + 0.35);
  g.hold ??= Math.max(g.apex, g.dur - 0.5);
  return g;
}

/** Add gestures ({ name: def }); variants inherit the timing fields they do not set. */
export function registerGestures(defs) {
  for (const [name, g] of Object.entries(defs)) {
    g.name = name;
    prepareDef(g);
    if (g.variants) {
      for (const [vn, v] of Object.entries(g.variants)) {
        v.name = name;
        v.variant = vn;
        v.desc ??= g.desc;
        v.focus ??= g.focus;
        prepareDef(v);
      }
    }
    if (g.forN) {
      const make = g.forN;
      const cache = new Map();
      g.forN = (n) => {
        const k = Math.max(1, Math.min(5, Math.round(n) || 2));
        let d = cache.get(k);
        if (!d) {
          d = prepareDef({ desc: g.desc, focus: g.focus, ...make(k) });
          d.name = name;
          d.n = k;
          cache.set(k, d);
        }
        return d;
      };
    }
    GESTURES[name] = g;
  }
}

/**
 * Add named variants to gestures that are already registered ({ name: { variant: def } }); a variant
 * inherits desc and focus from its gesture. Names stay cues.js ACTIONS (PLAN §3.3: variants, not new names).
 */
export function registerVariants(defs) {
  for (const [name, vars] of Object.entries(defs)) {
    const g = GESTURES[name];
    if (!g) throw new Error(`registerVariants: unknown gesture ${name}`);
    g.variants ||= {};
    for (const [vn, v] of Object.entries(vars)) {
      v.name = name;
      v.variant = vn;
      v.desc ??= g.desc;
      v.focus ??= g.focus;
      prepareDef(v);
      g.variants[vn] = v;
    }
  }
}

// Mirroring a one-handed definition onto the far arm (partner space is symmetric: REST.wristF is
// REST.wrist with x negated, and so on): near/far channels swap, x components and the sideways head
// channels change sign. Used for the `<variant>_far` beats, so the planner can pick the hand per
// instance with nothing but the variant name (the runtime's cue clock forwards name/variant/n/amp/speed).
const SWAP = { wrist: 'wristF', wristF: 'wrist', dir: 'dirF', dirF: 'dir', curl: 'curlF', curlF: 'curl', spread: 'spreadF', spreadF: 'spread', facing: 'facingF', facingF: 'facing', sup: 'supF', supF: 'sup', pro: 'proF', proF: 'pro', palm: 'palmF', palmF: 'palm', palmW: 'palmWF', palmWF: 'palmW', pole: 'poleF', poleF: 'pole', shN: 'shF', shF: 'shN' };
const NEG_X = new Set(['wrist', 'wristF', 'dir', 'dirF', 'pole', 'poleF', 'palm', 'palmF']);
// (a mirrored pose turns its palm to the mirrored side: pro changes sign with the arm)
const NEG = new Set(['yaw', 'roll', 'hx', 'bx', 'lookX', 'pro', 'proF']);

/** A fresh definition: `d` performed with the other arm (timing fields kept). */
export function mirrorDef(d) {
  const tracks = {};
  for (const [ch, keys] of Object.entries(d.tracks)) {
    if (ch === 'reach' || ch === 'reachY') continue; // the glasses reach is the near hand's own
    tracks[SWAP[ch] || ch] = keys.map((k) => {
      let v = k[1] === 'R' ? REST[ch] : k[1];
      if (NEG_X.has(ch)) v = [-v[0], v[1], v[2]];
      else if (NEG.has(ch)) v = -v;
      else if (Array.isArray(v)) v = v.slice();
      return k.length > 2 ? [k[0], v, k[2]] : [k[0], v];
    });
  }
  return { dur: d.dur, stroke: d.stroke, apex: d.apex, hold: d.hold, focus: d.focus === 'near' ? 'far' : d.focus, tracks };
}

/**
 * The definition an event plays: its variant when the gesture has one by that name, the
 * count-specific definition when `n` is given, else the base definition (null for unknown names).
 */
export function defOf(ev) {
  const base = GESTURES[ev.name];
  if (!base) return null;
  let d = base;
  if (ev.variant && base.variants && base.variants[ev.variant]) d = base.variants[ev.variant];
  if (ev.n != null && base.forN && d === base) d = base.forN(ev.n);
  return d;
}

/** Playback rate of an event: speed × the slow-down of a small (grave) gesture, never below 0.8 for amp. */
export function rateOf(ev) {
  const sp = ev.speed > 0 ? ev.speed : 1;
  if (ev.amp == null || ev.amp >= 1) return sp;
  const a = ev.amp < 0.5 ? 0.5 : ev.amp;
  return sp * (1 - (1 - a) * 0.4);
}

/** Length in seconds of an event as played. */
export function durOf(ev) {
  const d = defOf(ev);
  return d ? d.dur / rateOf(ev) : 0;
}

registerGestures(LIBRARY);
registerGestures(ARMS);
registerGestures(HEADS);
registerVariants(BEATS);
// the far-hand versions of the one-handed beats (`beat_far`, `offer_far`, ...)
registerVariants(Object.fromEntries(Object.entries(FAR_BEATS).map(([name, list]) => [name, Object.fromEntries(list.map((v) => [`${v}_far`, mirrorDef(GESTURES[name].variants[v])]))])));

/** The 7 gestures in the order the rig demo performs them. */
export const DEMO_SEQUENCE = ['raise_hand', 'wave', 'point_screen', 'nod', 'look_partner', 'shrug', 'count'];
/** The owner-approved gestures (their timing and feel are locked by test/v2-hands.test.js). */
export const APPROVED = DEMO_SEQUENCE;
