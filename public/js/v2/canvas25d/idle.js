// Idle layer of the canvas25d rig (owner: FACES stream): the life a presenter
// has when nothing is scripted. Always on, pure function of t:
// breathing, weight shift, head micro-motion, seeded blinks 2-6 s apart
// (some doubles) and saccades between fixations near the lens.
import { smooth } from './space.js';

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth 1D noise in -1..1 made of incommensurate sines (no allocation, any t). */
export function wobble(t, seed) {
  return 0.5 * Math.sin(t * 1.13 + seed * 1.7) + 0.3 * Math.sin(t * 2.31 + seed * 2.9) + 0.2 * Math.sin(t * 3.77 + seed * 4.3);
}

const SCHEDULES = new Map();
/** Blink and saccade timetables for a seed, generated once for 15 minutes. */
export function schedule(seed, persona) {
  const key = `${seed}|${persona.blinkMin}|${persona.blinkMax}`;
  let s = SCHEDULES.get(key);
  if (s) return s;
  const rnd = mulberry(seed * 7919 + 13);
  const blinks = [];
  let t = 0.6 + rnd() * 1.5;
  while (t < 900) {
    blinks.push(t);
    if (rnd() < 0.2) blinks.push(t + 0.27 + rnd() * 0.06); // a double blink now and then
    t += persona.blinkMin + rnd() * (persona.blinkMax - persona.blinkMin);
  }
  const sacc = [];
  t = 0;
  let x = 0, y = 0;
  while (t < 900) {
    sacc.push(t, x, y);
    t += 0.5 + rnd() * 1.9;
    // mostly small fixations near the lens, sometimes a slightly bigger glance
    const big = rnd() < 0.18;
    x = (rnd() - 0.5) * (big ? 1.1 : 0.45);
    y = (rnd() - 0.5) * (big ? 0.6 : 0.25);
  }
  s = { blinks, sacc };
  SCHEDULES.set(key, s);
  return s;
}

export function upperBound(arr, t, stride = 1) {
  let lo = 0, hi = arr.length / stride - 1;
  if (hi < 0 || arr[0] > t) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (arr[mid * stride] <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Eyelid closure 0..1 for a blink that started dt seconds ago: fast close, short hold, slower open. */
export function blinkCurve(dt) {
  if (dt < 0) return 0;
  if (dt < 0.06) return smooth(dt / 0.06);
  if (dt < 0.1) return 1;
  if (dt < 0.22) return 1 - smooth((dt - 0.1) / 0.12);
  return 0;
}

/**
 * Layer 5. `gestLook` (0..1) is how strongly a gesture or a look already drives the
 * eyes: saccades are damped under it (and while the presenter has speech).
 */
export function applyIdle(c, persona, perf, t, seed, gestLook) {
  const p = persona;
  const br = 0.5 - 0.5 * Math.cos((t * 2 * Math.PI) / (4.1 + 0.3 * Math.sin(seed)) + seed);
  c.breathe = br;
  c.bx += p.sway * (0.45 * Math.sin(t * 0.68 + seed) + 0.22 * Math.sin(t * 1.53 + seed * 2));
  c.lean += p.sway * 0.006 * Math.sin(t * 0.55 + seed * 3);
  const hm = p.headMotion;
  c.yaw += hm * 0.045 * wobble(t * 0.35, seed);
  c.pitch += hm * 0.025 * wobble(t * 0.3, seed + 5);
  c.roll += hm * 0.018 * wobble(t * 0.27, seed + 9);
  c.hy += br * 0.35;
  const sch = schedule(seed, p);
  // blinks (also triggered on big head turns in real life; the schedule covers it well enough)
  const bi = upperBound(sch.blinks, t);
  let blink = 0;
  for (let q = Math.max(0, bi - 1); q <= bi && q >= 0; q++) blink = Math.max(blink, blinkCurve(t - sch.blinks[q]));
  c.blink = blink;
  // saccades: 45 ms eased jumps between fixations, damped while a gesture drives the eyes
  const si = upperBound(sch.sacc, t, 3);
  if (si >= 0) {
    const t0 = sch.sacc[si * 3];
    const px = si > 0 ? sch.sacc[si * 3 - 2] : 0, py = si > 0 ? sch.sacc[si * 3 - 1] : 0;
    const u = smooth((t - t0) / 0.045);
    const sx = px + (sch.sacc[si * 3 + 1] - px) * u, sy = py + (sch.sacc[si * 3 + 2] - py) * u;
    const damp = perf.speech ? 0.45 : 1;
    c.lookX += sx * damp * (1 - gestLook * 0.8);
    c.lookY += sy * damp * (1 - gestLook * 0.8);
  }
}
