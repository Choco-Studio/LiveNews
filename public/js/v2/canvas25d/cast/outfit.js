// Wardrobe: torso and clothing for seated presenters (owner: PRESENTERS A
// stream; other streams may register new outfits from their own files with
// registerOutfit() and reuse the helpers read-only).
//
// An outfit drawer gets one context object `o`:
//   { buf, L, m, sk, toS, s, gb, G, clip }
// toS(x, y, z) maps body space to screen (lean and oblique tilt included),
// G are the character's group ids (character.js), gb its group base, clip
// whether torso parts stop at the desk. Draw order inside the outfit matters
// for the inner lines (pixbuf.js resolve): shirt (z 6) → tie (7) → jacket (8)
// → collar points (9).
import { P } from '../../../palette.js';
import { decal, line } from '../pixbuf.js';
import { clamp } from '../space.js';

export const OUTFITS = {};

/** Add an outfit: fn(o) draws everything between the neck and the head. */
export function registerOutfit(name, fn) {
  OUTFITS[name] = fn;
}

/** Draw the look's outfit (falls back to the suit for unknown names). */
export function drawOutfit(o) {
  (OUTFITS[o.L.outfit] || OUTFITS.suit)(o);
}

/**
 * Torso silhouette shared by jackets and tops: outline polygon (screen px), the
 * jacket polygon closed by its V opening, shoulder lift for breathing/shrugs and
 * the flat-chest tone function.
 */
export function torsoFrame(o) {
  const { L, sk, toS, s } = o;
  const T = L.torso;
  // breathing and shrugs lift the shoulders
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
  return { T, lift, outline, jacketPts, vY, torsoTone };
}

// ---------------------------------------------------------------------------
// Tailored jacket over a shirt (suit with tie, or blazer over a scoop top)

function drawJacketOutfit(o) {
  const { buf, L, m, toS, s, gb, G, clip } = o;
  const { T, lift, jacketPts, vY, torsoTone } = torsoFrame(o);

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
}

registerOutfit('suit', drawJacketOutfit);
registerOutfit('blazer', drawJacketOutfit);

// ---------------------------------------------------------------------------
// Details

export function drawLapels(buf, L, m, toS, s, vY, g) {
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

export function drawNecklace(buf, L, toS, s) {
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
