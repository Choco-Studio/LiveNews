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

function canvas(w, h) {
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

// Filled disc made of spans, centred on pixel (cx, cy).
function disc(ctx, cx, cy, rad, c) {
  ctx.fillStyle = c;
  for (let dy = -rad; dy <= rad; dy++) {
    const hw = Math.floor(Math.sqrt(rad * rad - dy * dy) + 0.35);
    ctx.fillRect(cx - hw, cy + dy, hw * 2 + 1, 1);
  }
}

// ---------------------------------------------------------------------------
// Material buffer: every pixel stores a material and a tone; tones index the
// material's hue-shifted ramp, so shading passes stay inside the palette.
//   tone -2 specular, -1 light, 0 base, 1 shade, 2 deep, 3 darkest, RIM = rim
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
  // Darken (or lighten with negative d) relative to the current tone.
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
  poly(pts, m, t = 0) {
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
        const xa = Math.ceil(xs[k] - 0.5);
        const xb = Math.ceil(xs[k + 1] - 0.5) - 1;
        this.span(xa, xb, y, m, t);
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
  line(x0, y0, x1, y1, m, t = 0) {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, m, t);
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
  // Same as line() but only re-tones pixels that already exist.
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
  // Draw an ASCII map. key: char -> [material, tone] (or null to skip).
  ascii(rows, key, x, y, flip = false) {
    rows.forEach((row, j) => {
      for (let k = 0; k < row.length; k++) {
        const e = key[row[k]];
        if (!e) continue;
        const xx = flip ? x + row.length - 1 - k : x + k;
        this.set(xx, y + j, e[0], e[1] ?? 0);
      }
    });
  }
  // Pixels of `mats` with an empty neighbour in direction (dx, dy).
  edge(x, y, dx, dy, mats) {
    const m = this.mat(x, y);
    if (!m || (mats && !mats.includes(m))) return false;
    const n = this.mat(x + dx, y + dy);
    return n === 0;
  }
  each(fn) {
    for (let y = this.y0; y < this.y0 + this.h; y++) for (let x = this.x0; x < this.x0 + this.w; x++) fn(x, y);
  }
  render(mats) {
    const [c, ctx] = canvas(this.w, this.h);
    const img = ctx.createImageData(this.w, this.h);
    for (let i = 0; i < this.m.length; i++) {
      const m = this.m[i];
      if (!m) continue;
      const mt = mats[m];
      const col = this.t[i] === RIM ? mt.rim : mt.ramp[Math.max(0, Math.min(mt.ramp.length - 1, this.t[i] + 2))];
      const [R, G, B] = rgb(col);
      img.data[i * 4] = R;
      img.data[i * 4 + 1] = G;
      img.data[i * 4 + 2] = B;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return { canvas: c, x0: this.x0, y0: this.y0 };
  }
}

// ---------------------------------------------------------------------------
// Accent lights (backdrop tint + rim light)
// ---------------------------------------------------------------------------

const ACCENT_RAMPS = [
  { keys: [P.blue, P.cyan, P.navy], ramp: [P.ink, P.navy, P.blue, P.cyan] },
  { keys: [P.red, P.darkRed, P.pink], ramp: [P.maroon, P.darkRed, P.red, P.pink] },
  { keys: [P.green, P.darkGreen], ramp: [P.ink, P.darkGreen, P.green, P.cyan] },
  { keys: [P.orange, P.yellow, P.rust], ramp: [P.maroon, P.rust, P.orange, P.yellow] },
  { keys: [P.magenta, P.purple], ramp: [P.ink, P.purple, P.magenta, P.pink] },
];
function accentRamp(accent) {
  if (!accent) return ACCENT_RAMPS[0].ramp;
  const a = String(accent).toLowerCase();
  return (ACCENT_RAMPS.find((e) => e.keys.includes(a)) || ACCENT_RAMPS[0]).ramp;
}

// ---------------------------------------------------------------------------
// Presenter designs
// ---------------------------------------------------------------------------

const DESIGN = {
  A: {
    rimSide: 1, // the video wall is to his right in the studio
    headTop: 36,
    face: { hw: 23, crownR: 24, cheekEnd: 43, cheekHW: 22, chinY: 66, chinHW: 9 },
    eyeY: 36,
    eyeX: 6, // inner corner distance from centre
    browY: 31,
    mouthY: 59,
    noseY: 51,
    earY: 32,
    neckHW: 11,
    skin: [P.cream, P.cream, P.skin, P.skinShade, P.brown, P.maroon],
    hair: [P.purple, P.purple, P.maroon, P.black, P.black, P.black],
    grey: [P.white, P.silver, P.fog, P.steel, P.slate, P.ink],
    brow: [P.maroon, P.black],
    iris: [P.rust, P.brown, P.maroon],
    lips: { upper: P.skinShade, line: P.brown, lower: P.skinShade, lowerHi: P.skin, inner: P.maroon, deep: P.black },
  },
  B: {
    rimSide: -1,
    headTop: 38,
    face: { hw: 21, crownR: 23, cheekEnd: 41, cheekHW: 20, chinY: 62, chinHW: 7 },
    eyeY: 35,
    eyeX: 5,
    browY: 30,
    mouthY: 56,
    noseY: 48,
    earY: 31,
    neckHW: 9,
    skin: [P.cream, P.skin, P.tan, P.tanShade, P.brown, P.maroon],
    hair: [P.yellow, P.orange, P.rust, P.darkRed, P.maroon, P.black],
    brow: [P.brown, P.maroon],
    iris: [P.green, P.darkGreen, P.ink],
    lips: { upper: P.darkRed, line: P.maroon, lower: P.red, lowerHi: P.pink, inner: P.maroon, deep: P.black },
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

function buildPresenter(id, rim) {
  const D = DESIGN[id];
  const side = D.rimSide; // +1: shadow + rim on screen right
  const mats = [null];
  const mat = (ramp, rimCol = rim) => mats.push({ ramp, rim: rimCol }) - 1;
  const solid = (c) => mat([c, c, c, c, c, c], c);

  const SKIN = mat(D.skin);
  const HAIR = mat(D.hair);
  const GREY = D.grey ? mat(D.grey) : HAIR;
  const SUIT = id === 'A' ? mat([P.steel, P.slate, P.ink, P.black, P.black, P.black], P.blue) : mat([P.cyan, P.cyan, P.blue, P.navy, P.ink, P.black], rim);
  const SHIRT = id === 'A' ? mat([P.white, P.white, P.white, P.silver, P.fog, P.steel]) : mat([P.white, P.white, P.cream, P.skin, P.tan, P.tanShade]);
  const TIE = mat([P.pink, P.pink, P.red, P.darkRed, P.maroon, P.black], P.pink);
  const GOLD = mat([P.white, P.cream, P.yellow, P.orange, P.rust, P.brown], P.white);
  const METAL = mat([P.white, P.silver, P.fog, P.steel, P.slate, P.ink], P.white);
  const DARK = solid(P.black);
  const prof = faceProfile(D.face);
  const chinBottom = prof.length - 1;
  const hwAt = (y) => (y >= 0 && y < prof.length ? prof[y] : 0);
  const mx = (x) => -1 - x; // mirror around the face centre line

  // Helper: x on the "shadow" side for a mirrored offset.
  const sx = (x) => (side > 0 ? x : mx(x));

  // ===================== BODY (neck + torso) =====================
  const body = new Buf(-90, 40, 180, 150);
  const nhw = D.neckHW;
  const neckTop = D.mouthY - 4;
  const collarY = chinBottom + 8;
  body.rect(-nhw, neckTop, nhw * 2, collarY - neckTop + 10, SKIN, 1);
  // cast shadow of the jaw on the neck
  for (let x = -nhw; x < nhw; x++) {
    const jx = Math.abs(x + 0.5);
    const depth = Math.round(6 - (jx / nhw) * 3);
    for (let y = neckTop; y < chinBottom + depth; y++) body.setTone(x, y, 2);
  }
  // neck shadow side + rim on the lit edge of the neck muscle
  for (let y = neckTop; y < collarY + 10; y++) {
    body.setTone(sx(nhw - 1), y, 2);
    body.setTone(sx(nhw - 2), y, 2);
  }

  if (id === 'A') {
    // jacket silhouette
    const sh = [
      [-14, collarY - 4], [-30, collarY + 1], [-46, collarY + 6], [-58, collarY + 12], [-64, collarY + 18], [-67, collarY + 26],
      [-69, collarY + 60], [-71, 150],
    ];
    const jacket = [...sh, ...sh.slice().reverse().map(([x, y]) => [-x, y])];
    body.poly(jacket, SUIT);
    // shirt V + collar
    body.poly([[-13, collarY - 6], [12 + 1, collarY - 6], [1, collarY + 52], [-1, collarY + 52]], SHIRT);
    // shirt shading: shadow beneath the collar and on the shadow side of the V
    for (let y = collarY - 6; y < collarY + 52; y++) {
      for (let x = -14; x <= 14; x++) {
        if (body.mat(x, y) !== SHIRT) continue;
        if (side * x > 4) body.setTone(x, y, 1);
      }
    }
    // collar points (shirt) over the jacket
    for (const s of [-1, 1]) {
      const pts = [[s * 2, collarY + 6], [s * 13, collarY - 7], [s * 16, collarY - 3], [s * 9, collarY + 9]];
      body.poly(pts.map(([x, y]) => [s < 0 ? x : x + 1, y]), SHIRT, s === side ? 1 : 0);
    }
    // collar edge lines
    for (const s of [-1, 1]) {
      const a = s < 0 ? 0 : 1;
      body.toneLine(s * 9 + a - (s < 0 ? 1 : 0), collarY + 9, s * 16 + a - (s < 0 ? 0 : 1), collarY - 3, 2, [SHIRT]);
    }
    // tie: knot + blade
    body.poly([[-4, collarY + 1], [4, collarY + 1], [3, collarY + 8], [-3, collarY + 8]], TIE);
    body.poly([[-3, collarY + 8], [3, collarY + 8], [5, collarY + 40], [0, collarY + 46], [-5, collarY + 40]], TIE);
    for (let y = collarY + 1; y < collarY + 47; y++) {
      for (let x = -6; x <= 6; x++) {
        if (body.mat(x, y) !== TIE) continue;
        if (y < collarY + 3) body.setTone(x, y, 1);
        if (side * (x + 0.5) > 2) body.setTone(x, y, 1);
        if (y === collarY + 8 || y === collarY + 9) body.setTone(x, y, 2);
      }
    }
    body.setTone(sx(-2), collarY + 3, -1);
    body.setTone(sx(-2), collarY + 4, -1);
    body.toneLine(sx(-2), collarY + 12, sx(-3), collarY + 30, -1, [TIE]);
    // tie dimple shadow
    body.setTone(0, collarY + 10, 2);
    // lapels
    for (const s of [-1, 1]) {
      const o = s < 0 ? 0 : 1;
      const lp = [
        [s * 14 + o, collarY - 6], [s * 21 + o, collarY - 2], [s * 25 + o, collarY + 14], [s * 30 + o, collarY + 17], [s * 26 + o, collarY + 30],
        [s * 3 + o, collarY + 66], [s * 1 + o, collarY + 60], [s * 12 + o, collarY + 12],
      ];
      body.poly(lp, SUIT, s === side ? 1 : -1);
    }
    // lapel edges (deep) and notch
    for (const s of [-1, 1]) {
      const o = s < 0 ? 0 : 1;
      body.toneLine(s * 30 + o - s, collarY + 17, s * 3 + o, collarY + 66, 2, [SUIT]);
      body.toneLine(s * 25 + o - s, collarY + 14, s * 27 + o, collarY + 16, 3, [SUIT]);
    }
    // pocket square on the wearer's left chest
    const pq = 40 * side * -1;
    const px0 = pq < 0 ? pq - 6 : pq;
    body.ascii(['..w..w.', '.wwwwww', 'IIIIIII'], { w: [SHIRT, 0], I: [SUIT, 3] }, px0, collarY + 30);
    // lapel mic
    body.rect(sx(-20), collarY + 22, 2, 3, DARK);
    body.set(sx(-20), collarY + 22, METAL, 0);
    // cloth folds: armpit creases and sleeve seams
    for (const s of [-1, 1]) {
      const o = s < 0 ? 0 : 1;
      body.toneLine(s * 50 + o - (s > 0 ? 1 : 0), collarY + 38, s * 40 + o, collarY + 52, s === side ? 2 : 1, [SUIT]);
      body.toneLine(s * 46 + o, collarY + 44, s * 41 + o, collarY + 50, s === side ? 2 : 1, [SUIT]);
      body.toneLine(s * 58 + o, collarY + 26, s * 56 + o, collarY + 60, 3, [SUIT]);
    }
  } else {
    // Lola: blazer over a cream top with a scoop neckline
    const sh = [
      [-12, collarY - 6], [-26, collarY], [-40, collarY + 5], [-50, collarY + 11], [-55, collarY + 18], [-57, collarY + 26],
      [-59, collarY + 60], [-60, 150],
    ];
    const jacket = [...sh, ...sh.slice().reverse().map(([x, y]) => [-x, y])];
    body.poly(jacket, SUIT);
    // top
    body.poly([[-20, collarY - 4], [21, collarY - 4], [16, collarY + 60], [-15, collarY + 60]], SHIRT);
    // neckline (skin scoop)
    body.ellipse(0, collarY - 6, 13, 14, SKIN, 0);
    for (let y = collarY - 8; y < collarY + 10; y++) for (let x = -14; x < 14; x++) if (body.mat(x, y) === SKIN && y < neckTop + 30) body.setTone(x, y, 1);
    // collarbone hint + chest light
    for (let x = -12; x < 12; x++) if (body.mat(x, collarY + 3) === SKIN) body.setTone(x, collarY + 3, 0);
    // lapels (shawl-ish, wide)
    for (const s of [-1, 1]) {
      const o = s < 0 ? 0 : 1;
      const lp = [[s * 12 + o, collarY - 6], [s * 22 + o, collarY - 3], [s * 27 + o, collarY + 20], [s * 18 + o, collarY + 60], [s * 12 + o, collarY + 60], [s * 15 + o, collarY + 8]];
      body.poly(lp, SUIT, s === side ? 1 : -1);
      body.toneLine(s * 27 + o - s, collarY + 20, s * 18 + o, collarY + 60, 2, [SUIT]);
    }
    for (const s of [-1, 1]) {
      const o = s < 0 ? 0 : 1;
      body.toneLine(s * 44 + o, collarY + 36, s * 35 + o, collarY + 50, s === side ? 2 : 1, [SUIT]);
      body.toneLine(s * 50 + o, collarY + 26, s * 48 + o, collarY + 60, 2, [SUIT]);
    }
  }

  // torso shading: shadow side band + rim + lit-side highlight on shoulder
  const torsoMats = [SUIT];
  body.each((x, y) => {
    const m = body.mat(x, y);
    if (m !== SUIT) return;
    // distance to silhouette edge on the shadow side
    let d = 0;
    while (d < 7 && body.mat(x + side * (d + 1), y)) d++;
    if (d < 6 && y > collarY + 8) body.shift(x, y, 1, torsoMats);
    // top of shoulders catch the key light on the lit side
    let up = 0;
    while (up < 3 && body.mat(x, y - up - 1)) up++;
    if (up < 2 && side * x < -10) body.setTone(x, y, -1);
  });
  body.each((x, y) => {
    if (body.edge(x, y, side, 0, torsoMats) && y > collarY - 2) body.setTone(x, y, RIM);
    if (body.edge(x, y, 0, -1, torsoMats) && side * x > 8) body.setTone(x, y, RIM);
  });

  // ===================== HEAD (face, ears, nose) =====================
  const head = new Buf(-36, -8, 72, 86);
  for (let y = 0; y < prof.length; y++) head.span(-prof[y], prof[y] - 1, y, SKIN);
  // ears
  const ey = D.earY;
  for (const s of [-1, 1]) {
    for (let k = 0; k < 15; k++) {
      const yy = ey + k;
      const hw = hwAt(yy);
      const out = [2, 3, 4, 4, 4, 4, 4, 4, 3, 3, 3, 3, 2, 2, 1][k];
      if (s < 0) head.span(-hw - out, -hw, yy, SKIN, 0);
      else head.span(hw - 1, hw - 1 + out, yy, SKIN, 0);
    }
    // inner ear
    for (let k = 3; k < 12; k++) {
      const yy = ey + k;
      const hw = hwAt(yy);
      const xi = s < 0 ? -hw - 2 : hw + 1;
      head.setTone(xi, yy, k < 5 || k > 9 ? 1 : 2);
      if (k > 4 && k < 10) head.setTone(xi + (s < 0 ? 1 : -1), yy, 1);
    }
  }

  // --- face shading ---
  const lastFaceRow = prof.length - 1;
  for (let y = 0; y < prof.length; y++) {
    const hw = prof[y];
    // shadow side band: wider towards the jaw
    const band = y < D.eyeY - 4 ? 3 : y < D.mouthY - 6 ? 4 : 5;
    for (let k = 0; k < band; k++) head.setTone(sx(hw - 1 - k), y, 1, [SKIN]);
    head.setTone(sx(hw - 1), y, y > D.eyeY + 10 ? 2 : 1, [SKIN]);
    // lit side: selective outline on the jaw
    if (y > D.mouthY - 8) head.setTone(sx(-hw), y, 1, [SKIN]);
  }
  // chin underside
  for (let x = -prof[lastFaceRow]; x < prof[lastFaceRow]; x++) head.setTone(x, lastFaceRow, 1, [SKIN]);
  for (let x = -prof[lastFaceRow - 1]; x < prof[lastFaceRow - 1]; x++) if (Math.abs(x + 0.5) > 4) head.setTone(x, lastFaceRow - 1, 1, [SKIN]);
  // jaw line on the lit side
  for (let y = D.mouthY; y < lastFaceRow; y++) head.setTone(sx(-prof[y] + 1), y, 0, [SKIN]);

  // brow ridge / eye sockets (above each eye)
  const eY = D.eyeY;
  for (const s of [-1, 1]) {
    for (let k = 0; k < 11; k++) {
      const x = s < 0 ? -D.eyeX - 1 - k : D.eyeX + k;
      head.setTone(x, eY - 1, 1, [SKIN]);
      if (k > 1 && k < 9) head.setTone(x, eY - 2, s === side ? 1 : 0, [SKIN]);
    }
    // inner corner socket shadow next to the nose bridge
    const ix = s < 0 ? -D.eyeX : D.eyeX - 1;
    for (let y = eY - 1; y < eY + 4; y++) head.setTone(ix, y, 1, [SKIN]);
    // under-eye soft shadow (bags for the veteran)
    if (id === 'A') for (let k = 2; k < 8; k++) head.setTone(s < 0 ? -D.eyeX - 1 - k : D.eyeX + k, eY + 6, 1, [SKIN]);
  }
  // cheek highlight on the lit side
  for (const [dx, dy] of [[0, 0], [1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [2, 1], [3, 1], [0, 2], [1, 2]]) {
    head.setTone(sx(-16 + dx), eY + 8 + dy, -1, [SKIN]);
  }
  // forehead highlight
  for (const [dx, dy] of [[0, 0], [1, 0], [2, 0], [3, 0], [-1, 1], [0, 1], [1, 1], [2, 1]]) head.setTone(sx(-8 + dx), 20 + dy, -1, [SKIN]);

  // nose
  const nY = D.noseY;
  const big = id === 'A';
  const bridgeTop = eY + 1;
  // shadow side of the bridge
  for (let y = bridgeTop; y < nY - 1; y++) head.setTone(sx(big ? 2 : 1), y, 1, [SKIN]);
  head.setTone(sx(big ? 3 : 2), nY - 3, 1, [SKIN]);
  head.setTone(sx(big ? 3 : 2), nY - 2, 1, [SKIN]);
  // bridge highlight on the lit side
  for (let y = bridgeTop + 2; y < nY - 3; y++) head.setTone(sx(big ? -1 : -1), y, -1, [SKIN]);
  // tip + wings + nostrils
  const tipKey = { h: [SKIN, -1], b: [SKIN, 0], s: [SKIN, 1], d: [SKIN, 2], n: [SKIN, 3] };
  const noseRows = big
    ? ['..s.hh..s..', '.s.bhhb..s.', 'sbbbbbbbbbs', '.sn.ss.nds.', '..sssssss..']
    : ['..s.hh.s..', '.s.bhbb.s.', '.sbbbbbbs.', '..n.ss.ns.', '...ssss...'];
  const noseW = noseRows[0].length;
  head.ascii(noseRows, tipKey, -Math.floor(noseW / 2), nY - 3, side < 0);
  // cast shadow under the nose towards the shadow side
  for (let k = 0; k < 4; k++) head.setTone(sx(1 + k), nY + 2, 1, [SKIN]);

  // under-lip shadow & chin highlight
  const mY = D.mouthY;
  for (let x = -4; x < 4; x++) head.setTone(x, mY + 4, 1, [SKIN]);
  head.setTone(-1, lastFaceRow - 4, -1, [SKIN]);
  head.setTone(0, lastFaceRow - 4, -1, [SKIN]);
  head.setTone(sx(-2), lastFaceRow - 4, -1, [SKIN]);
  if (id === 'A') {
    // nasolabial folds (veteran)
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? -7 : 6;
      head.setTone(x0 + s * 1, nY + 1, 1, [SKIN]);
      head.setTone(x0 + s * 2, nY + 2, 1, [SKIN]);
      head.setTone(x0 + s * 2, nY + 3, 1, [SKIN]);
      head.setTone(x0 + s * 3, nY + 4, 1, [SKIN]);
    }
  }

  // rim light on the shadow-side silhouette of the face/ears
  head.each((x, y) => {
    if (head.edge(x, y, side, 0, [SKIN]) && y > 18 && y < lastFaceRow - 1) head.setTone(x, y, RIM);
  });

  // ===================== HAIR =====================
  const front = new Buf(-40, -12, 80, 80);
  const back = new Buf(-40, -12, 80, 90);
  if (id === 'A') buildPacoHair(front, head, prof, D, HAIR, GREY, SKIN, side);
  else buildLolaHair(front, back, head, prof, D, HAIR, SKIN, side);

  // glasses (front layer)
  if (id === 'A') {
    const gy = eY - 3;
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? -D.eyeX - 14 : D.eyeX - 1;
      const w = 15;
      const h = 10;
      for (let x = x0 + 1; x < x0 + w - 1; x++) {
        front.set(x, gy, METAL, 0);
        front.set(x, gy + h - 1, METAL, 1);
      }
      for (let y = gy + 1; y < gy + h - 1; y++) {
        front.set(x0, y, METAL, s === side ? 1 : 0);
        front.set(x0 + w - 1, y, METAL, s === side ? 1 : 0);
      }
      // glints
      front.set(x0 + 2, gy, METAL, -2);
      front.set(x0 + 3, gy, METAL, -2);
      // temple arm towards the ear
      const ax = s < 0 ? x0 - 1 : x0 + w;
      const earEdge = s < 0 ? -hwAt(gy + 2) - 1 : hwAt(gy + 2);
      for (let x = Math.min(ax, earEdge); x <= Math.max(ax, earEdge); x++) front.set(x, gy + 2, METAL, s === side ? 2 : 1);
    }
    // bridge
    front.span(-D.eyeX + 1, D.eyeX - 2, gy + 1, METAL, 0);
  }

  return {
    mats,
    body: body.render(mats),
    head: head.render(mats),
    front: front.render(mats),
    back: back.render(mats),
    prof,
  };
}

function buildPacoHair(front, head, prof, D, HAIR, GREY, SKIN, side) {
  const hwAt = (y) => (y >= 0 && y < prof.length ? prof[y] : prof[prof.length - 1]);
  const partX = side > 0 ? -9 : 8;
  // hair mass: slightly larger than the skull top
  for (let y = -3; y < 30; y++) {
    const base = y < 0 ? 0 : hwAt(y);
    let hw;
    if (y < 0) hw = [12, 17, 20][y + 3];
    else hw = base + (y < 20 ? 2 : 1);
    // hairline across the forehead (dips a little, lower on the swept side)
    for (let x = -hw; x < hw; x++) {
      const ax = Math.abs(x + 0.5);
      // hairline row as a function of x
      const swept = side * (x + 0.5) > 0;
      let hl = swept ? 13 + Math.round(((ax - 2) / 20) ** 2 * 6) : 14 + Math.round(((ax - 2) / 18) ** 2 * 8);
      if (ax > 19) hl = 30; // temples go down to the ears
      if (y > hl) continue;
      front.set(x, y, HAIR, 0);
    }
  }
  // sideburns
  for (const s of [-1, 1]) {
    for (let y = 22; y < D.earY + 6; y++) {
      const hw = hwAt(y);
      for (let k = 0; k < 3; k++) front.set(s < 0 ? -hw + k : hw - 1 - k, y, HAIR, 0);
    }
  }
  // grey temples
  for (const s of [-1, 1]) {
    for (let y = 18; y < D.earY + 6; y++) {
      const hw = hwAt(y);
      const width = y < 22 ? 2 : 4;
      for (let k = 0; k < width; k++) {
        const x = s < 0 ? -hw - 1 + k : hw - k;
        if (front.mat(x, y)) front.set(x, y, GREY, k === width - 1 ? 1 : 0);
      }
    }
  }
  // shading: lit side highlight streaks following the sweep, shadow side darker
  front.each((x, y) => {
    const m = front.mat(x, y);
    if (m !== HAIR) return;
    if (side * (x + 0.5) > 10) front.setTone(x, y, 1);
    if (front.edge(x, y, 0, 1, [HAIR])) front.setTone(x, y, 1);
  });
  // part line
  for (let y = -1; y < 13; y++) front.setTone(partX, y, 1);
  front.setTone(partX - side, -2, 1);
  // highlight strands (sweep from part across the head)
  const strands = [
    [partX - side * 2, 1, -12, 4],
    [partX + side * 2, 2, 10, 2],
    [partX + side * 3, 5, 9, 1],
    [partX + side * 3, 8, 7, 1],
  ];
  for (const [x0, y0, len, slope] of strands) {
    for (let k = 0; k < Math.abs(len); k++) {
      const x = x0 + Math.sign(len) * k * side;
      const y = y0 + Math.floor((k * slope) / Math.abs(len));
      front.setTone(x, y, -1, [HAIR]);
    }
  }
  // specular glints
  front.setTone(partX - side * 4, 0, -2, [HAIR]);
  front.setTone(partX - side * 5, 0, -2, [HAIR]);
  front.setTone(partX + side * 5, 3, -2, [HAIR]);
  // rim light + lit-side outline
  front.each((x, y) => {
    if (front.edge(x, y, side, 0, [HAIR, GREY]) || (front.edge(x, y, 0, -1, [HAIR, GREY]) && side * x > 4)) front.setTone(x, y, RIM);
  });
  // forehead shadow under the hair
  head.each((x, y) => {
    if (head.mat(x, y) && front.mat(x, y - 1) && !front.mat(x, y)) head.shift(x, y, 1);
  });
}

function buildLolaHair(front, back, head, prof, D, HAIR, SKIN, side) {
  const hwAt = (y) => (y >= 0 && y < prof.length ? prof[y] : prof[prof.length - 1]);
  const bottom = D.mouthY + 2;
  // back mass: rounded bob that flares slightly at the bottom
  for (let y = -5; y <= bottom; y++) {
    let hw;
    if (y < 18) {
      const d = (18 - y) / 23.5;
      hw = 27 * Math.sqrt(Math.max(0, 1 - d * d));
    } else hw = 27 + Math.min(2, (y - 18) / 10);
    hw = Math.round(hw);
    // ends curl inward: shave corners on the last rows
    const k = bottom - y;
    if (k < 3) hw -= [3, 1, 0][k];
    back.span(-hw, hw - 1, y, HAIR, 0);
  }
  // inner shadow next to the face and bottom ends
  back.each((x, y) => {
    if (!back.mat(x, y)) return;
    const hw = hwAt(Math.max(0, Math.min(prof.length - 1, y)));
    const ax = Math.abs(x + 0.5);
    if (y > 20 && ax < hw + 3) back.setTone(x, y, 2);
    else if (y > 20 && ax < hw + 5) back.setTone(x, y, 1);
    if (back.edge(x, y, 0, 1)) back.setTone(x, y, 1);
    if (side * x > 18) back.shift(x, y, 1);
  });
  // strand separations in the back mass
  for (const s of [-1, 1]) {
    for (const off of [3, 7]) {
      for (let y = 24; y < bottom - 1; y++) {
        const x = s < 0 ? -hwAt(Math.min(y, prof.length - 1)) - off : hwAt(Math.min(y, prof.length - 1)) + off - 1;
        back.shift(x, y, 1, [HAIR]);
      }
    }
  }
  back.each((x, y) => {
    if (back.edge(x, y, side, 0, [HAIR]) && y > 4) back.setTone(x, y, RIM);
  });

  // front: crown + side-swept bangs
  const partX = side < 0 ? 7 : -8;
  for (let y = -5; y < 30; y++) {
    let hw;
    if (y < 18) {
      const d = (18 - y) / 23.5;
      hw = Math.round(27 * Math.sqrt(Math.max(0, 1 - d * d)));
    } else hw = 27;
    for (let x = -hw; x < hw; x++) {
      const u = (x + 0.5) * -side; // + towards the swept (lit) side... bangs sweep away from part
      const ax = Math.abs(x + 0.5);
      // bang edge: low on the side away from the part, high near the part
      const t = (u + 22) / 44; // 0 at part side, 1 at far side
      let hl = Math.round(12 + t * 12);
      if (ax > hwAt(Math.min(y, prof.length - 1)) - 2) hl = 30; // sides frame the face
      if (y > hl) continue;
      front.set(x, y, HAIR, 0);
    }
  }
  // remove side coverage over the ears (tucked behind)
  for (let y = D.earY - 2; y < 30; y++) {
    for (const s of [-1, 1]) {
      const hw = hwAt(y);
      for (let k = -1; k < 6; k++) {
        const x = s < 0 ? -hw - k : hw - 1 + k;
        if (k >= 0 && y >= D.earY) front.set(x, y, 0, 0);
      }
    }
  }
  // shading
  front.each((x, y) => {
    const m = front.mat(x, y);
    if (m !== HAIR) return;
    if (front.edge(x, y, 0, 1, [HAIR])) front.setTone(x, y, 1);
    if (side * (x + 0.5) > 12) front.shift(x, y, 1);
  });
  // highlight ring (clumpy)
  for (let x = -22; x < 22; x++) {
    const d = (x + 0.5) / 24;
    const y = Math.round(4 - Math.sqrt(Math.max(0, 1 - d * d)) * 6 + 2);
    const clump = Math.floor((x + 40) / 4) % 2 === 0;
    front.setTone(x, y, side * x > 8 ? 0 : -1, [HAIR]);
    if (clump && side * x < 6) front.setTone(x, y + 1, -1, [HAIR]);
    if (clump && side * x < -4) front.setTone(x, y, -2, [HAIR]);
  }
  // bang strand lines
  for (let k = 0; k < 4; k++) {
    const x0 = partX - side * (4 + k * 6);
    for (let j = 0; j < 7; j++) front.setTone(x0 - side * Math.floor(j / 2), 10 + j + k, 1, [HAIR]);
  }
  front.each((x, y) => {
    if (front.edge(x, y, side, 0, [HAIR]) || (front.edge(x, y, 0, -1, [HAIR]) && side * x > 4)) front.setTone(x, y, RIM);
  });
  head.each((x, y) => {
    if (head.mat(x, y) && front.mat(x, y - 1) && !front.mat(x, y)) head.shift(x, y, 1);
  });
}

// ---------------------------------------------------------------------------
// Dynamic face parts (drawn per frame)
// ---------------------------------------------------------------------------

// Eye openings for the eye on screen-left; outer corner at column 0.
const EYE_W = 10;
const EYE_TOP = [3, 2, 1, 0, 0, 0, 0, 1, 1, 2];
const EYE_BOT = [4, 5, 5, 5, 5, 5, 5, 5, 4, 4];

function eyeShape(emotion, blinkPhase) {
  let top = EYE_TOP.slice();
  let bot = EYE_BOT.slice();
  switch (emotion) {
    case 'surprised':
      top = top.map((v, i) => (i > 0 && i < 9 ? v - 1 : v));
      break;
    case 'happy':
      bot = bot.map((v, i) => (i > 1 && i < 8 ? v - 1 : v));
      break;
    case 'serious':
      top = top.map((v, i) => (i > 0 && i < 9 ? v + 1 : v));
      break;
    case 'sad':
      top = top.map((v, i) => (i < 4 ? v + 1 : v));
      break;
    case 'thinking':
      top = top.map((v, i) => (i > 0 && i < 9 ? v + 1 : v));
      break;
    default:
  }
  if (blinkPhase === 1) top = top.map((v, i) => Math.max(v, bot[i] - 2));
  return { top, bot };
}

function drawEye(ctx, x0, y0, flip, D, st, look, lookY) {
  const { top, bot } = eyeShape(st.emotion, st.blinkPhase);
  const X = (c) => (flip ? x0 + EYE_W - 1 - c : x0 + c);
  const lash = D.brow[1];
  if (st.blinkPhase === 2) {
    // closed: lid line curving down + lid skin
    for (let c = 0; c < EYE_W; c++) {
      const y = y0 + Math.max(top[c], bot[c] - 1);
      rect(ctx, X(c), y0 + top[c], 1, y - (y0 + top[c]), D.skin[2]);
      rect(ctx, X(c), y, 1, 1, lash);
    }
    rect(ctx, X(0), y0 + bot[0] - 1, 1, 1, lash);
    return;
  }
  // whites
  for (let c = 0; c < EYE_W; c++) {
    const h = bot[c] - top[c] - 1;
    if (h > 0) {
      rect(ctx, X(c), y0 + top[c] + 1, 1, h, P.white);
      rect(ctx, X(c), y0 + top[c] + 1, 1, 1, P.silver); // lid shadow on the white
    }
  }
  // iris + pupil (not mirrored so highlights agree)
  const ic = x0 + 3 + look; // iris left column
  const iy = y0 + 1 + lookY;
  const small = st.emotion === 'surprised';
  for (let c = 0; c < 4; c++) {
    const col = ic + c;
    const cc = flip ? EYE_W - 1 - (col - x0) : col - x0;
    if (cc < 0 || cc >= EYE_W) continue;
    for (let rr = 0; rr < 4; rr++) {
      const yy = iy + rr;
      if (yy <= y0 + top[cc] || yy >= y0 + bot[cc]) continue;
      if ((c === 0 || c === 3) && (rr === 0 || rr === 3)) continue; // rounded iris
      let colr = rr === 0 || yy === y0 + top[cc] + 1 ? D.iris[1] : D.iris[0];
      const pupil = small ? c === 1 && rr === 2 : (c === 1 || c === 2) && (rr === 1 || rr === 2);
      if (pupil) colr = P.black;
      if (c === 1 && rr === 1) colr = P.white; // catch light
      if (!small && c === 2 && rr === 3) colr = D.iris[0];
      rect(ctx, col, yy, 1, 1, colr);
    }
  }
  // upper lid / lashes
  for (let c = 0; c < EYE_W; c++) rect(ctx, X(c), y0 + top[c], 1, 1, lash);
  rect(ctx, X(0) + (flip ? 1 : -1), y0 + top[0] - 1, 1, 1, lash); // outer flick
  if (D.lashes) rect(ctx, X(1) + (flip ? 1 : -1), y0 + top[1] - 1, 1, 1, lash);
  // lower lid
  for (let c = 1; c < EYE_W - 1; c++) rect(ctx, X(c), y0 + bot[c], 1, 1, D.skin[3]);
  if (st.emotion === 'happy') for (let c = 2; c < EYE_W - 2; c++) rect(ctx, X(c), y0 + bot[c] + 1, 1, 1, D.skin[1]);
}

// Brow heights per column (outer -> inner), smaller = higher.
const BROWS = {
  neutral: [2, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2],
  happy: [1, 0, -1, -1, -1, -1, -1, 0, 0, 0, 0, 1],
  serious: [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 3, 3],
  surprised: [0, -1, -2, -3, -3, -3, -3, -2, -2, -2, -1, -1],
  sad: [3, 3, 2, 2, 1, 1, 0, 0, -1, -1, -2, -2],
  thinkingHi: [1, -1, -2, -2, -2, -2, -2, -1, -1, 0, 0, 0],
  thinkingLo: [1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2],
};

function drawBrow(ctx, x0, y0, flip, shape, D) {
  for (let c = 0; c < 12; c++) {
    const x = flip ? x0 + 11 - c : x0 + c;
    const y = y0 + shape[c];
    const thick = c > 1 && c < 11 ? 2 : 1;
    rect(ctx, x, y, 1, 1, D.brow[0]);
    if (thick > 1) rect(ctx, x, y + 1, 1, 1, D.brow[1]);
  }
}

// Mouth sprites: 16 wide, centred between columns 7 and 8.
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

function drawMouth(ctx, cx, y, D, st) {
  const L = D.lips;
  const key = { u: L.upper, K: L.line, l: L.lower, h: L.lowerHi, m: L.inner, M: L.deep, t: P.white, T: P.silver, g: P.pink };
  let name = st.emotion in MOUTHS ? st.emotion : 'neutral';
  if (st.mouth > 0) {
    const v = hash(Math.floor(st.t * 7), D === DESIGN.A ? 1 : 2) < 0.35;
    if (st.mouth === 1) name = st.emotion === 'happy' ? 'happyE' : v || st.emotion === 'surprised' ? 'O' : 'E';
    else name = st.emotion === 'happy' ? 'happyA' : v || st.emotion === 'surprised' ? 'AO' : 'A';
  }
  const rows = MOUTHS[name];
  const off = name === 'happy' || name === 'happyE' || name === 'happyA' ? -1 : 0;
  rows.forEach((row, j) => {
    for (let k = 0; k < row.length; k++) {
      const c = key[row[k]];
      if (c) rect(ctx, cx - 8 + k, y + j + off, 1, 1, c);
    }
  });
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
  day: { core: P.blue, edge: P.navy, b: [P.slate, P.steel], lights: [P.silver, P.cyan] },
  dusk: { core: P.purple, edge: P.ink, b: [P.ink, P.maroon], lights: [P.orange, P.yellow] },
  night: { core: P.navy, edge: P.ink, b: [P.black, P.ink], lights: [P.yellow, P.orange] },
};

// Soft-edged rectangle: concentric steps instead of a gradient.
function softRect(ctx, x, y, w, h, cols, step = 3) {
  cols.forEach((c, i) => {
    const k = i * step;
    if (w - k * 2 <= 0 || h - k * 2 <= 0) return;
    rect(ctx, x + k + 1, y + k, w - k * 2 - 2, h - k * 2, c);
    rect(ctx, x + k, y + k + 1, w - k * 2, h - k * 2 - 2, c);
  });
}

function buildBackdrop(id, side, ramp, sky) {
  const [c, ctx] = canvas(W, H);
  const mir = DESIGN[id].rimSide < 0; // B sees the studio mirrored
  const shift = side === 'left' ? -30 : side === 'right' ? 30 : 0;
  const X = (x, w) => (mir ? W - x - w : x) + shift;
  rect(ctx, 0, 0, W, H, P.ink);
  // soft wall panels
  for (const px of [-40, 70, 330]) softRect(ctx, X(px, 60, 0), 18, 60, 140, [P.slate], 3);
  // defocused city window (behind the shoulder away from the wall)
  const S = SKY[sky];
  const wx = X(-30, 150);
  softRect(ctx, wx, 24, 150, 112, [S.edge, S.core], 4);
  // blurry skyline masses
  const rnd = hash;
  for (let i = 0; i < 6; i++) {
    const bw = 18 + Math.floor(rnd(i, 3) * 16);
    const bx = wx + 6 + i * 24 + Math.floor(rnd(i, 4) * 6);
    const bh = 30 + Math.floor(rnd(i, 5) * 40);
    softRect(ctx, bx, 132 - bh, bw, bh + 10, [S.b[i % 2]], 2);
  }
  // window mullion
  softRect(ctx, wx + 72, 22, 8, 118, [P.slate, P.steel], 2);
  // video wall glow on the other side
  const vx = X(196, 230);
  softRect(ctx, vx, 14, 230, 122, [P.black, ramp[0], ramp[1]], 4);
  // diagonal soft stripes on the wall
  ctx.save();
  ctx.beginPath();
  ctx.rect(vx + 10, 24, 210, 102);
  ctx.clip();
  for (let k = -6; k < 12; k++) {
    for (let yy = 0; yy < 110; yy++) {
      const x = vx + k * 28 + yy;
      rect(ctx, x, 20 + yy, 10, 1, ramp[0]);
    }
  }
  ctx.restore();
  // truss band
  rect(ctx, 0, 0, W, 10, P.black);
  rect(ctx, 0, 10, W, 2, P.ink);
  // floor/desk shadow zone at the bottom
  rect(ctx, 0, 150, W, H - 150, P.ink);
  rect(ctx, 0, 160, W, H - 160, P.black);
  return c;
}

const BOKEH = Array.from({ length: 26 }, (_, i) => ({
  x: Math.floor(hash(i, 11) * 420) - 18,
  y: 18 + Math.floor(hash(i, 12) * 120),
  r: 2 + Math.floor(hash(i, 13) * 4),
  ph: hash(i, 14) * 6.28,
  sp: 0.3 + hash(i, 15) * 0.5,
  kind: hash(i, 16),
}));

function drawLights(ctx, t, id, side, ramp, sky, calm) {
  const mir = DESIGN[id].rimSide < 0;
  const shift = side === 'left' ? -30 : side === 'right' ? 30 : 0;
  const S = SKY[sky];
  // truss lamps (warm bokeh at the top)
  for (let i = 0; i < 7; i++) {
    const x = Math.round(((mir ? W - (i * 64 + 20) : i * 64 + 20) + shift + 400) % 400) - 8;
    const on = Math.sin(t * 0.7 + i * 1.7) > -0.8;
    disc(ctx, x, 3, 5, P.maroon);
    disc(ctx, x, 3, 3, on ? P.yellow : P.orange);
  }
  // wall + city bokeh
  for (let i = 0; i < BOKEH.length; i++) {
    const b = BOKEH[i];
    let x = b.x + Math.round(Math.sin(t * b.sp * 0.4 + b.ph) * 3);
    const y = b.y + Math.round(Math.cos(t * b.sp * 0.3 + b.ph) * 2);
    if (mir) x = W - x;
    x += shift;
    const onWall = mir ? x < W / 2 + shift : x > W / 2 + shift;
    if (calm && x > calm.x - 8 && x < calm.x + calm.w + 8 && y > calm.y - 8 && y < calm.y + calm.h + 8) continue;
    const tw = Math.sin(t * b.sp * 2 + b.ph);
    const rr = b.r + (tw > 0.6 ? 1 : 0);
    if (onWall) {
      disc(ctx, x, y, rr, ramp[1]);
      disc(ctx, x, y, rr - 1, b.kind > 0.6 ? ramp[3] : ramp[2]);
    } else {
      disc(ctx, x, y, rr, S.edge);
      disc(ctx, x, y, rr - 1, b.kind > 0.5 ? S.lights[0] : S.lights[1]);
    }
  }
}

// ---------------------------------------------------------------------------
// Hands
// ---------------------------------------------------------------------------

function buildHand(id, rim) {
  const D = DESIGN[id];
  const mats = [null];
  const mat = (ramp, r = rim) => mats.push({ ramp, rim: r }) - 1;
  const SKIN = mat(D.skin);
  const SLEEVE = id === 'A' ? mat([P.steel, P.slate, P.ink, P.black, P.black, P.black], P.blue) : mat([P.cyan, P.cyan, P.blue, P.navy, P.ink, P.black]);
  const CUFF = id === 'A' ? mat([P.white, P.white, P.white, P.silver, P.fog, P.steel]) : mat([P.white, P.cream, P.yellow, P.orange, P.rust, P.brown]);
  const b = new Buf(-14, -30, 30, 70);
  if (id === 'A') {
    // open palm, fingers up, thumb towards the body
    const fingers = [[-6, -24], [-2, -27], [2, -26], [6, -22]];
    for (const [fx, fy] of fingers) {
      b.rect(fx, fy + 1, 3, -fy, SKIN);
      b.span(fx + 1, fx + 1, fy, SKIN);
    }
    b.rect(-7, -10, 16, 12, SKIN);
    b.span(-6, 7, 2, SKIN);
    b.poly([[-7, -6], [-12, -12], [-14, -11], [-10, -2], [-7, 1]], SKIN);
    // finger gaps
    for (const [fx] of fingers.slice(1)) for (let y = -16; y < -9; y++) b.setTone(fx - 1 + 0, y, 1);
    // palm crease + shading
    b.toneLine(-5, -4, 4, -6, 1);
    b.each((x, y) => {
      if (b.mat(x, y) !== SKIN) return;
      if (b.edge(x, y, 1, 0) || b.edge(x, y, 0, 1)) b.setTone(x, y, 1);
      if (b.edge(x, y, -1, 0) || b.edge(x, y, 0, -1)) b.setTone(x, y, 0);
    });
    b.setTone(-1, -25, -1);
    b.setTone(-5, -22, -1);
    b.setTone(3, -24, -1);
    // cuff + sleeve
    b.rect(-8, 2, 17, 4, CUFF);
    b.span(-8, 8, 5, CUFF, 1);
    b.rect(-10, 6, 21, 34, SLEEVE);
  } else {
    // pointing up: fist with index finger
    b.rect(-6, -26, 4, 18, SKIN);
    b.span(-5, -4, -27, SKIN);
    b.rect(-8, -10, 15, 12, SKIN);
    b.span(-7, 5, -11, SKIN);
    b.span(-7, 6, 2, SKIN);
    // curled fingers knuckle lines
    for (const x of [-2, 1, 4]) for (let y = -10; y < -5; y++) b.setTone(x, y, 1);
    // thumb across
    b.poly([[-8, -4], [3, -6], [4, -3], [-8, -1]], SKIN, 1);
    b.toneLine(-8, -4, 3, -6, 0);
    b.each((x, y) => {
      if (b.mat(x, y) !== SKIN) return;
      if (b.edge(x, y, 1, 0) || b.edge(x, y, 0, 1)) b.setTone(x, y, 1);
    });
    b.setTone(-5, -24, -1);
    b.setTone(-5, -23, -1);
    // bracelet + sleeve
    b.rect(-8, 2, 15, 2, CUFF);
    b.set(-6, 2, CUFF, -2);
    b.rect(-10, 4, 19, 36, SLEEVE);
  }
  b.each((x, y) => {
    if (b.edge(x, y, DESIGN[id].rimSide, 0)) b.setTone(x, y, RIM);
  });
  return b.render(mats);
}

// ---------------------------------------------------------------------------
// Desk edge
// ---------------------------------------------------------------------------

function buildDesk(ramp) {
  const [c, ctx] = canvas(W, H);
  const y = 182;
  rect(ctx, 0, y, W, 2, P.white);
  rect(ctx, 0, y + 2, W, 3, P.silver);
  rect(ctx, 0, y + 5, W, 1, P.fog);
  rect(ctx, 0, y + 6, W, H - y - 6, P.navy);
  rect(ctx, 0, y + 6, W, 1, P.ink);
  rect(ctx, 0, y + 14, W, 1, ramp[3]);
  rect(ctx, 0, y + 15, W, 1, ramp[2]);
  rect(ctx, 0, y + 28, W, 1, ramp[2]);
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

const live = { A: { g: 0, lastT: null, blinkOn: false, blinkSince: 0, blinkOff: -1 }, B: { g: 0, lastT: null, blinkOn: false, blinkSince: 0, blinkOff: -1 } };

const BUST_X = { center: 192, left: 118, right: 266 };
const CALM = { left: { x: 238, y: 26, w: 128, h: 72 }, right: { x: 18, y: 26, w: 128, h: 72 } };

export function drawCloseup(ctx, t, id, state, { side = 'center', accent = null } = {}) {
  id = id === 'B' ? 'B' : 'A';
  if (!BUST_X[side]) side = 'center';
  const D = DESIGN[id];
  const st = state || {};
  const ramp = accentRamp(accent);
  const rim = ramp[3];
  const sky = currentSky();
  const bg = cached(`bg|${id}|${side}|${ramp[2]}|${sky}`, () => buildBackdrop(id, side, ramp, sky));
  const L = cached(`p|${id}|${rim}`, () => buildPresenter(id, rim));
  const desk = cached(`desk|${ramp[2]}`, () => buildDesk(ramp));

  // ----- animation state -----
  const a = live[id];
  const dt = a.lastT === null ? 0 : Math.max(0, Math.min(0.1, t - a.lastT));
  a.lastT = t;
  const target = st.gesture ? 1 : 0;
  a.g += Math.sign(target - a.g) * Math.min(Math.abs(target - a.g), dt / 0.22);
  if (st.blink && !a.blinkOn) a.blinkSince = t;
  if (!st.blink && a.blinkOn) a.blinkOff = t;
  a.blinkOn = !!st.blink;
  let blinkPhase = 0;
  if (st.blink) blinkPhase = t - a.blinkSince < 0.04 ? 1 : 2;
  else if (t - a.blinkOff < 0.05) blinkPhase = 1;

  const emotion = st.emotion || 'neutral';
  const breath = Math.sin(t * 1.25 + (id === 'A' ? 0 : 2)) > 0.55 ? -1 : 0;
  const bob = st.bob ? 1 : 0;
  const thinkTilt = emotion === 'thinking' && Math.sin(t * 0.9) > -0.2 ? -D.rimSide : 0;
  const cx = BUST_X[side];
  const hx = cx + thinkTilt;
  const top = D.headTop + breath;
  const hy = top + bob;

  // ----- background -----
  ctx.drawImage(bg, 0, 0);
  drawLights(ctx, t, id, side, ramp, sky, CALM[side]);

  // ----- presenter -----
  const blit = (layer, x, y) => ctx.drawImage(layer.canvas, x + layer.x0, y + layer.y0);
  blit(L.back, hx, hy);
  blit(L.body, cx, top);
  // head with a 1px jaw drop on wide-open vowels
  const jaw = st.mouth >= 2 ? 1 : 0;
  const seam = D.mouthY + 1;
  const hl = L.head;
  const seamRow = seam - hl.y0;
  ctx.drawImage(hl.canvas, 0, 0, hl.canvas.width, seamRow, hx + hl.x0, hy + hl.y0, hl.canvas.width, seamRow);
  for (let j = 0; j <= jaw; j++) {
    ctx.drawImage(hl.canvas, 0, seamRow, hl.canvas.width, hl.canvas.height - seamRow, hx + hl.x0, hy + seam + j, hl.canvas.width, hl.canvas.height - seamRow);
  }

  // eyes
  const look = st.look > 0 ? 1 : st.look < 0 ? -1 : 0;
  let lx = look;
  let ly = 0;
  if (emotion === 'thinking') {
    lx = -D.rimSide;
    ly = -1;
  }
  const fst = { emotion, blinkPhase, t };
  const eY = hy + D.eyeY - 1;
  drawEye(ctx, hx - D.eyeX - EYE_W, eY, false, D, fst, lx, ly);
  drawEye(ctx, hx + D.eyeX, eY, true, D, fst, lx, ly);
  // brows
  let bl = BROWS[emotion] || BROWS.neutral;
  let br = bl;
  if (emotion === 'thinking') {
    bl = D.rimSide > 0 ? BROWS.thinkingHi : BROWS.thinkingLo;
    br = D.rimSide > 0 ? BROWS.thinkingLo : BROWS.thinkingHi;
  }
  const lift = st.speaking && st.mouth === 2 && hash(Math.floor(t * 3), 9) < 0.3 ? -1 : 0;
  drawBrow(ctx, hx - D.eyeX - 12, hy + D.browY + lift, false, bl, D);
  drawBrow(ctx, hx + D.eyeX, hy + D.browY + lift, true, br, D);
  // cheeks
  if (emotion === 'happy' || id === 'B') {
    const c = emotion === 'happy' ? P.pink : D.skin[1];
    for (const s of [-1, 1]) {
      const x = s < 0 ? hx - D.eyeX - 9 : hx + D.eyeX + 6;
      rect(ctx, x, hy + D.eyeY + 8, 3, 1, c);
    }
  }
  // mouth (moves with the jaw)
  drawMouth(ctx, hx, hy + D.mouthY - 1 + (st.mouth > 0 ? 0 : 0), D, { ...st, emotion, mouth: st.mouth | 0, t });
  if (id === 'A') drawMustache(ctx, hx, hy + D.mouthY - 5, D);

  blit(L.front, hx, hy);

  // earrings
  if (id === 'B') {
    const swing = Math.round(Math.sin(t * 3.1) * (st.speaking ? 1 : 0.4));
    for (const s of [-1, 1]) {
      const ex = s < 0 ? hx - D.face.cheekHW - 3 : hx + D.face.cheekHW + 1;
      const ey = hy + D.earY + 14;
      rect(ctx, ex, ey, 2, 1, P.yellow);
      rect(ctx, ex + swing, ey + 1, 1, 2, P.orange);
      disc(ctx, ex + swing, ey + 4, 1, P.yellow);
      rect(ctx, ex + swing - 1, ey + 3, 1, 1, P.white);
    }
    // necklace
    const ny = top + DESIGN.B.face.chinY + 18;
    for (let x = -10; x < 10; x++) {
      const d = (x + 0.5) / 10;
      rect(ctx, cx + x, ny + Math.round(d * d * -6) + 6, 1, 1, Math.abs(x) % 3 === 0 ? P.orange : P.yellow);
    }
    rect(ctx, cx - 1, ny + 7, 2, 2, P.yellow);
    rect(ctx, cx - 1, ny + 7, 1, 1, P.white);
  }

  // gesture hand
  if (a.g > 0) {
    const handKey = `hand|${id}|${rim}`;
    const hand = cached(handKey, () => buildHand(id, rim));
    const ease = 1 - (1 - a.g) ** 3;
    const hs = side === 'left' ? 1 : side === 'right' ? -1 : D.rimSide;
    const handX = cx + hs * 46;
    const handY = 150 + Math.round((1 - ease) * 50);
    ctx.drawImage(hand.canvas, handX + hand.x0, handY + hand.y0);
  }

  ctx.drawImage(desk, 0, 0);
}

function drawMustache(ctx, cx, y, D) {
  const rows = ['....hhhhhhhh....', '..hHHHHHHHHHHh..', '.hHHHHHHHHHHHHh.', 'hHHHH......HHHHh', 'hH............Hh'];
  const key = { h: P.maroon, H: P.black };
  rows.forEach((row, j) => {
    for (let k = 0; k < row.length; k++) {
      const c = key[row[k]];
      if (c) rect(ctx, cx - 8 + k, y + j, 1, 1, c);
    }
  });
  rect(ctx, cx - 4, y, 3, 1, P.brown);
  rect(ctx, cx + 2, y + 1, 2, 1, P.brown);
}
