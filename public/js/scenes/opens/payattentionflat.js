// PAY ATTENTION's title sequence without its studio (pay-attention.md §6): the open as a flat drawing, front on, in
// whole pixels, for the page that never loads the v2 studio (?v2=0), and for the instants before the studio has arrived
// or if it fails to load (payattentiontitles.js picks one or the other for each play, never both in one). The same grid
// and the same events as the studio's sequence (payattentionstudio.js):
//
//   DARK      beats 0-2     the quiz studio with its lights out, black but for its lights glimmering: the board's
//                           marquee bulbs dimmed, the stage's diodes and their sheen on the deck; the desks black
//                           silhouettes, their lids' edges and the lamps' housings catching a little
//   LAMPS     2-6           the lamps light in turn, one a beat: the circle (seat A, left), the square (seat B, right),
//                           the circle, the square, each flashing on its beat; the first light on each desk brings its
//                           front up, purple with its fog rim
//   LIGHTS    6             both lamps lit and the room's white light on the downbeat: the board's purple frame and its
//                           marquee, the stage's white nosing, the moving heads' beams (each runs out of the frame,
//                           behind a desk or down to the floor: never ending in the air)
//   FLIP      6.5-7.5       the question board turns over on its axis, edge-on at the half beat, to PAY ATTENTION
//   CLOSE     8-10          a cut closer: the board and its two words (a still framing: never a zoom)
//   (then the emblem and the package's plate: payattentiontitles.js)
//
// Every rectangle is placed by the framing and rounded once at each edge, every rim is one pixel at either framing,
// every dither is the screen's fixed matrix. White light and gold lamps, purple only as fills with their rims.
import { P } from '../../palette.js';
import { textPixels } from '../../font.js';
import { u32, clamp } from '../../gfx/index.js';
import { W, H } from './kit.js';
import { Layer, ditherAt } from './seq.js';
import { CUES } from './cues.js';

const ID = 'pay-attention';
const Q = CUES[ID];
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
const SKIRTING = 150; // the wall's foot: the floor from here
const MARQUEE = 6; // the board's bulbs: one every 6 units along the frame's middle
// the deck's sheen behind the nosing in the dark: each row back from it, the share of its pixels in ink (of 16)
const SHEEN = [9, 8, 7, 6, 6, 5, 5, 4, 4, 3, 3, 2, 2, 1];

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

const L = new Layer('quiz-titles-flat');
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
/** The board's marquee: a bulb (a pixel in the wide, 2 x 2 in the close) every MARQUEE units round the frame's middle. */
function marquee(c) {
  const f = BOARD.frame / 2, n = Math.max(1, Math.round(FR.k * 0.9));
  const u0 = BOARD.u0 + f, u1 = BOARD.u1 - f, v0 = BOARD.v0 + f, v1 = BOARD.v1 - f;
  const at = (u, v) => fill(sx(u) - (n >> 1), sy(v) - (n >> 1), sx(u) - (n >> 1) + n, sy(v) - (n >> 1) + n, c);
  const nu = Math.round((u1 - u0) / MARQUEE), nv = Math.round((v1 - v0) / MARQUEE);
  for (let i = 0; i <= nu; i++) {
    at(u0 + ((u1 - u0) * i) / nu, v0);
    at(u0 + ((u1 - u0) * i) / nu, v1);
  }
  for (let i = 1; i < nv; i++) {
    at(u0, v0 + ((v1 - v0) * i) / nv);
    at(u1, v0 + ((v1 - v0) * i) / nv);
  }
}

/** A moving head's lens and beam direction at beat b (the beams sweep slowly with the band, mirrored, inward positive). */
export function flatBeam(h, b) {
  const a = (-12 + 12 * Math.sin(((b - Q.both) / 8) * Math.PI)) * (Math.PI / 180);
  const dx = -h.side * Math.sin(a), dy = Math.cos(a);
  const k = FR.k;
  const r = 3.4 * k;
  const lx = 192 + (h.u - FR.cx) * k + dx * (r - 0.6), ly = 108 + (h.v - FR.cy) * k + dy * (r - 0.6);
  // thrown long: each beam runs out of the frame, behind a desk (drawn over it) or down to the wall's foot
  return { lx, ly, dx, dy, r, len: 175 * k, floor: sy(SKIRTING) };
}
/** A moving head's beam in the haze (drawn before the desks, which stand in front of it; stopped at the wall's foot). */
function headBeam(h, b) {
  const { lx, ly, dx, dy, len, floor } = flatBeam(h, b);
  const tan = Math.tan(14 * (Math.PI / 180));
  // the cone: steel at the lens, slate, ink, out into the black (flat steps, a short band between them)
  const ramp = [0, C.ink, C.slate, C.steel];
  const xa = Math.max(0, Math.floor(lx - len)), xb = Math.min(W, Math.ceil(lx + len));
  const ya = Math.max(0, Math.floor(ly)), yb = Math.min(H, floor, Math.ceil(ly + len + 2));
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
}
/** A moving head's barrel and its lens turned along the beam. */
function headBarrel(h, b) {
  const { lx, ly, dx, dy, r } = flatBeam(h, b);
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
    else if (!state) c = d > -1 ? (dark ? C.slate : C.fog) : dark ? C.black : C.ink;
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

/** The flat stage at beat b painted into its layer (the wide or the close); returns the layer's pixels. */
export function paintFlat(b) {
  FR = framingOf(b);
  L.begin(C.black);
  const lit = roomLight(b);
  const dark = !lit;
  // the floor's skirting (no ceiling line: with the creep it would hug the frame's top edge)
  rect(-400, SKIRTING, 800, SKIRTING + 1, dark ? C.black : C.ink);
  // the moving heads' beams, behind everything on the stage (the room's light on)
  if (lit) for (const h of HEADS) headBeam(h, b);
  // the question board: its frame purple with a fog rim and its marquee lit once the light is up; in the dark a black
  // shape, only its marquee's bulbs glimmering (dimmed to slate: a dimmed warm white is a grey, never amber)
  if (lit) rimmed(BOARD.u0, BOARD.v0, BOARD.u1, BOARD.v1, C.purple, C.fog);
  rect(BOARD.u0 + BOARD.frame - 1, BOARD.v0 + BOARD.frame - 1, BOARD.u1 - BOARD.frame + 1, BOARD.v1 - BOARD.frame + 1, C.black);
  marquee(lit ? C.cream : C.slate);
  face(flipAt(b), lit);
  // the stage's nosing in the dark: its diodes dimmed by turns, their sheen on the deck behind them (the desks' bases
  // stand black against it)
  if (dark) {
    const y = sy(NOSING);
    for (let x = 0; x < W; x++) {
      for (let i = 1; i <= SHEEN.length; i++) if (y - i >= 0 && ditherAt(x, y - i) < SHEEN[i - 1]) L.d[(y - i) * W + x] = C.ink;
      fill(x, y, x + 1, y + 1, x & 1 ? C.ink : C.slate);
    }
  }
  // the screen's bezel lips: its top and left edges catch the light (the key from the left), as every set's screen
  if (lit) {
    const f = BOARD.frame;
    rect(BOARD.u0 + f, BOARD.v0 + f, BOARD.u1 - f, BOARD.v0 + f + 1, C.ink);
    rect(BOARD.u0 + f, BOARD.v0 + f, BOARD.u0 + f + 1, BOARD.v1 - f, C.ink);
  }
  // the desks: lit (desk A and B from their lamps' first light, the podium with the room), an ink front, the top's front
  // edge silver, the purple band with its fog rim, the score window, the lamp; unlit, a black silhouette, only its lid's
  // edge (ink) and its lamp's housing (slate) catching a little
  for (const id of ['A', 'B', 'host']) {
    const D = DESKS[id];
    const up = id === 'host' ? lit : deskUp(id, b);
    rect(D.u0, D.v0, D.u1, D.v1, up ? C.ink : C.black);
    rect(D.u0, D.v0, D.u1, D.v0 + 1, up ? C.silver : C.ink);
    rect(D.u0, D.v0 + 1, D.u1, D.v0 + 2, C.black);
    rect(D.u0, D.v1 - 6, D.u1, D.v1, C.black);
    if (id === 'host' || !up) {
      if (id !== 'host') lamp(id, lampAt(id, b), true);
      continue;
    }
    const fv0 = D.v0 + FASCIA.dv0, fv1 = D.v0 + FASCIA.dv1;
    rimmed(D.u0 + FASCIA.inset, fv0, D.u1 - FASCIA.inset, fv1, C.purple, C.fog);
    rect(SCORE[id].u0, fv0 + 3, SCORE[id].u1, fv1 - 3, C.black);
    lamp(id, lampAt(id, b), false);
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
  if (lit) for (const h of HEADS) headBarrel(h, b);
  return L.d;
}
/** The flat stage's layer (the sequence draws it). */
export const flatLayer = () => L;
export { BOARD as FLAT_BOARD, DESKS as FLAT_DESKS };

// the last step of a beam's light along its axis (2.7 * (1 - 0.92 u^1.5) falls under one step there)
const BEAM_FADE = ((1 - 1 / 2.7) / 0.92) ** (2 / 3);
/**
 * Where each moving head's beam stops at beat b in the room's light (none before): 'edge' (it runs out of the frame),
 * 'desk' (behind one), 'floor' (down to the wall's foot), or 'air' (its light fades out in the open air: never, by the
 * tests).
 */
export function flatBeamEnds(b) {
  if (!roomLight(b) || b >= Q.emblem) return [];
  FR = framingOf(b);
  return HEADS.map((h) => {
    const { lx, ly, dx, dy, len, floor } = flatBeam(h, b);
    const fade = BEAM_FADE * len;
    for (let d = 1; d <= fade; d += 0.5) {
      const x = lx + dx * d, y = ly + dy * d;
      if (x < 0 || x >= W || y < 0) return { side: h.side, how: 'edge', at: d, fade };
      if (y >= floor || y >= H) return { side: h.side, how: 'floor', at: d, fade };
      for (const D of Object.values(DESKS)) if (x >= sx(D.u0) && x < sx(D.u1) && y >= sy(D.v0)) return { side: h.side, how: 'desk', at: d, fade };
    }
    return { side: h.side, how: 'air', at: fade, fade };
  });
}


