// BITFIZZ COLA — "Feeling a bit... low-res?" A guy melts on a park bench in a
// 1-bit world until the only thing in colour, a BitFizz machine, glows at him.
// One sip and the world re-renders 1 -> 2 -> 4 -> 8 bits. Brand colours: cola
// red, fizz yellow, white. Tagline: "Taste every bit."
//
// Storyboard (150 bpm, a beat is 0.4 s; every cut lands on a beat):
//  1  0.0 LOW-RES      1-bit park, he fans himself, sighs.           VO "Feeling a bit... low-res?"
//  2  3.6 THE GLOW     close-up; red light on his face, eyes pop.
//  3  5.2 THE MACHINE  whip pan to a full-colour vending machine; he walks up, CLUNK.
//                                                                      VO "Crack open an ice-cold BitFizz Cola..."
//  4  7.6 CRACK        extreme close-up: finger, tab, anticipation, PSSHT, bits spray.
//  5  9.6 UPGRADE      the sip; the world rescans to 2, 4 and 8 bits.  VO "...and upgrade to eight bits of flavour!"
//  6 12.8 PARTY        full colour; dancing on the bench, 256 TASTES.  VO "Two hundred and fifty-six tastes in every sip!"
//  7 17.6 HERO CAN     2.5D turntable can, ice, light sweep.           VO "BitFizz Cola."
//  8 19.6 END SLATE    logo, tagline, url, legal; a 1-bit pigeon gets its colour.   VO "Taste every bit."
import {
  P, W, H, R, A, rrect, disc, oval, ring, poly, line, dither, bands, sparkle, twinkle, shadow, sunburst, spr, draw,
  cached, text, bigText, kinetic, micro, play, hero, faceCU, wordmark, drawMark, glint, cloud, mulberry32, prog, lerp,
  easeOut, easeIn, easeOutBack, spring, wobble, key, tween, poseAt, blink, breath, kick, withCam, squashArt, cylinder,
  spotlight, badge, endSlate, lazy, clipRect, clipCircle, rep, tune, frame, stroke,
} from './kit.js';

// --- colour depth -------------------------------------------------------------
// Each mode maps every palette token onto the colours that depth can show.
function table(groups) {
  const m = {};
  for (const [to, list] of groups) for (const c of list) m[c] = to;
  return m;
}
const MODES = {
  1: table([
    [P.black, [P.black, P.ink, P.slate, P.steel, P.maroon, P.brown, P.darkGreen, P.navy, P.purple, P.darkRed, P.tanShade, P.rust, P.red, P.blue, P.magenta]],
    [P.cream, [P.fog, P.silver, P.white, P.yellow, P.cream, P.skin, P.skinShade, P.tan, P.cyan, P.orange, P.pink, P.green]],
  ]),
  2: table([
    [P.black, [P.black, P.ink, P.maroon, P.purple, P.navy]],
    [P.darkGreen, [P.slate, P.darkGreen, P.brown, P.darkRed, P.tanShade, P.rust, P.steel, P.magenta]],
    [P.green, [P.fog, P.red, P.orange, P.green, P.tan, P.skinShade, P.pink, P.blue]],
    [P.cream, [P.silver, P.white, P.yellow, P.cream, P.skin, P.cyan]],
  ]),
  // 4-bit: an EGA-like 16-colour set (pink skin, brown shading, no subtle tones)
  4: table([
    [P.black, [P.black, P.ink, P.maroon]],
    [P.steel, [P.slate, P.steel]],
    [P.silver, [P.fog, P.silver]],
    [P.white, [P.white, P.cream]],
    [P.pink, [P.skin, P.pink]],
    [P.rust, [P.skinShade, P.tan, P.tanShade, P.rust, P.orange]],
    [P.darkRed, [P.brown, P.darkRed]],
    [P.magenta, [P.purple, P.magenta]],
  ]),
  8: {},
};
const mapper = (d) => {
  const m = MODES[d];
  return (hex) => m[hex] || hex;
};
const PALS = new Map();
/** A character palette as seen at depth d (cached). */
function palAt(name, pal, d) {
  const k = `${name}|${d}`;
  let v = PALS.get(k);
  if (!v) {
    const c = mapper(d);
    v = { K: P.black, W: c(P.white), M: c(P.maroon), N: c(P.pink) };
    for (const [key, hex] of Object.entries(pal)) v[key] = c(hex);
    PALS.set(k, v);
  }
  return v;
}

const GUY = { S: P.skin, s: P.skinShade, H: P.brown, h: P.tan, E: P.brown, T: P.white, t: P.silver, L: P.white, C: P.white, X: P.white, b: P.red, Y: P.yellow, P: P.navy, p: P.ink, B: P.red };
const BIT_COLS = [P.red, P.orange, P.yellow, P.green, P.cyan, P.blue, P.magenta, P.pink];

// --- brand ---------------------------------------------------------------------

const MARK = lazy(() => wordmark('BITFIZZ', {
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
}));
const SUB = lazy(() => wordmark('COLA', { h: 16, pen: 2, wide: 1.1, gap: 3, fill: [P.yellow, P.orange], outline: [[P.black, 2]], depth: 2, depthColor: P.rust }));
const MINI_BIT = lazy(() => wordmark('BIT', { h: 13, pen: 1, square: true, wide: 0.8, gap: 2, slant: 0.15, fill: [P.white, P.white, P.silver], outline: [[P.maroon, 1]] }));
const MINI_FIZZ = lazy(() => wordmark('FIZZ', { h: 13, pen: 1, square: true, wide: 0.75, gap: 2, slant: 0.15, fill: [P.yellow, P.yellow, P.orange], outline: [[P.maroon, 1]] }));

// --- the can -------------------------------------------------------------------

/** Label texture for a can of radius r and label height h: one full turn wide. */
const label = (r, h) =>
  cached(`bf-label-${r}-${h}`, Math.round(2 * Math.PI * r), h, (c) => {
    const lw = Math.round(2 * Math.PI * r);
    R(c, 0, 0, lw, h, P.red);
    // a white "fizz wave" band and a yellow pinstripe
    const by = Math.round(h * 0.2);
    for (let x = 0; x < lw; x++) {
      const yy = by + Math.round(Math.sin((x / lw) * Math.PI * 6) * 2);
      R(c, x, yy, 1, 3, P.white);
      R(c, x, yy + 3, 1, 1, P.yellow);
      R(c, x, h - by + Math.round(Math.sin((x / lw) * Math.PI * 6 + 2) * 2), 1, 2, P.darkRed);
    }
    // front: stacked BIT / FIZZ lettering, centred on u = 0.5
    const fx = Math.round(lw / 2);
    const bit = MINI_BIT();
    const fizz = MINI_FIZZ();
    const k = Math.min(1, h / 64);
    drawMark(c, bit, fx, Math.round(h * 0.34));
    drawMark(c, fizz, fx, Math.round(h * 0.34) + Math.round(16 * k) + 1);
    micro(c, 'COLA', fx, Math.round(h * 0.34) + Math.round(34 * k) + 2, { color: P.white, align: 'center' });
    // back: a big "8" bit badge and the nutrition table in micro type
    const bx = Math.round(lw * 0.02) + 4;
    disc(c, bx + 6, Math.round(h * 0.5), 7, P.yellow);
    text(c, '8', bx + 4, Math.round(h * 0.5) - 3, { color: P.maroon });
    micro(c, 'BITS 8', Math.round(lw * 0.9), Math.round(h * 0.42), { color: P.white, align: 'center' });
    micro(c, 'FUN 256', Math.round(lw * 0.9), Math.round(h * 0.42) + 7, { color: P.white, align: 'center' });
    // bubbles and condensation drops all round
    const rand = mulberry32(5 + r);
    for (let i = 0; i < lw / 3; i++) {
      const x = Math.floor(rand() * lw);
      const y = 3 + Math.floor(rand() * (h - 6));
      if (Math.abs(x - fx) < 16 && y > h * 0.28 && y < h * 0.85) continue;
      R(c, x, y, 1, 1, rand() < 0.6 ? P.pink : P.white);
      if (rand() < 0.25) R(c, x, y + 1, 1, 1, P.white);
    }
  });

/** Full can at radius r: lid ellipse, turning label, base. (cx, top) = lid centre. */
function can(ctx, cx, top, r, turn, { tab = 0, lidOnly = false } = {}) {
  const lh = Math.round(r * 2.6);
  const ry = Math.max(2, Math.round(r * 0.28));
  const y0 = top + ry;
  // body outline
  R(ctx, cx - r - 1, y0, 2 * r + 2, lh + 1, P.black);
  oval(ctx, cx, y0 + lh, r + 1, ry + 1, P.black);
  oval(ctx, cx, y0, r + 1, ry + 1, P.black);
  if (!lidOnly) {
    // base rim
    oval(ctx, cx, y0 + lh, r, ry, P.steel);
    R(ctx, cx - r, y0 + lh - 3, 2 * r, 3, P.silver);
    cylinder(ctx, label(r, lh - 3), cx, y0, r, turn);
  }
  // lid: rim, recess, tab
  oval(ctx, cx, y0, r, ry, P.silver);
  oval(ctx, cx, y0 + 1, r - 2, Math.max(1, ry - 1), P.fog);
  R(ctx, cx - r + 2, y0 - 1, 2 * r - 4, 1, P.white);
  const tx = cx + Math.round(r * 0.1);
  if (tab < 0.5) {
    // tab lying flat, lifting slightly as the finger pulls (tab 0..0.5)
    const lift = Math.round(tab * 4);
    R(ctx, tx - 3, y0 - 1 - lift, 7, 3, P.black);
    R(ctx, tx - 2, y0 - lift, 5, 1, P.white);
    R(ctx, tx - 4, y0 + 1, 3, 1, P.steel);
  } else {
    // popped: tab stands up, the opening is dark
    oval(ctx, tx - 4, y0 + 1, 3, 1, P.black);
    R(ctx, tx - 1, y0 - 7, 4, 8, P.black);
    R(ctx, tx, y0 - 6, 2, 6, P.white);
  }
}

// --- park ------------------------------------------------------------------------

const WW = 600; // the park is wider than the screen so the camera can travel
const GROUND = 178; // the path where people stand
const SEAT = 150; // bench seat top
const BENCH_X = 200;
const MACHINE_X = 470;

function paintPark(c, d) {
  const k = mapper(d);
  const one = d === 1;
  // sky
  if (one) R(c, 0, 0, WW, 116, P.cream);
  else bands(c, 0, 0, WW, 116, [k(P.blue), k(P.cyan), k(P.cream)]);
  if (one) dither(c, 0, 0, WW, 12, P.black, 'dots');
  // far city
  const rand = mulberry32(3);
  for (let x = -10; x < WW; x += 18 + Math.floor(rand() * 14)) {
    const h = 14 + Math.floor(rand() * 26);
    R(c, x, 112 - h, 16, h, one ? P.cream : k(P.fog));
    if (one) {
      R(c, x, 112 - h, 16, 1, P.black);
      R(c, x, 112 - h, 1, h, P.black);
      dither(c, x + 1, 112 - h + 1, 15, h - 1, P.black, 'sparse');
    } else for (let wy = 112 - h + 3; wy < 108; wy += 5) for (let wx = x + 3; wx < x + 14; wx += 4) R(c, wx, wy, 2, 2, k(P.silver));
  }
  // hills and tree line
  for (const [hx, hr] of [[60, 90], [230, 120], [420, 100], [560, 80]]) {
    oval(c, hx, 118, hr, 22, one ? P.black : k(P.darkGreen));
    if (one) oval(c, hx, 119, hr - 1, 21, P.cream);
    if (one) dither(c, hx - hr, 97, hr * 2, 21, P.black, 'checker');
  }
  for (let x = 6; x < WW; x += 34 + ((x * 7) % 17)) {
    const tr = 12 + ((x * 13) % 7);
    const ty = 104 + ((x * 5) % 6);
    R(c, x - 1, ty, 3, 14, one ? P.black : k(P.brown));
    disc(c, x, ty - 2, tr + 1, P.black);
    disc(c, x, ty - 2, tr, one ? P.black : k(P.darkGreen));
    disc(c, x - 3, ty - 5, tr - 4, one ? P.black : k(P.green));
    if (one) dither(c, x - tr + 2, ty - tr, tr * 2 - 6, tr - 2, P.cream, 'dots');
  }
  // grass
  R(c, 0, 116, WW, 100, one ? P.cream : k(P.green));
  R(c, 0, 116, WW, 2, one ? P.black : k(P.darkGreen));
  if (one) {
    dither(c, 0, 118, WW, 6, P.black, 'checker');
    dither(c, 0, 124, WW, 10, P.black, 'sparse');
    dither(c, 0, 194, WW, 22, P.black, 'dots');
  } else {
    dither(c, 0, 118, WW, 8, k(P.darkGreen), 'sparse');
    bands(c, 0, 186, WW, 30, [k(P.green), k(P.darkGreen)]);
  }
  for (let i = 0; i < 90; i++) {
    const x = Math.floor(rand() * WW);
    const y = 128 + Math.floor(rand() * 84);
    if (y > 162 && y < 188) continue;
    R(c, x, y, 1, 2, one ? P.black : k(P.darkGreen));
    R(c, x + 2, y + 1, 1, 1, one ? P.black : k(P.darkGreen));
  }
  // path
  R(c, 0, 163, WW, 1, P.black);
  R(c, 0, 164, WW, 22, one ? P.cream : k(P.cream));
  R(c, 0, 164, WW, 2, one ? P.black : k(P.tan));
  R(c, 0, 186, WW, 1, P.black);
  if (one) dither(c, 0, 166, WW, 3, P.black, 'sparse');
  for (let x = 4; x < WW; x += 23) R(c, x, 176 + ((x * 3) % 7), 2, 1, one ? P.black : k(P.tan));
  // lamp post
  const lx = 112;
  R(c, lx - 2, 60, 5, 104, P.black);
  R(c, lx - 1, 60, 3, 104, one ? P.black : k(P.slate));
  R(c, lx, 60, 1, 104, one ? P.cream : k(P.steel));
  R(c, lx - 6, 52, 13, 9, P.black);
  R(c, lx - 5, 53, 11, 7, one ? P.cream : k(P.cream));
  R(c, lx - 7, 50, 15, 3, P.black);
  R(c, lx - 4, 160, 9, 4, P.black);
  // trash bin
  const bx = 318;
  R(c, bx - 9, 140, 18, 25, P.black);
  R(c, bx - 8, 141, 16, 23, one ? P.cream : k(P.green));
  for (let x = bx - 6; x < bx + 7; x += 4) R(c, x, 143, 1, 19, one ? P.black : k(P.darkGreen));
  R(c, bx - 10, 138, 20, 4, P.black);
  // bench back (the seat front is drawn over the guy's hips)
  const b0 = BENCH_X - 44;
  R(c, b0, 120, 88, 26, P.black);
  for (let i = 0; i < 3; i++) R(c, b0 + 1, 121 + i * 8, 86, 6, one ? P.cream : k(P.tan));
  for (let i = 0; i < 3; i++) R(c, b0 + 1, 126 + i * 8, 86, 1, one ? P.black : k(P.tanShade));
  R(c, b0 + 6, 120, 4, 44, P.black);
  R(c, b0 + 78, 120, 4, 44, P.black);
}
const park = (d) => cached(`bf-park-${d}`, WW, H, (c) => paintPark(c, d));

/** Bench seat front and legs (in front of a sitting person). */
function benchFront(ctx, x, d) {
  const k = mapper(d);
  const b0 = x - 46;
  R(ctx, b0, SEAT - 1, 92, 7, P.black);
  R(ctx, b0 + 1, SEAT, 90, 4, d === 1 ? P.cream : k(P.tan));
  R(ctx, b0 + 1, SEAT + 4, 90, 1, d === 1 ? P.black : k(P.tanShade));
  for (const lx of [b0 + 6, b0 + 82]) {
    R(ctx, lx, SEAT + 5, 4, GROUND - SEAT - 9, P.black);
    R(ctx, lx - 2, GROUND - 5, 8, 2, P.black);
  }
}

/** Shins and shoes of someone sitting on the bench (drawn over the seat front). */
function shins(ctx, x, pal) {
  for (const sd of [-1, 1]) {
    line(ctx, x + sd * 5 - 4, SEAT + 2, x + sd * 6 - 4, GROUND - 8, P.black, 8);
    line(ctx, x + sd * 5 - 3, SEAT + 2, x + sd * 6 - 3, GROUND - 8, pal.P, 6);
    R(ctx, x + sd * 6 - 5, GROUND - 8, 10, 5, P.black);
    R(ctx, x + sd * 6 - 4, GROUND - 7, 8, 3, pal.B);
  }
}

function sun(ctx, x, y, lt, d) {
  const k = mapper(d);
  if (d === 1) {
    disc(ctx, x, y, 17, P.black);
    disc(ctx, x, y, 16, P.cream);
    ring(ctx, x, y, 20 + (Math.floor(lt * 3) % 3), P.black);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + lt * 0.2;
      line(ctx, x + Math.cos(a) * 24, y + Math.sin(a) * 24, x + Math.cos(a) * 30, y + Math.sin(a) * 30, P.black);
    }
  } else {
    disc(ctx, x, y, 22, A(k(P.yellow), 0.25));
    disc(ctx, x, y, 17, k(P.orange));
    disc(ctx, x, y, 15, k(P.yellow));
    disc(ctx, x - 3, y - 3, 8, k(P.cream));
  }
}

/** Rising heat shimmer (1-bit: dotted wavy columns). */
function heat(ctx, x0, w, lt) {
  for (let i = 0; i < 6; i++) {
    const x = x0 + ((i * 53) % w);
    const ph = (lt * 0.7 + i * 0.37) % 1;
    for (let j = 0; j < 4; j++) {
      const y = 150 - ph * 50 - j * 5;
      R(ctx, x + Math.round(Math.sin((y + i) * 0.4) * 2), y, 1, 2, P.black);
    }
  }
}

// Pigeon (faces right): stand / step / peck. G body, g wing, n neck sheen, Y
// feet and beak, E eye, t tail. Outlined by spr().
const PIGEON = [
  spr([
    '.........GGG...',
    '........GGEGG..',
    '........GGGGGY.',
    '........nnGG...',
    '.......nnnn....',
    '...GGGGGnnGG...',
    '.tGgggGGGGGGG..',
    'ttggggggGGGGGG.',
    '.tgggggggGGGGG.',
    '...gggggGGGGG..',
    '.....GGGGGG....',
    '......Y..Y.....',
    '.....YY.YY.....',
  ], -7, -13),
  spr([
    '..........GGG..',
    '.........GGEGG.',
    '.........GGGGGY',
    '........nnGG...',
    '.......nnnn....',
    '...GGGGGnnGG...',
    '.tGgggGGGGGGG..',
    'ttggggggGGGGGG.',
    '.tgggggggGGGGG.',
    '...gggggGGGGG..',
    '.....GGGGGG....',
    '.....Y....Y....',
    '....YY...YY....',
  ], -7, -13),
  spr([
    '...............',
    '...............',
    '...............',
    '...............',
    '...GGGGG.......',
    '.tGgggGGGGG....',
    'ttggggggGGnnGG.',
    '.tgggggggGnnGEG',
    '...gggggGGGGGGG',
    '.....GGGGGG..GY',
    '...............',
    '......Y..Y.....',
    '.....YY.YY.....',
  ], -7, -13),
];
const pigeonPal = (d) =>
  palAt('pigeon', { K: P.black, G: P.fog, g: P.steel, n: P.green, Y: P.orange, E: P.black, t: P.slate }, d);
/** mode: 'peck' (idle pecking), 'walk', 'bob' (dancing), or 'stand'. */
function pigeon(ctx, x, gy, lt, d, { shades = false, flip = false, mode = 'peck' } = {}) {
  let f = 0;
  if (mode === 'peck') f = frame(lt + (x % 7) * 0.13, 3, 5) === 2 ? 2 : 0;
  else if (mode === 'walk') f = frame(lt, 8, 2);
  const bob = mode === 'bob' ? -(Math.floor(lt * 5) % 2) : 0;
  draw(ctx, PIGEON[f], x, gy + bob, pigeonPal(d), flip);
  if (shades && f !== 2) {
    const ex = flip ? x - 4 : x + 4;
    R(ctx, ex - 3, gy - 12 + bob, 7, 2, P.black);
    R(ctx, ex - 2, gy - 12 + bob, 1, 1, P.white);
  }
}

// --- vending machine (always full colour: it is the only colour in the world) ---

const MW = 64;
const MH = 116;
const machineArt = () =>
  cached('bf-machine', MW, MH, (c) => {
    rrect(c, 0, 0, MW, MH, P.black, 3);
    rrect(c, 1, 1, MW - 2, MH - 2, P.red, 2);
    R(c, 3, 2, 4, MH - 6, P.pink);
    R(c, MW - 6, 2, 4, MH - 6, P.darkRed);
    // header sign
    R(c, 6, 5, MW - 12, 15, P.black);
    R(c, 7, 6, MW - 14, 13, P.white);
    const bit = MINI_BIT();
    const fizz = MINI_FIZZ();
    const x0 = Math.round((MW - (bit.w + 2 + fizz.w)) / 2);
    drawMark(c, bit, x0 + bit.w / 2, 6);
    drawMark(c, fizz, x0 + bit.w + 2 + fizz.w / 2, 6);
    // window of cans
    R(c, 6, 23, 36, 58, P.black);
    R(c, 7, 24, 34, 56, P.navy);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const x = 9 + col * 8;
        const y = 26 + row * 14;
        R(c, x, y, 6, 10, P.black);
        R(c, x + 1, y + 1, 4, 8, P.red);
        R(c, x + 1, y + 1, 4, 1, P.silver);
        R(c, x + 1, y + 4, 4, 1, P.white);
        R(c, x + 1, y + 1, 1, 8, P.pink);
      }
      R(c, 7, 36 + row * 14, 34, 1, P.cyan);
    }
    R(c, 8, 25, 2, 54, A(P.white, 0.35));
    // button panel
    R(c, 45, 23, 13, 58, P.black);
    R(c, 46, 24, 11, 56, P.silver);
    R(c, 48, 27, 7, 7, P.black);
    R(c, 49, 28, 5, 5, P.green);
    text(c, '8', 50, 28, { color: P.black });
    for (let i = 0; i < 3; i++) {
      R(c, 48, 38 + i * 8, 7, 6, P.black);
      R(c, 49, 39 + i * 8, 5, 4, i === 0 ? P.yellow : P.white);
    }
    R(c, 50, 64, 3, 9, P.black);
    R(c, 51, 65, 1, 7, P.steel);
    // dispenser tray
    R(c, 8, 88, 48, 18, P.black);
    R(c, 9, 89, 46, 16, P.maroon);
    R(c, 9, 89, 46, 4, P.darkRed);
    R(c, 12, 96, 40, 1, P.black);
    R(c, 4, MH - 6, MW - 8, 5, P.darkRed);
  });

function machine(ctx, x, gy, lt, { squash = 0, glowA = 1 } = {}) {
  // light pool: the machine throws red onto the 1-bit ground
  if (glowA > 0) {
    dither(ctx, x - 58, gy - 8, 116, 14, P.red, 'sparse');
    dither(ctx, x - 40, gy - 6, 80, 10, P.red, 'checker');
    dither(ctx, x - MW / 2 - 14, gy - MH - 6, 14, MH, P.red, 'sparse');
    dither(ctx, x + MW / 2, gy - MH - 6, 14, MH, P.red, 'sparse');
  }
  shadow(ctx, x, gy - 1, 36, 0.45);
  squashArt(ctx, machineArt(), x, gy, 1 + squash * 0.6, 1 - squash);
  // buzzing sign light
  if (frame(lt, 10, 23) !== 7) R(ctx, x - MW / 2 + 7, gy - MH * (1 - squash) + 6, 2, 2, P.white);
}

// --- shared bits -----------------------------------------------------------------

/** Depth readout: a little old-computer window ("DISPLAY") in the corner. */
function depthWindow(ctx, x, y, depth, d, lt) {
  const k = mapper(d);
  const w = 104;
  R(ctx, x, y, w, 30, P.black);
  R(ctx, x + 1, y + 1, w - 2, 28, d === 1 ? P.cream : k(P.white));
  for (let i = 0; i < 4; i++) R(ctx, x + 2, y + 2 + i * 2, w - 4, 1, P.black);
  R(ctx, x + 34, y + 2, 36, 8, d === 1 ? P.cream : k(P.white));
  micro(ctx, 'DISPLAY', x + 52, y + 4, { color: P.black, align: 'center' });
  micro(ctx, 'COLOUR DEPTH', x + 5, y + 14, { color: P.black });
  const cells = depth;
  for (let i = 0; i < 8; i++) {
    R(ctx, x + 5 + i * 12, y + 21, 10, 5, P.black);
    if (i < cells) R(ctx, x + 6 + i * 12, y + 22, 8, 3, d === 8 ? BIT_COLS[i] : d === 1 ? P.cream : k(BIT_COLS[i]));
  }
  micro(ctx, `${depth}-BIT`, x + w - 5, y + 14, { color: d === 8 && Math.floor(lt * 4) % 2 ? P.red : P.black, align: 'right' });
}

/** Spray of 0/1 bits and bubbles from (x, y), age in seconds. */
function bitSpray(ctx, x, y, age, { n = 26, power = 1, seed = 4 } = {}) {
  const rand = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (rand() - 0.5) * 1.6;
    const v = (60 + rand() * 90) * power;
    const delay = rand() * 0.25;
    const tt = age - delay;
    if (tt <= 0 || tt > 1.4) continue;
    const px = x + Math.cos(a) * v * tt;
    const py = y + Math.sin(a) * v * tt + 120 * tt * tt;
    if (i % 3 === 0) ring(ctx, px, py, 1 + (i % 2), P.white);
    else text(ctx, i % 2 ? '1' : '0', px, py, { color: [P.yellow, P.white, P.cyan, P.pink][i % 4] });
  }
}

// --- shots -----------------------------------------------------------------------

// 1. LOW-RES: the 1-bit park; he fans himself with a newspaper, then sighs.
const SUN_X = 400;
const OSD = [13, 10];
function shotLowRes(ctx, lt) {
  const cam = Math.round(tween(lt, 0, 3.6, 58, 72, 'inOut'));
  withCam(ctx, cam, 0, (c) => {
    c.drawImage(park(1), 0, 0);
    sun(c, SUN_X, 36, lt, 1);
    heat(c, 150, 200, lt);
    pigeon(c, 262, GROUND - 1, lt, 1);
    const sigh = prog(lt, 2.5, 2.9) - prog(lt, 3.3, 3.6);
    const bob = breath(lt, 2.2, 1) + Math.round(sigh * 2);
    const fanning = 1 - prog(lt, 2.4, 2.8);
    const fan = poseAt(lt, [[0, [[-3, 7], [5, 12]]], [0.35, [[-8, -2], [-3, -12]], 'outBack'], [2.5, [[-8, -2], [-3, -12]]], [2.95, [[-3, 7], [5, 12]], 'inOut']], Math.sin(lt * 13) * 0.5 * fanning * prog(lt, 0.3, 0.5));
    const eyes = sigh > 0.5 ? 'closed' : blink(lt, 3) ? 'closed' : 'sleepy';
    const pal = palAt('guy', GUY, 1);
    const me = hero(c, BENCH_X, SEAT, { pal, hair: 'spiky', eyes, brows: 'sad', mouth: sigh > 0.3 ? 'o' : 'wavy', legs: 'none', bob, sleeves: 'short', armL: fan, armR: [[-3, 7], [4, 12]], sweat: lt });
    // the folded newspaper he fans himself with
    const [hx, hy] = me.handL;
    R(c, hx - 4, hy - 15, 9, 16, P.black);
    R(c, hx - 3, hy - 14, 7, 14, P.cream);
    for (let i = 0; i < 4; i++) R(c, hx - 2, hy - 12 + i * 3, 5, 1, P.black);
    disc(c, hx, hy, 3, P.black);
    disc(c, hx, hy, 2, pal.S);
    benchFront(c, BENCH_X, 1);
    shins(c, BENCH_X, pal);
  });
  depthWindow(ctx, OSD[0], OSD[1], 1, 1, lt);
  if (lt > 1.6) kinetic(ctx, 'LOW-RES?', 214, 52, lt - 1.6, { style: 'stamp', scale: 3, color: P.cream, outline: P.black, ow: 2, depth: 2, depthColor: P.black });
}

// 2. THE GLOW: close-up, a red light washes over him from screen right.
function shotGlow(ctx, lt) {
  cuBackground(ctx, 1);
  // the glow arrives from the right as dithered light, densest at the source
  const g = easeOut(prog(lt, 0.2, 0.8));
  if (g > 0) {
    const gx = Math.round(W - 150 * g);
    dither(ctx, gx, 0, W - gx, H, P.red, 'dots');
    dither(ctx, gx + 50, 0, W, H, P.red, 'sparse');
    dither(ctx, gx + 100, 0, W, H, P.red, 'checker');
  }
  const look = tween(lt, 0.55, 0.85, 0, 1, 'outBack');
  const wide = lt > 0.75;
  const squint = lt > 0.6 && lt <= 0.75;
  const s = Math.round(tween(lt, 0, 1.6, 46, 50, 'out'));
  const cx = 176;
  const cy = 128 + Math.round(wobble(lt, 0.75, 3, 3, 6));
  faceCU(ctx, cx, cy, s, {
    pal: palAt('guy', GUY, 1), hair: 'spiky', iris: P.black,
    eyes: wide ? 'wide' : squint ? 'closed' : blink(lt, 2) ? 'closed' : 'sleepy', brows: wide ? 'up' : 'sad',
    mouth: wide ? 'O' : 'wavy', look,
  });
  // red rim light on the side of his face that sees the machine
  if (g > 0.3) {
    const ry = Math.round(s * 0.92);
    for (let dy = -ry + 6; dy < ry - 4; dy++) {
      const hw = Math.floor(s * Math.sqrt(1 - (dy / (ry + 0.5)) ** 2));
      R(ctx, cx + hw - 3, cy + dy, 2, 1, P.red);
    }
  }
  // follow-through: the sweat drop flies off when his head snaps round
  if (lt > 0.75 && lt < 1.3) {
    const tt = lt - 0.75;
    disc(ctx, cx - s - 6 - tt * 60, cy - 30 - tt * 50 + tt * tt * 200, 2, P.black);
  }
  if (lt > 0.8) {
    const p = spring(lt - 0.8);
    bigText(ctx, '!', 250, Math.round(60 - p * 8), { scale: 3, color: P.cream, outline: P.black, ow: 2 });
  }
}

// 3. THE MACHINE: whip-panned to; he walks up and presses the button. CLUNK.
function shotMachine(ctx, lt) {
  const walk = prog(lt, 0.0, 1.1);
  const gx = Math.round(lerp(300, 396, easeOut(walk)));
  const cam = Math.round(tween(lt, 0, 2.4, 176, 194, 'out'));
  const clunk = 1.55;
  const [sx, sy] = kick(lt, clunk, 0.25, 3, 5);
  withCam(ctx, cam + sx, sy, (c) => {
    c.drawImage(park(1), 0, 0);
    sun(c, SUN_X, 36, lt, 1);
    pigeon(c, 262, GROUND - 1, lt, 1);
    const squash = Math.max(0, wobble(lt, clunk, 0.07, 4, 7));
    machine(c, MACHINE_X, GROUND + 2, lt, { squash });
    // he walks, stops with a little lean, reaches with anticipation, presses
    const press = poseAt(lt, [[1.0, 'down'], [1.2, [[-1, 10], [3, 14]], 'inOut'], [1.45, [[-8, -1], [-15, -3]], 'outBack'], [1.8, [[-8, -1], [-15, -3]]], [2.2, 'down', 'inOut']]);
    const walking = walk < 1;
    const bob = walking ? 0 : Math.round(wobble(lt, 1.1, 1.5, 2.5, 5));
    hero(c, gx, GROUND, {
      pal: palAt('guy', GUY, 1), hair: 'spiky', legs: walking ? 'walk' : 'stand', step: Math.floor(lt * 7), sleeves: 'short',
      eyes: lt > clunk ? 'wide' : 'open', brows: 'up', mouth: lt > clunk ? 'O' : 'smile', look: 1, armL: 'down', armR: press, bob,
    });
    // the can lands in the tray
    if (lt > clunk) {
      const tx = MACHINE_X - 6;
      const ty = GROUND + 2 - MH + 95 + Math.round(Math.min(0, -8 + (lt - clunk) * 80));
      clipRect(c, MACHINE_X - 23, GROUND + 2 - MH + 89, 46, 16);
      R(c, tx - 4, ty - 6, 9, 13, P.black);
      R(c, tx - 3, ty - 5, 7, 11, P.red);
      R(c, tx - 3, ty - 5, 7, 2, P.silver);
      c.restore();
    }
  });
  if (lt > clunk) kinetic(ctx, 'CLUNK!', 158, 62, lt - clunk, { style: 'stamp', scale: 3, color: P.cream, outline: P.black, ow: 2, depth: 2 });
  depthWindow(ctx, OSD[0], OSD[1], 1, 1, lt);
}

// 4. CRACK: extreme close-up on the tab. Anticipation, then PSSHT.
function finger(ctx, x, y, len, pal) {
  rrect(ctx, x - 1, y - 1, len + 2, 11, P.black, 3);
  rrect(ctx, x, y, len, 9, pal.S, 3);
  R(ctx, x + 2, y + 7, len - 5, 1, pal.s);
  R(ctx, x + len - 9, y + 2, 1, 5, P.black);
  R(ctx, x + 3, y + 1, len - 12, 1, P.white);
}
function shotCrack(ctx, lt) {
  const pal = palAt('guy', GUY, 1);
  R(ctx, 0, 0, W, H, P.cream);
  dither(ctx, 0, 0, W, 24, P.black, 'checker');
  dither(ctx, 0, 24, W, 20, P.black, 'sparse');
  dither(ctx, 0, 180, W, 36, P.black, 'sparse');
  const pop = 0.75;
  const age = lt - pop;
  // comic burst lines from the tab for a beat
  if (age > 0 && age < 0.35) {
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const r0 = 50 + age * 120;
      line(ctx, 196 + Math.cos(a) * r0, 66 + Math.sin(a) * r0 * 0.7, 196 + Math.cos(a) * (r0 + 26), 66 + Math.sin(a) * (r0 + 26) * 0.7, P.black, 2);
    }
  }
  const [sx, sy] = kick(lt, pop, 0.3, 3, 9);
  const sq = wobble(lt, pop, 0.07, 5, 7);
  const r = 40;
  const cx = 192 + sx;
  const top = 66 + sy;
  // palm behind the can and the wrist running out of shot
  stroke(ctx, [[cx - r - 4, top + 100], [cx - r - 30, H + 20]], 22, pal.S, P.black);
  rrect(ctx, cx - r - 18, top + 44, 30, 66, P.black, 6);
  rrect(ctx, cx - r - 17, top + 45, 28, 64, pal.S, 6);
  dither(ctx, cx - r - 17, top + 45, 8, 64, P.black, 'sparse');
  R(ctx, cx - r - 52, H - 14, 46, 14, P.black);
  dither(ctx, cx - r - 51, H - 13, 44, 12, P.cream, 'checker');
  ctx.save();
  ctx.translate(cx, top + 122);
  ctx.scale(1 - sq * 0.5, 1 + sq);
  ctx.translate(-cx, -(top + 122));
  const tab = lt < pop ? tween(lt, 0.3, pop, 0, 0.45, 'in') - prog(lt, 0.2, 0.32) * 0.1 + prog(lt, 0.32, 0.4) * 0.1 : 1;
  can(ctx, cx, top, r, 0.5, { tab });
  ctx.restore();
  // fingers wrapped round the front, a little curved
  [[0, 24], [12, 26], [24, 24], [36, 19]].forEach(([dy, len], i) => finger(ctx, cx - r - 6 + (i === 0 ? 1 : 0), top + 52 + dy, len, pal));
  // the other hand comes in from the top right: its index finger hooks the tab
  // and pulls (anticipation: a tiny push down first)
  const reach = easeOut(prog(lt, 0, 0.28));
  const push = prog(lt, 0.22, 0.32) - prog(lt, 0.32, 0.42);
  const lift = lt < pop ? tween(lt, 0.42, pop, 0, 5, 'in') - push * 2 : 7 - wobble(lt, pop, 3, 3, 6);
  const tipX = cx + 10 + Math.round((1 - reach) * 80);
  const tipY = top + 6 - Math.round(lift) - Math.round((1 - reach) * 40);
  const curl = lt > pop ? 3 : 0; // the finger curls as the tab gives
  const mid = [tipX + 9, tipY - 9 - curl];
  const base = [tipX + 22, tipY - 16];
  // back of the hand with curled fingers along its edge
  oval(ctx, base[0] + 20, base[1] - 14, 24, 19, P.black);
  oval(ctx, base[0] + 20, base[1] - 14, 23, 18, pal.S);
  R(ctx, base[0] + 6, base[1] - 26, 20, 1, P.white);
  for (let i = 0; i < 3; i++) {
    disc(ctx, base[0] + 8 + i * 10, base[1] + 3, 6, P.black);
    disc(ctx, base[0] + 8 + i * 10, base[1] + 3, 5, pal.S);
    R(ctx, base[0] + 4 + i * 10, base[1] + 6, 8, 1, pal.s);
  }
  dither(ctx, base[0] + 22, base[1] - 32, 18, 30, P.black, 'sparse');
  stroke(ctx, [base, mid, [tipX, tipY]], 8, pal.S, P.black);
  R(ctx, mid[0] - 2, mid[1] - 1, 4, 1, P.black);
  R(ctx, tipX - 3, tipY - 3, 5, 4, P.black);
  R(ctx, tipX - 2, tipY - 2, 3, 2, P.white);
  if (age > 0) {
    // foam bubbles over the lid, then settles
    const foam = Math.min(1, age * 4) * (1 - prog(age, 0.6, 1.4) * 0.6);
    const rand = mulberry32(17);
    for (let i = 0; i < 16; i++) {
      const fx = cx + 4 + (rand() - 0.5) * 36 * foam;
      const fy = top + 8 - rand() * 18 * foam - Math.sin(age * 8 + i) * 1.5;
      const fr = Math.max(1, Math.round((2 + rand() * 4) * foam));
      disc(ctx, fx, fy, fr + 1, P.black);
      disc(ctx, fx, fy, fr, P.white);
    }
    if (age < 0.5) cloud(ctx, cx + 4, top - 12 - age * 40, Math.round(8 + age * 34), P.white, P.silver);
    bitSpray(ctx, cx + 4, top + 2, age, { n: 56, power: 1.4 });
    kinetic(ctx, 'PSSHT!', 314, 40, age, { style: 'stamp', scale: 3, color: P.white, outline: P.black, ow: 2, depth: 3, depthColor: P.red });
  }
}

/** Close-up background of the park at depth d (simple, behind a face). */
function cuBackground(ctx, d) {
  const k = mapper(d);
  if (d === 1) R(ctx, 0, 0, W, H, P.cream);
  else bands(ctx, 0, 0, W, 140, [k(P.blue), k(P.cyan), k(P.cream)]);
  for (let x = -20; x < W; x += 46) {
    disc(ctx, x, 120, 26, d === 1 ? P.black : k(P.darkGreen));
    disc(ctx, x - 6, 112, 14, d === 1 ? P.black : k(P.green));
    if (d === 1) dither(ctx, x - 22, 96, 44, 22, P.cream, 'dots');
  }
  R(ctx, 0, 140, W, 76, d === 1 ? P.cream : k(P.green));
  if (d === 1) {
    dither(ctx, 0, 140, W, 8, P.black, 'checker');
    dither(ctx, 0, 148, W, 30, P.black, 'sparse');
  } else dither(ctx, 0, 140, W, 8, k(P.darkGreen), 'checker');
}

/** The can seen end-on while he drinks (its base points at the camera). */
function canBottom(ctx, cx, cy, r) {
  disc(ctx, cx, cy + 6, r + 1, P.black);
  disc(ctx, cx, cy + 6, r, P.darkRed);
  disc(ctx, cx, cy, r + 1, P.black);
  disc(ctx, cx, cy, r, P.silver);
  disc(ctx, cx, cy, r - 3, P.fog);
  disc(ctx, cx + 1, cy + 1, r - 6, P.steel);
  disc(ctx, cx, cy, r - 7, P.fog);
  R(ctx, cx - r + 3, cy - 2, 3, 3, P.white);
  micro(ctx, '8', cx, cy - 2, { color: P.slate, align: 'center' });
}

// 5. UPGRADE: the sip; the frame rescans from the top at each new depth.
const UPGRADES = [[0.4, 2], [1.2, 4], [2.0, 8]];
function drinker(ctx, lt, d) {
  const k = mapper(d);
  cuBackground(ctx, d);
  if (d === 8) {
    sunburst(ctx, 192, 118, lt * 0.06, 12, P.yellow, P.orange);
    for (let i = 0; i < 30; i++) {
      const x = (i * 71 + lt * 20 * (1 + (i % 3))) % W;
      const y = (i * 37 + lt * 60 * (1 + (i % 2))) % H;
      R(ctx, x, y, 2, 2, BIT_COLS[i % 8]);
    }
  }
  const done = prog(lt, 2.35, 2.7);
  const happy = lt > 2.15;
  faceCU(ctx, 192, 118 - Math.round(done * 2), 44, {
    pal: palAt('guy', GUY, d), hair: 'spiky', iris: k(P.navy),
    eyes: happy ? (done > 0.5 ? 'stars' : 'happy') : 'closed', brows: happy ? 'up' : 'flat',
    mouth: done > 0.4 ? 'grin' : 'flat', blush: d === 8,
  });
  // the can tips down out of shot once he is done
  const cy = 146 + Math.round(easeIn(done) * 90);
  canBottom(ctx, 192, cy, 18);
  for (const sd of [-1, 1]) {
    disc(ctx, 192 + sd * 21, cy + 6, 7, P.black);
    disc(ctx, 192 + sd * 21, cy + 6, 6, k(P.skin));
  }
}
function shotUpgrade(ctx, lt) {
  let d = 1;
  let scan = -1;
  let from = 1;
  for (const [t0, depth] of UPGRADES) {
    if (lt >= t0 + 0.35) d = depth;
    else if (lt >= t0) {
      from = d;
      d = depth;
      scan = (lt - t0) / 0.35;
    }
  }
  if (scan < 0) drinker(ctx, lt, d);
  else {
    // CRT-style redraw: rows above the beam are already at the new depth
    const y = Math.round(easeOut(scan) * H);
    drinker(ctx, lt, from);
    clipRect(ctx, 0, 0, W, y);
    drinker(ctx, lt, d);
    ctx.restore();
    R(ctx, 0, y - 1, W, 2, P.white);
    R(ctx, 0, y + 1, W, 1, A(P.white, 0.4));
  }
  const label = UPGRADES.filter(([t0]) => lt >= t0 + 0.2).pop();
  if (label) {
    const [t0, depth] = label;
    const big = depth === 8;
    kinetic(ctx, big ? '8-BIT!' : `${depth}-BIT`, 312, big ? 62 : 66, lt - t0 - 0.2, {
      style: 'stamp', scale: big ? 4 : 3, color: big ? P.yellow : mapper(depth)(P.white), outline: P.black, ow: 2, depth: big ? 3 : 2, depthColor: big ? P.red : P.black,
    });
  }
  depthWindow(ctx, OSD[0], OSD[1], d, d, lt);
}

// 6. PARTY: full colour; he dances on the bench and the whole park joins in.
const GRANNY = { S: P.skin, s: P.skinShade, H: P.silver, h: P.white, E: P.fog, T: P.magenta, t: P.purple, L: P.magenta, C: P.white, X: P.magenta, D: P.purple, d: P.maroon, B: P.maroon };
const KID = { S: P.tanShade, s: P.brown, H: P.black, h: P.slate, E: P.black, T: P.cyan, t: P.blue, L: P.cyan, C: P.cyan, X: P.cyan, b: P.navy, Y: P.navy, P: P.navy, p: P.ink, B: P.white, A: P.yellow, a: P.orange };
const UP = [[-5, -7], [-8, -15]];
const OUT = [[-7, 1], [-14, -2]];
const HIP = [[-6, 7], [0, 12]];
function shotParty(ctx, lt) {
  const cam = Math.round(tween(lt, 0, 4.8, 92, 76, 'inOut'));
  const beat = (lt * 150) / 60; // beats since the cut
  const ph = beat % 2;
  const hop = -Math.round(Math.abs(Math.sin(beat * Math.PI)) * 5);
  withCam(ctx, cam, 0, (c) => {
    c.drawImage(park(8), 0, 0);
    sun(c, SUN_X, 36, lt, 8);
    for (let i = 0; i < 3; i++) cloud(c, ((i * 190 + lt * 6) % 620) - 30, 22 + i * 14, 12 + i * 2, P.white, P.silver);
    // flowers bloom along the path edge, one after another
    for (let i = 0; i < 12; i++) {
      const fx = 20 + i * 44 + ((i * 13) % 11);
      const s = spring(lt - 0.1 - i * 0.06);
      if (s <= 0) continue;
      const fy = 162;
      R(c, fx, fy - Math.round(8 * Math.min(1, s)), 1, Math.round(8 * Math.min(1, s)), P.darkGreen);
      disc(c, fx, fy - Math.round(9 * s), Math.max(1, Math.round(3 * s)), BIT_COLS[i % 8]);
      R(c, fx, fy - Math.round(9 * s), 1, 1, P.white);
    }
    // granny on the path: hip sway, one arm up on the off-beat
    const gIn = easeOut(prog(lt, 0.3, 1.0));
    const gx = Math.round(lerp(96, 128, gIn));
    hero(c, gx, GROUND, {
      pal: palAt('granny', GRANNY, 8), hair: 'bun', glasses: true, legs: 'skirt', eyes: 'happy', mouth: 'open', blush: true,
      armL: poseAt((beat + 1) % 2, [[0, HIP], [1, UP, 'inOutBack'], [2, HIP, 'inOutBack']]), armR: HIP, bob: Math.round(Math.sin(beat * Math.PI) * 1.5),
    });
    // the kid hops on the beat
    const kx = Math.round(lerp(330, 292, easeOut(prog(lt, 0.5, 1.2))));
    const kj = Math.round(Math.abs(Math.sin(beat * Math.PI)) * 6);
    hero(c, kx, GROUND - kj, {
      pal: palAt('kid', KID, 8), hair: 'puff', small: true, legs: kj > 2 ? 'walk' : 'stand', step: 1, eyes: 'happy', mouth: 'grin',
      armL: kj > 3 ? UP : OUT, armR: kj > 3 ? UP : OUT,
    });
    pigeon(c, 252, GROUND - 1, lt, 8, { shades: true, mode: 'bob' });
    // him: dancing on the bench, can held high
    const armL = poseAt(ph, [[0, UP], [1, OUT, 'inOutBack'], [2, UP, 'inOutBack']]);
    const armR = poseAt(ph, [[0, OUT], [1, UP, 'inOutBack'], [2, OUT, 'inOutBack']]);
    const me = hero(c, BENCH_X, SEAT - 3 + hop, {
      pal: palAt('guy', GUY, 8), hair: 'spiky', legs: 'stand', sleeves: 'short', eyes: blink(lt, 5) ? 'closed' : 'happy',
      mouth: 'grin', blush: true, armL, armR, look: Math.round(Math.sin(beat * Math.PI)),
    });
    const [hx, hy] = me.handR;
    R(c, hx - 5, hy - 15, 11, 16, P.black);
    R(c, hx - 4, hy - 14, 9, 14, P.red);
    R(c, hx - 4, hy - 14, 9, 2, P.silver);
    R(c, hx - 4, hy - 9, 9, 2, P.white);
    if (Math.floor(beat * 2) % 2 === 0) for (let i = 0; i < 3; i++) R(c, hx - 2 + i * 2, hy - 20 - i * 3, 1, 1, P.white);
    benchFront(c, BENCH_X, 8);
  });
  // colour confetti
  for (let i = 0; i < 46; i++) {
    const x = (i * 83 + Math.sin(lt * 2 + i) * 8 + 1000) % W;
    const y = ((i * 41 + lt * (40 + (i % 5) * 9)) % (H + 20)) - 10;
    R(ctx, x, y, 2, 2, BIT_COLS[i % 8]);
  }
  // 256 TASTES badge on "two hundred and fifty-six"
  const bp = spring(lt - 0.75, 1.4, 4.5);
  const rr = badge(ctx, 322, 98, 32, bp, { n: 16, fill: P.yellow, rot: lt * 0.4, ring: P.orange });
  if (rr > 20) {
    bigText(ctx, '256', 322, 84, { scale: 3, color: P.red, outline: P.white, ow: 1, align: 'center' });
    micro(ctx, 'TASTES!', 322, 108, { color: P.black, align: 'center' });
  }
  depthWindow(ctx, OSD[0], OSD[1], 8, 8, lt);
}

// 7. HERO CAN: the turntable, the light sweep, ice.
function heroSet(ctx, lt) {
  bands(ctx, 0, 0, W, 166, [P.black, P.maroon]);
  // radial dithered glow behind the product
  clipCircle(ctx, 192, 104, 78);
  dither(ctx, 110, 20, 170, 150, P.darkRed, 'sparse');
  ctx.restore();
  clipCircle(ctx, 192, 104, 54);
  dither(ctx, 130, 40, 130, 120, P.darkRed, 'checker');
  ctx.restore();
  R(ctx, 0, 166, W, 50, P.black);
  R(ctx, 0, 166, W, 1, P.maroon);
  spotlight(ctx, 192, 166, { top: -4, w0: 16, w1: 56, a: 0.05, pool: P.maroon, poolRx: 60 });
  // fizz bits rising behind
  for (let i = 0; i < 14; i++) {
    const age = (lt * 0.8 + i / 14) % 1;
    const x = 192 + Math.sin(age * 9 + i) * (38 + i * 3);
    text(ctx, i % 2 ? '1' : '0', x, 150 - age * 140, { color: i % 3 ? P.pink : P.yellow });
  }
}
/** Ice-cold: condensation drops sliding down the front and a cold mist at the base. */
function frost(ctx, cx, top, r, lt) {
  const lh = Math.round(r * 2.6);
  for (let i = 0; i < 6; i++) {
    const x = cx - r + 6 + ((i * 17) % (2 * r - 10));
    const ph = (lt * (0.25 + (i % 3) * 0.08) + i * 0.37) % 1;
    const y = top + 14 + Math.round(ph * (lh - 18));
    R(ctx, x, y, 2, 2, P.white);
    R(ctx, x, y + 2, 2, 1, P.pink);
    R(ctx, x, y - 3, 1, 3, A(P.white, 0.35));
  }
  for (let i = 0; i < 5; i++) {
    const ph = (lt * 0.5 + i / 5) % 1;
    const sd = i % 2 ? 1 : -1;
    dither(ctx, cx + sd * (r - 6 + ph * 34) - 8, top + lh + 2 - ph * 6, 16, 4, P.white, ph < 0.5 ? 'checker' : 'sparse');
  }
}
function shotHero(ctx, lt) {
  heroSet(ctx, lt);
  const rise = Math.round(tween(lt, 0, 0.8, 10, 0, 'out'));
  const r = 32;
  const top = 64 + rise;
  const turn = 0.32 + lt * 0.28;
  // reflection on the glossy floor
  clipRect(ctx, 0, 167, W, 49);
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.translate(0, 2 * 167);
  ctx.scale(1, -1);
  can(ctx, 192, top, r, turn);
  ctx.restore();
  ctx.restore();
  shadow(ctx, 192, 167, 36, 0.5);
  can(ctx, 192, top, r, turn);
  // diagonal light sweep across the can
  const g = prog(lt, 0.6, 1.2);
  if (g > 0 && g < 1) {
    clipRect(ctx, 192 - r, top, 2 * r, Math.round(r * 2.6) + 8);
    for (let yy = 0; yy < 80; yy += 2) R(ctx, 192 - r - 20 + Math.round(g * (2 * r + 50)) + Math.round((80 - yy) * 0.4) - 16, top + yy, 6, 2, A(P.white, 0.6));
    ctx.restore();
  }
  frost(ctx, 192, top + Math.max(2, Math.round(r * 0.28)), r, lt);
  sparkle(ctx, 172, 98 + rise, twinkle(lt, 0.1), P.white);
  sparkle(ctx, 212, 132 + rise, twinkle(lt, 0.5), P.white);
  if (lt > 0.5) {
    const bp = spring(lt - 0.5, 1.5, 5);
    const rr = badge(ctx, 296, 62, 26, bp, { n: 12, fill: P.yellow, rot: -0.2 });
    if (rr > 16) {
      micro(ctx, 'NEW', 296, 51, { color: P.red, align: 'center' });
      text(ctx, '8-BIT', 296, 58, { color: P.black, align: 'center' });
      micro(ctx, 'RECIPE', 296, 68, { color: P.red, align: 'center' });
    }
  }
}

// 8. END SLATE, with the button gag: a 1-bit pigeon waddles in, pecks the can
// and gets its colour.
function slateBg(ctx, lt) {
  sunburst(ctx, 96, 112, lt * 0.03, 12, P.red, P.darkRed);
}
function slateProduct(ctx, lt) {
  oval(ctx, 96, 152, 46, 7, P.maroon);
  oval(ctx, 96, 151, 44, 5, P.black);
  shadow(ctx, 96, 151, 26, 0.5);
  const bob = Math.round(Math.sin(lt * 2.4) * 1.5);
  const hit = 3.0; // the peck
  const jolt = Math.round(wobble(lt, hit, 2, 4, 6));
  can(ctx, 96 + jolt, 70 + bob, 24, 0.5 + Math.sin(lt * 0.8) * 0.06);
  sparkle(ctx, 80, 92 + bob, twinkle(lt, 0.1), P.white);
  sparkle(ctx, 116, 128 + bob, twinkle(lt, 0.45), P.white);
  if (lt > 1.6) {
    const x = Math.round(Math.min(58, -14 + (lt - 1.6) * 40));
    const walking = x < 58;
    const pecking = lt > hit - 0.3 && lt < hit + 0.1;
    const gy = 151;
    const scan = prog(lt, hit + 0.05, hit + 0.45);
    const mode = walking ? 'walk' : pecking ? 'peck' : 'stand';
    pigeon(ctx, x, gy, walking ? lt : 0.13 * 2, scan >= 1 ? 8 : 1, { mode, shades: false });
    if (scan > 0 && scan < 1) {
      // its own little rescan, top to bottom
      clipRect(ctx, x - 12, gy - 16, 24, Math.round(18 * scan));
      pigeon(ctx, x, gy, 0, 8, { mode });
      ctx.restore();
    }
    if (scan >= 1) {
      micro(ctx, '8-BIT!', x + 1, 126 - Math.round(spring(lt - hit - 0.45) * 6), { color: P.yellow, align: 'center' });
      sparkle(ctx, x - 9, 132, twinkle(lt, 0.2), P.white);
    }
  }
}
function shotSlate(ctx, lt) {
  endSlate(ctx, lt, {
    bg: slateBg, product: slateProduct, mark: MARK, sub: SUB, markX: 266, markY: 22,
    line: 'NOW WITH 8 BITS OF FLAVOUR', lineColor: P.cream,
    tagline: 'TASTE EVERY BIT.', tag: { bg: P.yellow, edge: P.orange, color: P.maroon }, tagX: 266, tagY: 128,
    url: 'BITFIZZ.BIT', pill: { bg: P.maroon, border: P.pink }, urlY: 158,
    legal: 'CONTAINS NO ACTUAL BITS. 1-BIT EDITION AVAILABLE FOR PURISTS. SIDE EFFECTS MAY INCLUDE BURPING IN 8-BIT.',
  });
}

const SHOTS = [
  { at: 0, draw: shotLowRes },
  { at: 3.6, draw: shotGlow },
  { at: 5.2, draw: shotMachine, wipe: 'whip', wd: 0.36, dir: 1 },
  { at: 7.6, draw: shotCrack },
  { at: 9.6, draw: shotUpgrade, wipe: 'match', wd: 0.4, cx: 196, cy: 120 },
  { at: 12.8, draw: shotParty, wipe: 'flash', wd: 0.3 },
  { at: 17.6, draw: shotHero, wipe: 'irisInOut', wd: 0.8, fx: 286, fy: 112, cx: 192, cy: 110 },
  { at: 19.6, draw: shotSlate, wipe: 'match', wd: 0.4, cx: 120, cy: 112 },
];

// Jingle, 150 bpm, 60 beats = the whole spot. Lazy 1-bit summer, a sparkle for
// the glow, footsteps to the machine, the crack, three level-up arpeggios, the
// "BIT-FIZZ CO-LA" party theme and the "TASTE EV-ERY BIT" sting on the slate.
export default {
  id: 'bitfizz-cola',
  brand: 'BITFIZZ COLA',
  duration: 24,
  voice: { gender: 'male', lang: 'en-US', pitch: 1.0, rate: 1.05 },
  script: [
    { at: 0.5, text: 'Feeling a bit... low-res?' },
    { at: 5.4, text: 'Crack open an ice-cold BitFizz Cola...' },
    { at: 9.8, text: '...and upgrade to eight bits of flavour!' },
    { at: 13.3, text: 'Two hundred and fifty-six tastes in every sip!' },
    { at: 17.8, text: 'BitFizz Cola.' },
    { at: 19.9, text: 'Taste every bit.' },
  ],
  tune: {
    bpm: 150,
    wave: 'square',
    notes: tune(
      'E4:1 R:0.5 D4:0.5 C4:2 R:1 G3:1 C4:1 D4:1 E4:1',
      'B4:0.5 C5:0.5 B4:0.5 C5:0.5 E5:2',
      'G4:0.5 A4:0.5 B4:0.5 C5:0.5 D5:1 R:0.75 C4:0.5 R:1.75',
      'R:1 E5:0.5 F5:0.5 C6:1 G5:0.5 E5:0.5 C5:1',
      'C4:0.5 G4:0.5 C5:0.25 E5:0.25 G5:0.25 C6:0.25 R:1 D5:0.25 F#5:0.25 A5:0.25 D6:0.25 R:1 E5:0.25 G#5:0.25 B5:0.25 E6:0.25 G6:2',
      'C5:0.5 C5:0.5 G5:1 E5:0.5 F5:0.5 G5:1 A5:0.5 G5:0.5 F5:0.5 E5:0.5 D5:1 G4:1 C6:0.5 B5:0.5 A5:0.5 B5:0.5 C6:2',
      'E6:0.5 D6:0.5 C6:1 G5:1 E5:1 G5:1',
      'G5:0.5 G5:0.5 A5:0.5 G5:0.5 C6:2 R:1 E5:0.5 G5:0.5 C6:3 R:2',
    ),
    bass: tune(
      'C3:3 G2:3 A2:3',
      'E2:4',
      'G2:1 A2:1 B2:1 C3:1 D3:1 G2:1',
      'R:2 C3:1 G2:1 C3:1',
      'C3:1 C3:2 D3:2 E3:3',
      'C3:1 C3:1 G2:1 C3:1 F2:1 F2:1 G2:1 G2:1 F2:1 G2:1 C3:2',
      'C3:2 G2:2 C3:1',
      'F2:2 G2:2 C3:1 R:1 C3:1 G2:1 C3:1 R:2',
    ),
    bassWave: 'triangle',
    drums: tune(
      rep('H:1.5', 6),
      'R:4',
      'K:0.5 H:0.5 K:0.5 H:0.5 K:0.5 H:0.5 R:0.75 K:0.5 R:1.75',
      'R:1.5 S:0.25 S:0.25 S:1 R:2',
      rep('K:1 S:1', 4),
      rep('K:0.5 H:0.5 S:0.5 H:0.5', 6),
      'K:1 H:1 S:1 H:1 K:1',
      'K:1 S:1 K:1 S:1 K:2 R:1 K:1 S:1 R:2',
    ),
  },
  draw(ctx, t, dt, info) {
    play(ctx, dt, info, SHOTS);
  },
};
