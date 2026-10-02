// THE GRAND BUFFER — the hotel where the loading screen IS the holiday.
// Brand colours: dusk purple, gold, cream. "Stay at 99%. Forever."
import {
  P, W, H, R, A, rrect, panel, disc, oval, ring, poly, line, dither, bands, sparkle, twinkle, particles, shadow,
  sunburst, stroke, cached, text, bigText, bubble, para, finePrint, slogan, play, hero, faceCU, wordmark, drawMark,
  glint, glow, urlPill, prog, lerp, easeOut, easeInOut, easeOutBack, wave, frame, shake, clipRect, starPts, cloud,
  mulberry32, rep, tune, measureText,
} from './kit.js';

const GUEST = { S: P.skin, s: P.skinShade, H: P.brown, h: P.tan, E: P.maroon, T: P.pink, t: P.red, C: P.yellow, X: P.pink, P: P.cream, p: P.tan, B: P.brown, A: P.cream, a: P.red };
const WAITER = { S: P.tan, s: P.tanShade, H: P.black, h: P.ink, T: P.white, t: P.silver, C: P.white, X: P.black, P: P.black, p: P.ink };

// --- brand -------------------------------------------------------------------

const MARK = () => wordmark('GRAND BUFFER', {
  h: 22, pen: 1, square: true, wide: 0.8, gap: 3,
  fill: [P.white, P.cream, P.yellow, P.orange], outline: [[P.maroon, 1], [P.black, 1]], depth: 2, depthColor: P.black,
});

/** The brand emblem: a golden loading spinner. */
function spinner(ctx, cx, cy, r, phase, on = P.yellow, mid = P.orange, off = P.maroon, dot = 0) {
  const n = 8;
  const head = Math.floor(phase * n);
  const dr = dot || Math.max(1, Math.round(r / 4));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const k = (((head - i) % n) + n) % n;
    const c = k === 0 ? on : k <= 2 ? mid : off;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    disc(ctx, x, y, dr + 1, P.black);
    disc(ctx, x, y, dr, c);
  }
}

function ornament(ctx, cx, y, w, c = P.yellow) {
  R(ctx, cx - w / 2, y, w / 2 - 6, 1, c);
  R(ctx, cx + 6, y, w / 2 - 6, 1, c);
  R(ctx, cx - 2, y - 2, 4, 5, c);
  R(ctx, cx - 3, y - 1, 6, 3, c);
}

function progressBar(ctx, x, y, w, h, p, fill = P.yellow, back = P.ink) {
  R(ctx, x - 2, y - 2, w + 4, h + 4, P.black);
  R(ctx, x - 1, y - 1, w + 2, h + 2, P.cream);
  R(ctx, x, y, w, h, back);
  R(ctx, x, y, Math.round(w * p), h, fill);
  R(ctx, x, y, Math.round(w * p), 1, P.white);
}

// --- shots -------------------------------------------------------------------

function landmarks(ctx, off, y, col) {
  // generic tourist silhouettes on a repeating 260px strip
  const span = 260;
  for (let k = -1; k < 3; k++) {
    const b = Math.round(k * span - (off % span));
    poly(ctx, [[b + 10, y], [b + 40, y - 34], [b + 70, y]], col);
    R(ctx, b + 96, y - 52, 8, 52, col);
    poly(ctx, [[b + 92, y - 52], [b + 108, y - 52], [b + 100, y - 64]], col);
    ring(ctx, b + 160, y - 26, 24, col);
    ring(ctx, b + 160, y - 26, 23, col);
    for (let i = 0; i < 8; i++) line(ctx, b + 160, y - 26, b + 160 + Math.round(Math.cos(i * 0.785 + off * 0.01) * 23), y - 26 + Math.round(Math.sin(i * 0.785 + off * 0.01) * 23), col);
    R(ctx, b + 157, y - 26, 6, 26, col);
    disc(ctx, b + 220, y - 30, 12, col);
    R(ctx, b + 208, y - 30, 24, 30, col);
    poly(ctx, [[b + 217, y - 42], [b + 223, y - 42], [b + 220, y - 52]], col);
  }
}

// 1. Establishing: a frantic sightseeing holiday.
function shotHectic(ctx, lt) {
  const off = lt * 220;
  bands(ctx, 0, 0, W, 150, [P.blue, P.cyan, P.cream]);
  disc(ctx, 320, 40, 14, P.yellow);
  landmarks(ctx, off * 0.25, 74, P.fog);
  // mid: shopfronts
  const span = 96;
  for (let k = -1; k < 6; k++) {
    const x = Math.round(k * span - ((off * 0.6) % span));
    const c = [P.rust, P.purple, P.darkGreen][((k % 3) + 3) % 3];
    R(ctx, x, 70, 90, 80, c);
    R(ctx, x + 8, 84, 30, 24, P.navy);
    R(ctx, x + 50, 84, 30, 24, P.navy);
    for (let i = 0; i < 9; i++) R(ctx, x + i * 10, 120, 10, 8, i % 2 ? P.white : P.red);
    R(ctx, x + 30, 130, 26, 20, P.black);
  }
  R(ctx, 0, 150, W, 66, P.slate);
  R(ctx, 0, 150, W, 2, P.fog);
  for (let x = -((off * 1.0) % 48); x < W; x += 48) R(ctx, x, 182, 24, 3, P.silver);
  // tourist running in place, suitcase bouncing behind
  const step = Math.floor(lt * 12);
  const bob = step % 2 ? -2 : 0;
  const tx = 214;
  stroke(ctx, [[tx - 30, 150 + bob], [tx - 14, 126]], 2, P.black, null);
  rrect(ctx, tx - 54, 124 + bob, 30, 26, P.black, 2);
  rrect(ctx, tx - 53, 125 + bob, 28, 24, P.orange, 2);
  R(ctx, tx - 49, 130 + bob, 8, 6, P.white);
  R(ctx, tx - 38, 138 + bob, 9, 6, P.cyan);
  disc(ctx, tx - 50, 151, 2, P.black);
  disc(ctx, tx - 30, 151, 2, P.black);
  const me = hero(ctx, tx, 172, { pal: GUEST, hat: 'sunhat', eyes: 'wide', mouth: 'O', legs: 'walk', step, sweat: lt, armL: 'out', armR: 'point', bob });
  R(ctx, tx - 5, me.top + 30, 10, 7, P.black);
  R(ctx, tx - 4, me.top + 31, 8, 5, P.slate);
  disc(ctx, tx, me.top + 33, 1, P.cyan);
  // speed lines + near lamp posts
  for (let i = 0; i < 5; i++) R(ctx, (W - ((off * 2 + i * 97) % (W + 40))), 100 + i * 14, 26, 1, P.white);
  for (let x = -((off * 1.8) % 220); x < W; x += 220) {
    R(ctx, x, 40, 6, 176, P.black);
    R(ctx, x - 6, 36, 18, 6, P.black);
    R(ctx, x - 4, 42, 14, 4, P.yellow);
  }
  // itinerary card
  panel(ctx, 248, 26, 128, 66, P.white, P.black, 2);
  text(ctx, 'TODAY:', 254, 30, { color: P.red });
  const items = ['9:00 MUSEUM', '9:04 CASTLE', '9:06 BOAT TRIP', '9:07 GIFT SHOP', '9:09 VOLCANO', '9:10 MUSEUM 2'];
  const first = Math.floor(lt * 2.5) % items.length;
  for (let i = 0; i < 4; i++) {
    const it = items[(first + i) % items.length];
    text(ctx, it, 254, 42 + i * 11, { color: i === 0 ? P.navy : P.steel });
    if (i === 0) R(ctx, 252, 45, 4 + measureText(it), 1, P.red);
  }
}

// 2. Close-up: exhausted.
function shotTired(ctx, lt) {
  bands(ctx, 0, 0, W, H, [P.cyan, P.cream]);
  landmarks(ctx, 40, 216, A(P.steel, 0.5));
  faceCU(ctx, 192, 124, 44, { pal: GUEST, eyes: 'x', mouth: 'wavy', sweat: lt, blush: false, iris: P.navy });
  // sun hat on top
  oval(ctx, 192, 84, 70, 11, P.black);
  oval(ctx, 192, 83, 68, 9, P.cream);
  rrect(ctx, 156, 50, 72, 36, P.black, 3);
  rrect(ctx, 158, 52, 68, 33, P.cream, 3);
  R(ctx, 158, 74, 68, 6, P.red);
  R(ctx, 164, 56, 10, 3, P.white);
  panel(ctx, 252, 150, 120, 30, P.black, P.red, 2);
  text(ctx, 'ACTIVITY 47', 312, 155, { color: P.white, align: 'center' });
  text(ctx, 'OF 112', 312, 167, { color: P.red, align: 'center' });
}

// 3. Product hero: the hotel at dusk.
function shotHotel(ctx, lt) {
  bands(ctx, 0, 0, W, 170, [P.ink, P.purple, P.magenta, P.pink, P.orange]);
  const rand = mulberry32(8);
  for (let i = 0; i < 30; i++) {
    const x = rand() * W;
    const y = rand() * 70;
    sparkle(ctx, x, y, [0, 1, 0, 0][(Math.floor(lt * 3 + i) % 4)], P.white);
    R(ctx, x, y, 1, 1, P.silver);
  }
  // searchlights
  for (const [bx, ph] of [[110, 0], [274, 1.7]]) {
    const a = Math.sin(lt * 0.9 + ph) * 0.5;
    const tx = bx + Math.sin(a) * 260;
    poly(ctx, [[bx - 3, 170], [bx + 3, 170], [tx + 22, -10], [tx - 22, -10]], A(P.cream, 0.12));
  }
  R(ctx, 0, 170, W, 46, P.ink);
  R(ctx, 0, 170, W, 1, P.purple);
  // building
  const cam = Math.round(easeInOut(prog(lt, 0, 5)) * 10);
  const by = 92 + cam;
  R(ctx, 70, by, 244, 110, P.black);
  R(ctx, 72, by + 2, 240, 108, P.purple);
  R(ctx, 72, by + 2, 240, 3, P.magenta);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 12; col++) {
      const lit = ((row * 7 + col * 3 + Math.floor(lt * 1.5)) % 5) > 1;
      R(ctx, 82 + col * 19, by + 12 + row * 18, 10, 11, P.black);
      R(ctx, 83 + col * 19, by + 13 + row * 18, 8, 9, lit ? P.yellow : P.navy);
      if (lit) R(ctx, 83 + col * 19, by + 13 + row * 18, 8, 2, P.cream);
    }
  }
  // entrance + columns
  R(ctx, 160, by + 80, 64, 30, P.black);
  R(ctx, 162, by + 82, 60, 28, P.orange);
  R(ctx, 182, by + 86, 20, 24, P.yellow);
  for (const x of [150, 230]) {
    R(ctx, x, by + 74, 8, 36, P.black);
    R(ctx, x + 1, by + 74, 6, 36, P.cream);
  }
  poly(ctx, [[146, by + 76], [242, by + 76], [232, by + 66], [156, by + 66]], P.red);
  // roof sign with wordmark + spinner
  const sy = by - 34;
  R(ctx, 82, sy, 220, 30, P.black);
  R(ctx, 84, sy + 2, 216, 26, P.ink);
  R(ctx, 84, sy + 2, 216, 1, P.magenta);
  const mk = MARK();
  const x0 = drawMark(ctx, mk, 200, sy + 5);
  glint(ctx, mk.cv, x0 - mk.ox, sy + 5 - mk.oy, ((lt - 1.2) % 2.6) / 0.6, { width: 5 });
  spinner(ctx, 100, sy + 15, 9, lt * 1.2, P.yellow, P.orange, P.purple, 2);
  for (const x of [96, 288]) R(ctx, x, sy + 30, 4, 6, P.black);
  // palms
  for (const [px, sd] of [[42, 1], [346, -1]]) {
    stroke(ctx, [[px, 206], [px + sd * 6, 150], [px + sd * 2, 108]], 4, P.brown, P.black);
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.6 + wave(lt, 0.4, 1) * 0.02;
      const ex = px + sd * 2 + Math.cos(a) * 34;
      const ey = 108 + Math.sin(a) * 18 + 14;
      stroke(ctx, [[px + sd * 2, 108], [px + sd * 2 + Math.cos(a) * 18, 108 + Math.sin(a) * 14], [ex, ey]], 3, P.darkGreen, P.black);
    }
  }
  R(ctx, 0, 202, W, 14, P.black);
  R(ctx, 0, 202, W, 2, P.slate);
  if (lt > 0.6) {
    const p = easeOut(prog(lt, 0.6, 1.0));
    text(ctx, 'WELCOME TO', 192, Math.round(lerp(30, 24, p)), { color: P.cream, align: 'center' });
  }
}

// 4. Demo: lounging on the famous progress bar.
function shotBeach(ctx, lt) {
  bands(ctx, 0, 0, W, 104, [P.blue, P.cyan, P.cream]);
  glow(ctx, 336, 40, 40, P.yellow, 0.1);
  disc(ctx, 336, 40, 13, P.yellow);
  disc(ctx, 336, 40, 10, P.white);
  cloud(ctx, 60 + Math.round(lt * 6), 34, 10, P.white);
  // sea
  bands(ctx, 0, 104, W, 40, [P.blue, P.navy]);
  for (let i = 0; i < 9; i++) R(ctx, ((i * 53 + lt * 18) % (W + 40)) - 20, 110 + (i % 4) * 8, 14, 1, P.white);
  // the progress bar IS the beach
  const p = lerp(0.95, 0.99, easeOut(prog(lt, 0, 3.6)));
  R(ctx, 0, 144, W, 72, P.ink);
  progressBar(ctx, 16, 148, 352, 26, p, P.cream, P.slate);
  dither(ctx, 16, 156, Math.round(352 * p), 18, P.yellow, 'dots');
  // parasol + deckchair + guest
  stroke(ctx, [[122, 148], [128, 86]], 2, P.black, null);
  const can = [];
  for (let i = 0; i <= 10; i++) can.push([128 + Math.cos(Math.PI + (i / 10) * Math.PI) * 42, 88 + Math.sin(Math.PI + (i / 10) * Math.PI) * 20]);
  poly(ctx, [...can.map(([x, y]) => [x, y - 1]), [170, 89], [86, 89]], P.black);
  poly(ctx, can, P.red);
  for (let i = 0; i < 4; i++) poly(ctx, [[128, 68], [100 + i * 18, 88], [108 + i * 18, 88]], P.white);
  rrect(ctx, 170, 102, 46, 44, P.black, 2);
  for (let i = 0; i < 6; i++) R(ctx, 171 + i * 7.5, 103, 8, 42, i % 2 ? P.white : P.blue);
  hero(ctx, 193, 148, { pal: GUEST, hat: 'sunhat', eyes: 'closed', mouth: 'smile', armL: 'hold', armR: 'hips', legs: 'none', blush: true });
  R(ctx, 166, 136, 54, 10, P.black);
  R(ctx, 167, 137, 52, 8, P.cyan);
  // waiter arrives with a spinner-garnished drink
  if (lt > 2.6) {
    const wx = Math.round(lerp(420, 266, easeOut(prog(lt, 2.6, 4.0))));
    const me = hero(ctx, wx, 148, { pal: WAITER, eyes: 'happy', mouth: 'smile', armL: 'out', legs: lt < 4 ? 'walk' : 'stand', step: Math.floor(lt * 8), mustache: true });
    const [hx, hy] = me.handL;
    R(ctx, hx - 12, hy - 2, 18, 3, P.black);
    R(ctx, hx - 11, hy - 2, 16, 2, P.silver);
    R(ctx, hx - 6, hy - 12, 7, 10, P.black);
    R(ctx, hx - 5, hy - 11, 5, 8, P.orange);
    spinner(ctx, hx - 3, hy - 16, 3, lt * 1.5, P.yellow, P.orange, P.maroon, 1);
  }
  // loading furniture
  const dots = '.'.repeat(1 + (Math.floor(lt * 3) % 3));
  text(ctx, `LOADING${dots}`, 18, 184, { color: P.white });
  text(ctx, `${Math.floor(p * 100)}%`, 366, 184, { color: P.yellow, align: 'right' });
  text(ctx, 'PLEASE DO NOT SWITCH OFF YOUR HOLIDAY.', 192, 200, { color: P.fog, align: 'center' });
  const tips = ['TIP: RELAX.', 'TIP: YOU ARE ON HOLIDAY.', 'DID YOU KNOW? THE SUN IS HOT.', 'TIP: ANOTHER TIP IS COMING.'];
  const ti = Math.min(tips.length - 1, Math.floor(lt / 1.5));
  const tl = lt - ti * 1.5;
  const tx = Math.round(lerp(W, 226, easeOutBack(prog(tl, 0, 0.35), 1.4)));
  panel(ctx, tx, 26, 150, 42, P.ink, P.yellow, 2);
  spinner(ctx, tx + 14, 47, 6, lt * 1.3, P.yellow, P.orange, P.slate, 1);
  para(ctx, tips[ti], tx + 28, 33, 116, { color: P.white, lh: 10 });
}

// 5. Reaction: bliss.
function shotBliss(ctx, lt) {
  bands(ctx, 0, 0, W, H, [P.blue, P.cyan, P.cream]);
  disc(ctx, 330, 44, 16, P.yellow);
  faceCU(ctx, 192, 124, 44, { pal: GUEST, eyes: 'closed', mouth: 'smile', blush: true });
  // sunglasses with the 99% reflected in them
  for (const sd of [-1, 1]) {
    rrect(ctx, 192 + sd * 17 - 13, 113, 26, 18, P.black, 2);
    rrect(ctx, 192 + sd * 17 - 11, 115, 22, 14, P.ink, 2);
    text(ctx, '99%', 192 + sd * 17, 119, { color: Math.floor(lt * 2) % 2 ? P.yellow : P.orange, align: 'center' });
  }
  R(ctx, 186, 118, 12, 2, P.black);
  oval(ctx, 192, 84, 70, 11, P.black);
  oval(ctx, 192, 83, 68, 9, P.cream);
  rrect(ctx, 156, 50, 72, 36, P.black, 3);
  rrect(ctx, 158, 52, 68, 33, P.cream, 3);
  R(ctx, 158, 74, 68, 6, P.red);
  // palm frond in the foreground
  const sw = wave(lt, 0.4, 2);
  stroke(ctx, [[0, 30], [40 + sw, 46], [80 + sw, 70]], 3, P.darkGreen, P.black);
  for (let i = 0; i < 6; i++) stroke(ctx, [[10 + i * 12 + sw, 34 + i * 6], [i * 12 - 4 + sw, 60 + i * 6]], 3, P.green, P.black);
  if (lt > 0.6) bigText(ctx, 'AHHH...', 310, 156, { scale: 2, color: P.white, outline: P.navy });
}

// 6. End slate.
function shotSlate(ctx, lt) {
  bands(ctx, 0, 0, W, H, [P.ink, P.ink, P.purple, P.maroon]);
  const rand = mulberry32(3);
  for (let i = 0; i < 40; i++) {
    const x = rand() * W;
    const y = 24 + rand() * 120;
    R(ctx, x, y, 1, 1, P.silver);
    if (i % 6 === 0) sparkle(ctx, x, y, twinkle(lt, i * 0.13), P.cream);
  }
  glow(ctx, 192, 44, 40, P.yellow, 0.08);
  spinner(ctx, 192, 44, 16, lt * 1.2, P.yellow, P.orange, P.maroon, 3);
  text(ctx, 'THE', 192, 70, { color: P.yellow, align: 'center' });
  const mk = MARK();
  const x0 = drawMark(ctx, mk, 192, 80, { reveal: prog(lt, 0.2, 1.0), drop: 24 });
  if (lt > 1.2) glint(ctx, mk.cv, x0 - mk.ox, 80 - mk.oy, ((lt - 1.2) % 3) / 0.7, { width: 5 });
  if (lt > 1.0) {
    ornament(ctx, 192, 112, 200);
    text(ctx, 'HOTEL & SPA', 192, 116, { color: P.cream, align: 'center' });
  }
  if (lt > 1.3) {
    const blink = Math.floor(lt * 2) % 2;
    progressBar(ctx, 122, 130, 140, 6, 0.99, P.yellow, P.ink);
    text(ctx, '99%', 270, 130, { color: blink ? P.yellow : P.orange });
  }
  if (lt > 1.6) slogan(ctx, 'STAY AT 99%. FOREVER.', 192, 144, lt - 1.6, { scale: 2, bg: P.yellow, edge: P.orange, color: P.maroon });
  if (lt > 2.2) urlPill(ctx, 'GRANDBUFFER.WAIT', 192, 172, { bg: P.purple, border: P.yellow, color: P.cream });
  const eta = ['2 MINUTES', '3 YEARS', '5 SECONDS', 'CALCULATING...', '1 WEEK'][frame(lt, 1.2, 5)];
  finePrint(ctx, `CHECK-OUT TIME: CALCULATING... ESTIMATED TIME REMAINING: ${eta}`, { lt: lt - 2.4 });
}

const SCENES = [
  { at: 0, draw: shotHectic },
  { at: 4.8, draw: shotTired, wipe: 'iris', wd: 0.4, cx: 214, cy: 130 },
  { at: 7.0, draw: shotHotel, wipe: 'bars', wd: 0.5 },
  { at: 12.0, draw: shotBeach, wipe: 'dissolve', wd: 0.5 },
  { at: 18.0, draw: shotBliss, wipe: 'iris', wd: 0.4, cx: 193, cy: 120 },
  { at: 21.6, draw: shotSlate, wipe: 'diag', wd: 0.5 },
];

export default {
  id: 'grand-buffer',
  brand: 'THE GRAND BUFFER',
  duration: 27.6,
  voice: { gender: 'female', lang: 'en-US', pitch: 1.05, rate: 0.95 },
  script: [
    { at: 0.6, text: 'Tired of holidays where you actually have to... do things?' },
    { at: 7.2, text: 'Welcome to The Grand Buffer. Where the loading screen... is the holiday.' },
    { at: 12.4, text: 'Lounge on our famous progress bar. Enjoy a helpful tip. Then... another tip.' },
    { at: 22.0, text: 'The Grand Buffer. Stay at ninety-nine percent... forever.' },
  ],
  // 100 bpm lounge: frantic intro, deflate, dreamy reveal, bossa on the
  // beach, and the sting resolves on C with the end slate at beat 36.
  tune: {
    bpm: 100,
    wave: 'sine',
    notes: tune(
      rep('C5:0.5 D5:0.5 E5:0.5 G5:0.5 E5:0.5 D5:0.5 C5:0.5 D5:0.5', 2),
      'G4:2 F4:1 E4:1',
      'E5:1.5 G5:0.5 B5:2 A5:1.5 F5:0.5 D5:2',
      rep('E5:1 D5:0.5 E5:1.5 C5:1 A4:2 R:2 D5:1 C5:0.5 D5:1.5 B4:1 G4:2 R:2', 1),
      'G5:1 E5:1 C5:1 D5:1 E5:1 D5:1 C5:4',
    ),
    bass: tune(
      'C3:2 G2:2 C3:2 G2:2',
      'F2:4',
      'A2:4 D3:4',
      'C3:1.5 G2:0.5 C3:2 A2:1.5 E2:0.5 A2:2 D3:1.5 A2:0.5 D3:2 G2:1.5 D2:0.5 G2:2',
      'F2:2 G2:2 C3:6',
    ),
    bassWave: 'triangle',
    drums: tune(rep('K:0.5 H:0.5', 8), 'K:2 R:2', rep('H:1', 8), rep('K:1 H:0.5 S:0.5 H:0.5 K:0.5 S:1', 4), 'K:1 H:1 S:1 H:1 K:1 R:5'),
  },
  draw(ctx, t, dt, info) {
    play(ctx, dt, info, SCENES);
  },
};
