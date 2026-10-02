// Max Circuit (owner: PRESENTERS B stream). Technology correspondent of TECH
// BYTES: quick and interested first, dry one-liners, never silly. Younger than
// the anchors but clearly a grown-up: an unstructured tobacco-brown blazer worn
// open over a charcoal crew-neck knit (cast/wardrobe-b.js 'knitBlazer'), and
// short, textured espresso hair pushed up and to the side, drawn as clumps
// with their own lit sides and a fringe lock that swings after the head.
//
// Proportions stay adult (head ≈ 20 u on shoulders ≈ 40 u); the face is
// narrower and squarer-jawed than Paco's, with no eye bags. No cyan anywhere:
// TECH BYTES' accent belongs to the graphics.
import { P } from '../../../palette.js';
import { toneN } from '../pixbuf.js';
import { headHW, headBox } from '../head.js';
import { defineLook, SKIN_TAN } from './base.js';
import { stroke, local, screen, tier } from './wardrobe-b.js';

export const max = defineLook({
  id: 'max',
  name: 'Max Circuit',
  head: { top: -10.0, craniumY: -2.5, R: 7.3, cheekY: 1.4, cheekHW: 6.9, chinY: 9.2, chinHW: 2.9, jawPow: 2.55 },
  headAt: [0, -13.3],
  neck: { hw: 2.85 },
  eyes: { y: -0.6, x: 2.9, w: 2.7, h: 1.5, iris: [P.brown, P.maroon], lash: P.black, lashes: false, bags: false },
  brows: { y: -2.5, len: 3.35, thick: 0.62, color: P.maroon, arch: 0.28 },
  nose: { y0: -0.3, y1: 3.45, w: 1.45, big: false },
  mouth: { y: 6.0, w: 3.7, lip: P.brown, lipHi: P.tanShade, upper: P.tanShade, inner: P.maroon, teeth: P.silver, tongue: P.darkRed },
  ears: { y: -0.1, h: 2.8, w: 1.0 },
  skin: SKIN_TAN,
  skinLine: P.brown,
  hair: { style: 'textured', ramp: [P.brown, P.maroon, P.black, P.black], line: P.black },
  torso: { neckHW: 3.3, shoulderTop: 2.6, shoulderHW: 19.8, sideHW: 18.6, bottom: 46, vDepth: 21, shoulderJoint: [17.0, 6.9] },
  outfit: 'knitBlazer',
  jacket: { ramp: [P.tanShade, P.brown, P.maroon, P.black], line: P.black }, // tobacco wool, darker than his face
  shirt: { ramp: [P.slate, P.ink, P.black, P.black], line: P.black }, // charcoal knit
  cuff: P.ink,
  arm: { upper: 22.6, fore: 20.6, rUpper: 3.4, rElbow: 2.95, rWrist: 2.3, hand: 10.9 },
  persona: { sway: 1.0, headMotion: 1.15, blinkMin: 2.0, blinkMax: 4.6, energy: 1.2, smile: 0.2 },
  mats: {
    lapel: { ramp: [P.tanShade, P.brown, P.maroon, P.black], line: P.maroon, rim: P.silver },
    rib: { ramp: [P.slate, P.ink, P.black, P.black], line: P.black },
  },
  parts: { hair: drawTextured },
});

// Clumps of the textured top in feature space (x moves with the face on a turn):
// root, control and tip (head-local units), belly (fullest half-width) and how much
// the tip follows through. The roots sit above the hairline so the forehead stays
// open; the back layer is drawn first and one step darker.
const CLUMPS = [
  // crown and sides (behind)
  [-5.8, -6.4, -6.6, -9.0, -4.0, -10.8, 1.5, 0.5],
  [5.6, -6.6, 6.8, -9.0, 6.3, -10.3, 1.4, 0.5],
  [-1.6, -8.4, -0.9, -11.0, 1.9, -11.5, 1.9, 0.8],
  [2.0, -8.2, 3.6, -10.6, 6.1, -10.8, 1.8, 0.8],
  // front: brushed up and to the right, uneven lengths
  [-5.2, -6.9, -5.4, -9.3, -2.7, -10.9, 1.55, 0.9],
  [-2.8, -7.3, -2.4, -10.0, 0.5, -11.3, 1.75, 1.0],
  [-0.2, -7.5, 0.8, -10.0, 3.5, -11.1, 1.75, 1.0],
  [2.6, -7.3, 3.8, -9.6, 5.9, -10.3, 1.6, 0.9],
  [4.9, -6.6, 6.3, -8.2, 7.2, -8.9, 1.25, 0.7],
];
const P0 = [0, 0], P1 = [0, 0], P2 = [0, 0], LC = [0, 0];

// Short textured crop: tight faded sides with a sideburn, volume on top as clumps.
function drawTextured(buf, L, m, head, s, sk) {
  const H = L.head;
  const lag = sk.hairLag || 0;
  const tr = tier(s);
  const yaw = Math.sin(head.yaw);
  const yawX = yaw * H.R * 0.8;
  const pitchShift = Math.sin(head.pitch) * 2.0;
  const cyc = H.craniumY - 0.4;
  const RV = H.R + 0.55;
  const hairline = (fx) => H.top + 4.05 + pitchShift + fx * fx * 0.018 - Math.exp(-((Math.abs(fx) - 5.2) ** 2) / 1.6) * 0.7;
  const [x0, y0, x1, y1] = headBox(head, 2.6);
  // ---- the cap under the clumps: skull-tight faded sides, sideburns, a darker top
  buf.shape(x0, y0, x1, y1, m.hair, (px, py) => {
    local(head, px, py, LC);
    const x = LC[0], y = LC[1];
    if (y > 0.6) return -1;
    const dy = y - cyc;
    const top = y < H.craniumY - 2.2;
    const vol = top ? RV : headHW(H, Math.max(y, H.top + 0.5), 0) + 0.4;
    if (top ? x * x + dy * dy > vol * vol : Math.abs(x) > vol) return -1;
    const fx = x - yawX;
    const hw = headHW(H, y, 0);
    const sideburn = Math.abs(x) > hw - 0.6 && y < -0.9 && y > H.craniumY - 1.5;
    if (y > hairline(fx) && !sideburn && Math.abs(x) < hw - 0.05) return -1;
    if (y > H.craniumY + 0.6 && !sideburn) return -1;
    let t = toneN(m.hair, (x / RV) * 0.9, (dy / RV) * 0.9);
    // faded sides read darker and flatter than the top; the top sits under the clumps
    if (y > H.craniumY - 2.0) t = x > 0 ? 2 : 1;
    else if (tr > 0) t = Math.min(3, t + 1);
    return t;
  });
  // ---- clumps, back to front (in the wide they only shape the silhouette)
  for (let i = 0; i < CLUMPS.length; i++) clump(buf, L, m, head, s, CLUMPS[i], yawX, lag, i < 4 ? 1 : 0, tr);
  if (tr === 2) {
    // one loose lock falling onto the forehead on the lit side (follows through a little more)
    const fx = -3.6;
    screen(head, fx + yawX, -7.0, P0);
    screen(head, fx - 0.6 + yawX + lag * 0.2, -6.0, P1);
    screen(head, fx - 0.1 + yawX + lag * 0.45, -5.0, P2);
    stroke(buf, m.hair, P0[0], P0[1], P1[0], P1[1], P2[0], P2[1], 0.55 * s, 0.25 * s, (nx, ny, u) => (u > 0.75 ? 1 : nx < -0.2 ? 0 : 1), 5, 0.15 * s);
  }
}

// One clump: a leaf-shaped stroke from the root to its tip, lit as a tube on a round head
// (the head's sphere normal mixed in), darker at the root, a crease on its far edge.
function clump(buf, L, m, head, s, c, yawX, lag, back, tr) {
  const H = L.head;
  const [rx, ry, cx, cy, tx, ty, belly, follow] = c;
  const sx = yawX * (back ? 0.7 : 0.9);
  screen(head, rx + sx, ry, P0);
  screen(head, cx + sx * 0.95, cy, P1);
  screen(head, tx + sx * 0.9 + lag * follow * 0.55, ty + Math.abs(lag) * 0.1, P2);
  const RV = H.R + 1.6;
  const sxn = ((rx + tx) * 0.5) / RV, syn = ((ry + ty) * 0.5 - H.craniumY) / RV;
  // how much this clump faces the key (upper left), from its place on the head
  const facing = -(sxn * 0.6 + syn * 0.8);
  const tone = tr === 0
    ? (nx, ny) => toneN(m.hair, (nx * 0.3 + sxn * 0.7) * 0.95, (ny * 0.3 + syn * 0.7) * 0.95)
    : (nx, ny, u, a) => {
      // base colour across the clump, a highlight streak on its lit edge, shade on the far edge
      const lit = -0.6 * nx - 0.8 * ny;
      let t = lit > 0.42 && facing > -0.3 ? 0 : lit < -0.5 ? 2 : 1;
      if (facing < -0.45 && t < 2) t++;
      if (u < 0.16) t += 1; // the root sits in the clump's own shadow
      if (a > 0.76 && tr === 2) t = 3; // crease against the next clump
      if (back) t += 1;
      return t > 3 ? 3 : t;
    };
  stroke(buf, m.hair, P0[0], P0[1], P1[0], P1[1], P2[0], P2[1], 0.85 * s, 0.45 * s, tone, 8, belly * s * 0.7);
}
