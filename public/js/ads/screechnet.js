// SCREECHNET: dial-up internet for families who miss the suspense.
// "Fast as a fax." Grandma picks up the phone at 99%.
import {
  P, W, H, R, A, rrect, panel, disc, oval, ring, poly, line, dither, bands, sparkle, twinkle, particles, shadow,
  ripples, spr, draw, stroke, cached, text, bigText, para, bubble, logo, finePrint, slogan, play, hero, prog, lerp, easeOut,
  easeOutBack, wave, frame, shake, clipRect, starPts, mulberry32,
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

/** Beige box modem; (cx, cy) = centre-top of the front face. */
function modem(ctx, cx, cy, lt, screech = false) {
  const [sx, sy] = screech ? shake(lt, 2, 7) : [0, 0];
  cx += sx;
  cy += sy;
  poly(ctx, [[cx - 61, cy - 1], [cx - 49, cy - 15], [cx + 73, cy - 15], [cx + 73, cy + 14], [cx + 60, cy + 29], [cx - 61, cy + 29]], P.black);
  poly(ctx, [[cx - 60, cy], [cx - 48, cy - 14], [cx + 72, cy - 14], [cx + 60, cy]], P.white);
  poly(ctx, [[cx + 60, cy], [cx + 72, cy - 14], [cx + 72, cy + 14], [cx + 60, cy + 28]], P.tan);
  R(ctx, cx - 60, cy, 120, 28, P.cream);
  R(ctx, cx - 60, cy, 120, 1, P.fog);
  R(ctx, cx - 60, cy + 27, 120, 1, P.tan);
  // label plate on top
  R(ctx, cx - 30, cy - 10, 66, 7, P.navy);
  text(ctx, 'SCREECHNET', cx + 3, cy - 10, { color: P.yellow, align: 'center' });
  // LEDs
  R(ctx, cx - 55, cy + 5, 74, 8, P.ink);
  const rand = mulberry32(Math.floor(lt * (screech ? 14 : 5)) + 3);
  for (let i = 0; i < 6; i++) {
    const lit = i === 0 || rand() < (screech ? 0.7 : 0.45);
    const col = lit ? (screech ? (rand() < 0.5 ? P.red : P.yellow) : i < 2 ? P.green : P.red) : P.slate;
    R(ctx, cx - 52 + i * 12, cy + 7, 6, 3, col);
    if (lit) R(ctx, cx - 52 + i * 12, cy + 7, 2, 1, P.white);
  }
  text(ctx, 'DATA/FAX MODEM', cx - 55, cy + 17, { color: P.steel });
  text(ctx, '56K', cx + 32, cy + 6, { color: P.red, scale: 1 });
  for (let x = cx + 46; x < cx + 57; x += 2) R(ctx, x, cy + 5, 1, 18, P.tan);
  R(ctx, cx - 56, cy + 29, 8, 2, P.black);
  R(ctx, cx + 48, cy + 29, 8, 2, P.black);
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

// --- scenes ------------------------------------------------------------------

function livingRoom(ctx) {
  R(ctx, 0, 0, W, 150, P.slate);
  dither(ctx, 0, 0, W, 150, P.steel, 'dots');
  // picture
  R(ctx, 36, 36, 44, 34, P.black);
  R(ctx, 37, 37, 42, 32, P.tan);
  R(ctx, 40, 40, 36, 26, P.navy);
  poly(ctx, [[48, 60], [58, 44], [60, 60]], P.white);
  R(ctx, 44, 60, 28, 3, P.brown);
  R(ctx, 40, 63, 36, 3, P.blue);
  // lamp
  R(ctx, 338, 64, 2, 86, P.black);
  poly(ctx, [[326, 64], [352, 64], [346, 44], [332, 44]], P.yellow);
  R(ctx, 326, 64, 26, 1, P.orange);
  disc(ctx, 339, 70, 22, A(P.yellow, 0.12));
  // sofa
  rrect(ctx, 96, 104, 210, 56, P.black, 3);
  rrect(ctx, 97, 105, 208, 54, P.rust, 3);
  R(ctx, 99, 107, 204, 2, P.orange);
  R(ctx, 166, 108, 1, 40, P.darkRed);
  R(ctx, 236, 108, 1, 40, P.darkRed);
}

function desktopFront(ctx, lt) {
  R(ctx, 0, 146, W, 70, P.brown);
  R(ctx, 0, 146, W, 2, P.tan);
  R(ctx, 0, 148, W, 1, P.tanShade);
  // keyboard (seen from behind the screen)
  R(ctx, 140, 152, 100, 14, P.black);
  R(ctx, 141, 153, 98, 12, P.silver);
  for (let y = 155; y < 164; y += 3) for (let x = 143; x < 237; x += 4) R(ctx, x, y, 3, 2, P.white);
  // mouse + mug + notes
  rrect(ctx, 262, 152, 12, 16, P.black, 2);
  rrect(ctx, 263, 153, 10, 14, P.silver, 2);
  R(ctx, 74, 140, 16, 18, P.black);
  R(ctx, 75, 141, 14, 16, P.red);
  R(ctx, 75, 141, 14, 2, P.pink);
  R(ctx, 302, 150, 22, 20, P.yellow);
  for (let y = 154; y < 168; y += 4) R(ctx, 305, y, 16, 1, P.orange);
}

function sceneTooFast(ctx, lt) {
  livingRoom(ctx);
  const yawn = lt > 1.4 && lt < 2.8;
  hero(ctx, 150, 146, { pal: DAD, glasses: true, eyes: 'sleepy', mouth: lt > 3.4 ? 'o' : 'flat', legs: 'none', look: 0 });
  hero(ctx, 200, 146, { pal: MUM, hair: 'bob', eyes: 'sleepy', mouth: 'flat', armL: 'mouth', legs: 'none' });
  hero(ctx, 246, 146, { pal: KID, hair: 'spiky', small: true, eyes: yawn ? 'closed' : 'sleepy', mouth: yawn ? 'O' : 'flat', armL: yawn ? 'up' : 'down', armR: yawn ? 'up' : 'down', legs: 'none' });
  // flicker of pages loading instantly
  const cols = [P.cyan, P.white, P.yellow, P.pink, P.green];
  R(ctx, 100, 70, 190, 76, A(cols[frame(lt, 14, cols.length)], 0.16));
  desktopFront(ctx, lt);
  if (lt > 3.4) bubble(ctx, 104, 66, 56, 'BORING.', { tail: 'down', tx: 140 });
  panel(ctx, 96, 174, 192, 32, P.black, P.steel, 2);
  text(ctx, 'PAGE LOADED IN 0.00001 S', 192, 179, { color: P.green, align: 'center' });
  const n = Math.floor(lt * 7919) + 1024;
  text(ctx, `PAGES VIEWED: ${n.toLocaleString('en-GB')}`, 192, 191, { color: P.white, align: 'center' });
}

function sceneModem(ctx, lt) {
  const screech = lt > 2.2 && lt < 5.2;
  const flash = screech && Math.floor(lt * 12) % 2;
  bands(ctx, 0, 0, W, 150, flash ? [P.purple, P.magenta] : [P.ink, P.navy, P.blue]);
  R(ctx, 0, 150, W, 66, P.brown);
  R(ctx, 0, 150, W, 2, P.tan);
  dither(ctx, 0, 152, W, 64, P.tanShade, 'hlines');
  // wall socket + cord
  R(ctx, 30, 120, 16, 20, P.black);
  R(ctx, 31, 121, 14, 18, P.cream);
  R(ctx, 35, 126, 6, 6, P.steel);
  const rise = easeOutBack(prog(lt, 0.1, 0.7), 1.5);
  const my = Math.round(lerp(240, 118, rise));
  cord(ctx, 38, 132, 132, my + 16);
  if (screech) {
    for (let k = 0; k < 4; k++) {
      const rr = Math.round(((lt * 70 + k * 30) % 120) + 30);
      clipRect(ctx, 0, 0, W, 150);
      ring(ctx, 198, my + 10, rr, k % 2 ? P.yellow : P.cyan);
      ring(ctx, 198, my + 10, rr + 1, k % 2 ? P.yellow : P.cyan);
      ctx.restore();
    }
  }
  shadow(ctx, 198, my + 30, 70, 0.4);
  modem(ctx, 192, my, lt, screech);
  // the cat
  const jump = screech ? -Math.round(Math.abs(Math.sin((lt - 2.2) * 5)) * 18) : 0;
  cat(ctx, 318, 150 + jump, screech ? 'scared' : lt > 5.2 ? 'sleep' : 'calm', lt);
  if (screech && lt < 3.6) bigText(ctx, 'MROW!', 340, 112 + jump, { scale: 1, color: P.white, outline: P.black });
  if (!screech && lt > 5.2) text(ctx, 'ZZZ', 334, 118 - (Math.floor(lt * 2) % 3) * 2, { color: P.white });
  // screech lettering
  const words = [
    [2.2, 'SKREEEE!', 96, 46, 3, P.yellow],
    [2.7, 'KSSHHHH!', 290, 64, 2, P.cyan],
    [3.2, 'BWONG-BWONG', 112, 84, 2, P.pink],
    [3.7, 'DEE-DOO-DEE-DOO', 280, 34, 1, P.green],
    [4.1, 'KRRRRRK', 214, 98, 2, P.orange],
  ];
  if (screech) {
    for (const [at, s, x, y, sc, col] of words) {
      if (lt < at) continue;
      const [jx, jy] = shake(lt, 1, x);
      bigText(ctx, s, x + jx, y + jy, { scale: sc, color: col, outline: P.black, ow: sc > 1 ? 2 : 1, align: 'center' });
    }
  }
}

function sceneLoading(ctx, lt) {
  R(ctx, 0, 0, W, H, P.ink);
  // left: the monitor
  rrect(ctx, 4, 24, 184, 160, P.black, 3);
  rrect(ctx, 5, 25, 182, 158, P.cream, 3);
  R(ctx, 13, 33, 166, 128, P.black);
  R(ctx, 14, 34, 164, 126, P.navy);
  const p = 0.99 * easeOut(prog(lt, 0.3, 4.6));
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
  rrect(ctx, 80, 183, 32, 8, P.black, 1);
  R(ctx, 81, 183, 30, 7, P.tan);
  // divider
  R(ctx, 192, 0, 4, H, P.black);
  // right: the family, waiting
  R(ctx, 196, 0, 188, 150, P.slate);
  dither(ctx, 196, 0, 188, 150, P.steel, 'dots');
  // calendar
  R(ctx, 336, 28, 34, 36, P.black);
  R(ctx, 337, 29, 32, 34, P.white);
  R(ctx, 337, 29, 32, 9, P.red);
  text(ctx, 'DAY', 353, 30, { color: P.white, align: 'center' });
  bigText(ctx, String(1 + Math.floor(lt * 2.6)), 353, 43, { scale: 2, color: P.black, outline: null, align: 'center' });
  if (Math.floor(lt * 2.6 * 2) % 2) poly(ctx, [[337, 63], [369, 63], [369, 50]], P.silver);
  // cobweb grows in the corner
  const web = prog(lt, 1.5, 4.5);
  if (web > 0) {
    const n = Math.round(web * 22);
    line(ctx, 383, 0, 383 - n, 0, P.silver);
    line(ctx, 383, 0, 383, n, P.silver);
    line(ctx, 383, 0, 383 - n, n, P.silver);
    for (let k = 6; k < n; k += 6) line(ctx, 383 - k, 0, 383, k, P.fog);
  }
  const beard = Math.min(3, Math.floor(lt / 1.3));
  hero(ctx, 232, 160, { pal: DAD, glasses: true, eyes: 'wide', mouth: 'wavy', legs: 'none', beard, look: -1 });
  hero(ctx, 282, 160, { pal: MUM, hair: 'bob', eyes: 'wide', mouth: 'flat', armL: 'mouth', armR: 'mouth', legs: 'none', look: -1 });
  hero(ctx, 330, 160, { pal: KID, hair: 'spiky', small: true, eyes: 'wide', mouth: 'o', legs: 'none', sweat: lt, look: -1 });
  R(ctx, 196, 150, 188, 66, P.brown);
  R(ctx, 196, 150, 188, 2, P.tan);
  text(ctx, 'WAITING...', 290, 186, { color: P.cream, align: 'center' });
  if (Math.floor(lt * 2) % 2) text(ctx, '...STILL WAITING', 290, 198, { color: P.tan, align: 'center' });
}

function sceneGranny(ctx, lt) {
  // left: the hallway
  R(ctx, 0, 0, 192, H, P.maroon);
  for (let x = 6; x < 192; x += 16) R(ctx, x, 0, 6, 150, P.purple);
  R(ctx, 0, 150, 192, 66, P.brown);
  R(ctx, 0, 150, 192, 2, P.tan);
  // phone table + phone base
  R(ctx, 118, 128, 50, 4, P.black);
  R(ctx, 119, 129, 48, 2, P.tanShade);
  R(ctx, 124, 132, 4, 22, P.black);
  R(ctx, 158, 132, 4, 22, P.black);
  rrect(ctx, 128, 116, 30, 13, P.black, 2);
  rrect(ctx, 129, 117, 28, 11, P.cream, 2);
  disc(ctx, 143, 122, 4, P.tan);
  const reach = prog(lt, 0, 0.35);
  const g = hero(ctx, 80, 182, { pal: GRAN, hair: 'bun', glasses: true, legs: 'skirt', eyes: 'open', mouth: lt > 0.5 ? 'open' : 'smile', armR: reach < 1 ? 'down' : 'ear', armL: 'hips' });
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
  // divider
  R(ctx, 192, 0, 4, H, P.black);
  // right: the family
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

function scenePack(ctx, lt) {
  ripples(ctx, 192, 128, lt * 1.2, 12, [P.navy, P.ink]);
  R(ctx, 0, 146, W, 70, P.brown);
  R(ctx, 0, 146, W, 2, P.tan);
  dither(ctx, 0, 148, W, 68, P.tanShade, 'hlines');
  shadow(ctx, 198, 146, 74, 0.45);
  modem(ctx, 192, 116, lt, false);
  // cat asleep on the warm modem
  cat(ctx, 236, 103, 'sleep', lt);
  text(ctx, 'Z', 252, 76 - (Math.floor(lt * 2) % 3) * 3, { color: P.white });
  cord(ctx, 132, 132, 40, 150);
  logo(ctx, 'SCREECHNET', 192, 30, lt - 0.1, { scale: 4, color: P.yellow, depth: 3, depthColor: P.rust });
  if (lt > 1.0) text(ctx, 'DIAL-UP INTERNET  •  NOW 56K!', 192, 72, { color: P.white, align: 'center', shadow: P.black });
  if (lt > 1.4) slogan(ctx, 'FAST AS A FAX.', 192, 160, lt - 1.4, { scale: 2, bg: P.red, edge: P.darkRed });
  finePrint(ctx, 'SPEEDS UP TO 56K ON A GOOD TUESDAY. PLEASE ASK GRANDMA TO STAY OFF THE PHONE.', { lt: lt - 1.8 });
}

const SCENES = [
  { at: 0, draw: sceneTooFast },
  { at: 5.4, draw: sceneModem, wipe: 'bars', wd: 0.45 },
  { at: 10.9, draw: sceneLoading, wipe: 'push', wd: 0.5 },
  { at: 15.6, draw: sceneGranny, wipe: 'cut' },
  { at: 19.2, draw: scenePack, wipe: 'dissolve', wd: 0.5 },
];

export default {
  id: 'screechnet',
  brand: 'SCREECHNET',
  duration: 24,
  voice: { gender: 'female', lang: 'en-GB', pitch: 1.0, rate: 1.0 },
  script: [
    { at: 0.6, text: 'Is your internet just too fast? Do you miss the... suspense?' },
    { at: 5.8, text: 'Introducing ScreechNet. Dial-up, the way nature intended!' },
    { at: 11.0, text: 'Watch every photo arrive... one... line... at a time.' },
    { at: 19.6, text: 'ScreechNet. Fast as a fax.' },
  ],
  tune: {
    bpm: 116,
    wave: 'triangle',
    notes: 'E5:0.5 G5:0.5 B5:1 A5:0.5 G5:0.5 E5:1 D5:0.5 E5:0.5 G5:1 E5:2 C5:0.5 E5:0.5 G5:1 F#5:0.5 E5:0.5 D5:1 B4:0.5 D5:0.5 E5:2 R:1',
    bass: 'E3:2 B2:2 C3:2 G2:2 A2:2 D3:2 B2:2 E3:2',
    bassWave: 'square',
    drums: 'K:1 S:1 K:0.5 K:0.5 S:1',
  },
  draw(ctx, t, dt, info) {
    play(ctx, dt, info, SCENES);
  },
};
