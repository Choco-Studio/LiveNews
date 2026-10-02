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
// Sleeves are tapered tubes with an elbow fold, a slightly flared hem and a
// flat-ended shirt cuff that overlaps the wrist, so the hand comes OUT of
// the sleeve instead of being stuck on top of it.
//
// Draw order and groups inside drawArm (z is the arm's base depth from
// character.js; each arm owns z .. z+3):
//   sleeve (ga, z) → wrist skin (gh, z+1) → cuff (gc, z+2) → hand (gh, z+3)
// Only one hand group is used: the inner details are painted here, so the
// other hand groups (gh+1..gh+5) and the spare 28-29 stay free.
//
// No allocation per frame in the pixel loops: scratch buffers are module
// level and sized for the largest close-up.
import { P } from '../../palette.js';
import { TILT, clamp } from './space.js';
import { material, toneN } from './pixbuf.js';

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
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
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
  // REF: the direction "most toward the camera" perpendicular to f (the palm faces it at facing = 1);
  // when the hand points at the lens it blends toward "up" so it never flips
  REF[0] = -f[0] * f[2];
  REF[1] = -f[1] * f[2];
  REF[2] = 1 - f[2] * f[2];
  const rl = Math.hypot(REF[0], REF[1], REF[2]);
  if (rl < 0.35) {
    // "up" (0, -1, 0) made perpendicular to f, mixed in as f turns toward the lens
    const k = (0.35 - rl) / 0.35;
    REF[0] += f[0] * f[1] * k;
    REF[1] += (f[1] * f[1] - 1) * k;
    REF[2] += f[2] * f[1] * k;
  }
  norm3(REF);
  // WV: where the palm goes when it turns away from the camera (natural pronation: down and a little outward)
  WV[0] = -side * 0.35;
  WV[1] = 1;
  WV[2] = 0;
  let k = dot3(WV, f);
  WV[0] -= f[0] * k;
  WV[1] -= f[1] * k;
  WV[2] -= f[2] * k;
  k = dot3(WV, REF);
  WV[0] -= REF[0] * k;
  WV[1] -= REF[1] * k;
  WV[2] -= REF[2] * k;
  if (Math.hypot(WV[0], WV[1], WV[2]) < 1e-3) {
    cross3(f, REF, WV);
    WV[0] *= side;
    WV[1] *= side;
    WV[2] *= side;
  }
  norm3(WV);
  const facing = clamp(hd.facing, -1, 1);
  const sup = clamp(hd.sup || 0, 0, 1);
  const th = Math.acos(facing) * (1 - 2 * sup);
  const ct = Math.cos(th), st = Math.sin(th);
  n[0] = REF[0] * ct + WV[0] * st;
  n[1] = REF[1] * ct + WV[1] * st;
  n[2] = REF[2] * ct + WV[2] * st;
  norm3(n);
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
  const metal = L.mats?.metal ? m.metal : material('hands:robot', { ramp: [P.silver, P.fog, P.steel, P.slate], line: P.ink, th: [0.85, 0.1, -0.45] });
  h = {
    robot,
    skin: robot ? metal : m.hand,
    // exact colours for painted details (no clean-up pass, no inner lines)
    detail: robot ? material(`hands:robotD`, { ramp: [P.silver, P.fog, P.steel, P.slate], decal: true }) : material(`${L.id}:handD`, { ramp: L.skin, decal: true }),
    line: robot ? material('hands:robotLine', { ramp: [P.ink], decal: true }) : material(`${L.id}:handLine`, { ramp: [L.skinLine], decal: true }),
    sleeveD: material(`${L.id}:sleeveD`, { ramp: L.jacket.ramp, decal: true }),
    cuffD: material(`${L.id}:cuffD`, { ramp: [L.cuff, L.cuff, L.shirt.ramp[2], L.shirt.ramp[3]], decal: true }),
  };
  MATS.set(L, h);
  return h;
}

// ---------------------------------------------------------------------------
// Fast tapered capsule straight into the PartBuffer (sleeves, wrist): same
// shading as PartBuffer.capsule, but each row only visits the span of the
// capsule's oriented bounding box (a diagonal close-up arm costs ~1/3).

const SPAN = new Float64Array(8);
function capsuleFast(buf, ax, ay, bx, by, ra, rb, m, toneBias = 0) {
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy);
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
    for (let x = xs; x < xe; x++) {
      if (clip && y >= clipY[x]) continue;
      const cx = x + 0.5;
      let u = ((cx - ax) * dx + (cy - ay) * dy) / len2;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const r = ra + (rb - ra) * u;
      const ex = cx - (ax + dx * u), ey = cy - (ay + dy * u);
      const d2 = ex * ex + ey * ey;
      if (d2 > r * r) continue;
      const i = y * W + x;
      mat[i] = m;
      const tt = toneN(m, ex / r, ey / r) + toneBias;
      tone[i] = tt < 0 ? 0 : tt > 3 ? 3 : tt;
      grp[i] = g;
      z[i] = cz;
    }
  }
}

/** Flat-ended tapered quad (the shirt cuff): a ring of fabric, flat at the wrist end. */
const QUAD = new Float64Array(12);
function cuffQuad(buf, ax, ay, bx, by, ra, rb, m) {
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1e-6;
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
  buf.poly(QUAD, m, (x, y) => {
    const ex = x + 0.5 - ax, ey = y + 0.5 - ay;
    const v = (ex * nx + ey * ny) / Math.max(0.5, ra); // -1..1 across
    const l = 0.45 + 0.85 * v * (nx * L2X + ny * L2Y);
    return l > 1.05 ? 0 : l > 0.0 ? 1 : 2;
  });
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

  // ---- sleeve: upper arm and forearm (one group, so the elbow is one continuous tube)
  buf.part(ga, z, false);
  capsuleFast(buf, sxp, syp, exp, eyp, A.rUpper * s, A.rElbow * s, m.sleeve);
  const fx = wxp - exp, fy = wyp - eyp;
  const fl = Math.hypot(fx, fy) || 1;
  const cuffLen = Math.min(fl * 0.4, 1.3 * s); // shirt cuff showing past the jacket sleeve
  const hemX = wxp - (fx / fl) * cuffLen, hemY = wyp - (fy / fl) * cuffLen;
  capsuleFast(buf, exp, eyp, hemX, hemY, A.rElbow * s, A.rWrist * 1.12 * s, m.sleeve);
  if (s >= 1.6) sleeveFolds(buf, L, hm, arm, sxp, syp, exp, eyp, hemX, hemY, s, ga);

  // ---- wrist skin, under the cuff (same group as the hand: no line between them)
  buf.part(gh, z + 1, false);
  const hd = arm.handDir;
  const H = A.hand;
  const wx2 = px(B, arm.wrist[0] + hd[0] * H * 0.1, arm.wrist[1] + hd[1] * H * 0.1, arm.wrist[2] + hd[2] * H * 0.1);
  const wy2 = py(B, arm.wrist[0] + hd[0] * H * 0.1, arm.wrist[1] + hd[1] * H * 0.1, arm.wrist[2] + hd[2] * H * 0.1);
  const rw = Math.max(0.6, A.rWrist * 0.78 * s);
  if (hm.robot) capsuleFast(buf, hemX, hemY, wx2, wy2, rw * 0.8, rw * 0.8, hm.skin, 1);
  else capsuleFast(buf, hemX, hemY, wx2, wy2, rw, rw * 0.92, hm.skin);

  // ---- shirt cuff over the wrist
  buf.part(gc, z + 2, false);
  if (s < 1.2) capsuleFast(buf, hemX, hemY, wxp, wyp, A.rWrist * 0.98 * s, A.rWrist * 0.9 * s, m.cuff);
  else cuffQuad(buf, hemX, hemY, wxp, wyp, A.rWrist * 1.02 * s, A.rWrist * 0.95 * s, m.cuff);

  // ---- the hand
  handGeometry(L, arm, side, HG);
  rasterHand(buf, L, hm, HG, B, s, gh, z + 3);
}

/**
 * Fabric at the elbow: when the arm bends, a fold on the inside of the elbow
 * (1-2 short dark creases) and a lit point on the outside; a soft crease near
 * the hem at close-up scales. Painted with the jacket's exact colours.
 */
function sleeveFolds(buf, L, hm, arm, sx, sy, ex, ey, hx, hy, s, ga) {
  S3[0] = arm.shoulder[0] - arm.elbow[0];
  S3[1] = arm.shoulder[1] - arm.elbow[1];
  S3[2] = arm.shoulder[2] - arm.elbow[2];
  E3[0] = arm.wrist[0] - arm.elbow[0];
  E3[1] = arm.wrist[1] - arm.elbow[1];
  E3[2] = arm.wrist[2] - arm.elbow[2];
  const c = dot3(S3, E3) / ((Math.hypot(S3[0], S3[1], S3[2]) * Math.hypot(E3[0], E3[1], E3[2])) || 1);
  const bend = Math.PI - Math.acos(clamp(c, -1, 1)); // 0 = straight
  const ux = sx - ex, uy = sy - ey, vx = hx - ex, vy = hy - ey;
  const ul = Math.hypot(ux, uy) || 1, vl = Math.hypot(vx, vy) || 1;
  // inner side of the elbow on screen: between the two bones
  let ix = ux / ul + vx / vl, iy = uy / ul + vy / vl;
  const il = Math.hypot(ix, iy);
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
    // the outer elbow catches the key light when it points up/left
    if (s >= 2.7) {
      const ox = Math.round(ex - ix * (r - 0.8)), oy = Math.round(ey - iy * (r - 0.8));
      if (-ix * L2X - iy * L2Y > 0.2) buf.paint(ox, oy, hm.sleeveD, 0, ga);
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
const P2 = new Float64Array(20 * 3); // projected joints: x, y, depth
const HULL_IN = new Float64Array(PALM_N * 4 + 4);
const HULL = new Float64Array(PALM_N * 4 + 8);
const ORDER = new Int32Array(PALM_N * 2 + 2);
const SEGSHADE = new Float64Array(20);

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
  bx0 = Math.max(1, Math.floor(minX) - 1);
  by0 = Math.max(1, Math.floor(minY) - 1);
  const bx1 = Math.min(buf.w - 1, Math.ceil(maxX) + 2), by1 = Math.min(buf.h - 1, Math.ceil(maxY) + 2);
  bw = Math.min(LW, bx1 - bx0);
  bh = Math.min(LH, by1 - by0);
  if (bw <= 0 || bh <= 0) return;
  for (let j = 0; j < bh; j++) {
    const o = j * LW;
    OWN.fill(-1, o, o + bw);
    ZB.fill(-1e9, o, o + bw);
  }

  const lod = s < 1.35 ? 0 : s < 2.7 ? 1 : s < 3.4 ? 2 : 3;
  HI_T = lod >= 3 ? 1.12 : lod === 2 ? 1.2 : 9;
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
  for (let fi = 0; fi < 4; fi++) {
    for (let k = 0; k < 3; k++) {
      const a = fi * 4 + k, b = a + 1;
      // in the wide the extended index of a point must survive as a clean 1 px line
      const mr = lod === 0 && fi === 0 && g.curl[1] < 0.4 ? 0.72 : minR;
      rasterBone(a, b, Math.max(mr, R[a] * s), Math.max(mr, R[b] * s), 2 + fi, k, SEGSHADE[b], s);
    }
  }

  // ---- finish
  if (lod >= 1) separations(g, robot, lod);
  if (lod >= 1 && !robot) contactShadow();
  if (lod >= 2) details(g, B, s, lod, robot, back);

  // ---- write into the PartBuffer
  const W = buf.w;
  const { mat, tone, grp, z: zbuf } = buf;
  const mSkin = hm.skin, mLine = hm.line, mDet = hm.detail;
  let tx0 = LW, ty0 = LH, tx1 = 0, ty1 = 0;
  for (let j = 0; j < bh; j++) {
    const o = j * LW;
    const row = (by0 + j) * W + bx0;
    for (let i = 0; i < bw; i++) {
      if (OWN[o + i] < 0) continue;
      const v = TN[o + i];
      const k = row + i;
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
      SEGSHADE[fi * 4 + k + 1] = (dot3(TMP2, L3) - 0.45) * 0.55;
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

/** Tone from a light value: hi / base / shade / deep (hand-tuned thresholds, kept clean). */
let HI_T = 9; // highlight threshold for the current hand (by LOD: highlights only where there is room)
function toneOfL(l) {
  return l > HI_T ? 0 : l > 0.08 ? 1 : l > -0.5 ? 2 : 3;
}

function rasterBone(a, b, ra, rb, own, seg, bias, s) {
  const ax = P2[a * 3], ay = P2[a * 3 + 1], az = P2[a * 3 + 2];
  const bxx = P2[b * 3], byy = P2[b * 3 + 1], bz = P2[b * 3 + 2];
  const dx = bxx - ax, dy = byy - ay;
  const len2 = dx * dx + dy * dy;
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
      let u = ((cx - ax) * dx + (cy - ay) * dy) * inv;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const r = ra + (rb - ra) * u;
      const ex = cx - (ax + dx * u), ey = cy - (ay + dy * u);
      const d2 = ex * ex + ey * ey;
      if (d2 > r * r) continue;
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
      const l = 0.5 + 0.82 * ((ex * L2X + ey * L2Y) / r) + bias;
      TN[k] = toneOfL(l);
    }
  }
}

/** Convex hull (monotone chain) of n 2D points in `inp` into `out`; returns the vertex count (CCW in screen space). */
function hullOf(inp, n, out) {
  for (let i = 0; i < n; i++) ORDER[i] = i;
  // insertion sort by x then y (n ≤ 26)
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
  const cross = (o, a, bx, by) => (out[a * 2] - out[o * 2]) * (by - out[o * 2 + 1]) - (out[a * 2 + 1] - out[o * 2 + 1]) * (bx - out[o * 2]);
  for (let i = 0; i < n; i++) {
    const x = inp[ORDER[i] * 2], y = inp[ORDER[i] * 2 + 1];
    while (k >= 2 && cross(k - 2, k - 1, x, y) <= 0) k--;
    out[k * 2] = x;
    out[k * 2 + 1] = y;
    k++;
  }
  const lower = k + 1;
  for (let i = n - 2; i >= 0; i--) {
    const x = inp[ORDER[i] * 2], y = inp[ORDER[i] * 2 + 1];
    while (k >= lower && cross(k - 2, k - 1, x, y) <= 0) k--;
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
  // hull bbox
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < hn; i++) {
    const x = HULL[i * 2], y = HULL[i * 2 + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const x0 = Math.max(0, Math.floor(minX) - bx0), x1 = Math.min(bw, Math.ceil(maxX) + 1 - bx0);
  const y0 = Math.max(0, Math.floor(minY) - by0), y1 = Math.min(bh, Math.ceil(maxY) + 1 - by0);
  const ew = lod >= 2 ? 1.6 : 1.05; // edge band width (px)
  // hull orientation: sign of the area
  let area = 0;
  for (let i = 0; i < hn; i++) {
    const j = (i + 1) % hn;
    area += HULL[i * 2] * HULL[j * 2 + 1] - HULL[j * 2] * HULL[i * 2 + 1];
  }
  const orient = area >= 0 ? 1 : -1;
  for (let j = y0; j < y1; j++) {
    const cy = by0 + j + 0.5;
    const o = j * LW;
    for (let i = x0; i < x1; i++) {
      const cx = bx0 + i + 0.5;
      let inside = true, md = 1e9, mnx = 0, mny = 0;
      for (let e = 0; e < hn; e++) {
        const e2 = e + 1 === hn ? 0 : e + 1;
        const ax = HULL[e * 2], ay = HULL[e * 2 + 1];
        const ex = HULL[e2 * 2] - ax, ey = HULL[e2 * 2 + 1] - ay;
        const el = Math.hypot(ex, ey) || 1;
        // signed distance to the edge line, positive inside
        const d = (orient * (ex * (cy - ay) - ey * (cx - ax))) / el;
        if (d < 0) {
          inside = false;
          break;
        }
        if (d < md) {
          md = d;
          // outward normal of this edge
          mnx = (orient * ey) / el;
          mny = (-orient * ex) / el;
        }
      }
      if (!inside) continue;
      const depth = zc + gx * (cx - p0x) + gy * (cy - p0y);
      const k = o + i;
      if (depth <= ZB[k]) continue;
      ZB[k] = depth;
      OWN[k] = 0;
      SEG[k] = 0;
      UU[k] = 0;
      VV[k] = 0;
      let l = 0.32 + lFace * 0.55;
      if (md < ew) {
        // form shading at the rim of the plate: shade where the edge turns from the key,
        // a lit edge only where it faces the key squarely
        const el = mnx * L2X + mny * L2Y;
        l += el < 0 ? 0.95 * el : el > 0.72 ? 0.9 * el : 0;
      }
      TN[k] = toneOfL(l);
    }
  }
}

/**
 * 1 px lines between parts that should read as separate: neighbouring fingers,
 * the thumb's free bones against the palm, curled fingers lying over the palm.
 * The line goes on the pixel BEHIND (or on the right/lower one at equal depth).
 */
function separations(g, robot, lod) {
  const curl = g.curl;
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
          // robot: every bone is its own segment
          if (robot && a > 0 && SEG[k] !== SEG[kk]) TN[SEG[k] > SEG[kk] ? k : kk] = 4;
          continue;
        }
        if (!needsLine(a, b, k, kk, curl, lod)) continue;
        const za = ZB[k], zb = ZB[kk];
        const behind = Math.abs(za - zb) < 0.35 ? kk : za < zb ? k : kk;
        TN[behind] = 4;
      }
    }
  }
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
  if (a === 0) {
    if (b === 1) return SEG[kk] >= 1; // the thumb's metacarpal melts into the palm (thenar)
    return curl[b - 1] >= 0.45 && SEG[kk] >= 1; // a curled finger over the palm
  }
  if (a === 1) return SEG[k] >= 1 || lod >= 2;
  // two fingers: only where both are past the webbing
  return SEG[k] + SEG[kk] >= 1 || UU[k] + UU[kk] > 0.7;
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
      if (ou > 0 && ZB[up] > ZB[k] + 0.25 && TN[k] < 2) TN[k] = 2;
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
        // nails: on the back view, the end of an extended finger
        if (back && sg === 2 && c < 0.6 && u > 0.42 && Math.abs(v) < 0.62) TN[k] = 8 + (u > 0.9 && lod < 3 ? 1 : 0);
        // PIP crease across an extended finger (both sides of the hand)
        else if (lod >= 3 && sg === 1 && u < 0.14 && c < 0.5 && Math.abs(v) < 0.75 && TN[k] < 2) TN[k] = 8 + 2;
      } else if (a === 1) {
        if (back && sg === 2 && u > 0.45 && Math.abs(v) < 0.6 && curl[0] < 0.6) TN[k] = 8;
      }
    }
  }
  // ---- knuckles on the back of the hand: a lit pixel and its shadow, bigger on a fist
  if (back) {
    for (let fi = 0; fi < 4; fi++) {
      const c = curl[fi + 1];
      if (c < 0.3 && lod < 3) continue;
      const q = fi * 4;
      // the top of the knuckle: the joint pushed to the back of the hand
      const r = R[q];
      const x3 = J[q * 3] - g.n[0] * r, y3 = J[q * 3 + 1] - g.n[1] * r, z3 = J[q * 3 + 2] - g.n[2] * r;
      const X = Math.floor(px(B, x3, y3, z3)) - bx0, Y = Math.floor(py(B, x3, y3, z3)) - by0;
      setDetail(X, Y, 0, z3 - 0.6);
      if (c >= 0.55) setDetail(X + 1, Y + 1, 2, z3 - 1.2);
    }
    // wrist bone (ulnar side)
    const W = g.W, t = g.t, f = g.f, H = g.H;
    const x3 = W[0] - t[0] * H * 0.16 + f[0] * H * 0.04, y3 = W[1] - t[1] * H * 0.16 + f[1] * H * 0.04, z3 = W[2] - t[2] * H * 0.16 + f[2] * H * 0.04;
    setDetail(Math.floor(px(B, x3, y3, z3)) - bx0, Math.floor(py(B, x3, y3, z3)) - by0, 0, -1e9, 0);
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
  handGeometry(L, arm, side, HG);
  rasterHand(buf, L, hm, HG, B, s, gh, z);
}

/** Hand-length of a look in rig units (props.js and the lab use it). */
export const handLength = (L) => L.arm.hand;
