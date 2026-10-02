// Faces for the canvas25d rig: eyes, lids, brows, nose and a parametric mouth.
//
// Feature positions are authored in head space (units, origin at the head
// centre) and pushed through faceX(), which wraps them around the head so a
// yaw turn slides the far eye in, the nose further, and the hairline with
// them. Features are painted as exact-colour decals into the head's group,
// so hair drawn afterwards still covers the forehead correctly.
//
// The look is deliberately adult and believable (owner's tone note): almond
// eyes about a fifth of the face wide, sitting on the head's half-way line,
// a 1 px glint, a lid crease, brows on the brow ridge, a long nose that casts
// a small shadow away from the key light, thin natural lips. Level of detail
// by scale s (px per unit):
//   S  s < 1.35  wide shots: 2x1 px eyes, 1 px brows, a short mouth line
//   M  s < 2.2   two-shots / medium: lid line over a 1-row eye, no glint
//   L  s ≥ 2.2   close-ups: full eye, crease, brow ridge shade, nose shadow,
//                mouth from viseme parameters
// Speech rules: the interior is warm maroon (never a black hole), teeth are a
// 1 px band and only for the visemes that show them, the jaw drops ≤ 2 px at
// close-up scale and every change is blended upstream (visemes.js).
import { P } from '../../palette.js';
import { material } from './pixbuf.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** A decal material that paints one exact palette colour. */
export function decal(hex) {
  return material(`decal:${hex}`, { ramp: [hex], decal: true });
}

/** Head half-width at head-local y (units). Returns ≤ 0 outside. */
export function headHW(H, y, jaw = 0) {
  if (y < H.craniumY) {
    const d = y - H.craniumY;
    const v = H.R * H.R - d * d;
    return v > 0 ? Math.sqrt(v) : -1;
  }
  if (y < H.cheekY) return H.R + ((H.cheekHW - H.R) * (y - H.craniumY)) / (H.cheekY - H.craniumY);
  const chinY = H.chinY + jaw;
  if (y > chinY) return -1;
  const u = (y - H.cheekY) / (chinY - H.cheekY);
  let hw = H.cheekHW * Math.pow(Math.max(0, 1 - Math.pow(u, H.jawPow)), 1 / H.jawPow);
  if (u > 0.74) {
    const k = (u - 0.74) / 0.26;
    const chin = H.chinHW * Math.sqrt(Math.max(0, 1 - k * k * k * 0.9));
    if (chin > hw) hw = chin;
  }
  return hw;
}

/** Feature-space x → head-local x after a yaw turn (features ride on the head's curve). */
export function faceX(H, x, y, yaw, protrude = 0) {
  if (!yaw) return x;
  const hw = Math.max(1, headHW(H, clamp(y, H.top + 1, H.chinY - 0.5), 0));
  const a = Math.asin(clamp(x / hw, -0.99, 0.99)) + yaw;
  const jy = clamp((y - H.cheekY) / (H.chinY - H.cheekY), 0, 1);
  return hw * Math.sin(a) + Math.sin(yaw) * (protrude + 1.3 * jy);
}

// ---------------------------------------------------------------------------

/**
 * Draw the face of `head` (character.js headFrame) with parameters `f`:
 *   blink 0..1, lookX/lookY -1..1, browL/browR raise (units, + up), browIn (+ frown, - worried),
 *   smile -1..1, squint 0..1, lid 0..1 (heavy lids), wide 0..1 (eyes wide open),
 *   mouth: open, wide, round, teeth, tongue, press, tuck (visemes.js)
 */
export function drawFace(buf, L, head, f, s) {
  const H = L.head;
  const pitch = Math.sin(head.pitch) * 2.0;
  const tier = s < 1.35 ? 0 : s < 2.2 ? 1 : 2;
  const map = (x, y, protrude = 0) => {
    const yy = y + pitch;
    return head.toScreen(faceX(H, x, yy, head.yaw, protrude), yy);
  };
  const sk = L._mats.skinD;
  const E = L.eyes;
  for (const side of [-1, 1]) {
    const [cx, cy] = map(side * E.x, E.y);
    const turn = Math.sin(head.yaw) * side;
    const squash = clamp(1 - Math.max(0, -turn) * 0.55, 0.55, 1);
    drawEye(buf, L, sk, cx, cy, E.w * s * squash, E.h * s, f, side, tier);
  }
  drawBrows(buf, L, map, f, s, tier);
  drawNose(buf, L, sk, map, s, tier);
  drawMouth(buf, L, sk, map, f, s, tier);
}

function eyeOpen(f) {
  const blink = clamp(f.blink || 0, 0, 1);
  const base = 1 - (f.lid || 0) * 0.4 - (f.squint || 0) * 0.32 + (f.wide || 0) * 0.18;
  return clamp(base * (1 - blink), 0, 1.15);
}

function drawEye(buf, L, sk, cx, cy, w, h, f, side, tier) {
  const E = L.eyes;
  const open = eyeOpen(f);
  const lash = decal(E.lash || P.black);
  const white = decal(P.white);
  const silver = decal(P.silver);
  const iris = decal(E.iris[0]);
  const irisDark = decal(E.iris[1]);
  const pupil = decal(P.black);
  const lx = clamp(f.lookX || 0, -1, 1), ly = clamp(f.lookY || 0, -1, 1);

  if (tier === 0) {
    // wide shot: two dark pixels, the one toward the gaze darker; skin shade when closed
    const x = Math.round(cx - 1), y = Math.round(cy - 0.5);
    if (open < 0.4) {
      buf.plot(x, y, sk, 2);
      buf.plot(x + 1, y, sk, 2);
      return;
    }
    const dark = lx > 0.25 ? 1 : lx < -0.25 ? 0 : side < 0 ? 1 : 0;
    buf.plot(x + dark, y, pupil, 1);
    buf.plot(x + 1 - dark, y, irisDark, 1);
    return;
  }

  const W = Math.max(3, Math.round(w));
  const Hh = Math.max(2, Math.round(h));
  const x0 = Math.round(cx - W / 2);
  const yTop = Math.round(cy - Hh / 2);
  if (tier === 1) {
    // medium: lid line over a row of eye with a 2 px iris that follows the gaze
    const covered = Math.round((1 - clamp(open, 0, 1)) * Hh);
    if (covered >= Hh) {
      for (let i = 0; i < W; i++) buf.plot(x0 + i, yTop + Hh - 1, lash, 1);
      return;
    }
    for (let r = Math.max(1, covered); r < Hh; r++) for (let i = 0; i < W; i++) buf.plot(x0 + i, yTop + r, i < W / 2 ? white : silver, 1);
    const ix = clamp(Math.round(x0 + W / 2 - 1 + lx * (W * 0.3)), x0, x0 + W - 2);
    for (let r = Math.max(1, covered); r < Hh; r++) {
      buf.plot(ix, yTop + r, pupil, 1);
      buf.plot(ix + 1, yTop + r, iris, 1);
    }
    for (let i = 0; i < W; i++) buf.plot(x0 + i, yTop + Math.max(0, covered), lash, 1);
    buf.plot(side < 0 ? x0 - 1 : x0 + W, yTop + Math.max(0, covered) + 1, lash, 1);
    return;
  }

  // ---- close-up eye
  const covered = Math.round((1 - clamp(open, 0, 1)) * Hh);
  const half = [];
  for (let r = 0; r < Hh; r++) {
    const v = (r + 0.5 - Hh / 2) / (Hh / 2);
    half.push(Math.max(1, Math.round((W / 2) * Math.pow(Math.max(0, 1 - v * v), 0.3) + 0.15)));
  }
  const mid = x0 + W / 2;
  // lid crease and brow-ridge shade (above the eye)
  const creaseY = yTop - 2;
  if (covered < Hh) {
    for (let x = Math.round(mid - half[0] * 0.7); x < Math.round(mid + half[0] * 0.7); x++) buf.plot(x + side, creaseY, sk, 2);
  }
  if (side > 0) {
    // the socket on the far side of the key light: a short shadow at the outer corner
    buf.plot(Math.round(mid + half[0] + 1), creaseY, sk, 2);
    buf.plot(Math.round(mid + half[0] + 1), creaseY + 1, sk, 2);
  }
  if (covered >= Hh) {
    // closed: the lash line where the lids meet, skin above
    const yc = Math.round(Hh * 0.6);
    for (let r = 0; r < yc; r++) for (let x = Math.round(mid - half[r]); x < Math.round(mid + half[r]); x++) buf.plot(x, yTop + r, sk, 1);
    for (let i = -1; i <= W; i++) {
      if ((side < 0 && i === W) || (side > 0 && i === -1)) continue;
      const u = (i + 0.5) / W;
      buf.plot(x0 + i, yTop + yc + (u < 0.1 || u > 0.9 ? -1 : 0), lash, 1);
    }
    return;
  }
  const irisR = Hh * 0.5;
  const icx = mid + lx * W * 0.18;
  const icy = yTop + Hh * 0.56 + ly * Hh * 0.12;
  for (let r = covered; r < Hh; r++) {
    const a = Math.round(mid - half[r]), b = Math.round(mid + half[r]);
    for (let x = a; x < b; x++) {
      const dx = x + 0.5 - icx, dy = yTop + r + 0.5 - icy;
      let mtl;
      if (dx * dx + dy * dy * 0.85 <= irisR * irisR) {
        const pupilHit = Math.abs(dx) <= (W >= 10 ? 1 : 0.6) && Math.abs(dy) < Hh * 0.3;
        mtl = pupilHit ? pupil : dy < -Hh * 0.08 || r === covered ? irisDark : iris;
      } else {
        // sclera: lit toward the key (left), cooler on the far side, in the corners and under the lid
        const towardLight = x + 0.5 < icx;
        mtl = r === covered || x === a || x === b - 1 || !towardLight ? silver : white;
      }
      buf.plot(x, yTop + r, mtl, 1);
    }
  }
  if (Hh - covered >= 3) buf.plot(Math.round(icx - 1.5), Math.max(yTop + covered + 1, Math.round(icy - Hh * 0.28)), white, 1);
  // upper lid skin while blinking
  for (let r = 0; r < covered; r++) {
    for (let x = Math.round(mid - half[r]); x < Math.round(mid + half[r]); x++) buf.plot(x, yTop + r, sk, 1);
  }
  // lash line: 1 px across, 2 px over the outer 40 %, past the outer corner
  const ly0 = yTop + covered - 1;
  const hTop = half[Math.min(Hh - 1, covered)] + 1;
  for (let x = Math.round(mid - hTop); x < Math.round(mid + hTop); x++) {
    const u = (x + 0.5 - mid) / hTop;
    const outer = side < 0 ? -u : u;
    if (outer < -0.9) continue;
    buf.plot(x, ly0, lash, 1);
    if (outer > (E.lashes ? 0.3 : 0.55)) buf.plot(x, ly0 + 1, lash, 1);
  }
  const ox = side < 0 ? Math.round(mid - hTop) - 1 : Math.round(mid + hTop);
  buf.plot(ox, ly0 + 1, lash, 1);
  if (E.lashes) buf.plot(ox, ly0, lash, 1);
  // lower lid: a soft line under the outer part
  const yb = yTop + Hh;
  const lw = Math.max(2, Math.round(W * 0.55));
  const lx0 = side < 0 ? Math.round(mid - half[Hh - 1]) : Math.round(mid + half[Hh - 1]) - lw;
  for (let x = lx0; x < lx0 + lw; x++) buf.plot(x, yb, sk, 2);
  if (E.bags) {
    const bx0 = side < 0 ? lx0 - 1 : lx0 + 2;
    for (let x = bx0; x < bx0 + Math.max(2, lw - 2); x++) buf.plot(x, yb + 2, sk, 2);
  }
  if ((f.squint || 0) > 0.45) for (let x = lx0; x < lx0 + lw; x++) buf.plot(x, yb - 1, sk, 1);
}

function drawBrows(buf, L, map, f, s, tier) {
  const B = L.brows, E = L.eyes;
  const col = decal(B.color);
  const thick = Math.max(1, Math.round(B.thick * s));
  for (const side of [-1, 1]) {
    const raise = (side < 0 ? f.browL : f.browR) || 0;
    const frown = f.browIn || 0; // + inner ends down (serious), - inner ends up (worried)
    const inner = side * (E.x - B.len * 0.48);
    const outer = side * (E.x + B.len * 0.52);
    const steps = Math.max(2, Math.round(B.len * s * 1.3));
    let prev = null;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps; // 0 inner (head of the brow) → 1 outer (tail)
      const x = inner + (outer - inner) * u;
      const arch = B.arch * Math.sin(Math.min(1, u * 1.35) * Math.PI) * (1 + Math.max(0, raise) * 0.4);
      const y = B.y - raise * (0.7 + 0.3 * u) - arch + frown * 0.6 * (1 - u) * (1 - u) + Math.max(0, u - 0.7) * 1.2;
      const [sx, sy] = map(x, y);
      const p = [Math.round(sx), Math.round(sy)];
      const th = tier === 0 ? 1 : Math.max(1, Math.round(thick * (u < 0.3 ? 1 : u > 0.75 ? 0.5 : 0.85)));
      if (prev && Math.abs(p[0] - prev[0]) > 1) {
        const dir = Math.sign(p[0] - prev[0]);
        for (let x2 = prev[0] + dir; x2 !== p[0]; x2 += dir) for (let k = 0; k < th; k++) buf.plot(x2, prev[1] + k, col, 1);
      }
      for (let k = 0; k < th; k++) buf.plot(p[0], p[1] + k, col, 1);
      prev = p;
    }
  }
}

function drawNose(buf, L, sk, map, s, tier) {
  const N = L.nose;
  const [tx0, ty0] = map(0, N.y1, 1.2);
  const tx = Math.round(tx0), ty = Math.round(ty0);
  if (tier === 0) {
    buf.plot(tx + 1, ty, sk, 2);
    return;
  }
  const half = Math.max(1, Math.round(N.w * s * 0.5));
  if (tier === 1) {
    buf.plot(tx + 1, ty - 1, sk, 2);
    for (let i = -half + 1; i <= half; i++) buf.plot(tx + i, ty, sk, 2);
    return;
  }
  // close-up: the bridge's far side in shade running into the wing, a small cast shadow down-right
  // (key light from camera-left), the shadow under the tip, nostrils, a highlight on the bridge
  const [bx0, by0] = map(N.w * 0.32, N.y0 + (N.y1 - N.y0) * 0.25, 0.9);
  const bx = Math.round(bx0), by = Math.round(by0);
  const len = Math.max(1, ty - 2 - by);
  for (let y = by; y <= ty - 2; y++) buf.plot(bx + Math.round((y - by) / len), y, sk, 2);
  const [hx, hy] = map(-N.w * 0.15, N.y0 + (N.y1 - N.y0) * 0.55, 1.0);
  buf.plot(Math.round(hx), Math.round(hy), sk, 0);
  buf.plot(Math.round(hx), Math.round(hy) + 1, sk, 0);
  for (let i = bx + 1; i <= tx + half; i++) buf.plot(i, ty - 1, sk, 2);
  buf.plot(tx + half, ty, sk, 2);
  buf.plot(tx + half + 1, ty, sk, 2);
  buf.plot(tx - half, ty, sk, 2);
  for (let i = -half + 1; i <= half + 1; i++) buf.plot(tx + i, ty + 1, sk, 2);
  buf.plot(tx + half + 2, ty + 1, sk, 2);
  buf.plot(tx - half + 1, ty, sk, 3);
  buf.plot(tx + half - 1, ty, sk, 3);
  buf.plot(tx - 1, ty - 1, sk, 0);
}

/**
 * Mouth from viseme parameters. open: interior height (0..1), wide: corners out, round: lips pursed,
 * teeth: the upper teeth band, tongue: tongue tip, press: lips pressed (MBP), tuck: lower lip under the
 * teeth (FV). smile lifts the corners.
 */
function drawMouth(buf, L, sk, map, f, s, tier) {
  const M = L.mouth;
  const lipLine = decal(M.lip);
  const lipHi = decal(M.lipHi);
  const upper = decal(M.upper || M.lipHi);
  const inner = decal(M.inner);
  const teethC = decal(M.teeth);
  const tongueC = decal(M.tongue);
  const open = clamp(f.open || 0, 0, 1);
  const round = clamp(f.round || 0, 0, 1);
  const wide = clamp(f.wide || 0, -1, 1);
  const smile = clamp(f.smile || 0, -1, 1);
  const [cx, cy] = map(0, M.y + open * 0.3, 0.6);
  const mw = M.w * s * (1 + wide * 0.22) * (1 - round * 0.36);
  const half = Math.max(1, Math.round(mw / 2));
  const ih = tier === 0 ? Math.round(open * 1.2) : Math.round(open * (tier === 1 ? 1.2 : 1.45) * s * 0.85);
  const x0 = Math.round(cx), y0 = Math.round(cy);
  const cornerLift = smile > 0.3 ? 1 : smile < -0.25 ? -1 : 0;

  if (tier === 0) {
    if (ih <= 0) {
      for (let i = -half; i < half; i++) buf.plot(x0 + i, y0, sk, 3);
      return;
    }
    for (let i = -half + (round > 0.5 ? 1 : 0); i < half - (round > 0.5 ? 1 : 0); i++) buf.plot(x0 + i, y0, inner, 1);
    return;
  }

  if (ih <= 0 || f.press > 0.5) {
    // closed: one lip line, corners shaped by the smile; a thin upper lip, a lit lower lip and its shadow
    const hw = Math.max(1, half - (f.press > 0.5 ? 1 : 0));
    for (let i = -hw; i < hw; i++) {
      const edge = i === -hw || i === hw - 1;
      buf.plot(x0 + i, y0 - (edge && cornerLift > 0 ? 1 : 0) + (edge && cornerLift < 0 ? 1 : 0), lipLine, 1);
    }
    if (tier === 2) {
      const uw = Math.max(1, Math.round(hw * 0.7));
      for (let i = -uw; i < uw; i++) buf.plot(x0 + i, y0 - 1, upper, 1);
      const lw = Math.max(1, Math.round(hw * 0.6));
      for (let i = -lw; i < lw; i++) buf.plot(x0 + i, y0 + 1, f.press > 0.5 ? upper : lipHi, 1);
      for (let i = -lw + 1; i < lw - 1; i++) buf.plot(x0 + i, y0 + 2, sk, 2);
    }
    return;
  }

  // open: rows of warm interior, rounded per `round`, a teeth band and the tongue tip when asked
  const rowsH = clamp(ih, 1, Math.round(2.2 * s));
  const top = y0 - Math.floor(rowsH / 2);
  const showTeeth = (f.teeth || 0) > 0.45 && rowsH >= 2;
  const showTongue = (f.tongue || 0) > 0.5 && rowsH >= 3;
  for (let r = 0; r < rowsH; r++) {
    const v = ((r + 0.5) / rowsH) * 2 - 1;
    const prof = round > 0.5 ? Math.sqrt(Math.max(0, 1 - v * v)) : Math.pow(Math.max(0, 1 - v * v * v * v), 0.25);
    const hw = Math.max(1, Math.round(half * (0.55 + 0.45 * prof) * (r === 0 || r === rowsH - 1 ? 0.86 : 1)));
    for (let i = -hw; i < hw; i++) {
      let c = inner;
      if (showTeeth && r === 0 && Math.abs(i + 0.5) < hw * 0.7) c = teethC;
      if (showTongue && r === rowsH - 1 && Math.abs(i + 0.5) < hw * 0.55) c = tongueC;
      buf.plot(x0 + i, top + r, c, 1);
    }
    buf.plot(x0 - hw - 1, top + r, lipLine, 1);
    buf.plot(x0 + hw, top + r, lipLine, 1);
  }
  const hwTop = Math.max(1, Math.round(half * 0.82));
  for (let i = -hwTop; i < hwTop; i++) buf.plot(x0 + i, top - 1, lipLine, 1);
  if (tier === 2) for (let i = -Math.round(hwTop * 0.7); i < Math.round(hwTop * 0.7); i++) buf.plot(x0 + i, top - 2, upper, 1);
  if (cornerLift > 0) {
    buf.plot(x0 - hwTop - 1, top - 1, lipLine, 1);
    buf.plot(x0 + hwTop, top - 1, lipLine, 1);
  }
  const hwBot = Math.max(1, Math.round(half * 0.7));
  if (f.tuck > 0.5) {
    for (let i = -hwBot; i < hwBot; i++) buf.plot(x0 + i, top + rowsH, lipHi, 1);
  } else if (tier === 2) {
    for (let i = -hwBot; i < hwBot; i++) buf.plot(x0 + i, top + rowsH, lipHi, 1);
    for (let i = -hwBot + 1; i < hwBot - 1; i++) buf.plot(x0 + i, top + rowsH + 1, sk, 2);
  } else {
    for (let i = -hwBot; i < hwBot; i++) buf.plot(x0 + i, top + rowsH, lipLine, 1);
  }
}
