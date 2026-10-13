// PAY ATTENTION's title sequence (pay-attention.md §6: "≈8 s, 112 BPM: a dark stage; the buzzer lamps of both desks
// light in turn on the beat; the question board flips to PAY ATTENTION; the plate"), on the programme's grid (cues.js):
//
//   DARK      beats 0-2     the quiz studio with its lights out: the question board's frame, the three desks and the
//                           two shape lamps only just made out (slate rims on black), the lamps unlit
//   LAMPS     2-6           the lamps light in turn, one a beat: the circle (seat A, left), the square (seat B, right),
//                           the circle, the square, each flashing on its beat (the buzzers play the channel's signature,
//                           left and right); the first light on each desk brings its front up, purple with its fog rim
//   LIGHTS    6             both lamps lit and the room's white light on the downbeat: the board's purple frame, the
//                           washes behind the desks, the moving heads' beams, the stage's white nosing; the band comes in
//   FLIP      6.5-7.5       the question board turns over on its axis, edge-on at the half beat, to PAY ATTENTION
//   CLOSE     8-10          a cut closer: the board and its two words (a still framing: never a zoom)
//   EMBLEM    10            a cut: the two lamps alone, lit, on the open's field: the emblem, from which the package's
//                           plate wipes out (purple, white type, its fog rim)
//   TITLE     10.9-14       the package's reveal; still for the last 0.8 s
//
// The stage is drawn flat, front on, in whole pixels (stage units are the wide's pixels): every rectangle is placed by
// the framing and rounded once at each edge, every rim is one pixel at either framing, every dither is the screen's fixed
// matrix. The two framings are still (cut-ins, no zoom), the moving heads' beams the only motion in the room. Nothing on
// the stage borrows TECH BYTES's rings or LEDs or COSMOS's purple glow: white light and gold lamps, purple only as fills
// with their rims. No people: the players arrive with the programme.
import { P } from '../../palette.js';
import { textPixels } from '../../font.js';
import { u32, clamp } from '../../gfx/index.js';
import { W, H, CENTRE, ZOOM } from './kit.js';
import { QUIZ_OPEN, paintLamps, BUILD_DONE } from './payattention.js';
import { sequence, Layer, ditherAt } from './seq.js';
import { CUES, hitOf } from './cues.js';

const ID = 'pay-attention';
const Q = CUES[ID];
const BEAT = 60 / Q.bpm;
const HIT = hitOf(ID);
const C = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, u32(v)]));

// ---------------------------------------------------------------------------------------------
// The stage (units: the wide's pixels)

const BOARD = { u0: 118, v0: 22, u1: 266, v1: 104, frame: 8 };
const DESKS = {
  A: { u0: 14, u1: 126, v0: 120, v1: 178 },
  B: { u0: 258, u1: 370, v0: 120, v1: 178 },
  host: { u0: 160, u1: 224, v0: 124, v1: 178 },
};
const FASCIA = { dv0: 3, dv1: 19, inset: 4 };
const LAMP = { A: { u: 110, v: 131, r: 6.5 }, B: { u: 274, v: 131, h: 6 } };
const SCORE = { A: { u0: 48, u1: 66 }, B: { u0: 318, u1: 336 } };
const NOSING = 186;
const HEADS = [{ u: 24, v: 30, side: -1 }, { u: 360, v: 30, side: 1 }];
const WASHES = [{ u: 72, v: 52, ru: 40, rv: 66 }, { u: 312, v: 52, ru: 40, rv: 66 }];
const WASH_TOP = 4; // the washes' flat top (under the ceiling, as the set's pools)

/**
 * The framings: the wide, creeping in on the dark stage by 5 % over the lamps' beats (from the cut to the room's light,
 * eased, then held: every edge moves one way, a pixel changes once), until the close; then the board close, twice the
 * wide, centred on the board (a cut, held still).
 */
export const FRAMINGS = Object.freeze([{ cx: 192, cy: 100, k: 1 }, { cx: 192, cy: 63, k: 2 }]);
const CREEP = 0.05;
const framingAt = (b) => (b >= Q.close ? 1 : 0);
const creepAt = (b) => 1 + CREEP * smooth(clamp(b / Q.both, 0, 1));
const smooth = (u) => u * u * (3 - 2 * u);
const FRAME = { cx: 192, cy: 100, k: 1 };
/** The framing on air at beat b (the wide's creep included). */
export function framingOf(b) {
  const f = FRAMINGS[framingAt(b)];
  FRAME.cx = f.cx;
  FRAME.cy = f.cy;
  FRAME.k = framingAt(b) ? f.k : f.k * creepAt(b);
  return FRAME;
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
/** Is desk A or B's front up (its lamp has lit at least once)? */
const deskUp = (which, b) => b >= Q.lamps[which === 'A' ? 0 : 1];
/** The room's white light: off, then on with the downbeat. */
export const roomLight = (b) => (b >= Q.both ? 1 : 0);
/** The board's turn: 0 (the blank face) to 1 (PAY ATTENTION), over a beat from the flip. */
export const flipAt = (b) => clamp((b - Q.flip) / Q.flipLen, 0, 1);

// ---------------------------------------------------------------------------------------------
// Drawing (into the layer's pixels through the framing)

const L = new Layer('quiz-titles');
let FR = FRAME;
const sx = (u) => Math.round(192 + (u - FR.cx) * FR.k);
const sy = (v) => Math.round(108 + (v - FR.cy) * FR.k);
function fill(x0, y0, x1, y1, c) {
  const d = L.d;
  for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) d[y * W + x] = c;
}
function rect(u0, v0, u1, v1, c) {
  fill(sx(u0), sy(v0), sx(u1), sy(v1), c);
}
/** A filled box with a one-pixel rim at either framing (the rim is the screen box's own edge). */
function rimmed(u0, v0, u1, v1, c, rimC) {
  const x0 = sx(u0), y0 = sy(v0), x1 = sx(u1), y1 = sy(v1);
  fill(x0, y0, x1, y1, rimC);
  fill(x0 + 1, y0 + 1, x1 - 1, y1 - 1, c);
}

/**
 * A wash of light on the back wall, as the set's pools: an ink oval from above, flat-topped under the ceiling line (a
 * three-unit Bayer band there), its sides and foot a short Bayer band (the screen's fixed matrix).
 */
function wash(w) {
  const x0 = sx(w.u - w.ru), x1 = sx(w.u + w.ru), y0 = Math.max(sy(WASH_TOP - 3), sy(w.v - w.rv)), y1 = sy(w.v + w.rv);
  const cx = (sx(w.u - w.ru) + x1) / 2, cy = (sy(w.v - w.rv) + y1) / 2, rx = (x1 - x0) / 2, ry = (y1 - sy(w.v - w.rv)) / 2;
  for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) {
    const v = FR.cy + (y + 0.5 - 108) / FR.k;
    const top = (v - (WASH_TOP - 3)) / 3; // the falloff under the ceiling
    for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r >= 1) continue;
      const f = Math.min((1 - r) / 0.22, top); // the band in the outer 22 %
      if (f > 0 && (f >= 1 || ditherAt(x, y) < f * 16)) L.d[y * W + x] = C.ink;
    }
  }
}

/** A moving head and its beam (the room's light on): the barrel, its lens along the beam, the cone in the haze. */
function movingHead(h, b) {
  // the beams sweep slowly with the band, mirrored (inward positive)
  const a = (-12 + 12 * Math.sin(((b - Q.both) / 8) * Math.PI)) * (Math.PI / 180);
  const dx = -h.side * Math.sin(a), dy = Math.cos(a);
  const k = FR.k;
  const r = 3.4 * k;
  const lx = 192 + (h.u - FR.cx) * k + dx * (r - 0.6), ly = 108 + (h.v - FR.cy) * k + dy * (r - 0.6);
  // the cone: steel at the lens, slate, ink, out into the black (flat steps, a short band between them)
  const len = 46 * k, tan = Math.tan(14 * (Math.PI / 180));
  const ramp = [0, C.ink, C.slate, C.steel];
  const xa = Math.max(0, Math.floor(lx - len)), xb = Math.min(W, Math.ceil(lx + len));
  const ya = Math.max(0, Math.floor(ly)), yb = Math.min(H, Math.ceil(ly + len + 2));
  for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) {
    const rx = x + 0.5 - lx, ry = y + 0.5 - ly;
    const d = rx * dx + ry * dy;
    if (d <= 0.5 || d >= len) continue;
    const off = Math.abs(rx * dy - ry * dx), hw = 1 + d * tan;
    if (off >= hw) continue;
    const u = d / len, v = off / hw;
    const lvl = 2.7 * (1 - 0.92 * u * Math.sqrt(u)) * (1 - v * v * v);
    let step = Math.floor(lvl);
    const f = lvl - step;
    if (f > 0.62 && ((f - 0.62) / 0.38) * 16 > ditherAt(x, y)) step++;
    if (step > 0) {
      const o = y * W + x;
      if (L.d[o] === C.black || (step >= 2 && L.d[o] === C.ink) || (step >= 3 && L.d[o] === C.slate)) L.d[o] = ramp[Math.min(3, step)];
    }
  }
  // the barrel and its lens
  const hx = lx - dx * (r - 0.6), hy = ly - dy * (r - 0.6);
  for (let y = Math.floor(hy - r - 1); y <= Math.ceil(hy + r + 1); y++) for (let x = Math.floor(hx - r - 1); x <= Math.ceil(hx + r + 1); x++) {
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    const ex = x + 0.5 - hx, ey = y + 0.5 - hy;
    const d2 = ex * ex + ey * ey;
    if (d2 > r * r) continue;
    const rim = d2 > (r - 1.1) * (r - 1.1);
    let c = rim && ex + ey < -r * 0.35 ? C.steel : C.slate;
    const lx2 = x + 0.5 - lx, ly2 = y + 0.5 - ly, lr = Math.max(1.2, r * 0.48);
    if (lx2 * lx2 + ly2 * ly2 <= lr * lr) c = lx2 * lx2 + ly2 * ly2 <= (lr * 0.45) ** 2 + 0.3 ? C.white : C.silver;
    L.d[y * W + x] = c;
  }
}

/** A shape lamp (circle on desk A, square on desk B): its black housing, then unlit (ink, the fog outline) or lit. */
function lamp(which, state, dark) {
  const k = FR.k;
  const cx = 192 + (LAMP[which].u - FR.cx) * k, cy = 108 + (LAMP[which].v - FR.cy) * k;
  const rr = (which === 'A' ? LAMP.A.r : LAMP.B.h) * k;
  const sd = (x, y) => {
    const u = x + 0.5 - cx, v = y + 0.5 - cy;
    if (which === 'A') return Math.hypot(u, v) - rr;
    const qx = Math.abs(u) - rr, qy = Math.abs(v) - rr;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
  };
  for (let y = Math.floor(cy - rr - 2); y <= Math.ceil(cy + rr + 2); y++) for (let x = Math.floor(cx - rr - 2); x <= Math.ceil(cx + rr + 2); x++) {
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    const d = sd(x, y);
    if (d > 1) continue;
    let c;
    if (d > 0) c = C.black;
    else if (!state) c = d > -1 ? (dark ? C.slate : C.fog) : C.ink;
    else {
      // the highlight: a small block up and to the left (a disc that small prints as a plus sign), grown on the flash
      const hu = x + 0.5 - cx + rr * 0.34, hv = y + 0.5 - cy + rr * 0.34, hs = rr * (state === 2 ? 0.42 : 0.24);
      const hot = Math.abs(hu) < hs && Math.abs(hv) < hs;
      c = d > -1 && y + 0.5 > cy ? C.orange : hot ? C.cream : C.yellow;
    }
    L.d[y * W + x] = c;
  }
}

/** The board's face at its turn p: blank (black) to PAY ATTENTION (white over silver, two lines at 2x of the wide). */
const WORDS = [textPixels('PAY', 'body'), textPixels('ATTENTION', 'body')];
function face(p, lit) {
  const f = BOARD.frame;
  const x0 = sx(BOARD.u0 + f), x1 = sx(BOARD.u1 - f), y0 = sy(BOARD.v0 + f), y1 = sy(BOARD.v1 - f);
  fill(x0, y0, x1, y1, C.black);
  if (p <= 0) return;
  // the panel turns on its horizontal axis: its height |cos|, edge-on at the half turn (a slate line: its edge)
  const cy = (y0 + y1) / 2, hh = (y1 - y0) / 2;
  const sc = Math.abs(Math.cos(Math.PI * p));
  if (sc < 0.08) {
    fill(x0, Math.round(cy) - 1, x1, Math.round(cy) + 1, C.slate);
    return;
  }
  // the panel's edges catch the light as it turns
  if (p < 1) {
    fill(x0, Math.round(cy - hh * sc), x1, Math.round(cy - hh * sc) + 1, C.slate);
    fill(x0, Math.round(cy + hh * sc) - 1, x1, Math.round(cy + hh * sc), C.slate);
  }
  if (p < 0.5 || !lit) return;
  // the words, scaled by the turn (rows sampled from the face, squashed toward the axis)
  const s = Math.round(2 * FR.k); // a whole pixel scale (the creep never makes a glyph's pixels uneven)
  const lineH = 7 * s, gap = 4 * s;
  const top = cy - (2 * lineH + gap) / 2;
  WORDS.forEach((t, i) => {
    const lx = Math.round((x0 + x1) / 2 - (t.width * s) / 2);
    const ly = top + i * (lineH + gap);
    for (const [gx, gy] of t.pixels) {
      for (let j = 0; j < s; j++) {
        // the row on the flat face, then squashed toward the axis by the turn
        const yf = ly + gy * s + j;
        const y = Math.round(cy + (yf - cy) * sc);
        if (y < y0 + 1 || y >= y1 - 1) continue;
        const c = gy >= 4 ? C.silver : C.white; // the chrome split of the network's titles
        fill(lx + gx * s, y, lx + (gx + 1) * s, y + 1, c);
      }
    }
  });
}

/** The stage at beat b painted into the layer (the wide or the close). */
export function paintStage(b) {
  FR = framingOf(b);
  L.begin(C.black);
  const lit = roomLight(b);
  const dark = !lit;
  // the back wall's washes (the room's light) and the floor's skirting (no ceiling line: with the creep it would hug
  // the frame's top edge; the washes' flat tops say where the ceiling is)
  if (lit) for (const w of WASHES) wash(w);
  rect(-400, 150, 800, 151, dark ? C.black : C.ink);
  // the question board: its frame purple with a fog rim once the light is up, a slate rim on black in the dark
  rimmed(BOARD.u0, BOARD.v0, BOARD.u1, BOARD.v1, lit ? C.purple : C.black, lit ? C.fog : C.slate);
  rect(BOARD.u0 + BOARD.frame - 1, BOARD.v0 + BOARD.frame - 1, BOARD.u1 - BOARD.frame + 1, BOARD.v1 - BOARD.frame + 1, C.black);
  face(flipAt(b), lit);
  // the screen's bezel lips: its top and left edges catch the light (the key from the left), as every set's screen
  if (lit) {
    const f = BOARD.frame;
    rect(BOARD.u0 + f, BOARD.v0 + f, BOARD.u1 - f, BOARD.v0 + f + 1, C.ink);
    rect(BOARD.u0 + f, BOARD.v0 + f, BOARD.u0 + f + 1, BOARD.v1 - f, C.ink);
  }
  // the desks: their fronts ink once lit (desk A and B by their lamps, the podium by the room), black in the dark; the
  // top's front edge silver when lit, slate in the dark; the purple band with its rim, the score window, the lamp
  for (const id of ['A', 'B', 'host']) {
    const D = DESKS[id];
    const up = id === 'host' ? lit : deskUp(id, b);
    rect(D.u0, D.v0, D.u1, D.v1, up ? C.ink : C.black);
    rect(D.u0, D.v0, D.u1, D.v0 + 1, up ? C.silver : C.slate);
    rect(D.u0, D.v0 + 1, D.u1, D.v0 + 2, C.black);
    rect(D.u0, D.v1 - 6, D.u1, D.v1, C.black);
    if (id === 'host') continue;
    const fv0 = D.v0 + FASCIA.dv0, fv1 = D.v0 + FASCIA.dv1;
    rimmed(D.u0 + FASCIA.inset, fv0, D.u1 - FASCIA.inset, fv1, up ? C.purple : C.black, up ? C.fog : C.slate);
    rect(SCORE[id].u0, fv0 + 3, SCORE[id].u1, fv1 - 3, C.black);
    lamp(id, lampAt(id, b), !up);
  }
  // the stage's white nosing (the room's light), broken under the desks' ends
  if (lit) {
    const y = sy(NOSING);
    const ends = new Set(Object.values(DESKS).flatMap((D) => [sx(D.u0), sx(D.u1) - 1]));
    for (let x = 0; x < W; x++) {
      if (ends.has(x)) continue;
      fill(x, y, x + 1, y + 1, x & 1 ? C.steel : C.fog);
      fill(x, y + 1, x + 1, y + 2, C.slate);
    }
  }
  if (lit) for (const h of HEADS) movingHead(h, b);
  return FR;
}

function before(ctx, dt) {
  const b = dt / BEAT;
  if (b >= Q.emblem) {
    // the emblem on the open's field: the package's first frame (the two lamps lit, at centre stage)
    ctx.drawImage(QUIZ_OPEN.background(), 0, 0);
    QUIZ_OPEN.emblem(ctx, BUILD_DONE, CENTRE.x, CENTRE.y, ZOOM);
    return;
  }
  paintStage(b);
  L.end(ctx);
}

// from the reveal on the package plays its open, the lamps settled lit
const REVEAL = { ...QUIZ_OPEN, emblem: (ctx, dt, x, y, k) => QUIZ_OPEN.emblem(ctx, Math.max(dt, BUILD_DONE), x, y, k) };
const SEQ = sequence({ hit: HIT, before, reveal: REVEAL });

/** PAY ATTENTION's title sequence at dt seconds (full frame). */
export function drawPayAttentionTitles(ctx, dt, info) {
  SEQ.draw(ctx, dt, info);
}

export const PAYATTENTION_TITLES = { ...QUIZ_OPEN, warmJobs: () => [...QUIZ_OPEN.warmJobs()] };
export const PAYATTENTION_SEQ = SEQ;
/** For checks: the stage's pixels at beat b (the layer); the framing on air; the emblem on its field at centre stage. */
export function payAttentionFrame(b) {
  paintStage(b);
  return L.d;
}
export const payAttentionFraming = (b) => framingAt(b);
/** The emblem painted at centre stage at the hand-over size into a fresh buffer (tests: no pop at the package). */
export function emblemPixels(x = CENTRE.x, y = CENTRE.y, k = ZOOM) {
  const T = { d: new Uint32Array(W * H), w: W, h: H, ox: 0, oy: 0 };
  paintLamps(T, x, y, k);
  return T.d;
}
export { BOARD as QUIZ_BOARD, DESKS as QUIZ_DESKS, LAMP as QUIZ_LAMPS };
