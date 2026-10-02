// Shared scene plumbing for canvas25d: one Frame (the picture) and one
// PartBuffer (character materials), actors (look + performance) and a
// helper that poses, rasterises and resolves them.
import { Frame, PartBuffer } from './pixbuf.js';
import { drawCharacter, GROUPS_PER_ACTOR } from './character.js';
import { poseAt } from './rig.js';
import { LOOKS } from './looks.js';

export const frame = new Frame();
export const parts = new PartBuffer();

/** An actor is a look plus a performance description (rig.js evaluate()). */
export function actor(id, perf = {}) {
  return { id, look: LOOKS[id], perf: { side: 1, gestures: [], emotions: [], look: [], ...perf } };
}

/**
 * Pose and draw actors into the shared PartBuffer, then resolve into the frame.
 * @param list [{ actor, x, y, s, clip }] x,y = screen position of the neck base, s = px per rig unit
 * @param clipRows optional Int16Array(W) of desk rows that clip torsos
 */
export function drawActors(t, list, clipRows = null) {
  parts.clear();
  if (clipRows) parts.clipY.set(clipRows);
  let gb = 0;
  const heads = [];
  for (const it of list) {
    const sk = poseAt(it.actor, t);
    heads.push(drawCharacter(parts, it.actor.look, sk, { x: it.x, y: it.y, s: it.s, gb, clip: !!clipRows && it.clip !== false }));
    gb += GROUPS_PER_ACTOR;
  }
  parts.resolve(frame);
  return heads;
}
