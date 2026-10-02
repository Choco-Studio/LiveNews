// Arms and hands for the canvas25d rig (owner: HANDS & GESTURES stream).
//
// Input is one solved arm from rig.js solve(): 3D shoulder / elbow / wrist
// joints (2-bone IK), the hand direction and the hand shape parameters
// { curl[thumb..pinky] 0 open → 1 curled, spread, facing +1 palm to camera,
// -1 back of hand }. The sleeve is two tapered capsules (upper arm, forearm),
// then a cuff capsule, then the hand: a palm capsule plus a thumb and four
// finger capsules with continuous curl, so a hand opening or pointing is a
// continuous change of shape, never a swap of drawings. Small hands (fingers
// under ~1.35 px thick) fall back to a mitten LOD with an optional extended
// index finger. Foreshortening comes from projecting the 3D hand direction.
//
// Groups: each hand uses 6 consecutive groups (palm, thumb, 4 fingers) so the
// line system (pixbuf.js resolve) draws separation lines between extended
// fingers; curled fingers melt into the palm group so a fist stays one shape.
import { TILT, clamp } from './space.js';

export function drawArm(buf, L, m, arm, side, toS, s, ga, gc, gh, z) {
  const A = L.arm;
  const [sx, sy] = toS(...arm.shoulder);
  const [ex, ey] = toS(...arm.elbow);
  const [wx, wy] = toS(...arm.wrist);
  buf.part(ga, z, false);
  buf.capsule(sx, sy, ex, ey, A.rUpper * s, A.rElbow * s, m.sleeve);
  // forearm stops short of the wrist where the cuff begins
  const fx = wx - ex, fy = wy - ey;
  const fl = Math.hypot(fx, fy) || 1;
  const cuffLen = Math.min(fl * 0.4, 1.3 * s);
  const cx = wx - (fx / fl) * cuffLen, cy = wy - (fy / fl) * cuffLen;
  buf.capsule(ex, ey, cx, cy, A.rElbow * s, A.rWrist * 1.08 * s, m.sleeve);
  buf.part(gc, z + 1, false);
  buf.capsule(cx, cy, wx, wy, A.rWrist * 0.98 * s, A.rWrist * 0.9 * s, m.cuff);
  drawHand(buf, L, m, arm, side, toS, s, gh, z + 2);
}

const FINGER_LEN = [0.5, 0.56, 0.52, 0.42]; // index..pinky, relative to hand length
const FINGER_OFF = [-1.5, -0.5, 0.5, 1.5];

export function drawHand(buf, L, m, arm, side, toS, s, gh, z) {
  const A = L.arm;
  const hd = arm.hand;
  const [wx, wy] = toS(...arm.wrist);
  // 3D hand direction, projected: foreshortening comes for free
  const d = arm.handDir;
  let px = d[0], py = d[1] + d[2] * TILT;
  const plen = Math.hypot(px, py);
  const fore = clamp(plen, 0.3, 1);
  if (plen < 1e-4) {
    px = 0;
    py = 1;
  } else {
    px /= plen;
    py /= plen;
  }
  const len = A.hand * s * fore; // projected hand length (px)
  // the hand's width axis is foreshortened when the palm turns edge-on or up (it then points at the lens)
  const widthK = 0.32 + 0.68 * Math.min(1, Math.abs(hd.facing));
  const pw = A.hand * 0.4 * s * widthK; // palm half-width (px)
  const qx = -py, qy = px; // perpendicular (to the right of the direction)
  const P0 = (u, v) => [wx + px * u + qx * v, wy + py * u + qy * v];
  const palmLen = len * 0.5;
  // which side the thumb is on (palm toward camera → thumb toward the body centre)
  const towardCentre = -side;
  const facing = hd.facing; // +1 palm to camera, -1 back of hand
  const thumbV = Math.sign((towardCentre * facing) * (qx || 1e-6)) || 1;
  const fw = (A.hand * 0.8 * s) / 4.3; // finger thickness does not foreshorten
  const fsp = fw * widthK; // spacing between fingers does
  const curl = hd.curl;
  const mitten = fw < 1.35;
  const [p0x, p0y] = P0(palmLen * 0.18, 0);
  const [p1x, p1y] = P0(palmLen * 0.82, 0);
  buf.part(gh, z, false);
  buf.capsule(p0x, p0y, p1x, p1y, Math.max(pw * 0.92, fw * 0.7), Math.max(pw * 0.98, fw * 0.75), m.hand);
  buf.part(gh + 1, z + 1, false);
  // thumb
  const tc = curl[0];
  const tAng = (0.95 - tc * 0.75) * thumbV;
  const tdx = px * Math.cos(tAng) - py * Math.sin(tAng) * 1, tdy = py * Math.cos(tAng) + px * Math.sin(tAng);
  const [tbx, tby] = P0(palmLen * 0.3, thumbV * pw * 0.55);
  const tl = A.hand * s * 0.42 * (1 - tc * 0.45) * (0.6 + 0.4 * fore);
  buf.capsule(tbx, tby, tbx + tdx * tl, tby + tdy * tl, fw * 0.62, fw * 0.5, m.hand);
  if (mitten) {
    // small: palm + fingers as one rounded shape, plus an extended index when pointing
    const avg = (1 - (curl[1] + curl[2] + curl[3] + curl[4]) / 4) * 0.5 + 0.12;
    const [fx, fy] = P0(palmLen * 0.82 + len * avg * 0.9, 0);
    buf.capsule(p1x, p1y, fx, fy, pw * 0.95, pw * 0.75, m.hand);
    if (curl[1] < 0.4 && curl[2] > 0.6) {
      const [ix, iy] = P0(palmLen * 0.9, -thumbV * 0) ;
      const il = len * FINGER_LEN[0] * (1 - curl[1]) * 1.2;
      buf.capsule(ix, iy, ix + px * (il + palmLen * 0.4), iy + py * (il + palmLen * 0.4), Math.max(0.7, fw * 0.55), Math.max(0.6, fw * 0.45), m.hand);
    }
    return;
  }
  const spread = hd.spread || 0;
  for (let f = 0; f < 4; f++) {
    const c = curl[f + 1];
    // the finger order across the hand flips with the thumb side
    const off = FINGER_OFF[f] * -thumbV;
    const ang = off * spread * 0.13;
    const dx = px * Math.cos(ang) - py * Math.sin(ang), dy = py * Math.cos(ang) + px * Math.sin(ang);
    const [bx, by] = P0(palmLen * 0.86, off * fsp);
    const fl = len * FINGER_LEN[f] * (1 - c * 0.78) + fw * 0.3;
    // extended fingers are their own groups (the line system draws the gaps between them);
    // curled ones melt into the palm so a fist stays one clean shape
    if (c < 0.6) buf.part(gh + 2 + f, z + 2 + (thumbV > 0 ? f : 3 - f), false);
    else buf.part(gh, z, false);
    buf.capsule(bx, by, bx + dx * fl, by + dy * fl, fw * 0.56, fw * 0.48, m.hand);
  }
}
