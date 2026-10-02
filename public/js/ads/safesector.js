// SAFESECTOR — insurance for floppy disks. Brand colours: navy, silver, cyan.
// Flop the floppy disk strolls across a sunny desk until the dangers of desk
// life loom over him (magnets, spills, coasters); adviser Brenda Byte calms
// him down, his SafeSector shield shrugs off every threat, and each one gets
// a COVERED! stamp on the voice-over's beat. "Because every kilobyte counts."
//
// Everything is drawn from the shot's local time: characters are procedural
// rigs (tweened limbs, blinking eyes, squash & stretch) and static scenery is
// baked once into cached canvases.
import {
  P, W, H, R, A, rrect, disc, oval, ring, poly, line, dither, bands, sparkle, shadow, stroke, cached, text, bigText,
  slogan, finePrint, urlPill, play, wordmark, drawMark, glint, prog, lerp, clamp, easeOut, easeIn, easeInOut,
  easeOutBack, tune, rep,
} from './kit.js';

const { round, floor, sin, cos, abs, min, max, PI } = Math;

// --- timing --------------------------------------------------------------------
// 100 bpm: one beat = 0.6 s and every cut lands on a beat of the jingle.
const T_MAGNET = 4.8;
const T_SPILL = 6.6;
const T_COASTER = 8.4;
const T_AGENT = 10.2;
const T_DEMO = 15.0;
const T_SLATE = 21.0;
const DURATION = 25.2;

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
/** 0 → 1 → 0 bump over [a, b]. */
const bump = (t, a, b) => sin(PI * prog(t, a, b));

// --- Flop, the floppy disk (procedural rig) -----------------------------------------
// One reusable pose object (no per-frame allocation): reset with flopPose() and
// set only what the shot needs. Angles in radians: arm 0 = hanging down,
// PI/2 = straight out, PI = straight up; elbow bends the forearm further up.
const F = {};
function flopPose() {
  F.sq = 0; // + squash, - stretch
  F.lift = 0; // feet off the ground (px)
  F.walk = 0; // walk-cycle phase (rad)
  F.walkAmt = 0; // 0 standing .. 1 full stride
  F.face = 1; // shoes point right (1) or left (-1)
  F.armL = 0.25;
  F.elbL = 0.15;
  F.armR = 0.25;
  F.elbR = 0.15;
  F.thumbR = 0;
  F.eye = 1; // eyelid openness 0..1
  F.eyeL = 1; // extra per-eye openness (winks)
  F.big = 1; // eye size multiplier (fright)
  F.joy = 0; // 1 = happy closed-eye arcs
  F.squint = 0; // 1 = squeezed >< eyes
  F.dizzy = 0; // 1 = spiral eyes
  F.lookX = 0;
  F.lookY = 0;
  F.brow = 0; // + worried (inner ends up), - determined
  F.smile = 0.6; // -1 frown .. 1 big smile
  F.open = 0; // mouth openness 0..1
  F.shutter = 0; // metal shutter slid open 0..1
  F.stain = 0;
  F.label = P.white;
  F.legs = true;
  F.shiver = 0;
  return F;
}

/** Column-filled mouth: a smile curve that opens into a rounded shape. */
function mouth(ctx, cx, my, hw, u, smile, open) {
  const curve = smile * max(1, hw * 0.45);
  const depth = open * hw * 1.25;
  if (depth < 1.2) {
    for (let dx = -hw; dx <= hw; dx++) {
      const q = dx / hw;
      R(ctx, cx + dx, my + round(curve * (1 - q * q) - curve * 0.5), 1, u, P.black);
    }
    return;
  }
  for (let dx = -hw - 1; dx <= hw + 1; dx++) {
    const q = clamp(dx / (hw + 0.5), -1, 1);
    const top = my + round(curve * (1 - q * q) * 0.35 - curve * 0.5);
    const bot = top + max(1, round(depth * Math.sqrt(max(0, 1 - q * q))));
    R(ctx, cx + dx, top - 1, 1, bot - top + 2, P.black);
    if (abs(dx) <= hw - 1 && bot - top > 1) {
      R(ctx, cx + dx, top, 1, bot - top, P.maroon);
      const tongue = round((bot - top) * 0.45);
      if (abs(dx) < hw * 0.6 && tongue > 0) R(ctx, cx + dx, bot - tongue, 1, tongue, P.pink);
    }
  }
}

function flopEyes(ctx, cx, ey, ex, s, u) {
  const rx = max(1, round(s * 0.085 * F.big));
  const ry = max(2, round(s * 0.12 * F.big));
  const lx = round(F.lookX * max(1, s * 0.05));
  const ly = round(F.lookY * max(1, s * 0.05));
  for (const sd of [-1, 1]) {
    const x = cx + sd * ex;
    const open = F.eye * (sd < 0 ? F.eyeL : 1);
    if (F.dizzy > 0.5) {
      // spiral eyes: a square swirl turning with time
      ring(ctx, x, ey, rx + u, P.black);
      R(ctx, x - u, ey - u, 2 * u, u, P.black);
      R(ctx, x, ey - u, u, 2 * u, P.black);
    } else if (F.squint > 0.5) {
      line(ctx, x - sd * rx * 1.4, ey - ry * 0.7, x + sd * rx * 0.6, ey, P.black, u);
      line(ctx, x + sd * rx * 0.6, ey, x - sd * rx * 1.4, ey + ry * 0.7, P.black, u);
    } else if (F.joy > 0.5 || open < 0.2) {
      // closed: happy arcs (^) or a soft lid line
      const up = F.joy > 0.5 ? -1 : 1;
      for (let dx = -rx - u; dx <= rx + u; dx++) {
        const q = dx / (rx + u);
        R(ctx, x + dx, ey + round(up * (1 - q * q) * ry * 0.5) - (up < 0 ? 0 : -round(ry * 0.3)), 1, u, P.black);
      }
    } else {
      oval(ctx, x + lx, ey + ly, rx, max(1, round(ry * open)), P.black);
      if (open > 0.5) R(ctx, x + lx - round(rx * 0.4), ey + ly - round(ry * open * 0.55), max(1, round(rx * 0.6)), max(1, round(ry * 0.35)), P.white);
    }
    // brows
    if (abs(F.brow) > 0.05 || F.big > 1.05) {
      const by = ey - ry - max(2, round(s * 0.09)) - round((F.big - 1) * s * 0.12);
      const inner = round(F.brow * s * 0.06);
      line(ctx, x - sd * rx * 1.3, by - inner, x + sd * rx * 0.9, by, P.navy, u);
    }
  }
}

/** Floppy body centred on cx with its bottom edge at by; returns the box. */
function flopBody(ctx, cx, by, s) {
  const sq = F.sq;
  const w = round(2 * s * (1 + sq * 0.55));
  const h = round(2.08 * s * (1 - sq));
  const x = round(cx - w / 2);
  const y = by - h;
  const u = max(1, round(s / 16));
  rrect(ctx, x - 1, y - 1, w + 2, h + 2, P.black, 2);
  rrect(ctx, x, y, w, h, P.blue, 2);
  R(ctx, x + 2, y + 3, u, h - 6, P.cyan);
  R(ctx, x + w - 3 * u, y + 3, 2 * u, h - 6, P.navy);
  // corner notch
  poly(ctx, [[x + w - 5 * u, y - 1], [x + w + 1, y - 1], [x + w + 1, y + 5 * u]], P.black);
  // metal shutter: slides right to show the magnetic disk underneath
  const sw = round(w * 0.5);
  const sh = round(h * 0.38);
  const sx = round(cx - sw / 2 + w * 0.04);
  const win = round(sw * 0.26);
  const wx = sx + round(sw * 0.56);
  R(ctx, wx - 1, y, win + 2, sh, P.black);
  R(ctx, wx, y + u, win, sh - 2 * u, P.maroon);
  R(ctx, wx + 1, y + 2 * u, max(1, round(win / 3)), max(1, sh - 5 * u), P.brown);
  const slide = round(F.shutter * sw * 0.42);
  const pw = min(sw, x + w - 1 - (sx + slide));
  if (pw > 0) {
    R(ctx, sx + slide - 1, y - 1, pw + 2, sh + 1, P.black);
    R(ctx, sx + slide, y, pw, sh - 1, P.silver);
    R(ctx, sx + slide + u, y + u, u, sh - 3 * u, P.white);
    const slot = wx + slide;
    if (slot + win < x + w - 2) R(ctx, slot, y + 2 * u, win, sh - 5 * u, P.steel);
  }
  // label with the face
  const lw = round(w * 0.8);
  const lh = round(h * 0.5);
  const lx = round(cx - lw / 2);
  const ly = y + h - lh - round(h * 0.06);
  R(ctx, lx - 1, ly - 1, lw + 2, lh + 2, P.black);
  R(ctx, lx, ly, lw, lh, F.label);
  R(ctx, lx, ly, lw, u, F.label === P.cream ? P.yellow : P.red);
  if (F.stain > 0) {
    const st = F.stain;
    disc(ctx, lx + round(lw * 0.28), ly + round(lh * 0.32), round(s * 0.2 * st), A(P.brown, 0.75));
    disc(ctx, lx + round(lw * 0.7), ly + round(lh * 0.62), round(s * 0.15 * st), A(P.brown, 0.75));
    disc(ctx, x + round(w * 0.22), y + round(h * 0.18), round(s * 0.13 * st), A(P.brown, 0.8));
    if (st > 0.5) R(ctx, lx + round(lw * 0.28), ly + round(lh * 0.32), u, round(lh * 0.5 * st), A(P.brown, 0.8));
  }
  const ex = round(lw * 0.2);
  const ey = ly + round(lh * 0.42);
  flopEyes(ctx, cx, ey, ex, s, u);
  if (s >= 16 && F.squint < 0.5) {
    R(ctx, cx - ex - round(s * 0.2), ey + round(s * 0.12), round(s * 0.12), u, P.pink);
    R(ctx, cx + ex + round(s * 0.08), ey + round(s * 0.12), round(s * 0.12), u, P.pink);
  }
  mouth(ctx, cx, ly + round(lh * 0.74), max(2, round(s * 0.12)), u, F.smile, F.open);
  return { x, y, w, h, u };
}

/** Arm from the shoulder (sx, sy); side -1 = screen left. Returns the hand. */
function flopArm(ctx, sx, sy, side, ang, elb, s, thumb) {
  const la = s * 0.42;
  const lb = s * 0.38;
  const ex = sx + side * sin(ang) * la;
  const ey = sy + cos(ang) * la;
  const hx = ex + side * sin(ang + elb) * lb;
  const hy = ey + cos(ang + elb) * lb;
  const lw = max(2, round(s / 10));
  stroke(ctx, [[sx, sy], [ex, ey], [hx, hy]], lw, P.black, null);
  const hr = max(2, round(s * 0.13));
  disc(ctx, hx, hy, hr + 1, P.black);
  disc(ctx, hx, hy, hr, P.white);
  if (thumb > 0) {
    const th = round(hr * 1.4 * thumb);
    R(ctx, hx - round(hr * 0.4) - 1, hy - hr - th - 1, round(hr * 0.8) + 2, th + 2, P.black);
    R(ctx, hx - round(hr * 0.4), hy - hr - th, round(hr * 0.8), th + 1, P.white);
  }
  return [hx, hy];
}

/** The whole floppy standing on ground line gy. */
function flop(ctx, cx, gy, s) {
  const legH = F.legs ? round(s * 0.5 * (1 - max(0, F.sq) * 0.5)) : 0;
  const bob = round(F.walkAmt * abs(sin(F.walk)) * s * 0.06);
  cx = round(cx + (F.shiver ? round(sin(F.shiver * 60) * 1.2) : 0));
  const by = round(gy - legH - F.lift + bob);
  const w = round(2 * s * (1 + F.sq * 0.55));
  const lw = max(2, round(s / 10));
  if (legH > 0) {
    for (const sd of [-1, 1]) {
      const ph = F.walk + (sd < 0 ? 0 : PI);
      const hx = cx + sd * round(w * 0.2);
      const fx = round(hx + F.walkAmt * sin(ph) * s * 0.3);
      const dangle = F.lift > 0 ? sin(F.walk * 2 + sd) * s * 0.05 : 0;
      const fy = round(min(gy, by + legH + F.lift * 0.15) - max(0, cos(ph)) * F.walkAmt * s * 0.16 + dangle);
      stroke(ctx, [[hx, by - 2], [fx, fy - 2]], lw, P.black, null);
      const sw = round(s * 0.36);
      const sh = max(3, round(s * 0.15));
      const sx = F.face > 0 ? fx - round(sw * 0.35) : fx - round(sw * 0.65);
      rrect(ctx, sx - 1, fy - sh - 1, sw + 2, sh + 2, P.black, 2);
      rrect(ctx, sx, fy - sh, sw, sh, P.red, 2);
      R(ctx, sx + (F.face > 0 ? round(sw * 0.45) : 1), fy - sh + 1, round(sw * 0.4), 1, P.pink);
    }
  }
  const b = flopBody(ctx, cx, by, s);
  const shY = b.y + round(b.h * 0.56);
  flopArm(ctx, b.x - 1, shY, -1, F.armL, F.elbL, s, 0);
  flopArm(ctx, b.x + b.w, shY, 1, F.armR, F.elbR, s, F.thumbR);
  return b;
}

// --- props ---------------------------------------------------------------------------

/** Horseshoe magnet centred on (cx, cy) (the bend at the top), rotated by ang. */
function magnet(ctx, cx, cy, ang, s = 1) {
  const c = cos(ang);
  const si = sin(ang);
  const rot = (x, y) => [cx + (x * c - y * si) * s, cy + (x * si + y * c) * s];
  const arc = [];
  arc.push(rot(-16, 26));
  for (let i = 0; i <= 8; i++) {
    const a = PI + (i / 8) * PI;
    arc.push(rot(cos(a) * 16, sin(a) * 16));
  }
  arc.push(rot(16, 26));
  const wdt = max(5, round(11 * s));
  stroke(ctx, arc, wdt, P.red, P.black);
  stroke(ctx, arc.slice(2, 8).map(([x, y]) => [x - si * 3 * s - c * 1, y - c * 3 * s + si * 1]), max(1, round(3 * s)), P.pink, null);
  for (const sd of [-1, 1]) {
    const tip = [rot(sd * 16, 22), rot(sd * 16, 32)];
    stroke(ctx, tip, wdt, P.silver, P.black);
    stroke(ctx, [rot(sd * 16 - 3, 23), rot(sd * 16 - 3, 30)], max(1, round(2 * s)), P.white, null);
  }
}

/** Coffee mug rotated by ang around its base centre (bx, by); negative ang tips it left. */
function mug(ctx, bx, by, ang, body = P.white, coffee = true, s = 1) {
  const c = cos(ang);
  const si = sin(ang);
  const rot = (x, y) => [bx + (x * c - y * si) * s, by + (x * si + y * c) * s];
  const quad = (x0, y0, x1, y1) => [rot(x0, y0), rot(x1, y0), rot(x1, y1), rot(x0, y1)];
  const shade = body === P.white ? P.silver : P.orange;
  // C-shaped handle on the right
  poly(ctx, quad(14, -32, 28, -6), P.black);
  poly(ctx, quad(15, -30, 26, -8), body);
  poly(ctx, quad(15, -25, 21, -13), P.black);
  // body with a rounded-feeling base and a rim band
  poly(ctx, [rot(-19, -42), rot(19, -42), rot(19, -2), rot(16, 1), rot(-16, 1), rot(-19, -2)], P.black);
  poly(ctx, [rot(-18, -41), rot(18, -41), rot(18, -2), rot(15, 0), rot(-15, 0), rot(-18, -2)], body);
  poly(ctx, quad(9, -38, 15, -3), shade);
  poly(ctx, quad(-15, -34, -12, -5), P.white);
  poly(ctx, quad(-18, -41, 18, -38), shade);
  // the logo: a little heart
  poly(ctx, [rot(-7, -27), rot(-3, -30), rot(0, -27), rot(3, -30), rot(7, -27), rot(0, -18)], P.red);
  if (coffee) poly(ctx, quad(-16, -41, 16, -39), P.brown);
}
const LIP = [0, 0];
/** Screen position of the pouring lip (top-left rim corner) of a rotated mug. */
function mugLip(bx, by, ang, s = 1) {
  LIP[0] = bx + (-17 * cos(ang) + 41 * sin(ang)) * s;
  LIP[1] = by + (-17 * sin(ang) - 41 * cos(ang)) * s;
  return LIP;
}

/** A thick arcing stream of coffee from (x0, y0) falling onto (x1, y1); grow 0..1. */
function pourStream(ctx, x0, y0, x1, y1, grow, lt) {
  const n = 18;
  const m = max(1, round(n * grow));
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < m; i++) {
      const p0 = i / n;
      const p1 = (i + 1) / n;
      const ax = lerp(x0, x1, p0);
      const ay = y0 + (y1 - y0) * p0 * p0;
      const bx = lerp(x0, x1, p1);
      const by = y0 + (y1 - y0) * p1 * p1;
      if (pass === 0) line(ctx, ax - 3, ay - 3, bx - 3, by - 3, P.black, 6);
      else {
        line(ctx, ax - 2, ay - 2, bx - 2, by - 2, P.brown, 4);
        if ((i + floor(lt * 24)) % 4 === 0) R(ctx, ax - 1, ay - 2, 2, 1, P.tan);
      }
    }
  }
}

// --- shared furniture -------------------------------------------------------------------

/** Kinetic caption: letters drop in one by one and settle with an overshoot. */
function slam(ctx, word, cx, y, lt, { scale = 3, color = P.white, depthColor = P.darkRed } = {}) {
  const sp = scale * 6;
  const x0 = round(cx - (word.length * sp) / 2);
  for (let i = 0; i < word.length; i++) {
    const p = prog(lt, i * 0.035, i * 0.035 + 0.28);
    if (p <= 0 || word[i] === ' ') continue;
    const dy = round((1 - easeOutBack(p, 2.6)) * -46);
    bigText(ctx, word[i], x0 + i * sp, y + dy, { scale, color, outline: P.black, ow: 2, depth: 3, depthColor });
  }
}

function dangerBg(ctx, cols, lt) {
  bands(ctx, 0, 0, W, 160, cols);
  // diagonal motion streaks drifting left, hazard style
  const off = floor(lt * 90) % 48;
  for (let x = -60 - off; x < W + 60; x += 48) poly(ctx, [[x, 0], [x + 14, 0], [x - 46, 160], [x - 60, 160]], A(P.black, 0.12));
  R(ctx, 0, 160, W, 56, P.brown);
  R(ctx, 0, 160, W, 2, P.tan);
  dither(ctx, 0, 164, W, 52, P.tanShade, 'hlines');
}

// --- shot 1: a sunny stroll (0 - 4.8) -----------------------------------------------------

const WALL_W = 470;
const DESK_Y = 170;
const wallArt = () =>
  cached('ss2-wall', WALL_W, DESK_Y + 2, (c) => {
    R(c, 0, 0, WALL_W, DESK_Y + 2, P.cream);
    for (let x = 6; x < WALL_W; x += 24) R(c, x, 0, 8, DESK_Y + 2, A(P.tan, 0.18));
    // window with sky
    R(c, 44, 22, 136, 100, P.black);
    R(c, 46, 24, 132, 96, P.white);
    bands(c, 50, 28, 124, 88, [P.blue, P.blue, P.cyan]);
    disc(c, 76, 48, 9, P.yellow);
    disc(c, 76, 48, 6, P.white);
    for (const [x, y] of [[60, 104], [96, 98], [128, 102], [158, 96]]) oval(c, x, y + 16, 22, 12, P.green);
    R(c, 50, 110, 124, 6, P.darkGreen);
    R(c, 110, 28, 4, 88, P.white);
    R(c, 38, 120, 148, 6, P.black);
    R(c, 39, 121, 146, 4, P.white);
    // cork board with sticky notes
    R(c, 236, 30, 104, 72, P.black);
    R(c, 238, 32, 100, 68, P.tanShade);
    dither(c, 238, 32, 100, 68, P.brown, 'sparse');
    R(c, 246, 38, 50, 40, P.yellow);
    text(c, 'TO DO:', 250, 42, { color: P.brown });
    text(c, 'BACK UP', 250, 54, { color: P.red });
    text(c, 'EVERY-', 250, 63, { color: P.red });
    text(c, 'THING!', 250, 72, { color: P.red });
    R(c, 304, 42, 26, 24, P.pink);
    R(c, 308, 48, 18, 1, P.maroon);
    R(c, 308, 53, 14, 1, P.maroon);
    R(c, 308, 58, 16, 1, P.maroon);
    for (const [x, y] of [[270, 36], [316, 40]]) disc(c, x, y, 2, P.red);
    // shelf with binders
    R(c, 380, 72, 80, 4, P.brown);
    for (let i = 0; i < 6; i++) {
      R(c, 384 + i * 12, 44, 10, 28, P.black);
      R(c, 385 + i * 12, 45, 8, 27, [P.navy, P.red, P.green, P.yellow, P.navy, P.magenta][i]);
      R(c, 386 + i * 12, 52, 6, 5, P.white);
    }
    // the desk edge shadow line
    R(c, 0, DESK_Y - 2, WALL_W, 4, A(P.tanShade, 0.5));
  });

const DESK_W = 560;
const deskArt = () =>
  cached('ss2-desk', DESK_W, H - DESK_Y, (c) => {
    const h = H - DESK_Y;
    R(c, 0, 0, DESK_W, h, P.brown);
    R(c, 0, 0, DESK_W, 10, P.tan);
    R(c, 0, 0, DESK_W, 1, P.cream);
    R(c, 0, 10, DESK_W, 2, P.tanShade);
    for (let i = 0; i < 26; i++) R(c, (i * 97) % DESK_W, 2 + (i % 4) * 2, 18 + (i % 5) * 6, 1, A(P.tanShade, 0.5));
    dither(c, 0, 12, DESK_W, h - 12, P.tanShade, 'hlines');
    R(c, 0, 12, DESK_W, 1, P.maroon);
  });

/** Things standing on the desk (parallax 1); ox = camera x. */
function deskProps(ctx, ox) {
  const g = DESK_Y + 2;
  // pencil cup
  const px = 22 - ox;
  R(ctx, px, g - 40, 26, 40, P.black);
  R(ctx, px + 1, g - 39, 24, 38, P.purple);
  R(ctx, px + 2, g - 39, 4, 38, P.magenta);
  for (const [dx, h, col] of [[4, 22, P.yellow], [10, 32, P.red], [16, 18, P.green]]) {
    R(ctx, px + dx, g - 40 - h, 6, h, P.black);
    R(ctx, px + dx + 1, g - 39 - h, 4, h, col);
  }
  // stack of floppy friends
  const fx = 370 - ox;
  for (let i = 0; i < 4; i++) {
    const col = [P.red, P.green, P.yellow, P.navy][i];
    R(ctx, fx - 1 + (i % 2), g - 7 - i * 5, 40, 6, P.black);
    R(ctx, fx + (i % 2), g - 6 - i * 5, 38, 4, col);
    R(ctx, fx + 12 + (i % 2), g - 6 - i * 5, 14, 2, P.silver);
  }
  // the yellow mug (it will be back)
  mug(ctx, 462 - ox, g, 0, P.yellow, true, 1);
}

function shotStroll(ctx, lt) {
  const s = 30;
  const camX = round(96 * easeInOut(prog(lt, 0.2, 3.7)));
  const walkP = easeInOut(prog(lt, 0.1, 3.5));
  const wx = 60 + 170 * walkP;
  // parallax: wall at half speed, desk at full speed
  const wox = -round(camX * 0.5);
  ctx.drawImage(wallArt(), wox, 0);
  // a cloud drifting past the window
  ctx.save();
  ctx.beginPath();
  ctx.rect(wox + 50, 28, 124, 78);
  ctx.clip();
  const cx = wox + 40 + ((lt * 7) % 160);
  disc(ctx, cx, 68, 7, P.white);
  disc(ctx, cx + 9, 64, 9, P.white);
  disc(ctx, cx + 19, 69, 6, P.white);
  R(ctx, cx - 4, 69, 28, 5, P.white);
  ctx.restore();
  ctx.drawImage(deskArt(), -camX, DESK_Y);
  // sunlight patch on the desk
  poly(ctx, [[wox + 30, DESK_Y], [wox + 176, DESK_Y], [wox + 206, DESK_Y + 10], [wox + 50, DESK_Y + 10]], A(P.white, 0.2));
  deskProps(ctx, camX);
  // the danger: a shadow sweeps in from above
  const dark = easeOut(prog(lt, 3.25, 3.9));
  const sx = round(wx - camX);
  const gy = DESK_Y + 3;
  if (dark > 0) {
    R(ctx, 0, 0, W, DESK_Y, A(P.black, 0.32 * dark));
    // ...and it is shaped like a horseshoe
    const ro = 52 * dark;
    const ri = 30 * dark;
    const pts = [];
    for (let i = 0; i <= 10; i++) pts.push([sx + cos(PI + (i / 10) * PI) * ro, gy + 2 + sin(PI + (i / 10) * PI) * ro * 0.16]);
    pts.push([sx + ro, gy + 9], [sx + ri, gy + 9]);
    for (let i = 10; i >= 0; i--) pts.push([sx + cos(PI + (i / 10) * PI) * ri, gy + 2 + sin(PI + (i / 10) * PI) * ri * 0.16]);
    pts.push([sx - ri, gy + 9], [sx - ro, gy + 9]);
    poly(ctx, pts, A(P.black, 0.4));
  }
  shadow(ctx, sx, gy, 26, 0.3);
  flopPose();
  // feet never slide: the phase advances with the distance walked
  F.walk = (wx - 60) / (s * 0.3);
  F.walkAmt = clamp(prog(lt, 0.05, 0.4) - prog(lt, 3.15, 3.5), 0, 1);
  F.armL = 0.35 + F.walkAmt * sin(F.walk) * 0.6;
  F.armR = 0.35 - F.walkAmt * sin(F.walk) * 0.6;
  F.elbL = 0.2 + F.walkAmt * max(0, sin(F.walk)) * 0.5;
  F.elbR = 0.2 + F.walkAmt * max(0, -sin(F.walk)) * 0.5;
  F.sq = 0.03 * F.walkAmt * abs(sin(F.walk));
  F.eye = lt % 2.7 < 0.1 ? 0.1 : 1;
  F.lookX = 0.6;
  F.smile = 0.7;
  F.joy = lt < 3.2 ? kf(lt, [[0.6, 0], [0.7, 1], [2.2, 1], [2.3, 0]]) : 0;
  // stop, anticipate (squash), then stretch up looking at the sky
  F.sq += kf(lt, [[3.3, 0], [3.45, 0.12], [3.65, -0.1, easeOut], [3.95, 0, easeOut]]);
  const scared = prog(lt, 3.4, 3.7);
  if (scared > 0) {
    F.lookX = lerp(0.6, 0.2, scared);
    F.lookY = -scared;
    F.big = 1 + 0.3 * scared;
    F.brow = scared;
    F.smile = lerp(0.7, -0.3, scared);
    F.open = 0.45 * scared;
    F.armL = lerp(F.armL, 0.9, scared);
    F.armR = lerp(F.armR, 0.9, scared);
    F.elbL = F.elbR = lerp(0.15, 1.1, scared);
    F.shiver = lt > 3.9 ? lt : 0;
  }
  flop(ctx, sx, gy, s);
  // whistled notes floating up while he walks
  for (let i = 0; i < 3; i++) {
    const p = (lt * 0.8 + i / 3) % 1;
    const born = lt - p / 0.8;
    if (born < 0.2 || born > 2.6) continue;
    const nx = round(sx + 26 + p * 24 + sin(p * 9 + i) * 3);
    const ny = round(gy - 86 - p * 34);
    const col = p > 0.75 ? P.tan : P.navy;
    R(ctx, nx + 2, ny, 1, 6, col);
    R(ctx, nx + 2, ny, 3, 1, col);
    R(ctx, nx, ny + 5, 3, 2, col);
  }
}

// --- shots 2 - 4: the danger montage -------------------------------------------------

function shotMagnet(ctx, lt) {
  const tilt = round(kf(lt, [[0, -10], [0.6, 0, easeOut]]));
  ctx.save();
  ctx.translate(0, tilt);
  dangerBg(ctx, [P.ink, P.purple, P.magenta], lt);
  const cx = 150;
  const my = kf(lt, [[0, -100], [0.32, 18, (x) => easeOutBack(x, 1.6)]]) + (lt > 0.35 ? (floor(lt * 30) % 2) : 0);
  const pull = prog(lt, 0.35, 0.7);
  // field lines pulsing between the poles and the disk
  if (lt > 0.3) {
    for (let k = 0; k < 4; k++) {
      const sd = k < 2 ? -1 : 1;
      const spread = 12 + (k % 2) * 16;
      for (let i = 0; i < 14; i++) {
        const p = i / 14;
        if ((i + floor(lt * 20)) % 3 === 0) continue;
        const x = cx + sd * (16 + sin(p * PI) * spread);
        const y = my + 42 + p * (70 - 16 * pull);
        R(ctx, x, y, 2, 2, A(P.cyan, 0.8));
      }
    }
  }
  flopPose();
  F.lift = round(16 * easeOut(pull) + sin(lt * 9) * 2 * pull);
  F.sq = -0.16 * easeOut(pull) + 0.08 * bump(lt, 0.2, 0.36);
  F.walk = lt * 14;
  F.armL = F.armR = lerp(0.3, 2.7, easeOutBack(prog(lt, 0.25, 0.55)));
  F.elbL = 0.3 + sin(lt * 18) * 0.35;
  F.elbR = 0.3 - sin(lt * 18) * 0.35;
  F.big = 1.35;
  F.brow = 1;
  F.lookY = -1;
  F.smile = -0.4;
  F.open = lerp(0.3, 0.9, pull);
  F.shutter = easeOut(prog(lt, 0.5, 0.75));
  shadow(ctx, cx, 161, round(24 - F.lift * 0.6), 0.35);
  const b = flop(ctx, cx, 161, 26);
  // bits sucked out of the open shutter into the magnet
  if (lt > 0.7) {
    for (let i = 0; i < 12; i++) {
      const p = (lt * 1.5 + i / 12) % 1;
      const x0 = b.x + b.w * 0.66;
      const y0 = b.y;
      const x = round(lerp(x0, cx + (i % 2 ? 16 : -16), p) + sin(p * 7 + i) * 6 * (1 - p));
      const y = round(lerp(y0, my + 38, easeIn(p)));
      text(ctx, i % 3 ? '1' : '0', x, y, { color: p > 0.7 ? P.white : P.yellow });
    }
  }
  magnet(ctx, cx, my, 0, 1.2);
  ctx.restore();
  slam(ctx, 'MAGNETS!', 290, 172, lt - 0.25);
}

function shotSpill(ctx, lt) {
  dangerBg(ctx, [P.maroon, P.darkRed, P.rust], lt);
  const cx = 150;
  const s = 28;
  // the mug slides in, leans back (anticipation), then tips towards Flop
  const mx = kf(lt, [[0, 440], [0.32, 266, easeOut]]);
  const myy = kf(lt, [[0, 40], [0.32, 22, easeOut]]);
  const ang = kf(lt, [[0.28, 0], [0.42, 0.22], [0.78, -1.95, (x) => easeOutBack(x, 1.3)]]);
  const pour = prog(lt, 0.64, 0.86);
  const hit = prog(lt, 0.84, 0.92);
  flopPose();
  F.armL = F.armR = lerp(0.3, 2.45, easeOutBack(prog(lt, 0.42, 0.68)));
  F.elbL = F.elbR = lerp(0.15, 1.3, easeOut(prog(lt, 0.42, 0.68)));
  F.big = hit > 0 ? 1 : 1.3;
  F.brow = 1;
  F.lookY = hit > 0 ? 0 : -0.8;
  F.lookX = hit > 0 ? 0 : 0.8;
  F.squint = hit > 0 ? 1 : 0;
  F.smile = hit > 0 ? -0.8 : -0.3;
  F.open = hit > 0 ? 0.25 : 0.5;
  F.sq = 0.07 * hit + 0.06 * bump(lt, 0.86, 1.05);
  F.stain = easeOut(prog(lt, 0.9, 1.5));
  F.shiver = hit > 0 ? lt : 0;
  shadow(ctx, cx, 161, 24, 0.35);
  const b = flop(ctx, cx, 161, s);
  mug(ctx, mx, myy, ang, P.white, true, 1.5);
  if (pour > 0) {
    const lip = mugLip(mx, myy, ang, 1.5);
    pourStream(ctx, lip[0], lip[1], cx + 6, b.y + 1, pour, lt);
  }
  if (lt > 0.86) {
    // splashes leap off his head in little arcs; drips run down the body
    for (let i = 0; i < 12; i++) {
      const p = (lt * 2.2 + i / 12) % 1;
      const sd = i % 2 ? 1 : -1;
      const vx = sd * (12 + ((i * 7) % 22));
      const x = cx + 6 + vx * p * 2.2;
      const y = b.y + 1 - 40 * p + 84 * p * p;
      disc(ctx, x, y, 2, P.black);
      disc(ctx, x, y, 1, P.brown);
    }
    for (let i = 0; i < 4; i++) {
      const d = round(prog(lt, 0.95 + i * 0.1, 1.6 + i * 0.1) * b.h * 0.7);
      if (d > 0) R(ctx, b.x + 5 + i * round(b.w / 4), b.y + 1, 2, d, P.brown);
    }
  }
  slam(ctx, 'SPILLS!', 290, 172, lt - 0.2);
}

function shotCoaster(ctx, lt) {
  dangerBg(ctx, [P.black, P.ink, P.slate], lt);
  const cx = 160;
  const land = 0.85;
  const s = 30;
  flopPose();
  F.sq = kf(lt, [[land, 0], [land + 0.06, 0.4, easeOut], [land + 0.3, 0.18, easeOut], [land + 0.5, 0.25], [1.8, 0.22]]);
  const top = 161 - round(s * 0.5 * (1 - max(0, F.sq) * 0.5)) - round(2.08 * s * (1 - F.sq));
  const my = lt < land ? kf(lt, [[0, -40], [0.55, top - 22, easeOut], [0.7, top - 26], [land, top, easeIn]]) : top + 1;
  const after = lt >= land;
  F.big = after ? 1 : 1.3;
  F.brow = after ? 0 : 1;
  F.lookY = after ? 0 : -1;
  F.smile = after ? -0.5 : -0.2;
  F.open = after ? 0 : 0.35;
  F.dizzy = after && lt > land + 0.08 ? 1 : 0;
  F.armL = F.armR = after ? lerp(1.5, 1.2, prog(lt, land, land + 0.4)) : 0.5;
  F.elbL = F.elbR = after ? 0 : 0.6;
  shadow(ctx, cx, 161, 28, 0.35);
  const b = flop(ctx, cx, 161, s);
  mug(ctx, cx, my, 0, P.yellow, true, 1.5);
  if (after) {
    // stars orbiting a dizzy head
    for (let i = 0; i < 3; i++) {
      const a = lt * 6 + (i * PI * 2) / 3;
      const x = cx + cos(a) * 34;
      const y = b.y - 12 + sin(a) * 6;
      sparkle(ctx, x, y, sin(a) > 0 ? 3 : 2, P.yellow);
    }
    if (lt < land + 0.5) bigText(ctx, 'BONK!', cx + 56, b.y - 40 - round(easeOut(prog(lt, land, land + 0.4)) * 6), { scale: 2, color: P.yellow, outline: P.black, ow: 2 });
    // steam wisps from the coffee on top
    for (let i = 0; i < 2; i++) {
      const p = (lt * 0.9 + i * 0.5) % 1;
      for (let k = 0; k < 6; k++) R(ctx, cx - 8 + i * 12 + round(sin(k * 0.9 + lt * 4 + i) * 2), my - 62 - k * 3 - round(p * 12), 1, 2, A(P.white, 0.5 * (1 - p)));
    }
  }
  slam(ctx, 'COASTERS!', 290, 172, lt - 0.2);
}

// --- shot 5: Brenda Byte, senior disk adviser (10.2 - 15.0) ------------------------------

const officeArt = () =>
  cached('ss2-office', W, 176, (c) => {
    R(c, 0, 0, W, 176, P.slate);
    for (let x = 0; x < W; x += 48) R(c, x, 0, 1, 176, P.ink);
    dither(c, 0, 0, W, 30, P.ink, 'checker');
    R(c, 0, 30, W, 2, P.ink);
    // window with blinds (soft daylight)
    R(c, 250, 20, 116, 96, P.black);
    R(c, 252, 22, 112, 92, P.fog);
    for (let y = 24; y < 112; y += 5) {
      R(c, 252, y, 112, 3, P.silver);
      R(c, 252, y + 3, 112, 1, P.steel);
    }
    R(c, 306, 22, 2, 92, P.steel);
    // the company plaque
    R(c, 176, 40, 66, 20, P.black);
    R(c, 177, 41, 64, 18, P.navy);
    R(c, 177, 41, 64, 1, P.cyan);
    poly(c, shieldPts(186, 50, 10, 12), P.silver);
    poly(c, shieldPts(186, 50, 6, 8), P.blue);
    text(c, 'SAFE', 194, 43, { color: P.white });
    text(c, 'SECTOR', 194, 51, { color: P.cyan });
    // plant
    R(c, 20, 120, 22, 26, P.black);
    R(c, 21, 121, 20, 24, P.rust);
    for (const [x, y, rr] of [[24, 112, 7], [36, 106, 8], [30, 98, 6], [42, 116, 6], [18, 104, 5]]) {
      disc(c, x, y, rr + 1, P.black);
      disc(c, x, y, rr, P.darkGreen);
      disc(c, x - 1, y - 1, max(1, rr - 3), P.green);
    }
    // a pool of light behind the adviser
    for (let i = 3; i >= 1; i--) oval(c, 120, 90, 54 + i * 14, 46 + i * 10, A(P.steel, 0.12));
  });

const BRENDA = { skin: P.skin, shade: P.skinShade, hair: P.maroon, hairHi: P.brown, suit: P.navy, suitHi: P.blue };

/** Medium shot of Brenda: head centre (cx, cy). talk 0..1, blink 0..1 (1 closed). */
function brenda(ctx, cx, cy, talk, blink, look) {
  const K = P.black;
  cx = round(cx);
  cy = round(cy);
  // hair back (bob)
  oval(ctx, cx, cy - 2, 33, 33, K);
  R(ctx, cx - 33, cy - 2, 67, 34, K);
  oval(ctx, cx, cy - 2, 32, 32, BRENDA.hair);
  R(ctx, cx - 32, cy - 2, 65, 33, BRENDA.hair);
  R(ctx, cx + 30, cy - 8, 1, 30, P.silver);
  // body: blazer, shirt, pin
  const sy = cy + 30;
  poly(ctx, [[cx - 52, H], [cx - 46, sy + 12], [cx - 30, sy], [cx + 30, sy], [cx + 46, sy + 12], [cx + 52, H]], K);
  poly(ctx, [[cx - 50, H], [cx - 44, sy + 13], [cx - 29, sy + 2], [cx + 29, sy + 2], [cx + 44, sy + 13], [cx + 50, H]], BRENDA.suit);
  R(ctx, cx + 43, sy + 13, 1, 40, P.silver);
  poly(ctx, [[cx - 12, sy + 1], [cx + 12, sy + 1], [cx, sy + 24]], P.white);
  poly(ctx, [[cx - 12, sy + 1], [cx - 4, sy + 1], [cx - 1, sy + 22], [cx - 18, sy + 8]], BRENDA.suitHi);
  poly(ctx, [[cx + 12, sy + 1], [cx + 4, sy + 1], [cx + 1, sy + 22], [cx + 18, sy + 8]], BRENDA.suitHi);
  disc(ctx, cx - 26, sy + 20, 3, P.black);
  disc(ctx, cx - 26, sy + 20, 2, P.cyan);
  // neck
  R(ctx, cx - 7, cy + 22, 14, 10, BRENDA.shade);
  // head
  oval(ctx, cx, cy, 25, 27, K);
  oval(ctx, cx, cy, 24, 26, BRENDA.shade);
  oval(ctx, cx - 2, cy - 1, 22, 25, BRENDA.skin);
  // eyes (soft dots with a highlight; the lid closes from the top)
  const lx = round(look * 2);
  for (const sd of [-1, 1]) {
    const ex = cx + sd * 10 + lx;
    const ey = cy + 2;
    if (blink > 0.7) {
      R(ctx, ex - 2, ey + 2, 5, 1, K);
      R(ctx, ex - 3, ey + 1, 1, 1, K);
      R(ctx, ex + 3, ey + 1, 1, 1, K);
    } else {
      const hgt = blink > 0.3 ? 3 : 6;
      R(ctx, ex - 2, ey + (6 - hgt), 5, hgt, K);
      R(ctx, ex - 1, ey - 1 + (6 - hgt), 3, 1, K);
      if (blink <= 0.3) R(ctx, ex - 1, ey + 1, 2, 2, P.white);
    }
    R(ctx, ex - 3 + (sd > 0 ? 1 : 0), ey - 6, 6, 1, BRENDA.hair);
    R(ctx, ex - 4 + (sd > 0 ? 5 : 0), ey - 5, 2, 1, BRENDA.hair);
    R(ctx, ex + sd * 7 - 1, ey + 8, 3, 1, P.pink);
  }
  // nose and mouth: a gentle smile that opens a little while she talks
  R(ctx, cx - 1 + lx, cy + 9, 2, 1, BRENDA.shade);
  const open = round(talk * 3);
  const mx = cx + lx;
  const my = cy + 15;
  if (open <= 0) {
    R(ctx, mx - 3, my, 6, 1, K);
    R(ctx, mx - 4, my - 1, 1, 1, K);
    R(ctx, mx + 3, my - 1, 1, 1, K);
  } else {
    R(ctx, mx - 4, my - 1, 8, 1, K);
    R(ctx, mx - 3, my, 6, open, P.maroon);
    R(ctx, mx - 4, my, 1, open, K);
    R(ctx, mx + 3, my, 1, open, K);
    R(ctx, mx - 3, my + open, 6, 1, K);
    R(ctx, mx - 2, my - 0, 4, 1, P.white);
  }
  // fringe
  poly(ctx, [[cx - 27, cy - 2], [cx - 24, cy - 18], [cx - 12, cy - 27], [cx + 6, cy - 29], [cx + 20, cy - 23], [cx + 27, cy - 8], [cx + 27, cy + 2], [cx + 20, cy - 10], [cx + 6, cy - 14], [cx - 8, cy - 11], [cx - 20, cy - 4]], K);
  poly(ctx, [[cx - 26, cy - 3], [cx - 23, cy - 17], [cx - 12, cy - 26], [cx + 6, cy - 28], [cx + 19, cy - 22], [cx + 26, cy - 8], [cx + 26, cy], [cx + 19, cy - 11], [cx + 6, cy - 15], [cx - 8, cy - 12], [cx - 20, cy - 5]], BRENDA.hair);
  stroke(ctx, [[cx - 16, cy - 20], [cx - 6, cy - 25], [cx + 6, cy - 25]], 2, BRENDA.hairHi, null);
  R(ctx, cx + 20, cy - 22, 4, 1, P.silver);
}

const AGENT_PATS = [2.35, 2.85];
function shotAgent(ctx, lt, info) {
  const pan = round(kf(lt, [[0, 6], [4.8, -6]]));
  ctx.drawImage(officeArt(), pan - 8, 0);
  const talking = info && info.speaking && info.line === 1;
  const talk = talking ? clamp(0.55 + 0.45 * sin(lt * 17) * sin(lt * 5.3 + 1), 0, 1) : 0;
  const ph = lt % 3.3;
  const blink = ph > 3.15 ? bump(ph, 3.15, 3.3) : 0;
  const lookAtFlop = kf(lt, [[1.6, 0], [1.9, 1], [3.5, 1], [3.9, 0]]);
  const cx = 118 + pan;
  const deskY = 182;
  brenda(ctx, cx, 92 + round(sin(lt * 2.1) * 1), talk, blink, lookAtFlop);
  // desk
  R(ctx, 0, deskY - 6, W, 40, P.black);
  R(ctx, 0, deskY - 5, W, 4, P.fog);
  R(ctx, 0, deskY - 5, W, 1, P.white);
  R(ctx, 0, deskY - 1, W, 40, P.navy);
  R(ctx, 0, deskY - 1, W, 1, P.ink);
  // the pat: her hand lifts off the desk, taps Flop twice and settles back
  const reach = kf(lt, [[1.7, 0], [2.2, 1, easeOut], [3.4, 1], [3.9, 0, easeInOut]]);
  let tap = 0;
  for (const at of AGENT_PATS) tap = max(tap, bump(lt, at - 0.12, at + 0.12));
  const flopX = cx + 98;
  // nervous Flop in a blanket; calms after the pats
  const calm = prog(lt, 3.0, 3.4);
  flopPose();
  F.legs = false;
  F.sq = 0.08 * tap;
  F.shiver = calm < 1 ? lt * (1 - calm) : 0;
  F.big = lerp(1.2, 1, calm);
  F.brow = 1 - calm;
  F.smile = lerp(-0.4, 0.8, calm);
  F.joy = calm > 0.6 && lt < 4.3 ? 1 : 0;
  F.eye = tap > 0.5 ? 0.15 : 1;
  F.lookX = lerp(-0.7, 0, calm);
  F.armL = F.armR = 0.1;
  const b = flop(ctx, flopX, deskY - 5, 18);
  const by = b.y + b.h - 13;
  poly(ctx, [[b.x - 5, by], [b.x + b.w + 5, by], [b.x + b.w + 8, deskY - 5], [b.x - 8, deskY - 5]], P.black);
  poly(ctx, [[b.x - 4, by + 1], [b.x + b.w + 4, by + 1], [b.x + b.w + 7, deskY - 6], [b.x - 7, deskY - 6]], P.red);
  for (let i = 0; i < 6; i++) R(ctx, b.x - 2 + i * 8, by + 2, 3, deskY - 8 - by, P.pink);
  if (calm > 0.5) {
    for (let i = 0; i < 2; i++) {
      const p = (lt * 0.7 + i * 0.5) % 1;
      heart(ctx, flopX + 16 + i * 10 + round(sin(p * 6 + i) * 3), b.y - 4 - round(p * 26), p);
    }
  }
  // her arm: shoulder → elbow resting on the desk → hand (drawn over Flop)
  const shx = cx + 42;
  const shy = 136;
  const ex = round(cx + lerp(56, 60, reach));
  const ey = round(lerp(deskY - 6, deskY - 14, reach));
  const hx = round(lerp(cx + 80, flopX, reach));
  const hy = round(lerp(deskY - 8, b.y - 3, reach) + tap * 3);
  stroke(ctx, [[shx, shy], [ex, ey], [hx, hy]], 9, BRENDA.suit, P.black);
  R(ctx, hx - 7, hy - 1, 3, 3, P.white);
  oval(ctx, hx + 2, hy, 7, 5, P.black);
  oval(ctx, hx + 2, hy, 6, 4, BRENDA.skin);
  R(ctx, hx - 1, hy + 2, 7, 1, BRENDA.shade);
  // lower third
  const lp = easeOut(prog(lt, 0.9, 1.3));
  if (lp > 0) {
    const x = round(lerp(-170, 13, lp));
    R(ctx, x, 186, 160, 24, P.black);
    R(ctx, x + 1, 187, 158, 11, P.white);
    R(ctx, x + 1, 198, 158, 11, P.cyan);
    R(ctx, x + 1, 187, 4, 22, P.navy);
    if (lt > 1.2) {
      text(ctx, 'BRENDA BYTE', x + 9, 189, { color: P.navy });
      text(ctx, 'SENIOR DISK ADVISER', x + 9, 200, { color: P.navy });
    }
  }
}

function heart(ctx, x, y, fade) {
  const c = fade > 0.7 ? P.pink : P.red;
  R(ctx, x + 1, y, 2, 1, c);
  R(ctx, x + 4, y, 2, 1, c);
  R(ctx, x, y + 1, 7, 2, c);
  R(ctx, x + 1, y + 3, 5, 1, c);
  R(ctx, x + 2, y + 4, 3, 1, c);
  R(ctx, x + 3, y + 5, 1, 1, c);
}

// --- shot 6: covered! (15.0 - 21.0) --------------------------------------------------

const DEMO_CX = 128;
const DEMO_CY = 116;
const raysArt = () =>
  cached('ss2-rays', W, 168, (c) => {
    R(c, 0, 0, W, 168, P.navy);
    // soft rays: a sparse dither of blue so they glow without shouting
    c.save();
    c.beginPath();
    for (let i = 0; i < 16; i++) {
      const a0 = (i / 16) * PI * 2;
      const a1 = a0 + PI / 16;
      c.moveTo(DEMO_CX, DEMO_CY);
      c.lineTo(DEMO_CX + cos(a0) * 500, DEMO_CY + sin(a0) * 500);
      c.lineTo(DEMO_CX + cos(a1) * 500, DEMO_CY + sin(a1) * 500);
      c.closePath();
    }
    c.clip();
    dither(c, 0, 0, W, 168, P.blue, 'checker');
    c.restore();
    for (let i = 4; i >= 1; i--) disc(c, DEMO_CX, DEMO_CY, 40 + i * 18, A(P.navy, 0.25));
    R(c, 0, 164, W, 4, A(P.black, 0.3));
  });

const STAMPS = [
  { at: 1.45, label: 'MAGNETS', y: 30 },
  { at: 2.9, label: 'SPILLS', y: 76 },
  { at: 5.3, label: 'COASTERS', y: 122 },
];

function stamp(ctx, st, lt) {
  const p = prog(lt, st.at, st.at + 0.14);
  if (p <= 0) return;
  // slams down from "nearer the camera": an inflated frame shrinking onto its mark
  const grow = round((1 - easeIn(p)) * 10);
  const x = 246 - grow;
  const y = st.y - grow + round((1 - p) * -12);
  const w = 120 + grow * 2;
  const h = 34 + grow * 2;
  R(ctx, x, y, w, h, P.black);
  R(ctx, x + 1, y + 1, w - 2, h - 2, P.red);
  R(ctx, x + 4, y + 4, w - 8, h - 8, P.white);
  R(ctx, x + 6, y + 6, w - 12, h - 12, P.red);
  bigText(ctx, 'COVERED!', 306, y + grow + 12, { scale: 2, color: P.white, outline: P.darkRed, align: 'center' });
  if (p < 1) return;
  text(ctx, st.label, 306, st.y - 9, { color: P.white, align: 'center', shadow: P.black });
  // dust puffs where it hit
  const d = prog(lt, st.at + 0.14, st.at + 0.5);
  if (d > 0 && d < 1) {
    for (const sd of [-1, 1]) disc(ctx, 306 + sd * (62 + d * 10), st.y + 32 - d * 4, round(2 + d * 5), A(P.silver, 0.6 * (1 - d)));
  }
}

function shotDemo(ctx, lt) {
  // landing stamps nudge the camera by a pixel
  let jolt = 0;
  for (const st of STAMPS) jolt = max(jolt, lt > st.at + 0.14 && lt < st.at + 0.22 ? 1 : 0);
  ctx.save();
  ctx.translate(0, jolt);
  ctx.drawImage(raysArt(), 0, 0);
  R(ctx, 0, 168, W, 48, P.brown);
  R(ctx, 0, 168, W, 2, P.tan);
  dither(ctx, 0, 172, W, 44, P.tanShade, 'hlines');
  // the bubble inflates, flexes on every hit
  const inflate = easeOutBack(prog(lt, 0.15, 0.55), 2);
  let hitAmt = 0;
  for (const at of [1.0, 2.25, 4.75]) hitAmt = max(hitAmt, bump(lt, at, at + 0.3));
  const press = kf(lt, [[3.85, 0], [4.0, 1, easeOut], [4.65, 1], [4.75, 0, easeOut]]);
  const rr = round(52 * inflate + hitAmt * 3);
  const ry = round(rr * (1 - press * 0.12));
  const rx = round(rr * (1 + press * 0.08));
  const cy = DEMO_CY + round(press * 6);
  flopPose();
  const proud = prog(lt, 0.1, 0.5);
  F.smile = lerp(0.4, 0.9, proud);
  F.lookY = press > 0 ? -0.8 : 0;
  F.lookX = lt > 0.6 && lt < 1.1 ? -0.8 : lt > 1.9 && lt < 2.5 ? 0.8 : 0;
  F.eye = lt % 2.4 > 2.3 ? 0.1 : 1;
  // a little hop after each block
  F.lift = round(8 * (bump(lt, 1.3, 1.6) + bump(lt, 2.6, 2.9) + bump(lt, 5.0, 5.3)));
  F.sq = 0.1 * (bump(lt, 1.2, 1.3) + bump(lt, 1.6, 1.7) + bump(lt, 2.5, 2.6) + bump(lt, 2.9, 3.0));
  F.armL = 0.35 + 0.4 * proud;
  F.elbL = 0.2;
  const thumb = easeOutBack(prog(lt, 5.4, 5.7), 2);
  F.armR = lerp(0.35, 1.6, thumb) + 0.6 * bump(lt, 1.3, 1.6) + 0.6 * bump(lt, 2.6, 2.9);
  F.elbR = lerp(0.2, 1.3, thumb);
  F.thumbR = thumb;
  F.eyeL = lt > 5.6 ? 0.1 : 1;
  F.joy = 0;
  F.open = 0.3 * (bump(lt, 1.3, 1.6) + bump(lt, 2.6, 2.9));
  shadow(ctx, DEMO_CX, 168, 24, 0.35);
  flop(ctx, DEMO_CX, 168, 26);
  // threat 1: a magnet swoops in and bounces off spinning
  if (lt > 0.5 && lt < 1.9) {
    const into = easeIn(prog(lt, 0.5, 1.0));
    const out = easeOut(prog(lt, 1.0, 1.9));
    const x = lt < 1.0 ? lerp(-40, DEMO_CX - 58, into) : lerp(DEMO_CX - 58, -60, out);
    const y = lt < 1.0 ? lerp(-30, DEMO_CY - 50, into) : lerp(DEMO_CY - 50, -70, out);
    magnet(ctx, x, y, 0.7 + (lt > 1.0 ? -(lt - 1.0) * 9 : 0), 1);
  }
  // threat 2: coffee pours from the top right and splashes off the bubble
  if (lt > 1.6 && lt < 3.2) {
    const mx = kf(lt, [[1.6, 300], [1.9, 226, easeOut], [2.8, 226], [3.2, 300, easeIn]]);
    const myy = kf(lt, [[1.6, -40], [1.9, 14, easeOut], [2.8, 14], [3.2, -50, easeIn]]);
    const ang = kf(lt, [[1.85, -0.3], [2.05, -1.9, easeOut], [2.75, -1.9], [2.95, -0.4]]);
    const pour = prog(lt, 2.0, 2.2) - prog(lt, 2.75, 2.9);
    mug(ctx, mx, myy, ang, P.white, true, 1.2);
    if (pour > 0) {
      const lip = mugLip(mx, myy, ang, 1.2);
      const a = -1.0;
      pourStream(ctx, lip[0], lip[1], DEMO_CX + cos(a) * rx, cy + sin(a) * ry, pour, lt);
      // droplets sliding off the bubble surface
      for (let i = 0; i < 8; i++) {
        const p = (lt * 2.5 + i / 8) % 1;
        const b = a + p * 1.3;
        disc(ctx, DEMO_CX + cos(b) * (rx + 2 + p * 8), cy + sin(b) * (ry + 2) + p * p * 26, 2, P.black);
        disc(ctx, DEMO_CX + cos(b) * (rx + 2 + p * 8), cy + sin(b) * (ry + 2) + p * p * 26, 1, P.brown);
      }
    }
  }
  // threat 3: a mug settles on top as a coaster, then gets bounced away
  if (lt > 3.3 && lt < 5.3) {
    const restY = cy - ry - 1;
    const my = lt < 4.75 ? kf(lt, [[3.3, -60], [3.85, restY, easeIn]]) : lerp(restY, -80, easeIn(prog(lt, 4.75, 5.2)));
    mug(ctx, DEMO_CX, my, lt > 4.75 ? (lt - 4.75) * 4 : 0, P.yellow, true, 1.2);
  }
  // the bubble itself (translucent, drawn over Flop)
  if (rr > 2) {
    oval(ctx, DEMO_CX, cy, rx, ry, A(P.cyan, 0.13));
    const edge = hitAmt > 0.3 ? P.white : P.cyan;
    ringOval(ctx, DEMO_CX, cy, rx, ry, edge);
    ringOval(ctx, DEMO_CX, cy, rx - 2, ry - 2, A(P.cyan, 0.5));
    for (let i = 0; i < 6; i++) {
      const a = PI * 1.12 + i * 0.07;
      R(ctx, DEMO_CX + round(cos(a) * (rx - 7)), cy + round(sin(a) * (ry - 7)), 2, 2, A(P.white, 0.8));
    }
    sparkle(ctx, DEMO_CX + round(rx * 0.6), cy - round(ry * 0.75), (floor(lt * 8) % 4), P.white);
  }
  ctx.restore();
  for (const st of STAMPS) stamp(ctx, st, lt);
}

/** One-pixel ellipse outline. */
function ringOval(ctx, cx, cy, rx, ry, c) {
  const n = max(24, round((rx + ry) * 1.6));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2;
    R(ctx, round(cx + cos(a) * rx), round(cy + sin(a) * ry), 1, 1, c);
  }
}

// --- shot 7: end slate (21.0 - 25.2) -----------------------------------------------------

const MARK = () => wordmark('SAFESECTOR', {
  h: 22, pen: 2, square: true, wide: 0.78, gap: 3,
  fill: [P.white, P.white, P.silver, P.fog], outline: [[P.navy, 2], [P.black, 1]], depth: 2, depthColor: P.ink,
});

const shieldPts = (cx, cy, w, h) => [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h * 0.1], [cx + w * 0.3, cy + h * 0.36], [cx, cy + h / 2], [cx - w * 0.3, cy + h * 0.36], [cx - w / 2, cy + h * 0.1]];

/** Shield emblem with a mini Flop face (cached art, 76 x 86). */
const emblem = () =>
  cached('ss2-emblem', 76, 86, (c) => {
    poly(c, shieldPts(38, 43, 74, 84), P.black);
    poly(c, shieldPts(38, 43, 70, 80), P.silver);
    poly(c, shieldPts(38, 43, 62, 72), P.navy);
    poly(c, shieldPts(38, 43, 58, 68), P.blue);
    poly(c, [[9, 9], [38, 9], [38, 76], [24, 66], [9, 50]], A(P.white, 0.12));
    flopPose();
    F.joy = 1;
    F.smile = 0.9;
    F.legs = false;
    F.armL = F.armR = 0;
    flopBody(c, 38, 58, 15);
    for (const [x, y] of [[18, 20], [58, 22], [56, 58]]) {
      c.fillStyle = P.cyan;
      c.fillRect(x, y - 1, 1, 3);
      c.fillRect(x - 1, y, 3, 1);
    }
  });

const slateArt = () =>
  cached('ss2-slate', W, H, (c) => {
    R(c, 0, 0, W, H, P.ink);
    for (let i = 0; i < 18; i++) {
      const a0 = (i / 18) * PI * 2;
      const a1 = a0 + PI / 18;
      poly(c, [[96, 92], [96 + cos(a0) * 500, 92 + sin(a0) * 500], [96 + cos(a1) * 500, 92 + sin(a1) * 500]], P.navy);
    }
    for (let i = 5; i >= 1; i--) disc(c, 96, 92, 30 + i * 16, A(P.ink, 0.2));
  });

function shotSlate(ctx, lt) {
  ctx.drawImage(slateArt(), 0, 0);
  const ep = easeOutBack(prog(lt, 0.05, 0.5), 1.8);
  const ey = round(lerp(-96, 48, ep));
  const em = emblem();
  ctx.drawImage(em, 58, ey);
  glint(ctx, em, 58, ey, (lt - 0.7) / 0.7, { width: 7 });
  const mk = MARK();
  const x0 = drawMark(ctx, mk, 262, 50, { reveal: prog(lt, 0.25, 1.0), drop: 30 });
  glint(ctx, mk.cv, x0 - mk.ox, 50 - mk.oy, (lt - 1.3) / 0.7, { width: 6 });
  const tp = easeOut(prog(lt, 0.9, 1.3));
  if (tp > 0) {
    const half = round(80 * tp);
    R(ctx, 262 - half, 82, half * 2, 1, P.cyan);
    if (lt > 1.1) text(ctx, 'FLOPPY DISK INSURANCE', 262, 88, { color: P.cyan, align: 'center' });
    if (lt > 1.3) text(ctx, 'EST. 1.44 MB AGO', 262, 100, { color: P.fog, align: 'center' });
  }
  if (lt > 1.2) slogan(ctx, 'BECAUSE EVERY KILOBYTE COUNTS.', 192, 146, lt - 1.2, { scale: 2, bg: P.white, edge: P.silver, color: P.navy });
  const up = easeOutBack(prog(lt, 2.0, 2.3), 2);
  if (up > 0) {
    const y = round(lerp(196, 176, up));
    urlPill(ctx, 'SAFESECTOR.DSK', 192, y, { bg: P.navy, border: P.cyan, color: P.white });
  }
  finePrint(ctx, "POLICY VOID IF DISK IS ONLY EVER USED AS A SAVE ICON. DOES NOT COVER DISKS LABELLED 'MISC'.", { lt: lt - 2.3 });
}

const SCENES = [
  { at: 0, draw: shotStroll },
  { at: T_MAGNET, draw: shotMagnet, wipe: 'cut' },
  { at: T_SPILL, draw: shotSpill, wipe: 'push', wd: 0.24 },
  { at: T_COASTER, draw: shotCoaster, wipe: 'push', wd: 0.24 },
  { at: T_AGENT, draw: shotAgent, wipe: 'cut' },
  { at: T_DEMO, draw: shotDemo, wipe: 'diag', wd: 0.45 },
  { at: T_SLATE, draw: shotSlate, wipe: 'iris', wd: 0.5, cx: DEMO_CX, cy: 130 },
];

export default {
  id: 'safesector',
  brand: 'SAFESECTOR',
  duration: DURATION,
  voice: { gender: 'female', lang: 'en-GB', pitch: 1.0, rate: 0.98 },
  script: [
    { at: 0.5, text: "Life is full of dangers... when you're a floppy disk." },
    { at: 10.5, text: "That's why there's SafeSector. Floppy disk insurance." },
    { at: 15.3, text: 'Magnets? Covered. Spills? Covered.' },
    { at: 18.2, text: 'Being used as a coaster? ...Covered.' },
    { at: 21.4, text: 'SafeSector. Because every kilobyte counts.' },
  ],
  // 100 bpm, F major, 42 beats = 25.2 s: a whistled stroll (8 beats), three
  // minor danger stabs (3 + 3 + 3), warm reassurance (8), a stab for every
  // COVERED! (10) and the SAFE-SEC-TOR sting resolving on F with the slate (7).
  tune: {
    bpm: 100,
    wave: 'triangle',
    notes: tune(
      'C5:0.5 A4:0.5 C5:0.5 F5:0.5 E5:0.5 D5:0.5 C5:1 A4:0.5 Bb4:0.5 C5:0.5 D5:0.5 C5:1 R:1',
      'D5:0.5 R:0.5 C#5:0.5 R:0.5 D5:1',
      'Bb4:0.5 R:0.5 A4:0.5 R:0.5 Bb4:1',
      'G4:0.5 R:0.5 F#4:0.5 R:0.5 G4:0.5 A4:0.5',
      'C5:1 A4:1 F4:1 G4:1 A4:1 C5:1 D5:1 C5:1',
      'F5:1 R:0.5 F5:0.5 F5:1 R:1 G5:1 R:0.5 G5:0.5 G5:1 R:1 A5:1 R:1',
      'C5:1 F5:1 A5:1 G5:0.5 E5:0.5 F5:2 R:1',
    ),
    bass: tune(
      'F2:2 C3:2 F2:2 C3:2',
      'D2:1 R:2', 'Bb1:1 R:2', 'G1:1 R:1 A1:1',
      'F2:2 C3:2 Bb2:2 C3:2',
      'F2:2 F2:2 C3:2 C3:2 F2:2',
      'F2:2 C3:1 F2:2 R:2',
    ),
    bassWave: 'sine',
    drums: tune(
      rep('K:1 H:1', 4),
      rep('K:0.5 K:0.5 S:1 R:1', 3),
      rep('K:1 H:1 S:1 H:1', 2),
      rep('K:1 S:1', 5),
      'K:1 H:1 S:1 K:1 R:3',
    ),
  },
  draw(ctx, t, dt, info) {
    play(ctx, dt, info, SCENES);
  },
};
