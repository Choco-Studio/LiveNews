// BITFIZZ RESERVE — a luxury spirits commercial, played completely straight,
// for a fizzy soft drink. Whispered voice-over, amber light, slow motion,
// gold serif type, and the joke is all in the copy: aged twelve years in a
// decommissioned server farm, tasting notes of oak, caramel and dial-up,
// "Uncompressed." Letterboxed 2.2:1; the legal line sits on the bottom bar.
//
// Shot list (24.6 s, 72 bpm, a bar is 3.33 s; the brand chord lands at 18.33 s):
//  1  0.0 MACRO    inside the liquid: slow bubbles in backlit amber.        VO "Some things cannot be rushed."
//  2  4.2 CELLAR   a dark server hall; bottles rest in the racks; a window
//                  beam full of dust; slow truck right; documentary caption. VO "Aged twelve years in a decommissioned server farm."
//  3  8.3 POUR     slow-motion pour into a crystal tumbler over one ice cube,
//                  on a bar, the back bar glowing out of focus behind.       VO "Over ice, hand-chipped by a retired sysadmin."
//  4 13.3 NOSE     a man in profile, rim-lit, raises the glass in a panelled
//                  lounge (a lamp, a rainy night window); tasting notes set
//                  in serif in the empty half of the frame.                 VO "Oak. Caramel... Dial-up."
//  5 17.5 HERO     the bottle on a stone plinth in the cellar vault, haze
//                  drifting; the lights come up, a softbox sweep travels round. VO "BitFizz Reserve."
//  6 20.8 SLATE    bottle left (the racks behind it), gold lock-up right, legal on the bar.
import {
  P, W, H, R, A, oval, poly, ring, disc, cached, lazy, play, key, tween, prog, smooth, lerp, clamp,
  type, trackIn, fadeUp, rule, smallPrint, gradient, vignette, letterbox, beam, contact, glintStar,
  lathe, latheMirror, ovalRing, bubbles, motes, hash01, clipRect, warmUp, tune, bayer,
} from './kit.js';

const { round, sin, cos, PI, max, abs, floor, sqrt } = Math;

const BAR = 24; // letterbox bar height (2.2:1)
const GOLD = [P.cream, P.yellow, P.yellow];
// Backlit whisky-amber, dark to light; orange only where the light passes through.
const AMBER = [P.black, P.maroon, P.brown, P.tanShade, P.orange, P.yellow];
const GILT = [P.black, P.brown, P.tanShade, P.yellow, P.cream];
const CRYSTAL = [P.maroon, P.brown, P.tanShade, P.cream];

/** Radii from keys into a reused array, scaled by k (no allocation; skipped when unchanged). */
function fill(out, h, keys, k) {
  if (out.fillH === h && out.fillK === k && out.fillKeys === keys) return out;
  for (let j = 0; j < h; j++) out[j] = key(j / max(1, h - 1), keys) * k;
  out.fillH = h;
  out.fillK = k;
  out.fillKeys = keys;
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

/**
 * The label's words, flat over its front; `big` for the hero bottle, else the
 * end-slate one. `light` (0..1) steps the ink through darker palette colours as
 * the key comes up (palette-pure, no alpha), the way the lathe shades the label.
 */
const GOLD_MID = [P.tanShade, P.tanShade, P.brown];
function labelText(ctx, cx, top, big, light) {
  if (light <= 0.05) return;
  const lo = light < 0.4;
  const mid = light < 0.75;
  const gold = lo ? P.brown : mid ? GOLD_MID : GOLD;
  const cream = lo ? P.brown : mid ? P.tanShade : P.cream;
  const yellow = lo ? P.maroon : mid ? P.tanShade : P.yellow;
  const dim = lo ? P.maroon : mid ? P.brown : P.tanShade;
  if (big) {
    type(ctx, 'BITFIZZ', cx, top + 7, { face: 'serif', color: gold, align: 'center' });
    type(ctx, 'RESERVE', cx + 1, top + 22, { face: 'body', color: yellow, track: 2, align: 'center' });
    R(ctx, cx - 10, top + 32, 21, 1, dim);
    type(ctx, 'AGED 12 YEARS', cx, top + 36, { face: 'micro', color: cream, track: 1, align: 'center' });
    type(ctx, 'SERVER FARM 7', cx, top + 44, { face: 'micro', color: dim, track: 1, align: 'center' });
  } else {
    type(ctx, 'BITFIZZ', cx, top + 8, { face: 'body', color: cream, align: 'center' });
    type(ctx, 'RESERVE', cx + 1, top + 19, { face: 'micro', color: yellow, track: 1, align: 'center' });
  }
}

const LAB = { cv: null, top: 0, h: 0, turn: 0.5 };
const GLASS = { top: 0, edge: 1.4, wall: 0.9, edgeColor: P.tanShade };
// clustered flat bands on the product (seam ~0): a checker dither across the amber read as noise
const BODY_O = { rows: 0, ramp: AMBER, ambient: 0.1, glass: GLASS, label: LAB, stripes: STRIPES, rim: RIM, key: 1, seam: 0.1, tilt: 0.05 };
const STOP_O = { rows: 0, ramp: GILT, ambient: 0.14, stripes: STOP_STRIPES, rim: RIM, key: 1, seam: 0.1, tilt: 0.05 };

/**
 * Bottle standing on y = bottom, axis at cx, at scale k. tex: the label texture
 * (built for the nominal radius); sweep: x of the moving softbox (-1.3..1.3) or null.
 */
const BO = { turn: 0.5, keyK: 1, rimK: 0.95, sweep: null, text: 0, big: true, mirror: null }; // pooled options
// mirror: { axis, alpha, x, y, w, h } draws each pass's reflection (clipped) right after it
const MIRROR = { axis: 0, alpha: 0.14, x: 0, y: 0, w: 0, h: 0 };
function reflect(ctx, m) {
  if (!m) return;
  clipRect(ctx, m.x, m.y, m.w, m.h);
  latheMirror(ctx, m.axis, m.alpha);
  ctx.restore();
}
function bottle(ctx, cx, bottom, k, tex, o) {
  const { turn, keyK, rimK, sweep, text, big, mirror } = o;
  const bh = round(BODY_H * k);
  const sh = round(STOP_H * k);
  const top = bottom - bh - sh;
  RIM_DYN.k = rimK;
  STOP_O.rows = sh;
  STOP_O.key = keyK;
  STOP_O.rim = RIM_DYN;
  lathe(ctx, cx, top, fill(STOP, sh, STOP_KEYS, k), STOP_O);
  reflect(ctx, mirror);
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
  reflect(ctx, mirror);
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

// Bottle ends (bottles lie on their sides, bases toward us): dark glass, hand-
// pixelled. The base is a near-black disc; only its rim on the side facing the
// window (upper left) catches light, the punt in its middle shows as a darker
// hollow with one glint off-centre. Variants: plain, a stronger rim, dusty (a
// grey bloom on the glass), sunk deeper in the rack (barely there), and one
// lying the other way with its foil capsule toward us. Keys: k black, m maroon,
// b brown, t tan shade, o highlight, c cream, d dust (slate), . clear.
const ENDS_NEAR = [
  ['...kkkkk...', '..kmbbmkk..', '.kmbmkkkkk.', 'kmbmkkkkkkk', 'kbmkkkkkkkk', 'kbmkkokkkmk', 'kmkkkkkkkmk', 'kkkkkkkkmmk', '.kkkkkkmmk.', '..kkkmmkk..', '...kkkkk...'],
  ['...kkkkk...', '..ktbbmkk..', '.ktbmkkkkk.', 'ktbkkkkkkkk', 'kbmkkkkkkkk', 'kbkkkokkkkk', 'kmkkkkkkkmk', 'kkkkkkkkmmk', '.kkkkkkmmk.', '..kkkmmkk..', '...kkkkk...'],
  ['...kkkkk...', '..kmbdmkk..', '.kmbdkdkkk.', 'kmbkkdkdkkk', 'kbkdkkkkdkk', 'kbkkdkkdkkk', 'kmkkkkdkkmk', 'kkdkkkkkmmk', '.kkkdkkmmk.', '..kkkmmkk..', '...kkkkk...'],
  ['...........', '...kkkkk...', '..kmmkkkk..', '.kmkkkkkkk.', '.kmkkkkkkk.', '.kkkkkkkkk.', '.kkkkkkkmk.', '..kkkkkmk..', '...kkkkk...', '...........', '...........'],
  ['...........', '...........', '....kkk....', '...kbtbk...', '..kbtobbk..', '..kbbbbmk..', '..kbbbmmk..', '...kmmmk...', '....kkk....', '...........', '...........'],
  ['...kkkkk...', '..kmmkkkk..', '.kmbkkkkkk.', 'kmbkkkkkkkk', 'kmkkkkkkkkk', 'kmkkkkkkkkk', 'kkkkkkokkkk', 'kkkkkkkkkmk', '.kkkkkkkmk.', '..kkkkmmk..', '...kkkkk...'],
];
const ENDS_FAR = [['.kkk.', 'kbkkk', 'bkkkk', 'kkkmk', '.kkk.'], ['.kkk.', 'ktkkk', 'tkokk', 'kkkkk', '.kmk.'], ['.....', '.kkk.', '.mkk.', '.kkk.', '.....'], ['.kkk.', 'kmkkk', 'mkkkk', 'kkkkk', '.kkk.']];
const DARK_KEY = { k: P.black, m: P.maroon, b: P.brown, t: P.brown, o: P.maroon, c: P.tanShade, d: P.ink };
// in the beam: one step warmer, the rim and the punt glint catch the light
const LIT_KEY = { k: P.black, m: P.maroon, b: P.tanShade, t: P.orange, o: P.cream, c: P.cream, d: P.slate };
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
      // bottles do not line up perfectly: some sit a pixel deeper or higher, some further back in the dark
      const dy = hash01(i + j * 17, seed + 3) < 0.25 ? 1 : 0;
      const deep = hash01(i * 3 + j * 11, seed + 6) < 0.18;
      stamp(c, ends[floor(hash01(i * 7 + j, seed + 5) * ends.length)], bx + (hash01(i + j, seed + 8) < 0.2 ? 1 : 0), yy + dy, deep ? DARK_KEY : keys);
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

const hallRacks = lazy(() => cached('bf-hall-racks4', CW, H, (c) => { for (let k = 0; k < 9; k++) paintRack(c, 150 + k * 58, 74, 46, 96, false, k + 1, false); }));
const hallRacksLit = lazy(() => cached('bf-hall-racks4-lit', CW, H, (c) => { for (let k = 0; k < 9; k++) paintRack(c, 150 + k * 58, 74, 46, 96, false, k + 1, true); }));
const hallNear = lazy(() => cached('bf-hall-near4', 150, H, (c) => { paintRack(c, 4, 26, 142, 170, true, 77, false); for (let y = 40; y < 180; y += 9) R(c, 8, y, 1, 2, P.black); }));
const hallNearLit = lazy(() => cached('bf-hall-near4-lit', 150, H, (c) => paintRack(c, 4, 26, 142, 170, true, 77, true)));
// Set dressing on the hall floor, between the racks and the camera: a pallet with
// two shipping crates (unlit, and lit for the part that stands in the beam).
function paintCrate(c, x, y, w, h, lit) {
  R(c, x, y, w, h, lit ? P.brown : P.maroon);
  for (let py = y + 5; py < y + h - 1; py += 5) R(c, x + 1, py, w - 2, 1, P.black); // plank joints
  R(c, x, y, w, 1, lit ? P.cream : P.tanShade); // the top edge catches the window
  R(c, x, y, 1, h, lit ? P.tanShade : P.brown); // the face toward the window
  R(c, x + 1, y + 1, 2, h - 1, lit ? P.tanShade : P.brown); // corner post
  R(c, x + w - 3, y + 1, 2, h - 1, P.black); // far corner post in shade
  R(c, x + 6, y + 6, 8, 3, lit ? P.maroon : P.black); // a stencilled mark, half worn
  R(c, x + 7, y + 7, 2, 1, lit ? P.brown : P.maroon);
}
const CRATES_W = 40;
const CRATES_H = 38;
function paintCrates(c, lit) {
  paintCrate(c, 4, 6, 26, 14, lit);
  paintCrate(c, 1, 20, 34, 15, lit);
  for (let x = 0; x < 38; x += 6) R(c, x, 35, 4, 3, lit ? P.brown : P.maroon); // pallet blocks
  R(c, 0, 35, 38, 1, lit ? P.tanShade : P.brown);
}
const hallCrates = lazy(() => cached('bf-crates', CRATES_W, CRATES_H, (c) => paintCrates(c, false)));
const hallCratesLit = lazy(() => cached('bf-crates-lit', CRATES_W, CRATES_H, (c) => paintCrates(c, true)));
const CRATES_X = 232; // mid-layer x
const CRATES_Y = 172 - CRATES_H; // standing on the floor

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
  // crates on the floor, in front of the racks; the part inside the beam lit
  contact(ctx, CRATES_X + mid + 19, 172, 24, 0.5);
  ctx.drawImage(hallCrates(), CRATES_X + mid, CRATES_Y);
  clipBeam(ctx, back, 0.8);
  ctx.drawImage(hallCratesLit(), CRATES_X + mid, CRATES_Y);
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

const barTop = lazy(() => gradient('bf-bartop', W, 48, { kind: 'vertical', ramp: [P.brown, P.maroon, P.black], seam: 0.5 }));

// The back bar behind the pour, well out of focus: a dark mirrored wall, two
// glass shelves lit from behind by a warm strip, rows of bottles glowing
// amber where the strip shines through them, and a few soft discs where it
// catches a shoulder. Values stay under the tumbler's so the glass leads.
// Bottle shapes: [body w, body h, shoulder h, neck w, neck h, liquid level 0..1]
const BACK_BOTTLES = [[9, 21, 4, 3, 8, 0.55], [13, 13, 3, 4, 5, 0.7], [10, 18, 2, 3, 6, 0.45], [7, 25, 5, 2, 9, 0.6], [11, 16, 4, 3, 7, 0.35], [8, 15, 3, 3, 5, 0.8], [12, 22, 6, 3, 6, 0.5]];
const SHAPE = [0, 0, 0, 0, 0, 0];
/** One defocused bottle standing on y: dark glass, backlit liquid, soft (half-tone) edges. */
function backBottle(c, x, y, shape, pale) {
  const [bw, bh, sh, nw, nh, lvl] = shape;
  const top = y - bh;
  const liq = top + round(bh * (1 - lvl));
  for (let j = top; j < y; j++) {
    const u = (j - liq) / max(1, y - liq); // 0 at the surface, 1 at the shelf
    let col;
    if (j < liq) col = A(P.black, 0.55);
    else if (pale) col = A(u < 0.5 ? P.steel : P.fog, 0.16 + 0.16 * u);
    else col = u < 0.45 ? A(P.maroon, 0.85) : y - j > 2 ? A(P.brown, 0.85) : A(P.tanShade, 0.8);
    R(c, x + 1, j, bw - 2, 1, col);
    R(c, x, j, 1, 1, A(P.black, 0.35)); // soft edges: half-tone, no outline
    R(c, x + bw - 1, j, 1, 1, A(P.black, 0.35));
  }
  // the surface of the liquid catches the strip
  if (!pale) R(c, x + 2, liq, bw - 4, 1, A(P.tanShade, 0.5));
  // a faint label band, darker than the glass
  R(c, x + 1, top + round(bh * 0.45), bw - 2, round(bh * 0.25), A(P.black, 0.3));
  // shoulder rounding into the neck
  for (let j = 0; j < sh; j++) {
    const w = round(lerp(bw - 2, nw, smooth((j + 1) / sh)));
    R(c, x + round((bw - w) / 2), top - 1 - j, w, 1, A(P.black, 0.62));
  }
  R(c, x + round((bw - nw) / 2), top - sh - nh, nw, nh, A(P.black, 0.6));
  R(c, x + round((bw - nw) / 2), top - sh - nh, nw, 2, A(P.tanShade, 0.4)); // foil cap
}
const backBar = lazy(() =>
  cached('bf-backbar', W, H, (c) => {
    c.drawImage(gradient('bf-pour2', W, H, { cx: 214, cy: 92, rx: 260, ry: 150, ramp: [P.black, P.maroon, P.brown], gamma: 1.9, seam: 0.45 }), 0, 0);
    // mirror panels with dark seams
    for (let x = 18; x < W; x += 92) {
      R(c, x, 0, 2, 150, A(P.black, 0.45));
      R(c, x + 2, 0, 1, 150, A(P.tanShade, 0.07));
    }
    for (const [sy, seed] of [[70, 3], [116, 8]]) {
      // the strip behind the bottles: a warm band fading up the mirror
      for (let k = 0; k < 14; k++) R(c, 0, sy - 1 - k, W, 1, A(P.orange, 0.07 * (1 - k / 14) ** 1.5));
      let x = 2 + round(hash01(seed, 1) * 6);
      let i = 0;
      while (x < W - 6) {
        const base = BACK_BOTTLES[floor(hash01(i, seed) * BACK_BOTTLES.length)];
        // no two bottles quite alike: height and fill vary
        SHAPE[0] = base[0];
        SHAPE[1] = round(base[1] * (0.82 + hash01(i, seed + 4) * 0.36));
        SHAPE[2] = base[2];
        SHAPE[3] = base[3];
        SHAPE[4] = base[4];
        SHAPE[5] = clamp(base[5] + (hash01(i, seed + 8) - 0.5) * 0.3, 0.2, 0.9);
        const shape = SHAPE;
        if (hash01(i, seed + 1) > 0.12) backBottle(c, x, sy, shape, hash01(i, seed + 2) < 0.14);
        x += shape[0] + 2 + round(hash01(i, seed + 3) * 5);
        i++;
      }
      // the glass shelf: a lit front edge, its shadow underneath
      R(c, 0, sy, W, 2, A(P.black, 0.7));
      R(c, 0, sy, W, 1, A(P.tanShade, 0.55));
      R(c, 0, sy + 2, W, 5, A(P.black, 0.3));
      // where the strip catches a shoulder: soft discs of light, rimmed like a lens sees them
      for (let k = 0; k < 4; k++) {
        const bx = 20 + round(hash01(k, seed + 5) * (W - 40));
        const r = 3 + round(hash01(k, seed + 6) * 4);
        const by = sy - 14 - round(hash01(k, seed + 7) * 10);
        disc(c, bx, by, r, A(P.cream, 0.05));
        ring(c, bx, by, r, A(P.cream, 0.09));
      }
    }
  }),
);

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
// The cutter's wheel never lands twice in the same place: two families of
// diagonals at uneven spacings, so the facets differ in size; the lines warm
// toward the top of the band, and a glint sits only on some crossings high on
// the band, where the key strikes the facet edges (no regular fishnet).
const CUT_A = [0, 12, 22, 35, 46, 57, 71, 82, 95, 104, 117, 130, 141, 153, 166, 177, 188, 201, 212];
const CUT_B = [5, 16, 29, 39, 52, 63, 75, 88, 99, 112, 122, 135, 147, 158, 170, 183, 193, 206, 215];
const cutsTex = lazy(() =>
  cached('bf-cuts2', 220, 28, function paintCuts(c) {
    const a = new Uint8Array(220);
    const b = new Uint8Array(220);
    for (const v of CUT_A) a[v] = 1;
    for (const v of CUT_B) b[v] = 1;
    for (let y = 0; y < 28; y++) {
      for (let x = 0; x < 220; x++) {
        const ia = a[(x + y) % 220];
        const ib = b[(x - y + 440) % 220];
        if (!ia && !ib) continue;
        if (ia && ib) R(c, x, y, 1, 1, y < 14 && hash01(x, y + 3) < 0.6 ? P.cream : P.tanShade);
        else R(c, x, y, 1, 1, y < 3 || y > 24 ? P.brown : y < 12 ? P.tanShade : P.brown);
      }
    }
    R(c, 0, 0, 220, 1, P.tanShade);
  }, { cpu: true }),
);

const ICE = [[0, 0], [0, 0], [0, 0], [0, 0]];
const ICE_L = [[0, 0], [0, 0], [0, 0], [0, 0]];
const ICE_R = [[0, 0], [0, 0], [0, 0], [0, 0]];
const ICE_CHIP = [[0, 0], [0, 0], [0, 0]];
/** A run of pixels along p0 -> p1 from share t0 to t1 of its length (a broken edge, not a wire). */
function edgeRun(c, p0, p1, t0, t1, col) {
  const n = Math.ceil(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]));
  for (let i = Math.round(n * t0); i <= Math.round(n * t1); i++) R(c, p0[0] + ((p1[0] - p0[0]) * i) / n, p0[1] + ((p1[1] - p0[1]) * i) / n, 1, 1, col);
}
/**
 * A hand-chipped cube, baked once (it turns too slowly to need more than one
 * pose): a top face with one chipped facet, a lit face toward the key (left) and
 * an amber face that refracts the whisky (right). No outline: only short runs of
 * the edges nearest the key catch it, brightest at the lit corner, plus a frost
 * of fractures inside and a refracted amber streak. Art origin = cube centre at
 * (ICE_OX, ICE_OY); drawn strong above the surface, at half alpha below it.
 */
const ICE_OX = 20;
const ICE_OY = 12;
const iceArt = lazy(() =>
  cached('bf-ice2', 40, 36, (c) => {
    const s = 15;
    const x = ICE_OX;
    const y = ICE_OY;
    const a = 0.42;
    for (let k = 0; k < 4; k++) {
      const ang = a + (k * PI) / 2 + (hash01(k, 5) - 0.5) * 0.22;
      const rr = s * (0.92 + hash01(k, 6) * 0.16);
      ICE[k][0] = x + cos(ang) * rr;
      ICE[k][1] = y + sin(ang) * rr * 0.42;
    }
    let f = 0;
    for (let k = 1; k < 4; k++) if (ICE[k][1] > ICE[f][1]) f = k;
    const l = ICE[(f + 1) % 4];
    const rr = ICE[(f + 3) % 4];
    const cn = ICE[f];
    const back = ICE[(f + 2) % 4];
    const d = s * 1.05;
    ICE_L[0][0] = l[0]; ICE_L[0][1] = l[1]; ICE_L[1][0] = cn[0]; ICE_L[1][1] = cn[1];
    ICE_L[2][0] = cn[0]; ICE_L[2][1] = cn[1] + d; ICE_L[3][0] = l[0]; ICE_L[3][1] = l[1] + d * 0.9;
    ICE_R[0][0] = cn[0]; ICE_R[0][1] = cn[1]; ICE_R[1][0] = rr[0]; ICE_R[1][1] = rr[1];
    ICE_R[2][0] = rr[0]; ICE_R[2][1] = rr[1] + d * 0.95; ICE_R[3][0] = cn[0]; ICE_R[3][1] = cn[1] + d;
    const lft = l[0] < rr[0] ? l : rr;
    const rgt = lft === l ? rr : l;
    ICE_CHIP[0][0] = lft[0]; ICE_CHIP[0][1] = lft[1];
    ICE_CHIP[1][0] = lft[0] + (back[0] - lft[0]) * 0.45; ICE_CHIP[1][1] = lft[1] + (back[1] - lft[1]) * 0.45;
    ICE_CHIP[2][0] = lft[0] + (cn[0] - lft[0]) * 0.4; ICE_CHIP[2][1] = lft[1] + (cn[1] - lft[1]) * 0.4;
    const lit = lft === l ? ICE_L : ICE_R;
    const dark = lit === ICE_L ? ICE_R : ICE_L;
    poly(c, dark, A(P.orange, 0.3)); // refracting the amber
    poly(c, lit, A(P.cream, 0.3));
    poly(c, ICE, A(P.cream, 0.28)); // the top face takes the warm light
    poly(c, ICE_CHIP, A(P.white, 0.36));
    // short lit runs on the edges nearest the key, longest at the lit corner
    edgeRun(c, lft, back, 0, 0.45, A(P.white, 0.75));
    edgeRun(c, lft, cn, 0, 0.6, A(P.white, 0.7));
    edgeRun(c, cn, rgt, 0.2, 0.42, A(P.cream, 0.35));
    edgeRun(c, cn, [cn[0], cn[1] + d], 0.1, 0.5, A(P.white, 0.45));
    R(c, lft[0], lft[1], 2, 1, A(P.white, 0.9)); // the glint where the chip meets the light
    // fractures inside: a jagged crack and a frosted cluster where it starts
    const cr = [[x - 6, y + 6], [x - 3, y + 8], [x - 4, y + 11], [x, y + 13]];
    for (let i = 0; i + 1 < cr.length; i++) edgeRun(c, cr[i], cr[i + 1], 0, 1, A(P.cream, 0.32));
    for (let i = 0; i < 7; i++) R(c, x - 8 + floor(hash01(i, 91) * 5), y + 4 + floor(hash01(i, 92) * 4), 1, 1, A(P.white, 0.3));
    // a streak of the whisky refracted through the far face
    edgeRun(c, [rgt[0] - 3, rgt[1] + 3], [cn[0] + 3, cn[1] + d - 4], 0.15, 0.8, A(P.yellow, 0.35));
  }),
);

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

// A locked-off camera: nothing in the frame changes size (owner 22:50: the glass
// must not grow while it fills). The motion is the pour itself, the rising
// liquid, the rings, the bubbles and the slow-motion crown at the impact.
const GLASS_CX = 196; // tumbler axis
const GLASS_BOTTOM = 176; // its foot on the bar
const BAR_Y = 150; // the bar's front edge
const NECK_X = 150; // the bottle's lip, top left
const NECK_Y = 50;
function shotPour(ctx, lt) {
  ctx.drawImage(backBar(), 0, 0);
  const k = 1; // scale of the props (fixed for the whole shot)
  // bar top
  const by = BAR_Y;
  ctx.drawImage(barTop(), 0, by);
  R(ctx, 0, by, W, 1, P.tanShade);
  const cx = GLASS_CX;
  const th = 66;
  const bottom = GLASS_BOTTOM;
  const top = bottom - th;
  const baseH = 11;
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
  contact(ctx, cx, bottom + round(6 * k), round(r0 * 1.02), 0.5);
  // the glass, and its reflection in the polished bar (each pass mirrored, not re-lit)
  const axis = bottom + round(0.2 * r0);
  lathe(ctx, cx, top, TPROF, TUMBLER_O);
  clipRect(ctx, 0, bottom + 1, W, H - bottom);
  latheMirror(ctx, axis, 0.16);
  ctx.restore();
  BASE_O.rows = baseH;
  lathe(ctx, cx, top + tubeH, BPROF, BASE_O);
  clipRect(ctx, 0, bottom + 1, W, H - bottom);
  latheMirror(ctx, axis, 0.16);
  ctx.restore();
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
  ctx.drawImage(iceArt(), ix - ICE_OX, iy - ICE_OY);
  ctx.restore();
  clipRect(ctx, 0, ly, W, H - ly);
  ctx.globalAlpha = 0.5; // seen through the amber
  ctx.drawImage(iceArt(), ix - ICE_OX, iy - ICE_OY);
  ctx.restore();
  // rising bubbles inside the liquid
  bubbles(ctx, lt, { x: cx - round(lr * 0.75), y: ly + 3, w: round(lr * 1.5), h: max(4, top + tubeH - ly - 5), n: 18, seed: 12, rise: 10, size: 2, color: P.yellow, hi: P.cream });
  // the rim of the glass
  ovalRing(ctx, cx, top + round(r0 * 0.2), round(r0), max(2, round(r0 * 0.2)), A(P.cream, 0.6));
  // the stream: leaves the neck with some forward speed, falls, thins
  const mx = NECK_X;
  const my = NECK_Y;
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
// A man in his forties in profile, facing left into the lamp's warm key, lifts
// the glass from his chest to just under his nose, closes his eyes as it
// arrives and breathes in. His bust (head, neck, collar, jacket) and his hand
// are hand-pixelled sprites (ASCII rows below, baked once); the arm is two cloth
// textures laid along the upper arm and the forearm each frame, the elbow leading
// the glass forward and up. The head is 70 px from crown to chin (a medium
// close-up of an adult, about 1/7 of his height).

// The room behind him, out of focus: walnut panelling warmed by a table lamp
// at the left (the lamp that keys his face), a heavy curtain, and a tall
// window onto a wet night city; rain beads on the glass and a few drops run.
const WIN_X = 232; // window: left edge of the glass (it runs off the right of frame)
const WIN_Y0 = 20;
const WIN_Y1 = 166;
const MULL_X = 308; // the vertical mullion
const MULL_Y = 94; // the transom
const LAMP_X = 36;
const LAMP_Y = 132; // top of the shade
const lounge = lazy(() =>
  cached('bf-lounge2', W, H, (c) => {
    c.drawImage(gradient('bf-lounge-wall', W, H, { cx: LAMP_X + 4, cy: LAMP_Y - 10, rx: 260, ry: 190, ramp: [P.black, P.maroon, P.brown], gamma: 2.0, seam: 0.45 }), 0, 0);
    // panelling: raised fields with a bevel lit from the lamp side, dark stiles between
    for (let px = 6; px < WIN_X - 30; px += 62) {
      const pw = 50;
      for (const [py, ph] of [[30, 58], [96, 48]]) {
        R(c, px, py, pw, ph, A(P.black, 0.18));
        R(c, px, py, pw, 1, A(P.black, 0.45)); // top bevel in shade
        R(c, px, py, 1, ph, A(P.tanShade, 0.16)); // the bevel facing the lamp
        R(c, px + pw - 1, py, 1, ph, A(P.black, 0.4));
        R(c, px, py + ph - 1, pw, 1, A(P.tanShade, 0.12));
      }
    }
    // the dado rail
    R(c, 0, 152, WIN_X, 3, A(P.black, 0.5));
    R(c, 0, 152, WIN_X, 1, A(P.tanShade, 0.3));
    // the night beyond the glass: a city glow low down
    const gw = W - WIN_X;
    c.drawImage(gradient('bf-night', gw, WIN_Y1 - WIN_Y0, { kind: 'vertical', ramp: [P.black, P.ink, P.slate], from: 0.05, to: 1.15, seam: 0.5 }), WIN_X, WIN_Y0);
    // distant towers, soft dark blocks, a few lit windows in them
    for (let k = 0; k < 9; k++) {
      const bx = WIN_X + round(hash01(k, 61) * gw);
      const bw = 10 + round(hash01(k, 62) * 18);
      const bt = 104 + round(hash01(k, 63) * 40);
      R(c, bx, bt, bw, WIN_Y1 - bt, A(P.black, 0.45));
      for (let q = 0; q < 6; q++) {
        if (hash01(q + k * 7, 64) < 0.5) continue;
        R(c, bx + 2 + floor(hash01(q, k + 65) * (bw - 4)), bt + 3 + floor(hash01(q, k + 66) * 20), 1, 1, A(hash01(q, k) < 0.7 ? P.cream : P.fog, 0.55));
      }
    }
    // city lights out of focus: soft discs, warm and cool, thicker toward the street
    for (let k = 0; k < 26; k++) {
      const bx = WIN_X + 4 + round(hash01(k, 71) * (gw - 4));
      const by = WIN_Y0 + 50 + round(hash01(k, 72) ** 0.6 * (WIN_Y1 - WIN_Y0 - 54));
      const r = 1 + round(hash01(k, 73) * hash01(k, 74) * 5);
      const col = hash01(k, 75) < 0.65 ? P.yellow : hash01(k, 76) < 0.5 ? P.cream : P.fog;
      disc(c, bx, by, r, A(col, r > 2 ? 0.08 : 0.22));
      if (r > 2) ring(c, bx, by, r, A(col, 0.14));
    }
    // rain beads on the glass: a lit pixel, its refracted shadow under it
    for (let k = 0; k < 90; k++) {
      const bx = WIN_X + 2 + floor(hash01(k, 81) * (gw - 2));
      const by = WIN_Y0 + 2 + floor(hash01(k, 82) * (WIN_Y1 - WIN_Y0 - 4));
      R(c, bx, by, 1, 1, A(P.fog, 0.45));
      R(c, bx, by + 1, 1, 1, A(P.black, 0.35));
    }
    // the frame, mullion and transom: dark painted wood, the inside edges lit from the room
    R(c, WIN_X - 5, WIN_Y0 - 5, gw + 5, 5, P.black);
    R(c, WIN_X - 5, WIN_Y0 - 5, 5, WIN_Y1 - WIN_Y0 + 10, P.black);
    R(c, WIN_X - 5, WIN_Y1, gw + 5, 6, P.black);
    R(c, WIN_X - 5, WIN_Y1, gw + 5, 1, A(P.tanShade, 0.45)); // the sill catches the lamp
    R(c, WIN_X - 1, WIN_Y0, 1, WIN_Y1 - WIN_Y0, A(P.brown, 0.6));
    R(c, MULL_X - 1, WIN_Y0, 3, WIN_Y1 - WIN_Y0, P.black);
    R(c, MULL_X - 2, WIN_Y0, 1, WIN_Y1 - WIN_Y0, A(P.brown, 0.45));
    R(c, WIN_X, MULL_Y - 1, gw, 3, P.black);
    R(c, WIN_X, MULL_Y - 2, gw, 1, A(P.brown, 0.4));
    // the curtain, drawn back to the left of the window: heavy cloth in deep folds
    const CX0 = WIN_X - 40;
    const CW2 = 46;
    for (let x = CX0; x < CX0 + CW2; x++) {
      const u = (x - CX0) / CW2;
      // three deep folds; the faces turned to the lamp (left) take its light, falling off away from it
      const v = 0.5 + 0.5 * sin(u * PI * 6 + 1.2);
      const lit = v * (1 - u * 0.55);
      // kept two steps under his face so the profile reads against it
      const crest = v > 0.97; // the ridge of each fold
      const col = crest && lit > 0.4 ? A(P.brown, 0.8) : lit > 0.55 ? A(P.maroon, 0.95) : lit > 0.25 ? A(P.maroon, 0.6) : lit > 0.1 ? A(P.maroon, 0.3) : P.black;
      R(c, x, 0, 1, 178, P.black);
      R(c, x, 0, 1, 178, col);
    }
    // its edge against the glass hangs in a soft wave
    for (let y = 0; y < 178; y++) R(c, CX0 + CW2 + round(sin(y * 0.05) * 1.2), y, 1, 1, A(P.black, 0.6));
    // the table lamp, out of focus: a pleated shade glowing, light escaping top and bottom
    for (let j = 0; j < 17; j++) {
      const hw = round(lerp(10, 15, j / 16));
      const v = j / 16;
      R(c, LAMP_X - hw, LAMP_Y + j, hw * 2, 1, v < 0.15 || v > 0.88 ? P.cream : v < 0.5 ? P.tanShade : P.yellow);
      R(c, LAMP_X - hw, LAMP_Y + j, 1, 1, A(P.brown, 0.8));
      R(c, LAMP_X + hw - 1, LAMP_Y + j, 1, 1, A(P.tanShade, 0.8));
    }
    for (let x = -12; x <= 12; x += 4) R(c, LAMP_X + x, LAMP_Y + 2, 1, 14, A(P.tanShade, 0.35)); // pleats
    // the pools it throws on the wall above and below the shade
    for (let k = 1; k <= 5; k++) {
      oval(c, LAMP_X, LAMP_Y - 4 - k * 3, 12 + k * 7, 3 + k * 2, A(P.cream, 0.022));
      oval(c, LAMP_X, LAMP_Y + 21 + k * 2, 14 + k * 6, 2 + k, A(P.cream, 0.02));
    }
    R(c, LAMP_X - 1, LAMP_Y + 17, 2, 22, P.tanShade); // the brass stem
    R(c, LAMP_X - 1, LAMP_Y + 17, 1, 22, P.cream);
    // the side table it stands on: a dark walnut top whose front edge catches the
    // lamp (brightest under it, falling off to the sides), the apron in shadow below
    const TY = LAMP_Y + 39;
    R(c, 6, TY, 62, 22, P.black);
    for (let x = 6; x < 68; x++) {
      const d = abs(x - LAMP_X) / 31;
      R(c, x, TY, 1, 1, d < 0.35 ? P.tanShade : d < 0.7 ? P.brown : P.maroon);
      R(c, x, TY + 1, 1, 1, A(P.brown, 0.5 * (1 - d)));
    }
    R(c, 6, TY + 3, 62, 1, A(P.maroon, 0.6)); // the apron's top moulding
    R(c, 9, TY + 4, 3, 18, A(P.maroon, 0.5)); // a leg, just lit on its lamp side
    R(c, 62, TY + 4, 3, 18, A(P.maroon, 0.35));
    // the pool the shade throws on the table top, and the brass foot in it
    oval(c, LAMP_X, TY - 1, 20, 2, A(P.cream, 0.08));
    oval(c, LAMP_X, TY - 1, 11, 1, A(P.cream, 0.1));
    R(c, LAMP_X - 5, TY - 2, 11, 2, P.brown);
    R(c, LAMP_X - 4, TY - 3, 9, 1, P.tanShade);
    R(c, LAMP_X - 3, TY - 3, 3, 1, P.cream);
  }),
);
// a few drops run down the glass, stick-slip, each in its own pane
const DRIPS = [[252, 26, 9], [286, 40, 6], [334, 30, 11], [362, 104, 7], [320, 112, 8]];
function drips(ctx, lt) {
  for (let i = 0; i < DRIPS.length; i++) {
    const x = DRIPS[i][0];
    const y0 = DRIPS[i][1];
    const sp = DRIPS[i][2];
    const span = (y0 < MULL_Y ? MULL_Y - 3 : WIN_Y1 - 2) - y0;
    // stick-slip: speed rises and falls but never reverses (0.7 x 1.3 < 1)
    const d = (sp * (lt + 0.7 * sin(lt * 1.3 + i * 2.1) / 1.3) + i * 23) % span;
    const y = round(y0 + d);
    for (let k = 1; k <= 5 && y - k >= y0; k++) R(ctx, x, y - k, 1, 1, A(P.fog, 0.22 - k * 0.035));
    R(ctx, x, y, 1, 1, P.fog);
    R(ctx, x, y + 1, 1, 1, A(P.black, 0.4));
  }
}

// Pixel keys for the hand-pixelled sprites below ('.' = clear).
const PIX = {
  K: P.black, I: P.ink, L: P.slate, E: P.steel, F: P.fog, V: P.silver, W: P.white,
  m: P.maroon, b: P.brown, t: P.tanShade, s: P.skinShade, n: P.tan, k: P.skin, c: P.cream, r: P.rust,
};
/** Paint ASCII rows into a canvas at (ox, oy), one fillRect per run of a colour. */
function paintRows(c, rows, ox, oy) {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let e = x + 1;
      while (e < row.length && row[e] === ch) e++;
      if (ch !== '.') R(c, ox + x, oy + y, e - x, 1, PIX[ch]);
      x = e;
    }
  }
}

// His bust in profile, facing left, hand-pixelled (92 x 158; crown y 0, chin
// y 70, nose tip x 3). Key light warm from the lamp at the front-left, a cool rim
// from the window behind him. Hair combed back in clumps; the neck in the jaw's
// shadow on the skin ramp (the muscle from behind the ear to the throat a soft
// step, its belly catching the lamp); the white collar rolling round the neck,
// lit at the front and under the jacket collar at the back; a burgundy tie knot;
// the charcoal jacket: a lapel with pick stitching and the shadow it casts, the
// chest plane warm from the lamp, a pocket square, the shoulder line and the
// back rimmed by the window, and folds as tapered wedges (no ruled lines).
const BUST = [
  '.................................tbbbmbbbb',
  '...........................bbbbtttbbbmbbbbbbbbbb',
  '........................tbbtttttbbbbbbbbbbbbbbbbbbb',
  '.....................ttttttbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  '....................ttbbbbbbbbbbbbbmmbbbbbbbbbbbbbbbbbb',
  '..................tttbbbbbbbbbbbbmmbbbbtttbbttbbbbbbbbbEE',
  '.................bbbbbbbbbbmmmmmmbbbbbbbbbttttttttbbbbbbbE',
  '...............bbbbbbbbmmmmttttbbbbbbbbbbbbbbbbbbbttbbbbbbEE',
  '..............bbbbbbbmmmtttbbbbbbbbbbbbbbbbbbbbbbbbtttbbbbbbE',
  '.............bbbbbbbttttbbbbbbbbbbbbbttbbbbbbbbbbbbbbbbbbbbbbE',
  '.............bbbbbbttbbbbbbbbbbbbbbtttttttbbbbbmmbbbbbbbbbbbbbE',
  '............bbbbbttbbbbbbbbmmbbbbbbbbbbbbtttttttmmmbbbbbbbbbbbbE',
  '............bbbbttbbbbbbmmmtbbbbbbbbbbbbbbbbbbbbttmmbbbbbbbmmbbE',
  '...........kbbbbtbbbbbmmttttbbbbbbbbbbbbbbbbbbbbbbmmmmbbbbbbmbbbE',
  '..........kknsbttbbbmmtttbbbbbbbbbbbmmmmmbbbbbbbbbmmmmmmmmmmKKKbE',
  '..........kkknnnsbbmmttbbbbbbbbbbbbbtttttmmmmmmbbmmmmmmmmmmmmKKKbE',
  '..........kkknnnnnsmtbbbbbbbbbbbbbttbbbbbttttbbbmmmmmmmmmmmmmKKKbE',
  '.........kkkknnnnnnnsbbbbbbbbbbbttbbbbbbbbbbbbbbbKmmmmmmmmmmmmKKKmE',
  '.........kckknnnnnnnssbbbbbbbbbbbbbbbbbbbbbbbbbbmmmmmmmmmmmmmtKKKmE',
  '.........kckkknnnnnnnnssttbbbbbbbbbbmmmmbbbbbbbbmmbbmmmmmmmmmtKKKmE',
  '.........kckkknnnnnnnnnssbbbbbbbbbbbbbbbbbbbbbbbmmmbmmmmmmmmmtKKKKbE',
  '.........kkkkknnnnnnnnnnssbbbmmmmmmbbmmmbmmmmbbbmmmmmmmmmmmmmmKKKKbE',
  '.........kkkknnnnnnnnssssstbbmbbbbbmmmmmmmmmmbbmmmmmmmmmmmmmmmmKKKbE',
  '.........kkkknnnnnnnnssssstbbmbmmmmmmmmmmmmmmmbmmmmmmmmmmmmmmmKKKKbE',
  '.........kkkknnnnnnnnsssssstbmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmKKKKbE',
  '.........kkkknnnnnnnnnssssstbmmmmmmmmmmmmmmmmmKKmmmmmmmmmmmmmmmKKKKbE',
  '........kkkkknnnnnnnnnnssssstmmmmmmbbmmmmmmmmmKKmmmmmmmmmmmmmmmKKKKmE',
  '........kkkkknnnnnnnnnnnssssstmmmmmbmmmmmmbbmmKKKmmmmmmmmmmmmmmKKKKmE',
  '........kkkkkknnnnnnnnnnssssstmmmmmbmmmmmmmbKKKKKmmmmmmmmmmmmmmKKKKmE',
  '.........kknnnbbbbbbnnnnsssssstmmmmmmmmmmmmbKKsnnsmmmmmmmmmmmmmmKKKmE',
  '.........kktmmmmmmmbbnnnnsssssstmmmmbmmmmmmbsnkkknsmmmmmmmmmmmmmKKKmE',
  '..........knmmmbssssnnnnnnsssssstmmmmmmmmmmsnktttknsmmmmmmmmmmmmKKKmE',
  '..........knstttsnnnnnnnnnnssssssstmmmmmmmsnktnnttnnsmmmmmmmmmmmKKKmE',
  '..........knsnnnsnnnnnnnnnnnssssssstbbmmmmsnkttnntnstmmmmmmmmmmmKKKmE',
  '..........kbKKmmbsnnnnnnnnnnssssssstbbmmmmsnnsttntnstmmmmmmmmmmmKKKmE',
  '.........kknbcsbnnnnnnnnnnnnnssssssstmmmmmsnnsbtnntnsmmmmmmmmmmKKKLE',
  '........kkknsnnnnnnnnnnnnnnnnnssssssstmmmmtnsbbtnntnsmmmmmmmmmKKKKLE',
  '.......kkkkknnnnnnnnnnnnnnnnnnssssssstmmmmtnnsbbtntnsmmmmmmmmKKKKKLE',
  '.......kcknnnkkkkkknnnnnnnnnnnssssssstmmmmtnsbmbtntnstmmmmmmmKKKKKLE',
  '......kcknnnnkkkkkkkknnnnnnnnnnssssssstbmmtknbmmbntnstmmmmmmmKKKKKLE',
  '.....kcknnnnkkkkkkkkkknnnnnnnnnssssssstmmstknbmmbntnstmmmmmmmKKKKKLE',
  '.....kcknnnnkkkkkkkkkknnnnnnnnnssssssstmmstknbmbtntnstmmmmmmmKKKKKLE',
  '....kkknnnnnkkkkkkkkknnnnnnnnnnnsssssstmmstnsbbtnntnstmmmmmmKKKKKLE',
  '....kkknnnssnkkkkkkknnnnnnnnnnnnsssssstmmstssbtnntnsttmmmmmmKKKKKLE',
  '...kckknnnnsnkkkkkknnnnnnnnnnnnnsssssstmsstbtnntnstttmmmmmmmKKKKKLE',
  '...kkknnnnnsskkkkknnnnnnnnnnnnnnssssssssstttsnnsnnsttmmmmmmmKKKKKLE',
  '...knnnnnnnsnnnnnnnnnnnnnnnnnnnnsssssssssttssnknnsttbmmmmmmKKKKKLE',
  '....tsmbsssnsnnnnnnnnnnnnnsssssssssssssssttssnnnsttbbmmmmmmKKKKKLE',
  '.....tttsnnnsnnnnnnnnnnssssssssssssssssssttstsnsttbbbmmmmmmKKKKKLE',
  '........snnnnsnnnnnnnnnssssssssssssssssssttstssttbbbbmmmmmKKKKKLE',
  '........nnnnnsnnnnnnnnnssssssssssssssssstttttttbbbbbmKKKKKKKKKKLE',
  '........knnnnsnnnnnnnnnsssssssssssssssssstttttttbbbbKKKKKKKKKKLE',
  '........knnnnsnnnnnnnnnsssssssssssssssssstttttttbbbbKKKKKKKKKKmE',
  '........ssnnnsnnnnnnnnnsssssssssssssssssstttttttbbbbbKKKKKKKKLE',
  '........sssnntnnnnnnnnnsssssssssssssssssstttttttbbbbbKmmKKKKKLE',
  '.........bbbttnnnnnnnnnnssssssssssssssssstttttttbbbbbmKKKKKKLE',
  '.........kknsnnnnnnnnnnnnssssssssssssssssttttttttbbbbbKKKKKKLE',
  '........kcknnnnnnnnnnnnnnnsssssssssssssssttttttttbbbbbKKKKKmE',
  '.........nsnnnnnnnnnnnnnnnsssssssssssssssttttttttbbbbbbKLLmE',
  '..........ssnnnnnnnnnnnnnnssssssssssssttttttbbttttttbbE',
  '...........snnnnnnnnnnnnnssssssssssssttttttbbtttttttbbE',
  '...........kknnnnnnnnnnnssssssssssstttttbbbbtttttttttbbE',
  '...........kknnnnnnnnnnssssssssssssttttbbbbbsttttttttbbE',
  '..........kkknnnnnnnnnsssssssssssstttbbbbbtttttttttttbbE',
  '..........kcknnnnnnnnsssssssssssstttbbbbbbtttttttttttbbE',
  '..........kkknnnnnnnssssssssssstttbbbbbbttttttttttttttbbE',
  '..........kkknnnnnnsssssssssstttbbbbbbbtttttttttttttttbbb',
  '..........kkknnnnnssssssssstttbbbbbbbtttttttttttttttttbbb',
  '...........knnnnnsssssssstttbbbbbbbtttttttttttttttttttbbb',
  '............nssssstttttbbbbbbbsbbttttsstttttttttttttttbbb',
  '..............tttttbbbbbbbssbbbttttsnstttttttttttttttttbbb',
  '....................bbbsbbbbtttttssnsttttttttttttttttttbbb',
  '....................bbbbbbtttttsssnstttttttttttttttttttbbb',
  '....................bbbbbtttsssssnsttttttttttttttttttttbbb',
  '....................ttttssssssssnnttttttttttttttttttttttbbb',
  '....................tttsssssssssstttttttttttttttttttttttbbb',
  '....................nnssssssssssttttttttttttttttttttttttbbb',
  '...................nnsssssssssstttttttttttttttttttttttttbbb',
  '...................nnsssssssssttttttttttttttttttttttttttbbb.V',
  '....................nnsssssssstttttttttttttttttttttttttVVVVVF',
  '....................nnssssssstttttttttttttttttttttVVVVVFFFFFE',
  '....................nnsssssstttttttttttttttttccVVVFFFFFFFFFFL',
  '....................nnssssstttttttttttttcccccFFFFFFFFFFEEEEEL',
  '....................nnsssstttttttttcccccVFFFFFFFFFEEEEELLLLLF',
  '....................nnssstttttcccccVVVVVVFFFFLLLLEIIILLIIIILLE',
  '....................nttttWWWWcVVVVVVVVVVVFFLLIIIIIKKKKKIIIIILLE',
  '....................tWWWWccccVVVVVVVVVVVVLLIIKKKKKKKKKKKIIIIILLE',
  '...................VWccccccccVVVVVVVVVVLLIIKKKKKKKKKKKKKIIIIILLL',
  '...................ccccccccccVVVVVVVVLLKKKKKKKKKKKKKKKKKKIIIIILLE',
  '...................ccccccccccVVVVVVLLKKKKKKKKKKKKKKKKKKKKKIIIIILLE',
  '...................ccccccccccVVVVVLKKKKKKKKKKKKKKKKKKKKKKKKIIIIILLE',
  '..................mbcccccccccVVVKKKKKKKKKKKKKKKKKKKKKKKKKKKKIIIIILLE',
  '.................mbtcccccccccVKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIIIIILEE',
  '.................mbbcccccccVIIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIIIIILLE',
  '.................mmbccccccVIIIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIIIIIILLE',
  '..................mmccccVIIIIIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIKIIIIIILLE',
  '..................mKcccVIIIIIIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIKKIIIIIILEE',
  '...................mcVEIIIIIIIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIIIIIILLE',
  '...................LIIIIIIIIIIKKLLKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIIIIIIILLE',
  '....................LIIIIIIIIIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIIIIIIILLE',
  '...................LIIIIIIIIIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIIIIIIILLE',
  '...................LIEIIIIIIIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIIIIIIILLL',
  '...................LIIIIIIIIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIIIIIIILLE',
  '...................LIIIIIIIIKKIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIIIIIIILLE',
  '..................LIIIIIIIIKKIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIIKIIIILLL',
  '..................LIEIIIIIIKKIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIKIIIIILLE',
  '..................LIIIIIIIKKIIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIKIIIIILLL',
  '..................LIIIIIIIKKIIIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIIIIIILLE',
  '.................LIIIIIIIKKIIIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIKIIIIILLL',
  '.................LIEIIIIIKKIIIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIIIIILLE',
  '.................LIIIIIIIKKIIIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIIIIIILLE',
  '.................LIIIIIIKKIIIIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIIIIILLL',
  '.................LIIIIIIKKIIIIFKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIIIIILLE',
  '.................LIEIIIKKIIIIFVVKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIIIIILLE',
  '................LIIIIIIKKIIIILKKLKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIIIIIILLE',
  '................LIIIIIIKKIILLLLLKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIIIIILLL',
  '................LIIIIIKKIIIIIKKKLLLLKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKLIIIIILLE',
  '................LIEIIIKKIIIIIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKLIIIIILLE',
  '................LIIIIIKKIIIIIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIKKKKKKKKKLKIIIIILLE',
  '................LIIIIKKIIIIIIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIKKKKKKKKKKLIIIIILLL',
  '................LIIIIKKIIIIIIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIKKKKKKKKKKLIIIIILLL',
  '...............LIEIIIKKIIIIIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIKKKKKKKKKKLIIIIILLL',
  '...............LIIIIKKIIIIIKKKKKKKKKKKKIKKKKKKKKKKKKKKKKKKKKKKKKKIIKKKKKKKKKKLIIIIILLL',
  '...............LIIIIKKIIIIIKKKKKKKKKKKKIKKKKKKKKKKKKKKKKKKKKKKKKKIKKKKKKKKKKKLIIIIILLL',
  '...............LIIIIKKIIIIIKKKKKKKKKKKIKKKKKKKKKKKKKKKKKKKKKKKKKKIKKKKKKKKKKKLIIIIILLL',
  '...............LIEIKKIIIIIIKKKKKKKKKKKIKKKKKKKKKKKKKKKKKKKKKKKKKKIIKKKKKKKKKKLIIIIILLL',
  '...............LIIIKKIIIIIKKKKKKKKKKKIKKKKKKKKKKKKKKKKKKKKKKKKKKIIIKKKKKKKKKKLIIIIILLL',
  '...............LIIIKKIIIIIKKKKKKKKKKKIKKKKKKKKKKKKKKKKKKKKKKKKKKIIKKKKKKKKKKKLIIIIILLL',
  '...............LIIKKmIIIIIKKKKKKKKKKKIKKKKKKKKKKKKKKKKKKKKKKKKKKIIKKKKKKKKKKKLKIIIIILLL',
  '...............LIIKKmIIIIIKKKKKKKKKKIKKKKKKKKKKKKKKKKKKKKKKKKKKKIIKKKKKKKKKKKLLIIIIILLL',
  '...............LIIKKmIIIIIKKKKKKKKKKIKKKKKKKKKKKKKKKKKKKKKKKKKKKIIKKKKKKKKKKKKLIIIIILLL',
  '...............LIKKmIIIIIKKKKKKKKKKIKKKKKKKKKKKKKKKKKKKKKKKKKKKKIIKKKKKKKKKKKKLIIIIILLL',
  '...............LIKKIIIIIIKKKKKKKKKKIKKKKKKKKKKKKKKKKKKKKKKKKKKKKIIKKKKKKKKKKKKLIIIIIILL',
  '..............LIIKKIIIIIKKKKKKKKKKIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIIKKKKKKKKKKKKLIIIIIILL',
  '..............LIKKIIIIIIKKKKKKKKKKIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIIKKKKKKKKKKKKLIIIIIILL',
  '..............LIKKIIIIIIKKKKKKKKKIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIIKKKKKKKKKKKKLIIIIIILL',
  '..............LIKIIIIIIIKKKKKKKKKIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIIKKKKKKKKKKKKLIIIIIILL',
  '..............LIKIIIIIIIKKKKKKKKIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIIKKKKKKKKKKKKLIIIIIILL',
  '..............IIIIIIIIIIKKKKKKKKIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIIKKKKKKKKKKKKKLIIIIIILL',
  '..............IIIIIIIIIKKKKKKKKIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIIKKKKKKKKKKKKKKIIIIIILL',
  '..............IILIIIIIIKKKKKKKKIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIIKKKKKKKKKKKKKKIIIIIILL',
  '..............IIKmIIIIIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIIKKKKKKKKKKKKKKIIIIIILL',
  '..............IIIIIIIIIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIIKKKKKKKKKKKKKKIIIIIILL',
  '..............IIIIIIIIIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIIKKKKKKKKKKKKKKIIIIIILL',
  '..............IIIIIIIIIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIIKKKKKKKKKKKKKKIIIIIILL',
  '..............IIIIIIIIIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIIKKKKKKKKKKKKKKIIIIIILL',
  '..............IIIIIIIIIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIIKKKKKKKKKKKKKKIIIIIILL',
  '..............IIIIIIIIIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIIKKKKKKKKKKKKKKIIIIIILL',
  '..............IIIIIIIIIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIIKKKKKKKKKKKKKKIIIIIILL',
  '..............IIIIIIIIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIIKKKKKKKKKKKKKKIIIIIILL',
  '..............IIIIIIIIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIIKKKKKKKKKKKKKKIIIIIILL',
  '..............IIIIIIIIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIKKKKKKKKKKKKKKIIIIIILL',
  '..............IIIIIIIIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIKKKKKKKKKKKKKKIIIIIILL',
  '..............IIIIIIIIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIKKKKKKKKKKKKKKIIIIIILL',
  '..............IIIIIIIIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIKKKKKKKKKKKKKKIIIIIILL',
  '..............IIIIIIIIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIKKKKKKKKKKKKKKIIIIIILL',
  '..............IIIIIIIIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIKKKKKKKKKKKKKKIIIIIILL',
  '..............IIIIIIIIKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKIIIIIILL',
];

// The eye in its states, over the head (open / half / shut): [x, y, pixels]
const EYES = [
  [[11, 34, 'bKKmmbs'], [11, 35, 'nbcsbn']],
  [[11, 34, 'bnnnsss'], [11, 35, 'KKmbbn']],
  [[11, 34, 'nnnnsss'], [11, 35, 'Kmmbsn']],
];
function eye(ctx, ox, oy, state) {
  const rows = EYES[state];
  for (let i = 0; i < rows.length; i++) {
    const x0 = rows[i][0];
    const y = rows[i][1];
    const px = rows[i][2];
    for (let j = 0; j < px.length; j++) R(ctx, ox + x0 + j, oy + y, 1, 1, PIX[px[j]]);
  }
}

const BUST_W = 92;
const BUST_H = 158;
const bustArt = lazy(() => cached('bf-man3', BUST_W, BUST_H, (c) => paintRows(c, BUST, 0, 0)));

// His left hand round the tumbler, back to camera: fingers wrap the front of the
// glass (staggered, creased, knuckles catching the key), the thumb up its back
// edge with the nail lit, the shirt cuff at the wrist. Glass axis x 14, rim y 5.
const HAND = [
  '..........................................',
  '..........................................',
  '..........................................',
  '..........................................',
  '.........................kks..............',
  '........................kccns.............',
  '........................kcknst............',
  '........................kknnst............',
  '.......................tknnnsst...........',
  '....nkkkkkkkkkckkknnnnntnnnnsst...........',
  '..knnnnnsnnnnkkkknnnnnnnntnnssst..........',
  '..snnnnnsnnnnnkknkknnnnnnntnsssst.........',
  '...sssstsssssnnnnnnkkknnnnnnnssssst.......',
  '..tbbbbbbbttsnnnnnnnnnkknnnnnsssssst......',
  '.nkkkkkkkkkkkkcnnnnnnnnnnnnnnnssssst......',
  'knnnnnnsnnnnnkknnnnnnnnnnnnnnssssssst.....',
  'snnnnnnsnnnnnnnnkknnnnnnnnnsssssssst......',
  '.ssssssstsssssnnnnkkknnnnnnssssssssst.....',
  '..bbbbbbbbbttsnnnnnnnkknnsssssssssstt.....',
  '..nkkkkkkkkkkcknnnnnnnnnnssssssssssttt....',
  '.knnnnnsnnnnnkknnnnnnnnnsssssssssstttt....',
  '.snnnnnsnnnnnnnnnnnnnnssssssssssttttt.....',
  '..sssssstsssssnnnnnnnsssssssssstttttt.....',
  '...tbbbbbbbbttsnnnnnssssssssstttttttt.....',
  '....nkkkkkkkkcnnnnsssssssssttttttttt......',
  '...knnnnsnnnnkknnssssssssstttttttttt......',
  '....ssssstsssssssssssssssttttttttttt......',
  '.....tttttttttttsssssssstttttttttttt......',
  '..............bbbttttttttttttttttttttt....',
  '..................bbbbttttttttttttttt.....',
  '.......................bbbbbttttttt.......',
  '..........................................',
  '..........................................',
];
const HAND_GX = 14; // glass axis in the hand sprite
const HAND_RIM = 1; // rim row (the hand holds the lower glass; his little finger tucks under the base)
const handArt = lazy(() => cached('bf-hand4', 42, 33, (c) => paintRows(c, HAND, 0, 0)));

// The rocks glass in his hand (same cut crystal as the pour, smaller).
const SMALL_KEYS = [[0, 13.5], [0.86, 12.6], [1, 12.6]];
const SPROF = new Float32Array(40);
const SMALL_CUTS = { cv: null, top: 0, h: 0, turn: 0.2 };
const SMALL_GLASS = { top: 0, edge: 1, wall: 1, edgeColor: P.tanShade };
const SMALL_O = { rows: 0, ramp: AMBER, ambient: 0.25, glass: SMALL_GLASS, label: SMALL_CUTS, stripes: [[-0.55, 0.07, P.cream]], rim: RIM, tilt: 0.2, seam: 0.5 };
const GLASS_H = 25;

// The arm: two sleeves of charcoal cloth, painted once as straight textures and
// laid along the upper arm and the forearm every frame (sampled per pixel, one
// texel per pixel along the bone, so nothing stretches). Across each sleeve: the
// edge facing the lamp catches it, a warm plane, a black core, the window's cool
// rim; folds run round the arm as lit ridges over dark troughs and break the rim
// and the lit edge, so no edge is a ruled line. The upper sleeve has a rounded
// head at the shoulder, the forearm ends in the white shirt cuff at the wrist.
const pk = (hex) => (255 << 24) | (parseInt(hex.slice(5, 7), 16) << 16) | (parseInt(hex.slice(3, 5), 16) << 8) | parseInt(hex.slice(1, 3), 16);
/**
 * A w x h sleeve texture (column 0 faces the lamp). folds: [row, slope, curve,
 * width, amount, x0, x1]: a fold line row + slope*col + curve*(x-0.5)^2*w across
 * x0..x1 of the width. cap: rows of a rounded end at the top; cuff: rows of cuff
 * at the bottom (narrower than the sleeve).
 */
function sleeveTex(w, h, folds, cap = 0, cuffRows = 0) {
  const px = new Int32Array(w * h);
  const ink = {};
  for (const ch of 'KILEcVF') ink[ch] = pk(PIX[ch]);
  const smooth01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const x = (c + 0.5) / w;
      let ch = '';
      if (cap && r < cap && ((x - 0.5) * 2) ** 2 + ((cap - r - 0.5) / cap) ** 2 > 1) continue; // the rounded sleeve head
      if (cuffRows && r >= h - cuffRows) {
        if (abs(x - 0.47) > 0.33) continue;
        const cx = (x - 0.14) / 0.66;
        ch = r === h - cuffRows ? 'E' : cx < 0.3 ? 'c' : cx < 0.75 ? 'V' : 'F';
      } else {
        const th = (x - 0.5) * PI; // the surface normal across the cylinder
        const lamp = max(0, cos(th + 1.1)) ** 3.2;
        const rim = max(0, cos(th - 1.45)) ** 14 * (0.78 + 0.3 * sin(r * 0.19 + 1.3));
        let v = 0.31 * lamp + 0.7 * rim + 0.05 + (x < 1.6 / w ? 0.16 : 0); // the lamp-side silhouette catches grazing light
        for (let k = 0; k < folds.length; k++) {
          const f = folds[k];
          const d = (r - (f[0] + f[1] * c + f[2] * (x - 0.5) ** 2 * w)) / f[3];
          const env = smooth01((x - f[5]) / 0.15) * smooth01((f[6] - x) / 0.15);
          v += f[4] * (env * 0.2 * Math.exp(-((d + 0.55) ** 2) * 4) * (0.3 + lamp) - (0.35 + 0.65 * env) * 0.22 * Math.exp(-((d - 0.4) ** 2) * 3));
        }
        if (cuffRows && r === h - cuffRows - 1) v -= 0.25; // the hem
        // neutral charcoal (a warm step here read as a brown stripe down the sleeve)
        ch = v < 0.13 ? 'K' : v < 0.27 ? 'I' : v < 0.4 ? (x < 0.5 ? 'I' : 'L') : v < 0.6 ? 'L' : 'E';
      }
      px[r * w + c] = ink[ch];
    }
  }
  return { w, h, px };
}
const UPPER_CAP = 12;
const upperTex = lazy(() => sleeveTex(26, 112, [[22, 0.15, 0.6, 3.2, 0.7, 0.05, 0.75], [44, -0.2, 0.5, 3.5, 0.9, 0.1, 0.9], [62, 0.35, -0.4, 3, 0.7, 0, 0.6], [80, -0.3, 0.6, 3.6, 1, 0.05, 0.95], [98, 0.3, 0.3, 3.2, 0.8, 0.1, 0.9]], UPPER_CAP));
const foreTex = lazy(() => sleeveTex(22, 96, [[18, 0.5, 0, 3, 1, 0, 0.85], [30, -0.4, 0.3, 3.2, 0.9, 0.1, 0.95], [46, 0.3, 0.2, 2.6, 0.6, 0.05, 0.7], [72, -0.35, 0.4, 2.8, 0.8, 0, 0.8], [84, 0.45, 0, 2.2, 0.9, 0.1, 0.9]], 0, 4));

const BONE_N = 136;
let BONE = null; // pooled scratch canvas + pixels (made on first use)
/**
 * Lay a sleeve texture along the bone a -> b: half widths h0 at a and h1 at b, a
 * slight bow toward the lamp side. anchor 0 puts texture row 0 `cap` px before a
 * (the rounded head over the shoulder); anchor 1 puts its last row at b (the cuff
 * at the wrist). Column 0 goes on the -n side (n = the bone's right-hand normal).
 */
function bone(ctx, tex, ax, ay, bx, by, h0, h1, bow, anchor, cap) {
  const len = Math.hypot(bx - ax, by - ay) || 1;
  const dx = (bx - ax) / len;
  const dy = (by - ay) / len;
  const nx = dy;
  const ny = -dx;
  const m = max(h0, h1) + abs(bow) + cap + 1;
  const x0 = max(0, floor(Math.min(ax, bx) - m));
  const y0 = max(0, floor(Math.min(ay, by) - m));
  const bw = Math.min(BONE_N, Math.min(W, Math.ceil(max(ax, bx) + m)) - x0);
  const bh = Math.min(BONE_N, Math.min(H - BAR, Math.ceil(max(ay, by) + m)) - y0);
  if (bw <= 0 || bh <= 0) return;
  if (!BONE) {
    const cv = document.createElement('canvas');
    cv.width = BONE_N;
    cv.height = BONE_N;
    const c = cv.getContext('2d');
    const img = c.createImageData(BONE_N, BONE_N);
    BONE = { cv, c, img, px: new Int32Array(img.data.buffer) };
  }
  const out = BONE.px;
  const tp = tex.px;
  const tw = tex.w;
  const th = tex.h;
  for (let j = 0; j < bh; j++) {
    const qy = y0 + j + 0.5 - ay;
    for (let i = 0; i < bw; i++) {
      const qx = x0 + i + 0.5 - ax;
      const u = qx * dx + qy * dy;
      let val = 0;
      if (u <= len && u >= -cap) {
        const t = u <= 0 ? 0 : u / len;
        const hw = h0 + (h1 - h0) * t;
        const v = qx * nx + qy * ny - bow * sin(PI * t);
        if (v > -hw && v < hw) {
          let row = anchor === 0 ? floor(u + cap) : th - 1 - floor(len - u);
          row = row < 0 ? 0 : row >= th ? th - 1 : row;
          const col = floor((v / hw + 1) * 0.5 * tw);
          val = tp[row * tw + (col < 0 ? 0 : col >= tw ? tw - 1 : col)];
        }
      }
      out[j * BONE_N + i] = val;
    }
  }
  BONE.c.putImageData(BONE.img, 0, 0, 0, 0, bw, bh);
  ctx.drawImage(BONE.cv, 0, 0, bw, bh, x0, y0, bw, bh);
}

// Timing (shot length 4.2 s; it opens through a short dip to black): the glass
// comes up from his chest to under his nose, his eyes close as it arrives, he
// breathes in. The elbow leads the hand by a beat (it lifts first, the glass
// follows) and swings forward on a slight arc; it stays under the frame line.
const INHALE = [[0, 0], [2.45, 0], [3.0, -1, 'inOut'], [3.8, -1], [4.3, 0, 'inOut']];
const BUST_X = 204; // screen x of the sprite's left edge (nose tip at +3)
const BUST_Y = 38; // screen y of the crown
const SHOULDER_X = 254; // the shoulder joint, under the jacket's shoulder line
const SHOULDER_Y = 142;
const ELBOW0_X = 284; // the elbow at rest, down at his side (below the frame)
const ELBOW0_Y = 226;
const ELBOW1_X = 210; // the elbow raised, forward under the glass
const ELBOW1_Y = 202;
const REST_X = 206; // glass axis at rest, in front of his chest
const REST_Y = 149; // rim at rest
const UP_X = 195; // glass axis under his nose (the tip hangs over the rim)
const UP_Y = 89; // rim just under the nostril

function shotNose(ctx, lt) {
  ctx.drawImage(lounge(), 0, 0);
  drips(ctx, lt);
  const breath = round(key(lt, INHALE));
  const bx = BUST_X;
  const by = BUST_Y + breath;
  ctx.drawImage(bustArt(), bx, by);
  eye(ctx, bx, by, lt < 1.85 ? 0 : lt < 2.0 ? 1 : 2);
  // the glass rises on a slight arc (it comes up in front of the chest, then in to the nose)
  const gp = smooth(prog(lt, 0.55, 2.05));
  const arc = sin(gp * PI) * 5;
  const gx = round(lerp(REST_X, UP_X, gp) - arc);
  const gy = round(lerp(REST_Y, UP_Y, gp)) + breath;
  const hx = gx - HAND_GX;
  const hy = gy - HAND_RIM;
  // the wrist: at his chest the forearm comes in from the side of the hand, under
  // his nose from below it (the wrist bends as the glass comes up)
  const wx = hx + lerp(37, 31, gp);
  const wy = hy + lerp(27, 30, gp);
  const ge = smooth(prog(lt, 0.42, 1.92));
  const ex = lerp(ELBOW0_X, ELBOW1_X, ge);
  const ey = lerp(ELBOW0_Y, ELBOW1_Y, ge) + sin(ge * PI) * 5 + breath;
  // upper sleeve from the shoulder (its rounded head over the joint) to the elbow
  bone(ctx, upperTex(), SHOULDER_X, SHOULDER_Y + breath, ex, ey, 12.5, 11, -1, 0, UPPER_CAP);
  // the glass, then the hand round it, then the forearm with the cuff over the wrist
  SMALL_GLASS.top = 4; // a generous pour over ice: the amber shows above his fingers
  SMALL_O.rows = GLASS_H;
  SMALL_CUTS.cv = cutsTex();
  SMALL_CUTS.top = round(GLASS_H * 0.5);
  SMALL_CUTS.h = GLASS_H - SMALL_CUTS.top;
  lathe(ctx, gx, gy, fill(SPROF, GLASS_H, SMALL_KEYS, 1), SMALL_O);
  ovalRing(ctx, gx, gy + 2, 13, 3, A(P.cream, 0.55));
  ctx.drawImage(handArt(), hx, hy);
  const fl = Math.hypot(wx - ex, wy - ey) || 1;
  bone(ctx, foreTex(), ex, ey, wx + ((wx - ex) / fl) * 0.5, wy + ((wy - ey) / fl) * 0.5, 10.5, 8.5, 1.2, 1, 0);
  vignette(ctx, 0.55);
  // tasting notes in the space he faces, each as it is said ("Oak. Caramel... Dial-up." from 14.0 s)
  const tx = 104;
  fadeUp(ctx, 'TASTING NOTES', tx, 62, lt - 0.3, { face: 'micro', color: P.cream, track: 2, align: 'center', dur: 0.6 });
  rule(ctx, tx, 72, 40, (lt - 0.4) / 0.6, P.tanShade);
  fadeUp(ctx, 'OAK', tx, 82, lt - 0.62, { face: 'serif', color: P.cream, track: 3, align: 'center', dur: 0.5 });
  fadeUp(ctx, 'CARAMEL', tx, 100, lt - 1.12, { face: 'serif', color: P.cream, track: 3, align: 'center', dur: 0.55 });
  fadeUp(ctx, 'DIAL-UP', tx, 118, lt - 1.92, { face: 'serif', color: GOLD, track: 3, align: 'center', dur: 0.6 });
}

// --- 5. HERO -----------------------------------------------------------------------

const heroBg = lazy(() => gradient('bf-hero', W, H, { cx: 192, cy: 96, rx: 200, ry: 150, ramp: [P.black, P.maroon, P.brown], gamma: 1.8, seam: 0.45 }));

// Behind the plinth, deep in the dark, the cellar it came from: the racks of
// the server hall, far out of focus, a warm glint on the odd bottle end, and a
// brick vault overhead. Kept two steps under the bottle so it still leads.
const VAULT_DX = -130; // racks then stand at x 20, 78, 136, 194, 252, 310, 368
const vault = lazy(() =>
  cached('bf-vault', W, H, (c) => {
    c.drawImage(heroBg(), 0, 0);
    // the brick vault: a shallow arch of courses, only its lower curve catching light
    for (let x = 0; x < W; x++) {
      const u = (x - 192) / 230;
      const ay = round(30 + 26 * u * u);
      R(c, x, 0, 1, ay, A(P.black, 0.55));
      R(c, x, ay, 1, 1, A(P.tanShade, 0.12 * (1 - abs(u))));
      for (let k = 1; k < 4; k++) if ((x + k * 7) % 14 === 0) R(c, x, ay - k * 6, 1, 5, A(P.black, 0.3));
    }
    // the racks of the server hall, far behind and dim (the same racks as the cellar shot)
    c.save();
    c.globalAlpha = 0.42;
    c.drawImage(hallRacks(), VAULT_DX, 0);
    c.restore();
    // the floor in front of the racks, dark polished stone
    R(c, 0, 170, W, 46, A(P.black, 0.5));
  }),
);

// A slow drift of haze through the light (wraps horizontally): soft value
// noise, quantised to three faint levels of warm light and ordered-dithered.
const SMOKE_W = 256;
const SMOKE_H = 120;
const smokeTex = lazy(() =>
  cached('bf-smoke', SMOKE_W, SMOKE_H, (c) => {
    const img = c.createImageData(SMOKE_W, SMOKE_H);
    const buf = new Uint32Array(img.data.buffer);
    const lattice = (ix, iy, cell, seed) => hash01(((ix % (SMOKE_W / cell)) + (SMOKE_W / cell)) % (SMOKE_W / cell) + iy * 131, seed);
    const noise = (x, y, cell, seed) => {
      const fx = x / cell;
      const fy = y / cell;
      const ix = floor(fx);
      const iy = floor(fy);
      const sx = smooth(fx - ix);
      const sy = smooth(fy - iy);
      const a = lerp(lattice(ix, iy, cell, seed), lattice(ix + 1, iy, cell, seed), sx);
      const b = lerp(lattice(ix, iy + 1, cell, seed), lattice(ix + 1, iy + 1, cell, seed), sx);
      return lerp(a, b, sy);
    };
    const [cr, cg, cb] = [234, 212, 170]; // P.cream
    for (let y = 0; y < SMOKE_H; y++) {
      // thinner toward the top and bottom of the band
      const env = sin((y / SMOKE_H) * PI);
      for (let x = 0; x < SMOKE_W; x++) {
        // stretched horizontally: haze lies in layers
        const n = noise(x, y * 2.2, 64, 5) * 0.55 + noise(x, y * 2.2, 32, 6) * 0.3 + noise(x, y * 2.2, 16, 7) * 0.15;
        const v = clamp((n - 0.52) / 0.22, 0, 1) * env;
        const lv = v * 3 + bayer(x, y) - 0.5; // ordered dither between levels
        const q = clamp(round(lv), 0, 3);
        if (q > 0) buf[y * SMOKE_W + x] = (round(q * 15) << 24) | (cb << 16) | (cg << 8) | cr;
      }
    }
    c.putImageData(img, 0, 0);
  }),
);
/** The haze band at y, drifting right at `speed` px/s; alpha scales it. */
function haze(ctx, lt, y, speed, alpha) {
  if (alpha <= 0) return;
  const tex = smokeTex();
  const off = round(lt * speed) % SMOKE_W;
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let x = off - SMOKE_W; x < W; x += SMOKE_W) ctx.drawImage(tex, x, y);
  ctx.restore();
}
const texHero = lazy(() => labelTex(37));
const texSlate = lazy(() => labelTex(30));

// lit only by a dim edge after the dip to black; the lights come up on the
// brand chord (lt 0.83 = 18.33 s), then a softbox sweep travels round the glass
const HERO_LEN = 3.33;
function shotHero(ctx, lt) {
  ctx.drawImage(heroBg(), 0, 0);
  const up = smooth(prog(lt, 0.8, 2.0));
  // the vault comes out of the dark with the lights
  ctx.save();
  ctx.globalAlpha = 0.3 + 0.7 * up;
  ctx.drawImage(vault(), 0, 0);
  ctx.restore();
  beam(ctx, 192, 0, 192, 172, 40, 110, { color: P.cream, alpha: 0.035 * up });
  haze(ctx, lt, 58, 5, 0.25 + 0.6 * up);
  // locked off: the bottle and its plinth keep one size (no push-in on baked art)
  const k = 1;
  const base = 172;
  const prx = 66;
  const pry = 9;
  plinth(ctx, 192, base, prx, pry);
  BO.turn = 0.5; // label square to the lens the whole shot
  BO.keyK = 0.22 + 0.78 * up;
  BO.sweep = lt > 1.2 && lt < 2.7 ? tween(lt, 1.2, 2.7, -1.3, 1.3, 'inOut') : null;
  BO.big = true;
  contact(ctx, 192, base + 1, round(36 * k), 0.5);
  // the bottle, each pass mirrored into the polished stone of the plinth top
  MIRROR.axis = base + 2;
  MIRROR.alpha = 0.14;
  MIRROR.x = 192 - prx;
  MIRROR.y = base;
  MIRROR.w = prx * 2;
  MIRROR.h = pry + 1;
  BO.mirror = MIRROR;
  BO.rimK = 0.95 * up;
  BO.text = 0.2 + 0.8 * up;
  bottle(ctx, 192, base + 2, k, texHero(), BO);
  BO.mirror = null;
  glintStar(ctx, 188, base + 2 - round((BODY_H + STOP_H) * k) + 3, (lt - 2.55) / 0.8, P.white);
  vignette(ctx, 0.65);
}

// --- 6. SLATE ----------------------------------------------------------------------

const slateBg = lazy(() => gradient('bf-slate', W, H, { cx: 112, cy: 100, rx: 190, ry: 140, ramp: [P.black, P.maroon, P.brown], gamma: 1.9, seam: 0.45 }));
// 11 words: on screen >= max(3 s, 0.3 s a word) (channel-and-breaks §5.4)
const LEGAL = 'NO ALCOHOL. NO DATA. THE SERVER FARM CLOSED FOR UNRELATED REASONS.';

function shotSlate(ctx, lt) {
  ctx.drawImage(slateBg(), 0, 0);
  // the cellar racks behind the bottle only (the lock-up keeps clean ground);
  // the clip falls in the gap between two racks
  clipRect(ctx, 0, 0, 188, H);
  ctx.globalAlpha = 0.3;
  ctx.drawImage(hallRacks(), VAULT_DX, 0);
  ctx.restore();
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
  // the lock-up, right third: every line in within ~0.9 s of the cut (in over
  // 0.35 s, staggered by 0.1 s, travel <= 6 px), then still for ~2.9 s but for the glint
  const x = 270;
  trackIn(ctx, 'BITFIZZ', x, 50, lt - 0.1, { face: 'serif', color: GOLD, track: 3, from: 6, dur: 0.5, scale: 2 });
  fadeUp(ctx, 'RESERVE', x + 2, 80, lt - 0.25, { face: 'thin', color: P.cream, track: 7, align: 'center', dur: 0.35 });
  rule(ctx, x, 97, 110, (lt - 0.35) / 0.35, P.yellow, { alpha: 0.7 });
  fadeUp(ctx, 'UNCOMPRESSED.', x, 105, lt - 0.45, { face: 'serif', color: P.cream, track: 3, align: 'center', dur: 0.35 });
  fadeUp(ctx, 'AGED 12 YEARS IN A SERVER FARM', x, 124, lt - 0.55, { face: 'micro', color: P.cream, track: 1, align: 'center', dur: 0.35 });
}

// --- the whole spot ---------------------------------------------------------------

const SLATE_AT = 20.83;
/** Letterbox and the legal line on the bottom bar are part of the film. */
function frame(ctx, dt) {
  letterbox(ctx, 1, BAR);
  // from the cut: full after 0.4 s, so 3.4 s fully legible before 24.6 s (11 words x 0.3 s = 3.3 s)
  if (dt > SLATE_AT) smallPrint(ctx, LEGAL, W / 2, H - BAR + 8, W - 40, { color: P.fog, lt: dt - SLATE_AT, dur: 0.4 });
}

// Cuts on the beat grid (72 bpm: a beat is 0.833 s). Ordered dissolves only
// between shots with nothing written on screen; a short dip into the portrait,
// the long dip into the hero (the band is silent there, the brand chord lands
// with the lights), then a straight cut on the beat to the pack shot.
const SHOTS = [
  { at: 0, draw: shotMacro },
  { at: 4.17, draw: shotCellar, wipe: 'dither', wd: 0.8 },
  { at: 8.33, draw: shotPour, wipe: 'dither', wd: 0.8 },
  { at: 13.33, draw: shotNose, wipe: 'black', wd: 0.6, hold: 0.05 },
  { at: 17.5, draw: shotHero, wipe: 'black', wd: 0.75, hold: 0.25 },
  { at: SLATE_AT, draw: shotSlate },
];

// Lounge jazz at 72 bpm in D minor: soft sine chords, a walking bass, a sparse
// electric-piano motif, brushes. Under "...dial-up." the band stops (from
// beat 19, 15.8 s) and there are more than 1.5 s of silence through the dip to
// black; the brand chord, F major 9, lands with the lights on beat 22 (18.33 s,
// "BitFizz Reserve.") and holds under the slate. Every track ends in rests, so
// the looping bed never restarts inside the spot (26.7 s of music for 24.6 s).
const EP = { wave: 'sine', a: 0.004, d: 0.9, s: 0.12, r: 0.5, vib: false };
const PADI = { wave: 'sine', a: 0.35, d: 1.2, s: 0.75, r: 0.9, vib: [6, 4.5, 0.3] };
const WARM_INFO = { line: -1, speaking: false, duration: 0 };
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
    { at: 14.0, text: 'Oak. Caramel... Dial-up.' },
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
  /** One idle-time bake step before the spot airs (director.prewarm); true when done. */
  warm() {
    return warmUp(SHOTS, -1, WARM_INFO);
  },
  draw(ctx, t, dt, info) {
    warmUp(SHOTS, dt, info);
    play(ctx, dt, info, SHOTS);
    frame(ctx, dt);
  },
};
