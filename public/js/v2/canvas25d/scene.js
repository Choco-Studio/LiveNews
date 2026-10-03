// Shared scene plumbing for canvas25d (owner: INTEGRATION stream): one Frame
// (the picture) and one PartBuffer (character materials), actors (look +
// performance) and a helper that poses, rasterises and resolves them.
//   QUALITY.lag   follow-through pose for hair/earrings (rig.js poseAt evaluates
//                 the rig a second time, 0.12 s earlier); the perf watchdog turns
//                 it off at detail level 1 (runtime/watchdog.js)
import { Frame, PartBuffer } from './pixbuf.js';
import { drawCharacter, GROUPS_PER_ACTOR } from './character.js';
import { poseAt, evaluate, solve } from './rig.js';
import { lookFor } from './cast/index.js';

export const frame = new Frame();
export const parts = new PartBuffer();
export const QUALITY = { lag: true };

/**
 * An actor is a look plus a performance description (rig.js evaluate()).
 * `info` = the presenter's config entry (config/channel.json), used for ids without a look.
 */
export function actor(id, perf = {}, info = null) {
  return { id, look: lookFor(id, info), perf: { side: 1, gestures: [], emotions: [], look: [], ...perf } };
}

/** Pose without the follow-through pass (own scratch objects, so poseAt's stay untouched). */
function poseNoLag(a, t) {
  a._nc = evaluate(a.look, a.perf, t, a._nc);
  a._nsk = solve(a.look, a._nc, a.perf.side ?? 1, a._nsk, null);
  return a._nsk;
}

const HEADS = [];

/**
 * Pose and draw actors into the shared PartBuffer, then resolve into the frame.
 * @param list [{ actor, x, y, s, clip }] x,y = screen position of the neck base, s = px per rig unit
 * @param clipRows optional Int16Array(W) of desk rows that clip torsos
 * @returns the head frames in list order (a reused array: read it before the next call)
 */
export function drawActors(t, list, clipRows = null) {
  parts.clear();
  if (clipRows) parts.clipY.set(clipRows);
  let gb = 0;
  HEADS.length = 0;
  for (const it of list) {
    const sk = QUALITY.lag ? poseAt(it.actor, t) : poseNoLag(it.actor, t);
    HEADS.push(drawCharacter(parts, it.actor.look, sk, { x: it.x, y: it.y, s: it.s, gb, clip: !!clipRows && it.clip !== false }));
    gb += GROUPS_PER_ACTOR;
  }
  parts.resolve(frame);
  return HEADS;
}
