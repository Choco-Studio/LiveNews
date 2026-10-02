// UNIT-8 (owner: PRESENTERS B stream). The robot co-host of COSMOS DESK:
// "an instrument, not a toy" (docs/programmes/cosmos.md, UNIT-8 table).
//   head    a brushed-steel casing, wider than tall, lit from camera-left with a
//           1 px silver rim; a recessed P.black visor with a static 2 px P.slate
//           sheen; a chin seam (close-ups). No mouth shape, no lights, no cyan.
//   eyes    two P.silver slits (a P.white top row at close-up), each ~12 % of the
//           head's width, 2 px tall at close-up, 1 px in the wide, no pupils;
//           'processing' = 1 px; a look shifts the slits (and the head) 1 px.
//           Instead of blinking: a dim to P.fog for ~80 ms (persona blink 7-12 s).
//   speech  ONE centred horizontal line: odd width 1-13 px (1-5 in the wide),
//           following the voice envelope (30 ms attack, 120 ms release),
//           redrawn at most 12 times per second (8 in the wide) and changing
//           by at most 4 px per update; P.fog end pixels once ≥ 5 px; rests at
//           1 px in P.steel after 200 ms of silence.
//   body    a static steel antenna rod with no light; a casing shell with a plain
//           chest plate and its 1 px silver seam (cast/wardrobe-b.js 'chassis');
//           robot hands (handStyle 'robot', drawn by HANDS).
// Motion: low sway, eased, no overshoot. The casing never rolls (a gimbal keeps
// it level): yaw and pitch move the head as whole 1 px steps, so a rigid object
// never "boils" on the pixel grid.
//
// The indicator is a pure function of time. With f.t and f.speech (the speech
// source, requested from FACES in CONTRACTS) it re-samples the speech timeline
// and quantises updates exactly; with only f.t and f.level it holds each
// update per tick; with neither it follows the mouth opening (f.open).
import { P } from '../../../palette.js';
import { decal } from '../pixbuf.js';
import { clamp } from '../space.js';
import { sampleSpeech } from '../speech.js';
import { GROUPS } from '../character.js';
import { defineLook } from './base.js';
import { LOOK, tier } from './wardrobe-b.js';

// Head-local design (units; 1 u = 1 px in the wide). Wide: head 21 x 18, visor 15 x 10.
export const CASE = { hw: 10.4, top: -9.2, bot: 8.8, nTop: 3.6, nBot: 3.0, taper: 0.2 };
export const VISOR = { hw: 7.4, top: -4.6, bot: 4.9, rc: 1.9, taper: 0.1 };
export const POD = { y: 0.2, h: 3.4, w: 0.9 }; // flush side plates (they make it a head, not a box)
export const EYE = { x: 4.1, y: -1.2, share: 0.12 };
export const IND_Y = 2.7;

export const unit8 = defineLook({
  id: 'unit8',
  name: 'UNIT-8',
  head: { top: CASE.top, craniumY: -2, R: CASE.hw, cheekY: 2, cheekHW: CASE.hw, chinY: CASE.bot, chinHW: 8.6, jawPow: 4 },
  headAt: [0, -14.0],
  neck: { hw: 2.7 },
  // face proportions other modules may read (glassesAnchor, framing); the face itself is drawn here
  eyes: { y: EYE.y, x: EYE.x, w: 2.5, h: 0.6, iris: [P.silver, P.silver], lash: P.silver, lashes: false, bags: false },
  brows: { y: -3.5, len: 2, thick: 0.3, color: P.steel, arch: 0 },
  nose: { y0: 0, y1: 1, w: 1, big: false },
  mouth: { y: IND_Y, w: 3, lip: P.steel, lipHi: P.steel, upper: P.steel, inner: P.black, teeth: P.steel, tongue: P.steel },
  ears: { y: 0, h: 2, w: 1 },
  skin: [P.fog, P.steel, P.slate, P.ink], // neck column (and hands until HANDS' robot hands land)
  skinLine: P.black,
  hair: { style: 'none', ramp: [P.silver, P.steel, P.slate, P.ink], line: P.ink },
  torso: { neckHW: 3.4, shoulderTop: 2.4, shoulderHW: 20.2, sideHW: 18.8, bottom: 46, vDepth: 20, shoulderJoint: [17.4, 6.8] },
  outfit: 'chassis',
  jacket: { ramp: [P.steel, P.slate, P.ink, P.black], line: P.black }, // graphite shell, darker than the head
  shirt: { ramp: [P.steel, P.slate, P.ink, P.black], line: P.black },
  cuff: P.slate,
  arm: { upper: 22.4, fore: 20.6, rUpper: 3.3, rElbow: 2.9, rWrist: 2.3, hand: 10.8 },
  handStyle: 'robot',
  // low sway, small head motion, rare "blinks" (drawn as a dim); breath / doubleBlink are hints for idle.js
  persona: { sway: 0.25, headMotion: 0.35, blinkMin: 7, blinkMax: 12, energy: 0.35, smile: 0, breath: 0.15, doubleBlink: 0 },
  mats: {
    casing: { ramp: [P.fog, P.steel, P.slate, P.ink], line: P.ink, rim: P.silver, rimTop: true },
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

/** Half-width of the casing at head-local y (units): straight sides that draw in toward the chin. */
function caseHW(y) {
  const k = Math.max(0, y) / CASE.bot;
  return CASE.hw * (1 - CASE.taper * k * k);
}

// ---------------------------------------------------------------------------
// Head: the casing

function drawCasing(buf, L, m, head, s) {
  headOffset(head, OFF);
  const cx = head.cx + OFF[0], cy = head.cy + OFF[1];
  const tr = tier(s);
  // side pods first, one group behind the casing (the casing edge draws a 1 px line over them)
  buf.part(head.gb + LOOK + 8, 9, false);
  for (const side of [-1, 1]) {
    const px = cx + side * (caseHW(POD.y) - 0.15) * s, py = cy + POD.y * s;
    buf.shape(px - POD.w * s - 1, py - POD.h * s - 1, px + POD.w * s + 1, py + POD.h * s + 1, m.joint, (qx, qy) => {
      const u = (qx - px) / (POD.w * s), v = (qy - py) / (POD.h * s);
      if (u ** 4 + v ** 4 > 1) return -1;
      return side < 0 ? (v < -0.5 ? 0 : 1) : v < -0.5 ? 1 : 2;
    });
  }
  buf.part(head.gb + GROUPS.head, 10, false);
  const x0 = Math.floor(cx - (CASE.hw + 1) * s), x1 = Math.ceil(cx + (CASE.hw + 1) * s);
  const y0 = Math.floor(cy + (CASE.top - 1) * s), y1 = Math.ceil(cy + (CASE.bot + 1) * s);
  const seamY = 6.5;
  const px1 = 1 / s;
  buf.shape(x0, y0, x1, y1, m.casing, (px, py) => {
    const x = (px - cx) / s, y = (py - cy) / s;
    const a = caseHW(y);
    const b = y < 0 ? -CASE.top : CASE.bot;
    const n = y < 0 ? CASE.nTop : CASE.nBot;
    const u = x / a, v = y / b;
    const au = u < 0 ? -u : u, av = v < 0 ? -v : v;
    if (au ** n + av ** n > 1) return -1;
    // a gently domed face plate: lit along the left and the crown, shaded right and underneath
    const l = -0.62 * u - 0.55 * v;
    let t = l > 0.5 ? 0 : l > -0.42 ? 1 : l > -0.7 ? 2 : 3;
    if (v < -0.84 && u < 0.5) t = 0;
    if (v > 0.84) t = Math.max(t, 2);
    if (tr === 2) {
      // the chin seam: a lower plate under the visor, its lit lip just below
      if (Math.abs(y - seamY) < px1 * 0.5 && au < 0.8) t = 3;
      else if (y > seamY && y - seamY < px1 * 1.5 && au < 0.76 && u < 0.3) t = Math.min(t, 0);
    }
    return t;
  });
}

// ---------------------------------------------------------------------------
// Face: visor, slits, speech indicator

const VW = 200, VH = 140;
const VMASK = new Uint8Array(VW * VH); // visor mask for the bezel pass (no per-frame allocation)

function drawVisor(buf, L, head, f, s) {
  headOffset(head, OFF);
  const cx = head.cx + OFF[0], cy = head.cy + OFF[1];
  const tr = tier(s);
  const black = decal(P.black), sheen = decal(P.slate), dark = decal(P.ink), lip = decal(P.fog);
  // ---- visor mask (rounded rectangle) in its pixel box
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
        const dx = Math.max(0, Math.abs(i + 0.5 - W / 2) - (hwj - rc));
        const dy = Math.max(0, Math.abs(j + 0.5 - H / 2) - (H / 2 - rc));
        inside = dx * dx + dy * dy <= rc * rc ? 1 : 0;
      }
      VMASK[(j + 1) * VW + i + 1] = inside;
    }
  }
  const inV = (i, j) => i >= 0 && j >= 0 && i < W && j < H && VMASK[(j + 1) * VW + i + 1] === 1;
  // ---- glass, the static sheen, and at close-up the recess (shadowed top/left wall, lit lower lip)
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

/** Slit width in px: ~12 % of the casing's width, at least 2. */
export function eyeWidth(s) {
  return Math.max(2, Math.round(EYE.share * 2 * CASE.hw * s));
}

/** Slit height in px: 2 at close-up (s ≥ 2.2) and in larger mediums, 1 in the wide. */
export function eyeHeight(s) {
  return s >= 2.2 ? 2 : s >= 1.8 ? 2 : 1;
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
// The antenna: a static steel rod on the lit side, no light

function drawAntenna(buf, L, m, head, s) {
  headOffset(head, OFF);
  const cx = head.cx + OFF[0], cy = head.cy + OFF[1];
  const ax = -5.9;
  const topY = CASE.top + 1.6; // the base hides behind the crown (drawn behind the head)
  const rw = Math.max(1, Math.round(0.55 * s));
  const rx = Math.round(cx + ax * s - rw / 2);
  const yTop = Math.round(cy + (topY - 6.6) * s), yBase = Math.round(cy + topY * s);
  for (let y = yTop; y < yBase; y++) for (let i = 0; i < rw; i++) buf.plot(rx + i, y, m.rod, rw >= 2 && i === 0 ? 0 : 1);
  // base collar and a flat cap (no light, no ball)
  const cw = Math.max(rw + 2, Math.round(1.7 * s)), ch = Math.max(1, Math.round(0.9 * s));
  const cx0 = Math.round(cx + ax * s - cw / 2);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) buf.plot(cx0 + i, yBase - ch + j + 1, m.rod, j === 0 && i < cw - 1 ? 0 : i === cw - 1 ? 2 : 1);
  if (s >= 1.8) {
    const tw = rw + 2;
    const tx = Math.round(cx + ax * s - tw / 2);
    for (let i = 0; i < tw; i++) buf.plot(tx + i, yTop - 1, m.rod, i === 0 ? 0 : 2);
  }
}
