// SEVEN DAYS's title sequence (owner, 12 Oct: "Resumen semanal: sí, pero cúrratelo"; as crafted as WORLD NOW's).
// Ten seconds on the programme's grid (cues.js, 90 BPM): the week turning over.
//
//   THE WEEK      beats 0-7    a row of seven split-flap cards lit from behind, the camera travelling along it;
//                              each card flutters through two letters and lands on its day on the beat as it
//                              reaches the centre (Monday to Sunday: a big initial, its name under it); the light
//                              round the row warms from a cool weekday navy to the weekend's dark red as the week
//                              goes by; the camera drifts past Sunday and stops
//   THE WEEKEND   7.4-9.5      the camera pulls back over the whole week, M T W T F S S, the weekend in coral; a
//                              glint runs along the cards' top edges; the light gives way to the open's field
//   THE STACK     9.5-10.5     the days gather into one stack behind Thursday's card, closing in to the emblem's size
//   SEVEN         11-11.5      Thursday's card turns over to the coral 7: the emblem; the bit pops from its corner
//   TITLE         11.5-14      the package's reveal; still for the last 0.8 s
//
// The cards are the emblem's own (week.js paintCard: drawn pixel by pixel at any centre and size), so the stack
// gathers to where the emblem has it and the last turn shows the emblem's 7: the hand-over never pops. Motion rules
// (worldtitles.js): while the camera travels and while the row holds, its positions are whole pixels (the cards slide,
// never re-sample); the field's dither is fixed on the screen and its warmth only ever grows (a pixel turns warm once);
// a card's turns step through their frames and never go back.
import { P } from '../../palette.js';
import { u32, clamp, seg, smoothstep, easeInOut } from '../../gfx/index.js';
import { W, H, CENTRE, ZOOM, TL, drawHopBit } from './kit.js';
import { WEEK_OPEN, paintCard, cardCentre, layerDrop, LAYERS, SEVEN } from './week.js';
import { track, sequence, Layer, ditherAt } from './seq.js';
import { CUES, hitOf } from './cues.js';

const ID = 'seven-days';
const Q = CUES[ID];
const BEAT = 60 / Q.bpm;
const HIT = hitOf(ID);
const SHIFT = HIT - TL.still;
const C = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, u32(v)]));

// the row: seven cards a pitch apart (units), side by side like a departure board's flaps, Thursday at the centre,
// on the emblem's card line. The pitch is whole pixels at both sizes the row holds still at: 80 px while the camera
// travels (4 px a frame at 30 fps), 42 px when the whole week stands in the frame
const PITCH = 30;
const K_RUN = 80 / PITCH;
const K_WEEK = 1.4;
const ROW = cardCentre(CENTRE.x, CENTRE.y, ZOOM); // the emblem's card centre at centre stage
const DAYS = [
  { glyph: 'M', label: 'MON' }, { glyph: 'T', label: 'TUE' }, { glyph: 'W', label: 'WED' }, { glyph: 'T', label: 'THU' },
  { glyph: 'F', label: 'FRI' }, { glyph: 'S', label: 'SAT' }, { glyph: 'S', label: 'SUN' },
].map((d, i) => Object.freeze({ ...d, tone: i >= 5 ? 'weekend' : 'day' }));
const NAMELESS = DAYS.map((d) => Object.freeze({ ...d, label: null }));
const BLANK = Object.freeze({ glyph: null, tone: 'day', label: null });
const X = (i) => (i - 3) * PITCH;

// Each card's turns: two quick flutters through other letters, then the day, landing on its beat (the clack). The
// flutter letters are fixed per card (a board's flaps come round in their own order).
const FLUTTER = ['KRB', 'EPA', 'YCN', 'HUG', 'XLD', 'ZOJ', 'QVR'];
const FAST = 0.22; // beats a flutter turn takes (0.15 s: every half of it on screen for two frames at 30 fps)
const LAST = 0.33; // beats the landing turn takes (0.22 s)
function turnsOf(i) {
  const land = Q.days[i];
  const a = { glyph: FLUTTER[i][0], tone: 'day', label: null };
  const b = { glyph: FLUTTER[i][1], tone: 'day', label: null };
  const t2 = land - LAST, t1 = t2 - FAST, t0 = t1 - FAST;
  return [
    { at: t0, dur: FAST, from: BLANK, to: a },
    { at: t1, dur: FAST, from: a, to: b },
    { at: t2, dur: LAST, from: b, to: DAYS[i] },
  ];
}
const TURNS = DAYS.map((_, i) => turnsOf(i));

/** The face card i shows at beat b and its turn under way (null, or { p, to }): blank until its day comes round. */
function cardState(i, b) {
  const turns = TURNS[i];
  if (b < turns[0].at) return { face: BLANK, flip: null };
  for (const t of turns) {
    const p = (b - t.at) / t.dur;
    if (p < 1) return { face: t.from, flip: { p: t === turns[2] ? easeInOut(p) : p, to: t.to } };
  }
  return { face: DAYS[i], flip: null };
}

// The camera: its x (units) over the row and its size (px a unit). It is already travelling as the picture comes up,
// a card a beat (each card lands as it reaches the centre: 80 px a beat, 4 px a frame at 30 fps), drifts past Sunday
// and stops, then pulls back to the whole week, centred on Thursday.
const CAM_X = track([[-1, X(0) - 2 * PITCH], [0, X(0) - PITCH], [1, X(0)], [2, X(1)], [3, X(2)], [4, X(3)], [5, X(4)], [6, X(5)], [7, X(6)], [7.6, X(6) + 0.3 * PITCH], [Q.week, 0], [16, 0]]);
const CAM_K = track([[0, K_RUN], [Q.pull, K_RUN], [Q.week, K_WEEK], [16, K_WEEK]]);

// ---------------------------------------------------------------------------------------------
// The light behind the row: a soft halo round the board (at its brightest half dithered, at the board's edges and in
// the gaps between the cards, falling off over ~45 px in flat steps with short dithers), its colour the week's: a cool weekday navy on Monday, warming day
// by day to the weekend's dark red (each pixel of the screen's matrix turns warm once); then the open's own field
// through the pull-back

const COOL = [C.black, C.ink, C.navy];
const WARM = [C.black, C.maroon, C.darkRed];
const warmthAt = (b) => smoothstep(Q.days[1], Q.days[6], b);
// the board's rectangle on screen for the frame being drawn (lightAt reads it)
const BOARD = { x0: 0, x1: 0, y0: 0, y1: 0 };
function lightAt(x, y, warm, up) {
  const ramp = ditherAt(x, y) < warm * 16 ? WARM : COOL;
  const dx = x + 0.5 < BOARD.x0 ? BOARD.x0 - x - 0.5 : x + 0.5 > BOARD.x1 ? x + 0.5 - BOARD.x1 : 0;
  const dy = y + 0.5 < BOARD.y0 ? BOARD.y0 - y - 0.5 : y + 0.5 > BOARD.y1 ? (y + 0.5 - BOARD.y1) * 1.4 : 0; // less under it
  const v = clamp(1.75 - Math.hypot(dx, dy) / 24, 0, 2) * up;
  const i = v | 0;
  const f = (v - i - 0.55) / 0.45;
  return ramp[Math.min(2, i + (f > 0 && ditherAt(x, y) < f * 16 ? 1 : 0))];
}

const BG = new Layer('week-titles');
const FRONT = new Layer('week-board'); // the cards, laid over the field
let FIELD = null;
/** The open's field (the package's backdrop) as pixels, read once from its canvas (for the dissolve). */
function fieldPixels() {
  if (FIELD) return FIELD;
  const cv = WEEK_OPEN.background();
  try {
    const img = cv.getContext('2d').getImageData(0, 0, W, H);
    FIELD = new Uint32Array(img.data.buffer.slice(0));
  } catch {
    FIELD = new Uint32Array(W * H).fill(C.black);
  }
  return FIELD;
}

/** The glint along the cards' top edges at beat b: a screen x travelling the row once, left to right. */
function glintAt(b, k) {
  const u = seg(b, Q.week - 0.3, 0.9);
  if (u <= 0 || u >= 1) return null;
  const half = (3 * PITCH + 17) * k;
  return 192 - half + 2 * half * u;
}

/** The camera at beat b: x (units; whole pixels while it travels) and size (px a unit). */
function cameraAt(b) {
  const x = CAM_X(b);
  return { x: b < Q.pull ? Math.round(x * K_RUN) / K_RUN : x, k: CAM_K(b) };
}

/**
 * The board at beat b painted into T: the row of cards (whole pixels while the camera travels and once the week stands
 * still), then the stack gathering behind Thursday at the emblem's size and Thursday's card turning to the 7.
 */
export function paintBoard(T, b) {
  if (b < Q.gather) {
    const { x: camX, k } = cameraAt(b);
    const still = b < Q.pull || b >= Q.week;
    const glint = glintAt(b, k);
    const named = k >= 2.42; // the names go as the cards shrink (their type would fall to a single pixel)
    for (let i = 0; i < 7; i++) {
      const sx = 192 + (X(i) - camX) * k;
      if (sx < -18 * k || sx > W + 18 * k) continue;
      const st = cardState(i, b);
      const face = !named && st.face === DAYS[i] ? NAMELESS[i] : st.face;
      const to = st.flip && !named && st.flip.to === DAYS[i] ? NAMELESS[i] : st.flip?.to;
      paintCard(T, still ? Math.round(sx) : sx, ROW.y, k, glint == null ? face : { ...face, glint }, st.flip ? { p: st.flip.p, to } : null);
    }
    return;
  }
  // the stack: the days gather behind Thursday, the outer pairs lowest, closing in to the emblem's size
  const g = easeInOut(seg(b, Q.gather, Q.stack - Q.gather));
  const kg = K_WEEK + (ZOOM - K_WEEK) * g;
  for (let n = LAYERS; n >= 1; n--) {
    for (const i of [3 - n, 3 + n]) {
      const sx = 192 + X(i) * kg * (1 - g);
      paintCard(T, g >= 1 ? Math.round(sx) : sx, ROW.y + layerDrop(n, kg) * g, kg, NAMELESS[i]);
    }
  }
  const p = (b - Q.seven) / LAST;
  paintCard(T, ROW.x, ROW.y, kg, NAMELESS[3], p > 0 ? { p: p >= 1 ? 1 : easeInOut(p), to: SEVEN } : null);
}

function before(ctx, dt) {
  const b = dt / BEAT;
  const { x: camX, k } = cameraAt(b);
  // the board's rectangle (the light's halo follows it)
  BOARD.x0 = 192 + (X(0) - 14 - camX) * k;
  BOARD.x1 = 192 + (X(6) + 14 - camX) * k;
  BOARD.y0 = ROW.y - 17 * k;
  BOARD.y1 = ROW.y + 17 * k;
  const d = BG.begin(0);
  const f = FRONT.begin(0);
  // the field: the week's light, dissolving into the open's field through the pull-back
  const dis = smoothstep(Q.pull + 0.5, Q.gather - 0.1, b);
  const field = dis > 0 ? fieldPixels() : null;
  const warm = warmthAt(b), up = smoothstep(-0.2, 0.9, b);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = y * W + x;
      d[o] = field && ditherAt(x, y) < dis * 16 ? field[o] : lightAt(x, y, warm, up);
    }
  }
  paintBoard({ d: f, w: W, h: H, ox: 0, oy: 0 }, b);
  // the board over its field
  for (let o = 0; o < W * H; o++) if (f[o]) d[o] = f[o];
  BG.end(ctx);
  // the bit pops out of the card's corner on the package's clock, as the emblem's does
  drawHopBit(ctx, dt - SHIFT, CENTRE.x, CENTRE.y, null, Math.round(WEEK_OPEN.shoulder * ZOOM), WEEK_OPEN.popAt);
}

const SEQ = sequence({ hit: HIT, before, reveal: WEEK_OPEN });

/** SEVEN DAYS's title sequence at dt seconds (full frame). */
export function drawWeekTitles(ctx, dt, info) {
  SEQ.draw(ctx, dt, info);
}

export const WEEK_TITLES = { ...WEEK_OPEN, warmJobs: () => [...WEEK_OPEN.warmJobs(), fieldPixels] };
export const WEEK_SEQ = SEQ;
/** For checks: the camera (units, px a unit), card i's state and its turns, the row's warmth at beat b; the dissolve. */
export const weekCamera = (b) => cameraAt(b);
export const weekCard = (i, b) => cardState(i, b);
export const weekTurns = (i) => TURNS[i];
export const weekWarmth = (b) => warmthAt(b);
export const weekField = (b) => smoothstep(Q.pull + 0.5, Q.gather - 0.1, b);
export { ROW as WEEK_ROW, PITCH as WEEK_PITCH, K_RUN as WEEK_K_RUN, K_WEEK as WEEK_K_WEEK };
