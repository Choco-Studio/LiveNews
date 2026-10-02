// Head geometry and skin for the canvas25d rig (owner: FACES stream).
//
// The head is an implicit shape in head-local units (origin at the head
// centre, y down): a cranium circle, cheeks and a jaw curve (headHW). Yaw and
// pitch are not rotations of a bitmap: features are pushed around the head's
// curve by faceX(), so a turn slides the far eye in and moves the hairline
// and chin with it. headFrame() maps head-local units to screen pixels (with
// roll), snapping the origin so a still head is a still picture.
//
// Presenter files (cast/<id>.js) only provide parameters (L.head, L.ears,
// skin ramps); a presenter that is not human (UNIT-8) replaces drawHead /
// drawFace through its look's `parts.head` / `parts.face` hooks.
import { clamp } from './space.js';

/** Head half-width at head-local y (units). Returns ≤ 0 outside. */
export function headHW(H, y, jaw = 0) {
  if (y < H.craniumY) {
    const d = y - H.craniumY;
    const v = H.R * H.R - d * d;
    return v > 0 ? Math.sqrt(v) : -1;
  }
  if (y < H.cheekY) return H.R + ((H.cheekHW - H.R) * (y - H.craniumY)) / (H.cheekY - H.craniumY);
  const chinY = H.chinY + jaw;
  if (y > chinY) return -1;
  const u = (y - H.cheekY) / (chinY - H.cheekY);
  let hw = H.cheekHW * Math.pow(Math.max(0, 1 - Math.pow(u, H.jawPow)), 1 / H.jawPow);
  if (u > 0.74) {
    const k = (u - 0.74) / 0.26;
    const chin = H.chinHW * Math.sqrt(Math.max(0, 1 - k * k * k * 0.9));
    if (chin > hw) hw = chin;
  }
  return hw;
}

/** Feature-space x → head-local x after a yaw turn (features ride on the head's curve). */
export function faceX(H, x, y, yaw, protrude = 0) {
  if (!yaw) return x;
  const hw = Math.max(1, headHW(H, clamp(y, H.top + 1, H.chinY - 0.5), 0));
  const a = Math.asin(clamp(x / hw, -0.99, 0.99)) + yaw;
  const jy = clamp((y - H.cheekY) / (H.chinY - H.cheekY), 0, 1);
  return hw * Math.sin(a) + Math.sin(yaw) * (protrude + 1.3 * jy);
}

/** Inverse of faceX for an approximate feature-space x (used by facial hair). */
export function faceInverse(H, x, y, yaw) {
  if (!yaw) return x;
  const hw = Math.max(1, headHW(H, y, 0));
  const a = Math.asin(clamp(x / hw, -0.99, 0.99)) - yaw;
  return hw * Math.sin(a);
}

// ---------------------------------------------------------------------------
// Head frame: head-local units → screen, with roll; yaw/pitch handled by faceX

export function headFrame(L, sk, toS, s) {
  const h = sk.head;
  const [hx, hy] = toS(L.headAt[0] + h.x, L.headAt[1] + h.y);
  const roll = h.roll;
  const cr = Math.cos(roll), sr = Math.sin(roll);
  // snap the head origin so a still head is a still picture
  const cx = Math.round(hx), cy = Math.round(hy);
  return {
    L,
    cx,
    cy,
    s,
    roll,
    cr,
    sr,
    yaw: h.yaw,
    pitch: h.pitch,
    jaw: sk.face.jaw || 0,
    toScreen(x, y) {
      return [cx + s * (x * cr - y * sr), cy + s * (x * sr + y * cr)];
    },
    toLocal(px, py) {
      const dx = px - cx, dy = py - cy;
      return [(dx * cr + dy * sr) / s, (-dx * sr + dy * cr) / s];
    },
  };
}

/** Screen-pixel box that holds the head plus `pad` units (for implicit shapes). */
export function headBox(head, pad) {
  const H = head.L.head;
  const r = (Math.max(H.R, H.cheekHW) + pad) * head.s;
  const top = (H.top - pad) * head.s, bot = (H.chinY + 2 + pad) * head.s;
  const ext = Math.max(r, Math.abs(top), Math.abs(bot));
  return [head.cx - ext - 1, head.cy - ext - 1, head.cx + ext + 1, head.cy + ext + 1];
}

// ---------------------------------------------------------------------------
// Skin

export function drawHead(buf, L, m, head, s) {
  const H = L.head;
  const yawShift = Math.sin(head.yaw);
  const detail = s >= 2.2;
  const eyeY = L.eyes.y;
  const [x0, y0, x1, y1] = headBox(head, 0.5);
  buf.shape(x0, y0, x1, y1, m.skin, (px, py) => {
    const [x, y] = head.toLocal(px, py);
    if (y < H.top - 0.2) return -1;
    const hw = headHW(H, y, head.jaw);
    if (hw <= 0) return -1;
    // the jaw follows the turn a little (3/4 view)
    const jy = clamp((y - H.cheekY) / (H.chinY - H.cheekY), 0, 1);
    const xs = x - yawShift * 1.3 * jy;
    if (Math.abs(xs) > hw) return -1;
    const nx = xs / hw;
    // key light from camera-left: a sculpted terminator that cuts into the eye socket,
    // is pushed out by the cheekbone and comes back in along the jaw
    let term = 0.5;
    term -= 0.16 * Math.exp(-((y - eyeY) * (y - eyeY)) / 1.8);
    term += 0.1 * Math.exp(-((y - eyeY - 2.8) * (y - eyeY - 2.8)) / 2.2);
    term -= 0.2 * jy * jy;
    if (y < H.craniumY - 3) term += 0.08;
    if (nx > term) return nx > term + 0.38 && detail ? 3 : 2;
    // the underside of the chin
    if (y > H.chinY + head.jaw - 0.75) return 2;
    if (detail) {
      // the forehead dome catches the key: a small soft-edged patch, never a sticker
      const fy = (y - (H.top + 3.0)) / 1.6, fxx = (nx + 0.45) / 0.3;
      if (fy * fy + fxx * fxx < 1) return 0;
    }
    return 1;
  });
}

export function drawEars(buf, L, m, head, s) {
  const H = L.head, E = L.ears;
  for (const side of [-1, 1]) {
    // the ear on the side we turn away from slips behind the skull
    const hw = headHW(H, E.y, 0);
    const turn = Math.sin(head.yaw) * side;
    const ex = side * (hw + 0.25 - Math.max(0, turn) * 2.4 + Math.min(0, turn) * 0.4);
    const [sx, sy] = head.toScreen(ex, E.y);
    buf.ellipse(sx, sy, E.w * s, E.h * 0.5 * s, m.skin, head.roll + side * 0.12, side > 0 ? 1 : 0);
    if (s >= 2) {
      // inner ear shadow
      const [ix, iy] = head.toScreen(ex - side * 0.15, E.y + 0.2);
      for (let j = -1; j <= 1; j++) buf.paint(Math.round(ix), Math.round(iy) + j, m.skin, 2);
    }
  }
}
