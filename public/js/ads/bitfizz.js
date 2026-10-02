// BITFIZZ COLA: a grey office worker drinks a can and his world gets its
// palette back. "Now with 8 bits of flavour!"
import {
  P, W, H, BASE_PAL, R, A, rrect, disc, oval, ring, poly, dither, bands, sparkle, twinkle, particles, shadow,
  sunburst, cached, text, bigText, logo, finePrint, slogan, play, person, prog, lerp, easeOut, easeOutBack,
  wave, frame, shake, clipCircle, clipRect, starPts, cloud, mulberry32,
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

const GUY = { S: P.skin, s: P.skinShade, H: P.brown, h: P.tan, T: P.white, t: P.silver, C: P.white, X: P.red, b: P.ink, P: P.navy, p: P.ink };
const GUY_GREY = greyOf(GUY);
const GUY_X = 200;
const GUY_GY = 128;

// --- static art --------------------------------------------------------------

function paintOffice(c, grey) {
  const g = (x) => (grey ? GREY[x] : x);
  R(c, 0, 0, W, 118, g(P.cream));
  dither(c, 0, 0, W, 118, g(P.yellow), 'dots');
  R(c, 0, 117, W, 5, g(P.brown));
  R(c, 0, 117, W, 1, g(P.tan));
  R(c, 0, 122, W, 26, g(P.tan));
  for (let x = 8; x < W; x += 32) {
    R(c, x, 126, 24, 17, g(P.tanShade));
    R(c, x + 1, 127, 22, 15, g(P.tan));
    R(c, x + 1, 142, 22, 1, g(P.cream));
  }
  R(c, 0, 146, W, 5, g(P.brown));
  R(c, 0, 151, W, 65, g(P.tanShade));
  for (let y = 160, k = 0; y < H; y += 11, k++) {
    R(c, 0, y, W, 1, g(P.brown));
    for (let x = (k % 2) * 37; x < W; x += 74) R(c, x, y + 1, 1, 10, g(P.brown));
  }
  // window
  R(c, 29, 23, 94, 83, P.black);
  R(c, 30, 24, 92, 81, g(P.white));
  bands(c, 34, 28, 84, 73, grey ? [P.slate, P.steel, P.fog] : [P.navy, P.blue, P.cyan]);
  // distant hills + city
  c.save();
  c.beginPath();
  c.rect(34, 28, 84, 73);
  c.clip();
  oval(c, 52, 104, 34, 14, g(P.darkGreen));
  oval(c, 104, 106, 30, 16, g(P.green));
  for (let i = 0; i < 6; i++) R(c, 62 + i * 9, 84 - ((i * 7) % 13), 7, 30, g(i % 2 ? P.steel : P.slate));
  for (let i = 0; i < 6; i++) for (let y = 88 - ((i * 7) % 13); y < 100; y += 4) R(c, 64 + i * 9, y, 1, 2, g(P.yellow));
  c.restore();
  R(c, 75, 28, 2, 73, g(P.white));
  R(c, 34, 63, 84, 2, g(P.white));
  R(c, 25, 105, 102, 4, g(P.white));
  R(c, 25, 109, 102, 1, g(P.fog));
  R(c, 25, 104, 102, 1, P.black);
  // framed picture
  R(c, 145, 31, 50, 40, P.black);
  R(c, 146, 32, 48, 38, g(P.brown));
  R(c, 149, 35, 42, 32, g(P.cyan));
  poly(c, [[149, 67], [163, 45], [172, 56], [179, 48], [191, 67]], g(P.darkGreen));
  poly(c, [[160, 50], [163, 45], [166, 50]], g(P.white));
  disc(c, 183, 42, 3, g(P.yellow));
  // clock
  disc(c, 318, 52, 13, P.black);
  disc(c, 318, 52, 12, g(P.red));
  disc(c, 318, 52, 10, g(P.white));
  for (const [dx, dy] of [[0, -9], [9, 0], [0, 9], [-9, 0]]) R(c, 318 + dx - (dx ? 0 : 0), 52 + dy, 1, 1, P.black);
  // chair back
  rrect(c, 185, 99, 30, 26, P.black, 3);
  rrect(c, 186, 100, 28, 24, g(P.red), 2);
  R(c, 188, 101, 3, 21, g(P.pink));
}

function paintDesk(c, grey) {
  const g = (x) => (grey ? GREY[x] : x);
  // monitor
  R(c, 249, 79, 52, 39, P.black);
  R(c, 250, 80, 50, 37, g(P.cream));
  R(c, 295, 80, 5, 37, g(P.tan));
  R(c, 250, 80, 50, 1, g(P.white));
  R(c, 254, 83, 40, 28, P.black);
  R(c, 284, 112, 8, 2, g(P.green));
  R(c, 266, 117, 18, 5, P.black);
  R(c, 267, 117, 16, 4, g(P.tan));
  // desk top + front
  R(c, 134, 120, 214, 1, P.black);
  R(c, 134, 121, 214, 5, g(P.tan));
  R(c, 134, 121, 214, 1, g(P.cream));
  R(c, 134, 126, 214, 1, P.black);
  R(c, 138, 127, 206, 45, P.black);
  R(c, 139, 127, 204, 44, g(P.brown));
  R(c, 139, 127, 204, 2, g(P.maroon));
  R(c, 290, 134, 46, 15, P.black);
  R(c, 291, 135, 44, 13, g(P.tanShade));
  R(c, 309, 140, 8, 2, g(P.yellow));
  R(c, 290, 152, 46, 15, P.black);
  R(c, 291, 153, 44, 13, g(P.tanShade));
  R(c, 309, 158, 8, 2, g(P.yellow));
  R(c, 139, 170, 204, 1, P.black);
  R(c, 138, 172, 206, 3, A(P.black, 0.3));
  // keyboard + mug
  R(c, 180, 117, 42, 5, P.black);
  R(c, 181, 118, 40, 3, g(P.silver));
  for (let x = 183; x < 219; x += 3) R(c, x, 118, 2, 1, g(P.white));
  R(c, 152, 109, 12, 12, P.black);
  R(c, 153, 110, 10, 10, g(P.blue));
  R(c, 163, 112, 3, 6, P.black);
  R(c, 163, 113, 2, 4, g(P.blue));
  R(c, 154, 110, 8, 1, g(P.cyan));
}

const office = (grey) => cached(`bf-office-${grey}`, W, H, (c) => paintOffice(c, grey));
const desk = (grey) => cached(`bf-desk-${grey}`, W, H, (c) => paintDesk(c, grey));

/** The big can, 48 x 78 including outline. */
const CAN_W = 50;
const CAN_H = 80;
const bigCan = () =>
  cached('bf-can', CAN_W, CAN_H, (c) => {
    // silhouette
    R(c, 3, 0, 44, 80, P.black);
    R(c, 1, 3, 48, 74, P.black);
    R(c, 2, 1, 46, 78, P.black);
    // body columns: dark edge, red, highlight, red, shade
    const cols = [[2, 1, P.maroon], [3, 2, P.darkRed], [5, 4, P.red], [9, 3, P.pink], [12, 1, P.white], [13, 22, P.red], [35, 7, P.darkRed], [42, 4, P.maroon], [46, 2, P.black]];
    for (const [x, w, col] of cols) R(c, x, 8, w, 64, col);
    // top rim + lid
    R(c, 4, 1, 42, 1, P.fog);
    R(c, 2, 2, 46, 5, P.silver);
    R(c, 3, 3, 44, 2, P.fog);
    R(c, 6, 3, 38, 2, P.steel);
    R(c, 2, 6, 46, 1, P.steel);
    R(c, 2, 7, 46, 1, P.black);
    R(c, 5, 2, 10, 1, P.white);
    // tab
    R(c, 21, 2, 9, 3, P.silver);
    R(c, 23, 3, 5, 1, P.steel);
    // bottom
    R(c, 2, 72, 46, 1, P.black);
    R(c, 2, 73, 46, 4, P.silver);
    R(c, 3, 75, 44, 2, P.fog);
    R(c, 5, 77, 40, 2, P.steel);
    // label: pixel wave band
    for (let x = 2; x < 48; x++) {
      const yy = 16 + ((x >> 2) % 2);
      R(c, x, yy, 1, 3, P.white);
      R(c, x, yy + 3, 1, 1, P.cream);
    }
    bigText(c, 'BIT', 25, 30, { scale: 2, color: P.white, outline: P.maroon, align: 'center' });
    bigText(c, 'FIZZ', 25, 48, { scale: 2, color: P.yellow, outline: P.maroon, align: 'center' });
    text(c, 'COLA', 25, 63, { color: P.white, align: 'center' });
    // condensation
    const rand = mulberry32(5);
    for (let i = 0; i < 26; i++) {
      const x = 4 + Math.floor(rand() * 40);
      const y = 10 + Math.floor(rand() * 60);
      if (y > 26 && y < 58 && x > 8 && x < 42) continue;
      R(c, x, y, 1, 1, rand() < 0.5 ? P.white : P.pink);
      if (rand() < 0.3) R(c, x, y + 1, 1, 1, P.pink);
    }
  });

/** Small can held in a hand, 9 x 13. */
const miniCan = () =>
  cached('bf-mini', 9, 13, (c) => {
    R(c, 0, 0, 9, 13, P.black);
    R(c, 1, 1, 7, 2, P.silver);
    R(c, 1, 3, 7, 9, P.red);
    R(c, 2, 3, 1, 9, P.pink);
    R(c, 6, 3, 1, 9, P.darkRed);
    R(c, 1, 6, 7, 2, P.white);
    R(c, 1, 11, 7, 1, P.silver);
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
  const cols = [P.red, P.orange, P.yellow, P.green, P.blue, P.purple];
  cols.forEach((c, i) => {
    ring(ctx, cx, cy, r - i * 2, c);
    ring(ctx, cx, cy, r - i * 2 - 1, c);
  });
  ctx.restore();
}

function plant(ctx, grey, lt) {
  const g = (x) => (grey ? GREY[x] : x);
  const x = 362;
  R(ctx, x - 9, 131, 18, 19, P.black);
  R(ctx, x - 8, 132, 16, 17, g(P.rust));
  R(ctx, x - 8, 132, 16, 3, g(P.orange));
  if (grey) {
    // droopy leaves
    poly(ctx, [[x - 1, 132], [x - 14, 124], [x - 16, 132]], P.slate);
    poly(ctx, [[x + 1, 132], [x + 13, 122], [x + 16, 131]], P.steel);
    R(ctx, x - 1, 120, 2, 12, P.slate);
    poly(ctx, [[x, 120], [x - 8, 117], [x - 9, 124]], P.steel);
  } else {
    const sw = wave(lt, 1.2, 1);
    poly(ctx, [[x - 1, 132], [x - 12 + sw, 108], [x - 4, 112]], P.darkGreen);
    poly(ctx, [[x + 1, 132], [x + 12 + sw, 106], [x + 5, 112]], P.green);
    poly(ctx, [[x, 132], [x - 2 + sw, 96], [x + 3, 110]], P.green);
    disc(ctx, x - 2 + sw, 94, 4, P.pink);
    disc(ctx, x - 2 + sw, 94, 1, P.yellow);
  }
}

function screenContent(ctx, grey, lt) {
  if (grey) {
    R(ctx, 255, 84, 38, 26, P.slate);
    for (let y = 87; y < 108; y += 4) R(ctx, 257, y, 34, 1, P.steel);
    for (let x = 265; x < 292; x += 9) R(ctx, x, 86, 1, 22, P.steel);
    if (Math.floor(lt * 2) % 2) R(ctx, 258, 100, 4, 2, P.silver);
  } else {
    R(ctx, 255, 84, 38, 26, P.navy);
    const pts = [0, 3, 2, 6, 5, 10, 9, 14, 13, 18];
    for (let i = 0; i < pts.length; i++) R(ctx, 258 + i * 3, 104 - pts[i], 3, pts[i] + 2, BIT_COLS[i % 8]);
    sparkle(ctx, 289, 88, twinkle(lt, 0), P.white);
  }
}

function clockHand(ctx, lt, grey) {
  const a = lt * (grey ? 0.15 : 2.2);
  const x = 318;
  const y = 52;
  for (let i = 1; i <= 8; i++) R(ctx, x + Math.round(Math.sin(a) * i), y - Math.round(Math.cos(a) * i), 1, 1, P.black);
  for (let i = 1; i <= 5; i++) R(ctx, x + Math.round(Math.sin(a / 12 + 2) * i), y - Math.round(Math.cos(a / 12 + 2) * i), 1, 1, P.black);
}

function officeFrame(ctx, lt, grey) {
  ctx.drawImage(office(grey), 0, 0);
  if (grey) {
    clipRect(ctx, 34, 28, 84, 73);
    particles(ctx, lt, { seed: 3, n: 26, x: 34, y: 28, w: 84, h: 73, vy: 140, vx: -20, colors: [P.silver, P.fog], len: 3 });
    ctx.restore();
  } else {
    clipRect(ctx, 34, 28, 84, 73);
    disc(ctx, 52, 44, 7, P.yellow);
    disc(ctx, 52, 44, 5, P.white);
    cloud(ctx, 40 + ((lt * 8) % 120) - 20, 40, 8, P.white);
    ctx.restore();
  }
  plant(ctx, grey, lt);
  clockHand(ctx, lt, grey);
}

// --- scenes ------------------------------------------------------------------

function sceneGrey(ctx, lt) {
  officeFrame(ctx, lt, true);
  const look = lt > 2.2 ? 0 : 1;
  person(ctx, GUY_X, GUY_GY, { pal: GUY_GREY, eyes: lt > 2.2 && lt < 2.5 ? 'closed' : 'sleepy', mouth: 'frown', look, bob: Math.floor(lt / 1.6) % 2 });
  ctx.drawImage(desk(true), 0, 0);
  screenContent(ctx, true, lt);
  // personal rain cloud
  const cy = 66 + wave(lt, 0.5, 1);
  particles(ctx, lt, { seed: 9, n: 7, x: 186, y: cy + 4, w: 28, h: 24, vy: 70, colors: [P.steel], len: 3 });
  cloud(ctx, GUY_X, cy, 12, P.slate, P.ink);
  osd(ctx, 'COLOUR', 0, '0%', lt);
}

function sceneCan(ctx, lt) {
  bands(ctx, 0, 0, W, 152, [P.black, P.ink]);
  R(ctx, 0, 152, W, 64, P.black);
  // spotlight cone
  for (let i = 0; i < 3; i++) poly(ctx, [[192 - 14 - i * 8, 0], [192 + 14 + i * 8, 0], [192 + 46 + i * 12, 160], [192 - 46 - i * 12, 160]], A(P.white, 0.05));
  oval(ctx, 192, 160, 50, 8, P.slate);
  oval(ctx, 192, 160, 40, 6, P.steel);
  const rise = easeOutBack(prog(lt, 0.1, 0.8), 1.4);
  const [sx, sy] = lt > 1.3 && lt < 1.7 ? shake(lt, 1) : [0, 0];
  const y = Math.round(lerp(230, 82, rise));
  shadow(ctx, 192, 160, 26, 0.5);
  ctx.drawImage(bigCan(), 167 + sx, y + sy);
  // frosty vapour
  if (lt > 0.8) particles(ctx, lt, { seed: 4, n: 10, x: 150, y: 70, w: 84, h: 90, vy: -6, sway: 3, colors: [A(P.white, 0.5)], size: 2 });
  // pop!
  if (lt > 1.4) {
    const p = easeOutBack(prog(lt, 1.4, 1.7), 2);
    const yy = Math.round(56 - p * 10);
    bigText(ctx, 'PSSHT!', 290, yy, { scale: 3, color: P.white, outline: P.black, ow: 2, depth: 2, depthColor: P.steel, align: 'center' });
    for (let i = 0; i < 3; i++) R(ctx, 232 + i * 6, 70 + i * 3, 6 + i * 2, 1, P.silver);
    // binary fizz stream
    const N = 18;
    const period = 2.2;
    for (let i = 0; i < N; i++) {
      const age = (lt - 1.4 - (i * period) / N + period) % period;
      if (lt - 1.4 < (i * period) / N) continue;
      const yy2 = 80 - age * 52;
      const xx = 192 + Math.sin(age * 4 + i) * (4 + age * 7) + ((i * 37) % 13) - 6;
      text(ctx, i % 3 ? '1' : '0', xx, yy2, { color: [P.cyan, P.white, P.yellow][i % 3] });
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
  const draw = (grey) => {
    officeFrame(ctx, lt, grey);
    if (!grey) rainbow(ctx, GUY_X, 104, 36 + Math.round(easeOut(prog(lt, 1.6, 2.2)) * 0));
  };
  draw(true);
  if (swap > 0) {
    clipCircle(ctx, GUY_X, 104, swap * swap * 330);
    draw(false);
    ctx.restore();
  }
  const grey = swap < 0.2;
  const pal = grey ? GUY_GREY : GUY;
  // orbiting bits (back half first)
  const nBits = party ? Math.min(8, Math.floor(prog(lt, 1.8, 3.4) * 8.99)) : 0;
  const bit = (i, front) => {
    const a = lt * 2.2 + (i / 8) * Math.PI * 2;
    if (Math.sin(a) > 0 !== front) return;
    bitCube(ctx, GUY_X - 5 + Math.round(Math.cos(a) * 58), 100 + Math.round(Math.sin(a) * 12) - wave(lt + i * 0.1, 1.5, 2), i);
  };
  for (let i = 0; i < nBits; i++) bit(i, false);
  const hop = party ? -Math.round(Math.abs(Math.sin(lt * Math.PI * 2.4)) * 5) : 0;
  const top = person(ctx, GUY_X, GUY_GY, {
    pal,
    eyes: drinking ? 'closed' : 'happy',
    mouth: drinking ? 'flat' : 'grin',
    armL: drinking ? 'hold' : 'up',
    armR: drinking ? 'hold' : 'up',
    blush: party,
    bob: hop,
  });
  if (drinking) ctx.drawImage(miniCan(), GUY_X - 4, top + 7);
  else ctx.drawImage(miniCan(), GUY_X - 16, top + 1);
  if (drinking && lt > 0.3) text(ctx, Math.floor(lt * 4) % 2 ? 'GLUG' : 'GLUG!', GUY_X + 14, top + 2, { color: P.black });
  ctx.drawImage(desk(grey), 0, 0);
  screenContent(ctx, grey, lt);
  for (let i = 0; i < nBits; i++) bit(i, true);
  if (grey && lt < 1.0) {
    const cy = 66;
    particles(ctx, lt, { seed: 9, n: 7, x: 186, y: cy + 4, w: 28, h: 24, vy: 70, colors: [P.steel], len: 3 });
    cloud(ctx, GUY_X, cy, 12, P.slate, P.ink);
  }
  if (party) particles(ctx, lt, { seed: 21, n: 40, vy: 40, sway: 4, colors: BIT_COLS, size: 2 });
  osd(ctx, party ? 'FLAVOUR' : 'COLOUR', nBits, nBits >= 8 ? '8 BITS!' : party ? `${nBits} BIT${nBits === 1 ? '' : 'S'}` : '0%', lt);
  // 256 sticker
  if (lt > 4.3) {
    const p = easeOutBack(prog(lt, 4.3, 4.7), 2.5);
    const rr = Math.round(30 * p);
    const rot = lt * 0.6;
    poly(ctx, starPts(318, 66, 14, rr + 2, Math.round(rr * 0.78) + 2, rot), P.black);
    poly(ctx, starPts(318, 66, 14, rr, Math.round(rr * 0.78), rot), P.yellow);
    if (p > 0.8) {
      bigText(ctx, '256', 318, 54, { scale: 3, color: P.red, outline: P.white, align: 'center' });
      text(ctx, 'TASTES!', 318, 79, { color: P.black, align: 'center' });
    }
  }
}

function scenePack(ctx, lt) {
  sunburst(ctx, 96, 112, lt * 0.04, 12, P.red, P.darkRed);
  // binary bubbles behind the can
  for (let i = 0; i < 16; i++) {
    const period = 3;
    const age = (lt + (i * period) / 16) % period;
    const x = 96 + Math.sin(age * 3 + i * 1.7) * (8 + age * 9) + ((i * 29) % 30) - 15;
    text(ctx, i % 3 ? '1' : '0', x, 140 - age * 45, { color: i % 2 ? P.pink : P.white });
  }
  oval(ctx, 96, 152, 40, 7, P.maroon);
  oval(ctx, 96, 151, 38, 5, P.black);
  const bob = wave(lt, 0.5, 2);
  shadow(ctx, 96, 151, 24, 0.5);
  ctx.drawImage(bigCan(), 71, 70 + bob);
  sparkle(ctx, 84, 96 + bob, twinkle(lt, 0.1), P.white);
  sparkle(ctx, 110, 128 + bob, twinkle(lt, 0.45), P.white);
  // 8-bit badge
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
  if (lt > 1.3) text(ctx, 'NOW IN ORIGINAL AND DIET (4-BIT)', 272, 118, { color: P.cream, shadow: P.black, align: 'center' });
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
