// Rasterises one posed presenter into a PartBuffer.
//
// Input is a solved skeleton (rig.js `solve()`): body offset and lean,
// per-side shoulder lift, head transform (offset, yaw, pitch, roll), 3D arm
// joints from 2-bone IK, hand shape parameters and face parameters. Every
// part is rebuilt from shapes each frame at the current scale, so motion is
// continuous while pixels stay on the 384x216 grid:
//   torso / jacket / shirt / tie  → polygons with cylindrical shading
//   neck, arms                    → tapered capsules (tube shading)
//   head, hair, mustache          → implicit shapes in head space, so yaw,
//                                   pitch and roll move features, hairline
//                                   and chin without any extra drawings
//   hands                         → palm capsule + 5 finger capsules with
//                                   continuous curl (mitten LOD when small)
//   face                          → face.js (eyes, brows, nose, mouth)
// Rigid parts snap their origin to whole pixels so they never "boil" while
// they translate; only parts that rotate or scale are re-sampled.
import { P } from '../../palette.js';
import { material, toneN } from './pixbuf.js';
import { drawFace, headHW, faceX, decal } from './face.js';

// Oblique projection: points closer to the camera (z > 0) sit lower on screen,
// as seen by a studio camera slightly above eye level.
export const TILT = 0.3;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Materials of a look, registered once. */
export function matsOf(L) {
  if (L._mats) return L._mats;
  const id = L.id;
  const skinTh = [0.975, -0.1, -0.62];
  const m = {
    skin: material(`${id}:skin`, { ramp: L.skin, line: L.skinLine, th: skinTh }),
    hand: material(`${id}:hand`, { ramp: L.skin, line: L.skinLine, th: [0.96, -0.02, -0.5] }),
    hair: material(`${id}:hair`, { ramp: L.hair.ramp, line: L.hair.line, rim: P.silver, rimTop: true, th: [0.62, 0.08, -0.42] }),
    hairBack: material(`${id}:hairBack`, { ramp: L.hair.ramp, line: L.hair.line, th: [2, 0.55, -0.1] }),
    jacket: material(`${id}:jacket`, { ramp: L.jacket.ramp, line: L.jacket.line, rim: P.silver, th: [0.8, -0.02, -0.5] }),
    sleeve: material(`${id}:sleeve`, { ramp: L.jacket.ramp, line: L.jacket.line, rim: P.silver, th: [0.94, 0.12, -0.4] }),
    shirt: material(`${id}:shirt`, { ramp: L.shirt.ramp, line: L.shirt.line, th: [0.85, 0.05, -0.4] }),
    cuff: material(`${id}:cuff`, { ramp: [L.cuff, L.cuff, L.shirt.ramp[2], L.shirt.ramp[3]], line: L.shirt.line, th: [0.9, -0.1, -0.6] }),
  };
  // exact skin colours for painted features (lids, nose, folds) so no clean-up pass touches them
  m.skinD = material(`${id}:skinD`, { ramp: L.skin, decal: true });
  if (L.tie) m.tie = material(`${id}:tie`, { ramp: L.tie.ramp, line: L.tie.line, th: [0.9, 0.0, -0.5] });
  if (L.mustache) m.mustache = material(`${id}:mustache`, { ramp: L.mustache.ramp, line: L.mustache.ramp[3], noLine: true, th: [0.7, 0.15, -0.3] });
  L._mats = m;
  return m;
}

// Group ids inside one character (offset by the character's group base).
// Each hand uses 6 consecutive groups (palm, thumb, 4 fingers) so fingers get separation lines.
const G = { hairBack: 1, neck: 2, shirt: 3, tie: 4, jacket: 5, ears: 6, head: 7, hair: 8, mustache: 9, collar: 10, armA: 11, cuffA: 12, handA: 13, armB: 20, cuffB: 21, handB: 22, extra: 30 };
export const GROUPS_PER_ACTOR = 32;

/**
 * Draw a solved presenter.
 * @param buf  PartBuffer
 * @param L    look (looks.js)
 * @param sk   skeleton from rig.solve()
 * @param xf   { x, y, s, gb, clip } screen position of the neck base, px per unit, group base, clip torso at buf.clipY
 */
export function drawCharacter(buf, L, sk, xf) {
  const m = matsOf(L);
  const s = xf.s;
  const gb = xf.gb || 0;
  const ox = Math.round(xf.x), oy = Math.round(xf.y);
  // body space → screen (with lean around the hips and the oblique tilt for z)
  const lean = sk.body.lean;
  const cl = Math.cos(lean), sl = Math.sin(lean);
  const HIP = 40;
  const bx = Math.round(sk.body.x * s) / s, by = Math.round(sk.body.y * s) / s;
  const toS = (x, y, z = 0) => {
    const ly = y - HIP;
    const rx = x * cl - ly * sl, ry = x * sl + ly * cl + HIP;
    return [ox + (rx + bx) * s, oy + (ry + by + z * TILT) * s];
  };
  const clip = !!xf.clip;

  // ---- torso outline (body space), breathing and shrugs lift the shoulders
  const T = L.torso;
  const lift = (side, y) => {
    const sh = side < 0 ? sk.shoulder.L : sk.shoulder.R;
    const k = clamp(1 - (y - T.shoulderTop) / 12, 0, 1);
    return y - (sk.body.breathe * 0.45 + sh) * k;
  };
  const right = [
    [T.neckHW, -1.6],
    [T.neckHW + 4.6, -0.2 + T.shoulderTop * 0.25],
    [T.shoulderHW * 0.68, T.shoulderTop * 0.62],
    [T.shoulderHW * 0.86, T.shoulderTop + 0.3],
    [T.shoulderHW * 0.96, T.shoulderTop + 2.2],
    [T.shoulderHW, T.shoulderTop + 5.2],
    [T.shoulderHW * 0.995, T.shoulderTop + 9],
    [T.sideHW, 20],
    [T.sideHW * 0.97, 32],
    [T.sideHW * 0.95, T.bottom],
  ];
  // left collar → down the left side → across the bottom → up the right side → right collar,
  // then the V opening of the jacket closes the polygon at the front
  const outline = [];
  for (const [x, y] of right) outline.push(toS(-x, lift(-1, y)));
  for (let i = right.length - 1; i >= 0; i--) outline.push(toS(right[i][0], lift(1, right[i][1])));
  const vY = T.vDepth;
  const jacketPts = [];
  for (const [x, y] of outline) jacketPts.push(x, y);
  const [vx, vy] = toS(0, vY);
  jacketPts.push(vx, vy);

  const center = toS(0, 10);
  const halfW = T.shoulderHW * s;
  const shoulderTopPx = toS(0, T.shoulderTop)[1];
  // a broad chest is mostly flat: thin lit strip on the left, base across, shade on the right
  const torsoTone = () => (x, y) => {
    const nx = (x + 0.5 - center[0]) / halfW;
    const top = (y + 0.5 - shoulderTopPx) / s;
    if (top < 2.2 && Math.abs(nx) > 0.35 && Math.abs(nx) < 0.9) return nx < 0 ? 0 : 1; // shoulder tops catch the key
    if (nx < -0.84) return 0;
    if (nx < 0.6) return 1;
    if (nx < 0.9) return 2;
    return 3;
  };

  // ---- back hair (bob) behind the head and neck
  const head = headFrame(L, sk, toS, s);
  if (L.hair.style === 'bob') {
    buf.part(gb + G.hairBack, 2, false);
    drawBobBack(buf, L, m, head, s);
  }

  // ---- neck (in the chin's shadow)
  buf.part(gb + G.neck, 4, clip);
  const [n0x, n0y] = toS(0, 1.5);
  const nt = head.toScreen(0, 6);
  buf.capsule(nt[0], nt[1], n0x, n0y, L.neck.hw * s, L.neck.hw * 1.05 * s, m.skin, 1);

  // ---- shirt / top inside the V, tie or necklace
  buf.part(gb + G.shirt, 6, clip);
  const shirtPts = [];
  const shirtTop = L.outfit === 'blazer' ? 1.2 : -2.4;
  for (const [x, y] of [[-T.neckHW - 0.9, shirtTop], [T.neckHW + 0.9, shirtTop], [3.2, vY * 0.5], [1.4, vY + 2], [-1.4, vY + 2], [-3.2, vY * 0.5]]) shirtPts.push(...toS(x, lift(x < 0 ? -1 : 1, y)));
  buf.poly(shirtPts, m.shirt, torsoTone(m.shirt));
  if (L.outfit === 'blazer') {
    // a soft scoop neckline of the top shows skin
    const neckPts = [];
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * (i / 10);
      neckPts.push(...toS(-Math.cos(a) * (T.neckHW + 0.4), -1.8 + Math.sin(a) * 4.6));
    }
    buf.poly(neckPts, m.skin, 1);
  }
  if (m.tie) {
    buf.part(gb + G.tie, 7, clip);
    const knot = [[-1.25, 0.2], [1.25, 0.2], [0.95, 2.6], [-0.95, 2.6]].flatMap(([x, y]) => toS(x, y));
    const blade = [[-0.95, 2.4], [0.95, 2.4], [1.75, vY - 3], [0, vY + 0.5], [-1.75, vY - 3]].flatMap(([x, y]) => toS(x, y));
    buf.poly(blade, m.tie, torsoTone(m.tie));
    buf.poly(knot, m.tie, 0);
  }

  // ---- jacket
  buf.part(gb + G.jacket, 8, clip);
  buf.poly(jacketPts, m.jacket, torsoTone(m.jacket));
  drawLapels(buf, L, m, toS, s, vY, gb + G.jacket);

  // ---- shirt collar points (suit) over the jacket edge
  if (L.outfit === 'suit') {
    buf.part(gb + G.collar, 9, clip);
    for (const side of [-1, 1]) {
      const c = [[side * (T.neckHW + 0.5), -2.6], [side * 0.35, 1.2], [side * (T.neckHW + 1.2), 2.6]].flatMap(([x, y]) => toS(x, lift(side, y)));
      buf.poly(c, m.shirt, side < 0 ? 0 : 1);
    }
  }
  if (L.necklace) drawNecklace(buf, L, toS, s);
  if (L.pocket) {
    buf.part(gb + G.jacket, 8, clip);
    const p = toS(T.shoulderHW * 0.5, 13.2);
    const pw = Math.max(2, Math.round(2.6 * s)), ph = Math.max(1, Math.round(0.9 * s));
    const sh = decal(P.white), sh2 = decal(P.silver);
    for (let j = 0; j < ph; j++) for (let i = 0; i < pw; i++) buf.paint(Math.round(p[0]) + i, Math.round(p[1]) + j, j === 0 && i < pw - 1 ? sh : sh2, 1, gb + G.jacket);
  }

  // ---- ears, head, face, hair
  if (L.hair.style !== 'bob') {
    buf.part(gb + G.ears, 9, false);
    drawEars(buf, L, m, head, s);
  }
  buf.part(gb + G.head, 10, false);
  drawHead(buf, L, m, head, s);
  drawFace(buf, L, head, sk.face, s);
  buf.part(gb + G.hair, 12, false);
  if (L.hair.style === 'bob') drawBob(buf, L, m, head, s, sk.hairLag || 0);
  else drawShortHair(buf, L, m, head, s);
  if (L.mustache) {
    buf.part(gb + G.mustache, 13, false);
    drawMustache(buf, L, m, head, s, sk.face);
  }
  if (L.earrings && L.hair.style === 'bob') drawEarrings(buf, L, head, s, sk.hairLag || 0);

  // ---- arms: the one nearer the camera last
  const arms = [
    ['L', sk.arms.L, gb + G.armA, gb + G.cuffA, gb + G.handA],
    ['R', sk.arms.R, gb + G.armB, gb + G.cuffB, gb + G.handB],
  ];
  arms.sort((a, b) => a[1].wrist[2] + a[1].elbow[2] - (b[1].wrist[2] + b[1].elbow[2]));
  let z = 20;
  for (const [side, arm, ga, gc, gh] of arms) {
    drawArm(buf, L, m, arm, side === 'L' ? -1 : 1, toS, s, ga, gc, gh, z);
    z += 4;
  }
  return head;
}

// ---------------------------------------------------------------------------
// Head frame: head-local units → screen, with roll; yaw/pitch handled by faceX

function headFrame(L, sk, toS, s) {
  const h = sk.head;
  const [hx, hy] = toS(L.headAt[0] + h.x, L.headAt[1] + h.y);
  const roll = h.roll;
  const cr = Math.cos(roll), sr = Math.sin(roll);
  // snap the head origin so a still head is a still picture
  const cx = Math.round(hx), cy = Math.round(hy);
  return {
    L,
    cx,
    cy,
    s,
    roll,
    cr,
    sr,
    yaw: h.yaw,
    pitch: h.pitch,
    jaw: sk.face.jaw || 0,
    toScreen(x, y) {
      return [cx + s * (x * cr - y * sr), cy + s * (x * sr + y * cr)];
    },
    toLocal(px, py) {
      const dx = px - cx, dy = py - cy;
      return [(dx * cr + dy * sr) / s, (-dx * sr + dy * cr) / s];
    },
  };
}

function headBox(head, pad) {
  const H = head.L.head;
  const r = (Math.max(H.R, H.cheekHW) + pad) * head.s;
  const top = (H.top - pad) * head.s, bot = (H.chinY + 2 + pad) * head.s;
  const ext = Math.max(r, Math.abs(top), Math.abs(bot));
  return [head.cx - ext - 1, head.cy - ext - 1, head.cx + ext + 1, head.cy + ext + 1];
}

function drawHead(buf, L, m, head, s) {
  const H = L.head;
  const yawShift = Math.sin(head.yaw);
  const detail = s >= 2.2;
  const eyeY = L.eyes.y;
  const [x0, y0, x1, y1] = headBox(head, 0.5);
  buf.shape(x0, y0, x1, y1, m.skin, (px, py) => {
    const [x, y] = head.toLocal(px, py);
    if (y < H.top - 0.2) return -1;
    const hw = headHW(H, y, head.jaw);
    if (hw <= 0) return -1;
    // the jaw follows the turn a little (3/4 view)
    const jy = clamp((y - H.cheekY) / (H.chinY - H.cheekY), 0, 1);
    const xs = x - yawShift * 1.3 * jy;
    if (Math.abs(xs) > hw) return -1;
    const nx = xs / hw;
    // key light from camera-left: a sculpted terminator that cuts into the eye socket,
    // is pushed out by the cheekbone and comes back in along the jaw
    let term = 0.5;
    term -= 0.16 * Math.exp(-((y - eyeY) * (y - eyeY)) / 1.8);
    term += 0.1 * Math.exp(-((y - eyeY - 2.8) * (y - eyeY - 2.8)) / 2.2);
    term -= 0.2 * jy * jy;
    if (y < H.craniumY - 3) term += 0.08;
    if (nx > term) return nx > term + 0.38 && detail ? 3 : 2;
    // the underside of the chin
    if (y > H.chinY + head.jaw - 0.75) return 2;
    if (detail) {
      // the forehead dome catches the key: a small soft-edged patch, never a sticker
      const fy = (y - (H.top + 3.0)) / 1.6, fxx = (nx + 0.45) / 0.3;
      if (fy * fy + fxx * fxx < 1) return 0;
    }
    return 1;
  });
}

function drawEars(buf, L, m, head, s) {
  const H = L.head, E = L.ears;
  for (const side of [-1, 1]) {
    // the ear on the side we turn away from slips behind the skull
    const hw = headHW(H, E.y, 0);
    const turn = Math.sin(head.yaw) * side;
    const ex = side * (hw + 0.25 - Math.max(0, turn) * 2.4 + Math.min(0, turn) * 0.4);
    const [sx, sy] = head.toScreen(ex, E.y);
    buf.ellipse(sx, sy, E.w * s, E.h * 0.5 * s, m.skin, head.roll + side * 0.12, side > 0 ? 1 : 0);
    if (s >= 2) {
      // inner ear shadow
      const [ix, iy] = head.toScreen(ex - side * 0.15, E.y + 0.2);
      for (let j = -1; j <= 1; j++) buf.paint(Math.round(ix), Math.round(iy) + j, m.skin, 2);
    }
  }
}

// Short grey hair with a side parting and receding temples (Paco): volume on top, short sides.
function drawShortHair(buf, L, m, head, s) {
  const H = L.head;
  const cyc = H.craniumY - 0.3;
  const RV = H.R + 0.95; // hair volume radius
  const yawX = Math.sin(head.yaw) * H.R * 0.85;
  const [x0, y0, x1, y1] = headBox(head, 1.6);
  const pitchShift = Math.sin(head.pitch) * 2.0;
  const part = -2.5;
  buf.shape(x0, y0, x1, y1, m.hair, (px, py) => {
    const [x, y] = head.toLocal(px, py);
    const dx = x, dy = y - cyc;
    const r2 = dx * dx + dy * dy;
    if (y > 0.9) return -1;
    const hw = headHW(H, y, 0);
    // above the ears the sides are clipped short: no volume past the skull below the temples
    const vol = y < H.craniumY - 2.5 ? RV : y < H.craniumY ? H.R + 0.45 : hw + 0.35;
    if (r2 > vol * vol && Math.abs(x) > vol) return -1;
    if (y >= H.craniumY - 2.5 && Math.abs(x) > vol) return -1;
    if (y < H.craniumY - 2.5 && r2 > RV * RV) return -1;
    const fx = x - yawX; // feature-space x (moves with the face when turning)
    const ax = Math.abs(fx);
    const temple = Math.exp(-((ax - H.R * 0.66) * (ax - H.R * 0.66)) / 2.0);
    const hairline = H.top + 4.35 + pitchShift - temple * 1.4 + (fx < part ? -0.2 : 0) + ax * ax * 0.01;
    const sideburn = Math.abs(x) > hw - 0.95 && y < -0.2;
    if (y > hairline && !sideburn) {
      if (Math.abs(x) <= hw - 0.05 || y > H.craniumY - 1.5) return -1;
    }
    const nx = dx / RV, ny = dy / RV;
    let t = toneN(m.hair, nx * 0.95, ny * 0.95);
    // the parting, then combed strands sweeping back and to the right from it
    const partX = part + (y - hairline) * -0.1;
    if (y < hairline + 0.1 && y > hairline - 2.4 && Math.abs(fx - partX) < 0.28 + (s < 1.6 ? 0.25 : 0)) t = Math.max(t, 2);
    if (s >= 1.8 && t <= 1) {
      const sweep = fx - partX;
      const v = sweep > 0 ? sweep * 0.85 - (y - hairline) * 0.6 : -sweep * 0.9 - (y - hairline) * 0.5;
      const band = ((v % 2.2) + 2.2) % 2.2;
      if (band < 0.3 && r2 < (RV - 0.5) * (RV - 0.5)) t = 2;
    }
    // short sides: lit side stays mid-grey, the far side drops one step
    if (y > H.craniumY - 1) t = x > 0 ? Math.max(t, 2) : Math.min(Math.max(t, 1), 1);
    return t;
  });
}

// Sleek bob with a deep side part and a sweep across the forehead (Lola).
function drawBob(buf, L, m, head, s, lag) {
  const H = L.head;
  const cyc = H.craniumY - 0.3;
  const RV = H.R + 1.5;
  const yawX = Math.sin(head.yaw) * H.R * 0.8;
  const pitchShift = Math.sin(head.pitch) * 2.0;
  const bottom = H.chinY - 1.6;
  const part = -2.4;
  const [x0, y0, x1, y1] = headBox(head, 3.0);
  buf.shape(x0, y0, x1, y1, m.hair, (px, py) => {
    const [x0l, y] = head.toLocal(px, py);
    // the ends of the bob swing a moment after the head (follow-through)
    const swing = y > 0 ? lag * Math.min(1, y / bottom) ** 2 : 0;
    const x = x0l - swing;
    if (y > bottom + 0.5) return -1;
    let inMass;
    if (y < cyc) inMass = x * x + (y - cyc) * (y - cyc) <= RV * RV;
    else {
      const k = (y - cyc) / (bottom - cyc);
      const hwHair = RV + 0.35 * k - (k > 0.85 ? (k - 0.85) * 3.5 : 0);
      inMass = Math.abs(x) <= hwHair;
      if (y > bottom - 0.8) inMass = inMass && Math.abs(x) <= hwHair - (y - (bottom - 0.8)) * 1.8;
    }
    if (!inMass) return -1;
    const fx = x - yawX;
    const hw = headHW(H, y, head.jaw);
    // face window: forehead open under the part, a diagonal sweep across to the far temple
    const sweepY = Math.min(-3.3, H.top + 3.5 + Math.max(0, fx - part) * 0.62 + Math.sin(fx * 1.7) * 0.15);
    const fringe = (fx < part ? H.top + 4.1 : sweepY) + pitchShift;
    const inset = 0.85 - Math.max(0, y) * 0.02;
    if (y > fringe && Math.abs(x) < hw - inset && y < H.chinY + 2) return -1;
    if (y > H.chinY - 1.5 && Math.abs(x) < hw + 0.5) return -1;
    const ddx = x / RV, ddy = clamp((y - cyc) / (RV * 1.2), -1, 1);
    let t = toneN(m.hair, ddx * 0.9, ddy * 0.9);
    // a soft sheen across the crown on the lit side
    const band = (x + 1.5) * (x + 1.5) * 0.07 + (y - (H.top + 2.6));
    if (Math.abs(band) < 0.7 && x < 2.5 && t <= 1) t = 0;
    // strands follow the sweep on top and fall straight on the sides
    if (s >= 1.8 && t === 1) {
      const v = y < fringe + 0.5 && fx > part ? (y - (H.top + 3.5) - (fx - part) * 0.62) : fx * 1.0 - Math.max(0, y - cyc) * 0.1;
      if ((((v * 1.1) % 2.4) + 2.4) % 2.4 < 0.26) t = 2;
    }
    // next to the face the hair is in shadow; the far side deeper
    if (y > fringe - 0.2 && Math.abs(x) < hw + 1.0) t = Math.max(t, x > 0 ? 3 : 2);
    return t;
  });
}

function drawBobBack(buf, L, m, head, s) {
  const H = L.head;
  const [x0, y0, x1, y1] = headBox(head, 3.2);
  buf.shape(x0, y0, x1, y1, m.hairBack, (px, py) => {
    const [x, y] = head.toLocal(px, py);
    const bottom = H.chinY - 1.2;
    if (y < 0 || y > bottom) return -1;
    const hw = H.R + 1.4;
    if (Math.abs(x) > hw - (y > bottom - 1.2 ? (y - bottom + 1.2) * 1.4 : 0)) return -1;
    return Math.abs(x) > hw - 1.5 ? 2 : 3;
  });
}

function drawEarrings(buf, L, head, s, lag) {
  const H = L.head;
  const gold = decal(L.earrings), dark = decal(P.orange);
  for (const side of [-1, 1]) {
    const hw = headHW(H, H.chinY - 2.6, 0);
    const [ex, ey] = head.toScreen(side * (hw + 0.1) + lag * 0.6, H.chinY - 1.1);
    // a small gold stud: 1 px in wide shots, 2x2 with a shaded corner in close-ups
    const cx = Math.round(ex), cy = Math.round(ey);
    buf.plot(cx, cy, gold, 1);
    if (s >= 2.2) {
      buf.plot(cx + 1, cy, gold, 1);
      buf.plot(cx, cy + 1, gold, 1);
      buf.plot(cx + 1, cy + 1, dark, 1);
    }
  }
}

function drawMustache(buf, L, m, head, s, face) {
  const H = L.head, M = L.mustache;
  const yawX = Math.sin(head.yaw);
  const y0m = M.y, y1m = M.y + M.h;
  const [x0, y0, x1, y1] = headBox(head, 0);
  const smile = face.smile || 0;
  buf.shape(x0, y0, x1, y1, m.mustache, (px, py) => {
    const [x, y] = head.toLocal(px, py);
    if (y < y0m - 0.6 || y > y1m + 1.2) return -1;
    const fx = faceInverse(H, x, y, head.yaw);
    const ax = Math.abs(fx);
    const hwTop = M.w * 0.32, hwBot = M.w * 0.5;
    const k = (y - y0m) / M.h;
    if (k < 0) return -1;
    const droop = Math.max(0, ax - hwBot * 0.55) * (0.35 - smile * 0.25);
    if (y > y1m + droop) return -1;
    const hw = hwTop + (hwBot - hwTop) * Math.min(1, k * 1.4);
    if (ax > hw) return -1;
    const centreGap = ax < 0.25 && k < 0.35;
    if (centreGap) return -1;
    let t = 1;
    if (k < 0.3) t = 0;
    if (y > y1m + droop - 0.55) t = 2;
    if (fx > hw * 0.55) t = Math.max(t, 2);
    if (yawX > 0.2 && fx < -hw * 0.6) t = 2;
    return t;
  });
}

/** Inverse of faceX for an approximate feature-space x (used by mustache). */
function faceInverse(H, x, y, yaw) {
  if (!yaw) return x;
  const hw = Math.max(1, headHW(H, y, 0));
  const a = Math.asin(clamp(x / hw, -0.99, 0.99)) - yaw;
  return hw * Math.sin(a);
}

function drawLapels(buf, L, m, toS, s, vY, g) {
  if (s < 1.2) return;
  const T = L.torso;
  const deep = 3;
  // lapel edges: collar → notch → button, as 1 px lines in the jacket's deep tone
  for (const side of [-1, 1]) {
    const pts = L.outfit === 'suit'
      ? [[side * (T.neckHW + 0.4), -1.6], [side * (T.neckHW + 5.0), 6.2], [side * (T.neckHW + 3.6), 7.4], [side * 0.6, vY - 0.5]]
      : [[side * (T.neckHW + 0.5), -1.3], [side * (T.neckHW + 3.6), 9], [side * 0.6, vY - 0.4]];
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, ay] = toS(...pts[i]);
      const [bx, by] = toS(...pts[i + 1]);
      line(ax, ay, bx, by, (x, y) => buf.paint(x, y, m.jacket, deep, g));
    }
    // the lit lapel (camera-left) gets a highlight strip inside its edge
    if (side < 0 && s >= 1.8) {
      const [ax, ay] = toS(side * (T.neckHW + 4.0), 6.6);
      const [bx, by] = toS(side * 1.6, vY - 1.6);
      line(ax + 1, ay, bx + 1, by, (x, y) => buf.paint(x, y, m.jacket, 0, g));
    }
  }
  // a button at the bottom of the V
  const [bx, by] = toS(0, vY + 2.4);
  buf.paint(Math.round(bx), Math.round(by), m.jacket, deep, g);
}

function drawNecklace(buf, L, toS, s) {
  if (s < 1.2) return;
  const [gold, shade] = L.necklace.map(decal);
  let prev = null;
  for (let i = 0; i <= 16; i++) {
    const a = Math.PI * (i / 16);
    const [x, y] = toS(-Math.cos(a) * (L.torso.neckHW + 0.2), 0.8 + Math.sin(a) * 4.4);
    const p = [Math.round(x), Math.round(y)];
    if (prev) line(prev[0], prev[1], p[0], p[1], (px, py) => buf.paint(px, py, i < 9 ? gold : shade, 1));
    prev = p;
  }
  const [px, py] = toS(0, 5.6);
  const r = Math.max(0, Math.round(s * 0.4));
  for (let j = 0; j <= r; j++) for (let i = -r; i <= r; i++) buf.paint(Math.round(px) + i, Math.round(py) + j, i > 0 ? shade : gold, 1);
}

/** Integer Bresenham line between float endpoints. */
export function line(ax, ay, bx, by, fn) {
  let x0 = Math.round(ax), y0 = Math.round(ay);
  const x1 = Math.round(bx), y1 = Math.round(by);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let n = 0; n < 512; n++) {
    fn(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

// ---------------------------------------------------------------------------
// Arms and hands

function drawArm(buf, L, m, arm, side, toS, s, ga, gc, gh, z) {
  const A = L.arm;
  const [sx, sy] = toS(...arm.shoulder);
  const [ex, ey] = toS(...arm.elbow);
  const [wx, wy] = toS(...arm.wrist);
  buf.part(ga, z, false);
  buf.capsule(sx, sy, ex, ey, A.rUpper * s, A.rElbow * s, m.sleeve);
  // forearm stops short of the wrist where the cuff begins
  const fx = wx - ex, fy = wy - ey;
  const fl = Math.hypot(fx, fy) || 1;
  const cuffLen = Math.min(fl * 0.4, 1.3 * s);
  const cx = wx - (fx / fl) * cuffLen, cy = wy - (fy / fl) * cuffLen;
  buf.capsule(ex, ey, cx, cy, A.rElbow * s, A.rWrist * 1.08 * s, m.sleeve);
  buf.part(gc, z + 1, false);
  buf.capsule(cx, cy, wx, wy, A.rWrist * 0.98 * s, A.rWrist * 0.9 * s, m.cuff);
  drawHand(buf, L, m, arm, side, toS, s, gh, z + 2);
}

const FINGER_LEN = [0.5, 0.56, 0.52, 0.42]; // index..pinky, relative to hand length
const FINGER_OFF = [-1.5, -0.5, 0.5, 1.5];

function drawHand(buf, L, m, arm, side, toS, s, gh, z) {
  const A = L.arm;
  const hd = arm.hand;
  const [wx, wy] = toS(...arm.wrist);
  // 3D hand direction, projected: foreshortening comes for free
  const d = arm.handDir;
  let px = d[0], py = d[1] + d[2] * TILT;
  const plen = Math.hypot(px, py);
  const fore = clamp(plen, 0.3, 1);
  if (plen < 1e-4) {
    px = 0;
    py = 1;
  } else {
    px /= plen;
    py /= plen;
  }
  const len = A.hand * s * fore; // projected hand length (px)
  // the hand's width axis is foreshortened when the palm turns edge-on or up (it then points at the lens)
  const widthK = 0.32 + 0.68 * Math.min(1, Math.abs(hd.facing));
  const pw = A.hand * 0.4 * s * widthK; // palm half-width (px)
  const qx = -py, qy = px; // perpendicular (to the right of the direction)
  const P0 = (u, v) => [wx + px * u + qx * v, wy + py * u + qy * v];
  const palmLen = len * 0.5;
  // which side the thumb is on (palm toward camera → thumb toward the body centre)
  const towardCentre = -side;
  const facing = hd.facing; // +1 palm to camera, -1 back of hand
  const thumbV = Math.sign((towardCentre * facing) * (qx || 1e-6)) || 1;
  const fw = (A.hand * 0.8 * s) / 4.3; // finger thickness does not foreshorten
  const fsp = fw * widthK; // spacing between fingers does
  const curl = hd.curl;
  const mitten = fw < 1.35;
  const [p0x, p0y] = P0(palmLen * 0.18, 0);
  const [p1x, p1y] = P0(palmLen * 0.82, 0);
  buf.part(gh, z, false);
  buf.capsule(p0x, p0y, p1x, p1y, Math.max(pw * 0.92, fw * 0.7), Math.max(pw * 0.98, fw * 0.75), m.hand);
  buf.part(gh + 1, z + 1, false);
  // thumb
  const tc = curl[0];
  const tAng = (0.95 - tc * 0.75) * thumbV;
  const tdx = px * Math.cos(tAng) - py * Math.sin(tAng) * 1, tdy = py * Math.cos(tAng) + px * Math.sin(tAng);
  const [tbx, tby] = P0(palmLen * 0.3, thumbV * pw * 0.55);
  const tl = A.hand * s * 0.42 * (1 - tc * 0.45) * (0.6 + 0.4 * fore);
  buf.capsule(tbx, tby, tbx + tdx * tl, tby + tdy * tl, fw * 0.62, fw * 0.5, m.hand);
  if (mitten) {
    // small: palm + fingers as one rounded shape, plus an extended index when pointing
    const avg = (1 - (curl[1] + curl[2] + curl[3] + curl[4]) / 4) * 0.5 + 0.12;
    const [fx, fy] = P0(palmLen * 0.82 + len * avg * 0.9, 0);
    buf.capsule(p1x, p1y, fx, fy, pw * 0.95, pw * 0.75, m.hand);
    if (curl[1] < 0.4 && curl[2] > 0.6) {
      const [ix, iy] = P0(palmLen * 0.9, -thumbV * 0) ;
      const il = len * FINGER_LEN[0] * (1 - curl[1]) * 1.2;
      buf.capsule(ix, iy, ix + px * (il + palmLen * 0.4), iy + py * (il + palmLen * 0.4), Math.max(0.7, fw * 0.55), Math.max(0.6, fw * 0.45), m.hand);
    }
    return;
  }
  const spread = hd.spread || 0;
  for (let f = 0; f < 4; f++) {
    const c = curl[f + 1];
    // the finger order across the hand flips with the thumb side
    const off = FINGER_OFF[f] * -thumbV;
    const ang = off * spread * 0.13;
    const dx = px * Math.cos(ang) - py * Math.sin(ang), dy = py * Math.cos(ang) + px * Math.sin(ang);
    const [bx, by] = P0(palmLen * 0.86, off * fsp);
    const fl = len * FINGER_LEN[f] * (1 - c * 0.78) + fw * 0.3;
    // extended fingers are their own groups (the line system draws the gaps between them);
    // curled ones melt into the palm so a fist stays one clean shape
    if (c < 0.6) buf.part(gh + 2 + f, z + 2 + (thumbV > 0 ? f : 3 - f), false);
    else buf.part(gh, z, false);
    buf.capsule(bx, by, bx + dx * fl, by + dy * fl, fw * 0.56, fw * 0.48, m.hand);
  }
}

export { G as GROUPS };
