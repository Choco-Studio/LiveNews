// Channel ident (between programmes and breaks): a locked-off shot of Europe
// from orbit with ONE slow motion, the terminator crossing it. Seeded by the
// studio's daypart: in the evening and at night darkness arrives from the east
// and the cities come on behind it in palette steps (brown, orange, yellow);
// by day the morning light arrives from the east and the lights go out ahead
// of it. The GLOBIT 24 wordmark arrives over the horizon by a two-step palette
// fade (one step darker, then itself) and holds still. The earth moves the
// way the real one does (the terminator always travels west, right to left)
// and the motion is slow enough to read as light, not animation: about a
// tenth of the frame per second, eased in and out over 6 s, so a 3.2 s or a
// 5.5 s ident both look finished (channel-and-breaks.md 4.2).
//
//   drawIdentScene(ctx, dt, { variant: 'dusk' | 'dawn' }?)   full frame
//   identVariant()  'dusk' or 'dawn' from the London clock
//
// Palette colours only; Bayer 4x4 only in the terminator's falloff; the
// static layers (stars, the per-pixel sphere table) are built once.
import { P } from '../../palette.js';
import { drawLogo, measureLogo } from '../../logo.js';
import { landMip, cityLights } from '../worldmap.js';
import { u32, clamp, easeInOutSine, bayer, mk, clockIn, stepDown, HAS_DOM } from '../../gfx/index.js';
// (bayer(x, y) is precomputed per pixel in the sphere table: no per-frame divisions)
import { mulberry32 } from '../../util.js';

const W = 384;
const H = 216;
const DEG = Math.PI / 180;
const R = 400; // a big sphere seen from low orbit: only its northern cap is in frame
const CX = 192;
const CY = 546; // horizon at y 146 in the middle, y ~195 at the frame's edges
const Y0 = 140; // first buffer row
const BH = H - Y0;
const TILT = 18 * DEG; // the cap's centre is the Mediterranean, the horizon the Arctic
const CT = Math.cos(TILT);
const ST = Math.sin(TILT);
const LON0 = 4; // Europe faces the camera (the studio is in London)
const SWEEP = 6; // seconds for the whole move (the director holds the ident 3.2-6 s)

// colour per surface (0 sea, 1 land) x light level (0 night, 1 twilight, 2 day)
const SURF = [
  [u32(P.black), u32(P.ink), u32(P.navy)],
  [u32(P.ink), u32(P.slate), u32(P.steel)],
];
const SURF0 = SURF[0];
const SURF1 = SURF[1];
const LIMB = [u32(P.ink), u32(P.slate), u32(P.steel)]; // the 1 px air at the horizon, by light
const LIGHTS = [u32(P.brown), u32(P.orange), u32(P.yellow), u32(P.cream)];

/** 'dusk' (evening and night, cities coming on) or 'dawn' (morning and day) by London time. */
export function identVariant() {
  const hh = Number(String(clockIn().time).slice(0, 2));
  return Number.isFinite(hh) && hh >= 5 && hh < 17 ? 'dawn' : 'dusk';
}

// ---------------------------------------------------------------------------
// The sphere: per pixel of the cap, its normal (view space), land or sea, and whether it is the
// 1 px limb; built once (about 30k pixels, a few ms) in a background slice.
let TABLE = null;
function table() {
  if (TABLE) return TABLE;
  let mip = null;
  try {
    mip = landMip(2); // 1024 x 512 coverage
  } catch {
    mip = null;
  }
  const idx = [];
  const nxs = [];
  const kind = [];
  const bth = [];
  const RR = R + 0.5;
  for (let y = Y0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x + 0.5 - CX;
      const dy = CY - (y + 0.5);
      const d2 = dx * dx + dy * dy;
      if (d2 > (RR + 1) * (RR + 1)) continue;
      const i = (y - Y0) * W + x;
      if (d2 > RR * RR) {
        // the air: one pixel just outside the limb
        idx.push(i);
        nxs.push(dx / RR);
        kind.push(2);
        bth.push(bayer(x, y) - 0.5);
        continue;
      }
      const nx = dx / RR;
      const ny = dy / RR;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      // view -> earth: rotate about x so the screen's "up" is north
      const ey = ny * CT - nz * ST;
      const ez = ny * ST + nz * CT;
      const lat = Math.asin(clamp(ey, -1, 1)) / DEG;
      const lon = Math.atan2(nx, ez) / DEG + LON0;
      let land = 0;
      if (mip && mip.d) {
        const u = ((((lon + 180) / 360) % 1) + 1) % 1;
        const tx = Math.min(mip.w - 1, Math.floor(u * mip.w));
        const ty = clamp(Math.floor(((90 - lat) / 180) * mip.h), 0, mip.h - 1);
        land = mip.d[ty * mip.w + tx] > 127 ? 1 : 0;
      }
      idx.push(i);
      nxs.push(nx);
      kind.push(land);
      bth.push(bayer(x, y) - 0.5);
    }
  }
  // the city lights that fall on the visible cap: screen position and their own nx
  const L = cityLights();
  const lx = [];
  const ly = [];
  const lk = [];
  const ln = [];
  const lt = [];
  if (L) {
    const rnd = mulberry32(2401);
    for (let q = 0; q < L.n; q++) {
      const la = L.lat[q] * DEG;
      const lo = (L.lon[q] - LON0) * DEG;
      const ex = Math.cos(la) * Math.sin(lo);
      const ey = Math.sin(la);
      const ez = Math.cos(la) * Math.cos(lo);
      const ny = ey * CT + ez * ST;
      const nz = -ey * ST + ez * CT;
      const th = 0.015 + rnd() * 0.07; // each light comes on at its own depth of dusk
      if (nz < 0.03) continue;
      const px = Math.floor(CX + ex * R);
      const py = Math.floor(CY - ny * R);
      if (px < 0 || px >= W || py < Y0 || py >= H) continue;
      const dx = px + 0.5 - CX;
      const dy = CY - (py + 0.5);
      if (dx * dx + dy * dy > (R - 1) * (R - 1)) continue;
      lx.push(px);
      ly.push(py - Y0);
      lk.push(L.kind[q]);
      ln.push(ex);
      lt.push(th);
    }
  }
  const cv = mk(W, BH);
  const cx = cv.getContext('2d');
  const img = cx.createImageData(W, BH);
  TABLE = {
    idx: Int32Array.from(idx), nx: Float32Array.from(nxs), kind: Uint8Array.from(kind), bth: Float32Array.from(bth),
    lx: Int16Array.from(lx), ly: Int16Array.from(ly), lk: Uint8Array.from(lk), ln: Float32Array.from(ln), lt: Float32Array.from(lt),
    cv, cx, img, d: new Uint32Array(img.data.buffer), key: NaN, lights: !!L,
  };
  return TABLE;
}

/** Terminator position (the nx where night begins) at dt, and which side is lit. */
function terminator(dt, variant) {
  const e = easeInOutSine(clamp(dt / SWEEP, 0, 1));
  // the terminator always travels west (right to left): at dusk the night side is on the right
  // (east) and spreads left; at dawn the day side is on the right and spreads left
  return variant === 'dawn' ? 0.2 - 0.5 * e : 0.32 - 0.5 * e;
}

function renderCap(T, u, variant) {
  const d = T.d;
  const { idx, nx, kind, bth } = T;
  const nightRight = variant !== 'dawn';
  const sgn = nightRight ? -1 : 1;
  const off = nightRight ? u : -u;
  for (let k = 0; k < idx.length; k++) {
    // signed distance into the day side (in normal units); the dithered falloff is 0.1 wide
    const s = sgn * nx[k] + off;
    const v = s <= -0.05 ? 0 : s >= 0.05 ? 2 : (s + 0.05) * 20;
    let lvl = Math.floor(v + bth[k]);
    lvl = lvl < 0 ? 0 : lvl > 2 ? 2 : lvl;
    const kd = kind[k];
    d[idx[k]] = kd === 2 ? LIMB[lvl] : kd ? SURF1[lvl] : SURF0[lvl];
  }
  // city lights on the night side, each coming on (or going out) in palette steps
  const { lx, ly, lk, ln, lt } = T;
  for (let q = 0; q < lx.length; q++) {
    const dd = nightRight ? ln[q] - u : u - ln[q]; // depth into the night
    const over = dd - lt[q];
    if (over <= 0) continue;
    const step = over < 0.025 ? 0 : over < 0.05 ? 1 : lk[q] === 3 ? 3 : 2;
    d[ly[q] * W + lx[q]] = LIGHTS[step];
  }
  T.cx.putImageData(T.img, 0, 0);
}

// ---------------------------------------------------------------------------
// The field: black to ink above the horizon, a few still stars well away from the wordmark.
let FIELD = null;
function field() {
  if (FIELD) return FIELD;
  const c = mk(W, H);
  const x = c.getContext('2d');
  const img = x.createImageData(W, H);
  const d = new Uint32Array(img.data.buffer);
  const black = u32(P.black);
  const ink = u32(P.ink);
  for (let yy = 0; yy < H; yy++) {
    // the sky is a touch lighter just above the horizon (ink), black higher up
    const v = clamp((yy - 96) / 50, 0, 1);
    for (let xx = 0; xx < W; xx++) d[yy * W + xx] = v > bayer(xx, yy) ? ink : black;
  }
  const rnd = mulberry32(77);
  const cols = [u32(P.slate), u32(P.steel), u32(P.fog)];
  for (let i = 0; i < 46; i++) {
    const sx = Math.floor(rnd() * W);
    const sy = Math.floor(rnd() * 132);
    const b = rnd();
    if (sx > 60 && sx < 324 && sy > 26 && sy < 124) continue; // the wordmark's area stays calm
    d[sy * W + sx] = cols[b > 0.93 ? 2 : b > 0.6 ? 1 : 0];
  }
  x.putImageData(img, 0, 0);
  FIELD = c;
  return c;
}

// the wordmark, one palette step darker (baked once)
let DIM = null;
const LOGO_SCALE = 2;
function dimLogo() {
  if (DIM) return DIM;
  const size = measureLogo({ variant: 'full', scale: LOGO_SCALE, slogan: true });
  const c = mk(size.w + 8, size.h + 8);
  const cx = c.getContext('2d');
  drawLogo(cx, (size.w + 8) / 2, 4, { variant: 'full', scale: LOGO_SCALE, slogan: true, align: 'center' });
  const img = cx.getImageData(0, 0, c.width, c.height);
  stepDown(new Uint32Array(img.data.buffer), 1);
  cx.putImageData(img, 0, 0);
  DIM = { cv: c, w: size.w, h: size.h };
  return DIM;
}

const LOGO_Y = 42;
/** The ident at dt seconds (full frame). opts.variant forces 'dusk' or 'dawn'. */
export function drawIdentScene(ctx, dt, opts = null) {
  const t = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  const variant = opts?.variant === 'dawn' || opts?.variant === 'dusk' ? opts.variant : identVariant();
  ctx.drawImage(field(), 0, 0);
  const T = table();
  const u = terminator(t, variant);
  const key = Math.round(u * 2000) * 2 + (variant === 'dawn' ? 1 : 0);
  if (T.key !== key || (!T.lights && cityLights())) {
    if (!T.lights && cityLights()) {
      // the light data arrived after the table was built: rebuild once with it
      TABLE = null;
      return drawIdentScene(ctx, t, opts);
    }
    T.key = key;
    renderCap(T, u, variant);
  }
  ctx.drawImage(T.cv, 0, Y0);
  // the wordmark: one step darker for 0.15 s, then itself; still from 0.65 s
  const g = t - 0.5;
  if (g < 0) return;
  if (g < 0.15) {
    const s = dimLogo();
    ctx.drawImage(s.cv, Math.round(W / 2 - (s.w + 8) / 2), LOGO_Y - 4);
    return;
  }
  drawLogo(ctx, W / 2, LOGO_Y, { variant: 'full', scale: LOGO_SCALE, slogan: true, align: 'center' });
}

/** Background jobs (one per timer slice) so the first ident never stutters. */
export const IDENT_WARM = HAS_DOM ? [field, table, dimLogo] : [];
