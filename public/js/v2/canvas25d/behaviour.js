// Listener / eyeline behaviour layer of the canvas25d rig (owner: FACES
// stream). This is where the detail the owner loved lives: "the girl in blue
// looks at him when he has spoken (not all the time, only at the start)".
//   applyLook()     rig layer 4: perf.look = [{ t0, t1 }] glances at the partner;
//                   the eyes lead by ~0.12 s, the head follows (0.38 s in, 0.42 s out)
//   applyListen()   while not speaking and perf.listen: an occasional small nod
// direction/behaviour.js decides WHEN those glances and nods happen from the
// live episode data; this file only performs them.
import { smooth } from './space.js';

/** Layer 4. Returns the updated eye-drive weight (max of `gestLook` and the looks). */
export function applyLook(c, perf, t, gestLook) {
  for (const lk of perf.look || []) {
    const inE = smooth((t - lk.t0) / 0.12) * (1 - smooth((t - lk.t1 + 0.05) / 0.15));
    const inH = smooth((t - lk.t0 - 0.06) / 0.38) * (1 - smooth((t - lk.t1) / 0.42));
    c.lookX += 0.8 * inE;
    c.yaw += 0.4 * inH;
    c.lean += 0.015 * inH;
    c.hx += 0.4 * inH;
    gestLook = Math.max(gestLook, inE);
  }
  return gestLook;
}

/** Listening without speech: an occasional small nod (prototype rule; to be replaced by motivated nods). */
export function applyListen(c, perf, t, seed) {
  const q = (t + seed) % 5.2;
  if (q < 0.6) c.pitch += 0.06 * Math.sin((q / 0.6) * Math.PI);
}
