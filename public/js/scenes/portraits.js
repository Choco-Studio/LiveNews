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
  // ASCII map; flip mirrors it around the face centre line (x -> -1 - x).
  ascii(rows, x0, y0, key, flip = false) {
    rows.forEach((row, j) => {
      for (let k = 0; k < row.length; k++) {
        const e = key[row[k]];
        if (e) this.set(flip ? -1 - (x0 + k) : x0 + k, y0 + j, e[0], e[1]);
      }
    });
  }
  disc(cx, cy, r, m, t = 0) {
    this.ellipse(cx + 0.5, cy + 0.5, r + 0.5, r + 0.5, m, t);
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
// The cast. Head-local coordinates: x = 0 is the face centre line (the face
// spans -hw..hw-1), y = 0 is the top of the skull. Every design is written
// for "rim light on screen right" and mirrored at build time when needed.
// ---------------------------------------------------------------------------

const lips = (u, K, l, h) => ({ u, K, l, h, m: P.maroon, M: P.black, t: P.white, T: P.silver, g: P.pink });
const DARK_CLOTH = [P.steel, P.slate, P.ink, P.black, P.black, P.black];

const CAST = {
  paco: {
    native: 1,
    headTop: 36,
    face: { hw: 23, crownR: 24, cheekEnd: 43, cheekHW: 22, chinY: 64, chinHW: 9 },
    eyeY: 36, eyeX: 5, browY: 30, noseY: 49, mouthY: 57, earY: 32, neckHW: 12, collar: 15, nose: 'big',
    skin: [P.cream, P.cream, P.skin, P.skinShade, P.brown, P.maroon],
    hairRamp: [P.steel, P.purple, P.maroon, P.black, P.black, P.black],
    brow: [P.maroon, P.black], lash: P.black, bags: true, folds: true,
    iris: [P.rust, P.brown],
    lips: lips(P.skinShade, P.brown, P.skinShade, P.skin),
    hair: 'paco', outfit: 'suit', glasses: 'rect', facial: 'mustache',
    cloth: DARK_CLOTH, clothRim: 'base', cuff: P.white,
    persona: { bob: 0.6, shift: 0.5, sway: 0.4, look: 0.5 },
  },
  lola: {
    native: -1,
    headTop: 38,
    face: { hw: 21, crownR: 23, cheekEnd: 41, cheekHW: 20, chinY: 61, chinHW: 7 },
    eyeY: 35, eyeX: 4, browY: 29, noseY: 47, mouthY: 55, earY: 31, neckHW: 9, collar: 10, nose: 'small',
    skin: [P.cream, P.skin, P.tan, P.tanShade, P.brown, P.maroon],
    hairRamp: [P.yellow, P.orange, P.rust, P.darkRed, P.maroon, P.black],
    brow: [P.brown, P.maroon], lash: P.black, lashes: true,
    iris: [P.green, P.darkGreen],
    lips: lips(P.darkRed, P.maroon, P.red, P.pink),
    hair: 'lola', outfit: 'lola', earrings: 'gold', necklace: true,
    cloth: [P.cyan, P.blue, P.blue, P.navy, P.ink, P.black], cuff: P.yellow,
    persona: { bob: 0.8, shift: 0.8, sway: 0.5, look: 0.7 },
  },
  max: {
    native: 1,
    headTop: 39,
    face: { hw: 22, crownR: 23, cheekEnd: 41, cheekHW: 21, chinY: 61, chinHW: 8 },
    eyeY: 35, eyeX: 5, browY: 29, noseY: 47, mouthY: 55, earY: 31, neckHW: 10, collar: 11, nose: 'small',
    skin: [P.cream, P.skin, P.tan, P.tanShade, P.brown, P.maroon],
    hairRamp: [P.steel, P.slate, P.ink, P.black, P.black, P.black],
    brow: [P.ink, P.black], lash: P.black,
    iris: [P.brown, P.maroon],
    lips: lips(P.tanShade, P.brown, P.tanShade, P.tan),
    hair: 'max', outfit: 'hoodie',
    cloth: [P.fog, P.steel, P.slate, P.ink, P.black, P.black], cuff: P.ink,
    persona: { bob: 1.4, shift: 1, sway: 0.8, look: 0.9, bounce: 1 },
  },
  ada: {
    native: -1,
    headTop: 41,
    face: { hw: 21, crownR: 22, cheekEnd: 40, cheekHW: 21, chinY: 59, chinHW: 8 },
    eyeY: 34, eyeX: 4, browY: 28, noseY: 46, mouthY: 54, earY: 30, neckHW: 9, collar: 10, nose: 'wide', ears: false,
    skin: [P.tan, P.tan, P.tanShade, P.brown, P.maroon, P.black],
    hairRamp: [P.tanShade, P.brown, P.maroon, P.black, P.black, P.black],
    brow: [P.black, P.black], lash: P.black, lashes: true,
    iris: [P.brown, P.maroon],
    lips: lips(P.maroon, P.black, P.brown, P.tanShade),
    hair: 'ada', outfit: 'ada', glasses: 'round',
    cloth: [P.pink, P.pink, P.magenta, P.purple, P.maroon, P.black], cuff: P.ink,
    persona: { bob: 0.5, shift: 0.5, sway: 0.4, look: 0.6, sceptic: 1 },
  },
  nova: {
    native: 1,
    headTop: 39,
    face: { hw: 21, crownR: 23, cheekEnd: 41, cheekHW: 20, chinY: 61, chinHW: 7 },
    eyeY: 35, eyeX: 4, browY: 29, noseY: 47, mouthY: 55, earY: 31, neckHW: 9, collar: 10, nose: 'small',
    skin: [P.cream, P.cream, P.skin, P.tan, P.tanShade, P.brown],
    hairRamp: [P.rust, P.brown, P.maroon, P.black, P.black, P.black],
    brow: [P.maroon, P.black], lash: P.black, lashes: true,
    iris: [P.rust, P.brown],
    lips: lips(P.skinShade, P.maroon, P.pink, P.cream),
    hair: 'nova', outfit: 'nova', earrings: 'studGold',
    cloth: [P.blue, P.blue, P.navy, P.ink, P.black, P.black], cuff: P.ink,
    persona: { bob: 0.6, shift: 0.6, sway: 0.5, look: 0.8, up: 1 },
  },
  unit8: {
    native: 1,
    headTop: 40,
    robot: true,
    neckHW: 9,
    cloth: [P.white, P.silver, P.fog, P.steel, P.slate, P.ink], cuff: P.slate,
    persona: { bob: 0.4, shift: 0.3, sway: 0, look: 0, scan: 1 },
  },
  penny: {
    native: -1,
    headTop: 39,
    face: { hw: 20, crownR: 22, cheekEnd: 40, cheekHW: 19, chinY: 60, chinHW: 7 },
    eyeY: 35, eyeX: 4, browY: 29, noseY: 47, mouthY: 55, earY: 31, neckHW: 8, collar: 10, nose: 'small',
    skin: [P.white, P.cream, P.skin, P.skinShade, P.brown, P.maroon],
    hairRamp: [P.white, P.white, P.cream, P.yellow, P.orange, P.rust],
    brow: [P.rust, P.brown], lash: P.black, lashes: true,
    iris: [P.blue, P.navy],
    lips: lips(P.skinShade, P.darkRed, P.pink, P.white),
    hair: 'penny', outfit: 'penny', earrings: 'silver',
    cloth: [P.green, P.darkGreen, P.darkGreen, P.ink, P.black, P.black], cuff: P.white,
    persona: { bob: 0.3, shift: 0.3, sway: 0.2, look: 0.3 },
  },
  sam: {
    native: 1,
    headTop: 37,
    face: { hw: 23, crownR: 24, cheekEnd: 42, cheekHW: 22, chinY: 62, chinHW: 10 },
    eyeY: 36, eyeX: 5, browY: 30, noseY: 49, mouthY: 57, earY: 32, neckHW: 12, collar: 13, nose: 'wide',
    skin: [P.tan, P.tanShade, P.brown, P.maroon, P.black, P.black],
    hairRamp: [P.slate, P.ink, P.black, P.black, P.black, P.black],
    brow: [P.black, P.black], lash: P.black,
    iris: [P.tanShade, P.maroon],
    lips: lips(P.maroon, P.black, P.tanShade, P.tan),
    hair: 'sam', outfit: 'sam', facial: 'beard',
    cloth: [P.fog, P.steel, P.slate, P.ink, P.black, P.black], cuff: P.silver,
    persona: { bob: 0.5, shift: 0.6, sway: 1, look: 0.5, lean: 1 },
  },
};
const ALIAS = { A: 'paco', B: 'lola' };

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

const mirrorPts = (pts) => [...pts, ...pts.slice().reverse().map(([x, y]) => [-x, y])];

// ---------------------------------------------------------------------------
// Build: static layers for one presenter, lit from one side
// ---------------------------------------------------------------------------

function buildPresenter(id, side, acc) {
  const D = CAST[id];
  const mats = [null];
  const K = {
    id,
    D,
    side,
    acc,
    mats,
    flip: side !== D.native,
    sx: (x) => (side > 0 ? x : -1 - x), // pixel column, designed for rim on the right
    px: (x) => (side > 0 ? x : -x), // polygon vertex
    lineX: (s, v) => (s < 0 ? -v - 1 : v),
  };
  K.mat = (ramp, rim = acc.ramp[3]) => mats.push({ ramp, rim }) - 1;
  K.CLOTH = K.mat(D.cloth, D.clothRim === 'base' ? acc.ramp[2] : acc.ramp[3]);
  K.clothMats = [K.CLOTH];
  K.body = new Buf(-100, 30, 200, 156);
  K.head = new Buf(-46, -24, 92, 104);
  K.front = new Buf(-46, -26, 92, 96);
  K.back = new Buf(-50, -30, 100, 116);
  if (D.robot) buildRobot(K);
  else {
    K.SKIN = K.mat(D.skin, acc.skinRim);
    K.prof = faceProfile(D.face);
    K.chinBottom = K.prof.length - 1;
    K.hwAt = (y) => K.prof[Math.max(0, Math.min(K.prof.length - 1, y))];
    K.C = K.chinBottom + D.collar;
    buildFace(K);
    HAIR[D.hair](K);
    if (D.facial === 'beard') buildBeard(K);
    finishFace(K);
    if (D.glasses) buildGlasses(K, D.glasses);
    buildNeck(K);
    OUTFITS[D.outfit](K);
  }
  torsoLight(K);
  return {
    body: K.body.render(mats),
    head: K.head.render(mats),
    front: K.front.render(mats),
    back: K.back.render(mats),
    C: K.C,
    chinBottom: K.chinBottom,
  };
}

// --------------------------- face ------------------------------------------

const NOSES = {
  big: { rows: ['...h..s.', '..sh..s.', '.s.hb.ss', 's......s', 'sdn..nds', '.ssssss.'], n: 4, bridge: 2 },
  small: { rows: ['..h.s.', '.sh.s.', 's....s', 'sn..nd', '.ssss.'], n: 3, bridge: 1 },
  wide: { rows: ['....h..s..', '...sh...s.', '.s..hb..ss', 's........s', 'sddn..ndds', '.ssssssss.'], n: 4, bridge: 2 },
};

function buildFace(K) {
  const { D, head, SKIN, sx, side, prof, chinBottom, hwAt } = K;
  for (let y = 0; y < prof.length; y++) head.span(-prof[y], prof[y] - 1, y, SKIN);
  if (D.ears !== false) {
    const ey = D.earY;
    const EAR = [2, 3, 4, 4, 4, 4, 4, 4, 3, 3, 3, 3, 2, 2, 1];
    for (const s of [-1, 1]) {
      for (let k = 0; k < EAR.length; k++) {
        const hw = hwAt(ey + k);
        if (s < 0) head.span(-hw - EAR[k], -hw, ey + k, SKIN, 0);
        else head.span(hw - 1, hw - 1 + EAR[k], ey + k, SKIN, 0);
      }
      for (let k = 2; k < 13; k++) {
        const hw = hwAt(ey + k);
        const xo = s < 0 ? -hw - 2 : hw + 1;
        const xi = s < 0 ? -hw - 1 : hw;
        if (k < 11) head.setTone(xo, ey + k, k < 4 || k > 9 ? 1 : 2);
        if (k > 4 && k < 10) head.setTone(xi, ey + k, 1);
        if (s === side) head.setTone(s < 0 ? -hw - EAR[k] + 1 : hw - 2 + EAR[k], ey + k, 1);
      }
      head.setTone(s < 0 ? -hwAt(ey + 13) : hwAt(ey + 13) - 1, ey + 13, 1);
    }
  }
  // form shadow on the far side, outline on the lit jaw
  for (let y = 0; y < prof.length; y++) {
    const hw = prof[y];
    const band = y < D.eyeY - 2 ? 3 : y < D.noseY ? 4 : y < D.mouthY + 2 ? 5 : 4;
    for (let k = 0; k < band; k++) head.setTone(sx(hw - 1 - k), y, 1, [SKIN]);
    if (y > D.noseY) head.setTone(sx(hw - 1), y, 2, [SKIN]);
    if (y > D.mouthY - 4) head.setTone(sx(-hw), y, 1, [SKIN]);
  }
  for (let k = 0; k < 2; k++) {
    const y = chinBottom - k;
    for (let x = -prof[y]; x < prof[y]; x++) if (k === 0 || Math.abs(x + 0.5) > 3) head.setTone(x, y, 1, [SKIN]);
  }
  // eye sockets
  const eY = D.eyeY;
  for (const s of [-1, 1]) {
    const o = (k) => (s < 0 ? -D.eyeX - 1 - k : D.eyeX + k);
    for (let k = 0; k < 12; k++) if (s === side || k < 3) head.setTone(o(k), eY - 3, 1, [SKIN]);
    for (let y = eY - 3; y < eY + 2; y++) head.setTone(o(0), y, 1, [SKIN]);
    if (s === side) for (let y = eY - 1; y < eY + 4; y++) head.setTone(o(12), y, 1, [SKIN]);
    if (D.bags) for (let k = 3; k < 8; k++) head.setTone(o(k), eY + 7, 1, [SKIN]);
  }
  head.pts([[sx(-9), 18], [sx(-8), 18], [sx(-10), 19]], -1, [SKIN]);
  head.pts(D.bags ? [[sx(-15), eY + 10]] : [[sx(-14), eY + 9], [sx(-13), eY + 9], [sx(-14), eY + 10]], -1, [SKIN]);
  // nose
  const nose = NOSES[D.nose] || NOSES.small;
  const nY = D.noseY;
  for (let y = eY + 1; y < nY - 3; y++) head.setTone(sx(nose.bridge), y, 1, [SKIN]);
  head.pts([[sx(-1), nY - 8], [sx(-1), nY - 7], [sx(-1), nY - 5]], -1, [SKIN]);
  const TN = { h: -1, b: 0, s: 1, d: 2, n: 3 };
  nose.rows.forEach((row, j) => {
    for (let k = 0; k < row.length; k++) {
      const tn = TN[row[k]];
      if (tn === undefined) continue;
      const x = -row.length / 2 + k;
      head.setTone(sx(x), nY - nose.n + j, tn, [SKIN]);
    }
  });
  head.pts([[sx(2), nY + 2], [sx(3), nY + 2], [sx(4), nY + 2], [sx(3), nY + 3]], 1, [SKIN]);
  for (let x = -4; x < 4; x++) head.setTone(x, D.mouthY + 4, 1, [SKIN]);
  head.pts([[sx(-2), chinBottom - 4], [sx(-1), chinBottom - 4]], -1, [SKIN]);
  if (D.folds) {
    for (const s of [-1, 1]) {
      const o = (x) => (s < 0 ? -1 - x : x);
      head.pts([[o(7), nY + 1], [o(8), nY + 2], [o(8), nY + 3], [o(9), nY + 4]], 1, [SKIN]);
    }
  }
}

// Rim light on the face + the soft shadow cast by the hair onto the forehead.
function finishFace(K) {
  const { head, front, back, side, SKIN, chinBottom } = K;
  head.each((x, y) => {
    if (head.edge(x, y, side, 0, [SKIN]) && !back.mat(x + side, y) && y > 14 && y < chinBottom - 2) head.setTone(x, y, RIM);
  });
  head.each((x, y) => {
    if (head.mat(x, y) === SKIN && front.mat(x, y - 1) && !front.mat(x, y) && head.tone(x, y) !== RIM) head.shift(x, y, 1, [SKIN]);
  });
}

// --------------------------- hair ------------------------------------------

const domeHW = (K, y, top, extra) => (y + top < 0 ? 0 : K.hwAt(y + top) + extra);

// Generic hair lighting: far-side crescent, darker underside, rim light.
function lightHair(buf, K, mats, crescent = 3, rimTopFrom = 2, behind = null) {
  const side = K.side;
  const own = (x, y) => mats.includes(buf.mat(x, y));
  const filled = (x, y) => buf.mat(x, y) || (behind && behind.mat(x, y));
  buf.each((x, y) => {
    if (!own(x, y)) return;
    let d = 0;
    while (d < crescent && filled(x + side * (d + 1), y)) d++;
    if (d < crescent) buf.shift(x, y, 1);
    if (!filled(x, y + 1)) buf.shift(x, y, 1);
  });
  buf.each((x, y) => {
    if (!own(x, y)) return;
    if (!filled(x + side, y) || (!filled(x, y - 1) && side * (x + 0.5) > rimTopFrom)) buf.setTone(x, y, RIM);
  });
}

function spikeTri(buf, m, bx, by, tx, ty, w, tone = 0) {
  const dx = tx - bx;
  const dy = ty - by;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  buf.poly([[bx + nx * w * 0.5, by + ny * w * 0.5], [tx, ty], [bx - nx * w * 0.5, by - ny * w * 0.5]], m, tone);
  return { nx, ny };
}

const HAIR = {
  paco(K) {
    const H = K.mat(K.D.hairRamp);
    const G = K.mat([P.white, P.silver, P.fog, P.steel, P.slate, P.ink]);
    K.front.ascii(PACO_HAIR, -26, -3, { k: [H, 1], m: [H, 0], p: [H, -1], s: [H, -2], g: [G, 0], G: [G, 1], w: [G, -1], r: [H, RIM] }, K.flip);
  },

  lola(K) {
    const H = K.mat(K.D.hairRamp);
    const key = { y: [H, -2], o: [H, -1], R: [H, 0], d: [H, 1], M: [H, 2], c: [H, RIM] };
    K.back.ascii(LOLA_BACK, -31, -6, key, K.flip);
    K.front.ascii(LOLA_FRONT, -31, -6, key, K.flip);
  },

  // Messy spikes with one electric-cyan streak.
  max(K) {
    const { front, px, side, hwAt } = K;
    const H = K.mat(K.D.hairRamp);
    const S = K.mat([P.white, P.white, P.cyan, P.blue, P.navy, P.ink], P.white);
    for (let y = -3; y <= 33; y++) {
      const hw = domeHW(K, y, 3, 1);
      for (let x = -hw; x < hw; x++) {
        const ax = Math.abs(x + 0.5);
        const temple = ax > hwAt(y) - (y < 22 ? 5 : 3);
        if (y > 12 && !temple) continue;
        if (y > 29 && ax < hwAt(y) - 2) continue;
        front.set(x, y, H, 0);
      }
    }
    const tops = [[-20, 8, -28, 1, 12], [-12, 0, -17, -10, 13], [-2, -3, -2, -13, 13], [8, -2, 13, -11, 13], [17, 3, 25, -3, 12], [21, 12, 28, 9, 8]];
    const fringe = [[-14, 10, -12, 20, 10], [-6, 10, -3, 22, 10], [3, 10, 7, 20, 10], [12, 11, 16, 18, 8]];
    const spikes = [...tops, ...fringe].map(([bx, by, tx, ty, w]) => [px(bx), by, px(tx), ty, w]);
    for (const [bx, by, tx, ty, w] of spikes) spikeTri(front, H, bx, by, tx, ty, w);
    lightHair(front, K, [H], 3, 1);
    // light along the lit flank of each spike, dark seam along the other
    for (const [bx, by, tx, ty, w] of spikes) {
      const { nx, ny } = spikeTri(new Buf(0, 0, 1, 1), H, bx, by, tx, ty, w);
      const lit = nx * -side >= 0 ? 1 : -1;
      const o = (w / 2 - 1.5) * lit;
      front.toneLine(Math.round(bx + nx * o), Math.round(by + ny * o), Math.round(tx - (tx - bx) * 0.15), Math.round(ty - (ty - by) * 0.15), -1, [H]);
      front.toneLine(Math.round(bx - nx * o * 1.2), Math.round(by - ny * o * 1.2), Math.round(tx - (tx - bx) * 0.3), Math.round(ty - (ty - by) * 0.3), 1, [H]);
    }
    front.pts([[px(-4), -6], [px(-5), -5], [px(-12), -3]].map(([x, y]) => [side > 0 ? x : x - 1, y]), -2, [H]);
    // the cyan streak: one fringe spike and its root
    const streak = [[px(-9), -4], [px(-3), -4], [px(-1), 12], [px(-3), 22], [px(-8), 12]];
    front.each((x, y) => {
      if (front.mat(x, y) !== H) return;
      const inside = (() => {
        let c = false;
        for (let i = 0, j = streak.length - 1; i < streak.length; j = i++) {
          const [xi, yi] = streak[i];
          const [xj, yj] = streak[j];
          if (yi > y + 0.5 !== yj > y + 0.5 && x + 0.5 < ((xj - xi) * (y + 0.5 - yi)) / (yj - yi) + xi) c = !c;
        }
        return c;
      })();
      if (inside) front.set(x, y, S, front.tone(x, y) === RIM ? RIM : Math.max(-1, front.tone(x, y)));
    });
  },

  // Voluminous natural curls with a magenta headband.
  ada(K) {
    const { front, back, side, hwAt, px } = K;
    const H = K.mat(K.D.hairRamp);
    const BAND = K.mat([P.white, P.pink, P.magenta, P.purple, P.maroon, P.black], P.pink);
    const cy0 = 17;
    const rx = 33;
    const ry = 32;
    for (let y = -18; y < 56; y++) {
      for (let x = -42; x < 42; x++) {
        const dx = (x + 0.5) / rx;
        const dy = (y + 0.5 - cy0) / ry;
        if (dx * dx + dy * dy <= 1 && y < 53) back.set(x, y, H, 0);
      }
    }
    for (let a = 0; a < 44; a++) {
      const ang = (a / 44) * Math.PI * 2;
      const bx = Math.round(Math.cos(ang) * (rx - 2));
      const by = Math.round(cy0 + Math.sin(ang) * (ry - 2));
      if (by > 50) continue;
      back.disc(bx, by, 4 + (a % 3 === 0 ? 1 : 0), H, 0);
    }
    // the part in front of the face: above the band and over the temples
    const band = (x) => 9 + Math.round(((x + 0.5) / 21) ** 2 * 7);
    back.each((x, y) => {
      if (back.mat(x, y) !== H) return;
      const ax = Math.abs(x + 0.5);
      const overSkull = ax < hwAt(Math.max(0, y)) + 1;
      if ((y < band(x) && overSkull) || (y >= 0 && y < K.D.earY + 12 && ax > hwAt(y) - 3 && ax < hwAt(y) + 2)) front.set(x, y, H, 0);
    });
    // curl texture: little lit arcs on a jittered grid
    const curl = (buf) => {
      for (let gy = -16; gy < 54; gy += 6) {
        for (let gx = -40; gx < 40; gx += 6) {
          const cx = gx + ((gy / 6) % 2 ? 3 : 0) + Math.floor(hash(gx, gy) * 3) - 1;
          const cy = gy + Math.floor(hash(gy, gx) * 3) - 1;
          if (buf.mat(cx, cy) !== H) continue;
          const l = -side;
          buf.pts([[cx + l, cy - 1], [cx, cy - 2], [cx - l, cy - 2]], -1, [H]);
          buf.pts([[cx - l * 2, cy - 1], [cx - l * 2, cy], [cx - l, cy + 1]], 1, [H]);
        }
      }
    };
    curl(back);
    curl(front);
    lightHair(back, K, [H], 4, 0);
    lightHair(front, K, [H], 4, 0, back);
    // inner shadow behind the face
    back.each((x, y) => {
      if (back.mat(x, y) === H && y > 10 && Math.abs(x + 0.5) < hwAt(Math.min(y, K.chinBottom)) + 4) back.setTone(x, y, 2);
    });
    // headband across the top of the forehead
    for (let x = -25; x < 25; x++) {
      const y0 = band(x);
      if (Math.abs(x + 0.5) > hwAt(y0) + 2) continue;
      for (let k = 0; k < 4; k++) front.set(x, y0 + k - 3, BAND, k === 0 ? -1 : k === 3 ? 1 : 0);
    }
    front.pts([[px(-6), 7], [px(-5), 7], [px(-12), 8]].map(([x, y]) => [side > 0 ? x : x - 1, y]), -2, [BAND]);
    front.each((x, y) => {
      if (front.mat(x, y) === BAND && !front.mat(x + side, y)) front.setTone(x, y, 1);
    });
  },

  // Sleek pulled-back hair, a high wavy ponytail and face-framing tendrils.
  nova(K) {
    const { front, back, side, hwAt, px, sx } = K;
    const H = K.mat(K.D.hairRamp);
    const TIE = K.mat([P.yellow, P.yellow, P.orange, P.rust, P.maroon, P.black], P.yellow);
    for (let y = -2; y <= 30; y++) {
      const hw = domeHW(K, y, 2, 1);
      for (let x = -hw; x < hw; x++) {
        const ax = Math.abs(x + 0.5);
        const hl = 12 + Math.round((ax / 20) ** 2 * 6);
        const temple = ax > hwAt(y) - 3 && y < K.D.earY - 1;
        if (y > hl && !temple) continue;
        front.set(x, y, H, 0);
      }
    }
    // ponytail behind the head on the rim side
    const tail = [[5, -3, 5], [11, -11, 5], [20, -12, 6], [27, -4, 6], [28, 8, 6], [26, 20, 5], [29, 31, 5], [27, 42, 4], [30, 52, 3]];
    for (let i = 0; i + 1 < tail.length; i++) {
      const [x1, y1, r1] = tail[i];
      const [x2, y2, r2] = tail[i + 1];
      const n = Math.ceil(Math.hypot(x2 - x1, y2 - y1));
      for (let k = 0; k <= n; k++) {
        const u = k / n;
        back.disc(Math.round(px(x1 + (x2 - x1) * u)) - (side > 0 ? 0 : 1), Math.round(y1 + (y2 - y1) * u), Math.round(r1 + (r2 - r1) * u), H, 0);
      }
    }
    lightHair(back, K, [H], 3, -40);
    lightHair(front, K, [H], 3, 2, back);
    // sheen + strands on the cap
    for (let x = -18; x < 8; x++) {
      const y = Math.round(3 + ((x + 4) / 16) ** 2 * 5);
      if ((x + 40) % 5 !== 4) front.setTone(sx(x), y, -1, [H]);
      if (x > -12 && x < 0 && (x + 40) % 5 < 2) front.setTone(sx(x), y + 1, -2, [H]);
    }
    for (const s of [[-12, 12, -8, 4], [-3, 11, -2, 4], [7, 11, 5, 4], [14, 13, 10, 5]]) front.toneLine(sx(s[0]), s[1], sx(s[2]), s[3], 1, [H]);
    // tail waves: light on the lit flank, dark creases across
    for (let i = 0; i < 6; i++) {
      const y = -6 + i * 10;
      back.toneLine(sx(24), y, sx(28), y + 3, 1, [H]);
      back.toneLine(sx(23), y + 4, sx(25), y + 8, -1, [H]);
    }
    // scrunchie
    for (const [x, y, t] of [[4, -6, 0], [5, -6, -1], [6, -5, 0], [4, -5, 1], [5, -5, 0], [3, -5, 1], [6, -4, 1], [5, -4, 1]]) front.set(sx(x), y, TIE, t);
    // tendrils framing the face
    for (const s of [-1, 1]) {
      for (let y = 14; y < 44; y++) {
        const w = Math.round(Math.sin((y - 14) / 5) * 1.2);
        const x = s < 0 ? -hwAt(y) + 1 + w : hwAt(y) - 2 + w;
        front.set(x, y, H, s === side ? 1 : 0);
        front.set(x + s, y, H, s === side ? RIM : y % 6 < 3 ? -1 : 1);
      }
    }
  },

  // Golden-blonde hair pulled into a neat bun, side part on the lit side.
  penny(K) {
    const { front, back, side, hwAt, sx } = K;
    const H = K.mat(K.D.hairRamp);
    for (let y = -2; y <= 30; y++) {
      const hw = domeHW(K, y, 2, 1);
      for (let x = -hw; x < hw; x++) {
        const ax = Math.abs(x + 0.5);
        const u = side * (x + 0.5);
        const hl = u < -7 ? 13 + Math.round(((u + 7) / 14) ** 2 * 6) : 12 + Math.round(((u + 7) / 28) ** 2 * 9);
        const temple = ax > hwAt(y) - 3 && y < K.D.earY - 1;
        if (y > hl && !temple) continue;
        front.set(x, y, H, 0);
      }
    }
    back.disc(0, -7, 8, H, 0);
    lightHair(back, K, [H], 3, -40);
    lightHair(front, K, [H], 3, 2, back);
    // bun wraps
    for (const [a, b, c, d] of [[-6, -10, 3, -14], [-7, -5, 6, -11], [-4, -1, 7, -6]]) back.toneLine(sx(a), b, sx(c), d, 1, [H]);
    back.pts([[sx(-4), -12], [sx(-3), -13], [sx(-2), -13], [sx(-5), -11], [sx(-6), -8], [sx(-5), -7]], -1, [H]);
    back.pts([[sx(-3), -13]], -2, [H]);
    // part + strands swept back
    for (let y = 1; y < 12; y++) front.setTone(sx(-7) + (y < 5 ? side : 0), y, 1, [H]);
    for (const [a, b, c, d] of [[-14, 13, -12, 6], [-1, 12, 3, 5], [10, 14, 13, 8]]) front.toneLine(sx(a), b, sx(c), d, 1, [H]);
    // sheen band on the lit side
    for (let x = -19; x < -1; x++) {
      const y = Math.round(5 + ((x + 9) / 10) ** 2 * 3);
      if ((x + 40) % 4 !== 3) front.setTone(sx(x), y, -1, [H]);
      if (x > -13 && x < -9) front.setTone(sx(x), y + 1, -2, [H]);
    }
  },

  // Close crop with a crisp line-up.
  sam(K) {
    const { front, side, hwAt, sx } = K;
    const H = K.mat(K.D.hairRamp);
    for (let y = -1; y <= 36; y++) {
      const hw = domeHW(K, y, 1, 1);
      for (let x = -hw; x < hw; x++) {
        const ax = Math.abs(x + 0.5);
        const lineUp = ax < 17 ? 12 : ax < hwAt(y) - 3 ? 12 + Math.round((ax - 17) * 2) : 40;
        if (y > lineUp) continue;
        if (y > 31 && ax < hwAt(y) - 2) continue;
        if (y > 36) continue;
        front.set(x, y, H, 0);
      }
    }
    lightHair(front, K, [H], 2, 2);
    for (let x = -16; x < 6; x += 1) {
      const y = Math.round(2 + ((x + 5) / 13) ** 2 * 4);
      if ((x + 40) % 3 !== 2) front.setTone(sx(x), y, -1, [H]);
    }
    front.pts([[sx(-8), 1], [sx(-7), 1], [sx(-3), 0]], -2, [H]);
  },
};

// Neat beard (Sam), part of the head layer so it moves with the jaw.
function buildBeard(K) {
  const { D, head, side, prof, chinBottom, hwAt } = K;
  const B = K.mat([P.slate, P.ink, P.black, P.black, P.black, P.black]);
  for (let y = D.earY + 2; y <= chinBottom + 1; y++) {
    const hw = hwAt(Math.min(y, chinBottom));
    for (let x = -hw - 1; x < hw + 1; x++) {
      const ax = Math.abs(x + 0.5);
      const edge = hw - ax;
      const below = y >= D.mouthY + 3;
      const jaw = edge < (y < D.noseY ? 3 : y < D.mouthY ? 5 : 7);
      const stache = y >= D.mouthY - 3 && y < D.mouthY && ax < 9;
      const lips = y >= D.mouthY - 1 && y <= D.mouthY + 2 && ax < 7.5;
      if (y > chinBottom && edge < -0.5) continue;
      if ((below || jaw || stache) && !lips && (head.mat(x, y) || y >= chinBottom)) head.set(x, y, B, 0);
    }
  }
  head.each((x, y) => {
    if (head.mat(x, y) !== B) return;
    if (head.edge(x, y, side, 0)) head.setTone(x, y, RIM);
    else if ((x + y) % 4 === 0 && side * (x + 0.5) < 0 && head.mat(x, y - 1) === B) head.setTone(x, y, -1);
    if (head.mat(x, y - 1) === K.SKIN) head.setTone(x, y - 1, 1, [K.SKIN]); // soft shadow above the beard line
  });
}

function buildGlasses(K, type) {
  const { D, front, side, hwAt, sx } = K;
  const M = K.mat([P.white, P.silver, P.fog, P.steel, P.slate, P.ink], P.white);
  const eY = D.eyeY;
  if (type === 'rect') {
    const gy = eY - 3;
    const w = EYE_W + 4;
    const h = 10;
    for (const s of [-1, 1]) {
      const far = s === side;
      const x0 = s < 0 ? -D.eyeX - EYE_W - 2 : D.eyeX - 2;
      for (let x = x0 + 1; x < x0 + w - 1; x++) {
        front.set(x, gy, M, far ? 1 : 0);
        front.set(x, gy + h - 1, M, far ? 2 : 1);
      }
      for (let y = gy + 1; y < gy + h - 1; y++) {
        front.set(x0, y, M, far ? 1 : 0);
        front.set(x0 + w - 1, y, M, far ? 2 : 1);
      }
      front.set(x0 + 1, gy, M, -2);
      front.set(x0 + 2, gy, M, -1);
      front.set(x0, gy + 1, M, -1);
      const from = s < 0 ? x0 - 1 : x0 + w;
      const to = s < 0 ? -hwAt(gy + 2) - 1 : hwAt(gy + 2);
      for (let x = Math.min(from, to); x <= Math.max(from, to); x++) front.set(x, gy + 2, M, far ? 2 : 1);
    }
    front.span(-D.eyeX + 3, D.eyeX - 4, gy + 1, M, 0);
    front.set(sx(-2), gy + 1, M, -1);
  } else {
    // round wire frames
    const r = 7;
    for (const s of [-1, 1]) {
      const far = s === side;
      const cx = s < 0 ? -D.eyeX - 6 : D.eyeX + 5;
      const cy = eY + 2;
      for (let a = 0; a < 64; a++) {
        const ang = (a / 64) * Math.PI * 2;
        const x = Math.round(cx + Math.cos(ang) * r);
        const y = Math.round(cy + Math.sin(ang) * (r - 0.5));
        const lower = Math.sin(ang) > 0.3;
        front.set(x, y, M, far ? (lower ? 2 : 1) : lower ? 1 : 0);
      }
      front.set(cx - 4, cy - 5, M, -2);
      front.set(cx - 5, cy - 4, M, -1);
      const from = s < 0 ? cx - r - 1 : cx + r + 1;
      const to = s < 0 ? -hwAt(cy - 2) - 1 : hwAt(cy - 2);
      for (let x = Math.min(from, to); x <= Math.max(from, to); x++) front.set(x, cy - 2, M, far ? 2 : 1);
    }
    front.span(-D.eyeX + 2, D.eyeX - 3, eY, M, 0);
  }
}

// --------------------------- neck + outfits --------------------------------

function buildNeck(K) {
  const { D, body, SKIN, sx, chinBottom, C } = K;
  const nhw = D.neckHW;
  const top = D.mouthY - 4;
  body.rect(-nhw, top, nhw * 2, C + 16 - top, SKIN, 0);
  for (let x = -nhw; x < nhw; x++) {
    const depth = Math.round(4 - (Math.abs(x + 0.5) / nhw) * 2);
    for (let y = top; y < chinBottom + depth; y++) body.setTone(x, y, 2);
    for (let y = chinBottom + depth; y < C + 16; y++) body.setTone(x, y, K.side * (x + 0.5) > -3 ? 1 : 0);
  }
  for (let y = chinBottom + 2; y < C + 16; y++) body.setTone(sx(nhw - 1), y, 2);
  body.toneLine(sx(-nhw + 2), chinBottom + 4, sx(-3), C + 2, -1, [SKIN]);
}

function shoulders(K, w, drop = 0) {
  const { C, D } = K;
  const n = D.neckHW;
  const k = w / 76;
  const R = Math.round;
  return mirrorPts([
    [-(n + 1), C - 10], [-(n + 8), C - 8], [R(-30 * k), C - 6], [R(-42 * k), C - 4 + drop], [R(-53 * k), C - 2 + drop], [R(-62 * k), C + 1 + drop],
    [R(-68 * k), C + 5 + drop], [R(-72 * k), C + 11 + drop], [R(-74 * k), C + 19 + drop], [R(-75 * k), C + 40], [R(-76 * k), C + 100],
  ]);
}

// Notched (or shawl) lapels over a jacket; lit lapel catches the key light.
function lapels(K, M, { inTop = 12, inBot = 3, notch = true, outer = 28, gorge = 20, bottom = 70, lit = -1 } = {}) {
  const { body, C, side, lineX } = K;
  for (const s of [-1, 1]) {
    const isLit = s !== side;
    const pts = notch
      ? [[s * (inTop + 1), C - 10], [s * gorge, C - 8], [s * (gorge + 5), C + 18], [s * (gorge + 2), C + 21], [s * outer, C + 24], [s * 6, C + bottom + 4], [s * inBot, C + bottom], [s * inTop, C + 3]]
      : [[s * (inTop - 1), C - 8], [s * gorge, C - 6], [s * outer, C + 22], [s * (inBot + 7), C + bottom + 2], [s * inBot, C + bottom + 2], [s * (inTop + 3), C + 2]];
    body.poly(pts, M, isLit ? lit : 1);
    const top = notch ? C + 24 : C + 22;
    for (let y = top; y < C + bottom + 4; y++) body.setTone(lineX(s, Math.round(outer - ((y - top) / (bottom + 4 - (top - C))) * (outer - 6))), y, isLit ? 1 : 3, [M]);
    if (notch) {
      body.toneLine(lineX(s, gorge + 5), C + 18, lineX(s, gorge + 2), C + 21, 3, [M]);
      body.toneLine(lineX(s, gorge + 2), C + 21, lineX(s, outer - 1), C + 24, 3, [M]);
      body.toneLine(lineX(s, gorge), C - 7, lineX(s, gorge + 4), C + 17, isLit ? 0 : 3, [M]);
    }
    body.toneLine(lineX(s, inTop), C + 4, lineX(s, inBot + 1), C + bottom - 4, isLit ? -2 : 2, [M]);
  }
}

const OUTFITS = {
  suit(K) {
    const { body, C, side, sx, lineX, D } = K;
    const nhw = D.neckHW;
    const SHIRT = K.mat([P.white, P.white, P.white, P.silver, P.fog, P.steel]);
    const TIE = K.mat([P.pink, P.pink, P.red, P.darkRed, P.maroon, P.black], P.pink);
    const DARK = K.mat([P.steel, P.slate, P.black, P.black, P.black, P.black]);
    body.poly(shoulders(K, 76), K.CLOTH);
    body.poly([[-11, C - 1], [11, C - 1], [3, C + 66], [-3, C + 66]], SHIRT);
    for (let y = C - 1; y < C + 70; y++) {
      for (let x = 0; x < 12; x++) body.setTone(sx(x), y, x > 3 ? 1 : 0, [SHIRT]);
      body.setTone(sx(-5), y, y > C + 12 ? 1 : 0, [SHIRT]);
    }
    lapels(K, K.CLOTH, { inTop: 12, inBot: 3, outer: 28, gorge: 20, bottom: 66 });
    for (let y = C - 12; y < C + 2; y++) for (let x = -nhw + 1; x < nhw - 1; x++) body.set(x, y, K.SKIN, side * (x + 0.5) > 4 ? 2 : 1);
    for (const s of [-1, 1]) {
      const lit = s !== side;
      body.poly([[s * 1, C + 1], [s * 10, C - 12], [s * 14, C - 10], [s * 15, C - 6], [s * 11, C + 9], [s * 4, C + 6]], SHIRT, lit ? 0 : 1);
      body.toneLine(lineX(s, 11), C + 9, lineX(s, 4), C + 6, lit ? 1 : 2, [SHIRT]);
      body.toneLine(lineX(s, 15), C - 6, lineX(s, 11), C + 9, lit ? 1 : 2, [SHIRT]);
      body.toneLine(lineX(s, 10), C - 11, lineX(s, 2), C + 1, lit ? -1 : 0, [SHIRT]);
    }
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
    body.pts([[0, C + 10], [-1, C + 10], [0, C + 11]], 2, [TIE]);
    for (let k = 0; k < 12; k++) body.setTone(sx(30 + k), C + 37 - Math.floor(k / 6), 3, [K.CLOTH]);
    for (const [x, y, tn] of [[31, 36, 0], [32, 35, 0], [33, 36, 1], [35, 35, 0], [36, 34, 0], [37, 35, 1], [32, 36, 0], [36, 35, 1]]) body.set(sx(x), C + y, SHIRT, tn);
    for (const [x, y, tn] of [[-19, 26, -1], [-18, 26, 0], [-19, 27, 0], [-18, 27, 0], [-18, 28, 0]]) body.set(sx(x), C + y, DARK, tn);
  },

  lola(K) {
    const { body, C, side, sx, lineX } = K;
    const TOP = K.mat([P.white, P.white, P.cream, P.silver, P.fog, P.steel], P.white);
    body.poly(shoulders(K, 66, 1), K.CLOTH);
    body.poly([[-16, C - 7], [16, C - 7], [9, C + 70], [-9, C + 70]], TOP);
    for (let y = C - 10; y < C + 12; y++) {
      for (let x = -16; x < 16; x++) {
        const dx = (x + 0.5) / 12;
        const dy = (y + 0.5 - (C - 9)) / 13;
        if (dx * dx + dy * dy <= 1 && body.mat(x, y) === TOP) body.set(x, y, K.SKIN, side * (x + 0.5) > 2 ? 1 : 0);
      }
    }
    for (let y = C - 10; y < C + 12; y++) for (let x = -16; x < 16; x++) if (body.mat(x, y) === K.SKIN && body.mat(x, y + 1) === TOP) body.set(x, y + 1, TOP, -1);
    body.pts([[sx(-3), C - 1], [sx(-4), C - 1], [sx(-5), C], [sx(-6), C], [sx(-7), C], [sx(-8), C + 1], [sx(2), C - 1], [sx(3), C - 1], [sx(4), C], [sx(5), C], [sx(6), C], [sx(7), C + 1]], 1, [K.SKIN]);
    body.pts([[sx(-5), C + 1], [sx(-6), C + 1], [sx(-7), C + 2]], -1, [K.SKIN]);
    for (let y = C - 8; y < C + 72; y++) for (let x = Math.round(10 - (y - C) / 9); x < 20; x++) body.setTone(sx(x), y, 1, [TOP]);
    body.pts([[sx(-3), C + 16], [sx(-3), C + 17], [sx(-2), C + 22], [sx(-2), C + 23], [sx(-2), C + 24]], 1, [TOP]);
    for (const s of [-1, 1]) {
      const lit = s !== side;
      body.poly([[s * 11, C - 8], [s * 19, C - 6], [s * 28, C + 22], [s * 15, C + 72], [s * 8, C + 72], [s * 15, C + 2]], K.CLOTH, lit ? 0 : 1);
      for (let y = C + 22; y < C + 72; y++) body.setTone(lineX(s, Math.round(28 - ((y - C - 22) / 50) * 13)), y, lit ? 1 : 2, [K.CLOTH]);
      body.toneLine(lineX(s, 15), C + 2, lineX(s, 8), C + 70, lit ? -2 : 2, [K.CLOTH]);
      body.toneLine(lineX(s, 19), C - 5, lineX(s, 27), C + 20, lit ? -2 : 2, [K.CLOTH]);
    }
  },

  // Charcoal hoodie with the hood bunched around the neck, drawstrings, red headphones.
  hoodie(K) {
    const { body, C, side, sx, D } = K;
    const PH = K.mat([P.white, P.pink, P.red, P.darkRed, P.maroon, P.black], P.pink);
    const CUSH = K.mat([P.steel, P.slate, P.ink, P.black, P.black, P.black]);
    const STR = K.mat([P.white, P.white, P.silver, P.fog, P.steel, P.slate], P.white);
    body.poly(shoulders(K, 70, 3), K.CLOTH);
    // hood roll around the neck, its dark lining behind the neck
    for (let y = C - 18; y < C + 12; y++) {
      for (let x = -30; x < 30; x++) {
        const ox = (x + 0.5) / 24;
        const oy = (y + 0.5 - (C - 3)) / 13;
        const ix = (x + 0.5) / 14;
        const iy = (y + 0.5 - (C - 7)) / 10;
        const outer = ox * ox + oy * oy <= 1;
        const inner = ix * ix + iy * iy <= 1;
        if (outer && !inner) body.set(x, y, K.CLOTH, 0);
        else if (inner && y < C - 2 && Math.abs(x + 0.5) > D.neckHW - 0.5) body.set(x, y, K.CLOTH, 3);
      }
    }
    // the roll's own light and seams
    for (let y = C - 18; y < C + 12; y++) {
      for (let x = -30; x < 30; x++) {
        if (body.mat(x, y) !== K.CLOTH) continue;
        const ox = (x + 0.5) / 24;
        const oy = (y + 0.5 - (C - 3)) / 13;
        const d = ox * ox + oy * oy;
        if (d > 0.82 && d <= 1) body.setTone(x, y, side * x > 0 ? 2 : 1);
        else if (d > 0.45 && d < 0.6 && side * x < 0) body.setTone(x, y, -1);
      }
    }
    // neck front below the roll: the crossing of the hood
    body.poly([[-9, C + 2], [9, C + 2], [0, C + 12]], K.CLOTH, 1);
    // drawstrings
    for (const s of [-1, 1]) {
      const x0 = s * 5 + (s > 0 ? 0 : -1);
      for (let y = C + 5; y < C + 30; y++) body.set(x0 + (y > C + 18 ? s : 0), y, STR, s === side ? 1 : 0);
      body.set(x0 + s, C + 30, STR, 2);
      body.set(x0 + s, C + 31, STR, 2);
    }
    // red headphones resting around the neck
    for (const s of [-1, 1]) {
      const cx = s * 17;
      const cy = C - 1;
      for (let y = cy - 5; y <= cy + 5; y++) {
        for (let x = cx - 6; x <= cx + 6; x++) {
          const dx = (x + 0.5 - cx) / 6.5;
          const dy = (y + 0.5 - cy) / 5.5;
          if (dx * dx + dy * dy <= 1) body.set(x, y, PH, 0);
        }
      }
      body.each((x, y) => {
        if (body.mat(x, y) !== PH || Math.abs(x + 0.5 - cx) > 7) return;
        if (body.mat(x, y - 1) !== PH) body.setTone(x, y, -1);
        else if (body.mat(x, y + 1) !== PH || body.mat(x, y + 2) !== PH) body.setTone(x, y, 1);
      });
      for (let x = cx - 4; x <= cx + 4; x++) body.set(x, cy + 3, CUSH, 0);
      for (let x = cx - 3; x <= cx + 3; x++) body.set(x, cy + 4, CUSH, 1);
      body.toneLine(cx + (s === side ? 5 : -5), cy - 3, cx + (s === side ? 5 : -5), cy + 2, s === side ? 2 : 1, [PH]);
      body.set(cx - 3 * side, cy - 3, PH, -2);
    }
    // headband behind the neck
    for (let x = -12; x < 12; x++) {
      const y = C - 9 + Math.round(((x + 0.5) / 12) ** 2 * 4);
      if (body.mat(x, y) !== K.SKIN) body.set(x, y, PH, 1);
    }
    // a little zip-less front seam and pocket line hint
    body.toneLine(sx(-22), C + 44, sx(22), C + 44, 1, [K.CLOTH]);
  },

  // Dark turtleneck under a magenta blazer.
  ada(K) {
    const { body, C, side, sx, D, chinBottom } = K;
    const TN = K.mat([P.steel, P.slate, P.ink, P.black, P.black, P.black], K.acc.ramp[2]);
    body.poly(shoulders(K, 66, 1), K.CLOTH);
    body.poly([[-14, C - 8], [14, C - 8], [5, C + 70], [-5, C + 70]], TN);
    // rolled collar hugging the neck
    for (let y = chinBottom + 3; y < C + 2; y++) {
      const hw = D.neckHW + 2 + (y > C - 6 ? 1 : 0);
      for (let x = -hw; x < hw; x++) body.set(x, y, TN, (y - chinBottom) % 4 === 0 ? 1 : 0);
    }
    for (let y = chinBottom + 3; y < C + 2; y++) {
      body.setTone(sx(D.neckHW + 2), y, 1);
      body.setTone(sx(D.neckHW + 1), y, 1);
      body.setTone(sx(-D.neckHW - 3), y, -1);
    }
    for (let x = -D.neckHW - 2; x < D.neckHW + 2; x++) body.setTone(x, chinBottom + 3, 2);
    lapels(K, K.CLOTH, { inTop: 13, inBot: 4, outer: 27, gorge: 19, bottom: 66, lit: -1 });
  },

  // Navy flight jacket: knit collar, open zip, white tee, mission patch, star pin.
  nova(K) {
    const { body, C, side, sx, lineX, D } = K;
    const TEE = K.mat([P.white, P.white, P.white, P.silver, P.fog, P.steel]);
    const KNIT = K.mat([P.slate, P.navy, P.ink, P.black, P.black, P.black]);
    const ZIP = K.mat([P.white, P.white, P.silver, P.fog, P.steel, P.slate]);
    const PATCH = K.mat([P.white, P.yellow, P.orange, P.rust, P.maroon, P.black], P.yellow);
    body.poly(shoulders(K, 68, 2), K.CLOTH);
    body.poly([[-12, C - 6], [12, C - 6], [6, C + 70], [-6, C + 70]], TEE);
    // tee crew neck
    for (let x = -12; x < 12; x++) {
      const y = C - 4 + Math.round(((x + 0.5) / 12) ** 2 * -3) + 3;
      body.set(x, y, TEE, side * (x + 0.5) > 3 ? 2 : 1);
    }
    for (let y = C - 8; y < C + 72; y++) for (let x = 2; x < 16; x++) body.setTone(sx(x), y, x > 5 ? 2 : 1, [TEE]);
    for (let y = C + 6; y < C + 72; y++) body.setTone(sx(-6), y, 1, [TEE]);
    // jacket fronts with zip teeth
    for (const s of [-1, 1]) {
      const lit = s !== side;
      body.poly([[s * 12, C - 9], [s * 22, C - 6], [s * 22, C + 72], [s * 5, C + 72]], K.CLOTH, lit ? 0 : 1);
      for (let y = C - 4; y < C + 72; y += 2) body.set(lineX(s, Math.round(12 - ((y - C + 4) / 76) * 7)), y, ZIP, lit ? 0 : 1);
    }
    // knit collar band around the neck
    for (let y = C - 14; y < C - 6; y++) {
      for (let x = -D.neckHW - 6; x < D.neckHW + 6; x++) {
        const ax = Math.abs(x + 0.5);
        const curve = C - 14 + Math.round((ax / (D.neckHW + 6)) ** 2 * 5);
        if (y < curve || ax < D.neckHW - 1 + (y > C - 9 ? 3 : 0)) continue;
        body.set(x, y, KNIT, x % 2 === 0 ? 0 : 1);
      }
    }
    // mission patch on the lit chest + star pin on the far collar
    const pcx = sx(-30);
    for (let y = -6; y <= 6; y++) {
      for (let x = -7; x <= 7; x++) {
        const d = (x * x) / 49 + (y * y) / 42;
        if (d <= 1) body.set(pcx + x, C + 32 + y, PATCH, d > 0.62 ? 1 : 0);
      }
    }
    for (const [x, y] of [[0, -3], [-1, -1], [0, -1], [1, -1], [-3, -1], [3, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [-2, 2], [2, 2]]) body.set(pcx + x, C + 32 + y, PATCH, -2);
    const STAR = ['..y..', 'yyyyy', '.yyy.', 'y...y'];
    STAR.forEach((row, j) => [...row].forEach((ch, i) => ch === 'y' && body.set(sx(18 + i), C + 4 + j, PATCH, j === 0 ? -2 : -1)));
  },

  // Dark-green blazer, crisp white blouse collar spread over the lapels.
  penny(K) {
    const { body, C, side, lineX } = K;
    const BL = K.mat([P.white, P.white, P.white, P.silver, P.fog, P.steel]);
    body.poly(shoulders(K, 64, 1), K.CLOTH);
    body.poly([[-14, C - 7], [14, C - 7], [5, C + 70], [-5, C + 70]], BL);
    // V neckline of the blouse
    body.poly([[-9, C - 9], [9, C - 9], [0, C + 10]], K.SKIN, 0);
    body.each((x, y) => {
      if (body.mat(x, y) === K.SKIN && y > C - 9 && y < C + 12 && side * (x + 0.5) > 1) body.setTone(x, y, 1);
    });
    for (let y = C - 8; y < C + 72; y++) for (let x = 6; x < 15; x++) body.setTone(lineX(side, x), y, 1, [BL]);
    lapels(K, K.CLOTH, { inTop: 12, inBot: 3, outer: 26, gorge: 18, bottom: 66, lit: 0 });
    for (const s of [-1, 1]) {
      const lit = s !== side;
      body.poly([[s * 1, C + 10], [s * 9, C - 10], [s * 14, C - 9], [s * 19, C + 6], [s * 8, C + 4]], BL, lit ? 0 : 1);
      body.toneLine(lineX(s, 19), C + 6, lineX(s, 8), C + 4, lit ? 1 : 2, [BL]);
    }
  },

  // Slate blazer over an open-collar light-blue shirt, no tie.
  sam(K) {
    const { body, C, side, sx, lineX, D } = K;
    const SH = K.mat([P.white, P.white, P.silver, P.fog, P.steel, P.slate], P.white);
    body.poly(shoulders(K, 76), K.CLOTH);
    body.poly([[-13, C - 4], [13, C - 4], [4, C + 66], [-4, C + 66]], SH);
    for (let y = C - 4; y < C + 70; y++) for (let x = 5; x < 14; x++) body.setTone(sx(x), y, 1, [SH]);
    lapels(K, K.CLOTH, { inTop: 13, inBot: 4, outer: 29, gorge: 21, bottom: 66 });
    // open V of skin down to the first button
    body.poly([[-D.neckHW + 1, C - 12], [D.neckHW - 1, C - 12], [D.neckHW - 2, C], [0, C + 14], [-D.neckHW + 2, C]], K.SKIN, 1);
    body.each((x, y) => {
      if (body.mat(x, y) === K.SKIN && y > C - 12 && side * (x + 0.5) > 3) body.setTone(x, y, 2);
    });
    // collar points spread over the lapels
    for (const s of [-1, 1]) {
      const lit = s !== side;
      body.poly([[s * 1, C + 14], [s * 11, C - 12], [s * 15, C - 9], [s * 22, C + 8], [s * 9, C + 6]], SH, lit ? -1 : 1);
      body.toneLine(lineX(s, 22), C + 8, lineX(s, 9), C + 6, lit ? 1 : 2, [SH]);
      body.toneLine(lineX(s, 11), C - 11, lineX(s, 1), C + 13, lit ? 0 : 2, [SH]);
    }
    for (const y of [C + 24, C + 38]) body.set(sx(-1), y, SH, 2);
  },
};

// Torso lighting shared by every outfit: far-side band, lit shoulder tops,
// creases at the armpits, sleeve seams and the rim light.
function torsoLight(K) {
  const { body, C, side, D } = K;
  const M = K.clothMats;
  const tops = [];
  body.each((x, y) => {
    if (!M.includes(body.mat(x, y))) return;
    let d = 0;
    while (d < 9 && body.mat(x + side * (d + 1), y)) d++;
    if (d < 8 && y > C + 12) body.shift(x, y, 1, M);
    let up = 0;
    while (up < 3 && M.includes(body.mat(x, y - up - 1))) up++;
    if (up < 2 && side * x < -20) tops.push([x, y]);
  });
  for (const [x, y] of tops) body.setTone(x, y, -1, M);
  const far = Math.round(Math.abs(shoulders(K, D.robot ? 74 : D.outfit === 'suit' || D.outfit === 'sam' ? 76 : 66)[9][0]));
  for (const s of [-1, 1]) {
    const lit = s !== side;
    const xo = (v) => (s < 0 ? -v - 1 : v);
    body.pts([[xo(far - 18), C + 34], [xo(far - 19), C + 35], [xo(far - 20), C + 37], [xo(far - 21), C + 38], [xo(far - 16), C + 42], [xo(far - 17), C + 43], [xo(far - 18), C + 45]], lit ? 1 : 2, M);
    if (!D.robot) body.toneLine(xo(far - 9), C + 18, xo(far - 7), C + 70, lit ? 1 : 3, M);
  }
  body.each((x, y) => {
    if (body.edge(x, y, side, 0, M) && y > C - 14) body.setTone(x, y, RIM);
    else if (body.edge(x, y, 0, -1, M) && side * x > 14) body.setTone(x, y, RIM);
  });
}

// --------------------------- UNIT-8 ----------------------------------------

const ROBOT = { hw: 25, h: 46, visor: { x0: -19, x1: 18, y0: 10, y1: 37 }, eyeY: 21, eyeX: 10, mouthY: 31 };

function buildRobot(K) {
  const { head, body, front, side, sx, D } = K;
  const STEEL = K.mat(D.cloth, K.acc.ramp[3]);
  const VIS = K.mat([P.steel, P.slate, P.black, P.black, P.black, P.black]);
  const DARK = K.mat([P.fog, P.steel, P.slate, P.ink, P.black, P.black]);
  K.clothMats = [STEEL];
  K.chinBottom = ROBOT.h;
  K.C = ROBOT.h + 14;
  const C = K.C;
  const cut = [3, 2, 1, 1];
  // head box with rounded corners
  for (let y = 0; y < ROBOT.h; y++) {
    const c = y < 4 ? cut[y] : y >= ROBOT.h - 4 ? cut[ROBOT.h - 1 - y] : 0;
    head.span(-ROBOT.hw + c, ROBOT.hw - 1 - c, y, STEEL, 0);
  }
  head.each((x, y) => {
    if (head.mat(x, y) !== STEEL) return;
    if (y < 3) head.setTone(x, y, -1);
    if (head.edge(x, y, -side, 0)) head.setTone(x, y, -1);
    let d = 0;
    while (d < 5 && head.mat(x + side * (d + 1), y)) d++;
    if (d < 5) head.setTone(x, y, 1);
    if (y > ROBOT.h - 3) head.setTone(x, y, 1);
  });
  head.toneLine(-ROBOT.hw + 2, 6, ROBOT.hw - 3, 6, 1, [STEEL]);
  head.toneLine(-ROBOT.hw + 3, 5, ROBOT.hw - 4, 5, -1, [STEEL]);
  // ear discs
  for (const s of [-1, 1]) {
    for (let y = 15; y < 32; y++) {
      const w = y < 17 || y > 29 ? 2 : 4;
      for (let k = 0; k < w; k++) head.set(s < 0 ? -ROBOT.hw - 1 - k : ROBOT.hw + k, y, STEEL, s === side ? 1 : 0);
    }
    head.set(s < 0 ? -ROBOT.hw - 3 : ROBOT.hw + 2, 23, DARK, 0);
    head.set(s < 0 ? -ROBOT.hw - 3 : ROBOT.hw + 2, 22, DARK, -2);
  }
  // visor
  const v = ROBOT.visor;
  for (let y = v.y0; y <= v.y1; y++) {
    const c = y === v.y0 || y === v.y1 ? 2 : y === v.y0 + 1 || y === v.y1 - 1 ? 1 : 0;
    head.span(v.x0 + c, v.x1 - c, y, VIS, 0);
  }
  head.each((x, y) => {
    if (head.mat(x, y) !== VIS) return;
    if (head.mat(x, y - 1) === STEEL || head.mat(x - 1, y) === STEEL || head.mat(x + 1, y) === STEEL) head.setTone(x, y, -1);
  });
  for (let k = 0; k < 5; k++) head.setTone(sx(v.x0 + 3 + k), v.y0 + 6 - k, -2, [VIS]);
  for (let k = 0; k < 3; k++) head.setTone(sx(v.x0 + 7 + k), v.y0 + 5 - k, -1, [VIS]);
  // rivets
  for (const [x, y] of [[-21, 3], [20, 3], [-22, 41], [21, 41], [-22, 22], [21, 22]]) {
    head.set(x, y, STEEL, -2);
    head.set(x, y + 1, STEEL, 2);
  }
  // antenna base + rod (the tip is drawn live)
  front.rect(-3, -3, 6, 3, STEEL, 0);
  front.span(-2, 1, -4, STEEL, -1);
  for (let y = -13; y < -4; y++) {
    front.set(-1, y, DARK, -1);
    front.set(0, y, DARK, 1);
  }
  // segmented neck
  for (let y = ROBOT.h - 2; y < C + 4; y++) {
    for (let x = -D.neckHW; x < D.neckHW; x++) body.set(x, y, DARK, (y % 3 === 0 ? 2 : y % 3 === 1 ? 0 : 1) + (side * (x + 0.5) > 4 ? 1 : 0));
  }
  // torso and big rounded shoulder plates
  body.poly(shoulders(K, 72, -2), STEEL, 1);
  for (const s of [-1, 1]) {
    const cx = s * 52;
    for (let y = C - 12; y < C + 26; y++) {
      for (let x = cx - 24; x < cx + 24; x++) {
        const dx = (x + 0.5 - cx) / 23;
        const dy = (y + 0.5 - (C + 8)) / 19;
        const d = dx * dx + dy * dy;
        if (d <= 1) body.set(x, y, STEEL, d > 0.86 && y > C + 2 ? 3 : 0);
      }
    }
    for (let a = 0; a < 40; a++) {
      const ang = Math.PI + (a / 40) * Math.PI;
      body.setTone(Math.round(cx + Math.cos(ang) * 19), Math.round(C + 8 + Math.sin(ang) * 15), -1, [STEEL]);
    }
    for (const [x, y] of [[cx - 12, C - 2], [cx + 12, C - 2], [cx, C - 7]]) {
      body.setTone(x, y, -2, [STEEL]);
      body.setTone(x, y + 1, 2, [STEEL]);
    }
    body.toneLine(cx - 22 * s, C + 22, cx + 4 * s, C + 26, 2, [STEEL]);
  }
  // collar ring
  for (let x = -16; x < 16; x++) for (let y = C - 3; y < C + 2; y++) body.set(x, y, DARK, y === C - 3 ? -1 : y === C + 1 ? 2 : 0);
  // chest panel (lights are animated live)
  for (let y = C + 10; y < C + 44; y++) for (let x = -20; x < 20; x++) body.set(x, y, VIS, y === C + 10 || x === -20 || x === 19 || y === C + 43 ? -1 : 0);
  for (let y = C + 26; y < C + 40; y += 3) body.toneLine(-16, y, 15, y, -1, [VIS]);
}


// ---------------------------------------------------------------------------
// Live face parts (drawn every frame)
// ---------------------------------------------------------------------------

// Eye opening for the screen-left eye; outer corner at column 0.
const EYE_W = 11;
const EYE_TOP = [3, 2, 1, 0, 0, 0, 0, 0, 1, 2, 3];
const EYE_BOT = [4, 5, 5, 6, 6, 6, 6, 6, 5, 5, 4];
// 5x5 iris with the catch light towards the key light (mirrored for rim-left).
const IRIS = ['.ddd.', 'dHPPi', 'iPPPi', 'iiPii', '.iii.'];
const IRIS_SMALL = ['.ddd.', 'diiii', 'iHPii', 'iiiii', '.iii.'];
const rev = (rows) => rows.map((r) => [...r].reverse().join(''));
const IRIS_R = rev(IRIS);
const IRIS_SMALL_R = rev(IRIS_SMALL);

function eyeShape(emotion, blinkPhase, squint = 0) {
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
    case 'thinking':
      top = top.map((v, i) => (mid(i) ? v + 1 : v));
      if (emotion === 'thinking') bot = bot.map((v, i) => (i > 2 && i < EYE_W - 2 ? v - 1 : v));
      break;
    case 'sad':
      top = top.map((v, i) => (i < 6 ? v + 1 : v));
      break;
    default:
  }
  if (squint) top = top.map((v, i) => (mid(i) ? Math.min(bot[i] - 2, v + squint) : v));
  if (blinkPhase === 1) top = top.map((v, i) => Math.max(v, bot[i] - 2));
  return { top, bot };
}

// mode: null | 'laugh' (^^) | 'closed'
function drawEye(ctx, x0, y0, flip, D, st, look, lookY, lit) {
  const X = (c) => (flip ? x0 + EYE_W - 1 - c : x0 + c);
  const lash = D.lash;
  const out = flip ? 1 : -1;
  if (st.mode === 'laugh') {
    const arc = [4, 3, 2, 1, 1, 1, 1, 1, 2, 3, 4];
    for (let c = 1; c < EYE_W - 1; c++) rect(ctx, X(c), y0 + arc[c], 1, 1, lash);
    for (let c = 2; c < EYE_W - 2; c++) rect(ctx, X(c), y0 + arc[c] + 3, 1, 1, D.skin[3]);
    return;
  }
  const { top, bot } = eyeShape(st.emotion, st.blinkPhase, st.squint);
  if (st.blinkPhase === 2 || st.mode === 'closed') {
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
  const small = st.emotion === 'surprised';
  const iris = lit < 0 ? (small ? IRIS_SMALL_R : IRIS_R) : small ? IRIS_SMALL : IRIS;
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
  for (let c = 0; c < EYE_W; c++) rect(ctx, X(c), y0 + top[c], 1, 1, lash);
  rect(ctx, X(0) + out, y0 + top[0], 1, 1, lash);
  if (D.lashes) {
    rect(ctx, X(0) + out * 2, y0 + top[0] - 1, 1, 1, lash);
    for (let c = 0; c < 5; c++) rect(ctx, X(c), y0 + top[c] - 1, 1, 1, lash);
  } else {
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
  hi: [1, -1, -2, -2, -2, -2, -2, -2, -1, -1, 0, 0],
  lo: [1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2],
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
  smirk: ['..........uuu...', '....KKKKKKKKKK..', '....llllllll..K.', '.....hhhhhh.....'],
};
const HAPPY_MOUTHS = new Set(['happy', 'happyE', 'happyA']);

function mouthName(emotion, mouth, t, seed) {
  if (!(mouth > 0)) return emotion in MOUTHS ? emotion : 'neutral';
  const round = emotion === 'surprised' || hash(Math.floor(t * 7), seed) < 0.35;
  if (mouth === 1) return emotion === 'happy' ? 'happyE' : round ? 'O' : 'E';
  return emotion === 'happy' ? 'happyA' : round ? 'AO' : 'A';
}

function drawMouth(ctx, cx, y, D, name, flip) {
  sprite(ctx, MOUTHS[name], D.lips, cx - 8, y + (HAPPY_MOUTHS.has(name) ? -1 : 0), flip);
}

const MUSTACHE = ['.....kmmmmmmk.....', '...kmpmmpmmmmmmk..', '..kmpmmpmmmmmmmkk.', '.kmpmmpmmmmmmmmmkk', '.kmmkmmmkmmmkmmkkk', 'kmk............kkk'];
const MUSTACHE_KEY = { k: P.black, m: P.maroon, p: P.purple };

// --------------------------- UNIT-8 LED face -------------------------------

const LED_EYES = {
  neutral: ['.bbbbbb.', 'bccccccb', 'bccccccb', 'bccccccb', '.bbbbbb.'],
  happy: ['........', '..bccb..', '.bc..cb.', 'bc....cb', 'c......c'],
  surprised: ['.bccccb.', 'bc....cb', 'c......c', 'c......c', 'bc....cb', '.bccccb.'],
  serious: ['........', '........', 'cccccccc', 'bbbbbbbb', '........'],
  sad: ['cb......', 'bccb....', '..bccb..', '....bccb', '......bc'],
  thinking: ['........', '.bbbbbb.', 'bccccccb', '.bbbbbb.', '........'],
  laugh: ['...cc...', '..c..c..', '.c....c.', 'c......c', '........'],
};

function drawRobotFace(ctx, hx, hy, st, t, lit, a) {
  const v = ROBOT.visor;
  const on = st.blinkPhase !== 2;
  const key = { c: P.cyan, b: P.blue };
  let shape = st.mode === 'laugh' ? 'laugh' : LED_EYES[st.emotion] ? st.emotion : 'neutral';
  for (const s of [-1, 1]) {
    let rows = LED_EYES[shape];
    if (shape === 'sad' && s > 0) rows = rev(rows);
    if (st.emotion === 'thinking' && s === -lit) rows = LED_EYES.neutral;
    const ex = hx + (s < 0 ? -ROBOT.eyeX - 4 : ROBOT.eyeX - 4) + st.lookX;
    const ey = hy + ROBOT.eyeY - 2 + st.lookY + (st.blinkPhase === 1 ? 1 : 0);
    if (!on) {
      rect(ctx, ex + 1, ey + 2, 6, 1, P.ink);
      continue;
    }
    sprite(ctx, rows, key, ex, ey);
    // scanning "pupil"
    if (shape === 'neutral' || shape === 'thinking') rect(ctx, ex + 3 + Math.round(st.scan), ey + 2, 2, 1, P.white);
  }
  if (st.emotion === 'thinking' && on) for (let k = 0; k < 3; k++) if (Math.floor(t * 3) % 4 > k) rect(ctx, hx + 8 + k * 3, hy + v.y0 + 3, 1, 1, P.cyan);
  // equalizer mouth
  const my = hy + ROBOT.mouthY;
  const n = 7;
  const x0 = hx - 10;
  const step = Math.floor(t * 12);
  for (let i = 0; i < n; i++) {
    const x = x0 + i * 3;
    let h = 1;
    if (st.mouth === 1) h = 1 + Math.floor(hash(step, i) * 3);
    else if (st.mouth >= 2) h = 2 + Math.floor(hash(step, i + 9) * 4);
    else if (st.emotion === 'happy' || st.mode === 'laugh') h = 1;
    const curve = st.mouth > 0 ? 0 : st.emotion === 'happy' || st.mode === 'laugh' ? Math.round(((i - 3) / 3) ** 2 * -2) + 1 : st.emotion === 'sad' ? Math.round(((i - 3) / 3) ** 2 * 2) - 1 : 0;
    if (st.emotion === 'surprised' && !(st.mouth > 0)) {
      if (i === 2 || i === 4) rect(ctx, x, my - 2, 2, 4, P.cyan);
      if (i === 3) {
        rect(ctx, x, my - 3, 2, 1, P.cyan);
        rect(ctx, x, my + 2, 2, 1, P.cyan);
      }
      continue;
    }
    rect(ctx, x, my - h + 1 + curve, 2, h * 2 - 1, P.blue);
    rect(ctx, x, my - Math.max(0, h - 2) + curve, 2, Math.max(1, h * 2 - 3), P.cyan);
  }
  // antenna tip + scan line
  const blink = Math.floor(t * (st.speaking ? 3 : 1.3)) % 2 === 0;
  disc(ctx, hx, hy - 15, 2, blink ? P.red : P.darkRed);
  if (blink) rect(ctx, hx - 1, hy - 16, 1, 1, P.pink);
  if (a.scanLine >= 0) {
    ctx.globalAlpha = 0.25;
    rect(ctx, hx + v.x0 + 2, hy + v.y0 + 2 + a.scanLine, v.x1 - v.x0 - 3, 1, P.cyan);
    ctx.globalAlpha = 1;
  }
}

function drawRobotChest(ctx, cx, top, C, t, speaking, mouth) {
  const cols = [P.green, P.yellow, P.red, P.cyan];
  const y = top + C + 14;
  const step = Math.floor(t * (speaking ? 6 : 2));
  for (let i = 0; i < 4; i++) {
    const on = (step + i) % 4 !== 0;
    rect(ctx, cx - 14 + i * 7, y, 4, 3, on ? cols[i] : P.ink);
    if (on) rect(ctx, cx - 14 + i * 7, y, 1, 1, P.white);
  }
  // level meter tied to the voice
  const lvl = speaking ? 3 + mouth * 5 + Math.floor(hash(step, 4) * 4) : 1;
  for (let k = 0; k < 14; k++) rect(ctx, cx - 14 + k * 2, y + 7, 1, 2, k < lvl ? (k > 11 ? P.red : k > 8 ? P.yellow : P.green) : P.ink);
}


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

// The video wall is on the rim-light side; the camera pans with the framing.
function viewOf(rim, side) {
  const mir = rim < 0;
  const shift = side === 'left' ? -28 : side === 'right' ? 28 : 0;
  return { mir, X: (x, w = 0) => (mir ? W - x - w : x) + shift };
}

const WALL_SCREEN = { x: 214, y: 14, w: 220, h: 122 };
const WINDOW = { x: -40, y: 22, w: 172, h: 118 };

function buildBackdrop(rim, side, acc, sky) {
  const [c, ctx] = makeCanvas(W, H);
  const { X, mir } = viewOf(rim, side);
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
      ctx.globalAlpha = e === 1 ? 0.32 : 0.16;
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

function drawLights(ctx, t, rim, side, acc, sky, calm, headX) {
  const { X } = viewOf(rim, side);
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
// Hands. Each pose is drawn for the screen-right hand (thumb towards the body
// centre) around a wrist anchor at (0, 0), mirrored for the other hand, then
// shaded with the same light as the rest of the presenter.
// ---------------------------------------------------------------------------

function finger(b, M, x, top, bot, w = 3) {
  b.span(w >= 3 ? x + 1 : x, w >= 3 ? x + w - 2 : x + w - 1, top, M);
  b.rect(x, top + 1, w, bot - top, M);
}
// crease between two fingers held together
function seam(b, M, x, from, to) {
  for (let y = from; y <= to; y++) b.set(x, y, M, 1);
}
function knuckleNotches(b, y, xs) {
  for (const x of xs) b.set(x, y, 0, 0);
}

const HAND_POSES = {
  palm(b, M) {
    const F = [[-10, -38, 4], [-5, -41, 4], [0, -39, 4], [5, -34, 3]];
    for (const [x, t, w] of F) finger(b, M, x, t, -21, w);
    seam(b, M, -6, -34, -21);
    seam(b, M, -1, -35, -21);
    seam(b, M, 4, -30, -21);
    b.rect(-10, -22, 18, 16, M);
    b.poly([[-10, -18], [-16, -29], [-20, -28], [-15, -12], [-10, -7]], M);
    b.rect(-7, -7, 14, 7, M);
    b.toneLine(-6, -15, 6, -18, 1, [M]);
    b.toneLine(-9, -17, -8, -9, 1, [M]);
  },
  spread(b, M) {
    finger(b, M, -14, -35, -19, 4);
    finger(b, M, -6, -41, -21, 4);
    finger(b, M, 0, -39, -21, 4);
    finger(b, M, 6, -32, -19, 3);
    b.rect(-11, -22, 19, 16, M);
    b.poly([[-11, -16], [-19, -27], [-22, -25], [-16, -10], [-11, -7]], M);
    b.rect(-7, -7, 14, 7, M);
    b.toneLine(-7, -15, 6, -17, 1, [M]);
  },
  point_up(b, M) {
    finger(b, M, -9, -44, -24, 4);
    b.rect(-10, -25, 19, 18, M);
    knuckleNotches(b, -25, [-5, -1, 3, 8]);
    for (const x of [-5, -1, 3]) b.toneLine(x, -24, x, -18, 1, [M]);
    b.toneLine(-4, -17, 8, -17, 1, [M]);
    b.poly([[-11, -16], [4, -17], [5, -12], [-11, -11]], M, -1);
    b.toneLine(-10, -11, 4, -11, 2, [M]);
    b.rect(-7, -8, 14, 8, M);
  },
  count2(b, M) {
    finger(b, M, -10, -42, -24, 4);
    finger(b, M, -4, -43, -24, 4);
    seam(b, M, -6, -31, -24);
    seam(b, M, -5, -31, -24);
    b.rect(-10, -25, 19, 18, M);
    knuckleNotches(b, -25, [3, 8]);
    for (const x of [-5, 3]) b.toneLine(x, -24, x, -18, 1, [M]);
    b.toneLine(1, -17, 8, -17, 1, [M]);
    b.poly([[-11, -16], [4, -17], [5, -12], [-11, -11]], M, -1);
    b.toneLine(-10, -11, 4, -11, 2, [M]);
    b.rect(-7, -8, 14, 8, M);
  },
  count3(b, M) {
    finger(b, M, -11, -39, -24, 4);
    finger(b, M, -6, -43, -24, 4);
    finger(b, M, -1, -41, -24, 4);
    seam(b, M, -7, -31, -24);
    seam(b, M, -2, -33, -24);
    b.rect(-11, -25, 20, 18, M);
    knuckleNotches(b, -25, [8]);
    b.toneLine(4, -24, 4, -18, 1, [M]);
    b.poly([[-12, -16], [3, -17], [4, -12], [-12, -11]], M, -1);
    b.toneLine(-11, -11, 3, -11, 2, [M]);
    b.rect(-7, -8, 14, 8, M);
  },
  thumbs_up(b, M) {
    b.span(-8, -6, -40, M);
    b.rect(-9, -39, 5, 15, M);
    b.pts([[-8, -38], [-7, -38], [-6, -38], [-8, -37], [-7, -37]], -1, [M]);
    b.rect(-9, -25, 18, 19, M);
    knuckleNotches(b, -25, [8]);
    for (const y of [-21, -17, -13]) {
      b.toneLine(-3, y, 8, y, 1, [M]);
      b.set(8, y, 0, 0);
    }
    b.toneLine(-4, -24, -4, -9, 1, [M]);
    b.rect(-6, -7, 12, 7, M);
  },
  fist(b, M) {
    b.rect(-10, -27, 19, 20, M);
    knuckleNotches(b, -27, [-10, -6, -1, 4, 8]);
    for (const x of [-6, -1, 4]) b.toneLine(x, -26, x, -19, 1, [M]);
    b.toneLine(-9, -18, 8, -18, 1, [M]);
    b.poly([[-11, -17], [4, -17], [5, -12], [-11, -12]], M, -1);
    b.toneLine(-10, -11, 4, -11, 2, [M]);
    b.rect(-7, -8, 14, 8, M);
  },
  point_side(b, M) {
    b.rect(-10, -25, 17, 18, M);
    b.rect(7, -23, 15, 4, M);
    b.span(22, 22, -22, M);
    b.span(22, 22, -21, M);
    b.rect(-2, -27, 10, 2, M, -1);
    b.toneLine(-8, -19, 6, -19, 1, [M]);
    b.toneLine(-8, -15, 6, -15, 1, [M]);
    b.toneLine(7, -20, 20, -20, 1, [M]);
    b.rect(-7, -8, 14, 8, M);
  },
  point_diag(b, M) {
    b.rect(-10, -24, 18, 17, M);
    knuckleNotches(b, -24, [-10]);
    for (let k = 0; k < 15; k++) b.rect(1 + k, -25 - k, 4, 2, M);
    b.set(19, -41, M, 0);
    b.rect(-4, -27, 5, 4, M, -1);
    b.toneLine(-8, -18, 7, -18, 1, [M]);
    b.toneLine(-8, -14, 7, -14, 1, [M]);
    b.rect(-7, -8, 14, 8, M);
  },
  point_cam(b, M) {
    b.rect(-10, -27, 19, 21, M);
    knuckleNotches(b, -27, [-10, -4, 2, 8]);
    for (const x of [-4, 2]) b.toneLine(x, -26, x, -23, 1, [M]);
    b.disc(-1, -17, 4, M, 2);
    b.disc(-1, -17, 3, M, -1);
    b.pts([[-2, -19], [-3, -18]], -2, [M]);
    b.rect(-13, -23, 4, 14, M, -1);
    b.toneLine(-9, -22, -9, -11, 1, [M]);
    b.rect(-7, -7, 14, 7, M);
  },
  palm_side(b, M) {
    b.rect(-9, -19, 16, 13, M);
    for (const [y, h, end] of [[-19, 4, 19], [-15, 4, 21], [-11, 4, 19], [-7, 3, 15]]) {
      b.rect(7, y, end - 7, h, M);
      b.span(end, end, y + 1, M);
      b.span(end, end, y + h - 2, M);
      b.toneLine(7, y + h - 1, end - 1, y + h - 1, 1, [M]);
    }
    for (let k = 0; k < 9; k++) b.rect(-6 + k, -21 - k, 4, 2, M, -1);
    b.rect(-7, -6, 13, 6, M);
  },
  back(b, M) {
    const F = [[6, -38, 4], [1, -41, 4], [-4, -39, 4], [-8, -34, 3]];
    for (const [x, t, w] of F) {
      finger(b, M, x, t, -21, w);
      b.pts([[x + 1, t + 1], [x + 2, t + 1], [x + 1, t + 2], [x + 2, t + 2]].slice(0, w > 3 ? 4 : 2), -1, [M]);
    }
    seam(b, M, 5, -34, -21);
    seam(b, M, 0, -35, -21);
    seam(b, M, -5, -30, -21);
    b.rect(-8, -22, 18, 16, M);
    b.poly([[10, -18], [16, -29], [20, -28], [15, -12], [10, -7]], M);
    for (const x of [-7, -3, 2, 7]) {
      b.setTone(x, -21, -1, [M]);
      b.setTone(x + 1, -21, -1, [M]);
      b.setTone(x, -20, 1, [M]);
    }
    b.rect(-6, -7, 14, 7, M);
  },
  steeple(b, M) {
    for (let y = -1; y >= -38; y--) {
      const xc = Math.round((y + 1) * 0.42);
      const w = y < -29 ? Math.max(3, 11 - (-29 - y)) : 11;
      b.span(xc - Math.floor(w / 2), xc + Math.ceil(w / 2) - 1, y, M);
    }
    for (let y = -36; y < -20; y++) {
      const xc = Math.round((y + 1) * 0.42);
      b.setTone(xc - 2, y, 1, [M]);
      b.setTone(xc + 1, y, 1, [M]);
    }
    b.rect(-9, -18, 4, 9, M, -1);
  },
  // --- UNIT-8 hands ---
  robot_open(b, M) {
    b.rect(-11, -22, 22, 16, M);
    b.rect(-11, -37, 5, 16, M);
    b.rect(-4, -40, 6, 19, M);
    b.rect(4, -37, 5, 16, M);
    b.rect(-17, -24, 6, 11, M);
    for (const y of [-31, -23]) b.toneLine(-11, y, 8, y, 2, [M]);
    b.rect(-7, -6, 14, 6, M, 1);
    b.set(0, -14, M, -2);
    b.set(0, -13, M, 2);
  },
  robot_point(b, M) {
    b.rect(-11, -25, 22, 19, M);
    b.rect(-10, -41, 6, 17, M);
    b.toneLine(-10, -33, -5, -33, 2, [M]);
    for (const y of [-19, -13]) b.toneLine(-3, y, 10, y, 2, [M]);
    b.rect(-7, -6, 14, 6, M, 1);
    b.set(3, -22, M, -2);
  },
  robot_fist(b, M) {
    b.rect(-11, -27, 22, 21, M);
    for (const x of [-5, 0, 5]) b.toneLine(x, -27, x, -19, 2, [M]);
    b.toneLine(-11, -18, 10, -18, 2, [M]);
    b.rect(-7, -6, 14, 6, M, 1);
  },
};

const ROBOT_POSE = {
  palm: 'robot_open', spread: 'robot_open', back: 'robot_open', palm_side: 'robot_open', steeple: 'robot_open',
  fist: 'robot_fist', point_up: 'robot_point', count2: 'robot_point', count3: 'robot_point', thumbs_up: 'robot_point',
  point_side: 'robot_point', point_diag: 'robot_point', point_cam: 'robot_fist',
};
// Poses that sit over the face get a defining outline all round.
const OVER_FACE = new Set(['back', 'fist']);

function buildHand(id, pose, s, rim, acc) {
  const D = CAST[id];
  const mats = [null];
  const robot = !!D.robot;
  const M = mats.push({ ramp: robot ? D.cloth : D.skin, rim: robot ? acc.ramp[3] : acc.skinRim }) - 1;
  const name = robot ? ROBOT_POSE[pose] || 'robot_open' : pose;
  const tmp = new Buf(-30, -48, 60, 52);
  HAND_POSES[name](tmp, M);
  const b = new Buf(-30, -48, 60, 52);
  tmp.each((x, y) => {
    const m = tmp.mat(x, y);
    if (m) b.set(s > 0 ? x : -1 - x, y, m, tmp.tone(x, y));
  });
  const own = (x, y) => b.mat(x, y) === M;
  const outline = OVER_FACE.has(pose) || robot;
  const deep = [];
  const form = [];
  const lit = [];
  b.each((x, y) => {
    if (!own(x, y) || b.tone(x, y) !== 0) return;
    if (!own(x + rim, y) || !own(x, y + 1)) deep.push([x, y]);
    else if (!own(x + 2 * rim, y)) form.push([x, y]);
    else if (!own(x, y - 1) || !own(x - rim, y)) lit.push([x, y]);
  });
  for (const [x, y] of deep) b.setTone(x, y, outline ? 2 : 1);
  for (const [x, y] of form) b.setTone(x, y, 1);
  for (const [x, y] of lit) b.setTone(x, y, outline ? 1 : -1);
  b.each((x, y) => {
    if (own(x, y) && !own(x + rim, y) && y < -8 && !outline) b.setTone(x, y, RIM);
  });
  return b.render(mats);
}

// Forearm + cuff from the wrist (wx, wy) down towards the elbow below frame.
function drawSleeve(ctx, R, wx, wy, ex, ey) {
  const [, light, base, shade, deep] = R.cloth;
  const y1 = Math.min(ey, H);
  for (let y = wy + 2; y < y1; y++) {
    const k = (y - wy) / Math.max(1, ey - wy);
    const xc = Math.round(wx + (ex - wx) * k);
    const hw = Math.round(10 + 3 * k);
    const xl = xc - hw;
    const xr = xc + hw - 1;
    rect(ctx, xl, y, xr - xl + 1, 1, base);
    if (R.rim > 0) {
      rect(ctx, xr - 3, y, 3, 1, shade);
      rect(ctx, xr, y, 1, 1, R.rimCol);
      rect(ctx, xl, y, 1, 1, light);
    } else {
      rect(ctx, xl + 1, y, 3, 1, shade);
      rect(ctx, xl, y, 1, 1, R.rimCol);
      rect(ctx, xr, y, 1, 1, light);
    }
    if (R.robot && (y - wy) % 9 === 0) rect(ctx, xl + 1, y, xr - xl - 1, 1, deep);
  }
  // cuff
  const cw = 9;
  rect(ctx, wx - cw, wy - 1, cw * 2, 3, R.cuff);
  rect(ctx, R.rim > 0 ? wx + cw - 3 : wx - cw, wy - 1, 3, 3, R.cuffShade);
  rect(ctx, wx - cw, wy + 2, cw * 2, 1, deep);
}

function drawPapers(ctx, x, y) {
  rect(ctx, x - 22, y + 1, 44, 16, P.fog);
  rect(ctx, x - 21, y, 43, 15, P.silver);
  rect(ctx, x - 23, y - 1, 44, 15, P.white);
  for (let k = 0; k < 4; k++) rect(ctx, x - 19, y + 2 + k * 3, k === 3 ? 22 : 36, 1, P.silver);
  rect(ctx, x - 23, y + 13, 44, 1, P.fog);
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
// Motion: passive life (breathing, weight shifts, speech-driven head moves,
// brow emphasis, saccades, personality) + scripted actions (cues.js ACTIONS)
// ---------------------------------------------------------------------------

const ease = (x) => x * x * (3 - 2 * x);
// ease in over [0,a], hold, ease out over [b,1]
const env = (p, a = 0.2, b = 0.8) => (p < a ? ease(Math.max(0, p) / a) : p > b ? ease(Math.max(0, 1 - p) / (1 - b)) : 1);
const lerp = (a, b, k) => a + (b - a) * k;
const R = Math.round;

function seedOf(id) {
  let h = 7;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h % 997) + 1;
}

function passive(D, st, t, seed, mouth, a) {
  const ps = D.persona || {};
  const sp = !!st.speaking;
  const m = { bodyDx: 0, bodyDy: 0, headDx: 0, headDy: 0, tilt: 0, lookX: 0, lookY: 0, brow: 0, browOne: 0, scan: 0 };
  const ph = seed * 0.37;
  // breathing: the bust rises a pixel every few seconds
  m.bodyDy = Math.sin(t * (sp ? 1.5 : 1.15) + ph) > 0.62 ? -1 : 0;
  // weight shifts (Sam leans and sways the most)
  const sw = Math.sin(t * 0.19 + ph * 2.3);
  if (ps.sway && Math.abs(sw) > 1 - 0.32 * ps.sway) m.bodyDx = Math.sign(sw);
  if (ps.lean && Math.sin(t * 0.13 + ph) > 0.1) m.headDx += 1;
  if (sp) {
    // a new head attitude per phrase, small bobs on stressed syllables
    const phrase = Math.floor((t + ph) / 1.25);
    const r = hash(phrase, seed * 7 + 1);
    const sh = 0.32 * (ps.shift ?? 0.5);
    if (r < sh) m.headDx -= 1;
    else if (r > 1 - sh) m.headDx += 1;
    const syl = Math.floor(t * 6.5);
    if (mouth >= 1 && hash(syl, seed * 7 + 2) < 0.3 * (ps.bob ?? 0.5)) m.headDy += 1;
    if (ps.bounce && mouth >= 1 && hash(syl, seed + 5) < 0.35) m.bodyDy -= 1;
    if (hash(phrase, seed * 7 + 3) < 0.16 * (ps.shift ?? 0.5)) m.tilt = hash(phrase, seed + 9) < 0.5 ? -1 : 1;
  }
  // saccades: quick glances off camera (Nova looks up when thinking aloud)
  const sb = Math.floor((t + ph) / 0.55);
  const chance = (sp ? 0.05 : 0.14) * (ps.look ?? 0.5) * 2;
  if (hash(sb, seed * 7 + 4) < chance) {
    m.lookX = hash(sb, seed + 6) < 0.5 ? -1 : 1;
    if (ps.up && hash(sb, seed + 7) < 0.75) {
      m.lookY = -1;
      if (hash(sb, seed + 8) < 0.4) m.lookX = 0;
    }
  }
  // Ada's sceptical tilt with one raised brow
  if (ps.sceptic) {
    const sk = Math.floor((t + ph) / 2.4);
    if (hash(sk, seed + 11) < (sp ? 0.25 : 0.4)) {
      m.tilt = hash(sk, seed + 12) < 0.5 ? -1 : 1;
      m.browOne = m.tilt;
    }
  }
  if (ps.scan) {
    m.scan = sp ? 0 : Math.sin(t * 1.4 + ph) * 2;
    a.scanLine = sp ? -1 : Math.floor(((t * 10) % 46) - 8);
  }
  return m;
}

// Hand rising from below frame to (x, y) as the envelope e goes 0 -> 1.
function lift(G, pose, s, x, y, e) {
  const k = G.robot ? Math.round(e * 3) / 3 : e;
  return { pose, s, x: R(x), y: R(lerp(H + 36, y, k)) };
}

// Every action in cues.js. Offsets: body is absolute, head is relative to the body.
const TRACKS = {
  wave(p, G) {
    const e = env(p, 0.15, 0.85);
    const sw = R(Math.sin(p * Math.PI * 7) * 3 * e);
    return { hands: [lift(G, Math.floor(p * 14) % 2 ? 'palm' : 'spread', G.arm, G.cx + G.arm * 60 + sw, G.top + 94, e)], emotion: 'happy', head: { dx: R(G.arm * e) } };
  },
  raise_hand(p, G) {
    const e = env(p);
    return { hands: [lift(G, 'palm', G.arm, G.cx + G.arm * 58, G.top + 96, e)], brows: 'hi' };
  },
  point_screen(p, G) {
    const e = env(p, 0.18, 0.85);
    if (!G.screen) return { hands: [lift(G, 'point_diag', 1, G.cx + 46, G.top + 116, e)], look: [2, -1], head: { dx: R(e) } };
    return { hands: [lift(G, 'point_side', G.screen, G.cx + G.screen * 46, G.top + 118, e)], look: [2 * G.screen, 0], head: { dx: R(G.screen * e) } };
  },
  point_camera(p, G) {
    const e = env(p);
    return { hands: [lift(G, 'point_cam', G.arm, G.cx + G.arm * 22, G.top + 120, e)], head: { dy: R(e) }, brows: 'serious' };
  },
  point_partner(p, G) {
    const e = env(p);
    return { hands: [lift(G, 'palm_side', G.partner, G.cx + G.partner * 44, G.top + 120, e)], look: [2 * G.partner, 0], head: { dx: R(G.partner * e) } };
  },
  thumbs_up(p, G) {
    const e = env(p);
    return { hands: [lift(G, 'thumbs_up', G.arm, G.cx + G.arm * 50, G.top + 118, e)], emotion: 'happy' };
  },
  shrug(p, G) {
    const e = env(p, 0.25, 0.75);
    return { hands: [-1, 1].map((s) => lift(G, 'palm_side', s, G.cx + s * 50, G.top + 124, e)), body: { dy: -R(2 * e) }, head: { dy: R(2 * e) }, brows: 'surprised', mouth: 'sad', tilt: e > 0.5 ? G.arm : 0, robot: 'thinking' };
  },
  count(p, G) {
    const e = env(p, 0.15, 0.88);
    const pose = p < 0.42 ? 'point_up' : p < 0.62 ? 'count2' : 'count3';
    return { hands: [lift(G, pose, G.arm, G.cx + G.arm * 52, G.top + 112, e)], look: [G.arm, 0] };
  },
  steeple(p, G) {
    const e = env(p, 0.2, 0.85);
    return { hands: [-1, 1].map((s) => lift(G, 'steeple', s, G.cx + s * 15, G.top + G.chin + 56, e)), brows: 'serious' };
  },
  chin(p, G) {
    const e = env(p, 0.2, 0.85);
    return { hands: [lift(G, 'fist', G.arm, G.cx + G.arm * 8, G.top + G.chin + 28, e)], emotion: 'thinking', look: [-G.arm, -1], tilt: e > 0.5 ? G.arm : 0 };
  },
  wow(p, G) {
    const e = env(p, 0.15, 0.8);
    return { hands: [-1, 1].map((s) => lift(G, 'spread', s, G.cx + s * 52, G.top + 96, e)), emotion: 'surprised', mouth: 'AO', robot: 'surprised' };
  },
  fist_pump(p, G) {
    const e = env(p, 0.15, 0.85);
    const pump = R(-Math.abs(Math.sin(p * Math.PI * 3)) * 9 * e);
    return { hands: [lift(G, 'fist', G.arm, G.cx + G.arm * 54, G.top + 104 + pump, e)], emotion: 'happy', body: { dy: pump < -5 ? -1 : 0 } };
  },
  facepalm(p, G) {
    const e = env(p, 0.2, 0.8);
    return { hands: [lift(G, 'back', G.arm, G.cx + G.arm * 16, G.top + 70, e)], eyes: e > 0.6 ? 'closed' : null, mouth: 'serious', head: { dy: R(e) }, robot: 'sad' };
  },
  laugh(p, G) {
    const e = env(p, 0.1, 0.85);
    const beat = e > 0.3 ? Math.floor(p * 12) % 2 : 0;
    return { eyes: e > 0.3 ? 'laugh' : null, mouth: beat ? 'happyA' : 'happyE', body: { dy: -beat }, tilt: e > 0.5 ? -G.rim : 0, emotion: 'happy', robot: 'laugh' };
  },
  nod(p, G) {
    const e = env(p, 0.1, 0.9);
    return { head: { dy: R(Math.max(0, Math.sin(p * Math.PI * 4)) * 2 * e) }, brows: 'happy', robot: 'happy' };
  },
  shake_head(p, G) {
    const e = env(p, 0.1, 0.9);
    const dx = R(Math.sin(p * Math.PI * 5) * 2 * e);
    return { head: { dx }, look: [-dx, 0], brows: 'serious', robot: 'serious' };
  },
  lean_in(p, G) {
    const e = env(p, 0.25, 0.8);
    return { head: { dy: R(e) }, body: { dy: R(2 * e) }, brows: 'serious', squint: R(e) };
  },
  look_partner(p, G) {
    const e = env(p, 0.2, 0.8);
    return { head: { dx: R(2 * e) * G.partner }, look: [e > 0.4 ? 2 * G.partner : 0, 0], turn: e > 0.5 ? G.partner : 0 };
  },
  papers(p, G) {
    const e = env(p, 0.2, 0.85);
    const tap = R(-Math.abs(Math.sin(p * Math.PI * 3)) * 4 * e);
    const y = R(lerp(H + 24, G.top + 138 + tap, G.robot ? Math.round(e * 3) / 3 : e));
    return { hands: [-1, 1].map((s) => ({ pose: 'fist', s, x: G.cx + s * 27, y: y + 24 })), papers: { x: G.cx, y }, look: [0, 1] };
  },
  glasses(p, G) {
    const e = env(p, 0.25, 0.8);
    if (G.glasses) return { hands: [lift(G, 'point_up', G.arm, G.cx + G.arm * 33, G.top + G.eyeY + 43 + (p > 0.4 && p < 0.65 ? -2 : 0), e)] };
    return { hands: [lift(G, 'back', G.arm, G.cx + G.arm * 34, G.top + 58 + R(Math.sin(p * 9) * 1.5), e)], look: [-G.arm, 0] };
  },
};
const ROBOT_REACT = { wave: 'happy', thumbs_up: 'happy', fist_pump: 'happy', count: 'neutral', chin: 'thinking', point_camera: 'serious' };
const GESTURES = ['palm', 'point_up', 'palm_side', 'count2', 'point_diag', 'fist', 'palm'];

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

// Draw a cached head-attached layer, sheared by `tilt` above `seam` (a one
// pixel lean of the upper head) and optionally dropping the jaw below `jawSeam`.
function blitHead(ctx, layer, x, y, tilt, seam, jawSeam = Infinity, jaw = 0) {
  const c = layer.canvas;
  const cuts = [layer.y0, Math.max(layer.y0, Math.min(seam, layer.y0 + c.height)), Math.max(layer.y0, Math.min(jawSeam, layer.y0 + c.height)), layer.y0 + c.height];
  for (let i = 0; i < 3; i++) {
    const y0 = cuts[i];
    const y1 = cuts[i + 1];
    if (y1 <= y0) continue;
    const dx = i === 0 ? tilt : 0;
    const reps = i === 2 ? jaw : 0;
    for (let j = 0; j <= reps; j++) ctx.drawImage(c, 0, y0 - layer.y0, c.width, y1 - y0, x + layer.x0 + dx, y + y0 + j, c.width, y1 - y0);
  }
}

/**
 * Draw the whole 384x216 close-up frame for presenter `id`
 * ('paco' | 'lola' | 'max' | 'ada' | 'nova' | 'unit8' | 'penny' | 'sam', with
 * 'A' = paco and 'B' = lola as aliases).
 * state: { t, speaking, emotion, mouth (0..2), blink, look (-1..1), bob, gesture, action }
 */
export function drawCloseup(ctx, t, id, state, { side = 'center', accent = null } = {}) {
  id = ALIAS[id] || id;
  if (!CAST[id]) id = 'paco';
  if (!BUST_X[side]) side = 'center';
  const D = CAST[id];
  const st = state || {};
  const robot = !!D.robot;
  const rim = side === 'left' ? 1 : side === 'right' ? -1 : D.native;
  const acc = accentOf(accent);
  const sky = currentSky();
  const bg = cached(`bg|${rim}|${side}|${acc.ramp[2]}|${sky}`, () => buildBackdrop(rim, side, acc, sky));
  const L = cached(`p|${id}|${rim}|${acc.ramp[2]}`, () => buildPresenter(id, rim, acc));
  const desk = cached(`desk|${acc.ramp[2]}`, () => buildDesk(acc));
  const seed = seedOf(id);

  // ----- per-presenter animation memory -----
  const a = (live[id] ||= { g: 0, gPose: 'palm', gOn: false, lastT: null, blinkOn: false, blinkSince: -1, blinkOff: -1, prevMouth: 0, browUntil: -1, hist: [], scanLine: -1 });
  const dt = a.lastT === null ? 1 : Math.max(0, Math.min(0.25, t - a.lastT));
  if (a.lastT !== null && (t < a.lastT || t - a.lastT > 1)) {
    // time jumped (new shot, seek): forget transient animation memory
    a.hist.length = 0;
    a.blinkOn = false;
    a.blinkSince = -1;
    a.blinkOff = -1;
    a.browUntil = -1;
    a.g = 0;
    a.gOn = false;
  }
  a.lastT = t;
  if (st.blink && !a.blinkOn) a.blinkSince = t;
  if (!st.blink && a.blinkOn) a.blinkOff = t;
  a.blinkOn = !!st.blink;
  let blinkPhase = 0;
  if (st.blink) blinkPhase = t - a.blinkSince < 0.035 ? 1 : 2;
  else if (t - a.blinkOff < 0.045 && t >= a.blinkOff) blinkPhase = 1;
  const mouth = Math.max(0, Math.min(2, st.mouth | 0));
  if (st.speaking && mouth === 2 && a.prevMouth < 2 && hash(Math.floor(t * 10), seed) < 0.5) a.browUntil = t + 0.32;
  a.prevMouth = mouth;

  // ----- scripted action -----
  const cx = BUST_X[side];
  const top = D.headTop;
  const act = st.action && TRACKS[st.action.name] ? st.action : null;
  const p = act ? Math.max(0, Math.min(1, act.p ?? (t - act.t0) / (act.dur || 1))) : 0;
  const G = {
    cx, top, rim, robot,
    C: L.C,
    chin: L.chinBottom,
    eyeY: D.eyeY || 0,
    arm: side === 'left' ? 1 : side === 'right' ? -1 : -rim,
    partner: side === 'right' ? -1 : 1,
    screen: side === 'left' ? 1 : side === 'right' ? -1 : 0,
    glasses: !!D.glasses,
  };
  const A = act ? TRACKS[act.name](p, G) : {};
  const w = act ? env(p, 0.15, 0.85) : 0;

  // ----- passive life, damped while an action plays -----
  const pm = passive(D, st, t, seed, mouth, a);
  const damp = (v) => R(v * (1 - w));
  let emotion = A.emotion || st.emotion || 'neutral';
  if (!MOUTHS[emotion] && !LED_EYES[emotion]) emotion = 'neutral';
  const bodyDx = damp(pm.bodyDx) + (A.body?.dx || 0);
  const bodyDy = damp(pm.bodyDy) + (A.body?.dy || 0);
  let headDx = damp(pm.headDx) + (A.head?.dx || 0);
  const headDy = damp(pm.headDy) + (st.bob ? 1 - R(w) : 0) + (A.head?.dy || 0);
  let tilt = A.tilt ?? (w > 0.5 ? 0 : pm.tilt);
  if (emotion === 'thinking' && !act && Math.sin(t * 0.8 + seed) > -0.3) tilt = -rim;
  if (robot) {
    headDx += tilt;
    tilt = 0;
  }
  const turn = A.turn || 0;
  const bx = cx + bodyDx;
  const by = top + bodyDy;
  const hx = bx + headDx;
  const hy = by + headDy;

  // secondary motion: hair/earrings follow the head ~0.1 s late
  a.hist.push([t, hx - bx, hy - by]);
  while (a.hist.length > 2 && a.hist[1][0] <= t - 0.1) a.hist.shift();
  const [, ldx, ldy] = a.hist[0];

  // gaze
  let lookX = (st.look > 0 ? 1 : st.look < 0 ? -1 : 0) + damp(pm.lookX) + (A.look ? A.look[0] : 0);
  let lookY = damp(pm.lookY) + (A.look ? A.look[1] : 0);
  if (emotion === 'thinking' && !A.look) {
    lookX = -rim;
    lookY = -1;
  }
  lookX = Math.max(-2, Math.min(2, lookX));
  lookY = Math.max(-1, Math.min(1, lookY));

  // ----- backdrop -----
  ctx.drawImage(bg, 0, 0);
  drawLights(ctx, t, rim, side, acc, sky, CALM[side], cx);

  // ----- presenter -----
  const tiltSeam = robot ? -999 : D.noseY + 2;
  blitHead(ctx, L.back, bx + ldx, by + ldy, tilt, tiltSeam);
  ctx.drawImage(L.body.canvas, bx + L.body.x0, by + L.body.y0);
  const jaw = !robot && mouth === 2 && !A.mouth ? 1 : 0;
  blitHead(ctx, L.head, hx, hy, tilt, tiltSeam, robot ? Infinity : D.mouthY + 1, jaw);

  if (robot) {
    const rst = {
      emotion: A.robot || ROBOT_REACT[act?.name] || emotion,
      mode: A.eyes === 'laugh' ? 'laugh' : null,
      blinkPhase: A.eyes === 'closed' ? 2 : blinkPhase,
      mouth,
      speaking: !!st.speaking,
      lookX: Math.max(-1, Math.min(1, lookX)),
      lookY,
      scan: w > 0 ? 0 : pm.scan,
    };
    if (rst.emotion === 'laugh') rst.mode = 'laugh';
    drawRobotFace(ctx, hx, hy, rst, t, rim, a);
    drawRobotChest(ctx, bx, by, L.C, t, !!st.speaking, mouth);
  } else {
    const fx = hx + tilt + turn;
    const fst = { emotion, blinkPhase, mode: A.eyes || null, squint: A.squint || 0 };
    const eyeTop = hy + D.eyeY - 1;
    drawEye(ctx, fx - D.eyeX - EYE_W, eyeTop, false, D, fst, lookX, lookY, -rim);
    drawEye(ctx, fx + D.eyeX, eyeTop, true, D, fst, lookX, lookY, -rim);
    // brows: emotion shape, emphasis lift, sceptical single raise
    let bl = BROWS[A.brows] || BROWS[emotion] || BROWS.neutral;
    let br = bl;
    if (emotion === 'thinking' && !A.brows) {
      bl = rim > 0 ? BROWS.hi : BROWS.lo;
      br = rim > 0 ? BROWS.lo : BROWS.hi;
    }
    if (A.brows === 'hi') br = BROWS.neutral;
    if (pm.browOne && !act) {
      if (pm.browOne < 0) bl = BROWS.hi;
      else br = BROWS.hi;
    }
    const browLift = (t < a.browUntil ? (D.persona?.bounce ? -2 : -1) : 0) * (1 - R(w));
    drawBrow(ctx, fx - D.eyeX - 12, hy + D.browY + browLift, false, bl, D);
    drawBrow(ctx, fx + D.eyeX, hy + D.browY + browLift, true, br, D);
    if (emotion === 'happy' || A.eyes === 'laugh') {
      for (const s of [-1, 1]) rect(ctx, s < 0 ? fx - D.eyeX - 9 : fx + D.eyeX + 6, hy + D.eyeY + 8, 3, 1, P.pink);
    }
    // mouth: actions may override; talking keeps lip-sync
    let mName = A.mouth && !(st.speaking && mouth > 0 && A.mouth !== 'happyA' && A.mouth !== 'happyE') ? A.mouth : mouthName(emotion, mouth, t, seed);
    if (A.eyes === 'laugh') mName = A.mouth;
    drawMouth(ctx, hx + turn, hy + D.mouthY - 1, D, mName, rim < 0);
    if (D.facial === 'mustache') sprite(ctx, MUSTACHE, MUSTACHE_KEY, hx + turn - 9, hy + D.mouthY - 5, rim < 0);
  }

  blitHead(ctx, L.front, hx, hy, tilt, tiltSeam);

  // jewellery with a little lag and swing
  const swing = Math.max(-1, Math.min(1, R(Math.sin(t * (st.speaking ? 4.2 : 1.3) + seed) * (st.speaking ? 1 : 0.6)) + Math.sign(ldx - (hx - bx))));
  if (D.earrings === 'gold') {
    for (const s of [-1, 1]) {
      const ex = s < 0 ? hx - D.face.cheekHW - 2 : hx + D.face.cheekHW + 1;
      const ey = hy + D.earY + 14;
      rect(ctx, ex, ey, 1, 2, P.orange);
      const dx = ex + swing;
      rect(ctx, dx - 1, ey + 2, 3, 3, P.yellow);
      rect(ctx, dx - 1, ey + 4, 3, 1, P.orange);
      rect(ctx, dx, ey + 5, 1, 1, P.orange);
      rect(ctx, dx - (rim > 0 ? 1 : -1), ey + 2, 1, 1, P.white);
    }
  } else if (D.earrings) {
    const [c0, c1] = D.earrings === 'silver' ? [P.silver, P.white] : [P.yellow, P.white];
    for (const s of [-1, 1]) {
      const ex = s < 0 ? hx - D.face.cheekHW - 2 : hx + D.face.cheekHW;
      const ey = hy + D.earY + 12;
      rect(ctx, ex, ey, 2, 2, c0);
      rect(ctx, rim > 0 ? ex : ex + 1, ey, 1, 1, c1);
    }
  }
  if (D.necklace) {
    const ny = by + L.chinBottom + 8;
    for (let x = -11; x < 11; x++) {
      const d = (x + 0.5) / 11;
      rect(ctx, bx + x, ny + R(d * d * -7) + 7, 1, 1, (x + 20) % 3 === 0 ? P.orange : P.yellow);
    }
    const px = bx - 1 + Math.sign(ldx - (hx - bx));
    rect(ctx, px, ny + 8, 2, 3, P.yellow);
    rect(ctx, px, ny + 10, 2, 1, P.orange);
    rect(ctx, px + (rim > 0 ? 0 : 1), ny + 8, 1, 1, P.white);
  }

  // ----- hands: scripted action, else the speech gesture -----
  let hands = A.hands || [];
  if (!act) {
    if (st.gesture && !a.gOn) {
      a.gOn = true;
      a.gPose = GESTURES[Math.floor(hash(Math.floor(t * 10), seed + 3) * GESTURES.length)];
      a.gSide = side === 'center' ? (hash(Math.floor(t * 10), seed + 4) < 0.5 ? -1 : 1) : G.arm;
    }
    if (!st.gesture) a.gOn = false;
    a.g += Math.sign((st.gesture ? 1 : 0) - a.g) * Math.min(Math.abs((st.gesture ? 1 : 0) - a.g), dt / 0.22);
    if (a.g > 0) {
      const e = 1 - (1 - a.g) ** 3;
      const s = a.gSide || G.arm;
      const side2 = a.gPose === 'palm_side' ? 46 : 52;
      hands = [lift(G, a.gPose, s, cx + s * side2, top + 128 + (a.gPose === 'palm_side' ? 2 : 0), e)];
    }
  } else a.g = 0;
  if (A.papers) drawPapers(ctx, A.papers.x + bodyDx, A.papers.y + bodyDy);
  if (hands.length) {
    const R2 = { cloth: D.cloth, rim, rimCol: D.clothRim === 'base' ? acc.ramp[2] : acc.ramp[3], cuff: D.cuff, cuffShade: robot ? P.ink : D.cuff === P.white ? P.silver : D.cuff === P.yellow ? P.orange : P.black, robot };
    for (const hd of hands) {
      if (hd.y >= H + 30) continue;
      const x = hd.x + bodyDx;
      const y = hd.y + bodyDy;
      drawSleeve(ctx, R2, x, y, x + hd.s * 16, H + 46);
      const spr = cached(`hand|${id}|${hd.pose}|${hd.s}|${rim}|${acc.ramp[2]}`, () => buildHand(id, hd.pose, hd.s, rim, acc));
      ctx.drawImage(spr.canvas, x + spr.x0, y + spr.y0);
    }
  }

  ctx.drawImage(desk, 0, 180);
}

// ---------------------------------------------------------------------------
// Hand-placed hair maps (keys in HAIR.paco / HAIR.lola)
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
