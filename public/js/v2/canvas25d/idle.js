// Idle layer of the canvas25d rig (owner: FACES stream): the life a presenter
// has when nothing is scripted. Always on, a function of t (and of the speech
// frame, which speech.js samples once per instant):
//   breathing, weight shift, head micro-motion;
//   blinks: a seeded timetable 2-6 s apart (some doubles), plus the blinks
//     people make with big gaze shifts (most look starts, some returns), at
//     sentence ends and in some comma pauses; an event blink takes the place of
//     a scheduled one close to it, and never cancels a blink already running,
//     so the eyes never flutter or pop;
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

// The last few timetables, matched by value (seed and the persona's blink numbers): no key
// string per call and no growth over a 24/7 run (critic r2: a Map keyed by a template string
// built every frame kept one ~16 KB timetable per episode and presenter, forever)
const CACHE_N = 16;
const CACHE = new Array(CACHE_N).fill(null);
let cacheAt = 0;
const SPAN = 900; // s covered by one timetable; later times wrap (t mod SPAN)
/** Blink and saccade timetables for a seed, generated once for 15 minutes (applyIdle wraps t). */
export function schedule(seed, persona) {
  const doubles = persona.doubleBlink ?? 0.12;
  const bmin = persona.blinkMin, bmax = persona.blinkMax;
  for (let i = 0; i < CACHE_N; i++) {
    const c = CACHE[i];
    if (c !== null && c.seed === seed && c.bmin === bmin && c.bmax === bmax && c.doubles === doubles) return c;
  }
  let s;
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
  let x = 0, y = 0, big = false;
  while (t < SPAN) {
    sacc.push(t, x, y);
    // a bigger fixation is held ≤ 1.2 s (critic r3: a 2.4 s side-eye at ±0.55 read as an
    // unmotivated look; only planned looks go far off the lens)
    t += big ? 0.5 + rnd() * 0.7 : 0.5 + rnd() * 1.9;
    // mostly small fixations near the lens, sometimes a slightly bigger glance (≤ ±0.35)
    big = rnd() < 0.18;
    x = (rnd() - 0.5) * (big ? 0.7 : 0.45);
    y = (rnd() - 0.5) * (big ? 0.5 : 0.25);
  }
  s = { blinks, sacc, seed, bmin, bmax, doubles };
  CACHE[cacheAt] = s;
  cacheAt = (cacheAt + 1) % CACHE_N;
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

// Event blinks (gaze shifts, sentence ends, comma pauses) and the timetable (critic r3: an event
// that arrived while a blink was half closed cancelled it, and the lids jumped 0.78 → 0.07 in one
// frame before closing again). The rules, pop-free by construction:
//   - a look's blinks are known ahead (planned looks are on perf.look before they start); the
//     speech's only once they happen (endAt / pauseAt, and the previous of each);
//   - an event blink never starts within 0.6 s after another (no flutter; a look event wins over a
//     speech event 0.6 s either side of it), and a running one is never replaced;
//   - a look shorter than 1 s blinks at most once (its start), never at its return too;
//   - a timetable blink b gives way to an event blink in [b - 2.5, b] (one took its place a moment
//     ago) or in [b + 0.23, b + 1.2] (one follows soon); an event that starts while b runs leaves b
//     alone (the two curves merge into one slightly longer blink).
const EVENT_MEMORY = 2.5; // s an event blink keeps the timetable's next blink away
const FOLLOW = [0.23, 1.2]; // a timetable blink this long before an event blink gives way
const NO_FLUTTER = 0.6; // s between two event blinks at least
const MEM = 3.6, AHEAD = FOLLOW[1] + 0.1; // the window of events that can matter at t
const EVN = 32;
const EV = new Float64Array(EVN), EK = new Uint8Array(EVN), EF = new Uint8Array(EVN);
let nEv = 0;

function pushEv(e, kind, t) {
  if (nEv >= EVN || e < t - MEM || e > t + (kind ? 0 : AHEAD)) return;
  EV[nEv] = e;
  EK[nEv] = kind;
  nEv++;
}

/** Collect the candidate event blinks around t into EV (sorted), with EF[i] = 1 for the ones that blink. */
function eventBlinks(perf, fr, t, seed) {
  nEv = 0;
  const looks = perf.look;
  if (looks) {
    for (let i = 0; i < looks.length; i++) {
      const lk = looks[i];
      if (lk.target === 'camera' || lk.target === 'interest' || lk.style === 'mech') continue; // eyeline shifts only
      // big gaze shifts often carry a blink as the eyes start to move; a few returns too
      // (rates tuned so the whole face blinks ~14-16 times a minute: more reads as nervous)
      if (eventHash(lk.t0, seed) < 0.4) pushEv(lk.t0 + 0.03, 0, t);
      if (lk.t1 - lk.t0 >= 1 && eventHash(lk.t1, seed + 1) < 0.2) pushEv(lk.t1, 0, t);
    }
  }
  if (fr) {
    const ea = fr.endAt, eb = fr.endPrev ?? FAR, pa = fr.pauseAt, pb = fr.pausePrev ?? FAR;
    if (ea > FAR && ea <= t && eventHash(ea, seed + 2) < 0.4) pushEv(ea + 0.05, 1, t);
    if (eb > FAR && eventHash(eb, seed + 2) < 0.4) pushEv(eb + 0.05, 1, t);
    if (pa > FAR && pa <= t && eventHash(pa, seed + 3) < 0.15) pushEv(pa + 0.03, 1, t);
    if (pb > FAR && eventHash(pb, seed + 3) < 0.15) pushEv(pb + 0.03, 1, t);
  }
  // insertion sort (a handful of entries)
  for (let i = 1; i < nEv; i++) {
    const e = EV[i], k = EK[i];
    let j = i - 1;
    while (j >= 0 && EV[j] > e) {
      EV[j + 1] = EV[j];
      EK[j + 1] = EK[j];
      j--;
    }
    EV[j + 1] = e;
    EK[j + 1] = k;
  }
  // look events: none within NO_FLUTTER after another look event
  for (let i = 0; i < nEv; i++) {
    if (EK[i]) continue;
    let ok = 1;
    for (let j = i - 1; j >= 0 && EV[j] > EV[i] - NO_FLUTTER; j--) if (!EK[j] && EV[j] < EV[i]) ok = 0;
    EF[i] = ok;
  }
  // speech events: clear of the look blinks either side and of an earlier speech event
  for (let i = 0; i < nEv; i++) {
    if (!EK[i]) continue;
    let ok = 1;
    for (let j = 0; j < nEv && ok; j++) {
      if (j === i) continue;
      const d = EV[i] - EV[j];
      if (!EK[j] && EF[j] && d > -NO_FLUTTER && d < NO_FLUTTER) ok = 0;
      else if (EK[j] && d > 0 && d < NO_FLUTTER) ok = 0;
    }
    EF[i] = ok;
  }
}

/** Does the timetable blink at b give way to an event blink (EV / EF from eventBlinks)? */
function givesWay(b) {
  for (let i = 0; i < nEv; i++) {
    if (!EF[i]) continue;
    const d = EV[i] - b;
    if ((d >= -EVENT_MEMORY && d <= 0) || (d >= FOLLOW[0] && d <= FOLLOW[1])) return true;
  }
  return false;
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
  // blinks: the event blinks (gaze shifts, sentence ends, comma pauses), and the timetable where
  // no event blink took its place (about one blink every 4 s overall); see eventBlinks
  eventBlinks(perf, fr, t, seed);
  let blink = 0;
  for (let i = 0; i < nEv; i++) if (EF[i] && EV[i] <= t && t - EV[i] < 0.25) blink = Math.max(blink, blinkCurve(t - EV[i]));
  // the timetables cover SPAN s; later instants wrap (a blink or a fixation may be cut at the seam once every 15 min)
  const tw = t >= 0 && t < SPAN ? t : ((t % SPAN) + SPAN) % SPAN;
  const off = t - tw;
  const bi = upperBound(sch.blinks, tw);
  for (let q = Math.max(0, bi - 1); q <= bi && q >= 0; q++) {
    const b = sch.blinks[q] + off;
    if (t - b >= 0.25 || givesWay(b)) continue;
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
    // toward the partner only a little (lookX is in partner space): a wandering fixation that
    // lands on the co-presenter reads as a side-eye; only planned looks go there
    c.lookX += (sx > 0 && perf.side ? sx * 0.4 : sx) * damp;
    c.lookY += sy * damp;
  }
}
