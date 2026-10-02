// The studio set: lighting rig, back wall, London / world-city windows, side
// monitors, world clocks, the big video wall and the anchor desk. Presenters
// are drawn by anchors.js between drawSet() and drawDesk().
//
// Everything is integer pixels in the channel palette (plus a few deliberate
// alpha washes for light, glow and reflections). Static scenery is rendered
// once into lazily created offscreen layers; each frame only redraws what
// moves: LEDs, beams, screens, clocks and the life in the city windows.
import { P } from './palette.js';
import { drawText, measureText, wrapText } from './font.js';
import { mulberry32, zoneTime, clamp, easeOut, easeInOut } from './util.js';

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

/** Integer points of a 1-px circle outline (midpoint algorithm). */
function circlePts(R) {
  const seen = new Set();
  const pts = [];
  let x = R;
  let y = 0;
  let err = 1 - R;
  const add = (a, b) => {
    const k = `${a},${b}`;
    if (!seen.has(k)) {
      seen.add(k);
      pts.push([a, b]);
    }
  };
  while (x >= y) {
    add(x, y); add(y, x); add(-y, x); add(-x, y);
    add(-x, -y); add(-y, -x); add(y, -x); add(x, -y);
    y++;
    if (err < 0) err += 2 * y + 1;
    else {
      x--;
      err += 2 * (y - x) + 1;
    }
  }
  return pts;
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

  line(x0, y0, x1, y1, hex, every = 1) {
    linePts(x0, y0, x1, y1, (x, y, i) => i % every === 0 && this.px(x, y, hex));
  }

  canvas() {
    const c = makeCanvas(this.w, this.h);
    c.getContext('2d').putImageData(this.img, 0, 0);
    return c;
  }
}

// ---------------------------------------------------------------------------
// 3x5 micro font for small labels on monitors and clocks

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
  '+': '...|.#.|###|.#.|...', '/': '..#|..#|.#.|#..|#..', '%': '#.#|..#|.#.|#..|#.#',
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
    const w = Math.max(1, tinyWidth(text));
    c = makeCanvas(w, 5);
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
  const w = c.width;
  const dx = Math.round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x);
  ctx.drawImage(c, dx, Math.round(y));
  return w;
}

// ---------------------------------------------------------------------------
// Real-world time (Intl formatting is cached once per second)

const ZONES = [
  ['LONDON', undefined], // studio time zone (util.STUDIO_TZ)
  ['NEW YORK', 'America/New_York'],
  ['TOKYO', 'Asia/Tokyo'],
];
let timeCache = { key: NaN };
function times() {
  const now = Date.now();
  const key = Math.floor(now / 1000);
  if (key !== timeCache.key) {
    timeCache = { key, sec: ((key % 60) + 60) % 60, utc: (now / 3600000) % 24, zones: ZONES.map(([, tz]) => zoneTime(tz)) };
  }
  return timeCache;
}

function phaseOf(hour) {
  if (hour >= 8 && hour < 18) return 'day';
  if (hour >= 18 && hour < 21) return 'dusk';
  if (hour >= 6 && hour < 8) return 'dawn';
  return 'night';
}

// Colour scripts for the city windows by London time of day.
const THEMES = {
  day: {
    sky: [P.blue, P.blue, P.cyan, P.silver], sharp: 2.4,
    far: P.fog, mid: P.steel, near: P.slate, hi: P.fog, lo: P.ink,
    lit: 0.08, litA: P.silver, litB: P.cyan,
    water: [P.navy, P.blue], glint: P.white,
    tower: [P.tan, P.cream, P.tanShade], face: P.white, hands: P.black,
    eye: P.white, spoke: P.silver, pod: P.silver, shard: [P.silver, P.fog],
    cloud: [P.white, P.silver], lamps: null, road: P.slate,
  },
  dusk: {
    sky: [P.purple, P.magenta, P.pink, P.orange, P.yellow], sharp: 2.2,
    far: P.magenta, mid: P.purple, near: P.maroon, hi: P.rust, lo: P.black,
    lit: 0.22, litA: P.yellow, litB: P.orange,
    water: [P.purple, P.maroon], glint: P.orange,
    tower: [P.maroon, P.rust, P.black], face: P.cream, hands: P.maroon,
    eye: P.cream, spoke: P.pink, pod: P.yellow, shard: [P.pink, P.purple],
    cloud: [P.pink, P.magenta], sun: [P.yellow, P.cream], lamps: P.yellow, road: P.maroon,
  },
  dawn: {
    sky: [P.ink, P.purple, P.pink, P.cream], sharp: 2.2,
    far: P.purple, mid: P.maroon, near: P.ink, hi: P.pink, lo: P.black,
    lit: 0.16, litA: P.yellow, litB: P.cream,
    water: [P.ink, P.purple], glint: P.pink,
    tower: [P.brown, P.tan, P.maroon], face: P.cream, hands: P.maroon,
    eye: P.silver, spoke: P.fog, pod: P.cream, shard: [P.pink, P.purple],
    cloud: [P.cream, P.pink], sunR: [P.yellow, P.cream], lamps: P.yellow, road: P.ink,
  },
  night: {
    sky: [P.black, P.black, P.ink, P.navy], sharp: 1.6,
    far: P.slate, mid: P.ink, near: P.black, hi: P.slate, lo: P.black,
    lit: 0.34, litA: P.yellow, litB: P.cream,
    water: [P.black, P.ink], glint: P.yellow,
    tower: [P.tanShade, P.tan, P.brown], face: P.cream, hands: P.black,
    eye: P.magenta, spoke: P.purple, pod: P.cyan, shard: [P.ink, P.black],
    cloud: null, stars: true, bokeh: true, moon: true, lamps: P.yellow, road: P.ink,
  },
};

// ---------------------------------------------------------------------------
// City windows (left: London, right: a generic world city)

const WIN = { w: 84, h: 54, L: { x: 12, y: 20 }, R: { x: 288, y: 20 } };
const EYE = { cx: 57, cy: 25, R: 15 };

function buildSky(side, th) {
  const p = new Pix(WIN.w, WIN.h);
  p.vgrad(0, 0, WIN.w, WIN.h - 4, th.sky, th.sharp);
  p.rect(0, WIN.h - 4, WIN.w, 4, th.sky[th.sky.length - 1]);
  const disc = (cx, cy, R, [outer, inner]) => {
    for (let y = -R; y <= R; y++) {
      for (let x = -R; x <= R; x++) {
        const d = x * x + y * y;
        if (d <= R * R + R * 0.6) p.px(cx + x, cy + y, d <= (R - 2) * (R - 2) ? inner : outer);
        else if (d <= (R + 2) * (R + 2)) p.over(cx + x, cy + y, outer, 0.3);
      }
    }
  };
  if (th.sun && side === 'L') disc(16, 37, 7, th.sun); // sinking behind Westminster
  if (th.sunR && side === 'R') disc(58, 44, 5, th.sunR);
  if (th.moon && side === 'R') {
    disc(60, 9, 4, [P.cream, P.cream]);
    for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) if (x * x + y * y <= 17) p.px(62 + x, 8 + y, th.sky[0]);
  }
  return p.canvas();
}

/** Grid of lit windows on a building face; returns unlit slots for flicker. */
function litWindows(p, rand, x, top, w, bottom, th, slots) {
  for (let y = top + 2; y < bottom - 1; y += 3) {
    for (let xx = x + 1; xx < x + w - 1; xx += 2) {
      const v = rand();
      if (v < th.lit) p.px(xx, y, v < th.lit * 0.35 ? th.litB : th.litA);
      else if (v > 0.93 && slots.length < 24) slots.push([xx, y]);
    }
  }
}

function block(p, x, top, w, bottom, th, color = th.near) {
  p.rect(x, top, w, bottom - top, color);
  p.rect(x, top, 1, bottom - top, th.hi);
  p.rect(x + w - 1, top, 1, bottom - top, th.lo);
}

function buildLondon(th) {
  const p = new Pix(WIN.w, WIN.h);
  const rand = mulberry32(1851);
  const G = 47;
  const slots = [];
  // distant haze city
  for (let x = -2; x < WIN.w;) {
    const bw = 3 + Math.floor(rand() * 6);
    const bh = 5 + Math.floor(rand() * 11);
    p.rect(x, G - bh, bw, bh, th.far);
    x += bw;
  }
  // middle distance blocks
  for (const [x, w, h] of [[36, 6, 14], [41, 5, 9], [64, 7, 16], [70, 4, 11], [12, 6, 13], [24, 7, 15]]) {
    p.rect(x, G - h, w, h, th.mid);
    litWindows(p, rand, x, G - h, w, G, th, slots);
  }
  // Victoria Tower
  block(p, 1, 20, 7, G, th);
  p.rect(1, 17, 1, 3, th.near);
  p.rect(7, 17, 1, 3, th.near);
  p.rect(4, 18, 1, 2, th.near);
  p.rect(4, 12, 1, 6, th.lo);
  p.rect(5, 12, 2, 2, P.red);
  for (let y = 23; y < 44; y += 5) {
    p.rect(3, y, 1, 3, th.lo);
    p.rect(5, y, 1, 3, th.lo);
  }
  // Palace of Westminster
  p.rect(8, 37, 21, G - 37, th.near);
  p.rect(8, 37, 21, 1, th.hi);
  for (let x = 9; x < 29; x += 2) p.rect(x, 40, 1, G - 42, th.lo);
  for (let x = 8; x < 29; x += 3) p.rect(x, 35, 1, 2, th.near);
  litWindows(p, rand, 8, 37, 21, G, { ...th, lit: th.lit * 0.6 }, slots);
  p.rect(17, 30, 3, 7, th.near); // central lantern
  p.px(17, 30, th.hi);
  p.rect(18, 25, 1, 5, th.near);
  // Elizabeth Tower (Big Ben)
  const [tw, thi, tlo] = th.tower;
  p.rect(30, 21, 5, G - 21, tw);
  p.rect(30, 21, 1, G - 21, thi);
  p.rect(34, 21, 1, G - 21, tlo);
  p.rect(32, 23, 1, G - 25, tlo);
  for (let y = 24; y < G; y += 6) p.rect(31, y, 3, 1, thi);
  p.rect(29, 14, 7, 7, tw); // clock stage
  p.rect(29, 14, 1, 7, thi);
  p.rect(35, 14, 1, 7, tlo);
  p.rect(30, 15, 5, 5, th.face);
  for (const [x, y] of [[30, 15], [34, 15], [30, 19], [34, 19]]) p.px(x, y, tw);
  p.rect(30, 10, 5, 4, tw); // belfry
  p.px(31, 11, tlo);
  p.px(33, 11, tlo);
  p.px(31, 12, tlo);
  p.px(33, 12, tlo);
  p.rect(29, 12, 1, 2, tw);
  p.rect(35, 12, 1, 2, tw);
  p.rect(31, 7, 3, 3, tw); // roof + spire
  p.px(31, 8, thi);
  p.rect(32, 4, 1, 3, tw);
  p.rect(32, 2, 1, 2, thi);
  // London Eye: legs, spokes, rim, hub
  p.line(EYE.cx, EYE.cy, EYE.cx - 6, G - 1, th.near);
  p.line(EYE.cx, EYE.cy, EYE.cx + 5, G - 1, th.near);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    p.line(EYE.cx, EYE.cy, EYE.cx + Math.cos(a) * (EYE.R - 1), EYE.cy + Math.sin(a) * (EYE.R - 1), th.spoke, 2);
  }
  for (const [x, y] of circlePts(EYE.R)) p.px(EYE.cx + x, EYE.cy + y, th.eye);
  p.rect(EYE.cx - 1, EYE.cy - 1, 3, 3, th.eye);
  p.rect(EYE.cx - 7, G - 2, 15, 2, th.near); // pier
  // The Shard
  const [sa, sb] = th.shard;
  for (let y = 4; y < G; y++) {
    const hw = Math.round(((y - 3) * 5) / 43);
    p.rect(78 - hw, y, hw + 1, 1, sa);
    p.rect(79, y, hw, 1, sb);
  }
  p.px(78, 5, th.sky[0]);
  p.px(78, 6, th.sky[0]);
  p.px(78, 3, sa);
  for (let y = 14; y < G - 2; y += 4) for (let x = 76; x < 82; x += 2) if (rand() < th.lit) p.px(x, y, th.litB);
  // embankment + river
  p.rect(0, G, WIN.w, 1, th.near);
  p.vgrad(0, G + 1, WIN.w, WIN.h - G - 1, th.water, 1.6);
  if (th.lamps) for (let x = 2; x < WIN.w; x += 6) p.px(x, G - 1, th.lamps);
  return { city: p.canvas(), slots };
}

function buildCity(th) {
  const p = new Pix(WIN.w, WIN.h);
  const rand = mulberry32(2026);
  const G = 46;
  const slots = [];
  for (let x = -2; x < WIN.w;) {
    const bw = 3 + Math.floor(rand() * 6);
    const bh = 8 + Math.floor(rand() * 16);
    p.rect(x, G - bh, bw, bh, th.far);
    if (rand() < 0.25) p.rect(x + 1, G - bh - 3, 1, 3, th.far);
    x += bw;
  }
  for (let x = 0; x < WIN.w;) {
    const bw = 5 + Math.floor(rand() * 5);
    const bh = 10 + Math.floor(rand() * 16);
    p.rect(x, G - bh, bw, bh, th.mid);
    litWindows(p, rand, x, G - bh, bw, G, th, slots);
    x += bw + 2 + Math.floor(rand() * 5);
  }
  // antenna block
  block(p, 2, 18, 8, G, th);
  p.rect(5, 12, 1, 6, th.near);
  litWindows(p, rand, 2, 18, 8, G, th, slots);
  // art-deco spire
  block(p, 12, 24, 11, G, th);
  block(p, 14, 16, 7, 24, th);
  block(p, 16, 11, 3, 16, th);
  p.rect(17, 4, 1, 7, th.hi);
  litWindows(p, rand, 12, 24, 11, G, th, slots);
  // slanted glass slab
  for (let x = 24; x < 32; x++) {
    const top = 14 + Math.floor((x - 24) / 2);
    p.rect(x, top, 1, G - top, x === 24 ? th.hi : x === 31 ? th.lo : th.near);
  }
  litWindows(p, rand, 24, 19, 8, G, th, slots);
  // TV tower
  p.rect(35, 12, 2, G - 12, th.near);
  p.px(35, 20, th.hi);
  p.rect(33, 15, 6, 1, th.near);
  p.rect(32, 16, 8, 2, th.near);
  p.rect(33, 18, 6, 1, th.near);
  p.rect(32, 16, 1, 2, th.hi);
  p.rect(34, 11, 4, 2, th.near);
  p.rect(35, 2, 1, 9, th.near);
  p.rect(33, 17, 6, 1, th.litA);
  // twisting tower
  for (let y = 8; y < G; y++) {
    const off = Math.round(Math.sin(y / 7) * 1.2);
    const x0 = 42 + off;
    p.rect(x0, y, 10, 1, th.near);
    p.px(x0 + (((y >> 1) + 0) % 8) + 1, y, th.hi);
    p.px(x0 + 9, y, th.lo);
  }
  litWindows(p, rand, 42, 10, 10, G, th, slots);
  // crowned block
  block(p, 53, 22, 8, G, th);
  p.rect(55, 19, 4, 3, th.near);
  p.px(56, 17, th.near);
  p.px(56, 18, th.near);
  litWindows(p, rand, 53, 22, 8, G, th, slots);
  // tower with a construction crane
  block(p, 63, 16, 13, G, th);
  litWindows(p, rand, 63, 16, 13, G, th, slots);
  for (let y = 3; y < 16; y++) p.px(72 + (y & 1), y, th.near);
  p.rect(60, 2, 24, 1, th.near);
  p.rect(74, 3, 3, 2, th.near);
  p.rect(62, 3, 1, 6, th.lo);
  block(p, 77, 28, 7, G, th);
  litWindows(p, rand, 77, 28, 7, G, th, slots);
  // elevated highway + harbour
  p.rect(0, G + 1, WIN.w, 1, th.hi);
  p.rect(0, G + 2, WIN.w, 1, th.near);
  p.vgrad(0, G + 3, WIN.w, WIN.h - G - 3, th.water, 1.6);
  for (let x = 6; x < WIN.w; x += 14) p.rect(x, G + 3, 2, WIN.h - G - 3, th.near);
  return { city: p.canvas(), slots };
}

const CLOUDS = [
  { blobs: [[5, 5, 3], [10, 4, 4], [15, 5, 3], [19, 6, 2]], speed: 0.45, y: 4, off: 10 },
  { blobs: [[3, 4, 2], [7, 3, 3], [11, 4, 2]], speed: 0.7, y: 15, off: 60 },
  { blobs: [[4, 5, 3], [9, 3, 3], [13, 5, 3], [17, 6, 1]], speed: 0.32, y: 9, off: 95 },
];
const cloudSprites = new Map();
function cloudSprite(i, colors) {
  const key = `${i}|${colors[0]}`;
  let c = cloudSprites.get(key);
  if (!c) {
    const p = new Pix(24, 10);
    const { blobs } = CLOUDS[i];
    const flat = Math.max(...blobs.map(([, y]) => y)) + 1;
    for (let y = 0; y <= flat; y++) {
      for (let x = 0; x < 24; x++) {
        if (blobs.some(([bx, by, br]) => (x - bx) ** 2 + (y - by) ** 2 <= br * br + br * 0.5)) {
          p.px(x, y, y >= flat - 1 ? colors[1] : colors[0]);
        }
      }
    }
    c = p.canvas();
    cloudSprites.set(key, c);
  }
  return c;
}

const STARS = (() => {
  const rand = mulberry32(7);
  return Array.from({ length: 30 }, () => [Math.floor(rand() * WIN.w), Math.floor(rand() * 28), rand()]);
})();

const BOKEH = (() => {
  const rand = mulberry32(99);
  const cols = [P.yellow, P.orange, P.cyan, P.pink, P.cream, P.yellow];
  return Array.from({ length: 7 }, (_, i) => ({
    x: 4 + Math.floor(rand() * (WIN.w - 8)),
    y: 16 + Math.floor(rand() * 32),
    big: rand() < 0.45,
    color: cols[i % cols.length],
    rate: 0.4 + rand() * 0.9,
    ph: rand() * 6.28,
  }));
})();

let glassLayer = null;
function glass() {
  if (glassLayer) return glassLayer;
  const p = new Pix(WIN.w, WIN.h);
  for (let y = 0; y < WIN.h; y++) {
    for (let x = 0; x < WIN.w; x++) {
      const d = (x + y * 0.8) % 46;
      if (d >= 10 && d < 13) p.over(x, y, P.white, 0.07);
      if (d >= 15 && d < 16) p.over(x, y, P.white, 0.09);
    }
  }
  p.rect(40, 0, 1, WIN.h, P.slate);
  p.rect(41, 0, 1, WIN.h, P.black);
  for (let x = 0; x < WIN.w; x++) {
    p.over(x, 0, P.black, 0.45);
    p.over(x, 1, P.black, 0.2);
  }
  glassLayer = p.canvas();
  return glassLayer;
}

const winState = { cache: { L: {}, R: {} }, cv: {}, ctx: {} };
function windowLayers(side, phase) {
  const c = winState.cache[side];
  if (!c[phase]) {
    const th = THEMES[phase];
    c[phase] = { sky: buildSky(side, th), ...(side === 'L' ? buildLondon(th) : buildCity(th)) };
  }
  return c[phase];
}

function drawWindow(ctx, side, t, tm, phase) {
  const th = THEMES[phase];
  const lay = windowLayers(side, phase);
  if (!winState.cv[side]) {
    winState.cv[side] = makeCanvas(WIN.w, WIN.h);
    winState.ctx[side] = winState.cv[side].getContext('2d');
  }
  const c = winState.ctx[side];
  const seed = side === 'L' ? 0 : 500;
  c.drawImage(lay.sky, 0, 0);
  if (th.stars) {
    for (let i = 0; i < STARS.length; i++) {
      const [sx, sy, ph] = STARS[i];
      const x = (sx + (side === 'L' ? 0 : 37)) % WIN.w;
      const v = Math.sin(t * (0.8 + ph) + ph * 40);
      if (v > -0.4) fill(c, x, sy, 1, 1, v > 0.85 ? P.white : ph > 0.5 ? P.fog : P.steel);
    }
  }
  if (th.cloud) {
    CLOUDS.forEach((cl, i) => {
      if (side === 'R' && i === 2) return;
      const span = WIN.w + 26;
      const x = Math.floor((t * cl.speed + cl.off + seed) % span) - 24;
      c.drawImage(cloudSprite(i, th.cloud), x, cl.y + (side === 'R' ? 3 : 0));
    });
  }
  if (side === 'R' && phase !== 'day') {
    // an airliner crossing high above the city every couple of minutes
    const px = Math.floor((t * 3) % 260) - 20;
    if (px > -2 && px < WIN.w + 2) {
      fill(c, px, 6, 1, 1, Math.floor(t * 2) % 2 ? P.red : P.white);
      if (Math.floor(t * 1.3) % 3 === 0) fill(c, px - 2, 6, 1, 1, P.white);
    }
  }
  c.drawImage(lay.city, 0, 0);
  if (side === 'L') londonLife(c, t, tm, th);
  else cityLife(c, t, th);
  // window lights switching on and off
  for (let i = 0; i < lay.slots.length; i++) {
    if (hash(i * 31 + seed + Math.floor((t + i * 3.7) / (7 + (i % 5)))) < (phase === 'day' ? 0.15 : 0.45)) {
      const [x, y] = lay.slots[i];
      fill(c, x, y, 1, 1, i % 3 ? th.litA : th.litB);
    }
  }
  // water shimmer
  const G = side === 'L' ? 48 : 49;
  for (let i = 0; i < 9; i++) {
    const n = Math.floor(t * 2.2 + i * 0.37);
    const x = Math.floor(hash(n * 97 + i * 13 + seed) * WIN.w);
    const y = G + 1 + Math.floor(hash(n * 53 + i + seed) * (WIN.h - G - 2));
    fill(c, x, y, 2, 1, i % 3 ? th.glint : rgba(th.glint, 0.5));
  }
  if (th.bokeh) {
    for (const b of BOKEH) {
      const a = 0.16 + 0.14 * Math.sin(t * b.rate + b.ph + (side === 'L' ? 0 : 2));
      const x = side === 'L' ? b.x : WIN.w - b.x;
      c.fillStyle = rgba(b.color, a);
      if (b.big) {
        c.fillRect(x - 2, b.y - 1, 5, 3);
        c.fillRect(x - 1, b.y - 2, 3, 1);
        c.fillRect(x - 1, b.y + 2, 3, 1);
      } else {
        c.fillRect(x - 1, b.y, 3, 1);
        c.fillRect(x, b.y - 1, 1, 1);
        c.fillRect(x, b.y + 1, 1, 1);
      }
    }
  }
  c.drawImage(glass(), 0, 0);
  ctx.drawImage(winState.cv[side], WIN[side].x, WIN[side].y);
}

function londonLife(c, t, tm, th) {
  // Elizabeth Tower clock shows real London time
  const { h, m } = tm.zones[0];
  const ma = (m / 60) * Math.PI * 2;
  const ha = (((h % 12) + m / 60) / 12) * Math.PI * 2;
  c.fillStyle = th.hands;
  c.fillRect(32, 17, 1, 1);
  c.fillRect(32 + Math.round(Math.sin(ha)), 17 - Math.round(Math.cos(ha)), 1, 1);
  for (let s = 1; s <= 2; s++) c.fillRect(32 + Math.round(Math.sin(ma) * s), 17 - Math.round(Math.cos(ma) * s), 1, 1);
  // London Eye pods turning slowly
  const rot = (t / 240) * Math.PI * 2;
  c.fillStyle = th.pod;
  for (let k = 0; k < 16; k++) {
    const a = rot + (k / 16) * Math.PI * 2;
    c.fillRect(Math.round(EYE.cx + Math.cos(a) * (EYE.R + 1) - 0.5), Math.round(EYE.cy + Math.sin(a) * (EYE.R + 1) - 0.5), 2, 2);
  }
  // aviation light on the Shard
  if (th.lamps && t % 1.6 < 0.5) fill(c, 78, 2, 1, 1, P.red);
  // reflections of the lit landmarks dancing on the Thames
  if (th.lamps) {
    for (let y = 49; y < WIN.h; y += 2) {
      const j = Math.floor(t * 3 + y) % 3 === 0 ? 1 : 0;
      fill(c, 31 + j, y, 2, 1, rgba(th.face, 0.55));
      fill(c, EYE.cx - 2 + j * 2, y, 3, 1, rgba(th.eye, 0.45));
    }
  }
}

function cityLife(c, t, th) {
  if (th.lamps) {
    if (t % 1.4 < 0.45) fill(c, 35, 1, 1, 1, P.red);
    if ((t + 0.7) % 1.4 < 0.45) fill(c, 83, 2, 1, 1, P.red);
    if (t % 2 < 0.3) fill(c, 17, 3, 1, 1, P.red);
  }
  // traffic on the elevated highway
  for (let i = 0; i < 9; i++) {
    const right = i % 2 === 0;
    const speed = 7 + (i % 4) * 2.5;
    const span = WIN.w + 12;
    let x = Math.floor((t * speed + i * 23) % span) - 6;
    if (!right) x = WIN.w - x;
    fill(c, x, 46, right ? 2 : 1, 1, right ? P.red : th.lamps ? P.cream : P.white);
  }
}

// ---------------------------------------------------------------------------
// Side monitors: markets chart (left) and a dot-matrix world map (right)

const MON_L = { x: 14, y: 84, w: 80, h: 30 };
const MON_R = { x: 290, y: 84, w: 80, h: 30 };

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
const CITIES = [
  [51.5, -0.1], [40.7, -74], [35.7, 139.7], [-23.5, -46.6], [-1.3, 36.8], [19, 72.8],
  [-33.9, 151.2], [39.9, 116.4], [34, -118.2], [30, 31.2], [6.5, 3.4], [55.7, 37.6],
].map(([lat, lon]) => [Math.floor((lon + 180) / 9), clamp(Math.round((75 - lat) / 10), 0, 13)]);

function chartValue(n) {
  return clamp(
    0.52 + 0.2 * Math.sin(n * 0.11) + 0.11 * Math.sin(n * 0.29 + 1.3) + 0.06 * Math.sin(n * 0.73 + 2.1) + (hash(n) - 0.5) * 0.08,
    0.02,
    0.98,
  );
}

function drawMarkets(ctx, t) {
  const { x, y, w } = MON_L;
  const top = y + 10;
  const bottom = y + 27;
  const shift = Math.floor(t * 4);
  const n = w - 4;
  let prev = null;
  let last = 0;
  for (let i = 0; i < n; i++) {
    const v = chartValue(i + shift);
    const yy = bottom - Math.round(v * (bottom - top));
    const xx = x + 2 + i;
    fill(ctx, xx, yy + 1, 1, bottom - yy, rgba(P.green, 0.16));
    const y0 = prev === null ? yy : Math.min(prev, yy);
    const y1 = prev === null ? yy : Math.max(prev, yy);
    fill(ctx, xx, y0, 1, y1 - y0 + 1, P.green);
    prev = yy;
    last = yy;
  }
  if (Math.floor(t * 2) % 2) fill(ctx, x + w - 3, last - 1, 2, 2, P.white);
  const up = chartValue(n - 1 + shift) >= chartValue(shift + n - 25);
  const ax = x + w - 7;
  ctx.fillStyle = up ? P.green : P.red;
  if (up) {
    ctx.fillRect(ax + 2, y + 2, 1, 1);
    ctx.fillRect(ax + 1, y + 3, 3, 1);
    ctx.fillRect(ax, y + 4, 5, 1);
  } else {
    ctx.fillRect(ax, y + 2, 5, 1);
    ctx.fillRect(ax + 1, y + 3, 3, 1);
    ctx.fillRect(ax + 2, y + 4, 1, 1);
  }
}

function drawWorldMap(ctx, t, tm) {
  const { x, y } = MON_R;
  // night side of the planet, from the real UTC time
  const sunLon = (12 - tm.utc) * 15;
  let run = -1;
  ctx.fillStyle = rgba(P.black, 0.55);
  for (let c = 0; c <= 40; c++) {
    const lon = -180 + c * 9 + 4.5;
    const d = Math.abs((((lon - sunLon) % 360) + 540) % 360 - 180);
    const night = c < 40 && d > 90;
    if (night && run < 0) run = c;
    if (!night && run >= 0) {
      ctx.fillRect(x + run * 2, y + 1, (c - run) * 2, 28);
      run = -1;
    }
  }
  // news pings popping up around the world
  for (let k = 0; k < 3; k++) {
    const period = 2.6;
    const tt = t + k * (period / 3);
    const cycle = Math.floor(tt / period);
    const p = (tt % period) / period;
    const [cc, rr] = CITIES[Math.floor(hash(cycle * 7 + k * 101) * CITIES.length)];
    const px = x + cc * 2;
    const py = y + 1 + rr * 2;
    const rad = 1 + Math.floor(p * 4);
    const a = 0.85 * (1 - p);
    ctx.fillStyle = rgba(k === 1 ? P.yellow : P.cyan, a);
    ctx.fillRect(px - rad, py, 1, 1);
    ctx.fillRect(px + rad, py, 1, 1);
    ctx.fillRect(px, py - rad, 1, 1);
    ctx.fillRect(px, py + rad, 1, 1);
    if (rad > 2) {
      const d = rad - 1;
      ctx.fillRect(px - d, py - d + 1, 1, 1);
      ctx.fillRect(px + d, py - d + 1, 1, 1);
      ctx.fillRect(px - d, py + d - 1, 1, 1);
      ctx.fillRect(px + d, py + d - 1, 1, 1);
    }
    fill(ctx, px, py, 1, 1, p < 0.5 ? P.white : k === 1 ? P.yellow : P.cyan);
  }
  // the studio: London
  const [lc, lr] = CITIES[0];
  fill(ctx, x + lc * 2, y + 1 + lr * 2, 1, 1, Math.floor(t * 2) % 2 ? P.red : P.white);
}

// ---------------------------------------------------------------------------
// World clocks under the video wall

const CLOCK = { y: 98, R: 7, xs: [160, 192, 224] };
const clockFaces = {};
function clockFace(day) {
  const key = day ? 'day' : 'night';
  if (clockFaces[key]) return clockFaces[key];
  const R = CLOCK.R;
  const p = new Pix(2 * R + 1, 2 * R + 1);
  for (let yy = -R; yy <= R; yy++) {
    for (let xx = -R; xx <= R; xx++) {
      if (xx * xx + yy * yy <= R * R) p.px(R + xx, R + yy, day ? P.slate : P.ink);
    }
  }
  for (const [xx, yy] of circlePts(R)) p.px(R + xx, R + yy, day ? P.fog : P.steel);
  for (const [xx, yy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) p.px(R + xx * (R - 2), R + yy * (R - 2), day ? P.white : P.fog);
  clockFaces[key] = p.canvas();
  return clockFaces[key];
}

function drawClocks(ctx, tm) {
  const R = CLOCK.R;
  const hand = (cx, cy, ang, len, color) => {
    ctx.fillStyle = color;
    const dx = Math.sin(ang);
    const dy = -Math.cos(ang);
    for (let s = 1; s <= len; s++) ctx.fillRect(cx + Math.round(dx * s), cy + Math.round(dy * s), 1, 1);
  };
  CLOCK.xs.forEach((cx, i) => {
    const { h, m } = tm.zones[i];
    const cy = CLOCK.y;
    ctx.drawImage(clockFace(h >= 7 && h < 19), cx - R, cy - R);
    hand(cx, cy, (((h % 12) + m / 60) / 12) * Math.PI * 2, 3, P.silver);
    hand(cx, cy, ((m + tm.sec / 60) / 60) * Math.PI * 2, 5, P.white);
    hand(cx, cy, (tm.sec / 60) * Math.PI * 2, 5, P.red);
    fill(ctx, cx, cy, 1, 1, P.red);
  });
}

// ---------------------------------------------------------------------------
// Spinning globe (real continents, lit from the upper left, tilted axis)

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
  [P.ink, P.navy, P.navy, P.blue, P.cyan],
  [P.darkGreen, P.darkGreen, P.darkGreen, P.green, P.green],
  [P.steel, P.fog, P.silver, P.white, P.white],
].map((row) => row.map(u32));

const globes = new Map();
function buildGlobe(R) {
  const S = 2 * R + 5;
  const cv = makeCanvas(S, S);
  const gctx = cv.getContext('2d');
  const img = gctx.createImageData(S, S);
  const buf = new Uint32Array(img.data.buffer);
  const idx = [];
  const lat = [];
  const lon = [];
  const lvl = [];
  const tilt = 0.32;
  const L = [-0.5, -0.55, 0.67];
  const RR = R + 0.5;
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
        const la = (-Math.asin(clamp(qy, -1, 1)) * 180) / Math.PI;
        const lo = (Math.atan2(qx, nz) * 180) / Math.PI;
        const dif = nx * L[0] + ny * L[1] + nz * L[2];
        let v = clamp((dif + 0.2) * 2.6, 0, 3);
        const k = Math.floor(v);
        v = Math.min(3, k + (v - k > bayer(dx + 64, dy + 64) ? 1 : 0));
        if (dif > 0.965) v = 4;
        idx.push(i);
        lat.push(clamp(Math.floor(90 - la), 0, 179) * 360);
        lon.push(lo + 360 * 4);
        lvl.push(v);
      } else if (d2 <= (RR + 1.2) * (RR + 1.2)) {
        const lit = -dx - dy > 0;
        const [cr, cg, cb] = rgbOf(lit ? P.cyan : P.blue);
        const a = lit ? 150 : 70;
        buf[i] = ((a << 24) | (cb << 16) | (cg << 8) | cr) >>> 0;
      }
    }
  }
  return { cv, gctx, img, buf, idx, lat, lon, lvl, S };
}

/** Spinning pixel globe centred on (cx, cy) with radius R. */
export function drawGlobe(ctx, cx, cy, R, t) {
  R = Math.max(3, Math.round(R));
  let g = globes.get(R);
  if (!g) {
    g = buildGlobe(R);
    globes.set(R, g);
  }
  const tex = landTexture();
  const rot = (t * 0.4 * 180) / Math.PI;
  for (let k = 0; k < g.idx.length; k++) {
    const lo = Math.floor(g.lon[k] + rot) % 360;
    const type = tex[g.lat[k] + lo];
    g.buf[g.idx[k]] = GLOBE_COLORS[type][type === 1 && g.lvl[k] === 4 ? 3 : g.lvl[k]];
  }
  g.gctx.putImageData(g.img, 0, 0);
  ctx.drawImage(g.cv, Math.round(cx) - R - 2, Math.round(cy) - R - 2);
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

const wallState = { cv: null, ctx: null, bg: {}, scan: null, glow: new WeakMap() };

function wallBg(kind) {
  if (wallState.bg[kind]) return wallState.bg[kind];
  const { w, h } = WALL;
  const p = new Pix(w, h);
  if (kind === 'logo') {
    p.vgrad(0, 0, w, h, [P.navy, P.ink, P.black], 1.4);
    for (let y = 3; y < h; y += 6) for (let x = 3; x < w; x += 6) p.over(x, y, P.blue, 0.35);
  } else {
    p.vgrad(0, 0, w, h, [P.ink, P.ink, P.black], 1.4);
    p.rect(0, 0, w, 13, P.navy);
    p.rect(0, 13, w, 1, P.cyan);
    p.rect(0, 14, w, 1, P.black);
    for (let x = 0; x < w; x++) if (((x >> 2) & 1) === 0) p.over(x, 12, P.blue, 0.5);
  }
  wallState.bg[kind] = p.canvas();
  return wallState.bg[kind];
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
    R /= n;
    G /= n;
    B /= n;
    let best = Infinity;
    for (const hex of GLOW_CHOICES) {
      const [r2, g2, b2] = rgbOf(hex);
      const dist = (r2 - R) ** 2 + (g2 - G) ** 2 + (b2 - B) ** 2;
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

const ORBIT = (() => {
  const pts = [];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    pts.push([Math.round(Math.cos(a) * 24), Math.round(Math.sin(a) * 5 - Math.cos(a) * 3), Math.sin(a) > 0]);
  }
  return pts;
})();

function wallLogo(c, scene, t) {
  c.drawImage(wallBg('logo'), 0, 0);
  const gx = 25;
  const gy = 31;
  const sat = Math.floor((t * 9) % 64);
  for (let i = 0; i < 64; i += 2) if (!ORBIT[i][2]) fill(c, gx + ORBIT[i][0], gy + ORBIT[i][1], 1, 1, P.slate);
  drawGlobe(c, gx, gy, 17, t);
  for (let i = 0; i < 64; i += 2) if (ORBIT[i][2]) fill(c, gx + ORBIT[i][0], gy + ORBIT[i][1], 1, 1, P.cyan);
  const [ox, oy, front] = ORBIT[sat];
  if (front || ox * ox + (oy * 4) ** 2 > 18 * 18) {
    fill(c, gx + ox - 1, gy + oy, 3, 1, P.white);
    fill(c, gx + ox, gy + oy - 1, 1, 3, P.white);
  }
  const ch = scene.channel || '';
  const tx = 52;
  tiny(c, 'WORLD NEWS', tx, 13, P.cyan);
  if (measureText(ch) <= 50) drawText(c, ch, tx, 22, { color: P.white, shadow: P.black });
  else tiny(c, ch, tx, 23, P.white);
  // LIVE pill with a pulsing dot
  const lw = measureText('LIVE') + 13;
  fill(c, tx, 35, lw, 11, P.red);
  fill(c, tx, 45, lw, 1, P.darkRed);
  fill(c, tx + 3, 39, 3, 3, Math.floor(t * 1.5) % 2 ? P.white : P.pink);
  drawText(c, 'LIVE', tx + 9, 37, { color: P.white });
  tiny(c, '24 HOURS', tx, 50, P.fog);
}

function wallRundown(c, scene, t) {
  const { w } = WALL;
  c.drawImage(wallBg('rundown'), 0, 0);
  const ch = scene.channel || '';
  const head = 'TODAY ON';
  if (measureText(`${head} ${ch}`) <= w - 10) {
    const hw = drawText(c, head, 5, 3, { color: P.yellow });
    drawText(c, ch, 5 + hw + 3, 3, { color: P.white, shadow: P.black });
  } else {
    const hw = tiny(c, head, 5, 4, P.yellow);
    drawText(c, ch, 5 + hw + 3, 3, { color: P.white, shadow: P.black });
  }
  const items = scene.rundown;
  const n = items.length;
  const per = 3.2;
  const idx = Math.floor(t / per) % n;
  const dt = t % per;
  const slide = Math.round((1 - easeOut(dt / 0.35)) * w);
  const out = dt > per - 0.25 ? Math.round(easeInOut((dt - (per - 0.25)) / 0.25) * -w) : 0;
  const ox = slide + out;
  // number badge
  fill(c, 5 + ox, 19, 10, 10, P.yellow);
  fill(c, 5 + ox, 28, 10, 1, P.orange);
  drawText(c, String(idx + 1), 10 + ox, 21, { color: P.black, align: 'center' });
  let lines = wrapText(items[idx]?.headline || '', w - 24);
  if (lines.length > 3) {
    lines = lines.slice(0, 3);
    let last = lines[2];
    while (last.length > 1 && measureText(`${last}...`) > w - 24) last = last.slice(0, -1).trimEnd();
    lines[2] = `${last}...`;
  }
  lines.forEach((line, i) => drawText(c, line, 19 + ox, 20 + i * 10, { color: P.white, shadow: P.black }));
  // item dots + progress bar
  const shown = Math.min(n, 12);
  for (let i = 0; i < shown; i++) fill(c, 5 + i * 6, 52, 4, 2, i === idx % shown ? P.yellow : P.slate);
  fill(c, 5, 57, w - 10, 2, P.ink);
  fill(c, 5, 57, Math.round((w - 10) * (dt / per)), 2, P.cyan);
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
    const run = Math.floor(t * 14) % 40;
    const side = Math.floor(run / 10);
    const s = (run % 10) - 5;
    const pos = [[cx + s, cy - 6], [cx + 6, cy + s], [cx - s, cy + 6], [cx - 6, cy - s]][side];
    fill(c, pos[0], pos[1], 1, 1, P.white);
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
    linePtsFill(c, cx - 9, cy + 1, cx + 6, cy - 8, P.white);
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

function linePtsFill(c, x0, y0, x1, y1, color) {
  c.fillStyle = color;
  linePts(x0, y0, x1, y1, (x, y) => c.fillRect(x, y, 1, 1));
}

const BADGE = circlePts(13);
function wallSource(c, wall, t) {
  const { w, h } = WALL;
  const key = CATEGORY[wall.category] ? wall.category : 'general';
  const cat = CATEGORY[key];
  drawStripes(c, 0, 0, w, h, t * 0.5, P.black, cat.dark);
  c.fillStyle = rgba(P.black, 0.45);
  c.fillRect(0, 0, w, h);
  // badge
  const cx = 19;
  const cy = 29;
  c.fillStyle = cat.dark;
  for (let yy = -13; yy <= 13; yy++) {
    const half = Math.floor(Math.sqrt(169 - yy * yy));
    c.fillRect(cx - half, cy + yy, half * 2 + 1, 1);
  }
  c.fillStyle = cat.mid;
  for (const [bx, by] of BADGE) c.fillRect(cx + bx, cy + by, 1, 1);
  categoryIcon(c, cat, key, cx, cy, t);
  // outlet + category
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
  // sweeping accent bar
  fill(c, 0, h - 5, w, 1, cat.dark);
  const sx = Math.floor((t * 40) % (w + 30)) - 30;
  fill(c, sx, h - 5, 30, 1, cat.mid);
  fill(c, sx + 22, h - 5, 8, 1, cat.hi);
}

function wallGlowColor(wall, scene) {
  const img = wall.storyId && scene.images?.get(wall.storyId);
  if (wall.mode === 'image' && img?.small) return imageGlow(img.small);
  if (wall.mode === 'source') return (CATEGORY[wall.category] || CATEGORY.general).mid;
  return P.blue;
}

function drawWallContent(ctx, wall, scene, t) {
  if (!wallState.cv) {
    wallState.cv = makeCanvas(WALL.w, WALL.h);
    wallState.ctx = wallState.cv.getContext('2d');
  }
  const c = wallState.ctx;
  const img = wall.storyId && scene.images?.get(wall.storyId);
  if (wall.mode === 'image' && img?.small) {
    fill(c, 0, 0, WALL.w, WALL.h, P.black);
    c.drawImage(img.small, 0, 0);
  } else if (wall.mode === 'rundown' && scene.rundown?.length) {
    wallRundown(c, scene, t);
  } else if (wall.mode === 'source') {
    wallSource(c, wall, t);
  } else {
    wallLogo(c, scene, t);
  }
  c.drawImage(scanlines(), 0, 0);
  // a glint of studio light sliding across the glass now and then
  const g = t % 13;
  if (g < 1) {
    const pos = Math.round(easeInOut(g) * (WALL.w + 70)) - 40;
    for (let y = 0; y < WALL.h; y++) {
      const x = pos + Math.floor(y * 0.5);
      fill(c, x, y, 5, 1, rgba(P.white, 0.08));
      fill(c, x + 1, y, 2, 1, rgba(P.white, 0.1));
    }
  }
  ctx.drawImage(wallState.cv, WALL.x, WALL.y);
}

/** Coloured light the video wall spills onto the back wall around its bezel. */
function drawWallHalo(ctx, color, t) {
  const x0 = WALL.x - 4;
  const y0 = WALL.y - 4;
  const x1 = WALL.x + WALL.w + 4;
  const y1 = WALL.y + WALL.h + 4;
  const breathe = 1 + 0.12 * Math.sin(t * 1.3);
  let d = 0;
  for (const [th, a] of [[2, 0.2], [3, 0.11], [4, 0.05]]) {
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
// Static back layer: rig, wall architecture, frames, floor

const FIXTURES = [22, 60, 118, 160, 192, 224, 266, 324, 362];
const PILLARS = [3, 379];
const FLOOR_Y = 134;

let bgLayer = null;
function background() {
  if (bgLayer) return bgLayer;
  const p = new Pix(W, H);
  // ceiling + truss
  p.rect(0, 0, W, 10, P.black);
  p.rect(0, 2, W, 1, P.steel);
  p.rect(0, 3, W, 1, P.slate);
  p.rect(0, 7, W, 1, P.slate);
  p.rect(0, 8, W, 1, P.ink);
  for (let x = 0; x < W; x++) {
    const z = x % 6;
    const a = z < 3 ? z : 5 - z;
    p.px(x, 4 + a, P.slate);
    p.px(x, 6 - a, P.ink);
  }
  // fascia with LED line
  p.rect(0, 10, W, 1, P.black);
  p.rect(0, 11, W, 1, P.ink);
  p.rect(0, 12, W, 1, P.navy);
  p.rect(0, 13, W, 1, P.black);
  // back wall: dark at the top, flat ink below
  p.vgrad(0, 14, W, 20, [P.black, P.ink], 1.5);
  p.rect(0, 34, W, FLOOR_Y - 34, P.ink);
  // light washes behind the presenters from the key fixtures
  for (const ax of [ANCHOR_X.A, ANCHOR_X.B]) {
    const x0 = ax - 19;
    p.shade(x0, 14, 38, FLOOR_Y - 14, [P.ink, P.slate, P.steel], (x, y) => {
      const dy = y - 14;
      const half = 6 + dy * 0.3;
      const dx = Math.abs(x + 0.5 - ax);
      if (dx > half) return -1;
      return (1 - dx / half) ** 0.7 * Math.max(0, 1 - dy / 125) ** 1.15 * 2.3;
    }, 1.3);
  }
  // panel seams framing the presenter bays
  for (const sx of [98, 136, 247, 285]) {
    p.rect(sx, 14, 1, FLOOR_Y - 14, P.black);
    p.rect(sx + 1, 14, 1, FLOOR_Y - 14, P.slate);
  }
  // LED pillars at both edges
  for (const lx of PILLARS) {
    const x0 = lx - 3;
    p.rect(x0, 10, 8, FLOOR_Y - 10, P.ink);
    p.rect(x0, 10, 1, FLOOR_Y - 10, P.black);
    p.rect(x0 + 7, 10, 1, FLOOR_Y - 10, P.black);
    p.rect(x0 + 2, 14, 1, FLOOR_Y - 18, P.slate);
    p.rect(x0 + 5, 14, 1, FLOOR_Y - 18, P.slate);
    p.rect(lx, 14, 2, FLOOR_Y - 18, P.navy);
  }
  // windows: frames and sills
  for (const side of ['L', 'R']) {
    const { x, y } = WIN[side];
    const { w, h } = WIN;
    p.rect(x - 2, y - 2, w + 4, h + 4, P.slate);
    p.rect(x - 2, y - 2, w + 4, 1, P.steel);
    p.rect(x - 2, y - 2, 1, h + 4, P.steel);
    p.rect(x - 1, y - 1, w + 2, h + 2, P.black);
    p.rect(x - 4, y + h + 2, w + 8, 1, P.fog);
    p.rect(x - 4, y + h + 3, w + 8, 1, P.slate);
    p.rect(x - 4, y + h + 4, w + 8, 1, P.black);
  }
  // monitors
  for (const m of [MON_L, MON_R]) {
    p.rect(m.x - 2, m.y - 2, m.w + 4, m.h + 4, P.black);
    p.rect(m.x - 2, m.y - 2, m.w + 4, 1, P.slate);
    p.rect(m.x - 2, m.y + m.h + 1, m.w + 4, 1, P.slate);
    p.vgrad(m.x, m.y, m.w, m.h, [P.ink, P.black], 1.2);
    p.px(m.x + m.w, m.y + m.h + 1, P.green);
  }
  // markets monitor: header rule + grid
  for (let x = MON_L.x + 1; x < MON_L.x + MON_L.w - 1; x += 2) {
    p.px(x, MON_L.y + 8, P.slate);
    p.px(x, MON_L.y + 15, P.ink);
    p.px(x, MON_L.y + 21, P.ink);
  }
  for (let y = MON_L.y + 10; y < MON_L.y + MON_L.h - 1; y += 2) {
    p.px(MON_L.x + 27, y, P.ink);
    p.px(MON_L.x + 54, y, P.ink);
  }
  // world map dots
  WORLD.forEach((row, rr) => {
    [...row].forEach((ch, cc) => p.px(MON_R.x + cc * 2, MON_R.y + 1 + rr * 2, ch === '#' ? P.steel : P.ink));
  });
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
  // world clock panel
  {
    const x0 = CLOCK.xs[0] - 16;
    const x1 = CLOCK.xs[2] + 16;
    p.rect(x0, 88, x1 - x0, FLOOR_Y - 88, P.black);
    p.rect(x0, 88, x1 - x0, 1, P.slate);
    p.rect(x0 + 1, 89, x1 - x0 - 2, 1, P.ink);
  }
  // baseboard with cove LED
  p.rect(0, FLOOR_Y - 4, W, 1, P.black);
  p.rect(0, FLOOR_Y - 3, W, 2, P.slate);
  p.rect(0, FLOOR_Y - 1, W, 1, P.navy);
  // glossy floor: perspective seams over a dark gradient
  p.vgrad(0, FLOOR_Y, W, H - FLOOR_Y, [P.ink, P.ink, P.black], 1.3);
  for (let k = -14; k <= 14; k++) {
    linePts(192, 56, 192 + k * 30, 260, (x, y) => y > FLOOR_Y && p.over(x, y, P.slate, 0.4));
  }
  for (const y of [143, 158, 182]) for (let x = 0; x < W; x++) p.over(x, y, P.slate, 0.3);
  // pillar reflections + cove light on the floor
  for (const lx of PILLARS) {
    for (let i = 0; i < 26; i++) {
      p.over(lx, FLOOR_Y + i, P.blue, 0.3 * (1 - i / 26));
      p.over(lx + 1, FLOOR_Y + i, P.blue, 0.3 * (1 - i / 26));
    }
  }
  for (let x = 0; x < W; x++) {
    p.over(x, FLOOR_Y, P.blue, 0.22);
    p.over(x, FLOOR_Y + 1, P.blue, 0.1);
  }
  const cv = p.canvas();
  // labels
  const c = cv.getContext('2d');
  tiny(c, 'MARKETS', MON_L.x + 2, MON_L.y + 2, P.cyan);
  ZONES.forEach(([name], i) => tiny(c, name, CLOCK.xs[i], 108, i === 0 ? P.cyan : P.fog, 'center'));
  bgLayer = cv;
  return bgLayer;
}

let fixtureSprite = null;
function fixture() {
  if (fixtureSprite) return fixtureSprite;
  const p = new Pix(7, 8);
  p.px(3, 0, P.slate);
  p.rect(2, 1, 3, 1, P.slate);
  p.rect(1, 2, 5, 2, P.slate);
  p.rect(1, 2, 1, 2, P.steel);
  p.rect(5, 2, 1, 2, P.ink);
  p.rect(2, 4, 3, 1, P.black);
  for (let x = 0; x < 7; x++) {
    p.over(x, 5, P.cream, x > 0 && x < 6 ? 0.28 : 0.12);
    p.over(x, 6, P.cream, x > 1 && x < 5 ? 0.12 : 0.05);
  }
  fixtureSprite = p.canvas();
  return fixtureSprite;
}

/** LED strips, rig fixtures and the occasional flicker. */
function drawRig(ctx, t) {
  // fascia LED: pulses running out from the centre
  for (let k = 0; k < 2; k++) {
    const d = Math.floor((t * 70 + k * 110) % 220);
    for (const dir of [-1, 1]) {
      const hx = dir > 0 ? 192 + d : 191 - d;
      fill(ctx, dir > 0 ? hx - 12 : hx + 1, 12, 12, 1, P.blue);
      fill(ctx, dir > 0 ? hx - 4 : hx + 1, 12, 4, 1, P.cyan);
      fill(ctx, hx, 12, 1, 1, P.white);
    }
  }
  const flickIdx = Math.floor(t / 23) % FIXTURES.length;
  const flicking = t % 23 < 0.5;
  FIXTURES.forEach((fx, i) => {
    ctx.drawImage(fixture(), fx - 3, 9);
    const off = flicking && i === flickIdx && Math.floor(t * 24) % 3 === 0;
    fill(ctx, fx - 1, 13, 3, 1, off ? P.slate : P.cream);
    if (!off) fill(ctx, fx, 13, 1, 1, P.white);
  });
  // LED pillars: pulses rising, mirrored in the glossy floor
  for (const lx of PILLARS) {
    for (let k = 0; k < 2; k++) {
      const y = 126 - Math.floor((t * 34 + k * 57 + lx) % 112);
      fill(ctx, lx, y + 3, 2, 8, P.blue);
      fill(ctx, lx, y, 2, 3, P.cyan);
      fill(ctx, lx, y, 2, 1, P.white);
      const ry = 2 * FLOOR_Y - y;
      if (ry < FLOOR_Y + 26) fill(ctx, lx, ry - 3, 2, 4, rgba(P.cyan, 0.3 * (1 - (ry - FLOOR_Y) / 26)));
    }
  }
  // cove light breathing
  fill(ctx, 0, FLOOR_Y - 1, W, 1, rgba(P.cyan, 0.25 + 0.15 * Math.sin(t * 0.9)));
}

/** Moving-head beams sweeping through the haze on both sides of the set. */
function drawBeams(ctx, t) {
  for (const [sx, dir, ph] of [[22, 1, 0], [362, -1, 2.2]]) {
    const ang = dir * (0.32 + 0.22 * Math.sin(t * 0.23 + ph));
    const tan = Math.tan(ang);
    for (let i = 0; i < 118; i += 2) {
      const y = 14 + i;
      const cx = sx + tan * i;
      const hw = 1 + i * 0.09;
      const a = 0.075 * (1 - i / 130);
      ctx.fillStyle = rgba(P.cream, a);
      ctx.fillRect(Math.round(cx - hw), y, Math.round(hw * 2) + 1, 2);
    }
  }
}

// ---------------------------------------------------------------------------

let lastGlow = P.blue;

export function drawSet(ctx, t, scene) {
  const wall = scene.wall || { mode: 'logo' };
  const tm = times();
  const phase = phaseOf(tm.zones[0].h);
  ctx.drawImage(background(), 0, 0);
  drawWindow(ctx, 'L', t, tm, phase);
  drawWindow(ctx, 'R', t, tm, phase);
  drawMarkets(ctx, t);
  drawWorldMap(ctx, t, tm);
  drawClocks(ctx, tm);
  lastGlow = wallGlowColor(wall, scene);
  drawWallHalo(ctx, lastGlow, t);
  drawWallContent(ctx, wall, scene, t);
  drawRig(ctx, t);
  drawBeams(ctx, t);
}

// ---------------------------------------------------------------------------
// The anchor desk: a curved news desk with wings angled away from camera

const DESK = { x0: 36, x1: 347, c0: 84, c1: 299, bot: 155 };
const deskK = (x) => (x < DESK.c0 ? (DESK.c0 - x) / (DESK.c0 - DESK.x0) : x > DESK.c1 ? (x - DESK.c1) / (DESK.x1 - DESK.c1) : 0);
const deskTop = (x) => DESK_Y - Math.round(3 * deskK(x));
const deskBot = (x) => DESK.bot - Math.round(7 * deskK(x));

let deskLayer = null;
function desk() {
  if (deskLayer) return deskLayer;
  const p = new Pix(W, H);
  for (let x = DESK.x0; x <= DESK.x1; x++) {
    const k = deskK(x);
    const top = deskTop(x);
    const bot = deskBot(x);
    // glossy top surface + bevelled front edge
    p.px(x, top, P.slate);
    p.px(x, top + 1, P.steel);
    p.px(x, top + 2, P.steel);
    p.px(x, top + 3, P.fog);
    p.px(x, top + 4, P.silver);
    p.px(x, top + 5, P.black);
    // LED channel
    p.px(x, top + 6, P.black);
    p.px(x, top + 7, P.navy);
    p.px(x, top + 8, P.black);
    // front face: lit navy in the middle, falling off into the wings
    const f0 = top + 9;
    const f1 = bot - 5;
    p.shade(x, f0, 1, f1 - f0 + 1, [P.blue, P.navy, P.ink, P.black], (xx, y) => {
      const v = (y - f0) / Math.max(1, f1 - f0);
      return k > 0 ? 1.5 + v * 0.9 + k * 0.7 : 0.75 + v * 1.25;
    }, 1.6);
    p.px(x, bot - 4, k > 0 ? P.ink : P.slate);
    p.rect(x, bot - 3, 1, 4, P.black);
  }
  // crisp vertical edges where the wings fold back, panel seams and end caps
  for (const x of [DESK.c0, DESK.c1]) p.rect(x, DESK_Y + 9, 1, DESK.bot - DESK_Y - 13, P.blue);
  for (const x of [106, 278]) p.rect(x, DESK_Y + 9, 1, DESK.bot - DESK_Y - 13, P.black);
  p.rect(DESK.x0, deskTop(DESK.x0), 1, deskBot(DESK.x0) - deskTop(DESK.x0) + 1, P.steel);
  p.rect(DESK.x1, deskTop(DESK.x1), 1, deskBot(DESK.x1) - deskTop(DESK.x1) + 1, P.ink);
  // reflection in the glossy floor + contact shadow
  for (let x = DESK.x0 - 4; x <= DESK.x1 + 4; x++) {
    const inside = x >= DESK.x0 && x <= DESK.x1;
    const bot = deskBot(clamp(x, DESK.x0, DESK.x1));
    if (inside) {
      for (let i = 0; i < 20; i++) {
        const src = p.get(x, bot - 4 - i);
        p.over(x, bot + 1 + i, src, 0.3 * (1 - i / 20) ** 1.3);
      }
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
      const d = nx * nx * 0.55 + ny * ny * 0.45;
      const a = Math.floor(clamp((d - 0.62) / 0.38, 0, 1) ** 1.3 * 5) * 0.08;
      if (a > 0) p.over(x, y, P.black, a);
    }
  }
  deskLayer = p.canvas();
  return deskLayer;
}

const plates = new Map();
function plate(channel) {
  let pl = plates.get(channel);
  if (pl) return pl;
  let scale = 2;
  let tw = measureText(channel, 2);
  if (tw > 140) {
    scale = 1;
    tw = measureText(channel, 1);
  }
  const pw = tw + 24;
  const ph = 22;
  const p = new Pix(pw, ph);
  p.rect(0, 0, pw, ph, P.maroon);
  p.vgrad(1, 1, pw - 2, ph - 4, [P.pink, P.red, P.red, P.red, P.darkRed], 2.4);
  p.rect(1, ph - 3, pw - 2, 1, P.darkRed);
  p.rect(0, ph - 1, pw, 1, P.black);
  p.rect(1, 1, 1, ph - 4, P.pink);
  p.rect(pw - 2, 1, 1, ph - 4, P.darkRed);
  for (const x of [5, pw - 6]) {
    p.px(x, 9, P.white);
    p.rect(x - 1, 10, 3, 1, P.white);
    p.px(x, 11, P.white);
  }
  const cv = p.canvas();
  const c = cv.getContext('2d');
  const ty = scale === 2 ? 4 : 8;
  drawText(c, channel, pw / 2, ty, { color: P.white, scale, align: 'center', shadow: P.darkRed });
  // its reflection on the floor, built from the finished plate
  const src = new Uint32Array(c.getImageData(0, 0, pw, ph).data.buffer);
  const x0 = Math.floor((W - pw) / 2);
  const y0 = 127;
  const ry0 = 2 * DESK.bot + 1 - (y0 + ph - 1);
  const rp = new Pix(pw, ph);
  for (let j = 0; j < ph; j++) {
    const dy = ry0 + j;
    const a = 0.26 * clamp(1 - (dy - DESK.bot) / 30, 0, 1);
    for (let i = 0; i < pw; i++) rp.over(i, j, src[(ph - 1 - j) * pw + i], a);
  }
  pl = { cv, refl: rp.canvas(), x: x0, y: y0, w: pw, h: ph, ry: ry0 };
  plates.set(channel, pl);
  return pl;
}

export function drawDesk(ctx, t, channel, withLogo = true) {
  ctx.drawImage(desk(), 0, 0);
  // light from the video wall pooling on the desk top
  const g = lastGlow;
  for (const [x0, x1, a] of [[118, 266, 0.1], [136, 248, 0.12], [156, 228, 0.12]]) {
    ctx.fillStyle = rgba(g, a);
    ctx.fillRect(x0, DESK_Y, x1 - x0, 5);
  }
  // a specular highlight gliding along the desk edge
  const st = t % 10;
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
  // LED strip: comets running out from the centre
  for (let k = 0; k < 4; k++) {
    const d = Math.floor((t * 46 + k * 40) % 160);
    for (const dir of [-1, 1]) {
      for (let j = 0; j < 12; j++) {
        const x = dir > 0 ? 192 + d - j : 191 - d + j;
        if (x < DESK.x0 || x > DESK.x1) continue;
        fill(ctx, x, deskTop(x) + 7, 1, 1, j === 0 ? P.white : j < 4 ? P.cyan : P.blue);
      }
    }
  }
  // chase lights on the front panel
  const pl = withLogo && channel ? plate(channel) : null;
  const inner = pl ? pl.x - 6 : 192;
  const n = Math.floor(t * 9);
  for (let i = 0; ; i++) {
    const dx = (pl ? 192 - inner : 2) + i * 7;
    const xl = 192 - dx - 2;
    if (xl < DESK.c0 + 5) break;
    const ph = (((i - n) % 9) + 9) % 9;
    const col = ph === 0 ? P.cyan : ph === 1 ? P.blue : P.ink;
    fill(ctx, xl, 139, 2, 2, col);
    fill(ctx, 192 + dx, 139, 2, 2, col);
    if (ph === 0) {
      fill(ctx, xl, 139, 1, 1, P.white);
      fill(ctx, 192 + dx + 1, 139, 1, 1, P.white);
    }
  }
  if (!pl) return;
  ctx.drawImage(pl.refl, pl.x, pl.ry);
  ctx.drawImage(pl.cv, pl.x, pl.y);
  // shine sweeping across the logo plate
  const s = t % 8;
  if (s < 0.8) {
    const p = easeOut(s / 0.8);
    const bx = Math.round(-14 + p * (pl.w + 28));
    for (let j = 1; j < pl.h - 3; j++) {
      const x = bx + Math.floor((pl.h - j) / 2);
      const x0 = Math.max(1, x);
      const x1 = Math.min(pl.w - 1, x + 4);
      if (x1 > x0) fill(ctx, pl.x + x0, pl.y + j, x1 - x0, 1, rgba(P.white, 0.35));
    }
  }
}
