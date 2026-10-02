// THE GRAND BUFFER — the hotel where the loading screen IS the holiday.
// Eight shots, 24.8 s: a frantic sightseeing sprint, a skidding selfie stop,
// the exhausted close-up, a match cut through a phone's loading spinner into
// the hotel at dusk, guests lounging in front of a giant loading screen as if
// it were a sunset, the famous progress-bar pool, a waiter serving "a helpful
// tip" under a silver cloche, and the end slate. Brand: dusk purple, gold,
// cream. "Stay at 99%. Forever."
//
// Every frame is a pure function of the ad clock: limbs are two-bone arms
// tweened on arcs plus procedural legs on kit hero() bodies, props follow
// through on damped springs, scenery is baked once into cached canvases, and
// transitions reuse a few pooled scratch canvases (nothing is allocated per
// frame beyond small numbers).
import {
  P, W, H, R, A, rrect, panel, disc, oval, ring, poly, line, dither, bands, sparkle, twinkle, shadow, cached, text,
  bigText, micro, hero, faceCU, wordmark, drawMark, glint, glow, cloud, clipRect, prog, lerp, easeOut, easeOutBack,
  spring, wobble, lazy, measureText, tune, rep,
} from './kit.js';
import { wrapLines } from '../font.js';

const { sin, cos, PI, round, floor, min, max, abs, exp, hypot, atan2 } = Math;
const TAU = PI * 2;

// --- timing ------------------------------------------------------------------
// Shot starts (seconds). The voice-over lines start on these beats (see script).
const T_RUN = 0;
const T_SELFIE = 2.4;
const T_TIRED = 4.4;
const T_HOTEL = 5.8;
const T_LOUNGE = 8.3;
const T_POOL = 12.4;
const T_TIPS = 15.3;
const T_SLATE = 19.4;
const DURATION = 24.6;

// --- motion helpers (local) ----------------------------------------------------
const c01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** easeInOutCubic */
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
/** Stamp scale: starts big, slams down with a wobble, settles at 1 (0 before lt 0). */
const slam = (lt, amp = 0.7) => (lt <= 0 ? 0 : 1 + amp * exp(-9 * lt) * cos(TAU * 2.2 * lt));

/** Arm pose from angles: a = shoulder (0 hangs down, + swings outward), b = elbow bend. */
function armAng(out, a, b, l1 = 7.5, l2 = 7.5) {
  out[0][0] = -sin(a) * l1;
  out[0][1] = cos(a) * l1;
  out[1][0] = out[0][0] - sin(a + b) * l2;
  out[1][1] = out[0][1] + cos(a + b) * l2;
  return out;
}
/** Two-bone blend of authored poses (angles interpolate, so hands travel on arcs). */
function armMix(out, pa, pb, p) {
  const ea = pa[0];
  const eb = pb[0];
  const ua = atan2(ea[1], ea[0]);
  let ub = atan2(eb[1], eb[0]);
  if (ub - ua > PI) ub -= TAU;
  else if (ua - ub > PI) ub += TAU;
  const la = hypot(ea[0], ea[1]);
  const lb = hypot(eb[0], eb[1]);
  const fa = atan2(pa[1][1] - ea[1], pa[1][0] - ea[0]);
  let fb = atan2(pb[1][1] - eb[1], pb[1][0] - eb[0]);
  if (fb - fa > PI) fb -= TAU;
  else if (fa - fb > PI) fb += TAU;
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

/** One thick outlined limb segment (kit stroke() without the point arrays). */
function seg(ctx, x0, y0, x1, y1, w, col, ol) {
  const o = floor(w / 2);
  if (ol) line(ctx, x0 - o - 1, y0 - o - 1, x1 - o - 1, y1 - o - 1, ol, w + 2);
  line(ctx, x0 - o, y0 - o, x1 - o, y1 - o, col, w);
}

// A figure is a reusable state object; figure() draws procedural legs and then
// a kit hero() body (legs:'none') whose arms are the tweened poses.
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
/** Front-view run: alternating knee lifts, double-time bob, the free arm pumps. */
function runCycle(f, ph, amp = 1) {
  const s = sin(ph);
  f.lf[0] = s * 2 * amp;
  f.lf[1] = max(0, s) * 5 * amp;
  f.rf[0] = -s * 2 * amp;
  f.rf[1] = max(0, -s) * 5 * amp;
  f.bob = -abs(s) * 2 * amp;
  armAng(f.armR, 0.45 + 0.5 * s * amp, 1.7);
}
function stand(f) {
  f.lf[0] = 0;
  f.lf[1] = 0;
  f.rf[0] = 0;
  f.rf[1] = 0;
}

// --- pooled scratch canvases -----------------------------------------------------
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
/** Draw a figure about its feet with squash & stretch (sx, sy around 1). */
function squashed(ctx, x, gy, sx, sy, f) {
  if (abs(sx - 1) < 0.02 && abs(sy - 1) < 0.02) return figure(ctx, x, gy, f);
  const b = buf('sq', 128, 128);
  const me = figure(b.c, 64, 118, f);
  const w = round(128 * sx);
  const h = round(128 * sy);
  ctx.drawImage(b.cv, round(x - 64 * sx), round(gy - 118 * sy), w, h);
  // hand positions mapped back to the frame for props
  me.handL[0] = x + (me.handL[0] - 64) * sx;
  me.handL[1] = gy + (me.handL[1] - 118) * sy;
  me.handR[0] = x + (me.handR[0] - 64) * sx;
  me.handR[1] = gy + (me.handR[1] - 118) * sy;
  me.top = gy + (me.top - 118) * sy;
  return me;
}
/** Nearest-neighbour camera zoom: source point (ax, ay) lands on screen point (sx, sy). */
function zoomDraw(ctx, cv, ax, ay, sx, sy, z) {
  const sw = W / z;
  const sh = H / z;
  const x0 = max(0, min(W - sw, ax - sx / z));
  const y0 = max(0, min(H - sh, ay - sy / z));
  ctx.drawImage(cv, x0, y0, sw, sh, 0, 0, W, H);
}

// --- shot sequencer with this brand's transitions ----------------------------------
// tr: 'whip' (smeared pan, dir) | 'bar' (gold loading-bar wipe) | 'cut' (default).
const PCT = Array.from({ length: 101 }, (_, i) => `${i}%`);
function run(ctx, dt, info, shots) {
  let i = 0;
  while (i + 1 < shots.length && dt >= shots[i + 1].at) i++;
  const s = shots[i];
  const lt = dt - s.at;
  if (!i || !s.tr || lt >= s.d) {
    s.draw(ctx, lt, info);
    return;
  }
  const prev = shots[i - 1];
  const p = lt / s.d;
  const a = buf('ta');
  prev.draw(a.c, dt - prev.at, info);
  const b = buf('tb');
  s.draw(b.c, lt, info);
  if (s.tr === 'whip') whip(ctx, a.cv, b.cv, p, s.dir || 1);
  else barWipe(ctx, a.cv, b.cv, p);
}
/** Whip pan: both frames slide together and smear horizontally with speed. */
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
  // horizontal down/up-sample = pixel-art motion blur (rows smear into streaks)
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
/** Brand wipe: a gold loading bar sweeps across, the new shot "loads" behind it. */
function barWipe(ctx, a, b, p) {
  const e = io(p);
  const edge = round(e * (W + 24)) - 12;
  ctx.drawImage(a, 0, 0);
  const w = max(0, min(W, edge));
  if (w > 0) ctx.drawImage(b, 0, 0, w, H, 0, 0, w, H);
  R(ctx, edge - 5, 0, 10, H, P.black);
  R(ctx, edge - 4, 0, 8, H, P.yellow);
  R(ctx, edge - 4, 0, 2, H, P.cream);
  R(ctx, edge + 2, 0, 2, H, P.orange);
  const pct = PCT[min(99, floor(e * 100))];
  const tw = measureText(pct) + 10;
  panel(ctx, edge - round(tw / 2), 101, tw, 14, P.ink, P.yellow, 2);
  text(ctx, pct, edge, 105, { color: P.yellow, align: 'center' });
}

// --- cast ------------------------------------------------------------------------------
const GUEST = {
  K: P.black, W: P.white, S: P.skin, s: P.skinShade, H: P.brown, h: P.tan, E: P.brown, T: P.pink, t: P.red,
  L: P.pink, C: P.cream, X: P.pink, b: P.brown, Y: P.yellow, P: P.cyan, p: P.blue, B: P.white, A: P.cream,
  a: P.red, M: P.maroon, N: P.pink,
};
const WAITER = {
  K: P.black, W: P.white, S: P.tan, s: P.tanShade, H: P.black, h: P.slate, E: P.black, T: P.ink, t: P.black,
  L: P.white, C: P.white, X: P.red, b: P.black, Y: P.yellow, P: P.black, p: P.ink, B: P.black, A: P.white,
  a: P.silver, M: P.maroon, N: P.pink,
};
const TOUR = fig(GUEST, { hat: 'sunhat', sleeves: 'short' });
const LOUNGER = fig(GUEST, { hat: 'sunhat', sleeves: 'short', legs: false, eyes: 'shades', blush: true });
const SERVER = fig(WAITER, { mustache: true, eyes: 'happy', mouth: 'smile' });

// authored arm poses (left-arm space: x < 0 is outward)
const P_DOWN = [[-1, 7], [-2, 14]];
const P_SELFIE = [[-7, -4], [-11, -13]];
const P_HANDLE = [[-5, 5], [-12, 9]];
const P_BEHIND = [[-8, -3], [-3, -11]];
const P_REST = [[-4, 7], [-9, 12]];
const P_SIP = [[-3, 8], [7, 3]];
const P_TRAY = [[-2, 8], [6, 7]];
const P_LIFT = [[-7, -3], [-9, -13]];
const P_THUMB = [[-6, 4], [-8, -5]];

// --- brand ---------------------------------------------------------------------------
const MARK = lazy(() => wordmark('GRAND BUFFER', {
  h: 22, pen: 1, square: true, wide: 0.8, gap: 3,
  fill: [P.white, P.cream, P.yellow, P.orange], outline: [[P.maroon, 1], [P.black, 1]], depth: 2, depthColor: P.black,
}));
const DIM_MARK = () => {
  const mk = MARK();
  return cached('gb-mark-dim', mk.cv.width, mk.cv.height, (c) => {
    c.globalAlpha = 0.28;
    c.drawImage(mk.cv, 0, 0);
  });
};

/** The emblem: a gold loading spinner. phase in revolutions (8 steps each). */
function spinner(ctx, cx, cy, r, phase, dot = 2, on = P.yellow, mid = P.orange, off = P.maroon) {
  const head = floor(mod(phase, 1) * 8);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU - PI / 2;
    const k = (head - i + 8) % 8;
    const x = cx + cos(a) * r;
    const y = cy + sin(a) * r;
    const d = k === 0 ? dot + 1 : dot;
    disc(ctx, x, y, d + 1, P.black);
    disc(ctx, x, y, d, k === 0 ? on : k <= 2 ? mid : off);
    if (k === 0 && d >= 2) R(ctx, round(x) - 1, round(y) - 1, 1, 1, P.white);
  }
}
const spinPhase = (dt) => dt * 1.15;

function progressBar(ctx, x, y, w, h, p, lt, fill = P.yellow, back = P.ink) {
  R(ctx, x - 2, y - 2, w + 4, h + 4, P.black);
  R(ctx, x - 1, y - 1, w + 2, h + 2, P.cream);
  R(ctx, x, y, w, h, back);
  const fw = round(w * p);
  R(ctx, x, y, fw, h, fill);
  R(ctx, x, y, fw, 1, P.white);
  if (h > 3) R(ctx, x, y + h - 1, fw, 1, P.orange);
  // a highlight keeps crawling along the bar: it is always "almost done"
  const sx = x + mod(lt * 70, fw + 30) - 15;
  if (sx > x && sx < x + fw - 3) R(ctx, sx, y + 1, 3, max(1, h - 2), A(P.white, 0.6));
}

// --- shared props ---------------------------------------------------------------------
function suitcase(ctx, x, gy, lift) {
  x = round(x);
  const y = round(gy - 25 - lift);
  disc(ctx, x - 8, y + 23, 2, P.black);
  disc(ctx, x + 8, y + 23, 2, P.black);
  rrect(ctx, x - 13, y, 26, 22, P.black, 2);
  rrect(ctx, x - 12, y + 1, 24, 20, P.orange, 2);
  R(ctx, x - 12, y + 1, 24, 2, P.yellow);
  R(ctx, x - 12, y + 18, 24, 3, P.rust);
  R(ctx, x - 1, y + 1, 2, 20, P.rust);
  R(ctx, x - 9, y + 5, 6, 5, P.white);
  R(ctx, x - 8, y + 6, 4, 1, P.red);
  R(ctx, x + 3, y + 10, 7, 6, P.cyan);
  R(ctx, x + 4, y + 13, 5, 1, P.navy);
  R(ctx, x - 3, y - 4, 6, 1, P.black);
  R(ctx, x - 3, y - 4, 1, 4, P.black);
  R(ctx, x + 2, y - 4, 1, 4, P.black);
}
function handle(ctx, hand, x, topY) {
  line(ctx, hand[0], hand[1], round(x), round(topY - 3), P.black, 2);
}
function neckCamera(ctx, x, top) {
  const y = round(top + 30);
  R(ctx, x - 6, y - 4, 1, 4, P.black);
  R(ctx, x + 5, y - 4, 1, 4, P.black);
  R(ctx, x - 5, y, 10, 7, P.black);
  R(ctx, x - 4, y + 1, 8, 5, P.slate);
  disc(ctx, x, y + 3, 2, P.black);
  R(ctx, x, y + 2, 1, 1, P.cyan);
}
function sweatFly(ctx, x, top, lt) {
  for (let i = 0; i < 3; i++) {
    const q = mod(lt * 1.6 + i / 3, 1);
    const sx = x - 10 - q * 26;
    const sy = top + 6 - sin(q * PI) * 12 + q * 8;
    R(ctx, sx, sy, 2, 2, P.blue);
    R(ctx, sx, sy, 1, 1, P.white);
  }
}
function speedLines(ctx, lt, y0, n, a = 0.7) {
  for (let i = 0; i < n; i++) {
    const len = 18 + ((i * 29) % 26);
    const x = W - mod(lt * 620 + i * 137, W + 80);
    R(ctx, x, y0 + i * 13, len, 1, A(P.white, a));
  }
}
function puff(ctx, x, y, q) {
  if (q <= 0 || q >= 1) return;
  const r = round(2 + q * 6);
  disc(ctx, x, y - q * 6, r + 1, A(P.tan, 0.6 * (1 - q)));
  disc(ctx, x, y - q * 6, r, A(P.white, 0.8 * (1 - q)));
}

// Memoised wrap (font.js wrapLines is cached and frozen too).
const lines = (s, w, scale = 1) => wrapLines(s, w, scale);

// --- 1. the frantic holiday (tracking shot) ------------------------------------
const skyDay = () => cached('gb-sky-day', W, 128, (c) => {
  bands(c, 0, 0, W, 128, [P.blue, P.cyan, P.cyan, P.cream]);
  disc(c, 318, 32, 16, A(P.white, 0.25));
  disc(c, 318, 32, 12, P.yellow);
  disc(c, 318, 32, 9, P.cream);
});
const farCity = () => cached('gb-far', 320, 64, (c) => {
  const col = P.fog;
  const y = 64;
  poly(c, [[6, y], [40, y - 36], [74, y]], col);
  R(c, 96, y - 50, 8, 50, col);
  poly(c, [[92, y - 50], [108, y - 50], [100, y - 62]], col);
  ring(c, 158, y - 26, 24, col);
  ring(c, 158, y - 26, 23, col);
  for (let i = 0; i < 8; i++) line(c, 158, y - 26, 158 + round(cos(i * 0.785) * 23), y - 26 + round(sin(i * 0.785) * 23), col);
  R(c, 155, y - 26, 6, 26, col);
  disc(c, 228, y - 26, 13, col);
  R(c, 214, y - 26, 28, 26, col);
  R(c, 252, y - 44, 5, 44, col);
  poly(c, [[250, y - 44], [259, y - 44], [254, y - 52]], col);
  R(c, 276, y - 18, 40, 18, col);
  R(c, 284, y - 30, 22, 12, col);
});
const shops = () => cached('gb-shops', 288, 80, (c) => {
  const signs = ['GIFTS', 'CAFE', 'TOURS'];
  const walls = [P.rust, P.purple, P.darkGreen];
  const trims = [P.brown, P.maroon, P.navy];
  for (let k = 0; k < 3; k++) {
    const x = k * 96;
    R(c, x, 4, 96, 76, walls[k]);
    R(c, x, 4, 96, 4, trims[k]);
    R(c, x + 95, 4, 1, 76, P.black);
    rrect(c, x + 22, 12, 52, 11, P.black, 1);
    rrect(c, x + 23, 13, 50, 9, P.cream, 1);
    text(c, signs[k], x + 48, 15, { color: P.maroon, align: 'center' });
    for (const wx of [x + 8, x + 58]) {
      R(c, wx - 1, 29, 32, 26, P.black);
      R(c, wx, 30, 30, 24, P.navy);
      line(c, wx + 4, 52, wx + 18, 32, P.blue, 2);
      R(c, wx + 22, 33, 4, 1, P.silver);
    }
    for (let i = 0; i < 9; i++) {
      R(c, x + 4 + i * 10, 56, 10, 7, i % 2 ? P.white : P.red);
      R(c, x + 6 + i * 10, 63, 6, 1, i % 2 ? P.white : P.red);
    }
    R(c, x + 36, 64, 24, 16, P.black);
    R(c, x + 37, 65, 22, 15, P.brown);
    R(c, x + 54, 72, 2, 2, P.yellow);
  }
});
function tileX(ctx, cv, off, y) {
  const w = cv.width;
  for (let x = -mod(off, w); x < W; x += w) ctx.drawImage(cv, round(x), y);
}
function street(ctx, cam) {
  R(ctx, 0, 152, W, 34, P.slate);
  R(ctx, 0, 152, W, 2, P.fog);
  for (let x = -mod(cam, 32); x < W; x += 32) R(ctx, round(x), 154, 1, 32, P.steel);
  R(ctx, 0, 186, W, 4, P.steel);
  R(ctx, 0, 186, W, 1, P.silver);
  R(ctx, 0, 190, W, 26, P.ink);
  for (let x = -mod(cam * 1.1, 56); x < W; x += 56) R(ctx, round(x), 203, 26, 2, P.fog);
}
function lampPost(ctx, x) {
  R(ctx, x, 34, 6, 182, P.black);
  R(ctx, x + 1, 40, 1, 176, P.slate);
  R(ctx, x - 7, 28, 20, 6, P.black);
  R(ctx, x - 5, 34, 16, 3, P.yellow);
  R(ctx, x - 5, 34, 16, 1, P.cream);
}
const PLAN = ['9:00 MUSEUM', '9:04 CASTLE', '9:06 BOAT TRIP', '9:07 GIFT SHOP', '9:09 VOLCANO', '9:10 MUSEUM 2', '9:11 OPERA', '9:12 ZOO', '9:13 SPA (FAST)', '9:14 MUSEUM 3'];
function tick(ctx, x, y, c) {
  R(ctx, x, y + 3, 1, 2, c);
  R(ctx, x + 1, y + 4, 1, 2, c);
  R(ctx, x + 2, y + 3, 1, 2, c);
  R(ctx, x + 3, y + 1, 1, 3, c);
  R(ctx, x + 4, y, 1, 2, c);
}
function itinerary(ctx, x, y, s) {
  panel(ctx, x, y, 118, 68, P.white, P.black, 2);
  R(ctx, x + 2, y + 2, 114, 11, P.red);
  text(ctx, 'TODAY', x + 6, y + 4, { color: P.white });
  micro(ctx, 'DAY 1 OF 1', x + 112, y + 5, { color: P.cream, align: 'right' });
  clipRect(ctx, x + 2, y + 14, 114, 52);
  for (let k = max(0, floor(s) - 1); k < s + 6; k++) {
    const r = k - s;
    const yy = round(y + 17 + r * 10);
    const it = PLAN[k % PLAN.length];
    const done = r < 0.6;
    if (done) {
      tick(ctx, x + 5, yy + 1, P.green);
      text(ctx, it, x + 13, yy, { color: P.fog });
      R(ctx, x + 13, yy + 3, measureText(it), 1, P.red);
    } else text(ctx, it, x + 13, yy, { color: r < 1.6 ? P.navy : P.steel });
  }
  ctx.restore();
}

function shotRun(ctx, lt) {
  const cam = lt * 150;
  ctx.drawImage(skyDay(), 0, 0);
  tileX(ctx, farCity(), cam * 0.12, 42);
  tileX(ctx, shops(), cam * 0.45, 74);
  street(ctx, cam);
  const x = 182 + round(sin(lt * 1.7) * 3);
  const gy = 176;
  const ph = lt * TAU * 2.6;
  runCycle(TOUR, ph, 1);
  armMix(TOUR.armL, P_HANDLE, P_HANDLE, 0);
  TOUR.armL[1][1] += sin(ph * 2) * 0.8;
  TOUR.eyes = 'wide';
  TOUR.mouth = 'O';
  TOUR.look = 1;
  TOUR.sweat = lt;
  const lift = max(0, sin(ph * 2 - 1.1)) * 3;
  shadow(ctx, x - 44, gy - 1, 12);
  shadow(ctx, x, gy - 1, 13);
  suitcase(ctx, x - 44, gy, lift);
  const me = figure(ctx, x, gy, TOUR);
  handle(ctx, me.handL, x - 44, gy - 25 - lift);
  neckCamera(ctx, x, me.top - TOUR.bob * 0.5);
  sweatFly(ctx, x, me.top, lt);
  speedLines(ctx, lt, 96, 5, 0.6);
  for (let px = 300 - mod(cam * 1.7, 300); px < W + 10; px += 300) lampPost(ctx, round(px));
  itinerary(ctx, round(lerp(W + 6, 256, spring(lt - 0.1, 1.4, 5))), 24, max(0, lt - 0.35) * 3.4);
}

// --- 2. the selfie stop ---------------------------------------------------------
const plaza = () => cached('gb-plaza', W, H, (c) => {
  bands(c, 0, 0, W, 150, [P.blue, P.cyan, P.cyan, P.cream]);
  // far roofs
  for (let i = 0; i < 12; i++) R(c, i * 34 - 6, 128 - ((i * 7) % 14), 30, 30, A(P.fog, 0.55));
  // the arch
  const ax = 236;
  R(c, ax - 66, 46, 132, 106, P.black);
  R(c, ax - 64, 48, 128, 104, P.cream);
  R(c, ax + 52, 48, 12, 104, P.tan);
  R(c, ax - 74, 40, 148, 22, P.black);
  R(c, ax - 72, 42, 144, 18, P.cream);
  R(c, ax - 72, 57, 144, 3, P.tan);
  R(c, ax - 76, 62, 152, 3, P.black);
  R(c, ax - 74, 62, 148, 2, P.silver);
  text(c, 'VERY OLD ARCH', ax, 47, { color: P.maroon, align: 'center' });
  for (let y = 74; y < 150; y += 12) {
    R(c, ax - 64, y, 128, 1, P.tan);
    for (let x = ax - 64 + ((y / 12) % 2) * 8; x < ax + 64; x += 16) R(c, x, y + 1, 1, 11, P.tan);
  }
  // opening (see-through)
  disc(c, ax, 98, 26, P.black);
  R(c, ax - 26, 98, 53, 54, P.black);
  disc(c, ax, 98, 24, P.cyan);
  R(c, ax - 24, 98, 49, 54, P.cyan);
  R(c, ax - 24, 132, 49, 20, A(P.fog, 0.55));
  for (const sx of [ax - 50, ax + 38]) {
    R(c, sx, 82, 12, 22, P.black);
    R(c, sx + 1, 83, 10, 20, P.tan);
    disc(c, sx + 6, 89, 3, P.cream);
    R(c, sx + 4, 92, 5, 9, P.cream);
  }
  // plaza paving
  R(c, 0, 150, W, 66, P.cream);
  R(c, 0, 150, W, 2, P.white);
  for (let y = 160, k = 0; y < H; y += 10 + k * 2, k++) {
    R(c, 0, y, W, 1, P.tan);
    for (let x = (k % 2) * 14; x < W; x += 28 + k * 4) R(c, x, y + 1, 1, 9 + k * 2, P.tan);
  }
  // souvenir stand
  R(c, 14, 96, 64, 56, P.black);
  R(c, 16, 112, 60, 40, P.brown);
  for (let i = 0; i < 6; i++) R(c, 16 + i * 10, 98, 10, 12, i % 2 ? P.white : P.blue);
  for (let i = 0; i < 4; i++) {
    R(c, 21 + i * 13, 118, 10, 12, P.white);
    R(c, 22 + i * 13, 119, 8, 7, [P.cyan, P.pink, P.yellow, P.green][i]);
  }
  R(c, 16, 136, 60, 3, P.tanShade);
  text(c, 'POSTCARDS', 46, 142, { color: P.cream, align: 'center' });
});

const SKID = 0.5;
const DASH = 1.5;
function selfieX(lt) {
  if (lt < SKID) return lerp(-40, 150, easeOut(lt / SKID));
  if (lt < DASH) return 150;
  return 150 + ein((lt - DASH) / 0.42) * 330;
}
function pigeon(ctx, x, y, lt, i) {
  const flyAt = 0.32 + i * 0.06;
  if (lt < flyAt) {
    const peck = max(0, sin(lt * 9 + i * 2)) > 0.7 ? 1 : 0;
    oval(ctx, x, y, 4, 2, P.black);
    oval(ctx, x, y, 3, 1, P.steel);
    disc(ctx, x + 3, y - 2 + peck * 2, 1, P.slate);
    R(ctx, x + 4, y - 2 + peck * 2, 1, 1, P.orange);
    return;
  }
  const q = lt - flyAt;
  const dir = i % 2 ? 1 : -1;
  const fx = x + dir * q * 90;
  const fy = y - q * 70 - sin(q * 6) * 3;
  const up = floor(q * 14) % 2;
  oval(ctx, fx, fy, 3, 1, P.slate);
  R(ctx, fx - 5, fy - (up ? 3 : -1), 4, 1, P.slate);
  R(ctx, fx + 2, fy - (up ? 3 : -1), 4, 1, P.slate);
}
const SELFIE_COUNT = ['SELFIES TODAY: 3,207', 'SELFIES TODAY: 3,208'];
function shotSelfie(ctx, lt) {
  ctx.drawImage(plaza(), 0, 0);
  for (let i = 0; i < 3; i++) pigeon(ctx, [114, 132, 300][i], [174, 178, 170][i], lt, i);
  const gy = 178;
  const x = selfieX(lt);
  // squash & stretch: brake squash, spring back past neutral, crouch, stretch on the dash
  let s = 0;
  if (lt < SKID) s = 0.11 * prog(lt, 0.22, SKID);
  else if (lt < 1.25) s = 0.11 * exp(-7 * (lt - SKID)) * cos(TAU * 2.6 * (lt - SKID));
  else if (lt < DASH) s = 0.14 * smooth(prog(lt, 1.25, DASH));
  let sx = 1 + s * 0.9;
  let sy = 1 - s;
  if (lt >= DASH) {
    const q = smooth(prog(lt, DASH, DASH + 0.1));
    sx = 1 + 0.26 * q;
    sy = 1 - 0.1 * q;
  }
  // feet: running in, planted skid, standing, sprinting off
  if (lt < 0.22) runCycle(TOUR, lt * TAU * 2.6, 1 - lt / 0.22);
  else if (lt < DASH) {
    stand(TOUR);
    TOUR.lf[0] = lt < SKID ? -2 : 0;
    TOUR.rf[0] = lt < SKID ? 2 : 0;
    TOUR.bob = 0;
  } else runCycle(TOUR, (lt - DASH) * TAU * 3.6, 1);
  // the selfie arm: brace, raise with overshoot, hold, drop into the sprint
  if (lt < 0.55) armMix(TOUR.armR, P_DOWN, P_DOWN, 0);
  else if (lt < 1.25) armMix(TOUR.armR, P_DOWN, P_SELFIE, easeOutBack(prog(lt, 0.55, 0.85), 2));
  else if (lt < DASH) armMix(TOUR.armR, P_SELFIE, P_DOWN, smooth(prog(lt, 1.25, 1.45)));
  armMix(TOUR.armL, P_HANDLE, P_HANDLE, 0);
  const posing = lt > 0.6 && lt < 1.25;
  TOUR.eyes = posing ? 'happy' : 'wide';
  TOUR.mouth = posing ? 'grin' : lt > 1.25 ? 'flat' : 'O';
  TOUR.look = 1;
  TOUR.sweat = lt;
  // skid dust
  for (let i = 0; i < 5; i++) {
    const t0 = 0.18 + i * 0.07;
    puff(ctx, selfieX(t0) - 4 + (i % 2) * 8, gy - 2, (lt - t0) / 0.45);
  }
  for (let i = 0; i < 4; i++) puff(ctx, 140 + i * 7, gy - 2 - (i % 2) * 3, (lt - DASH - i * 0.03) / 0.6);
  // suitcase rolls in late, bumps the heels, then gets yanked away
  const cx = selfieX(lt - 0.12) - 44 + wobble(lt, SKID + 0.12, 5, 3, 6);
  const lift = lt > DASH + 0.1 ? max(0, sin((lt - DASH) * 22)) * 4 : 0;
  shadow(ctx, cx, gy - 1, 12);
  suitcase(ctx, cx, gy, lift);
  shadow(ctx, x, gy - 1, 13);
  const me = squashed(ctx, x, gy, sx, sy, TOUR);
  handle(ctx, me.handL, cx, gy - 25 - lift);
  if (lt < DASH) neckCamera(ctx, round(x), me.top);
  // phone + flash + CLICK
  if (lt > 0.55 && lt < 1.45) {
    const [hx, hy] = me.handR;
    R(ctx, hx - 3, hy - 9, 7, 10, P.black);
    R(ctx, hx - 2, hy - 8, 5, 8, P.slate);
    R(ctx, hx, hy - 7, 1, 1, P.cyan);
    const f = lt - 1.0;
    if (f > 0 && f < 0.16) {
      disc(ctx, hx, hy - 5, round(4 + f * 40), A(P.white, 0.75 * (1 - f / 0.16)));
      sparkle(ctx, hx, hy - 5, 3, P.white);
    }
    if (f > 0 && f < 0.6) {
      ctx.globalAlpha = 1 - smooth(prog(f, 0.35, 0.6));
      bigText(ctx, 'CLICK!', hx + 8, hy - 18 - round(easeOut(f / 0.6) * 8), { scale: 1, color: P.white, outline: P.black });
      ctx.globalAlpha = 1;
    }
  }
  // polaroid flies to the counter
  const q = prog(lt, 1.05, 1.45);
  if (q > 0 && q < 1) {
    const px = lerp(x + 20, 330, io(q));
    const py = lerp(122, 34, io(q)) - sin(q * PI) * 18;
    R(ctx, px - 6, py - 7, 13, 15, P.black);
    R(ctx, px - 5, py - 6, 11, 13, P.white);
    R(ctx, px - 4, py - 5, 9, 8, P.cyan);
    R(ctx, px - 2, py - 3, 5, 6, P.cream);
  }
  if (lt >= DASH) speedLines(ctx, lt, 110, 5, 0.8);
  // counter
  const done = lt > 1.45 ? 1 : 0;
  const cnt = SELFIE_COUNT[done];
  const tw = measureText(cnt) + 12;
  const bump = done ? round(wobble(lt, 1.45, 3, 3, 7)) : 0;
  const ix = round(lerp(W + 4, W - 12 - tw, spring(lt - 0.25, 1.5, 5)));
  panel(ctx, ix, 26 - bump, tw, 15, P.white, P.black, 2);
  text(ctx, cnt, ix + 6, 30 - bump, { color: done ? P.red : P.navy });
}

// --- 3. exhausted close-up; the phone's spinner zooms into the hotel ------------------
const cuBg = () => cached('gb-cu-bg', W, H, (c) => {
  bands(c, 0, 0, W, H, [P.blue, P.cyan, P.cyan, P.cream]);
  c.globalAlpha = 0.5;
  c.drawImage(farCity(), 10, 120);
  c.drawImage(farCity(), 250, 132);
  c.globalAlpha = 1;
  disc(c, 330, 40, 13, A(P.white, 0.5));
  disc(c, 330, 40, 10, P.cream);
});
const CU = { pal: GUEST, hair: 'short', eyes: 'sleepy', mouth: 'wavy', brows: undefined, look: 0, sweat: 0, iris: P.navy };
function sunhatCU(ctx, cx, cy) {
  oval(ctx, cx, cy - 40, 72, 12, P.black);
  oval(ctx, cx, cy - 41, 70, 10, P.cream);
  R(ctx, cx - 50, cy - 37, 100, 2, A(P.tan, 0.6));
  rrect(ctx, cx - 37, cy - 76, 74, 38, P.black, 3);
  rrect(ctx, cx - 35, cy - 74, 70, 35, P.cream, 3);
  R(ctx, cx - 35, cy - 52, 70, 7, P.red);
  R(ctx, cx - 35, cy - 46, 70, 1, P.darkRed);
  R(ctx, cx - 28, cy - 70, 12, 3, P.white);
}
const PHONE_X = 76;
const phoneY = (lt) => round(lerp(232, 118, easeOutBack(prog(lt, 0.5, 0.82), 1.6)));
function phone(ctx, lt, dt) {
  const py = phoneY(lt);
  const x = PHONE_X;
  rrect(ctx, x - 26, py, 52, 86, P.black, 3);
  rrect(ctx, x - 24, py + 2, 48, 82, P.slate, 3);
  // the hotel's app: its screen IS the facade medallion, for the match cut
  R(ctx, x - 21, py + 8, 42, 64, P.purple);
  R(ctx, x - 21, py + 8, 42, 2, P.magenta);
  disc(ctx, x, py + 28, 16, P.black);
  disc(ctx, x, py + 28, 15, P.yellow);
  disc(ctx, x, py + 28, 13, P.orange);
  disc(ctx, x, py + 28, 12, P.ink);
  spinner(ctx, x, py + 28, 9, spinPhase(dt), 2, P.yellow, P.orange, P.purple);
  text(ctx, 'GRAND', x, py + 49, { color: P.cream, align: 'center' });
  text(ctx, 'BUFFER', x, py + 59, { color: P.cream, align: 'center' });
  R(ctx, x - 6, py + 4, 12, 1, P.black);
  // hand
  disc(ctx, x - 22, py + 70, 9, P.black);
  disc(ctx, x - 22, py + 70, 8, P.skin);
  R(ctx, x - 30, py + 72, 16, 20, P.black);
  R(ctx, x - 29, py + 72, 14, 20, P.skin);
  R(ctx, x + 20, py + 40, 9, 6, P.black);
  R(ctx, x + 21, py + 41, 7, 4, P.skin);
  R(ctx, x + 20, py + 50, 9, 6, P.black);
  R(ctx, x + 21, py + 51, 7, 4, P.skin);
}
function tiredScene(ctx, lt) {
  ctx.drawImage(cuBg(), 0, 0);
  const wake = lt > 0.8;
  const cy = 122 + round(min(lt, 0.75) * 6) - (wake ? round(spring(lt - 0.8, 2, 6) * 7) : 0) + round(sin(lt * 4) * 0.6);
  CU.eyes = lt < 0.74 ? 'sleepy' : lt < 0.8 ? 'closed' : 'wide';
  CU.brows = wake ? 'up' : undefined;
  CU.mouth = wake ? 'O' : 'wavy';
  CU.look = wake ? -1 : 0;
  CU.sweat = lt;
  faceCU(ctx, 200, cy, 44, CU);
  sunhatCU(ctx, 200, cy);
  // activity counter
  const n = lt > 0.45 ? 1 : 0;
  const by = round(wobble(lt, 0.45, 2, 3, 7));
  panel(ctx, 264, 158, 108, 32, P.black, P.red, 2);
  text(ctx, n ? 'ACTIVITY 49' : 'ACTIVITY 48', 318, 163 - by, { color: P.white, align: 'center' });
  text(ctx, 'OF 112', 318, 175, { color: P.red, align: 'center' });
  if (lt > 0.5) phone(ctx, lt, T_TIRED + lt);
}
const Z_IN = 1.0;
function shotTired(ctx, lt) {
  if (lt < Z_IN) {
    tiredScene(ctx, lt);
    return;
  }
  const b = buf('zoom');
  tiredScene(b.c, lt);
  const q = prog(lt, Z_IN, T_HOTEL - T_TIRED);
  const z = 1 + 3 * ein(q);
  const ax = PHONE_X;
  const ay = phoneY(lt) + 28;
  zoomDraw(ctx, b.cv, ax, ay, lerp(ax, 192, io(q)), lerp(ay, 108, io(q)), z);
}

// --- 4. the hotel at dusk (match cut on the spinner, pull back) -----------------
const duskSky = () => cached('gb-dusk', W, H, (c) => {
  bands(c, 0, 0, W, 180, [P.ink, P.purple, P.magenta, P.pink, P.orange]);
  const rand = (i) => ((i * 7919) % 997) / 997;
  for (let i = 0; i < 40; i++) R(c, round(rand(i + 3) * W), round(rand(i + 50) * 60), 1, 1, i % 5 ? P.silver : P.white);
});
const MED_X = 192;
const MED_Y = 90;
const hotelArt = () => cached('gb-hotel', W, H, (c) => {
  // drive
  R(c, 0, 196, W, 20, P.ink);
  R(c, 0, 196, W, 1, P.slate);
  poly(c, [[172, 196], [212, 196], [232, 216], [152, 216]], P.darkRed);
  poly(c, [[176, 196], [208, 196], [224, 216], [160, 216]], P.red);
  // towers + block
  for (const tx of [96, 270]) {
    R(c, tx, 52, 18, 146, P.black);
    R(c, tx + 1, 53, 16, 144, P.purple);
    R(c, tx + 1, 53, 16, 3, P.magenta);
    R(c, tx + 3, 46, 12, 7, P.black);
    R(c, tx + 4, 47, 10, 6, P.yellow);
    for (let y = 64; y < 190; y += 14) R(c, tx + 5, y, 8, 8, P.ink);
  }
  R(c, 112, 64, 160, 134, P.black);
  R(c, 114, 66, 156, 132, P.purple);
  R(c, 114, 66, 156, 4, P.magenta);
  R(c, 114, 70, 156, 1, P.maroon);
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 9; col++) {
      const wx = 120 + col * 16;
      const wy = 76 + row * 16;
      if (row < 2 && wx > 160 && wx < 216) continue;
      if (row === 4 && wx > 150 && wx < 228) continue;
      const lit = (row * 5 + col * 3) % 7 > 2;
      R(c, wx, wy, 10, 11, P.black);
      R(c, wx + 1, wy + 1, 8, 9, lit ? P.yellow : P.navy);
      if (lit) R(c, wx + 1, wy + 1, 8, 2, P.cream);
      else R(c, wx + 2, wy + 2, 2, 1, P.blue);
    }
  }
  // medallion base (the spinner is drawn live)
  disc(c, MED_X, MED_Y, 19, P.black);
  disc(c, MED_X, MED_Y, 18, P.yellow);
  disc(c, MED_X, MED_Y, 16, P.orange);
  disc(c, MED_X, MED_Y, 15, P.ink);
  // entrance
  poly(c, [[150, 148], [234, 148], [228, 158], [156, 158]], P.black);
  poly(c, [[152, 149], [232, 149], [227, 156], [157, 156]], P.red);
  R(c, 157, 156, 70, 2, P.darkRed);
  R(c, 168, 160, 48, 38, P.black);
  R(c, 170, 162, 44, 36, P.orange);
  R(c, 175, 166, 34, 32, P.yellow);
  R(c, 191, 166, 2, 32, P.orange);
  for (const x of [158, 220]) {
    R(c, x, 158, 7, 40, P.black);
    R(c, x + 1, 158, 5, 40, P.cream);
    R(c, x + 4, 158, 1, 40, P.tan);
  }
  poly(c, [[170, 198], [214, 198], [236, 216], [148, 216]], A(P.yellow, 0.22));
  // sign
  R(c, 118, 58, 4, 8, P.black);
  R(c, 262, 58, 4, 8, P.black);
  R(c, 84, 20, 216, 40, P.black);
  R(c, 86, 22, 212, 36, P.ink);
  R(c, 88, 24, 208, 1, P.magenta);
  R(c, 88, 55, 208, 1, P.magenta);
  for (const [sx, sy] of [[88, 24], [292, 24], [88, 52], [292, 52]]) R(c, sx, sy, 4, 4, P.yellow);
});
function searchlights(ctx, lt) {
  for (let k = 0; k < 2; k++) {
    const bx = k ? 250 : 134;
    const a = sin(lt * 0.9 + k * 2.1) * 0.42 + (k ? 0.12 : -0.12);
    const tx = bx + Math.tan(a) * 120;
    BEAM[0][0] = bx - 3;
    BEAM[0][1] = 66;
    BEAM[1][0] = bx + 3;
    BEAM[1][1] = 66;
    BEAM[2][0] = tx + 26;
    BEAM[2][1] = -10;
    BEAM[3][0] = tx - 26;
    BEAM[3][1] = -10;
    poly(ctx, BEAM, A(P.cream, 0.1));
  }
}
const BEAM = [[0, 0], [0, 0], [0, 0], [0, 0]];
function frond(ctx, x, y, a, len, sd) {
  const mx = x + cos(a) * len * 0.55;
  const my = y + sin(a) * len * 0.45;
  const ex = x + cos(a + sd * 0.25) * len;
  const ey = y + sin(a + sd * 0.25) * len * 0.6 + len * 0.22;
  seg(ctx, x, y, mx, my, 3, P.darkGreen, P.black);
  seg(ctx, mx, my, ex, ey, 3, P.darkGreen, P.black);
  R(ctx, round(mx) - 1, round(my) - 2, 2, 1, P.green);
}
function palm(ctx, px, sd, lt) {
  seg(ctx, px, 216, px + sd * 6, 170, 5, P.brown, P.black);
  seg(ctx, px + sd * 6, 170, px + sd * 3, 118, 5, P.brown, P.black);
  for (let y = 124; y < 214; y += 9) R(ctx, px + sd * 4 - 2, y, 4, 1, P.tanShade);
  const cx = px + sd * 3;
  for (let i = 0; i < 6; i++) {
    const a = -PI / 2 + (i - 2.5) * 0.62 + sin(lt * 1.3 + i) * 0.04;
    frond(ctx, cx, 118, a, 36, a < -PI / 2 ? -1 : 1);
  }
  disc(ctx, cx, 120, 4, P.black);
  disc(ctx, cx, 120, 3, P.brown);
}
function hotelScene(ctx, lt) {
  ctx.drawImage(duskSky(), 0, 0);
  searchlights(ctx, lt);
  ctx.drawImage(hotelArt(), 0, 0);
  // neon letters come on one by one, then stay lit
  const mk = MARK();
  const x0 = round(192 - mk.w / 2) - mk.ox;
  const y0 = 30 - mk.oy;
  ctx.drawImage(DIM_MARK(), x0, y0);
  const n = mk.letters.length;
  for (let i = 0; i < n; i++) {
    const l = mk.letters[i];
    if (l.ch === ' ') continue;
    const on = lt - (0.62 + i * 0.05);
    if (on < 0 || (on > 0.04 && on < 0.08)) continue;
    const sx = l.x + (i === 0 ? 0 : mk.ox - 1);
    const sw = l.w + (i === 0 ? mk.ox : 2) + (i === n - 1 ? mk.ox + 8 : 0);
    ctx.drawImage(mk.cv, sx, 0, sw, mk.cv.height, x0 + sx, y0, sw, mk.cv.height);
  }
  glint(ctx, mk.cv, x0, y0, prog(lt, 1.35, 1.95), { width: 6 });
  spinner(ctx, MED_X, MED_Y, 11, spinPhase(T_HOTEL + lt), 2, P.yellow, P.orange, P.purple);
  palm(ctx, 34, 1, lt);
  palm(ctx, 350, -1, lt);
}
function shotHotel(ctx, lt) {
  const q = prog(lt, 0, 1.15);
  if (q >= 1) {
    hotelScene(ctx, lt);
    return;
  }
  const b = buf('zoom');
  hotelScene(b.c, lt);
  const e = easeOut(q);
  zoomDraw(ctx, b.cv, MED_X, MED_Y, MED_X, lerp(108, MED_Y, e), 1 + 3 * (1 - e) * (1 - e * 0.33));
}

// --- 5. the loading screen IS the holiday ----------------------------------------
const SUN_X = 192;
const SUN_Y = 60;
const lounge = () => cached('gb-lounge', W, H + 8, (c) => {
  R(c, 0, 0, W, 150, P.ink);
  for (let x = 0; x < W; x += 24) R(c, x, 12, 1, 138, P.black);
  R(c, 0, 0, W, 10, P.black);
  R(c, 0, 10, W, 1, P.yellow);
  for (const x of [26, 350]) {
    R(c, x, 11, 8, 139, P.black);
    R(c, x + 1, 11, 6, 139, P.purple);
    R(c, x + 1, 11, 1, 139, P.magenta);
    R(c, x - 2, 11, 12, 4, P.yellow);
  }
  // the screen: a sunset made of loading UI
  R(c, 66, 16, 252, 116, P.black);
  R(c, 68, 18, 248, 112, P.yellow);
  R(c, 68, 127, 248, 3, P.orange);
  R(c, 71, 21, 242, 104, P.black);
  bands(c, 72, 22, 240, 102, [P.purple, P.magenta, P.pink, P.orange]);
  glow(c, SUN_X, SUN_Y, 44, P.yellow, 0.1, 4);
  for (let i = 0; i < 7; i++) {
    const w = 60 - i * 7;
    R(c, SUN_X - w / 2 + (i % 2) * 6, 82 + i * 3, w, 1, A(P.yellow, 0.5));
  }
  R(c, 72, 80, 240, 1, A(P.cream, 0.4));
  // curtains
  for (const [x, sd] of [[46, 1], [314, -1]]) {
    R(c, x, 12, 24, 130, P.black);
    R(c, x + 1, 12, 22, 130, P.maroon);
    for (let i = 0; i < 4; i++) R(c, x + 3 + i * 5, 14, 1, 126, P.brown);
    R(c, x + (sd > 0 ? 18 : 1), 12, 4, 130, P.darkRed);
  }
  // glossy floor with the screen's reflection
  R(c, 0, 150, W, H + 8 - 150, P.black);
  R(c, 0, 150, W, 1, P.slate);
  R(c, 72, 152, 240, 30, A(P.magenta, 0.18));
  for (let y = 154; y < 184; y += 3) R(c, 72, y, 240, 1, A(P.orange, 0.12));
  // potted palms
  for (const px of [12, 372]) {
    rrect(c, px - 10, 128, 20, 22, P.black, 2);
    rrect(c, px - 9, 129, 18, 20, P.rust, 2);
    for (let i = 0; i < 5; i++) {
      const a = -PI / 2 + (i - 2) * 0.5;
      seg(c, px, 128, round(px + cos(a) * 18), round(128 + sin(a) * 26), 3, P.darkGreen, P.black);
    }
  }
});
// Loungers seen from behind: striped backrest, a head with the screen's warm
// rim light on top, elbows out with the hands behind the head.
function chairBack(ctx, x, y) {
  rrect(ctx, x - 22, y, 44, 70, P.black, 3);
  for (let i = 0; i < 7; i++) R(ctx, x - 21 + i * 6, y + 2, 6, 68, i % 2 ? P.slate : P.navy);
  R(ctx, x - 21, y + 1, 42, 4, P.silver);
  R(ctx, x - 20, y + 1, 40, 1, P.yellow);
  R(ctx, x - 21, y + 5, 42, 1, P.ink);
}
function headBack(ctx, x, y, hair, hat) {
  disc(ctx, x, y, 12, P.black);
  disc(ctx, x, y, 11, hair);
  R(ctx, x - 6, y - 11, 12, 1, P.yellow);
  R(ctx, x - 9, y - 8, 2, 1, P.yellow);
  R(ctx, x + 7, y - 8, 2, 1, P.yellow);
  if (hat) {
    oval(ctx, x, y - 4, 20, 5, P.black);
    oval(ctx, x, y - 5, 19, 4, hat);
    rrect(ctx, x - 10, y - 18, 20, 14, P.black, 2);
    rrect(ctx, x - 9, y - 17, 18, 13, hat, 2);
    R(ctx, x - 9, y - 8, 18, 3, P.red);
    R(ctx, x - 8, y - 17, 16, 1, P.yellow);
    R(ctx, x - 18, y - 6, 36, 1, A(P.yellow, 0.7));
  }
}
function lazyArms(ctx, x, y) {
  for (let sd = -1; sd <= 1; sd += 2) {
    seg(ctx, x + sd * 10, y + 14, x + sd * 22, y - 4, 4, P.skin, P.black);
    seg(ctx, x + sd * 22, y - 4, x + sd * 7, y - 8, 4, P.skin, P.black);
    R(ctx, x + sd * 22 - 1, y - 6, 2, 1, P.yellow);
  }
}
function cocktail(ctx, x, y, dt) {
  poly(ctx, COCK.set(x, y), P.black);
  R(ctx, x - 3, y + 2, 7, 2, P.pink);
  R(ctx, x, y + 6, 1, 4, P.silver);
  R(ctx, x - 2, y + 10, 5, 1, P.silver);
  spinner(ctx, x + 4, y - 2, 2, spinPhase(dt), 0, P.yellow, P.orange, P.maroon);
}
// martini glass outline points, rewritten in place
const COCK = {
  p: [[0, 0], [0, 0], [0, 0]],
  set(x, y) {
    const p = this.p;
    p[0][0] = x - 5;
    p[0][1] = y;
    p[1][0] = x + 6;
    p[1][1] = y;
    p[2][0] = x + 0.5;
    p[2][1] = y + 7;
    return p;
  },
};
function shotLounge(ctx, lt) {
  const dolly = io(lt / 4.1);
  const up = round(dolly * 4);
  ctx.drawImage(lounge(), 0, -up);
  // the setting "sun" is a spinner, the horizon is a progress bar
  const dt = T_LOUNGE + lt;
  spinner(ctx, SUN_X, SUN_Y - up, 17, spinPhase(dt), 3);
  progressBar(ctx, 128, 92 - up, 128, 6, 0.99, lt);
  const cap = lt - 2.55;
  if (cap < 0) text(ctx, 'LOADING YOUR HOLIDAY...', 192, 107 - up, { color: P.cream, align: 'center' });
  else {
    const bw = round(easeOut(prog(cap, 0, 0.18)) * 216);
    rrect(ctx, 192 - bw / 2, 100 - up, bw, 22, P.black, 2);
    rrect(ctx, 192 - bw / 2 + 1, 101 - up, bw - 2, 20, P.ink, 1);
    const s = slam(cap - 0.08, 0.55);
    const art = holidayArt();
    const w = round(art.width * s);
    const h = round(art.height * s);
    ctx.drawImage(art, round(192 - w / 2), round(111 - up - h / 2), w, h);
  }
  // guests, seen from behind, enjoying the view
  const fy = 158 + round(dolly * 10);
  const xs = [96, 192, 288];
  // side tables between the loungers
  for (const tx of [144, 240]) {
    R(ctx, tx - 10, fy + 18, 20, 3, P.black);
    R(ctx, tx - 9, fy + 18, 18, 2, P.yellow);
    R(ctx, tx - 1, fy + 21, 3, 40, P.black);
    cocktail(ctx, tx - 2, fy + 8, dt + tx);
  }
  for (let k = 0; k < 3; k++) {
    const x = xs[k];
    if (k !== 1) lazyArms(ctx, x, fy - 12);
    chairBack(ctx, x, fy);
    headBack(ctx, x, fy - 9, [P.brown, P.black, P.tanShade][k], k === 0 ? P.cream : null);
    if (k === 2) {
      disc(ctx, x, fy - 22, 6, P.black);
      disc(ctx, x, fy - 22, 5, P.tanShade);
      R(ctx, x - 3, fy - 27, 6, 1, P.yellow);
    }
  }
  // the middle guest raises a toast to the screen (elbow leads, glass follows)
  const x = 192;
  const up2 = easeOutBack(prog(lt, 0.9, 1.5), 1.8) * (1 - smooth(prog(lt, 3.1, 3.7)));
  const ex = round(x + 26 + up2 * 2);
  const ey = round(fy + 10 - up2 * 16);
  const hx = round(x + 28 - up2 * 2);
  const hy = round(fy + 14 - up2 * 40);
  seg(ctx, x + 11, fy + 2, ex, ey, 4, P.skin, P.black);
  seg(ctx, ex, ey, hx, hy, 4, P.skin, P.black);
  cocktail(ctx, hx, hy - 10, dt);
  disc(ctx, hx, hy, 3, P.black);
  disc(ctx, hx, hy, 2, P.skin);
  R(ctx, hx - 4, hy - 13, 9, 1, A(P.yellow, 0.8));
  seg(ctx, x - 11, fy + 2, x - 24, fy + 14, 4, P.skin, P.black);
}
const holidayArt = () => cached('gb-holiday', measureText('IS THE HOLIDAY.', 2) + 8, 26, (c) => {
  bigText(c, 'IS THE HOLIDAY.', 4, 9, { scale: 2, color: P.yellow, outline: P.maroon, ow: 1, depth: 2, depthColor: P.black });
});

// --- 6. the famous progress-bar pool ----------------------------------------------
const POOL_W = W + 48;
function seaSky(c, sun) {
  bands(c, 0, 0, W, 98, [P.blue, P.cyan, P.cyan, P.cream]);
  if (sun) {
    glow(c, 330, 34, 30, P.white, 0.12, 3);
    disc(c, 330, 34, 13, P.yellow);
    disc(c, 330, 34, 10, P.cream);
  }
  bands(c, 0, 96, W, 32, [P.blue, P.navy]);
  R(c, 0, 96, W, 1, P.white);
}
const beachTop = () => cached('gb-beach-top', W, 128, (c) => seaSky(c, true));
const poolDeck = () => cached('gb-pool', POOL_W, 100, (c) => {
  // deck starts at local y 0 (= screen y 124)
  R(c, 0, 0, POOL_W, 100, P.cream);
  dither(c, 0, 4, POOL_W, 96, P.yellow, 'dots');
  R(c, 0, 0, POOL_W, 2, P.white);
  for (let x = 0; x < POOL_W; x += 24) R(c, x, 2, 1, 98, A(P.tan, 0.5));
  // the pool is a progress bar at 99%
  const px = 30;
  const pw = 340;
  rrect(c, px - 5, 18, pw + 10, 44, P.black, 3);
  rrect(c, px - 4, 19, pw + 8, 42, P.yellow, 3);
  R(c, px - 4, 52, pw + 8, 8, P.orange);
  R(c, px - 1, 22, pw + 2, 36, P.black);
  bands(c, px, 23, pw, 34, [P.cyan, P.blue]);
  // the last 1%: dry tiles nobody ever reaches
  R(c, px + pw - 8, 23, 8, 34, P.cream);
  for (let y = 23; y < 57; y += 6) R(c, px + pw - 8, y, 8, 1, P.tan);
  R(c, px + pw - 8, 23, 1, 34, P.white);
  text(c, '99%', px + pw + 9, 36, { color: P.maroon });
  text(c, 'LOADING...', px + 8, 68, { color: P.tan });
});
const POOL_X = 30;
const POOL_W2 = 340;
const STRIPE = [[0, 0], [0, 0], [0, 0], [0, 0]];
function floatRing(ctx, x, y, dt, front) {
  if (!front) {
    oval(ctx, x, y, 21, 7, P.black);
    oval(ctx, x, y, 20, 6, P.yellow);
    oval(ctx, x, y - 1, 12, 3, P.orange);
    return;
  }
  clipRect(ctx, x - 24, y, 48, 10);
  oval(ctx, x, y, 21, 7, P.black);
  oval(ctx, x, y, 20, 6, P.yellow);
  R(ctx, x - 20, y + 4, 41, 2, P.orange);
  ctx.restore();
  // the float's dots run like a spinner
  const head = floor(mod(spinPhase(dt), 1) * 8);
  for (let i = 0; i < 5; i++) {
    const a = PI * (0.1 + i * 0.2);
    const k = (head - i + 8) % 8;
    disc(ctx, x + cos(a) * 15, y + sin(a) * 4 + 1, 1, k === 0 ? P.white : k <= 2 ? P.cream : P.rust);
  }
}
function shotPool(ctx, lt) {
  const truck = io(lt / 3.4) * 44;
  ctx.drawImage(beachTop(), 0, 0);
  cloud(ctx, round(70 + lt * 5 - truck * 0.1), 30, 11, P.white, P.silver);
  cloud(ctx, round(230 + lt * 4 - truck * 0.1), 52, 8, P.white, P.silver);
  for (let i = 0; i < 9; i++) R(ctx, round(mod(i * 53 + lt * 14 - truck * 0.4, W + 30) - 15), 102 + (i % 4) * 6, 12, 1, A(P.white, 0.8));
  ctx.drawImage(poolDeck(), -round(truck), 124);
  const ox = -round(truck);
  // the water runs like an indeterminate progress bar: diagonal stripes drift right
  clipRect(ctx, ox + POOL_X, 147, POOL_W2 - 8, 34);
  for (let k = -1; k < 16; k++) {
    const sx = ox + POOL_X + k * 24 + mod(lt * 18, 24);
    STRIPE[0][0] = sx;
    STRIPE[0][1] = 181;
    STRIPE[1][0] = sx + 10;
    STRIPE[1][1] = 181;
    STRIPE[2][0] = sx + 22;
    STRIPE[2][1] = 147;
    STRIPE[3][0] = sx + 12;
    STRIPE[3][1] = 147;
    poly(ctx, STRIPE, A(P.white, 0.14));
  }
  ctx.restore();
  // water shimmer
  for (let i = 0; i < 14; i++) {
    const wx = 34 + mod(i * 61 + lt * 22, 330);
    R(ctx, ox + round(wx), 151 + (i % 4) * 7, 8, 1, A(P.white, 0.7));
  }
  // guest drifting on a spinner-shaped float
  const dt = T_POOL + lt;
  const gx = ox + round(156 + lt * 9);
  const gy = 166 + round(sin(lt * 2.4) * 1.5);
  floatRing(ctx, gx, gy, dt, false);
  armMix(LOUNGER.armL, P_BEHIND, P_BEHIND, 0);
  armMix(LOUNGER.armR, P_BEHIND, P_BEHIND, 0);
  LOUNGER.mouth = 'smile';
  LOUNGER.bob = 0;
  figure(ctx, gx, gy + 14, LOUNGER);
  floatRing(ctx, gx, gy, dt, true);
  R(ctx, gx - 24, gy + 6, 8, 1, A(P.white, 0.8));
  R(ctx, gx + 18, gy + 7, 8, 1, A(P.white, 0.8));
  // deck props
  for (const [dx, c] of [[320, P.red], [372, P.blue]]) {
    const x = ox + dx;
    R(ctx, x - 1, 120, 2, 70, P.black);
    poly(ctx, UMB.set(x, 118, 30, 12), P.black);
    poly(ctx, UMB.set(x, 119, 28, 10), c);
    poly(ctx, UMB.set(x, 119, 10, 10), P.white);
  }
  // kinetic type in the sky
  const k1 = lt - 0.85;
  if (k1 > 0) {
    const p = easeOutBack(prog(k1, 0, 0.3), 2);
    const tx = round(lerp(-80, 108, p));
    panel(ctx, tx - 38, 38, 76, 13, P.navy, P.white, 2);
    text(ctx, 'THE FAMOUS', tx, 41, { color: P.white, align: 'center' });
  }
  const k2 = lt - 1.25;
  if (k2 > 0) {
    const art = barArt();
    const s = slam(k2, 0.6);
    const w = round(art.width * s);
    const h = round(art.height * s);
    ctx.drawImage(art, round(150 - w / 2), round(70 - h / 2), w, h);
  }
}
const UMB = {
  p: [[0, 0], [0, 0], [0, 0]],
  set(x, y, hw, h) {
    const p = this.p;
    p[0][0] = x - hw;
    p[0][1] = y + h;
    p[1][0] = x + hw;
    p[1][1] = y + h;
    p[2][0] = x;
    p[2][1] = y;
    return p;
  },
};
const barArt = () => cached('gb-bar-word', measureText('PROGRESS BAR', 2) + 10, 26, (c) => {
  bigText(c, 'PROGRESS BAR', 5, 9, { scale: 2, color: P.yellow, outline: P.maroon, ow: 1, depth: 2, depthColor: P.black });
});

// --- 7. a helpful tip, served under a cloche ------------------------------------------
const terrace = () => cached('gb-terrace', W, H, (c) => {
  seaSky(c, false);
  cloud(c, 230, 26, 9, P.white, P.silver);
  // balustrade
  R(c, 0, 118, W, 4, P.black);
  R(c, 0, 119, W, 2, P.cream);
  for (let x = 6; x < W; x += 14) {
    R(c, x, 122, 6, 26, P.black);
    R(c, x + 1, 122, 4, 26, P.cream);
    R(c, x + 4, 122, 1, 26, P.tan);
  }
  R(c, 0, 146, W, 4, P.black);
  R(c, 0, 147, W, 2, P.tan);
  // wooden deck
  R(c, 0, 150, W, 66, P.brown);
  for (let y = 154; y < H; y += 8) R(c, 0, y, W, 1, P.tanShade);
  for (let y = 154, k = 0; y < H; y += 8, k++) for (let x = (k % 3) * 40; x < W; x += 120) R(c, x, y + 1, 1, 7, P.tanShade);
  // parasol
  R(c, 101, 52, 2, 100, P.black);
  for (let i = 0; i < 7; i++) {
    const x0 = 46 + i * 16;
    poly(c, [[x0, 70], [x0 + 16, 70], [102, 40]], i % 2 ? P.white : P.red);
  }
  R(c, 46, 70, 112, 2, P.black);
  for (let i = 0; i < 7; i++) {
    disc(c, 54 + i * 16, 72, 8, P.black);
    disc(c, 54 + i * 16, 71, 7, i % 2 ? P.white : P.red);
  }
});
function deckchair(ctx, x, y, front) {
  if (!front) {
    poly(ctx, DCH.set(x, y), P.black);
    for (let i = 0; i < 5; i++) R(ctx, x - 17 + i * 7, y - 34, 7, 34, i % 2 ? P.white : P.blue);
    return;
  }
  R(ctx, x - 24, y - 2, 48, 6, P.black);
  R(ctx, x - 23, y - 1, 46, 4, P.tanShade);
  R(ctx, x - 23, y - 1, 46, 1, P.tan);
  seg(ctx, x - 20, y + 2, x - 26, y + 26, 3, P.tanShade, P.black);
  seg(ctx, x + 20, y + 2, x + 26, y + 26, 3, P.tanShade, P.black);
}
const DCH = {
  p: [[0, 0], [0, 0], [0, 0], [0, 0]],
  set(x, y) {
    const p = this.p;
    p[0][0] = x - 19;
    p[0][1] = y;
    p[1][0] = x + 19;
    p[1][1] = y;
    p[2][0] = x + 18;
    p[2][1] = y - 36;
    p[3][0] = x - 18;
    p[3][1] = y - 36;
    return p;
  },
};
const TIP1 = 'TIP: RELAX.';
const TIP2 = 'TIP: ANOTHER TIP IS COMING.';
const TIP_KEYS = ['gb-tip0', 'gb-tip1'];
const tipCard = (k) => cached(TIP_KEYS[k], 150, 52, (c) => {
  panel(c, 0, 0, 150, 52, P.cream, P.black, 2);
  R(c, 2, 2, 146, 12, P.purple);
  text(c, k ? 'ANOTHER HELPFUL TIP' : 'A HELPFUL TIP', 75, 5, { color: P.yellow, align: 'center' });
  R(c, 2, 49, 146, 1, P.tan);
  const ls = lines(k ? TIP2 : TIP1, 108);
  for (let i = 0; i < ls.length; i++) text(c, ls[i], 36, 20 + i * 10 + (ls.length === 1 ? 5 : 0), { color: P.maroon });
  disc(c, 19, 31, 11, P.ink);
});
function waiterX(lt) {
  return lerp(430, 266, easeOut(prog(lt, 0, 1.15)));
}
function shotTips(ctx, lt) {
  ctx.drawImage(terrace(), 0, 0);
  const dt = T_TIPS + lt;
  // guest in the deckchair, sipping
  const gx = 148;
  const gy = 170;
  deckchair(ctx, gx, gy - 4, false);
  const sip = smooth(prog(lt, 0.35, 0.8)) * (1 - smooth(prog(lt, 1.35, 1.8)));
  armMix(LOUNGER.armL, P_REST, P_REST, 0);
  armMix(LOUNGER.armR, P_REST, P_SIP, sip);
  const nod = lt > 3.4 ? round(wobble(lt, 3.4, 2, 2.2, 3)) : 0;
  LOUNGER.bob = round(sin(lt * 2) * 0.6) + nod;
  LOUNGER.mouth = sip > 0.8 ? 'o' : 'smile';
  const g = figure(ctx, gx, gy + 4, LOUNGER);
  const [hx, hy] = g.handR;
  disc(ctx, hx, hy, 3, P.black);
  disc(ctx, hx, hy, 2, P.skin);
  cocktail(ctx, hx - 1, hy - 10, dt);
  deckchair(ctx, gx, gy - 4, true);
  // waiter walks in, presents the tray, lifts the cloche
  const wx = waiterX(lt);
  const walking = lt < 1.15;
  const amp = 1 - smooth(prog(lt, 0.8, 1.15));
  if (walking) {
    const ph = lt * TAU * 1.8;
    const s = sin(ph);
    SERVER.lf[0] = s * 2 * amp;
    SERVER.lf[1] = max(0, s) * 3 * amp;
    SERVER.rf[0] = -s * 2 * amp;
    SERVER.rf[1] = max(0, -s) * 3 * amp;
    SERVER.bob = -abs(s) * amp;
  } else {
    stand(SERVER);
    SERVER.bob = lt > 3.45 ? round(wobble(lt, 3.45, 2, 1.5, 3)) : 0;
  }
  armMix(SERVER.armL, P_TRAY, P_TRAY, 0);
  const lift = easeOutBack(prog(lt, 1.15, 1.45), 1.6);
  armMix(SERVER.armR, P_TRAY, P_LIFT, lift);
  SERVER.eyes = lt > 1.45 ? 'happy' : 'open';
  SERVER.look = lt < 1.2 ? -1 : 0;
  shadow(ctx, round(wx), 189, 13);
  const w = figure(ctx, wx, 190, SERVER);
  const [tx, ty] = w.handL;
  oval(ctx, tx, ty - 1, 12, 3, P.black);
  oval(ctx, tx, ty - 2, 11, 2, P.silver);
  R(ctx, tx - 9, ty - 3, 18, 1, P.white);
  // cloche follows the right hand
  const [rx, ry] = w.handR;
  const cxl = lift < 0.05 ? tx : rx;
  const cyl = lift < 0.05 ? ty - 3 : ry + 2;
  disc(ctx, cxl, cyl - 4, 9, P.black);
  disc(ctx, cxl, cyl - 4, 8, P.silver);
  R(ctx, cxl - 9, cyl - 3, 19, 4, P.black);
  R(ctx, cxl - 8, cyl - 4, 17, 2, P.silver);
  R(ctx, cxl - 5, cyl - 10, 3, 2, P.white);
  R(ctx, cxl - 1, cyl - 14, 3, 2, P.black);
  // the tip springs out of the tray and becomes a card; later it flips over
  // (it only scales while flying; the landing overshoot is a bounce at full
  // size, so the lettering is never resampled once it can be read)
  const a = lt - 1.3;
  if (a > 0) {
    const g = easeOut(prog(a, 0, 0.28));
    const fq = prog(lt, 2.95, 3.3);
    const flip = fq > 0 && fq < 1 ? abs(cos(fq * PI)) : 1;
    const k = fq >= 0.5 ? 1 : 0;
    const card = tipCard(k);
    const sc = 0.15 + 0.85 * g;
    const cw = round(card.width * sc * flip);
    const ch = round(card.height * sc);
    const ccx = round(lerp(tx, 266, g));
    const ccy = round(lerp(ty - 6, 58, g) - wobble(a, 0.28, 5, 2.4, 6) - wobble(lt, 3.3, 3, 2.4, 6));
    if (cw > 1 && ch > 1) {
      ctx.drawImage(card, ccx - (cw >> 1), ccy - (ch >> 1), cw, ch);
      if (g >= 1 && flip === 1) spinner(ctx, ccx - 56, ccy + 5, 7, spinPhase(dt), 1, P.yellow, P.orange, P.slate);
    }
  }
}

// --- 8. end slate ----------------------------------------------------------------
const slateBg = () => cached('gb-slate', W, H, (c) => {
  bands(c, 0, 0, W, H, [P.ink, P.ink, P.purple, P.maroon]);
  const rand = (i) => ((i * 7919 + 13) % 997) / 997;
  for (let i = 0; i < 44; i++) R(c, round(rand(i) * W), round(18 + rand(i + 99) * 130), 1, 1, i % 4 ? P.silver : P.white);
  // the hotel's silhouette on the horizon, windows still loading
  R(c, 0, 186, W, 30, P.black);
  R(c, 0, 186, W, 1, P.yellow);
  R(c, 140, 150, 104, 36, P.black);
  R(c, 132, 160, 12, 26, P.black);
  R(c, 240, 160, 12, 26, P.black);
  R(c, 160, 142, 64, 8, P.black);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 8; col++) {
      if ((row * 3 + col * 5) % 4 === 0) continue;
      R(c, 148 + col * 12, 156 + row * 9, 4, 4, (row + col) % 3 ? P.yellow : P.orange);
    }
  }
  for (const [px, sd] of [[60, 1], [324, -1], [100, -1], [286, 1]]) {
    seg(c, px, 186, px + sd * 3, 160, 3, P.black, null);
    for (let i = 0; i < 5; i++) {
      const a = -PI / 2 + (i - 2) * 0.62;
      seg(c, px + sd * 3, 160, round(px + sd * 3 + cos(a) * 16), round(160 + sin(a) * 10 + 5), 2, P.black, null);
    }
  }
});
const SLATE_SPIN = [192, 33, 13];
function assembledSpinner(ctx, lt, dt) {
  const [cx, cy, r] = SLATE_SPIN;
  const head = floor(mod(spinPhase(dt), 1) * 8);
  for (let i = 0; i < 8; i++) {
    const t0 = i * 0.045;
    const q = prog(lt, t0, t0 + 0.55);
    if (q <= 0) continue;
    const s = spring(lt - t0, 1.6, 6);
    const rr = r + (1 - s) * 150;
    const a = (i / 8) * TAU - PI / 2 + (1 - c01(s)) * 1.6;
    const x = cx + cos(a) * rr;
    const y = cy + sin(a) * rr;
    const k = lt > 0.75 ? (head - i + 8) % 8 : 3;
    const d = k === 0 ? 4 : 3;
    disc(ctx, x, y, d + 1, P.black);
    disc(ctx, x, y, d, k === 0 ? P.yellow : k <= 2 ? P.orange : P.maroon);
    if (k === 0) R(ctx, round(x) - 1, round(y) - 2, 2, 1, P.white);
  }
}
// slogan words land on the voice-over: "Stay / at / ninety-nine percent... / forever."
const SLOGAN = [['STAY', 1.5], ['AT', 1.8], ['99%.', 2.1], ['FOREVER.', 3.85]];
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
const LEGAL_ETA = [
  'CHECK-OUT TIME: CALCULATING... ESTIMATED TIME REMAINING: 2 MINUTES',
  'CHECK-OUT TIME: CALCULATING... ESTIMATED TIME REMAINING: 3 YEARS',
  'CHECK-OUT TIME: CALCULATING... ESTIMATED TIME REMAINING: 5 SECONDS',
  'CHECK-OUT TIME: CALCULATING... ESTIMATED TIME REMAINING: CALCULATING...',
];
function shotSlate(ctx, lt) {
  const dt = T_SLATE + lt;
  ctx.drawImage(slateBg(), 0, 0);
  for (let i = 0; i < 6; i++) sparkle(ctx, 40 + i * 62, 30 + ((i * 41) % 90), twinkle(lt, i * 0.37), P.cream);
  assembledSpinner(ctx, lt, dt);
  if (lt > 0.45) {
    const p = easeOutBack(prog(lt, 0.45, 0.75), 2);
    text(ctx, 'THE', 192, 54 + round((1 - p) * 6), { color: P.yellow, align: 'center' });
  }
  const mk = MARK();
  const x0 = drawMark(ctx, mk, 192, 65, { reveal: prog(lt, 0.15, 0.85), drop: 26 });
  if (lt > 1.15) glint(ctx, mk.cv, x0 - mk.ox, 65 - mk.oy, mod(lt - 1.15, 3.5) / 0.7, { width: 6 });
  // ornament + sub line
  if (lt > 0.9) {
    const e = easeOut(prog(lt, 0.9, 1.3));
    const half = round(e * 92);
    R(ctx, 192 - 40 - half, 102, half, 1, P.yellow);
    R(ctx, 192 + 40, 102, half, 1, P.yellow);
    text(ctx, 'HOTEL & SPA', 192, 99, { color: P.cream, align: 'center' });
  }
  // the bar loads... and stays at 99%
  if (lt > 1.0) {
    const p = 0.99 * easeOut(prog(lt, 1.0, 1.8));
    progressBar(ctx, 132, 115, 120, 5, p, lt);
    text(ctx, PCT[floor(p * 100)], 260, 114, { color: P.yellow });
  }
  // slogan ribbon, word by word on the VO
  if (lt > 1.35) {
    const open = easeOut(prog(lt, 1.35, 1.6));
    const fw = SLOGAN_X.total + 24;
    const w = round(fw * open);
    const x = round(192 - w / 2);
    const y = 130;
    R(ctx, x - 7, y + 4, 9, 20, P.darkRed);
    R(ctx, x + w - 2, y + 4, 9, 20, P.darkRed);
    rrect(ctx, x, y, w, 24, P.black, 2);
    rrect(ctx, x + 1, y + 1, w - 2, 22, P.yellow, 1);
    R(ctx, x + 1, y + 20, w - 2, 3, P.orange);
    const left = round(192 - SLOGAN_X.total / 2);
    for (let i = 0; i < SLOGAN.length; i++) {
      const [word, at] = SLOGAN[i];
      const s = slam(lt - at, i === 2 || i === 3 ? 0.8 : 0.45);
      if (!s) continue;
      const art = sloganArt(i, word);
      const ww = round(art.width * s);
      const hh = round(art.height * s);
      const cx = left + SLOGAN_X[i] + (art.width - 4) / 2;
      ctx.drawImage(art, round(cx - ww / 2), round(y + 12 - hh / 2), ww, hh);
    }
    if (lt > 3.85 && lt < 4.6) for (let i = 0; i < 4; i++) sparkle(ctx, 300 + i * 9, 126 + (i % 2) * 22, twinkle(lt, i * 0.2), P.white);
  }
  if (lt > 2.5) {
    const p = easeOutBack(prog(lt, 2.5, 2.8), 2.4);
    const s = 'GRANDBUFFER.WAIT';
    const w = measureText(s) + 14;
    const y = 164 + round((1 - p) * 10);
    panel(ctx, round(192 - w / 2), y, w, 13, P.purple, P.yellow, 2);
    text(ctx, s, 192, y + 3, { color: P.cream, align: 'center' });
  }
  if (lt > 2.9) {
    R(ctx, 0, H - 12, W, 12, P.black);
    const eta = LEGAL_ETA[floor(mod(lt * 1.3, LEGAL_ETA.length))];
    micro(ctx, eta, 192, H - 8, { color: P.fog, align: 'center' });
  }
}
const SLOGAN_ART = [];
function sloganArt(i, word) {
  if (!SLOGAN_ART[i]) {
    SLOGAN_ART[i] = cached(`gb-slogan-${i}`, measureText(word, 2) + 4, 20, (c) => {
      text(c, word, 3, 9, { color: P.maroon, scale: 2, shadow: P.orange });
    });
  }
  return SLOGAN_ART[i];
}

const SHOTS = [
  { at: T_RUN, draw: shotRun },
  { at: T_SELFIE, draw: shotSelfie, tr: 'whip', d: 0.3, dir: 1 },
  { at: T_TIRED, draw: shotTired },
  { at: T_HOTEL, draw: shotHotel },
  { at: T_LOUNGE, draw: shotLounge, tr: 'bar', d: 0.5 },
  { at: T_POOL, draw: shotPool, tr: 'whip', d: 0.34, dir: 1 },
  { at: T_TIPS, draw: shotTips },
  { at: T_SLATE, draw: shotSlate, tr: 'bar', d: 0.5 },
];

export default {
  id: 'grand-buffer',
  brand: 'THE GRAND BUFFER',
  duration: DURATION,
  voice: { gender: 'female', lang: 'en-US', pitch: 1.05, rate: 1.0 },
  script: [
    { at: 0.4, text: 'Tired of holidays where you have to... do things?' },
    { at: 5.9, text: 'Welcome to The Grand Buffer.' },
    { at: 8.4, text: 'Where the loading screen... is the holiday.' },
    { at: 12.6, text: 'Lounge on our famous progress bar.' },
    { at: 15.4, text: 'Enjoy a helpful tip. Then... another tip.' },
    { at: 19.5, text: 'The Grand Buffer. Stay at ninety-nine percent... forever.' },
  ],
  // 100 bpm (0.6 s a beat), 41 beats = the whole ad: a breathless double-time
  // run for the sightseeing (beats 0-8), a deflating sigh for the close-up
  // (8-10), a dreamy rise for the hotel reveal (10-14), a lazy bossa under the
  // lounge, pool and tips (14-32), and the sting from the end slate (32 =
  // 19.2 s) resolving on C.
  tune: {
    bpm: 100,
    wave: 'triangle',
    notes: tune(
      rep('C5:0.25 E5:0.25 G5:0.25 E5:0.25 D5:0.25 F5:0.25 A5:0.25 F5:0.25', 3),
      'E5:0.25 G5:0.25 C6:0.25 G5:0.25 B5:0.5 G5:0.5',
      'C6:0.5 A5:0.5 F5:0.5 D5:0.5',
      'E5:1.5 G5:0.5 B5:2',
      'E5:1 D5:0.5 E5:1.5 C5:1 A4:2 R:2',
      'D5:1 C5:0.5 D5:1.5 B4:1 G4:2 R:2',
      'A4:1 B4:1',
      'G5:1 E5:1 C5:1 D5:1 E5:1 D5:1 C5:3',
    ),
    bass: tune(
      rep('C3:0.5 G2:0.5', 6), 'C3:0.5 G2:0.5 C3:1',
      'F2:2',
      'A2:2 E2:2',
      'C3:1.5 G2:0.5 C3:2 A2:1.5 E2:0.5 A2:2',
      'D3:1.5 A2:0.5 D3:2 G2:1.5 D2:0.5 G2:2',
      'F2:1 G2:1',
      'F2:2 G2:2 C3:5',
    ),
    bassWave: 'sine',
    drums: tune(
      rep('K:0.5 H:0.25 H:0.25 S:0.5 H:0.5', 3), 'K:0.5 S:0.5 S:0.5 S:0.5',
      'K:2',
      rep('H:1', 4),
      rep('K:1 H:0.5 S:0.5 H:0.5 K:0.5 S:1', 4), 'K:1 S:1',
      'K:1 H:1 S:1 H:1 K:1 R:4',
    ),
  },
  draw(ctx, t, dt) {
    run(ctx, dt, null, SHOTS);
  },
};
