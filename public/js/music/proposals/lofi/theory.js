// Lo-fi newsroom proposal: music theory helpers. The whole channel is built from
// ONE signature, shared with the opens and idents of the audio stream
// (public/js/audio/themes.js MOTIF): low 5 - 1 - 2 - high 5 ("da-da-da-DAH"),
// no third, so it fits every mode; a fifth "colour" note gives each programme
// its mood (home 3, tech b7, cosmos #4, money 6, news-60 octave, breaking b3,
// up-next 2 "left hanging"). The beds sing it in scale steps so it follows each
// programme's mode. Everything here is pure (no WebAudio).

/** The signature in scale steps (0 = tonic) and beats. Semitones: [-5, 0, 2, 7]. */
export const SIGNATURE = Object.freeze([
  { d: -3, len: 0.5 }, // low 5
  { d: 0, len: 0.5 }, // 1
  { d: 1, len: 0.5 }, // 2
  { d: 4, len: 1 }, // high 5
]);
export const SIGNATURE_SEMITONES = Object.freeze([-5, 0, 2, 7]);

/** Colour notes in scale steps (in each palette's own mode they give 3, b7, #4, 6, 8, b3, 2). */
export const COLOUR = Object.freeze({ home: 2, tech: 6, cosmos: 3, money: 5, sixty: 7, breaking: 2, next: 1 });

export const SCALES = Object.freeze({
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  minor: [0, 2, 3, 5, 7, 8, 10],
});

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 'F#', 'Bb', 'C' -> pitch class 0..11. */
export function pitchClass(name) {
  const m = /^([A-G])([#b]?)/.exec(name);
  if (!m) return 0;
  return (PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
}

export const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
export const mod = (n, m) => ((n % m) + m) % m;

/** Scale degree (in steps, any octave) -> MIDI note. */
export function degreeToMidi(tonic, scale, d) {
  const oct = Math.floor(d / 7);
  return tonic + 12 * oct + scale[mod(d, 7)];
}

/** Nearest scale step for a MIDI note (used to snap generated melody). */
export function midiToDegree(tonic, scale, midi) {
  let best = 0;
  let bestDist = Infinity;
  for (let d = -21; d <= 21; d++) {
    const dist = Math.abs(degreeToMidi(tonic, scale, d) - midi);
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return best;
}

// Chord qualities as intervals above the root. The bass plays the root, so the
// keys use rootless voicings (3rds, 7ths, 9ths): the soft jazzy colour of lo-fi.
export const QUALITIES = Object.freeze({
  maj7: [4, 7, 11],
  maj9: [4, 7, 11, 14],
  '6/9': [4, 9, 14],
  add9: [4, 7, 14],
  'maj7#11': [4, 11, 14, 18],
  m7: [3, 7, 10],
  m9: [3, 10, 14],
  m11: [3, 10, 14, 17],
  7: [4, 10],
  9: [4, 10, 14],
  13: [4, 10, 14, 21],
  '9sus': [5, 10, 14],
  '7b9': [4, 10, 13],
  6: [4, 7, 9],
  m6: [3, 7, 9],
  m7b5: [3, 6, 10],
});

/**
 * Chord symbol -> { root (pc), bass (pc), tones (intervals), symbol }.
 * Accepts 'Dmaj9', 'F#m7', 'A13', 'F#add9/E' (slash = bass note).
 */
export function parseChord(symbol) {
  const [main, slash] = String(symbol).split('/');
  const m = /^([A-G][#b]?)(.*)$/.exec(main);
  const root = pitchClass(m ? m[1] : 'C');
  const q = m && m[2] ? m[2] : 'maj7';
  const tones = QUALITIES[q] || QUALITIES.maj7;
  return { root, bass: slash ? pitchClass(slash) : root, tones, symbol, quality: q };
}

/** Pitch classes of a chord (root included, for melody fitting). */
export function chordPcs(chord) {
  return new Set([chord.root, ...chord.tones.map((i) => (chord.root + i) % 12)]);
}

/**
 * Voice-led rootless voicing: every inversion of the chord tones placed with its
 * lowest note in [lo, lo+12), pick the one closest to the previous voicing.
 */
export function voiceChord(chord, prev, lo = 53) {
  const pcs = chord.tones.map((i) => (chord.root + i) % 12);
  const sorted = [...new Set(pcs)].sort((a, b) => a - b);
  const cands = [];
  for (let r = 0; r < sorted.length; r++) {
    const rot = sorted.slice(r).concat(sorted.slice(0, r));
    const notes = [];
    let base = lo + mod(rot[0] - lo, 12);
    for (const pc of rot) {
      let n = base + mod(pc - base, 12);
      if (notes.length && n <= notes[notes.length - 1]) n += 12;
      notes.push(n);
      base = n;
    }
    cands.push(notes);
  }
  if (!prev || !prev.length) return cands[0];
  const cost = (v) => {
    let c = 0;
    const n = Math.min(v.length, prev.length);
    for (let i = 0; i < n; i++) c += Math.abs(v[i] - prev[i]);
    return c + Math.abs(v.length - prev.length) * 3;
  };
  return cands.reduce((best, v) => (cost(v) < cost(best) ? v : best));
}

/** Deterministic PRNG so the same bar always plays the same notes (live = offline). */
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.range = (lo, hi) => lo + (hi - lo) * next();
  next.chance = (p) => next() < p;
  // Weighted pick: [[item, weight], ...]
  next.weighted = (pairs) => {
    const total = pairs.reduce((s, p) => s + p[1], 0);
    let x = next() * total;
    for (const [item, w] of pairs) if ((x -= w) <= 0) return item;
    return pairs[pairs.length - 1][0];
  };
  return next;
}

/** Stable 32-bit hash of strings / numbers, to derive per-bar seeds. */
export function hash(...parts) {
  let h = 2166136261;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h ^= 0x2f;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Signature variations, all from the same notes so the channel sounds like one
 * network. `colour` is a scale step (COLOUR.*) or null. Returns [{d, at, len}].
 *   statement  da-da-da-DAH + colour (exactly one bar)
 *   head       da-da-da-DAAAH (no colour, the high 5 rings)
 *   answer     ... + 3 then 1: the sign-off, home at last
 *   displaced  starts on beat 2: lazier, conversational
 *   retrograde high 5 - 2 - 1 - low 5, then the colour (the replay tag)
 *   echo       just "2 - 5 - colour" on beats 3-4: a fragment for fills
 *   augmented  half speed over two bars: dreamy (cosmos, standby)
 */
export function motifVariant(kind, shift = 0, colour = COLOUR.home) {
  const seq = (notes, start = 0) => {
    let at = start;
    return notes.map(([d, len]) => {
      const n = { d: d + shift, at, len };
      at += len;
      return n;
    });
  };
  const sig = SIGNATURE.map((n) => [n.d, n.len]);
  const withColour = (base, len = 1.5) => (colour == null ? base : [...base, [colour, len]]);
  switch (kind) {
    case 'head':
      return seq([...sig.slice(0, 3), [4, 2.5]]);
    case 'answer':
      return seq([...sig, [2, 0.75], [0, 1.25]]);
    case 'displaced':
      return seq(withColour(sig, 0.5), 1);
    case 'retrograde':
      return seq(withColour([...sig].reverse().map(([d], i) => [d, [0.5, 0.5, 0.5, 1][i]])));
    case 'echo':
      return seq(withColour([[1, 0.5], [4, 0.5]], 1), 2);
    case 'augmented':
      return seq(withColour(sig).map(([d, len]) => [d, len * 2]));
    default: // 'statement' / 'signature'
      return seq(withColour(sig));
  }
}
