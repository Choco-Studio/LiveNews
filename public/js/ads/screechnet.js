// SCREECHNET: dial-up internet for families who miss the suspense.
// "Fast as a fax." Grandma picks up the phone at 99%.
import {
  P, W, H, R, A, rrect, panel, disc, oval, ring, poly, line, dither, bands, sparkle, twinkle, particles, shadow,
  ripples, spr, draw, stroke, cached, text, bigText, para, bubble, finePrint, slogan, play, hero, faceCU, prog, lerp, easeOut,
  easeOutBack, wave, frame, shake, clipRect, starPts, mulberry32, wordmark, drawMark, glint, glow, urlPill, rep, tune,
} from './kit.js';

const DAD = { H: P.brown, h: P.tan, E: P.maroon, T: P.green, t: P.darkGreen, C: P.cream, X: P.green, P: P.slate, p: P.ink };
const MUM = { S: P.tan, s: P.tanShade, H: P.rust, h: P.orange, E: P.brown, T: P.magenta, t: P.purple, C: P.white, X: P.magenta };
const KID = { H: P.yellow, h: P.cream, E: P.tanShade, T: P.red, t: P.darkRed, C: P.red, X: P.red, P: P.navy };
const GRAN = { H: P.silver, h: P.white, E: P.steel, T: P.purple, t: P.ink, C: P.white, X: P.purple, D: P.magenta, d: P.purple, B: P.maroon };

// --- props -------------------------------------------------------------------

const CAT_ROWS = [
  '.O..............O.',
  '.OO............OO.',
  '.OOO..........OOO.',
  '.ONOO........OONO.',
  '.OOOOOOOOOOOOOOOO.',
  'OOOOOoOOOOOOoOOOOO',
  'OOOOOOoOOOOoOOOOOO',
  'OOOGGKOOOOOOGGKOOO',
  'OOOGGKOOOOOOGGKOOO',
  'OOOOOOOOWWOOOOOOOO',
  'OOOOOOOWNNWOOOOOOO',
  'OOOOOOWWWWWWOOOOOO',
  '.OOOOOOWKKWOOOOOO.',
  '..OOOOOOOOOOOOOO..',
  '...OOOOOOOOOOOO...',
  '..OOOOOOOOOOOOOO..',
  '.OOOoOOOOOOOOoOOO.',
  '.OOOoOOOOOOOOoOOO.',
  'OOOOOOOOOOOOOOOOOO',
  'OOWWWOOOOOOOOWWWOO',
];
const swapRows = (rows, map) => rows.map((r, i) => map[i] ?? r);
const CAT = spr(CAT_ROWS, -9, 0);
const CAT_SCARED = spr(swapRows(CAT_ROWS, { 7: 'OOWWWKOOOOOOWWWKOO', 8: 'OOWWWKOOOOOOWWWKOO', 11: 'OOOOOOKKKKKKOOOOOO', 12: '.OOOOOKMMMMKOOOOO.' }), -9, 0);
const CAT_SLEEP = spr(swapRows(CAT_ROWS, { 7: 'OOOOOOOOOOOOOOOOOO', 8: 'OOOKKKOOOOOOKKKOOO' }), -9, 0);
const CAT_PAL = { K: P.black, O: P.orange, o: P.rust, W: P.white, N: P.pink, G: P.green, M: P.maroon };

function cat(ctx, x, gy, mood, lt) {
  const sp = mood === 'scared' ? CAT_SCARED : mood === 'sleep' ? CAT_SLEEP : CAT;
  if (mood === 'scared') {
    const rot = lt * 3;
    poly(ctx, starPts(x, gy - 10, 13, 18, 12, rot), P.black);
    poly(ctx, starPts(x, gy - 10, 13, 17, 11, rot), P.orange);
  }
  const wag = mood === 'sleep' ? 0 : wave(lt, 1.5, 2);
  stroke(ctx, [[x + 7, gy - 2], [x + 14, gy - 4], [x + 15 + wag, gy - 12]], 3, P.orange, P.black);
  draw(ctx, sp, x, gy - 20, CAT_PAL);
}

// Modem body art (cached, 136 x 48); origin = centre-top of the front face.
const MX = 61;
const MY = 15;
const modemArt = () =>
  cached('sn-modem', 136, 48, (c) => {
    const cx = MX;
    const cy = MY;
    poly(c, [[cx - 61, cy - 1], [cx - 49, cy - 15], [cx + 73, cy - 15], [cx + 73, cy + 14], [cx + 60, cy + 29], [cx - 61, cy + 29]], P.black);
    poly(c, [[cx - 60, cy], [cx - 48, cy - 14], [cx + 72, cy - 14], [cx + 60, cy]], P.white);
    poly(c, [[cx + 60, cy], [cx + 72, cy - 14], [cx + 72, cy + 14], [cx + 60, cy + 28]], P.tan);
    R(c, cx - 60, cy, 120, 28, P.cream);
    R(c, cx - 60, cy, 120, 1, P.fog);
    R(c, cx - 60, cy + 27, 120, 1, P.tan);
    R(c, cx - 32, cy - 11, 68, 8, P.navy);
    text(c, 'SCREECHNET', cx + 2, cy - 10, { color: P.yellow, align: 'center' });
    R(c, cx - 55, cy + 5, 74, 8, P.ink);
    text(c, 'DATA/FAX MODEM', cx - 55, cy + 17, { color: P.steel });
    text(c, '56K', cx + 32, cy + 6, { color: P.red });
    for (let x = cx + 46; x < cx + 57; x += 2) R(c, x, cy + 5, 1, 18, P.tan);
    R(c, cx - 56, cy + 29, 8, 2, P.black);
    R(c, cx + 48, cy + 29, 8, 2, P.black);
  });

/** Beige box modem; (cx, cy) = centre-top of the front face. */
function modem(ctx, cx, cy, lt, screech = false, shine = -1) {
  const [sx, sy] = screech ? shake(lt, 2, 7) : [0, 0];
  cx += sx;
  cy += sy;
  ctx.drawImage(modemArt(), cx - MX, cy - MY);
  if (shine >= 0) glint(ctx, modemArt(), cx - MX, cy - MY, shine, { width: 9, alpha: 0.6 });
  const rand = mulberry32(Math.floor(lt * (screech ? 14 : 5)) + 3);
  for (let i = 0; i < 6; i++) {
    const lit = i === 0 || rand() < (screech ? 0.7 : 0.45);
    const col = lit ? (screech ? (rand() < 0.5 ? P.red : P.yellow) : i < 2 ? P.green : P.red) : P.slate;
    R(ctx, cx - 52 + i * 12, cy + 7, 6, 3, col);
    if (lit) R(ctx, cx - 52 + i * 12, cy + 7, 2, 1, P.white);
  }
}

/** Curly phone cord between two points. */
function cord(ctx, x0, y0, x1, y1, c = P.black) {
  const n = Math.max(8, Math.round(Math.hypot(x1 - x0, y1 - y0) / 2));
  for (let i = 0; i <= n; i++) {
    const p = i / n;
    const sag = Math.sin(p * Math.PI) * 10;
    const x = x0 + (x1 - x0) * p;
    const y = y0 + (y1 - y0) * p + sag + (i % 2 ? 2 : -1);
    R(ctx, x, y, 2, 2, c);
  }
}

/** Pixel cat portrait, the photo that takes all day to load (136 x 92). */
const catPhoto = () =>
  cached('sn-catphoto', 136, 92, (c) => {
    bands(c, 0, 0, 136, 92, [P.blue, P.cyan, P.cream]);
    oval(c, 68, 102, 46, 26, P.black);
    oval(c, 68, 102, 45, 25, P.orange);
    for (const s of [-1, 1]) {
      poly(c, [[68 + s * 34, 44], [68 + s * 30, 8], [68 + s * 8, 26]], P.black);
      poly(c, [[68 + s * 32, 42], [68 + s * 29, 11], [68 + s * 11, 27]], P.orange);
      poly(c, [[68 + s * 27, 36], [68 + s * 27, 18], [68 + s * 16, 28]], P.pink);
    }
    disc(c, 68, 52, 33, P.black);
    disc(c, 68, 52, 32, P.orange);
    for (const dx of [-8, 0, 8]) R(c, 68 + dx - 1, 21, 3, 10, P.rust);
    for (const s of [-1, 1]) {
      R(c, 68 + s * 30 - (s > 0 ? 6 : 0), 50, 6, 2, P.rust);
      R(c, 68 + s * 30 - (s > 0 ? 5 : 0), 56, 5, 2, P.rust);
      oval(c, 68 + s * 13, 48, 7, 8, P.black);
      oval(c, 68 + s * 13, 48, 6, 7, P.green);
      R(c, 68 + s * 13 - 1, 42, 3, 13, P.black);
      R(c, 68 + s * 13 - 4, 44, 2, 2, P.white);
      disc(c, 68 + s * 7, 66, 7, P.white);
    }
    poly(c, [[62, 58], [74, 58], [68, 64]], P.pink);
    R(c, 67, 64, 2, 4, P.black);
    R(c, 63, 68, 4, 1, P.black);
    R(c, 69, 68, 4, 1, P.black);
    for (const s of [-1, 1]) {
      line(c, 68 + s * 12, 64, 68 + s * 40, 58, P.white);
      line(c, 68 + s * 12, 67, 68 + s * 42, 67, P.white);
      line(c, 68 + s * 12, 70, 68 + s * 38, 76, P.white);
    }
  });

// --- brand -------------------------------------------------------------------

const MARK = () => wordmark('SCREECHNET', {
  h: 26, pen: 2, square: true, slant: 0.32, wide: 0.85, gap: 2,
  fill: [P.white, P.yellow, P.yellow, P.orange, P.orange, P.rust],
  outline: [[P.black, 2]], depth: 3, depthColor: P.navy,
});

function soundWave(ctx, cx, y, w, lt, col) {
  for (let i = 0; i < w; i++) {
    const x = cx - w / 2 + i;
    const amp = Math.sin((i / w) * Math.PI) * 4;
    const v = Math.round(Math.sin(i * 0.9 - lt * 12) * amp * (0.6 + 0.4 * Math.sin(i * 0.23 + lt * 3)));
    R(ctx, x, y + Math.min(0, v), 1, Math.abs(v) + 1, col);
  }
}

// --- shots -------------------------------------------------------------------

function livingRoom(ctx, cam) {
  R(ctx, 0, 0, W, 146, P.slate);
  dither(ctx, 0, 0, W, 146, P.steel, 'dots');
  const b = Math.round(cam * 0.5);
  R(ctx, 36 + b, 30, 44, 34, P.black);
  R(ctx, 37 + b, 31, 42, 32, P.tan);
  R(ctx, 40 + b, 34, 36, 26, P.navy);
  poly(ctx, [[48 + b, 54], [58 + b, 38], [60 + b, 54]], P.white);
  R(ctx, 44 + b, 54, 28, 3, P.brown);
  R(ctx, 40 + b, 57, 36, 3, P.blue);
  R(ctx, 338 + b, 58, 2, 88, P.black);
  poly(ctx, [[326 + b, 58], [352 + b, 58], [346 + b, 38], [332 + b, 38]], P.yellow);
  R(ctx, 326 + b, 58, 26, 1, P.orange);
  disc(ctx, 339 + b, 64, 22, A(P.yellow, 0.12));
  const s = Math.round(cam * 0.8);
  rrect(ctx, 96 + s, 96, 210, 56, P.black, 3);
  rrect(ctx, 97 + s, 97, 208, 54, P.rust, 3);
  R(ctx, 99 + s, 99, 204, 2, P.orange);
  R(ctx, 166 + s, 100, 1, 40, P.darkRed);
  R(ctx, 236 + s, 100, 1, 40, P.darkRed);
}

function desktopFront(ctx, cam) {
  const x = Math.round(cam);
  R(ctx, 0, 140, W, 76, P.brown);
  R(ctx, 0, 140, W, 2, P.tan);
  R(ctx, 0, 142, W, 1, P.tanShade);
  R(ctx, 140 + x, 146, 100, 14, P.black);
  R(ctx, 141 + x, 147, 98, 12, P.silver);
  for (let y = 149; y < 158; y += 3) for (let xx = 143; xx < 237; xx += 4) R(ctx, xx + x, y, 3, 2, P.white);
  rrect(ctx, 262 + x, 146, 12, 16, P.black, 2);
  rrect(ctx, 263 + x, 147, 10, 14, P.silver, 2);
  R(ctx, 74 + x, 134, 16, 18, P.black);
  R(ctx, 75 + x, 135, 14, 16, P.red);
  R(ctx, 75 + x, 135, 14, 2, P.pink);
  R(ctx, 302 + x, 144, 22, 20, P.yellow);
  for (let y = 148; y < 162; y += 4) R(ctx, 305 + x, y, 16, 1, P.orange);
}

// 1. Establishing: the family, bored by instant pages.
function shotTooFast(ctx, lt) {
  const cam = -lt * 1.2;
  livingRoom(ctx, cam);
  const yawn = lt > 1.4 && lt < 2.8;
  const ox = Math.round(cam * 0.8);
  hero(ctx, 150 + ox, 140, { pal: DAD, glasses: true, eyes: 'sleepy', mouth: lt > 3.4 ? 'o' : 'flat', legs: 'none' });
  hero(ctx, 200 + ox, 140, { pal: MUM, hair: 'bob', eyes: 'sleepy', mouth: 'flat', armL: 'mouth', legs: 'none' });
  hero(ctx, 246 + ox, 140, { pal: KID, hair: 'spiky', small: true, eyes: yawn ? 'closed' : 'sleepy', mouth: yawn ? 'O' : 'flat', armL: yawn ? 'up' : 'down', armR: yawn ? 'up' : 'down', legs: 'none' });
  desktopFront(ctx, cam);
  panel(ctx, 96, 172, 192, 32, P.black, P.steel, 2);
  text(ctx, 'PAGE LOADED IN 0.00001 S', 192, 177, { color: P.green, align: 'center' });
  const n = Math.floor(lt * 7919) + 1024;
  text(ctx, `PAGES VIEWED: ${n.toLocaleString('en-GB')}`, 192, 189, { color: P.white, align: 'center' });
}

// 2. Close-up: Dad, pages flickering in his glasses.
function shotDad(ctx, lt) {
  R(ctx, 0, 0, W, H, P.slate);
  dither(ctx, 0, 0, W, H, P.steel, 'dots');
  rrect(ctx, -10, 150, 404, 80, P.black, 3);
  rrect(ctx, -10, 151, 404, 80, P.rust, 3);
  R(ctx, 0, 153, W, 2, P.orange);
  const asleep = lt > 1.5;
  faceCU(ctx, 192, 112, 44, { pal: DAD, glasses: true, eyes: asleep ? 'closed' : 'sleepy', mouth: asleep ? 'o' : 'flat' });
  const cols = [P.cyan, P.yellow, P.pink, P.green, P.white, P.orange];
  const col = cols[Math.floor(lt * 15) % cols.length];
  for (const sd of [-1, 1]) {
    const x = 192 + sd * 17;
    R(ctx, x - 9, 105, 17, 11, A(P.white, 0.35));
    R(ctx, x - 9, 105, 17, 3, A(col, 0.75));
    for (let k = 0; k < 3; k++) R(ctx, x - 7, 110 + k * 2, 8 + ((k * 5 + Math.floor(lt * 15)) % 6), 1, A(P.black, 0.35));
  }
  if (lt > 0.5) bubble(ctx, 262, 40, 76, 'BORING.', { tail: 'down', tx: 270, scale: 1 });
  if (asleep) text(ctx, 'Z Z Z', 268, 96 - (Math.floor(lt * 3) % 3) * 2, { color: P.white });
}

// 3. Product hero: the modem rises, gleams... and screams.
function shotModem(ctx, lt) {
  const screech = lt > 2.0 && lt < 4.8;
  const flash = screech && Math.floor(lt * 12) % 2;
  bands(ctx, 0, 0, W, 150, flash ? [P.purple, P.magenta] : [P.ink, P.navy, P.blue]);
  if (!screech) glow(ctx, 198, 110, 90, P.cyan, 0.05, 5);
  R(ctx, 0, 150, W, 66, P.brown);
  R(ctx, 0, 150, W, 2, P.tan);
  dither(ctx, 0, 152, W, 64, P.tanShade, 'hlines');
  R(ctx, 30, 120, 16, 20, P.black);
  R(ctx, 31, 121, 14, 18, P.cream);
  R(ctx, 35, 126, 6, 6, P.steel);
  const rise = easeOutBack(prog(lt, 0.1, 0.7), 1.5);
  const my = Math.round(lerp(240, 118, rise));
  cord(ctx, 38, 132, 132, my + 16);
  if (screech) {
    clipRect(ctx, 0, 24, W, 126);
    for (let k = 0; k < 4; k++) {
      const rr = Math.round(((lt * 70 + k * 30) % 120) + 30);
      ring(ctx, 198, my + 10, rr, k % 2 ? P.yellow : P.cyan);
      ring(ctx, 198, my + 10, rr + 1, k % 2 ? P.yellow : P.cyan);
    }
    ctx.restore();
  }
  shadow(ctx, 198, my + 30, 70, 0.4);
  modem(ctx, 192, my, lt, screech, prog(lt, 0.75, 1.35));
  if (!screech && lt > 0.8 && lt < 2.0) {
    sparkle(ctx, 142, my - 12, [0, 1, 2, 3, 2, 1][Math.floor(lt * 10) % 6]);
    sparkle(ctx, 258, my + 4, [0, 1, 2, 3, 2, 1][Math.floor(lt * 10 + 3) % 6]);
    text(ctx, 'INTRODUCING...', 192, 50, { color: P.cyan, align: 'center' });
  }
  const jump = screech ? -Math.round(Math.abs(Math.sin((lt - 2.0) * 5)) * 18) : 0;
  cat(ctx, 318, 150 + jump, screech ? 'scared' : lt > 4.8 ? 'sleep' : 'calm', lt);
  if (screech && lt < 3.4) bigText(ctx, 'MROW!', 340, 112 + jump, { scale: 1, color: P.white, outline: P.black });
  const words = [
    [2.0, 'SKREEEE!', 96, 46, 3, P.yellow],
    [2.5, 'KSSHHHH!', 290, 64, 2, P.cyan],
    [3.0, 'BWONG-BWONG', 112, 84, 2, P.pink],
    [3.5, 'DEE-DOO-DEE-DOO', 280, 34, 1, P.green],
    [3.9, 'KRRRRRK', 214, 98, 2, P.orange],
  ];
  if (screech) {
    for (const [at, str, x, y, sc, col] of words) {
      if (lt < at) continue;
      const [jx, jy] = shake(lt, 1, x);
      bigText(ctx, str, x + jx, y + jy, { scale: sc, color: col, outline: P.black, ow: sc > 1 ? 2 : 1, align: 'center' });
    }
  }
  if (lt > 4.8) text(ctx, 'CONNECTED AT 56,000 BPS', 192, 186, { color: P.green, align: 'center' });
}

// 4. Split screen: the photo loads, the family waits. And waits.
function shotLoading(ctx, lt) {
  R(ctx, 0, 0, W, H, P.ink);
  rrect(ctx, 4, 24, 184, 160, P.black, 3);
  rrect(ctx, 5, 25, 182, 158, P.cream, 3);
  R(ctx, 13, 33, 166, 128, P.black);
  R(ctx, 14, 34, 164, 126, P.navy);
  const p = 0.99 * easeOut(prog(lt, 0.3, 4.4));
  const rows = Math.floor(p * 92);
  if (rows > 0) ctx.drawImage(catPhoto(), 0, 0, 136, rows, 28, 38, 136, rows);
  if (rows < 92) R(ctx, 28, 38 + rows, 136, 1, P.white);
  R(ctx, 28, 136, 136, 1, P.slate);
  text(ctx, 'LOADING CAT PHOTO...', 28, 140, { color: P.white });
  R(ctx, 28, 150, 100, 6, P.slate);
  R(ctx, 28, 150, Math.round(100 * p), 6, P.green);
  text(ctx, `${Math.floor(p * 100)}%`, 164, 150, { color: P.yellow, align: 'right' });
  const left = ['2 MINUTES', '4 HOURS', '3 DAYS', '1 WEEK', '6 MINUTES', '2 YEARS'][frame(lt, 1.6, 6)];
  text(ctx, `TIME LEFT: ${left}`, 96, 168, { color: P.slate, align: 'center' });
  R(ctx, 192, 0, 4, H, P.black);
  R(ctx, 196, 0, 188, 150, P.slate);
  dither(ctx, 196, 0, 188, 150, P.steel, 'dots');
  // calendar + clock
  R(ctx, 336, 28, 34, 36, P.black);
  R(ctx, 337, 29, 32, 34, P.white);
  R(ctx, 337, 29, 32, 9, P.red);
  text(ctx, 'DAY', 353, 30, { color: P.white, align: 'center' });
  bigText(ctx, String(1 + Math.floor(lt * 2.6)), 353, 43, { scale: 2, color: P.black, outline: null, align: 'center' });
  if (Math.floor(lt * 2.6 * 2) % 2) poly(ctx, [[337, 63], [369, 63], [369, 50]], P.silver);
  disc(ctx, 232, 44, 13, P.black);
  disc(ctx, 232, 44, 11, P.white);
  const a = lt * 14;
  for (let i = 1; i <= 9; i++) R(ctx, 232 + Math.round(Math.sin(a) * i), 44 - Math.round(Math.cos(a) * i), 1, 1, P.black);
  for (let i = 1; i <= 6; i++) R(ctx, 232 + Math.round(Math.sin(a / 12) * i), 44 - Math.round(Math.cos(a / 12) * i), 1, 1, P.red);
  const web = prog(lt, 1.5, 4.5);
  if (web > 0) {
    const n = Math.round(web * 22);
    line(ctx, 383, 0, 383 - n, 0, P.silver);
    line(ctx, 383, 0, 383, n, P.silver);
    line(ctx, 383, 0, 383 - n, n, P.silver);
    for (let k = 6; k < n; k += 6) line(ctx, 383 - k, 0, 383, k, P.fog);
  }
  const beard = Math.min(3, Math.floor(lt / 1.2));
  hero(ctx, 232, 154, { pal: DAD, glasses: true, eyes: 'wide', mouth: 'wavy', legs: 'none', beard, look: -1 });
  hero(ctx, 282, 154, { pal: MUM, hair: 'bob', eyes: 'wide', mouth: 'flat', armL: 'mouth', armR: 'mouth', legs: 'none', look: -1 });
  hero(ctx, 330, 154, { pal: KID, hair: 'spiky', small: true, eyes: 'wide', mouth: 'o', legs: 'none', sweat: lt, look: -1 });
  R(ctx, 196, 146, 188, 70, P.brown);
  R(ctx, 196, 146, 188, 2, P.tan);
  text(ctx, 'WAITING...', 290, 172, { color: P.cream, align: 'center' });
  if (Math.floor(lt * 2) % 2) text(ctx, '...STILL WAITING', 290, 186, { color: P.tan, align: 'center' });
}

// 5. Grandma picks up the phone at 99%.
function shotGranny(ctx, lt) {
  R(ctx, 0, 0, 192, H, P.maroon);
  for (let x = 6; x < 192; x += 16) R(ctx, x, 0, 6, 150, P.purple);
  R(ctx, 0, 150, 192, 66, P.brown);
  R(ctx, 0, 150, 192, 2, P.tan);
  R(ctx, 118, 128, 50, 4, P.black);
  R(ctx, 119, 129, 48, 2, P.tanShade);
  R(ctx, 124, 132, 4, 22, P.black);
  R(ctx, 158, 132, 4, 22, P.black);
  rrect(ctx, 128, 116, 30, 13, P.black, 2);
  rrect(ctx, 129, 117, 28, 11, P.cream, 2);
  disc(ctx, 143, 122, 4, P.tan);
  const reach = prog(lt, 0, 0.35);
  const g = hero(ctx, 80, 182, { pal: GRAN, hair: 'bun', glasses: true, legs: 'skirt', eyes: 'open', mouth: lt > 0.5 ? 'open' : 'smile', armR: reach < 1 ? 'down' : 'ear', armL: 'hips', bob: reach < 1 ? 1 : 0 });
  if (reach >= 1) {
    const [hx, hy] = g.handR;
    cord(ctx, hx + 2, hy + 6, 130, 124, P.ink);
    R(ctx, hx - 2, hy - 7, 6, 16, P.black);
    R(ctx, hx - 1, hy - 6, 4, 14, P.cream);
    R(ctx, hx - 1, hy - 6, 4, 3, P.tan);
    R(ctx, hx - 1, hy + 5, 4, 3, P.tan);
  }
  if (lt > 0.25 && lt < 0.9) bigText(ctx, 'CLICK', 150, 100, { scale: 1, color: P.yellow, outline: P.black });
  if (lt > 0.6) bubble(ctx, 14, 30, 120, 'HELLO? WHO KEEPS SCREAMING ON MY PHONE LINE?', { tail: 'down', tx: 70 });
  R(ctx, 192, 0, 4, H, P.black);
  R(ctx, 196, 0, 188, H, P.slate);
  rrect(ctx, 214, 22, 150, 76, P.black, 3);
  rrect(ctx, 215, 23, 148, 74, P.cream, 3);
  R(ctx, 221, 29, 136, 60, P.black);
  const lost = lt > 0.5;
  if (!lost) {
    ctx.drawImage(catPhoto(), 0, 0, 136, 58, 221, 30, 136, 58);
    text(ctx, '99%', 352, 80, { color: P.yellow, align: 'right' });
  } else {
    if (Math.floor(lt * 4) % 2) bigText(ctx, 'NO CARRIER', 289, 46, { scale: 2, color: P.red, outline: null, align: 'center' });
    text(ctx, 'CONNECTION LOST', 289, 70, { color: P.white, align: 'center' });
  }
  const [sx, sy] = lost ? shake(lt, 1, 4) : [0, 0];
  const pose = lost ? 'up' : 'down';
  hero(ctx, 232 + sx, 170 + sy, { pal: DAD, glasses: true, beard: 3, eyes: lost ? 'wide' : 'happy', mouth: lost ? 'O' : 'grin', armL: pose, armR: pose, legs: 'none' });
  hero(ctx, 282 - sx, 170 + sy, { pal: MUM, hair: 'bob', eyes: lost ? 'wide' : 'happy', mouth: lost ? 'O' : 'grin', armL: lost ? 'up' : 'hold', armR: lost ? 'up' : 'hold', legs: 'none' });
  hero(ctx, 330 + sx, 170 - sy, { pal: KID, hair: 'spiky', small: true, eyes: lost ? 'wide' : 'happy', mouth: lost ? 'O' : 'grin', armL: pose, armR: pose, legs: 'none' });
  R(ctx, 196, 168, 188, 48, P.brown);
  R(ctx, 196, 168, 188, 2, P.tan);
  if (lost) bigText(ctx, 'NOOOOO!', 290, 184, { scale: 3, color: P.white, outline: P.black, ow: 2, depth: 2, depthColor: P.red, align: 'center' });
}

// 6. End slate.
function shotSlate(ctx, lt) {
  ripples(ctx, 192, 124, lt * 1.2, 12, [P.navy, P.ink]);
  R(ctx, 0, 140, W, 76, P.brown);
  R(ctx, 0, 140, W, 2, P.tan);
  dither(ctx, 0, 142, W, 74, P.tanShade, 'hlines');
  shadow(ctx, 198, 140, 74, 0.45);
  cord(ctx, 132, 124, 40, 144);
  modem(ctx, 192, 110, lt, false, ((lt + 0.4) % 3.2) / 0.8);
  cat(ctx, 156, 97, 'sleep', lt);
  text(ctx, 'Z', 172, 86 - (Math.floor(lt * 2) % 3) * 2, { color: P.white });
  const mk = MARK();
  const x0 = drawMark(ctx, mk, 192, 26, { reveal: prog(lt, 0.1, 0.9), drop: 36 });
  if (lt > 1.0) glint(ctx, mk.cv, x0 - mk.ox, 26 - mk.oy, ((lt - 1.0) % 3.4) / 0.7, { width: 6 });
  if (lt > 0.9) soundWave(ctx, 192, 62, 200, lt, P.cyan);
  if (lt > 1.1) text(ctx, 'DIAL-UP INTERNET  •  NOW 56K!', 192, 70, { color: P.white, align: 'center', shadow: P.black });
  if (lt > 1.4) slogan(ctx, 'FAST AS A FAX.', 192, 150, lt - 1.4, { scale: 2, bg: P.red, edge: P.darkRed });
  if (lt > 2.0) urlPill(ctx, 'SCREECHNET.BAUD', 192, 178, { bg: P.navy, border: P.yellow, color: P.yellow });
  finePrint(ctx, 'SPEEDS UP TO 56K ON A GOOD TUESDAY. PLEASE ASK GRANDMA TO STAY OFF THE PHONE.', { lt: lt - 2.2 });
}

const SCENES = [
  { at: 0, draw: shotTooFast },
  { at: 5.0, draw: shotDad, wipe: 'iris', wd: 0.4, cx: 150, cy: 120 },
  { at: 7.4, draw: shotModem, wipe: 'bars', wd: 0.45 },
  { at: 12.4, draw: shotLoading, wipe: 'push', wd: 0.5 },
  { at: 17.0, draw: shotGranny, wipe: 'cut' },
  { at: 20.0, draw: shotSlate, wipe: 'dissolve', wd: 0.5 },
];

export default {
  id: 'screechnet',
  brand: 'SCREECHNET',
  duration: 26,
  voice: { gender: 'female', lang: 'en-GB', pitch: 1.0, rate: 1.0 },
  script: [
    { at: 0.6, text: 'Is your internet just too fast? Do you miss the... suspense?' },
    { at: 7.6, text: 'Introducing ScreechNet. Dial-up, the way nature intended.' },
    { at: 12.6, text: 'Enjoy every photo... one... line... at a time.' },
    { at: 20.6, text: 'ScreechNet. Fast as a fax.' },
  ],
  // 120 bpm: lazy intro, modem chaos, ticking wait, then the brand sting
  // resolves on C with the end slate at beat 40 (20 s).
  tune: {
    bpm: 120,
    wave: 'triangle',
    notes: tune(
      'E4:2 G4:2 A4:4 G4:2 E4:2 D4:4',
      rep('A5:0.25 E5:0.25', 8), 'C6:0.5 A5:0.5 F5:0.5 D5:0.5 B4:2',
      'E4:1 R:1 E4:1 R:1 F4:1 R:1 F4:1 R:1 F#4:1 R:1 F#4:1 R:1 G4:1 G#4:1 A4:1 B4:1',
      'E5:0.5 E5:0.5 G5:1 C6:2 R:0.5 G5:0.5 A5:0.5 G5:0.5 E5:0.5 D5:0.5 C5:3 R:2',
    ),
    bass: tune(
      'A2:4 E2:4 F2:4 E2:4',
      rep('A2:0.5', 8), 'D3:2 E3:2',
      'E2:2 E2:2 F2:2 F2:2 F#2:2 F#2:2 G2:2 B2:2',
      'C3:2 G2:2 F2:2 G2:2 C3:2 R:2',
    ),
    bassWave: 'square',
    drums: tune(
      rep('K:2 H:2', 4),
      rep('S:0.25', 16), 'K:1 K:1 S:2',
      rep('H:1', 16),
      'K:1 S:1 K:1 S:1 K:1 S:1 K:1 S:1 K:2 R:2',
    ),
  },
  draw(ctx, t, dt, info) {
    play(ctx, dt, info, SCENES);
  },
};
