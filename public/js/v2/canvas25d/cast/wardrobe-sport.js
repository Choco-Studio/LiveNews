// FULL TIME's wardrobe (docs/programmes/full-time.md §2): zip tops for a pitchside desk, worn by Kai Sprite and
// Rosa Rally (cast/full-time.js). No one else on air wears a zip top: the channel's other presenters wear tailoring
// and knits (cast/outfit.js, cast/wardrobe-b.js), the correspondents and experts tailoring.
//
//   'zipTop'   a zip-front top half open over a white crew tee, on the shared torso (outfit.js torsoFrame):
//                L.zip.collar 'rib'    a bomber's knit collar band in the look's trim colour (m.trim)
//                             'stand'  a track top's / a quarter-zip's standing collar (m.collar)
//                L.zip.open   the zip's stop (body units below the neck base): the depth of the V
//                L.zip.knit   fine knit ribs on the lit body (a quarter-zip)
//                L.zip.waist  a rib waistband in the trim colour (a bomber; it shows only off the desk)
//   drawSleeveStripes   the look's parts.sleeves hook: a stripe down the outside of each sleeve (m.stripe)
//
// Look materials read here (mats): tee (the crew tee; default the shirt), trim, collar, zip, stripe.
// Detail by tier (wardrobe-b.js tier): the wide keeps the silhouette, the V of the tee and the collar as one band;
// mediums add the zip line and the collar's shading; close-ups the rib ticks, the zip's teeth and pull, seams.
import { P } from '../../../palette.js';
import { material } from '../pixbuf.js';
import { GROUPS } from '../character.js';
import { registerOutfit, torsoFrame } from './outfit.js';
import { LOOK, tier, bodyPaint, bodyPoly, clothTone, drape, bunch, shoulderRim, knitRibs, smoothPts } from './wardrobe-b.js';

// ---------------------------------------------------------------------------
// The zip top

// the V of the open zip (body units): half-width vHalf(y) from V_TOP down to the zip's stop, where it closes to the
// zip's own width; the collar ring and the tee are both cut by it
const V_TOP = -3.6;
function vHalf(y, open, hvTop) {
  return 0.45 + (hvTop - 0.45) * Math.max(0, (open - y) / (open - V_TOP));
}

function zipTop(o) {
  const { buf, L, m, s, gb, G, clip } = o;
  const { T, lift, outline } = torsoFrame(o);
  const t = tier(s);
  const Z = L.zip || {};
  const nk = T.neckHW;
  const open = Z.open ?? 8.5;
  const hvTop = Z.vw ?? 2.35; // the V's half-width at V_TOP (about 1.9 u where it meets the collar)
  const c = o.toS(0, 0);
  const inv = o.inv;
  const M8 = buf.mat, G8 = buf.grp, W = buf.w;

  // ---- body
  buf.part(gb + G.jacket, 8, clip);
  const body = [];
  for (const [x, y] of outline) body.push(x, y);
  buf.poly(body, m.jacket, sheenTone(o, T, Z.lit));
  const gJ = gb + G.jacket;
  if (Z.knit && t === 2) knitRibs(o, m.jacket, gJ, T);

  // ---- the tee in the V: its crew neckline hugs the base of the neck (the neck's skin above it stays, in the
  // neck's own group and shading)
  const tee = m.tee || m.shirt;
  const gNeck = gb + G.neck;
  const nr = L.neck.hw + 0.35; // the crew neck's half-width
  buf.part(gb + G.shirt, 6, clip);
  const teePts = bodyPoly(o, lift, [[-hvTop, V_TOP], [hvTop, V_TOP], [0.45, open + 0.3], [-0.45, open + 0.3]]);
  buf.poly(teePts, tee, (x, y) => {
    inv.at(x + 0.5, y + 0.5);
    const bx = inv.x, by = inv.y;
    const k = bx / nr;
    const neckline = -0.55 + 1.55 * Math.max(0, 1 - k * k);
    if (by < neckline) {
      const i = y * W + x;
      if (M8[i] && G8[i] === gNeck) return -1;
    }
    // the crew neck's rib: one row a step down along the neckline (mediums and closer)
    if (t >= 1 && by < neckline + 1.1 / s + 0.2) return bx > 0.3 * nr ? 3 : 2;
    // lit toward the key, the far side of the V in the jacket's shadow
    return bx < -0.35 * nr ? 0 : bx > 0.25 * nr ? 2 : 1;
  });

  // ---- the collar ring round the base of the neck, cut by the V
  if (Z.collar === 'rib') {
    // its own group (a local line where the knit lies on the body); in the wide the body's group and a little
    // wider, so the line does not eat the 2 px of orange that make the bomber at 1x
    buf.part(t === 0 ? gJ : gb + LOOK + 1, 9, clip);
    const w0 = t === 0 ? 0.5 : 0;
    collarRing(o, lift, t, m.trim, { rxi: L.neck.hw + 0.1, cyi: -2.0, ryi: 2.6, rxo: nk + 1.9 + w0, cyo: -2.2, ryo: 4.0 + w0, fold: 0.8, ribs: true }, open, hvTop);
  } else {
    buf.part(gJ, 8, clip); // the body's own cloth rising up the neck: no seam where it grows from the shoulders
    collarRing(o, lift, t, m.jacket, { rxi: L.neck.hw + 0.05, cyi: -2.65, ryi: 3.25, rxo: nk + 2.4, cyo: -3.5, ryo: 5.1, fold: 0.9, inside: true }, open, hvTop);
  }

  // ---- the fronts' edges along the V and the closed zip below it (the zip tape catches the key on the lit side)
  const zipM = m.zip || m.jacket;
  if (t >= 1) {
    for (const side of [-1, 1]) {
      const edge = [];
      for (let y = -0.6; y <= open + 0.01; y += (open + 0.6) / 4) edge.push([side * (vHalf(y, open, hvTop) + 0.15), y]);
      bodyPaint(o, edge, zipM, side < 0 ? 1 : 2, gJ);
      if (t === 2) bodyPaint(o, edge, m.jacket, side < 0 ? 0 : 3, gJ, side < 0 ? -1 : 1);
    }
    bodyPaint(o, [[0, open], [0, T.bottom + 2]], zipM, 2, gJ);
    if (t === 2) {
      // teeth: the zip line broken by a lit tooth every other px; the pull hangs from the stop
      const [zx, ya] = o.toS(0, open + 1);
      const [, yb] = o.toS(0, T.bottom);
      for (let y = Math.round(ya); y < yb; y += 2) buf.paint(Math.round(zx), y, zipM, 1, gJ);
      const [px, py] = o.toS(0.3, open + 0.1);
      const len = Math.max(2, Math.round(1.5 * s));
      buf.part(gb + LOOK + 2, 10, clip);
      for (let j = 0; j < len; j++) {
        buf.plot(Math.round(px), Math.round(py) + j, zipM, j === 0 ? 0 : j === len - 1 ? 2 : 1);
        if (s >= 3) buf.plot(Math.round(px) + 1, Math.round(py) + j, zipM, j === len - 1 ? 3 : 2);
      }
    }
  }

  // ---- drape, seams, the waistband
  drape(o, m.jacket, gJ, t, Z.knit ? 1 : 0);
  bunch(o, m.jacket, gJ, t, 24.5, T.sideHW * 0.66);
  if (t === 2) {
    // set-in shoulder seams
    for (const side of [-1, 1]) bodyPaint(o, [[side * (nk + 4.6), 0.9], [side * (T.shoulderHW * 0.86), T.shoulderTop + 1.2]], m.jacket, side < 0 ? 1 : 2, gJ);
  }
  if (Z.waist && m.trim) {
    buf.part(gb + LOOK + 3, 9, clip);
    const y0 = T.bottom - 4.5;
    const band = bodyPoly(o, lift, [[-T.sideHW * 0.95, y0], [T.sideHW * 0.95, y0], [T.sideHW * 0.95, T.bottom], [-T.sideHW * 0.95, T.bottom]]);
    const ribStep = Math.max(2, Math.round(0.8 * s));
    buf.poly(band, m.trim, (x) => {
      const nx = (x + 0.5 - c[0]) / (T.sideHW * s);
      const tt = nx < -0.75 ? 0 : nx < 0.55 ? 1 : 2;
      return t === 2 && tt <= 1 && ((x - Math.round(c[0])) % ribStep + ribStep) % ribStep === 0 ? tt + 1 : tt;
    });
  }
  shoulderRim(o, T, gJ);
}

/**
 * The body's tones: the wardrobe's cloth planes (wardrobe-b clothTone); with `lit` (L.zip.lit, -1..1 across the
 * front) a nylon's sheen reaches further over the key side, its edge following the chest's volume (out over the
 * upper chest, back in toward the waist) so it reads as a lit plane of the body, never as a straight colour block.
 */
function sheenTone(o, T, lit) {
  const base = clothTone(o, { litEdge: -0.82, shadeEdge: 0.58 });
  if (lit == null) return base;
  const { toS, s } = o;
  const c = toS(0, 10);
  const halfW = T.shoulderHW * s;
  const topY = toS(0, T.shoulderTop)[1];
  return (x, y) => {
    const t = base(x, y);
    if (t !== 1) return t;
    const nx = (x + 0.5 - c[0]) / halfW;
    const top = (y + 0.5 - topY) / s;
    const edge = lit + 0.2 * Math.exp(-((top - 9) * (top - 9)) / 60) - 0.14 * Math.min(1, Math.max(0, (top - 18) / 14));
    return nx < edge ? 0 : 1;
  };
}

/**
 * The collar: the lower part of a ring round the neck (an inner and an outer half-ellipse, from a little behind the
 * neck's sides round the front), cut open by the V. A bomber's rib (`ribs`): a knit band in the trim colour, lit on
 * the key side, the far half in shade, its folded top edge catching the key, vertical rib ticks at close-ups. A
 * funnel collar (`inside`): the top's own cloth, taller, the inside of the collar along the V and the inner edge a
 * step darker. The wide keeps one flat band (what makes the top at 1x).
 */
function collarRing(o, lift, t, mt, R, open, hvTop) {
  const { buf, s } = o;
  const inv = o.inv;
  const c = o.toS(0, 0);
  const ribStep = Math.max(2, Math.round(0.8 * s));
  const a0 = -0.38, a1 = Math.PI + 0.38, n = 18;
  const ring = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    ring.push([-Math.cos(a) * R.rxo, R.cyo + Math.sin(a) * R.ryo]);
  }
  for (let i = n; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / n;
    ring.push([-Math.cos(a) * R.rxi, R.cyi + Math.sin(a) * R.ryi]);
  }
  const pts = bodyPoly(o, lift, ring);
  const px1 = 1 / s;
  buf.poly(pts, mt, (x, y) => {
    inv.at(x + 0.5, y + 0.5);
    const bx = inv.x, by = inv.y;
    if (Math.abs(bx) < vHalf(by, open, hvTop)) return -1; // the open zip
    const lit = bx < 0;
    if (t === 0) return lit ? 1 : 2;
    // how far across the band (0 at the neck edge .. 1 at the outer edge)
    const ki = Math.sqrt((bx / R.rxi) ** 2 + ((by - R.cyi) / R.ryi) ** 2);
    const ko = Math.sqrt((bx / R.rxo) ** 2 + ((by - R.cyo) / R.ryo) ** 2);
    const across = (ki - 1) / Math.max(0.05, (ki - 1) + (1 - ko));
    let tt = lit ? 1 : 2;
    if (R.ribs) {
      if (lit && across < R.fold * 0.45) tt = 0; // the fold at the band's top
      if (t === 2 && tt <= 1 && ((x - Math.round(c[0])) % ribStep + ribStep) % ribStep === 0) tt += 1;
    } else {
      if (across < 0.22 || Math.abs(bx) < vHalf(by, open, hvTop) + Math.max(px1, 0.5)) tt = lit ? 2 : 3; // the inside
      else if (across < 0.22 + R.fold * 0.25 && by < -2.0) tt = lit ? 0 : 1; // the fold's lit lip
    }
    return tt;
  });
}

registerOutfit('zipTop', zipTop);

// ---------------------------------------------------------------------------
// A stripe down the outside of each sleeve (parts.sleeves): from the shoulder to the cuff, on the side of
// the arm away from the body, ~a third of the sleeve's half-width, shaded with the sleeve under it (lit, base,
// shade) in the look's stripe ramp. 1 px in the wide, never broken into dots: every sleeve pixel inside the band
// takes it. Only the sleeve's own group is repainted (the hand and the other arm in front keep their pixels).

const SA = [0, 0], SE = [0, 0], SW = [0, 0];
let RIM_ID = 0;
export function drawSleeveStripes(buf, L, m, arms, toS, s, gb) {
  if (!m.stripe) return;
  RIM_ID ||= material('hands:rim', { ramp: [P.silver], decal: true });
  const A = L.arm;
  const W = buf.w, M8 = buf.mat, T8 = buf.tone, G8 = buf.grp;
  for (const key of ['L', 'R']) {
    const arm = arms[key];
    const sg = key === 'L' ? -1 : 1;
    const g = gb + (key === 'L' ? GROUPS.armA : GROUPS.armB);
    // the sleeve's cap (hands.js: the upper arm's top in a spare hand group, the shoulder cap in the jacket's group
    // in the sleeve's material): the stripe starts at the shoulder, not below it
    const gCap = gb + (key === 'L' ? GROUPS.handA : GROUPS.handB) + 1, gJ = gb + GROUPS.jacket;
    proj(toS, arm.shoulder, SA);
    proj(toS, arm.elbow, SE);
    proj(toS, arm.wrist, SW);
    const fx = SW[0] - SE[0], fy = SW[1] - SE[1];
    const fl = Math.sqrt(fx * fx + fy * fy) || 1;
    const cuff = Math.min(fl * 0.4, 1.3 * s);
    const hx = SW[0] - (fx / fl) * cuff, hy = SW[1] - (fy / fl) * cuff;
    const rU = A.rUpper * s, rE = A.rElbow * s, rW = A.rWrist * 1.04 * s;
    const x0 = Math.max(1, Math.floor(Math.min(SA[0], SE[0], hx) - rU - 1)), x1 = Math.min(W - 2, Math.ceil(Math.max(SA[0], SE[0], hx) + rU + 1));
    const y0 = Math.max(1, Math.floor(Math.min(SA[1], SE[1], hy) - rU - 1)), y1 = Math.min(buf.h - 2, Math.ceil(Math.max(SA[1], SE[1], hy) + rU + 1));
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const i = py * W + px;
        const gi = G8[i];
        if (!M8[i] || M8[i] === RIM_ID || !(gi === g || gi === gCap || (gi === gJ && M8[i] === m.sleeve))) continue;
        const qx = px + 0.5, qy = py + 0.5;
        // the nearer of the two segments (upper arm, forearm): its param u and the signed distance across
        const a = across(qx, qy, SA[0], SA[1], SE[0], SE[1], rU, rE, sg);
        const b = across(qx, qy, SE[0], SE[1], hx, hy, rE, rW, sg);
        const r = a.d2 <= b.d2 ? a : b;
        if (r === b && b.u > 1) continue;
        if (gi !== g && (r !== a || a.u > 0.45 || a.u < -0.15)) continue; // the cap: only at the top of the upper arm
        // the band: from 0.3 to 0.62 of the radius out from the centre line, at least 1 px wide
        const mid = 0.46 * r.r, half = Math.max(0.55, 0.16 * r.r);
        if (Math.abs(r.d - mid) > half) continue;
        T8[i] = T8[i] > 3 ? 3 : T8[i];
        M8[i] = m.stripe;
      }
    }
  }
}

function proj(toS, p, out) {
  const q = toS(p[0], p[1], p[2]);
  out[0] = q[0];
  out[1] = q[1];
}

// segment a→b with radii ra→rb: { u, d (signed, + toward the outside of the arm), r, d2 (squared distance) }
const AC = [{ u: 0, d: 0, r: 0, d2: 0 }, { u: 0, d: 0, r: 0, d2: 0 }];
let acI = 0;
function across(qx, qy, ax, ay, bx, by, ra, rb, sg) {
  const o = AC[acI++ & 1];
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy || 1e-6;
  const l = Math.sqrt(l2);
  let u = ((qx - ax) * dx + (qy - ay) * dy) / l2;
  o.u = u;
  const uc = u < 0 ? 0 : u > 1 ? 1 : u;
  const ex = qx - (ax + dx * uc), ey = qy - (ay + dy * uc);
  // the normal toward the outside of the arm (away from the body, a little up)
  let nx = -dy / l, ny = dx / l;
  if (nx * sg - ny * 0.35 < 0) {
    nx = -nx;
    ny = -ny;
  }
  o.d = ex * nx + ey * ny;
  o.r = ra + (rb - ra) * uc;
  o.d2 = ex * ex + ey * ey;
  return o;
}
