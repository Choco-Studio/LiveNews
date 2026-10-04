// NEWS IN 60's set (round 4): a flash studio built round the minute. A black room with one clean downlight on
// the anchor, the studio clock on the left whose ring of sixty LEDs fills as the minute runs (live), the rundown
// board on the right, and between them and the screen "the gallery": a wall of small monitors carrying the
// feeds — colour bars, snow, a waveform, a feed with its red tally — as in a newsroom's gallery. Out of focus the
// monitors are soft squares of their light.
//
//   flashWall(fr, cam, soft)      the room (after the wall's light, before the screen)
//   LIVE_DRAW['news-60']          the clock's seconds, the feeds' snow and waveform, the tallies (live.js)
import { C } from '../pixbuf.js';
import { SET, kAt, sxOf, syOf } from './geometry.js';
import { LIVE_DRAW, livePoint, BLINK } from './live.js';

const W = 384, H = 216;
const hash = (a, b, c = 0) => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35) ^ Math.imul(c + 0x27d4eb2f, 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
};

export const ROOM = { X: 250, top: -127 };
// the gallery: two columns of four monitors each side, between the screen's mount and the clock / rundown
const MON = { X0: 88, w: 22, gap: 4, Y0: -104, h: 16, vgap: 5, cols: 2, rows: 4 };
// what each monitor plays (left side, then right, row by row): bars, snow, wave, feed (a tally), map, dark
const FEEDS = ['feed', 'bars', 'snow', 'wave', 'map', 'feed', 'dark', 'snow', 'bars', 'feed', 'wave', 'dark', 'snow', 'map', 'feed', 'bars'];
// colour bars, turned down (a 4x4 patch never brighter than the anchor's face)
const BARS = [C.steel, C.blue, C.darkGreen, C.magenta, C.darkRed, C.navy, C.slate];

/** The screen rect of monitor i (0..15): { x0, y0, x1, y1 } (its screen, inside the bezel). */
function monRect(cam, k, i) {
  const side = i < 8 ? -1 : 1, j = i % 8, col = j % MON.cols, row = (j / MON.cols) | 0;
  const A = MON.X0 + col * (MON.w + MON.gap), B = A + MON.w;
  const X0 = side > 0 ? A : -B, X1 = side > 0 ? B : -A;
  const Y0 = MON.Y0 + row * (MON.h + MON.vgap), Y1 = Y0 + MON.h;
  return { x0: Math.round(sxOf(cam, k, X0)), x1: Math.round(sxOf(cam, k, X1)), y0: Math.round(syOf(cam, k, Y0)), y1: Math.round(syOf(cam, k, Y1)), feed: FEEDS[i] };
}

export function flashWall(fr, cam, soft) {
  const k = kAt(cam, SET.wallZ);
  const px = fr.px;
  const xa = Math.max(0, Math.round(sxOf(cam, k, -ROOM.X))), xb = Math.min(W, Math.round(sxOf(cam, k, ROOM.X)));
  const ya = Math.max(0, Math.round(syOf(cam, k, ROOM.top))), yb = Math.min(H, Math.round(syOf(cam, k, SET.floorY)));
  if (xb <= xa || yb <= ya) return;
  // the room: black; the downlight on the anchor a clean cone from the soffit, ink with a slate heart near the
  // source (flat bands, no dither), fading back to black at the screen's foot
  for (let y = ya; y < yb; y++) {
    const Y = cam.y + (y + 0.5 - cam.hy) / k;
    const d = Y - ROOM.top; // world units under the soffit
    const hw = 40 + d * 0.72; // the cone's half width at this depth
    const heart = 14 + d * 0.4;
    const row = y * W;
    for (let x = xa; x < xb; x++) {
      const X = cam.x + (x + 0.5 - 192) / k;
      let c = C.black;
      if (d < 150 && Math.abs(X) < hw) c = d < 26 && Math.abs(X) < heart ? C.slate : C.ink;
      px[row + x] = c;
    }
  }
  // the gallery's frame: a black panel behind each block of monitors, its top edge lit
  for (const side of [-1, 1]) {
    const A = MON.X0 - 4, B = MON.X0 + MON.cols * (MON.w + MON.gap) - MON.gap + 4;
    const X0 = side > 0 ? A : -B, X1 = side > 0 ? B : -A;
    const x0 = Math.round(sxOf(cam, k, X0)), x1 = Math.round(sxOf(cam, k, X1));
    const y0 = Math.round(syOf(cam, k, MON.Y0 - 4)), y1 = Math.round(syOf(cam, k, MON.Y0 + MON.rows * (MON.h + MON.vgap) - MON.vgap + 4));
    for (let y = Math.max(ya, y0); y < Math.min(yb, y1); y++) for (let x = Math.max(xa, x0); x < Math.min(xb, x1); x++) px[y * W + x] = C.black;
    if (!soft) for (let x = Math.max(xa, x0); x < Math.min(xb, x1); x++) if (y0 >= 0 && y0 < H) px[y0 * W + x] = C.ink;
  }
  for (let i = 0; i < 16; i++) monitor(fr, cam, k, i, soft);
}

/** One monitor: a slate bezel, its screen's content (the moving parts are drawn by the live layer). */
function monitor(fr, cam, k, i, soft) {
  const r = monRect(cam, k, i);
  const px = fr.px;
  const put = (x, y, c) => {
    if (x >= 0 && x < W && y >= 0 && y < H) px[y * W + x] = c;
  };
  const b = Math.max(1, Math.round(1.2 * k));
  for (let y = r.y0 - b; y < r.y1 + b; y++) for (let x = r.x0 - b; x < r.x1 + b; x++) put(x, y, y < r.y0 && !soft ? C.slate : C.ink);
  const w = r.x1 - r.x0, h = r.y1 - r.y0;
  if (w < 3 || h < 3) return;
  for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) {
    let c = C.black;
    if (soft) {
      // out of focus: the screen's average light, softer at its edges
      c = r.feed === 'dark' ? C.black : r.feed === 'wave' ? C.ink : C.slate;
      if (y === r.y0 || y === r.y1 - 1 || x === r.x0 || x === r.x1 - 1) c = C.ink;
    } else if (r.feed === 'bars') {
      const n = Math.min(BARS.length - 1, Math.floor(((x - r.x0) / w) * BARS.length));
      c = y - r.y0 < h * 0.72 ? BARS[n] : (x - r.x0) / w < 0.5 ? C.navy : C.black;
    } else if (r.feed === 'feed') {
      // a feed: a dim sky over a skyline, a red tally in its corner (the live layer blinks it)
      c = y - r.y0 < h * 0.45 ? C.navy : C.ink;
      const hx = (x - r.x0) / w;
      const roof = 0.45 + 0.22 * hash(Math.floor(hx * 6), i, 3);
      if ((y - r.y0) / h > roof) c = C.black;
    } else if (r.feed === 'map') {
      // a map: the sea navy, a coast in slate, a blip
      const u = (x - r.x0) / w, v = (y - r.y0) / h;
      c = u + 0.3 * Math.sin(v * 6 + i) > 0.55 ? C.slate : C.navy;
    } else if (r.feed === 'wave') c = C.black;
    else if (r.feed === 'snow') c = hash(x, y, i) < 0.5 ? C.slate : C.ink;
    px[y * W + x] = c;
  }
  if (soft) return;
  if (r.feed === 'feed') {
    const tx = r.x1 - 2, ty = r.y0 + 1;
    put(tx, ty, C.red);
    livePoint(tx, ty, C.red, C.navy, BLINK.SLOW, hash(i, 7));
  }
  if (r.feed === 'map') {
    const bx = r.x0 + Math.round(w * 0.42), by = r.y0 + Math.round(h * 0.5);
    const under = bx >= 0 && bx < W && by >= 0 && by < H ? px[by * W + bx] : C.navy;
    put(bx, by, C.red);
    livePoint(bx, by, C.red, under, BLINK.BEACON, hash(i, 9));
  }
}

// --------------------------------------------------------------------------- the clock and the feeds (live.js)
export const CLOCK = { X: -186, Y: -72 };
LIVE_DRAW['news-60'] = (fr, cam, t, style, clipRows, soft) => {
  if (soft) return;
  const k = kAt(cam, SET.wallZ);
  const px = fr.px;
  // the studio clock's ring: the seconds of the minute lit yellow, the rest slate (its face is dressing.js's)
  const cx = Math.round(sxOf(cam, k, CLOCK.X)), cy = Math.round(syOf(cam, k, CLOCK.Y));
  const R = Math.round(34 * k);
  const ds = Math.max(1, Math.round(1.4 * k));
  const sec = Math.floor(t % 60);
  for (let i = 0; i < 60; i++) {
    const a = -Math.PI / 2 + (i / 60) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * R - ds / 2), y = Math.round(cy + Math.sin(a) * R - ds / 2);
    const c = i <= sec ? C.yellow : C.slate;
    for (let j = 0; j < ds; j++) for (let q = 0; q < ds; q++) {
      const X = x + q, Y = y + j;
      if (X < 0 || X >= W || Y < 0 || Y >= H || (clipRows && Y >= clipRows[X])) continue;
      const o = Y * W + X;
      if (px[o] === C.yellow || px[o] === C.slate) px[o] = c;
    }
  }
  // the feeds: snow (re-seeded 12 times a second), a waveform running
  const f = Math.floor(t * 12);
  for (let i = 0; i < 16; i++) {
    const feed = FEEDS[i];
    if (feed !== 'snow' && feed !== 'wave') continue;
    const r = monRect(cam, k, i);
    const w = r.x1 - r.x0, h = r.y1 - r.y0;
    for (let y = Math.max(0, r.y0); y < Math.min(H, r.y1); y++) for (let x = Math.max(0, r.x0); x < Math.min(W, r.x1); x++) {
      if (clipRows && y >= clipRows[x]) continue;
      let c;
      if (feed === 'snow') {
        const v = hash(x, y, f + i * 131);
        c = v < 0.08 ? C.fog : v < 0.5 ? C.slate : C.ink;
      } else {
        const u = (x - r.x0) / Math.max(1, w);
        const yy = r.y0 + Math.round(h * (0.5 + 0.32 * Math.sin(u * 9 - t * 5 + i) * Math.sin(u * 3.1 + t * 1.3)));
        c = y === yy ? C.green : y === r.y0 + (h >> 1) && (x & 1) ? C.darkGreen : C.black;
      }
      px[y * W + x] = c;
    }
  }
};
