// The GLOBIT 24 studio set, drawn behind and around the presenters
// (anchors.js draws them between drawSet() and drawDesk()).
//
// Design concept, "the globe": a calm, dark back wall with one huge circular
// recess behind the presenters - the channel's pixel globe at set scale -
// edged by a ring of accent light and crossed, like the logo, by an equator
// seam and a meridian lens. The video wall sits at its heart as the single
// hero element, with the logo's yellow "bit" on its corner; the curved desk
// carries the logo. Programme themes only change the accent colour, the
// lighting tint and what the video wall shows when idle.
//
// Everything is integer pixels in the channel palette, plus a few deliberate
// alpha washes for light, glow and reflections. Static scenery is baked once
// per theme into offscreen layers; each frame only adds the slow motion: the
// video wall, breathing practical lights, an occasional pulse along the ring
// and the desk LED, a light sweep across the globe and soft reflections.
import { P } from './palette.js';
import { drawText, measureText, wrapText, normalizeText } from './font.js';
import { mulberry32, clamp, easeOut, easeInOut } from './util.js';
import { drawLogo, measureLogo, CHANNEL_NAME } from './logo.js';

export const W = 384;
export const H = 216;
export const DESK_Y = 118;
export const ANCHOR_X = { A: 118, B: 266 };
export const ANCHOR_Y = 80;
export const WALL = { x: 140, y: 18, w: 104, h: 62 };

// ---------------------------------------------------------------------------
// Pixel helpers

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x, y) => (BAYER[((y & 3) << 2) | (x & 3)] + 0.5) / 16;

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d').imageSmoothingEnabled = false;
  return c;
}

const RGB = new Map();
function rgbOf(hex) {
  let v = RGB.get(hex);
  if (!v) {
    const n = parseInt(hex.slice(1), 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    RGB.set(hex, v);
  }
  return v;
}
const u32 = (hex) => {
  const [R, G, B] = rgbOf(hex);
  return ((255 << 24) | (B << 16) | (G << 8) | R) >>> 0;
};

const RGBA = new Map();
/** CSS colour for a palette colour at alpha a (quantised so the cache stays small). */
function rgba(hex, a) {
  const q = Math.round(clamp(a, 0, 1) * 100);
  const key = hex + q;
  let s = RGBA.get(key);
  if (!s) {
    const [R, G, B] = rgbOf(hex);
    s = `rgba(${R},${G},${B},${q / 100})`;
    RGBA.set(key, s);
  }
  return s;
}

function fill(ctx, x, y, w, h, c) {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
}

/** Cheap deterministic hash → [0, 1). */
function hash(n) {
  n = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  n ^= n >>> 13;
  n = Math.imul(n, 0xc2b2ae35);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

/** Bresenham line, calling fn(x, y, i) for every pixel. */
function linePts(x0, y0, x1, y1, fn) {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let i = 0; ; i++) {
    fn(x0, y0, i);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/** A tiny RGBA pixel buffer used to bake static layers with ordered dithering. */
class Pix {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.img = new ImageData(w, h);
    this.buf = new Uint32Array(this.img.data.buffer);
  }

  px(x, y, hex) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.buf[y * this.w + x] = u32(hex);
  }

  rect(x, y, w, h, hex) {
    const c = u32(hex);
    const x0 = Math.max(0, x);
    const x1 = Math.min(this.w, x + w);
    for (let yy = Math.max(0, y); yy < Math.min(this.h, y + h); yy++) {
      if (x1 > x0) this.buf.fill(c, yy * this.w + x0, yy * this.w + x1);
    }
  }

  get(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.buf[y * this.w + x] : 0;
  }

  /** Composite a straight-alpha colour (raw u32 or palette hex) over a pixel. */
  over(x, y, c, a) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    let sr;
    let sg;
    let sb;
    if (typeof c === 'string') [sr, sg, sb] = rgbOf(c);
    else {
      sr = c & 255;
      sg = (c >>> 8) & 255;
      sb = (c >>> 16) & 255;
      a *= (c >>> 24) / 255;
    }
    const i = y * this.w + x;
    const d = this.buf[i];
    const da = (d >>> 24) / 255;
    const oa = a + da * (1 - a);
    if (oa <= 0) return;
    const k = da * (1 - a);
    const R = Math.round((sr * a + (d & 255) * k) / oa);
    const G = Math.round((sg * a + ((d >>> 8) & 255) * k) / oa);
    const B = Math.round((sb * a + ((d >>> 16) & 255) * k) / oa);
    this.buf[i] = ((Math.round(oa * 255) << 24) | (B << 16) | (G << 8) | R) >>> 0;
  }

  /**
   * Ordered-dither fill through palette stops. posFn(x, y) returns a position
   * 0..stops.length-1 (or a negative number to leave the pixel untouched).
   * sharp > 1 narrows each dithered transition into a crisp seam.
   */
  shade(x0, y0, w, h, stops, posFn, sharp = 1) {
    const n = stops.length - 1;
    const cols = stops.map(u32);
    for (let y = Math.max(0, y0); y < Math.min(this.h, y0 + h); y++) {
      for (let x = Math.max(0, x0); x < Math.min(this.w, x0 + w); x++) {
        const pos = posFn(x, y);
        if (pos < 0) continue;
        if (n === 0) {
          this.buf[y * this.w + x] = cols[0];
          continue;
        }
        const p = clamp(pos, 0, n);
        const k = Math.min(n - 1, Math.floor(p));
        const f = clamp((p - k - 0.5) * sharp + 0.5, 0, 1);
        this.buf[y * this.w + x] = f > bayer(x, y) ? cols[k + 1] : cols[k];
      }
    }
  }

  vgrad(x0, y0, w, h, stops, sharp = 1) {
    const n = stops.length - 1;
    this.shade(x0, y0, w, h, stops, (x, y) => (h > 1 ? ((y - y0) / (h - 1)) * n : 0), sharp);
  }

  canvas() {
    const c = makeCanvas(this.w, this.h);
    c.getContext('2d').putImageData(this.img, 0, 0);
    return c;
  }
}

// ---------------------------------------------------------------------------
// 3x5 micro font for small labels on the video wall

const TINY_SRC = {
  A: '.#.|#.#|###|#.#|#.#', B: '##.|#.#|##.|#.#|##.', C: '.##|#..|#..|#..|.##', D: '##.|#.#|#.#|#.#|##.',
  E: '###|#..|##.|#..|###', F: '###|#..|##.|#..|#..', G: '.##|#..|#.#|#.#|.##', H: '#.#|#.#|###|#.#|#.#',
  I: '###|.#.|.#.|.#.|###', J: '..#|..#|..#|#.#|.#.', K: '#.#|#.#|##.|#.#|#.#', L: '#..|#..|#..|#..|###',
  M: '#...#|##.##|#.#.#|#...#|#...#', N: '#..#|##.#|#.##|#..#|#..#', O: '.#.|#.#|#.#|#.#|.#.',
  P: '##.|#.#|##.|#..|#..', Q: '.#.|#.#|#.#|##.|.##', R: '##.|#.#|##.|#.#|#.#', S: '.##|#..|.#.|..#|##.',
  T: '###|.#.|.#.|.#.|.#.', U: '#.#|#.#|#.#|#.#|###', V: '#.#|#.#|#.#|#.#|.#.', W: '#...#|#...#|#.#.#|##.##|#...#',
  X: '#.#|#.#|.#.|#.#|#.#', Y: '#.#|#.#|.#.|.#.|.#.', Z: '###|..#|.#.|#..|###',
  0: '###|#.#|#.#|#.#|###', 1: '.#|##|.#|.#|.#', 2: '##.|..#|.#.|#..|###', 3: '##.|..#|.#.|..#|##.',
  4: '#.#|#.#|###|..#|..#', 5: '###|#..|##.|..#|##.', 6: '.##|#..|###|#.#|###', 7: '###|..#|.#.|.#.|.#.',
  8: '###|#.#|###|#.#|###', 9: '###|#.#|###|..#|##.', ':': '.|#|.|#|.', '.': '.|.|.|.|#', '-': '..|..|##|..|..',
  '&': '.#.|#.#|.#.|#.#|.##', ',': '.|.|.|#|#', "'": '#|#|.|.|.',
};
const TINY = new Map(
  Object.entries(TINY_SRC).map(([ch, src]) => {
    const rows = src.split('|');
    const pts = [];
    rows.forEach((row, y) => [...row].forEach((c, x) => c === '#' && pts.push([x, y])));
    return [ch, { w: rows[0].length, pts }];
  }),
);

function tinyWidth(text) {
  let w = 0;
  for (const ch of String(text).toUpperCase()) w += ch === ' ' ? 2 : (TINY.get(ch)?.w ?? 3) + 1;
  return Math.max(0, w - 1);
}

const tinyCache = new Map();
/** Draw 3x5 text with its top-left at (x, y). Returns the width. */
function tiny(ctx, text, x, y, color, align = 'left') {
  const key = `${color}|${text}`;
  let c = tinyCache.get(key);
  if (!c) {
    c = makeCanvas(Math.max(1, tinyWidth(text)), 5);
    const cx = c.getContext('2d');
    cx.fillStyle = color;
    let pen = 0;
    for (const ch of String(text).toUpperCase()) {
      if (ch === ' ') {
        pen += 2;
        continue;
      }
      const g = TINY.get(ch);
      if (g) for (const [px, py] of g.pts) cx.fillRect(pen + px, py, 1, 1);
      pen += (g?.w ?? 3) + 1;
    }
    if (tinyCache.size > 200) tinyCache.delete(tinyCache.keys().next().value);
    tinyCache.set(key, c);
  }
  const dx = Math.round(align === 'center' ? x - c.width / 2 : align === 'right' ? x - c.width : x);
  ctx.drawImage(c, dx, Math.round(y));
  return c.width;
}

// ---------------------------------------------------------------------------
// Programme themes: one accent + neutrals. led = [dim, lit, peak] for the ring
// and desk LEDs, text = accent that stays legible as type, tint = colour of
// the light on the set, glow = what the idle video wall throws on the set.

const THEMES = {
  world: { id: 'world', ring: [P.darkRed, P.red], led: [P.darkRed, P.red, P.pink], text: P.red, tint: P.blue, glow: P.blue, idle: 'globe', screen: [P.navy, P.ink, P.black] },
  tech: { id: 'tech', ring: [P.purple, P.magenta], led: [P.purple, P.magenta, P.pink], text: P.magenta, tint: P.magenta, glow: P.magenta, idle: 'chip', screen: [P.purple, P.black, P.black] },
  space: { id: 'space', ring: [P.purple, P.purple], led: [P.ink, P.purple, P.magenta], text: P.pink, tint: P.purple, glow: P.purple, idle: 'planet', screen: [P.black, P.black, P.ink], dark: true },
  money: { id: 'money', ring: [P.darkGreen, P.green], led: [P.darkGreen, P.green, P.yellow], text: P.green, tint: P.cream, glow: P.green, idle: 'chart', screen: [P.ink, P.black, P.black], solo: true },
  flash: { id: 'flash', ring: [P.yellow, P.yellow], led: [P.orange, P.yellow, P.white], text: P.yellow, tint: P.cream, glow: P.yellow, idle: 'countdown', screen: [P.black, P.black, P.ink], solo: true },
};
const themeOf = (scene) => THEMES[scene?.program?.theme] || THEMES.world;

// ---------------------------------------------------------------------------
// Geometry of the set

const FLOOR_Y = 134;
const DISC = { cx: 191.5, cy: 49, R: 118 }; // the globe recess, centred on the video wall
const MERIDIAN = 46; // half-width of the meridian lens at the equator
const FIXTURES = [54, 118, 266, 330];
const UPLIGHTS = [13, 38, 370, 345];
const SEAMS = [25, 50, 333, 358];
const BIT = { x: 246, y: 9 }; // the logo's yellow bit, on the video wall's corner
// front edge of the round riser the desk stands on (y per column; H = none)
const RISER = Array.from({ length: W }, (_, x) => {
  const u = (x + 0.5 - 192) / 190;
  return Math.abs(u) >= 1 ? H : Math.round(FLOOR_Y + 48 * Math.sqrt(1 - u * u));
});
const discDist = (x, y) => Math.hypot(x + 0.5 - DISC.cx, y + 0.5 - DISC.cy);

// ---------------------------------------------------------------------------
// Static back layer, baked once per theme

/** Floor, ceiling and anything that does not change between programmes. */
let basePix = null;
function base() {
  if (basePix) return basePix;
  const p = new Pix(W, H);
  // ceiling: a slim lighting grid in the dark
  p.rect(0, 0, W, 10, P.black);
  p.rect(0, 3, W, 1, P.slate);
  p.rect(0, 4, W, 1, P.ink);
  p.rect(0, 7, W, 1, P.ink);
  for (let x = 0; x < W; x++) if (x % 8 === 0) p.rect(x, 5, 1, 2, P.ink);
  // baseboard where wall meets floor (seen at the sides of the desk)
  p.rect(0, FLOOR_Y - 4, W, 1, P.black);
  p.rect(0, FLOOR_Y - 3, W, 2, P.slate);
  p.rect(0, FLOOR_Y - 1, W, 1, P.ink);
  // glossy floor with a round riser under the desk
  p.vgrad(0, FLOOR_Y, W, H - FLOOR_Y, [P.ink, P.ink, P.black], 3);
  for (let k = -14; k <= 14; k++) {
    linePts(192, 56, 192 + k * 30, 260, (x, y) => y > FLOOR_Y && p.over(x, y, P.slate, y < RISER[x] ? 0.3 : 0.12));
  }
  for (let x = 0; x < W; x++) {
    const ry = RISER[x];
    for (let y = Math.max(FLOOR_Y, ry); y < H; y++) p.over(x, y, P.black, 0.4);
    if (ry >= H) continue;
    const y0 = Math.max(FLOOR_Y, Math.min(ry, (RISER[x - 1] ?? H) + 1, (RISER[x + 1] ?? H) + 1));
    p.over(x, y0 - 1, P.white, 0.08);
    for (let y = y0; y <= ry; y++) {
      p.px(x, y, P.steel); // lip catching the light
      p.px(x, y + 1, P.slate);
      p.px(x, y + 2, P.black);
      p.px(x, y + 3, P.black);
    }
  }
  basePix = p;
  return p;
}

const bgLayers = new Map();
function background(th) {
  let cv = bgLayers.get(th.id);
  if (cv) return cv;
  const p = new Pix(W, H);
  p.buf.set(base().buf);
  const { cx, cy, R } = DISC;
  const [ringOuter, ringInner] = th.ring;
  const [sDark, sMid] = th.dark ? [P.black, P.black] : [P.black, P.ink];
  const discStops = th.dark ? [P.ink, P.slate, P.steel] : [P.slate, P.steel, P.fog];
  // Light pools ("scallops") thrown on the globe by the two key fixtures:
  // flat bands with narrow dithered seams that end well above head height,
  // so faces sit on one flat, calm tone.
  const scallop = (x, y) => {
    let f = 0;
    for (const fx of [ANCHOR_X.A, ANCHOR_X.B]) {
      const dy = y - 13;
      if (dy < 0) continue;
      const u = Math.abs(x + 0.5 - fx) / (3 + Math.sqrt(dy) * 3.2);
      const v = dy / 46;
      f = Math.max(f, 1 - Math.max(u, v ** 0.8 + 0.3 * u * u));
    }
    return clamp(f, 0, 1) * 2.3;
  };
  for (let y = 10; y < FLOOR_Y - 4; y++) {
    for (let x = 0; x < W; x++) {
      const d = discDist(x, y);
      let c;
      if (d >= R + 1) {
        // surround: perforated acoustic panels, in shadow under the ceiling
        if (y < 14 || (y < 16 && (x + y) % 2 === 0)) c = sDark;
        else c = (y % 3 === 0 && (x + (y % 6 === 0 ? 0 : 2)) % 4 === 0) ? sDark : sMid;
        if (SEAMS.includes(x)) c = P.black;
      } else if (d >= R) c = P.black;
      else if (d >= R - 1) c = ringOuter;
      else if (d >= R - 2) c = ringInner;
      else if (d >= R - 3) c = P.black;
      else {
        const n = Math.min(scallop(x, y), 2);
        const k = Math.min(1, Math.floor(n));
        const f = clamp((n - k - 0.5) * 3.2 + 0.5, 0, 1);
        c = f > bayer(x, y) ? discStops[k + 1] : discStops[k];
      }
      p.px(x, y, c);
    }
  }
  // the light in the pools takes the programme's tint
  for (let y = 13; y < 62; y++) {
    for (let x = 60; x < 324; x++) {
      if (discDist(x, y) < R - 3 && scallop(x, y) > 0.5) p.over(x, y, th.tint, 0.16);
    }
  }
  // equator seam and meridian lens, as on the logo's globe
  for (let x = 0; x < W; x++) {
    if (discDist(x, cy) < R - 4) {
      p.px(x, cy, P.silver);
      p.over(x, cy + 1, P.black, 0.35);
    }
  }
  for (let y = 10; y < FLOOR_Y - 4; y++) {
    const v = (y + 0.5 - cy) / (R - 3);
    if (Math.abs(v) >= 1) continue;
    const m = MERIDIAN * Math.sqrt(1 - v * v);
    for (const x of [Math.round(cx - m - 0.5), Math.round(cx + m - 0.5)]) {
      p.px(x, y, P.fog);
      p.over(x + (x < cx ? 1 : -1), y, P.black, 0.25);
    }
  }
  // video wall bezel
  {
    const { x, y, w, h } = WALL;
    p.rect(x - 4, y - 4, w + 8, h + 8, P.black);
    p.rect(x - 3, y - 3, w + 6, h + 6, P.slate);
    p.rect(x - 3, y - 3, w + 6, 1, P.fog);
    p.rect(x - 3, y - 3, 1, h + 6, P.steel);
    p.rect(x + w + 2, y - 3, 1, h + 6, P.ink);
    p.rect(x - 3, y + h + 2, w + 6, 1, P.ink);
    p.rect(x - 1, y - 1, w + 2, h + 2, P.black);
  }
  // the bit: a yellow square popping off the screen's corner, as in the logo
  p.rect(BIT.x, BIT.y, 6, 6, P.black);
  p.rect(BIT.x + 1, BIT.y + 1, 4, 4, P.yellow);
  p.px(BIT.x + 1, BIT.y + 1, P.cream);
  p.rect(BIT.x + 1, BIT.y + 4, 4, 1, P.orange);
  p.rect(BIT.x + 4, BIT.y + 1, 1, 4, P.orange);
  p.px(BIT.x + 4, BIT.y + 1, P.yellow);
  // floor-standing uplights at the foot of the surround panels
  for (const ux of UPLIGHTS) {
    p.rect(ux - 2, FLOOR_Y - 6, 5, 2, P.black);
    p.rect(ux - 1, FLOOR_Y - 7, 3, 1, th.ring[1]);
    for (let i = 0; i < 22; i++) {
      p.over(ux, FLOOR_Y + i, th.tint, 0.22 * (1 - i / 22));
      p.over(ux - 1, FLOOR_Y + i, th.tint, 0.1 * (1 - i / 22));
      p.over(ux + 1, FLOOR_Y + i, th.tint, 0.1 * (1 - i / 22));
    }
  }
  cv = p.canvas();
  bgLayers.set(th.id, cv);
  return cv;
}

// ---------------------------------------------------------------------------
// Slow set motion: practical lights, ring pulse, light sweep, reflections

let fixtureSprite = null;
function fixture() {
  if (fixtureSprite) return fixtureSprite;
  const p = new Pix(7, 7);
  p.px(3, 0, P.slate);
  p.rect(2, 1, 3, 1, P.slate);
  p.rect(1, 2, 5, 2, P.slate);
  p.rect(1, 2, 1, 2, P.steel);
  p.rect(5, 2, 1, 2, P.ink);
  p.rect(2, 4, 3, 1, P.black);
  fixtureSprite = p.canvas();
  return fixtureSprite;
}

const uplightSprites = new Map();
/** Scallop an uplight throws up a surround panel: two flat bands of tinted light. */
function uplightSprite(tint) {
  let c = uplightSprites.get(tint);
  if (c) return c;
  const Hh = 46;
  const p = new Pix(23, Hh);
  for (let k = 0; k < Hh; k++) {
    const y = Hh - 1 - k;
    for (let x = 0; x < 23; x++) {
      const u = Math.abs(x + 0.5 - 11.5) / (2 + Math.sqrt(k) * 1.45);
      const f = 1 - Math.max(u, k / Hh + 0.3 * u * u);
      if (f <= 0) continue;
      const band = f > 0.55 ? 0.2 : f > 0.12 || (f > 0.04 && (x + y) % 2 === 0) ? 0.1 : 0;
      if (band) p.over(x, y, tint, band);
      if (k < 3 && u < 0.5) p.over(x, y, P.cream, 0.3);
    }
  }
  c = p.canvas();
  uplightSprites.set(tint, c);
  return c;
}

// pixels of the lit ring, per side, ordered from the ceiling down to the desk
const RING = (() => {
  const sides = [[], []];
  for (let y = 10; y < DESK_Y; y++) {
    for (let x = 0; x < W; x++) {
      const d = discDist(x, y);
      if (d >= DISC.R - 2 && d < DISC.R - 1) sides[x < DISC.cx ? 0 : 1].push([x, y]);
    }
  }
  for (const s of sides) s.sort((a, b) => a[1] - b[1] || (a[0] < DISC.cx ? b[0] - a[0] : a[0] - b[0]));
  return sides;
})();

function drawSetLife(ctx, t, th) {
  // uplights breathing on the surround panels
  const up = uplightSprite(th.tint);
  UPLIGHTS.forEach((ux, i) => {
    ctx.globalAlpha = 0.8 + 0.2 * Math.sin(t * 0.55 + i * 1.7);
    ctx.drawImage(up, ux - 11, FLOOR_Y - 7 - up.height);
  });
  ctx.globalAlpha = 1;
  // a soft band of light sweeping across the globe now and then
  const st = t % 19;
  if (st < 3) {
    const bx = DISC.cx - DISC.R + easeInOut(st / 3) * DISC.R * 2;
    for (let y = 10; y < 66; y++) {
      const half = Math.sqrt(Math.max(0, (DISC.R - 3) ** 2 - (y + 0.5 - DISC.cy) ** 2));
      const a = 0.07 * (1 - (y - 10) / 56);
      for (const [w, k] of [[16, 1], [6, 1.4]]) {
        const x0 = Math.max(Math.round(bx - w / 2), Math.ceil(DISC.cx - half));
        const x1 = Math.min(Math.round(bx + w / 2), Math.floor(DISC.cx + half));
        if (x1 > x0) fill(ctx, x0, y, x1 - x0, 1, rgba(P.white, a * k));
      }
    }
  }
  // an occasional pulse running down the ring of light
  const rp = t % 9;
  if (rp < 1.6) {
    const p = easeInOut(rp / 1.6);
    for (const side of RING) {
      const head = Math.floor(p * (side.length + 14));
      for (let j = 0; j < 14; j++) {
        const pt = side[head - j];
        if (!pt) continue;
        fill(ctx, pt[0], pt[1], 1, 1, j < 2 ? P.white : j < 6 ? th.led[2] : rgba(th.led[2], 0.5));
      }
    }
  }
}

function drawPracticals(ctx, t) {
  // rig fixtures with gently breathing lenses
  FIXTURES.forEach((fx, i) => {
    ctx.drawImage(fixture(), fx - 3, 9);
    const b = 0.5 + 0.5 * Math.sin(t * 0.8 + i * 1.3);
    fill(ctx, fx - 1, 13, 3, 1, P.cream);
    fill(ctx, fx, 13, 1, 1, P.white);
    fill(ctx, fx - 2, 14, 5, 1, rgba(P.cream, 0.18 + 0.12 * b));
    fill(ctx, fx - 1, 15, 3, 1, rgba(P.cream, 0.08 + 0.06 * b));
  });
  // the bit glows and beats like the one in the logo
  const g = 0.5 + 0.5 * Math.sin(t * 1.1);
  ctx.fillStyle = rgba(P.yellow, 0.12 + 0.12 * g);
  ctx.fillRect(BIT.x - 1, BIT.y, 1, 6);
  ctx.fillRect(BIT.x + 6, BIT.y, 1, 6);
  ctx.fillRect(BIT.x, BIT.y - 1, 6, 1);
  ctx.fillRect(BIT.x, BIT.y + 6, 6, 1);
  const beat = t % 3;
  if (beat > 1.1 && beat < 1.46) fill(ctx, BIT.x + 1, BIT.y + 1, 4, 4, Math.floor((beat - 1.1) / 0.12) === 1 ? P.white : P.cream);
}

/** Soft, slowly drifting reflection of the video wall's light on the glossy floor. */
function drawFloorSheen(ctx, t, color) {
  const cx = 192 + Math.round(Math.sin(t * 0.11) * 70);
  const breathe = 0.85 + 0.15 * Math.sin(t * 0.7);
  for (const [w, y, h, a] of [[150, 166, 5, 0.04], [96, 167, 3, 0.05], [48, 168, 1, 0.06]]) {
    ctx.fillStyle = rgba(color, a * breathe);
    ctx.fillRect(cx - w / 2, y, w, h);
  }
}

// ---------------------------------------------------------------------------
// Spinning globe (real continents, lit from the upper left, tilted axis)

// 40x14 equirectangular land mask (9° x 10° cells, 75°N .. 55°S).
const WORLD = [
  '.......####.######...#....#...###..#....',
  '.########.##.###.#..####################',
  '.########..###....##.##############.##..',
  '......########....######.##########.#...',
  '......######......###..#############....',
  '.......###.#......################......',
  '........###.......########.##.##.#......',
  '...........####...########..#..###......',
  '...........######....####......#.####...',
  '...........#####.....###.#.......####...',
  '............###......###........######..',
  '............##........#..........####..#',
  '...........##.......................#.#.',
  '............#...........................',
];

let LAND = null;
function landTexture() {
  if (LAND) return LAND;
  LAND = new Uint8Array(360 * 180);
  const cell = (cx, cy) => (WORLD[clamp(cy, 0, 13)][((cx % 40) + 40) % 40] === '#' ? 1 : 0);
  for (let la = 0; la < 180; la++) {
    const lat = 89.5 - la;
    for (let lo = 0; lo < 360; lo++) {
      const lon = lo - 179.5;
      if (lat > 77 || lat < -63) {
        LAND[la * 360 + lo] = 2;
        continue;
      }
      const fx = (lon + 180) / 9 - 0.5;
      const fy = (75 - lat) / 10;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      let v = cell(x0, y0) * (1 - tx) * (1 - ty) + cell(x0 + 1, y0) * tx * (1 - ty) + cell(x0, y0 + 1) * (1 - tx) * ty + cell(x0 + 1, y0 + 1) * tx * ty;
      v += 0.13 * Math.sin(lon * 0.23 + lat * 0.11) * Math.sin(lat * 0.29 - lon * 0.13);
      LAND[la * 360 + lo] = v > 0.5 ? 1 : 0;
    }
  }
  return LAND;
}

// colours per surface type [ocean, land, ice] x light level 0..4
const GLOBE_COLORS = [
  [P.ink, P.navy, P.blue, P.blue, P.cyan],
  [P.darkGreen, P.darkGreen, P.green, P.green, P.green],
  [P.steel, P.fog, P.silver, P.white, P.white],
].map((row) => row.map(u32));

/** Per-pixel latitude / longitude / light level of a lit, tilted sphere. */
function buildSphere(R, tilt) {
  const S = 2 * R + 5;
  const cv = makeCanvas(S, S);
  const gctx = cv.getContext('2d');
  const img = gctx.createImageData(S, S);
  const buf = new Uint32Array(img.data.buffer);
  const idx = [];
  const lat = [];
  const lon = [];
  const lvl = [];
  const L = [-0.5, -0.55, 0.67];
  const RR = R + 0.5;
  const rim = [];
  for (let dy = -R - 2; dy <= R + 2; dy++) {
    for (let dx = -R - 2; dx <= R + 2; dx++) {
      const d2 = dx * dx + dy * dy;
      const i = (dy + R + 2) * S + (dx + R + 2);
      if (d2 <= RR * RR) {
        const nx = dx / RR;
        const ny = dy / RR;
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const qx = nx * Math.cos(tilt) - ny * Math.sin(tilt);
        const qy = nx * Math.sin(tilt) + ny * Math.cos(tilt);
        const dif = nx * L[0] + ny * L[1] + nz * L[2];
        let v = clamp((dif + 0.08) * 3.3, 0, 3);
        const k = Math.floor(v);
        v = Math.min(3, k + (v - k > bayer(dx + 64, dy + 64) ? 1 : 0));
        if (dif > 0.965) v = 4;
        idx.push(i);
        lat.push((-Math.asin(clamp(qy, -1, 1)) * 180) / Math.PI);
        lon.push((Math.atan2(qx, nz) * 180) / Math.PI + 360 * 4);
        lvl.push(v);
      } else if (d2 <= (RR + 1.2) * (RR + 1.2)) {
        rim.push([i, -dx - dy > 0]);
      }
    }
  }
  return { cv, gctx, img, buf, idx, lat, lon, lvl, rim, S };
}

const globes = new Map();
/** Spinning pixel globe centred on (cx, cy) with radius R. */
export function drawGlobe(ctx, cx, cy, R, t) {
  R = Math.max(3, Math.round(R));
  let g = globes.get(R);
  if (!g) {
    g = buildSphere(R, 0.32);
    g.latIdx = g.lat.map((la) => clamp(Math.floor(90 - la), 0, 179) * 360);
    for (const [i, lit] of g.rim) {
      const [cr, cg, cb] = rgbOf(lit ? P.cyan : P.blue);
      g.buf[i] = (((lit ? 150 : 70) << 24) | (cb << 16) | (cg << 8) | cr) >>> 0;
    }
    globes.set(R, g);
  }
  const tex = landTexture();
  const rot = (t * 0.4 * 180) / Math.PI;
  for (let k = 0; k < g.idx.length; k++) {
    const type = tex[g.latIdx[k] + (Math.floor(g.lon[k] + rot) % 360)];
    g.buf[g.idx[k]] = GLOBE_COLORS[type][type === 1 && g.lvl[k] === 4 ? 3 : g.lvl[k]];
  }
  g.gctx.putImageData(g.img, 0, 0);
  ctx.drawImage(g.cv, Math.round(cx) - R - 2, Math.round(cy) - R - 2);
}

// A banded gas giant with a storm, for the space programme.
const PLANET_BANDS = [
  [P.tanShade, P.tan, P.cream],
  [P.purple, P.magenta, P.pink],
  [P.brown, P.tanShade, P.tan],
  [P.ink, P.purple, P.magenta],
  [P.tanShade, P.tan, P.cream],
  [P.purple, P.magenta, P.pink],
].map((row) => row.map(u32));
const STORM = [P.darkRed, P.rust, P.orange].map(u32);
const planets = new Map();
function drawPlanet(ctx, cx, cy, R, t) {
  let g = planets.get(R);
  if (!g) {
    g = buildSphere(R, -0.38);
    for (const [i, lit] of g.rim) {
      const [cr, cg, cb] = rgbOf(lit ? P.pink : P.purple);
      g.buf[i] = (((lit ? 120 : 60) << 24) | (cb << 16) | (cg << 8) | cr) >>> 0;
    }
    planets.set(R, g);
  }
  const rot = t * 9;
  for (let k = 0; k < g.idx.length; k++) {
    const la = g.lat[k];
    const lo = (g.lon[k] + rot) % 360;
    const shade = Math.min(2, Math.max(0, g.lvl[k] - 1));
    const band = Math.floor(((la + 90) / 180) * 6 + 0.35 * Math.sin((lo * Math.PI) / 45 + la * 0.2));
    const stormD = ((lo - 200) / 26) ** 2 + ((la + 24) / 7) ** 2;
    g.buf[g.idx[k]] = stormD < 1 ? STORM[shade] : PLANET_BANDS[clamp(band, 0, 5)][shade];
  }
  g.gctx.putImageData(g.img, 0, 0);
  // ring: the far half behind the planet, the near half across it
  const ring = (front) => {
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      if (Math.sin(a) > 0 !== front) continue;
      const x = Math.round(cx + Math.cos(a) * (R + 9));
      const y = Math.round(cy + Math.sin(a) * 4 - Math.cos(a) * 3);
      fill(ctx, x, y, 1, 1, Math.cos(a) < -0.3 ? P.cream : P.fog);
    }
  };
  ring(false);
  ctx.drawImage(g.cv, Math.round(cx) - R - 2, Math.round(cy) - R - 2);
  ring(true);
}

// ---------------------------------------------------------------------------
// Animated diagonal stripes (also used by the full-screen cards)

const stripeTiles = new Map();
export function drawStripes(ctx, x, y, w, h, t, a = P.navy, b = P.ink) {
  const key = a + b;
  let tile = stripeTiles.get(key);
  if (!tile) {
    const p = new Pix(16, 16);
    for (let yy = 0; yy < 16; yy++) for (let xx = 0; xx < 16; xx++) p.px(xx, yy, ((xx - yy) & 15) < 8 ? b : a);
    tile = { cv: p.canvas(), pattern: null };
    stripeTiles.set(key, tile);
  }
  if (!tile.pattern) tile.pattern = ctx.createPattern(tile.cv, 'repeat');
  x = Math.round(x);
  y = Math.round(y);
  const off = Math.floor(t * 12) % 16;
  tile.pattern.setTransform(new DOMMatrix([1, 0, 0, 1, x + off, y]));
  ctx.fillStyle = tile.pattern;
  ctx.fillRect(x, y, Math.round(w), Math.round(h));
}

// ---------------------------------------------------------------------------
// The video wall

const CATEGORY = {
  world: { dark: P.navy, mid: P.blue, hi: P.cyan, label: 'WORLD' },
  tech: { dark: P.purple, mid: P.magenta, hi: P.pink, label: 'TECH' },
  science: { dark: P.darkGreen, mid: P.green, hi: P.cyan, label: 'SCIENCE' },
  business: { dark: P.maroon, mid: P.rust, hi: P.yellow, label: 'BUSINESS' },
  general: { dark: P.ink, mid: P.slate, hi: P.silver, label: 'NEWS' },
};

const wallState = { cv: null, ctx: null, prev: null, key: null, since: -Infinity, bg: new Map(), scan: null, glow: new WeakMap() };

function screenBg(th, kind) {
  const key = `${th.id}|${kind}`;
  let c = wallState.bg.get(key);
  if (c) return c;
  const { w, h } = WALL;
  const p = new Pix(w, h);
  p.vgrad(0, 0, w, h, th.screen, 1.4);
  if (kind === 'rundown') {
    p.rect(0, 0, w, 14, P.black);
    p.rect(0, 14, w, 1, th.led[1]);
  } else if (th.idle === 'chart') {
    for (let y = 30; y < h; y += 7) for (let x = 1; x < w; x += 3) p.px(x, y, P.ink);
  } else if (th.idle === 'planet') {
    const rand = mulberry32(5);
    for (let i = 0; i < 40; i++) p.px(Math.floor(rand() * w), Math.floor(rand() * h), rand() < 0.3 ? P.fog : P.slate);
  } else if (th.idle === 'globe') {
    for (let y = 4; y < h; y += 6) for (let x = 4; x < w; x += 6) p.over(x, y, P.blue, 0.3);
  }
  c = p.canvas();
  wallState.bg.set(key, c);
  return c;
}

function scanlines() {
  if (wallState.scan) return wallState.scan;
  const p = new Pix(WALL.w, WALL.h);
  for (let y = 1; y < WALL.h; y += 2) for (let x = 0; x < WALL.w; x++) p.over(x, y, P.black, 0.16);
  for (let x = 0; x < WALL.w; x++) p.over(x, 0, P.black, 0.3);
  wallState.scan = p.canvas();
  return wallState.scan;
}

const GLOW_CHOICES = [P.blue, P.navy, P.cyan, P.purple, P.magenta, P.red, P.orange, P.yellow, P.green, P.darkGreen, P.rust, P.steel, P.fog, P.cream];
/** The palette colour closest to an image's average, for the light it throws on the set. */
function imageGlow(img) {
  let c = wallState.glow.get(img);
  if (c) return c;
  c = P.blue;
  try {
    const d = img.getContext('2d').getImageData(0, 0, img.width, img.height).data;
    let R = 0;
    let G = 0;
    let B = 0;
    let n = 0;
    for (let i = 0; i < d.length; i += 16) {
      R += d[i];
      G += d[i + 1];
      B += d[i + 2];
      n++;
    }
    let best = Infinity;
    for (const hex of GLOW_CHOICES) {
      const [r2, g2, b2] = rgbOf(hex);
      const dist = (r2 - R / n) ** 2 + (g2 - G / n) ** 2 + (b2 - B / n) ** 2;
      if (dist < best) {
        best = dist;
        c = hex;
      }
    }
  } catch {
    /* tainted or not a canvas: keep the default glow */
  }
  wallState.glow.set(img, c);
  return c;
}

/** The two title lines for the idle screen: programme title, or a generic one. */
function idleTitle(scene) {
  const title = String(scene.program?.title || '').trim().toUpperCase();
  if (!title) return ['24 HOUR', 'NEWS'];
  const words = title.split(/\s+/);
  if (words.length === 1) return [title, ''];
  return [words.slice(0, -1).join(' '), words[words.length - 1]];
}

function titleLine(c, text, x, y, color) {
  if (!text) return;
  if (measureText(text) <= WALL.w - x - 3) drawText(c, text, x, y, { color, shadow: P.black });
  else tiny(c, text, x, y + 1, color);
}

function livePill(c, x, y, t) {
  const lw = measureText('LIVE') + 13;
  fill(c, x, y, lw, 11, P.red);
  fill(c, x, y + 10, lw, 1, P.darkRed);
  fill(c, x + 3, y + 4, 3, 3, Math.floor(t * 1.5) % 2 ? P.white : P.pink);
  drawText(c, 'LIVE', x + 9, y + 2, { color: P.white });
}

const BINARY = (() => {
  const rand = mulberry32(1010);
  return Array.from({ length: 13 }, (_, i) => ({
    x: 2 + i * 8,
    speed: 2 + rand() * 4,
    off: rand() * 62,
    bits: Array.from({ length: 9 }, () => (rand() < 0.45 ? '' : rand() < 0.5 ? '0' : '1')),
  }));
})();

const COUNTDOWN = (() => {
  const pts = [];
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
    pts.push([Math.round(Math.cos(a) * 16), Math.round(Math.sin(a) * 16)]);
  }
  return pts;
})();

function chartValue(n) {
  return clamp(0.28 + n * 0.0052 + 0.07 * Math.sin(n * 0.21) + 0.04 * Math.sin(n * 0.63 + 1) + (hash(n) - 0.5) * 0.05, 0.05, 0.95);
}

/** Idle screen: the programme's hero visual with its title and a LIVE tag. */
function wallIdle(c, scene, t, th) {
  const [l1, l2] = idleTitle(scene);
  const hasProgram = !!scene.program?.title;
  c.drawImage(screenBg(th, 'idle'), 0, 0);
  const hx = 24;
  const hy = 32;
  let tx = 50;
  let ty = 15;
  if (!hasProgram) {
    drawLogo(c, hx, hy - 14, { variant: 'mark', t, align: 'center' });
  } else if (th.idle === 'globe') {
    drawGlobe(c, hx, hy, 17, t);
  } else if (th.idle === 'chip') {
    for (const col of BINARY) {
      const shift = Math.floor((t * col.speed + col.off) % 63);
      col.bits.forEach((b, i) => b && tiny(c, b, col.x, ((i * 7 + shift) % 63) - 5, P.purple));
    }
    fill(c, hx - 10, hy - 10, 21, 21, P.black);
    fill(c, hx - 9, hy - 9, 19, 19, P.slate);
    fill(c, hx - 8, hy - 8, 17, 17, P.black);
    fill(c, hx - 4, hy - 4, 9, 9, th.led[0]);
    c.fillStyle = P.fog;
    for (let i = -7; i <= 7; i += 3) {
      c.fillRect(hx + i, hy - 13, 1, 3);
      c.fillRect(hx + i, hy + 11, 1, 3);
      c.fillRect(hx - 13, hy + i, 3, 1);
      c.fillRect(hx + 11, hy + i, 3, 1);
    }
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
    fill(c, hx - 2, hy - 2, 5, 5, pulse > 0.5 ? th.led[1] : th.led[0]);
    fill(c, hx - 1, hy - 1, 3, 3, pulse > 0.8 ? P.pink : th.led[1]);
    const run = Math.floor(t * 12) % 32;
    const s = (run % 8) - 4;
    const pos = [[hx + s, hy - 5], [hx + 5, hy + s], [hx - s, hy + 5], [hx - 5, hy - s]][Math.floor(run / 8)];
    fill(c, pos[0], pos[1], 1, 1, P.cyan);
  } else if (th.idle === 'planet') {
    for (let i = 0; i < 6; i++) {
      if (Math.sin(t * (0.7 + i * 0.3) + i * 2) > 0.6) fill(c, Math.floor(hash(i * 7) * 104), Math.floor(hash(i * 13) * 62), 1, 1, P.white);
    }
    drawPlanet(c, hx, hy, 12, t);
  } else if (th.idle === 'chart') {
    // a big rising chart that draws itself, holds, and starts again
    const n = Math.floor(clamp((t % 10) / 6, 0, 1) * WALL.w);
    let prev = null;
    let last = null;
    for (let x = 0; x < n; x++) {
      const y = 59 - Math.round(chartValue(x) * 28);
      fill(c, x, y + 1, 1, WALL.h - y - 1, P.darkGreen);
      const y0 = prev === null ? y : Math.min(prev, y);
      fill(c, x, y0, 1, Math.abs((prev ?? y) - y) + 1, P.green);
      prev = y;
      last = [x, y];
    }
    if (last && Math.floor(t * 3) % 2) fill(c, last[0] - 1, last[1] - 1, 3, 3, P.yellow);
    tx = 5;
    ty = 6;
  } else if (th.idle === 'countdown') {
    const left = 60 - (Math.floor(t) % 60);
    COUNTDOWN.forEach(([dx, dy], i) => fill(c, hx + dx, hy + dy, 1, 1, i < left ? (i % 5 === 0 ? P.yellow : P.orange) : P.ink));
    drawText(c, String(left).padStart(2, '0'), hx, hy - 4, { color: P.yellow, align: 'center' });
    tiny(c, 'SEC', hx, hy + 6, P.fog, 'center');
  }
  // title: a glitch now and then for the tech show
  const glitch = th.idle === 'chip' && hasProgram && t % 3.7 < 0.25;
  if (glitch) {
    titleLine(c, l1, tx - 1, ty, P.magenta);
    titleLine(c, l1, tx + 1, ty, P.cyan);
  }
  titleLine(c, l1, tx, ty, P.white);
  titleLine(c, l2, tx, ty + 10, hasProgram ? th.text : P.red);
  if (glitch) c.drawImage(wallState.cv, tx, ty + 2, 50, 2, tx + 2, ty + 2, 50, 2);
  if (th.idle === 'chart' && hasProgram) livePill(c, WALL.w - measureText('LIVE') - 18, 6, t);
  else livePill(c, tx, ty + 22, t);
}

function wallRundown(c, scene, t, th, solo) {
  const { w } = WALL;
  c.drawImage(screenBg(th, 'rundown'), 0, 0);
  tiny(c, 'TODAY', 4, 2, th.text);
  tiny(c, 'ON', 4, 8, th.text);
  const title = scene.program?.title;
  if (title) titleLine(c, title, 25, 4, P.white);
  else drawLogo(c, 25, 1, { variant: 'bug', t });
  const items = scene.rundown;
  const n = items.length;
  const per = 3.2;
  const idx = Math.floor(t / per) % n;
  const dt = t % per;
  const slide = Math.round((1 - easeOut(dt / 0.35)) * w);
  const out = dt > per - 0.25 ? Math.round(easeInOut((dt - (per - 0.25)) / 0.25) * -w) : 0;
  const ox = slide + out;
  fill(c, 5 + ox, 20, 10, 10, th.led[1]);
  fill(c, 5 + ox, 29, 10, 1, th.led[0]);
  drawText(c, String(idx + 1), 10 + ox, 22, { color: th.led[1] === P.yellow || th.led[1] === P.green ? P.black : P.white, align: 'center' });
  let lines = wrapText(items[idx]?.headline || '', w - 24);
  if (lines.length > 3) {
    lines = lines.slice(0, 3);
    let last = lines[2];
    while (last.length > 1 && measureText(`${last}...`) > w - 24) last = last.slice(0, -1).trimEnd();
    lines[2] = `${last}...`;
  }
  lines.forEach((line, i) => drawText(c, line, 19 + ox, 21 + i * 10, { color: P.white, shadow: P.black }));
  if (solo) return; // keep the bottom of the screen calm behind a solo presenter's head
  const shown = Math.min(n, 12);
  for (let i = 0; i < shown; i++) fill(c, 5 + i * 6, 53, 4, 2, i === idx % shown ? th.led[1] : P.slate);
  fill(c, 5, 57, w - 10, 1, P.ink);
  fill(c, 5, 57, Math.round((w - 10) * (dt / per)), 1, th.led[1]);
}

/** Small animated icon for each news category, centred on (cx, cy). */
function categoryIcon(c, cat, key, cx, cy, t) {
  if (key === 'world') {
    drawGlobe(c, cx, cy, 11, t);
    return;
  }
  if (key === 'tech') {
    fill(c, cx - 6, cy - 6, 13, 13, cat.hi);
    fill(c, cx - 5, cy - 5, 11, 11, P.black);
    fill(c, cx - 3, cy - 3, 7, 7, cat.dark);
    fill(c, cx - 1, cy - 1, 3, 3, Math.floor(t * 3) % 2 ? P.white : cat.hi);
    c.fillStyle = P.fog;
    for (let i = -4; i <= 4; i += 2) {
      c.fillRect(cx + i, cy - 9, 1, 3);
      c.fillRect(cx + i, cy + 7, 1, 3);
      c.fillRect(cx - 9, cy + i, 3, 1);
      c.fillRect(cx + 7, cy + i, 3, 1);
    }
    return;
  }
  if (key === 'science') {
    for (let o = 0; o < 3; o++) {
      const ang = (o * Math.PI) / 3;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      c.fillStyle = cat.mid;
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        const ex = Math.cos(a) * 10;
        const ey = Math.sin(a) * 3.5;
        c.fillRect(cx + Math.round(ex * ca - ey * sa), cy + Math.round(ex * sa + ey * ca), 1, 1);
      }
      const a = t * 2.4 + o * 2.1;
      const ex = Math.cos(a) * 10;
      const ey = Math.sin(a) * 3.5;
      fill(c, cx + Math.round(ex * ca - ey * sa) - 1, cy + Math.round(ex * sa + ey * ca) - 1, 2, 2, P.white);
    }
    fill(c, cx - 1, cy - 2, 3, 5, cat.hi);
    fill(c, cx - 2, cy - 1, 5, 3, cat.hi);
    fill(c, cx - 1, cy - 1, 1, 1, P.white);
    return;
  }
  if (key === 'business') {
    for (let i = 0; i < 4; i++) {
      const bh = 4 + i * 3 + Math.round(1.5 * Math.sin(t * 1.7 + i * 1.3));
      fill(c, cx - 8 + i * 4, cy + 8 - bh, 3, bh, cat.mid);
      fill(c, cx - 8 + i * 4, cy + 8 - bh, 3, 1, cat.hi);
    }
    c.fillStyle = P.white;
    linePts(cx - 9, cy + 1, cx + 6, cy - 8, (x, y) => c.fillRect(x, y, 1, 1));
    fill(c, cx + 3, cy - 8, 4, 1, P.white);
    fill(c, cx + 6, cy - 8, 1, 4, P.white);
    return;
  }
  // general: a folded newspaper
  fill(c, cx - 8, cy - 7, 16, 14, P.silver);
  fill(c, cx - 8, cy - 7, 16, 3, P.white);
  fill(c, cx - 6, cy - 6, 12, 1, P.black);
  fill(c, cx - 6, cy - 2, 5, 5, cat.mid);
  c.fillStyle = P.steel;
  for (let i = 0; i < 4; i++) c.fillRect(cx, cy - 2 + i * 2, 6, 1);
  c.fillRect(cx - 6, cy + 5, 12, 1);
  fill(c, cx + 8, cy - 6, 1, 14, P.steel);
}

function wallSource(c, wall, t, solo) {
  const { w, h } = WALL;
  const key = CATEGORY[wall.category] ? wall.category : 'general';
  const cat = CATEGORY[key];
  drawStripes(c, 0, 0, w, h, t * 0.5, P.black, cat.dark);
  c.fillStyle = rgba(P.black, 0.45);
  c.fillRect(0, 0, w, h);
  const cx = 19;
  const cy = 29;
  c.fillStyle = cat.dark;
  for (let yy = -13; yy <= 13; yy++) {
    const half = Math.floor(Math.sqrt(169 - yy * yy));
    c.fillRect(cx - half, cy + yy, half * 2 + 1, 1);
  }
  c.fillStyle = cat.mid;
  for (let yy = -13; yy <= 13; yy++) {
    const half = Math.floor(Math.sqrt(169 - yy * yy));
    const prev = Math.floor(Math.sqrt(Math.max(0, 169 - (Math.abs(yy) + 1) ** 2)));
    c.fillRect(cx - half, cy + yy, Math.max(1, half - prev), 1);
    c.fillRect(cx + half - Math.max(1, half - prev) + 1, cy + yy, Math.max(1, half - prev), 1);
  }
  categoryIcon(c, cat, key, cx, cy, t);
  const tx = 38;
  tiny(c, 'SOURCE', tx, 7, P.fog);
  const lines = wrapText(wall.source || '', w - tx - 3).slice(0, 2);
  lines.forEach((line, i) => drawText(c, line, tx, 16 + i * 10, { color: P.white, shadow: P.black }));
  const label = (CATEGORY[wall.category] ? cat.label : wall.category || cat.label).toUpperCase();
  const lw = measureText(label) + 8;
  const ly = lines.length > 1 ? 39 : 31;
  fill(c, tx, ly, lw, 11, cat.mid);
  fill(c, tx, ly, 2, 11, cat.hi);
  fill(c, tx, ly + 10, lw, 1, cat.dark);
  drawText(c, label, tx + 5, ly + 2, { color: P.white, shadow: cat.dark });
  if (solo) return;
  fill(c, 0, h - 5, w, 1, cat.dark);
  const sx = Math.floor((t * 40) % (w + 30)) - 30;
  fill(c, sx, h - 5, 30, 1, cat.mid);
  fill(c, sx + 22, h - 5, 8, 1, cat.hi);
}

function wallGlowColor(wall, scene, th) {
  const img = wall.storyId && scene.images?.get(wall.storyId);
  if (wall.mode === 'image' && img?.small) return imageGlow(img.small);
  if (wall.mode === 'source') return (CATEGORY[wall.category] || CATEGORY.general).mid;
  return th.glow;
}

function drawWallContent(ctx, wall, scene, t, th, solo) {
  if (!wallState.cv) {
    wallState.cv = makeCanvas(WALL.w, WALL.h);
    wallState.ctx = wallState.cv.getContext('2d');
    wallState.prev = makeCanvas(WALL.w, WALL.h);
  }
  const c = wallState.ctx;
  // when the content changes, keep the old frame for a quick pixel wipe
  const key = `${wall.mode}|${wall.storyId ?? ''}|${wall.source ?? ''}|${wall.category ?? ''}|${th.id}|${scene.program?.title ?? ''}`;
  if (wallState.key !== null && key !== wallState.key) {
    const pc = wallState.prev.getContext('2d');
    pc.clearRect(0, 0, WALL.w, WALL.h);
    pc.drawImage(wallState.cv, 0, 0);
    wallState.since = t;
  }
  wallState.key = key;
  const img = wall.storyId && scene.images?.get(wall.storyId);
  if (wall.mode === 'image' && img?.small) {
    fill(c, 0, 0, WALL.w, WALL.h, P.black);
    c.drawImage(img.small, 0, 0);
  } else if (wall.mode === 'rundown' && scene.rundown?.length) {
    wallRundown(c, scene, t, th, solo);
  } else if (wall.mode === 'source') {
    wallSource(c, wall, t, solo);
  } else {
    wallIdle(c, scene, t, th);
  }
  const wipe = (t - wallState.since) / 0.4;
  if (wipe >= 0 && wipe < 1) {
    for (let by = 0; by < WALL.h; by += 4) {
      for (let bx = 0; bx < WALL.w; bx += 4) {
        if ((bx / WALL.w) * 0.65 + hash(bx * 31 + by * 7) * 0.35 > wipe) c.drawImage(wallState.prev, bx, by, 4, 4, bx, by, 4, 4);
      }
    }
  }
  c.drawImage(scanlines(), 0, 0);
  if (solo) {
    // darken the strip of screen behind a solo presenter's head
    for (const [y, h, a] of [[48, 4, 0.12], [52, 4, 0.25], [56, 6, 0.42]]) fill(c, 0, y, WALL.w, h, rgba(P.black, a));
  }
  // a glint of studio light sliding across the glass now and then
  const g = t % 13;
  if (g < 0.7) {
    const pos = Math.round(easeInOut(g / 0.7) * (WALL.w + 40)) - 32;
    for (let y = 0; y < WALL.h; y++) {
      const x = pos + Math.floor(y / 2);
      fill(c, x - 3, y, 3, 1, rgba(P.white, 0.07));
      fill(c, x, y, 1, 1, rgba(P.white, 0.4));
      fill(c, x + 4, y, 1, 1, rgba(P.white, 0.15));
    }
  }
  ctx.drawImage(wallState.cv, WALL.x, WALL.y);
}

/** Coloured light the video wall spills onto the globe around its bezel. */
function drawWallHalo(ctx, color, t) {
  const x0 = WALL.x - 4;
  const y0 = WALL.y - 4;
  const x1 = WALL.x + WALL.w + 4;
  const y1 = WALL.y + WALL.h + 4;
  const breathe = 1 + 0.12 * Math.sin(t * 1.3);
  let d = 0;
  for (const [th, a] of [[2, 0.18], [3, 0.1], [5, 0.045]]) {
    ctx.fillStyle = rgba(color, a * breathe);
    const top = Math.max(10, y0 - d - th);
    ctx.fillRect(x0 - d, top, x1 - x0 + 2 * d, y0 - d - top);
    ctx.fillRect(x0 - d, y1 + d, x1 - x0 + 2 * d, th);
    ctx.fillRect(x0 - d - th, y0 - d, th, y1 - y0 + 2 * d);
    ctx.fillRect(x1 + d, y0 - d, th, y1 - y0 + 2 * d);
    d += th;
  }
}

// ---------------------------------------------------------------------------

const current = { th: THEMES.world, glow: P.blue };

export function drawSet(ctx, t, scene) {
  const wall = scene.wall || { mode: 'logo' };
  const th = themeOf(scene);
  const solo = scene.cast ? !scene.cast.B : !!th.solo;
  ctx.drawImage(background(th), 0, 0);
  drawSetLife(ctx, t, th);
  const glow = wallGlowColor(wall, scene, th);
  drawWallHalo(ctx, glow, t);
  drawWallContent(ctx, wall, scene, t, th, solo);
  drawPracticals(ctx, t);
  drawFloorSheen(ctx, t, glow);
  current.th = th;
  current.glow = glow;
}

// ---------------------------------------------------------------------------
// The anchor desk: a curved news desk bowing towards the camera. Its top edge
// is an arc that sits exactly on DESK_Y under both presenters (where their
// hands rest) and rises as the ends curve away; the floor line curves more.

const DESK = { x0: 36, x1: 347, half: 156 };
const deskDx = (x) => x + 0.5 - 192;
const ANCHOR_D2 = (ANCHOR_X.B - ANCHOR_X.A) ** 2 / 4;
const deskTop = (x) => DESK_Y + Math.round((ANCHOR_D2 - deskDx(x) ** 2) / ANCHOR_D2);
const deskBot = (x) => 155 + Math.round(((ANCHOR_D2 - deskDx(x) ** 2) * 8) / (DESK.half ** 2 - ANCHOR_D2));
const DESK_BOT = deskBot(192);
// runs of equal desk-top height, for per-frame strokes along the arc
const DESK_RUNS = (() => {
  const runs = [];
  for (let x = DESK.x0; x <= DESK.x1;) {
    const top = deskTop(x);
    let x2 = x + 1;
    while (x2 <= DESK.x1 && deskTop(x2) === top) x2++;
    runs.push([x, x2 - x, top]);
    x = x2;
  }
  return runs;
})();

let deskLayer = null;
function desk() {
  if (deskLayer) return deskLayer;
  const p = new Pix(W, H);
  for (let x = DESK.x0; x <= DESK.x1; x++) {
    const e = Math.min(1, Math.abs(deskDx(x)) / DESK.half); // 0 centre .. 1 ends
    const top = deskTop(x);
    const bot = deskBot(x);
    // glossy top surface + bevelled front edge
    p.px(x, top, P.slate);
    p.px(x, top + 1, P.steel);
    p.px(x, top + 2, P.steel);
    p.px(x, top + 3, e > 0.93 ? P.steel : P.fog);
    p.px(x, top + 4, e > 0.93 ? P.fog : P.silver);
    p.px(x, top + 5, P.black);
    // LED channel (the light itself is drawn per frame in the theme accent)
    p.px(x, top + 6, P.black);
    p.px(x, top + 7, P.ink);
    p.px(x, top + 8, P.black);
    // front face: lacquered dark panel catching a soft band of light
    const f0 = top + 9;
    const f1 = bot - 5;
    const sheen = Math.exp(-(((e - 0.62) / 0.08) ** 2)) * 0.8;
    p.shade(x, f0, 1, f1 - f0 + 1, [P.steel, P.slate, P.ink, P.black], (xx, y) => {
      const v = (y - f0) / Math.max(1, f1 - f0);
      return 1.15 + v * 1.1 + e ** 2.2 * 0.9 - sheen * (1 - v * 0.7);
    }, 3);
    p.px(x, bot - 4, e > 0.8 ? P.ink : P.slate);
    p.rect(x, bot - 3, 1, 4, P.black);
  }
  // two seams per side, spaced as on a curved surface
  for (const deg of [45, 68]) {
    const d = Math.round(DESK.half * Math.sin((deg * Math.PI) / 180));
    for (const [x, hi] of [[192 - d, 1], [191 + d, -1]]) {
      const top = deskTop(x) + 9;
      const len = deskBot(x) - 5 - top;
      p.rect(x, top, 1, len, P.black);
      p.rect(x + hi, top, 1, len, P.slate);
    }
  }
  // rounded desk ends
  for (const [x, c1, c2] of [[DESK.x0, P.slate, P.steel], [DESK.x1, P.black, P.ink]]) {
    const top = deskTop(x);
    p.rect(x, top, 1, deskBot(x) - top + 1, c1);
    p.rect(x, top + 1, 1, 4, c2);
  }
  // reflection in the glossy floor + contact shadow
  for (let x = DESK.x0 - 4; x <= DESK.x1 + 4; x++) {
    const inside = x >= DESK.x0 && x <= DESK.x1;
    const bot = deskBot(clamp(x, DESK.x0, DESK.x1));
    if (inside) {
      for (let i = 0; i < 20; i++) p.over(x, bot + 1 + i, p.get(x, bot - 4 - i), 0.3 * (1 - i / 20) ** 1.3);
    }
    const edge = inside ? 1 : 0.4;
    p.over(x, bot + 1, P.black, 0.6 * edge);
    p.over(x, bot + 2, P.black, 0.35 * edge);
    p.over(x, bot + 3, P.black, 0.15 * edge);
  }
  // vignette (stepped, kept to the corners so close-ups are unaffected)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const nx = (x + 0.5 - W / 2) / (W / 2);
      const ny = (y + 0.5 - H / 2) / (H / 2);
      const a = Math.floor(clamp((nx * nx * 0.55 + ny * ny * 0.45 - 0.62) / 0.38, 0, 1) ** 1.3 * 5) * 0.08;
      if (a > 0) p.over(x, y, P.black, a);
    }
  }
  deskLayer = p.canvas();
  return deskLayer;
}

const panels = new Map();
/** Black-glass plate on the desk front carrying the channel logo (or name). */
function logoPanel(channel) {
  let pl = panels.get(channel);
  if (pl) return pl;
  const useLogo = !channel || normalizeText(channel) === normalizeText(CHANNEL_NAME);
  const size = useLogo ? measureLogo({ variant: 'full', scale: 1 }) : { w: measureText(channel, 2), h: 15 };
  const pw = size.w + 12;
  const ph = size.h + 4;
  const x = Math.floor((W - pw) / 2);
  const y = deskTop(192) + 6;
  const p = new Pix(pw, ph);
  p.rect(0, 0, pw, ph, P.black);
  p.rect(1, 0, pw - 2, 1, P.steel);
  p.rect(0, 1, 1, ph - 2, P.slate);
  p.rect(pw - 1, 1, 1, ph - 2, P.ink);
  p.rect(1, 1, pw - 2, 1, P.ink);
  const bg = p.canvas();
  // its reflection on the floor, built from the finished plate
  const full = makeCanvas(pw, ph);
  const fc = full.getContext('2d');
  fc.drawImage(bg, 0, 0);
  const lx = Math.floor((pw - size.w) / 2);
  const ly = 2;
  if (useLogo) drawLogo(fc, lx, ly, { variant: 'full' });
  else drawText(fc, channel, pw / 2, ly + 4, { color: P.white, scale: 2, align: 'center', shadow: P.darkRed });
  const src = new Uint32Array(fc.getImageData(0, 0, pw, ph).data.buffer);
  const ry = 2 * DESK_BOT + 1 - (y + ph - 1);
  const rp = new Pix(pw, ph);
  for (let j = 0; j < ph; j++) {
    const a = 0.24 * clamp(1 - (ry + j - DESK_BOT) / 30, 0, 1);
    for (let i = 0; i < pw; i++) rp.over(i, j, src[(ph - 1 - j) * pw + i], a);
  }
  pl = { bg, full, refl: rp.canvas(), useLogo, x, y, w: pw, h: ph, lx: x + lx, ly: y + ly, ry };
  panels.set(channel, pl);
  return pl;
}

export function drawDesk(ctx, t, channel, withLogo = true) {
  const { th, glow } = current;
  ctx.drawImage(desk(), 0, 0);
  // light from the video wall pooling on the desk top
  for (const [x0, x1, a] of [[118, 266, 0.1], [136, 248, 0.12], [156, 228, 0.12]]) {
    ctx.fillStyle = rgba(glow, a);
    for (const [x, w, top] of DESK_RUNS) {
      const s = Math.max(x, x0);
      const e = Math.min(x + w, x1);
      if (e > s) ctx.fillRect(s, top, e - s, 5);
    }
  }
  // accent LED line under the desk top, with an occasional pulse outwards
  ctx.fillStyle = th.led[0];
  for (const [x, w, top] of DESK_RUNS) ctx.fillRect(x, top + 7, w, 1);
  const lp = t % 7;
  if (lp < 1.8) {
    const d = Math.floor(easeOut(lp / 1.8) * 170);
    for (let j = 0; j < 16; j++) {
      const a = 1 - j / 16;
      for (const x of [192 + d - j, 191 - d + j]) {
        if (x < DESK.x0 || x > DESK.x1) continue;
        fill(ctx, x, deskTop(x) + 7, 1, 1, j < 2 ? P.white : rgba(th.led[2], a));
      }
    }
  }
  // a specular highlight gliding along the desk edge
  const st = t % 11;
  if (st < 1.6) {
    const sx = Math.round(DESK.x0 + easeInOut(st / 1.6) * (DESK.x1 - DESK.x0));
    for (let dx = -6; dx <= 6; dx++) {
      const x = sx + dx;
      if (x < DESK.x0 || x > DESK.x1) continue;
      const a = 1 - Math.abs(dx) / 7;
      fill(ctx, x, deskTop(x) + 4, 1, 1, rgba(P.white, 0.9 * a));
      fill(ctx, x, deskTop(x) + 1, 1, 3, rgba(P.white, 0.22 * a));
    }
  }
  if (!withLogo) return;
  const pl = logoPanel(channel);
  ctx.drawImage(pl.refl, pl.x, pl.ry);
  if (pl.useLogo) {
    ctx.drawImage(pl.bg, pl.x, pl.y);
    drawLogo(ctx, pl.lx, pl.ly, { variant: 'full', t });
  } else {
    ctx.drawImage(pl.full, pl.x, pl.y);
  }
}

// ---------------------------------------------------------------------------
// Bake the static layers in idle time, one slice per idle callback, so neither
// the first studio frame nor a change of programme stutters.
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const jobs = [
    () => base(),
    () => desk(),
    () => landTexture(),
    () => logoPanel(CHANNEL_NAME),
    ...Object.values(THEMES).map((th) => () => background(th)),
  ];
  const idle = window.requestIdleCallback || ((fn) => setTimeout(() => fn({ timeRemaining: () => 0 }), 120));
  const next = () => {
    const job = jobs.shift();
    if (!job) return;
    try {
      job();
    } catch {
      /* a failed warm-up is retried lazily on first use */
    }
    idle(next, { timeout: 1500 });
  };
  idle(next, { timeout: 1500 });
}
