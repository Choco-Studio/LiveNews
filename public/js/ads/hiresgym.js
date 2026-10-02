// HI-RES GYM — for characters who want more pixels. Brand: black, red,
// orange, yellow. "Get more definition."
// Eight shots, 23.25 s, cut on the beat of a 160 bpm rock jingle: Low-Res
// Larry (drawn on a grid of fat 5 px cells) gets sand kicked on him by Hi-Res
// Brad; a "close-up" only makes his cells bigger; the gym's neon sign resolves
// from a mosaic into sharp lettering; a training montage where every rep adds
// pixels, then colours, then — POP — definition; back on the beach Brad is
// the low-res one now; end slate.
//
// Every frame is a pure function of the ad clock. Low-res bodies are a
// procedural cell rig (continuous angles, quantised to cells), mid stages are
// the kit hero() body mosaicked through two pooled scratch canvases, and
// static scenery is baked into cached canvases.
import {
  P, W, H, R, A, rrect, panel, disc, oval, poly, line, dither, bands, sparkle, twinkle, shadow, cached, text,
  bigText, micro, bubble, hero, wordmark, glint, glow, cloud, starPts, prog, lerp, easeOut, easeOutBack, spring,
  wobble, lazy, measureText, tune, rep,
} from './kit.js';

const { sin, cos, PI, round, floor, min, max, abs, exp, hypot, atan2 } = Math;
const TAU = PI * 2;

// --- timing (160 bpm: one beat = 0.375 s; every cut is on a beat) ---------------
const T_BEACH = 0;
const T_ZOOM = 4.5;
const T_SIGN = 6.75;
const T_PUMP = 9.375;
const T_COLOUR = 11.25;
const T_DEFINE = 12.75;
const T_PAYOFF = 15.75;
const T_SLATE = 18.75;
const DURATION = 23.25;

// --- motion helpers (local) -------------------------------------------------------
const c01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const io = (x) => {
  const v = c01(x);
  return v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2;
};
const ein = (x) => c01(x) ** 3;
const smooth = (x) => {
  const v = c01(x);
  return v * v * (3 - 2 * v);
};
const mod = (a, n) => ((a % n) + n) % n;
const slam = (lt, amp = 0.7) => (lt <= 0 ? 0 : 1 + amp * exp(-9 * lt) * cos(TAU * 2.2 * lt));
/** Decaying comedy shake offset (deterministic). */
const kickX = (lt, t0, amp = 3) => (lt < t0 || lt > t0 + 0.35 ? 0 : round(sin((lt - t0) * 90) * amp * (1 - (lt - t0) / 0.35)));

function armMix(out, pa, pb, p) {
  const ea = pa[0];
  const eb = pb[0];
  const ua = atan2(ea[1], ea[0]);
  let ub = atan2(eb[1], eb[0]);
  if (ub - ua > PI) ub -= TAU;
  else if (ua - ub > PI) ub += TAU;
  const fa = atan2(pa[1][1] - ea[1], pa[1][0] - ea[0]);
  let fb = atan2(pb[1][1] - eb[1], pb[1][0] - eb[0]);
  if (fb - fa > PI) fb -= TAU;
  else if (fa - fb > PI) fb += TAU;
  const la = hypot(ea[0], ea[1]);
  const lb = hypot(eb[0], eb[1]);
  const ma = hypot(pa[1][0] - ea[0], pa[1][1] - ea[1]);
  const mb = hypot(pb[1][0] - eb[0], pb[1][1] - eb[1]);
  const u = ua + (ub - ua) * p;
  const l = la + (lb - la) * p;
  const f = fa + (fb - fa) * p;
  const m = ma + (mb - ma) * p;
  out[0][0] = cos(u) * l;
  out[0][1] = sin(u) * l;
  out[1][0] = out[0][0] + cos(f) * m;
  out[1][1] = out[0][1] + sin(f) * m;
  return out;
}
const pose = () => [[0, 0], [0, 0]];
function seg(ctx, x0, y0, x1, y1, w, col, ol) {
  const o = floor(w / 2);
  if (ol) line(ctx, x0 - o - 1, y0 - o - 1, x1 - o - 1, y1 - o - 1, ol, w + 2);
  line(ctx, x0 - o, y0 - o, x1 - o, y1 - o, col, w);
}

// --- hi-res bodies: procedural legs + kit hero() with tweened arms ------------------
function fig(pal, extra = {}) {
  return {
    pal, armL: pose(), armR: pose(), lf: [0, 0], rf: [0, 0], bob: 0, legs: true,
    eyes: 'open', mouth: 'smile', brows: undefined, hat: undefined, hair: 'short', look: 0, lookY: 0,
    blush: false, sweat: 0, mustache: false, sleeves: 'long', tears: 0, ...extra,
  };
}
const HO = { legs: 'none' };
function figure(ctx, x, gy, f) {
  x = round(x);
  const bob = round(f.bob);
  if (f.legs) legs(ctx, x, gy - 12 + bob, gy, f);
  HO.pal = f.pal;
  HO.armL = f.armL;
  HO.armR = f.armR;
  HO.bob = bob;
  HO.eyes = f.eyes;
  HO.mouth = f.mouth;
  HO.brows = f.brows;
  HO.hat = f.hat;
  HO.hair = f.hair;
  HO.look = f.look;
  HO.lookY = f.lookY;
  HO.blush = f.blush;
  HO.sweat = f.sweat;
  HO.mustache = f.mustache;
  HO.sleeves = f.sleeves;
  HO.tears = f.tears;
  return hero(ctx, x, gy - 12, HO);
}
function legs(ctx, x, hipY, gy, f) {
  const pal = f.pal;
  for (let side = -1; side <= 1; side += 2) {
    const ft = side < 0 ? f.lf : f.rf;
    seg(ctx, x + side * 4, hipY - 1, round(x + side * 5 + ft[0]), round(gy - 4 - ft[1]), 6, pal.P, pal.K);
  }
  R(ctx, x - 7, hipY - 2, 14, 4, pal.P);
  for (let side = -1; side <= 1; side += 2) {
    const ft = side < 0 ? f.lf : f.rf;
    const sx = round(x + side * 5 + ft[0]) + (side < 0 ? -5 : -2);
    const sy = round(gy - 4 - ft[1]);
    R(ctx, sx - 1, sy - 1, 9, 5, pal.K);
    R(ctx, sx, sy, 7, 3, pal.B);
    R(ctx, sx + (side < 0 ? 0 : 3), sy, 4, 1, A(P.white, 0.35));
  }
}
function walk(f, ph, amp = 1) {
  const s = sin(ph);
  f.lf[0] = s * 2 * amp;
  f.lf[1] = max(0, s) * 3 * amp;
  f.rf[0] = -s * 2 * amp;
  f.rf[1] = max(0, -s) * 3 * amp;
  f.bob = -abs(s) * 1.4 * amp;
}
function stand(f) {
  f.lf[0] = 0;
  f.lf[1] = 0;
  f.rf[0] = 0;
  f.rf[1] = 0;
}

// --- pooled scratch canvases ---------------------------------------------------------
const BUF = {};
function buf(name, w = W, h = H) {
  let b = BUF[name];
  if (!b) {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    b = BUF[name] = { cv, c, w, h };
  }
  b.c.setTransform(1, 0, 0, 1, 0, 0);
  b.c.globalAlpha = 1;
  b.c.clearRect(0, 0, b.w, b.h);
  return b;
}

/**
 * A hi-res body seen at a lower resolution: drawn into a 96 px scratch canvas,
 * sampled down to cells of `b` px (b divides 96) and blown back up, so it moves
 * smoothly but shows fat cells. The eyes are re-stamped as cells so the face
 * never goes blank. sx/sy squash about the feet.
 */
function mosaicFig(ctx, x, gy, f, b, sx = 1, sy = 1) {
  const a = buf('mfa', 96, 96);
  const me = figure(a.c, 48, 90, f);
  let src = a.cv;
  let n = 96;
  if (b > 1) {
    n = 96 / b;
    const m = buf('mfb', 96, 96);
    m.c.drawImage(a.cv, 0, 0, 96, 96, 0, 0, n, n);
    if (f.eyes === 'open') {
      const ey = floor((me.top + 11.5) / b);
      m.c.fillStyle = P.black;
      m.c.fillRect(floor((42 + f.look) / b), ey, 1, 1);
      m.c.fillRect(floor((53 + f.look) / b), ey, 1, 1);
    }
    src = m.cv;
  }
  const w = round(96 * sx);
  const h = round(96 * sy);
  ctx.drawImage(src, 0, 0, n, n, round(x - 48 * sx), round(gy - 90 * sy), w, h);
  const map = (pt) => {
    pt[0] = x + (pt[0] - 48) * sx;
    pt[1] = gy + (pt[1] - 90) * sy;
  };
  map(me.handL);
  map(me.handR);
  me.top = gy + (me.top - 90) * sy;
  return me;
}

// --- low-res bodies: a rig on a grid of b x b cells -------------------------------
// 5 cells wide, 10 tall: hair, 3 head rows (eyes on the middle one), 3 torso
// rows, shorts, legs, shoes. Arms are cell lines from the shoulders whose angles
// tween continuously; only their cells snap — the low-res look, without pops.
function lr(pal, extra = {}) {
  return { pal, aL: 0.25, aR: 0.25, bL: 0, bR: 0, lf: 0, rf: 0, bob: 0, eyes: 'open', mouth: 0, tear: -1, sand: 0, ...extra };
}
function cellLine(ctx, ox, oy, b, i0, j0, i1, j1, c0, c1) {
  const n = max(abs(i1 - i0), abs(j1 - j0));
  for (let k = 0; k <= n; k++) {
    const i = round(i0 + ((i1 - i0) * k) / (n || 1));
    const j = round(j0 + ((j1 - j0) * k) / (n || 1));
    ctx.fillStyle = k === n ? c1 : c0;
    ctx.fillRect(ox + i * b, oy + j * b, b, b);
  }
}
function lowres(ctx, x, gy, b, s) {
  const pal = s.pal;
  const ox = round(x - b / 2);
  const oy = round(gy + s.bob);
  const C = (i, j, c, w = 1, h = 1) => {
    ctx.fillStyle = c;
    ctx.fillRect(ox + i * b, oy + j * b, w * b, h * b);
  };
  // outline: one cell-pixel darker rim drawn as a 1px black frame round the body
  const k = max(1, round(b / 5));
  ctx.fillStyle = P.black;
  ctx.fillRect(ox - 2 * b - k, oy - 10 * b - k, 5 * b + 2 * k, 7 * b + 2 * k);
  ctx.fillRect(ox - 2 * b - k, oy - 3 * b - k, 5 * b + 2 * k, b + 2 * k);
  // legs + shoes (a lifted leg rises by whole cells)
  for (let sd = -1; sd <= 1; sd += 2) {
    const lift = round(sd < 0 ? s.lf : s.rf);
    C(sd, -2 - lift, pal.P);
    C(sd < 0 ? -2 : 1, -1 - lift, pal.B, 2, 1);
  }
  C(-2, -3, pal.P, 5, 1);
  // torso
  C(-2, -6, pal.T, 5, 3);
  C(2, -6, pal.t, 1, 3);
  // arms: shoulder cell to hand cell, sleeve then skin
  for (let sd = -1; sd <= 1; sd += 2) {
    const a = sd < 0 ? s.aL : s.aR;
    const bend = sd < 0 ? s.bL : s.bR;
    const ei = 2.5 * sd + sd * sin(a) * 1.6;
    const ej = -6 + cos(a) * 1.6;
    const hi = ei + sd * sin(a + bend) * 1.8;
    const hj = ej + cos(a + bend) * 1.8;
    cellLine(ctx, ox, oy, b, 3 * sd, -6, round(ei), round(ej), pal.L || pal.T, pal.L || pal.T);
    cellLine(ctx, ox, oy, b, round(ei), round(ej), round(hi), round(hj), pal.S, pal.S);
  }
  // head
  C(-2, -9, pal.S, 5, 3);
  C(2, -8, pal.s, 1, 2);
  C(-2, -10, pal.H, 5, 1);
  C(-2, -9, pal.H);
  C(2, -9, pal.H);
  if (s.eyes === 'shades') {
    C(-2, -8, P.black, 5, 1);
    ctx.fillStyle = P.steel;
    ctx.fillRect(ox - b, oy - 8 * b, max(1, b >> 1), max(1, b >> 2));
  } else if (s.eyes === 'closed') {
    ctx.fillStyle = P.black;
    ctx.fillRect(ox - b, oy - 7 * b - k * 2, b, k);
    ctx.fillRect(ox + b, oy - 7 * b - k * 2, b, k);
  } else {
    C(-1, -8, P.black);
    C(1, -8, P.black);
    if (s.eyes === 'sad') {
      C(-2, -9, pal.H === P.black ? P.slate : pal.h);
      C(2, -9, pal.H === P.black ? P.slate : pal.h);
    }
  }
  if (s.mouth) C(0, -7, P.maroon);
  if (s.tear >= 0) {
    // blue, not cyan: Larry's shirt is cyan and the tear must read on it too
    C(1, -7 + floor(s.tear), P.blue);
    ctx.fillStyle = P.white;
    ctx.fillRect(ox + b + k, oy + (-7 + floor(s.tear)) * b + k, k, k);
  }
  if (s.sand > 0) {
    const n = min(5, floor(s.sand * 6));
    for (let i = 0; i < n; i++) C(-2 + ((i * 3) % 5), -11 - (i > 2 ? 1 : 0), i % 2 ? P.cream : P.orange);
  }
}

// --- shot sequencer with this brand's transitions -------------------------------------
// tr: 'whip' (smeared pan, dir) | 'mosaic' (pixelate out, cut, resolve in) | 'cut'.
function run(ctx, dt, shots) {
  let i = 0;
  while (i + 1 < shots.length && dt >= shots[i + 1].at) i++;
  const s = shots[i];
  const lt = dt - s.at;
  if (!i || !s.tr || lt >= s.d) {
    s.draw(ctx, lt);
    return;
  }
  const prev = shots[i - 1];
  const p = lt / s.d;
  if (s.tr === 'mosaic') {
    const first = p < 0.5;
    const a = buf('ta');
    if (first) prev.draw(a.c, dt - prev.at);
    else s.draw(a.c, lt);
    const q = first ? p * 2 : 2 - p * 2;
    pixelate(ctx, a.cv, BLOCKS[min(BLOCKS.length - 1, floor(q * BLOCKS.length))]);
    return;
  }
  const a = buf('ta');
  prev.draw(a.c, dt - prev.at);
  const b = buf('tb');
  s.draw(b.c, lt);
  whip(ctx, a.cv, b.cv, p, s.dir || 1);
}
const BLOCKS = [2, 3, 4, 6, 8, 12, 24];
/** Full-frame mosaic: b divides both 384 and 216. */
function pixelate(ctx, cv, b) {
  const n = buf('tm');
  const w = W / b;
  const h = H / b;
  n.c.drawImage(cv, 0, 0, W, H, 0, 0, w, h);
  ctx.drawImage(n.cv, 0, 0, w, h, 0, 0, W, H);
}
function whip(ctx, a, b, p, dir) {
  const e = io(p);
  const off = round(e * W) * dir;
  const C = buf('wc');
  C.c.drawImage(a, -off, 0);
  C.c.drawImage(b, W * dir - off, 0);
  const v = sin(p * PI);
  const f = 1 + round(v * 9);
  if (f <= 1) {
    ctx.drawImage(C.cv, 0, 0);
    return;
  }
  const D = buf('wd');
  const sw = Math.ceil(W / f);
  D.c.drawImage(C.cv, 0, 0, W, H, 0, 0, sw, H);
  ctx.drawImage(D.cv, 0, 0, sw, H, 0, 0, sw * f, H);
  for (let k = 0; k < 9; k++) {
    const len = 50 + ((k * 37) % 90);
    const x = mod(k * 97 - p * 1400 * dir, W + len) - len;
    R(ctx, x, (k * 53 + 17) % H, len, 1, A(P.white, 0.4 * v));
  }
}

// --- cast ---------------------------------------------------------------------------
const LARRY = {
  K: P.black, W: P.white, S: P.skin, s: P.skinShade, H: P.yellow, h: P.cream, E: P.tanShade, T: P.cyan, t: P.blue,
  L: P.cyan, C: P.cyan, X: P.cyan, b: P.navy, Y: P.yellow, P: P.navy, p: P.ink, B: P.red, A: P.red, a: P.darkRed,
  M: P.maroon, N: P.pink,
};
const LARRY_GREY = {
  K: P.black, W: P.white, S: P.silver, s: P.fog, H: P.fog, h: P.silver, E: P.steel, T: P.steel, t: P.slate,
  L: P.steel, C: P.steel, X: P.steel, b: P.ink, Y: P.silver, P: P.slate, p: P.ink, B: P.ink, A: P.fog, a: P.steel,
  M: P.ink, N: P.fog,
};
const BRAD = {
  K: P.black, W: P.white, S: P.tan, s: P.tanShade, H: P.black, h: P.slate, E: P.black, T: P.red, t: P.darkRed,
  L: P.tan, C: P.red, X: P.red, b: P.black, Y: P.yellow, P: P.purple, p: P.ink, B: P.black, A: P.yellow, a: P.orange,
  M: P.maroon, N: P.pink,
};
const COACH = {
  K: P.black, W: P.white, S: P.brown, s: P.maroon, H: P.slate, h: P.steel, E: P.black, T: P.green, t: P.darkGreen,
  L: P.green, C: P.white, X: P.green, b: P.black, Y: P.yellow, P: P.ink, p: P.black, B: P.black, A: P.green,
  a: P.darkGreen, M: P.maroon, N: P.pink,
};
const LOW_LARRY = lr(LARRY);
const LOW_BRAD = lr(BRAD, { eyes: 'shades' });
const BIG_BRAD = fig(BRAD, { hat: 'headband', eyes: 'shades', mouth: 'grin', sleeves: 'short' });
const MID_LARRY = fig(LARRY, { hair: 'spiky', sleeves: 'short', mouth: 'grin' });
const HI_LARRY = fig(LARRY, { hair: 'spiky', hat: 'headband', sleeves: 'short', blush: true, mouth: 'grin', eyes: 'happy' });
const COACH_F = fig(COACH, { hair: 'bald', hat: 'cap', eyes: 'angry', mouth: 'teeth', sleeves: 'short' });
// colour order for "GAIN COLOURS!": each key floods in on its own beat
const COLOUR_KEYS = ['H', 'h', 'S', 's', 'E', 'T', 't', 'L', 'C', 'X', 'P', 'p', 'B', 'A', 'a', 'Y', 'b', 'M', 'N'];
const MIX_PAL = { ...LARRY_GREY };

const P_DOWN = [[-1, 7], [-2, 14]];
const P_FLEX = [[-9, 0], [-8, -9]];
const P_UP = [[-4, -7], [-6, -15]];
const P_PRESS = [[-8, 1], [-9, -7]];
const P_CURL0 = [[-2, 7], [-3, 14]];
const P_CURL1 = [[-2, 7], [3, 1]];
const P_HIPS = [[-6, 7], [0, 12]];
const P_POINT = [[-6, 2], [-14, -2]];
const P_SWING = [[-2, 7], [1, 14]];
const P_THUMB = [[-7, 3], [-9, -6]];

// --- brand -------------------------------------------------------------------------
const MARK = lazy(() => wordmark('HI-RES GYM', {
  h: 28, pen: 3, square: true, slant: 0.25, wide: 0.85, gap: 3,
  fill: [P.white, P.yellow, P.orange, P.red], outline: [[P.black, 2]], depth: 4, depthColor: P.darkRed,
}));
/** Brand art seen at cell size b (1 = sharp): the "resolution" device. */
function resolveArt(ctx, art, x, y, b) {
  if (b <= 1) {
    ctx.drawImage(art, x, y);
    return;
  }
  const m = buf('ra', 512, 128);
  const w = Math.ceil(art.width / b);
  const h = Math.ceil(art.height / b);
  m.c.drawImage(art, 0, 0, art.width, art.height, 0, 0, w, h);
  ctx.drawImage(m.cv, 0, 0, w, h, x, y, w * b, h * b);
}
const RES_STEPS = [12, 8, 6, 4, 3, 2, 1];
const resAt = (lt, t0, per = 0.075) => RES_STEPS[min(RES_STEPS.length - 1, max(0, floor((lt - t0) / per)))];

const dumbbellArt = () => cached('hg-dumbbell', 70, 30, (c) => {
  R(c, 14, 12, 42, 6, P.black);
  R(c, 15, 13, 40, 4, P.silver);
  R(c, 15, 13, 40, 1, P.white);
  for (const x of [2, 56]) {
    R(c, x, 2, 12, 26, P.black);
    R(c, x + 1, 3, 10, 24, P.red);
    R(c, x + 1, 3, 10, 3, P.pink);
    R(c, x + 8, 6, 3, 21, P.darkRed);
  }
  for (const x of [9, 52]) {
    R(c, x, 5, 9, 20, P.black);
    R(c, x + 1, 6, 7, 18, P.orange);
    R(c, x + 1, 6, 7, 2, P.yellow);
  }
});
function barbell(ctx, cx, y, w, plate) {
  cx = round(cx);
  y = round(y);
  R(ctx, cx - w / 2, y - 1, w, 3, P.black);
  R(ctx, cx - w / 2 + 1, y, w - 2, 1, P.silver);
  for (let sd = -1; sd <= 1; sd += 2) {
    const px = cx + sd * (w / 2 - plate) - (sd < 0 ? 0 : plate);
    R(ctx, px, y - plate, plate, plate * 2 + 1, P.black);
    R(ctx, px + 1, y - plate + 1, plate - 2, plate * 2 - 1, P.red);
    R(ctx, px + 1, y - plate + 1, plate - 2, max(1, round(plate / 3)), P.pink);
  }
}
function dumbbell(ctx, x, y) {
  x = round(x);
  y = round(y);
  R(ctx, x - 6, y - 1, 12, 3, P.black);
  R(ctx, x - 5, y, 10, 1, P.silver);
  R(ctx, x - 8, y - 3, 4, 7, P.black);
  R(ctx, x - 7, y - 2, 2, 5, P.red);
  R(ctx, x + 4, y - 3, 4, 7, P.black);
  R(ctx, x + 5, y - 2, 2, 5, P.red);
}
const NUM = [];
const pixels = (n) => NUM[n] || (NUM[n] = `PIXELS: ${n.toLocaleString('en-GB')}`);

// --- 1. the beach: sand in the face ---------------------------------------------------
const beachBg = () => cached('hg-beach', W, H, (c) => {
  bands(c, 0, 0, W, 106, [P.blue, P.cyan, P.cyan, P.cream]);
  glow(c, 58, 34, 26, P.white, 0.14, 3);
  disc(c, 58, 34, 13, P.yellow);
  disc(c, 58, 34, 10, P.cream);
  cloud(c, 270, 30, 10, P.white, P.silver);
  cloud(c, 168, 50, 7, P.white, P.silver);
  bands(c, 0, 102, W, 34, [P.blue, P.navy]);
  R(c, 0, 102, W, 1, P.white);
  R(c, 0, 134, W, 82, P.cream);
  dither(c, 0, 138, W, 78, P.yellow, 'dots');
  R(c, 0, 134, W, 2, P.white);
  for (let i = 0; i < 7; i++) R(c, 20 + i * 54, 150 + (i % 3) * 18, 6, 1, P.tan);
  // umbrella
  R(c, 333, 98, 2, 76, P.black);
  poly(c, [[294, 110], [374, 110], [334, 86]], P.black);
  poly(c, [[296, 109], [372, 109], [334, 87]], P.orange);
  poly(c, [[320, 109], [348, 109], [334, 87]], P.yellow);
  // towel
  R(c, 104, 172, 56, 10, P.black);
  R(c, 105, 173, 54, 8, P.pink);
  for (let i = 0; i < 54; i += 9) R(c, 105 + i, 173, 4, 8, P.white);
});
function tag(ctx, s, x, y, lt, ax, ay) {
  if (lt <= 0) return;
  const p = spring(lt, 1.8, 6);
  const w = measureText(s) + 10;
  const yy = round(y + (1 - p) * 10);
  if (ax !== undefined && lt > 0.15) {
    line(ctx, x, yy + 13, ax, ay, P.black);
    R(ctx, ax - 1, ay - 1, 3, 3, P.black);
  }
  panel(ctx, round(x - w / 2), yy, w, 14, P.white, P.black, 1);
  text(ctx, s, x, yy + 4, { color: P.black, align: 'center' });
}
const KICK = 2.15;
function bradX(lt) {
  return lerp(430, 238, easeOut(prog(lt, 0, 1.35)));
}
function shotBeach(ctx, lt) {
  ctx.drawImage(beachBg(), 0, 0);
  for (let i = 0; i < 8; i++) R(ctx, round(mod(i * 61 + lt * 14, W + 30) - 15), 108 + (i % 3) * 9, 12, 1, A(P.white, 0.8));
  // Larry: tiny breaths, flinches when the sand lands, then a tear
  const hit = lt > KICK + 0.28;
  LOW_LARRY.bob = hit ? round(wobble(lt, KICK + 0.28, 3, 3, 6)) : -round((1 - cos(lt * 2.4)) * 0.5);
  LOW_LARRY.eyes = hit ? 'sad' : 'open';
  // a timid wave hello as Brad arrives (the arm swings up, waggles, drops)
  const hi = smooth(prog(lt, 0.95, 1.2)) * (1 - smooth(prog(lt, 1.75, 2.0)));
  LOW_LARRY.aL = 0.25 + (hit ? 0 : sin(lt * 2.4) * 0.05);
  LOW_LARRY.aR = 0.25 + hi * (2.4 + sin(lt * TAU * 2.2) * 0.35);
  LOW_LARRY.bR = hi * 0.4;
  LOW_LARRY.mouth = hi > 0.5 ? 1 : 0;
  LOW_LARRY.tear = hit && lt > KICK + 0.8 ? mod((lt - KICK - 0.8) * 2.2, 2.4) : -1;
  LOW_LARRY.sand = hit ? prog(lt, KICK + 0.28, KICK + 0.7) : 0;
  shadow(ctx, 132, 177, 14);
  lowres(ctx, 132, 177, 5, LOW_LARRY);
  // Brad struts in, flexes, winds up and kicks sand
  const x = bradX(lt);
  const walking = lt < 1.35;
  const f = BIG_BRAD;
  if (walking) walk(f, lt * TAU * 1.9, 1 - smooth(prog(lt, 1.0, 1.35)));
  else {
    stand(f);
    f.bob = 0;
    // wind up (foot back), kick (foot forward at Larry), follow-through
    const back = smooth(prog(lt, KICK - 0.3, KICK)) * (1 - smooth(prog(lt, KICK, KICK + 0.08)));
    const fwd = smooth(prog(lt, KICK, KICK + 0.08)) * (1 - smooth(prog(lt, KICK + 0.25, KICK + 0.6)));
    f.lf[0] = back * 6 - fwd * 9;
    f.lf[1] = back * 3 + fwd * 5;
    f.bob = round(back * 1 - fwd * 1);
  }
  const flex = walking ? smooth(prog(lt, 0.9, 1.35)) : 1;
  if (walking) {
    const sw = sin(lt * TAU * 1.9) * 0.25;
    armMix(f.armL, P_SWING, P_FLEX, flex);
    armMix(f.armR, P_SWING, P_FLEX, flex);
    f.armL[1][1] += sw * 6 * (1 - flex);
    f.armR[1][1] -= sw * 6 * (1 - flex);
  } else {
    const pump = sin(max(0, lt - 1.35) * TAU * 1.4) * 0.12;
    armMix(f.armL, P_FLEX, P_HIPS, smooth(prog(lt, KICK - 0.35, KICK - 0.1)) * 0.6 + pump);
    armMix(f.armR, P_FLEX, P_FLEX, 0);
    f.armR[1][1] += round(pump * 10);
  }
  f.mouth = lt > KICK && lt < KICK + 0.8 ? 'teeth' : 'grin';
  shadow(ctx, round(x), 183, 14);
  figure(ctx, x, 184, f);
  // sand: grains leave the foot, arc over and rain on Larry
  if (lt > KICK) {
    for (let i = 0; i < 22; i++) {
      const t0 = KICK + (i % 6) * 0.02;
      const q = prog(lt, t0, t0 + 0.42 + (i % 4) * 0.03);
      if (q <= 0 || q >= 1) continue;
      const gx = lerp(x - 12, 126 + ((i * 7) % 14), q);
      const gy = lerp(178, 128 + (i % 3) * 6, q) - sin(q * PI) * (26 + (i % 5) * 7);
      R(ctx, gx, gy, 2, 2, i % 3 ? P.yellow : P.orange);
    }
  }
  tag(ctx, 'LOW-RES LARRY', 70, 120, lt - 0.55, 118, 136);
  if (lt > KICK + 0.35) popArt(ctx, nerdBubble(), round(x + 4), 120, lt - KICK - 0.35);
}
/** Cached art that pops in about its bottom centre (spring scale). */
function popArt(ctx, art, cx, by, lt) {
  const s = spring(lt, 1.8, 6);
  if (s <= 0.05) return;
  const w = round(art.width * s);
  const h = round(art.height * s);
  ctx.drawImage(art, round(cx - w / 2), round(by - h), w, h);
}
const bubbleArt = (key, s, w) => cached(key, w + 2, 40, (c) => {
  const h = bubble(c, 1, 1, w, s, { tail: null });
  for (let i = 0; i < 5; i++) {
    R(c, w / 2 - 2, h + i, 7 - i, 1, P.black);
    R(c, w / 2 - 1, h + i, max(0, 5 - i), 1, P.white);
  }
});
const nerdBubble = () => bubbleArt('hg-b-nerd', 'NICE PIXELS, NERD!', 96);

// --- 2. "close-up": the camera zooms... the cells just get bigger ----------------------
const softBeach = () => cached('hg-beach-soft', W, H, (c) => {
  const m = buf('soft', W / 8, H / 8);
  m.c.drawImage(beachBg(), 0, 0, W, H, 0, 0, W / 8, H / 8);
  c.drawImage(m.cv, 0, 0, W / 8, H / 8, 0, 0, W, H);
});
const ZOOMS = ['ZOOM 100%', 'ZOOM 200%', 'ZOOM 400%', 'ZOOM 800%'];
function shotZoom(ctx, lt) {
  ctx.drawImage(softBeach(), 0, 0);
  const q = io(prog(lt, 0.05, 0.75));
  const b = round(lerp(5, 18, q));
  // keep Larry's eyes travelling to the frame centre while the cells grow
  const ex = lerp(132, 192, q);
  const ey = lerp(137, 96, q);
  const gy = ey + 8 * b;
  LOW_LARRY.bob = 0;
  LOW_LARRY.eyes = 'sad';
  LOW_LARRY.sand = 1;
  LOW_LARRY.aL = 0.25;
  LOW_LARRY.aR = 0.25;
  LOW_LARRY.tear = lt > 1.3 ? min(2.99, (lt - 1.3) * 2.2) : -1;
  LOW_LARRY.mouth = 0;
  lowres(ctx, ex, gy, b, LOW_LARRY);
  // viewfinder furniture
  for (const [x, y, sx, sy] of VF) {
    R(ctx, sx > 0 ? x : x - 20, y, 20, 2, P.white);
    R(ctx, x - (sx < 0 ? 2 : 0), sy > 0 ? y : y - 18, 2, 20, P.white);
  }
  if (floor(lt * 2) % 2 === 0) disc(ctx, 340, 34, 3, P.red);
  text(ctx, 'REC', 348, 31, { color: P.white });
  const zi = min(3, floor(q * 4));
  panel(ctx, 160, 186, 64, 13, P.black, P.white, 1);
  text(ctx, ZOOMS[zi], 192, 189, { color: P.white, align: 'center' });
  const k = lt - 1.25;
  if (k > 0) {
    const s = slam(k, 0.6);
    const art = stillArt();
    const w = round(art.width * s);
    const h = round(art.height * s);
    ctx.drawImage(art, round(192 - w / 2), round(176 - h / 2 - 8), w, h);
  }
}
const VF = [[24, 26, 1, 1], [360, 26, -1, 1], [24, 196, 1, -1], [360, 196, -1, -1]];
const stillArt = () => cached('hg-still', measureText('STILL LOW-RES.', 2) + 10, 26, (c) => {
  bigText(c, 'STILL LOW-RES.', 5, 9, { scale: 2, color: P.white, outline: P.black, ow: 2 });
});

// --- 3. the gym: the neon sign resolves into focus -----------------------------------
const street = () => cached('hg-street', W, H, (c) => {
  R(c, 0, 0, W, H, P.maroon);
  for (let y = 0; y < 168; y += 8) {
    const off = (y / 8) % 2 ? 0 : 12;
    for (let x = -off; x < W; x += 24) R(c, x, y, 23, 7, P.darkRed);
  }
  dither(c, 0, 0, W, 168, A(P.black, 0.4), 'checker');
  // sign box
  R(c, 50, 24, 284, 74, P.black);
  R(c, 53, 27, 278, 68, P.ink);
  R(c, 56, 30, 272, 1, P.slate);
  R(c, 120, 98, 4, 10, P.black);
  R(c, 260, 98, 4, 10, P.black);
  // street level
  R(c, 0, 168, W, 48, P.slate);
  R(c, 0, 168, W, 2, P.fog);
  for (let x = 0; x < W; x += 32) R(c, x, 170, 1, 46, P.steel);
  // doors
  R(c, 148, 112, 88, 56, P.black);
  for (const x of [151, 194]) {
    R(c, x, 115, 40, 53, P.orange);
    R(c, x, 115, 40, 6, P.yellow);
    R(c, x + 4, 124, 32, 26, A(P.white, 0.25));
  }
  R(c, 191, 115, 3, 53, P.black);
  text(c, 'OPEN 24/7', 192, 138, { color: P.black, align: 'center' });
  poly(c, [[148, 168], [236, 168], [270, 216], [114, 216]], A(P.yellow, 0.18));
  c.drawImage(dumbbellArt(), 34, 124);
  c.drawImage(dumbbellArt(), 280, 124);
});
function shotSign(ctx, lt) {
  ctx.drawImage(street(), 0, 0);
  const mk = MARK();
  const b = resAt(lt, 0.95);
  const lit = lt > 0.95;
  const x0 = round(192 - mk.w / 2) - mk.ox;
  const y0 = 46 - mk.oy;
  if (lit) {
    glow(ctx, 192, 60, 100, P.red, 0.05, 4);
    ctx.drawImage(street(), 50, 24, 284, 74, 50, 24, 284, 74);
  }
  ctx.globalAlpha = lit ? 1 : 0.3;
  resolveArt(ctx, mk.cv, x0, y0, lit ? b : 12);
  ctx.globalAlpha = 1;
  if (b === 1) glint(ctx, mk.cv, x0, y0, prog(lt, 1.55, 2.15), { width: 7 });
  if (lit && lt > 1.5) for (let i = 0; i < 5; i++) sparkle(ctx, 66 + i * 62, 30 + ((i * 29) % 60), twinkle(lt, i * 0.23), P.yellow);
  // "GET DOWN TO..." whips in under the sign
  if (lt > 0.3) {
    const p = easeOutBack(prog(lt, 0.3, 0.62), 1.4);
    const x = round(lerp(-120, 192, p));
    bigText(ctx, 'GET DOWN TO...', x, 106, { scale: 1, color: P.yellow, outline: P.black, align: 'center' });
  }
  // Larry trudges up to the door and looks up at it
  const lx = lerp(-20, 120, easeOut(prog(lt, 0, 1.6)));
  const walking = lt < 1.6;
  const s = LOW_LARRY;
  s.eyes = 'open';
  s.sand = 0;
  s.tear = -1;
  s.lf = walking && sin(lt * TAU * 2) > 0.3 ? 1 : 0;
  s.rf = walking && sin(lt * TAU * 2) < -0.3 ? 1 : 0;
  s.bob = walking ? -round(abs(sin(lt * TAU * 2)) * 2) : round(-spring(lt - 1.6, 2, 6) * 3);
  s.aL = 0.25 + (walking ? sin(lt * TAU * 2) * 0.35 : 0);
  s.aR = 0.25 - (walking ? sin(lt * TAU * 2) * 0.35 : 0);
  shadow(ctx, round(lx), 191, 13);
  lowres(ctx, lx, 192, 5, s);
}

// --- 4. training montage ------------------------------------------------------------
const gym = () => cached('hg-gym', W, H, (c) => {
  bands(c, 0, 0, W, 150, [P.ink, P.slate, P.slate]);
  for (let x = 0; x < W; x += 48) R(c, x, 0, 1, 150, A(P.black, 0.4));
  R(c, 0, 0, W, 8, P.black);
  R(c, 0, 8, W, 2, P.red);
  // mirror
  R(c, 18, 26, 186, 106, P.black);
  R(c, 20, 28, 182, 102, P.steel);
  for (let i = 0; i < 4; i++) poly(c, [[40 + i * 50, 28], [56 + i * 50, 28], [20 + i * 50, 130], [4 + i * 50, 130]], A(P.white, 0.18));
  R(c, 20, 28, 182, 1, P.silver);
  // posters
  panel(c, 222, 24, 64, 48, P.yellow, P.black, 1);
  text(c, 'NO PIXELS', 254, 32, { color: P.black, align: 'center' });
  text(c, 'NO GLORY', 254, 44, { color: P.red, align: 'center' });
  c.drawImage(dumbbellArt(), 236, 54, 35, 15);
  panel(c, 300, 30, 62, 40, P.red, P.black, 1);
  text(c, 'FEEL THE', 331, 38, { color: P.white, align: 'center' });
  text(c, 'BURN-IN', 331, 50, { color: P.yellow, align: 'center' });
  // rubber floor
  R(c, 0, 150, W, 66, P.ink);
  R(c, 0, 150, W, 2, P.steel);
  for (let x = 0; x < W; x += 32) R(c, x, 152, 1, 64, P.black);
  for (let y = 172; y < H; y += 22) R(c, 0, y, W, 1, P.black);
  // rack
  R(c, 300, 100, 4, 52, P.black);
  R(c, 356, 100, 4, 52, P.black);
  for (let i = 0; i < 3; i++) {
    R(c, 300, 108 + i * 14, 60, 2, P.black);
    for (let k = 0; k < 4; k++) {
      R(c, 306 + k * 13, 102 + i * 14, 8, 6, P.black);
      R(c, 307 + k * 13, 103 + i * 14, 6, 4, [P.red, P.orange, P.yellow][i]);
    }
  }
});
const HUD_PIXELS = [70, 960, 2304, 4096];
function hud(ctx, px, stage, lt) {
  panel(ctx, 236, 186, 140, 22, P.black, P.red, 2);
  text(ctx, pixels(px), 306, 190, { color: P.yellow, align: 'center' });
  for (let i = 0; i < 4; i++) R(ctx, 250 + i * 28, 199, 24, 4, i <= stage ? P.red : P.slate);
  if (lt !== undefined && lt < 0.4) R(ctx, 250 + stage * 28, 199, 24, 4, floor(lt * 10) % 2 ? P.yellow : P.red);
}
function coach(ctx, lt, line, lineAt) {
  const f = COACH_F;
  stand(f);
  const yell = lt > lineAt && lt < lineAt + 1.1;
  f.mouth = yell && floor(lt * 7) % 2 ? 'open' : 'teeth';
  f.bob = round(sin(lt * TAU * 1.4) * 0.6);
  armMix(f.armL, P_HIPS, P_POINT, 0.85 + sin(lt * TAU * 1.4) * 0.15);
  armMix(f.armR, P_HIPS, P_HIPS, 0);
  shadow(ctx, 318, 183, 13);
  const me = figure(ctx, 318, 184, f);
  R(ctx, 318 - 1, me.top + 24, 2, 6, P.silver);
  if (lt > lineAt) {
    const p = spring(lt - lineAt, 1.8, 6);
    const w = round(104 * c01(p * 1.1));
    if (w > 24) bubble(ctx, round(300 - w / 2), 96, w, line, { tail: 'down', tx: 304 });
  }
}
function burst(ctx, x, y, q, c = P.yellow) {
  if (q <= 0 || q >= 1) return;
  const r = round(10 + q * 46);
  poly(ctx, starPts(x, y, 12, r, r * 0.55, q * 0.6), A(c, 0.55 * (1 - q)));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2;
    sparkle(ctx, x + cos(a) * r * 0.9, y + sin(a) * r * 0.7, 2, P.white);
  }
}

// 4a. "Pump those pixels!" — overhead press, low-res → stage 1
const POP1 = 1.2;
function shotPump(ctx, lt) {
  ctx.drawImage(gym(), 0, 0);
  const x = 128;
  const gy = 184;
  const rep = (1 - cos(lt * TAU * 1.5)) / 2; // 0 = bar at shoulders, 1 = locked out
  if (lt < POP1) {
    const s = LOW_LARRY;
    s.eyes = 'closed';
    s.sand = 0;
    s.tear = -1;
    s.lf = 0;
    s.rf = 0;
    const sq = smooth(prog(lt, POP1 - 0.2, POP1));
    s.bob = round(sq * 4);
    s.aL = 2.3 + rep * 0.7;
    s.aR = 2.3 + rep * 0.7;
    s.bL = 1.0 - rep * 0.9;
    s.bR = 1.0 - rep * 0.9;
    shadow(ctx, x, gy - 1, 14);
    lowres(ctx, x, gy, 5, s);
    // chunky low-res barbell over the head
    const by = round(gy - 55 - rep * 9 + s.bob);
    R(ctx, x - 30, by, 60, 5, P.black);
    R(ctx, x - 29, by + 1, 58, 3, P.silver);
    R(ctx, x - 35, by - 5, 10, 15, P.black);
    R(ctx, x - 34, by - 4, 8, 13, P.red);
    R(ctx, x + 25, by - 5, 10, 15, P.black);
    R(ctx, x + 26, by - 4, 8, 13, P.red);
  } else {
    const k = lt - POP1;
    const st = 1 + 0.22 * exp(-7 * k) * cos(TAU * 2.4 * k);
    const f = MID_LARRY;
    stand(f);
    f.bob = 0;
    f.eyes = k < 0.5 ? 'open' : 'happy';
    f.mouth = 'grin';
    const r2 = (1 - cos(k * TAU * 1.5 + PI)) / 2;
    armMix(f.armL, P_PRESS, P_UP, 1 - r2);
    armMix(f.armR, P_PRESS, P_UP, 1 - r2);
    shadow(ctx, x, gy - 1, 14);
    const me = mosaicFig(ctx, x, gy, f, 4, 2 - st, st);
    barbell(ctx, x, min(me.handL[1], me.handR[1]) - 1, 64, 6);
  }
  burst(ctx, x, 140, (lt - POP1) / 0.55);
  const px = lt < POP1 ? round(lerp(48, 70, c01(lt / POP1))) : round(lerp(70, 960, easeOut(prog(lt, POP1, POP1 + 0.35))));
  coach(ctx, lt, 'ONE MORE REP!', 0.2);
  hud(ctx, px, lt < POP1 ? 0 : 1, lt < POP1 ? undefined : lt - POP1);
  if (lt > POP1) kineticWord(ctx, levelArt(), 128, 60, lt - POP1);
}
function kineticWord(ctx, art, cx, cy, lt) {
  const s = slam(lt, 0.6);
  if (!s) return;
  const w = round(art.width * s);
  const h = round(art.height * s);
  ctx.drawImage(art, round(cx - w / 2), round(cy - h / 2), w, h);
}
const levelArt = () => cached('hg-level', measureText('LEVEL UP!', 2) + 12, 28, (c) => {
  bigText(c, 'LEVEL UP!', 6, 10, { scale: 2, color: P.yellow, outline: P.black, ow: 2, depth: 2, depthColor: P.darkRed });
});

// 4b. "Gain colours!" — curls; colours flood in key by key
function shotColour(ctx, lt) {
  ctx.drawImage(gym(), 0, 0);
  const x = 128;
  const gy = 184;
  const n = min(COLOUR_KEYS.length, floor(prog(lt, 0.3, 1.1) * COLOUR_KEYS.length + 0.001));
  for (let i = 0; i < COLOUR_KEYS.length; i++) {
    const k = COLOUR_KEYS[i];
    MIX_PAL[k] = i < n ? LARRY[k] : LARRY_GREY[k];
  }
  const f = MID_LARRY;
  f.pal = MIX_PAL;
  stand(f);
  f.bob = 0;
  f.eyes = n >= COLOUR_KEYS.length ? 'happy' : 'open';
  const cl = (1 - cos(lt * TAU * 1.6)) / 2;
  const cr = (1 - cos(lt * TAU * 1.6 + PI)) / 2;
  armMix(f.armL, P_CURL0, P_CURL1, cl);
  armMix(f.armR, P_CURL0, P_CURL1, cr);
  shadow(ctx, x, gy - 1, 14);
  const me = mosaicFig(ctx, x, gy, f, 3);
  f.pal = LARRY;
  dumbbell(ctx, me.handL[0], me.handL[1]);
  dumbbell(ctx, me.handR[0], me.handR[1]);
  // colour swatches fill in as the palette grows
  panel(ctx, 30, 30, 116, 34, P.black, P.white, 2);
  text(ctx, 'COLOURS', 88, 34, { color: P.white, align: 'center' });
  for (let i = 0; i < 16; i++) {
    const on = i < round((n / COLOUR_KEYS.length) * 16);
    R(ctx, 36 + i * 7, 47, 6, 10, on ? SWATCH[i] : P.slate);
    if (on && i === round((n / COLOUR_KEYS.length) * 16) - 1 && n < COLOUR_KEYS.length) sparkle(ctx, 39 + i * 7, 46, 2, P.white);
  }
  if (n > 0 && n < COLOUR_KEYS.length) sparkle(ctx, x - 14 + (n * 11) % 28, gy - 20 - (n * 7) % 30, 3, P.white);
  coach(ctx, lt, 'MORE COLOURS!', 0.15);
  hud(ctx, round(lerp(960, 2304, easeOut(prog(lt, 0.3, 1.1)))), 2, lt);
}
const SWATCH = [P.black, P.ink, P.slate, P.steel, P.red, P.darkRed, P.orange, P.yellow, P.cream, P.skin, P.tan, P.green, P.cyan, P.blue, P.navy, P.pink];

// 4c. "Gain... definition!" — strain, crouch, POP to hi-res
const POP3 = 1.2;
function shotDefine(ctx, lt) {
  const sx = kickX(lt, POP3, 3);
  ctx.save();
  ctx.translate(sx, 0);
  ctx.drawImage(gym(), 0, 0);
  const x = 150;
  const gy = 184;
  if (lt < POP3) {
    const f = MID_LARRY;
    f.pal = LARRY;
    stand(f);
    const crouch = smooth(prog(lt, 0.45, POP3));
    f.bob = round(crouch * 3);
    f.eyes = 'closed';
    f.mouth = 'teeth';
    f.sweat = lt;
    armMix(f.armL, P_PRESS, P_PRESS, 0);
    armMix(f.armR, P_PRESS, P_PRESS, 0);
    const shake = round(sin(lt * 60) * (0.5 + crouch));
    shadow(ctx, x, gy - 1, 14);
    const me = mosaicFig(ctx, x + shake, gy, f, 3, 1 + crouch * 0.1, 1 - crouch * 0.12);
    barbell(ctx, x + shake, min(me.handL[1], me.handR[1]) - 1, 96, 10);
    f.sweat = 0;
  } else {
    const k = lt - POP3;
    const st = 1 + 0.28 * exp(-6 * k) * cos(TAU * 2.2 * k);
    const f = HI_LARRY;
    stand(f);
    f.bob = 0;
    f.eyes = 'happy';
    f.mouth = 'grin';
    const up = easeOutBack(prog(k, 0, 0.3), 1.8);
    armMix(f.armL, P_PRESS, P_UP, up);
    armMix(f.armR, P_PRESS, P_UP, up);
    shadow(ctx, x, gy - 1, 15);
    const b = buf('pop', 96, 96);
    const me = figure(b.c, 48, 90, f);
    const w = round(96 * (2 - st));
    const h = round(96 * st);
    ctx.drawImage(b.cv, round(x - w / 2), round(gy - 90 * st), w, h);
    const hy = gy + (min(me.handL[1], me.handR[1]) - 90) * st;
    barbell(ctx, x, hy - 1, 96, 10);
    for (let i = 0; i < 4; i++) sparkle(ctx, x - 22 + i * 15, gy - 44 + ((i * 13) % 20), twinkle(lt, i * 0.25), P.white);
  }
  burst(ctx, x, 130, (lt - POP3) / 0.6, P.yellow);
  coach(ctx, lt, 'DEFINITION!', 0.25);
  hud(ctx, lt < POP3 ? 2304 : round(lerp(2304, 4096, easeOut(prog(lt, POP3, POP3 + 0.3)))), lt < POP3 ? 2 : 3, lt < POP3 ? undefined : lt - POP3);
  if (lt > POP3) kineticWord(ctx, hiresArt(), 150, 58, lt - POP3);
  ctx.restore();
}
const hiresArt = () => cached('hg-hires', measureText('HI-RES!', 3) + 14, 36, (c) => {
  bigText(c, 'HI-RES!', 7, 12, { scale: 3, color: P.white, outline: P.black, ow: 2, depth: 3, depthColor: P.red });
});

// --- 5. payoff: back on the beach, the tables have turned ----------------------------
function shotPayoff(ctx, lt) {
  ctx.drawImage(beachBg(), 0, 0);
  for (let i = 0; i < 8; i++) R(ctx, round(mod(i * 61 + lt * 14, W + 30) - 15), 108 + (i % 3) * 9, 12, 1, A(P.white, 0.8));
  // Brad, now low-res, tries a flex: his arm cells clunk up
  const s = LOW_BRAD;
  s.eyes = lt > 1.6 ? 'open' : 'shades';
  s.tear = lt > 1.9 ? mod((lt - 1.9) * 2.2, 2.4) : -1;
  s.aL = 0.25 + smooth(prog(lt, 0.9, 1.3)) * 1.3 * (1 - smooth(prog(lt, 1.6, 1.9)));
  s.bL = smooth(prog(lt, 0.9, 1.3)) * 1.5 * (1 - smooth(prog(lt, 1.6, 1.9)));
  s.aR = 0.25;
  s.bob = lt > 1.6 ? round(wobble(lt, 1.6, 2, 3, 6)) : 0;
  shadow(ctx, 254, 177, 14);
  lowres(ctx, 254, 177, 5, s);
  // Larry struts in, hi-res, and flexes
  const f = HI_LARRY;
  const x = lerp(-30, 156, easeOut(prog(lt, 0, 1.1)));
  const walking = lt < 1.1;
  if (walking) walk(f, lt * TAU * 1.9, 1 - smooth(prog(lt, 0.8, 1.1)));
  else {
    stand(f);
    f.bob = round(-spring(lt - 1.1, 1.6, 6) * 2 + 2) * 0;
  }
  const flex = smooth(prog(lt, 0.85, 1.25));
  armMix(f.armL, P_SWING, P_FLEX, flex);
  armMix(f.armR, P_SWING, P_FLEX, flex);
  if (!walking) {
    const pump = sin((lt - 1.1) * TAU * 1.2) * 0.1;
    armMix(f.armL, P_FLEX, P_UP, max(0, pump));
  }
  f.eyes = lt > 1.75 && lt < 1.95 ? 'closed' : 'happy';
  f.mouth = 'grin';
  shadow(ctx, round(x), 183, 15);
  const me = figure(ctx, x, 184, f);
  if (lt > 1.8 && lt < 2.6) sparkle(ctx, round(x) + 4, me.top + 16, twinkle(lt - 1.8, 0, 14), P.white);
  for (let i = 0; i < 3; i++) if (!walking) sparkle(ctx, round(x) - 20 + i * 20, me.top + 22 + i * 6, twinkle(lt, i * 0.3), P.white);
  tag(ctx, 'HI-RES LARRY', 86, 66, lt - 1.25, round(x) - 4, me.top - 4);
  tag(ctx, 'LOW-RES BRAD', 300, 122, lt - 1.55, 262, 128);
}

// --- 6. end slate ------------------------------------------------------------------
const slateBg = () => cached('hg-slate', W, H, (c) => {
  bands(c, 0, 0, W, H, [P.black, P.black, P.maroon, P.black]);
  for (let i = 0; i < 10; i++) {
    const x = i * 46 - 40;
    poly(c, [[x, H], [x + 18, H], [x + 98, 0], [x + 80, 0]], A(P.darkRed, 0.22));
  }
  glow(c, 192, 70, 120, P.red, 0.05, 5);
  R(c, 0, 116, W, 1, A(P.red, 0.5));
});
const SLOGAN = [['GET', 1.35], ['MORE', 1.6], ['DEFINITION.', 1.9]];
const SLOGAN_X = (() => {
  let x = 0;
  const xs = [];
  for (const [w] of SLOGAN) {
    xs.push(x);
    x += measureText(w, 2) + 8;
  }
  xs.total = x - 8;
  return xs;
})();
const SLOGAN_ART = [];
function sloganArt(i, word) {
  if (!SLOGAN_ART[i]) {
    SLOGAN_ART[i] = cached(`hg-slogan-${i}`, measureText(word, 2) + 4, 20, (c) => {
      text(c, word, 3, 9, { color: P.white, scale: 2, shadow: P.darkRed });
    });
  }
  return SLOGAN_ART[i];
}
function shotSlate(ctx, lt) {
  ctx.drawImage(slateBg(), 0, 0);
  for (let i = 0; i < 8; i++) {
    const y = 24 + ((i * 47) % 160);
    const x = W - mod(lt * 380 + i * 90, W + 60);
    R(ctx, x, y, 36, 1, A(P.red, 0.6));
  }
  // dumbbell swings in from the left and settles
  const dx = round(lerp(-90, 157, spring(lt, 1.5, 6)));
  ctx.drawImage(dumbbellArt(), dx, 16);
  if (lt > 0.6) glint(ctx, dumbbellArt(), dx, 16, mod(lt - 0.6, 3.5) / 0.6, { width: 6 });
  // the wordmark resolves from fat cells to sharp, then a light sweep
  const mk = MARK();
  const x0 = round(192 - mk.w / 2) - mk.ox;
  const y0 = 54 - mk.oy;
  const b = resAt(lt, 0.12, 0.07);
  if (lt > 0.12) resolveArt(ctx, mk.cv, x0, y0, b);
  if (b === 1) glint(ctx, mk.cv, x0, y0, mod(lt - 0.8, 3.5) / 0.7, { width: 7 });
  if (lt > 0.9) {
    const p = easeOut(prog(lt, 0.9, 1.2));
    micro(ctx, 'OPEN 24/7  -  60 REPS PER SECOND', 192, 104 + round((1 - p) * 4), { color: P.orange, align: 'center' });
  }
  // slogan ribbon, word by word on the voice-over
  if (lt > 1.2) {
    const open = easeOut(prog(lt, 1.2, 1.45));
    const fw = SLOGAN_X.total + 24;
    const w = round(fw * open);
    const x = round(192 - w / 2);
    const y = 120;
    R(ctx, x - 7, y + 4, 9, 20, P.darkRed);
    R(ctx, x + w - 2, y + 4, 9, 20, P.darkRed);
    rrect(ctx, x, y, w, 24, P.black, 2);
    rrect(ctx, x + 1, y + 1, w - 2, 22, P.red, 1);
    R(ctx, x + 1, y + 20, w - 2, 3, P.darkRed);
    const left = round(192 - SLOGAN_X.total / 2);
    for (let i = 0; i < SLOGAN.length; i++) {
      const [word, at] = SLOGAN[i];
      const s = slam(lt - at, i === 2 ? 0.8 : 0.45);
      if (!s) continue;
      const art = sloganArt(i, word);
      const ww = round(art.width * s);
      const hh = round(art.height * s);
      const cx = left + SLOGAN_X[i] + (art.width - 4) / 2;
      ctx.drawImage(art, round(cx - ww / 2), round(y + 12 - hh / 2), ww, hh);
    }
  }
  if (lt > 2.4) {
    const p = easeOutBack(prog(lt, 2.4, 2.7), 2.4);
    const s = 'HIRESGYM.PXL';
    const w = measureText(s) + 14;
    const y = 156 + round((1 - p) * 10);
    panel(ctx, round(192 - w / 2), y, w, 13, P.black, P.red, 2);
    text(ctx, s, 192, y + 3, { color: P.yellow, align: 'center' });
  }
  // hi-res Larry gives a thumbs up from the corner
  if (lt > 1.9) {
    const f = HI_LARRY;
    stand(f);
    f.bob = 0;
    f.eyes = lt > 3.3 && lt < 3.45 ? 'closed' : 'happy';
    const x = lerp(W + 30, 334, easeOut(prog(lt, 1.9, 2.4)));
    armMix(f.armL, P_FLEX, P_FLEX, 0);
    armMix(f.armR, P_DOWN, P_THUMB, easeOutBack(prog(lt, 2.4, 2.75), 2));
    const me = figure(ctx, x, 198, f);
    if (lt > 2.7) {
      const [hx, hy] = me.handR;
      R(ctx, hx - 1, hy - 6, 3, 4, P.black);
      R(ctx, hx, hy - 5, 1, 3, P.skin);
      if (lt < 3.3) sparkle(ctx, hx + 4, hy - 8, twinkle(lt - 2.7, 0, 14), P.white);
    }
  }
  if (lt > 2.8) {
    R(ctx, 0, H - 12, W, 12, P.black);
    micro(ctx, 'RESULTS MAY VARY. ANTI-ALIASING NOT INCLUDED. MEMBERSHIP RENEWS EVERY FRAME.', 192, H - 8, { color: P.fog, align: 'center' });
  }
}

const SHOTS = [
  { at: T_BEACH, draw: shotBeach },
  { at: T_ZOOM, draw: shotZoom },
  { at: T_SIGN, draw: shotSign, tr: 'mosaic', d: 0.4 },
  { at: T_PUMP, draw: shotPump, tr: 'whip', d: 0.3, dir: 1 },
  { at: T_COLOUR, draw: shotColour, tr: 'whip', d: 0.3, dir: 1 },
  { at: T_DEFINE, draw: shotDefine, tr: 'whip', d: 0.3, dir: 1 },
  { at: T_PAYOFF, draw: shotPayoff, tr: 'mosaic', d: 0.4 },
  { at: T_SLATE, draw: shotSlate, tr: 'mosaic', d: 0.4 },
];

export default {
  id: 'hi-res-gym',
  brand: 'HI-RES GYM',
  duration: DURATION,
  voice: { gender: 'male', lang: 'en-US', pitch: 0.8, rate: 1.1 },
  script: [
    { at: 0.5, text: 'Tired of being... low resolution?' },
    { at: 4.7, text: 'Even in close-up?' },
    { at: 7.1, text: 'Get down to Hi-Res Gym!' },
    { at: 9.6, text: 'Pump those pixels!' },
    { at: 11.45, text: 'Gain colours!' },
    { at: 12.95, text: 'Gain... definition!' },
    { at: 16.1, text: "Now who's low-res?" },
    { at: 19.0, text: 'Hi-Res Gym. Get more definition.' },
  ],
  // 160 bpm rock, 62 beats = the whole ad: a mopey riff on the beach (0-12),
  // a sad sting for the close-up (12-18), power chords under the sign (18-25),
  // a montage that climbs a step per stage (25-30-34-42) with the top E landing
  // on the hi-res POP, the victory strut (42-50) and the HI-RES GYM sting from
  // the end slate (50) resolving on E.
  tune: {
    bpm: 160,
    wave: 'sawtooth',
    notes: tune(
      'E4:1 G4:1 A4:1 G4:1 E4:2 D4:2 E4:4',
      'R:1 E5:0.5 D5:0.5 B4:2 G4:2',
      'E4:0.5 E4:0.5 G4:0.5 E4:0.5 A4:1 G4:1 E4:0.5 E4:0.5 B4:2',
      'E5:0.5 E5:0.5 D5:0.5 E5:0.5 G5:1 E5:0.5 D5:0.5 E5:1',
      'A5:0.5 A5:0.5 G5:0.5 A5:0.5 B5:2',
      'B5:0.5 B5:0.5 A5:0.5 B5:0.5 D6:1.25 E6:4.75',
      'E5:1 G5:1 B5:1 G5:1 A5:2 B5:2',
      'B4:0.5 E5:0.5 G5:1 B5:2 R:1 A5:0.5 B5:0.5 E6:4 R:2',
    ),
    bass: tune(
      'E2:4 C3:4 E2:4',
      'E2:2 B1:2 E2:2',
      'E2:1 E2:1 E2:1 E2:1 A2:1 G2:1 E2:1',
      rep('E2:0.5', 10),
      rep('A2:0.5', 8),
      rep('B2:0.5', 6), 'B2:0.25 E3:4.75',
      'E2:1 E2:1 G2:1 G2:1 A2:2 B2:2',
      'E2:2 B2:2 E2:4 R:4',
    ),
    bassWave: 'square',
    drums: tune(
      rep('K:1 H:1 S:1 H:1', 3),
      'K:2 R:4',
      rep('K:0.5 K:0.5 S:1', 3), 'S:0.25 S:0.25 S:0.25 S:0.25',
      rep('K:0.5 H:0.5 S:0.5 H:0.5', 8), 'K:0.5 S:0.5',
      'K:1 S:1 K:1 S:1 K:1 S:1 K:1 S:1',
      'K:1 S:1 K:1 S:1 K:0.5 K:0.5 S:1 K:2 R:4',
    ),
  },
  draw(ctx, t, dt) {
    run(ctx, dt, SHOTS);
  },
};
