// Glasses for the canvas25d presenters (owner: FACES stream).
//
// STUB published by the wave-2 architect so other streams can wire against a
// frozen signature on day one (CONTRACTS "glasses"):
//   drawGlasses(buf, L, head, f, s)   PRESENTERS B call it from a look's parts.over
//                                     hook (Ada); it draws nothing yet. FACES draws
//                                     the frame (style from L.glasses, e.g.
//                                     { style: 'rect' | 'round' | 'half', ramp }),
//                                     following yaw and pitch, in the groups
//                                     head.gb + GROUPS.glasses .. glassesEnd.
//   glassesAnchor(head, which, out)   screen point HANDS' `glasses` gesture reaches
//                                     for: 'bridge' (nose bridge) or 'templeL' /
//                                     'templeR'. Returns `out` ([x, y], caller-owned).
// A look wears glasses when L.glasses is truthy; the planners substitute the
// `glasses` gesture for looks without them.

/** Draw the look's glasses over the face (no-op until the FACES stream fills it). */
export function drawGlasses(buf, L, head, f, s) {}

/**
 * Where a hand touches the glasses, in screen pixels. The stub uses the eye
 * line from the look's face proportions so the gesture can be built now.
 */
export function glassesAnchor(head, which = 'bridge', out = [0, 0]) {
  const L = head.L;
  const ey = L.eyes ? L.eyes.y : 0;
  const ex = L.eyes ? L.eyes.x + L.eyes.w * 0.9 : 3;
  const x = which === 'templeL' ? -ex : which === 'templeR' ? ex : 0;
  return head.toScreenInto ? head.toScreenInto(x, ey, out) : Object.assign(out, head.toScreen(x, ey));
}
