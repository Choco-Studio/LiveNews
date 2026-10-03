// Penny Sterling (owner: PRESENTERS A stream). The crisp, calm markets
// correspondent of MONEY MINUTE ("after the close", money-minute.md). Her own
// design, distinct from Lola at 1x:
//   - an oval face with defined cheekbones, grey-blue eyes, no glasses
//     (money-minute.md request S2);
//   - honey hair pulled back sleek from a side part into a low chignon that
//     sits behind the nape on the far side: a tight, groomed silhouette with
//     the bun peeking out below the ear (nothing like Lola's bob);
//   - a near-black ink tailored jacket (deeper than Paco's charcoal and Sam's
//     mid-grey, so the three never share a suit at 1x) with narrow notch lapels
//     and a high one-button closure over a crisp white blouse with a soft
//     collar, a small silver bar pin, pearl studs. No green anywhere in the
//     wardrobe: green is market data on screen and the desk line.
// She rests a pen in her hand (props: ['pen'], drawn by HANDS' drawProps; it is
// never a gesture cue) and moves least of the cast (persona.energy 0.6).
import { P } from '../../../palette.js';
import { toneN } from '../pixbuf.js';
import { headHW } from '../head.js';
import { clamp } from '../space.js';
import { GROUPS } from '../character.js';
import { defineLook, SKIN_LIGHT } from './base.js';
import { LocalXY, localBox, clumpTone, strokeTone, selOutEdge, hairLight, rimMat, HeadWidthLUT, dec } from './kit-a.js';

export const penny = defineLook({
  id: 'penny',
  name: 'Penny Sterling',
  head: { top: -9.75, craniumY: -2.7, R: 6.85, cheekY: 1.3, cheekHW: 6.55, chinY: 8.85, chinHW: 2.2, jawPow: 1.95 },
  headAt: [0, -12.9],
  neck: { hw: 2.4 },
  eyes: { y: -0.6, x: 2.72, w: 2.65, h: 1.4, iris: [P.steel, P.slate], lash: P.black, lashes: true },
  brows: { y: -2.2, len: 3.1, thick: 0.42, color: P.tanShade, arch: 0.5 },
  nose: { y0: -0.2, y1: 3.15, w: 1.2, big: false },
  mouth: { y: 5.7, w: 3.3, lip: P.darkRed, lipHi: P.skinShade, upper: P.skinShade, inner: P.maroon, teeth: P.silver, tongue: P.darkRed },
  ears: { y: -0.15, h: 2.7, w: 0.95 },
  skin: SKIN_LIGHT,
  skinLine: P.brown,
  // the hairline gets a tanShade (local) line; the hair light sits on the upper right only
  hair: { style: 'chignon', ramp: [P.cream, P.tan, P.tanShade, P.brown], line: P.brown, edge: P.tanShade, rimTop: false },
  mustache: null,
  glasses: null, // money-minute.md S2: no glasses
  props: ['pen'], // the resting pen (HANDS draws it); never a gesture cue
  pearls: [P.white, P.silver, P.fog],
  torso: { neckHW: 2.9, shoulderTop: 3.0, shoulderHW: 18.1, sideHW: 16.7, bottom: 46, vDepth: 15.5, shoulderJoint: [15.5, 7.0] },
  outfit: 'tailored',
  neckline: 'blouse',
  lapel: { notchY: 6.4, w: 4.0, collarW: 3.1 },
  jacket: { ramp: [P.steel, P.ink, P.black, P.black], line: P.black }, // ink, tailored: the blouse and face carry the light
  shirt: { ramp: [P.white, P.white, P.silver, P.fog], line: P.steel }, // crisp white blouse (cool shade: the face stays the warmest)
  pin: { at: [5.6, 9.6], ramp: [P.white, P.silver, P.steel] },
  buttons: 1,
  arm: { upper: 21, fore: 19.5, rUpper: 3.0, rElbow: 2.6, rWrist: 2.05, hand: 10.2 },
  cuff: P.white,
  persona: { sway: 0.5, headMotion: 0.7, blinkMin: 2.6, blinkMax: 5.8, energy: 0.6, smile: 0.16 },
  mats: { hairD: { ramp: [P.cream, P.tan, P.tanShade, P.brown], decal: true } }, // hair strokes (kit-a strokeTone)
  parts: { hairBack: drawChignon, hair: drawSleekAndPearls },
});

function drawSleekAndPearls(buf, L, m, head, s, sk) {
  drawSleek(buf, L, m, head, s, sk.hairLag || 0);
  drawPearls(buf, L, head, s);
}

// Sleek hair pulled back from a side part. Silhouette: close to the skull; on
// the big side a soft sweep crosses the temple and is tucked back above the
// ear. Finish: long combed clumps with continuous fine separations (groomed,
// not textured), a sheen of fine cream strokes over the lit crown (never a
// flat light patch: the face stays the brightest warm area), the hair beside
// the face in shade.
const LXY = new LocalXY();
const HWL = new HeadWidthLUT();
const CO = { cw: 1.55, s: 1, seed: 41, sep: true, hiLo: 2.0, hiHi: 6.6, hiW: 0.22, gap: 5.0 };
export function drawSleek(buf, L, m, head, s) {
  const H = L.head;
  const cyc = H.craniumY - 0.2;
  const RV = H.R + 0.55;
  const yawX = Math.sin(head.yaw) * H.R * 0.85;
  const pitchShift = Math.sin(head.pitch) * 2.0;
  const part = -2.3;
  const tier = s < 1.35 ? 0 : s < 2.2 ? 1 : 2;
  const earTop = L.ears.y - L.ears.h * 0.5;
  const [x0, y0, x1, y1] = localBox(head, -RV - 0.6, H.top - 1.2, RV + 0.6, earTop + 0.6);
  const q = LXY.set(head);
  const HW = HWL.set(H, 0);
  CO.s = s;
  CO.cw = s >= 3 ? 1.6 : 2.0;
  CO.sep = tier === 2;
  buf.shape(x0, y0, x1, y1, m.hair, (px, py) => {
    q.at(px, py);
    const x = q.x, y = q.y;
    if (y > earTop + 0.3) return -1;
    const hw = HW.at(y);
    if (y < cyc) {
      if (x * x + (y - cyc) * (y - cyc) > RV * RV) return -1;
    } else if (Math.abs(x) > hw + 0.3) return -1;
    const fx = x - yawX;
    const dPart = fx - part;
    // hairline: clean and high on the small side; on the big side the sweep dips across the temple
    const sweep = dPart > 0 ? 1.45 * Math.sin(clamp(dPart / 9.0, 0, 1) * Math.PI * 0.8) : 0;
    // close-ups: the sweep's edge is fine strand ends, not a ruled line across the forehead
    const tips = tier === 2 && dPart > 0.9 ? 0.26 * Math.abs(((dPart * 1.25) % 2) - 1) : 0;
    const hairline = H.top + 4.25 + pitchShift + sweep + tips - (dPart < 0 ? 0.15 : 0);
    if (y > hairline) {
      // beside the face only a thin band of hair runs back over the ear
      if (Math.abs(x) <= hw - 0.25) return -1;
      if (y > earTop - 0.2 && Math.abs(x) < hw + 0.05) return -1;
    }
    const nx = x / RV, ny = clamp((y - cyc) / (RV * 1.1), -1, 1);
    let t = toneN(m.hair, nx * 0.95, ny * 0.95);
    const nearFace = y > hairline - 0.3 && Math.abs(x) < hw + 0.4;
    // (the wide: the far side's shade one step lighter, a brown curtain beside a 15 px head read as dark hair)
    if (nearFace) t = Math.max(t, x > 0 && tier > 0 ? 3 : 2);
    const onPart = y < hairline + 0.1 && y > hairline - 2.6 && Math.abs(dPart) < 0.24 + (s < 1.6 ? 0.25 : 0);
    if (onPart) return 2;
    if (nearFace) return t;
    if (tier < 2) {
      // blonde catches the key in a narrow band only (mediums), none in wides: a 1 px cream line
      // across a 15 px head reads as noise, and the face stays the brightest warm area
      if (t === 0) {
        // the wide keeps her blonde (owner 22:50: presenters looked different far and near): cream on the lit
        // upper quarter of the dome only, the rest tan
        if (tier === 0) return x < 0.6 && y < cyc - 0.6 ? 0 : 1;
        const band = (x + 1.2) * (x + 1.2) * 0.08 + (y - (H.top + 2.2));
        return Math.abs(band) < 0.8 ? 0 : 1;
      }
      return t;
    }
    if (x * x + (y - cyc) * (y - cyc) > (RV - 0.4) * (RV - 0.4) && t >= 2) return t; // clean outer edge for the rim
    // combed back from the part: over the crown on the big side, down the small side
    const ry = y - hairline;
    let v, u;
    if (dPart > 0) {
      v = dPart * 0.7 - ry * 0.75 + 20;
      u = dPart * 0.75 + ry * 0.7 + 1.5;
    } else {
      v = -dPart * 0.85 - ry * 0.55 + 60;
      u = -dPart * 0.55 + ry * 0.85 + 1.5;
    }
    // uneven clump widths: a gentle warp so the combed lines never read as parallel stripes
    v += 0.2 * CO.cw * Math.sin(v * 1.7 / CO.cw + 0.8);
    return strokeTone(t, clumpTone(t, v, u, CO), m.hairD);
  });
  const g = head.gb + GROUPS.hair;
  selOutEdge(buf, x0, y0, x1, y1, g, head.gb + GROUPS.head, m.hair, m.hairEdge);
  if (s >= 1.35) hairLight(buf, head, g, rimMat(P.silver), H.R * 0.15, RV + 1, H.top - 1.5, cyc + 1, Math.max(2, Math.round(s * 1.2)));
}

// The low chignon behind the nape on the far side, with the band of hair that
// runs down behind the ear into it. Drawn behind head and neck (hairBack),
// so only the part outside the head's silhouette shows: a groomed bump below
// the ear that moves with the head. Strands wrap round the bun.
const CHIG = { cw: 1.1, s: 1, seed: 47, sep: true, hiLo: 0.2, hiHi: 3.4, hiW: 0.4, gap: 2.2 };
export function drawChignon(buf, L, m, head, s, sk) {
  const H = L.head;
  const lag = sk ? sk.hairLag || 0 : 0;
  // low at the nape, behind the jaw's corner on the far side: it peeks out under the ear as a neat bun
  const bx = H.R * 0.62 + 0.15 * lag, by = 5.5, rx = 3.3, ry = 2.8;
  const tier = s < 1.35 ? 0 : s < 2.2 ? 1 : 2;
  const [x0, y0, x1, y1] = localBox(head, -H.R - 0.6, -2.5, bx + rx + 0.8, by + ry + 0.8);
  const q = LXY.set(head);
  const HW = HWL.set(H, 0);
  CHIG.s = s;
  CHIG.sep = tier === 2;
  // behind the head it sits in the head's shadow: the back-hair material (no rim, one step darker),
  // so it reads as hair behind the jaw and never as a lit lump on the cheek
  buf.shape(x0, y0, x1, y1, m.hairBack, (px, py) => {
    q.at(px, py);
    const x = q.x, y = q.y;
    const ex = (x - bx) / rx, ey = (y - by) / ry;
    const d2 = ex * ex + ey * ey;
    // the band behind the ear (head silhouette + 0.6 u on the far side, down to the bun)
    const hw = HW.at(Math.min(y, H.cheekY));
    const band = x > 0 && y > -2.2 && y < by && Math.abs(x) < hw + 0.6 && Math.abs(x) > hw - 1.5;
    if (d2 > 1 && !band) return -1;
    if (d2 > 1) return 2;
    // the bun: lit upper left, a wrapping strand pattern, deep underside (never the cream highlight)
    let t = Math.max(1, toneN(m.hair, ex * 0.85, ey * 0.85));
    if (ey > 0.45 || ex > 0.6) t = Math.max(t, 2);
    if (tier < 2) return t;
    const ang = Math.atan2(ey, ex);
    const r = Math.sqrt(d2);
    return clumpTone(t, ang * 2.2 + r * 3.1 + 10, ang * 2.0 + 4, CHIG);
  });
}

// Pearl studs on the earlobes: a silver bead with a white glint (1 px in wides).
function drawPearls(buf, L, head, s) {
  if (!L.pearls) return;
  const H = L.head, E = L.ears;
  const hi = dec(L.pearls[0]), base = dec(L.pearls[1]), sh = dec(L.pearls[2]);
  for (let side = -1; side <= 1; side += 2) {
    const hw = headHW(H, E.y, 0);
    const turn = Math.sin(head.yaw) * side;
    if (turn > 0.35) continue; // hidden behind the head
    const ex = side * (hw + 0.25 - Math.max(0, turn) * 2.4 + Math.min(0, turn) * 0.4);
    const [px, py] = head.toScreen(ex, E.y + E.h * 0.42);
    const cx = Math.round(px), cy = Math.round(py);
    if (s < 1.6) continue; // a lone pixel at the ear reads as noise in wides and two-shots
    if (s < 2.2) {
      buf.plot(cx, cy, base, 1);
      continue;
    }
    buf.plot(cx, cy, hi, 1);
    buf.plot(cx + 1, cy, base, 1);
    buf.plot(cx, cy + 1, base, 1);
    buf.plot(cx + 1, cy + 1, sh, 1);
  }
}
