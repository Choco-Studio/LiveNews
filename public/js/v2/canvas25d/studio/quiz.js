// PAY ATTENTION's quiz studio (docs/programmes/pay-attention.md §6, build step 5): a low stage in a dark room. The
// question board is the network's main screen (SET.screen) in a purple frame with a 1-px fog rim; the host's podium in
// the centre in front of it; two contestant desks either side, each with its player's shape lamp (a circle on seat A,
// a square on seat B: players are told apart by shape and name, never by colour alone, never by a letter) and a score
// display in pixel digits; two moving heads on the back wall, at its outer edges, that sweep slowly between questions
// and hold still during one. Light: white and gold only (gold = a lit lamp); purple only as fills, on the desk fronts
// and the board's frame, always with its fog rim. Nothing here borrows TECH BYTES's purple-and-magenta rings or LEDs or
// COSMOS's purple glow (public/js/set.js THEMES.tech / .space).
//
//   QUIZ                       the geometry (world units: cm, X right, Y down from the desk top, Z away from the lens)
//   QUIZ_SEATS                 the three seated anchors for the director (step 4): host centre, A left, B right
//   quizCamera(name)           the framings the lab proposes for those seats ('wide', 'host', 'player-a', 'player-b')
//   setQuizState(o, t)         the director's hook: { question, lamps: { A, B }, scores: { A, B } } at time t
//   quizState()                the state as the set holds it (a copy)
//   sweepClock(t), beamAngle(t)  the moving heads' sweep (seconds of sweep; the beam's inward angle, radians)
//   beamOf(cam, side, t)       a moving head's lens and beam on screen (tests: clear of every head)
//   quizRoom / quizFloor       the dressing (dressing.js DRESS / FLOORS)
//   rasterQuizDesks(...)       the podium and the two desks, instead of the network's curved desk (set.js drawDesk)
//   LIVE_DRAW['pay-attention'] the moving heads, the lit lamps and the scores, every frame over the cached set
import { C } from '../pixbuf.js';
import { F, SET, kAt, sxOf, syOf } from './geometry.js';
import { LIVE_DRAW } from './live.js';
import { lift } from './light.js';
import { textPixels } from '../../../font.js';

const W = 384, H = 216;
const DEG = Math.PI / 180;
const B16 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/**
 * The studio's geometry. Every person sits at SET.presenterZ (the network's depth: placeActor and the rig's scales are
 * unchanged); the desks' fronts stand at the network desk's depth, the podium a little forward of them.
 */
export const QUIZ = Object.freeze({
  seats: Object.freeze({
    host: Object.freeze({ X: 0, Z: SET.presenterZ, side: 0 }),
    A: Object.freeze({ X: -118, Z: SET.presenterZ, side: 1 }), // faces screen-right, toward the host
    B: Object.freeze({ X: 118, Z: SET.presenterZ, side: -1 }),
  }),
  // a box each: centre X, half width, front Z, depth to the back edge (the top at Y 0, the foot on the stage at Y 52)
  podium: Object.freeze({ X: 0, hw: 33, Z: 884, depth: 60 }),
  desks: Object.freeze({
    A: Object.freeze({ X: -118, hw: 34, Z: 900, depth: 60 }),
    B: Object.freeze({ X: 118, hw: 34, Z: 900, depth: 60 }),
  }),
  // the purple band of a contestant desk's front, its fog rim on its edge (world Y under the top)
  fascia: Object.freeze({ y0: 1.6, y1: 13.6, inset: 3 }),
  // the shape lamp: on the desk's inner end (toward the host), diameter / side in world units
  lamp: Object.freeze({ inset: 9, size: 7.4 }),
  // the network's red plate on the podium (its half width, top and foot below the top)
  plate: Object.freeze({ hw: 27, y0: 3.2, y1: 15.6 }),
  // the question board's purple frame round the screen's bezel (world units on the wall)
  frame: 9,
  // the low stage: its front edge (a white LED nosing) in front of the desks, the riser under it
  stageZ: 833,
  // the two moving heads on the back wall (X mirrored), their beams' length and spread in wall units
  heads: Object.freeze({ X: 226, Y: -104, length: 62, spread: 14 * DEG, r: 5.6 }),
});

/**
 * The three seated anchors for the director (step 4): world X and Z of each neck base (Y = SET.neckY), the rig's
 * `side` (+1 looks screen-right, -1 screen-left, 0 to the lens). The host sits at the solo seat (SET.seatX.solo), so
 * the network's solo framings and the wall's solo layout already frame the host in front of the board.
 */
export const QUIZ_SEATS = QUIZ.seats;

// ---------------------------------------------------------------------------------------------------- the state hook

// The moving heads sweep while there is no question and hold still during one. The sweep runs on its own clock, which
// slows to a stop over RAMP s when a question starts and picks up again over RAMP s when it ends, so the beams never jump:
// a pure function of t and the question marks the director has set.
const SWEEP = Object.freeze({ period: 16, ramp: 0.8, centre: -13 * DEG, amp: 14 * DEG });
const STATE = { question: false, lamps: { A: false, B: false }, scores: { A: null, B: null }, marks: [], base: { t: 0, s: 0, v: 1 } };

/**
 * The director's hook (step 4): `question` true while a question is on the screen (the moving heads hold still), the
 * lamps lit (a lock-in or a buzz: gold), the scores on the desks' displays (whole numbers 0-99, null blank). `t` is the
 * set's clock (the time drawBackground is given) at which the question flag changed.
 */
export function setQuizState(o = {}, t = NaN) {
  if (o && 'question' in o) {
    const on = !!o.question;
    if (on !== STATE.question) {
      STATE.question = on;
      if (Number.isFinite(t)) addMark(t, on);
    }
  }
  if (o?.lamps) for (const k of ['A', 'B']) if (k in o.lamps) STATE.lamps[k] = !!o.lamps[k];
  if (o?.scores) {
    for (const k of ['A', 'B']) {
      if (!(k in o.scores)) continue;
      const v = o.scores[k];
      STATE.scores[k] = Number.isFinite(v) ? Math.max(0, Math.min(99, Math.round(v))) : null;
    }
  }
}
/** The set's quiz state (a copy). */
export const quizState = () => ({ question: STATE.question, lamps: { ...STATE.lamps }, scores: { ...STATE.scores } });
/** Back to the start: no question, lamps off, displays blank, the sweep's clock = t (tests, labs). */
export function resetQuizState() {
  STATE.question = false;
  STATE.lamps.A = STATE.lamps.B = false;
  STATE.scores.A = STATE.scores.B = null;
  STATE.marks.length = 0;
  STATE.base = { t: 0, s: 0, v: 1 };
}

function addMark(t, on) {
  const m = STATE.marks;
  // a mark earlier than the last one replaces the history after it (a lab scrubbing back)
  while (m.length && m[m.length - 1].t > t) m.pop();
  m.push({ t, on });
  // fold the oldest marks into the base (24/7: the history stays short)
  while (m.length > 12) {
    const first = m.shift();
    const b = STATE.base;
    const end = segEnd(b, first.t);
    STATE.base = { t: first.t, s: end.s, v: end.v, target: first.on ? 0 : 1 };
  }
}
// the speed's integral over a segment that starts at speed v and eases to `target` over RAMP s (smoothstep)
const R = SWEEP.ramp;
function rampInt(d) {
  if (d <= 0) return 0;
  if (d >= R) return R * 0.5 + (d - R);
  const u = d / R;
  return R * (u * u * u - (u * u * u * u) / 2);
}
function segEnd(b, t) {
  const target = b.target ?? 1;
  const d = Math.max(0, t - b.t);
  return { s: b.s + b.v * d + (target - b.v) * rampInt(d), v: b.v + (target - b.v) * smooth(d / R) };
}
/** Seconds of sweep at time t: t itself while no question has been asked; it stands still during a question. */
export function sweepClock(t) {
  let seg = STATE.base;
  for (const m of STATE.marks) {
    if (m.t > t) break;
    const end = segEnd(seg, m.t);
    seg = { t: m.t, s: end.s, v: end.v, target: m.on ? 0 : 1 };
  }
  if (t < seg.t) return seg.s - (seg.t - t) * seg.v;
  return segEnd(seg, t).s;
}
/** The beams' inward angle from straight down at time t (radians: positive toward the centre of the stage). */
export const beamAngle = (t) => SWEEP.centre + SWEEP.amp * Math.sin((2 * Math.PI * sweepClock(t)) / SWEEP.period);
export const BEAM_RANGE = Object.freeze([SWEEP.centre - SWEEP.amp, SWEEP.centre + SWEEP.amp]);

// ------------------------------------------------------------------------------------------------- the framings

/**
 * The framings the lab proposes for the quiz's three seats (for the director, step 4): 'wide' is the network's solo
 * wide pulled back 5 % and lowered 11 px (the host in front of the board, the contestants inside the frame at their
 * desks): in the solo wide itself the board's frame rose into the graphics' top row, where the programme's purple tag
 * (8 s after the open and after breaks) merged with the purple frame and the clock's plate cut the right pool; here the
 * frame's top is 6 px under the row, the desks' fronts and the podium's plate end above the graphics zone (y 150) and
 * the stage's lit nosing sits in the wide's free rows (y 198, under the captions, over the ticker); 'host' the network's centred
 * single on the solo seat; 'player-a' / 'player-b' a single on a contestant, on their own side of the frame, the board
 * beside them toward the centre. Cameras as camera.js makes them ({ x, y, z, zoom, hy, soft }).
 */
export function quizCamera(name, metrics = null) {
  const cam = (o) => ({ x: 0, y: -60, z: 0, zoom: 1, hy: 52, soft: 0, ...o });
  if (name === 'wide') return cam({ x: 0, y: -36, z: 80, zoom: 0.95, hy: 87, soft: 0 });
  const M = metrics || { cx: 0, eye: -14.1 };
  const compose = (X, k, headX, eyeY, cz, cy) => {
    const zoom = (k * (SET.presenterZ - cz)) / F;
    const s = Math.max(0.5, Math.round(22 * k) / 22);
    return cam({ x: X + (M.cx * s) / k - (headX - 192) / k, y: cy, z: cz, zoom, hy: eyeY - (SET.neckY - cy) * k - M.eye * s, soft: 1 });
  };
  if (name === 'host') return compose(QUIZ.seats.host.X, 3.2, 192, 70, 420, -36);
  if (name === 'player-a') return compose(QUIZ.seats.A.X, 3.2, 120, 70, 520, -36);
  if (name === 'player-b') return compose(QUIZ.seats.B.X, 3.2, 264, 70, 520, -36);
  return quizCamera('wide');
}
export const QUIZ_FRAMINGS = Object.freeze(['wide', 'host', 'player-a', 'player-b']);

// --------------------------------------------------------------------------------------------- helpers (world → px)

function rectZ(fr, cam, Z, X0, Y0, X1, Y1, c) {
  const k = kAt(cam, Z);
  const x0 = Math.round(sxOf(cam, k, X0)), x1 = Math.round(sxOf(cam, k, X1));
  const y0 = Math.round(syOf(cam, k, Y0)), y1 = Math.round(syOf(cam, k, Y1));
  if (x1 <= 0 || x0 >= W || y1 <= 0 || y0 >= H) return;
  fr.span(x0, y0, Math.max(x1, x0 + 1), Math.max(y1, y0 + 1), c);
}

// ------------------------------------------------------------------------------------------------- the room (dressing)

/**
 * The room behind the desks (the back wall's light is the style's bake: black, a soft pool behind each contestant):
 * the question board's frame, purple with its fog rim, round the screen's black bezel, hung from the grid on two black
 * drop pipes; the moving heads' wall brackets (their heads and beams move: the live layer).
 */
export function quizRoom(fr, cam, style, soft) {
  const S = SET.screen, m = QUIZ.frame, Zw = SET.wallZ;
  const k = kAt(cam, Zw);
  // the frame: purple fill, its 1-px fog rim (purple alone on the dark set is 2.0:1 against black and would vanish), in
  // the singles too (the board's own words stay fog there); whole pixels at the frame's own edges, so the rim is one
  // pixel at every scale. (No drop pipes: black on the black wall, they showed only as two notches in the ceiling line.)
  const x0 = Math.round(sxOf(cam, k, S.x0 - m)), x1 = Math.round(sxOf(cam, k, S.x1 + m));
  const y0 = Math.round(syOf(cam, k, S.y0 - m)), y1 = Math.round(syOf(cam, k, S.y1 + m));
  if (x1 > 0 && x0 < W && y1 > 0 && y0 < H) {
    fr.span(x0, y0, x1, y1, C.fog);
    fr.span(x0 + 1, y0 + 1, x1 - 1, y1 - 1, C.purple);
  }
  // the moving heads' brackets: a short black arm off the wall each side (the head itself turns: the live layer)
  for (const sx of [-1, 1]) {
    const X = sx * QUIZ.heads.X, Y = QUIZ.heads.Y;
    rectZ(fr, cam, Zw, X - 3, Y - 9, X + 3, Y - 6, C.black);
    if (!soft) rectZ(fr, cam, Zw, X - 3, Y - 9, X + 3, Y - 8.2, C.ink);
  }
}

/**
 * The stage: its deck black and glossy from the back wall's foot (one ink row, the skirting) to the camera (the
 * network's floor dithers ink toward the wall; between the quiz's desks that band showed as a strip of carpet), and its
 * front edge in front of the desks: a white LED nosing, the riser black under it.
 */
export function quizFloor(fr, cam, style, soft) {
  const kw = kAt(cam, SET.wallZ);
  const yw = Math.max(0, Math.round(syOf(cam, kw, SET.floorY)));
  for (let y = yw; y < H; y++) fr.px.fill(y === yw ? C.ink : C.black, y * W, y * W + W);
  const k = kAt(cam, QUIZ.stageZ);
  const y = Math.round(syOf(cam, k, SET.floorY));
  if (y < 0 || y >= H) return;
  // (white light, kept low: the diodes fog and steel by turns, their light falling down the riser's top in slate then ink,
  // broken under each desk's ends: a fixture on the stage's edge, not a ruled line across the picture)
  const x0 = Math.max(0, Math.round(sxOf(cam, k, -420))), x1 = Math.min(W, Math.round(sxOf(cam, k, 420)));
  const breaks = new Set();
  for (const b of BOXES) for (const X of [b.X - b.hw, b.X + b.hw]) breaks.add(Math.floor(sxOf(cam, k, X)));
  for (let x = x0; x < x1; x++) {
    const gap = breaks.has(x);
    fr.px[y * W + x] = gap ? C.black : soft ? C.slate : (x & 1) ? C.steel : C.fog;
    if (y + 1 < H) fr.px[(y + 1) * W + x] = gap ? C.black : soft ? C.ink : C.slate;
    if (y + 2 < H) fr.px[(y + 2) * W + x] = gap || soft ? C.black : C.ink;
    for (let yy = y + 3; yy < H; yy++) fr.px[yy * W + x] = C.black;
  }
}

// ---------------------------------------------------------------------------------------------------- the desks

/** The boxes in drawing order (far to near): A, B, the podium. */
const BOXES = [
  { id: 'A', ...QUIZ.desks.A },
  { id: 'B', ...QUIZ.desks.B },
  { id: 'host', ...QUIZ.podium },
];

/** Screen geometry of a desk box for a camera: its front rect, its top surface's back row, its scale. */
export function deskRect(cam, id) {
  const b = BOXES.find((x) => x.id === id);
  const kf = kAt(cam, b.Z), kb = kAt(cam, b.Z + b.depth);
  return {
    kf, kb,
    x0: sxOf(cam, kf, b.X - b.hw), x1: sxOf(cam, kf, b.X + b.hw),
    yTop: syOf(cam, kf, 0), yFoot: syOf(cam, kf, SET.deskH), yBack: syOf(cam, kb, 0),
    X: b.X, hw: b.hw, Z: b.Z,
  };
}

/**
 * The podium and the two desks (instead of the network's curved desk), filling clipRows with each column's desk top
 * (the people sit behind them). `plate(fr, kc, x0, y0, x1, y1)` draws the network's red plate (set.js: the block, its
 * shade and the logo). Every box: a black body, its top's front edge catching the key (silver), its top surface black,
 * a side face (ink) where the lens sees one. The desks' fronts: the purple band with its fog rim holding the shape lamp
 * (unlit: its fog outline on ink) and the score display's black window; the podium's front: the network's plate.
 */
export function rasterQuizDesks(fr, cam, clipRows, style, plate) {
  clipRows.fill(H);
  const px = fr.px;
  for (const b of BOXES) {
    const Zf = b.Z, Zb = b.Z + b.depth;
    const kf = kAt(cam, Zf), kb = kAt(cam, Zb);
    const X0 = b.X - b.hw, X1 = b.X + b.hw;
    const fx0 = Math.round(sxOf(cam, kf, X0)), fx1 = Math.round(sxOf(cam, kf, X1));
    const yT = Math.round(syOf(cam, kf, 0)), yF = Math.min(H, Math.round(syOf(cam, kf, SET.deskH)));
    // the top surface: rows from its back edge to its front edge, each row at its own depth
    const yB = Math.round(syOf(cam, kb, 0));
    if (cam.y < 0) {
      for (let y = Math.max(0, yB); y < Math.min(H, yT); y++) {
        // the depth seen on this row (the plane Y = 0): k = (y + 0.5 - hy) / (0 - cam.y)
        const k = (y + 0.5 - cam.hy) / (0 - cam.y);
        if (!(k > 0)) continue;
        const xa = Math.max(0, Math.round(sxOf(cam, k, X0))), xb = Math.min(W, Math.round(sxOf(cam, k, X1)));
        if (xb > xa) px.fill(C.black, y * W + xa, y * W + xb);
        for (let x = xa; x < xb; x++) if (y < clipRows[x]) clipRows[x] = y;
      }
    }
    // a side face, where the lens is beside the box: black (turned away from the key; the front is the lit face)
    for (const [Xs, vis] of [[X0, cam.x < X0], [X1, cam.x > X1]]) {
      if (!vis) continue;
      const xa = Math.round(sxOf(cam, kf, Xs)), xb2 = Math.round(sxOf(cam, kb, Xs));
      const lo = Math.max(0, Math.min(xa, xb2)), hi = Math.min(W, Math.max(xa, xb2));
      for (let x = lo; x < hi; x++) {
        const k = (x + 0.5 - 192) / (Xs - cam.x);
        if (!(k > 0)) continue;
        const ya = Math.max(0, Math.round(syOf(cam, k, 0))), yb = Math.min(H, Math.round(syOf(cam, k, SET.deskH)));
        for (let y = ya; y < yb; y++) px[y * W + x] = C.black;
        if (ya < clipRows[x]) clipRows[x] = Math.max(0, ya);
      }
    }
    // the front: a matte ink panel (it stands off the black stage, in the graphics zone too: black and ink only there);
    // the top's front edge lit (one row, silver), a black reveal under it
    if (fx1 <= 0 || fx0 >= W) continue;
    fr.span(fx0, yT, fx1, yF, C.ink);
    if (yT >= 0 && yT < H) fr.span(fx0, yT, fx1, yT + 1, C.silver);
    if (yT + 1 >= 0 && yT + 1 < H) fr.span(fx0, yT + 1, fx1, yT + 2, C.black);
    for (let x = Math.max(0, fx0); x < Math.min(W, fx1); x++) if (yT < clipRows[x]) clipRows[x] = Math.max(0, yT);
    // the front's kick: a black band at its foot (in the graphics zone: black and ink only)
    const yK = Math.round(syOf(cam, kf, SET.deskH - 6));
    if (yK < yF) fr.span(fx0, Math.max(0, yK), fx1, yF, C.black);
    // the front's left edge catches the key (camera-left): one slate column down the front's top section (to the groove
    // under the band; the podium's, to its plate's foot), never into the graphics zone; its modules' joints, two recessed
    // seams (black) a third of the way in from each end, under the band (a desk built in panels, not a box)
    const yS = Math.round(syOf(cam, kf, b.id === 'host' ? 1.4 : QUIZ.fascia.y1 + 0.8));
    const yE = b.id === 'host' ? Math.round(syOf(cam, kf, QUIZ.plate.y1 + 0.8)) : yS + 1;
    if (fx0 >= 0 && fx0 < W) for (let y = Math.max(0, yT + 2); y < Math.min(150, yK, yE); y++) fr.px[y * W + fx0] = C.slate;
    if (b.id !== 'host') {
      for (const f of [-1 / 3, 1 / 3]) {
        const x = Math.round(sxOf(cam, kf, b.X + f * 2 * b.hw));
        if (x > fx0 && x < fx1 - 1) fr.span(x, Math.max(0, yS + 1), x + 1, Math.max(yS + 1, yK), C.black);
      }
    }
    if (b.id === 'host') {
      // the network's red plate, centred high on the podium (above the captions in the wide)
      const P = QUIZ.plate;
      const x0 = Math.round(sxOf(cam, kf, b.X - P.hw)), x1 = Math.round(sxOf(cam, kf, b.X + P.hw));
      const y0 = Math.round(syOf(cam, kf, P.y0)), y1 = Math.round(syOf(cam, kf, P.y1));
      if (plate) plate(fr, kf, x0, y0, x1, y1);
      else fr.span(x0, y0, x1, y1, C.red);
      continue;
    }
    deskFront(fr, cam, b, kf);
  }
}

/** A contestant desk's front: the purple band with its fog rim, the shape lamp (unlit) and the score window. */
function deskFront(fr, cam, b, kf) {
  const Fa = QUIZ.fascia;
  const X0 = b.X - b.hw + Fa.inset, X1 = b.X + b.hw - Fa.inset;
  const x0 = Math.round(sxOf(cam, kf, X0)), x1 = Math.round(sxOf(cam, kf, X1));
  const y0 = Math.round(syOf(cam, kf, Fa.y0)), y1 = Math.round(syOf(cam, kf, Fa.y1));
  if (x1 - x0 < 6 || y1 - y0 < 4) return;
  fr.span(x0, y0, x1, y1, C.fog);
  fr.span(x0 + 1, y0 + 1, x1 - 1, y1 - 1, C.purple);
  // a recessed groove under the band (the band is a panel set into the front)
  if (y1 < H) fr.span(Math.round(sxOf(cam, kf, b.X - b.hw)), y1, Math.round(sxOf(cam, kf, b.X + b.hw)), y1 + 1, C.black);
  const lp = lampRect(cam, b.id);
  paintLamp(fr, lp, b.id, false);
  const sw = scoreRect(cam, b.id);
  fr.span(sw.x0, sw.y0, sw.x1, sw.y1, C.black);
}

/** The shape lamp of desk A (circle) or B (square) on screen: its box and its pixel size. */
export function lampRect(cam, id) {
  const b = QUIZ.desks[id];
  const kf = kAt(cam, b.Z);
  const inner = id === 'A' ? 1 : -1; // the end of the desk nearer the host
  const X = b.X + inner * (b.hw - QUIZ.lamp.inset);
  const Fa = QUIZ.fascia;
  const cy = syOf(cam, kf, (Fa.y0 + Fa.y1) / 2);
  // whole pixels, odd for the circle (a centre pixel), even for the square; the lamp and its housing ring always inside
  // the band's rim (room: the band's rows less its two rim rows and the ring's two)
  const fy0 = Math.round(syOf(cam, kf, Fa.y0)), fy1 = Math.round(syOf(cam, kf, Fa.y1));
  const room = Math.max(5, fy1 - fy0 - 4);
  let n = Math.max(5, Math.min(room, Math.round(QUIZ.lamp.size * kf)));
  if ((id === 'A') === (n % 2 === 0)) n += n + 1 <= room ? 1 : -1;
  const x0 = Math.round(sxOf(cam, kf, X) - n / 2);
  const y0 = Math.min(Math.max(Math.round(cy - n / 2), fy0 + 2), fy1 - 2 - n);
  return { x0, y0, n, id };
}

/**
 * Paint a lamp into its box: the housing's black ring, then the shape: unlit an ink face with a 1-px fog outline (the
 * shape reads whether lit or not), lit a gold face (yellow) with a cream highlight and an orange shade on its lower
 * edge. The circle is a disc of radius n/2 (pixel centres), the square fills its box.
 */
export function paintLamp(fr, lp, id, lit) {
  const { x0, y0, n } = lp;
  const r = n / 2, cx = x0 + r, cy = y0 + r;
  const inShape = (x, y, grow) => {
    if (id === 'B') return x >= x0 - grow && x < x0 + n + grow && y >= y0 - grow && y < y0 + n + grow;
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    return dx * dx + dy * dy <= (r + grow) * (r + grow) - (grow ? 0 : 0.25);
  };
  for (let y = y0 - 1; y <= y0 + n; y++) {
    for (let x = x0 - 1; x <= x0 + n; x++) {
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      const o = y * W + x;
      if (!inShape(x, y, 0)) {
        if (inShape(x, y, 1)) fr.px[o] = C.black; // the housing's ring
        continue;
      }
      const edge = !inShape(x - 1, y, 0) || !inShape(x + 1, y, 0) || !inShape(x, y - 1, 0) || !inShape(x, y + 1, 0);
      if (!lit) {
        fr.px[o] = edge ? C.fog : C.ink;
        continue;
      }
      // lit: gold, its highlight up-left, its shade along the lower edge
      const lower = edge && !inShape(x, y + 1, 0);
      const hi = !edge && x + 0.5 - cx < -r * 0.15 && y + 0.5 - cy < -r * 0.15 && x + 0.5 - cx > -r * 0.75 && y + 0.5 - cy > -r * 0.75;
      fr.px[o] = lower ? C.orange : hi ? C.cream : C.yellow;
    }
  }
}

/** The score display's black window on desk A or B (screen px), and the digits' pixel scale. */
export function scoreRect(cam, id) {
  const b = QUIZ.desks[id];
  const kf = kAt(cam, b.Z);
  const Fa = QUIZ.fascia;
  const s = Math.max(1, Math.floor(kf * 0.9 + 0.15));
  const w = (2 * 5 + 1) * s + 4 * s, h = 7 * s + 2 * s;
  // centred on the desk, a little toward its outer end (the lamp is on the inner end)
  const outer = id === 'A' ? -1 : 1;
  const cx = sxOf(cam, kf, b.X + outer * 4), cy = syOf(cam, kf, (Fa.y0 + Fa.y1) / 2);
  const x0 = Math.round(cx - w / 2), y0 = Math.round(cy - h / 2);
  return { x0, y0, x1: x0 + w, y1: y0 + h, s };
}

/** The score's digits (white, pixel digits from the channel's body face) in their window: two digits, right-aligned. */
export function paintScore(fr, sw, value) {
  if (value == null) return;
  const text = String(Math.max(0, Math.min(99, value | 0)));
  const s = sw.s;
  const t = textPixels(text, 'body');
  // right-aligned in a two-digit field (the units digit always in the same place)
  const x = sw.x1 - 2 * s - t.width * s, y = sw.y0 + s;
  for (const [gx, gy] of t.pixels) fr.span(x + gx * s, y + gy * s, x + (gx + 1) * s, y + (gy + 1) * s, C.white);
}

// ------------------------------------------------------------------------------------------------ the moving heads

/**
 * A moving head on screen for a camera at time t: its lens (screen px), the beam's direction (unit vector, y down),
 * its length and spread in px, and the head's pixel size. side -1 is the left head (on the wall at -X), +1 the right.
 */
export function beamOf(cam, side, t) {
  const k = kAt(cam, SET.wallZ);
  const X = side * QUIZ.heads.X, Y = QUIZ.heads.Y;
  const a = beamAngle(t);
  // inward: the left head's beam leans toward +x, the right head's toward -x (mirrored)
  const dx = -side * Math.sin(a), dy = Math.cos(a);
  const s = Math.max(1, Math.round(k * 1.3));
  // the lens: on the barrel's face, the barrel's radius out from its axis along the beam
  const r = Math.max(2.6, QUIZ.heads.r * k * 1.25);
  const lx = sxOf(cam, k, X) + dx * (r - 0.6), ly = syOf(cam, k, Y) + dy * (r - 0.6);
  return { lx, ly, dx, dy, len: QUIZ.heads.length * k, spread: QUIZ.heads.spread, k, s };
}

// the beam's light in haze, posterised (flat steps, a short Bayer band between them): steel at the lens, slate, ink, then
// out into the black; it only lifts darker pixels (a light never darkens what it falls on), never brighter than steel
// (L* 44, under every face)
const BEAM_RAMP = [0, C.ink, C.slate, C.steel];
function drawBeam(fr, bm, clipRows, soft) {
  const { lx, ly, dx, dy, len, spread } = bm;
  const tan = Math.tan(spread);
  const reach = len + 2;
  const xa = Math.max(0, Math.floor(Math.min(lx, lx + dx * reach) - reach * tan - 3));
  const xb = Math.min(W, Math.ceil(Math.max(lx, lx + dx * reach) + reach * tan + 3));
  const ya = Math.max(0, Math.floor(ly)), yb = Math.min(H, Math.ceil(ly + dy * reach + reach * tan + 3));
  const peak = soft ? 1.6 : 2.7;
  for (let y = ya; y < yb; y++) {
    for (let x = xa; x < xb; x++) {
      if (clipRows && y >= clipRows[x]) continue;
      const rx = x + 0.5 - lx, ry = y + 0.5 - ly;
      const d = rx * dx + ry * dy; // along the beam
      if (d <= 0.5 || d >= len) continue;
      const off = Math.abs(rx * dy - ry * dx); // across it
      const hw = 1 + d * tan;
      if (off >= hw) continue;
      const u = d / len, v = off / hw;
      // (a flat cross-section with a soft edge, bright down most of its length, fading out toward its end)
      const lvl = peak * (1 - 0.92 * u * Math.sqrt(u)) * (1 - v * v * v);
      const i = Math.floor(lvl), f = lvl - i;
      let step = i;
      if (f > 0.62 && (f - 0.62) / 0.38 * 16 > B16[((y & 3) << 2) | (x & 3)]) step++;
      if (step <= 0) continue;
      lift(fr, x, y, BEAM_RAMP[Math.min(3, step)]);
    }
  }
}

// the moving head, hung from its bracket: the black yoke (a bar under the bracket, an arm down each side), the head
// between the arms (a slate barrel, its rim steel where the key catches it, up and to the left), its lens on the barrel's
// face turned along the beam (a silver disc, a white heart), so the fixture is seen to turn with its light
function drawHead(fr, bm, soft) {
  const { lx, ly, dx, dy, k } = bm;
  const r = Math.max(2.6, QUIZ.heads.r * k * 1.25); // the barrel's radius (px)
  const hx = lx - dx * (r - 0.6), hy = ly - dy * (r - 0.6); // the barrel's centre, behind its lens
  const px = fr.px;
  const put = (x, y, c) => {
    if (x >= 0 && x < W && y >= 0 && y < H) px[y * W + x] = c;
  };
  // the yoke: a bar over the barrel, the arms down its sides to its axis
  const ax = Math.round(r + 1.4), top = Math.round(hy - r - 2);
  for (let x = Math.round(hx) - ax; x <= Math.round(hx) + ax; x++) put(x, top, C.black);
  for (let y = top; y <= Math.round(hy) + 1; y++) {
    put(Math.round(hx) - ax, y, C.black);
    put(Math.round(hx) + ax, y, C.black);
  }
  // the barrel
  const x0 = Math.floor(hx - r - 1), x1 = Math.ceil(hx + r + 1), y0 = Math.floor(hy - r - 1), y1 = Math.ceil(hy + r + 1);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const ex = x + 0.5 - hx, ey = y + 0.5 - hy;
    const d2 = ex * ex + ey * ey;
    if (d2 > r * r) continue;
    const rim = d2 > (r - 1.1) * (r - 1.1);
    let c = soft ? C.ink : rim && ex + ey < -r * 0.35 ? C.steel : C.slate;
    // the lens: a disc on the face toward the beam
    const lx2 = x + 0.5 - lx, ly2 = y + 0.5 - ly;
    const lr = Math.max(1.2, r * 0.48);
    if (lx2 * lx2 + ly2 * ly2 <= lr * lr) c = soft ? C.steel : lx2 * lx2 + ly2 * ly2 <= (lr * 0.45) ** 2 + 0.3 ? C.white : C.silver;
    put(x, y, c);
  }
}

// ------------------------------------------------------------------------------------------- what moves (live layer)

LIVE_DRAW['pay-attention'] = (fr, cam, t, style, clipRows, soft, wall) => {
  // the moving heads: their beams, then the heads over them (static while a question is on: the clock stands still)
  for (const side of [-1, 1]) {
    const bm = beamOf(cam, side, t);
    if (bm.lx < -20 || bm.lx > W + 20) continue;
    drawBeam(fr, bm, clipRows, cam.soft > 0.5);
    drawHead(fr, bm, cam.soft > 0.5);
  }
  // the lamps lit (gold) and the scores on the displays
  for (const id of ['A', 'B']) {
    if (STATE.lamps[id]) paintLamp(fr, lampRect(cam, id), id, true);
    paintScore(fr, scoreRect(cam, id), STATE.scores[id]);
  }
};
