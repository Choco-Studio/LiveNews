// Wardrobe: torso and clothing for seated presenters (owner: PRESENTERS A
// stream; other streams may register new outfits from their own files with
// registerOutfit() and reuse the helpers read-only).
//
// An outfit drawer gets one context object `o`:
//   { buf, L, m, sk, toS, s, gb, G, clip, head, inv }
// toS(x, y, z) maps body space to screen (lean and oblique tilt included),
// G are the character's group ids (character.js), gb its group base, clip
// whether torso parts stop at the desk. Added in wave 2 (optional for other
// drawers): `head` (the head frame) and `inv` (inv.at(px, py) sets inv.x /
// inv.y to the body-space point under a screen pixel, no allocation).
// Draw order inside the outfit matters for the inner lines (pixbuf.js
// resolve): shirt (z 6) → tie (7) → jacket (8) → collar points (9).
//
// Hand-pixelled tailoring (owner, 17:50: no "triangles, squares and circles"):
//   - an organic shoulder line (smoothed trapezius → shoulder point → deltoid);
//   - jacket planes lit from camera-left: a lit key edge, a shaded side plane
//     whose width follows the body, a deep core only at close-ups;
//   - drag folds from the button towards the armpits (ridge + shadow crescents);
//   - real notch lapels (collar, notch, lapel point, a belly to the edge), the
//     lit lapel rolls into the key, the far one turns away; a soft cast shadow
//     under each lapel edge, pick stitching and a buttonhole at close-ups;
//   - shirt collar points with a band round the neck and shadows under them;
//     a tie with a shaded knot, a dimple and a keel; an open collar variant;
//   - a breast-pocket welt with a two-peak pocket square; buttons;
//   - a continuous 1 px silver rim along the screen-right shoulder (the
//     resolve rim alone leaves a dotted line on sloped edges).
// Level of detail by s: < 1.35 silhouette and two planes, < 2.2 planes +
// lapels + collar, ≥ 2.2 everything, ≥ 3 stitching and the buttonhole.
//
// Look fields read here (all optional; defaults keep older looks working):
//   outfit 'suit' | 'blazer' | 'tailored'      tie? (suit with tie)       pocket?
//   collar 'tie' | 'open' | 'band' | 'none'    neckline 'scoop' | 'v' | 'blouse' (blazer/tailored)
//   lapel { notchY, w, collarW }               buttons 1 | 2              necklace? pin?
import { P } from '../../../palette.js';
import { decal, line } from '../pixbuf.js';
import { clamp, HIP } from '../space.js';
import { rimMat, rimTopRight, paintLine } from './kit-a.js';

export const OUTFITS = {};

/** Add an outfit: fn(o) draws everything between the neck and the head. */
export function registerOutfit(name, fn) {
  OUTFITS[name] = fn;
}

/** Draw the look's outfit (falls back to the suit for unknown names). */
export function drawOutfit(o) {
  (OUTFITS[o.L.outfit] || OUTFITS.suit)(o);
}

// ---------------------------------------------------------------------------
// Body-space helpers (no allocation per pixel)

// forward transform result (module scratch: drawers are synchronous)
let FX = 0, FY = 0;
function fwd(o, x, y) {
  const v = o.inv;
  if (!v) {
    const p = o.toS(x, y);
    FX = p[0];
    FY = p[1];
    return;
  }
  const ly = y - HIP;
  const rx = x * v.cl - ly * v.sl, ry = x * v.sl + ly * v.cl + HIP;
  FX = v.ox + (rx + v.bx) * v.s;
  FY = v.oy + (ry + v.by) * v.s;
}
/** Push the screen position of body point (x, y) onto a flat point array. */
function pt(o, arr, x, y) {
  fwd(o, x, y);
  arr.push(FX, FY);
}
// reusable flat point arrays (cleared per use)
const PTS = [[], [], [], [], [], []];
function pts(i) {
  const a = PTS[i];
  a.length = 0;
  return a;
}

// silhouette rows of the torso (screen px), recomputed per torsoFrame call
const ROW_L = new Float32Array(216), ROW_R = new Float32Array(216);
const COL_TOP = new Float32Array(384);
const XS = new Float64Array(64);

/** Fill ROW_L/ROW_R (left/right silhouette x per row) and COL_TOP (top y per column) from a closed outline. */
function silhouetteRows(outline) {
  const n = outline.length;
  let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
  for (const [x, y] of outline) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }
  const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(215, Math.ceil(maxY));
  for (let y = y0; y <= y1; y++) {
    const cy = y + 0.5;
    let l = Infinity, r = -Infinity;
    for (let i = 0, p = n - 1; i < n; p = i++) {
      const ay = outline[p][1], by = outline[i][1];
      if ((ay <= cy && by > cy) || (by <= cy && ay > cy)) {
        const x = outline[p][0] + ((cy - ay) / (by - ay)) * (outline[i][0] - outline[p][0]);
        if (x < l) l = x;
        if (x > r) r = x;
      }
    }
    ROW_L[y] = l;
    ROW_R[y] = r;
  }
  const x0 = Math.max(0, Math.floor(minX)), x1 = Math.min(383, Math.ceil(maxX));
  for (let x = x0; x <= x1; x++) {
    const cx = x + 0.5;
    let t = Infinity;
    for (let i = 0, p = n - 1; i < n; p = i++) {
      const ax = outline[p][0], bx = outline[i][0];
      if ((ax <= cx && bx > cx) || (bx <= cx && ax > cx)) {
        const y = outline[p][1] + ((cx - ax) / (bx - ax)) * (outline[i][1] - outline[p][1]);
        if (y < t) t = y;
      }
    }
    COL_TOP[x] = t;
  }
  return { y0, y1, x0, x1 };
}

// Catmull-Rom through control points (body units), `sub` samples per span: an organic shoulder line
function smoothLine(ctrl, sub) {
  const out = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    for (let k = 0; k < sub; k++) {
      const t = k / sub, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(ctrl[ctrl.length - 1]);
  return out;
}

// the right half of a torso outline per look (body units), cached on the look's torso object
function rightProfile(T) {
  if (T._profile) return T._profile;
  const shoulder = smoothLine([
    [T.neckHW, -1.6],
    [T.neckHW + 4.6, -0.2 + T.shoulderTop * 0.25],
    [T.shoulderHW * 0.68, T.shoulderTop * 0.62],
    [T.shoulderHW * 0.86, T.shoulderTop + 0.3],
    [T.shoulderHW * 0.96, T.shoulderTop + 2.2],
    [T.shoulderHW, T.shoulderTop + 5.2],
    [T.shoulderHW * 0.995, T.shoulderTop + 9],
  ], 3);
  const prof = [...shoulder, [T.sideHW, 20], [T.sideHW * 0.97, 32], [T.sideHW * 0.95, T.bottom]];
  Object.defineProperty(T, '_profile', { value: prof, enumerable: false });
  return prof;
}

/**
 * Torso silhouette shared by jackets and tops: outline polygon (screen px), the
 * jacket polygon closed by its V opening, shoulder lift for breathing/shrugs and
 * the flat-chest tone function. Wave 2 adds `rows` (silhouette extents per row /
 * column, valid until the next torsoFrame call) and `unlift(x, y)`.
 */
export function torsoFrame(o) {
  const { L, sk, toS, s } = o;
  const T = L.torso;
  const A = sk.body.breathe * 0.45;
  // breathing and shrugs lift the shoulders
  const lift = (side, y) => {
    const sh = side < 0 ? sk.shoulder.L : sk.shoulder.R;
    const k = clamp(1 - (y - T.shoulderTop) / 12, 0, 1);
    return y - (A + sh) * k;
  };
  // approximate inverse of lift for shading in body space
  const unlift = (x, y) => {
    const sh = x < 0 ? sk.shoulder.L : sk.shoulder.R;
    const k = clamp(1 - (y - T.shoulderTop) / 12, 0, 1);
    return y + (A + sh) * k;
  };
  const right = rightProfile(T);
  // left collar → down the left side → across the bottom → up the right side → right collar,
  // then the V opening of the jacket closes the polygon at the front
  const outline = [];
  for (const [x, y] of right) outline.push(toS(-x, lift(-1, y)));
  for (let i = right.length - 1; i >= 0; i--) outline.push(toS(right[i][0], lift(1, right[i][1])));
  const vY = T.vDepth;
  const jacketPts = [];
  for (const [x, y] of outline) jacketPts.push(x, y);
  const [vx, vy] = toS(0, vY);
  jacketPts.push(vx, vy);

  const center = toS(0, 10);
  const halfW = T.shoulderHW * s;
  const shoulderTopPx = toS(0, T.shoulderTop)[1];
  // a broad chest is mostly flat: thin lit strip on the left, base across, shade on the right
  const torsoTone = () => (x, y) => {
    const nx = (x + 0.5 - center[0]) / halfW;
    const top = (y + 0.5 - shoulderTopPx) / s;
    if (top < 2.2 && Math.abs(nx) > 0.35 && Math.abs(nx) < 0.9) return nx < 0 ? 0 : 1; // shoulder tops catch the key
    if (nx < -0.84) return 0;
    if (nx < 0.6) return 1;
    if (nx < 0.9) return 2;
    return 3;
  };
  let rows = null;
  const liftL = A + sk.shoulder.L, liftR = A + sk.shoulder.R;
  return {
    T, lift, unlift, outline, jacketPts, vY, torsoTone,
    liftK: liftL !== 0 || liftR !== 0, liftL, liftR,
    get rows() {
      return rows || (rows = silhouetteRows(outline));
    },
  };
}

// ---------------------------------------------------------------------------
// Jacket planes and folds (tone per pixel, body space)

/**
 * Tone function for a tailored jacket body. Planes: the key edge on the left,
 * lit shoulder tops (following the slope), the base front, a side plane on the
 * right whose width follows the ribcage, a deep core at close-ups, and drag
 * folds from the closure toward the armpits (a shadow crescent under a ridge).
 */
function shadeJacket(o, F, tier, g, mat) {
  const s = o.s, T = F.T, vY = F.vY;
  const R = F.rows; // fills ROW_L / ROW_R / COL_TOP
  const A = affine(o);
  if (!A.ok) return;
  const buf = o.buf, W = buf.w, mats = buf.mat, grps = buf.grp, tones = buf.tone;
  const lift = F.liftK, liftL = F.liftL, liftR = F.liftR, shTop = T.shoulderTop;
  const is = 1 / s;
  // the approved prototype's broad shade on the far third, following the ribcage; above the armpit
  // it narrows to a thin terminator so the far shoulder reads as a rounded, lit form (the sleeve
  // starts below the shoulder point, HANDS) instead of a dark hump
  const sideBase = T.sideHW * 0.34, sideBulge = T.sideHW * 0.06;
  const capTop = shTop + 0.6, armpit = T.shoulderJoint[1] + 3.2;
  const capK = 1 / Math.max(1, armpit - capTop);
  const band = tier === 0 ? 1.4 : tier === 1 ? 1.7 : 1.25; // the shoulder tops' key band: narrower at close-ups (a lit seam line, never a grey slab)
  const keyW = tier === 0 ? 1.1 : 1.0;
  const nhw = T.neckHW + 1.2;
  const detail = tier === 2;
  const y0 = Math.max(1, R.y0), y1 = Math.min(buf.h - 2, R.y1);
  for (let py = y0; py <= y1; py++) {
    const l = ROW_L[py], r = ROW_R[py];
    if (!(r > l)) continue;
    const xa = Math.max(1, Math.floor(l)), xb = Math.min(W - 2, Math.ceil(r));
    const qy = py + 0.5;
    // body coordinates at the row's first pixel centre, then incremental along the row
    let x = A.xa * (xa + 0.5) + A.xb * qy + A.xc;
    let y0b = A.ya * (xa + 0.5) + A.yb * qy + A.yc;
    let dl = (xa + 0.5 - l) * is, dr = (r - xa - 0.5) * is;
    // the side plane's bump depends on height only: once per row (the lean is small)
    const dyr = y0b - 7;
    const bump = 1 / (1 + (dyr * dyr) / 40);
    let fc = (y0b - capTop) * capK;
    fc = fc < 0 ? 0 : fc > 1 ? 1 : fc * fc * (3 - 2 * fc);
    const sideW = (sideBase + sideBulge * bump) * fc, deepW = (1.5 + 0.4 * bump) * fc;
    for (let px = xa; px <= xb; px++, x += A.xa, y0b += A.ya, dl += is, dr -= is) {
      const i = py * W + px;
      if (mats[i] !== mat || grps[i] !== g) continue;
      let y = y0b;
      if (lift) {
        const k = 1 - (y - shTop) / 12;
        if (k > 0) y += (x < 0 ? liftL : liftR) * (k > 1 ? 1 : k);
      }
      const ax = x < 0 ? -x : x;
      let t = 1;
      if (dr < sideW) t = 2;
      if (detail && dr < deepW) t = 3;
      // shoulder tops catch the key (a band that follows the slope), the left one more
      if (ax > nhw && (qy - COL_TOP[px]) * is < band) {
        if (x < 0) t = 0;
        else if (t >= 2) t = 1; // the far shoulder's top still faces the light (the rim sits on it)
      }
      // the key-light edge on the left
      if (dl < keyW) t = 0;
      tones[i] = t;
    }
  }
  if (detail) drawFolds(o, F, g, mat);
}

/**
 * Drag folds from just outside the closure toward each armpit, drawn as deliberate 1 px strokes
 * (a per-pixel crescent test broke into orphan dots at mediums): a shade line that sags in the
 * middle, one tone down from what it crosses, thicker in its middle third at close-ups, with a
 * short lit ridge above it on the key side from s 3.
 */
function drawFolds(o, F, g, mat) {
  const s = o.s, T = F.T, vY = F.vY, buf = o.buf, W = buf.w;
  const fsx = 1.9, fsy = vY + 0.9;
  const fex = T.sideHW * 0.6, fey = Math.min(vY - 3, T.shoulderJoint[1] + 6.5);
  const sag = 2.0;
  const n = Math.max(6, Math.ceil(Math.hypot(fex - fsx, fey - fsy) * s * 1.5));
  const thick = s >= 3.2, ridge = s >= 3;
  const mats = buf.mat, grps = buf.grp, tones = buf.tone;
  for (let side = -1; side <= 1; side += 2) {
    let lx = -9999, ly = -9999;
    for (let k = 0; k <= n; k++) {
      const u = 0.14 + 0.72 * (k / n);
      const bx = side * (fsx + (fex - fsx) * u);
      const by = fsy + (fey - fsy) * u + sag * 4 * u * (1 - u);
      fwd(o, bx, F.lift(side, by));
      const px = Math.floor(FX), py = Math.floor(FY);
      if (px === lx && py === ly) continue;
      lx = px;
      ly = py;
      const mid = u > 0.36 && u < 0.64;
      for (let j = 0; j < (thick && mid ? 2 : 1); j++) {
        const i = (py + j) * W + px;
        if (mats[i] !== mat || grps[i] !== g) continue;
        const t = tones[i];
        tones[i] = side < 0 ? (t < 2 ? 2 : t) : t >= 2 ? 3 : 2;
      }
      if (ridge && side < 0 && u > 0.3 && u < 0.7) {
        const i = (py - 1) * W + px;
        if (mats[i] === mat && grps[i] === g && tones[i] === 1) tones[i] = 0;
      }
    }
  }
}

// Affine screen → body coefficients for the current outfit context (lean is a rotation about HIP):
// x = xa·px + xb·py + xc, y = ya·px + yb·py + yc. `ok` is false without o.inv (no detail shading).
const AFF = { ok: false, xa: 0, xb: 0, xc: 0, ya: 0, yb: 0, yc: 0 };
function affine(o) {
  const v = o.inv;
  if (!v) {
    AFF.ok = false;
    AFF.xa = AFF.xb = AFF.xc = AFF.ya = AFF.yb = 0;
    AFF.yc = 10;
    return AFF;
  }
  const k = 1 / v.s;
  const X0 = -v.ox * k - v.bx, Y0 = -v.oy * k - v.by - HIP;
  AFF.ok = true;
  AFF.xa = v.cl * k;
  AFF.xb = v.sl * k;
  AFF.xc = X0 * v.cl + Y0 * v.sl;
  AFF.ya = -v.sl * k;
  AFF.yb = v.cl * k;
  AFF.yc = -X0 * v.sl + Y0 * v.cl + HIP;
  return AFF;
}

// ---------------------------------------------------------------------------
// Tailored jacket over a shirt (suit with tie or open collar, blazer over a top)

function lapelSpec(L) {
  const suit = L.outfit === 'suit';
  return { notchY: suit ? 6.2 : 6.6, w: suit ? 5.6 : 4.2, collarW: suit ? 4.2 : 3.2, ...(L.lapel || {}) };
}

function collarStyle(L) {
  if (L.collar) return L.collar;
  if (L.outfit === 'suit') return L.tie ? 'tie' : 'band';
  return 'none';
}

function drawJacketOutfit(o) {
  const { buf, L, m, s, gb, G, clip } = o;
  const F = torsoFrame(o);
  const { T, lift, vY } = F;
  const tier = s < 1.35 ? 0 : s < 2.2 ? 1 : 2;
  const nhw = T.neckHW;
  const collar = collarStyle(L);
  const top = L.outfit === 'suit' ? null : L.neckline || 'scoop';
  const ly = (x, y) => lift(x < 0 ? -1 : 1, y);

  // ---- shirt / top inside the V
  buf.part(gb + G.shirt, 6, clip);
  const shirtTop = L.outfit === 'suit' ? -2.4 : 1.2;
  const sp = pts(0);
  for (const [x, y] of [[-nhw - 0.9, shirtTop], [nhw + 0.9, shirtTop], [3.4, vY * 0.5], [1.4, vY + 2], [-1.4, vY + 2], [-3.4, vY * 0.5]]) pt(o, sp, x, ly(x, y));
  buf.poly(sp, m.shirt, shirtTone(o, F, tier, collar));
  if (top) drawNeckline(o, F, tier, top);
  if (collar === 'open') drawOpenThroat(o, F, tier);

  // ---- tie
  if (m.tie && collar === 'tie') drawTie(o, F, tier);

  // ---- jacket body, folds and lapels
  buf.part(gb + G.jacket, 8, clip);
  if (tier >= 1 && o.inv) {
    // one flat fill, then the planes and folds in one incremental pass (no per-pixel closure)
    buf.poly(F.jacketPts, m.jacket, 1);
    shadeJacket(o, F, tier, gb + G.jacket, m.jacket);
  } else buf.poly(F.jacketPts, m.jacket, F.torsoTone(m.jacket));
  drawLapels(buf, L, m, o.toS, s, vY, gb + G.jacket, o, F);

  // ---- shirt collar points over the jacket edge
  // (wides: the collar points' inner lines turn into a black-and-white knot of noise at 1x; the shirt's V
  // and the knot read cleaner on their own)
  if (tier > 0 && (collar === 'tie' || collar === 'band' || collar === 'open')) drawShirtCollar(o, F, tier, collar);
  if (L.necklace) drawNecklace(buf, L, o.toS, s);
  if (L.pocket) drawPocket(o, F, tier);
  if (L.pin) drawPin(o, F, tier);
  drawButtons(o, F, tier);

  // ---- a continuous silver rim along the screen-right shoulder
  if (s >= 1.35 && o.inv) {
    const [ax] = o.toS(nhw + 1.5, 0);
    const [bx] = o.toS(T.shoulderHW + 1, 0);
    const [, ty] = o.toS(0, -3);
    const [, by] = o.toS(0, T.shoulderTop + 8);
    rimTopRight(buf, gb + G.jacket, ax, bx, ty, by, rimMat(P.silver), Math.max(2, Math.round(s * 1.6)));
  }
}

/** Shirt tones: lapel and collar cast shadows, a soft shadow beside the tie. */
function shirtTone(o, F, tier, collar) {
  if (tier === 0 || !o.inv) return 1;
  const v = o.inv, T = F.T, vY = F.vY, s = o.s;
  const px1 = 1 / s;
  return (px, py) => {
    v.at(px + 0.5, py + 0.5);
    const x = v.x, y = F.unlift(v.x, v.y);
    // distance to the V edge (the jacket's opening line) on each side
    const edge = T.neckHW * (1 - (y + 1.6) / (vY + 1.6));
    const de = edge - Math.abs(x);
    if (de < (x > 0 ? 1.3 : 0.6) + px1) return 2; // the lapels shade the shirt next to them
    if (collar === 'tie' && tier === 2 && x > 0.9 && x < 0.9 + 1.4 * px1 + 0.5 && y > 2.6 && y < vY - 3) return 2; // tie shadow
    if (y < 3.8 && y > 1.4 && Math.abs(x) > 1.1 && collar !== 'none') return 2; // under the collar points
    return 1;
  };
}

/** The neckline of a top under a blazer: scoop, V or blouse collar, with the fabric's edge. */
function drawNeckline(o, F, tier, kind) {
  const { buf, L, m, s, gb, G } = o;
  const T = F.T;
  const nhw = T.neckHW;
  const ly = (x, y) => F.lift(x < 0 ? -1 : 1, y);
  const np = pts(1);
  if (kind === 'v') {
    for (const [x, y] of [[-nhw - 0.6, -1.8], [nhw + 0.6, -1.8], [0, 6.4]]) pt(o, np, x, ly(x, y));
  } else if (kind === 'blouse') {
    // a softly open blouse: a narrow V under a small collar (drawn by drawBlouseCollar)
    for (const [x, y] of [[-nhw + 0.2, -1.8], [nhw - 0.2, -1.8], [0.7, 3.2], [0, 4.4], [-0.7, 3.2]]) pt(o, np, x, ly(x, y));
  } else {
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI * (i / 12);
      const x = -Math.cos(a) * (nhw + 0.45);
      pt(o, np, x, ly(x, -1.8 + Math.pow(Math.sin(a), 0.85) * 4.7));
    }
  }
  // the skin inside the neckline joins the neck's group: no line where the two meet
  buf.part(gb + G.neck, 6, o.clip);
  buf.poly(np, m.skin, tier === 0 || !o.inv ? 1 : neckSkinTone(o, F, kind));
  buf.part(gb + G.shirt, 6, o.clip);
  if (tier === 0) return;
  // the fabric's edge: lit on the left, shaded on the right (1 px, painted on the top's pixels)
  const g = gb + G.shirt;
  const n = np.length >> 1;
  for (let i = 0; i + 1 < n; i++) {
    const ax = np[i * 2], ay = np[i * 2 + 1], bx = np[i * 2 + 2], by = np[i * 2 + 3];
    const lit = (ax + bx) * 0.5 < (np[0] + np[(n - 1) * 2]) * 0.5;
    line(ax, ay + 1, bx, by + 1, (x, y) => {
      const i2 = y * buf.w + x;
      if (buf.mat[i2] === m.shirt) buf.tone[i2] = lit ? 0 : 2;
    });
  }
  if (kind === 'blouse') drawBlouseCollar(o, F, tier);
}

/** Skin inside a neckline: the far side turns away; soft collarbones only in close-ups. */
function neckSkinTone(o, F, kind) {
  const v = o.inv, s = o.s, T = F.T;
  const close = s >= 3.2;
  const px1 = 1 / s;
  return (px, py) => {
    v.at(px + 0.5, py + 0.5);
    const x = v.x, y = F.unlift(v.x, v.y);
    const nx = x / (T.neckHW + 0.5);
    if (nx > 0.72) return 2;
    if (close && kind !== 'blouse') {
      // collarbones: a short soft shade under each, rising toward the shoulders
      const ax = Math.abs(x);
      const cy = 1.0 + ax * 0.16;
      if (ax > 1.2 && ax < T.neckHW - 0.2 && y > cy && y < cy + px1 * 1.05) return x < 0 ? 1 : 2;
    }
    return 1;
  };
}

/** A soft blouse collar: two small rounded points lying on the jacket's V. */
function drawBlouseCollar(o, F, tier) {
  const { buf, m, gb, G, clip } = o;
  const T = F.T;
  const nhw = T.neckHW;
  buf.part(gb + G.collar, 9, clip);
  for (const side of [-1, 1]) {
    const c = pts(2);
    const ly = (y) => F.lift(side, y);
    for (const [x, y] of [[nhw + 0.3, -2.2], [nhw + 1.0, -0.6], [nhw + 1.5, 1.6], [nhw + 0.9, 3.5], [0.9, 3.4], [0.5, 1.6]]) pt(o, c, side * x, ly(y));
    buf.poly(c, m.shirt, side < 0 ? 0 : tier === 2 ? 1 : 1);
  }
}

/** Open shirt collar: a narrow V of skin at the throat with the placket below. */
function drawOpenThroat(o, F, tier) {
  const { buf, m, gb, G } = o;
  const T = F.T;
  const np = pts(1);
  const ly = (x, y) => F.lift(x < 0 ? -1 : 1, y);
  // starts above the shirt's top edge so no strip of shirt (and its line) crosses the throat
  for (const [x, y] of [[-T.neckHW + 0.3, -3.0], [T.neckHW - 0.3, -3.0], [1.3, 1.8], [0, 4.6], [-1.3, 1.8]]) pt(o, np, x, ly(x, y));
  buf.part(gb + G.neck, 6, o.clip);
  buf.poly(np, m.skin, tier === 0 || !o.inv ? 1 : neckSkinTone(o, F, 'v'));
  buf.part(gb + G.shirt, 6, o.clip);
  if (tier < 2) return;
  // placket: one shaded line down from the V, a button
  const g = gb + G.shirt;
  const a = o.toS(0.35, 4.8), b = o.toS(0.35, F.vY + 1);
  paintLine(buf, a[0], a[1], b[0], b[1], m.shirt, 2, g);
  const bt = o.toS(-0.3, 8.2);
  buf.paint(Math.round(bt[0]), Math.round(bt[1]), m.shirt, 2, g);
}

/**
 * Tie: a shaded knot with a dimple, a keel down the blade, a shadow where it leaves the knot.
 * `tie.style: 'knit'` (Sam): a slim matte knit with a small four-in-hand knot and a straight-cut
 * end; no sheen, a fine horizontal rib at close-ups instead of the silk's keel highlight.
 */
function drawTie(o, F, tier) {
  const { buf, L, m, s, gb, G, clip } = o;
  const vY = F.vY;
  const knit = L.tie.style === 'knit';
  buf.part(gb + G.tie, 7, clip);
  const blade = pts(1);
  if (knit) {
    for (const [x, y] of [[-0.72, 2.0], [0.72, 2.0], [1.1, vY - 2.2], [1.1, vY + 0.6], [-1.1, vY + 0.6], [-1.1, vY - 2.2]]) pt(o, blade, x, y);
  } else {
    for (const [x, y] of [[-0.95, 2.4], [0.95, 2.4], [1.8, vY - 3], [0, vY + 0.5], [-1.8, vY - 3]]) pt(o, blade, x, y);
  }
  const v = o.inv;
  const bladeTone = tier === 0 || !v
    ? 1
    : knit
      ? (px, py) => {
        v.at(px + 0.5, py + 0.5);
        if (v.y < 2.9 && tier === 2) return 2; // shadow under the knot
        return v.x > 0.38 ? 2 : 1; // matte: only the far edge turns away
      }
      : (px, py) => {
        v.at(px + 0.5, py + 0.5);
        const x = v.x, y = v.y;
        const hw = 0.95 + (0.85 * (y - 2.4)) / (vY - 5.4);
        if (y < 3.3 && tier === 2) return 2; // shadow under the knot
        if (x > hw * 0.3) return 2; // the far half of the keel turns away
        if (tier === 2 && x < -hw * 0.55 && y > 4) return 0;
        return 1;
      };
  buf.poly(blade, m.tie, bladeTone);
  const knot = pts(2);
  if (knit) {
    for (const [x, y] of [[-0.95, 0.0], [0.95, 0.0], [0.8, 1.3], [0.6, 2.25], [-0.6, 2.25], [-0.8, 1.3]]) pt(o, knot, x, y);
  } else {
    for (const [x, y] of [[-1.25, 0.1], [1.25, 0.1], [1.05, 1.6], [0.85, 2.7], [-0.85, 2.7], [-1.05, 1.6]]) pt(o, knot, x, y);
  }
  const knotTone = tier === 0 || !v
    ? knit ? 1 : 0
    : (px, py) => {
      v.at(px + 0.5, py + 0.5);
      if (v.x > (knit ? 0.3 : 0.45)) return 2;
      if (v.x < -0.2 && v.y < (knit ? 1.1 : 1.6)) return 0;
      return 1;
    };
  buf.poly(knot, m.tie, knotTone);
  if (tier === 2 && !knit) {
    // the dimple: a short dark crease under the knot, a lit pixel beside it
    const d0 = o.toS(0.1, 2.75), d1 = o.toS(0.25, 2.75 + Math.max(1.1, 2.2 / s));
    paintLine(buf, d0[0], d0[1], d1[0], d1[1], m.tie, 3, gb + G.tie);
    const h = o.toS(-0.35, 3.1);
    buf.paint(Math.round(h[0]) - 1, Math.round(h[1]), m.tie, 0, gb + G.tie);
  }
}

/** Shirt collar points (and the band round the neck); 'open' spreads them over the lapels. */
function drawShirtCollar(o, F, tier, collar) {
  const { buf, m, s, gb, G, clip } = o;
  const T = F.T;
  const nhw = T.neckHW;
  buf.part(gb + G.collar, 9, clip);
  const open = collar === 'open';
  const v = o.inv;
  for (const side of [-1, 1]) {
    const ly = (y) => F.lift(side, y);
    const c = pts(2);
    const shape = open
      ? [[nhw + 0.15, -2.9], [nhw + 0.9, -1.6], [nhw + 2.4, 3.6], [nhw + 1.7, 4.2], [1.5, 1.2], [nhw - 0.6, -1.6]]
      // the points frame the knot: their inner edges run down its sides instead of covering it
      : [[nhw + 0.35, -2.9], [nhw + 0.85, -0.8], [nhw + 1.15, 1.6], [nhw + 1.0, 3.4], [1.25, 2.5], [1.45, 0.4], [nhw - 0.9, -1.8]];
    for (const [x, y] of shape) pt(o, c, side * x, ly(y));
    let tone = side < 0 ? 0 : 1;
    if (tier === 2 && v) {
      // the far point is in the key's shadow along its inner edge; the near one only at its tip
      tone = (px, py) => {
        v.at(px + 0.5, py + 0.5);
        const ax = Math.abs(v.x), y = v.y;
        if (side > 0) return ax < nhw * 0.55 + y * 0.12 ? 2 : 1;
        return y > 2.4 && ax < nhw ? 1 : 0;
      };
    }
    buf.poly(c, m.shirt, tone);
  }
  if (tier === 2 && !open) {
    // the band shows between the points above the knot
    const a = o.toS(-0.6, -0.4), b = o.toS(0.6, -0.4);
    paintLine(buf, a[0], a[1], b[0], b[1], m.shirt, 2, gb + G.shirt);
  }
}

// ---------------------------------------------------------------------------
// Details

/**
 * Lapels. Signature kept for other streams: (buf, L, m, toS, s, vY, g). With the
 * optional (o, F) from the outfit drawer the lapels are filled shapes (collar,
 * notch, lapel point, belly), shaded and stitched; without them, the edges are
 * drawn as lines as in the approved prototype.
 */
export function drawLapels(buf, L, m, toS, s, vY, g, o = null, F = null) {
  if (s < 1.2) return;
  const T = L.torso;
  const deep = 3;
  if (!o || !F) {
    for (const side of [-1, 1]) {
      const p = L.outfit === 'suit'
        ? [[side * (T.neckHW + 0.4), -1.6], [side * (T.neckHW + 5.0), 6.2], [side * (T.neckHW + 3.6), 7.4], [side * 0.6, vY - 0.5]]
        : [[side * (T.neckHW + 0.5), -1.3], [side * (T.neckHW + 3.6), 9], [side * 0.6, vY - 0.4]];
      for (let i = 0; i + 1 < p.length; i++) {
        const [ax, ay] = toS(...p[i]);
        const [bx, by] = toS(...p[i + 1]);
        line(ax, ay, bx, by, (x, y) => buf.paint(x, y, m.jacket, deep, g));
      }
    }
    return;
  }
  const tier = s < 2.2 ? 1 : 2;
  const nhw = T.neckHW;
  const Ls = lapelSpec(L);
  const mat = m.lapel || m.jacket;
  const v = o.inv;
  for (const side of [-1, 1]) {
    const ly = (y) => F.lift(side, y);
    // key points (body units)
    const G0 = [side * (nhw + 0.25), -1.75];
    const C = [side * (nhw + Ls.collarW), Ls.notchY - 1.5];
    const N = [side * (nhw + Ls.collarW - 0.95), Ls.notchY - 0.1];
    const Lp = [side * (nhw + Ls.w), Ls.notchY + 0.45];
    const B = [side * 0.55, vY - 0.6];
    // the lapel's edge bellies out a little between its point and the closure
    const Qx = (Lp[0] + B[0]) * 0.5 + side * 0.75, Qy = (Lp[1] + B[1]) * 0.5;
    const poly = pts(3);
    pt(o, poly, side * nhw, ly(-1.6));
    pt(o, poly, G0[0], ly(G0[1]));
    pt(o, poly, C[0], ly(C[1]));
    pt(o, poly, N[0], ly(N[1]));
    pt(o, poly, Lp[0], ly(Lp[1]));
    pt(o, poly, Qx, ly(Qy));
    pt(o, poly, B[0], ly(B[1]));
    pt(o, poly, 0, vY);
    // lapel shading: the near lapel rolls into the key (lit band along its edge), the far one turns away
    const ex = B[0] - Lp[0], ey = B[1] - Lp[1];
    const el = Math.hypot(ex, ey) || 1;
    const nx = -ey / el * side, ny = ex / el * side; // normal of the edge pointing into the lapel
    const bandW = tier === 2 ? Math.max(0.55, 1.05 / s) : 0.9;
    const farW = tier === 2 ? 1.1 / s : 0.9;
    const toneAt = !v
      ? side < 0 ? 1 : 2
      : (px, py) => {
        v.at(px + 0.5, py + 0.5);
        const x = v.x, y = F.unlift(v.x, v.y);
        // distance inside the main edge (Lp → B), positive inward
        const d = (x - Lp[0]) * nx + (y - Lp[1]) * ny;
        if (y < N[1] - 0.2) return 1; // the collar above the notch
        if (side < 0) return d < bandW ? 0 : 1;
        return d < farW ? 2 : 1; // the far lapel turns away: a 1 px shade inside its edge
      };
    buf.poly(poly, mat, toneAt);
    // edges in the deep tone, as in the approved prototype, taken from the polygon's own boundary
    // pixels (a Bresenham edge beside the polygon left a ladder of gaps against it); the far
    // lapel's cast shadow is a clean band on the chest just outside it (the key is upper
    // camera-left: the near lapel's shadow lies under the lapel itself)
    lapelEdges(buf, poly, mat, m.jacket, g, side > 0 && tier === 2 ? 1 : 0);
    if (tier < 2) continue;
    if (s >= 3) {
      // pick stitching ~0.6 u inside the edge (singles only, s ≥ 3.6): tiny dimples one tone below
      // the cloth they sit in, never lighter, so they read as stitches and not as dust; and the
      // buttonhole on the wearer's left lapel
      if (s >= 3.6) {
        const inset = 0.65;
        STITCH.mat = mat;
        STITCH.g = g;
        STITCH.buf = buf;
        stitch(o, Lp[0] - side * inset * 0.6, ly(Lp[1] + inset * 0.9), Qx - side * inset, ly(Qy));
        stitch(o, Qx - side * inset, ly(Qy), B[0] - side * 0.1, ly(B[1] - 1.6));
      }
      if (side > 0) {
        const h0 = o.toS(nhw + Ls.w * 0.55, ly(Ls.notchY + 2.6)), h1 = o.toS(nhw + Ls.w * 0.55 + 1.0, ly(Ls.notchY + 2.2));
        paintLine(buf, h0[0], h0[1], h1[0], h1[1], mat, deep, g);
      }
    }
  }
}

/**
 * Lapel outline from its boundary pixels: lapel pixels touching the jacket body take the deep tone;
 * with `shadow` > 0, jacket pixels right of or below the lapel (up to `shadow` px) take tone 2+.
 */
function lapelEdges(buf, poly, lapel, body, g, shadow) {
  const n = poly.length >> 1, W = buf.w;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let k = 0; k < n; k++) {
    const x = poly[k * 2], y = poly[k * 2 + 1];
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  x0 = Math.max(2, Math.floor(x0) - 1);
  y0 = Math.max(2, Math.floor(y0) - 1);
  x1 = Math.min(W - 3, Math.ceil(x1) + 2);
  y1 = Math.min(buf.h - 3, Math.ceil(y1) + 2);
  const mat = buf.mat, grp = buf.grp, tone = buf.tone;
  const isBody = (j) => mat[j] === body && grp[j] === g;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * W + x;
      if (mat[i] !== lapel || grp[i] !== g) continue;
      if (isBody(i - 1) || isBody(i + 1) || isBody(i - W) || isBody(i + W)) tone[i] = 3;
    }
  }
  if (!shadow) return;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * W + x;
      if (!isBody(i)) continue;
      const near = mat[i - 1] === lapel || mat[i - W] === lapel;
      const near2 = shadow > 1 && (mat[i - 2] === lapel || mat[i - 2 * W] === lapel || mat[i - W - 1] === lapel);
      if ((near || near2) && tone[i] < 2) tone[i] = 2;
    }
  }
}

// stitching: 2 px on, 2 px off, one tone darker than the cloth under it (module scratch, no closure per call)
const STITCH = { buf: null, mat: 0, g: 0, n: 0 };
function stitchPx(x, y) {
  const S = STITCH, b = S.buf;
  if (S.n++ % 4 >= 2) return;
  const i = y * b.w + x;
  if (b.mat[i] === S.mat && b.grp[i] === S.g) b.tone[i] = Math.min(3, b.tone[i] + 1);
}
function stitch(o, ax, ay, bx, by) {
  fwd(o, ax, ay);
  const x0 = FX, y0 = FY;
  fwd(o, bx, by);
  STITCH.n = 0;
  line(x0, y0, FX, FY, stitchPx);
}

/** Breast-pocket welt with a two-peak pocket square (wearer's left breast). */
function drawPocket(o, F, tier) {
  const { buf, m, s, gb, G } = o;
  const T = F.T;
  const g = gb + G.jacket;
  const x0 = T.shoulderHW * 0.5 - 1.2, y0 = 13.2;
  const white = decal(P.white), silver = decal(P.silver);
  if (tier < 2 || s < 2.9) {
    // wides and mediums: a small folded square, the far facet in silver, a peak at close-ups
    const p = o.toS(x0 + 0.8, y0);
    const pw = Math.max(2, Math.round(2.6 * s)), ph = Math.max(1, Math.round(0.9 * s));
    const bx = Math.round(p[0]), by = Math.round(p[1]);
    for (let j = 0; j < ph; j++) for (let i = 0; i < pw; i++) buf.paint(bx + i, by + j, i >= pw - Math.max(1, pw >> 2) || j === ph - 1 && j > 0 ? silver : white, 1, g);
    if (tier === 2) buf.paint(bx + 1, by - 1, white, 1, g);
    return;
  }
  // welt: a slanted lit lip with a shadow under it
  const wl = 4.4;
  const a = o.toS(x0 - 0.6, y0 + 0.9), b = o.toS(x0 + wl - 0.6, y0 + 0.55);
  if (tier === 2) {
    paintLine(buf, a[0], a[1], b[0], b[1], m.jacket, 0, g);
    paintLine(buf, a[0], a[1] + 1, b[0], b[1] + 1, m.jacket, 2, g);
  }
  // the square: two peaks, the far facets in silver
  const sq = pts(4);
  for (const [x, y] of [[0, 0.95], [0.25, -0.2], [0.95, -1.05], [1.45, -0.15], [2.0, -0.75], [2.75, 0.55]]) pt(o, sq, x0 + x, y0 + y);
  const v = o.inv;
  const cut = (px, py) => {
    if (!v) return 1;
    v.at(px + 0.5, py + 0.5);
    const lx = v.x - x0;
    return (lx > 0.95 && lx < 1.45) || lx > 2.2 ? 2 : 1;
  };
  // paint the square as exact colours over the jacket
  const n = sq.length >> 1;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, sq[i * 2]);
    maxX = Math.max(maxX, sq[i * 2]);
    minY = Math.min(minY, sq[i * 2 + 1]);
    maxY = Math.max(maxY, sq[i * 2 + 1]);
  }
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    for (let x = Math.floor(minX); x <= Math.ceil(maxX); x++) {
      if (!inPoly(sq, x + 0.5, y + 0.5)) continue;
      buf.paint(x, y, cut(x, y) === 2 ? silver : white, 1, g);
    }
  }
}

function inPoly(p, x, y) {
  let c = false;
  const n = p.length >> 1;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const yi = p[i * 2 + 1], yj = p[j * 2 + 1];
    if ((yi > y) !== (yj > y) && x < ((p[j * 2] - p[i * 2]) * (y - yi)) / (yj - yi) + p[i * 2]) c = !c;
  }
  return c;
}

/** A small lapel pin (e.g. Penny's silver bar) with a specular glint. */
function drawPin(o, F, tier) {
  if (tier === 0) return;
  const { buf, L, gb, G } = o;
  const [hx, hi, lo] = L.pin.ramp || [P.white, P.silver, P.steel];
  const at = L.pin.at || [-(F.T.neckHW + 3.2), 10.5];
  const p = o.toS(at[0], F.lift(-1, at[1]));
  const x = Math.round(p[0]), y = Math.round(p[1]);
  const g = gb + G.jacket;
  const n = tier === 2 ? Math.max(2, Math.round(o.s * 0.9)) : 2;
  for (let i = 0; i < n; i++) buf.paint(x + i, y - (i >> 1), decal(i === 0 ? hx : i < n - 1 ? hi : lo), 1, g);
}

/** The closure button(s) below the V. */
function drawButtons(o, F, tier) {
  if (tier === 0) return;
  const { buf, L, m, s, gb, G } = o;
  const g = gb + G.jacket;
  const n = L.buttons || 1;
  for (let i = 0; i < n; i++) {
    const p = o.toS(0, F.vY + 2.4 + i * 8);
    const x = Math.round(p[0]), y = Math.round(p[1]);
    buf.paint(x, y, m.jacket, 3, g);
    if (tier === 2 && s >= 2.6) {
      buf.paint(x + 1, y, m.jacket, 3, g);
      buf.paint(x, y + 1, m.jacket, 3, g);
      buf.paint(x + 1, y + 1, m.jacket, 3, g);
      buf.paint(x, y, m.jacket, 1, g);
    }
  }
}

/** Thin chain with a small pendant: lit links on the key side, a glint on the pendant. */
export function drawNecklace(buf, L, toS, s) {
  if (s < 1.2) return;
  const [gold, shade] = L.necklace.map(decal);
  const glint = decal(P.white);
  let prev = null;
  const n = s >= 2.2 ? 20 : 14;
  const drop = s >= 2.2 ? 4.6 : 4.4;
  for (let i = 0; i <= n; i++) {
    const a = Math.PI * (i / n);
    const x = -Math.cos(a) * (L.torso.neckHW + 0.25);
    const [sx, sy] = toS(x, 0.6 + Math.pow(Math.sin(a), 1.15) * drop);
    const p = [Math.round(sx), Math.round(sy)];
    if (prev) line(prev[0], prev[1], p[0], p[1], (px, py) => buf.paint(px, py, i < n * 0.55 ? gold : shade, 1));
    prev = p;
  }
  const [px, py] = toS(0, 0.6 + drop + 0.9);
  const r = Math.max(0, Math.round(s * 0.35));
  const cx = Math.round(px), cy = Math.round(py);
  for (let j = 0; j <= r; j++) for (let i = -r; i <= r; i++) {
    if (r >= 1 && Math.abs(i) === r && j === r) continue; // round off the drop's corners
    buf.paint(cx + i, cy + j, i > 0 || j === r ? shade : gold, 1);
  }
  if (s >= 2.2) buf.paint(cx - (r > 0 ? 1 : 0), cy, glint, 1);
}

registerOutfit('suit', drawJacketOutfit);
registerOutfit('blazer', drawJacketOutfit);
registerOutfit('tailored', drawJacketOutfit);

