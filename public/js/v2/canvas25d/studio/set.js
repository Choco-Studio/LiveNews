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
import { C, Frame } from '../pixbuf.js';
import { drawLogo, measureLogo } from '../../../logo.js';
import { F, SET, kAt, sxOf, syOf } from './geometry.js';
import { resolveStyle, styleFor, setStyle, currentStyle, STYLE_IDS } from './styles.js';
import { updateWall, drawWallContent, wallFromScene, wallVersionOf, warmWall } from './wall.js';

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

const BAND0 = 0.24, BAND1 = 0.76;
const band = (f) => (f <= BAND0 ? 0 : f >= BAND1 ? 1 : (f - BAND0) / (BAND1 - BAND0));
const posterise = (pos) => {
  const i = Math.floor(pos);
  return i + band(pos - i);
};

const BAKED = new Map();

/**
 * Bake (once per style) the wall light into a 16-bit texture: bits 0-3 the Bayer share of the
 * pair's upper colour, bits 4-7 the ramp pair (black/ink, ink/slate, slate/steel...), bits 8-11
 * the tint strength inside the style's tint pools. A tinted pixel swaps its colour for the
 * style's tint colour (ink → maroon, slate → brown, slate → purple), so warmth rises with the
 * light, every pixel stays a palette colour, and the render is still one read per pixel.
 */
function bakeWall(style) {
  let b = BAKED.get(style.bakeKey);
  if (b) return b;
  const lo = new Uint32Array(16), hi = new Uint32Array(16), tlo = new Uint32Array(16), thi = new Uint32Array(16);
  const tints = style.tints ? Object.entries(style.tints).map(([f, to]) => [C[f], C[to]]) : null;
  const tint = (c) => {
    if (tints) for (const [f, to] of tints) if (f === c) return to;
    return c;
  };
  for (let i = 0; i < RAMP.length - 1; i++) {
    lo[i] = C[RAMP[i]];
    hi[i] = C[RAMP[i + 1]];
    tlo[i] = tint(lo[i]);
    thi[i] = tint(hi[i]);
  }
  const tex = new Uint16Array(TW * TH);
  const S = SET.screen, cove = style.cove, tp = style.top, sd = style.sides;
  // The live window: beyond the side falloff and above the ceiling line the light is exactly 0
  // (black), so only this window is computed (about a third of the texture). Pools and tints are
  // accumulated over their own bounding boxes, then one pass applies the shaping in the same order
  // as the light model: base + cove + pools + bezel spill, pool ceiling, lower-wall fall, ceiling,
  // sides. ~3 ms per style instead of ~100 ms, so a programme change never stalls a frame.
  const clampI = (v, a, z) => (v < a ? a : v > z ? z : v);
  const txa = clampI(Math.floor(-sd.x1 - TX0 - 1), 0, TW), txb = clampI(Math.ceil(sd.x1 - TX0 + 1), 0, TW);
  const tya = tp.to === 0 ? clampI(Math.floor(tp.y0 - TY0 - 1), 0, TH) : 0;
  const lw = txb - txa, lh = TH - tya, n = lw * lh;
  if (!SCRATCH || SCRATCH.length < 2 * n) SCRATCH = new Float64Array(2 * n);
  const acc = SCRATCH.subarray(0, n), tv = SCRATCH.subarray(n, 2 * n);
  acc.fill(0);
  const addPools = (arr, pools) => {
    for (const p of pools) {
      const xa = clampI(Math.floor(p.X - p.rx - TX0 - 1), txa, txb), xb = clampI(Math.ceil(p.X + p.rx - TX0 + 1), txa, txb);
      const ya = clampI(Math.floor(p.Y - p.ry - TY0 - 1), tya, TH), yb = clampI(Math.ceil(p.Y + p.ry - TY0 + 1), tya, TH);
      for (let ty = ya; ty < yb; ty++) {
        const dy = (TY0 + ty + 0.5 - p.Y) / p.ry;
        const dy2 = dy * dy;
        if (dy2 >= 1) continue;
        let i = (ty - tya) * lw + (xa - txa);
        for (let tx = xa; tx < xb; tx++, i++) {
          const dx = (TX0 + tx + 0.5 - p.X) / p.rx;
          const d = dx * dx + dy2;
          if (d < 1) arr[i] += p.amount * (1 - d) * (1 - d * 0.35);
        }
      }
    }
  };
  addPools(acc, style.pools);
  if (tints) {
    tv.fill(0);
    addPools(tv, style.tintPools);
  }
  // scallops: the up/down wash of a wall sconce, narrow at the fixture and fanning out with distance,
  // brightest next to it; they add light, and warmth when the style has tints
  for (const sc of style.scallops || []) {
    const reach = Math.max(sc.up, sc.down), hwMax = sc.w0 + sc.spread * reach;
    const xa = clampI(Math.floor(sc.X - hwMax - TX0 - 1), txa, txb), xb = clampI(Math.ceil(sc.X + hwMax - TX0 + 1), txa, txb);
    const ya = clampI(Math.floor(sc.Y - sc.up - TY0 - 1), tya, TH), yb = clampI(Math.ceil(sc.Y + sc.down - TY0 + 1), tya, TH);
    for (let ty = ya; ty < yb; ty++) {
      const dy = TY0 + ty + 0.5 - sc.Y;
      const d = Math.abs(dy) / (dy < 0 ? sc.up : sc.down);
      if (d >= 1) continue;
      const fall = (1 - d) * (1 - 0.5 * d);
      const hw = sc.w0 + sc.spread * Math.abs(dy);
      let i = (ty - tya) * lw + (xa - txa);
      for (let tx = xa; tx < xb; tx++, i++) {
        const dx = (TX0 + tx + 0.5 - sc.X) / hw;
        if (dx <= -1 || dx >= 1) continue;
        const v = fall * (1 - dx * dx);
        acc[i] += sc.amount * v;
        if (tints) tv[i] += sc.tint * v;
      }
    }
  }
  // per-column side falloff
  if (!SIDE || SIDE.length < TW) SIDE = new Float64Array(TW);
  for (let tx = txa; tx < txb; tx++) {
    const ax = Math.abs(TX0 + tx + 0.5);
    SIDE[tx] = ax > sd.x0 ? 1 - smooth((ax - sd.x0) / (sd.x1 - sd.x0)) : 1;
  }
  const glow = style.glow, pm = style.poolMax, hasPm = pm !== undefined, top = RAMP.length - 1.01;
  for (let ty = tya; ty < TH; ty++) {
    const Y = TY0 + ty + 0.5;
    let rowBase = style.base;
    if (cove) rowBase += (cove.slate - style.base) * smooth((Y - cove.y0) / (cove.y1 - cove.y0));
    const low = Y > 4 ? smooth((Y - 4) / 36) : 0;
    const ceil = Y < tp.y1 ? smooth((tp.y1 - Y) / (tp.y1 - tp.y0)) : 0;
    const ey = Math.max(S.y0 - Y, Y - S.y1, 0);
    const glowRow = glow > 0 && ey < 26;
    let i = (ty - tya) * lw;
    const row = ty * TW;
    for (let tx = txa; tx < txb; tx++, i++) {
      const X = TX0 + tx + 0.5;
      let pos = rowBase;
      pos += acc[i];
      // the wall's own cool spill around the bezel
      if (glowRow) {
        const ex = Math.max(S.x0 - X, X - S.x1, 0);
        const d = Math.hypot(ex, ey);
        if (d < 26) pos += glow * (1 - d / 26) * (1 - d / 26);
      }
      if (hasPm && pos > pm) pos = pm;
      // below head height the wall falls back toward ink (the pools are lit from above), so the
      // lower frame of a single, behind the strap and captions, stays dark and quiet
      if (Y > 4 && pos > 0.6) pos += (0.6 - pos) * low;
      // ceiling: black above y ~10 in the wide
      if (Y < tp.y1) pos += (tp.to - pos) * ceil;
      // sides fall off to black
      pos *= SIDE[tx];
      if (pos < 0) pos = 0;
      if (pos > top) pos = top;
      // clean clusters: flat ramp steps with the Bayer only in the band between them (a pixel
      // artist's posterised gradient), instead of dither over the whole pool
      const q = Math.round(posterise(pos) * 16);
      const tq = tints ? Math.min(15, Math.round(band(tv[i]) * 16)) : 0;
      tex[row + tx] = (tq << 8) | ((q >> 4) << 4) | (q & 15);
    }
  }
  b = { tex, lo, hi, tlo, thi };
  BAKED.set(style.bakeKey, b);
  return b;
}
let SCRATCH = null, SIDE = null;

/** Bake a programme's set ahead of its first frame (call it when an episode arrives). */
export function warmSet(id) {
  bakeWall(resolveStyle(id));
}

/**
 * Pre-bake every programme's set NOW, synchronously: the baked wall light of each style, the wall's
 * land mask and globe / planet tables, and the desk logo plate (DOM only). Idempotent and cheap
 * after the first call (~10-20 ms in all on a laptop). The browser also runs it by itself in
 * small idle slices right after this module loads, and drawBackground still bakes synchronously
 * on first use, so a frame is never presented without its set (owner, 21:05). Returns
 * { ms, baked: [bakeKey...] }.
 */
export function warmSets(ids = STYLE_IDS) {
  const a = typeof performance !== 'undefined' ? performance.now() : Date.now();
  for (const id of ids) bakeWall(resolveStyle(id));
  warmWall();
  for (let s = 1; s <= 3; s++) logoPixels(s);
  warmDraw(ids);
  const b = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return { ms: b - a, baked: [...BAKED.keys()] };
}
/**
 * Run the set's raster loops once per style into a scratch frame (wide camera, nothing cached, no
 * wall state touched), so the first frame on air runs optimised code instead of paying the JIT.
 */
let warmed = false;
function warmDraw(ids) {
  if (warmed) return;
  warmed = true;
  const fr = new Frame();
  const cam = { x: 0, y: -60, z: 0, zoom: 1, hy: 52, soft: 0 };
  const clip = new Int16Array(W);
  for (let pass = 0; pass < 2; pass++) {
    for (const id of ids) {
      const style = resolveStyle(id);
      cam.soft = pass;
      const r = wallRect(cam, RECT2);
      renderWall(fr, cam, bakeWall(style), r.x0 - 3, r.y0 - 3, r.x1 + 3, r.y1 + 3, H);
      drawWallDetails(fr, cam, style);
      drawFlats(fr, cam, style, !!pass);
      drawFloor(fr, cam, style);
      rasterDesk(fr, cam, clip, style.deskLine, style);
    }
  }
}

/** Is a programme's set baked (labs, tests, the integrator's warm-up check)? */
export const setReady = (id) => BAKED.has(resolveStyle(id).bakeKey);

// The home look is baked as the module loads (every first frame of a lab or of the channel needs it);
// the other programmes follow in idle slices in the browser, one per slice.
bakeWall(styleFor('world-now'));
if (typeof document !== 'undefined' && typeof setTimeout === 'function') {
  const queue = [...STYLE_IDS];
  const step = () => {
    const id = queue.shift();
    if (!id) return;
    try {
      if (id === 'world-now') warmWall();
      bakeWall(styleFor(id));
    } catch {
      /* first use bakes it */
    }
    setTimeout(step, 30);
  };
  setTimeout(step, 30);
}

const COL = new Int32Array(W);
const RUN = new Int32Array(W + 1); // per column: where its run of identical texels ends
const THR = new Uint8Array(4);

/**
 * Render the baked wall light above row `yEnd` (the floor covers the rest), skipping the screen
 * rectangle [sx0, sx1) x [sy0, sy1) (the wall content covers it). One texture read and one or two
 * Bayer compares per pixel; the dither is anchored to the screen.
 */
function renderWall(fr, cam, baked, sx0, sy0, sx1, sy1, yEnd, xl = 0, xr = W) {
  const k = kAt(cam, SET.wallZ);
  const inv = 1 / k;
  // the Bayer index is anchored to the SCREEN: the camera only dollies (CAMERA), so each pixel's
  // light level changes monotonically during a move and flips at most once (a layer anchor would
  // re-step and re-dither whole pools)
  for (let x = 0; x < W; x++) {
    let tx = Math.floor(cam.x + (x + 0.5 - 192) * inv - TX0);
    COL[x] = tx < 0 ? 0 : tx >= TW ? TW - 1 : tx;
  }
  // magnified (singles: one texel covers 2-3 px), walk the row texel by texel: a flat texel is one
  // read for its whole run of pixels
  const runs = k > 1.3;
  if (runs) {
    RUN[W] = W;
    for (let x = W - 1; x >= 0; x--) RUN[x] = x + 1 < W && COL[x + 1] === COL[x] ? RUN[x + 1] : x + 1;
  }
  const { tex, lo, hi, tlo, thi } = baked;
  const px = fr.px;
  const ye = Math.min(H, yEnd);
  xl = Math.max(0, xl);
  xr = Math.min(W, xr);
  for (let y = 0; y < ye; y++) {
    let ty = Math.floor(cam.y + (y + 0.5 - cam.hy) * inv - TY0);
    ty = ty < 0 ? 0 : ty >= TH ? TH - 1 : ty;
    const rb = ty * TW;
    const br = (y & 3) << 2;
    THR[0] = B16[br];
    THR[1] = B16[br + 1];
    THR[2] = B16[br + 2];
    THR[3] = B16[br + 3];
    const skip = y >= sy0 && y < sy1;
    const xa = skip ? Math.max(xl, Math.min(xr, sx0)) : xr;
    const xb = skip ? Math.max(xl, Math.min(xr, sx1)) : xr;
    for (let pass = 0; pass < 2; pass++) {
      const x0 = pass ? xb : xl, x1 = pass ? xr : xa;
      const row = y * W;
      if (runs) {
        let x = x0;
        while (x < x1) {
          const v = tex[rb + COL[x]];
          const xe = RUN[x] < x1 ? RUN[x] : x1;
          if ((v & 0xf0f) === 0) {
            const c = lo[v >> 4];
            for (; x < xe; x++) px[row + x] = c;
            continue;
          }
          const p = (v >> 4) & 15, sh = v & 15, tq = v >> 8;
          for (; x < xe; x++) {
            const T = THR[x & 3];
            px[row + x] = tq > T ? (sh > T ? thi[p] : tlo[p]) : sh > T ? hi[p] : lo[p];
          }
        }
        continue;
      }
      let i = row + x0;
      for (let x = x0; x < x1; x++, i++) {
        const v = tex[rb + COL[x]];
        // a flat ramp step (no Bayer share, no tint): the lower colour whatever the threshold
        if ((v & 0xf0f) === 0) {
          px[i] = lo[v >> 4];
          continue;
        }
        const T = THR[x & 3];
        const p = (v >> 4) & 15;
        if (v >> 8 > T) px[i] = (v & 15) > T ? thi[p] : tlo[p];
        else px[i] = (v & 15) > T ? hi[p] : lo[p];
      }
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
  patches: 0,
  deskSafe: false, // the desk never covers the wall (so a wall patch can go into the composite)
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
  return { hits: CACHE.hits, misses: CACHE.misses, patches: CACHE.patches, enabled: CACHE.on };
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
const sameKeyBut = (a, b, skip) => {
  for (let i = 0; i < 10; i++) if (i !== skip && a[i] !== b[i]) return false;
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
  const pOn = PROF.on;
  let p0 = pOn ? now() : 0;
  const wall = updateWall(opts.wall, style, r.x1 - r.x0, r.y1 - r.y0, r.k, t, cam, opts, lod);
  if (pOn) p0 = lap(PROF, 'wall', p0);
  fillKey(cam, sSerial, wall.version, lod);
  CACHE.frame = fr;
  if (CACHE.on && sameKey(KEY, CACHE.bgKey, 10)) {
    fr.px.set(CACHE.bg);
    CACHE.hits++;
    CACHE.deskReady = true;
    return;
  }
  // same camera, style and set; only the wall's pixels changed (the globe turning, the planet's
  // light, a map flying in, a wipe): patch the wall into the cached frames instead of redrawing
  if (CACHE.on && sameKeyBut(KEY, CACHE.bgKey, 7)) {
    blitWall(CACHE.bg, wall, r.x0, r.y0, r.x1, r.y1);
    if (CACHE.deskSafe && sameKey(CACHE.deskKey, CACHE.bgKey, 10)) {
      blitWall(CACHE.desk, wall, r.x0, r.y0, r.x1, r.y1);
      CACHE.deskKey[7] = KEY[7];
    }
    CACHE.bgKey[7] = KEY[7];
    fr.px.set(CACHE.bg);
    CACHE.patches++;
    CACHE.deskReady = true;
    return;
  }
  CACHE.misses++;

  const baked = bakeWall(style);
  const kw = r.k;
  const b = Math.max(1, Math.round(2 * kw));
  // rows below the back wall's foot belong to the floor (drawn after)
  const yFloor = Math.max(0, Math.round(syOf(cam, kw, SET.floorY)));
  // the set flats hide the wall beyond |X| 196 (drawn black over it): no light to render there
  let xl = 0, xr = W;
  if (style.flats) {
    const kf = kAt(cam, SET.flatsZ);
    xl = Math.round(sxOf(cam, kf, -FLAT_X));
    xr = Math.round(sxOf(cam, kf, FLAT_X));
  }
  renderWall(fr, cam, baked, r.x0 - b - 1, r.y0 - b - 1, r.x1 + b + 1, r.y1 + b + 1, yFloor, xl, xr);
  if (pOn) p0 = lap(PROF, 'light', p0);
  if (!soft) drawWallDetails(fr, cam, style);
  drawScreen(fr, r, b, style, soft, wall);
  if (pOn) p0 = lap(PROF, 'screen', p0);
  drawFlats(fr, cam, style, soft);
  drawFloor(fr, cam, style);
  if (pOn) p0 = lap(PROF, 'floor', p0);
  if (CACHE.on) {
    CACHE.bg.set(fr.px);
    CACHE.bgKey.set(KEY);
  }
  CACHE.deskReady = CACHE.on;
}

// Optional part timings (labs: __lab.profile); off on air, where the check costs nothing.
const PROF = { on: false, wall: 0, light: 0, screen: 0, floor: 0, desk: 0, n: 0 };
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
function lap(P, k, t0) {
  const t = now();
  P[k] += t - t0;
  return t;
}
/** Start (reset) or stop the part timings; returns the accumulated ms per part. */
export function setProfile(on) {
  const out = { wall: PROF.wall, light: PROF.light, screen: PROF.screen, floor: PROF.floor, desk: PROF.desk };
  PROF.on = !!on;
  PROF.wall = PROF.light = PROF.screen = PROF.floor = PROF.desk = 0;
  return out;
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
      // the softbox body beyond its lit edge (seen edge-on), then the edge itself
      layerRect(fr, cam, Zw, Math.min(X + sx * 1.4, X + sx * 14), -106, Math.max(X + sx * 1.4, X + sx * 14), 23, C.black);
      layerVLine(fr, cam, Zw, X + sx * 2.1, -104, 21, C.ink, 1.4);
      layerVLine(fr, cam, Zw, X, -104, 21, C.steel, 2.8);
    }
  } else if (style.practical === 'warm') {
    // the warm pair: slim bronze sconces (a darker back plate, the housing lit from camera-left, a
    // 1 px cream diffuser slot and the lit lips where the light leaves up and down); their washes
    // are baked into the wall light (styles.js scallops)
    for (const sx of [-1, 1]) {
      const X = sx * 196;
      layerRect(fr, cam, Zw, X - 3.6, -76, X + 3.6, -56, C.maroon);
      layerRect(fr, cam, Zw, X - 2.2, -78, X + 2.2, -54, C.brown);
      layerRect(fr, cam, Zw, X - 2.2, -78, X - 0.8, -54, C.tanShade);
      layerRect(fr, cam, Zw, X - 0.7, -74, X + 0.7, -58, C.cream);
      layerHLine(fr, cam, Zw, X - 2.2, X + 2.2, -78.4, C.tan);
      layerHLine(fr, cam, Zw, X - 2.2, X + 2.2, -53.6, C.tanShade);
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

/** Copy the wall buffer into its rectangle of a frame (or of a cached Uint32 frame): one row copy per row. */
function blitWall(fr, wall, x0, y0, x1, y1) {
  const w = x1 - x0;
  const buf = wall.buf;
  if (!buf || w <= 0) return;
  const xa = Math.max(0, x0), xb = Math.min(W, x1);
  if (xb <= xa) return;
  const px = fr.px || fr;
  const n = xb - xa;
  for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) {
    const src = (y - y0) * w + (xa - x0);
    px.set(buf.subarray(src, src + n), y * W + xa);
  }
}

const FLAT_X = 196; // inner edge of the set flats (world X at SET.flatsZ)
/** Set flats at mid depth with the programme's practicals (static, never blinking). */
function drawFlats(fr, cam, style, soft) {
  if (!style.flats) return;
  const Zf = SET.flatsZ;
  for (const sx of [-1, 1]) {
    const inner = sx * FLAT_X, outer = sx * 2000;
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

const PAT = new Uint32Array(4);
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
    // the row's Bayer pattern repeats every 4 px
    const br = (y & 3) << 2;
    for (let j = 0; j < 4; j++) PAT[j] = q > B16[br + ((j - ox) & 3)] ? ink : black;
    for (let x = 0; x < W; x += 4) {
      px[row + x] = PAT[0];
      px[row + x + 1] = PAT[1];
      px[row + x + 2] = PAT[2];
      px[row + x + 3] = PAT[3];
    }
  }
}

// ---------------------------------------------------------------------------
// The wall's interior rectangle on screen

const RECT = { x0: 0, y0: 0, x1: 0, y1: 0, k: 1 };
const RECT2 = { x0: 0, y0: 0, x1: 0, y1: 0, k: 1 };

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
      const data = new Uint32Array(ctx.getImageData(0, 0, w, h).data.buffer.slice(0));
      // on the red plate the bug's own black plate and outline become the plate's dark red, so the
      // desk carries one red block with the chrome wordmark set into it (not a badge stuck on red)
      for (let i = 0; i < data.length; i++) if (data[i] >>> 24 > 128 && (data[i] === C.black || data[i] === C.ink)) data[i] = C.darkRed;
      out = { w, h, data };
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
const DESK_JOINTS = [-178, -104, 104, 178]; // world X of the front's module seams (symmetric, clear of the plate)
const JCOL = new Uint8Array(W);
const DFX = new Float32Array(DESK_N + 1), DFT = new Float32Array(DESK_N + 1), DFB = new Float32Array(DESK_N + 1);
const DBX = new Float32Array(DESK_N + 1), DBT = new Float32Array(DESK_N + 1);
const DNX = new Float32Array(DESK_N + 1);

/** A desk colour on a facet turned away from the key: one step darker, or black. */
function facetDim(c, facet, topC) {
  if (facet === 2) return C.black;
  if (facet === 1) return c === topC || c === C.slate ? C.ink : C.black;
  return c;
}

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
// the plate sits high, so y 136-168 (captions over the wide) stays plain (graphics request)
const LED_Y = 2; // the accent line, right under the silver edge
const PLATE_Y0 = 3.2, PLATE_Y1 = 15.6, PLATE_HW = 30;
const PANEL_SPLIT = 28; // the front panel's upper colour down to here (above y 150 in the wide), its lower colour below
const REFLECT = { red: 'maroon', cyan: 'navy', magenta: 'purple', yellow: 'brown', darkGreen: null };

/** Draw the desk; fills clipRows (Int16Array W) with the desk top's back edge per column. */
export function drawDesk(fr, cam, clipRows, accent) {
  // 4th argument: a u32 LED colour (legacy), a style or programme id, or nothing (the background's style)
  let style = CACHE.style || currentStyle();
  let led;
  if (typeof accent === 'number') {
    // a programme's accent colour asks for its desk line (MONEY MINUTE: green → the steady darkGreen
    // line), so a caller still passing the theme accent never draws a different LED than the style
    led = accent >>> 0;
    if (led === style.accent >>> 0) led = style.deskLine;
  } else {
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
  const d0 = PROF.on ? now() : 0;
  rasterDesk(fr, cam, clipRows, led, style);
  if (PROF.on) lap(PROF, 'desk', d0);
  // is every desk column under the wall's bottom bezel? (then wall patches may go into the composite)
  const r = wallRect(cam, RECT2);
  let safe = true;
  for (let x = Math.max(0, r.x0 - 4); x < Math.min(W, r.x1 + 4); x++) if (clipRows[x] < r.y1 + 4) safe = false;
  CACHE.deskSafe = safe;
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
  // the front's module joints: 1 px recessed seams at fixed world X, found on the front curve
  JCOL.fill(0);
  for (const X of DESK_JOINTS) {
    const u = X / D.deskHW;
    const kj = kAt(cam, D.deskFrontZ + D.deskCurve * u * u);
    const jw = Math.max(1, Math.floor(0.9 * kj));
    const x0 = Math.floor(sxOf(cam, kj, X) - (X < 0 ? jw - 0.5 : 0.5));
    for (let x = x0; x < x0 + jw; x++) if (x >= 0 && x < W) JCOL[x] = 1;
  }
  // marching indices over the tessellation (both edges are monotonic in x), then each column is a
  // handful of flat segments: top surface, the silver edge, fascia, LED, panel, a recessed reveal
  // (shadow line + lit lip), the lower panel, kick
  let jf = 0, jb = 0;
  const W0 = fr.w;
  for (let x = 0; x < W0; x++) {
    const cx = x + 0.5;
    while (jb < DESK_N - 1 && DBX[jb + 1] <= cx) jb++;
    while (jf < DESK_N - 1 && DFX[jf + 1] <= cx) jf++;
    const inB = cx >= DBX[0] && cx <= DBX[DESK_N];
    const inF = cx >= DFX[0] && cx <= DFX[DESK_N];
    const ub = inB ? (cx - DBX[jb]) / Math.max(1e-6, DBX[jb + 1] - DBX[jb]) : 0;
    const yb = inB ? DBT[jb] + (DBT[jb + 1] - DBT[jb]) * ub : NaN;
    if (!inF) {
      if (inB) clipRows[x] = Math.max(0, Math.round(yb)); // beyond the front curve, over the top surface
      continue;
    }
    const uf = (cx - DFX[jf]) / Math.max(1e-6, DFX[jf + 1] - DFX[jf]);
    const yt = DFT[jf] + (DFT[jf + 1] - DFT[jf]) * uf;
    const ybot = DFB[jf] + (DFB[jf + 1] - DFB[jf]) * uf;
    const turn = Math.abs(DNX[jf] + (DNX[jf + 1] - DNX[jf]) * uf);
    const top0 = inB ? Math.round(Math.min(yb, yt)) : Math.round(yt);
    const top1 = Math.round(yt);
    const bot = Math.min(fr.h, Math.round(ybot));
    clipRows[x] = Math.max(0, top0);
    // the curved ends turn away from the key: two flat facets, one and two steps darker
    const facet = turn > 0.78 ? 2 : turn > 0.46 ? 1 : 0;
    const kz = (ybot - yt) / D.deskH;
    // row boundaries on the panel (world Y → screen row, pixel-centre rule)
    const ledRow = Math.round(yt + LED_Y * kz); // exactly 1 px per column, wherever the curve puts it
    const rSplit = Math.ceil(yt + PANEL_SPLIT * kz - 0.5), rKick = Math.ceil(yt + (D.deskH - 8) * kz - 0.5);
    const cTop = facetDim(topC, facet, topC), cFascia = facetDim(C.slate, facet, topC);
    const cHi = facetDim(panelHi, facet, topC), cLo = facetDim(panelLo, facet, topC), cKick = C.black;
    const cEdge = facet ? C.steel : C.silver;
    // the reveal between the upper and lower panel: a shadow row, then a 1 px lip catching the key
    // (only when the panel is tall enough on screen to hold it, and never a light lip in y ≥ 150)
    const reveal = kz >= 0.6;
    const cGroove = C.black, cLip = rSplit + 1 < 150 || cHi === C.ink ? cHi : cLo;
    const cJoint = cHi === C.ink ? C.black : facetDim(C.ink, facet, topC);
    const joint = JCOL[x] === 1;
    for (let y = Math.max(0, top0); y < bot; y++) {
      let c;
      if (y < top1) c = cTop;
      else if (y === top1) c = cEdge;
      else if (y === ledRow) c = led;
      else if (y < ledRow) c = cFascia;
      else if (y < rSplit) c = joint && y > ledRow + 1 ? cJoint : cHi;
      else if (reveal && y === rSplit) c = cGroove;
      else if (reveal && y === rSplit + 1) c = cLip;
      else if (y < rKick) c = cLo;
      else c = cKick;
      px[y * W0 + x] = c;
    }
    // floor reflection of the LED line (a darker palette step, ≤ 30 %), never in the graphics zone
    if (refC) {
      const ry = Math.round(ybot + (D.deskH - LED_Y) * kz * 0.9);
      if (ry >= 0 && ry < fr.h && ry < 150) px[ry * W0 + x] = refC;
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
