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
    pen: material('props:pen', { ramp: [P.steel, P.slate, P.ink, P.black], line: P.black, th: [0.7, 0.1, -0.4] }),
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

// Attachment of the stack's front-bottom edge to the hands (midpoint of the wrists), flat and upright
const OFF0 = [0, 2.6, 5.2], OFF1 = [0, 4.1, 1.5];
const BAND = new Float64Array(8);

function drawPapers(buf, sk, s, g, z, M, pr) {
  const hold = clamp(pr.hold || 0, 0, 1);
  const tilt = clamp(pr.tilt || 0, 0, 1);
  const e = hold * hold * (3 - 2 * hold);
  // the rotation axis = the stack's front-bottom edge: on the desk, or carried by the hands
  const wl = sk.arms.L.wrist, wr = sk.arms.R.wrist;
  const ox = OFF0[0] + (OFF1[0] - OFF0[0]) * tilt, oy = OFF0[1] + (OFF1[1] - OFF0[1]) * tilt, oz = OFF0[2] + (OFF1[2] - OFF0[2]) * tilt;
  const hx = (wl[0] + wr[0]) / 2 + ox, hy = (wl[1] + wr[1]) / 2 + oy, hz = (wl[2] + wr[2]) / 2 + oz;
  const ax = REST_X + (hx - REST_X) * e;
  const ay = DESK_Y + (Math.min(hy, DESK_Y) - DESK_Y) * e; // never through the desk
  const az = REST_Z + PD + (hz - REST_Z - PD) * e;
  // standing it up lifts the back edge about the front edge (77 degrees at tilt 1)
  const al = tilt * 1.35;
  const ca = Math.cos(al), sa = Math.sin(al);
  // corners: top face (ly = -PT) 0..3 = back-left, back-right, front-right, front-left; 4, 5 = bottom front edge
  let q = 0;
  const put = (lx, ly, lz) => {
    C3[q++] = ax + lx;
    C3[q++] = ay + ly * ca + lz * sa;
    C3[q++] = az - ly * sa + lz * ca;
  };
  put(-PW, -PT, -2 * PD);
  put(PW, -PT, -2 * PD);
  put(PW, -PT, 0);
  put(-PW, -PT, 0);
  put(PW, 0, 0);
  put(-PW, 0, 0);
  for (let i = 0; i < 4; i++) {
    PTS[i * 2] = px(C3[i * 3], C3[i * 3 + 1], C3[i * 3 + 2]);
    PTS[i * 2 + 1] = py(C3[i * 3], C3[i * 3 + 1], C3[i * 3 + 2]);
  }
  BAND[0] = PTS[6];
  BAND[1] = PTS[7];
  BAND[2] = PTS[4];
  BAND[3] = PTS[5];
  BAND[4] = px(C3[12], C3[13], C3[14]);
  BAND[5] = py(C3[12], C3[13], C3[14]);
  BAND[6] = px(C3[15], C3[16], C3[17]);
  BAND[7] = py(C3[15], C3[16], C3[17]);
  buf.part(g, z, false);
  // the edge band (sheet edges) under the top sheet; the top sheet catches the key light
  buf.poly(BAND, M.paper, 2);
  buf.poly(PTS.subarray(0, 8), M.paper, 1);
  if (s >= 1.6) {
    // sheet edges along the band: alternate light rows read as a stack
    const bandH = Math.abs(BAND[5] - BAND[3]);
    const n = Math.max(1, Math.round(bandH));
    for (let r = 0; r < n; r += 2) {
      const k = (r + 0.5) / (n + 0.5);
      paintSpan(buf, BAND[0] + (BAND[6] - BAND[0]) * k, BAND[1] + (BAND[7] - BAND[1]) * k, BAND[2] + (BAND[4] - BAND[2]) * k, BAND[3] + (BAND[5] - BAND[3]) * k, M.paperD, 1, g);
    }
  }
  if (s >= 2.0) {
    // printed lines on the top sheet (fog), in the sheet's own perspective
    const lines = s >= 3.4 ? 7 : s >= 2.6 ? 5 : 3;
    for (let r = 0; r < lines; r++) {
      const v = 0.18 + (0.64 * r) / Math.max(1, lines - 1);
      const inset = 0.14, end = r === lines - 1 ? 0.5 : r % 3 === 1 ? 0.78 : 0.86;
      paintSpan(buf, lerp4(PTS, inset, v, 0), lerp4(PTS, inset, v, 1), lerp4(PTS, end, v, 0), lerp4(PTS, end, v, 1), M.paperD, 1, g);
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
  // the pen crosses the hand through the thumb-index web, lying along the index and tilted out:
  // a loose hand covers its middle, the nib shows past the knuckles and the cap behind the thumb
  const cxp = W[0] + f[0] * H * 0.42 + t[0] * H * 0.16 + n[0] * H * 0.12;
  const cyp = W[1] + f[1] * H * 0.42 + t[1] * H * 0.16 + n[1] * H * 0.12;
  const czp = W[2] + f[2] * H * 0.42 + t[2] * H * 0.16 + n[2] * H * 0.12;
  let dx = f[0] * 0.8 + t[0] * 0.52 - n[0] * 0.25, dy = f[1] * 0.8 + t[1] * 0.52 - n[1] * 0.25, dz = f[2] * 0.8 + t[2] * 0.52 - n[2] * 0.25;
  const dl = Math.hypot(dx, dy, dz) || 1;
  dx /= dl;
  dy /= dl;
  dz /= dl;
  const half = H * 0.78; // a pen is longer than the hand: both ends show
  const tipX = px(cxp + dx * half, cyp + dy * half, czp + dz * half), tipY = py(cxp + dx * half, cyp + dy * half, czp + dz * half);
  const endX = px(cxp - dx * half * 0.8, cyp - dy * half * 0.8, czp - dz * half * 0.8), endY = py(cxp - dx * half * 0.8, cyp - dy * half * 0.8, czp - dz * half * 0.8);
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
