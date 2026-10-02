// Lola Byte (owner: PRESENTERS A stream). Co-anchor of WORLD NOW: deep blue
// blazer over a cream scoop top, a thin gold necklace and studs, a sleek
// auburn bob with a deep side part ("the girl in blue").
import { P } from '../../../palette.js';
import { toneN, decal } from '../pixbuf.js';
import { headHW, headBox } from '../head.js';
import { clamp } from '../space.js';
import { defineLook, SKIN_TAN } from './base.js';

export const lola = defineLook({
  id: 'lola',
  name: 'Lola Byte',
  head: { top: -10.0, craniumY: -2.6, R: 7.3, cheekY: 1.8, cheekHW: 6.95, chinY: 9.0, chinHW: 2.4, jawPow: 2.05 },
  headAt: [0, -13.0],
  neck: { hw: 2.55 },
  eyes: { y: -0.6, x: 2.85, w: 2.75, h: 1.45, iris: [P.green, P.darkGreen], lash: P.black, lashes: true },
  brows: { y: -2.15, len: 3.15, thick: 0.45, color: P.brown, arch: 0.55 },
  nose: { y0: -0.2, y1: 3.25, w: 1.25, big: false },
  mouth: { y: 5.8, w: 3.5, lip: P.darkRed, lipHi: P.skinShade, upper: P.tanShade, inner: P.maroon, teeth: P.silver, tongue: P.darkRed },
  ears: { y: -0.1, h: 2.8, w: 1.0 },
  skin: SKIN_TAN,
  skinLine: P.brown,
  hair: { style: 'bob', ramp: [P.rust, P.brown, P.maroon, P.black], line: P.black }, // auburn, not candy orange
  mustache: null,
  torso: { neckHW: 3.0, shoulderTop: 3.0, shoulderHW: 18.4, sideHW: 17.2, bottom: 46, vDepth: 16, shoulderJoint: [15.8, 7.0] },
  outfit: 'blazer',
  jacket: { ramp: [P.blue, P.navy, P.ink, P.black], line: P.black }, // deep blue: darker than her face
  shirt: { ramp: [P.white, P.cream, P.skin, P.tan], line: P.tanShade },
  necklace: [P.yellow, P.orange],
  earrings: P.yellow,
  arm: { upper: 21, fore: 19.5, rUpper: 3.0, rElbow: 2.6, rWrist: 2.05, hand: 10.2 },
  cuff: P.yellow,
  persona: { sway: 0.85, headMotion: 1.05, blinkMin: 2.2, blinkMax: 5.2, energy: 1.05, smile: 0.26 },
  parts: { hairBack: drawBobBack, hair: drawBobAndStuds, coversEars: true },
});

// The bob, then the studs (drawn in the hair group, as in the approved prototype).
function drawBobAndStuds(buf, L, m, head, s, sk) {
  drawBob(buf, L, m, head, s, sk.hairLag || 0);
  if (L.earrings) drawEarrings(buf, L, head, s, sk.hairLag || 0);
}

// Sleek bob with a deep side part and a sweep across the forehead.
export function drawBob(buf, L, m, head, s, lag) {
  const H = L.head;
  const cyc = H.craniumY - 0.3;
  const RV = H.R + 1.5;
  const yawX = Math.sin(head.yaw) * H.R * 0.8;
  const pitchShift = Math.sin(head.pitch) * 2.0;
  const bottom = H.chinY - 1.6;
  const part = -2.4;
  const [x0, y0, x1, y1] = headBox(head, 3.0);
  buf.shape(x0, y0, x1, y1, m.hair, (px, py) => {
    const [x0l, y] = head.toLocal(px, py);
    // the ends of the bob swing a moment after the head (follow-through)
    const swing = y > 0 ? lag * Math.min(1, y / bottom) ** 2 : 0;
    const x = x0l - swing;
    if (y > bottom + 0.5) return -1;
    let inMass;
    if (y < cyc) inMass = x * x + (y - cyc) * (y - cyc) <= RV * RV;
    else {
      const k = (y - cyc) / (bottom - cyc);
      const hwHair = RV + 0.35 * k - (k > 0.85 ? (k - 0.85) * 3.5 : 0);
      inMass = Math.abs(x) <= hwHair;
      if (y > bottom - 0.8) inMass = inMass && Math.abs(x) <= hwHair - (y - (bottom - 0.8)) * 1.8;
    }
    if (!inMass) return -1;
    const fx = x - yawX;
    const hw = headHW(H, y, head.jaw);
    // face window: forehead open under the part, a diagonal sweep across to the far temple
    const sweepY = Math.min(-3.3, H.top + 3.5 + Math.max(0, fx - part) * 0.62 + Math.sin(fx * 1.7) * 0.15);
    const fringe = (fx < part ? H.top + 4.1 : sweepY) + pitchShift;
    const inset = 0.85 - Math.max(0, y) * 0.02;
    if (y > fringe && Math.abs(x) < hw - inset && y < H.chinY + 2) return -1;
    if (y > H.chinY - 1.5 && Math.abs(x) < hw + 0.5) return -1;
    const ddx = x / RV, ddy = clamp((y - cyc) / (RV * 1.2), -1, 1);
    let t = toneN(m.hair, ddx * 0.9, ddy * 0.9);
    // a soft sheen across the crown on the lit side
    const band = (x + 1.5) * (x + 1.5) * 0.07 + (y - (H.top + 2.6));
    if (Math.abs(band) < 0.7 && x < 2.5 && t <= 1) t = 0;
    // strands follow the sweep on top and fall straight on the sides
    if (s >= 1.8 && t === 1) {
      const v = y < fringe + 0.5 && fx > part ? (y - (H.top + 3.5) - (fx - part) * 0.62) : fx * 1.0 - Math.max(0, y - cyc) * 0.1;
      if ((((v * 1.1) % 2.4) + 2.4) % 2.4 < 0.26) t = 2;
    }
    // next to the face the hair is in shadow; the far side deeper
    if (y > fringe - 0.2 && Math.abs(x) < hw + 1.0) t = Math.max(t, x > 0 ? 3 : 2);
    return t;
  });
}

// The back of the bob, behind the head and neck.
export function drawBobBack(buf, L, m, head) {
  const H = L.head;
  const [x0, y0, x1, y1] = headBox(head, 3.2);
  buf.shape(x0, y0, x1, y1, m.hairBack, (px, py) => {
    const [x, y] = head.toLocal(px, py);
    const bottom = H.chinY - 1.2;
    if (y < 0 || y > bottom) return -1;
    const hw = H.R + 1.4;
    if (Math.abs(x) > hw - (y > bottom - 1.2 ? (y - bottom + 1.2) * 1.4 : 0)) return -1;
    return Math.abs(x) > hw - 1.5 ? 2 : 3;
  });
}

export function drawEarrings(buf, L, head, s, lag) {
  const H = L.head;
  const gold = decal(L.earrings), dark = decal(P.orange);
  for (const side of [-1, 1]) {
    const hw = headHW(H, H.chinY - 2.6, 0);
    const [ex, ey] = head.toScreen(side * (hw + 0.1) + lag * 0.6, H.chinY - 1.1);
    // a small gold stud: 1 px in wide shots, 2x2 with a shaded corner in close-ups
    const cx = Math.round(ex), cy = Math.round(ey);
    buf.plot(cx, cy, gold, 1);
    if (s >= 2.2) {
      buf.plot(cx + 1, cy, gold, 1);
      buf.plot(cx, cy + 1, gold, 1);
      buf.plot(cx + 1, cy + 1, dark, 1);
    }
  }
}
