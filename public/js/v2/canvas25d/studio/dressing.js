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
//   COSMOS DESK   a planetarium set: two portrait LED panels play star charts (a quiet starfield, a dotted
//                 grid, Orion | the Big Dipper and Cassiopeia: crosses, purple lines, names in micro type),
//                 the Moon's eight phases over the screen, a dark desk front with stars
//   MONEY MINUTE  a business set after the close: a slatted wood wall washed from its rail, a bull and a bear
//                 etched in two edge-lit glass panels on standoffs, an LED ticker of the programme's beats (no
//                 prices), the bronze sconces of the style, a wood front with broken-run grain
//   NEWS IN 60    a flash studio: a broadcast studio clock (sixty second-LEDs, the first quarter lit yellow,
//                 "60" at its heart) on the left, the rundown board (RUNDOWN, five numbered beats, the one on
//                 air marked yellow) on the right, a thin yellow band on the desk
// Each set carries its colour in light lines, as real sets do (Seven News's blue fascia band, Bloomberg's
// cyan rings, CNBC's lit desk slashes): a cove along the top, ribbons framing its feature, LED slits in the
// desk's seams (WORLD NOW red, TECH BYTES blue, COSMOS magenta, NEWS IN 60 orange; MONEY MINUTE's green is its
// ticker's edge and the glass panels' feet). TECH BYTES also carries its name on the set, a terminal line.
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
const FLATS_X = 196; // the set flats' inner edge (set.js FLAT_X, world X at SET.flatsZ)

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
  // from camera-left. Laid out in whole pixels from one rounded edge each (a width that rounds on its own
  // would let a line drop out and pop back during a push)
  const beam = (X0, Y0, X1, Y1, c) => rectW(fr, cam, X0, Y0, X1, Y1, c);
  beam(XA - 3, BAY.top - 30, XB + 3, BAY.top, C.black);
  if (!soft) beam(XA - 3, BAY.top - 1.4, XB + 3, BAY.top, C.ink);
  const ys0 = Math.max(0, by0), ys1 = Math.min(H, by1);
  const column = (x, w, c) => {
    if (w > 0) fr.span(Math.max(0, x), ys0, Math.min(W, x + w), ys1, c);
  };
  // the jamb: 3 px (scaled) of black on the bay's inner edge, its face toward the light one pixel wide
  const jw = Math.max(2, Math.round(3 * k));
  if (sx > 0) {
    column(bx0, jw, C.black);
    if (!soft) column(bx0 - 1, 1, C.slate);
  } else {
    column(bx1 - jw, jw, C.black);
    if (!soft) column(bx1, 1, C.ink);
  }
  const mw = Math.max(1, Math.round(2.4 * k));
  for (const m of BAY.mullions) {
    const x = Math.round(sxOf(cam, k, sx * m) - mw / 2);
    column(x, mw, C.black);
    if (!soft && mw >= 2) column(x, 1, C.ink);
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

/**
 * The programme's LED cove along the top of the set (real sets carry their colour in light lines: Seven
 * News's blue fascia band, Bloomberg's cyan rings): a 1 px line of the accent at the ceiling line, its glow a
 * checker row under it, across the set between the flats. `dash` > 0 breaks it into segments (a light budget).
 */
function cove(fr, cam, c, glow, { Y = -128, dash = 0, soft = false } = {}) {
  if (soft) return;
  const k = kAt(cam, SET.wallZ);
  const y = Math.round(syOf(cam, k, Y));
  if (y < 0 || y >= H - 1) return;
  const kf = kAt(cam, SET.flatsZ);
  const x0 = Math.max(0, Math.round(sxOf(cam, kf, -FLATS_X))), x1 = Math.min(W, Math.round(sxOf(cam, kf, FLATS_X)));
  const ox = Math.round(sxOf(cam, k, 0));
  const px = fr.px;
  for (let x = x0; x < x1; x++) {
    if (dash && ((((x - ox) % dash) + dash) % dash) >= dash * 0.6) continue;
    px[y * W + x] = c;
    if (glow && ((x + y + 1) & 1)) px[(y + 1) * W + x] = glow;
  }
}
/** A vertical LED ribbon of the accent at wall X (1 px, whole pixels), from Y0 to Y1. */
function ribbon(fr, cam, X, Y0, Y1, c, soft) {
  if (soft) return;
  const k = kAt(cam, SET.wallZ);
  const x = Math.round(sxOf(cam, k, X));
  if (x < 0 || x >= W) return;
  const y0 = Math.max(0, Math.round(syOf(cam, k, Y0))), y1 = Math.min(H, Math.round(syOf(cam, k, Y1)));
  for (let y = y0; y < y1; y++) fr.px[y * W + x] = c;
}

function worldNow(fr, cam, style, soft) {
  cityBay(fr, cam, -1, soft);
  cityBay(fr, cam, 1, soft);
  clockBar(fr, cam, soft);
  // the network's red in light: the cove along the top, a ribbon down each bay's jamb
  cove(fr, cam, C.red, C.darkRed, { soft });
  ribbon(fr, cam, -BAY.inner + 0.5, BAY.top, BAY.bottom, C.red, soft);
  ribbon(fr, cam, BAY.inner - 0.5, BAY.top, BAY.bottom, C.red, soft);
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

/**
 * A lightbox strip over the screen (as WORLD NOW's clock bar): black, an ink top edge, a line of micro type
 * centred in it from coloured runs [[text, colour], ...] (real sets carry the show's name on the set).
 */
function headerStrip(fr, cam, runs, soft) {
  if (soft) return;
  const k = kAt(cam, SET.wallZ);
  const s = Math.max(1, Math.round(k * 1.25));
  const b = Math.max(1, Math.round(2 * k));
  const x0 = Math.round(sxOf(cam, k, SET.screen.x0)) - b, x1 = Math.round(sxOf(cam, k, SET.screen.x1)) + b;
  const yc = Math.round(syOf(cam, k, -121));
  const bh = 9 * s, y0 = yc - (bh >> 1);
  if (y0 + bh <= 0 || y0 >= H) return;
  fr.span(x0, y0, x1, y0 + bh, C.black);
  fr.span(x0, y0, x1, y0 + 1, C.ink);
  const glyphs = runs.map(([t, c]) => [textPixels(t, 'micro'), c, t]);
  const widthOf = (t, g) => g.width + (t.endsWith(' ') ? 2 : 0) + (t.startsWith(' ') ? 2 : 0);
  const total = glyphs.reduce((a, [g, , t]) => a + (widthOf(t, g) + 1) * s, 0) - s;
  let x = Math.round((x0 + x1 - total) / 2);
  const ty = yc - Math.floor((5 * s) / 2);
  for (const [g, c, t] of glyphs) {
    const lead = t.startsWith(' ') ? 2 * s : 0;
    for (const [gx, gy] of g.pixels) fr.span(x + lead + gx * s, ty + gy * s, x + lead + (gx + 1) * s, ty + (gy + 1) * s, c);
    x += (widthOf(t, g) + 1) * s;
  }
}

function techBytes(fr, cam, style, soft) {
  // the show's name in a terminal line over the screen: a prompt, the name, the cursor
  headerStrip(fr, cam, [['>', C.blue], [' TECH BYTES', C.fog], ['_', C.cyan]], soft);
  displayCabinet(fr, cam, -1, soft);
  displayCabinet(fr, cam, 1, soft);
  // the lab's light lines in blue (the cyan stays in the niches: TECH BYTES' cyan is capped at 1 %): the cove
  // along the top, a ribbon up each cabinet's edge toward the screen
  cove(fr, cam, C.blue, C.navy, { soft });
  ribbon(fr, cam, -CABINET.X0 + 0.5, CABINET.niches[0][0] - 4, 30, C.blue, soft);
  ribbon(fr, cam, CABINET.X0 - 0.5, CABINET.niches[0][0] - 4, 30, C.blue, soft);
}

// --------------------------------------------------------------------------- COSMOS: the planetarium set
// The darkest room, dressed as a science set: two portrait LED panels either side of the wall play star
// charts (a quiet starfield and a chart's dotted grid on their black screens; Orion on the left, the Big
// Dipper and Cassiopeia on the right, stars as small crosses joined by thin purple lines that stop short of
// each star, each named in micro type), and over the screen a strip of the Moon's eight phases. No coloured
// wash or light on the flanks (cosmos.md: it reads as a club), nothing behind a head.
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
  { c: ORION, X: -204, Y: -100, u: 1.05, label: [-6, 82] },
  { c: DIPPER, X: 162, Y: -98, u: 1.25, label: [2, 22] },
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

// the two portrait LED panels the charts play on (world units: X0, Y0, X1, Y1), either side of the wall
const SKY_PANELS = [[-228, -126, -150, -2], [150, -126, 228, -2]];
/** A portrait LED panel: an ink bezel lit along its top and left edges, the black screen inside. */
function skyPanel(fr, cam, [X0, Y0, X1, Y1], soft) {
  const k = kAt(cam, SET.wallZ);
  const b = 3;
  rectW(fr, cam, X0 - b, Y0 - b, X1 + b, Y1 + b, C.ink);
  if (!soft) {
    rectW(fr, cam, X0 - b, Y0 - b, X1 + b, Y0 - b + 1.4, C.slate);
    rectW(fr, cam, X0 - b, Y0 - b, X0 - b + 1.4, Y1 + b, C.slate);
  }
  rectW(fr, cam, X0, Y0, X1, Y1, C.black);
  void k;
}
function starfield(fr, cam, soft) {
  // faint stars on the panels' screens: mostly slate and steel, a few fog, a very few silver; deterministic
  const k = kAt(cam, SET.wallZ);
  SKY_PANELS.forEach(([X0, Y0, X1, Y1], n) => {
    const r = rng(41 + n * 7);
    for (let i = 0; i < 95; i++) {
      const X = X0 + 2 + r() * (X1 - X0 - 4), Y = Y0 + 2 + r() * (Y1 - Y0 - 4);
      const v = r();
      if (soft && v < 0.85) continue;
      const x = Math.round(sxOf(cam, k, X)), y = Math.round(syOf(cam, k, Y));
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      if (fr.px[y * W + x] !== C.black) continue;
      fr.px[y * W + x] = v > 0.97 ? C.silver : v > 0.85 ? C.fog : v > 0.45 ? C.steel : C.slate;
    }
  });
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
  for (const [X0, Y0, X1, Y1] of SKY_PANELS) {
    const sx = X0 < 0 ? -1 : 1;
    const dot = (X, Y) => {
      if (X < X0 + 1 || X > X1 - 1 || Y < Y0 + 1 || Y > Y1 - 1) return;
      const x = Math.round(sxOf(cam, k, X)), y = Math.round(syOf(cam, k, Y));
      if (x < 0 || x >= W || y < 0 || y >= H || ((x + y) & 1)) return;
      if (px[y * W + x] === C.black) px[y * W + x] = C.ink;
    };
    // parallels bowing down, meridians converging toward a pole above the panel
    for (const P0 of [-104, -62, -20]) for (let X = 150; X <= 228; X += 0.5) dot(sx * X, P0 + (X - 150) * (X - 150) * 0.0022);
    for (const M0 of [164, 196]) for (let Y = Y0; Y <= Y1; Y += 0.5) dot(sx * (M0 + (Y - Y0) * (M0 - 140) * 0.0024), Y);
  }
}

function cosmos(fr, cam, style, soft) {
  for (const r of SKY_PANELS) skyPanel(fr, cam, r, soft);
  // the programme's magenta as lines, never as a wash (cosmos.md): the cove at the top over the panels, an
  // LED edge on each panel's side toward the screen, the desk's seams (DESK_FRONTS) answering the desk line
  cove(fr, cam, C.magenta, C.purple, { soft, Y: -131.5 });
  ribbon(fr, cam, SKY_PANELS[0][2] + 2.4, SKY_PANELS[0][1] - 3, SKY_PANELS[0][3] + 3, C.magenta, soft);
  ribbon(fr, cam, SKY_PANELS[1][0] - 2.4, SKY_PANELS[1][1] - 3, SKY_PANELS[1][3] + 3, C.magenta, soft);
  starfield(fr, cam, soft);
  chartGrid(fr, cam, soft);
  for (const ch of CHARTS) constellation(fr, cam, ch, soft);
  moonPhases(fr, cam, soft);
}

// --------------------------------------------------------------------------- MONEY MINUTE: the business set
// A business-news set after the close (CNBC and Bloomberg sets: LED bands, edge-lit glass, warm wood
// slats): a slatted wood wall along the foot, washed from a light hidden in its top rail; a bull and a bear
// etched into two edge-lit glass panels on standoffs either side, facing each other across the screen (the
// market's two moods, no figures); an LED ticker band along the top of the wall with the programme's beats
// (no prices: the channel never shows a figure it did not report). The bronze sconces of the style stay.

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
/** The shape list's mask at `pxu` pixels per local unit (30 x 16 box): 2 near side, 1 a far leg only. */
function shapeMask(shapes, pxu, flip) {
  const w = Math.ceil(30 * pxu), h = Math.ceil(16 * pxu);
  const mask = new Uint8Array((w + 2) * (h + 2));
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      let lx = (i + 0.5) / pxu;
      if (flip) lx = 30 - lx;
      const ly = (j + 0.5) / pxu;
      let v = 0;
      for (const sh of shapes) {
        if (!inShape(sh, lx, ly)) continue;
        v = sh[6] === 'far' ? Math.max(v, 1) : 2;
        if (v === 2) break;
      }
      mask[(j + 1) * (w + 2) + (i + 1)] = v;
    }
  }
  return { w, h, at: (i, j) => mask[(j + 1) * (w + 2) + (i + 1)] };
}

/**
 * An edge-lit glass panel on four standoffs with the animal etched in it: the glass dark, its edges catching
 * the light, the LED in its foot green (the programme's colour); the etching frosted (a slate and steel
 * checker) with a fog outline where the light catches its edge; the name etched under it.
 */
function etchedPanel(fr, cam, X, Y, shapes, flip, name, soft) {
  const k = kAt(cam, SET.wallZ);
  const PW = 72, PH = 56;
  const x0 = Math.round(sxOf(cam, k, X - PW / 2)), x1 = Math.round(sxOf(cam, k, X + PW / 2));
  const y0 = Math.round(syOf(cam, k, Y - PH / 2)), y1 = Math.round(syOf(cam, k, Y + PH / 2));
  if (x1 <= 0 || x0 >= W || y1 <= 0 || y0 >= H) return;
  const px = fr.px;
  const set = (x, y, c) => {
    if (x >= 0 && x < W && y >= 0 && y < H) px[y * W + x] = c;
  };
  // its shadow on the wall (offset down-right: the panel stands off the wall), the glass, its edges
  const sh = Math.max(1, Math.round(1.6 * k));
  fr.span(x0 + sh, y0 + sh, x1 + sh, y1 + sh, C.black);
  fr.span(x0, y0, x1, y1, soft ? C.black : C.ink);
  if (soft) return;
  fr.span(x0, y0, x1, y0 + 1, C.slate); // the top edge
  fr.span(x0, y0, x0 + 1, y1, C.slate); // the left edge, toward the light
  fr.span(x1 - 1, y0, x1, y1, C.black);
  fr.span(x0, y1 - 1, x1, y1, C.green); // the LED in the foot
  fr.span(x0 + 1, y1 - 2, x1 - 1, y1 - 1, C.darkGreen); // its light just above it in the glass
  // a faint sheen across the glass: one diagonal stroke, slate on ink
  for (let y = y0 + 2; y < y1 - 3; y++) {
    const x = x0 + 3 + Math.round((y1 - y) * 0.9);
    if (x > x0 + 1 && x < x1 - 2 && (y & 1) === 0) set(x, y, C.slate);
  }
  // standoffs at the corners
  const inset = Math.max(2, Math.round(3 * k));
  for (const [sx, sy] of [[x0 + inset, y0 + inset], [x1 - 1 - inset, y0 + inset], [x0 + inset, y1 - 2 - inset], [x1 - 1 - inset, y1 - 2 - inset]]) set(sx, sy, C.fog);
  // the etching
  const pxu = 1.95 * k;
  const m = shapeMask(shapes, pxu, flip);
  const ex = Math.round(sxOf(cam, k, X) - m.w / 2), ey = Math.round(syOf(cam, k, Y - 6) - m.h / 2);
  for (let j = 0; j < m.h; j++) {
    for (let i = 0; i < m.w; i++) {
      const v = m.at(i, j);
      if (!v) continue;
      const edge = !m.at(i - 1, j) || !m.at(i + 1, j) || !m.at(i, j - 1) || !m.at(i, j + 1);
      const x = ex + i, y = ey + j;
      let c;
      if (edge) c = v === 2 ? C.fog : C.steel;
      else c = v === 2 ? (((x + y) & 1) ? C.steel : C.slate) : C.slate;
      set(x, y, c);
    }
  }
  for (const s0 of shapes) {
    if (s0[0] !== 'x') continue;
    const i = Math.floor((flip ? 30 - s0[1] : s0[1]) * pxu), j = Math.floor(s0[2] * pxu);
    if (m.at(i, j)) set(ex + i, ey + j, C.ink);
  }
  // the name, etched small under the animal
  const g = textPixels(name, 'micro');
  const s = Math.max(1, Math.round(k * 1.25));
  const tx = Math.round(sxOf(cam, k, X) - (g.width * s) / 2), ty = y1 - 3 - 6 * s;
  for (const [gx, gy] of g.pixels) for (let jj = 0; jj < s; jj++) for (let ii = 0; ii < s; ii++) set(tx + gx * s + ii, ty + gy * s + jj, C.steel);
}

// the slat wall along the foot: vertical wood slats with shadow gaps, washed from a light hidden in the
// rail on top (the slats' tops lit, falling off down the wall); out of focus the wood keeps its own value
// (brown, a step over the jackets' maroon: Penny stays clear of it)
const SLATS = { top: -16, foot: 30 };
function slatWall(fr, cam, soft) {
  const k = kAt(cam, SET.wallZ);
  const yr = Math.round(syOf(cam, k, SLATS.top)), yf = Math.min(H, Math.round(syOf(cam, k, SLATS.foot)));
  if (yr >= H || yf <= 0) return;
  const px = fr.px;
  // the rail: a black shadow line over the slats
  const rail = Math.max(2, Math.round(2.4 * k));
  fr.span(0, yr - rail, W, yr, C.black);
  // the slats on a whole-pixel rhythm anchored on the wall (they step with the camera, never alias):
  // slats `pitch - 1` px wide, 1 px shadow gaps; the light from the rail: a tan lip, tanShade fading to
  // brown down the wall (dark wood: the faces and hands stay the warmest, lightest things on the set)
  const pitch = Math.max(4, Math.round(5 * k));
  const ox = Math.round(sxOf(cam, k, 0));
  const wash = Math.max(4, Math.round(12 * k));
  for (let y = Math.max(0, yr); y < yf; y++) {
    const d = y - yr;
    for (let x = 0; x < W; x++) {
      const gap = ((((x - ox) % pitch) + pitch) % pitch) === pitch - 1;
      let c;
      if (soft) c = gap ? (d < wash * 0.5 ? C.brown : C.maroon) : d < wash * 0.5 ? C.tanShade : C.brown;
      else if (gap) c = C.maroon;
      else if (d === 0) c = C.tan;
      else if (d < wash * 0.4) c = C.tanShade;
      else if (d < wash) c = (d - wash * 0.4) / (wash * 0.6) > bayer(x, y) ? C.brown : C.tanShade;
      else c = C.brown;
      px[y * W + x] = c;
    }
  }
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
  fr.span(x0, y0 + bh, x1, y0 + bh + 1, C.darkGreen); // the band's LED edge: the programme's green
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
  slatWall(fr, cam, soft);
  etchedPanel(fr, cam, -190, -80, BULL, false, 'BULL', soft); // the bull faces right, toward the screen
  etchedPanel(fr, cam, 190, -80, BEAR, true, 'BEAR', soft); // the bear faces left
  ticker(fr, cam, soft);
}

// --------------------------------------------------------------------------- NEWS IN 60: the flash studio
// The minute, as a broadcast studio clock on the left: a black face in a bevelled ring, sixty second-LEDs
// round it (the first quarter lit yellow, the rest unlit slate), twelve hour marks inside, "60" at its
// heart. On the right, the rundown board: RUNDOWN in yellow, five numbered rows of the bulletin's beats, the
// one on air marked with a yellow bar. Both sit beside the wall, clear of Sam in every framing (a close shot
// never cuts them), and the room's yellow stays under the bible's 1.5 %.
function studioClock(fr, cam, X, Y, soft) {
  const k = kAt(cam, SET.wallZ);
  // centred on a pixel corner, radii in whole pixels: the circles come out symmetric and even
  const cx = Math.round(sxOf(cam, k, X)), cy = Math.round(syOf(cam, k, Y));
  const R = Math.round(34 * k); // the LED ring's radius in pixels
  const px = fr.px;
  const set = (x, y, c) => {
    if (x >= 0 && x < W && y >= 0 && y < H) px[y * W + x] = c;
  };
  // the housing: an ink ring with a slate bevel lit from the top-left, the black face inside
  const RI = R + Math.max(2, Math.round(2 * k)), RO = RI + Math.max(2, Math.round(2.4 * k));
  for (let y = Math.floor(cy - RO - 1); y <= Math.ceil(cy + RO + 1); y++) {
    for (let x = Math.floor(cx - RO - 1); x <= Math.ceil(cx + RO + 1); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
      if (d > RO) continue;
      let c = C.black;
      if (d > RI) c = soft ? C.ink : (dx + dy) / d < -0.5 ? C.slate : C.ink;
      set(x, y, c);
    }
  }
  if (soft) return;
  // sixty second-LEDs, the first quarter lit (12 o'clock clockwise); a dot each, 2x2 when the zoom allows
  const ds = Math.max(1, Math.round(1.4 * k));
  for (let i = 0; i < 60; i++) {
    const a = -Math.PI / 2 + (i / 60) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * R - ds / 2), y = Math.round(cy + Math.sin(a) * R - ds / 2);
    const c = i < 15 ? C.yellow : C.slate;
    for (let j = 0; j < ds; j++) for (let q = 0; q < ds; q++) set(x + q, y + j, c);
  }
  // twelve hour marks inside (steel, the four quarters fog)
  for (let h = 0; h < 12; h++) {
    const a = -Math.PI / 2 + (h / 12) * Math.PI * 2;
    const r0 = R - 5 * k, r1 = R - (h % 3 === 0 ? 10 : 8) * k;
    const n = Math.max(1, Math.round(r0 - r1));
    for (let t = 0; t <= n; t++) {
      const r = r0 + ((r1 - r0) * t) / n;
      set(Math.round(cx + Math.cos(a) * r - 0.5), Math.round(cy + Math.sin(a) * r - 0.5), h % 3 === 0 ? C.fog : C.steel);
    }
  }
  // "60" at the heart, body type at whole-pixel scale
  const g = textPixels('60', 'body');
  const s = Math.max(1, Math.round(k * 1.25));
  const tx = Math.round(cx - (g.width * s) / 2), ty = Math.round(cy - (g.cap * s) / 2);
  for (const [gx, gy] of g.pixels) for (let j = 0; j < s; j++) for (let q = 0; q < s; q++) set(tx + gx * s + q, ty + gy * s + j, C.fog);
}

const RUNDOWN = ['WORLD', 'POLITICS', 'BUSINESS', 'SCIENCE', 'SPORT'];
function rundownBoard(fr, cam, X0, Y0, X1, Y1, soft) {
  const k = kAt(cam, SET.wallZ);
  // the board: black with an ink frame, its top edge lit
  rectW(fr, cam, X0 - 2.5, Y0 - 2.5, X1 + 2.5, Y1 + 2.5, C.ink);
  if (!soft) rectW(fr, cam, X0 - 2.5, Y0 - 2.5, X1 + 2.5, Y0 - 1.3, C.slate);
  rectW(fr, cam, X0, Y0, X1, Y1, C.black);
  if (soft) return;
  const s = Math.max(1, Math.round(k * 1.25));
  const px = fr.px;
  const text = (str, x, y, c) => {
    const g = textPixels(str, 'micro');
    for (const [gx, gy] of g.pixels) for (let j = 0; j < s; j++) for (let q = 0; q < s; q++) {
      const X = x + gx * s + q, Y = y + gy * s + j;
      if (X >= 0 && X < W && Y >= 0 && Y < H) px[Y * W + X] = c;
    }
    return g.width * s;
  };
  const bx0 = Math.round(sxOf(cam, k, X0)), by0 = Math.round(syOf(cam, k, Y0));
  const bx1 = Math.round(sxOf(cam, k, X1)), by1 = Math.round(syOf(cam, k, Y1));
  const pad = 3 * s;
  // the header and its rule
  text('RUNDOWN', bx0 + pad, by0 + pad, C.yellow);
  const ry = by0 + pad + 5 * s + 2 * s;
  fr.span(bx0 + pad, ry, bx1 - pad, ry + 1, C.slate);
  // the rows
  const rowH = Math.max(7 * s, Math.floor((by1 - ry - pad) / RUNDOWN.length));
  RUNDOWN.forEach((name, i) => {
    const y = ry + 3 * s + i * rowH;
    if (y + 5 * s > by1 - 1) return;
    const live = i === 0;
    if (live) fr.span(bx0 + pad - 2 * s, y - s, bx0 + pad - s, y + 6 * s, C.yellow);
    const nx = bx0 + pad + text(`0${i + 1}`, bx0 + pad, y, live ? C.fog : C.steel) + 3 * s;
    text(name, nx, y, live ? C.silver : C.steel);
  });
}

function news60(fr, cam, style, soft) {
  // the cove in orange, the yellow's warm neighbour (news-60.md allows orange up to 8 %; the yellow stays
  // under its 1.5 % for the clock's lit quarter, the rundown and the desk), and a ribbon either side of the
  // anchor's bay: the light lines frame the screen and Sam, the clock and the rundown hang outside them
  cove(fr, cam, C.orange, C.brown, { soft });
  ribbon(fr, cam, -128, -128, 30, C.orange, soft);
  ribbon(fr, cam, 128, -128, 30, C.orange, soft);
  studioClock(fr, cam, -186, -72, soft);
  rundownBoard(fr, cam, 146, -112, 224, -34, soft);
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
  'world-now': { hi: 'ink', lo: 'black', pattern: 'slits', slit: 'red' }, // the home desk, red LED slits in its seams
  'tech-bytes': { hi: 'slate', lo: 'black', pattern: 'slits', slit: 'blue' }, // the steel plinth, blue slits
  cosmos: { hi: 'ink', lo: 'black', pattern: 'stars', slit: 'magenta' },
  'money-minute': { hi: 'brown', lo: 'black', pattern: 'grain', top: 'tanShade' }, // the lower panel black (graphics zone); no LED slits (lime on wood reads as neon)
  'news-60': { hi: 'ink', lo: 'black', pattern: 'stripe', stripe: 'yellow', slit: 'orange' },
};
