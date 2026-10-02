// The GLOBIT 24 studio set as 2.5D depth layers seen through a virtual
// camera (owner: STUDIO SET stream). Geometry and projection: geometry.js;
// per-programme dressing and light: styles.js; wall content: wall.js;
// cameras: ../camera.js.
//
//   drawBackground(fr, cam, t, { style, wall, cut, shotSince, lod } = {})
//   drawDesk(fr, cam, clipRows, accentOrStyle)
//   wallRect(cam), wallFromScene(scene, style), setCacheEnabled(on), bgStats(), warmSet(id)
// The old forms drawBackground(frame, cam, t) / drawDesk(frame, cam, clipRows, C.red)
// stay valid (public/lab/cast.html): they draw the current style (home look).
//
// Following docs/ART_DIRECTION.md and the programme bibles: one hero screen
// (centre, dimmed and cool), a calm wall with one soft light pool from above
// behind each head, sides falling off to black, one symmetric pair of static
// practicals, brand red only as flat blocks (desk plate, one LED line), dark
// glossy floor, Bayer 4x4 only on light falloff, every pixel a palette colour.
//
// How it stays inside the budget (PLAN §5: ≤ 1.0 ms uncached in any framing,
// ≤ 0.1 ms on a cache hit): the light of the back wall is BAKED once per
// style into a texture of ramp positions (1 texel = 1 world unit), and each
// frame every visible wall pixel is one texture read and one Bayer compare,
// with the dither anchored to the layer's whole-pixel offset so a camera
// truck never makes it crawl. Hard edges (flats, practicals, seams, bezel)
// are drawn as integer spans on top. The finished background (and the desk
// over it) is cached and reused while the camera, the style and the wall
// state stay the same.
import { C } from '../pixbuf.js';
import { drawLogo, measureLogo } from '../../../logo.js';
import { F, SET, kAt, sxOf, syOf } from './geometry.js';
import { resolveStyle, styleFor, setStyle, currentStyle } from './styles.js';
import { updateWall, drawWallContent, wallFromScene, wallVersionOf } from './wall.js';

export { SET, setStyle, styleFor, wallFromScene, drawWallContent };

const W = 384, H = 216;
// Bayer 4x4 as integers 0..15 (the same matrix as pixbuf.js): a pixel takes the upper
// colour of a pair when its 0..15 fraction is greater than the threshold.
const B16 = Uint8Array.from([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]);

// ---------------------------------------------------------------------------
// Layer helpers (integer edges: shared edges never gap)

function layerRect(fr, cam, Z, X0, Y0, X1, Y1, c) {
  const k = kAt(cam, Z);
  const x0 = Math.round(sxOf(cam, k, X0)), x1 = Math.round(sxOf(cam, k, X1));
  const y0 = Math.round(syOf(cam, k, Y0)), y1 = Math.round(syOf(cam, k, Y1));
  fr.span(x0, y0, Math.max(x1, x0 + 1), Math.max(y1, y0 + 1), c);
}

/** Thin vertical line on a layer: 1 px until the layer is zoomed past ~2x, then wider. */
function layerVLine(fr, cam, Z, X, Y0, Y1, c, w = 1) {
  const k = kAt(cam, Z);
  const px = Math.max(1, Math.floor(w * k + 0.25));
  const x = Math.round(sxOf(cam, k, X) - px / 2);
  fr.span(x, Math.round(syOf(cam, k, Y0)), x + px, Math.round(syOf(cam, k, Y1)), c);
}

function layerHLine(fr, cam, Z, X0, X1, Y, c, w = 1) {
  const k = kAt(cam, Z);
  const px = Math.max(1, Math.floor(w * k + 0.25));
  const y = Math.round(syOf(cam, k, Y) - px / 2);
  fr.span(Math.round(sxOf(cam, k, X0)), y, Math.round(sxOf(cam, k, X1)), y + px, c);
}

// ---------------------------------------------------------------------------
// Baked back-wall light (one texture per style), rendered by inverse mapping

const TX0 = -450, TY0 = -360, TW = 900, TH = 420; // texture domain in back-wall world units
const RAMP = ['black', 'ink', 'slate', 'steel', 'fog', 'silver'];
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const poolLight = (p, X, Y) => {
  const dx = (X - p.X) / p.rx, dy = (Y - p.Y) / p.ry;
  const d = dx * dx + dy * dy;
  return d >= 1 ? 0 : p.amount * (1 - d) * (1 - d * 0.35);
};

const BAKED = new Map();

/** Bake (once per style) the wall light: texel = pair * 16 + fraction (Bayer share of the pair's upper colour). */
function bakeWall(style) {
  let b = BAKED.get(style.bakeKey);
  if (b) return b;
  const lo = new Uint32Array(16), hi = new Uint32Array(16);
  for (let i = 0; i < RAMP.length - 1; i++) {
    lo[i] = C[RAMP[i]];
    hi[i] = C[RAMP[i + 1]];
  }
  const tex = new Uint8Array(TW * TH);
  const S = SET.screen;
  const cove = style.cove;
  for (let ty = 0; ty < TH; ty++) {
    const Y = TY0 + ty + 0.5;
    for (let tx = 0; tx < TW; tx++) {
      const X = TX0 + tx + 0.5;
      let pos = style.base;
      if (cove) pos += (cove.slate - style.base) * smooth((Y - cove.y0) / (cove.y1 - cove.y0));
      let pool = 0;
      for (const p of style.pools) pool += poolLight(p, X, Y);
      pos += pool;
      // the wall's own cool spill around the bezel
      if (style.glow > 0) {
        const ex = Math.max(S.x0 - X, X - S.x1, 0), ey = Math.max(S.y0 - Y, Y - S.y1, 0);
        const d = Math.hypot(ex, ey);
        if (d < 26) pos += style.glow * (1 - d / 26) * (1 - d / 26);
      }
      if (style.poolMax !== undefined && pos > style.poolMax) pos = style.poolMax;
      // ceiling: black above y ~10 in the wide
      const tp = style.top;
      if (Y < tp.y1) pos += (tp.to - pos) * smooth((tp.y1 - Y) / (tp.y1 - tp.y0));
      // sides fall off to black
      const ax = Math.abs(X), sd = style.sides;
      if (ax > sd.x0) pos *= 1 - smooth((ax - sd.x0) / (sd.x1 - sd.x0));
      if (pos < 0) pos = 0;
      if (pos > RAMP.length - 1.01) pos = RAMP.length - 1.01;
      const q = Math.round(pos * 16);
      tex[ty * TW + tx] = ((q >> 4) << 4) | (q & 15);
    }
  }
  b = { tex, lo, hi };
  BAKED.set(style.bakeKey, b);
  return b;
}

/** Bake a programme's set ahead of its first frame (call it when an episode arrives). */
export function warmSet(id) {
  bakeWall(resolveStyle(id));
}

const COL = new Int32Array(W);
const THR = new Uint8Array(4);

/** Render the baked wall light into rows [ya, yb), skipping the screen rectangle [sx0, sx1) x [sy0, sy1). */
function renderWall(fr, cam, baked, sx0, sy0, sx1, sy1) {
  const k = kAt(cam, SET.wallZ);
  const inv = 1 / k;
  const ox = Math.round(sxOf(cam, k, 0)), oy = Math.round(syOf(cam, k, 0));
  for (let x = 0; x < W; x++) {
    let tx = Math.floor(cam.x + (x + 0.5 - 192) * inv - TX0);
    COL[x] = tx < 0 ? 0 : tx >= TW ? TW - 1 : tx;
  }
  const { tex, lo, hi } = baked;
  const px = fr.px;
  for (let y = 0; y < H; y++) {
    let ty = Math.floor(cam.y + (y + 0.5 - cam.hy) * inv - TY0);
    ty = ty < 0 ? 0 : ty >= TH ? TH - 1 : ty;
    const rb = ty * TW;
    const br = ((y - oy) & 3) << 2;
    THR[0] = B16[br];
    THR[1] = B16[br + 1];
    THR[2] = B16[br + 2];
    THR[3] = B16[br + 3];
    const skip = y >= sy0 && y < sy1;
    const xa = skip ? Math.max(0, Math.min(W, sx0)) : W;
    const xb = skip ? Math.max(0, Math.min(W, sx1)) : W;
    let i = y * W;
    for (let x = 0; x < xa; x++, i++) {
      const v = tex[rb + COL[x]];
      px[i] = (v & 15) > THR[(x - ox) & 3] ? hi[v >> 4] : lo[v >> 4];
    }
    i = y * W + xb;
    for (let x = xb; x < W; x++, i++) {
      const v = tex[rb + COL[x]];
      px[i] = (v & 15) > THR[(x - ox) & 3] ? hi[v >> 4] : lo[v >> 4];
    }
  }
}

// ---------------------------------------------------------------------------
// Background cache

const CACHE = {
  on: true,
  bg: new Uint32Array(W * H),
  bgKey: new Float64Array(10).fill(NaN),
  desk: new Uint32Array(W * H),
  deskKey: new Float64Array(12).fill(NaN),
  deskClip: new Int16Array(W),
  hits: 0,
  misses: 0,
  lastMs: 0,
  // the last background drawn (for drawDesk's default style and its cache key)
  style: null,
  frame: null,
  deskReady: false,
  serial: 0,
};
const STYLE_SERIAL = new WeakMap();
let styleCounter = 1;
const serialOf = (s) => {
  let n = STYLE_SERIAL.get(s);
  if (!n) STYLE_SERIAL.set(s, (n = styleCounter++));
  return n;
};

/** Turn the background cache on or off (labs measure the uncached worst case with it off). */
export function setCacheEnabled(on) {
  CACHE.on = !!on;
  CACHE.bgKey.fill(NaN);
  CACHE.deskKey.fill(NaN);
}
/** Cache counters for labs and the INTEGRATION watchdog. */
export function bgStats() {
  return { hits: CACHE.hits, misses: CACHE.misses, enabled: CACHE.on };
}
/** Forget the cached frames (e.g. after an external change of shared images). */
export function invalidateSet() {
  CACHE.bgKey.fill(NaN);
  CACHE.deskKey.fill(NaN);
}

const KEY = new Float64Array(10);
function fillKey(cam, sSerial, wallVer, lod) {
  KEY[0] = cam.x;
  KEY[1] = cam.y;
  KEY[2] = cam.z;
  KEY[3] = cam.zoom;
  KEY[4] = cam.hy;
  KEY[5] = cam.soft > 0.5 ? 1 : 0;
  KEY[6] = sSerial;
  KEY[7] = wallVer;
  KEY[8] = lod;
  KEY[9] = 0;
}
const sameKey = (a, b, n) => {
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false;
  return true;
};

// ---------------------------------------------------------------------------
// Background: back wall, video wall, set flats, practicals, floor

const NO_OPTS = {};

export function drawBackground(fr, cam, t, opts = NO_OPTS) {
  const style = resolveStyle(opts.style);
  const lod = opts.lod | 0;
  const soft = cam.soft > 0.5;
  CACHE.style = style;
  const sSerial = serialOf(style);
  // the wall content first: its version says whether its pixels changed this frame
  const r = wallRect(cam, RECT);
  const wall = updateWall(opts.wall, style, r.x1 - r.x0, r.y1 - r.y0, r.k, t, cam, opts, lod);
  fillKey(cam, sSerial, wall.version, lod);
  CACHE.frame = fr;
  if (CACHE.on && sameKey(KEY, CACHE.bgKey, 10)) {
    fr.px.set(CACHE.bg);
    CACHE.hits++;
    CACHE.deskReady = true;
    return;
  }
  CACHE.misses++;

  const baked = bakeWall(style);
  const kw = r.k;
  const b = Math.max(1, Math.round(2 * kw));
  renderWall(fr, cam, baked, r.x0 - b - 1, r.y0 - b - 1, r.x1 + b + 1, r.y1 + b + 1);
  if (style.tints) tintPools(fr, cam, style);
  if (!soft) drawWallDetails(fr, cam, style);
  drawScreen(fr, r, b, style, soft, wall);
  drawFlats(fr, cam, style, soft);
  drawFloor(fr, cam, style);
  if (CACHE.on) {
    CACHE.bg.set(fr.px);
    CACHE.bgKey.set(KEY);
  }
  CACHE.deskReady = CACHE.on;
}

/**
 * Scenery tint inside the style's tint pools: a palette swap (ink → maroon, slate → brown...)
 * with Bayer coverage following the pool's falloff, in screen space with the wall's dither
 * anchor, so the warmth rises with the light instead of drawing hard edges.
 */
const TINT_FROM = new Uint32Array(4), TINT_TO = new Uint32Array(4);
function tintPools(fr, cam, style) {
  let n = 0;
  for (const [from, to] of Object.entries(style.tints)) {
    if (n >= 4) break;
    TINT_FROM[n] = C[from];
    TINT_TO[n++] = C[to];
  }
  const k = kAt(cam, SET.wallZ);
  const ox = Math.round(sxOf(cam, k, 0)), oy = Math.round(syOf(cam, k, 0));
  const px = fr.px;
  for (const p of style.tintPools) {
    const cx = sxOf(cam, k, p.X), cy = syOf(cam, k, p.Y), rx = p.rx * k, ry = p.ry * k;
    const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(W, Math.ceil(cx + rx));
    const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(H, Math.ceil(cy + ry));
    for (let y = y0; y < y1; y++) {
      const dy = (y + 0.5 - cy) / ry;
      const br = ((y - oy) & 3) << 2;
      for (let x = x0; x < x1; x++) {
        const dx = (x + 0.5 - cx) / rx;
        const d = dx * dx + dy * dy;
        if (d >= 1) continue;
        const q = Math.round(p.amount * (1 - d) * (1 - d * 0.35) * 16);
        if (q <= B16[br + ((x - ox) & 3)]) continue;
        const i = y * W + x, c = px[i];
        for (let j = 0; j < n; j++) {
          if (c === TINT_FROM[j]) {
            px[i] = TINT_TO[j];
            break;
          }
        }
      }
    }
  }
}

/** Seams and the one static ceiling line (in focus only). */
function drawWallDetails(fr, cam, style) {
  const Zw = SET.wallZ;
  // y 0-10: dark ceiling with one static grid line (ART_DIRECTION bands)
  layerHLine(fr, cam, Zw, -2000, 2000, -128, style.id === 'cosmos' || style.id === 'news-60' ? C.ink : C.slate);
  if (style.seams) {
    // matte panel seams, only on the outer panels (never within 6 px of a head in any framing)
    for (const X of [-322, -230, 230, 322]) layerVLine(fr, cam, Zw, X, -128, SET.floorY, C.black);
  }
  if (style.practical === 'softbox') {
    // one static steel softbox edge per side (x ≈ 40 and 344 in the wide, y 20-110)
    for (const sx of [-1, 1]) {
      const X = sx * 213;
      layerVLine(fr, cam, Zw, X + sx * 2.4, -104, 21, C.ink, 1.4);
      layerVLine(fr, cam, Zw, X, -104, 21, C.steel, 2.8);
    }
  } else if (style.practical === 'warm') {
    // the warm pair: small sconces with a cream lit face, pools baked as the tint
    for (const sx of [-1, 1]) {
      const X = sx * 196;
      layerRect(fr, cam, Zw, X - 4.2, -78, X + 4.2, -50, C.brown);
      layerRect(fr, cam, Zw, X - 2.8, -76.6, X + 2.8, -51.4, C.tanShade);
      layerRect(fr, cam, Zw, X - 1.4, -75.2, X + 1.4, -54.2, C.cream);
    }
  }
}

function drawScreen(fr, r, b, style, soft, wall) {
  const { x0, y0, x1, y1 } = r;
  const bz = style.bezel;
  fr.span(x0 - b - 1, y0 - b - 1, x1 + b + 1, y1 + b + 1, C.black);
  fr.span(x0 - b, y0 - b, x1 + b, y1 + b, soft ? C[bz.soft] : C[bz.base]);
  if (!soft) {
    // key from camera-left: lit top and left edges, the right and bottom edges in shadow
    fr.span(x0 - b, y1, x1 + b, y1 + b, C.ink);
    fr.span(x1, y0 - b, x1 + b, y1 + b, C.ink);
    fr.span(x0 - b, y0 - b, x0 - b + 1, y1 + b, C[bz.left]);
    fr.span(x0 - b, y0 - b, x1 + b, y0 - b + 1, C[bz.top]);
  }
  blitWall(fr, wall, x0, y0, x1, y1);
}

function blitWall(fr, wall, x0, y0, x1, y1) {
  const w = x1 - x0;
  const buf = wall.buf;
  if (!buf || w <= 0) return;
  const xa = Math.max(0, x0), xb = Math.min(W, x1);
  if (xb <= xa) return;
  const px = fr.px;
  for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) {
    const src = (y - y0) * w + (xa - x0);
    px.set(buf.subarray(src, src + (xb - xa)), y * W + xa);
  }
}

/** Set flats at mid depth with the programme's practicals (static, never blinking). */
function drawFlats(fr, cam, style, soft) {
  if (!style.flats) return;
  const Zf = SET.flatsZ;
  for (const sx of [-1, 1]) {
    const inner = sx * 196, outer = sx * 2000;
    layerRect(fr, cam, Zf, Math.min(inner, outer), -2000, Math.max(inner, outer), SET.floorY, C.black);
    layerVLine(fr, cam, Zf, inner + sx * 2, -400, SET.floorY, C.ink, 2);
    const lx = sx * 214;
    if (style.practical === 'cool') {
      // a tall frosted strip: slate housing, fog core, a silver line when in focus (static, no glow)
      layerRect(fr, cam, Zf, lx - 3, -190, lx + 3, -20, C.slate);
      layerRect(fr, cam, Zf, lx - 1.5, -184, lx + 1.5, -26, soft ? C.steel : C.fog);
      if (!soft) layerVLine(fr, cam, Zf, lx - 0.5, -176, -34, C.silver, 1);
    } else if (style.practical === 'off' || style.practical === 'warm') {
      // the strip is there but unlit
      layerRect(fr, cam, Zf, lx - 3, -190, lx + 3, -20, C.ink);
      layerRect(fr, cam, Zf, lx - 1.5, -184, lx + 1.5, -26, C.black);
    }
  }
}

/** Floor plane (Y = floorY): glossy black, a touch of ink toward the back wall (≤ L* 18). */
function drawFloor(fr, cam, style) {
  const Yf = SET.floorY;
  const px = fr.px;
  const h = (Yf - cam.y) * F * cam.zoom;
  const kw = kAt(cam, SET.wallZ);
  const yWall = Math.round(syOf(cam, kw, Yf));
  const ox = Math.round(sxOf(cam, kw, 0));
  const ink = C.ink, black = C.black;
  for (let y = Math.max(0, yWall); y < H; y++) {
    const dy = y + 0.5 - cam.hy;
    if (dy <= 0) continue;
    const Z = cam.z + h / dy;
    // ink near the wall, black toward the camera (and always black in the graphics zone y ≥ 150)
    const l = y >= 150 ? 0 : Math.max(0, Math.min(1, (Z - 1060) / 420)) * 0.75;
    const q = Math.round(l * 16);
    const row = y * W;
    if (q <= 0) {
      px.fill(black, row, row + W);
      continue;
    }
    const br = (y & 3) << 2;
    for (let x = 0; x < W; x++) px[row + x] = q > B16[br + ((x - ox) & 3)] ? ink : black;
  }
}

// ---------------------------------------------------------------------------
// The wall's interior rectangle on screen

const RECT = { x0: 0, y0: 0, x1: 0, y1: 0, k: 1 };

/** Screen rectangle [x0, x1) x [y0, y1) of the video wall's interior for a camera, and its px per unit. */
export function wallRect(cam, out = { x0: 0, y0: 0, x1: 0, y1: 0, k: 1 }) {
  const k = kAt(cam, SET.wallZ);
  const S = SET.screen;
  out.x0 = Math.round(sxOf(cam, k, S.x0));
  out.x1 = Math.round(sxOf(cam, k, S.x1));
  out.y0 = Math.round(syOf(cam, k, S.y0));
  out.y1 = Math.round(syOf(cam, k, S.y1));
  out.k = k;
  return out;
}

// ---------------------------------------------------------------------------
// Logo plate texture (rendered once by logo.js, blitted at integer scales).
// Needs a DOM canvas: in node (tests) the plate is drawn without the logo.

const LOGO = {};
function logoPixels(scale) {
  if (scale in LOGO) return LOGO[scale];
  let out = null;
  try {
    if (typeof document !== 'undefined') {
      const { w, h } = measureLogo({ variant: 'bug', scale });
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      drawLogo(ctx, 0, 0, { variant: 'bug', scale });
      out = { w, h, data: new Uint32Array(ctx.getImageData(0, 0, w, h).data.buffer.slice(0)) };
    }
  } catch {
    out = null;
  }
  LOGO[scale] = out;
  return out;
}

function blitLogo(fr, cx, cy, scale) {
  const L = logoPixels(scale);
  if (!L) return;
  const x0 = Math.round(cx - L.w / 2), y0 = Math.round(cy - L.h / 2);
  for (let j = 0; j < L.h; j++) {
    const y = y0 + j;
    if (y < 0 || y >= fr.h) continue;
    for (let i = 0; i < L.w; i++) {
      const x = x0 + i;
      if (x < 0 || x >= fr.w) continue;
      const c = L.data[j * L.w + i];
      if (c >>> 24 > 128) fr.px[y * fr.w + x] = c;
    }
  }
}

// ---------------------------------------------------------------------------
// Desk: curved in plan, tessellated in perspective, logo plate and one LED line

const DESK_N = 96;
const DFX = new Float32Array(DESK_N + 1), DFT = new Float32Array(DESK_N + 1), DFB = new Float32Array(DESK_N + 1);
const DBX = new Float32Array(DESK_N + 1), DBT = new Float32Array(DESK_N + 1);
const DNX = new Float32Array(DESK_N + 1);

function interpCol(xs, ys, n, x) {
  if (x < xs[0] || x > xs[n]) return NaN;
  let lo = 0, hi = n;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid;
  }
  const u = (x - xs[lo]) / Math.max(1e-6, xs[hi] - xs[lo]);
  return ys[lo] + (ys[hi] - ys[lo]) * u;
}

// Front panel layout in world units below the desk top (Y = 0 .. deskH)
const LED_Y = 4; // the accent line, right under the fascia
const PLATE_Y0 = 9, PLATE_Y1 = 25, PLATE_HW = 26;
const PANEL_SPLIT = 34; // the front panel's upper colour down to here, its lower colour below (a shadow line)
const REFLECT = { red: 'maroon', cyan: 'navy', magenta: 'purple', yellow: 'brown', darkGreen: null };

/** Draw the desk; fills clipRows (Int16Array W) with the desk top's back edge per column. */
export function drawDesk(fr, cam, clipRows, accent) {
  // 4th argument: a u32 LED colour (legacy), a style or programme id, or nothing (the background's style)
  let style = CACHE.style || currentStyle();
  let led;
  if (typeof accent === 'number') led = accent >>> 0;
  else {
    if (accent) style = resolveStyle(accent);
    led = style.deskLine;
  }
  // the composite cache is only valid right after drawBackground on the same frame
  const deskKeyOk = CACHE.on && CACHE.deskReady && CACHE.frame === fr && sameKey(KEY, CACHE.bgKey, 10);
  CACHE.deskReady = false;
  if (deskKeyOk) {
    // the background under the desk is the cached one: reuse the composite when nothing changed
    let same = true;
    for (let i = 0; i < 10; i++) if (CACHE.deskKey[i] !== KEY[i]) same = false;
    if (same && CACHE.deskKey[10] === led && CACHE.deskKey[11] === serialOf(style)) {
      fr.px.set(CACHE.desk);
      clipRows.set(CACHE.deskClip);
      return;
    }
  }
  rasterDesk(fr, cam, clipRows, led, style);
  if (deskKeyOk) {
    CACHE.desk.set(fr.px);
    CACHE.deskClip.set(clipRows);
    CACHE.deskKey.set(KEY);
    CACHE.deskKey[10] = led;
    CACHE.deskKey[11] = serialOf(style);
  }
}

function rasterDesk(fr, cam, clipRows, led, style) {
  const D = SET;
  for (let i = 0; i <= DESK_N; i++) {
    const X = -D.deskHW + (2 * D.deskHW * i) / DESK_N;
    const u = X / D.deskHW;
    const Zf = D.deskFrontZ + D.deskCurve * u * u;
    const Zb = Zf + D.deskDepth;
    const kf = kAt(cam, Zf), kb = kAt(cam, Zb);
    DFX[i] = sxOf(cam, kf, X);
    DFT[i] = syOf(cam, kf, 0);
    DFB[i] = syOf(cam, kf, D.deskH);
    DBX[i] = sxOf(cam, kb, X);
    DBT[i] = syOf(cam, kb, 0);
    DNX[i] = (2 * D.deskCurve * u) / D.deskHW; // dZ/dX: how much the panel turns away
  }
  clipRows.fill(fr.h);
  const px = fr.px;
  const kc = kAt(cam, D.deskFrontZ);
  const topC = C[style.deskTop] || C.slate;
  const tech = style.deskTop === 'steel';
  // the front panel: ink over a darker lower band (TECH BYTES' plinth: slate over ink)
  const panelHi = tech ? C.slate : C.ink, panelLo = tech ? C.ink : C.black;
  const refName = REFLECT[nameOfLed(led)];
  const refC = refName ? C[refName] : 0;
  for (let x = 0; x < fr.w; x++) {
    const cx = x + 0.5;
    const yb = interpCol(DBX, DBT, DESK_N, cx);
    const yt = interpCol(DFX, DFT, DESK_N, cx);
    const ybot = interpCol(DFX, DFB, DESK_N, cx);
    if (Number.isNaN(yt)) {
      if (!Number.isNaN(yb)) clipRows[x] = Math.max(0, Math.round(yb)); // beyond the front curve, over the top surface
      continue;
    }
    const top0 = Number.isNaN(yb) ? Math.round(yt) : Math.round(Math.min(yb, yt));
    const top1 = Math.round(yt);
    const bot = Math.round(ybot);
    clipRows[x] = Math.max(0, top0);
    // the curved ends fall off toward black (2D Bayer, like the wall's sides)
    const turn = Math.abs(interpCol(DFX, DNX, DESK_N, cx));
    const fall = Math.max(0, Math.min(1, (turn - 0.18) / 0.45));
    const fallQ = Math.round(fall * 16);
    const kz = (ybot - yt) / D.deskH;
    // the LED line and the silver edge are exactly 1 px per column, wherever the curve puts them
    const ledRow = Math.round(yt + LED_Y * kz);
    const ya = Math.max(0, top0), yz = Math.min(fr.h, bot);
    for (let y = ya; y < yz; y++) {
      let c;
      const bq = B16[((y & 3) << 2) | (x & 3)];
      if (y < top1) c = topC; // desk top surface
      else if (y === top1) c = fall > 0.6 ? C.steel : C.silver; // 1 px silver highlight on the front edge
      else if (y === ledRow) c = led;
      else {
        // matte panels are flat colour with seams (ART_DIRECTION): fascia, front panel, kick plate
        const Yp = (y + 0.5 - yt) / kz; // world Y of this row on the panel
        if (Yp < LED_Y) c = C.slate; // a slim fascia under the edge
        else if (Yp > D.deskH - 8) c = C.black; // kick plate
        else c = Yp < PANEL_SPLIT ? panelHi : panelLo;
      }
      if (fallQ > bq && c !== led && c !== C.silver) c = c === topC || c === C.slate ? C.ink : C.black;
      px[y * fr.w + x] = c;
    }
    // floor reflection of the LED line (a darker palette step, ≤ 30 %)
    if (refC) {
      const ry = Math.round(ybot + (D.deskH - LED_Y) * kz * 0.9);
      if (ry >= 0 && ry < fr.h && ry < 150) px[ry * fr.w + x] = refC; // never inside the graphics zone
    }
  }
  // logo plate: a flat red block centred on the front, logo at the nearest integer scale
  const pX0 = 192 + (-PLATE_HW - cam.x) * kc, pX1 = 192 + (PLATE_HW - cam.x) * kc;
  const pY0 = syOf(cam, kc, PLATE_Y0), pY1 = syOf(cam, kc, PLATE_Y1);
  const ix0 = Math.round(pX0), ix1 = Math.round(pX1), iy0 = Math.round(pY0), iy1 = Math.round(pY1);
  fr.span(ix0, iy0, ix1, iy1, C.red);
  fr.span(ix0, iy1 - Math.max(1, Math.round(kc)), ix1, iy1, C.darkRed);
  fr.span(ix0, iy0, ix0 + 1, iy1, C.darkRed);
  const ls = Math.max(1, Math.min(3, Math.floor(kc * 0.62)));
  blitLogo(fr, (pX0 + pX1) / 2, (pY0 + pY1) / 2 - 0.5 * kc, ls);
}

const LED_NAMES = new Map(['red', 'cyan', 'magenta', 'yellow', 'darkGreen', 'green'].map((n) => [C[n] >>> 0, n]));
const nameOfLed = (c) => LED_NAMES.get(c >>> 0) || '';

// re-exported for labs and tests that want the wall state machine's version
export { wallVersionOf };
