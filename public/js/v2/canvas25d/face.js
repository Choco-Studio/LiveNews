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
import { faceX } from './head.js';
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
  const fx = faceX(F.H, x, yy, F.yaw, protrude);
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
  const open = eyeOpen(f);
  for (let side = -1; side <= 1; side += 2) {
    mapF(side * E.x, E.y);
    const turn = Math.sin(F.yaw) * side;
    const squash = clamp(1 - Math.max(0, -turn) * 0.55, 0.55, 1);
    drawEye(buf, L, mt, sk, F.x, F.y, E.w * s * squash, E.h * s, f, side, tier, open);
  }
  drawBrows(buf, L, mt, sk, f, s, tier);
  drawNose(buf, L, sk, s, tier);
  drawMouth(buf, L, mt, sk, head, f, s, tier);
}

function eyeOpen(f) {
  const blink = clamp(f.blink || 0, 0, 1);
  const base = 1 - (f.lid || 0) * 0.42 - (f.squint || 0) * 0.3 + (f.wide || 0) * 0.16;
  return clamp(base * (1 - blink), 0, 1.12);
}

// ---------------------------------------------------------------------------
// Eyes

function drawEye(buf, L, mt, sk, cx, cy, w, h, f, side, tier, open) {
  const E = L.eyes;
  const lx = clamp(f.lookX || 0, -1, 1), ly = clamp(f.lookY || 0, -1, 1);

  if (tier === 0) {
    // wide: a 2 px dash. At rest both pixels are the lash colour (an eye at the
    // lens, never cross-eyed); a clear sideways gaze shows a lit pixel and the
    // pupil on the gaze side; closed lids are skin shade.
    const x = Math.round(cx - 1), y = Math.round(cy - 0.5);
    if (open < 0.4) {
      buf.plot(x, y, sk, 2);
      buf.plot(x + 1, y, sk, 2);
      return;
    }
    if (lx > 0.45) {
      buf.plot(x, y, mt.fog, 1);
      buf.plot(x + 1, y, mt.pupil, 1);
    } else if (lx < -0.45) {
      buf.plot(x, y, mt.pupil, 1);
      buf.plot(x + 1, y, mt.fog, 1);
    } else {
      buf.plot(x, y, mt.lash, 1);
      buf.plot(x + 1, y, mt.lash, 1);
    }
    return;
  }

  const W = Math.max(3, Math.round(w));
  const Hh = Math.max(2, Math.round(h));
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
    const ix = clamp(Math.floor(x0 + (W - 2) / 2 + lx * W * 0.3 + 0.5), x0, x0 + W - 2);
    for (let r = 1 + covered; r <= rows; r++) {
      for (let i = 0; i < W; i++) {
        const x = x0 + i;
        let m = x < ix ? mt.silver : mt.fog;
        if (x === ix) m = mt.irisDark;
        else if (x === ix + 1) m = mt.pupil;
        // the top row of a 2-row eye is in the lid's shadow
        if (rows >= 2 && r === 1 + covered && m === mt.silver) m = mt.fog;
        buf.plot(x, yTop + r, m, 1);
      }
    }
    const inner = side < 0 ? W - 1 : 0; // the lid line stops short of the inner corner
    for (let i = 0; i < W; i++) if (i !== inner || W < 5) buf.plot(x0 + i, lidY, mt.lash, 1);
    if (E.lashes) buf.plot(side < 0 ? x0 - 1 : x0 + W, lidY + 1, mt.lash, 1);
    return;
  }

  // ---- close-up: an almond, lids, crease, iris
  const half = W / 2;
  const mid = x0 + half;
  const heavy = W >= 10; // s >= ~3.6
  const restTop = -Hh * 0.5, restBot = Hh * 0.5;
  const icx = mid + lx * W * 0.19;
  const ir = Math.min(Hh * 0.56, W * 0.29); // iris radius in px
  // the iris sits a little low: the upper lid rests over its top (relaxed, never a stare)
  const icy = cy + Hh * 0.08 + ly * Hh * 0.16;
  const blink = 1 - clamp(open, 0, 1);
  const squint = clamp(f.squint || 0, 0, 1);
  for (let x = x0 - 1; x <= x0 + W; x++) {
    const u = (x + 0.5 - mid) / half; // -1 left .. 1 right
    const o = u * side; // -1 inner corner .. 1 outer corner
    if (o < -1.05 || o > 1.08) continue;
    const ao = Math.abs(o);
    // almond: the upper lid peaks toward the nose, the lower lid dips toward the outer corner
    const up = restTop * Math.pow(Math.max(0, 1 - Math.pow((o + 0.18) / 1.18, 2)), 0.6) - Hh * 0.06 * o;
    const lo = restBot * Math.pow(Math.max(0, 1 - Math.pow((o - 0.12) / 1.12, 2)), 0.75) - Hh * 0.04 * o - squint * Hh * 0.22;
    const top = up + (lo - 0.6 - up) * blink; // the upper lid comes down to close
    const yA = Math.round(cy + top), yB = Math.round(cy + lo);
    // crease above the lid (skin fold), stays while blinking
    if (ao < 0.72 && W >= 6) deepen(buf, x, Math.round(cy + up) - (heavy ? 2 : 1) - 1, sk);
    if (blink > 0.82 || yB - yA < 1) {
      // closed: the lash line where the lids meet
      if (ao <= 1) buf.plot(x, Math.round(cy + (up + (lo - up) * 0.62)), mt.lash, 1);
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
        const pr = heavy ? 1.15 : 0.62;
        if (Math.abs(dx) <= pr && Math.abs(dy) <= pr + 0.3) m = mt.pupil;
        else if (y === yA + 1 || dy < -ir * 0.45 || (heavy && Math.abs(dx) > ir - 0.9)) m = mt.irisDark;
        else m = mt.iris;
      } else {
        // sclera: lit toward the key (left of the iris), cooler on the far side, under the lid and in the corners
        m = y === yA + 1 || ao > 0.82 || dx > 0 ? mt.fog : mt.silver;
      }
      buf.plot(x, y, m, 1);
    }
    // lash line: 1 px, 2 px over the outer half of a large eye
    buf.plot(x, yA, mt.lash, 1);
    if (heavy && o > 0.15 && yA + 1 < yB - 1) buf.plot(x, yA + 1, mt.lash, 1);
    // lower lid: a soft shade line under the outer two-thirds
    if (o > -0.45 && o < 0.95) deepen(buf, x, yB, sk);
  }
  // catchlight: one white pixel up and left on the iris (key light from camera-left)
  if (blink < 0.5) {
    const gx = Math.round(icx - ir * 0.42 - 0.5), gy = Math.round(icy - ir * 0.42 - 0.5);
    const i = gy * buf.w + gx;
    if (gx > 0 && gy > 0 && gx < buf.w - 1 && gy < buf.h - 1 && (buf.mat[i] === mt.iris || buf.mat[i] === mt.irisDark || buf.mat[i] === mt.pupil)) buf.plot(gx, gy, mt.white, 1);
  }
  if (E.bags) {
    // under-eye: a short soft fold below the outer half
    const yb = Math.round(cy + restBot) + 2;
    for (let x = Math.round(mid + side * half * 0.05); side > 0 ? x <= Math.round(mid + half * 0.8) : x >= Math.round(mid - half * 0.8); x += side) deepen(buf, x, yb, sk);
  }
}

// ---------------------------------------------------------------------------
// Brows: tapered strokes on the brow ridge (head at the inner end, soft tail)

/** Brow centre line at u (0 inner head .. 1 outer tail), units. */
function browY(B, raise, frown, u) {
  return B.y - raise * (0.7 + 0.3 * u) - B.arch * Math.sin(Math.min(1, u * 1.35) * Math.PI) * (1 + Math.max(0, raise) * 0.4) + frown * 0.6 * (1 - u) * (1 - u) + Math.max(0, u - 0.7) * 1.2;
}

function drawBrows(buf, L, mt, sk, f, s, tier) {
  const B = L.brows, E = L.eyes;
  const thick = Math.max(1, B.thick * s);
  for (let side = -1; side <= 1; side += 2) {
    const raise = (side < 0 ? f.browL : f.browR) || 0;
    const frown = f.browIn || 0; // + inner ends down (serious), - inner ends up (worried)
    const xi = side * (E.x - B.len * 0.48);
    const xo = side * (E.x + B.len * 0.52);
    mapF(xi, browY(B, raise, frown, 0));
    const ax = F.x;
    mapF(xo, browY(B, raise, frown, 1));
    const bx = F.x;
    const n = Math.max(2, Math.round(Math.abs(bx - ax)));
    let prevY = null;
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      mapF(xi + (xo - xi) * u, browY(B, raise, frown, u));
      const px = Math.round(F.x), cyb = F.y;
      if (tier === 0) {
        if (u > 0.92) continue;
        buf.plot(px, Math.round(cyb), mt.brow, 1);
        continue;
      }
      // thickness: full at the head, thinning along the arch, a 1 px tail
      const th = Math.max(1, Math.round(thick * (u < 0.35 ? 1 : u < 0.75 ? 0.85 : 0.55)));
      const y0 = Math.round(cyb - th / 2);
      const tail = u > 0.9 && tier === 2;
      for (let j = 0; j < th; j++) {
        if (tail) deepen(buf, px, y0 + j, sk); // soft end: the brow fades into the skin
        else buf.plot(px, y0 + j, mt.brow, 1);
      }
      // keep the stroke connected when it steps by more than a pixel
      if (prevY !== null && Math.abs(y0 - prevY) > 1 && !tail) buf.plot(px, (y0 + prevY) >> 1, mt.brow, 1);
      prevY = y0;
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
  // nostrils: the far one always, the near one only in close-ups
  mapF(N.w * 0.36, N.y1 + 0.1, 0.7);
  buf.plot(Math.round(F.x), Math.round(F.y), sk, 3);
  if (tier === 2) {
    mapF(-N.w * 0.36, N.y1 + 0.1, 0.7);
    buf.plot(Math.round(F.x), Math.round(F.y), sk, s >= 3.2 ? 3 : 2);
    // a lit point on the tip
    mapF(-N.w * 0.12, N.y1 - 0.65, 1.3);
    buf.plot(Math.round(F.x), Math.round(F.y), sk, 0);
  } else {
    // medium: the tip's shadow on the far side
    mapF(N.w * 0.1, N.y1 + 0.35, 0.9);
    buf.plot(Math.round(F.x), Math.round(F.y), sk, 2);
  }
}

// ---------------------------------------------------------------------------
// Mouth

function drawMouth(buf, L, mt, sk, head, f, s, tier) {
  const M = L.mouth;
  const open = clamp(f.open || 0, 0, 1);
  const round = clamp(f.round || 0, 0, 1);
  const mw = clamp(f.mwide ?? 0, -1, 1);
  const smile = clamp(f.smile || 0, -1, 1);
  const press = (f.press || 0) > 0.5;
  mapF(0, M.y, 0.6);
  const x0 = Math.round(F.x), y0 = Math.round(F.y);
  const wpx = M.w * s * (1 + mw * 0.16) * (1 - round * 0.3);
  const half = Math.max(1, Math.round(wpx / 2));
  const lift = smile > 0.3 ? 1 : smile < -0.25 ? -1 : 0;

  if (tier === 0) {
    // wide: a short deep line; a maroon middle while the jaw is open
    const hw = Math.max(1, half - (round > 0.5 ? 1 : 0));
    const isOpen = open > 0.35 && !press;
    for (let i = -hw; i < hw; i++) {
      const edge = i === -hw || i === hw - 1;
      buf.plot(x0 + i, y0 - (edge && lift > 0 && hw > 1 ? 1 : 0), isOpen && !edge ? mt.inner : sk, 3);
    }
    return;
  }

  const maxRows = tier === 1 ? 1 : s >= 3.2 ? 3 : 2;
  const rows = press ? 0 : Math.min(maxRows, Math.round(open * (maxRows + 0.35)));
  const corner = (x, y) => buf.plot(x, y, mt.lip, 1);

  if (tier === 1) {
    // medium: a lip line with soft ends; one row of interior when open
    for (let i = -half; i < half; i++) {
      const edge = i === -half || i === half - 1;
      if (edge) buf.plot(x0 + i, y0 - (lift > 0 ? 1 : 0) + (lift < 0 ? 1 : 0), sk, 3);
      else buf.plot(x0 + i, y0, mt.lip, 1);
    }
    if (rows > 0) {
      for (let i = -half + 1; i < half - 1; i++) buf.plot(x0 + i, y0 + 1, mt.inner, 1);
      for (let i = -half + 2; i < half - 2; i++) buf.plot(x0 + i, y0 + 2, mt.lipHi, 1);
    }
    return;
  }

  // ---- close-up
  const upW = Math.max(1, Math.round(half * (round > 0.5 ? 0.8 : 0.66)));
  const loW = Math.max(1, Math.round(half * (round > 0.5 ? 0.72 : 0.58)));
  // upper lip: a darker plane (it faces down, away from the key)
  for (let i = -upW; i < upW; i++) buf.plot(x0 + i, y0 - 1, mt.upper, 1);
  if (rows === 0) {
    // closed (or pressed for m/b/p): the lip line, corners shaped by the smile
    const hw = press ? half - 1 : half;
    for (let i = -hw; i < hw; i++) {
      const edge = i === -hw || i === hw - 1;
      if (edge) {
        if (lift > 0) corner(x0 + i, y0 - 1);
        else if (lift < 0) corner(x0 + i, y0 + 1);
        else buf.plot(x0 + i, y0, sk, 3);
      } else buf.plot(x0 + i, y0, mt.lip, 1);
    }
    // lower lip: lit from above; pressed lips roll in and darken
    const lw = press ? Math.max(1, loW - 1) : loW;
    for (let i = -lw; i < lw; i++) buf.plot(x0 + i, y0 + 1, press ? mt.upper : mt.lipHi, 1);
    for (let i = -lw + 1; i < lw - 1; i++) deepen(buf, x0 + i, y0 + 2, sk);
    smileLines(buf, L, sk, smile, s);
    return;
  }
  // open: a lip line on top, rows of warm interior, then the lower lip
  const teeth = (f.teeth || 0) > 0.45 && !(f.tuck > 0.5);
  const tongue = (f.tongue || 0) > 0.5 && rows >= 2;
  for (let i = -half; i < half; i++) {
    const edge = i === -half || i === half - 1;
    buf.plot(x0 + i, y0, edge ? (lift > 0 ? sk : mt.lip) : mt.lip, edge && lift > 0 ? 3 : 1);
  }
  if (lift > 0) {
    corner(x0 - half, y0 - 1);
    corner(x0 + half - 1, y0 - 1);
  }
  for (let r = 1; r <= rows; r++) {
    // rounded: the first and last rows are narrower; pursed lips narrower still
    const shrink = rows >= 3 && (r === 1 || r === rows) ? 1 : 0;
    const hw = Math.max(1, half - 1 - shrink - (round > 0.5 ? 1 : 0));
    for (let i = -hw; i < hw; i++) {
      let m = mt.inner;
      if (f.tuck > 0.5 && r === 1) m = mt.teeth; // f/v: upper teeth on the lower lip
      else if (teeth && r === 1 && (rows >= 2 || Math.abs(i + 0.5) < hw * 0.45) && Math.abs(i + 0.5) < hw * 0.72) m = mt.teeth;
      else if (tongue && r === rows && Math.abs(i + 0.5) < hw * 0.5) m = mt.tongue;
      buf.plot(x0 + i, y0 + r, m, 1);
    }
    buf.plot(x0 - hw - 1, y0 + r, mt.lip, 1);
    buf.plot(x0 + hw, y0 + r, mt.lip, 1);
  }
  const yl = y0 + rows + 1;
  const lw = f.tuck > 0.5 ? Math.max(1, loW - 1) : loW;
  for (let i = -lw; i < lw; i++) buf.plot(x0 + i, yl, f.tuck > 0.5 ? mt.upper : mt.lipHi, 1);
  for (let i = -lw + 1; i < lw - 1; i++) deepen(buf, x0 + i, yl + 1, sk);
  smileLines(buf, L, sk, smile, s);
}

/** Close-ups: the folds from the nose wings toward the mouth corners, only in a real smile. */
function smileLines(buf, L, sk, smile, s) {
  if (smile < 0.42) return;
  const N = L.nose, M = L.mouth;
  const n = Math.max(2, Math.round(1.6 * s * Math.min(1, (smile - 0.42) * 4)));
  for (let side = -1; side <= 1; side += 2) {
    mapF(side * (N.w * 0.62 + 0.35), N.y1 + 0.55, 0.4);
    const ax = F.x, ay = F.y;
    mapF(side * (M.w * 0.56 + 0.45), M.y - 0.3, 0.3);
    const bx = F.x, by = F.y;
    for (let k = 0; k < n; k++) {
      const u = k / Math.max(1, n - 1);
      deepen(buf, Math.round(ax + (bx - ax) * u), Math.round(ay + (by - ay) * u), sk);
    }
  }
}
