// FULL TIME's title sequence (full-time.md §6: "≈10 s, 120 BPM"). The final whistle, on the programme's grid (cues.js):
//
//   DARK      beats 0-3     a stadium at night seen from the air: the bowl black, the floodlight towers dark at its four
//                           corners, only the board over the far stand alight, its clock (the watch) reading 89:55 and
//                           running a second every two beats
//   FLOODS    3-6           the floodlights bang on bank by bank, one a beat (far left, far right, near left, near
//                           right): each head flashes and settles to a soft halo and its quarter of the pitch comes up
//                           from dark and deep green to the mown stripes in green and mid green, its stands and crowd
//                           with it (a low thunk each: the band's count-in)
//   SWEEP     6.5-10        the camera sweeps down over the near stand, past the near towers, into the bowl and lands on
//                           the wide over the centre circle on the first blast, the board over the far stand
//   WHISTLE   10-14         the clock reaches 90:00 on the first of the referee's three blasts (the brass); a cut closer
//                           on each blast: the wide (where the sweep lands), the mid (the board, the far stand, the
//                           goal; the board's rim flashing with the short blast), the board's clock (the watch at
//                           centre stage at the emblem's size, FULL TIME beside it in the board's face at 2x) on the
//                           long one, when the board flips; half a beat later the far stand holds its scarves up
//   CUT       15            the stadium drops away round the watch (three frames through the screen's matrix): the
//                           stopwatch at 90:00 at centre stage on the open's field, the emblem
//   TITLE     15.7-19       the package's reveal (the plate wipes out of the watch); still for the last 0.8 s
//
// The stadium is drawn pixel by pixel: every pixel casts a ray into a simple world (metres; X across the pitch, Y up, Z
// along it, the centre spot at the origin): the pitch and its lines, the four stands with their tiers, roofs and walls,
// the advertising boards, the board on its truss over the far stand; then the towers, the goals and the halos are
// drawn on it against the depth of each pixel. Rules learnt on the other sequences: geometry stays fractional until a
// pixel is plotted; gradients are dithered through the screen's fixed matrix; the pitch's lines and stripes are
// filtered by each pixel's footprint on the grass (a line far away is a pixel wide and dimmer, never dotted); the
// crowd's seats and heads fade to the stand's average tone where they would be smaller than a pixel, and only draw while
// the camera is at rest. The cut-ins are still framings (no zoom: a pixel picture scaled between frames shimmers). The
// watch is the emblem's own drawing (sport.js paintWatch) at its projected place and size, so the last cut-in frames the
// emblem's own pixels; the field comes in round it through the screen's matrix before the package takes over.
import { P } from '../../palette.js';
import { textPixels } from '../../font.js';
import { u32, clamp, seg, smoothstep, easeInOut, easeOutQuint } from '../../gfx/index.js';
import { W, H, CENTRE, ZOOM } from './kit.js';
import { SPORT_OPEN, paintWatch, BUILD_DONE } from './sport.js';
import { track, sequence, Layer, ditherAt } from './seq.js';
import { CUES, hitOf } from './cues.js';

const ID = 'full-time';
const Q = CUES[ID];
const BEAT = 60 / Q.bpm;
const HIT = hitOf(ID);
const C = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, u32(v)]));
const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------------------------
// The world (metres)

const PW = 34; // the touchlines (X)
const PL = 52.5; // the goal lines (Z)
const GRASS_X = 38;
const GRASS_Z = 57;
const ADS = { x: 38.6, z: 57.6, h: 0.9 }; // the advertising boards round the pitch (the channel's orange band)
// the stands: the two ends (along Z, s = +1 far, -1 near) and the two sides (along X); the tiers rise from the front to
// the back, a roof slab over them with its fascia at the front, a wall at the back
// (the near end is a low terrace open to the sky, so the camera in the air sees the whole pitch over it)
const END = { front: 61, back: 80, y0: 1.2, y1: 18, half: 46, roof: { front: 59.5, back: 82, y: 23, t: 2.4 } };
const NEAR = { front: 61, back: 68, y0: 1.2, y1: 6, half: 40, roof: null };
const SIDE = { front: 44, back: 62, y0: 1.2, y1: 15, half: 60, roof: { front: 43, back: 64, y: 19, t: 2 } };
/** The four stands for the ray tests: axis 0 along Z (the ends), 1 along X (the sides); s the side; who the shading's id. */
const STANDS = [[END, 0, 1, 1], [NEAR, 0, -1, 0], [SIDE, 1, -1, 2], [SIDE, 1, 1, 3]].map(([st, axis, s, who]) => {
  const m = (st.y1 - st.y0) / (st.back - st.front);
  const rf = st.roof;
  // walls: [depth, y0, y1, facing (-1 the pitch, +1 out), tag (2 fascia, 1 front, 0 back), the length's margin]
  const walls = [[st.front, 0, st.y0, -1, 1, 0], [rf ? rf.back : st.back, 0, rf ? rf.y : st.y1, 1, 0, 1]];
  if (rf) walls.push([rf.front, rf.y - rf.t, rf.y, -1, 2, 1]);
  return { ...st, axis, s, who, m, slope: Math.hypot(1, m), walls };
});
// the floodlight towers at the corners, in the order their banks come on: far left, far right, near left, near right
const TOWERS = [[-47, 69], [47, 69], [-47, -69], [47, -69]];
const TOWER_H = 46;
const HEAD = { w: 9, h: 5.5 };
// the board over the far stand, on a truss: the watch (its clock) on its left end, the LED panel on the rest
const BOARD = { x0: -31, x1: 31, y0: 24.2, y1: 38, truss: 25, z: 66.5 };
const U = 0.42; // metres a watch unit
const WATCH = { x: -20.6, y: 31.1, z: 66.2 };
const PANEL = { x0: -9.6, x1: 30, y0: 26, y1: 37 };
const GOAL = { hw: 3.66, h: 2.44 };

// ---------------------------------------------------------------------------------------------
// The camera: position, pitch (degrees, down), yaw (degrees), focal length (px); the principal point is centre stage

// (high over the near terrace, the whole bowl in the frame; then down over the terrace, past the near towers, to rest
// low over the centre circle)
const CAM_Y = track([[0, 88], [Q.sweep, 88], [8, 54], [9.2, 24], [Q.circle, 13], [16, 13]]);
const CAM_Z = track([[0, -128], [Q.sweep, -128], [8, -98], [9.2, -50], [Q.circle, -27], [16, -27]]);
const CAM_P = track([[0, 33.3], [Q.sweep, 33.3], [8, 25], [9.2, 10], [Q.circle, 5], [16, 5]]);
const CAM_F = track([[0, 240], [Q.sweep, 240], [Q.circle, 190], [16, 190]]);

const CAM = { x: 0, y: 0, z: 0, f: 1, px: CENTRE.x, py: CENTRE.y, F: [0, 0, 1], R: [1, 0, 0], U: [0, 1, 0], moving: 0 };
/** The camera's orientation for a pitch (radians, down) and no yaw (the camera never turns sideways). */
function orient(o, pitch) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  o.F = [0, -sp, cp];
  o.R = [1, 0, 0];
  o.U = [0, cp, sp];
  return o;
}
// The whistle's cut-ins: the wide where the sweep lands (on the first blast), a mid on the second, the board's clock on
// the third (the watch at centre stage at the emblem's size: the package's own frame). A cut-in is a camera on the same
// axis, a little nearer and on a longer lens, its frame's centre shifted: three still framings, cut on the beat (no zoom,
// no move: a pixel picture scaled between frames shimmers). FRAMING: each one's share of the way from the wide lens to
// the clock's (in log focal length);
// NEARER: how much higher and nearer the far stand its camera stands (m): the clock's stands just short of the halfway
// line, so the far goal's crossbar falls below its frame (never a sliver of it at the frame's foot).
const FRAMING = [0, 0.5, 1];
const NEARER = [[0, 0], [1, 8], [2.4, 20]];

/** Which framing is on air at beat b: 0 (the sweep and the wide), 1 (the mid), 2 (the board's clock). */
const framingAt = (b) => (b >= Q.whistle[2] ? 2 : b >= Q.whistle[1] ? 1 : 0);

/**
 * The camera at beat b: the sweep (CAM_Y/Z/P/F) to the wide over the centre circle, then the whistle's cut-ins. A cut-in's
 * watch lands on whole pixels (the clock's on centre stage). `moving` (0..1): how fast the picture moves (the crowd's
 * fine detail only shows while it is nearly still; the cut-ins are still).
 */
function cameraAt(b, o = CAM) {
  const pos = (bb) => [0, CAM_Y(bb), CAM_Z(bb)];
  const [x, y0, z0] = pos(b);
  const [dy, dz] = NEARER[framingAt(b)];
  const y = y0 + dy, z = z0 + dz;
  o.x = x;
  o.y = y;
  o.z = z;
  orient(o, CAM_P(b) * DEG);
  let f = CAM_F(b);
  o.px = CENTRE.x;
  o.py = CENTRE.y;
  const p = FRAMING[framingAt(b)];
  if (p > 0) {
    // the watch's direction in the camera's frame, and the focal length at which it is the emblem's size
    const dx = WATCH.x - x, dy = WATCH.y - y, dz = WATCH.z - z;
    const depth = dx * o.F[0] + dy * o.F[1] + dz * o.F[2];
    const xn = (dx * o.R[0] + dy * o.R[1] + dz * o.R[2]) / depth;
    const yn = (dx * o.U[0] + dy * o.U[1] + dz * o.U[2]) / depth;
    const f0 = f;
    const fM = (ZOOM * depth) / U;
    f = Math.exp(Math.log(f0) + (Math.log(fM) - Math.log(f0)) * p);
    // the watch's place on screen: that share of the way from where it hangs in the wide to centre stage, on whole pixels
    const sx0 = CENTRE.x + f0 * xn, sy0 = CENTRE.y - f0 * yn;
    const wx = Math.round(sx0 + (CENTRE.x - sx0) * p), wy = Math.round(sy0 + (CENTRE.y - sy0) * p);
    o.px = wx - f * xn;
    o.py = wy + f * yn;
  }
  o.f = f;
  // how fast the picture moves: the camera's speed (m/s)
  // (over the last hundredth of a second: the detail draws in on the frame after the camera lands)
  const [x1, y1, z1] = pos(b - 0.02);
  const speed = Math.hypot(x - x1, y0 - y1, z0 - z1) / (0.02 * BEAT); // (a cut is no move)
  o.moving = smoothstep(2, 10, speed);
  return o;
}

/** Project a world point: { x, y (screen px), z (depth along the view, m) }; z <= 0 behind the camera. */
const PR = { x: 0, y: 0, z: 0 };
function project(cam, X, Y, Z, out = PR) {
  const dx = X - cam.x, dy = Y - cam.y, dz = Z - cam.z;
  const z = dx * cam.F[0] + dy * cam.F[1] + dz * cam.F[2];
  out.z = z;
  out.x = cam.px + (cam.f * (dx * cam.R[0] + dy * cam.R[1] + dz * cam.R[2])) / z;
  out.y = cam.py - (cam.f * (dx * cam.U[0] + dy * cam.U[1] + dz * cam.U[2])) / z;
  return out;
}

// ---------------------------------------------------------------------------------------------
// The lights: a bank is on from its beat, with a flash that settles in about a tenth of a second

/** Bank i's light at beat b: 0 off, 1 on, more during its flash. */
function bankAt(i, b) {
  const on = Q.floods[i];
  if (b < on) return 0;
  return 1 + 0.55 * Math.exp(-((b - on) * BEAT) / 0.05);
}
const LIGHT = new Float32Array(4);
const SX = [-1, 1, -1, 1]; // the banks' sides (X) and ends (Z)
const SZ = [1, 1, -1, -1];
/**
 * The light falling at a point of the ground (or the stands): each bank lights its own quarter of the ground, edged over
 * a few metres, so each bang lights a crisp quarter and the four together light it all evenly.
 */
function lightAt(x, z) {
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const l = LIGHT[i];
    if (!l) continue;
    s += l * smoothstep(-2.5, 2.5, x * SX[i]) * smoothstep(-4, 4, z * SZ[i]);
  }
  return s;
}

// ---------------------------------------------------------------------------------------------
// Pixel colours

/** A ramp of palette colours quantised through the screen's matrix: level v (0..n-1) at pixel (x, y). */
function ramp(colours, v, x, y) {
  if (v <= 0) return colours[0];
  const n = colours.length - 1;
  if (v >= n) return colours[n];
  const i = v | 0;
  return colours[i + (ditherAt(x, y) < (v - i) * 16 ? 1 : 0)];
}
// the grass's mown stripes in solid bands: green and mid green under the lights, dark and deep green where the light
// has not come yet (ENDESGA 32's own greens)
const STRIPE_LIT = [C.green, C.midGreen];
const STRIPE_DARK = [C.darkGreen, C.deepGreen];
const LINES = [C.black, C.ink, C.slate, C.steel, C.silver, C.white];
const SKY = [C.black, C.ink, C.navy];
const DARK = [C.black, C.ink, C.slate, C.steel];
/** A smooth level as flat steps with short dithered edges (the art direction: never one wide checkerboard). */
const band = (v) => {
  const i = Math.floor(v);
  return i + smoothstep(0.36, 0.64, v - i);
};
/** A level as whole steps (large flat surfaces: a roof, a wall, the sky's bands). */
const step = (v) => Math.floor(v + 0.5);

/** The dark share of a stretch [z0, z1] of the mowing stripes (5.25 m each, across the pitch). */
function stripeShare(z0, z1) {
  const P2 = 10.5;
  const F = (z) => {
    const u = z + PL;
    const n = Math.floor(u / P2);
    return n * (P2 / 2) + Math.max(0, u - n * P2 - P2 / 2);
  };
  if (z1 - z0 < 1e-4) return F(z0 + 1e-4) - F(z0) > 0 ? 1 : 0;
  return (F(z1) - F(z0)) / (z1 - z0);
}

/** Coverage of a line of width w at distance d by a footprint of extent e (box filter); lines are at least 0.8 px wide. */
function lineCover(d, w, e) {
  const ww = Math.max(w, 0.8 * e);
  const lo = Math.max(d - e / 2, -ww / 2);
  const hi = Math.min(d + e / 2, ww / 2);
  return hi > lo ? Math.min(1, (hi - lo) / Math.max(e, 1e-6)) : 0;
}

const LW = 0.12; // the lines' width
const LINE_W = (e) => Math.max(LW, 0.8 * e) / 2 + e / 2; // beyond this distance a line covers none of the pixel
/** How much of the pixel the pitch's markings cover, the strongest of them (0..1); a, b: the footprint's two sides. */
function markings(gx, gz, ex, ez, ax, az, bx, bz) {
  const X = gx < 0 ? -gx : gx, Z = gz < 0 ? -gz : gz;
  let c = 0;
  const tol = ex > ez ? ex : ez;
  const rx = LINE_W(ex), rz = LINE_W(ez);
  // touchlines, goal lines, the halfway line
  if (Z <= PL + tol) {
    const dx = X > PW ? X - PW : PW - X;
    if (dx < rx) c = lineCover(dx, LW, ex);
  }
  if (X <= PW + tol) {
    const dz = Z > PL ? Z - PL : PL - Z;
    if (dz < rz) c = Math.max(c, lineCover(dz, LW, ez));
    if (Z < rz) c = Math.max(c, lineCover(Z, LW, ez));
  }
  // the boxes: the penalty area (16.5 m deep, 40.32 m wide) and the goal area (5.5 m, 18.32 m)
  if (Z >= 36 - tol && Z <= PL + tol) {
    if (X <= 20.16 + tol && Math.abs(Z - 36) < rz) c = Math.max(c, lineCover(Math.abs(Z - 36), LW, ez));
    if (Math.abs(X - 20.16) < rx) c = Math.max(c, lineCover(Math.abs(X - 20.16), LW, ex));
    if (Z >= 47 - tol) {
      if (X <= 9.16 + tol && Math.abs(Z - 47) < rz) c = Math.max(c, lineCover(Math.abs(Z - 47), LW, ez));
      if (Math.abs(X - 9.16) < rx) c = Math.max(c, lineCover(Math.abs(X - 9.16), LW, ex));
    }
  }
  // the circles (the centre circle, the penalty arcs outside the areas) and the spots
  if (X < 9.15 + tol + 1 && Z < 9.15 + tol + 1) c = Math.max(c, circleCover(gx, gz, 0, 9.15, tol, ax, az, bx, bz));
  if (Z > 32 - tol && Z < 36 && X < 9.15 + tol + 1) c = Math.max(c, circleCover(gx, Z, 41.5, 9.15, tol, ax, az, bx, bz));
  if (X < 0.3 + tol && (Z < 0.3 + tol || Math.abs(Z - 41.5) < 0.3 + tol)) {
    const d = Math.min(Math.hypot(gx, gz), Math.hypot(gx, Z - 41.5));
    c = Math.max(c, lineCover(d, 0.44, tol));
  }
  return c;
}
/** A circle's line round (0, cz) of radius r: its coverage, the footprint's extent taken along the radius. */
function circleCover(gx, gz, cz, r, tol, ax, az, bx, bz) {
  const dz = gz - cz;
  const rr = Math.sqrt(gx * gx + dz * dz);
  const dd = rr > r ? rr - r : r - rr;
  if (dd > tol + 0.2) return 0;
  const nx = gx / (rr || 1), nz = dz / (rr || 1);
  const e = Math.abs(ax * nx + az * nz) + Math.abs(bx * nx + bz * nz);
  return lineCover(dd, LW, e);
}

// the crowd: a seat a 0.62 m along a row, a row every 0.85 m up the tiers; a head in 7 of 10 seats, two tones, a muted
// scarf in a few (deterministic, never animated)
const ROW_H = 0.85;
const SEAT = 0.62;
const hash2 = (a, b) => {
  let h = (Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return h ^ (h >>> 16);
};
// the far stand's build (the end behind the board): a stair (aisle) every 12 m along it, a concourse across it at row 12
// with three lit exits (vomitories) cut through the rows under it; on the long blast its fifth row holds up its scarves,
// a band of the channel's orange and white across the stand, held to the end
const AISLE = 12;
const AISLE_W = 1.2;
const CONCOURSE = 12; // its row
const EXITS = [-24, 0, 24];
const EXIT = { w: 4.4, r0: 8, r1: 12 }; // its width (m) and rows
const SCARF_ROW = 4;
/**
 * A tier at height h (m up the slope from its first row) and lateral position lat on stand `who`, lit by `lit` (0..1);
 * fp and fl a pixel's footprint on the tier (m), up the slope and along the stand. Levels of detail by the footprints,
 * with a narrow dithered seam: the heads (a row two pixels or more, a seat two or more), the rows alone (a row one and a
 * half pixels or more), below that the crowd as a texture (a sparse screen-fixed dither, the stand's average); the far
 * stand's stairs, concourse and exits wherever they are a pixel or more. The heads and the rows only while the picture is
 * nearly still (they would strobe in a move).
 */
function tierColour(h, lat, who, lit, fp, fl, X, Y) {
  if (lit < 0.2) return C.black;
  const r = Math.floor(h / ROW_H);
  const fr = h / ROW_H - r;
  const far = who === 1;
  if (far) {
    // the exits: an opening through the rows, lit from inside (a black lintel and jambs a quarter metre thick)
    // (in a move only what is three pixels or more: a finer feature would strobe)
    const min = 1 + 2 * MOVING;
    if (r >= EXIT.r0 && r < EXIT.r1 && EXIT.w / fl >= 1 + min) {
      for (const ex of EXITS) {
        const u = lat - ex;
        if (u > -EXIT.w / 2 && u < EXIT.w / 2) {
          const edge = EXIT.w / 2 - Math.abs(u) < Math.max(0.25, fl * 0.9) || (r === EXIT.r1 - 1 && fr > 1 - Math.max(0.3, fp / ROW_H));
          return edge ? C.black : r === EXIT.r0 ? C.yellow : C.cream;
        }
      }
    }
    // the concourse: a walkway across the stand, its front edge catching the light
    if (r === CONCOURSE && ROW_H / fp >= min) return fr > 0.7 || ROW_H / fp < 2 ? C.slate : C.ink;
    // the stairs: lighter steps, no seats
    const ua = ((lat % AISLE) + AISLE * 1.5) % AISLE - AISLE / 2;
    if (Math.abs(ua) < AISLE_W / 2 && AISLE_W / fl >= min) return fr < 0.3 && ROW_H / fp >= 2 ? C.ink : C.slate;
  }
  // the scarves held up on the long blast: a band across the far stand's fifth row
  if (far && UP >= 0 && r === SCARF_ROW && fr > 0.12 && fr < 0.94) return Math.floor(lat / (2 * SEAT)) % 2 ? C.white : C.orange;
  const flat = ramp(DARK, 0.08 + 1.25 * lit, X, Y);
  const th = ditherAt(X, Y) / 16;
  const level = fp + (th - 0.5) * 0.04; // the seams' dither, two hundredths of a metre a pixel wide
  const still = 1 - smoothstep(0, 0.15, MOVING); // (the rows and heads draw in only as the camera comes to rest)
  const rowsMax = 0.6 * still, headsMax = 0.4 * still;
  if (level > rowsMax) return flat;
  const heads = level <= headsMax && fl <= 0.31 * still;
  if (fr < 0.14 && heads) return C.ink; // the riser's lip
  if (!heads) return r % 2 ? C.ink : C.black; // the rows alone
  // the heads: slate on the ink and black rows, a few steel, a rare muted scarf
  const s = Math.floor((lat + 100 * who) / SEAT);
  const fs = (lat + 100 * who) / SEAT - s;
  const hh = hash2(r, s);
  if (hh % 10 < 7 && fr > 0.36 && fr < 0.86 && fs > 0.18 && fs < 0.78) {
    const t = (hh >>> 4) % 50;
    if (t === 0) return C.darkRed;
    if (t === 1) return C.navy;
    return t < 7 ? C.steel : C.slate;
  }
  return r % 2 ? C.ink : C.black;
}

// ---------------------------------------------------------------------------------------------
// The frame

const LAYER = new Layer('fulltime-titles');
const DEPTH = new Float32Array(W * H);
const KIND = new Uint8Array(W * H); // what each pixel shows (0 sky, 1 ground, 2 tier, 3 roof, 4 wall, 5 ads, 6 board)
const SK = 0, GR = 1, TI = 2, RF = 3, WL = 4, AD = 5, BD = 6;

let BOARD_LIT = 0; // the board's rim flash (the whistle's short blasts)
let MOVING = 0; // how fast the picture moves (the camera's cameraAt.moving)
let UP = -1; // beats since the long blast (the far stand's scarves go up on it)
let TFP = 0; // the footprint of the pixel on the tier it shows, up the slope (m)
let TFL = 0; // and along the stand (m)

/** The screen rectangle an axis-aligned box covers (1 px margin), or the whole screen when it reaches behind the camera. */
const BOX = { x0: 0, x1: W - 1, y0: 0, y1: H - 1 };
function screenBox(cam, bb, out) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < 8; i++) {
    project(cam, i & 1 ? bb[3] : bb[0], i & 2 ? bb[4] : bb[1], i & 4 ? bb[5] : bb[2], PB);
    if (PB.z <= 0.5) {
      out.x0 = 0; out.x1 = W - 1; out.y0 = 0; out.y1 = H - 1;
      return out;
    }
    x0 = Math.min(x0, PB.x); x1 = Math.max(x1, PB.x); y0 = Math.min(y0, PB.y); y1 = Math.max(y1, PB.y);
  }
  out.x0 = Math.max(0, Math.floor(x0) - 1); out.x1 = Math.min(W - 1, Math.ceil(x1) + 1);
  out.y0 = Math.max(0, Math.floor(y0) - 1); out.y1 = Math.min(H - 1, Math.ceil(y1) + 1);
  return out;
}
const PB = { x: 0, y: 0, z: 0 };
// each stand's bounding box [x0, y0, z0, x1, y1, z1], and the boxes of the advertising boards and the board
for (const st of STANDS) {
  const deep = st.roof ? Math.max(st.back, st.roof.back) : st.back;
  const near = st.roof ? Math.min(st.front, st.roof.front) : st.front;
  const top = st.roof ? st.roof.y : st.y1;
  const d0 = st.s > 0 ? near : -deep, d1 = st.s > 0 ? deep : -near;
  st.bbox = st.axis ? [d0, 0, -st.half - 1, d1, top, st.half + 1] : [-st.half - 1, 0, d0, st.half + 1, top, d1];
  st.sbox = { x0: 0, x1: 0, y0: 0, y1: 0 };
}
const ADS_BOX = [-ADS.x, 0, -ADS.z, ADS.x, ADS.h, ADS.z];
const BOARD_BOX = [BOARD.x0, BOARD.y0, BOARD.z, BOARD.x1, BOARD.y1, BOARD.z];
const ADS_S = { x0: 0, x1: 0, y0: 0, y1: 0 };
const BOARD_S = { x0: 0, x1: 0, y0: 0, y1: 0 };

/** Every pixel of the stadium at beat b into the layer (and the depth buffer). */
function paintWorld(b, cam) {
  const d = LAYER.d;
  const { x: cx, y: cy, z: cz, f } = cam;
  const [Fx, Fy, Fz] = cam.F, [Rx, , Rz] = cam.R, [Ux, Uy, Uz] = cam.U;
  const allOn = (Math.min(1, LIGHT[0]) + Math.min(1, LIGHT[1]) + Math.min(1, LIGHT[2]) + Math.min(1, LIGHT[3])) / 4;
  for (const st of STANDS) screenBox(cam, st.bbox, st.sbox);
  screenBox(cam, ADS_BOX, ADS_S);
  screenBox(cam, BOARD_BOX, BOARD_S);
  const off = 0.5 - cam.px;
  MOVING = cam.moving;
  const kx = Rx / f, kz = Rz / f; // D's change a pixel along a row (the camera never rolls: D's Y is the row's)
  let pg = false, pgx0 = 0, pgxd = 0, pgz0 = 0, pgzd = 0; // the last row's ground line
  for (let Y = 0; Y < H; Y++) {
    const sy = -(Y + 0.5 - cam.py) / f;
    const Dy = Fy + sy * Uy;
    const dx0 = Fx + sy * Ux + off * kx, dz0 = Fz + sy * Uz + off * kz; // D at X = 0
    // the ground: one distance for the whole row (a mode-7 floor): its points are linear along it
    const tg = Dy < -1e-6 ? -cy / Dy : Infinity;
    const ground = tg < Infinity;
    const gx0 = cx + tg * dx0, gxd = tg * kx, gz0 = cz + tg * dz0, gzd = tg * kz;
    const roofTop = Dy < 0, invDy = Dy !== 0 ? 1 / Dy : 0;
    for (let X = 0; X < W; X++) {
      const Dx = dx0 + X * kx, Dz = dz0 + X * kz;
      let t = tg;
      let kind = ground ? GR : SK;
      let a = 0, s2 = 0, who = 0, lat = 0, dep = 0;
      for (let k = 0; k < 4; k++) {
        const st = STANDS[k];
        const sb = st.sbox;
        if (Y < sb.y0 || Y > sb.y1 || X < sb.x0 || X > sb.x1) continue;
        const sg = st.s;
        const Dd = st.axis ? sg * Dx : sg * Dz;
        const Dl = st.axis ? Dz : Dx;
        const Cd = st.axis ? sg * cx : sg * cz;
        const Cl = st.axis ? cz : cx;
        // the tiers face the pitch
        const den = Dy - st.m * Dd;
        if (den < 0) {
          const tt = (st.y0 + st.m * (Cd - st.front) - cy) / den;
          if (tt > 0 && tt < t) {
            const dd = Cd + tt * Dd, ll = Cl + tt * Dl;
            if (dd >= st.front && dd <= st.back && ll <= st.half && ll >= -st.half) {
              t = tt; kind = TI; a = (dd - st.front) * st.slope; s2 = ll; who = st.who; lat = ll; dep = dd;
              // (a pixel's footprint on the tier: up the slope, the distance over the cosine of the angle it is seen at;
              // along the stand, stretched where the stand is seen edge on)
              const dn = Math.sqrt(Dx * Dx + Dy * Dy + Dz * Dz);
              TFP = (tt * st.slope * dn) / (f * -den);
              TFL = (tt * dn) / (f * Math.max(0.05, Math.abs(Dd)));
            }
          }
        }
        const rf = st.roof;
        if (rf && Dy !== 0) {
          const tt = ((roofTop ? rf.y : rf.y - rf.t) - cy) * invDy;
          if (tt > 0 && tt < t) {
            const dd = Cd + tt * Dd, ll = Cl + tt * Dl;
            if (dd >= rf.front && dd <= rf.back && ll <= st.half + 1 && ll >= -st.half - 1) {
              t = tt; kind = RF; a = roofTop ? 1 : 0; s2 = dd; who = st.who; lat = ll; dep = dd;
            }
          }
        }
        if (Dd !== 0) {
          const walls = st.walls;
          for (let j = 0; j < walls.length; j++) {
            const w = walls[j];
            if (Dd * w[3] >= 0) continue;
            const tt = (w[0] - Cd) / Dd;
            if (tt <= 0 || tt >= t) continue;
            const yy = cy + tt * Dy, ll = Cl + tt * Dl;
            if (yy >= w[1] && yy <= w[2] && ll <= st.half + w[5] && ll >= -st.half - w[5]) {
              t = tt; kind = WL; a = w[4]; s2 = (yy - w[1]) / (w[2] - w[1]); who = st.who; lat = ll; dep = w[0];
            }
          }
        }
      }
      // the advertising boards (facing the pitch)
      if (Y >= ADS_S.y0 && Y <= ADS_S.y1 && X >= ADS_S.x0 && X <= ADS_S.x1) {
        if (Dx !== 0) {
          const sg = Dx > 0 ? 1 : -1;
          const tt = (sg * ADS.x - cx) / Dx;
          if (tt > 0 && tt < t) {
            const yy = cy + tt * Dy, zz = cz + tt * Dz;
            if (yy >= 0 && yy <= ADS.h && zz <= ADS.z && zz >= -ADS.z) {
              t = tt; kind = AD; a = yy / ADS.h; s2 = zz; who = sg > 0 ? 3 : 2;
            }
          }
        }
        if (Dz !== 0) {
          const sg = Dz > 0 ? 1 : -1;
          const tt = (sg * ADS.z - cz) / Dz;
          if (tt > 0 && tt < t) {
            const yy = cy + tt * Dy, xx = cx + tt * Dx;
            if (yy >= 0 && yy <= ADS.h && xx <= ADS.x && xx >= -ADS.x) {
              t = tt; kind = AD; a = yy / ADS.h; s2 = xx; who = sg > 0 ? 1 : 0;
            }
          }
        }
      }
      // the board (facing the camera), on its truss
      if (Dz > 0 && Y >= BOARD_S.y0 && Y <= BOARD_S.y1 && X >= BOARD_S.x0 && X <= BOARD_S.x1) {
        const tt = (BOARD.z - cz) / Dz;
        if (tt > 0 && tt < t) {
          const yy = cy + tt * Dy, xx = cx + tt * Dx;
          if (yy >= BOARD.y0 && yy <= BOARD.y1 && xx >= BOARD.x0 && xx <= BOARD.x1) {
            t = tt; kind = BD; a = xx; s2 = yy;
          }
        }
      }
      const o = Y * W + X;
      DEPTH[o] = t;
      KIND[o] = kind;
      if (kind === GR) {
        const gx = gx0 + X * gxd, gz = gz0 + X * gzd;
        // the footprint: along the row (gxd, gzd), down the column (this row's point less the last row's)
        const bx = pg ? gx - (pgx0 + X * pgxd) : 0, bz = pg ? gz - (pgz0 + X * pgzd) : t / f;
        d[o] = shadeGround(gx, gz, gxd, gzd, bx, bz, X, Y, allOn);
      } else d[o] = shade(kind, t, a, s2, who, X, Y, Dy, f, allOn, lat, dep);
    }
    pg = ground;
    pgx0 = gx0; pgxd = gxd; pgz0 = gz0; pgzd = gzd;
  }
}

/** The colour of a pixel of the ground: the pitch (stripes, markings) under its lights, the apron, the country. */
function shadeGround(gx, gz, ax, az, bx, bz, X, Y, allOn) {
  const inGrass = gx <= GRASS_X && gx >= -GRASS_X && gz <= GRASS_Z && gz >= -GRASS_Z;
  const lit = lightAt(gx, gz);
  if (!inGrass) {
    const inside = Math.abs(gx) < SIDE.front && Math.abs(gz) < END.front;
    return DARK[inside ? step(0.08 + 0.95 * Math.min(1, lit)) : 0];
  }
  const ex = Math.abs(ax) + Math.abs(bx);
  const ez = Math.abs(az) + Math.abs(bz);
  const m = markings(gx, gz, ex, ez, ax, az, bx, bz);
  const L = Math.min(1.3, lit);
  if (L < 0.5) {
    // the markings in the dark: just made out, a solid slate line where it covers most of the pixel (never dotted)
    if (m >= 0.4) return C.slate;
  } else if (m >= 0.22) {
    // the markings under the lights: white, a step dimmer where thinner than a pixel
    const lv = 2 + 3 * Math.min(1, L) + (L > 1 ? 0.6 : 0);
    return ramp(LINES, m >= 0.5 ? lv : lv - 1.3, X, Y);
  }
  // the stripe: a solid band while it is three pixels or more deep on screen; where the stripes are finer than that (the
  // far end from the air) the two tones are dithered by their share of the pixel, a few rows only
  const dark = stripeShare(gz - ez / 2, gz + ez / 2);
  const k = ez < 1.75 ? (dark > 0.5 ? 1 : 0) : ditherAt(X, Y) < dark * 16 ? 1 : 0;
  // the light: its quarter's edge is a few metres of dither, never a wide checkerboard
  return ditherAt(X, Y) < Math.min(1, L) * 16 ? STRIPE_LIT[k] : STRIPE_DARK[k];
}

/** The light of a stand's quarter at a point of it (lateral position and depth along the stand, who: which stand). */
function standLight(who, lat, dep) {
  const sg = who & 1 ? 1 : -1;
  // (the floods aim at the pitch: a stand catches the light of the banks of its own quarter)
  return Math.min(1, who < 2 ? lightAt(clamp(lat, -40, 40), sg * 50) : lightAt(sg * 36, clamp(lat, -55, 55)));
}

/**
 * The colour of a pixel of the world (the ground has its own: shadeGround). Large flat surfaces (roofs, fascias, walls)
 * take whole palette steps by the light of their quarter, never a dithered middle tone.
 */
function shade(kind, t, a, s2, who, X, Y, Dy, f, allOn, lat, dep) {
  switch (kind) {
    case SK: {
      // the night: black overhead, an ink band along the horizon, the stadium's light dome (a little navy) once it is lit
      const e = Dy; // (D's forward component is 1: Dy is the tangent of the elevation, near enough)
      return SKY[Math.min(2, step(Math.max(0, 0.95 - e * 3.2) * (0.72 + 0.28 * allOn) + 0.42 * allOn * smoothstep(0.22, 0, e)))];
    }
    case TI:
      // the tiers: dark until their quarter's bank comes on, then the crowd
      return tierColour(a, lat, who, standLight(who, lat, dep) * 0.9, TFP, TFL, X, Y);
    case RF: {
      // the roofs: their tops catch the light dome once their quarter is lit, their undersides stay dark
      const lit = standLight(who, lat, dep);
      return a ? DARK[step(0.15 + 0.9 * lit)] : C.black;
    }
    case WL: {
      // the fascia: black, slate under the lights, its top edge catching them; the low front walls and the backs dark
      const lit = standLight(who, lat, dep);
      if (a === 2) return s2 > 0.72 ? (lit > 0.5 ? C.steel : C.ink) : DARK[step(0.3 + 1.4 * lit)];
      return DARK[step(a === 1 ? 0.1 + 1.0 * lit : 0.05 + 0.5 * lit)];
    }
    case AD: {
      // the advertising boards: black, the channel's orange band along them, lit with the floods of their quarter; a
      // board under three pixels tall is all band (never a dotted line)
      const sg = who & 1 ? 1 : -1;
      const lit = Math.min(1, who < 2 ? lightAt(s2, sg * 55) : lightAt(sg * 36, s2));
      const band = (a > 0.3 && a < 0.72) || t / f > ADS.h / 3;
      if (band) return lit > 0.5 ? C.orange : lit > 0.2 ? C.rust : C.maroon;
      return lit > 0.5 ? C.ink : C.black;
    }
    case BD: {
      // the board: a slate rim (orange while a short blast sounds), the truss under it, the LED grid on black
      const xx = a, yy = s2;
      if (yy < BOARD.truss) return ((X + Y) & 1) && yy > BOARD.y0 + 0.25 ? C.slate : C.black;
      const rim = xx < BOARD.x0 + 0.55 || xx > BOARD.x1 - 0.55 || yy > BOARD.y1 - 0.55 || yy < BOARD.truss + 0.55;
      if (rim) return BOARD_LIT ? C.orange : C.slate;
      return (X & 1) && (Y & 1) ? C.ink : C.black;
    }
    default:
      return C.black;
  }
}

// ---------------------------------------------------------------------------------------------
// The towers, the goals, the halos (drawn against the depth of each pixel)

function plot(X, Y, z, c) {
  if (X < 0 || X >= W || Y < 0 || Y >= H) return;
  const o = Y * W + X;
  if (z >= DEPTH[o]) return;
  LAYER.d[o] = c;
  DEPTH[o] = z;
}

const P0 = { x: 0, y: 0, z: 0 };
const P1 = { x: 0, y: 0, z: 0 };
/** A vertical post from (x, 0, z) to height h, w metres wide, its colour by height (lattice when wide enough). */
function post(cam, x, z, y0, y1, w, colourAt) {
  project(cam, x, y0, z, P0);
  project(cam, x, y1, z, P1);
  if (P0.z <= 0.5 || P1.z <= 0.5) return;
  const px = Math.max(1, (cam.f * w) / P0.z);
  const xa = Math.round(P0.x - px / 2), xb = Math.max(xa + 1, Math.round(P0.x + px / 2));
  const ya = Math.round(P1.y), yb = Math.round(P0.y);
  for (let Y = Math.max(0, ya); Y < Math.min(H, yb); Y++) {
    const hgt = y0 + ((yb - Y - 0.5) / Math.max(1, yb - ya)) * (y1 - y0);
    for (let X = xa; X < xb; X++) plot(X, Y, P0.z, colourAt(hgt, X - xa, xb - xa, Y));
  }
}

/** The towers: lattice masts, and heads of lamps facing the pitch (the near ones show their backs from the air). */
function towers(cam, b) {
  for (let i = 0; i < 4; i++) {
    const [tx, tz] = TOWERS[i];
    const l = LIGHT[i];
    post(cam, tx, tz, 0, TOWER_H - HEAD.h, 1.7, (hgt, col, wpx, Y) => {
      // a lattice: braces every 2.4 m, the edges lit when the lights are on
      const brace = (hgt % 2.4) < 0.5;
      if (wpx >= 3) return col === 0 || col === wpx - 1 || brace ? (l ? C.steel : C.slate) : C.black;
      return brace || (Y & 1) ? (l ? C.steel : C.slate) : C.ink;
    });
    // the head: a frame of lamps 9 x 5.5 m at the top, facing the pitch
    project(cam, tx, TOWER_H - HEAD.h / 2, tz, P0);
    if (P0.z <= 0.5) continue;
    const k = cam.f / P0.z;
    const hw = (HEAD.w * k) / 2 * 0.85, hh = (HEAD.h * k) / 2;
    const xa = Math.round(P0.x - hw), xb = Math.round(P0.x + hw), ya = Math.round(P0.y - hh), yb = Math.round(P0.y + hh);
    const facing = tz > 0 && cam.z < tz; // the far heads face the camera; the near ones show their backs from the air
    const flash = l > 1.05;
    const wpx = xb - xa + 1, hpx = yb - ya + 1;
    const z = P0.z - 0.2;
    // four by three lamps in whole pixels, a pixel between them, the grid centred in the frame; a head too small for
    // two-pixel lamps is one face (the grid never re-samples as the head grows: its cells change size in whole pixels)
    const iw = wpx - 2, ih = hpx - 2;
    const lw = Math.floor((iw - 3) / 4), lh = Math.floor((ih - 2) / 3);
    const grid = lw >= 2 && lh >= 2;
    const gx0 = xa + 1 + ((iw - (4 * lw + 3)) >> 1), gy0 = ya + 1 + ((ih - (3 * lh + 2)) >> 1);
    for (let Y = ya; Y <= yb; Y++) {
      for (let X = xa; X <= xb; X++) {
        const edge = X === xa || X === xb || Y === ya || Y === yb;
        let lamp = !grid, core = false;
        if (grid) {
          const u = X - gx0, v = Y - gy0;
          const cu = Math.floor(u / (lw + 1)), cv = Math.floor(v / (lh + 1));
          const fu = u - cu * (lw + 1), fv = v - cv * (lh + 1);
          lamp = u >= 0 && v >= 0 && cu < 4 && cv < 3 && fu < lw && fv < lh;
          core = lamp && fu < Math.max(1, lw >> 1) && fv < Math.max(1, lh >> 1);
        }
        let c;
        if (!facing) {
          // its back: the lamps' housings in the frame, their rims catching the spill when it is on (white in the flash)
          c = edge ? (flash ? C.white : l ? C.fog : C.slate) : !lamp ? C.black : flash ? C.silver : l ? C.slate : C.ink;
        } else if (edge) c = l ? C.steel : C.slate;
        else if (!lamp) c = C.black;
        else if (!l) c = C.ink; // dark glass
        else if (flash) c = C.white;
        else c = grid ? (core ? C.white : C.cream) : Y === ya + 1 || hpx <= 4 ? C.white : C.cream;
        plot(X, Y, z, c);
      }
    }
  }
}

const HALO = [C.black, C.ink, C.slate, C.steel, C.fog, C.silver, C.white];
// how bright each of the night's neutral colours is, in the halo's steps (a coloured surface is not in it)
const RANK = new Map([[C.black, 0], [C.ink, 1], [C.navy, 1], [C.deepGreen, 1], [C.slate, 2], [C.steel, 3], [C.fog, 4], [C.silver, 5], [C.white, 6]]);
/**
 * A soft halo round each lit head: cool white, static; larger and whiter during its flash. The tower stands in front of
 * whatever is behind it, so the glow lies over the sky, the land, the roofs and the stands' dark faces behind the head
 * wherever it is brighter than they are; whatever stands nearer than the head hides it; a coloured surface (the pitch,
 * the boards, a scarf) keeps its colour.
 */
function halos(cam) {
  for (let i = 0; i < 4; i++) {
    const l = LIGHT[i];
    if (!l) continue;
    const [tx, tz] = TOWERS[i];
    project(cam, tx, TOWER_H - HEAD.h / 2, tz, P0);
    if (P0.z <= 0.5) continue;
    const k = cam.f / P0.z;
    const fl = l - 1; // the flash (0.55 at the bang, gone in a tenth of a second)
    // (never under 22 px, so a far head seen from the air still has its glow round it)
    const r = Math.max(HEAD.w * k * (1.5 + 1.2 * fl) + 5, 22 * (1 + fl));
    const x0 = Math.max(0, Math.floor(P0.x - r)), x1 = Math.min(W - 1, Math.ceil(P0.x + r));
    const y0 = Math.max(0, Math.floor(P0.y - r)), y1 = Math.min(H - 1, Math.ceil(P0.y + r));
    for (let Y = y0; Y <= y1; Y++) {
      for (let X = x0; X <= x1; X++) {
        const o = Y * W + X;
        if (DEPTH[o] < P0.z) continue;
        const rk = RANK.get(LAYER.d[o]);
        if (rk === undefined) continue;
        const q = 1 - Math.hypot(X + 0.5 - P0.x, Y + 0.5 - P0.y) / r;
        if (q <= 0) continue;
        const v = band(q * Math.sqrt(q) * (4.6 + 4 * fl));
        if (v < 2) continue;
        const c = ramp(HALO, v, X, Y);
        if (RANK.get(c) > rk) LAYER.d[o] = c;
      }
    }
  }
}

/** The goals: two posts and the crossbar, white under the lights. */
function goals(cam) {
  for (const gz of [-PL, PL]) {
    const lit = Math.min(1, lightAt(0, gz));
    const col = lit > 0.5 ? C.white : lit > 0.15 ? C.silver : C.slate;
    for (const gx of [-GOAL.hw, GOAL.hw]) post(cam, gx, gz, 0, GOAL.h, 0.12, () => col);
    // the crossbar
    project(cam, -GOAL.hw, GOAL.h, gz, P0);
    project(cam, GOAL.hw, GOAL.h, gz, P1);
    if (P0.z <= 0.5 || P1.z <= 0.5) continue;
    const th = Math.max(1, Math.round((cam.f * 0.12) / P0.z));
    const y = Math.round(P0.y);
    for (let X = Math.round(P0.x); X <= Math.round(P1.x); X++) for (let k = 0; k < th; k++) plot(X, y + k, P0.z, col);
  }
}

// ---------------------------------------------------------------------------------------------
// The board's panel and its clock

/** The board's clock: 89:55 at the cut, a second every two beats, 90:00 from the first blast. */
export function clockAt(b) {
  const s = Math.min(5, Math.floor(b / 2 + 1e-6));
  return s >= 5 ? '9000' : `895${5 + s}`;
}

/** The panel's text at beat b and how open its band is (the flip: the old line closes, FULL TIME opens on the blast). */
function panelText(b) {
  const close = 0.24; // beats the old line takes to close (0.12 s)
  if (b < Q.flip - close) return { text: '2ND HALF', open: 1, colour: C.rust };
  if (b < Q.flip) return { text: '2ND HALF', open: 1 - (b - (Q.flip - close)) / close, colour: C.rust };
  return { text: 'FULL TIME', open: easeOutQuint(seg(b, Q.flip, 0.36)), colour: C.orange };
}

/** The panel's line, at a whole-pixel scale chosen by the panel's size on screen, centred in it. */
function panel(cam, b) {
  project(cam, PANEL.x0, (PANEL.y0 + PANEL.y1) / 2, BOARD.z, P0);
  project(cam, PANEL.x1, (PANEL.y0 + PANEL.y1) / 2, BOARD.z, P1);
  if (P0.z <= 0.5) return;
  const wpx = P1.x - P0.x;
  const { text, open, colour } = panelText(b);
  if (open <= 0) return;
  const g = textPixels(text, 'body');
  const s = Math.max(1, Math.floor(wpx / (g.width * 1.25)));
  const tw = g.width * s, th = 7 * s;
  const x0 = Math.round((P0.x + P1.x) / 2 - tw / 2), y0 = Math.round(P0.y - th / 2);
  const band = Math.max(1, Math.round(th * open));
  const b0 = y0 + ((th - band) >> 1);
  for (const [gx, gy] of g.pixels) {
    for (let j = 0; j < s; j++) {
      const Y = y0 + gy * s + j;
      if (Y < b0 || Y >= b0 + band) continue;
      for (let i = 0; i < s; i++) {
        const X = x0 + gx * s + i;
        if (X >= 0 && X < W && Y >= 0 && Y < H) LAYER.d[Y * W + X] = colour;
      }
    }
  }
}

/** The watch on the board (its clock) at its projected place and size. */
function watch(cam, b, T) {
  project(cam, WATCH.x, WATCH.y, WATCH.z, P0);
  if (P0.z <= 0.5) return;
  const k = (U * cam.f) / P0.z;
  paintWatch(T, P0.x, P0.y, k, { digits: clockAt(b), colon: true, lit: 1, press: b >= Q.whistle[0] && b < Q.whistle[0] + 0.5 ? 1 : 0 });
}

// ---------------------------------------------------------------------------------------------
// The sequence

let FIELD = null;
/** The open's field (the package's backdrop) as pixels, read once from its canvas (for the dissolve). */
function fieldPixels() {
  if (FIELD) return FIELD;
  const cv = SPORT_OPEN.background();
  try {
    const img = cv.getContext('2d').getImageData(0, 0, W, H);
    FIELD = new Uint32Array(img.data.buffer.slice(0));
  } catch {
    FIELD = new Uint32Array(W * H).fill(C.black);
  }
  return FIELD;
}

// the stadium drops away on the downbeat that starts the signature, the watch held through the cut (a match cut on the
// clock): three frames through the screen's matrix, so the cut is a cut, never a long screen door
const CUT = 15;
const DISSOLVE = [CUT - 0.1, CUT + 0.1];

/** The stadium at beat b painted into the layer (everything but the dissolve). */
export function paintStadium(b) {
  for (let i = 0; i < 4; i++) LIGHT[i] = bankAt(i, b);
  BOARD_LIT = Q.whistle.slice(0, 2).some((w) => b >= w && b < w + 0.4) ? 1 : 0;
  UP = b - Q.flip - 0.5; // (half a beat into the long blast, inside the clock's shot)
  const cam = cameraAt(b);
  LAYER.begin(0);
  paintWorld(b, cam);
  halos(cam);
  towers(cam, b);
  goals(cam);
  panel(cam, b);
  return cam;
}

function before(ctx, dt) {
  const b = dt / BEAT;
  if (b >= Q.settle) {
    // the emblem itself on the open's field: the package's first frame
    ctx.drawImage(SPORT_OPEN.background(), 0, 0);
    SPORT_OPEN.emblem(ctx, BUILD_DONE, CENTRE.x, CENTRE.y, ZOOM);
    return;
  }
  const cam = paintStadium(b);
  const dis = smoothstep(DISSOLVE[0], DISSOLVE[1], b);
  if (dis > 0) {
    const field = fieldPixels();
    const d = LAYER.d;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (ditherAt(x, y) < dis * 16) d[y * W + x] = field[y * W + x];
  }
  watch(cam, b, { d: LAYER.d, w: W, h: H, ox: 0, oy: 0 });
  LAYER.end(ctx);
}

// from the reveal on the package plays its open, the watch settled at 90:00
const REVEAL = { ...SPORT_OPEN, emblem: (ctx, dt, x, y, k) => SPORT_OPEN.emblem(ctx, Math.max(dt, BUILD_DONE), x, y, k) };
const SEQ = sequence({ hit: HIT, before, reveal: REVEAL });

/** FULL TIME's title sequence at dt seconds (full frame). */
export function drawFullTimeTitles(ctx, dt, info) {
  SEQ.draw(ctx, dt, info);
}

export const FULLTIME_TITLES = { ...SPORT_OPEN, warmJobs: () => [...SPORT_OPEN.warmJobs(), fieldPixels] };
export const FULLTIME_SEQ = SEQ;
/** For checks: the camera at beat b; the watch's projected place and size; a bank's light; the panel's line. */
export const fullTimeCamera = (b) => {
  const c = cameraAt(b, { F: [], R: [], U: [] });
  return { x: c.x, y: c.y, z: c.z, f: c.f, px: c.px, py: c.py, F: [...c.F], moving: c.moving };
};
export function watchOnScreen(b) {
  const cam = cameraAt(b, { F: [], R: [], U: [] });
  const p = project(cam, WATCH.x, WATCH.y, WATCH.z, { x: 0, y: 0, z: 0 });
  return { x: p.x, y: p.y, k: (U * cam.f) / p.z };
}
export const fullTimeBank = (i, b) => bankAt(i, b);
/** For checks: the stadium's pixels at beat b (the layer, before the watch and the dissolve); the framing on air. */
export function fullTimeFrame(b) {
  paintStadium(b);
  return LAYER.d;
}
export const fullTimeFraming = (b) => framingAt(b);
export const fullTimePanel = (b) => panelText(b);
export { TOWERS as FULLTIME_TOWERS, WATCH as FULLTIME_WATCH, U as FULLTIME_UNIT };
