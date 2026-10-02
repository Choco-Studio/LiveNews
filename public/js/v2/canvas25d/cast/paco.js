// Paco Pixel (owner: PRESENTERS A stream). Veteran anchor of WORLD NOW: the
// owner's reference look ("the one in the dark suit is perfect"): charcoal
// suit, white shirt, red tie, pocket square, short grey hair with a side
// parting and a grey mustache.
//
// Proportions are adult on purpose (owner's tone note: a news channel for
// grown-ups, no big-head mascots): head ≈ 20 u tall and 15 u wide on
// shoulders ≈ 42 u, eyes on the head's half-way line, hands ≈ 0.55 head,
// upper arm ≈ 1.15 head, desk at elbow height.
import { P } from '../../../palette.js';
import { toneN } from '../pixbuf.js';
import { LocalXY, localBox, clumpTone } from './kit-a.js';
import { headHW, faceInverse } from '../head.js';
import { defineLook, SKIN_LIGHT } from './base.js';

export const paco = defineLook({
  id: 'paco',
  name: 'Paco Pixel',
  // head profile (head-local units, y down from the head centre)
  head: { top: -10.2, craniumY: -2.4, R: 7.6, cheekY: 1.6, cheekHW: 7.15, chinY: 9.4, chinHW: 3.0, jawPow: 2.25 },
  headAt: [0, -13.4], // head centre relative to the neck base
  neck: { hw: 3.0 },
  eyes: { y: -0.7, x: 2.95, w: 2.75, h: 1.5, iris: [P.brown, P.maroon], lash: P.maroon, lashes: false, bags: true },
  brows: { y: -2.5, len: 3.3, thick: 0.5, color: P.steel, arch: 0.35 },
  nose: { y0: -0.4, y1: 3.5, w: 1.55, big: true },
  mouth: { y: 6.15, w: 3.8, lip: P.brown, lipHi: P.skinShade, upper: P.skinShade, inner: P.maroon, teeth: P.silver, tongue: P.darkRed },
  ears: { y: -0.1, h: 2.8, w: 1.0 },
  skin: SKIN_LIGHT,
  skinLine: P.brown,
  hair: { style: 'paco', ramp: [P.silver, P.fog, P.steel, P.slate], line: P.slate },
  mustache: { ramp: [P.silver, P.fog, P.steel, P.slate], y: 4.35, w: 4.7, h: 1.05 },
  // body
  torso: { neckHW: 3.5, shoulderTop: 2.2, shoulderHW: 21.0, sideHW: 20.0, bottom: 46, vDepth: 26, shoulderJoint: [18.0, 6.6] },
  outfit: 'suit',
  jacket: { ramp: [P.steel, P.slate, P.ink, P.black], line: P.black }, // charcoal: lets the red tie and silver rim read
  shirt: { ramp: [P.white, P.white, P.silver, P.fog], line: P.steel },
  tie: { ramp: [P.red, P.red, P.darkRed, P.maroon], line: P.maroon },
  pocket: true,
  arm: { upper: 23, fore: 21, rUpper: 3.6, rElbow: 3.05, rWrist: 2.4, hand: 11.2 },
  cuff: P.white,
  // personality for the idle layer: calm, economical
  persona: { sway: 0.6, headMotion: 0.7, blinkMin: 2.6, blinkMax: 5.8, energy: 0.7, smile: 0.18 },
  parts: { hair: drawShortHair, over: drawMustache },
});

// Short grey hair with a side parting and receding temples: volume on top, short sides.
// The silhouette is the approved prototype's; the finish is hand-pixelled
// (owner, 17:50): the hair is combed in clumps from the parting across the
// crown, each clump separated by a broken 1 px shade line, with short silver
// highlight strokes only where the key light falls (upper left); the parting
// lifts the hair beside it; the clipped sides are a quieter texture with a
// shadow under the top's overhang and a sideburn edge. LOD: wide shots keep
// the silhouette, the parting and two tones; mediums add broad clumps and the
// sheen; close-ups add separations.
const LXY = new LocalXY();
const CO = { cw: 1.8, s: 1, seed: 3, sep: true, hiLo: 0.4, hiHi: 7.5, hiW: 0.4, gap: 3.4 };
export function drawShortHair(buf, L, m, head, s) {
  const H = L.head;
  const cyc = H.craniumY - 0.3;
  const RV = H.R + 0.95; // hair volume radius
  const yawX = Math.sin(head.yaw) * H.R * 0.85;
  const [x0, y0, x1, y1] = localBox(head, -RV - 0.6, H.top - 1.6, RV + 0.6, 1.2);
  const pitchShift = Math.sin(head.pitch) * 2.0;
  const part = -2.5;
  const tier = s < 1.35 ? 0 : s < 2.2 ? 1 : 2;
  const q = LXY.set(head);
  CO.s = s;
  CO.cw = s >= 3 ? 1.75 : 2.1;
  CO.sep = tier === 2;
  const sideTop = H.craniumY - 2.5;
  buf.shape(x0, y0, x1, y1, m.hair, (px, py) => {
    q.at(px, py);
    const x = q.x, y = q.y;
    const dx = x, dy = y - cyc;
    const r2 = dx * dx + dy * dy;
    if (y > 0.9) return -1;
    const hw = headHW(H, y, 0);
    // above the ears the sides are clipped short: no volume past the skull below the temples
    const vol = y < sideTop ? RV : y < H.craniumY ? H.R + 0.45 : hw + 0.35;
    if (r2 > vol * vol && Math.abs(x) > vol) return -1;
    if (y >= sideTop && Math.abs(x) > vol) return -1;
    if (y < sideTop && r2 > RV * RV) return -1;
    const fx = x - yawX; // feature-space x (moves with the face when turning)
    const ax = Math.abs(fx);
    const temple = Math.exp(-((ax - H.R * 0.66) * (ax - H.R * 0.66)) / 2.0);
    // a combed-back hairline with a faint wave (strands lift off the forehead in close-ups)
    const wave = tier === 2 ? 0.22 * Math.sin(fx * 1.9 + 0.6) : 0;
    const hairline = H.top + 4.35 + pitchShift - temple * 1.4 + (fx < part ? -0.2 : 0) + ax * ax * 0.01 + wave;
    const sideburn = Math.abs(x) > hw - 0.95 && y < -0.2;
    if (y > hairline && !sideburn) {
      if (Math.abs(x) <= hw - 0.05 || y > H.craniumY - 1.5) return -1;
    }
    const nx = dx / RV, ny = dy / RV;
    let t = toneN(m.hair, nx * 0.95, ny * 0.95);
    // the parting runs back from the hairline with a slight curve and fades toward the crown
    const ry0 = hairline - y;
    const partX = part + ry0 * 0.1 + ry0 * ry0 * 0.03;
    const dPart = fx - partX;
    const partLen = tier === 2 ? 1.9 : 2.4;
    const onPart = y < hairline + 0.1 && ry0 < partLen && Math.abs(dPart) < (tier === 2 ? 0.55 / s + 0.05 : 0.28 + (s < 1.6 ? 0.25 : 0));
    // short sides: lit side stays mid-grey, the far side drops one step
    if (y > H.craniumY - 1) {
      t = x > 0 ? Math.max(t, 2) : Math.min(Math.max(t, 1), 1);
      if (tier === 2) {
        // the top's overhang shades the clipped sides just under it; a sideburn edge in front of the ear
        if (y < H.craniumY - 0.2 && Math.abs(x) > hw - 0.9) t = Math.min(3, t + 1);
        else if (sideburn && Math.abs(x) < hw - 0.45 && y > H.craniumY + 0.6) t = x > 0 ? 3 : 2;
        else if (x < 0 && ((y * 2.1 + x * 0.4) % 1.6 + 1.6) % 1.6 < 0.42) t = 2; // short comb lines
      }
      return t;
    }
    if (onPart) return 2;
    if (tier < 2) return t; // wides and mediums: the approved broad form reads best at this size
    // combed clumps: across (v) / along (u) the comb direction, from the parting
    const ry = y - hairline;
    let v, u;
    if (dPart > 0) {
      v = dPart * 0.85 - ry * 0.6;
      u = dPart * 0.6 + ry * 0.85 + 2.0;
    } else {
      v = -dPart * 0.9 - ry * 0.5 + 40;
      u = -dPart * 0.5 + ry * 0.9 + 2.0;
    }
    // the hair lifts beside the parting: a lit lip on the big side
    if (tier === 2 && dPart > 0.28 && dPart < 0.28 + 1.2 / s && t <= 1 && y < hairline - 0.4) return 0;
    if (r2 > (RV - 0.45) * (RV - 0.45) && t >= 2) return t; // keep the outer edge clean for the rim
    return clumpTone(t, v, u, CO);
  });
}

// A trimmed mustache that follows the turn of the head and lifts with the smile:
// a lit top edge, a shaded underside with fine strand tips, a philtrum gap.
export function drawMustache(buf, L, m, head, s, sk) {
  if (!L.mustache) return;
  const H = L.head, M = L.mustache;
  const face = sk.face;
  const yawX = Math.sin(head.yaw);
  const y0m = M.y, y1m = M.y + M.h;
  const [x0, y0, x1, y1] = localBox(head, -M.w * 0.8 - 1.5, y0m - 0.8, M.w * 0.8 + 1.5, y1m + 1.6);
  const smile = face.smile || 0;
  const tier = s < 1.35 ? 0 : s < 2.2 ? 1 : 2;
  const q = LXY.set(head);
  buf.shape(x0, y0, x1, y1, m.mustache, (px, py) => {
    q.at(px, py);
    const x = q.x, y = q.y;
    if (y < y0m - 0.6 || y > y1m + 1.2) return -1;
    const fx = faceInverse(H, x, y, head.yaw);
    const ax = Math.abs(fx);
    const hwTop = M.w * 0.32, hwBot = M.w * 0.5;
    const k = (y - y0m) / M.h;
    if (k < 0) return -1;
    const droop = Math.max(0, ax - hwBot * 0.55) * (0.35 - smile * 0.25);
    // fine strand tips along the lower edge in close-ups
    const tips = tier === 2 ? 0.16 * (1 - Math.abs(((fx * s * 0.5) % 2 + 2) % 2 - 1) * 2) : 0;
    if (y > y1m + droop + tips) return -1;
    const hw = hwTop + (hwBot - hwTop) * Math.min(1, k * 1.4);
    if (ax > hw) return -1;
    const centreGap = ax < 0.25 && k < 0.35;
    if (centreGap) return -1;
    let t = 1;
    if (k < 0.3) t = 0;
    if (y > y1m + droop - 0.55) t = 2;
    if (fx > hw * 0.55) t = Math.max(t, 2);
    if (yawX > 0.2 && fx < -hw * 0.6) t = 2;
    // the strands' direction: a short down-and-out line on each side in close-ups
    if (tier === 2 && t === 1 && ((ax * 1.6 - k * 2.2) % 1.5 + 1.5) % 1.5 < 0.32 && ax > 0.6) t = 2;
    return t;
  });
}
