// CORNERS — artisan square crisps, shot as a premium, slow-motion food
// commercial with a low, velvet voice-over. One crisp turns in a pool of warm
// light; more tumble onto slate in slow motion; Ian, the master squarer,
// checks one with a brass set square; salt falls through a shaft of light;
// three matte packs stand on a plinth. "Life has enough curves."
// (Rebuilt from a previous children's-cartoon version: same product, grown-up
// art and humour. No faces on snacks, no sound-effect lettering.)
//
// The crisps are real little 3D surfaces: a gently curled square with ridged
// facets, rotated and projected each frame and lit per facet, so they turn and
// settle smoothly. Sets are baked once (cine.js).
import {
  P, W, H, clamp, lerp, prog, smooth, easeOut, track, window01, hash, blinkAt, mix, ramp, bake, prewarm, shader, shadeSteps,
  pool, rect, line, begin, pt, fill, ellipse, capsule, film, vignette, vignetteArt, thin, tracked, text, smallPrint, figure, bust,
  arm, wrist,
} from './cine.js';

const { round, floor, sin, cos, abs, min, max, PI, sqrt } = Math;

// --- timing (70 bpm feel; cuts on phrase ends) ------------------------------------------
const T_TUMBLE = 4.0;
const T_IAN = 8.0;
const T_SALT = 12.4;
const T_PACKS = 17.4;
const T_SLATE = 19.8;
const DURATION = 23.0;

// --- palette -----------------------------------------------------------------------------
const GOLD = mix(P.yellow, P.cream, 0.35);
const GOLD_D = mix(P.yellow, P.tanShade, 0.5);
const CRISP = ramp([mix(P.brown, P.black, 0.3), P.tanShade, mix(P.orange, P.tanShade, 0.45), mix(P.yellow, P.orange, 0.25), P.yellow, mix(P.yellow, P.cream, 0.55)], 8);
const EDGE = mix(P.brown, P.tanShade, 0.4);
const FLECK = mix(P.rust, P.brown, 0.5);

// --- the crisp: a curled, ridged square in 3D ------------------------------------------------
const NS = 12; // ridge strips
const QX = new Float64Array((NS + 1) * 2);
const QY = new Float64Array((NS + 1) * 2);
const QZ = new Float64Array((NS + 1) * 2);
const ORDER = Array.from({ length: NS }, (_, i) => i);
const DEPTH = new Float64Array(NS);
const FLECKS = Array.from({ length: 14 }, (_, i) => [hash(i * 3.3) * 1.7 - 0.85, hash(i * 7.1) * 1.7 - 0.85]);
const LIGHT = (() => {
  const l = [-0.45, -0.65, 0.62];
  const n = Math.hypot(...l);
  return l.map((v) => v / n);
})();
const R3 = new Float64Array(9);

function rotation(rx, ry, rz) {
  const [cx, sx, cy, sy, cz, sz] = [cos(rx), sin(rx), cos(ry), sin(ry), cos(rz), sin(rz)];
  // R = Rz * Ry * Rx
  R3[0] = cz * cy;
  R3[1] = cz * sy * sx - sz * cx;
  R3[2] = cz * sy * cx + sz * sx;
  R3[3] = sz * cy;
  R3[4] = sz * sy * sx + cz * cx;
  R3[5] = sz * sy * cx - cz * sx;
  R3[6] = -sy;
  R3[7] = cy * sx;
  R3[8] = cy * cx;
}

const P3 = new Float64Array(3);
function project(u, v, s, curl) {
  const z0 = curl * (u * u - 0.35) * s;
  const x0 = u * s;
  const y0 = v * s;
  P3[0] = R3[0] * x0 + R3[1] * y0 + R3[2] * z0;
  P3[1] = R3[3] * x0 + R3[4] * y0 + R3[5] * z0;
  P3[2] = R3[6] * x0 + R3[7] * y0 + R3[8] * z0;
}

/**
 * Draws one crisp at (cx, cy), half-size s, rotation (rx, ry, rz), curl 0..0.4.
 * `warm` lifts the light (beauty lighting), `rim` adds a backlit edge.
 */
function crisp(ctx, cx, cy, s, rx, ry, rz, { curl = 0.22, warm = 0, rim = null, flecks = true } = {}) {
  rotation(rx, ry, rz);
  for (let i = 0; i <= NS; i++) {
    const u = -1 + (2 * i) / NS;
    project(u, -1, s, curl);
    QX[i * 2] = cx + P3[0];
    QY[i * 2] = cy + P3[1];
    QZ[i * 2] = P3[2];
    project(u, 1, s, curl);
    QX[i * 2 + 1] = cx + P3[0];
    QY[i * 2 + 1] = cy + P3[1];
    QZ[i * 2 + 1] = P3[2];
  }
  for (let i = 0; i < NS; i++) {
    DEPTH[i] = QZ[i * 2] + QZ[i * 2 + 1] + QZ[i * 2 + 2] + QZ[i * 2 + 3];
    ORDER[i] = i;
  }
  ORDER.sort((a, b) => DEPTH[a] - DEPTH[b]);
  for (const i of ORDER) {
    // facet normal = (edge along u) x (edge along v), tilted alternately for the ridges
    const ax = QX[i * 2 + 2] - QX[i * 2];
    const ay = QY[i * 2 + 2] - QY[i * 2];
    const az = QZ[i * 2 + 2] - QZ[i * 2];
    const bx = QX[i * 2 + 1] - QX[i * 2];
    const by = QY[i * 2 + 1] - QY[i * 2];
    const bz = QZ[i * 2 + 1] - QZ[i * 2];
    let nx = ay * bz - az * by;
    let ny = az * bx - ax * bz;
    let nz = ax * by - ay * bx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    const tilt = i & 1 ? 0.16 : -0.16;
    const al = Math.hypot(ax, ay, az) || 1;
    nx += (ax / al) * tilt;
    ny += (ay / al) * tilt;
    nz += (az / al) * tilt;
    const face = nz > 0 ? 1 : -1; // we see whichever side faces us
    const dot = (nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) * face;
    const b = clamp(0.34 + dot * 0.5 + warm);
    begin();
    pt(QX[i * 2], QY[i * 2]);
    pt(QX[i * 2 + 2], QY[i * 2 + 2]);
    pt(QX[i * 2 + 3], QY[i * 2 + 3]);
    pt(QX[i * 2 + 1], QY[i * 2 + 1]);
    fill(ctx, CRISP[min(CRISP.length - 1, floor(b * CRISP.length))]);
  }
  // toasted rim around the square
  ctx.fillStyle = EDGE;
  for (let i = 0; i < NS; i++) {
    line(ctx, QX[i * 2], QY[i * 2], QX[i * 2 + 2], QY[i * 2 + 2], EDGE);
    line(ctx, QX[i * 2 + 1], QY[i * 2 + 1], QX[i * 2 + 3], QY[i * 2 + 3], EDGE);
  }
  line(ctx, QX[0], QY[0], QX[1], QY[1], EDGE);
  line(ctx, QX[NS * 2], QY[NS * 2], QX[NS * 2 + 1], QY[NS * 2 + 1], EDGE);
  if (rim) {
    // backlight catching the top edge
    const top = QY[1] < QY[0] ? 1 : 0;
    for (let i = 0; i < NS; i++) line(ctx, QX[i * 2 + top], QY[i * 2 + top] - 1, QX[i * 2 + 2 + top], QY[i * 2 + 2 + top] - 1, rim);
  }
  if (flecks && s > 12) {
    ctx.fillStyle = FLECK;
    for (const [u, v] of FLECKS) {
      project(u, v, s, curl);
      if (P3[2] < -s * 0.9) continue;
      ctx.fillRect(round(cx + P3[0]), round(cy + P3[1]), 1, 1);
    }
  }
}

// --- S1: one crisp, turning in the dark ------------------------------------------------------
const voidBg = () =>
  shader('cn-void', W, H, [P.black, mix(P.black, P.maroon, 0.45), mix(P.maroon, P.black, 0.25), mix(P.maroon, P.brown, 0.35)], (x, y) => clamp(1 - sqrt(((x - 192) / 190) ** 2 + ((y - 100) / 120) ** 2)) * 0.85);
const keyPool = () => pool('cn-key', 80, 70, P.yellow, 6, 0.12);
const SALT = Array.from({ length: 22 }, (_, i) => ({ x: hash(i * 2.3) * 300 + 42, y: hash(i * 5.9) * 200, v: 4 + hash(i * 8.1) * 6, k: i }));

function saltFall(ctx, lt, x0, x1, y0, y1, speed = 1, a = 1) {
  for (const s of SALT) {
    const x = lerp(x0, x1, (s.x - 42) / 300) + sin(lt * 0.7 + s.k) * 2;
    const y = y0 + ((s.y + lt * s.v * 6 * speed) % (y1 - y0));
    const glint = (floor(lt * 6 + s.k * 1.7) % 5) === 0;
    ctx.globalAlpha = a * (glint ? 0.95 : 0.55);
    rect(ctx, x, y, glint ? 2 : 1, 1, glint ? P.white : P.silver);
  }
  ctx.globalAlpha = 1;
}

function shotHero(ctx, lt) {
  ctx.drawImage(voidBg(), 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(keyPool(), 112, 30);
  ctx.globalCompositeOperation = 'source-over';
  const s = track(lt, [[0, 38], [4.0, 44, 'smooth']]);
  crisp(ctx, 192, 104 + sin(lt * 0.9) * 2, s, -0.42 + sin(lt * 0.5) * 0.18, sin(lt * 0.42 - 0.4) * 0.75, 0.18 + lt * 0.04, { warm: 0.06, curl: 0.16, rim: mix(P.cream, P.yellow, 0.3) });
  saltFall(ctx, lt, 100, 290, 20, 196, 0.35, 0.6);
  vignette(ctx, 0.7);
}

// --- S2: slow motion, crisps settle on slate --------------------------------------------------
const SLATE_Y = 150;
const slateSet = () =>
  bake('cn-slate', 420, H, function* paint(c) {
    yield* shadeSteps(c, 0, 0, 420, SLATE_Y, [P.black, mix(P.black, P.maroon, 0.4), mix(P.maroon, P.black, 0.2)], (x, y) => clamp(1 - sqrt(((x - 240) / 260) ** 2 + ((y - 40) / 160) ** 2)) * 0.8);
    // slate board: dark, slightly blue grey, with a warm backlit edge
    yield* shadeSteps(c, 0, SLATE_Y, 420, H - SLATE_Y, [P.black, mix(P.black, P.ink, 0.6), P.ink, mix(P.ink, P.slate, 0.4)], (x, y) => {
      const d = sqrt(((x - 220) / 240) ** 2 + ((y - SLATE_Y - 6) / 50) ** 2);
      return clamp(1 - d) * 0.8 + 0.05 * sin(x * 0.07 + y * 0.9);
    });
    rect(c, 0, SLATE_Y, 420, 1, mix(P.slate, P.ink, 0.5));
  });

// each falling crisp: x, landing y, start delay, spin, final pose
// (negative starts: the first crisps are already falling when the shot opens)
const FALLERS = [
  { x: 150, y: 168, t0: -1.3, s: 26, spin: 1.1, rz: 0.3 },
  { x: 232, y: 174, t0: -0.5, s: 28, spin: -0.9, rz: -0.25 },
  { x: 300, y: 162, t0: 0.2, s: 22, spin: 1.3, rz: 0.6 },
  { x: 196, y: 186, t0: 0.9, s: 30, spin: -1.2, rz: 0.05 },
];

function shotTumble(ctx, lt) {
  const camX = track(lt, [[0, 0], [4.4, 18, 'smooth']]);
  ctx.drawImage(slateSet(), -round(camX * 0.6), 0);
  ctx.save();
  ctx.translate(-round(camX), 0);
  const G = 70; // slow-motion gravity (px/s^2)
  for (const f of FALLERS) {
    const k = lt - f.t0;
    if (k < 0) continue;
    const fallT = sqrt((2 * (f.y + 40)) / G);
    let y;
    let rx;
    let ry;
    if (k < fallT) {
      // tumbling, but arriving exactly in the resting pose (no pop on landing)
      y = -40 + 0.5 * G * k * k;
      rx = -0.98 + (k - fallT) * f.spin;
      ry = (k - fallT) * f.spin * 0.6;
    } else {
      // settles flat with a small, damped rock (no bounce)
      const q = k - fallT;
      y = f.y;
      const rock = Math.exp(-q * 3) * sin(q * 9) * 0.12;
      rx = -0.98 + rock;
      ry = 0;
    }
    // contact shadow grows as it nears the slate
    const near = clamp(1 - (f.y - y) / 80);
    ctx.globalAlpha = 0.5 * near;
    ellipse(ctx, f.x + 4, f.y + f.s * 0.32, f.s * 0.9, f.s * 0.18, P.black);
    ctx.globalAlpha = 1;
    crisp(ctx, f.x, y, f.s, rx, ry, f.rz, { curl: 0.12, warm: 0.1, rim: mix(P.cream, P.yellow, 0.4) });
  }
  ctx.restore();
  vignette(ctx, 0.65);
}

// --- S3: Ian, master squarer ------------------------------------------------------------------
const workshopSet = () =>
  bake('cn-workshop', 400, H, function* paint(c) {
    yield* shadeSteps(c, 0, 0, 400, H, [P.black, mix(P.black, P.maroon, 0.5), P.maroon, mix(P.maroon, P.brown, 0.5), P.brown], (x, y) => {
      const d = sqrt(((x - 210) / 200) ** 2 + ((y - 30) / 170) ** 2);
      return clamp(1 - d) * 0.85 + 0.03 * ((x >> 2) & 1) * (y < 120 ? 1 : 0);
    });
    // pegboard of tools behind, soft
    for (let i = 0; i < 6; i++) {
      const x = 30 + i * 22;
      rect(c, x, 40 + (i & 1) * 6, 2, 30 + (i % 3) * 6, mix(P.maroon, P.black, 0.3));
    }
    for (let i = 0; i < 5; i++) {
      const x = 300 + i * 18;
      rect(c, x, 36, 10, 2, mix(P.maroon, P.black, 0.3));
      rect(c, x + 4, 38, 2, 26 + (i & 1) * 8, mix(P.maroon, P.black, 0.3));
    }
    // workbench
    yield* shadeSteps(c, 0, 176, 400, H - 176, [P.black, mix(P.black, P.maroon, 0.6), P.maroon, P.brown], (x, y) => clamp(1 - sqrt(((x - 210) / 200) ** 2 + ((y - 178) / 40) ** 2)) * 0.9);
    rect(c, 0, 176, 400, 1, mix(P.tanShade, P.brown, 0.4));
    // pendant lamp at the top
    begin();
    pt(194, 0);
    pt(230, 0);
    pt(240, 14);
    pt(184, 14);
    fill(c, mix(P.darkGreen, P.black, 0.45), { d: P.black, f: 0.3, m: 1, side: 1 });
    rect(c, 186, 14, 52, 1, mix(P.yellow, P.cream, 0.5));
  });
const lampCone = () => pool('cn-cone', 110, 90, P.yellow, 6, 0.16);

const IAN = figure({
  hh: 40,
  hair: 'short',
  garment: 'apron',
  apron: mix(P.brown, P.black, 0.45),
  glasses: mix(P.tanShade, P.black, 0.3),
  shoulders: 1.0,
  pal: {
    skin: mix(P.skin, P.tan, 0.35),
    skinD: mix(P.skinShade, P.tanShade, 0.5),
    hair: mix(P.fog, P.steel, 0.4),
    hairD: P.steel,
    hairL: P.silver,
    top: mix(P.steel, P.fog, 0.35),
    topD: mix(P.slate, P.ink, 0.4),
    topL: mix(P.fog, P.silver, 0.4),
    shirt: mix(P.cream, P.fog, 0.4),
    shirtD: P.fog,
    lip: mix(P.skinShade, P.brown, 0.5),
  },
});
const HAND_A = { x: 0, y: 0 };
const HAND_B = { x: 0, y: 0 };

/** A brass set square: right triangle with a triangular hole (hairline edges). */
function setSquare(ctx, x, y, s) {
  const brass = mix(P.yellow, P.tanShade, 0.35);
  // outer triangle, then the inner one through a zero-width bridge (even-odd hole)
  const k = s * 0.17;
  begin();
  pt(x, y);
  pt(x, y - s);
  pt(x + s, y);
  pt(x, y);
  pt(x + k, y - k);
  pt(x + s - k * 2.4, y - k);
  pt(x + k, y - s + k * 2.4);
  pt(x + k, y - k);
  fill(ctx, brass, { d: mix(brass, P.brown, 0.5), f: 0.2, m: 1, side: 1 });
  line(ctx, x, y - s, x, y, mix(P.cream, P.yellow, 0.4));
  for (let i = 1; i < 6; i++) rect(ctx, x + 1, y - (s * i) / 6, 2, 1, mix(brass, P.brown, 0.6));
}

function shotIan(ctx, lt, info) {
  const camX = track(lt, [[0, 0], [4.4, 10, 'smooth']]);
  ctx.drawImage(workshopSet(), round(camX * 0.5), 0, W, H, 0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(lampCone(), 102 - round(camX * 0.5), 12);
  ctx.globalCompositeOperation = 'source-over';
  const m = IAN;
  const ox = -round(camX);
  m.x = 206 + ox;
  m.y = 30;
  m.blink = blinkAt(lt, 4);
  // he looks along the edge, squints, then the smallest nod of approval
  m.look = lt < 2.6 ? -1 : 0;
  m.turn = track(lt, [[0, -0.12], [2.6, -0.12], [3.2, 0]]);
  m.nod = round(window01(lt, 3.3, 3.8, 0.12) * 1.4);
  m.brow = lt > 1.0 && lt < 2.6 ? 0.5 : 0;
  m.smile = lt > 3.4 ? 0.6 : 0.1;
  // left hand (screen right) holds the crisp up; right hand (screen left) brings the set square
  HAND_A.x = m.x + 40;
  HAND_A.y = 122 + round(sin(lt * 1.3) * 0.5);
  // the set square's right angle meets the crisp's lower-left corner
  const cX = HAND_A.x - 4;
  const cY = HAND_A.y - 13;
  const vX = cX - 13;
  const vY = cY + 13;
  HAND_B.x = track(lt, [[0, m.x - 30], [1.3, vX - 2, 'inOut']]);
  HAND_B.y = track(lt, [[0, 176], [1.3, vY - 7, 'inOut']]);
  // elbows hang at his sides; forearms come up towards us (foreshortened)
  m.armR.to = HAND_A;
  m.armR.len = 0.95;
  m.armR.fore = 0.4;
  m.armR.hand = 'hold';
  m.armL.to = HAND_B;
  m.armL.len = 0.9;
  m.armL.fore = 0.55;
  m.armL.hand = 'hold';
  bust(ctx, m, 216);
  // bench in front
  ctx.drawImage(workshopSet(), round(camX), 176, W, H - 176, 0, 176, W, H - 176);
  arm(ctx, m, 1);
  const a = wrist(m, 1);
  crisp(ctx, a.wx - 4, a.wy - 13, 12, -0.12, 0.2, 0.0, { flecks: false, curl: 0.08, warm: 0.08 });
  const b = wrist(m, -1);
  setSquare(ctx, b.wx + 2, b.wy + 7, 26);
  arm(ctx, m, -1);
  // super
  const la = window01(lt, 1.0, 4.2, 0.4);
  if (la > 0) {
    ctx.globalAlpha = la;
    rect(ctx, 24, 193, round(2 + 110 * smooth((lt - 1.0) / 0.5)), 1, GOLD_D);
    ctx.globalAlpha = la * smooth((lt - 1.2) / 0.4);
    tracked(ctx, 'IAN', 24, 181, { color: P.white, track: 1 });
    tracked(ctx, 'MASTER SQUARER  ·  22 YEARS', 24, 198, { color: P.fog, font: 'micro', track: 1 });
    ctx.globalAlpha = 1;
  }
  vignette(ctx, 0.55);
}

// --- S4: salt through a shaft of light ------------------------------------------------------
const shaftArt = () =>
  bake('cn-shaft', 150, H, function* paint(c) {
    const img = c.createImageData(150, H);
    const d = img.data;
    const steps = 6;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < 150; x++) {
        const u = (x - 75 + (y - 108) * 0.35) / 60;
        const q = clamp(1 - abs(u)) * clamp(1.15 - y / 230);
        const k = q * steps;
        let i = floor(k);
        if (k - i > bayerish(x, y)) i++;
        if (i <= 0) continue;
        const o = (y * 150 + x) * 4;
        d[o] = 255;
        d[o + 1] = 214;
        d[o + 2] = 150;
        d[o + 3] = round((i / steps) * 0.16 * 255);
      }
      if ((y & 3) === 3) yield;
    }
    c.putImageData(img, 0, 0);
  });
const bayerish = (x, y) => ([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5][((y & 3) << 2) | (x & 3)] + 0.5) / 16;

const BED = [
  [120, 176, 24, 0.2], [176, 170, 26, -0.35], [236, 178, 24, 0.5], [292, 172, 22, -0.1], [150, 192, 28, -0.6], [214, 194, 30, 0.15], [276, 192, 26, 0.7],
];

function shotSalt(ctx, lt) {
  const camY = track(lt, [[0, 0], [5.0, 10, 'smooth']]);
  ctx.drawImage(slateSet(), -20, -round(camY * 0.4));
  ctx.save();
  ctx.translate(0, -round(camY));
  for (const [x, y, s, rz] of BED) crisp(ctx, x, y, s, -0.95 - abs(rz) * 0.15, 0.08 * sin(rz * 9), rz, { curl: 0.1, warm: 0.12, rim: mix(P.cream, P.yellow, 0.35) });
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(shaftArt(), 124, 0);
  ctx.globalCompositeOperation = 'source-over';
  saltFall(ctx, lt, 150, 250, -10, 186, 0.5, 0.9);
  ctx.restore();
  vignette(ctx, 0.65);
}

// --- S5: three packs on a plinth ---------------------------------------------------------------
const FLAVOURS = [
  { name: ['SEA SALT', '& VECTOR'], band: mix(P.navy, P.ink, 0.3) },
  { name: ['AGED CHEDDAR', '& PIXEL'], band: mix(P.darkRed, P.maroon, 0.4) },
  { name: ['SMOKED PAPRIKA', '& GRID'], band: mix(P.darkGreen, P.black, 0.3) },
];

const PACK_W = 80;
const PACK_H = 116;
const PACK_KEYS = ['cn-pack-0', 'cn-pack-1', 'cn-pack-2'];
function packArt(i) {
  return bake(PACK_KEYS[i], PACK_W, PACK_H, function* paint(c) {
    const f = FLAVOURS[i];
    const w = PACK_W;
    const h = PACK_H;
    // pillow-shaped matte pack: crimped seals top and bottom, soft sheen
    yield* shadeSteps(c, 2, 7, w - 4, h - 14, [P.black, mix(P.black, P.ink, 0.6), mix(P.ink, P.black, 0.15)], (x, y) => clamp(0.12 + 0.6 * sin(((x - 2) / (w - 4)) * PI) - (x > w * 0.68 ? 0.25 : 0) - abs(y - h / 2) * 0.002));
    for (let x = 2; x < w - 2; x += 2) {
      rect(c, x, 2 + (x & 2 ? 1 : 0), 2, 6, mix(P.ink, P.black, 0.25));
      rect(c, x, h - 8 + (x & 2 ? 1 : 0), 2, 6, mix(P.ink, P.black, 0.25));
    }
    rect(c, 9, 14, w - 18, 1, GOLD_D);
    rect(c, 9, h - 22, w - 18, 1, GOLD_D);
    thin(c, 'CORNERS', w / 2, 21, { color: GOLD, style: 'didone', track: 1, align: 'center' });
    tracked(c, 'ARTISAN', w / 2, 34, { color: GOLD_D, font: 'micro', track: 1, align: 'center' });
    // a square window onto a crisp, framed in gold
    const wx = w / 2 - 15;
    rect(c, wx, 44, 30, 30, f.band);
    rect(c, wx, 44, 30, 1, GOLD_D);
    rect(c, wx, 73, 30, 1, GOLD_D);
    rect(c, wx, 44, 1, 30, GOLD_D);
    rect(c, wx + 29, 44, 1, 30, GOLD_D);
    crisp(c, w / 2, 59, 9, -0.35, 0.3, 0.15, { flecks: false, curl: 0.1 });
    text(c, f.name[0], w / 2, 80, { color: mix(P.cream, GOLD, 0.4), font: 'micro', align: 'center' });
    text(c, f.name[1], w / 2, 87, { color: mix(P.cream, GOLD, 0.4), font: 'micro', align: 'center' });
    rect(c, 2, h - 18, w - 4, 8, f.band);
  });
}

const plinthSet = () =>
  bake('cn-plinth', 420, H, function* paint(c) {
    yield* shadeSteps(c, 0, 0, 420, H, [P.black, mix(P.black, P.ink, 0.5), P.ink, mix(P.ink, P.slate, 0.3)], (x, y) => clamp(1 - sqrt(((x - 210) / 230) ** 2 + ((y - 70) / 150) ** 2)) * 0.85);
    // plinth top and front face
    yield* shadeSteps(c, 30, 160, 360, 8, [mix(P.slate, P.ink, 0.3), P.slate, mix(P.slate, P.steel, 0.5)], (x) => clamp(1 - abs(x - 210) / 190));
    yield* shadeSteps(c, 30, 168, 360, 48, [P.black, mix(P.black, P.ink, 0.6), P.ink], (x, y) => clamp(1 - abs(x - 210) / 200) * (1 - (y - 168) / 60));
    rect(c, 30, 160, 360, 1, mix(P.steel, P.fog, 0.4));
  });

function shotPacks(ctx, lt) {
  const camX = track(lt, [[0, 0], [2.6, 14, 'smooth']]);
  ctx.drawImage(plinthSet(), round(camX * 0.4), 0, W, H, 0, 0, W, H);
  ctx.save();
  ctx.translate(-round(camX), 0);
  for (let i = 0; i < 3; i++) {
    const x = 70 + i * 92;
    const y = 160 - PACK_H;
    // reflection on the plinth, then the pack, then a gold rim light down its edge
    ctx.globalAlpha = 0.16;
    ctx.save();
    ctx.translate(x, (y + PACK_H) * 2 + 1);
    ctx.scale(1, -1);
    ctx.drawImage(packArt(i), 0, PACK_H - 20, PACK_W, 20, 0, y + PACK_H - 20, PACK_W, 20);
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.drawImage(packArt(i), x, y);
    rect(ctx, x + PACK_W - 3, y + 9, 1, PACK_H - 18, mix(GOLD, P.yellow, 0.3));
  }
  ctx.restore();
  vignette(ctx, 0.55);
}

// --- S6: end slate --------------------------------------------------------------------------------
const slateBg = () =>
  shader('cn-slatebg', W, H, [P.black, mix(P.black, P.maroon, 0.35), mix(P.maroon, P.black, 0.35)], (x, y) => clamp(1 - sqrt(((x - 192) / 240) ** 2 + ((y - 90) / 140) ** 2)) * 0.8);

function shotSlate(ctx, lt) {
  ctx.drawImage(slateBg(), 0, 0);
  // a single crisp, resting, catches the light above the name
  ctx.globalAlpha = smooth(lt / 0.8);
  crisp(ctx, 192, 52, 14, -1.0, 0.1 + lt * 0.05, 0.1, { rim: mix(P.cream, P.yellow, 0.4) });
  ctx.globalAlpha = smooth((lt - 0.3) / 0.8);
  thin(ctx, 'CORNERS', 192, 76, { color: GOLD, style: 'didone', track: 4, scale: 2, align: 'center' });
  ctx.globalAlpha = 1;
  const rw = round(60 * smooth((lt - 0.8) / 0.7));
  if (rw > 0) rect(ctx, 192 - rw, 103, rw * 2, 1, GOLD_D);
  ctx.globalAlpha = smooth((lt - 1.0) / 0.6);
  tracked(ctx, 'ARTISAN SQUARE CRISPS', 192, 109, { color: mix(GOLD, P.fog, 0.4), font: 'micro', track: 2, align: 'center' });
  ctx.globalAlpha = smooth((lt - 1.3) / 0.7);
  tracked(ctx, 'LIFE HAS ENOUGH CURVES.', 192, 132, { color: P.cream, track: 1, align: 'center' });
  ctx.globalAlpha = 1;
  smallPrint(
    ctx,
    'CORNERS MAY BE SHARP. HANDLE WITH CONFIDENCE. EVERY CRISP IS CHECKED TO NINETY DEGREES, GIVE OR TAKE. IAN IS NOT AVAILABLE FOR PRIVATE SQUARING.',
    192,
    { color: P.steel, a: smooth((lt - 1.9) / 0.8) },
  );
}

const SHOTS = [
  { at: 0, draw: shotHero, tr: 'black', td: 1.0 },
  { at: T_TUMBLE, draw: shotTumble, tr: 'dissolve', td: 0.6 },
  { at: T_IAN, draw: shotIan },
  { at: T_SALT, draw: shotSalt, tr: 'dissolve', td: 0.6 },
  { at: T_PACKS, draw: shotPacks },
  { at: T_SLATE, draw: shotSlate, tr: 'dip', td: 0.8 },
];

// A slow, velvet bed: soft electric-piano chords (minor ninths), a walking
// sine bass and brushed time. 70 bpm.
const EP = { wave: 'triangle', a: 0.006, d: 1.4, s: 0.1, r: 0.8, vib: [6, 5, 0.3] };
const LEADV = { wave: 'sine', a: 0.04, d: 0.6, s: 0.6, r: 0.5, vib: [10, 5, 0.3] };

// Everything this spot bakes, in shot order: prewarmed in idle-time slices so
// no cut ever waits for a bake (see cine.js prewarm).
const WARM = [voidBg, keyPool, slateSet, workshopSet, lampCone, shaftArt, plinthSet, slateBg, () => packArt(0), () => packArt(1), () => packArt(2), () => vignetteArt(0.7), () => vignetteArt(0.65), () => vignetteArt(0.55)];
prewarm(WARM, 8000);

export default {
  id: 'corners',
  brand: 'CORNERS',
  duration: DURATION,
  voice: { gender: 'female', lang: 'en-GB', pitch: 0.85, rate: 0.86 },
  script: [
    { at: 0.6, text: 'This is not just a crisp.' },
    { at: 4.2, text: 'This is a slow-cooked, hand-squared crisp.' },
    { at: 8.3, text: 'Each one checked to ninety degrees. By Ian.' },
    { at: 12.8, text: "Seasoned with salt, from a sea we're not allowed to name." },
    { at: 18.4, text: 'Corners. Because life has enough curves.' },
  ],
  // Dm9 | G13 | Cmaj9 | A7 (b9) twice, ending on Dm9 (26.8 beats at 70 bpm).
  tune: {
    bpm: 70,
    swing: 0.12,
    room: 0.4,
    echo: { beats: 0.75, feedback: 0.2 },
    fadeOut: 1.4,
    tracks: [
      {
        kind: 'harmony',
        inst: EP,
        gain: 0.8,
        notes: 'D3+F3+A3+C4+E4:2@0.45 R:1 D3+F3+A3+C4+E4:1@0.3 G2+F3+B3+E4:2@0.45 R:1 G2+F3+B3+E4:1@0.3 C3+E3+B3+D4:2@0.45 R:1 C3+E3+B3+D4:1@0.3 A2+G3+C#4+Bb3:3@0.4 R:1 D3+F3+A3+C4+E4:2@0.45 R:1 D3+F3+A3+C4+E4:1@0.3 G2+F3+B3+E4:2@0.45 R:2 D3+F3+A3+E4:4.8@0.4 R:2',
      },
      {
        kind: 'lead',
        inst: LEADV,
        gain: 0.55,
        notes: 'R:2 A4:1@0.35 C5:1@0.35 B4:2@0.4 G4:2@0.35 E4:1.5@0.35 D4:0.5@0.3 E4:2@0.35 C#4:3@0.3 R:1 A4:1@0.35 C5:1@0.35 D5:2@0.4 E5:2@0.4 R:1 A4:3.8@0.35 R:4',
      },
      { kind: 'bass', inst: 'sine', gain: 0.7, notes: 'D2:2 A1:1 C2:1 G1:2 D2:1 F2:1 C2:2 G1:1 B1:1 A1:2 E2:1 C#2:1 D2:2 A1:1 C2:1 G1:2 B1:2 D2:4.8 R:2' },
      { drums: 'H:1@0.12 H:1@0.18 H:1@0.12 X:1@0.15 H:1@0.12 H:1@0.18 H:1@0.12 X:1@0.15 H:1@0.12 H:1@0.18 H:1@0.12 X:1@0.15 H:1@0.12 H:1@0.18 H:1@0.12 X:1@0.15 H:1@0.12 H:1@0.18 H:1@0.12 X:1@0.15 H:1@0.12 H:1@0.18 R:4.8 R:4' },
    ],
  },
  draw(ctx, t, dt, info) {
    prewarm(WARM);
    film(ctx, dt, info, SHOTS);
  },
};
