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
//                    instead of down as it leaves the camera), pole (elbow hint), F suffix = far arm;
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
import { BEATS } from './beats.js';

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
  pole: [0.55, 0.9, -0.7],
  poleF: [-0.55, 0.9, -0.7],
  hold: 0,
  tilt: 0,
  reach: 0,
  yaw: 0, pitch: 0, roll: 0, hx: 0, hy: 0, lean: 0, bx: 0, by: 0, shN: 0, shF: 0,
  brow: 0, browIn: 0, smile: 0, squint: 0, lid: 0, lookX: 0, lookY: 0,
};

/** Channels that OVERRIDE (a gesture blends them toward its own value); every other channel adds. */
export const ARM_CHANNELS = ['wrist', 'wristF', 'dir', 'dirF', 'curl', 'curlF', 'spread', 'spreadF', 'facing', 'facingF', 'sup', 'supF', 'pole', 'poleF', 'hold', 'tilt', 'reach'];
const OVERRIDE = new Set(ARM_CHANNELS);
/** Hand-shape channels: evaluated 40 ms late (fingers follow the hand). */
export const FINGER_CHANNELS = new Set(['curl', 'curlF', 'spread', 'spreadF']);
/** Channels the lag pose needs (hair / earring follow-through): body and head position. */
export const LAG_CHANNELS = new Set(['yaw', 'roll', 'hx', 'bx', 'pitch', 'hy', 'by', 'lean']);

/** Every gesture by name: { dur, desc, stroke, apex, hold, tracks, variants?, forN? }. */
export const GESTURES = {};

/** Resolve 'R' keys and precompute the channel list the rig walks every frame (no Object.entries per frame). */
export function prepareDef(g) {
  if (g._ch) return g;
  for (const [ch, keys] of Object.entries(g.tracks)) {
    for (const k of keys) if (k[1] === 'R') k[1] = REST[ch];
  }
  g._ch = Object.entries(g.tracks).map(([ch, keys]) => ({
    ch,
    keys,
    override: OVERRIDE.has(ch),
    finger: FINGER_CHANNELS.has(ch),
    lag: LAG_CHANNELS.has(ch),
    rest: REST[ch],
    arr: Array.isArray(REST[ch]),
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

/** The 7 gestures in the order the rig demo performs them. */
export const DEMO_SEQUENCE = ['raise_hand', 'wave', 'point_screen', 'nod', 'look_partner', 'shrug', 'count'];
/** The owner-approved gestures (their timing and feel are locked by test/v2-hands.test.js). */
export const APPROVED = DEMO_SEQUENCE;
