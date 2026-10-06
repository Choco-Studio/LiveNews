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
