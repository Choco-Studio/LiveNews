// The GLOBIT 24 studio as 2.5D depth layers seen through a virtual camera.
//
// World units are centimetres (the rig's units): X right, Y down with the
// desk top at Y = 0, Z away from the camera. The camera never rotates (a
// studio pedestal: it trucks, pedestals, dollies and zooms), so every plane
// facing the lens (back wall, set flats, presenters, desk front) is a 2D
// layer scaled by k = F·zoom / (Z − cam.z) — that is the per-layer parallax —
// while the desk top and the floor are true perspective surfaces.
// Each layer is re-rasterised every frame at its exact scale with integer
// edges, so a slow push-in stays pixel-clean at every zoom.
//
// Following docs/ART_DIRECTION.md: one hero screen (centre, dimmed and cool),
// calm ink/slate wall with one soft light pool above each presenter, sides
// falling off to black, one symmetric pair of static practical lights on
// the set flats, brand red only as flat blocks (desk plate, one LED line),
// dark glossy floor with 1 px reflections, Bayer 4x4 only on light falloff.
import { P } from '../../palette.js';
import { C, bayer, mix32, u32 } from './pixbuf.js';
import { LAND } from '../../scenes/worlddata.js';
import { drawLogo, measureLogo } from '../../logo.js';

export const F = 1000;
export const SET = {
  presenterZ: 1000,
  neckY: -30, // neck base of a seated presenter, relative to the desk top (desk at elbow height)
  seatX: { A: -74, B: 74 },
  wallZ: 1400,
  flatsZ: 1180,
  deskFrontZ: 900,
  deskDepth: 82,
  deskHW: 238,
  deskCurve: 58,
  deskH: 52,
  floorY: 52,
  screen: { x0: -73, x1: 73, y0: -110, y1: -22 },
};

export function makeCamera(o = {}) {
  return { x: 0, y: -60, z: 0, zoom: 1, hy: 52, soft: 0, ...o };
}

export const kAt = (cam, Z) => (F * cam.zoom) / (Z - cam.z);
const sxOf = (cam, k, X) => 192 + (X - cam.x) * k;
const syOf = (cam, k, Y) => cam.hy + (Y - cam.y) * k;

/** Screen position and scale of a seated presenter's neck base. */
export function placeActor(cam, X, Z = SET.presenterZ) {
  const k = kAt(cam, Z);
  // quantise the scale so the head (22 u) is a whole number of pixels: fewer re-samples while zooming
  const s = Math.max(0.5, Math.round(22 * k) / 22);
  return { x: sxOf(cam, k, X), y: syOf(cam, k, SET.neckY), s, k };
}

// ---------------------------------------------------------------------------
// Layer helpers (integer edges: shared edges never gap)

function layerRect(fr, cam, Z, X0, Y0, X1, Y1, c) {
  const k = kAt(cam, Z);
  const x0 = Math.round(sxOf(cam, k, X0)), x1 = Math.round(sxOf(cam, k, X1));
  const y0 = Math.round(syOf(cam, k, Y0)), y1 = Math.round(syOf(cam, k, Y1));
  fr.span(x0, y0, Math.max(x1, x0 + 1), Math.max(y1, y0 + 1), c);
}

/** Thin line on a layer: stays 1 px until the layer is zoomed past 2x, then 2 px. */
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

/**
 * Soft elliptical light falloff on a layer, Bayer-dithered between two adjacent ramp steps.
 * The dither is anchored to the layer's whole-pixel offset so a pure camera truck does not crawl.
 */
function layerPool(fr, cam, Z, Xc, Yc, rx, ry, a, b, strength, only = null) {
  const k = kAt(cam, Z);
  const cx = sxOf(cam, k, Xc), cy = syOf(cam, k, Yc);
  const prx = rx * k, pry = ry * k;
  const ox = Math.round(sxOf(cam, k, 0)), oy = Math.round(syOf(cam, k, 0));
  const x0 = Math.max(0, Math.floor(cx - prx)), x1 = Math.min(fr.w, Math.ceil(cx + prx));
  const y0 = Math.max(0, Math.floor(cy - pry)), y1 = Math.min(fr.h, Math.ceil(cy + pry));
  const px = fr.px;
  for (let y = y0; y < y1; y++) {
    const dy = (y + 0.5 - cy) / pry;
    for (let x = x0; x < x1; x++) {
      const dx = (x + 0.5 - cx) / prx;
      const d = dx * dx + dy * dy;
      if (d >= 1) continue;
      const i = y * fr.w + x;
      if (only !== null && px[i] !== only) continue;
      const l = strength * (1 - d) * (1 - d * 0.35);
      if (l > bayer(x - ox, y - oy)) px[i] = b;
    }
  }
}

// ---------------------------------------------------------------------------
// The world globe on the video wall, rasterised per pixel at the exact size

let LANDMASK = null;
const LMW = 512, LMH = 256;
function landMask() {
  if (LANDMASK) return LANDMASK;
  const bin = atob(LAND.rle);
  const W = LAND.w, H = LAND.h;
  const sx = W / LMW, sy = H / LMH;
  const m = new Uint8Array(LMW * LMH);
  let p = 0;
  for (let j = 0; j < H; j++) {
    const keep = j % sy === sy >> 1;
    const row = (j / sy) | 0;
    let x = 0, cur = 0;
    while (x < W) {
      let run = 0, shift = 0, byte;
      do {
        byte = bin.charCodeAt(p++);
        run |= (byte & 127) << shift;
        shift += 7;
      } while (byte & 128);
      if (keep && cur) {
        for (let q = Math.ceil((x - (sx >> 1)) / sx); q * sx + (sx >> 1) < x + run; q++) if (q >= 0 && q < LMW) m[row * LMW + q] = 1;
      }
      x += run;
      cur ^= 1;
    }
  }
  LANDMASK = m;
  return m;
}

const GL = (() => {
  const l = Math.hypot(-0.5, -0.45, 0.74);
  return [-0.5 / l, -0.45 / l, 0.74 / l];
})();

function drawGlobe(fr, cx, cy, R, rot, soft, clip) {
  const mask = landMask();
  const tilt = 0.38;
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const px = fr.px;
  const ocean = soft ? [C.navy, C.navy, C.ink, C.ink] : [C.navy, C.navy, C.ink, C.black];
  const land = soft ? [C.steel, C.slate, C.slate, C.ink] : [C.fog, C.steel, C.slate, C.ink];
  const grid = soft ? C.navy : C.slate;
  const R2 = R * R;
  const x0 = Math.max(clip[0], Math.floor(cx - R - 1)), x1 = Math.min(clip[2], Math.ceil(cx + R + 1));
  const y0 = Math.max(clip[1], Math.floor(cy - R - 1)), y1 = Math.min(clip[3], Math.ceil(cy + R + 1));
  const step = Math.PI / 6;
  const lineW = 0.55 / R;
  const lonL = -0.0, latL = 51.5 * (Math.PI / 180);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > R2) {
        // a thin atmosphere ring
        if (d2 <= (R + 1) * (R + 1) && !soft) px[y * fr.w + x] = dx < 0 && dy < R * 0.3 ? C.blue : C.navy;
        continue;
      }
      const nx = dx / R, ny = dy / R;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      // tilt the axis toward the viewer, then spin
      const wy = ny * ct - nz * st, wz = ny * st + nz * ct;
      const lat = -Math.asin(Math.max(-1, Math.min(1, wy)));
      let lon = Math.atan2(nx, wz) + rot;
      lon = ((lon + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      const u = ((lon / (2 * Math.PI) + 0.5) * LMW) | 0;
      const v = ((0.5 - lat / Math.PI) * LMH) | 0;
      const isLand = mask[Math.min(LMH - 1, v) * LMW + Math.min(LMW - 1, u)];
      const l = nx * GL[0] + ny * GL[1] + nz * GL[2];
      const tone = l > 0.82 ? 0 : l > 0.35 ? 1 : l > 0.0 ? 2 : 3;
      let c = isLand ? land[tone] : ocean[tone];
      // graticule every 30 degrees (thin, only on the lit side)
      if (!isLand && tone <= 2) {
        const gl = Math.abs(((lat + step / 2) % step + step) % step - step / 2);
        const go = Math.abs(((lon + step / 2) % step + step) % step - step / 2) * Math.max(0.2, Math.cos(lat));
        if (nz > 0.35 && (gl < lineW / nz || go < lineW / nz)) c = grid;
      }
      // London: one red pixel (two at large sizes)
      if (Math.abs(lat - latL) < 1.2 / R && Math.abs(lon - lonL) * Math.cos(lat) < 1.2 / R && nz > 0.2) c = C.red;
      px[y * fr.w + x] = c;
    }
  }
}

// ---------------------------------------------------------------------------
// Logo plate texture (rendered once by logo.js, blitted at integer scales)

const LOGO = {};
function logoPixels(scale) {
  if (LOGO[scale]) return LOGO[scale];
  const { w, h } = measureLogo({ variant: 'bug', scale });
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  drawLogo(ctx, 0, 0, { variant: 'bug', scale });
  const data = new Uint32Array(ctx.getImageData(0, 0, w, h).data.buffer.slice(0));
  LOGO[scale] = { w, h, data };
  return LOGO[scale];
}

function blitLogo(fr, cx, cy, scale) {
  const L = logoPixels(scale);
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
// Background: ceiling, back wall, video wall, set flats, floor

export function drawBackground(fr, cam, t) {
  const soft = cam.soft > 0.5;
  const Zw = SET.wallZ;
  const kw = kAt(cam, Zw);
  fr.clear(C.ink);
  // ceiling: dark, one static grid line
  layerRect(fr, cam, Zw, -2000, -2000, 2000, -238, C.black);
  if (!soft) layerHLine(fr, cam, Zw, -2000, 2000, -246, C.slate);

  // light pools above each presenter (head zones), and a cool glow around the screen
  for (const sx of [-1, 1]) layerPool(fr, cam, Zw, sx * 104, -86, 78, 104, C.ink, C.slate, soft ? 0.55 : 0.85, C.ink);
  const S = SET.screen;
  layerPool(fr, cam, Zw, 0, (S.y0 + S.y1) / 2, (S.x1 - S.x0) * 0.78, (S.y1 - S.y0) * 0.95, C.ink, C.slate, soft ? 0.35 : 0.55, C.ink);

  // matte panel seams (vertical) and a dado seam; skipped when out of focus
  if (!soft) {
    for (let i = -6; i <= 6; i++) {
      if (i === 0) continue;
      const X = i * 92 + (i > 0 ? -46 : 46);
      if (Math.abs(X) < S.x1 + 6) continue;
      layerVLine(fr, cam, Zw, X, -238, SET.floorY, C.black);
    }
    layerHLine(fr, cam, Zw, -2000, 2000, 6, C.black);
  }
  // the sides fall off to black
  {
    const ox = Math.round(sxOf(cam, kw, 0));
    const px = fr.px;
    for (let x = 0; x < fr.w; x++) {
      const X = cam.x + (x + 0.5 - 192) / kw;
      const l = (Math.abs(X) - 250) / 170;
      if (l <= 0) continue;
      for (let y = 0; y < fr.h; y++) {
        const i = y * fr.w + x;
        if (l >= 1 || l > bayer(x - ox, y)) px[i] = px[i] === C.slate ? C.ink : C.black;
      }
    }
  }

  // video wall: steel bezel with a silver top edge, navy field, the globe
  drawScreen(fr, cam, t, soft);

  // set flats at mid depth with the symmetric pair of practical light strips
  const Zf = SET.flatsZ;
  for (const sx of [-1, 1]) {
    const inner = sx * 196, outer = sx * 330;
    layerRect(fr, cam, Zf, Math.min(inner, outer), -238, Math.max(inner, outer), SET.floorY, C.black);
    layerVLine(fr, cam, Zf, inner + sx * 2, -238, SET.floorY, C.ink, 2);
    // practical: a tall frosted strip, silver core, fog edges (static, no glow)
    const lx = sx * 214;
    layerRect(fr, cam, Zf, lx - 3, -190, lx + 3, -20, C.slate);
    layerRect(fr, cam, Zf, lx - 1.5, -184, lx + 1.5, -26, soft ? C.steel : C.fog);
    if (!soft) layerVLine(fr, cam, Zf, lx - 0.5, -176, -34, C.silver, 1);
  }
  drawFloor(fr, cam);
}

function drawScreen(fr, cam, t, soft) {
  const Zw = SET.wallZ;
  const k = kAt(cam, Zw);
  const S = SET.screen;
  const x0 = Math.round(sxOf(cam, k, S.x0)), x1 = Math.round(sxOf(cam, k, S.x1));
  const y0 = Math.round(syOf(cam, k, S.y0)), y1 = Math.round(syOf(cam, k, S.y1));
  const b = Math.max(1, Math.round(2 * k));
  fr.span(x0 - b - 1, y0 - b - 1, x1 + b + 1, y1 + b + 1, C.black);
  fr.span(x0 - b, y0 - b, x1 + b, y1 + b, soft ? C.ink : C.slate);
  fr.span(x0 - b, y0 - b, x1 + b, y0 - b + 1, soft ? C.slate : C.silver);
  // field: navy at the top easing to ink at the bottom (keeps the area behind heads dark)
  fr.dither(x0, y0, x1 - x0, y1 - y0, C.navy, C.ink, (x, y) => ((y - y0) / Math.max(1, y1 - y0)) * 1.25 - 0.15);
  // globe (slow spin) in the upper-middle of the screen
  const R = Math.max(6, ((S.y1 - S.y0) * 0.36) * k);
  const gcx = (x0 + x1) / 2, gcy = y0 + (y1 - y0) * 0.44;
  drawGlobe(fr, gcx, gcy, R, -0.35 + t * 0.06, soft, [x0, y0, x1, y1]);
  // a flat red tag at the screen's top-left: the only brand block on the wall
  const tw = Math.max(4, Math.round(16 * k)), th = Math.max(2, Math.round(4 * k));
  fr.span(x0 + Math.round(5 * k), y0 + Math.round(5 * k), x0 + Math.round(5 * k) + tw, y0 + Math.round(5 * k) + th, soft ? C.darkRed : C.red);
}

/** Floor plane (Y = floorY): ray-cast per row, glossy black with converging seams. */
function drawFloor(fr, cam) {
  const Yf = SET.floorY;
  const px = fr.px;
  const h = (Yf - cam.y) * F * cam.zoom;
  const y0 = Math.max(0, Math.ceil(cam.hy + 0.5));
  for (let y = y0; y < fr.h; y++) {
    const dy = y + 0.5 - cam.hy;
    if (dy <= 0) continue;
    const Z = cam.z + h / dy;
    if (Z > SET.flatsZ) continue;
    const perPx = (Z - cam.z) / (F * cam.zoom); // world units per pixel on this row
    const Znext = cam.z + h / (dy + 1);
    const rowSeam = Math.floor(Z / 120) !== Math.floor(Znext / 120);
    const shade = Math.min(1, (Z - cam.z - 500) / 600);
    for (let x = 0; x < fr.w; x++) {
      const X = cam.x + (x + 0.5 - 192) * perPx;
      let c = shade > bayer(x, y) * 0.9 + 0.1 ? C.ink : C.black;
      const sx = Math.abs(((X + 50) % 100 + 100) % 100 - 50);
      if (sx < perPx * 0.5 || rowSeam) c = c === C.ink ? C.slate : C.ink;
      px[y * fr.w + x] = c;
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

/** Draw the desk; fills clipRows (Int16Array W) with the desk top's back edge per column. */
export function drawDesk(fr, cam, clipRows, accent = C.red) {
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
  const ledY = 9, plateY0 = 17, plateY1 = 33, plateHW = 26;
  for (let x = 0; x < fr.w; x++) {
    const cx = x + 0.5;
    const yb = interpCol(DBX, DBT, DESK_N, cx);
    const yt = interpCol(DFX, DFT, DESK_N, cx);
    const ybot = interpCol(DFX, DFB, DESK_N, cx);
    if (Number.isNaN(yt)) {
      if (!Number.isNaN(yb)) {
        // beyond the front curve but over the top surface (desk ends)
        const y0 = Math.max(0, Math.round(yb));
        clipRows[x] = y0;
      }
      continue;
    }
    const top0 = Number.isNaN(yb) ? Math.round(yt) : Math.round(Math.min(yb, yt));
    const top1 = Math.round(yt);
    const bot = Math.round(ybot);
    clipRows[x] = Math.max(0, top0);
    // the curved ends fall off toward black (2D Bayer, like the wall's sides)
    const turn = Math.abs(interpCol(DFX, DNX, DESK_N, cx));
    const fall = Math.max(0, Math.min(1, (turn - 0.18) / 0.45));
    // the LED line and the silver edge are exactly 1 px per column, wherever the curve puts them
    const ledRow = Math.round(yt + ledY * ((ybot - yt) / D.deskH));
    for (let y = Math.max(0, top0); y < Math.min(fr.h, bot); y++) {
      let c;
      if (y < top1) c = C.slate; // desk top surface (dark satin)
      else if (y === top1) c = fall > 0.6 ? C.steel : C.silver; // 1 px silver highlight on the front edge
      else {
        // front panel: world Y of this row on the panel
        const kz = (ybot - yt) / D.deskH;
        const Yp = (y + 0.5 - yt) / kz;
        c = Yp < 5 ? C.slate : C.ink; // a slim fascia under the edge, then the dark panel
        if (Yp > D.deskH - 7) c = C.black; // kick plate
        else if (Yp > D.deskH * 0.5) c = (Yp - D.deskH * 0.5) / (D.deskH * 0.35) > bayer(x, y) ? C.black : c;
        if (y === ledRow) c = accent;
      }
      if (fall > bayer(x, y) && c !== accent && c !== C.silver) c = c === C.slate ? C.ink : C.black;
      px[y * fr.w + x] = c;
    }
    // floor reflection of the LED line (25-35 %)
    const kz = (ybot - yt) / D.deskH;
    const ry = Math.round(ybot + (D.deskH - ledY) * kz * 0.9);
    if (ry >= 0 && ry < fr.h) px[ry * fr.w + x] = mix32(px[ry * fr.w + x], accent, 0.3);
  }
  // logo plate: a flat red block centred on the front, logo at the nearest integer scale
  const pX0 = 192 + (-plateHW - cam.x) * kc, pX1 = 192 + (plateHW - cam.x) * kc;
  const pY0 = syOf(cam, kc, plateY0), pY1 = syOf(cam, kc, plateY1);
  fr.span(Math.round(pX0), Math.round(pY0), Math.round(pX1), Math.round(pY1), C.red);
  fr.span(Math.round(pX0), Math.round(pY1) - Math.max(1, Math.round(kc)), Math.round(pX1), Math.round(pY1), C.darkRed);
  const ls = Math.max(1, Math.min(3, Math.floor(kc * 0.62)));
  blitLogo(fr, (pX0 + pX1) / 2, (pY0 + pY1) / 2 - 0.5 * kc, ls);
  const ry0 = Math.round(syOf(cam, kc, D.deskH)), rh = Math.round((plateY1 - plateY0) * kc * 0.5);
  fr.wash(Math.round(pX0), ry0 + Math.round((D.deskH - plateY1) * kc * 0.9), Math.round(pX1 - pX0), rh, C.red, 0.22);
}
