// WORLD WEATHER's weather symbols, hand-placed pixel art built from a few shapes (a sun disc and its rays, a
// cloud of three puffs lit from the top, drops, flakes, a bolt), outlined in the palette's black so they read
// over any colour of the temperature map, and animated on a few frames: rays that twinkle, rain that falls,
// a bolt that flashes now and then. The warnings panel's tropical cyclone is a slowly turning two-arm spiral.
//
//   drawIcon(ctx, kind, x, y, t, { night, big })   kind: clear | partly | cloudy | fog | drizzle | rain |
//                                                  showers | snow | storm   (x, y: the icon's centre)
//   drawCyclone(ctx, x, y, t, r)                   the panel's storm symbol (r: radius in px)
// Sprites are baked once per kind and frame (a canvas each); no allocation per frame after that.
import { P } from '../../palette.js';

const IW = 15, IH = 13; // sprite size, outline included

function blank() {
  return new Array(IW * IH).fill(null);
}
function put(g, x, y, c) {
  x = Math.round(x);
  y = Math.round(y);
  if (x >= 1 && y >= 1 && x < IW - 1 && y < IH - 1) g[y * IW + x] = c;
}

function sun(g, cx, cy, r, frame, rays = true) {
  for (let y = 0; y < IH; y++) {
    for (let x = 0; x < IW; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d <= r) put(g, x, y, d > r - 1 ? P.orange : x + y < cx + cy - 2 ? P.cream : P.yellow);
    }
  }
  if (!rays) return;
  // eight rays; the long ones swap between the axes and the diagonals (a twinkle, 2 frames)
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const long = (k % 2 === 0) === (frame % 2 === 0);
    const r0 = r + 1.4, r1 = r + (long ? 3.2 : 2.2);
    for (let q = r0; q <= r1; q += 0.7) put(g, cx - 0.5 + Math.cos(a) * q, cy - 0.5 + Math.sin(a) * q, long ? P.yellow : P.orange);
  }
}

function moon(g, cx, cy, r) {
  for (let y = 0; y < IH; y++) {
    for (let x = 0; x < IW; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const d2 = Math.hypot(x + 0.5 - cx - 2, y + 0.5 - cy + 1.2);
      if (d <= r && d2 > r - 0.6) put(g, x, y, d > r - 1 ? P.tan : P.cream);
    }
  }
}

/** A cloud of three puffs, flat underneath; dark = rain cloud tones. */
function cloud(g, ox, oy, dark = false, scale = 1) {
  const puffs = [
    [3.6, 6.4, 2.3],
    [6.8, 4.6, 3.1],
    [9.9, 6.2, 2.4],
  ];
  const top = dark ? P.silver : P.white, mid = dark ? P.fog : P.silver, low = dark ? P.steel : P.fog;
  for (let y = 0; y < IH; y++) {
    for (let x = 0; x < IW; x++) {
      const px = (x + 0.5 - ox) / scale, py = (y + 0.5 - oy) / scale;
      if (py > 8.2) continue;
      let inside = false, edge = 99;
      for (const [cx, cy, r] of puffs) {
        const d = Math.hypot(px - cx, py - cy) - r;
        if (d <= 0) inside = true;
        edge = Math.min(edge, d);
      }
      if (!inside && !(py > 6 && py <= 8.2 && px > 2.2 && px < 11.6)) continue;
      put(g, x, y, py > 7.2 ? low : py < 4.8 || (edge > -0.9 && py < 6) ? top : mid);
    }
  }
}

function drops(g, frame, n, color, len = 2) {
  const xs = [3.5, 6.5, 9.5, 5, 8];
  for (let i = 0; i < n; i++) {
    const x = xs[i];
    const y0 = 9.3 + ((frame + i * 2) % 3) * 0.9;
    for (let k = 0; k < len; k++) put(g, x - k * 0.4 - (y0 - 9.3) * 0.4, y0 + k, color);
  }
}

function flakes(g, frame) {
  const pts = [[3.5, 9.5], [7, 10.5], [10.5, 9.5], [5.2, 11.2], [9, 11.4]];
  pts.forEach(([x, y], i) => put(g, x + (((frame + i) % 2) ? 0.6 : -0.4), y + ((frame + i) % 3) * 0.4, P.white));
}

function bolt(g) {
  for (const [x, y] of [[8, 7], [7, 8], [7, 9], [8, 9], [9, 9], [8, 10], [7, 11]]) put(g, x, y, P.yellow);
}

function fogLines(g, frame) {
  const s = frame % 2;
  for (let x = 2 + s; x < 12 + s; x++) put(g, x, 4, P.silver);
  for (let x = 1 - s + 1; x < 11 - s + 1; x++) put(g, x, 7, P.fog);
  for (let x = 3 + s; x < 13 + s - 1; x++) put(g, x, 10, P.silver);
}

/** 4-neighbour black outline around everything drawn. */
function outline(g) {
  const out = g.slice();
  for (let y = 0; y < IH; y++) {
    for (let x = 0; x < IW; x++) {
      if (g[y * IW + x]) continue;
      const n = (xx, yy) => xx >= 0 && yy >= 0 && xx < IW && yy < IH && g[yy * IW + xx] && g[yy * IW + xx] !== P.black;
      if (n(x - 1, y) || n(x + 1, y) || n(x, y - 1) || n(x, y + 1)) out[y * IW + x] = P.black;
    }
  }
  return out;
}

const FRAMES = { clear: 2, night: 1, partly: 2, cloudy: 1, fog: 2, drizzle: 3, rain: 3, showers: 3, snow: 3, storm: 6 };
const RATE = { clear: 1.6, partly: 1.6, fog: 0.8, drizzle: 4, rain: 6, showers: 5, snow: 3, storm: 6 }; // frames per second

function build(kind, frame) {
  const g = blank();
  switch (kind) {
    case 'clear':
      sun(g, 7.5, 6.5, 3.4, frame);
      break;
    case 'night':
      moon(g, 7, 6.5, 3.8);
      break;
    case 'partly':
      sun(g, 5.2, 4.8, 2.9, frame);
      cloud(g, 1.6, 2.4, false, 0.92);
      break;
    case 'cloudy':
      cloud(g, -0.4, 0.4, true, 0.8);
      cloud(g, 1.4, 1.8, false, 0.95);
      break;
    case 'fog':
      fogLines(g, frame);
      break;
    case 'drizzle':
      cloud(g, 0.6, -0.6, true);
      drops(g, frame, 2, P.cyan, 1);
      break;
    case 'rain':
      cloud(g, 0.6, -0.8, true);
      drops(g, frame, 3, P.blue);
      break;
    case 'showers':
      sun(g, 4.6, 3.8, 2.5, 0, false);
      cloud(g, 1.4, -0.2, false, 0.9);
      drops(g, frame, 2, P.blue);
      break;
    case 'snow':
      cloud(g, 0.6, -0.8, false);
      flakes(g, frame);
      break;
    case 'storm':
      cloud(g, 0.6, -1, true);
      drops(g, frame, 2, P.blue);
      if (frame === 0 || frame === 1) bolt(g); // a flash now and then (2 of 6 frames)
      break;
    default:
      cloud(g, 0.6, 0, true);
  }
  return outline(g);
}

const SPRITES = new Map();
function sprite(kind, frame) {
  const key = `${kind}:${frame}`;
  let c = SPRITES.get(key);
  if (c) return c;
  const g = build(kind, frame);
  c = document.createElement('canvas');
  c.width = IW;
  c.height = IH;
  const x = c.getContext('2d');
  for (let i = 0; i < g.length; i++) {
    if (!g[i]) continue;
    x.fillStyle = g[i];
    x.fillRect(i % IW, Math.floor(i / IW), 1, 1);
  }
  SPRITES.set(key, c);
  return c;
}

/** The symbol of `kind` centred on (x, y); night: the moon for a clear night. */
export function drawIcon(ctx, kind, x, y, t, { night = false, phase = 0 } = {}) {
  const k = kind === 'clear' && night ? 'night' : FRAMES[kind] ? kind : 'cloudy';
  const n = FRAMES[k];
  const f = n > 1 ? Math.floor((t + phase) * (RATE[k] || 2)) % n : 0;
  ctx.drawImage(sprite(k, f), Math.round(x - IW / 2), Math.round(y - IH / 2));
}

/** The bitmap of a symbol (tests). */
export function iconPixels(kind, frame = 0) {
  return build(kind, frame);
}
export const ICON_SIZE = { w: IW, h: IH };

// ------------------------------------------------------------------------------------------- cyclone
const CYC = new Map();
/** A tropical cyclone's symbol: two spiral arms turning (anticlockwise in the north), an eye, 16 frames a turn. */
export function drawCyclone(ctx, x, y, t, r = 11, { south = false } = {}) {
  const n = 16;
  const f = Math.floor(t * 4) % n;
  const key = `${r}:${f}:${south ? 1 : 0}`;
  let c = CYC.get(key);
  if (!c) {
    const size = r * 2 + 3;
    c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const rot = (f / n) * Math.PI * 2 * (south ? 1 : -1);
    const ctr = size / 2;
    for (let yy = 0; yy < size; yy++) {
      for (let xx = 0; xx < size; xx++) {
        const dx = xx + 0.5 - ctr, dy = yy + 0.5 - ctr;
        const d = Math.hypot(dx, dy);
        if (d > r + 0.5) continue;
        const a = Math.atan2(dy, dx) * (south ? -1 : 1);
        const arm = Math.cos(2 * (a - rot) + d * (5.2 / r));
        let col = null;
        if (d < r * 0.18) col = P.slate; // the eye
        else if (d < r * 0.34) col = P.white; // the eyewall
        else if (arm > 0.45 - (d / r) * 0.25) col = d < r * 0.6 ? P.white : d < r * 0.85 ? P.silver : P.fog;
        else if (arm > 0.05 && d < r * 0.8) col = P.steel;
        if (col) {
          g.fillStyle = col;
          g.fillRect(xx, yy, 1, 1);
        }
      }
    }
    CYC.set(key, c);
  }
  ctx.drawImage(c, Math.round(x - c.width / 2), Math.round(y - c.height / 2));
}
