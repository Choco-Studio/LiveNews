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
//   picture   the story picture (scene.images `full`), area-averaged down to the wall's pixel
//             size, cool-graded, toned (L* gain with a soft shoulder) to a mean L* ≤ 45 (≤ 40 in
//             COSMOS) with at most 10 % of highlights, mapped to the wall palette; beside a head a
//             4:3-16:9 box in the free area (never behind the head); TECH BYTES puts it on a 2 px
//             black mat.
//   map       the mini locator from scenes/worldmap.js (drawn into an offscreen canvas and
//             copied only while it animates), or a static locator of our own.
//   figure    a figure in the part of the wall away from the head.
//   plate     the kicker / source plate for a story without a picture.
// Content changes only on a cut frame; any other change wipes over 0.3 s. In solo
// framings the wall's bottom 16 px (wide pixels) stay dark, and text keeps 6 px
// away from every head.
//
//   updateWall(req, style, w, h, k, t, cam, opts, lod) → { buf, version }   (set.js)
//   wallFromScene(scene, style)   director state → wall request (every field, every time)
//   warmWallContent(req, style, cam)   prepare a picture / text masks before the cut
//   plateRectFor(cam, label, sub, style), mediaRectFor(cam, style)   layouts (tests, labs)
//   drawWallContent(fr, x0, y0, x1, y1, k, t, soft)   the old call: the idle at a rectangle
import { C } from '../pixbuf.js';
import { P } from '../../../palette.js';
import { LAND } from '../../../scenes/worlddata.js';
import { F, SET, kAt, sxOf, syOf } from './geometry.js';
import { LSTAR, DARKER, labRGB } from './color.js';
import { stampText, textWidth, capHeight, textMask } from './text.js';
import { resolveStyle } from './styles.js';

const B16 = Uint8Array.from([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]);
const WIDE_K = F / SET.wallZ; // px per unit of the wall in the wide shot (0.714)
// the solo dark band (ART_DIRECTION: the solo wall's bottom 16 px stay dark, no text or logo): 16 px
// in the wide, 32 px where the wall's content is drawn at 2x (singles)
const BAND_PX = 16;
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
const LAYOUT = { heads: 0, top: box4(), left: box4(), right: box4(), full: box4(), vis: box4(), band: 0, sx0: 0, sy0: 0, k: 1, headTop: Infinity, headCx: 0, wideSolo: false };
// the screen area wall text and emblems may use: clear of the graphics top row (y 8-21) and above
// the caption band (y 136), so nothing on the wall sits under the graphics
const USABLE = { x0: 8, y0: 22, x1: 376, y1: 136 };
const HEAD_HW = 12.5, HEAD_TOP = 28.5; // a head's half width and top above the neck base, in rig units (s)
const clampN = (v, a, b) => (v < a ? a : v > b ? b : v);

/**
 * Free boxes on the wall (wall-local px) for this camera: the part of the wall that is on screen
 * and usable, minus the solo dark band, split around the heads (grown by MARGIN) that overlap it.
 */
function computeLayout(L, cam, solo, wx0, wy0, w, h, k) {
  L.band = solo ? BAND_PX * wallTextScale(k) : 0;
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
      // the head with its hair, measured on the cast's rigs: up to 27.2 s above the neck base
      // (Sam's quiff, Max's spikes) and 11.8 s either side (Nova's curls)
      hb.x0 = Math.floor(nx - HEAD_HW * s) - wx0 - MARGIN;
      hb.x1 = Math.ceil(nx + HEAD_HW * s) - wx0 + MARGIN;
      hb.y0 = Math.floor(ny - HEAD_TOP * s) - wy0 - MARGIN;
      hb.y1 = Math.ceil(ny + 2 * s) - wy0 + MARGIN;
      hb.on = hb.x1 > vx0 && hb.x0 < vx1 && hb.y1 > vy0 && hb.y0 < yb;
      if (hb.on) n++;
    }
  }
  L.heads = n;
  // the highest head top (margin included) and the heads' mean centre, in wall-local px: the field's
  // value transition ends above it, and a picture in the top band leans away from it
  L.headTop = Infinity;
  L.headCx = w / 2;
  if (n) {
    let cx = 0;
    for (let i = 0; i < n; i++) {
      L.headTop = Math.min(L.headTop, HEADS[i].y0);
      cx += (HEADS[i].x0 + HEADS[i].x1) / 2;
    }
    L.headCx = cx / n;
  }
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
  // the solo WIDE: one head in front of the lower middle of a wall it barely covers (narrower than
  // 40 % of the visible wall, its top in the lower two thirds of it): the picture fills the wall
  L.wideSolo = n === 1 && HEADS[0].x1 - HEADS[0].x0 <= 0.4 * (vx1 - vx0) && HEADS[0].y0 >= vy0 + 0.33 * (yb - vy0);
  if (n) set4(L.hb || (L.hb = box4()), HEADS[0].x0, HEADS[0].y0, HEADS[0].x1, HEADS[0].y1);
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
    F = spec._lay = { heads: L.heads, band: L.band * u, top: cp(L.top), left: cp(L.left), right: cp(L.right), full: cp(L.full), vis: cp(L.vis), sx0: L.sx0, sy0: L.sy0, headTop: L.headTop * u, headCx: L.headCx * u, wideSolo: L.wideSolo, hb: L.heads ? cp(HEADS[0]) : null };
  }
  const k = env.k;
  const sc = (src, dst) => set4(dst, Math.round(src.x0 * k), Math.round(src.y0 * k), Math.round(src.x1 * k), Math.round(src.y1 * k));
  L.heads = F.heads;
  L.wideSolo = F.wideSolo;
  if (F.hb) set4(L.hb || (L.hb = box4()), Math.round(F.hb.x0 * k), Math.round(F.hb.y0 * k), Math.round(F.hb.x1 * k), Math.round(F.hb.y1 * k));
  L.headTop = F.headTop * k;
  L.headCx = F.headCx * k;
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
const FIELD = { cap: null, buf: null, w: 0, h: 0, style: '', soft: false, ax: -1, ay: -1, fy: NaN, hf: NaN, fe: NaN, x0: 0, y0: 0, x1: 0, y1: 0 };
function fillField(b, style, soft) {
  const f = FIELD;
  if (f.buf && f.w === b.w && f.h === b.h && f.style === style.id && f.soft === soft && f.ax === ENV.ax && f.ay === ENV.ay && f.fy === ENV.fy && f.hf === ENV.hf && f.fe === ENV.fe && f.x0 === CLIP.x0 && f.y0 === CLIP.y0 && f.x1 === CLIP.x1 && f.y1 === CLIP.y1) {
    b.px.set(f.buf);
    return;
  }
  fieldPixels(b, style, soft);
  const n = b.w * b.h;
  if (!f.cap || f.cap.length < n) f.cap = new Uint32Array(Math.ceil(n * 1.25));
  f.buf = f.cap.subarray(0, n);
  f.buf.set(b.px);
  Object.assign(f, { w: b.w, h: b.h, style: style.id, soft, ax: ENV.ax, ay: ENV.ay, fy: ENV.fy, hf: ENV.hf, fe: ENV.fe, x0: CLIP.x0, y0: CLIP.y0, x1: CLIP.x1, y1: CLIP.y1 });
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
  let [u0, u1] = style.wallBand || FIELD_BAND;
  // the transition is over above every head in front of the wall (no value seam behind a head,
  // ART_DIRECTION): squeezed toward the top when a head rises into it, gone when it reaches the top
  const ue = (ENV.fe + fy) / hf;
  if (ue < u1) {
    u0 *= Math.max(0, ue) / u1;
    u1 = Math.max(0, ue);
  }
  const iu = 1 / Math.max(1e-6, u1 - u0);
  for (let y = y0; y < y1; y++) {
    let q = Math.round(Math.max(0, Math.min(1, ((y + 0.5 + fy) / hf - u0) * iu)) * 16);
    if (q <= 2) q = 0; // no lone Bayer specks at the ends of the band
    else if (q >= 14) q = 16;
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
  // the field's own bottom colour as fillField draws it (no value step behind the presenter's neck),
  // navy dropping to ink
  const n = style.wallField[1];
  rect(b, 0, b.h - band, b.w, b.h, C[n] === C.navy ? C.ink : soft && LSTAR[n] > LSTAR.slate ? C[DARKER[n]] : C[n]);
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
  // (at 2x and more each cell keeps a 1 px ink gap, so no lit block reaches the 4x4 of a face patch)
  const cells = [[-4, -3], [-1, -3], [2, -3], [-4, 1], [2, 1]];
  const g = s > 1 ? 1 : 0;
  for (const [x, y] of cells) rect(b, cx + x * s, cy + y * s, cx + (x + 2) * s - g, cy + (y + 2) * s - g, C.cyan);
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
  // the disc as a clean pixel circle (inside when the pixel centre is within R + 0.35: no lone
  // corner pixels on the limb), and its rim: the disc pixels with a 4-neighbour outside it
  const inDisc = (x, y) => {
    const dx = x - c, dy = y - c;
    return dx * dx + dy * dy <= (R + 0.35) * (R + 0.35);
  };
  const n = [];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (!inDisc(x, y)) continue;
      const dx = x - c, dy = y - c;
      const nx = dx / RR, ny = dy / RR;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      // latitude for the bands, with the planet's axis tipped 18° toward camera-right
      const lat = Math.asin(Math.max(-1, Math.min(1, ny * Math.cos(0.31) - nx * Math.sin(0.31))));
      const rim = !inDisc(x - 1, y) || !inDisc(x + 1, y) || !inDisc(x, y - 1) || !inDisc(x, y + 1) ? 1 : 0;
      n.push(y * S + x, nx, ny, nz, lat, rim);
    }
  }
  T = { R, S, c, n: Float32Array.from(n) };
  if (PLANET_TABLES.size > 24) PLANET_TABLES.clear();
  PLANET_TABLES.set(R, T);
  return T;
}

/** Light azimuth (radians from the lens toward camera-left) at time t: 55° ± 35° on a 90 s sine. */
export const planetAzimuth = (t) => (55 + 35 * Math.sin((2 * Math.PI * t) / 90)) * DEG;

// The planet's colours, bright to dark, hue-shifted toward purple in the shadow (cosmos.md "Video wall
// at idle"): in the wide the bible's own (lit bands tan / tanShade, ring steel and fog with a 1 px
// silver lit edge); wherever the planet is drawn larger than in the wide (the two-shot, singles: Nova's
// face is L* 46 there) one ramp step darker (lit bands tanShade / brown, ring slate and steel with a
// fog edge), so no part of it is brighter than the face beside it.
const PLANET_RAMPS = [
  { a: C.tan, b: C.tanShade, fa: C.tanShade, fb: C.brown, term: C.brown, shade: C.ink, night: C.black, ring: C.steel, band: C.fog, edge: C.silver, gap: C.slate },
  { a: C.tanShade, b: C.brown, fa: C.brown, fb: C.maroon, term: C.maroon, shade: C.ink, night: C.black, ring: C.slate, band: C.steel, edge: C.fog, gap: C.ink },
];

// The ring never changes (only the planet's light swings): its back and front halves are built once
// per radius as pixel lists, so the per-frame redraw of the planet costs only its disc.
const RING_TABLES = new Map();
function ringTable(R, dim) {
  const key = R * 2 + (dim ? 1 : 0);
  let T = RING_TABLES.get(key);
  if (T) return T;
  const P = PLANET_RAMPS[dim ? 1 : 0];
  // a tilted annulus: the ring colour with a lighter band, a 1 px lit edge on the near (lower) rim
  const a0 = R * 1.42, a1 = R * 1.95, fl = 0.3, tilt = -0.31;
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  // bounding box of the rotated ellipse (semi-axes a1 and a1·fl)
  const ex = Math.ceil(Math.sqrt((a1 * ct) ** 2 + (a1 * fl * st) ** 2)) + 1;
  const ey = Math.ceil(Math.sqrt((a1 * st) ** 2 + (a1 * fl * ct) ** 2)) + 1;
  const a02 = a0 * a0, a12 = a1 * a1, R2 = (R + 0.5) * (R + 0.5), ifl = 1 / fl;
  const lists = [[], []];
  for (let y = -ey; y <= ey; y++) {
    for (let x = -ex; x <= ex; x++) {
      const rx = x * ct + y * st, ry = (-x * st + y * ct) * ifl;
      const d2 = rx * rx + ry * ry;
      if (d2 < a02 || d2 > a12) continue;
      const front = ry > 0;
      if (!front && x * x + y * y < R2) continue; // hidden behind the planet
      const u = (Math.sqrt(d2) - a0) / (a1 - a0);
      let col = u > 0.45 && u < 0.7 ? P.band : P.ring;
      if (u > 0.9 && ry > 0) col = P.edge;
      if (u < 0.12) col = P.gap; // the gap's shadowed inner edge
      lists[front ? 1 : 0].push(x, y, col);
    }
  }
  const pack = (l) => ({ xy: Int16Array.from(l.filter((_, i) => i % 3 !== 2)), col: Uint32Array.from(l.filter((_, i) => i % 3 === 2)) });
  T = { back: pack(lists[0]), front: pack(lists[1]) };
  if (RING_TABLES.size > 24) RING_TABLES.clear();
  RING_TABLES.set(key, T);
  return T;
}

function drawRing(b, cx, cy, R, front, dim) {
  const T = ringTable(R, dim)[front ? 'front' : 'back'];
  const icx = Math.round(cx), icy = Math.round(cy);
  const { xy, col } = T;
  const w = b.w, h = b.h, px = b.px;
  for (let i = 0, j = 0; j < col.length; i += 2, j++) {
    const x = icx + xy[i], y = icy + xy[i + 1];
    if (x >= 0 && y >= 0 && x < w && y < h) px[y * w + x] = col[j];
  }
}

function drawPlanet(b, cx, cy, R, az, dim = false) {
  const T = planetTable(R);
  const { S, c, n } = T;
  const P = PLANET_RAMPS[dim ? 1 : 0];
  // the key from above and a little in front of the planet: the terminator stays a curve through the
  // whole swing (at 90° of azimuth a light from the exact side would cut the disc with a straight line)
  const el = 18 * DEG;
  let lx = -Math.sin(az) * Math.cos(el), ly = -Math.sin(el), lz = Math.cos(az) * Math.cos(el) + 0.35;
  const ln = Math.hypot(lx, ly, lz);
  lx /= ln;
  ly /= ln;
  lz /= ln;
  const ox = Math.round(cx) - c, oy = Math.round(cy) - c;
  drawRing(b, cx, cy, R, false, dim);
  let hash = 0;
  for (let i = 0; i < n.length; i += 6) {
    const idx = n[i], nx = n[i + 1], ny = n[i + 2], nz = n[i + 3], lat = n[i + 4], rim = n[i + 5];
    const d = nx * lx + ny * ly + nz * lz;
    let col;
    if (d > 0.07) {
      const band = Math.floor((lat / Math.PI + 0.5) * 9) % 2;
      // the lit side's falloff, and limb darkening as a clean 1 px rim: one step down
      col = d < 0.2 || rim ? (band ? P.fb : P.fa) : band ? P.b : P.a;
    } else if (d > -0.06) col = P.term; // one intermediate tone at the terminator
    else if (d > -0.42) col = P.shade;
    else col = P.night;
    const x = idx % S, y = (idx / S) | 0;
    plot(b, ox + x, oy + y, col);
    // the whole colour goes into the signature (two palette colours can share their low bits, and a
    // change between them must still bump the wall's version, or the background cache keeps it)
    if (col !== P.night) hash = (Math.imul(hash, 31) + idx * 3 + col) | 0;
  }
  drawRing(b, cx, cy, R, true, dim);
  return hash;
}

// ---------------------------------------------------------------------------
// NEWS IN 60 idle: the dial, two static states

function drawDial(b, cx, cy, r, phase, ts) {
  const all = phase === 'outro';
  const ccx = Math.round(cx), ccy = Math.round(cy);
  if (r < 19) {
    // Below r 19 the 60 ticks would fall closer than 2 px and merge: the twelve five-second ticks
    // alone (about 7 px apart at r 14), 2 px long, the four quarters 3 px; placed for one quadrant
    // and mirrored, so the dial is exactly symmetric. The 12 o'clock tick is yellow in both states,
    // every tick in the outro.
    for (let i = 0; i <= 3; i++) {
      const a = i * 30 * DEG;
      const len = i % 3 === 0 ? 3 : 2;
      for (let q = 0; q < len; q++) {
        const rr = r - q;
        const dx = Math.round(rr * Math.sin(a)), dy = Math.round(rr * Math.cos(a));
        for (const [sx, sy, idx] of [[1, -1, i], [-1, -1, 12 - i], [1, 1, 6 - i], [-1, 1, 6 + i]]) {
          const tick = ((idx % 12) + 12) % 12;
          plot(b, ccx + sx * dx, ccy + sy * dy, all || tick === 0 ? C.yellow : C.slate);
        }
      }
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
  // "60" in the lower half of a large dial; centred in a small one, at least 2 px inside the ticks
  const ns = r >= 30 ? Math.max(1, ts) : 1;
  const ny = r >= 19 ? ccy + Math.round(r * 0.28) : ccy - Math.floor(capHeight('body', ns) / 2);
  stampText(b.px, b.w, b.h, '60', ccx + 1, ny, C.yellow, 'body', ns, 'center');
}

// ---------------------------------------------------------------------------
// Pictures: indexed once per image, palette-mapped and dimmed per programme

// Palette colours a wall picture may use: nothing above fog (no white, cream or silver), no bright skin or orange
// (faces stay the warmest thing in frame: a fire maps to rust / tan / darkRed), no programme accents or brand red
// (they keep their meaning on set). Per programme, the colours its bible keeps for the set are left out too:
// TECH BYTES and COSMOS no purple (tech-bytes.md §4 item 2: no magenta or purple pixel in any frame; COSMOS's
// purple is its scenery tint), MONEY MINUTE no green (money-minute.md §5: green only on the tag plate, desk
// line, card rule and open line); those pixels fall to navy, slate or ink.
const PICTURE_NAMES = ['black', 'ink', 'slate', 'steel', 'fog', 'darkRed', 'maroon', 'rust', 'skinShade', 'tan', 'tanShade', 'brown', 'darkGreen', 'blue', 'navy', 'purple'];
const PICTURE_DROP = { 'tech-bytes': ['purple'], cosmos: ['purple'], 'money-minute': ['darkGreen'] };
/** Highlights (ART_DIRECTION values: "highlights ... on at most 10 % of the wall"): palette L* above this. */
export const PIC_HI_L = 45;
const PIC_HI_SHARE = 0.1;
// The nearest-colour search through a lookup table on quantised Lab (L* 1, a*/b* 4 apart), filled lazily:
// a picture costs one table read per pixel and pass instead of a search through the palette
const LUT_A = 41, LUT_B = 41, LUT_L = 101;
const PALS = new Map();
function picturePalette(styleId) {
  const key = PICTURE_DROP[styleId] ? styleId : '';
  let pal = PALS.get(key);
  if (pal) return pal;
  const names = PICTURE_NAMES.filter((n) => !(PICTURE_DROP[key] || []).includes(n));
  const lab = new Float32Array(names.length * 3), u32 = new Uint32Array(names.length), L = new Float32Array(names.length);
  names.forEach((n, i) => {
    const c = C[n];
    lab.set(labRGB(c & 255, (c >>> 8) & 255, (c >>> 16) & 255), i * 3);
    u32[i] = c;
    L[i] = LSTAR[n];
  });
  pal = { key, names, lab, u32, L, lut: new Uint8Array(LUT_L * LUT_A * LUT_B).fill(255) };
  PALS.set(key, pal);
  return pal;
}
function nearestIn(pal, Lq, A, B) {
  let best = 0, bd = Infinity;
  const lab = pal.lab;
  for (let j = 0, q = 0; j < pal.u32.length; j++, q += 3) {
    const dl = Lq - lab[q], da = A - lab[q + 1], db = B - lab[q + 2];
    const d = dl * dl + da * da + db * db;
    if (d < bd) {
      bd = d;
      best = j;
    }
  }
  return best;
}
/** Fill the rows [l0, l1) of a palette's lookup table (warm-up). */
function prefillLut(pal, l0, l1) {
  for (let li = l0; li < l1; li++) {
    for (let ai = 0; ai < LUT_A; ai++) {
      for (let bi = 0; bi < LUT_B; bi++) {
        const k = (li * LUT_A + ai) * LUT_B + bi;
        if (pal.lut[k] === 255) pal.lut[k] = nearestIn(pal, li, ai * 4 - 80, bi * 4 - 80);
      }
    }
  }
}
function lookup(pal, L, A, B) {
  const li = L <= 0 ? 0 : L >= 100 ? 100 : Math.round(L);
  let ai = Math.round((A + 80) * 0.25), bi = Math.round((B + 80) * 0.25);
  ai = ai < 0 ? 0 : ai > 40 ? 40 : ai;
  bi = bi < 0 ? 0 : bi > 40 ? 40 : bi;
  const k = (li * LUT_A + ai) * LUT_B + bi;
  let v = pal.lut[k];
  if (v === 255) v = pal.lut[k] = nearestIn(pal, li, ai * 4 - 80, bi * 4 - 80);
  return v;
}
const SRC = new WeakMap();
let srcSerial = 0;
const COOL_A = 4, COOL_B = -16; // the wall's cool grade (CIE a*, b*): where the palette's neutral ramp sits

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

/** The pixels of a picture record (`full` preferred: the director's 416x234), read once: { w, h, u32, id }. */
function sourceOf(img) {
  const key = img && (img.full || img.small || img);
  if (!key || typeof key !== 'object') return null;
  let s = SRC.get(key);
  if (s) return s;
  const p = pixelsOf(img);
  if (!p || !p.w || !p.h) return null;
  s = { w: p.w, h: p.h, u32: p.u32, id: ++srcSerial };
  SRC.set(key, s);
  return s;
}

// sRGB byte → linear light, and the CIE Lab of a linear colour (D65)
const LIN8 = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LIN8[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
const fLab = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);

// scratch for one filtered picture (Lab per output pixel), grown as needed
let PL = new Float32Array(0), PA = PL, PB = PL;
const PX0 = new Int32Array(1024), PX1 = new Int32Array(1024);

/**
 * Area-average the cover-fit crop of `src` down to pw x ph (each output pixel is the mean, in linear
 * light, of every source pixel under it: the director's dithered 416x234 picture becomes clean
 * tones instead of aliased speckle) into PL / PA / PB (CIE Lab).
 */
function filterPicture(src, pw, ph) {
  const n = pw * ph;
  if (PL.length < n) {
    PL = new Float32Array(n);
    PA = new Float32Array(n);
    PB = new Float32Array(n);
  }
  const sa = src.w / src.h, da = pw / ph;
  let cw = src.w, ch = src.h, cx = 0, cy = 0;
  if (sa > da) {
    cw = src.h * da;
    cx = (src.w - cw) / 2;
  } else {
    ch = src.w / da;
    cy = (src.h - ch) * 0.4;
  }
  for (let x = 0; x < pw && x < 1024; x++) {
    const a = Math.min(src.w - 1, Math.floor(cx + (x * cw) / pw));
    PX0[x] = a;
    PX1[x] = Math.max(a + 1, Math.min(src.w, Math.floor(cx + ((x + 1) * cw) / pw)));
  }
  const u32 = src.u32, sw = src.w;
  for (let y = 0; y < ph; y++) {
    const ya = Math.min(src.h - 1, Math.floor(cy + (y * ch) / ph));
    const yb = Math.max(ya + 1, Math.min(src.h, Math.floor(cy + ((y + 1) * ch) / ph)));
    for (let x = 0; x < pw; x++) {
      const xa = PX0[x], xb = PX1[x];
      let r = 0, g = 0, bl = 0;
      for (let sy = ya; sy < yb; sy++) {
        const row = sy * sw;
        for (let sx = xa; sx < xb; sx++) {
          const c = u32[row + sx];
          r += LIN8[c & 255];
          g += LIN8[(c >>> 8) & 255];
          bl += LIN8[(c >>> 16) & 255];
        }
      }
      const inv = 1 / ((yb - ya) * (xb - xa));
      r *= inv;
      g *= inv;
      bl *= inv;
      const fx = fLab((0.4124 * r + 0.3576 * g + 0.1805 * bl) / 0.95047);
      const fy = fLab(0.2126 * r + 0.7152 * g + 0.0722 * bl);
      const fz = fLab((0.0193 * r + 0.1192 * g + 0.9505 * bl) / 1.08883);
      const i = y * pw + x;
      PL[i] = 116 * fy - 16;
      PA[i] = 500 * (fx - fy);
      PB[i] = 200 * (fy - fz);
    }
  }
}

/**
 * The wall's tone curve: a gain on L* with a soft shoulder that never passes `hiL`, so the picture
 * keeps its local contrast (shadows and mid-tones stay apart) while its mean comes down to the
 * wall's ceiling and its highlights stay under the faces (ART_DIRECTION: wall mean ≤ 45, highlights
 * on at most 10 % of it).
 */
function toneL(x, knee, hiL) {
  if (x <= knee) return x;
  const r = hiL - knee;
  return knee + r * (1 - Math.exp(-(x - knee) / r));
}

// histogram of the filtered picture's L* (quarter steps): the gain is solved on it, not per pixel
const HIST = new Float64Array(401), TONE = new Float32Array(401);

/** The largest gain whose toned mean stays at or under `target` (binary search on the histogram). */
function solveGain(n, target, knee, hiL) {
  const meanAt = (g) => {
    let sum = 0;
    for (let i = 0; i <= 400; i++) if (HIST[i]) sum += HIST[i] * toneL(i * 0.25 * g, knee, hiL);
    return sum / n;
  };
  if (meanAt(1) <= target) return 1;
  let lo = 0.05, hi = 1;
  for (let it = 0; it < 14; it++) {
    const mid = (lo + hi) / 2;
    if (meanAt(mid) <= target) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Map the filtered picture to palette pixels into out (pw*ph), dimmed to a mean L* ≤ maxL with at
 * most 10 % of it above L* 45 (ART_DIRECTION: wall mean ≤ 45, highlights on at most 10 % of it),
 * counted on the palette colours it lands on: a bright sky that lands on fog is pulled down (the
 * tone curve's shoulder lowered, the gain solved again) until both hold.
 */
function mapPicture(out, n, maxL, pal) {
  HIST.fill(0);
  for (let i = 0; i < n; i++) {
    const q = Math.round(PL[i] * 4);
    HIST[q < 0 ? 0 : q > 400 ? 400 : q]++;
  }
  let hiL = maxL + 20, knee = maxL + 4, target = maxL;
  for (let pass = 0; pass < 10; pass++) {
    const g = solveGain(n, target, knee, hiL);
    // the tone curve as a table on quarter steps of L* (no exp() per pixel)
    for (let q = 0; q <= 400; q++) TONE[q] = toneL(q * 0.25 * g, knee, hiL);
    let sum = 0, bright = 0;
    for (let i = 0; i < n; i++) {
      const L0 = PL[i];
      const q = Math.round(L0 * 4);
      const L = TONE[q < 0 ? 0 : q > 400 ? 400 : q];
      // chroma follows the light (a dimmed colour stays the same hue), a touch quieter on the wall;
      // then the wall's cool balance: the palette's neutrals (black, ink, slate, steel, fog) sit at
      // about a* +4, b* -16, so a grey in the picture is moved there and lands on them (left neutral
      // it was nearer maroon and brown, and the picture turned to brown mush)
      const cf = L0 > 0.5 ? (0.9 * L) / L0 : 0;
      const j = lookup(pal, L, PA[i] * cf + COOL_A, PB[i] * cf + COOL_B);
      out[i] = pal.u32[j];
      sum += pal.L[j];
      if (pal.L[j] > PIC_HI_L) bright++;
    }
    const meanOk = sum / n <= maxL + 0.25, brightOk = bright <= n * PIC_HI_SHARE;
    if (meanOk && brightOk) break;
    if (!brightOk) {
      hiL -= 3;
      knee = Math.min(knee, hiL - 8);
    }
    if (!meanOk) target -= 1;
  }
}

// filtered, palette-mapped pictures per (source, size, ceiling), a few kept (a cut back to the
// same shot finds its picture ready)
const PICS = new Map();
function pictureAt(src, pw, ph, maxL, styleId = '') {
  const pal = picturePalette(styleId);
  const key = `${src.id}|${pw}|${ph}|${maxL}|${pal.key}`;
  let p = PICS.get(key);
  if (p) {
    PICS.delete(key);
    PICS.set(key, p);
    return p;
  }
  p = { w: pw, h: ph, px: new Uint32Array(pw * ph) };
  filterPicture(src, pw, ph);
  mapPicture(p.px, pw * ph, maxL, pal);
  PICS.set(key, p);
  if (PICS.size > 10) PICS.delete(PICS.keys().next().value);
  return p;
}

/**
 * Draw `src` covering pw x ph at (x0, y0). The picture is filtered at the size the wall had on the
 * cut (`fit`, from the frozen layout) and a slow camera move afterwards only resamples that one.
 */
function drawPicture(b, src, x0, y0, pw, ph, maxL, fit = null, styleId = '') {
  if (!src || pw <= 0 || ph <= 0) return;
  const fw = fit ? fit[0] : pw, fh = fit ? fit[1] : ph;
  const p = pictureAt(src, Math.max(1, fw), Math.max(1, fh), maxL, styleId);
  if (p.w === pw && p.h === ph) blitSub(b, p, x0, y0);
  else resampleSub(b, p, x0, y0, pw, ph);
}

// ---------------------------------------------------------------------------
// Map: the opens' mini locator when available, our static locator otherwise

let MAPFN = null;
let MAPREADY = null; // worldmap.js cityLights(): null until its data has loaded (it loads in slices after boot)
let MAP_FAILED = false;
if (typeof document !== 'undefined') {
  import('../../../scenes/worldmap.js')
    .then((m) => {
      MAPFN = typeof m.drawWorldMap === 'function' ? m.drawWorldMap : null;
      MAPREADY = typeof m.cityLights === 'function' ? m.cityLights : null;
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
  // right after boot the locator draws a plain sea until its data is in: our own static locator
  // stands in for that whole shot instead of an empty blue box
  try {
    if (MAPREADY && MAPREADY() === null) return false;
  } catch {
    return false;
  }
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

function placeTab(b, text0, style, ts) {
  // the whole place, or the name before its region ("NAIROBI, KENYA" → "NAIROBI"); never a cut word
  const text = fitPlace(text0, b.w - 8 * ts, 'micro', ts);
  if (!text) return;
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
    return value ? { value, label, pre: String(fig.pre ?? fig.qualifier ?? '').trim() } : null;
  }
  const s = String(fig).trim();
  if (!s) return null;
  const m = NUM_RE.exec(s);
  if (m) return { value: m[1].trim(), label: m[2].trim(), pre: '' };
  const words = s.split(/\s+/);
  return { value: words[0], label: words.slice(1).join(' '), pre: '' };
}

/** Cut a line at word boundaries to fit maxW px (never ending on a comma, dash or colon). */
function fitLine(text, maxW, font, scale) {
  let s = String(text || '').trim();
  if (textWidth(s, font, scale) <= maxW) return s;
  const words = s.split(/\s+/);
  while (words.length > 1) {
    words.pop();
    s = words.join(' ').replace(/[\s,;:\-–—]+$/, '');
    if (s && textWidth(s, font, scale) <= maxW) return s;
  }
  return '';
}

/**
 * A place name for a tab or a plate line: the whole name when it fits, else the part before its
 * first comma ("SAN FRANCISCO, CALIFORNIA" → "SAN FRANCISCO"), else '' (never a name cut mid-way).
 */
function fitPlace(text, maxW, font, scale) {
  const s = String(text || '').trim();
  if (!s) return '';
  if (textWidth(s, font, scale) <= maxW) return s;
  const head = s.split(',')[0].trim();
  return head && textWidth(head, font, scale) <= maxW ? head : '';
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
  // a qualifier ("ABOUT", "MORE THAN") in micro above the value: the figure is never shown bare
  const pre = fig.pre ? fitLine(fig.pre, b.w - 4, 'micro', 1) : '';
  const pw = pre ? textWidth(pre, 'micro', 1) : 0, ph = pre ? capHeight('micro', 1) + 3 : 0;
  const ruleH = 1, gap = 3;
  const needW = Math.max(vw, lw, pw), needH = ruleH + gap + ph + vh + lh;
  let box = pickBox(L, needW + 4, needH + 4);
  if (money) box = clampScreen(box, L, 24, 176, 120);
  // centred in its box, but never past the box's edges (a bezel, a head or the frame edge)
  const half = Math.round(needW / 2);
  const cx = Math.max(box.x0 + 2 + half, Math.min(box.x1 - 2 - (needW - half), Math.round((box.x0 + box.x1) / 2)));
  const top = Math.round(box.y0 + Math.max(2, (bh(box) - needH) * 0.42));
  const accent = style.id === 'money-minute' ? C.darkGreen : C[style.accentName];
  rect(b, cx - Math.round(needW / 2), top, cx - Math.round(needW / 2) + Math.min(needW, 16), top + ruleH, accent);
  if (pre) stampText(b.px, b.w, b.h, pre, cx, top + ruleH + gap, C.fog, 'micro', 1, 'center');
  stampText(b.px, b.w, b.h, value, cx, top + ruleH + gap + ph, C.white, 'body', vs, 'center');
  if (label) stampText(b.px, b.w, b.h, label, cx, top + ruleH + gap + ph + vh + 3, C.fog, 'micro', 1, 'center');
}

/** MONEY MINUTE MCU-R: the figure panel stays inside screen x 24-176 and above y 120. */
const CLAMP = { x0: 0, y0: 0, x1: 0, y1: 0 };
function clampScreen(box, L, sx0, sx1, sy1) {
  set4(CLAMP, Math.max(box.x0, sx0 - L.sx0), box.y0, Math.min(box.x1, sx1 - L.sx0), Math.min(box.y1, sy1 - L.sy0));
  return bw(CLAMP) > 8 && bh(CLAMP) > 8 ? CLAMP : box;
}

// A line never ends on these (articles, prepositions, conjunctions, possessives): "PEACE TALKS
// RESUME IN / GENEVA" breaks as "PEACE TALKS / RESUME IN GENEVA" (the graphics' phrase rule)
const WEAK_END = new Set('A AN THE OF TO IN ON AT BY FOR FROM WITH INTO OVER UNDER ABOUT AND OR BUT NOR ITS HIS HER THEIR OUR PER THAN VIA AS AFTER BEFORE DURING SINCE UNTIL ACROSS AGAINST BETWEEN AMONG AROUND NEAR WITHOUT WITHIN AMID'.split(' '));

/**
 * The words of `text` in at most `max` lines of at most maxW px each, or null when it needs more
 * lines or one word alone is wider than maxW. Two lines are balanced (the split with the shortest
 * longer line), and a line never ends on an article, a preposition or a conjunction when another
 * split fits.
 */
function wrapWords(text, maxW, font, scale, max) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const one = words.join(' ');
  if (textWidth(one, font, scale) <= maxW) return [one];
  if (max < 2 || words.length < 2) return null;
  let best = null, cost = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
    const wa = textWidth(a, font, scale), wb = textWidth(b, font, scale);
    if (wa > maxW || wb > maxW) continue;
    const c = Math.max(wa, wb) + (WEAK_END.has(words[i - 1].replace(/[^A-Z]/gi, '').toUpperCase()) ? 1000 : 0);
    if (c < cost) {
      cost = c;
      best = [a, b];
    }
  }
  return best;
}

/** Size of a plate (rule, kicker lines, source line) at text scale ts. */
function plateSize(lines, sub, ts, gap = 3 * ts) {
  let w = 0;
  for (const l of lines) w = Math.max(w, textWidth(l, 'body', ts));
  if (sub) w = Math.max(w, textWidth(sub, 'micro', ts));
  const kh = capHeight('body', ts), n = lines.length;
  const sh = sub ? capHeight('micro', ts) + gap : 0;
  return { w, h: ts + gap + n * kh + Math.max(0, n - 1) * gap + sh, kh };
}

/** The free boxes in the order a plate or a block tries them: the wider side first, the top band, the other side. */
function boxOrder(L) {
  if (!L.heads) return [L.full];
  const side = bw(L.left) >= bw(L.right) ? L.left : L.right;
  return [side, L.top, side === L.left ? L.right : L.left];
}

/**
 * Where a plate goes in layout L: { ts, lines, sub, x0, top, w, h, kh } in wall-local px, or null.
 * The largest form some free box holds, in this order: the wall's text scale on one line with the
 * source, then the kicker wrapped on two lines, then 1x (one line, two lines), then 1x without the
 * source. Each box is tried with its own width and height, so a long kicker (the writer allows 18
 * characters) wraps in a tall narrow box instead of failing the wide short one. Never under a
 * bezel, a head or the frame edge; null only when no free box holds even the kicker at 1x.
 */
function layoutPlate(L, label0, sub0, ts0) {
  const boxes = boxOrder(L);
  const tries = [];
  for (const s of ts0 > 1 ? [ts0, 1] : [1]) tries.push([s, 1, true], [s, 2, true]);
  if (sub0) tries.push([1, 1, false], [1, 2, false]);
  // then the two lines set 2 px apart (the solo wide's band above the head is 24 px tall), and last
  // the place alone (a kicker too long for any free box still leaves the story's place)
  if (label0) tries.push([1, 2, false, 2]);
  if (sub0 && label0) tries.push([1, 0, true]);
  for (const [ts, n, withSub, gap0] of tries) {
    const gap = gap0 ?? 3 * ts;
    for (const box of boxes) {
      const maxW = bw(box) - 4;
      if (maxW < 8) continue;
      const lines = label0 && n > 0 ? wrapWords(label0, maxW, 'body', ts, n) : [];
      if (!lines || (n === 2 && lines.length < 2)) continue;
      let sub = '';
      if (withSub && sub0) {
        // the source is only shortened at 1x (a larger plate never pays with a cut name)
        sub = ts > 1 ? (textWidth(sub0, 'micro', ts) <= maxW ? sub0 : '') : fitLine(sub0, maxW, 'micro', ts);
        if (!sub) continue;
      }
      if (!lines.length && !sub) continue;
      const z = plateSize(lines, sub, ts, gap);
      if (z.w + 4 > bw(box) || z.h + 4 > bh(box)) continue;
      const cx = Math.round((box.x0 + box.x1) / 2);
      const top = Math.round(box.y0 + Math.max(2, (bh(box) - z.h) * 0.42));
      const x0 = Math.max(box.x0 + 2, Math.min(box.x1 - 2 - z.w, cx - Math.round(z.w / 2)));
      return { ts, lines, sub, x0, top, w: z.w, h: z.h, kh: z.kh, gap };
    }
  }
  return null;
}

function drawPlate(b, L, spec, style, ts0) {
  const P = layoutPlate(L, spec.label || '', spec.sub || '', plateScale(spec, ts0));
  if (!P) return false;
  const { ts, lines, sub, x0, top, w: needW, kh, gap } = P;
  const accent = style.id === 'money-minute' ? C.darkGreen : C[style.accentName];
  rect(b, x0, top, x0 + Math.min(needW, 12 * ts), top + ts, accent);
  let y = top + ts + gap;
  for (const l of lines) {
    stampText(b.px, b.w, b.h, l, x0, y, C.silver, 'body', ts, 'left');
    y += kh + gap;
  }
  if (sub) stampText(b.px, b.w, b.h, sub, x0, lines.length ? y : top + ts + gap, C.fog, 'micro', ts, 'left');
  return true;
}

/**
 * A story's plate is set in body 1x at every framing (the strap under it carries the headline in body
 * 1x: ART_DIRECTION §4, two type levels per screen); a plate asked for explicitly (scene.wall
 * { mode: 'plate' }, the lab) keeps the wall's text scale.
 */
const plateScale = (spec, ts) => (spec.story ? 1 : ts);

/**
 * The plate's rectangle in SCREEN px for a camera (as laid out on a cut), plus the head boxes it must
 * keep clear of: { x0, y0, x1, y1, ts, kicker, sub, heads: [{ x0, y0, x1, y1 }] } or null (tests, labs).
 */
export function plateRectFor(cam, label, sub, styleIn, story = false) {
  const style = resolveStyle(styleIn);
  const k = kAt(cam, SET.wallZ);
  const o = wallOrigin(cam);
  const { w, h } = wallSize(cam, k);
  const L = computeLayout(LAYOUT, cam, style.solo, o.x, o.y, w, h, k);
  const P = layoutPlate(L, label || '', sub || '', story ? 1 : wallTextScale(k));
  if (!P) return null;
  const heads = [];
  for (let i = 0; i < L.heads; i++) {
    const hb = HEADS[i];
    heads.push({ x0: hb.x0 + o.x + MARGIN, y0: hb.y0 + o.y + MARGIN, x1: hb.x1 + o.x - MARGIN, y1: hb.y1 + o.y - MARGIN });
  }
  return { x0: P.x0 + o.x, y0: P.top + o.y, x1: P.x0 + P.w + o.x, y1: P.top + P.h + o.y, ts: P.ts, kicker: P.lines.join(' '), lines: P.lines, sub: P.sub, heads };
}

/**
 * The picture / map rectangle in SCREEN px for a camera (as laid out on a cut), plus the head boxes:
 * { x0, y0, x1, y1, framed, heads: [...] }; x1 === x0 when no free area holds a picture (tests, labs).
 */
export function mediaRectFor(cam, styleIn) {
  const style = resolveStyle(styleIn);
  const k = kAt(cam, SET.wallZ);
  const o = wallOrigin(cam);
  const { w, h } = wallSize(cam, k);
  const L = computeLayout(LAYOUT, cam, style.solo, o.x, o.y, w, h, k);
  const m = mediaRect(L, { w, h }, wallTextScale(k));
  const heads = [];
  for (let i = 0; i < L.heads; i++) {
    const hb = HEADS[i];
    heads.push({ x0: hb.x0 + o.x + MARGIN, y0: hb.y0 + o.y + MARGIN, x1: hb.x1 + o.x - MARGIN, y1: hb.y1 + o.y - MARGIN });
  }
  return { x0: m.x + o.x, y0: m.y + o.y, x1: m.x + m.w + o.x, y1: m.y + m.h + o.y, framed: m.framed, heads, wall: { x0: o.x, y0: o.y, x1: o.x + w, y1: o.y + h } };
}

/**
 * Prepare a wall request's content ahead of its cut, so the cut frame pays nothing for it (INTEGRATION
 * calls it from idle time when the next shot is known, or as soon as a story's image record arrives):
 * reads the picture's pixels once and, given the shot's camera, filters and maps it at the size it
 * will have there; builds the text masks of the kicker and source plate. Cheap when already done.
 * Returns true when the request had something to prepare.
 */
export function warmWallContent(req, styleIn, cam = null) {
  if (!req) return false;
  const style = resolveStyle(styleIn);
  let did = false;
  const src = req.image ? sourceOf(req.image) : null;
  if (src) {
    did = true;
    if (cam) {
      // the same layout path as the cut frame's (layoutOf rounds through wall units), so the size matches
      const k = kAt(cam, SET.wallZ);
      const o = wallOrigin(cam);
      const { w, h } = wallSize(cam, k);
      const L = layoutOf({ solo: req.solo ?? style.solo }, { cam, wx0: o.x, wy0: o.y, k }, w, h);
      const m = mediaRect(L, { w, h }, wallTextScale(k));
      const maxL = (style.wallMaxL || 45) - (cam.soft > 0.5 ? 6 : 2);
      const mat = !m.framed && style.pictureMat ? Math.max(2, Math.round(style.pictureMat * k)) : 0;
      if (m.w - 2 * mat > 0 && m.h - 2 * mat > 0) pictureAt(src, m.w - 2 * mat, m.h - 2 * mat, maxL, style.id);
    }
  }
  for (const [t, font] of [[req.label, 'body'], [req.sub, 'micro'], [req.location?.place, 'micro']]) {
    if (!t) continue;
    did = true;
    for (const sc of [1, 2]) textMask(String(t), font, sc);
  }
  return did;
}

// ---------------------------------------------------------------------------
// Pictures and maps: where they go on the wall

const MEDIA = { x: 0, y: 0, w: 0, h: 0, framed: false, behind: false, dimRows: 0 };
const MEDIA_MIN_W = 32, MEDIA_MIN_H = 18; // screen px: a picture smaller than this does not read (its plate shows)
export const MAP_MIN_W = 80; // a locator narrower than this says nothing (its place plate shows instead)
/**
 * The rectangle a picture or a map takes:
 *   - no head in front of the wall (the duo wide, two-shot, a single that sees the wall beside the
 *     head): the visible wall. A picture runs up to the wall's top edge, its rows under the graphics'
 *     top row (y 8-21: bug, programme tag, clock) one palette step darker (m.dimRows), so the wall
 *     never shows a black letterbox above it; a map starts below that row (its place tab rides on
 *     its top edge);
 *   - the solo WIDE (one small head in front of the wall's lower middle): a picture fills the wall
 *     above its dark band and the head occludes its lower centre, as on any studio wide (m.behind);
 *   - otherwise the largest picture box (4:3 to 16:9; up to 3.5:1 in the band above a head) that a
 *     free area beside or above the head holds (news-60.md: the MCU-L picture box), top-aligned, and
 *     above a head pushed to the side away from it. m.w is 0 when no free area holds a readable box.
 */
function mediaRect(L, b, ts, forMap = false) {
  const m = MEDIA;
  m.behind = false;
  m.dimRows = 0;
  if (L.heads) {
    let area = 0;
    m.x = m.y = m.w = m.h = 0;
    m.framed = true;
    for (const bx of [L.left, L.right, L.top]) {
      // beside a head: 4:3 to 16:9 with a 2 px pad (the box already keeps 6 px from the head); in the
      // band above it up to a 3.5:1 letterbox with a 1 px pad, centred away from the head
      const top = bx === L.top;
      const pad = top ? ts : 2 * ts, amax = top && !forMap ? 3.5 : 1.78;
      const aw = bw(bx) - 2 * pad, ah = bh(bx) - 2 * pad;
      if (aw <= 0 || ah <= 0) continue;
      let w = aw, h = ah;
      if (aw > ah * amax) w = Math.floor(ah * amax);
      else if (aw < ah * 1.33) h = Math.floor(aw / 1.33);
      if (w < MEDIA_MIN_W || h < MEDIA_MIN_H || w * h <= area) continue;
      area = w * h;
      m.w = w;
      m.h = h;
      m.y = bx.y0 + pad;
      if (top) {
        // above the head: lean away from it (left when it is centred, the MCU-R side)
        const mid = (bx.x0 + bx.x1) / 2;
        m.x = w >= aw - 1 ? bx.x0 + pad : L.headCx >= mid - 1 ? bx.x0 + pad : bx.x1 - pad - w;
      } else m.x = Math.round(bx.x0 + (bw(bx) - w) / 2);
    }
    if (forMap || !L.wideSolo || m.w >= 0.75 * bw(L.full)) return m;
    m.behind = true;
  }
  const v = L.vis;
  m.x = v.x0;
  m.y = v.y0;
  if (forMap && m.y < L.full.y0) m.y = L.full.y0;
  else if (m.y < L.full.y0) m.dimRows = L.full.y0 - m.y;
  m.w = bw(v);
  m.h = Math.max(0, Math.min(v.y1, b.h - L.band) - m.y);
  m.framed = false;
  return m;
}

// one palette step darker, as u32 → u32 (the picture rows under the graphics' top row, the wall
// behind a head in the solo wide)
const DARKER32 = new Map(Object.keys(DARKER).map((n) => [C[n] >>> 0, C[DARKER[n]] >>> 0]));
function darkenRect(b, x0, y0, x1, y1, steps = 1) {
  x0 = Math.max(0, x0);
  y0 = Math.max(0, y0);
  x1 = Math.min(b.w, x1);
  y1 = Math.min(b.h, y1);
  const px = b.px;
  for (let y = y0; y < y1; y++) {
    for (let x = x0, i = y * b.w + x0; x < x1; x++, i++) {
      let c = px[i] >>> 0;
      for (let k = 0; k < steps; k++) c = DARKER32.get(c) ?? c;
      px[i] = c;
    }
  }
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

const ENV = { k: 1, cs: 1, ts: 1, soft: false, cam: null, wx0: 0, wy0: 0, ax: 0, ay: 0, fy: 0, hf: 63, fe: Infinity, t: 0, lod: 0, frozenLam: -10, frozenAz: 55 * DEG };

/** Integer scale for wall text and emblems: 1 in the wide and two-shot, 2-3 in singles. */
export const wallTextScale = (k) => (k < 1.25 ? 1 : 2);

/** Render `spec` into `b`; returns a signature of the time-driven pixels (globe dots, planet terminator, map frame). */
function renderSpec(b, spec, style, env) {
  const { cs, ts, soft } = env;
  const L = layoutOf(spec, env, b.w, b.h);
  // what of the wall is on screen with the CURRENT camera (a move may show more than at the cut)
  set4(CLIP, clampN(-env.wx0 - 2, 0, b.w), clampN(-env.wy0 - 2, 0, b.h), clampN(386 - env.wx0, 0, b.w), clampN(218 - env.wy0, 0, b.h));
  env.fe = L.headTop;
  fillField(b, style, soft);
  let sig = 0;
  switch (spec.mode) {
    case 'picture': {
      const src = sourceOf(spec.image);
      const maxL = (style.wallMaxL || 45) - (soft ? 6 : 2);
      const m = mediaRect(L, b, ts);
      if (m.framed && m.w <= 0) {
        // a head fills the wall: no room for a readable picture, the story's kicker plate if it fits
        // (else the programme's idle: the wall is never left blank on a story)
        if (!drawPlate(b, L, spec, style, ts)) sig = drawIdle(b, L, spec, style, env);
        darkBand(b, L.band, style, soft);
        break;
      }
      if (m.framed) {
        frameBox(b, m, style, env);
        if (!spec._picWH) spec._picWH = [m.w, m.h];
        drawPicture(b, src, m.x, m.y, m.w, m.h, maxL, spec._picWH, style.id);
      } else {
        // the whole wall: TECH BYTES keeps its 2 px black mat inside the bezel
        const mat = style.pictureMat ? Math.max(2, Math.round(style.pictureMat * env.k)) : 0;
        rect(b, CLIP.x0, CLIP.y0, CLIP.x1, CLIP.y1, C.black);
        const pw = m.w - 2 * mat, ph = m.h - 2 * mat;
        if (!spec._picWH) spec._picWH = [pw, ph];
        drawPicture(b, src, m.x + mat, m.y + mat, pw, ph, maxL, spec._picWH, style.id);
        // the rows under the graphics' top row: the picture continues, one step darker
        if (m.dimRows > 0) darkenRect(b, m.x, m.y, m.x + m.w, m.y + m.dimRows, 1);
        darkBand(b, L.band, style, true);
      }
      break;
    }
    case 'map': {
      const dt = Math.max(0, env.t - spec.since);
      const m = mediaRect(L, b, ts, true);
      if (m.framed && m.w < MAP_MIN_W * Math.min(2, ts)) {
        // no room for a readable locator beside the head (the solo wide: a stamp-sized map says
        // nothing): the place as a plate, with the story's kicker over it
        PLATE_SPEC.label = spec.label || '';
        PLATE_SPEC.sub = spec.location?.place || spec.sub || '';
        PLATE_SPEC.story = !!spec.story;
        if (!PLATE_SPEC.label) {
          PLATE_SPEC.label = PLATE_SPEC.sub;
          PLATE_SPEC.sub = '';
        }
        if (!drawPlate(b, L, PLATE_SPEC, style, ts)) sig = drawIdle(b, L, spec, style, env);
        darkBand(b, L.band, style, soft);
        break;
      }
      // the map renders at the size it had at the cut (worldmap.js keeps buffers per size), and a
      // slow camera move resamples it instead of asking for a new size every frame.
      // In singles (wall text at 2x) it renders at half size and is shown at exactly 2x, like the
      // rest of the wall's content there. Elsewhere a wall bigger than the locator's own size
      // (two-shot, over-the-shoulder) gets the locator as a framed inset of about that size, centred:
      // drawWorldMap's cost is per pixel (about 0.7 ms per frame at 104x63 while it flies in).
      if (!spec._mapWH) {
        // the locator fills the wall, never an inset box: at the wall's own size up to 1.4x its
        // designed area (the two-shot, at 1x like the rest of its wall), else rendered at half size and
        // shown at exactly 2x (singles, where the wall's text is 2x too; over-the-shoulder)
        const sc = m.w >= 120 && (env.ts > 1 || m.w * m.h > MAP_MAX_AREA * 1.4) ? 2 : 1;
        const area = (m.w / sc) * (m.h / sc);
        spec._mapFit = area > MAP_MAX_AREA * 1.4 ? Math.sqrt(MAP_MAX_AREA / area) : 1;
        spec._mapSc = sc;
        spec._mapWH = [Math.max(8, Math.ceil((m.w * spec._mapFit) / sc)), Math.max(8, Math.ceil((m.h * spec._mapFit) / sc))];
      }
      if (spec._mapFit < 1) {
        // snapped to the rendered size when within a pixel (an exact copy, no dropped column)
        let nw = Math.round(m.w * spec._mapFit), nh = Math.round(m.h * spec._mapFit);
        if (Math.abs(nw - spec._mapWH[0]) <= 1) nw = spec._mapWH[0];
        if (Math.abs(nh - spec._mapWH[1]) <= 1) nh = spec._mapWH[1];
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
        const mdt = env.lod >= 1 ? end : Math.min(dt, end);
        if (drawMiniMap(SUB, spec, style, env.t, mdt)) spec._mapDone = mdt >= end;
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
      if (!drawPlate(b, L, spec, style, ts)) sig = drawIdle(b, L, spec, style, env);
      darkBand(b, L.band, style, soft);
      break;
    default:
      sig = drawIdle(b, L, spec, style, env);
      darkBand(b, L.band, style, soft);
  }
  return sig;
}

const PLATE_SPEC = { label: '', sub: '', story: false };

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
      // larger than in the wide (two-shot, singles): one ramp step darker, and in singles a smaller
      // planet (its ring about the head's width) in the far part of the free side, away from the head
      // one ramp step darker at every size (cosmos.md: "so it never competes with faces"; the bible's
      // tan bands, L* 61, were brighter than Nova's face, L* 56, in the wide)
      const dim = true;
      const R = Math.max(5, Math.round((ts > 1 ? 8.5 : 12) * cs));
      for (const s of STARS) {
        const x = Math.round(s.u * env.k), y = Math.round(s.v * env.k);
        if (soft && s.c === 'steel') continue;
        plot(b, x, y, soft ? C[DARKER[s.c]] : C[s.c]);
      }
      const box = pickBox(L, 4.2 * R, 2.6 * R, ts > 1);
      let cx = (box.x0 + box.x1) / 2 + R * 0.2;
      if (L.heads && ts > 1) {
        // the far third of the box from the head, the ring kept inside it
        const away = L.headCx < (box.x0 + box.x1) / 2 ? 1 : -1;
        cx = Math.max(box.x0 + 2.1 * R, Math.min(box.x1 - 2.1 * R, cx + away * bw(box) * 0.18));
      }
      const cy = box.y0 + Math.max(R + 3, Math.min(bh(box) * 0.45, bh(box) - R - 3));
      const az = env.lod >= 2 ? env.frozenAz : planetAzimuth(env.t);
      return drawPlanet(b, cx, cy, R, az, dim);
    }
    case 'wordmark': {
      // the Bayer falloff in the wall's top 12 px (money-minute.md), into the field from the colour
      // under the bezel; the wordmark starts 2 px below it, so no checker touches a letter
      // (ending above the highest head top: no value step beside a head)
      const fall = Math.max(0, Math.min(Math.round(12 * cs), Math.floor(L.headTop)));
      topFalloff(b, C[style.wallTop || 'slate'], fall);
      const text = 'MONEY MINUTE';
      const ws = ts > 1 && !fitsSomewhere(L, textWidth(text, 'body', ts) + 4, 14 * ts) ? 1 : ts;
      const tw = textWidth(text, 'body', ws), th = capHeight('body', ws);
      const box = pickBox(L, tw + 4, th + 8 * ws, false);
      const cx = Math.round((box.x0 + box.x1) / 2);
      const top = Math.max(fall + 2, Math.round(box.y0 + Math.max(3 * ws, (bh(box) - th - 6 * ws) * 0.4)));
      stampText(b.px, b.w, b.h, text, cx, top, C.fog, 'body', ws, 'center');
      rect(b, cx - 8 * ws, top + th + 4 * ws, cx + 8 * ws, top + th + 5 * ws, C.darkGreen);
      return 0;
    }
    case 'dial': {
      // the free box that holds the largest dial (the wide: the third beside Sam's head, r 14, not
      // the short band above it)
      let box = L.full;
      if (L.heads) {
        let best = -1;
        for (const bx of [L.top, L.left, L.right]) {
          const m = Math.min(bw(bx), bh(bx));
          if (m > best) {
            best = m;
            box = bx;
          }
        }
      }
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
    // settled: one last frame, then still. Under load (lod ≥ 1, the watchdog's call) the locator
    // skips its fly-in and shows the settled frame at once: one render instead of ~40
    if (!(dt < end) || env.lod >= 1) return -1;
    // the locator re-renders at 15 fps: drawWorldMap plus the canvas read-back costs
    // 1.5-2.5 ms of CPU a render, and on a dimmed 104 px wall (or a half-size one shown at 2x) the
    // fly-in's eased zoom moves about a pixel per render; the settled frame is then kept
    const rate = 15;
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

const IN = { mode: 'idle', image: null, location: null, figure: null, label: '', sub: '', phase: 'intro', focus: '', solo: false, since: 0, story: false };

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
  // a picture, map or figure keeps the story's kicker and source: its plate when a head leaves it no room
  IN.label = mode === 'idle' ? '' : String(r.label || (mode === 'plate' && loc && !hasLoc ? loc.place : '') || '');
  IN.sub = mode === 'idle' ? '' : String(r.sub || '');
  IN.phase = r.phase === 'outro' ? 'outro' : 'intro';
  IN.focus = r.focus || '';
  IN.solo = r.solo ?? style.solo;
  IN.since = Number.isFinite(r.since) ? r.since : NaN;
  IN.story = !!r.story;
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
    a.story === b.story &&
    (a.mode !== 'map' || Number.isNaN(b.since) || a.since === b.since)
  );
}
const sameLoc = (a, b) => a === b || (!!a && !!b && a.lat === b.lat && a.lon === b.lon && a.place === b.place);
const sameFig = (a, b) => a === b || (!!a && !!b && typeof a === 'object' && typeof b === 'object' && a.value === b.value && a.label === b.label && (a.pre || '') === (b.pre || ''));

function copySpec(src, t) {
  return {
    mode: src.mode,
    image: src.image,
    location: src.location ? { lat: Number(src.location.lat), lon: Number(src.location.lon), place: src.location.place || '' } : null,
    figure: src.figure && typeof src.figure === 'object' ? { value: src.figure.value, label: src.figure.label, pre: src.figure.pre || src.figure.qualifier || '' } : src.figure,
    label: src.label,
    sub: src.sub,
    phase: src.phase,
    focus: src.focus,
    solo: src.solo,
    since: Number.isNaN(src.since) ? t : src.since,
    story: src.story,
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
    if (S.shown) S.shown._lay = S.shown._mapWH = S.shown._mapDone = S.shown._picWH = null;
    if (S.next) S.next._lay = S.next._mapWH = S.next._mapDone = S.next._picWH = null;
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

/** The wall buffer's size in px for a camera, exactly as set.js wallRect rounds it. */
const WSIZE = { w: 0, h: 0 };
function wallSize(cam, k) {
  const S = SET.screen;
  WSIZE.w = Math.round(sxOf(cam, k, S.x1)) - Math.round(sxOf(cam, k, S.x0));
  WSIZE.h = Math.round(syOf(cam, k, S.y1)) - Math.round(syOf(cam, k, S.y0));
  return WSIZE;
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

/**
 * The wall's warm-up as small tasks (set.js warmStep): the land mask, the globe and planet tables of
 * the sizes the framings use, and the idle text masks.
 */
export function wallWarmTasks() {
  const tasks = [() => landMask()];
  for (const R of [23, 24, 30, 34]) tasks.push(() => globeTable(R));
  for (const R of [12, 13]) tasks.push(() => (planetTable(R), ringTable(R, true)));
  for (const R of [18, 19, 20, 21, 23]) tasks.push(() => (planetTable(R), ringTable(R, true)));
  // the picture palettes' nearest-colour tables, 20 L* rows per task (a first picture then pays no search)
  for (const id of ['', ...Object.keys(PICTURE_DROP)]) {
    for (let l0 = 0; l0 < LUT_L; l0 += 20) tasks.push(() => prefillLut(picturePalette(id), l0, Math.min(LUT_L, l0 + 20)));
  }
  // one dry run of the picture filter and mapper (the first real picture then runs optimised code)
  tasks.push(() => {
    const src = { w: 32, h: 18, u32: new Uint32Array(32 * 18).fill(0xff8a6a4a), id: -1 };
    for (let i = 0; i < src.u32.length; i += 3) src.u32[i] = 0xff20304a;
    filterPicture(src, 16, 9);
    for (const id of ['', ...Object.keys(PICTURE_DROP)]) mapPicture(WARM_PIC, 16 * 9, 43, picturePalette(id));
  });
  tasks.push(() => {
    for (const s of [1, 2]) {
      textWidth('MONEY MINUTE', 'body', s);
      stampText(WARM_PX, 1, 1, 'MONEY MINUTE', 0, 0, 0, 'body', s);
      stampText(WARM_PX, 1, 1, '60', 0, 0, 0, 'body', s);
    }
  });
  return tasks;
}
/** The whole wall warm-up at once. */
export function warmWall() {
  for (const fn of wallWarmTasks()) fn();
}
const WARM_PX = new Uint32Array(1);
const WARM_PIC = new Uint32Array(16 * 9);

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

const FROM = { wall: null, img: null, seg: null, shots: null, kicker: null, framing: null, styleId: null, phase: '', focus: '', solo: undefined, out: null };

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
 *   - a story: the picture (scene.images.get(storyId)) when it has one; a NUMBER OF THE DAY item's
 *     figure (seg.numbers[0]) unless the plan already shows it on a card; else per programme the
 *     locator map (seg.location), the figure (seg.numbers[0] / seg.fact) or the kicker plate;
 *   - MONEY MINUTE's MCU-R (scene.framing 'mcu-r'): the figure panel, unless the story's plan
 *     already shows the figure on a card (then the kicker plate), money-minute.md §3.5;
 *   - a new-style scene.wall ({ mode: 'idle'|'picture'|'map'|'figure'|'plate', ... }) passes through.
 * The plate carries what the strap below it does not: the kicker (the bibles' "kicker plate") over
 * the story's PLACE, never the source (the strap's tag and the ticker show the outlet already), and a
 * story's plate is set in body 1x (`story: true`). The current segment is read from
 * scene.segPlan.ctx.seg (INTEGRATION) when it is the story on air.
 */
export function wallFromScene(scene, styleIn) {
  const style = resolveStyle(styleIn ?? scene?.program?.id);
  const w = scene?.wall || null;
  const sid = scene?.storyId ?? w?.storyId ?? null;
  const ctxSeg = scene?.segPlan?.ctx?.seg || null;
  const seg = ctxSeg && (ctxSeg.type !== 'story' || sid == null || ctxSeg.storyId === sid) ? ctxSeg : null;
  const img = sid != null ? scene.images?.get?.(sid) || null : null;
  // the segment on air first (at a story's first cut the strap may still hold the last story's tag)
  const kicker = seg?.kicker || scene?.lowerThird?.kicker || null;
  const type = seg?.type || (w?.mode === 'logo' || w?.mode === 'rundown' ? 'idle' : 'story');
  const phase = type === 'outro' || w?.phase === 'outro' ? 'outro' : 'intro';
  const focus = scene?.focus || '';
  const solo = scene?.cast ? !scene.cast.B : undefined;
  const framing = scene?.framing || null;
  const shots = scene?.segPlan?.ctx?.shots || null;
  const F2 = FROM;
  if (F2.out && F2.wall === w && F2.img === img && F2.seg === seg && F2.shots === shots && F2.kicker === kicker && F2.framing === framing && F2.styleId === style.id && F2.phase === phase && F2.focus === focus && F2.solo === solo) return F2.out;
  let out;
  const mode = w?.mode;
  // the story's plate (what a picture, map or figure falls back to when it cannot show): the kicker
  // over the place; the source only when the story has neither (world-now.md: "the source card")
  const label0 = kicker || (w?.category && KICKER_CATS[w.category] !== undefined ? KICKER_CATS[w.category] : w?.category || seg?.category || '') || '';
  const place = String(seg?.location?.place || '').trim();
  const source0 = w?.source || seg?.source || '';
  const plate = { mode: 'plate', label: label0 || place || source0, sub: label0 ? place : '', story: true };
  if (mode === 'idle' || mode === 'picture' || mode === 'map' || mode === 'figure' || mode === 'plate') {
    out = { ...w };
    if (mode === 'picture' && !out.image) out.image = img;
  } else if (mode === 'logo' || mode === 'rundown' || type === 'intro' || type === 'outro' || type === 'chat' || type === 'idle' || (!mode && !seg)) {
    out = { mode: 'idle' };
  } else {
    const loc = seg?.location;
    const fig = figureOf(seg?.numbers?.[0]) || seg?.fact || null;
    const carded = (shots || []).some((s) => s.shot === 'fact');
    const numberOfDay = /NUMBER OF THE DAY/i.test(label0);
    if (style.id === 'money-minute' && framing === 'mcu-r') {
      out = fig && !carded ? { mode: 'figure', figure: fig } : plate;
    } else {
      out = null;
      const order = STORY_WALL[style.id] || STORY_WALL.default;
      for (const m of numberOfDay && !carded ? ['picture', 'figure', ...order] : order) {
        if (m === 'picture' && img && (mode === 'image' || mode === 'picture' || !mode)) out = { mode: 'picture', image: img };
        else if (m === 'map' && loc && Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lon))) out = { mode: 'map', location: loc };
        else if (m === 'figure' && fig) out = { mode: 'figure', figure: fig };
        else if (m === 'plate' && (plate.label || plate.sub)) out = plate;
        if (out) break;
      }
      if (!out) out = { mode: 'idle' };
    }
    out.story = true;
  }
  // every field, every time: INTEGRATION keeps one wall object and Object.assign()s this into it per
  // cut, so a field left out would carry the previous story's kicker, image or place into this one
  out.image = out.mode === 'picture' ? out.image || null : null;
  out.location = out.mode === 'map' ? out.location || null : null;
  out.figure = out.mode === 'figure' ? out.figure ?? null : null;
  if (out.mode === 'idle') out.label = out.sub = '';
  else if (out.mode !== 'plate') {
    out.label = out.label || plate.label;
    out.sub = out.sub || plate.sub;
  } else {
    out.label = out.label || '';
    out.sub = out.sub || '';
  }
  out.story = !!out.story;
  out.phase = phase;
  out.focus = focus;
  out.solo = solo;
  if (w && Number.isFinite(w.since)) out.since = w.since;
  Object.assign(F2, { wall: w, img, seg, shots, kicker, framing, styleId: style.id, phase, focus, solo, out });
  return out;
}

/** A seg.numbers entry as a wall figure: the qualifier ("ABOUT", "MORE THAN") rides above the value. */
function figureOf(n) {
  if (!n || typeof n !== 'object') return n || null;
  const value = String(n.value ?? '').trim();
  if (!value) return null;
  return { value, label: String(n.label ?? '').trim(), pre: String(n.qualifier ?? '').trim() };
}
