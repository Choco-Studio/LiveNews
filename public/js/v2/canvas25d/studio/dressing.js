// Set dressing: each programme's own studio (owner, 3 Oct: "haz una ronda de pulida para decorar los platós y
// dejarlos bien; ahora mismo todos tienen los mismos"). The architecture stays the network's (the wall, the
// hero screen, the desk and its red plate); what changes is what hangs on the wall around the screen and
// beside the presenters, and the desk's front:
//   WORLD NOW     a newsroom by night: two floor-to-ceiling glass bays on the city (a banded night sky, the
//                 Moon, thin clouds, the glass's reflection, a hazy far skyline against the city's glow, near
//                 towers with lit windows, a spire and a TV tower), a bar of world clocks over the screen
//   TECH BYTES    a product lab after hours: a black display cabinet each side with four backlit niches (a
//                 cyan LED strip, the light down the back panel, a glass shelf), one hand-pixelled product in
//                 each (headphones, a gamepad, a retro handheld, a camera | a VR headset, a joystick, a drone,
//                 a little UNIT-8)
//   COSMOS DESK   a planetarium: a quiet starfield and a star chart's dotted grid on the black wall, Orion,
//                 the Big Dipper and Cassiopeia as star charts (crosses, purple lines, names in micro type),
//                 the Moon's eight phases over the screen, a dark desk front with stars
//   MONEY MINUTE  a private bank after the close: a dark-wood dado with raised panels, a bull and a bear in
//                 bronze relief on framed plaques (brass name plates), an LED ticker of the programme's beats
//                 (no prices), the bronze sconces of the style, a wood front with broken-run grain
//   NEWS IN 60    a flash studio: a ring of sixty marks round the screen, a bank of small monitors each side,
//                 yellow edge lines
// Everything is drawn in world units on the back wall (Z = SET.wallZ), so the camera's moves and zooms carry
// it; every pixel is a palette colour; nothing sits behind a head (|X| >= 140 beside the seats, or above the
// screen), nothing is brighter than the faces, and nothing moves (the background is cached).
//
//   drawDressing(fr, cam, style, soft)   on the wall, after the light and before the screen
//   DESK_FRONTS[id]                      the desk front's panel colours and pattern (set.js rasterDesk)
import { C } from '../pixbuf.js';
import { SET, kAt, sxOf, syOf } from './geometry.js';
import { textPixels } from '../../../font.js';

const W = 384, H = 216;

// --------------------------------------------------------------------------- helpers (world units → spans)
function rectW(fr, cam, X0, Y0, X1, Y1, c, Z = SET.wallZ) {
  const k = kAt(cam, Z);
  const x0 = Math.round(sxOf(cam, k, X0)), x1 = Math.round(sxOf(cam, k, X1));
  const y0 = Math.round(syOf(cam, k, Y0)), y1 = Math.round(syOf(cam, k, Y1));
  if (x1 <= 0 || x0 >= W || y1 <= 0 || y0 >= H) return;
  fr.span(x0, y0, Math.max(x1, x0 + 1), Math.max(y1, y0 + 1), c);
}
/** A dot of at least one pixel at (X, Y). */
function dotW(fr, cam, X, Y, c, size = 1, Z = SET.wallZ) {
  const k = kAt(cam, Z);
  const s = Math.max(1, Math.round(size * k));
  const x = Math.round(sxOf(cam, k, X) - s / 2), y = Math.round(syOf(cam, k, Y) - s / 2);
  if (x + s <= 0 || x >= W || y + s <= 0 || y >= H) return;
  fr.span(x, y, x + s, y + s, c);
}
/** A line of at least one pixel from (X0, Y0) to (X1, Y1), stepped in pixels. */
function lineW(fr, cam, X0, Y0, X1, Y1, c, Z = SET.wallZ) {
  const k = kAt(cam, Z);
  const ax = sxOf(cam, k, X0), ay = syOf(cam, k, Y0), bx = sxOf(cam, k, X1), by = syOf(cam, k, Y1);
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay))));
  const w = Math.max(1, Math.floor(k * 0.9 + 0.2));
  for (let i = 0; i <= n; i++) {
    const x = Math.round(ax + ((bx - ax) * i) / n), y = Math.round(ay + ((by - ay) * i) / n);
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    fr.span(x, y, x + w, y + w, c);
  }
}
/** Filled circle (pixel-centre rule) with a per-pixel colour function f(dx, dy, r) → colour | 0. */
function discW(fr, cam, X, Y, R, f, Z = SET.wallZ) {
  const k = kAt(cam, Z);
  const cx = sxOf(cam, k, X), cy = syOf(cam, k, Y), r = R * k;
  const x0 = Math.max(0, Math.floor(cx - r - 1)), x1 = Math.min(W, Math.ceil(cx + r + 1));
  const y0 = Math.max(0, Math.floor(cy - r - 1)), y1 = Math.min(H, Math.ceil(cy + r + 1));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / r;
      const d = dx * dx + dy * dy;
      if (d > 1) continue;
      const c = f(dx, dy, d);
      if (c) fr.px[y * W + x] = c;
    }
  }
}
function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => ((a = (Math.imul(a ^ (a >>> 15), 2246822519) + 0x9e3779b9) >>> 0) / 4294967296);
}
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x, y) => (B4[((y & 3) << 2) | (x & 3)] + 0.5) / 16;

// --------------------------------------------------------------------------- WORLD NOW: the city by night
// Two floor-to-ceiling glass bays beside the screen wall (|X| 160 → behind the flats), a night skyline in
// them, and a bar of world clocks over the screen. Drawn in pixel space from world anchors so the lit
// windows sit on a crisp pixel grid at every zoom.
const BAY = { inner: 160, outer: 300, top: -121, bottom: 34, horizon: -52, mullions: [203, 250] };
const hash = (a, b, c = 0) => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35) ^ Math.imul(c + 0x27d4eb2f, 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
};
/** The skyline of one bay, in world units (deterministic): two layers, far (ink) and near (black). */
function skyline(sx) {
  const r = rng(sx > 0 ? 1907 : 1931);
  const out = [];
  const X0 = BAY.inner + 3, X1 = BAY.outer;
  // far layer: blocks packed along the horizon, tops between -58 and -28 (hazy: slate against the glow)
  for (let X = X0 - 2; X < X1; ) {
    const w = 6 + Math.floor(r() * 10);
    out.push({ far: true, X0: X, X1: X + w, top: -28 - Math.floor(r() * 30), seed: out.length });
    X += w + (r() < 0.5 ? 2 + Math.floor(r() * 4) : 0); // gaps where the glow shows through
  }
  // the bay's landmark in the far distance: a TV tower in the right bay (its pod's lit ring, its light)
  if (sx > 0) out.push({ tower: true, X: 222, top: -108, pod: -84, seed: out.length });
  // near layer: towers with gaps, tops between -104 and -30; one landmark spire per bay
  const landmark = sx > 0 ? 0.3 : 0.4; // where along the bay (0 inner .. 1 outer)
  let placed = false;
  const keep = sx > 0 ? [211, 229] : null; // the tower's gap: no near building in front of it
  for (let X = X0 + 1 + r() * 3; X < X1; ) {
    if (keep && X + 9 > keep[0] && X < keep[1]) {
      X = keep[1];
      continue;
    }
    const t = (X - X0) / (X1 - X0);
    const spire = !placed && t >= landmark - 0.08;
    let w = spire ? 15 : 9 + Math.floor(r() * 14);
    if (keep && X < keep[0] && X + w > keep[0]) w = Math.max(6, keep[0] - X);
    const top = spire ? -74 : -30 - Math.floor(r() * (r() < 0.35 ? 74 : 44));
    const crown = spire ? 'spire' : r() < 0.25 ? 'antenna' : r() < 0.35 ? 'step' : 'flat';
    out.push({ far: false, X0: X, X1: X + w, top, crown, seed: out.length, lit: 0.18 + r() * 0.2, cool: r() < 0.35 });
    if (spire) placed = true;
    X += w + (r() < 0.45 ? 3 + r() * 6 : 0);
  }
  return out;
}
const SKYLINE = { '-1': skyline(-1), 1: skyline(1) };
const SKY_RAMP = [C.black, C.ink, C.navy];
const WARM_LIGHTS = [C.orange, C.tan, C.tan, C.yellow, C.tanShade];
const COOL_LIGHTS = [C.fog, C.steel, C.fog, C.steel];

/** A TV tower far off: a slate shaft widening to its foot, a pod with a lit ring, a mast and its red light. */
function tvTower(fr, cam, k, X, b, xa, xb, ya, yb, soft) {
  const px = fr.px;
  const set = (x, y, c) => {
    if (x >= xa && x < xb && y >= ya && y < yb) px[y * W + x] = c;
  };
  const cx = Math.round(sxOf(cam, k, X));
  const yTop = Math.round(syOf(cam, k, b.top)), yPod = Math.round(syOf(cam, k, b.pod)), yFoot = yb;
  const sh = soft ? C.ink : C.slate;
  // the shaft: 1 px under the pod, 2 px lower down, 3 px near the foot
  for (let y = yPod; y < yFoot; y++) {
    const u = (y - yPod) / Math.max(1, yFoot - yPod);
    const hw = u < 0.35 ? 0 : u < 0.7 ? 1 : 1;
    for (let dx = -hw; dx <= (u < 0.35 ? 0 : 1); dx++) set(cx + dx, y, sh);
  }
  // the pod: a lens 5-7 px wide, 3 px tall, its ring of windows lit
  const pw = Math.max(2, Math.round(4.2 * k)), ph = Math.max(1, Math.round(2 * k));
  for (let y = yPod - ph; y <= yPod + ph; y++) {
    const w = y === yPod - ph || y === yPod + ph ? pw - 1 : pw;
    for (let dx = -w; dx <= w; dx++) set(cx + dx, y, sh);
  }
  if (!soft) for (let dx = -pw + 1; dx <= pw - 1; dx += 2) set(cx + dx, yPod, C.orange);
  // the mast and its light
  for (let y = yTop; y < yPod - ph; y++) set(cx, y, sh);
  if (!soft) set(cx, yTop - 1, C.red);
}

function cityBay(fr, cam, sx, soft) {
  const k = kAt(cam, SET.wallZ);
  const XA = sx > 0 ? BAY.inner : -BAY.outer, XB = sx > 0 ? BAY.outer : -BAY.inner;
  const bx0 = Math.round(sxOf(cam, k, XA)), bx1 = Math.round(sxOf(cam, k, XB));
  const by0 = Math.round(syOf(cam, k, BAY.top)), by1 = Math.round(syOf(cam, k, BAY.bottom));
  const xa = Math.max(0, bx0), xb = Math.min(W, bx1), ya = Math.max(0, by0), yb = Math.min(H, by1);
  if (xb <= xa || yb <= ya) return;
  const px = fr.px;
  // the night sky: black at the top of the glass, ink, then the city's navy glow down to the horizon
  const yh = syOf(cam, k, BAY.horizon);
  for (let y = ya; y < yb; y++) {
    const t = Math.max(0, Math.min(1, (y - by0) / Math.max(1, yh - by0)));
    // solid bands with short dithered steps between them (a long sparse dither reads as a mesh)
    const v = Math.pow(t, 1.25) * (SKY_RAMP.length - 1) * (soft ? 0.7 : 1);
    const i = Math.min(SKY_RAMP.length - 2, Math.floor(v)), f = Math.max(0, Math.min(1, (v - i - 0.5) / 0.28 + 0.5));
    for (let x = xa; x < xb; x++) px[y * W + x] = f > bayer(x, y) ? SKY_RAMP[i + 1] : SKY_RAMP[i];
  }
  if (!soft) {
    // a few stars in the dark top of the sky (steel, one fog), the Moon in the left bay
    const sr = rng(sx > 0 ? 313 : 317);
    for (let n = 0; n < 9; n++) {
      const X = XA + 6 + sr() * (XB - XA - 12), Y = BAY.top + 4 + sr() * 40;
      const x = Math.round(sxOf(cam, k, X)), y = Math.round(syOf(cam, k, Y));
      if (x >= xa && x < xb && y >= ya && y < yb) px[y * W + x] = n === 3 ? C.fog : C.steel;
    }
    // thin night clouds lit from below by the city: ink streaks in the dark band, ends dithered
    for (const [cX, cY, cW] of sx > 0 ? [[180, -113, 30], [206, -103, 22]] : [[-222, -114, 28], [-206, -104, 18]]) {
      const cx0 = sxOf(cam, k, cX - cW / 2), cx1 = sxOf(cam, k, cX + cW / 2), cy = Math.round(syOf(cam, k, cY));
      for (let row = 0; row < 2; row++) {
        const y = cy + row;
        if (y < ya || y >= yb) continue;
        const inset = row === 0 ? 0.18 : 0;
        for (let x = Math.max(xa, Math.floor(cx0)); x < Math.min(xb, Math.ceil(cx1)); x++) {
          const u = (x + 0.5 - cx0) / (cx1 - cx0);
          const edge = Math.min(u - inset, 1 - inset - u) / 0.22;
          if (edge <= 0 || (edge < 1 && bayer(x, y) > edge)) continue;
          if (px[y * W + x] === C.black) px[y * W + x] = C.ink;
        }
      }
    }
    if (sx < 0) {
      // the Moon, nearly full: a silver disc, its limb and two maria in fog
      const mx = sxOf(cam, k, -184), my = syOf(cam, k, -101), mr = Math.max(2.6, 4.8 * k);
      for (let y = Math.floor(my - mr); y <= Math.ceil(my + mr); y++) {
        for (let x = Math.floor(mx - mr); x <= Math.ceil(mx + mr); x++) {
          if (x < xa || x >= xb || y < ya || y >= yb) continue;
          const dx = (x + 0.5 - mx) / mr, dy = (y + 0.5 - my) / mr;
          const d = dx * dx + dy * dy;
          if (d > 1) continue;
          const limb = d > 0.55 && dx + dy > 0.35;
          const mare = (dx + 0.25) * (dx + 0.25) + (dy + 0.2) * (dy + 0.2) < 0.06 || (dx - 0.3) * (dx - 0.3) + (dy - 0.15) * (dy - 0.15) < 0.04;
          px[y * W + x] = limb || mare ? C.fog : C.silver;
        }
      }
    }
    // the glass's reflection: two clean diagonal strokes one step up the sky ramp
    const strokes = [[18, 2], [24, 1]];
    for (let y = ya; y < yb; y++) {
      const fy = (y - by0) / Math.max(1, by1 - by0);
      if (fy > 0.42) break;
      for (let x = xa; x < xb; x++) {
        // anchored at the jamb by the screen wall, mirrored between the bays
        const d = Math.round((sx > 0 ? x - bx0 : bx1 - 1 - x) * 0.7 + (y - by0));
        for (const [o, w] of strokes) {
          if (d < o || d >= o + w) continue;
          // fade out toward the stroke's lower end
          if (fy > 0.3 && bayer(x, y) < (fy - 0.3) / 0.12) continue;
          const c = px[y * W + x];
          if (c === C.black) px[y * W + x] = C.ink;
          else if (c === C.ink) px[y * W + x] = C.slate;
        }
      }
    }
  }
  // buildings
  const pitchX = Math.max(2, Math.round(2.6 * k)), pitchY = Math.max(3, Math.round(4 * k));
  const ww = Math.max(1, Math.round(1.1 * k));
  for (const b of SKYLINE[sx]) {
    if (b.tower) {
      tvTower(fr, cam, k, sx * b.X, b, xa, xb, ya, yb, soft);
      continue;
    }
    const X0 = sx > 0 ? b.X0 : -b.X1, X1 = sx > 0 ? b.X1 : -b.X0;
    const x0 = Math.round(sxOf(cam, k, X0)), x1 = Math.round(sxOf(cam, k, X1));
    const y0 = Math.round(syOf(cam, k, b.top));
    const c = b.far ? (soft ? C.ink : C.slate) : C.black;
    const cx0 = Math.max(xa, x0), cx1 = Math.min(xb, x1);
    if (cx1 <= cx0) continue;
    for (let y = Math.max(ya, y0); y < yb; y++) px.fill(c, y * W + cx0, y * W + cx1);
    if (b.far) {
      // a few dim lights in the far blocks, their shadow side a 1 px ink edge (the blocks part)
      if (soft) continue;
      const ex = sx > 0 ? x1 - 1 : x0;
      if (ex >= xa && ex < xb) for (let y = Math.max(ya, y0); y < yb; y++) px[y * W + ex] = C.ink;
      for (let y = y0 + 2; y < yb; y += pitchY) {
        for (let x = x0 + 1; x < x1 - 1; x += pitchX) {
          if (x < xa || x >= xb || y < ya) continue;
          const h = hash(b.seed + 50 * sx, x - x0, y - y0);
          if (h < 0.2) px[y * W + x] = h < 0.04 ? C.tanShade : C.steel;
        }
      }
      continue;
    }
    const mid = (x0 + x1) >> 1;
    const pset = (x, y, col) => {
      if (x >= xa && x < xb && y >= ya && y < yb) px[y * W + x] = col;
    };
    // a mast reads against the black top of the sky as ink (lit from the city), elsewhere as black
    const mast = (x, y) => {
      if (x >= xa && x < xb && y >= ya && y < yb) px[y * W + x] = px[y * W + x] === C.black ? C.ink : C.black;
    };
    // crowns: a stepped top, an antenna with its red light, the landmark's spire
    if (b.crown === 'step') {
      const sw = Math.max(2, Math.round((x1 - x0) * 0.32)), sh = Math.max(2, Math.round(5 * k));
      for (let y = y0 - sh; y < y0; y++) for (let x = mid - sw; x < mid + sw; x++) pset(x, y, c);
    } else if (b.crown === 'antenna') {
      const ah = Math.max(4, Math.round(10 * k));
      for (let y = y0 - ah; y < y0; y++) mast(mid, y);
      if (!soft) pset(mid, y0 - ah - 1, C.red);
    } else if (b.crown === 'spire') {
      // a tapering crown in three setbacks, then the mast and its light
      const half = (x1 - x0) / 2;
      let yy = y0;
      for (const [frac, hgt] of [[0.7, 6], [0.45, 6], [0.22, 7]]) {
        const hw = Math.max(1, Math.round(half * frac)), hh = Math.max(2, Math.round(hgt * k));
        for (let y = yy - hh; y < yy; y++) {
          for (let x = mid - hw; x < mid + hw; x++) pset(x, y, c);
          if (!soft) pset(sx > 0 ? mid - hw : mid + hw - 1, y, C.slate);
        }
        yy -= hh;
      }
      const mh = Math.max(5, Math.round(16 * k));
      for (let y = yy - mh; y < yy; y++) mast(mid, y);
      if (!soft) pset(mid, yy - mh - 1, C.red);
    }
    // the edge that faces the screen catches the studio's glow: a 1 px slate line (in focus only)
    if (!soft) {
      const ex = sx > 0 ? x0 : x1 - 1;
      for (let y = Math.max(ya, y0); y < yb; y++) if (ex >= xa && ex < xb) px[y * W + ex] = C.slate;
    }
    // lit windows on a pixel grid: floors on or off, a building warm or cool
    const lights = b.cool ? COOL_LIGHTS : WARM_LIGHTS;
    let row = 0;
    for (let y = y0 + Math.max(2, Math.round(3 * k)); y < yb - 1; y += pitchY, row++) {
      const floorOn = hash(b.seed + 97 * sx, row, 7) < 0.78;
      let col = 0;
      for (let x = x0 + 2; x + ww <= x1 - 1; x += pitchX, col++) {
        const h = hash(b.seed + 97 * sx, row, col + 11);
        if (h > (floorOn ? b.lit : b.lit * 0.25)) continue;
        if (soft && h > b.lit * 0.5) continue;
        const lc = soft ? C.tanShade : lights[Math.floor(hash(b.seed, row, col) * lights.length)];
        for (let dy = 0; dy < ww; dy++) for (let dx = 0; dx < ww; dx++) pset(x + dx, y + dy, lc);
      }
    }
  }
  // the glass's frame: a black header beam with a lit lip, the jamb by the screen wall, slim mullions lit
  // from camera-left
  const beam = (X0, Y0, X1, Y1, c) => rectW(fr, cam, X0, Y0, X1, Y1, c);
  beam(XA - 3, BAY.top - 30, XB + 3, BAY.top, C.black);
  const jamb = sx > 0 ? BAY.inner : -BAY.inner;
  beam(Math.min(jamb, jamb - sx * 4), BAY.top, Math.max(jamb, jamb - sx * 4), BAY.bottom, C.black);
  if (!soft) {
    beam(XA - 3, BAY.top - 1.4, XB + 3, BAY.top, C.ink);
    // the jamb's face toward the light
    if (sx > 0) beam(jamb - 4, BAY.top, jamb - 2.6, BAY.bottom, C.slate);
    else beam(jamb + 2.6, BAY.top, jamb + 4, BAY.bottom, C.ink);
  }
  for (const m of BAY.mullions) {
    const X = sx * m;
    beam(X - 1.2, BAY.top, X + 1.2, BAY.bottom, C.black);
    if (!soft) beam(X - 1.2, BAY.top, X - 0.2, BAY.bottom, C.ink);
  }
}

// the world-clock bar over the screen: four small faces, each with its city's code (micro type)
const CLOCKS = [['NYC', 7, 0], ['LON', 12, 0], ['TYO', 20, 0], ['SYD', 22, 0]];
const FACE7 = ['..###..', '.#...#.', '#.....#', '#.....#', '#.....#', '.#...#.', '..###..'];
function clockBar(fr, cam, soft) {
  if (soft) return;
  const k = kAt(cam, SET.wallZ);
  const s = Math.max(1, Math.round(k * 1.25));
  // as wide as the screen's frame (set.js drawScreen: a border of round(2k) px)
  const b = Math.max(1, Math.round(2 * k));
  const x0 = Math.round(sxOf(cam, k, SET.screen.x0)) - b, x1 = Math.round(sxOf(cam, k, SET.screen.x1)) + b;
  const yc = Math.round(syOf(cam, k, -121));
  const bh = 9 * s;
  const y0 = yc - (bh >> 1), y1 = y0 + bh;
  if (y1 <= 0 || y0 >= H) return;
  fr.span(x0, y0, x1, y1, C.black);
  fr.span(x0, y0, x1, y0 + 1, C.ink);
  const px = fr.px;
  const put = (x, y, c) => {
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
      const X = x + i, Y = y + j;
      if (X >= 0 && X < W && Y >= 0 && Y < H) px[Y * W + X] = c;
    }
  };
  const groups = CLOCKS.map(([code]) => textPixels(code, 'micro'));
  const gw = groups.map((g) => (7 + 2 + g.width) * s);
  const gap = 5 * s;
  const total = gw.reduce((a, b) => a + b, 0) + gap * (CLOCKS.length - 1);
  let x = Math.round((x0 + x1 - total) / 2);
  CLOCKS.forEach(([, hour], n) => {
    const fy = yc - Math.floor(3.5 * s);
    for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) {
      if (FACE7[j][i] === '#') put(x + i * s, fy + j * s, C.steel);
      else if ((j > 0 && j < 6 && i > 0 && i < 6) && !(j === 1 && (i === 1 || i === 5)) && !(j === 5 && (i === 1 || i === 5))) put(x + i * s, fy + j * s, C.ink);
    }
    // the hands: the minute hand up (on the hour), the hour hand toward its hour, the red hub
    const cxp = x + 3 * s, cyp = fy + 3 * s;
    put(cxp, cyp - s, C.silver);
    put(cxp, cyp - 2 * s, C.silver);
    const a = ((hour % 12) / 12) * Math.PI * 2;
    put(cxp + Math.round(Math.sin(a) * 1.6) * s, cyp - Math.round(Math.cos(a) * 1.6) * s, C.fog);
    put(cxp, cyp, C.red);
    const g = groups[n];
    const tx = x + (7 + 2) * s, ty = yc - Math.floor((g.cap * s) / 2);
    for (const [gx, gy] of g.pixels) put(tx + gx * s, ty + gy * s, C.fog);
    x += gw[n] + gap;
  });
}

function worldNow(fr, cam, style, soft) {
  cityBay(fr, cam, -1, soft);
  cityBay(fr, cam, 1, soft);
  clockBar(fr, cam, soft);
}

// --------------------------------------------------------------------------- TECH BYTES: the display wall
// A product lab after hours: on each side, between the light and the softbox, a black display cabinet with
// three backlit niches (a cyan LED strip along each top, the light falling down the back panel, a glass
// shelf edge), each showing one product, hand-pixelled at the wide's pixel size (scaled by whole pixels in
// tighter shots). Products, inner to outer rows: a gamepad, a retro handheld, a camera | a VR headset, a
// drone, a little UNIT-8 figure.
//   k black, i ink, s slate, t steel, f fog, v silver, w white, c cyan, b blue, n navy, r red, y yellow,
//   g green, d darkGreen, m magenta, o orange, e darkRed (TECH BYTES never shows COSMOS's magenta or purple:
//   the little UNIT-8's antenna light is red)
const PC = { k: 'black', i: 'ink', s: 'slate', t: 'steel', f: 'fog', v: 'silver', w: 'white', c: 'cyan', b: 'blue', n: 'navy', r: 'red', e: 'darkRed', y: 'yellow', g: 'green', d: 'darkGreen', m: 'magenta', o: 'orange' };
const PRODUCTS = {
  headphones: [
    '....kkkkkkk....',
    '..kkfffffffkk..',
    '.kft.......tsk.',
    '.kt.........sk.',
    'kt...........sk',
    'kkkk.......kkkk',
    'kwrek.....kwrek',
    'krrek.....krrek',
    'krrek.....krrek',
    '.kkk.......kkk.',
  ],
  gamepad: [
    '...kkkkkkkkkkk...',
    '..kfffffffffffk..',
    '.kftktttttttyttk.',
    'kftkkkttttttbtrtk',
    'kttktttsktttgttsk',
    'kttttttkskttttssk',
    'ksssskkkkkkksssk.',
    '.kssk.......kssk.',
    '..kk.........kk..',
  ],
  handheld: [
    '.kkkkkkkkk.',
    'kvvvvvvvvfk',
    'kvkkkkkkkfk',
    'kvkdgggdkfk',
    'kvkgdddgkfk',
    'kvkdddddkfk',
    'kvkkkkkkkfk',
    'kvvvvvvvvfk',
    'kvkvvvvrvfk',
    'kkkkvvrvvfk',
    'kvkvvvvvvfk',
    'kvvvvvssvfk',
    'kffffffffsk',
    '.kkkkkkkkk.',
  ],
  camera: [
    '.....kkkkk.......',
    '....kfffffk...kk.',
    'kkkkkkkkkkkkkkrrk',
    'kfffffkkkkkffffsk',
    'ktttkkvvvvvkkttsk',
    'ktttkvsnnnsvkttsk',
    'ktttkvnbbwnvkttsk',
    'ktttkvsnnnsvkttsk',
    'ktttkkvvvvvkktssk',
    'ksssssskkkssssssk',
    '.kkkkkkkkkkkkkkk.',
  ],
  headset: [
    '....kkkkkkkkk....',
    '...k.........k...',
    '..kkkkkkkkkkkkk..',
    '.kvwvvvvvvvvvvfk.',
    'kkvvvvvvvvvvvffkk',
    'kkvvvvvvvvvvvffkk',
    '.kvvvvvvvvvvvffk.',
    '.kfffkkkkkkkfffk.',
    '..kkk.......kkk..',
  ],
  joystick: [
    '....kkk....',
    '...krwrk...',
    '...krrrk...',
    '...kerek...',
    '....kkk....',
    '.....k.....',
    '.....k.....',
    '..kkkkkkk..',
    '.kffffffffk',
    'kttttttkrrk',
    'ksssssssssk',
    'kkkkkkkkkkk',
  ],
  drone: [
    'fffff.......fffff',
    '..k...........k..',
    '..k...........k..',
    '.kkkkkkfffkkkkkk.',
    '......kttttk.....',
    '......ktbctk.....',
    '......kkkkkk.....',
    '....k.......k....',
    '...kk.......kk...',
  ],
  robot: [
    '.....r.....',
    '.....k.....',
    '..kkkkkkk..',
    '.kvvvvvvvk.',
    'kvvvvvvvvfk',
    'kvkkkkkkkfk',
    'kvkwwkwwkfk',
    'kvkkkkkkkfk',
    'kvvvvvvvffk',
    '.kkkkkkkkk.',
    '..kttttfk..',
    '.kttckttfk.',
    'ktttttttffk',
    'kkkkkkkkkkk',
  ],
};
const CABINET = {
  X0: 152,
  X1: 207,
  niches: [[-116, -88], [-84, -56], [-52, -24], [-20, 8]],
  items: [['headphones', 'gamepad', 'handheld', 'camera'], ['headset', 'joystick', 'drone', 'robot']],
};

function spritePx(fr, rows, x, y, s, soft) {
  const px = fr.px;
  for (let j = 0; j < rows.length; j++) {
    for (let i = 0; i < rows[j].length; i++) {
      const ch = rows[j][i];
      if (ch === '.') continue;
      let c = C[PC[ch]];
      if (soft) c = ch === 'k' || ch === 'i' ? C.ink : C.slate;
      for (let dy = 0; dy < s; dy++) {
        const Y = y + j * s + dy;
        if (Y < 0 || Y >= H) continue;
        for (let dx = 0; dx < s; dx++) {
          const X = x + i * s + dx;
          if (X >= 0 && X < W) px[Y * W + X] = c;
        }
      }
    }
  }
}

function displayCabinet(fr, cam, sx, soft) {
  const k = kAt(cam, SET.wallZ);
  const XA = sx > 0 ? CABINET.X0 : -CABINET.X1, XB = sx > 0 ? CABINET.X1 : -CABINET.X0;
  const x0 = Math.round(sxOf(cam, k, XA)), x1 = Math.round(sxOf(cam, k, XB));
  const yTop = Math.round(syOf(cam, k, CABINET.niches[0][0] - 4)), yBot = Math.round(syOf(cam, k, 30));
  if (x1 <= 0 || x0 >= W || yBot <= 0 || yTop >= H) return;
  // the cabinet: black, its top edge and the side toward the light caught by the studio's light
  fr.span(x0, yTop, x1, yBot, C.black);
  if (!soft) {
    fr.span(x0, yTop, x1, yTop + 1, C.slate);
    if (sx > 0) fr.span(x0, yTop, x0 + 1, yBot, C.slate);
    else fr.span(x1 - 1, yTop, x1, yBot, C.ink);
  }
  const s = Math.max(1, Math.round(k * 1.4));
  const inset = Math.max(2, Math.round(3 * k));
  const px = fr.px;
  CABINET.niches.forEach(([Y0, Y1], n) => {
    const nx0 = x0 + inset, nx1 = x1 - inset;
    const ny0 = Math.round(syOf(cam, k, Y0)), ny1 = Math.round(syOf(cam, k, Y1));
    // the back panel, lit from the strip at the top: navy, a checker step, slate, a checker step, ink
    // (rows in pixels, scaled with the zoom); its side edges a pixel darker
    const r1 = Math.max(1, Math.round(1.4 * k)), step = Math.max(1, Math.round(1.4 * k)), r2 = Math.max(2, Math.round(4.2 * k));
    for (let y = Math.max(0, ny0); y < Math.min(H, ny1); y++) {
      const d = y - ny0 - 2; // below the strip and its housing
      for (let x = Math.max(0, nx0); x < Math.min(W, nx1); x++) {
        let c = C.ink;
        if (!soft && d >= 0) {
          const chk = (x + y) & 1;
          if (d < r1) c = C.navy;
          else if (d < r1 + step) c = chk ? C.navy : C.slate;
          else if (d < r1 + step + r2) c = C.slate;
          else if (d < r1 + 2 * step + r2) c = chk ? C.slate : C.ink;
          if ((x === nx0 || x === nx1 - 1) && c !== C.ink) c = c === C.navy ? C.slate : C.ink;
        }
        px[y * W + x] = c;
      }
    }
    if (ny1 <= 0 || ny0 >= H) return;
    if (!soft) {
      // the LED strip along the top (its end caps dark), its housing under it
      const cap = Math.max(1, Math.round(2.8 * k));
      fr.span(nx0, ny0, nx1, ny0 + 1, C.navy);
      fr.span(nx0 + cap, ny0, nx1 - cap, ny0 + 1, C.cyan);
      fr.span(nx0, ny0 + 1, nx1, ny0 + 2, C.navy);
    }
    // the glass shelf: a lit edge, its shadow
    fr.span(nx0, ny1 - 2, nx1, ny1 - 1, soft ? C.slate : C.fog);
    fr.span(nx0, ny1 - 1, nx1, ny1, C.slate);
    // the product, centred on the shelf, a soft pool of the strip's light on the back panel behind it
    const rows = PRODUCTS[CABINET.items[sx > 0 ? 1 : 0][n]];
    const w = rows[0].length * s, h = rows.length * s;
    const sxp = Math.round((nx0 + nx1 - w) / 2), syp = ny1 - 2 - h;
    if (!soft) {
      const cx = sxp + w / 2, cy = ny1 - 2 - h * 0.45, rx = w * 0.5 + 4 * s, ry = h * 0.55 + 3 * s;
      for (let y = Math.max(ny0 + 2, Math.floor(cy - ry)); y < Math.min(ny1 - 2, Math.ceil(cy + ry)); y++) {
        for (let x = Math.max(nx0 + 1, Math.floor(cx - rx)); x < Math.min(nx1 - 1, Math.ceil(cx + rx)); x++) {
          const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
          const v = 1 - (dx * dx + dy * dy);
          if (v <= 0 || px[y * W + x] !== C.ink) continue;
          if (v > 0.45 || v / 0.45 > bayer(x, y)) px[y * W + x] = C.slate;
        }
      }
    }
    spritePx(fr, rows, sxp, syp, s, soft);
  });
}

function techBytes(fr, cam, style, soft) {
  displayCabinet(fr, cam, -1, soft);
  displayCabinet(fr, cam, 1, soft);
}

// --------------------------------------------------------------------------- COSMOS: the planetarium wall
// The darkest room becomes a planetarium: a quiet starfield on the black wall beside the pools, two
// constellations drawn as star charts (Orion on the left; the Big Dipper and Cassiopeia on the right),
// their stars as small crosses joined by thin purple lines that stop short of each star, each named in
// micro type; and over the screen, the Moon's eight phases in a row. No coloured wash (cosmos.md: a purple
// light on the flanks reads as a club), nothing behind a head, every star at or under the faces' value
// but the few brightest.
// [name, x, y, mag] in chart units (x right, y down), mag 1 (brightest) .. 3; lines as index pairs
const ORION = {
  name: 'ORION',
  stars: [['Betelgeuse', 0, 0, 1, 'orange'], ['Bellatrix', 30, 5, 2], ['Meissa', 15, -12, 3], ['Alnitak', 10, 38, 2], ['Alnilam', 16, 35, 2], ['Mintaka', 22, 32, 2], ['Saiph', 4, 70, 2], ['Rigel', 36, 64, 1, 'blue']],
  lines: [[0, 2], [2, 1], [0, 3], [1, 5], [3, 4], [4, 5], [3, 6], [5, 7]],
};
const DIPPER = {
  name: 'URSA MAJOR',
  stars: [['Dubhe', 0, 0, 1], ['Merak', 2, 11, 2], ['Phecda', 15, 14, 2], ['Megrez', 16, 4, 3], ['Alioth', 27, 1, 2], ['Mizar', 37, -2, 2], ['Alkaid', 48, -8, 2]],
  lines: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6]],
};
const CASSIOPEIA = {
  name: 'CASSIOPEIA',
  stars: [['Caph', 0, 0, 2], ['Schedar', 9, 9, 2], ['Navi', 19, 3, 2], ['Ruchbah', 28, 11, 2], ['Segin', 38, 4, 3]],
  lines: [[0, 1], [1, 2], [2, 3], [3, 4]],
};
// where each chart sits on the wall (world units: its origin, units per chart unit, the label's offset)
const CHARTS = [
  { c: ORION, X: -206, Y: -96, u: 1.05, label: [-6, 82] },
  { c: DIPPER, X: 167, Y: -98, u: 1.25, label: [2, 22] },
  { c: CASSIOPEIA, X: 172, Y: -48, u: 1.25, label: [-2, 23] },
];

function starPx(fr, x, y, mag, tint, soft) {
  const px = fr.px;
  const set = (X, Y, c) => {
    if (X >= 0 && X < W && Y >= 0 && Y < H) px[Y * W + X] = c;
  };
  if (soft) {
    set(x, y, mag === 1 ? C.fog : C.steel);
    return;
  }
  const core = tint ? C[tint] : mag === 1 ? C.white : mag === 2 ? C.silver : C.fog;
  set(x, y, core);
  if (mag <= 2) {
    // a small cross: the arms one step dimmer
    const arm = tint === 'orange' ? C.tan : tint === 'blue' ? C.navy : mag === 1 ? C.silver : C.steel;
    set(x - 1, y, arm);
    set(x + 1, y, arm);
    set(x, y - 1, arm);
    set(x, y + 1, arm);
    if (mag === 1) {
      const tip = tint === 'orange' ? C.brown : tint === 'blue' ? C.slate : C.steel;
      set(x - 2, y, tip);
      set(x + 2, y, tip);
      set(x, y - 2, tip);
      set(x, y + 2, tip);
    }
  }
}

function chartLine(fr, ax, ay, bx, by, gapA, gapB, c) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay))));
  const len = Math.hypot(bx - ax, by - ay);
  for (let i = 0; i <= n; i++) {
    const t = i / n, d = t * len;
    if (d < gapA || len - d < gapB) continue;
    const x = Math.round(ax + (bx - ax) * t), y = Math.round(ay + (by - ay) * t);
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    const o = fr.px[y * W + x];
    if (o === C.black || o === C.ink) fr.px[y * W + x] = c;
  }
}

function constellation(fr, cam, ch, soft) {
  const k = kAt(cam, SET.wallZ);
  const P = ch.c.stars.map(([, x, y, mag, tint]) => [sxOf(cam, k, ch.X + x * ch.u), syOf(cam, k, ch.Y + y * ch.u), mag, tint]);
  // the lines stop a pixel short of each star's cross (two pixels for the brightest)
  const gap = (m) => (m === 1 ? 3 : 2) * Math.max(1, Math.round(k * 0.9));
  if (!soft) for (const [a, b] of ch.c.lines) chartLine(fr, P[a][0], P[a][1], P[b][0], P[b][1], gap(P[a][2]), gap(P[b][2]), C.purple);
  for (const [x, y, mag, tint] of P) starPx(fr, Math.round(x), Math.round(y), mag, tint, soft);
  if (soft) return;
  // its name in micro type, dim (slate), at whole-pixel scale
  const g = textPixels(ch.c.name, 'micro');
  const s = Math.max(1, Math.round(k * 1.1));
  const lx = Math.round(sxOf(cam, k, ch.X + ch.label[0])), ly = Math.round(syOf(cam, k, ch.Y + ch.label[1]));
  // a name is shown whole or not at all (a framing that cuts it, or the flats over it, drops it)
  const kf = kAt(cam, SET.flatsZ);
  const fl = Math.round(sxOf(cam, kf, -FLATS_X)), fr0 = Math.round(sxOf(cam, kf, FLATS_X));
  if (lx < Math.max(1, fl + 2) || lx + g.width * s > Math.min(W - 1, fr0 - 2) || ly < 1 || ly + g.cap * s > H - 1) return;
  for (const [gx, gy] of g.pixels) {
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
      const x = lx + gx * s + i, y = ly + gy * s + j;
      if (x >= 0 && x < W && y >= 0 && y < H) fr.px[y * W + x] = C.steel;
    }
  }
}

const FLATS_X = 196; // the set flats' inner edge (set.js FLAT_X, world X at SET.flatsZ)

function starfield(fr, cam, soft) {
  // faint background stars beside the pools (|X| 140-300) and in the band over the screen: mostly slate and
  // steel, a few fog, a very few silver; deterministic
  const k = kAt(cam, SET.wallZ);
  const r = rng(41);
  for (let n = 0; n < 230; n++) {
    const top = r() < 0.18;
    const X = top ? -130 + r() * 260 : (r() < 0.5 ? -1 : 1) * (140 + r() * 160);
    const Y = top ? -134 + r() * 20 : -130 + r() * 132;
    const v = r();
    if (soft && v < 0.85) continue;
    const x = Math.round(sxOf(cam, k, X)), y = Math.round(syOf(cam, k, Y));
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    if (fr.px[y * W + x] !== C.black) continue; // only on the black wall, never on a pool's edge
    fr.px[y * W + x] = v > 0.97 ? C.silver : v > 0.85 ? C.fog : v > 0.45 ? C.steel : C.slate;
  }
}

// the Moon's phases over the screen: 7 px discs (whole-pixel scale), lit limb silver, dark side ink with a
// slate rim, the new Moon a slate ring
function moonPhases(fr, cam, soft) {
  if (soft) return;
  const k = kAt(cam, SET.wallZ);
  const s = Math.max(1, Math.round(k * 1.25));
  const R = 3.5 * s;
  const x0 = sxOf(cam, k, SET.screen.x0 + 6), x1 = sxOf(cam, k, SET.screen.x1 - 6);
  const yc = Math.round(syOf(cam, k, -121.5));
  const px = fr.px;
  // a black strip behind the row (as wide as the screen's frame), its top edge ink
  const b = Math.max(1, Math.round(2 * k));
  const bx0 = Math.round(sxOf(cam, k, SET.screen.x0)) - b, bx1 = Math.round(sxOf(cam, k, SET.screen.x1)) + b;
  const by0 = yc - Math.floor(R) - 1 - s, by1 = yc + Math.ceil(R) + 1 + s;
  fr.span(bx0, by0, bx1, by1, C.black);
  fr.span(bx0, by0, bx1, by0 + 1, C.ink);
  for (let p = 0; p < 8; p++) {
    const cx = Math.round(x0 + ((x1 - x0) * p) / 7);
    // phase angle: 0 new, 0.5 full; the terminator's x (in radius units) for each row
    // the terminator per phase, pushed toward the readable at 7 px (a true crescent is a 1 px sliver)
    const waxing = p <= 4;
    const t = [1, 0.35, 0, -0.45, -1, -0.45, 0, 0.35][p];
    for (let j = 0; j < 7 * s; j++) {
      for (let i = 0; i < 7 * s; i++) {
        const dx = (i + 0.5 - R) / R, dy = (j + 0.5 - R) / R;
        const d = dx * dx + dy * dy;
        if (d > 1) continue;
        const half = Math.sqrt(Math.max(0, 1 - dy * dy));
        // lit if beyond the terminator on the lit side (waxing: the right side)
        const u = waxing ? dx : -dx;
        const lit = p === 0 ? false : u > t * half;
        let c = lit ? (d > 0.62 && u < 0 ? C.fog : C.silver) : d > 0.55 ? C.slate : C.ink;
        if (p === 0) c = d > 0.55 ? C.slate : C.black;
        const X = cx - Math.floor(R) + i, Y = yc - Math.floor(R) + j;
        if (X >= 0 && X < W && Y >= 0 && Y < H) px[Y * W + X] = c;
      }
    }
  }
}

// a star chart's coordinate grid behind the constellations: two curved parallels and three meridians per
// side, dotted ink on the black wall (in focus only)
function chartGrid(fr, cam, soft) {
  if (soft) return;
  const k = kAt(cam, SET.wallZ);
  const px = fr.px;
  const dot = (X, Y) => {
    const x = Math.round(sxOf(cam, k, X)), y = Math.round(syOf(cam, k, Y));
    if (x < 0 || x >= W || y < 0 || y >= H || ((x + y) & 1)) return;
    if (px[y * W + x] === C.black) px[y * W + x] = C.ink;
  };
  for (const sx of [-1, 1]) {
    // parallels: arcs bowing down, centred on the screen
    for (const Y0 of [-112, -62, -14]) for (let X = 146; X <= 300; X += 0.5) dot(sx * X, Y0 + (X - 146) * (X - 146) * 0.0016);
    // meridians: lines converging toward a pole above the frame
    for (const X0 of [160, 200, 240]) for (let Y = -134; Y <= 10; Y += 0.5) dot(sx * (X0 + (Y + 134) * (X0 - 150) * 0.0026), Y);
  }
}

function cosmos(fr, cam, style, soft) {
  starfield(fr, cam, soft);
  chartGrid(fr, cam, soft);
  for (const ch of CHARTS) {
    if (ch.X > 0) constellation(fr, cam, ch, soft);
    else constellation(fr, cam, ch, soft);
  }
  moonPhases(fr, cam, soft);
}

// --------------------------------------------------------------------------- MONEY MINUTE: the private bank
// A panelled room after the close: a dark-wood dado with raised panels and a chair rail along the foot of
// the wall; a bull and a bear in bronze relief on dark plaques either side, facing each other across the
// screen (the market's two moods, no figures); an LED ticker band along the top of the wall with the
// programme's beats in green micro type (no prices: the channel never shows a figure it did not report).
// The bronze sconces of the style stay between them.

/** Rasterise a shape list (ellipses and capsules in local units) into a mask, then emboss it in bronze. */
// (the Charging Bull's build: a small round rump, a massive shoulder, the head down, short thick horns
// curving forward, the tail lashing up; the bear: a long heavy body, the hump over the shoulders, the head
// low, round ears, a tapering snout; 'x' marks the eye)
const BULL = [
  ['e', 7, 7.5, 4.5, 4.5], ['e', 13.5, 8, 8, 4.6], ['e', 19.5, 6.3, 5.5, 5.3], ['e', 21.5, 10, 4, 3.2],
  ['e', 25.5, 10.4, 3, 2.6], ['e', 28, 11.6, 1.7, 1.6],
  ['c', 24.6, 8, 26.4, 5.4, 0.95], ['c', 26.4, 5.4, 28.6, 4.8, 0.75],
  ['c', 21, 12, 23.5, 15.3, 1.4], ['c', 18.5, 12, 17.8, 15.3, 1.35, 'far'], ['c', 6.5, 11, 4.6, 15.3, 1.4], ['c', 9.5, 11.5, 10, 15.3, 1.3, 'far'],
  ['c', 3, 5.5, 1.6, 3, 0.6], ['c', 1.6, 3, 2.6, 0.9, 0.55], ['e', 3, 0.8, 1, 0.8],
  ['x', 25.6, 9.4],
];
const BEAR = [
  ['e', 14, 8.5, 10, 4.6], ['e', 19, 6.2, 5, 4.3], ['e', 6, 7.8, 4.6, 4.4],
  ['e', 24.3, 8.6, 3.2, 2.8], ['e', 27.6, 9.6, 2.1, 1.4], ['e', 23.2, 5.9, 1, 1],
  ['c', 20.5, 11, 21, 15.3, 1.8], ['c', 17, 11, 16.6, 15.3, 1.7, 'far'], ['c', 8, 11, 7.4, 15.3, 1.9], ['c', 11, 11, 11.4, 15.3, 1.6, 'far'],
  ['e', 1.6, 6.8, 0.8, 0.8],
  ['x', 25.2, 8.1],
];
function inShape(sh, x, y) {
  if (sh[0] === 'x') return false;
  if (sh[0] === 'e') {
    const dx = (x - sh[1]) / sh[3], dy = (y - sh[2]) / sh[4];
    return dx * dx + dy * dy <= 1;
  }
  const [, ax, ay, bx, by, r] = sh;
  const vx = bx - ax, vy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)));
  const dx = x - (ax + vx * t), dy = y - (ay + vy * t);
  return dx * dx + dy * dy <= r * r;
}
function relief(fr, cam, shapes, X, Y, unit, flip, soft) {
  // local box 30 x 16; (X, Y) the box's centre on the wall; one local unit = `unit` world units
  const k = kAt(cam, SET.wallZ);
  const pxu = unit * k; // pixels per local unit
  const w = Math.ceil(30 * pxu), h = Math.ceil(16 * pxu);
  const x0 = Math.round(sxOf(cam, k, X) - w / 2), y0 = Math.round(syOf(cam, k, Y) - h / 2);
  const mask = new Uint8Array((w + 2) * (h + 2));
  const at = (i, j) => mask[(j + 1) * (w + 2) + (i + 1)];
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      let lx = (i + 0.5) / pxu;
      if (flip) lx = 30 - lx;
      const ly = (j + 0.5) / pxu;
      // 2 for the near side, 1 where only a far leg is (one step darker, so the legs read in pairs)
      let v = 0;
      for (const sh of shapes) {
        if (!inShape(sh, lx, ly)) continue;
        v = sh[6] === 'far' ? Math.max(v, 1) : 2;
        if (v === 2) break;
      }
      mask[(j + 1) * (w + 2) + (i + 1)] = v;
    }
  }
  const px = fr.px;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (!at(i, j)) continue;
      const x = x0 + i, y = y0 + j;
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      let c = at(i, j) === 1 ? C.tanShade : C.tan;
      if (soft) c = C.tanShade;
      else {
        // embossed: lit from the top-left (cream where the edge faces the light), shadowed bottom-right
        const tl = !at(i - 1, j) || !at(i, j - 1);
        const br = !at(i + 1, j) || !at(i, j + 1);
        const br2 = !at(i + 1, j + 1);
        const far = at(i, j) === 1;
        if (br) c = C.brown;
        else if (tl) c = far ? C.tan : C.cream;
        else if (br2) c = far ? C.brown : C.tanShade;
      }
      px[y * W + x] = c;
    }
  }
  if (soft) return;
  for (const sh of shapes) {
    if (sh[0] !== 'x') continue;
    const i = Math.floor((flip ? 30 - sh[1] : sh[1]) * pxu), j = Math.floor(sh[2] * pxu);
    const x = x0 + i, y = y0 + j;
    if (x >= 0 && x < W && y >= 0 && y < H && at(i, j)) px[y * W + x] = C.brown;
  }
}
function plaque(fr, cam, X, Y, shapes, flip, soft) {
  // a dark plaque with a bevelled bronze frame, the animal in relief on it
  const PW = 70, PH = 44;
  rectW(fr, cam, X - PW / 2 - 2, Y - PH / 2 - 2, X + PW / 2 + 2, Y + PH / 2 + 2, soft ? C.maroon : C.brown);
  if (!soft) {
    rectW(fr, cam, X - PW / 2 - 2, Y - PH / 2 - 2, X + PW / 2 + 2, Y - PH / 2 - 0.8, C.tan);
    rectW(fr, cam, X - PW / 2 - 2, Y - PH / 2 - 2, X - PW / 2 - 0.8, Y + PH / 2 + 2, C.tanShade);
  }
  rectW(fr, cam, X - PW / 2, Y - PH / 2, X + PW / 2, Y + PH / 2, C.black);
  rectW(fr, cam, X - PW / 2 + 1.3, Y - PH / 2 + 1.3, X + PW / 2 - 1.3, Y + PH / 2 - 1.3, soft ? C.black : C.ink);
  relief(fr, cam, shapes, X, Y + 1, 1.95, flip, soft);
  if (soft) return;
  // a small brass plate under the frame with its name
  const k = kAt(cam, SET.wallZ);
  const s = Math.max(1, Math.round(k * 1.25));
  const g = textPixels(flip ? 'BEAR' : 'BULL', 'micro');
  const pw = (g.width + 6) * s, ph = (5 + 3) * s;
  const cx = Math.round(sxOf(cam, k, X)), py = Math.round(syOf(cam, k, Y + PH / 2 + 4));
  const x0 = cx - (pw >> 1);
  fr.span(x0, py, x0 + pw, py + ph, C.tanShade);
  fr.span(x0, py, x0 + pw, py + s, C.tan);
  fr.span(x0, py + ph - s, x0 + pw, py + ph, C.brown);
  for (const [gx, gy] of g.pixels) fr.span(x0 + (3 + gx) * s, py + (2 + gy) * s, x0 + (4 + gx) * s, py + (3 + gy) * s, C.maroon);
}

// the dado: raised panels between stiles, a chair rail on top, all in the dark-wood ramp
const DADO = { top: -16, foot: 30, panel: 38, stile: 6 };
function dado(fr, cam, soft) {
  const k = kAt(cam, SET.wallZ);
  const T = DADO.top;
  // out of focus the wood keeps its own value (brown, a step over the jackets' maroon: Penny stays clear of it)
  rectW(fr, cam, -400, T, 400, DADO.foot, C.brown);
  // the chair rail: a lit top, its body, a shadow under it
  rectW(fr, cam, -400, T - 4, 400, T, C.tanShade);
  if (!soft) {
    rectW(fr, cam, -400, T - 4, 400, T - 2.8, C.tan);
    rectW(fr, cam, -400, T, 400, T + 1.4, C.maroon);
  }
  const pitch = DADO.panel + DADO.stile;
  if (soft) {
    // out of focus only the stiles' grooves remain, as soft seams
    for (let X = -400 + DADO.stile; X < 400; X += pitch) {
      rectW(fr, cam, X - 1, T + 3, X + 1, DADO.foot, C.maroon);
      rectW(fr, cam, X + DADO.panel - 1, T + 3, X + DADO.panel + 1, DADO.foot, C.maroon);
    }
    return;
  }
  // raised panels: lit top and left bevels, shadowed bottom and right, the field one step darker
  for (let X = -400 + DADO.stile; X < 400; X += pitch) {
    const Y0 = T + 4, Y1 = DADO.foot - 2;
    rectW(fr, cam, X, Y0, X + DADO.panel, Y1, C.maroon); // the groove round the panel
    rectW(fr, cam, X + 1.4, Y0 + 1.4, X + DADO.panel - 1.4, Y1 - 1.4, C.brown);
    rectW(fr, cam, X + 1.4, Y0 + 1.4, X + DADO.panel - 1.4, Y0 + 2.6, C.tanShade); // top bevel, lit
    rectW(fr, cam, X + 1.4, Y0 + 1.4, X + 2.6, Y1 - 1.4, C.tanShade); // left bevel, lit
  }
  void k;
}

// the LED ticker band along the top of the wall: the programme's beats in green micro type, dots between
const TICKER = 'MONEY MINUTE • MARKETS • CURRENCIES • COMMODITIES • ENERGY • TECH • ';
const DOTS = new Set(); // the glyph columns of the dots in TICKER (filled on first use)
function ticker(fr, cam, soft) {
  if (soft) return;
  const k = kAt(cam, SET.wallZ);
  const s = Math.max(1, Math.round(k * 1.25));
  const y0 = Math.round(syOf(cam, k, -133.5)), bh = 9 * s;
  const x0 = Math.round(sxOf(cam, k, -300)), x1 = Math.round(sxOf(cam, k, 300));
  if (y0 + bh <= 0 || y0 >= H) return;
  fr.span(x0, y0, x1, y0 + bh, C.black);
  fr.span(x0, y0 + bh, x1, y0 + bh + 1, C.ink);
  const g = textPixels(TICKER, 'micro');
  // the words in fog (the room is after the close: calm), the dots between them in the programme's green
  if (!DOTS.size) {
    let x = 0;
    for (const ch of TICKER) {
      const w = ch === ' ' ? 2 : textPixels(ch, 'micro').width + 1;
      if (ch === '•') for (let i = 0; i < w - 1; i++) DOTS.add(x + i);
      x += w;
    }
  }
  const ty = y0 + Math.floor((bh - 5 * s) / 2);
  const px = fr.px;
  // the text runs from the left of the frame, repeated across (anchored on the wall so it moves with it)
  const start = Math.round(sxOf(cam, k, -300));
  for (let base = start; base < Math.min(W, x1); base += (g.width + 4) * s) {
    for (const [gx, gy] of g.pixels) {
      for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
        const x = base + gx * s + i, y = ty + gy * s + j;
        if (x < Math.max(0, x0) || x >= Math.min(W, x1) || y < 0 || y >= H) continue;
        px[y * W + x] = DOTS.has(gx) ? C.green : C.fog;
      }
    }
  }
}

function moneyMinute(fr, cam, style, soft) {
  dado(fr, cam, soft);
  plaque(fr, cam, -190, -82, BULL, false, soft); // the bull faces right, toward the screen
  plaque(fr, cam, 190, -82, BEAR, true, soft); // the bear faces left
  ticker(fr, cam, soft);
}

// --------------------------------------------------------------------------- NEWS IN 60: the minute
function minuteRing(fr, cam, soft) {
  // sixty marks on an ellipse round the screen (every fifth longer); the first fifteen yellow
  const cx = 0, cy = -66, rx = 112, ry = 62;
  for (let i = 0; i < 60; i++) {
    const a = -Math.PI / 2 + (i / 60) * Math.PI * 2;
    const long = i % 5 === 0;
    const r0 = long ? 0.9 : 0.94;
    const c = soft ? C.slate : i < 15 ? C.yellow : long ? C.fog : C.steel;
    lineW(fr, cam, cx + Math.cos(a) * rx * r0, cy + Math.sin(a) * ry * r0, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, c);
  }
}
function monitorBank(fr, cam, sx, soft) {
  const X0 = sx > 0 ? 166 : -296;
  const r = rng(sx > 0 ? 61 : 67);
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 2; i++) {
      const X = X0 + i * 66, Y = -114 + j * 38;
      rectW(fr, cam, X - 2, Y - 2, X + 62, Y + 34, C.black);
      rectW(fr, cam, X, Y, X + 60, Y + 32, soft ? C.ink : C.slate);
      if (soft) continue;
      // each a dim frame: a picture's bars (steel, ink) and a steel strap at its foot; the live one (the
      // bank's top inner screen) carries a yellow tag, so the room's yellow stays under the bible's 1.5 %
      for (let b = 0; b < 4; b++) {
        const bh = 6 + r() * 14;
        rectW(fr, cam, X + 4 + b * 13, Y + 26 - bh, X + 13 + b * 13, Y + 26, r() < 0.5 ? C.steel : C.ink);
      }
      const live = j === 0 && (sx > 0 ? i === 0 : i === 1);
      rectW(fr, cam, X, Y + 27, X + 60, Y + 30, C.steel);
      if (live) rectW(fr, cam, X, Y + 27, X + 24, Y + 30, C.yellow);
      rectW(fr, cam, X + 2, Y + 28, X + 22, Y + 29, C.black);
    }
  }
}
function news60(fr, cam, style, soft) {
  minuteRing(fr, cam, soft);
  monitorBank(fr, cam, -1, soft);
  monitorBank(fr, cam, 1, soft);
}

// --------------------------------------------------------------------------- entry points
/** The dressing switch (tests of the bare architecture; labs): set.js setDressing() also clears its caches. */
export const DRESSING = { on: true };

const DRESS = { 'world-now': worldNow, 'tech-bytes': techBytes, cosmos, 'money-minute': moneyMinute, 'news-60': news60 };

/** The programme's dressing on the back wall (after the light, before the screen and the flats). */
export function drawDressing(fr, cam, style, soft = false) {
  if (!DRESSING.on) return;
  const f = DRESS[style?.id];
  if (f) f(fr, cam, style, soft);
}

/**
 * The desk front per programme: { hi, lo } panel colours (palette names) and an optional pattern:
 * 'grain' (wood: tanShade lines), 'stars' (silver points), 'stripe' (a band of the accent at the panel's foot).
 */
export const DESK_FRONTS = {
  'world-now': null, // the home desk
  'tech-bytes': null, // the steel plinth (set.js)
  cosmos: { hi: 'ink', lo: 'black', pattern: 'stars' },
  'money-minute': { hi: 'brown', lo: 'black', pattern: 'grain', top: 'tanShade' }, // the lower panel black (graphics zone)
  'news-60': { hi: 'ink', lo: 'black', pattern: 'stripe', stripe: 'yellow' },
};
