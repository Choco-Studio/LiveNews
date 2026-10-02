// Dr Nova Reyes (owner: PRESENTERS B stream). Astrophysicist presenting COSMOS
// DESK: warm, precise, the calm expert who leads. Natural coily hair in a full,
// rounded shape drawn as curl clusters (each with its own lit side and a deep
// crease where it tucks under its neighbour, silver rim only on the top
// clusters), deep brown skin on the warm ramp (tan / tanShade / brown /
// maroon), a muted slate cardigan worn open over a deep maroon round-neck top
// and a fine silver chain (cast/wardrobe-b.js 'cardigan').
// No P.magenta / P.purple anywhere: on COSMOS those are programme accent pixels
// (cosmos.md §5 item 9).
import { P } from '../../../palette.js';
import { headHW, headBox } from '../head.js';
import { clamp } from '../space.js';
import { defineLook } from './base.js';
import { blob, local, screen, tier } from './wardrobe-b.js';

export const nova = defineLook({
  id: 'nova',
  name: 'Dr Nova Reyes',
  head: { top: -10.0, craniumY: -2.5, R: 7.25, cheekY: 1.9, cheekHW: 7.0, chinY: 9.0, chinHW: 2.6, jawPow: 2.1 },
  headAt: [0, -13.0],
  neck: { hw: 2.6 },
  eyes: { y: -0.5, x: 2.9, w: 2.8, h: 1.5, iris: [P.brown, P.maroon], lash: P.black, lashes: true },
  brows: { y: -2.3, len: 3.2, thick: 0.5, color: P.black, arch: 0.45 },
  nose: { y0: -0.2, y1: 3.45, w: 1.6, big: false },
  mouth: { y: 5.95, w: 3.7, lip: P.maroon, lipHi: P.brown, upper: P.brown, inner: P.maroon, teeth: P.silver, tongue: P.darkRed },
  ears: { y: -0.1, h: 2.8, w: 1.0 },
  skin: [P.tan, P.tanShade, P.brown, P.maroon],
  skinLine: P.maroon,
  hair: { style: 'coily', ramp: [P.brown, P.maroon, P.black, P.black], line: P.black },
  necklace: [P.silver, P.fog],
  torso: { neckHW: 3.0, shoulderTop: 3.0, shoulderHW: 18.6, sideHW: 17.4, bottom: 46, vDepth: 12.5, shoulderJoint: [16.0, 7.0] },
  outfit: 'cardigan',
  jacket: { ramp: [P.steel, P.slate, P.ink, P.black], line: P.black }, // muted slate knit, darker than her face
  shirt: { ramp: [P.brown, P.maroon, P.black, P.black], line: P.black }, // deep maroon top
  cuff: P.slate,
  arm: { upper: 21.4, fore: 19.8, rUpper: 3.1, rElbow: 2.65, rWrist: 2.05, hand: 10.3 },
  persona: { sway: 0.7, headMotion: 0.85, blinkMin: 2.5, blinkMax: 5.6, energy: 0.85, smile: 0.2 },
  mats: {
    band: { ramp: [P.steel, P.slate, P.ink, P.black], line: P.ink, rim: P.silver },
  },
  parts: { hairBack: drawHaloBack, hair: drawCoils, coversEars: true },
});

// The rounded shape around the head (head-local units): centre, half-width,
// height above and below the centre, and the scallop that the outer clusters make.
const HALO = { cy: -3.7, rx: 11.9, up: 11.0, down: 9.8 };
const LC = [0, 0], SC = [0, 0];
const hash = (a, b) => {
  const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return h - Math.floor(h);
};

/** Signed "inside" of the halo outline at (x, y): > 0 inside. Scalloped by ~11 lobes. */
function halo(x, y, lag) {
  const dy = y - HALO.cy;
  const ry = dy < 0 ? HALO.up : HALO.down;
  const xx = x - (dy > 0 ? lag * (dy / HALO.down) * 0.8 : 0);
  const a = Math.atan2(dy / ry, xx / HALO.rx);
  const scallop = 0.045 * Math.cos(a * 11) + 0.02 * Math.cos(a * 7 + 1.3);
  const r = Math.sqrt((xx / HALO.rx) ** 2 + (dy / ry) ** 2);
  return 1 + scallop - r;
}

// The back of the hair: fills behind the head and neck (always in shadow).
function drawHaloBack(buf, L, m, head, s, sk) {
  const lag = sk.hairLag || 0;
  const [x0, y0, x1, y1] = headBox(head, 4.5);
  buf.shape(x0, y0, x1, y1, m.hairBack, (px, py) => {
    local(head, px, py, LC);
    const x = LC[0], y = LC[1];
    if (halo(x, y, lag) < 0.04) return -1;
    return x < -2 ? 2 : 3;
  });
}

// The front: the halo mass (the dark interior between clusters), then the clusters.
function drawCoils(buf, L, m, head, s, sk) {
  const H = L.head;
  const lag = sk.hairLag || 0;
  const tr = tier(s);
  const yawX = Math.sin(head.yaw) * H.R * 0.75;
  const pitchShift = Math.sin(head.pitch) * 2.0;
  const hairline = (fx) => H.top + 4.4 + pitchShift + fx * fx * 0.012 + 0.25 * Math.sin(fx * 2.1);
  // a face window: open forehead and cheeks, hair down the sides to the jaw
  const inFace = (x, y) => {
    const fx = x - yawX;
    const hw = headHW(H, y, 0);
    return y > hairline(fx) && Math.abs(x) < hw - 0.25 && y < H.chinY + 3;
  };
  const below = (x, y) => y > H.cheekY + 1.2 && Math.abs(x) < headHW(H, Math.min(y, H.chinY), 0) + 0.8;
  const [x0, y0, x1, y1] = headBox(head, 4.2);
  buf.shape(x0, y0, x1, y1, m.hair, (px, py) => {
    local(head, px, py, LC);
    const x = LC[0], y = LC[1];
    const v = halo(x, y, lag);
    if (v < 0) return -1;
    if (inFace(x, y) || below(x, y)) return -1;
    const nx = x / HALO.rx, ny = (y - HALO.cy) / HALO.up;
    const l = -0.55 * nx - 0.7 * ny;
    if (tr === 0) {
      // wide: the shape with a lit crown and lobes; no clusters (they would be noise)
      if (v < 0.06 && l > 0.3) return 0;
      return l > 0.1 ? 1 : l > -0.5 ? 2 : 3;
    }
    return l > 0.2 ? 2 : 3; // the interior between clusters stays dark
  });
  if (tr === 0) return;
  // ---- clusters on a jittered hexagonal lattice, top rows first so lower curls overlap
  const d = tr === 1 ? 2.7 : s >= 3 ? 1.8 : 2.05; // spacing (units)
  const r = d * (tr === 1 ? 0.62 : 0.66);
  const sph = (cx, cy, out) => {
    local(head, cx, cy, LC);
    out.sx = clamp(LC[0] / HALO.rx, -1, 1);
    out.sy = clamp((LC[1] - HALO.cy) / HALO.up, -1, 1);
    out.mix = 0.5;
  };
  const rows = Math.ceil((HALO.up + HALO.down) / (d * 0.86));
  for (let j = 0; j <= rows; j++) {
    const y = HALO.cy - HALO.up + j * d * 0.86;
    const off = j & 1 ? d * 0.5 : 0;
    for (let x = -HALO.rx - off; x <= HALO.rx + d; x += d) {
      const jx = x + off + (hash(j, x) - 0.5) * d * 0.45;
      const jy = y + (hash(x, j) - 0.5) * d * 0.4;
      const v = halo(jx, jy, lag);
      if (v < 0.015) continue;
      if (inFace(jx, jy) || below(jx, jy)) continue;
      // clusters at the edge of the face window are smaller (the hairline is soft)
      const nearFace = inFace(jx, jy + 0.9) || inFace(jx + Math.sign(jx) * -0.9, jy);
      const rr = (nearFace ? r * 0.72 : r) * (0.8 + hash(jx, jy) * 0.4);
      const k = jy > HALO.cy ? (jy - HALO.cy) / HALO.down : 0;
      screen(head, jx + yawX * 0.6 + lag * k * 0.6, jy, SC);
      const nx = jx / HALO.rx, ny = (jy - HALO.cy) / HALO.up;
      const facing = -0.55 * nx - 0.7 * ny;
      blob(buf, m.hair, SC[0], SC[1], rr * s, 0.16, hash(j * 3.1, jx) * 6.28, facing < -0.45 ? 1 : 0, sph, facing > 0.42 && hash(jy, j) > 0.4);
    }
  }
}
