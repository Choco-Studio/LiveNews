// The correspondents (owner 4 Oct: WORLD NOW's links, "poner un reportero hablando sobre ello";
// server/correspondents.js). Three of the channel's own characters, seen in a medium close-up in front of
// pictures of the place (studio/remote.js), never at the desk. Each is built on the presenters' proven parts
// (wardrobe; Rhea on Penny's hair drawers, while Vic and Mika have hair of their own since the owner's 12 Oct note
// that the crop and the bob read as Sam's and Lola's) with a design of their own, distinct from every presenter at 1x:
//   Rhea Raster  EUROPE & AFRICA  black hair pulled back sleek into a low chignon, warm brown skin, a black
//                                 jacket over a white top, small silver studs (nothing like Penny's honey
//                                 chignon and burgundy blazer)
//   Vic Vector   AMERICAS         a black wave crop lying close to the skull with a crisp line-up (his own:
//                                 Sam's crop stands up), deep brown skin, a steel-blue jacket with an open-collar
//                                 white shirt (cool cloth against warm skin: the face stays the warmest thing)
//   Mika Voxel   ASIA & MID-EAST  a sleek black bob with a blunt fringe just above the brows (Lola's bob has a
//                                 side part and a sweep), light warm skin, a pale grey blazer over a black top,
//                                 silver drops
// What makes them correspondents at a glance: an earpiece in the visible ear with its clear tube running
// down into the collar (the classic remote look) and a small lapel microphone on a clip.
import { P } from '../../../palette.js';
import { material, line, toneN } from '../pixbuf.js';
import { headHW } from '../head.js';
import { GROUPS } from '../character.js';
import { deriveLook, SKIN_LIGHT, SKIN_TAN } from './base.js';
import { OUTFITS, registerOutfit } from './outfit.js';
import { LocalXY, localBox, clumpTone, selOutEdge, hairLight, rimMat, HeadWidthLUT } from './kit-a.js';
import { penny, drawSleek, drawChignon } from './penny.js';
import { sam } from './sam.js';
import { lola, drawBobBack, drawEarrings } from './lola.js';

const BUD = material('remote:earpiece', { ramp: [P.slate, P.ink, P.black, P.black], line: P.black, decal: true });
const TUBE = material('remote:tube', { ramp: [P.silver, P.fog, P.steel, P.slate], decal: true });
const MIC = material('remote:mic', { ramp: [P.steel, P.slate, P.ink, P.black], line: P.black, decal: true });
const EP = [0, 0];
const EQ = [0, 0];

/**
 * The earpiece in the camera-right ear and its tube: a dark bud in the ear, the clear tube looping behind the
 * lobe and down the side of the neck into the collar. Under hair that covers the ears (a bob) only the tube
 * shows, coming out below the hair's ends. Medium shots and closer (s ≥ 2): at a wide it would be a speck.
 */
export function drawEarpiece(buf, L, m, head, s) {
  if (s < 2) return;
  const H = L.head, E = L.ears;
  const turn = Math.sin(head.yaw);
  // the camera-right ear slips behind the skull when the head turns that way: then there is nothing to see
  if (turn > 0.35) return;
  const hw = headHW(H, E.y, 0);
  const ex = hw + 0.25 - Math.max(0, turn) * 2.4 + Math.min(0, turn) * 0.4;
  const g = head.gb + GROUPS.look + 12;
  buf.part(g, 13, false);
  const covered = !!L.parts.coversEars;
  const pt = (x, y, out) => head.toScreenInto(x, y, out);
  if (!covered) {
    // the bud in the bowl of the ear (2 px at a medium close-up)
    pt(ex - 0.15, E.y + 0.1, EP);
    const r = Math.max(1, Math.round(0.45 * s));
    for (let y = -r + 1; y < r; y++) for (let x = -r + 1; x < r; x++) if (x * x + y * y < r * r) buf.plot(Math.round(EP[0]) + x, Math.round(EP[1]) + y, BUD, x + y < 0 ? 1 : 2);
  }
  // the tube: behind the lobe, then down the side of the neck into the collar (light: a clear tube catches the
  // key light); it hangs a little off the neck, so its lower end follows the head
  const lobe = E.y + E.h * 0.55;
  const nx = L.neck.hw - 0.45; // just inside the neck's side (the tube runs down the neck, never in the air)
  const collar = -L.headAt[1] - 2.2; // the collar's top, head-local (the neck base is -headAt below the head)
  const pts = covered
    ? [[ex - 0.35, H.chinY - 1.1], [ex - 0.9, H.chinY + 0.9], [nx, H.chinY + 2.2], [nx - 0.15, collar]]
    : [[ex - 0.1, E.y + 0.4], [ex + 0.5, lobe], [ex - 0.1, lobe + 1.7], [nx + 0.2, H.chinY + 1.4], [nx - 0.15, collar]];
  for (let i = 0; i + 1 < pts.length; i++) {
    pt(pts[i][0], pts[i][1], EP);
    pt(pts[i + 1][0], pts[i + 1][1], EQ);
    line(Math.round(EP[0]), Math.round(EP[1]), Math.round(EQ[0]), Math.round(EQ[1]), (x, y) => buf.plot(x, y, TUBE, 1));
  }
}

// The correspondents' wardrobe: their outfit (L.wear), then the lapel microphone clipped to the camera-left
// lapel, below the collar (body units: x left of the centre line, y down from the neck base).
function correspondentOutfit(o) {
  (OUTFITS[o.L.wear] || OUTFITS.blazer)(o);
  const s = o.s;
  if (s < 2) return;
  const [mx, my] = o.toS(-6.2, 9.4, 9);
  // in the jacket's own group: no inner line round it (the resolve's line between groups would eat a 3 px mic)
  o.buf.part(o.gb + GROUPS.jacket, 9, o.clip);
  // a small black capsule with a lit top, on a silver clip that catches the light even on a dark jacket
  const w = Math.max(2, Math.round(0.8 * s)), h = Math.max(3, Math.round(1.1 * s));
  const x0 = Math.round(mx - w / 2), y0 = Math.round(my - h / 2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) o.buf.plot(x0 + x, y0 + y, MIC, y === 0 && x === 0 ? 0 : y === 0 ? 1 : x === w - 1 || y === h - 1 ? 3 : 2);
  for (let x = -1; x <= w; x++) o.buf.plot(x0 + x, y0 + h, TUBE, x < 0 || x === w ? 2 : 0);
}
registerOutfit('correspondent', correspondentOutfit);

export const rhea = deriveLook(penny, {
  id: 'rhea',
  name: 'Rhea Raster',
  head: { top: -9.9, craniumY: -2.7, R: 6.95, cheekY: 1.6, cheekHW: 6.7, chinY: 8.95, chinHW: 2.5, jawPow: 2.1 },
  eyes: { y: -0.6, x: 2.8, w: 2.7, h: 1.42, iris: [P.brown, P.maroon], lash: P.black, lashes: true },
  brows: { y: -2.25, len: 3.15, thick: 0.5, color: P.black, arch: 0.42 },
  mouth: { y: 5.75, w: 3.45, lip: P.brown, lipHi: P.tan, upper: P.tanShade, inner: P.maroon, teeth: P.silver, tongue: P.darkRed },
  skin: SKIN_TAN,
  skinLine: P.maroon,
  hair: { style: 'chignon', ramp: [P.slate, P.ink, P.black, P.black], line: P.black, edge: P.ink, rimTop: false },
  pearls: null,
  props: [],
  outfit: 'correspondent',
  wear: 'tailored',
  neckline: 'scoop',
  jacket: { ramp: [P.steel, P.slate, P.ink, P.black], line: P.black },
  shirt: { ramp: [P.white, P.white, P.silver, P.fog], line: P.steel },
  pin: null,
  earrings: P.silver,
  cuff: P.white,
  persona: { sway: 0.7, headMotion: 0.85, blinkMin: 2.4, blinkMax: 5.4, energy: 0.85, smile: 0.14 },
  mats: { hairD: { ramp: [P.slate, P.ink, P.black, P.black], decal: true } },
  parts: { hairBack: drawChignon, hair: drawRheaHair, over: drawEarpiece },
});
function drawRheaHair(buf, L, m, head, s, sk) {
  drawSleek(buf, L, m, head, s, sk.hairLag || 0);
}

export const vic = deriveLook(sam, {
  id: 'vic',
  name: 'Vic Vector',
  head: { top: -10.4, craniumY: -2.9, R: 7.1, cheekY: 1.9, cheekHW: 6.85, chinY: 9.3, chinHW: 3.05, jawPow: 2.3 },
  eyes: { y: -0.55, x: 2.85, w: 2.6, h: 1.42, iris: [P.maroon, P.black], lash: P.black, lashes: false, bags: false },
  brows: { y: -2.4, len: 3.3, thick: 0.55, color: P.black, arch: 0.3 },
  nose: { y0: -0.3, y1: 3.35, w: 1.6, big: false },
  mouth: { y: 5.8, w: 3.7, lip: P.maroon, lipHi: P.tanShade, upper: P.brown, inner: P.black, teeth: P.silver, tongue: P.darkRed },
  skin: [P.tan, P.tanShade, P.brown, P.maroon],
  skinLine: P.maroon,
  hair: { style: 'wavecrop', ramp: [P.slate, P.ink, P.black, P.black], line: P.black, edge: P.ink, rimTop: false },
  outfit: 'correspondent',
  wear: 'suit',
  collar: 'open',
  tie: null,
  pocket: false,
  jacket: { ramp: [P.fog, P.steel, P.slate, P.ink], line: P.black },
  shirt: { ramp: [P.white, P.white, P.silver, P.fog], line: P.steel },
  cuff: P.white,
  persona: { sway: 0.75, headMotion: 0.95, blinkMin: 2.4, blinkMax: 5.6, energy: 0.95, smile: 0.16 },
  mats: { hairD: { ramp: [P.slate, P.ink, P.black, P.black], decal: true } },
  parts: { hair: drawWaveCrop, over: drawEarpiece },
});

export const mika = deriveLook(lola, {
  id: 'mika',
  name: 'Mika Voxel',
  head: { top: -9.8, craniumY: -2.5, R: 7.1, cheekY: 1.7, cheekHW: 6.75, chinY: 8.7, chinHW: 2.3, jawPow: 2.0 },
  eyes: { y: -0.5, x: 2.8, w: 2.7, h: 1.3, iris: [P.maroon, P.black], lash: P.black, lashes: true },
  brows: { y: -2.1, len: 3.0, thick: 0.45, color: P.black, arch: 0.4 },
  mouth: { y: 5.6, w: 3.3, lip: P.darkRed, lipHi: P.skinShade, upper: P.skinShade, inner: P.maroon, teeth: P.silver, tongue: P.darkRed },
  skin: SKIN_LIGHT,
  skinLine: P.brown,
  hair: { style: 'bob', ramp: [P.slate, P.ink, P.black, P.black], line: P.black, edge: P.ink, rimTop: false },
  outfit: 'correspondent',
  wear: 'blazer',
  necklace: null,
  jacket: { ramp: [P.silver, P.fog, P.steel, P.slate], line: P.slate },
  shirt: { ramp: [P.slate, P.ink, P.black, P.black], line: P.black },
  earrings: P.silver,
  cuff: P.silver,
  persona: { sway: 0.7, headMotion: 0.85, blinkMin: 2.3, blinkMax: 5.2, energy: 0.85, smile: 0.2 },
  mats: { hairD: { ramp: [P.slate, P.ink, P.black, P.black], decal: true } },
  parts: { hairBack: drawBobBack, hair: drawMikaHair, over: drawEarpiece, coversEars: true },
});
function drawMikaHair(buf, L, m, head, s, sk) {
  drawFringeBob(buf, L, m, head, s, sk);
  if (L.earrings) drawEarrings(buf, L, head, s, sk.hairLag || 0);
}

// ---------------------------------------------------------------------------
// Hair of their own for Vic and Mika (owner 12 Oct: Vic's crop read as Sam's, Mika's bob as Lola's)

const LXY = new LocalXY();
const HWL = new HeadWidthLUT();
const CO_FRINGE = { cw: 1.5, s: 1, seed: 113, sep: true, hiLo: 5.2, hiHi: 8.6, hiW: 0.42, gap: 4.6, keepLit: true };

/**
 * Vic's wave crop: short hair brushed flat into waves, lying on the skull (no volume: Sam's textured top stands up),
 * a crisp line-up straight across the forehead with square temples and short square sideburns. The waves are
 * ripples round the crown, each a lit crest toward the key and a dark trough (close-ups; mediums keep broad
 * ripples, the wide the silhouette and two tones). The hairline is an ink sel-out line, the hair light upper right.
 */
export function drawWaveCrop(buf, L, m, head, s) {
  const H = L.head, E = L.ears;
  const tr = s < 1.35 ? 0 : s < 2.2 ? 1 : 2;
  const cyc = H.craniumY - 0.2;
  const RV = H.R + 0.35;
  const yawX = Math.sin(head.yaw) * H.R * 0.85;
  const pitchShift = Math.sin(head.pitch) * 2.0;
  const earTop = E.y - E.h * 0.5;
  const hl = H.top + 3.75 + pitchShift; // the line-up
  const lineX = 4.8; // its half-width across the forehead; outside it the temple drops square to the sideburn
  const per = tr === 2 ? (s >= 3 ? 0.95 : 1.1) : 1.6; // the ripples' spacing (units)
  const px1 = 1 / s;
  const [x0, y0, x1, y1] = localBox(head, -RV - 0.6, H.top - 1.0, RV + 0.6, E.y + 0.6);
  const q = LXY.set(head);
  const HW = HWL.set(H, 0);
  const cx = 0.8, cy = H.top + 2.2; // the crown the waves turn round (feature space)
  buf.shape(x0, y0, x1, y1, m.hair, (px, py) => {
    q.at(px, py);
    const x = q.x, y = q.y;
    if (y > E.y - 0.3) return -1;
    const ax = Math.abs(x);
    const hw = HW.at(y);
    const dy = y - cyc;
    if (y < cyc) {
      if (x * x + dy * dy > RV * RV) return -1;
    } else if (ax > hw + 0.3) return -1;
    const fx = x - yawX;
    const sideburn = ax > hw - 0.65 && y < E.y - 0.4;
    if (y > earTop + 0.15 && !sideburn) return -1;
    // the line-up: straight across, square at the temples, then a band down the side to the sideburn
    if (y > hl - 0.05 && Math.abs(fx) < lineX && ax < hw - 0.05) return -1;
    if (y > hl && ax < hw - 0.75 && !sideburn) return -1;
    let t = toneN(m.hair, (x / RV) * 0.95, (dy / RV) * 0.95);
    if (y > hl) t = Math.max(t, x > 0 ? 2 : 1); // the sides a step down
    if (tr === 0) return t === 0 ? 0 : t >= 2 ? 2 : 1;
    if (x * x + dy * dy > (RV - px1) * (RV - px1) && y < cyc) return t; // a clean outer edge for the hair light
    if (y > hl - px1 * 1.1 && ax < hw) return Math.max(t, 2);
    // the waves: ripples round the crown, a little uneven, the crest lit on the side toward the key
    const rx = fx - cx, ry = (y - cy) * 1.15;
    const rho = Math.sqrt(rx * rx + ry * ry) + 0.18 * Math.sin(Math.atan2(rx, ry) * 3);
    const f = rho / per - Math.floor(rho / per);
    let tt = t;
    if (f < 0.28 && t <= 2) tt = Math.max(0, t - 1);
    else if (f > 0.62 && f < 0.86) tt = Math.min(3, t + 1);
    if (tr === 1 && tt < t && x > 0) tt = t; // mediums: crests only on the lit side
    return tt === t ? t : (m.hairD << 4) | tt;
  });
  const g = head.gb + GROUPS.hair;
  selOutEdge(buf, x0, y0, x1, y1, g, head.gb + GROUPS.head, m.hair, m.hairEdge);
  if (s >= 1.35) hairLight(buf, head, g, rimMat(P.silver), H.R * 0.1, RV + 1, H.top - 1, cyc + 1, Math.max(2, Math.round(s * 1.2)));
}

/**
 * Mika's bob with a blunt fringe: no parting, the fringe cut straight across just above the brows from temple to
 * temple (its corners rounding into the sides), the sides falling straight to the chin and tucking under. Clumps
 * fall straight from the crown; the sheen is a band of strokes round the dome; the fringe's cut edge sits a step
 * down, the curtains by the face in shade. The ends swing after the head.
 */
export function drawFringeBob(buf, L, m, head, s, sk) {
  const H = L.head;
  const lag = sk.hairLag || 0;
  const tr = s < 1.35 ? 0 : s < 2.2 ? 1 : 2;
  const cyc = H.craniumY - 0.3;
  const RV = H.R + 1.35;
  const yawX = Math.sin(head.yaw) * H.R * 0.8;
  const pitchShift = Math.sin(head.pitch) * 2.0;
  const bottom = H.chinY - 1.4;
  const fringeY = L.brows.y - 0.55 + pitchShift; // the blunt cut, just above the brows
  const px1 = 1 / s;
  const [x0, y0, x1, y1] = localBox(head, -RV - 1.4, H.top - 1.8, RV + 1.4, bottom + 1);
  const q = LXY.set(head);
  const HW = HWL.set(H, head.jaw || 0);
  CO_FRINGE.s = s;
  CO_FRINGE.sep = tr === 2;
  CO_FRINGE.cw = s >= 3 ? 1.5 : 1.8;
  buf.shape(x0, y0, x1, y1, m.hair, (px, py) => {
    q.at(px, py);
    const y = q.y;
    const swing = y > 0 ? lag * Math.min(1, y / bottom) ** 2 : 0;
    const x = q.x - swing;
    // close-ups: the blunt ends still break into strand tips
    if (y > bottom + 0.4 - (tr === 2 ? 0.24 * Math.abs((((x * 1.45) % 2) + 2) % 2 - 1) : 0)) return -1;
    const ax = Math.abs(x);
    let inMass;
    if (y < cyc) inMass = x * x + (y - cyc) * (y - cyc) <= RV * RV;
    else {
      // straight sides, the ends tucking under over the last ~1 u
      let hwHair = RV + 0.2 * (y - cyc) / (bottom - cyc);
      const e = (y - (bottom - 1.0)) / 1.0;
      if (e > 0) hwHair -= 1.1 * (1 - Math.sqrt(Math.max(0, 1 - e * e)));
      inMass = ax <= hwHair;
    }
    if (!inMass) return -1;
    const fx = x - yawX;
    const hw = HW.at(y);
    // the face window: under the blunt fringe (a straight cut whose corners round down into the curtains), the
    // curtains framing the cheeks to the chin
    const corner = Math.max(0, Math.abs(fx) - (hw - 2.2));
    const cut = fringeY + corner * corner * 0.35 + (tr === 2 ? 0.16 * Math.abs((((fx * 1.6) % 2) + 2) % 2 - 1) : 0);
    if (y > cut && ax < hw - 0.8 && y < H.chinY + 2) return -1;
    if (y > H.chinY - 1.5 && ax < hw + 0.5) return -1;
    let t = toneN(m.hair, (x / RV) * 0.9, Math.max(-1, Math.min(1, (y - cyc) / (RV * 1.2))) * 0.9);
    const fringe = y > H.top + 3.0 && y < cut + 0.1 && ax < hw - 0.6;
    const nearFace = y > cut - 0.2 && ax < hw + 1.0;
    if (tr === 0) {
      if (t === 0) {
        const d = Math.sqrt(x * x + (y - cyc) * (y - cyc));
        if (d < RV * 0.45 || d > RV * 0.93) t = 1;
      }
      if (nearFace) t = Math.max(t, x > 0 ? 3 : 2);
      return t;
    }
    if (nearFace && !fringe) return Math.max(t, 2);
    if (fringe && y > cut - 1.2 * px1) return Math.max(t, 2); // the cut edge
    const d2 = x * x + (y - cyc) * (y - cyc);
    if (d2 > (RV - 0.5) * (RV - 0.5) && y < cyc && t >= 2) return t; // a clean outer edge for the hair light
    // straight clumps from the crown (the fringe combed forward, the rest down), the sheen a band round the dome
    const v = fx * (1 + Math.max(0, y - H.top) * 0.02) + 30;
    const ct = clumpTone(t, v, Math.sqrt(d2), CO_FRINGE);
    return ct === t ? t : (m.hairD << 4) | ct;
  });
  const g = head.gb + GROUPS.hair;
  selOutEdge(buf, x0, y0, x1, y1, g, head.gb + GROUPS.head, m.hair, m.hairEdge);
  if (s >= 1.35) hairLight(buf, head, g, rimMat(P.silver), H.R * 0.1, RV + 1.4, H.top - 1.8, cyc + 1, Math.max(2, Math.round(s * 1.2)));
}

export const CORRESPONDENTS = { rhea, vic, mika };
