// PAY ATTENTION's title sequence (pay-attention.md §6: "≈8 s, 112 BPM: a dark stage; the buzzer lamps of both desks
// light in turn on the beat; the question board flips to PAY ATTENTION; the plate"), on the programme's grid (cues.js),
// shot in the quiz studio itself: the set the programme is played in (studio/quiz.js, the v2 renderer), its lights out,
// a camera moving through it.
//
//   DARK      beats 0-2     the studio with its lights out, seen from high at the back of the room: the board's
//                           marquee, the light strips, the truss towers and the desks only just made out; the camera
//                           starts its move, a push down the room and a crane down from the rig's height
//   LAMPS     2-6           the lamps strike in turn, one a beat: the circle (seat A, left), the square (seat B,
//                           right), the circle, the square; each strike lights its lamp and its player's shape on the
//                           back wall in gold and lifts the room a step for a moment (the buzzers play the channel's
//                           signature, left and right); the camera keeps moving in
//   LIGHTS    6             the camera lands on the quiz's wide on the downbeat as the room's white light comes on:
//                           the cove, the strips, the marquee, the stage's ring; the moving heads fire inward and
//                           sweep out, stopping dead on the next beat; the band comes in
//   FLIP      6.5-7.5       the board's letters flip in one by one, left to right, tile by tile, to PAY ATTENTION
//                           under the emblem's two lamps (a mallet run up the scale)
//   CLOSE     8-10          a cut to the board, twice the wide: the emblem and the name at 2x
//   EMBLEM    10            a cut: the two lamps alone, lit, on the open's field: the emblem, from which the package's
//                           plate wipes out (purple, white type, its fog rim)
//   TITLE     10.9-14       the package's reveal; still for the last 0.8 s
//
// Everything is the set's own pixels (palette only, no shimmer under the move: the set's lights are fixed world
// points); the lights-out studio is the lit one taken down the palette's ramps a step at a time (color.js DARKER), so
// the dark and the light are one room. No people: the players arrive with the programme.
import { P } from '../../palette.js';
import { textPixels } from '../../font.js';
import { u32 } from '../../gfx/index.js';
import { W, H, CENTRE, ZOOM } from './kit.js';
import { QUIZ_OPEN, paintLamps, BUILD_DONE } from './payattention.js';
import { sequence, Layer } from './seq.js';
import { CUES, hitOf } from './cues.js';
import { Frame } from '../../v2/canvas25d/pixbuf.js';
import { drawBackground, drawDesk, wallRect, setLive, warmSet } from '../../v2/canvas25d/studio/set.js';
import { LIVE } from '../../v2/canvas25d/studio/live.js';
import { styleFor } from '../../v2/canvas25d/studio/styles.js';
import { QUIZ, quizCamera, drawQuizLive, shapeBulbs } from '../../v2/canvas25d/studio/quiz.js';
import { darker32 } from '../../v2/canvas25d/studio/color.js';
import { SET, kAt } from '../../v2/canvas25d/studio/geometry.js';

const ID = 'pay-attention';
const Q = CUES[ID];
const BEAT = 60 / Q.bpm;
const HIT = hitOf(ID);
const C = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, u32(v)]));
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ---------------------------------------------------------------------------------------------
// The camera: from high at the back of the room down onto the quiz's wide, landing on the room's light; then the board

const WIDE = quizCamera('wide');
const BOARD_Y = (SET.screen.y0 + SET.screen.y1) / 2; // the board's centre on the wall
const rowOf = (cam, Y = BOARD_Y) => cam.hy + kAt(cam, SET.wallZ) * (Y - cam.y);
/** The camera's keyframes: z (dolly), y (height), x (truck), zoom, and the board's centre row on screen. */
const FROM = { x: -46, y: -260, z: -330, zoom: 0.95, row: rowOf(WIDE) - 2 };
const TO = { x: WIDE.x, y: WIDE.y, z: WIDE.z, zoom: WIDE.zoom, row: rowOf(WIDE) };
/** The board close (beats 8-10): twice the wide's scale on the wall, the board's centre at the frame's centre row. */
const CLOSE_Z = SET.wallZ - (SET.wallZ - WIDE.z) / 2;
const CLOSE = { x: 0, y: WIDE.y, z: CLOSE_Z, zoom: WIDE.zoom, soft: 0 };
CLOSE.hy = 108 - kAt(CLOSE, SET.wallZ) * (BOARD_Y - CLOSE.y);

/** How far the move has come at beat b (0 at the cut, 1 on the room's light): under way from the cut, landing softly. */
export const moveAt = (b) => 1 - (1 - clamp01(b / Q.both)) ** 1.8;
const CAM = { x: 0, y: 0, z: 0, zoom: 1, hy: 0, soft: 0 };
/** The camera at beat b (one object, reused). */
export function cameraAt(b) {
  if (b >= Q.close) return CLOSE;
  const u = moveAt(b);
  CAM.x = FROM.x + (TO.x - FROM.x) * u;
  CAM.y = FROM.y + (TO.y - FROM.y) * u;
  CAM.z = FROM.z + (TO.z - FROM.z) * u;
  CAM.zoom = FROM.zoom + (TO.zoom - FROM.zoom) * u;
  const row = FROM.row + (TO.row - FROM.row) * u;
  // the horizon that puts the board's centre on its row (the camera never tilts: a crane is a move, not a pan)
  CAM.hy = row - kAt(CAM, SET.wallZ) * (BOARD_Y - CAM.y);
  if (u >= 1) return WIDE;
  return CAM;
}

/**
 * The rig over the front of the studio (the open's own: it hangs above every framing of the programme): a box truss
 * across the room 4.5 m from the back wall, at 1.65 m over the desks' tops, four par cans hanging from it. The camera
 * starts above it and cranes down through it, so it rises past the lens and out of the frame.
 */
const RIG = { Z: 950 - 500, Y: -165, h: 14, X: 420, cans: [-150, -50, 50, 150], canW: 9, canH: 14 };
function paintRig(d, cam) {
  const k = kAt(cam, RIG.Z);
  const sx = (X) => 192 + (X - cam.x) * k, sy = (Y) => cam.hy + (Y - cam.y) * k;
  const yt = Math.round(sy(RIG.Y - RIG.h / 2)), yb = Math.round(sy(RIG.Y + RIG.h / 2));
  if (yb < -2 || yt >= H) return;
  const xa = Math.max(0, Math.round(sx(-RIG.X))), xb = Math.min(W, Math.round(sx(RIG.X)));
  // a ladder truss: two chords two pixels deep, a strut every bay (vertical, so the crane's move slides them along
  // themselves and they never crawl, as a zigzag would), its par cans hanging under it
  for (let X = -RIG.X; X <= RIG.X; X += RIG.h) {
    const x = Math.round(sx(X));
    if (x >= xa && x < xb) for (let y = Math.max(0, yt + 2); y < Math.min(H, yb); y++) d[y * W + x] = C.ink;
  }
  for (let x = xa; x < xb; x++) {
    for (const [y, c] of [[yt, C.steel], [yt + 1, C.slate], [yb, C.slate], [yb + 1, C.ink]]) if (y >= 0 && y < H) d[y * W + x] = c;
  }
  for (const X of RIG.cans) {
    const x0 = Math.round(sx(X - RIG.canW / 2)), x1 = Math.round(sx(X + RIG.canW / 2));
    const y0 = yb + 2, y1 = Math.round(sy(RIG.Y + RIG.h / 2 + RIG.canH));
    // the can: a slate body, its lit side steel, its lens (underneath) black in an ink rim
    fill(d, x0, y0, x1, y1, C.slate);
    fill(d, x0, y0, x0 + 1, y1, C.steel);
    fill(d, x0, y1 - 1, x1, y1, C.ink);
    fill(d, x0 + 1, y1 - 1, x1 - 1, y1, C.black);
    fill(d, Math.round((x0 + x1) / 2) - 1, yb, Math.round((x0 + x1) / 2) + 1, y0, C.black); // the clamp
  }
}

// ---------------------------------------------------------------------------------------------
// The light at beat b

/** Lamp A or B at beat b: 0 unlit, 1 lit, 2 the flash on its beat (in turn: A on 2 and 4, B on 3 and 5; both from 6). */
export function lampAt(which, b) {
  if (b >= Q.both) return b < Q.both + 0.22 ? 2 : 1;
  const mine = Q.lamps.filter((_, i) => (i % 2 === 0) === (which === 'A'));
  let lit = 0;
  for (const at of Q.lamps) if (b >= at) lit = mine.includes(at) ? (b < at + 0.22 ? 2 : 1) : 0;
  return lit;
}
/**
 * The room's light at beat b, as steps down the palette's ramps from the lit studio: 3 in the dark, 2 while the lamps
 * strike (1 for a fifth of a beat on each strike: the room lifts with it), 0 from the downbeat.
 */
export function darkAt(b) {
  if (b >= Q.both) return 0;
  if (b < Q.lamps[0]) return 3;
  for (const at of Q.lamps) if (b >= at && b < at + 0.2) return 1;
  return 2;
}
/** The room's white light: off, then on with the downbeat. */
export const roomLight = (b) => (b >= Q.both ? 1 : 0);

const DEG = Math.PI / 180;
/**
 * The moving heads at beat b: { angle: [left, right] (radians from straight down, inward positive), sides: [on, on],
 * reach } (reach: the beam's throw, longer in the dark, where it is the room's only light).
 *   - in the dark (beats 0-2) both search the room, swinging in from outside together;
 *   - as each lamp strikes (beats 2-5) its side's head swings onto its desk in the last third of a beat and stops dead on
 *     the strike, the other head dark: a follow spot on the player who buzzed;
 *   - on the downbeat both fire inward and sweep out, stopping at rest on the next beat (the room's light is up).
 */
export function beamsAt(b) {
  if (b < Q.lamps[0]) {
    const u = clamp01(b / Q.lamps[0]);
    const a = (-48 + 58 * (u * u * (3 - 2 * u))) * DEG;
    return { angle: [a, a], sides: [true, true], reach: 2 };
  }
  if (b < Q.both) {
    const i = Math.min(Q.lamps.length - 1, Math.floor(b - Q.lamps[0]));
    const next = Q.lamps[i + 1] ?? Q.both;
    const own = i % 2 === 0 ? 0 : 1; // A's head is the left one
    const SPOT = 16 * DEG, OUT = -40 * DEG;
    const angle = [OUT, OUT], sides = [false, false];
    angle[own] = SPOT;
    sides[own] = true;
    // the next striker's head swings in over the last third of the beat, landing on its strike
    const lead = next - b;
    if (lead < 1 / 3 && next < Q.both) {
      const other = 1 - own, u = 1 - lead * 3;
      angle[other] = OUT + (SPOT - OUT) * (1 - (1 - u) ** 3);
      sides[other] = true;
    }
    return { angle, sides, reach: 2 };
  }
  const a = beamAt(b);
  return { angle: [a, a], sides: [true, true], reach: 1 };
}
/**
 * The moving heads' angle at beat b once the room's light is up (radians from straight down, inward positive): they
 * fire inward on the downbeat and sweep out, stopping dead at their resting angle on the next beat; null before.
 */
export function beamAt(b) {
  if (b < Q.both) return null;
  const u = clamp01(b - Q.both);
  const easeOut = 1 - (1 - u) ** 3;
  return (8 + (-30 - 8) * easeOut) * DEG;
}
export const BEAM_REST = -30 * (Math.PI / 180);

// ---------------------------------------------------------------------------------------------
// The board: its emblem and its name, the letters flipping in tile by tile

const NAME = 'PAY ATTENTION';
const LETTERS = [...NAME];
const FLIP_EACH = 0.24; // beats a tile takes to turn
/** When letter i starts to turn (beats), left to right across the flip's beat. */
export const flipStart = (i) => Q.flip + (i / (LETTERS.length - 1)) * (Q.flipLen - FLIP_EACH);
/** Letter i at beat b: 0 the blank tile, 1 the letter; between, the tile's turn (its height |cos|). */
export const tileAt = (i, b) => clamp01((b - flipStart(i)) / FLIP_EACH);
const GLYPH = new Map();
const glyph = (ch) => {
  if (!GLYPH.has(ch)) GLYPH.set(ch, ch === ' ' ? null : textPixels(ch, 'body'));
  return GLYPH.get(ch);
};
// each letter's place in the name at 1x (the face's own advances: an I is narrower than an M)
const PROBE = textPixels('X', 'body').width;
const OFFSETS = LETTERS.map((_, i) => (i ? textPixels(NAME.slice(0, i) + 'X', 'body').width - PROBE : 0));
const NAME_W = textPixels(NAME, 'body').width;

function fill(d, x0, y0, x1, y1, c) {
  for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) d[y * W + x] = c;
}

/**
 * The board's face into d: the emblem (the two lamps on their plaque, lit) centred over the name, the name in tiles,
 * each tile a dark cell with a split across it until its letter turns in (white, its lower rows silver: the board's
 * face). s is the pixel scale (1 in the wide, 2 in the close).
 */
function paintBoard(d, r, s, b) {
  const lit = b >= Q.both;
  const cx = Math.round((r.x0 + r.x1) / 2);
  const cap = 7; // the body face's cap height
  const nameW = NAME_W * s;
  const plaqueH = Math.round(22 * s * 0.6) + 2;
  const blockH = plaqueH + 5 * s + (cap + 2) * s;
  const top = Math.round((r.y0 + r.y1) / 2 - blockH / 2);
  // the emblem: the package's own lamps on their plaque (paintLamps: the same shapes the plate glides from), small
  if (lit) paintLamps({ d, w: W, h: H, ox: 0, oy: 0 }, cx, top + plaqueH / 2, 0.6 * s, { a: 1, b: 1 });
  // the tiles
  const x0 = cx - Math.round(nameW / 2), y0 = top + plaqueH + 5 * s;
  for (let i = 0; i < LETTERS.length; i++) {
    const ch = LETTERS[i];
    if (ch === ' ') continue;
    const tx = x0 + OFFSETS[i] * s;
    const u = tileAt(i, b);
    // the tile: the letter's own width (the face's one-pixel spacing keeps a gap between tiles), a pixel over and under
    const cellX0 = tx, cellX1 = tx + glyph(ch).width * s, cellY0 = y0 - s, cellY1 = y0 + (cap + 1) * s;
    if (u <= 0) {
      // the blank tile: an ink cell, its split a black row across its middle
      if (!lit) continue;
      fill(d, cellX0, cellY0, cellX1, cellY1, C.ink);
      fill(d, cellX0, y0 + Math.floor((cap * s) / 2), cellX1, y0 + Math.floor((cap * s) / 2) + Math.max(1, s >> 1), C.black);
      continue;
    }
    // the turn: the tile squashed to |cos| of its angle about its middle row, blank on the way down, the letter up
    const ang = u * Math.PI, sq = Math.abs(Math.cos(ang));
    const mid = y0 + (cap * s) / 2;
    if (u < 1) {
      const hh = Math.max(1, Math.round(((cellY1 - cellY0) / 2) * sq));
      fill(d, cellX0, Math.round(mid - hh), cellX1, Math.round(mid + hh), u < 0.5 ? C.ink : C.slate);
      if (u >= 0.5) {
        const g = glyph(ch);
        for (const [gx, gy] of g.pixels) {
          const yy = Math.round(mid + (gy * s + s / 2 - (cap * s) / 2) * sq);
          fill(d, tx + gx * s, yy, tx + (gx + 1) * s, yy + Math.max(1, Math.round(s * sq)), C.white);
        }
      }
      continue;
    }
    const g = glyph(ch);
    for (const [gx, gy] of g.pixels) fill(d, tx + gx * s, y0 + gy * s, tx + (gx + 1) * s, y0 + (gy + 1) * s, gy >= Math.ceil(cap / 2) ? C.silver : C.white);
  }
}

// ---------------------------------------------------------------------------------------------
// The studio at beat b

const FR = new Frame();
const CLIP = new Int16Array(W);
const STYLE = () => styleFor(ID);
const OPTS = { style: null, wall: { mode: 'rest', solo: true }, shotSince: 0, lod: 0 };
const T0 = 1000; // the set's clock at the cut (its live layer is a pure function of time)
const ST = { question: true, lamps: { A: false, B: false }, scores: { A: null, B: null } };
const HEADS_ONLY = { beams: false, heads: true, desks: false }, DESKS_ONLY = { beams: false, heads: false, desks: true };
const BEAMS = { beams: true, heads: false, desks: false, sides: [true, true], reach: 1 };
const DARK = [null, new Map(), new Map(), new Map()];
// (white and silver are paint, not light: the plate's letters, a lens's glint; in the dark they go two steps further
// than the lights do, so the room's last glimmers are its bulbs and strips, not the network's logo)
const PAINT = new Set([C.white, C.silver]);
function darkOf(c, n) {
  const m = DARK[n];
  let v = m.get(c);
  if (v === undefined) {
    v = darker32(c, PAINT.has(c) ? n + 2 : n);
    m.set(c, v);
  }
  return v;
}

const L = new Layer('quiz-titles');
/** Paint the studio at beat b (returns its pixels: a 384 x 216 frame, the layer copies it). */
export function paintStage(b) {
  const cam = cameraAt(b);
  OPTS.style = STYLE();
  OPTS.shotSince = b >= Q.close ? 2 : 1;
  const t = T0 + b * BEAT;
  drawBackground(FR, cam, t, OPTS);
  // the desks without the set's own live layer (the open drives the lamps and the heads itself)
  const live = LIVE.on;
  setLive(false);
  try {
    drawDesk(FR, cam, CLIP);
  } finally {
    setLive(live);
  }
  const px = FR.px;
  // the board's face (the open's own: blank before the light, the letters flipping in on the flip's beat)
  const r = wallRect(cam);
  paintBoard(px, r, b >= Q.close ? 2 : 1, b);
  // the light: in the dark the heads stand at rest (no beams) and the lit studio is taken down the ramps; then what is
  // lit whatever the room: the lamps and their players' shapes, gold; from the room's light the heads fire and sweep
  const n = darkAt(b);
  const bs = beamsAt(b);
  ST.lamps.A = lampAt('A', b) > 0;
  ST.lamps.B = lampAt('B', b) > 0;
  if (n > 0) {
    // in the dark: the heads taken down with the room, then their beams (the room's only light but the lamps) and the lamps
    drawQuizLive(FR, cam, t, CLIP, false, ST, bs.angle, HEADS_ONLY);
    for (let i = 0; i < px.length; i++) px[i] = darkOf(px[i], n);
    BEAMS.sides = bs.sides;
    BEAMS.reach = bs.reach;
    drawQuizLive(FR, cam, t, CLIP, false, ST, bs.angle, BEAMS);
    drawQuizLive(FR, cam, t, CLIP, false, ST, bs.angle, DESKS_ONLY);
  } else drawQuizLive(FR, cam, t, CLIP, false, ST, bs.angle);
  for (const id of ['A', 'B']) {
    if (!ST.lamps[id]) continue;
    for (const bl of shapeBulbs(cam, id)) fill(px, bl.x, bl.y, bl.x + bl.n, bl.y + bl.n, C.yellow);
  }
  // the rig in front of it all (the camera cranes down through it)
  if (b < Q.close) paintRig(px, cam);
  return px;
}

function before(ctx, dt) {
  const b = dt / BEAT;
  if (b >= Q.emblem) {
    // the emblem on the open's field: the package's first frame (the two lamps lit, at centre stage)
    ctx.drawImage(QUIZ_OPEN.background(), 0, 0);
    QUIZ_OPEN.emblem(ctx, BUILD_DONE, CENTRE.x, CENTRE.y, ZOOM);
    return;
  }
  const px = paintStage(b);
  L.begin(C.black).set(px);
  L.end(ctx);
}

// from the reveal on the package plays its open, the lamps settled lit
const REVEAL = { ...QUIZ_OPEN, emblem: (ctx, dt, x, y, k) => QUIZ_OPEN.emblem(ctx, Math.max(dt, BUILD_DONE), x, y, k) };
const SEQ = sequence({ hit: HIT, before, reveal: REVEAL });

/** PAY ATTENTION's title sequence at dt seconds (full frame). */
export function drawPayAttentionTitles(ctx, dt, info) {
  SEQ.draw(ctx, dt, info);
}

// (the studio's bake warmed in an idle slice, so the open's first frame does not bake it)
export const PAYATTENTION_TITLES = { ...QUIZ_OPEN, warmJobs: () => [...QUIZ_OPEN.warmJobs(), () => warmSet(ID)] };
export const PAYATTENTION_SEQ = SEQ;
/** For checks: the studio's pixels at beat b. */
export const payAttentionFrame = (b) => paintStage(b);
/** The emblem painted at centre stage at the hand-over size into a fresh buffer (tests: no pop at the package). */
export function emblemPixels(x = CENTRE.x, y = CENTRE.y, k = ZOOM) {
  const T = { d: new Uint32Array(W * H), w: W, h: H, ox: 0, oy: 0 };
  paintLamps(T, x, y, k);
  return T.d;
}
export { CLOSE as QUIZ_CLOSE, WIDE as QUIZ_WIDE, LETTERS as QUIZ_LETTERS };
