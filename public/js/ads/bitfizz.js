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
  P, W, H, R, A, oval, poly, ring, disc, line, cached, lazy, play, key, tween, prog, smooth, lerp, clamp,
  type, trackIn, fadeUp, rule, smallPrint, gradient, vignette, letterbox, beam, contact, glintStar,
  lathe, ovalRing, bubbles, motes, hash01, clipRect, warmUp, tune,
} from './kit.js';

const { round, sin, cos, PI, max, abs, floor, ceil, sqrt } = Math;

const BAR = 24; // letterbox bar height (2.2:1)
const GOLD = [P.cream, P.yellow, P.yellow];
// Backlit whisky-amber, dark to light; orange only where the light passes through.
const AMBER = [P.black, P.maroon, P.brown, P.tanShade, P.orange, P.yellow];
const GILT = [P.black, P.brown, P.tanShade, P.yellow, P.cream];
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

/**
 * The label texture for a bottle of radius r: one full turn wide, a black
 * panel with gilt borders over the front 0.45 of a turn. The words are not in
 * the texture: resampled round the curve they would crawl and chop, so they
 * are set flat over the front of the label (labelText), where the curve is
 * nearly flat, and the bottle only turns while the label is blank.
 */
const labelTex = (r) =>
  cached(
    `bf-label2-${r}`,
    round(2 * PI * r),
    round(r * 1.5),
    (c) => {
      const tw = round(2 * PI * r);
      const lh = round(r * 1.5);
      const lw = round(tw * 0.45);
      const x0 = round((tw - lw) / 2);
      R(c, x0, 0, lw, lh, P.black);
      R(c, x0 + 2, 2, lw - 4, 1, P.yellow);
      R(c, x0 + 2, lh - 3, lw - 4, 1, P.yellow);
      R(c, x0 + 2, 2, 1, lh - 4, P.tanShade);
      R(c, x0 + lw - 3, 2, 1, lh - 4, P.tanShade);
    },
    { cpu: true },
  );

/** The label's words, flat over its front; `big` for the hero bottle, else the end-slate one. */
function labelText(ctx, cx, top, big, alpha) {
  if (alpha <= 0) return;
  const a0 = ctx.globalAlpha;
  ctx.globalAlpha = a0 * alpha;
  if (big) {
    type(ctx, 'BITFIZZ', cx, top + 7, { face: 'serif', color: GOLD, align: 'center' });
    type(ctx, 'RESERVE', cx + 1, top + 22, { face: 'body', color: P.yellow, track: 2, align: 'center' });
    R(ctx, cx - 10, top + 32, 21, 1, P.tanShade);
    type(ctx, 'AGED 12 YEARS', cx, top + 36, { face: 'micro', color: P.cream, track: 1, align: 'center' });
    type(ctx, 'SERVER FARM 7', cx, top + 44, { face: 'micro', color: P.tanShade, track: 1, align: 'center' });
  } else {
    type(ctx, 'BITFIZZ', cx, top + 8, { face: 'body', color: P.cream, align: 'center' });
    type(ctx, 'RESERVE', cx + 1, top + 19, { face: 'micro', color: P.yellow, track: 1, align: 'center' });
  }
  ctx.globalAlpha = a0;
}

const LAB = { cv: null, top: 0, h: 0, turn: 0.5 };
const GLASS = { top: 0, edge: 1.4, wall: 0.9, edgeColor: P.tanShade };
const BODY_O = { rows: 0, ramp: AMBER, ambient: 0.1, glass: GLASS, label: LAB, stripes: STRIPES, rim: RIM, key: 1, seam: 0.5 };
const STOP_O = { rows: 0, ramp: GILT, ambient: 0.14, stripes: STOP_STRIPES, rim: RIM, key: 1, seam: 0.5 };

/**
 * Bottle standing on y = bottom, axis at cx, at scale k. tex: the label texture
 * (built for the nominal radius); sweep: x of the moving softbox (-1.3..1.3) or null.
 */
const BO = { turn: 0.5, keyK: 1, rimK: 0.95, sweep: null, text: 0, big: true }; // pooled options
function bottle(ctx, cx, bottom, k, tex, o) {
  const { turn, keyK, rimK, sweep, text, big } = o;
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
  if (text > 0) labelText(ctx, cx, top + sh + LAB.top, big, text);
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
// A decommissioned server hall turned bonded warehouse. The only light is a
// high industrial window; its beam lands on the floor and catches the racks
// that pass through it as the camera trucks right (each rack layer is baked
// twice, unlit and lit, and the lit one shows only inside the beam).

const CW = 560; // the hall is wider than the frame so the camera can travel
const CELLAR_LEN = 4.17;

const hallBack = lazy(() =>
  cached('bf-hall-back2', CW, H, (c) => {
    c.drawImage(gradient('bf-hall-wall', CW, H, { kind: 'vertical', ramp: [P.black, P.ink, P.black], from: 0.05, to: 1, seam: 0.4 }), 0, 0);
    // concrete panels with a darker seam and a faint lit lip
    for (let x = 0; x < CW; x += 72) {
      R(c, x, 30, 1, 140, P.black);
      R(c, x + 1, 30, 1, 140, A(P.slate, 0.25));
    }
    R(c, 0, 92, CW, 1, P.black);
    // the high industrial window: a recess with depth, a lit sill, dirty panes
    const wx = 76;
    const wy = 36;
    for (let i = 4; i >= 1; i--) oval(c, wx + 30, wy + 22, 30 + i * 9, 22 + i * 7, A(P.steel, 0.05));
    R(c, wx - 4, wy - 4, 68, 51, P.black); // the reveal
    R(c, wx - 4, wy - 4, 3, 51, P.ink); // its left cheek, catching a little light
    R(c, wx - 4, wy + 45, 68, 2, P.slate); // the sill
    R(c, wx - 4, wy + 45, 68, 1, P.fog);
    for (let gy = 0; gy < 3; gy++) {
      for (let gx = 0; gx < 5; gx++) {
        const px = wx + gx * 12;
        const py = wy + gy * 15;
        const dirty = hash01(gx + gy * 5, 4) < 0.25;
        const broken = gx === 3 && gy === 1;
        R(c, px, py, 11, 14, broken ? P.ink : dirty ? P.slate : gy === 0 ? P.fog : P.steel);
        if (!broken) R(c, px, py, 11, 1, dirty ? P.steel : P.silver);
        if (!dirty && !broken && (gx + gy) % 2) R(c, px + 1, py + 2, 1, 10, A(P.silver, 0.5));
        if (dirty) for (let k = 0; k < 6; k++) R(c, px + 1 + floor(hash01(k + gx * 9, gy + 11) * 9), py + 2 + floor(hash01(k + gy * 7, gx + 13) * 11), 1, 1, P.steel);
      }
    }
    // cable trays along the ceiling and a cable sagging out of one
    R(c, 0, 24, CW, 3, P.black);
    R(c, 0, 27, CW, 1, P.ink);
    for (let x = 300; x < 420; x++) {
      const u = (x - 300) / 120;
      R(c, x, 28 + round(16 * u * (1 - u) * 4 * 0.5), 1, 1, P.black);
    }
    // floor: polished concrete, darker away from the window
    c.drawImage(gradient('bf-hall-floor', CW, 30, { kind: 'vertical', ramp: [P.ink, P.black], seam: 0.5 }), 0, 168);
    R(c, 0, 168, CW, 1, P.slate);
  }),
);

// Bottle ends (bottles lie on their sides, bases toward us): hand-pixelled
// variants. Keys: k black, m maroon, b brown, t tan shade, o orange, c cream.
const ENDS_NEAR = [
  ['...kkkkk...', '..kmmmmmk..', '.kmbbtbbmk.', 'kmbtmmmbbmk', 'kmbmkkkmbmk', 'kmbmkkkmbmk', 'kmbmkkkmbmk', 'kmbbmmmbbmk', '.kmbbbbbmk.', '..kmmmmmk..', '...kkkkk...'],
  ['...kkkkk...', '..kmmmmmk..', '.kmbtbbbmk.', 'kmbbbmmmbmk', 'kmbbmkkkmmk', 'kmbbmkkkmmk', 'kmbbbmmmbmk', 'kmbbbbbbbmk', '.kmbbbbbmk.', '..kmmmmmk..', '...kkkkk...'],
  ['...kkkkk...', '..kbbbbbk..', '.kbtttttbk.', 'kbttoootbbk', 'kbtobbbotbk', 'kbtobkbotbk', 'kbtobbbotbk', 'kbttoootbbk', '.kbtttttbk.', '..kbbbbbk..', '...kkkkk...'],
];
const ENDS_FAR = [['.kmk.', 'kmbmk', 'mbkbm', 'kmbmk', '.kmk.'], ['.kmk.', 'kbbmk', 'mbkmm', 'kmmmk', '.kmk.'], ['.kbk.', 'kbtbk', 'btobb', 'kbtbk', '.kbk.']];
const DARK_KEY = { k: P.black, m: P.maroon, b: P.brown, t: P.tanShade, o: P.tanShade, c: P.cream };
// in the beam: one step warmer, the glass rim catches the light
const LIT_KEY = { k: P.maroon, m: P.brown, b: P.tanShade, t: P.orange, o: P.yellow, c: P.cream };
function stamp(c, rows, x, y, keys) {
  for (let j = 0; j < rows.length; j++) {
    const row = rows[j];
    for (let i = 0; i < row.length; i++) if (row[i] !== '.') R(c, x + i, y + j, 1, 1, keys[row[i]]);
  }
}

/** A rack cabinet: frame, 1U rails, bottles resting where the servers were. */
function paintRack(c, x, y, w, h, near, seed, lit) {
  const keys = lit ? LIT_KEY : DARK_KEY;
  const ends = near ? ENDS_NEAR : ENDS_FAR;
  const s = near ? 11 : 5;
  const pitchX = s + (near ? 2 : 1);
  const pitchY = s + (near ? 4 : 3);
  R(c, x, y, w, h, P.black);
  R(c, x, y, 2, h, lit ? P.brown : P.ink);
  R(c, x + w - 2, y, 2, h, P.ink);
  R(c, x, y, w, 2, lit ? P.tanShade : P.ink);
  if (lit) R(c, x, y, 1, h, P.tanShade); // the post's edge facing the window
  const rows = Math.floor((h - 8) / pitchY);
  const cols = Math.floor((w - 6) / pitchX);
  const ox = x + round((w - cols * pitchX) / 2) + 1;
  for (let j = 0; j < rows; j++) {
    const yy = y + 5 + j * pitchY;
    R(c, x + 2, yy + s + 1, w - 4, 1, lit ? P.brown : P.ink); // shelf rail
    if (lit) R(c, x + 2, yy + s + 1, w - 4, 1, A(P.tanShade, 0.6));
    if (hash01(j, seed) < 0.16) {
      // an old server left in the rack: dark faceplate, vents, dead lights
      R(c, x + 3, yy, w - 6, s, P.ink);
      R(c, x + 3, yy, w - 6, 1, lit ? P.brown : P.slate);
      for (let v = x + 8; v < x + w - 10; v += 3) R(c, v, yy + (s >> 1) - 1, 1, 2, P.black);
      continue;
    }
    for (let i = 0; i < cols; i++) {
      const bx = ox + i * pitchX;
      const hsh = hash01(i + j * 31, seed + 9);
      if (hsh < 0.08) continue; // one already drunk
      // bottles do not line up perfectly: some sit a pixel deeper or higher
      const dy = hash01(i + j * 17, seed + 3) < 0.25 ? 1 : 0;
      stamp(c, ends[floor(hash01(i * 7 + j, seed + 5) * ends.length)], bx, yy + dy, keys);
      if (lit && near && hsh > 0.7) R(c, bx + 2, yy + dy + 2, 1, 1, P.cream); // a glint on the rim
    }
    if (near && j % 2 === 0) {
      // a vintage tag tied to the rail, and dust along it
      const tx = x + 6 + round(hash01(j, seed + 7) * (w - 20));
      R(c, tx, yy + s + 2, 1, 2, lit ? P.tanShade : P.brown);
      R(c, tx - 2, yy + s + 4, 5, 4, lit ? P.cream : P.tanShade);
      R(c, tx - 1, yy + s + 5, 3, 1, lit ? P.tanShade : P.brown);
    }
    if (lit) for (let k = 0; k < 4; k++) R(c, x + 3 + floor(hash01(k + j * 5, seed + 2) * (w - 6)), yy + s, 1, 1, A(P.cream, 0.5));
  }
}

const hallRacks = lazy(() => cached('bf-hall-racks2', CW, H, (c) => { for (let k = 0; k < 9; k++) paintRack(c, 150 + k * 58, 74, 46, 96, false, k + 1, false); }));
const hallRacksLit = lazy(() => cached('bf-hall-racks2-lit', CW, H, (c) => { for (let k = 0; k < 9; k++) paintRack(c, 150 + k * 58, 74, 46, 96, false, k + 1, true); }));
const hallNear = lazy(() => cached('bf-hall-near2', 150, H, (c) => { paintRack(c, 4, 26, 142, 170, true, 77, false); for (let y = 40; y < 180; y += 9) R(c, 8, y, 1, 2, P.black); }));
const hallNearLit = lazy(() => cached('bf-hall-near2-lit', 150, H, (c) => paintRack(c, 4, 26, 142, 170, true, 77, true)));
// the haze between the rows of racks, thicker near the floor
const hallHaze = lazy(() => gradient('bf-hall-haze', CW, H, { kind: 'vertical', ramp: [P.black, P.ink], from: 0.3, to: 1, seam: 0.6 }));

// the window beam falls from the window to the floor on the right
const BEAM = { x0: 106, y0: 52, x1: 214, y1: 186, w0: 56, w1: 150 };
function inBeam(x, y) {
  const s = (y - BEAM.y0) / (BEAM.y1 - BEAM.y0);
  if (s < 0 || s > 1) return false;
  const cx = BEAM.x0 + (BEAM.x1 - BEAM.x0) * s;
  const hw = (BEAM.w0 + (BEAM.w1 - BEAM.w0) * s) / 2;
  return abs(x - cx) < hw * 0.8;
}
/** Clip to the beam (k = share of its width), shifted by the back wall's travel; caller restores. */
function clipBeam(ctx, dx, k) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(BEAM.x0 - (BEAM.w0 * k) / 2 + dx, BEAM.y0);
  ctx.lineTo(BEAM.x0 + (BEAM.w0 * k) / 2 + dx, BEAM.y0);
  ctx.lineTo(BEAM.x1 + (BEAM.w1 * k) / 2 + dx, BEAM.y1);
  ctx.lineTo(BEAM.x1 - (BEAM.w1 * k) / 2 + dx, BEAM.y1);
  ctx.closePath();
  ctx.clip();
}

function shotCellar(ctx, lt) {
  const cam = tween(lt, 0, CELLAR_LEN + 0.8, 0, 64, 'inOut');
  const back = -round(cam * 0.35);
  const mid = -round(cam * 0.7);
  ctx.drawImage(hallBack(), back, 0);
  // the beam's pool on the floor, brightest where it lands
  oval(ctx, BEAM.x1 + 6 + back, 181, 74, 7, A(P.cream, 0.05));
  oval(ctx, BEAM.x1 + 2 + back, 181, 52, 5, A(P.cream, 0.06));
  oval(ctx, BEAM.x1 - 2 + back, 180, 30, 3, A(P.yellow, 0.07));
  // far racks: dark, then their lit version inside the beam
  ctx.drawImage(hallRacks(), mid, 0);
  clipBeam(ctx, back, 0.95);
  ctx.globalAlpha = 0.55;
  ctx.drawImage(hallRacksLit(), mid, 0);
  ctx.restore();
  clipBeam(ctx, back, 0.6);
  ctx.globalAlpha = 0.6;
  ctx.drawImage(hallRacksLit(), mid, 0);
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.drawImage(hallHaze(), mid, 0);
  ctx.restore();
  // the shaft itself and its dust, riding with the back wall
  ctx.save();
  ctx.translate(back, 0);
  beam(ctx, BEAM.x0, BEAM.y0, BEAM.x1, BEAM.y1, BEAM.w0, BEAM.w1, { color: P.silver, alpha: 0.045 });
  beam(ctx, BEAM.x0 + 4, BEAM.y0, BEAM.x1 + 10, BEAM.y1, BEAM.w0 * 0.5, BEAM.w1 * 0.5, { color: P.cream, alpha: 0.035 });
  motes(ctx, lt, { x: 60, y: 50, w: 200, h: 140, n: 46, seed: 9, drift: 5, fall: 1.2, color: P.cream, alpha: 0.75, inside: inBeam });
  ctx.restore();
  // a bottle in the far racks catches the beam
  glintStar(ctx, 268 + mid, 103, ((lt + 0.4) % 3.2) / 1.1, P.cream);
  // the near rack slides past on the right, sharp, and into the edge of the light
  const nx = 300 - round(cam * 1.25);
  ctx.drawImage(hallNear(), nx, 0);
  clipBeam(ctx, back, 1.1);
  ctx.globalAlpha = 0.7;
  ctx.drawImage(hallNearLit(), nx, 0);
  ctx.restore();
  // the one status light still on, breathing slowly
  const g = 0.35 + 0.65 * (0.5 + 0.5 * sin(lt * 1.7));
  R(ctx, nx + 8, 76, 1, 2, A(P.green, g));
  R(ctx, nx + 7, 75, 3, 4, A(P.green, g * 0.15));
  // foreground post: out of focus, crossing fast
  const fx = 470 - round(cam * 2.4);
  R(ctx, fx - 2, 0, 2, H, A(P.black, 0.5));
  R(ctx, fx, 0, 24, H, P.black);
  R(ctx, fx + 24, 0, 2, H, A(P.black, 0.5));
  vignette(ctx, 0.6);
  // documentary caption, bottom left above the bar; gone before the dissolve
  const out = 1 - smooth(prog(lt, CELLAR_LEN - 0.55, CELLAR_LEN - 0.2));
  fadeUp(ctx, 'SERVER FARM 7', 20, H - BAR - 22, lt - 1.0, { face: 'body', color: P.cream, track: 2, dur: 1, alpha: out });
  fadeUp(ctx, 'SLOUGH, BERKSHIRE', 20, H - BAR - 11, lt - 1.3, { face: 'micro', color: P.silver, track: 1, dur: 1, alpha: out });
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
const BASE_O = { rows: 0, ramp: CRYSTAL, ambient: 0.3, stripes: T_STRIPES, rim: false, tilt: 0.2, seam: 0.12 }; // clean bands, no dither noise
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
const ICE_CHIP = [[0, 0], [0, 0], [0, 0]];
function edge(ctx, p0, p1, col) {
  line(ctx, p0[0], p0[1], p1[0], p1[1], col);
}
/**
 * A hand-chipped cube: a top face with one chipped facet, a lit face toward the
 * key (left) and an amber face that refracts the whisky (right); only the edges
 * that face the key catch it. strong: above the surface; else seen through it.
 */
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
  const back = ICE[(f + 2) % 4];
  const d = s * 1.05;
  ICE_L[0][0] = l[0]; ICE_L[0][1] = l[1]; ICE_L[1][0] = c[0]; ICE_L[1][1] = c[1];
  ICE_L[2][0] = c[0]; ICE_L[2][1] = c[1] + d; ICE_L[3][0] = l[0]; ICE_L[3][1] = l[1] + d * 0.9;
  ICE_R[0][0] = c[0]; ICE_R[0][1] = c[1]; ICE_R[1][0] = rr[0]; ICE_R[1][1] = rr[1];
  ICE_R[2][0] = rr[0]; ICE_R[2][1] = rr[1] + d * 0.95; ICE_R[3][0] = c[0]; ICE_R[3][1] = c[1] + d;
  // the chip: a facet knocked off the corner nearest the key light
  const lft = l[0] < rr[0] ? l : rr;
  ICE_CHIP[0][0] = lft[0]; ICE_CHIP[0][1] = lft[1];
  ICE_CHIP[1][0] = lft[0] + (back[0] - lft[0]) * 0.45; ICE_CHIP[1][1] = lft[1] + (back[1] - lft[1]) * 0.45;
  ICE_CHIP[2][0] = lft[0] + (c[0] - lft[0]) * 0.4; ICE_CHIP[2][1] = lft[1] + (c[1] - lft[1]) * 0.4;
  const k = strong ? 1 : 0.5;
  const lit = l[0] < rr[0] ? ICE_L : ICE_R;
  const dark = lit === ICE_L ? ICE_R : ICE_L;
  poly(ctx, dark, A(P.orange, 0.3 * k)); // refracting the amber
  poly(ctx, lit, A(P.cream, 0.34 * k));
  poly(ctx, ICE, A(P.white, 0.22 * k));
  poly(ctx, ICE_CHIP, A(P.white, 0.4 * k));
  // edges: lit where they face the key, quiet elsewhere
  const hi = A(P.white, 0.85 * k);
  const lo = A(P.cream, 0.32 * k);
  edge(ctx, back, lft, hi);
  edge(ctx, lft, c, hi);
  edge(ctx, c, lft === l ? rr : l, lo);
  edge(ctx, lft === l ? rr : l, back, lo);
  R(ctx, c[0], c[1], 1, round(d), A(P.white, 0.5 * k));
  // a fracture inside, catching a little light
  line(ctx, x - s * 0.25, y + s * 0.55, x + s * 0.15, y + s * 0.9, A(P.cream, 0.3 * k));
}

/** The bottle's neck tilted into the top of frame, mid-pour: dark glass, gilt collar (solid bands). */
const NECK = [[0, 0], [0, 0], [0, 0], [0, 0]];
const BAND = [[0, 0], [0, 0], [0, 0], [0, 0]];
const NECK_ANG = 0.6; // radians below horizontal
/** Fill a band of the neck between lengths i0..i1 and across offsets q0..q1 (in units of the half width). */
function neckBand(ctx, mx, my, hw, len, i0, i1, q0, q1, col) {
  const dx = cos(NECK_ANG);
  const dy = sin(NECK_ANG);
  const w0 = hw * (1 + (0.3 * i0) / len);
  const w1 = hw * (1 + (0.3 * i1) / len);
  BAND[0][0] = mx - dx * i0 - dy * q0 * w0; BAND[0][1] = my - dy * i0 + dx * q0 * w0;
  BAND[1][0] = mx - dx * i0 - dy * q1 * w0; BAND[1][1] = my - dy * i0 + dx * q1 * w0;
  BAND[2][0] = mx - dx * i1 - dy * q1 * w1; BAND[2][1] = my - dy * i1 + dx * q1 * w1;
  BAND[3][0] = mx - dx * i1 - dy * q0 * w1; BAND[3][1] = my - dy * i1 + dx * q0 * w1;
  poly(ctx, BAND, col);
}
function neck(ctx, mx, my, k) {
  const len = 160 * k;
  const hw = 9 * k;
  // dark glass, then the amber core seen through it, then the softbox line on top
  neckBand(ctx, mx, my, hw, len, 0, len, -1, 1, P.black);
  neckBand(ctx, mx, my, hw, len, 3, len, -0.7, 0.7, P.maroon);
  neckBand(ctx, mx, my, hw, len, 3, len, -0.42, 0.42, P.brown);
  neckBand(ctx, mx, my, hw, len, 4, len, -0.82, -0.7, P.tanShade);
  // gilt foil collar near the lip, in three solid bands, and the lip
  neckBand(ctx, mx, my, hw, len, 10 * k, 18 * k, -1, -0.3, P.yellow);
  neckBand(ctx, mx, my, hw, len, 10 * k, 18 * k, -0.3, 0.4, P.tanShade);
  neckBand(ctx, mx, my, hw, len, 10 * k, 18 * k, 0.4, 1, P.brown);
  neckBand(ctx, mx, my, hw, len, 10 * k, 11 * k, -1, 1, P.cream);
  neckBand(ctx, mx, my, hw, len, 0, 2, -1, 0, P.cream);
  neckBand(ctx, mx, my, hw, len, 0, 2, 0, 1, P.tanShade);
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
    // slow-motion pour: the stream thins as it falls, swells a pixel in slow waves
    const w = max(2, round((4.4 - s * 1.9) * k) + (sin(y * 0.16 - lt * 3.2) > 0.55 ? 1 : 0));
    const x0 = x - (w >> 1);
    R(ctx, x0, y, w, 1, P.orange);
    R(ctx, x0 + w - 1, y, 1, 1, P.tanShade);
    // a highlight that twists across the stream as it travels down
    const hx = x0 + round((w - 2) * (0.5 + 0.5 * sin(y * 0.28 - lt * 4.5)));
    R(ctx, hx, y, 1, 1, (y - lt * 26) % 13 < 2 ? P.cream : P.yellow);
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
// A man in his forties in profile, facing left into a low warm key, raises the
// glass to just under his nose, breathes in and closes his eyes. The bust is a
// baked sprite: organic region outlines, banded key-light shading computed per
// pixel at bake time (the distance light travels through the figure, so the
// bands follow the forms), then hand-placed features: brow, lidded eye with
// lashes, nostril wing, two-tone lips, nasolabial fold, ear with its concha,
// hair clumps, shirt collar, lapel. Sprite space: x = 0 at the nose tip, y = 0
// at the crown; the head is 79 px from crown to chin (about 1/7 of his height).

const noseBg = lazy(() => gradient('bf-nose', W, H, { cx: 300, cy: 78, rx: 210, ry: 160, ramp: [P.black, P.maroon, P.brown], gamma: 1.5, seam: 0.45 }));

const HEAD_PTS = [
  [0, 51], [0.4, 49.5], [2, 47.6], [4, 45.4], [6, 43], [7.8, 40.4], [9.4, 37.6], [8.6, 35.2], [7.2, 33], [7.4, 30], [8, 26],
  [9, 21], [11, 16], [13.5, 11.5], [17, 7], [21, 4], [26, 1.8], [32, 0.5], [38, 0.3], [44, 1.2], [50, 3.5], [55, 7], [59, 11.5],
  [62, 17], [64, 23], [65, 30], [64.6, 37], [63.2, 44], [61, 50], [58.6, 56], [56.4, 61], [55, 64.5], [49, 65.5], [44, 66],
  [41, 69.5], [37, 73], [31.5, 76.4], [25, 78.6], [18, 79.2], [13.4, 77.6], [10.6, 75], [9.6, 72.2], [10.2, 69.6], [11.6, 67.6],
  [9.4, 66.2], [8.2, 64.2], [9.2, 62.4], [7.4, 61.2], [7, 59.6], [8.2, 58], [8.6, 56.4], [5.6, 55.6], [2.6, 54.6], [0.7, 53.2],
];
const NECK_PTS = [[19, 77.5], [27, 77.6], [40, 70], [45, 65], [56, 62], [57.5, 72], [59.5, 86], [62, 100], [24.5, 100], [22.6, 92], [21.2, 88.4], [22.2, 84.4], [20.4, 80]];
const HAIR_PTS = [
  [12.6, 13.6], [16.6, 6.6], [20.8, 3.4], [26, 1.2], [32, -0.2], [38, -0.4], [44, 0.6], [50.4, 2.9], [55.6, 6.5], [59.6, 11.1],
  [62.7, 16.7], [64.7, 22.9], [65.7, 30], [65.3, 37], [63.9, 44.2], [61.8, 50.3], [59.6, 55.2], [57.2, 57.8], [55.6, 56.4],
  [54.4, 58.6], [53.6, 53], [52.6, 44], [49.6, 39.6], [45.6, 38], [42, 39.4], [40.6, 41], [40.4, 47.6], [38.6, 48.4], [37.2, 46],
  [36.8, 38.4], [34.4, 32.4], [30.4, 28.6], [27.6, 24.4], [25.6, 19], [22.8, 16.4], [18, 15.2], [14.4, 14.6],
];
const EAR_PTS = [[43.6, 41], [46.6, 38.6], [50.4, 39.4], [52.6, 42.8], [53.2, 48], [52.2, 53], [50.2, 57], [47.6, 59.6], [45.4, 59.2], [44.4, 56.2], [45, 52.2], [43.4, 48.6], [42.8, 44.4]];
const COLLAR_PTS = [[21.6, 95], [26, 92.6], [36, 94.2], [46, 94.6], [57, 93.4], [61.6, 95.4], [63.4, 101], [60, 106], [46, 103.6], [36.4, 108], [30.6, 115], [27, 109], [23, 103]];
const SUIT_PTS = [
  [16.4, 108], [22.6, 102.4], [29, 113], [30.6, 115.4], [37, 107.6], [47, 103.4], [60, 104.6], [64, 100], [72, 103.6], [86, 108.6],
  [100, 114], [111, 122], [118, 134], [122, 150], [125, 172], [6, 172], [8, 150], [11, 128], [13.6, 116],
];
// the shirt front in the open collar, between the lapel and the chest
const SHIRT_PTS = [[16.4, 108], [22.6, 102.4], [29, 113], [28, 124], [24.6, 134], [13.4, 130], [13.6, 116]];

// region ids in the bake buffer
const SKIN_ID = 1;
const HAIR_ID = 2;
const EAR_ID = 3;
const SUIT_ID = 4;
const COLL_ID = 5;
const SHIRT_ID = 6;
const BUST_W = 128;
const BUST_H = 172;
const BUST_OX = 6; // sprite x = 0 (nose tip) sits 6 px into the canvas
const HEAD_DY = 0; // the head bakes in place; it is drawn 1 px off for the inhale

function inPts(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inEll = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

/**
 * Rasterise the regions (painter order) into an id buffer, then light every
 * pixel by how far the key light (from front-left, a little above) travels
 * through the figure to reach it: the bands hug the forms like a real key.
 */
function bakeRegions(w, h, ox, oy, regions) {
  const id = new Uint8Array(w * h);
  for (const [rid, pts] of regions) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) if (inPts(pts, x + 0.5 - ox, y + 0.5 - oy)) id[y * w + x] = rid;
    }
  }
  const dist = new Float32Array(w * h);
  const LX = -0.83;
  const LY = -0.56;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!id[y * w + x]) continue;
      let d = 0;
      let px = x + 0.5;
      let py = y + 0.5;
      while (d < 30) {
        px += LX * 0.5;
        py += LY * 0.5;
        const ix = floor(px);
        const iy = floor(py);
        if (ix < 0 || iy < 0 || ix >= w || iy >= h || !id[iy * w + ix]) break;
        d += 0.5;
      }
      dist[y * w + x] = d;
    }
  }
  return { id, dist };
}

const SKIN_BANDS = [P.skin, P.tan, P.tanShade, P.brown, P.maroon];
function skinBand(d, x, y) {
  let b = d <= 1.2 ? 0 : d <= 3 ? 1 : d <= 7 ? 2 : d <= 13 ? 3 : 4;
  // facial planes: the socket and the hollow under the cheekbone fall away
  if (b >= 2 && inEll(x, y, 15, 38, 4, 2.6)) b += 1;
  if (b >= 3 && inEll(x, y, 27, 58, 6, 4)) b += 1;
  return SKIN_BANDS[clamp(b, 0, 4)];
}

// hand-placed features over the baked head ([colour key, x, y] runs in sprite space)
const FEATURE_KEYS = { k: P.black, m: P.maroon, b: P.brown, t: P.tanShade, n: P.tan, s: P.skin, c: P.cream };
// rows of pixels: [x0, y, 'string'] where each char is a key or '.' (skip)
const FEATURES = [
  // brow: a soft ridge of hair over the socket, densest toward the front
  [10, 33, 'bmmmmb'],
  [10, 34, '.kkmm'],
  // nostril wing and the nostril
  [6, 52, 'mb'],
  [4, 53, 'kkm'],
  [6, 54, 'b'],
  // nasolabial fold running down from the wing
  [10, 56, 'b'], [11, 57, 'b'], [12, 58, 'b'], [12, 59, 'm'], [13, 60, 'm'],
  // lips: lit upper lip edge, the mouth line, a fuller lower lip that catches light
  [7, 59, 'n'], [7, 60, 'tb'], [8, 61, 'b'],
  [9, 62, 'kkm'],
  [8, 63, 'nt'], [8, 64, 'tb'], [9, 65, 'b'],
  [10, 66, 'mm'],
];
const EAR_FEATURES = [
  // helix rim catching a little light, a dark concha, the lobe
  [46, 39, 'bt'], [45, 40, 'bt'], [44, 41, 't'], [44, 42, 'b'],
  [47, 43, 'mkk'], [46, 44, 'mkkm'], [46, 45, 'mk'], [46, 46, 'mk'], [46, 47, 'mkk'], [47, 48, 'mkm'], [48, 49, 'mk'],
  [46, 56, 'b'], [47, 57, 'b'],
];
// hair clumps: combed back from a side part; only the lit ones show
const STRANDS = [
  [[13, 13], [17, 8], [23, 4.6], [31, 3]],
  [[15, 16.5], [20, 11], [27, 7.6], [36, 6]],
  [[19, 19.5], [25, 14], [32, 11], [41, 10.4]],
  [[25, 23], [31, 18], [38, 16]],
  [[30, 27], [36, 23], [44, 21.6], [52, 23]],
  [[40, 33], [47, 31], [54, 34]],
];
function paintFeatures(put, list) {
  for (const [x0, y, row] of list) for (let i = 0; i < row.length; i++) if (row[i] !== '.') put(x0 + i, y, FEATURE_KEYS[row[i]]);
}

const bustArt = lazy(() =>
  cached('bf-bust', BUST_W, BUST_H, (c) => {
    const regions = [
      [SUIT_ID, SUIT_PTS], [SHIRT_ID, SHIRT_PTS], [SKIN_ID, NECK_PTS], [COLL_ID, COLLAR_PTS],
      [SKIN_ID, HEAD_PTS], [HAIR_ID, HAIR_PTS], [EAR_ID, EAR_PTS],
    ];
    const { id, dist } = bakeRegions(BUST_W, BUST_H, BUST_OX, HEAD_DY, regions);
    const put = (x, y, col) => {
      const px = round(x) + BUST_OX;
      const py = round(y) + HEAD_DY;
      if (px >= 0 && py >= 0 && px < BUST_W && py < BUST_H) R(c, px, py, 1, 1, col);
    };
    for (let y = 0; y < BUST_H; y++) {
      for (let x = 0; x < BUST_W; x++) {
        const r = id[y * BUST_W + x];
        if (!r) continue;
        const d = dist[y * BUST_W + x];
        const sx = x + 0.5 - BUST_OX;
        const sy = y + 0.5;
        let col;
        if (r === SKIN_ID) {
          col = skinBand(d, sx, sy);
          // the jaw throws the neck into shadow
          if (sy > 66 && sx > 16 && d > 3) col = inPts(HEAD_PTS, sx, sy - 2.5) && sx > 24 ? P.black : P.maroon;
        } else if (r === EAR_ID) col = d <= 3 ? P.tanShade : d <= 14 ? P.brown : P.maroon;
        else if (r === HAIR_ID) col = d <= 1 ? P.tanShade : d <= 2.5 ? P.brown : d <= 5 ? P.maroon : P.black;
        // a white shirt: warm where the key reaches it, cool grey in shadow
        else if (r === COLL_ID) col = d <= 1.5 ? P.cream : d <= 4 ? P.fog : d <= 12 ? P.steel : P.slate;
        else if (r === SHIRT_ID) col = d <= 1.5 ? P.cream : d <= 4 ? P.fog : d <= 9 ? P.steel : P.slate;
        else col = d <= 1 ? P.brown : d <= 2.5 ? P.maroon : P.black; // charcoal suit, warm rim
        // selective outline: a back edge against the glow gets the darkest tone
        const right = x + 1 < BUST_W ? id[y * BUST_W + x + 1] : 0;
        if (!right && d > 4) col = P.black;
        R(c, x, y, 1, 1, col);
      }
    }
    // hair clumps: a dark parting under each lit strand; in the shadow they vanish
    for (const st of STRANDS) {
      for (let i = 0; i + 1 < st.length; i++) {
        const [ax, ay] = st[i];
        const [bx, by] = st[i + 1];
        const n = ceil(Math.hypot(bx - ax, by - ay));
        for (let q = 0; q <= n; q++) {
          const x = ax + ((bx - ax) * q) / n;
          const y = ay + ((by - ay) * q) / n;
          const ix = round(x) + BUST_OX;
          const iy = round(y);
          if (id[iy * BUST_W + ix] !== HAIR_ID) continue;
          const d = dist[iy * BUST_W + ix];
          if (d > 9) continue;
          put(x, y, d <= 3.5 ? P.tanShade : d <= 6 ? P.brown : P.maroon);
          if (id[(iy + 1) * BUST_W + ix] === HAIR_ID) put(x, y + 1, P.black);
        }
      }
    }
    paintFeatures(put, FEATURES);
    paintFeatures(put, EAR_FEATURES);
    // collar point and the lapel's edge, with stitching catching the rim light
    put(30, 114, P.tanShade);
    for (let y = 108; y < 160; y++) {
      const x = y < 122 ? 29 + (y - 108) * 0.55 : 36.7 - (y - 122) * 0.42;
      put(x, y, y < 122 ? P.maroon : P.brown);
      if (y > 124 && y % 3 === 0) put(x + 2, y, P.maroon);
    }
    put(37, 122, P.brown);
    put(38, 121, P.brown);
  }),
);

// The eye in its three states, placed over the baked head (sprite space 12..19, 36..41)
const EYES = [
  // open: the upper lid and lashes, a wet glint on the eyeball, the lower lid
  [[13, 36, 'mm'], [12, 37, 'kkkm'], [11, 38, 'kcbm'], [12, 39, 'mbb']],
  // half shut
  [[13, 36, 'bm'], [12, 37, 'mmmm'], [11, 38, 'kkkm'], [12, 39, 'mbb']],
  // closed: one curved lid line, the lashes pointing down
  [[13, 36, 'bb'], [12, 37, 'bmmm'], [12, 38, 'kkkm'], [11, 39, 'k.b']],
];
function eye(ctx, ox, oy, state) {
  const rows = EYES[state];
  for (const [x0, y, row] of rows) {
    for (let i = 0; i < row.length; i++) if (row[i] !== '.') R(ctx, ox + x0 + i, oy + y, 1, 1, FEATURE_KEYS[row[i]]);
  }
}

// --- the hand round the tumbler (glass-relative: x = 0 at its axis, y = 0 at its foot)
// The back of his right hand faces us; three fingers wrap the front of the glass
// with their nails toward the lens, knuckles at the right, the wrist below.
const HAND_W = 60;
const HAND_H = 52;
const HAND_OX = 20; // glass axis in the hand canvas
const HAND_OY = 26; // glass foot in the hand canvas
// [y top, thickness, x of the fingertip, x of the knuckle]: index, middle, ring
const FINGERS = [
  [-15, 4.4, -6.5, 14.6],
  [-10.4, 4.6, -8.5, 15.4],
  [-5.6, 4.3, -6, 15.8],
];
const BACK_PTS = [[12.4, -17.4], [17.6, -18], [22.4, -14.2], [25.8, -7], [27.6, 0], [28.4, 7.6], [19.4, 9.6], [15.2, 3.6], [12.8, -4.6]];
// a finger seen from its back: lit along the top, rounding into shadow underneath
const FINGER_RAMP = [P.tan, P.tan, P.tanShade, P.tanShade, P.brown, P.maroon];
function bakeHand(c) {
  const put = (x, y, col) => R(c, round(x) + HAND_OX, round(y) + HAND_OY, 1, 1, col);
  // the back of the hand, lit by the same key as his face
  const { id, dist } = bakeRegions(HAND_W, HAND_H, HAND_OX, HAND_OY, [[SKIN_ID, BACK_PTS]]);
  for (let y = 0; y < HAND_H; y++) {
    for (let x = 0; x < HAND_W; x++) {
      if (!id[y * HAND_W + x]) continue;
      const d = dist[y * HAND_W + x];
      R(c, x, y, 1, 1, SKIN_BANDS[d <= 1 ? 0 : d <= 3 ? 1 : d <= 7 ? 2 : d <= 12 ? 3 : 4]);
    }
  }
  // tendons fanning from the knuckles toward the wrist
  for (let i = 0; i < 2; i++) for (let y = -13; y < 3; y++) if (y % 5 !== 0) put(18.6 + i * 3.4 + (y + 13) * 0.3, y, i ? P.brown : P.tanShade);
  // the fingers, bottom one first so each overlaps the one below like a real grip
  for (let f = FINGERS.length - 1; f >= 0; f--) {
    const [y0, fh, tip, kn] = FINGERS[f];
    const n = round(fh);
    for (let x = ceil(tip); x <= kn; x++) {
      // the rounded fingertip: rows shrink toward the tip
      const u = (x - tip) / 2.4;
      const inset = u < 1 ? round((1 - sqrt(max(0, 1 - (1 - u) * (1 - u)))) * (n / 2)) : 0;
      for (let j = inset; j < n - inset; j++) {
        const v = (j + 0.5) / n;
        put(x, y0 + j, FINGER_RAMP[clamp(floor(v * FINGER_RAMP.length), 0, FINGER_RAMP.length - 1)]);
      }
      // the shadow it casts on the glass and on the finger below (not at the tip)
      if (x > tip + 3) put(x, y0 + n, x > kn - 4 ? P.maroon : P.black);
    }
    // nail at the tip, toward the lens; the two joint creases; the knuckle
    put(tip + 1, y0 + 1, P.cream);
    put(tip + 2, y0 + 1, P.skin);
    put(tip + 1, y0 + 2, P.skin);
    put(tip + 2, y0 + 2, P.tan);
    put(tip + 3, y0 + 1, P.tanShade);
    const dip = round(tip + 5.5);
    put(dip, y0 + 1, P.brown);
    put(dip, y0 + 2, P.tanShade);
    const pip = round(tip + 11.5 + f * 0.6);
    put(pip, y0 + 1, P.brown);
    put(pip + 1, y0 + 2, P.brown);
    put(pip, y0 + 2, P.tanShade);
    put(kn, y0 - 0.5, P.tan);
    put(kn + 1, y0, P.tanShade);
  }
  // the shirt cuff and the dark sleeve swallowing the wrist
  for (let x = 17; x < 31; x++) {
    const yy = 7 + (x - 17) * 0.14;
    put(x, yy, P.cream);
    put(x, yy + 1, P.fog);
    for (let y = yy + 2; y < 26; y++) put(x, y, x < 19 ? P.brown : x < 20 ? P.maroon : P.black);
  }
}
const handArt = lazy(() => cached('bf-hand', HAND_W, HAND_H, bakeHand));

const SMALL_KEYS = [[0, 16], [0.85, 15], [1, 15]];
const SPROF = new Float32Array(60);
const SMALL_CUTS = { cv: null, top: 0, h: 0, turn: 0.2 };
const SMALL_GLASS = { top: 0, edge: 1, wall: 1, edgeColor: P.tanShade };
const SMALL_O = { rows: 0, ramp: AMBER, ambient: 0.25, glass: SMALL_GLASS, label: SMALL_CUTS, stripes: [[-0.55, 0.07, P.cream]], rim: RIM, tilt: 0.2, seam: 0.5 };
const ARM_PTS = [[0, 0], [0, 0], [0, 0], [0, 0]];
// he breathes in (shoulders and chin up a pixel), holds, lets it go
const INHALE = [[0, 0], [2.5, 0], [3.1, -1, 'inOut'], [3.9, -1], [4.4, 0, 'inOut']];
const LEAN = [[0, 0], [1.4, 0], [2.2, 1, 'inOut']];
const BUST_X = 206; // screen x of the nose tip
const BUST_Y = 34; // screen y of the crown
const NOSE_LEN = 4.4;

function shotNose(ctx, lt) {
  ctx.drawImage(noseBg(), 0, 0);
  // a warm haze behind him; the background is the light, he is the shadow
  const breath = round(key(lt, INHALE));
  const lean = round(key(lt, LEAN));
  const bx = BUST_X - BUST_OX - lean;
  const by = BUST_Y + breath;
  ctx.drawImage(bustArt(), bx, by);
  const shut = lt < 2.05 ? 0 : lt < 2.2 ? 1 : 2;
  eye(ctx, bx + BUST_OX, by, shut);
  // the glass rises from below frame to just under his nose, slowing as it arrives
  const gp = smooth(prog(lt, 0.3, 2.3));
  const gx = BUST_X + 6 - lean;
  const gh = 23;
  const gy = round(lerp(H + 30, BUST_Y + 51 + 6 + gh + breath, gp)); // rim ~6 px under the nostril
  // forearm: from the wrist down out of frame
  ARM_PTS[0][0] = gx + 17;
  ARM_PTS[0][1] = gy + 12;
  ARM_PTS[1][0] = gx + 31;
  ARM_PTS[1][1] = gy + 12;
  ARM_PTS[2][0] = gx + 50;
  ARM_PTS[2][1] = H;
  ARM_PTS[3][0] = gx + 26;
  ARM_PTS[3][1] = H;
  poly(ctx, ARM_PTS, P.black);
  line(ctx, gx + 17, gy + 12, gx + 26, H, P.brown); // the sleeve's lit edge
  SMALL_GLASS.top = round(gh * 0.45);
  SMALL_O.rows = gh;
  SMALL_CUTS.cv = cutsTex();
  SMALL_CUTS.top = round(gh * 0.5);
  SMALL_CUTS.h = gh - SMALL_CUTS.top;
  lathe(ctx, gx, gy - gh, fill(SPROF, gh, SMALL_KEYS, 1), SMALL_O);
  ovalRing(ctx, gx, gy - gh + 3, 16, 3, A(P.cream, 0.55));
  ctx.drawImage(handArt(), gx - HAND_OX, gy - HAND_OY);
  vignette(ctx, 0.55);
  // tasting notes in the space he faces, on the voice
  const tx = 104;
  fadeUp(ctx, 'TASTING NOTES', tx, 62, lt - 0.4, { face: 'micro', color: P.cream, track: 2, align: 'center', dur: 0.9 });
  rule(ctx, tx, 72, 40, (lt - 0.6) / 0.9, P.tanShade);
  fadeUp(ctx, 'OAK', tx, 82, lt - 0.7, { face: 'serif', color: P.cream, track: 3, align: 'center', dur: 0.8 });
  fadeUp(ctx, 'CARAMEL', tx, 100, lt - 1.4, { face: 'serif', color: P.cream, track: 3, align: 'center', dur: 0.8 });
  fadeUp(ctx, 'DIAL-UP', tx, 118, lt - 2.6, { face: 'serif', color: GOLD, track: 3, align: 'center', dur: 1.0 });
}

// --- 5. HERO -----------------------------------------------------------------------

const heroBg = lazy(() => gradient('bf-hero', W, H, { cx: 192, cy: 96, rx: 200, ry: 150, ramp: [P.black, P.maroon, P.brown], gamma: 1.8, seam: 0.45 }));
const texHero = lazy(() => labelTex(37));
const texSlate = lazy(() => labelTex(30));

// lit only by a dim edge after the dip to black; the lights come up on the
// brand chord (lt 0.83 = 18.33 s), then a softbox sweep travels round the glass
const HERO_LEN = 3.33;
function shotHero(ctx, lt) {
  ctx.drawImage(heroBg(), 0, 0);
  const up = smooth(prog(lt, 0.8, 2.0));
  beam(ctx, 192, 0, 192, 172, 40, 110, { color: P.cream, alpha: 0.035 * up });
  const k = tween(lt, 0, HERO_LEN + 0.5, 1, 1.06, 'inOut');
  const fy = 120;
  const base = round(fy + (172 - fy) * k);
  const prx = round(66 * k);
  const pry = round(9 * k);
  plinth(ctx, 192, base, prx, pry);
  BO.turn = 0.5; // label square to the lens the whole shot
  BO.keyK = 0.22 + 0.78 * up;
  BO.sweep = lt > 1.2 && lt < 2.7 ? tween(lt, 1.2, 2.7, -1.3, 1.3, 'inOut') : null;
  BO.big = true;
  // its reflection in the polished stone
  clipRect(ctx, 192 - prx, base, prx * 2, pry + 1);
  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.translate(0, 2 * (base + 2));
  ctx.scale(1, -1);
  BO.rimK = 0;
  BO.text = 0;
  bottle(ctx, 192, base + 2, k, texHero(), BO);
  ctx.restore();
  ctx.restore();
  contact(ctx, 192, base + 1, round(36 * k), 0.5);
  BO.rimK = 0.95 * up;
  BO.text = 0.35 + 0.65 * up;
  bottle(ctx, 192, base + 2, k, texHero(), BO);
  glintStar(ctx, 188, base + 2 - round((BODY_H + STOP_H) * k) + 3, (lt - 2.55) / 0.8, P.white);
  vignette(ctx, 0.65);
}

// --- 6. SLATE ----------------------------------------------------------------------

const slateBg = lazy(() => gradient('bf-slate', W, H, { cx: 112, cy: 100, rx: 190, ry: 140, ramp: [P.black, P.maroon, P.brown], gamma: 1.9, seam: 0.45 }));
// 11 words: on screen >= max(3 s, 0.3 s a word) (channel-and-breaks §5.4)
const LEGAL = 'NO ALCOHOL. NO DATA. THE SERVER FARM CLOSED FOR UNRELATED REASONS.';

function shotSlate(ctx, lt) {
  ctx.drawImage(slateBg(), 0, 0);
  beam(ctx, 112, 0, 112, 170, 30, 90, { color: P.cream, alpha: 0.03 });
  plinth(ctx, 112, 170, 54, 8);
  contact(ctx, 112, 171, 30, 0.6);
  // a still bottle; the only motion is one glint
  BO.turn = 0.5;
  BO.keyK = 1;
  BO.rimK = 0.95;
  BO.sweep = null;
  BO.text = 1;
  BO.big = false;
  const top = bottle(ctx, 112, 172, 0.8, texSlate(), BO);
  glintStar(ctx, 109, top + 3, (lt - 2.0) / 0.9, P.white);
  vignette(ctx, 0.5);
  // the lock-up, right third
  const x = 270;
  trackIn(ctx, 'BITFIZZ', x, 50, lt - 0.1, { face: 'serif', color: GOLD, track: 3, from: 9, dur: 1.6, scale: 2 });
  fadeUp(ctx, 'RESERVE', x + 2, 80, lt - 0.6, { face: 'thin', color: P.cream, track: 7, align: 'center', dur: 0.9 });
  rule(ctx, x, 97, 110, (lt - 0.9) / 0.9, P.yellow, { alpha: 0.7 });
  fadeUp(ctx, 'UNCOMPRESSED.', x, 105, lt - 0.4, { face: 'serif', color: P.cream, track: 3, align: 'center', dur: 1.0 });
  fadeUp(ctx, 'AGED 12 YEARS IN A SERVER FARM', x, 124, lt - 1.2, { face: 'micro', color: P.cream, track: 1, align: 'center', dur: 0.9 });
}

// --- the whole spot ---------------------------------------------------------------

const SLATE_AT = 20.83;
/** Letterbox and the legal line on the bottom bar are part of the film. */
function frame(ctx, dt) {
  letterbox(ctx, 1, BAR);
  if (dt > SLATE_AT + 0.2) smallPrint(ctx, LEGAL, W / 2, H - BAR + 8, W - 40, { color: P.fog, lt: dt - SLATE_AT - 0.2, dur: 0.5 });
}

// Cuts on the beat grid (72 bpm: a beat is 0.833 s). Ordered dissolves only
// between shots with nothing written on screen; dips to black into the
// portrait, the hero and the slate (channel-and-breaks §5.5).
const SHOTS = [
  { at: 0, draw: shotMacro },
  { at: 4.17, draw: shotCellar, wipe: 'dither', wd: 0.8 },
  { at: 8.33, draw: shotPour, wipe: 'dither', wd: 0.8 },
  { at: 13.33, draw: shotNose, wipe: 'black', wd: 0.8, hold: 0.1 },
  { at: 17.5, draw: shotHero, wipe: 'black', wd: 0.9, hold: 0.3 },
  { at: SLATE_AT, draw: shotSlate, wipe: 'black', wd: 0.5, hold: 0.1 },
];

// Lounge jazz at 72 bpm in D minor: soft sine chords, a walking bass, a sparse
// electric-piano motif, brushes. Under "...dial-up." the band stops (from
// beat 19, 15.8 s) and there are more than 1.5 s of silence through the dip to
// black; the brand chord, F major 9, lands with the lights on beat 22 (18.33 s,
// "BitFizz Reserve.") and holds under the slate. Every track ends in rests, so
// the looping bed never restarts inside the spot (26.7 s of music for 24.6 s).
const EP = { wave: 'sine', a: 0.004, d: 0.9, s: 0.12, r: 0.5, vib: false };
const PADI = { wave: 'sine', a: 0.35, d: 1.2, s: 0.75, r: 0.9, vib: [6, 4.5, 0.3] };
export default {
  id: 'bitfizz-cola',
  brand: 'BITFIZZ RESERVE',
  duration: 24.6,
  voice: { gender: 'male', lang: 'en-GB', pitch: 0.82, rate: 0.9 },
  // 25 words (luxury spirits: <= 25, slow); "Uncompressed." is left to the slate
  script: [
    { at: 0.8, text: 'Some things cannot be rushed.' },
    { at: 4.5, text: 'Aged twelve years in a decommissioned server farm.' },
    { at: 8.8, text: 'Over ice, hand-chipped by a retired sysadmin.' },
    { at: 13.8, text: 'Oak. Caramel... Dial-up.' },
    { at: 18.4, text: 'BitFizz Reserve.' },
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
          'Bb2+D3+F3+A3+E4:3@0.38 R:3',
          'F2+A2+C3+E3+G3:8@0.5 R:2',
        ),
      },
      {
        kind: 'bass', inst: 'sine', gain: 0.9,
        notes: tune(
          'D2:2@0.7 A1:2@0.6 Bb1:2@0.7 F2:2@0.6 G1:2@0.7 D2:2@0.6 A1:2@0.7 E2:1@0.6 C#2:1@0.6',
          'Bb1:2@0.65 F1:1@0.55 R:3',
          'F1:4@0.72 C2:2@0.6 F1:2@0.6 R:2',
        ),
      },
      {
        kind: 'lead', inst: EP, gain: 0.7, echo: 0.35,
        notes: tune(
          'R:2 A4:1@0.4 E5:1@0.35 D5:3@0.4 R:1 R:2 Bb4:1@0.35 F5:1@0.35 E5:2@0.4 C#5:2@0.35',
          'R:1 F5:1@0.3 E5:1@0.28 R:3',
          'R:2 A4:0.5@0.35 C5:0.5@0.35 E5:1@0.4 G5:2@0.42 E5:4@0.34',
        ),
      },
      {
        drums: tune(
          'H:1@0.12 H:1@0.1 H:1@0.12 H:1@0.1',
          'K:1@0.3 H:0.5@0.14 H:0.5@0.1 X:1@0.18 H:1@0.12',
          'K:1@0.3 H:0.5@0.14 H:0.5@0.1 X:1@0.18 H:1@0.12',
          'K:1@0.3 H:0.5@0.14 H:0.5@0.1 X:1@0.18 H:1@0.12',
          'K:1@0.3 H:1@0.12 X:1@0.14 R:1',
          'R:12',
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
