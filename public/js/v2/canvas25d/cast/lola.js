// Lola Byte (owner: PRESENTERS A stream). Co-anchor of WORLD NOW: deep blue
// blazer over a soft white scoop top, a thin gold necklace and studs, a sleek
// auburn bob with a deep side part ("the girl in blue").
import { P } from '../../../palette.js';
import { toneN, decal } from '../pixbuf.js';
import { headHW } from '../head.js';
import { LocalXY, localBox, clumpTone } from './kit-a.js';
import { clamp } from '../space.js';
import { defineLook } from './base.js';

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
  skin: [P.skin, P.tan, P.skinShade, P.tanShade], // tan skin, warm softer shadows (world-now.md §5 item 10: face L* 55-73)
  skinLine: P.brown,
  hair: { style: 'bob', ramp: [P.rust, P.brown, P.maroon, P.black], line: P.black }, // auburn, not candy orange
  mustache: null,
  torso: { neckHW: 3.0, shoulderTop: 3.0, shoulderHW: 18.4, sideHW: 17.2, bottom: 46, vDepth: 16, shoulderJoint: [15.8, 7.0] },
  outfit: 'blazer',
  jacket: { ramp: [P.steel, P.navy, P.ink, P.black], line: P.black }, // deep blue, darker than her face; cool steel sheen (no candy-bright blue)
  shirt: { ramp: [P.white, P.silver, P.fog, P.steel], line: P.steel }, // a soft white top: the face stays the brightest warm area
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
// Finish (owner, 17:50): the ends tuck under with a rounded corner and a
// shaded underside; the big side of the parting carries a little more volume;
// the fringe sweeps in a soft S with fine strand tips at its edge; the sheen is
// a halo of short rust strokes on brown, one per clump, not a flat patch;
// clumps fall from the crown with broken separations. LOD: wides keep the
// silhouette and two tones, mediums a narrow sheen band, close-ups the clumps.
const LXY = new LocalXY();
const CO = { cw: 1.55, s: 1, seed: 11, sep: true, hiLo: 3.6, hiHi: 9.2, hiW: 0.42, gap: 4.2, keepLit: true };
export function drawBob(buf, L, m, head, s, lag) {
  const H = L.head;
  const cyc = H.craniumY - 0.3;
  const RV = H.R + 1.5;
  const yawX = Math.sin(head.yaw) * H.R * 0.8;
  const pitchShift = Math.sin(head.pitch) * 2.0;
  const bottom = H.chinY - 1.6;
  const part = -2.4;
  const tier = s < 1.35 ? 0 : s < 2.2 ? 1 : 2;
  const [x0, y0, x1, y1] = localBox(head, -RV - 2.2, H.top - 1.8, RV + 2.2, bottom + 1);
  const q = LXY.set(head);
  CO.s = s;
  CO.cw = s >= 3 ? 1.9 : 2.2;
  const crownX = part + 0.6, crownY = H.top + 0.6;
  buf.shape(x0, y0, x1, y1, m.hair, (px, py) => {
    q.at(px, py);
    const x0l = q.x, y = q.y;
    // the ends of the bob swing a moment after the head (follow-through)
    const swing = y > 0 ? lag * Math.min(1, y / bottom) ** 2 : 0;
    const x = x0l - swing;
    if (y > bottom + 0.5) return -1;
    const fuller = x > 0 ? 0.3 : 0; // the big side of the parting
    let inMass;
    if (y < cyc) {
      const r = RV + fuller * Math.max(0, 1 - (cyc - y) / RV);
      inMass = x * x + (y - cyc) * (y - cyc) <= r * r;
    } else {
      const k = (y - cyc) / (bottom - cyc);
      let hwHair = RV + fuller + 0.35 * k;
      // the ends curl under: the outer corner rounds off over the last ~1.1 u
      const e = (y - (bottom - 1.1)) / 1.1;
      if (e > 0) hwHair -= 1.25 * (1 - Math.sqrt(Math.max(0, 1 - e * e)));
      inMass = Math.abs(x) <= hwHair;
    }
    if (!inMass) return -1;
    const fx = x - yawX;
    const hw = headHW(H, y, head.jaw);
    // face window: forehead open under the part, a soft S sweep across to the far temple
    const sw = Math.max(0, fx - part);
    let sweepY = Math.min(-3.3, H.top + 3.5 + sw * 0.62 + Math.sin(fx * 1.7) * 0.15 - 0.35 * Math.sin(Math.min(1, sw / 7) * Math.PI));
    if (tier === 2 && fx > part + 0.8) sweepY += 0.28 * Math.abs(((sw * 1.35) % 2) - 1); // fine strand tips along the sweep's edge
    const fringe = (fx < part ? H.top + 4.1 : sweepY) + pitchShift;
    const inset = 0.85 - Math.max(0, y) * 0.02;
    if (y > fringe && Math.abs(x) < hw - inset && y < H.chinY + 2) return -1;
    if (y > H.chinY - 1.5 && Math.abs(x) < hw + 0.5) return -1;
    const ddx = x / RV, ddy = clamp((y - cyc) / (RV * 1.2), -1, 1);
    let t = toneN(m.hair, ddx * 0.9, ddy * 0.9);
    const nearFace = y > fringe - 0.2 && Math.abs(x) < hw + 1.0;
    const underside = y > bottom - 0.55 - (Math.abs(x) > hw + 1.6 ? 0.25 : 0);
    if (tier === 0) {
      if (nearFace) t = Math.max(t, x > 0 ? 3 : 2);
      return t;
    }
    if (tier === 1) {
      // mediums keep the approved auburn sheen; a few strands break it in two-shots and wider mediums
      if (t <= 1 && s >= 1.8) {
        const sv = y < fringe + 0.5 && fx > part ? (y - (H.top + 3.5) - (fx - part) * 0.62) : fx - Math.max(0, y - cyc) * 0.1;
        if ((((sv * 1.1) % 2.6) + 2.6) % 2.6 < 0.3) t = t + 1;
      }
      if (nearFace) t = Math.max(t, x > 0 ? 3 : 2);
      else if (underside) t = Math.max(t, 2);
      return t;
    }
    // close-up: clumps radiate from the crown; the sheen is a halo of strokes
    const dxc = fx - crownX, dyc = y - crownY;
    const u = Math.sqrt(dxc * dxc + dyc * dyc);
    // clumps fan out from the crown: radial near it, splitting further out so none gets thinner than cw
    const v = Math.atan2(dxc, Math.max(0.2, dyc)) * Math.max(5.2, u) + 30;
    if (nearFace) return Math.max(t, x > 0 ? 3 : 2);
    if (underside) return Math.max(t, x > 0 ? 3 : 2);
    const d2 = x * x + (y - cyc) * (y - cyc);
    if (d2 > (RV - 0.5) * (RV - 0.5) && y < cyc && t >= 2) return t; // clean outer edge for the rim
    // the sheen is a band at a fixed "latitude" of the dome (distance from the dome's centre), not round the crown
    return clumpTone(t, v, Math.sqrt(d2), CO);
  });
}

// The back of the bob, behind the head and neck (its ends tuck under like the front).
export function drawBobBack(buf, L, m, head) {
  const H = L.head;
  const bottom = H.chinY - 1.2;
  const hw = H.R + 1.4;
  const [x0, y0, x1, y1] = localBox(head, -hw - 0.5, -0.5, hw + 0.5, bottom + 0.5);
  const q = LXY.set(head);
  buf.shape(x0, y0, x1, y1, m.hairBack, (px, py) => {
    q.at(px, py);
    const x = q.x, y = q.y;
    if (y < 0 || y > bottom) return -1;
    const e = (y - (bottom - 1.2)) / 1.2;
    const lim = hw - (e > 0 ? 1.3 * (1 - Math.sqrt(Math.max(0, 1 - e * e))) : 0);
    if (Math.abs(x) > lim) return -1;
    return Math.abs(x) > hw - 1.5 ? 2 : 3;
  });
}

export function drawEarrings(buf, L, head, s, lag) {
  const H = L.head;
  const gold = decal(L.earrings), dark = decal(P.orange), glint = decal(P.white);
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
      if (s >= 3) buf.plot(cx, cy, glint, 1); // the key light's specular on the stud
    }
  }
}
