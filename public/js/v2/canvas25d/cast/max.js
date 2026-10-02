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
import { material } from '../pixbuf.js';
import { defineLook, SKIN_TAN } from './base.js';
import { stroke, local, screen, tier, hwAt, rimRuns } from './wardrobe-b.js';

export const max = defineLook({
  id: 'max',
  name: 'Max Circuit',
  head: { top: -10.0, craniumY: -2.5, R: 7.0, cheekY: 1.4, cheekHW: 6.7, chinY: 9.3, chinHW: 3.3, jawPow: 2.9 },
  headAt: [0, -12.55], // a shorter neck and a lower seat than the anchors: he leans in
  neck: { hw: 2.85 },
  eyes: { y: -0.6, x: 2.8, w: 2.65, h: 1.5, iris: [P.brown, P.maroon], lash: P.black, lashes: false, bags: false },
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
    // the hair without the resolve rim (it would dot every clump tip); drawTextured paints the rim
    // as continuous arcs along the top of the quiff
    tex: { ramp: [P.brown, P.maroon, P.black, P.black], line: P.black, th: [0.62, 0.08, -0.42] },
  },
  parts: { hair: drawTextured },
});

// Clumps of the textured top in feature space (x moves with the face on a turn):
// root, control and tip (head-local units), belly (fullest half-width) and how much
// the tip follows through. The roots sit above the hairline so the forehead stays
// open; the back layer is drawn first and one step darker.
const CLUMPS = [
  // crown and sides (behind), one step darker
  [-6.0, -6.2, -6.1, -9.3, -3.0, -11.3, 1.4, 0.5],
  [5.7, -6.4, 7.7, -9.5, 8.1, -11.9, 1.3, 0.5],
  [-3.4, -8.6, -2.2, -11.3, 1.0, -12.1, 1.5, 0.7],
  [0.6, -8.8, 2.6, -11.9, 6.0, -13.0, 1.7, 0.8],
  [3.4, -8.0, 5.8, -10.8, 8.5, -12.1, 1.3, 0.7],
  // front: brushed up and to the right; uneven widths and lengths, a few lying lower
  [-5.4, -6.8, -5.0, -9.4, -2.0, -11.4, 1.25, 0.8],
  [-3.6, -7.2, -2.4, -10.2, 0.7, -11.9, 1.6, 0.9],
  [-1.5, -7.6, 0.0, -10.5, 3.4, -12.2, 1.45, 1.0],
  [0.6, -7.5, 2.4, -10.7, 5.7, -12.5, 1.7, 1.0],
  [2.9, -7.2, 5.0, -10.1, 7.8, -11.8, 1.35, 0.9],
  [4.9, -6.5, 7.2, -8.2, 8.9, -9.2, 1.05, 0.7],
  [-2.6, -6.9, -2.1, -8.6, 0.2, -9.4, 0.8, 0.6],
];
const P0 = [0, 0], P1 = [0, 0], P2 = [0, 0], LC = [0, 0];
export const QUIFF = { lift: 1.1 }; // how far the high tips stand up off the crown (units): keeps Max's silhouette apart from Paco's

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
  // the front hairline: a soft M (slightly receded temples) broken into short tips, never a ruled edge
  const hairline = (fx) => H.top + 4.05 + pitchShift + fx * fx * 0.018 - Math.exp(-((Math.abs(fx) - 5.2) ** 2) / 1.6) * 0.7 +
    (tr === 2 ? 0.28 * Math.sin(fx * 2.3 + 0.4) + 0.12 * Math.sin(fx * 5.1) : 0.15 * Math.sin(fx * 1.7));
  const x0 = head.cx - (H.R + 1.4) * s, x1 = head.cx + (H.R + 1.4) * s;
  const y0 = head.cy + (H.top - 1.6) * s, y1 = head.cy + 1.2 * s;
  // ---- the cap under the clumps: skull-tight faded sides, sideburns, a darker top
  buf.shape(x0, y0, x1, y1, m.tex, (px, py) => {
    local(head, px, py, LC);
    const x = LC[0], y = LC[1];
    if (y > 0.6) return -1;
    const dy = y - cyc;
    const top = y < H.craniumY - 2.2;
    // below the quiff the sides are clipped close: a sliver over the skull, no volume
    const vol = top ? RV : hwAt(L, Math.max(y, H.top + 0.5)) + 0.3;
    if (top ? x * x + dy * dy > vol * vol : Math.abs(x) > vol) return -1;
    const fx = x - yawX;
    const hw = hwAt(L, y);
    const sideburn = Math.abs(x) > hw - 0.45 && y < -1.1 && y > H.craniumY - 1.5;
    if (y > hairline(fx) && !sideburn && Math.abs(x) < hw - 0.05) return -1;
    if (y > H.craniumY + 0.6 && !sideburn) return -1;
    // the cap as a dome lit from the key (no square root per pixel: the front of the dome faces the lens)
    const l = -0.55 * (x / RV) - 0.7 * (dy / RV);
    let t = l > 0.62 ? 0 : l > -0.1 ? 1 : l > -0.55 ? 2 : 3;
    // faded sides read darker and flatter than the top; the top sits under the clumps
    // faded sides: short and flat, one step down from the top; only the far edge goes dark
    if (!top && y > hairline(fx)) {
      // the clipped sides at the temples: a close sliver, lighter toward the ear where skin shows through
      // (brown is also the skin ramp's deep tone, so the side melts into the temple instead of ending in a band)
      if (!sideburn && y > H.craniumY + 0.2) return -1; // skin below the fade
      t = x > 0 ? (y > H.craniumY - 1.4 ? 1 : 2) : y > H.craniumY - 1.4 ? 0 : 1;
      if (tr === 0) t = x > 0 ? 2 : 1;
    } else if (y > H.craniumY - 2.0) {
      t = x > hw - 0.1 ? 2 : 1;
    }
    else if (tr > 0) t = y > hairline(fx) - 1.4 ? (x > 3.2 ? 2 : x < -1.5 ? 0 : 1) : Math.min(3, t + 1); // short front hairs stay lit
    return t;
  });
  // ---- clumps, back to front (in the wide they only shape the silhouette)
  // only some clumps carry a highlight streak (in the medium every streak would read as stripes)
  for (let i = 0; i < CLUMPS.length; i++) clump(buf, L, m, head, s, CLUMPS[i], yawX, lag, i < 5 ? 1 : 0, tr, tr === 2 ? i !== 6 && i !== 9 : i === 2 || i === 6 || i === 8);
  if (tr === 2) {
    // one loose lock falling onto the forehead on the lit side (follows through a little more)
    const fx = -3.6;
    screen(head, fx + yawX, -7.0, P0);
    screen(head, fx - 0.6 + yawX + lag * 0.2, -6.0, P1);
    screen(head, fx - 0.1 + yawX + lag * 0.45, -5.0, P2);
    stroke(buf, m.tex, P0[0], P0[1], P1[0], P1[1], P2[0], P2[1], 0.55 * s, 0.25 * s, (nx, ny, u) => (u > 0.75 ? 1 : nx < -0.2 ? 0 : 1), 5, 0.15 * s);
  }
  // ---- rim: continuous silver arcs along the top of the quiff only (a rim on every tip would sparkle)
  const g = buf.g;
  const yLimit = head.cy + (H.craniumY - 4.2) * s;
  rimRuns(buf, g, g, x0, x1, y0 - 4 * s, y1, rimDecal(), tr === 2 ? 3 : 2, (x, y) => y < yLimit);
}

// One clump: a leaf-shaped stroke from the root to its tip, lit as a tube on a round head
// (the head's sphere normal mixed in), darker at the root, a crease on its far edge.
function clump(buf, L, m, head, s, c, yawX, lag, back, tr, streak = true) {
  const H = L.head;
  const [rx, ry, cx, cy, tx, ty, belly, follow] = c;
  const sx = yawX * (back ? 0.7 : 0.9);
  screen(head, rx + sx, ry, P0);
  // the quiff stands up off the crown: tips (and their control points) lift by QUIFF.lift where they sit high
  const up = ty < -10.5 ? QUIFF.lift : ty < -9.5 ? QUIFF.lift * 0.5 : 0;
  screen(head, cx + sx * 0.95, cy - up * 0.55, P1);
  screen(head, tx + sx * 0.9 + lag * follow * 0.55, ty - up + Math.abs(lag) * 0.1, P2);
  const RV = H.R + 1.6;
  const sxn = ((rx + tx) * 0.5) / RV, syn = ((ry + ty) * 0.5 - H.craniumY) / RV;
  // how much this clump faces the key (upper left), from its place on the head
  const facing = -(sxn * 0.6 + syn * 0.8);
  const tone = tr === 0
    ? (nx, ny) => {
      // wide: the clumps only shape the silhouette; one small lit area on the crown toward the key
      const l = -0.6 * (nx * 0.3 + sxn * 0.7) - 0.8 * (ny * 0.3 + syn * 0.7);
      return l > 0.62 ? 0 : l > -0.25 ? 1 : 2;
    }
    : (nx, ny, u, a) => {
      // base colour across the clump, a highlight streak on its lit edge, shade on the far edge
      // a short highlight streak on the lit edge around mid-length, base elsewhere, shade on the far edge
      const lit = -0.6 * nx - 0.8 * ny;
      let t = streak && lit > 0.38 && facing > -0.3 && u > 0.22 && u < 0.78 ? 0 : lit < -0.45 ? 2 : 1;
      if (facing < -0.45 && t < 2) t++;
      if (back && u < 0.2) t += 1; // roots at the crown sit in shadow
      if (a > 0.8 && tr === 2 && u > 0.12 && u < 0.9) t = 3; // the crease against the next clump
      if (back) t += 1;
      return t > 3 ? 3 : t;
    };
  stroke(buf, m.tex, P0[0], P0[1], P1[0], P1[1], P2[0], P2[1], 0.85 * s, 0.66 * s, tone, tr === 2 ? 5 : 4, belly * s * 0.68); // soft, rounded tips: textured, never spiky
}

const rimDecal = () => material('cast-b:rim', { ramp: [P.silver], line: P.ink, decal: true });
