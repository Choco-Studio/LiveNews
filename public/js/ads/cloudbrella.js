// CLOUDBRELLA — a product keynote, delivered completely straight, for an
// umbrella that protects you from the cloud (the computing kind). It opens on
// the problem (a phone on a dark stage, lit only by its own screen, filling up
// with notifications), then the stage lights come up for the product: one
// spotlight, a turntable, thin type, a calm presenter's voice and absurd
// specifications. The product is "Cloud White" with a walnut handle; nothing
// else has colour.
//
// Shot list (25.6 s, 96 bpm: a beat is 0.625 s, a bar 2.5 s; cuts on the beat grid):
//  1  0.00 PROBLEM  a phone on the turntable, screen-lit; notification cards
//                   stack up, then flood; keynote labels on the voice.      VO "For years, the cloud has followed you everywhere." / "Updates. Pop-ups. Terms and conditions."
//  2  7.50 REVEAL   (from black) the spotlight comes on; the furled umbrella
//                   descends into it and turns; the name tracks in below.    VO "So we built something simpler."
//  3 11.25 CANOPY   macro on the hem, spec callout.                          VO "A zero-sync canopy."
//  4 14.375 HANDLE  macro on the walnut handle, spec callout.                VO "No Bluetooth. Anywhere."
//  5 17.50 OPEN     the ribs swing out in slow motion; notifications fall on
//                   the canopy and slide off; keynote statistics.            VO "It blocks ninety-nine percent of notifications."
//  6 21.25 SLATE    still product, wordmark in thin type, tagline, legal.    VO "Cloudbrella. Stay offline."
import {
  P, W, H, R, A, oval, disc, ring, line, rrect, cached, lazy, play, tween, prog, smooth, lerp, clamp,
  trackIn, fadeUp, rule, smallPrint, gradient, vignette, beam, contact, glintStar, lathe, turntable, sheen,
  motes, hash01, rgb, bayer, warmUp, tune,
} from './kit.js';

const { round, sin, cos, PI, max, min, abs, sqrt, floor, atan2, pow } = Math;

const FABRIC = [P.black, P.ink, P.slate, P.steel, P.fog, P.silver, P.white]; // Cloud White
const GRAPHITE = [P.black, P.ink, P.slate, P.steel, P.fog];
const METAL = [P.ink, P.steel, P.fog, P.silver, P.white];
// walnut, dark to light (the one warm accent of the spot)
const WALNUT = [P.black, P.maroon, P.brown, P.tanShade, P.tan];

// --- the stage -------------------------------------------------------------------

const TT_Y = 170; // turntable top
const stageFloor = lazy(() => gradient('cb-floor', W, H, { cx: 192, cy: TT_Y, rx: 230, ry: 70, ramp: [P.black, P.ink, P.slate], gamma: 1.7, seam: 0.4 }));
const stageBack = lazy(() => gradient('cb-back', W, H, { cx: 192, cy: 60, rx: 200, ry: 160, ramp: [P.black, P.ink], gamma: 2.2, seam: 0.4 }));
// the turntable in three light levels (one palette step at a time as the light comes up)
const TT_LIT = { top: P.ink, side: P.black, edge: P.slate, hi: P.fog, h: 5, mark: P.slate };
const TT_MID = { top: P.black, side: P.black, edge: P.slate, hi: P.steel, h: 5, mark: P.ink };
const TT_DARK = { top: P.black, side: P.black, edge: P.ink, hi: P.slate, h: 5, mark: P.ink };

/** The keynote stage at spotlight level `light` (0..1), turntable turned to `turn`. */
function stage(ctx, lt, light, turn) {
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
  turntable(ctx, 192, TT_Y, 74, 11, turn, light > 0.62 ? TT_LIT : light > 0.3 ? TT_MID : TT_DARK);
  if (light > 0) oval(ctx, 186, TT_Y - 1, 46, 6, A(P.steel, 0.22 * light));
}
function inCone(x, y) {
  const s = (y + 6) / (TT_Y + 6);
  return abs(x - 192) < (17 + 58 * s) * 0.85;
}

// --- 1. PROBLEM: a phone, lit by its own screen --------------------------------------

const PH_X = 116; // phone centre
const PH_W = 84;
const PH_H = 164;
const PH_B = 174; // bottom edge (standing on the turntable)
const PH_T = PH_B - PH_H;
const SC_X = PH_X - PH_W / 2 + 4; // screen rectangle
const SC_Y = PH_T + 4;
const SC_W = PH_W - 8;
const SC_H = PH_H - 8;
const PH_RAD = 11;
const SC_RAD = 8;

/** Inside a rounded rectangle (pixel centres). */
function inRound(x, y, w, h, r) {
  const qx = max(0, abs(x + 0.5 - w / 2) - (w / 2 - r));
  const qy = max(0, abs(y + 0.5 - h / 2) - (h / 2 - r));
  return qx * qx + qy * qy <= r * r;
}

// the phone, baked once: graphite frame with a cool rim light from upper right,
// black bezel, side buttons, camera pill; the screen area is left transparent
const phoneBody = lazy(() =>
  cached('cb-phone', PH_W + 2, PH_H, (c) => {
    for (let y = 0; y < PH_H; y++) {
      for (let x = 0; x < PH_W; x++) {
        if (!inRound(x, y, PH_W, PH_H, PH_RAD)) continue;
        const inner = inRound(x - 1, y - 1, PH_W - 2, PH_H - 2, PH_RAD - 1);
        const screen = inRound(x - 4, y - 4, PH_W - 8, PH_H - 8, SC_RAD);
        if (screen) continue;
        let col = P.black;
        if (!inner) col = x > PH_W * 0.55 || y < PH_H * 0.3 ? (x > PH_W * 0.75 && y < PH_H * 0.6 ? P.fog : P.steel) : P.slate;
        else if (!inRound(x - 2, y - 2, PH_W - 4, PH_H - 4, PH_RAD - 2)) col = P.ink;
        R(c, x, y, 1, 1, col);
      }
    }
    // buttons on the right edge (power) and left edge (volume)
    R(c, PH_W, 44, 1, 16, P.steel);
    R(c, PH_W, 44, 1, 1, P.fog);
    R(c, PH_W, 66, 1, 9, P.slate);
  }),
);
// the dark lock-screen wallpaper: a cool field, a little lighter at the top
const wallpaper = lazy(() => gradient('cb-wall', SC_W, SC_H, { kind: 'vertical', ramp: [P.slate, P.ink, P.black], gamma: 0.8, seam: 0.5 }));

/** Clip to the rounded screen (rows of rects; caller restores). */
function clipScreen(ctx) {
  ctx.save();
  ctx.beginPath();
  for (let y = 0; y < SC_RAD; y++) {
    const dy = SC_RAD - y - 0.5;
    const ins = round(SC_RAD - sqrt(max(0, SC_RAD * SC_RAD - dy * dy)));
    ctx.rect(SC_X + ins, SC_Y + y, SC_W - ins * 2, 1);
    ctx.rect(SC_X + ins, SC_Y + SC_H - 1 - y, SC_W - ins * 2, 1);
  }
  ctx.rect(SC_X, SC_Y + SC_RAD, SC_W, SC_H - SC_RAD * 2);
  ctx.clip();
}

// notification glyphs (flat white line icons, 7x7)
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

// The notifications: [app, message, glyph]; they arrive on the voice and then flood.
const NOTES = [
  ['CLOUD', 'STORAGE FULL', 5], ['CLOUD', 'BACKUP PAUSED', 5], ['CLOUD', 'SIGN IN AGAIN', 5],
  ['SYSTEM', 'UPDATE READY', 2], ['BROWSER', 'ALLOW POP-UP?', 4], ['LEGAL', 'NEW TERMS', 4],
  ['SYSTEM', 'RESTART NOW?', 2], ['BROWSER', 'COOKIES?', 3], ['ACCOUNT', 'VERIFY EMAIL', 1],
  ['LEGAL', 'TERMS UPDATED', 4], ['SYSTEM', 'UPDATE AGAIN', 2], ['CLOUD', 'STORAGE FULL', 5],
  ['BROWSER', 'ALLOW POP-UP?', 4], ['LEGAL', 'ACCEPT TERMS', 4], ['NEWS', 'SUBSCRIBE?', 0],
  ['SYSTEM', 'UPDATE READY', 2], ['CLOUD', 'SYNC FAILED', 5], ['LEGAL', 'NEW TERMS', 4],
  ['BROWSER', 'COOKIES?', 3], ['ACCOUNT', 'SIGN IN AGAIN', 1], ['SYSTEM', 'RESTART NOW?', 2],
];
const ARRIVE = [0.9, 2.0, 3.0, 4.2, 4.95, 5.7, 6.1, 6.4, 6.62, 6.8, 6.95, 7.07, 7.17, 7.26, 7.34, 7.41, 7.47, 7.53, 7.58, 7.63, 7.68];
const CARD_W = SC_W - 6;
const CARD_H = 19;
const PITCH = CARD_H + 3;
const SLIDE = 0.35;
const easeOutQ = (x) => 1 - (1 - clamp(x, 0, 1)) ** 4;

function card(ctx, x, y, i, a) {
  const n = NOTES[i];
  ctx.globalAlpha = a;
  rrect(ctx, x, y, CARD_W, CARD_H, A(P.slate, 0.92), 3);
  R(ctx, x + 3, y, CARD_W - 6, 1, A(P.steel, 0.9)); // the frosted card's lit top edge
  rrect(ctx, x + 3, y + 4, 11, 11, P.steel, 2);
  glyph(ctx, GLYPHS[n[2]], x + 8, y + 9);
  fadeUp(ctx, n[0], x + 16, y + 4, 9, { face: 'micro', color: P.white, track: 0 });
  fadeUp(ctx, n[1], x + 16, y + 11, 9, { face: 'micro', color: P.fog, track: 0 });
  ctx.globalAlpha = 1;
}

/** The stack at time lt: newest on top, each arrival eases the others down. */
function notifications(ctx, lt) {
  const x = SC_X + 3;
  const y0 = SC_Y + 20;
  let pulse = 0;
  for (let i = ARRIVE.length - 1; i >= 0; i--) {
    if (lt < ARRIVE[i]) continue;
    let off = 0;
    for (let j = i + 1; j < ARRIVE.length; j++) if (lt >= ARRIVE[j]) off += easeOutQ((lt - ARRIVE[j]) / SLIDE);
    const e = easeOutQ((lt - ARRIVE[i]) / SLIDE);
    const y = round(y0 + off * PITCH - (1 - e) * 6);
    if (y > SC_Y + SC_H) continue;
    card(ctx, x, y, i, e);
    pulse += max(0, 1 - (lt - ARRIVE[i]) / 0.6);
  }
  return min(1, pulse);
}

const glowBack = lazy(() => gradient('cb-phone-glow', W, H, { cx: PH_X, cy: 96, rx: 120, ry: 110, ramp: [P.black, P.ink], gamma: 1.6, seam: 0.5 }));

function shotProblem(ctx, lt) {
  const wake = smooth(prog(lt, 0.15, 0.7)); // the screen wakes
  R(ctx, 0, 0, W, H, P.black);
  // the screen is the only light: a cool glow on the room and a pool on the turntable
  ctx.save();
  ctx.globalAlpha = wake;
  ctx.drawImage(glowBack(), 0, 0);
  ctx.restore();
  turntable(ctx, PH_X, TT_Y, 74, 11, 0.1, TT_DARK);
  if (wake > 0) {
    oval(ctx, PH_X, TT_Y + 3, 58, 7, A(P.slate, 0.35 * wake));
    oval(ctx, PH_X, TT_Y + 3, 38, 5, A(P.steel, 0.18 * wake));
  }
  contact(ctx, PH_X, PH_B, 42, 0.7);
  ctx.drawImage(phoneBody(), PH_X - PH_W / 2, PH_T);
  // the screen
  clipScreen(ctx);
  R(ctx, SC_X, SC_Y, SC_W, SC_H, P.black);
  let pulse = 0;
  if (wake > 0) {
    ctx.globalAlpha = wake;
    ctx.drawImage(wallpaper(), SC_X, SC_Y);
    ctx.globalAlpha = 1;
    // status row: the cloud is always there, syncing
    glyph(ctx, 'sync', SC_X + 9, SC_Y + 9, P.fog);
    R(ctx, SC_X + SC_W - 15, SC_Y + 7, 9, 5, P.fog);
    R(ctx, SC_X + SC_W - 14, SC_Y + 8, 7, 3, P.ink);
    R(ctx, SC_X + SC_W - 14, SC_Y + 8, 2, 3, P.fog); // battery nearly flat
    R(ctx, SC_X + SC_W - 6, SC_Y + 8, 1, 3, P.fog);
    pulse = notifications(ctx, lt);
    // the glass: one soft diagonal reflection over everything on screen
    beam(ctx, SC_X + 52, SC_Y - 4, SC_X - 10, SC_Y + SC_H, 16, 30, { color: P.white, alpha: 0.025, layers: 2 });
  }
  ctx.restore();
  R(ctx, PH_X - 10, PH_T + 6, 20, 6, P.black); // camera pill
  R(ctx, PH_X + 5, PH_T + 8, 1, 1, P.slate);
  // each arrival brightens the room a touch (motivated light, no flashing)
  if (pulse > 0) oval(ctx, PH_X, TT_Y + 3, 52, 6, A(P.steel, 0.12 * pulse));
  vignette(ctx, 0.5);
  // keynote section header and the three words, on the voice
  fadeUp(ctx, '01', 200, 44, lt - 1.0, { face: 'thin', color: P.fog, dur: 0.8 });
  fadeUp(ctx, 'THE PROBLEM', 216, 46, lt - 1.1, { face: 'micro', color: P.fog, track: 2, dur: 0.8 });
  rule(ctx, 200, 60, 40, (lt - 1.3) / 0.8, P.slate, { align: 'left' });
  fadeUp(ctx, 'UPDATES.', 200, 82, lt - 4.2, { face: 'thin', color: P.silver, track: 1, dur: 0.6 });
  fadeUp(ctx, 'POP-UPS.', 200, 98, lt - 4.95, { face: 'thin', color: P.silver, track: 1, dur: 0.6 });
  fadeUp(ctx, 'TERMS AND CONDITIONS.', 200, 114, lt - 5.7, { face: 'thin', color: P.white, track: 1, dur: 0.6 });
}

// --- the product ------------------------------------------------------------------
// Drawn per pixel by kit.lathe: the ferrule, the canopy (furled or open, its
// pleats or panels as a texture so they turn), the graphite shaft, a metal
// collar and a baked, per-pixel lit walnut J handle.

// furled: six wide pleats; each is a soft crease (a dark line with its lit lip
// beside it) over the smoothly shaded fabric, so nothing crawls as it turns
const furledTex = lazy(() =>
  cached(
    'cb-furled2',
    256,
    64,
    (c) => {
      for (let i = 0; i < 6; i++) {
        const x = round(i * 42.7 + hash01(i, 7) * 6);
        R(c, x, 4, 6, 56, P.slate); // the crease, about a pixel wide on screen
        R(c, x + 6, 4, 6, 56, P.silver); // its lit lip
        R(c, x - 5, 10, 5, 44, P.steel); // fabric turning into the crease
      }
      // the strap round the waist of the canopy, with its snap on the front
      R(c, 0, 36, 256, 6, P.ink);
      R(c, 0, 36, 256, 1, P.slate);
      R(c, 0, 41, 256, 1, P.black);
      R(c, 120, 37, 16, 4, P.steel);
      R(c, 122, 37, 12, 1, P.silver);
    },
    { cpu: true },
  ),
);
// open: eight panels, a rib under the fabric between each
const openTex = lazy(() =>
  cached(
    'cb-open2',
    256,
    32,
    (c) => {
      for (let i = 0; i < 8; i++) {
        const x = i * 32;
        R(c, x, 2, 3, 30, P.steel); // the rib's shadow line
        R(c, x + 3, 6, 2, 26, P.silver);
      }
    },
    { cpu: true },
  ),
);

const CANOPY = new Float32Array(200);
const SHAFT = new Float32Array(240);
const TIP = new Float32Array(20);
const COLLAR = new Float32Array(30);
const RIB_X = new Float32Array(33);
const RIB_Y = new Float32Array(33);
const CLAB = { cv: null, top: 0, h: 0, turn: 0 };
const C_STRIPES = [[-0.58, 0.05, P.white, 0.05, 0.95]];
const CANOPY_O = { rows: 0, ramp: FABRIC, ambient: 0.22, label: CLAB, stripes: C_STRIPES, rim: { k: 0.8 }, tilt: 0, seam: 0.55 };
const SHAFT_O = { rows: 0, ramp: GRAPHITE, ambient: 0.2, stripes: [[-0.4, 0.3, P.steel]], rim: { k: 0.7 }, seam: 0.5 };
const TIP_O = { rows: 0, ramp: METAL, ambient: 0.3, rim: { k: 0.6 }, seam: 0.5 };
const COLLAR_O = { rows: 0, ramp: METAL, ambient: 0.25, stripes: [[-0.45, 0.14, P.white]], rim: { k: 0.8 }, seam: 0.4 };
const RIB_L = 66; // rib length at scale 1
const SHAFT_L = 112; // ferrule tip to the collar at scale 1
const HOOK_DROP = 23; // collar to the bottom of the J at scale 1

/** The fabric bunched round a furled umbrella (radius at fraction f of the rib). */
const bunch = (f) => 6.5 * (f < 0.72 ? 0.25 + 0.75 * smooth(f / 0.72) : 1 - 0.55 * smooth((f - 0.72) / 0.28));

/**
 * Canopy radii into CANOPY for opening e (0..1, eased): the ribs pivot at the
 * top notch from along the shaft to 70 degrees out, bending into a dome as
 * they go; the rim rises and widens while the canopy gets shallower.
 */
function canopyRows(e, k) {
  const th = lerp(0.06, 1.22, e);
  const kap = 0.9 * e * e;
  const L = RIB_L * k;
  let x = 0;
  let y = 0;
  RIB_X[0] = 0;
  RIB_Y[0] = 0;
  for (let i = 1; i <= 32; i++) {
    const psi = min(PI / 2 - 0.05, th + kap * (0.5 - (i - 0.5) / 32));
    x += (sin(psi) * L) / 32;
    y += (cos(psi) * L) / 32;
    RIB_X[i] = x;
    RIB_Y[i] = y;
  }
  const h = max(3, round(y));
  const fb = (1 - e) * (1 - e) * k;
  let s = 0;
  for (let j = 0; j < h; j++) {
    while (s < 31 && RIB_Y[s + 1] < j) s++;
    const t = clamp((j - RIB_Y[s]) / max(1e-3, RIB_Y[s + 1] - RIB_Y[s]), 0, 1);
    CANOPY[j] = lerp(RIB_X[s], RIB_X[s + 1], t) + bunch(j / (h - 1)) * fb;
  }
  return h;
}

// --- the walnut J handle: baked per size, lit per pixel -------------------------------

const L_KEY = [-0.5, -0.55, 0.67];
const L_RIM = [0.86, -0.3, -0.4];
const HV = [-0.27, -0.3, 0.92]; // half vector of key and eye, for the specular streak
/** Distance from (px, py) to the J centreline; fills HIT { d, nx, ny, s, u }. */
const HIT = { d: 0, nx: 0, ny: 0, s: 0, u: 0 };
function nearJ(px, py, ax, ay, k) {
  const seg = 12 * k;
  const rr = 7 * k;
  const cx = ax - rr;
  const cy = ay + seg;
  HIT.d = 1e9;
  if (py >= ay && py <= cy) {
    const d = abs(px - ax);
    HIT.d = d;
    HIT.nx = px - ax;
    HIT.ny = 0;
    HIT.s = py - ay;
    HIT.u = (px - ax) / max(1, 3.2 * k);
  }
  // the bend: angle 0 at the joint, sweeping down and round to the left
  let a = atan2(py - cy, px - cx);
  if (a < -PI / 2) a += 2 * PI;
  const end = PI * 1.05;
  if (a >= 0 && a <= end) {
    const dist = Math.hypot(px - cx, py - cy);
    const d = abs(dist - rr);
    if (d < HIT.d) {
      HIT.d = d;
      HIT.nx = ((px - cx) / dist) * (dist - rr);
      HIT.ny = ((py - cy) / dist) * (dist - rr);
      HIT.s = seg + rr * a;
      HIT.u = (dist - rr) / max(1, 3.2 * k);
    }
  }
  // the rounded end of the crook
  const ex = cx + cos(end) * rr;
  const ey = cy + sin(end) * rr;
  const de = Math.hypot(px - ex, py - ey);
  if (de < HIT.d && a > PI * 0.9) {
    HIT.d = de;
    HIT.nx = px - ex;
    HIT.ny = py - ey;
    HIT.s = seg + rr * end;
    HIT.u = 0;
  }
}

function paintHook(c, w, h, ax, ay, k) {
  const r = max(1.6, 3.2 * k);
  const img = c.createImageData(w, h);
  const out = new Uint32Array(img.data.buffer);
  const pack = (hex) => {
    const [cr, cg, cb] = rgb(hex);
    return (255 << 24) | (cb << 16) | (cg << 8) | cr;
  };
  const ramp = WALNUT.map(pack);
  const spec = pack(P.cream);
  const rimC = pack(P.fog);
  const grain = k > 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      nearJ(x + 0.5, y + 0.5, ax, ay, k);
      if (HIT.d >= r) continue;
      const nx = HIT.nx / r;
      const ny = HIT.ny / r;
      const nz = sqrt(max(0, 1 - nx * nx - ny * ny));
      const diff = max(0, nx * L_KEY[0] + ny * L_KEY[1] + nz * L_KEY[2]);
      let v = 0.1 + 0.9 * diff;
      if (grain) {
        // long grain lines along the wood, gently wavering
        const g = (HIT.u * 2.4 + 0.25 * sin(HIT.s * 0.045 + HIT.u * 2.5) + 8) % 1;
        if (g < 0.11) v -= 0.12;
        else if (g < 0.2) v += 0.04;
      }
      const th = bayer(x, y);
      const q = clamp(v, 0, 1) * (ramp.length - 1);
      const qi = floor(q);
      const qf = clamp((q - qi - 0.5) / 0.4 + 0.5, 0, 1);
      let col = ramp[min(ramp.length - 1, qf > th ? qi + 1 : qi)];
      const sp = pow(max(0, nx * HV[0] + ny * HV[1] + nz * HV[2]), grain ? 38 : 16);
      if (sp > 0.55 + th * 0.25) col = spec;
      const rim = nx * L_RIM[0] + ny * L_RIM[1] + nz * L_RIM[2];
      if (rim > 0 && rim * rim * rim > 0.32 + th * 0.2) col = rimC;
      out[y * w + x] = col;
    }
  }
  c.putImageData(img, 0, 0);
}

/** The J handle hanging from the collar at (x, y), scale k (baked per size). */
function hook(ctx, x, y, k) {
  const kq = round(k * 20) / 20;
  const pad = round(4 * kq) + 2;
  const w = round(19 * kq) + pad * 2;
  const h = round(24 * kq) + pad * 2;
  const ax = w - pad - round(kq * 3.2);
  const art = cached(`cb-walnut-${kq}`, w, h, (c) => paintHook(c, w, h, ax, pad, kq));
  ctx.drawImage(art, round(x) - ax, round(y) - pad);
  return art;
}

/** Metal collar joining shaft and handle, top at y. */
function collar(ctx, x, y, k) {
  const ch = max(2, round(4 * k));
  for (let j = 0; j < ch; j++) COLLAR[j] = lerp(1.9, 3.4, j / max(1, ch - 1)) * k;
  COLLAR_O.rows = ch;
  lathe(ctx, x, y, COLLAR, COLLAR_O);
  return y + ch;
}

/**
 * The umbrella with its ferrule tip at (cx, top), at scale k, opened by `open`
 * (0..1), turned by `turn`. The ferrule never moves: opening raises the rim.
 */
const GEO = { rimY: 0, R: 0, topC: 0, hc: 0, bottom: 0 };
function umbrella(ctx, cx, top, k, open, turn) {
  const e = smooth(open);
  const tipH = round(8 * k);
  const hc = canopyRows(e, k);
  const shaftBot = top + round(SHAFT_L * k);
  // shaft, collar and handle first: the canopy hides the top of the shaft
  const s0 = top + tipH + 2;
  const sh = shaftBot - s0;
  for (let j = 0; j < sh; j++) SHAFT[j] = 1.5 * k;
  SHAFT_O.rows = sh;
  lathe(ctx, cx, s0, SHAFT, SHAFT_O);
  const hy = collar(ctx, cx, shaftBot - round(2 * k), k);
  hook(ctx, cx, hy - 1, k);
  // canopy
  CLAB.cv = open > 0.1 ? openTex() : furledTex();
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
      R(ctx, round(cx + sin(a) * Rr), round(rimY + 0.22 * e * Rr * fz), 1, 2, fz > 0.5 ? P.silver : P.fog);
    }
  }
  GEO.rimY = rimY;
  GEO.R = Rr;
  GEO.topC = top + tipH;
  GEO.hc = hc;
  GEO.bottom = hy + round(HOOK_DROP * k);
  return rimY;
}
/** Ferrule y that keeps the handle `gap` px above the turntable at scale k. */
const topFor = (k, gap = 5) => TT_Y - gap - round((SHAFT_L + HOOK_DROP + 2) * k);

// --- 2. REVEAL --------------------------------------------------------------------

const REVEAL_K = 1.04;
function shotReveal(ctx, lt) {
  const light = smooth(prog(lt, 0.15, 1.0));
  stage(ctx, lt, light, 0.42 + lt * 0.05);
  const d = easeOutQ(prog(lt, 0.45, 2.6));
  const top = round(lerp(-180, topFor(REVEAL_K), d));
  contact(ctx, 192, TT_Y - 1, round(22 * d), 0.35 * d * light);
  umbrella(ctx, 192, top, REVEAL_K, 0, 0.1 + lt * 0.05);
  vignette(ctx, 0.5);
  // the name, under the turntable, off the product's axis; gone before the cut
  const out = 1 - smooth(prog(lt, 3.3, 3.65));
  trackIn(ctx, 'CLOUDBRELLA', 192, 194, lt - 1.7, { face: 'thin', color: P.white, track: 4, from: 12, dur: 1.4, alpha: out });
}

// --- 3/4. DETAILS -----------------------------------------------------------------

const macroBg = lazy(() => gradient('cb-macro', W, H, { cx: 150, cy: 100, rx: 260, ry: 170, ramp: [P.black, P.ink, P.slate], gamma: 1.8, seam: 0.4 }));

/** Spec callout: a dot on the product, a hairline that draws out, then the words; `a` fades it all. */
function callout(ctx, lt, ax, ay, ex, ey, tx, title, sub, a = 1) {
  const p = smooth(prog(lt, 0, 0.6));
  if (p <= 0 || a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
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
  ctx.restore();
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
const CANOPY_LEN = 3.125;
function shotCanopy(ctx, lt) {
  R(ctx, 0, 0, W, H, P.black);
  const x = -round(tween(lt, 0, CANOPY_LEN + 0.8, 18, 64, 'inOut'));
  const art = fabric();
  ctx.drawImage(art, x, 0);
  sheen(ctx, art, x, 0, prog(lt, 0.2, 2.6), { width: 70, alpha: 0.22, slope: 0.6 });
  vignette(ctx, 0.5);
  callout(ctx, lt - 0.3, 112, 118, 96, 184, 176, 'ZERO-SYNC CANOPY', 'WOVEN FROM NON-NETWORKED FIBRE', 1 - smooth(prog(lt, CANOPY_LEN - 0.4, CANOPY_LEN - 0.1)));
}

const HANDLE_LEN = 3.125;
const HK = 4.6;
function shotHandle(ctx, lt) {
  ctx.drawImage(macroBg(), 0, 0);
  // the walnut handle, close: the shaft comes down into frame through the collar
  const x = round(tween(lt, 0, HANDLE_LEN + 0.7, 156, 148, 'inOut'));
  const y = 28;
  for (let j = 0; j < 50; j++) SHAFT[j] = 1.5 * HK;
  SHAFT_O.rows = 50;
  lathe(ctx, x, y - 50, SHAFT, SHAFT_O);
  const hy = collar(ctx, x, y - 4, HK);
  const art = hook(ctx, x, hy - 1, HK);
  const kq = round(HK * 20) / 20;
  const pad = round(4 * kq) + 2;
  sheen(ctx, art, x - (art.width - pad - round(kq * 3.2)), hy - 1 - pad, prog(lt, 0.3, 2.6), { width: 26, color: P.cream, alpha: 0.18, slope: 0.4 });
  vignette(ctx, 0.55);
  callout(ctx, lt - 0.25, x + 12, 70, 214, 52, 226, 'NO BLUETOOTH.', 'ANYWHERE. WE CHECKED.', 1 - smooth(prog(lt, HANDLE_LEN - 0.4, HANDLE_LEN - 0.1)));
}

// --- 5. OPEN -----------------------------------------------------------------------

/** Notifications falling onto the open canopy, sliding off its shoulders. */
function slideOff(ctx, lt, cx, a) {
  const Rr = GEO.R;
  const top = GEO.topC;
  const hc = GEO.hc;
  if (Rr < 30 || a <= 0) return;
  ctx.globalAlpha = a;
  for (let i = 0; i < 6; i++) {
    // each one starts from above frame in turn, then keeps falling on its own period
    const start = i * 0.34 + hash01(i, 14) * 0.15;
    if (lt < start) continue;
    const per = 1.7 + hash01(i, 13) * 0.6;
    const t = (lt - start) % per;
    // spread across the canopy in lanes so two never overlap
    const x0 = cx - Rr * 0.82 + ((i * 0.37 + 0.11) % 1) * Rr * 1.64;
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
    if (y > TT_Y - 4) continue;
    glyph(ctx, GLYPHS[i % GLYPHS.length], x, y, P.silver);
  }
  ctx.globalAlpha = 1;
}

const OPEN_LEN = 3.75;
function shotOpen(ctx, lt) {
  stage(ctx, lt, 1, 0.9 + lt * 0.05);
  const open = prog(lt, 0.25, 2.0);
  const top = topFor(1);
  contact(ctx, 192, TT_Y - 1, round(lerp(22, 46, smooth(open))), 0.35);
  umbrella(ctx, 192, top, 1, open, 0.3 + lt * 0.04);
  // everything but the product leaves before the cut to the slate
  const out = 1 - smooth(prog(lt, OPEN_LEN - 0.45, OPEN_LEN - 0.1));
  if (lt > 1.2) slideOff(ctx, lt - 1.2, 192, out);
  vignette(ctx, 0.5);
  // keynote statistics either side
  fadeUp(ctx, '99%', 330, 74, lt - 1.0, { face: 'thin', color: P.white, track: 2, align: 'center', scale: 2, dur: 0.8, alpha: out });
  fadeUp(ctx, 'OF NOTIFICATIONS', 330, 98, lt - 1.25, { face: 'micro', color: P.fog, track: 1, align: 'center', dur: 0.7, alpha: out });
  fadeUp(ctx, 'BLOCKED', 330, 106, lt - 1.35, { face: 'micro', color: P.fog, track: 1, align: 'center', dur: 0.7, alpha: out });
  fadeUp(ctx, '0', 56, 74, lt - 1.7, { face: 'thin', color: P.white, track: 2, align: 'center', scale: 2, dur: 0.8, alpha: out });
  fadeUp(ctx, 'COOKIES', 56, 98, lt - 1.95, { face: 'micro', color: P.fog, track: 1, align: 'center', dur: 0.7, alpha: out });
  fadeUp(ctx, 'ACCEPTED', 56, 106, lt - 2.05, { face: 'micro', color: P.fog, track: 1, align: 'center', dur: 0.7, alpha: out });
}

// --- 6. SLATE ----------------------------------------------------------------------

// 12 words: on screen >= max(3 s, 0.3 s a word) (channel-and-breaks §5.4)
const LEGAL = 'NOT EFFECTIVE AGAINST ACTUAL RAIN. NO TERMS AND CONDITIONS APPLY. FOR ONCE.';
function shotSlate(ctx, lt) {
  R(ctx, 0, 0, W, H, P.black);
  ctx.drawImage(stageBack(), 0, 0);
  beam(ctx, 192, -6, 192, 112, 24, 70, { color: P.silver, alpha: 0.03 });
  // a still product; the only motion is one glint on the ferrule
  contact(ctx, 192, 108, 26, 0.3);
  umbrella(ctx, 192, 20, 0.62, 1, 0.5);
  glintStar(ctx, 192, 22, (lt - 2.2) / 0.9, P.white);
  trackIn(ctx, 'CLOUDBRELLA', 192, 118, lt - 0.1, { face: 'thin', color: P.white, track: 5, from: 12, dur: 1.6, scale: 2 });
  rule(ctx, 192, 145, 80, (lt - 0.8) / 0.8, P.fog);
  fadeUp(ctx, 'STAY DRY. STAY OFFLINE.', 192, 152, lt - 0.5, { face: 'thin', color: P.silver, track: 2, align: 'center', dur: 0.8 });
  fadeUp(ctx, 'IN CLOUD WHITE AND OFFLINE GREY', 192, 168, lt - 0.9, { face: 'micro', color: P.fog, track: 1, align: 'center', dur: 0.8 });
  smallPrint(ctx, LEGAL, 192, 184, 300, { color: P.fog, lt: lt - 0.3, dur: 0.6 });
}

const SHOTS = [
  { at: 0, draw: shotProblem },
  { at: 7.5, draw: shotReveal, wipe: 'black', wd: 0.7, hold: 0.2 },
  { at: 11.25, draw: shotCanopy, wipe: 'cut' },
  { at: 14.375, draw: shotHandle, wipe: 'soft', wd: 0.8, dir: 1 },
  { at: 17.5, draw: shotOpen, wipe: 'black', wd: 0.6, hold: 0.1 },
  { at: 21.25, draw: shotSlate, wipe: 'black', wd: 0.5, hold: 0.1 },
];

// Keynote bed at 96 bpm. The problem in B minor (sparse pluck, airy pads); the
// reveal resolves to D major as the light comes on (beat 12), a soft sub pulse
// under the details; the resolution and a single bell on the end slate (beat
// 34, 21.25 s). Every track ends in rests so the looping bed never restarts
// inside the spot (27.5 s of music for 25.6 s).
const PLUCK = { wave: 'tri', a: 0.003, d: 0.32, s: 0, r: 0.2, vib: false };
const AIR = { wave: 'sine', a: 0.6, d: 1.5, s: 0.8, r: 1.2, vib: [5, 4, 0.4] };
const BELL = { wave: 'sine', a: 0.002, d: 1.4, s: 0, r: 0.8, vib: false };
const ARP_Bm = 'D5:0.5@0.24 F#4:0.5@0.16 B4:0.5@0.2 F#4:0.5@0.16 C#5:0.5@0.22 F#4:0.5@0.16 A4:0.5@0.18 F#4:0.5@0.16';
const ARP_Gm = 'D5:0.5@0.24 G4:0.5@0.16 B4:0.5@0.2 G4:0.5@0.16 F#5:0.5@0.22 G4:0.5@0.16 A4:0.5@0.18 G4:0.5@0.16';
const ARP_EF = 'B4:0.5@0.22 E4:0.5@0.16 G4:0.5@0.2 E4:0.5@0.16 A#4:0.5@0.24 F#4:0.5@0.16 C#5:0.5@0.22 F#4:0.5@0.16';
const ARP_D = 'D5:0.5@0.32 A4:0.5@0.22 F#5:0.5@0.28 A4:0.5@0.2 E5:0.5@0.3 A4:0.5@0.22 C#5:0.5@0.26 A4:0.5@0.2';
const ARP_B = 'D5:0.5@0.3 F#4:0.5@0.2 B4:0.5@0.26 F#4:0.5@0.2 C#5:0.5@0.28 F#4:0.5@0.2 A4:0.5@0.24 F#4:0.5@0.2';
const ARP_G = 'D5:0.5@0.3 G4:0.5@0.2 B4:0.5@0.26 G4:0.5@0.2 F#5:0.5@0.3 G4:0.5@0.2 A4:0.5@0.24 G4:0.5@0.2';
const ARP_A = 'E5:0.5@0.3 A4:0.5@0.2 C#5:0.5@0.26 A4:0.5@0.2 D5:0.5@0.3 A4:0.5@0.2 E5:0.5@0.28 A4:0.5@0.2';
export default {
  id: 'cloudbrella',
  brand: 'CLOUDBRELLA',
  duration: 25.6,
  voice: { gender: 'female', lang: 'en-US', pitch: 1.0, rate: 0.95 },
  script: [
    { at: 0.6, text: 'For years, the cloud has followed you everywhere.' },
    { at: 4.2, text: 'Updates. Pop-ups. Terms and conditions.' },
    { at: 7.9, text: 'So we built something simpler.' },
    { at: 11.5, text: 'A zero-sync canopy.' },
    { at: 14.6, text: 'No Bluetooth. Anywhere.' },
    { at: 17.8, text: 'It blocks ninety-nine percent of notifications.' },
    { at: 21.6, text: 'Cloudbrella. Stay offline.' },
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
          'B2+F#3+A3+D4:4@0.34 G2+D3+F#3+B3:4@0.34 E2+B2+D3+G3:2@0.34 F#2+C#3+E3+A#3:2@0.36',
          'D3+A3+C#4+E4+F#4:8@0.4 B2+F#3+A3+D4:4@0.4 G2+D3+F#3+B3:4@0.4 A2+E3+A3+C#4:6@0.42',
          'D3+A3+C#4+E4+F#4:8@0.36 R:2',
        ),
      },
      {
        kind: 'lead', inst: PLUCK, gain: 0.7, echo: 0.45,
        notes: tune(ARP_Bm, ARP_Gm, ARP_EF, 'R:2', ARP_D, ARP_D, ARP_B, ARP_G, ARP_A, 'D5:4@0.3 R:6'),
      },
      {
        kind: 'bass', inst: 'sine', gain: 0.8,
        notes: tune(
          'B1:4@0.42 G1:4@0.42 E1:2@0.42 F#1:2@0.46',
          'R:2 D2:1@0.6 R:1 D2:1@0.5 R:1 D2:1@0.6 R:1 D2:1@0.5 R:1 B1:1@0.6 R:1 B1:1@0.5 R:1 G1:1@0.6 R:1 G1:1@0.5 R:1 A1:1@0.6 R:1 A1:1@0.55 R:1',
          'D2:8@0.55 R:2',
        ),
      },
      {
        kind: 'lead', inst: BELL, gain: 0.55, echo: 0.5,
        notes: tune('R:34', 'D6:3@0.3 A5:4@0.25 R:3'),
      },
      { drums: tune('R:14', 'K:2@0.22 K:2@0.18 K:2@0.22 K:2@0.18 K:2@0.22 K:2@0.18 K:2@0.22 K:2@0.18 K:2@0.22 K:1@0.2 X:1@0.12', 'R:10') },
    ],
  },
  draw(ctx, t, dt, info) {
    warmUp(SHOTS, dt, info);
    play(ctx, dt, info, SHOTS);
  },
};
