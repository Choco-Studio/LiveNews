// HI-RES GYM — for characters who want more pixels. Brand colours: black,
// red, orange, yellow. "Get more definition."
import {
  P, W, H, R, A, rrect, panel, disc, oval, ring, poly, line, dither, bands, sparkle, twinkle, particles, shadow,
  sunburst, spr, draw, stroke, cached, text, bigText, bubble, finePrint, slogan, play, hero, person, wordmark, drawMark,
  glint, glow, urlPill, prog, lerp, easeOut, easeOutBack, wave, frame, shake, clipRect, starPts, cloud, mulberry32,
  rep, tune,
} from './kit.js';

const LARRY = { S: P.skin, s: P.skinShade, H: P.yellow, h: P.cream, E: P.tanShade, T: P.cyan, t: P.blue, C: P.cyan, X: P.cyan, P: P.navy, p: P.ink, A: P.red, a: P.darkRed, L: P.cyan };
const BRAD = { S: P.tan, s: P.tanShade, H: P.black, h: P.slate, E: P.black, T: P.red, t: P.darkRed, C: P.tan, X: P.red, P: P.purple, p: P.ink, A: P.yellow, a: P.orange };
const COACH = { S: P.brown, s: P.maroon, H: P.slate, h: P.steel, E: P.black, T: P.green, t: P.darkGreen, C: P.white, X: P.green, P: P.ink, A: P.green };

// --- brand -------------------------------------------------------------------

const MARK = () => wordmark('HI-RES GYM', {
  h: 28, pen: 3, square: true, slant: 0.25, wide: 0.85, gap: 3,
  fill: [P.white, P.yellow, P.orange, P.red], outline: [[P.black, 2]], depth: 4, depthColor: P.darkRed,
});

/** Dumbbell icon: the weights are pixels (cached 70 x 30). */
const dumbbellArt = () =>
  cached('hg-dumbbell', 70, 30, (c) => {
    R(c, 14, 12, 42, 6, P.black);
    R(c, 15, 13, 40, 4, P.silver);
    R(c, 15, 13, 40, 1, P.white);
    for (const [x, s] of [[2, 26], [56, 26]]) {
      R(c, x, 2, 12, s, P.black);
      R(c, x + 1, 3, 10, s - 2, P.red);
      R(c, x + 1, 3, 10, 3, P.pink);
      R(c, x + 8, 6, 3, s - 5, P.darkRed);
    }
    for (const [x, s] of [[9, 20], [52, 20]]) {
      R(c, x, 5, 9, s, P.black);
      R(c, x + 1, 6, 7, s - 2, P.orange);
      R(c, x + 1, 6, 7, 2, P.yellow);
    }
  });

// --- low-res Larry: same pixel size, fewer pixels --------------------------

const TINY = spr(['.SS.', '.SS.', 'TTTT', '.TT.', '.TT.', '.PP.', '.P.P', '.P.P'], -2, 0);
const SMALL = spr([
  '..HHHH..',
  '.HSSSSH.',
  '.SKSSKS.',
  '.SSSSSS.',
  '..SSSS..',
  '.TTTTTT.',
  'TTTTTTTT',
  'STTTTTTS',
  'S.TTTT.S',
  '..TTTT..',
  '..PPPP..',
  '..PPPP..',
  '..P..P..',
  '..P..P..',
  '..P..P..',
  '.BB..BB.',
], -4, 0);

const TINY_PALS = new Map();

/** Larry at a given resolution stage 0..3, feet on gy. Returns head top y. */
function larry(ctx, x, gy, stage, o = {}) {
  const pal = o.pal || LARRY;
  let K = TINY_PALS.get(pal);
  if (!K) TINY_PALS.set(pal, (K = { ...pal, K: P.black, B: P.black }));
  if (stage === 0) {
    draw(ctx, TINY, x, gy - 8, K);
    if (o.tear) R(ctx, x + 2, gy - 6 + (Math.floor(o.tear * 4) % 3), 1, 1, P.cyan);
    return gy - 9;
  }
  if (stage === 1) {
    draw(ctx, SMALL, x, gy - 16, K);
    return gy - 17;
  }
  if (stage === 2) {
    person(ctx, x, gy, { pal, eyes: o.eyes2 || 'open', mouth: 'grin', armL: o.small || 'up', armR: o.small || 'up', hair: 'spiky' });
    return gy - 34;
  }
  const me = hero(ctx, x, gy, { pal, hair: 'spiky', hat: 'headband', sleeves: 'short', eyes: o.eyes || 'happy', mouth: o.mouth || 'grin', armL: o.armL || 'flex', armR: o.armR || 'flex', blush: true, sweat: o.sweat, bob: o.bob || 0 });
  return me;
}

function barbell(ctx, cx, y, w, plate) {
  R(ctx, cx - w / 2, y - 1, w, 3, P.black);
  R(ctx, cx - w / 2 + 1, y, w - 2, 1, P.silver);
  for (const sd of [-1, 1]) {
    const px = cx + sd * (w / 2 - plate / 2) - plate / 2;
    R(ctx, px, y - plate, plate, plate * 2, P.black);
    R(ctx, px + 1, y - plate + 1, plate - 2, plate * 2 - 2, P.red);
    R(ctx, px + 1, y - plate + 1, plate - 2, Math.max(1, plate / 3), P.pink);
  }
}

// --- sets --------------------------------------------------------------------

function beach(ctx, lt, cam = 0) {
  bands(ctx, 0, 0, W, 110, [P.blue, P.cyan, P.cream]);
  disc(ctx, 60, 36, 14, P.yellow);
  cloud(ctx, 260 + Math.round(lt * 4) + cam, 30, 10, P.white);
  bands(ctx, 0, 100, W, 36, [P.blue, P.navy]);
  for (let i = 0; i < 8; i++) R(ctx, ((i * 61 + lt * 14) % (W + 30)) - 15, 106 + (i % 3) * 9, 12, 1, P.white);
  R(ctx, 0, 134, W, 82, P.cream);
  dither(ctx, 0, 134, W, 82, P.yellow, 'dots');
  R(ctx, 0, 134, W, 2, P.white);
  // umbrella + towel
  stroke(ctx, [[320 + cam, 170], [314 + cam, 104]], 2, P.black, null);
  const cx = 314 + cam;
  poly(ctx, [[cx - 40, 108], [cx + 40, 108], [cx, 88]], P.black);
  poly(ctx, [[cx - 38, 107], [cx + 38, 107], [cx, 89]], P.orange);
  poly(ctx, [[cx - 14, 107], [cx + 14, 107], [cx, 89]], P.yellow);
}

function towel(ctx, x, y) {
  R(ctx, x - 24, y - 4, 48, 10, P.black);
  R(ctx, x - 23, y - 3, 46, 8, P.pink);
  for (let i = 0; i < 46; i += 8) R(ctx, x - 23 + i, y - 3, 4, 8, P.white);
}

// --- shots -------------------------------------------------------------------

// 1. Establishing: low-res Larry gets sand kicked on him.
function shotBeach(ctx, lt) {
  beach(ctx, lt);
  towel(ctx, 150, 172);
  const kick = lt > 1.6 && lt < 2.6;
  const top = larry(ctx, 150, 172, 0, { tear: lt > 2.6 ? lt : 0 });
  shadow(ctx, 226, 178, 22);
  hero(ctx, 226, 178, { pal: BRAD, hat: 'headband', eyes: 'shades', mouth: kick ? 'teeth' : 'grin', armL: 'flex', armR: 'flex', sleeves: 'short', legs: kick ? 'walk' : 'stand', step: kick ? 1 : 0 });
  if (lt > 1.7) {
    for (let i = 0; i < 26; i++) {
      const t = prog(lt, 1.7 + (i % 5) * 0.04, 2.5 + (i % 5) * 0.04);
      if (t <= 0 || t >= 1) continue;
      const x = lerp(214, 150 + ((i * 13) % 20) - 10, t);
      const y = 176 - Math.sin(t * Math.PI) * (30 + (i % 4) * 8);
      R(ctx, x, y, 2, 2, P.yellow);
    }
  }
  if (lt > 2.5) {
    const pile = Math.min(5, Math.round((lt - 2.5) * 8));
    for (let i = 0; i < pile; i++) R(ctx, 146 + i, 170 - Math.min(3, i), 2, 2, P.yellow);
  }
  if (lt > 0.5) {
    panel(ctx, 70, 128, 72, 14, P.white, P.black, 1);
    text(ctx, 'LOW-RES LARRY', 106, 132, { color: P.black, align: 'center' });
    line(ctx, 112, 142, 146, 162, P.black);
    R(ctx, 145, 161, 3, 3, P.black);
  }
  if (lt > 1.0) bubble(ctx, 244, 112, 90, 'NICE PIXELS, NERD!', { tail: 'down', tx: 250 });
}

// 2. "Close-up": we zoom in... he is still eight pixels.
function shotCloseUp(ctx, lt) {
  R(ctx, 0, 0, W, H, P.cream);
  dither(ctx, 0, 0, W, H, P.yellow, 'dots');
  const zoom = Math.min(800, Math.round(100 + easeOut(prog(lt, 0, 0.8)) * 700));
  larry(ctx, 192, 112, 0, { tear: lt > 0.9 ? lt : 0 });
  // viewfinder furniture
  for (const [x, y, sx, sy] of [[24, 28, 1, 1], [360, 28, -1, 1], [24, 196, 1, -1], [360, 196, -1, -1]]) {
    R(ctx, Math.min(x, x + sx * 20), y, 20, 2, P.black);
    R(ctx, x - (sx < 0 ? 1 : 0), Math.min(y, y + sy * 20), 2, 20, P.black);
  }
  if (Math.floor(lt * 2) % 2) disc(ctx, 330, 44, 4, P.red);
  text(ctx, 'REC', 322, 52, { color: P.black });
  text(ctx, `ZOOM ${zoom}%`, 192, 186, { color: P.black, align: 'center' });
  R(ctx, 180, 112, 24, 1, A(P.black, 0.2));
  R(ctx, 191, 101, 1, 24, A(P.black, 0.2));
  if (lt > 1.2) bigText(ctx, 'CLOSE-UP', 192, 60, { scale: 2, color: P.white, outline: P.black, align: 'center' });
}

// 3. Product hero: the neon sign flickers on.
function shotSign(ctx, lt) {
  R(ctx, 0, 0, W, H, P.maroon);
  for (let y = 0; y < 170; y += 8) {
    const off = (y / 8) % 2 ? 0 : 12;
    for (let x = -off; x < W; x += 24) R(ctx, x, y, 23, 7, P.darkRed);
  }
  dither(ctx, 0, 0, W, 170, A(P.black, 0.35), 'checker');
  // neon stutters on: two pulses 0.4 s apart, then stays lit (photosensitivity-safe)
  const on = (lt > 0.25 && lt < 0.4) || lt > 0.65;
  if (on) glow(ctx, 192, 70, 120, P.red, 0.07, 5);
  R(ctx, 58, 36, 268, 72, P.black);
  R(ctx, 60, 38, 264, 68, P.ink);
  const mk = MARK();
  if (on) {
    const x0 = drawMark(ctx, mk, 192, 50);
    glint(ctx, mk.cv, x0 - mk.ox, 50 - mk.oy, prog(lt, 1.2, 1.9), { width: 7 });
  } else {
    ctx.save();
    ctx.globalAlpha = 0.25;
    drawMark(ctx, mk, 192, 50);
    ctx.restore();
  }
  // street level
  R(ctx, 0, 170, W, 46, P.slate);
  R(ctx, 0, 170, W, 2, P.fog);
  R(ctx, 150, 120, 84, 50, P.black);
  R(ctx, 152, 122, 39, 48, on ? P.orange : P.brown);
  R(ctx, 193, 122, 39, 48, on ? P.orange : P.brown);
  R(ctx, 152, 122, 39, 6, on ? P.yellow : P.tanShade);
  R(ctx, 193, 122, 39, 6, on ? P.yellow : P.tanShade);
  text(ctx, 'OPEN 24/7', 192, 146, { color: P.black, align: 'center' });
  ctx.drawImage(dumbbellArt(), 30, 128);
  ctx.drawImage(dumbbellArt(), 284, 128);
  if (on && lt > 1.0) {
    for (let i = 0; i < 6; i++) sparkle(ctx, 70 + i * 50, 30 + ((i * 29) % 80), twinkle(lt, i * 0.2), P.yellow);
  }
  if (lt > 1.4) bigText(ctx, 'GET DOWN TO...', 192, 186, { scale: 2, color: P.white, outline: P.black, align: 'center' });
}

// 4. Training montage: every rep adds pixels.
function shotTraining(ctx, lt) {
  const stage = Math.min(3, Math.floor(lt / 1.6));
  const st = lt - stage * 1.6;
  bands(ctx, 0, 0, W, 150, [P.slate, P.steel]);
  // mirror wall + posters
  R(ctx, 20, 24, 200, 110, P.black);
  R(ctx, 22, 26, 196, 106, P.fog);
  for (let i = 0; i < 4; i++) poly(ctx, [[40 + i * 50, 26], [60 + i * 50, 26], [20 + i * 50, 132], [0 + i * 50, 132]], A(P.white, 0.25));
  panel(ctx, 240, 26, 64, 46, P.yellow, P.black, 1);
  text(ctx, 'NO PIXELS', 272, 34, { color: P.black, align: 'center' });
  text(ctx, 'NO GLORY', 272, 46, { color: P.red, align: 'center' });
  text(ctx, '!!!', 272, 58, { color: P.black, align: 'center' });
  R(ctx, 0, 150, W, 66, P.ink);
  for (let x = 0; x < W; x += 32) R(ctx, x, 150, 1, 66, P.black);
  R(ctx, 0, 150, W, 2, P.slate);
  // Larry lifting, growing a stage every 1.6 s
  const rep = Math.sin(st * Math.PI * 2.5);
  const lift = Math.round((rep * 0.5 + 0.5) * (stage + 1) * 4);
  const lx = 128;
  if (stage === 0) {
    larry(ctx, lx, 172, 0);
    barbell(ctx, lx, 162 - lift, 16, 2);
  } else if (stage === 1) {
    larry(ctx, lx, 172, 1);
    barbell(ctx, lx, 158 - lift, 28, 3);
  } else if (stage === 2) {
    larry(ctx, lx, 172, 2);
    barbell(ctx, lx, 136 - lift, 44, 5);
  } else {
    const me = larry(ctx, lx, 172, 3, { armL: 'up', armR: 'up', sweat: lt, eyes: 'closed', mouth: 'teeth' });
    barbell(ctx, lx, me.handL[1] - Math.round(rep * 2), 70, 8);
  }
  // coach
  const talk = Math.floor(lt * 4) % 2;
  hero(ctx, 300, 172, { pal: COACH, hair: 'bald', eyes: 'angry', mouth: talk ? 'open' : 'teeth', armL: 'point', armR: 'hips', hat: 'cap' });
  bubble(ctx, 250, 82, 98, ['ONE MORE REP!', 'MORE PIXELS!', 'FEEL THE BURN-IN!', 'DEFINITION!'][stage], { tail: 'down', tx: 292 });
  // HUD
  const px = [32, 128, 1024, 4096][stage];
  panel(ctx, 236, 184, 140, 24, P.black, P.red, 2);
  text(ctx, `PIXELS: ${px.toLocaleString('en-GB')}`, 306, 189, { color: P.yellow, align: 'center' });
  for (let i = 0; i < 4; i++) R(ctx, 250 + i * 28, 199, 24, 4, i <= stage ? P.red : P.slate);
  if (st < 0.7 && stage > 0) {
    const rr = Math.round(20 + st * 60);
    poly(ctx, starPts(lx, 140, 12, rr, rr * 0.6, st), A(P.yellow, 0.5 - st * 0.6));
    bigText(ctx, 'LEVEL UP!', lx, 60 - Math.round(st * 20), { scale: 2, color: P.yellow, outline: P.black, ow: 2, align: 'center' });
  }
}

// 5. Payoff: back at the beach, the tables have turned.
function shotPayoff(ctx, lt) {
  beach(ctx, lt);
  towel(ctx, 236, 172);
  larry(ctx, 236, 172, 0, { pal: BRAD, tear: lt });
  const me = larry(ctx, 150, 178, 3, { armL: 'flex', armR: 'flex', eyes: 'happy', mouth: 'grin', bob: wave(lt, 1.5, 1) });
  for (let i = 0; i < 5; i++) sparkle(ctx, 118 + i * 16, me.top + 20 + ((i * 11) % 30), twinkle(lt, i * 0.2), P.white);
  if (lt > 0.4) {
    panel(ctx, 40, 66, 84, 14, P.white, P.black, 1);
    text(ctx, 'HI-RES LARRY', 82, 70, { color: P.black, align: 'center' });
  }
  if (lt > 0.9) {
    panel(ctx, 252, 132, 82, 14, P.white, P.black, 1);
    text(ctx, 'LOW-RES BRAD', 293, 136, { color: P.black, align: 'center' });
    line(ctx, 270, 146, 240, 162, P.black);
  }
}

// 6. End slate.
function shotSlate(ctx, lt) {
  sunburst(ctx, 192, 96, lt * 0.06, 14, P.black, P.ink);
  glow(ctx, 192, 70, 120, P.red, 0.06, 5);
  for (let i = 0; i < 8; i++) {
    const y = 30 + ((i * 47) % 150);
    const x = W - ((lt * 400 + i * 90) % (W + 60));
    R(ctx, x, y, 40, 1, P.darkRed);
  }
  const p = easeOutBack(prog(lt, 0.0, 0.4), 2);
  const dx = Math.round(lerp(-90, 157, p));
  ctx.drawImage(dumbbellArt(), dx, 20);
  glint(ctx, dumbbellArt(), dx, 20, ((lt - 0.5) % 2.5) / 0.6, { width: 6 });
  const mk = MARK();
  const x0 = drawMark(ctx, mk, 192, 62, { reveal: prog(lt, 0.2, 0.9), drop: 40 });
  if (lt > 1.1) glint(ctx, mk.cv, x0 - mk.ox, 62 - mk.oy, ((lt - 1.1) % 2.8) / 0.6, { width: 7 });
  if (lt > 1.0) text(ctx, 'OPEN 24/7  •  60 REPS PER SECOND', 192, 108, { color: P.orange, align: 'center' });
  if (lt > 1.4) slogan(ctx, 'GET MORE DEFINITION.', 192, 124, lt - 1.4, { scale: 2, bg: P.red, edge: P.darkRed, color: P.white });
  if (lt > 2.0) urlPill(ctx, 'HIRESGYM.PXL', 192, 158, { bg: P.black, border: P.red, color: P.yellow });
  // tiny Larry gives a thumbs up from the corner
  if (lt > 2.2) larry(ctx, 330, 186, 3, { armL: 'flex', armR: 'up', eyes: 'happy', mouth: 'grin' });
  finePrint(ctx, 'RESULTS MAY VARY. ANTI-ALIASING NOT INCLUDED. MEMBERSHIP RENEWS EVERY FRAME.', { lt: lt - 2.4 });
}

const SCENES = [
  { at: 0, draw: shotBeach },
  { at: 4.6, draw: shotCloseUp, wipe: 'iris', wd: 0.4, cx: 150, cy: 166 },
  { at: 7.0, draw: shotSign, wipe: 'bars', wd: 0.45 },
  { at: 11.0, draw: shotTraining, wipe: 'diag', wd: 0.45 },
  { at: 17.6, draw: shotPayoff, wipe: 'flash', wd: 0.3 },
  { at: 20.25, draw: shotSlate, wipe: 'blocks', wd: 0.5 },
];

export default {
  id: 'hi-res-gym',
  brand: 'HI-RES GYM',
  duration: 25.5,
  voice: { gender: 'male', lang: 'en-US', pitch: 0.8, rate: 1.1 },
  script: [
    { at: 0.6, text: 'Tired of being... low resolution?' },
    { at: 4.9, text: 'Even in close-up?' },
    { at: 7.4, text: 'Get down to Hi-Res Gym!' },
    { at: 11.2, text: 'Pump those pixels! Gain colours! Gain... definition!' },
    { at: 20.6, text: 'Hi-Res Gym. Get more definition.' },
  ],
  // 160 bpm rock: mopey riff, a sad sting, power chords for the sign, a
  // rising montage theme, and the HI-RES GYM sting resolving on E at beat 54.
  tune: {
    bpm: 160,
    wave: 'sawtooth',
    notes: tune(
      'E4:1 G4:1 A4:1 G4:1 E4:2 D4:2 E4:4',
      'R:2 E5:0.5 D5:0.5 B4:1 R:2',
      'E4:0.5 E4:0.5 G4:0.5 E4:0.5 A4:1 G4:1 E4:0.5 E4:0.5 G4:0.5 E4:0.5 B4:2 R:4',
      'E5:0.5 E5:0.5 D5:0.5 E5:0.5 G5:1 E5:1 A5:0.5 A5:0.5 G5:0.5 A5:0.5 B5:1 A5:1 B5:0.5 B5:0.5 A5:0.5 B5:0.5 D6:1 B5:1 E6:1 D6:1 B5:1 A5:1 G5:2',
      'E5:1 G5:1 B5:2 R:2',
      'B4:0.5 E5:0.5 G5:1 B5:2 R:1 A5:0.5 B5:0.5 E6:4 R:4',
    ),
    bass: tune(
      'E2:4 C3:4 E2:4',
      'E2:2 B1:2 E2:2',
      'E2:1 E2:1 E2:1 E2:1 A2:2 G2:2 E2:2 R:2',
      rep('E2:0.5', 8), rep('A2:0.5', 8), rep('B2:0.5', 8), 'C3:2 D3:2 E3:2',
      'E2:2 G2:2 B2:2',
      'E2:2 B2:2 E2:4 R:6',
    ),
    bassWave: 'square',
    drums: tune(
      rep('K:1 H:1 S:1 H:1', 3),
      'K:2 R:4',
      rep('K:0.5 K:0.5 S:1', 4), 'S:0.25 S:0.25 S:0.25 S:0.25 S:0.5 S:0.5 S:2',
      rep('K:0.5 H:0.5 S:0.5 H:0.5', 9),
      'K:1 S:1 K:1 S:1 K:1 S:1',
      'K:1 S:1 K:1 S:1 K:0.5 K:0.5 S:1 K:2 R:6',
    ),
  },
  draw(ctx, t, dt, info) {
    play(ctx, dt, info, SCENES);
  },
};
