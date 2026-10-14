// PAY ATTENTION's title sequence shot in the quiz studio itself (pay-attention.md §6): the set the programme is played
// in (studio/quiz.js, the v2 renderer), its lights out, a camera moving through it, on the programme's grid (cues.js).
// This module is the open's studio; payattentiontitles.js loads it with a dynamic import() only when the v2 studio is on
// (the default page, ?v2=0, never reaches the v2 modules), and draws its flat open (payattentionflat.js) until it has
// arrived or if it fails to load.
//
//   DARK      beats 0-2     the studio with its lights out, seen from high at the back of the room: black, its lights
//                           only glimmering (the board's marquee, the players' shapes in bulbs, the light strips, the
//                           stage's ring, the lamps' housings), the desks black against the cove's last glow; the two
//                           moving heads search the dark; the camera starts its move, slowly: a crane down from the
//                           rig's height and a push down the room
//   LAMPS     2-6           the lamps strike in turn, one a beat: the circle (seat A, left), the square (seat B, right),
//                           the circle, the square; each strike lights its lamp and its player's shape in gold and lifts
//                           the room's lights a step for a moment; each striker's head swings onto its desk and stops
//                           dead on the strike (a follow spot); the camera keeps moving in
//   LIGHTS    6             the camera lands on the quiz's wide on the downbeat as the room's white light comes on;
//                           the moving heads fire inward and sweep out, stopping dead on the next beat; the band comes in
//   FLIP      6.5-7.5       the board's letters flip in one by one, left to right, tile by tile, to PAY ATTENTION
//                           under the emblem's two lamps (a mallet run up the scale)
//   CLOSE     8-10          a cut to the board, twice the wide: the emblem and the name at 2x
//   (then the emblem and the package's plate: payattentiontitles.js)
//
// From the room's light on, everything is the set's own pixels (palette only, no shimmer: the set's lights are fixed
// world points). In the dark the frame is built from black up: only the room's light sources, dimmed a step or two
// along the neutral ramp (never amber), and the desks as silhouettes against the cove. No people: the players arrive
// with the programme.
import { P } from '../../palette.js';
import { textPixels } from '../../font.js';
import { u32 } from '../../gfx/index.js';
import { W, H } from './kit.js';
import { paintLamps } from './payattention.js';
import { lampAt } from './payattentionflat.js';
import { CUES } from './cues.js';
import { Frame } from '../../v2/canvas25d/pixbuf.js';
import { drawBackground, drawDesk, wallRect, setLive, warmSet } from '../../v2/canvas25d/studio/set.js';
import { LIVE } from '../../v2/canvas25d/studio/live.js';
import { styleFor } from '../../v2/canvas25d/studio/styles.js';
import { QUIZ, quizCamera, drawQuizLive, shapeBulbs, marqueeBulbs, stageEdgeRows, deskRect, lampRect } from '../../v2/canvas25d/studio/quiz.js';
import { SET, kAt, sxOf, syOf } from '../../v2/canvas25d/studio/geometry.js';

const ID = 'pay-attention';
const Q = CUES[ID];
const BEAT = 60 / Q.bpm;
const C = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, u32(v)]));
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export { lampAt };

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

/**
 * How far the move has come at beat b (0 at the cut, 1 on the room's light): eased in and out, so the first beat is a
 * slow, smooth start (well under half a pixel a frame at the frame's edges: nothing steps) and the move lands softly on
 * the downbeat; it travels fastest under the lamps' strikes.
 */
export const moveAt = (b) => {
  const u = clamp01(b / Q.both);
  return u * u * (3 - 2 * u);
};
const CAM = { x: 0, y: 0, z: 0, zoom: 1, hy: 0, soft: 0 };
/** The camera at beat b (one object, reused). */
export function cameraAt(b) {
  if (b >= Q.close) return CLOSE;
  const u = moveAt(b);
  if (u >= 1) return WIDE;
  CAM.x = FROM.x + (TO.x - FROM.x) * u;
  CAM.y = FROM.y + (TO.y - FROM.y) * u;
  CAM.z = FROM.z + (TO.z - FROM.z) * u;
  CAM.zoom = FROM.zoom + (TO.zoom - FROM.zoom) * u;
  const row = FROM.row + (TO.row - FROM.row) * u;
  // the horizon that puts the board's centre on its row (the camera never tilts: a crane is a move, not a pan)
  CAM.hy = row - kAt(CAM, SET.wallZ) * (BOARD_Y - CAM.y);
  return CAM;
}

// ---------------------------------------------------------------------------------------------
// The light at beat b

/**
 * The room's light at beat b: 3 in the dark (the lights only glimmering), 2 while the lamps strike, 1 for a fifth of a
 * beat on each strike (the room's lights lift with it), 0 from the downbeat (the room lit: the set as it airs).
 */
export function darkAt(b) {
  if (b >= Q.both) return 0;
  if (b < Q.lamps[0]) return 3;
  for (const at of Q.lamps) if (b >= at && b < at + 0.2) return 1;
  return 2;
}

const DEG = Math.PI / 180;
/**
 * The moving heads at beat b: { angle: [left, right] (radians from straight down, inward positive), sides: [on, on],
 * reach } (reach: the beam's throw, longer in the dark, where it is the room's main light).
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
export const BEAM_REST = -30 * DEG;

// ---------------------------------------------------------------------------------------------
// The board: its emblem and its name, the letters flipping in tile by tile

const NAME = 'PAY ATTENTION';
export const QUIZ_LETTERS = [...NAME];
const LETTERS = QUIZ_LETTERS;
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
const put = (d, x, y, c) => {
  if (x >= 0 && x < W && y >= 0 && y < H) d[y * W + x] = c;
};

/**
 * The board's face into d: the emblem (the two lamps on their plaque, lit) centred over the name, the name in tiles,
 * each tile a dark cell with a split across it until its letter turns in (white, its lower rows silver: the board's
 * face). s is the pixel scale (1 in the wide, 2 in the close).
 */
function paintBoard(d, r, s, b) {
  const cx = Math.round((r.x0 + r.x1) / 2);
  const cap = 7; // the body face's cap height
  const nameW = NAME_W * s;
  const plaqueH = Math.round(22 * s * 0.6) + 2;
  const blockH = plaqueH + 5 * s + (cap + 2) * s;
  const top = Math.round((r.y0 + r.y1) / 2 - blockH / 2);
  // the emblem: the package's own lamps on their plaque (paintLamps: the same shapes the plate glides from), small
  paintLamps({ d, w: W, h: H, ox: 0, oy: 0 }, cx, top + plaqueH / 2, 0.6 * s, { a: 1, b: 1 });
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
      fill(d, cellX0, cellY0, cellX1, cellY1, C.ink);
      fill(d, cellX0, y0 + Math.floor((cap * s) / 2), cellX1, y0 + Math.floor((cap * s) / 2) + Math.max(1, s >> 1), C.black);
      continue;
    }
    // the turn: the tile squashed to |cos| of its angle about its middle row, blank on the way down, the letter up
    const sq = Math.abs(Math.cos(u * Math.PI));
    const mid = y0 + (cap * s) / 2;
    if (u < 1) {
      const hh = Math.max(1, Math.round(((cellY1 - cellY0) / 2) * sq));
      fill(d, cellX0, Math.round(mid - hh), cellX1, Math.round(mid + hh), u < 0.5 ? C.ink : C.slate);
      if (u >= 0.5) {
        for (const [gx, gy] of glyph(ch).pixels) {
          const yy = Math.round(mid + (gy * s + s / 2 - (cap * s) / 2) * sq);
          fill(d, tx + gx * s, yy, tx + (gx + 1) * s, yy + Math.max(1, Math.round(s * sq)), C.white);
        }
      }
      continue;
    }
    for (const [gx, gy] of glyph(ch).pixels) fill(d, tx + gx * s, y0 + gy * s, tx + (gx + 1) * s, y0 + (gy + 1) * s, gy >= Math.ceil(cap / 2) ? C.silver : C.white);
  }
}

// ---------------------------------------------------------------------------------------------
// The studio in the dark: black, its light sources glimmering, the desks' silhouettes

// each light source's colours by the room's light (index: darkAt 1, 2, 3), all on the neutral ramp: a dimmed warm-white
// bulb is a grey, never amber
const BULB = [null, C.fog, C.steel, C.slate];
const STRIP = [null, [C.steel, C.slate, C.ink], [C.slate, C.ink], [C.ink]]; // core, then each step out
const COVE = [null, [C.slate, C.ink], [C.ink], []]; // the line, then the glow above it
const DIODE = [null, [C.steel, C.slate], [C.slate, C.ink], [C.ink, C.black]]; // the stage's diodes by turns
const HOUSING = [null, C.steel, C.slate, C.ink]; // an unlit lamp's outline, catching a little
// the deck's sheen behind the ring: each row back from it, the share of its pixels in ink (an ordered dither)
const SHEEN = [
  null,
  [13, 11, 10, 9, 9, 8, 8, 7, 7, 6, 6, 5, 5, 4, 3, 2, 2, 1],
  [11, 9, 8, 7, 7, 6, 6, 5, 5, 4, 4, 3, 3, 2, 2, 1],
  [9, 7, 6, 6, 5, 5, 4, 4, 3, 3, 2, 2, 1, 1],
];
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

function paintDark(d, cam, n) {
  d.fill(C.black);
  const k = kAt(cam, SET.wallZ);
  const yw = Math.round(syOf(cam, k, SET.floorY));
  // the cove's last glow along the wall's foot (the desks will stand black against it)
  const yc = Math.round(syOf(cam, k, QUIZ.cove.Y));
  const cove = COVE[n];
  if (cove.length && yc < yw) {
    const xa = Math.max(0, Math.round(sxOf(cam, k, -QUIZ.cove.X))), xb = Math.min(W, Math.round(sxOf(cam, k, QUIZ.cove.X)));
    for (let x = xa; x < xb; x++) for (let i = 0; i < cove.length; i++) put(d, x, yc - i, cove[i]);
  }
  // the light strips framing the board
  const ya = Math.round(syOf(cam, k, QUIZ.strips.top));
  for (const s of [-1, 1]) {
    const x = Math.round(sxOf(cam, k, s * QUIZ.strips.X));
    const steps = STRIP[n];
    for (let y = Math.max(0, ya); y < Math.min(H, yc); y++) for (let i = 0; i < steps.length; i++) {
      put(d, x - i, y, steps[i]);
      put(d, x + i, y, steps[i]);
    }
  }
  // the bulbs: the board's marquee and the players' shapes
  for (const bl of [...marqueeBulbs(cam), ...shapeBulbs(cam, 'A'), ...shapeBulbs(cam, 'B')]) fill(d, bl.x, bl.y, bl.x + bl.n, bl.y + bl.n, BULB[n]);
  // the stage's gloss catching its ring: a faint sheen on the deck behind the ring, fading back from it (the desks'
  // bases stand black against it)
  const edge = stageEdgeRows(cam);
  const sheen = SHEEN[n];
  for (let x = 0; x < W; x++) {
    if (edge[x] < 0) continue;
    for (let i = 1; i <= sheen.length; i++) if (BAYER[(edge[x] - i) & 3][x & 3] < sheen[i - 1]) put(d, x, edge[x] - i, C.ink);
  }
  // the desks and the podium: black silhouettes (their fronts and tops), their lids' front edges catching a little, as
  // the lit set's catch the key
  for (const id of ['A', 'B', 'host']) {
    const r = deskRect(cam, id);
    const x0 = Math.round(r.x0), x1 = Math.round(r.x1);
    fill(d, x0, Math.round(r.yBack), x1, Math.round(r.yFoot), C.black);
    fill(d, x0, Math.round(r.yTop), x1, Math.round(r.yTop) + 1, HOUSING[n]);
  }
  // the lamps' housings catching a little (an unlit lamp: its outline only)
  for (const id of ['A', 'B']) {
    const lp = lampRect(cam, id);
    const r = lp.n / 2, cx = lp.x0 + r, cy = lp.y0 + r;
    const inside = (x, y) => (id === 'B' ? x >= lp.x0 && x < lp.x0 + lp.n && y >= lp.y0 && y < lp.y0 + lp.n : (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r - 0.25);
    for (let y = lp.y0; y < lp.y0 + lp.n; y++) for (let x = lp.x0; x < lp.x0 + lp.n; x++) {
      if (!inside(x, y)) continue;
      if (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) put(d, x, y, HOUSING[n]);
    }
  }
  // the stage's ring of light, its diodes by turns (each step of its curve closed, so the ring never breaks)
  const di = DIODE[n];
  for (let x = 0; x < W; x++) {
    if (edge[x] < 0) continue;
    const prev = x > 0 && edge[x - 1] >= 0 ? edge[x - 1] : edge[x];
    const next = x < W - 1 && edge[x + 1] >= 0 ? edge[x + 1] : edge[x];
    const top = Math.min(edge[x], Math.min(prev, next) + 1);
    for (let y = top; y <= edge[x]; y++) put(d, x, y, di[(x + y) & 1]);
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
const BEAMS = { beams: true, heads: false, desks: false, sides: [true, true], reach: 1 };
const DESKS_ONLY = { beams: false, heads: false, desks: true };

/** Paint the studio at beat b (returns its pixels: a 384 x 216 frame, the open's layer copies it). */
export function paintStage(b) {
  const cam = cameraAt(b);
  const t = T0 + b * BEAT;
  const px = FR.px;
  const n = darkAt(b);
  const bs = beamsAt(b);
  ST.lamps.A = lampAt('A', b) > 0;
  ST.lamps.B = lampAt('B', b) > 0;
  if (n > 0) {
    // the dark: black up, the light sources dimmed, then the heads' beams (the room's main light) and the lamps
    paintDark(px, cam, n);
    BEAMS.sides = bs.sides;
    BEAMS.reach = bs.reach;
    drawQuizLive(FR, cam, t, null, false, ST, bs.angle, BEAMS);
    drawQuizLive(FR, cam, t, CLIP_NONE, false, ST, bs.angle, DESKS_ONLY);
  } else {
    // the room lit: the set as it airs, the open's own board face, the heads firing and sweeping
    OPTS.style = STYLE();
    OPTS.shotSince = b >= Q.close ? 2 : 1;
    drawBackground(FR, cam, t, OPTS);
    // the desks without the set's own live layer (the open drives the lamps and the heads itself)
    const live = LIVE.on;
    setLive(false);
    try {
      drawDesk(FR, cam, CLIP);
    } finally {
      setLive(live);
    }
    paintBoard(px, wallRect(cam), b >= Q.close ? 2 : 1, b);
    drawQuizLive(FR, cam, t, CLIP, false, ST, bs.angle);
  }
  // the lamps' players' shapes on the wall, gold while their lamp is lit
  for (const id of ['A', 'B']) {
    if (!ST.lamps[id]) continue;
    for (const bl of shapeBulbs(cam, id)) fill(px, bl.x, bl.y, bl.x + bl.n, bl.y + bl.n, C.yellow);
  }
  return px;
}
const CLIP_NONE = new Int16Array(W).fill(H);

/** Bake the studio's wall light ahead of the open's first lit frame (an idle slice after this module loads). */
export function warm() {
  warmSet(ID);
}
export { CLOSE as QUIZ_CLOSE, WIDE as QUIZ_WIDE };
