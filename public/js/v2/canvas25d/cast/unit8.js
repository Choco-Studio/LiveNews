// UNIT-8 (owner: PRESENTERS B stream). The robot co-host of COSMOS DESK:
// "an instrument, not a toy" (docs/programmes/cosmos.md, UNIT-8 table).
//   head    a machined steel housing, wider than tall (a sensor head, not a
//           helmet): flat front plate, bevelled edges lit from camera-left
//           (a 1 px specular on the upper-left bevel, the lower-right bevels
//           in shade) and a 1 px silver rim; a crown seam and a chin seam with
//           four flush fasteners at close-up; flush side sensor modules with
//           vent slots instead of "ears"; a recessed P.black visor with a static
//           2 px P.slate sheen. No mouth shape, no lights, no cyan.
//   eyes    two P.silver slits (a P.white top row at close-up), each ~12 % of the
//           housing's width, 2 px tall at close-up, 1 px in the wide, no pupils;
//           'processing' = 1 px; a look shifts the slits (and the head) 1 px.
//           Instead of blinking: a dim to P.fog for ~80 ms (persona blink 7-12 s).
//   speech  ONE centred horizontal line: odd width 1-13 px (1-5 in the wide),
//           following the voice envelope (30 ms attack, 120 ms release),
//           redrawn at most 12 times per second (8 in the wide) and changing
//           by at most 4 px per update; P.fog end pixels once ≥ 5 px; rests at
//           1 px in P.steel after 200 ms of silence.
//   body    a static steel antenna rod with no light; a graphite shell with a plain
//           chest plate and its 1 px silver seam (cast/wardrobe-b.js 'chassis');
//           robot hands (handStyle 'robot', drawn by HANDS).
// Motion: low sway, eased, no overshoot. The housing never rolls (a gimbal keeps
// it level): yaw and pitch move the head as whole 1 px steps, so a rigid object
// never "boils" on the pixel grid.
//
// The indicator is a pure function of time. With f.t and f.speech (the speech
// source FACES puts on the face params) it re-samples the speech timeline and
// quantises updates exactly; with only f.t and f.level it holds each update per
// tick; with neither it follows the mouth opening (f.open).
import { P } from '../../../palette.js';
import { decal, material } from '../pixbuf.js';
import { clamp } from '../space.js';
import { sampleSpeech } from '../speech.js';
import { GROUPS } from '../character.js';
import { defineLook } from './base.js';
import { LOOK, tier } from './wardrobe-b.js';

// Head-local design (units; 1 u = 1 px in the wide). Wide: housing 18 x 15, visor 13 x 8.
// About a human head's area but wider than tall: it reads as a sensor housing, never a big-headed mascot.
// The outline is a box with 45° chamfers (small on the crown, larger toward the chin): machined, not rounded.
export const CASE = { hw: 9.0, top: -7.6, bot: 7.2, taper: 0.1, chamferTop: 1.7, chamferBot: 2.6 };
export const VISOR = { hw: 6.1, top: -3.35, bot: 3.65, rc: 1.0, taper: 0.07 };
export const MODULE = { y0: -2.9, y1: 2.6, out: 1.05, inset: 0.8, r: 0.55 }; // flush side sensor modules
export const SEAM = { crown: -5.35, chin: 5.45 };
export const EYE = { x: 3.4, y: -0.85, share: 0.12 };
export const IND_Y = 2.05;

export const unit8 = defineLook({
  id: 'unit8',
  name: 'UNIT-8',
  head: { top: CASE.top, craniumY: -2, R: CASE.hw, cheekY: 2, cheekHW: CASE.hw, chinY: CASE.bot, chinHW: 8.4, jawPow: 4 },
  headAt: [0, -12.5],
  neck: { hw: 2.15 }, // a slim machined column: the head reads as a mounted instrument
  // face proportions other modules may read (glassesAnchor, framing); the face itself is drawn here
  eyes: { y: EYE.y, x: EYE.x, w: 2.2, h: 0.6, iris: [P.silver, P.silver], lash: P.silver, lashes: false, bags: false },
  brows: { y: -3.5, len: 2, thick: 0.3, color: P.steel, arch: 0 },
  nose: { y0: 0, y1: 1, w: 1, big: false },
  mouth: { y: IND_Y, w: 3, lip: P.steel, lipHi: P.steel, upper: P.steel, inner: P.black, teeth: P.steel, tongue: P.steel },
  ears: { y: 0, h: 2, w: 1 },
  skin: [P.fog, P.steel, P.slate, P.ink], // neck column (and hands where robot hands are not drawn)
  skinLine: P.black,
  hair: { style: 'none', ramp: [P.silver, P.steel, P.slate, P.ink], line: P.ink },
  torso: { neckHW: 3.4, shoulderTop: 2.4, shoulderHW: 20.2, sideHW: 18.8, bottom: 46, vDepth: 20, shoulderJoint: [17.4, 6.8] },
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
    // the turned-away bevels in steel / slate; light enough that the head (visor included) clears the
    // COSMOS head zone by 20 L* (cosmos.md §5 item 8), while the body stays a step darker (graphite)
    // (its 1 px silver rim is painted by drawCasing: continuous along the crown and the upper right side only)
    casing: { ramp: [P.silver, P.fog, P.steel, P.slate], line: P.ink },
    module: { ramp: [P.fog, P.steel, P.slate, P.ink], line: P.ink },
    joint: { ramp: [P.slate, P.ink, P.black, P.black], line: P.black },
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
// Head: side modules, then the housing

function drawModules(buf, m, cx, cy, s, tr) {
  const vents = tr === 2 ? 3 : tr === 1 ? 2 : 0;
  for (const side of [-1, 1]) {
    const yc = (MODULE.y0 + MODULE.y1) / 2, hh = (MODULE.y1 - MODULE.y0) / 2;
    const xa = caseHW(yc) - MODULE.inset, xb = caseHW(yc) + MODULE.out;
    const xc = side * (xa + xb) / 2, hw = (xb - xa) / 2;
    const r = MODULE.r;
    const lit = side < 0;
    buf.shape(cx + (xc - hw) * s - 1, cy + MODULE.y0 * s - 1, cx + (xc + hw) * s + 1, cy + MODULE.y1 * s + 1, m.module, (px, py) => {
      const x = (px - cx) / s - xc, y = (py - cy) / s - yc;
      const dx = Math.max(0, Math.abs(x) - (hw - r)), dy = Math.max(0, Math.abs(y) - (hh - r));
      if (dx * dx + dy * dy > r * r) return -1;
      // the outer face turns away; the top edge catches the key
      const outer = x * side > hw - 0.45;
      let t = lit ? 1 : 2;
      if (y < -hh + 0.5 / s + 0.35) t = lit ? 0 : 1;
      if (outer) t = lit ? 2 : 3;
      if (y > hh - 0.6) t = Math.max(t, lit ? 2 : 3);
      // vent slots (1 px, dark), evenly over the module's middle
      if (vents && !outer) {
        for (let k = 0; k < vents; k++) {
          const vy = -hh * 0.5 + (k * hh) / Math.max(1, vents - 1);
          if (Math.abs(y - vy) < 0.5 / s) return 3;
        }
      }
      return t;
    });
  }
}

function drawCasing(buf, L, m, head, s) {
  headOffset(head, OFF);
  const cx = head.cx + OFF[0], cy = head.cy + OFF[1];
  const tr = tier(s);
  buf.part(head.gb + LOOK + 8, 9, false);
  drawModules(buf, m, cx, cy, s, tr);
  buf.part(head.gb + GROUPS.head, 10, false);
  const x0 = Math.floor(cx - (CASE.hw + 1) * s), x1 = Math.ceil(cx + (CASE.hw + 1) * s);
  const y0 = Math.floor(cy + (CASE.top - 1) * s), y1 = Math.ceil(cy + (CASE.bot + 1) * s);
  const px1 = 1 / s;
  const bev = Math.max(1, Math.round(0.95 * s)) * px1; // bevel width (units): 1 px wide, ~3 px at close-up
  const seams = tr >= 1;
  const screws = tr === 2 && s >= 2.6;
  const scY = SEAM.crown - 1.15, scY2 = SEAM.chin + 1.05;
  // the housing: a machined box with 45° chamfered corners (small on the crown, larger toward the
  // chin, where the sides draw in), never a rounded TV shape; first-order distance to the outline and
  // the face it belongs to give the bevel's normal
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
      if ((dc > -0.5 * px1 && dc <= 0.5 * px1) || (dn > -0.5 * px1 && dn <= 0.5 * px1 && au < 0.86)) return tr === 2 ? 3 : 2;
      if (tr === 2 && t === 1 && u < -0.25 && ((dc > 0.5 * px1 && dc <= 1.5 * px1) || (dn > 0.5 * px1 && dn <= 1.5 * px1 && au < 0.8))) return 0;
    }
    return t;
  });
  // the 1 px silver rim: every column's top pixel across the crown, then the right side down to the
  // widest point (the resolve rim would leave a dotted stair on the rounded corners)
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
  if (screws) {
    // four flush fasteners (decals: the speckle clean-up would erase a 1 px tone): a dark centre and,
    // from s 3.2, a lit edge toward the key
    const dk = decal(P.slate), hi = decal(P.silver);
    for (let k = 0; k < 4; k++) {
      const sy = k < 2 ? scY : scY2;
      const sx = (k & 1 ? 1 : -1) * (k < 2 ? caseHW(sy) - 2.7 : caseHW(sy) * 0.6);
      const qx = Math.round(cx + sx * s - 0.5), qy = Math.round(cy + sy * s - 0.5);
      buf.paint(qx, qy, dk, 1, g);
      if (s >= 3.2) buf.paint(qx - 1, qy - 1, hi, 1, g);
    }
  }
}

const rimDecal = () => material('cast-b:rim', { ramp: [P.silver], line: P.ink, decal: true });

// ---------------------------------------------------------------------------
// Face: visor, slits, speech indicator

const VW = 200, VH = 140;
const VMASK = new Uint8Array(VW * VH); // visor mask for the bezel pass (no per-frame allocation)

function drawVisor(buf, L, head, f, s) {
  headOffset(head, OFF);
  const cx = head.cx + OFF[0], cy = head.cy + OFF[1];
  const tr = tier(s);
  const black = decal(P.black), sheen = decal(P.slate), dark = decal(P.ink), lip = decal(P.fog);
  // ---- visor mask (rounded rectangle, drawn in a touch toward the chin) in its pixel box
  const vx0 = Math.round(cx - VISOR.hw * s), vx1 = Math.round(cx + VISOR.hw * s);
  const vy0 = Math.round(cy + VISOR.top * s), vy1 = Math.round(cy + VISOR.bot * s);
  const W = Math.min(VW - 2, vx1 - vx0), H = Math.min(VH - 2, vy1 - vy0);
  const rc = Math.max(1, VISOR.rc * s);
  for (let j = -1; j <= H; j++) {
    for (let i = -1; i <= W; i++) {
      let inside = 0;
      if (i >= 0 && j >= 0 && i < W && j < H) {
        const hwj = (W / 2) * (1 - VISOR.taper * Math.max(0, (j + 0.5) / H - 0.35) / 0.65);
        if (Math.abs(i + 0.5 - W / 2) > hwj) {
          VMASK[(j + 1) * VW + i + 1] = 0;
          continue;
        }
        // chamfered corners (45°), like the housing: a machined window, not a rounded screen
        const ex = hwj - Math.abs(i + 0.5 - W / 2), ey = H / 2 - Math.abs(j + 0.5 - H / 2);
        inside = ex + ey >= rc ? 1 : 0;
      }
      VMASK[(j + 1) * VW + i + 1] = inside;
    }
  }
  const inV = (i, j) => i >= 0 && j >= 0 && i < W && j < H && VMASK[(j + 1) * VW + i + 1] === 1;
  // ---- glass, the static sheen, and the recess: a shadowed top/left wall; at close-up a lit lower lip
  const sw = tr === 2 ? 2 : 1;
  const sc = Math.round(W * 0.16);
  for (let j = -1; j <= H; j++) {
    for (let i = -1; i <= W; i++) {
      const x = vx0 + i, y = vy0 + j;
      if (inV(i, j)) {
        const d = i + j - sc;
        const c = d >= 0 && d < sw && j < H * 0.42 && i < W * 0.38 ? sheen : black;
        buf.plot(x, y, c, 1);
      } else if (tr >= 1) {
        if (inV(i + 1, j) || inV(i, j + 1)) buf.plot(x, y, dark, 1);
        else if (tr === 2 && (inV(i - 1, j) || inV(i, j - 1))) buf.plot(x, y, lip, 1);
      }
    }
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
  const ey = Math.round(cy + EYE.y * s - eh / 2) + shy;
  for (const side of [-1, 1]) {
    const ex = Math.round(cx + side * EYE.x * s - ew / 2) + shx;
    for (let r = 0; r < eh; r++) for (let i = 0; i < ew; i++) buf.plot(ex + i, ey + r, eh === 2 && r === 0 ? top : body, 1);
  }
  // ---- speech indicator: one centred line
  const w = indicatorWidth(f, s, L);
  const rest = IND.rest;
  const iy = Math.round(cy + IND_Y * s);
  const ix = Math.round(cx) - (w >> 1);
  const silver = decal(rest ? P.steel : P.silver), end = decal(P.fog);
  for (let i = 0; i < w; i++) buf.plot(ix + i, iy, w >= 5 && (i === 0 || i === w - 1) ? end : silver, 1);
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
};
/** Update rate (per second) and maximum width (px, odd) by framing scale. */
export function indicatorSpec(s) {
  return s < 1.35 ? { rate: 8, max: 5 } : s < 2.2 ? { rate: 12, max: 9 } : { rate: 12, max: 13 };
}

const IND = { rest: false };
const A_ATT = 1 - Math.exp(-INDICATOR.step / INDICATOR.attack);
const A_REL = 1 - Math.exp(-INDICATOR.step / INDICATOR.release);

/** Envelope (0..1) of a speech source at time t: one-pole attack/release over the look-back window. */
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

/** True when the source has had no voice for INDICATOR.silence seconds before t. */
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

// Per source and scale class: ring buffers of tick → target / width (typed arrays, reused).
const RING = 256;
function newCache() {
  return { tick: new Int32Array(RING).fill(-2147483648), target: new Int8Array(RING), width: new Int8Array(RING), rest: new Uint8Array(RING) };
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

function tickTarget(src, c, n, rate, max) {
  const k = ((n % RING) + RING) % RING;
  if (c.tick[k] === n) return c.target[k];
  const t = n / rate;
  const target = targetWidth(envelopeAt(src, t), max);
  c.tick[k] = n;
  c.target[k] = target;
  c.width[k] = 0; // unknown until the chain is solved
  c.rest[k] = silentAt(src, t) ? 1 : 0;
  return target;
}

/**
 * Indicator width at tick n (exact, pure): the rate-limited chain is solved forward from the
 * latest tick whose state is certain (a target of 1 after targets that leave no room for a
 * larger width), so any instant renders the same picture however it is reached.
 */
export function widthAtTick(src, n, s) {
  const { rate, max } = indicatorSpec(s);
  const cls = s < 1.35 ? 0 : s < 2.2 ? 1 : 2;
  const c = cacheFor(src, cls);
  const k = ((n % RING) + RING) % RING;
  if (c.tick[k] === n && c.width[k] > 0) return c.width[k];
  const steps = Math.ceil((max - 1) / INDICATOR.maxStep);
  // find an anchor: target(m - j) ≤ 1 + 4 j for j = 0..steps  ⇒  width(m) = 1 for any earlier state
  let m = n, found = false;
  for (; m > n - 120; m--) {
    const km = ((m % RING) + RING) % RING;
    if (c.tick[km] === m && c.width[km] > 0 && m < n) {
      found = true;
      break;
    }
    let ok = true;
    for (let j = 0; j <= steps && ok; j++) ok = tickTarget(src, c, m - j, rate, max) <= 1 + INDICATOR.maxStep * j;
    if (ok) {
      const km2 = ((m % RING) + RING) % RING;
      c.width[km2] = 1;
      found = true;
      break;
    }
  }
  if (!found) {
    const km = ((m % RING) + RING) % RING;
    tickTarget(src, c, m, rate, max);
    c.width[km] = 1;
  }
  let w = c.width[((m % RING) + RING) % RING];
  for (let q = m + 1; q <= n; q++) {
    const target = tickTarget(src, c, q, rate, max);
    w = clamp(target, w - INDICATOR.maxStep, w + INDICATOR.maxStep);
    c.width[((q % RING) + RING) % RING] = w;
  }
  return w;
}

/** Is the indicator at rest (steel, 1 px) at tick n? */
function restAtTick(src, n, s) {
  const cls = s < 1.35 ? 0 : s < 2.2 ? 1 : 2;
  const c = cacheFor(src, cls);
  const k = ((n % RING) + RING) % RING;
  return c.tick[k] === n && c.rest[k] === 1;
}

// Fallback state when only f.t / f.level exist (held per tick, per look).
const HOLD = { tick: -1, w: 1, quiet: 0 };

/** Width (odd px) of the indicator for face params f at scale s; sets IND.rest. */
export function indicatorWidth(f, s, L = null) {
  const { rate, max } = indicatorSpec(s);
  if (f.speech === null && Number.isFinite(f.t)) {
    // a known silent source: at rest
    IND.rest = true;
    return 1;
  }
  if (f.speech && Number.isFinite(f.t)) {
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

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// The antenna: a static steel rod on the lit side of the crown, no light, no ball

function drawAntenna(buf, L, m, head, s) {
  headOffset(head, OFF);
  const cx = head.cx + OFF[0], cy = head.cy + OFF[1];
  const ax = -5.4;
  const baseY = CASE.top + 1.4; // the root hides behind the crown (drawn behind the head)
  const rw = Math.max(1, Math.round(0.5 * s));
  const rx = Math.round(cx + ax * s - rw / 2);
  const yTop = Math.round(cy + (CASE.top - 3.8) * s), yBase = Math.round(cy + baseY * s);
  for (let y = yTop; y < yBase; y++) for (let i = 0; i < rw; i++) buf.plot(rx + i, y, m.rod, rw >= 2 && i === 0 ? 0 : rw >= 3 && i === rw - 1 ? 2 : 1);
  // a machined collar where the rod leaves the housing, and a flat end cap at close-up
  const cw = Math.max(rw + 2, Math.round(1.6 * s)), ch = Math.max(1, Math.round(0.7 * s));
  const cx0 = Math.round(cx + ax * s - cw / 2);
  const cy0 = Math.round(cy + CASE.top * s) - ch;
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) buf.plot(cx0 + i, cy0 + j, m.rod, j === 0 && i < cw - 1 ? 0 : i === cw - 1 ? 2 : 1);
  if (s >= 1.8) {
    const tw = rw + 2;
    const tx = Math.round(cx + ax * s - tw / 2);
    for (let i = 0; i < tw; i++) buf.plot(tx + i, yTop - 1, m.rod, i === 0 ? 0 : 2);
  }
}
