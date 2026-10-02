// Ada Volt (owner: PRESENTERS B stream). Sceptical British tech analyst of
// TECH BYTES: she asks the hard question, and her 'glasses' gesture comes just
// before it. A charcoal fine-gauge roll-neck with no jacket (cast/wardrobe-b.js
// 'turtleneck'), dark rectangular glasses (drawn by FACES' glasses.js from
// L.glasses), and sharp, straight, shoulder-length near-black hair with a deep
// side part: the long side sweeps from the part over the crown and falls past
// her jaw on the lit side, the other side is combed back and tucked behind the
// ear, showing a small silver stud.
// A dry, intelligent resting face: straight brows, a low resting smile.
//
// Hair craft (owner, 17:50: no shapes "made of circles"): the hair is combed in
// clumps that follow the outline of the head (contour strands from the part),
// each clump carrying one staggered sheen stroke where the crown and the outer
// face of the long side turn to the key, broken 1 px separations at close-ups,
// a heavier volume on the big side of the part, a fringe that turns under at
// its edge and blunt ends that step a little strand by strand. LOD: the wide
// keeps the silhouette, the part and two tones; the medium adds broad clumps
// and the sheen; the close-up adds separations and a steel specular.
import { P } from '../../../palette.js';
import { decal } from '../pixbuf.js';
import { headHW } from '../head.js';
import { drawGlasses } from '../glasses.js';
import { clamp } from '../space.js';
import { defineLook, SKIN_LIGHT } from './base.js';
import { local, screen, tier, hwAt, fastAtan2, strandTone, hashInt } from './wardrobe-b.js';

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
  // near-black hair: a black body, ink where it turns to the key, slate in the sheen, steel only as a specular
  hair: { style: 'straight', ramp: [P.steel, P.slate, P.ink, P.black], line: P.black },
  glasses: { style: 'rect', ramp: [P.slate, P.ink, P.black, P.black] },
  earrings: P.silver,
  torso: { neckHW: 2.9, shoulderTop: 3.0, shoulderHW: 17.9, sideHW: 16.7, bottom: 46, vDepth: 14, shoulderJoint: [15.5, 7.0] },
  outfit: 'turtleneck',
  // charcoal knit: a step lighter than her hair so the long side reads against it, still darker than
  // TECH BYTES' lit cove pools; a silver rim keeps the far shoulder off the background
  jacket: { ramp: [P.steel, P.slate, P.ink, P.black], line: P.black },
  shirt: { ramp: [P.steel, P.slate, P.ink, P.black], line: P.black },
  cuff: P.slate,
  arm: { upper: 21.2, fore: 19.6, rUpper: 2.95, rElbow: 2.55, rWrist: 2.0, hand: 10.2 },
  persona: { sway: 0.5, headMotion: 0.75, blinkMin: 2.8, blinkMax: 6.2, energy: 0.8, smile: 0.05 },
  mats: {
    collar: { ramp: [P.steel, P.slate, P.ink, P.black], line: P.black, rim: P.silver }, // the roll of the same knit
  },
  parts: { hairBack: drawHairBack, hair: drawStraight, over: drawOver },
});

const PART = 2.3; // the side part, right of centre in feature space
const END = 14.2; // where the cut ends (head-local y), resting on the shoulder
const LC = [0, 0], SC = [0, 0];
const ST = { sw: 1.25, s: 1, seed: 29, lo: 0, hi: 0, stagger: 2.2, hiW: 0.5, sep: false, gap: 3.2, spec: false, skip: 0.25, sepShare: 0.65, sepOn: 0.55 };

// The hair behind the head and neck. Only the tucked side can show (a sliver behind the ear
// and the neck); on the long side the front panel and the body cover it.
function drawHairBack(buf, L, m, head, s, sk) {
  const H = L.head;
  const lag = sk.hairLag || 0;
  const cyc = H.craniumY - 0.3;
  const x0 = head.cx - 1 * s, x1 = head.cx + (H.R + 2.2) * s;
  const y0 = head.cy + (H.craniumY - 1) * s, y1 = head.cy + (END + 1) * s;
  buf.shape(x0, y0, x1, y1, m.hairBack, (px, py) => {
    local(head, px, py, LC);
    const y = LC[1];
    if (y < cyc || y > END - 0.4) return -1;
    const k = clamp((y - 2) / (END - 2), 0, 1);
    const x = LC[0] - lag * k * k;
    if (x < 0) return -1;
    const jaw = hwAt(L, Math.min(y, H.chinY - 0.5));
    const hw = y < H.craniumY + 1 ? H.R + 0.6 : Math.min(jaw + 0.55, H.R + 0.4) - Math.max(0, y - H.chinY) * 0.08;
    return x > hw ? -1 : 3;
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
  const RV = H.R + 1.1;
  const earTop = E.y - E.h * 0.5 - 0.15;
  const x0 = head.cx - (H.R + 2.6) * s, x1 = head.cx + (H.R + 1.6) * s;
  const y0 = head.cy + (H.top - 2.2) * s, y1 = head.cy + (END + 1.4) * s;
  const px1 = 1 / s;
  ST.s = s;
  const swCrown = tr === 2 ? 1.3 : 2.1, swPanel = tr === 2 ? 1.7 : 2.4;
  ST.sep = tr === 2;
  ST.spec = tr === 2;
  const chin12 = hwAt(L, H.chinY - 1.2);
  const PI2 = Math.PI / 2;
  buf.shape(x0, y0, x1, y1, m.hair, (px, py) => {
    local(head, px, py, LC);
    const y = LC[1];
    const k = y > 2 ? clamp((y - 2) / (END - 2), 0, 1) : 0;
    const x = LC[0] - lag * k * k; // the ends swing a moment after the head
    if (x > 0 && y > earTop + 0.6) return -1; // the tucked side has nothing in front below the ear
    const fx = x - yawX;
    const hw = hwAt(L, y);
    const dy = y - cyc;
    // ---- the outline: the crown with more volume on the big side of the part, a slight dip at the
    // part itself; the long side a panel that hugs the cheek, then rests out on the shoulder
    let zone = 0, depth = 0, along = 0, outerW = 1;
    if (dy < 0) {
      const r = Math.sqrt(x * x + dy * dy);
      const a = fastAtan2(-x, -dy); // 0 at the top, + toward screen-left (the big side), - toward the tucked side
      const big = a > 0 ? Math.exp(-((a - 0.95) * (a - 0.95)) / 0.45) : 0;
      const dip = Math.exp(-((fx - PART) * (fx - PART)) / 1.4) * 0.3;
      const R = RV + 0.5 * big - dip - (a < 0 ? 0.25 * Math.min(1, -a) : 0);
      if (r > R) return -1;
      zone = 1;
      depth = R - r;
      along = (a + 0.35) * RV; // measured from the part toward the big side
      outerW = R;
    } else if (x < 0) {
      // long side: outer edge flares a little toward the ends, inner edge follows the cheek and the jaw
      const outer = H.R + 1.1 + k * 0.45 + k * k * 0.35;
      const inner = y < H.chinY - 1.2 ? Math.max(0.5, hw - 0.45) : Math.max(2.4, chin12 - 0.45 - (y - H.chinY + 1.2) * 0.12);
      // the blunt cut steps a little strand by strand (deterministic), a touch longer at the front
      const sid = Math.floor((outer + x) / 1.3);
      const endY = END + 0.5 - (-x - inner) * 0.08 + (hashInt(sid, 5) - 0.5) * (tr === 2 ? 0.7 : 0.3);
      if (-x <= outer && -x >= inner && y <= endY) zone = 2;
      else if (y < H.chinY - 1.2 && -x < inner && y < -0.5 && -x > hw - 1.0) zone = 2;
      if (zone) {
        depth = outer + x; // from the outer edge inward
        along = PI2 * RV + 0.35 * RV + dy;
        outerW = Math.max(0.8, outer - inner);
      }
    } else if (y < earTop + 0.6) {
      const outer = H.R + 0.85 - Math.max(0, dy) * 0.2;
      if (x <= outer && x >= hw - 0.35) {
        zone = 3;
        depth = outer - x;
        along = -(PI2 * RV + dy);
      }
    }
    if (!zone) return -1;
    // ---- the face window under the fringe: open right of the part, a sweep down to the left temple
    const tip = tr === 2 ? 0.16 * Math.sin(fx * 2.4 + 0.7) : 0; // the fringe's edge breaks into soft tips
    const sweep = H.top + 4.05 + pitchShift + Math.max(0, PART - fx) * 0.43 - Math.max(0, PART - fx) ** 2 * 0.012 + tip;
    const fringe = fx > PART ? H.top + 4.05 + pitchShift + (fx - PART) * 0.08 : sweep;
    if (zone === 1 && y > fringe && Math.abs(x) < hw - 0.6 && y < H.chinY + 1.5) return -1;
    if (zone === 1 && y > fringe && x > 0 && Math.abs(x) < hw + 0.3 && y > cyc - 1) return -1;
    // ---- the form's tone (the hair mass in the key light), then strands
    let form;
    if (zone === 1) {
      const r = outerW - depth;
      const l = (-0.55 * x - 0.72 * dy) / Math.max(1, r) - 0.18 * (depth / outerW);
      // near-black: the lit crown is ink (its strokes lift it to slate, steel at their core), the rest black
      form = l > -0.25 ? 2 : 3;
      ST.spec = tr === 2 && l > 0.5;
    } else if (zone === 2) {
      const q = depth / outerW; // 0 outer edge → 1 face side
      form = q < 0.72 ? 2 : 3;
      ST.spec = false;
      if (y > END - 1.0) form = Math.min(3, form + 1); // the blunt ends sit in shadow
    } else {
      form = 3;
      ST.spec = false;
    }
    if (tr === 0) {
      // wide: two tones and the part; the sheen as one lit run on the crown
      if (zone === 1 && Math.abs(fx - PART) < 0.45 && y < fringe + 0.2 && y > H.top + 0.4) return 3;
      // (a lit run of slate where the crown and the outer face of the long side meet the key)
      if (zone === 1 && form === 2 && depth > 0.6 && depth < 2.4 && fx < PART - 1.2 && dy < -2.5) return 1;
      if (zone === 2 && depth > 0.6 && depth < 1.8 && y > -1 && y < 7) return 1;
      return form;
    }
    // the part: a dark line from the hairline back over the crown (the hair lifts away from it)
    if (zone === 1 && y < fringe + 0.2 && y > H.top + 0.5) {
      const dp = fx - PART - (y - fringe) * 0.1;
      if (Math.abs(dp) < (tr === 2 ? 0.5 * px1 + 0.12 : 0.42)) return 3;
      if (tr === 2 && dp < 0 && dp > -0.5 * px1 - 0.9 && form <= 2) return 1; // the lifted lip beside it
    }
    // under the fringe edge the hair turns in: one darker row
    if (zone === 1 && fx < PART && y > fringe - 1.5 * px1 && Math.abs(x) < hw) return Math.max(form, 2);
    // sheen windows: on the crown where it turns to the key; on the long side its outer face, above the jaw
    ST.sw = zone === 2 ? swPanel : swCrown;
    ST.skip = zone === 2 ? 0 : 0.25; // every clump of the long side carries its sheen stroke
    ST.hiW = zone === 2 ? 0.62 : tr === 2 ? 0.55 : 0.45;
    if (zone === 1) {
      ST.lo = 0.8 * RV;
      ST.hi = 1.4 * RV;
    } else if (zone === 2) {
      ST.lo = PI2 * RV + 0.35 * RV + 1.0;
      ST.hi = PI2 * RV + 0.35 * RV + 8.5;
    } else {
      ST.lo = 1e9;
      ST.hi = -1e9;
    }
    if (zone === 1 && fx > PART) {
      // the combed-back tucked side of the crown: quieter, short strokes only near the part
      ST.lo = -0.45 * RV;
      ST.hi = -0.05 * RV;
    }
    let t = strandTone(form, depth, along, ST);
    if (zone === 2 && t === 1 && depth / outerW > 0.62) t = 2; // no sheen next to the face
    // keep the outer edge clean for the rim: no separations or specks in the outermost pixel
    if (depth < px1 && t > form) t = form;
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
