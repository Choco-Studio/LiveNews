// Faces for the canvas25d rig (owner: FACES stream): eyes, lids, brows, nose
// and a parametric mouth.
//
// Feature positions are authored in head space (units, origin at the head
// centre) and pushed through faceX(), which wraps them around the head so a
// yaw turn slides the far eye in, the nose further, and the hairline with
// them. Features are painted as exact-colour decals into the head's group,
// so hair drawn afterwards still covers the forehead correctly. The skin's
// planes (sockets, cheekbones, the nose's shadow side, the groove under the
// lip) come from head.js; this file draws what sits on top of them.
//
// The look is adult and calm on purpose (owner: "faces that are not scary";
// "not a children's programme"): almond eyes about a fifth of the face wide
// on the head's half-way line, the upper lid resting over the top of the iris
// (a relaxed, attentive eye, never a stare), sclera in light greys rather
// than white (white is kept for the 1 px catchlight, on the key-light side),
// brows that taper, a nose made of light and two nostril pixels, thin
// natural lips. Levels of detail by scale s (px per unit):
//   wide   s < 1.35  2 px eyes (a dash at rest; a lit pixel + pupil when the
//                    gaze is clearly off the lens), 1 px brows, a short lip line
//   medium s < 2.2   a lid line over one or two rows of eye, a 2 px iris that
//                    follows the gaze, tapered brows
//   close  s >= 2.2  the full eye: lid crease, lash line (heavier at the outer
//                    corner), lit/shaded sclera, iris with a darker top under the
//                    lid, pupil, catchlight; lower lid; brows with soft tails;
//                    nostrils; lips with a darker upper and a lit lower lip
// Speech rules: the interior is warm maroon (never a black hole); teeth are a
// short band only for the visemes that show them; the opening is at most 2
// rows below s 3.2 and 3 rows above it, the jaw drops at most 2 px (head.js);
// m/b/p press the lips shut; blends happen upstream (speechFrame mix).
import { P } from '../../palette.js';
import { decal } from './pixbuf.js';
import { WRAP, wrapBegin, wrapX } from './head.js';
import { clamp } from './space.js';

// headHW / faceX / decal moved to head.js and pixbuf.js; re-exported for older imports.
export { headHW, faceX } from './head.js';
export { decal };

// ---------------------------------------------------------------------------
// Per-look decal materials (registered once; no string building per frame)

const MATS = new WeakMap();
function matsFor(L) {
  let m = MATS.get(L);
  if (m) return m;
  const E = L.eyes, M = L.mouth, B = L.brows;
  m = {
    lash: decal(E.lash || P.black),
    white: decal(P.white),
    silver: decal(P.silver),
    fog: decal(P.fog),
    iris: decal(E.iris[0]),
    irisDark: decal(E.iris[1]),
    // wide shots: the iris row under the lash (the darker of the two iris colours
    // would merge with the lash into a hole; the lighter one alone reads as a stare)
    irisW: decal(E.irisWide || E.iris[0]),
    pupil: decal(P.black),
    brow: decal(B.color),
    lip: decal(M.lip),
    lipHi: decal(M.lipHi),
    upper: decal(M.upper || M.lipHi),
    inner: decal(M.inner),
    teeth: decal(M.teeth),
    tongue: decal(M.tongue),
  };
  MATS.set(L, m);
  return m;
}

// ---------------------------------------------------------------------------
// Head-space → screen for features (module scratch; no allocation)

const F = { H: null, cx: 0, cy: 0, s: 1, cr: 1, sr: 0, yaw: 0, pitch: 0, x: 0, y: 0 };
function mapF(x, y, protrude = 0) {
  const yy = y + F.pitch;
  WRAP[0] = x;
  WRAP[1] = yy;
  WRAP[2] = F.yaw;
  WRAP[3] = protrude;
  wrapX();
  const fx = WRAP[4];
  F.x = F.cx + F.s * (fx * F.cr - yy * F.sr);
  F.y = F.cy + F.s * (fx * F.sr + yy * F.cr);
}

// Paint over skin one tone darker than what is there (creases, folds), clamped to deep.
function deepen(buf, x, y, sk, min = 2) {
  if (x < 1 || y < 1 || x >= buf.w - 1 || y >= buf.h - 1) return;
  const i = y * buf.w + x;
  if (!buf.mat[i]) return;
  buf.plot(x, y, sk, Math.min(3, Math.max(min, buf.tone[i] + 1)));
}

/**
 * Draw the face of `head` (head.js headFrame) with parameters `f`:
 *   blink 0..1, lookX/lookY -1..1, browL/browR raise (units, + up), browIn (+ frown, - worried),
 *   smile -1..1, squint 0..1, lid 0..1 (heavy lids), wide 0..1 (eyes wide open),
 *   mouth: open, mwide (corners out), round, teeth, tongue, press, tuck (visemes.js / speech.js)
 */
export function drawFace(buf, L, head, f, s) {
  F.H = L.head;
  wrapBegin(L.head);
  F.cx = head.cx;
  F.cy = head.cy;
  F.s = s;
  F.cr = head.cr;
  F.sr = head.sr;
  F.yaw = head.yaw || 0;
  F.pitch = Math.sin(head.pitch || 0) * 2.0;
  const tier = s < 1.35 ? 0 : s < 2.2 ? 1 : 2;
  const mt = matsFor(L);
  const sk = L._mats.skinD;
  const E = L.eyes;
  // a mustache hides the smile, so the eyes alone carry it: half the squint there
  SQ.v = clamp(f.squint || 0, 0, 1) * (L.mustache ? 0.5 : 1);
  const open = eyeOpen(f);
  for (let side = -1; side <= 1; side += 2) {
    mapF(side * E.x, E.y);
    const turn = Math.sin(F.yaw) * side;
    const squash = clamp(1 - Math.max(0, -turn) * 0.55, 0.55, 1);
    drawEye(buf, L, mt, sk, F.x, F.y, E.w * s * squash, E.h * s, f, side, tier, open);
  }
  if (tier === 2) browSheen(buf, L, sk, f, s); // before the brows
  drawBrows(buf, L, mt, sk, f, s, tier);
  drawNose(buf, L, sk, s, tier);
  drawMouth(buf, L, mt, sk, head, f, s, tier);
}

const SQ = { v: 0 }; // this face's effective squint (drawFace)

function eyeOpen(f) {
  const blink = clamp(f.blink || 0, 0, 1);
  const base = 1 - (f.lid || 0) * 0.42 - SQ.v * 0.18 + (f.wide || 0) * 0.16;
  return clamp(base * (1 - blink), 0, 1.12);
}

// ---------------------------------------------------------------------------
// Eyes

function drawEye(buf, L, mt, sk, cx, cy, w, h, f, side, tier, open) {
  const E = L.eyes;
  const lx = clamp(f.lookX || 0, -1, 1), ly = clamp(f.lookY || 0, -1, 1);

  if (tier === 0) {
    // wide: 2 px wide and two rows tall when open (the lash over the iris), so the eye
    // reads as open at 1x (a flat dash reads as closed or looking down); a clear sideways
    // gaze turns the lower pixel away from the gaze into sclera; a heavy or half-closed
    // lid leaves the lash row only; closed lids are one row of skin shade.
    const x = Math.round(cx - 1), y = Math.round(cy - 0.5);
    if (open < 0.4) {
      buf.plot(x, y + 1, sk, 2);
      buf.plot(x + 1, y + 1, sk, 2);
      return;
    }
    buf.plot(x, y, mt.lash, 1);
    buf.plot(x + 1, y, mt.lash, 1);
    if (open < 0.75 || ly > 0.5) return;
    const iris = mt.irisW;
    if (lx > 0.45) {
      buf.plot(x, y + 1, mt.fog, 1);
      buf.plot(x + 1, y + 1, iris, 1);
    } else if (lx < -0.45) {
      buf.plot(x, y + 1, iris, 1);
      buf.plot(x + 1, y + 1, mt.fog, 1);
    } else {
      buf.plot(x, y + 1, iris, 1);
      buf.plot(x + 1, y + 1, iris, 1);
    }
    return;
  }

  const W = Math.max(3, Math.round(w));
  // medium tier: two rows of eye under the lid line as soon as the eye is ~2.2 px tall (critic
  // r2: one row under a lid line read as lowered, half-asleep listeners in the two-shot)
  const Hh = Math.max(tier === 1 && h >= 2.2 ? 3 : 2, Math.round(h));
  const x0 = Math.round(cx - W / 2);
  const yTop = Math.round(cy - Hh / 2);

  if (tier === 1) {
    // medium: a lid line over 1-2 rows; a 2 px iris (iris + pupil) placed by the
    // gaze with the same rounding for both eyes, so they never cross
    const rows = Hh - 1;
    if (open < 0.35) {
      for (let i = 0; i < W; i++) buf.plot(x0 + i, yTop + Hh - 1, mt.lash, 1);
      return;
    }
    const covered = open < 0.75 ? 1 : 0; // half-closed: the top eye row goes under the lid
    const lidY = yTop + covered;
    EYT[side < 0 ? 0 : 1] = yTop; // the brows keep a skin row above the lid line (drawBrows)
    // a 3 px iris (iris, pupil, iris) on an odd eye and 2 px on an even one, so a
    // gaze at the lens is centred; the gaze moves it a pixel either way
    const iw = W % 2 ? 3 : 2;
    const ix = clamp(x0 + ((W - iw) >> 1) + Math.round(lx * 1.2), x0, x0 + W - iw);
    const px = iw === 3 ? ix + 1 : ix + (lx < 0 ? 0 : 1);
    for (let r = 1 + covered; r <= rows; r++) {
      // a 2-row eye: the upper row in the lid's shadow (fog, the iris's darker colour), the lower
      // row lit (silver toward the key, the iris colour round the pupil): an open, calm eye
      const two = rows - covered >= 2;
      const lower = r === rows;
      for (let i = 0; i < W; i++) {
        const x = x0 + i;
        let m = x < ix ? mt.silver : mt.fog;
        // (the upper row takes the iris colour when the darker one is the lash's: Lola's black
        // under a black lid line read as a closed band)
        if (x >= ix && x < ix + iw) m = two ? (lower ? (x === px ? mt.pupil : mt.iris) : mt.irisDark === mt.lash ? mt.iris : mt.irisDark) : x === px ? mt.pupil : mt.irisDark;
        if (two && !lower && m === mt.silver) m = mt.fog;
        buf.plot(x, yTop + r, m, 1);
      }
    }
    const inner = side < 0 ? W - 1 : 0; // the lid line stops short of the inner corner
    for (let i = 0; i < W; i++) if (i !== inner || W < 5) buf.plot(x0 + i, lidY, mt.lash, 1);
    if (E.lashes) buf.plot(side < 0 ? x0 - 1 : x0 + W, lidY + 1, mt.lash, 1);
    return;
  }

  // ---- close-up: an almond, lids, crease, iris
  // Two passes: the lid rows of every column first (made monotone, so no single
  // column dips below its neighbours: a 1 px "drip" under the eye reads as a tear),
  // then the paint.
  const half = W / 2;
  const mid = x0 + half;
  const heavy = W >= 10; // s >= ~3.6
  const restTop = -Hh * 0.5, restBot = Hh * 0.5;
  const icx = mid + lx * W * 0.19;
  const ir = Math.min(Hh * 0.56, W * 0.29); // iris radius in px
  // the iris sits a little low: the upper lid rests over its top (relaxed, never a stare)
  const icy = cy + Hh * 0.05 + ly * Hh * 0.16;
  const blink = 1 - clamp(open, 0, 1);
  const squint = SQ.v;
  // a warm smile lifts the lower lid's middle (the cheek pushes up): the eye smiles
  // without the upper lid coming down, which at this size reads as sleepy or smug
  const cheek = clamp(((f.smile || 0) - 0.25) / 0.4, 0, 1);
  const n = W + 2;
  for (let k = 0; k < n; k++) {
    const x = x0 - 1 + k;
    const u = (x + 0.5 - mid) / half; // -1 left .. 1 right
    const o = u * side; // -1 inner corner .. 1 outer corner
    EO[k] = o;
    if (o < -1.05 || o > 1.08) {
      EA[k] = EB[k] = -9999;
      continue;
    }
    // almond: the upper lid peaks toward the nose, the lower lid dips toward the outer corner
    const up = restTop * Math.pow(Math.max(0, 1 - Math.pow((o + 0.18) / 1.18, 2)), 0.6) - Hh * 0.06 * o;
    let lo = restBot * Math.pow(Math.max(0, 1 - Math.pow((o - 0.12) / 1.12, 2)), 0.75) - Hh * 0.04 * o - squint * Hh * 0.22;
    lo -= cheek * Hh * 0.13 * Math.max(0, 1 - o * o);
    const top = up + (lo - 0.6 - up) * blink; // the upper lid comes down to close
    EA[k] = Math.round(cy + top);
    EB[k] = Math.round(cy + lo);
    EC[k] = Math.round(cy + up);
    EM[k] = Math.round(cy + (up + (lo - up) * 0.62));
  }
  // the lids are smooth: a lower-lid dip narrower than 3 columns is filled (an opening:
  // the row minimum over each column's neighbourhood, then the maximum of those), and no
  // upper-lid column rises above both its neighbours
  for (let k = 0; k < n; k++) {
    let m = EB[k];
    if (m < -9000) {
      ET[k] = m;
      continue;
    }
    if (k > 0 && EB[k - 1] > -9000 && EB[k - 1] < m) m = EB[k - 1];
    if (k < n - 1 && EB[k + 1] > -9000 && EB[k + 1] < m) m = EB[k + 1];
    ET[k] = m;
  }
  for (let k = 0; k < n; k++) {
    if (EB[k] < -9000) continue;
    let m = ET[k];
    if (k > 0 && ET[k - 1] > m) m = ET[k - 1];
    if (k < n - 1 && ET[k + 1] > m) m = ET[k + 1];
    if (m < EB[k]) EB[k] = m;
  }
  // the same for the upper lid (a peak narrower than 3 columns is filled)
  for (let k = 0; k < n; k++) {
    let m = EA[k];
    if (m < -9000) {
      ET[k] = m;
      continue;
    }
    if (k > 0 && EA[k - 1] > -9000 && EA[k - 1] > m) m = EA[k - 1];
    if (k < n - 1 && EA[k + 1] > -9000 && EA[k + 1] > m) m = EA[k + 1];
    ET[k] = m;
  }
  for (let k = 0; k < n; k++) {
    if (EA[k] < -9000) continue;
    let m = ET[k];
    if (k > 0 && ET[k - 1] > -9000 && ET[k - 1] < m) m = ET[k - 1];
    if (k < n - 1 && ET[k + 1] > -9000 && ET[k + 1] < m) m = ET[k + 1];
    if (m > EA[k]) EA[k] = m;
  }
  // the eye's bottom interior row spans at least half its width: a short bottom row holds
  // only iris and hangs under the eye like a drop
  for (let pass = 0; pass < 2; pass++) {
    let mb = -9999, cnt = 0;
    for (let k = 0; k < n; k++) if (EB[k] > -9000 && Math.abs(EO[k]) <= 1 && EB[k] - EA[k] > 2) mb = Math.max(mb, EB[k]);
    if (mb < -9000) break;
    for (let k = 0; k < n; k++) if (EB[k] === mb && Math.abs(EO[k]) <= 1) cnt++;
    if (cnt * 2 >= W) break;
    for (let k = 0; k < n; k++) if (EB[k] === mb) EB[k] = mb - 1;
  }
  // and the top interior row: a lash peak over fewer than half the columns comes down a row
  for (let pass = 0; pass < 2; pass++) {
    let ma = 9999, cnt = 0;
    for (let k = 0; k < n; k++) if (EA[k] > -9000 && Math.abs(EO[k]) <= 1 && EB[k] - EA[k] > 2) ma = Math.min(ma, EA[k]);
    if (ma > 9000) break;
    for (let k = 0; k < n; k++) if (EA[k] === ma && Math.abs(EO[k]) <= 1) cnt++;
    if (cnt * 2 >= W) break;
    for (let k = 0; k < n; k++) if (EA[k] === ma) EA[k] = ma + 1;
  }
  // pupil: 1 px in a small eye (a 1x2 bar reads as a slit), 2x2 only in a large one
  const pn = W >= 11 ? 2 : 1;
  const ppx = Math.round(icx - pn / 2);
  let ppy = Math.round(icy - pn / 2);
  // a two-row eye (s ~2.2-3): the pupil on the lower row, the upper row iris colour with the
  // catchlight. A pupil right under the lash, over one row of colour, read as a lid half down
  // (critic r2: every presenter looked drowsy at s 2.45-2.7 and alert at 3.2)
  const kc = clamp(Math.round(icx) - x0 + 1, 0, n - 1);
  const twoRow = EA[kc] > -9000 && EB[kc] - EA[kc] - 1 <= 2;
  if (twoRow && pn === 1) ppy = EB[kc] - 1;
  const rim = ir >= 2 && !twoRow; // a darker iris rim only where the iris is ≥ 4 px across and 3 rows tall
  for (let k = 0; k < n; k++) {
    const x = x0 - 1 + k;
    const o = EO[k], ao = Math.abs(o);
    if (EA[k] < -9000) continue;
    const yA = EA[k], yB = EB[k];
    // crease above the lid (skin fold), stays while blinking; not over a two-row eye, where
    // it thickens the upper lid into a heavy, half-closed band
    if (ao < 0.72 && W >= 6 && !twoRow) deepen(buf, x, EC[k] - (heavy ? 2 : 1) - 1, sk);
    if (blink > 0.82 || yB - yA < 1) {
      // closed: the lash line where the lids meet
      if (ao <= 1) buf.plot(x, EM[k], mt.lash, 1);
      continue;
    }
    if (ao > 1) {
      // past the corners: the outer lash flick (lashes) or a soft corner shadow
      if (o > 1 && E.lashes) buf.plot(x, yA, mt.lash, 1);
      continue;
    }
    for (let y = yA + 1; y < yB; y++) {
      const dx = x + 0.5 - icx, dy = y + 0.5 - icy;
      let m;
      if (dx * dx + dy * dy <= ir * ir) {
        if (x >= ppx && x < ppx + pn && y >= ppy && y < ppy + pn) m = mt.pupil;
        // the iris's rim is a touch darker, only on an iris 4 px wide or more and only at its
        // edges (critic r2: a dark first row across a 3 px iris left one row of colour under a
        // black lash: every presenter read drowsy at s 2.2-3)
        else if (rim && (y === yA + 1 ? Math.abs(dx) > ir - 0.75 : heavy && dy < 0 && Math.abs(dx) > ir - 0.6)) m = mt.irisDark;
        else m = mt.iris;
      } else {
        // sclera: lit toward the key (left of the iris), cooler on the far side, under the lid and in the corners
        m = y === yA + 1 || ao > 0.82 || dx > 0 ? mt.fog : mt.silver;
      }
      buf.plot(x, y, m, 1);
    }
    // lash line: the lash colour over the outer three quarters; at the inner corner the
    // lid's fold in the skin's own deep tone, so the eye opens toward the nose
    if (o < -0.62) deepen(buf, x, yA, sk, 3);
    else buf.plot(x, yA, mt.lash, 1);
    // large eyes: a second lash row only at the outer corner (a full one reads as heavy liner)
    if (heavy && o > 0.55 && yA + 1 < yB - 1) buf.plot(x, yA + 1, mt.lash, 1);
    // lower lid: a soft shade line under the outer two-thirds
    if (o > -0.45 && o < 0.95) deepen(buf, x, yB, sk);
    // a smile: the cheek's fold under the lower lid (close-ups, s >= 3)
    if (cheek > 0.5 && W >= 8 && o > -0.15 && o < 0.75) deepen(buf, x, yB + 1, sk);
  }
  // catchlight: one white pixel up and left on the iris (key light from camera-left), on an
  // interior row of its column only: materials are keyed by colour, so a black lash IS the
  // pupil material and a material test alone put the light on the lid line (critic r2)
  if (blink < 0.5) {
    const gx = Math.round(icx - ir * 0.42 - 0.5);
    const k = gx - (x0 - 1);
    if (k >= 0 && k < n && EA[k] > -9000) {
      const gy = Math.max(Math.round(icy - ir * 0.42 - 0.5), EA[k] + 1);
      const i = gy * buf.w + gx;
      if (gy < EB[k] && gx > 0 && gy > 0 && gx < buf.w - 1 && gy < buf.h - 1 && (buf.mat[i] === mt.iris || buf.mat[i] === mt.irisDark || buf.mat[i] === mt.pupil)) buf.plot(gx, gy, mt.white, 1);
    }
  }
  if (E.bags) {
    // under-eye: a short soft fold below the outer half
    const yb = Math.round(cy + restBot) + 2;
    for (let x = Math.round(mid + side * half * 0.05); side > 0 ? x <= Math.round(mid + half * 0.8) : x >= Math.round(mid - half * 0.8); x += side) deepen(buf, x, yb, sk);
  }
}
// per-column scratch for the close-up eye (lid rows, crease, closed line, corner coordinate)
const EA = new Int32Array(64), EB = new Int32Array(64), ET = new Int32Array(64), EC = new Int32Array(64), EM = new Int32Array(64), EO = new Float64Array(64);

// ---------------------------------------------------------------------------
// Brows: tapered strokes on the brow ridge (head at the inner end, soft tail)

/** Brow centre line at u (0 inner head .. 1 outer tail), units. */
function browY(B, raise, frown, u) {
  return B.y - raise * (0.7 + 0.3 * u) - B.arch * Math.sin(Math.min(1, u * 1.35) * Math.PI) * (1 + Math.max(0, raise) * 0.4) + frown * 0.6 * (1 - u) * (1 - u) + Math.max(0, u - 0.7) * 1.2;
}

const BU = [0, 0.3, 0.62, 0.86, 1];
const EYT = new Int32Array(2); // medium tier: each eye's top row (drawEye), so the brows stay clear of it
const BX = new Float64Array(5), BYS = new Float64Array(5);

function drawBrows(buf, L, mt, sk, f, s, tier) {
  const B = L.brows, E = L.eyes;
  const thick = Math.max(1, B.thick * s);
  for (let side = -1; side <= 1; side += 2) {
    const raise = (side < 0 ? f.browL : f.browR) || 0;
    const frown = f.browIn || 0; // + inner ends down (serious), - inner ends up (worried)
    const xi = side * (E.x - B.len * 0.48);
    const xo = side * (E.x + B.len * 0.52);
    if (tier === 0) {
      // wide: one straight 1 px stroke (an arch at this size only makes stairs)
      mapF(xi + (xo - xi) * 0.05, browY(B, raise, frown, 0.3));
      const ax = Math.round(F.x), ay = F.y;
      mapF(xi + (xo - xi) * 0.85, browY(B, raise, frown, 0.6));
      const bx = Math.round(F.x), y = Math.round((ay + F.y) / 2);
      for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) buf.plot(x, y, mt.brow, 1);
      continue;
    }
    // a connected polyline through the head, arch and tail; thickness tapers along it
    for (let k = 0; k < 5; k++) {
      mapF(xi + (xo - xi) * BU[k], browY(B, raise, frown, BU[k]));
      BX[k] = F.x;
      BYS[k] = F.y;
    }
    if (tier === 1) {
      // medium: a skin row between the brow and the lid line (a brow on the lid reads as a heavy
      // frown, critic r2): the whole stroke moves up as one, keeping its arch
      let bottom = -9999;
      for (let k = 0; k < 5; k++) bottom = Math.max(bottom, Math.round(BYS[k]));
      const up = bottom - (EYT[side < 0 ? 0 : 1] - 2);
      if (up > 0) for (let k = 0; k < 5; k++) BYS[k] -= up;
    }
    for (let k = 0; k < 4; k++) {
      let x0 = Math.round(BX[k]), y0 = Math.round(BYS[k]);
      const x1 = Math.round(BX[k + 1]), y1 = Math.round(BYS[k + 1]);
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (let n = 0; n < 64; n++) {
        const u = BU[k] + (BU[k + 1] - BU[k]) * (dx ? Math.abs(x0 - Math.round(BX[k])) / dx : 0);
        const th = tier === 1 ? (u < 0.7 ? Math.min(2, Math.round(thick)) : 1) : Math.max(1, Math.round(thick * (u < 0.35 ? 1 : u < 0.75 ? 0.85 : 0.5)));
        const top = y0 - (th >> 1);
        for (let j = 0; j < th; j++) buf.plot(x0, top + j, mt.brow, 1);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) {
          err += dy;
          x0 += sx;
        }
        if (e2 <= dx) {
          err += dx;
          y0 += sy;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Nose: the planes come from head.js; here only what light cannot do

function drawNose(buf, L, sk, s, tier) {
  const N = L.nose;
  if (tier === 0) {
    mapF(N.w * 0.4, N.y1, 1.2);
    buf.plot(Math.round(F.x), Math.round(F.y), sk, 2);
    return;
  }
  // nostrils: the far one always, the near (lit) one only in close-ups and one tone lighter
  mapF(N.w * 0.36, N.y1 + 0.1, 0.7);
  buf.plot(Math.round(F.x), Math.round(F.y), sk, tier === 2 ? 3 : 2);
  if (tier === 2) {
    mapF(-N.w * 0.36, N.y1 + 0.1, 0.7);
    buf.plot(Math.round(F.x), Math.round(F.y), sk, 2);
    ridgeLight(buf, L, sk, s);
    bridgeShade(buf, L, sk, s);
  } else {
    // medium: the tip's shadow on the far side
    mapF(N.w * 0.1, N.y1 + 0.35, 0.9);
    buf.plot(Math.round(F.x), Math.round(F.y), sk, 2);
  }
}

/**
 * Close-ups: the key light on the nose ridge, a 1 px stroke on the key side of the
 * ridge from mid-bridge to just above the tip. A fixed-shape decal (its length
 * depends on the scale only) placed with faceX like the nostrils, so it slides
 * with the head and never blinks on and off as the head moves with speech.
 */
function ridgeLight(buf, L, sk, s) {
  const N = L.nose, E = L.eyes;
  const skin = L._mats.skin;
  const y0 = (E.y + N.y1) * 0.5 - 0.1, y1 = N.y1 - 0.55;
  const n = Math.max(2, Math.round((y1 - y0) * s));
  mapF(-N.w * 0.17, y0, 0.8);
  const x = Math.round(F.x), ya = Math.round(F.y);
  for (let k = 0; k < n; k++) litPlot(buf, x, ya + k, sk, skin, 2);
}

/**
 * Close-ups: the shadow side of the nose bridge, a 1 px line one tone darker down the far
 * flank, from below the eyes to the wing. With the ridge light it gives the nose a fixed
 * bridge (lit flank, ridge, shaded flank) that never depends on the light term. As the head
 * turns toward the key the far flank faces the light, so the line shortens from the top
 * (whole pixels, monotone with the turn) and is gone at a strong turn.
 */
function bridgeShade(buf, L, sk, s) {
  const N = L.nose, E = L.eyes;
  const skin = L._mats.skin;
  const y0 = (E.y + N.y1) * 0.5 + 0.2, y1 = N.y1 - 0.45;
  const full = Math.max(2, Math.round((y1 - y0) * s));
  const k = clamp((F.yaw + 0.35) / 0.25, 0, 1);
  const n = Math.round(full * k);
  if (n < 1) return;
  mapF(N.w * 0.46, y1, 0.8);
  const x = Math.round(F.x), yb = Math.round(F.y);
  for (let j = 0; j < n; j++) {
    const y = yb - j;
    if (x < 1 || y < 1 || x >= buf.w - 1 || y >= buf.h - 1) continue;
    if (buf.mat[y * buf.w + x] !== skin) continue;
    deepen(buf, x, y, sk);
  }
}

/**
 * Close-ups: the forehead's sheen, a short lozenge just above the key-side brow,
 * toward the centre (never under the hairline: there it reads as a bald patch).
 * Fixed shape per scale, placed with faceX; only on lit bare skin (hair drawn later covers it).
 */
function browSheen(buf, L, sk, f, s) {
  const B = L.brows, E = L.eyes;
  const skin = L._mats.skin;
  const wa = Math.max(3, Math.round(E.x * 0.6 * s));
  // it rides on the key-side brow (a lifted brow lifts the skin above it), so the brow
  // never eats into it and its shape stays the same while the presenter talks
  mapF(-E.x * 0.42, browY(B, f.browL || 0, f.browIn || 0, 0.3) - 1.2);
  const cx = Math.round(F.x - wa / 2), cy = Math.round(F.y);
  // two rows: the upper one shorter and set toward the centre (the brow ridge's curve)
  for (let i = 0; i < wa; i++) litPlot(buf, cx + i, cy, sk, skin, 1);
  for (let i = 2; i < wa - 1; i++) litPlot(buf, cx + i, cy - 1, sk, skin, 1);
}

/** A highlight pixel, only over bare skin no darker than `maxTone` (never over a feature or a shadow). */
function litPlot(buf, x, y, sk, skin, maxTone) {
  if (x < 1 || y < 1 || x >= buf.w - 1 || y >= buf.h - 1) return;
  const i = y * buf.w + x;
  if (buf.mat[i] !== skin || buf.tone[i] > maxTone) return;
  buf.plot(x, y, sk, 0);
}

// ---------------------------------------------------------------------------
// Mouth

const MX = { y: 0 };
// mouth scratch: MS[0] = the feature x (units) for mxS(), the half width for rowS()
const MS = new Float64Array(1);
let mouthY = 0; // the mouth's feature-space row (L.mouth.y), set by drawMouth
/** Screen column of the mouth at feature x MS[0] (units): each corner rides the head's curve on its own. */
function mxS() {
  mapF(MS[0], mouthY, 0.6);
  MX.y = F.y;
  return Math.round(F.x);
}

/** Paint a row of the mouth between -MS[0] and MS[0] (units; exclusive right end) on screen row py. */
function rowS(buf, py, m) {
  const hw = MS[0];
  MS[0] = -hw;
  const a = mxS();
  MS[0] = hw;
  const b = mxS();
  for (let x = a; x < b; x++) buf.plot(x, py, m, 1);
  return b - a;
}

function drawMouth(buf, L, mt, sk, head, f, s, tier) {
  const M = L.mouth;
  mouthY = M.y;
  const open = clamp(f.open || 0, 0, 1);
  const round = clamp(f.round || 0, 0, 1);
  const mw = clamp(f.mwide ?? 0, -1, 1);
  const smile = clamp(f.smile || 0, -1, 1);
  const press = (f.press || 0) > 0.5;
  const tuck = (f.tuck || 0) > 0.5;
  const hw = (M.w / 2) * (1 + mw * 0.16) * (1 - round * 0.3); // half width, units
  MS[0] = 0;
  mxS();
  const y0 = Math.round(MX.y);
  const lift = smile > 0.3 ? 1 : smile < -0.25 ? -1 : 0;
  const xl = ((MS[0] = -hw), mxS()), xr = ((MS[0] = hw), mxS()); // corners, xr exclusive

  if (tier === 0) {
    // wide: a short deep line; a maroon middle while the jaw is open. A smile never
    // bends the line into a U (at 1 px per unit that reads as an emoticon): its
    // corners soften to the shade tone instead.
    const isOpen = open > 0.35 && !press;
    const a = round > 0.5 ? xl + 1 : xl, b = round > 0.5 ? xr - 1 : xr;
    for (let x = a; x < Math.max(a + 1, b); x++) {
      const edge = x === a || x === b - 1;
      buf.plot(x, y0, isOpen && !edge ? mt.inner : sk, edge && lift > 0 ? 2 : 3);
    }
    return;
  }

  const maxRows = tier === 1 ? 1 : s >= 3.2 ? 3 : 2;
  const rows = press ? 0 : Math.min(maxRows, Math.round(open * (maxRows + 0.35)));

  if (tier === 1) {
    // medium: a lip line with soft ends; one row of interior and the lit lower lip when open
    for (let x = xl; x < xr; x++) {
      const edge = x === xl || x === xr - 1;
      if (edge) buf.plot(x, y0 - (lift > 0 ? 1 : 0) + (lift < 0 ? 1 : 0), sk, 3);
      else buf.plot(x, y0, mt.lip, 1);
    }
    if (rows > 0) {
      MS[0] = hw * 0.7;
      rowS(buf, y0 + 1, mt.inner);
      MS[0] = hw * 0.5;
      rowS(buf, y0 + 2, mt.lipHi);
    }
    return;
  }

  // ---- close-up
  // upper lip: a darker plane (it faces down, away from the key)
  MS[0] = hw * (round > 0.5 ? 0.8 : 0.66);
  rowS(buf, y0 - 1, mt.upper);
  const loW = hw * (round > 0.5 ? 0.72 : 0.56);
  if (rows === 0) {
    // closed (or pressed for m/b/p): the lip line, corners shaped by the smile
    const a = press ? xl + 1 : xl, b = press ? xr - 1 : xr;
    for (let x = a; x < b; x++) {
      const edge = x === a || x === b - 1;
      if (!edge) buf.plot(x, y0, mt.lip, 1);
      else if (lift > 0) buf.plot(x, y0 - 1, mt.lip, 1);
      else if (lift < 0) buf.plot(x, y0 + 1, mt.lip, 1);
      else buf.plot(x, y0, sk, 3);
    }
    // lower lip: lit from above; pressed lips roll in and darken
    MS[0] = loW * (press ? 0.8 : 1);
    rowS(buf, y0 + 1, press ? mt.upper : mt.lipHi);
    const a2 = ((MS[0] = -loW * 0.7), mxS()), b2 = ((MS[0] = loW * 0.7), mxS());
    if (b2 - a2 >= 2) for (let x = a2; x < b2; x++) deepen(buf, x, y0 + 2, sk); // never a lone dot under the lip
    smileLines(buf, L, sk, smile, s);
    return;
  }
  // open: the top lip line, rows of warm interior pinched at the corners, the lower lip
  for (let x = xl; x < xr; x++) {
    const edge = x === xl || x === xr - 1;
    if (edge && lift > 0) buf.plot(x, y0 - 1, mt.lip, 1);
    else if (edge) buf.plot(x, y0, sk, 3);
    else buf.plot(x, y0, mt.lip, 1);
  }
  const teeth = (f.teeth || 0) > 0.45 && !tuck;
  const tongue = (f.tongue || 0) > 0.5 && rows >= 2;
  for (let r = 1; r <= rows; r++) {
    // the interior narrows toward the corners and at its top and bottom rows
    const edgeRow = rows >= 2 && (r === rows || (rows === 3 && r === 1));
    const iw = hw * (0.78 - (edgeRow ? 0.16 : 0) - round * 0.12);
    const a = ((MS[0] = -iw), mxS()), b = ((MS[0] = iw), mxS());
    for (let x = a; x < b; x++) buf.plot(x, y0 + r, mt.inner, 1);
    buf.plot(a - 1, y0 + r, mt.lip, 1);
    buf.plot(b, y0 + r, mt.lip, 1);
    if (r === 1 && (tuck || teeth)) {
      // f/v: the upper teeth rest on the lower lip; otherwise a short band of upper teeth
      const k = tuck ? 0.7 : rows >= 2 ? 0.48 : f.teeth > 0.8 ? 0.3 : 0;
      if (k > 0) {
        MS[0] = iw * k;
        rowS(buf, y0 + 1, mt.teeth);
      }
    }
    if (tongue && r === rows) {
      MS[0] = iw * 0.45;
      rowS(buf, y0 + r, mt.tongue);
    }
  }
  const yl = y0 + rows + 1;
  MS[0] = loW * (tuck ? 0.8 : 1);
  rowS(buf, yl, tuck ? mt.upper : mt.lipHi);
  const a3 = ((MS[0] = -loW * 0.7), mxS()), b3 = ((MS[0] = loW * 0.7), mxS());
  if (b3 - a3 >= 2) for (let x = a3; x < b3; x++) deepen(buf, x, yl + 1, sk);
  smileLines(buf, L, sk, smile, s);
}

/**
 * Close-ups (s ≥ 3) in a real smile: the folds from the nose wings toward the
 * mouth corners, on BOTH sides (one tone darker than the skin under them, so the
 * shade side gets a deep fold and the lit side a soft one). Each fold is a short
 * curve (out, then down) that stops before the corner: a straight full-length
 * line on one cheek reads as a scar.
 */
function smileLines(buf, L, sk, smile, s) {
  if (smile < 0.45 || s < 3) return;
  const N = L.nose, M = L.mouth;
  const skin = L._mats.skin;
  for (let side = -1; side <= 1; side += 2) {
    // quadratic curve: the nose wing → bowing outward → beside the mouth corner
    const ax = side * (N.w * 0.62 + 0.4), ay = N.y1 + 0.55;
    const bx = side * (M.w * 0.5 + 0.75), by = N.y1 + 0.85;
    const cx = side * (M.w * 0.5 + 0.55), cy = M.y - 0.55;
    let px = -9999, py = -9999;
    for (let k = 1; k <= 6; k++) {
      const u = 0.45 + (k / 6) * 0.4; // the lower part of the fold only, by the mouth corner
      const v = 1 - u;
      mapF(v * v * ax + 2 * v * u * bx + u * u * cx, v * v * ay + 2 * v * u * by + u * u * cy, 0.4);
      const x = Math.round(F.x), y = Math.round(F.y);
      if (x === px && y === py) continue;
      px = x;
      py = y;
      const i = y * buf.w + x;
      if (buf.mat[i] !== skin) continue; // only on bare skin (never over the mustache or the lips)
      deepen(buf, x, y, sk);
    }
  }
}
