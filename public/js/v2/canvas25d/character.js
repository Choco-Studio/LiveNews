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
// Wave 2 (PRESENTERS A): the neck is shaded (the jaw casts a soft shadow on
// it, the far side turns away), outfit drawers get the head frame and the
// inverse body transform (o.head, o.inv) so wardrobe details can be authored
// in body units, and CHAR_PROFILE times each section for the labs.
import { HIP, TILT, clamp } from './space.js';
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
 * Optional section timings (ms, accumulated while `on`), read by the labs'
 * profile(): hair = hairBack + hair, look = over hook, face = head + face
 * (FACES' 1.5 ms), arms = props + arms (HANDS), body = neck + outfit + ears.
 */
export const CHAR_PROFILE = { on: false, body: 0, face: 0, hair: 0, look: 0, arms: 0, n: 0 };
const now = () => performance.now();

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
  const P = CHAR_PROFILE.on;
  let t0 = P ? now() : 0;

  // ---- back hair (e.g. a bob) behind the head and neck
  const head = headFrame(L, sk, toS, s);
  head.gb = gb; // group base for look hooks: buf.part(head.gb + GROUPS.look + i, z)
  if (parts.hairBack) {
    buf.part(gb + G.hairBack, 2, false);
    parts.hairBack(buf, L, m, head, s, sk);
  }
  if (P) t0 = lap('hair', t0);

  // ---- neck (in the chin's shadow)
  buf.part(gb + G.neck, 4, clip);
  const [n0x, n0y] = toS(0, 1.5);
  const nt = head.toScreen(0, 6);
  buf.capsule(nt[0], nt[1], n0x, n0y, L.neck.hw * s, L.neck.hw * 1.05 * s, m.skin, 1);
  if (s >= 1.35) shadeNeck(buf, L, head, gb + G.neck, nt, n0x, n0y, s);

  // ---- clothes (inv: screen → body space, for wardrobe details authored in body units)
  INV.ox = ox;
  INV.oy = oy;
  INV.cl = cl;
  INV.sl = sl;
  INV.bx = bx;
  INV.by = by;
  INV.s = s;
  drawOutfit({ buf, L, m, sk, toS, s, gb, G, clip, head, inv: INV });

  // ---- ears, head, face, hair, then whatever sits over the face
  if (!parts.coversEars) {
    buf.part(gb + G.ears, 9, false);
    drawEars(buf, L, m, head, s);
  }
  if (P) t0 = lap('body', t0);
  buf.part(gb + G.head, 10, false);
  (parts.head || drawHead)(buf, L, m, head, s);
  (parts.face || drawFace)(buf, L, head, sk.face, s);
  if (P) t0 = lap('face', t0);
  buf.part(gb + G.hair, 12, false);
  parts.hair(buf, L, m, head, s, sk);
  if (P) t0 = lap('hair', t0);
  if (parts.over) {
    buf.part(gb + G.over, 13, false);
    parts.over(buf, L, m, head, s, sk);
  }
  if (P) t0 = lap('look', t0);

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
  if (P) {
    lap('arms', t0);
    CHAR_PROFILE.n++;
  }
  return head;
}

function lap(key, t0) {
  const t1 = now();
  CHAR_PROFILE[key] += t1 - t0;
  return t1;
}

// Screen → body space for outfit drawers (one shared object; drawers read it
// synchronously). Body x = ((px - ox)/s - bx), y = ((py - oy)/s - by), then the
// lean rotation is undone around HIP (z = 0 plane).
const INV = {
  ox: 0, oy: 0, cl: 1, sl: 0, bx: 0, by: 0, s: 1, x: 0, y: 0,
  at(px, py) {
    const X = (px - this.ox) / this.s - this.bx;
    const Y = (py - this.oy) / this.s - this.by - HIP;
    this.x = X * this.cl + Y * this.sl;
    this.y = -X * this.sl + Y * this.cl + HIP;
  },
};

/**
 * Shade the neck: the jaw casts a soft crescent shadow under the chin (deeper
 * on the far side of the key light), the far side of the neck turns away.
 * Repaints only pixels of the neck group, in head-local units.
 */
function shadeNeck(buf, L, head, g, nt, n0x, n0y, s) {
  const H = L.head;
  const hw = L.neck.hw;
  const x0 = Math.max(1, Math.floor(Math.min(nt[0], n0x) - hw * s * 1.2)), x1 = Math.min(buf.w - 1, Math.ceil(Math.max(nt[0], n0x) + hw * s * 1.2));
  const y0 = Math.max(1, Math.floor(nt[1] - hw * s)), y1 = Math.min(buf.h - 1, Math.ceil(n0y + hw * s));
  const { cx, cy, cr, sr } = head;
  const k = 1 / s;
  const jaw = head.jaw || 0;
  const w = buf.w, grp = buf.grp, mat = buf.mat, tone = buf.tone;
  const close = s >= 2.2;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * w + x;
      if (!mat[i] || grp[i] !== g) continue;
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const lx = (dx * cr + dy * sr) * k, ly = (-dx * sr + dy * cr) * k;
      const nx = clamp(lx / hw, -1.2, 1.2);
      // under the jaw: a crescent that follows the jaw line, ~1.4 u deep at the centre, deeper on the right
      const shadowY = H.chinY + jaw + (close ? 1.1 : 0.8) - 0.22 * lx * lx / hw + Math.max(0, nx) * 0.9;
      let t = tone[i];
      if (ly < shadowY) t = Math.max(t, 2);
      if (nx > 0.55) t = Math.max(t, 2);
      if (close && nx > 0.82 && ly < shadowY + 1.2) t = 3;
      if (nx < -0.7 && ly >= shadowY) t = Math.min(t, 1);
      tone[i] = t;
    }
  }
}

export { G as GROUPS };
