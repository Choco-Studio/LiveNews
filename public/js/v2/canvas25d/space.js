// Shared rig-space constants and tiny maths for canvas25d.
//
// Rig units are centimetres (1 u = 1 px in the wide shot). The body origin
// is the base of the neck, x to screen-right, y down, z toward the camera.
// Kept in its own module so the character, hands and face files can share
// them without importing each other.

// Oblique projection: points closer to the camera (z > 0) sit lower on screen,
// as seen by a studio camera slightly above eye level.
export const TILT = 0.3;

// The torso leans around this point (body space y, below the neck base).
export const HIP = 40;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/**
 * Two-bone IK: shoulder S, wrist target T, bone lengths L1 and L2, elbow pole hint `pole`; writes the elbow E
 * and the reachable wrist Wt (the target clamped to the arm's reach). Caller-owned arrays, no allocation.
 */
export function ik(S, T, L1, L2, pole, E, Wt) {
  let dx = T[0] - S[0], dy = T[1] - S[1], dz = T[2] - S[2];
  let d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
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
  const pl = Math.sqrt(px * px + py * py + pz * pz) || 1;
  px /= pl;
  py /= pl;
  pz /= pl;
  E[0] = S[0] + dx * a + px * h;
  E[1] = S[1] + dy * a + py * h;
  E[2] = S[2] + dz * a + pz * h;
}
