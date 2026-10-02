// Facial expression layer of the canvas25d rig (owner: FACES stream).
//   EMOTIONS            face presets per cues.js emotion (brow, browIn, smile, squint, lid, wide, look)
//   applyEmotion()      rig layer 2: crossfade between the performance's emotions (0.45 s)
//   solveFace()         channels → the face parameters face.js draws (mirrored for the right seat)
// The mouth is not here: speech.js writes it (visemes), and the emotion only
// shapes the resting face around it.
//
// Presets are deliberately small (owner: adult, never cartoon expressions):
// happy is a closed-mouth smile with a touch of squint, surprised a raised
// brow and slightly wider eyes, serious a gathered brow and heavier lids.
import { clamp, smooth } from './space.js';

export const EMOTIONS = {
  neutral: { brow: 0, browIn: 0, smile: 0, squint: 0, lid: 0, wide: 0 },
  happy: { brow: 0.15, browIn: 0, smile: 0.55, squint: 0.3, lid: 0, wide: 0 },
  serious: { brow: -0.08, browIn: 0.42, smile: -0.1, squint: 0, lid: 0.18, wide: 0 },
  surprised: { brow: 0.62, browIn: -0.1, smile: 0, squint: 0, lid: 0, wide: 0.45 },
  sad: { brow: 0.05, browIn: -0.5, smile: -0.28, squint: 0, lid: 0.26, wide: 0 },
  thinking: { brow: 0.1, browIn: 0.2, smile: -0.05, squint: 0.1, lid: 0.12, wide: 0, lookY: -0.35, lookX: -0.3 },
};
export const FACE_KEYS = ['brow', 'browIn', 'smile', 'squint', 'lid', 'wide', 'lookX', 'lookY'];
// Extra scalar channels the FACES stream adds, with their rest values. rig.js
// resets every key here at the start of each evaluation (CONTRACTS "rig layer
// signatures"), so FACES adds channels without editing rig.js:
//   mwide   mouth width (visemes), split from the eye `wide` channel (emotions)
//   level   the voice envelope 0..1 (30 ms attack, 120 ms release) for UNIT-8's
//           speech indicator (PRESENTERS B), written by speech.js
//   t       the evaluation time (s), so face hooks can quantise their own updates
export const FACE_REST = { mwide: 0, level: 0, t: 0 };

/** Layer 2: perf.emotions = [{ t0, name }] (sorted), crossfaded; plus the persona's resting smile. */
export function applyEmotion(c, perf, t, persona) {
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
}

/**
 * Channels → face parameters for face.js. `m` is +1 for the left seat (partner to
 * the screen-right), -1 for the right seat (gaze is mirrored). The eye `wide`
 * (emotions) and the mouth `mwide` (visemes) are separate channels.
 */
export function solveFace(c, f, m) {
  f.blink = c.blink;
  f.lookX = clamp(c.lookX * m, -1, 1);
  f.lookY = clamp(c.lookY, -1, 1);
  // a hint of asymmetry: the brow nearer the key rides a touch higher when raised
  f.browL = c.brow * 0.95;
  f.browR = c.brow * 0.88;
  f.browIn = c.browIn;
  f.smile = clamp(c.smile, -1, 1);
  f.squint = clamp(c.squint, 0, 1);
  f.lid = clamp(c.lid, 0, 1);
  f.wide = clamp(c.wide, 0, 1);
  f.open = c.open;
  f.mwide = clamp(c.mwide || 0, -1, 1);
  f.round = c.round;
  f.teeth = c.teeth;
  f.tongue = c.tongue;
  f.press = c.press;
  f.tuck = c.tuck;
  f.jaw = c.jaw || 0;
  f.level = c.level || 0;
  f.t = c.t || 0;
  return f;
}
