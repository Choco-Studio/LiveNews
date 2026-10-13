// Hair and headwear for PAY ATTENTION's host (cast/pay-attention.js): every drawer here is the host's alone (owner
// 12 Oct: a borrowed drawer in another colour reads as that person's twin), drawn with the cast kits' rules (clumps
// with broken separations, sheen as strokes, a sel-out hairline, the hair light upper right, LOD by tier).
//
//   drawPuffs      host A   hair parted in the centre and drawn back close to the skull into two high afro puffs, one
//                           each side of the crown: coily clusters lit upper left, a crease where each tucks under
//                           its neighbour, the hair light on the far puff's top
//   drawPompadour  host B   glossy black hair from a side part on the key side, swept up into a smooth rolled front
//                           and back over the crown, the sides tapered close; combed strands and a sheen band of
//                           strokes along the roll
//   drawHijab      host C   a hijab: smooth fabric over the crown and down beside the face to below the jaw, the face
//                           framed by its folded edge; the drape round the neck and over the shoulders is the outfit's
//                           (wardrobe-quiz.js 'hijabJacket', the same group, so the two are one piece of cloth)
import { P } from '../../../palette.js';
import { toneN } from '../pixbuf.js';
import { clamp } from '../space.js';
import { GROUPS } from '../character.js';
import { LocalXY, localBox, clumpTone, strokeTone, selOutEdge, hairLight, rimMat, HeadWidthLUT, dec } from './kit-a.js';
import { tier, hashInt, fastAtan2, LOOK } from './wardrobe-b.js';

const LXY = new LocalXY();
const HWL = new HeadWidthLUT();
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** The hijab's own group (look-owned range 40-55): the head part (hair hook) and the drape (outfit) share it. */
export const SCARF_GROUP = LOOK + 2;

/**
 * Below the jaw, is body point (x, y) (units, y down from the neck base) on the cloth's far plane? The plane turns
 * away along a line that leaves the chin's far corner and slants outward toward the hem, so the head part and the
 * drape (wardrobe-quiz.js) shade alike and the cloth turns along its form, never on a vertical seam.
 */
export function scarfFar(x, y) {
  return x > 3.0 + 0.36 * Math.max(0, y + 4.2);
}

// ---------------------------------------------------------------------------
// A coil lattice (Worley): the nearest two coil centres on a jittered grid of pitch d

const CQ = { d1: 0, d2: 0, dx: 0, dy: 0, k: 0 };
const COIL_N = 64, COIL_OFF = new Float32Array(COIL_N * COIL_N * 2);
for (let j = 0; j < COIL_N; j++) {
  for (let i = 0; i < COIL_N; i++) {
    const k = (i - 32) * 7919 + (j - 32) * 104729;
    COIL_OFF[(j * COIL_N + i) * 2] = 0.18 + 0.64 * hashInt(k, 41);
    COIL_OFF[(j * COIL_N + i) * 2 + 1] = 0.18 + 0.64 * hashInt(k, 42);
  }
}
function coilAt(x, y, d) {
  const gx = Math.floor(x / d), gy = Math.floor(y / d);
  let d1 = 1e9, d2 = 1e9, bx = 0, by = 0, bk = 0;
  for (let j = gy - 1; j <= gy + 1; j++) {
    for (let i = gx - 1; i <= gx + 1; i++) {
      const o = ((((j + 32) & 63) * COIL_N) + ((i + 32) & 63)) * 2;
      const dx = x - (i + COIL_OFF[o]) * d, dy = y - (j + COIL_OFF[o + 1]) * d;
      const dd = dx * dx + dy * dy;
      if (dd < d1) {
        d2 = d1;
        d1 = dd;
        bx = dx;
        by = dy;
        bk = i * 7919 + j * 104729;
      } else if (dd < d2) d2 = dd;
    }
  }
  CQ.d1 = Math.sqrt(d1);
  CQ.d2 = Math.sqrt(d2);
  CQ.dx = bx;
  CQ.dy = by;
  CQ.k = bk;
}

// ---------------------------------------------------------------------------
// Host A: two high afro puffs

// the outline of each puff by angle: a lobe per coil cluster (tabulated once), a slower wobble so the two differ
const LOBE_N = 256;
const LOBES = [new Float32Array(LOBE_N), new Float32Array(LOBE_N)];
for (let p = 0; p < 2; p++) {
  for (let i = 0; i < LOBE_N; i++) {
    const a = (i / LOBE_N) * 2 * Math.PI;
    LOBES[p][i] = 0.075 * Math.cos(a * 9 + p * 1.7) + 0.035 * Math.cos(a * 5 + 0.6 + p * 2.3) + 0.02 * Math.cos(a * 13 + p);
  }
}
const CO_BACK = { cw: 1.0, s: 1, seed: 57, sep: true, hiLo: 0.6, hiHi: 4.2, hiW: 0.45, gap: 3.0, keepLit: true };

/**
 * Two high afro puffs. The hair is parted down the centre and drawn back close to the skull from a clean, rounded
 * hairline (the ears in full view), each half combed toward its puff; the puffs sit high on the crown, one each side
 * of the part, a little apart so the gap between them reads at 1x, each a round cloud of coils with a scalloped
 * outline (a lobe per cluster). Inside, coils on a jittered lattice: lit on the upper left, a crease where each tucks
 * under its neighbours, the puff as a whole darker on its far side and underneath where it sits on the head. The
 * puffs bounce a moment after the head. LOD: wides keep the two clouds, the gap and two tones; mediums the clusters;
 * close-ups the creases and the comb lines of the drawn-back hair.
 */
export function drawPuffs(buf, L, m, head, s, sk) {
  const H = L.head, E = L.ears, PF = L.puffs;
  const tr = tier(s);
  const lag = sk.hairLag || 0;
  const cyc = H.craniumY - 0.25;
  const RV = H.R + 0.32; // the drawn-back hair: close to the skull
  const yawX = Math.sin(head.yaw) * H.R * 0.85;
  const pitchShift = Math.sin(head.pitch) * 2.0;
  const earTop = E.y - E.h * 0.5;
  const px1 = 1 / s;
  const d = tr === 2 ? (s >= 3 ? 1.2 : 1.4) : 1.8; // coil pitch (units)
  const r = PF.r;
  const top = PF.y - r * 1.12;
  const [x0, y0, x1, y1] = localBox(head, -PF.x - r * 1.2 - 1, top - 1, PF.x + r * 1.2 + 1, earTop + 0.8);
  const q = LXY.set(head);
  const HW = HWL.set(H, 0);
  const mt = m.hair, md = m.hairD;
  CO_BACK.s = s;
  CO_BACK.sep = tr === 2;
  // the puffs ride the turn (they are on the crown, nearer the camera than the face's edge) and bounce after it
  const pxs = [-PF.x + yawX * 0.7, PF.x * (1 - 0.08 * PF.tilt) + yawX * 0.7];
  const pys = [PF.y, PF.y + PF.tilt];
  const prs = [r, r * PF.right];
  const bounce = lag * 0.35;
  buf.shape(x0, y0, x1, y1, mt, (px, py) => {
    q.at(px, py);
    const x = q.x, y = q.y;
    // ---- the puffs first (they sit over the drawn-back hair)
    for (let p = 0; p < 2; p++) {
      const cx = pxs[p] - bounce * (1 + p * 0.2), cy = pys[p] + Math.abs(bounce) * 0.15, rr = prs[p];
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > rr * 1.14) continue;
      const a = fastAtan2(dy, dx);
      const lobe = tr === 0 ? LOBES[p][(((a + Math.PI) / (2 * Math.PI)) * LOBE_N | 0) & (LOBE_N - 1)] * 1.25 : LOBES[p][(((a + Math.PI) / (2 * Math.PI)) * LOBE_N | 0) & (LOBE_N - 1)];
      const outer = rr * (1 + lobe);
      if (dist > outer) continue;
      // the puff's form: a ball lit upper left; underneath, where it sits on the head, a step darker
      const nx = dx / outer, ny = dy / outer;
      let form = toneN(mt, nx * 0.92, ny * 0.92);
      if (form === 0) form = 1; // the lit tone only as coil tops, never a flat patch
      if (ny > 0.55) form = Math.max(form, 2);
      if (p === 1 && nx > 0.1) form = Math.max(form, 2); // the far puff turns away on its outer half
      if (tr === 0) {
        // the wide: two tones and one or two lit coil tops on the upper left of each puff
        if (form === 1 && nx < -0.15 && ny < -0.15 && nx * nx + ny * ny > 0.3 && nx * nx + ny * ny < 0.72) return 0;
        return form;
      }
      coilAt(x * 0.94 + (p ? 40 : 0), y, d);
      const cr = d * 0.55;
      const u = CQ.dx / cr, v = CQ.dy / cr;
      const lc = (-0.6 * u - 0.8 * v) / Math.max(0.2, Math.sqrt(u * u + v * v));
      let t = form;
      // each coil catches the key as a crescent on its upper-left rim (a filled lit disc read as a bead)
      const rr0 = CQ.d1 / cr;
      if (lc > 0.45 && rr0 > 0.38 && rr0 < 1.05) t = form <= 1 && nx < 0.4 ? 0 : form === 2 ? 1 : form;
      else if (lc < -0.35 && rr0 > 0.3) t = Math.min(3, form + 1);
      const crease = CQ.d2 - CQ.d1 < (tr === 2 ? 1.15 : 0.95) * px1 + 0.05;
      if (crease) t = Math.min(3, Math.max(t, form) + 1);
      // the outermost pixel keeps the form (a clean edge for the outline and the rim)
      if (dist > outer - px1) t = Math.max(form, 1);
      return t === form ? t : (md << 4) | t;
    }
    // ---- the drawn-back hair: close to the skull, from the hairline back, the ears free
    if (y > earTop + 0.1) return -1;
    const dy = y - cyc;
    const hw = HW.at(y);
    if (y < cyc) {
      if (x * x + dy * dy > RV * RV) return -1;
    } else if (Math.abs(x) > hw + 0.32) return -1;
    const fx = x - yawX;
    const afx = Math.abs(fx);
    // a clean rounded hairline, a little lower at the temples, then straight down in front of the ear
    const hl = H.top + 3.55 + pitchShift + 0.03 * fx * fx;
    if (y > hl && Math.abs(x) < hw - 0.45) return -1;
    if (y > H.craniumY + 1.2 && Math.abs(x) < hw - 0.2) return -1;
    let t = toneN(mt, (x / RV) * 0.9, clamp(dy / (RV * 1.1), -1, 1) * 0.9);
    if (t === 0) t = 1;
    if (x > 0 && Math.abs(x) > hw - 0.6 && y > cyc - 1) t = Math.max(t, 2);
    if (tr === 0) return t;
    // the centre part: a fine line of scalp from the hairline toward the gap between the puffs
    const part = Math.abs(fx) < (tr === 2 ? 0.5 * px1 + 0.08 : 0.3) && y < hl - 0.2 && y > PF.y + r * 0.4;
    if (part) return (m.scalp << 4) | 1;
    // combed back toward the nearer puff: strands along the line from the hairline to that puff's base
    const side = fx < 0 ? 0 : 1;
    const bx = pxs[side], by = pys[side] + prs[side] * 0.6;
    const ddx = x - bx, ddy = y - by;
    const along = Math.sqrt(ddx * ddx + ddy * ddy);
    const across = fastAtan2(ddx, ddy) * Math.max(3, along) + (side ? 70 : 20);
    const near = y > hl - 0.35 && afx < hw;
    if (near) return Math.max(t, x > 0 ? 3 : 2);
    return strokeTone(t, clumpTone(t, across, along, CO_BACK), md);
  });
  const g = head.gb + GROUPS.hair;
  selOutEdge(buf, x0, y0, x1, y1, g, head.gb + GROUPS.head, mt, m.hairEdge);
  if (s >= 1.35) {
    // the hair light: short arcs on the far puff's top right, and a touch on the near puff's crown
    const cxp = head.cx + (pxs[1] - r * 0.15) * s;
    hairLight(buf, head, g, rimMat(P.silver), pxs[1] - r * 0.25, pxs[1] + r * 1.2, top - 1, PF.y + 0.4, Math.max(2, Math.round(s * 1.1)));
    void cxp;
  }
}

// ---------------------------------------------------------------------------
// Host B: the pompadour

const CO_POMP = { cw: 1.2, s: 1, seed: 63, sep: true, hiLo: 1.2, hiHi: 6.8, hiW: 0.5, gap: 4.5, keepLit: true };

/**
 * A pompadour: glossy black hair from a side part on the key side, swept up and over into a smooth roll above the
 * forehead (highest a little right of the centre, the side away from the part), then back over the crown; the sides
 * tapered close above the ears, the temples' corners a touch recessed (an adult hairline). Combed strands follow the
 * sweep; the gloss is a band of tapered strokes across the roll where it faces the key, with a steel glint at close-ups;
 * the roll's underside, where it turns back over the forehead, is in shade. The roll lags the head a little.
 */
export function drawPompadour(buf, L, m, head, s, sk) {
  const H = L.head, E = L.ears, PD = L.pomp;
  const tr = tier(s);
  const lag = sk.hairLag || 0;
  const cyc = H.craniumY - 0.3;
  const RV = H.R + 0.55;
  const yawX = Math.sin(head.yaw) * H.R * 0.85;
  const pitchShift = Math.sin(head.pitch) * 2.0;
  const earTop = E.y - E.h * 0.5;
  const sideTop = H.craniumY - 0.9;
  const part = PD.part;
  const px1 = 1 / s;
  const rollTop = cyc - RV - PD.h;
  const [x0, y0, x1, y1] = localBox(head, -RV - 1, rollTop - 1.2, RV + 1, earTop + 0.6);
  const q = LXY.set(head);
  const HW = HWL.set(H, 0);
  const mt = m.hair, md = m.hairD;
  CO_POMP.s = s;
  CO_POMP.sep = tr === 2;
  CO_POMP.cw = s >= 3 ? 1.1 : 1.4;
  const glint = tr === 2 ? dec(P.silver) : 0;
  buf.shape(x0, y0, x1, y1, mt, (px, py) => {
    q.at(px, py);
    const y = q.y;
    const k = clamp01((H.top + 2 - y) / (PD.h + 2)); // 0 at the skull, 1 at the roll's top
    const x = q.x - lag * 0.45 * k * k;
    const fx = x - yawX * (0.6 + 0.3 * k);
    if (y > earTop + 0.2) return -1;
    const dy = y - cyc;
    const hw = HW.at(y);
    // ---- the silhouette: the skull's circle stretched upward over the front (the roll), its top a little higher on
    // the side away from the part, so the outline is one smooth line from the temples over the top; the tapered sides
    const ux = (fx - PD.cx) / PD.rx;
    const ryTop = RV + PD.h * (1 + PD.lean * (fx - PD.cx));
    let inCap;
    if (y < cyc) {
      const ex = x / RV, ey = dy / ryTop;
      inCap = ex * ex + ey * ey <= 1;
    } else inCap = Math.abs(x) <= hw + 0.4;
    if (!inCap) return -1;
    const inRoll = y < H.top + 2.6; // the hair standing above the forehead
    // the tapered sides: below sideTop a thin band at the skull's edge, thinner toward the ear
    if (!inRoll && y > sideTop) {
      const kk = clamp01((y - sideTop) / Math.max(0.5, earTop - sideTop));
      const bw = 1.05 - 0.75 * kk;
      if (Math.abs(x) < hw - bw) return -1;
      if (tr === 0) return 2;
      return x > 0 ? 3 : kk > 0.5 ? 1 : 2;
    }
    // the hairline: the temples' corners recessed a touch; the roll overhangs the forehead's top
    const afx = Math.abs(fx);
    const recess = Math.exp(-((afx - 4.6) ** 2) / 1.1) * 0.8;
    const hl = H.top + 3.25 + pitchShift + 0.03 * fx * fx - recess;
    if (!inRoll && y > hl && Math.abs(x) < hw - 0.35) return -1;
    if (inRoll && y > hl + 0.6 && Math.abs(x) < hw - 0.35) return -1;
    // ---- tone: the hair rises from the hairline: its front faces the lens (base), its top turns up to the key
    // (lit), the side away from the key turns into shade; the cap over the crown by its form
    let t;
    const v = clamp01((y - rollTop) / Math.max(1, hl - rollTop)); // 0 at the roll's top, 1 at the hairline
    if (inRoll || y < hl) t = toneN(mt, clamp(ux, -1, 1) * 0.72 + (x > hw - 1 ? 0.25 : 0), -(1 - v) * 0.8);
    else t = toneN(mt, (x / RV) * 0.9, clamp(dy / (RV * 1.1), -1, 1) * 0.9);
    if (x > 0 && Math.abs(x) > hw - 0.5 && y > cyc - 1.5) t = Math.max(t, 2);
    if (ux > 0.62 && inRoll) t = Math.max(t, 2); // the roll's far end turns away
    const nearFace = y > hl - 0.3 && Math.abs(x) < hw;
    if (nearFace) t = Math.max(t, x > 0 ? 2 : 1);
    // the silver streak (L.pomp.streak: from..to units right of the part, at the hairline): a lock swept up with the
    // rest from beside the part, narrowing over the top; it keeps the form's tones in its own ramp (m.streak)
    if (PD.streak && m.streak && y < hl - 0.1 && !nearFace) {
      // it leans with the sweep (further right as it rises) and narrows toward the crown
      const c = part + (PD.streak[0] + PD.streak[1]) * 0.5 + (1 - v) * 1.8;
      const hwS = (PD.streak[1] - PD.streak[0]) * 0.5 * (0.4 + 0.6 * v);
      const d = fx - c;
      if (Math.abs(d) < hwS && v > 0.04) {
        if (tr === 0) return (m.streak << 4) | (t >= 2 ? 2 : 1);
        // strands inside the lock: a fog separation every ~0.8 u, its far edge in fog, the lit side silver
        const k = (d + hwS) / (2 * hwS);
        if (k > 0.78) return (m.streak << 4) | 2;
        const sep = tr === 2 && ((d * 1.3 + (hl - y) * 0.15 + 20) % 1) < 0.22 && k > 0.2;
        return (m.streak << 4) | (sep ? 2 : t === 0 && k < 0.45 ? 0 : 1);
      }
    }
    // the wide: the gloss as one short band across the roll's lit side (a whole lit half read as grey hair at 1x)
    if (tr === 0) return t <= 1 && fx < 3.6 && fx > -5.6 + 4 * v && Math.abs(v - 0.27 - 0.02 * fx) < 0.15 ? 0 : t === 0 ? 1 : t;
    // the part: a fine line in shade from the hairline back (mediums and closer)
    if (tr === 2 && Math.abs(fx - part) < 0.5 * px1 + 0.06 && y < hl - 0.3 && y > rollTop + 1.6) return (md << 4) | 2;
    if (nearFace) return t;
    // strands: left of the part they comb down toward the ear; right of it they rise from the hairline and sweep
    // back over the top, fanning out from the part
    let along, across;
    if (fx < part) {
      along = (part - fx) * 1.3 + (hl - y) * 0.4;
      across = y * 1.1 + (part - fx) * 0.25 + 90;
    } else {
      along = (hl - y) * 1.1 + (fx - part) * 0.15;
      across = (fx - part) * (1 - 0.35 * (1 - v)) + 30;
    }
    const tt = strokeTone(t, clumpTone(t, across, along, CO_POMP), md);
    // the glint: a short silver mark on the roll's lit crest (close-ups)
    if (glint && inRoll && ux > -0.55 && ux < -0.22 && Math.abs(v - 0.16 - 0.05 * ux) < 0.5 * px1 / Math.max(1, hl - rollTop) + 0.012) return (glint << 4) | 0;
    return tt;
  });
  const g = head.gb + GROUPS.hair;
  selOutEdge(buf, x0, y0, x1, y1, g, head.gb + GROUPS.head, mt, m.hairEdge);
  if (s >= 1.35) hairLight(buf, head, g, rimMat(P.silver), PD.cx - 0.6, RV + 1, rollTop - 1.2, cyc + 1, Math.max(2, Math.round(s * 1.2)));
  void px1;
}

// ---------------------------------------------------------------------------
// Host C: the hijab (the head part)

/**
 * A hijab: smooth fabric over the crown, a little fuller than the skull, falling straight down beside the face and
 * the jaw (the ears covered) to below the chin, where the outfit's drape takes over round the neck and the shoulders.
 * The face shows in an oval opening: the folded edge across the forehead (lower than a hairline would be), down the
 * temples and over the cheeks' outer edge; below the cheekbones the fabric meets the jaw's own line, so the mouth
 * and the open jaw are never covered. Shading as cloth: the dome lit upper left, the key-side panel a lit plane, the
 * far panel in shade, the edge round the face a band one step lighter on the key side (the fold's thickness) and a
 * step darker on the far side; at close-ups two soft folds down each panel. A small gold pin at the key-side temple.
 */
export function drawHijab(buf, L, m, head, s) {
  const H = L.head;
  const tr = tier(s);
  const cyc = H.craniumY - 0.35;
  const RV = H.R + 1.05;
  const yawX = Math.sin(head.yaw) * H.R * 0.8;
  const pitchShift = Math.sin(head.pitch) * 1.6;
  const jaw = head.jaw || 0;
  const bottom = H.chinY + jaw + 3.4;
  const px1 = 1 / s;
  const [x0, y0, x1, y1] = localBox(head, -RV - 1.6, cyc - RV - 0.8, RV + 1.6, bottom + 0.6);
  const q = LXY.set(head);
  const HW = HWL.set(H, jaw);
  const mt = m.scarf;
  const W = buf.w, M8 = buf.mat, G8 = buf.grp;
  const gHead = head.gb + GROUPS.head;
  const skin = m.skin;
  const pin = tr >= 1 ? dec(P.yellow) : 0, pinHi = tr === 2 ? dec(P.cream) : 0;
  buf.part(head.gb + SCARF_GROUP, 12, false);
  buf.shape(x0, y0, x1, y1, mt, (px, py) => {
    q.at(px, py);
    const x = q.x, y = q.y;
    if (y > bottom) return -1;
    const dy = y - cyc;
    const fx = x - yawX;
    const hw = HW.at(Math.min(y, H.chinY + jaw));
    // ---- the outline: the dome over the crown, then the panels beside the face, flaring a little toward the bottom
    const k = clamp01((y - cyc) / (bottom - cyc));
    const panel = RV + 0.25 * k + 0.9 * k * k;
    if (y < cyc) {
      if (x * x + dy * dy > RV * RV) return -1;
    } else if (Math.abs(x) > panel) return -1;
    // ---- the face's opening
    const top = H.top + 3.05 + pitchShift + 0.028 * fx * fx;
    const i = (py | 0) * W + (px | 0);
    const onFace = M8[i] === skin && G8[i] === gHead;
    if (y > top) {
      if (y < H.cheekY + 0.6) {
        // forehead to the cheekbones: the edge lies over the face's outer 0.6 u
        if (Math.abs(x) < hw - 0.6) return -1;
      } else if (onFace) return -1; // below: the jaw's own line is the opening
      else if (Math.abs(x) < hw * 0.55 && y < H.chinY + jaw + 0.4) return -1;
    }
    // ---- tone: matte cloth. The dome by its form, its lit side in the base with a sheen arc along its upper left
    // (a flat lit half read as a plastic helmet); the key-side panel in the base, the far one in shade; under the
    // jaw the chin's shadow, as on the drape (wardrobe-quiz.js), so the two read as one cloth
    let t;
    if (y < cyc) {
      t = toneN(mt, (x / RV) * 0.9, (dy / RV) * 0.95);
      if (t === 0) {
        const rr = Math.sqrt(x * x + dy * dy) / RV, ang = fastAtan2(x, -dy);
        t = tr > 0 && rr > 0.62 && rr < 0.9 && ang > -1.2 && ang < -0.2 ? 0 : 1;
      }
    } else if (y > H.chinY + jaw - 0.6 && Math.abs(x) < HW.at(y - 1.9) + 0.9) t = 2; // the jaw's shadow on the cloth
    else t = (y > H.chinY + jaw - 1 ? scarfFar(x, y + L.headAt[1]) : x > 0) ? 2 : 1; // under the jaw: as the drape
    // the folded edge round the face: a 1 px lit line on the key side (the fold's thickness), shade on the far side
    const edgeW = Math.max(0.35, 1.05 * px1);
    const nearEdge = y > top - edgeW && y < H.cheekY + 0.8 && (y < top + 0.05 || Math.abs(Math.abs(x) - (hw - 0.6)) < edgeW);
    if (nearEdge && tr > 0) t = x < 0.4 ? 0 : 2;
    if (tr === 0) return t === 0 ? 1 : t;
    // folds down each panel (close-ups), soft: a shade line with a lit line beside it on the key side
    if (tr === 2 && y > cyc + 1.2) {
      for (const fxp of [-(hw + 0.55), hw + 0.45]) {
        const fold = fxp + (fxp < 0 ? -0.5 : 0.4) * k * 2.2;
        const dd = x - fold;
        if (Math.abs(dd) < 0.5 * px1 + 0.05) return Math.min(3, t + 1);
        if (fxp < 0 && dd > 0.5 * px1 && dd < 1.1 * px1 + 0.1 && t >= 1) return Math.max(0, t - 1);
      }
    }
    // the gold pin at the key-side temple
    if (pin) {
      const pdx = fx + hw + 0.05, pdy = y - (H.top + 4.6);
      if (pdx * pdx + pdy * pdy < (tr === 2 ? 0.42 : 0.3)) return ((pinHi && pdx < 0 && pdy < 0 ? pinHi : pin) << 4) | 0;
    }
    return t === 0 ? (m.scarfD << 4) | 0 : t;
  });
  const g = head.gb + SCARF_GROUP;
  selOutEdge(buf, x0, y0, x1, y1, g, gHead, mt, m.scarfE);
  if (s >= 1.35) hairLight(buf, head, g, rimMat(P.silver), H.R * 0.05, RV + 1.6, cyc - RV - 0.8, cyc + 1.5, Math.max(2, Math.round(s * 1.2)));
  void px1;
}
