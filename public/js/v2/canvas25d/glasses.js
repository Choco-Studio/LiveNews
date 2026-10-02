// Glasses for the canvas25d presenters (owner: FACES stream).
//
//   drawGlasses(buf, L, head, f, s)   call it from a look's parts.over hook (Ada).
//                                     Frame style from L.glasses = { style, ramp }:
//                                       'rect'   rectangular rims, softened corners
//                                       'round'  round rims
//                                       'half'   a browline bar over each lens, no lower rim
//                                     ramp = [highlight, base, shade, deep] frame colours.
//                                     The rims ride the head's curve like the eyes
//                                     (faceX: yaw and pitch), so the far lens narrows on
//                                     a turn and the temples run back toward the ears.
//                                     Drawn in groups head.gb + 56..57 (CONTRACTS group
//                                     ids: 56-59 glasses), above the hair at the temples;
//                                     the caller's group and depth are restored afterwards.
//   glassesAnchor(head, which, out)   screen point HANDS' `glasses` gesture reaches for:
//                                     'bridge' (on the nose, between the lenses) or
//                                     'templeL' / 'templeR' (the hinge at the outer rim).
//                                     Returns `out` ([x, y], caller-owned; no allocation).
//
// Levels of detail: wide shots (s < 1.35) show the frame on the eye line (a pixel
// either side of each eye and the bridge), medium shots full 1 px rims, close-ups
// add a lit top edge toward the key light and one small lens glare up and left.
// A look wears glasses when L.glasses is truthy; the planners substitute the
// `glasses` gesture for looks without them.
import { P } from '../../palette.js';
import { decal } from './pixbuf.js';
import { faceX } from './head.js';
import { clamp } from './space.js';

const G_GLASSES = 56; // character.js GROUPS.glasses (56-59 reserved for FACES)
const PROTRUDE = 0.9; // the frame sits in front of the face
const MATS = new WeakMap();
const PT = [0, 0];

function matsFor(L) {
  let m = MATS.get(L);
  if (m) return m;
  const r = (L.glasses && L.glasses.ramp) || [P.slate, P.ink, P.black, P.black];
  m = { hi: decal(r[0]), base: decal(r[1]), shade: decal(r[2] || r[1]), glare: decal(P.silver) };
  MATS.set(L, m);
  return m;
}

/** Head-space point (units) → screen, through the head's curve, with pitch. Writes `out`. */
function mapG(head, x, y, protrude, out) {
  const H = head.L.head;
  const yy = y + Math.sin(head.pitch || 0) * 2.0;
  const fx = faceX(H, x, yy, head.yaw || 0, protrude);
  return head.toScreenInto ? head.toScreenInto(fx, yy, out) : Object.assign(out, head.toScreen(fx, yy));
}

/** Rim geometry of one lens (units): centre, half width, top and bottom. */
function rim(L, side) {
  const E = L.eyes;
  const rw = E.w * 0.5 + 0.6;
  return { cx: side * E.x, rw, top: E.y - E.h * 0.5 - 0.65, bot: E.y + E.h * 0.5 + 0.85 };
}

function seg(buf, ax, ay, bx, by, m) {
  let x0 = Math.round(ax), y0 = Math.round(ay);
  const x1 = Math.round(bx), y1 = Math.round(by);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let n = 0; n < 128; n++) {
    buf.plot(x0, y0, m, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

// rim outline as a closed list of (u, v) on the unit box (-1..1); corners softened
const RECT = [[-1, -0.6], [-0.75, -1], [0.75, -1], [1, -0.6], [1, 0.55], [0.8, 1], [-0.8, 1], [-1, 0.55]];
const ROUND = (() => {
  const out = [];
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 - Math.PI / 2;
    out.push([Math.cos(a), Math.sin(a)]);
  }
  return out;
})();
const PX = new Float64Array(16), PY = new Float64Array(16);

/** Draw the look's glasses over the face (no-op for looks without L.glasses). */
export function drawGlasses(buf, L, head, f, s) {
  if (!L.glasses) return;
  const g0 = buf.g, z0 = buf.cz, c0 = buf.clip;
  const gb = head.gb || 0;
  const m = matsFor(L);
  const style = L.glasses.style || 'rect';
  const tier = s < 1.35 ? 0 : s < 2.2 ? 1 : 2;
  const E = L.eyes;
  buf.part(gb + G_GLASSES, 14, false);
  if (tier === 0) {
    // wide: the frame on the eye line either side of each eye, and the bridge
    for (let side = -1; side <= 1; side += 2) {
      mapG(head, side * E.x, E.y, PROTRUDE, PT);
      const x = Math.round(PT[0] - 1), y = Math.round(PT[1] - 0.5);
      buf.plot(x - 1, y, m.base, 1);
      buf.plot(x + 2, y, m.base, 1);
    }
    mapG(head, 0, E.y - 0.2, PROTRUDE + 0.4, PT);
    buf.plot(Math.round(PT[0]), Math.round(PT[1] - 0.5), m.base, 1);
    buf.part(g0, z0, c0);
    return;
  }
  const shape = style === 'round' ? ROUND : RECT;
  for (let side = -1; side <= 1; side += 2) {
    const R = rim(L, side);
    const cy = (R.top + R.bot) / 2, hh = (R.bot - R.top) / 2;
    const n = shape.length;
    for (let k = 0; k < n; k++) {
      mapG(head, R.cx + shape[k][0] * R.rw, cy + shape[k][1] * hh, PROTRUDE, PT);
      PX[k] = PT[0];
      PY[k] = PT[1];
    }
    buf.part(gb + G_GLASSES + (side > 0 ? 1 : 0), 14, false);
    for (let k = 0; k < n; k++) {
      const j = (k + 1) % n;
      const vk = shape[k][1], vj = shape[j][1];
      // half-rims: only the upper edge (the browline bar), drawn 2 px at close-up
      if (style === 'half' && (vk > 0 || vj > 0)) continue;
      // the upper edge faces the key light; the lower and far edges sit in shade
      const upper = vk <= -0.55 && vj <= -0.55;
      const mtl = upper ? m.base : m.shade;
      seg(buf, PX[k], PY[k], PX[j], PY[j], mtl);
      if (style === 'half' && upper && tier === 2) seg(buf, PX[k], PY[k] + 1, PX[j], PY[j] + 1, m.base);
    }
    if (tier === 2) {
      // a lit edge on the upper-left of the rim (specular, key from camera-left)
      mapG(head, R.cx - R.rw * 0.55, R.top, PROTRUDE, PT);
      buf.plot(Math.round(PT[0]), Math.round(PT[1]), m.hi, 1);
      mapG(head, R.cx - R.rw * 0.25, R.top, PROTRUDE, PT);
      buf.plot(Math.round(PT[0]), Math.round(PT[1]), m.hi, 1);
      // one small glare on the lens, up and left, clear of the iris
      if (side < 0 || s >= 3.2) {
        mapG(head, R.cx - R.rw * 0.62, R.top + hh * 0.55, PROTRUDE, PT);
        const gx = Math.round(PT[0]) + 1, gy = Math.round(PT[1]) + 1;
        buf.plot(gx, gy, m.glare, 1);
        if (s >= 3.2 && side < 0) buf.plot(gx + 1, gy - 1, m.glare, 1);
      }
    }
    // temple arm: from the hinge back toward the ear, while it stays on the head
    const hinge = side * (Math.abs(R.cx) + R.rw);
    mapG(head, hinge, R.top + 0.35, PROTRUDE, PT);
    const hx = PT[0], hy = PT[1];
    const turn = Math.sin(head.yaw || 0) * side;
    const back = clamp(0.6 + turn * 3.5, 0, 2.2); // the arm shows more on the side turned away from us
    if (back > 0.2) {
      mapG(head, hinge + side * back, R.top + 0.5, 0, PT);
      seg(buf, hx, hy, PT[0], PT[1], m.shade);
    }
  }
  // the bridge, between the inner rim tops
  const Rl = rim(L, -1), Rr = rim(L, 1);
  mapG(head, Rl.cx + Rl.rw, Rl.top + 0.45, PROTRUDE, PT);
  const ax = PT[0], ay = PT[1];
  mapG(head, Rr.cx - Rr.rw, Rr.top + 0.45, PROTRUDE, PT);
  buf.part(gb + G_GLASSES, 14, false);
  seg(buf, ax, ay, PT[0], PT[1], m.base);
  buf.part(g0, z0, c0);
}

/**
 * Where a hand touches the glasses, in screen pixels: 'bridge' (on the nose,
 * between the lenses) or 'templeL' / 'templeR' (the hinge at each outer rim).
 * Same geometry as drawGlasses, so the fingertip lands on the frame.
 */
export function glassesAnchor(head, which = 'bridge', out = [0, 0]) {
  const L = head.L;
  if (!L.eyes) return head.toScreenInto ? head.toScreenInto(0, 0, out) : Object.assign(out, head.toScreen(0, 0));
  if (which === 'templeL' || which === 'templeR') {
    const side = which === 'templeL' ? -1 : 1;
    const R = rim(L, side);
    return mapG(head, side * (Math.abs(R.cx) + R.rw), R.top + 0.35, PROTRUDE, out);
  }
  const R = rim(L, -1);
  return mapG(head, 0, R.top + 0.45, PROTRUDE + 0.4, out);
}
