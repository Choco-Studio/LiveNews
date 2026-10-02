// Rasterises one posed presenter into a PartBuffer (owner: PRESENTERS A
// stream; this file only fixes the draw order and the transforms).
//
// Input is a solved skeleton (rig.js `solve()`): body offset and lean,
// per-side shoulder lift, head transform (offset, yaw, pitch, roll), 3D arm
// joints from 2-bone IK, hand shape parameters and face parameters. Every
// part is rebuilt from shapes each frame at the current scale, so motion is
// continuous while pixels stay on the 384x216 grid. The parts live in their
// own modules:
//   cast/outfit.js   torso, shirt, tie, jacket, lapels (registry of outfits)
//   head.js          skull, skin shading, ears, the head frame
//   face.js          eyes, brows, nose, mouth
//   cast/<id>.js     the presenter's look and bespoke parts (hair, facial hair...)
//   hands.js         sleeves, cuffs and articulated hands
// Draw order (back to front): hairBack → neck → outfit → ears → head → face →
// hair → over (facial hair, glasses) → props → arms, the one nearer the camera
// last.
// Rigid parts snap their origin to whole pixels so they never "boil" while
// they translate; only parts that rotate or scale are re-sampled.
import { HIP, TILT } from './space.js';
import { matsOf } from './cast/base.js';
import { drawOutfit } from './cast/outfit.js';
import { headFrame, drawHead, drawEars } from './head.js';
import { drawFace } from './face.js';
import { drawArm, drawProps } from './hands.js';

export { TILT } from './space.js';
export { matsOf };

// Group ids inside one character (offset by the character's group base, which
// the head frame carries as head.gb so look hooks can pick their own groups).
// Two parts in different groups get a 1 px inner line where they overlap, so
// separate groups are how fingers, hair clumps or glasses read as separate.
// Each hand uses 6 consecutive groups (palm, thumb, 4 fingers).
// RANGES (wave 2, CONTRACTS "group ids"): the PartBuffer holds 256 groups, so a
// character gets 64 (up to 4 characters per frame). Owners only use their range:
//   1-10, 19    body, head, hair, over (PRESENTERS A, character.js / cast/outfit.js)
//   11-18, 20-27 arms, cuffs, hands (HANDS)   28-29 spare (HANDS)
//   30-39       props: papers, pen, sleeve folds (HANDS; drawProps gets gb + 30)
//   40-55       look-owned extras: hair clumps, jewellery, robot plates (the look's
//               stream: PRESENTERS A for paco/lola/sam/penny, B for max/ada/nova/unit8)
//   56-59       face extras: glasses frame and lenses (FACES; drawGlasses)
//   60-63       reserved (INTEGRATION)
const G = {
  hairBack: 1, neck: 2, shirt: 3, tie: 4, jacket: 5, ears: 6, head: 7, hair: 8, over: 9, mustache: 9, collar: 10,
  armA: 11, cuffA: 12, handA: 13, armB: 20, cuffB: 21, handB: 22, extra: 30,
  props: 30, propsEnd: 39, look: 40, lookEnd: 55, glasses: 56, glassesEnd: 59, reserved: 60,
};
export const GROUPS_PER_ACTOR = 64;

/**
 * Draw a solved presenter.
 * @param buf  PartBuffer
 * @param L    look (cast/<id>.js)
 * @param sk   skeleton from rig.solve()
 * @param xf   { x, y, s, gb, clip } screen position of the neck base, px per unit, group base, clip torso at buf.clipY
 * @returns    the head frame (head.js headFrame), useful for framing and eyelines
 */
export function drawCharacter(buf, L, sk, xf) {
  const m = matsOf(L);
  const parts = L.parts;
  const s = xf.s;
  const gb = xf.gb || 0;
  const ox = Math.round(xf.x), oy = Math.round(xf.y);
  // body space → screen (with lean around the hips and the oblique tilt for z)
  const lean = sk.body.lean;
  const cl = Math.cos(lean), sl = Math.sin(lean);
  const bx = Math.round(sk.body.x * s) / s, by = Math.round(sk.body.y * s) / s;
  const toS = (x, y, z = 0) => {
    const ly = y - HIP;
    const rx = x * cl - ly * sl, ry = x * sl + ly * cl + HIP;
    return [ox + (rx + bx) * s, oy + (ry + by + z * TILT) * s];
  };
  const clip = !!xf.clip;

  // ---- back hair (e.g. a bob) behind the head and neck
  const head = headFrame(L, sk, toS, s);
  head.gb = gb; // group base for look hooks: buf.part(head.gb + GROUPS.look + i, z)
  if (parts.hairBack) {
    buf.part(gb + G.hairBack, 2, false);
    parts.hairBack(buf, L, m, head, s, sk);
  }

  // ---- neck (in the chin's shadow)
  buf.part(gb + G.neck, 4, clip);
  const [n0x, n0y] = toS(0, 1.5);
  const nt = head.toScreen(0, 6);
  buf.capsule(nt[0], nt[1], n0x, n0y, L.neck.hw * s, L.neck.hw * 1.05 * s, m.skin, 1);

  // ---- clothes
  drawOutfit({ buf, L, m, sk, toS, s, gb, G, clip });

  // ---- ears, head, face, hair, then whatever sits over the face
  if (!parts.coversEars) {
    buf.part(gb + G.ears, 9, false);
    drawEars(buf, L, m, head, s);
  }
  buf.part(gb + G.head, 10, false);
  (parts.head || drawHead)(buf, L, m, head, s);
  (parts.face || drawFace)(buf, L, head, sk.face, s);
  buf.part(gb + G.hair, 12, false);
  parts.hair(buf, L, m, head, s, sk);
  if (parts.over) {
    buf.part(gb + G.over, 13, false);
    parts.over(buf, L, m, head, s, sk);
  }

  // ---- desk props (hands.js), then the arms: the one nearer the camera last
  drawProps(buf, L, m, sk, toS, s, gb + G.extra, 16);
  const arms = [
    ['L', sk.arms.L, gb + G.armA, gb + G.cuffA, gb + G.handA],
    ['R', sk.arms.R, gb + G.armB, gb + G.cuffB, gb + G.handB],
  ];
  arms.sort((a, b) => a[1].wrist[2] + a[1].elbow[2] - (b[1].wrist[2] + b[1].elbow[2]));
  let z = 20;
  for (const [side, arm, ga, gc, gh] of arms) {
    drawArm(buf, L, m, arm, side === 'L' ? -1 : 1, toS, s, ga, gc, gh, z);
    z += 4;
  }
  return head;
}

export { G as GROUPS };
