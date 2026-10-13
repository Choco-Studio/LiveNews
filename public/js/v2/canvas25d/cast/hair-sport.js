// Hair and facial hair for FULL TIME's presenters (cast/full-time.js): every drawer here is theirs alone (owner
// 12 Oct: a borrowed drawer in another colour reads as that person's twin), drawn with the cast kits' rules (clumps
// with broken separations, sheen as strokes, a sel-out hairline, the hair light upper right, LOD by tier).
//
//   drawShaved          Kai A   a clean-shaven head: the skull's own light, a narrow sheen along the dome (no hair)
//   drawFullBeard       Kai A   a full beard trimmed square: dense from the sideburns down, the moustache joined, a
//                               flat, squared base below the chin; follows the open jaw and never covers the lips
//   drawTopKnot         Kai B   hair drawn back from the face into a small knot on the crown, the sides faded short
//   drawSlickBack       Kai C   short hair combed straight back with a little lift, the sides tapered
//   drawPonytail(+Back) Rosa A  hair drawn back sleek (no parting) to a high ponytail that swings out behind the head
//   drawCornrows(+Bun)  Rosa B  cornrows straight back over the dome into a low bun at the nape
//   drawCurlBand(+Back) Rosa C  shoulder-length curls held off the face by a thin headband
//   drawHoops           Rosa    small gold hoops at the earlobes
import { P } from '../../../palette.js';
import { toneN, material } from '../pixbuf.js';
import { headHW } from '../head.js';
import { clamp } from '../space.js';
import { GROUPS } from '../character.js';
import { LocalXY, localBox, clumpTone, strokeTone, selOutEdge, hairLight, rimMat, HeadWidthLUT, dec } from './kit-a.js';
import { tier, local, hwAt, hashInt } from './wardrobe-b.js';

const LXY = new LocalXY();
const HWL = new HeadWidthLUT();
const LC = [0, 0];

// ---------------------------------------------------------------------------
// Kai A: the clean-shaven head

/**
 * Nothing grows on the crown: head.js lights the skull like a face (a broad lit upper left). A shaved head catches
 * the key as a sheen along the dome's curve (mediums and closer): an arc of the lit tone over the upper left of the
 * crown with the crown inside it in the base (never a flat lit patch), a crescent a step down where the dome turns
 * away on the far side, and at close-ups one short highlight stroke inside the arc. The dome keeps the head's outline
 * (no silver rim: on skin it read as a cap's edge).
 */
export function drawShaved(buf, L, m, head, s) {
  const tr = tier(s);
  if (tr === 0) return;
  const H = L.head;
  const yawX = Math.sin(head.yaw) * H.R * 0.6;
  const pitchY = Math.sin(head.pitch) * 1.6;
  const q = LXY.set(head);
  const gHead = head.gb + GROUPS.head;
  const W = buf.w, M8 = buf.mat, T8 = buf.tone, G8 = buf.grp;
  const cy = H.craniumY - 0.2;
  const [x0, y0, x1, y1] = localBox(head, -H.R, H.top - 0.5, H.R, cy);
  const hd = tr === 2 ? dec(L.skin[0]) : 0;
  for (let py = Math.max(1, y0 | 0); py < Math.min(buf.h - 1, y1); py++) {
    for (let px = Math.max(1, x0 | 0); px < Math.min(W - 1, x1); px++) {
      const i = py * W + px;
      if (M8[i] !== m.skin || G8[i] !== gHead) continue;
      q.at(px + 0.5, py + 0.5);
      const x = q.x - yawX, y = q.y - pitchY;
      // the dome turns away on the far side: a crescent a step down along the right of the skull (a bald head with
      // only the face's light read as a flat two-tone disc)
      const sx = x / H.R, sy = (y - H.craniumY) / H.R;
      if (sx > 0.74 - 0.12 * sy * sy && y < H.craniumY - 0.9 && T8[i] < 2) T8[i] = 2;
      // the sheen: an arc 0.5..0.85 of the way out from the crown's centre, on the upper left
      const dx = x + 0.9, dy = y - cy;
      const r = Math.sqrt(dx * dx + dy * dy) / H.R;
      const ang = Math.atan2(dx, -dy); // 0 = straight up, negative toward the key
      if (r > 0.5 && r < 0.82 && ang > -1.0 && ang < 0.22) {
        if (T8[i] <= 1) T8[i] = 0;
        // a short specular stroke at the arc's middle (close-ups): the skin's highlight as an exact colour
        if (hd && r > 0.6 && r < 0.72 && ang > -0.62 && ang < -0.18) M8[i] = hd, T8[i] = 0;
      } else if (T8[i] === 0 && y < H.craniumY - 1.6) T8[i] = 1; // the rest of the crown in the base
    }
  }
}

// ---------------------------------------------------------------------------
// Kai A: the full, squared beard

/**
 * A full beard, trimmed square. Like Max's close beard (cast/max.js) it repaints the face's own skin pixels (the
 * silhouette, mouth, nose and eyes untouched; the open jaw already in the skin), so it turns with the head and
 * follows every mouth shape; unlike it, it is dense from the sideburns down (no stubble fade), the cheek line runs
 * high and straight from the sideburn to the moustache, and its volume stands off the jaw and ends below the chin
 * in a flat base with rounded corners (L.beard.drop deep, L.beard.halfW wide). Shading: the skin's light under it,
 * one step into the beard's ramp; close-ups get short combed strands, a few lit on the key side.
 */
export function drawFullBeard(buf, L, m, head, s) {
  const B = L.beard;
  if (!B) return;
  const H = L.head, M = L.mouth, N = L.nose, E = L.ears;
  const tr = tier(s);
  const jaw = head.jaw || 0;
  const yaw = Math.abs(head.yaw || 0) < 1e-4 ? 0 : head.yaw;
  const yawShift = Math.sin(yaw);
  const pitchShift = Math.sin(head.pitch || 0) * 2.0;
  const jawY0 = M.y - 0.4;
  const jawK = 1 / Math.max(0.5, H.chinY - jawY0);
  const jyK = 1 / (H.chinY - H.cheekY);
  const mHW = M.w * 0.5;
  const px1 = 1 / s;
  const lipTop = M.y - 1.5 * px1;
  const mTop = Math.min(lipTop - 1.25, N.y1 + 0.3); // the moustache's top: a full beard's reaches the nose
  const lipBot = M.y + 1.25 + (tr === 2 ? 0.2 : 0.35); // under the lower lip: the soul patch's top
  const burnTop = E.y - E.h * 0.5 + 0.25; // the sideburn's top, in front of the ear
  const g = head.gb + GROUPS.head;
  const skin = m.skin, mb = m.beard;
  const drop = B.drop ?? 2.0, bHW = B.halfW ?? H.chinHW + 1.7;
  const x0 = Math.max(1, Math.floor(head.cx - (H.cheekHW + 2) * s)), x1 = Math.min(buf.w - 2, Math.ceil(head.cx + (H.cheekHW + 2) * s));
  const y0 = Math.max(1, Math.floor(head.cy + (burnTop - 1) * s)), y1 = Math.min(buf.h - 2, Math.ceil(head.cy + (H.chinY + jaw + drop + 1) * s));
  const w = buf.w, M8 = buf.mat, T8 = buf.tone, G8 = buf.grp;
  // the cheek line in feature space: from the sideburn (outer edge) straight down to above the mouth's corner
  const cheekLine = (ax, hw) => {
    const e = clamp((hw - 0.15 - ax) / Math.max(0.5, hw - 0.15 - (mHW + 0.7)), 0, 1); // 0 at the jaw's edge, 1 at the corner
    return burnTop + (mTop + 0.2 - burnTop) * Math.pow(e, 0.8);
  };
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const i = py * w + px;
      if (M8[i] !== skin || G8[i] !== g) continue;
      local(head, px + 0.5, py + 0.5, LC);
      let y = LC[1] - pitchShift;
      if (jaw && y > jawY0) y -= jaw * Math.min(1, (y - jawY0) * jawK);
      const jy = clamp((LC[1] - H.cheekY) * jyK, 0, 1);
      const xs = LC[0] - yawShift * 1.3 * jy;
      const hw = Math.max(1, hwAt(L, clamp(LC[1], H.top + 0.5, H.chinY - 0.2)));
      let fx = xs;
      if (yaw) fx = hw * Math.sin(clamp(Math.asin(clamp(xs / hw, -1, 1)) - yaw, -1.5707, 1.5707));
      const ax = Math.abs(fx);
      const col = Math.floor(fx * s + 64);
      const ch = hashInt(col, 23);
      let cl = cheekLine(ax, hw);
      if (tr === 2) cl += (ch < 0.3 ? -1 : ch > 0.75 ? 1 : 0) * px1; // a trimmed, not ruled, edge
      const inMoustache = y > mTop && y < lipTop + 0.25 * px1 && ax < mHW + 0.75;
      const inCheek = ax >= mHW + 0.35 && y > cl;
      const inChin = y > lipBot - (ax > mHW * 0.55 ? 0.6 : 0) && ax < mHW + 0.6;
      if (!inMoustache && !inCheek && !inChin) continue;
      const st = T8[i];
      // the skin's light one step into the beard: lit → slate, base and shade → ink, only the deepest → black
      let t = st === 0 ? 0 : st === 3 ? 2 : 1;
      if (inChin && y > H.chinY - 0.7) t = Math.max(t, 2); // the chin's underside
      if (fx > 0 && ax > hw - 0.9) t = Math.max(t, 2); // the far jaw turns away
      if (inMoustache && !inCheek) t = ax > mHW * 0.55 ? 1 : 0; // the moustache's lit middle
      if (tr === 0) {
        // the wide: two tones, the identity is the dark mass framing the mouth and the jaw line
        buf.paint(px, py, mb, t >= 2 ? 2 : 1);
        continue;
      }
      if (tr === 2) {
        // combed strands: short vertical dashes a step darker, a few lit on the key side (no single specks)
        const len = 2 + ((ch * 3) | 0);
        const row = Math.floor((y * s + ch * 7) / len);
        const h = hashInt(col * 131 + row, 29);
        if (h < 0.26 && t < 2) t += 1;
        else if (h > 0.86 && fx < -0.4 && t === 1) t = 0;
        if (inCheek && !inChin && y < cl + px1 && t < 2) t = 1; // the cheek edge thins (no lit rim on it)
      } else if (t === 0 && !(inMoustache && !inCheek)) t = fx < -mHW ? 0 : 1; // mediums: the lit cheek only
      buf.paint(px, py, mb, t);
    }
  }
  // ---- the beard's volume: off the jaw by up to `vol`, then a flat base `drop` below the chin, corners rounded
  buf.part(g, 10, false);
  const Z8 = buf.z;
  const vol = B.vol ?? 0.85;
  // the volume starts below the ear's lobe (the sideburns lie flat; the ear stays in front of nothing)
  const jawTop = Math.max(E.y + E.h * 0.5 + 0.4, cheekLine(H.cheekHW - 0.2, H.cheekHW) + 0.6);
  const baseY = H.chinY + drop, rc = Math.min(1.3, drop * 0.6);
  for (let py = y0; py < y1 + 2; py++) {
    for (let px = x0; px < x1; px++) {
      const i = py * w + px;
      if (M8[i] && Z8[i] >= 10) continue;
      local(head, px + 0.5, py + 0.5, LC);
      let y = LC[1] - pitchShift;
      if (jaw && y > jawY0) y -= jaw * Math.min(1, (y - jawY0) * jawK);
      if (y < jawTop || y > baseY) continue;
      const jy = clamp((LC[1] - H.cheekY) * jyK, 0, 1);
      const xs = LC[0] - yawShift * 1.3 * jy;
      let ext;
      const kv = clamp((y - jawTop) / 2.2, 0, 1);
      if (y <= H.chinY - 1.2) ext = Math.max(0, hwAt(L, y)) + vol * kv;
      else {
        // below the jaw's curve the beard keeps its width down to a flat base (squared, not pointed)
        const jawW = Math.max(0, hwAt(L, Math.min(y, H.chinY - 0.05))) + vol;
        const k = clamp((y - (H.chinY - 1.2)) / 1.6, 0, 1);
        ext = jawW + (bHW - jawW) * k;
        if (y > baseY - rc) {
          const e = (y - (baseY - rc)) / rc;
          ext -= rc * (1 - Math.sqrt(Math.max(0, 1 - e * e)));
        }
      }
      if (Math.abs(xs) > ext) continue;
      // the base and the far edge in shade, the lit flank a step up at close-ups, the rest the beard's ink
      let t = y > baseY - 0.7 || xs > ext - 0.9 ? 2 : 1;
      if (tr === 2 && xs < -ext + 1.0 && y < baseY - 1.0) t = 0;
      if (tr === 2 && y > baseY - 0.9 && xs < -0.3) {
        // the base: strand ends, broken (a trimmed edge)
        const col = Math.floor(xs * s + 64);
        if (hashInt(col, 31) < 0.3 && y > baseY - 0.5) continue;
      }
      buf.plot(px, py, mb, tr === 0 ? (t >= 2 ? 2 : 1) : t);
    }
  }
}

// ---------------------------------------------------------------------------
// Rosa A: sleek hair drawn back to a high ponytail

// the tie (head-local, from the crown's top): where the hair gathers, high and a little back
const TIE = { x: 0.5, dy: -0.55 };
const CO_PONY = { cw: 1.6, s: 1, seed: 71, sep: false, hiLo: 0.6, hiHi: 5.8, hiW: 0.4, gap: 0, keepLit: true };

/**
 * The front: hair drawn back from a clean, rounded hairline (no parting) over the crown to the tie, close to the
 * skull, with the gathered hair rising as a small rounded bump at the top; above the ears only a thin band runs back
 * (the ears show). Clumps converge on the tie; the lift is a band of short brown strokes across the lit dome (a
 * lighter brown where the key catches it at close-ups), the hair beside the face in shade. Ends with the hoops.
 */
export function drawPonytail(buf, L, m, head, s, sk) {
  const H = L.head, E = L.ears;
  const tr = tier(s);
  const cyc = H.craniumY - 0.25;
  const RV = H.R + 0.42;
  const yawX = Math.sin(head.yaw) * H.R * 0.85;
  const pitchShift = Math.sin(head.pitch) * 2.0;
  const earTop = E.y - E.h * 0.5;
  const tx = TIE.x, ty = cyc - RV + TIE.dy + 0.9; // the tie, near the top of the dome
  const bumpX = tx + 0.2, bumpY = cyc - RV + 0.35, bRX = 2.5, bRY = 1.35; // the gathered hair's bump
  const [x0, y0, x1, y1] = localBox(head, -RV - 0.6, cyc - RV - 2.0, RV + 0.6, earTop + 0.6);
  const q = LXY.set(head);
  const HW = HWL.set(H, 0);
  const px1 = 1 / s;
  CO_PONY.s = s;
  CO_PONY.cw = s >= 3 ? 1.5 : 1.9;
  const lift = m.hairLift;
  buf.shape(x0, y0, x1, y1, m.hair, (px, py) => {
    q.at(px, py);
    const x = q.x, y = q.y;
    if (y > earTop + 0.3) return -1;
    const hw = HW.at(y);
    const fx = x - yawX;
    const bx = (x - bumpX - yawX * 0.4) / bRX, by = (y - bumpY) / bRY;
    const inBump = bx * bx + by * by <= 1 && y < cyc - RV + 1.2;
    if (!inBump) {
      if (y < cyc) {
        if (x * x + (y - cyc) * (y - cyc) > RV * RV) return -1;
      } else if (Math.abs(x) > hw + 0.3) return -1;
    }
    // the hairline: clean and rounded, slightly lower at the centre (soft baby hairs at close-ups)
    const tips = tr === 2 ? 0.22 * Math.abs(((fx * 1.3) % 2 + 2) % 2 - 1) : 0;
    const hairline = H.top + 3.35 + pitchShift + 0.075 * fx * fx + tips;
    if (y > hairline) {
      if (Math.abs(x) <= hw - 0.25) return -1;
      if (y > earTop - 0.2 && Math.abs(x) < hw + 0.05) return -1;
    }
    const nx = x / RV, ny = clamp((y - cyc) / (RV * 1.1), -1, 1);
    let t = toneN(m.hair, nx * 0.95, ny * 0.95);
    const nearFace = y > hairline - 0.35 && Math.abs(x) < hw + 0.4;
    if (nearFace) t = Math.max(t, x > 0 && tr > 0 ? 3 : 2);
    if (inBump) {
      // the gathered hair: a rounded form lit upper left, its underside where it meets the crown in shade
      const l = -0.6 * bx - 0.8 * by;
      t = l > 0.45 ? 0 : l > -0.3 ? 1 : 2;
      if (by > 0.35 && x * x + (y - cyc) * (y - cyc) <= RV * RV) t = Math.max(t, 2);
      if (tr === 0) return t === 0 ? 0 : t >= 2 ? 2 : 1;
      if (tr === 2 && t <= 1) {
        // strands wrapping into the tie
        const v = Math.atan2(by, bx) * 3.2 + 20;
        return strokeTone(t, clumpTone(t, v, Math.sqrt(bx * bx + by * by) * 3, CO_PONY), m.hairD);
      }
      return t;
    }
    if (nearFace) return t;
    if (tr === 0) {
      // the wide: the dark mass with the lift as one short lit arc on the upper left (the hair reads near-black
      // with brown in it, never a flat cap)
      if (t === 0) return x < -0.8 && y < cyc - 2.4 ? 0 : 1;
      return t;
    }
    if (x * x + (y - cyc) * (y - cyc) > (RV - 0.4) * (RV - 0.4) && t >= 2 && y < cyc) return t; // a clean edge for the rim
    // glossy hair drawn tight: the key catches a band at one latitude of the dome (an arc over the upper left,
    // never the crown's middle), broken into tapered strokes that converge on the tie; no comb of separations
    // (stripes across the forehead read as a fringe). The rest the base, the far side in shade.
    const d = Math.sqrt(x * x + (y - cyc) * (y - cyc)) / RV;
    const inBand = d > 0.5 && d < 0.9 && fx < 2.2 && y < cyc - 0.6;
    if (t === 0 && !inBand) t = 1;
    if (t !== 0) return t;
    const dx = fx - tx, dy = y - ty;
    const dist = Math.sqrt(dx * dx + dy * dy);
    let v = Math.atan2(dx, Math.max(0.3, dy)) * Math.max(4.5, dist) + 30;
    v += 0.22 * CO_PONY.cw * Math.sin(v * 1.6 / CO_PONY.cw + 0.7);
    const u = Math.max(0, hairline - y) + 0.4;
    const ct = clumpTone(0, v, u, CO_PONY);
    // the lift: the brightest strokes in the middle of the band take the lighter brown (close-ups)
    if (ct === 0 && tr === 2 && lift && d > 0.62 && d < 0.78 && fx < 0.5) return (lift << 4) | 0;
    return strokeTone(0, ct, m.hairD);
  });
  const g = head.gb + GROUPS.hair;
  selOutEdge(buf, x0, y0, x1, y1, g, head.gb + GROUPS.head, m.hair, m.hairEdge);
  if (tr === 2) pruneSpecks(buf, x0, y0, x1, y1, g, m.hair, [m.hairD, m.hairLift]);
  if (s >= 1.35) hairLight(buf, head, g, rimMat(P.silver), H.R * 0.2, RV + 1, cyc - RV - 2.2, cyc + 1, Math.max(2, Math.round(s * 1.2)));
  if (L.hoops) drawHoops(buf, L, head, s);
}

// the tail's centre line (head-local, from the tie) and its half-widths: out to the camera-right side, then down
// behind the head, tapering to the end (Catmull-Rom; a look may give its own as L.ponytail.ctrl)
// (it rises a little above the tie before it falls: the high ponytail's hook, what reads at 1x)
export const TAIL_CTRL = [[0.6, 0.0, 1.05], [2.6, -1.1, 1.25], [4.8, -0.9, 1.4], [6.9, 0.8, 1.45], [8.3, 3.8, 1.4], [8.9, 7.6, 1.25], [8.8, 11.4, 1.0], [8.2, 14.6, 0.65], [7.4, 16.6, 0.3], [6.9, 17.5, 0.12]];
const TUBES = new WeakMap();
/** A tube's centre line sampled once per control array: { p: Float32Array [x, y, half-width, arc length] * n, n, len }. */
export function tubePath(ctrl, n = 48) {
  let T = TUBES.get(ctrl);
  if (T) return T;
  const p = new Float32Array(n * 4);
  const c = ctrl;
  let k = 0;
  const per = (n - 1) / (c.length - 1);
  for (let i = 0; i < c.length - 1; i++) {
    const p0 = c[Math.max(0, i - 1)], p1 = c[i], p2 = c[i + 1], p3 = c[Math.min(c.length - 1, i + 2)];
    const end = i === c.length - 2 ? n : Math.round(per * (i + 1));
    const start = k;
    for (; k < end; k++) {
      const t = i === c.length - 2 ? (k - start) / Math.max(1, end - 1 - start) : (k - start) / Math.max(1, end - start), t2 = t * t, t3 = t2 * t;
      for (let d = 0; d < 3; d++) {
        p[k * 4 + d] = 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3);
      }
    }
  }
  let len = 0;
  for (let i = 0; i < n; i++) {
    if (i) len += Math.hypot(p[i * 4] - p[i * 4 - 4], p[i * 4 + 1] - p[i * 4 - 3]);
    p[i * 4 + 3] = len;
  }
  // chunks of segments with their bounding boxes and widest half-width: a pixel far from a chunk skips its segments
  // (most of the tail's box is empty: per-pixel work on every segment doubled a close-up's cost)
  const nc = Math.ceil((n - 1) / CHUNK);
  const box = new Float32Array(nc * 5);
  for (let c = 0; c < nc; c++) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, hw = 0;
    for (let i = c * CHUNK; i <= Math.min(n - 1, (c + 1) * CHUNK); i++) {
      x0 = Math.min(x0, p[i * 4]);
      x1 = Math.max(x1, p[i * 4]);
      y0 = Math.min(y0, p[i * 4 + 1]);
      y1 = Math.max(y1, p[i * 4 + 1]);
      hw = Math.max(hw, p[i * 4 + 2]);
    }
    box.set([x0, y0, x1, y1, hw], c * 5);
  }
  T = { p, n, len, box, nc };
  TUBES.set(ctrl, T);
  return T;
}
const CHUNK = 6;
const TS = { d: 0, u: 0, v: 0, hw: 0, nx: 0, ny: 0 };

/**
 * Nearest point of a tube's centre line, swung by `lag` (the end the most), into TS: distance, arc length, signed
 * distance across (+ toward the tube's right/lower side), half-width there, and the normal's x.
 */
export function tubeAt(T, x, y, lag, out = TS) {
  const P = T.p, n = T.n, len = T.len || 1, B = T.box;
  const swing = (lag < 0 ? -lag : lag) * 1.4;
  let best = 1e9;
  for (let c = 0; c < T.nc; c++) {
    const m = B[c * 5 + 4] + 0.05;
    if (y < B[c * 5 + 1] - m || y > B[c * 5 + 3] + m || x < B[c * 5] - m - swing || x > B[c * 5 + 2] + m + swing) continue;
    const iEnd = Math.min(n - 1, (c + 1) * CHUNK);
    for (let i = c * CHUNK; i < iEnd; i++) {
      const k0 = i * 4, k1 = k0 + 4;
      const ax = P[k0] - lag * (P[k0 + 3] / len) * 1.4, ay = P[k0 + 1];
      const bx = P[k1] - lag * (P[k1 + 3] / len) * 1.4, by = P[k1 + 1];
      const dx = bx - ax, dy = by - ay;
      const l2 = dx * dx + dy * dy || 1e-6;
      let u = ((x - ax) * dx + (y - ay) * dy) / l2;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const ex = x - (ax + dx * u), ey = y - (ay + dy * u);
      const d2 = ex * ex + ey * ey;
      if (d2 < best) {
        best = d2;
        const l = Math.sqrt(l2);
        out.u = P[k0 + 3] + (P[k1 + 3] - P[k0 + 3]) * u;
        out.hw = P[k0 + 2] + (P[k1 + 2] - P[k0 + 2]) * u;
        out.v = (ex * -dy + ey * dx) / l;
        out.nx = -dy / l;
        out.ny = dx / l;
      }
    }
  }
  out.d = Math.sqrt(best);
  return out;
}

/**
 * The tail, behind the head and neck (hairBack): it rises from the tie a little above the crown, hooks over to the
 * camera-right side and falls behind the head past the ear to about the jaw, tapering; it swings after the head
 * (follow-through, its end the most). Only what is outside the head's silhouette shows: the hook above the crown and
 * a fall of dark hair beside the head, lit on its upper-left flank, a soft wave at close-ups, the brown lift on its
 * crest. No silver light on it (a rim down its edge read as a headphone band at 1x).
 */
export function drawPonytailBack(buf, L, m, head, s, sk) {
  const H = L.head;
  const tr = tier(s);
  const lag = sk ? sk.hairLag || 0 : 0;
  const cyc = H.craniumY - 0.25;
  const top = cyc - H.R - 0.42 + TIE.dy + 0.9; // the tie's y (as drawPonytail)
  const ox = TIE.x, oy = top;
  const [x0, y0, x1, y1] = localBox(head, ox - 2.5, oy - 3.4, ox + 11.5, oy + 18.5);
  const q = LXY.set(head);
  const lift = m.hairLift;
  const path = tubePath(L.ponytail?.ctrl || TAIL_CTRL);
  buf.shape(x0, y0, x1, y1, m.tail || m.hairBack, (px, py) => {
    q.at(px, py);
    const x = q.x - ox, y = q.y - oy;
    const T = tubeAt(path, x, y, lag);
    if (T.d > T.hw) return -1;
    const a = T.v / T.hw; // -1..1 across
    // a tube lit from the upper left: the across direction's normal against the key, so the hook's top and the
    // fall's left flank catch it (one rule along the whole bend: no flip where the tail turns down)
    const l = a * (-0.6 * T.nx - 0.8 * T.ny);
    let t = l > 0.38 ? 0 : l > -0.3 ? 1 : 2;
    if (Math.abs(a) > 0.84) t = Math.max(t, 2);
    if (tr === 0) return t === 0 ? 0 : t >= 2 ? 2 : 1;
    if (tr === 1) return t === 0 && T.u < 1.5 ? 1 : t;
    // close-ups: long strands, never specks: the lit flank as dashes along the tail (2 u on, 1 u off), the lift in
    // the middle of the fall, a shallow crease on the far half every ~4.5 u
    if (t === 0) {
      if (T.u < 1.6 || (T.u * 0.9 + a * 1.2) % 3 > 2.1) return 1;
      return lift && T.u > 3.2 && T.u < 8 && l > 0.55 ? (lift << 4) | 0 : (m.hairD << 4) | 0;
    }
    const wv = (T.u + 0.8 * a) / 4.6;
    if (T.u > 3 && wv - Math.floor(wv) > 0.88 && a > 0.2) return (m.hairD << 4) | Math.min(3, t + 1);
    return t;
  });
  if (tr === 2) pruneSpecks(buf, x0, y0, x1, y1, head.gb + GROUPS.hairBack, m.tail || m.hairBack, [m.hairD, m.hairLift]);
}

/**
 * The craft rule "no orphan pixels" for painted strokes: a stroke pixel (one of `strokeMats`, decal hair) in group g
 * that none of its 4 neighbours continues (the same material and tone) is a speck at a stroke's tapered end; it
 * takes the base tone of the hair under it (`base`). Box in screen pixels; no allocation.
 */
export function pruneSpecks(buf, x0, y0, x1, y1, g, base, strokeMats) {
  const w = buf.w, M8 = buf.mat, T8 = buf.tone, G8 = buf.grp;
  const xa = Math.max(1, Math.floor(x0)), ya = Math.max(1, Math.floor(y0));
  const xb = Math.min(w - 2, Math.ceil(x1)), yb = Math.min(buf.h - 2, Math.ceil(y1));
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      const i = y * w + x;
      const mi = M8[i];
      if (G8[i] !== g || !mi || !strokeMats.includes(mi)) continue;
      const ti = T8[i];
      const same = (j) => M8[j] === mi && T8[j] === ti && G8[j] === g;
      if (same(i - 1) || same(i + 1) || same(i - w) || same(i + w)) continue;
      M8[i] = base;
      T8[i] = ti === 0 ? 1 : Math.max(1, Math.min(3, ti - 1));
    }
  }
}

/**
 * Small gold hoops at the earlobes (about 1.2 u across): a gold point in the wide, a point and its shaded lower half
 * in mediums, a hollow ring at close-ups (an O of 4 px from s 3, a 4-px ring below it) whose top catches the key and
 * whose bottom is in shade. Hidden when that ear turns behind the head.
 */
// exact gold with no outline of its own: resolve outlines every empty pixel next to a part in the part's line colour,
// which filled the ring's hole and haloed it into a 6 px gem
const HOOP_MATS = new Map();
function hoopMat(hex) {
  let id = HOOP_MATS.get(hex);
  if (id === undefined) HOOP_MATS.set(hex, (id = material(`full-time:hoop:${hex}`, { ramp: [hex], decal: true, noOutline: true })));
  return id;
}
export function drawHoops(buf, L, head, s) {
  const H = L.head, E = L.ears;
  const [hi, base, sh] = L.hoops;
  const mHi = hoopMat(hi), mB = hoopMat(base), mS = hoopMat(sh);
  for (let side = -1; side <= 1; side += 2) {
    const hw = headHW(H, E.y + E.h * 0.4, 0);
    const turn = Math.sin(head.yaw) * side;
    if (turn > 0.32) continue; // behind the head
    // hanging from the lobe, beside the jaw (over the jaw's edge the ring's hole filled with skin read as a stud)
    const ex = side * (hw + 0.4 - Math.max(0, turn) * 2.2 + Math.min(0, turn) * 0.35);
    const [px, py] = head.toScreen(ex, E.y + E.h * 0.5 + 0.1);
    const cx = Math.round(px), cy = Math.round(py);
    if (s < 1.35) {
      buf.plot(cx, cy, mB, 1);
      continue;
    }
    if (s < 2.2) {
      buf.plot(cx, cy, mHi, 1);
      buf.plot(cx, cy + 1, mS, 1);
      continue;
    }
    if (s < 3) {
      buf.plot(cx, cy, mHi, 1);
      buf.plot(cx - 1, cy + 1, mB, 1);
      buf.plot(cx + 1, cy + 1, mB, 1);
      buf.plot(cx, cy + 2, mS, 1);
      continue;
    }
    const x0 = cx - 1;
    buf.plot(x0 + 1, cy, mHi, 1);
    buf.plot(x0 + 2, cy, mHi, 1);
    buf.plot(x0, cy + 1, mB, 1);
    buf.plot(x0 + 3, cy + 1, mB, 1);
    buf.plot(x0, cy + 2, mS, 1);
    buf.plot(x0 + 3, cy + 2, mS, 1);
    buf.plot(x0 + 1, cy + 3, mS, 1);
    buf.plot(x0 + 2, cy + 3, mS, 1);
  }
}

// ---------------------------------------------------------------------------
// Kai B: the top knot

const CO_KNOT = { cw: 1.7, s: 1, seed: 81, sep: true, hiLo: 0.8, hiHi: 5.4, hiW: 0.36, gap: 3.6 };

/**
 * Hair drawn back from the face to a small knot on the crown: the knot a rounded form lit upper left, wrapped strands
 * and its elastic where it sits on the crown; the top close to the skull with clumps converging on the knot; the
 * sides faded short (a thin band at the skull's edge that thins toward the ear). The knot swings a little after the
 * head. A sel-out line at the hairline, the hair light upper right.
 */
export function drawTopKnot(buf, L, m, head, s, sk) {
  const H = L.head, E = L.ears;
  const tr = tier(s);
  const lag = sk.hairLag || 0;
  const cyc = H.craniumY - 0.3;
  const RV = H.R + 0.35;
  const yawX = Math.sin(head.yaw) * H.R * 0.85;
  const pitchShift = Math.sin(head.pitch) * 2.0;
  const earTop = E.y - E.h * 0.5;
  const sideTop = H.craniumY - 0.4; // above: the top drawn back; below: the faded sides
  const krx = 2.25, kry = 1.7, ky = cyc - RV - 0.75;
  const tieY = ky + kry * 0.8;
  const [x0, y0, x1, y1] = localBox(head, -RV - 0.6, ky - kry - 1, RV + 0.6, earTop + 0.6);
  const q = LXY.set(head);
  const HW = HWL.set(H, 0);
  CO_KNOT.s = s;
  CO_KNOT.sep = tr === 2;
  CO_KNOT.cw = s >= 3 ? 1.5 : 1.9;
  buf.shape(x0, y0, x1, y1, m.hair, (px, py) => {
    q.at(px, py);
    const x = q.x, y = q.y;
    if (y > earTop + 0.2) return -1;
    const fx = x - yawX;
    const kx = 0.2 + yawX * 0.45 - lag * 0.3;
    const kdx = (x - kx) / krx, kdy = (y - ky) / kry;
    if (kdx * kdx + kdy * kdy <= 1) {
      // the knot
      const l = -0.6 * kdx - 0.8 * kdy;
      let t = l > 0.42 ? 0 : l > -0.35 ? 1 : 2;
      if (kdy > 0.5) t = Math.max(t, 2);
      if (tr === 0) return t === 0 ? 0 : t >= 2 ? 2 : 1;
      if (kdy > 0.6 && kdy < 0.92 && Math.abs(kdx) < 0.75) return 3; // the elastic
      if (tr === 2 && t <= 1) {
        const r = Math.sqrt(kdx * kdx + kdy * kdy), ang = Math.atan2(kdy, kdx);
        return strokeTone(t, clumpTone(t, ang * 2.4 + r * 1.6 + 20, r * 3 + ang * 0.5 + 4, CO_KNOT), m.hairD);
      }
      return t;
    }
    const hw = HW.at(y);
    if (y < cyc) {
      if (x * x + (y - cyc) * (y - cyc) > RV * RV) return -1;
    } else if (Math.abs(x) > hw + 0.3) return -1;
    const hairline = H.top + 3.85 + pitchShift + 0.035 * fx * fx - Math.exp(-((Math.abs(fx) - 4.4) ** 2) / 1.4) * 0.85;
    if (y > sideTop) {
      // the faded sides: a band at the skull's edge, thinner toward the ear
      const k = clamp((y - sideTop) / Math.max(0.5, earTop - sideTop), 0, 1);
      const bw = 1.25 - 0.85 * k;
      if (Math.abs(x) < hw - bw) return -1;
      if (tr === 0) return 1;
      return x > 0 ? 2 : k > 0.55 ? 0 : 1;
    }
    if (y > hairline && Math.abs(x) < hw - 0.3) return -1;
    let t = toneN(m.hair, (x / RV) * 0.95, clamp((y - cyc) / (RV * 1.1), -1, 1) * 0.95);
    const nearFace = y > hairline - 0.35 && Math.abs(x) < hw;
    if (nearFace) t = Math.max(t, x > 0 && tr > 0 ? 3 : 2);
    if (tr === 0 || nearFace) return tr === 0 && t === 0 ? (x < -1 ? 0 : 1) : t;
    if (x * x + (y - cyc) * (y - cyc) > (RV - 0.4) * (RV - 0.4) && t >= 2) return t;
    // drawn back: clumps converge on the knot's tie
    const dx = fx - 0.2, dy = y - tieY;
    const v = Math.atan2(dx, Math.max(0.3, dy)) * Math.max(4, Math.sqrt(dx * dx + dy * dy)) + 30;
    return strokeTone(t, clumpTone(t, v, Math.max(0, hairline - y) + 0.6, CO_KNOT), m.hairD);
  });
  const g = head.gb + GROUPS.hair;
  selOutEdge(buf, x0, y0, x1, y1, g, head.gb + GROUPS.head, m.hair, m.hairEdge);
  if (s >= 1.35) hairLight(buf, head, g, rimMat(P.silver), H.R * 0.1, RV + 1, ky - kry - 1, cyc + 1, Math.max(2, Math.round(s * 1.2)));
}

// ---------------------------------------------------------------------------
// Kai C: curtains (a middle part)

const CO_CURT = { cw: 1.7, s: 1, seed: 87, sep: true, hiLo: 3.0, hiHi: 7.0, hiW: 0.36, gap: 4.0 };

/**
 * Ear-length hair from a middle part: each side falls from the part over the forehead's edge in a curtain that opens
 * at the centre and runs down past the temple over the tops of the ears, the ends turning out a little at the
 * cheekbone; it swings after the head. Clumps fall from the part, a sheen band of strokes over the lit side, the
 * curtains beside the face in shade.
 */
export function drawCurtains(buf, L, m, head, s, sk) {
  const H = L.head;
  const tr = tier(s);
  const lag = sk.hairLag || 0;
  const cyc = H.craniumY - 0.3;
  const RV = H.R + 0.9;
  const yawX = Math.sin(head.yaw) * H.R * 0.8;
  const pitchShift = Math.sin(head.pitch) * 2.0;
  const bottom = H.cheekY - 0.2;
  const part = 0.25;
  const [x0, y0, x1, y1] = localBox(head, -RV - 1.2, H.top - 1.6, RV + 1.2, bottom + 0.8);
  const q = LXY.set(head);
  const HW = HWL.set(H, 0);
  CO_CURT.s = s;
  CO_CURT.sep = tr === 2;
  CO_CURT.cw = s >= 3 ? 1.6 : 2.0;
  buf.shape(x0, y0, x1, y1, m.hair, (px, py) => {
    q.at(px, py);
    const y = q.y;
    const swing = y > -2 ? lag * clamp((y + 2) / (bottom + 2), 0, 1) ** 2 : 0;
    const x = q.x - swing;
    const tips = tr === 2 ? 0.25 * Math.abs((((x * 1.4) % 2) + 2) % 2 - 1) : 0;
    if (y > bottom + 0.4 - tips) return -1;
    const ax = Math.abs(x);
    let inMass;
    if (y < cyc) {
      const up = Math.max(0, (cyc - y) / RV);
      const r = RV - 0.35 * up * Math.exp(-((x - part) ** 2) / 6); // flatter along the part
      inMass = x * x + (y - cyc) * (y - cyc) <= r * r;
    } else {
      const k = (y - cyc) / (bottom - cyc);
      inMass = ax <= RV + 0.35 * k * k;
    }
    if (!inMass) return -1;
    const fx = x - yawX;
    const hw = HW.at(y);
    // the window: the curtains open from the part and run down to about the brows at the temples
    const dp = Math.abs(fx - part);
    const curtain = H.top + 3.1 + pitchShift + 3.6 * Math.pow(Math.min(1, dp / 5.2), 1.25);
    if (y > curtain && ax < hw - 0.95) return -1;
    if (y > H.cheekY - 1.2 && ax < hw + 0.3) return -1;
    let t = toneN(m.hair, (x / RV) * 0.9, clamp((y - cyc) / (RV * 1.2), -1, 1) * 0.9);
    const nearFace = y > curtain - 0.3 && ax < hw + 0.9;
    const onPart = tr >= 1 && dp < 0.22 + (s < 2.4 ? 0.2 : 0) && y < H.top + 3.6 && y > H.top + 0.4;
    if (tr === 0) {
      if (nearFace) t = Math.max(t, x > 0 ? 2 : 1);
      return t === 0 ? (y < cyc - 2 && x < 0 ? 0 : 1) : t;
    }
    if (onPart) return 2;
    if (nearFace) return Math.max(t, x > 0 ? 3 : 2);
    if (x * x + (y - cyc) * (y - cyc) > (RV - 0.45) * (RV - 0.45) && y < cyc && t >= 2) return t;
    // clumps fall from the part: outward over the dome, then down the sides
    const sgn = fx < part ? -1 : 1;
    const dx = (fx - part) * sgn, dy = y - (H.top + 0.6);
    const v = Math.atan2(dy, dx) * Math.max(4.5, Math.sqrt(dx * dx + dy * dy)) + (sgn < 0 ? 40 : 80);
    const u = Math.sqrt(dx * dx + dy * dy);
    return strokeTone(t, clumpTone(t, v, u, CO_CURT), m.hairD);
  });
  const g = head.gb + GROUPS.hair;
  selOutEdge(buf, x0, y0, x1, y1, g, head.gb + GROUPS.head, m.hair, m.hairEdge);
  if (s >= 1.35) hairLight(buf, head, g, rimMat(P.silver), H.R * 0.15, RV + 1.2, H.top - 1.6, cyc + 1, Math.max(2, Math.round(s * 1.2)));
}

// ---------------------------------------------------------------------------
// Rosa B: cornrows

/**
 * Cornrows straight back over the dome (gathered at the nape, out of sight from the front): close to the skull from a
 * clean rounded hairline, the rows converging over the crown as the dome turns away. Each row a braid lit on its
 * key-side half, its far edge in shade, the scalp between rows a 1 px line in the skin's own shade (mediums and
 * closer), the braid's crossings as short ticks at close-ups. The wide keeps the close dark cap.
 */
export function drawCornrows(buf, L, m, head, s) {
  const H = L.head, E = L.ears;
  const tr = tier(s);
  const cyc = H.craniumY - 0.25;
  const RV = H.R + 0.3;
  const yawX = Math.sin(head.yaw) * H.R * 0.85;
  const pitchShift = Math.sin(head.pitch) * 2.0;
  const earTop = E.y - E.h * 0.5;
  const vpY = H.top - 6.5; // the rows' vanishing point, above and behind the crown
  const rw = 1.3; // a row's width at the hairline (units)
  const k0 = rw / (H.top + 3.6 - vpY);
  const [x0, y0, x1, y1] = localBox(head, -RV - 0.6, cyc - RV - 0.6, RV + 0.6, earTop + 0.6);
  const q = LXY.set(head);
  const HW = HWL.set(H, 0);
  const px1 = 1 / s;
  const scalp = m.scalp;
  buf.shape(x0, y0, x1, y1, m.hair, (px, py) => {
    q.at(px, py);
    const x = q.x, y = q.y;
    if (y > earTop + 0.3) return -1;
    const hw = HW.at(y);
    if (y < cyc) {
      if (x * x + (y - cyc) * (y - cyc) > RV * RV) return -1;
    } else if (Math.abs(x) > hw + 0.3) return -1;
    const fx = x - yawX;
    const hairline = H.top + 3.6 + pitchShift + 0.07 * fx * fx;
    if (y > hairline) {
      if (Math.abs(x) <= hw - 0.25) return -1;
      if (y > earTop - 0.2 && Math.abs(x) < hw + 0.05) return -1;
    }
    let t = toneN(m.hair, (x / RV) * 0.95, clamp((y - cyc) / (RV * 1.1), -1, 1) * 0.95);
    if (y > hairline - 0.3 && Math.abs(x) < hw + 0.4) t = Math.max(t, x > 0 ? 2 : 1);
    if (tr === 0) return t === 0 ? 1 : t;
    if (x * x + (y - cyc) * (y - cyc) > (RV - 0.35) * (RV - 0.35) && y < cyc - 1 && t >= 2) return t;
    // the row: its index and the position across it (0..1, the parting at 0)
    const vv = Math.atan2(fx, y - vpY) / k0 + 0.5;
    const w = vv - Math.floor(vv);
    const pw = Math.max(px1 * 1.05, 0.16);
    if (scalp && w < pw / rw && y < hairline - 0.15) return (scalp << 4) | (t >= 2 ? 1 : 0);
    let tt = t;
    if (w < 0.55 && t <= 1 && fx < 2.5) tt = Math.max(0, t - 1); // the braid's crest on the key side
    else if (w > 0.82) tt = Math.min(3, t + 1);
    if (tr === 2) {
      // the braid's crossings: short slanted ticks down the row, alternating direction across its middle
      const along = (y - vpY) * 1.1 + (w < 0.5 ? w : 1 - w) * 1.2;
      if (along - Math.floor(along) < 0.22) tt = Math.min(3, Math.max(tt, t) + 1);
    }
    return tt === t ? t : (m.hairD << 4) | tt;
  });
  const g = head.gb + GROUPS.hair;
  selOutEdge(buf, x0, y0, x1, y1, g, head.gb + GROUPS.head, m.hair, m.hairEdge);
  if (s >= 1.35) hairLight(buf, head, g, rimMat(P.silver), H.R * 0.15, RV + 1, cyc - RV - 0.8, cyc + 1, Math.max(2, Math.round(s * 1.2)));
  if (L.studs) drawStuds(buf, L, head, s);
}

/** Small gold studs on the lobes (mediums and closer). */
function drawStuds(buf, L, head, s) {
  if (s < 1.6) return;
  const H = L.head, E = L.ears;
  const hi = dec(L.studs[0]), sh = dec(L.studs[1]);
  for (let side = -1; side <= 1; side += 2) {
    const turn = Math.sin(head.yaw) * side;
    if (turn > 0.32) continue;
    const hw = headHW(H, E.y + E.h * 0.4, 0);
    const [px, py] = head.toScreen(side * (hw + 0.2 - Math.max(0, turn) * 2.2), E.y + E.h * 0.38);
    const cx = Math.round(px), cy = Math.round(py);
    buf.plot(cx, cy, hi, 1);
    if (s >= 3) {
      buf.plot(cx + 1, cy, hi, 1);
      buf.plot(cx, cy + 1, sh, 1);
      buf.plot(cx + 1, cy + 1, sh, 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Rosa C: curls held back by a headband

const CURL = 1.3; // a curl cluster's cell (units)
const CC = { nx: 0, ny: 0, d: 0, k: 0 };
/** The frontmost curl cluster over head-local (x, y) on a jittered grid: its normal (nx, ny) and depth into it (d 0..1). */
function curlAt(x, y, seed) {
  const gi = Math.floor(x / CURL), gj = Math.floor(y / CURL);
  let best = 9;
  for (let j = gj - 1; j <= gj + 1; j++) {
    for (let i = gi - 1; i <= gi + 1; i++) {
      const h = hashInt(i * 7919 + j * 104729 + seed, 53);
      const cx = (i + 0.5 + (h - 0.5) * 0.7) * CURL, cy = (j + 0.5 + (hashInt(i * 31 + j * 17 + seed, 59) - 0.5) * 0.7) * CURL;
      const r = CURL * (0.66 + 0.22 * hashInt(i + j * 13 + seed, 61));
      const dx = (x - cx) / r, dy = (y - cy) / r;
      const d = dx * dx + dy * dy;
      // the cluster that covers the point and lies in front (a later row is lower: in front)
      const z = d - 0.08 * j;
      if (d < 1 && z < best) {
        best = z;
        CC.nx = dx;
        CC.ny = dy;
        CC.d = d;
        CC.k = h;
      }
    }
  }
  return best < 9 ? CC : null;
}
/** Tone of a pixel inside a curl cluster: lit crescent toward the key, a deep tuck on the far side. */
function curlTone(c, base) {
  const l = -0.6 * c.nx - 0.8 * c.ny;
  let t = base;
  if (l > 0.35 && c.d > 0.15) t = Math.max(0, base - 1);
  else if (l < -0.45 && c.d > 0.45) t = Math.min(3, base + 1);
  return t;
}

/**
 * Curls behind the head (hairBack): a full, rounded mass from above the crown to past the jaw on both sides, its edge
 * scalloped by the clusters, in the head's shadow (no rim), the clusters' lit crescents one step down.
 */
export function drawCurlBack(buf, L, m, head, s, sk) {
  const H = L.head;
  const tr = tier(s);
  const lag = sk ? sk.hairLag || 0 : 0;
  const cy = -0.6, rx = H.R + 3.0, top = H.top - 1.4, bottom = H.chinY + 2.0;
  const [x0, y0, x1, y1] = localBox(head, -rx - 1.5, top - 1, rx + 1.5, bottom + 1);
  const q = LXY.set(head);
  buf.shape(x0, y0, x1, y1, m.hairBack, (px, py) => {
    q.at(px, py);
    const y = q.y;
    const x = q.x - (y > 0 ? lag * 0.5 * Math.min(1, y / bottom) : 0);
    const ry = y < cy ? cy - top : bottom - cy;
    const ex = x / rx, ey = (y - cy) / ry;
    const ang = Math.atan2(ey, ex);
    const edge = 1 + 0.07 * Math.sin(ang * 9 + 0.6) + 0.04 * Math.sin(ang * 17 + 1.3); // the clusters' scallops
    if (ex * ex + ey * ey > edge * edge) return -1;
    if (tr === 0) return 2;
    const c = curlAt(x, y, 11);
    return c ? Math.max(1, curlTone(c, 2)) : 2;
  });
}

/**
 * The front: from a clean hairline the hair lies back to a thin headband over the crown (the band in the look's
 * `band` material, lit on the key side), behind it the curls rise; down each side of the face, over the ears, curl
 * clusters frame the face to the jaw. The wide keeps the band (2 px of colour) and two tones.
 */
export function drawCurlBand(buf, L, m, head, s, sk) {
  const H = L.head;
  const tr = tier(s);
  const lag = sk.hairLag || 0;
  const cyc = H.craniumY - 0.3;
  const RV = H.R + 1.25;
  const yawX = Math.sin(head.yaw) * H.R * 0.8;
  const pitchShift = Math.sin(head.pitch) * 2.0;
  const bottom = H.chinY - 1.2;
  const [x0, y0, x1, y1] = localBox(head, -RV - 1.5, cyc - RV - 1, RV + 1.5, bottom + 0.8);
  const q = LXY.set(head);
  const HW = HWL.set(H, 0);
  const band = m.band;
  buf.shape(x0, y0, x1, y1, m.hair, (px, py) => {
    q.at(px, py);
    const y = q.y;
    const x = q.x - (y > 0 ? lag * Math.min(1, y / bottom) ** 2 : 0);
    if (y > bottom) return -1;
    const ax = Math.abs(x);
    const hw = HW.at(y);
    const fx = x - yawX;
    // the outline: a rounded dome a little scalloped, then the side curls widening to the jaw
    let inMass;
    if (y < cyc) {
      const ang = Math.atan2(y - cyc, x);
      const r = RV + 0.22 * Math.sin(ang * 10 + 0.4);
      inMass = x * x + (y - cyc) * (y - cyc) <= r * r;
    } else inMass = ax <= RV + 0.5 * (y - cyc) / (bottom - cyc) + 0.2 * Math.sin(y * 2.4);
    if (!inMass) return -1;
    const hairline = H.top + 3.55 + pitchShift + 0.06 * fx * fx;
    // the face window, and the cheeks below the temples stay clear (the side curls fall beside the face)
    if (y > hairline && ax < hw - 0.85) return -1;
    if (y > H.cheekY - 0.6 && ax < hw + 0.4) return -1;
    // the headband over the crown
    const bandY = H.top + 1.75 + pitchShift + 0.045 * fx * fx;
    const inBand = band && Math.abs(y - bandY) < 0.5 + (tr === 0 ? 0.15 : 0) && ax < hw + 0.9 && y < cyc + 1.5;
    if (inBand) {
      const tt = fx < -1.5 ? 0 : fx < 2.5 ? 1 : 2;
      return (band << 4) | (tr === 0 ? Math.max(1, tt) : tt);
    }
    let t = toneN(m.hair, (x / RV) * 0.9, clamp((y - cyc) / (RV * 1.2), -1, 1) * 0.9);
    const nearFace = y > hairline - 0.3 && ax < hw + 0.9;
    if (tr === 0) {
      if (nearFace) t = Math.max(t, x > 0 ? 2 : 1);
      return t === 0 ? (y < bandY && x < 0 ? 0 : 1) : t;
    }
    if (nearFace) t = Math.max(t, x > 0 ? 2 : 1);
    // between the hairline and the band: drawn back smooth (strokes toward the band); elsewhere curls
    if (y > bandY && y < hairline + 0.2 && ax < hw - 0.2) {
      if (t === 0) t = 1;
      return x > 0.4 * hw ? Math.max(t, 2) : t;
    }
    const c = curlAt(x, y, 23);
    if (!c) return Math.max(t, 2);
    const ct = curlTone(c, Math.max(1, t));
    return ct === t ? t : (m.hairD << 4) | ct;
  });
  const g = head.gb + GROUPS.hair;
  selOutEdge(buf, x0, y0, x1, y1, g, head.gb + GROUPS.head, m.hair, m.hairEdge);
  if (s >= 1.35) hairLight(buf, head, g, rimMat(P.silver), H.R * 0.25, RV + 1.5, cyc - RV - 1, cyc + 1, Math.max(2, Math.round(s * 1.0)));
}
