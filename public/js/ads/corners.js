// CORNERS — square crisps for a square world. Brand colours: golden yellow,
// orange, tomato red. A blocky kid tries to eat a round crisp, but it simply
// will not fit in his square mouth; CORNERS do, with a CRUNCH. Then the
// flavours (Salt & Vector, Cheese & Pixel, new Prawn Cocktile) and a party.
// "All crunch. No curves."
//
// Pure function of the shot's local time: the kid is a procedural rig with a
// square mouth that opens and closes smoothly, crisps flip in 2.5D, and the
// static art (bags, sunburst, room) is cached.
import {
  P, W, H, R, A, rrect, disc, oval, poly, line, dither, bands, sparkle, shadow, stroke, cached, text, bigText,
  slogan, finePrint, urlPill, play, wordmark, drawMark, glint, prog, lerp, clamp, easeOut, easeIn, easeInOut,
  easeOutBack, starPts, tune, rep,
} from './kit.js';

const { round, floor, sin, cos, abs, min, max, PI } = Math;

// --- timing ------------------------------------------------------------------------------
// 120 bpm: one beat = 0.5 s; cuts on the beat.
const T_REVEAL = 4.0;
const T_CRUNCH = 7.5;
const T_FLAVOURS = 11.0;
const T_PARTY = 16.5;
const T_SLATE = 19.0;
const DURATION = 23.0;

/** Keyframe track: keys = [[t, value, ease?], ...]; ease shapes the segment arriving at that key. */
function kf(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (t < k[0]) {
      const a = keys[i - 1];
      return a[1] + (k[1] - a[1]) * (k[2] || easeInOut)((t - a[0]) / (k[0] - a[0]));
    }
  }
  return keys[keys.length - 1][1];
}
const bump = (t, a, b) => sin(PI * prog(t, a, b));
const back = (s) => (x) => easeOutBack(x, s);

// --- the blocky kid (procedural rig) ---------------------------------------------------------
// One reusable pose object; reset with kidPose(). Square head, square mouth.
const K = {};
function kidPose() {
  K.sq = 0; // head squash (+) / stretch (-)
  K.puff = 0; // cheeks puffed (crunching)
  K.eye = 1; // lid openness
  K.joy = 0; // happy closed eyes
  K.stars = 0; // starry eyes
  K.big = 1; // eye size
  K.cross = 0; // cross-eyed (stuck crisp)
  K.lookX = 0;
  K.lookY = 0;
  K.brow = 0; // + raised, - frowning
  K.open = 0; // square mouth 0..1
  K.smile = 0.5;
  K.chew = 0; // chewing wobble phase
  K.hair = 0; // hair standing on end 0..1
  K.aL = 0.2; // arms: shoulder angle (0 down, PI/2 out, PI up), elbow bend
  K.eL = 0.4;
  K.aR = 0.2;
  K.eR = 0.4;
  K.tRx = null; // right hand IK target
  K.tRy = 0;
  K.tLx = null;
  K.tLy = 0;
  K.shirt = P.red;
  K.shirtSh = P.darkRed;
  K.skin = P.skin;
  K.skinSh = P.skinShade;
  K.hairC = P.brown;
  K.body = true;
  return K;
}

const IK = [0, 0];
function ik(sx, sy, tx, ty, la, lb, side, bend) {
  const dx = (tx - sx) * side;
  const dy = ty - sy;
  const d = clamp(Math.hypot(dx, dy), abs(la - lb) + 0.5, la + lb - 0.01);
  const phi = Math.atan2(dx, dy);
  const al = Math.acos(clamp((la * la + d * d - lb * lb) / (2 * la * d), -1, 1));
  const be = Math.acos(clamp((la * la + lb * lb - d * d) / (2 * la * lb), -1, 1));
  IK[0] = phi - bend * al;
  IK[1] = bend * (PI - be);
  return IK;
}

const HANDS = [[0, 0], [0, 0]];
const MOUTH = [0, 0, 0, 0]; // x, y (centre), half width, height

function kidArm(ctx, sx, sy, side, a, e, s, out) {
  const la = s * 0.9;
  const lb = s * 0.8;
  const ex = sx + side * sin(a) * la;
  const ey = sy + cos(a) * la;
  const hx = ex + side * sin(a + e) * lb;
  const hy = ey + cos(a + e) * lb;
  stroke(ctx, [[sx, sy], [ex, ey], [hx, hy]], max(3, round(s * 0.36)), K.shirt, P.black);
  const hs = max(3, round(s * 0.26));
  R(ctx, hx - hs - 1, hy - hs - 1, hs * 2 + 2, hs * 2 + 2, P.black);
  R(ctx, hx - hs, hy - hs, hs * 2, hs * 2, K.skin);
  R(ctx, hx - hs, hy + hs - 1, hs * 2, 1, K.skinSh);
  out[0] = hx;
  out[1] = hy;
}

/** The kid: head centre (cx, cy), s = half the head size. Arms drawn when K.body. */
function kid(ctx, cx, cy, s, drawArms = true) {
  cx = round(cx);
  cy = round(cy);
  const hw = round(s * (1 + K.sq * 0.4 + K.puff * 0.08));
  const hh = round(s * (1 - K.sq * 0.4));
  // body
  if (K.body) {
    const bw = round(s * 1.25);
    const by = cy + hh - 2;
    rrect(ctx, cx - bw - 1, by - 1, bw * 2 + 2, round(s * 2.4), P.black, 3);
    rrect(ctx, cx - bw, by, bw * 2, round(s * 2.4), K.shirt, 3);
    R(ctx, cx + bw - round(s * 0.3), by + 3, round(s * 0.24), round(s * 2.2), K.shirtSh);
    R(ctx, cx - round(s * 0.3), by, round(s * 0.6), round(s * 0.18), K.skinSh);
  }
  // ears
  for (const sd of [-1, 1]) {
    R(ctx, cx + sd * hw - (sd < 0 ? round(s * 0.2) : 0) - 1, cy - round(s * 0.2) - 1, round(s * 0.2) + 2, round(s * 0.42) + 2, P.black);
    R(ctx, cx + sd * hw - (sd < 0 ? round(s * 0.2) : 0), cy - round(s * 0.2), round(s * 0.2), round(s * 0.42), K.skinSh);
  }
  // head (a rounded square, of course)
  rrect(ctx, cx - hw - 1, cy - hh - 1, hw * 2 + 2, hh * 2 + 2, P.black, 3);
  rrect(ctx, cx - hw, cy - hh, hw * 2, hh * 2, K.skinSh, 3);
  rrect(ctx, cx - hw, cy - hh, hw * 2 - round(s * 0.14), hh * 2 - round(s * 0.12), K.skin, 3);
  // hair block with tufts that stand up when excited
  const hy = cy - hh;
  const lift = round(K.hair * s * 0.35);
  R(ctx, cx - hw - 1, hy - round(s * 0.28) - 1, hw * 2 + 2, round(s * 0.62) + 2, P.black);
  R(ctx, cx - hw, hy - round(s * 0.28), hw * 2, round(s * 0.62), K.hairC);
  for (let i = 0; i < 3; i++) {
    const tx = cx - round(s * 0.5) + i * round(s * 0.42);
    const th = round(s * 0.22) + lift + (i === 1 ? round(s * 0.1) : 0);
    R(ctx, tx - 1, hy - round(s * 0.28) - th - 1, round(s * 0.26) + 2, th + 2, P.black);
    R(ctx, tx, hy - round(s * 0.28) - th, round(s * 0.26), th + 1, K.hairC);
  }
  R(ctx, cx - hw + 2, hy - round(s * 0.2), round(s * 0.5), max(1, round(s * 0.08)), P.tanShade);
  // eyes: little squares with a highlight; lids shrink them; stars / joy variants
  const ex = round(s * 0.42);
  const ey = cy - round(s * 0.1);
  const es = max(2, round(s * 0.2 * K.big));
  const lx = round(K.lookX * s * 0.08);
  const ly = round(K.lookY * s * 0.08);
  for (const sd of [-1, 1]) {
    const x = cx + sd * ex + lx + (K.cross ? -sd * round(s * 0.08) : 0);
    if (K.stars > 0.5) {
      poly(ctx, starPts(x, ey, 5, es + 3, round(es * 0.45), 0), P.black);
      poly(ctx, starPts(x, ey, 5, es + 1, round(es * 0.35), 0), P.yellow);
    } else if (K.joy > 0.5) {
      R(ctx, x - es, ey, es * 2, max(1, round(s * 0.08)), P.black);
      R(ctx, x - es - 1, ey + 1, 1, max(1, round(s * 0.08)), P.black);
      R(ctx, x + es, ey + 1, 1, max(1, round(s * 0.08)), P.black);
    } else {
      const eh = max(1, round(es * 2 * K.eye));
      R(ctx, x - es, ey + ly + (es * 2 - eh), es * 2, eh, P.black);
      if (eh > 2) R(ctx, x - es + 1, ey + ly + (es * 2 - eh) + 1, max(1, round(es * 0.6)), max(1, round(es * 0.6)), P.white);
    }
    // brows: blocky bars, raised or frowning
    const by = ey - round(s * 0.26) - round(K.brow * s * 0.1);
    const tiltIn = K.brow < 0 ? round(-K.brow * s * 0.1) : 0;
    R(ctx, x - es - 1, by + (sd > 0 ? tiltIn : 0), es + 1, max(1, round(s * 0.08)), K.hairC);
    R(ctx, x, by + (sd < 0 ? tiltIn : 0), es + 1, max(1, round(s * 0.08)), K.hairC);
    // cheeks
    R(ctx, x - round(s * 0.1) + sd * round(s * 0.12), cy + round(s * 0.28), round(s * 0.2), max(1, round(s * 0.08)), P.pink);
  }
  // the square mouth
  const mw = round(s * 0.32);
  const mh = round(s * 0.62 * K.open);
  const mx = cx + round(sin(K.chew) * s * 0.04);
  const my = cy + round(s * 0.45);
  MOUTH[0] = mx;
  MOUTH[1] = my + round(mh / 2);
  MOUTH[2] = mw;
  MOUTH[3] = mh;
  if (mh <= 1) {
    const cu = round(K.smile * s * 0.08);
    R(ctx, mx - mw, my, mw * 2, max(1, round(s * 0.07)), P.black);
    R(ctx, mx - mw - 1, my - cu, 1, max(1, cu + 1), P.black);
    R(ctx, mx + mw, my - cu, 1, max(1, cu + 1), P.black);
  } else {
    R(ctx, mx - mw - 1, my - 1, mw * 2 + 2, mh + 2, P.black);
    R(ctx, mx - mw, my, mw * 2, mh, P.maroon);
    R(ctx, mx - mw, my, mw * 2, max(1, round(s * 0.08)), P.white);
    if (mh > 4) R(ctx, mx - round(mw * 0.6), my + mh - round(mh * 0.35), round(mw * 1.2), round(mh * 0.35), P.pink);
  }
  if (drawArms && K.body) {
    const shY = cy + hh + round(s * 0.35);
    const bw = round(s * 1.25);
    if (K.tLx !== null) {
      ik(cx - bw + 2, shY, K.tLx, K.tLy, s * 0.9, s * 0.8, -1, -1);
      K.aL = IK[0];
      K.eL = IK[1];
    }
    if (K.tRx !== null) {
      ik(cx + bw - 2, shY, K.tRx, K.tRy, s * 0.9, s * 0.8, 1, -1);
      K.aR = IK[0];
      K.eR = IK[1];
    }
    kidArm(ctx, cx - bw + 2, shY, -1, K.aL, K.eL, s, HANDS[0]);
    kidArm(ctx, cx + bw - 2, shY, 1, K.aR, K.eR, s, HANDS[1]);
  }
}

// --- crisps -------------------------------------------------------------------------------------

/** The round crisp: golden disc with ridges; sx/sy squash factors. */
function roundCrisp(ctx, x, y, r, sx = 1, sy = 1) {
  const rx = max(1, round(r * sx));
  const ry = max(1, round(r * sy));
  oval(ctx, x, y, rx + 1, ry + 1, P.black);
  oval(ctx, x, y, rx, ry, P.yellow);
  oval(ctx, x + round(rx * 0.25), y + round(ry * 0.25), round(rx * 0.6), round(ry * 0.6), P.orange);
  oval(ctx, x, y, round(rx * 0.75), round(ry * 0.75), P.yellow);
  if (rx > 4) for (let i = -1; i <= 1; i++) R(ctx, x - round(rx * 0.5), y + i * round(ry * 0.4), round(rx * 0.9), 1, A(P.orange, 0.8));
  R(ctx, x - round(rx * 0.5), y - round(ry * 0.55), max(1, round(rx * 0.3)), 1, P.cream);
}

/**
 * The square crisp, spinning in 2.5D: spin flips it around the vertical axis
 * (width = |cos|); its back is a shade darker. s = half size.
 */
function squareCrisp(ctx, x, y, s, spin = 0, tiltY = 1) {
  const c = cos(spin);
  const hw = max(1, round(s * abs(c)));
  const hh = max(1, round(s * tiltY));
  const front = c >= 0;
  R(ctx, x - hw - 1, y - hh - 1, hw * 2 + 2, hh * 2 + 2, P.black);
  R(ctx, x - hw, y - hh, hw * 2, hh * 2, front ? P.yellow : P.orange);
  if (hw > 3) {
    R(ctx, x - hw, y + hh - max(1, round(s * 0.18)), hw * 2, max(1, round(s * 0.18)), front ? P.orange : P.rust);
    R(ctx, x - hw + 1, y - hh + 1, max(1, round(hw * 0.5)), 1, P.cream);
    if (front && hw > 5) {
      // ridges and salt
      for (let i = -1; i <= 1; i++) R(ctx, x - hw + 2, y + i * round(hh * 0.45), hw * 2 - 4, 1, A(P.orange, 0.7));
      R(ctx, x - round(hw * 0.4), y - round(hh * 0.3), 1, 1, P.white);
      R(ctx, x + round(hw * 0.3), y + round(hh * 0.2), 1, 1, P.white);
      R(ctx, x + round(hw * 0.5), y - round(hh * 0.6), 1, 1, P.white);
    }
  }
}

// --- the bag ------------------------------------------------------------------------------------

const FLAVOURS = [
  { name: 'SALT & VECTOR', body: P.blue, dark: P.navy, band: P.white, ink: P.navy },
  { name: 'CHEESE & PIXEL', body: P.yellow, dark: P.orange, band: P.navy, ink: P.white },
  { name: 'PRAWN COCKTILE', body: P.pink, dark: P.red, band: P.white, ink: P.red },
];

const LOGO = () => wordmark('CORNERS', {
  h: 16, pen: 1, square: true, wide: 0.9, gap: 2,
  fill: [P.white, P.yellow, P.yellow], outline: [[P.black, 1], [P.red, 1]], depth: 1, depthColor: P.darkRed,
});
const BIGLOGO = () => wordmark('CORNERS', {
  h: 30, pen: 3, square: true, wide: 0.85, gap: 3,
  fill: [P.white, P.yellow, P.yellow, P.orange], outline: [[P.black, 2], [P.red, 2], [P.black, 1]], depth: 4, depthColor: P.darkRed,
});

/** The flavour icon on each bag's window. */
function flavourIcon(c, f, x, y) {
  if (f === 0) {
    // a vector arrow
    line(c, x - 9, y + 6, x + 6, y - 6, P.navy, 2);
    poly(c, [[x + 9, y - 9], [x + 1, y - 7], [x + 7, y - 1]], P.navy);
    R(c, x - 11, y + 5, 3, 3, P.white);
  } else if (f === 1) {
    // a wedge of very square cheese
    R(c, x - 10, y - 6, 20, 13, P.black);
    R(c, x - 9, y - 5, 18, 11, P.yellow);
    R(c, x - 9, y - 5, 18, 3, P.cream);
    R(c, x - 5, y + 1, 3, 3, P.orange);
    R(c, x + 3, y - 1, 2, 2, P.orange);
  } else {
    // a pixel prawn
    for (const [dx, dy, w] of [[-8, -4, 6], [-4, -6, 8], [2, -4, 6], [5, 0, 5], [2, 4, 5], [-4, 5, 4]]) {
      R(c, x + dx - 1, y + dy - 1, w + 2, 5, P.black);
      R(c, x + dx, y + dy, w, 3, P.orange);
    }
    R(c, x - 10, y - 6, 3, 3, P.black);
    line(c, x - 9, y - 6, x - 14, y - 12, P.red);
  }
}

const BAG_W = 64;
const BAG_H = 88;
/** Cached bag art for flavour f (64 x 88). */
const bagArt = (f) =>
  cached(`cn-bag${f}`, BAG_W, BAG_H, (c) => {
    const F = FLAVOURS[f];
    const crimp = (y, up) => {
      for (let x = 0; x < BAG_W; x += 4) {
        R(c, x, y, 4, 4, P.black);
        R(c, x + 1, up ? y + 1 : y, 2, 3, F.dark);
      }
    };
    rrect(c, 1, 3, BAG_W - 2, BAG_H - 6, P.black, 3);
    rrect(c, 2, 4, BAG_W - 4, BAG_H - 8, F.body, 3);
    R(c, BAG_W - 12, 6, 8, BAG_H - 12, F.dark);
    R(c, 6, 8, 4, BAG_H - 16, A(P.white, 0.45));
    crimp(0, true);
    crimp(BAG_H - 4, false);
    // logo
    const lg = LOGO();
    c.drawImage(lg.cv, round(BAG_W / 2 - lg.w / 2) - lg.ox, 12 - lg.oy);
    // window with a pile of square crisps
    rrect(c, 9, 34, BAG_W - 18, 26, P.black, 2);
    rrect(c, 10, 35, BAG_W - 20, 24, P.cream, 2);
    for (const [x, y] of [[20, 50], [32, 46], [44, 51], [26, 42], [38, 54]]) {
      R(c, x - 6, y - 6, 12, 12, P.black);
      R(c, x - 5, y - 5, 10, 10, P.yellow);
      R(c, x - 5, y + 3, 10, 2, P.orange);
    }
    flavourIcon(c, f, BAG_W / 2, 47);
    // flavour band
    R(c, 2, 64, BAG_W - 4, 14, P.black);
    R(c, 2, 65, BAG_W - 4, 12, F.band);
    const words = F.name.split(' & ');
    text(c, words[0], BAG_W / 2, 66, { color: F.ink, align: 'center' });
    text(c, `& ${words[1]}`.slice(0, 12), BAG_W / 2, 71, { color: F.ink, align: 'center' });
  });

/**
 * A bag standing on by (bottom), squashed (sq > 0) or stretched (sq < 0) by
 * drawing the cached art scaled vertically in whole rows from the top.
 */
function bag(ctx, f, cx, by, sq = 0) {
  const art = bagArt(f);
  const h = round(BAG_H * (1 - sq));
  const w = round(BAG_W * (1 + sq * 0.5));
  ctx.drawImage(art, round(cx - w / 2), by - h, w, h);
}

// --- shared backdrops ---------------------------------------------------------------------------------

const burstArt = () =>
  cached('cn-burst', W, H, (c) => {
    R(c, 0, 0, W, H, P.orange);
    for (let i = 0; i < 20; i++) {
      const a0 = (i / 20) * PI * 2;
      const a1 = a0 + PI / 20;
      poly(c, [[192, 96], [192 + cos(a0) * 500, 96 + sin(a0) * 500], [192 + cos(a1) * 500, 96 + sin(a1) * 500]], P.yellow);
    }
    for (let i = 4; i >= 1; i--) disc(c, 192, 96, 30 + i * 22, A(P.white, 0.08));
  });

const roomArt = () =>
  cached('cn-room', W, 150, (c) => {
    R(c, 0, 0, W, 150, P.cream);
    for (let y = 0; y < 150; y += 12) for (let x = (y / 12) % 2 ? 0 : 12; x < W; x += 24) R(c, x, y, 12, 12, A(P.tan, 0.25));
    // party bunting
    for (let i = 0; i < 12; i++) {
      const x = 8 + i * 32;
      const y = 14 + round(sin(i * 0.9) * 2);
      poly(c, [[x, y], [x + 22, y], [x + 11, y + 14]], [P.red, P.yellow, P.blue, P.green][i % 4]);
    }
    line(c, 0, 14, W, 14, P.brown);
    // window
    R(c, 270, 34, 80, 64, P.black);
    R(c, 272, 36, 76, 60, P.cyan);
    R(c, 272, 80, 76, 16, P.green);
    R(c, 308, 36, 4, 60, P.white);
    R(c, 266, 98, 88, 4, P.black);
  });

// --- shot 1: the round crisp that will not fit (0 - 4.0) ---------------------------------------------

function shotStruggle(ctx, lt) {
  const pan = round(kf(lt, [[0, 0], [4, -10]]));
  ctx.drawImage(roomArt(), pan * 0.5, 0);
  // table with a bowl of round crisps
  R(ctx, 0, 150, W, 66, P.red);
  for (let x = 0; x < W; x += 16) R(ctx, x, 150, 8, 66, P.darkRed);
  R(ctx, 0, 150, W, 3, P.black);
  const bx = 282 + pan;
  oval(ctx, bx, 158, 46, 9, P.black);
  oval(ctx, bx, 156, 45, 8, P.white);
  for (const [dx, dy] of [[-28, -4], [-12, -8], [6, -6], [22, -5], [-20, 2], [14, 1], [32, -1], [0, -2]]) roundCrisp(ctx, bx + dx, 152 + dy, 8, 1, 0.6);
  poly(ctx, [[bx - 45, 156], [bx + 45, 156], [bx + 34, 176], [bx - 34, 176]], P.black);
  poly(ctx, [[bx - 43, 157], [bx + 43, 157], [bx + 33, 175], [bx - 33, 175]], P.white);
  R(ctx, bx - 30, 166, 60, 2, P.silver);
  const cx = 150 + pan;
  const cy = 86;
  const s = 26;
  // the crisp's journey: chest → mouth (bonk) → flies off; second try edge-on → stuck
  kidPose();
  const bonk = prog(lt, 1.18, 1.32);
  const firstTry = lt < 1.6;
  const retry = prog(lt, 2.0, 2.5);
  K.open = kf(lt, [[0.5, 0], [0.95, 1, easeOut], [1.35, 1], [1.6, 0.2], [2.1, 0.2], [2.4, 0.9], [2.6, 0.75]]);
  K.sq = 0.12 * bump(lt, 1.18, 1.45);
  K.brow = kf(lt, [[0.4, 0.6], [1.2, 0.6], [1.5, -1], [2.0, -1], [2.5, 0.2]]);
  K.smile = lt < 1.3 ? 0.8 : -0.6;
  K.lookX = lt > 3.0 ? 0 : -0.4;
  K.lookY = lt < 1.0 ? 1 : lt > 3.0 ? 0 : 0;
  K.cross = lt > 2.55 && lt < 3.0 ? 1 : 0;
  K.eye = lt > 3.05 ? 0.55 : lt % 2.4 > 2.3 ? 0.1 : 1;
  K.shirt = P.blue;
  K.shirtSh = P.navy;
  const mouthX = cx;
  const mouthY = cy + round(s * 0.45) + 6;
  // hand target: where the crisp is held
  let hx;
  let hy;
  if (firstTry) {
    const lift = kf(lt, [[0.3, 0], [1.15, 1, easeInOut]]);
    hx = lerp(cx + 30, mouthX + 18, lift) + 14 * bump(lt, 1.18, 1.4);
    hy = lerp(cy + 52, mouthY + 4, lift);
  } else {
    hx = lerp(cx + 34, mouthX + 18, retry);
    hy = lerp(cy + 50, mouthY + 4, retry);
  }
  K.tRx = hx;
  K.tRy = hy;
  K.aL = 0.3;
  K.eL = 0.5;
  kid(ctx, cx, cy, s);
  const hand = HANDS[1];
  if (firstTry) {
    if (lt < 1.32) {
      // held, then squashed flat against the square mouth
      const crispX = hand[0] - 14;
      roundCrisp(ctx, crispX, hand[1] - 2, 14, 1 - 0.35 * bonk, 1 + 0.15 * bonk);
    } else {
      // BOINK: it springs off in an arc and spins away
      const f = prog(lt, 1.32, 2.0);
      const x = lerp(hand[0] - 14, cx + 150, f);
      const y = mouthY - 2 - 70 * f + 130 * f * f;
      roundCrisp(ctx, x, y, 14, abs(cos(f * 9)), 1);
    }
  } else if (lt > 2.0) {
    // edge-on: wedged sideways across the mouth, sticking out both sides
    const turn = prog(lt, 2.0, 2.35);
    const stuck = lt > 2.5;
    const x = stuck ? mouthX : hand[0] - 14;
    const y = stuck ? mouthY + 3 : hand[1] - 2;
    if (stuck) roundCrisp(ctx, x, y, 14, 1.25, 0.3);
    else roundCrisp(ctx, x, y, 14, lerp(1, 0.3, turn), 1);
  }
  if (lt > 1.2 && lt < 1.7) bigText(ctx, 'BOINK!', cx + 70, cy - 46 - round(easeOut(prog(lt, 1.2, 1.6)) * 8), { scale: 2, color: P.white, outline: P.black, ow: 2 });
  if (lt > 2.55 && lt < 3.4) {
    for (let i = 0; i < 2; i++) R(ctx, cx + (i ? 30 : -34), cy - 32 + round(sin(lt * 20 + i) * 1), 3, 4, P.cyan);
  }
  // the deadpan look to camera
  if (lt > 3.05) bigText(ctx, '...', cx + 46, cy - 40, { scale: 2, color: P.navy, outline: null });
}

// --- shot 2: the reveal (4.0 - 7.5) ------------------------------------------------------------------

function shotReveal(ctx, lt) {
  ctx.drawImage(burstArt(), 0, 0);
  R(ctx, 0, 168, W, 48, P.red);
  R(ctx, 0, 168, W, 3, P.darkRed);
  // the bag drops in and lands with a squash
  const fall = easeIn(prog(lt, 0.05, 0.4));
  const by = round(lerp(-10, 172, fall));
  const sq = lt < 0.4 ? -0.12 * fall : kf(lt, [[0.4, 0.28], [0.55, -0.1, easeOut], [0.7, 0.05], [0.85, 0]]);
  shadow(ctx, 230, 172, round(30 * fall), 0.35);
  bag(ctx, 0, 230, by, sq);
  // POP: the top tears off and flies away
  const pop = prog(lt, 1.4, 2.1);
  if (pop > 0 && pop < 1) {
    const x = 230 + pop * 90;
    const y = by - BAG_H + 2 - 80 * pop + 140 * pop * pop;
    R(ctx, round(x - 32), round(y), 64, 5, P.black);
    R(ctx, round(x - 31), round(y + 1), 62, 3, P.navy);
  }
  if (lt > 1.4 && lt < 1.8) bigText(ctx, 'POP!', 270, 54, { scale: 2, color: P.white, outline: P.black, ow: 2 });
  // the kid, amazed, catches the crisp that springs out
  kidPose();
  const cx = 104;
  const cy = 98;
  const s = 22;
  const amazed = prog(lt, 0.45, 0.6);
  const got = lt > 2.3;
  K.big = 1 + 0.25 * amazed;
  K.brow = amazed;
  K.open = got ? 0 : 0.55 * amazed;
  K.smile = got ? 1 : 0.4;
  K.joy = got && lt > 2.6 ? 1 : 0;
  K.lookX = got ? 0 : 1;
  K.lookY = got ? 0.5 : -0.5 + amazed * 0.3;
  K.hair = 0.6 * bump(lt, 0.45, 1.0);
  K.shirt = P.blue;
  K.shirtSh = P.navy;
  const catch_ = kf(lt, [[1.8, 0], [2.3, 1, easeOut]]);
  K.tRx = lerp(cx + 28, cx + 46, catch_);
  K.tRy = lerp(cy + 50, cy + 30, catch_) - 6 * bump(lt, 2.3, 2.5);
  K.aL = 0.4 + 0.6 * amazed;
  K.eL = 0.8 * amazed;
  kid(ctx, cx, cy, s);
  const hand = HANDS[1];
  const fly = prog(lt, 1.5, 2.3);
  if (fly > 0) {
    const x = fly < 1 ? lerp(230, hand[0], fly) : hand[0];
    const y = fly < 1 ? lerp(by - BAG_H, hand[1] - 12, fly) - sin(fly * PI) * 60 : hand[1] - 12;
    squareCrisp(ctx, round(x), round(y), 9, fly < 1 ? fly * PI * 6 : 0);
    if (fly >= 1 && lt < 3.0) sparkle(ctx, hand[0] + 12, hand[1] - 22, floor(lt * 12) % 4, P.white);
  }
  // the brand name slams in
  const lp = prog(lt, 0.55, 0.95);
  if (lp > 0) {
    const mk = BIGLOGO();
    const x0 = drawMark(ctx, mk, 192, 14, { reveal: lp, drop: 34 });
    glint(ctx, mk.cv, x0 - mk.ox, 14 - mk.oy, (lt - 1.2) / 0.6, { width: 7 });
  }
}

// --- shot 3: CRUNCH (7.5 - 11.0) ---------------------------------------------------------------------

const CRUMBS = 26;
function shotCrunch(ctx, lt) {
  ctx.drawImage(burstArt(), 0, 0);
  const shakeX = lt > 0.88 && lt < 1.1 ? (floor(lt * 40) % 2) * 2 - 1 : 0;
  ctx.save();
  ctx.translate(shakeX, 0);
  kidPose();
  const cx = 168;
  const cy = 104;
  const s = 64;
  const bite = 0.86;
  const chewing = lt > bite;
  K.body = true;
  K.shirt = P.blue;
  K.shirtSh = P.navy;
  K.open = kf(lt, [[0.15, 0], [0.6, 0.62, easeOut], [0.8, 0.62], [bite, 0, easeIn]]);
  K.lookX = lt < bite ? 0.6 : 0;
  K.lookY = lt < bite ? 0.6 : 0;
  K.big = lt < bite ? 1.1 : 1;
  K.brow = lt < bite ? 0.5 : 1;
  K.stars = chewing && lt < 1.8 ? 1 : 0;
  K.joy = lt >= 1.8 ? 1 : 0;
  K.hair = chewing ? 1 - prog(lt, 1.2, 2.2) * 0.6 : 0;
  K.puff = chewing ? 1 : 0;
  K.chew = chewing ? (lt - bite) * 22 : 0;
  K.sq = chewing ? 0.05 * sin((lt - bite) * 22) + 0.1 * bump(lt, bite, bite + 0.12) : 0;
  K.smile = 1;
  const slide = kf(lt, [[0.25, 0], [0.82, 1, easeInOut]]);
  K.tRx = lerp(cx + 110, cx + 40, slide);
  K.tRy = lerp(cy + 120, cy + 40, slide);
  K.aL = 0.3;
  K.eL = 0.3;
  kid(ctx, cx, cy, s, false);
  // the crisp slides in at exactly mouth size: a perfect fit
  if (lt < bite + 0.02) {
    const mw = round(s * 0.32);
    const tx = lerp(cx + 96, MOUTH[0], slide);
    const ty = lerp(cy + 104, cy + round(s * 0.45) + round(s * 0.62 * 0.62 / 2), slide);
    squareCrisp(ctx, round(tx), round(ty), mw - 1, 0, 1);
  }
  // the hand (forearm rising from the bottom of the frame)
  const hx = round(lerp(cx + 120, cx + 72, slide) + (chewing ? 20 * prog(lt, bite, bite + 0.4) : 0));
  const hy = round(lerp(cy + 120, cy + 70, slide) + (chewing ? 40 * prog(lt, bite, bite + 0.5) : 0));
  stroke(ctx, [[hx + 20, H + 10], [hx, hy]], 14, K.shirt, P.black);
  R(ctx, hx - 11, hy - 11, 22, 22, P.black);
  R(ctx, hx - 10, hy - 10, 20, 20, K.skin);
  R(ctx, hx - 10, hy + 7, 20, 3, K.skinSh);
  ctx.restore();
  if (chewing) {
    // crumbs: little squares flung out in arcs under gravity
    const f = lt - bite;
    for (let i = 0; i < CRUMBS; i++) {
      const a = -PI * 0.95 + (i / CRUMBS) * PI * 0.9 + ((i * 37) % 7) * 0.03;
      const v = 90 + ((i * 53) % 60);
      const x = MOUTH[0] + cos(a) * v * f;
      const y = MOUTH[1] + sin(a) * v * f + 160 * f * f;
      if (y > H + 4) continue;
      const sz = 2 + (i % 3);
      R(ctx, round(x) - 1, round(y) - 1, sz + 2, sz + 2, P.black);
      R(ctx, round(x), round(y), sz, sz, i % 4 ? P.yellow : P.orange);
    }
    // the CRUNCH letters burst out of the mouth, then settle
    const word = 'CRUNCH!';
    for (let i = 0; i < word.length; i++) {
      const p = prog(lt, bite + i * 0.03, bite + 0.25 + i * 0.03);
      if (p <= 0) continue;
      const tx = 40 + i * 44;
      const ty = 18 + round(sin(i * 1.3) * 6);
      const x = lerp(MOUTH[0], tx, easeOutBack(p, 1.8));
      const y = lerp(MOUTH[1], ty, easeOutBack(p, 1.8));
      bigText(ctx, word[i], round(x), round(y), { scale: 5, color: P.white, outline: P.black, ow: 2, depth: 4, depthColor: P.red });
    }
    // shock lines around the mouth
    const sl = prog(lt, bite, bite + 0.3);
    if (sl < 1) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * PI * 2 + 0.2;
        const r0 = 30 + sl * 50;
        line(ctx, MOUTH[0] + cos(a) * r0, MOUTH[1] + sin(a) * r0 * 0.7, MOUTH[0] + cos(a) * (r0 + 14), MOUTH[1] + sin(a) * (r0 + 14) * 0.7, P.white, 2);
      }
    }
  }
}

// --- shot 4: the flavours (11.0 - 16.5) -----------------------------------------------------------------

const ARRIVALS = [0.1, 1.3, 2.8];
const SLOTS = [96, 192, 288];

function shotFlavours(ctx, lt) {
  bands(ctx, 0, 0, W, 160, [P.navy, P.blue, P.cyan]);
  // three soft spotlights
  for (let i = 0; i < 3; i++) {
    const on = prog(lt, ARRIVALS[i], ARRIVALS[i] + 0.2);
    if (on > 0) poly(ctx, [[SLOTS[i] - 8, 0], [SLOTS[i] + 8, 0], [SLOTS[i] + 46, 160], [SLOTS[i] - 46, 160]], A(P.white, 0.12 * on));
  }
  R(ctx, 0, 160, W, 56, P.ink);
  R(ctx, 0, 160, W, 2, P.steel);
  for (let i = 0; i < 3; i++) oval(ctx, SLOTS[i], 162, 40, 7, P.slate);
  for (let i = 0; i < 3; i++) {
    const at = ARRIVALS[i];
    const p = prog(lt, at, at + 0.45);
    if (p <= 0) continue;
    // slides in from the right, overshoots, and lands with a squash
    const x = round(lerp(W + 50, SLOTS[i], easeOutBack(p, 1.3)));
    const sq = kf(lt, [[at + 0.35, 0], [at + 0.45, 0.16, easeOut], [at + 0.6, -0.06], [at + 0.75, 0]]);
    shadow(ctx, x, 162, 30, 0.4);
    bag(ctx, i, x, 162, sq - (p < 1 ? 0.05 : 0));
    // name plate types in under it
    const tp = prog(lt, at + 0.4, at + 0.7);
    if (tp > 0) {
      const F = FLAVOURS[i];
      const half = round(54 * easeOut(tp));
      R(ctx, SLOTS[i] - half, 174, half * 2, 15, P.black);
      R(ctx, SLOTS[i] - half + 1, 175, half * 2 - 2, 13, F.body);
      if (tp >= 1) text(ctx, F.name, SLOTS[i], 178, { color: F.body === P.yellow ? P.navy : P.white, align: 'center' });
    }
  }
  // NEW! starburst on the third bag
  const np = easeOutBack(prog(lt, 3.5, 3.75), 2.4);
  if (np > 0) {
    const r = round(18 * np);
    poly(ctx, starPts(318, 86, 10, r + 2, round(r * 0.7) + 2, lt * 0.5), P.black);
    poly(ctx, starPts(318, 86, 10, r, round(r * 0.7), lt * 0.5), P.yellow);
    if (np > 0.9) text(ctx, 'NEW!', 318, 83, { color: P.red, align: 'center' });
  }
  text(ctx, 'THREE SQUARE FLAVOURS', 192, 200, { color: P.silver, align: 'center' });
}

// --- shot 5: party (16.5 - 19.0) ---------------------------------------------------------------------

const PARTY = [
  { x: 64, shirt: P.green, sh: P.darkGreen, hair: P.black, skin: P.tan, skinSh: P.tanShade },
  { x: 150, shirt: P.blue, sh: P.navy, hair: P.brown, skin: P.skin, skinSh: P.skinShade },
  { x: 236, shirt: P.magenta, sh: P.purple, hair: P.rust, skin: P.skin, skinSh: P.skinShade },
  { x: 320, shirt: P.orange, sh: P.rust, hair: P.yellow, skin: P.tan, skinSh: P.tanShade },
];

function shotParty(ctx, lt) {
  ctx.drawImage(roomArt(), 0, 0);
  R(ctx, 0, 150, W, 66, P.purple);
  for (let x = 0; x < W; x += 16) R(ctx, x, 150, 8, 66, P.magenta);
  // everybody bops on the beat (2 per second), each a little behind the last
  for (let i = 0; i < PARTY.length; i++) {
    const p = PARTY[i];
    const beat = lt * 2 + i * 0.25;
    const bop = abs(sin(beat * PI));
    kidPose();
    K.shirt = p.shirt;
    K.shirtSh = p.sh;
    K.hairC = p.hair;
    K.skin = p.skin;
    K.skinSh = p.skinSh;
    K.sq = 0.08 * (1 - bop) - 0.04;
    K.joy = 1;
    K.smile = 1;
    K.open = i % 2 ? 0.25 + 0.25 * bop : 0;
    K.chew = i % 2 ? 0 : beat * 4;
    K.aL = 0.6 + 1.6 * bop;
    K.eL = 0.6;
    K.aR = 2.2 - 1.2 * bop;
    K.eR = 0.8;
    kid(ctx, p.x, 96 - round(bop * 6), 18);
    if (i === 1 || i === 3) squareCrisp(ctx, round(HANDS[1][0]), round(HANDS[1][1]) - 9, 6, beat * 1.5);
  }
  // confetti squares drifting down
  for (let i = 0; i < 30; i++) {
    const x = (i * 71 + lt * (20 + (i % 5) * 6)) % W;
    const y = (i * 37 + lt * (40 + (i % 3) * 14)) % 150;
    R(ctx, round(x), round(y), 2, 2, [P.red, P.yellow, P.blue, P.green, P.white][i % 5]);
  }
  // meanwhile, the round crisp rolls away, sadly
  const rx = round(lerp(170, 420, prog(lt, 0.3, 2.5)));
  const spin = lt * 6;
  roundCrisp(ctx, rx, 186, 12, 1, 1);
  const fx = rx + round(cos(spin) * 3);
  R(ctx, fx - 5, 183, 2, 2, P.black);
  R(ctx, fx + 3, 183, 2, 2, P.black);
  R(ctx, fx - 3, 190, 6, 1, P.black);
  R(ctx, fx - 2, 189, 1, 1, P.black);
  R(ctx, fx + 2, 189, 1, 1, P.black);
  R(ctx, fx - 6, 186 + (floor(lt * 6) % 3), 1, 2, P.cyan);
}

// --- shot 6: end slate (19.0 - 23.0) -------------------------------------------------------------------

function shotSlate(ctx, lt) {
  ctx.drawImage(burstArt(), 0, 0);
  R(ctx, 0, 170, W, 46, P.red);
  R(ctx, 0, 170, W, 3, P.darkRed);
  // three bags fan in: the hero in the middle
  for (const [f, x, d] of [[2, 290, 0.25], [1, 94, 0.15], [0, 192, 0]]) {
    const p = easeOutBack(prog(lt, d, d + 0.45), 1.5);
    if (p <= 0) continue;
    const y = round(lerp(260, 172, p));
    shadow(ctx, x, 172, 30, 0.35);
    bag(ctx, f, x, y, f === 0 ? -0.0 : 0);
  }
  glint(ctx, bagArt(0), 192 - BAG_W / 2, 172 - BAG_H, (lt - 0.8) / 0.6, { width: 6 });
  const mk = BIGLOGO();
  const x0 = drawMark(ctx, mk, 192, 12, { reveal: prog(lt, 0.3, 0.9), drop: 30 });
  glint(ctx, mk.cv, x0 - mk.ox, 12 - mk.oy, (lt - 1.4) / 0.6, { width: 7 });
  if (lt > 1.0) slogan(ctx, 'ALL CRUNCH. NO CURVES.', 192, 52, lt - 1.0, { scale: 2, bg: P.red, edge: P.darkRed });
  const up = easeOutBack(prog(lt, 1.8, 2.1), 2);
  if (up > 0) urlPill(ctx, 'CORNERS.SNACK', 192, round(lerp(200, 180, up)), { bg: P.black, border: P.yellow, color: P.yellow });
  finePrint(ctx, 'CONTAINS 0% CURVES. MAY CONTAIN TRACES OF ROUND THINGS. CRUNCH RESPONSIBLY.', { lt: lt - 2.0 });
}

const SCENES = [
  { at: 0, draw: shotStruggle },
  { at: T_REVEAL, draw: shotReveal, wipe: 'blocks', wd: 0.4 },
  { at: T_CRUNCH, draw: shotCrunch, wipe: 'cut' },
  { at: T_FLAVOURS, draw: shotFlavours, wipe: 'push', wd: 0.4 },
  { at: T_PARTY, draw: shotParty, wipe: 'bars', wd: 0.4 },
  { at: T_SLATE, draw: shotSlate, wipe: 'iris', wd: 0.45, cx: 192, cy: 120 },
];

export default {
  id: 'corners',
  brand: 'CORNERS',
  duration: DURATION,
  voice: { gender: 'male', lang: 'en-US', pitch: 1.1, rate: 1.08 },
  script: [
    { at: 0.4, text: "Tired of snacks that just don't... fit?" },
    { at: 4.2, text: 'Introducing Corners! The crisps that are all corners!' },
    { at: 7.9, text: 'Four corners of crunch in every bite!' },
    { at: 11.2, text: 'Salt and Vector! Cheese and Pixel! And new... Prawn Cocktile!' },
    { at: 19.3, text: 'Corners. All crunch. No curves.' },
  ],
  // 120 bpm, 46 beats = 23 s, C major, bouncy square lead: a fumbling riff (8),
  // a rising reveal (7), a big hit on the CRUNCH (7), the flavour parade (11),
  // a party groove (5) and the sting resolving on C with the slate (8).
  tune: {
    bpm: 120,
    wave: 'square',
    notes: tune(
      'C5:0.5 R:0.5 E5:0.5 R:0.5 D5:0.5 C5:0.5 G4:1 C5:0.5 R:0.5 E5:0.5 F5:0.5 E5:1 R:1',
      'G4:0.5 A4:0.5 B4:0.5 C5:0.5 D5:0.5 E5:0.5 F5:0.5 G5:1 R:2.5',
      'C6:1 R:1 G5:0.5 E5:0.5 C5:1 D5:0.5 E5:0.5 C5:2',
      'E5:0.5 G5:0.5 E5:1 R:1 F5:0.5 A5:0.5 F5:1 R:1 G5:0.5 B5:0.5 G5:0.5 A5:0.5 B5:1 C6:2',
      'C5:0.5 E5:0.5 G5:0.5 E5:0.5 C5:0.5 E5:0.5 G5:1 R:1',
      'C6:0.5 B5:0.5 A5:0.5 G5:0.5 E5:1 G5:1 C6:2 R:2',
    ),
    bass: tune(
      'C3:1 R:1 G2:1 R:1 C3:1 R:1 G2:1 R:1',
      'F2:1 G2:1 A2:1 B2:1 C3:3',
      'C3:2 G2:2 C3:3',
      'C3:2 C3:2 F2:2 F2:2 G2:2 C3:1',
      'C3:0.5 C3:0.5 G2:1 C3:0.5 C3:0.5 G2:1 R:1',
      'F2:2 G2:2 C3:2 R:2',
    ),
    bassWave: 'triangle',
    drums: tune(
      rep('K:1 H:1', 4),
      'K:1 H:1 K:1 H:1 S:0.5 S:0.5 S:1 S:1',
      'K:1 S:1 K:1 S:1 K:1 S:1 K:1',
      rep('K:1 H:0.5 H:0.5 S:1 H:1', 2), 'K:1 H:1 S:1',
      'K:0.5 H:0.5 S:0.5 H:0.5 K:0.5 H:0.5 S:1 R:1',
      'K:1 S:1 K:1 S:1 K:2 R:2',
    ),
  },
  draw(ctx, t, dt, info) {
    play(ctx, dt, info, SCENES);
  },
};
