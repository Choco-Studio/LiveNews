// Arms, sleeves and articulated hands for the canvas25d rig (owner: HANDS &
// GESTURES stream).
//
// Input is one solved arm from rig.js solve(): 3D shoulder / elbow / wrist
// (two-bone IK), the hand direction and the hand shape { curl[thumb..pinky]
// 0 open → 1 curled, spread, facing (+1 palm to camera, -1 back), sup
// (0..1: the palm turns UP instead of down when it leaves the camera) }.
//
// The hand is a small 3D skeleton (hand frame, palm plate, 4 fingers × 3
// phalanges, a 3-bone thumb) built from those parameters and projected with
// the character's own oblique projection, so curling, spreading, turning
// and foreshortening are continuous changes of one shape, never a swap of
// drawings. It is rasterised into a per-hand z-buffer (frontmost part wins
// per pixel), then finished like hand-pixelled art:
//   - form shading from the key light (upper left): lit upper-left edges,
//     shaded lower-right edges, a contact shadow under fingers that cross
//     the palm, the palm and the back of the hand shaded from their own
//     normal;
//   - 1 px separation lines between fingers (and between curled fingers and
//     the palm), drawn on the part BEHIND so the front finger keeps its width;
//   - LOD by scale: s < 1.35 (wide) a clean mitten silhouette with a thumb
//     and, when pointing, a 1 px index; 1.35-2.7 separated fingers; s ≥ 2.7
//     knuckles, nails, PIP creases and the wrist crease; s ≥ 3.4 the thenar
//     crease and finer joint marks.
//   - `look.handStyle === 'robot'` (UNIT-8): the same skeleton in steel, each
//     phalanx a separate segment with a dark joint line, a palm seam, plain
//     knuckle pins; no nails, creases or lights (cosmos.md UNIT-8 table).
// Sleeves taper from the biceps to the hem (about a third narrower), a bent
// arm gets a blunt corner at the outer elbow, fold creases at the inner crease
// and a pull line up the upper arm; the shirt cuff comes out from under the
// sleeve, so the hand comes OUT of the sleeve instead of being stuck on it.
// Finish passes keep clean clusters: no lone detail, line or highlight pixel,
// separations only between fingers at least 2 px wide (a closed hand below the
// close-up scale reads as one mass), knuckles as a ridge on a closed hand.
//
// Draw order and groups inside drawArm (z is the arm's base depth from
// character.js; each arm owns z .. z+3):
//   wrist skin (gh, z) → cuff (gc, z+1) → sleeve (ga, z+2; its cap down to the
//   armpit in gh+1, joined to the jacket) → hand (gh, z+3)
// The sleeve is drawn over the cuff, so the hem is the sleeve's open edge (an
// arc), never a ring around the wrist. Groups used per arm: ga, gc, gh and
// gh+1 (the sleeve cap); gh+2..gh+5 and the spare 28-29 stay free.
// A hand against the presenter's own face, ears or neck keeps a continuous
// outline and casts a 1-2 px shadow on the skin below-right of it (key light
// upper left), so it never melts into the same skin ramp.
//
// No allocation per frame: scratch buffers are module level and sized for the
// largest close-up; the hot loops use Math.sqrt (no Math.hypot) and no closures.
import { P } from '../../palette.js';
import { TILT, clamp } from './space.js';
import { material, toneN, MAT, LIGHT } from './pixbuf.js';
import { GROUPS, GROUPS_PER_ACTOR } from './character.js'; // read at draw time only (character.js imports this module)
import { camRef, rollAxis, pronationOf, palmNormal } from './gestures/orient.js';

export { drawProps } from './props.js';

// ---------------------------------------------------------------------------
// Proportions (fractions of the hand length H = look.arm.hand)

// knuckle (MCP) positions in the palm plane: distance along the hand, lateral offset toward the thumb
const KN_A = [0.5, 0.515, 0.495, 0.455];
const KN_L = [0.165, 0.057, -0.05, -0.148];
// phalanx lengths (proximal, middle, distal) per finger, index..pinky
const PH = [
  [0.215, 0.128, 0.09],
  [0.245, 0.148, 0.1],
  [0.228, 0.138, 0.094],
  [0.18, 0.106, 0.082],
];
const FR = [0.062, 0.065, 0.06, 0.052]; // finger radius at the knuckle
const TAPER = [1, 0.93, 0.86, 0.72]; // radius at knuckle, PIP, DIP, tip
const SPREAD = [0.17, 0.05, -0.07, -0.2]; // rad per unit of spread (positive: toward the thumb)
// palm outline in palm-plane coordinates [lateral, along]: radial wrist → thenar → index side →
// knuckle arc → pinky side → hypothenar → ulnar wrist
const PALM = [
  [0.15, 0.03], [0.198, 0.13], [0.214, 0.26], [0.204, 0.4], [0.192, 0.475],
  [0.12, 0.512], [0.02, 0.527], [-0.08, 0.506], [-0.162, 0.462],
  [-0.188, 0.38], [-0.194, 0.22], [-0.172, 0.09], [-0.145, 0.03],
];
const PALM_N = PALM.length;
const PALM_THICK = 0.055; // half thickness (H)
// thumb: base (CMC) in the palm frame [along, lateral, normal], bone lengths, radii at the 4 joints
const TB = [0.1, 0.118, 0.03];
const TL = [0.27, 0.165, 0.135];
const TR = [0.088, 0.075, 0.068, 0.058];
// thumb bone directions [along f, toward t, toward n] open and closed (fist: across the curled fingers)
const T_OPEN = [[0.6, 0.76, 0.24], [0.78, 0.58, 0.15], [0.9, 0.42, 0.06]];
const T_SHUT = [[0.58, 0.28, 0.76], [0.5, -0.36, 0.79], [0.16, -0.86, 0.48]];

// key light (pixbuf.js LIGHT) and its screen-plane part, for edge shading
const LX = -0.42, LY = -0.55, LZ = 0.72;
const LL = Math.hypot(LX, LY, LZ);
const L3 = [LX / LL, LY / LL, LZ / LL];
const L2L = Math.hypot(LX, LY);
const L2X = LX / L2L, L2Y = LY / L2L;

// ---------------------------------------------------------------------------
// Small vector helpers on caller-owned arrays (no allocation)

function norm3(v) {
  const l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
  v[0] /= l;
  v[1] /= l;
  v[2] /= l;
  return v;
}
function cross3(a, b, out) {
  const x = a[1] * b[2] - a[2] * b[1], y = a[2] * b[0] - a[0] * b[2], z = a[0] * b[1] - a[1] * b[0];
  out[0] = x;
  out[1] = y;
  out[2] = z;
  return out;
}
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// ---------------------------------------------------------------------------
// Hand geometry (body space, rig units). Shared with props.js (papers, pen).

/**
 * Hand skeleton scratch: W wrist; f finger axis, n palm normal (out of the palm), t toward the thumb;
 * J joints [finger*4 + k] k = knuckle, PIP, DIP, tip (indices 0..15), thumb 16..19 (CMC, MCP, IP, tip);
 * R radii per joint; palm outline points PO (PALM_N × 3); H hand length; back = we see the back of the hand.
 */
export function newHandGeometry() {
  return {
    W: [0, 0, 0], f: [0, 0, 1], n: [0, 0, 1], t: [1, 0, 0], H: 10, side: 1, back: false, facing: 0,
    J: new Float64Array(20 * 3), R: new Float64Array(20), PO: new Float64Array(PALM_N * 3),
    curl: [0, 0, 0, 0, 0], spread: 0,
  };
}

const TMP = [0, 0, 0], TMP2 = [0, 0, 0], REF = [0, 0, 0], WV = [0, 0, 0];

/**
 * Build the 3D hand of a solved arm.
 * @param side  -1 for the screen-left arm, +1 for the screen-right arm
 */
export function handGeometry(L, arm, side, g) {
  const H = L.arm.hand;
  const hd = arm.hand;
  g.H = H;
  g.side = side;
  const W = g.W, f = g.f, n = g.n, t = g.t;
  W[0] = arm.wrist[0];
  W[1] = arm.wrist[1];
  W[2] = arm.wrist[2];
  f[0] = arm.handDir[0];
  f[1] = arm.handDir[1];
  f[2] = arm.handDir[2];
  norm3(f);
  // the authored palm normal (gestures/orient.js): camera-relative `facing`, turning toward the gesture's
  // pronation side `pro` (rig.js: baked per gesture, continuous) or, for a caller that passes none, the
  // per-frame side of natural pronation (down and a little outward)
  const facing = clamp(hd.facing, -1, 1);
  const sup = clamp(hd.sup || 0, 0, 1);
  let pro = hd.pro;
  if (pro == null) pro = pronationOf(rollAxis(f, camRef(f, REF), WV), side);
  palmNormal(f, facing, sup, clamp(pro, -1, 1), n, REF, WV);
  // a gesture that sweeps the hand across the front carries its palm direction in `palm` instead (baked
  // by gestures/index.js: the apex palm transported along the sweep without twist; palm ⟂ f): no camera
  // pole, no roll while the fingers swing past the lens
  const pw = hd.palmW > 0 ? Math.min(1, hd.palmW) : 0;
  if (pw > 0) {
    const P = hd.palm;
    const k = P[0] * f[0] + P[1] * f[1] + P[2] * f[2];
    TMP2[0] = P[0] - f[0] * k;
    TMP2[1] = P[1] - f[1] * k;
    TMP2[2] = P[2] - f[2] * k;
    const pl = Math.sqrt(TMP2[0] * TMP2[0] + TMP2[1] * TMP2[1] + TMP2[2] * TMP2[2]);
    if (pl > 1e-4) {
      n[0] += (TMP2[0] / pl - n[0]) * pw;
      n[1] += (TMP2[1] / pl - n[1]) * pw;
      n[2] += (TMP2[2] / pl - n[2]) * pw;
      // (re-orthogonalise against f: the blend of two vectors perpendicular to f stays perpendicular, up to rounding)
      norm3(n);
    }
  }
  cross3(f, n, t);
  t[0] *= side;
  t[1] *= side;
  t[2] *= side;
  norm3(t);
  g.facing = facing;
  g.back = n[2] < -0.05;
  for (let q = 0; q < 5; q++) g.curl[q] = hd.curl[q];
  g.spread = hd.spread || 0;

  // palm outline (palm plane through the wrist)
  const PO = g.PO;
  for (let i = 0; i < PALM_N; i++) {
    const la = PALM[i][0] * H, al = PALM[i][1] * H;
    PO[i * 3] = W[0] + f[0] * al + t[0] * la;
    PO[i * 3 + 1] = W[1] + f[1] * al + t[1] * la;
    PO[i * 3 + 2] = W[2] + f[2] * al + t[2] * la;
  }
  // fingers: knuckle, then 3 phalanges bending toward the palm side (+n)
  const J = g.J, R = g.R;
  const spread = g.spread;
  for (let fi = 0; fi < 4; fi++) {
    const c = clamp(hd.curl[fi + 1], -0.15, 1);
    const a = SPREAD[fi] * spread;
    const ca = Math.cos(a), sa = Math.sin(a);
    // base direction (spread rotates it about n)
    const dx = f[0] * ca + t[0] * sa, dy = f[1] * ca + t[1] * sa, dz = f[2] * ca + t[2] * sa;
    const b0 = c >= 0 ? c * 1.45 : c * 0.5;
    const b1 = c >= 0 ? c * 1.72 : c * 0.15;
    const b2 = c >= 0 ? c * 1.05 : 0;
    let x = W[0] + f[0] * KN_A[fi] * H + t[0] * KN_L[fi] * H;
    let y = W[1] + f[1] * KN_A[fi] * H + t[1] * KN_L[fi] * H;
    let z = W[2] + f[2] * KN_A[fi] * H + t[2] * KN_L[fi] * H;
    let o = fi * 4;
    J[o * 3] = x;
    J[o * 3 + 1] = y;
    J[o * 3 + 2] = z;
    R[o] = FR[fi] * H;
    let phi = 0;
    for (let s = 0; s < 3; s++) {
      phi += s === 0 ? b0 : s === 1 ? b1 : b2;
      const cp = Math.cos(phi), sp = Math.sin(phi);
      const len = PH[fi][s] * H;
      x += (dx * cp + n[0] * sp) * len;
      y += (dy * cp + n[1] * sp) * len;
      z += (dz * cp + n[2] * sp) * len;
      o++;
      J[o * 3] = x;
      J[o * 3 + 1] = y;
      J[o * 3 + 2] = z;
      R[o] = FR[fi] * TAPER[s + 1] * H;
    }
  }
  // thumb: bone directions blended from open to closed by its curl
  const tc = clamp(hd.curl[0], -0.15, 1);
  const u = Math.max(0, tc), ab = Math.min(0, tc); // negative curl: abducted a little further
  let x = W[0] + f[0] * TB[0] * H + t[0] * TB[1] * H + n[0] * TB[2] * H;
  let y = W[1] + f[1] * TB[0] * H + t[1] * TB[1] * H + n[1] * TB[2] * H;
  let z = W[2] + f[2] * TB[0] * H + t[2] * TB[1] * H + n[2] * TB[2] * H;
  J[48] = x;
  J[49] = y;
  J[50] = z;
  R[16] = TR[0] * H;
  for (let s = 0; s < 3; s++) {
    const o0 = T_OPEN[s], o1 = T_SHUT[s];
    const cf = o0[0] + (o1[0] - o0[0]) * u + ab * 0.3;
    const ctt = o0[1] + (o1[1] - o0[1]) * u - ab * 0.3;
    const cn = o0[2] + (o1[2] - o0[2]) * u;
    TMP[0] = f[0] * cf + t[0] * ctt + n[0] * cn;
    TMP[1] = f[1] * cf + t[1] * ctt + n[1] * cn;
    TMP[2] = f[2] * cf + t[2] * ctt + n[2] * cn;
    norm3(TMP);
    x += TMP[0] * TL[s] * H;
    y += TMP[1] * TL[s] * H;
    z += TMP[2] * TL[s] * H;
    const o = 17 + s;
    J[o * 3] = x;
    J[o * 3 + 1] = y;
    J[o * 3 + 2] = z;
    R[o] = TR[s + 1] * H;
  }
  return g;
}

// ---------------------------------------------------------------------------
// Projection: character.js toS(x, y, z) is affine, so 3 calls give its basis

/** Affine basis of toS into `B` = [ox, oy, xx, xy, yx, yy, zx, zy]. */
export function projBasis(toS, B) {
  const o = toS(0, 0, 0), a = toS(1, 0, 0), b = toS(0, 1, 0), c = toS(0, 0, 1);
  B[0] = o[0];
  B[1] = o[1];
  B[2] = a[0] - o[0];
  B[3] = a[1] - o[1];
  B[4] = b[0] - o[0];
  B[5] = b[1] - o[1];
  B[6] = c[0] - o[0];
  B[7] = c[1] - o[1];
  return B;
}
const BASIS = new Float64Array(8);
const px = (B, x, y, z) => B[0] + x * B[2] + y * B[4] + z * B[6];
const py = (B, x, y, z) => B[1] + x * B[3] + y * B[5] + z * B[7];

// ---------------------------------------------------------------------------
// Materials owned here (registered once per look)

const MATS = new Map();
function handMats(L, m) {
  let h = MATS.get(L);
  if (h) return h;
  const robot = L.handStyle === 'robot';
  // UNIT-8 (CONTRACTS w2-cast-b): plates in the look's `casing` material, gaps and pins in its `joint` colour
  const casing = L.mats?.casing ? m.casing : material('hands:robot', { ramp: [P.silver, P.fog, P.steel, P.slate], line: P.ink, th: [0.85, 0.1, -0.45] });
  const casingRamp = L.mats?.casing?.ramp || [P.silver, P.fog, P.steel, P.slate];
  const jointColour = L.mats?.joint?.ramp?.[1] || P.ink;
  h = {
    robot,
    skin: robot ? casing : m.hand,
    // exact colours for painted details (no clean-up pass, no inner lines)
    detail: robot ? material(`${L.id}:handD`, { ramp: casingRamp, decal: true }) : material(`${L.id}:handD`, { ramp: L.skin, decal: true }),
    line: robot ? material(`${L.id}:handLine`, { ramp: [jointColour], decal: true }) : material(`${L.id}:handLine`, { ramp: [L.skinLine], decal: true }),
    sleeveD: material(`${L.id}:sleeveD`, { ramp: L.jacket.ramp, decal: true }),
    rim: material('hands:rim', { ramp: [P.silver], decal: true }),
    // the sleeve without the side rim, for silhouette pixels that face down (the underside of a forearm
    // is away from the key light: the generic right-edge rim would dot it, one lit pixel per step)
    sleeveNoRim: material(`${L.id}:sleeveNoRim`, { ramp: L.jacket.ramp, line: L.jacket.line, th: [0.94, 0.12, -0.4] }),
  };
  MATS.set(L, h);
  return h;
}

// ---------------------------------------------------------------------------
// Fast tapered capsule straight into the PartBuffer (sleeves, wrist): same
// shading as PartBuffer.capsule, but each row only visits the span of the
// capsule's oriented bounding box (a diagonal close-up arm costs ~1/3).

const SPAN = new Float64Array(8);
// silhouette pixels of the sleeve facing up / right, collected while rasterising (for the rim pass)
const EDGE_IDX = new Int32Array(4096);
let edgeN = 0;
// silhouette pixels facing down and to the right (the underside of a forearm), for underRim
const DOWN_IDX = new Int32Array(4096);
let downN = 0;

function capsuleFast(buf, ax, ay, bx, by, ra, rb, m, toneBias = 0, flatStart = 0, collect = false, splitU = -1, splitG = 0, endK = 1) {
  const dx = bx - ax, dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy);
  const R = Math.max(ra, rb);
  const ux = len > 1e-6 ? dx / len : 1, uy = len > 1e-6 ? dy / len : 0;
  // oriented box corners
  SPAN[0] = ax - ux * R - uy * R;
  SPAN[1] = ay - uy * R + ux * R;
  SPAN[2] = bx + ux * R - uy * R;
  SPAN[3] = by + uy * R + ux * R;
  SPAN[4] = bx + ux * R + uy * R;
  SPAN[5] = by + uy * R - ux * R;
  SPAN[6] = ax - ux * R + uy * R;
  SPAN[7] = ay - uy * R - ux * R;
  let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < 4; i++) {
    const x = SPAN[i * 2], y = SPAN[i * 2 + 1];
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }
  const W = buf.w, Hh = buf.h;
  const y0 = Math.max(1, Math.floor(minY)), y1 = Math.min(Hh - 1, Math.ceil(maxY) + 1);
  const bx0 = Math.max(1, Math.floor(minX)), bx1 = Math.min(W - 1, Math.ceil(maxX) + 1);
  if (y1 <= y0 || bx1 <= bx0) return;
  buf._touch(bx0, y0, bx1, y1);
  const len2 = dx * dx + dy * dy || 1e-6;
  const { mat, tone, grp, z, clipY } = buf;
  const g = buf.g, cz = buf.cz, clip = buf.clip;
  // the material's Lambert thresholds and the key light, read once (the per-pixel tone is inlined:
  // one square root and one division a pixel, the hot loop of the arms at close-up scales)
  const th0 = MAT.th[m * 3], th1 = MAT.th[m * 3 + 1], th2 = MAT.th[m * 3 + 2];
  const dxi = dx / len2, dyi = dy / len2, dr = rb - ra;
  const flatK = flatStart > 0;
  for (let y = y0; y < y1; y++) {
    const cy = y + 0.5;
    // x-range of the oriented box on this row
    let xa = Infinity, xb = -Infinity;
    for (let i = 0; i < 4; i++) {
      const x0 = SPAN[i * 2], yy0 = SPAN[i * 2 + 1], x1 = SPAN[((i + 1) & 3) * 2], yy1 = SPAN[((i + 1) & 3) * 2 + 1];
      if ((yy0 <= cy && yy1 >= cy) || (yy1 <= cy && yy0 >= cy)) {
        const xx = yy1 === yy0 ? x0 : x0 + ((cy - yy0) / (yy1 - yy0)) * (x1 - x0);
        if (xx < xa) xa = xx;
        if (xx > xb) xb = xx;
        if (yy1 === yy0) {
          if (x1 < xa) xa = x1;
          if (x1 > xb) xb = x1;
        }
      }
    }
    if (xb < xa) continue;
    const xs = Math.max(bx0, Math.floor(xa - 0.5)), xe = Math.min(bx1, Math.ceil(xb + 0.5));
    const ry = cy - ay;
    const uRow = ry * dyi - ax * dxi;
    const row = y * W;
    for (let x = xs; x < xe; x++) {
      if (clip && y >= clipY[x]) continue;
      const cx = x + 0.5;
      const uRaw = cx * dxi + uRow;
      const u = uRaw < 0 ? 0 : uRaw > 1 ? 1 : uRaw;
      const r = ra + dr * u;
      const ex = cx - ax - dx * u, ey = ry - dy * u;
      let d2 = ex * ex + ey * ey;
      const r2 = r * r;
      // a flattened end (endK > 1): past the end the along-axis distance counts endK times, so the
      // cap is a shallow ellipse (a sleeve opening seen from the front), not a dome
      if (endK > 1 && uRaw > 1) {
        const al = ex * ux + ey * uy;
        d2 += al * al * (endK * endK - 1);
      }
      if (d2 > r2) continue;
      const i = row + x;
      mat[i] = m;
      // Lambert term l = (a + sqrt(r² − d²)·Lz) / r against the thresholds, without the square root
      // or the division: l > th  ⇔  sqrt(r² − d²)·Lz > th·r − a  (squared when the right side is ≥ 0)
      const a = ex * LGX + ey * LGY, s2 = (r2 - d2) * LGZ2;
      const q0 = th0 * r - a, q1 = th1 * r - a, q2 = th2 * r - a;
      let tt = (q0 < 0 || s2 > q0 * q0 ? 0 : q1 < 0 || s2 > q1 * q1 ? 1 : q2 < 0 || s2 > q2 * q2 ? 2 : 3) + toneBias;
      // the start of an upper arm under the shoulder stays flat-lit: no dome highlight on the cap
      if (flatK && u < flatStart && tt < 1) tt = 1;
      tone[i] = tt < 0 ? 0 : tt > 3 ? 3 : tt;
      if (collect && d2 > (r - 1.5) * (r - 1.5)) {
        if ((ey < 0 || ex > 0) && edgeN < EDGE_IDX.length) EDGE_IDX[edgeN++] = i;
        if (ey > 0 && ex >= 0 && downN < DOWN_IDX.length) DOWN_IDX[downN++] = i;
      }
      // the start of the bone may belong to another group (the sleeve cap, seamless with the jacket)
      grp[i] = u < splitU ? splitG : g;
      z[i] = cz;
    }
  }
}
const LGX = LIGHT[0], LGY = LIGHT[1], LGZ2 = LIGHT[2] * LIGHT[2];

/** Flat-ended tapered quad (the shirt cuff): a ring of fabric, flat at the wrist end. */
const QUAD = new Float64Array(12);
function cuffQuad(buf, ax, ay, bx, by, ra, rb, m) {
  const dx = bx - ax, dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy) || 1e-6;
  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux;
  // rounded start (hidden under the sleeve), flat end
  QUAD[0] = ax - ux * ra * 0.6 + nx * ra * 0.7;
  QUAD[1] = ay - uy * ra * 0.6 + ny * ra * 0.7;
  QUAD[2] = ax + nx * ra;
  QUAD[3] = ay + ny * ra;
  QUAD[4] = bx + nx * rb;
  QUAD[5] = by + ny * rb;
  QUAD[6] = bx - nx * rb;
  QUAD[7] = by - ny * rb;
  QUAD[8] = ax - nx * ra;
  QUAD[9] = ay - ny * ra;
  QUAD[10] = ax - ux * ra * 0.6 - nx * ra * 0.7;
  QUAD[11] = ay - uy * ra * 0.6 - ny * ra * 0.7;
  // tube shading across the cuff: lit on the light side, shade on the other
  CQ.ax = ax;
  CQ.ay = ay;
  CQ.nx = nx;
  CQ.ny = ny;
  CQ.r = Math.max(0.5, ra);
  buf.poly(QUAD, m, cuffTone);
}
const CQ = { ax: 0, ay: 0, nx: 0, ny: 0, r: 1 };
function cuffTone(x, y) {
  const v = ((x + 0.5 - CQ.ax) * CQ.nx + (y + 0.5 - CQ.ay) * CQ.ny) / CQ.r; // -1..1 across
  const l = 0.45 + 0.85 * v * (CQ.nx * L2X + CQ.ny * L2Y);
  return l > 1.05 ? 0 : l > 0.0 ? 1 : 2;
}

// ---------------------------------------------------------------------------
// Arms

const HG = newHandGeometry();
const S3 = [0, 0, 0], E3 = [0, 0, 0];

export function drawArm(buf, L, m, arm, side, toS, s, ga, gc, gh, z) {
  const A = L.arm;
  const B = projBasis(toS, BASIS);
  const hm = handMats(L, m);
  const sxp = px(B, arm.shoulder[0], arm.shoulder[1], arm.shoulder[2]), syp = py(B, arm.shoulder[0], arm.shoulder[1], arm.shoulder[2]);
  const exp = px(B, arm.elbow[0], arm.elbow[1], arm.elbow[2]), eyp = py(B, arm.elbow[0], arm.elbow[1], arm.elbow[2]);
  const wxp = px(B, arm.wrist[0], arm.wrist[1], arm.wrist[2]), wyp = py(B, arm.wrist[0], arm.wrist[1], arm.wrist[2]);

  // ---- sleeve: the shoulder cap belongs to the jacket (no ball where the arm meets the torso), then
  // upper arm and forearm in one group from just below the shoulder point: the round start of the
  // upper arm against the jacket draws the armhole seam (an arc from the shoulder top to the armpit)
  const ux = exp - sxp, uy = eyp - syp;
  const ul = Math.sqrt(ux * ux + uy * uy) || 1;
  const capK = Math.min(0.32, (A.rUpper * 1.1 * s) / ul);
  const cx0 = sxp + ux * capK, cy0 = syp + uy * capK;
  const jacketG = ga - (ga % GROUPS_PER_ACTOR) + GROUPS.jacket;
  shoulderCap(buf, sxp, syp, cx0, cy0, A.rUpper * s, m.sleeve, jacketG);
  edgeN = 0;
  downN = 0;
  const rimOn = s >= 1.6;
  // The sleeve cap (the upper arm down to the armpit) is its own group joined to the jacket and to the
  // rest of the sleeve: no inner line where it lies over the torso, so the round start of the capsule
  // never draws a ball joint (owner 17:50 "circles"; CONTRACTS w2-cast-a r2). A sewn armhole seam is
  // painted instead (armSeam), taller than wide, from the shoulder top to the armpit.
  const rU = A.rUpper * s;
  const gTop = gh + 1; // a spare hand group (the hand uses only gh)
  buf.joinGroups(gTop, jacketG);
  buf.joinGroups(gTop, ga);
  const capLen = ul * (1 - capK);
  const splitU = clamp((SEAM_DOWN * rU - capK * ul) / (capLen || 1), 0, 0.6);
  const fx = wxp - exp, fy = wyp - eyp;
  const fl = Math.sqrt(fx * fx + fy * fy) || 1;
  const cuffLen = Math.min(fl * 0.4, 1.3 * s); // shirt cuff showing past the jacket sleeve
  const hemX = wxp - (fx / fl) * cuffLen, hemY = wyp - (fy / fl) * cuffLen;

  // ---- wrist skin and the shirt cuff FIRST, under the sleeve: the jacket sleeve overhangs the cuff, so
  // the hem reads as the sleeve's open edge (one arc), never as a closed ring around the wrist
  buf.part(gh, z, false);
  const hd = arm.handDir;
  const H = A.hand;
  const wx2 = px(B, arm.wrist[0] + hd[0] * H * 0.1, arm.wrist[1] + hd[1] * H * 0.1, arm.wrist[2] + hd[2] * H * 0.1);
  const wy2 = py(B, arm.wrist[0] + hd[0] * H * 0.1, arm.wrist[1] + hd[1] * H * 0.1, arm.wrist[2] + hd[2] * H * 0.1);
  const rw = Math.max(0.6, A.rWrist * 0.78 * s);
  if (hm.robot) capsuleFast(buf, hemX, hemY, wx2, wy2, rw * 0.8, rw * 0.8, hm.skin, 1);
  else capsuleFast(buf, hemX, hemY, wx2, wy2, rw, rw * 0.92, hm.skin);
  buf.part(gc, z + 1, false);
  if (s < 1.2) capsuleFast(buf, hemX, hemY, wxp, wyp, A.rWrist * 0.98 * s, A.rWrist * 0.9 * s, m.cuff);
  else cuffQuad(buf, hemX, hemY, wxp, wyp, A.rWrist * 1.02 * s, A.rWrist * 0.95 * s, m.cuff);

  // ---- the sleeve over them: upper arm and forearm tapering from the biceps to the hem (a suit sleeve
  // narrows by a third), a corner at the outer elbow when the arm bends, folds at the inner crease
  buf.part(ga, z + 2, false);
  capsuleFast(buf, cx0, cy0, exp, eyp, A.rUpper * 0.99 * s, A.rElbow * s, m.sleeve, 0, Math.max(0.22, splitU), rimOn, splitU, gTop);
  if (s >= 1.9) armSeam(buf, sxp, syp, ux / ul, uy / ul, B, rU, side, gTop, jacketG, hm.sleeveD);
  capsuleFast(buf, exp, eyp, hemX, hemY, A.rElbow * s, A.rWrist * 1.04 * s, m.sleeve, 0, 0, rimOn, -1, 0, s >= 1.2 ? 2.4 : 1);
  const bend = elbowBend(arm);
  if (s >= 1.6 && bend > 1.0) elbowCorner(buf, exp, eyp, -ux / ul, -uy / ul, fx / fl, fy / fl, A.rElbow * s, m.sleeve, ga, clamp((bend - 1.0) / 0.8, 0, 1));
  if (s >= 1.6) sleeveFolds(buf, L, hm, arm, sxp, syp, exp, eyp, hemX, hemY, s, ga, bend);
  if (rimOn) {
    underRim(buf, ga, gTop, m.sleeve, hm.sleeveNoRim);
    sleeveRim(buf, ga, m.sleeve, hm.rim);
  }

  // ---- the hand (snapped inputs: see snapArm)
  handGeometry(L, snapArm(arm), side, HG);
  rasterHand(buf, L, hm, HG, snapBasis(B), s, gh, z + 3);
}

// the armhole seam runs from the shoulder top to the armpit, SEAM_DOWN sleeve radii below the shoulder joint
const SEAM_DOWN = 2.3;

/**
 * The armhole seam: a 1 px curve from the top of the shoulder down the inside of the sleeve cap to the
 * armpit (a quadratic arc, about three sleeve radii tall and one wide), painted with the jacket's exact
 * shade (deep on the screen-right arm, away from the key light) over the cap and the jacket only. Below
 * the armpit the sleeve's own inner line against the torso takes over, so the two read as one seam.
 */
function armSeam(buf, sx, sy, ux, uy, B, rU, side, gTop, jacketG, mD) {
  // inner normal: across the arm, toward the body's centre line (body x = 0)
  let nx = -uy, ny = ux;
  // (B[0]: screen x of the body origin, on the centre line)
  if (nx * (B[0] - sx) < 0) {
    nx = -nx;
    ny = -ny;
  }
  // top (on the shoulder line), control point (bulging into the cap), armpit (the sleeve's inner edge)
  const tx = sx - ux * 0.75 * rU - nx * 0.05 * rU, ty = sy - uy * 0.75 * rU - ny * 0.05 * rU;
  const qx = sx + ux * 0.55 * rU + nx * 1.08 * rU, qy = sy + uy * 0.55 * rU + ny * 1.08 * rU;
  const ax = sx + ux * SEAM_DOWN * rU + nx * 0.92 * rU, ay = sy + uy * SEAM_DOWN * rU + ny * 0.92 * rU;
  const tone = side > 0 ? 3 : 2;
  const W = buf.w;
  const { mat, tone: tn, grp } = buf;
  const steps = Math.max(8, Math.ceil(rU * 5));
  let lx = -9999, ly = -9999;
  for (let q = 0; q <= steps; q++) {
    const u = q / steps, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
    const x = Math.floor(a * tx + b * qx + c * ax), y = Math.floor(a * ty + b * qy + c * ay);
    if (x === lx && y === ly) continue;
    lx = x;
    ly = y;
    if (x < 1 || y < 1 || x >= W - 1 || y >= buf.h - 1) continue;
    const i = y * W + x;
    if (!mat[i] || (grp[i] !== gTop && grp[i] !== jacketG)) continue;
    // only inside the fabric: a seam pixel on the silhouette would notch the outline
    if (!mat[i - 1] || !mat[i + 1] || !mat[i - W] || !mat[i + W]) continue;
    mat[i] = mD;
    tn[i] = tone;
  }
}

/**
 * Fabric at the elbow: when the arm bends, a fold on the inside of the elbow
 * (1-2 short dark creases) and a lit point on the outside; a soft crease near
 * the hem at close-up scales. Painted with the jacket's exact colours.
 */
/** How far the elbow bends (rad, 0 = a straight arm), from the 3D bones. */
function elbowBend(arm) {
  S3[0] = arm.shoulder[0] - arm.elbow[0];
  S3[1] = arm.shoulder[1] - arm.elbow[1];
  S3[2] = arm.shoulder[2] - arm.elbow[2];
  E3[0] = arm.wrist[0] - arm.elbow[0];
  E3[1] = arm.wrist[1] - arm.elbow[1];
  E3[2] = arm.wrist[2] - arm.elbow[2];
  const c = dot3(S3, E3) / (Math.sqrt(dot3(S3, S3) * dot3(E3, E3)) || 1);
  return Math.PI - Math.acos(clamp(c, -1, 1));
}

/**
 * The outer elbow of a bent sleeve: the fabric is pulled into a blunt corner over the joint, not a round
 * cap (two capsules meeting read as a sausage). A miter wedge between the two tubes' outer edges, filled
 * only where the sleeve is not drawn yet, its point `k` (0..1, with the bend) beyond the circle.
 */
const ELB = new Float64Array(8);
function elbowCorner(buf, ex, ey, ux, uy, vx, vy, r, m, g, k) {
  // u: elbow → shoulder, v: elbow → wrist (unit, screen); their sum points into the crook
  let ox = -(ux + vx), oy = -(uy + vy);
  const ol = Math.sqrt(ox * ox + oy * oy);
  if (ol < 0.15) return; // nearly straight on screen
  ox /= ol;
  oy /= ol;
  // the tube normals on the outer side
  let ax = -uy, ay = ux;
  if (ax * ox + ay * oy < 0) {
    ax = -ax;
    ay = -ay;
  }
  let bx = -vy, by = vx;
  if (bx * ox + by * oy < 0) {
    bx = -bx;
    by = -by;
  }
  const tip = r * (1 + 0.24 * k);
  ELB[0] = ex + ax * r;
  ELB[1] = ey + ay * r;
  ELB[2] = ex + ox * tip;
  ELB[3] = ey + oy * tip;
  ELB[4] = ex + bx * r;
  ELB[5] = ey + by * r;
  const x0 = Math.max(1, Math.floor(Math.min(ex, ELB[0], ELB[2], ELB[4]))), x1 = Math.min(buf.w - 1, Math.ceil(Math.max(ex, ELB[0], ELB[2], ELB[4])) + 1);
  const y0 = Math.max(1, Math.floor(Math.min(ey, ELB[1], ELB[3], ELB[5]))), y1 = Math.min(buf.h - 1, Math.ceil(Math.max(ey, ELB[1], ELB[3], ELB[5])) + 1);
  const { mat, tone, grp, z } = buf;
  const W = buf.w, cz = buf.cz;
  for (let y = y0; y < y1; y++) {
    const cy = y + 0.5;
    for (let x = x0; x < x1; x++) {
      const i = y * W + x;
      if (mat[i] && grp[i] === g) continue; // the tubes are already shaded here
      const cx = x + 0.5;
      if (!inTri(cx, cy, ex, ey, ELB[0], ELB[1], ELB[2], ELB[3]) && !inTri(cx, cy, ex, ey, ELB[2], ELB[3], ELB[4], ELB[5])) continue;
      mat[i] = m;
      // the rim of a tube: lit facing the key, shade away from it
      const nx = cx - ex, ny = cy - ey, nl = Math.sqrt(nx * nx + ny * ny) || 1;
      tone[i] = toneN(m, (nx / nl) * 0.92, (ny / nl) * 0.92);
      grp[i] = g;
      z[i] = cz;
    }
  }
  buf._touch(x0, y0, x1, y1);
}
function inTri(px0, py0, ax, ay, bx, by, cx, cy) {
  const d1 = (px0 - bx) * (ay - by) - (ax - bx) * (py0 - by);
  const d2 = (px0 - cx) * (by - cy) - (bx - cx) * (py0 - cy);
  const d3 = (px0 - ax) * (cy - ay) - (cx - ax) * (py0 - ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

function sleeveFolds(buf, L, hm, arm, sx, sy, ex, ey, hx, hy, s, ga, bend) {
  const ux = sx - ex, uy = sy - ey, vx = hx - ex, vy = hy - ey;
  const ul = Math.sqrt(ux * ux + uy * uy) || 1, vl = Math.sqrt(vx * vx + vy * vy) || 1;
  // inner side of the elbow on screen: between the two bones
  let ix = ux / ul + vx / vl, iy = uy / ul + vy / vl;
  const il = Math.sqrt(ix * ix + iy * iy);
  const r = L.arm.rElbow * s;
  if (bend > 0.45 && il > 0.2) {
    ix /= il;
    iy /= il;
    // the crease starts at the inner surface and runs a little way along the forearm
    const k = clamp((bend - 0.45) / 0.9, 0, 1);
    const n = s >= 2.7 ? 2 : 1;
    for (let q = 0; q < n; q++) {
      const off = (q === 0 ? 0.45 : 0.15) * r;
      const ax = ex + ix * (r - 0.5 - q * 0.9), ay = ey + iy * (r - 0.5 - q * 0.9);
      const lenK = (q === 0 ? 1.0 : 0.6) * r * (0.6 + 0.6 * k);
      const bx = ax + (vx / vl) * lenK - ix * off, by = ay + (vy / vl) * lenK - iy * off;
      paintLine(buf, ax, ay, bx, by, hm.sleeveD, 3, ga);
    }
    // a pull line: the fabric drawn from the crook up the upper arm toward its outer side (bent arms only)
    if (s >= 2.2 && bend > 1.0) {
      const ax = ex + ix * (r - 0.6), ay = ey + iy * (r - 0.6);
      const L1 = r * (1.1 + 0.5 * k);
      paintLine(buf, ax + (ux / ul) * r * 0.5, ay + (uy / ul) * r * 0.5, ax + (ux / ul) * L1 - ix * r * 0.55, ay + (uy / ul) * L1 - iy * r * 0.55, hm.sleeveD, 2, ga);
    }
  }
  // a soft crease where the forearm sleeve bunches above the hem
  if (s >= 2.7) {
    const t0 = 0.72;
    const cx = ex + vx * t0, cy = ey + vy * t0;
    const nx = -vy / vl, ny = vx / vl;
    const rr = L.arm.rWrist * 1.05 * s;
    paintLine(buf, cx + nx * rr * 0.75, cy + ny * rr * 0.75, cx + nx * rr * 0.05 + (vx / vl) * 1.5, cy + ny * rr * 0.05 + (vy / vl) * 1.5, hm.sleeveD, 2, ga);
  }
}

/**
 * The top of the sleeve where it leaves the shoulder, painted in the JACKET's group so it merges with
 * the torso: only pixels the torso does not already cover, kept flat-lit (never the highlight tone).
 */
function shoulderCap(buf, ax, ay, bx, by, r, m, g) {
  const W = buf.w;
  const x0 = Math.max(1, Math.floor(Math.min(ax, bx) - r)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + r) + 1);
  const y0 = Math.max(1, Math.floor(Math.min(ay, by) - r)), y1 = Math.min(buf.h - 1, Math.ceil(Math.max(ay, by) + r) + 1);
  if (x1 <= x0 || y1 <= y0) return;
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1e-6;
  const { mat, tone, grp, z } = buf;
  let zj = 8;
  for (let y = y0; y < y1; y++) {
    const cy = y + 0.5;
    for (let x = x0; x < x1; x++) {
      const i = y * W + x;
      if (mat[i] && grp[i] === g) {
        zj = z[i];
        continue;
      }
      const cx = x + 0.5;
      let u = ((cx - ax) * dx + (cy - ay) * dy) / len2;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const ex = cx - (ax + dx * u), ey = cy - (ay + dy * u);
      if (ex * ex + ey * ey > r * r) continue;
      if (mat[i] && grp[i] !== g && z[i] > zj) continue; // something already in front (hair, chin)
      mat[i] = m;
      const tt = toneN(m, ex / r, ey / r);
      tone[i] = tt < 1 ? 1 : tt;
      grp[i] = g;
      z[i] = zj;
    }
  }
  buf._touch(x0, y0, x1, y1);
}

/**
 * A continuous rim on the sleeve: pixel art reads a lit edge as a line, so where the silhouette steps
 * up to the right (no pixel above or to the upper right) the silver continues instead of breaking into
 * the dots the per-pixel rim leaves on a curved edge. Only against the background (empty pixels).
 */
function sleeveRim(buf, g, mSleeve, mRim) {
  const W = buf.w;
  const { mat, grp } = buf;
  for (let q = 0; q < edgeN; q++) {
    const i = EDGE_IDX[q];
    if (mat[i] !== mSleeve || grp[i] !== g) continue; // painted over since (the other bone, a crease)
    if (!mat[i + 1]) continue; // the resolve rim lights this one already
    if (!mat[i - W] && !mat[i - W + 1] && mat[i - 1]) {
      mat[i] = mRim;
      buf.tone[i] = 0;
    }
  }
}

/**
 * No rim on the underside: a sleeve silhouette pixel with nothing to its right AND nothing below faces
 * down-right, away from the key (upper left); the material's side rim would light it, and along a
 * sloping forearm that is one silver pixel per step, a dotted line. Those pixels take the same sleeve
 * tone without the rim (critic r2: rim only on the up- and right-facing silhouette).
 */
function underRim(buf, g, gTop, mSleeve, mNoRim) {
  const W = buf.w;
  const { mat, grp } = buf;
  for (let q = 0; q < downN; q++) {
    const i = DOWN_IDX[q];
    if (mat[i] !== mSleeve || (grp[i] !== g && grp[i] !== gTop)) continue;
    if (!mat[i + 1] && !mat[i + W]) mat[i] = mNoRim;
  }
}

/** Integer line painted only over pixels of group g (fabric creases). */
function paintLine(buf, ax, ay, bx, by, m, tone, g) {
  let x0 = Math.round(ax), y0 = Math.round(ay);
  const x1 = Math.round(bx), y1 = Math.round(by);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let n = 0; n < 64; n++) {
    buf.paint(x0, y0, m, tone, g);
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

// ---------------------------------------------------------------------------
// Hand rasteriser: a per-hand z-buffer in a local box, then details

const LW = 200, LH = 176; // local box (largest close-up hand fits with margin)
const OWN = new Int8Array(LW * LH); // -1 empty, 0 palm, 1 thumb, 2..5 index..pinky
const SEG = new Int8Array(LW * LH); // bone within the part (thumb 0 meta..2, fingers 0 prox..2)
const ZB = new Float32Array(LW * LH);
const TN = new Int8Array(LW * LH); // tone 0..3; 4 = line; 8+ = detail (decal tone = v - 8)
const UU = new Float32Array(LW * LH); // position along the bone 0..1
const VV = new Float32Array(LW * LH); // signed offset across the bone, -1..1
const LV = new Float32Array(LW * LH); // light value before it becomes a tone (form + silhouette passes)
const BT = new Int8Array(LW * LH); // the form tone of each pixel before lines and details (the clean-up reverts to it)
const P2 = new Float64Array(20 * 3); // projected joints: x, y, depth
const HULL_IN = new Float64Array(PALM_N * 4 + 4 + 16);
const HULL = new Float64Array(PALM_N * 4 + 8 + 16);
const ORDER = new Int32Array(PALM_N * 2 + 2 + 8);
const SEGSHADE = new Float64Array(20);
const EDGE = new Float64Array((PALM_N * 2 + 4 + 8) * 4);

let bx0 = 0, by0 = 0, bw = 0, bh = 0;

function rasterHand(buf, L, hm, g, B, s, gh, z) {
  const H = g.H;
  const J = g.J, R = g.R;
  // project joints (depth = body z, toward the camera)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < 20; i++) {
    const x = J[i * 3], y = J[i * 3 + 1], zz = J[i * 3 + 2];
    const X = px(B, x, y, zz), Y = py(B, x, y, zz);
    P2[i * 3] = X;
    P2[i * 3 + 1] = Y;
    P2[i * 3 + 2] = zz;
    const r = R[i] * s + 1;
    if (X - r < minX) minX = X - r;
    if (X + r > maxX) maxX = X + r;
    if (Y - r < minY) minY = Y - r;
    if (Y + r > maxY) maxY = Y + r;
  }
  // palm plate: both faces of the outline, convex hull
  const n = g.n;
  const th = PALM_THICK * H;
  for (let i = 0; i < PALM_N; i++) {
    const x = g.PO[i * 3], y = g.PO[i * 3 + 1], zz = g.PO[i * 3 + 2];
    for (let f = 0; f < 2; f++) {
      const sg = f === 0 ? th : -th;
      const X = px(B, x + n[0] * sg, y + n[1] * sg, zz + n[2] * sg), Y = py(B, x + n[0] * sg, y + n[1] * sg, zz + n[2] * sg);
      HULL_IN[(i * 2 + f) * 2] = X;
      HULL_IN[(i * 2 + f) * 2 + 1] = Y;
      if (X < minX) minX = X;
      if (X > maxX) maxX = X;
      if (Y < minY) minY = Y;
      if (Y > maxY) maxY = Y;
    }
  }
  // the web between thumb and index joins the palm while the thumb is out (not when it crosses the palm)
  let hullN = PALM_N * 2;
  if (g.curl[0] < 0.55) {
    const wk = 0.78;
    const x = J[48] + (J[51] - J[48]) * wk, y = J[49] + (J[52] - J[49]) * wk, zz = J[50] + (J[53] - J[50]) * wk;
    for (let f = 0; f < 2; f++) {
      const sg = f === 0 ? th * 0.8 : -th * 0.8;
      HULL_IN[hullN * 2] = px(B, x + n[0] * sg, y + n[1] * sg, zz + n[2] * sg);
      HULL_IN[hullN * 2 + 1] = py(B, x + n[0] * sg, y + n[1] * sg, zz + n[2] * sg);
      hullN++;
    }
  }
  // seen from the palm side, fingers curled into the palm close over it: the plate reaches their middle
  // joints, so a pointing or counting hand never shows a hole of background inside the curl
  if (!g.back) {
    for (let fi = 0; fi < 4; fi++) {
      if (g.curl[fi + 1] < 0.55) continue;
      for (let q = 1; q <= 2; q++) {
        const o = (fi * 4 + q) * 3;
        HULL_IN[hullN * 2] = px(B, J[o], J[o + 1], J[o + 2]);
        HULL_IN[hullN * 2 + 1] = py(B, J[o], J[o + 1], J[o + 2]);
        hullN++;
      }
    }
  }
  bx0 = Math.max(1, Math.floor(minX) - 1);
  by0 = Math.max(1, Math.floor(minY) - 1);
  const bx1 = Math.min(buf.w - 1, Math.ceil(maxX) + 2), by1 = Math.min(buf.h - 1, Math.ceil(maxY) + 2);
  bw = Math.min(LW, bx1 - bx0);
  bh = Math.min(LH, by1 - by0);
  if (bw <= 0 || bh <= 0) return;
  // ---- a hand that has not moved inside its own pixel box since the last frame (most frames: resting
  // on the papers, or held at a gesture's apex) reuses its raster. Everything below up to the write is a
  // pure function of the projected joints and palm, the hand frame, the shape and the scale, so the
  // slot keeps exactly those (positions relative to the box, ±RC_EPS px) and the finished OWN/TN window
  const slot = rasterSlot(L, g.side);
  const kn = rasterKey(g, B, s, hm.robot, hullN);
  if (slot.n === kn && slot.bw === bw && slot.bh === bh && sameKey(slot.key, kn)) {
    restoreRaster(slot);
    RASTER_STATS.hits++;
  } else {
    rasterPasses(L, hm, g, B, s, hullN);
    storeRaster(slot, kn);
    RASTER_STATS.misses++;
  }
  writeHand(buf, hm, s, gh, z);
}

// Raster cache: one slot per look and hand side (two-shots and singles show each look once). The key is
// every input of the raster passes: the projected joints (x, y relative to the box, depth), the palm
// hull, the projection basis, the hand frame, the shape channels and the scale, compared EXACTLY: the
// hand's inputs are snapped to a fine grid first (snapArm / snapBasis, at most 1/64 px of drift), so a hit
// and a miss give the same pixels and every frame is a pure function of the pose (critic r3: a ±0.02 px
// tolerance made a frame depend on the frames drawn before it). The slot's buffers grow once.
const RC_EPS = 0;
/** Cache counters (tests and the lab bench read them). */
export const RASTER_STATS = { hits: 0, misses: 0 };
const KEY = new Float64Array(20 * 3 + HULL_IN.length + 32);
const SLOTS = new WeakMap(); // look → [screen-left hand, screen-right hand]
function rasterSlot(L, side) {
  let pair = SLOTS.get(L);
  if (!pair) SLOTS.set(L, (pair = [newSlot(), newSlot()]));
  return pair[side > 0 ? 1 : 0];
}
function newSlot() {
  return { key: new Float64Array(KEY.length), n: -1, bw: 0, bh: 0, own: new Int8Array(0), tn: new Int8Array(0) };
}
function rasterKey(g, B, s, robot, hullN) {
  let k = 0;
  for (let i = 0; i < 20; i++) {
    KEY[k++] = P2[i * 3] - bx0;
    KEY[k++] = P2[i * 3 + 1] - by0;
    KEY[k++] = P2[i * 3 + 2];
  }
  for (let i = 0; i < hullN; i++) {
    KEY[k++] = HULL_IN[i * 2] - bx0;
    KEY[k++] = HULL_IN[i * 2 + 1] - by0;
  }
  for (let i = 2; i < 8; i++) KEY[k++] = B[i];
  for (let i = 0; i < 3; i++) {
    KEY[k++] = g.f[i];
    KEY[k++] = g.n[i];
    KEY[k++] = g.t[i];
  }
  for (let i = 0; i < 5; i++) KEY[k++] = g.curl[i];
  KEY[k++] = g.spread;
  KEY[k++] = g.H;
  KEY[k++] = g.back ? 1 : 0;
  KEY[k++] = robot ? 1 : 0;
  KEY[k++] = s;
  KEY[k++] = hullN;
  return k;
}
function sameKey(key, n) {
  for (let i = 0; i < n; i++) {
    const d = key[i] - KEY[i];
    if (d > RC_EPS || d < -RC_EPS) return false;
  }
  return true;
}
function storeRaster(slot, n) {
  for (let i = 0; i < n; i++) slot.key[i] = KEY[i];
  slot.n = n;
  slot.bw = bw;
  slot.bh = bh;
  if (slot.own.length < bw * bh) {
    slot.own = new Int8Array(bw * bh);
    slot.tn = new Int8Array(bw * bh);
  }
  // (plain loops: a subarray view per row would allocate every frame)
  const own = slot.own, tn = slot.tn;
  for (let j = 0, q = 0; j < bh; j++) {
    for (let i = 0, o = j * LW; i < bw; i++, o++, q++) {
      own[q] = OWN[o];
      tn[q] = TN[o];
    }
  }
}
function restoreRaster(slot) {
  const own = slot.own, tn = slot.tn;
  for (let j = 0, q = 0; j < bh; j++) {
    for (let i = 0, o = j * LW; i < bw; i++, o++, q++) {
      OWN[o] = own[q];
      TN[o] = tn[q];
    }
  }
}

/** The raster passes of a hand into the local window (OWN/TN, origin bx0/by0, size bw × bh). */
function rasterPasses(L, hm, g, B, s, hullN) {
  const J = g.J, R = g.R;
  for (let j = 0; j < bh; j++) {
    const o = j * LW;
    OWN.fill(-1, o, o + bw);
    ZB.fill(-1e9, o, o + bw);
  }

  const lod = s < 1.35 ? 0 : s < 2.7 ? 1 : s < 3.4 ? 2 : 3;
  HI_T = lod >= 3 ? 1.12 : lod === 2 ? 1.2 : 9;
  // per-finger tube shading only where a finger is wide enough to carry it
  BONE_GAIN = lod <= 1 ? 0.3 : lod === 2 ? 0.55 : 0.75;
  // a closed hand (fingers held together: steeple, grip, fist) below the close-up scale is shaded as one
  // mass: per-finger tube shading would stack into stripes along the fingers
  if (g.spread < 0.3 && lod <= 2) BONE_GAIN *= 0.4;
  BIAS_GAIN = lod <= 1 ? 0.5 : 1;
  ROBOT_JOINTS = hm.robot && s >= 2.2;
  const robot = hm.robot;
  const back = g.back;
  // per-bone shading bias: how much each phalanx's visible face turns toward or away from the key
  boneShades(g);

  // ---- palm
  const hn = hullOf(HULL_IN, hullN, HULL);
  rasterPalm(g, B, s, hn, lod);
  // ---- thumb and fingers, as tapered tubes
  const minR = lod === 0 ? 0.56 : 0.5;
  // thumb bones
  for (let k = 0; k < 3; k++) {
    const a = 16 + k, b = 17 + k;
    rasterBone(a, b, Math.max(minR, R[a] * s), Math.max(minR, R[b] * s), 1, k, SEGSHADE[b], s);
  }
  const tipK = robot ? 1.18 : 1; // UNIT-8's fingertips are squared-off segments, not tapered
  for (let fi = 0; fi < 4; fi++) {
    for (let k = 0; k < 3; k++) {
      const a = fi * 4 + k, b = a + 1;
      // in the wide the extended index of a point must survive as a clean 1 px line
      const mr = lod === 0 && fi === 0 && g.curl[1] < 0.4 ? 0.72 : minR;
      rasterBone(a, b, Math.max(mr, R[a] * s), Math.max(mr, R[b] * s * (k === 2 ? tipK : 1)), 2 + fi, k, SEGSHADE[b], s);
    }
  }

  // ---- round the fingertips: a square corner on a tip at least 4 px across loses its pixel (manual AA)
  if (lod >= 2 && !robot) roundTips();
  // ---- tones: the bones' own tube shading, then the hand shaded as ONE form from its silhouette
  // (lit upper-left edge, shaded lower-right edge), so small hands read as a mass, not as stripes
  formTones(lod);
  // ---- finish
  if (lod >= 1) separations(g, robot, lod, s);
  // the medium shot's closed hands (resting, gripping): finger rhythm from notches in the contour
  if (lod === 1 && s >= 1.9 && !robot && SEP_CLOSED) fingerNotches();
  if (lod >= 1 && !robot) contactShadow();
  if (lod >= 2) details(g, B, s, lod, robot, back);
  // ---- clean clusters (owner 17:50 "no noise"): no lone detail, line or highlight pixel survives, and a
  // separation broken into dashes is joined into one line
  if (lod >= 1) cleanClusters();
}

/** Write the finished local raster into the PartBuffer (outline and shadow against the face skin). */
function writeHand(buf, hm, s, gh, z) {
  // ---- write into the PartBuffer
  const W = buf.w;
  const { mat, tone, grp, z: zbuf } = buf;
  const mSkin = hm.skin, mLine = hm.line, mDet = hm.detail;
  // the face, ears and neck of this presenter: a hand over them must not melt into the same skin ramp
  const gb = gh - (gh % GROUPS_PER_ACTOR);
  const gHead = gb + GROUPS.head, gEars = gb + GROUPS.ears, gNeck = gb + GROUPS.neck;
  let overSkin = false;
  let tx0 = LW, ty0 = LH, tx1 = 0, ty1 = 0;
  for (let j = 0; j < bh; j++) {
    const o = j * LW;
    const row = (by0 + j) * W + bx0;
    for (let i = 0; i < bw; i++) {
      if (OWN[o + i] < 0) continue;
      let v = TN[o + i];
      const k = row + i;
      // against skin (over it, or next to it), the hand's silhouette is a continuous outline (detail
      // pixels included): the same skin ramp must never let the fingers melt into the face or neck
      if (!hm.robot) {
        const kk = o + i;
        const edge = i === 0 || j === 0 || i === bw - 1 || j === bh - 1 || OWN[kk - 1] < 0 || OWN[kk + 1] < 0 || OWN[kk - LW] < 0 || OWN[kk + LW] < 0;
        if (mat[k] && (grp[k] === gHead || grp[k] === gEars || grp[k] === gNeck)) {
          overSkin = true;
          if (edge) v = 4;
        } else if (edge && v !== 4) {
          for (let q = 0; q < 4; q++) {
            // only the sides where the hand ends (a hand pixel there is not written yet: skin under it)
            const inside = q === 0 ? i > 0 && OWN[kk - 1] >= 0 : q === 1 ? i < bw - 1 && OWN[kk + 1] >= 0 : q === 2 ? j > 0 && OWN[kk - LW] >= 0 : j < bh - 1 && OWN[kk + LW] >= 0;
            if (inside) continue;
            const nk = q === 0 ? k - 1 : q === 1 ? k + 1 : q === 2 ? k - W : k + W;
            const g2 = grp[nk];
            if (mat[nk] && (g2 === gHead || g2 === gEars || g2 === gNeck)) {
              v = 4;
              overSkin = true;
              break;
            }
          }
        }
      }
      if (v === 4) {
        mat[k] = mLine;
        tone[k] = 0;
      } else if (v >= 8) {
        mat[k] = mDet;
        tone[k] = v - 8;
      } else {
        mat[k] = mSkin;
        tone[k] = v;
      }
      grp[k] = gh;
      zbuf[k] = z;
      if (i < tx0) tx0 = i;
      if (i > tx1) tx1 = i;
      if (j < ty0) ty0 = j;
      if (j > ty1) ty1 = j;
    }
  }
  if (tx1 >= tx0) buf._touch(bx0 + tx0, by0 + ty0, bx0 + tx1 + 1, by0 + ty1 + 1);
  // the hand's shadow on the face: the key light is upper left, so the skin just right of and below the
  // hand turns one step darker (two pixels deep in the close-ups): it separates the hand from the face
  if (overSkin) faceShadow(buf, gh, gHead, gEars, gNeck, s >= 2.7 ? 2 : 1);
}

/** Darken skin of the head groups next to (right of / below) this hand's pixels (each pixel once). */
let STAMP = new Uint32Array(384 * 216);
let stampId = 0;
function faceShadow(buf, gh, gHead, gEars, gNeck, depth) {
  const W = buf.w;
  const { mat, tone, grp } = buf;
  const flags = MAT.flags;
  if (STAMP.length < W * buf.h) STAMP = new Uint32Array(W * buf.h); // a bigger lab buffer: once
  stampId = (stampId + 1) >>> 0 || 1;
  for (let j = 0; j < bh; j++) {
    const o = j * LW;
    for (let i = 0; i < bw; i++) {
      if (OWN[o + i] < 0) continue;
      for (let d = 1; d <= depth; d++) {
        for (let q = 0; q < 3; q++) {
          // right, below, below-right (the second ring only on the diagonal: a soft edge, not a slab)
          if (d === 2 && q !== 2) continue;
          const x = bx0 + i + (q === 1 ? 0 : d), y = by0 + j + (q === 0 ? 0 : d);
          if (x >= W - 1 || y >= buf.h - 1) continue;
          const k = y * W + x;
          const g = grp[k];
          if (!mat[k] || g === gh || (g !== gHead && g !== gEars && g !== gNeck) || flags[mat[k]] & 1 || STAMP[k] === stampId) continue;
          if (d === 2 && tone[k] >= 2) continue;
          STAMP[k] = stampId;
          tone[k] = Math.min(3, tone[k] + 1);
        }
      }
    }
  }
}

/** Shading bias per bone end joint from the bone's visible face normal (curled phalanges turn away from the key). */
function boneShades(g) {
  const f = g.f, n = g.n, t = g.t;
  for (let fi = 0; fi < 4; fi++) {
    const c = clamp(g.curl[fi + 1], -0.15, 1);
    const bends = [c >= 0 ? c * 1.45 : c * 0.5, c >= 0 ? c * 1.72 : c * 0.15, c >= 0 ? c * 1.05 : 0];
    let phi = 0;
    for (let k = 0; k < 3; k++) {
      phi += bends[k];
      const cp = Math.cos(phi), sp = Math.sin(phi);
      // palmar normal of this phalanx: -dir*sin + n*cos (dir ≈ f here)
      TMP2[0] = -f[0] * sp + n[0] * cp;
      TMP2[1] = -f[1] * sp + n[1] * cp;
      TMP2[2] = -f[2] * sp + n[2] * cp;
      if (TMP2[2] < 0) {
        TMP2[0] = -TMP2[0];
        TMP2[1] = -TMP2[1];
        TMP2[2] = -TMP2[2];
      }
      // (curled phalanges turn from the key, but stay a soft shade: a rounded mass, not a dark hole)
      SEGSHADE[fi * 4 + k + 1] = Math.max(-0.42, (dot3(TMP2, L3) - 0.45) * 0.55);
    }
  }
  // thumb: its pad faces roughly between t and n
  TMP2[0] = n[0] * 0.6 - t[0] * 0.5 + f[0] * 0.2;
  TMP2[1] = n[1] * 0.6 - t[1] * 0.5 + f[1] * 0.2;
  TMP2[2] = n[2] * 0.6 - t[2] * 0.5 + f[2] * 0.2;
  norm3(TMP2);
  if (TMP2[2] < 0) {
    TMP2[0] = -TMP2[0];
    TMP2[1] = -TMP2[1];
    TMP2[2] = -TMP2[2];
  }
  const ts = (dot3(TMP2, L3) - 0.45) * 0.5;
  SEGSHADE[17] = ts;
  SEGSHADE[18] = ts;
  SEGSHADE[19] = ts;
}

let BONE_GAIN = 0.82, BIAS_GAIN = 1;

/** Drop the outer corner pixel of fingertips that are ≥ 4 px wide in both directions (rounded tips). */
function roundTips() {
  for (let j = 1; j < bh - 1; j++) {
    const o = j * LW;
    for (let i = 1; i < bw - 1; i++) {
      const k = o + i;
      const a = OWN[k];
      if (a < 2 || SEG[k] !== 2 || UU[k] < 0.6) continue;
      for (let q = 0; q < 4; q++) {
        const dx = q & 1 ? 1 : -1, dy = q & 2 ? 1 : -1;
        // the two outside neighbours are empty, the inside runs on for two pixels each way
        if (OWN[k + dx] >= 0 || OWN[k + dy * LW] >= 0) continue;
        const i3 = i - 3 * dx, j3 = j - 3 * dy;
        if (i3 < 0 || i3 >= bw || j3 < 0 || j3 >= bh) continue;
        // 4 px across and 3 px along: narrower tips keep their corners (else they would turn into points)
        if (OWN[k - dx] !== a || OWN[k - 2 * dx] !== a || OWN[k - 3 * dx] !== a) continue;
        if (OWN[k - dy * LW] !== a || OWN[k - 2 * dy * LW] !== a || OWN[k - 3 * dy * LW] !== a) continue;
        OWN[k] = -1;
        break;
      }
    }
  }
}
const SIL_DARK = [0.62, 0.55, 0.38, 0.28]; // shade added on the silhouette edge away from the key, by LOD
const SIL_LIT = [0.22, 0.22, 0.18, 0.12];

/** Light values → tones, with the whole-hand silhouette term (empty neighbours toward / away from the key). */
function formTones(lod) {
  const dark = SIL_DARK[lod], lit = SIL_LIT[lod];
  for (let j = 0; j < bh; j++) {
    const o = j * LW;
    for (let i = 0; i < bw; i++) {
      const k = o + i;
      if (OWN[k] < 0) continue;
      let l = LV[k];
      // away from the key light (right, below): the form turns into shadow
      const r = i + 1 < bw ? OWN[k + 1] : -1, d = j + 1 < bh ? OWN[k + LW] : -1;
      const rd = i + 1 < bw && j + 1 < bh ? OWN[k + LW + 1] : -1;
      if (r < 0 || d < 0) l -= dark;
      else if (rd < 0) l -= dark * 0.5;
      // toward the key (left, above): a lit edge
      const lf = i > 0 ? OWN[k - 1] : -1, u = j > 0 ? OWN[k - LW] : -1;
      if (lf < 0 || u < 0) l += lit;
      let tn = toneOfL(l);
      // a highlight belongs on the hand's own silhouette where it faces the key light: inside a form (or
      // along every finger's edge) it reads as a scratch or a comb of dashes, so it drops to the base
      if (tn === 0 && lf >= 0 && u >= 0) tn = 1;
      TN[k] = tn;
      BT[k] = tn;
    }
  }
}

/** Tone from a light value: hi / base / shade / deep (hand-tuned thresholds, kept clean). */
let ROBOT_JOINTS = false; // UNIT-8: 1 px joint gaps from s 2.2 (CONTRACTS w2-cast-b)
let HI_T = 9; // highlight threshold for the current hand (by LOD: highlights only where there is room)
function toneOfL(l) {
  return l > HI_T ? 0 : l > 0.08 ? 1 : l > -0.5 ? 2 : 3;
}

function rasterBone(a, b, ra, rb, own, seg, bias, s) {
  const ax = P2[a * 3], ay = P2[a * 3 + 1], az = P2[a * 3 + 2];
  const bxx = P2[b * 3], byy = P2[b * 3 + 1], bz = P2[b * 3 + 2];
  const dx = bxx - ax, dy = byy - ay;
  const len2 = dx * dx + dy * dy;
  // a fingertip is blunt, not a dome: past the tip joint the cap is a superellipse 0.7 r deep (only
  // where the finger is wide enough to show it), so a 3-4 px finger ends in a 2-3 px top, never a point
  const blunt = seg === 2 && own >= 1 && rb >= 1.2 && len2 > 1e-9;
  const len = blunt ? Math.sqrt(len2) : 0;
  const capK = 1 / (0.7 * 0.7);
  const R = Math.max(ra, rb);
  const x0 = Math.max(0, Math.floor(Math.min(ax, bxx) - R) - bx0), x1 = Math.min(bw, Math.ceil(Math.max(ax, bxx) + R) + 1 - bx0);
  const y0 = Math.max(0, Math.floor(Math.min(ay, byy) - R) - by0), y1 = Math.min(bh, Math.ceil(Math.max(ay, byy) + R) + 1 - by0);
  const inv = len2 > 1e-9 ? 1 / len2 : 0;
  const invS = 1 / s;
  for (let j = y0; j < y1; j++) {
    const cy = by0 + j + 0.5;
    const o = j * LW;
    for (let i = x0; i < x1; i++) {
      const cx = bx0 + i + 0.5;
      const uRaw = ((cx - ax) * dx + (cy - ay) * dy) * inv;
      const u = uRaw < 0 ? 0 : uRaw > 1 ? 1 : uRaw;
      const r = ra + (rb - ra) * u;
      let ex = cx - (ax + dx * u), ey = cy - (ay + dy * u);
      let d2 = ex * ex + ey * ey;
      if (blunt && uRaw > 1) {
        const along = (uRaw - 1) * len;
        const ux = dx / len, uy = dy / len;
        const ax2 = ex - ux * along, ay2 = ey - uy * along; // across-axis remainder
        // superellipse (power 4): a squarer cap with rounded corners
        const ca = (along * along * capK) / (r * r), cb = (ax2 * ax2 + ay2 * ay2) / (r * r);
        const q = ca * ca + cb * cb;
        if (q > 1) continue;
        ex = ax2 + ux * along * 0.7;
        ey = ay2 + uy * along * 0.7;
        d2 = Math.sqrt(q) * r * r;
      } else if (d2 > r * r) continue;
      const depth = az + (bz - az) * u + Math.sqrt(r * r - d2) * invS * 0.6;
      const k = o + i;
      if (depth <= ZB[k]) continue;
      ZB[k] = depth;
      OWN[k] = own;
      SEG[k] = seg;
      UU[k] = u;
      // signed offset across the bone (for nails and creases)
      const side = (ex * dy - ey * dx) >= 0 ? 1 : -1;
      VV[k] = (side * Math.sqrt(d2)) / r;
      LV[k] = 0.5 + BONE_GAIN * ((ex * L2X + ey * L2Y) / r) + bias * BIAS_GAIN;
    }
  }
}

/** z of (a − o) × (b − o) for hull points o, a of `out` and the point (bx, by) (module level: no closure per call). */
function cross2(out, o, a, bx, by) {
  return (out[a * 2] - out[o * 2]) * (by - out[o * 2 + 1]) - (out[a * 2 + 1] - out[o * 2 + 1]) * (bx - out[o * 2]);
}

/** Convex hull (monotone chain) of n 2D points in `inp` into `out`; returns the vertex count (CCW in screen space). */
function hullOf(inp, n, out) {
  for (let i = 0; i < n; i++) ORDER[i] = i;
  // insertion sort by x then y (n ≤ 36)
  for (let i = 1; i < n; i++) {
    const v = ORDER[i];
    const vx = inp[v * 2], vy = inp[v * 2 + 1];
    let j = i - 1;
    while (j >= 0 && (inp[ORDER[j] * 2] > vx || (inp[ORDER[j] * 2] === vx && inp[ORDER[j] * 2 + 1] > vy))) {
      ORDER[j + 1] = ORDER[j];
      j--;
    }
    ORDER[j + 1] = v;
  }
  let k = 0;
  for (let i = 0; i < n; i++) {
    const x = inp[ORDER[i] * 2], y = inp[ORDER[i] * 2 + 1];
    while (k >= 2 && cross2(out, k - 2, k - 1, x, y) <= 0) k--;
    out[k * 2] = x;
    out[k * 2 + 1] = y;
    k++;
  }
  const lower = k + 1;
  for (let i = n - 2; i >= 0; i--) {
    const x = inp[ORDER[i] * 2], y = inp[ORDER[i] * 2 + 1];
    while (k >= lower && cross2(out, k - 2, k - 1, x, y) <= 0) k--;
    out[k * 2] = x;
    out[k * 2 + 1] = y;
    k++;
  }
  return Math.max(0, k - 1);
}

/** Palm (or back of the hand): plane depth, face shading from its normal, lit/shaded edges. */
function rasterPalm(g, B, s, hn, lod) {
  if (hn < 3) return;
  const n = g.n;
  // visible face normal and its light
  const sgn = n[2] >= 0 ? 1 : -1;
  const lFace = (n[0] * L3[0] + n[1] * L3[1] + n[2] * L3[2]) * sgn;
  // plane depth as an affine function of screen x, y from three palm points
  const W = g.W, f = g.f, t = g.t, H = g.H;
  const p0x = px(B, W[0], W[1], W[2]), p0y = py(B, W[0], W[1], W[2]);
  const ax3 = W[0] + f[0] * H * 0.5, ay3 = W[1] + f[1] * H * 0.5, az3 = W[2] + f[2] * H * 0.5;
  const bx3 = W[0] + t[0] * H * 0.4, by3 = W[1] + t[1] * H * 0.4, bz3 = W[2] + t[2] * H * 0.4;
  const p1x = px(B, ax3, ay3, az3) - p0x, p1y = py(B, ax3, ay3, az3) - p0y;
  const p2x = px(B, bx3, by3, bz3) - p0x, p2y = py(B, bx3, by3, bz3) - p0y;
  const det = p1x * p2y - p1y * p2x;
  let gx = 0, gy = 0;
  const dz1 = az3 - W[2], dz2 = bz3 - W[2];
  if (Math.abs(det) > 0.5) {
    gx = (dz1 * p2y - dz2 * p1y) / det;
    gy = (dz2 * p1x - dz1 * p2x) / det;
  }
  const zc = W[2] + PALM_THICK * H * Math.abs(n[2]) - 0.15; // the visible face; a hair behind finger roots
  // hull orientation, then per-edge unit normals (inside positive): no square roots per pixel
  let area = 0;
  for (let i = 0; i < hn; i++) {
    const j = (i + 1) % hn;
    area += HULL[i * 2] * HULL[j * 2 + 1] - HULL[j * 2] * HULL[i * 2 + 1];
  }
  const orient = area >= 0 ? 1 : -1;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let e = 0; e < hn; e++) {
    const e2 = e + 1 === hn ? 0 : e + 1;
    const ax = HULL[e * 2], ay = HULL[e * 2 + 1];
    const ex = HULL[e2 * 2] - ax, ey = HULL[e2 * 2 + 1] - ay;
    const el = Math.sqrt(ex * ex + ey * ey) || 1;
    // inside distance d = nx * x + ny * y + c
    const nx = (-orient * ey) / el, ny = (orient * ex) / el;
    EDGE[e * 4] = nx;
    EDGE[e * 4 + 1] = ny;
    EDGE[e * 4 + 2] = -(nx * ax + ny * ay);
    EDGE[e * 4 + 3] = -nx * L2X - ny * L2Y; // outward normal · key light
    if (ax < minX) minX = ax;
    if (ax > maxX) maxX = ax;
    if (ay < minY) minY = ay;
    if (ay > maxY) maxY = ay;
  }
  const x0 = Math.max(0, Math.floor(minX) - bx0), x1 = Math.min(bw, Math.ceil(maxX) + 1 - bx0);
  const y0 = Math.max(0, Math.floor(minY) - by0), y1 = Math.min(bh, Math.ceil(maxY) + 1 - by0);
  const ew = lod >= 2 ? 1.6 : 1.05; // edge band width (px)
  // the plate's face: from its normal, but never the deep tone (a palm turned from the key is in soft
  // shade, not a black wedge: the palm-side point read as a dark triangle)
  const base = Math.max(0.1, 0.32 + lFace * 0.55);
  // Per row: the span inside the convex hull (from the edge equations, its two ends checked with the
  // exact per-pixel test), then each edge visits only the pixels of its edge band. Same result as
  // testing every edge at every pixel, at a fraction of the cost.
  for (let j = y0; j < y1; j++) {
    const cy = by0 + j + 0.5;
    const o = j * LW;
    let lo = x0, hi = x1 - 1;
    for (let e = 0; e < hn && lo <= hi; e++) {
      const nx = EDGE[e * 4], k = EDGE[e * 4 + 1] * cy + EDGE[e * 4 + 2];
      if (nx > 1e-9) lo = Math.max(lo, Math.ceil(-k / nx - bx0 - 0.5));
      else if (nx < -1e-9) hi = Math.min(hi, Math.floor(-k / nx - bx0 - 0.5));
      else if (k < 0) hi = lo - 1;
    }
    if (lo > hi) {
      // rounding can leave a one-pixel row out: test the candidate exactly
      if (lo === hi + 1 && hi >= x0 && insideHull(bx0 + hi + 0.5, cy, hn)) lo = hi;
      else if (lo === hi + 1 && lo < x1 && insideHull(bx0 + lo + 0.5, cy, hn)) hi = lo;
      else continue;
    }
    while (lo <= hi && !insideHull(bx0 + lo + 0.5, cy, hn)) lo++;
    while (hi >= lo && !insideHull(bx0 + hi + 0.5, cy, hn)) hi--;
    while (lo - 1 >= x0 && insideHull(bx0 + lo - 0.5, cy, hn)) lo--;
    while (hi + 1 < x1 && insideHull(bx0 + hi + 1.5, cy, hn)) hi++;
    if (lo > hi) continue;
    for (let i = lo; i <= hi; i++) {
      MDR[i] = 1e9;
      MELR[i] = 0;
    }
    for (let e = 0; e < hn; e++) {
      const nx = EDGE[e * 4], k = EDGE[e * 4 + 1] * cy + EDGE[e * 4 + 2], mel = EDGE[e * 4 + 3];
      let a = lo, b = hi;
      if (nx > 1e-9) b = Math.min(hi, Math.ceil((ew - k) / nx - bx0 - 0.5) + 1);
      else if (nx < -1e-9) a = Math.max(lo, Math.floor((ew - k) / nx - bx0 - 0.5) - 1);
      else if (k >= ew) continue;
      for (let i = a; i <= b; i++) {
        const d = nx * (bx0 + i + 0.5) + k;
        if (d < MDR[i]) {
          MDR[i] = d;
          MELR[i] = mel;
        }
      }
    }
    for (let i = lo; i <= hi; i++) {
      const cx = bx0 + i + 0.5;
      const depth = zc + gx * (cx - p0x) + gy * (cy - p0y);
      const k = o + i;
      if (depth <= ZB[k]) continue;
      ZB[k] = depth;
      OWN[k] = 0;
      SEG[k] = 0;
      UU[k] = 0;
      VV[k] = 0;
      let l = base;
      // form shading at the rim of the plate: shade where the edge turns from the key,
      // a lit edge only where it faces the key squarely
      const md = MDR[i], mel = MELR[i];
      if (md < ew) l += mel < 0 ? 0.95 * mel : mel > 0.72 ? 0.9 * mel : 0;
      LV[k] = l;
    }
  }
}
const MDR = new Float64Array(LW);
const MELR = new Float64Array(LW);

/** Is the pixel centre (cx, cy) inside the convex hull (every edge distance ≥ 0)? */
function insideHull(cx, cy, hn) {
  for (let e = 0; e < hn; e++) if (EDGE[e * 4] * cx + EDGE[e * 4 + 1] * cy + EDGE[e * 4 + 2] < 0) return false;
  return true;
}

/**
 * 1 px lines between parts that should read as separate: neighbouring fingers,
 * the thumb's free bones against the palm, curled fingers lying over the palm.
 * The line goes on the pixel BEHIND (or on the right/lower one at equal depth).
 */
function separations(g, robot, lod, s) {
  const curl = g.curl;
  // finger widths in px at this scale (a separation needs two fingers at least 2 px wide on either side,
  // or the hand turns into 1 px skin / 1 px line stripes), and whether the hand is closed (fingers held
  // together: a steeple, a fist, a grip read as one mass with its silhouette, not as a comb)
  for (let f = 0; f < 4; f++) FW[f] = 2 * FR[f] * g.H * s;
  SEP_CLOSED = g.spread < 0.3 && lod < 3;
  for (let j = 0; j < bh; j++) {
    const o = j * LW;
    for (let i = 0; i < bw; i++) {
      const k = o + i;
      const a = OWN[k];
      if (a < 0) continue;
      // right and down neighbours (each pair is visited once)
      for (let q = 0; q < 2; q++) {
        if (q === 0 ? i + 1 >= bw : j + 1 >= bh) continue;
        const kk = q === 0 ? k + 1 : k + LW;
        const b = OWN[kk];
        if (b < 0) continue;
        if (a === b) {
          // robot (UNIT-8): two segments per finger, a 1 px joint between proximal and middle bones
          // (the thumb too, between its two free bones: UNIT-8's thumb is segmented like its fingers)
          if (ROBOT_JOINTS && a > 1 && SEG[k] !== SEG[kk] && SEG[k] + SEG[kk] === 1) TN[SEG[k] > SEG[kk] ? k : kk] = 4;
          else if (ROBOT_JOINTS && a === 1 && SEG[k] !== SEG[kk] && SEG[k] + SEG[kk] === 3) TN[SEG[k] > SEG[kk] ? k : kk] = 4;
          continue;
        }
        if (!needsLine(a, b, k, kk, curl, lod)) continue;
        const za = ZB[k], zb = ZB[kk];
        const behind = Math.abs(za - zb) < 0.35 ? kk : za < zb ? k : kk;
        TN[behind] = robot ? 4 : lineCode(a, b, k, kk, lod);
      }
    }
  }
}

/**
 * How hard a separation reads: the dark line (4) where two fingers really part (toward the tips, the
 * thumb against the palm), the shade tone (8 + 2) where they still touch near the knuckles and on the
 * small hands of the medium shots, so a hand reads as one mass with fingers, never as a comb.
 */
function lineCode(a, b, k, kk, lod) {
  if (a > 1 && b > 1) {
    const u = Math.min(UU[k], UU[kk]);
    const seg = Math.min(SEG[k], SEG[kk]);
    if (lod <= 1) return seg >= 2 && u > 0.35 ? 4 : 8 + 2;
    return seg === 0 && u < 0.55 ? 8 + 2 : 4;
  }
  // a curled finger folded over the palm: a fold, not a gap, on the small hands
  if ((a === 0 || b === 0) && lod <= 1 && a + b > 1) return 8 + 2;
  return 4;
}

function needsLine(a, b, k, kk, curl, lod) {
  if (a > b) {
    const t = a;
    a = b;
    b = t;
    const tk = k;
    k = kk;
    kk = tk;
  }
  // a < b here; 0 palm, 1 thumb, 2..5 fingers
  if (a === 0 && ROBOT_JOINTS && b >= 2) return true; // the robot's knuckle joint between plate and finger
  if (a === 0) {
    if (b === 1) return SEG[kk] >= 1; // the thumb's metacarpal melts into the palm (thenar)
    // a curled finger over the palm (one fold line around the curled mass, wide enough to carry it)
    return curl[b - 1] >= 0.45 && SEG[kk] >= 1 && FW[b - 2] >= 2;
  }
  if (a === 1) return SEG[k] >= 1 || lod >= 2;
  // two fingers: both at least 2 px wide, and only where they really part (an open hand, or the close-up
  // scale); two curled fingers side by side are one mass
  if (FW[a - 2] < 2 || FW[b - 2] < 2) return false;
  if (SEP_CLOSED) return false;
  if (curl[a - 1] >= 0.45 && curl[b - 1] >= 0.45) return false;
  return SEG[k] + SEG[kk] >= 1 || UU[k] + UU[kk] > 0.7;
}
const FW = new Float64Array(4); // finger widths in px for the current hand
let SEP_CLOSED = false;

/**
 * Finger rhythm on a closed hand at the medium scale (critic r2: at 2-2.7 px per unit the resting hands
 * read as mittens): no full separation lines (a closed hand is one mass), but where two neighbouring
 * fingers meet, the pixel of the finger BEHIND turns one shade darker (sel-out in the skin's own shade),
 * and deep skin where the boundary reaches the silhouette, a small notch in the contour, so the
 * fingertips and knuckles read as a row of bumps.
 */
function fingerNotches() {
  for (let j = 1; j < bh - 1; j++) {
    const o = j * LW;
    for (let i = 1; i < bw - 1; i++) {
      const k = o + i;
      const a = OWN[k];
      if (a < 2 || TN[k] === 4 || TN[k] >= 8) continue;
      for (let q = 0; q < 2; q++) {
        const nb = q === 0 ? k + 1 : k + LW;
        const b = OWN[nb];
        if (b < 2 || b === a || TN[nb] === 4 || TN[nb] >= 8) continue;
        // not where they leave the back of the hand (the knuckle end of the proximal bones)
        if (SEG[k] + SEG[nb] < 1 && UU[k] + UU[nb] < 0.5) continue;
        const behind = Math.abs(ZB[k] - ZB[nb]) < 0.35 ? nb : ZB[k] < ZB[nb] ? k : nb;
        const sil = OWN[behind - 1] < 0 || OWN[behind + 1] < 0 || OWN[behind - LW] < 0 || OWN[behind + LW] < 0;
        TN[behind] = sil ? 7 : 6;
      }
    }
  }
  for (let j = 0; j < bh; j++) {
    const o = j * LW;
    for (let i = 0; i < bw; i++) {
      const k = o + i;
      if (TN[k] === 6) TN[k] = 8 + 2;
      else if (TN[k] === 7) TN[k] = 8 + 3;
    }
  }
}

/** The key light comes from the upper left: a palm pixel just below-right of a finger in front of it is in shadow. */
function contactShadow() {
  for (let j = bh - 1; j >= 1; j--) {
    const o = j * LW;
    for (let i = bw - 1; i >= 1; i--) {
      const k = o + i;
      if (OWN[k] !== 0 || TN[k] === 4) continue;
      const up = k - LW - 1;
      const ou = OWN[up];
      if (ou > 0 && ZB[up] > ZB[k] + 0.25 && TN[k] < 2) TN[k] = BT[k] = 2;
    }
  }
}

/** Close-up finish: knuckles, nails, joint creases, wrist crease, thenar crease (or robot pins). */
function details(g, B, s, lod, robot, back) {
  const J = g.J, R = g.R, curl = g.curl;
  // ---- per-bone pixel details
  for (let j = 0; j < bh; j++) {
    const o = j * LW;
    for (let i = 0; i < bw; i++) {
      const k = o + i;
      const a = OWN[k];
      if (a < 1 || TN[k] === 4 || TN[k] >= 8) continue;
      const sg = SEG[k], u = UU[k], v = VV[k];
      if (robot) continue;
      if (a >= 2) {
        const c = curl[a - 1];
        // nails: on the back view, the end of an extended finger wide enough to carry a 2 px nail
        // (no PIP creases: at these sizes they were 1 px specks across every finger)
        if (back && sg === 2 && c < 0.6 && u > 0.42 && Math.abs(v) < 0.62 && FW[a - 2] * TAPER[3] >= 2.6) TN[k] = 8 + (u > 0.9 && lod < 3 ? 1 : 0);
      } else if (a === 1) {
        if (back && sg === 2 && u > 0.45 && Math.abs(v) < 0.6 && curl[0] < 0.6) TN[k] = 8;
      }
    }
  }
  // ---- knuckles on the back of the hand: on a closed hand one continuous ridge across the four knuckles
  // (a lit row and the shade row under it); on an open hand at the close-up scale a 2 px arc per knuckle
  if (back) {
    let lx = -1, ly = -1;
    for (let fi = 0; fi < 4; fi++) {
      const q = fi * 4;
      // the top of the knuckle: the joint pushed to the back of the hand
      const r = R[q];
      const x3 = J[q * 3] - g.n[0] * r, y3 = J[q * 3 + 1] - g.n[1] * r, z3 = J[q * 3 + 2] - g.n[2] * r;
      const X = Math.floor(px(B, x3, y3, z3)) - bx0, Y = Math.floor(py(B, x3, y3, z3)) - by0;
      // the ridge runs between neighbouring curled fingers only (a pointing hand's index stays smooth)
      if (curl[fi + 1] >= 0.55) {
        if (lx >= 0) ridge(lx, ly, X, Y);
        lx = X;
        ly = Y;
      } else {
        lx = -1;
        if (lod >= 3 && FW[fi] >= 2.6) {
          setDetail(X, Y, 0, z3 - 0.6);
          setDetail(X + 1, Y, 0, z3 - 0.6);
        }
      }
    }
  } else if (!robot) {
    // wrist crease across the heel of the palm, then the thenar crease at the largest scales
    creaseLine(g, B, -0.15, 0.07, 0.14, 0.06);
    if (lod >= 3) {
      creaseLine(g, B, 0.15, 0.44, 0.07, 0.3);
      creaseLine(g, B, 0.07, 0.3, 0.06, 0.14);
    }
  }
  if (robot) {
    // knuckle pins: a dark dot on every MCP joint
    for (let fi = 0; fi < 4; fi++) {
      const q = fi * 4;
      const X = Math.floor(P2[q * 3]) - bx0, Y = Math.floor(P2[q * 3 + 1]) - by0;
      setDetail(X, Y, 3, ZB[Math.max(0, Math.min(bh - 1, Y)) * LW + Math.max(0, Math.min(bw - 1, X))] - 0.5);
    }
    // palm seam
    creaseLine(g, B, -0.17, 0.3, 0.19, 0.3, 3);
  }
}

/** Paint a detail tone at local (X, Y) if a hand pixel is there and is the visible surface. */
function setDetail(X, Y, tone, minDepth, onlyOwn = -1) {
  if (X < 0 || Y < 0 || X >= bw || Y >= bh) return;
  const k = Y * LW + X;
  if (OWN[k] < 0 || TN[k] === 4) return;
  if (onlyOwn >= 0 && OWN[k] !== onlyOwn) return;
  if (ZB[k] < minDepth) return;
  TN[k] = 8 + tone;
}

/** The knuckle ridge of a closed hand: a lit line between two knuckle tops and a shade line under it. */
function ridge(x0, y0, x1, y1) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let q = 0; q <= n; q++) {
    const X = Math.round(x0 + ((x1 - x0) * q) / n), Y = Math.round(y0 + ((y1 - y0) * q) / n);
    ridgePx(X, Y, 0);
    ridgePx(X, Y + 1, 2);
  }
}
function ridgePx(X, Y, tone) {
  if (X < 1 || Y < 1 || X >= bw - 1 || Y >= bh - 1) return;
  const k = Y * LW + X;
  // inside the hand only (never on its silhouette, which keeps the outline) and not over a line
  if (OWN[k] < 0 || TN[k] === 4 || OWN[k - 1] < 0 || OWN[k + 1] < 0 || OWN[k - LW] < 0 || OWN[k + LW] < 0) return;
  if (tone === 2 && TN[k] === 8) return; // the lit row wins where the ridge doubles back
  TN[k] = 8 + tone;
}

/**
 * Clusters, not specks: join 1 px gaps in a separation line, then revert every line, detail or
 * highlight pixel that has no 8-neighbour of its own kind to the pixel's form tone.
 */
function cleanClusters() {
  // 1. bridge one-pixel gaps between line pixels (along a row, a column or a diagonal), inside the hand
  for (let j = 1; j < bh - 1; j++) {
    const o = j * LW;
    for (let i = 1; i < bw - 1; i++) {
      const k = o + i;
      if (OWN[k] < 0 || TN[k] === 4) continue;
      if (OWN[k - 1] < 0 || OWN[k + 1] < 0 || OWN[k - LW] < 0 || OWN[k + LW] < 0) continue;
      if ((TN[k - 1] === 4 && TN[k + 1] === 4) || (TN[k - LW] === 4 && TN[k + LW] === 4) || (TN[k - LW - 1] === 4 && TN[k + LW + 1] === 4) || (TN[k - LW + 1] === 4 && TN[k + LW - 1] === 4)) TN[k] = 5; // 5 = bridged (counted as a line below)
    }
  }
  for (let j = 0; j < bh; j++) {
    const o = j * LW;
    for (let i = 0; i < bw; i++) if (TN[o + i] === 5) TN[o + i] = 4;
  }
  // 2. lone pixels go back to their form tone (a highlight to the base)
  for (let j = 0; j < bh; j++) {
    const o = j * LW;
    for (let i = 0; i < bw; i++) {
      const k = o + i;
      if (OWN[k] < 0) continue;
      const v = TN[k];
      if (v !== 4 && v < 8 && v !== 0) continue;
      let same = false;
      for (let dy = -1; dy <= 1 && !same; dy++) {
        const jj = j + dy;
        if (jj < 0 || jj >= bh) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const ii = i + dx;
          if (ii < 0 || ii >= bw) continue;
          const kk = k + dy * LW + dx;
          if (OWN[kk] >= 0 && TN[kk] === v) {
            same = true;
            break;
          }
        }
      }
      if (!same) TN[k] = v === 0 ? 1 : BT[k] === 0 ? 1 : BT[k];
    }
  }
}

/** A crease drawn on the palm plate between two palm-plane points [lateral, along] (fractions of H). */
function creaseLine(g, B, la0, al0, la1, al1, tone = 2) {
  const W = g.W, f = g.f, t = g.t, H = g.H, n = g.n;
  const sg = n[2] >= 0 ? PALM_THICK * H : -PALM_THICK * H;
  const x0 = W[0] + f[0] * al0 * H + t[0] * la0 * H + n[0] * sg, y0 = W[1] + f[1] * al0 * H + t[1] * la0 * H + n[1] * sg, z0 = W[2] + f[2] * al0 * H + t[2] * la0 * H + n[2] * sg;
  const x1 = W[0] + f[0] * al1 * H + t[0] * la1 * H + n[0] * sg, y1 = W[1] + f[1] * al1 * H + t[1] * la1 * H + n[1] * sg, z1 = W[2] + f[2] * al1 * H + t[2] * la1 * H + n[2] * sg;
  let X0 = Math.round(px(B, x0, y0, z0) - 0.5) - bx0, Y0 = Math.round(py(B, x0, y0, z0) - 0.5) - by0;
  const X1 = Math.round(px(B, x1, y1, z1) - 0.5) - bx0, Y1 = Math.round(py(B, x1, y1, z1) - 0.5) - by0;
  const dx = Math.abs(X1 - X0), dy = -Math.abs(Y1 - Y0);
  const sx = X0 < X1 ? 1 : -1, sy = Y0 < Y1 ? 1 : -1;
  let err = dx + dy;
  for (let q = 0; q < 64; q++) {
    if (X0 >= 0 && Y0 >= 0 && X0 < bw && Y0 < bh) {
      const k = Y0 * LW + X0;
      if (OWN[k] === 0 && TN[k] !== 4) TN[k] = 8 + tone;
    }
    if (X0 === X1 && Y0 === Y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      X0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      Y0 += sy;
    }
  }
}

/**
 * Draw one hand on its own (lab hand-shape sheets). Same rasteriser as drawArm.
 * @param side -1 screen-left arm, +1 screen-right arm
 */
export function drawHand(buf, L, m, arm, side, toS, s, gh, z) {
  const B = projBasis(toS, BASIS);
  const hm = handMats(L, m);
  buf.part(gh, z, false);
  handGeometry(L, snapArm(arm), side, HG);
  rasterHand(buf, L, hm, HG, snapBasis(B), s, gh, z);
}

// ---------------------------------------------------------------------------
// Snapped hand inputs (the raster cache's determinism): positions to 1/128 body unit, directions and shape
// channels to 1/4096, the projection origin to 1/128 px and its axes to 1/16384 px per unit: far below
// what a raster sampled at pixel centres can show, and the same pose always gives the same pixels.
const QARM = { wrist: [0, 0, 0], handDir: [0, 0, 1], hand: { curl: [0, 0, 0, 0, 0], spread: 0, facing: -1, sup: 0, pro: 1, palm: [0, -1, 0], palmW: 0 } };
const QB = new Float64Array(8);
const qz = (v, k) => Math.round(v * k) / k;
function snapArm(arm) {
  const h = arm.hand, q = QARM.hand;
  for (let i = 0; i < 3; i++) {
    QARM.wrist[i] = qz(arm.wrist[i], 128);
    QARM.handDir[i] = qz(arm.handDir[i], 4096);
  }
  for (let i = 0; i < 5; i++) q.curl[i] = qz(h.curl[i], 4096);
  q.spread = qz(h.spread || 0, 4096);
  q.facing = qz(h.facing, 4096);
  q.sup = qz(h.sup || 0, 4096);
  q.pro = h.pro == null ? null : qz(h.pro, 4096);
  q.palmW = h.palmW > 0 ? qz(h.palmW, 4096) : 0;
  if (h.palm) for (let i = 0; i < 3; i++) q.palm[i] = qz(h.palm[i], 4096);
  return QARM;
}
function snapBasis(B) {
  QB[0] = qz(B[0], 128);
  QB[1] = qz(B[1], 128);
  for (let i = 2; i < 8; i++) QB[i] = qz(B[i], 16384);
  return QB;
}

/** Hand-length of a look in rig units (props.js and the lab use it). */
export const handLength = (L) => L.arm.hand;
