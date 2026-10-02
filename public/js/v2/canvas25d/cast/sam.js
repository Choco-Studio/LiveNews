// Sam Night (owner: PRESENTERS A stream). The calm late-shift anchor of NEWS
// IN 60 ("read by one calm presenter", news-60.md): concise, exact, dry when
// it fits. His own design, distinct from Paco at 1x:
//   - a younger, longer face with a squarer jaw and straight, darker brows;
//   - short textured dark-brown hair with a flatter, squarer top that sits a
//     little higher than Paco's combed volume, tapered sides and a short fringe
//     pushed up, its tips breaking the hairline;
//   - a navy suit with an open-collared pale shirt (no tie): neutral wardrobe,
//     because the programme's yellow belongs to the graphics.
// Skin stays on the untinted P.skin / P.skinShade ramp (news-60.md "Set and
// light": face mean L* ≥ 60).
import { P } from '../../../palette.js';
import { toneN } from '../pixbuf.js';
import { headHW } from '../head.js';
import { defineLook, SKIN_LIGHT } from './base.js';
import { LocalXY, localBox, clumpTone } from './kit-a.js';

export const sam = defineLook({
  id: 'sam',
  name: 'Sam Night',
  head: { top: -10.5, craniumY: -3.0, R: 6.85, cheekY: 2.0, cheekHW: 6.5, chinY: 9.35, chinHW: 2.95, jawPow: 2.35 },
  headAt: [0, -14.3],
  neck: { hw: 3.05 },
  eyes: { y: -0.5, x: 2.7, w: 2.55, h: 1.38, iris: [P.tanShade, P.brown], lash: P.maroon, lashes: false, bags: false },
  brows: { y: -2.45, len: 3.3, thick: 0.5, color: P.brown, arch: 0.28 },
  nose: { y0: -0.3, y1: 3.3, w: 1.4, big: false },
  mouth: { y: 5.75, w: 3.6, lip: P.brown, lipHi: P.skinShade, upper: P.skinShade, inner: P.maroon, teeth: P.silver, tongue: P.darkRed },
  ears: { y: -0.25, h: 2.7, w: 0.95 },
  skin: SKIN_LIGHT,
  skinLine: P.brown,
  hair: { style: 'crop', ramp: [P.tanShade, P.brown, P.maroon, P.black], line: P.black },
  mustache: null,
  torso: { neckHW: 3.4, shoulderTop: 2.4, shoulderHW: 20.3, sideHW: 18.9, bottom: 46, vDepth: 23.5, shoulderJoint: [17.5, 6.8] },
  outfit: 'suit',
  collar: 'open',
  jacket: { ramp: [P.steel, P.navy, P.ink, P.black], line: P.black }, // navy: the silver rim keeps it off the dark set
  shirt: { ramp: [P.white, P.silver, P.fog, P.steel], line: P.steel }, // pale shirt, quieter than white next to the face
  tie: null,
  pocket: false,
  buttons: 1,
  arm: { upper: 22.5, fore: 20.5, rUpper: 3.4, rElbow: 2.9, rWrist: 2.3, hand: 11.0 },
  cuff: P.silver,
  // calm and economical: the least sway of the men, a slow blink
  persona: { sway: 0.5, headMotion: 0.72, blinkMin: 2.8, blinkMax: 6.2, energy: 0.78, smile: 0.15 },
  parts: { hair: drawCrop },
});

// Short textured crop. Silhouette: a squarer top (superellipse) slightly higher
// than the skull, tight tapered sides, short sideburns. Finish: short clumps
// pushed up from the hairline and fanning back, separations broken often (a
// textured cut, not combed), a few warm highlight strokes on the lit front,
// the fringe's tips breaking the hairline; the sides are darker and finer.
const LXY = new LocalXY();
const CO = { cw: 1.3, s: 1, seed: 21, sep: true, hiLo: 0.3, hiHi: 3.6, hiW: 0.46, gap: 1.35 };
export function drawCrop(buf, L, m, head, s) {
  const H = L.head;
  const cyc = H.craniumY - 0.2;
  const a = H.R + 0.75; // half-width of the top's volume
  const topY = H.top - 2.5; // the top of the volume (head-local): the textured top stands up
  const b = cyc - topY;
  const yawX = Math.sin(head.yaw) * H.R * 0.85;
  const pitchShift = Math.sin(head.pitch) * 2.0;
  const tier = s < 1.35 ? 0 : s < 2.2 ? 1 : 2;
  const [x0, y0, x1, y1] = localBox(head, -a - 0.6, topY - 0.6, a + 0.6, 0.8);
  const q = LXY.set(head);
  CO.s = s;
  // close-ups: fine clumps; wider mediums (s ≥ 1.75): a few broad clumps so the top never reads as a cap
  const clumps = tier === 2 || s >= 1.75;
  CO.cw = s >= 3 ? 1.25 : tier === 2 ? 1.6 : 2.7;
  CO.sep = clumps;
  buf.shape(x0, y0, x1, y1, m.hair, (px, py) => {
    q.at(px, py);
    const x = q.x, y = q.y;
    if (y > 0.4 || y < topY) return -1;
    const ax0 = Math.abs(x);
    if (ax0 > a) return -1;
    const hw = headHW(H, y, 0);
    if (y < cyc) {
      // a squarer top than Paco's round volume
      // the front-left (camera-left) is pushed up a little higher than the back-right
      const lean = 1 + 0.15 * clamp1(-x / a);
      const ux = ax0 / a, uy = (cyc - y) / (b * lean);
      if (ux > 1 || uy > 1) return -1;
      if (ux * ux * Math.sqrt(ux) + uy * uy * Math.sqrt(uy) > 1) return -1; // superellipse, p = 2.5
      if (hw > 0 && ax0 > hw + 0.3 + (cyc - y) * 0.6) return -1; // the volume tapers into the short sides
    } else if (ax0 > hw + 0.3) return -1;
    const fx = x - yawX;
    const ax = Math.abs(fx);
    // hairline: straight across with a soft M at the temples; the fringe's tips break it in close-ups
    const temple = Math.exp(-((ax - H.R * 0.62) * (ax - H.R * 0.62)) / 1.6);
    let hairline = H.top + 3.75 + pitchShift - temple * 0.55 + ax * ax * 0.008;
    if (tier === 2 && ax < H.R * 0.55) hairline += 0.38 * (1 - Math.abs(((fx / CO.cw + 0.3) % 1 + 1) % 1 * 2 - 1));
    const sideburn = ax0 > hw - 0.8 && y < 0.1;
    if (y > hairline && !sideburn) {
      if (ax0 <= hw - 0.05 || y > H.craniumY - 0.8) return -1;
    }
    const nx = x / (a + 0.2), ny = clamp1((y - cyc) / (b + 0.6));
    let t = toneN(m.hair, nx * 0.95, ny * 0.95);
    // tapered sides: one step darker, the far side deeper
    if (y > cyc - 0.6 && ax0 > hw - 1.1) {
      t = x > 0 ? Math.max(t, 2) : Math.max(t, 1);
      if (tier === 2 && sideburn && y > -0.8) t = x > 0 ? 3 : 2;
      return t === 0 ? 1 : t;
    }
    if (!clumps) return t;
    // textured top: clumps pushed up from the hairline, fanning back
    const up = hairline - y; // along the strands (units from the hairline)
    // clumps of uneven width (a warped across-coordinate), fanning back from the hairline
    const v0 = fx * (1 + up * 0.06) - up * 0.42 + 30; // pushed up and over to the right
    const v = v0 + 0.38 * CO.cw * Math.sin(v0 * 1.9 / CO.cw + 1.3);
    if ((x * x) / (a * a) + Math.pow((cyc - y) / b, 2) > 0.8 && t >= 2) return t; // clean outer edge for the rim
    return clumpTone(t, v, up, CO);
  });
}

const clamp1 = (v) => (v < -1 ? -1 : v > 1 ? 1 : v);
