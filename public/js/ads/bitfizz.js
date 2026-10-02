// BITFIZZ COLA — a grey office worker cracks a can and his world gets its
// palette back. Brand colours: cola red, fizz yellow, white. "Taste every bit."
import {
  P, W, H, BASE_PAL, R, A, rrect, disc, oval, ring, poly, dither, bands, sparkle, twinkle, particles, shadow,
  sunburst, cached, text, bigText, finePrint, slogan, play, hero, faceCU, wordmark, drawMark, glint, glow, urlPill,
  prog, lerp, easeOut, easeOutBack, wave, shake, clipCircle, clipRect, starPts, cloud, mulberry32, rep, tune,
} from './kit.js';

// Every palette colour's grey twin (by brightness) for the "monochrome" world.
const GREY = {
  [P.black]: P.black, [P.ink]: P.ink, [P.slate]: P.slate, [P.steel]: P.steel, [P.fog]: P.fog, [P.silver]: P.silver, [P.white]: P.white,
  [P.red]: P.steel, [P.darkRed]: P.slate, [P.maroon]: P.ink, [P.rust]: P.steel, [P.orange]: P.fog, [P.yellow]: P.silver,
  [P.cream]: P.silver, [P.skin]: P.silver, [P.skinShade]: P.fog, [P.tan]: P.fog, [P.tanShade]: P.steel, [P.brown]: P.slate,
  [P.green]: P.fog, [P.darkGreen]: P.slate, [P.cyan]: P.silver, [P.blue]: P.steel, [P.navy]: P.slate, [P.pink]: P.fog,
  [P.magenta]: P.steel, [P.purple]: P.slate,
};
const greyOf = (pal) => Object.fromEntries(Object.entries({ ...BASE_PAL, ...pal }).map(([k, v]) => [k, GREY[v] || v]));

const GUY = { S: P.skin, s: P.skinShade, H: P.brown, h: P.tan, E: P.maroon, T: P.white, t: P.silver, C: P.white, X: P.red, b: P.ink, P: P.navy, p: P.ink };
const GUY_GREY = greyOf(GUY);
const GX = 180;
const GGY = 138;
const BIT_COLS = [P.red, P.orange, P.yellow, P.green, P.cyan, P.blue, P.magenta, P.pink];

// --- brand -------------------------------------------------------------------

const MARK = () => wordmark('BITFIZZ', {
  h: 32, pen: 4, slant: 0.16, wide: 0.95, gap: 1,
  fill: [P.pink, P.red, P.red, P.darkRed], hi: P.white,
  outline: [[P.white, 2], [P.black, 2]], depth: 4, depthColor: P.maroon,
  wave: (i) => [0, -2, 1, -1, 2, 0, -2][i % 7],
  deco: (c, info) => {
    // fizz bubbles inside the letters
    const rand = mulberry32(11);
    for (const l of info.letters) {
      for (let k = 0; k < 2; k++) {
        const p = l.pts[Math.floor(rand() * l.pts.length)];
        c.fillStyle = P.white;
        c.fillRect(p[0] + info.pad, p[1] + info.pad, 2, 2);
      }
    }
  },
});
const SUB = () => wordmark('COLA', { h: 16, pen: 2, wide: 1.1, gap: 3, fill: [P.yellow, P.orange], outline: [[P.black, 2]], depth: 2, depthColor: P.rust });

// --- static art --------------------------------------------------------------

const OW = W + 24; // office art is wider than the screen so the camera can drift

function paintOffice(c, grey) {
  const g = (x) => (grey ? GREY[x] : x);
  R(c, 0, 0, OW, 142, g(P.cream));
  dither(c, 0, 0, OW, 142, g(P.yellow), 'dots');
  R(c, 0, 140, OW, 5, g(P.brown));
  R(c, 0, 140, OW, 1, g(P.tan));
  R(c, 0, 145, OW, 27, g(P.tan));
  for (let x = 6; x < OW; x += 30) {
    R(c, x, 149, 22, 18, g(P.tanShade));
    R(c, x + 1, 150, 20, 16, g(P.tan));
    R(c, x + 1, 166, 20, 1, g(P.cream));
  }
  R(c, 0, 170, OW, 5, g(P.brown));
  R(c, 0, 175, OW, 41, g(P.tanShade));
  for (let y = 184, k = 0; y < H; y += 11, k++) {
    R(c, 0, y, OW, 1, g(P.brown));
    for (let x = (k % 2) * 37; x < OW; x += 74) R(c, x, y + 1, 1, 10, g(P.brown));
  }
  // window frame (the view is drawn live for parallax)
  R(c, 29, 21, 94, 87, P.black);
  R(c, 30, 22, 92, 85, g(P.white));
  c.clearRect(34, 26, 84, 77);
  R(c, 25, 107, 102, 1, P.black);
  R(c, 25, 108, 102, 4, g(P.white));
  R(c, 25, 112, 102, 1, g(P.fog));
  // framed picture
  R(c, 129, 31, 40, 32, P.black);
  R(c, 130, 32, 38, 30, g(P.brown));
  R(c, 133, 35, 32, 24, g(P.cyan));
  poly(c, [[133, 59], [144, 41], [151, 50], [157, 44], [165, 59]], g(P.darkGreen));
  poly(c, [[141, 46], [144, 41], [147, 46]], g(P.white));
  disc(c, 160, 40, 3, g(P.yellow));
  // clock
  disc(c, 348, 46, 14, P.black);
  disc(c, 348, 46, 13, g(P.red));
  disc(c, 348, 46, 11, g(P.white));
  for (const [dx, dy] of [[0, -10], [10, 0], [0, 10], [-10, 0]]) R(c, 348 + dx, 46 + dy, 1, 1, P.black);
  // chair back
  rrect(c, 172, 96, 40, 40, P.black, 3);
  rrect(c, 173, 97, 38, 38, g(P.red), 3);
  R(c, 176, 99, 4, 34, g(P.pink));
  R(c, 205, 99, 4, 34, g(P.darkRed));
}

function windowView(c, x, y, lt, grey) {
  // sky + two parallax layers of city behind the glass
  bands(c, x, y, 84, 77, grey ? [P.slate, P.steel, P.fog] : [P.navy, P.blue, P.cyan]);
  const far = Math.round(lt * 1.5);
  for (let i = -1; i < 8; i++) R(c, x - 6 + i * 13 + (far % 13), y + 44 - ((i * 5 + 40) % 11), 11, 40, grey ? P.steel : P.navy);
  oval(c, x + 18 - far, y + 82, 34, 16, grey ? P.slate : P.darkGreen);
  oval(c, x + 70 - far, y + 84, 30, 18, grey ? P.slate : P.green);
  const near = Math.round(lt * 3);
  for (let i = -1; i < 6; i++) {
    const bx = x - 10 + i * 18 + (near % 18);
    const by = y + 54 - ((i * 7 + 21) % 13);
    R(c, bx, by, 14, 40, grey ? P.slate : i % 2 ? P.purple : P.ink);
    for (let wy = by + 3; wy < y + 74; wy += 4) for (let wx = bx + 2; wx < bx + 12; wx += 4) R(c, wx, wy, 2, 2, grey ? P.steel : P.yellow);
  }
  if (grey) particles(c, lt, { seed: 3, n: 26, x, y, w: 84, h: 77, vy: 140, vx: -20, colors: [P.silver, P.fog], len: 3 });
  else {
    disc(c, x + 18, y + 16, 7, P.yellow);
    disc(c, x + 18, y + 16, 5, P.white);
    cloud(c, x + 6 + ((lt * 8) % 120) - 20, y + 14, 8, P.white);
  }
  R(c, x + 41, y, 2, 77, grey ? P.white : P.white);
  R(c, x, y + 37, 84, 2, P.white);
}

function paintDesk(c, grey) {
  const g = (x) => (grey ? GREY[x] : x);
  R(c, 243, 91, 60, 42, P.black);
  R(c, 244, 92, 58, 40, g(P.cream));
  R(c, 296, 92, 6, 40, g(P.tan));
  R(c, 244, 92, 58, 1, g(P.white));
  R(c, 248, 95, 46, 31, P.black);
  R(c, 287, 128, 7, 2, g(P.green));
  R(c, 262, 132, 22, 2, P.black);
  R(c, 108, 132, 230, 1, P.black);
  R(c, 108, 133, 230, 5, g(P.tan));
  R(c, 108, 133, 230, 1, g(P.cream));
  R(c, 108, 138, 230, 1, P.black);
  R(c, 112, 139, 222, 48, P.black);
  R(c, 113, 139, 220, 47, g(P.brown));
  R(c, 113, 139, 220, 2, g(P.maroon));
  for (const y of [146, 165]) {
    R(c, 274, y, 52, 16, P.black);
    R(c, 275, y + 1, 50, 14, g(P.tanShade));
    R(c, 295, y + 6, 10, 2, g(P.yellow));
  }
  R(c, 113, 186, 220, 1, P.black);
  R(c, 110, 187, 226, 3, A(P.black, 0.3));
  R(c, 164, 128, 50, 6, P.black);
  R(c, 165, 129, 48, 4, g(P.silver));
  for (let x = 167; x < 211; x += 3) R(c, x, 129, 2, 1, g(P.white));
  for (let x = 168; x < 211; x += 3) R(c, x, 131, 2, 1, g(P.white));
  R(c, 125, 118, 14, 15, P.black);
  R(c, 126, 119, 12, 13, g(P.blue));
  R(c, 138, 121, 4, 8, P.black);
  R(c, 138, 122, 3, 6, g(P.blue));
  R(c, 126, 119, 12, 2, g(P.cyan));
  R(c, 128, 124, 8, 4, g(P.white));
}

const office = (grey) => cached(`bf-office-${grey}`, OW, H, (c) => paintOffice(c, grey));
const desk = (grey) => cached(`bf-desk-${grey}`, OW, H, (c) => paintDesk(c, grey));

/** The hero can, 50 x 80 including outline. */
const bigCan = () =>
  cached('bf-can', 50, 80, (c) => {
    R(c, 3, 0, 44, 80, P.black);
    R(c, 1, 3, 48, 74, P.black);
    R(c, 2, 1, 46, 78, P.black);
    const cols = [[2, 1, P.maroon], [3, 2, P.darkRed], [5, 4, P.red], [9, 3, P.pink], [12, 1, P.white], [13, 22, P.red], [35, 7, P.darkRed], [42, 4, P.maroon], [46, 2, P.black]];
    for (const [x, w, col] of cols) R(c, x, 8, w, 64, col);
    R(c, 4, 1, 42, 1, P.fog);
    R(c, 2, 2, 46, 5, P.silver);
    R(c, 3, 3, 44, 2, P.fog);
    R(c, 6, 3, 38, 2, P.steel);
    R(c, 2, 6, 46, 1, P.steel);
    R(c, 2, 7, 46, 1, P.black);
    R(c, 5, 2, 10, 1, P.white);
    R(c, 21, 2, 9, 3, P.silver);
    R(c, 23, 3, 5, 1, P.steel);
    R(c, 2, 72, 46, 1, P.black);
    R(c, 2, 73, 46, 4, P.silver);
    R(c, 3, 75, 44, 2, P.fog);
    R(c, 5, 77, 40, 2, P.steel);
    for (let x = 2; x < 48; x++) {
      const yy = 15 + ((x >> 2) % 2);
      R(c, x, yy, 1, 3, P.white);
      R(c, x, yy + 3, 1, 1, P.cream);
    }
    const mini = wordmark('BIT', { h: 13, pen: 1, square: true, wide: 0.8, gap: 2, slant: 0.15, fill: [P.white, P.white, P.silver], outline: [[P.maroon, 1]] });
    const mini2 = wordmark('FIZZ', { h: 13, pen: 1, square: true, wide: 0.75, gap: 2, slant: 0.15, fill: [P.yellow, P.yellow, P.orange], outline: [[P.maroon, 1]] });
    drawMark(c, mini, 25, 26);
    drawMark(c, mini2, 25, 42);
    text(c, 'COLA', 25, 60, { color: P.white, align: 'center' });
    const rand = mulberry32(5);
    for (let i = 0; i < 26; i++) {
      const x = 4 + Math.floor(rand() * 40);
      const y = 10 + Math.floor(rand() * 60);
      if (y > 22 && y < 58 && x > 6 && x < 44) continue;
      R(c, x, y, 1, 1, rand() < 0.5 ? P.white : P.pink);
      if (rand() < 0.3) R(c, x, y + 1, 1, 1, P.pink);
    }
  });

const handCan = (grey) =>
  cached(`bf-hand-${grey}`, 11, 16, (c) => {
    const g = (x) => (grey ? GREY[x] : x);
    R(c, 0, 0, 11, 16, P.black);
    R(c, 1, 1, 9, 2, g(P.silver));
    R(c, 1, 3, 9, 11, g(P.red));
    R(c, 2, 3, 2, 11, g(P.pink));
    R(c, 8, 3, 1, 11, g(P.darkRed));
    R(c, 1, 7, 9, 2, g(P.white));
    R(c, 1, 14, 9, 1, g(P.silver));
  });

// --- pieces ------------------------------------------------------------------

function bitCube(ctx, x, y, i) {
  R(ctx, x, y, 11, 12, P.black);
  R(ctx, x + 1, y + 1, 9, 10, BIT_COLS[i % 8]);
  R(ctx, x + 1, y + 1, 9, 1, P.white);
  R(ctx, x + 9, y + 2, 1, 9, A(P.black, 0.3));
  text(ctx, i % 3 === 1 ? '0' : '1', x + 3, y + 3, { color: i % 8 >= 1 && i % 8 <= 4 ? P.black : P.white });
}

function osd(ctx, label, filled, extra, lt) {
  R(ctx, 234, 176, 140, 30, A(P.black, 0.8));
  R(ctx, 234, 176, 140, 1, P.steel);
  text(ctx, label, 240, 181, { color: P.white });
  if (extra) text(ctx, extra, 368, 181, { color: Math.floor(lt * 4) % 2 ? P.yellow : P.white, align: 'right' });
  for (let i = 0; i < 8; i++) {
    R(ctx, 240 + i * 16, 192, 14, 8, P.steel);
    R(ctx, 241 + i * 16, 193, 12, 6, i < filled ? BIT_COLS[i] : P.ink);
  }
}

function rainbow(ctx, cx, cy, r) {
  clipRect(ctx, cx - r - 1, cy - r - 1, r * 2 + 3, r + 1);
  [P.red, P.orange, P.yellow, P.green, P.blue, P.purple].forEach((c, i) => {
    ring(ctx, cx, cy, r - i * 2, c);
    ring(ctx, cx, cy, r - i * 2 - 1, c);
  });
  ctx.restore();
}

function plant(ctx, x, grey, lt) {
  const g = (c) => (grey ? GREY[c] : c);
  R(ctx, x - 11, 152, 22, 24, P.black);
  R(ctx, x - 10, 153, 20, 22, g(P.rust));
  R(ctx, x - 10, 153, 20, 4, g(P.orange));
  if (grey) {
    poly(ctx, [[x - 1, 153], [x - 17, 144], [x - 19, 154]], P.slate);
    poly(ctx, [[x + 1, 153], [x + 16, 142], [x + 19, 152]], P.steel);
    R(ctx, x - 1, 138, 2, 15, P.slate);
    poly(ctx, [[x, 138], [x - 10, 135], [x - 11, 143]], P.steel);
  } else {
    const sw = wave(lt, 1.2, 1);
    poly(ctx, [[x - 1, 153], [x - 15 + sw, 124], [x - 5, 130]], P.darkGreen);
    poly(ctx, [[x + 1, 153], [x + 15 + sw, 122], [x + 6, 130]], P.green);
    poly(ctx, [[x, 153], [x - 2 + sw, 110], [x + 3, 128]], P.green);
    disc(ctx, x - 2 + sw, 108, 5, P.pink);
    disc(ctx, x - 2 + sw, 108, 2, P.yellow);
  }
}

function screen(ctx, x, grey, lt) {
  if (grey) {
    R(ctx, x, 96, 44, 29, P.slate);
    for (let y = 99; y < 123; y += 4) R(ctx, x + 2, y, 40, 1, P.steel);
    for (let xx = x + 11; xx < x + 43; xx += 10) R(ctx, xx, 98, 1, 25, P.steel);
    if (Math.floor(lt * 2) % 2) R(ctx, x + 3, 112, 5, 2, P.silver);
  } else {
    R(ctx, x, 96, 44, 29, P.navy);
    const pts = [1, 4, 3, 7, 6, 11, 10, 15, 14, 19];
    for (let i = 0; i < pts.length; i++) R(ctx, x + 3 + i * 4, 120 - pts[i], 3, pts[i] + 2, BIT_COLS[i % 8]);
    sparkle(ctx, x + 40, 100, twinkle(lt, 0), P.white);
  }
}

/** The office at camera offset `cam` (0 = centred); background drifts less. */
function officeShot(ctx, lt, grey, cam, actor) {
  const bx = -12 + Math.round(cam * 0.5);
  ctx.drawImage(office(grey), bx, 0);
  clipRect(ctx, bx + 34, 26, 84, 77);
  windowView(ctx, bx + 34, 26, lt, grey);
  ctx.restore();
  const a = lt * (grey ? 0.15 : 2.2);
  for (let i = 1; i <= 9; i++) R(ctx, bx + 348 + Math.round(Math.sin(a) * i), 46 - Math.round(Math.cos(a) * i), 1, 1, P.black);
  for (let i = 1; i <= 6; i++) R(ctx, bx + 348 + Math.round(Math.sin(a / 12 + 2) * i), 46 - Math.round(Math.cos(a / 12 + 2) * i), 1, 1, P.black);
  const fx = -12 + Math.round(cam);
  actor(fx + 12);
  ctx.drawImage(desk(grey), fx, 0);
  screen(ctx, fx + 249, grey, lt);
  plant(ctx, fx + 370, grey, lt);
}

function rainCloud(ctx, x, y, lt, s = 14) {
  const cy = y + wave(lt, 0.5, 1);
  particles(ctx, lt, { seed: 9, n: Math.round(s * 0.6), x: x - s - 2, y: cy + s * 0.4, w: s * 2 + 4, h: s * 1.6, vy: 70, colors: [P.steel], len: 3 });
  cloud(ctx, x, cy, s, P.slate, P.ink);
}

// --- shots -------------------------------------------------------------------

// 1. Establishing: the grey office, camera drifting in.
function shotOffice(ctx, lt) {
  const cam = -Math.round(lt * 3);
  officeShot(ctx, lt, true, cam, (ox) => {
    const sigh = lt > 1.8 && lt < 2.6;
    hero(ctx, GX + ox, GGY, { pal: GUY_GREY, eyes: sigh ? 'closed' : 'sleepy', brows: 'sad', mouth: sigh ? 'o' : 'frown', look: 1, bob: sigh ? 1 : 0, legs: 'none' });
    rainCloud(ctx, GX + ox, 62, lt);
  });
  osd(ctx, 'COLOUR', 0, '0%', lt);
}

// 2. Close-up: his personal rain cloud.
function shotSigh(ctx, lt) {
  bands(ctx, 0, 0, W, H, [P.silver, P.fog]);
  dither(ctx, 0, 0, W, H, P.silver, 'dots');
  R(ctx, 20, 30, 70, 120, P.white);
  R(ctx, 26, 36, 58, 108, P.steel);
  particles(ctx, lt, { seed: 2, n: 20, x: 26, y: 36, w: 58, h: 108, vy: 150, vx: -20, colors: [P.fog], len: 4 });
  R(ctx, 54, 36, 2, 108, P.white);
  const drip = (lt * 1.3) % 1;
  const look = drip > 0.6 ? 0 : 0;
  faceCU(ctx, 200, 128, 44, { pal: GUY_GREY, eyes: lt > 1.4 && lt < 1.6 ? 'closed' : 'sleepy', brows: 'sad', mouth: 'frown', lookY: -1, look });
  rainCloud(ctx, 200, 34, lt, 30);
  // a single big drop lands on his head
  const dy = Math.round(drip * 46);
  if (drip < 0.85) {
    R(ctx, 214, 62 + dy, 3, 5, P.steel);
    R(ctx, 215, 61 + dy, 1, 1, P.steel);
  } else {
    R(ctx, 208, 104, 2, 1, P.steel);
    R(ctx, 220, 104, 2, 1, P.steel);
    R(ctx, 212, 102, 1, 1, P.steel);
  }
  if (lt > 0.9) bigText(ctx, 'SIGH.', 290, 150 - Math.round(prog(lt, 0.9, 2) * 6), { scale: 2, color: P.white, outline: P.steel });
}

// 3. Product hero: the can rises into the spotlight.
function shotCan(ctx, lt) {
  bands(ctx, 0, 0, W, 152, [P.black, P.ink]);
  R(ctx, 0, 152, W, 64, P.black);
  for (let i = 0; i < 3; i++) poly(ctx, [[192 - 14 - i * 8, 0], [192 + 14 + i * 8, 0], [192 + 46 + i * 12, 160], [192 - 46 - i * 12, 160]], A(P.white, 0.05));
  oval(ctx, 192, 160, 50, 8, P.slate);
  oval(ctx, 192, 160, 40, 6, P.steel);
  const rise = easeOutBack(prog(lt, 0.1, 0.8), 1.4);
  const [sx, sy] = lt > 1.5 && lt < 1.9 ? shake(lt, 1) : [0, 0];
  const y = Math.round(lerp(230, 82, rise));
  shadow(ctx, 192, 160, 26, 0.5);
  glow(ctx, 192, 120, 46, P.red, 0.07);
  ctx.drawImage(bigCan(), 167 + sx, y + sy);
  glint(ctx, bigCan(), 167 + sx, y + sy, prog(lt, 0.8, 1.4), { width: 7 });
  if (lt > 0.8) particles(ctx, lt, { seed: 4, n: 10, x: 150, y: 70, w: 84, h: 90, vy: -6, sway: 3, colors: [A(P.white, 0.5)], size: 2 });
  if (lt > 1.6) {
    const p = easeOutBack(prog(lt, 1.6, 1.9), 2);
    bigText(ctx, 'PSSHT!', 290, Math.round(56 - p * 10), { scale: 3, color: P.white, outline: P.black, ow: 2, depth: 2, depthColor: P.steel, align: 'center' });
    for (let i = 0; i < 3; i++) R(ctx, 232 + i * 6, 70 + i * 3, 6 + i * 2, 1, P.silver);
    const N = 18;
    const period = 2.2;
    for (let i = 0; i < N; i++) {
      if (lt - 1.6 < (i * period) / N) continue;
      const age = (lt - 1.6 - (i * period) / N) % period;
      const xx = 192 + Math.sin(age * 4 + i) * (4 + age * 7) + ((i * 37) % 13) - 6;
      text(ctx, i % 3 ? '1' : '0', xx, 80 - age * 52, { color: [P.cyan, P.white, P.yellow][i % 3] });
    }
  }
  sparkle(ctx, 178, 120, twinkle(lt, 0.2), P.white);
  sparkle(ctx, 205, 102, twinkle(lt, 0.6), P.white);
  text(ctx, 'SERVING SUGGESTION', 8, 204, { color: P.steel });
}

// 4. Close-up: the first sip, then colour floods in from his face.
function shotSip(ctx, lt) {
  const swap = prog(lt, 1.1, 1.8);
  const cu = (grey) => {
    if (grey) bands(ctx, 0, 0, W, H, [P.silver, P.fog]);
    else {
      sunburst(ctx, 192, 120, lt * 0.05, 14, P.yellow, P.orange);
      particles(ctx, lt, { seed: 21, n: 50, vy: 50, sway: 4, colors: BIT_COLS, size: 2, y: 24, h: 192 });
    }
    const after = lt > 1.1;
    faceCU(ctx, 192, 120, 44, {
      pal: grey ? GUY_GREY : GUY,
      eyes: after ? 'stars' : 'closed',
      mouth: after ? 'grin' : 'flat',
      blush: !grey,
      brows: after ? 'up' : 'flat',
    });
    const lower = easeOut(prog(lt, 1.0, 1.4));
    const cx = 196 + Math.round(lower * 70);
    const cy = 128 + Math.round(lower * 40);
    disc(ctx, cx - 4, cy + 46, 9, P.black);
    disc(ctx, cx - 4, cy + 46, 8, grey ? P.silver : P.skin);
    if (grey) {
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.drawImage(cached('bf-can-grey', 50, 80, (c) => {
        c.drawImage(bigCan(), 0, 0);
        const d = c.getImageData(0, 0, 50, 80);
        const toHex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
        for (let i = 0; i < d.data.length; i += 4) {
          if (!d.data[i + 3]) continue;
          const hex = toHex(d.data[i], d.data[i + 1], d.data[i + 2]);
          const gHex = GREY[hex] || hex;
          const n = parseInt(gHex.slice(1), 16);
          d.data[i] = n >> 16;
          d.data[i + 1] = (n >> 8) & 255;
          d.data[i + 2] = n & 255;
        }
        c.putImageData(d, 0, 0);
      }), cx - 25, cy);
      ctx.restore();
    } else ctx.drawImage(bigCan(), cx - 25, cy);
  };
  cu(true);
  if (swap > 0) {
    clipCircle(ctx, 192, 120, swap * swap * 260);
    cu(false);
    ctx.restore();
  }
  if (lt < 1.1 && lt > 0.2) bigText(ctx, Math.floor(lt * 5) % 2 ? 'GLUG' : 'GLUG!', 300, 60, { scale: 2, color: P.white, outline: P.steel });
  if (lt > 1.5) bigText(ctx, '!!', 262, 50, { scale: 3, color: P.white, outline: P.black, ow: 2 });
}

// 5. Wide: the office in full colour.
function shotParty(ctx, lt) {
  const nBits = Math.min(8, Math.floor(prog(lt, 0.2, 1.8) * 8.99));
  const bit = (ox, i, front) => {
    const a = lt * 2.2 + (i / 8) * Math.PI * 2;
    if (Math.sin(a) > 0 !== front) return;
    bitCube(ctx, GX + ox - 5 + Math.round(Math.cos(a) * 66), 110 + Math.round(Math.sin(a) * 12) - wave(lt + i * 0.1, 1.5, 2), i);
  };
  officeShot(ctx, lt, false, Math.round(lt * 2) - 6, (ox) => {
    rainbow(ctx, GX + ox, 118, 44);
    for (let i = 0; i < nBits; i++) bit(ox, i, false);
    const hop = -Math.round(Math.abs(Math.sin(lt * Math.PI * 2.4)) * 5);
    const me = hero(ctx, GX + ox, GGY, { pal: GUY, eyes: 'happy', mouth: 'grin', armL: 'up', armR: 'up', blush: true, bob: hop, legs: 'none' });
    ctx.drawImage(handCan(false), me.handL[0] - 5, me.handL[1] - 14);
    for (let i = 0; i < nBits; i++) bit(ox, i, true);
  });
  particles(ctx, lt, { seed: 21, n: 40, vy: 40, sway: 4, colors: BIT_COLS, size: 2, y: 24, h: 192 });
  osd(ctx, 'FLAVOUR', nBits, nBits >= 8 ? '8 BITS!' : `${nBits} BIT${nBits === 1 ? '' : 'S'}`, lt);
  if (lt > 0.6) {
    const p = easeOutBack(prog(lt, 0.6, 1.0), 2.5);
    const rr = Math.round(30 * p);
    const rot = lt * 0.6;
    poly(ctx, starPts(318, 70, 14, rr + 2, Math.round(rr * 0.78) + 2, rot), P.black);
    poly(ctx, starPts(318, 70, 14, rr, Math.round(rr * 0.78), rot), P.yellow);
    if (p > 0.8) {
      bigText(ctx, '256', 318, 58, { scale: 3, color: P.red, outline: P.white, align: 'center' });
      text(ctx, 'TASTES!', 318, 83, { color: P.black, align: 'center' });
    }
  }
}

// 6. End slate.
function shotSlate(ctx, lt) {
  sunburst(ctx, 96, 112, lt * 0.04, 12, P.red, P.darkRed);
  glow(ctx, 96, 112, 70, P.yellow, 0.06, 5);
  clipRect(ctx, 0, 26, W, H);
  for (let i = 0; i < 16; i++) {
    const age = (lt + (i * 3) / 16) % 3;
    const x = 96 + Math.sin(age * 3 + i * 1.7) * (8 + age * 9) + ((i * 29) % 30) - 15;
    text(ctx, i % 3 ? '1' : '0', x, 140 - age * 40, { color: i % 2 ? P.pink : P.white });
  }
  ctx.restore();
  oval(ctx, 96, 152, 40, 7, P.maroon);
  oval(ctx, 96, 151, 38, 5, P.black);
  const bob = wave(lt, 0.5, 2);
  shadow(ctx, 96, 151, 24, 0.5);
  ctx.drawImage(bigCan(), 71, 70 + bob);
  glint(ctx, bigCan(), 71, 70 + bob, ((lt + 1.2) % 3) / 0.8, { width: 7 });
  sparkle(ctx, 84, 96 + bob, twinkle(lt, 0.1), P.white);
  sparkle(ctx, 110, 128 + bob, twinkle(lt, 0.45), P.white);
  const bp = easeOutBack(prog(lt, 0.8, 1.1), 2.5);
  if (bp > 0) {
    const rr = Math.round(19 * bp);
    poly(ctx, starPts(140, 70, 12, rr + 2, rr * 0.8 + 2, lt * 0.5), P.black);
    poly(ctx, starPts(140, 70, 12, rr, rr * 0.8, lt * 0.5), P.yellow);
    if (bp > 0.8) {
      text(ctx, 'NOW', 140, 63, { color: P.red, align: 'center' });
      text(ctx, '8-BIT', 140, 72, { color: P.black, align: 'center' });
    }
  }
  const mk = MARK();
  const x0 = drawMark(ctx, mk, 272, 34, { reveal: prog(lt, 0.1, 0.9), drop: 40 });
  if (lt > 1.0) glint(ctx, mk.cv, x0 - mk.ox, 34 - mk.oy, ((lt - 1.0) % 3.5) / 0.7, { width: 6 });
  if (lt > 0.8) drawMark(ctx, SUB(), 272, 84 - Math.round((1 - easeOutBack(prog(lt, 0.8, 1.1))) * 10));
  if (lt > 1.4) text(ctx, 'NOW WITH 8 BITS OF FLAVOUR', 272, 112, { color: P.cream, shadow: P.black, align: 'center' });
  if (lt > 1.6) slogan(ctx, 'TASTE EVERY BIT.', 192, 150, lt - 1.6, { scale: 2, bg: P.yellow, edge: P.orange, color: P.maroon });
  if (lt > 2.2) urlPill(ctx, 'BITFIZZ.BIT', 192, 178, { bg: P.maroon, border: P.pink });
  finePrint(ctx, 'CONTAINS NO ACTUAL BITS. SIDE EFFECTS MAY INCLUDE NOSTALGIA AND BURPING IN 8-BIT.', { lt: lt - 2.4 });
}

const SCENES = [
  { at: 0, draw: shotOffice },
  { at: 3.6, draw: shotSigh, wipe: 'iris', wd: 0.4, cx: 180, cy: 100 },
  { at: 6.0, draw: shotCan, wipe: 'blocks', wd: 0.45 },
  { at: 10.0, draw: shotSip, wipe: 'cut' },
  { at: 12.6, draw: shotParty, wipe: 'flash', wd: 0.3 },
  { at: 17.6, draw: shotSlate, wipe: 'iris', wd: 0.5, cx: 96, cy: 112 },
];

// Jingle (150 bpm): grey intro, build, party theme, then the "BIT-FIZZ CO-LA"
// sting lands with the end slate at beat 44 (17.6 s) and resolves on C.
const THEME = 'C5:0.5 E5:0.5 G5:0.5 C6:0.5 R:0.5 G5:0.5 C6:1 A5:0.5 F5:0.5 A5:0.5 C6:0.5 R:0.5 A5:0.5 F5:1 G5:0.5 B4:0.5 D5:0.5 G5:0.5 R:0.5 F5:0.5 E5:0.5 D5:0.5 E5:1 D5:1 C5:1 G4:1';

export default {
  id: 'bitfizz-cola',
  brand: 'BITFIZZ COLA',
  duration: 24,
  voice: { gender: 'male', lang: 'en-US', pitch: 1.0, rate: 1.05 },
  script: [
    { at: 0.6, text: 'Is your life feeling a little... monochrome?' },
    { at: 6.2, text: 'Time to crack open an ice-cold BitFizz Cola.' },
    { at: 10.2, text: 'Now with eight bits of flavour!' },
    { at: 13.0, text: "That's two hundred and fifty-six tastes in every single sip." },
    { at: 18.0, text: 'BitFizz Cola. Taste every bit.' },
  ],
  tune: {
    bpm: 150,
    wave: 'square',
    notes: tune(
      'E4:2 D4:2 C4:3 R:1 E4:2 D4:2 G3:3 R:1',
      'G4:0.5 R:0.5 G4:0.5 R:0.5 G4:0.5 A4:0.5 B4:0.5 D5:0.5 R:4',
      THEME,
      'C5:0.5 E5:0.5 G5:0.5 E5:0.5 F5:0.5 A5:0.5 B5:1',
      'G5:1 C6:1 R:0.5 A5:0.5 B5:1 C6:3 R:1 E5:0.5 G5:0.5 C6:3 R:4',
    ),
    bass: tune(
      'C3:4 G2:4 A2:4 G2:4',
      'G2:1 G2:1 G2:1 G2:1 G2:4',
      'C3:1 C3:1 G2:1 C3:1 F2:1 F2:1 C3:1 F2:1 G2:1 G2:1 D3:1 G2:1 C3:2 G2:2 F2:2 G2:2',
      'C3:2 F2:2 G2:2 C3:2 C3:1 G2:1 C3:2 R:4',
    ),
    bassWave: 'triangle',
    drums: tune(
      rep('H:2 H:2', 4),
      'S:0.5 S:0.5 S:0.5 S:0.5 S:0.25 S:0.25 S:0.25 S:0.25 K:1 R:4',
      rep('K:1 H:0.5 H:0.5 S:1 H:0.5 H:0.5', 5),
      'K:1 S:1 K:1 S:1 K:0.5 K:0.5 S:1 K:1 R:1 K:1 R:7',
    ),
  },
  draw(ctx, t, dt, info) {
    play(ctx, dt, info, SCENES);
  },
};
