// Facial expression layer of the canvas25d rig (owner: FACES stream).
//   EMOTIONS            face presets per cues.js emotion (brow, browIn, smile, squint, lid, wide, look)
//   applyEmotion()      rig layer 2: crossfade between the performance's emotions (0.45 s)
//   solveFace()         channels → the face parameters face.js draws (mirrored for the right seat)
// The mouth is not here: speech.js writes it (visemes), and the emotion only
// shapes the resting face around it.
import { clamp, smooth } from './space.js';

export const EMOTIONS = {
  neutral: { brow: 0, browIn: 0, smile: 0, squint: 0, lid: 0, wide: 0 },
  happy: { brow: 0.25, browIn: 0, smile: 0.62, squint: 0.35, lid: 0, wide: 0 },
  serious: { brow: -0.1, browIn: 0.55, smile: -0.12, squint: 0, lid: 0.22, wide: 0 },
  surprised: { brow: 0.95, browIn: -0.1, smile: 0, squint: 0, lid: 0, wide: 0.6 },
  sad: { brow: 0.1, browIn: -0.75, smile: -0.4, squint: 0, lid: 0.3, wide: 0 },
  thinking: { brow: 0.1, browIn: 0.25, smile: -0.05, squint: 0.1, lid: 0.15, wide: 0, lookY: -0.45, lookX: -0.4 },
};
export const FACE_KEYS = ['brow', 'browIn', 'smile', 'squint', 'lid', 'wide', 'lookX', 'lookY'];
// Extra scalar channels the FACES stream adds (e.g. a separate mouth width
// `mwide`), with their rest values. rig.js resets every key here at the start
// of each evaluation, so FACES can add channels without editing rig.js
// (CONTRACTS "rig layer signatures"). Empty in the approved prototype.
export const FACE_REST = {};

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
 * the screen-right), -1 for the right seat (gaze is mirrored).
 * NOTE (known prototype quirk, kept for pixel identity): speech.js writes the
 * mouth's `wide` into the same channel as the emotion's eye `wide`, so f.wide
 * (eyes) follows the mouth while speaking. FACES stream: split it (e.g. `mwide`).
 */
export function solveFace(c, f, m) {
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
  return f;
}
