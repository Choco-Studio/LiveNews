// Camera-relative hand orientation (owner: HANDS & GESTURES stream), shared by hands.js (which builds the
// hand frame every frame) and gestures/index.js (which bakes each gesture's pronation side once, at
// registration). No imports, so it is safe in every module import order.
//
// A hand's roll is authored camera-relative: `facing` +1 shows the palm to the lens, −1 the back, and in
// between the palm turns toward the side of natural pronation (down and a little outward) or, with `sup`,
// the other way. That side used to be decided per frame from the hand direction alone, so a hand whose
// screen direction swept across the "down-outward" line (every release from an outward point back to the
// desk) flipped its palm through 180° in one frame (critic r3: the lift / point_partner flutter). Now each
// gesture carries the side of its decisive pose as a channel (`pro`, baked here), so the roll is continuous
// for the whole gesture; the per-frame rule only remains for callers that do not pass one.

/**
 * REF: the direction most toward the camera perpendicular to the unit hand axis f (the palm faces it at
 * facing = 1); when the hand points at the lens it blends toward "up" so it never flips. Written into out.
 */
export function camRef(f, out) {
  out[0] = -f[0] * f[2];
  out[1] = -f[1] * f[2];
  out[2] = 1 - f[2] * f[2];
  const rl = Math.sqrt(out[0] * out[0] + out[1] * out[1] + out[2] * out[2]);
  if (rl < 0.35) {
    // "up" (0, -1, 0) made perpendicular to f, mixed in as f turns toward the lens
    const k = (0.35 - rl) / 0.35;
    out[0] += f[0] * f[1] * k;
    out[1] += (f[1] * f[1] - 1) * k;
    out[2] += f[2] * f[1] * k;
  }
  const l = Math.sqrt(out[0] * out[0] + out[1] * out[1] + out[2] * out[2]) || 1;
  out[0] /= l;
  out[1] /= l;
  out[2] /= l;
  return out;
}

/** f × REF, unit (f and REF are perpendicular unit vectors): the axis the palm turns toward. */
export function rollAxis(f, ref, out) {
  const x = f[1] * ref[2] - f[2] * ref[1], y = f[2] * ref[0] - f[0] * ref[2], z = f[0] * ref[1] - f[1] * ref[0];
  const l = Math.sqrt(x * x + y * y + z * z) || 1;
  out[0] = x / l;
  out[1] = y / l;
  out[2] = z / l;
  return out;
}

/** The per-frame pronation side (±1) of the roll axis c for an arm on screen side ±1: sign of D·c. */
export function pronationOf(c, side) {
  const dc = c[1] - side * 0.35 * c[0];
  return dc > 1e-3 ? 1 : dc < -1e-3 ? -1 : side;
}

const F = [0, 0, 0], R = [0, 0, 0], C = [0, 0, 0];
/** Pronation side of a hand pointing along v (any length, screen or partner space) on arm side ±1. */
export function pronationSide(v, side) {
  const l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
  F[0] = v[0] / l;
  F[1] = v[1] / l;
  F[2] = v[2] / l;
  return pronationOf(rollAxis(F, camRef(F, R), C), side);
}

const PR = [0, 0, 0], PC = [0, 0, 0];
/**
 * The authored palm normal of a hand along unit f: facing (+1 palm to the lens, −1 back), sup (0 the palm
 * turns to the pronation side, 1 the other way), pro (that side, ±1; fractional while two gestures blend).
 * A change of side turns through the NEARER pole: "palm to camera" while the palm faces the lens, "back to
 * camera" while the back does (a sup switch at facing −1 is no motion at all). Written into out; also
 * leaves REF / the roll axis in ref / axis when given.
 */
export function palmNormal(f, facing, sup, pro, out, ref = PR, axis = PC) {
  camRef(f, ref);
  rollAxis(f, ref, axis);
  const sgn = pro * (1 - 2 * sup);
  const a = Math.acos(facing < -1 ? -1 : facing > 1 ? 1 : facing);
  const th = facing >= 0 ? a * sgn : Math.PI - (Math.PI - a) * sgn;
  const ct = Math.cos(th), st = Math.sin(th);
  let x = ref[0] * ct + axis[0] * st, y = ref[1] * ct + axis[1] * st, z = ref[2] * ct + axis[2] * st;
  const l = Math.sqrt(x * x + y * y + z * z) || 1;
  out[0] = x / l;
  out[1] = y / l;
  out[2] = z / l;
  return out;
}
