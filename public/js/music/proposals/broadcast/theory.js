// Music theory for the "broadcast" bed proposal: the channel motif and its
// derivations, chord symbols, smooth voice leading and a seeded random source.
// Everything here is pure (no Web Audio), so it can be unit-tested in Node.

// ------------------------------------------------------------------ motif

import { MOTIF as CHANNEL_MOTIF, COLOURS as CHANNEL_COLOURS } from '../../../audio/themes.js';

// THE channel signature, imported from the sonic identity (audio/themes.js) so
// the opens, the idents and these beds can never drift apart: low 5, 1, 2,
// high 5 ("da-da-da-DAH"). Degrees 1, 2 and 5 are identical in major, minor,
// dorian, lydian and mixolydian, so the same four notes sit in every
// programme's mode; a fifth "colour" note (COLOURS) gives each show its mood.
// Its pitch set {1, 2, 5} is a sus2 chord: the open, confident colour of the
// whole package, which is why the beds lean on sus2/add9 voicings and why the
// ostinatos pulse on do-re-sol.
export const MOTIF = Object.freeze({
  steps: Object.freeze(CHANNEL_MOTIF.map(([s]) => s)), // semitones from the tonic
  beats: Object.freeze(CHANNEL_MOTIF.map(([, b]) => b)),
});
export const COLOURS = CHANNEL_COLOURS;

// Derived shapes every bed draws from, so changing the signature re-derives the package.
export function motifShapes(m = MOTIF) {
  const steps = [...m.steps];
  const beats = [...m.beats];
  const pcs = [...new Set(steps.map((s) => ((s % 12) + 12) % 12))];
  return {
    steps,
    beats,
    head: steps.slice(0, 2), // rising fourth: timpani 5 -> 1, bass pickups
    tail: steps.slice(-2), // 2 -> 5: the rising fifth of the pads
    retro: [...steps].reverse(), // closing gesture (outro, replay)
    retroBeats: [...beats].reverse(),
    mirror: steps.map((s) => -s), // inversion around the tonic
    cell: pcs.sort((a, b) => a - b), // pitch-class cell [0, 2, 7] for ostinatos
    total: beats.reduce((a, b) => a + b, 0),
  };
}

// --------------------------------------------------------------- pitches

const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 'D4' -> 62, 'Bb2' -> 46, 'F#5' -> 78. */
export function midi(name) {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  return 12 * (Number(m[3]) + 1) + LETTER[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

export const hz = (m) => 440 * 2 ** ((m - 69) / 12);

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};

// ---------------------------------------------------------------- chords

const QUALITY = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  5: [0, 7],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  sus: [0, 5, 7],
  add9: [0, 4, 7, 14],
  madd9: [0, 3, 7, 14],
  6: [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  69: [0, 4, 9, 14],
  7: [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  maj9: [0, 4, 7, 11, 14],
  m9: [0, 3, 7, 10, 14],
  '7sus': [0, 5, 7, 10],
  '9sus': [0, 5, 10, 14],
  'maj7#11': [0, 4, 11, 18],
  '6sus': [0, 5, 7, 9],
};

/**
 * 'Dm', 'Bbmaj7', 'F/A', 'A7sus', 'E/G#' -> { root, bass, tones } where root and
 * bass are pitch classes (0-11) and tones are intervals above the root.
 */
export function parseChord(sym) {
  const m = /^([A-G])(#|b)?([^/]*)(?:\/([A-G])(#|b)?)?$/.exec(sym);
  if (!m || !(m[3] in QUALITY)) throw new Error(`bad chord ${sym}`);
  const pc = (l, a) => (LETTER[l] + (a === '#' ? 1 : a === 'b' ? -1 : 0) + 12) % 12;
  const root = pc(m[1], m[2]);
  return { sym, root, bass: m[4] ? pc(m[4], m[5]) : root, tones: QUALITY[m[3]], minor: /^m(?!aj)/.test(m[3]) };
}

/** Pitch classes of a chord (no duplicates). */
export function chordPcs(ch) {
  return [...new Set(ch.tones.map((t) => (ch.root + t) % 12))];
}

/** Lowest MIDI note >= lo with pitch class pc. */
export function atOrAbove(pc, lo) {
  return lo + ((((pc - lo) % 12) + 12) % 12);
}

/** Nearest MIDI note to `target` with pitch class pc. */
export function nearest(pc, target) {
  const up = atOrAbove(pc, target);
  return up - target <= 6 ? up : up - 12;
}

/**
 * Smooth voice leading: picks the voicing of `ch` (n voices, inside [lo, hi])
 * that moves least from `prev`. Candidates are every inversion stacked closely
 * from every start note in range, so it is cheap and always musical.
 */
export function voice(ch, prev, { n = 4, lo = 50, hi = 72 } = {}) {
  const pcs = chordPcs(ch);
  // Fill up to n voices by doubling the root and the fifth first.
  const order = [...pcs];
  const fifth = (ch.root + 7) % 12;
  while (order.length < n) order.push(order.length % 2 ? ch.root : pcs.includes(fifth) ? fifth : ch.root);
  const sets = [];
  for (let rot = 0; rot < pcs.length; rot++) {
    const seq = [...order.slice(rot), ...order.slice(0, rot)].slice(0, n);
    for (let start = lo; start < lo + 12; start++) {
      const out = [];
      let cur = start - 1;
      for (const pc of seq) {
        cur = atOrAbove(pc, cur + 1);
        out.push(cur);
      }
      if (out[0] % 12 !== seq[0] || out[out.length - 1] > hi) continue;
      sets.push(out);
    }
  }
  if (!sets.length) return pcs.map((pc) => atOrAbove(pc, lo));
  if (!prev?.length) {
    const mid = (lo + hi) / 2;
    return sets.reduce((a, b) => (Math.abs(avg(b) - mid) < Math.abs(avg(a) - mid) ? b : a));
  }
  const cost = (s) => {
    let c = 0;
    for (let i = 0; i < s.length; i++) c += Math.abs(s[i] - (prev[Math.min(i, prev.length - 1)] ?? s[i]));
    return c + Math.abs(avg(s) - avg(prev)) * 0.5;
  };
  return sets.reduce((a, b) => (cost(b) < cost(a) ? b : a));
}

const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;

/** Bass note for a chord, kept near the previous one inside [lo, hi]. */
export function bassNote(ch, prev, lo = 33, hi = 50) {
  let n = nearest(ch.bass, prev ?? (lo + hi) / 2);
  while (n < lo) n += 12;
  while (n > hi) n -= 12;
  return n;
}

// ------------------------------------------------------------------ random

/** Deterministic PRNG (mulberry32): same seed, same bed, same render. */
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.pick = (arr) => arr[Math.floor(next() * arr.length) % arr.length];
  next.range = (lo, hi) => lo + (hi - lo) * next();
  next.chance = (p) => next() < p;
  return next;
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
