// UNIT-8 (owner: PRESENTERS B stream). The robot co-host of COSMOS DESK:
// "an instrument, not a toy" (docs/programmes/cosmos.md, UNIT-8 table).
//   head    a low machined sensor pod (wider than tall, like a broadcast camera
//           head on its pan bearing): a brushed-aluminium box with 45° chamfers,
//           lit from camera-left (a 1 px specular on the upper-left bevel, the
//           lower-right bevels in shade) and a 1 px silver rim; a crown seam and a
//           chin seam with four flush fasteners at close-up; a stencilled "U-8" ID
//           on the forehead plate. No side modules, so the silhouette is a clean box
//           (no "ears").
//   visor   a full-width recessed band of P.black glass across the front (a sensor
//           strip, never a screen face) with a static 2 px P.slate sheen; its lower
//           bezel carries a 1 px groove in which the speech line lights.
//   eyes    two P.silver slits in the band's upper third (a P.white top row at
//           close-up), each ~12 % of the housing's width, 2 px tall at close-up,
//           1 px in the wide, no pupils; 'processing' = 1 px; a look shifts the
//           slits (and the head) 1 px. Instead of blinking: a dim to P.fog for
//           ~80 ms (persona blink 7-12 s).
//   speech  ONE centred horizontal line in the bezel groove: odd width 1-13 px
//           (1-5 in the wide), following the voice envelope (30 ms attack, 120 ms
//           release), redrawn at most 12 times per second (8 in the wide) and
//           changing by at most 4 px per update; P.fog end pixels once ≥ 5 px;
//           rests at 1 px in P.steel after 200 ms of silence, and a rest lasts at
//           least two updates, so it never turns on and off within 120 ms.
//   body    a short broad turret collar (the pan bearing; cast/wardrobe-b.js
//           'chassis'), a static steel antenna rod with no light, a graphite shell
//           with a plain chest panel and its 1 px silver seam; robot hands
//           (handStyle 'robot', drawn by HANDS).
// Motion: low sway, eased, no overshoot. The housing never rolls (a gimbal keeps
// it level): yaw and pitch move the head as whole 1 px steps, so a rigid object
// never "boils" on the pixel grid.
//
// The indicator has two exact paths. A built speech timeline (labs, frozen demos)
// is pure in t: the width chain is re-solved from the timeline. A live source
// (perf.speech.live, the v2 stage) is only ever read at the solve's own instant:
// the indicator keeps its own per-source state (tick, width, last voice, rest)
// and steps it once per tick from f.level (the 30 / 120 ms envelope speech.js
// already computes), so it never re-simulates or disturbs the shared source.
import { P } from '../../../palette.js';
import { decal, material } from '../pixbuf.js';
import { clamp } from '../space.js';
import { sampleSpeech } from '../speech.js';
import { GROUPS } from '../character.js';
import { defineLook } from './base.js';
import { tier } from './wardrobe-b.js';

// Head-local design (units; 1 u = 1 px in the wide). Wide: housing 18 x 13, band 14 x 3.
// About a human head's area but wider than tall and low: it reads as a sensor pod on a bearing,
// never a big-headed mascot. The outline is a box with 45° chamfers: machined, not rounded.
export const CASE = { hw: 9.0, top: -6.7, bot: 6.3, taper: 0.08, chamferTop: 1.5, chamferBot: 2.2 };
// the band's bottom is set by the indicator groove (one bezel row above it); bot is nominal
export const VISOR = { hw: 7.1, top: -2.05, bot: 1.45, rc: 0.8 };
export const SEAM = { crown: -5.1, chin: 4.45 };
export const EYE = { x: 3.4, y: -0.85, share: 0.12 };
export const IND_Y = 2.05;
const ID_PLATE = { x: 2.2, y: -3.6 }; // the stencilled "U-8" (left edge, vertical centre), close-ups only

export const unit8 = defineLook({
  id: 'unit8',
  name: 'UNIT-8',
  head: { top: CASE.top, craniumY: -2, R: CASE.hw, cheekY: 2, cheekHW: CASE.hw, chinY: CASE.bot, chinHW: 8.4, jawPow: 4 },
  headAt: [0, -12.2],
  neck: { hw: 5.6 }, // the turret collar: broad (62 % of the housing), the pod sits on its bearing
  // face proportions other modules may read (glassesAnchor, framing); the face itself is drawn here
  eyes: { y: EYE.y, x: EYE.x, w: 2.2, h: 0.6, iris: [P.silver, P.silver], lash: P.silver, lashes: false, bags: false },
  brows: { y: -3.5, len: 2, thick: 0.3, color: P.steel, arch: 0 },
  nose: { y0: 0, y1: 1, w: 1, big: false },
  mouth: { y: IND_Y, w: 3, lip: P.steel, lipHi: P.steel, upper: P.steel, inner: P.black, teeth: P.steel, tongue: P.steel },
  ears: { y: 0, h: 2, w: 1 },
  skin: [P.steel, P.slate, P.ink, P.black], // the turret collar (and hands where robot hands are not drawn)
  skinLine: P.black,
  hair: { style: 'none', ramp: [P.silver, P.steel, P.slate, P.ink], line: P.ink },
  torso: { neckHW: 5.9, shoulderTop: 2.4, shoulderHW: 20.2, sideHW: 18.8, bottom: 46, vDepth: 20, shoulderJoint: [17.4, 6.8] },
  outfit: 'chassis',
  // graphite shell: darker than the aluminium head (the head reads as the instrument, the body as its
  // stand) and a step darker than Nova's grey knit, so the pair never reads as one grey mass
  jacket: { ramp: [P.steel, P.slate, P.ink, P.black], line: P.black },
  shirt: { ramp: [P.steel, P.slate, P.ink, P.black], line: P.black },
  cuff: P.slate,
  arm: { upper: 22.4, fore: 20.6, rUpper: 3.3, rElbow: 2.9, rWrist: 2.3, hand: 10.8 },
  handStyle: 'robot',
  // low sway, small head motion, rare "blinks" (drawn as a dim); breath / doubleBlink are hints for idle.js
  persona: { sway: 0.25, headMotion: 0.35, blinkMin: 7, blinkMax: 12, energy: 0.35, smile: 0, breath: 0.15, doubleBlink: 0 },
  mats: {
    // brushed aluminium lit from camera-left: the front plate sits in fog, the specular bevel in silver,
    // the turned-away bevels in steel / slate; light enough that the head (band included) clears the
    // COSMOS head zone by 20 L* (cosmos.md §5 item 8), while the body stays a step darker (graphite)
    // (its 1 px silver rim is painted by drawCasing: continuous along the crown and the upper right side only)
    casing: { ramp: [P.silver, P.fog, P.steel, P.slate], line: P.ink },
    collar: { ramp: [P.steel, P.slate, P.ink, P.black], line: P.black },
    plate: { ramp: [P.steel, P.slate, P.ink, P.black], line: P.black, rim: P.silver },
    rod: { ramp: [P.silver, P.steel, P.slate, P.ink], line: P.ink, noLine: true },
  },
  parts: { hairBack: drawAntenna, head: drawCasing, face: drawVisor, hair: () => {}, coversEars: true },
});

// ---------------------------------------------------------------------------
// Whole-pixel head offset: a look or a nod moves the rigid head by 1 px, never a sub-pixel re-sample

const OFF = [0, 0];
function headOffset(head, out) {
  const sy = Math.sin(head.yaw);
  out[0] = sy > 0.16 ? 1 : sy < -0.16 ? -1 : 0;
  out[1] = head.pitch > 0.07 ? 1 : head.pitch < -0.07 ? -1 : 0;
  return out;
}

/** Half-width of the housing at head-local y (units): straight sides that draw in a little toward the chin. */
export function caseHW(y) {
  const k = Math.max(0, y) / CASE.bot;
  return CASE.hw * (1 - CASE.taper * k * k);
}

// ---------------------------------------------------------------------------
// Head: the housing

// "U-8" in a 3 x 5 stencil (rows top to bottom, bit 2 = left column)
const GLYPHS = [
  [5, 5, 5, 5, 7], // U
  [0, 0, 7, 0, 0], // -
  [7, 5, 7, 5, 7], // 8
];

function drawCasing(buf, L, m, head, s) {
  headOffset(head, OFF);
  const cx = head.cx + OFF[0], cy = head.cy + OFF[1];
  const tr = tier(s);
  buf.part(head.gb + GROUPS.head, 10, false);
  const x0 = Math.floor(cx - (CASE.hw + 1) * s), x1 = Math.ceil(cx + (CASE.hw + 1) * s);
  const y0 = Math.floor(cy + (CASE.top - 1) * s), y1 = Math.ceil(cy + (CASE.bot + 1) * s);
  const px1 = 1 / s;
  const bev = Math.max(1, Math.round(0.95 * s)) * px1; // bevel width (units): 1 px wide, ~3 px at close-up
  const seams = tr >= 1;
  const cT = CASE.chamferTop, cB = CASE.chamferBot;
  const R2 = Math.SQRT1_2;
  buf.shape(x0, y0, x1, y1, m.casing, (px, py) => {
    const x = (px - cx) / s, y = (py - cy) / s;
    const a = caseHW(y);
    const ax = x < 0 ? -x : x;
    const dSide = a - ax, dTop = y - CASE.top, dBot = CASE.bot - y;
    if (dSide < 0 || dTop < 0 || dBot < 0) return -1;
    const dCT = (dTop + dSide - cT) * R2, dCB = (dBot + dSide - cB) * R2;
    if (dCT < 0 || dCB < 0) return -1;
    // the nearest face of the box and its outward normal
    let d = dSide, nx = x < 0 ? -1 : 1, ny = 0;
    if (dTop < d) { d = dTop; nx = 0; ny = -1; }
    if (dBot < d) { d = dBot; nx = 0; ny = 1; }
    if (dCT < d) { d = dCT; nx = (x < 0 ? -1 : 1) * R2; ny = -R2; }
    if (dCB < d) { d = dCB; nx = (x < 0 ? -1 : 1) * R2; ny = R2; }
    const u = x / CASE.hw;
    let t;
    if (d < bev) {
      // the bevel: a plane tilted toward its edge, lit by the key from the upper left (the
      // specular on the crown and the upper-left chamfer and side, the lower right in shade)
      const l = -0.6 * nx - 0.8 * ny;
      t = l > 0.55 ? 0 : l > 0.05 ? 1 : l > -0.5 ? 2 : 3;
    } else {
      // the front plate: flat, a step darker toward the lower right
      t = -0.42 * u - 0.3 * (y / CASE.bot) > -0.46 ? 1 : 2;
    }
    const au = u < 0 ? -u : u;
    if (seams) {
      // seams: a dark groove; at close-up the groove's lower wall catches the key as a 1 px lit lip
      const dc = y - SEAM.crown, dn = y - SEAM.chin;
      if ((dc > -0.5 * px1 && dc <= 0.5 * px1 && au < 0.93) || (dn > -0.5 * px1 && dn <= 0.5 * px1 && au < 0.8)) return tr === 2 ? 3 : 2;
      if (tr === 2 && t === 1 && u < -0.25 && ((dc > 0.5 * px1 && dc <= 1.5 * px1 && au < 0.9) || (dn > 0.5 * px1 && dn <= 1.5 * px1 && au < 0.76))) return 0;
    }
    return t;
  });
  // the 1 px silver rim: every column's top pixel across the crown, then the right side down to the
  // widest point (the resolve rim would leave a dotted stair on the chamfers)
  const g = head.gb + GROUPS.head;
  const rim = rimDecal();
  const yMid = Math.round(cy + 0.4 * s);
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y < yMid; y++) {
      const i = y * buf.w + x;
      if (!buf.mat[i]) continue;
      if (buf.grp[i] === g && buf.mat[i] === m.casing) buf.paint(x, y, rim, 0, g);
      break;
    }
  }
  for (let y = y0; y <= yMid; y++) {
    for (let x = x1; x > cx; x--) {
      const i = y * buf.w + x;
      if (!buf.mat[i]) continue;
      if (buf.grp[i] === g && buf.mat[i] === m.casing) buf.paint(x, y, rim, 0, g);
      break;
    }
  }
  if (tr < 2) return;
  // ---- close-up instrument detail (decals: the speckle clean-up would erase a 1 px tone)
  const dk = decal(P.slate), hi = decal(P.silver), mid = decal(P.steel);
  if (s >= 2.6) {
    // four flush fasteners in the crown and chin bands: a dark centre and, from s 3.2, a lit edge
    for (let k = 0; k < 4; k++) {
      const sy = k < 2 ? SEAM.crown - 0.85 : SEAM.chin + 0.95;
      const sx = (k & 1 ? 1 : -1) * (k < 2 ? caseHW(sy) - 2.5 : caseHW(sy) * 0.62);
      const qx = Math.round(cx + sx * s - 0.5), qy = Math.round(cy + sy * s - 0.5);
      buf.paint(qx, qy, dk, 1, g);
      if (s >= 3.2) buf.paint(qx - 1, qy - 1, hi, 1, g);
    }
    // the stencilled ID: 1 px strokes in steel on the fog plate (low contrast: a label, not a feature)
    const gx = Math.round(cx + ID_PLATE.x * s), gy = Math.round(cy + ID_PLATE.y * s) - 2;
    let ox = 0;
    for (const rows of GLYPHS) {
      for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (rows[r] & (4 >> c)) buf.paint(gx + ox + c, gy + r, mid, 1, g);
      ox += 4;
    }
  }
}

const rimDecal = () => material('cast-b:rim', { ramp: [P.silver], line: P.ink, decal: true });

// ---------------------------------------------------------------------------
// Face: the sensor band, slits, speech indicator

const VW = 200, VH = 100;
const VMASK = new Uint8Array(VW * VH); // band mask for the bezel pass (no per-frame allocation)

/**
 * Pixel rows of the band, the slits and the indicator groove for a head centre cy at scale s.
 * Medium and close-up: the band spans VISOR.top down to one bezel row above the groove, which is cut
 * in the bezel at IND_Y. The wide: a shallow strip of 4 rows (glass, slit, glass, line), the line
 * lighting in the band's bottom row (the bible's "visor row 7") so it never floats on the casing as
 * a lone dot, and the band stays a sensor strip rather than a screen.
 */
export function bandRows(cy, s) {
  const eye = Math.round(cy + EYE.y * s - eyeHeight(s) / 2);
  if (s < 1.35) return { top: eye - 1, bottom: eye + 2, groove: eye + 2, eye };
  const iy = Math.round(cy + IND_Y * s);
  return { top: Math.round(cy + VISOR.top * s), bottom: iy - 2, groove: iy, eye };
}

function drawVisor(buf, L, head, f, s) {
  headOffset(head, OFF);
  const cx = head.cx + OFF[0], cy = head.cy + OFF[1];
  const tr = tier(s);
  const black = decal(P.black), sheen = decal(P.slate), dark = decal(P.ink), lip = decal(P.silver);
  // ---- the band mask (a long window with small 45° chamfers) in its pixel box; its last row sits one
  // bezel row above the indicator groove
  const B = bandRows(cy, s);
  const vx0 = Math.round(cx - VISOR.hw * s), vx1 = Math.round(cx + VISOR.hw * s);
  const vy0 = B.top, vy1 = B.bottom + 1;
  const W = Math.min(VW - 2, vx1 - vx0), H = Math.min(VH - 2, vy1 - vy0);
  const rc = Math.max(1, VISOR.rc * s);
  for (let j = -1; j <= H; j++) {
    for (let i = -1; i <= W; i++) {
      let inside = 0;
      if (i >= 0 && j >= 0 && i < W && j < H) {
        const ex = W / 2 - Math.abs(i + 0.5 - W / 2), ey = H / 2 - Math.abs(j + 0.5 - H / 2);
        inside = ex + ey >= rc ? 1 : 0;
      }
      VMASK[(j + 1) * VW + i + 1] = inside;
    }
  }
  const inV = (i, j) => i >= 0 && j >= 0 && i < W && j < H && VMASK[(j + 1) * VW + i + 1] === 1;
  // ---- glass, the static sheen, and the recess: a shadowed top/left wall; at close-up a lit lower lip
  const sw = tr === 2 ? 2 : 1;
  const sc = tr === 0 ? 1 : Math.max(2, Math.round(W * 0.09)); // the wide: in the corner, clear of the slit
  for (let j = -1; j <= H; j++) {
    for (let i = -1; i <= W; i++) {
      const x = vx0 + i, y = vy0 + j;
      if (inV(i, j)) {
        const d = i + j - sc;
        const c = d >= 0 && d < sw && j < H * 0.7 && i < W * 0.2 ? sheen : black;
        buf.plot(x, y, c, 1);
      } else if (tr >= 1) {
        if (inV(i + 1, j) || inV(i, j + 1)) buf.plot(x, y, dark, 1);
        else if (tr === 2 && j === H && inV(i, j - 1) && i < W * 0.24) buf.plot(x, y, lip, 1); // the lit end of the lower lip, clear of the indicator
      }
    }
  }
  // ---- the indicator groove: a 1 px recess across the bezel under the band (medium and close-up)
  if (tr >= 1) {
    const gy = B.groove;
    const ga = vx0 + Math.ceil(rc), gb = vx0 + W - 1 - Math.ceil(rc);
    for (let x = ga; x <= gb; x++) buf.plot(x, gy, sheen, 1);
  }
  // ---- eyes: two slits; a look shifts them 1 px; processing = 1 px; the blink is a dim
  const lx = f.lookX || 0, ly = f.lookY || 0;
  const shx = lx > 0.45 ? 1 : lx < -0.45 ? -1 : 0;
  const shy = tr > 0 ? (ly > 0.5 ? 1 : ly < -0.5 ? -1 : 0) : 0;
  const ew = eyeWidth(s);
  const processing = f.processing ?? ((f.lid || 0) > 0.12 && (f.squint || 0) > 0.05 && (f.smile || 0) < 0.3);
  const eh = processing ? 1 : eyeHeight(s);
  const dim = (f.blink || 0) > 0.75;
  const top = decal(dim ? P.fog : tr === 2 ? P.white : P.silver), body = decal(dim ? P.fog : P.silver);
  const ey = clamp(B.eye + shy, vy0 + 1, vy0 + H - eh - (tr ? 0 : 1));
  for (const side of [-1, 1]) {
    const ex = Math.round(cx + side * EYE.x * s - ew / 2) + shx;
    for (let r = 0; r < eh; r++) for (let i = 0; i < ew; i++) buf.plot(ex + i, ey + r, eh === 2 && r === 0 ? top : body, 1);
  }
  // ---- speech indicator: one centred line in the groove
  const w = indicatorWidth(f, s, L);
  const rest = IND.rest;
  const ix = Math.round(cx) - (w >> 1);
  const silver = decal(rest ? P.steel : P.silver), end = decal(P.fog);
  for (let i = 0; i < w; i++) buf.plot(ix + i, B.groove, w >= 5 && (i === 0 || i === w - 1) ? end : silver, 1);
}

/** Slit width in px: ~12 % of the housing's width; 3 px in the wide (the bible's 3 x 1 slit). */
export function eyeWidth(s) {
  return Math.max(3, Math.round(EYE.share * 2 * CASE.hw * s));
}

/** Slit height in px: 2 at close-up (s ≥ 2.2) and in larger mediums, 1 in the wide. */
export function eyeHeight(s) {
  return s >= 1.8 ? 2 : 1;
}

// ---------------------------------------------------------------------------
// The speech indicator: envelope → odd width, quantised in time and rate-limited

export const INDICATOR = {
  attack: 0.03, // s
  release: 0.12, // s
  step: 1 / 120, // envelope integration step (s)
  lookBack: 0.6, // s of history the envelope needs (release weight e^-5 after 0.6 s)
  silence: 0.2, // s of silence before it rests (1 px, P.steel)
  thresh: 0.04, // raw level counted as voice
  full: 0.72, // envelope level that gives the full width
  maxStep: 4, // px per update
  restDwell: 2, // updates: a rest lasts at least two (≥ 166 ms at 12/s), never on and off within 120 ms
  window: 24, // updates the pure path solves back at most (bounded cost on a cold start)
};
/** Update rate (per second) and maximum width (px, odd) by framing scale. */
export function indicatorSpec(s) {
  return s < 1.35 ? { rate: 8, max: 5 } : s < 2.2 ? { rate: 12, max: 9 } : { rate: 12, max: 13 };
}
const clsOf = (s) => (s < 1.35 ? 0 : s < 2.2 ? 1 : 2);

const IND = { rest: false };
const A_ATT = 1 - Math.exp(-INDICATOR.step / INDICATOR.attack);
const A_REL = 1 - Math.exp(-INDICATOR.step / INDICATOR.release);

/** Envelope (0..1) of a built speech timeline at time t: one-pole attack/release over the look-back window. */
export function envelopeAt(src, t) {
  const n = Math.round(INDICATOR.lookBack / INDICATOR.step);
  let e = 0;
  for (let i = n; i >= 0; i--) {
    const fr = sampleSpeech(src, t - i * INDICATOR.step);
    const v = fr.speaking ? fr.level : 0;
    e += (v - e) * (v > e ? A_ATT : A_REL);
  }
  return e;
}

/** True when a built timeline has had no voice for INDICATOR.silence seconds before t. */
export function silentAt(src, t) {
  for (let dt = 0; dt <= INDICATOR.silence + 1e-9; dt += 0.02) {
    const fr = sampleSpeech(src, t - dt);
    if (fr.speaking && fr.level > INDICATOR.thresh) return false;
  }
  return true;
}

/** Target width (odd px) for an envelope value at a framing scale. */
export function targetWidth(env, max) {
  const half = Math.round(clamp(env / INDICATOR.full, 0, 1) * ((max - 1) >> 1));
  return 1 + 2 * half;
}

// ---- the indicator state machine, shared by both paths. Per tick: the width steps toward its target
// (1 once the voice has been silent for 200 ms) by at most 4 px; a rest (steel, 1 px) begins on a
// silent tick at 1 px and lasts at least INDICATOR.restDwell ticks even if the voice returns.
// State id = ((w - 1) / 2) * 3 + r, r = 0 active, 1 resting for 1 tick, 2 resting for 2+ ticks.
const stateId = (w, r) => ((w - 1) >> 1) * 3 + r;
function stepState(id, target, silent) {
  const r = id % 3;
  const w = 2 * ((id - r) / 3) + 1;
  let w2 = clamp(target, w - INDICATOR.maxStep, w + INDICATOR.maxStep);
  let r2 = 0;
  if (r > 0) {
    if (silent || r < INDICATOR.restDwell) {
      r2 = r + 1 > 2 ? 2 : r + 1;
      w2 = 1;
    }
  } else if (silent && w2 === 1) r2 = 1;
  return stateId(w2, r2);
}

// ---- pure path: per source and scale class, ring buffers of tick → target / silence / state (reused)
const RING = 256;
const idx = (n) => ((n % RING) + RING) % RING;
function newCache() {
  return { tick: new Int32Array(RING).fill(-2147483648), target: new Int8Array(RING), state: new Int8Array(RING), silent: new Uint8Array(RING) };
}
const CACHES = new WeakMap();

function cacheFor(src, cls) {
  let c = CACHES.get(src);
  if (!c) {
    c = [null, null, null];
    CACHES.set(src, c);
  }
  return (c[cls] ||= newCache());
}

/** Target width at tick n (1 once the voice has been silent for 200 ms) and its silence flag, cached. */
function tickTarget(src, c, n, rate, max) {
  const k = idx(n);
  if (c.tick[k] === n) return c.target[k];
  const t = n / rate;
  const silent = silentAt(src, t);
  c.tick[k] = n;
  c.target[k] = silent ? 1 : targetWidth(envelopeAt(src, t), max);
  c.state[k] = 0; // unknown until the chain is solved
  c.silent[k] = silent ? 1 : 0;
  return c.target[k];
}

/**
 * Indicator state at tick n of a built timeline (exact, pure). The set of states the indicator
 * could be in is propagated forward over a bounded window from "any state"; once it collapses to
 * one state that state is exact whatever came before, and it is cached. Starts from a cached exact
 * state when one lies in the window. Any instant renders the same picture however it is reached.
 */
function stateAtTick(src, n, s) {
  const { rate, max } = indicatorSpec(s);
  const c = cacheFor(src, clsOf(s));
  const k = idx(n);
  if (c.tick[k] === n && c.state[k] > 0) return c.state[k] - 1;
  const lim = n - INDICATOR.window;
  let m = n - 1, id = -1;
  for (; m >= lim; m--) {
    const km = idx(m);
    if (c.tick[km] === m && c.state[km] > 0) {
      id = c.state[km] - 1;
      break;
    }
  }
  let mask, q;
  if (id >= 0) {
    mask = 1 << id;
    q = m + 1;
  } else {
    mask = (1 << stateId(1, 1)) | (1 << stateId(1, 2));
    for (let w = 1; w <= max; w += 2) mask |= 1 << stateId(w, 0);
    q = lim;
  }
  for (; q <= n; q++) {
    const target = tickTarget(src, c, q, rate, max);
    const silent = c.silent[idx(q)] === 1;
    let next = 0;
    for (let j = 0; j < 21; j++) if (mask & (1 << j)) next |= 1 << stepState(j, target, silent);
    mask = next;
    if ((mask & (mask - 1)) === 0) c.state[idx(q)] = 31 - Math.clz32(mask) + 1;
  }
  return 31 - Math.clz32(mask & -mask); // exact unless the voice never let the set collapse: then the quietest
}

/** Indicator width (odd px) at tick n of a built timeline. */
export function widthAtTick(src, n, s) {
  const id = stateAtTick(src, n, s);
  return 2 * ((id - (id % 3)) / 3) + 1;
}

/** Is the indicator at rest (steel, 1 px) at tick n of a built timeline? */
function restAtTick(src, n, s) {
  return stateAtTick(src, n, s) % 3 > 0;
}

// ---- live path: one state per live source and scale class, stepped once per tick
const LIVE = new WeakMap();
function liveState(src, cls) {
  let a = LIVE.get(src);
  if (!a) {
    a = [null, null, null];
    LIVE.set(src, a);
  }
  return (a[cls] ||= { tick: -2147483648, id: stateId(1, 2), voiceAt: -1e9, lastT: -1e9 });
}

/**
 * Live source (the v2 stage's liveSpeech): read only at the solve's own instant f.t (the source
 * returns its current frame there without stepping), never re-sampled at other times. The width
 * follows f.level (speech.js's 30 / 120 ms envelope) once per tick; silence is timed from the last
 * frame with an audible voice.
 */
function liveWidth(f, s, src) {
  const { rate, max } = indicatorSpec(s);
  const st = liveState(src, clsOf(s));
  const t = f.t;
  const fr = src.frame(t);
  const voiced = !!fr.speaking && (fr.level || 0) > INDICATOR.thresh;
  const n = Math.floor(t * rate + 1e-9);
  if (t < st.lastT - 1e-6 || n - st.tick > rate) {
    // a seek back or a long gap (a cut back to this shot): start from rest, nothing to animate from
    st.tick = n - 1;
    st.id = stateId(1, voiced ? 0 : 2);
    st.voiceAt = voiced ? t : -1e9;
  }
  st.lastT = t;
  if (voiced) st.voiceAt = t;
  if (n !== st.tick) {
    const silent = t - st.voiceAt >= INDICATOR.silence;
    const env = Number.isFinite(f.level) ? f.level : fr.env || 0;
    st.id = stepState(st.id, silent ? 1 : targetWidth(env, max), silent);
    st.tick = n;
  }
  const r = st.id % 3;
  IND.rest = r > 0;
  return 2 * ((st.id - r) / 3) + 1;
}

// Fallback state when only f.t / f.level exist (held per tick, per look).
const HOLD = { tick: -1, w: 1, quiet: 0 };

/** Width (odd px) of the indicator for face params f at scale s; sets IND.rest. */
export function indicatorWidth(f, s, L = null) {
  const { max } = indicatorSpec(s);
  const rate = indicatorSpec(s).rate;
  if (f.speech === null && Number.isFinite(f.t)) {
    // a known silent source: at rest
    IND.rest = true;
    return 1;
  }
  if (f.speech && Number.isFinite(f.t)) {
    if (f.speech.live && typeof f.speech.frame === 'function') return liveWidth(f, s, f.speech);
    const n = Math.floor(f.t * rate + 1e-9);
    const w = widthAtTick(f.speech, n, s);
    IND.rest = w === 1 && restAtTick(f.speech, n, s);
    return w;
  }
  const level = Number.isFinite(f.level) ? f.level : clamp((f.open || 0) * 1.1 + (f.jaw || 0) * 0.3, 0, 1);
  if (Number.isFinite(f.t)) {
    const n = Math.floor(f.t * rate + 1e-9);
    if (n !== HOLD.tick) {
      const target = targetWidth(level, max);
      HOLD.w = n === HOLD.tick + 1 ? clamp(target, HOLD.w - INDICATOR.maxStep, HOLD.w + INDICATOR.maxStep) : target;
      HOLD.quiet = level > INDICATOR.thresh ? 0 : HOLD.quiet + (n === HOLD.tick + 1 ? 1 / rate : 1);
      HOLD.tick = n;
    }
    IND.rest = HOLD.w === 1 && HOLD.quiet >= INDICATOR.silence;
    return HOLD.w;
  }
  IND.rest = level <= INDICATOR.thresh && !f.speaking;
  return targetWidth(level, max);
}

/** Was the last indicatorWidth() call at rest (steel)? (tests, labs) */
export const indicatorAtRest = () => IND.rest;

// ---------------------------------------------------------------------------
// The antenna: a thin static steel rod on the lit side of the crown, and a small static status light on its tip
const LED_TIP = decal(P.magenta), LED_HOT = decal(P.pink);

function drawAntenna(buf, L, m, head, s) {
  headOffset(head, OFF);
  const cx = head.cx + OFF[0], cy = head.cy + OFF[1];
  const ax = -5.6;
  const baseY = CASE.top + 1.2; // the root hides behind the crown (drawn behind the head)
  const rw = s >= 4 ? 2 : 1;
  const rx = Math.round(cx + ax * s - rw / 2);
  const yTop = Math.round(cy + (CASE.top - 2.7) * s), yBase = Math.round(cy + baseY * s);
  for (let y = yTop; y < yBase; y++) for (let i = 0; i < rw; i++) buf.plot(rx + i, y, m.rod, rw >= 2 && i === 0 ? 0 : 1);
  // owner 3 Oct (polish round): a small status light at the tip, COSMOS's magenta, its warm-white heart at
  // close-ups (static: a light that is on, not a blinker)
  const lw = s >= 2.2 ? rw + 1 : rw;
  const lx = rx - (lw > rw ? 1 : 0), ly = yTop - lw;
  for (let j = 0; j < lw; j++) for (let i = 0; i < lw; i++) buf.plot(lx + i, ly + j, LED_TIP, 1);
  if (s >= 3) buf.plot(lx, ly, LED_HOT, 1);
  // a low machined boss where the rod leaves the housing (medium and close-up)
  if (s >= 1.35) {
    const cw = rw + 2, ch = Math.max(1, Math.round(0.45 * s));
    const cx0 = rx - 1;
    const cy0 = Math.round(cy + CASE.top * s) - ch;
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) buf.plot(cx0 + i, cy0 + j, m.rod, i === cw - 1 ? 2 : 1);
  }
}
