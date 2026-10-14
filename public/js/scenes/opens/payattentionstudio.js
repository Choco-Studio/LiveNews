// PAY ATTENTION's title sequence shot in the quiz studio itself (pay-attention.md §6): the set the programme is played
// in (studio/quiz.js, the v2 renderer), its lights out, a camera moving through it, on the programme's grid (cues.js).
// This module is the open's studio; payattentiontitles.js loads it with a dynamic import() only when the v2 studio is on
// (the default page, ?v2=0, never reaches the v2 modules), and draws its flat open (payattentionflat.js) until it has
// arrived or if it fails to load.
//
//   DARK      beats 0-2     the studio with its lights out, seen from high at the back of the room: black, only its
//                           lights glimmering (the board's marquee, the players' shapes in bulbs, the light strips, the
//                           cove, the stage's ring, the lamps' housings), the desks black silhouettes; no beams; the
//                           camera starts its move from rest: a crane down and a push down the room
//   LAMPS     2-6           the lamps strike in turn, one a beat: the circle (seat A, left), the square (seat B, right),
//                           the circle, the square; each strike lights its lamp and its player's shape in gold, lifts
//                           the room's lights a step for a moment, and snaps its follow spot on: from the rig over the
//                           stage (above the frame: the beam comes in at its top edge), a cone widening down through the
//                           haze onto the desk, the desk lit, a pool on the floor at its foot; the spot holds until the
//                           other side strikes, then dims (its cone gone, a fainter pool, the desk a silhouette again);
//                           the camera keeps moving in
//   LIGHTS    6             the camera lands on the quiz's wide on the downbeat as the room's white light comes on;
//                           the moving heads fire inward and sweep out, stopping dead on the next beat, their beams
//                           thrown long (each runs out of the frame, behind a desk or down to the wall's foot: no beam
//                           ends in the air); the band comes in
//   FLIP      6.5-7.5       the board's letters flip in one by one, left to right, tile by tile, to PAY ATTENTION
//                           under the emblem's two lamps (a mallet run up the scale)
//   CLOSE     8-10          a cut to the board, twice the wide: the emblem and the name at 2x
//   (then the emblem and the package's plate: payattentiontitles.js)
//
// From the room's light on, everything is the set's own pixels (palette only, no shimmer: the set's lights are fixed
// world points) but for the players' backlights: the soft pools on the wall behind the contestants come up with the
// cast, so the empty studio's wall is black behind the desks. In the dark the frame is built from black up: only the
// room's light sources, dimmed a step or two along the neutral ramp (never amber), the desks as silhouettes, and the
// spots. No people: the players arrive with the programme.
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
import { QUIZ, quizCamera, drawQuizLive, shapeBulbs, marqueeBulbs, stageEdgeRows, deskRect, lampRect, rasterQuizDesks, beamOf } from '../../v2/canvas25d/studio/quiz.js';
import { SET, F, kAt, sxOf, syOf } from '../../v2/canvas25d/studio/geometry.js';

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
// The follow spots: on each lamp's strike a spot snaps on to that desk from the rig over the front of the stage (above
// the frame, so its beam comes in at the frame's top edge), its cone widening down through the haze onto the desk, a
// pool on the floor round the desk's foot; it holds until the other side strikes, then dims

/** The spots' rig and aim (world units): the source above the frame, in front of the desks and a little outside each;
 * the aim on the desk's front, near its top; the beam's radius there (the desk and the floor round its foot). */
const SPOT = Object.freeze({ Y: -330, Z: 876, out: 10, aimY: 0, aimZ: 892, r: 40, r0: 1.5 });

/** Desk A's or B's spot at beat b: 2 on (from its lamp's strike), 1 dimmed (once the other side has struck), 0 off. */
export function spotAt(id, b) {
  if (b >= Q.both || b < Q.lamps[0]) return 0;
  const mine = (i) => (i % 2 === 0) === (id === 'A');
  let last = -1;
  for (let i = 0; i < Q.lamps.length; i++) if (b >= Q.lamps[i]) last = i;
  if (mine(last)) return 2;
  for (let i = 0; i < last; i++) if (mine(i)) return 1;
  return 0;
}

/** A spot's cone (world units): its apex, its unit axis, its radius r0 + tan * h at h along the axis. */
function spotCone(id) {
  const D = QUIZ.desks[id];
  const A = [D.X + (id === 'A' ? -1 : 1) * SPOT.out, SPOT.Y, SPOT.Z];
  const v = [D.X - A[0], SPOT.aimY - A[1], SPOT.aimZ - A[2]];
  const len = Math.hypot(v[0], v[1], v[2]);
  return Object.freeze({ A, u: [v[0] / len, v[1] / len, v[2] / len], tan: (SPOT.r - SPOT.r0) / len, r0: SPOT.r0 });
}
export const SPOT_CONES = Object.freeze({ A: spotCone('A'), B: spotCone('B') });

/** Where a spot's axis meets the floor (world X, Z) and its radius there. */
export function spotFloor(id) {
  const c = SPOT_CONES[id];
  const h = (SET.floorY - c.A[1]) / c.u[1];
  return { X: c.A[0] + c.u[0] * h, Z: c.A[2] + c.u[2] * h, r: c.r0 + c.tan * h };
}

// the neutral ramp's order: a light lifts a pixel to its colour, never darkens it
const RANK = new Map([C.black, C.ink, C.slate, C.steel, C.fog, C.silver, C.white].map((c, i) => [c, i]));
const lift = (d, o, c) => {
  const r = RANK.get(d[o]);
  if (r !== undefined && r < RANK.get(c)) d[o] = c;
};
const FR2 = new Frame();
const CLIP2 = new Int16Array(W);
const SENTINEL = 0; // not a palette colour: the pixels the desks' raster leaves alone
const ROW0 = new Int16Array(H), ROW1 = new Int16Array(H);
const HAZE = 11; // the haze's ink share through the cone's middle (of 16)

/** Each row's columns a cone can touch on screen (its cross-sections from the source to the floor, boxed). */
function coneRows(cam, c) {
  ROW0.fill(W);
  ROW1.fill(-1);
  const hF = (SET.floorY - c.A[1]) / c.u[1];
  for (let i = 0; i <= 96; i++) {
    const h = (hF * 1.15 * i) / 96;
    const X = c.A[0] + c.u[0] * h, Y = c.A[1] + c.u[1] * h, Z = c.A[2] + c.u[2] * h;
    if (Z - cam.z < 1) continue;
    const k = kAt(cam, Z), r = (c.r0 + c.tan * h) * k + 2;
    const x = sxOf(cam, k, X), y = syOf(cam, k, Y);
    const xa = Math.max(0, Math.floor(x - r)), xb = Math.min(W - 1, Math.ceil(x + r));
    for (let yy = Math.max(0, Math.floor(y - r)); yy <= Math.min(H - 1, Math.ceil(y + r)); yy++) {
      if (xa < ROW0[yy]) ROW0[yy] = xa;
      if (xb > ROW1[yy]) ROW1[yy] = xb;
    }
  }
}

/**
 * The spots at beat b into d (the dark frame). A spot on: the haze in its cone (ink, densest through its middle) from
 * the frame's top edge down to where it lands, the pool on the floor round the desk's foot (slate at its heart, ink to
 * its edge) and the desk itself as the room's light shows it (the set's own desk raster). A dimmed spot: no cone, a
 * fainter pool (ink), and the desk back to its silhouette, standing black against it.
 */
function paintSpots(d, cam, b) {
  const on = { A: spotAt('A', b), B: spotAt('B', b) };
  if (!on.A && !on.B) return;
  // the desks as the room's light shows them (into a scratch frame: the spotted desk's pixels, and every desk's mask)
  FR2.px.fill(SENTINEL);
  rasterQuizDesks(FR2, cam, CLIP2, STYLE(), null);
  const desk = FR2.px;
  const f = F * cam.zoom;
  const edge = stageEdgeRows(cam);
  const sWall = SET.wallZ - cam.z;
  const yw = Math.round(syOf(cam, kAt(cam, SET.wallZ), SET.floorY));
  for (const id of ['A', 'B']) {
    const lv = on[id];
    if (!lv) continue;
    const c = SPOT_CONES[id];
    const ax = c.A[0], ay = c.A[1], az = c.A[2], ux = c.u[0], uy = c.u[1], uz = c.u[2];
    const D = QUIZ.desks[id];
    // the desk's own columns (its front and the side face the lens sees)
    const kf = kAt(cam, D.Z), kb = kAt(cam, D.Z + D.depth);
    const dx0 = Math.floor(Math.min(sxOf(cam, kf, D.X - D.hw), sxOf(cam, kb, D.X - D.hw))) - 1;
    const dx1 = Math.ceil(Math.max(sxOf(cam, kf, D.X + D.hw), sxOf(cam, kb, D.X + D.hw))) + 1;
    if (lv === 2) {
      // the light from above falls on the top and the cabinet; the plinth, set back under the cabinet's overhang, stays
      // in its shadow (black, as its silhouette)
      const yC = Math.round(syOf(cam, kf, QUIZ.cabinet));
      for (let y = 0; y < Math.min(H, yC); y++) for (let x = Math.max(0, dx0); x < Math.min(W, dx1); x++) {
        const o = y * W + x;
        if (desk[o] !== SENTINEL) d[o] = desk[o];
      }
    }
    coneRows(cam, c);
    for (let y = 0; y < H; y++) {
      if (ROW1[y] < ROW0[y]) continue;
      const dy = (y + 0.5 - cam.hy) / f;
      const sFloor = dy > 0 ? (SET.floorY - cam.y) / dy : Infinity;
      const sSurf = Math.min(sFloor, sWall);
      const floor = sFloor < sWall && y >= yw;
      for (let x = ROW0[y]; x <= ROW1[y]; x++) {
        const o = y * W + x;
        if (desk[o] !== SENTINEL) continue; // a desk: the spotted one is shown above, the others keep their silhouettes
        const dx = (x + 0.5 - 192) / f;
        const t = BAYER[y & 3][x & 3];
        // the pool: where the ray meets the stage's deck inside the cone (above the ring of light)
        if (floor && edge[x] >= 0 && y < edge[x]) {
          const wx = cam.x + dx * sFloor - ax, wy = SET.floorY - ay, wz = cam.z + sFloor - az;
          const h = wx * ux + wy * uy + wz * uz;
          const ex = wx - h * ux, ey = wy - h * uy, ez = wz - h * uz;
          const v = Math.sqrt(ex * ex + ey * ey + ez * ez) / (c.r0 + c.tan * h);
          if (v < 1) {
            if (lv === 2) {
              if (v < 0.45 || (v < 0.7 && t < ((0.7 - v) / 0.25) * 16)) lift(d, o, C.slate);
              else if (t < ((1 - v) / 0.3) * 16) lift(d, o, C.ink);
            } else if (v < 0.5 || t < ((0.9 - v) / 0.4) * 12) lift(d, o, C.ink);
          }
        }
        // the haze: the ray's path through the cone before it lands (on the floor or the wall; the desks are masked)
        if (lv !== 2) continue;
        const wx = cam.x - ax, wy = cam.y - ay, wz = cam.z - az;
        const h0 = wx * ux + wy * uy + wz * uz, hd = dx * ux + dy * uy + uz;
        const rr = c.r0 + c.tan * h0, t2 = c.tan * c.tan, dd = dx * dx + dy * dy + 1;
        const qa = dd - hd * hd * (1 + t2);
        const qb = 2 * (wx * dx + wy * dy + wz - h0 * hd - c.tan * hd * rr);
        const qc = wx * wx + wy * wy + wz * wz - h0 * h0 - rr * rr;
        const disc = qb * qb - 4 * qa * qc;
        if (!(qa > 0) || disc <= 0) continue;
        const sq = Math.sqrt(disc);
        const s0 = Math.max(0, (-qb - sq) / (2 * qa)), s1 = Math.min(sSurf, (-qb + sq) / (2 * qa));
        if (s1 <= s0) continue;
        const hm = h0 + hd * ((s0 + s1) / 2);
        if (hm <= 0) continue;
        const rho = ((s1 - s0) * Math.sqrt(dd)) / (2 * (c.r0 + c.tan * hm));
        if (t < Math.min(1, rho) * HAZE) lift(d, o, C.ink);
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// The studio at beat b

const FR = new Frame();
const CLIP = new Int16Array(W);
const CLIP_LIT = new Int16Array(W);
const STYLE = () => styleFor(ID);
// the open's room: the set's own light, but for the players' backlights (the soft pools on the wall behind the
// contestants' heads come up with the cast; the empty studio's wall is black behind the desks)
const OPEN_STYLE = Object.freeze({ ...styleFor(ID), pools: Object.freeze([]), bakeKey: 'pay-attention-open' });
const OPTS = { style: OPEN_STYLE, wall: { mode: 'rest', solo: true }, shotSince: 0, lod: 0 };
const T0 = 1000; // the set's clock at the cut (its live layer is a pure function of time)
const ST = { question: true, lamps: { A: false, B: false }, scores: { A: null, B: null } };
const DESKS_ONLY = { beams: false, heads: false, desks: true };
// the moving heads in the room's light: their beams thrown long, so each one runs out of the frame, behind a desk or
// down to the floor at the wall's foot (never ending in the air)
const LIT = { beams: true, heads: true, desks: true, reach: 4 };

/** Paint the studio at beat b (returns its pixels: a 384 x 216 frame, the open's layer copies it). */
export function paintStage(b) {
  const cam = cameraAt(b);
  const t = T0 + b * BEAT;
  const px = FR.px;
  const n = darkAt(b);
  ST.lamps.A = lampAt('A', b) > 0;
  ST.lamps.B = lampAt('B', b) > 0;
  if (n > 0) {
    // the dark: black up, the light sources dimmed, the desks' silhouettes; on each strike its follow spot; the lamps
    paintDark(px, cam, n);
    paintSpots(px, cam, b);
    drawQuizLive(FR, cam, t, CLIP_NONE, false, ST, 0, DESKS_ONLY);
  } else {
    // the room lit: the set as it airs (without the players' backlights), the open's own board face, the heads firing
    // and sweeping
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
    litClip(cam, CLIP);
    drawQuizLive(FR, cam, t, CLIP_LIT, false, ST, beamAt(b), LIT);
  }
  // the lamps' players' shapes on the wall, gold while their lamp is lit
  for (const id of ['A', 'B']) {
    if (!ST.lamps[id]) continue;
    for (const bl of shapeBulbs(cam, id)) fill(px, bl.x, bl.y, bl.x + bl.n, bl.y + bl.n, C.yellow);
  }
  return px;
}
const CLIP_NONE = new Int16Array(W).fill(H);

/** The beams' clip in the room's light: each column's desk top, and the wall's foot (a beam on the wall's plane lands on
 * the floor there). */
function litClip(cam, clip) {
  const yw = Math.round(syOf(cam, kAt(cam, SET.wallZ), SET.floorY));
  for (let x = 0; x < W; x++) CLIP_LIT[x] = Math.min(clip[x], yw);
  return CLIP_LIT;
}
// the last step of a beam's light along its axis (drawBeam: peak 2.7 * (1 - 0.92 u^1.5) falls under one step there)
const BEAM_FADE = ((1 - 1 / 2.7) / 0.92) ** (2 / 3);

/**
 * Where each moving head's beam stops at beat b (the room's light; none before): for the left and the right head,
 * 'off' (the head out of the frame), 'edge' (it runs out of the frame), 'desk' or 'floor' (it lands), or 'air' (its
 * light fades out in the open air: never, by the tests).
 */
export function beamEndsAt(b) {
  if (b < Q.both || b >= Q.emblem) return [];
  const cam = cameraAt(b);
  FR2.px.fill(SENTINEL);
  rasterQuizDesks(FR2, cam, CLIP2, STYLE(), null);
  const clip = litClip(cam, CLIP2);
  const out = [];
  for (const side of [-1, 1]) {
    const bm = beamOf(cam, side, T0 + b * BEAT, beamAt(b));
    if (bm.lx < -20 || bm.lx > W + 20) {
      out.push({ side, how: 'off' });
      continue;
    }
    const len = bm.len * LIT.reach, fade = BEAM_FADE * len;
    let how = 'air', at = fade;
    for (let dd = 1; dd <= fade; dd += 0.5) {
      const x = bm.lx + bm.dx * dd, y = bm.ly + bm.dy * dd;
      if (x < 0 || x >= W || y < 0 || y >= H) {
        how = 'edge';
      } else if (y >= clip[Math.floor(x)]) {
        how = CLIP2[Math.floor(x)] <= y ? 'desk' : 'floor';
      } else continue;
      at = dd;
      break;
    }
    out.push({ side, how, at, fade });
  }
  return out;
}

/** Bake the studio's wall light ahead of the open's first lit frame (an idle slice after this module loads). */
export function warm() {
  warmSet(OPEN_STYLE);
}
export { CLOSE as QUIZ_CLOSE, WIDE as QUIZ_WIDE };
