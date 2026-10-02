// Ada Volt (owner: PRESENTERS B stream). Sceptical British tech analyst of
// TECH BYTES: she asks the hard question, and her 'glasses' gesture comes just
// before it. A charcoal-black fine-gauge roll-neck with no jacket
// (cast/wardrobe-b.js 'turtleneck'), dark rectangular glasses (drawn by FACES'
// glasses.js from L.glasses), and sharp, straight, shoulder-length near-black
// hair with a deep side part: the long side falls past her jaw on the lit side,
// the other side is tucked behind the ear, showing a small silver stud.
// A dry, intelligent resting face: straight brows, a low resting smile.
import { P } from '../../../palette.js';
import { decal } from '../pixbuf.js';
import { headHW, headBox } from '../head.js';
import { drawGlasses } from '../glasses.js';
import { clamp } from '../space.js';
import { defineLook, SKIN_LIGHT } from './base.js';
import { local, screen, tier } from './wardrobe-b.js';

export const ada = defineLook({
  id: 'ada',
  name: 'Ada Volt',
  head: { top: -9.9, craniumY: -2.7, R: 7.05, cheekY: 1.6, cheekHW: 6.7, chinY: 8.9, chinHW: 2.2, jawPow: 1.9 },
  headAt: [0, -13.1],
  neck: { hw: 2.4 },
  eyes: { y: -0.6, x: 2.8, w: 2.65, h: 1.35, iris: [P.steel, P.ink], lash: P.black, lashes: true },
  brows: { y: -2.35, len: 3.25, thick: 0.46, color: P.black, arch: 0.3 },
  nose: { y0: -0.3, y1: 3.3, w: 1.2, big: false },
  mouth: { y: 5.75, w: 3.3, lip: P.brown, lipHi: P.skinShade, upper: P.skinShade, inner: P.maroon, teeth: P.silver, tongue: P.darkRed },
  ears: { y: -0.1, h: 2.7, w: 0.95 },
  skin: SKIN_LIGHT,
  skinLine: P.brown,
  // near-black hair: ink body, slate where it turns to the key, steel only in the sheen
  hair: { style: 'straight', ramp: [P.steel, P.slate, P.ink, P.black], line: P.black },
  glasses: { style: 'rect', ramp: [P.slate, P.ink, P.black, P.black] },
  earrings: P.silver,
  torso: { neckHW: 2.9, shoulderTop: 3.0, shoulderHW: 17.9, sideHW: 16.7, bottom: 46, vDepth: 14, shoulderJoint: [15.5, 7.0] },
  outfit: 'turtleneck',
  jacket: { ramp: [P.steel, P.slate, P.ink, P.black], line: P.black }, // charcoal knit (sleeves share it)
  shirt: { ramp: [P.steel, P.slate, P.ink, P.black], line: P.black },
  cuff: P.ink,
  arm: { upper: 21.2, fore: 19.6, rUpper: 2.95, rElbow: 2.55, rWrist: 2.0, hand: 10.2 },
  persona: { sway: 0.5, headMotion: 0.75, blinkMin: 2.8, blinkMax: 6.2, energy: 0.8, smile: 0.05 },
  mats: {
    collar: { ramp: [P.steel, P.slate, P.ink, P.black], line: P.black, rim: P.silver },
  },
  parts: { hairBack: drawHairBack, hair: drawStraight, over: drawOver },
});

const PART = 2.3; // the side part, right of centre in feature space
const END = 14.2; // where the cut ends (head-local y), resting on the shoulder
const LC = [0, 0], SC = [0, 0];

// Strand columns (deterministic) so the dark lines inside a panel never shimmer.
const strandAt = (u) => {
  const k = Math.floor(u);
  const h = Math.sin(k * 12.9898) * 43758.5453;
  return h - Math.floor(h);
};

// The hair behind the head and neck (only visible beside the neck and under the jaw).
function drawHairBack(buf, L, m, head, s, sk) {
  const H = L.head;
  const lag = sk.hairLag || 0;
  const cyc = H.craniumY - 0.3;
  const [x0, y0] = headBox(head, 3.0);
  const [, , x1] = headBox(head, 3.0);
  const y1 = screen(head, 0, END + 1, SC)[1] + 2;
  buf.shape(x0, y0, x1, y1, m.hairBack, (px, py) => {
    local(head, px, py, LC);
    const y = LC[1];
    if (y < cyc || y > END - 0.4) return -1;
    const k = clamp((y - 2) / (END - 2), 0, 1);
    const x = LC[0] - lag * k * k;
    // the long side: a full panel; the tucked side: only a sliver behind the ear and neck
    const jaw = headHW(H, Math.min(y, H.chinY - 0.5), 0);
    const hw = x < 0 ? H.R + 1.0 + k * 0.9 : y < H.craniumY + 1 ? H.R + 0.6 : Math.min(jaw + 0.55, H.R + 0.4) - Math.max(0, y - H.chinY) * 0.08;
    if (Math.abs(x) > hw) return -1;
    return x < 0 ? 2 : 3;
  });
}

// Crown, the long side, the tucked side and the swept fringe.
function drawStraight(buf, L, m, head, s, sk) {
  const H = L.head, E = L.ears;
  const lag = sk.hairLag || 0;
  const tr = tier(s);
  const yawX = Math.sin(head.yaw) * H.R * 0.8;
  const pitchShift = Math.sin(head.pitch) * 2.0;
  const cyc = H.craniumY - 0.3;
  const RV = H.R + 1.15;
  const earTop = E.y - E.h * 0.5 - 0.15;
  const [x0, y0, x1] = headBox(head, 3.2);
  const y1 = screen(head, 0, END + 1.2, SC)[1] + 2;
  const strandW = tr === 2 ? 1.25 : 2.2;
  buf.shape(x0, y0, x1, y1, m.hair, (px, py) => {
    local(head, px, py, LC);
    const y = LC[1];
    const k = y > 2 ? clamp((y - 2) / (END - 2), 0, 1) : 0;
    const x = LC[0] - lag * k * k; // the ends swing a moment after the head
    const fx = x - yawX;
    const hw = headHW(H, y, 0);
    // ---- where is hair?
    let zone = 0; // 1 crown, 2 long side (screen left), 3 tucked side
    if (y < cyc) {
      if (x * x + (y - cyc) * (y - cyc) <= RV * RV) zone = 1;
    } else if (x < 0) {
      const outer = H.R + 1.15 + k * 0.55;
      const inner = y < H.chinY - 1.2 ? Math.max(0.5, hw - 0.45) : Math.max(2.4, headHW(H, H.chinY - 1.2, 0) - 0.45 - (y - H.chinY + 1.2) * 0.12);
      const endY = END + 0.5 - (-x - inner) * 0.08; // blunt cut, a touch longer at the front
      if (-x <= outer && -x >= inner && y <= endY) zone = 2;
      else if (y < H.chinY - 1.2 && -x < inner && y < -0.5 && -x > hw - 1.0) zone = 2;
    } else if (y < earTop + 0.6) {
      const outer = H.R + 0.9 - Math.max(0, y - cyc) * 0.18;
      if (x <= outer && x >= hw - 0.35) zone = 3;
    }
    if (!zone) return -1;
    // ---- the face window under the fringe: open right of the part, a sweep down to the left temple
    const sweep = H.top + 4.05 + pitchShift + Math.max(0, PART - fx) * 0.43 - Math.max(0, PART - fx) ** 2 * 0.012;
    const fringe = fx > PART ? H.top + 4.05 + pitchShift + (fx - PART) * 0.08 : sweep;
    if (y > fringe && Math.abs(x) < hw - 0.6 && y < H.chinY + 1.5 && zone === 1) return -1;
    if (zone === 1 && y > fringe && x > 0 && Math.abs(x) < hw + 0.3 && y > cyc - 1) return -1;
    // ---- tone: crown as a sphere, the side panels as cylinders, sheen on the crown
    let t;
    if (zone === 1) {
      const nx = x / RV, ny = (y - cyc) / RV;
      const l = -0.55 * nx - 0.65 * ny;
      t = l > 0.55 ? 1 : l > -0.2 ? 2 : 3;
      // sheen: a broken band across the crown on the lit side
      const band = (x + 1.2) * (x + 1.2) * 0.06 + (y - (H.top + 2.3));
      if (Math.abs(band) < 0.55 && x < 3.0 && (tr === 0 || strandAt((fx + 20) / strandW) > 0.25)) t = 0;
      // the part: a dark line from the hairline back over the crown
      if (tr > 0 && Math.abs(fx - PART - (y - fringe) * 0.12) < 0.3 + (tr === 1 ? 0.2 : 0) && y > H.top + 0.6 && y < fringe + 0.2) t = 3;
      // under the fringe edge the hair turns in: one darker row
      if (y > fringe - 0.5 / s * 2 && y <= fringe + 0.6 && Math.abs(x) < hw) t = Math.max(t, 2);
    } else if (zone === 2) {
      const outer = H.R + 1.15 + k * 0.55;
      const inner = y < H.chinY - 1.2 ? hw - 0.7 : 2.4;
      const u = clamp((-x - inner) / Math.max(0.6, outer - inner), 0, 1); // 0 face side → 1 outer edge
      t = u > 0.72 ? 1 : u > 0.18 ? 2 : 3;
      if (y < 0.5 && u > 0.55) t = 1; // where it falls over the skull it still catches the key
      if (tr === 2 && t === 2 && strandAt((fx + 20) / strandW) < 0.22) t = 3;
      if (tr > 0 && y > END - 0.9) t = Math.max(t, 2); // the blunt ends sit in shadow
    } else {
      t = x > hw + 0.5 ? 3 : 2;
    }
    return t;
  });
}

// Glasses (FACES' drawGlasses), then the stud on the tucked-side ear.
function drawOver(buf, L, m, head, s, sk) {
  drawGlasses(buf, L, head, sk.face, s);
  if (!L.earrings || s < 1.2) return;
  const H = L.head, E = L.ears;
  const turn = Math.sin(head.yaw);
  if (turn > 0.35) return; // the ear has slipped behind the skull
  const hw = headHW(H, E.y, 0);
  screen(head, hw + 0.15 - Math.max(0, turn) * 2.4, E.y + E.h * 0.38, SC);
  const cx = Math.round(SC[0]), cy = Math.round(SC[1]);
  const a = decal(L.earrings), b = decal(P.fog);
  buf.plot(cx, cy, a, 1);
  if (s >= 2.6) {
    buf.plot(cx, cy + 1, b, 1);
    buf.plot(cx + 1, cy, b, 1);
  }
}
