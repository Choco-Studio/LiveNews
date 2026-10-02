// Desk props for the canvas25d presenters (owner: HANDS & GESTURES stream):
// the script papers on the desk and Penny's pen. character.js calls
// drawProps (re-exported by hands.js) after the head and before the arms,
// with the props group gb + 30 (range 30-39) at depth 16, so the hands are
// always drawn over the props: a hand resting on the papers covers them, a
// pen held in a loose hand shows only its two ends.
//
//   drawProps(buf, L, m, sk, toS, s, g, z)
//     sk.props = { papers: bool, hold 0..1, tilt 0..1 } (rig.js solve/poseAt):
//       papers  the stack is on this presenter's desk (perf.papers or L.props has 'papers')
//       hold    0 lying on the desk .. 1 held between the hands (the `papers` gesture)
//       tilt    0 flat .. 1 standing upright to be squared on the desk
//     L.props includes 'pen': a pen rests in the screen-left hand (Penny). Never a cue.
//
// Geometry is in body space (rig units); the desk top is at body y = DESK_Y.
// Positions follow the solved hands, so a prop never pops: the stack lying on
// the desk is exactly where the hands pick it up.
import { P } from '../../palette.js';
import { clamp } from './space.js';
import { material } from './pixbuf.js';
import { handGeometry, newHandGeometry, projBasis } from './hands.js';

export const DESK_Y = 29.6; // body-space height of the desk top (neck base 30 u above it, SET.neckY)
// the stack: half width (x), half depth (z), thickness, where it lies
const PW = 7.4, PD = 5.2, PT = 0.7;
const REST_X = 0, REST_Z = 15.5;

let MAT = null;
function mats() {
  if (MAT) return MAT;
  MAT = {
    // studio paper is never pure white (ART_DIRECTION values: white only for collars, glints, text)
    paper: material('props:paper', { ramp: [P.silver, P.silver, P.fog, P.steel], line: P.slate, th: [2, -0.3, -0.8] }),
    paperD: material('props:paperD', { ramp: [P.silver, P.fog, P.steel, P.slate], decal: true }),
    pen: material('props:pen', { ramp: [P.slate, P.ink, P.black, P.black], line: P.black, th: [0.7, 0.1, -0.4] }),
    penD: material('props:penD', { ramp: [P.silver, P.fog, P.steel, P.slate], decal: true }),
  };
  return MAT;
}

const B = new Float64Array(8);
let HG = null; // created on first use (hands.js and this module import each other)
const C3 = new Float64Array(8 * 3);
const PTS = new Float64Array(16);
const px = (x, y, z) => B[0] + x * B[2] + y * B[4] + z * B[6];
const py = (x, y, z) => B[1] + x * B[3] + y * B[5] + z * B[7];

export function drawProps(buf, L, m, sk, toS, s, g, z) {
  const pr = sk.props;
  const pen = Array.isArray(L.props) && L.props.includes('pen');
  if (!(pr && pr.papers) && !pen) return;
  projBasis(toS, B);
  const M = mats();
  if (pr && pr.papers) drawPapers(buf, sk, s, g, z, M, pr);
  if (pen) drawPen(buf, L, sk, s, g + 1, z, M);
}

// ---------------------------------------------------------------------------
// Papers: a stack of sheets, its pose blended between the desk and the hands

function drawPapers(buf, sk, s, g, z, M, pr) {
  const hold = clamp(pr.hold || 0, 0, 1);
  const tilt = clamp(pr.tilt || 0, 0, 1);
  // centre: on the desk, or between the two wrists (a little forward of them, where the fingers grip)
  const wl = sk.arms.L.wrist, wr = sk.arms.R.wrist;
  const hx = (wl[0] + wr[0]) / 2, hy = (wl[1] + wr[1]) / 2 + 3.4, hz = (wl[2] + wr[2]) / 2 + 2.2;
  const e = hold * hold * (3 - 2 * hold);
  const cx = REST_X + (hx - REST_X) * e;
  const cy = DESK_Y - PT + (Math.min(hy, DESK_Y - PT) - (DESK_Y - PT)) * e;
  const cz = REST_Z + (hz - REST_Z) * e;
  // tilt: the stack turns about its x axis from flat (normal up) to upright (normal toward the camera)
  const a = tilt * 1.25;
  const ca = Math.cos(a), sa = Math.sin(a);
  // local corner (lx, ly thickness, lz depth) → body: y' = ly*ca - lz*sa, z' = ly*sa + lz*ca
  let q = 0;
  for (const ly of [-PT, 0]) {
    for (const [lx, lz] of [[-PW, -PD], [PW, -PD], [PW, PD], [-PW, PD]]) {
      // upright: the bottom edge (lz = +PD) stays at the hands' height, the stack rises above it
      C3[q++] = cx + lx;
      C3[q++] = cy + ly * ca - (lz - PD) * sa - PD * sa * 0;
      C3[q++] = cz + ly * sa + (lz - PD) * ca + PD;
    }
  }
  const P0 = (i) => px(C3[i * 3], C3[i * 3 + 1], C3[i * 3 + 2]);
  const Q0 = (i) => py(C3[i * 3], C3[i * 3 + 1], C3[i * 3 + 2]);
  buf.part(g, z, false);
  // the sides of the stack (front edge band), then the top sheet
  for (let i = 0; i < 4; i++) {
    PTS[i * 2] = P0(4 + i);
    PTS[i * 2 + 1] = Q0(4 + i);
  }
  // front band: bottom corners 6,7 (top face) to the lower face 2,3
  const band = [P0(3), Q0(3), P0(2), Q0(2), P0(6), Q0(6), P0(7), Q0(7)];
  buf.poly(band, M.paper, 2);
  buf.poly(PTS.subarray(0, 8), M.paper, 1);
  if (s >= 1.6) {
    // sheet edges along the front band: alternate light / shade rows read as a stack
    const n = Math.max(1, Math.round(PT * s * (1 - tilt * 0.6)));
    for (let r = 0; r < n; r++) {
      if (r % 2) continue;
      const k = (r + 0.5) / (n + 0.5);
      const x0 = P0(7) + (P0(3) - P0(7)) * k, y0 = Q0(7) + (Q0(3) - Q0(7)) * k;
      const x1 = P0(6) + (P0(2) - P0(6)) * k, y1 = Q0(6) + (Q0(2) - Q0(6)) * k;
      paintSpan(buf, x0, y0, x1, y1, M.paperD, 1, g);
    }
  }
  if (s >= 2.4) {
    // printed lines on the top sheet (fog), in the sheet's own perspective
    const lines = s >= 3.4 ? 6 : 4;
    for (let r = 0; r < lines; r++) {
      const v = 0.2 + (0.62 * r) / (lines - 1);
      const inset = 0.16, end = r === lines - 1 ? 0.55 : 0.84;
      const x0 = lerp4(PTS, inset, v, 0), y0 = lerp4(PTS, inset, v, 1);
      const x1 = lerp4(PTS, end, v, 0), y1 = lerp4(PTS, end, v, 1);
      paintSpan(buf, x0, y0, x1, y1, M.paperD, 1, g);
    }
  }
}

/** Bilinear point on the quad PTS (corners 0..3: back-left, back-right, front-right, front-left). */
function lerp4(Q, u, v, c) {
  const a = Q[c] + (Q[2 + c] - Q[c]) * u;
  const b = Q[6 + c] + (Q[4 + c] - Q[6 + c]) * u;
  return a + (b - a) * v;
}

function paintSpan(buf, ax, ay, bx, by, m, tone, g) {
  let x0 = Math.round(ax - 0.5), y0 = Math.round(ay - 0.5);
  const x1 = Math.round(bx - 0.5), y1 = Math.round(by - 0.5);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let n = 0; n < 256; n++) {
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
// Pen: rests in the web between thumb and index of the screen-left hand

function drawPen(buf, L, sk, s, g, z, M) {
  const arm = sk.arms.L;
  HG ||= newHandGeometry();
  handGeometry(L, arm, -1, HG);
  const { W, f, t, n, H } = HG;
  // the pen crosses the hand through the thumb-index web, lying along the index, tilted out
  const cxp = W[0] + f[0] * H * 0.46 + t[0] * H * 0.2 + n[0] * H * 0.1;
  const cyp = W[1] + f[1] * H * 0.46 + t[1] * H * 0.2 + n[1] * H * 0.1;
  const czp = W[2] + f[2] * H * 0.46 + t[2] * H * 0.2 + n[2] * H * 0.1;
  let dx = f[0] * 0.82 + t[0] * 0.48 - n[0] * 0.3, dy = f[1] * 0.82 + t[1] * 0.48 - n[1] * 0.3, dz = f[2] * 0.82 + t[2] * 0.48 - n[2] * 0.3;
  const dl = Math.hypot(dx, dy, dz) || 1;
  dx /= dl;
  dy /= dl;
  dz /= dl;
  const half = H * 0.62; // a pen is a little longer than the hand
  const tipX = px(cxp + dx * half, cyp + dy * half, czp + dz * half), tipY = py(cxp + dx * half, cyp + dy * half, czp + dz * half);
  const endX = px(cxp - dx * half, cyp - dy * half, czp - dz * half), endY = py(cxp - dx * half, cyp - dy * half, czp - dz * half);
  buf.part(g, z, false);
  const r = Math.max(0.55, 0.42 * s);
  buf.capsule(endX, endY, tipX, tipY, r, Math.max(0.5, r * 0.8), M.pen);
  if (s >= 1.8) {
    // a silver nib at the writing end and a clip highlight near the cap
    const ux = tipX - endX, uy = tipY - endY;
    buf.paint(Math.round(tipX - 0.5), Math.round(tipY - 0.5), M.penD, 1, g);
    buf.paint(Math.round(endX + ux * 0.12 - 0.5), Math.round(endY + uy * 0.12 - 0.5), M.penD, 0, g);
    if (s >= 2.7) buf.paint(Math.round(endX + ux * 0.2 - 0.5), Math.round(endY + uy * 0.2 - 0.5), M.penD, 1, g);
  }
}
