// Dr Nova Reyes (owner: PRESENTERS B stream). Astrophysicist presenting COSMOS
// DESK: warm, precise, the calm expert who leads. Natural coily hair in a full,
// rounded shape drawn as curl clusters (each with its own lit side and a deep
// crease where it tucks under its neighbour; a silver rim only as short
// continuous arcs along the top), deep brown skin on the warm ramp (tan /
// tanShade / brown / maroon) lit with care: the planes that face the key
// (forehead, cheekbone, nose bridge, chin) turn to tan, so her face stays the
// warmest, brightest area of a COSMOS frame; a muted slate cardigan worn open
// over a deep maroon round-neck top and a fine silver chain
// (cast/wardrobe-b.js 'cardigan').
// No P.magenta / P.purple anywhere: on COSMOS those are programme accent pixels
// (cosmos.md §5 item 9).
import { P } from '../../../palette.js';
import { material } from '../pixbuf.js';
import { clamp } from '../space.js';
import { drawHead } from '../head.js';
import { GROUPS } from '../character.js';
import { defineLook } from './base.js';
import { blob, local, screen, tier, hwAt, fastAtan2, rimRuns } from './wardrobe-b.js';

export const nova = defineLook({
  id: 'nova',
  name: 'Dr Nova Reyes',
  head: { top: -10.0, craniumY: -2.5, R: 7.25, cheekY: 1.9, cheekHW: 7.0, chinY: 9.0, chinHW: 2.6, jawPow: 2.1 },
  headAt: [0, -13.0],
  neck: { hw: 2.6 },
  eyes: { y: -0.5, x: 2.9, w: 2.8, h: 1.5, iris: [P.brown, P.maroon], lash: P.black, lashes: true },
  brows: { y: -2.3, len: 3.2, thick: 0.42, color: P.black, arch: 0.45 },
  nose: { y0: -0.2, y1: 3.45, w: 1.6, big: false },
  // lips one step from the skin: a maroon line, a tanShade upper lip, the lower lip catching the key in tan
  mouth: { y: 5.95, w: 3.7, lip: P.maroon, lipHi: P.tan, upper: P.tanShade, inner: P.maroon, teeth: P.silver, tongue: P.darkRed },
  ears: { y: -0.1, h: 2.8, w: 1.0 },
  skin: [P.tan, P.tanShade, P.brown, P.maroon],
  skinLine: P.maroon,
  hair: { style: 'coily', ramp: [P.brown, P.maroon, P.black, P.black], line: P.black },
  necklace: [P.silver, P.fog],
  torso: { neckHW: 3.0, shoulderTop: 3.0, shoulderHW: 18.6, sideHW: 17.4, bottom: 46, vDepth: 12.5, shoulderJoint: [16.0, 7.0] },
  outfit: 'cardigan',
  // a muted blue-grey knit: darker than her lit face, a step lighter than UNIT-8's graphite shell
  jacket: { ramp: [P.fog, P.steel, P.slate, P.ink], line: P.black },
  shirt: { ramp: [P.brown, P.maroon, P.black, P.black], line: P.black }, // deep maroon top
  cuff: P.steel,
  arm: { upper: 21.4, fore: 19.8, rUpper: 3.1, rElbow: 2.65, rWrist: 2.05, hand: 10.3 },
  persona: { sway: 0.7, headMotion: 0.85, blinkMin: 2.5, blinkMax: 5.6, energy: 0.85, smile: 0.2 },
  mats: {
    band: { ramp: [P.steel, P.slate, P.ink, P.black], line: P.ink, rim: P.silver }, // the button bands, a shade darker
    // the coils: the hair ramp without the resolve rim (a rim on every scallop would sparkle);
    // the rim is painted as continuous arcs by drawCoils
    coil: { ramp: [P.brown, P.maroon, P.black, P.black], line: P.black, th: [0.62, 0.08, -0.42] },
  },
  parts: { hairBack: drawHaloBack, head: drawWarmHead, hair: drawCoils, coversEars: true },
});

// The rounded shape around the head (head-local units): centre, half-width,
// height above and below the centre (the lower half narrows toward the jaw).
const HALO = { cy: -3.6, rx: 11.0, up: 10.4, down: 8.8, taper: 0.2 };
const LC = [0, 0], SC = [0, 0];
const hash = (a, b) => {
  const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return h - Math.floor(h);
};

// The scallop of the outline by angle, tabulated once (11 lobes plus a slower 7-lobe variation).
const SC_N = 512;
const SCALLOP = new Float32Array(SC_N);
for (let i = 0; i < SC_N; i++) {
  const a = (i / SC_N) * 2 * Math.PI - Math.PI;
  SCALLOP[i] = 0.04 * Math.cos(a * 11) + 0.018 * Math.cos(a * 7 + 1.3);
}

/** Signed "inside" of the halo outline at (x, y): > 0 inside. Scalloped by the outer clusters. */
function halo(x, y, lag) {
  const dy = y - HALO.cy;
  const below = dy > 0;
  const ry = below ? HALO.down : HALO.up;
  const v = dy / ry;
  const xx = x - (below ? lag * v * 0.8 : 0);
  const rx = HALO.rx * (below ? 1 - HALO.taper * v * v : 1);
  const u = xx / rx;
  const r2 = u * u + v * v;
  // the scallop only matters near the outline: skip the angle well inside and well outside
  if (r2 > 1.16 || r2 < 0.8) return 1 - Math.sqrt(r2);
  const a = fastAtan2(v, u);
  const k = ((((a + Math.PI) / (2 * Math.PI)) * SC_N) | 0) & (SC_N - 1);
  return 1 + SCALLOP[k] - Math.sqrt(r2);
}

// The hairline's small wave across the forehead, tabulated (feature-space x from -16 to 16 u).
const HL_N = 512;
const HL_WAVE = new Float32Array(HL_N);
for (let i = 0; i < HL_N; i++) HL_WAVE[i] = Math.sin((i / (HL_N - 1) * 32 - 16) * 2.1);
const clampIdx = (fx) => {
  const i = Math.round(((fx + 16) / 32) * (HL_N - 1));
  return i < 0 ? 0 : i >= HL_N ? HL_N - 1 : i;
};

/** Tight screen box of the halo (+ pad units), ignoring roll (≤ a few degrees). */
function haloBox(head, pad, yFrom = HALO.cy - HALO.up) {
  const s = head.s;
  return [head.cx - (HALO.rx + pad) * s, head.cy + (yFrom - pad) * s, head.cx + (HALO.rx + pad) * s, head.cy + (HALO.cy + HALO.down + pad) * s];
}

// ---------------------------------------------------------------------------
// Skin: FACES' sculpted head, then the planes that face the key lifted to tan

/**
 * FACES draws the head (normal-mapped planes, four tones of her ramp); on this darker ramp the base
 * tone (tanShade) would leave most of the face one value, so the base pixels on the planes that face
 * the key (upper-left front of the head) become the lit tone (tan), keeping one base pixel next to
 * every shadow so the features never get a halo. In the wide (two tones) the whole face steps up
 * one tone, except the chin's underside: lit side tan, shade side tanShade.
 */
function drawWarmHead(buf, L, m, head, s) {
  drawHead(buf, L, m, head, s);
  const H = L.head;
  const g = head.gb + GROUPS.head;
  const mt = m.skin;
  const tr = tier(s);
  const x0 = Math.max(1, Math.floor(head.cx - (H.cheekHW + 1.5) * s)), x1 = Math.min(buf.w - 2, Math.ceil(head.cx + (H.cheekHW + 1.5) * s));
  const y0 = Math.max(1, Math.floor(head.cy + (H.top - 0.5) * s)), y1 = Math.min(buf.h - 2, Math.ceil(head.cy + (H.chinY + 1) * s));
  const w = buf.w, M = buf.mat, T = buf.tone, Gr = buf.grp;
  const kx = head.cr / s, ky = head.sr / s;
  const chinY = H.chinY + (head.jaw || 0) - 0.8;
  const midY = (H.top + H.chinY) * 0.5, halfH = (H.chinY - H.top) * 0.5;
  const browY = L.brows.y - 0.7, cheekY0 = L.eyes.y + 0.6, cheekY1 = L.mouth.y + 0.4;
  const chinY0 = L.mouth.y + 1.9;
  for (let y = y0; y < y1; y++) {
    const dy = y + 0.5 - head.cy;
    for (let x = x0; x < x1; x++) {
      const i = y * w + x;
      if (M[i] !== mt || Gr[i] !== g) continue;
      const t = T[i];
      if (t === 0 || t === 3) continue;
      const dx = x + 0.5 - head.cx;
      const lx = dx * kx + dy * ky, ly = -dx * ky + dy * kx;
      if (tr === 0) {
        if (ly < chinY) T[i] = t - 1;
        continue;
      }
      if (t !== 1) continue;
      // the head as a soft ellipsoid lit by the key (upper front, camera-left)
      const hw = Math.max(1, hwAt(L, ly));
      const nx = clamp(lx / (hw + 0.8), -1, 1), ny = clamp((ly - midY) / (halfH + 1.5), -1, 1);
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const l = -0.42 * nx - 0.5 * ny + 0.76 * nz;
      if (l < 0.6 || ly > chinY) continue;
      // hand-placed planes, not a lit disc: the forehead above the brows, the cheekbone under the lit
      // eye (outside the nose), the front of the chin
      const forehead = ly < browY;
      // the lit side of the cheek: a soft band along the face's contour where it turns to the key
      const band = 1.9 - 0.9 * Math.abs((ly - (cheekY0 + cheekY1) * 0.5) / ((cheekY1 - cheekY0) * 0.5));
      const cheek = ly > cheekY0 && ly < cheekY1 && lx < -hw + band;
      const chin = ly > chinY0 && Math.abs(lx) < 1.7 && lx < 0.6;
      if (!forehead && !cheek && !chin) continue;
      // keep a base pixel beside every shadow tone (no lit rim around the eyes, nose or mouth)
      if (T[i - 1] >= 2 && M[i - 1] === mt) continue;
      if (T[i + 1] >= 2 && M[i + 1] === mt) continue;
      if (T[i - w] >= 2 && M[i - w] === mt) continue;
      if (T[i + w] >= 2 && M[i + w] === mt) continue;
      T[i] = 0;
    }
  }
}

// ---------------------------------------------------------------------------
// Hair

// The back of the hair: only where it can show (behind the neck and jaw, under the front mass).
function drawHaloBack(buf, L, m, head, s, sk) {
  const lag = sk.hairLag || 0;
  const H = L.head;
  const [x0, y0, x1, y1] = haloBox(head, 1, H.cheekY - 0.5);
  buf.shape(x0, y0, x1, y1, m.hairBack, (px, py) => {
    local(head, px, py, LC);
    const x = LC[0], y = LC[1];
    if (y < H.cheekY) return -1;
    if (Math.abs(x) > hwAt(L, Math.min(y, H.chinY - 0.2)) + 1.6 && y < H.chinY) return -1;
    if (halo(x, y, lag) < 0.04) return -1;
    return x < -2 ? 2 : 3;
  });
}

// The front: the halo mass (the shadowed interior between clusters), then the clusters, then the rim.
function drawCoils(buf, L, m, head, s, sk) {
  const H = L.head;
  const lag = sk.hairLag || 0;
  const tr = tier(s);
  const yawX = Math.sin(head.yaw) * H.R * 0.75;
  const pitchShift = Math.sin(head.pitch) * 2.0;
  const hairline = (fx) => H.top + 4.55 + pitchShift + fx * fx * 0.012 + 0.2 * HL_WAVE[clampIdx(fx)];
  // a face window: open forehead and cheeks, hair down the sides to the jaw
  const inFace = (x, y) => {
    const fx = x - yawX;
    return y > hairline(fx) && y < H.chinY + 3 && Math.abs(x) < hwAt(L, y) - 0.25;
  };
  const below = (x, y) => y > H.cheekY + 1.2 && Math.abs(x) < hwAt(L, Math.min(y, H.chinY)) + 0.8;
  const mc = m.coil;
  const [x0, y0, x1, y1] = haloBox(head, 0.8);
  buf.shape(x0, y0, x1, y1, mc, (px, py) => {
    local(head, px, py, LC);
    const x = LC[0], y = LC[1];
    if (inFace(x, y) || below(x, y)) return -1; // cheap table tests first: the face is a big share of the box
    const v = halo(x, y, lag);
    if (v < 0) return -1;
    const nx = x / HALO.rx, ny = (y - HALO.cy) / HALO.up;
    const l = -0.55 * nx - 0.7 * ny;
    if (tr === 0) {
      // wide: the shape with a lit crown; no clusters (they would be noise at 1 px)
      if (v < 0.07 && l > 0.32) return 0;
      return l > -0.2 ? 1 : l > -0.75 ? 2 : 3;
    }
    // the interior between clusters: maroon toward the key, black on the far side
    return l > 0.05 ? 1 : l > -0.7 ? 2 : 3;
  });
  if (tr > 0) {
    // ---- clusters on a jittered hexagonal lattice, top rows first so lower curls overlap
    const d = tr === 1 ? 2.6 : s >= 3 ? 2.05 : 2.2; // spacing (units): clusters ~4-5 px across at close-up
    const r = d * (tr === 1 ? 0.6 : 0.64);
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
        const jx = x + off + (hash(j, x) - 0.5) * d * 0.4;
        const jy = y + (hash(x, j) - 0.5) * d * 0.36;
        const v = halo(jx, jy, lag);
        if (v < 0.03) continue;
        if (inFace(jx, jy) || below(jx, jy)) continue;
        // clusters at the edge of the face window and of the outline are smaller (soft hairline, clean scallop)
        const nearFace = inFace(jx, jy + 0.9) || inFace(jx + Math.sign(jx) * -0.9, jy);
        const edge = v < 0.1;
        const rr = (nearFace ? r * 0.7 : edge ? r * 0.82 : r) * (0.82 + hash(jx, jy) * 0.36);
        const k = jy > HALO.cy ? (jy - HALO.cy) / HALO.down : 0;
        screen(head, jx + yawX * 0.6 + lag * k * 0.6, jy, SC);
        const nx = jx / HALO.rx, ny = (jy - HALO.cy) / HALO.up;
        const facing = -0.55 * nx - 0.7 * ny;
        const crown = jy < HALO.cy - HALO.up * 0.55;
        // the far side's clusters sit one step down (body black, crescent maroon): structure without glare
        const bias = facing < -0.4 ? 1 : 0;
        blob(buf, mc, SC[0], SC[1], rr * s * (crown ? 1.08 : 1), crown ? 0.07 : 0.14, hash(j * 3.1, jx) * 6.28, bias, sph, facing > 0.38 && hash(jy, j) > 0.35);
      }
    }
  }
  // ---- rim: short continuous silver arcs along the top of the hair only (never on single scallops)
  {
    const g = buf.g;
    const [bx0, by0, bx1, by1] = haloBox(head, 1);
    const yLimit = head.cy + (HALO.cy - HALO.up * 0.45) * s;
    rimRuns(buf, g, g, bx0, bx1, by0, by1, rimDecal(), tr === 1 ? 2 : 3, (x, y) => y < yLimit);
  }
}

const rimDecal = () => material('cast-b:rim', { ramp: [P.silver], line: P.ink, decal: true });
