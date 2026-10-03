// Set dressing: each programme's own studio (owner, 3 Oct: "haz una ronda de pulida para decorar los platós y
// dejarlos bien; ahora mismo todos tienen los mismos"). The architecture stays the network's (the wall, the
// hero screen, the desk and its red plate); what changes is what hangs on the wall around the screen and
// beside the presenters, and the desk's front:
//   WORLD NOW     a newsroom by night: two tall windows on a city skyline (lit windows, a red beacon), the
//                 world's clocks over them, a red line at their sill
//   TECH BYTES    a product lab after hours: hexagonal acoustic panels with cyan circuit traces and nodes,
//                 floating shelves with gadgets (a robot, a drone, a headset, a controller, a phone)
//   COSMOS DESK   an observatory: a starfield on the dark wall with a purple nebula, two portholes (the
//                 Moon, a ringed planet), an orbit arc over the screen
//   MONEY MINUTE  a bank's trading room: wood panelling, two market boards (rows of green and red figures),
//                 a candlestick chart, the bronze sconces of the style
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

// --------------------------------------------------------------------------- WORLD NOW: windows on the city
const SKY = { X0: 158, X1: 298, Y0: -112, Y1: -8 }; // each side (mirrored)
function cityWindow(fr, cam, sx, soft) {
  const X0 = sx > 0 ? SKY.X0 : -SKY.X1, X1 = sx > 0 ? SKY.X1 : -SKY.X0;
  const k = kAt(cam, SET.wallZ);
  // the night sky: navy over ink (Bayer between), dark enough to sit under the faces
  const x0 = Math.round(sxOf(cam, k, X0)), x1 = Math.round(sxOf(cam, k, X1));
  const y0 = Math.round(syOf(cam, k, SKY.Y0)), y1 = Math.round(syOf(cam, k, SKY.Y1));
  for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) {
    const u = (y - y0) / Math.max(1, y1 - y0);
    const lvl = 1 - Math.min(1, u * 1.35); // navy up top, ink lower
    for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) fr.px[y * W + x] = lvl * 0.7 > bayer(x, y) ? C.navy : C.ink;
  }
  // the skyline: buildings in black and ink, lit windows (sparse, cream and yellow), a red beacon on the tallest
  const r = rng(sx > 0 ? 7 : 11);
  let X = X0;
  let tallest = { h: 0, X: 0 };
  while (X < X1) {
    const w = 10 + Math.floor(r() * 18);
    const h = 18 + Math.floor(r() * 62);
    const Xa = X, Xb = Math.min(X1, X + w);
    const top = SKY.Y1 - h;
    const shade = r() < 0.5 ? C.black : C.ink;
    rectW(fr, cam, Xa, top, Xb, SKY.Y1, shade);
    // a lit left edge on some (the city's own glow)
    if (!soft && shade === C.ink) rectW(fr, cam, Xa, top, Xa + 1.2, SKY.Y1, C.slate);
    if (h > tallest.h) tallest = { h, X: (Xa + Xb) / 2, top };
    // windows: a grid with most of them dark
    if (!soft) {
      for (let wy = top + 4; wy < SKY.Y1 - 3; wy += 5) {
        for (let wx = Xa + 2.5; wx < Xb - 2; wx += 4.5) {
          const v = r();
          if (v < 0.16) dotW(fr, cam, wx, wy, v < 0.05 ? C.yellow : C.cream, 1.3);
          else if (v < 0.24) dotW(fr, cam, wx, wy, C.steel, 1.3);
        }
      }
    }
    X = Xb + (r() < 0.3 ? 2 : 0);
  }
  if (!soft && tallest.h) {
    rectW(fr, cam, tallest.X - 0.6, tallest.top - 9, tallest.X + 0.6, tallest.top, C.ink);
    dotW(fr, cam, tallest.X, tallest.top - 10, C.red, 2);
  }
  // the window frame: black mullions, a slate frame lit from the left, a red sill line (the network's red)
  rectW(fr, cam, X0 - 3, SKY.Y0 - 3, X1 + 3, SKY.Y0, C.black);
  rectW(fr, cam, X0 - 3, SKY.Y0, X0, SKY.Y1, C.black);
  rectW(fr, cam, X1, SKY.Y0, X1 + 3, SKY.Y1, C.black);
  const mid = (X0 + X1) / 2;
  rectW(fr, cam, mid - 1.5, SKY.Y0, mid + 1.5, SKY.Y1, C.black);
  rectW(fr, cam, X0, (SKY.Y0 + SKY.Y1) / 2 - 1, X1, (SKY.Y0 + SKY.Y1) / 2 + 1, C.black);
  if (!soft) {
    rectW(fr, cam, X0 - 3, SKY.Y0 - 3, X0 - 2, SKY.Y1, C.slate);
    rectW(fr, cam, X0 - 3, SKY.Y0 - 3, X1 + 3, SKY.Y0 - 2, C.slate);
  }
  rectW(fr, cam, X0 - 4, SKY.Y1, X1 + 4, SKY.Y1 + 3, C.black);
  rectW(fr, cam, X0 - 4, SKY.Y1, X1 + 4, SKY.Y1 + 1, soft ? C.darkRed : C.red);
}

/** A small round clock face (hands at the city's hour, static), its label underneath. */
function clockW(fr, cam, X, Y, hour, soft) {
  discW(fr, cam, X, Y, 6.5, (dx, dy, d) => (d > 0.72 ? C.slate : C.ink));
  if (soft) return;
  const a = ((hour % 12) / 12) * Math.PI * 2;
  lineW(fr, cam, X, Y, X + Math.sin(a) * 3.2, Y - Math.cos(a) * 3.2, C.fog);
  lineW(fr, cam, X, Y, X, Y - 4.6, C.steel);
  dotW(fr, cam, X, Y, C.red, 1);
}

function worldNow(fr, cam, style, soft) {
  cityWindow(fr, cam, -1, soft);
  cityWindow(fr, cam, 1, soft);
  // the world's clocks over the windows (New York, London | Tokyo, Sydney): static hands
  const hrs = [[-268, 7], [-188, 12], [188, 20], [268, 22]];
  for (const [X, h] of hrs) clockW(fr, cam, X, -122, h, soft);
}

// --------------------------------------------------------------------------- TECH BYTES: lab panels and shelves
function hexPanel(fr, cam, sx, soft) {
  const X0 = sx > 0 ? 150 : -310, X1 = sx > 0 ? 310 : -150;
  const Y0 = -118, Y1 = -2;
  const rad = 9, hx = rad * 1.5, hy = rad * Math.sqrt(3);
  // hexagon outlines (slate on the wall) on a staggered grid
  for (let i = 0, X = X0 + rad; X < X1 - rad * 0.6; i++, X += hx) {
    for (let Y = Y0 + rad + (i & 1 ? hy / 2 : 0); Y < Y1 - rad * 0.6; Y += hy) {
      for (let a = 0; a < 6; a++) {
        const a0 = (a * Math.PI) / 3, a1 = ((a + 1) * Math.PI) / 3;
        lineW(fr, cam, X + Math.cos(a0) * rad, Y + Math.sin(a0) * rad, X + Math.cos(a1) * rad, Y + Math.sin(a1) * rad, soft ? C.ink : C.slate);
      }
    }
  }
  if (soft) return;
  // circuit traces: right-angled runs in blue ending on cyan nodes (a few, static)
  const r = rng(sx > 0 ? 23 : 29);
  for (let n = 0; n < 7; n++) {
    let X = X0 + 8 + r() * (X1 - X0 - 16), Y = Y0 + 10 + r() * (Y1 - Y0 - 24);
    const steps = 2 + Math.floor(r() * 3);
    for (let s = 0; s < steps; s++) {
      const horiz = s % 2 === 0;
      const len = (r() < 0.5 ? -1 : 1) * (10 + r() * 26);
      const X2 = horiz ? Math.max(X0 + 4, Math.min(X1 - 4, X + len)) : X, Y2 = horiz ? Y : Math.max(Y0 + 4, Math.min(Y1 - 6, Y + len));
      lineW(fr, cam, X, Y, X2, Y2, C.blue);
      X = X2;
      Y = Y2;
    }
    dotW(fr, cam, X, Y, C.cyan, 2.4);
  }
}

// gadget sprites, one character per world unit at 2.4 units per cell: k black, s slate, t steel, f fog, w white,
// c cyan, r red, y yellow, b blue
const GADGETS = {
  robot: ['..ttt..', '.tfwft.', '.tcfct.', '..ttt..', '.sttts.', 'st.t.ts', '.t...t.'],
  drone: ['t.....t', 'fff.fff', '..sts..', '.stcts.', '..s.s..'],
  headset: ['.sssss.', 'stttttts', 'tbbcbbt', 'tbbbbbt', '.sssss.'],
  pad: ['.sssss.', 'sttfttts', 'stsytrts', '.sssss.'],
  phone: ['.kkk.', '.kck.', '.kbk.', '.kbk.', '.kkk.', 'sssss'],
};
const GC = { k: 'black', s: 'slate', t: 'steel', f: 'fog', w: 'white', c: 'cyan', r: 'red', y: 'yellow', b: 'blue' };
function sprite(fr, cam, rows, X, Ybottom, cell, soft) {
  const h = rows.length;
  for (let j = 0; j < h; j++) {
    const row = rows[j];
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '.') continue;
      const c = soft ? (ch === 'c' || ch === 'w' || ch === 'f' ? C.steel : C.slate) : C[GC[ch]];
      rectW(fr, cam, X + i * cell, Ybottom - (h - j) * cell, X + (i + 1) * cell, Ybottom - (h - j - 1) * cell, c);
    }
  }
}
function shelves(fr, cam, sx, soft) {
  const Xs = sx > 0 ? [196, 262] : [-262, -196];
  const rows = [-64, -18];
  const sets = sx > 0 ? [['robot', 'pad'], ['drone', 'phone']] : [['headset', 'phone'], ['pad', 'robot']];
  rows.forEach((Y, ri) => {
    const X0 = Math.min(...Xs) - 22, X1 = Math.max(...Xs) + 22;
    // the shelf: a steel edge lit on top, its shadow under it
    rectW(fr, cam, X0, Y, X1, Y + 2.5, soft ? C.slate : C.steel);
    if (!soft) rectW(fr, cam, X0, Y, X1, Y + 0.8, C.fog);
    rectW(fr, cam, X0 + 2, Y + 2.5, X1 - 2, Y + 5, C.black);
    sets[ri].forEach((g, gi) => sprite(fr, cam, GADGETS[g], Xs[gi] - 8, Y, 2.4, soft));
  });
}
function techBytes(fr, cam, style, soft) {
  hexPanel(fr, cam, -1, soft);
  hexPanel(fr, cam, 1, soft);
  shelves(fr, cam, -1, soft);
  shelves(fr, cam, 1, soft);
}

// --------------------------------------------------------------------------- COSMOS: observatory
function starfield(fr, cam, soft) {
  const r = rng(41);
  for (let n = 0; n < 260; n++) {
    const sx = r() < 0.5 ? -1 : 1;
    const X = sx * (146 + r() * 190), Y = -126 + r() * 122;
    const v = r();
    if (soft && v < 0.7) continue;
    dotW(fr, cam, X, Y, v > 0.94 ? C.white : v > 0.75 ? C.silver : v > 0.4 ? C.fog : C.steel, v > 0.97 ? 1.6 : 1);
  }
}
function nebula(fr, cam, sx, soft) {
  // a wisp: purple dithered over the wall's ink, its heart magenta (sparse)
  const k = kAt(cam, SET.wallZ);
  const cx = sxOf(cam, k, sx * 250), cy = syOf(cam, k, -88);
  const rx = 62 * k, ry = 26 * k;
  for (let y = Math.max(0, Math.floor(cy - ry)); y < Math.min(H, Math.ceil(cy + ry)); y++) {
    for (let x = Math.max(0, Math.floor(cx - rx)); x < Math.min(W, Math.ceil(cx + rx)); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      const tilt = dy + dx * 0.45 * sx;
      const d = dx * dx + tilt * tilt * 1.6;
      if (d >= 1) continue;
      const v = (1 - d) * (soft ? 0.35 : 0.6);
      if (v > bayer(x, y) + 0.12) fr.px[y * W + x] = v > 0.5 && !soft && bayer(x + 1, y) < 0.3 ? C.magenta : C.purple;
    }
  }
}
function porthole(fr, cam, X, Y, body, soft) {
  const R = 30;
  // the brass-and-steel rim, its bolts, the glass with what it shows
  discW(fr, cam, X, Y, R + 4, (dx, dy, d) => (d > 0.86 ? (dx + dy < -0.3 ? C.fog : C.steel) : 0));
  discW(fr, cam, X, Y, R, () => C.black);
  if (!soft) for (let a = 0; a < 8; a++) dotW(fr, cam, X + Math.cos((a * Math.PI) / 4) * (R + 2), Y + Math.sin((a * Math.PI) / 4) * (R + 2), C.slate, 1.4);
  const r = rng(Math.round(X));
  for (let n = 0; n < 20; n++) {
    const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * (R - 2);
    dotW(fr, cam, X + Math.cos(a) * rr, Y + Math.sin(a) * rr, r() > 0.7 ? C.silver : C.steel, 1);
  }
  if (body === 'moon') {
    // a crescent Moon, lit from the left, a crater or two
    discW(fr, cam, X - 4, Y - 2, 13, (dx, dy, d) => {
      const lit = (dx + 0.55) * (dx + 0.55) + dy * dy > 0.75 ? 0 : 1;
      if (!lit) return 0;
      return d > 0.8 ? C.fog : (dx + 0.2) * (dx + 0.2) + (dy - 0.3) * (dy - 0.3) < 0.04 ? C.fog : C.silver;
    });
  } else {
    // a ringed planet: the ring behind, the body, the ring in front
    const tilt = 0.32;
    for (let a = 0; a < 64; a++) {
      const t = (a / 64) * Math.PI * 2;
      if (Math.sin(t) > 0) continue;
      dotW(fr, cam, X + Math.cos(t) * 20, Y + Math.sin(t) * 20 * tilt, C.tan, 1);
    }
    discW(fr, cam, X, Y, 11, (dx, dy, d) => {
      const band = Math.floor((dy + 1) * 3.5) % 2;
      const shade = dx + dy * 0.4 > 0.35;
      return shade ? (band ? C.brown : C.tanShade) : band ? C.tan : C.cream;
    });
    for (let a = 0; a < 64; a++) {
      const t = (a / 64) * Math.PI * 2;
      if (Math.sin(t) <= 0) continue;
      dotW(fr, cam, X + Math.cos(t) * 20, Y + Math.sin(t) * 20 * tilt, C.cream, 1);
    }
  }
}
function cosmos(fr, cam, style, soft) {
  starfield(fr, cam, soft);
  nebula(fr, cam, -1, soft);
  nebula(fr, cam, 1, soft);
  porthole(fr, cam, -212, -62, 'moon', soft);
  porthole(fr, cam, 212, -62, 'planet', soft);
  if (!soft) {
    // an orbit arc over the screen with a small body on it
    for (let a = 0; a <= 48; a++) {
      const t = Math.PI + (a / 48) * Math.PI;
      dotW(fr, cam, Math.cos(t) * 118, -102 + Math.sin(t) * 18, a % 2 ? C.purple : C.slate, 1);
    }
    dotW(fr, cam, Math.cos(Math.PI * 1.72) * 118, -102 + Math.sin(Math.PI * 1.72) * 18, C.magenta, 2.2);
  }
}

// --------------------------------------------------------------------------- MONEY MINUTE: trading room
function wainscot(fr, cam, soft) {
  // a dark wood dado across the lower wall (beside and behind the desk): brown panels, a tan rail on top,
  // tanShade grooves between panels, maroon shadow under the rail
  const Y0 = -46, Y1 = 4;
  rectW(fr, cam, -340, Y0, 340, Y1, soft ? C.maroon : C.brown);
  rectW(fr, cam, -340, Y0 - 3, 340, Y0, soft ? C.brown : C.tan);
  rectW(fr, cam, -340, Y0, 340, Y0 + 1.6, C.maroon);
  if (soft) return;
  for (let X = -330; X <= 330; X += 44) {
    rectW(fr, cam, X, Y0 + 6, X + 1.2, Y1, C.maroon);
    rectW(fr, cam, X + 5, Y0 + 7, X + 39, Y0 + 8.2, C.tanShade);
  }
}
const GLYPH = { // 3x5 digits and a few letters for the boards (one cell = 1.3 units)
  0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '011', '001', '111'], 4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'], 8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'], '.': ['000', '000', '000', '000', '010'], '+': ['000', '010', '111', '010', '000'],
  '-': ['000', '000', '111', '000', '000'], ' ': ['000', '000', '000', '000', '000'],
};
function textW(fr, cam, s, X, Y, c, cell = 1.3) {
  let x = X;
  for (const ch of s) {
    const g = GLYPH[ch] || GLYPH[' '];
    for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j][i] === '1') rectW(fr, cam, x + i * cell, Y + j * cell, x + (i + 1) * cell, Y + (j + 1) * cell, c);
    x += cell * 4;
  }
}
function marketBoard(fr, cam, sx, soft) {
  const X0 = sx > 0 ? 160 : -300, X1 = sx > 0 ? 300 : -160;
  const Y0 = -112, Y1 = -54;
  rectW(fr, cam, X0 - 3, Y0 - 3, X1 + 3, Y1 + 3, C.slate);
  rectW(fr, cam, X0, Y0, X1, Y1, C.black);
  if (soft) return;
  const r = rng(sx > 0 ? 53 : 59);
  const k = kAt(cam, SET.wallZ);
  // rows of figures: a name block (steel bars), the price, the change (green up, red down)
  for (let Y = Y0 + 4, row = 0; Y < Y1 - 7; Y += 9, row++) {
    const up = r() < 0.6;
    rectW(fr, cam, X0 + 4, Y + 1, X0 + 4 + 10 + r() * 8, Y + 5, C.steel);
    const price = (20 + r() * 900).toFixed(1);
    if (k >= 0.62) {
      textW(fr, cam, price, X0 + 34, Y, C.fog);
      textW(fr, cam, `${up ? '+' : '-'}${(r() * 3).toFixed(1)}`, X0 + 82, Y, up ? C.green : C.red);
    } else {
      rectW(fr, cam, X0 + 34, Y + 1, X0 + 60, Y + 5, C.steel);
      rectW(fr, cam, X0 + 82, Y + 1, X0 + 100, Y + 5, up ? C.green : C.red);
    }
    // a little arrow at the end
    dotW(fr, cam, X1 - 8, Y + 3, up ? C.green : C.red, 2.4);
  }
}
function candles(fr, cam, X0, X1, Y0, Y1, soft) {
  rectW(fr, cam, X0 - 2, Y0 - 2, X1 + 2, Y1 + 2, C.slate);
  rectW(fr, cam, X0, Y0, X1, Y1, C.black);
  if (soft) return;
  const r = rng(Math.round(X0));
  let v = (Y0 + Y1) / 2;
  const n = Math.floor((X1 - X0 - 6) / 7);
  for (let i = 0; i < n; i++) {
    const X = X0 + 4 + i * 7;
    const d = (r() - 0.45) * 9;
    const a = v, b = Math.max(Y0 + 4, Math.min(Y1 - 4, v - d));
    const up = b < a;
    const hi = Math.min(a, b) - 1 - r() * 3, lo = Math.max(a, b) + 1 + r() * 3;
    rectW(fr, cam, X + 1.6, hi, X + 2.4, lo, up ? C.darkGreen : C.darkRed);
    rectW(fr, cam, X, Math.min(a, b), X + 4, Math.max(a, b) + 0.8, up ? C.green : C.red);
    v = b;
  }
}
function moneyMinute(fr, cam, style, soft) {
  wainscot(fr, cam, soft);
  marketBoard(fr, cam, -1, soft);
  marketBoard(fr, cam, 1, soft);
  candles(fr, cam, -300, -160, -44 + 0, -4, soft); // (in front of the panelling: two framed chart screens)
  candles(fr, cam, 160, 300, -44, -4, soft);
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
  cosmos: { hi: 'purple', lo: 'black', pattern: 'stars' },
  'money-minute': { hi: 'brown', lo: 'black', pattern: 'grain', top: 'tanShade' }, // the lower panel black (graphics zone)
  'news-60': { hi: 'ink', lo: 'black', pattern: 'stripe', stripe: 'yellow' },
};
