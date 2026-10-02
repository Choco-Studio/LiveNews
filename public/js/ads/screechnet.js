// SCREECHNET — dial-up internet for families who miss the suspense.
// Brand colours: beige, navy, signal yellow. "Fast as a fax."
// A family is bored stiff by instant pages; the beige modem turns on its
// turntable and screams; a cat photo loads one line at a time for days; and at
// 99% Grandma picks up the phone. NO CARRIER.
//
// Everything is a pure function of the shot's local time. The family are
// procedural rigs (tweened arms, lids that close, a yawn that opens and
// closes), the modem is a real 2.5D box whose faces are texture-mapped pixel
// by pixel so it stays crisp while it turns, and static art is cached.
import {
  P, W, H, R, A, rrect, disc, oval, poly, line, dither, bands, sparkle, shadow, stroke, cached, text, bigText,
  bubble, slogan, finePrint, urlPill, play, wordmark, drawMark, glint, prog, lerp, clamp, easeOut, easeIn,
  easeInOut, easeOutBack, tune, rep,
} from './kit.js';

const { round, floor, sin, cos, abs, min, max, PI } = Math;

// --- timing --------------------------------------------------------------------------
// 120 bpm: one beat = 0.5 s; every cut lands on a beat.
const T_DAD = 5.0;
const T_MODEM = 7.0;
const T_LOAD = 12.0;
const T_GRAN = 17.0;
const T_NOOO = 18.5;
const T_SLATE = 19.5;
const DURATION = 24.0;

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
const backOut = (s) => (x) => easeOutBack(x, s);

// --- the family (seated rigs) -----------------------------------------------------------

const DAD = { skin: P.skin, shade: P.skinShade, hair: P.brown, hairHi: P.tanShade, top: P.green, topSh: P.darkGreen, legs: P.slate, shoe: P.black, style: 'short', glasses: true };
const MUM = { skin: P.tan, shade: P.tanShade, hair: P.rust, hairHi: P.orange, top: P.magenta, topSh: P.purple, legs: P.navy, shoe: P.maroon, style: 'bob', blush: true };
const KID = { skin: P.skin, shade: P.skinShade, hair: P.yellow, hairHi: P.cream, top: P.red, topSh: P.darkRed, legs: P.navy, shoe: P.white, style: 'spiky', kid: true };
const GRAN = { skin: P.skin, shade: P.skinShade, hair: P.silver, hairHi: P.white, top: P.purple, topSh: P.maroon, legs: P.magenta, shoe: P.maroon, style: 'bun', glasses: true, blush: true };

// One reusable pose (no per-frame allocation): reset with pose(), then tweak.
const Q = {};
function pose() {
  Q.k = 1; // scale
  Q.slump = 0; // 0 upright .. 1 sunk into the sofa
  Q.tilt = 0; // head lean in px (+ right)
  Q.nod = 0; // head drop in px
  Q.eye = 1; // lid openness
  Q.lookX = 0;
  Q.lookY = 0;
  Q.smile = 0.3;
  Q.open = 0; // mouth 0..1
  Q.brow = 0; // + worried / surprised
  Q.aL = 0.2; // left arm: shoulder angle (0 down, PI/2 out, PI up)
  Q.eL = 0.3; // left elbow bend
  Q.aR = 0.2;
  Q.eR = 0.3;
  Q.beard = 0; // 0..1 grows a beard
  Q.blow = 0; // hair blown back by the screech
  Q.legs = true;
  Q.lift = 0; // jumps up off the seat (px)
  Q.legSwing = 0;
  Q.tRx = null; // right hand IK target (absolute px), overrides aR/eR
  Q.tRy = 0;
  Q.bendR = -1;
  Q.tLx = null;
  Q.tLy = 0;
  Q.bendL = -1;
  return Q;
}

/** Where sitter() will put the head for the current pose (for aiming hands at it). */
function headPos(x, seatY, who) {
  const k = Q.k * (who.kid ? 0.85 : 1);
  const r = round(11 * k);
  const top = round(seatY - Q.lift) - round((24 - 4 * Q.slump) * k);
  HEAD[0] = round(x + Q.tilt);
  HEAD[1] = round(top - r + 2 + Q.nod);
  HEAD[2] = r;
  return HEAD;
}

/**
 * Two-bone IK in the rig's angle convention: angles that put the hand of an
 * arm (shoulder sx,sy; side -1 left / 1 right) on the target. bend 1 points
 * the elbow inwards, -1 outwards. Writes [a, e] into IK.
 */
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

function arm(ctx, sx, sy, side, a, e, k, who) {
  const la = 11 * k;
  const lb = 10 * k;
  const ex = sx + side * sin(a) * la;
  const ey = sy + cos(a) * la;
  const hx = ex + side * sin(a + e) * lb;
  const hy = ey + cos(a + e) * lb;
  const w = max(3, round(5 * k));
  stroke(ctx, [[sx, sy], [ex, ey], [hx, hy]], w, who.top, P.black);
  const hr = max(2, round(3 * k));
  disc(ctx, hx, hy, hr + 1, P.black);
  disc(ctx, hx, hy, hr, who.skin);
  return [hx, hy];
}

/** Hair drawn behind the head (bob sides, bun). */
function hairBack(ctx, x, hy, r, who) {
  if (who.style === 'bob') {
    const b = round(Q.blow * r * 0.5);
    oval(ctx, x - b, hy + 1, r + 3, r + 2, P.black);
    R(ctx, x - r - 3 - b, hy, 2 * r + 7, r + 2, P.black);
    oval(ctx, x - b, hy + 1, r + 2, r + 1, who.hair);
    R(ctx, x - r - 2 - b, hy, 2 * r + 5, r + 1, who.hair);
  } else if (who.style === 'bun') {
    disc(ctx, x - round(Q.blow * 3), hy - r - 2, round(r * 0.45) + 1, P.black);
    disc(ctx, x - round(Q.blow * 3), hy - r - 2, round(r * 0.45), who.hair);
  }
}

/** Hair on top of the head (fringe / cap), pushed back when Q.blow > 0. */
function hairFront(ctx, x, hy, r, who) {
  const b = Q.blow;
  const sweep = round(b * r * 0.5);
  const cap = [];
  for (let i = 0; i <= 10; i++) {
    const a = PI + (i / 10) * PI;
    cap.push([x + cos(a) * (r + 1) - sweep * (1 - i / 10), hy - 1 + sin(a) * (r + 2)]);
  }
  if (who.style === 'spiky') {
    for (let i = 0; i < 5; i++) {
      const sx = x - r + 2 + i * (r * 0.45);
      const tipX = sx - 1 - b * r * 0.9;
      const tipY = hy - r - 6 + b * 3 + (i % 2) * 2;
      poly(ctx, [[sx - 4, hy - r + 3], [tipX - 1, tipY - 1], [sx + 4, hy - r + 3]], P.black);
      poly(ctx, [[sx - 3, hy - r + 3], [tipX, tipY], [sx + 3, hy - r + 3]], who.hair);
    }
  }
  const fringeY = who.style === 'short' ? hy - r * 0.35 : who.style === 'bun' ? hy - r * 0.45 : hy - r * 0.2;
  cap.push([x + r + 1, fringeY + 2], [x + r * 0.2, fringeY - 1 - b * 3], [x - r * 0.5, fringeY + 1 - b * 3], [x - r - 1 - sweep, fringeY + 3]);
  poly(ctx, cap.map(([px, py]) => [px + Math.sign(px - x), py - 1]), P.black);
  poly(ctx, cap, who.hair);
  line(ctx, x - r * 0.5, hy - r * 0.8, x + r * 0.1, hy - r * 0.95, who.hairHi, 1);
}

/** Seated family member: hips at (x, seatY). Returns head centre [x, y]. */
function sitter(ctx, x, seatY, who, floorY = seatY + 26) {
  const k = Q.k * (who.kid ? 0.85 : 1);
  const r = round(11 * k);
  const tw = round(22 * k);
  const th = round((24 - 4 * Q.slump) * k);
  const hipY = round(seatY - Q.lift);
  const top = hipY - th;
  // legs: knees on the seat edge, shins down the sofa front
  if (Q.legs) {
    for (const sd of [-1, 1]) {
      const kx = x + sd * round(5 * k);
      const sw = who.kid ? sin(Q.legSwing + (sd > 0 ? PI : 0)) * 3 * k : 0;
      const fy = who.kid ? floorY - 6 * k : floorY;
      stroke(ctx, [[kx, hipY + 2], [kx + sw, fy - 3]], max(3, round(5 * k)), who.legs, P.black);
      rrect(ctx, kx + sw - round(4 * k) - 1, fy - round(4 * k) - 1, round(8 * k) + 2, round(4 * k) + 2, P.black, 1);
      rrect(ctx, kx + sw - round(4 * k), fy - round(4 * k), round(8 * k), round(4 * k), who.shoe, 1);
    }
  }
  // torso
  poly(ctx, [[x - tw / 2 + 2, top - 1], [x + tw / 2 - 2, top - 1], [x + tw / 2 + 1, hipY + 3], [x - tw / 2 - 1, hipY + 3]], P.black);
  poly(ctx, [[x - tw / 2 + 3, top], [x + tw / 2 - 3, top], [x + tw / 2, hipY + 2], [x - tw / 2, hipY + 2]], who.top);
  R(ctx, x + round(tw / 2) - 3, top + 3, 2, th - 2, who.topSh);
  R(ctx, x - 3, top, 6, 2, who.shade);
  // head
  const hx = round(x + Q.tilt);
  const hy = round(top - r + 2 + Q.nod);
  hairBack(ctx, hx, hy, r, who);
  disc(ctx, hx, hy, r + 1, P.black);
  disc(ctx, hx, hy, r, who.shade);
  disc(ctx, hx - 1, hy - 1, r - 1, who.skin);
  // face
  const ex = round(4.5 * k);
  const ey = hy + round(1 * k);
  const lx = round(Q.lookX * k);
  const ly = round(Q.lookY * k);
  const eh = max(0, round(3 * k * Q.eye));
  for (const sd of [-1, 1]) {
    const px = hx + sd * ex + lx - (sd < 0 ? 1 : 0);
    if (eh <= 0) R(ctx, px - 1, ey + 1, 4, 1, P.black);
    else {
      R(ctx, px, ey + ly + (3 - min(3, eh)), 2, eh, P.black);
      if (eh >= 3) R(ctx, px, ey + ly, 1, 1, P.white);
      if (Q.eye < 0.95 && Q.eye > 0) R(ctx, px - 1, ey + ly + (3 - min(3, eh)) - 1, 4, 1, who.shade);
    }
    // brows lift for surprise, sag for boredom
    const by = ey - round(3 * k) - round(Q.brow * 2);
    R(ctx, px - 1, by + (sd < 0 ? (Q.brow > 0.3 ? 1 : 0) : 0), 4, 1, who.hair === P.yellow ? P.tanShade : who.hair === P.silver ? P.steel : who.hair);
    if (who.blush) R(ctx, hx + sd * round(7 * k) - 1, ey + round(3 * k), 2, 1, P.pink);
  }
  if (who.glasses) {
    for (const sd of [-1, 1]) {
      const gx = hx + sd * ex + lx - (sd < 0 ? 1 : 0) - 2;
      R(ctx, gx, ey - 2, 6, 1, P.black);
      R(ctx, gx, ey + 4, 6, 1, P.black);
      R(ctx, gx, ey - 2, 1, 7, P.black);
      R(ctx, gx + 5, ey - 2, 1, 7, P.black);
    }
    R(ctx, hx - 1 + lx, ey - 1, 2, 1, P.black);
  }
  // beard grows down from the chin
  if (Q.beard > 0.02) {
    const bl = round(Q.beard * 16 * k);
    poly(ctx, [[hx - r + 1, hy + 2], [hx + r - 1, hy + 2], [hx + r * 0.6, hy + r + bl * 0.6], [hx, hy + r + bl], [hx - r * 0.6, hy + r + bl * 0.6]], P.black);
    poly(ctx, [[hx - r + 2, hy + 3], [hx + r - 2, hy + 3], [hx + r * 0.55, hy + r + bl * 0.6 - 1], [hx, hy + r + bl - 1], [hx - r * 0.55, hy + r + bl * 0.6 - 1]], who.hair);
    R(ctx, hx - 3, hy + round(5 * k), 6, 2, who.skin);
  }
  // mouth: smile curve or an open (yawning / shouting) oval
  const my = hy + round(6 * k);
  const mw = round(3 * k);
  const oh = round(Q.open * 6 * k);
  if (oh <= 1) {
    const c = Q.smile;
    for (let dx = -mw; dx <= mw; dx++) R(ctx, hx + dx, my + round(c * (1 - (dx / mw) ** 2) * 1.5 - c * 0.5), 1, 1, P.black);
  } else {
    const ow = max(2, round(mw * (0.6 + Q.open * 0.5)));
    oval(ctx, hx, my + round(oh / 2), ow + 1, round(oh / 2) + 1, P.black);
    oval(ctx, hx, my + round(oh / 2), ow, round(oh / 2), P.maroon);
    if (oh > 4) R(ctx, hx - round(ow / 2), my + oh - 1, ow, 1, P.pink);
  }
  hairFront(ctx, hx, hy, r, who);
  // arms over the torso
  const shY = top + round(3 * k);
  const slx = x - round(tw / 2) + 2;
  const srx = x + round(tw / 2) - 2;
  if (Q.tLx !== null) {
    ik(slx, shY, Q.tLx, Q.tLy, 11 * k, 10 * k, -1, Q.bendL);
    Q.aL = IK[0];
    Q.eL = IK[1];
  }
  if (Q.tRx !== null) {
    ik(srx, shY, Q.tRx, Q.tRy, 11 * k, 10 * k, 1, Q.bendR);
    Q.aR = IK[0];
    Q.eR = IK[1];
  }
  const L = arm(ctx, slx, shY, -1, Q.aL, Q.eL, k, who);
  const Rr = arm(ctx, srx, shY, 1, Q.aR, Q.eR, k, who);
  HANDS[0] = L;
  HANDS[1] = Rr;
  HEAD[0] = hx;
  HEAD[1] = hy;
  HEAD[2] = r;
  return HEAD;
}
const HEAD = [0, 0, 0];
const HANDS = [null, null];

// --- living room ------------------------------------------------------------------------

const roomArt = () =>
  cached('sn2-room', W + 20, 150, (c) => {
    R(c, 0, 0, W + 20, 150, P.slate);
    for (let x = 0; x < W + 20; x += 20) R(c, x, 0, 2, 150, P.ink);
    dither(c, 0, 0, W + 20, 18, P.ink, 'checker');
    // night window with a moon
    R(c, 30, 26, 70, 56, P.black);
    R(c, 32, 28, 66, 52, P.navy);
    dither(c, 32, 60, 66, 20, P.ink, 'checker');
    disc(c, 82, 42, 7, P.cream);
    disc(c, 85, 40, 6, P.navy);
    for (const [x, y] of [[44, 36], [60, 48], [70, 32], [50, 62]]) R(c, x, y, 1, 1, P.white);
    R(c, 64, 28, 2, 52, P.black);
    R(c, 26, 82, 78, 4, P.black);
    R(c, 27, 82, 76, 2, P.steel);
    // framed seascape
    R(c, 232, 24, 52, 38, P.black);
    R(c, 234, 26, 48, 34, P.tan);
    R(c, 237, 29, 42, 28, P.blue);
    R(c, 237, 45, 42, 12, P.navy);
    poly(c, [[246, 45], [256, 32], [258, 45]], P.white);
    // floor lamp with a warm pool of light
    for (let i = 3; i >= 1; i--) disc(c, 352, 46, 14 + i * 9, A(P.yellow, 0.06));
    R(c, 351, 56, 2, 94, P.black);
    poly(c, [[338, 56], [366, 56], [360, 36], [344, 36]], P.black);
    poly(c, [[340, 55], [364, 55], [359, 37], [345, 37]], P.yellow);
    R(c, 340, 54, 24, 1, P.orange);
    R(c, 0, 146, W + 20, 4, A(P.black, 0.3));
  });

/** Sofa back (behind the family); w wide, k = height scale. */
function sofaBack(ctx, x0, y0, w = 200, k = 1) {
  const h = round(46 * k);
  rrect(ctx, x0, y0, w, h, P.black, 3);
  rrect(ctx, x0 + 1, y0 + 1, w - 2, h - 2, P.rust, 3);
  R(ctx, x0 + 3, y0 + 3, w - 6, 2, P.orange);
  R(ctx, x0 + round(w / 3), y0 + 6, 1, h - 10, P.darkRed);
  R(ctx, x0 + round((2 * w) / 3), y0 + 6, 1, h - 10, P.darkRed);
}
/** Seat front and armrests (in front of the family's hips). */
function sofaFront(ctx, x0, y0, w = 200, k = 1) {
  const sy = y0 + round(40 * k);
  const sh = round(20 * k);
  R(ctx, x0 - 6, sy, w + 12, sh, P.black);
  R(ctx, x0 - 5, sy + 1, w + 10, sh - 2, P.rust);
  R(ctx, x0 - 5, sy + 1, w + 10, 2, P.orange);
  R(ctx, x0 - 5, sy + sh - 3, w + 10, 2, P.darkRed);
  const aw = round(18 * k);
  for (const ax of [x0 - aw + 6, x0 + w - 4]) {
    rrect(ctx, ax, y0 + round(18 * k), aw, round(42 * k), P.black, 3);
    rrect(ctx, ax + 1, y0 + round(18 * k) + 1, aw - 2, round(42 * k) - 2, P.rust, 3);
    R(ctx, ax + 2, y0 + round(18 * k) + 2, aw - 4, 2, P.orange);
  }
  R(ctx, x0 - 8, sy + sh, 4, 4, P.black);
  R(ctx, x0 + w + 4, sy + sh, 4, 4, P.black);
}

// --- shot 1: the internet is too fast (0 - 5.0) -----------------------------------------------

const CLICKS = 0.38;
const FAM_K = 1.3;
function shotTooFast(ctx, lt) {
  const pan = round(kf(lt, [[0, 0], [5, -12]]));
  ctx.drawImage(roomArt(), pan - 4, 0);
  R(ctx, 0, 150, W, 66, P.brown);
  R(ctx, 0, 150, W, 2, P.tanShade);
  dither(ctx, 0, 152, W, 64, P.maroon, 'hlines');
  const sx = 112 + pan;
  const sw = 250;
  const seat = 152;
  const sy0 = seat - round(44 * FAM_K) + 4;
  sofaBack(ctx, sx, sy0, sw, FAM_K);
  const clicks = floor(lt / CLICKS);
  const clickP = (lt % CLICKS) / CLICKS;
  const feet = seat + 34;
  // Dad: chin propped on his hand, slow heavy blinks
  pose();
  Q.k = FAM_K;
  Q.slump = 0.6;
  Q.eye = lt % 2.6 > 2.3 ? 0.15 : 0.55;
  Q.lookX = -1;
  Q.lookY = 1;
  Q.smile = -0.2;
  Q.tilt = 2;
  headPos(sx + 50, seat, DAD);
  // elbow planted on the armrest, fist under the chin
  Q.tLx = HEAD[0] - 4;
  Q.tLy = HEAD[1] + HEAD[2] + 3;
  Q.bendL = -1;
  Q.aR = 0.3;
  Q.eR = 0.9;
  sitter(ctx, sx + 50, seat, DAD, feet);
  // Mum: one enormous yawn with a full stretch
  pose();
  Q.k = FAM_K;
  Q.slump = 0.4;
  const yawn = kf(lt, [[1.1, 0], [1.35, -0.1], [1.9, 1, easeOut], [2.6, 1], [3.2, 0]]);
  Q.aL = Q.aR = lerp(0.3, 2.85, clamp(yawn, 0, 1)) + 0.15 * min(0, yawn);
  Q.eL = Q.eR = lerp(0.4, 0.15, clamp(yawn, 0, 1));
  Q.open = kf(lt, [[1.6, 0], [2.0, 1, easeOut], [2.5, 0.9], [2.9, 0]]);
  Q.eye = 0.7 * clamp(1 - 2 * Q.open, 0, 1);
  Q.brow = -0.3 * Q.open;
  Q.lookX = -1;
  Q.lookY = 1;
  Q.smile = -0.1;
  Q.nod = round(-2 * clamp(yawn, 0, 1));
  sitter(ctx, sx + 126, seat, MUM, feet);
  // Kid: clicks the mouse every 0.38 s, unimpressed
  pose();
  Q.k = FAM_K;
  Q.slump = 1;
  Q.tilt = -2;
  Q.eye = 0.5;
  Q.lookX = -1;
  Q.lookY = 1;
  Q.smile = -0.4;
  Q.aL = 0.3;
  Q.eL = 1.2;
  Q.aR = 0.25;
  Q.eR = 1.25 - 0.12 * bump(clickP, 0, 0.25);
  Q.legSwing = lt * 3;
  sitter(ctx, sx + 200, seat + 2, KID, feet);
  const mouseX = round(HANDS[1][0]);
  const mouseY = round(HANDS[1][1]);
  rrect(ctx, mouseX - 4, mouseY + 2, 9, 11, P.black, 2);
  rrect(ctx, mouseX - 3, mouseY + 3, 7, 9, P.silver, 2);
  R(ctx, mouseX, mouseY + 3, 1, 4, P.steel);
  sofaFront(ctx, sx, sy0, sw, FAM_K);
  // the monitor glow on the room (soft, one gentle change per page)
  const glowCol = clicks % 2 ? P.cyan : P.white;
  oval(ctx, 30 + pan, 150, 100, 60, A(glowCol, 0.05));
  // foreground: the beige CRT in profile, its screen glowing towards the family
  const mx = -10 + round(pan * 1.6);
  R(ctx, mx - 10, 182, 136, 40, P.black);
  R(ctx, mx - 9, 183, 134, 39, P.brown);
  R(ctx, mx - 9, 183, 134, 2, P.tan);
  poly(ctx, [[mx + 14, 166], [mx + 84, 176], [mx + 84, 112], [mx + 14, 126]], P.black);
  poly(ctx, [[mx + 15, 165], [mx + 83, 175], [mx + 83, 113], [mx + 15, 127]], P.tan);
  for (let i = 0; i < 4; i++) R(ctx, mx + 30 + i * 9, 134 + i, 2, 26 - i * 2, P.tanShade);
  R(ctx, mx + 82, 104, 16, 80, P.black);
  R(ctx, mx + 83, 105, 14, 78, P.cream);
  R(ctx, mx + 83, 105, 14, 2, P.white);
  R(ctx, mx + 96, 108, 2, 72, glowCol);
  R(ctx, mx + 98, 106, 3, 76, A(glowCol, 0.35));
  R(ctx, mx + 70, 176, 40, 8, P.black);
  R(ctx, mx + 71, 177, 38, 6, P.tan);
  // on-screen counters (broadcast-style super)
  R(ctx, 170, 188, 204, 22, P.black);
  R(ctx, 171, 189, 202, 20, P.ink);
  R(ctx, 171, 189, 3, 20, P.green);
  text(ctx, 'PAGE LOADED IN 0.00001 S', 179, 190, { color: P.green });
  text(ctx, `PAGES VIEWED TODAY: ${48210 + clicks * 7}`, 179, 200, { color: P.white });
}

// --- shot 2: Dad nods off (5.0 - 7.0) ---------------------------------------------------------

function shotDad(ctx, lt) {
  R(ctx, 0, 0, W, H, P.ink);
  // out-of-focus room: the warm lamp far right, the cool screen light from the left
  for (let i = 3; i >= 1; i--) disc(ctx, 330, 40, 10 + i * 12, A(P.yellow, 0.05));
  for (let i = 3; i >= 1; i--) oval(ctx, 0, 120, 60 + i * 30, 50 + i * 26, A(P.cyan, 0.04));
  rrect(ctx, -10, 154, 404, 80, P.black, 3);
  rrect(ctx, -10, 155, 404, 80, P.rust, 3);
  R(ctx, 0, 157, W, 2, P.orange);
  // timing: lids sink, head nods... then a jolt awake just before the cut
  const lids = kf(lt, [[0.15, 0.55], [1.25, 0.12], [1.68, 0.0], [1.76, 1.0, easeOut]]);
  const nod = kf(lt, [[0.5, 0], [1.35, 10, easeIn], [1.7, 13], [1.8, -5, easeOut], [2.0, -1]]);
  const awake = lt > 1.72;
  const cx = 192 + round(nod * 0.3);
  const cy = 100 + round(nod);
  const K = P.black;
  // sweater, shirt collar, neck
  rrect(ctx, cx - 74, cy + 46, 148, 120, K, 3);
  rrect(ctx, cx - 72, cy + 48, 144, 120, P.green, 3);
  R(ctx, cx + 54, cy + 50, 16, 120, P.darkGreen);
  R(ctx, cx - 72, cy + 48, 144, 2, A(P.white, 0.15));
  R(ctx, cx - 12, cy + 34, 24, 16, P.skinShade);
  poly(ctx, [[cx - 20, cy + 47], [cx, cy + 58], [cx - 6, cy + 66], [cx - 24, cy + 52]], P.cream);
  poly(ctx, [[cx + 20, cy + 47], [cx, cy + 58], [cx + 6, cy + 66], [cx + 24, cy + 52]], P.cream);
  // ears, head (key light from the left: shade on his right)
  for (const sd of [-1, 1]) {
    oval(ctx, cx + sd * 44, cy + 6, 9, 12, K);
    oval(ctx, cx + sd * 44, cy + 6, 8, 11, P.skinShade);
    oval(ctx, cx + sd * 44 - sd, cy + 6, 4, 6, P.tanShade);
  }
  oval(ctx, cx, cy, 45, 47, K);
  oval(ctx, cx, cy, 44, 46, P.skinShade);
  oval(ctx, cx - 4, cy - 2, 40, 44, P.skin);
  // hair: side parting and sideburns
  const cap = [];
  for (let i = 0; i <= 14; i++) {
    const a = PI + (i / 14) * PI;
    cap.push([cx + cos(a) * 47, cy - 6 + sin(a) * 48]);
  }
  cap.push([cx + 47, cy + 2], [cx + 40, cy - 14], [cx + 22, cy - 26], [cx - 10, cy - 28], [cx - 26, cy - 22], [cx - 40, cy - 12], [cx - 47, cy + 2]);
  poly(ctx, cap.map(([x, y]) => [x + Math.sign(x - cx), y - 1]), K);
  poly(ctx, cap, P.brown);
  poly(ctx, [[cx - 14, cy - 48], [cx - 10, cy - 30], [cx - 18, cy - 26], [cx - 20, cy - 46]], P.maroon);
  stroke(ctx, [[cx - 34, cy - 34], [cx - 24, cy - 42], [cx - 12, cy - 46]], 3, P.tanShade, null);
  // eyebrows: sagging with boredom, shooting up when he wakes
  const browUp = awake ? -6 : round(lids * 2);
  for (const sd of [-1, 1]) {
    const bx = cx + sd * 18;
    const by = cy - 14 + browUp;
    stroke(ctx, [[bx - 9, by + (sd < 0 ? 3 : 0)], [bx, by], [bx + 9, by + (sd > 0 ? 3 : 0)]], 4, P.maroon, null);
  }
  // eyes: whites, brown irises, heavy lids with a lash line
  for (const sd of [-1, 1]) {
    const ex = cx + sd * 18;
    const ey = cy + 4;
    oval(ctx, ex, ey, 8, 7, K);
    oval(ctx, ex, ey, 7, 6, P.white);
    const ir = awake ? 3 : 4;
    disc(ctx, ex + 1, ey + 1, ir, P.brown);
    disc(ctx, ex + 1, ey + 1, ir - 2, K);
    R(ctx, ex - 1, ey - 1, 2, 2, P.white);
    // the lid covers the eye from the top; lids = 1 fully open
    const cover = round((1 - lids) * 15);
    if (cover > 0) {
      R(ctx, ex - 9, ey - 8, 19, min(16, cover), P.skin);
      R(ctx, ex - 8, ey - 8 + min(15, cover), 17, 1, K);
      R(ctx, ex - 8, ey - 9 + min(15, cover), 17, 1, P.skinShade);
    }
  }
  // glasses: thick frames, a lens glare and tiny reflections of pages loading instantly
  for (const sd of [-1, 1]) {
    const ex = cx + sd * 18;
    const ey = cy + 4;
    rrect(ctx, ex - 14, ey - 11, 28, 3, K, 1);
    rrect(ctx, ex - 14, ey + 9, 28, 3, K, 1);
    R(ctx, ex - 14, ey - 11, 3, 23, K);
    R(ctx, ex + 11, ey - 11, 3, 23, K);
    line(ctx, ex + 4, ey - 7, ex - 6, ey + 6, A(P.white, 0.35), 2);
    if (!awake && lids > 0.05) {
      const page = floor(lt * 7) + sd;
      R(ctx, ex - 10, ey - 7, 7, 5, A(page % 3 === 0 ? P.cyan : page % 3 === 1 ? P.yellow : P.white, 0.4));
    }
  }
  R(ctx, cx - 4, cy, 8, 3, K);
  // nose with a soft shade, mouth that drops open as he dozes
  oval(ctx, cx + 2, cy + 19, 7, 5, P.skinShade);
  oval(ctx, cx, cy + 18, 6, 4, P.skin);
  R(ctx, cx - 3, cy + 16, 2, 1, A(P.white, 0.5));
  const mo = round(kf(lt, [[0.8, 0], [1.5, 7], [1.7, 7], [1.76, 0]]));
  if (awake) {
    oval(ctx, cx, cy + 33, 4, 4, K);
    oval(ctx, cx, cy + 33, 3, 3, P.maroon);
  } else if (mo <= 1) {
    R(ctx, cx - 9, cy + 31, 18, 2, K);
    R(ctx, cx - 10, cy + 32, 2, 2, K);
    R(ctx, cx + 8, cy + 32, 2, 2, K);
  } else {
    oval(ctx, cx, cy + 32, 8, round(mo / 2) + 1, K);
    oval(ctx, cx, cy + 32, 7, round(mo / 2), P.maroon);
  }
  if (!awake) {
    for (let i = 0; i < 3; i++) {
      const p = (lt * 0.9 + i / 3) % 1;
      if (lt < 0.8 + i * 0.2) continue;
      bigText(ctx, 'Z', cx + 58 + round(p * 26) + round(sin(p * 7) * 3), cy - 30 - round(p * 40), { scale: 1 + (i % 2), color: p > 0.75 ? P.steel : P.white, outline: K });
    }
  } else {
    // jolted awake: surprise ticks by his head
    const p = easeOut(prog(lt, 1.74, 1.9));
    for (let i = 0; i < 3; i++) {
      const a = -PI * 0.78 + i * 0.36;
      line(ctx, cx + 60 + cos(a) * 6, cy - 40 + sin(a) * 6, cx + 60 + cos(a) * (6 + 10 * p), cy - 40 + sin(a) * (6 + 10 * p), P.white, 2);
    }
  }
}

// --- the modem: a crisp 2.5D box ----------------------------------------------------------------

const MW = 120;
const MD = 64;
const MH = 28;
const TILT = 0.42;

/** Bake a canvas once and keep its pixels as palette colour strings for texture mapping. */
function texture(key, w, h, paint) {
  const cv = cached(key, w, h, paint);
  let t = TEX.get(key);
  if (!t) {
    const d = cv.getContext('2d').getImageData(0, 0, w, h).data;
    const px = new Array(w * h);
    for (let i = 0; i < w * h; i++) px[i] = d[i * 4 + 3] < 128 ? null : `rgb(${d[i * 4]},${d[i * 4 + 1]},${d[i * 4 + 2]})`;
    t = { w, h, px };
    TEX.set(key, t);
  }
  return t;
}
const TEX = new Map();

const frontTex = () =>
  texture('sn2-front', MW, MH, (c) => {
    R(c, 0, 0, MW, MH, P.cream);
    R(c, 0, 0, MW, 1, P.white);
    R(c, 0, MH - 2, MW, 2, P.tan);
    R(c, 6, 6, 70, 8, P.ink);
    for (let i = 0; i < 6; i++) R(c, 10 + i * 11, 9, 5, 2, P.slate);
    text(c, 'DATA/FAX MODEM', 6, 17, { color: P.steel });
    text(c, '56K', 86, 7, { color: P.red });
    for (let x = 102; x < 116; x += 2) R(c, x, 5, 1, 18, P.tan);
  });
const topTex = () =>
  texture('sn2-top', MW, MD, (c) => {
    R(c, 0, 0, MW, MD, P.white);
    R(c, 0, MD - 1, MW, 1, P.cream);
    R(c, 0, 0, MW, 2, P.cream);
    R(c, 24, 24, 72, 14, P.navy);
    R(c, 24, 24, 72, 1, P.blue);
    text(c, 'SCREECHNET', 60, 28, { color: P.yellow, align: 'center' });
    for (let y = 46; y < 58; y += 3) R(c, 30, y, 60, 1, P.cream);
  });
const sideTex = () =>
  texture('sn2-side', MD, MH, (c) => {
    R(c, 0, 0, MD, MH, P.tan);
    R(c, 0, 0, MD, 1, P.cream);
    for (let y = 8; y < 22; y += 4) R(c, 14, y, 36, 1, P.tanShade);
  });

/** Draw a texture as an affine-mapped parallelogram, pixel-exact (no smoothing, no AA). */
function texQuad(ctx, tex, ox, oy, ux, uy, vx, vy) {
  const det = ux * vy - uy * vx;
  if (abs(det) < 0.05) return;
  const cw = tex.w * ux;
  const ch = tex.h * vx;
  const x0 = floor(min(ox, ox + cw, ox + ch, ox + cw + ch));
  const x1 = Math.ceil(max(ox, ox + cw, ox + ch, ox + cw + ch));
  const cy0 = tex.w * uy;
  const cy1 = tex.h * vy;
  const y0 = floor(min(oy, oy + cy0, oy + cy1, oy + cy0 + cy1));
  const y1 = Math.ceil(max(oy, oy + cy0, oy + cy1, oy + cy0 + cy1));
  const { w, h, px } = tex;
  for (let Y = y0; Y <= y1; Y++) {
    let run = null;
    let rx = 0;
    const dy = Y + 0.5 - oy;
    for (let X = x0; X <= x1 + 1; X++) {
      const dx = X + 0.5 - ox;
      const u = (dx * vy - dy * vx) / det;
      const v = (dy * ux - dx * uy) / det;
      const c = X <= x1 && u >= 0 && v >= 0 && u < w && v < h ? px[(v | 0) * w + (u | 0)] : null;
      if (c !== run) {
        if (run) {
          ctx.fillStyle = run;
          ctx.fillRect(rx, Y, X - rx, 1);
        }
        run = c;
        rx = X;
      }
    }
  }
}

const PJ = [0, 0];
let MCX = 0;
let MCY = 0;
let MCOS = 1;
let MSIN = 0;
/** Project a modem-space point (x right, y up, z back) to the screen. */
function pj(x, y, z) {
  const rx = x * MCOS - z * MSIN;
  const rz = x * MSIN + z * MCOS;
  PJ[0] = MCX + rx;
  PJ[1] = MCY - y - rz * TILT;
  return PJ;
}

/**
 * The modem turned by theta (radians) with its base centre at (cx, cy).
 * leds: 0 idle, 1 dialling (chaotic), 2 connected. Returns the front-face
 * mapping so callers can find points on it.
 */
function modem(ctx, cx, cy, theta, leds, lt) {
  MCX = cx;
  MCY = cy;
  MCOS = cos(theta);
  MSIN = sin(theta);
  const hw = MW / 2;
  const hd = MD / 2;
  // silhouette outline: every visible face, 1 px larger, in black
  const faces = [];
  faces.push([pj(-hw, MH, hd).slice(), pj(hw, MH, hd).slice(), pj(hw, MH, -hd).slice(), pj(-hw, MH, -hd).slice()]);
  if (MCOS > 0) faces.push([pj(-hw, MH, -hd).slice(), pj(hw, MH, -hd).slice(), pj(hw, 0, -hd).slice(), pj(-hw, 0, -hd).slice()]);
  if (MSIN < 0) faces.push([pj(hw, MH, -hd).slice(), pj(hw, MH, hd).slice(), pj(hw, 0, hd).slice(), pj(hw, 0, -hd).slice()]);
  if (MSIN > 0) faces.push([pj(-hw, MH, hd).slice(), pj(-hw, MH, -hd).slice(), pj(-hw, 0, -hd).slice(), pj(-hw, 0, hd).slice()]);
  for (const f of faces) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) poly(ctx, f.map(([x, y]) => [x + dx, y + dy]), P.black);
  // top: u along x, v from back to front
  pj(-hw, MH, hd);
  texQuad(ctx, topTex(), PJ[0], PJ[1], MCOS, -MSIN * TILT, MSIN, MCOS * TILT);
  if (MSIN < 0) {
    pj(hw, MH, -hd);
    texQuad(ctx, sideTex(), PJ[0], PJ[1], -MSIN, -MCOS * TILT, 0, 1);
  }
  if (MSIN > 0) {
    pj(-hw, MH, hd);
    texQuad(ctx, sideTex(), PJ[0], PJ[1], MSIN, MCOS * TILT, 0, 1);
  }
  if (MCOS > 0) {
    pj(-hw, MH, -hd);
    const ox = PJ[0];
    const oy = PJ[1];
    const ux = MCOS;
    const uy = -MSIN * TILT;
    texQuad(ctx, frontTex(), ox, oy, ux, uy, 0, 1);
    // status lights, drawn live on the front face
    for (let i = 0; i < 6; i++) {
      let col = P.slate;
      if (leds === 1) col = (floor(lt * 14) + i * 3) % 5 < 2 ? (i % 2 ? P.yellow : P.red) : P.slate;
      else if (leds === 2) col = i < 3 ? P.green : i === 5 && floor(lt * 3) % 2 ? P.yellow : P.slate;
      else col = i === 0 ? P.green : P.slate;
      const u = 10 + i * 11;
      R(ctx, round(ox + u * ux), round(oy + u * uy + 9), max(2, round(5 * ux)), 2, col);
    }
  }
}

// --- the cat (procedural, so it can arch, stretch and curl) -------------------------------------------

const CAT = {};
function catPose() {
  CAT.arch = 0; // scared arched back 0..1
  CAT.stretch = 0; // + stretched tall (jump), - squashed (landing)
  CAT.eye = 1; // 0 asleep
  CAT.curl = 0; // 1 curled up asleep
  CAT.tail = 0; // tail angle offset
  CAT.fur = 0; // puffed fur 0..1
  return CAT;
}
function cat(ctx, x, gy, lt, s = 1) {
  const O = P.orange;
  const o = P.rust;
  const st = CAT.stretch;
  if (CAT.curl > 0.5) {
    // a sleeping loaf: body, tucked head, tail wrapped round
    const br = round(lerp(0, 1.5, sin(lt * 2.4) * 0.5 + 0.5));
    oval(ctx, x, gy - 7 * s, round(15 * s) + 1, round(8 * s) + 1 + br, P.black);
    oval(ctx, x, gy - 7 * s, round(15 * s), round(8 * s) + br, O);
    R(ctx, x - round(8 * s), gy - round(12 * s), round(4 * s), 2, o);
    R(ctx, x + round(2 * s), gy - round(13 * s), round(4 * s), 2, o);
    disc(ctx, x - round(10 * s), gy - round(8 * s), round(6 * s) + 1, P.black);
    disc(ctx, x - round(10 * s), gy - round(8 * s), round(6 * s), O);
    poly(ctx, [[x - 15 * s, gy - 11 * s], [x - 14 * s, gy - 18 * s], [x - 10 * s, gy - 13 * s]], P.black);
    R(ctx, x - round(13 * s), gy - round(8 * s), 3, 1, P.black);
    R(ctx, x - round(9 * s), gy - round(8 * s), 3, 1, P.black);
    stroke(ctx, [[x + 13 * s, gy - 3 * s], [x + 6 * s, gy], [x - 6 * s, gy]], max(2, round(3 * s)), O, P.black);
    return;
  }
  const bw = round((12 - 2 * st) * s);
  const bh = round((8 + 4 * st + 3 * CAT.arch) * s);
  const by = gy - round((5 + 6 * CAT.arch) * s) - bh;
  // legs
  for (const lx of [-8, -4, 4, 8]) stroke(ctx, [[x + lx * s, by + bh], [x + lx * s * (1 + CAT.arch * 0.3), gy]], max(2, round(3 * s)), O, P.black);
  // tail
  const ta = -1.2 - CAT.arch * 0.8 + CAT.tail + sin(lt * 3) * 0.15 * (1 - CAT.arch);
  stroke(ctx, [[x + bw, by + bh * 0.5], [x + bw + 6 * s, by + bh * 0.2], [x + bw + 6 * s + cos(ta) * 8 * s, by + bh * 0.2 + sin(ta) * 10 * s]], max(2, round(3 * s)), O, P.black);
  // body (arched = taller)
  oval(ctx, x, by + bh / 2, bw + 1, round(bh / 2) + 1, P.black);
  oval(ctx, x, by + bh / 2, bw, round(bh / 2), O);
  if (CAT.fur > 0.2) for (let i = -2; i <= 2; i++) poly(ctx, [[x + i * 4 * s - 2, by + 2], [x + i * 4 * s, by - 3 * s * CAT.fur], [x + i * 4 * s + 2, by + 2]], O);
  R(ctx, x - round(4 * s), by + 2, round(3 * s), 2, o);
  R(ctx, x + round(2 * s), by + 2, round(3 * s), 2, o);
  // head
  const hx = x - bw + round(2 * s);
  const hy = by + round(2 * s) - round(st * 3 * s);
  const hr = round(7 * s);
  for (const sd of [-1, 1]) {
    poly(ctx, [[hx + sd * 6 * s - 3, hy - 3 * s], [hx + sd * 6 * s, hy - 11 * s], [hx + sd * 2 * s, hy - 5 * s]], P.black);
    poly(ctx, [[hx + sd * 6 * s - 2, hy - 3 * s], [hx + sd * 6 * s, hy - 9 * s], [hx + sd * 3 * s, hy - 5 * s]], O);
  }
  disc(ctx, hx, hy, hr + 1, P.black);
  disc(ctx, hx, hy, hr, O);
  for (const sd of [-1, 1]) {
    const ex = hx + sd * round(3 * s);
    if (CAT.eye < 0.3) R(ctx, ex - 1, hy, 3, 1, P.black);
    else if (CAT.arch > 0.5) {
      disc(ctx, ex, hy, round(2 * s), P.white);
      R(ctx, ex, hy - 1, 1, 2, P.black);
    } else {
      R(ctx, ex - 1, hy - 1, 2, 3, P.green);
      R(ctx, ex, hy - 1, 1, 3, P.black);
    }
  }
  R(ctx, hx - 1, hy + round(3 * s), 2, 1, P.pink);
  if (CAT.arch > 0.5) R(ctx, hx - 2, hy + round(4 * s), 4, 2, P.maroon);
}

// --- shot 3: product hero (7.0 - 12.0) ---------------------------------------------------------------

const SCREECH = [
  { at: 2.25, word: 'SKREEEE!', x: 92, y: 40, sc: 3, col: P.yellow },
  { at: 2.6, word: 'KSSHHHH!', x: 300, y: 56, sc: 2, col: P.cyan },
  { at: 2.95, word: 'BWONG-BWONG', x: 112, y: 92, sc: 2, col: P.pink },
  { at: 3.3, word: 'DEE-DOO-DEE-DOO', x: 280, y: 26, sc: 1, col: P.green },
  { at: 3.6, word: 'KRRRRK', x: 210, y: 76, sc: 2, col: P.orange },
];

function shotModem(ctx, lt) {
  const screech = prog(lt, 2.1, 2.2) - prog(lt, 4.35, 4.5);
  // one steady change of mood when it screams (no strobing: photosensitivity)
  if (screech > 0.5) bands(ctx, 0, 0, W, 150, [P.ink, P.purple, P.magenta]);
  else bands(ctx, 0, 0, W, 150, [P.black, P.ink, P.navy]);
  // spotlight cone
  const spot = easeOut(prog(lt, 0, 0.5));
  if (spot > 0 && screech < 0.5) {
    poly(ctx, [[176, 0], [208, 0], [282, 150], [102, 150]], A(P.white, 0.06 * spot));
    poly(ctx, [[184, 0], [200, 0], [252, 150], [132, 150]], A(P.white, 0.05 * spot));
  }
  R(ctx, 0, 150, W, 66, P.brown);
  R(ctx, 0, 150, W, 2, P.tan);
  dither(ctx, 0, 152, W, 64, P.tanShade, 'hlines');
  // the modem rises on its turntable, swings round and settles at a 3/4 view
  const rise = easeOutBack(prog(lt, 0.05, 0.75), 1.2);
  const baseY = round(lerp(250, 150, rise));
  const theta = kf(lt, [[0, -1.25], [1.9, -0.32, easeInOut]]);
  const [sx, sy] = screech > 0.5 ? [floor(lt * 30) % 2, floor(lt * 22) % 2] : [0, 0];
  // turntable
  oval(ctx, 192, baseY + 2, 84, 20, P.black);
  oval(ctx, 192, baseY, 82, 18, P.ink);
  oval(ctx, 192, baseY - 2, 80, 16, P.slate);
  for (let i = 0; i < 12; i++) {
    const a = theta * 1.0 + (i / 12) * PI * 2;
    if (sin(a) < 0) continue;
    R(ctx, 192 + round(cos(a) * 78), baseY - 2 + round(sin(a) * 15), 3, 2, P.fog);
  }
  shadow(ctx, 192, baseY - 2, 66, 0.4);
  // shock rings while it screams
  if (screech > 0.5) {
    for (let k = 0; k < 4; k++) {
      const rr = ((lt - 2.1) * 90 + k * 34) % 136;
      const ry = round(rr * 0.5);
      for (let i = 0; i < 64; i++) {
        const a = (i / 64) * PI * 2;
        R(ctx, 192 + round(cos(a) * rr), baseY - 30 + round(sin(a) * ry), 2, 2, k % 2 ? P.yellow : P.cyan);
      }
    }
  }
  modem(ctx, 192 + sx, baseY - 4 + sy, theta, lt > 4.45 ? 2 : screech > 0.5 ? 1 : 0, lt);
  // the gleam: sparkles on the corners as it settles
  if (lt > 1.6 && lt < 2.1) {
    sparkle(ctx, 136, baseY - 46, floor((lt - 1.6) * 16) % 4, P.white);
    sparkle(ctx, 250, baseY - 34, floor((lt - 1.7) * 16) % 4, P.white);
  }
  const intro = prog(lt, 0.45, 0.6) - prog(lt, 1.95, 2.1);
  if (intro > 0) {
    // letters rise into place one by one
    const word = 'INTRODUCING...';
    const x0 = 192 - (word.length * 12) / 2;
    for (let i = 0; i < word.length; i++) {
      const p = prog(lt, 0.45 + i * 0.04, 0.75 + i * 0.04);
      if (p <= 0) continue;
      const dy = round((1 - easeOutBack(p, 2)) * 14);
      bigText(ctx, word[i], x0 + i * 12, 26 + dy, { scale: 2, color: intro < 1 ? P.navy : P.cyan, outline: P.black });
    }
  }
  // the cat: sits calmly, launches straight up at the first screech, lands puffed up
  catPose();
  let cy = 150;
  if (lt > 2.05 && lt < 4.6) {
    const jump = prog(lt, 2.2, 2.55);
    const fall = prog(lt, 4.2, 4.5);
    cy = 150 - round(170 * easeOut(jump)) + round(170 * easeIn(fall));
    CAT.arch = 1;
    CAT.fur = 1;
    CAT.stretch = lt < 2.2 ? -0.4 : lt < 4.2 ? 0.6 : 0.6;
  } else if (lt >= 4.6) {
    CAT.stretch = -0.4 * (1 - prog(lt, 4.5, 4.8));
    CAT.arch = 1 - prog(lt, 4.6, 5.0);
    CAT.fur = CAT.arch;
  }
  cat(ctx, 330, cy, lt);
  const dust = prog(lt, 2.2, 2.7);
  if (dust > 0 && dust < 1) {
    for (let i = 0; i < 5; i++) disc(ctx, 318 + i * 6, 148 - round(dust * 3), round(2 + dust * 4), A(P.silver, 0.5 * (1 - dust)));
    for (let i = 0; i < 3; i++) R(ctx, 322 + i * 8, 120 - round(dust * 60) - i * 6, 1, 14, A(P.white, 0.6 * (1 - dust)));
  }
  if (screech > 0.5) {
    for (const w of SCREECH) {
      const p = prog(lt, w.at, w.at + 0.22);
      if (p <= 0) continue;
      const fx = lerp(192, w.x, easeOutBack(p, 1.6));
      const fy = lerp(baseY - 40, w.y, easeOutBack(p, 1.6));
      const j = floor(lt * 20 + w.x) % 2;
      bigText(ctx, w.word, fx + j, fy, { scale: w.sc, color: w.col, outline: P.black, ow: w.sc > 1 ? 2 : 1, align: 'center' });
    }
  }
  if (lt > 4.45) {
    const p = easeOutBack(prog(lt, 4.45, 4.7), 2);
    R(ctx, 112, 182, 160, 18, P.black);
    R(ctx, 113, 183, round(158 * p), 16, P.darkGreen);
    if (p >= 1) text(ctx, 'CONNECTED AT 56,000 BPS', 192, 188, { color: P.green, align: 'center' });
  }
}

// --- shot 4: the photo loads, the family waits (12.0 - 17.0) ---------------------------------------------

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

const crtArt = () =>
  cached('sn2-crt', 184, 168, (c) => {
    rrect(c, 0, 0, 184, 150, P.black, 3);
    rrect(c, 1, 1, 182, 148, P.cream, 3);
    R(c, 1, 140, 182, 9, P.tan);
    R(c, 10, 9, 164, 124, P.black);
    R(c, 12, 11, 160, 120, P.ink);
    R(c, 150, 141, 8, 4, P.green);
    text(c, 'SCREECHNET', 14, 141, { color: P.tanShade });
    R(c, 60, 150, 64, 10, P.black);
    R(c, 61, 150, 62, 9, P.tan);
    R(c, 40, 159, 104, 8, P.black);
    R(c, 41, 160, 102, 6, P.cream);
  });

const TIME_LEFT = ['2 MINUTES', '4 HOURS', '3 DAYS', '1 WEEK', '6 MINUTES', '2 YEARS'];

function loadingScreen(ctx, x, y, pct, lt, lost) {
  ctx.drawImage(crtArt(), x, y);
  const sx = x + 24;
  const sy = y + 15;
  if (lost) {
    R(ctx, x + 12, y + 11, 160, 120, P.black);
    bigText(ctx, 'NO CARRIER', x + 92, y + 46, { scale: 2, color: P.red, outline: null, align: 'center' });
    text(ctx, 'CONNECTION LOST', x + 92, y + 72, { color: P.white, align: 'center' });
    return;
  }
  const rows = floor(pct * 92);
  if (rows > 0) ctx.drawImage(catPhoto(), 0, 0, 136, rows, sx, sy, 136, rows);
  if (rows < 92) R(ctx, sx, sy + rows, 136, 1, P.white);
  text(ctx, 'LOADING CAT PHOTO...', sx, sy + 96, { color: P.white });
  R(ctx, sx, sy + 106, 100, 6, P.slate);
  R(ctx, sx, sy + 106, round(100 * pct), 6, P.green);
  text(ctx, `${floor(pct * 100)}%`, sx + 136, sy + 106, { color: P.yellow, align: 'right' });
}

function shotLoading(ctx, lt) {
  // left half: the screen
  R(ctx, 0, 0, 192, H, P.ink);
  dither(ctx, 0, 0, 192, H, P.slate, 'sparse');
  const pct = 0.99 * easeOut(prog(lt, 0.2, 4.6));
  loadingScreen(ctx, 4, 18, pct, lt, false);
  const left = TIME_LEFT[floor(lt * 1.4) % TIME_LEFT.length];
  R(ctx, 4, 190, 184, 14, P.black);
  text(ctx, `TIME LEFT: ${left}`, 96, 194, { color: P.fog, align: 'center' });
  // right half: days go by
  ctx.save();
  ctx.beginPath();
  ctx.rect(196, 0, 188, H);
  ctx.clip();
  const day = lt * 1.6;
  const dayP = day % 1;
  const sky = sin(dayP * PI * 2) > 0 ? P.blue : P.navy;
  R(ctx, 196, 0, 188, 150, P.slate);
  for (let x = 196; x < W; x += 20) R(ctx, x, 0, 2, 150, P.ink);
  // window: sun and moon chase each other across the sky
  R(ctx, 214, 18, 62, 52, P.black);
  R(ctx, 216, 20, 58, 48, sky);
  const a = dayP * PI * 2;
  disc(ctx, 245 + round(cos(a) * 24), 62 - round(sin(a) * 36), 5, P.yellow);
  disc(ctx, 245 - round(cos(a) * 24), 62 + round(sin(a) * 36), 4, P.cream);
  R(ctx, 244, 20, 2, 48, P.black);
  R(ctx, 212, 70, 66, 3, P.black);
  // tear-off calendar: a page flips and falls every day
  const page = floor(day);
  R(ctx, 330, 22, 36, 40, P.black);
  R(ctx, 331, 23, 34, 38, P.white);
  R(ctx, 331, 23, 34, 9, P.red);
  text(ctx, 'DAY', 348, 25, { color: P.white, align: 'center' });
  bigText(ctx, String(page + 2), 348, 38, { scale: 2, color: P.black, outline: null, align: 'center' });
  if (dayP < 0.5) {
    const f = dayP * 2;
    const fy = round(23 + easeIn(f) * 110);
    const fx = round(331 + sin(f * 6) * 8 * f);
    R(ctx, fx, fy, 34, 38 - round(f * 20), P.white);
    R(ctx, fx, fy, 34, 9, P.red);
    if (f < 0.4) bigText(ctx, String(page + 1), fx + 17, fy + 15, { scale: 2, color: P.black, outline: null, align: 'center' });
  }
  // cobweb spreading from the corner
  const web = prog(lt, 1.0, 4.6);
  if (web > 0) {
    const n = round(web * 28);
    line(ctx, 383, 0, 383 - n, 0, P.silver);
    line(ctx, 383, 0, 383, n, P.silver);
    line(ctx, 383, 0, 383 - n, n, P.silver);
    for (let k = 7; k < n; k += 7) line(ctx, 383 - k, 0, 383, k, P.fog);
  }
  R(ctx, 196, 150, 188, 66, P.brown);
  R(ctx, 196, 150, 188, 2, P.tanShade);
  sofaBack(ctx, 194, 102);
  const beard = easeInOut(prog(lt, 0.3, 4.8));
  pose();
  Q.eye = 1;
  Q.lookX = -1.5;
  Q.smile = -0.3;
  Q.beard = beard;
  Q.aL = Q.aR = 0.3;
  Q.eL = Q.eR = 1.0;
  Q.slump = 0.3 + 0.5 * beard;
  sitter(ctx, 238, 146, DAD);
  pose();
  Q.lookX = -1.5;
  Q.eye = lt % 2.2 > 2.05 ? 0 : 1;
  Q.smile = -0.2;
  Q.aL = 0.5;
  Q.eL = 2.3;
  Q.aR = 0.2;
  Q.slump = 0.3 + 0.4 * beard;
  Q.tilt = round(-2 * beard);
  sitter(ctx, 290, 146, MUM);
  pose();
  Q.lookX = -1.5;
  Q.eye = 0.6 + 0.4 * (1 - beard);
  Q.smile = -0.5;
  Q.slump = 1;
  Q.legSwing = lt * 2;
  Q.aL = Q.aR = 0.4;
  Q.eL = Q.eR = 0.9;
  sitter(ctx, 340, 148, KID);
  sofaFront(ctx, 194, 102);
  text(ctx, 'WAITING...', 290, 186, { color: P.cream, align: 'center' });
  if (lt > 2.5) text(ctx, '...STILL WAITING', 290, 198, { color: P.tan, align: 'center' });
  ctx.restore();
  R(ctx, 192, 0, 4, H, P.black);
}

// --- shot 5a: Grandma picks up the phone (17.0 - 18.5) ------------------------------------------

function shotGranny(ctx, lt) {
  R(ctx, 0, 0, W, H, P.maroon);
  for (let x = 4; x < W; x += 18) R(ctx, x, 0, 7, 160, P.purple);
  R(ctx, 0, 158, W, 2, P.black);
  R(ctx, 0, 160, W, 56, P.brown);
  R(ctx, 0, 160, W, 2, P.tan);
  // framed photo of the cat on the wall
  R(ctx, 278, 30, 44, 36, P.black);
  R(ctx, 280, 32, 40, 32, P.tan);
  ctx.drawImage(catPhoto(), 34, 12, 68, 56, 284, 36, 32, 24);
  // phone table with the telephone
  const tx = 200;
  const ty = 166;
  R(ctx, tx - 4, ty, 92, 6, P.black);
  R(ctx, tx - 3, ty + 1, 90, 4, P.tanShade);
  R(ctx, tx + 2, ty + 6, 5, 50, P.black);
  R(ctx, tx + 76, ty + 6, 5, 50, P.black);
  rrect(ctx, tx + 14, ty - 18, 46, 19, P.black, 2);
  rrect(ctx, tx + 15, ty - 17, 44, 17, P.cream, 2);
  disc(ctx, tx + 37, ty - 8, 6, P.tan);
  disc(ctx, tx + 37, ty - 8, 2, P.cream);
  // the progress bar is SO close
  R(ctx, 262, 84, 108, 30, P.black);
  R(ctx, 264, 86, 104, 26, P.ink);
  text(ctx, 'CAT PHOTO', 270, 89, { color: P.white });
  R(ctx, 270, 100, 74, 6, P.slate);
  R(ctx, 270, 100, 73, 6, P.green);
  text(ctx, '99%', 364, 100, { color: P.yellow, align: 'right' });
  // Grandma lifts the receiver to her ear in one easy arc (IK hand on a curve)
  const reach = kf(lt, [[0.08, 0], [0.62, 1, easeInOut]]);
  pose();
  Q.k = 2.1;
  Q.legs = false;
  Q.eye = lt % 1.6 > 1.5 ? 0 : 1;
  Q.lookX = lerp(1.5, 0.5, reach);
  Q.lookY = lerp(1, 0, reach);
  Q.smile = 0.7;
  Q.open = lt > 0.68 && lt < 1.3 ? 0.3 + 0.2 * sin(lt * 26) : 0;
  Q.aL = 0.2;
  Q.eL = 0.5;
  Q.tilt = round(reach * 3);
  const hp = headPos(126, 214, GRAN);
  const earX = hp[0] + hp[2] - 2;
  const earY = hp[1] + 2;
  const cradleX = tx + 30;
  const cradleY = ty - 20;
  Q.tRx = lerp(cradleX, earX + 4, reach);
  Q.tRy = lerp(cradleY, earY, reach) - sin(reach * PI) * 22;
  Q.bendR = -1;
  sitter(ctx, 126, 214, GRAN);
  const hand = HANDS[1];
  // the receiver rides in her hand; the curly cord stretches after it
  const rx = round(hand[0]);
  const ry = round(hand[1]);
  const n = 18;
  for (let i = 0; i <= n; i++) {
    const p = i / n;
    const x = lerp(tx + 56, rx + 6, p);
    const y = lerp(ty - 10, ry + 10, p) + sin(p * PI) * 16 * (1 - reach * 0.5);
    R(ctx, x, y + (i % 2 ? 2 : -1), 2, 2, P.black);
  }
  const vert = reach > 0.6;
  if (vert) {
    rrect(ctx, rx - 5, ry - 16, 11, 34, P.black, 2);
    rrect(ctx, rx - 4, ry - 15, 9, 32, P.cream, 2);
    R(ctx, rx - 4, ry - 15, 9, 6, P.tan);
    R(ctx, rx - 4, ry + 11, 9, 6, P.tan);
  } else {
    rrect(ctx, rx - 17, ry - 5, 36, 11, P.black, 2);
    rrect(ctx, rx - 16, ry - 4, 34, 9, P.cream, 2);
    R(ctx, rx - 16, ry - 4, 7, 9, P.tan);
    R(ctx, rx + 11, ry - 4, 7, 9, P.tan);
  }
  // her fingers wrap over the receiver
  disc(ctx, hand[0], hand[1], 5, P.black);
  disc(ctx, hand[0], hand[1], 4, GRAN.skin);
  if (lt > 0.12 && lt < 0.5) bigText(ctx, 'CLICK', tx + 60, ty - 44, { scale: 1, color: P.yellow, outline: P.black });
  if (lt > 0.62) {
    const p = easeOutBack(prog(lt, 0.62, 0.82), 2.2);
    const w = round(150 * p);
    if (w > 30) bubble(ctx, 186 - w / 2 + 30, 18, w, 'HELLO? WHO IS SCREAMING ON MY PHONE LINE?', { tail: 'down', tx: 176 });
  }
}

// --- shot 5b: NOOOO (18.5 - 19.5) ----------------------------------------------------------------

function shotNooo(ctx, lt) {
  const push = round(kf(lt, [[0, 0], [1, 6, easeOut]]));
  R(ctx, 0, 0, W, H, P.slate);
  for (let x = 0; x < W; x += 20) R(ctx, x, 0, 2, 150, P.ink);
  R(ctx, 0, 150, W, 66, P.brown);
  ctx.save();
  ctx.translate(0, push);
  sofaBack(ctx, 92, 96);
  const up = kf(lt, [[0, 0], [0.08, -0.25], [0.3, 1.1, easeOut], [0.45, 1]]);
  const jump = round(kf(lt, [[0.06, 0], [0.26, 10, easeOut], [0.5, 4], [0.7, 6]]));
  const ppl = [[DAD, 132], [MUM, 192], [KID, 252]];
  for (let i = 0; i < 3; i++) {
    pose();
    Q.k = 1.15;
    Q.lift = jump;
    Q.slump = up < 0 ? 0.5 : 0;
    Q.aL = Q.aR = lerp(0.3, 2.7, clamp(up, 0, 1.1)) + (up < 0 ? up : 0);
    Q.eL = Q.eR = lerp(0.6, 0.2, clamp(up, 0, 1));
    Q.open = lerp(0, 1, prog(lt, 0.05, 0.25));
    Q.eye = 1;
    Q.brow = 1;
    Q.beard = i === 0 ? 1 : 0;
    Q.blow = 0.3 * prog(lt, 0.1, 0.3);
    Q.legSwing = lt * 18;
    sitter(ctx, ppl[i][1], 140, ppl[i][0]);
  }
  sofaFront(ctx, 92, 96);
  ctx.restore();
  bigText(ctx, 'NOOOOO!', 192, 22 + round((1 - easeOutBack(prog(lt, 0.1, 0.3), 2)) * -30), { scale: 3, color: P.white, outline: P.black, ow: 2, depth: 3, depthColor: P.red, align: 'center' });
  // foreground: the monitor with the verdict
  R(ctx, 254, 150, 124, 66, P.black);
  R(ctx, 255, 151, 122, 65, P.cream);
  R(ctx, 262, 157, 108, 56, P.black);
  text(ctx, 'NO CARRIER', 316, 172, { color: P.red, align: 'center' });
  text(ctx, '99%', 316, 186, { color: P.slate, align: 'center' });
}

// --- shot 6: end slate (19.5 - 24.0) -----------------------------------------------------------------

const MARK = () => wordmark('SCREECHNET', {
  h: 26, pen: 2, square: true, slant: 0.32, wide: 0.85, gap: 2,
  fill: [P.white, P.yellow, P.yellow, P.orange, P.orange, P.rust],
  outline: [[P.black, 2]], depth: 3, depthColor: P.navy,
});

const slateArt = () =>
  cached('sn2-slate', W, H, (c) => {
    bands(c, 0, 0, W, 140, [P.black, P.ink, P.navy]);
    for (let i = 4; i >= 1; i--) oval(c, 192, 132, 90 + i * 30, 30 + i * 12, A(P.blue, 0.06));
    R(c, 0, 140, W, 76, P.brown);
    R(c, 0, 140, W, 2, P.tan);
    dither(c, 0, 142, W, 74, P.tanShade, 'hlines');
  });

function soundWave(ctx, cx, y, w, lt, col) {
  for (let i = 0; i < w; i++) {
    const amp = sin((i / w) * PI) * 4;
    const v = round(sin(i * 0.9 - lt * 12) * amp * (0.6 + 0.4 * sin(i * 0.23 + lt * 3)));
    R(ctx, cx - w / 2 + i, y + min(0, v), 1, abs(v) + 1, col);
  }
}

function shotSlate(ctx, lt) {
  ctx.drawImage(slateArt(), 0, 0);
  const slide = easeOutBack(prog(lt, 0, 0.5), 1.4);
  const mx = round(lerp(470, 192, slide));
  shadow(ctx, mx, 140, 70, 0.45);
  modem(ctx, mx, 136, -0.3 + (1 - slide) * 0.6, 2, lt);
  // the cat, asleep on the warm modem, breathing
  catPose();
  CAT.curl = 1;
  if (slide >= 1) {
    cat(ctx, 214, 112 - 0, lt);
    const zp = (lt * 0.6) % 1;
    text(ctx, 'Z', 196 - round(zp * 8), 92 - round(zp * 14), { color: zp > 0.7 ? P.slate : P.white });
  }
  const mk = MARK();
  const x0 = drawMark(ctx, mk, 192, 22, { reveal: prog(lt, 0.2, 1.0), drop: 36 });
  glint(ctx, mk.cv, x0 - mk.ox, 22 - mk.oy, (lt - 1.2) / 0.7, { width: 6 });
  if (lt > 1.0) soundWave(ctx, 192, 60, round(200 * easeOut(prog(lt, 1.0, 1.4))), lt, P.cyan);
  if (lt > 1.2) text(ctx, 'DIAL-UP INTERNET  •  NOW 56K!', 192, 68, { color: P.white, align: 'center', shadow: P.black });
  if (lt > 1.4) slogan(ctx, 'FAST AS A FAX.', 192, 150, lt - 1.4, { scale: 2, bg: P.red, edge: P.darkRed });
  const up = easeOutBack(prog(lt, 2.0, 2.3), 2);
  if (up > 0) urlPill(ctx, 'SCREECHNET.BAUD', 192, round(lerp(196, 178, up)), { bg: P.navy, border: P.yellow, color: P.yellow });
  finePrint(ctx, 'SPEEDS UP TO 56K ON A GOOD TUESDAY. PLEASE ASK GRANDMA TO STAY OFF THE PHONE.', { lt: lt - 2.2 });
}

const SCENES = [
  { at: 0, draw: shotTooFast },
  { at: T_DAD, draw: shotDad, wipe: 'cut' },
  { at: T_MODEM, draw: shotModem, wipe: 'bars', wd: 0.4 },
  { at: T_LOAD, draw: shotLoading, wipe: 'push', wd: 0.45 },
  { at: T_GRAN, draw: shotGranny, wipe: 'cut' },
  { at: T_NOOO, draw: shotNooo, wipe: 'cut' },
  { at: T_SLATE, draw: shotSlate, wipe: 'iris', wd: 0.5, cx: 192, cy: 110 },
];

export default {
  id: 'screechnet',
  brand: 'SCREECHNET',
  duration: DURATION,
  voice: { gender: 'female', lang: 'en-GB', pitch: 1.0, rate: 1.0 },
  script: [
    { at: 0.5, text: 'Is your internet too fast?' },
    { at: 2.6, text: 'Do you miss the... suspense?' },
    { at: 7.2, text: 'Introducing ScreechNet.' },
    { at: 12.2, text: 'Enjoy every photo... one... line... at a time.' },
    { at: 19.9, text: 'ScreechNet. Fast as a fax.' },
  ],
  // 120 bpm, 48 beats = 24 s: a lazy lounge vamp (10), a sleepy lull (4), the
  // modem's fanfare and screech (10), a ticking wait (10), a gasp (2), a slam
  // (1) and the brand sting resolving on C with the end slate (9).
  tune: {
    bpm: 120,
    wave: 'triangle',
    notes: tune(
      'E4:1 G4:1 A4:2 G4:1 E4:1 D4:2 E4:1 G4:1',
      'A3:2 G3:2',
      'C5:0.5 E5:0.5 G5:1 C6:2', rep('A5:0.25 E5:0.25', 8), 'C6:0.5 A5:0.5 F5:0.5 D5:0.5',
      'E4:1 R:1 E4:1 R:1 F4:1 R:1 F#4:1 R:1 G4:1 G#4:1',
      'A4:0.5 B4:0.5 C5:1 R:1',
      'C4:0.5 B3:0.5 Bb3:1',
      'E5:0.5 E5:0.5 G5:1 C6:2 G5:0.5 E5:0.5 C5:2 R:2',
    ),
    bass: tune(
      'A2:2 E2:2 F2:2 E2:2 A2:2',
      'F2:4',
      'C3:4', rep('A2:0.5', 8), 'D3:1 E3:1',
      'E2:2 E2:2 F2:2 F#2:2 G2:2',
      'B2:3',
      'C2:2',
      'C3:2 G2:2 F2:2 G2:1 C3:2',
    ),
    bassWave: 'square',
    drums: tune(
      rep('K:1 H:1', 5),
      'K:2 R:2',
      'K:1 K:1 S:2', rep('S:0.25', 16), 'K:1 S:1',
      rep('H:1', 10),
      'S:0.5 S:0.5 K:1 R:1',
      'K:1 S:1',
      'K:1 S:1 K:1 S:1 K:1 S:1 K:2 R:1',
    ),
  },
  draw(ctx, t, dt, info) {
    play(ctx, dt, info, SCENES);
  },
};
