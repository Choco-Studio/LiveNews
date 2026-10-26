// The programme's own set, stood on end (docs/publishing/vertical.md §1, §2): the vertical picture's backdrop. A
// vertical frame is not a board floating on a dark field; it is the programme's studio, seen by a camera made for a
// tall picture. The studio's own renderer (v2 studio/set.js: its wall, its dressing, its light, its desk) draws it, so
// WORLD NOW stands before its city at night under its four clocks, TECH BYTES before its circuit board, COSMOS before
// its window on the Earth, MONEY MINUTE in its panelled room under the ticker, and so on: the same pixels as on air.
//
// The set's camera never rotates and its screen row is a pure offset (geometry.js: sy = hy + (Y - cam.y) k), so two
// renders of one camera, the second 216 rows lower (hy - 216), meet without a seam: a 384-row picture of the set.
//
//   backdrop(id)                the programme's tall set (216 x 384), its glass, its lights: cached per programme
//   single(stage)               the presenter's single made tall: the set above and below the Stage's own frame, from
//                               the Stage's own camera (cached per camera): the presenter sits in the set, not in a box
//   glassOf(canvas)             the same picture behind tinted glass (every colour to the dark end of its own hue)
//   twinkle(ctx, t, lights)     the set's lights breathing (windows, stars, LEDs, bulbs): the live layer
//
// The studio's renderer is handed in (clip/index.js `kit`); without it (node tests, a page without the v2 studio) the
// backdrop is the programme's own colours on a graded field (fallbackBackdrop), never an empty frame.
import { P } from '../palette.js';
import { mk, toCanvas } from '../gfx/canvas.js';
import { u32 } from '../gfx/color.js';
import { bayer } from '../gfx/dither.js';
import { clamp } from '../gfx/index.js';
import { VW, VH } from './layout.js';

const W = 384;
const H = 216;
/** Rows of the set below a single rendered under the Stage's frame (`single`: shown from this row). */
export const OVERLAP = 8;

// The set's screen (geometry.js SET.screen, X -73..73, Y -110..-22, on the wall at Z 1400) is framed so that it is the
// board's glass exactly: 190 px wide (x 13-203, centred on the frame's middle, 108), its top at the glass's top
// (row 75) in the upper half and its foot at the glass's foot (row 245) in the lower half. Zoom z puts the wall at
// k = z / 1.4 px a unit: 146 k = 190 gives z = 1.822; row 75 = hy + (-110 + 60) k gives hy = 140; row 245 =
// hy + drop + (-22 + 60) k gives drop = 56; the screen's middle on column 108 of the crop takes columns 84-299 of the
// 384-wide render (x0); until 24 Oct the glass sat at x 3-193, centred on x 98, and read as off-centre. PAY
// ATTENTION's board is the screen in its 9-unit purple frame (studio/quiz.js QUIZ.frame), 164
// units wide: z = 1.622 makes the frame the marquee's 190 px on the tall stage's glass (rows 35-245), hy 103, drop 87.
function studio(id) {
  return { style: id, cam: { zoom: 1.822, hy: 140, x: 0, y: -60, z: 0 }, seam: 160, drop: 56, x0: 84, wall: 'rest', frame: 'bezel' };
}
// COSMOS's boards float on its planetarium as its own displays (frame 'hud', drawBoardFrame): the sky behind them is
// the set's own, out of focus as behind a single (a board is read, the sky only felt), and without the screen and its
// bezel, which would frame the display a second time
function planetarium() {
  const s = studio('cosmos');
  return { ...s, cam: { ...s.cam, soft: 1 }, screen: false, frame: 'hud' };
}
function quizSet() {
  return { style: 'pay-attention', cam: { zoom: 1.622, hy: 103, x: 0, y: -60, z: 0 }, seam: 140, drop: 87, x0: 84, wall: 'rest', frame: 'marquee' };
}

/**
 * Each programme's tall camera on its set (the set's own camera grammar: no rotation; zoom, a pedestal through hy, a
 * truck through x) and its board's frame. `x0` is the first of the 216 columns taken from the 384-wide render.
 *   style      the studio set's style id (styles.js); WORLD WEATHER airs from its own weather centre: no studio set
 *   frame      the board's frame: 'bezel' (the set's screen bezel and the programme's accent), 'marquee' (the quiz's
 *              lamp-lit frame) or 'hud' (COSMOS's planetarium display: held at its corners, a scale along its top)
 *   screen     false: the set's screen left out (a sky wall runs on behind the board)
 */
export const VSETS = Object.freeze({
  'world-now': studio('world-now'),
  'tech-bytes': studio('tech-bytes'),
  cosmos: planetarium(),
  'money-minute': studio('money-minute'),
  'news-60': studio('news-60'),
  'seven-days': studio('seven-days'),
  'full-time': studio('full-time'),
  'pay-attention': quizSet(),
  'world-weather': { style: null, frame: 'bezel' },
});
export const VSET_IDS = Object.keys(VSETS);

// ---------------------------------------------------------------- palette

const NAME_OF = new Map(Object.entries(P).map(([n, hex]) => [u32(hex) >>> 0, n]));
const U = Object.fromEntries(Object.entries(P).map(([n, hex]) => [n, u32(hex) >>> 0]));
/**
 * Tinted glass: every colour to the dark end of its own hue (white and the greys to ink, the warm colours to maroon,
 * the blues to navy, the greens to their darkest), so the set reads through a board as shapes and its own colour, the
 * set's lettering never reads through (a clock's name, a ticker's word: ink on ink), and the board's type stands on a
 * ground no lighter than navy (L* about 32).
 */
export const GLASS = Object.freeze({
  white: 'ink', silver: 'ink', fog: 'ink', steel: 'ink', slate: 'ink', ink: 'black', black: 'black',
  cream: 'maroon', tan: 'maroon', tanShade: 'maroon', brown: 'maroon', maroon: 'black', skin: 'maroon', skinShade: 'maroon',
  yellow: 'maroon', orange: 'maroon', rust: 'maroon', red: 'maroon', darkRed: 'maroon', pink: 'maroon',
  magenta: 'purple', purple: 'ink', green: 'darkGreen', midGreen: 'darkGreen', darkGreen: 'deepGreen', deepGreen: 'black',
  cyan: 'navy', blue: 'navy', navy: 'ink',
});
/** One step down, for a light that breathes out (studio/color.js DARKER's ramp, with its two greens). */
const DIM = Object.freeze({
  white: 'silver', silver: 'fog', fog: 'steel', steel: 'slate', yellow: 'orange', orange: 'rust', cyan: 'blue', blue: 'navy',
  pink: 'darkRed', red: 'darkRed', magenta: 'purple', green: 'darkGreen', midGreen: 'darkGreen', cream: 'tan',
});
// the colours of a practical light (a lit window, a star, an LED, a bulb): they twinkle
const LIGHTS = new Set(['white', 'silver', 'yellow', 'orange', 'cyan', 'pink', 'green', 'magenta']);

function mapPixels(px, table) {
  const out = new Uint32Array(px.length);
  for (let i = 0; i < px.length; i++) {
    const n = NAME_OF.get(px[i] >>> 0);
    out[i] = n ? U[table[n] || n] : U.black;
  }
  return out;
}

const hash = (a, b) => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
};

/** The lights of a picture: lone bright pixels (a window, a star, an LED), up to `max`, spread by a hash. */
export function findLights(px, w, h, { max = 140, y0 = 0, y1 = h } = {}) {
  const found = [];
  for (let y = Math.max(1, y0); y < Math.min(h - 1, y1); y++) {
    for (let x = 1; x < w - 1; x++) {
      const c = px[y * w + x] >>> 0;
      const n = NAME_OF.get(c);
      if (!n || !LIGHTS.has(n) || !DIM[n]) continue;
      // lone: at least two of its four neighbours are another colour (a run of a lit line is not a light)
      let other = 0;
      if (px[y * w + x - 1] >>> 0 !== c) other++;
      if (px[y * w + x + 1] >>> 0 !== c) other++;
      if (px[(y - 1) * w + x] >>> 0 !== c) other++;
      if (px[(y + 1) * w + x] >>> 0 !== c) other++;
      if (other >= 3) found.push({ x, y, on: P[n], off: P[DIM[n]], k: hash(x, y) });
    }
  }
  found.sort((a, b) => a.k - b.k);
  return found.slice(0, max).map((l) => ({ ...l, period: 2.2 + l.k * 4.5, phase: hash(l.y, l.x) * 10 }));
}

/**
 * The set's lights breathing: each light dims for a moment on its own slow beat (about one in seven at a time), so the
 * frame is alive without anything moving across it. Drawn under the stage's content (the content covers its own).
 */
export function twinkle(ctx, t, lights, dx = 0, dy = 0) {
  if (!lights?.length) return;
  for (let i = 0; i < lights.length; i++) {
    const l = lights[i];
    const u = ((t + l.phase) / l.period) % 1;
    if (u < 0.86) continue;
    ctx.fillStyle = l.off;
    ctx.fillRect(l.x + dx, l.y + dy, 1, 1);
  }
}

// ---------------------------------------------------------------- the fallback (no studio renderer)

const ACCENT = { 'world-now': P.red, 'tech-bytes': P.cyan, cosmos: P.magenta, 'money-minute': P.green, 'news-60': P.yellow, 'seven-days': P.pink, 'full-time': P.orange, 'pay-attention': P.purple, 'world-weather': P.blue };
const FIELD = { 'world-now': ['black', 'navy'], 'tech-bytes': ['black', 'navy'], cosmos: ['black', 'purple'], 'money-minute': ['black', 'maroon'], 'news-60': ['black', 'slate'], 'seven-days': ['black', 'maroon'], 'full-time': ['black', 'deepGreen'], 'pay-attention': ['black', 'purple'], 'world-weather': ['black', 'navy'] };

/**
 * The programme's colours on a graded field, lit from the stage's middle, its accent along the desk line at row 300:
 * the backdrop when the studio's renderer is not there (node tests) or for a programme without a studio (WORLD
 * WEATHER's is drawn by its own centre: clip/vweather.js).
 */
export function fallbackBackdrop(id) {
  const [a, b] = FIELD[id] || FIELD['world-now'];
  const px = new Uint32Array(VW * VH);
  const A = U[a];
  const B = U[b];
  for (let y = 0; y < VH; y++) {
    for (let x = 0; x < VW; x++) {
      const dx = (x - 98) / 150;
      const dy = (y - 150) / 190;
      const v = clamp(1 - Math.sqrt(dx * dx + dy * dy), 0, 1) * 0.9;
      px[y * VW + x] = v > bayer(x, y) ? B : A;
    }
  }
  const acc = u32(ACCENT[id] || P.red) >>> 0;
  for (let x = 0; x < VW; x++) px[300 * VW + x] = acc;
  return px;
}

// ---------------------------------------------------------------- WORLD WEATHER's centre, stood on end

/**
 * WORLD WEATHER airs from its own weather centre (scenes/weather/studio.js: a dark set, a large curved video wall, an
 * LED line along its foot, a glossy floor that mirrors the wall, a lighting rig overhead), not the network's studio, so
 * its tall view is drawn here in the centre's own terms: the rig across the top, the wall's glass from the mast to the
 * captions (navy deepening to blue, the satellite's cloud drifting over it, an isobar or two), its foot lit by the cyan
 * LED line at row 288, and the floor below holding the wall's reflection a step darker, fading into the dark.
 */
export function weatherBackdrop() {
  const px = new Uint32Array(VW * VH);
  const put = (x, y, n) => {
    if (x >= 0 && x < VW && y >= 0 && y < VH) px[y * VW + x] = U[n];
  };
  const WALL_TOP = 40;
  const LED = 288;
  // the glass: its top and foot bow outwards (a concave wall, nearer the lens at its ends)
  const bow = (x) => Math.round(((x - 98) / 108) ** 2 * 5);
  const rnd = (x, y) => hash(x * 7 + 3, y * 13 + 5);
  // soft value noise for the cloud: four octaves of hashed lattice, smoothed
  const lattice = (gx, gy) => hash(gx * 92821 + 17, gy * 68917 + 29);
  const noise = (x, y, s) => {
    const fx = x / s;
    const fy = y / s;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const a = lattice(ix, iy) + (lattice(ix + 1, iy) - lattice(ix, iy)) * sx;
    const b = lattice(ix, iy + 1) + (lattice(ix + 1, iy + 1) - lattice(ix, iy + 1)) * sx;
    return a + (b - a) * sy;
  };
  const cloud = (x, y) => noise(x, y, 34) * 0.55 + noise(x + 50, y + 11, 15) * 0.3 + noise(x + 9, y + 70, 7) * 0.15;
  for (let y = 0; y < VH; y++) {
    for (let x = 0; x < VW; x++) {
      const top = WALL_TOP - bow(x);
      const foot = LED - 2 + bow(x);
      let n = 'black';
      if (y >= top && y < foot) {
        // the glass: navy under the rig, blue toward the foot (Bayer between), the cloud over it
        const u = (y - top) / (foot - top);
        n = u * 1.1 - 0.15 > bayer(x, y) ? 'navy' : 'ink';
        if (u > 0.55 && (u - 0.55) * 2.2 > bayer(x + 1, y)) n = 'navy';
        const c = cloud(x, y * 1.15);
        if (c > 0.66) n = c > 0.74 ? (c > 0.8 && rnd(x, y) > 0.35 ? 'silver' : 'fog') : 'steel';
        else if (c > 0.6 && bayer(x, y) < (c - 0.6) * 12) n = 'slate';
        // the wall's bezel at its edges
        if (y === top) n = 'steel';
      } else if (y >= foot && y < LED) n = 'slate';
      else if (y >= LED && y < LED + 1) n = 'cyan';
      else if (y === LED + 1) n = 'blue';
      else if (y > LED + 1) {
        // the floor: the wall mirrored a step darker, fading into the dark by its foot
        const my = 2 * LED - y;
        const m = px[Math.max(0, my) * VW + x] >>> 0;
        const mn = NAME_OF.get(m) || 'black';
        const fade = (y - LED) / (VH - LED);
        n = fade < 0.75 && fade * 1.3 < bayer(x, y) ? DIM[mn] || GLASS[mn] || 'black' : 'black';
        if (n === 'cyan' || n === 'blue') n = 'navy';
      }
      px[y * VW + x] = U[n];
    }
  }
  // the isobars: two long arcs across the glass in slate
  for (const [cx, cy, r] of [[150, 300, 150], [20, 40, 120]]) {
    for (let a = 0; a < 720; a++) {
      const th = (a / 720) * Math.PI * 2;
      const x = Math.round(cx + r * Math.cos(th));
      const y = Math.round(cy + r * 0.8 * Math.sin(th));
      if (y > WALL_TOP - bow(x) + 2 && y < LED - 3 && (px[y * VW + x] >>> 0) !== U.fog && (px[y * VW + x] >>> 0) !== U.silver) put(x, y, 'slate');
    }
  }
  // the lighting rig: a truss across the ceiling, its lamps hanging under it
  for (let x = 0; x < VW; x++) {
    put(x, 12, 'slate');
    put(x, 19, 'slate');
    const k = x % 7;
    put(x, 12 + k, 'ink');
  }
  for (let x = 6; x < VW; x += 34) {
    for (let j = 0; j < 4; j++) for (let i = 0; i < 5; i++) put(x + i, 21 + j, j === 3 ? 'fog' : 'steel');
    put(x + 2, 25, 'silver');
    put(x + 1, 26, 'cyan');
    put(x + 3, 26, 'cyan');
  }
  return px;
}

// ---------------------------------------------------------------- the set's renderer

/**
 * The tall set from the studio's own renderer: `kit` = { drawBackground, drawDesk, frame, styleFor, invalidateSet }
 * (studio/set.js, scene.js's shared frame, styles.js). Returns null without one.
 */
export class VerticalSet {
  constructor(kit = null) {
    this.kit = kit && typeof kit.drawBackground === 'function' && kit.frame?.px ? kit : null;
    this.sets = new Map();
    this.singles = new Map();
    this.clipRows = new Int16Array(W);
    this.errors = 0;
  }

  /**
   * Render `cam` into the shared frame and copy its columns x0..x0+out.w into `out` at row `dy`, only the rows of `out`
   * from y0 to y1.
   */
  renderInto(out, cam, style, wall, x0, dy, y0 = 0, y1 = out.h, t = 3) {
    const k = this.kit;
    k.drawBackground(k.frame, cam, t, { style, wall, shotSince: -7, lod: 0, cut: false });
    k.drawDesk(k.frame, cam, this.clipRows);
    const src = k.frame.px;
    for (let y = 0; y < H; y++) {
      const ty = dy + y;
      if (ty < y0 || ty >= y1 || ty >= out.h) continue;
      out.px.set(src.subarray(y * W + x0, y * W + x0 + out.w), ty * out.w);
    }
  }

  /** The screen's interior between its bezels (top: rTop, foot: rLow) in the wall's field colours, top to foot. */
  screenField(out, rTop, rLow, x0, style) {
    const b = Math.max(1, Math.round(2 * rTop.k)) + 1;
    const xa = Math.max(0, rTop.x0 - x0 + b);
    const xb = Math.min(out.w, rTop.x1 - x0 - b);
    const ya = Math.max(0, rTop.y0 + b);
    const yb = Math.min(out.h, rLow.y1 - b);
    // (the field's top colour only under the bezel, fading into its foot colour over 20 rows: behind the board's type
    // the screen is one flat colour, never a dither's checker)
    const [fa, fb] = (style.wallField || ['navy', 'ink']).map((n) => U[n] ?? U.ink);
    for (let y = ya; y < yb; y++) {
      const l = clamp((y - ya) / 20, 0, 1);
      for (let x = xa; x < xb; x++) out.px[y * out.w + x] = l > bayer(x, y) ? fb : fa;
    }
  }

  /** The programme's tall set: { img, glass, lights } (216 x 384), baked once. */
  backdrop(id) {
    const key = VSETS[id] ? id : 'world-now';
    let s = this.sets.get(key);
    if (s) return s;
    const spec = VSETS[key];
    let px = null;
    if (this.kit && spec.style) {
      try {
        const style = this.kit.styleFor(spec.style);
        const out = { px: new Uint32Array(VW * VH), w: VW, h: VH };
        const wall = { mode: spec.wall || 'rest', solo: false, screen: spec.screen !== false };
        const cam = { soft: 0, ...spec.cam };
        // above the seam the set's top (its header behind the hook's plate); below it the same camera `drop` rows
        // lower (the wall's foot behind the captions, the desk in the foot): the screen between them is taller by
        // `drop`, a tall screen for a tall board. The two halves share every column (the camera only pedestals), so
        // the set's uprights run straight through the seam, which the board's glass covers.
        const seam = spec.seam ?? VH;
        const drop = spec.drop ?? 0;
        this.renderInto(out, cam, style, wall, spec.x0 ?? 84, 0, 0, seam);
        for (let i = 0; i * H < VH; i++) this.renderInto(out, { ...cam, hy: cam.hy + drop - H * i }, style, wall, spec.x0 ?? 84, H * i, seam, VH);
        // the tall screen's glass: the wall's own field from its top bezel to its foot (the emblem the two halves
        // would each draw is left out: the board stands there); without a screen the sky runs on behind the board
        if (spec.frame !== 'marquee' && spec.screen !== false && this.kit.wallRect) this.screenField(out, this.kit.wallRect(cam), this.kit.wallRect({ ...cam, hy: cam.hy + drop }), spec.x0 ?? 84, style);
        this.kit.invalidateSet?.();
        px = out.px;
      } catch (err) {
        this.errors++;
        px = null;
      }
    }
    if (!px && key === 'world-weather') px = weatherBackdrop();
    if (!px) px = fallbackBackdrop(key);
    s = { img: toCanvas(px, VW, VH), glass: toCanvas(mapPixels(px, GLASS), VW, VH), lights: findLights(px, VW, VH), px };
    this.sets.set(key, s);
    return s;
  }

  /**
   * The Stage's single made tall: the set above (hy + 216) and below (hy - 216) its own frame, from its own camera, so
   * the presenter sits in the studio, not in a window. Returns { above, below } (384 x 216 each, cut with the same
   * columns as the single), or null without the renderer. Cached per camera and wall (a cut makes a new one).
   */
  single(stage) {
    if (!this.kit || !stage?.base) return null;
    const cam = stage.base;
    const style = stage.style || stage.programId;
    const wall = stage.bgOpts?.wall || { mode: 'rest' };
    const key = `${cam.x}|${cam.y}|${cam.z}|${cam.zoom}|${cam.hy}|${cam.soft}|${typeof style === 'string' ? style : style?.id}|${wall.mode}|${wall.screen !== false}`;
    let s = this.singles.get(key);
    if (s) return s;
    try {
      const st = typeof style === 'string' ? this.kit.styleFor(style) : style;
      const parts = [];
      let clipBelow = null;
      // (the set below is rendered OVERLAP rows higher and shown from that row: a body drawn into it starts above the
      // seam, under the Stage's frame, so the rasteriser's edge at its first row is never seen)
      for (const dh of [H, -(H - OVERLAP)]) {
        const out = { px: new Uint32Array(W * H), w: W, h: H };
        this.renderInto(out, { ...cam, hy: cam.hy + dh }, st, wall, 0, 0, 0, H);
        parts.push(out.px);
        if (dh < 0) clipBelow = Int16Array.from(this.clipRows);
      }
      this.kit.invalidateSet?.();
      s = { above: toCanvas(parts[0], W, H), below: toCanvas(parts[1], W, H), belowPx: parts[1], clipBelow, live: null, lightsAbove: findLights(parts[0], W, H, { max: 50 }), lightsBelow: findLights(parts[1], W, H, { max: 40 }) };
    } catch {
      this.errors++;
      s = null;
    }
    if (this.singles.size > 24) this.singles.clear();
    this.singles.set(key, s);
    return s;
  }
}

// ---------------------------------------------------------------- glass, scrims and the board's frame

const GLASS_U = new Map(Object.keys(P).map((n) => [U[n], U[GLASS[n] || n]]));

/**
 * The top and the foot of the frame under tinted glass, read back from the picture as it stands (the set, the tall
 * single, a picture) and fading into it a Bayer step a row: the feeds lay their own buttons and words over the top and
 * the bottom fifth, and the bug and the programme's tag sit at the top, so both read on a calm ground while the set
 * still shows there. `ctx` without getImageData (node tests) is left as it is.
 */
export const SCRIM = Object.freeze({ top: 26, topFull: 4, foot: 300, footFull: 310 });
export function glassScrims(ctx) {
  if (typeof ctx?.getImageData !== 'function' || typeof ctx.putImageData !== 'function') return;
  scrimRows(ctx, 0, SCRIM.top, (y) => (y < SCRIM.topFull ? 1 : 1 - (y - SCRIM.topFull + 1) / (SCRIM.top - SCRIM.topFull + 1)));
  scrimRows(ctx, SCRIM.foot, VH - SCRIM.foot, (y) => (y >= SCRIM.footFull ? 1 : (y - SCRIM.foot + 1) / (SCRIM.footFull - SCRIM.foot + 1)));
}
function scrimRows(ctx, y0, h, level) {
  const img = ctx.getImageData(0, y0, VW, h);
  if (!img?.data?.buffer) return;
  const px = new Uint32Array(img.data.buffer);
  for (let j = 0; j < h; j++) {
    const y = y0 + j;
    const l = level(y);
    if (l <= 0) continue;
    for (let x = 0; x < VW; x++) {
      if (l < 1 && l <= bayer(x, y)) continue;
      const i = j * VW + x;
      const g = GLASS_U.get(px[i] >>> 0);
      if (g !== undefined) px[i] = g;
    }
  }
  ctx.putImageData(img, 0, y0);
}

/** The glass over a stage box: 190 wide, centred on the frame (x 13-203), 3 px in at top and foot. */
export const glassRect = (box) => ({ x: (VW - 190) >> 1, y: box.y + 3, w: 190, h: box.h - 6 });

// the set's screen bezels (styles.js bezel: base and top), so a board's frame is the set's own
const BEZEL = {
  'world-now': [P.steel, P.silver], 'tech-bytes': [P.slate, P.steel], cosmos: [P.slate, P.steel], 'money-minute': [P.brown, P.tan],
  'news-60': [P.slate, P.steel], 'seven-days': [P.steel, P.silver], 'full-time': [P.slate, P.steel], 'world-weather': [P.steel, P.silver],
};
/** The marquee's 6 px border (PAY ATTENTION): its lamps every 6 px, a chase stepping every 0.12 s. */
export const MARQUEE = 6;

/**
 * A board's frame round the glass `r`: the set's screen bezel with the programme's accent along the top, a shadow under
 * it; PAY ATTENTION's is its marquee, a purple band with a fog rim and a chase of gold lamps (the set's own).
 */
export function drawBoardFrame(ctx, t, r, programId, accent = P.red, opts = {}) {
  ctx.fillStyle = P.black;
  ctx.fillRect(r.x + 1, r.y + r.h, r.w, 1);
  ctx.fillRect(r.x + r.w, r.y + 1, 1, r.h);
  if ((VSETS[programId]?.frame || 'bezel') === 'marquee') {
    const m = MARQUEE;
    ctx.fillStyle = P.fog;
    ctx.fillRect(r.x, r.y, r.w, m);
    ctx.fillRect(r.x, r.y + r.h - m, r.w, m);
    ctx.fillRect(r.x, r.y, m, r.h);
    ctx.fillRect(r.x + r.w - m, r.y, m, r.h);
    ctx.fillStyle = P.purple;
    ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, m - 2);
    ctx.fillRect(r.x + 1, r.y + r.h - m + 1, r.w - 2, m - 2);
    ctx.fillRect(r.x + 1, r.y + 1, m - 2, r.h - 2);
    ctx.fillRect(r.x + r.w - m + 1, r.y + 1, m - 2, r.h - 2);
    // the inner rim's corners square again over the bands
    ctx.fillStyle = P.fog;
    ctx.fillRect(r.x + m - 1, r.y + m - 1, r.w - 2 * m + 2, 1);
    ctx.fillRect(r.x + m - 1, r.y + r.h - m, r.w - 2 * m + 2, 1);
    ctx.fillRect(r.x + m - 1, r.y + m - 1, 1, r.h - 2 * m + 2);
    ctx.fillRect(r.x + r.w - m, r.y + m - 1, 1, r.h - 2 * m + 2);
    // the lamps round the band, clockwise, one in three resting at a time, the rest lit, the chase walking
    const step = Math.floor(Math.max(0, t) / 0.12);
    const lamps = [];
    for (let x = r.x + 4; x <= r.x + r.w - 6; x += 6) lamps.push([x, r.y + 2]);
    for (let y = r.y + 8; y <= r.y + r.h - 8; y += 6) lamps.push([r.x + r.w - 4, y]);
    for (let x = r.x + r.w - 6 - ((r.w - 10) % 6); x >= r.x + 4; x -= 6) lamps.push([x, r.y + r.h - 4]);
    for (let y = r.y + r.h - 8 - ((r.h - 16) % 6); y >= r.y + 8; y -= 6) lamps.push([r.x + 2, y]);
    lamps.forEach(([x, y], i) => {
      ctx.fillStyle = (i + step) % 3 === 0 ? P.rust : P.yellow;
      ctx.fillRect(x, y, 2, 2);
    });
    return m;
  }
  if (VSETS[programId]?.frame === 'hud') return hudFrame(ctx, t, r, accent === P.purple ? P.fog : accent, opts.orbit !== false);
  const [base, top] = BEZEL[programId] || BEZEL['world-now'];
  ctx.fillStyle = base;
  ctx.fillRect(r.x, r.y, 1, r.h);
  ctx.fillRect(r.x + r.w - 1, r.y, 1, r.h);
  ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
  ctx.fillStyle = top;
  ctx.fillRect(r.x, r.y + 2, r.w, 1);
  const acc = accent === P.purple ? P.fog : accent;
  ctx.fillStyle = acc;
  ctx.fillRect(r.x, r.y, r.w, 2);
  glint(ctx, t, r.x, r.y, r.w, acc);
  return 3;
}

// COSMOS's display: its stars (fixed points in the glass, u/v in 0..1, a few of them twinkling) and its orbit
const HUD_STARS = (() => {
  const out = [];
  let a = 4117;
  const r = () => ((a = (Math.imul(a ^ (a >>> 15), 2246822519) + 0x9e3779b9) >>> 0) / 4294967296);
  for (let i = 0; i < 34; i++) out.push([r(), r(), r() < 0.2 ? 2 : r() < 0.45 ? 1 : 0, i % 7 === 0]);
  return out;
})();
const HUD_TICK = 6;
/**
 * COSMOS's planetarium display round the glass `r`: no bezel, the glass held at its four corners by brackets in the
 * accent, dotted hairlines between them, a telescope's scale along the top (a tick every 6 px, every fourth longer),
 * and in the glass a few faint stars and one slow orbit low on the right, ink on the black, under the board's type.
 * Its movement: a light walking the scale (glint), a moon on its orbit, a star or two twinkling. (orbit false: no orbit,
 * the display shows the Earth itself.)
 */
function hudFrame(ctx, t, r, acc, orbit = true) {
  const { x, y, w, h } = r;
  const T = Math.max(0, t);
  // the glass's sky: ink and slate points, one in seven twinkling a step brighter for a beat
  for (const [u, v, mag, tw] of HUD_STARS) {
    const sx = x + 4 + Math.floor(u * (w - 8)), sy = y + 8 + Math.floor(v * (h - 14));
    const on = tw && ((T + u * 7) % 4.2) < 0.5;
    ctx.fillStyle = on ? P.steel : mag === 2 ? P.slate : P.ink;
    ctx.fillRect(sx, sy, 1, 1);
  }
  // an orbit low on the right (a dotted ellipse, ink), its moon going round it in 14 s
  const ox = x + Math.round(w * 0.74), oy = y + h - 22, rx = 38, ry = 9;
  if (orbit) hudOrbit(ctx, T, x, y, w, h, ox, oy, rx, ry);
  hudEdges(ctx, t, r, acc);
  return 4;
}
function hudOrbit(ctx, T, x, y, w, h, ox, oy, rx, ry) {
  ctx.fillStyle = P.ink;
  for (let i = 0; i < 96; i += 2) {
    const a = (i / 96) * Math.PI * 2;
    const px = Math.round(ox + Math.cos(a) * rx), py = Math.round(oy + Math.sin(a) * ry);
    if (px > x + 1 && px < x + w - 2 && py < y + h - 2) ctx.fillRect(px, py, 1, 1);
  }
  ctx.fillStyle = P.slate;
  ctx.fillRect(ox - 2, oy - 2, 4, 4);
  ctx.fillRect(ox - 3, oy - 1, 6, 2);
  ctx.fillRect(ox - 1, oy - 3, 2, 6);
  const ma = (T / 14) * Math.PI * 2;
  const mx = Math.round(ox + Math.cos(ma) * rx), my = Math.round(oy + Math.sin(ma) * ry);
  // (behind the planet on the far half of its orbit)
  if (!(Math.sin(ma) < 0 && Math.abs(mx - ox) < 4)) {
    ctx.fillStyle = P.steel;
    ctx.fillRect(mx, my, 2, 2);
  }
}
/**
 * The display's corner brackets alone (2 px L's in the accent), as a viewfinder holds a picture: COSMOS's photo and
 * map windows (vertical.js windowRules), whose picture is the display's whole face.
 */
export function hudBrackets(ctx, r, acc, L = 11) {
  const { x, y, w, h } = r;
  ctx.fillStyle = acc;
  for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
    ctx.fillRect(dx > 0 ? cx : cx - L, dy > 0 ? cy : cy - 2, L, 2);
    ctx.fillRect(dx > 0 ? cx : cx - 2, dy > 0 ? cy : cy - L, 2, L);
  }
}
function hudEdges(ctx, t, r, acc) {
  const { x, y, w, h } = r;
  // the hairlines between the corners, dotted (slate)
  const L = 11;
  ctx.fillStyle = P.slate;
  for (let i = x + L + 2; i < x + w - L - 2; i += 2) ctx.fillRect(i, y + h - 1, 1, 1);
  for (let j = y + L + 2; j < y + h - L - 2; j += 2) {
    ctx.fillRect(x, j, 1, 1);
    ctx.fillRect(x + w - 1, j, 1, 1);
  }
  // the scale along the top: a hairline, a tick every 6 px under it, every fourth twice as long and fog
  ctx.fillRect(x + L + 2, y, w - 2 * L - 4, 1);
  for (let i = 0, sx = x + L + 2 + HUD_TICK; sx < x + w - L - 3; i++, sx += HUD_TICK) {
    const major = (i + 1) % 4 === 0;
    ctx.fillStyle = major ? P.fog : P.slate;
    ctx.fillRect(sx, y + 1, 1, major ? 3 : 1);
  }
  // the brackets: 2 px L's in the accent at the four corners
  hudBrackets(ctx, r, acc, L);
  // a light walking the scale every 5.5 s
  glint(ctx, t, x + L + 2, y - 1, w - 2 * L - 4, acc);
}

// a light catching the accent rule: one step up its own ramp
const GLINT = { [P.red]: P.pink, [P.cyan]: P.white, [P.magenta]: P.pink, [P.green]: P.cream, [P.yellow]: P.cream, [P.pink]: P.cream, [P.orange]: P.yellow, [P.blue]: P.cyan, [P.fog]: P.silver };
/**
 * A glint running along an accent rule (2 rows at y, from x over w), once every 5.5 s and 1.2 s long: the frame's
 * one movement while a board holds still, as on a broadcast set's light strip.
 */
export function glint(ctx, t, x, y, w, accent) {
  const u = ((Math.max(0, t) % 5.5) - 0.6) / 1.2;
  if (u < 0 || u >= 1) return;
  const len = 10;
  const gx = Math.round(x - len + u * (w + len));
  const x0 = Math.max(x, gx);
  const x1 = Math.min(x + w, gx + len);
  if (x1 <= x0) return;
  ctx.fillStyle = GLINT[accent] || P.white;
  ctx.fillRect(x0, y, x1 - x0, 2);
}

/**
 * The set below the single with the speaker's body in it, this frame: a presenter whose body runs past the foot of the
 * Stage's frame (a contestant at a podium, lower than a desk) goes on below it instead of being cut there. The Stage's
 * own actors are drawn again, at the same instant, 216 rows lower, over the set below (`ext.belowPx`, clipped by its
 * own desks and podiums), and the frame is returned as a canvas (384 x 216). Null without the renderer's actors.
 */
VerticalSet.prototype.singleBelow = function singleBelow(stage, ext, t) {
  const k = this.kit;
  if (!k?.drawActors || !ext?.belowPx || !stage?.vis?.length) return null;
  k.frame.px.set(ext.belowPx);
  const list = stage.vis.map((it) => ({ ...it, y: it.y - (H - OVERLAP) }));
  k.drawActors(t - (stage.epoch || 0), list, ext.clipBelow);
  if (!ext.live) ext.live = mk(W, H);
  k.frame.present(ext.live.getContext('2d'));
  return ext.live;
};

/** A canvas behind tinted glass (GLASS): for a picture the compositor did not bake (a weather centre's frame). */
export function glassOf(canvas) {
  const g = canvas.getContext('2d');
  const img = g.getImageData(0, 0, canvas.width, canvas.height);
  const px = new Uint32Array(img.data.buffer);
  return toCanvas(mapPixels(px, GLASS), canvas.width, canvas.height);
}

export { mk };
