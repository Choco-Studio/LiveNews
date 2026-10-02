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
  const SHIRT = id === 'A' ? mat([P.white, P.white, P.white, P.silver, P.fog, P.steel]) : mat([P.white, P.white, P.cream, P.skin, P.tan, P.tanShade], P.white);
  const TIE = mat([P.pink, P.pink, P.red, P.darkRed, P.maroon, P.black], P.pink);
  const DARK = mat([P.steel, P.slate, P.black, P.black, P.black, P.black]);
  const prof = faceProfile(D.face);
  const chinBottom = prof.length - 1;
  const hwAt = (y) => prof[Math.max(0, Math.min(prof.length - 1, y))];

  // ===================== BODY (neck + torso) =====================
  const body = new Buf(-96, 44, 192, 140);
  const nhw = D.neckHW;
  const neckTop = D.mouthY - 4;
  const collarY = chinBottom + 9;
  body.rect(-nhw, neckTop, nhw * 2, collarY + 16 - neckTop, SKIN, 0);
  // jaw cast shadow on the neck (deeper in the middle), shadow side of the neck
  for (let x = -nhw; x < nhw; x++) {
    const depth = Math.round(5 - (Math.abs(x + 0.5) / nhw) * 2);
    for (let y = neckTop; y < chinBottom + depth; y++) body.setTone(x, y, 2);
    for (let y = chinBottom + depth; y < collarY + 16; y++) body.setTone(x, y, 1);
  }
  for (let y = chinBottom + 3; y < collarY + 16; y++) {
    body.setTone(sx(-nhw), y, 0);
    body.setTone(sx(-nhw + 1), y, 0);
    body.setTone(sx(-nhw + 2), y, 0);
    body.setTone(sx(nhw - 1), y, 2);
  }

  const mirrorPts = (pts) => [...pts, ...pts.slice().reverse().map(([x, y]) => [-x, y])];
  const C = collarY;
  if (id === 'A') {
    body.poly(
      mirrorPts([
        [-12, C - 6], [-24, C - 2], [-38, C + 3], [-50, C + 8], [-60, C + 11], [-67, C + 15], [-71, C + 21], [-73, C + 29], [-75, C + 50], [-76, C + 80],
      ]),
      SUIT,
    );
    // shirt V
    body.poly([[-13, C - 9], [13, C - 9], [13, C + 2], [3, C + 70], [-3, C + 70], [-13, C + 2]], SHIRT);
    for (let y = C - 9; y < C + 70; y++) for (let x = 0; x < 14; x++) body.setTone(sx(x), y, x > 4 ? 1 : 0, [SHIRT]);
    // lapels
    for (const s of [-1, 1]) {
      const lit = s !== side;
      body.poly(
        [[s * 12, C - 6], [s * 21, C - 3], [s * 26, C + 21], [s * 23, C + 24], [s * 29, C + 27], [s * 6, C + 72], [s * 3, C + 70], [s * 12, C + 4]],
        SUIT,
        lit ? -1 : 1,
      );
      // roll line + notch shadow
      for (let y = C + 27; y < C + 72; y++) {
        const x = Math.round(s * (29 - ((y - C - 27) / 45) * 23));
        body.setTone(s < 0 ? x - 1 : x, y, 3, [SUIT]);
      }
      body.toneLine(s * 26 - (s < 0 ? 1 : 0), C + 21, s * 23 - (s < 0 ? 1 : 0), C + 24, 3, [SUIT]);
      body.toneLine(s * 23 - (s < 0 ? 1 : 0), C + 24, s * 28 - (s < 0 ? 1 : 0), C + 27, 3, [SUIT]);
      // gorge seam
      body.toneLine(s * 21 - (s < 0 ? 1 : 0), C - 2, s * 25 - (s < 0 ? 1 : 0), C + 19, lit ? 0 : 2, [SUIT]);
    }
    // collar wings
    for (const s of [-1, 1]) {
      const lit = s !== side;
      const pts = [[s * 1, C + 2], [s * 12, C - 9], [s * 15, C - 6], [s * 11, C + 11], [s * 3, C + 8]];
      body.poly(pts, SHIRT, lit ? 0 : 1);
      // edge shadow under the wing (on the shirt / jacket)
      body.toneLine(s * 11 - (s < 0 ? 1 : 0), C + 11, s * 3 - (s < 0 ? 1 : 0), C + 8, lit ? 1 : 2, [SHIRT]);
      body.toneLine(s * 15 - (s < 0 ? 1 : 0), C - 6, s * 11 - (s < 0 ? 1 : 0), C + 11, lit ? 1 : 2, [SHIRT]);
    }
    // tie knot + blade
    body.poly([[-4, C + 1], [4, C + 1], [3, C + 9], [-3, C + 9]], TIE);
    body.poly([[-3, C + 9], [3, C + 9], [6, C + 70], [-6, C + 70]], TIE);
    for (let y = C + 1; y < C + 72; y++) {
      for (let x = -7; x < 7; x++) {
        if (body.mat(x, y) !== TIE) continue;
        if (y === C + 9) body.setTone(x, y, 2);
        else if (y === C + 1) body.setTone(x, y, 1);
        else if (side * (x + 0.5) > 1.5) body.setTone(x, y, 1);
      }
    }
    body.pts([[sx(-2), C + 3], [sx(-2), C + 4], [sx(-1), C + 3], [sx(-2), C + 12], [sx(-2), C + 13], [sx(-3), C + 16], [sx(-3), C + 17], [sx(-3), C + 18], [sx(-4), C + 26]], -1, [TIE]);
    body.pts([[0, C + 11], [-1, C + 11], [0, C + 12]], 2, [TIE]); // dimple
    // pocket square (wearer's left breast) + welt
    const pw = sx(30);
    const dir = side;
    for (let k = 0; k < 12; k++) body.set(pw + dir * k, C + 40 - Math.floor(k / 6), DARK, 0);
    body.pts([[pw + dir * 2, C + 39], [pw + dir * 3, C + 38], [pw + dir * 4, C + 39], [pw + dir * 6, C + 38], [pw + dir * 7, C + 37], [pw + dir * 8, C + 38]], 0);
    for (const [x, y] of [[pw + dir * 2, C + 39], [pw + dir * 3, C + 38], [pw + dir * 4, C + 39], [pw + dir * 6, C + 38], [pw + dir * 7, C + 37], [pw + dir * 8, C + 38], [pw + dir * 3, C + 39], [pw + dir * 7, C + 38]]) body.set(x, y, SHIRT, x === pw + dir * 3 ? 0 : 1);
    // lapel mic
    body.set(sx(-19), C + 22, DARK, -1);
    body.set(sx(-18), C + 22, DARK, 0);
    body.set(sx(-19), C + 23, DARK, 0);
    body.set(sx(-18), C + 23, DARK, 0);
    body.set(sx(-18), C + 24, DARK, 0);
  } else {
    body.poly(
      mirrorPts([
        [-11, C - 7], [-22, C - 3], [-34, C + 2], [-45, C + 7], [-53, C + 11], [-59, C + 16], [-62, C + 23], [-64, C + 32], [-65, C + 55], [-66, C + 80],
      ]),
      SUIT,
    );
    // cream top inside the blazer
    body.poly([[-19, C - 8], [19, C - 8], [13, C + 72], [-13, C + 72]], SHIRT);
    // scoop neckline showing the collarbones
    for (let y = C - 10; y < C + 12; y++) {
      for (let x = -16; x < 16; x++) {
        const dx = (x + 0.5) / 13;
        const dy = (y + 0.5 - (C - 8)) / 15;
        if (dx * dx + dy * dy <= 1 && body.mat(x, y) === SHIRT) body.set(x, y, SKIN, 0);
      }
    }
    for (let y = C - 10; y < C + 12; y++) {
      for (let x = -16; x < 16; x++) {
        if (body.mat(x, y) !== SKIN || y < neckTop) continue;
        if (body.mat(x, y + 1) === SHIRT) body.set(x, y + 1, SHIRT, -1); // hem catches the light
      }
    }
    // collarbones
    body.pts([[sx(-4), C + 1], [sx(-5), C + 1], [sx(-6), C + 2], [sx(-7), C + 2], [sx(-8), C + 2]], 1, [SKIN]);
    body.pts([[sx(3), C + 1], [sx(4), C + 1], [sx(5), C + 2], [sx(6), C + 2], [sx(7), C + 2]], 1, [SKIN]);
    body.pts([[sx(-5), C + 2], [sx(-6), C + 3], [sx(-7), C + 3]], -1, [SKIN]);
    // top shading + soft folds
    for (let y = C - 8; y < C + 72; y++) for (let x = 0; x < 20; x++) if (x > 8) body.setTone(sx(x), y, 1, [SHIRT]);
    body.toneLine(sx(-6), C + 20, sx(-4), C + 34, 1, [SHIRT]);
    body.toneLine(sx(5), C + 24, sx(4), C + 40, 1, [SHIRT]);
    // lapels (soft, wide)
    for (const s of [-1, 1]) {
      const lit = s !== side;
      body.poly([[s * 11, C - 7], [s * 21, C - 3], [s * 29, C + 22], [s * 17, C + 72], [s * 12, C + 72], [s * 18, C + 6]], SUIT, lit ? 0 : 1);
      for (let y = C + 22; y < C + 72; y++) {
        const x = Math.round(s * (29 - ((y - C - 22) / 50) * 12));
        body.setTone(s < 0 ? x - 1 : x, y, 2, [SUIT]);
      }
      body.toneLine(s * 18 - (s < 0 ? 1 : 0), C + 6, s * 12 - (s < 0 ? 1 : 0), C + 70, lit ? -1 : 2, [SUIT]);
      body.toneLine(s * 21 - (s < 0 ? 1 : 0), C - 3, s * 28 - (s < 0 ? 1 : 0), C + 20, lit ? -1 : 2, [SUIT]);
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
    const far = id === 'A' ? 70 : 60;
    const lit = s !== side;
    const fold = lit ? 1 : 2;
    const xo = (v) => (s < 0 ? -v - 1 : v);
    // armpit creases
    body.toneLine(xo(far - 16), C + 40, xo(far - 24), C + 54, fold, [SUIT]);
    body.toneLine(xo(far - 14), C + 48, xo(far - 19), C + 56, fold, [SUIT]);
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
  // eye sockets
  const eY = D.eyeY;
  for (const s of [-1, 1]) {
    const shadow = s === side;
    for (let k = 0; k < 12; k++) {
      const x = s < 0 ? -D.eyeX - 1 - k : D.eyeX + k;
      if (k < 11) head.setTone(x, eY - 2, 1, [SKIN]);
      if (shadow && k > 1 && k < 10) head.setTone(x, eY - 3, 1, [SKIN]);
    }
    const ix = s < 0 ? -D.eyeX : D.eyeX - 1;
    for (let y = eY - 2; y < eY + 3; y++) head.setTone(ix, y, 1, [SKIN]);
    if (id === 'A') for (let k = 3; k < 8; k++) head.setTone(s < 0 ? -D.eyeX - 1 - k : D.eyeX + k, eY + 6, 1, [SKIN]);
  }
  // cheek + forehead highlights on the lit side
  head.pts([[sx(-14), eY + 9], [sx(-13), eY + 9], [sx(-15), eY + 10], [sx(-14), eY + 10]], -1, [SKIN]);
  head.pts([[sx(-9), 19], [sx(-8), 19], [sx(-7), 19], [sx(-10), 20], [sx(-9), 20]], -1, [SKIN]);
  // nose
  const nY = D.noseY;
  const big = id === 'A';
  for (let y = eY + 2; y < nY - 2; y++) head.setTone(sx(big ? 2 : 1), y, 1, [SKIN]);
  for (let y = eY + 5; y < nY - 4; y += 1) if (y % 3 !== 0) head.setTone(sx(-1), y, -1, [SKIN]);
  const noseKey = { h: -1, b: 0, s: 1, d: 2, n: 3 };
  const noseRows = big
    ? ['....hbbs...', '..s.hbbbs..', '.s.bbbbbbs.', 's.bbbbbbbbs', '.sdn.ss.nds', '...sssssss.']
    : ['...hbs...', '..shbbs..', '.sbbbbbs.', '.sn.s.ns.', '...ssss..'];
  noseRows.forEach((row, j) => {
    for (let k = 0; k < row.length; k++) {
      const tn = noseKey[row[k]];
      if (tn === undefined) continue;
      const x = -Math.floor(row.length / 2) + k;
      head.setTone(side > 0 ? x : -1 - x, nY - 4 + j, tn, [SKIN]);
    }
  });
  // cast shadow under the nose, philtrum
  head.pts([[sx(2), nY + 2], [sx(3), nY + 2], [sx(4), nY + 2]], 1, [SKIN]);
  // under-lip shadow and chin dimple light
  for (let x = -4; x < 4; x++) head.setTone(x, D.mouthY + 4, 1, [SKIN]);
  head.pts([[sx(-2), chinBottom - 4], [sx(-1), chinBottom - 4], [sx(-2), chinBottom - 5]], -1, [SKIN]);
  if (id === 'A') {
    // nasolabial folds and a little age under the cheekbone
    for (const s of [-1, 1]) {
      const o = (x) => (s < 0 ? -1 - x : x);
      head.pts([[o(7), nY], [o(8), nY + 1], [o(9), nY + 2], [o(9), nY + 3], [o(10), nY + 4], [o(10), nY + 5]], 1, [SKIN]);
    }
  }
  // rim light on the shadow-side silhouette of face and ears
  head.each((x, y) => {
    if (head.edge(x, y, side, 0, [SKIN]) && y > 14 && y < chinBottom - 2) head.setTone(x, y, RIM);
  });

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
  // soft shadow the hair casts onto the forehead
  head.each((x, y) => {
    if (head.mat(x, y) === SKIN && front.mat(x, y - 1) && !front.mat(x, y) && head.tone(x, y) !== RIM) head.shift(x, y, 1);
  });

  // glasses (front layer)
  if (id === 'A') {
    const METAL = mat([P.white, P.silver, P.fog, P.steel, P.slate, P.ink], P.white);
    const gy = eY - 3;
    for (const s of [-1, 1]) {
      const shadow = s === side;
      const x0 = s < 0 ? -D.eyeX - 14 : D.eyeX;
      const w = 14;
      const h = 9;
      for (let x = x0 + 1; x < x0 + w - 1; x++) {
        front.set(x, gy, METAL, shadow ? 1 : 0);
        front.set(x, gy + h - 1, METAL, shadow ? 2 : 1);
      }
      for (let y = gy + 1; y < gy + h - 1; y++) {
        front.set(x0, y, METAL, shadow ? 1 : 0);
        front.set(x0 + w - 1, y, METAL, shadow ? 2 : 1);
      }
      // glints on the upper-left corners
      front.set(x0 + 1, gy, METAL, -2);
      front.set(x0 + 2, gy, METAL, -1);
      front.set(x0, gy + 1, METAL, -1);
      // temple arm to the ear
      const yA = gy + 2;
      const from = s < 0 ? x0 - 1 : x0 + w;
      const to = s < 0 ? -hwAt(yA) - 1 : hwAt(yA);
      for (let x = Math.min(from, to); x <= Math.max(from, to); x++) front.set(x, yA, METAL, shadow ? 2 : 1);
    }
    front.span(-D.eyeX + 1, D.eyeX - 2, gy + 1, METAL, 0);
    front.set(-1, gy + 1, METAL, -1);
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
const EYE_W = 10;
const EYE_TOP = [3, 2, 1, 0, 0, 0, 0, 1, 1, 2];
const EYE_BOT = [4, 5, 5, 5, 5, 5, 5, 5, 4, 4];

function eyeShape(emotion, blinkPhase) {
  let top = EYE_TOP.slice();
  let bot = EYE_BOT.slice();
  const mid = (i) => i > 0 && i < 9;
  switch (emotion) {
    case 'surprised':
      top = top.map((v, i) => (mid(i) ? v - 1 : v));
      break;
    case 'happy':
      bot = bot.map((v, i) => (i > 1 && i < 8 ? v - 1 : v));
      break;
    case 'serious':
      top = top.map((v, i) => (mid(i) ? v + 1 : v));
      break;
    case 'sad':
      top = top.map((v, i) => (i < 5 ? v + 1 : v));
      break;
    case 'thinking':
      top = top.map((v, i) => (mid(i) ? v + 1 : v));
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
  if (st.blinkPhase === 2) {
    for (let c = 0; c < EYE_W; c++) {
      const y = y0 + Math.max(top[c], bot[c] - 1);
      if (y > y0 + top[c]) rect(ctx, X(c), y0 + top[c], 1, y - (y0 + top[c]), D.skin[2]);
      rect(ctx, X(c), y, 1, 1, c === 0 || c === EYE_W - 1 ? D.skin[3] : lash);
    }
    if (D.lashes) rect(ctx, X(0) + (flip ? 1 : -1), y0 + bot[0] - 1, 1, 1, lash);
    return;
  }
  for (let c = 0; c < EYE_W; c++) {
    const h = bot[c] - top[c] - 1;
    if (h > 0) {
      rect(ctx, X(c), y0 + top[c] + 1, 1, h, P.white);
      rect(ctx, X(c), y0 + top[c] + 1, 1, 1, P.silver);
    }
  }
  // iris + pupil (never mirrored so the catch lights agree)
  const ic = x0 + 3 + look;
  const iy = y0 + 1 + lookY;
  const small = st.emotion === 'surprised';
  for (let c = 0; c < 4; c++) {
    const col = ic + c;
    const cc = flip ? EYE_W - 1 - (col - x0) : col - x0;
    if (cc < 0 || cc >= EYE_W) continue;
    for (let rr = 0; rr < 4; rr++) {
      const yy = iy + rr;
      if (yy <= y0 + top[cc] || yy >= y0 + bot[cc]) continue;
      if ((c === 0 || c === 3) && (rr === 0 || rr === 3)) continue;
      let colr = yy === y0 + top[cc] + 1 ? D.iris[1] : D.iris[0];
      const pupil = small ? (c === 1 || c === 2) && rr === 2 : (c === 1 || c === 2) && (rr === 1 || rr === 2);
      if (pupil) colr = P.black;
      if (c === 1 && rr === 1) colr = P.white;
      rect(ctx, col, yy, 1, 1, colr);
    }
  }
  for (let c = 0; c < EYE_W; c++) rect(ctx, X(c), y0 + top[c], 1, 1, lash);
  rect(ctx, X(0) + (flip ? 1 : -1), y0 + top[0], 1, 1, lash);
  if (D.lashes) {
    rect(ctx, X(0) + (flip ? 2 : -2), y0 + top[0] - 1, 1, 1, lash);
    rect(ctx, X(1) + (flip ? 1 : -1), y0 + top[1] - 1, 1, 1, lash);
  } else {
    // lid crease for the veteran
    for (let c = 2; c < EYE_W - 1; c++) rect(ctx, X(c), y0 + top[c] - 2, 1, 1, D.skin[3]);
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

const MUSTACHE = ['......kmmmmk......', '...kmmmpmmmmmmk...', '..kmmpmmmpmmmmmkk.', '.kmpmmmmmmmmmmmkkk', '.kmmmk......kmmkkk', 'kmmk..........kkkk'];
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
  day: { far: P.navy, near: P.blue, b: [P.slate, P.steel], lights: [P.silver, P.cyan] },
  dusk: { far: P.purple, near: P.magenta, b: [P.ink, P.maroon], lights: [P.orange, P.yellow] },
  night: { far: P.ink, near: P.navy, b: [P.black, P.ink], lights: [P.yellow, P.orange] },
};

// Rounded rectangle; `cols` are concentric steps from the outside in.
function softRect(ctx, x, y, w, h, cols, step = 3) {
  cols.forEach((c, i) => {
    const k = i * step;
    if (w - k * 2 <= 4 || h - k * 2 <= 4) return;
    rect(ctx, x + k + 2, y + k, w - k * 2 - 4, h - k * 2, c);
    rect(ctx, x + k + 1, y + k + 1, w - k * 2 - 2, h - k * 2 - 2, c);
    rect(ctx, x + k, y + k + 2, w - k * 2, h - k * 2 - 4, c);
  });
}

function viewOf(id, side) {
  const mir = DESIGN[id].rimSide < 0; // B sees the studio mirrored
  const shift = side === 'left' ? -28 : side === 'right' ? 28 : 0;
  return { mir, X: (x, w = 0) => (mir ? W - x - w : x) + shift };
}

function buildBackdrop(id, side, acc, sky) {
  const [c, ctx] = makeCanvas(W, H);
  const { X } = viewOf(id, side);
  const S = SKY[sky];
  const [dk, md] = acc.ramp;
  rect(ctx, 0, 0, W, H, P.ink);
  // big soft wall panels
  softRect(ctx, X(-60, 50), 14, 50, 160, [P.slate], 3);
  softRect(ctx, X(158, 30), 14, 30, 160, [P.slate], 3);
  // the city window, far out of focus
  const wx = X(-34, 168);
  softRect(ctx, wx, 22, 168, 120, [P.slate, S.far, S.near], 4);
  for (let i = 0; i < 6; i++) {
    const bw = 22 + Math.floor(hash(i, 3) * 14);
    const bx = wx + 4 + i * 27 + Math.floor(hash(i, 4) * 6);
    const bh = 26 + Math.floor(hash(i, 5) * 34);
    softRect(ctx, bx, 138 - bh, bw, bh + 8, [S.b[i % 2]], 3);
  }
  softRect(ctx, X(70, 10), 18, 10, 128, [P.slate, P.steel], 3); // mullion
  // video wall glow
  const vx = X(206, 240);
  softRect(ctx, vx, 12, 240, 128, [P.black, dk, md], 4);
  // horizontal wall seam, truss and floor shadow
  rect(ctx, 0, 0, W, 9, P.black);
  rect(ctx, 0, 9, W, 1, P.ink);
  rect(ctx, 0, 150, W, H - 150, P.black);
  return c;
}

const BOKEH = Array.from({ length: 22 }, (_, i) => ({
  u: hash(i, 11),
  v: hash(i, 12),
  r: 2 + Math.floor(hash(i, 13) * 4),
  ph: hash(i, 14) * 6.283,
  sp: 0.25 + hash(i, 15) * 0.4,
  hot: hash(i, 16) > 0.65,
}));

function drawLights(ctx, t, id, side, acc, sky, calm) {
  const { X } = viewOf(id, side);
  const S = SKY[sky];
  const [, md, base, hi] = acc.ramp;
  const avoid = (x, y, r) => calm && x + r > calm.x - 4 && x - r < calm.x + calm.w + 4 && y + r > calm.y - 4 && y - r < calm.y + calm.h + 4;
  // warm truss lamps
  for (let i = -1; i < 8; i++) {
    const x = X(i * 56 + 24);
    const flick = Math.sin(t * 0.6 + i * 2.1) > 0.85;
    disc(ctx, x, 2, 5, P.maroon);
    disc(ctx, x, 2, 4, P.rust);
    disc(ctx, x, 2, 2, flick ? P.cream : P.yellow);
  }
  // video wall: a slow sweep of light + floating bokeh
  const vx = X(206, 240);
  const sweep = Math.round(vx + 10 + ((t * 9) % 260) - 20);
  for (let k = 0; k < 3; k++) {
    const x0 = Math.max(vx + 12, sweep + k * 6);
    const x1 = Math.min(vx + 228, sweep + 24 - k * 6);
    if (x1 > x0 && !avoid((x0 + x1) / 2, 76, 40)) rect(ctx, x0, 24 + k * 2, x1 - x0, 104 - k * 4, k === 2 ? base : md);
  }
  for (let i = 0; i < BOKEH.length; i++) {
    const b = BOKEH[i];
    const wall = i % 2 === 0;
    const cx = wall ? 214 + b.u * 170 : -20 + b.u * 150;
    const cy = wall ? 26 + b.v * 100 : 30 + b.v * 90;
    const x = X(Math.round(cx + Math.sin(t * b.sp + b.ph) * 3));
    const y = Math.round(cy + Math.cos(t * b.sp * 0.8 + b.ph) * 2);
    const rr = b.r + (Math.sin(t * b.sp * 3 + b.ph) > 0.7 ? 1 : 0);
    if (avoid(x, y, rr)) continue;
    if (wall) {
      disc(ctx, x, y, rr, b.hot ? base : md);
      if (b.hot) disc(ctx, x, y, rr - 2, hi);
    } else {
      disc(ctx, x, y, rr, S.near === P.navy ? P.slate : S.b[1]);
      disc(ctx, x, y, rr - 1, b.hot ? S.lights[0] : S.lights[1]);
    }
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
  drawLights(ctx, t, id, side, acc, sky, CALM[side]);

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
  if (id === 'A') sprite(ctx, MUSTACHE, MUSTACHE_KEY, hx - 9, hy + D.mouthY - 6, D.rimSide < 0);

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
  '.......................ddddMMMMMMMMddRR.......................',
  '..................dddddddddMMMMMMMMddRRRRRRR..................',
  '...............ddddddddddddMMMMMMMMddRRRRRRRRRR...............',
  '.............ddddddddddddddMMMMMMMMddRRRRRRRRRRRR.............',
  '...........cdddddddddddddddMMMMMMMMddRRRRRRRRRRRRRR...........',
  '..........cddddddddddddMMMMMMMMMMMMMMMMddRRRRRRRRRRR..........',
  '.........cddddddddddMMMMMMMMMMMMMMMMMMMMMMddRRRRRRRRR.........',
  '........cddddddddMMMMMMMMMMMMMMMMMMMMMMMMMMMMddRRRRRRR........',
  '.......cddddddddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMddRRRRRRR.......',
  '......cddddddddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMddRRRRRRR......',
  '......cddddddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMddRRRRR......',
  '.....cddddddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMddRRRRR.....',
  '.....cdddddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMddRRRR.....',
  '....cddddddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMddRRRRR....',
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
  '..cdddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMoMModRR..',
  '..cdddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMoMMddoR..',
  '..cdRdMRMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMoMMddoR..',
  '..cdRdMRMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMoMModoR..',
  '..cdRdMRMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMModoR..',
  '..cdRdMRMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMModoR..',
  '..cdRdMRMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMoMModRR..',
  '..cdRdMRMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMoMModRR..',
  '..cdRdMRMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMoMMddoR..',
  '..cdRdMRMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMoMMddoR..',
  '..cdRdMRMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMoMModoR..',
  '..cdRddRMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMdoRoR..',
  '..cdRddRMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMdoRoR..',
  '..cdRddRMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMoMdoRRR..',
  '..cdRddRMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMoMdoRRR..',
  '..cdRddRMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMoMddoRR..',
  '..cdRddRMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMoMddoRR..',
  '..cdRddRMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMoMdooRR..',
  '..cdRddRMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMdoRRR..',
  '..cdRddRMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMdoRRR..',
  '..cddddRMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMoMdoRRR..',
  '..cddddRMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMoModRRR..',
  '..cddddRMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMModdRRRR..',
  '..cddddRMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMModdRRRR..',
  '..cddddRMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMModoRRRR..',
  '...cdddRdMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMddoRRR...',
  '...cdddddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMddRRRR...',
  '....cdddddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMModRRRR....',
  '......cdddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMModRR......',
  '......cddddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMdoRoR......',
  '......cdRRRdMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMddoodd......',
  '......cMddddRRMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMooodddMM......',
  '........cMMdddMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMdddMMM........',
  '...........cMMddddddddddddddddddddddddddddddddddMMM...........',
  '..............cMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM..............',
  '..............................................................',
];
const LOLA_FRONT = [
  '..............................................................',
  '.......................ccRRRRRRRRRRRRRR.......................',
  '..................cccccRRRRRRRRRRRRRRRRRRRRR..................',
  '...............cccRRRRRRRRRRRRRRddRRRRRRRRRRRRR...............',
  '.............ccRRRRRRRRRRRRRRRRddRRRRRRRRRRRRRRRR.............',
  '...........ccRRRRRRRRRRRRRRRoddoooooRRoyyyRRRRRRRRR...........',
  '..........cRRRRRRRRRRRRRRooooRRooooMRRooooyRyRRRRRRR..........',
  '.........cRRRRRRRRRRRRRoRRoooRRRddRRMdRoooRooyRRRRRRR.........',
  '........cRRRRRRRRRRRoooRRRdRRRRddRRRMRRRdRRoooooRRRRRR........',
  '.......cRRRRRRRRRRRRRRRRddRRRRddRRRdRMRddRRRRoooRRRRRRR.......',
  '......cRRRRRRRRRRRRRRRRRdRRRRdRRRRdRRMddRRRRRRRRRRoRRRRR......',
  '......cddddddddddRRRRRRdRRRRddRRRdRRRMdRRRRoRRRRRRoooRRR......',
  '.....cdddddddddddRRRRRdRRRRddRRRdooRRdMRRRRooRRRRRRoooRRR.....',
  '.....cdddddddddddRRRRRdRRRRdRoRddoRRddMRRRRRRoRRRRRRooRRR.....',
  '....cddddddddddddRRRRdRRRRdooRdooRRddRMRRRRRRoRRRRRRRRRRRR....',
  '....cddddddddddddRRRddRoRRoRRRdoRRddRRddRRRRRoRRRRRRRRRRRR....',
  '....cddddddddddddRRRdRooRdoRRddRRddRRd..ddRRRRoRRRRRRRRRRR....',
  '...cdddddddddddddRRdRoRRdoRRdooRRdRRd.....ddRRooRRRRRRRRRRR...',
  '...cdddddddddddddRRdRoRRoRRRdoRRdRdd........dRRRRRRRRRRRRRR...',
  '...cdddddddddddddRdRRoRdoRRdoRRdRdd..........dRooRRRRRRRRRR...',
  '...cdddddddddddddRdRoRRdoRRooRdddd............dRoRRRRRRRRRR...',
  '...cdddddddddddddRdooRdoRRdRRRddd..............dRRRRRRRRRRR...',
  '...cddddddddddddddRRRRdoRddRRd..................RRRRRRRRRRR...',
  '...cddddddddddddddRoRdoRRdRRRd..................dRRRRRRRRRR...',
  '...cdddddddddddddRooRdRRRdddd....................RRRRRRRRRR...',
  '...cdddddddddddddRRRRdRRd.ddd....................dRRRRRRRRR...',
  '..cddddddddddddddRoRddRRd.........................RRRRRRRRRR..',
  '..cddddddddddddddRRddRRd..........................RRRRRRRRRR..',
  '..cddddddddddddddRRddddd..........................dRRRRRRRRR..',
  '..cddddddddddddddRd..dd............................RRRRRRRRR..',
  '..cdddddddddddddddd................................RRRRRRRRR..',
  '..cddddddddddddddd.................................RRRRRRRRR..',
  '..cddddddddddd.dd..................................RRRRRRRRR..',
  '..cddddddddddd......................................RRRRRRRR..',
  '..cdddddddddd.......................................RRRRRRRR..',
  '..cdddddddddd.......................................RRRRRRRR..',
  '..cddddddddd........................................RRRRRRRR..',
  '..cdddddddd..........................................RRRRRRR..',
  '..............................................................',
  '..............................................................',
];
// @@HAIR_MAPS_END
