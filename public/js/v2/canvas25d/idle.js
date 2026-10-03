// Idle layer of the canvas25d rig (owner: FACES stream): the life a presenter
// has when nothing is scripted. Always on, a function of t (and of the speech
// frame, which speech.js samples once per instant):
//   breathing, weight shift, head micro-motion;
//   blinks: a seeded timetable 2-6 s apart (some doubles), plus the blinks
//     people make with big gaze shifts (most look starts, some returns), at
//     sentence ends and in some comma pauses; an event blink replaces a
//     scheduled one close to it, so the eyes never flutter;
//   saccades: quick (45 ms) jumps between fixations. Talking to the lens the
//     fixations stay close to it (reading the autocue); listening they wander
//     a little more; a look or a gesture that drives the eyes damps them.
import { smooth } from './space.js';
import { sampleSpeech } from './speech.js';

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
const SPAN = 900; // s covered by one timetable; later times wrap (t mod SPAN)
/** Blink and saccade timetables for a seed, generated once for 15 minutes (applyIdle wraps t). */
export function schedule(seed, persona) {
  const doubles = persona.doubleBlink ?? 0.12;
  const key = `${seed}|${persona.blinkMin}|${persona.blinkMax}|${doubles}`;
  let s = SCHEDULES.get(key);
  if (s) return s;
  const rnd = mulberry(seed * 7919 + 13);
  const blinks = [];
  let t = 0.6 + rnd() * 1.5;
  while (t < SPAN - 1) {
    blinks.push(t);
    if (rnd() < doubles) blinks.push(t + 0.27 + rnd() * 0.06); // a double blink now and then (persona.doubleBlink: 0 for UNIT-8)
    // spread a little wider than the persona's range: speech and gaze shifts add their
    // own blinks, and a newsreader who blinks too often reads as nervous (~15/min overall)
    t += (persona.blinkMin + rnd() * (persona.blinkMax - persona.blinkMin)) * 1.4;
  }
  const sacc = [];
  t = 0;
  let x = 0, y = 0;
  while (t < SPAN) {
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

/** Deterministic 0..1 from an event time and a seed (which events get a blink). */
export function eventHash(x, seed) {
  const v = Math.sin(x * 12.9898 + seed * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

const FAR = -1e9;

// an event blink is remembered this long: the timetable's next blink after it is dropped
const EVENT_MEMORY = 2.5;

/** Start time of the latest event blink in the last EVENT_MEMORY s (look shifts, sentence ends, comma pauses), or FAR. */
function eventBlink(perf, fr, t, seed) {
  let tb = FAR;
  const looks = perf.look;
  if (looks) {
    for (let i = 0; i < looks.length; i++) {
      const lk = looks[i];
      if (lk.target === 'camera' || lk.target === 'interest' || lk.style === 'mech') continue; // eyeline shifts only
      // big gaze shifts often carry a blink as the eyes start to move; a few returns too
      // (rates tuned so the whole face blinks ~14-16 times a minute: more reads as nervous)
      if (t >= lk.t0 && t - lk.t0 < EVENT_MEMORY && eventHash(lk.t0, seed) < 0.4 && lk.t0 + 0.03 > tb) tb = lk.t0 + 0.03;
      if (t >= lk.t1 && t - lk.t1 < EVENT_MEMORY && eventHash(lk.t1, seed + 1) < 0.2 && lk.t1 > tb) tb = lk.t1;
    }
  }
  if (fr) {
    if (t - fr.endAt < EVENT_MEMORY && t >= fr.endAt && eventHash(fr.endAt, seed + 2) < 0.4 && fr.endAt + 0.05 > tb) tb = fr.endAt + 0.05;
    if (t - fr.pauseAt < EVENT_MEMORY && t >= fr.pauseAt && eventHash(fr.pauseAt, seed + 3) < 0.15 && fr.pauseAt + 0.03 > tb) tb = fr.pauseAt + 0.03;
  }
  return tb;
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
  const br = (0.5 - 0.5 * Math.cos((t * 2 * Math.PI) / (4.1 + 0.3 * Math.sin(seed)) + seed)) * (p.breath ?? 1);
  c.breathe = br;
  c.bx += p.sway * (0.45 * Math.sin(t * 0.68 + seed) + 0.22 * Math.sin(t * 1.53 + seed * 2));
  c.lean += p.sway * 0.006 * Math.sin(t * 0.55 + seed * 3);
  const hm = p.headMotion;
  c.yaw += hm * 0.045 * wobble(t * 0.35, seed);
  c.pitch += hm * 0.025 * wobble(t * 0.3, seed + 5);
  c.roll += hm * 0.018 * wobble(t * 0.27, seed + 9);
  c.hy += br * 0.35;
  const sch = schedule(seed, p);
  const fr = perf.speech ? sampleSpeech(perf.speech, t) : null;
  const act = fr ? fr.act || 0 : 0;
  // blinks: the timetable, unless an event blink sits within 1.2 s before it or 2.5 s after
  // an event blink (the event blink took its place: about one blink every 4 s overall)
  const tb = eventBlink(perf, fr, t, seed);
  // the timetables cover SPAN s; later instants wrap (a blink or a fixation may be cut at the seam once every 15 min)
  const tw = t >= 0 && t < SPAN ? t : ((t % SPAN) + SPAN) % SPAN;
  const off = t - tw;
  const bi = upperBound(sch.blinks, tw);
  let blink = tb > FAR ? blinkCurve(t - tb) : 0;
  for (let q = Math.max(0, bi - 1); q <= bi && q >= 0; q++) {
    const b = sch.blinks[q] + off;
    if (tb > FAR && b > tb - 1.2 && b < tb + EVENT_MEMORY) continue;
    blink = Math.max(blink, blinkCurve(t - b));
  }
  c.blink = blink;
  // saccades: 45 ms eased jumps between fixations, closer to the lens while talking,
  // damped while a look or a gesture drives the eyes
  const si = upperBound(sch.sacc, tw, 3);
  if (si >= 0) {
    const t0 = sch.sacc[si * 3] + off;
    const px = si > 0 ? sch.sacc[si * 3 - 2] : 0, py = si > 0 ? sch.sacc[si * 3 - 1] : 0;
    const u = smooth((t - t0) / 0.045);
    const sx = px + (sch.sacc[si * 3 + 1] - px) * u, sy = py + (sch.sacc[si * 3 + 2] - py) * u;
    const damp = (1 - 0.55 * act) * (1 - gestLook * 0.85);
    c.lookX += sx * damp;
    c.lookY += sy * damp;
  }
}
