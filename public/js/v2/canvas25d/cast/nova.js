// Dr Nova Reyes (owner: PRESENTERS B stream). Astrophysicist presenting COSMOS
// DESK: warm, precise, the calm expert who leads. Natural coily hair in a full,
// rounded shape drawn as curl clusters (each with its own lit side and a deep
// crease where it tucks under its neighbour; a silver rim only as short
// continuous arcs along the top), deep brown skin on the warm ramp (tan /
// tanShade / brown / maroon) lit with care: the planes that face the key
// (forehead, cheekbone, nose bridge, chin) turn to tan, so her face stays the
// warmest, brightest area of a COSMOS frame; a muted slate cardigan worn open
// over a charcoal round-neck top and a fine silver chain
// (cast/wardrobe-b.js 'cardigan').
// No P.magenta / P.purple anywhere: on COSMOS those are programme accent pixels
// (cosmos.md §5 item 9).
import { P } from '../../../palette.js';
import { material, decal } from '../pixbuf.js';
import { clamp } from '../space.js';
import { drawHead } from '../head.js';
import { GROUPS } from '../character.js';
import { defineLook } from './base.js';
import { blob, local, screen, tier, hwAt, fastAtan2 } from './wardrobe-b.js';

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
  skinLift: 0.4, // FACES: the lit planes reach further round a deep skin (the far side stays in shade)
  skinLine: P.maroon,
  hair: { style: 'coily', ramp: [P.brown, P.maroon, P.black, P.black], line: P.black },
  necklace: [P.silver, P.fog],
  torso: { neckHW: 3.0, shoulderTop: 3.0, shoulderHW: 18.6, sideHW: 17.4, bottom: 46, vDepth: 12.5, shoulderJoint: [16.0, 7.0] },
  outfit: 'cardigan',
  // a muted blue-grey knit: darker than her lit face, a step lighter than UNIT-8's graphite shell
  jacket: { ramp: [P.fog, P.steel, P.slate, P.ink], line: P.black },
  // a charcoal round-neck top: off the skin ramp, so neck and garment separate at 1x (a maroon / brown
  // top read as a plunging bare neckline on air)
  shirt: { ramp: [P.slate, P.ink, P.black, P.black], line: P.black },
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

/** Signed distance (units, > 0 inside, first order) to an ellipse. */
function planeD(x, y, cx, cy, rx, ry) {
  const u = (x - cx) / rx, v = (y - cy) / ry;
  return (1 - Math.sqrt(u * u + v * v)) * (rx < ry ? rx : ry);
}

/** Signed distance (units, > 0 inside) to a capsule of radius r from (ax, ay) to (bx, by). */
function capD(x, y, ax, ay, bx, by, r) {
  const vx = bx - ax, vy = by - ay;
  let k = ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy);
  k = k < 0 ? 0 : k > 1 ? 1 : k;
  const ux = x - ax - vx * k, uy = y - ay - vy * k;
  return r - Math.sqrt(ux * ux + uy * uy);
}

// The scallop of the outline by angle, tabulated once (11 lobes plus a slower 7-lobe variation).
const SC_N = 512;
const SCALLOP = new Float32Array(SC_N);
// the wide: no clusters inside, so the outline itself carries the coils: 10 lobes ~1-1.5 px deep over
// the top and the sides, fading out under the jaw line
const SCALLOP0 = new Float32Array(SC_N);
for (let i = 0; i < SC_N; i++) {
  const a = (i / SC_N) * 2 * Math.PI - Math.PI;
  SCALLOP[i] = 0.04 * Math.cos(a * 11) + 0.018 * Math.cos(a * 7 + 1.3);
  const lower = Math.sin(a); // a = atan2(v, u): > 0 below the centre line
  SCALLOP0[i] = (0.1 * Math.cos(a * 10 + 0.4) + 0.025 * Math.cos(a * 4 + 2.1)) * clamp(1 - (lower - 0.25) / 0.5, 0, 1);
}

/** Signed "inside" of the halo outline at (x, y): > 0 inside. Scalloped by the outer clusters. */
function halo(x, y, lag, wide = false) {
  const dy = y - HALO.cy;
  const below = dy > 0;
  const ry = below ? HALO.down : HALO.up;
  const v = dy / ry;
  const xx = x - (below ? lag * v * 0.8 : 0);
  const rx = HALO.rx * (below ? 1 - HALO.taper * v * v : 1);
  const u = xx / rx;
  const r2 = u * u + v * v;
  // the scallop only matters near the outline: skip the angle well inside and well outside
  if (wide ? r2 > 1.27 || r2 < 0.76 : r2 > 1.16 || r2 < 0.8) return 1 - Math.sqrt(r2);
  const a = fastAtan2(v, u);
  const k = ((((a + Math.PI) / (2 * Math.PI)) * SC_N) | 0) & (SC_N - 1);
  return 1 + (wide ? SCALLOP0[k] : SCALLOP[k]) - Math.sqrt(r2);
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
 * one tone, the chin's underside too: lit side tan, shade side tanShade.
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
  // hand-placed lit planes (head-local units, feature space), shaped on the face's structure: a broad
  // forehead plane over the key-side brow ridge that runs down the glabella into the nose bridge (where
  // FACES' ridge light continues it), a diagonal along the zygomatic arch from under the lit eye out to
  // the lit side of the face, and a small plane on the front of the chin. Each is a cluster: a tan core,
  // then a 1 px ring of P.skinShade (the hue-shifted step between tan and tanShade) before the base, so
  // no plane has a hard tan-on-tanShade edge. Positions are mapped through the head's curve (the same
  // asin turn as faceX), so on a turn the planes compress toward the far side instead of sliding as a
  // block; the cheek plane fades out as that cheek turns away. Painted only over the base tone, so
  // they keep FACES' shading
  const ex = L.eyes.x, ey = L.eyes.y;
  const by = L.brows.y;
  const chY = L.mouth.y + 2.1;
  const yaw = head.yaw || 0;
  const syaw = Math.sin(yaw);
  // the ring (units): 1 px in the medium, 2 px at close-up; the tan core is what is left inside it, so
  // a narrow plane (the glabella, the chin) is all mid-tone and only the broad ones reach tan
  const ring = (tr === 2 ? Math.max(2, Math.round(0.5 * s)) : 1) / s;
  const cheekK = clamp((yaw + 0.3) / 0.15, 0, 1); // the key-side cheek turns away for yaw < -0.15
  const mid = decal(P.skinShade);
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
        // the whole face one tone up, the chin's underside included: at 1 px a brown row under the mouth
        // plus the jaw line read as a goatee in the COSMOS wide (owner channel check)
        T[i] = t - 1;
        continue;
      }
      if (t !== 1 || ly > chinY) continue;
      // screen → feature space through the head's curve (inverse of head.js faceX)
      let fx = lx;
      if (yaw) {
        const hw = Math.max(1, hwAt(L, ly));
        const jy = clamp((ly - H.cheekY) / (H.chinY - H.cheekY), 0, 1);
        const xs = lx - syaw * 1.3 * jy;
        fx = hw * Math.sin(clamp(Math.asin(clamp(xs / hw, -0.99, 0.99)) - yaw, -1.5707, 1.5707));
      }
      // signed distance (units, > 0 inside) to the nearest plane
      let d = planeD(fx, ly, -1.1, by - 1.5, 2.5, 1.05);
      const dg = capD(fx, ly, -0.3, by + 0.1, -0.3, ey + 1.1, 0.5); // glabella → nose bridge (mid-tone only)
      if (dg > d) d = dg;
      if (cheekK > 0) {
        // the cheekbone: from under the outer half of the lit eye, slanting up toward the temple
        const dc = capD(fx, ly, -ex + 0.7, ey + 2.0, -ex - 1.9, ey + 1.05, 0.9 * cheekK);
        if (dc > d) d = dc;
      }
      const dn = planeD(fx, ly, -0.45, chY, 1.0, 0.5);
      if (dn > d) d = dn;
      if (d <= 0) continue;
      // keep a base pixel beside every shadow tone (no lit rim around the eyes, nose or mouth)
      if (T[i - 1] >= 2 && M[i - 1] === mt) continue;
      if (T[i + 1] >= 2 && M[i + 1] === mt) continue;
      if (T[i - w] >= 2 && M[i - w] === mt) continue;
      if (T[i + w] >= 2 && M[i + w] === mt) continue;
      if (d > ring) T[i] = 0;
      else M[i] = mid;
    }
  }
  if (tr === 0) {
    // the wide: the neck (drawn before the head, in the chin's shadow: tone 2) one tone up as well; on
    // this ramp a brown neck between the jaw line and the neckline read as a dark goatee at 1 px
    const gn = head.gb + GROUPS.neck;
    const ny1 = Math.min(buf.h - 2, Math.ceil(head.cy + (H.chinY + 8) * s));
    for (let y = y0; y < ny1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * w + x;
        if (M[i] === mt && Gr[i] === gn && T[i] === 2) T[i] = 1;
      }
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
  // a rounded face window: the hair comes down at the temples (never a straight cap edge)
  const hairline = (fx) => H.top + 4.2 + pitchShift + fx * fx * 0.055 + 0.2 * HL_WAVE[clampIdx(fx)];
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
    const v = halo(x, y, lag, tr === 0);
    if (v < 0) return -1;
    const nx = x / HALO.rx, ny = (y - HALO.cy) / HALO.up;
    const l = -0.55 * nx - 0.7 * ny;
    if (tr === 0) {
      // wide: the scalloped shape (no clusters: they would be noise at 1 px), and on the upper left a
      // few single lit coil tops on a coarse jittered lattice, well inside the outline
      if (l > 0.45 && v > 0.14) {
        const gx = Math.floor((x + 40) / 3.3), gy = Math.floor((y + 40) / 3.1);
        const h = hash(gx, gy);
        if (h < 0.55) {
          const qx = (gx + 0.3 + 0.4 * h) * 3.3 - 40, qy = (gy + 0.3 + 0.4 * hash(gy, gx)) * 3.1 - 40;
          if (Math.abs(x - qx) < 0.5 / s && Math.abs(y - qy) < 0.5 / s) return 0;
        }
      }
      return l > -0.2 ? 1 : l > -0.75 ? 2 : 3;
    }
    // the interior between clusters shows only as small rounded pockets: black, maroon only on the lit crown
    return l > 0.35 ? 1 : 2;
  });
  if (tr > 0) {
    // ---- clusters on a jittered hexagonal lattice, top rows first so lower curls overlap
    const d = tr === 1 ? 2.6 : s >= 3 ? 2.05 : 2.2; // spacing (units): clusters ~4-5 px across at close-up
    const r = d * (tr === 1 ? 0.6 : 0.6); // a touch under half the spacing on the diagonal: small dark pockets between coils
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
        // where the cluster is really drawn: it rides the turn (and the follow-through) with the head
        const k = jy > HALO.cy ? (jy - HALO.cy) / HALO.down : 0;
        const dx = jx + yawX * 0.6 + lag * k * 0.6;
        if (inFace(dx, jy) || below(dx, jy)) continue;
        // clusters at the edge of the face window and of the outline are smaller (soft hairline, clean
        // scallop), and none may reach into the face (a curl on the cheek reads as a dark blot)
        const toward = dx > 0 ? -1 : 1;
        const nearFace = inFace(dx, jy + 0.9) || inFace(dx + toward * 0.9, jy);
        const edge = v < 0.1;
        const rr = (nearFace ? r * 0.7 : edge ? r * 0.82 : r) * (0.82 + hash(jx, jy) * 0.36);
        if (inFace(dx + toward * rr * 1.05, jy) || inFace(dx, jy + rr * 1.05) || below(dx + toward * rr, jy + rr * 0.5)) continue;
        screen(head, dx, jy, SC);
        const nx = jx / HALO.rx, ny = (jy - HALO.cy) / HALO.up;
        const facing = -0.55 * nx - 0.7 * ny;
        const crown = jy < HALO.cy - HALO.up * 0.55;
        // the far side's clusters sit one step down (body black, crescent maroon): structure without glare
        const bias = facing < -0.62 ? 1 : 0;
        // every cluster that faces the key gets a brown crescent on its upper left, and the front clusters
        // tuck under their neighbours in maroon (black creases read as cracks); only the far side goes black
        blob(buf, mc, SC[0], SC[1], rr * s * (crown ? 1.08 : 1), crown ? 0.07 : 0.14, hash(j * 3.1, jx) * 6.28, bias, sph, facing > -0.2 || hash(jy, j) > 0.6, bias ? 3 : 1, tr === 2 ? 0.42 : 0.2);
      }
    }
  }
  // ---- rim: short silver arcs on the tops of the lumps only (a rim along the whole outline reads as
  // one straight staircase across the curls), from just left of centre rightwards (the hair light comes
  // from the upper right; a rim over the whole crown would outline the curls like a cap)
  {
    const g = buf.g;
    const [, by0, bx1, by1] = haloBox(head, 1);
    const yLimit = head.cy + (HALO.cy - HALO.up * 0.45) * s;
    rimPeaks(buf, g, head.cx - 1.5 * s, bx1, by0, Math.min(by1, yLimit), rimDecal(), Math.max(2, Math.round(0.9 * s)), s >= 3 ? 1 : 0);
  }
}

const PEAK_TOPS = new Int16Array(400);
/**
 * Paint `rim` on the top pixel of each column x0..x1 (rows y0..y1) whose top belongs to group g and
 * is a local peak of the outline: no column within `win` on either side reaches higher than its top
 * minus `slack`. Only runs of 2+ neighbouring peak columns are painted (no single sparkles).
 */
function rimPeaks(buf, g, x0, x1, y0, y1, rim, win, slack) {
  x0 = Math.max(1, Math.round(x0));
  x1 = Math.min(buf.w - 2, Math.round(x1), x0 + PEAK_TOPS.length - 1);
  y0 = Math.max(1, Math.round(y0));
  y1 = Math.min(buf.h - 2, Math.round(y1));
  const w = buf.w, M = buf.mat, Gr = buf.grp;
  for (let x = x0; x <= x1; x++) {
    let top = -1;
    for (let y = y0; y <= y1; y++) {
      const i = y * w + x;
      if (!M[i]) continue;
      if (Gr[i] === g) top = y;
      break;
    }
    PEAK_TOPS[x - x0] = top;
  }
  const peak = (x) => {
    const t = PEAK_TOPS[x - x0];
    if (t < 0) return false;
    for (let k = -win; k <= win; k++) {
      const q = x + k;
      if (q < x0 || q > x1 || !k) continue;
      const u = PEAK_TOPS[q - x0];
      if (u >= 0 && u < t - slack) return false;
    }
    return true;
  };
  let run = 0;
  for (let x = x0; x <= x1 + 1; x++) {
    const ok = x <= x1 && peak(x) && (run === 0 || Math.abs(PEAK_TOPS[x - x0] - PEAK_TOPS[x - 1 - x0]) <= 1);
    if (ok) {
      run++;
      continue;
    }
    if (run >= 2) for (let q = x - run; q < x; q++) buf.paint(q, PEAK_TOPS[q - x0], rim, 0);
    run = x <= x1 && peak(x) ? 1 : 0;
  }
}

const rimDecal = () => material('cast-b:rim', { ramp: [P.silver], line: P.ink, decal: true });
