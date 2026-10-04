// WORLD NOW's window on the city (round 4): the newsroom's back wall is floor-to-ceiling glass over a city by
// night, as at CNN's Hudson Yards, Sky News's Osterley or ABC's Times Square studios. The city stands far
// behind the glass (its own plane, CITY.Z), so it moves less than the set when the camera moves, and a close
// shot sees more of it, smaller. The horizon sits at the camera's eye height (the studio is high up): the
// glow of the sky behind the presenters' heads, towers rising from a sea of lights below.
//
// In focus (wides): a banded night sky, a hazy far skyline, towers with lit windows on a pixel grid (office
// floors in cool light, homes in warm), crowns, masts with red lights, a TV tower, and below the horizon the
// avenues' sodium lamps. Out of focus (singles): the same city as bokeh — soft dark masses and discs of light.
//
//   drawCity(fr, cam, box, soft)   box: screen rect {x0, y0, x1, y1} to fill (the glass)
//   LIVE_DRAW['world-now']         a plane crossing the sky, cars on the avenues (live.js)
import { C } from '../pixbuf.js';
import { F } from './geometry.js';
import { livePoint, BLINK, LIVE_DRAW } from './live.js';
import { bokeh, RAMPS } from './light.js';

const W = 384, H = 216;
export const CITY = { Z: 3200, horizon: -56 };

function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => ((a = (Math.imul(a ^ (a >>> 15), 2246822519) + 0x9e3779b9) >>> 0) / 4294967296);
}
const hash = (a, b, c = 0) => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35) ^ Math.imul(c + 0x27d4eb2f, 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
};
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bay = (x, y) => (B4[((y & 3) << 2) | (x & 3)] + 0.5) / 16;

// --------------------------------------------------------------------------- the city (city units on its plane)
// heights are above the horizon; a tower's foot is below it (`foot` units: nearer towers stand lower)
const LANDMARKS = [
  { X: -440, w: 44, h: 96, crown: 'spire', kind: 'office' },
  { X: 432, w: 0, h: 134, crown: 'tv' },
  { X: -700, w: 52, h: 86, crown: 'deco', kind: 'office' },
  { X: 650, w: 48, h: 90, crown: 'slant', kind: 'office' },
];
// office floors in bands, homes window by window, a dark block, a glass tower with lit vertical strips
const KINDS = ['office', 'office', 'home', 'home', 'home', 'dark', 'glass'];
function buildCity() {
  const r = rng(4242);
  const far = [], mid = [];
  for (let X = -1800; X < 1800; ) {
    const w = 26 + r() * 56;
    far.push({ X0: X, X1: X + w, h: 10 + r() * 40, seed: far.length });
    X += w + (r() < 0.35 ? 9 + r() * 12 : 0); // a gap shows sky (never a sliver that comes and goes in a move)
  }
  const busy = (a, b) => LANDMARKS.some((l) => b > l.X - l.w / 2 - 10 && a < l.X + l.w / 2 + 10);
  for (let X = -1800; X < 1800; ) {
    const w = 22 + r() * 46;
    if (busy(X, X + w)) {
      X += 8;
      continue;
    }
    const tall = r() < 0.18;
    const h = tall ? 64 + r() * 30 : 20 + r() * 40;
    const pick = r();
    const crown = h > 50 && pick < 0.3 ? 'antenna' : pick < 0.45 ? 'step' : pick < 0.55 ? 'slant' : 'flat';
    mid.push({ X0: X, X1: X + w, h, foot: 14 + r() * 50, crown, kind: KINDS[Math.floor(r() * KINDS.length)], lit: 0.16 + r() * 0.26, seed: 100 + mid.length });
    X += w + (r() < 0.5 ? 8 + r() * 26 : 0);
  }
  for (const l of LANDMARKS) if (l.crown !== 'tv') mid.push({ X0: l.X - l.w / 2, X1: l.X + l.w / 2, h: l.h, foot: 70, crown: l.crown, kind: l.kind, lit: 0.34, seed: 900 + mid.length, landmark: true });
  // draw back to front: shorter feet (farther) first
  mid.sort((a, b) => a.foot - b.foot);
  return { far, mid, tv: LANDMARKS.find((l) => l.crown === 'tv') };
}
const TOWN = buildCity();

const WARM = [C.orange, C.tan, C.tan, C.yellow, C.tanShade];
const COOL = [C.fog, C.steel, C.fog, C.silver];

// --------------------------------------------------------------------------- projection on the city plane
const P = { k: 1, cx: 0, cy: 0, hy: 0 };
function plane(cam) {
  P.k = (F * cam.zoom) / (CITY.Z - cam.z);
  P.cx = cam.x;
  P.cy = cam.y;
  P.hy = cam.hy;
  return P;
}
const sx = (X) => 192 + (X - P.cx) * P.k;
const sy = (Y) => P.hy + (Y - P.cy) * P.k;
/** Screen row of a height above the horizon. */
const rowOf = (h) => sy(CITY.horizon - h);

// sky by height above the horizon (city units): black, ink, the navy glow of the city near the horizon
function skyColour(h, x, y, soft) {
  // black high up, so the ink towers stand out against it; a short ink band, then the navy glow they rise from
  const band = soft ? 14 : 7;
  const t1 = 58, t2 = 26;
  if (h > t1 + band) return C.black;
  if (h > t1 - band) return (t1 + band - h) / (2 * band) > bay(x, y) ? C.ink : C.black;
  if (h > t2 + band) return C.ink;
  if (h > t2 - band) return (t2 + band - h) / (2 * band) > bay(x, y) ? C.navy : C.ink;
  if (h > -6) return C.navy;
  // below the horizon the haze falls back to the ground's dark in a short band
  if (h > -6 - band) return (h + 6 + band) / band > bay(x, y) ? C.navy : C.ink;
  // the city below: the haze of its light over the roofs
  return C.ink;
}

// --------------------------------------------------------------------------- drawing
const STATE = { glassCol: new Uint8Array(W), box: { x0: 0, y0: 0, x1: 0, y1: 0 } };
/** Columns where the plane may show (glass, not a mullion): the dressing marks the mullions. */
export const GLASS_COL = STATE.glassCol;

export function drawCity(fr, cam, box, soft) {
  plane(cam);
  const px = fr.px;
  const xa = Math.max(0, box.x0), xb = Math.min(W, box.x1), ya = Math.max(0, box.y0), yb = Math.min(H, box.y1);
  if (xb <= xa || yb <= ya) return;
  Object.assign(STATE.box, { x0: xa, y0: ya, x1: xb, y1: yb });
  STATE.glassCol.fill(0, 0, W);
  STATE.glassCol.fill(1, xa, xb);
  AVENUES.fill(0);
  const k = P.k;
  const yh = rowOf(0);
  // the sky and the ground's haze
  for (let y = ya; y < yb; y++) {
    const h = (yh - (y + 0.5)) / k;
    const row = y * W;
    for (let x = xa; x < xb; x++) px[row + x] = skyColour(h, x, y, soft);
  }
  const put = (x, y, c) => {
    if (x >= xa && x < xb && y >= ya && y < yb) px[y * W + x] = c;
  };
  if (!soft) {
    // stars in the black top of the sky (steel, two fog)
    const r = rng(77);
    for (let n = 0; n < 40; n++) {
      const X = -1400 + r() * 2800, hh = 104 + r() * 60;
      const x = Math.round(sx(X)), y = Math.round(rowOf(hh));
      if (x >= xa && x < xb && y >= ya && y < yb && px[y * W + x] === C.black) {
        const c = n % 9 === 0 ? C.fog : C.steel;
        px[y * W + x] = c;
        if (n % 4 === 0) livePoint(x, y, c, C.ink, BLINK.TWINKLE, hash(n, 3));
      }
    }
  }
  // the ground below the horizon, seen from high up: a carpet of light packed along the horizon, avenues in rows
  // that open out toward the camera, boulevards running to vanishing points on the horizon, and the blocks'
  // own lights thinning out over the dark roofs nearer the studio
  const groundY0 = Math.max(ya, Math.ceil(yh + 1.5 * k));
  const ox = Math.round(sx(0));
  if (!soft) {
    const lamp = (x, y, h) => {
      if (x >= xa && x < xb && y >= groundY0 && y < yb && px[y * W + x] !== C.navy) px[y * W + x] = h < 0.22 ? C.yellow : h < 0.7 ? C.orange : h < 0.9 ? C.tan : C.fog;
    };
    for (let n = 1; n < 40; n++) {
      const d = 3.4 * Math.pow(n, 1.5);
      const y = Math.round(yh + d * k);
      if (y >= yb) break;
      AVENUES[n] = y;
      if (y < groundY0) continue;
      const pitch = Math.max(2, Math.round(1.5 + n * 0.45));
      for (let x = xa; x < xb; x++) {
        if ((x - ox + 4000 * pitch) % pitch) continue;
        const h = hash(n, x - ox);
        if (h < 0.25 + Math.min(0.4, n * 0.025)) continue; // gaps along the avenue, more of them nearer
        lamp(x, y, hash(x - ox, n, 3));
      }
    }
    // boulevards: lines of lamps from vanishing points on the horizon, fanning down toward the camera
    for (const [VX, slope] of [[-260, -1.7], [-520, 2.2], [300, 1.6], [760, -2.4], [80, -3.6]]) {
      const vx = sx(VX);
      for (let y = groundY0 + 1; y < yb; y++) {
        const dy = y + 0.5 - yh;
        const x = Math.round(vx + slope * dy);
        const step = Math.max(2, Math.round(dy * 0.18));
        if ((y - groundY0) % step) continue;
        lamp(x, y, hash(y, VX));
      }
    }
    // the carpet along the horizon and the blocks' lights, thinning out with distance below it
    for (let y = groundY0; y < yb; y++) {
      const d = (y + 0.5 - yh) / k;
      const dens = 0.003 + 0.07 * Math.exp(-d / 14) + 0.012 * Math.exp(-d / 80);
      const row = y * W;
      for (let x = xa; x < xb; x++) {
        if (px[row + x] !== C.black && px[row + x] !== C.ink) continue;
        const h = hash(x - ox, y - Math.round(yh), 5);
        if (h < dens) px[row + x] = h < dens * 0.25 ? C.tan : h < dens * 0.6 ? C.tanShade : C.brown;
      }
    }
  } else {
    // out of focus: discs of light, packed and small along the horizon, fewer and larger nearer the camera
    const r = rng(91);
    const bs = bokehScale(k);
    const clip = (X, Y) => X >= xa && X < xb && Y >= groundY0 && Y < yb;
    for (let n = 0; n < 520; n++) {
      const X = -1100 + r() * 2200, d = 2 + Math.pow(r(), 2.1) * 280;
      const x = sx(X), y = yh + d * k;
      const h = r(), big = r();
      if (x < xa - 8 || x >= xb + 8 || y < groundY0 - 6 || y >= yb + 8) continue;
      const rad = Math.max(1.5, Math.min(5.5, (1.1 + d * 0.01 + big * 1.2) * bs));
      // most discs dim (a defocused light spreads out), a few bright
      const bright = big > 0.86;
      if (h < 0.5) bokeh(fr, x, y, rad, RAMPS.orange, { fill: bright ? C.rust : C.brown, rim: bright ? C.orange : C.rust, clip });
      else if (h < 0.75) bokeh(fr, x, y, rad, RAMPS.warm, { fill: bright ? C.tanShade : C.brown, rim: bright ? C.tan : C.tanShade, clip });
      else if (h < 0.93) bokeh(fr, x, y, rad, RAMPS.cool, { fill: bright ? C.steel : C.slate, rim: bright ? C.fog : C.steel, clip });
      else bokeh(fr, x, y, rad, RAMPS.red, { fill: C.maroon, rim: C.darkRed, clip });
    }
  }
  // the far skyline on the horizon: hazy slate blocks with a few dim lights (in focus); ink masses out of focus
  for (const b of TOWN.far) {
    const x0 = Math.round(sx(b.X0)), x1 = Math.round(sx(b.X1));
    const cx0 = Math.max(xa, x0), cx1 = Math.min(xb, x1);
    if (cx1 <= cx0) continue;
    const y0 = Math.round(rowOf(b.h)), y1 = Math.min(yb, Math.round(rowOf(-3)));
    const c = soft ? C.ink : C.slate;
    for (let y = Math.max(ya, y0); y < y1; y++) px.fill(c, y * W + cx0, y * W + cx1);
    if (soft) {
      // its lights: a few small dim discs
      const rad = Math.max(1.4, 1.2 * bokehScale(k));
      for (let n = 0; n < 3; n++) {
        if (hash(b.seed, n, 8) > 0.5) continue;
        const x = sx(b.X0 + hash(b.seed, n, 9) * (b.X1 - b.X0)), y = rowOf(b.h * (0.2 + 0.7 * hash(b.seed, n, 10)));
        bokeh(fr, x, y, rad, RAMPS.warm, { fill: C.brown, rim: C.tanShade, clip: (X, Y) => X >= xa && X < xb && Y >= ya && Y < yb });
      }
      continue;
    }
    if (x1 - 1 >= xa && x1 - 1 < xb) for (let y = Math.max(ya, y0); y < y1; y++) px[y * W + x1 - 1] = C.ink;
    for (let y = y0 + 2; y < y1; y += 3) for (let x = x0 + 1; x < x1 - 1; x += 2) {
      const h = hash(b.seed, x - x0, y - y0);
      if (h < 0.14) put(x, y, h < 0.03 ? C.tanShade : C.steel);
    }
  }
  // the TV tower far off: a shaft widening to its foot, the pod's lit ring, the mast and its light
  tvTower(fr, put, soft);
  // the towers
  const pitchX = Math.max(2, Math.round(7 * k)), pitchY = Math.max(3, Math.round(10 * k));
  const ww = Math.max(1, Math.round(3 * k));
  const scale = bokehScale(k);
  for (const b of TOWN.mid) {
    const x0 = Math.round(sx(b.X0)), x1 = Math.round(sx(b.X1));
    if (x1 <= xa || x0 >= xb || x1 - x0 < 2) continue;
    const y0 = Math.round(rowOf(b.h)), y1 = Math.min(yb, Math.round(rowOf(-b.foot)));
    if (y0 >= yb) continue;
    // the towers stand ink against the sky (the city's glow lights the haze between them), their lit edge slate
    const body = C.ink;
    const cx0 = Math.max(xa, x0), cx1 = Math.min(xb, x1);
    for (let y = Math.max(ya, y0); y < y1; y++) px.fill(body, y * W + cx0, y * W + cx1);
    const mid = (x0 + x1) >> 1;
    const topY = crown(fr, put, b, x0, x1, y0, mid, body, soft, k);
    if (soft) {
      // its lights as bokeh: a coarse grid of the lit windows in city units (so a move never re-picks them), a disc each
      const rad = Math.max(1.6, Math.min(4.5, 2.2 * scale));
      const lights = b.kind === 'office' || b.kind === 'glass' ? RAMPS.cool : RAMPS.warm;
      const cool = b.kind === 'office' || b.kind === 'glass';
      const GX = 15, GY = 16, nc = Math.max(1, Math.floor((b.X1 - b.X0) / GX));
      for (let r = 1; CITY.horizon - b.h + r * GY < CITY.horizon + b.foot; r++) {
        const y = sy(CITY.horizon - b.h + r * GY);
        if (y < ya - rad || y >= yb + rad) continue;
        const share = b.kind === 'dark' ? 0.06 : b.kind === 'office' ? (hash(b.seed, r, 2) < 0.5 ? 0.7 : 0.1) : b.lit * 1.1;
        for (let c = 0; c < nc; c++) {
          if (hash(b.seed, c, r) > share) continue;
          const x = sx(b.X0 + ((c + 0.5) * (b.X1 - b.X0)) / nc);
          bokeh(fr, x, y, rad, lights, { fill: cool ? C.slate : C.brown, rim: cool ? C.steel : C.tanShade, clip: (X, Y) => X >= xa && X < xb && Y >= ya && Y < yb });
        }
      }
      continue;
    }
    // the edge toward the studio's light: a 1 px ink line; the far edge stays black
    const ex = x0;
    if (ex >= xa && ex < xb) for (let y = Math.max(ya, topY); y < y1; y++) px[y * W + ex] = C.slate;
    // windows on a pixel grid: offices floor by floor (whole floors lit or dark), homes window by window, a
    // dark block with a handful, a glass tower's lit strips running up its height
    const lights = b.kind === 'office' || b.kind === 'glass' ? COOL : WARM;
    let row = 0;
    const px2 = b.kind === 'glass' ? pitchX + 1 : pitchX;
    for (let y = y0 + Math.max(2, Math.round(4 * k)); y < y1 - 1; y += pitchY, row++) {
      const floorOn = hash(b.seed, row, 7) < (b.kind === 'office' ? 0.5 : 0.85);
      let col = 0;
      for (let x = x0 + 2; x + ww <= x1 - 1; x += px2, col++) {
        const h = hash(b.seed, row, col + 11);
        let on;
        if (b.kind === 'office') on = floorOn && h < 0.8;
        else if (b.kind === 'glass') on = hash(b.seed, col, 5) < 0.45 && h < 0.92;
        else if (b.kind === 'dark') on = h < 0.04;
        else on = h < (floorOn ? b.lit : b.lit * 0.3);
        if (!on) {
          // a dark window now and then switches on (a light on the late shift)
          if (h > 0.985 && ww === 1) livePoint(x, y, body, WARM[(row + col) % WARM.length], BLINK.WINDOW, hash(b.seed, col, row));
          continue;
        }
        const lc = b.kind === 'glass' ? (hash(b.seed, col, 6) < 0.5 ? C.steel : C.fog) : lights[Math.floor(hash(b.seed, row, col) * lights.length)];
        // a glass tower's strip is continuous: the window and the row gap under it
        const hgt = b.kind === 'glass' ? pitchY : ww;
        for (let dy = 0; dy < hgt; dy++) for (let dx = 0; dx < ww; dx++) put(x + dx, y + dy, lc);
        if (ww === 1 && b.kind !== 'glass' && h < 0.09) livePoint(x, y, lc, body, BLINK.WINDOW, hash(col, row, b.seed));
      }
    }
  }
}

/** Bokeh grows with the shot's magnification (a wider aperture on a tighter shot). */
const bokehScale = (k) => Math.max(1, Math.min(2.2, k * 2.4));

/** A tower's crown; returns the screen row of the body's top. */
function crown(fr, put, b, x0, x1, y0, mid, body, soft, k) {
  const sk = Math.max(1, k * 1.6);
  const fill = (xa, xb, ya, yb, c) => {
    for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) put(x, y, c);
  };
  // a mast: black where the sky is lit, ink against the black of the high sky (a thin line always reads)
  const mast = (x, ya, yb) => {
    for (let y = ya; y < yb; y++) {
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      put(x, y, fr.px[y * W + x] === C.black ? C.ink : C.black);
    }
  };
  const beacon = (x, y) => {
    if (soft) return;
    const under = x >= 0 && x < W && y >= 0 && y < H ? fr.px[y * W + x] : C.black;
    put(x, y, C.red);
    livePoint(x, y, C.red, under, BLINK.BEACON, hash(b.seed, 1));
  };
  const half = (x1 - x0) / 2;
  if (b.crown === 'step') {
    const sw = Math.max(2, Math.round(half * 0.55)), sh = Math.max(2, Math.round(6 * sk));
    fill(mid - sw, mid + sw, y0 - sh, y0, body);
    const s2 = Math.max(1, Math.round(half * 0.25)), h2 = Math.max(2, Math.round(5 * sk));
    fill(mid - s2, mid + s2, y0 - sh - h2, y0 - sh, body);
  } else if (b.crown === 'antenna') {
    const ah = Math.max(4, Math.round(14 * sk));
    mast(mid, y0 - ah, y0);
    beacon(mid, y0 - ah - 1);
  } else if (b.crown === 'slant') {
    // a sloped roof: the top cut on a diagonal, its lit face one step up
    const rise = Math.max(3, Math.round((x1 - x0) * 0.45));
    for (let x = x0; x < x1; x++) {
      const yy = y0 - Math.round(((x - x0) / Math.max(1, x1 - x0)) * rise);
      fill(x, x + 1, yy, y0, body);
      if (!soft) put(x, yy, C.slate);
    }
  } else if (b.crown === 'spire') {
    let yy = y0;
    for (const [frac, hgt] of [[0.72, 8], [0.46, 8], [0.24, 9]]) {
      const hw = Math.max(1, Math.round(half * frac)), hh = Math.max(2, Math.round(hgt * sk));
      fill(mid - hw, mid + hw, yy - hh, yy, body);
      if (!soft) fill(mid - hw, mid - hw + 1, yy - hh, yy, C.slate);
      yy -= hh;
    }
    const mh = Math.max(5, Math.round(22 * sk));
    mast(mid, yy - mh, yy);
    beacon(mid, yy - mh - 1);
  } else if (b.crown === 'deco') {
    // an art-deco crown: three setbacks and a lit band under each
    let yy = y0;
    for (const frac of [0.8, 0.6, 0.38]) {
      const hw = Math.max(1, Math.round(half * frac)), hh = Math.max(2, Math.round(7 * sk));
      fill(mid - hw, mid + hw, yy - hh, yy, body);
      if (!soft) fill(mid - hw + 1, mid + hw - 1, yy - 2, yy - 1, C.tanShade);
      yy -= hh;
    }
    mast(mid, yy - Math.round(9 * sk), yy);
    beacon(mid, yy - Math.round(9 * sk) - 1);
  }
  return y0;
}

function tvTower(fr, put, soft) {
  const t = TOWN.tv;
  const cx = Math.round(sx(t.X));
  const yTop = Math.round(rowOf(t.h)), yPod = Math.round(rowOf(t.h * 0.7)), yFoot = Math.round(rowOf(-4));
  const sh = soft ? C.ink : C.slate;
  for (let y = yPod; y < yFoot; y++) {
    const u = (y - yPod) / Math.max(1, yFoot - yPod);
    for (let dx = u < 0.45 ? 0 : -1; dx <= (u < 0.8 ? 0 : 1); dx++) put(cx + dx, y, sh);
  }
  const pw = Math.max(2, Math.round(9 * P.k)), ph = Math.max(1, Math.round(4 * P.k));
  for (let y = yPod - ph; y <= yPod + ph; y++) {
    const w = y === yPod - ph || y === yPod + ph ? pw - 1 : pw;
    for (let dx = -w; dx <= w; dx++) put(cx + dx, y, sh);
  }
  if (!soft) for (let dx = -pw + 1; dx <= pw - 1; dx += 2) put(cx + dx, yPod, C.orange);
  for (let y = yTop; y < yPod - ph; y++) put(cx, y, sh);
  if (!soft) {
    const under = cx >= 0 && cx < W && yTop - 1 >= 0 ? fr.px[(yTop - 1) * W + cx] : C.black;
    put(cx, yTop - 1, C.red);
    livePoint(cx, yTop - 1, C.red, under, BLINK.BEACON, 0.37);
    const mid = Math.round(rowOf(t.h * 0.86));
    const u2 = cx >= 0 && cx < W && mid >= 0 ? fr.px[mid * W + cx] : sh;
    livePoint(cx, mid, C.red, u2, BLINK.BEACON, 0.87);
  }
}

// --------------------------------------------------------------------------- what moves (live.js)
const AVENUES = new Int16Array(40);
const SKYISH = new Set([C.black >>> 0, C.ink >>> 0, C.navy >>> 0]);

LIVE_DRAW['world-now'] = (fr, cam, t, style, clipRows, soft, wall) => {
  if (soft) return;
  plane(cam);
  const px = fr.px;
  const box = STATE.box;
  // the hero screen, its mount, its stem and the clock bar over it: nothing passes in front of them
  const pad = wall ? Math.ceil(9 * wall.k) : 0;
  const ok = (x, y) => x >= box.x0 && x < box.x1 && y >= box.y0 && y < box.y1 && STATE.glassCol[x] && (!clipRows || y < clipRows[x]) && (!wall || x < wall.x0 - pad || x >= wall.x1 + pad || y >= wall.y1 + pad);
  const sky = (x, y, c) => {
    if (ok(x, y) && SKYISH.has(px[y * W + x] >>> 0)) px[y * W + x] = c;
  };
  // a plane crossing the sky every 75 s, high over the towers: a steady red light and a white strobe
  const cyc = 75, u = (t % cyc) / cyc;
  const X = 1000 - u * 2000, h = 122 + 8 * Math.sin(u * 2.1);
  const x = Math.round(sx(X)), y = Math.round(rowOf(h));
  sky(x, y, C.red);
  if ((t * 1000) % 1300 < 90) sky(x + 2, y, C.white);
  // cars on the avenues below the horizon: headlights (fog) one way, tail lights (darkRed) the other
  for (let n = 3; n < 12; n++) {
    const ay = AVENUES[n];
    if (!ay) continue;
    for (let c = 0; c < 3; c++) {
      const speed = 14 + hash(n, c) * 22, dir = c % 2 ? 1 : -1;
      const X0 = -900 + ((t * speed * dir + hash(c, n) * 1800) % 1800 + 1800) % 1800;
      const xx = Math.round(sx(X0));
      if (ok(xx, ay) && px[ay * W + xx] === C.black) px[ay * W + xx] = dir > 0 ? C.fog : C.darkRed;
    }
  }
};
