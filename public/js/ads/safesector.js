// SAFESECTOR — floppy disk insurance, played as a sombre, earnest insurance
// commercial. Soft piano; everyday "disasters" in slow motion under warm
// interior light (a mug tipping towards a stack of disks, a fridge magnet
// sliding down a door, a disk left on a sunny windowsill); a claims adviser at
// her desk; the rescued disk presented in a velvet case like jewellery, whose
// label finally reads "TAXES 1994 — FINAL (2)". The floppy disk is a prop,
// never a character. "Because every kilobyte counts."
//
// Every frame is a pure function of the ad clock. Static sets are baked once
// (dithered light, see cine.js); props and people are drawn with the crisp
// rasteriser so motion stays smooth without anti-aliased mush.
import {
  P, W, H, clamp, lerp, prog, smooth, glide, easeIn, easeOut, easeInOut, track, window01, hash, blinkAt, talkAt,
  mix, bake, prewarm, shadeSteps, ditherSteps, pool, rect, line, begin, pt, fill, ellipse, capsule, film, vignette, vignetteArt, thin, thinWidth,
  tracked, text, smallPrint, figure, bust, arm, wrist,
} from './cine.js';

const { round, floor, sin, cos, abs, min, max, PI, sqrt } = Math;

// --- timing (60 bpm: the piano's chord changes land exactly on the cuts) --------------
const T_SPILL = 4.5;
const T_FRIDGE = 6.75;
const T_SILL = 9.0;
const T_ADVISER = 11.0;
const T_CASE = 16.75;
const T_SLATE = 20.5;
const DURATION = 25.0;

// --- palette ---------------------------------------------------------------------------
const C = {
  disk: mix(P.ink, P.black, 0.35),
  diskL: mix(P.slate, P.ink, 0.3),
  diskE: P.black,
  shutter: P.fog,
  shutterL: P.silver,
  shutterD: P.steel,
  label: P.cream,
  labelD: mix(P.cream, P.tan, 0.45),
  labelInk: P.ink,
  mug: mix(P.silver, P.cream, 0.45),
  mugL: mix(P.white, P.cream, 0.5),
  mugD: mix(P.fog, P.tanShade, 0.25),
  mugDD: mix(P.steel, P.maroon, 0.3),
  coffee: mix(P.maroon, P.black, 0.25),
  coffeeM: mix(P.maroon, P.brown, 0.6),
  coffeeH: mix(P.tan, P.cream, 0.3),
  knit: mix(P.tan, P.fog, 0.45),
  knitL: mix(P.cream, P.tan, 0.35),
  knitM: mix(P.tanShade, P.steel, 0.45),
  knitD: mix(P.brown, P.ink, 0.5),
  brand: P.silver,
};
const SH_MUG = { d: C.mugD, f: 0.34, m: 1, dd: C.mugDD, df: 0.12, l: C.mugL, lf: 0.18, lm: 1, side: 1 };
const SH_KNIT = { d: C.knitM, f: 0.34, m: 1, dd: C.knitD, df: 0.12, l: C.knitL, lf: 0.14, lm: 1, side: 1 };

// --- the floppy disk prop --------------------------------------------------------------

/**
 * A 3.5" disk seen face-on (top-down, or foreshortened when h < w): cut corner,
 * sliding metal shutter, recessed label. lines: up to 2 label lines.
 */
function disk(ctx, x, y, w, h, { lines = null, font = 'micro', lit = 0, curl = 0, stain = 0 } = {}) {
  x = round(x);
  y = round(y);
  w = round(w);
  h = round(h);
  const cut = max(1, round(w * 0.07));
  begin();
  pt(x, y - curl * 0.6);
  pt(x + w - cut, y);
  pt(x + w, y + cut * (h / w));
  pt(x + w, y + h - curl);
  pt(x, y + h);
  fill(ctx, lit ? C.diskL : C.disk, { d: C.diskE, f: 0.04, m: 1, side: 1 });
  rect(ctx, x + 1, y, w - cut - 1, 1, lit ? P.steel : C.diskL); // top edge catches the light
  rect(ctx, x, y + 1, 1, h - 2, C.diskL);
  // shutter
  const sx = x + round(w * 0.27);
  const sw = round(w * 0.46);
  const sh = max(2, round(h * 0.36));
  rect(ctx, sx, y, sw, sh, C.shutter);
  rect(ctx, sx, y, sw, 1, C.shutterL);
  rect(ctx, sx + sw - 1, y, 1, sh, C.shutterD);
  rect(ctx, sx + round(sw * 0.56), y + max(1, round(sh * 0.18)), max(1, round(sw * 0.22)), max(1, round(sh * 0.64)), C.shutterD);
  // write-protect windows
  const hs = max(1, round(w * 0.06));
  rect(ctx, x + round(w * 0.05), y + h - round(h * 0.12) - hs * (h / w), hs, max(1, round(hs * (h / w))), C.diskE);
  // label
  const lx = x + round(w * 0.12);
  const ly = y + round(h * 0.45);
  const lw = round(w * 0.76);
  const lh = h - round(h * 0.45) - max(1, round(h * 0.04));
  rect(ctx, lx, ly, lw, lh, C.label);
  rect(ctx, lx, ly, lw, 1, C.labelD);
  rect(ctx, lx + lw - 1, ly, 1, lh, C.labelD);
  if (stain > 0) {
    ctx.globalAlpha = 0.55 * stain;
    ellipse(ctx, lx + lw * 0.68, ly + lh * 0.55, lw * 0.22 * stain, lh * 0.34 * stain, C.coffeeM);
    ctx.globalAlpha = 1;
  }
  if (lines && lh >= 6) {
    const lead = font === 'micro' ? 7 : 11;
    for (let i = 0; i < lines.length; i++) {
      const ty = ly + 2 + i * lead + (font === 'micro' ? 0 : 2);
      if (ty + (font === 'micro' ? 5 : 7) > ly + lh) break;
      text(ctx, lines[i], lx + 3 + (i & 1), ty, { color: C.labelInk, font });
    }
  }
}

/** The 3 px edge of a disk in a stack (seen from a low angle). */
function diskSide(ctx, x, y, w, t = 3) {
  rect(ctx, x, y, w, t, C.disk);
  rect(ctx, x, y, w, 1, C.diskL);
  rect(ctx, x + w - 2, y, 2, t, C.diskE);
}

// --- the mug prop (rotates about its bottom-right corner) ------------------------------
const RX = new Float64Array(2);
function rot(px, py, lx, ly, a) {
  RX[0] = px + lx * cos(a) - ly * sin(a);
  RX[1] = py + lx * sin(a) + ly * cos(a);
  return RX;
}
function rpt(px, py, lx, ly, a) {
  rot(px, py, lx, ly, a);
  pt(RX[0], RX[1]);
}

function mug(ctx, px, py, w, h, a, { lt = 0 } = {}) {
  const ry = w * 0.16;
  // handle: a thick C on the left side
  for (let i = 0; i < 7; i++) {
    const u0 = (i / 7) * PI;
    const u1 = ((i + 1) / 7) * PI;
    rot(px, py, -w - sin(u0) * h * 0.26, -h * 0.72 + (1 - cos(u0)) * h * 0.24, a);
    const x0 = RX[0];
    const y0 = RX[1];
    rot(px, py, -w - sin(u1) * h * 0.26, -h * 0.72 + (1 - cos(u1)) * h * 0.24, a);
    capsule(ctx, x0, y0, RX[0], RX[1], w * 0.09, w * 0.09, i < 3 ? C.mugL : C.mug);
  }
  // body with a rounded foot
  begin();
  rpt(px, py, -w, -h, a);
  rpt(px, py, 0, -h, a);
  rpt(px, py, 0, -ry * 0.6, a);
  for (let i = 0; i <= 6; i++) rpt(px, py, -w / 2 + (cos((i / 6) * PI) * w) / 2, -ry * 0.6 + sin((i / 6) * PI) * ry * 0.6, a);
  fill(ctx, C.mug, SH_MUG);
  // rim and coffee
  begin();
  for (let i = 0; i < 14; i++) {
    const u = (i / 14) * PI * 2;
    rpt(px, py, -w / 2 + (cos(u) * w) / 2, -h + sin(u) * ry, a);
  }
  fill(ctx, C.mugL);
  begin();
  for (let i = 0; i < 14; i++) {
    const u = (i / 14) * PI * 2;
    rpt(px, py, -w / 2 + cos(u) * (w / 2 - 1.5), -h + 0.5 + sin(u) * (ry - 1), a);
  }
  fill(ctx, C.coffee);
  // a cream glint on the coffee surface, drifting with the tilt
  rot(px, py, -w * 0.62, -h + ry * 0.1, a);
  rect(ctx, RX[0], RX[1], max(2, round(w * 0.16)), 1, C.coffeeM);
}

// --- S1: a desk at dusk, an elbow, a mug ---------------------------------------------------
const S1W = 430;
const DESK1 = 124; // back edge of the desk
const LAMP = [-30, 30];
const deskSet = () =>
  bake('ss-desk-set', S1W, H, function* paint(c) {
    // wall warmed by a desk lamp off-frame left
    const wallRamp = [P.black, mix(P.black, P.maroon, 0.55), P.maroon, mix(P.maroon, P.brown, 0.5), P.brown];
    const wallV = (x, y) => {
      const d = sqrt((x - LAMP[0]) ** 2 + ((y - LAMP[1]) * 1.3) ** 2);
      return 0.08 + 0.78 * clamp(1 - d / 300) ** 1.5 - y * 0.0006;
    };
    yield* shadeSteps(c, 0, 0, S1W, DESK1, wallRamp, wallV);
    // a bookshelf far behind, out of focus: soft blocks a step off the wall tone
    for (const sy of [34, 78, 122]) {
      let bx = 4;
      let k = sy;
      while (bx < 112) {
        const bw = 4 + floor(hash(k) * 4);
        const bh = 20 + floor(hash(k + 3) * 10);
        yield* shadeSteps(c, bx, sy - bh, bw, bh, wallRamp, (x, y) => wallV(x, y) + (hash(k + 7) < 0.5 ? 0.09 : -0.07));
        bx += bw + 1;
        k += 11;
      }
      yield* shadeSteps(c, 0, sy, 118, 3, wallRamp, (x, y) => wallV(x, y) - 0.12);
    }
    // window, dusk outside, behind a soft blind
    const wx = 300;
    yield* shadeSteps(c, wx, 10, 104, 96, [P.ink, mix(P.ink, P.navy, 0.5), P.navy, mix(P.navy, P.steel, 0.45)], (x, y) => (y - 10) / 100);
    begin();
    pt(wx, 106);
    pt(wx, 92);
    pt(wx + 18, 92);
    pt(wx + 18, 86);
    pt(wx + 30, 78);
    pt(wx + 42, 86);
    pt(wx + 42, 90);
    pt(wx + 70, 90);
    pt(wx + 70, 82);
    pt(wx + 104, 82);
    pt(wx + 104, 106);
    fill(c, mix(P.black, P.ink, 0.3));
    for (const [lx, ly] of [[wx + 8, 98], [wx + 50, 96], [wx + 78, 91], [wx + 88, 100]]) rect(c, lx, ly, 2, 1, mix(P.yellow, P.navy, 0.5));
    for (let y = 12; y < 44; y += 4) rect(c, wx, y, 104, 2, mix(P.ink, P.slate, 0.4));
    rect(c, wx - 4, 6, 112, 4, P.black);
    rect(c, wx - 4, 6, 4, 104, P.black);
    rect(c, wx + 104, 6, 4, 104, P.black);
    rect(c, wx + 50, 10, 3, 96, P.black);
    rect(c, wx - 6, 106, 116, 4, mix(P.maroon, P.black, 0.3));
    rect(c, wx - 6, 106, 116, 1, mix(P.tanShade, P.maroon, 0.5));
    // desk: warm wood, lamp pool, grain
    yield* shadeSteps(c, 0, DESK1, S1W, H - DESK1, [mix(P.black, P.maroon, 0.6), P.maroon, mix(P.maroon, P.brown, 0.5), P.brown, P.tanShade, mix(P.tanShade, P.tan, 0.45)], (x, y) => {
      const dx = (x - 120) / 260;
      const dy = (y - 150) / 70;
      const lamp = clamp(1 - sqrt(dx * dx + dy * dy)) ** 1.3;
      const grain = 0.05 * sin(y * 1.9 + sin(x * 0.021 + y * 0.3) * 2.6);
      return 0.2 + lamp * 0.72 + grain + (y - DESK1) * 0.0012;
    });
    // the window's cool reflection in the varnish, fading out in a dither
    yield* ditherSteps(c, 286, DESK1 + 1, 132, H - DESK1 - 1, [mix(P.navy, P.maroon, 0.55), mix(P.navy, P.brown, 0.45)], (x, y) => 0.55 * sin(clamp((x - 286) / 132) * PI) * clamp(1 - (y - DESK1) / 70), (x, y) => (y & 1 ? 0 : 1));
    rect(c, 0, DESK1, S1W, 1, mix(P.tanShade, P.tan, 0.6));
    rect(c, 0, DESK1 + 1, S1W, 1, mix(P.maroon, P.black, 0.4));
  });

function steam(ctx, x, y, lt, a = 1) {
  ctx.fillStyle = P.silver;
  for (let k = 0; k < 2; k++) {
    for (let i = 0; i < 26; i++) {
      const u = i / 26;
      const sx = x + k * 8 + sin(i * 0.38 - lt * 1.2 + k * 2.1) * (1 + u * 4);
      const sy = y - i * 1.7 - ((lt * 3) % 1.7);
      ctx.globalAlpha = (1 - u) * u * 1.6 * 0.5 * a;
      ctx.fillRect(round(sx), round(sy), 1, 1);
    }
  }
  ctx.globalAlpha = 1;
}

function stack(ctx, x, baseY, w, n, top = {}, t = 3) {
  for (let i = 0; i < n; i++) {
    const off = round((hash(i + 4) - 0.5) * 4);
    diskSide(ctx, x + off, baseY - (i + 1) * t, w, t);
  }
  const off = round((hash(n + 4) - 0.5) * 4);
  disk(ctx, x + off, baseY - n * t - round(w * 0.27), w, round(w * 0.27), top);
}

function shadowBlob(ctx, cx, cy, rx, ry, a = 0.45) {
  ctx.globalAlpha = a;
  ellipse(ctx, cx, cy, rx, ry, P.black);
  ctx.globalAlpha = a * 0.6;
  ellipse(ctx, cx + 3, cy, rx + 4, ry + 1, P.black);
  ctx.globalAlpha = 1;
}

/** A bent arm in an oatmeal knit sleeve: shoulder off-frame top left, elbow leading. */
function elbowArm(ctx, ex, ey) {
  const sx = ex - 110;
  const sy = ey - 150;
  const fx = ex - 150;
  const fy = ey + 52;
  // forearm resting on the desk, running back out of frame towards the camera
  capsule(ctx, fx, fy, ex - 6, ey + 6, 17, 13, C.knit, SH_KNIT);
  // cuff ribbing where the forearm leaves the frame
  ctx.fillStyle = C.knitM;
  for (let i = 0; i < 5; i++) line(ctx, fx + 22 + i * 3, fy - 14 + i * 0, fx + 30 + i * 3, fy + 12, C.knitM);
  // upper arm coming down from the shoulder, in front of the forearm at the joint
  capsule(ctx, sx, sy, ex, ey, 19, 15, C.knit, SH_KNIT);
  // knit ribs follow the sleeve; a fold at the inside of the elbow
  const dx = ex - sx;
  const dy = ey - sy;
  const len = sqrt(dx * dx + dy * dy);
  const nx = dy / len;
  const ny = -dx / len;
  ctx.fillStyle = mix(C.knit, C.knitM, 0.6);
  for (let i = 1; i < 18; i++) {
    const u = i / 18;
    for (let k = -2; k <= 1; k++) ctx.fillRect(round(sx + dx * u + nx * k * 5), round(sy + dy * u + ny * k * 5), 1, 2);
  }
  line(ctx, ex - 20, ey + 2, ex - 8, ey + 10, C.knitD);
  line(ctx, ex - 22, ey + 6, ex - 12, ey + 12, C.knitM);
}

function shotDesk(ctx, lt) {
  const camX = track(lt, [[0, 0], [4.5, 36, 'smooth']]);
  // the wall is far (slow parallax); the desk plane moves with the props
  ctx.drawImage(deskSet(), round(camX * 0.35), 0, W, DESK1, 0, 0, W, DESK1);
  ctx.drawImage(deskSet(), round(camX), DESK1, W, H - DESK1, 0, DESK1, W, H - DESK1);
  ctx.save();
  ctx.translate(-round(camX), 0);
  const baseY = 182;
  const ang = track(lt, [[3.3, 0], [4.5, 0.32, 'in']]);
  // shadows (key light from the left: they fall right)
  shadowBlob(ctx, 262, baseY + 1, 52, 4);
  shadowBlob(ctx, 178 + ang * 14, baseY + 1, 20, 3, 0.4);
  stack(ctx, 214, baseY, 96, 5, { lines: ['TAXES 94'], font: 'micro' }, 4);
  // the elbow arrives from the left and nudges the mug's handle
  const ex = track(lt, [[2.0, 10], [3.3, 137, 'out'], [4.5, 145, 'in']]);
  mug(ctx, 196, baseY, 34, 40, ang);
  if (lt > 2.0) elbowArm(ctx, ex, 150);
  if (ang < 0.05) steam(ctx, 176, baseY - 46, lt, 1 - prog(lt, 2.8, 3.3));
  ctx.restore();
  vignette(ctx, 0.6);
}

// --- S2: slow motion — the coffee leaves the mug -----------------------------------------
const spillSet = () =>
  bake('ss-spill', W, H, function* paint(c) {
    yield* shadeSteps(c, 0, 0, W, 170, [P.black, mix(P.black, P.maroon, 0.6), P.maroon, mix(P.maroon, P.brown, 0.45)], (x, y) => {
      const d = sqrt(((x - 90) / 260) ** 2 + ((y - 60) / 170) ** 2);
      return clamp(0.9 - d) * 0.95;
    });
    // the window, far out of focus: a cool soft column
    yield* ditherSteps(c, 286, 0, 98, 170, [mix(P.ink, P.maroon, 0.4), mix(P.ink, P.navy, 0.5)], (x, y) => 0.8 * sin(clamp((x - 286) / 98) * PI) * clamp(1.2 - y / 170), (x, y) => clamp(0.3 + 0.7 * sin(((x - 286) / 98) * PI)));
    yield* shadeSteps(c, 0, 170, W, H - 170, [mix(P.black, P.maroon, 0.6), P.maroon, P.brown, P.tanShade], (x, y) => {
      const d = sqrt(((x - 120) / 300) ** 2 + ((y - 176) / 50) ** 2);
      return 0.25 + clamp(1 - d) * 0.7 + 0.05 * sin(y * 2.3 + sin(x * 0.03) * 2);
    });
    rect(c, 0, 170, W, 1, mix(P.tanShade, P.tan, 0.5));
  });

const DROPS = Array.from({ length: 8 }, (_, i) => ({
  t0: 0.25 + hash(i * 3.1) * 1.3,
  vx: 18 + hash(i * 7.7) * 34,
  vy: -14 + hash(i * 5.3) * 18,
  r: 0.8 + hash(i * 2.9) * 1.4,
}));

function shotSpill(ctx, lt) {
  ctx.drawImage(spillSet(), 0, 0);
  // the hero disk in the foreground, the stack's top label catching the lamp
  const px = 186;
  const py = 171;
  for (let i = 0; i < 3; i++) diskSide(ctx, 222, 216 - (i + 1) * 6, 190, 6);
  disk(ctx, 222, 150, 190, 50, { stain: smooth((lt - 1.8) / 0.45) * 0.7 });
  // handwriting on the label, out of focus
  ctx.fillStyle = mix(C.label, C.labelInk, 0.45);
  ctx.fillRect(250, 178, 46, 2);
  ctx.fillRect(250, 186, 34, 2);
  const a = track(lt, [[0, 0.42], [2.25, 1.02, 'out']]);
  // contact shadow where the rim of the foot still touches the desk
  ctx.globalAlpha = 0.5;
  ellipse(ctx, px - 4, py + 1, 14, 2, P.black);
  ctx.globalAlpha = 1;
  mug(ctx, px, py, 46, 55, a);
  // the stream: a ballistic ribbon from the lip, slowed down twenty times
  const pour = lt - 0.25;
  if (pour > 0) {
    rot(px, py, 0, -55, a);
    const lx = RX[0];
    const ly = RX[1] + 2;
    const tauF = min(1.25, pour * 0.75);
    const G = 150;
    let x0 = lx;
    let y0 = ly;
    const n = 26;
    for (let i = 1; i <= n; i++) {
      const tau = (i / n) * tauF;
      const x1 = lx + 46 * tau;
      const y1 = ly - 4 * tau + 0.5 * G * tau * tau;
      const wdt = lerp(3.4, 1.6, i / n);
      if (i < n - 2) {
        capsule(ctx, x0 + 0.6, y0 + 0.8, x1 + 0.6, y1 + 0.8, wdt, wdt, C.coffee);
        capsule(ctx, x0, y0, x1, y1, wdt * 0.75, wdt * 0.75, C.coffeeM);
        if (i % 3 === 1) rect(ctx, x0, y0 - wdt * 0.5, 2, 1, C.coffeeH);
      } else if ((i & 1) === 0) {
        ellipse(ctx, x1, y1, 1.6, 2, C.coffeeM);
        rect(ctx, x1 - 1, y1 - 1, 1, 1, C.coffeeH);
      }
      x0 = x1;
      y0 = y1;
    }
    // loose droplets catching the lamp
    for (const d of DROPS) {
      const tau = (pour - d.t0) * 0.6;
      if (tau <= 0) continue;
      const x = lx + d.vx * tau;
      const y = ly + d.vy * tau + 0.5 * G * tau * tau;
      if (y > 200) continue;
      ellipse(ctx, x, y, d.r, d.r * 1.15, C.coffeeM);
      rect(ctx, x - 1, y - 1, 1, 1, C.coffeeH);
    }
  }
  vignette(ctx, 0.65);
}

// --- S3: a fridge at night; a magnet slides down the door ---------------------------------
const FRIDGE_H = 250;
const fridgeSet = () =>
  bake('ss-fridge', W, FRIDGE_H, function* paint(c) {
    // enamel door under cool night light from the upper left, with a soft sheen band
    yield* shadeSteps(c, 0, 0, 352, FRIDGE_H, [P.ink, P.slate, mix(P.slate, P.steel, 0.5), P.steel, mix(P.steel, P.fog, 0.55), P.fog], (x, y) => {
      const key = clamp(1 - sqrt(((x + 40) / 520) ** 2 + ((y + 30) / 420) ** 2));
      const sheen = 0.12 * Math.exp(-(((x - 74) / 22) ** 2));
      return 0.12 + key * 0.8 + sheen;
    });
    // door edge, the gap and the dark kitchen beyond
    rect(c, 344, 0, 8, FRIDGE_H, P.slate);
    rect(c, 350, 0, 2, FRIDGE_H, P.ink);
    rect(c, 352, 0, 32, FRIDGE_H, P.black);
    yield* shadeSteps(c, 356, 0, 28, FRIDGE_H, [P.black, mix(P.black, P.ink, 0.6)], (x, y) => 0.3 + 0.3 * sin(y * 0.02));
    // handle
    rect(c, 326, 30, 6, 200, P.steel);
    rect(c, 326, 30, 2, 200, P.silver);
    rect(c, 331, 30, 1, 200, P.slate);
    rect(c, 324, 34, 10, 4, P.slate);
    rect(c, 324, 222, 10, 4, P.slate);
    // shopping list (held by a small magnet), slightly askew
    const lx = 46;
    const ly = 36;
    begin();
    pt(lx, ly + 2);
    pt(lx + 52, ly);
    pt(lx + 55, ly + 70);
    pt(lx + 3, ly + 72);
    fill(c, mix(P.cream, P.fog, 0.35), { d: mix(P.cream, P.steel, 0.5), f: 0.06, m: 1, side: 1 });
    const items = ['MILK', 'BREAD', 'COFFEE', 'BACK UP', 'THE DISKS'];
    items.forEach((s, i) => text(c, s, lx + 7, ly + 12 + i * 9, { color: mix(P.ink, P.navy, 0.3), font: 'micro' }));
    rect(c, lx + 6, ly + 55, 34, 1, mix(P.ink, P.navy, 0.3));
    ellipse(c, lx + 27, ly + 3, 5, 5, P.black);
    rect(c, lx + 24, ly + 1, 3, 1, P.steel);
    // a holiday photo
    const fx = 236;
    const fy = 40;
    begin();
    pt(fx, fy);
    pt(fx + 50, fy + 3);
    pt(fx + 48, fy + 46);
    pt(fx - 2, fy + 43);
    fill(c, mix(P.silver, P.fog, 0.3));
    yield* shadeSteps(c, fx + 4, fy + 5, 40, 26, [P.navy, mix(P.navy, P.steel, 0.5), mix(P.steel, P.fog, 0.4)], (x, y) => (y - fy) / 30);
    rect(c, fx + 4, fy + 25, 40, 6, mix(P.tan, P.fog, 0.5));
    rect(c, fx + 18, fy + 14, 3, 11, P.ink);
    rect(c, fx + 23, fy + 15, 3, 10, P.slate);
    ellipse(c, fx + 25, fy + 1, 4, 4, P.black);
    // the disk, taped to the door
    disk(c, 150, 118, 58, 60, { lines: ['WEDDING 96', 'ORIGINAL'], font: 'micro' });
    c.globalAlpha = 0.45;
    rect(c, 144, 114, 14, 6, P.silver);
    rect(c, 200, 114, 14, 6, P.silver);
    c.globalAlpha = 1;
    // magnetic word tiles (static)
    for (const [s, x, y] of [['ALWAYS', 92, 196], ['AND', 132, 200], ['FOREVER', 154, 194]]) {
      const tw = text(c, s, -999, -999, { font: 'micro' }) + 6;
      rect(c, x + 1, y + 1, tw, 9, mix(P.slate, P.ink, 0.4));
      rect(c, x, y, tw, 9, mix(P.silver, P.fog, 0.2));
      text(c, s, x + 3, y + 2, { color: P.black, font: 'micro' });
    }
  });

function shotFridge(ctx, lt) {
  const camY = track(lt, [[0, 0], [2.25, 30, 'smooth']]);
  ctx.drawImage(fridgeSet(), 0, -round(camY));
  // the magnet drifts down the door towards the disk, ever so slowly
  const my = track(lt, [[0, 66], [2.25, 104, 'in']]) - camY;
  const mx = 177 + track(lt, [[0, 0], [2.25, 3]]);
  ctx.globalAlpha = 0.35;
  ellipse(ctx, mx + 3, my + 4, 9, 8, P.black);
  ctx.globalAlpha = 1;
  ellipse(ctx, mx, my, 9, 9, P.black, { d: P.black, f: 0.2, m: 1, l: P.ink, lf: 0.3, side: 1 });
  ellipse(ctx, mx - 1, my - 1, 6, 6, mix(P.black, P.ink, 0.5));
  rect(ctx, mx - 5, my - 6, 4, 1, P.steel);
  rect(ctx, mx - 6, my - 5, 1, 2, P.slate);
  vignette(ctx, 0.7);
}

// --- S4: a sunny windowsill --------------------------------------------------------------
const SILL = 104; // top of the sill surface
const sillSet = () =>
  bake('ss-sill', 420, H, function* paint(c) {
    // over-exposed garden through the glass
    yield* shadeSteps(c, 0, 0, 420, SILL + 2, [mix(P.tan, P.cream, 0.3), mix(P.cream, P.tan, 0.2), P.cream, mix(P.cream, P.white, 0.5)], (x, y) => {
      const tree = 0.3 * clamp(1 - sqrt(((x - 70) / 80) ** 2 + ((y - 30) / 50) ** 2)) + 0.25 * clamp(1 - sqrt(((x - 340) / 90) ** 2 + ((y - 60) / 40) ** 2));
      return 0.95 - tree - y * 0.002;
    });
    rect(c, 0, 0, 420, 4, mix(P.cream, P.tan, 0.3));
    rect(c, 238, 0, 8, SILL, mix(P.cream, P.tan, 0.25));
    rect(c, 244, 0, 2, SILL, mix(P.tan, P.tanShade, 0.4));
    // sill top (foreshortened) with the sun's shaft across it, front edge in shade
    yield* shadeSteps(c, 0, SILL, 420, 70, [mix(P.tan, P.cream, 0.25), mix(P.cream, P.tan, 0.15), P.cream, mix(P.cream, P.white, 0.6)], (x, y) => {
      const beam = clamp(1 - abs((x - 90 - (y - SILL) * 1.3) / 150));
      return 0.22 + smooth(beam) * 0.78;
    });
    rect(c, 0, SILL, 420, 1, mix(P.tan, P.tanShade, 0.4));
    rect(c, 0, SILL + 70, 420, 10, mix(P.tan, P.tanShade, 0.4));
    rect(c, 0, SILL + 70, 420, 1, mix(P.cream, P.tan, 0.2));
    yield* shadeSteps(c, 0, SILL + 80, 420, H - SILL - 80, [mix(P.brown, P.tanShade, 0.4), mix(P.tanShade, P.tan, 0.3), mix(P.tan, P.cream, 0.2)], (x, y) => {
      const beam = clamp(1 - abs((x - 10 - (y - SILL) * 1.3) / 120));
      return 0.12 + beam * 0.45 - (y - SILL - 80) * 0.004;
    });
    // a terracotta pot with a succulent, lit from the left, cropped by the frame
    const pc = mix(P.rust, P.tanShade, 0.45);
    begin();
    pt(330, 80);
    pt(392, 80);
    pt(384, 136);
    pt(338, 136);
    fill(c, pc, { d: mix(pc, P.brown, 0.5), f: 0.35, m: 1, dd: mix(pc, P.black, 0.45), df: 0.12, side: 1 });
    rect(c, 326, 72, 70, 9, mix(pc, P.tan, 0.3));
    rect(c, 326, 80, 70, 1, mix(pc, P.brown, 0.5));
    const leaf = mix(P.darkGreen, P.tanShade, 0.25);
    for (let i = 0; i < 9; i++) {
      const a = -PI / 2 + (i - 4) * 0.34;
      const l = 30 + (i % 3) * 6;
      capsule(c, 361, 74, 361 + cos(a) * l, 74 + sin(a) * l * 1.1, 5, 2, leaf, { d: mix(leaf, P.black, 0.35), f: 0.4, m: 1, l: mix(leaf, P.cream, 0.35), lf: 0.25, side: 1 });
    }
    c.globalAlpha = 0.25;
    ellipse(c, 372, 138, 40, 4, P.brown);
    c.globalAlpha = 1;
  });

const MOTES = Array.from({ length: 11 }, (_, i) => ({ x: hash(i * 1.7) * 220 + 20, y: hash(i * 4.1) * 100, s: 0.6 + hash(i * 9.2) }));

function shotSill(ctx, lt) {
  const camX = track(lt, [[0, 0], [2.0, 18, 'smooth']]);
  ctx.drawImage(sillSet(), -round(camX), 0);
  ctx.save();
  ctx.translate(-round(camX), 0);
  // the disk lies in the sun; its corners begin to lift
  const curl = track(lt, [[0, 0], [2.0, 3, 'in']]);
  ctx.globalAlpha = 0.28;
  ellipse(ctx, 206, 158, 82, 5, P.tanShade);
  ctx.globalAlpha = 1;
  disk(ctx, 118, 120, 156, 36, { lit: 1, curl });
  // dust drifting in the beam
  ctx.fillStyle = P.white;
  for (const m of MOTES) {
    const x = m.x + lt * 6 * m.s + sin(lt * 0.9 + m.y) * 3;
    const y = m.y - lt * 3 * m.s;
    const inBeam = clamp(1 - abs((x - 100 - (y - 20) * 1.3) / 110));
    ctx.globalAlpha = 0.6 * inBeam;
    ctx.fillRect(round(x), round(y), 1, 1);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  // heat shimmer just above the disk: rows of the frame nudged sideways
  const cv = ctx.canvas;
  for (let y = 92; y < 121; y++) {
    const off = round(sin(y * 0.8 + lt * 6) * 1.3 * ((y - 92) / 29));
    if (off) ctx.drawImage(cv, 110, y, 172, 1, 110 + off, y, 172, 1);
  }
  vignette(ctx, 0.45);
}

// --- S5: the adviser ---------------------------------------------------------------------
const officeSet = () =>
  bake('ss-office', 400, H, function* paint(c) {
    // panelled wall, cool navy-ink, warmed near the banker's lamp
    yield* shadeSteps(c, 0, 0, 400, 152, [P.black, mix(P.black, P.ink, 0.6), P.ink, mix(P.ink, P.slate, 0.5), P.slate], (x, y) => {
      const d = sqrt(((x - 96) / 230) ** 2 + ((y - 120) / 130) ** 2);
      return 0.15 + clamp(1 - d) * 0.6 - y * 0.0008;
    });
    rect(c, 0, 112, 400, 1, mix(P.steel, P.tanShade, 0.35));
    rect(c, 0, 113, 400, 2, P.black);
    for (let x = 6; x < 400; x += 64) {
      rect(c, x, 120, 56, 1, P.black);
      rect(c, x, 120, 1, 32, P.black);
      rect(c, x + 1, 121, 54, 1, mix(P.slate, P.ink, 0.5));
    }
    // binders on a shelf, right of frame (soft, darker than the face)
    for (const sy of [52, 104]) {
      rect(c, 286, sy, 114, 3, mix(P.maroon, P.black, 0.5));
      rect(c, 286, sy, 114, 1, mix(P.steel, P.maroon, 0.5));
      let bx = 290;
      let k = sy;
      while (bx < 398) {
        const col = [mix(P.navy, P.black, 0.6), mix(P.darkRed, P.black, 0.62), mix(P.slate, P.black, 0.45)][floor(hash(k) * 3)];
        rect(c, bx, sy - 30, 7, 30, col);
        rect(c, bx + 2, sy - 22, 3, 6, mix(P.cream, P.slate, 0.7));
        rect(c, bx + 3, sy - 8, 1, 3, P.black);
        bx += 8;
        k += 3;
      }
    }
    // framed certificate on the left
    rect(c, 36, 30, 46, 58, mix(P.maroon, P.black, 0.35));
    rect(c, 39, 33, 40, 52, mix(P.cream, P.slate, 0.35));
    for (let i = 0; i < 5; i++) rect(c, 45, 44 + i * 6, i === 0 ? 28 : 24 - (i & 1) * 6, 1, mix(P.slate, P.cream, 0.4));
    ellipse(c, 70, 76, 3, 3, mix(P.darkRed, P.maroon, 0.4));
    // desk: dark mahogany with the lamp's pool
    yield* shadeSteps(c, 0, 152, 400, H - 152, [P.black, mix(P.black, P.maroon, 0.7), P.maroon, mix(P.maroon, P.brown, 0.5), P.brown, P.tanShade], (x, y) => {
      const d = sqrt(((x - 96) / 150) ** 2 + ((y - 160) / 34) ** 2);
      return 0.22 + clamp(1 - d) ** 1.2 * 0.75 + 0.04 * sin(y * 2.1 + sin(x * 0.02) * 2);
    });
    rect(c, 0, 152, 400, 1, mix(P.tanShade, P.maroon, 0.3));
    rect(c, 0, 178, 400, 1, mix(P.tanShade, P.maroon, 0.5));
    yield* shadeSteps(c, 0, 179, 400, H - 179, [P.black, mix(P.black, P.maroon, 0.6), P.maroon], (x, y) => 0.6 - (y - 179) * 0.012 + clamp(1 - abs(x - 96) / 120) * 0.3);
  });
// desk props (transparent layer, moves with the desk)
const officeProps = () =>
  bake('ss-office-props', 400, H, function* paint(c) {
    // banker's lamp: brass stem, green glass shade
    const bl = mix(P.darkGreen, P.green, 0.25);
    rect(c, 88, 120, 3, 36, mix(P.tanShade, P.yellow, 0.25));
    rect(c, 88, 120, 1, 36, mix(P.yellow, P.cream, 0.4));
    ellipse(c, 90, 158, 14, 3, mix(P.tanShade, P.yellow, 0.2), { d: P.brown, f: 0.3, m: 1, side: 1 });
    begin();
    pt(70, 120);
    pt(76, 108);
    pt(106, 108);
    pt(112, 120);
    fill(c, bl, { d: mix(bl, P.black, 0.45), f: 0.3, m: 1, l: mix(bl, P.cream, 0.3), lf: 0.2, side: 1 });
    rect(c, 76, 108, 30, 1, mix(bl, P.cream, 0.45));
    rect(c, 70, 120, 42, 1, mix(P.yellow, P.cream, 0.55));
    // nameplate on the desk, leather folder, pen
    rect(c, 246, 170, 40, 6, mix(P.maroon, P.brown, 0.3));
    rect(c, 246, 170, 40, 1, mix(P.brown, P.tanShade, 0.5));
    line(c, 150, 172, 172, 168, P.black);
    line(c, 150, 171, 160, 169, mix(P.yellow, P.tanShade, 0.4));
  });
const lampPool = () => pool('ss-lamp-pool', 90, 64, P.yellow, 5, 0.22);

const MARGARET = figure({
  hh: 36,
  hair: 'bob',
  garment: 'cardigan',
  glasses: mix(P.tanShade, P.maroon, 0.3),
  shoulders: 0.86,
  pal: {
    skin: mix(P.skin, P.tan, 0.2),
    skinD: mix(P.skinShade, P.tanShade, 0.4),
    hair: P.fog,
    hairD: P.steel,
    hairL: P.silver,
    top: mix(P.navy, P.ink, 0.35),
    topD: P.black,
    topL: mix(P.navy, P.steel, 0.4),
    shirt: mix(P.cream, P.fog, 0.2),
    shirtD: mix(P.fog, P.tan, 0.3),
    lip: mix(P.skinShade, P.darkRed, 0.35),
  },
});

function shotAdviser(ctx, lt, info) {
  const camX = track(lt, [[0, 0], [5.75, 12, 'smooth']]);
  ctx.drawImage(officeSet(), round(camX * 0.4), 0, W, 152, 0, 0, W, 152);
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(lampPool(), 6 - round(camX * 0.4), 96);
  ctx.globalCompositeOperation = 'source-over';
  const m = MARGARET;
  const ox = -round(camX);
  m.x = 228 + ox;
  m.y = 42 + round(sin(lt * 1.4) * 0.4);
  m.nod = round(window01(lt, 1.5, 1.85, 0.12) + window01(lt, 3.3, 3.6, 0.1));
  m.turn = track(lt, [[0, 0.06], [1.4, 0.06], [2.0, -0.08], [3.6, -0.08], [4.4, 0.04]]);
  m.blink = blinkAt(lt + 11, 3);
  m.look = 0;
  m.smile = lt > 4.2 ? 0.6 : 0.3;
  m.mouth = talkAt(lt, info.speaking && info.line === 4);
  // right hand (screen left) rises into an open, reassuring gesture, then
  // settles on the disk; the left hand stays at rest
  const g = track(lt, [[1.3, 0], [2.0, 1, 'inOut'], [2.9, 1], [3.7, 0, 'inOut']]);
  m.armL.a = lerp(0.2, 0.4, g);
  m.armL.e = lerp(1.1, 2.4, g);
  m.armL.fore = lerp(0.82, 0.78, g);
  m.armL.hand = g > 0.55 ? 'open' : 'rest';
  m.armR.a = 0.2;
  m.armR.e = 1.1;
  m.armR.fore = 0.82;
  m.armR.hand = 'rest';
  bust(ctx, m, 160);
  // desk and its props in front of her body
  ctx.drawImage(officeSet(), round(camX), 152, W, H - 152, 0, 152, W, H - 152);
  ctx.drawImage(officeProps(), ox, 0);
  // the disk on the desk, slid gently towards us
  const slide = track(lt, [[4.0, 0], [4.9, 3, 'inOut']]);
  disk(ctx, 210 + ox, 162 + slide, 36, 12, {});
  arm(ctx, m, 1);
  arm(ctx, m, -1);
  // lower third: name and role
  const la = window01(lt, 0.9, 5.1, 0.4);
  if (la > 0) {
    ctx.globalAlpha = la;
    rect(ctx, 24, 193, round(2 + 120 * smooth((lt - 0.9) / 0.5)), 1, C.brand);
    ctx.globalAlpha = la * smooth((lt - 1.1) / 0.4);
    tracked(ctx, 'MARGARET HALE', 24, 181, { color: P.white, track: 1 });
    tracked(ctx, 'SENIOR CLAIMS ADVISER  ·  31 YEARS', 24, 198, { color: P.fog, font: 'micro', track: 1 });
    ctx.globalAlpha = 1;
  }
  vignette(ctx, 0.5);
}

// --- S6: the restored disk, presented like jewellery -------------------------------------
const CASE_H = 250;
const caseSet = () =>
  bake('ss-case', W, CASE_H, function* paint(c) {
    // dark wood under a soft top light
    yield* shadeSteps(c, 0, 0, W, CASE_H, [P.black, mix(P.black, P.maroon, 0.6), P.maroon, mix(P.maroon, P.brown, 0.4)], (x, y) => {
      const d = sqrt(((x - 192) / 230) ** 2 + ((y - 130) / 160) ** 2);
      return clamp(1 - d) * 0.9 + 0.03 * sin(y * 0.9 + sin(x * 0.03) * 2);
    });
    // the open box: leather rim, satin lid, velvet bed
    rect(c, 62, 4, 260, 246, mix(P.black, P.maroon, 0.3));
    rect(c, 62, 4, 260, 1, mix(P.maroon, P.tanShade, 0.4));
    yield* shadeSteps(c, 68, 10, 248, 60, [mix(P.maroon, P.black, 0.45), mix(P.maroon, P.black, 0.15), P.maroon, mix(P.maroon, P.darkRed, 0.45)], (x, y) => {
      const fold = 0.06 * sin(((x - 68) / 248) * PI * 9);
      return 0.2 + 0.45 * sin(((y - 10) / 60) * PI) * (1 - abs(x - 192) / 200) + fold;
    });
    rect(c, 62, 70, 260, 6, mix(P.black, P.maroon, 0.5));
    rect(c, 62, 76, 260, 1, mix(P.maroon, P.tanShade, 0.4));
    thin(c, 'SAFESECTOR', 192, 26, { color: mix(P.yellow, P.tanShade, 0.45), track: 3, align: 'center' });
    tracked(c, 'RESTORATION SERVICE', 192, 42, { color: mix(P.yellow, P.tanShade, 0.55), font: 'micro', track: 2, align: 'center' });
    yield* shadeSteps(c, 68, 80, 248, 166, [mix(P.black, P.maroon, 0.5), mix(P.maroon, P.black, 0.2), P.maroon, mix(P.maroon, P.darkRed, 0.4)], (x, y) => {
      const d = sqrt(((x - 192) / 150) ** 2 + ((y - 150) / 110) ** 2);
      return clamp(1 - d) * 0.85 + 0.1;
    });
    // recessed cradle around the disk
    rect(c, 132, 96, 124, 128, mix(P.black, P.maroon, 0.55));
    rect(c, 132, 223, 124, 1, mix(P.maroon, P.darkRed, 0.5));
    rect(c, 255, 96, 1, 128, mix(P.maroon, P.darkRed, 0.5));
  });

/** A white cotton glove holding an edge (fingers up and to the left), with a dark cuff. */
function glove(ctx, x, y) {
  const g = mix(P.silver, P.white, 0.35);
  const sh = { d: P.fog, f: 0.35, m: 1, dd: P.steel, df: 0.12, side: 1 };
  capsule(ctx, x + 26, y + 30, x + 80, y + 80, 15, 17, mix(P.navy, P.ink, 0.5), { d: P.ink, f: 0.3, m: 1, dd: P.black, df: 0.1, side: 1 });
  rect(ctx, x + 14, y + 22, 22, 3, P.silver);
  begin();
  pt(x - 2, y + 2);
  pt(x + 20, y - 4);
  pt(x + 30, y + 18);
  pt(x + 24, y + 30);
  pt(x + 2, y + 26);
  fill(ctx, g, sh);
  // fingers over the edge of the disk, thumb underneath
  for (let i = 0; i < 4; i++) capsule(ctx, x + 2 + i * 5, y + 2 - i, x - 9 + i * 5, y - 12 - i * 2, 2.8, 2.4, g, sh);
  capsule(ctx, x + 2, y + 22, x - 10, y + 16, 3, 2.6, mix(P.fog, P.silver, 0.4));
}

function shotCase(ctx, lt) {
  const camY = track(lt, [[0, 0], [3.75, 28, 'smooth']]);
  ctx.drawImage(caseSet(), 0, -round(camY));
  ctx.save();
  ctx.translate(0, -round(camY));
  disk(ctx, 138, 100, 112, 118, { lines: ['TAXES 1994', 'FINAL (2)'], font: 'body' });
  // a slow specular sweep across the shutter
  const sw = prog(lt, 1.2, 2.6);
  if (sw > 0 && sw < 1) {
    ctx.globalAlpha = 0.55 * sin(sw * PI);
    const x = 168 + sw * 60;
    for (let k = 0; k < 4; k++) rect(ctx, x + k - 20 * 0, 100 + k * 0, 2, 42, P.white);
    ctx.globalAlpha = 1;
  }
  // the gloved hand withdraws
  const gx = track(lt, [[0.8, 252], [2.3, 330, 'inOut']]);
  const gy = track(lt, [[0.8, 206], [2.3, 270, 'inOut']]);
  if (gy < 266) glove(ctx, gx, gy);
  ctx.restore();
  vignette(ctx, 0.55);
}

// --- S7: end slate -----------------------------------------------------------------------
const slateBg = () =>
  bake('ss-slate', W, H, function* paint(c) {
    yield* shadeSteps(c, 0, 0, W, H, [P.black, mix(P.black, P.ink, 0.6), P.ink, mix(P.ink, P.navy, 0.45)], (x, y) => {
      const d = sqrt(((x - 192) / 260) ** 2 + ((y - 70) / 170) ** 2);
      return clamp(1 - d) * 0.95;
    });
  });

function shield(ctx, cx, y, a) {
  ctx.globalAlpha = a;
  const s = C.brand;
  const w = 13;
  // outline of a heater shield
  line(ctx, cx - w, y, cx + w, y, s);
  line(ctx, cx - w, y, cx - w, y + 12, s);
  line(ctx, cx + w, y, cx + w, y + 12, s);
  line(ctx, cx - w, y + 12, cx, y + 24, s);
  line(ctx, cx + w, y + 12, cx, y + 24, s);
  // inside: a disk's shutter notch, drawn as two hairlines
  rect(ctx, cx - 5, y + 4, 10, 1, s);
  rect(ctx, cx - 5, y + 4, 1, 6, s);
  rect(ctx, cx + 4, y + 4, 1, 6, s);
  rect(ctx, cx - 7, y + 13, 14, 1, P.steel);
  ctx.globalAlpha = 1;
}

function shotSlate(ctx, lt) {
  ctx.drawImage(slateBg(), 0, 0);
  const a = smooth(lt / 0.8);
  shield(ctx, 192, 42 - round(2 * (1 - a)), a);
  ctx.globalAlpha = smooth((lt - 0.3) / 0.7);
  thin(ctx, 'SAFESECTOR', 192, 78, { color: P.white, track: 2, scale: 2, align: 'center' });
  ctx.globalAlpha = 1;
  const rw = round(70 * smooth((lt - 0.7) / 0.7));
  if (rw > 0) rect(ctx, 192 - rw, 104, rw * 2, 1, P.steel);
  ctx.globalAlpha = smooth((lt - 0.9) / 0.6);
  tracked(ctx, 'FLOPPY DISK INSURANCE  ·  SINCE 1987', 192, 110, { color: P.fog, font: 'micro', track: 1, align: 'center' });
  ctx.globalAlpha = smooth((lt - 1.3) / 0.6);
  tracked(ctx, 'BECAUSE EVERY KILOBYTE COUNTS.', 192, 134, { color: P.silver, track: 1, align: 'center' });
  ctx.globalAlpha = smooth((lt - 1.9) / 0.6);
  tracked(ctx, '0800 144 1440  ·  SAFESECTOR.DSK', 192, 152, { color: P.steel, font: 'micro', track: 1, align: 'center' });
  ctx.globalAlpha = 1;
  smallPrint(
    ctx,
    "COVER EXCLUDES DISKS USED AS COASTERS, DRINKS MATS OR 'SAVE' ICONS. CLAIMS LIMITED TO 1.44 MB PER INCIDENT. THE VALUE OF YOUR DATA MAY GO DOWN AS WELL AS UP.",
    194,
    { color: P.steel, a: smooth((lt - 2.2) / 0.8) },
  );
}

const SHOTS = [
  { at: 0, draw: shotDesk, tr: 'black', td: 0.7 },
  { at: T_SPILL, draw: shotSpill },
  { at: T_FRIDGE, draw: shotFridge },
  { at: T_SILL, draw: shotSill },
  { at: T_ADVISER, draw: shotAdviser, tr: 'dissolve', td: 0.6 },
  { at: T_CASE, draw: shotCase, tr: 'dissolve', td: 0.7 },
  { at: T_SLATE, draw: shotSlate, tr: 'dip', td: 0.8 },
];

// Soft piano (a decaying triangle), a sine pad and a low sine bass. 60 bpm, so
// one beat is one second and every chord change sits on a cut.
const PIANO = { wave: 'triangle', a: 0.004, d: 1.7, s: 0, r: 0.9, vib: false };
const PAD = { wave: 'sine', a: 0.45, d: 1.2, s: 0.8, r: 1.4, vib: [6, 4.2, 0.4], legato: 1 };

// Everything this spot bakes, in shot order: prewarmed in idle-time slices so
// no cut ever waits for a bake (see cine.js prewarm).
const WARM = [deskSet, spillSet, fridgeSet, sillSet, officeSet, officeProps, lampPool, caseSet, slateBg, () => vignetteArt(0.6), () => vignetteArt(0.65), () => vignetteArt(0.7), () => vignetteArt(0.45), () => vignetteArt(0.5), () => vignetteArt(0.55)];
prewarm(WARM, 6000);

export default {
  id: 'safesector',
  brand: 'SAFESECTOR',
  duration: DURATION,
  voice: { gender: 'female', lang: 'en-GB', pitch: 0.95, rate: 0.9 },
  script: [
    { at: 0.5, text: 'Life can change in an instant.' },
    { at: 4.75, text: 'A careless elbow.' },
    { at: 7.0, text: 'A fridge magnet.' },
    { at: 9.25, text: 'A sunny windowsill.' },
    { at: 11.3, text: "We've protected floppy disks since nineteen eighty-seven." },
    { at: 17.0, text: 'Because some things are irreplaceable.' },
    { at: 20.9, text: 'SafeSector. Because every kilobyte counts.' },
  ],
  // B minor to D major in 24.5 beats: Bm(add9) | Gmaj7 | Em7 | Asus4 | D D/F# G | Em7 A | D.
  tune: {
    bpm: 60,
    room: 0.55,
    echo: { beats: 0.75, feedback: 0.22 },
    fadeOut: 1.6,
    tracks: [
      {
        kind: 'lead',
        inst: PIANO,
        gain: 1,
        notes: 'R:1 F#5:1.5@0.7 E5:0.5@0.5 D5:1.5@0.6 R:0.25 C#5:0.5@0.5 D5:0.5@0.55 B4:1@0.5 R:0.25 B4:0.5@0.5 A4:0.5@0.45 G4:1@0.5 R:0.25 A4:0.5@0.5 B4:0.25@0.45 C#5:1@0.55 D5:1.5@0.45 R:0.5 F#5:1@0.4 E5:0.5@0.35 D5:1@0.4 A4:1.25@0.35 B4:1@0.5 D5:0.5@0.5 C#5:0.5@0.45 E5:1@0.55 R:0.75 F#5:1@0.7 E5:0.5@0.55 D5:2.5@0.6 R:2',
      },
      {
        kind: 'harmony',
        inst: PIANO,
        gain: 0.75,
        notes: 'B2:0.5@0.6 F#3:0.5@0.45 B3:0.5@0.45 C#4:0.5@0.4 D4:0.5@0.45 C#4:0.5@0.4 B3:0.5@0.4 F#3:0.5@0.4 D3:0.5@0.4 G2:0.5@0.55 D3:0.5@0.4 B3:0.5@0.4 F#4:0.75@0.4 E2:0.5@0.55 B2:0.5@0.4 G3:0.5@0.4 D4:0.75@0.4 A2:0.5@0.55 E3:0.5@0.4 D4:0.5@0.4 C#4:0.5@0.4 D3:0.5@0.5 A3:0.5@0.35 D4:0.5@0.35 F#4:0.5@0.35 F#2:0.5@0.45 A3:0.5@0.35 D4:0.5@0.35 A3:0.5@0.35 G2:0.5@0.45 D3:0.5@0.35 B3:0.75@0.35 E2:0.5@0.5 B2:0.5@0.4 G3:0.5@0.4 D4:0.5@0.4 A2:0.5@0.5 E3:0.5@0.4 C#4:0.5@0.4 R:0.25 D2:0.5@0.6 A2:0.5@0.45 F#3:0.5@0.45 A3:0.5@0.45 D4:2@0.5 R:2',
      },
      {
        kind: 'harmony',
        inst: PAD,
        gain: 0.22,
        notes: 'B2+F#3+D4:4.5@0.5 G2+D3+B3:2.25@0.5 E3+G3+B3:2.25@0.5 A2+D3+E3:2@0.5 D3+F#3+A3:4@0.45 G2+B2+D3:1.75@0.45 E3+G3+B3:2@0.5 A2+C#3+E3:1.75@0.5 D3+F#3+A3:4@0.55 R:2',
      },
      { kind: 'bass', inst: 'sine', gain: 0.5, notes: 'B1:4.5 G1:2.25 E2:2.25 A1:2 D2:4 G1:1.75 E2:2 A1:1.75 D2:4 R:2' },
    ],
  },
  draw(ctx, t, dt, info) {
    prewarm(WARM);
    film(ctx, dt, info, SHOTS);
  },
};
