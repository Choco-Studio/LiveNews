// The GLOBIT 24 studio set as 2.5D depth layers seen through a virtual
// camera (owner: STUDIO SET stream). Geometry and projection: geometry.js;
// per-programme dressing and light: styles.js; wall content: wall.js;
// cameras: ../camera.js.
//
//   drawBackground(fr, cam, t, { style, wall, cut, shotSince, lod } = {})
//   drawDesk(fr, cam, clipRows, accentOrStyle)
//   wallRect(cam), wallFromScene(scene, style), setCacheEnabled(on), bgStats(), warmSet(id)
//   warmStep(budgetMs) one idle slice of the warm-up; warmSets() all of it at once
//   warmWallContent(wallReq, style, cam) a shot's picture / text prepared before its cut
//   prepareImage(imageRecord)   a story picture read once ahead of its cut (wallFromScene also queues
//                               every picture in scene.images for idle-time preparation by itself)
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
import { updateWall, drawWallContent, wallFromScene, wallVersionOf, wallWarmTasks, warmWallContent, prepareImage } from './wall.js';
import { drawDressing, DESK_FRONTS, DRESSING } from './dressing.js';

export { SET, setStyle, styleFor, wallFromScene, drawWallContent, warmWallContent, prepareImage };

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
 * pair's upper colour, bits 4-7 the ramp pair (black/ink, ink/slate, slate/steel...), bits 8-12
 * the tint strength inside the style's tint pools. A tinted pixel swaps its colour for the
 * style's tint colour (ink → maroon, slate → brown, slate → purple), so warmth rises with the
 * light, every pixel stays a palette colour, and the render is still one read per pixel.
 */
function bakeWall(style) {
  const b = BAKED.get(style.bakeKey);
  if (b) return b;
  // a bake already under way (warmStep) is finished first: the bakes share their scratch buffers
  if (BAKING.gen && BAKING.key !== style.bakeKey) finishBaking();
  if (!BAKING.gen) {
    BAKING.key = style.bakeKey;
    BAKING.gen = bakeSteps(style);
  }
  finishBaking();
  return BAKED.get(style.bakeKey);
}
// the bake in progress (at most one): a generator that yields every few dozen texture rows, so the
// warm-up can spread a bake over idle slices (warmStep) while a first use still bakes it at once
const BAKING = { key: '', gen: null };
function finishBaking() {
  while (BAKING.gen && !BAKING.gen.next().done);
  BAKING.gen = null;
}
/** Advance the bake in progress by one slice; true when it has finished. */
function stepBaking() {
  if (!BAKING.gen) return true;
  if (BAKING.gen.next().done) {
    BAKING.gen = null;
    return true;
  }
  return false;
}

function* bakeSteps(style) {
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
  // sides. About 15-25 ms of CPU per style on a quiet machine (more under load): warmStep() spreads
  // it over idle slices, and a first use bakes it at once.
  const clampI = (v, a, z) => (v < a ? a : v > z ? z : v);
  const txa = clampI(Math.floor(-sd.x1 - TX0 - 1), 0, TW), txb = clampI(Math.ceil(sd.x1 - TX0 + 1), 0, TW);
  const tya = tp.to === 0 ? clampI(Math.floor(tp.y0 - TY0 - 1), 0, TH) : 0;
  const lw = txb - txa, lh = TH - tya, n = lw * lh;
  if (!SCRATCH || SCRATCH.length < 2 * n) SCRATCH = new Float64Array(2 * n);
  const acc = SCRATCH.subarray(0, n), tv = SCRATCH.subarray(n, 2 * n);
  acc.fill(0);
  // A pool: the classic soft ellipse, or (any of these options) a shaped light: `below` (its radius
  // under the centre, as a share of ry: top-weighted), `flare` (narrower at the top, wider at the
  // foot: a downlight's scallop), `edge` (a flat plateau with a soft edge this share of the radius
  // wide: a narrow Bayer band instead of a dithered ring), `fade` (dimmer toward its foot)
  const addPools = (arr, pools) => {
    for (const p of pools) {
      const below = p.below ?? 1, flare = p.flare || 0, edge = p.edge || 0, fade = p.fade || 0;
      const shaped = below !== 1 || flare || edge || fade || p.ring;
      const rxMax = p.rx * (1 + Math.abs(flare));
      const xa = clampI(Math.floor(p.X - rxMax - TX0 - 1), txa, txb), xb = clampI(Math.ceil(p.X + rxMax - TX0 + 1), txa, txb);
      const ya = clampI(Math.floor(p.Y - p.ry - TY0 - 1), tya, TH), yb = clampI(Math.ceil(p.Y + p.ry * below - TY0 + 1), tya, TH);
      for (let ty = ya; ty < yb; ty++) {
        const oy = TY0 + ty + 0.5 - p.Y;
        const dy = oy / (oy > 0 ? p.ry * below : p.ry);
        const dy2 = dy * dy;
        if (dy2 >= 1) continue;
        const irx = 1 / (p.rx * (1 + flare * dy));
        const dim = fade && dy > 0 ? 1 - fade * smooth(dy) : 1;
        let i = (ty - tya) * lw + (xa - txa);
        for (let tx = xa; tx < xb; tx++, i++) {
          const dx = (TX0 + tx + 0.5 - p.X) * irx;
          const d = dx * dx + dy2;
          if (d >= 1) continue;
          if (p.ring) {
            // a ring (tint pools): only between ring[0] and ring[1] of the radius, eased in and out
            const r = Math.sqrt(d), [r0, r1] = p.ring;
            if (r > r0 && r < r1) arr[i] += p.amount * Math.sin((Math.PI * (r - r0)) / (r1 - r0));
            continue;
          }
          if (!shaped) arr[i] += p.amount * (1 - d) * (1 - d * 0.35);
          else {
            const r = Math.sqrt(d);
            arr[i] += p.amount * dim * (edge ? smooth((1 - r) / edge) : (1 - d) * (1 - d * 0.35));
          }
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
    // the light leaves the shade's open ends (sc.gap above and below its centre): two cones as wide
    // as the shade at the opening, fanning out and fading with the distance from it
    const gap = sc.gap || 0;
    const reach = Math.max(sc.up, sc.down), hwMax = sc.w0 + sc.spread * reach;
    const xa = clampI(Math.floor(sc.X - hwMax - TX0 - 1), txa, txb), xb = clampI(Math.ceil(sc.X + hwMax - TX0 + 1), txa, txb);
    const ya = clampI(Math.floor(sc.Y - gap - sc.up - TY0 - 1), tya, TH), yb = clampI(Math.ceil(sc.Y + gap + sc.down - TY0 + 1), tya, TH);
    for (let ty = ya; ty < yb; ty++) {
      const dy = TY0 + ty + 0.5 - sc.Y;
      const dist = Math.max(0, Math.abs(dy) - gap);
      const reachY = dy < 0 ? sc.up : sc.down;
      if (dist >= reachY) continue;
      // a scallop, not a triangle: the beam's sides curve out (parabolic) from the opening
      const hw = sc.w0 + sc.spread * (sc.edge ? Math.sqrt(dist * reachY) : dist);
      let i = (ty - tya) * lw + (xa - txa);
      for (let tx = xa; tx < xb; tx++, i++) {
        const ox = TX0 + tx + 0.5 - sc.X;
        const dx = ox / hw;
        if (dx <= -1 || dx >= 1) continue;
        // a wall-washer: brightest at the opening, holding, then fading with distance (an S-curve:
        // clean flat steps with short Bayer bands); the distance is measured on a slight ellipse, so
        // the far end of each cone is a rounded scallop, not a cut straight across
        const d = Math.hypot(dist, (sc.round ?? 0.55) * ox) / reachY;
        if (d >= 1) continue;
        // (sc.edge: a flat plateau of light with a narrow soft edge round the cone, so the panel shows
        // clean flat steps and only a short Bayer band, not a cone of dither)
        const v = sc.edge ? smooth((1 - d) / sc.edge) * smooth((1 - Math.abs(dx)) / sc.edge) : (1 - smooth(d)) * (1 - dx * dx);
        acc[i] += sc.amount * v;
        if (!tints) continue;
        // warm wherever the wash is the light: the tint's Bayer edge sits low in the wash, where the
        // light is still ink (untinted), so the warm colour is one clean cluster with no specks
        // (tintShare < 1 caps the warm share: the wash's heart is a mix of lit and warm pixels, never
        // an opaque warm block)
        const hv = Math.min(0.24 + 0.52 * (sc.tintShare ?? 1), (v - sc.tintAt) / sc.tintBand + 0.5);
        if (hv > tv[i]) tv[i] = hv;
      }
    }
  }
  // glows: the light a wall lamp throws on its panel, a soft rounded oval brightest just above the
  // shade (top-weighted: shorter below the centre), falling off smoothly (no cones, no bow-tie). Its
  // warmth is a share of the style's tint colour in the lit part (g.tint at the heart, none past
  // g.tintR of the radius): a sparse Bayer of warm pixels in the lit slate, never an opaque block
  for (const g of style.glows || []) {
    const below = g.below ?? 1;
    const xa = clampI(Math.floor(g.X - g.rx - TX0 - 1), txa, txb), xb = clampI(Math.ceil(g.X + g.rx - TX0 + 1), txa, txb);
    const ya = clampI(Math.floor(g.Y - g.ry - TY0 - 1), tya, TH), yb = clampI(Math.ceil(g.Y + g.ry * below - TY0 + 1), tya, TH);
    for (let ty = ya; ty < yb; ty++) {
      const oy = TY0 + ty + 0.5 - g.Y;
      const dy = oy / (oy < 0 ? g.ry : g.ry * below);
      const dy2 = dy * dy;
      if (dy2 >= 1) continue;
      let i = (ty - tya) * lw + (xa - txa);
      for (let tx = xa; tx < xb; tx++, i++) {
        const dx = (TX0 + tx + 0.5 - g.X) / g.rx;
        const d2 = dx * dx + dy2;
        if (d2 >= 1) continue;
        const d = Math.sqrt(d2);
        acc[i] += g.amount * (1 - smooth(d));
        if (!tints || !g.tint) continue;
        const share = g.tint * (1 - smooth(d / (g.tintR || 1)));
        const hv = 0.24 + 0.52 * share;
        if (hv > tv[i]) tv[i] = hv;
      }
    }
  }
  yield;
  // per-column side falloff
  if (!SIDE || SIDE.length < TW) SIDE = new Float64Array(TW);
  for (let tx = txa; tx < txb; tx++) {
    const ax = Math.abs(TX0 + tx + 0.5);
    SIDE[tx] = ax > sd.x0 ? 1 - smooth((ax - sd.x0) / (sd.x1 - sd.x0)) : 1;
  }
  const glow = style.glow, pm = style.poolMax, hasPm = pm !== undefined, top = RAMP.length - 1.01;
  const lowCap = style.lowCap ?? 0.6; // the light the lower wall falls back to
  for (let ty = tya; ty < TH; ty++) {
    if (((ty - tya) & 31) === 31) yield;
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
      if (Y > 4 && pos > lowCap) pos += (lowCap - pos) * low;
      // ceiling: black above y ~10 in the wide
      if (Y < tp.y1) pos += (tp.to - pos) * ceil;
      // sides fall off to black
      pos *= SIDE[tx];
      if (pos < 0) pos = 0;
      if (pos > top) pos = top;
      // clean clusters: flat ramp steps with the Bayer only in the band between them (a pixel
      // artist's posterised gradient), instead of dither over the whole pool
      // a Bayer share within 2/16 of either end snaps to the flat step: a share of 1-2 cells in 16
      // prints isolated orphan pixels (the owner: no stray pixels), so bands stay clean clusters
      let q = Math.round(posterise(pos) * 16);
      const qs = q & 15;
      if (qs <= 2) q -= qs;
      else if (qs >= 14) q += 16 - qs;
      if (q > 16 * (RAMP.length - 1) - 1) q = 16 * (RAMP.length - 1) - 1;
      // 0..16 (bits 8-12): 16 tints every Bayer cell, so a full tint is a flat cluster, not a dot grid
      let tq = tints ? Math.min(16, Math.round(band(tv[i]) * 16)) : 0;
      if (tq <= 2) tq = 0;
      else if (tq >= 14) tq = 16;
      tex[row + tx] = (tq << 8) | ((q >> 4) << 4) | (q & 15);
    }
  }
  // per texel: where its run of identical texels ends on its row (the render fills a whole run of a
  // flat ramp step with one native fill, and loops only over dithered runs)
  yield;
  const end = new Uint16Array(TW * TH);
  // the rows above the live window are black end to end: one run each
  end.fill(TW, 0, tya * TW);
  for (let ty = tya; ty < TH; ty++) {
    if (((ty - tya) & 63) === 63) yield;
    const row = ty * TW;
    end[row + TW - 1] = TW;
    for (let tx = TW - 2; tx >= 0; tx--) end[row + tx] = tex[row + tx + 1] === tex[row + tx] ? end[row + tx + 1] : tx + 1;
  }
  BAKED.set(style.bakeKey, { tex, end, lo, hi, tlo, thi });
}
let SCRATCH = null, SIDE = null;

/** Bake a programme's set ahead of its first frame (call it when an episode arrives). */
export function warmSet(id) {
  bakeWall(resolveStyle(id));
}

/**
 * The warm-up as a list of small tasks: each programme's bake (in slices), the wall's tables (land
 * mask, globes, planets, idle text), the desk logo plate (DOM only) and one dry run of the raster
 * loops per programme (so the first frame on air runs optimised code, not the JIT's first pass).
 */
function warmPlan(ids) {
  const plan = [];
  for (const id of ids) plan.push({ style: resolveStyle(id) });
  for (const fn of wallWarmTasks()) plan.push({ fn });
  plan.push({ fn: () => { for (let s = 1; s <= 3; s++) logoPixels(s); } });
  for (const id of ids) for (const pass of [0, 1]) plan.push({ fn: () => warmDraw(resolveStyle(id), pass) });
  return plan;
}
const WARM = { plan: null, i: 0, ids: '' };

/**
 * One slice of the warm-up: runs warm-up tasks (a bake advances by a few dozen texture rows per
 * task) until about `budgetMs` have passed, at least one. Returns { done, left, ms }. Call it from
 * idle time (requestIdleCallback) until done; it is what this module runs by itself after loading.
 */
export function warmStep(budgetMs = 4, ids = STYLE_IDS) {
  const t0 = now();
  const key = ids.join(',');
  if (!WARM.plan || WARM.ids !== key) {
    WARM.plan = warmPlan(ids);
    WARM.i = 0;
    WARM.ids = key;
  }
  const plan = WARM.plan;
  while (WARM.i < plan.length) {
    const task = plan[WARM.i];
    if (task.style) {
      const k = task.style.bakeKey;
      if (BAKED.has(k)) {
        WARM.i++;
        continue;
      }
      if (BAKING.gen && BAKING.key !== k) finishBaking();
      if (!BAKING.gen) {
        BAKING.key = k;
        BAKING.gen = bakeSteps(task.style);
      }
      if (stepBaking()) WARM.i++;
    } else {
      task.fn();
      WARM.i++;
    }
    if (now() - t0 >= budgetMs) break;
  }
  return { done: WARM.i >= plan.length, left: plan.length - WARM.i, ms: now() - t0 };
}

/**
 * Pre-bake every programme's set NOW, synchronously (warmStep without a budget): the baked wall
 * light of each style, the wall's tables, the desk logo plate and the raster loops' first run.
 * Idempotent and free after the first call. The first call costs about 150-250 ms of CPU in all
 * (each bake 15-45 ms, the land mask and tables ~20 ms, the dry runs ~40 ms; more under load), so
 * prefer calling warmStep(budget) from idle slots. drawBackground still bakes synchronously on
 * first use, so a frame is never presented without its set (owner, 21:05). Returns
 * { ms, baked: [bakeKey...] }.
 */
export function warmSets(ids = STYLE_IDS) {
  const a = now();
  while (!warmStep(Infinity, ids).done);
  return { ms: now() - a, baked: [...BAKED.keys()] };
}

/**
 * Run the set's raster loops once for a style into a scratch frame (wide camera, nothing cached, no
 * wall state touched), so the first frame on air runs optimised code instead of paying the JIT.
 */
let WARM_FR = null;
const WARM_CLIP = new Int16Array(W);
function warmDraw(style, pass) {
  if (!WARM_FR) WARM_FR = new Frame();
  const fr = WARM_FR;
  const cam = { x: 0, y: -60, z: 0, zoom: 1, hy: 52, soft: pass };
  const r = wallRect(cam, RECT2);
  renderWall(fr, cam, bakeWall(style), r.x0 - 3, r.y0 - 3, r.x1 + 3, r.y1 + 3, H);
  drawWallDetails(fr, cam, style, !!pass);
  drawFlats(fr, cam, style, !!pass);
  drawFloor(fr, cam, style);
  rasterDesk(fr, cam, WARM_CLIP, style.deskLine, style);
}

/** Is a programme's set baked (labs, tests, the integrator's warm-up check)? */
export const setReady = (id) => BAKED.has(resolveStyle(id).bakeKey);

// The home look is baked as the module loads (every first frame of a lab or of the channel needs it);
// the rest of the warm-up follows by itself in the browser, in slices of about 4 ms every 30 ms.
bakeWall(styleFor('world-now'));
if (typeof document !== 'undefined' && typeof setTimeout === 'function') {
  const step = () => {
    let done = true;
    try {
      done = warmStep(4).done;
    } catch {
      /* first use bakes it */
    }
    if (!done) setTimeout(step, 30);
  };
  setTimeout(step, 30);
}

const COL = new Int32Array(W);
const XOF = new Int32Array(TW + 2); // per texel column: the first screen x that samples it or a later one
const THR = new Uint8Array(4);
const RPAT = new Uint32Array(4);

/**
 * Render the baked wall light above row `yEnd` (the floor covers the rest), skipping the screen
 * rectangle [sx0, sx1) x [sy0, sy1) (the wall content covers it). The row is walked run by run of
 * identical texels: a flat ramp step is one native fill, a dithered run repeats its 4 px Bayer
 * pattern; the dither is anchored to the screen.
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
  // COL never decreases, so a texel run [a, b) covers the screen columns [XOF[a], XOF[b])
  let t = 0;
  for (let x = 0; x < W; x++) while (t <= COL[x]) XOF[t++] = x;
  while (t <= TW) XOF[t++] = W;
  const { tex, end, lo, hi, tlo, thi } = baked;
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
    const row = y * W;
    for (let pass = 0; pass < 2; pass++) {
      const x1 = pass ? xr : xa;
      let x = pass ? xb : xl;
      while (x < x1) {
        const ti = rb + COL[x];
        const v = tex[ti];
        let xe = XOF[end[ti]];
        if (xe > x1) xe = x1;
        if ((v & 0x1f0f) === 0) {
          // a flat ramp step (no Bayer share, no tint): the lower colour whatever the threshold
          px.fill(lo[v >> 4], row + x, row + xe);
          x = xe;
          continue;
        }
        const p = (v >> 4) & 15, sh = v & 15, tq = v >> 8;
        if (xe - x < 4) {
          // a short dithered run (minified wides): per pixel
          for (; x < xe; x++) {
            const T = THR[x & 3];
            px[row + x] = tq > T ? (sh > T ? thi[p] : tlo[p]) : sh > T ? hi[p] : lo[p];
          }
          continue;
        }
        for (let j = 0; j < 4; j++) {
          const T = THR[j];
          RPAT[j] = tq > T ? (sh > T ? thi[p] : tlo[p]) : sh > T ? hi[p] : lo[p];
        }
        for (; x < xe; x++) px[row + x] = RPAT[x & 3];
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

/** Each programme's set dressing on (default) or off (the bare network architecture: tests, labs). */
export function setDressing(on) {
  DRESSING.on = !!on;
  invalidateSet();
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
  drawWallDetails(fr, cam, style, soft);
  drawDressing(fr, cam, style, soft); // the programme's own studio (dressing.js)
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

/** Seams and the one static ceiling line (in focus only), the practicals (softened out of focus). */
function drawWallDetails(fr, cam, style, soft = false) {
  const Zw = SET.wallZ;
  if (soft) {
    // out of focus only the practicals stay (a lamp's light never shows without its lamp): the
    // fixture softened, its lit lips and highlight gone
    if (style.practical === 'warm' && style.sconces) for (const X of style.sconces) drawSconce(fr, cam, X, style.sconceY ?? -55, true);
    return;
  }
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
  } else if (style.practical === 'warm' && style.sconces) {
    // the warm pair: hand-pixelled bronze up/down sconces at the heart of their neutral scallops
    // (styles.js); the warmth is in the fixture and its two hot cores, never sprinkled on the wall
    for (const X of style.sconces) drawSconce(fr, cam, X, style.sconceY ?? -55, false);
  }
}

// MONEY MINUTE's bronze up/down sconce, hand-pixelled (two levels of detail: the wide, and the close
// shots). A tapered drum lit from camera-left: a 1 px silver highlight on its left edge, a three-tone
// bronze ramp (tan, tanShade, brown, maroon), a cream lip at the top opening, a tan one at the bottom and
// the short stem of its wall plate under it. Its light on the panel is styles.js's neutral scallop (a warm
// heart in the beam was tried: at the beam's size any warm cluster reads as an opaque brown shape).
//   k black, m maroon, b brown, n tanShade, t tan, c cream, s silver
const SCONCE = {
  small: {
    shade: 5.5, // the shade's centre row (the fixture's world Y)
    rows: [
      '.ccccc.',
      '.stnbm.',
      '.stnbm.',
      '.stnbm.',
      'stnnbbm',
      'stnnbbm',
      'stnnbbm',
      'stnbbbm',
      'stnbbbm',
      'kttttbk',
      '..kmk..',
      '..kmk..',
    ],
  },
  large: {
    shade: 7.5,
    rows: [
      '..cccccccccc..',
      '..sttttnnnbm..',
      '..sttnnnnbbm..',
      '..sttnnnnbbm..',
      '.sttnnnnnbbbm.',
      '.sttnnnnbbbbm.',
      '.stnnnnnbbbbm.',
      '.stnnnnnbbbbm.',
      'sttnnnnnbbbbmk',
      'stnnnnnbbbbbmk',
      'stnnnnnbbbbbmk',
      'kttttttttttbmk',
      '...kmmmmmmk...',
      '....kmmmmk....',
    ],
  },
};
const SCONCE_C = { k: 'black', m: 'maroon', b: 'brown', n: 'tanShade', t: 'tan', c: 'cream', s: 'silver' };
// out of focus: lower contrast, no highlight, no lit lips
const SCONCE_SOFT = { k: 'maroon', m: 'maroon', b: 'brown', n: 'brown', t: 'tanShade', c: 'tan', s: 'tanShade' };
const SCONCE_W = 9.8; // the fixture's width in world units (7 px in the wide)
function drawSconce(fr, cam, X, Y, soft) {
  const k = kAt(cam, SET.wallZ);
  const spr = k < 1.1 ? SCONCE.small : SCONCE.large;
  const w = spr.rows[0].length;
  const sc = k < 1.1 ? 1 : Math.max(1, Math.round((k * SCONCE_W) / w));
  const map = soft ? SCONCE_SOFT : SCONCE_C;
  const x0 = Math.round(sxOf(cam, k, X) - (w * sc) / 2);
  const y0 = Math.round(syOf(cam, k, Y) - (spr.shade + 0.5) * sc);
  for (let j = 0; j < spr.rows.length; j++) {
    const row = spr.rows[j];
    for (let i = 0; i < w; i++) {
      const ch = row[i];
      if (ch === '.') continue;
      fr.span(x0 + i * sc, y0 + j * sc, x0 + (i + 1) * sc, y0 + (j + 1) * sc, C[map[ch]]);
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
      // a frosted strip below the dark ceiling band (it starts at y ~15 in the wide): slate housing, a
      // steel core and a 1 px fog line when in focus (static, no glow, never brighter than the faces)
      layerRect(fr, cam, Zf, lx - 3, -104, lx + 3, -20, C.slate);
      layerRect(fr, cam, Zf, lx - 1.5, -100, lx + 1.5, -24, soft ? C.slate : C.steel);
      if (!soft) layerVLine(fr, cam, Zf, lx - 0.5, -96, -28, C.fog, 1);
    } else if (style.practical === 'purple') {
      // COSMOS: a dim purple strip in an ink housing (static, never brighter than slate)
      layerRect(fr, cam, Zf, lx - 3, -104, lx + 3, -20, C.ink);
      layerRect(fr, cam, Zf, lx - 1.5, -100, lx + 1.5, -24, C.purple);
    } else if (style.practical === 'off' || style.practical === 'warm') {
      // the strip is there but unlit
      layerRect(fr, cam, Zf, lx - 3, -104, lx + 3, -20, C.ink);
      layerRect(fr, cam, Zf, lx - 1.5, -100, lx + 1.5, -24, C.black);
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
// per column, the desk front's panel rows (for the programme's front pattern): upper panel top, split, kick
const PTOP = new Int16Array(W), PSPLIT = new Int16Array(W), PKICK = new Int16Array(W);
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

const DSTEP = (2 * SET.deskHW) / DESK_N; // world X between two tessellation nodes
/** Scale of the desk's front curve (dz = 0) or back edge (dz = deskDepth) at world X. */
function deskK(cam, X, dz) {
  const u = X / SET.deskHW;
  return (F * cam.zoom) / (SET.deskFrontZ + SET.deskCurve * u * u + dz - cam.z);
}
/** The world X on a desk curve under the screen column centre cx (Newton from the guess X0). */
function deskX(cam, cx, X, dz) {
  const D = SET;
  for (let it = 0; it < 3; it++) {
    const k = deskK(cam, X, dz);
    const f = 192 + (X - cam.x) * k - cx;
    const dk = (-k * k * ((2 * D.deskCurve * X) / (D.deskHW * D.deskHW))) / (F * cam.zoom);
    const step = f / (k + (X - cam.x) * dk);
    X -= step;
    if (step < 1e-7 && step > -1e-7) break;
  }
  return X;
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
  const front = (DRESSING.on && DESK_FRONTS[style.id]) || null; // the programme's own front (dressing.js)
  const topC = C[front?.top || style.deskTop] || C.slate;
  const tech = style.deskTop === 'steel';
  // the front panel: ink over a darker lower band (TECH BYTES' plinth: slate over ink)
  // (the plinth's lit face ends at the reveal, above y 150 in the wide: below it the lower panel is
  // black like every other desk, so the graphics zone stays the darkest)
  const panelHi = front ? C[front.hi] : tech ? C.slate : C.ink, panelLo = front ? C[front.lo] : C.black;
  PTOP.fill(-1);
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
    // the edges' rows are exact (the tessellation only seeds a Newton solve for the world X under
    // the column): a camera push then moves every desk line monotonically, one row step at a time,
    // instead of letting the piecewise-linear error flip a row back and forth (two-shot push)
    const ub = inB ? (cx - DBX[jb]) / Math.max(1e-6, DBX[jb + 1] - DBX[jb]) : 0;
    const yb = inB ? cam.hy + (0 - cam.y) * deskK(cam, deskX(cam, cx, DSTEP * (jb + ub) - D.deskHW, D.deskDepth), D.deskDepth) : NaN;
    if (!inF) {
      if (inB) clipRows[x] = Math.max(0, Math.round(yb)); // beyond the front curve, over the top surface
      continue;
    }
    const uf = (cx - DFX[jf]) / Math.max(1e-6, DFX[jf + 1] - DFX[jf]);
    const Xf = deskX(cam, cx, DSTEP * (jf + uf) - D.deskHW, 0);
    const kfx = deskK(cam, Xf, 0);
    const yt = cam.hy + (0 - cam.y) * kfx;
    const ybot = cam.hy + (D.deskH - cam.y) * kfx;
    const turn = Math.abs((2 * D.deskCurve * Xf) / (D.deskHW * D.deskHW));
    // the silver edge's row, and the LED at a whole row offset from it that changes slowly, so the
    // two step together along the curve; the back edge is its own exact curve against the floor (an
    // offset from the edge's rounded row flipped back and forth under a push: the sum of two
    // roundings is not monotone)
    const top1 = Math.round(yt);
    const top0 = inB ? Math.min(top1, Math.round(yb)) : top1;
    const bot = Math.min(fr.h, Math.round(ybot));
    clipRows[x] = Math.max(0, top0);
    // the curved ends turn away from the key: two flat facets, one and two steps darker
    const facet = turn > 0.78 ? 2 : turn > 0.46 ? 1 : 0;
    const kz = (ybot - yt) / D.deskH;
    // row boundaries on the panel (world Y → screen row, pixel-centre rule)
    const ledRow = top1 + Math.max(1, Math.round(LED_Y * kz)); // exactly 1 px per column, under the edge
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
    // the column top to bottom as flat segments (same rows as the rules above, no per-pixel branching):
    // top surface, silver edge, fascia, LED, upper panel (joint seam below the LED), reveal, lower
    // panel, kick
    let y = Math.max(0, top0), o = y * W0 + x, e;
    for (e = Math.min(bot, top1); y < e; y++, o += W0) px[o] = cTop;
    if (y === top1 && y < bot) {
      px[o] = cEdge;
      y++;
      o += W0;
    }
    for (e = Math.min(bot, ledRow); y < e; y++, o += W0) px[o] = cFascia;
    if (y === ledRow && y < bot) {
      px[o] = led;
      y++;
      o += W0;
    }
    for (e = Math.min(bot, rSplit, joint ? ledRow + 2 : rSplit); y < e; y++, o += W0) px[o] = cHi;
    for (e = Math.min(bot, rSplit); y < e; y++, o += W0) px[o] = cJoint;
    if (reveal && y === rSplit && y < bot) {
      px[o] = cGroove;
      y++;
      o += W0;
      if (y < bot) {
        px[o] = cLip;
        y++;
        o += W0;
      }
    }
    for (e = Math.min(bot, rKick); y < e; y++, o += W0) px[o] = cLo;
    for (; y < bot; y++, o += W0) px[o] = cKick;
    PTOP[x] = ledRow + 1;
    PSPLIT[x] = Math.min(bot, rSplit);
    PKICK[x] = Math.min(bot, rKick);
    // floor reflection of the LED line (a darker palette step, ≤ 30 %), never in the graphics zone
    if (refC) {
      const ry = Math.round(ybot + (D.deskH - LED_Y) * kz * 0.9);
      if (ry >= 0 && ry < fr.h && ry < 150) px[ry * W0 + x] = refC;
    }
  }
  if (front) {
    if (front.pattern) deskPattern(fr, cam, front, kc);
    // the graphics zone (y >= 150) keeps the network's plain dark panel whatever the programme's front
    const hiC = C[front.hi], loC = C[front.lo];
    for (let x = 0; x < W; x++) {
      if (PTOP[x] < 0) continue;
      for (let y = Math.max(150, PTOP[x]); y < Math.min(fr.h, PKICK[x]); y++) {
        const o = y * W + x;
        if (px[o] === hiC || px[o] === loC) px[o] = C.ink;
      }
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

/**
 * The programme's desk front pattern over the upper panel (dressing.js DESK_FRONTS): wood grain lines, a few
 * star points, or a band of the accent at the panel's foot. Above the reveal only (never in y >= 150).
 */
// the wood front's grain rows: [fraction of the upper panel's height, dark figure]
const GRAIN_ROWS = [[0.2, false], [0.36, true], [0.5, false], [0.68, false], [0.82, true]];
const GRAIN_SEG = { dy: 0, gap: false };
/** The grain run under screen column x in row g: its 1 px offset and whether x falls in a gap. */
function grainSeg(x, g) {
  // walk seeded segments along the row (lengths 10-40, gaps 2-9): deterministic per (row, x)
  let pos = -((g * 17) % 23), n = 0;
  for (;;) {
    const h = Math.imul((n + 1) * 2654435761 ^ (g + 1) * 40503, 0x9e3779b1) >>> 0;
    const len = 10 + (h % 31), gap = 2 + ((h >>> 8) % 8);
    if (x < pos + len) {
      GRAIN_SEG.dy = ((h >>> 16) % 3) - 1;
      GRAIN_SEG.gap = x < pos;
      return GRAIN_SEG;
    }
    pos += len + gap;
    n++;
    if (pos > x) {
      GRAIN_SEG.gap = true;
      return GRAIN_SEG;
    }
  }
}
function deskPattern(fr, cam, front, kc) {
  const px = fr.px;
  const W0 = fr.w;
  const grain = C.tanShade, star = C.silver, stripe = C[front.stripe || 'yellow'], slit = C[front.slit || 'red'];
  for (let x = 0; x < W0; x++) {
    const t = PTOP[x], sp = PSPLIT[x];
    if (t < 0 || sp <= t) continue;
    const h = sp - t;
    if (front.pattern === 'grain') {
      // grain in broken runs: per row, straight segments of seeded length (10-40 px) that start and end
      // apart, each a pixel up or down from the last; light grain (tanShade) and a darker figure (maroon)
      for (let g = 0; g < GRAIN_ROWS.length; g++) {
        const [f, dark] = GRAIN_ROWS[g];
        const seg = grainSeg(x, g);
        if (seg.gap) continue;
        const y = t + Math.round(h * f) + seg.dy;
        if (y > t && y < sp && y < 150) px[y * W0 + x] = dark ? C.maroon : grain;
      }
    } else if (front.pattern === 'stars') {
      const hsh = Math.imul(x * 2654435761, 1) >>> 0;
      if (hsh % 29 === 0) {
        const y = t + 2 + (hsh >>> 8) % Math.max(1, h - 3);
        if (y < sp && y < 150) px[y * W0 + x] = star;
      }
    } else if (front.pattern === 'stripe') {
      // a band of the accent across the upper panel (a third of the way down), clear of the graphics zone
      const bw = Math.max(1, Math.round(kc));
      const y0 = t + Math.max(1, Math.round(h * 0.3));
      for (let y = y0; y < y0 + bw; y++) if (y < sp && y < 150) px[y * W0 + x] = stripe;
    }
    // an LED slit of the accent in each module seam of the upper panel (the set's ribbons, carried down
    // into the desk), over any pattern
    if (front.slit && JCOL[x] === 1) for (let y = t + 1; y < sp && y < 150; y++) px[y * W0 + x] = slit;
  }
}

const LED_NAMES = new Map(['red', 'cyan', 'magenta', 'yellow', 'darkGreen', 'green'].map((n) => [C[n] >>> 0, n]));
const nameOfLed = (c) => LED_NAMES.get(c >>> 0) || '';

// re-exported for labs and tests that want the wall state machine's version
export { wallVersionOf };
