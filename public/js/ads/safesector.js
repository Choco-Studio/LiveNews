// SAFESECTOR — floppy disk insurance, played as a sombre, earnest insurance
// commercial. Soft piano; three everyday "disasters" in slow motion under warm
// interior light (an elbow tips a mug over a stack of disks, a fridge magnet
// slides onto a taped-up wedding disk, a disk warps on a sunny windowsill);
// then a claims adviser at her desk says the one sincere line; the end slate is
// the policy schedule itself, whose insured item reads "TAXES 1994 - FINAL (2)".
// The floppy disk is a prop, never a character. "Because every kilobyte counts."
//
// Every frame is a pure function of the ad clock. Static sets and the knitted
// sleeve are baked once (cine.js); props move with the crisp rasteriser; the
// adviser is drawn by the channel's own presenter rig (cine.js castDraw), with
// a cine.js figure as the fallback if that rig is unavailable.
import {
  P, W, H, clamp, lerp, prog, smooth, track, window01, hash, blinkAt, talkAt, mix, bake, prewarm, lazy, shadeSteps, ditherSteps, soften,
  pool, rect, line, begin, pt, fill, ellipse, capsule, film, vignette, vignetteArt, thin, tracked, text, smallPrint, figure, bust, arm,
  castInit, castDraw, bayer, rgb, canvas,
} from './cine.js';

const { round, floor, sin, cos, abs, min, max, PI, sqrt, atan2, hypot } = Math;

// --- timing (60 bpm: one beat a second; the piano's chord changes sit on the cuts) ----------
const T_SPILL = 4.2;
const T_FRIDGE = 8.2;
const T_SILL = 11.8;
const T_ADVISER = 15.4;
const T_SLATE = 20.0;
const DURATION = 25.0;
const ADVISER_LINE = 'Because some things are irreplaceable.';
const ADVISER_AT = 15.9;

// --- palette ---------------------------------------------------------------------------------
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
  band: mix(P.navy, P.slate, 0.4),
  coffee: mix(P.maroon, P.black, 0.25),
  coffeeM: mix(P.maroon, P.brown, 0.6),
  coffeeH: mix(P.tan, P.cream, 0.3),
  knitDD: mix(P.brown, P.ink, 0.55),
  knitD: mix(P.tanShade, P.ink, 0.35),
  knitM: mix(P.tanShade, P.fog, 0.5),
  knit: mix(P.tan, P.fog, 0.45),
  knitL: mix(P.cream, P.tan, 0.3),
  skin: P.skin,
  skinL: mix(P.skin, P.cream, 0.45),
  skinD: P.skinShade,
  skinDD: mix(P.skinShade, P.brown, 0.55),
  navy: mix(P.navy, P.ink, 0.35),
  paper: mix(P.cream, P.white, 0.25),
  paperD: mix(P.cream, P.tan, 0.35),
};
const SH_MUG = { d: C.mugD, f: 0.34, m: 1, dd: C.mugDD, df: 0.12, l: C.mugL, lf: 0.18, lm: 1, side: 1 };
const SH_DISK = { d: C.diskE, f: 0.04, m: 1, side: 1 };
const SH_MAGNET = { d: P.black, f: 0.3, m: 1, l: mix(P.slate, P.ink, 0.4), lf: 0.25, side: 1 };
const SH_HANDLE = { d: C.mugD, f: 0.4, m: 1, side: 1 };

// --- the floppy disk prop -------------------------------------------------------------------

/**
 * A 3.5" disk seen face-on (top-down, or foreshortened when h < w): cut corner,
 * sliding metal shutter, recessed label. lines: up to 2 label lines.
 */
function disk(ctx, x, y, w, h, { lines = null, font = 'micro', lit = 0 } = {}) {
  x = round(x);
  y = round(y);
  w = round(w);
  h = round(h);
  const cut = max(1, round(w * 0.07));
  begin();
  pt(x, y);
  pt(x + w - cut, y);
  pt(x + w, y + cut * (h / w));
  pt(x + w, y + h);
  pt(x, y + h);
  fill(ctx, lit ? C.diskL : C.disk, SH_DISK);
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
  // write-protect window
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
  if (lines && lh >= 6) {
    const lead = font === 'micro' ? 7 : 11;
    for (let i = 0; i < lines.length; i++) {
      const ty = ly + 2 + i * lead + (font === 'micro' ? 0 : 2);
      if (ty + (font === 'micro' ? 5 : 7) > ly + lh) break;
      text(ctx, lines[i], lx + 3 + (i & 1), ty, { color: C.labelInk, font });
    }
  }
}

/** The edge of a disk in a stack (seen from a low angle). */
function diskSide(ctx, x, y, w, t = 3) {
  rect(ctx, x, y, w, t, C.disk);
  rect(ctx, x, y, w, 1, C.diskL);
  rect(ctx, x + w - 2, y, 2, t, C.diskE);
}

// --- the mug: rotates about the rim of its foot on the side it tips towards ------------------
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

/**
 * A glazed mug seen from a low angle. (px, py) is the bottom-right rim of its
 * foot, the point it pivots on when tipped to the right by `a` radians, so that
 * rim stays on the desk until the mug lies on its side. `coffee` 0..1 is how
 * full it looks at the mouth.
 */
function mug(ctx, px, py, w, h, a, coffee = 1, rimK = 0.12) {
  const ry = max(1.5, w * rimK);
  // handle: a thick C on the left side, drawn first (behind the body)
  for (let i = 0; i < 7; i++) {
    const u0 = (i / 7) * PI;
    const u1 = ((i + 1) / 7) * PI;
    rot(px, py, -w - sin(u0) * h * 0.26, -h * 0.76 + (1 - cos(u0)) * h * 0.25, a);
    const x0 = RX[0];
    const y0 = RX[1];
    rot(px, py, -w - sin(u1) * h * 0.26, -h * 0.76 + (1 - cos(u1)) * h * 0.25, a);
    capsule(ctx, x0, y0, RX[0], RX[1], w * 0.085, w * 0.085, i < 3 ? C.mugL : C.mug, i < 3 ? null : SH_HANDLE);
  }
  // body: straight walls, a softly rounded foot that ends exactly at the pivot
  begin();
  rpt(px, py, -w, -h, a);
  rpt(px, py, 0, -h, a);
  rpt(px, py, 0, -1.5, a);
  rpt(px, py, -0.5, -0.4, a);
  rpt(px, py, -1.5, 0, a);
  rpt(px, py, -w + 1.5, 0, a);
  rpt(px, py, -w + 0.5, -0.4, a);
  rpt(px, py, -w, -1.5, a);
  fill(ctx, C.mug, SH_MUG);
  // a thin navy band round the glaze (follows the tilt)
  begin();
  rpt(px, py, -w + 0.5, -h * 0.3, a);
  rpt(px, py, -0.5, -h * 0.3, a);
  rpt(px, py, -0.5, -h * 0.3 + max(1, h * 0.05), a);
  rpt(px, py, -w + 0.5, -h * 0.3 + max(1, h * 0.05), a);
  fill(ctx, C.band, { d: mix(C.band, P.black, 0.4), f: 0.3, m: 1, side: 1 });
  // the rim (an ellipse in the mug's frame) and the coffee inside it
  begin();
  for (let i = 0; i < 16; i++) {
    const u = (i / 16) * PI * 2;
    rpt(px, py, -w / 2 + (cos(u) * w) / 2, -h + sin(u) * ry, a);
  }
  fill(ctx, C.mugL);
  // the dark inside of the mouth (empty or not, the glaze inside is in shadow)
  begin();
  for (let i = 0; i < 16; i++) {
    const u = (i / 16) * PI * 2;
    rpt(px, py, -w / 2 + cos(u) * (w / 2 - 1.5), -h + 0.6 + sin(u) * (ry - 1), a);
  }
  fill(ctx, C.mugDD);
  if (coffee > 0.05) {
    begin();
    for (let i = 0; i < 16; i++) {
      const u = (i / 16) * PI * 2;
      rpt(px, py, -w / 2 + cos(u) * (w / 2 - 1.5) * coffee, -h + 0.6 + sin(u) * (ry - 1) * coffee, a);
    }
    fill(ctx, C.coffee);
    rot(px, py, -w * 0.62, -h + ry * 0.1, a);
    rect(ctx, RX[0], RX[1], max(2, round(w * 0.16 * coffee)), 1, C.coffeeM);
  }
}

function steam(ctx, x, y, lt, a = 1) {
  if (a <= 0) return;
  ctx.fillStyle = P.silver;
  for (let k = 0; k < 2; k++) {
    for (let i = 0; i < 26; i++) {
      const u = i / 26;
      const sx = x + k * 7 + sin(i * 0.38 - lt * 1.2 + k * 2.1) * (1 + u * 4);
      const sy = y - i * 1.7 - ((lt * 3) % 1.7);
      ctx.globalAlpha = (1 - u) * u * 1.6 * 0.5 * a;
      ctx.fillRect(round(sx), round(sy), 1, 1);
    }
  }
  ctx.globalAlpha = 1;
}

function shadowBlob(ctx, cx, cy, rx, ry, a = 0.45) {
  ctx.globalAlpha = a;
  ellipse(ctx, cx, cy, rx, ry, P.black);
  ctx.globalAlpha = a * 0.6;
  ellipse(ctx, cx + 3, cy, rx + 4, ry + 1, P.black);
  ctx.globalAlpha = 1;
}

// --- a hand, palm down, fingers relaxed (baked into sprites) ----------------------------------
/**
 * A relaxed hand lying palm down: wrist at (x, y), fingers pointing along
 * angle `ang` (radians, 0 = right), hand length s px. Knuckles, separated
 * fingers with dark creases, a thumb tucked towards the camera, nail glints.
 */
function handDown(c, x, y, s, ang) {
  const ux = cos(ang);
  const uy = sin(ang);
  const nx = -uy;
  const ny = ux;
  const P2 = (a, b) => pt(x + ux * a + nx * b, y + uy * a + ny * b);
  // thumb (towards the camera side, +n), behind the palm
  const tb = s * 0.08;
  capsule(c, x + ux * s * 0.2 + nx * s * 0.26, y + uy * s * 0.2 + ny * s * 0.26, x + ux * s * 0.55 + nx * s * 0.36, y + uy * s * 0.55 + ny * s * 0.36, tb + 1, tb + 0.6, C.skinDD);
  capsule(c, x + ux * s * 0.2 + nx * s * 0.26, y + uy * s * 0.2 + ny * s * 0.26, x + ux * s * 0.55 + nx * s * 0.36, y + uy * s * 0.55 + ny * s * 0.36, tb, tb - 0.3, C.skin, { d: C.skinD, f: 0.35, m: 1, side: 1 });
  // palm: from the wrist to the knuckle line, slightly wider at the knuckles
  begin();
  P2(-1, -s * 0.24);
  P2(s * 0.52, -s * 0.3);
  P2(s * 0.56, s * 0.04);
  P2(s * 0.5, s * 0.3);
  P2(-1, s * 0.25);
  fill(c, C.skinDD);
  begin();
  P2(0, -s * 0.22);
  P2(s * 0.5, -s * 0.28);
  P2(s * 0.53, s * 0.04);
  P2(s * 0.48, s * 0.28);
  P2(0, s * 0.23);
  fill(c, C.skin, { d: C.skinD, f: 0.3, m: 1, l: C.skinL, lf: 0.2, lm: 1, side: 1 });
  // four fingers, far to near, each with a dark outline so they read separately
  const fr = s * 0.075;
  for (let k = 0; k < 4; k++) {
    const off = -s * 0.21 + k * s * 0.15;
    const len = s * (0.9 + (k === 1 ? 0.06 : k === 0 ? -0.02 : k === 3 ? -0.1 : 0.03));
    const bx = x + ux * s * 0.48 + nx * off;
    const by = y + uy * s * 0.48 + ny * off;
    const tx = x + ux * len + nx * (off * 1.12);
    const ty = y + uy * len + ny * (off * 1.12);
    capsule(c, bx, by, tx, ty, fr + 0.9, fr + 0.6, C.skinDD);
    capsule(c, bx, by, tx, ty, fr, fr - 0.25, C.skin, { d: C.skinD, f: 0.32, m: 1, side: 1 });
    // knuckle glint, middle joint crease, nail
    rect(c, bx + ux * 1 - 0.5, by + uy * 1 - 0.5, 1, 1, C.skinL);
    rect(c, lerp(bx, tx, 0.55), lerp(by, ty, 0.55), 1, 1, C.skinD);
    rect(c, tx - ux * 1.2, ty - uy * 1.2, 1, 1, mix(C.skinL, P.white, 0.3));
  }
  // tendons / wrist crease
  line(c, x + ux * 2 + nx * -s * 0.16, y + uy * 2 + ny * -s * 0.16, x + ux * 2 + nx * s * 0.14, y + uy * 2 + ny * s * 0.14, C.skinD);
}

// --- the knitted sleeve (baked once; the arm moves rigidly) ----------------------------------
// Elbow at (EX, EY) of the sprite; shoulder off the top; forearm resting along the desk.
const ARM_W = 300;
const ARM_H = 230;
const EX = 262;
const EY = 168;
const SHO = [EX - 40, -70];
const WRIST = [158, 190];
const KNIT = [C.knitDD, C.knitD, C.knitM, C.knit, C.knitL];
const LIGHT = [-0.5, -0.62, 0.6];
const armArt = lazy(() =>
  bake('ss-arm', ARM_W, ARM_H, function* paint(c) {
    const img = c.createImageData(ARM_W, ARM_H);
    const d = img.data;
    const segs = [
      [SHO[0], SHO[1], EX, EY, 21, 15.5], // upper arm (nearer the camera at the top)
      [EX, EY, WRIST[0], WRIST[1], 14, 10.5], // forearm
    ];
    const ll = hypot(LIGHT[0], LIGHT[1], LIGHT[2]);
    const inside = new Uint8Array(ARM_W * ARM_H);
    for (let y = 0; y < ARM_H; y++) {
      for (let x = 0; x < ARM_W; x++) {
        let best = -1;
        let bq = 0;
        let bs = 0;
        let bu = 0;
        let both = 0;
        for (let k = 0; k < 2; k++) {
          const [ax, ay, bx, by, r0, r1] = segs[k];
          const dx = bx - ax;
          const dy = by - ay;
          const L2 = dx * dx + dy * dy;
          let u = ((x + 0.5 - ax) * dx + (y + 0.5 - ay) * dy) / L2;
          u = clamp(u);
          const r = lerp(r0, r1, u) + (k === 1 && u > 0.93 ? 1.6 : 0); // the cuff is a little fuller
          const qx = x + 0.5 - (ax + dx * u);
          const qy = y + 0.5 - (ay + dy * u);
          const dist = hypot(qx, qy);
          if (dist > r) continue;
          const len = sqrt(L2);
          const nx = -dy / len;
          const ny = dx / len;
          const s = qx * nx + qy * ny;
          both++;
          // the forearm lies in front of the upper arm near the joint
          if (best < 0 || k === 1) {
            best = k;
            bq = s / r;
            bs = s;
            bu = u;
          }
        }
        if (best < 0) continue;
        inside[y * ARM_W + x] = 1;
        const [ax, ay, bx, by] = segs[best];
        const len = hypot(bx - ax, by - ay);
        const nx = -(by - ay) / len;
        const ny = (bx - ax) / len;
        const q = clamp(bq, -1, 1);
        const nz = sqrt(max(0, 1 - q * q));
        const lam = max(0, (nx * q * LIGHT[0] + ny * q * LIGHT[1] + nz * LIGHT[2]) / ll);
        let v = 0.18 + lam * 0.82;
        // knit ribs run along the sleeve: crest highlights, valley shadows
        const cuff = best === 1 && bu > 0.93;
        const period = cuff ? 2 : 3;
        const rib = ((floor(bs + 40) % period) + period) % period;
        if (rib === 0) v -= cuff ? 0.2 : 0.12;
        else if (rib === 1 && !cuff) v += 0.05;
        // a purl row every few px across the ribs (the stitch rhythm)
        const along = bu * len;
        if (!cuff && floor(along) % 4 === 0 && rib !== 0) v -= 0.06;
        // the inside of the bent elbow folds; a couple of soft wrinkles above it
        if (both > 1) v -= 0.18;
        if (best === 0 && bu > 0.72 && sin(along * 0.42 + bs * 0.5) > 0.86) v -= 0.16;
        if (best === 1 && bu < 0.16 && sin(along * 0.6 - bs * 0.4) > 0.84) v -= 0.14;
        if (cuff && bu < 0.945) v -= 0.25; // the turn-back of the cuff
        const i = clamp(round(v * 4), 0, 4);
        const [r, g, b] = rgb(KNIT[i]);
        const o = (y * ARM_W + x) * 4;
        d[o] = r;
        d[o + 1] = g;
        d[o + 2] = b;
        d[o + 3] = 255;
      }
      if ((y & 7) === 7) yield;
    }
    // selective outline: the edge turned away from the light darkens one step
    const [dr, dg, db] = rgb(C.knitDD);
    for (let y = 1; y < ARM_H - 1; y++) {
      for (let x = 1; x < ARM_W - 1; x++) {
        const i = y * ARM_W + x;
        if (!inside[i]) continue;
        if (inside[i + 1] && inside[i + ARM_W]) continue;
        const o = i * 4;
        d[o] = dr;
        d[o + 1] = dg;
        d[o + 2] = db;
      }
    }
    c.putImageData(img, 0, 0);
    // the hand, palm down on the desk beyond the cuff
    handDown(c, WRIST[0] + 1, WRIST[1] + 1, 26, atan2(WRIST[1] - EY, WRIST[0] - EX) + 0.06);
  }));

// --- S1: a desk at dusk, an elbow, a mug -----------------------------------------------------
const S1W = 430;
const DESK1 = 124; // back edge of the desk
const LAMP = [-30, 30];
const deskSet = lazy(() =>
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
    // a framed print on the wall between shelf and window, catching the lamp
    rect(c, 170, 34, 44, 54, mix(P.brown, P.black, 0.45));
    yield* shadeSteps(c, 174, 38, 36, 46, [mix(P.maroon, P.slate, 0.4), mix(P.slate, P.brown, 0.45), mix(P.fog, P.brown, 0.5)], (x, y) => 0.3 + 0.4 * sin(((x - 174) / 36) * PI) * (1 - (y - 38) / 60));
    rect(c, 170, 34, 44, 1, mix(P.tanShade, P.brown, 0.4));
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
    // desk dressing: a pen pot with pens, a letter tray, a sheet of notes
    rect(c, 352, 112, 16, 22, mix(P.slate, P.ink, 0.3));
    rect(c, 352, 112, 2, 22, mix(P.steel, P.slate, 0.4));
    rect(c, 355, 100, 1, 12, P.black);
    rect(c, 359, 97, 1, 15, mix(P.darkRed, P.black, 0.3));
    rect(c, 363, 102, 1, 10, mix(P.navy, P.black, 0.3));
    begin();
    pt(70, 150);
    pt(124, 146);
    pt(132, 168);
    pt(76, 173);
    fill(c, mix(C.paper, P.tan, 0.25), { d: mix(C.paperD, P.tanShade, 0.3), f: 0.08, m: 1, side: 1 });
    for (let i = 0; i < 5; i++) line(c, 80, 155 + i * 3.4, 118 - (i % 2) * 8, 151 + i * 3.4, mix(P.slate, P.tan, 0.5));
    rect(c, 376, 150, 40, 3, mix(P.black, P.maroon, 0.4));
  }));

/** A stack of n disks with the top one's face showing. */
function stack(ctx, x, baseY, w, n, top = {}, t = 3) {
  for (let i = 0; i < n; i++) {
    const off = round((hash(i + 4) - 0.5) * 4);
    diskSide(ctx, x + off, baseY - (i + 1) * t, w, t);
  }
  const off = round((hash(n + 4) - 0.5) * 4);
  disk(ctx, x + off, baseY - n * t - round(w * 0.27), w, round(w * 0.27), top);
}

const K_ELBOW = [[1.5, -110], [3.15, 140, 'out'], [3.55, 147, 'inOut'], [4.2, 146, 'inOut']];
const K_TIP1 = [[3.15, 0], [3.55, 0.12, 'out'], [4.2, 0.3, 'inOut']];
const DESK_TOP = { lines: ['TAXES 94'], font: 'micro' };

function shotDesk(ctx, lt) {
  const camX = track(lt, [[0, 0], [4.2, 26, 'smooth']]);
  // the wall is far (slow parallax); the desk plane moves with the props
  ctx.drawImage(deskSet(), round(camX * 0.35), 0, W, DESK1, 0, 0, W, DESK1);
  ctx.drawImage(deskSet(), round(camX), DESK1, W, H - DESK1, 0, DESK1, W, H - DESK1);
  ctx.save();
  ctx.translate(-round(camX), 0);
  const baseY = 182;
  const ang = track(lt, K_TIP1);
  // shadows (key light from the left: they fall right)
  shadowBlob(ctx, 262, baseY + 1, 52, 4);
  shadowBlob(ctx, 180 + ang * 10, baseY + 1, 19, 3, 0.4);
  stack(ctx, 214, baseY, 96, 5, DESK_TOP, 4);
  mug(ctx, 196, baseY, 34, 40, ang);
  if (ang < 0.02) steam(ctx, 175, baseY - 46, lt, 1 - prog(lt, 2.8, 3.2));
  // the elbow slides in from the left and nudges the mug's handle
  const ex = track(lt, K_ELBOW);
  if (ex > -100) {
    ctx.globalAlpha = 0.35;
    ellipse(ctx, ex - 96, 194, 110, 6, P.black);
    ctx.globalAlpha = 1;
    ctx.drawImage(armArt(), round(ex - EX + 14), round(160 - EY));
  }
  ctx.restore();
  vignette(ctx, 0.6);
}

// --- S2: slow motion: the mug goes over, the coffee finds the label ---------------------------
const SPX = 136; // the mug's pivot rim in the close-up
const SPY = 171; // the desk line
const MW = 44;
const MH = 52;
const STACK_X = 216;
const LABEL_Y = 168;
const spillSet = lazy(() =>
  bake('ss-spill', W, H, function* paint(c) {
    // the wall: warm, a lamp glow at the top left, a bookcase and a window soft behind
    yield* shadeSteps(c, 0, 0, W, SPY, [P.black, mix(P.black, P.maroon, 0.6), P.maroon, mix(P.maroon, P.brown, 0.45), P.brown], (x, y) => {
      const d = sqrt(((x - 70) / 240) ** 2 + ((y - 40) / 150) ** 2);
      return clamp(0.95 - d) * 0.95;
    });
    // a bookcase: three shelves of thin spines, muted (soften() blurs them)
    const SPINE = [mix(P.maroon, P.navy, 0.35), mix(P.brown, P.black, 0.3), mix(P.darkRed, P.maroon, 0.55), mix(P.slate, P.maroon, 0.5), mix(P.tanShade, P.maroon, 0.5)];
    for (const sy of [58, 100, 142]) {
      let bx = 2;
      let k = sy;
      while (bx < 150) {
        const bw = 3 + floor(hash(k) * 3);
        const bh = 26 + floor(hash(k + 5) * 10);
        rect(c, bx, sy - bh, bw, bh, SPINE[floor(hash(k + 9) * 5)]);
        bx += bw + (hash(k + 13) > 0.85 ? 3 : 0);
        k += 7;
      }
      rect(c, 0, sy, 156, 3, mix(P.brown, P.black, 0.25));
    }
    // a pendant lamp on a cord (it becomes a soft bokeh)
    rect(c, 64, 0, 1, 10, P.black);
    ellipse(c, 64, 18, 22, 10, mix(P.darkGreen, P.black, 0.35));
    ellipse(c, 64, 26, 15, 4, mix(P.cream, P.yellow, 0.4));
    // the dusk window far right, cool
    yield* shadeSteps(c, 292, 0, 92, 128, [P.ink, mix(P.ink, P.navy, 0.5), P.navy, mix(P.navy, P.steel, 0.4)], (x, y) => 0.2 + (y / 160) + 0.2 * sin(((x - 292) / 92) * PI));
    rect(c, 288, 0, 6, 132, P.black);
    rect(c, 336, 0, 4, 132, P.black);
    rect(c, 286, 128, 98, 6, mix(P.maroon, P.black, 0.3));
    yield* soften(c, W, SPY, 4, { passes: 2 });
    // the desk: warm wood in the lamp's pool, grain, the window's cool sheen at the right
    yield* shadeSteps(c, 0, SPY, W, H - SPY, [mix(P.black, P.maroon, 0.6), P.maroon, P.brown, P.tanShade, mix(P.tanShade, P.tan, 0.5)], (x, y) => {
      const d = sqrt(((x - 110) / 260) ** 2 + ((y - 178) / 46) ** 2);
      return 0.22 + clamp(1 - d) * 0.75 + 0.05 * sin(y * 2.3 + sin(x * 0.03) * 2);
    });
    yield* ditherSteps(c, 270, SPY + 1, 114, H - SPY - 1, [mix(P.navy, P.maroon, 0.5)], (x, y) => 0.45 * sin(clamp((x - 270) / 114) * PI) * clamp(1 - (y - SPY) / 40));
    rect(c, 0, SPY, W, 1, mix(P.tanShade, P.tan, 0.5));
    // a sheet of notes and a fountain pen in the foreground at the left
    begin();
    pt(10, 186);
    pt(110, 180);
    pt(122, 216);
    pt(14, 216);
    fill(c, C.paper, { d: C.paperD, f: 0.08, m: 1, side: 1 });
    for (let i = 0; i < 6; i++) line(c, 22, 192 + i * 4, 100 - (i % 3) * 12, 187 + i * 4, mix(P.slate, P.cream, 0.45));
    capsule(c, 40, 208, 104, 196, 2.2, 1.6, P.black, { d: P.black, f: 0.3, m: 1, l: P.slate, lf: 0.3, side: 1 });
    rect(c, 70, 201, 6, 2, mix(P.yellow, P.tanShade, 0.4));
    line(c, 104, 196, 110, 195, mix(P.yellow, P.cream, 0.4));
    // the stack of disks at the right: three edges and the hero disk on top
    for (let i = 0; i < 3; i++) diskSide(c, STACK_X + (i & 1), 216 - (i + 1) * 7, 190, 7);
    disk(c, STACK_X, 146, 190, 50, {});
    // handwriting on the label (a fine pen, slightly uneven)
    const ink = mix(C.labelInk, C.label, 0.25);
    let hx = 252;
    for (const w of [9, 6, 11, 7]) {
      for (let k = 0; k < w; k++) rect(c, hx + k, 176 + round(sin((hx + k) * 0.9) * 0.6), 1, 1 + ((hx + k) % 3 === 0 ? 1 : 0), ink);
      hx += w + 4;
    }
    for (let k = 0; k < 28; k++) rect(c, 252 + k, 184 + round(sin(k * 0.7) * 0.6), 1, 1, ink);
    c.globalAlpha = 0.5;
    ellipse(c, STACK_X + 100, 216, 110, 4, P.black);
    c.globalAlpha = 1;
  }));

const K_TIP2 = [[0, 0.3], [1.5, 0.8, 'inOut'], [2.45, 1.52, 'in'], [2.6, 1.44, 'out'], [2.82, 1.55, 'inOut'], [3.1, 1.51, 'inOut']];
const POUR_A = 0.62; // the lip passes under the coffee's surface
const G_SLOW = 150; // gravity in the slow-motion clock (px/s^2)
const SPLASH = Array.from({ length: 10 }, (_, i) => ({ ph: hash(i * 3.1), vx: (hash(i * 7.7) - 0.4) * 26, vy: 16 + hash(i * 5.3) * 22, r: 0.7 + hash(i * 2.9) * 0.8 }));
const STREAM = new Float64Array(64);

/** The mug's lip (lowest rim point) at angle a. */
function lipAt(a) {
  rot(SPX, SPY, 0, -MH, a);
  return RX;
}

function shotSpill(ctx, lt) {
  ctx.drawImage(spillSet(), 0, 0);
  const a = track(lt, K_TIP2);
  // where the stream lands: the label of the hero disk, or the desk short of it
  const flowOn = clamp((a - POUR_A) / 0.12) * clamp((2.95 - lt) / 0.35);
  // the stain spreading on the label, under everything that moves
  const st = smooth((lt - 1.25) / 1.9);
  if (st > 0) {
    ctx.globalAlpha = 0.7;
    ellipse(ctx, 236, LABEL_Y + 13, 22 * st + 3, 8 * st + 1, C.coffeeM);
    ctx.globalAlpha = 0.85;
    ellipse(ctx, 232, LABEL_Y + 12, 12 * st + 2, 4.5 * st + 1, C.coffee);
    ctx.globalAlpha = 1;
    rect(ctx, round(236 - 10 * st), LABEL_Y + 9, round(12 * st), 1, C.coffeeH);
  }
  // the puddle at the mouth once it lies on the desk
  const pd = smooth((lt - 2.5) / 1.4);
  if (pd > 0) {
    ellipse(ctx, SPX + MH + 6, SPY + 3, 26 * pd + 2, 3.5 * pd + 1, C.coffee);
    rect(ctx, round(SPX + MH - 4), SPY + 2, round(18 * pd), 1, C.coffeeM);
  }
  // contact shadow under the pivot side
  ctx.globalAlpha = 0.5;
  ellipse(ctx, SPX - MW / 2 + (a / 1.57) * (MW / 2 + 10), SPY + 1, 22 - a * 4, 2, P.black);
  ctx.globalAlpha = 1;
  if (a < 0.31) steam(ctx, SPX - MW + 10, SPY - MH - 8, lt, 1 - prog(lt, 0, 0.4));
  mug(ctx, SPX, SPY, MW, MH, a, clamp(1 - (a - 0.3) / 0.9), 0.2);
  // the stream: every sample left the lip at an earlier instant and has flown
  // ballistically since, so the ribbon bends as the lip moves (slowed down)
  if (flowOn > 0) {
    let n = 0;
    for (let k = 0; k < 32; k++) {
      const age = k * 0.035;
      const te = lt - age;
      const ae = track(te, K_TIP2);
      if (ae < POUR_A) break;
      lipAt(ae);
      const sp = 26 + (ae - POUR_A) * 30;
      const x = RX[0] + 1 + sp * age;
      const y = RX[1] + 1 - 6 * age + 0.5 * G_SLOW * age * age;
      const floorY = x > STACK_X + 4 ? LABEL_Y + 10 : SPY + 2;
      if (y > floorY) break;
      STREAM[n * 2] = x;
      STREAM[n * 2 + 1] = y;
      n++;
    }
    for (let k = 1; k < n; k++) {
      const wdt = lerp(2.8, 1.4, k / n) * (0.4 + 0.6 * flowOn);
      capsule(ctx, STREAM[k * 2 - 2] + 0.6, STREAM[k * 2 - 1] + 0.8, STREAM[k * 2] + 0.6, STREAM[k * 2 + 1] + 0.8, wdt, wdt, C.coffee);
      capsule(ctx, STREAM[k * 2 - 2], STREAM[k * 2 - 1], STREAM[k * 2], STREAM[k * 2 + 1], wdt * 0.7, wdt * 0.7, C.coffeeM);
      if (k % 4 === 1) rect(ctx, STREAM[k * 2 - 2], STREAM[k * 2 - 1] - 1, 1, 1, C.coffeeH);
    }
    // the splash where it lands
    if (n > 2) {
      const lx = STREAM[n * 2 - 2];
      const ly = STREAM[n * 2 - 1];
      for (const sp of SPLASH) {
        const q = (lt * 1.6 + sp.ph) % 1;
        const tau = q * 0.45;
        const x = lx + sp.vx * tau;
        const y = ly - sp.vy * tau + 0.5 * G_SLOW * tau * tau;
        if (y > ly + 3) continue;
        ctx.globalAlpha = flowOn * (1 - q);
        ellipse(ctx, x, y, sp.r, sp.r * 1.2, C.coffeeM);
        rect(ctx, x, y - 1, 1, 1, C.coffeeH);
      }
      ctx.globalAlpha = 1;
    }
  }
  vignette(ctx, 0.62);
}

// --- S3: a fridge at night; a magnet slides down the door onto the disk ------------------------
const FRIDGE_H = 230;
const DISK_F = { x: 150, y: 116, w: 58, h: 60 };
const fridgeSet = lazy(() =>
  bake('ss-fridge', W, FRIDGE_H, function* paint(c) {
    // enamel door under cool night light from the upper left, with a soft sheen band
    yield* shadeSteps(c, 0, 0, 352, FRIDGE_H, [P.ink, P.slate, mix(P.slate, P.steel, 0.5), P.steel, mix(P.steel, P.fog, 0.55), P.fog], (x, y) => {
      const key = clamp(1 - sqrt(((x + 40) / 520) ** 2 + ((y + 30) / 420) ** 2));
      const sheen = 0.12 * Math.exp(-(((x - 74) / 22) ** 2));
      return 0.12 + key * 0.8 + sheen;
    });
    // door edge, the gap and the dark kitchen beyond: a cooker hood light far off
    rect(c, 344, 0, 8, FRIDGE_H, P.slate);
    rect(c, 350, 0, 2, FRIDGE_H, P.ink);
    rect(c, 352, 0, 32, FRIDGE_H, P.black);
    yield* shadeSteps(c, 356, 0, 28, FRIDGE_H, [P.black, mix(P.black, P.ink, 0.6), mix(P.ink, P.maroon, 0.4)], (x, y) => 0.25 + 0.35 * clamp(1 - abs(y - 70) / 60));
    rect(c, 364, 64, 14, 2, mix(P.yellow, P.maroon, 0.55));
    // handle
    rect(c, 326, 30, 6, 190, P.steel);
    rect(c, 326, 30, 2, 190, P.silver);
    rect(c, 331, 30, 1, 190, P.slate);
    rect(c, 324, 34, 10, 4, P.slate);
    rect(c, 324, 214, 10, 4, P.slate);
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
    disk(c, DISK_F.x, DISK_F.y, DISK_F.w, DISK_F.h, { lines: ['WEDDING 96', 'ORIGINAL'], font: 'micro' });
    c.globalAlpha = 0.45;
    rect(c, DISK_F.x - 6, DISK_F.y - 4, 14, 6, P.silver);
    rect(c, DISK_F.x + DISK_F.w - 8, DISK_F.y - 4, 14, 6, P.silver);
    c.globalAlpha = 1;
    // magnetic word tiles (static)
    for (const [s, x, y] of [['ALWAYS', 92, 196], ['AND', 132, 200], ['FOREVER', 154, 194]]) {
      const tw = text(c, s, -999, -999, { font: 'micro' }) + 6;
      rect(c, x + 1, y + 1, tw, 9, mix(P.slate, P.ink, 0.4));
      rect(c, x, y, tw, 9, mix(P.silver, P.fog, 0.2));
      text(c, s, x + 3, y + 2, { color: P.black, font: 'micro' });
    }
  }));

// the magnet slides with a faint stick-slip, then comes to rest on the disk
const K_MAG = [[0, 46], [0.9, 62, 'inOut'], [1.15, 64, 'out'], [2.5, 112, 'inOut'], [2.7, 118, 'out'], [3.6, 118]];

function shotFridge(ctx, lt) {
  const camY = track(lt, [[0, 4], [3.6, 10, 'smooth']]);
  ctx.drawImage(fridgeSet(), 0, -round(camY));
  const my = round(track(lt, K_MAG) - camY);
  const mx = 180;
  ctx.globalAlpha = 0.35;
  ellipse(ctx, mx + 3, my + 4, 10, 9, P.black);
  ctx.globalAlpha = 1;
  ellipse(ctx, mx, my, 10, 10, mix(P.black, P.ink, 0.35), SH_MAGNET);
  ellipse(ctx, mx - 1, my - 1, 7, 7, mix(P.black, P.ink, 0.6));
  rect(ctx, mx - 6, my - 7, 5, 1, P.steel);
  rect(ctx, mx - 7, my - 6, 1, 2, P.slate);
  // on contact the disk's shutter catches one glint
  const g = prog(lt, 2.75, 3.4);
  if (g > 0 && g < 1) {
    ctx.globalAlpha = sin(g * PI) * 0.7;
    rect(ctx, DISK_F.x + 18 + round(g * 20), DISK_F.y - round(camY), 2, 20, P.white);
    ctx.globalAlpha = 1;
  }
  vignette(ctx, 0.66);
}

// --- S4: a sunny windowsill; the disk warps in the heat -------------------------------------
const SILL = 118; // front edge of the sill top (seen from above at ~45 degrees)
const SILL_W = 410;
const sillSet = lazy(() =>
  bake('ss-sill', SILL_W, H, function* paint(c) {
    // the garden through the glass: a pale sky, a dark yew hedge, a lawn in sun
    yield* shadeSteps(c, 0, 0, SILL_W, 70, [mix(P.fog, P.silver, 0.4), mix(P.silver, P.cream, 0.35), mix(P.cream, P.white, 0.5)], (x, y) => clamp(0.4 + y / 120 + 0.2 * sin(x * 0.01)));
    yield* shadeSteps(c, 0, 26, SILL_W, 44, [P.black, mix(P.black, P.darkGreen, 0.55), mix(P.darkGreen, P.black, 0.25), P.darkGreen], (x, y) => {
      const top = 30 + 6 * sin(x * 0.05) + 4 * sin(x * 0.13 + 1) + 3 * hash(floor(x / 3));
      if (y < top) return -1;
      return clamp(0.2 + 0.5 * clamp(1 - (y - top) / 30) * (0.6 + 0.4 * sin(x * 0.2 + y * 0.3)));
    });
    yield* shadeSteps(c, 0, 62, SILL_W, 12, [mix(P.darkGreen, P.tanShade, 0.4), mix(P.green, P.tan, 0.55), mix(P.green, P.cream, 0.6)], (x, y) => clamp(0.35 + (y - 62) * 0.06 + 0.15 * sin(x * 0.07)));
    // window frame and glazing bar (painted wood, sunlit on the left faces)
    rect(c, 0, 0, SILL_W, 6, mix(P.cream, P.fog, 0.3));
    rect(c, 0, 6, SILL_W, 2, mix(P.fog, P.steel, 0.4));
    rect(c, 196, 0, 10, 74, mix(P.cream, P.fog, 0.25));
    rect(c, 204, 0, 2, 74, mix(P.fog, P.steel, 0.5));
    rect(c, 0, 72, SILL_W, 6, mix(P.fog, P.steel, 0.35));
    rect(c, 0, 72, SILL_W, 1, P.cream);
    // the sill top, seen from above: painted wood with the sun's shaft across it
    yield* shadeSteps(c, 0, 78, SILL_W, SILL - 78 + 52, [mix(P.tan, P.fog, 0.45), mix(P.cream, P.fog, 0.35), P.cream, mix(P.cream, P.white, 0.55)], (x, y) => {
      const beam = clamp(1 - abs((x - 120 - (y - 78) * 0.9) / 150));
      return 0.15 + smooth(beam) * 0.85 - (y > SILL + 46 ? 0.2 : 0);
    });
    // grain of the paint and the joint of the sill board
    for (let x = 0; x < SILL_W; x += 37) rect(c, x, 80, 1, 88, mix(P.cream, P.tan, 0.35));
    rect(c, 0, 168, SILL_W, 2, mix(P.tan, P.tanShade, 0.4));
    // the wall below the sill, in shade, a radiator top
    yield* shadeSteps(c, 0, 170, SILL_W, H - 170, [mix(P.tanShade, P.slate, 0.45), mix(P.tan, P.fog, 0.4), mix(P.cream, P.fog, 0.4)], (x, y) => clamp(0.2 + 0.35 * clamp(1 - abs(x - 60 - (y - 170) * 0.9) / 120) - (y - 170) * 0.006));
    for (let x = 20; x < SILL_W; x += 9) rect(c, x, 196, 5, 20, mix(P.tan, P.fog, 0.55));
    // a terracotta pot with a succulent, lit from the left, cropped by the frame
    const pc = mix(P.rust, P.tanShade, 0.45);
    begin();
    pt(320, 96);
    pt(386, 96);
    pt(378, 150);
    pt(328, 150);
    fill(c, pc, { d: mix(pc, P.brown, 0.5), f: 0.35, m: 1, dd: mix(pc, P.black, 0.45), df: 0.12, side: 1 });
    rect(c, 316, 88, 74, 9, mix(pc, P.tan, 0.3));
    rect(c, 316, 96, 74, 1, mix(pc, P.brown, 0.5));
    const leaf = mix(P.darkGreen, P.tanShade, 0.25);
    for (let i = 0; i < 9; i++) {
      const a = -PI / 2 + (i - 4) * 0.34;
      const l = 30 + (i % 3) * 6;
      capsule(c, 353, 90, 353 + cos(a) * l, 90 + sin(a) * l * 1.1, 5, 2, leaf, { d: mix(leaf, P.black, 0.35), f: 0.4, m: 1, l: mix(leaf, P.cream, 0.35), lf: 0.25, side: 1 });
    }
    c.globalAlpha = 0.25;
    ellipse(c, 362, 152, 40, 4, P.brown);
    c.globalAlpha = 1;
  }));
// the disk as a flat sprite (top view, foreshortened), warped per column on air
const SD_W = 118;
const SD_H = 62;
const sillDisk = lazy(() =>
  bake('ss-sill-disk', SD_W, SD_H, (c) => {
    // the face, foreshortened (we look down at the sill at ~45 degrees), and
    // the 3 px front edge of the casing below it
    disk(c, 0, 0, SD_W, SD_H - 3, { lit: 1, lines: ['SUMMER 98', 'BACKUP'], font: 'micro' });
    rect(c, 0, SD_H - 3, SD_W, 3, C.diskE);
    rect(c, 0, SD_H - 3, SD_W, 1, C.disk);
  }));
const MOTES = Array.from({ length: 14 }, (_, i) => ({ x: hash(i * 1.7) * 260 + 10, y: hash(i * 4.1) * 120 + 70, s: 0.6 + hash(i * 9.2) }));
const SD_X = 110;
const SD_Y = 104;

function shotSill(ctx, lt) {
  const camX = round(track(lt, [[0, 0], [3.6, 14, 'smooth']]));
  ctx.drawImage(sillSet(), -camX, 0);
  // heat shimmer over the dark hedge just behind the disk: rows of the baked
  // garden nudged sideways (read from the bake, never from the screen)
  const set = sillSet();
  for (let y = 30; y < 70; y++) {
    const off = round(sin(y * 0.9 + lt * 7) * 1.2 * clamp((y - 30) / 20) * smooth(lt / 1.5));
    if (off) ctx.drawImage(set, 86 + camX, y, 160, 1, 86 + off, y, 160, 1);
  }
  // the disk warps: its ends lift and its middle bows, slowly, in the sun
  const curl = track(lt, [[0, 0.6], [3.6, 9, 'smooth']]);
  const art = sillDisk();
  const x0 = SD_X - camX;
  ctx.globalAlpha = 0.3;
  ellipse(ctx, x0 + SD_W / 2 + 6, SD_Y + SD_H + 2, SD_W / 2 + 4, 4, P.tanShade);
  ctx.globalAlpha = 1;
  for (let x = 0; x < SD_W; x++) {
    const u = (x / (SD_W - 1)) * 2 - 1;
    const lift = round(curl * u * u * u * u + curl * 0.15 * u * u);
    if (lift > 0) {
      // the gap under a lifted end: its shadow on the sill
      ctx.globalAlpha = 0.35;
      rect(ctx, x0 + x + 2, SD_Y + SD_H - lift + 3, 1, lift, P.tanShade);
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(art, x, 0, 1, SD_H, x0 + x, SD_Y - lift, 1, SD_H);
  }
  // dust drifting in the beam
  ctx.fillStyle = P.white;
  for (const m of MOTES) {
    const x = m.x + lt * 5 * m.s + sin(lt * 0.9 + m.y) * 3;
    const y = m.y - lt * 3 * m.s;
    const inBeam = clamp(1 - abs((x - 120 - (y - 78) * 0.9) / 120));
    ctx.globalAlpha = 0.65 * inBeam;
    ctx.fillRect(round(x) - camX, round(y), 1, 1);
  }
  ctx.globalAlpha = 1;
  vignette(ctx, 0.45);
}

// --- S5: the adviser -------------------------------------------------------------------------
const officeSet = lazy(() =>
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
      rect(c, 300, sy, 100, 3, mix(P.maroon, P.black, 0.5));
      rect(c, 300, sy, 100, 1, mix(P.steel, P.maroon, 0.5));
      let bx = 304;
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
    yield* soften(c, 400, 152, 1, { passes: 1 });
    // desk: dark mahogany with the lamp's pool
    yield* shadeSteps(c, 0, 152, 400, H - 152, [P.black, mix(P.black, P.maroon, 0.7), P.maroon, mix(P.maroon, P.brown, 0.5), P.brown, P.tanShade], (x, y) => {
      const d = sqrt(((x - 96) / 150) ** 2 + ((y - 160) / 34) ** 2);
      return 0.22 + clamp(1 - d) ** 1.2 * 0.75 + 0.04 * sin(y * 2.1 + sin(x * 0.02) * 2);
    });
    rect(c, 0, 152, 400, 1, mix(P.tanShade, P.maroon, 0.3));
    rect(c, 0, 196, 400, 1, mix(P.tanShade, P.maroon, 0.5));
    yield* shadeSteps(c, 0, 197, 400, H - 197, [P.black, mix(P.black, P.maroon, 0.6), P.maroon], (x, y) => 0.6 - (y - 197) * 0.02 + clamp(1 - abs(x - 96) / 120) * 0.3);
  }));
// desk props (transparent layer, moves with the desk)
const officeProps = lazy(() =>
  bake('ss-office-props', 400, H, function* paint(c) {
    // banker's lamp: brass stem, green glass shade
    const bl = mix(P.darkGreen, P.green, 0.25);
    rect(c, 76, 116, 3, 42, mix(P.tanShade, P.yellow, 0.25));
    rect(c, 76, 116, 1, 42, mix(P.yellow, P.cream, 0.4));
    ellipse(c, 78, 160, 15, 3, mix(P.tanShade, P.yellow, 0.2), { d: P.brown, f: 0.3, m: 1, side: 1 });
    begin();
    pt(56, 116);
    pt(62, 103);
    pt(94, 103);
    pt(100, 116);
    fill(c, bl, { d: mix(bl, P.black, 0.45), f: 0.3, m: 1, l: mix(bl, P.cream, 0.3), lf: 0.2, side: 1 });
    rect(c, 62, 103, 32, 1, mix(bl, P.cream, 0.45));
    rect(c, 56, 116, 44, 1, mix(P.yellow, P.cream, 0.55));
    // nameplate, a leather folder, a pen
    rect(c, 318, 168, 44, 7, mix(P.maroon, P.brown, 0.3));
    rect(c, 318, 168, 44, 1, mix(P.brown, P.tanShade, 0.5));
    rect(c, 324, 171, 32, 1, mix(P.yellow, P.tanShade, 0.45));
    // a pen and a closed claims file at the lamp's foot
    begin();
    pt(104, 168);
    pt(150, 166);
    pt(152, 176);
    pt(104, 178);
    fill(c, mix(P.tanShade, P.cream, 0.35), { d: mix(P.tanShade, P.brown, 0.4), f: 0.12, m: 1, l: mix(P.cream, P.white, 0.3), lf: 0.1, side: 1 });
    rect(c, 104, 176, 48, 2, mix(P.tanShade, P.brown, 0.5));
    line(c, 160, 182, 184, 176, P.black);
    line(c, 160, 181, 170, 179, mix(P.yellow, P.tanShade, 0.4));
  }));
const lampPool = lazy(() => pool('ss-lamp-pool', 90, 64, P.yellow, 5, 0.22));

// The adviser on the presenter rig: a look made from the channel's Lola rig
// (silver bob, round tortoiseshell glasses, navy jacket, pearl studs), solo,
// speaking her line with the rig's own lip sync, one open-hand gesture.
const ADVISER = { actor: null };
castInit((R) => {
  const base = R.cast.LOOKS.lola;
  const look = R.base.deriveLook(base, {
    id: 'ss-margaret',
    name: 'Margaret Hale',
    head: { ...base.head, cheekHW: 6.85, chinHW: 2.65, jawPow: 1.85 },
    skin: R.base.SKIN_LIGHT,
    hair: { style: 'bob', ramp: [P.white, P.silver, P.fog, P.steel], line: P.slate },
    eyes: { ...base.eyes, iris: [P.steel, P.slate] },
    brows: { ...base.brows, color: P.fog },
    glasses: { style: 'round', ramp: [P.tanShade, P.brown, P.maroon, P.black] },
    jacket: { ramp: [P.steel, P.navy, P.ink, P.black], line: P.black },
    shirt: { ramp: [P.white, P.cream, P.tan, P.tanShade], line: P.tanShade },
    necklace: [P.white, P.silver],
    earrings: P.silver,
    cuff: P.cream,
    persona: { sway: 0.45, headMotion: 0.6, blinkMin: 2.8, blinkMax: 5.6, energy: 0.55, smile: 0.22 },
    parts: { over: (buf, L, m, head, s, sk) => R.glasses.drawGlasses(buf, L, head, sk.face, s) },
  });
  ADVISER.actor = {
    id: look.id,
    look,
    perf: {
      side: 0,
      seed: 7,
      gestures: [{ name: 'raise_hand', t0: 0.9, amp: 0.6 }, { name: 'nod', t0: 3.75 }],
      emotions: [{ t0: 0, name: 'neutral' }],
      look: [],
      speech: R.vis.buildSpeech(ADVISER_LINE, { t0: ADVISER_AT - T_ADVISER, rate: 0.9 }),
    },
  };
});

// fallback figure (cine.js) if the rig is unavailable
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
  const camX = track(lt, [[0, 0], [4.6, 10, 'smooth']]);
  ctx.drawImage(officeSet(), round(camX * 0.4), 0, W, 152, 0, 0, W, 152);
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(lampPool(), -6 - round(camX * 0.4), 96);
  ctx.globalCompositeOperation = 'source-over';
  const ox = -round(camX);
  // the desk and its props, then the adviser behind it (the rig clips her at the desk edge)
  ctx.drawImage(officeSet(), round(camX), 152, W, H - 152, 0, 152, W, H - 152);
  ctx.drawImage(officeProps(), ox, 0);
  // the disk on the desk in a clear sleeve, slid gently towards us at the end
  const slide = track(lt, [[3.2, 0], [4.1, 3, 'inOut']]);
  disk(ctx, 238 + ox, 178 + slide, 38, 13, {});
  const head = castDraw(ctx, ADVISER.actor, lt, 240 + ox, 118, 2.55, 153);
  if (!head) {
    const m = MARGARET;
    m.x = 240 + ox;
    m.y = 46;
    m.blink = blinkAt(lt + 11, 3);
    m.mouth = talkAt(lt, info.speaking && info.line === 4);
    bust(ctx, m, 156);
    ctx.drawImage(officeSet(), round(camX), 152, W, H - 152, 0, 152, W, H - 152);
    ctx.drawImage(officeProps(), ox, 0);
    disk(ctx, 238 + ox, 178 + slide, 38, 13, {});
    arm(ctx, m, 1);
    arm(ctx, m, -1);
  }
  // lower third: name and role
  const la = window01(lt, 0.8, 4.2, 0.4);
  if (la > 0) {
    ctx.globalAlpha = la;
    rect(ctx, 24, 193, round(2 + 120 * smooth((lt - 0.8) / 0.5)), 1, P.silver);
    ctx.globalAlpha = la * smooth((lt - 1.0) / 0.4);
    tracked(ctx, 'MARGARET HALE', 24, 181, { color: P.white, track: 1 });
    tracked(ctx, 'SENIOR CLAIMS ADVISER  ·  31 YEARS', 24, 198, { color: P.silver, font: 'micro', track: 1 });
    ctx.globalAlpha = 1;
  }
  vignette(ctx, 0.5);
}

// --- S6: end slate: the policy schedule on the desk ------------------------------------------
const CARD = { x: 64, y: 14, w: 256, h: 160 };
const slateArt = lazy(() =>
  bake('ss-slate', W, H, function* paint(c) {
    // a dark navy blotter under a soft top light
    yield* shadeSteps(c, 0, 0, W, H, [P.black, mix(P.black, P.ink, 0.6), P.ink, mix(P.ink, P.navy, 0.35)], (x, y) => clamp(1 - sqrt(((x - 192) / 250) ** 2 + ((y - 70) / 160) ** 2)) * 0.95);
    // the card's soft shadow, then the cream stock with a faint laid texture
    c.globalAlpha = 0.5;
    rect(c, CARD.x + 4, CARD.y + 5, CARD.w, CARD.h, P.black);
    c.globalAlpha = 1;
    yield* shadeSteps(c, CARD.x, CARD.y, CARD.w, CARD.h, [mix(P.cream, P.tan, 0.35), P.cream, mix(P.cream, P.white, 0.4)], (x, y) => clamp(0.55 + 0.35 * (1 - (y - CARD.y) / CARD.h) - 0.25 * ((x - CARD.x) / CARD.w) + ((y & 3) === 0 ? -0.08 : 0)));
    rect(c, CARD.x, CARD.y, CARD.w, 1, mix(P.cream, P.white, 0.6));
    rect(c, CARD.x + CARD.w - 1, CARD.y, 1, CARD.h, mix(P.cream, P.tan, 0.5));
    rect(c, CARD.x, CARD.y + CARD.h - 1, CARD.w, 1, mix(P.cream, P.tan, 0.6));
    // an inner hairline border in navy
    const ink = C.navy;
    rect(c, CARD.x + 6, CARD.y + 6, CARD.w - 12, 1, ink);
    rect(c, CARD.x + 6, CARD.y + CARD.h - 7, CARD.w - 12, 1, ink);
    rect(c, CARD.x + 6, CARD.y + 6, 1, CARD.h - 12, ink);
    rect(c, CARD.x + CARD.w - 7, CARD.y + 6, 1, CARD.h - 12, ink);
    // the schedule (micro type, ink on cream)
    const sx = CARD.x + 22;
    tracked(c, 'POLICY SCHEDULE', sx, CARD.y + 74, { color: ink, font: 'micro', track: 2 });
    rect(c, sx, CARD.y + 82, CARD.w - 44, 1, mix(ink, P.cream, 0.5));
    text(c, 'INSURED', sx, CARD.y + 88, { color: P.slate, font: 'micro' });
    text(c, "1 X 3.5\" DISK, 'TAXES 1994 - FINAL (2)'", sx + 44, CARD.y + 88, { color: ink, font: 'micro' });
    text(c, 'VALUE', sx, CARD.y + 96, { color: P.slate, font: 'micro' });
    text(c, 'SENTIMENTAL', sx + 44, CARD.y + 96, { color: ink, font: 'micro' });
  }));

/** The embossed navy seal: a heater shield with a disk's shutter notch, in a ring. */
function seal(ctx, cx, cy, a) {
  ctx.globalAlpha = a;
  const r = 13;
  for (let i = 0; i < 56; i++) {
    const t = (i / 56) * PI * 2;
    rect(ctx, round(cx + cos(t) * r), round(cy + sin(t) * r), 1, 1, C.navy);
    if (i % 2 === 0) rect(ctx, round(cx + cos(t) * (r - 2)), round(cy + sin(t) * (r - 2)), 1, 1, mix(C.navy, P.cream, 0.4));
  }
  const s = C.navy;
  const w = 6;
  line(ctx, cx - w, cy - 6, cx + w, cy - 6, s);
  line(ctx, cx - w, cy - 6, cx - w, cy + 1, s);
  line(ctx, cx + w, cy - 6, cx + w, cy + 1, s);
  line(ctx, cx - w, cy + 1, cx, cy + 7, s);
  line(ctx, cx + w, cy + 1, cx, cy + 7, s);
  rect(ctx, cx - 3, cy - 4, 6, 1, s);
  rect(ctx, cx - 3, cy - 4, 1, 3, s);
  rect(ctx, cx + 2, cy - 4, 1, 3, s);
  ctx.globalAlpha = 1;
}

const LEGAL = "Excludes disks used as coasters. The value of your data may go down as well as up.";

function shotSlate(ctx, lt) {
  // the card is already on the blotter when the dip opens; its type sets in
  // line by line, then everything holds still
  ctx.drawImage(slateArt(), 0, 0);
  const cx = CARD.x + CARD.w / 2;
  seal(ctx, CARD.x + 30, CARD.y + 30, smooth(lt / 0.6));
  ctx.globalAlpha = smooth((lt - 0.3) / 0.6);
  thin(ctx, 'SAFESECTOR', cx + 14, CARD.y + 18, { color: C.navy, track: 2, scale: 2, align: 'center' });
  ctx.globalAlpha = smooth((lt - 0.6) / 0.6);
  tracked(ctx, 'FLOPPY DISK INSURANCE  ·  SINCE 1987', cx + 14, CARD.y + 44, { color: P.slate, font: 'micro', track: 1, align: 'center' });
  ctx.globalAlpha = smooth((lt - 0.9) / 0.6);
  tracked(ctx, 'BECAUSE EVERY KILOBYTE COUNTS.', cx, CARD.y + 116, { color: C.navy, track: 1, align: 'center' });
  ctx.globalAlpha = smooth((lt - 1.2) / 0.6);
  tracked(ctx, '0800 144 1440  ·  SAFESECTOR.DSK', cx, CARD.y + 134, { color: P.slate, font: 'micro', track: 1, align: 'center' });
  ctx.globalAlpha = 1;
  // one glint crosses the seal (the slate's only motion)
  const g = prog(lt, 1.6, 2.6);
  if (g > 0 && g < 1) {
    ctx.globalAlpha = 0.6 * sin(g * PI);
    rect(ctx, CARD.x + 18 + round(g * 24), CARD.y + 18, 1, 24, P.white);
    ctx.globalAlpha = 1;
  }
  smallPrint(ctx, LEGAL, 186, { color: P.silver, a: smooth((lt - 0.5) / 0.5), maxW: 300 });
}

const SHOTS = [
  { at: 0, draw: shotDesk, tr: 'black', td: 0.7 },
  { at: T_SPILL, draw: shotSpill },
  { at: T_FRIDGE, draw: shotFridge },
  { at: T_SILL, draw: shotSill },
  { at: T_ADVISER, draw: shotAdviser, tr: 'dip', td: 0.6 },
  { at: T_SLATE, draw: shotSlate, tr: 'dip', td: 0.6 },
];

// Soft piano (a decaying triangle), a sine pad and a low sine bass. 60 bpm, so
// one beat is one second and every chord change sits on a cut.
const PIANO = { wave: 'triangle', a: 0.004, d: 1.7, s: 0, r: 0.9, vib: false };
const PAD = { wave: 'sine', a: 0.45, d: 1.2, s: 0.8, r: 1.4, vib: [6, 4.2, 0.4], legato: 1 };

// Everything this spot bakes, in shot order: prewarmed in idle-time slices so
// no cut ever waits for a bake (see cine.js prewarm).
const WARM = [deskSet, armArt, spillSet, fridgeSet, sillSet, sillDisk, officeSet, officeProps, lampPool, slateArt, () => vignetteArt(0.6), () => vignetteArt(0.62), () => vignetteArt(0.66), () => vignetteArt(0.45), () => vignetteArt(0.5)];
prewarm(WARM, 6000);

export default {
  id: 'safesector',
  brand: 'SAFESECTOR',
  duration: DURATION,
  voice: { gender: 'female', lang: 'en-GB', pitch: 0.95, rate: 0.9 },
  script: [
    { at: 0.3, text: 'Life can change in an instant.' },
    { at: 3.1, text: 'A careless elbow.' },
    { at: 8.5, text: 'A fridge magnet.' },
    { at: 12.1, text: 'A sunny windowsill.' },
    { at: ADVISER_AT, text: ADVISER_LINE },
    { at: 20.4, text: 'SafeSector. Because every kilobyte counts.' },
  ],
  // B minor to D major, one chord per shot: Bm(add9) | Gmaj7 | Em7 | Asus4-A | D G |
  // Em A | D, the last chord landing under the brand line and decaying before
  // the spot ends. Every track is 28.5 beats (longer than the spot), ending in rest.
  tune: {
    bpm: 60,
    room: 0.55,
    echo: { beats: 0.75, feedback: 0.22 },
    fadeOut: 1.6,
    tracks: [
      {
        kind: 'lead',
        inst: PIANO,
        gain: 1.15,
        notes: 'R:1 F#5:1.5@0.7 E5:0.5@0.5 D5:1.2@0.6 R:0.5 D5:0.5@0.5 B4:1@0.5 R:0.5 B4:0.5@0.5 A4:0.5@0.45 G4:0.5@0.5 G4:1.1@0.45 R:0.5 A4:0.5@0.5 B4:0.5@0.45 G4:1@0.45 E5:1@0.55 C#5:0.5@0.5 D5:0.5@0.5 E5:1.1@0.5 R:0.5 R:0.5 F#4:1.5@0.35 D5:1@0.4 B4:1.1@0.4 R:0.5 R:0.5 B4:0.5@0.45 D5:0.5@0.5 C#5:0.5@0.5 E5:1@0.55 F#5:0.5@0.6 D5:1.5@0.55 R:3.5',
      },
      {
        kind: 'harmony',
        inst: PIANO,
        gain: 0.85,
        notes: 'B2:0.5@0.6 F#3:0.5@0.45 B3:0.5@0.45 C#4:0.5@0.4 D4:0.5@0.45 C#4:0.5@0.4 B3:0.5@0.4 F#3:0.5@0.4 D3:0.2@0.35 G2:0.5@0.55 D3:0.5@0.4 B3:0.5@0.4 F#4:0.5@0.4 G2:0.5@0.5 D3:0.5@0.4 B3:0.5@0.4 D4:0.5@0.4 E2:0.5@0.55 B2:0.5@0.4 G3:0.5@0.4 D4:0.5@0.4 E2:0.5@0.5 B2:0.5@0.4 G3:0.6@0.4 A2:0.5@0.55 E3:0.5@0.4 D4:0.5@0.4 C#4:0.5@0.4 A2:0.5@0.5 E3:0.5@0.4 A3:0.6@0.4 D3:0.5@0.5 A3:0.5@0.35 D4:0.5@0.35 F#4:0.5@0.35 G2:0.5@0.45 D3:0.5@0.35 B3:0.5@0.35 D4:0.5@0.35 G3:0.6@0.35 E2:0.5@0.5 B2:0.5@0.4 G3:0.5@0.4 A2:0.5@0.5 E3:0.5@0.4 C#4:0.5@0.4 D2:0.5@0.6 A2:0.5@0.45 F#3:0.5@0.45 D4:0.5@0.45 R:3.5',
      },
      {
        kind: 'harmony',
        inst: PAD,
        gain: 0.26,
        notes: 'B2+F#3+D4:4.2@0.5 G2+D3+B3:4@0.5 E3+G3+B3:3.6@0.5 A2+D3+E3:1.8@0.5 A2+C#3+E3:1.8@0.5 D3+F#3+A3:2@0.45 G2+B2+D3:2.6@0.45 E3+G3+B3:1.5@0.5 A2+C#3+E3:1.5@0.5 D3+F#3+A3:1.6@0.55 R:3.9',
      },
      { kind: 'bass', inst: 'sine', gain: 0.6, notes: 'B1:4.2 G1:4 E2:3.6 A1:3.6 D2:2 G1:2.6 E2:1.5 A1:1.5 D2:1.6 R:3.9' },
    ],
  },
  draw(ctx, t, dt, info) {
    prewarm(WARM);
    film(ctx, dt, info, SHOTS);
  },
};
