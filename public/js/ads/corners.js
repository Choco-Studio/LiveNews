// CORNERS — artisan square crisps, shot as a premium slow-motion food
// commercial with a low, velvet voice-over. A single crisp turns in brass tongs
// against a soft, backlit kitchen; a scoop tips more onto a slate board on an
// oak counter, where they tumble, land, hop, skid and rock to rest in a heap;
// Ian, the master squarer, checks one with a brass set square (he stays in soft
// focus behind his tools); salt drifts down a shaft of light onto the heap;
// the pack, lit like a fragrance, closes the spot. "Life has enough curves."
// No faces on snacks, no sound-effect lettering, no stacked puns.
//
// The crisps are real little 3D surfaces rendered per pixel: a cupped square
// with ridges, blisters, a ragged toasted edge, seasoning specks and a rim that
// glows in the backlight. Each one is a table of texels (built once) splatted
// with a z-buffer into a reusable buffer; motion is scripted rigid-body
// physics (gravity, tumble, impact, hop, skid, rocking on the convex side).
// Settled heaps are baked once per state (with depth), so a frame only renders
// the crisps that are still moving.
import {
  P, W, H, clamp, lerp, smooth, glide, track, window01, hash, mix, bake, prewarm, lazy, shadeSteps, ditherSteps, soften, pool, rect,
  line, begin, pt, fill, ellipse, film, vignette, vignetteArt, thin, tracked, smallPrint, canvas, bayer, rgb,
} from './cine.js';

const { round, floor, sin, cos, abs, min, max, PI, sqrt, atan2 } = Math;

// --- timing (70 bpm feel; cuts on phrase ends) ------------------------------------------
const T_TUMBLE = 4.6;
const T_IAN = 10.0;
const T_SALT = 14.4;
const T_SLATE = 19.0;
const DURATION = 25.0;

// --- palette -----------------------------------------------------------------------------
const GOLD = mix(P.yellow, P.cream, 0.35);
const GOLD_D = mix(P.yellow, P.tanShade, 0.5);
const BRASS = [mix(P.brown, P.black, 0.3), mix(P.tanShade, P.brown, 0.4), mix(P.tanShade, P.yellow, 0.35), mix(P.yellow, P.cream, 0.4), mix(P.cream, P.white, 0.4)];
// crisp ramp: deep toasted shadow -> pale gold -> oil highlight
const CR = [
  mix(P.maroon, P.black, 0.25), P.brown, mix(P.brown, P.tanShade, 0.5), P.tanShade, mix(P.tanShade, P.yellow, 0.3),
  mix(P.tan, P.yellow, 0.5), mix(P.yellow, P.cream, 0.3), mix(P.cream, P.yellow, 0.3), mix(P.cream, P.white, 0.45),
];
const FLECK = mix(P.rust, P.brown, 0.55);
const FLECK_D = mix(P.brown, P.black, 0.45);
// packed little-endian RGBA for the splat buffer
const u32of = (hex) => {
  const [r, g, b] = rgb(hex);
  return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
};
const CR32 = new Uint32Array(CR.map(u32of));
const FLECK32 = u32of(FLECK);
const FLECKD32 = u32of(FLECK_D);
const SALT32 = u32of(P.white);
const SALTD32 = u32of(P.silver);

// --- 3D: rotations (3x3, row-major, preallocated) ---------------------------------------
function rotAxis(out, x, y, z, a) {
  const l = sqrt(x * x + y * y + z * z) || 1;
  x /= l;
  y /= l;
  z /= l;
  const c = cos(a);
  const s = sin(a);
  const t = 1 - c;
  out[0] = t * x * x + c;
  out[1] = t * x * y - s * z;
  out[2] = t * x * z + s * y;
  out[3] = t * x * y + s * z;
  out[4] = t * y * y + c;
  out[5] = t * y * z - s * x;
  out[6] = t * x * z - s * y;
  out[7] = t * y * z + s * x;
  out[8] = t * z * z + c;
  return out;
}
function mul(out, a, b) {
  for (let r = 0; r < 3; r++) {
    const a0 = a[r * 3];
    const a1 = a[r * 3 + 1];
    const a2 = a[r * 3 + 2];
    out[r * 3] = a0 * b[0] + a1 * b[3] + a2 * b[6];
    out[r * 3 + 1] = a0 * b[1] + a1 * b[4] + a2 * b[7];
    out[r * 3 + 2] = a0 * b[2] + a1 * b[5] + a2 * b[8];
  }
  return out;
}
const RA = new Float64Array(9);
const RB = new Float64Array(9);
const RC = new Float64Array(9);
const RD = new Float64Array(9);

/** An orthographic camera looking down by `phi`; k = pixels per world unit. */
function camera(x, y, k, phi) {
  return { x, y, k, phi, c: cos(phi), s: sin(phi) };
}
const PJ = new Float64Array(3);
function proj(cam, X, Y, Z) {
  PJ[0] = cam.x + X * cam.k;
  PJ[1] = cam.y + (-Y * cam.c + Z * cam.s) * cam.k;
  PJ[2] = Y * cam.s + Z * cam.c;
  return PJ;
}

// Lights (unit vectors pointing from the surface toward the light).
const norm3 = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const L_KEY = norm3([-0.62, 0.62, 0.48]); // warm key, upper left, in front
const L_BACK = norm3([0.45, 0.4, -0.8]); // window behind, right

// --- the crisp: a table of texels built once per variant ----------------------------------
/**
 * Cupped square in local units (u, w in -1..1, height y up), with ridges,
 * blisters, a ragged edge (mask), toasting, specks and salt. Per texel: local
 * position, normal, albedo, kind (0 crisp, 1 speck, 2 salt) and edge 0..1.
 */
function makeShape(seed, N) {
  const n = N * N;
  const hgt = new Float32Array(n);
  const ok = new Uint8Array(n);
  const edgeA = new Float32Array(n);
  const curv = 0.17 + hash(seed * 3.1) * 0.07;
  const twist = (hash(seed * 5.7) - 0.5) * 0.1;
  const ridgeK = 4.5 + hash(seed * 1.3) * 1.5;
  const ridgePh = hash(seed * 8.9) * 6;
  const BL = [];
  for (let k = 0; k < 9; k++) {
    BL.push([hash(seed * 11 + k) * 1.5 - 0.75, hash(seed * 13 + k * 3) * 1.5 - 0.75, 0.07 + hash(seed * 17 + k) * 0.1, 0.012 + hash(seed * 19 + k) * 0.02]);
  }
  const ragged = (a) => 0.035 * sin(a * 3 + seed) + 0.025 * sin(a * 7.3 + seed * 2.1) + 0.018 * sin(a * 13.7 + seed * 4.2) + (hash(floor(a * 6 + seed * 9)) > 0.86 ? 0.04 : 0);
  const du = 2 / N;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const u = -1 + (i + 0.5) * du;
      const w = -1 + (j + 0.5) * du;
      const id = j * N + i;
      let y = curv * (u * u + w * w) + twist * u * w + 0.018 * sin(u * ridgeK * PI + ridgePh);
      for (const b of BL) {
        const d = Math.hypot(u - b[0], w - b[1]) / b[2];
        if (d < 1) y += b[3] * (1 - d * d) ** 2;
      }
      hgt[id] = y;
      const a = atan2(w, u);
      const d5 = (abs(u) ** 5 + abs(w) ** 5) ** 0.2;
      const thr = 0.97 - ragged(a);
      if (d5 <= thr) {
        ok[id] = 1;
        edgeA[id] = smooth((d5 - (thr - 0.16)) / 0.16);
      }
    }
  }
  let cnt = 0;
  for (let i = 0; i < n; i++) cnt += ok[i];
  const S = {
    N, n: cnt, lx: new Float32Array(cnt), ly: new Float32Array(cnt), lz: new Float32Array(cnt), nx: new Float32Array(cnt), ny: new Float32Array(cnt),
    nz: new Float32Array(cnt), alb: new Float32Array(cnt), kind: new Uint8Array(cnt), edge: new Float32Array(cnt), rim: new Float32Array(32 * 3),
  };
  let o = 0;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const id = j * N + i;
      if (!ok[id]) continue;
      const u = -1 + (i + 0.5) * du;
      const w = -1 + (j + 0.5) * du;
      const hl = hgt[j * N + max(0, i - 1)];
      const hr = hgt[j * N + min(N - 1, i + 1)];
      const hu = hgt[max(0, j - 1) * N + i];
      const hd = hgt[min(N - 1, j + 1) * N + i];
      let nx = -(hr - hl) / (2 * du);
      let nz = -(hd - hu) / (2 * du);
      let ny = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      nz /= l;
      const e = edgeA[id];
      let alb = 0.8 + 0.07 * sin(u * 2.3 + seed) * sin(w * 1.9 - seed) - 0.42 * e ** 1.6;
      // blisters: pale domes with browned rims
      for (const b of BL) {
        const d = Math.hypot(u - b[0], w - b[1]) / b[2];
        if (d < 0.8) alb += 0.08 * (1 - d / 0.8);
        else if (d < 1.15) alb -= 0.16;
      }
      // a few toasted patches
      const tp = sin(u * 3.1 + seed * 2) * sin(w * 2.7 + seed * 3);
      if (tp > 0.72) alb -= 0.12;
      let kind = 0;
      const hs = hash(i * 12.9898 + j * 78.233 + seed * 37.7);
      if (hs > 0.968 && e < 0.7) kind = 1;
      else if (hs < 0.012 && e < 0.6) kind = 2;
      S.lx[o] = u;
      S.ly[o] = hgt[id];
      S.lz[o] = w;
      S.nx[o] = nx;
      S.ny[o] = ny;
      S.nz[o] = nz;
      S.alb[o] = clamp(alb, 0.12, 1);
      S.kind[o] = kind;
      S.edge[o] = e;
      o++;
    }
  }
  // 32 boundary samples for contact (lowest point) tests
  for (let k = 0; k < 32; k++) {
    const a = (k / 32) * PI * 2;
    const r = 0.95 - ragged(a);
    const c = cos(a);
    const s = sin(a);
    const sc = r / (abs(c) ** 5 + abs(s) ** 5) ** 0.2;
    const u = c * sc;
    const w = s * sc;
    S.rim[k * 3] = u;
    S.rim[k * 3 + 1] = curv * (u * u + w * w) + twist * u * w;
    S.rim[k * 3 + 2] = w;
  }
  return S;
}

// shape variants (texel density ~2.2 per screen pixel at their largest use)
const SHAPES = new Map();
function shape(seed, N) {
  let m = SHAPES.get(seed);
  if (!m) SHAPES.set(seed, (m = new Map()));
  let s = m.get(N);
  if (!s) m.set(N, (s = makeShape(seed, N)));
  return s;
}

/** Lowest local height (world Y) of the crisp's rim under rotation R, size s. */
function lowest(S, R, s) {
  let lo = 0;
  for (let k = 0; k < 32; k++) {
    const x = S.rim[k * 3] * s;
    const y = S.rim[k * 3 + 1] * s;
    const z = S.rim[k * 3 + 2] * s;
    const wy = R[3] * x + R[4] * y + R[5] * z;
    if (wy < lo) lo = wy;
  }
  return lo;
}

// --- the splat buffer --------------------------------------------------------------------
const BW = 448;
function splatTarget(w = BW, h = H) {
  let cv;
  if (typeof document !== 'undefined') {
    cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
  } else cv = new OffscreenCanvas(w, h);
  const c = cv.getContext('2d', { willReadFrequently: true });
  const img = c.createImageData(w, h);
  const z = new Float32Array(w * h).fill(-1e9);
  return { cv, c, img, u32: new Uint32Array(img.data.buffer), z, w, h, x0: w, y0: h, x1: -1, y1: -1, under: null };
}
let DYN = null;
const dyn = () => DYN || (DYN = splatTarget());

/** Opens a frame of dynamic crisps; `under` is the depth of a baked heap (or null). */
function splatBegin(T, under) {
  T.under = under;
  T.x0 = T.w;
  T.y0 = T.h;
  T.x1 = -1;
  T.y1 = -1;
}

/** Composites the dynamic crisps (dirty box only) onto ctx at -camX, then clears them. */
function splatEnd(T, ctx, camX = 0, camY = 0) {
  if (T.x1 < T.x0) return;
  const x = T.x0;
  const y = T.y0;
  const w = T.x1 - T.x0 + 1;
  const h = T.y1 - T.y0 + 1;
  T.c.putImageData(T.img, 0, 0, x, y, w, h);
  ctx.drawImage(T.cv, x, y, w, h, x - round(camX), y - round(camY), w, h);
  for (let r = y; r < y + h; r++) {
    T.u32.fill(0, r * T.w + x, r * T.w + x + w);
    T.z.fill(-1e9, r * T.w + x, r * T.w + x + w);
  }
}

/**
 * Renders crisp S (half size s, rotation R, position X Y Z) into target T
 * through camera `cam`. `back` is the strength of the backlight rim (0..1),
 * `warm` lifts the exposure (beauty light).
 */
function splat(T, S, s, R, X, Y, Z, cam, back = 0.6, warm = 0) {
  const k = cam.k;
  const cc = cam.c;
  const cs = cam.s;
  const u32 = T.u32;
  const zb = T.z;
  const under = T.under;
  const tw = T.w;
  const th = T.h;
  const vx = 0;
  const vy = cs;
  const vz = cc;
  const hx0 = L_KEY[0] + vx;
  const hy0 = L_KEY[1] + vy;
  const hz0 = L_KEY[2] + vz;
  const hl = Math.hypot(hx0, hy0, hz0);
  const hx = hx0 / hl;
  const hy = hy0 / hl;
  const hz = hz0 / hl;
  let x0 = T.x0;
  let y0 = T.y0;
  let x1 = T.x1;
  let y1 = T.y1;
  const n = S.n;
  for (let i = 0; i < n; i++) {
    const px = S.lx[i] * s;
    const py = S.ly[i] * s;
    const pz = S.lz[i] * s;
    const wx = R[0] * px + R[1] * py + R[2] * pz + X;
    const wy = R[3] * px + R[4] * py + R[5] * pz + Y;
    const wz = R[6] * px + R[7] * py + R[8] * pz + Z;
    const sx = round(cam.x + wx * k);
    const sy = round(cam.y + (-wy * cc + wz * cs) * k);
    if (sx < 0 || sy < 0 || sx >= tw || sy >= th) continue;
    const depth = wy * cs + wz * cc;
    const p = sy * tw + sx;
    if (depth <= zb[p] || (under !== null && depth <= under[p])) continue;
    let nx = R[0] * S.nx[i] + R[1] * S.ny[i] + R[2] * S.nz[i];
    let ny = R[3] * S.nx[i] + R[4] * S.ny[i] + R[5] * S.nz[i];
    let nz = R[6] * S.nx[i] + R[7] * S.ny[i] + R[8] * S.nz[i];
    let f = nx * vx + ny * vy + nz * vz;
    const top = f >= 0;
    if (!top) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
      f = -f;
    }
    const dif = max(0, nx * L_KEY[0] + ny * L_KEY[1] + nz * L_KEY[2]);
    const bk = max(0, nx * L_BACK[0] + ny * L_BACK[1] + nz * L_BACK[2]);
    const sp = max(0, nx * hx + ny * hy + nz * hz);
    const sp2 = sp * sp;
    const sp8 = sp2 * sp2 * sp2 * sp2;
    const e = S.edge[i];
    const rimF = (1 - f) * (1 - f) * bk;
    const alb = S.alb[i];
    const v = alb * (0.3 + dif * 0.78 + warm) + back * (rimF * 0.55 + e * e * 0.3 * (0.4 + bk)) + sp8 * sp8 * 0.45;
    const kind = S.kind[i];
    let col;
    if (kind === 1) col = dif > 0.35 ? FLECK32 : FLECKD32;
    else if (kind === 2 && top) col = dif > 0.4 ? SALT32 : SALTD32;
    else col = CR32[v >= 1.12 ? 8 : clamp(round(v * 7), 0, 7)];
    u32[p] = col;
    zb[p] = depth;
    if (sx < x0) x0 = sx;
    if (sx > x1) x1 = sx;
    if (sy < y0) y0 = sy;
    if (sy > y1) y1 = sy;
  }
  T.x0 = x0;
  T.y0 = y0;
  T.x1 = x1;
  T.y1 = y1;
}

/** Soft contact shadow sprite (dithered alpha), drawn with globalAlpha. */
const shadowArt = lazy(() => pool('cn-shadow', 24, 9, P.black, 5, 0.75));
function shadow(ctx, cam, X, Z, s, height, camX = 0) {
  const a = clamp(1 - height / (s * 5)) * 0.85;
  if (a <= 0.02) return;
  // key light from the upper left: shadows fall to the lower right
  proj(cam, X + 3 + height * 0.5, 0, Z + 2 + height * 0.25);
  const sc = cam.k * (s / 22) * (1 + height / (s * 6));
  const art = shadowArt();
  ctx.globalAlpha = a;
  ctx.drawImage(art, round(PJ[0] - 24 * sc - camX), round(PJ[1] - 9 * sc), round(48 * sc), round(18 * sc));
  ctx.globalAlpha = 1;
}

// --- the kitchen (soft focus) -----------------------------------------------------------------
const KW = 448;
const kitchenFar = lazy(() =>
  bake('cn-kitchen', KW, 130, function* paint(c) {
    // warm dark wall, a glow under the pendants
    yield* shadeSteps(c, 0, 0, KW, 130, [P.black, mix(P.black, P.maroon, 0.55), P.maroon, mix(P.maroon, P.brown, 0.45)], (x, y) => {
      const g = clamp(1 - Math.hypot((x - 150) / 200, (y - 50) / 90));
      return 0.12 + g * 0.75 + y * 0.0012;
    });
    // tiles below the shelf
    for (let x = 0; x < 290; x += 12) rect(c, x, 72, 1, 50, mix(P.maroon, P.black, 0.35));
    for (let y = 78; y < 124; y += 10) rect(c, 0, y, 290, 1, mix(P.maroon, P.black, 0.35));
    // the window (dusk, cool) at the back right, mullions, a shrub outside
    yield* shadeSteps(c, 304, 14, 104, 84, [P.ink, mix(P.ink, P.navy, 0.5), mix(P.navy, P.steel, 0.35), mix(P.steel, P.fog, 0.4)], (x, y) => 0.25 + (y - 14) / 110 + 0.2 * clamp(1 - abs(x - 356) / 60));
    begin();
    pt(304, 98);
    for (let x = 304; x <= 408; x += 8) pt(x, 78 - 10 * hash(x * 0.3) - 8 * sin(x * 0.05));
    pt(408, 98);
    fill(c, mix(P.black, P.darkGreen, 0.25));
    rect(c, 300, 10, 112, 4, P.black);
    rect(c, 300, 10, 4, 92, P.black);
    rect(c, 408, 10, 4, 92, P.black);
    rect(c, 354, 14, 3, 84, P.black);
    rect(c, 304, 54, 104, 3, P.black);
    rect(c, 296, 98, 120, 5, mix(P.maroon, P.black, 0.2));
    // shelf with jars, a bottle of oil, a hanging copper pan
    rect(c, 0, 66, 290, 4, mix(P.brown, P.black, 0.35));
    rect(c, 0, 66, 290, 1, mix(P.tanShade, P.brown, 0.4));
    let x = 10;
    let k = 0;
    while (x < 270) {
      const w = 12 + floor(hash(k * 3.1) * 10);
      const h = 14 + floor(hash(k * 5.3) * 14);
      const glass = hash(k * 7.7) > 0.4;
      rect(c, x, 66 - h, w, h, glass ? mix(P.slate, P.maroon, 0.4) : mix(P.tanShade, P.brown, 0.5));
      rect(c, x + 1, 66 - h + 2, 2, h - 4, glass ? mix(P.fog, P.maroon, 0.4) : mix(P.tan, P.brown, 0.4));
      rect(c, x, 66 - h - 2, w, 2, mix(P.brown, P.black, 0.3));
      x += w + 4 + floor(hash(k * 9.1) * 6);
      k++;
    }
    rect(c, 196, 30, 8, 36, mix(P.yellow, P.tanShade, 0.5));
    rect(c, 198, 24, 4, 6, mix(P.yellow, P.tanShade, 0.5));
    ellipse(c, 246, 98, 15, 15, mix(P.rust, P.tanShade, 0.4), { d: mix(P.rust, P.brown, 0.5), f: 0.35, m: 1, l: mix(P.orange, P.cream, 0.35), lf: 0.15, side: 1 });
    rect(c, 245, 70, 2, 14, mix(P.rust, P.brown, 0.4));
    // pendant lamps: dark shades with bright bulbs (soften() turns them to bokeh)
    for (const lx of [92, 172]) {
      rect(c, lx, 0, 1, 14, P.black);
      begin();
      pt(lx - 12, 26);
      pt(lx - 5, 14);
      pt(lx + 5, 14);
      pt(lx + 12, 26);
      fill(c, mix(P.darkGreen, P.black, 0.55));
      ellipse(c, lx, 28, 9, 4, mix(P.cream, P.yellow, 0.35));
      ellipse(c, lx, 28, 5, 2, mix(P.cream, P.white, 0.5));
    }
    // the far worktop edge
    rect(c, 0, 112, KW, 18, mix(P.brown, P.black, 0.45));
    rect(c, 0, 112, KW, 2, mix(P.tanShade, P.brown, 0.5));
    yield* soften(c, KW, 130, 2, { passes: 2 });
  }));

// warm and cool bokeh for the macro shots (very soft)
const kitchenMacro = lazy(() =>
  bake('cn-kitchen-macro', KW, H, function* paint(c) {
    yield* shadeSteps(c, 0, 0, KW, H, [P.black, mix(P.black, P.maroon, 0.6), P.maroon, mix(P.maroon, P.brown, 0.5), P.brown], (x, y) => {
      const g = clamp(1 - Math.hypot((x - 140) / 260, (y - 70) / 160));
      return 0.1 + g * 0.72;
    });
    // cool window glow at the right
    yield* shadeSteps(c, 270, 0, 178, 150, [mix(P.ink, P.maroon, 0.3), P.ink, mix(P.ink, P.navy, 0.5), mix(P.navy, P.steel, 0.4)], (x, y) => {
      const g = clamp(1 - Math.hypot((x - 380) / 90, (y - 50) / 80));
      return g > 0 ? 0.15 + g * 0.85 : -1;
    });
    rect(c, 360, 0, 6, 150, mix(P.black, P.ink, 0.4));
    // bokeh discs: bright rims, soft centres
    const disc = (x, y, r, col, rimC) => {
      ellipse(c, x, y, r, r, col);
      for (let k = 0; k < 40; k++) {
        const a = (k / 40) * PI * 2;
        rect(c, round(x + cos(a) * (r - 1)), round(y + sin(a) * (r - 1)), 2, 2, rimC);
      }
    };
    disc(60, 40, 13, mix(P.tanShade, P.yellow, 0.35), mix(P.yellow, P.cream, 0.3));
    disc(118, 22, 9, mix(P.tanShade, P.yellow, 0.25), mix(P.yellow, P.cream, 0.2));
    disc(24, 104, 8, mix(P.brown, P.yellow, 0.3), mix(P.tanShade, P.yellow, 0.45));
    disc(300, 30, 7, mix(P.navy, P.fog, 0.35), mix(P.fog, P.silver, 0.4));
    disc(418, 112, 10, mix(P.navy, P.fog, 0.3), mix(P.steel, P.silver, 0.4));
    disc(232, 16, 6, mix(P.brown, P.yellow, 0.3), mix(P.tanShade, P.cream, 0.4));
    // the counter edge far below, warm wood
    yield* shadeSteps(c, 0, 168, KW, H - 168, [mix(P.black, P.maroon, 0.5), P.maroon, P.brown, P.tanShade], (x, y) => 0.25 + 0.5 * clamp(1 - abs(x - 160) / 260) - (y - 168) * 0.004);
    rect(c, 0, 168, KW, 2, mix(P.tanShade, P.tan, 0.4));
    yield* soften(c, KW, H, 5, { passes: 2 });
  }));

// --- the table: oak counter, slate board, props (sharp) ------------------------------------
const CAM_T = camera(206, 146, 1, 0.6);
const CAM_S = camera(190, 150, 1.5, 0.6);
const BOARD = { x0: -150, x1: 150, z0: -56, z1: 56, th: 7 };
const boardEdge = (X, Z, side) => 2.5 * sin(X * 0.11 + side) + 1.5 * sin(X * 0.37 + side * 2) + (hash(floor(X / 5) + side * 50) > 0.8 ? 1.5 : 0);
const OAK = [mix(P.black, P.maroon, 0.6), P.maroon, mix(P.maroon, P.brown, 0.5), P.brown, mix(P.brown, P.tanShade, 0.5), P.tanShade, mix(P.tanShade, P.tan, 0.5)];
const SLATE = [P.black, mix(P.black, P.ink, 0.55), P.ink, mix(P.ink, P.slate, 0.5), P.slate, mix(P.slate, P.steel, 0.4)];

function* paintTable(c, cam, w, h) {
  const k = cam.k;
  // counter top (Y = -BOARD.th), from its far edge down to the frame bottom
  const yc = -BOARD.th;
  const zFar = -150;
  yield* shadeSteps(c, 0, 0, w, h, OAK, (sx, sy) => {
    const Z = ((sy - cam.y) / k + yc * cam.c) / cam.s;
    if (Z < zFar) return -1;
    const X = (sx - cam.x) / k;
    const grain = sin(Z * 0.55 + 2.4 * sin(X * 0.013 + Z * 0.04) + 0.8 * sin(X * 0.051)) * 0.07 + (hash(floor(Z * 1.3) * 7.1) - 0.5) * 0.06;
    const lamp = clamp(1 - Math.hypot((X + 40) / 300, (Z + 20) / 160));
    // the board's shadow (light from the upper left falls to the lower right)
    const inSh = X > BOARD.x0 + 4 && X < BOARD.x1 + 7 && Z > BOARD.z0 + 2 && Z < BOARD.z1 + 5 ? 0.22 : 0;
    return clamp(0.22 + lamp * 0.62 + grain - inSh - clamp((Z - 60) / 200) * 0.2);
  });
  // far edge of the counter catches the light
  proj(cam, 0, yc, zFar);
  rect(c, 0, round(PJ[1]), w, 1, mix(P.tanShade, P.tan, 0.6));
  // the slate board top
  yield* shadeSteps(c, 0, 0, w, h, SLATE, (sx, sy) => {
    const Z = (sy - cam.y) / (k * cam.s);
    const X = (sx - cam.x) / k;
    if (X < BOARD.x0 + boardEdge(Z, Z, 1) * 0.5 || X > BOARD.x1 - boardEdge(Z, Z, 2) * 0.5) return -1;
    if (Z < BOARD.z0 + boardEdge(X, Z, 3) || Z > BOARD.z1 - boardEdge(X, Z, 4)) return -1;
    const sheen = clamp(1 - Math.hypot((X + 60) / 170, (Z + 40) / 70));
    const tex = 0.06 * sin(X * 0.21 + Z * 0.08 + sin(Z * 0.3) * 2) + (hash(floor(X * 0.5) * 3.7 + floor(Z) * 13.1) - 0.5) * 0.08;
    return clamp(0.28 + sheen * 0.42 + tex);
  });
  // the board's rough front face
  for (let sx = 0; sx < w; sx++) {
    const X = (sx - cam.x) / k;
    if (X < BOARD.x0 || X > BOARD.x1) continue;
    const zf = BOARD.z1 - boardEdge(X, BOARD.z1, 4);
    proj(cam, X, 0, zf);
    const top = round(PJ[1]);
    const faceH = round(BOARD.th * cam.c * k);
    for (let y = 0; y < faceH; y++) {
      const v = 0.15 + (y < 1 ? 0.5 : 0) + 0.1 * sin(X * 0.4 + y) - y * 0.02 + clamp(1 - abs(X + 50) / 160) * 0.15;
      c.fillStyle = SLATE[clamp(round(v * 5), 0, 5)];
      c.fillRect(sx, top + y, 1, 1);
    }
    if ((sx & 31) === 31) yield;
  }
}

/** Props on the board and counter for a camera: ramekin of salt, set square, pepper mill. */
function* paintProps(c, cam) {
  const k = cam.k;
  // pepper mill at the back left of the counter
  proj(cam, -205, -BOARD.th, -112);
  const mx = PJ[0];
  const my = PJ[1];
  const mw = 9 * k;
  const mh = 58 * k;
  ellipse(c, mx + 4 * k, my + 1, mw * 1.3, 3 * k, mix(P.black, P.maroon, 0.4));
  begin();
  pt(mx - mw, my);
  pt(mx - mw * 0.8, my - mh * 0.45);
  pt(mx - mw * 0.55, my - mh * 0.62);
  pt(mx - mw * 0.75, my - mh * 0.9);
  pt(mx - mw * 0.3, my - mh);
  pt(mx + mw * 0.3, my - mh);
  pt(mx + mw * 0.75, my - mh * 0.9);
  pt(mx + mw * 0.55, my - mh * 0.62);
  pt(mx + mw * 0.8, my - mh * 0.45);
  pt(mx + mw, my);
  fill(c, mix(P.brown, P.black, 0.35), { d: mix(P.maroon, P.black, 0.5), f: 0.4, m: 1, l: mix(P.tanShade, P.brown, 0.4), lf: 0.18, lm: 1, side: 1 });
  rect(c, mx - 1, my - mh - 3 * k, 2, 3 * k, P.steel);
  // ramekin of salt flakes at the back right of the board
  proj(cam, 104, 0, -34);
  const rx = PJ[0];
  const ry = PJ[1];
  const rr = 15 * k;
  const rh = 11 * k;
  const ey = rr * cam.s;
  c.globalAlpha = 0.5;
  ellipse(c, rx + 4 * k, ry + 2, rr + 2, ey + 1, P.black);
  c.globalAlpha = 1;
  begin();
  pt(rx - rr, ry - rh);
  pt(rx - rr * 0.95, ry);
  for (let i = 0; i <= 8; i++) pt(rx - rr * 0.95 * cos((i / 8) * PI), ry + ey * 0.95 * sin((i / 8) * PI));
  pt(rx + rr, ry - rh);
  fill(c, mix(P.silver, P.fog, 0.4), { d: P.fog, f: 0.35, m: 1, dd: P.steel, df: 0.12, l: P.white, lf: 0.1, lm: 1, side: 1 });
  ellipse(c, rx, ry - rh, rr, ey, P.silver);
  ellipse(c, rx, ry - rh + 0.5, rr - 2, ey - 1.5, mix(P.fog, P.steel, 0.4));
  for (let i = 0; i < 70; i++) {
    const a = hash(i * 3.3) * PI * 2;
    const d = sqrt(hash(i * 7.1)) * 0.9;
    const px = rx + cos(a) * d * (rr - 2);
    const py = ry - rh - 1 + sin(a) * d * (ey - 1.5) - hash(i * 5.5) * 2;
    rect(c, px, py, 1 + (i % 3 === 0 ? 1 : 0), 1, hash(i * 9.9) > 0.4 ? P.white : P.silver);
  }
  // brass set square lying flat on the front right corner of the board
  const sq = [[60, 46], [60, 10], [112, 46]];
  const hole = [[66, 40], [66, 24], [88, 40]];
  begin();
  for (const [X, Z] of sq) {
    proj(cam, X, 0.6, Z);
    pt(PJ[0], PJ[1]);
  }
  proj(cam, sq[0][0], 0.6, sq[0][1]);
  pt(PJ[0], PJ[1]);
  for (const [X, Z] of hole) {
    proj(cam, X, 0.6, Z);
    pt(PJ[0], PJ[1]);
  }
  proj(cam, hole[0][0], 0.6, hole[0][1]);
  pt(PJ[0], PJ[1]);
  fill(c, BRASS[2], { d: BRASS[1], f: 0.18, m: 1, l: BRASS[3], lf: 0.1, lm: 1, side: 1 });
  proj(cam, 60, 0.6, 10);
  const ax = PJ[0];
  const ay = PJ[1];
  proj(cam, 112, 0.6, 46);
  line(c, ax, ay, PJ[0], PJ[1], BRASS[4]);
  yield;
}

const tableArt = lazy(() =>
  bake('cn-table', BW, H, function* paint(c) {
    yield* paintTable(c, CAM_T, BW, H);
    yield* paintProps(c, CAM_T);
  }));
const tableClose = lazy(() =>
  bake('cn-table-close', BW, H, function* paint(c) {
    yield* paintTable(c, CAM_S, BW, H);
    yield* paintProps(c, CAM_S);
  }));

// --- the heap: fallers, rest poses, scripted physics -------------------------------------------
const G = 120; // slow-motion gravity (px/s^2)
const LIP = { x: -96, y: 132, z: -14 }; // the scoop's lip
// rest pose: X, support Y, Z, yaw, rest tilt (axis, angle); impact tilt; tumble axis and spin; hop; skid
const FALLERS = [
  { seed: 1, s: 19, t0: 0.55, X: -14, Y: 0, Z: 10, yaw: 0.35, ta: [1, 0, 0.2], tilt: 0.02, ia: [0.2, 0, 1], it: 0.55, sa: [0.7, 0.4, 0.6], w: 2.4, e: 0.2, skid: [3, 1] },
  { seed: 2, s: 20, t0: 1.15, X: 30, Y: 0, Z: -4, yaw: -0.55, ta: [0, 0, 1], tilt: 0.03, ia: [1, 0, -0.3], it: -0.5, sa: [-0.3, 0.6, 0.8], w: 2.9, e: 0.2, skid: [-2, 2] },
  { seed: 3, s: 18, t0: 1.7, X: -60, Y: 0, Z: -16, yaw: 0.95, ta: [1, 0, 0], tilt: 0, ia: [0.5, 0, 1], it: 0.7, sa: [0.9, 0.2, -0.3], w: 3.2, e: 0.34, skid: [-26, -5] },
  { seed: 4, s: 19, t0: 2.3, X: 10, Y: 5, Z: 3, yaw: 1.45, ta: [0.6, 0, 1], tilt: 0.24, ia: [1, 0, 0.4], it: 0.45, sa: [0.2, 0.9, 0.4], w: 2.6, e: 0.15, skid: [2, 0] },
  { seed: 5, s: 18, t0: 2.85, X: 50, Y: 2, Z: 16, yaw: 0.15, ta: [1, 0, 0.5], tilt: -0.16, ia: [0, 0, 1], it: -0.6, sa: [0.5, -0.5, 0.7], w: 2.8, e: 0.18, skid: [5, 3] },
  { seed: 6, s: 19, t0: 3.35, X: -4, Y: 10, Z: -6, yaw: -1.05, ta: [0.8, 0, -0.6], tilt: 0.3, ia: [0.4, 0, 1], it: 0.5, sa: [-0.7, 0.5, 0.5], w: 2.5, e: 0.14, skid: [-1, 1] },
];
const SETTLE = 1.7; // seconds from impact to exact rest
for (const f of FALLERS) {
  f.S = shape(f.seed, 44);
  f.Sc = shape(f.seed, 64); // denser table for the close salt shot
  f.Rrest = new Float64Array(9);
  mul(f.Rrest, rotAxis(RA, 0, 1, 0, f.yaw), rotAxis(RB, f.ta[0], f.ta[1], f.ta[2], f.tilt));
  f.Rimp = new Float64Array(9);
  mul(f.Rimp, f.Rrest, rotAxis(RA, f.ia[0], f.ia[1], f.ia[2], f.it));
  f.liftRest = -lowest(f.S, f.Rrest, f.s);
  f.liftImp = -lowest(f.S, f.Rimp, f.s);
  // fall from the lip to the impact point
  const yImp = f.Y + f.liftImp;
  f.tF = sqrt((2 * (LIP.y - yImp)) / G);
  f.vI = G * f.tF;
  f.settleAt = f.t0 + f.tF + SETTLE;
}
const ORDER = FALLERS.slice().sort((a, b) => a.settleAt - b.settleAt);
const POSE = { X: 0, Y: 0, Z: 0, R: new Float64Array(9), h: 0 };

/** Pose of faller f at shot time lt (null before release). */
function poseAt(f, lt) {
  const tau = lt - f.t0;
  if (tau < 0) return null;
  const P0 = POSE;
  if (tau < f.tF) {
    // falling: gravity, a flutter that dies at impact, tumbling into the impact pose
    const q = tau / f.tF;
    const flutter = 6 * sin(q * PI * 2) * (1 - q);
    P0.X = lerp(LIP.x, f.X - f.skid[0], q) + flutter;
    P0.Z = lerp(LIP.z, f.Z - f.skid[1], q);
    P0.Y = LIP.y - 0.5 * G * tau * tau;
    mul(P0.R, f.Rimp, rotAxis(RA, f.sa[0], f.sa[1], f.sa[2], f.w * (tau - f.tF)));
    P0.h = P0.Y - f.Y + lowest(f.S, P0.R, f.s);
    return P0;
  }
  // impact -> hop -> rock on the convex side -> rest
  const t2 = tau - f.tF;
  const vh = f.e * f.vI;
  const tHop = (2 * vh) / G;
  const hop = t2 < tHop ? vh * t2 - 0.5 * G * t2 * t2 : 0;
  const fade = t2 > SETTLE - 0.4 ? clamp((SETTLE - t2) / 0.4) : 1;
  const th = f.it * Math.exp(-2.6 * t2) * cos(t2 * 6.5) * fade;
  mul(P0.R, f.Rrest, rotAxis(RA, f.ia[0], f.ia[1], f.ia[2], th));
  const sk = 1 - Math.exp(-3.2 * t2);
  P0.X = f.X - f.skid[0] * (1 - sk * (t2 >= SETTLE ? 1 : 1));
  P0.Z = f.Z - f.skid[1] * (1 - sk);
  if (t2 >= SETTLE) {
    P0.X = f.X;
    P0.Z = f.Z;
  }
  P0.Y = f.Y - lowest(f.S, P0.R, f.s) + hop;
  P0.h = hop;
  return P0;
}

// salt flakes knocked loose at each impact (deterministic)
const HOPS = [];
FALLERS.forEach((f, i) => {
  for (let k = 0; k < 6; k++) HOPS.push({ f, vx: (hash(i * 9 + k) - 0.5) * 50, vz: (hash(i * 5 + k * 3) - 0.5) * 30, vy: 22 + hash(i * 3 + k * 7) * 30, ox: (hash(i + k * 11) - 0.5) * 20 });
});

/** Baked heap after the first n crisps (in settle order) have come to rest: canvas + depth. */
const HEAP_KEYS = ['cn-heap-0', 'cn-heap-1', 'cn-heap-2', 'cn-heap-3', 'cn-heap-4', 'cn-heap-5', 'cn-heap-6'];
const HEAP_Z = [];
function heapOf(n, cam, close) {
  const key = close ? 'cn-heap-close' : HEAP_KEYS[n];
  return bake(key, BW, H, function* paint(c) {
    const T = splatTarget();
    T.under = null;
    for (let i = 0; i < n; i++) {
      const f = ORDER[i];
      shadow(c, cam, f.X, f.Z, f.s, f.Y);
    }
    yield;
    for (let i = 0; i < n; i++) {
      const f = ORDER[i];
      splat(T, close ? f.Sc : f.S, f.s, f.Rrest, f.X, f.Y + f.liftRest, f.Z, cam, 0.55);
      yield;
    }
    T.c.putImageData(T.img, 0, 0);
    c.drawImage(T.cv, 0, 0);
    if (!close) HEAP_Z[n] = T.z;
  });
}
const heapArt = (n) => heapOf(n, CAM_T, false);
const heapClose = lazy(() => heapOf(FALLERS.length, CAM_S, true));

// --- S1: one crisp, turning in brass tongs ------------------------------------------------------
const CAM_H = camera(176, 104, 1, 0.14);
const HERO = shape(7, 150);
const SH_TONG = { d: BRASS[1], f: 0.4, m: 1, dd: BRASS[0], df: 0.15, l: BRASS[3], lf: 0.18, lm: 1, side: 1 };
const K_HERO_ROLL = [[0, -0.75], [4.6, 0.35, 'smooth']];
const K_HERO_YAW = [[0, -0.42], [4.6, -0.2, 'smooth']];
const MOTES = Array.from({ length: 16 }, (_, i) => ({ x: hash(i * 2.3) * 300 + 60, y: hash(i * 5.9) * 200, v: 3 + hash(i * 8.1) * 5, k: i }));

/** Brass tongs from the right edge, tips pinching the crisp at (tx, ty). */
function tongs(ctx, tx, ty, open) {
  for (const sgn of [-1, 1]) {
    const tipY = ty + sgn * (2 + open);
    begin();
    pt(tx - 2, tipY - 1.5);
    pt(tx + 30, tipY + sgn * 3 - 2);
    pt(W + 40, ty + sgn * 26 - 5);
    pt(W + 40, ty + sgn * 26 + 5);
    pt(tx + 30, tipY + sgn * 3 + 2);
    pt(tx - 2, tipY + 1.5);
    fill(ctx, BRASS[2], SH_TONG);
    line(ctx, tx + 4, tipY - 1, W, ty + sgn * 26 - 4, BRASS[4]);
  }
}

function shotHero(ctx, lt) {
  ctx.drawImage(kitchenMacro(), -round(lt * 2), 0);
  // the crisp rolls about the tongs' axis to catch the light
  const roll = track(lt, K_HERO_ROLL);
  const yaw = track(lt, K_HERO_YAW);
  mul(RC, rotAxis(RA, 1, 0, 0, roll + PI / 2 - 0.25), rotAxis(RB, 0, 1, 0, yaw));
  mul(RD, rotAxis(RA, 0, 0, 1, 0.08 * sin(lt * 0.7)), RC);
  const s = 46;
  const T = dyn();
  splatBegin(T, null);
  splat(T, HERO, s, RD, 0, 0, 0, CAM_H, 0.85, 0.06);
  splatEnd(T, ctx);
  // tongs pinch the right edge (the point (u = 1, w = 0) of the crisp)
  const px = RD[0] * s + RD[1] * s * 0.2;
  const py = RD[3] * s + RD[4] * s * 0.2;
  const pz = RD[6] * s + RD[7] * s * 0.2;
  proj(CAM_H, px, py, pz);
  tongs(ctx, round(PJ[0]) - 4, round(PJ[1]), 0);
  // dust and loose salt drifting in the backlight
  for (const m of MOTES) {
    const x = m.x - lt * 4 + sin(lt * 0.6 + m.k) * 3;
    const y = (m.y + lt * m.v) % 216;
    const inBeam = clamp(1 - abs(x - 290 - (y - 100) * 0.4) / 120);
    if (inBeam <= 0) continue;
    ctx.globalAlpha = 0.25 + 0.55 * inBeam;
    rect(ctx, x, y, 1, 1, m.k % 4 ? P.silver : P.white);
  }
  ctx.globalAlpha = 1;
  vignette(ctx, 0.6);
}

// --- S2: the scoop tips; crisps tumble onto the board --------------------------------------
const K_SCOOP = [[0, 0.1], [0.5, 0.42, 'smooth'], [3.6, 0.62, 'smooth'], [4.4, 0.3, 'smooth'], [5.4, -0.2, 'smooth']];
const K_TCAM = [[0, 0], [5.4, 14, 'smooth']];

/** A brass scoop seen from the side, lip at (x, y), tilted by `a` (radians). */
function scoop(ctx, x, y, a) {
  const c = cos(a);
  const s = sin(a);
  const P2 = (lx, ly) => pt(x + lx * c - ly * s, y + lx * s + ly * c);
  begin();
  P2(0, 0);
  P2(-8, 14);
  P2(-48, 18);
  P2(-66, 6);
  P2(-66, -2);
  P2(-6, -4);
  fill(ctx, BRASS[2], { d: BRASS[1], f: 0.3, m: 1, dd: BRASS[0], df: 0.1, l: BRASS[3], lf: 0.12, lm: 1, side: 1 });
  begin();
  P2(-66, -1);
  P2(-110, -60);
  P2(-104, -64);
  P2(-60, -4);
  fill(ctx, mix(P.brown, P.black, 0.3), { d: mix(P.maroon, P.black, 0.5), f: 0.4, m: 1, side: 1 });
  // rim highlight
  begin();
  P2(-1, -4);
  P2(-66, -2);
  P2(-66, -4);
  P2(-1, -6);
  fill(ctx, BRASS[4]);
}

function drawHops(ctx, lt, cam, camX) {
  for (const hp of HOPS) {
    const f = hp.f;
    const t2 = lt - f.t0 - f.tF;
    if (t2 < 0) continue;
    const tl = (2 * hp.vy) / G;
    const q = min(t2, tl);
    const X = f.X - f.skid[0] + hp.ox * 0.4 + hp.vx * q;
    const Z = f.Z - f.skid[1] + hp.vz * q;
    const Y = f.Y + max(0, hp.vy * q - 0.5 * G * q * q) + (t2 >= tl ? 0 : 1);
    proj(cam, X, Y, Z);
    rect(ctx, PJ[0] - camX, PJ[1], 1, 1, t2 < tl ? P.white : P.silver);
  }
}

function heapIndexAt(lt) {
  let n = 0;
  while (n < ORDER.length && lt >= ORDER[n].settleAt) n++;
  return n;
}

function shotTumble(ctx, lt) {
  const camX = round(track(lt, K_TCAM));
  ctx.drawImage(kitchenFar(), -round(camX * 0.4), 0);
  ctx.drawImage(tableArt(), -camX, 0);
  const n = heapIndexAt(lt);
  ctx.drawImage(heapArt(n), -camX, 0);
  // moving crisps: shadows first, then the crisps themselves over the heap
  const T = dyn();
  splatBegin(T, HEAP_Z[n] || null);
  for (let i = n; i < ORDER.length; i++) {
    const f = ORDER[i];
    const p = poseAt(f, lt);
    if (!p) continue;
    shadow(ctx, CAM_T, p.X, p.Z, f.s, max(0, p.Y - f.Y), camX);
  }
  for (let i = n; i < ORDER.length; i++) {
    const f = ORDER[i];
    const p = poseAt(f, lt);
    if (!p) continue;
    splat(T, f.S, f.s, p.R, p.X, p.Y, p.Z, CAM_T, 0.55);
  }
  splatEnd(T, ctx, camX);
  drawHops(ctx, lt, CAM_T, camX);
  // the scoop tips at the top left, then withdraws
  const a = track(lt, K_SCOOP);
  proj(CAM_T, LIP.x, LIP.y, LIP.z);
  scoop(ctx, PJ[0] - camX + 2, PJ[1] - 3 - max(0, lt - 3.9) * 60, a);
  vignette(ctx, 0.55);
}

// --- S3: Ian checks a crisp with the set square (he stays in soft focus) -------------------
const CAM_I = camera(214, 112, 1, 0.08);
const IAN_CRISP = shape(9, 80);
const workshop = lazy(() =>
  bake('cn-workshop', KW, H, function* paint(c) {
    // a warm workshop: pegboard, shelves of crisps in jars, a pendant, a steel bench
    yield* shadeSteps(c, 0, 0, KW, H, [P.black, mix(P.black, P.maroon, 0.55), P.maroon, mix(P.maroon, P.brown, 0.5), P.brown], (x, y) => {
      const g = clamp(1 - Math.hypot((x - 200) / 230, (y - 40) / 150));
      return 0.1 + g * 0.8;
    });
    // pegboard with hanging set squares and rules
    for (let y = 30; y < 120; y += 6) for (let x = 20; x < 150; x += 6) rect(c, x, y, 1, 1, mix(P.maroon, P.black, 0.4));
    for (let i = 0; i < 4; i++) {
      const x = 34 + i * 28;
      begin();
      pt(x, 44);
      pt(x, 44 + 22 + i * 4);
      pt(x + 22 + i * 4, 44 + 22 + i * 4);
      fill(c, mix(P.tanShade, P.yellow, 0.3));
      rect(c, x, 44, 1, 22 + i * 4, mix(P.cream, P.yellow, 0.3));
    }
    // shelves with jars of crisps on the right
    for (const sy of [52, 96]) {
      rect(c, 300, sy, 148, 3, mix(P.brown, P.black, 0.3));
      for (let x = 306; x < 440; x += 22) {
        rect(c, x, sy - 22, 16, 22, mix(P.slate, P.maroon, 0.35));
        rect(c, x + 2, sy - 14, 12, 12, mix(P.tanShade, P.yellow, 0.35));
        rect(c, x, sy - 24, 16, 2, mix(P.tanShade, P.brown, 0.3));
        rect(c, x + 2, sy - 20, 1, 18, mix(P.fog, P.maroon, 0.3));
      }
    }
    // pendant lamp bokeh
    ellipse(c, 214, 8, 26, 10, mix(P.darkGreen, P.black, 0.5));
    ellipse(c, 214, 16, 14, 5, mix(P.cream, P.yellow, 0.4));
    // Ian behind the bench: white coat, cap, a loupe; leaning in, quietly concentrating
    const ix = 236;
    begin();
    pt(ix - 44, H);
    pt(ix - 40, 120);
    pt(ix - 26, 100);
    pt(ix - 10, 96);
    pt(ix + 10, 96);
    pt(ix + 26, 100);
    pt(ix + 40, 120);
    pt(ix + 44, H);
    fill(c, mix(P.silver, P.fog, 0.4), { d: P.fog, f: 0.35, m: 1, dd: P.steel, df: 0.1, side: 1 });
    rect(c, ix - 1, 100, 2, 116, P.fog);
    rect(c, ix - 8, 96, 16, 8, mix(P.skin, P.tan, 0.4));
    ellipse(c, ix, 78, 13, 17, mix(P.skin, P.tan, 0.35), { d: mix(P.skinShade, P.tan, 0.4), f: 0.3, m: 1, side: 1 });
    ellipse(c, ix, 64, 14, 7, mix(P.silver, P.white, 0.3));
    rect(c, ix - 15, 66, 30, 3, mix(P.fog, P.silver, 0.5));
    rect(c, ix - 7, 76, 5, 2, mix(P.brown, P.black, 0.4));
    rect(c, ix + 3, 76, 5, 2, mix(P.brown, P.black, 0.4));
    ellipse(c, ix + 6, 77, 4, 4, P.black);
    rect(c, ix - 4, 88, 8, 1, mix(P.skinShade, P.brown, 0.4));
    // the bench edge
    rect(c, 0, 176, KW, 40, mix(P.steel, P.ink, 0.45));
    rect(c, 0, 176, KW, 2, P.fog);
    yield* soften(c, KW, H, 4, { passes: 2 });
  }));
const ianGlow = lazy(() => pool('cn-ianglow', 120, 90, P.yellow, 6, 0.12));
const K_SQ_X = [[0, -70], [1.6, 0, 'smooth'], [3.6, 0], [4.4, -6, 'smooth']];
const K_ICRISP = [[0, -0.06], [1.9, -0.06], [2.5, 0.0, 'smooth']];

/** A brass set square in the picture plane, right-angle corner at (x, y), size s. */
function setSquare(ctx, x, y, s) {
  const k = s * 0.2;
  begin();
  pt(x, y);
  pt(x, y - s);
  pt(x + s, y);
  pt(x, y);
  pt(x + k, y - k);
  pt(x + s - k * 2.4, y - k);
  pt(x + k, y - s + k * 2.4);
  pt(x + k, y - k);
  fill(ctx, BRASS[2], { d: BRASS[1], f: 0.16, m: 1, dd: BRASS[0], df: 0.06, l: BRASS[3], lf: 0.08, lm: 1, side: 1 });
  line(ctx, x, y - s, x, y, BRASS[4]);
  line(ctx, x, y, x + s, y, BRASS[3]);
  for (let i = 1; i < 8; i++) rect(ctx, x + 1, y - (s * i) / 8, i & 1 ? 2 : 3, 1, BRASS[0]);
}

function shotIan(ctx, lt) {
  ctx.drawImage(workshop(), -round(lt * 1.5), 0);
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(ianGlow(), 94 - round(lt * 1.5), 0);
  ctx.globalCompositeOperation = 'source-over';
  // the crisp, held upright in tweezers, turns a hair to meet the square
  const turn = track(lt, K_ICRISP);
  mul(RC, rotAxis(RA, 1, 0, 0, PI / 2 - 0.12), rotAxis(RB, 0, 1, 0, 0.1));
  mul(RD, rotAxis(RA, 0, 0, 1, turn), RC);
  const s = 30;
  const T = dyn();
  splatBegin(T, null);
  splat(T, IAN_CRISP, s, RD, 0, 0, 0, CAM_I, 0.6, 0.05);
  splatEnd(T, ctx);
  // tweezers from the right, pinching the right edge
  proj(CAM_I, RD[0] * s * 0.92, RD[3] * s * 0.92, RD[6] * s * 0.92);
  const tx = round(PJ[0]);
  const ty = round(PJ[1]);
  for (const sgn of [-1, 1]) {
    begin();
    pt(tx - 3, ty + sgn * 2 - 1);
    pt(W + 20, ty + sgn * 12 - 3);
    pt(W + 20, ty + sgn * 12 + 2);
    pt(tx - 3, ty + sgn * 2 + 1);
    fill(ctx, P.fog, { d: P.steel, f: 0.4, m: 1, l: P.silver, lf: 0.2, lm: 1, side: 1 });
  }
  // the set square slides in from the left; its corner meets the crisp's lower-left corner
  proj(CAM_I, -s * 0.9, -s * 0.9, 0);
  const cx = round(PJ[0]) - 1 + round(track(lt, K_SQ_X));
  const cy = round(PJ[1]) + 2;
  setSquare(ctx, cx, cy, 64);
  // super
  const la = window01(lt, 1.0, 4.1, 0.4);
  if (la > 0) {
    ctx.globalAlpha = la;
    rect(ctx, 24, 193, round(2 + 120 * smooth((lt - 1.0) / 0.5)), 1, GOLD_D);
    ctx.globalAlpha = la * smooth((lt - 1.2) / 0.4);
    tracked(ctx, 'IAN', 24, 181, { color: P.white, track: 1 });
    tracked(ctx, 'MASTER SQUARER  ·  22 YEARS', 24, 198, { color: P.fog, font: 'micro', track: 1 });
    ctx.globalAlpha = 1;
  }
  vignette(ctx, 0.55);
}

// --- S4: salt drifts down a shaft of light onto the heap -------------------------------------
const shaftArt = lazy(() =>
  bake('cn-shaft', 170, H, function* paint(c) {
    const img = c.createImageData(170, H);
    const d = img.data;
    const steps = 6;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < 170; x++) {
        const u = (x - 85 + (y - 108) * 0.42) / 62;
        const q = clamp(1 - abs(u)) * clamp(1.15 - y / 240);
        const kk = q * steps;
        let i = floor(kk);
        if (kk - i > bayer(x, y)) i++;
        if (i <= 0) continue;
        const o = (y * 170 + x) * 4;
        d[o] = 255;
        d[o + 1] = 214;
        d[o + 2] = 150;
        d[o + 3] = round((i / steps) * 0.15 * 255);
      }
      if ((y & 3) === 3) yield;
    }
    c.putImageData(img, 0, 0);
  }));
// the heap's top edge (first opaque row per column), for flakes landing on it
const HEAP_TOP = new Int16Array(BW).fill(H);
let heapTopReady = false;
function heapTop() {
  if (heapTopReady) return HEAP_TOP;
  const cv = heapClose();
  const d = cv.getContext('2d').getImageData(0, 0, BW, H).data;
  for (let x = 0; x < BW; x++) {
    for (let y = 0; y < H; y++) {
      if (d[(y * BW + x) * 4 + 3] > 200) {
        HEAP_TOP[x] = y;
        break;
      }
    }
  }
  heapTopReady = true;
  return HEAP_TOP;
}
const FLAKES = Array.from({ length: 34 }, (_, i) => ({ x: 120 + hash(i * 2.3) * 150, t0: hash(i * 5.9) * 4.2, v: 26 + hash(i * 8.1) * 16, k: i }));
const K_SCAM = [[0, 0], [4.6, 12, 'smooth']];

function shotSalt(ctx, lt) {
  const camX = round(track(lt, K_SCAM));
  ctx.drawImage(kitchenFar(), -40 - round(camX * 0.3), -24);
  ctx.drawImage(tableClose(), -camX, 0);
  ctx.drawImage(heapClose(), -camX, 0);
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(shaftArt(), 104 - round(camX * 0.5), 0);
  ctx.globalCompositeOperation = 'source-over';
  const top = heapTop();
  for (const f of FLAKES) {
    const q = lt - f.t0;
    if (q < 0) continue;
    const x = f.x + sin(q * 1.4 + f.k) * 2 + q * 3;
    const xi = clamp(round(x), 0, BW - 1);
    const floorY = top[xi] < H ? top[xi] + 1 + (f.k % 4) : 200;
    let y = -6 + q * f.v;
    let landed = false;
    if (y >= floorY) {
      // land, hop once, rest as a white speck on the crisps
      const after = (y - floorY) / f.v;
      const hop = after < 0.3 ? sin((after / 0.3) * PI) * 2 : 0;
      y = floorY - hop;
      landed = after >= 0.3;
    }
    const inShaft = clamp(1 - abs(x - 190 - (y - 108) * -0.42) / 60);
    const glint = !landed && ((floor(lt * 7 + f.k * 1.7) % 6) === 0);
    ctx.globalAlpha = landed ? 0.9 : 0.45 + 0.5 * inShaft;
    rect(ctx, x - camX, y, glint ? 2 : 1, 1, glint || inShaft > 0.4 ? P.white : P.silver);
  }
  ctx.globalAlpha = 1;
  vignette(ctx, 0.55);
}

// --- S5: the pack, lit like a fragrance, is the end slate ------------------------------------
const PACK_W = 92;
const PACK_H = 128;
const packArt = lazy(() =>
  bake('cn-pack', PACK_W, PACK_H, function* paint(c) {
    const w = PACK_W;
    const h = PACK_H;
    // pillow-shaped matte charcoal pack: crimped seals, soft side falloff
    begin();
    pt(3, 10);
    pt(w / 2, 7);
    pt(w - 3, 10);
    pt(w - 1, h / 2);
    pt(w - 3, h - 10);
    pt(w / 2, h - 7);
    pt(3, h - 10);
    pt(1, h / 2);
    fill(c, mix(P.black, P.ink, 0.5));
    yield* shadeSteps(c, 0, 0, w, h, [P.black, mix(P.black, P.ink, 0.55), P.ink, mix(P.ink, P.slate, 0.35)], (x, y) => {
      if (y < 9 || y > h - 9) return -1;
      const across = sin((x / w) * PI);
      return clamp(0.15 + across * 0.55 - (x > w * 0.72 ? 0.25 : 0) - abs(y - h / 2) * 0.0015);
    });
    for (let x = 4; x < w - 4; x += 2) {
      rect(c, x, 3 + (x & 2 ? 1 : 0), 2, 7, mix(P.ink, P.black, 0.3));
      rect(c, x, h - 10 + (x & 2 ? 1 : 0), 2, 7, mix(P.ink, P.black, 0.3));
    }
    // gold foil: wordmark, rules, a square window onto a crisp
    rect(c, 12, 20, w - 24, 1, GOLD_D);
    thin(c, 'CORNERS', w / 2, 26, { color: GOLD, style: 'didone', track: 1, align: 'center' });
    rect(c, 12, 40, w - 24, 1, GOLD_D);
    const wx = w / 2 - 17;
    rect(c, wx, 48, 34, 34, mix(P.maroon, P.black, 0.3));
    const T = splatTarget(34, 34);
    T.under = null;
    const R = new Float64Array(9);
    mul(R, rotAxis(RA, 1, 0, 0, 0.9), rotAxis(RB, 0, 1, 0, 0.5));
    splat(T, shape(3, 30), 12, R, 0, 0, 0, camera(17, 18, 1, 0.3), 0.7, 0.08);
    T.c.putImageData(T.img, 0, 0);
    c.drawImage(T.cv, wx, 48);
    for (const [x0, y0, ww, hh] of [[wx, 48, 34, 1], [wx, 81, 34, 1], [wx, 48, 1, 34], [wx + 33, 48, 1, 34]]) rect(c, x0, y0, ww, hh, GOLD_D);
    tracked(c, 'SEA SALT', w / 2, 88, { color: mix(P.cream, GOLD, 0.3), font: 'micro', track: 2, align: 'center' });
    tracked(c, 'HAND-SQUARED', w / 2, 98, { color: GOLD_D, font: 'micro', track: 1, align: 'center' });
    tracked(c, '150 G', w / 2, 108, { color: mix(P.fog, P.ink, 0.3), font: 'micro', track: 1, align: 'center' });
  }));
const CAM_P = camera(96, 186, 0.8, 0.5);
const slateSet = lazy(() =>
  bake('cn-slate-set', W, H, function* paint(c) {
    // a dark, warm void with the counter receding into it; a soft key from the left
    yield* shadeSteps(c, 0, 0, W, 150, [P.black, mix(P.black, P.maroon, 0.45), mix(P.maroon, P.black, 0.2)], (x, y) => clamp(1 - Math.hypot((x - 110) / 220, (y - 90) / 120)) * 0.85);
    yield* shadeSteps(c, 0, 150, W, H - 150, OAK, (x, y) => {
      const grain = sin(y * 2.1 + 2 * sin(x * 0.02)) * 0.05;
      return clamp(0.12 + clamp(1 - Math.hypot((x - 100) / 230, (y - 160) / 50)) * 0.55 + grain - (y - 150) * 0.004);
    });
    rect(c, 0, 150, W, 1, mix(P.tanShade, P.tan, 0.4));
    // a few crisps scattered in front of the pack
    const T = splatTarget(W, H);
    T.under = null;
    const R = new Float64Array(9);
    const spots = [[-26, 14, 0.4, 2], [10, 22, -0.8, 5], [40, 10, 1.6, 6]];
    for (const [X, Z, yaw, seed] of spots) {
      mul(R, rotAxis(RA, 0, 1, 0, yaw), rotAxis(RB, 1, 0, 0.3, 0.12));
      const S = shape(seed, 40);
      const lift = -lowest(S, R, 14);
      shadow(c, CAM_P, X, Z, 14, 0);
      splat(T, S, 14, R, X, lift, Z, CAM_P, 0.5);
      yield;
    }
    T.c.putImageData(T.img, 0, 0);
    c.drawImage(T.cv, 0, 0);
  }));
const packGlow = lazy(() => pool('cn-packglow', 90, 80, P.yellow, 6, 0.1));
const LEGAL = 'EVERY CRISP IS CHECKED TO NINETY DEGREES, GIVE OR TAKE. IAN IS NOT AVAILABLE FOR PRIVATE SQUARING.';

function shotSlate(ctx, lt) {
  ctx.drawImage(slateSet(), 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(packGlow(), 6, 30);
  ctx.globalCompositeOperation = 'source-over';
  const px = 52;
  const py = 160 - PACK_H + 8;
  // the pack's reflection in the varnish, then the pack and its rim light
  ctx.globalAlpha = 0.14;
  ctx.save();
  ctx.translate(px, (py + PACK_H) * 2 - 14);
  ctx.scale(1, -1);
  ctx.drawImage(packArt(), 0, PACK_H - 26, PACK_W, 26, 0, py + PACK_H - 26, PACK_W, 26);
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.drawImage(packArt(), px, py);
  rect(ctx, px + PACK_W - 3, py + 12, 1, PACK_H - 24, mix(GOLD, P.yellow, 0.25));
  // one glint travels across the foil (the slate's only motion)
  const g = (lt - 1.4) / 1.1;
  if (g > 0 && g < 1) {
    ctx.globalAlpha = 0.6 * sin(g * PI);
    const gx = px + 10 + g * (PACK_W - 20);
    rect(ctx, gx, py + 22, 2, 14, P.white);
    rect(ctx, gx - 1, py + 28, 1, 3, P.white);
    ctx.globalAlpha = 1;
  }
  // the wordmark in the negative space on the right
  const cx = 262;
  ctx.globalAlpha = smooth((lt - 0.3) / 0.8);
  thin(ctx, 'CORNERS', cx, 62, { color: GOLD, style: 'didone', track: 4, scale: 2, align: 'center' });
  ctx.globalAlpha = 1;
  const rw = round(52 * smooth((lt - 0.8) / 0.7));
  if (rw > 0) rect(ctx, cx - rw, 89, rw * 2, 1, GOLD_D);
  ctx.globalAlpha = smooth((lt - 1.0) / 0.6);
  tracked(ctx, 'ARTISAN SQUARE CRISPS', cx, 95, { color: mix(GOLD, P.fog, 0.4), font: 'micro', track: 2, align: 'center' });
  ctx.globalAlpha = smooth((lt - 1.3) / 0.7);
  tracked(ctx, 'LIFE HAS ENOUGH CURVES.', cx, 118, { color: P.cream, track: 1, align: 'center' });
  ctx.globalAlpha = 1;
  smallPrint(ctx, LEGAL, 196, { color: P.fog, a: smooth((lt - 0.5) / 0.4), maxW: 330 });
}

const SHOTS = [
  { at: 0, draw: shotHero, tr: 'black', td: 1.0 },
  { at: T_TUMBLE, draw: shotTumble, tr: 'dip', td: 0.5 },
  { at: T_IAN, draw: shotIan, tr: 'dip', td: 0.5 },
  { at: T_SALT, draw: shotSalt, tr: 'dip', td: 0.5 },
  { at: T_SLATE, draw: shotSlate, tr: 'dip', td: 0.7 },
];

// A slow, velvet bed: soft electric-piano chords (minor ninths), a walking
// sine bass and brushed time. 70 bpm; the last chord rings out inside the spot.
const EP = { wave: 'triangle', a: 0.006, d: 1.4, s: 0.1, r: 0.8, vib: [6, 5, 0.3] };
const LEADV = { wave: 'sine', a: 0.04, d: 0.6, s: 0.6, r: 0.5, vib: [10, 5, 0.3] };

// Everything this spot bakes, in shot order: prewarmed in idle-time slices so
// no cut ever waits for a bake (see cine.js prewarm).
const WARM = [
  kitchenMacro, kitchenFar, tableArt, shadowArt, () => heapArt(0), () => heapArt(1), () => heapArt(2), () => heapArt(3), () => heapArt(4), () => heapArt(5),
  () => heapArt(6), workshop, ianGlow, tableClose, heapClose, shaftArt, packArt, slateSet, packGlow, () => vignetteArt(0.6), () => vignetteArt(0.55),
];
prewarm(WARM, 3000);

export default {
  id: 'corners',
  brand: 'CORNERS',
  duration: DURATION,
  voice: { gender: 'female', lang: 'en-GB', pitch: 0.85, rate: 0.86 },
  script: [
    { at: 0.6, text: 'This is not just a crisp.' },
    { at: 5.0, text: 'This is a slow-cooked, hand-squared crisp.' },
    { at: 10.3, text: 'Each one checked to ninety degrees. By Ian.' },
    { at: 14.7, text: "Seasoned with salt, from a sea we're not allowed to name." },
    { at: 20.2, text: 'Corners. Because life has enough curves.' },
  ],
  // Dm9 | G13 | Cmaj9 | A7 (b9) twice, resolving on Dm9 under the slate; every
  // track is 29.5 beats at 70 bpm (25.3 s, longer than the spot) and ends in rest.
  tune: {
    bpm: 70,
    swing: 0.12,
    room: 0.4,
    echo: { beats: 0.75, feedback: 0.2 },
    fadeOut: 1.4,
    tracks: [
      {
        kind: 'harmony',
        inst: EP,
        gain: 0.95,
        notes: 'D3+F3+A3+C4+E4:2@0.45 R:1 D3+F3+A3+C4+E4:1@0.3 G2+F3+B3+E4:2@0.45 R:1 G2+F3+B3+E4:1@0.3 C3+E3+B3+D4:2@0.45 R:1 C3+E3+B3+D4:1@0.3 A2+G3+C#4+Bb3:3@0.4 R:1 D3+F3+A3+C4+E4:2@0.45 R:1 D3+F3+A3+C4+E4:1@0.3 G2+F3+B3+E4:2@0.45 R:1 D3+F3+A3+E4:4@0.4 R:2.5',
      },
      {
        kind: 'lead',
        inst: LEADV,
        gain: 0.62,
        notes: 'R:2 A4:1@0.35 C5:1@0.35 B4:2@0.4 G4:2@0.35 E4:1.5@0.35 D4:0.5@0.3 E4:2@0.35 C#4:3@0.3 R:1 A4:1@0.35 C5:1@0.35 D5:2@0.4 E5:2@0.4 R:1 A4:4@0.35 R:2.5',
      },
      { kind: 'bass', inst: 'sine', gain: 0.8, notes: 'D2:2 A1:1 C2:1 G1:2 D2:1 F2:1 C2:2 G1:1 B1:1 A1:2 E2:1 C#2:1 D2:2 A1:1 C2:1 G1:2 B1:1 D2:4 R:2.5' },
      { drums: 'H:1@0.12 H:1@0.18 H:1@0.12 X:1@0.15 H:1@0.12 H:1@0.18 H:1@0.12 X:1@0.15 H:1@0.12 H:1@0.18 H:1@0.12 X:1@0.15 H:1@0.12 H:1@0.18 H:1@0.12 X:1@0.15 H:1@0.12 H:1@0.18 H:1@0.12 X:1@0.15 H:1@0.12 H:1@0.18 H:1@0.12 R:6.5' },
    ],
  },
  draw(ctx, t, dt, info) {
    prewarm(WARM);
    film(ctx, dt, info, SHOTS);
  },
};
