// WORLD NOW open: the planet turns to London. A shaded globe built from the
// Natural Earth land mask opens like an iris around the bit, spins down to
// Europe, London gets a marker and one ripple, and three great-circle routes
// draw out of it in the brand red. Accent: red.
import { P } from '../../palette.js';
import { LAND } from '../worlddata.js';
import { u32, clamp, seg, easeOut, easeOutQuint, bayer, ring } from '../../gfx/index.js';
import { backdrop, frameBuffer, clipDisc, playOpen, CENTRE } from './kit.js';

const DEG = Math.PI / 180;
const R0 = 34; // globe radius in the lock-up (x ZOOM at centre stage)
const TILT = 24 * DEG; // north pole tipped towards the camera
const CT = Math.cos(TILT);
const ST = Math.sin(TILT);
const LIGHT = (() => {
  const v = [-0.55, 0.52, 0.66];
  const n = Math.hypot(...v);
  return v.map((a) => a / n);
})();
const LAM_END = -12; // centre longitude when settled: Europe and Africa face us
const LONDON = [51.5, -0.13];
const ROUTES = [[40.7, -74.0], [-1.3, 36.8], [28.6, 77.2]]; // New York, Nairobi, New Delhi

// --- texture: 512x256 equirectangular, bit0 land, bit1 graticule, bit2 equator
const TW = 512;
const TH = 256;
let TEX = null;
export function globeTexture() {
  if (TEX) return TEX;
  const tex = new Uint8Array(TW * TH);
  try {
    const bin = atob(LAND.rle);
    const SW = LAND.w;
    const SH = LAND.h;
    const fx = SW / TW;
    const fy = SH / TH;
    const cov = new Float32Array(TW);
    const thr = fx * fy * 0.5;
    let p = 0;
    for (let j = 0; j < SH && p < bin.length; j++) {
      let x = 0;
      let cur = 0;
      while (x < SW && p < bin.length) {
        let run = 0;
        let shift = 0;
        let b;
        do {
          b = bin.charCodeAt(p++);
          run |= (b & 127) << shift;
          shift += 7;
        } while (b & 128 && p < bin.length && shift < 28);
        run = Math.min(run, SW - x);
        if (cur && run > 0) {
          const e = x + run;
          const i0 = Math.floor(x / fx);
          const i1 = Math.floor((e - 1) / fx);
          if (i0 === i1) cov[i0] += e - x;
          else {
            cov[i0] += (i0 + 1) * fx - x;
            for (let i = i0 + 1; i < i1; i++) cov[i] += fx;
            cov[i1] += e - i1 * fx;
          }
        }
        x += run;
        cur ^= 1;
      }
      if ((j + 1) % fy === 0) {
        const row = ((j + 1) / fy - 1) * TW;
        for (let i = 0; i < TW; i++) {
          tex[row + i] = cov[i] > thr ? 1 : 0;
          cov[i] = 0;
        }
      }
    }
  } catch {
    /* no land data: an ocean world */
  }
  for (const lat of [-60, -30, 30, 60]) {
    const j = clamp(Math.round(((90 - lat) / 180) * TH - 0.5), 0, TH - 1);
    for (let i = 0; i < TW; i++) tex[j * TW + i] |= 2;
  }
  for (let i = 0; i < TW; i++) tex[127 * TW + i] |= 4;
  for (let lon = -180; lon < 180; lon += 30) {
    const i = ((Math.round(((lon + 180) / 360) * TW) % TW) + TW) % TW;
    for (let j = 10; j < TH - 10; j++) tex[j * TW + i] |= 2;
  }
  TEX = tex;
  return tex;
}

// colour per texel type (land / graticule / equator / ocean) x light level 0..4,
// plus the limb: 5 = lit rim, 6 = dark rim. Palette colours only.
const LUT = (() => {
  const L = new Uint32Array(8 * 8);
  const ocean = [P.black, P.ink, P.ink, P.navy, P.navy];
  const land = [P.ink, P.slate, P.steel, P.fog, P.silver];
  const grid = [P.ink, P.slate, P.slate, P.blue, P.blue];
  const equ = [P.maroon, P.darkRed, P.darkRed, P.red, P.red];
  for (let tv = 0; tv < 8; tv++) {
    const set = tv & 4 ? equ : tv & 1 ? land : tv & 2 ? grid : ocean;
    for (let lvl = 0; lvl < 5; lvl++) L[(tv << 3) | lvl] = u32(set[lvl]);
    L[(tv << 3) | 5] = u32(tv & 1 ? P.white : P.silver);
    L[(tv << 3) | 6] = u32(P.slate);
  }
  return L;
})();

const TABLES = new Map();
function globeTable(R) {
  let TABLE = TABLES.get(R);
  if (TABLE) return TABLE;
  const M = 2;
  const S = 2 * R + 1 + 2 * M;
  const c = R + M;
  const idx = [];
  const row = [];
  const lon = [];
  const cls = [];
  const RR = R + 0.5;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x - c;
      const dy = y - c;
      const d2 = dx * dx + dy * dy;
      if (d2 > RR * RR) continue;
      const nx = dx / RR;
      const ny = -dy / RR;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const gy = ny * CT + nz * ST;
      const gz = -ny * ST + nz * CT;
      const la = Math.asin(clamp(gy, -1, 1)) / DEG;
      const lo = Math.atan2(nx, gz) / DEG;
      idx.push(y * S + x);
      row.push(clamp(Math.floor(((90 - la) / 180) * TH), 0, TH - 1) * TW);
      lon.push(((lo + 180) / 360) * TW);
      const dif = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
      let k;
      if (Math.sqrt(d2) > RR - 1.1) k = dif > 0.05 ? 5 : 6;
      else {
        const v = clamp((dif + 0.1) * 3.3, 0, 3.999);
        k = Math.min(4, Math.floor(v) + (v - Math.floor(v) > bayer(x, y) ? 1 : 0));
      }
      cls.push(k);
    }
  }
  const fb = frameBuffer('wn-globe', S, S);
  TABLE = { fb, c, S, idx: Int32Array.from(idx), row: Int32Array.from(row), lon: Float32Array.from(lon), cls: Uint8Array.from(cls) };
  TABLES.set(R, TABLE);
  return TABLE;
}

function drawGlobe(ctx, x, y, R, lam0) {
  const T = globeTable(R);
  const fb = T.fb;
  const key = Math.round(lam0 * 8);
  if (fb.key !== key) {
    fb.key = key;
    const tex = globeTexture();
    const sh = (((lam0 / 360) * TW) % TW) + TW * 16;
    const { idx, row, lon, cls } = T;
    const d = fb.d;
    for (let k = 0; k < idx.length; k++) {
      const i = ((lon[k] + sh) | 0) & (TW - 1);
      d[idx[k]] = LUT[(tex[row[k] + i] << 3) | cls[k]];
    }
    fb.cx.putImageData(fb.img, 0, 0);
  }
  ctx.drawImage(fb.cv, x - T.c, y - T.c);
}

/** Earth-frame unit vector of a lat/lon. */
const evec = (lat, lon) => [Math.cos(lat * DEG) * Math.sin(lon * DEG), Math.sin(lat * DEG), Math.cos(lat * DEG) * Math.cos(lon * DEG)];
/** Screen offset of an earth-frame vector for centre longitude lam0: [x, y, depth]. */
function project(v, lam0, R, out) {
  const cl = Math.cos(lam0 * DEG);
  const sl = Math.sin(lam0 * DEG);
  const x = v[0] * cl - v[2] * sl;
  const z = v[0] * sl + v[2] * cl;
  const vy = v[1] * CT - z * ST;
  const vz = v[1] * ST + z * CT;
  out[0] = x * (R + 0.5);
  out[1] = -vy * (R + 0.5);
  out[2] = vz;
  return out;
}

// great-circle routes out of London, lifted slightly off the surface
const ROUTE_PTS = ROUTES.map(([la, lo]) => {
  const a = evec(...LONDON);
  const b = evec(la, lo);
  const om = Math.acos(clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1));
  const n = Math.max(12, Math.round((om / DEG) * 0.9));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const ka = Math.sin((1 - s) * om) / Math.sin(om);
    const kb = Math.sin(s * om) / Math.sin(om);
    const h = 1 + 0.12 * Math.sin(Math.PI * s);
    pts.push([(a[0] * ka + b[0] * kb) * h, (a[1] * ka + b[1] * kb) * h, (a[2] * ka + b[2] * kb) * h]);
  }
  return pts;
});

/** Centre longitude at dt: a fast turn that decelerates onto Europe by 2.4 s. */
function lambda(dt) {
  return LAM_END + 260 * (1 - easeOutQuint(seg(dt, 0.15, 2.25)));
}

const TMP = [0, 0, 0];
function emblem(ctx, dt, x, y, k = 1) {
  if (dt < 0.2) return;
  const R = Math.round(R0 * k);
  const lam = lambda(dt);
  const iris = Math.round((R + 3) * easeOutQuint(seg(dt, 0.2, 0.6)));
  if (iris < R + 3) {
    ctx.save();
    clipDisc(ctx, x, y, iris);
    drawGlobe(ctx, x, y, R, lam);
    ctx.restore();
    // the iris edge: a thin silver ring that leads the reveal
    if (iris > 1) ring(ctx, x, y, iris, P.silver);
  } else drawGlobe(ctx, x, y, R, lam);

  // routes draw out of London once the turn slows
  for (let r = 0; r < ROUTE_PTS.length; r++) {
    const pts = ROUTE_PTS[r];
    const p = easeOut(seg(dt, 0.95 + r * 0.12, 0.55));
    if (p <= 0) continue;
    const upto = Math.round((pts.length - 1) * p);
    ctx.fillStyle = P.red;
    for (let i = 0; i <= upto; i++) {
      project(pts[i], lam, R, TMP);
      if (TMP[2] < 0.05) continue;
      if (i % 2 === 0 || i === upto) ctx.fillRect(Math.round(x + TMP[0]), Math.round(y + TMP[1]), 1, 1);
    }
    if (p >= 1) {
      project(pts[pts.length - 1], lam, R, TMP);
      if (TMP[2] > 0.08) {
        ctx.fillStyle = P.white;
        ctx.fillRect(Math.round(x + TMP[0]), Math.round(y + TMP[1]), 1, 1);
      }
    }
  }
  // London: marker and a single ripple
  if (dt > 0.85) {
    project(evec(...LONDON), lam, R, TMP);
    if (TMP[2] > 0.05) {
      const lx = Math.round(x + TMP[0]);
      const ly = Math.round(y + TMP[1]);
      const rp = seg(dt, 0.9, 0.7);
      if (rp > 0 && rp < 1) ring(ctx, lx, ly, 2 + Math.round(12 * easeOut(rp)), P.red, 1 - rp);
      ctx.fillStyle = P.red;
      ctx.fillRect(lx - 1, ly - 1, 3, 3);
      ctx.fillStyle = P.white;
      ctx.fillRect(lx, ly, 1, 1);
    }
  }
}

const background = () => backdrop({ key: 'world', colors: [P.black, P.ink], cx: CENTRE.x, cy: CENTRE.y, reach: 230 });

export const WORLD = {
  accent: P.red,
  style: { accent: P.red, plate: P.black, ink: 'light' },
  background,
  emblem,
  absorb: 0.24,
  shoulder: 27,
  warm: () => {
    globeTexture();
    for (let r = R0; r <= Math.round(R0 * 1.6); r++) globeTable(r);
  },
};

export function drawWorldNow(ctx, dt, info) {
  playOpen(ctx, dt, info, WORLD);
}
