// Keyframe tracks for the canvas25d rig (owner: HANDS & GESTURES stream).
//
// A track is [[time, value, flag?], ...]; values are numbers or arrays.
// Interpolation is a cardinal spline through the keys (continuous velocity,
// so motion flows through a key instead of stopping on it); flag 's' makes
// the motion ease into and out of that key (a hold, or the end of an
// overshoot). Pure and allocation-free: arrays are written into `out`.

const TENSION = 0.85;

function tangent(keys, k, comp) {
  const key = keys[k];
  if (key[2] === 's' || k === 0 || k === keys.length - 1) return 0;
  const a = keys[k - 1], b = keys[k + 1];
  const va = comp < 0 ? a[1] : a[1][comp], vb = comp < 0 ? b[1] : b[1][comp];
  return (TENSION * (vb - va)) / (b[0] - a[0]);
}

function evalComp(keys, t, comp, k) {
  const a = keys[k], b = keys[k + 1];
  const h = b[0] - a[0];
  const u = (t - a[0]) / h;
  const u2 = u * u, u3 = u2 * u;
  const va = comp < 0 ? a[1] : a[1][comp], vb = comp < 0 ? b[1] : b[1][comp];
  const ma = tangent(keys, k, comp), mb = tangent(keys, k + 1, comp);
  return (2 * u3 - 3 * u2 + 1) * va + (u3 - 2 * u2 + u) * h * ma + (-2 * u3 + 3 * u2) * vb + (u3 - u2) * h * mb;
}

/** Value of a track at time t; arrays are written into `out`. */
export function evalTrack(keys, t, out) {
  const n = keys.length;
  const arr = Array.isArray(keys[0][1]);
  if (t <= keys[0][0] || n === 1) return arr ? copy(out, keys[0][1]) : keys[0][1];
  if (t >= keys[n - 1][0]) return arr ? copy(out, keys[n - 1][1]) : keys[n - 1][1];
  let k = 0;
  while (k < n - 2 && keys[k + 1][0] <= t) k++;
  if (!arr) return evalComp(keys, t, -1, k);
  for (let c = 0; c < keys[0][1].length; c++) out[c] = evalComp(keys, t, c, k);
  return out;
}

export function copy(out, v) {
  for (let i = 0; i < v.length; i++) out[i] = v[i];
  return out;
}
