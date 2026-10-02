// BITFIZZ COLA: a grey office worker drinks a can and his world gets its
// palette back. "Now with 8 bits of flavour!"
import {
  P, W, H, BASE_PAL, R, A, rrect, disc, oval, ring, poly, dither, bands, sparkle, twinkle, particles, shadow,
  sunburst, cached, text, bigText, logo, finePrint, slogan, play, hero, prog, lerp, easeOut, easeOutBack,
  wave, shake, clipCircle, clipRect, starPts, cloud, mulberry32,
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

// --- static art --------------------------------------------------------------

function paintOffice(c, grey) {
  const g = (x) => (grey ? GREY[x] : x);
  R(c, 0, 0, W, 142, g(P.cream));
  dither(c, 0, 0, W, 142, g(P.yellow), 'dots');
  R(c, 0, 140, W, 5, g(P.brown));
  R(c, 0, 140, W, 1, g(P.tan));
  R(c, 0, 145, W, 27, g(P.tan));
  for (let x = 6; x < W; x += 30) {
    R(c, x, 149, 22, 18, g(P.tanShade));
    R(c, x + 1, 150, 20, 16, g(P.tan));
    R(c, x + 1, 166, 20, 1, g(P.cream));
  }
  R(c, 0, 170, W, 5, g(P.brown));
  R(c, 0, 175, W, 41, g(P.tanShade));
  for (let y = 184, k = 0; y < H; y += 11, k++) {
    R(c, 0, y, W, 1, g(P.brown));
    for (let x = (k % 2) * 37; x < W; x += 74) R(c, x, y + 1, 1, 10, g(P.brown));
  }
  // window
  R(c, 17, 21, 94, 87, P.black);
  R(c, 18, 22, 92, 85, g(P.white));
  bands(c, 22, 26, 84, 77, grey ? [P.slate, P.steel, P.fog] : [P.navy, P.blue, P.cyan]);
  c.save();
  c.beginPath();
  c.rect(22, 26, 84, 77);
  c.clip();
  oval(c, 40, 108, 34, 16, g(P.darkGreen));
  oval(c, 92, 110, 30, 18, g(P.green));
  for (let i = 0; i < 6; i++) R(c, 50 + i * 9, 86 - ((i * 7) % 13), 7, 30, g(i % 2 ? P.steel : P.slate));
  for (let i = 0; i < 6; i++) for (let y = 90 - ((i * 7) % 13); y < 102; y += 4) R(c, 52 + i * 9, y, 1, 2, g(P.yellow));
  c.restore();
  R(c, 63, 26, 2, 77, g(P.white));
  R(c, 22, 63, 84, 2, g(P.white));
  R(c, 13, 107, 102, 1, P.black);
  R(c, 13, 108, 102, 4, g(P.white));
  R(c, 13, 112, 102, 1, g(P.fog));
  // framed picture
  R(c, 117, 31, 40, 32, P.black);
  R(c, 118, 32, 38, 30, g(P.brown));
  R(c, 121, 35, 32, 24, g(P.cyan));
  poly(c, [[121, 59], [132, 41], [139, 50], [145, 44], [153, 59]], g(P.darkGreen));
  poly(c, [[129, 46], [132, 41], [135, 46]], g(P.white));
  disc(c, 148, 40, 3, g(P.yellow));
  // clock
  disc(c, 336, 46, 14, P.black);
  disc(c, 336, 46, 13, g(P.red));
  disc(c, 336, 46, 11, g(P.white));
  for (const [dx, dy] of [[0, -10], [10, 0], [0, 10], [-10, 0]]) R(c, 336 + dx, 46 + dy, 1, 1, P.black);
  // chair back
  rrect(c, 160, 96, 40, 40, P.black, 3);
  rrect(c, 161, 97, 38, 38, g(P.red), 3);
  R(c, 164, 99, 4, 34, g(P.pink));
  R(c, 193, 99, 4, 34, g(P.darkRed));
}

function paintDesk(c, grey) {
  const g = (x) => (grey ? GREY[x] : x);
  // monitor
  R(c, 231, 91, 60, 42, P.black);
  R(c, 232, 92, 58, 40, g(P.cream));
  R(c, 284, 92, 6, 40, g(P.tan));
  R(c, 232, 92, 58, 1, g(P.white));
  R(c, 236, 95, 46, 31, P.black);
  R(c, 275, 128, 7, 2, g(P.green));
  R(c, 250, 132, 22, 2, P.black);
  // desk top + front
  R(c, 96, 132, 230, 1, P.black);
  R(c, 96, 133, 230, 5, g(P.tan));
  R(c, 96, 133, 230, 1, g(P.cream));
  R(c, 96, 138, 230, 1, P.black);
  R(c, 100, 139, 222, 48, P.black);
  R(c, 101, 139, 220, 47, g(P.brown));
  R(c, 101, 139, 220, 2, g(P.maroon));
  for (const y of [146, 165]) {
    R(c, 262, y, 52, 16, P.black);
    R(c, 263, y + 1, 50, 14, g(P.tanShade));
    R(c, 283, y + 6, 10, 2, g(P.yellow));
  }
  R(c, 101, 186, 220, 1, P.black);
  R(c, 98, 187, 226, 3, A(P.black, 0.3));
  // keyboard
  R(c, 152, 128, 50, 6, P.black);
  R(c, 153, 129, 48, 4, g(P.silver));
  for (let x = 155; x < 199; x += 3) R(c, x, 129, 2, 1, g(P.white));
  for (let x = 156; x < 199; x += 3) R(c, x, 131, 2, 1, g(P.white));
  // mug
  R(c, 113, 118, 14, 15, P.black);
  R(c, 114, 119, 12, 13, g(P.blue));
  R(c, 126, 121, 4, 8, P.black);
  R(c, 126, 122, 3, 6, g(P.blue));
  R(c, 114, 119, 12, 2, g(P.cyan));
  R(c, 116, 124, 8, 4, g(P.white));
}

const office = (grey) => cached(`bf-office-${grey}`, W, H, (c) => paintOffice(c, grey));
const desk = (grey) => cached(`bf-desk-${grey}`, W, H, (c) => paintDesk(c, grey));

/** The big can, 50 x 80 including outline. */
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
      const yy = 16 + ((x >> 2) % 2);
      R(c, x, yy, 1, 3, P.white);
      R(c, x, yy + 3, 1, 1, P.cream);
    }
    bigText(c, 'BIT', 25, 30, { scale: 2, color: P.white, outline: P.maroon, align: 'center' });
    bigText(c, 'FIZZ', 25, 48, { scale: 2, color: P.yellow, outline: P.maroon, align: 'center' });
    text(c, 'COLA', 25, 63, { color: P.white, align: 'center' });
    const rand = mulberry32(5);
    for (let i = 0; i < 26; i++) {
      const x = 4 + Math.floor(rand() * 40);
      const y = 10 + Math.floor(rand() * 60);
      if (y > 26 && y < 58 && x > 8 && x < 42) continue;
      R(c, x, y, 1, 1, rand() < 0.5 ? P.white : P.pink);
      if (rand() < 0.3) R(c, x, y + 1, 1, 1, P.pink);
    }
  });

/** Can held in a hand, 11 x 16. */
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

// --- scene pieces ------------------------------------------------------------

const BIT_COLS = [P.red, P.orange, P.yellow, P.green, P.cyan, P.blue, P.magenta, P.pink];

function bitCube(ctx, x, y, i) {
  const c = BIT_COLS[i % 8];
  R(ctx, x, y, 11, 12, P.black);
  R(ctx, x + 1, y + 1, 9, 10, c);
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
    const x = 240 + i * 16;
    R(ctx, x, 192, 14, 8, P.steel);
    R(ctx, x + 1, 193, 12, 6, i < filled ? BIT_COLS[i] : P.ink);
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

function plant(ctx, grey, lt) {
  const x = 356;
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

function screenContent(ctx, grey, lt) {
  if (grey) {
    R(ctx, 237, 96, 44, 29, P.slate);
    for (let y = 99; y < 123; y += 4) R(ctx, 239, y, 40, 1, P.steel);
    for (let x = 248; x < 280; x += 10) R(ctx, x, 98, 1, 25, P.steel);
    if (Math.floor(lt * 2) % 2) R(ctx, 240, 112, 5, 2, P.silver);
  } else {
    R(ctx, 237, 96, 44, 29, P.navy);
    const pts = [1, 4, 3, 7, 6, 11, 10, 15, 14, 19];
    for (let i = 0; i < pts.length; i++) R(ctx, 240 + i * 4, 120 - pts[i], 3, pts[i] + 2, BIT_COLS[i % 8]);
    sparkle(ctx, 277, 100, twinkle(lt, 0), P.white);
  }
}

function clockHands(ctx, lt, grey) {
  const a = lt * (grey ? 0.15 : 2.2);
  for (let i = 1; i <= 9; i++) R(ctx, 336 + Math.round(Math.sin(a) * i), 46 - Math.round(Math.cos(a) * i), 1, 1, P.black);
  for (let i = 1; i <= 6; i++) R(ctx, 336 + Math.round(Math.sin(a / 12 + 2) * i), 46 - Math.round(Math.cos(a / 12 + 2) * i), 1, 1, P.black);
}

function officeBack(ctx, lt, grey) {
  ctx.drawImage(office(grey), 0, 0);
  clipRect(ctx, 22, 26, 84, 77);
  if (grey) particles(ctx, lt, { seed: 3, n: 26, x: 22, y: 26, w: 84, h: 77, vy: 140, vx: -20, colors: [P.silver, P.fog], len: 3 });
  else {
    disc(ctx, 40, 42, 7, P.yellow);
    disc(ctx, 40, 42, 5, P.white);
    cloud(ctx, 28 + ((lt * 8) % 120) - 20, 40, 8, P.white);
  }
  ctx.restore();
  plant(ctx, grey, lt);
  clockHands(ctx, lt, grey);
}

function rainCloud(ctx, lt) {
  const cy = 62 + wave(lt, 0.5, 1);
  particles(ctx, lt, { seed: 9, n: 8, x: GX - 16, y: cy + 6, w: 32, h: 20, vy: 70, colors: [P.steel], len: 3 });
  cloud(ctx, GX, cy, 14, P.slate, P.ink);
}

// --- scenes ------------------------------------------------------------------

function sceneGrey(ctx, lt) {
  officeBack(ctx, lt, true);
  const sigh = lt > 2.0 && lt < 2.8;
  hero(ctx, GX, GGY, { pal: GUY_GREY, eyes: sigh ? 'closed' : 'sleepy', brows: 'sad', mouth: sigh ? 'o' : 'frown', look: lt > 2.8 ? 0 : 1, bob: sigh ? 1 : 0, legs: 'none' });
  if (sigh) text(ctx, 'SIGH...', GX + 22, 104 - Math.round(prog(lt, 2, 2.8) * 6), { color: P.steel });
  ctx.drawImage(desk(true), 0, 0);
  screenContent(ctx, true, lt);
  rainCloud(ctx, lt);
  osd(ctx, 'COLOUR', 0, '0%', lt);
}

function sceneCan(ctx, lt) {
  bands(ctx, 0, 0, W, 152, [P.black, P.ink]);
  R(ctx, 0, 152, W, 64, P.black);
  for (let i = 0; i < 3; i++) poly(ctx, [[192 - 14 - i * 8, 0], [192 + 14 + i * 8, 0], [192 + 46 + i * 12, 160], [192 - 46 - i * 12, 160]], A(P.white, 0.05));
  oval(ctx, 192, 160, 50, 8, P.slate);
  oval(ctx, 192, 160, 40, 6, P.steel);
  const rise = easeOutBack(prog(lt, 0.1, 0.8), 1.4);
  const [sx, sy] = lt > 1.3 && lt < 1.7 ? shake(lt, 1) : [0, 0];
  const y = Math.round(lerp(230, 82, rise));
  shadow(ctx, 192, 160, 26, 0.5);
  ctx.drawImage(bigCan(), 167 + sx, y + sy);
  if (lt > 0.8) particles(ctx, lt, { seed: 4, n: 10, x: 150, y: 70, w: 84, h: 90, vy: -6, sway: 3, colors: [A(P.white, 0.5)], size: 2 });
  if (lt > 1.4) {
    const p = easeOutBack(prog(lt, 1.4, 1.7), 2);
    bigText(ctx, 'PSSHT!', 290, Math.round(56 - p * 10), { scale: 3, color: P.white, outline: P.black, ow: 2, depth: 2, depthColor: P.steel, align: 'center' });
    for (let i = 0; i < 3; i++) R(ctx, 232 + i * 6, 70 + i * 3, 6 + i * 2, 1, P.silver);
    const N = 18;
    const period = 2.2;
    for (let i = 0; i < N; i++) {
      if (lt - 1.4 < (i * period) / N) continue;
      const age = (lt - 1.4 - (i * period) / N) % period;
      const xx = 192 + Math.sin(age * 4 + i) * (4 + age * 7) + ((i * 37) % 13) - 6;
      text(ctx, i % 3 ? '1' : '0', xx, 80 - age * 52, { color: [P.cyan, P.white, P.yellow][i % 3] });
    }
  }
  sparkle(ctx, 178, 120, twinkle(lt, 0.2), P.white);
  sparkle(ctx, 205, 102, twinkle(lt, 0.6), P.white);
  text(ctx, 'SERVING SUGGESTION', 8, 204, { color: P.steel });
}

function sceneColour(ctx, lt) {
  const swap = prog(lt, 1.0, 1.9);
  const drinking = lt < 1.2;
  const party = lt >= 1.2;
  const back = (grey) => {
    officeBack(ctx, lt, grey);
    if (!grey) rainbow(ctx, GX, 118, 44);
  };
  back(true);
  if (swap > 0) {
    clipCircle(ctx, GX, 104, swap * swap * 330);
    back(false);
    ctx.restore();
  }
  const grey = swap < 0.15;
  const nBits = party ? Math.min(8, Math.floor(prog(lt, 1.8, 3.4) * 8.99)) : 0;
  const bit = (i, front) => {
    const a = lt * 2.2 + (i / 8) * Math.PI * 2;
    if (Math.sin(a) > 0 !== front) return;
    bitCube(ctx, GX - 5 + Math.round(Math.cos(a) * 66), 110 + Math.round(Math.sin(a) * 12) - wave(lt + i * 0.1, 1.5, 2), i);
  };
  for (let i = 0; i < nBits; i++) bit(i, false);
  const hop = party ? -Math.round(Math.abs(Math.sin(lt * Math.PI * 2.4)) * 5) : 0;
  const me = hero(ctx, GX, GGY, {
    pal: grey ? GUY_GREY : GUY,
    eyes: drinking ? 'closed' : 'happy',
    mouth: drinking ? 'flat' : 'grin',
    armL: drinking ? 'down' : 'up',
    armR: drinking ? 'mouth' : 'up',
    blush: party,
    bob: hop,
    legs: 'none',
  });
  const can = drinking ? me.handR : me.handL;
  ctx.drawImage(handCan(grey), can[0] - 5, can[1] - (drinking ? 12 : 14));
  if (drinking && lt > 0.3) text(ctx, Math.floor(lt * 4) % 2 ? 'GLUG' : 'GLUG!', GX + 22, me.top + 4, { color: P.black });
  ctx.drawImage(desk(grey), 0, 0);
  screenContent(ctx, grey, lt);
  for (let i = 0; i < nBits; i++) bit(i, true);
  if (lt < 1.0) rainCloud(ctx, lt);
  if (party) particles(ctx, lt, { seed: 21, n: 40, vy: 40, sway: 4, colors: BIT_COLS, size: 2, y: 24, h: 192 });
  osd(ctx, party ? 'FLAVOUR' : 'COLOUR', nBits, nBits >= 8 ? '8 BITS!' : party ? `${nBits} BIT${nBits === 1 ? '' : 'S'}` : '0%', lt);
  if (lt > 4.3) {
    const p = easeOutBack(prog(lt, 4.3, 4.7), 2.5);
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

function scenePack(ctx, lt) {
  sunburst(ctx, 96, 112, lt * 0.04, 12, P.red, P.darkRed);
  clipRect(ctx, 0, 26, W, H);
  for (let i = 0; i < 16; i++) {
    const period = 3;
    const age = (lt + (i * period) / 16) % period;
    const x = 96 + Math.sin(age * 3 + i * 1.7) * (8 + age * 9) + ((i * 29) % 30) - 15;
    text(ctx, i % 3 ? '1' : '0', x, 140 - age * 40, { color: i % 2 ? P.pink : P.white });
  }
  ctx.restore();
  oval(ctx, 96, 152, 40, 7, P.maroon);
  oval(ctx, 96, 151, 38, 5, P.black);
  const bob = wave(lt, 0.5, 2);
  shadow(ctx, 96, 151, 24, 0.5);
  ctx.drawImage(bigCan(), 71, 70 + bob);
  sparkle(ctx, 84, 96 + bob, twinkle(lt, 0.1), P.white);
  sparkle(ctx, 110, 128 + bob, twinkle(lt, 0.45), P.white);
  const bp = easeOutBack(prog(lt, 0.6, 0.9), 2.5);
  if (bp > 0) {
    const rr = Math.round(19 * bp);
    poly(ctx, starPts(140, 70, 12, rr + 2, rr * 0.8 + 2, lt * 0.5), P.black);
    poly(ctx, starPts(140, 70, 12, rr, rr * 0.8, lt * 0.5), P.yellow);
    if (bp > 0.8) {
      text(ctx, 'NEW', 140, 63, { color: P.red, align: 'center' });
      text(ctx, '8-BIT', 140, 72, { color: P.black, align: 'center' });
    }
  }
  logo(ctx, 'BITFIZZ', 272, 42, lt - 0.2, { scale: 4, depth: 3, depthColor: P.darkRed });
  if (lt > 0.9) bigText(ctx, 'COLA', 272, 86 - Math.round((1 - easeOutBack(prog(lt, 0.9, 1.2))) * 8), { scale: 3, color: P.yellow, outline: P.black, ow: 2, depth: 2, depthColor: P.rust, align: 'center' });
  if (lt > 1.3) text(ctx, 'ALSO IN DIET (4-BIT)', 272, 118, { color: P.cream, shadow: P.black, align: 'center' });
  if (lt > 1.6) slogan(ctx, 'NOW WITH 8 BITS OF FLAVOUR!', 192, 162, lt - 1.6, { scale: 2, bg: P.yellow, edge: P.orange, color: P.maroon });
  finePrint(ctx, 'CONTAINS NO ACTUAL BITS. SIDE EFFECTS MAY INCLUDE NOSTALGIA AND BURPING IN 8-BIT.', { lt: lt - 2 });
}

const SCENES = [
  { at: 0, draw: sceneGrey },
  { at: 4.6, draw: sceneCan, wipe: 'blocks', wd: 0.5 },
  { at: 8.8, draw: sceneColour, wipe: 'diag', wd: 0.45 },
  { at: 16.2, draw: scenePack, wipe: 'iris', wd: 0.55, cx: 96, cy: 112 },
];

export default {
  id: 'bitfizz-cola',
  brand: 'BITFIZZ COLA',
  duration: 22,
  voice: { gender: 'male', lang: 'en-US', pitch: 1.0, rate: 1.08 },
  script: [
    { at: 0.6, text: 'Is your life feeling a little... monochrome?' },
    { at: 4.8, text: 'Crack open an ice-cold BitFizz Cola!' },
    { at: 8.9, text: 'Every can is packed with eight whole bits of flavour!' },
    { at: 13.0, text: "That's two hundred and fifty-six tastes per sip!" },
    { at: 17.0, text: 'BitFizz Cola. Now with eight bits of flavour.' },
  ],
  tune: {
    bpm: 150,
    wave: 'square',
    notes: 'C5:0.5 E5:0.5 G5:0.5 C6:0.5 R:0.5 G5:0.5 C6:1 A5:0.5 F5:0.5 A5:0.5 C6:0.5 R:0.5 A5:0.5 F5:1 G5:0.5 B4:0.5 D5:0.5 G5:0.5 R:0.5 F5:0.5 E5:0.5 D5:0.5 C5:2 R:2',
    bass: 'C3:1 C3:1 G2:1 C3:1 F2:1 F2:1 C3:1 F2:1 G2:1 G2:1 D3:1 G2:1 C3:2 G2:2',
    bassWave: 'triangle',
    drums: 'K:1 H:0.5 H:0.5 S:1 H:0.5 H:0.5',
  },
  draw(ctx, t, dt, info) {
    play(ctx, dt, info, SCENES);
  },
};
