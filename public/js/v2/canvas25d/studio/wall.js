// Video wall content for the 2.5D studio (owner: STUDIO SET stream).
//
// The wall is the only screen on set (docs/ART_DIRECTION.md): dimmed and
// cool, never brighter than the faces. What it shows is decided at runtime
// from the episode (the director's wall state), per programme
// (docs/programmes/*.md, digest in PLAN §9):
//   idle      WORLD NOW: the dotted globe turning once per 120 s with a 2x2 red London
//             marker; TECH BYTES: a static two-tone chip with cyan cells; COSMOS: a baked
//             starfield and a still ringed planet whose light swings ±35° on a 90 s sine;
//             MONEY MINUTE: the wordmark in fog over a 16 px darkGreen rule; NEWS IN 60: the
//             dial in one of two static states (intro / outro), never ticking.
//   picture   the story picture (scene.images `full`), resampled at the wall's pixel size,
//             mapped to the palette and dimmed to a mean L* ≤ 45 (≤ 40 in COSMOS);
//             TECH BYTES puts it on a 2 px black mat.
//   map       the mini locator from scenes/worldmap.js (drawn into an offscreen canvas and
//             copied only while it animates), or a static locator of our own.
//   figure    a figure in the part of the wall away from the head.
//   plate     the kicker / source plate for a story without a picture.
// Content changes only on a cut frame; any other change wipes over 0.3 s. In solo
// framings the wall's bottom 16 px (wide pixels) stay dark, and text keeps 6 px
// away from every head.
//
//   updateWall(req, style, w, h, k, t, cam, opts, lod) → { buf, version }   (set.js)
//   wallFromScene(scene, style)   legacy director state → wall request
//   drawWallContent(fr, x0, y0, x1, y1, k, t, soft)   the old call: the idle at a rectangle
import { C } from '../pixbuf.js';
import { P } from '../../../palette.js';
import { LAND } from '../../../scenes/worlddata.js';
import { F, SET, kAt, sxOf, syOf } from './geometry.js';
import { LSTAR, nearestName, nameOf, DARKER, lstarOf } from './color.js';
import { stampText, textWidth, capHeight } from './text.js';
import { resolveStyle } from './styles.js';

const B16 = Uint8Array.from([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]);
const WIDE_K = F / SET.wallZ; // px per unit of the wall in the wide shot (0.714)
const BAND_U = 16 / WIDE_K; // the solo dark band: 16 px in the wide
const MARGIN = 6; // px kept between wall text and a head
const WIPE = 0.3;
const MODES = new Set(['idle', 'picture', 'map', 'figure', 'plate']);
const DEG = Math.PI / 180;
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

// ---------------------------------------------------------------------------
// Reusable buffers

class Buf {
  constructor() {
    this.cap = 0;
    this.data = null;
    this.px = null;
    this.w = 0;
    this.h = 0;
  }
  size(w, h) {
    w = Math.max(1, w | 0);
    h = Math.max(1, h | 0);
    if (w * h > this.cap) {
      this.cap = Math.ceil(w * h * 1.25);
      this.data = new Uint32Array(this.cap);
      this.px = null;
    }
    if (!this.px || this.w !== w || this.h !== h) {
      this.w = w;
      this.h = h;
      this.px = this.data.subarray(0, w * h);
    }
    return this.px;
  }
}

function rect(b, x0, y0, x1, y1, c) {
  const w = b.w, h = b.h;
  x0 = Math.max(0, Math.round(x0));
  y0 = Math.max(0, Math.round(y0));
  x1 = Math.min(w, Math.round(x1));
  y1 = Math.min(h, Math.round(y1));
  if (x1 <= x0 || y1 <= y0) return;
  for (let y = y0; y < y1; y++) b.px.fill(c, y * w + x0, y * w + x1);
}
const plot = (b, x, y, c) => {
  if (x >= 0 && y >= 0 && x < b.w && y < b.h) b.px[y * b.w + x] = c;
};

// ---------------------------------------------------------------------------
// Layout: where the heads are on the wall, and the free boxes around them

const HEADS = [];
for (let i = 0; i < 3; i++) HEADS.push({ x0: 0, y0: 0, x1: 0, y1: 0, on: false });
const box4 = () => ({ x0: 0, y0: 0, x1: 0, y1: 0 });
const LAYOUT = { heads: 0, top: box4(), left: box4(), right: box4(), full: box4(), vis: box4(), band: 0, sx0: 0, sy0: 0, k: 1 };
// the screen area wall text and emblems may use: clear of the graphics top row (y 8-21) and above
// the caption band (y 136), so nothing on the wall sits under the graphics
const USABLE = { x0: 8, y0: 22, x1: 376, y1: 136 };
const clampN = (v, a, b) => (v < a ? a : v > b ? b : v);

/**
 * Free boxes on the wall (wall-local px) for this camera: the part of the wall that is on screen
 * and usable, minus the solo dark band, split around the heads (grown by MARGIN) that overlap it.
 */
function computeLayout(L, cam, solo, wx0, wy0, w, h, k) {
  L.band = solo ? Math.round(BAND_U * k) : 0;
  L.sx0 = wx0;
  L.sy0 = wy0;
  L.k = k;
  const vx0 = clampN(USABLE.x0 - wx0, 0, w), vx1 = clampN(USABLE.x1 - wx0, 0, w);
  const vy0 = clampN(USABLE.y0 - wy0, 0, h), vy1 = clampN(USABLE.y1 - wy0, 0, h);
  const yb = Math.max(vy0, Math.min(vy1, h - L.band));
  let n = 0;
  if (cam) {
    const kp = kAt(cam, SET.presenterZ);
    const s = Math.max(0.5, Math.round(22 * kp) / 22);
    const seats = solo ? [SET.seatX.solo ?? 0] : [SET.seatX.A, SET.seatX.B];
    for (const X of seats) {
      const nx = sxOf(cam, kp, X), ny = syOf(cam, kp, SET.neckY);
      const hb = HEADS[n];
      hb.x0 = Math.floor(nx - 11 * s) - wx0 - MARGIN;
      hb.x1 = Math.ceil(nx + 11 * s) - wx0 + MARGIN;
      hb.y0 = Math.floor(ny - 27 * s) - wy0 - MARGIN;
      hb.y1 = Math.ceil(ny + 2 * s) - wy0 + MARGIN;
      hb.on = hb.x1 > vx0 && hb.x0 < vx1 && hb.y1 > vy0 && hb.y0 < yb;
      if (hb.on) n++;
    }
  }
  L.heads = n;
  // the part of the wall on screen at all (pictures and maps fill it when no head is in front)
  set4(L.vis, clampN(-wx0, 0, w), clampN(-wy0, 0, h), clampN(384 - wx0, 0, w), clampN(216 - wy0, 0, h));
  set4(L.full, vx0, vy0, vx1, yb);
  let topY = yb, lx = vx1, rx = vx0;
  for (let i = 0; i < n; i++) {
    const hb = HEADS[i];
    topY = Math.min(topY, hb.y0);
    lx = Math.min(lx, hb.x0);
    rx = Math.max(rx, hb.x1);
  }
  set4(L.top, vx0, vy0, vx1, Math.max(vy0, Math.min(yb, topY)));
  set4(L.left, vx0, vy0, Math.max(vx0, Math.min(vx1, lx)), yb);
  set4(L.right, Math.min(vx1, Math.max(vx0, rx)), vy0, vx1, yb);
  return L;
}

/**
 * The layout of a wall state, frozen at the cut that put it up (stored in wall units), so a slow
 * camera move scales the content with the wall instead of sliding it around.
 */
function layoutOf(spec, env, w, h) {
  const L = LAYOUT;
  let F = spec._lay;
  if (!F) {
    computeLayout(L, env.cam, spec.solo, env.wx0, env.wy0, w, h, env.k);
    const u = 1 / env.k;
    const cp = (b) => ({ x0: b.x0 * u, y0: b.y0 * u, x1: b.x1 * u, y1: b.y1 * u });
    F = spec._lay = { heads: L.heads, band: L.band * u, top: cp(L.top), left: cp(L.left), right: cp(L.right), full: cp(L.full), vis: cp(L.vis), sx0: L.sx0, sy0: L.sy0 };
  }
  const k = env.k;
  const sc = (src, dst) => set4(dst, Math.round(src.x0 * k), Math.round(src.y0 * k), Math.round(src.x1 * k), Math.round(src.y1 * k));
  L.heads = F.heads;
  L.band = Math.round(F.band * k);
  sc(F.top, L.top);
  sc(F.left, L.left);
  sc(F.right, L.right);
  sc(F.full, L.full);
  sc(F.vis, L.vis);
  L.sx0 = env.wx0;
  L.sy0 = env.wy0;
  L.k = k;
  return L;
}
function set4(b, x0, y0, x1, y1) {
  b.x0 = x0;
  b.y0 = y0;
  b.x1 = x1;
  b.y1 = y1;
}
const bw = (b) => Math.max(0, b.x1 - b.x0), bh = (b) => Math.max(0, b.y1 - b.y0);

/**
 * The free box for a w x h block: the whole wall when no head overlaps it; otherwise the first
 * box that fits, in order (the side away from the head first, or the top band first), else the
 * one that comes closest.
 */
function pickBox(L, needW, needH, preferSide = true) {
  if (!L.heads) return L.full;
  const side = bw(L.left) >= bw(L.right) ? L.left : L.right;
  const other = side === L.left ? L.right : L.left;
  const cands = preferSide ? [side, L.top, other] : [L.top, side, other];
  for (const b of cands) if (bw(b) >= needW && bh(b) >= needH) return b;
  let best = cands[0], score = -1;
  for (const b of cands) {
    const sc = Math.min(bw(b) / Math.max(1, needW), bh(b) / Math.max(1, needH));
    if (sc > score) {
      score = sc;
      best = b;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Fields

/** The wall's idle field, filled only where the wall is on screen (CLIP, from the current camera). */
const CLIP = { x0: 0, y0: 0, x1: 0, y1: 0 };
// The last field drawn, kept so a wall re-rendered for its content alone (the globe turning, the
// planet's light, a map flying in) copies its field instead of dithering it again.
const FIELD = { cap: null, buf: null, w: 0, h: 0, style: '', soft: false, ax: -1, ay: -1, fy: NaN, hf: NaN, x0: 0, y0: 0, x1: 0, y1: 0 };
function fillField(b, style, soft) {
  const f = FIELD;
  if (f.buf && f.w === b.w && f.h === b.h && f.style === style.id && f.soft === soft && f.ax === ENV.ax && f.ay === ENV.ay && f.fy === ENV.fy && f.hf === ENV.hf && f.x0 === CLIP.x0 && f.y0 === CLIP.y0 && f.x1 === CLIP.x1 && f.y1 === CLIP.y1) {
    b.px.set(f.buf);
    return;
  }
  fieldPixels(b, style, soft);
  const n = b.w * b.h;
  if (!f.cap || f.cap.length < n) f.cap = new Uint32Array(Math.ceil(n * 1.25));
  f.buf = f.cap.subarray(0, n);
  f.buf.set(b.px);
  Object.assign(f, { w: b.w, h: b.h, style: style.id, soft, ax: ENV.ax, ay: ENV.ay, fy: ENV.fy, hf: ENV.hf, x0: CLIP.x0, y0: CLIP.y0, x1: CLIP.x1, y1: CLIP.y1 });
}
function fieldPixels(b, style, soft) {
  const [a, z] = style.wallField;
  const ca = C[a], cz = C[z];
  const { w, h, px } = b;
  const x0 = CLIP.x0, x1 = CLIP.x1, y0 = CLIP.y0, y1 = CLIP.y1;
  if (ca === cz) {
    // out of focus, a field brighter than slate drops a step; ink and darker stay (MONEY MINUTE
    // keeps the home value range in its MCU-R)
    const c = soft && LSTAR[a] > LSTAR.slate ? C[DARKER[a]] : ca;
    for (let y = y0; y < y1; y++) px.fill(c, y * w + x0, y * w + x1);
    return;
  }
  // the top colour, one Bayer band, the bottom colour (keeps the area behind heads dark): a
  // posterised falloff, flat fields with the dither only in the band between them, like the set's
  // light. The level uses the wall's unrounded span and the Bayer index the screen position, so a
  // dolly never re-dithers it.
  const ax = ENV.ax, ay = ENV.ay, fy = ENV.fy, hf = Math.max(1, ENV.hf);
  const [u0, u1] = style.wallBand || FIELD_BAND;
  const iu = 1 / (u1 - u0);
  for (let y = y0; y < y1; y++) {
    const q = Math.round(Math.max(0, Math.min(1, ((y + 0.5 + fy) / hf - u0) * iu)) * 16);
    const row = y * w, br = ((y + ay) & 3) << 2;
    if (q <= 0 || q >= 16) {
      px.fill(q <= 0 ? ca : cz, row + x0, row + x1);
      continue;
    }
    // the row's pattern repeats every 4 px
    for (let j = 0; j < 4; j++) FPAT[(x0 + j) & 3] = q > B16[br + ((x0 + j + ax) & 3)] ? cz : ca;
    for (let x = x0; x < x1; x++) px[row + x] = FPAT[x & 3];
  }
}
const FPAT = new Uint32Array(4);
const FIELD_BAND = [0.62, 0.82]; // where the wall field's top colour falls to its bottom colour (share of the height)

/** A Bayer falloff from `c` at the top edge into the field over `rows` px (MONEY MINUTE's top 12 px). */
function topFalloff(b, c, rows) {
  const { w, px } = b;
  const ax = ENV.ax, ay = ENV.ay;
  for (let y = 0; y < Math.min(rows, b.h); y++) {
    const q = Math.round((1 - y / rows) * 12);
    const row = y * w, br = ((y + ay) & 3) << 2;
    for (let x = 0; x < w; x++) if (q > B16[br + ((x + ax) & 3)]) px[row + x] = c;
  }
}

/** The solo dark band at the wall's bottom: the field's own darkest colour (never lighter than the field). */
function darkBand(b, band, style, soft) {
  if (band <= 0) return;
  const n = style.wallField[1];
  rect(b, 0, b.h - band, b.w, b.h, C[n] === C.navy ? C.ink : soft && LSTAR[n] > LSTAR.ink ? C[DARKER[n]] : C[n]);
}

// ---------------------------------------------------------------------------
// WORLD NOW idle: the dotted globe

let LANDMASK = null;
const LMW = 512, LMH = 256;
/** 512x256 land mask (1 = land) decoded from the Natural Earth RLE (LEB128 runs, ocean first). */
function landMask() {
  if (LANDMASK) return LANDMASK;
  const m = new Uint8Array(LMW * LMH);
  try {
    const bin = typeof atob === 'function' ? atob(LAND.rle) : Buffer.from(LAND.rle, 'base64').toString('binary');
    const W = LAND.w, H = LAND.h;
    const sx = W / LMW, sy = H / LMH;
    let p = 0;
    for (let j = 0; j < H && p < bin.length; j++) {
      const keep = j % sy === sy >> 1;
      const row = (j / sy) | 0;
      let x = 0, cur = 0;
      while (x < W && p < bin.length) {
        let run = 0, shift = 0, byte;
        do {
          byte = bin.charCodeAt(p++);
          run |= (byte & 127) << shift;
          shift += 7;
        } while (byte & 128 && p < bin.length);
        if (run > W - x) run = W - x;
        if (keep && cur) {
          for (let q = Math.ceil((x - (sx >> 1)) / sx); q * sx + (sx >> 1) < x + run; q++) if (q >= 0 && q < LMW) m[row * LMW + q] = 1;
        }
        x += run;
        cur ^= 1;
      }
    }
  } catch {
    /* no land data: an ocean world */
  }
  LANDMASK = m;
  return m;
}
const isLand = (lat, lon) => {
  const u = Math.floor(((lon / 360 + 0.5) % 1 + 1) % 1 * LMW);
  const v = Math.max(0, Math.min(LMH - 1, Math.floor((0.5 - lat / 180) * LMH)));
  return landMask()[v * LMW + u] === 1;
};

const GLOBE_TILT = 22 * DEG;
const GCT = Math.cos(GLOBE_TILT), GST = Math.sin(GLOBE_TILT);
const GLIGHT = (() => {
  const v = [-0.42, -0.4, 0.82]; // camera-left, from above, mostly frontal (screen y down)
  const n = Math.hypot(...v);
  return v.map((a) => a / n);
})();
const LONDON = [51.5, -0.13];
const GLOBE_TABLES = new Map();

/** Per radius: the shaded ocean disc (static: only the dots turn) and the land dots on a ~2 px grid. */
function globeTable(R) {
  let T = GLOBE_TABLES.get(R);
  if (T) return T;
  const S = 2 * R + 5, c = R + 2;
  const disc = new Uint32Array(S * S);
  const cls = new Uint8Array(S * S); // light class for dots: 0 lit .. 3 dark, 255 outside
  cls.fill(255);
  const RR = R + 0.5;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x - c, dy = y - c;
      const d2 = dx * dx + dy * dy;
      const d = Math.sqrt(d2);
      if (d > RR + 1) continue;
      const nx = dx / Math.max(d, RR), ny = dy / Math.max(d, RR);
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const l = nx * GLIGHT[0] + ny * GLIGHT[1] + nz * GLIGHT[2];
      if (d > RR) {
        // a 1 px outline outside the limb (ink on the lit side, black in shadow) separates the
        // navy sphere from the navy field without a glow
        disc[y * S + x] = l > 0.05 ? C.ink : C.black;
        continue;
      }
      const k = l > 0.62 ? 0 : l > 0.22 ? 1 : l > -0.12 ? 2 : 3;
      cls[y * S + x] = k;
      // ocean: flat navy / ink / black steps, Bayer 4x4 only in a narrow band at each turn
      const b16 = B16[((y & 3) << 2) | (x & 3)];
      let col = C.navy;
      if (l < 0.3) col = l < 0.22 || (0.3 - l) * 200 > b16 ? C.ink : C.navy;
      if (l < -0.04) col = l < -0.12 || (-0.04 - l) * 200 > b16 ? C.black : C.ink;
      // the limb: 1 px lit rim on the key side, dark elsewhere
      if (d > RR - 1.05) col = l > 0.05 ? C.steel : C.ink;
      disc[y * S + x] = col;
    }
  }
  // land dots on a lat/lon grid about 2 px apart at the centre
  const step = Math.max(1.6, (2 / R) / DEG);
  const pts = [];
  for (let lat = -84 + step / 2; lat < 84; lat += step) {
    const ls = step / Math.max(0.12, Math.cos(lat * DEG));
    for (let lon = -180; lon < 180; lon += ls) {
      if (!isLand(lat, lon)) continue;
      const cl = Math.cos(lat * DEG);
      pts.push(cl * Math.sin(lon * DEG), Math.sin(lat * DEG), cl * Math.cos(lon * DEG));
    }
  }
  T = { R, S, c, disc, cls, dots: Float32Array.from(pts) };
  if (GLOBE_TABLES.size > 24) GLOBE_TABLES.clear();
  GLOBE_TABLES.set(R, T);
  return T;
}

const DOT_COLOURS = [C.fog, C.steel, C.slate, 0];

/** Draw the globe centred at (cx, cy) with centre longitude `lam` (degrees); returns a hash of the dots drawn. */
function drawGlobe(b, cx, cy, R, lam, marker) {
  const T = globeTable(R);
  const { S, c, disc, cls, dots } = T;
  const ox = Math.round(cx) - c, oy = Math.round(cy) - c;
  for (let y = 0; y < S; y++) {
    const yy = oy + y;
    if (yy < 0 || yy >= b.h) continue;
    for (let x = 0; x < S; x++) {
      const col = disc[y * S + x];
      if (!col) continue;
      const xx = ox + x;
      if (xx >= 0 && xx < b.w) b.px[yy * b.w + xx] = col;
    }
  }
  const cl = Math.cos(-lam * DEG), sl = Math.sin(-lam * DEG);
  let hash = 0;
  const RR = R + 0.5;
  for (let i = 0; i < dots.length; i += 3) {
    const vx = dots[i], vy = dots[i + 1], vz0 = dots[i + 2];
    const x = vx * cl + vz0 * sl;
    const z = -vx * sl + vz0 * cl;
    const py = vy * GCT - z * GST;
    const pz = vy * GST + z * GCT;
    if (pz < 0.12) continue;
    const gx = c + Math.round(x * RR), gy = c - Math.round(py * RR);
    const k = cls[gy * S + gx];
    if (k === 255 || k === 3) continue;
    const col = DOT_COLOURS[k];
    plot(b, ox + gx, oy + gy, col);
    hash = (hash * 31 + gx * 97 + gy) | 0;
  }
  if (marker) {
    const la = LONDON[0] * DEG, lo = LONDON[1] * DEG;
    const vx = Math.cos(la) * Math.sin(lo), vy = Math.sin(la), vz0 = Math.cos(la) * Math.cos(lo);
    const x = vx * cl + vz0 * sl, z = -vx * sl + vz0 * cl;
    const py = vy * GCT - z * GST, pz = vy * GST + z * GCT;
    if (pz > 0.2) {
      const mx = ox + c + Math.round(x * RR), my = oy + c - Math.round(py * RR);
      const m = Math.max(2, Math.round(R / 12)) & ~1 || 2;
      rect(b, mx - m / 2, my - m / 2, mx + m / 2, my + m / 2, C.red);
      hash = (hash * 31 + mx * 7 + my) | 0;
    }
  }
  return hash;
}

const globeLam = (t, lod, frozen) => (lod >= 2 ? frozen : -10 + ((t % 120) / 120) * 360);

// ---------------------------------------------------------------------------
// TECH BYTES idle: the chip emblem (static, two tones on ink, cyan cells)

function drawChip(b, cx, cy, s) {
  // designed at 1x in wide pixels, drawn at the integer scale s
  const R = (x0, y0, x1, y1, c) => rect(b, cx + x0 * s, cy + y0 * s, cx + x1 * s, cy + y1 * s, c);
  // pins: 4 per side, 1 px wide, 3 px long, 4 px pitch; lit (steel) on the key sides, slate in shadow
  for (let i = 0; i < 4; i++) {
    const o = -6 + i * 4;
    R(o, -13, o + 1, -10, C.steel); // top
    R(-13, o, -10, o + 1, C.steel); // left
    R(o, 10, o + 1, 13, C.slate); // bottom
    R(10, o, 13, o + 1, C.slate); // right
  }
  // package: slate body, steel bevel on the top and left (key light), ink shadow edges
  R(-10, -10, 10, 10, C.slate);
  R(-10, -10, 10, -9, C.steel);
  R(-10, -10, -9, 10, C.steel);
  R(-10, 9, 10, 10, C.ink);
  R(9, -9, 10, 10, C.ink);
  // recessed die: ink well, its top/left inner edge in shadow, the far edge lit
  R(-6, -5, 6, 5, C.ink);
  R(-6, -5, 6, -4, C.black);
  R(-6, -5, -5, 5, C.black);
  R(-5, 4, 6, 5, C.slate);
  // cells: two rows of three, one dark (static: never animated)
  const cells = [[-4, -3], [-1, -3], [2, -3], [-4, 1], [2, 1]];
  for (const [x, y] of cells) R(x, y, x + 2, y + 2, C.cyan);
  R(-1, 1, 1, 3, C.slate);
  // pin 1 marker: one steel pixel in the body's corner
  R(-8, -8, -7, -7, C.steel);
}

// ---------------------------------------------------------------------------
// COSMOS idle: baked starfield + a still ringed planet whose light swings

const STARS = (() => {
  // fixed positions in wall units (146 x 88), seeded once: never twinkling
  let s = 0x9e3779b9;
  const rnd = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [];
  for (let i = 0; i < 46; i++) {
    const u = rnd(), v = rnd(), m = rnd();
    out.push({ u: 4 + u * 138, v: 3 + v * 60, c: m > 0.9 ? 'silver' : m > 0.6 ? 'fog' : 'steel' });
  }
  return out;
})();

const PLANET_TABLES = new Map();
function planetTable(R) {
  let T = PLANET_TABLES.get(R);
  if (T) return T;
  const RR = R + 0.5;
  const S = Math.ceil(RR) * 2 + 1, c = (S - 1) / 2;
  const n = [];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x - c, dy = y - c;
      if (dx * dx + dy * dy > RR * RR) continue;
      const nx = dx / RR, ny = dy / RR;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      // latitude for the bands, with the planet's axis tipped 18° toward camera-right
      const lat = Math.asin(Math.max(-1, Math.min(1, ny * Math.cos(0.31) - nx * Math.sin(0.31))));
      n.push(y * S + x, nx, ny, nz, lat);
    }
  }
  T = { R, S, c, n: Float32Array.from(n) };
  if (PLANET_TABLES.size > 24) PLANET_TABLES.clear();
  PLANET_TABLES.set(R, T);
  return T;
}

/** Light azimuth (radians from the lens toward camera-left) at time t: 55° ± 35° on a 90 s sine. */
export const planetAzimuth = (t) => (55 + 35 * Math.sin((2 * Math.PI * t) / 90)) * DEG;

function drawRing(b, cx, cy, R, front) {
  // a tilted annulus: steel with a fog band, a 1 px silver lit edge on the near (lower) rim
  const a0 = R * 1.42, a1 = R * 1.95, fl = 0.3, tilt = -0.31;
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  // bounding box of the rotated ellipse (semi-axes a1 and a1·fl)
  const ex = Math.ceil(Math.sqrt((a1 * ct) ** 2 + (a1 * fl * st) ** 2)) + 1;
  const ey = Math.ceil(Math.sqrt((a1 * st) ** 2 + (a1 * fl * ct) ** 2)) + 1;
  const a02 = a0 * a0, a12 = a1 * a1, R2 = (R + 0.5) * (R + 0.5), ifl = 1 / fl;
  const icx = Math.round(cx), icy = Math.round(cy);
  for (let y = -ey; y <= ey; y++) {
    for (let x = -ex; x <= ex; x++) {
      const rx = x * ct + y * st, ry = (-x * st + y * ct) * ifl;
      const d2 = rx * rx + ry * ry;
      if (d2 < a02 || d2 > a12) continue;
      if (ry > 0 !== front) continue;
      if (!front && x * x + y * y < R2) continue; // hidden behind the planet
      const u = (Math.sqrt(d2) - a0) / (a1 - a0);
      let col = u > 0.45 && u < 0.7 ? C.fog : C.steel;
      if (u > 0.9 && ry > 0) col = C.silver;
      if (u < 0.12) col = C.slate; // the gap's shadowed inner edge
      plot(b, icx + x, icy + y, col);
    }
  }
}

function drawPlanet(b, cx, cy, R, az) {
  const T = planetTable(R);
  const { S, c, n } = T;
  const el = 18 * DEG;
  const lx = -Math.sin(az) * Math.cos(el), ly = -Math.sin(el), lz = Math.cos(az) * Math.cos(el);
  const ox = Math.round(cx) - c, oy = Math.round(cy) - c;
  drawRing(b, cx, cy, R, false);
  let hash = 0;
  for (let i = 0; i < n.length; i += 5) {
    const idx = n[i], nx = n[i + 1], ny = n[i + 2], nz = n[i + 3], lat = n[i + 4];
    const d = nx * lx + ny * ly + nz * lz;
    let col;
    if (d > 0.07) {
      const band = Math.floor((lat / Math.PI + 0.5) * 9);
      col = band % 2 ? C.tanShade : C.tan;
      if (d < 0.2) col = band % 2 ? C.brown : C.tanShade; // the lit side's falloff, one step down
    } else if (d > -0.06) col = C.brown; // one intermediate tone at the terminator
    else if (d > -0.42) col = C.ink;
    else col = C.black;
    const x = idx % S, y = (idx / S) | 0;
    plot(b, ox + x, oy + y, col);
    if (col === C.brown || col === C.tanShade) hash = (hash * 31 + idx * 3 + (col === C.brown ? 1 : 2)) | 0;
  }
  drawRing(b, cx, cy, R, true);
  return hash;
}

// ---------------------------------------------------------------------------
// NEWS IN 60 idle: the dial, two static states

function drawDial(b, cx, cy, r, phase, ts) {
  const all = phase === 'outro';
  const ccx = Math.round(cx), ccy = Math.round(cy);
  if (r < 19) {
    // Below r 19 the 60 ticks would fall closer than 2 px and merge: draw what they merge into, a
    // clean 1 px ring (one octant mirrored eight ways, so it is exactly symmetric), with the four
    // quarter ticks 2 px inward; the 12 o'clock tick is yellow in both states, the ring lights in
    // the outro. A ring, never spokes: at this size spokes read as a sunburst.
    const ring = all ? C.yellow : C.slate;
    for (let a = 0; a <= 45; a += 0.5) {
      const dx = Math.round(r * Math.sin(a * DEG)), dy = Math.round(r * Math.cos(a * DEG));
      for (const [px, py] of [[dx, dy], [dy, dx]]) {
        plot(b, ccx + px, ccy - py, ring);
        plot(b, ccx - px, ccy - py, ring);
        plot(b, ccx + px, ccy + py, ring);
        plot(b, ccx - px, ccy + py, ring);
      }
    }
    for (let q = 0; q < 3; q++) {
      plot(b, ccx, ccy - r + q, C.yellow);
      plot(b, ccx, ccy + r - q, ring);
      plot(b, ccx - r + q, ccy, ring);
      plot(b, ccx + r - q, ccy, ring);
    }
  } else {
    // 60 ticks placed for one quadrant and mirrored, so the dial is exactly symmetric
    for (let i = 0; i <= 15; i++) {
      const a = i * 6 * DEG;
      const five = i % 5 === 0;
      const len = five ? Math.max(2, Math.round(r * 0.14)) : 1;
      for (let q = 0; q < len; q++) {
        const rr = r - q;
        const dx = Math.round(rr * Math.sin(a)), dy = Math.round(rr * Math.cos(a));
        for (const [sx, sy, idx] of [[1, -1, i], [-1, -1, 60 - i], [1, 1, 30 - i], [-1, 1, 30 + i]]) {
          const tick = ((idx % 60) + 60) % 60;
          const col = all || tick === 0 ? C.yellow : C.slate;
          plot(b, ccx + sx * dx, ccy + sy * dy, col);
        }
      }
    }
  }
  // "60" in the lower half of the dial (centred in a small one, clear of the ticks)
  const ns = r >= 30 ? Math.max(1, ts) : 1;
  const ny = r >= 14 ? ccy + Math.round(r * 0.28) : ccy - Math.floor(capHeight('body', ns) / 2);
  stampText(b.px, b.w, b.h, '60', ccx + 1, ny, C.yellow, 'body', ns, 'center');
}

// ---------------------------------------------------------------------------
// Pictures: indexed once per image, palette-mapped and dimmed per programme

// Palette colours a wall picture may use: nothing above fog (no white, cream or silver), no skin (faces stay the
// warmest thing in frame), no programme accents or brand red (they keep their meaning on set).
const PICTURE_NAMES = new Set(['black', 'ink', 'slate', 'steel', 'fog', 'darkRed', 'maroon', 'rust', 'orange', 'skinShade', 'tan', 'tanShade', 'brown', 'darkGreen', 'blue', 'navy', 'purple']);
const SRC = new WeakMap();

function pixelsOf(img) {
  if (!img) return null;
  if (img.full || img.small) img = img.full || img.small;
  if (img.px && img.w) return { w: img.w, h: img.h, u32: img.px };
  if (img.data && img.width) {
    const d = img.data;
    const u32 = d instanceof Uint32Array ? d : new Uint32Array(d.buffer, d.byteOffset, (d.byteLength / 4) | 0);
    return { w: img.width, h: img.height, u32 };
  }
  if (typeof img.getContext === 'function') {
    const ctx = img.getContext('2d', { willReadFrequently: true });
    const d = ctx.getImageData(0, 0, img.width, img.height).data;
    return { w: img.width, h: img.height, u32: new Uint32Array(d.buffer.slice(0)) };
  }
  return null;
}

/** Index an image once: { w, h, idx (Uint16), rgb [r,g,b,...], hist }. Colours are bucketed to 5 bits. */
function sourceOf(img) {
  const key = img && (img.full || img.small || img);
  if (!key || typeof key !== 'object') return null;
  let s = SRC.get(key);
  if (s) return s;
  const p = pixelsOf(img);
  if (!p) return null;
  const n = p.w * p.h;
  const idx = new Uint16Array(n);
  const map = new Map();
  const rgb = [];
  const hist = [];
  for (let i = 0; i < n; i++) {
    const c = p.u32[i];
    const k = ((c >>> 3) & 31) | (((c >>> 11) & 31) << 5) | (((c >>> 19) & 31) << 10);
    let j = map.get(k);
    if (j === undefined) {
      j = rgb.length / 3;
      map.set(k, j);
      rgb.push(c & 255, (c >>> 8) & 255, (c >>> 16) & 255);
      hist.push(0);
    }
    idx[i] = j;
    hist[j]++;
  }
  s = { w: p.w, h: p.h, idx, rgb, hist, maps: new Map() };
  SRC.set(key, s);
  return s;
}

const lin = (v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const unlin = (v) => Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));

/**
 * Colour table (source colour → palette u32), dimmed in linear light until the picture's mean L*
 * is at most maxL and at most 6 % of it is brighter than L* 60 (ART_DIRECTION: wall average ≤ 45,
 * highlights on at most 10 % of the wall).
 */
function pictureMap(src, maxL) {
  let m = src.maps.get(maxL);
  if (m) return m;
  const nc = src.hist.length;
  const tab = new Uint32Array(nc);
  const total = src.hist.reduce((a, b) => a + b, 0) || 1;
  const build = (f) => {
    let sum = 0, bright = 0;
    for (let j = 0; j < nc; j++) {
      const r = unlin(lin(src.rgb[j * 3]) * f), g = unlin(lin(src.rgb[j * 3 + 1]) * f), b2 = unlin(lin(src.rgb[j * 3 + 2]) * f);
      const name = nearestName(r, g, b2, PICTURE_NAMES);
      tab[j] = C[name];
      sum += LSTAR[name] * src.hist[j];
      if (LSTAR[name] > 60) bright += src.hist[j];
    }
    return sum / total <= maxL && bright / total <= 0.06;
  };
  if (!build(1)) {
    let lo = 0.04, hi = 1;
    for (let it = 0; it < 10; it++) {
      const mid = (lo + hi) / 2;
      if (build(mid)) lo = mid;
      else hi = mid;
    }
    build(lo);
  }
  m = tab;
  if (src.maps.size > 8) src.maps.clear();
  src.maps.set(maxL, m);
  return m;
}

function drawPicture(b, src, x0, y0, pw, ph, maxL) {
  if (!src || pw <= 0 || ph <= 0) return;
  const tab = pictureMap(src, maxL);
  // cover-fit crop of the source, nearest sampling at the wall's pixel size
  const sa = src.w / src.h, da = pw / ph;
  let cw = src.w, ch = src.h, cx = 0, cy = 0;
  if (sa > da) {
    cw = src.h * da;
    cx = (src.w - cw) / 2;
  } else {
    ch = src.w / da;
    cy = (src.h - ch) * 0.4;
  }
  const { idx } = src;
  for (let y = 0; y < ph; y++) {
    const yy = y0 + y;
    if (yy < 0 || yy >= b.h) continue;
    const sy = Math.min(src.h - 1, Math.floor(cy + ((y + 0.5) * ch) / ph)) * src.w;
    const row = yy * b.w;
    for (let x = 0; x < pw; x++) {
      const xx = x0 + x;
      if (xx < 0 || xx >= b.w) continue;
      const sx = Math.min(src.w - 1, Math.floor(cx + ((x + 0.5) * cw) / pw));
      b.px[row + xx] = tab[idx[sy + sx]];
    }
  }
}

// ---------------------------------------------------------------------------
// Map: the opens' mini locator when available, our static locator otherwise

let MAPFN = null;
let MAP_FAILED = false;
if (typeof document !== 'undefined') {
  import('../../../scenes/worldmap.js')
    .then((m) => {
      MAPFN = typeof m.drawWorldMap === 'function' ? m.drawWorldMap : null;
    })
    .catch(() => {
      MAP_FAILED = true;
    });
}
const MAP_ANIM = { default: 3.0, 'news-60': 2.5 };
const MAP_MAX_AREA = 104 * 64; // the locator's designed size (worldmap.js mini): its cost is per pixel
const MAPCV = { cv: null, ctx: null, w: 0, h: 0, u32: null };
// the locator's bright land is dimmed one step on the wall (mean L* ≤ 45): fog → steel, silver → fog,
// white → silver, cream → tan (drawMiniMap)

/** Draw the mini locator at w x h into `b` (exact palette, dimmed); false when unavailable. */
function drawMiniMap(b, spec, style, t, dt) {
  if (!MAPFN || MAP_FAILED) return false;
  const w = b.w, h = b.h;
  try {
    if (!MAPCV.cv) {
      MAPCV.cv = document.createElement('canvas');
      MAPCV.ctx = null;
    }
    if (MAPCV.w !== w || MAPCV.h !== h || !MAPCV.ctx) {
      MAPCV.cv.width = w;
      MAPCV.cv.height = h;
      MAPCV.ctx = MAPCV.cv.getContext('2d', { willReadFrequently: true });
      MAPCV.ctx.imageSmoothingEnabled = false;
      MAPCV.w = w;
      MAPCV.h = h;
    }
    const ctx = MAPCV.ctx;
    ctx.clearRect(0, 0, w, h);
    const loc = spec.location;
    MAPFN(ctx, t, dt, { lat: loc.lat, lon: loc.lon, place: loc.place || '', x: 0, y: 0, w, h, mini: true, label: !!loc.place, accent: P[style.accentName], programId: style.id });
    const d = ctx.getImageData(0, 0, w, h).data;
    const u32 = new Uint32Array(d.buffer, d.byteOffset, w * h);
    const fog = C.fog, silver = C.silver, white = C.white, cream = C.cream;
    const steel = C.steel, tan = C.tan, out = b.px;
    for (let i = 0; i < w * h; i++) {
      const c = (u32[i] | 0xff000000) >>> 0;
      out[i] = c === fog ? steel : c === silver ? fog : c === white ? silver : c === cream ? tan : c;
    }
    return true;
  } catch (err) {
    if (!MAP_FAILED) console.warn('[set] mini map unavailable, using the static locator:', err?.message || err);
    MAP_FAILED = true;
    return false;
  }
}

/** Our own static locator: an equirectangular crop around the place, a 2x2 pin and a place tab. */
function drawStaticLocator(b, spec, style, ts) {
  const { w, h, px } = b;
  const loc = spec.location;
  const lat0 = Math.max(-60, Math.min(70, loc.lat)), lon0 = loc.lon;
  const degPerPx = 80 / Math.max(1, w); // about 80° of longitude across the wall
  for (let y = 0; y < h; y++) {
    const lat = lat0 + (h / 2 - y - 0.5) * degPerPx;
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const lon = lon0 + (x + 0.5 - w / 2) * degPerPx / Math.max(0.35, Math.cos(lat0 * DEG));
      px[row + x] = isLand(lat, lon) ? C.slate : C.navy;
    }
  }
  // coast: a lit steel edge on land pixels that face the key (upper-left ocean neighbour)
  for (let y = 1; y < h; y++) {
    for (let x = 1; x < w; x++) {
      const i = y * w + x;
      if (px[i] === C.slate && (px[i - 1] === C.navy || px[i - w] === C.navy)) px[i] = C.steel;
    }
  }
  const cx = Math.round(w / 2), cy = Math.round(h / 2);
  const m = 2 * ts;
  rect(b, cx - m / 2 - 1, cy - m / 2 - 1, cx + m / 2 + 1, cy + m / 2 + 1, C.black);
  rect(b, cx - m / 2, cy - m / 2, cx + m / 2, cy + m / 2, C[style.accentName]);
  if (loc.place) placeTab(b, loc.place, style, ts);
}

function placeTab(b, text, style, ts) {
  const tw = Math.min(b.w - 4 * ts, textWidth(text, 'micro', ts));
  const th = capHeight('micro', ts) + 4 * ts;
  rect(b, 0, 0, tw + 6 * ts, th, C.black);
  rect(b, 0, 0, ts, th, C[style.accentName]);
  stampText(b.px, b.w, b.h, text, 3 * ts, 2 * ts, C.silver, 'micro', ts);
}

// ---------------------------------------------------------------------------
// Figures and plates

const NUM_RE = /^[\s]*([£$€¥]?[-+]?\d[\d,.]*\s?(?:%|bn|m|k|million|billion|trillion|tn|per cent|percent)?)\s*(.*)$/i;
function splitFigure(fig) {
  if (!fig) return null;
  if (typeof fig === 'object') {
    const value = String(fig.value ?? fig.text ?? '').trim();
    const label = String(fig.label ?? fig.rest ?? fig.unit ?? '').trim();
    return value ? { value, label } : null;
  }
  const s = String(fig).trim();
  if (!s) return null;
  const m = NUM_RE.exec(s);
  if (m) return { value: m[1].trim(), label: m[2].trim() };
  const words = s.split(/\s+/);
  return { value: words[0], label: words.slice(1).join(' ') };
}

/** Cut a line at word boundaries to fit maxW px. */
function fitLine(text, maxW, font, scale) {
  let s = String(text || '').trim();
  if (textWidth(s, font, scale) <= maxW) return s;
  const words = s.split(/\s+/);
  while (words.length > 1) {
    words.pop();
    s = words.join(' ');
    if (textWidth(s, font, scale) <= maxW) return s;
  }
  return '';
}

/** Does a w x h block fit in one of the layout's free boxes? */
function fitsSomewhere(L, w, h) {
  if (!L.heads) return bw(L.full) >= w && bh(L.full) >= h;
  for (const bx of [L.top, L.left, L.right]) if (bw(bx) >= w && bh(bx) >= h) return true;
  return false;
}

function drawFigureBlock(b, L, fig, style, ts, money) {
  // the figure is Display 2x (money-minute.md MCU-R panel), the label micro
  const vs = 2;
  const value = fitLine(fig.value, b.w - 4, 'body', vs) || fig.value;
  const vw = textWidth(value, 'body', vs), vh = capHeight('body', vs);
  const label = fig.label ? fitLine(fig.label, b.w - 4, 'micro', 1) : '';
  const lw = label ? textWidth(label, 'micro', 1) : 0, lh = label ? capHeight('micro', 1) + 3 : 0;
  const ruleH = 1, gap = 3;
  const needW = Math.max(vw, lw), needH = ruleH + gap + vh + lh;
  let box = pickBox(L, needW + 4, needH + 4);
  if (money) box = clampScreen(box, L, 24, 176, 120);
  const cx = Math.round((box.x0 + box.x1) / 2);
  const top = Math.round(box.y0 + Math.max(2, (bh(box) - needH) * 0.42));
  const accent = style.id === 'money-minute' ? C.darkGreen : C[style.accentName];
  rect(b, cx - Math.round(needW / 2), top, cx - Math.round(needW / 2) + Math.min(needW, 16), top + ruleH, accent);
  stampText(b.px, b.w, b.h, value, cx, top + ruleH + gap, C.white, 'body', vs, 'center');
  if (label) stampText(b.px, b.w, b.h, label, cx, top + ruleH + gap + vh + 3, C.fog, 'micro', 1, 'center');
}

/** MONEY MINUTE MCU-R: the figure panel stays inside screen x 24-176 and above y 120. */
const CLAMP = { x0: 0, y0: 0, x1: 0, y1: 0 };
function clampScreen(box, L, sx0, sx1, sy1) {
  set4(CLAMP, Math.max(box.x0, sx0 - L.sx0), box.y0, Math.min(box.x1, sx1 - L.sx0), Math.min(box.y1, sy1 - L.sy0));
  return bw(CLAMP) > 8 && bh(CLAMP) > 8 ? CLAMP : box;
}

function drawPlate(b, L, spec, style, ts0) {
  // the text scale drops to 1x when the free area is too small for 2x
  const ts = ts0 > 1 && !fitsSomewhere(L, textWidth(spec.label || '', 'body', ts0) + 4, 16 * ts0) ? 1 : ts0;
  const kicker = fitLine(spec.label || '', b.w - 6 * ts, 'body', ts);
  const sub = spec.sub ? fitLine(spec.sub, b.w - 6 * ts, 'micro', ts) : '';
  if (!kicker && !sub) return;
  const kw = kicker ? textWidth(kicker, 'body', ts) : 0, kh = kicker ? capHeight('body', ts) : 0;
  const sw = sub ? textWidth(sub, 'micro', ts) : 0, sh = sub ? capHeight('micro', ts) + 3 * ts : 0;
  const needW = Math.max(kw, sw), needH = ts + 3 * ts + kh + sh;
  const box = pickBox(L, needW + 4, needH + 4, true);
  const cx = Math.round((box.x0 + box.x1) / 2);
  const top = Math.round(box.y0 + Math.max(2, (bh(box) - needH) * 0.42));
  const accent = style.id === 'money-minute' ? C.darkGreen : C[style.accentName];
  const x0 = cx - Math.round(needW / 2);
  rect(b, x0, top, x0 + Math.min(needW, 12 * ts), top + ts, accent);
  if (kicker) stampText(b.px, b.w, b.h, kicker, x0, top + 4 * ts, C.silver, 'body', ts, 'left');
  if (sub) stampText(b.px, b.w, b.h, sub, x0, top + 4 * ts + kh + 3 * ts, C.fog, 'micro', ts, 'left');
}

// ---------------------------------------------------------------------------
// Pictures and maps: where they go on the wall

const MEDIA = { x: 0, y: 0, w: 0, h: 0, framed: false };
/**
 * The rectangle a picture or a map takes: the visible wall when no head is in front of it (the
 * wide, the two-shot, a single that sees the wall beside the head); otherwise a picture box in
 * the larger free area beside or above the head (news-60.md: the MCU-L picture box).
 */
function mediaRect(L, b, ts) {
  const m = MEDIA;
  if (L.heads) {
    let best = null, area = 0;
    for (const bx of [L.left, L.right, L.top]) {
      const a = bw(bx) * bh(bx);
      if (a > area) {
        area = a;
        best = bx;
      }
    }
    const pad = 4 * ts;
    const aw = bw(best) - 2 * pad, ah = bh(best) - 2 * pad;
    const w = Math.floor(Math.min(aw, ah * 1.6)), h = Math.floor(w / 1.6);
    if (w >= 36 && h >= 22) {
      m.x = Math.round(best.x0 + (bw(best) - w) / 2);
      m.y = best.y0 + pad;
      m.w = w;
      m.h = h;
      m.framed = true;
      return m;
    }
  }
  const v = L.vis;
  m.x = v.x0;
  m.y = v.y0;
  m.w = bw(v);
  m.h = Math.max(0, Math.min(v.y1, b.h - L.band) - v.y0);
  m.framed = false;
  return m;
}

/** The frame of a picture box: news-60 a 1 px steel line, TECH BYTES its black mat, others 1 px black. */
function frameBox(b, m, style, env) {
  const t = style.id === 'tech-bytes' ? Math.max(2, Math.round((style.pictureMat || 2.8) * env.k)) : 1;
  const c = style.id === 'news-60' ? C.steel : C.black;
  rect(b, m.x - t, m.y - t, m.x + m.w + t, m.y, c);
  rect(b, m.x - t, m.y + m.h, m.x + m.w + t, m.y + m.h + t, c);
  rect(b, m.x - t, m.y, m.x, m.y + m.h, c);
  rect(b, m.x + m.w, m.y, m.x + m.w + t, m.y + m.h, c);
}

const SUB = new Buf();
function blitSub(b, sub, x0, y0) {
  for (let y = 0; y < sub.h; y++) {
    const yy = y0 + y;
    if (yy < 0 || yy >= b.h) continue;
    for (let x = 0; x < sub.w; x++) {
      const xx = x0 + x;
      if (xx >= 0 && xx < b.w) b.px[yy * b.w + xx] = sub.px[y * sub.w + x];
    }
  }
}

/** Exact 2x copy of `sub` into a w x h box (cropped to it). */
function blit2x(b, sub, x0, y0, w, h) {
  for (let y = 0; y < h; y++) {
    const yy = y0 + y;
    if (yy < 0 || yy >= b.h) continue;
    const srow = (y >> 1) * sub.w, row = yy * b.w;
    for (let x = 0; x < w; x++) {
      const xx = x0 + x;
      if (xx >= 0 && xx < b.w) b.px[row + xx] = sub.px[srow + (x >> 1)];
    }
  }
}

function resampleSub(b, sub, x0, y0, w, h) {
  for (let y = 0; y < h; y++) {
    const yy = y0 + y;
    if (yy < 0 || yy >= b.h) continue;
    const sy = Math.min(sub.h - 1, Math.floor(((y + 0.5) * sub.h) / h)) * sub.w;
    for (let x = 0; x < w; x++) {
      const xx = x0 + x;
      if (xx >= 0 && xx < b.w) b.px[yy * b.w + xx] = sub.px[sy + Math.min(sub.w - 1, Math.floor(((x + 0.5) * sub.w) / w))];
    }
  }
}

// ---------------------------------------------------------------------------
// Rendering one wall state into a buffer

const ENV = { k: 1, cs: 1, ts: 1, soft: false, cam: null, wx0: 0, wy0: 0, ax: 0, ay: 0, fy: 0, hf: 63, t: 0, lod: 0, frozenLam: -10, frozenAz: 55 * DEG };

/** Integer scale for wall text and emblems: 1 in the wide and two-shot, 2-3 in singles. */
export const wallTextScale = (k) => (k < 1.25 ? 1 : 2);

/** Render `spec` into `b`; returns a signature of the time-driven pixels (globe dots, planet terminator, map frame). */
function renderSpec(b, spec, style, env) {
  const { cs, ts, soft } = env;
  const L = layoutOf(spec, env, b.w, b.h);
  // what of the wall is on screen with the CURRENT camera (a move may show more than at the cut)
  set4(CLIP, clampN(-env.wx0 - 2, 0, b.w), clampN(-env.wy0 - 2, 0, b.h), clampN(386 - env.wx0, 0, b.w), clampN(218 - env.wy0, 0, b.h));
  fillField(b, style, soft);
  let sig = 0;
  switch (spec.mode) {
    case 'picture': {
      const src = sourceOf(spec.image);
      const maxL = (style.wallMaxL || 45) - (soft ? 6 : 2);
      const m = mediaRect(L, b, ts);
      if (m.framed) {
        frameBox(b, m, style, env);
        drawPicture(b, src, m.x, m.y, m.w, m.h, maxL);
      } else {
        // the whole wall: TECH BYTES keeps its 2 px black mat inside the bezel
        const mat = style.pictureMat ? Math.max(2, Math.round(style.pictureMat * env.k)) : 0;
        rect(b, CLIP.x0, CLIP.y0, CLIP.x1, CLIP.y1, C.black);
        drawPicture(b, src, m.x + mat, m.y + mat, m.w - 2 * mat, m.h - 2 * mat, maxL);
        darkBand(b, L.band, style, true);
      }
      break;
    }
    case 'map': {
      const dt = Math.max(0, env.t - spec.since);
      const m = mediaRect(L, b, ts);
      if (!m.framed && m.y < L.full.y0 && L.full.y0 < m.y + m.h - 24) {
        // the locator's place tab rides on its top edge: keep that edge under the graphics top row
        m.h -= L.full.y0 - m.y;
        m.y = L.full.y0;
      }
      // the map renders at the size it had at the cut (worldmap.js keeps buffers per size), and a
      // slow camera move resamples it instead of asking for a new size every frame.
      // In singles (wall text at 2x) it renders at half size and is shown at exactly 2x, like the
      // rest of the wall's content there. Elsewhere a wall bigger than the locator's own size
      // (two-shot, over-the-shoulder) gets the locator as a framed inset of about that size, centred:
      // drawWorldMap's cost is per pixel (about 0.7 ms per frame at 104x63 while it flies in).
      if (!spec._mapWH) {
        const sc = env.ts > 1 && m.w >= 120 ? 2 : 1;
        const area = (m.w / sc) * (m.h / sc);
        spec._mapFit = sc === 1 && area > MAP_MAX_AREA ? Math.sqrt(MAP_MAX_AREA / area) : 1;
        spec._mapSc = sc;
        spec._mapWH = [Math.max(8, Math.ceil((m.w * spec._mapFit) / sc)), Math.max(8, Math.ceil((m.h * spec._mapFit) / sc))];
      }
      if (spec._mapFit < 1) {
        const nw = Math.round(m.w * spec._mapFit), nh = Math.round(m.h * spec._mapFit);
        m.x += (m.w - nw) >> 1;
        m.y += Math.min(m.h - nh, Math.max(3 * ts, (m.h - nh) >> 1));
        m.w = nw;
        m.h = nh;
        m.framed = true;
      }
      const end = MAP_ANIM[style.id] || MAP_ANIM.default;
      // once the locator has settled its last frame is kept: a camera move only resamples it
      if (!(spec._mapDone && SUB.w === spec._mapWH[0] && SUB.h === spec._mapWH[1] && SUB.owner === spec)) {
        SUB.size(spec._mapWH[0], spec._mapWH[1]);
        SUB.owner = spec;
        if (drawMiniMap(SUB, spec, style, env.t, Math.min(dt, end))) spec._mapDone = dt >= end;
        else {
          drawStaticLocator(SUB, spec, style, Math.max(1, ts / (spec._mapSc || 1)));
          spec._mapDone = true;
        }
      }
      if (m.framed) frameBox(b, m, style, env);
      if (SUB.w === m.w && SUB.h === m.h) blitSub(b, SUB, m.x, m.y);
      else if (Math.ceil(m.w / 2) === SUB.w && Math.ceil(m.h / 2) === SUB.h) blit2x(b, SUB, m.x, m.y, m.w, m.h);
      else resampleSub(b, SUB, m.x, m.y, m.w, m.h);
      if (!m.framed) darkBand(b, L.band, style, soft);
      sig = 1;
      break;
    }
    case 'figure': {
      const fig = splitFigure(spec.figure);
      if (fig) drawFigureBlock(b, L, fig, style, ts, style.id === 'money-minute');
      darkBand(b, L.band, style, soft);
      break;
    }
    case 'plate':
      drawPlate(b, L, spec, style, ts);
      darkBand(b, L.band, style, soft);
      break;
    default:
      sig = drawIdle(b, L, spec, style, env);
      darkBand(b, L.band, style, soft);
  }
  return sig;
}

function drawIdle(b, L, spec, style, env) {
  const { cs, ts, soft } = env;
  switch (style.wallIdle) {
    case 'chip': {
      // static two-tone chip in the upper half (or the free side in a single)
      const need = 27 * ts;
      const box = pickBox(L, need, need, false);
      const cx = Math.round((box.x0 + box.x1) / 2);
      // in the wall's upper half (tech-bytes.md §3.4), clear of the top edge
      const cy = Math.round(box.y0 + Math.max(15 * ts, Math.min(bh(box) * 0.36, bh(box) - 14 * ts)));
      drawChip(b, cx, cy, ts);
      return 0;
    }
    case 'planet': {
      const R = Math.max(5, Math.round(12 * cs));
      for (const s of STARS) {
        const x = Math.round(s.u * env.k), y = Math.round(s.v * env.k);
        if (soft && s.c === 'steel') continue;
        plot(b, x, y, soft ? C[DARKER[s.c]] : C[s.c]);
      }
      const box = pickBox(L, 4 * R, 2.4 * R, false);
      const cx = (box.x0 + box.x1) / 2 + R * 0.2;
      const cy = box.y0 + Math.max(R + 3, Math.min(bh(box) * 0.48, bh(box) - R - 3));
      const az = env.lod >= 2 ? env.frozenAz : planetAzimuth(env.t);
      return drawPlanet(b, cx, cy, R, az);
    }
    case 'wordmark': {
      topFalloff(b, C.slate, Math.round(12 * cs));
      const text = 'MONEY MINUTE';
      const ws = ts > 1 && !fitsSomewhere(L, textWidth(text, 'body', ts) + 4, 14 * ts) ? 1 : ts;
      const tw = textWidth(text, 'body', ws), th = capHeight('body', ws);
      const box = pickBox(L, tw + 4, th + 8 * ws, false);
      const cx = Math.round((box.x0 + box.x1) / 2);
      const top = Math.round(box.y0 + Math.max(3 * ws, (bh(box) - th - 6 * ws) * 0.4));
      stampText(b.px, b.w, b.h, text, cx, top, C.fog, 'body', ws, 'center');
      rect(b, cx - 8 * ws, top + th + 4 * ws, cx + 8 * ws, top + th + 5 * ws, C.darkGreen);
      return 0;
    }
    case 'dial': {
      const box = pickBox(L, 24 * ts, 24 * ts, false);
      const r = Math.max(8, Math.floor((Math.min(bw(box), bh(box)) - 6) / 2));
      const rr = Math.min(r, Math.round(22 * cs));
      const cx = Math.round((box.x0 + box.x1) / 2), cy = Math.round(box.y0 + (bh(box) - 2 * rr) / 2 + rr);
      drawDial(b, cx, cy, rr, spec.phase, ts);
      return 0;
    }
    default: {
      // WORLD NOW / generic: the dotted globe turning once per 120 s, London marked
      const R = Math.max(6, Math.round(23 * cs));
      const box = pickBox(L, 2 * R + 4, 2 * R + 4, false);
      const Rf = Math.max(6, Math.min(R, Math.floor(Math.min(bw(box), bh(box)) / 2) - 2));
      const cx = (box.x0 + box.x1) / 2;
      const cy = box.y0 + bh(box) / 2;
      const lam = globeLam(env.t, env.lod, env.frozenLam);
      return drawGlobe(b, cx, cy, Rf, lam, true);
    }
  }
}

/** Clock of the time-driven content: re-render only when it changes. */
function clockOf(spec, style, env) {
  if (spec.mode === 'map') {
    if (!MAPFN || MAP_FAILED) return 0; // our static locator does not animate
    const dt = env.t - spec.since;
    const end = MAP_ANIM[style.id] || MAP_ANIM.default;
    if (!(dt < end)) return -1; // settled: one last frame, then still
    const rate = env.lod >= 1 ? 30 : 60;
    return Math.max(0, Math.floor(dt * rate));
  }
  if (spec.mode !== 'idle') return 0;
  if (style.wallIdle === 'planet') {
    if (env.lod >= 2) return 0;
    // re-shaded every frame (a few hundred pixels): each row's terminator steps on its own frame,
    // and the background cache only invalidates when a pixel actually changed (the signature)
    return Math.round(env.t * (env.lod >= 1 ? 30 : 60));
  }
  if (style.wallIdle === 'globe' || !['chip', 'wordmark', 'dial'].includes(style.wallIdle)) {
    if (env.lod >= 2) return 0;
    const R = Math.max(6, Math.round(23 * env.cs));
    // a dot moves ~1.2 px/s at the centre: step every quarter pixel of rotation (half rate at lod 1)
    return Math.floor(((env.t % 120) / 120) * 2 * Math.PI * R * (env.lod >= 1 ? 2 : 4));
  }
  return 0;
}

// ---------------------------------------------------------------------------
// The wall state machine: shown / next (wipe), cut detection, buffers, version

const S = {
  shown: null,
  next: null,
  wipeT0: 0,
  A: new Buf(),
  B: new Buf(),
  O: new Buf(),
  aKey: { spec: null, w: 0, h: 0, clock: NaN, sig: NaN, style: null, ts: 0, cam: NaN, c0: 0, c1: 0, c2: 0, c3: 0 },
  bKey: { spec: null, w: 0, h: 0, clock: NaN, sig: NaN, style: null, ts: 0, cam: NaN, c0: 0, c1: 0, c2: 0, c3: 0 },
  version: 1,
  outVersion: 0,
  last: { x: NaN, z: NaN, zoom: NaN, hy: NaN, shotSince: undefined, style: null, t: NaN },
  result: { buf: null, version: 0, w: 0, h: 0 },
};

const IN = { mode: 'idle', image: null, location: null, figure: null, label: '', sub: '', phase: 'intro', focus: '', solo: false, since: 0 };

function readSpec(req, style, t) {
  const r = req || {};
  let mode = MODES.has(r.mode) ? r.mode : 'idle';
  const loc = r.location;
  const hasLoc = loc && Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lon));
  if (mode === 'picture' && !sourceOf(r.image)) mode = r.label || r.sub ? 'plate' : 'idle';
  if (mode === 'map' && !hasLoc) mode = loc?.place ? 'plate' : 'idle';
  if (mode === 'figure' && !splitFigure(r.figure)) mode = r.label ? 'plate' : 'idle';
  IN.mode = mode;
  IN.image = mode === 'picture' ? r.image : null;
  IN.location = mode === 'map' ? loc : null;
  IN.figure = mode === 'figure' ? r.figure : null;
  IN.label = mode === 'plate' ? String(r.label || (loc && !hasLoc ? loc.place : '') || '') : '';
  IN.sub = mode === 'plate' ? String(r.sub || '') : '';
  IN.phase = r.phase === 'outro' ? 'outro' : 'intro';
  IN.focus = r.focus || '';
  IN.solo = r.solo ?? style.solo;
  IN.since = Number.isFinite(r.since) ? r.since : NaN;
  return IN;
}

function sameSpec(a, b) {
  if (!a || !b) return false;
  return (
    a.mode === b.mode &&
    a.image === b.image &&
    sameLoc(a.location, b.location) &&
    sameFig(a.figure, b.figure) &&
    a.label === b.label &&
    a.sub === b.sub &&
    (a.mode !== 'idle' || a.phase === b.phase) &&
    a.solo === b.solo &&
    (a.mode !== 'map' || Number.isNaN(b.since) || a.since === b.since)
  );
}
const sameLoc = (a, b) => a === b || (!!a && !!b && a.lat === b.lat && a.lon === b.lon && a.place === b.place);
const sameFig = (a, b) => a === b || (!!a && !!b && typeof a === 'object' && typeof b === 'object' && a.value === b.value && a.label === b.label);

function copySpec(src, t) {
  return {
    mode: src.mode,
    image: src.image,
    location: src.location ? { lat: Number(src.location.lat), lon: Number(src.location.lon), place: src.location.place || '' } : null,
    figure: src.figure && typeof src.figure === 'object' ? { value: src.figure.value, label: src.figure.label } : src.figure,
    label: src.label,
    sub: src.sub,
    phase: src.phase,
    focus: src.focus,
    solo: src.solo,
    since: Number.isNaN(src.since) ? t : src.since,
  };
}

function isCut(cam, opts, style, t) {
  const L = S.last;
  let cut = false;
  if (opts && opts.cut === true) cut = true;
  else if (opts && opts.shotSince !== undefined) cut = opts.shotSince !== L.shotSince;
  else if (cam) {
    // no hint: a camera jump is a cut (moves are slow: ≤ ~0.1 % of scale per frame)
    cut =
      !Number.isFinite(L.zoom) ||
      Math.abs(cam.zoom - L.zoom) > 0.02 * L.zoom ||
      Math.abs(cam.x - L.x) > 3 ||
      Math.abs(cam.z - L.z) > 12 ||
      Math.abs(cam.hy - L.hy) > 3;
  }
  if (style !== L.style) cut = true; // a programme change always comes under the open / a stinger
  if (!(t >= L.t - 1) || t - L.t > 0.5) cut = true; // first frame, a seek or a long gap
  if (cam) {
    L.x = cam.x;
    L.z = cam.z;
    L.zoom = cam.zoom;
    L.hy = cam.hy;
  }
  L.shotSince = opts ? opts.shotSince : undefined;
  L.style = style;
  L.t = t;
  return cut;
}

/**
 * Bring buffer `buf` (with its key) up to date for `spec` at the current size / clock; true if
 * pixels changed. The buffer is in wall-local pixels, so a camera that only trucks or pedestals
 * reuses it; it is redrawn when the wall's pixel size, the content clock or the state changes, or
 * when the camera reveals a part of the wall that was off screen when it was drawn.
 */
function ensure(buf, key, spec, style, env, w, h) {
  const clock = clockOf(spec, style, env);
  // the on-screen part of the wall now (what renderSpec's CLIP will be)
  const cx0 = clampN(-env.wx0 - 2, 0, w), cy0 = clampN(-env.wy0 - 2, 0, h), cx1 = clampN(386 - env.wx0, 0, w), cy1 = clampN(218 - env.wy0, 0, h);
  const inside = cx0 >= key.c0 && cy0 >= key.c1 && cx1 <= key.c2 && cy1 <= key.c3;
  const phase = env.ax | (env.ay << 2);
  if (key.spec === spec && key.w === w && key.h === h && key.style === style && key.clock === clock && key.ts === env.ts && key.soft === env.soft && key.cam === 0 && key.phase === phase && inside) return false;
  const sizeChanged = key.w !== w || key.h !== h || key.spec !== spec || key.style !== style || key.ts !== env.ts || key.soft !== env.soft || key.cam !== 0 || key.phase !== phase || !inside;
  buf.size(w, h);
  const sig = renderSpec(buf, spec, style, env);
  const changed = sizeChanged || sig !== key.sig || spec.mode === 'map';
  key.spec = spec;
  key.w = w;
  key.h = h;
  key.style = style;
  key.clock = clock;
  key.sig = sig;
  key.ts = env.ts;
  key.soft = env.soft;
  key.cam = 0;
  key.phase = phase;
  key.c0 = CLIP.x0;
  key.c1 = CLIP.y0;
  key.c2 = CLIP.x1;
  key.c3 = CLIP.y1;
  return changed;
}

/**
 * Update the wall for this frame. Returns { buf (w*h Uint32 palette pixels), version } where
 * version changes exactly when the pixels change (set.js keys its background cache on it).
 */
export function updateWall(req, styleIn, w, h, k, t, cam, opts, lod = 0) {
  const style = resolveStyle(styleIn);
  const env = ENV;
  env.k = k;
  env.cs = k / WIDE_K;
  env.ts = wallTextScale(k);
  env.soft = !!cam && cam.soft > 0.5;
  env.cam = cam;
  env.t = t;
  env.lod = lod;
  if (cam) {
    const r = wallOrigin(cam);
    env.wx0 = r.x;
    env.wy0 = r.y;
    // screen phase of the buffer's origin (Bayer anchored to the screen) and the unrounded wall span
    env.ax = r.x & 3;
    env.ay = r.y & 3;
    env.fy = r.y - r.yf;
    env.hf = (SET.screen.y1 - SET.screen.y0) * k;
  }
  if (lod < 2) {
    env.frozenLam = globeLam(t, 0, 0);
    env.frozenAz = planetAzimuth(t);
  }
  const spec = readSpec(req, style, t);
  const cut = isCut(cam, opts, style, t);
  if (cut) {
    // a new shot re-lays the wall out for its framing
    if (S.shown) S.shown._lay = S.shown._mapWH = S.shown._mapDone = null;
    if (S.next) S.next._lay = S.next._mapWH = S.next._mapDone = null;
    S.aKey.cam = S.bKey.cam = NaN;
  }
  let changed = false;
  if (!S.shown) {
    S.shown = copySpec(spec, t);
    changed = true;
  } else if (cut) {
    // on a cut the wall simply shows what was asked
    if (S.next && sameSpec(S.next, spec)) {
      S.shown = S.next;
      swapBuffers();
    } else if (!sameSpec(S.shown, spec)) S.shown = copySpec(spec, t);
    if (S.next) changed = true;
    S.next = null;
    if (S.aKey.spec !== S.shown) changed = true;
  } else if (!sameSpec(S.next || S.shown, spec)) {
    // a change without a cut: a clean 0.3 s wipe from left to right
    if (S.next) {
      S.shown = S.next;
      swapBuffers();
    }
    S.next = copySpec(spec, t);
    S.wipeT0 = t;
    changed = true;
  }
  if (ensure(S.A, S.aKey, S.shown, style, env, w, h)) changed = true;
  let out = S.A;
  if (S.next) {
    const u = (t - S.wipeT0) / WIPE;
    if (u >= 1) {
      S.shown = S.next;
      S.next = null;
      swapBuffers();
      ensure(S.A, S.aKey, S.shown, style, env, w, h);
      out = S.A;
      changed = true;
    } else {
      ensure(S.B, S.bKey, S.next, style, env, w, h);
      const edge = Math.round(smooth(Math.max(0, u)) * w);
      S.O.size(w, h);
      const a = S.A.px, b = S.B.px, o = S.O.px;
      for (let y = 0; y < h; y++) {
        const row = y * w;
        for (let x = 0; x < edge; x++) o[row + x] = b[row + x];
        for (let x = edge; x < w; x++) o[row + x] = a[row + x];
      }
      out = S.O;
      changed = true;
    }
  }
  if (changed) S.version++;
  const res = S.result;
  res.buf = out.px;
  res.version = S.version;
  res.w = w;
  res.h = h;
  return res;
}

function swapBuffers() {
  const b = S.A;
  S.A = S.B;
  S.B = b;
  const k = S.aKey;
  S.aKey = S.bKey;
  S.bKey = k;
}

const ORIGIN = { x: 0, y: 0, yf: 0 };
function wallOrigin(cam) {
  const k = kAt(cam, SET.wallZ);
  ORIGIN.x = Math.round(sxOf(cam, k, SET.screen.x0));
  ORIGIN.yf = syOf(cam, k, SET.screen.y0);
  ORIGIN.y = Math.round(ORIGIN.yf);
  return ORIGIN;
}

/** The wall state machine's current version (changes whenever the wall's pixels change). */
export const wallVersionOf = () => S.version;
/** What the wall shows now: { mode, wiping } (labs, tests). */
export const wallShown = () => ({ mode: S.shown?.mode || 'idle', wiping: !!S.next, spec: S.shown });
/** Forget the wall state (tests, a new session). */
export function resetWall() {
  S.shown = null;
  S.next = null;
  S.aKey.spec = S.bKey.spec = null;
  S.last.t = NaN;
  S.last.style = null;
  S.version++;
}

// ---------------------------------------------------------------------------
// Warm-up: the costly tables, built before the first frame that needs them (set.js warmSets)

/** Decode the land mask and build the globe / planet tables of the wide and two-shot sizes, and the idle text. */
export function warmWall() {
  landMask();
  for (const R of [23, 24, 30]) globeTable(R);
  for (const R of [12, 13, 16]) planetTable(R);
  for (const s of [1, 2]) {
    textWidth('MONEY MINUTE', 'body', s);
    stampText(WARM_PX, 1, 1, 'MONEY MINUTE', 0, 0, 0, 'body', s);
    stampText(WARM_PX, 1, 1, '60', 0, 0, 0, 'body', s);
  }
}
const WARM_PX = new Uint32Array(1);

// ---------------------------------------------------------------------------
// Legacy entry points

/** The old call: draw the current style's idle into the frame rectangle [x0, x1) x [y0, y1). */
export function drawWallContent(fr, x0, y0, x1, y1, k, t, soft) {
  const w = x1 - x0, h = y1 - y0;
  if (w <= 0 || h <= 0) return;
  const style = resolveStyle(null);
  const b = LEGACY;
  b.size(w, h);
  Object.assign(ENV, { k, cs: k / WIDE_K, ts: wallTextScale(k), soft: !!soft, cam: null, t, lod: 0, wx0: x0, wy0: y0, ax: x0 & 3, ay: y0 & 3, fy: 0, hf: h });
  renderSpec(b, LEGACY_SPEC, style, ENV);
  for (let y = Math.max(0, y0); y < Math.min(fr.h, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(fr.w, x1); x++) fr.px[y * fr.w + x] = b.px[(y - y0) * w + (x - x0)];
  }
}
const LEGACY = new Buf();
const LEGACY_SPEC = { mode: 'idle', phase: 'intro', solo: false };

const FROM = { wall: null, img: null, seg: null, kicker: null, framing: null, styleId: null, phase: '', focus: '', solo: undefined, out: null };

/** What a story's wall shows, in order of preference, per programme (docs/programmes/*.md "Set and light"). */
const STORY_WALL = {
  'world-now': ['picture', 'map', 'figure', 'plate'], // "the picture or a locator map"
  'tech-bytes': ['picture', 'plate'], // the picture on its mat; figures live on the ledger card
  cosmos: ['picture', 'plate'], // "without a picture, the kicker plate"; no diagrams
  'money-minute': ['picture', 'plate'], // the WIDE; the MCU-R carries the figure panel (below)
  'news-60': ['picture', 'plate'],
  default: ['picture', 'map', 'figure', 'plate'],
};
const KICKER_CATS = { general: '', world: 'WORLD', tech: 'TECHNOLOGY', science: 'SCIENCE', business: 'BUSINESS', culture: 'CULTURE', sport: 'SPORT', health: 'HEALTH' };

/**
 * Map the director's scene to a wall request, from live episode data (memoised on its inputs, so
 * a static scene returns the same object every frame):
 *   - intro, chats, outro (legacy wall 'logo' / 'rundown'): the programme's idle (NEWS IN 60: the
 *     dial's outro state in the outro);
 *   - a story: the picture (scene.images.get(storyId)) when it has one, else per programme the
 *     locator map (seg.location), the figure (seg.numbers[0] / seg.fact) or the kicker plate
 *     (seg.kicker, category or source, with the source on the micro line);
 *   - MONEY MINUTE's MCU-R (scene.framing 'mcu-r'): the figure panel, unless the story's plan
 *     already shows the figure on a card (then the kicker), money-minute.md §3.5;
 *   - a new-style scene.wall ({ mode: 'idle'|'picture'|'map'|'figure'|'plate', ... }) passes through.
 * The current segment is read from scene.segPlan.ctx.seg (INTEGRATION) when it is the story on air.
 */
export function wallFromScene(scene, styleIn) {
  const style = resolveStyle(styleIn ?? scene?.program?.id);
  const w = scene?.wall || null;
  const sid = scene?.storyId ?? w?.storyId ?? null;
  const ctxSeg = scene?.segPlan?.ctx?.seg || null;
  const seg = ctxSeg && (ctxSeg.type !== 'story' || sid == null || ctxSeg.storyId === sid) ? ctxSeg : null;
  const img = sid != null ? scene.images?.get?.(sid) || null : null;
  const kicker = scene?.lowerThird?.kicker || seg?.kicker || null;
  const type = seg?.type || (w?.mode === 'logo' || w?.mode === 'rundown' ? 'idle' : 'story');
  const phase = type === 'outro' || w?.phase === 'outro' ? 'outro' : 'intro';
  const focus = scene?.focus || '';
  const solo = scene?.cast ? !scene.cast.B : undefined;
  const framing = scene?.framing || null;
  const F2 = FROM;
  if (F2.out && F2.wall === w && F2.img === img && F2.seg === seg && F2.kicker === kicker && F2.framing === framing && F2.styleId === style.id && F2.phase === phase && F2.focus === focus && F2.solo === solo) return F2.out;
  let out;
  const mode = w?.mode;
  if (mode === 'idle' || mode === 'picture' || mode === 'map' || mode === 'figure' || mode === 'plate') {
    out = { ...w };
    if (mode === 'picture' && !out.image) out.image = img;
  } else if (mode === 'logo' || mode === 'rundown' || type === 'intro' || type === 'outro' || type === 'chat' || type === 'idle' || (!mode && !seg)) {
    out = { mode: 'idle' };
  } else {
    const loc = seg?.location;
    const fig = seg?.numbers?.[0] || seg?.fact || null;
    const label = kicker || (w?.category && KICKER_CATS[w.category] !== undefined ? KICKER_CATS[w.category] : w?.category || seg?.category || '') || '';
    const source = w?.source || seg?.source || '';
    const plate = { mode: 'plate', label: label || source, sub: label ? source : '' };
    if (style.id === 'money-minute' && framing === 'mcu-r') {
      const carded = (scene?.segPlan?.ctx?.shots || []).some((s) => s.shot === 'fact');
      out = fig && !carded ? { mode: 'figure', figure: fig } : plate;
    } else {
      out = null;
      for (const m of STORY_WALL[style.id] || STORY_WALL.default) {
        if (m === 'picture' && img && (mode === 'image' || mode === 'picture' || !mode)) out = { mode: 'picture', image: img };
        else if (m === 'map' && loc && Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lon))) out = { mode: 'map', location: loc };
        else if (m === 'figure' && fig) out = { mode: 'figure', figure: fig };
        else if (m === 'plate' && (plate.label || plate.sub)) out = plate;
        if (out) break;
      }
      if (!out) out = { mode: 'idle' };
    }
  }
  out.phase = phase;
  out.focus = focus;
  out.solo = solo;
  if (w && Number.isFinite(w.since)) out.since = w.since;
  Object.assign(F2, { wall: w, img, seg, kicker, framing, styleId: style.id, phase, focus, solo, out });
  return out;
}
