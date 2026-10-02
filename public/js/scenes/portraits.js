// Close-up camera shot. Instead of scaling up the 1x studio (which mixes pixel
// sizes), the close-up is drawn natively at 1x: an out-of-focus studio
// backdrop, a large detailed bust of the presenter and the front edge of the
// desk. Static parts are rasterised once into offscreen canvases (built from a
// small "material + tone" pixel buffer so lighting rules stay consistent) and
// the living parts (eyes, brows, mouth, earrings, hands, lights) are drawn per
// frame with integer rectangles only.
import { P } from '../palette.js';
import { zoneTime } from '../util.js';

const W = 384;
const H = 216;

// ---------------------------------------------------------------------------
// Tiny raster helpers
// ---------------------------------------------------------------------------

const rect = (ctx, x, y, w, h, c) => {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
};

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

const RGB = {};
function rgb(hex) {
  if (!RGB[hex]) RGB[hex] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return RGB[hex];
}

// Stable hash noise in [0,1) for integer inputs.
function hash(a, b = 0) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Filled disc made of horizontal spans, centred on pixel (cx, cy).
const DISC = [];
function discSpans(rad) {
  if (!DISC[rad]) {
    DISC[rad] = [];
    for (let dy = -rad; dy <= rad; dy++) DISC[rad].push(Math.floor(Math.sqrt(rad * rad - dy * dy) + 0.3));
  }
  return DISC[rad];
}
function disc(ctx, cx, cy, rad, c) {
  ctx.fillStyle = c;
  if (rad <= 0) {
    ctx.fillRect(cx, cy, 1, 1);
    return;
  }
  const spans = discSpans(rad);
  for (let k = 0; k < spans.length; k++) ctx.fillRect(cx - spans[k], cy - rad + k, spans[k] * 2 + 1, 1);
}

// Draw a small ASCII sprite with a colour key; columns are mirrored if flip.
function sprite(ctx, rows, key, x, y, flip = false) {
  for (let j = 0; j < rows.length; j++) {
    const row = rows[j];
    let k = 0;
    while (k < row.length) {
      const c = key[row[k]];
      let n = 1;
      while (k + n < row.length && row[k + n] === row[k]) n++;
      if (c) {
        const xx = flip ? x + row.length - k - n : x + k;
        rect(ctx, xx, y + j, n, 1, c);
      }
      k += n;
    }
  }
}

// ---------------------------------------------------------------------------
// Material buffer: every pixel stores a material and a tone; tones index the
// material's hue-shifted ramp, so shading passes stay inside the palette.
//   tone -2 specular, -1 light, 0 base, 1 shade, 2 deep, 3 darkest, RIM
// ---------------------------------------------------------------------------

const RIM = 9;

class Buf {
  constructor(x0, y0, w, h) {
    Object.assign(this, { x0, y0, w, h });
    this.m = new Uint8Array(w * h);
    this.t = new Int8Array(w * h);
  }
  i(x, y) {
    x -= this.x0;
    y -= this.y0;
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? -1 : y * this.w + x;
  }
  set(x, y, m, t = 0) {
    const i = this.i(x, y);
    if (i >= 0) {
      this.m[i] = m;
      this.t[i] = t;
    }
  }
  mat(x, y) {
    const i = this.i(x, y);
    return i < 0 ? 0 : this.m[i];
  }
  tone(x, y) {
    const i = this.i(x, y);
    return i < 0 ? 0 : this.t[i];
  }
  setTone(x, y, t, only) {
    const i = this.i(x, y);
    if (i >= 0 && this.m[i] && (!only || only.includes(this.m[i]))) this.t[i] = t;
  }
  shift(x, y, d, only) {
    const i = this.i(x, y);
    if (i >= 0 && this.m[i] && this.t[i] !== RIM && (!only || only.includes(this.m[i]))) this.t[i] = Math.max(-2, Math.min(3, this.t[i] + d));
  }
  span(xa, xb, y, m, t = 0) {
    for (let x = xa; x <= xb; x++) this.set(x, y, m, t);
  }
  rect(x, y, w, h, m, t = 0) {
    for (let yy = y; yy < y + h; yy++) this.span(x, x + w - 1, yy, m, t);
  }
  // Polygon fill sampling pixel centres (symmetric shapes stay symmetric).
  poly(pts, m, t = 0, only) {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of pts) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    for (let y = Math.floor(minY); y < Math.ceil(maxY); y++) {
      const yc = y + 0.5;
      const xs = [];
      for (let k = 0; k < pts.length; k++) {
        const [x1, y1] = pts[k];
        const [x2, y2] = pts[(k + 1) % pts.length];
        if ((y1 <= yc && y2 > yc) || (y2 <= yc && y1 > yc)) xs.push(x1 + ((yc - y1) / (y2 - y1)) * (x2 - x1));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.ceil(xs[k] - 0.5); x <= Math.ceil(xs[k + 1] - 0.5) - 1; x++) {
          if (only) this.setTone(x, y, t, only);
          else this.set(x, y, m, t);
        }
      }
    }
  }
  ellipse(cx, cy, rx, ry, m, t = 0) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, m, t);
      }
    }
  }
  // Re-tone existing pixels along a line (Bresenham).
  toneLine(x0, y0, x1, y1, t, only) {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.setTone(x0, y0, t, only);
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
  pts(list, t, only) {
    for (const [x, y] of list) this.setTone(x, y, t, only);
  }
  ascii(rows, x0, y0, key) {
    rows.forEach((row, j) => {
      for (let k = 0; k < row.length; k++) {
        const e = key[row[k]];
        if (e) this.set(x0 + k, y0 + j, e[0], e[1]);
      }
    });
  }
  // true if (x,y) is one of `mats` and its neighbour (dx,dy) is empty
  edge(x, y, dx, dy, mats) {
    const m = this.mat(x, y);
    if (!m || (mats && !mats.includes(m))) return false;
    return this.mat(x + dx, y + dy) === 0;
  }
  each(fn) {
    for (let y = this.y0; y < this.y0 + this.h; y++) for (let x = this.x0; x < this.x0 + this.w; x++) fn(x, y);
  }
  render(mats) {
    const [c, ctx] = makeCanvas(this.w, this.h);
    const img = ctx.createImageData(this.w, this.h);
    for (let i = 0; i < this.m.length; i++) {
      const m = this.m[i];
      if (!m) continue;
      const mt = mats[m];
      const col = this.t[i] === RIM ? mt.rim : mt.ramp[Math.max(0, Math.min(5, this.t[i] + 2))];
      const [R, G, B] = rgb(col);
      img.data.set([R, G, B, 255], i * 4);
    }
    ctx.putImageData(img, 0, 0);
    return { canvas: c, x0: this.x0, y0: this.y0 };
  }
}

// ---------------------------------------------------------------------------
// Accent lights (backdrop tint + rim light)
// ramp: [dark, mid, base, light], skinRim: softer rim used on skin
// ---------------------------------------------------------------------------

const ACCENTS = [
  { keys: [P.blue, P.cyan, P.navy], ramp: [P.ink, P.navy, P.blue, P.cyan], skinRim: P.silver },
  { keys: [P.red, P.darkRed, P.pink], ramp: [P.maroon, P.darkRed, P.red, P.pink], skinRim: P.pink },
  { keys: [P.green, P.darkGreen], ramp: [P.ink, P.darkGreen, P.green, P.cyan], skinRim: P.silver },
  { keys: [P.orange, P.yellow, P.rust], ramp: [P.maroon, P.rust, P.orange, P.yellow], skinRim: P.cream },
  { keys: [P.magenta, P.purple], ramp: [P.ink, P.purple, P.magenta, P.pink], skinRim: P.pink },
];
function accentOf(accent) {
  const a = accent ? String(accent).toLowerCase() : P.blue;
  return ACCENTS.find((e) => e.keys.includes(a)) || ACCENTS[0];
}

// ---------------------------------------------------------------------------
// Presenter designs
// ---------------------------------------------------------------------------

const DESIGN = {
  A: {
    rimSide: 1, // the video wall is on his right: rim light + shadow on screen right
    headTop: 36,
    face: { hw: 23, crownR: 24, cheekEnd: 43, cheekHW: 22, chinY: 64, chinHW: 9 },
    eyeY: 36,
    eyeX: 5, // gap from the centre line to the inner eye corner
    browY: 30,
    noseY: 49,
    mouthY: 57,
    earY: 32,
    neckHW: 12,
    skin: [P.cream, P.cream, P.skin, P.skinShade, P.brown, P.maroon],
    hair: [P.steel, P.purple, P.maroon, P.black, P.black, P.black],
    grey: [P.white, P.silver, P.fog, P.steel, P.slate, P.ink],
    brow: [P.maroon, P.black],
    lash: P.black,
    iris: [P.rust, P.brown],
    lips: { u: P.skinShade, K: P.brown, l: P.skinShade, h: P.skin, m: P.maroon, M: P.black, t: P.white, T: P.silver, g: P.pink },
  },
  B: {
    rimSide: -1,
    headTop: 38,
    face: { hw: 21, crownR: 23, cheekEnd: 41, cheekHW: 20, chinY: 61, chinHW: 7 },
    eyeY: 35,
    eyeX: 4,
    browY: 29,
    noseY: 47,
    mouthY: 55,
    earY: 31,
    neckHW: 9,
    lashes: true,
    skin: [P.cream, P.skin, P.tan, P.tanShade, P.brown, P.maroon],
    hair: [P.yellow, P.orange, P.rust, P.darkRed, P.maroon, P.black],
    brow: [P.brown, P.maroon],
    lash: P.black,
    iris: [P.green, P.darkGreen],
    lips: { u: P.darkRed, K: P.maroon, l: P.red, h: P.pink, m: P.maroon, M: P.black, t: P.white, T: P.silver, g: P.pink },
  },
};

function faceProfile(f) {
  const rows = [];
  for (let y = 0; ; y++) {
    let hw;
    if (y < f.crownR) {
      const d = (f.crownR - y - 0.5) / f.crownR;
      hw = f.hw * Math.sqrt(Math.max(0, 1 - d * d));
    } else if (y < f.cheekEnd) {
      hw = f.hw + (f.cheekHW - f.hw) * ((y - f.crownR) / (f.cheekEnd - f.crownR));
    } else if (y <= f.chinY) {
      const s = (y - f.cheekEnd) / (f.chinY - f.cheekEnd);
      hw = f.chinHW + (f.cheekHW - f.chinHW) * (1 - Math.pow(s, 1.7));
    } else {
      const k = y - f.chinY;
      if (k > 3) break;
      hw = [f.chinHW, f.chinHW - 1, f.chinHW - 2.5, f.chinHW - 5][k];
    }
    rows.push(Math.max(1, Math.round(hw)));
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Build: static presenter layers
// ---------------------------------------------------------------------------

function buildPresenter(id, acc) {
  const D = DESIGN[id];
  const side = D.rimSide; // +1: shadow + rim on screen right
  const sx = (x) => (side > 0 ? x : -1 - x); // design on the "rim right" frame, mirror for B
  const rimHard = acc.ramp[3];
  const mats = [null];
  const mat = (ramp, rim = rimHard) => mats.push({ ramp, rim }) - 1;

  const SKIN = mat(D.skin, acc.skinRim);
  const HAIR = mat(D.hair);
  const GREY = D.grey ? mat(D.grey) : HAIR;
  const SUIT = id === 'A' ? mat([P.steel, P.slate, P.ink, P.black, P.black, P.black], acc.ramp[2]) : mat([P.cyan, P.blue, P.blue, P.navy, P.ink, P.black], rimHard);
  const SHIRT = id === 'A' ? mat([P.white, P.white, P.white, P.silver, P.fog, P.steel]) : mat([P.white, P.white, P.cream, P.silver, P.fog, P.steel], P.white);
  const TIE = mat([P.pink, P.pink, P.red, P.darkRed, P.maroon, P.black], P.pink);
  const DARK = mat([P.steel, P.slate, P.black, P.black, P.black, P.black]);
  const prof = faceProfile(D.face);
  const chinBottom = prof.length - 1;
  const hwAt = (y) => prof[Math.max(0, Math.min(prof.length - 1, y))];

  // ===================== BODY (neck + torso) =====================
  const body = new Buf(-96, 44, 192, 140);
  const nhw = D.neckHW;
  const neckTop = D.mouthY - 4;
  const C = chinBottom + (id === 'A' ? 15 : 10); // collar line
  const lineX = (s, v) => (s < 0 ? -v - 1 : v); // pixel column for a mirrored offset
  body.rect(-nhw, neckTop, nhw * 2, C + 16 - neckTop, SKIN, 0);
  // jaw cast shadow on the neck (deeper in the middle) + shadow side of the neck
  for (let x = -nhw; x < nhw; x++) {
    const depth = Math.round(4 - (Math.abs(x + 0.5) / nhw) * 2);
    for (let y = neckTop; y < chinBottom + depth; y++) body.setTone(x, y, 2);
    for (let y = chinBottom + depth; y < C + 16; y++) body.setTone(x, y, side * (x + 0.5) > -3 ? 1 : 0);
  }
  for (let y = chinBottom + 2; y < C + 16; y++) body.setTone(sx(nhw - 1), y, 2);
  // neck muscle catching the key light
  body.toneLine(sx(-nhw + 2), chinBottom + 4, sx(-3), C + 2, -1, [SKIN]);

  const mirrorPts = (pts) => [...pts, ...pts.slice().reverse().map(([x, y]) => [-x, y])];
  if (id === 'A') {
    body.poly(
      mirrorPts([[-13, C - 10], [-20, C - 8], [-30, C - 6], [-42, C - 4], [-53, C - 2], [-62, C + 1], [-68, C + 5], [-72, C + 11], [-74, C + 19], [-75, C + 40], [-76, C + 80]]),
      SUIT,
    );
    // shirt V below the knot
    body.poly([[-11, C - 1], [11, C - 1], [3, C + 66], [-3, C + 66]], SHIRT);
    for (let y = C - 1; y < C + 70; y++) {
      for (let x = 0; x < 12; x++) body.setTone(sx(x), y, x > 3 ? 1 : 0, [SHIRT]);
      body.setTone(sx(-5), y, y > C + 12 ? 1 : 0, [SHIRT]);
    }
    // lapels (left one faces the key light)
    for (const s of [-1, 1]) {
      const lit = s !== side;
      body.poly([[s * 13, C - 10], [s * 20, C - 8], [s * 25, C + 18], [s * 22, C + 21], [s * 28, C + 24], [s * 6, C + 70], [s * 3, C + 66], [s * 12, C + 3]], SUIT, lit ? -1 : 1);
      // outer roll edge of the lapel
      for (let y = C + 24; y < C + 70; y++) body.setTone(lineX(s, Math.round(28 - ((y - C - 24) / 46) * 22)), y, lit ? 1 : 3, [SUIT]);
      // notch
      body.toneLine(lineX(s, 25), C + 18, lineX(s, 22), C + 21, 3, [SUIT]);
      body.toneLine(lineX(s, 22), C + 21, lineX(s, 27), C + 24, 3, [SUIT]);
      body.toneLine(lineX(s, 20), C - 7, lineX(s, 24), C + 17, lit ? 0 : 3, [SUIT]); // gorge seam
      // lapel edge along the shirt catches light on the lit side
      body.toneLine(lineX(s, 12), C + 4, lineX(s, 4), C + 62, lit ? -2 : 2, [SUIT]);
    }
    // the neck shows between the collar wings
    for (let y = C - 12; y < C + 2; y++) for (let x = -nhw + 1; x < nhw - 1; x++) body.set(x, y, SKIN, side * (x + 0.5) > 4 ? 2 : 1);
    // collar wings hugging the neck, meeting at the knot
    for (const s of [-1, 1]) {
      const lit = s !== side;
      body.poly([[s * 1, C + 1], [s * 10, C - 12], [s * 14, C - 10], [s * 15, C - 6], [s * 11, C + 9], [s * 4, C + 6]], SHIRT, lit ? 0 : 1);
      body.toneLine(lineX(s, 11), C + 9, lineX(s, 4), C + 6, lit ? 1 : 2, [SHIRT]);
      body.toneLine(lineX(s, 15), C - 6, lineX(s, 11), C + 9, lit ? 1 : 2, [SHIRT]);
      body.toneLine(lineX(s, 10), C - 11, lineX(s, 2), C + 1, lit ? -1 : 0, [SHIRT]);
    }
    // tie knot + blade
    body.poly([[-4, C], [4, C], [3, C + 8], [-3, C + 8]], TIE);
    body.poly([[-3, C + 8], [3, C + 8], [6, C + 70], [-6, C + 70]], TIE);
    for (let y = C; y < C + 72; y++) {
      for (let x = -7; x < 7; x++) {
        if (body.mat(x, y) !== TIE) continue;
        if (y === C + 8) body.setTone(x, y, 2);
        else if (y === C) body.setTone(x, y, 1);
        else if (side * (x + 0.5) > 1.5) body.setTone(x, y, 1);
      }
    }
    body.pts([[sx(-2), C + 2], [sx(-2), C + 3], [sx(-1), C + 2], [sx(-2), C + 11], [sx(-2), C + 12], [sx(-3), C + 15], [sx(-3), C + 16], [sx(-3), C + 17], [sx(-4), C + 25], [sx(-4), C + 26]], -1, [TIE]);
    body.pts([[0, C + 10], [-1, C + 10], [0, C + 11]], 2, [TIE]); // dimple
    // breast pocket welt + pocket square (wearer's left)
    for (let k = 0; k < 12; k++) body.setTone(sx(30 + k), C + 37 - Math.floor(k / 6), 3, [SUIT]);
    for (const [x, y, tn] of [[31, 36, 0], [32, 35, 0], [33, 36, 1], [35, 35, 0], [36, 34, 0], [37, 35, 1], [32, 36, 0], [36, 35, 1]]) body.set(sx(x), C + y, SHIRT, tn);
    // lapel mic
    for (const [x, y, tn] of [[-19, 26, -1], [-18, 26, 0], [-19, 27, 0], [-18, 27, 0], [-18, 28, 0]]) body.set(sx(x), C + y, DARK, tn);
  } else {
    body.poly(
      mirrorPts([[-11, C - 8], [-19, C - 6], [-29, C - 4], [-40, C - 2], [-49, C + 1], [-56, C + 5], [-61, C + 10], [-64, C + 17], [-65, C + 30], [-66, C + 80]]),
      SUIT,
    );
    // cream top inside the blazer, scoop neckline
    body.poly([[-16, C - 7], [16, C - 7], [9, C + 70], [-9, C + 70]], SHIRT);
    for (let y = C - 10; y < C + 12; y++) {
      for (let x = -16; x < 16; x++) {
        const dx = (x + 0.5) / 12;
        const dy = (y + 0.5 - (C - 9)) / 13;
        if (dx * dx + dy * dy <= 1 && body.mat(x, y) === SHIRT) body.set(x, y, SKIN, side * (x + 0.5) > 2 ? 1 : 0);
      }
    }
    for (let y = C - 10; y < C + 12; y++) {
      for (let x = -16; x < 16; x++) if (body.mat(x, y) === SKIN && body.mat(x, y + 1) === SHIRT) body.set(x, y + 1, SHIRT, -1); // hem
    }
    // collarbones
    body.pts([[sx(-3), C - 1], [sx(-4), C - 1], [sx(-5), C], [sx(-6), C], [sx(-7), C], [sx(-8), C + 1]], 1, [SKIN]);
    body.pts([[sx(2), C - 1], [sx(3), C - 1], [sx(4), C], [sx(5), C], [sx(6), C], [sx(7), C + 1]], 1, [SKIN]);
    body.pts([[sx(-5), C + 1], [sx(-6), C + 1], [sx(-7), C + 2]], -1, [SKIN]);
    // top shading + soft folds
    for (let y = C - 8; y < C + 72; y++) for (let x = Math.round(10 - (y - C) / 9); x < 20; x++) body.setTone(sx(x), y, 1, [SHIRT]);
    body.pts([[sx(-3), C + 16], [sx(-3), C + 17], [sx(-2), C + 22], [sx(-2), C + 23], [sx(-2), C + 24]], 1, [SHIRT]);
    // lapels (wide, softly rolled)
    for (const s of [-1, 1]) {
      const lit = s !== side;
      body.poly([[s * 11, C - 8], [s * 19, C - 6], [s * 28, C + 22], [s * 15, C + 72], [s * 8, C + 72], [s * 15, C + 2]], SUIT, lit ? 0 : 1);
      for (let y = C + 22; y < C + 72; y++) body.setTone(lineX(s, Math.round(28 - ((y - C - 22) / 50) * 13)), y, lit ? 1 : 2, [SUIT]);
      body.toneLine(lineX(s, 15), C + 2, lineX(s, 8), C + 70, lit ? -2 : 2, [SUIT]);
      body.toneLine(lineX(s, 19), C - 5, lineX(s, 27), C + 20, lit ? -2 : 2, [SUIT]);
    }
  }

  // torso light: shadow-side band, lit shoulder tops, folds, rim
  const shoulderPts = [];
  body.each((x, y) => {
    if (body.mat(x, y) !== SUIT) return;
    let d = 0;
    while (d < 9 && body.mat(x + side * (d + 1), y)) d++;
    if (d < 8 && y > C + 12) body.shift(x, y, 1, [SUIT]);
    let up = 0;
    while (up < 3 && body.mat(x, y - up - 1) === SUIT) up++;
    if (up < 2 && side * x < -20) shoulderPts.push([x, y]);
  });
  for (const [x, y] of shoulderPts) body.setTone(x, y, -1);
  for (const s of [-1, 1]) {
    const far = id === 'A' ? 72 : 62;
    const lit = s !== side;
    const fold = lit ? 1 : 2;
    const xo = (v) => (s < 0 ? -v - 1 : v);
    // armpit creases (short, curved)
    body.pts([[xo(far - 18), C + 34], [xo(far - 19), C + 35], [xo(far - 20), C + 37], [xo(far - 21), C + 38], [xo(far - 16), C + 42], [xo(far - 17), C + 43], [xo(far - 18), C + 45]], fold, [SUIT]);
    // sleeve seam
    body.toneLine(xo(far - 9), C + 18, xo(far - 7), C + 70, lit ? 1 : 3, [SUIT]);
  }
  body.each((x, y) => {
    if (body.edge(x, y, side, 0, [SUIT]) && y > C - 4) body.setTone(x, y, RIM);
    else if (body.edge(x, y, 0, -1, [SUIT]) && side * x > 14) body.setTone(x, y, RIM);
  });

  // ===================== HEAD (face, ears, nose) =====================
  const head = new Buf(-40, -8, 80, 86);
  for (let y = 0; y < prof.length; y++) head.span(-prof[y], prof[y] - 1, y, SKIN);
  // ears
  const ey = D.earY;
  const EAR = [2, 3, 4, 4, 4, 4, 4, 4, 3, 3, 3, 3, 2, 2, 1];
  for (const s of [-1, 1]) {
    for (let k = 0; k < EAR.length; k++) {
      const yy = ey + k;
      const hw = hwAt(yy);
      const out = EAR[k];
      if (s < 0) head.span(-hw - out, -hw, yy, SKIN, 0);
      else head.span(hw - 1, hw - 1 + out, yy, SKIN, 0);
    }
    const shadow = s === side;
    for (let k = 2; k < 13; k++) {
      const yy = ey + k;
      const hw = hwAt(yy);
      const xo = s < 0 ? -hw - 2 : hw + 1; // inner fold
      const xi = s < 0 ? -hw - 1 : hw;
      if (k < 11) head.setTone(xo, yy, k < 4 || k > 9 ? 1 : 2);
      if (k > 4 && k < 10) head.setTone(xi, yy, 1);
      if (shadow) head.setTone(s < 0 ? -hw - EAR[k] + 1 : hw - 2 + EAR[k], yy, 1);
    }
    // where the ear meets the head
    head.setTone(s < 0 ? -hwAt(ey + 13) : hwAt(ey + 13) - 1, ey + 13, 1);
  }

  // --- face shading (designed for key light from screen-left) ---
  for (let y = 0; y < prof.length; y++) {
    const hw = prof[y];
    const band = y < D.eyeY - 2 ? 3 : y < D.noseY ? 4 : y < D.mouthY + 2 ? 5 : 4;
    for (let k = 0; k < band; k++) head.setTone(sx(hw - 1 - k), y, 1, [SKIN]);
    if (y > D.noseY) head.setTone(sx(hw - 1), y, 2, [SKIN]);
    if (y > D.mouthY - 4) head.setTone(sx(-hw), y, 1, [SKIN]); // lit-side jaw outline
  }
  // chin underside
  for (let k = 0; k < 2; k++) {
    const y = chinBottom - k;
    for (let x = -prof[y]; x < prof[y]; x++) if (k === 0 || Math.abs(x + 0.5) > 3) head.setTone(x, y, 1, [SKIN]);
  }
  // eye sockets: shade under the brow ridge, deeper on the shadow side + inner corners
  const eY = D.eyeY;
  for (const s of [-1, 1]) {
    const shadow = s === side;
    const o = (k) => (s < 0 ? -D.eyeX - 1 - k : D.eyeX + k);
    for (let k = 0; k < 12; k++) if (shadow || k < 3) head.setTone(o(k), eY - 3, 1, [SKIN]);
    for (let y = eY - 3; y < eY + 2; y++) head.setTone(o(0), y, 1, [SKIN]);
    if (shadow) for (let y = eY - 1; y < eY + 4; y++) head.setTone(o(12), y, 1, [SKIN]);
    if (id === 'A') for (let k = 3; k < 8; k++) head.setTone(o(k), eY + 7, 1, [SKIN]); // the veteran's under-eye line
  }
  // small, deliberate highlights on the lit side
  head.pts([[sx(-9), 18], [sx(-8), 18], [sx(-10), 19]], -1, [SKIN]);
  head.pts(id === 'A' ? [[sx(-15), eY + 10]] : [[sx(-14), eY + 9], [sx(-13), eY + 9], [sx(-14), eY + 10]], -1, [SKIN]);
  // nose: bridge shadow, short bridge highlight, tip, wings, nostrils
  const nY = D.noseY;
  const big = id === 'A';
  for (let y = eY + 1; y < nY - 3; y++) head.setTone(sx(big ? 2 : 1), y, 1, [SKIN]);
  head.pts([[sx(-1), nY - 8], [sx(-1), nY - 7], [sx(-1), nY - 5]], -1, [SKIN]);
  const noseKey = { h: -1, b: 0, s: 1, d: 2, n: 3 };
  const noseRows = big
    ? ['...h..s.', '..sh..s.', '.s.hb.ss', 's......s', 'sdn..nds', '.ssssss.']
    : ['..h.s.', '.sh.s.', 's....s', 'sn..nd', '.ssss.'];
  noseRows.forEach((row, j) => {
    for (let k = 0; k < row.length; k++) {
      const tn = noseKey[row[k]];
      if (tn === undefined) continue;
      const x = -row.length / 2 + k;
      head.setTone(side > 0 ? x : -1 - x, nY - (big ? 4 : 3) + j, tn, [SKIN]);
    }
  });
  // cast shadow under the nose on the shadow side
  head.pts([[sx(2), nY + 2], [sx(3), nY + 2], [sx(4), nY + 2], [sx(3), nY + 3]], 1, [SKIN]);
  // under-lip shadow, chin light
  for (let x = -4; x < 4; x++) head.setTone(x, D.mouthY + 4, 1, [SKIN]);
  head.pts([[sx(-2), chinBottom - 4], [sx(-1), chinBottom - 4]], -1, [SKIN]);
  if (id === 'A') {
    // short nasolabial folds
    for (const s of [-1, 1]) {
      const o = (x) => (s < 0 ? -1 - x : x);
      head.pts([[o(7), nY + 1], [o(8), nY + 2], [o(8), nY + 3], [o(9), nY + 4]], 1, [SKIN]);
    }
  }
  // ===================== HAIR =====================
  const front = new Buf(-34, -8, 68, 50);
  const back = new Buf(-34, -8, 68, 70);
  if (id === 'A') {
    front.ascii(PACO_HAIR, -26, -3, {
      k: [HAIR, 1], m: [HAIR, 0], p: [HAIR, -1], s: [HAIR, -2], g: [GREY, 0], G: [GREY, 1], w: [GREY, -1], r: [HAIR, RIM],
    });
  } else {
    const key = { y: [HAIR, -2], o: [HAIR, -1], R: [HAIR, 0], d: [HAIR, 1], M: [HAIR, 2], c: [HAIR, RIM] };
    back.ascii(LOLA_BACK, -31, -6, key);
    front.ascii(LOLA_FRONT, -31, -6, key);
  }
  // rim light on the shadow-side silhouette of face and ears (not where hair sits behind)
  head.each((x, y) => {
    if (head.edge(x, y, side, 0, [SKIN]) && !back.mat(x + side, y) && y > 14 && y < chinBottom - 2) head.setTone(x, y, RIM);
  });
  // soft shadow the hair casts onto the forehead
  head.each((x, y) => {
    if (head.mat(x, y) === SKIN && front.mat(x, y - 1) && !front.mat(x, y) && head.tone(x, y) !== RIM) head.shift(x, y, 1);
  });

  // glasses (front layer): thin metal frames, rounded corners, glints
  if (id === 'A') {
    const METAL = mat([P.white, P.silver, P.fog, P.steel, P.slate, P.ink], P.white);
    const gy = eY - 3;
    const w = EYE_W + 4;
    const h = 10;
    for (const s of [-1, 1]) {
      const shadow = s === side;
      const x0 = s < 0 ? -D.eyeX - EYE_W - 2 : D.eyeX - 2;
      for (let x = x0 + 1; x < x0 + w - 1; x++) {
        front.set(x, gy, METAL, shadow ? 1 : 0);
        front.set(x, gy + h - 1, METAL, shadow ? 2 : 1);
      }
      for (let y = gy + 1; y < gy + h - 1; y++) {
        front.set(x0, y, METAL, shadow ? 1 : 0);
        front.set(x0 + w - 1, y, METAL, shadow ? 2 : 1);
      }
      front.set(x0 + 1, gy, METAL, -2);
      front.set(x0 + 2, gy, METAL, -1);
      front.set(x0, gy + 1, METAL, -1);
      // temple arm to the ear
      const yA = gy + 2;
      const from = s < 0 ? x0 - 1 : x0 + w;
      const to = s < 0 ? -hwAt(yA) - 1 : hwAt(yA);
      for (let x = Math.min(from, to); x <= Math.max(from, to); x++) front.set(x, yA, METAL, shadow ? 2 : 1);
    }
    front.span(-D.eyeX + 3, D.eyeX - 4, gy + 1, METAL, 0);
    front.set(sx(-2), gy + 1, METAL, -1);
  }

  return {
    body: body.render(mats),
    head: head.render(mats),
    front: front.render(mats),
    back: back.render(mats),
  };
}

// ---------------------------------------------------------------------------
// Dynamic face parts (drawn per frame)
// ---------------------------------------------------------------------------

// Eye opening for the screen-left eye; outer corner at column 0.
const EYE_W = 11;
const EYE_TOP = [3, 2, 1, 0, 0, 0, 0, 0, 1, 2, 3];
const EYE_BOT = [4, 5, 5, 6, 6, 6, 6, 6, 5, 5, 4];
// 5x5 iris, rounded; P = pupil, H = catch light, i = iris, d = dark iris
const IRIS = ['.ddd.', 'dHPPi', 'iPPPi', 'iiPii', '.iii.'];
const IRIS_SMALL = ['.ddd.', 'diiii', 'iHPii', 'iiiii', '.iii.'];

function eyeShape(emotion, blinkPhase) {
  let top = EYE_TOP.slice();
  let bot = EYE_BOT.slice();
  const mid = (i) => i > 0 && i < EYE_W - 1;
  switch (emotion) {
    case 'surprised':
      top = top.map((v, i) => (mid(i) ? v - 1 : v));
      break;
    case 'happy':
      bot = bot.map((v, i) => (i > 1 && i < EYE_W - 2 ? v - 1 : v));
      break;
    case 'serious':
      top = top.map((v, i) => (mid(i) ? v + 1 : v));
      break;
    case 'sad':
      top = top.map((v, i) => (i < 6 ? v + 1 : v));
      break;
    case 'thinking':
      top = top.map((v, i) => (mid(i) ? v + 1 : v));
      bot = bot.map((v, i) => (i > 2 && i < EYE_W - 2 ? v - 1 : v));
      break;
    default:
  }
  if (blinkPhase === 1) top = top.map((v, i) => Math.max(v, bot[i] - 2));
  return { top, bot };
}

function drawEye(ctx, x0, y0, flip, D, st, look, lookY) {
  const { top, bot } = eyeShape(st.emotion, st.blinkPhase);
  const X = (c) => (flip ? x0 + EYE_W - 1 - c : x0 + c);
  const lash = D.lash;
  const out = flip ? 1 : -1; // direction of the outer corner
  if (st.blinkPhase === 2) {
    // closed lid: skin over the eye, lash line curving down
    for (let c = 0; c < EYE_W; c++) {
      const y = y0 + Math.max(top[c], bot[c] - 1);
      if (y > y0 + top[c]) rect(ctx, X(c), y0 + top[c], 1, y - (y0 + top[c]), D.skin[2]);
      rect(ctx, X(c), y0 + top[c] - 1, 1, 1, D.skin[3]);
      rect(ctx, X(c), y, 1, 1, c === 0 || c === EYE_W - 1 ? D.skin[3] : lash);
    }
    if (D.lashes) rect(ctx, X(0) + out, y0 + bot[0] - 1, 1, 1, lash);
    return;
  }
  for (let c = 0; c < EYE_W; c++) {
    const h = bot[c] - top[c] - 1;
    if (h > 0) {
      rect(ctx, X(c), y0 + top[c] + 1, 1, h, P.white);
      rect(ctx, X(c), y0 + top[c] + 1, 1, 1, P.silver);
    }
  }
  // iris + pupil (not mirrored, so both catch lights agree)
  const iris = st.emotion === 'surprised' ? IRIS_SMALL : IRIS;
  const ix = x0 + 3 + look;
  const iy = y0 + 1 + lookY;
  const key = { P: P.black, H: P.white, i: D.iris[0], d: D.iris[1] };
  for (let rr = 0; rr < 5; rr++) {
    for (let c = 0; c < 5; c++) {
      const ch = iris[rr][c];
      if (ch === '.') continue;
      const col = ix + c;
      const cc = flip ? EYE_W - 1 - (col - x0) : col - x0;
      if (cc < 0 || cc >= EYE_W) continue;
      const yy = iy + rr;
      if (yy <= y0 + top[cc] || yy >= y0 + bot[cc]) continue;
      rect(ctx, col, yy, 1, 1, yy === y0 + top[cc] + 1 && ch !== 'H' ? D.iris[1] : key[ch]);
    }
  }
  // upper lid line (+ lashes), lower lid
  for (let c = 0; c < EYE_W; c++) rect(ctx, X(c), y0 + top[c], 1, 1, lash);
  rect(ctx, X(0) + out, y0 + top[0], 1, 1, lash);
  if (D.lashes) {
    rect(ctx, X(0) + out * 2, y0 + top[0] - 1, 1, 1, lash);
    for (let c = 0; c < 5; c++) rect(ctx, X(c), y0 + top[c] - 1, 1, 1, lash);
  } else {
    for (let c = 2; c < EYE_W - 1; c++) rect(ctx, X(c), y0 + top[c] - 2, 1, 1, D.skin[3]); // lid crease
  }
  for (let c = 1; c < EYE_W - 1; c++) rect(ctx, X(c), y0 + bot[c], 1, 1, D.skin[3]);
  if (st.emotion === 'happy') for (let c = 2; c < EYE_W - 2; c++) rect(ctx, X(c), y0 + bot[c] + 1, 1, 1, D.skin[1]);
}

// Brow heights per column (outer -> inner), smaller = higher.
const BROWS = {
  neutral: [2, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1],
  happy: [1, 0, -1, -1, -1, -1, -1, -1, 0, 0, 0, 1],
  serious: [0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3],
  surprised: [0, -1, -2, -3, -3, -3, -3, -3, -2, -2, -2, -1],
  sad: [3, 3, 2, 2, 1, 1, 0, 0, -1, -1, -2, -2],
  thinkingHi: [1, -1, -2, -2, -2, -2, -2, -2, -1, -1, 0, 0],
  thinkingLo: [1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2],
};

function drawBrow(ctx, x0, y0, flip, shape, D) {
  for (let c = 0; c < 12; c++) {
    const x = flip ? x0 + 11 - c : x0 + c;
    const y = y0 + shape[c];
    rect(ctx, x, y, 1, 1, D.brow[0]);
    if (c > 1 && c < 11) rect(ctx, x, y + 1, 1, 1, D.brow[1]);
  }
}

// Mouth sprites: 16 wide, centred between columns 7 and 8; row 1 is the lip line.
const MOUTHS = {
  neutral: ['....uuuuuuuu....', '..KKKKKKKKKKKK..', '....llllllll....', '.....hhhhhh.....'],
  happy: ['.K............K.', '..KuuuuuuuuuuK..', '...KKKKKKKKKK...', '....llllllll....', '.....hhhhhh.....'],
  serious: ['...uuuuuuuuuu...', '..KKKKKKKKKKKK..', '.K..llllllll..K.', '.....hhhhhh.....'],
  surprised: ['......uuuu......', '.....KmmmmK.....', '.....KmmmmK.....', '......llll......', '......hhhh......'],
  sad: ['....uuuuuuuu....', '...KKKKKKKKKK...', '..K.llllllll.K..', '.K...hhhhhh...K.'],
  thinking: ['.....uuuuuuu....', '....KKKKKKKKK...', '.........llllK..', '......llllhh....'],
  E: ['...uuuuuuuuuu...', '..KttttttttttK..', '...KmmmmmmmmK...', '....llllllll....', '.....hhhhhh.....'],
  O: ['.....uuuuuu.....', '....KttttttK....', '....KmmggmmK....', '.....KllllK.....', '......hhhh......'],
  happyE: ['.K............K.', '..KuuuuuuuuuuK..', '...KttttttttK...', '....KmmmmmmK....', '.....llllll.....', '......hhhh......'],
  A: ['...uuuuuuuuuu...', '..KttttttttttK..', '..KmTTTTTTTTmK..', '..KmmmmmmmmmmK..', '...KmmggggmmK...', '....KllllllK....', '.....hhhhhh.....'],
  AO: ['......uuuu......', '....uuttttuu....', '...KtTTTTTTtK...', '...KmmmmmmmmK...', '...KmmggggmmK...', '....KllllllK....', '.....lhhhhl.....'],
  happyA: ['.K............K.', '..KuuuuuuuuuuK..', '..KttttttttttK..', '..KmmmmmmmmmmK..', '...KmmggggmmK...', '....KllllllK....', '.....hhhhhh.....'],
};

function mouthName(st, id) {
  const e = st.emotion;
  if (!(st.mouth > 0)) return e in MOUTHS ? e : 'neutral';
  const round = e === 'surprised' || hash(Math.floor(st.t * 7), id === 'A' ? 1 : 2) < 0.35;
  if (st.mouth === 1) return e === 'happy' ? 'happyE' : round ? 'O' : 'E';
  return e === 'happy' ? 'happyA' : round ? 'AO' : 'A';
}

function drawMouth(ctx, cx, y, D, name) {
  const rows = MOUTHS[name];
  const lift = name === 'happy' || name === 'happyE' || name === 'happyA' ? -1 : 0;
  sprite(ctx, rows, D.lips, cx - 8, y + lift);
}

const MUSTACHE = ['.....kmmmmmmk.....', '...kmpmmpmmmmmmk..', '..kmpmmpmmmmmmmkk.', '.kmpmmpmmmmmmmmmkk', '.kmmkmmmkmmmkmmkkk', 'kmk............kkk'];
const MUSTACHE_KEY = { k: P.black, m: P.maroon, p: P.purple };

// ---------------------------------------------------------------------------
// Backdrop (cached) + animated lights
// ---------------------------------------------------------------------------

function skyKey() {
  const { h } = zoneTime();
  if (h >= 8 && h < 18) return 'day';
  if ((h >= 18 && h < 21) || (h >= 6 && h < 8)) return 'dusk';
  return 'night';
}
const SKY = {
  day: { far: P.navy, mid: P.blue, near: P.cyan, b: [P.slate, P.steel], lights: [P.white, P.silver] },
  dusk: { far: P.purple, mid: P.magenta, near: P.orange, b: [P.ink, P.maroon], lights: [P.yellow, P.cream] },
  night: { far: P.black, mid: P.ink, near: P.navy, b: [P.black, P.ink], lights: [P.yellow, P.orange] },
};

// Rounded rectangle (2px corner cut).
function rrect(ctx, x, y, w, h, c) {
  if (w <= 4 || h <= 4) return rect(ctx, x, y, w, h, c);
  rect(ctx, x + 2, y, w - 4, h, c);
  rect(ctx, x + 1, y + 1, w - 2, h - 2, c);
  rect(ctx, x, y + 2, w, h - 4, c);
}

// Out-of-focus shape: a solid core with stepped translucent rings around it.
function blurRect(ctx, x, y, w, h, c, rings = 2, step = 2, alpha = 0.35) {
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let k = rings; k > 0; k--) rrect(ctx, x - k * step, y - k * step, w + k * step * 2, h + k * step * 2, c);
  ctx.restore();
  rrect(ctx, x, y, w, h, c);
}

function blurDisc(ctx, x, y, rad, c, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha * 0.35;
  disc(ctx, x, y, rad + 1, c);
  ctx.globalAlpha = alpha;
  disc(ctx, x, y, rad, c);
  ctx.restore();
}

function viewOf(id, side) {
  const mir = DESIGN[id].rimSide < 0; // B sees the studio mirrored
  const shift = side === 'left' ? -28 : side === 'right' ? 28 : 0;
  return { mir, X: (x, w = 0) => (mir ? W - x - w : x) + shift };
}

const WALL_SCREEN = { x: 214, y: 14, w: 220, h: 122 };
const WINDOW = { x: -40, y: 22, w: 172, h: 118 };

function buildBackdrop(id, side, acc, sky) {
  const [c, ctx] = makeCanvas(W, H);
  const { X, mir } = viewOf(id, side);
  const S = SKY[sky];
  const [dk, md, base] = acc.ramp;
  rect(ctx, 0, 0, W, H, P.ink);
  // soft wall panels between window and screen
  blurRect(ctx, X(150, 34), 18, 34, 140, P.slate, 2, 2, 0.4);
  blurRect(ctx, X(-80, 30), 18, 30, 140, P.slate, 2, 2, 0.4);
  // --- the city window ---
  const wx = X(WINDOW.x, WINDOW.w);
  const wy = WINDOW.y;
  blurRect(ctx, wx - 3, wy - 3, WINDOW.w + 6, WINDOW.h + 6, P.slate, 2, 2, 0.45);
  const bands = [S.far, S.mid, S.near];
  rrect(ctx, wx, wy, WINDOW.w, WINDOW.h, S.far);
  ctx.save();
  ctx.beginPath();
  ctx.rect(wx + 1, wy + 1, WINDOW.w - 2, WINDOW.h - 2);
  ctx.clip();
  for (let k = 1; k < bands.length; k++) {
    const by = wy + 18 + k * 22;
    ctx.globalAlpha = 0.5;
    rect(ctx, wx, by - 4, WINDOW.w, WINDOW.h, bands[k]);
    ctx.globalAlpha = 1;
    rect(ctx, wx, by, WINDOW.w, WINDOW.h, bands[k]);
  }
  // blurred skyline
  for (let i = 0; i < 7; i++) {
    const bw = 18 + Math.floor(hash(i, 3) * 14);
    const bx = wx - 6 + i * 26 + Math.floor(hash(i, 4) * 8);
    const bh = 30 + Math.floor(hash(i, 5) * 40);
    blurRect(ctx, bx, wy + WINDOW.h - bh, bw, bh + 6, S.b[i % 2], 2, 2, 0.45);
  }
  ctx.restore();
  blurRect(ctx, X(68, 8), wy - 4, 8, WINDOW.h + 8, P.slate, 2, 2, 0.5); // mullion
  // --- the video wall ---
  const v = WALL_SCREEN;
  const vx = X(v.x, v.w);
  ctx.save();
  ctx.globalAlpha = 0.16;
  for (let k = 4; k > 0; k--) rrect(ctx, vx - k * 3, v.y - k * 3, v.w + k * 6, v.h + k * 6, base);
  ctx.restore();
  blurRect(ctx, vx - 3, v.y - 3, v.w + 6, v.h + 6, P.black, 1, 2, 0.5);
  rrect(ctx, vx, v.y, v.w, v.h, md);
  ctx.save();
  ctx.beginPath();
  ctx.rect(vx, v.y, v.w, v.h);
  ctx.clip();
  // defocused diagonal stripes from the wall graphics
  for (let k = -6; k < 12; k++) {
    for (let e = 0; e < 3; e++) {
      ctx.globalAlpha = e === 1 ? 0.5 : 0.25;
      const off = e === 0 ? -2 : e === 2 ? 2 : 0;
      for (let yy = 0; yy < v.h; yy += 2) rect(ctx, vx + k * 30 + (mir ? v.h - yy : yy) + off, v.y + yy, 12, 2, dk);
    }
  }
  ctx.restore();
  // truss + floor shadow
  rect(ctx, 0, 0, W, 9, P.black);
  ctx.globalAlpha = 0.5;
  rect(ctx, 0, 9, W, 2, P.black);
  rect(ctx, 0, 146, W, 4, P.black);
  ctx.globalAlpha = 1;
  rect(ctx, 0, 150, W, H - 150, P.black);
  return c;
}

const BOKEH = Array.from({ length: 24 }, (_, i) => ({
  u: hash(i, 11),
  v: hash(i, 12),
  r: 2 + Math.floor(hash(i, 13) * 4),
  ph: hash(i, 14) * 6.283,
  sp: 0.25 + hash(i, 15) * 0.4,
  hot: hash(i, 16) > 0.6,
}));

function drawLights(ctx, t, id, side, acc, sky, calm, headX) {
  const { X } = viewOf(id, side);
  const S = SKY[sky];
  const [, md, base, hi] = acc.ramp;
  const inCalm = (x, y, r) => calm && x + r > calm.x - 6 && x - r < calm.x + calm.w + 6 && y + r > calm.y - 6 && y - r < calm.y + calm.h + 6;
  const nearHead = (x, y, r) => Math.abs(x - headX) < 40 + r && y < 140;
  // warm truss lamps
  for (let i = -1; i < 8; i++) {
    const x = X(i * 56 + 24);
    const flick = Math.sin(t * 0.6 + i * 2.1) > 0.85;
    blurDisc(ctx, x, 2, 5, P.rust, 0.8);
    disc(ctx, x, 2, 3, P.orange);
    disc(ctx, x, 2, 1, flick ? P.white : P.yellow);
  }
  // video wall: rotating globe + slow light sweep
  const v = WALL_SCREEN;
  const vx = X(v.x, v.w);
  ctx.save();
  ctx.beginPath();
  ctx.rect(vx, v.y, v.w, v.h);
  ctx.clip();
  const gx = X(v.x + 92);
  const gy = v.y + 58;
  if (!inCalm(gx, gy, 24) && !nearHead(gx, gy, 24)) {
    blurDisc(ctx, gx, gy, 22, base, 0.55);
    ctx.save();
    ctx.beginPath();
    ctx.arc(gx + 0.5, gy + 0.5, 22, 0, Math.PI * 2);
    ctx.clip();
    for (let i = 0; i < 4; i++) {
      const lx = gx - 34 + Math.round((t * 4 + i * 23) % 70);
      const ly = gy - 12 + Math.round(hash(i, 21) * 22);
      blurDisc(ctx, lx, ly, 5 + (i % 3) * 2, P.green, 0.45);
    }
    ctx.restore();
    disc(ctx, gx - 8, gy - 10, 3, hi);
  }
  const sweep = vx - 40 + Math.round((t * 10) % (v.w + 80));
  if (!inCalm(sweep + 12, 70, 30)) {
    ctx.globalAlpha = 0.12;
    rect(ctx, sweep, v.y, 26, v.h, hi);
    rect(ctx, sweep + 6, v.y, 14, v.h, hi);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  // bokeh: accent lights on the wall side, city lights in the window
  for (let i = 0; i < BOKEH.length; i++) {
    const b = BOKEH[i];
    const wall = i % 2 === 0;
    const cx = wall ? v.x + 8 + b.u * (v.w - 16) : WINDOW.x + 10 + b.u * (WINDOW.w - 20);
    const cy = wall ? v.y + 8 + b.v * (v.h - 16) : WINDOW.y + 30 + b.v * (WINDOW.h - 40);
    const x = X(Math.round(cx + Math.sin(t * b.sp + b.ph) * 3));
    const y = Math.round(cy + Math.cos(t * b.sp * 0.8 + b.ph) * 2);
    const rr = b.r + (Math.sin(t * b.sp * 3 + b.ph) > 0.75 ? 1 : 0);
    if (inCalm(x, y, rr) || nearHead(x, y, rr)) continue;
    const col = wall ? (b.hot ? hi : base) : b.hot ? S.lights[0] : S.lights[1];
    blurDisc(ctx, x, y, rr, col, b.hot ? 0.75 : 0.5);
    if (b.hot && rr > 2) disc(ctx, x, y, rr - 2, wall ? P.white : col);
  }
}

// ---------------------------------------------------------------------------
// Hands
// ---------------------------------------------------------------------------

function buildHand(id, acc) {
  const D = DESIGN[id];
  const mats = [null];
  const mat = (ramp, r = acc.ramp[3]) => mats.push({ ramp, rim: r }) - 1;
  const SKIN = mat(D.skin, acc.skinRim);
  const SLEEVE = id === 'A' ? mat([P.steel, P.slate, P.ink, P.black, P.black, P.black], acc.ramp[2]) : mat([P.cyan, P.blue, P.blue, P.navy, P.ink, P.black]);
  const CUFF = id === 'A' ? mat([P.white, P.white, P.white, P.silver, P.fog, P.steel]) : mat([P.white, P.cream, P.yellow, P.orange, P.rust, P.brown], P.white);
  const b = new Buf(-16, -32, 32, 76);
  if (id === 'A') {
    // open palm facing camera, fingers together, thumb out
    const fingers = [[-7, -22], [-3, -26], [1, -25], [5, -21]];
    for (const [fx, fy] of fingers) {
      b.rect(fx, fy + 1, 4, -fy - 1, SKIN);
      b.span(fx + 1, fx + 2, fy, SKIN);
    }
    b.rect(-8, -10, 17, 13, SKIN);
    b.poly([[-8, -6], [-13, -13], [-15, -12], [-11, -2], [-8, 2]], SKIN);
    for (const [fx] of fingers.slice(1)) for (let y = -19; y < -9; y++) b.setTone(fx, y, 1);
    b.toneLine(-6, -4, 5, -6, 1);
    b.toneLine(-6, 0, -1, -1, 1);
    b.pts([[-6, -21], [-2, -25], [2, -24], [6, -20]], -1);
  } else {
    // pointing up: fist with index finger raised
    b.rect(-6, -27, 4, 19, SKIN);
    b.span(-5, -4, -28, SKIN);
    b.rect(-8, -10, 15, 12, SKIN);
    b.span(-7, 5, -11, SKIN);
    for (const x of [-2, 1, 4]) for (let y = -10; y < -6; y++) b.setTone(x, y, 1);
    b.poly([[-8, -5], [3, -7], [4, -4], [-8, -2]], SKIN, 1);
    b.toneLine(-8, -5, 3, -7, 0);
    b.pts([[-5, -25], [-5, -24], [-5, -23]], -1);
  }
  b.each((x, y) => {
    if (b.mat(x, y) !== SKIN) return;
    if (b.edge(x, y, D.rimSide, 0) || b.edge(x, y, 0, 1)) b.setTone(x, y, 1);
  });
  if (id === 'A') {
    b.rect(-9, 3, 18, 4, CUFF);
    b.span(-9, 8, 6, CUFF, 1);
    b.rect(-11, 7, 22, 36, SLEEVE);
  } else {
    b.rect(-8, 2, 15, 2, CUFF);
    b.set(-6, 2, CUFF, -2);
    b.rect(-10, 4, 19, 38, SLEEVE);
  }
  b.each((x, y) => {
    if (b.edge(x, y, D.rimSide, 0)) b.setTone(x, y, RIM);
  });
  return b.render(mats);
}

// ---------------------------------------------------------------------------
// Desk edge
// ---------------------------------------------------------------------------

function buildDesk(acc) {
  const [c, ctx] = makeCanvas(W, H - 180);
  const [, md, base, hi] = acc.ramp;
  rect(ctx, 0, 2, W, 1, P.white);
  rect(ctx, 0, 3, W, 3, P.silver);
  rect(ctx, 0, 6, W, 1, P.fog);
  rect(ctx, 0, 7, W, H, P.navy);
  rect(ctx, 0, 7, W, 1, P.ink);
  rect(ctx, 0, 15, W, 1, hi);
  rect(ctx, 0, 16, W, 1, base);
  rect(ctx, 0, 29, W, 1, md);
  return c;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const cache = new Map();
function cached(key, make) {
  let v = cache.get(key);
  if (!v) {
    v = make();
    cache.set(key, v);
  }
  return v;
}

let skyMemo = { at: -1e9, key: 'day' };
function currentSky() {
  const now = Date.now();
  if (now - skyMemo.at > 10000) skyMemo = { at: now, key: skyKey() };
  return skyMemo.key;
}

const live = {};
const BUST_X = { center: 192, left: 118, right: 266 };
const CALM = { left: { x: 238, y: 26, w: 128, h: 72 }, right: { x: 18, y: 26, w: 128, h: 72 } };

/**
 * Draw the whole 384x216 close-up frame for presenter `id` ('A' | 'B').
 * state: { t, speaking, emotion, mouth (0..2), blink, look (-1..1), bob, gesture }
 */
export function drawCloseup(ctx, t, id, state, { side = 'center', accent = null } = {}) {
  id = id === 'B' ? 'B' : 'A';
  if (!BUST_X[side]) side = 'center';
  const D = DESIGN[id];
  const st = state || {};
  const acc = accentOf(accent);
  const sky = currentSky();
  const bg = cached(`bg|${id}|${side}|${acc.ramp[2]}|${sky}`, () => buildBackdrop(id, side, acc, sky));
  const L = cached(`p|${id}|${acc.ramp[2]}`, () => buildPresenter(id, acc));
  const desk = cached(`desk|${acc.ramp[2]}`, () => buildDesk(acc));

  // ----- animation state (gesture easing, blink phases) -----
  const a = (live[id] ||= { g: 0, lastT: null, blinkOn: false, blinkSince: -1, blinkOff: -1 });
  const dt = a.lastT === null ? 1 : Math.max(0, Math.min(0.25, t - a.lastT));
  a.lastT = t;
  const target = st.gesture ? 1 : 0;
  a.g += Math.sign(target - a.g) * Math.min(Math.abs(target - a.g), dt / 0.22);
  if (st.blink && !a.blinkOn) a.blinkSince = t;
  if (!st.blink && a.blinkOn) a.blinkOff = t;
  a.blinkOn = !!st.blink;
  let blinkPhase = 0;
  if (st.blink) blinkPhase = t - a.blinkSince < 0.035 ? 1 : 2;
  else if (t - a.blinkOff < 0.045 && t >= a.blinkOff) blinkPhase = 1;

  const emotion = st.emotion || 'neutral';
  const mouth = Math.max(0, Math.min(2, st.mouth | 0));
  const breath = Math.sin(t * 1.3 + (id === 'A' ? 0 : 2)) > 0.6 ? -1 : 0;
  const bob = st.bob ? 1 : 0;
  const tilt = emotion === 'thinking' && Math.sin(t * 0.8) > -0.3 ? -D.rimSide : 0;
  const cx = BUST_X[side];
  const top = D.headTop + breath;
  const hx = cx + tilt;
  const hy = top + bob;

  // ----- backdrop -----
  ctx.drawImage(bg, 0, 0);
  drawLights(ctx, t, id, side, acc, sky, CALM[side], BUST_X[side]);

  // ----- presenter -----
  const blit = (layer, x, y) => ctx.drawImage(layer.canvas, x + layer.x0, y + layer.y0);
  blit(L.back, hx, hy);
  blit(L.body, cx, top);
  // head, split at the mouth so wide vowels drop the jaw by a pixel
  const jaw = mouth === 2 ? 1 : 0;
  const hl = L.head;
  const seamRow = D.mouthY + 1 - hl.y0;
  const cw = hl.canvas.width;
  ctx.drawImage(hl.canvas, 0, 0, cw, seamRow, hx + hl.x0, hy + hl.y0, cw, seamRow);
  for (let j = 0; j <= jaw; j++) ctx.drawImage(hl.canvas, 0, seamRow, cw, hl.canvas.height - seamRow, hx + hl.x0, hy + D.mouthY + 1 + j, cw, hl.canvas.height - seamRow);

  // eyes
  let lx = st.look > 0 ? 1 : st.look < 0 ? -1 : 0;
  let ly = 0;
  if (emotion === 'thinking') {
    lx = -D.rimSide;
    ly = -1;
  }
  const fst = { emotion, blinkPhase };
  const eyeTop = hy + D.eyeY - 1;
  drawEye(ctx, hx - D.eyeX - EYE_W, eyeTop, false, D, fst, lx, ly);
  drawEye(ctx, hx + D.eyeX, eyeTop, true, D, fst, lx, ly);
  // brows (a little lift on stressed syllables)
  let bl = BROWS[emotion] || BROWS.neutral;
  let br = bl;
  if (emotion === 'thinking') {
    bl = D.rimSide > 0 ? BROWS.thinkingHi : BROWS.thinkingLo;
    br = D.rimSide > 0 ? BROWS.thinkingLo : BROWS.thinkingHi;
  }
  const lift = st.speaking && mouth === 2 && hash(Math.floor(t * 2.5), id === 'A' ? 5 : 6) < 0.35 ? -1 : 0;
  drawBrow(ctx, hx - D.eyeX - 12, hy + D.browY + lift, false, bl, D);
  drawBrow(ctx, hx + D.eyeX, hy + D.browY + lift, true, br, D);
  if (emotion === 'happy') {
    for (const s of [-1, 1]) rect(ctx, s < 0 ? hx - D.eyeX - 9 : hx + D.eyeX + 6, hy + D.eyeY + 8, 3, 1, P.pink);
  }
  // mouth
  drawMouth(ctx, hx, hy + D.mouthY - 1 + (jaw && false ? 1 : 0), D, mouthName({ emotion, mouth, t }, id));
  if (id === 'A') sprite(ctx, MUSTACHE, MUSTACHE_KEY, hx - 9, hy + D.mouthY - 5, D.rimSide < 0);

  blit(L.front, hx, hy);

  // earrings + necklace
  if (id === 'B') {
    const swing = st.speaking ? Math.round(Math.sin(t * 4.2)) : Math.round(Math.sin(t * 1.3) * 0.6);
    for (const s of [-1, 1]) {
      const ex = s < 0 ? hx - D.face.cheekHW - 2 : hx + D.face.cheekHW + 1;
      const ey = hy + D.earY + 14;
      rect(ctx, ex, ey, 1, 2, P.orange);
      const dx = ex + swing * (s < 0 ? 1 : 1);
      rect(ctx, dx - 1, ey + 2, 3, 3, P.yellow);
      rect(ctx, dx - 1, ey + 4, 3, 1, P.orange);
      rect(ctx, dx, ey + 5, 1, 1, P.orange);
      rect(ctx, dx - (D.rimSide > 0 ? 1 : -1), ey + 2, 1, 1, P.white);
    }
    const ny = top + 72;
    for (let x = -11; x < 11; x++) {
      const d = (x + 0.5) / 11;
      const yy = ny + Math.round(d * d * -7) + 7;
      rect(ctx, cx + x, yy, 1, 1, (x + 20) % 3 === 0 ? P.orange : P.yellow);
    }
    rect(ctx, cx - 1, ny + 8, 2, 3, P.yellow);
    rect(ctx, cx - 1, ny + 10, 2, 1, P.orange);
    rect(ctx, cx, ny + 8, 1, 1, P.white);
  }

  // gesture hand rising from the desk
  if (a.g > 0) {
    const hand = cached(`hand|${id}|${acc.ramp[2]}`, () => buildHand(id, acc));
    const ease = 1 - (1 - a.g) ** 3;
    const hs = side === 'left' ? 1 : side === 'right' ? -1 : D.rimSide;
    const handX = cx + hs * (id === 'A' ? 50 : 44);
    const handY = 154 + Math.round((1 - ease) * 48);
    ctx.drawImage(hand.canvas, handX + hand.x0, handY + hand.y0);
  }

  ctx.drawImage(desk, 0, 180);
}

// ---------------------------------------------------------------------------
// Hand-placed hair maps (see the key in buildPresenter)
// ---------------------------------------------------------------------------

// @@HAIR_MAPS_START
const PACO_HAIR = [
  '....................mmmmmmmmmmmrrr..................',
  '.................mmmmkmmmmmmmmmmmmrrr...............',
  '...............mmmmmmkmmmmssmmpmmmmmkrr.............',
  '.............mmmmmmmkmmmpspppmmpppmmmmkrr...........',
  '...........mmmmmmmmmkmmpppmmmmmppmmppmmmkrr.........',
  '..........mmmmmmmmmkpmmmmmmmmmmmmmmmppmmkkkr........',
  '.........mmmmmspmmmkpmmmmmmmmmmmmmmmmmmmmkkkr.......',
  '........mmmmpppmmmkpmmmmmmmmmmmmmmmmmmmmmmkkkr......',
  '.......mmmmpppmmmmkpmkkkkkkkkkkmmmmmmmmmmkkkkr......',
  '......mmmmpmmmmmmmkpmmmmmmmmmmmkkkkmmmmmmmkkkkr.....',
  '......mmmpmmmmmmmmkpmmmmmmmmmmmmmmkkmmmmmmkkkkr.....',
  '.....mmmmmmmmmkkmkpmpppppmpppmmmmmmmmmmmmmkkkkkr....',
  '.....mmmmmmmkkmmmkpmmmppkkkkkkkkkkkkmmmmmmkkkkkr....',
  '....mgmmmmkkkmmmmkpmmmmmmmmmmmmmmmmkkkmmmmkkkkkr....',
  '....gmmmmkkmmmmmmkmkkkkkkkkkkkkkkkkmmmmmmmkkkkkr....',
  '....gmmmkkmmmmmmmkk..........kkkkkkkkkkmmmmkkkkr....',
  '...ggggmkmmmmmmmm..................kkkkkkmmmkkkgr...',
  '...ggggmmmmmmm.........................kkkkmkkkgr...',
  '...gggmgmmm..............................kkkkkgGr...',
  '...gwgmmm..................................kkkgGr...',
  '...gwgmm....................................kkkGr...',
  '..Ggggg......................................GGGGr..',
  '..Gwggg......................................GGGGr..',
  '..Gwgw........................................GgGr..',
  '..Gggw........................................GgGr..',
  '..Gggg........................................GGGr..',
  '..Gggg........................................GGGr..',
  '..Ggw..........................................GGr..',
  '..Ggg..........................................GGr..',
  '..Ggg..........................................GGr..',
  '..Ggg..........................................GGr..',
  '..GGG..........................................GGr..',
  '..GGG..........................................GGr..',
  '..GGG..........................................GGr..',
  '....ggG......................................GGr....',
  '....ggG......................................GGr....',
  '.....ggG....................................GGr.....',
  '.....ggG....................................GGr.....',
  '.....gG......................................Gr.....',
  '.....gG......................................Gr.....',
  '.....gG......................................Gr.....',
];
const LOLA_BACK = [
  '..............................................................',
  '.......................MMMMMMMMMMMMMMMM.......................',
  '..................dddddMMMMMMMMMMMMMMMMddRRR..................',
  '...............ddddRRddMMMMMMMMMMMMMMMMddRRRRRR...............',
  '.............ddddRRRRddMMMMMMMMMMMMMMMMddRRRRRRRR.............',
  '...........ddddRRRRRRddMMMMMMMMMMMMMMMMddRRRRRRRRRR...........',
  '..........ddddRRRRRRRddMMMMMMMMMMMMMMMMddRRRRRRRRRRR..........',
  '.........cdddRRRRRddMMMMMMMMMMMMMMMMMMMMMMddRRRRRRRRR.........',
  '........cdddRRRddMMMMMMMMMMMMMMMMMMMMMMMMMMMMddRRRRRRR........',
  '.......cdddRRRddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMddRRRRRRR.......',
  '......cdddRRRddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMddRRRRRRR......',
  '......cdddRddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMddRRRRR......',
  '.....cdddRddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMddRRRRR.....',
  '.....cdddddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMddRRRR.....',
  '....cdddRddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMddRRRRR....',
  '....cdddddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMddRRRR....',
  '....cddddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMddRRR....',
  '...cdddddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMddRRRR...',
  '...cddddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMddRRR...',
  '...cddddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMddRRR...',
  '...cdddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMddRR...',
  '...cdddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMddRR...',
  '...cdddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMddRR...',
  '...cdddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMddRR...',
  '...cddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMddR...',
  '...cddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMddR...',
  '..cdddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMddRR..',
  '..cdddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMddRR..',
  '..cdddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMddRR..',
  '..cdddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMddRR..',
  '..cdddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMddRR..',
  '..cdddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMddRR..',
  '..cdddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMModRR..',
  '..cdddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMModRR..',
  '..cdddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMModRR..',
  '..cdddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMModRR..',
  '..cdddRMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMoModRR..',
  '..cdddRMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMoModRR..',
  '..cdddRMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMoModRR..',
  '..cdddRMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMModoRRR..',
  '..cdddRMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMModoRoR..',
  '..cdddRMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMModoRoR..',
  '..cdRdRMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMModoRoR..',
  '..cdRdRMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMModoRoR..',
  '..cdRdRMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMModoRoR..',
  '..cdRdRMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMModoRoR..',
  '..cdRdRMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMModoRoR..',
  '..cdRdRMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMModoRoR..',
  '..cdRdRMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMModdRoR..',
  '..cdRdRMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMModdRoR..',
  '..cdddddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMModRRoR..',
  '..cdddddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMModRRoR..',
  '...cddddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMModRRR...',
  '...cdddddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMdoRRRR...',
  '....cddddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMddRRR....',
  '....cdddddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMddRRRR....',
  '......cdddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMddRR......',
  '......cRdddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMddRoo......',
  '......cdRRRdMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMdooodd......',
  '......cMdddRRMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMoodddMM......',
  '........cMMddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMddMMM........',
  '...........cMdMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMdMM...........',
  '..............cMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMd..............',
  '..............................................................',
];
const LOLA_FRONT = [
  '..............................................................',
  '.......................ccccRRRRRRRRRRRR.......................',
  '..................cccccRRRRRRRRRRRRRRRRRRRRR..................',
  '...............cccRRRRRRRRRRRRoooooooooRRRRRRRR...............',
  '.............ccRRRRRRRRRRRoooooRRRoooooyyyoRRRRRR.............',
  '...........ccRRRRRRRRRRRRooRRRRRRRMRRRRoooyyoRRRRRR...........',
  '..........cdRRRRRRRRRRRRRRRRRRRRdRRMRRRRRRoooyoRRRRR..........',
  '.........cdRRRRRRRRRRRRRRdRRRRRdRRRMRRRRRRRRRooooRRRR.........',
  '........cdRRRRRRRRRRRRRRddRRoRddRRoRMRRRRRRRRRRoooRRRR........',
  '.......cdRRRRRRRRRRRRRRddRRoRRdRRoodMRRRRRRoRRRRRoRRRRR.......',
  '......cdddRRRRRRRRRRRRddRRoRRdRRRoddRMRRRRRRoRRRRRRRRRRR......',
  '......cdddRRRRRRRRRRRRdRRooRddRRoRdRRMRRRRRRooRRRRRRRRRR......',
  '.....cdddRRRRRRRRRRRRddRRoRRdRRoRddRoMRRRRRRRoRRRRRRRRRRR.....',
  '.....cdddRRRRRRRRRRRddRRRRRdRRooRdRooRMRRRRRRRoRRRRRRRRRR.....',
  '....cdddRRRRRRRRRRRRdRRooRRdRoRRddoRRRMRRRRRRRoRRRRRRRRRRR....',
  '....cdddRRRRRRRRRRRddRRoRRdRRoRRdooRRRddRRRRRRooRRRRRRRRRR....',
  '....cdddRRRRRRRRRRRdRRRoRddRooRddoRRRd..ddRRRRRRRRRRRRRRRR....',
  '...cdddRRRRRRRRRRRdRRRoRRdRRRRRdoRRRd.....ddRRRRoRRRRRRRRRR...',
  '...cdddRRRRRRRRRRRdRRoRRddRoRRdooRRd........dRRRoRRRRRRRRRR...',
  '...cdddRRRRRRRRRRdRRRoRRdRRoRRdoRRd..........dRRooRRRRRRRRR...',
  '...cdddRRRRRRRRRRdRRoRRddRooRddRRd............dRRRRRRRRRRRR...',
  '...cdddRRRRRRRRRdRRRRRRdRRRRddRRd..............dRRRRRRRRRRR...',
  '...cdddRRRRRRRRRdRRoRRddRoodd.Rd................RRRRRRRRRRR...',
  '...cdddRRRRRRRRdRRRoRRdRRodd..d.................dRRRRRRRRRR...',
  '...cdddddRRRRRRdRRoRRRdRRdd......................RRRRRRRRRR...',
  '...cdddddRRRRRRdRRoRRdRRdd.......................dRRRRRRRRR...',
  '..cdddddRRRRRRdRRRRRddRdd.........................RRRRRRRRRR..',
  '..cdddddRRRRRRdRRoRdd.Rd..........................RRRRRRRRRR..',
  '..cddddddddRRRdRRodd..d...........................dRRRRRRRRR..',
  '..cddddddddRRdRRRdd................................RRRRRRRRR..',
  '..cddddddddRRdRRdd.................................RRRRRRRRR..',
  '..cddddddddRRdRdd..................................RRRRRRRRR..',
  '..cddddddddRdRdd...................................RRRRRRRRR..',
  '..cddddddddRddd.....................................RRRRRRRR..',
  '..cddddddddRdd......................................RRRRRRRR..',
  '..cddddddddRd.......................................RRRRRRRR..',
  '..cddddddddd........................................RRRRRRRR..',
  '..cdddddddd.........................................RRdddddd..',
  '..............................................................',
  '..............................................................',
];
// @@HAIR_MAPS_END
