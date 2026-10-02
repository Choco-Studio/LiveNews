// Gesture library for the canvas25d rig, authored as keyframe tracks
// (owner: HANDS & GESTURES stream).
//
// Files: gestures/index.js (this file: rest pose, channel list, the registry),
// gestures/shapes.js (hand shapes), gestures/library.js (the gestures).
// New gestures go in new files under gestures/ registered with
// registerGestures(); names match public/js/cues.js ACTIONS.
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
// by ~60 ms for follow-through.
//
// Channels
//   arms (override): wrist, dir (hand direction), curl [thumb..pinky 0 open → 1 curled],
//                    spread, facing (+1 palm to camera, -1 back), pole (elbow hint)
//   body/head/face (additive): yaw, pitch, roll, hx, hy, lean, bx, by, shN, shF (shoulder lift),
//                    brow, browIn, smile, squint, lid, lookX, lookY

import { LIBRARY } from './library.js';

export const REST = {
  wrist: [-5.6, 19.3, 13.5],
  wristF: [5.6, 19.3, 13.5],
  dir: [-0.8, 0.12, 0.58],
  dirF: [0.8, 0.12, 0.58],
  curl: [0.35, 0.62, 0.66, 0.7, 0.74],
  curlF: [0.35, 0.62, 0.66, 0.7, 0.74],
  spread: 0.15,
  spreadF: 0.15,
  facing: -1,
  facingF: -1,
  pole: [0.55, 0.9, -0.7],
  poleF: [-0.55, 0.9, -0.7],
  yaw: 0, pitch: 0, roll: 0, hx: 0, hy: 0, lean: 0, bx: 0, by: 0, shN: 0, shF: 0,
  brow: 0, browIn: 0, smile: 0, squint: 0, lid: 0, lookX: 0, lookY: 0,
};

export const ARM_CHANNELS = ['wrist', 'wristF', 'dir', 'dirF', 'curl', 'curlF', 'spread', 'spreadF', 'facing', 'facingF', 'pole', 'poleF'];

/** Every gesture by name: { dur, desc, tracks }. */
export const GESTURES = {};

/** Add gestures ({ name: def }); 'R' keys resolve to the rest value of their channel. */
export function registerGestures(defs) {
  for (const [name, g] of Object.entries(defs)) {
    for (const [ch, keys] of Object.entries(g.tracks)) {
      for (const k of keys) if (k[1] === 'R') k[1] = REST[ch];
    }
    GESTURES[name] = g;
  }
}

registerGestures(LIBRARY);

/** The 7 gestures in the order the rig demo performs them. */
export const DEMO_SEQUENCE = ['raise_hand', 'wave', 'point_screen', 'nod', 'look_partner', 'shrug', 'count'];
