// Listener / eyeline behaviour layer of the canvas25d rig (owner: FACES
// stream). This is where the detail the owner loved lives: "the girl in blue
// looks at him when he has spoken (not all the time, only at the start)".
//   applyLook()     rig layer 4: perf.look = [{ t0, t1, target?, amt?, style? }]
//                   targets
//                     partner  the co-presenter (default; the approved glance:
//                              eyes lead by ~0.12 s, the head follows over 0.38 s,
//                              returns over 0.42 s, a slight lean and a hint of smile)
//                     camera   back to the lens: steadies the eyes (no head move)
//                     notes    down at the desk: eyes and lids drop, the head dips
//                     wall     up and toward +x in partner space (the video wall
//                              behind the desk); a solo seat (perf.side 0) looks up
//                              to a side picked by its seed
//                   amt scales the move (UNIT-8: ~0.4, a 1 px shift); style 'mech'
//                   moves eyes and head together on an ease-in-out, no lead
//                   Overlapping looks never add up: each target takes the
//                   strongest of its looks and several targets share one budget,
//                   so a look planned across a segment boundary merges cleanly.
//   applyListen()   kept for the frozen rig signature; the listening posture now
//                   lives in speech.js (cross-faded with the turn) and listener
//                   nods are planned events (direction/behaviour.js), never a cycle.
// direction/behaviour.js decides WHEN looks and nods happen from the live
// episode data; this file only performs them.
import { smooth } from './space.js';

// pose per target in partner space (channels this layer adds)
//                  lookX lookY  yaw   pitch  lean   hx    hy   lid  smile
const POSE = {
  partner: [0.8, 0, 0.4, 0, 0.015, 0.4, 0, 0, 0.05],
  camera: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  notes: [0.06, 0.95, 0.03, 0.13, 0.01, 0, 0.3, 0.42, 0],
  wall: [0.85, -0.6, 0.45, -0.07, 0.006, 0.3, 0, 0, 0],
};
const NAMES = ['partner', 'camera', 'notes', 'wall'];
const WE = new Float64Array(4), WH = new Float64Array(4), SG = new Float64Array(4);

/** Eye and head weights of one look at t (eyes lead, the head follows; or together for 'mech'). */
function weights(lk, t, out) {
  if (lk.style === 'mech') {
    const w = smooth((t - lk.t0) / 0.4) * (1 - smooth((t - lk.t1) / 0.4));
    out[0] = w;
    out[1] = w;
    return out;
  }
  const notes = lk.target === 'notes';
  out[0] = smooth((t - lk.t0) / 0.12) * (1 - smooth((t - lk.t1 + 0.05) / 0.15));
  out[1] = smooth((t - lk.t0 - 0.06) / (notes ? 0.32 : 0.38)) * (1 - smooth((t - lk.t1) / (notes ? 0.36 : 0.42)));
  return out;
}

const W2 = [0, 0];

/** Layer 4. Returns the updated eye-drive weight (max of `gestLook` and the looks). */
export function applyLook(c, perf, t, gestLook) {
  const list = perf.look;
  if (!list || !list.length) return gestLook;
  WE.fill(0);
  WH.fill(0);
  SG.fill(1);
  let any = false;
  for (let i = 0; i < list.length; i++) {
    const lk = list[i];
    if (t < lk.t0 || t > lk.t1 + 0.5) continue;
    let k = NAMES.indexOf(lk.target || 'partner');
    if (k < 0) k = 0;
    if (k === 0 && perf.side === 0) k = 1; // a solo presenter has no partner: the lens
    weights(lk, t, W2);
    const amt = lk.amt ?? 1;
    if (W2[0] * amt > WE[k]) WE[k] = W2[0] * amt;
    if (W2[1] * amt > WH[k]) WH[k] = W2[1] * amt;
    if (k === 3 && perf.side === 0) SG[3] = (perf.seed ?? 0) & 1 ? 1 : -1;
    any = true;
  }
  if (!any) return gestLook;
  // several targets at once share one budget (a look never adds to another)
  let te = 0, th = 0;
  for (let k = 0; k < 4; k++) {
    te += WE[k];
    th += WH[k];
  }
  const ke = te > 1 ? 1 / te : 1, kh = th > 1 ? 1 / th : 1;
  for (let k = 0; k < 4; k++) {
    const we = WE[k] * ke, wh = WH[k] * kh;
    if (we <= 0 && wh <= 0) continue;
    const p = POSE[NAMES[k]], sg = SG[k];
    c.lookX += p[0] * we * sg;
    c.lookY += p[1] * we;
    c.lid += p[7] * we;
    c.yaw += p[2] * wh * sg;
    c.pitch += p[3] * wh;
    c.lean += p[4] * wh * sg;
    c.hx += p[5] * wh * sg;
    c.hy += p[6] * wh;
    c.smile += p[8] * wh;
    if (we > gestLook) gestLook = we;
  }
  return gestLook;
}

/** Kept for the frozen layer signature: listening has no cyclic motion (see speech.js). */
export function applyListen(c, perf, t, seed) {}
