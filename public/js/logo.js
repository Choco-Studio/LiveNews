// GLOBIT 24 brand mark: "the world, pixel by pixel".
//
// The symbol is a flat red globe cut into tiles by pixel gaps (equator +
// one meridian lens), with a single yellow square "bit" popping out of its
// top-right edge: GLOBE + BIT. The wordmark is custom chamfered lettering with
// a chrome split (white over silver) and a red digital "24" badge.
//
// Every variant is hand-drawn at 1x as character art, composed into a 1x
// sprite once, then rendered into a cached offscreen canvas per integer
// scale. Animation (a diagonal glint every 6 s and a pulse of the bit) is
// painted on top in whole logo pixels so it stays crisp.
import { P } from './palette.js';
import { clamp, easeInOut } from './util.js';

export const CHANNEL_NAME = 'GLOBIT 24';
export const CHANNEL_SLOGAN = 'THE WORLD, PIXEL BY PIXEL';

// ---------------------------------------------------------------------------
// Colour keys used by the character art. Only palette colours.
const COLOR = {
  K: P.black, // outline / ink
  Q: P.black, // bug plate (separate key so the glint can sheen it)
  I: P.ink,
  N: P.navy, // globe gaps: the brand background showing through
  R: P.red,
  D: P.darkRed,
  H: P.pink,
  W: P.white,
  S: P.silver,
  Y: P.yellow,
  C: P.cream,
  O: P.orange,
};
// What each key turns into under the glint (missing = untouched).
const GLINT = { R: 'H', D: 'R', H: 'W', S: 'W', Y: 'C', C: 'W', O: 'Y', Q: 'I' };

const mirrorV = (top) => [...top, ...top.slice(0, -1).reverse()];

// Large globe, 21x21. R red, D shadow, H highlight, '-' gap (transparent but
// part of the silhouette, so the outline wraps around it).
const GLOBE_L = [
  '.......RRRRRRR.......',
  '.....RRR-RRR-RRR.....',
  '...RRRR-RRRRR-RRRR...',
  '..RHHR-RRRRRRR-RRRD..',
  '..RHRR-RRRRRRR-RRRD..',
  '.RRRR-RRRRRRRRR-RRRD.',
  '.RRRR-RRRRRRRRR-RRDD.',
  'RRRRR-RRRRRRRRR-RRRDD',
  'RRRRR-RRRRRRRRR-RRRDD',
  'RRRRR-RRRRRRRRR-RRRDD',
  '---------------------',
  'RRRRR-RRRRRRRRR-RRDDD',
  'RRRRR-RRRRRRRRR-RRDDD',
  'RRRRR-RRRRRRRRR-RDDDD',
  '.RRRR-RRRRRRRRD-DDDD.',
  '.RRRR-RRRRRRRDD-DDDD.',
  '..RRRR-RRRRRDD-DDDD..',
  '..DRRR-RRRDDDD-DDDD..',
  '...DDDD-DDDDD-DDDD...',
  '.....DDD-DDD-DDD.....',
  '.......DDDDDDD.......',
];

// Small globe for the on-screen bug, 11x11, flat.
const GLOBE_S = mirrorV(['...RRRRR...', '..RRRRRRR..', '.RR-RRR-RR.', 'RR-RRRRR-RR', 'RR-RRRRR-RR', '-----------']);

// Wordmark, cap height 13, 3px stems, chamfered rounds.
const WORD_L = {
  G: ['..#########', '.##########', '###########', '###........', '###........', '###...#####', '###...#####', '###...#####', '###.....###', '###.....###', '###########', '.#########.', '..#######..'],
  L: ['###......', '###......', '###......', '###......', '###......', '###......', '###......', '###......', '###......', '###......', '#########', '#########', '#########'],
  O: ['..#######..', '.#########.', '###########', '###.....###', '###.....###', '###.....###', '###.....###', '###.....###', '###.....###', '###.....###', '###########', '.#########.', '..#######..'],
  B: ['#########..', '##########.', '###########', '###....####', '###....###.', '##########.', '##########.', '###.....###', '###.....###', '###.....###', '###########', '##########.', '#########..'],
  I: ['###', '###', '###', '###', '###', '###', '###', '###', '###', '###', '###', '###', '###'],
  T: ['###########', '###########', '###########', '....###....', '....###....', '....###....', '....###....', '....###....', '....###....', '....###....', '....###....', '....###....', '....###....'],
};
// Bug wordmark, cap height 7, 2px stems.
const WORD_S = {
  G: ['.####.', '##..##', '##....', '##.###', '##..##', '##..##', '.####.'],
  L: ['##...', '##...', '##...', '##...', '##...', '#####', '#####'],
  O: ['.####.', '##..##', '##..##', '##..##', '##..##', '##..##', '.####.'],
  B: ['#####.', '##..##', '##..##', '#####.', '##..##', '##..##', '#####.'],
  I: ['##', '##', '##', '##', '##', '##', '##'],
  T: ['######', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..'],
};
// Digital "24" (a 24-hour clock read-out).
const DIGITS_L = {
  2: ['######', '######', '....##', '######', '######', '##....', '##....', '######', '######'],
  4: ['##..##', '##..##', '##..##', '######', '######', '....##', '....##', '....##', '....##'],
};
const DIGITS_S = {
  2: ['####.', '...##', '...##', '.###.', '##...', '##...', '#####'],
  4: ['##.##', '##.##', '##.##', '#####', '...##', '...##', '...##'],
};
// Tiny 5px-tall caps for the slogan strap.
const MINI = {
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  E: ['###', '#..', '##.', '#..', '###'],
  W: ['#...#', '#...#', '#.#.#', '#.#.#', '.#.#.'],
  O: ['###', '#.#', '#.#', '#.#', '###'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  I: ['#', '#', '#', '#', '#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  ',': ['.', '.', '.', '.', '#', '#'],
};

// ---------------------------------------------------------------------------
// Tiny 1x sprite toolkit. A sprite is { w, h, px } with one colour key (or
// null) per pixel.
function sprite(w, h) {
  return { w, h, px: new Array(w * h).fill(null) };
}
const get = (s, x, y) => (x < 0 || y < 0 || x >= s.w || y >= s.h ? null : s.px[y * s.w + x]);
function set(s, x, y, k) {
  if (x >= 0 && y >= 0 && x < s.w && y < s.h) s.px[y * s.w + x] = k;
}
function fill(s, x, y, w, h, k) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(s, x + i, y + j, k);
}
function fromRows(rows, key = null) {
  const s = sprite(Math.max(...rows.map((r) => r.length)), rows.length);
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch !== '.') set(s, x, y, key && ch === '#' ? key : ch);
  }));
  return s;
}
function blit(dst, src, x, y) {
  for (let j = 0; j < src.h; j++) for (let i = 0; i < src.w; i++) {
    const k = get(src, i, j);
    if (k) set(dst, x + i, y + j, k);
  }
}
/** Turn '-' gap pixels into `key` (null = transparent). */
function gaps(src, key = null) {
  src.px = src.px.map((k) => (k === '-' ? key : k));
  return src;
}
/** 1px outline (4-neighbour, so outer corners stay chamfered). '-' gaps count as solid and are kept. */
function outline(src, key = 'K') {
  const s = sprite(src.w + 2, src.h + 2);
  blit(s, src, 1, 1);
  const out = sprite(s.w, s.h);
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    const k = get(s, x, y);
    if (k) set(out, x, y, k);
    else if (get(s, x + 1, y) || get(s, x - 1, y) || get(s, x, y + 1) || get(s, x, y - 1)) set(out, x, y, key);
  }
  return out;
}
/** Solid 1px drop under the silhouette (gives the outline a little depth). */
function drop(src, key = 'K') {
  const s = sprite(src.w, src.h + 1);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) if (get(src, x, y)) set(s, x, y + 1, key);
  blit(s, src, 0, 0);
  return s;
}
/** Lay out glyphs left to right with a fixed gap. */
function word(glyphs, text, gap, key) {
  const parts = [...text].map((ch) => fromRows(glyphs[ch], key));
  const w = parts.reduce((a, p) => a + p.w, 0) + gap * (parts.length - 1);
  const s = sprite(w, Math.max(...parts.map((p) => p.h)));
  let x = 0;
  for (const p of parts) {
    blit(s, p, x, 0);
    x += p.w + gap;
  }
  return s;
}
/** Recolour rows from `fromY` down (chrome split). */
function tint(s, fromY, from, to) {
  for (let y = fromY; y < s.h; y++) for (let x = 0; x < s.w; x++) if (get(s, x, y) === from) set(s, x, y, to);
  return s;
}

// ---------------------------------------------------------------------------
// Logo parts at 1x
function buildMark() {
  // globe 23x23 with outline, bit 6x6 with outline, square 27x27 overall
  const globe = gaps(outline(fromRows(GLOBE_L)), 'N');
  const bit = sprite(4, 4);
  fill(bit, 0, 0, 4, 4, 'Y');
  set(bit, 0, 0, 'C');
  fill(bit, 0, 3, 4, 1, 'O');
  fill(bit, 3, 0, 1, 4, 'O');
  set(bit, 3, 0, 'Y');
  const s = sprite(27, 27);
  blit(s, globe, 0, 4);
  blit(s, outline(bit), 21, 0);
  return { s, bit: { x: 22, y: 1, w: 4, h: 4 } };
}

function buildWordmark() {
  const letters = tint(word(WORD_L, 'GLOBIT', 2, 'W'), 7, 'W', 'S');
  return drop(outline(letters));
}

function buildBadge() {
  const digits = word(DIGITS_L, '24', 1, 'W');
  const b = sprite(digits.w + 4, digits.h + 4);
  fill(b, 0, 0, b.w, b.h, 'R');
  fill(b, 0, b.h - 1, b.w, 1, 'D');
  blit(b, digits, 2, 2);
  return drop(outline(b));
}

function buildSlogan(width) {
  // tracked-out mini caps on a black strap of exactly `width` pixels
  const words = CHANNEL_SLOGAN.split(' ').map((w) => word(MINI, w, 2, 'S'));
  const textW = words.reduce((a, w) => a + w.w, 0);
  const pad = 4;
  const space = Math.max(3, Math.floor((width - pad * 2 - textW) / (words.length - 1)));
  const used = textW + space * (words.length - 1);
  const s = sprite(width, 9);
  fill(s, 0, 0, width, 9, 'K');
  let x = Math.floor((width - used) / 2);
  for (const w of words) {
    blit(s, w, x, 2);
    x += w.w + space;
  }
  return s;
}

function buildFull(slogan) {
  const { s: mark, bit } = buildMark();
  const wm = buildWordmark();
  const badge = buildBadge();
  const gapMW = 3;
  const w = mark.w + gapMW + wm.w + 1 + badge.w;
  const textY = 4 + Math.round((23 - wm.h) / 2) + 1;
  const h = mark.h + (slogan ? 11 : 0);
  const s = sprite(w, h);
  blit(s, mark, 0, 0);
  blit(s, wm, mark.w + gapMW, textY);
  blit(s, badge, mark.w + gapMW + wm.w + 1, textY);
  if (slogan) blit(s, buildSlogan(w), 0, mark.h + 2);
  return { s, bit };
}

function buildBug() {
  const globe = gaps(fromRows(GLOBE_S), 'N');
  const letters = word(WORD_S, 'GLOBIT', 1, 'W');
  const digits = word(DIGITS_S, '24', 1, 'W');
  const H = 13;
  const plateW = 2 + globe.w + 2 + 2 + letters.w + 4;
  const tagW = digits.w + 6;
  const s = sprite(plateW + tagW, H);
  fill(s, 0, 0, plateW, H, 'Q');
  fill(s, plateW, 0, tagW, H, 'R');
  fill(s, plateW, H - 1, tagW, 1, 'D');
  blit(s, globe, 2, 1);
  const bit = { x: 2 + globe.w, y: 1, w: 2, h: 2 };
  fill(s, bit.x, bit.y, 2, 2, 'Y');
  blit(s, letters, 2 + globe.w + 4, 3);
  blit(s, digits, plateW + 3, 3);
  return { s, bit };
}

// ---------------------------------------------------------------------------
// Caches: one 1x layout per variant, one canvas per (variant, scale).
const VARIANTS = ['full', 'bug', 'mark'];
const layouts = new Map();
const canvases = new Map();

function layout(variant, slogan) {
  const v = VARIANTS.includes(variant) ? variant : 'full';
  const key = `${v}|${v === 'full' && slogan ? 1 : 0}`;
  let L = layouts.get(key);
  if (L) return L;
  const built = v === 'bug' ? buildBug() : v === 'mark' ? buildMark() : buildFull(!!slogan);
  const { s } = built;
  // glint candidates, keyed by diagonal (x + y) so a sweep is a cheap lookup
  const diag = new Map();
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    const k = get(s, x, y);
    if (!k || !GLINT[k]) continue;
    const d = x + y;
    if (!diag.has(d)) diag.set(d, []);
    diag.get(d).push(x, y, k);
  }
  L = { key, s, bit: built.bit, diag, w: s.w, h: s.h };
  layouts.set(key, L);
  return L;
}

function render(L, scale) {
  const key = `${L.key}|${scale}`;
  let c = canvases.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = L.w * scale;
  c.height = L.h * scale;
  const ctx = c.getContext('2d');
  const { s } = L;
  for (let y = 0; y < s.h; y++) {
    let x = 0;
    while (x < s.w) {
      const k = get(s, x, y);
      let run = 1;
      while (x + run < s.w && get(s, x + run, y) === k) run++;
      if (k) {
        ctx.fillStyle = COLOR[k];
        ctx.fillRect(x * scale, y * scale, run * scale, scale);
      }
      x += run;
    }
  }
  canvases.set(key, c);
  return c;
}

// ---------------------------------------------------------------------------
// Animation
const GLINT_PERIOD = 6; // seconds between sweeps
const GLINT_TIME = 0.9; // seconds a sweep takes
const GLINT_BAND = [0, 1, 3]; // offsets behind the head that light up

function drawGlint(ctx, L, ox, oy, scale, t) {
  const phase = ((t % GLINT_PERIOD) + GLINT_PERIOD) % GLINT_PERIOD;
  if (phase >= GLINT_TIME) return;
  const span = L.w + L.h + 8;
  const head = Math.floor(easeInOut(phase / GLINT_TIME) * span) - 4;
  for (const off of GLINT_BAND) {
    const list = L.diag.get(head - off);
    if (!list) continue;
    for (let i = 0; i < list.length; i += 3) {
      ctx.fillStyle = COLOR[GLINT[list[i + 2]]];
      ctx.fillRect(ox + list[i] * scale, oy + list[i + 1] * scale, scale, scale);
    }
  }
}

function drawBitPulse(ctx, L, ox, oy, scale, t) {
  // The bit "beats" twice per glint cycle: cream, white, cream.
  const phase = ((t % (GLINT_PERIOD / 2)) + GLINT_PERIOD / 2) % (GLINT_PERIOD / 2);
  const start = 1.1;
  if (phase < start || phase >= start + 0.36) return;
  const step = Math.floor((phase - start) / 0.12);
  const { x, y, w, h } = L.bit;
  ctx.fillStyle = step === 1 ? P.white : P.cream;
  ctx.fillRect(ox + x * scale, oy + y * scale, w * scale, h * scale);
}

// ---------------------------------------------------------------------------
// Public API

/**
 * Draw the channel logo with its top-left (or top-centre / top-right) at
 * (x, y). `scale` is an integer 1-4 that multiplies every logo pixel. Pass
 * `t` (seconds) to animate. Returns the drawn { w, h } in canvas pixels.
 */
export function drawLogo(ctx, x, y, { variant = 'full', scale = 1, t = null, slogan = false, align = 'left' } = {}) {
  const sc = clamp(Math.round(scale) || 1, 1, 4);
  const L = layout(variant, slogan);
  const w = L.w * sc;
  const h = L.h * sc;
  const dx = Math.round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x);
  const dy = Math.round(y);
  ctx.drawImage(render(L, sc), dx, dy);
  if (t !== null && t !== undefined && Number.isFinite(t)) {
    drawGlint(ctx, L, dx, dy, sc, t);
    drawBitPulse(ctx, L, dx, dy, sc, t);
  }
  return { w, h };
}

/** Size of the logo without drawing it. */
export function measureLogo({ variant = 'full', scale = 1, slogan = false } = {}) {
  const sc = clamp(Math.round(scale) || 1, 1, 4);
  const L = layout(variant, slogan);
  return { w: L.w * sc, h: L.h * sc };
}
