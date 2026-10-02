// CLOUDBRELLA — a product keynote, delivered completely straight, for an
// umbrella that protects you from the cloud (the computing kind). Charcoal
// stage, one spotlight, a turntable, thin type, a calm presenter's voice and
// absurd specifications. The product is "Cloud White"; nothing else has colour.
//
// Shot list (25.3 s, 96 bpm, a bar is 2.5 s; the resolution lands at 20.0 s):
//  1  0.0 STAGE    darkness; a spotlight comes on over an empty turntable.  VO "For years, the cloud has followed you everywhere."
//  2  4.4 PROBLEM  keynote illustration: a commuter walks under a little
//                  cloud that drips notifications on him.                  VO "Updates. Pop-ups. Terms and conditions."
//  3  8.6 REVEAL   the furled umbrella descends into the light and turns.  VO "So we built something simpler."
//  4 12.0 CANOPY   macro on the pleats, spec callout.                       VO "A zero-sync canopy."
//  5 14.0 HANDLE   macro on the handle, spec callout.                       VO "No Bluetooth. Anywhere."
//  6 16.2 OPEN     it opens in slow motion; notifications slide off it;
//                  keynote statistics.                                      VO "It blocks ninety-nine percent of notifications."
//  7 20.6 SLATE    product, wordmark in thin type, tagline, small print.    VO "Cloudbrella. Stay offline."
import {
  P, W, H, R, A, oval, disc, ring, line, stroke, cached, lazy, play, key, tween, prog, smooth, lerp,
  type, trackIn, fadeUp, rule, smallPrint, gradient, vignette, beam, contact, glintStar, lathe, turntable, sheen,
  ovalRing, motes, hash01, warmUp, tune,
} from './kit.js';

const { round, sin, cos, PI, max, min, abs, sqrt } = Math;

const FABRIC = [P.black, P.ink, P.slate, P.steel, P.fog, P.silver, P.white]; // Cloud White
const GRAPHITE = [P.black, P.ink, P.slate, P.steel, P.fog];
const METAL = [P.ink, P.steel, P.fog, P.silver, P.white];

// --- the stage -------------------------------------------------------------------

const TT_Y = 170; // turntable top
const stageFloor = lazy(() => gradient('cb-floor', W, H, { cx: 192, cy: TT_Y, rx: 230, ry: 70, ramp: [P.black, P.ink, P.slate], gamma: 1.7, seam: 0.4 }));
const stageBack = lazy(() => gradient('cb-back', W, H, { cx: 192, cy: 60, rx: 200, ry: 160, ramp: [P.black, P.ink], gamma: 2.2, seam: 0.4 }));

/** The keynote stage at spotlight level `light` (0..1), turntable turned to `turn`. */
function stage(ctx, lt, light, turn, push = 1) {
  R(ctx, 0, 0, W, H, P.black);
  if (light > 0) {
    ctx.save();
    ctx.globalAlpha = light;
    ctx.drawImage(stageBack(), 0, 0);
    ctx.drawImage(stageFloor(), 0, 0);
    ctx.restore();
    beam(ctx, 192, -6, 192, TT_Y, 34, 150, { color: P.silver, alpha: 0.035 * light });
    motes(ctx, lt, { x: 120, y: 0, w: 144, h: TT_Y, n: 34, seed: 5, drift: 4, fall: 1, color: P.silver, alpha: 0.6 * light, inside: inCone });
  }
  turntable(ctx, 192, TT_Y, round(74 * push), round(11 * push), turn, { top: light > 0.5 ? P.ink : P.black, side: P.black, edge: light > 0.3 ? P.slate : P.ink, hi: light > 0.6 ? P.fog : P.slate, h: 5, mark: P.slate });
  if (light > 0) oval(ctx, 186, TT_Y - 1, 46, 6, A(P.steel, 0.22 * light));
}
function inCone(x, y) {
  const s = (y + 6) / (TT_Y + 6);
  return abs(x - 192) < (17 + 58 * s) * 0.85;
}

// --- the product ------------------------------------------------------------------
// Drawn per pixel by kit.lathe: the ferrule, the canopy (furled or open, with
// its panels as a texture so they turn), the graphite shaft and a tube-shaded
// J handle. It hovers, as keynote products do.

const furledTex = lazy(() =>
  cached('cb-furled', 256, 64, (c) => {
    // twelve folds of slightly different widths: a lit edge, then the fold's shadow
    let x = 0;
    for (let i = 0; i < 12; i++) {
      const w = 19 + round(hash01(i, 7) * 6);
      R(c, x, 0, 1, 64, P.white);
      R(c, x + 1, 0, 1, 64, P.fog);
      R(c, x + w - 3, 0, 2, 64, P.slate);
      R(c, x + w - 1, 0, 1, 64, P.ink);
      if (hash01(i, 8) < 0.5) R(c, x + round(w / 2), 8, 1, 46, P.steel); // a soft crease
      x += w;
      if (x > 250) break;
    }
    // the strap round the waist of the canopy, with its snap on the front
    R(c, 0, 36, 256, 6, P.ink);
    R(c, 0, 36, 256, 1, P.slate);
    R(c, 0, 41, 256, 1, P.black);
    disc(c, 128, 38, 2, P.fog);
    R(c, 127, 37, 1, 1, P.white);
  }),
);
const openTex = lazy(() =>
  cached('cb-open', 256, 32, (c) => {
    for (let i = 0; i < 8; i++) {
      const x = i * 32;
      R(c, x, 0, 1, 32, P.silver); // a rib under the fabric
      R(c, x + 1, 4, 1, 28, P.fog);
    }
  }),
);

const CANOPY = new Float32Array(200);
const SHAFT = new Float32Array(200);
const TIP = new Float32Array(20);
const CLAB = { cv: null, top: 0, h: 0, turn: 0 };
const C_STRIPES = [[-0.58, 0.05, P.white, 0.05, 0.95]];
const CANOPY_O = { rows: 0, ramp: FABRIC, ambient: 0.22, label: CLAB, stripes: C_STRIPES, rim: { k: 0.8 }, tilt: 0, seam: 0.55 };
const SHAFT_O = { rows: 0, ramp: GRAPHITE, ambient: 0.2, stripes: [[-0.4, 0.3, P.steel]], rim: { k: 0.7 }, seam: 0.5 };
const TIP_O = { rows: 0, ramp: METAL, ambient: 0.3, rim: { k: 0.6 }, seam: 0.5 };

/** Canopy radius at fraction f (0 = ferrule end, 1 = runner/rim) for opening e. */
function canopyR(f, e, k) {
  const furled = 8 * (f < 0.72 ? 0.25 + 0.75 * smooth(f / 0.72) : 1 - 0.55 * smooth((f - 0.72) / 0.28));
  const open = 64 * Math.pow(sin((f * PI) / 2), 0.7);
  return lerp(furled, open, e) * k;
}

/** Tube-shaded J handle, baked once per size (a few sizes are used). */
function hook(ctx, x, y, k) {
  const kq = round(k * 20) / 20;
  const pad = round(4 * kq) + 2;
  const w = round(18 * kq) + pad * 2;
  const h = round(24 * kq) + pad * 2;
  const art = cached(`cb-hook-${kq}`, w, h, (c) => paintHook(c, w - pad - round(kq * 2), pad, kq));
  ctx.drawImage(art, round(x) - (w - pad - round(kq * 2)), round(y) - pad);
}
function paintHook(ctx, x, y, k) {
  const r = max(2, round(3.2 * k));
  const n = round(22 * max(1, k / 1.4));
  for (let pass = 0; pass < 5; pass++) {
    for (let i = 0; i <= n; i++) {
      const s = i / n;
      let px;
      let py;
      if (s < 0.35) {
        px = x;
        py = y + (s / 0.35) * 12 * k;
      } else {
        const a = ((s - 0.35) / 0.65) * PI * 1.05;
        px = x - 7 * k + cos(a) * 7 * k;
        py = y + 12 * k + sin(a) * 7 * k;
      }
      if (pass === 0) disc(ctx, px + max(1, round(r * 0.12)), py, r, P.fog); // rim from the right
      else if (pass === 1) disc(ctx, px, py, r, P.ink);
      else if (pass === 2) disc(ctx, px - round(r * 0.22), py - round(r * 0.22), max(1, round(r * 0.72)), P.slate);
      else if (pass === 3 && r >= 3) disc(ctx, px - round(r * 0.42), py - round(r * 0.42), max(1, round(r * 0.32)), P.steel);
      else if (pass === 4 && r >= 6) disc(ctx, px - round(r * 0.5), py - round(r * 0.5), max(1, round(r * 0.1)), P.fog);
    }
  }
}

/**
 * The umbrella with its ferrule at (cx, top), at scale k, opened by `open`
 * (0..1), turned by `turn`. Returns the canopy rim y (for falling things).
 */
const GEO = { rimY: 0, R: 0, topC: 0, hc: 0 };
function umbrella(ctx, cx, top, k, open, turn) {
  const e = smooth(open);
  const tipH = round(8 * k);
  const hc = round(lerp(66, 24, e) * k);
  const shaftTop = top + tipH + hc;
  const shaftBot = top + round(112 * k);
  // shaft and hook first: the open canopy hides the top of the shaft
  const sh = shaftBot - shaftTop + round(4 * k);
  for (let j = 0; j < sh; j++) SHAFT[j] = 1.6 * k;
  SHAFT_O.rows = sh;
  lathe(ctx, cx, shaftTop - round(4 * k), SHAFT, SHAFT_O);
  oval(ctx, cx, shaftBot, round(2.4 * k), max(1, round(1 * k)), P.steel); // the collar
  hook(ctx, cx, shaftBot + 1, k);
  // the runner sliding up the shaft as it opens
  oval(ctx, cx, shaftTop + 1, round(2.6 * k), max(1, round(1.2 * k)), P.fog);
  // canopy
  for (let j = 0; j < hc; j++) CANOPY[j] = canopyR(j / max(1, hc - 1), e, k);
  CLAB.cv = open > 0.12 ? openTex() : furledTex();
  CLAB.top = 0;
  CLAB.h = hc;
  CLAB.turn = turn;
  CANOPY_O.rows = hc;
  CANOPY_O.tilt = 0.22 * e;
  lathe(ctx, cx, top + tipH, CANOPY, CANOPY_O);
  // ferrule
  for (let j = 0; j < tipH; j++) TIP[j] = (0.6 + (1.2 * j) / tipH) * k;
  TIP_O.rows = tipH;
  lathe(ctx, cx, top, TIP, TIP_O);
  // rib tips round the rim once it is open (front half only)
  const Rr = CANOPY[hc - 1];
  const rimY = top + tipH + hc - 1;
  if (e > 0.55) {
    for (let i = 0; i < 8; i++) {
      const a = (turn + i / 8) * 2 * PI;
      const fz = cos(a);
      if (fz < -0.1) continue;
      R(ctx, round(cx + sin(a) * Rr), round(rimY + 0.22 * e * Rr * fz), 1, 2, fz > 0.5 ? P.white : P.fog);
    }
  }
  GEO.rimY = rimY;
  GEO.R = Rr;
  GEO.topC = top + tipH;
  GEO.hc = hc;
  return rimY;
}

// --- notification glyphs (flat white line icons, 7x7) -------------------------------

const GLYPHS = ['bell', 'mail', 'badge', 'cookie', 'doc', 'sync'];
function glyph(ctx, kind, x, y, col = P.white) {
  const cv = cached(`cb-g-${kind}-${col}`, 9, 9, (c) => {
    c.fillStyle = col;
    const p = (px, py, w = 1, h = 1) => c.fillRect(px + 1, py + 1, w, h);
    if (kind === 'bell') {
      p(3, 0); p(2, 1, 3); p(1, 2, 1, 3); p(5, 2, 1, 3); p(0, 5, 7); p(3, 6);
    } else if (kind === 'mail') {
      p(0, 1, 7); p(0, 5, 7); p(0, 1, 1, 5); p(6, 1, 1, 5); p(1, 2); p(2, 3); p(3, 4); p(4, 3); p(5, 2);
    } else if (kind === 'badge') {
      p(2, 0, 3); p(1, 1); p(5, 1); p(0, 2, 1, 3); p(6, 2, 1, 3); p(1, 5); p(5, 5); p(2, 6, 3); p(3, 2, 1, 3);
    } else if (kind === 'cookie') {
      p(2, 0, 3); p(1, 1); p(5, 1); p(0, 2, 1, 3); p(6, 2, 1, 3); p(1, 5); p(5, 5); p(2, 6, 3); p(2, 2); p(4, 3); p(2, 4);
    } else if (kind === 'doc') {
      p(0, 0, 5); p(0, 0, 1, 7); p(0, 6, 7); p(6, 2, 1, 5); p(5, 1); p(2, 2, 2); p(2, 4, 3);
    } else {
      p(1, 1, 4); p(0, 2, 1, 2); p(5, 0, 1, 3); p(2, 5, 4); p(6, 3, 1, 2); p(1, 4, 1, 3);
    }
  });
  ctx.drawImage(cv, round(x) - 4, round(y) - 4);
}

// --- 1. STAGE -----------------------------------------------------------------------

function shotStage(ctx, lt) {
  const light = smooth(prog(lt, 0.5, 2.2));
  stage(ctx, lt, light, lt * 0.05, tween(lt, 0, 4.4, 0.94, 1, 'out'));
  vignette(ctx, 0.5);
}

// --- 2. PROBLEM: keynote illustration ------------------------------------------------

const GROUND = 160;
const MAN_X = 150;
// limb lengths: a 7.5-heads-tall adult, head radius 5.5
const S = 1.4;
const THIGH = 15 * S;
const SHIN = 15 * S;
const UPPER = 11 * S;
const FORE = 10 * S;
const LEG_PTS = [[[0, 0], [0, 0], [0, 0]], [[0, 0], [0, 0], [0, 0]]];
const ARM_PTS = [[[0, 0], [0, 0], [0, 0]], [[0, 0], [0, 0], [0, 0]]];
const TORSO = [[0, 0], [0, 0]];
const MAN = { headX: 0, headY: 0 };

/** A flat keynote pictogram of a man walking (side view, facing right), natural cycle. */
function walker(ctx, x, lt, col, shade) {
  const ph = lt * 2 * PI * 0.85;
  let low = -1e9;
  // legs: thigh swings, the knee folds during the swing phase
  for (let L = 0; L < 2; L++) {
    const p = ph + L * PI;
    const th = 0.42 * sin(p);
    const kn = 0.08 + 0.75 * max(0, sin(p - 1.1)) ** 1.5;
    const hip = LEG_PTS[L][0];
    hip[0] = x;
    hip[1] = 0;
    const knee = LEG_PTS[L][1];
    knee[0] = x + sin(th) * THIGH;
    knee[1] = cos(th) * THIGH;
    const ank = LEG_PTS[L][2];
    ank[0] = knee[0] + sin(th - kn) * SHIN;
    ank[1] = knee[1] + cos(th - kn) * SHIN;
    low = max(low, ank[1]);
  }
  // the lowest foot is on the ground: that gives the natural bob
  const hipY = GROUND - 2 - low;
  const lean = 0.06;
  TORSO[0][0] = x;
  TORSO[0][1] = hipY;
  TORSO[1][0] = x + sin(lean) * 19 * S;
  TORSO[1][1] = hipY - 19 * S;
  const shX = TORSO[1][0];
  const shY = TORSO[1][1] + 1;
  for (let L = 0; L < 2; L++) {
    const p = ph + L * PI;
    const sw = -0.38 * sin(p);
    const el = 0.25 + 0.2 * max(0, -sin(p));
    const a = ARM_PTS[L];
    a[0][0] = shX;
    a[0][1] = shY;
    a[1][0] = shX + sin(sw) * UPPER;
    a[1][1] = shY + cos(sw) * UPPER;
    a[2][0] = a[1][0] + sin(sw + el) * FORE;
    a[2][1] = a[1][1] + cos(sw + el) * FORE;
  }
  // far limbs darker, then torso, near limbs
  const far = 1;
  for (const g of LEG_PTS[far]) g[1] += hipY;
  for (const g of LEG_PTS[1 - far]) g[1] += hipY;
  stroke(ctx, ARM_PTS[far], 3, shade, null);
  stroke(ctx, LEG_PTS[far], 4, shade, null);
  R(ctx, LEG_PTS[far][2][0] - 1, LEG_PTS[far][2][1], 7, 2, shade);
  stroke(ctx, TORSO, 7, col, null);
  stroke(ctx, LEG_PTS[1 - far], 4, col, null);
  R(ctx, LEG_PTS[1 - far][2][0] - 1, LEG_PTS[1 - far][2][1], 7, 2, col);
  // neck and head
  const hx = round(TORSO[1][0] + 1);
  const hy = round(TORSO[1][1] - 8);
  R(ctx, hx - 1, hy + 4, 3, 4, col);
  disc(ctx, hx, hy, 5, col);
  // near arm carries a briefcase
  stroke(ctx, ARM_PTS[1 - far], 3, col, null);
  const [bx, by] = ARM_PTS[1 - far][2];
  R(ctx, bx - 6, by + 1, 13, 9, col);
  R(ctx, bx - 2, by - 1, 5, 2, col);
  R(ctx, bx - 6, by + 4, 13, 1, shade);
  MAN.headX = hx;
  MAN.headY = hy;
}

/** A flat keynote cloud: three lobes on a flat base, lit from above. */
function flatCloud(ctx, x, y, col, hi) {
  disc(ctx, x - 13, y + 3, 9, col);
  disc(ctx, x, y - 4, 13, col);
  disc(ctx, x + 14, y + 1, 10, col);
  R(ctx, x - 22, y + 3, 46, 10, col);
  R(ctx, x - 8, y - 16, 12, 1, hi);
  R(ctx, x - 11, y - 15, 3, 1, hi);
  R(ctx, x + 9, y - 8, 8, 1, hi);
}

function shotProblem(ctx, lt) {
  R(ctx, 0, 0, W, H, P.black);
  ctx.drawImage(stageBack(), 0, 0);
  // section header, keynote style
  fadeUp(ctx, '01', 28, 30, lt - 0.2, { face: 'thin', color: P.steel, dur: 0.8 });
  fadeUp(ctx, 'THE PROBLEM', 44, 32, lt - 0.3, { face: 'micro', color: P.fog, track: 2, dur: 0.8 });
  // ground line with ticks that slide past (he walks on the spot)
  R(ctx, 40, GROUND, 304, 1, P.slate);
  for (let i = 0; i < 13; i++) {
    const x = 40 + ((i * 24 - lt * 26) % 304 + 304) % 304;
    R(ctx, x, GROUND + 3, 6, 1, P.ink);
  }
  walker(ctx, MAN_X, lt, P.silver, P.steel);
  // the cloud keeps station over his head, a little behind
  const cx = MAN_X + 2 + sin(lt * 0.9) * 3;
  const cy = 52 + sin(lt * 1.3) * 1.5;
  flatCloud(ctx, cx, cy, P.steel, P.fog);
  // notifications drip from it onto him, one kind per beat of the voice
  for (let i = 0; i < 7; i++) {
    const per = 1.1 + hash01(i, 3) * 0.5;
    const t = (lt + hash01(i, 4) * per) % per;
    const gx = cx - 16 + hash01(i, 5) * 32;
    const gy = cy + 14 + t * 70;
    const stop = MAN.headY - 6;
    if (gy > stop + 10) continue;
    const a = gy > stop ? 1 - (gy - stop) / 10 : min(1, t * 6);
    ctx.save();
    ctx.globalAlpha = a;
    glyph(ctx, GLYPHS[i % GLYPHS.length], gx, gy);
    ctx.restore();
  }
  // the three words, as quiet labels
  const words = ['UPDATES.', 'POP-UPS.', 'TERMS AND CONDITIONS.'];
  for (let i = 0; i < 3; i++) fadeUp(ctx, words[i], 204, 78 + i * 15, lt - (0.45 + i * 0.85), { face: 'thin', color: i === 2 ? P.white : P.fog, track: 1, dur: 0.7 });
  vignette(ctx, 0.4);
}

// --- 3. REVEAL --------------------------------------------------------------------

const FLOAT = [[0, 0], [1.5, -1], [3, 0], [4.5, 1], [6, 0]];
function hover(lt) {
  return round(key(lt % 6, FLOAT));
}
function shotReveal(ctx, lt) {
  stage(ctx, lt, 1, 0.42 + lt * 0.05);
  const d = smooth(prog(lt, 0.2, 2.4));
  const k = tween(lt, 0.8, 3.6, 1, 1.12, 'inOut');
  const top = round(lerp(-150, 34 - (k - 1) * 70, d)) + hover(lt);
  contact(ctx, 192, TT_Y - 1, round(20 * d), 0.35 * d);
  umbrella(ctx, 192, top, k, 0, 0.1 + lt * 0.06);
  trackIn(ctx, 'CLOUDBRELLA', 192, 18, lt - 1.9, { face: 'thin', color: P.white, track: 4, from: 12, dur: 1.6 });
  vignette(ctx, 0.5);
}

// --- 4/5. DETAILS -----------------------------------------------------------------

const macroBg = lazy(() => gradient('cb-macro', W, H, { cx: 150, cy: 100, rx: 260, ry: 170, ramp: [P.black, P.ink, P.slate], gamma: 1.8, seam: 0.4 }));

/** Spec callout: a dot on the product, a hairline that draws out, then the words. */
function callout(ctx, lt, ax, ay, ex, ey, tx, title, sub) {
  const p = smooth(prog(lt, 0, 0.6));
  if (p <= 0) return;
  ring(ctx, ax, ay, 2, A(P.white, p));
  R(ctx, ax, ay, 1, 1, P.white);
  // leader: diagonal to the elbow, then horizontal to the text
  const q1 = min(1, p * 2);
  const q2 = max(0, p * 2 - 1);
  line(ctx, ax, ay, round(lerp(ax, ex, q1)), round(lerp(ay, ey, q1)), A(P.fog, 0.9));
  if (q2 > 0) R(ctx, min(ex, round(lerp(ex, tx, q2))), ey, abs(round(lerp(ex, tx, q2)) - ex), 1, A(P.fog, 0.9));
  const left = tx > ex;
  fadeUp(ctx, title, left ? tx + 6 : tx - 6, ey - 10, lt - 0.55, { face: 'thin', color: P.white, track: 2, align: left ? 'left' : 'right', dur: 0.7 });
  if (sub) fadeUp(ctx, sub, left ? tx + 6 : tx - 6, ey + 4, lt - 0.85, { face: 'micro', color: P.fog, track: 1, align: left ? 'left' : 'right', dur: 0.7 });
}

// Macro of the canopy's edge: lit fabric, seams converging to the (unseen)
// ferrule, stitching, a scalloped hem with a steel cap on every rib tip.
const FW = W + 140; // wider than the frame: the camera slides along the hem
const HEM = 166;
const PANEL = 124;
const fabric = lazy(() =>
  cached('cb-fabric', FW, H, (c) => {
    c.drawImage(gradient('cb-fabric-light', FW, H, { cx: 170, cy: 20, rx: 400, ry: 250, ramp: [P.ink, P.slate, P.steel, P.fog], gamma: 0.95, seam: 0.22 }), 0, 0);
    // a faint weave
    for (let y = 0; y < HEM + 8; y += 2) for (let x = (y >> 1) % 2; x < FW; x += 4) R(c, x, y, 1, 1, A(P.black, 0.06));
    // seams from each rib tip up toward the ferrule far above frame
    const vx = FW / 2;
    const vy = -520;
    for (let t = -1; t <= FW / PANEL + 1; t++) {
      const tx = 40 + t * PANEL;
      for (let y = HEM; y >= 0; y--) {
        const s = (HEM - y) / (HEM - vy);
        const x = round(tx + (vx - tx) * s);
        R(c, x, y, 1, 1, A(P.black, 0.45));
        R(c, x + 1, y, 1, 1, A(P.white, 0.35));
        if (y % 4 < 2) R(c, x - 3, y, 1, 1, A(P.ink, 0.4)); // stitching
        if (y % 4 < 2) R(c, x + 4, y, 1, 1, A(P.ink, 0.4));
      }
    }
    // the scalloped hem: between rib tips the fabric pulls up in an arc
    c.globalCompositeOperation = 'destination-out';
    c.fillStyle = '#000'; // opaque, so the cut is complete
    for (let x = 0; x < FW; x++) {
      const f = (((x - 40) % PANEL) + PANEL) % PANEL / PANEL;
      const y = round(HEM - 9 * sin(f * PI));
      c.fillRect(x, y, 1, H - y);
    }
    c.globalCompositeOperation = 'source-over';
    for (let x = 0; x < FW; x++) {
      const f = (((x - 40) % PANEL) + PANEL) % PANEL / PANEL;
      const y = round(HEM - 9 * sin(f * PI));
      R(c, x, y - 1, 1, 1, P.silver); // the hem's folded edge catches light
      R(c, x, y - 2, 1, 1, A(P.ink, 0.5));
    }
    // steel caps on the rib tips
    for (let t = -1; t <= FW / PANEL + 1; t++) {
      const tx = 40 + t * PANEL;
      oval(c, tx, HEM + 1, 3, 2, P.slate);
      oval(c, tx, HEM, 2, 1, P.fog);
      R(c, tx - 1, HEM - 1, 1, 1, P.white);
    }
  }),
);
function shotCanopy(ctx, lt) {
  R(ctx, 0, 0, W, H, P.black);
  const x = -round(tween(lt, 0, 2.4, 20, 62, 'inOut'));
  const art = fabric();
  ctx.drawImage(art, x, 0);
  sheen(ctx, art, x, 0, prog(lt, 0.2, 2.2), { width: 70, alpha: 0.22, slope: 0.6 });
  vignette(ctx, 0.5);
  callout(ctx, lt - 0.3, 112, 118, 96, 184, 176, 'ZERO-SYNC CANOPY', 'WOVEN FROM NON-NETWORKED FIBRE');
}

function shotHandle(ctx, lt) {
  ctx.drawImage(macroBg(), 0, 0);
  const k = 4.6;
  const x = round(tween(lt, 0, 2.4, 140, 132, 'inOut'));
  const y = 30;
  // the shaft coming down into frame, the steel collar, the hook
  for (let j = 0; j < 60; j++) SHAFT[j] = 1.6 * k;
  SHAFT_O.rows = 60;
  lathe(ctx, x, y - 60, SHAFT, SHAFT_O);
  oval(ctx, x, y, round(2.4 * k), round(1 * k), P.steel);
  oval(ctx, x, y - 1, round(2.1 * k), round(0.7 * k), P.silver);
  hook(ctx, x, y + 2, k);
  glintStar(ctx, x - 6, y + 4, (lt - 0.4) / 1, P.white);
  vignette(ctx, 0.55);
  callout(ctx, lt - 0.2, x + 10, 100, 196, 76, 222, 'NO BLUETOOTH.', 'ANYWHERE. WE CHECKED.');
}

// --- 6. OPEN -----------------------------------------------------------------------

/** Notifications falling onto the open canopy, sliding off its shoulders. */
function slideOff(ctx, lt, cx) {
  const Rr = GEO.R;
  const top = GEO.topC;
  const hc = GEO.hc;
  if (Rr < 30) return;
  for (let i = 0; i < 7; i++) {
    // each one starts from above frame in turn, then keeps falling on its own period
    const start = i * 0.32 + hash01(i, 14) * 0.2;
    if (lt < start) continue;
    const per = 1.6 + hash01(i, 13) * 0.8;
    const t = (lt - start) % per;
    const x0 = cx - Rr * 0.9 + hash01(i, 15) * Rr * 1.8;
    const u = (x0 - cx) / Rr;
    const surf = top + hc * (1 - sqrt(max(0, 1 - u * u))) - 5;
    const yFall = -8 + t * 90;
    let x = x0;
    let y = yFall;
    if (yFall >= surf) {
      // slide outward along the dome, then drop past the rim
      const s = t - (surf + 8) / 90;
      const dir = u < 0 ? -1 : 1;
      x = x0 + dir * (10 * s + 60 * s * s);
      const uu = (x - cx) / Rr;
      if (abs(uu) < 1) y = top + hc * (1 - sqrt(max(0, 1 - uu * uu))) - 5;
      else {
        const sr = s - (Rr - abs(x0 - cx)) / max(1, 10 + 60 * s);
        y = GEO.rimY + 120 * max(0, sr) * max(0, sr) + 2;
      }
    }
    if (y > TT_Y) continue;
    glyph(ctx, GLYPHS[i % GLYPHS.length], x, y, P.silver);
  }
}

function shotOpen(ctx, lt) {
  stage(ctx, lt, 1, 0.9 + lt * 0.05);
  const open = prog(lt, 0.3, 2.2);
  const top = 46 + round(lerp(0, 24, smooth(open))) + hover(lt + 2);
  contact(ctx, 192, TT_Y - 1, round(lerp(20, 44, smooth(open))), 0.35);
  umbrella(ctx, 192, top, 1, open, 0.3 + lt * 0.04);
  if (lt > 1.9) slideOff(ctx, lt - 1.9, 192);
  vignette(ctx, 0.5);
  // keynote statistics either side
  fadeUp(ctx, '99%', 330, 74, lt - 1.4, { face: 'thin', color: P.white, track: 2, align: 'center', scale: 2, dur: 0.9 });
  fadeUp(ctx, 'OF NOTIFICATIONS', 330, 98, lt - 1.7, { face: 'micro', color: P.fog, track: 1, align: 'center', dur: 0.8 });
  fadeUp(ctx, 'BLOCKED', 330, 106, lt - 1.8, { face: 'micro', color: P.fog, track: 1, align: 'center', dur: 0.8 });
  fadeUp(ctx, '0', 56, 74, lt - 2.6, { face: 'thin', color: P.white, track: 2, align: 'center', scale: 2, dur: 0.9 });
  fadeUp(ctx, 'COOKIES', 56, 98, lt - 2.9, { face: 'micro', color: P.fog, track: 1, align: 'center', dur: 0.8 });
  fadeUp(ctx, 'ACCEPTED', 56, 106, lt - 3.0, { face: 'micro', color: P.fog, track: 1, align: 'center', dur: 0.8 });
}

// --- 7. SLATE ----------------------------------------------------------------------

const LEGAL = 'CLOUDBRELLA OFFERS NO PROTECTION FROM RAIN, HAIL OR WEATHER OF ANY KIND. OFFLINE MODE CANNOT BE DISABLED. TERMS AND CONDITIONS DO NOT APPLY, FOR ONCE.';
function shotSlate(ctx, lt) {
  R(ctx, 0, 0, W, H, P.black);
  ctx.drawImage(stageBack(), 0, 0);
  beam(ctx, 192, -6, 192, 112, 24, 70, { color: P.silver, alpha: 0.03 });
  umbrella(ctx, 192, 22 + hover(lt), 0.62, 1, 0.5 + lt * 0.04);
  contact(ctx, 192, 108, 26, 0.3);
  trackIn(ctx, 'CLOUDBRELLA', 192, 120, lt - 0.1, { face: 'thin', color: P.white, track: 5, from: 12, dur: 1.8, scale: 2 });
  rule(ctx, 192, 147, 80, (lt - 0.9) / 0.9, P.steel);
  fadeUp(ctx, 'STAY DRY. STAY OFFLINE.', 192, 154, lt - 0.6, { face: 'thin', color: P.silver, track: 2, align: 'center', dur: 0.9 });
  fadeUp(ctx, 'IN CLOUD WHITE AND OFFLINE GREY', 192, 170, lt - 1.4, { face: 'micro', color: P.steel, track: 1, align: 'center', dur: 0.9 });
  smallPrint(ctx, LEGAL, 192, 190, 320, { color: P.slate, lt: lt - 1.8, dur: 1 });
}

const SHOTS = [
  { at: 0, draw: shotStage },
  { at: 4.4, draw: shotProblem, wipe: 'fade', wd: 0.9 },
  { at: 8.6, draw: shotReveal, wipe: 'fade', wd: 0.9 },
  { at: 12.0, draw: shotCanopy, wipe: 'black', wd: 0.6, hold: 0.05 },
  { at: 14.0, draw: shotHandle, wipe: 'soft', wd: 0.8, dir: 1 },
  { at: 16.2, draw: shotOpen, wipe: 'black', wd: 0.7, hold: 0.05 },
  { at: 20.6, draw: shotSlate, wipe: 'fade', wd: 1.0 },
];

// Keynote bed at 96 bpm in D major: airy sine pads, a soft plucked arpeggio
// with a dotted echo, a sub pulse from the reveal; Bm for the problem; the
// resolution and a single bell on the end slate (20.0 s).
const PLUCK = { wave: 'tri', a: 0.003, d: 0.32, s: 0, r: 0.2, vib: false };
const AIR = { wave: 'sine', a: 0.6, d: 1.5, s: 0.8, r: 1.2, vib: [5, 4, 0.4] };
const BELL = { wave: 'sine', a: 0.002, d: 1.4, s: 0, r: 0.8, vib: false };
const ARP_D = 'D5:0.5@0.32 A4:0.5@0.22 F#5:0.5@0.28 A4:0.5@0.2 E5:0.5@0.3 A4:0.5@0.22 C#5:0.5@0.26 A4:0.5@0.2';
const ARP_B = 'D5:0.5@0.3 F#4:0.5@0.2 B4:0.5@0.26 F#4:0.5@0.2 C#5:0.5@0.28 F#4:0.5@0.2 A4:0.5@0.24 F#4:0.5@0.2';
const ARP_G = 'D5:0.5@0.3 G4:0.5@0.2 B4:0.5@0.26 G4:0.5@0.2 F#5:0.5@0.3 G4:0.5@0.2 A4:0.5@0.24 G4:0.5@0.2';
const ARP_A = 'E5:0.5@0.3 A4:0.5@0.2 C#5:0.5@0.26 A4:0.5@0.2 D5:0.5@0.3 A4:0.5@0.2 E5:0.5@0.28 A4:0.5@0.2';
export default {
  id: 'cloudbrella',
  brand: 'CLOUDBRELLA',
  duration: 25.3,
  voice: { gender: 'female', lang: 'en-US', pitch: 1.0, rate: 0.95 },
  script: [
    { at: 0.6, text: 'For years, the cloud has followed you everywhere.' },
    { at: 4.7, text: 'Updates. Pop-ups. Terms and conditions.' },
    { at: 9.0, text: 'So we built something simpler.' },
    { at: 12.3, text: 'A zero-sync canopy.' },
    { at: 14.3, text: 'No Bluetooth. Anywhere.' },
    { at: 16.6, text: 'It blocks ninety-nine percent of notifications.' },
    { at: 21.0, text: 'Cloudbrella. Stay offline.' },
  ],
  tune: {
    bpm: 96,
    room: 0.45,
    echo: { beats: 0.75, feedback: 0.32 },
    loudness: -2,
    tracks: [
      {
        kind: 'harmony', inst: AIR, gain: 0.75,
        notes: tune(
          'D3+A3+C#4+E4+F#4:8@0.4 B2+F#3+A3+D4:4@0.38 G2+D3+F#3+B3:4@0.38',
          'D3+A3+C#4+E4:4@0.4 B2+F#3+A3+C#4:4@0.4 G2+D3+F#3+A3:4@0.4 A2+E3+A3+C#4:4@0.42',
          'D3+A3+C#4+E4+F#4:8@0.36',
        ),
      },
      {
        kind: 'lead', inst: PLUCK, gain: 0.7, echo: 0.45,
        notes: tune('R:8 R:8', ARP_D, ARP_B, ARP_G, ARP_A, 'D5:4@0.3 R:4'),
      },
      {
        kind: 'bass', inst: 'sine', gain: 0.8,
        notes: tune('R:8 B1:4@0.5 G1:4@0.5', 'D2:1@0.6 R:1 D2:1@0.5 R:1 B1:1@0.6 R:1 B1:1@0.5 R:1 G1:1@0.6 R:1 G1:1@0.5 R:1 A1:1@0.6 R:1 A1:1@0.55 R:1', 'D2:8@0.55'),
      },
      {
        kind: 'lead', inst: BELL, gain: 0.55, echo: 0.5,
        notes: tune('R:32', 'R:1 D6:3@0.3 A5:4@0.25'),
      },
      { drums: tune('R:16', 'K:2@0.22 K:2@0.18 K:2@0.22 K:2@0.18 K:2@0.22 K:2@0.18 K:2@0.22 K:1@0.2 X:1@0.12', 'R:8') },
    ],
  },
  draw(ctx, t, dt, info) {
    warmUp(SHOTS, dt, info);
    play(ctx, dt, info, SHOTS);
  },
};
