// SEVEN DAYS open: the week's card. A split-flap card, lit from above like the real thing (the upper flap a step
// lighter than the lower, a black hinge gap across its middle, the axle's two steel pins either side, a lit top
// edge), showing a coral 7; behind it the other days, a stack of cards whose edges show under it. The same
// package and clock as every open: the stack settles in at centre stage, its top card turns from blank to the 7,
// and it glides to its slot beside the plate. Accent: coral (the flagship's red, softened for the weekend).
//
// The cards are drawn pixel by pixel from their true shapes at any centre and size (paintCard), so SEVEN DAYS's
// title sequence (weektitles.js) flips the days on the same cards and hands over to this emblem without a pop.
//
//   paintCard(T, cx, cy, k, face, flip)   T = { d: Uint32Array, w, h, ox, oy } (a frame or a sprite buffer)
//   paintEmblem(T, x, y, k, dt)           the emblem (its stack and its card) at the open's instant dt
//   face = { glyph: 'M' | '7' | null, tone: 'day' | 'weekend' | 'seven', label: 'MON' | null, glint }
//   flip = null | { p: 0..1, to: face }      the upper flap falls over (the classic split-flap turn)
import { P } from '../../palette.js';
import { textPixels } from '../../font.js';
import { u32, seg, easeOutQuint, easeInOut } from '../../gfx/index.js';
import { lazyBackdrop, playOpen, CENTRE, frameBuffer } from './kit.js';

const C = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, u32(v)]));

/** The card in units (k = 1 in the lock-up): half width, top and foot from its centre, corner radius. */
export const CARD = Object.freeze({ hw: 14, top: -17, bot: 17, r: 1.8 });
/** The stack's layers under the top card: each card one layer further down by this many units. */
export const LAYER = 1.9;
export const LAYERS = 3; // the other six days, in pairs
// the big glyph: a 5x7 cell grid (3.2 units a cell) centred a unit above the hinge (which crosses its middle row);
// the coral 7 is drawn from its own shape in the same box
const CELL = 3.2;
const GLYPH = { x0: -8, y0: -12.2 };
// the day's name under its glyph, micro type at a whole-pixel scale
const LABEL_V = 11.4;

// the emblem's place: the card's centre two units above the emblem's centre (the stack hangs under it)
const LIFT = 2;
const EXTENT = CARD.hw + 2.6; // right half-width incl. the outline and the axle pin

const GLYPHS = new Map();
/** A glyph's cells as a 5x7 bitmap (the body font), cached. */
function glyphCells(ch) {
  let g = GLYPHS.get(ch);
  if (g) return g;
  g = new Uint8Array(35);
  const t = textPixels(ch, 'body');
  const dx = Math.floor((5 - t.width) / 2);
  for (const [x, y] of t.pixels) if (x + dx >= 0 && x + dx < 5 && y >= 0 && y < 7) g[y * 5 + x + dx] = 1;
  GLYPHS.set(ch, g);
  return g;
}

/** The coral 7 in the glyph's box (x -8..8, y -12.2..10.2): a slab across the top, a stem leaning to its foot. */
function inSeven(u, v) {
  if (v < -12.2 || v > 10.2 || u < -8 || u > 8) return false;
  if (v < -7.8) return true; // the slab
  // the stem: from the slab's right end down to the foot, a little left of centre
  const t = (v + 7.8) / 18; // 0 under the slab, 1 at the foot
  const right = 8 - t * 7.2;
  const left = 3.2 - t * 7.4;
  return u >= left && u <= right;
}

/** Is (u, v) on the face's glyph? */
function onGlyph(face, u, v) {
  if (!face.glyph) return false;
  if (face.glyph === '7') return inSeven(u, v);
  const gx = Math.floor((u - GLYPH.x0) / CELL), gy = Math.floor((v - GLYPH.y0) / CELL);
  if (gx < 0 || gx > 4 || gy < 0 || gy > 6) return false;
  return glyphCells(face.glyph)[gy * 5 + gx] === 1;
}

// the face's colours, upper and lower flap: the card (slate over ink), its glyph (the weekdays silver over fog,
// the weekend and the 7 coral)
const INK = {
  day: { up: C.silver, down: C.fog },
  weekend: { up: C.pink, down: C.pink },
  seven: { up: C.pink, down: C.pink },
};
// a flap turning edge-on: one step darker, then two
const DARK1 = new Map([[C.slate, C.ink], [C.ink, C.black], [C.silver, C.fog], [C.fog, C.steel], [C.pink, C.darkRed], [C.steel, C.slate]].map(([a, b]) => [a >>> 0, b]));
const DARK2 = new Map([[C.slate, C.black], [C.ink, C.black], [C.silver, C.steel], [C.fog, C.slate], [C.pink, C.maroon], [C.steel, C.ink]].map(([a, b]) => [a >>> 0, b]));

/** The colour of a face at (u, v) on its upper (v < 0) or lower flap; `edge`: the card's lit top edge row. */
function faceColour(face, u, v, edge) {
  const up = v < 0;
  if (onGlyph(face, u, v)) {
    const ink = INK[face.tone] || INK.day;
    return up ? ink.up : ink.down;
  }
  if (edge) return C.steel;
  return up ? C.slate : C.ink;
}

/** Inside the card's rounded rectangle (units)? */
function inCard(u, v) {
  const { hw, top, bot, r } = CARD;
  if (u < -hw || u > hw || v < top || v > bot) return false;
  const cx = Math.max(Math.abs(u) - (hw - r), 0);
  const cy = v < top + r ? top + r - v : v > bot - r ? v - (bot - r) : 0;
  return cx * cx + cy * cy <= r * r;
}

/**
 * Paint a card centred on (cx, cy) at size k into T. The hinge gap is the pixel row holding the card's centre
 * line (thicker as the card grows); a flip turns the upper flap over the hinge: while it falls (p < 0.5) its
 * old face shrinks toward the hinge, darkening as it turns edge-on, over the new upper face; then its back, the new
 * lower face, opens down over the old one. `glint`: a screen x where the top edge catches a passing light.
 */
export function paintCard(T, cx, cy, k, face, flip = null) {
  const { hw, top, bot } = CARD;
  const d = T.d, tw = T.w, th = T.h, ox = T.ox | 0, oy = T.oy | 0;
  const px1 = 1 / k;
  const gap = Math.max(1, Math.round(0.6 * k));
  const gy0 = Math.floor(cy - gap / 2 + 0.5); // the hinge gap's first row
  const x0 = Math.floor(cx - (hw + 2.6) * k) - 1, x1 = Math.ceil(cx + (hw + 2.6) * k) + 1;
  const y0 = Math.floor(cy + top * k) - 2, y1 = Math.ceil(cy + bot * k) + 2;
  const p = flip ? Math.min(1, Math.max(0, flip.p)) : 1;
  const to = flip ? flip.to : face;
  const c = Math.cos(p * Math.PI); // 1 → -1 over the turn
  const glint = face.glint ?? to.glint;
  for (let y = y0; y <= y1; y++) {
    const ty = y - oy;
    if (ty < 0 || ty >= th) continue;
    const v = (y + 0.5 - cy) / k;
    const hinge = y >= gy0 && y < gy0 + gap;
    const edgeRow = v >= top && v < top + px1;
    for (let x = x0; x <= x1; x++) {
      const tx = x - ox;
      if (tx < 0 || tx >= tw) continue;
      const u = (x + 0.5 - cx) / k;
      const o = ty * tw + tx;
      if (!inCard(u, v)) {
        // the axle's pins either side of the hinge, a 1 px black outline round the card
        const pin = Math.abs(u) > hw && Math.abs(u) <= hw + 1.6 && Math.abs(v) <= 1.1;
        if (pin) d[o] = v < -0.3 ? C.fog : C.steel;
        else if (inCard(u + px1, v) || inCard(u - px1, v) || inCard(u, v + px1) || inCard(u, v - px1)) d[o] = C.black;
        continue;
      }
      if (hinge) {
        d[o] = C.black;
        continue;
      }
      let col;
      if (!flip || p >= 1) col = faceColour(to, u, v, edgeRow);
      else if (v < 0) {
        // the upper half: the new face, and over it the old upper flap falling toward the hinge (p < 0.5)
        if (c > 0 && v >= top * c) {
          col = faceColour(face, u, v / c, v / c < top + px1 / c);
          col = c < 0.3 ? DARK2.get(col >>> 0) ?? col : c < 0.6 ? DARK1.get(col >>> 0) ?? col : col;
          if (v < top * c + px1) col = C.black; // the flap's falling edge
        } else col = faceColour(to, u, v, edgeRow);
      } else if (c < 0 && v <= bot * -c) {
        // the lower half: the flap's back (the new lower face) opening down over the old one (p > 0.5)
        col = faceColour(to, u, v / -c, false);
        col = -c < 0.3 ? DARK2.get(col >>> 0) ?? col : -c < 0.6 ? DARK1.get(col >>> 0) ?? col : col;
        if (v > bot * -c - px1) col = C.black;
      } else col = faceColour(face, u, v, false);
      if (edgeRow && glint != null && Math.abs(x + 0.5 - glint) < 2.5 && col === C.steel) col = Math.abs(x + 0.5 - glint) < 1.2 ? C.white : C.silver;
      d[o] = col;
    }
  }
  // the day's name under its glyph, once the card has turned (micro type, whole pixels, one rounding)
  const lab = (!flip || p >= 1 ? to : null)?.label;
  if (lab) {
    const g = textPixels(lab, 'micro');
    const s = Math.max(1, Math.round(0.62 * k));
    const lx = Math.round(cx - (g.width * s) / 2), ly = Math.round(cy + LABEL_V * k);
    const col = to.tone === 'day' ? C.fog : C.pink;
    for (const [gx, gy] of g.pixels) {
      for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
        const X = lx + gx * s + i - ox, Y = ly + gy * s + j - oy;
        if (X >= 0 && X < tw && Y >= 0 && Y < th) d[Y * tw + X] = col;
      }
    }
  }
}

/** Screen offset (px) of stack layer `n` under the top card at size k (whole pixels: the stack never shimmers). */
export const layerDrop = (n, k) => Math.round(n * LAYER * k);

export const BLANK = Object.freeze({ glyph: null, tone: 'day', label: null });
export const SEVEN = Object.freeze({ glyph: '7', tone: 'seven', label: null });

// the emblem's own build (the plain 4 s open and the lock-up): the stack settles in, then the top card turns
// from blank to the 7
const STACK_AT = 0.1;
const FLIP_AT = 0.55;
const FLIP = 0.32;

/** The emblem's card centre at (x, y), size k (the card is LIFT units above the emblem's centre). */
export const cardCentre = (x, y, k) => ({ x, y: y - LIFT * k });

/**
 * The emblem at (x, y), size k, at the open's instant dt, painted into T: the other days' cards settling under the top
 * one (each a layer further down, blank), then the top card turning from blank to the 7. False before it appears.
 */
export function paintEmblem(T, x, y, k, dt) {
  const c = cardCentre(x, y, k);
  const st = easeOutQuint(seg(dt, STACK_AT, 0.4));
  if (st <= 0) return false;
  for (let n = LAYERS; n >= 1; n--) paintCard(T, c.x, c.y + Math.round(layerDrop(n, k) * st), k, BLANK);
  const fp = easeInOut(seg(dt, FLIP_AT, FLIP));
  paintCard(T, c.x, c.y, k, BLANK, fp > 0 ? { p: fp, to: SEVEN } : null);
  return true;
}

function emblem(ctx, dt, x, y, k = 1) {
  if (dt < STACK_AT) return;
  const c = cardCentre(x, y, k);
  // a sprite buffer round the emblem (cheap, and no partial alpha anywhere: a pixel is a palette colour or clear),
  // painted again only when the emblem changes (once it has settled, only its place and size change it)
  const w = Math.ceil((EXTENT + 2) * 2 * k) + 4, h = Math.ceil((CARD.bot - CARD.top + LAYERS * LAYER + 6) * k) + 4;
  const fb = frameBuffer('week-emblem', w, h);
  const ox = Math.floor(c.x - w / 2), oy = Math.floor(c.y + CARD.top * k) - 3;
  const settled = dt >= Math.max(STACK_AT + 0.4, FLIP_AT + FLIP);
  const key = `${x}|${y}|${k}|${settled ? 'still' : dt}`;
  if (fb.key !== key) {
    fb.d.fill(0);
    paintEmblem({ d: fb.d, w, h, ox, oy }, x, y, k, dt);
    fb.cx.putImageData(fb.img, 0, 0);
    fb.key = key;
  }
  ctx.drawImage(fb.cv, ox, oy);
}

const background = lazyBackdrop({ key: 'week', colors: [P.black, P.maroon], cx: CENTRE.x, cy: CENTRE.y, reach: 230 });

export const WEEK_OPEN = {
  accent: P.pink,
  style: { accent: P.pink, plate: P.black, ink: 'light', bar: P.pink },
  background,
  emblem,
  extent: EXTENT,
  absorb: 0.12,
  shoulder: 17, // the bit sits on the card's top-right corner
  popAt: 1.45,
  warmJobs: () => [() => glyphCells('7'), ...'MTWFS'.split('').map((g) => () => glyphCells(g))],
};

export function drawSevenDays(ctx, dt, info) {
  playOpen(ctx, dt, info, WEEK_OPEN);
}

export const __test = { inSeven };
