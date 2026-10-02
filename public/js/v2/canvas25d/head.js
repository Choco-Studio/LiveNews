// Head geometry and skin for the canvas25d rig (owner: FACES stream).
//
// The head is an implicit shape in head-local units (origin at the head
// centre, y down): a cranium circle, cheeks and a jaw curve (headHW). Yaw and
// pitch are not rotations of a bitmap: features are pushed around the head's
// curve by faceX(), so a turn slides the far eye in and moves the hairline
// and chin with it. headFrame() maps head-local units to screen pixels (with
// roll), snapping the origin so a still head is a still picture.
//
// Skin (wave 2): the face is lit like a sculpted head, not a two-tone disc.
// Each look gets a small normal map in feature space (built once): the
// skull's curve plus the facial planes a portrait painter blocks in first
// (brow ridge, eye sockets, cheekbones, nose bridge, tip and wings, the
// muzzle round the mouth, lips, the groove under the lower lip, chin,
// temples) and a little occlusion in the creases. Every pixel turns its normal
// by the head's yaw, pitch and roll and is lit by the key light (upper front,
// camera-left), so the shadow side bites into the socket, is pushed out by
// the cheekbone, comes back along the jaw and falls under the nose and lip
// as the head turns. Four tones of the look's own skin ramp, clean clusters,
// no dithering; the wide shot keeps a simple lit/shade read.
//
// Presenter files (cast/<id>.js) only provide parameters (L.head, L.ears,
// skin ramps); a presenter that is not human (UNIT-8) replaces drawHead /
// drawFace through its look's `parts.head` / `parts.face` hooks.
import { clamp } from './space.js';
import { LIGHT } from './pixbuf.js';

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

/** Inverse of faceX for an approximate feature-space x (used by facial hair). */
export function faceInverse(H, x, y, yaw) {
  if (!yaw) return x;
  const hw = Math.max(1, headHW(H, y, 0));
  const a = Math.asin(clamp(x / hw, -0.99, 0.99)) - yaw;
  return hw * Math.sin(a);
}

// ---------------------------------------------------------------------------
// Head frame: head-local units → screen, with roll; yaw/pitch handled by faceX

/** The jaw never drops more than this many screen pixels (calm speech at every scale). */
export const JAW_MAX_PX = 2;

export function headFrame(L, sk, toS, s) {
  const h = sk.head;
  const [hx, hy] = toS(L.headAt[0] + h.x, L.headAt[1] + h.y);
  const roll = h.roll;
  const cr = Math.cos(roll), sr = Math.sin(roll);
  // snap the head origin so a still head is a still picture
  const cx = Math.round(hx), cy = Math.round(hy);
  return {
    L,
    cx,
    cy,
    s,
    roll,
    cr,
    sr,
    yaw: h.yaw,
    pitch: h.pitch,
    // units; capped so the chin travels at most JAW_MAX_PX on screen
    jaw: Math.max(0, Math.min(sk.face.jaw || 0, JAW_MAX_PX / s)),
    toScreen(x, y) {
      return [cx + s * (x * cr - y * sr), cy + s * (x * sr + y * cr)];
    },
    toLocal(px, py) {
      const dx = px - cx, dy = py - cy;
      return [(dx * cr + dy * sr) / s, (-dx * sr + dy * cr) / s];
    },
    // Allocation-free variants for per-pixel loops (same maths; `out` is a
    // caller-owned 2-element array). toScreen/toLocal keep their [x, y] return
    // value because cast files destructure it (CONTRACTS "head frame").
    toScreenInto(x, y, out) {
      out[0] = cx + s * (x * cr - y * sr);
      out[1] = cy + s * (x * sr + y * cr);
      return out;
    },
    toLocalInto(px, py, out) {
      const dx = px - cx, dy = py - cy;
      out[0] = (dx * cr + dy * sr) / s;
      out[1] = (-dx * sr + dy * cr) / s;
      return out;
    },
  };
}

/** Screen-pixel box that holds the head plus `pad` units (for implicit shapes). */
export function headBox(head, pad) {
  const H = head.L.head;
  const r = (Math.max(H.R, H.cheekHW) + pad) * head.s;
  const top = (H.top - pad) * head.s, bot = (H.chinY + 2 + pad) * head.s;
  const ext = Math.max(r, Math.abs(top), Math.abs(bot));
  return [head.cx - ext - 1, head.cy - ext - 1, head.cx + ext + 1, head.cy + ext + 1];
}

// ---------------------------------------------------------------------------
// The facial-plane normal map (feature space, yaw 0), one per look

const STEP = 0.125; // units per cell (≤ 0.5 px at s = 4)
const MAPS = new WeakMap();

/** Gaussian bump list for a look: [cx, cy, sx, sy, amp] (height, units). */
function bumpsOf(L) {
  const H = L.head, E = L.eyes, B = L.brows, N = L.nose, M = L.mouth;
  const ex = E.x, ey = E.y, nw = N.w;
  const out = [];
  const pair = (x, y, sx, sy, a) => out.push([-x, y, sx, sy, a], [x, y, sx, sy, a]);
  pair(ex, B.y + 0.6, 1.9, 0.75, 0.42); // brow ridge over each eye
  pair(ex - 0.2, ey - 0.1, 1.55, 1.0, -0.55); // eye socket, deepest toward the nose
  pair(ex + 1.0, ey + 2.5, 1.8, 1.1, 0.55); // cheekbone (broad and low: never a lit island on the shade side)
  pair(H.cheekHW - 1.7, M.y - 0.7, 1.3, 1.5, -0.45); // the hollow under the cheekbone, toward the jaw
  pair(H.cheekHW - 0.9, ey - 1.8, 1.0, 1.5, -0.32); // temple
  pair(nw * 0.55, N.y1 - 0.1, 0.48, 0.42, 0.3); // nose wings
  out.push([0, N.y1 - 0.45, 0.72 * nw, 0.7, N.big ? 0.5 : 0.4]); // nose tip
  out.push([0, M.y - 0.25, 2.9, 2.0, 0.5]); // the muzzle round the mouth
  out.push([0, M.y - 0.6, M.w * 0.42, 0.42, 0.16]); // upper lip
  out.push([0, M.y + 0.7, M.w * 0.36, 0.42, 0.26]); // lower lip
  out.push([0, M.y + 1.6, 1.5, 0.5, -0.3]); // the groove under the lower lip
  out.push([0, H.chinY - 1.9, 1.75, 1.2, 0.5]); // chin
  return out;
}

/** Occlusion blobs (darken the crease, independent of the light): [cx, cy, sx, sy, amount]. */
function occlusionOf(L) {
  const E = L.eyes, N = L.nose, M = L.mouth;
  const out = [];
  const pair = (x, y, sx, sy, a) => out.push([-x, y, sx, sy, a], [x, y, sx, sy, a]);
  pair(E.x - E.w * 0.6, E.y + 0.05, 0.55, 0.55, 0.22); // inner eye corner
  pair(E.x - E.w * 0.45, E.y - 0.9, 0.6, 0.42, 0.4); // the socket under the brow's head, beside the bridge
  pair(N.w * 0.42, N.y1 + 0.15, 0.42, 0.32, 0.22); // nostril
  pair(M.w * 0.56, M.y + 0.05, 0.45, 0.45, 0.2); // mouth corner
  out.push([0, N.y1 + 0.55, 0.85, 0.35, 0.1]); // under the septum
  // the nose's cast shadow: the key is up and camera-left, so it falls down and to the right
  out.push([N.w * 0.62, N.y1 + 0.75, 0.6, 0.34, 0.42]);
  out.push([0, M.y + 1.3, M.w * 0.28, 0.3, 0.36]); // the shadow under the lower lip
  return out;
}

/** Height of the nose ridge (bridge to tip) at (x, y). */
function noseRidge(L, x, y) {
  const E = L.eyes, N = L.nose;
  const ya = E.y - 1.1, yb = N.y1 - 0.2;
  if (y < ya - 1) return 0;
  const k = clamp((y - ya) / (yb - ya), 0, 1);
  let a = 0.3 + 0.85 * Math.pow(k, 1.25);
  if (y > yb) a *= Math.exp(-((y - yb) * (y - yb)) / 0.18);
  if (y < ya) a *= Math.exp(-((ya - y) * (ya - y)) / 0.3);
  const w = N.w * (0.5 + 0.25 * k);
  return a * Math.exp(-(x * x) / (w * w));
}

// Profile exponent per row (feature space): [y offset from a landmark, q] keys,
// smoothed between them. q > 1 flattens the front of the row and turns its sides
// sooner (a broad plane); q near 1 is a round section.
const QK = new Float64Array(14);
function profileQ(L, y) {
  const E = L.eyes, M = L.mouth, H = L.head;
  // forehead broad; temple and socket rounder; cheekbone broad; the hollow under it
  // rounder; the jaw broad again; the chin's ball round
  QK[0] = E.y - 3.5; QK[1] = 1.35;
  QK[2] = E.y - 0.4; QK[3] = 1.05;
  QK[4] = E.y + 2.3; QK[5] = 1.75;
  QK[6] = M.y - 0.7; QK[7] = 1.15;
  QK[8] = M.y + 1.4; QK[9] = 1.55;
  QK[10] = H.chinY - 0.6; QK[11] = 1.2;
  QK[12] = H.chinY + 2; QK[13] = 1.2;
  if (y <= QK[0]) return QK[1];
  for (let k = 2; k < 14; k += 2) {
    if (y <= QK[k]) {
      const a = (y - QK[k - 2]) / (QK[k] - QK[k - 2]);
      const sm = a * a * (3 - 2 * a);
      return QK[k - 1] + (QK[k + 1] - QK[k - 1]) * sm;
    }
  }
  return QK[13];
}

function faceMap(L) {
  let fm = MAPS.get(L);
  if (fm) return fm;
  const H = L.head;
  const xr = Math.max(H.R, H.cheekHW) + 1.5;
  const x0 = -xr, y0 = H.top - 1.5, y1 = H.chinY + 3;
  const nw = Math.ceil((2 * xr) / STEP) + 1, nh = Math.ceil((y1 - y0) / STEP) + 1;
  const bumps = bumpsOf(L), occ = occlusionOf(L);
  const height = new Float32Array(nw * nh);
  const aoArr = new Float32Array(nw * nh);
  for (let j = 0; j < nh; j++) {
    const y = y0 + j * STEP;
    for (let i = 0; i < nw; i++) {
      const x = x0 + i * STEP;
      let h = noseRidge(L, x, y);
      for (const b of bumps) {
        const dx = (x - b[0]) / b[2], dy = (y - b[1]) / b[3];
        const q = dx * dx + dy * dy;
        if (q < 9) h += b[4] * Math.exp(-q);
      }
      let ao = 0;
      for (const b of occ) {
        const dx = (x - b[0]) / b[2], dy = (y - b[1]) / b[3];
        const q = dx * dx + dy * dy;
        if (q < 9) ao += b[4] * Math.exp(-q);
      }
      height[j * nw + i] = h;
      aoArr[j * nw + i] = ao;
    }
  }
  const nx = new Float32Array(nw * nh), ny = new Float32Array(nw * nh), nz = new Float32Array(nw * nh);
  // where the key may raise a highlight: the forehead and the nose ridge only (a
  // cheekbone highlight under the eye reads as a blotch at this resolution)
  const hl = new Uint8Array(nw * nh);
  const E = L.eyes, N = L.nose, B = L.brows;
  for (let j = 0; j < nh; j++) {
    const y = y0 + j * STEP;
    const yc = clamp(y, H.top + 0.05, H.chinY - 0.05);
    const hw = Math.max(1, headHW(H, yc, 0));
    const dhw = (Math.max(0.5, headHW(H, clamp(yc + 0.25, H.top + 0.05, H.chinY - 0.02), 0)) - Math.max(0.5, headHW(H, clamp(yc - 0.25, H.top + 0.05, H.chinY - 0.05), 0))) / 0.5;
    // the skull's vertical curve: dome on top, a forehead that slopes back,
    // a lower face that turns down toward the chin, the chin's underside
    let vy = 0;
    if (y < H.craniumY) vy = (y - H.craniumY) / H.R;
    else if (y < L.eyes.y - 1) vy = -0.22 * (1 - (y - H.craniumY) / Math.max(0.5, L.eyes.y - 1 - H.craniumY));
    else if (y > H.cheekY) vy = 0.1 + 0.22 * ((y - H.cheekY) / (H.chinY - H.cheekY));
    if (y > H.chinY - 1.1) vy += (y - (H.chinY - 1.1)) * 1.5;
    const q = profileQ(L, y);
    for (let i = 0; i < nw; i++) {
      const x = x0 + i * STEP;
      // the cross-section is not a half-cylinder: a broad front plane that turns more
      // sharply at the sides (profile exponent q per row), so the terminator wanders
      // with the head's planes (in at the temple and socket, out on the cheekbone, in
      // under it, out again on the jaw) instead of running down the face as a straight line
      const u0 = clamp(x / hw, -0.995, 0.995);
      const u = u0 < 0 ? -Math.pow(-u0, q) : Math.pow(u0, q);
      const bz = Math.sqrt(1 - u * u);
      const c = j * nw + i;
      const gx = (height[j * nw + Math.min(nw - 1, i + 1)] - height[j * nw + Math.max(0, i - 1)]) / (2 * STEP);
      const gy = (height[Math.min(nh - 1, j + 1) * nw + i] - height[Math.max(0, j - 1) * nw + i]) / (2 * STEP);
      // the jaw's sides face down where the outline narrows
      const side = -dhw * u * u * 0.8;
      let ax = u - gx * bz, ay = (vy + side) * bz - gy * bz, az = bz;
      const n = Math.hypot(ax, ay, az) || 1;
      nx[c] = ax / n;
      ny[c] = ay / n;
      nz[c] = az / n;
      // the forehead's sheen: a short band above the key-side brow and toward the centre
      // (a highlight under the hairline reads as a bald patch, cast-a round 2)
      const fx = (x + E.x * 0.45) / (E.x * 0.75), fy = (y - B.y + 1.2) / 0.62;
      const forehead = fx * fx + fy * fy < 1;
      // the nose ridge's highlight runs from mid-bridge to just above the tip (a full-length stripe reads as paint)
      const ridge = Math.abs(x) < N.w * 0.4 && y > (E.y + N.y1) * 0.5 - 0.2 && y < N.y1 - 0.3;
      // the chin's ball catches a small highlight too (a cheekbone highlight reads as a freckle or a tear here)
      const chin = Math.abs(x) < 1.3 && y > H.chinY - 2.9 && y < H.chinY - 1.3;
      // 2 = the forehead's sheen, which needs a touch less light than the ridge and chin (its plane is broad)
      hl[c] = forehead ? 2 : ridge || chin ? 1 : 0;
    }
  }
  fm = { x0, y0, nw, nh, nx, ny, nz, ao: aoArr, hl };
  MAPS.set(L, fm);
  return fm;
}

// ---------------------------------------------------------------------------
// Skin

// Light-term thresholds per level of detail: [highlight, base, shade] (below: deep).
const TONES = [
  [9, 0.3, -0.42], // wide: lit / shade, no highlight, deep only under the jaw
  [0.95, 0.29, -0.2], // medium
  [0.9, 0.33, -0.1], // close-up
];
const HW_LUT = new Float32Array(1024);
const TH = new Float64Array(3); // this frame's thresholds (TONES of the tier, shifted by L.skinLift)
// Per-frame state of the head being drawn (module scratch: no closure, no allocation).
const S = {
  H: null, fm: null, cx: 0, cy: 0, cr: 1, sr: 0, inv: 1, yawShift: 0, yaw: 0, cyw: 1, syw: 0, cp: 1, sp: 0,
  pitchShift: 0, jaw: 0, jawY0: 0, jawK: 0, top: 0, lutY0: 0, lutN: 0, th: TONES[2], tier: 2, eyeY: 0, lx: 0, ly: 0, lz: 0,
};

/** Skin tone at head-local (x, y) units, or -1 outside the head (reads the per-frame state S). */
function skinTone(x, y) {
  const H = S.H;
  if (y < S.top) return -1;
  const li = Math.round((y - S.lutY0) * 20);
  if (li < 0 || li >= S.lutN) return -1;
  const hw = HW_LUT[li];
  if (hw <= 0) return -1;
  // the jaw follows the turn a little (3/4 view), as faceX moves the features
  let jy = (y - H.cheekY) * S.jyK;
  jy = jy < 0 ? 0 : jy > 1 ? 1 : jy;
  const xs = x - S.yawShift * 1.3 * jy;
  if (xs > hw || xs < -hw) return -1;
  // back to feature space: undo pitch, the open jaw and the yaw
  let fy = y - S.pitchShift;
  if (S.jaw && fy > S.jawY0) fy -= S.jaw * Math.min(1, (fy - S.jawY0) * S.jawK);
  let fx = xs;
  if (S.yaw) {
    let a = Math.asin(xs / hw) - S.yaw;
    if (a < -1.5707) a = -1.5707;
    else if (a > 1.5707) a = 1.5707;
    fx = hw * Math.sin(a);
  }
  const fm = S.fm;
  const ci = Math.round((fx - fm.x0) * 8), cj = Math.round((fy - fm.y0) * 8);
  if (ci < 0 || cj < 0 || ci >= fm.nw || cj >= fm.nh) return 1;
  const c = cj * fm.nw + ci;
  // turn the normal with the head: yaw, then pitch, then roll
  const nx0 = fm.nx[c], ny0 = fm.ny[c], nz0 = fm.nz[c];
  const nx1 = nx0 * S.cyw + nz0 * S.syw, nz1 = -nx0 * S.syw + nz0 * S.cyw;
  const ny2 = ny0 * S.cp + nz1 * S.sp, nz2 = -ny0 * S.sp + nz1 * S.cp;
  const nx3 = nx1 * S.cr - ny2 * S.sr, ny3 = nx1 * S.sr + ny2 * S.cr;
  const ao = fm.ao[c];
  const l = nx3 * S.lx + ny3 * S.ly + nz2 * S.lz - ao * (S.tier ? 1 : 0.4);
  const th = S.th;
  if (S.tier === 0) {
    // wide: one clean terminator, the far edge and the chin's underside in shade
    if (y > H.chinY + S.jaw - 0.75) return 2;
    return l > th[1] ? 1 : 2;
  }
  // the highlight is judged on the yaw-turned normal only: the small pitch and roll
  // of speech would make a 1-2 px highlight blink on and off (shimmer)
  const hk = fm.hl[c];
  // (the forehead's sheen only in close-ups: in a medium it is a 2 px cream blob)
  if (hk && (hk === 1 || S.tier === 2) && nx1 < 0.05 && nx1 * S.lx + ny0 * S.ly + nz1 * S.lz - ao > th[0] - (hk === 2 ? 0.1 : 0)) return 0;
  if (l > th[1]) return 1;
  if (l > th[2]) return 2;
  return 3;
}

export function drawHead(buf, L, m, head, s) {
  const H = L.head;
  S.H = H;
  S.fm = faceMap(L);
  S.cx = head.cx;
  S.cy = head.cy;
  S.cr = head.cr;
  S.sr = head.sr;
  S.inv = 1 / s;
  S.yaw = Math.abs(head.yaw || 0) < 1e-4 ? 0 : head.yaw;
  S.yawShift = Math.sin(S.yaw);
  const p = head.pitch || 0;
  S.pitchShift = Math.sin(p) * 2.0;
  S.cyw = Math.cos(S.yaw);
  S.syw = Math.sin(S.yaw);
  S.cp = Math.cos(p);
  S.sp = Math.sin(p);
  S.jaw = head.jaw || 0;
  S.jawY0 = L.mouth.y - 0.4;
  S.jawK = 1 / Math.max(0.5, H.chinY - S.jawY0);
  S.jyK = 1 / (H.chinY - H.cheekY);
  S.top = H.top - 0.2;
  S.tier = s < 1.35 ? 0 : s < 2.2 ? 1 : 2;
  // L.skinLift (0..1, PRESENTERS B request for darker ramps such as Nova's): the lit planes
  // reach further round the face, so a deep skin keeps a readable lit cheek and forehead
  const lift = L.skinLift > 0 ? Math.min(1, L.skinLift) : 0;
  const T = TONES[S.tier];
  TH[0] = T[0]; // the lift widens the lit planes, never the highlight (a pale band on a deep skin)
  TH[1] = T[1] - 0.22 * lift;
  TH[2] = T[2] - 0.12 * lift;
  S.th = TH;
  S.lx = LIGHT[0];
  S.ly = LIGHT[1];
  S.lz = LIGHT[2];
  // half-width per 0.05 u of head-local y (with the jaw), so the pixel loop never calls pow
  S.lutY0 = H.top - 0.5;
  const n = Math.min(HW_LUT.length, Math.ceil((H.chinY + S.jaw + 0.5 - S.lutY0) * 20) + 1);
  for (let i = 0; i < n; i++) HW_LUT[i] = headHW(H, S.lutY0 + i / 20, S.jaw);
  S.lutN = n;
  // a tight box: the head's own extents (plus the jaw's 3/4 shift), rotated by the roll
  const hx = (Math.max(H.R, H.cheekHW) + 1.5) * s, top = (H.top - 0.4) * s, bot = (H.chinY + S.jaw + 0.6) * s;
  const ar = Math.abs(head.sr);
  const bx0 = head.cx - hx - ar * bot - 1, bx1 = head.cx + hx + ar * bot + 1;
  const by0 = head.cy + top - ar * hx - 1, by1 = head.cy + bot + ar * hx + 1;
  // the pixel loop, inlined (PartBuffer.shape semantics: clip rows, group, depth)
  const [x0, y0, x1, y1] = buf._bounds(bx0, by0, bx1, by1);
  const { w, mat, tone, grp, z, clipY } = buf;
  const g = buf.g, cz = buf.cz, clip = buf.clip, mt = m.skin;
  const kx = head.cr * S.inv, ky = head.sr * S.inv;
  for (let y = y0; y < y1; y++) {
    const dy = y + 0.5 - head.cy;
    const dx0 = x0 + 0.5 - head.cx;
    let lx = dx0 * kx + dy * ky, ly = -dx0 * ky + dy * kx;
    const row = y * w;
    for (let x = x0; x < x1; x++, lx += kx, ly -= ky) {
      if (clip && y >= clipY[x]) continue;
      const t = skinTone(lx, ly);
      if (t < 0) continue;
      const i = row + x;
      mat[i] = mt;
      tone[i] = t;
      grp[i] = g;
      z[i] = cz;
    }
  }
  if (S.tier) cleanTones(buf, mt, x0, y0, x1, y1);
}
/**
 * Pixel-art clean-up of the skin's tone clusters: a pixel that disagrees with
 * three or four of its same-material neighbours takes their tone (no 1 px spurs,
 * notches or orphans along the terminator); runs twice so a 2 px stair settles.
 */
function cleanTones(buf, mat, x0, y0, x1, y1) {
  const w = buf.w, M = buf.mat, T = buf.tone, G = buf.grp, g = buf.g;
  const xa = Math.max(2, Math.floor(x0)), xb = Math.min(w - 2, Math.ceil(x1));
  const ya = Math.max(2, Math.floor(y0)), yb = Math.min(buf.h - 2, Math.ceil(y1));
  for (let pass = 0; pass < 2; pass++) {
    for (let y = ya; y < yb; y++) {
      for (let x = xa; x < xb; x++) {
        const i = y * w + x;
        if (M[i] !== mat || G[i] !== g) continue;
        const t = T[i];
        let a = -1, na = 0, b = -1, nb = 0, same = 0;
        for (let k = 0; k < 4; k++) {
          const j = k === 0 ? i - 1 : k === 1 ? i + 1 : k === 2 ? i - w : i + w;
          if (M[j] !== mat || G[j] !== g) {
            same++; // the silhouette edge does not vote
            continue;
          }
          const tj = T[j];
          if (tj === t) same++;
          else if (a < 0 || tj === a) {
            a = tj;
            na++;
          } else {
            b = tj;
            nb++;
          }
        }
        if (same <= 1) T[i] = na >= nb ? a : b;
      }
    }
  }
}

const EP = [0, 0];

export function drawEars(buf, L, m, head, s) {
  const H = L.head, E = L.ears;
  const hw = headHW(H, E.y, 0);
  for (let side = -1; side <= 1; side += 2) {
    // the ear on the side we turn away from slips behind the skull
    const turn = Math.sin(head.yaw) * side;
    const ex = side * (hw + 0.25 - Math.max(0, turn) * 2.4 + Math.min(0, turn) * 0.4);
    head.toScreenInto(ex, E.y, EP);
    const sx = EP[0], sy = EP[1];
    const rx = E.w * s, ry = E.h * 0.5 * s, rot = head.roll + side * 0.12;
    // lit from camera-left: the near (left) ear one tone lighter than the far one
    buf.ellipse(sx, sy, rx, ry, m.skin, rot, side > 0 ? 1 : 0);
    if (s < 2) continue;
    // close-ups: the helix rim stays lit, the bowl inside it (concha) sits in shade with
    // a deeper canal toward the face, and the lobe below is fleshy and lit
    const c = Math.cos(rot), sn = Math.sin(rot);
    const g = buf.g, far = side > 0 ? 1 : 0;
    const x0 = Math.floor(sx - rx - 1), x1 = Math.ceil(sx + rx + 1), y0 = Math.floor(sy - ry - 1), y1 = Math.ceil(sy + ry + 1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5 - sx, py = y + 0.5 - sy;
        const u = (px * c + py * sn) / rx, v = (-px * sn + py * c) / ry;
        const r2 = u * u + v * v;
        if (r2 > 1) continue;
        const inward = -u * side; // toward the face
        let t = -1;
        if (v > 0.5) t = 1 + far; // lobe
        else if (r2 < 0.36 && v > -0.62) t = inward > 0.25 && r2 < 0.16 ? 3 : 2 + far * (r2 < 0.2 ? 1 : 0); // bowl and canal
        if (t >= 0) buf.paint(x, y, m.skin, Math.min(3, t), g);
      }
    }
  }
}
