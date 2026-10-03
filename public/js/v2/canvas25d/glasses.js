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
// Levels of detail: wide shots (s < 1.35) show the frame on the eye line (the outer
// hinge of each rim and the bridge, lit colour, never a dark bar), medium shots full 1 px rims, close-ups
// a heavier top bar from s 3.2 (rect / half), a lit point on the upper-left of each rim
// (specular, key from camera-left) and a 1 px P.fog glint top-left on each lens.
// A look wears glasses when L.glasses is truthy; the planners substitute the
// `glasses` gesture for looks without them.
import { P } from '../../palette.js';
import { decal } from './pixbuf.js';
import { WRAP, wrapBegin, wrapX } from './head.js';
import { clamp } from './space.js';

const G_GLASSES = 56; // character.js GROUPS.glasses (56-59 reserved for FACES)
const PROTRUDE = 0.9; // the frame sits in front of the face
const MATS = new WeakMap();
const PT = [0, 0];

function matsFor(L) {
  let m = MATS.get(L);
  if (m) return m;
  const r = (L.glasses && L.glasses.ramp) || [P.slate, P.ink, P.black, P.black];
  m = { hi: decal(r[0]), base: decal(r[1]), shade: decal(r[2] || r[1]), glare: decal(P.fog) };
  MATS.set(L, m);
  return m;
}

// mapG input (units): [0] x, [1] y, [2] protrude (scratch, so the call passes no doubles)
const GI = new Float64Array(3);
/**
 * Head-space point GI (units) → screen, through the head's curve, with pitch. Writes `out`.
 * Allocation-free (the wrap goes through head.js WRAP, the projection is inline).
 */
function mapG(head, out) {
  wrapBegin(head.L.head);
  const yy = GI[1] + Math.sin(head.pitch || 0) * 2.0;
  WRAP[0] = GI[0];
  WRAP[1] = yy;
  WRAP[2] = head.yaw || 0;
  WRAP[3] = GI[2];
  wrapX();
  const fx = WRAP[4];
  if (head.cr === undefined) return head.toScreenInto ? head.toScreenInto(fx, yy, out) : Object.assign(out, head.toScreen(fx, yy));
  out[0] = head.cx + head.s * (fx * head.cr - yy * head.sr);
  out[1] = head.cy + head.s * (fx * head.sr + yy * head.cr);
  return out;
}

// rim geometry of one lens (units), written into one reused object by rim()
const RIM = { cx: 0, rw: 0, top: 0, bot: 0 };
/** Rim geometry of one lens (units): centre, half width, top and bottom (the shared RIM object). */
function rim(L, side) {
  const E = L.eyes;
  RIM.rw = E.w * 0.5 + 0.6;
  RIM.cx = side * E.x;
  RIM.top = E.y - E.h * 0.5 - 0.65;
  RIM.bot = E.y + E.h * 0.5 + 0.85;
  return RIM;
}

/** A 1 px line between integer pixels (callers round: doubles passed to a call are boxed). */
function seg(buf, x0, y0, x1, y1, m) {
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
    // wide: the outer hinge of each rim and the bridge, in the frame's lit colour and
    // with skin between them and the eyes: a dark pixel on both sides of each 2 px
    // eye joined by a dark bridge reads as a blindfold at 1 px per unit
    for (let side = -1; side <= 1; side += 2) {
      GI[0] = side * E.x;
      GI[1] = E.y;
      GI[2] = PROTRUDE;
      mapG(head, PT);
      const x = Math.round(PT[0] - 1), y = Math.round(PT[1] - 0.5);
      buf.plot(side < 0 ? x - 1 : x + 2, y, m.hi, 1);
    }
    GI[0] = 0;
    GI[1] = E.y - 0.2;
    GI[2] = PROTRUDE + 0.4;
    mapG(head, PT);
    buf.plot(Math.round(PT[0]), Math.round(PT[1] - 0.5), m.hi, 1);
    buf.part(g0, z0, c0);
    return;
  }
  const shape = style === 'round' ? ROUND : RECT;
  for (let side = -1; side <= 1; side += 2) {
    const R = rim(L, side);
    const cy = (R.top + R.bot) / 2, hh = (R.bot - R.top) / 2;
    const n = shape.length;
    for (let k = 0; k < n; k++) {
      GI[0] = R.cx + shape[k][0] * R.rw;
      GI[1] = cy + shape[k][1] * hh;
      GI[2] = PROTRUDE;
      mapG(head, PT);
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
      seg(buf, Math.round(PX[k]) | 0, Math.round(PY[k]) | 0, Math.round(PX[j]) | 0, Math.round(PY[j]) | 0, mtl);
      // the browline: half-rims and rectangular frames carry a heavier top bar in close-ups
      if (upper && tier === 2 && s >= 3.2 && style !== 'round') seg(buf, Math.round(PX[k]) | 0, Math.round(PY[k] + 1) | 0, Math.round(PX[j]) | 0, Math.round(PY[j] + 1) | 0, m.base);
    }
    if (tier === 2) {
      // a lit edge on the upper-left of the rim (specular, key from camera-left)
      GI[0] = R.cx - R.rw * 0.55;
      GI[1] = R.top;
      GI[2] = PROTRUDE;
      mapG(head, PT);
      buf.plot(Math.round(PT[0]), Math.round(PT[1]), m.hi, 1);
      GI[0] = R.cx - R.rw * 0.25;
      GI[1] = R.top;
      GI[2] = PROTRUDE;
      mapG(head, PT);
      buf.plot(Math.round(PT[0]), Math.round(PT[1]), m.hi, 1);
      // one small glint on the lens, top-left, clear of the iris (never a glare over the eye)
      GI[0] = R.cx - R.rw * 0.66;
      GI[1] = R.top + hh * 0.42;
      GI[2] = PROTRUDE;
      mapG(head, PT);
      buf.plot(Math.round(PT[0]) + 1, Math.round(PT[1]) + 1, m.glare, 1);
    }
    // temple arm: from the hinge back toward the ear, while it stays on the head
    const hinge = side * (Math.abs(R.cx) + R.rw);
    GI[0] = hinge;
    GI[1] = R.top + 0.35;
    GI[2] = PROTRUDE;
    mapG(head, PT);
    const hx = PT[0], hy = PT[1];
    const turn = Math.sin(head.yaw || 0) * side;
    const back = clamp(0.6 + turn * 3.5, 0, 2.2); // the arm shows more on the side turned away from us
    if (back > 0.2) {
      GI[0] = hinge + side * back;
      GI[1] = R.top + 0.5;
      GI[2] = 0;
      mapG(head, PT);
      seg(buf, Math.round(hx) | 0, Math.round(hy) | 0, Math.round(PT[0]) | 0, Math.round(PT[1]) | 0, m.shade);
    }
  }
  // the bridge, between the inner rims at eye level
  const by = L.eyes.y - L.eyes.h * 0.2;
  const Rl = rim(L, -1);
  GI[0] = Rl.cx + Rl.rw;
  GI[1] = by;
  GI[2] = PROTRUDE;
  mapG(head, PT);
  const ax = PT[0], ay = PT[1];
  const Rr = rim(L, 1);
  GI[0] = Rr.cx - Rr.rw;
  GI[1] = by;
  GI[2] = PROTRUDE;
  mapG(head, PT);
  buf.part(gb + G_GLASSES, 14, false);
  seg(buf, Math.round(ax) | 0, Math.round(ay) | 0, Math.round(PT[0]) | 0, Math.round(PT[1]) | 0, m.base);
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
  GI[0] = 0;
  GI[1] = L.eyes.y - L.eyes.h * 0.2;
  GI[2] = PROTRUDE + 0.4;
  return mapG(head, out);
}
