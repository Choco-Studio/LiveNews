// BITFIZZ RESERVE — a luxury spirits commercial, played completely straight,
// for a fizzy soft drink. Whispered voice-over, amber light, slow motion,
// gold serif type, and the joke is all in the copy: aged twelve years in a
// decommissioned server farm, tasting notes of oak, caramel and dial-up,
// "Uncompressed." Letterboxed 2.2:1; the legal line sits on the bottom bar.
//
// Shot list (24 s, 72 bpm, a bar is 3.33 s; the brand chord lands at 20.0 s):
//  1  0.0 MACRO    inside the liquid: slow bubbles in backlit amber.        VO "Some things cannot be rushed."
//  2  4.0 CELLAR   a dark server hall; bottles rest in the racks; a window
//                  beam full of dust; slow truck right; documentary caption. VO "Aged twelve years, in a decommissioned server farm."
//  3  8.6 POUR     slow-motion pour into a crystal tumbler over one ice cube. VO "Poured over ice, hand-chipped by a retired sysadmin."
//  4 13.4 NOSE     a man in profile, rim-lit, raises the glass; tasting
//                  notes set in serif in the empty half of the frame.       VO "Notes of oak, caramel... and dial-up."
//  5 17.8 HERO     the bottle on a stone plinth; the lights come up and a
//                  softbox sweep travels round the glass.                    VO "BitFizz Reserve."
//  6 20.4 SLATE    bottle left, gold lock-up right, legal on the bar.        VO "Uncompressed."
import {
  P, W, H, R, A, oval, poly, ring, disc, cached, lazy, play, key, tween, prog, smooth,
  type, trackIn, fadeUp, rule, smallPrint, gradient, vignette, letterbox, beam, contact, glintStar,
  litShape, lathe, ovalRing, bubbles, motes, hash01, clipRect, warmUp, tune,
} from './kit.js';

const { round, sin, cos, PI, max, min, abs } = Math;

const BAR = 24; // letterbox bar height (2.2:1)
const GOLD = [P.cream, P.yellow, P.yellow];
// Backlit whisky-amber, dark to light; orange only where the light passes through.
const AMBER = [P.black, P.maroon, P.brown, P.tanShade, P.orange, P.yellow];
const GILT = [P.black, P.brown, P.tanShade, P.yellow, P.cream];
const STONE = [P.black, P.ink, P.slate, P.steel];
const CRYSTAL = [P.maroon, P.brown, P.tanShade, P.cream];

/** Radii from keys into a reused array, scaled by k (no allocation). */
function fill(out, h, keys, k) {
  for (let j = 0; j < h; j++) out[j] = key(j / max(1, h - 1), keys) * k;
  return out;
}

// --- the bottle ------------------------------------------------------------------
// A broad decanter with a gilt stopper, a black label with gold type, full of
// amber to the shoulder. Drawn per pixel by kit.lathe at any size.

const STOP_KEYS = [[0, 5], [0.14, 9, 'out'], [0.5, 9.5], [0.62, 6.5, 'inOut'], [0.72, 6.5], [0.78, 9, 'out'], [1, 9]];
const BODY_KEYS = [[0, 7], [0.07, 7], [0.11, 9, 'inOut'], [0.25, 34, 'inOut'], [0.31, 37, 'out'], [0.94, 36], [1, 33, 'in']];
const BODY_R = 37; // widest radius at scale 1
const PROF = new Float32Array(400);
const STOP = new Float32Array(80);
const BODY_H = 108;
const STOP_H = 15;
const RIM = { k: 0.95 };
const RIM_DYN = { k: 0.95 };
// softbox reflections; the third is a sweep moved by the hero shot (9 = parked)
const STRIPES = [[-0.56, 0.05, P.cream], [0.7, 0.03, P.yellow]];
const SWEEP = [[-0.56, 0.05, P.cream], [0.7, 0.03, P.yellow], [9, 0.1, P.cream]];
const STOP_STRIPES = [[-0.5, 0.12, P.cream]];

/** The label texture for a bottle of radius r: one full turn, label on the front third. */
const labelTex = (r) =>
  cached(`bf-label-${r}`, round(2 * PI * r), round(r * 1.5), (c) => {
    const tw = round(2 * PI * r);
    const lh = round(r * 1.5);
    const lw = round(tw * 0.36);
    const x0 = round((tw - lw) / 2);
    const cx = round(tw / 2);
    R(c, x0, 0, lw, lh, P.black);
    R(c, x0 + 2, 2, lw - 4, 1, P.yellow);
    R(c, x0 + 2, lh - 3, lw - 4, 1, P.yellow);
    R(c, x0 + 2, 2, 1, lh - 4, P.tanShade);
    R(c, x0 + lw - 3, 2, 1, lh - 4, P.tanShade);
    const big = r >= 30;
    let y = big ? 7 : 6;
    type(c, 'BITFIZZ', cx, y, { face: big ? 'serif' : 'body', color: big ? GOLD : P.cream, track: big ? 0 : 1, align: 'center' });
    y += big ? 15 : 11;
    type(c, 'RESERVE', cx, y, { face: 'micro', color: P.yellow, track: 2, align: 'center' });
    y += 9;
    R(c, cx - 10, y, 21, 1, P.tanShade);
    y += 4;
    type(c, 'AGED 12 YEARS', cx, y, { face: 'micro', color: P.cream, track: 1, align: 'center' });
    if (lh - y > 16) type(c, 'SERVER FARM 7', cx, y + 8, { face: 'micro', color: P.tanShade, track: 1, align: 'center' });
  });

const LAB = { cv: null, top: 0, h: 0, turn: 0.5 };
const GLASS = { top: 0, edge: 1.4, wall: 0.9, edgeColor: P.tanShade };
const BODY_O = { rows: 0, ramp: AMBER, ambient: 0.1, glass: GLASS, label: LAB, stripes: STRIPES, rim: RIM, key: 1, seam: 0.5 };
const STOP_O = { rows: 0, ramp: GILT, ambient: 0.14, stripes: STOP_STRIPES, rim: RIM, key: 1, seam: 0.5 };

/**
 * Bottle standing on y = bottom, axis at cx, at scale k. tex: the label texture
 * (built for the nominal radius); sweep: x of the moving softbox (-1.3..1.3) or null.
 */
function bottle(ctx, cx, bottom, k, tex, { turn = 0.5, keyK = 1, rimK = 0.95, sweep = null } = {}) {
  const bh = round(BODY_H * k);
  const sh = round(STOP_H * k);
  const top = bottom - bh - sh;
  RIM_DYN.k = rimK;
  STOP_O.rows = sh;
  STOP_O.key = keyK;
  STOP_O.rim = RIM_DYN;
  lathe(ctx, cx, top, fill(STOP, sh, STOP_KEYS, k), STOP_O);
  GLASS.top = round(bh * 0.2);
  LAB.cv = tex;
  LAB.top = round(bh * 0.42);
  LAB.h = round((tex.height * k * BODY_R) / (tex.width / (2 * PI)));
  LAB.turn = turn;
  BODY_O.rows = bh;
  BODY_O.key = keyK;
  BODY_O.rim = RIM_DYN;
  if (sweep !== null) {
    SWEEP[2][0] = sweep;
    BODY_O.stripes = SWEEP;
  } else BODY_O.stripes = STRIPES;
  lathe(ctx, cx, top + sh, fill(PROF, bh, BODY_KEYS, k), BODY_O);
  return top;
}

/** Dark stone plinth: top ellipse at y, front band down to the bar. */
function plinth(ctx, cx, y, rx, ry, depth = 30) {
  R(ctx, cx - rx, y, rx * 2 + 1, depth, P.black);
  oval(ctx, cx, y, rx, ry, P.black);
  oval(ctx, cx - round(rx * 0.1), y - 1, round(rx * 0.7), max(1, ry - 3), A(P.maroon, 0.6));
  ovalRing(ctx, cx, y, rx, ry, P.ink);
  // the front lip catches the key light (left of centre)
  for (let i = -rx + 3; i <= rx - 3; i++) {
    const kx = i / rx;
    const yy = y + round(ry * Math.sqrt(1 - kx * kx));
    R(ctx, cx + i, yy, 1, 1, abs(kx + 0.35) < 0.28 ? P.slate : P.ink);
  }
}

// --- 1. MACRO ----------------------------------------------------------------------

const macroBg = lazy(() => gradient('bf-macro', W, H, { cx: 268, cy: 64, rx: 330, ry: 230, ramp: [P.black, P.maroon, P.brown, P.tanShade], gamma: 1.35, seam: 0.45 }));

/** A bubble seen through a macro lens: refracted light low-left, specular top-right. */
function macroBubble(ctx, x, y, r) {
  x = round(x);
  y = round(y);
  if (r < 2) {
    R(ctx, x, y, 2, 2, P.tanShade);
    R(ctx, x + 1, y, 1, 1, P.cream);
    return;
  }
  disc(ctx, x, y, r, A(P.black, 0.22));
  ring(ctx, x, y, r, A(P.orange, 0.6));
  // the refracted light gathers in a crescent on the inner lower-left edge
  const steps = 6 + r;
  for (let i = 0; i <= steps; i++) {
    const a = (0.5 + (i / steps) * 0.9) * PI;
    const rr = r - 1.3;
    R(ctx, x + cos(a) * rr, y + sin(a) * rr, 1, 1, A(P.yellow, 0.4 + 0.4 * sin((i / steps) * PI)));
    if (r >= 7) R(ctx, x + cos(a) * (rr - 1), y + sin(a) * (rr - 1), 1, 1, A(P.yellow, 0.25 * sin((i / steps) * PI)));
  }
  // the window of the key light, upper right, and its small twin lower left
  const sx = x + round(r * 0.4);
  const sy = y - round(r * 0.5);
  R(ctx, sx - 1, sy, r >= 7 ? 3 : 2, 1, P.cream);
  if (r >= 5) R(ctx, sx, sy - 1, 1, 1, P.white);
  if (r >= 7) R(ctx, x - round(r * 0.45), y + round(r * 0.35), 1, 1, A(P.cream, 0.6));
}

/** The curved glass wall on the left of frame, catching the backlight. */
const glassWall = lazy(() =>
  cached('bf-wall', W, H, (c) => {
    for (let y = 0; y < H; y++) {
      const x = round(62 + ((y - 108) / 108) ** 2 * 14);
      R(c, 0, y, x - 3, 1, A(P.black, 0.35));
      R(c, x - 3, y, 2, 1, A(P.tanShade, 0.35));
      R(c, x - 1, y, 1, 1, P.cream);
      R(c, x, y, 2, 1, A(P.yellow, 0.35));
      R(c, x + 5, y, 1, 1, A(P.orange, 0.25));
    }
  }),
);

// nucleation points on the bottom of the glass: columns of bubbles in a line
const COLUMNS = [[118, 15, 16], [232, 12, 19], [292, 17, 14]];
function shotMacro(ctx, lt) {
  ctx.drawImage(macroBg(), 0, 0);
  // far: a sparse haze of fine bubbles deep in the glass
  bubbles(ctx, lt, { x: 70, y: BAR, w: 300, h: H - 2 * BAR, n: 18, seed: 3, rise: 8, size: 1, wobble: 0.6, color: P.tanShade, hi: P.tanShade });
  // columns: each nucleation point releases a bubble every `gap` px of rise
  for (let c = 0; c < COLUMNS.length; c++) {
    const [cx, sp, gap] = COLUMNS[c];
    const base = H - BAR + 6;
    const span = base - BAR + 10;
    for (let i = 0; i * gap < span; i++) {
      const d = (lt * sp + i * gap) % span; // height above the bottom
      const y = base - d;
      const r = d < 30 ? 0 : d < 80 ? 1 : d < 130 ? 2 : 3;
      macroBubble(ctx, cx + sin(d * 0.05 + c) * (1 + d * 0.012), y, r);
    }
  }
  // mid: a few larger bubbles drifting up in slow motion
  for (let i = 0; i < 5; i++) {
    const sp = 6 + hash01(i, 21) * 6;
    const span = H + 40;
    const y = H + 20 - ((lt * sp + hash01(i, 22) * span) % span);
    const x = 90 + hash01(i, 23) * 270 + sin(lt * 0.9 + i) * 2;
    macroBubble(ctx, x, y, 3 + round(hash01(i, 24) * 3));
  }
  // the hero bubble rises through the middle of frame
  const hy = tween(lt, 0.4, 4.4, 200, 66, 'inOut');
  macroBubble(ctx, 186 + sin(lt * 1.1) * 3, hy, 11);
  // near: out-of-focus bubbles drifting past the lens
  for (let i = 0; i < 3; i++) {
    const span = H + 80;
    const y = H + 40 - ((lt * 20 + hash01(i, 31) * span) % span);
    const x = 100 + hash01(i, 32) * 280;
    const r = 16 + round(hash01(i, 33) * 10);
    disc(ctx, x, y, r, A(P.tanShade, 0.07));
    ring(ctx, x, y, r, A(P.yellow, 0.1));
  }
  ctx.drawImage(glassWall(), 0, 0);
  vignette(ctx, 0.75);
  // fade up from black
  if (lt < 1.6) R(ctx, 0, 0, W, H, A(P.black, 1 - smooth(lt / 1.6)));
}

// --- 2. CELLAR ---------------------------------------------------------------------

const CW = 560; // the hall is wider than the frame so the camera can travel

const hallBack = lazy(() =>
  cached('bf-hall-back', CW, H, (c) => {
    c.drawImage(gradient('bf-hall-wall', CW, H, { kind: 'vertical', ramp: [P.black, P.ink, P.black], from: 0.05, to: 1, seam: 0.4 }), 0, 0);
    // concrete panels
    for (let x = 0; x < CW; x += 72) R(c, x, 30, 1, 140, P.black);
    R(c, 0, 92, CW, 1, P.black);
    // the high industrial window: the only light in the hall, with its haze
    const wx = 76;
    const wy = 36;
    for (let i = 4; i >= 1; i--) oval(c, wx + 30, wy + 22, 30 + i * 9, 22 + i * 7, A(P.steel, 0.05));
    R(c, wx - 2, wy - 2, 64, 47, P.black);
    for (let gy = 0; gy < 3; gy++) {
      for (let gx = 0; gx < 5; gx++) {
        const px = wx + gx * 12;
        const py = wy + gy * 15;
        const dirty = hash01(gx + gy * 5, 4) < 0.25;
        R(c, px, py, 11, 14, dirty ? P.slate : gy === 0 ? P.fog : P.steel);
        R(c, px, py, 11, 1, dirty ? P.steel : P.silver);
        if (!dirty && (gx + gy) % 2) R(c, px + 1, py + 2, 1, 10, A(P.silver, 0.5));
      }
    }
    // cable trays along the ceiling
    R(c, 0, 24, CW, 3, P.black);
    R(c, 0, 27, CW, 1, P.ink);
    // floor: polished concrete, darker away from the window
    c.drawImage(gradient('bf-hall-floor', CW, 30, { kind: 'vertical', ramp: [P.ink, P.black], seam: 0.5 }), 0, 168);
    R(c, 0, 168, CW, 1, P.slate);
  }),
);

/** A rack cabinet: frame, 1U rails, bottles resting where the servers were. */
function paintRack(c, x, y, w, h, s, seed) {
  R(c, x, y, w, h, P.black);
  R(c, x, y, 2, h, P.ink);
  R(c, x + w - 2, y, 2, h, P.ink);
  R(c, x, y, w, 2, P.ink);
  const rows = Math.floor((h - 10) / (s * 2 + 4));
  const cols = Math.floor((w - 8) / (s * 2 + 3));
  const ox = x + round((w - cols * (s * 2 + 3)) / 2) + s + 1;
  for (let j = 0; j < rows; j++) {
    const yy = y + 6 + j * (s * 2 + 4) + s;
    R(c, x + 3, yy + s + 1, w - 6, 1, P.ink); // shelf rail
    if (hash01(j, seed) < 0.18) {
      // an old server left in the rack: dark faceplate, dead lights
      R(c, x + 4, yy - s, w - 8, s * 2, P.ink);
      for (let v = x + 8; v < x + w - 10; v += 3) R(c, v, yy - 1, 1, 2, P.black);
      continue;
    }
    for (let i = 0; i < cols; i++) {
      const bx = ox + i * (s * 2 + 3);
      if (hash01(i + j * 31, seed + 9) < 0.08) continue; // one already drunk
      // a bottle lying on its side, base towards us: dark glass, amber inside, a glint
      disc(c, bx, yy, s, P.black);
      if (s >= 3) {
        disc(c, bx, yy, s - 1, P.maroon);
        disc(c, bx + 1, yy + 1, s - 3, P.brown);
        disc(c, bx + 1, yy + 1, max(0, s - 4), P.maroon); // the punt
        R(c, bx - round(s * 0.5), yy - round(s * 0.55), 1, 1, P.tanShade);
      } else R(c, bx, yy, 1, 1, P.brown);
    }
    if (s >= 4 && j % 2 === 0) R(c, x + 6, yy + s + 2, 5, 1, P.cream); // a vintage tag on the rail
  }
}

const hallRacks = lazy(() =>
  cached('bf-hall-racks', CW, H, (c) => {
    for (let k = 0; k < 9; k++) paintRack(c, 150 + k * 58, 74, 46, 96, 2, k + 1);
  }),
);
const hallNear = lazy(() =>
  cached('bf-hall-near', 150, H, (c) => {
    paintRack(c, 4, 26, 142, 170, 5, 77);
    // status strip down the post: one light still on (drawn live)
    for (let y = 40; y < 180; y += 9) R(c, 8, y, 1, 2, P.black);
  }),
);

// the window beam falls from the window to the floor on the right
const BEAM = { x0: 106, y0: 52, x1: 214, y1: 186, w0: 56, w1: 150 };
function inBeam(x, y) {
  const s = (y - BEAM.y0) / (BEAM.y1 - BEAM.y0);
  if (s < 0 || s > 1) return false;
  const cx = BEAM.x0 + (BEAM.x1 - BEAM.x0) * s;
  const hw = (BEAM.w0 + (BEAM.w1 - BEAM.w0) * s) / 2;
  return abs(x - cx) < hw * 0.8;
}

function shotCellar(ctx, lt) {
  const cam = tween(lt, 0, 4.8, 0, 64, 'inOut');
  ctx.drawImage(hallBack(), -round(cam * 0.35), 0);
  // the beam and its dust ride with the back wall
  ctx.save();
  ctx.translate(-round(cam * 0.35), 0);
  beam(ctx, BEAM.x0, BEAM.y0, BEAM.x1, BEAM.y1, BEAM.w0, BEAM.w1, { color: P.silver, alpha: 0.05 });
  beam(ctx, BEAM.x0 + 4, BEAM.y0, BEAM.x1 + 10, BEAM.y1, BEAM.w0 * 0.5, BEAM.w1 * 0.5, { color: P.cream, alpha: 0.035 });
  motes(ctx, lt, { x: 60, y: 50, w: 200, h: 140, n: 46, seed: 9, drift: 5, fall: 1.2, color: P.cream, alpha: 0.75, inside: inBeam });
  // the beam's pool on the floor
  oval(ctx, BEAM.x1 + 6, 180, 70, 6, A(P.cream, 0.05));
  ctx.restore();
  ctx.drawImage(hallRacks(), -round(cam * 0.7), 0);
  // a bottle in the far racks catches the beam
  glintStar(ctx, 268 - round(cam * 0.7), 103, ((lt + 0.4) % 3.2) / 1.1, P.cream);
  // near rack slides past on the right, sharp
  const nx = 300 - round(cam * 1.25);
  ctx.drawImage(hallNear(), nx, 0);
  // the one status light still on, breathing slowly
  const g = 0.35 + 0.65 * (0.5 + 0.5 * sin(lt * 1.7));
  R(ctx, nx + 8, 76, 1, 2, A(P.green, g));
  R(ctx, nx + 7, 75, 3, 4, A(P.green, g * 0.15));
  // foreground post: out of focus, crossing fast
  const fx = 470 - round(cam * 2.4);
  R(ctx, fx, 0, 26, H, A(P.black, 0.85));
  R(ctx, fx + 26, 0, 3, H, A(P.black, 0.45));
  vignette(ctx, 0.6);
  // documentary caption, bottom left above the bar
  fadeUp(ctx, 'SERVER FARM 7', 20, H - BAR - 22, lt - 1.2, { face: 'body', color: P.cream, track: 2, dur: 1 });
  fadeUp(ctx, 'SLOUGH, BERKSHIRE', 20, H - BAR - 11, lt - 1.5, { face: 'micro', color: P.fog, track: 1, dur: 1 });
}

// --- 3. POUR -----------------------------------------------------------------------

const pourBg = lazy(() => gradient('bf-pour', W, H, { cx: 200, cy: 92, rx: 230, ry: 150, ramp: [P.black, P.maroon, P.brown], gamma: 1.6, seam: 0.45 }));
const barTop = lazy(() => gradient('bf-bartop', W, 48, { kind: 'vertical', ramp: [P.brown, P.maroon, P.black], seam: 0.5 }));

// A heavy cut-crystal tumbler: wider than tall, a thick base, diamond cuts
// round the lower half (a label texture of facet lines, so they wrap and turn).
const TUMBLER_KEYS = [[0, 35], [0.86, 33], [1, 33]];
const BASE_KEYS = [[0, 33], [0.7, 33], [1, 31.5]];
const TPROF = new Float32Array(260);
const BPROF = new Float32Array(60);
const TGLASS = { top: 0, edge: 1.2, wall: 1, edgeColor: P.tanShade };
const T_STRIPES = [[-0.64, 0.05, P.cream, 0.04, 0.5], [-0.64, 0.03, P.cream, 0.62, 0.98], [0.76, 0.03, P.cream, 0.08, 0.9]];
const CUTS = { cv: null, top: 0, h: 0, turn: 0.3 };
const TUMBLER_O = { rows: 0, ramp: AMBER, ambient: 0.16, glass: TGLASS, stripes: T_STRIPES, label: CUTS, rim: RIM, tilt: 0.2, seam: 0.5 };
const BASE_O = { rows: 0, ramp: CRYSTAL, ambient: 0.3, stripes: T_STRIPES, rim: false, tilt: 0.2, seam: 0.5 };
const cutsTex = lazy(() =>
  cached('bf-cuts', 220, 28, (c) => {
    // a band of diamond cuts: two families of diagonals, brighter where they cross
    for (let y = 0; y < 28; y++) {
      for (let x = 0; x < 220; x++) {
        const a = (x + y) % 14 === 0;
        const b = (x - y + 280) % 14 === 0;
        if (a && b) R(c, x, y, 1, 1, P.cream);
        else if (a || b) R(c, x, y, 1, 1, y < 3 || y > 24 ? P.brown : P.tanShade);
      }
    }
    R(c, 0, 0, 220, 1, P.tanShade);
  }),
);

const ICE = [[0, 0], [0, 0], [0, 0], [0, 0]];
const ICE_L = [[0, 0], [0, 0], [0, 0], [0, 0]];
const ICE_R = [[0, 0], [0, 0], [0, 0], [0, 0]];
/** A hand-chipped cube: top face and two front faces, translucent with crisp lit edges. */
function iceCube(ctx, x, y, s, a, strong) {
  for (let k = 0; k < 4; k++) {
    const ang = a + (k * PI) / 2 + (hash01(k, 5) - 0.5) * 0.22;
    const rr = s * (0.92 + hash01(k, 6) * 0.16);
    ICE[k][0] = x + cos(ang) * rr;
    ICE[k][1] = y + sin(ang) * rr * 0.42;
  }
  // the lowest corner faces the camera; side faces hang below the two front edges
  let f = 0;
  for (let k = 1; k < 4; k++) if (ICE[k][1] > ICE[f][1]) f = k;
  const l = ICE[(f + 1) % 4];
  const rr = ICE[(f + 3) % 4];
  const c = ICE[f];
  const d = s * 1.05;
  ICE_L[0][0] = l[0]; ICE_L[0][1] = l[1]; ICE_L[1][0] = c[0]; ICE_L[1][1] = c[1];
  ICE_L[2][0] = c[0]; ICE_L[2][1] = c[1] + d; ICE_L[3][0] = l[0]; ICE_L[3][1] = l[1] + d * 0.9;
  ICE_R[0][0] = c[0]; ICE_R[0][1] = c[1]; ICE_R[1][0] = rr[0]; ICE_R[1][1] = rr[1];
  ICE_R[2][0] = rr[0]; ICE_R[2][1] = rr[1] + d * 0.95; ICE_R[3][0] = c[0]; ICE_R[3][1] = c[1] + d;
  const k = strong ? 1 : 0.45;
  poly(ctx, ICE_L, A(P.cream, 0.24 * k));
  poly(ctx, ICE_R, A(P.yellow, 0.14 * k));
  poly(ctx, ICE, A(P.white, 0.32 * k));
  // lit edges: the top rim and the front corner
  ctx.fillStyle = A(P.white, 0.85 * k);
  for (let e = 0; e < 4; e++) {
    const p0 = ICE[e];
    const p1 = ICE[(e + 1) % 4];
    const n = max(abs(p1[0] - p0[0]), abs(p1[1] - p0[1]));
    for (let i = 0; i <= n; i++) ctx.fillRect(round(p0[0] + ((p1[0] - p0[0]) * i) / n), round(p0[1] + ((p1[1] - p0[1]) * i) / n), 1, 1);
  }
  R(ctx, c[0], c[1], 1, round(d), A(P.white, 0.6 * k));
  // fracture lines inside
  R(ctx, round(x - s * 0.3), round(y + s * 0.5), round(s * 0.5), 1, A(P.white, 0.25 * k));
  R(ctx, round(x + s * 0.1), round(y + s * 0.2), 1, round(s * 0.4), A(P.white, 0.18 * k));
}

/** The bottle's neck tilted into the top of frame, mid-pour: dark glass, gilt collar. */
const NECK = [[0, 0], [0, 0], [0, 0], [0, 0]];
function neck(ctx, mx, my, k) {
  const ang = 0.6; // radians below horizontal
  const dx = cos(ang);
  const dy = sin(ang);
  const len = 160 * k;
  const hw = 9 * k;
  NECK[0][0] = mx - dy * hw; NECK[0][1] = my + dx * hw;
  NECK[1][0] = mx + dy * hw; NECK[1][1] = my - dx * hw;
  NECK[2][0] = mx - dx * len + dy * hw * 1.3; NECK[2][1] = my - dy * len - dx * hw * 1.3;
  NECK[3][0] = mx - dx * len - dy * hw * 1.3; NECK[3][1] = my - dy * len + dx * hw * 1.3;
  poly(ctx, NECK, P.black);
  // across the neck: dark glass, amber core, a long softbox line on the upper edge
  for (let i = 3; i < len; i++) {
    const x = mx - dx * i;
    const y = my - dy * i;
    const w = hw * (1 + (0.3 * i) / len);
    for (let q = -w + 1; q < w - 1; q++) {
      const e = abs(q) / w;
      const col = e < 0.45 ? P.brown : e < 0.7 ? P.maroon : null;
      if (col) R(ctx, x - dy * q, y + dx * q, 1, 1, col);
    }
    R(ctx, x + dy * (w - 2), y - dx * (w - 2), 1, 1, P.tanShade);
    if (i % 3 === 0) R(ctx, x + dy * (w - 3), y - dx * (w - 3), 1, 1, A(P.cream, 0.5));
  }
  // gilt foil collar near the lip and the lip itself
  for (let i = 10 * k; i < 18 * k; i++) {
    const x = mx - dx * i;
    const y = my - dy * i;
    for (let q = -hw; q <= hw; q++) R(ctx, x - dy * q, y + dx * q, 1, 1, q > hw * 0.4 ? P.yellow : q > -hw * 0.3 ? P.tanShade : P.brown);
  }
  for (let q = -hw; q <= hw; q++) R(ctx, mx - dy * q, my + dx * q, 1, 1, q > 0 ? P.cream : P.tanShade);
}

const POUR_FX = 196;
const POUR_FY = 132;
function shotPour(ctx, lt) {
  ctx.drawImage(pourBg(), 0, 0);
  const k = tween(lt, 0, 5, 1, 1.12, 'inOut');
  const fx = POUR_FX;
  const fy = POUR_FY;
  // bar top
  const by = round(fy + (150 - fy) * k);
  ctx.drawImage(barTop(), 0, by);
  R(ctx, 0, by, W, 1, P.tanShade);
  const cx = round(fx + (196 - fx) * k);
  const th = round(66 * k);
  const bottom = round(fy + (176 - fy) * k);
  const top = bottom - th;
  const baseH = round(11 * k);
  const tubeH = th - baseH;
  // liquid rises as it pours
  const fillP = tween(lt, 0, 5, 0.18, 0.55, 'linear');
  const levelRow = round(tubeH * (1 - fillP));
  const r0 = 35 * k;
  TGLASS.top = levelRow;
  TUMBLER_O.rows = tubeH;
  CUTS.cv = cutsTex();
  CUTS.top = round(tubeH * 0.5);
  CUTS.h = tubeH - CUTS.top;
  CUTS.turn = 0.3 + lt * 0.01;
  fill(TPROF, tubeH, TUMBLER_KEYS, k);
  fill(BPROF, baseH, BASE_KEYS, k);
  // its reflection in the polished bar
  clipRect(ctx, 0, bottom + 1, W, H - bottom);
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.translate(0, 2 * bottom + 2 * round(0.2 * r0));
  ctx.scale(1, -1);
  lathe(ctx, cx, top, TPROF, TUMBLER_O);
  lathe(ctx, cx, top + tubeH, BPROF, BASE_O);
  ctx.restore();
  ctx.restore();
  contact(ctx, cx, bottom + round(6 * k), round(r0 * 1.02), 0.5);
  lathe(ctx, cx, top, TPROF, TUMBLER_O);
  BASE_O.rows = baseH;
  lathe(ctx, cx, top + tubeH, BPROF, BASE_O);
  // liquid surface, seen from slightly above
  const lr = TPROF[levelRow] - 1;
  const ly = top + levelRow + round(0.1 * lr);
  oval(ctx, cx, ly, round(lr), max(2, round(lr * 0.2)), P.tanShade);
  oval(ctx, cx - round(lr * 0.15), ly - 1, round(lr * 0.6), max(1, round(lr * 0.1)), A(P.orange, 0.6));
  // slow rings spreading from where the stream lands
  for (let i = 0; i < 3; i++) {
    const ph = (lt * 0.7 + i / 3) % 1;
    const rr = round((4 + ph * 18) * k);
    ovalRing(ctx, cx + round(6 * k), ly, rr, max(1, round(rr * 0.22)), A(P.cream, 0.35 * (1 - ph)));
  }
  // the ice cube, part above the surface, part seen through the amber
  const ix = cx - round(8 * k);
  const iy = ly - round(6 * k) + round(sin(lt * 1.6) * 1);
  clipRect(ctx, 0, 0, W, ly);
  iceCube(ctx, ix, iy, 15 * k, 0.35 + lt * 0.03, true);
  ctx.restore();
  clipRect(ctx, 0, ly, W, H - ly);
  iceCube(ctx, ix, iy, 15 * k, 0.35 + lt * 0.03, false);
  ctx.restore();
  // rising bubbles inside the liquid
  bubbles(ctx, lt, { x: cx - round(lr * 0.75), y: ly + 3, w: round(lr * 1.5), h: max(4, top + tubeH - ly - 5), n: 18, seed: 12, rise: 10, size: 2, color: P.yellow, hi: P.cream });
  // the rim of the glass
  ovalRing(ctx, cx, top + round(r0 * 0.2), round(r0), max(2, round(r0 * 0.2)), A(P.cream, 0.6));
  // the stream: leaves the neck with some forward speed, falls, thins
  const mx = round(fx + (150 - fx) * k);
  const my = round(fy + (50 - fy) * k);
  neck(ctx, mx, my, k);
  const ix1 = cx + round(6 * k);
  for (let y = my + 2; y < ly; y++) {
    const s = (y - my) / max(1, ly - my);
    const x = round(mx + (ix1 - mx) * (1 - (1 - s) * (1 - s)));
    const w = max(2, round((4.4 - s * 1.9) * k));
    R(ctx, x - (w >> 1), y, w, 1, P.orange);
    R(ctx, x - (w >> 1), y, 1, 1, P.yellow);
    if (w > 2) R(ctx, x + w - (w >> 1) - 1, y, 1, 1, P.tanShade);
    // slow-motion glints travelling down the stream
    if ((y - lt * 26) % 13 < 2) R(ctx, x - (w >> 1), y, 1, 1, P.cream);
  }
  // crown of droplets at the impact, in slow motion
  for (let i = 0; i < 7; i++) {
    const ph = (lt * 0.9 + hash01(i, 41)) % 1;
    const vx = (hash01(i, 42) - 0.5) * 30 * k;
    const vy = (18 + hash01(i, 43) * 16) * k;
    const t = ph * 1.1;
    const x = ix1 + vx * t;
    const y = ly - vy * t + 34 * k * t * t;
    if (y < ly) R(ctx, x, y, 1 + (i % 2), 1 + (i % 2), i % 3 ? P.yellow : P.cream);
  }
  vignette(ctx, 0.6);
}

// --- 4. NOSE -----------------------------------------------------------------------
// A man in his forties in profile, facing left into the light, raises the
// glass and closes his eyes. Rim light on the profile, the rest in shadow.

const noseBg = lazy(() => gradient('bf-nose', W, H, { cx: 318, cy: 70, rx: 220, ry: 170, ramp: [P.black, P.maroon, P.brown], gamma: 1.5, seam: 0.45 }));

// Local coordinates: nose tip at (0, 0), x grows toward the back of the head.
const SKIN_SRC = [
  [26, -42], [14, -40], [9, -34], [6, -26], [5, -19], [8, -15], [7, -12], [3, -5], [0, 0], [3, 2], [5, 3], [4, 6],
  [6, 8], [5, 10], [7, 12], [5, 16], [8, 20], [20, 22], [24, 28], [23, 36], [26, 46], [46, 46], [50, 30], [50, 18],
  [56, 6], [58, -10], [56, -26], [48, -38], [38, -43],
];
// a short, side-parted cut that follows the skull
const HAIR_SRC = [
  [8, -35], [10, -40], [17, -44], [27, -46], [38, -45], [47, -41], [54, -34], [58, -25], [59, -15], [57, -6],
  [53, -1], [50, -4], [49, -11], [45, -14], [42, -22], [36, -29], [27, -32], [18, -32], [12, -31],
];
const EAR_SRC = [[40, -15], [45, -16], [47, -9], [46, -1], [42, 1], [40, -5]];
const SUIT_SRC = [[24, 44], [18, 50], [12, 70], [8, 140], [118, 140], [108, 66], [86, 52], [58, 42], [44, 46], [34, 47]];
const COLLAR_SRC = [[23, 42], [31, 45], [27, 53], [19, 50]];
// hand and forearm in glass-relative coordinates (glass bottom centre = 0, 0)
const HAND_SRC = [[-19, -15], [-8, -17], [3, -15], [6, -7], [5, 3], [-6, 5], [-19, 2], [-21, -6]];
const ARM_SRC = [[-2, -10], [12, -6], [52, 120], [22, 120]];
const mk = (src) => src.map((p) => [p[0], p[1]]);
const SKIN = mk(SKIN_SRC);
const HAIR = mk(HAIR_SRC);
const EAR = mk(EAR_SRC);
const SUIT = mk(SUIT_SRC);
const COLLAR = mk(COLLAR_SRC);
const ARM = mk(ARM_SRC);
const HAND = mk(HAND_SRC);
// transform shared by the paint functions (set per frame; no closures)
const XF = { ox: 0, oy: 0, k: 1, a: 0, px: 30, py: 40, hx: 0, hy: 0 };
/** Head points rotate by XF.a about the neck pivot; then scale and place. */
function placeHead(src, dst) {
  const ca = cos(XF.a);
  const sa = sin(XF.a);
  for (let i = 0; i < src.length; i++) {
    const x = src[i][0] - XF.px;
    const y = src[i][1] - XF.py;
    dst[i][0] = XF.ox + (XF.px + x * ca - y * sa) * XF.k;
    dst[i][1] = XF.oy + (XF.py + x * sa + y * ca) * XF.k;
  }
}
function placeBody(src, dst, dx = 0, dy = 0) {
  for (let i = 0; i < src.length; i++) {
    dst[i][0] = XF.ox + (src[i][0] + dx) * XF.k;
    dst[i][1] = XF.oy + (src[i][1] + dy) * XF.k;
  }
}
// painters for litShape: fill the shape in `col`, offset by (ox, oy)
let PT = null; // the point list being painted
const OFFS = new WeakMap(); // point list -> its own offset copy (built once)
function paintPts(c, col, ox, oy) {
  let off = OFFS.get(PT);
  if (!off) OFFS.set(PT, (off = mk(PT)));
  for (let i = 0; i < PT.length; i++) {
    off[i][0] = PT[i][0] + ox;
    off[i][1] = PT[i][1] + oy;
  }
  poly(c, off, col);
}
// light from the left and slightly above: a cream edge, a warm second pixel, deep shadow
const SKIN_LIGHT = [[P.cream, 0, 0], [P.tanShade, 1, 0], [P.maroon, 2, 1]];
const HAIR_LIGHT = [[P.tanShade, 0, 0], [P.black, 1, 1]];
const SUIT_LIGHT = [[P.brown, 0, 0], [P.black, 1, 1]];
const HAND_LIGHT = [[P.cream, 0, 0], [P.brown, 1, 0], [P.maroon, 2, 1]];
const EAR_LIGHT = [[P.maroon, 0, 0]];
const COLLAR_LIGHT = [[P.slate, 0, 0], [P.ink, 1, 1]];
function lit(ctx, pts, layers) {
  PT = pts;
  litShape(ctx, paintPts, layers);
}

const SMALL_KEYS = [[0, 16], [0.85, 15], [1, 15]];
const SPROF = new Float32Array(60);
const SMALL_CUTS = { cv: null, top: 0, h: 0, turn: 0.2 };
const SMALL_GLASS = { top: 0, edge: 1, wall: 1, edgeColor: P.tanShade };
const SMALL_O = { rows: 0, ramp: AMBER, ambient: 0.25, glass: SMALL_GLASS, label: SMALL_CUTS, stripes: [[-0.55, 0.07, P.cream]], rim: RIM, tilt: 0.2, seam: 0.5 };
const ARM_LIGHT = [[P.tanShade, 0, 0], [P.black, 1, 1]];
const LIFT = [[0, 0], [2.4, 0], [3.0, -1, 'inOut'], [3.8, 0, 'inOut']];
const TILT = [[0, 0.02], [1.2, 0.02], [2.3, 0.07, 'inOut'], [3.2, 0.07], [4.4, 0.0, 'inOut']];
function placeAt(src, dst, x, y, k) {
  for (let i = 0; i < src.length; i++) {
    dst[i][0] = x + src[i][0] * k;
    dst[i][1] = y + src[i][1] * k;
  }
}

function shotNose(ctx, lt) {
  ctx.drawImage(noseBg(), 0, 0);
  const k = tween(lt, 0, 4.4, 1.0, 1.06, 'inOut');
  // he leans in to the glass, breathes in, lifts his chin a touch
  XF.k = k;
  XF.ox = 236 - (k - 1) * 120;
  XF.oy = 98 - (k - 1) * 40 + round(key(lt, LIFT));
  XF.a = key(lt, TILT);
  placeBody(SUIT_SRC, SUIT);
  placeBody(COLLAR_SRC, COLLAR);
  placeHead(SKIN_SRC, SKIN);
  placeHead(HAIR_SRC, HAIR);
  placeHead(EAR_SRC, EAR);
  lit(ctx, SUIT, SUIT_LIGHT);
  lit(ctx, COLLAR, COLLAR_LIGHT);
  lit(ctx, SKIN, SKIN_LIGHT);
  lit(ctx, EAR, EAR_LIGHT);
  lit(ctx, HAIR, HAIR_LIGHT);
  // features in the shadow side of the face: brow, eye (closing), a crease by the mouth
  const eyesShut = lt > 2.0;
  const ex = SKIN[5][0] + 4 * k;
  const ey = SKIN[5][1] - 1 * k;
  R(ctx, ex - 1, ey - 3 * k, round(6 * k), 1, P.black);
  if (eyesShut) R(ctx, ex, ey + 1, round(4 * k), 1, P.black);
  else {
    R(ctx, ex, ey, round(3 * k), 1, P.black);
    R(ctx, ex, ey + 1, 1, 1, P.tanShade);
  }
  R(ctx, SKIN[12][0] + 2 * k, SKIN[12][1], 1, round(2 * k), P.black);
  // the glass rises from below frame to chin height, just under his nose
  const gp = smooth(prog(lt, 0.3, 2.3));
  const gx = round(XF.ox - 20 * k);
  const gy = round(XF.oy + (128 - gp * 92) * k);
  placeAt(ARM_SRC, ARM, gx, gy, k);
  lit(ctx, ARM, ARM_LIGHT);
  const gh = round(22 * k);
  SMALL_GLASS.top = round(gh * 0.45);
  SMALL_O.rows = gh;
  SMALL_CUTS.cv = cutsTex();
  SMALL_CUTS.top = round(gh * 0.5);
  SMALL_CUTS.h = gh - SMALL_CUTS.top;
  lathe(ctx, gx, gy - gh, fill(SPROF, gh, SMALL_KEYS, k), SMALL_O);
  ovalRing(ctx, gx, round(gy - gh + 3 * k), round(16 * k), max(1, round(3 * k)), A(P.cream, 0.55));
  placeAt(HAND_SRC, HAND, gx, gy, k);
  lit(ctx, HAND, HAND_LIGHT);
  // the gaps between the fingers
  for (let i = 0; i < 3; i++) R(ctx, round(gx - 18 * k), round(gy - (11 - i * 5) * k), round(12 * k), 1, P.black);
  vignette(ctx, 0.55);
  // tasting notes in the space he faces, on the voice
  const tx = 104;
  fadeUp(ctx, 'TASTING NOTES', tx, 60, lt - 0.5, { face: 'micro', color: P.tanShade, track: 2, align: 'center', dur: 0.9 });
  rule(ctx, tx, 70, 40, (lt - 0.7) / 0.9, P.tanShade, { alpha: 0.8 });
  fadeUp(ctx, 'OAK', tx, 80, lt - 1.1, { face: 'serif', color: P.cream, track: 3, align: 'center', dur: 0.9 });
  fadeUp(ctx, 'CARAMEL', tx, 98, lt - 1.7, { face: 'serif', color: P.cream, track: 3, align: 'center', dur: 0.9 });
  fadeUp(ctx, 'DIAL-UP', tx, 116, lt - 2.8, { face: 'serif', color: GOLD, track: 3, align: 'center', dur: 1.1 });
}

// --- 5. HERO -----------------------------------------------------------------------

const heroBg = lazy(() => gradient('bf-hero', W, H, { cx: 192, cy: 96, rx: 200, ry: 150, ramp: [P.black, P.maroon, P.brown], gamma: 1.8, seam: 0.45 }));
const texHero = lazy(() => labelTex(37));
const texSlate = lazy(() => labelTex(30));

function shotHero(ctx, lt) {
  ctx.drawImage(heroBg(), 0, 0);
  const up = smooth(prog(lt, 0.0, 1.3));
  beam(ctx, 192, 0, 192, 172, 40, 110, { color: P.cream, alpha: 0.035 * up });
  const k = tween(lt, 0, 2.8, 1, 1.07, 'inOut');
  const fy = 120;
  const base = round(fy + (172 - fy) * k);
  const prx = round(66 * k);
  const pry = round(9 * k);
  plinth(ctx, 192, base, prx, pry);
  const turn = tween(lt, 0, 2.8, 0.42, 0.5, 'inOut');
  const keyK = 0.25 + 0.75 * up;
  const sweep = lt > 0.5 && lt < 2.1 ? tween(lt, 0.5, 2.1, -1.3, 1.3, 'inOut') : null;
  // its reflection in the polished stone
  clipRect(ctx, 192 - prx, base, prx * 2, pry + 1);
  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.translate(0, 2 * (base + 2));
  ctx.scale(1, -1);
  bottle(ctx, 192, base + 2, k, texHero(), { turn, keyK, rimK: 0, sweep });
  ctx.restore();
  ctx.restore();
  contact(ctx, 192, base + 1, round(36 * k), 0.5);
  bottle(ctx, 192, base + 2, k, texHero(), { turn, keyK, rimK: 0.95 * up, sweep });
  glintStar(ctx, 188, base + 2 - round((BODY_H + STOP_H) * k) + 3, (lt - 1.9) / 0.8, P.white);
  vignette(ctx, 0.65);
}

// --- 6. SLATE ----------------------------------------------------------------------

const slateBg = lazy(() => gradient('bf-slate', W, H, { cx: 112, cy: 100, rx: 190, ry: 140, ramp: [P.black, P.maroon, P.brown], gamma: 1.9, seam: 0.45 }));
const LEGAL = 'BITFIZZ RESERVE IS A CARBONATED SOFT DRINK. CONTAINS NO ALCOHOL AND NO DATA. THE SERVER FARM WAS DECOMMISSIONED FOR UNRELATED REASONS. PLEASE FIZZ RESPONSIBLY.';

function shotSlate(ctx, lt) {
  ctx.drawImage(slateBg(), 0, 0);
  beam(ctx, 112, 0, 112, 170, 30, 90, { color: P.cream, alpha: 0.03 });
  plinth(ctx, 112, 170, 54, 8);
  contact(ctx, 112, 171, 30, 0.6);
  const top = bottle(ctx, 112, 172, 0.8, texSlate(), { turn: 0.47 + lt * 0.012 });
  glintStar(ctx, 109, top + 3, (lt - 2.3) / 0.9, P.white);
  vignette(ctx, 0.5);
  // the lock-up, right third
  const x = 270;
  trackIn(ctx, 'BITFIZZ', x, 50, lt - 0.1, { face: 'serif', color: GOLD, track: 3, from: 9, dur: 1.8, scale: 2 });
  fadeUp(ctx, 'RESERVE', x + 2, 80, lt - 0.8, { face: 'thin', color: P.cream, track: 7, align: 'center', dur: 1 });
  rule(ctx, x, 97, 110, (lt - 1.1) / 1, P.yellow, { alpha: 0.7 });
  fadeUp(ctx, 'UNCOMPRESSED.', x, 105, lt - 0.3, { face: 'serif', color: P.cream, track: 3, align: 'center', dur: 1.2 });
  fadeUp(ctx, 'AGED 12 YEARS IN A SERVER FARM', x, 124, lt - 1.6, { face: 'micro', color: P.tanShade, track: 1, align: 'center', dur: 1 });
}

// --- the whole spot ---------------------------------------------------------------

/** Letterbox and the legal line on the bottom bar are part of the film. */
function frame(ctx, dt) {
  letterbox(ctx, 1, BAR);
  if (dt > 20.9) smallPrint(ctx, LEGAL, W / 2, H - BAR + 5, W - 40, { color: P.steel, lt: dt - 20.9, dur: 1 });
}

const SHOTS = [
  { at: 0, draw: shotMacro },
  { at: 4.0, draw: shotCellar, wipe: 'fade', wd: 1.0 },
  { at: 8.6, draw: shotPour, wipe: 'fade', wd: 0.9 },
  { at: 13.4, draw: shotNose, wipe: 'black', wd: 0.8, hold: 0.05 },
  { at: 17.8, draw: shotHero, wipe: 'black', wd: 0.8, hold: 0.15 },
  { at: 20.4, draw: shotSlate, wipe: 'fade', wd: 1.0 },
];

// Lounge jazz at 72 bpm in D minor, 8 bars: soft sine chords, a walking bass,
// a sparse electric-piano motif, brushes. Bar 7 (20.0 s) resolves to F major 9
// under the end slate.
const EP = { wave: 'sine', a: 0.004, d: 0.9, s: 0.12, r: 0.5, vib: false };
const PADI = { wave: 'sine', a: 0.35, d: 1.2, s: 0.75, r: 0.9, vib: [6, 4.5, 0.3] };
export default {
  id: 'bitfizz-cola',
  brand: 'BITFIZZ RESERVE',
  duration: 24,
  voice: { gender: 'male', lang: 'en-GB', pitch: 0.82, rate: 0.9 },
  script: [
    { at: 0.8, text: 'Some things cannot be rushed.' },
    { at: 4.4, text: 'Aged twelve years, in a decommissioned server farm.' },
    { at: 9.0, text: 'Poured over ice, hand-chipped by a retired sysadmin.' },
    { at: 13.8, text: 'Notes of oak, caramel... and dial-up.' },
    { at: 18.4, text: 'BitFizz Reserve.' },
    { at: 20.6, text: 'Uncompressed.' },
  ],
  tune: {
    bpm: 72,
    swing: 0.18,
    room: 0.5,
    echo: { beats: 0.75, feedback: 0.28 },
    loudness: -2,
    tracks: [
      {
        kind: 'harmony', inst: PADI, gain: 0.8,
        notes: tune(
          'D3+F3+A3+C4+E4:4@0.42 Bb2+D3+F3+A3+C4:4@0.42 G2+Bb2+D3+F3+A3:4@0.42 A2+C#3+G3+Bb3+E4:4@0.4',
          'D3+F3+A3+C4+E4:4@0.42 Bb2+D3+F3+A3+E4:4@0.42 F2+A2+C3+E3+G3:4@0.5 D3+F3+A3+C4+E4:4@0.36',
        ),
      },
      {
        kind: 'bass', inst: 'sine', gain: 0.9,
        notes: tune('D2:2@0.7 A1:2@0.6 Bb1:2@0.7 F2:2@0.6 G1:2@0.7 D2:2@0.6 A1:2@0.7 E2:1@0.6 C#2:1@0.6', 'D2:2@0.7 A1:1@0.6 C2:1@0.6 Bb1:2@0.7 F2:2@0.6 F1:2@0.75 C2:2@0.6 D2:4@0.6'),
      },
      {
        kind: 'lead', inst: EP, gain: 0.7, echo: 0.35,
        notes: tune(
          'R:2 A4:1@0.4 E5:1@0.35 D5:3@0.4 R:1 R:2 Bb4:1@0.35 F5:1@0.35 E5:2@0.4 C#5:2@0.35',
          'R:4 R:2 A4:0.5@0.35 C5:0.5@0.35 E5:1@0.4 A5:2@0.45 G5:1@0.4 E5:1@0.4 D5:4@0.35',
        ),
      },
      {
        drums: tune(
          'H:1@0.12 H:1@0.1 H:1@0.12 H:1@0.1 H:1@0.12 H:1@0.1 H:1@0.12 H:1@0.1',
          'K:1@0.3 H:0.5@0.14 H:0.5@0.1 X:1@0.18 H:1@0.12 K:1@0.3 H:0.5@0.14 H:0.5@0.1 X:1@0.18 H:1@0.12',
          'K:1@0.3 H:0.5@0.14 H:0.5@0.1 X:1@0.18 H:1@0.12 K:1@0.3 H:0.5@0.14 H:0.5@0.1 X:1@0.18 H:1@0.12',
          'K:1@0.32 H:1@0.12 X:1@0.16 H:1@0.1 R:4',
        ),
      },
    ],
  },
  draw(ctx, t, dt, info) {
    warmUp(SHOTS, dt, info);
    play(ctx, dt, info, SHOTS);
    frame(ctx, dt);
  },
};
