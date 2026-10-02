// GLOBIT 24's sonic identity. One four-note signature - low 5, 1, 2, high 5
// ("da-da-da-DAH") - rises by a fourth, a step and a fourth: open, confident,
// with no third, so it belongs to no mode until a fifth "colour" note gives
// each use its own mood:
//   channel / WORLD NOW  -> 3   (down a minor third: warm, resolved, home)
//   TECH BYTES           -> b7  (up a minor third: dorian, cool synth)
//   COSMOS DESK          -> #4  (down a semitone: lydian wonder)
//   MONEY MINUTE         -> 6   (up a step: cheeky major-sixth lift)
//   NEWS IN 60           -> 8   (up a fourth to the octave: done, next!)
//   BREAKING             -> b3  (minor, low, firm - never an alarm)
//   UP NEXT promo        -> 2   (left hanging: "stay with us")
//   sign-off             -> 3 then 1 (home)
// Every cue is a plain tune object (see tune.js / CONTRACTS.md), so the
// opens, the director and the lab play them like any other tune.

import { midiToName } from './tune.js';

/** The signature as semitones from the tonic and lengths in beats. */
export const MOTIF = Object.freeze([[-5, 0.5], [0, 0.5], [2, 0.5], [7, 1]]);
export const COLOURS = Object.freeze({ home: 4, tech: 10, cosmos: 6, money: 9, sixty: 12, breaking: 3, next: 2 });

const D4 = 62; // channel home key: D major

const fmt = (n) => String(Math.round(n * 1000) / 1000);
const name = (m) => (Array.isArray(m) ? m.map(midiToName).join('+') : midiToName(m));

// A part from absolute events [beat, midi | midi[], beats, velocity?]; gaps become rests.
function part(events, total) {
  const toks = [];
  let t = 0;
  for (const [b, m, d, v] of [...events].sort((x, y) => x[0] - y[0])) {
    if (b < t - 1e-6) continue; // overlapping note in a mono part: drop it
    if (b > t + 1e-6) toks.push(`R:${fmt(b - t)}`);
    toks.push(`${name(m)}:${fmt(d)}${v != null && v !== 1 ? `@${fmt(v)}` : ''}`);
    t = b + d;
  }
  if (total > t + 1e-6) toks.push(`R:${fmt(total - t)}`);
  return toks.join(' ');
}

// A drum line from [beat, key, velocity?]; each hit lasts until the next one.
function drums(events, total) {
  const ev = [...events].sort((x, y) => x[0] - y[0]);
  const toks = [];
  if (ev.length && ev[0][0] > 1e-6) toks.push(`R:${fmt(ev[0][0])}`);
  ev.forEach(([b, k, v], i) => {
    const len = (i + 1 < ev.length ? ev[i + 1][0] : Math.max(total, b + 0.25)) - b;
    if (len <= 1e-6) return;
    toks.push(`${k}:${fmt(len)}${v != null && v !== 1 ? `@${fmt(v)}` : ''}`);
  });
  return toks.join(' ');
}

const range = (from, to, step) => {
  const out = [];
  for (let b = from; b < to - 1e-6; b += step) out.push(b);
  return out;
};

/**
 * The signature starting at `beat` in the key of `tonic`, ending with the
 * colour note. `scale` stretches it (2 = half speed); returns note events.
 */
export function motif(tonic, colour, beat = 0, { scale = 1, colourBeats = 1.5, octave = 0, vel = 1 } = {}) {
  const out = [];
  let b = beat;
  const accents = [0.78, 0.84, 0.9, 1];
  MOTIF.forEach(([semi, len], i) => {
    out.push([b, tonic + semi + 12 * octave, len * scale, accents[i] * vel]);
    b += len * scale;
  });
  if (colour != null) out.push([b, tonic + colour + 12 * octave, colourBeats * scale, 0.94 * vel]);
  return out;
}
const MOTIF_BEATS = 2.5; // the four notes; the colour note follows

// ------------------------------------------------------------------ opens

// Each open: preferred tempo, then a builder that receives H (the beat of the
// final chord, landing exactly on the title lock-up) and C (the beat of the
// cut to the studio, possibly fractional) and returns the tune.
const OPENS = {
  // Flagship: brass in D major over a timpani roll; IV - V - I into the title.
  'world-now': {
    bpm: 112,
    key: D4,
    build(H, C) {
      const k = D4;
      const m0 = H - 4; // motif start: colour note lands 1.5 beats before the hit
      const total = C + 2;
      const roll = range(0, m0, 0.25).map((b, i, a) => [b, k - 24, 0.25, 0.3 + (0.6 * i) / Math.max(1, a.length - 1)]);
      return {
        bpm: this.tempo,
        room: 0.22,
        echo: { amount: 0.8, beats: 0.75, feedback: 0.28 },
        fadeOut: 0.9,
        tracks: [
          { kind: 'lead', inst: 'brass', notes: part(motif(k - 12 + 12, COLOURS.home, m0, { colourBeats: 1.5 }), total), gain: 1.05 },
          { kind: 'lead', inst: 'pulse12', notes: part(motif(k + 12, COLOURS.home, m0, { vel: 0.55 }), total), gain: 0.45, pan: 0.2, echo: 0.35 },
          { kind: 'harmony', inst: 'pad', notes: part([
            [0, [k - 12, k - 5], m0, 0.5], [m0, [k - 8, k - 5], 1.5, 0.75], [m0 + 1.5, [k - 7, k - 3], 1, 0.8],
            [m0 + 2.5, [k - 5, k - 1], 1.5, 0.85], [H, [k, k + 4, k + 7], total - H, 0.95],
          ], total), pan: -0.2 },
          { kind: 'bass', inst: 'timpani', notes: part([...roll, [m0, k - 24, 1.5], [m0 + 1.5, k - 19, 1], [m0 + 2.5, k - 17, 1.5], [H, k - 24, C - H], [C, k - 24, 1.5, 0.8]], total) },
          { kind: 'bass', inst: 'tri', notes: part([[m0, k - 24, 1.4, 0.8], [m0 + 1.5, k - 19, 0.9, 0.8], [m0 + 2.5, k - 17, 1.4, 0.8], [H, [k - 24], total - H, 0.9]], total), gain: 0.6 },
          { drums: drums([...range(0, m0, 0.25).map((b, i, a) => [b, 'S', 0.25 + (0.55 * i) / Math.max(1, a.length - 1)]), [m0, 'K'], [m0 + 1.5, 'K', 0.8], [m0 + 2.5, 'S', 0.9], [H, 'K'], [C, 'K', 0.85]], total) },
          { drums: drums([[m0, 'O', 0.5], [H, 'C', 0.9]], total) },
          { kind: 'lead', inst: 'bell', notes: part([[H, k + 12, 0.25, 0.5], [H + 0.25, k + 16, 0.25, 0.5], [H + 0.5, k + 19, 0.25, 0.5], [H + 0.75, k + 24, 1, 0.55]], total), gain: 0.4, echo: 0.5, pan: 0.3 },
        ],
      };
    },
  },
  // Cool synth: A dorian, a 12.5 % pulse arpeggio, chip-chord arpeggio on the hit.
  'tech-bytes': {
    bpm: 150,
    key: 69,
    build(H, C) {
      const k = 69; // A4
      const m0 = H - 4;
      const total = C + 2;
      const arpNotes = [k - 12, k - 9, k - 5, k - 2, k + 2, k - 2, k - 5, k - 9];
      const arp = range(1, H, 0.25).map((b, i) => [b, arpNotes[i % 8], 0.25, 0.45 + 0.1 * (i % 2 ? 0 : 1)]);
      const bass = [...range(2, m0 + 2.5, 0.5).map((b, i) => [b, i % 2 ? k - 24 : k - 36, 0.5, 0.85]),
        ...range(m0 + 2.5, H, 0.5).map((b, i) => [b, i % 2 ? k - 26 : k - 38, 0.5, 0.85]), [H, k - 36, 2.5]];
      return {
        bpm: this.tempo,
        room: 0.14,
        echo: { amount: 1, beats: 0.75, feedback: 0.35 },
        fadeOut: 0.8,
        tracks: [
          { kind: 'lead', inst: 'pulse25', notes: part(motif(k - 12, COLOURS.tech, m0), total), gain: 1 },
          { kind: 'lead', inst: 'bell', notes: part([[0, k + 24, 0.25, 0.6], [0.5, k + 19, 0.25, 0.5], [H, [k, k + 7, k + 10, k + 14], total - H, 0.8]], total), arp: 0.045, gain: 0.55, echo: 0.3 },
          { kind: 'harmony', inst: 'pulse12', notes: part(arp, total), gain: 0.55, pan: 0.3, echo: 0.45 },
          { kind: 'bass', inst: { wave: 'pulse50', preset: 'pulse50', s: 0.6, d: 0.1 }, notes: part(bass, total), gain: 0.75 },
          { drums: drums([...range(2, H, 0.25).map((b, i) => [b, 'H', i % 2 ? 0.35 : 0.6]), [H, 'C', 0.8], [C, 'H', 0.4]], total) },
          { drums: drums([[0, 'X', 0.6], [0.5, 'X', 0.5], ...range(m0, H, 1).map((b) => [b, (b - m0) % 2 ? 'S' : 'K', 0.9]), [H, 'K'], [C, 'K', 0.8]], total) },
        ],
      };
    },
  },
  // Wonder: E lydian, soft triangle with long echo, a sweep into Emaj7(#11).
  cosmos: {
    bpm: 92,
    key: 64,
    build(H, C) {
      const k = 64; // E4
      const m0 = H - 4;
      const total = C + 2.5;
      const dust = [k + 12, k + 19, k + 26, k + 28, k + 31, k + 26];
      return {
        bpm: this.tempo,
        room: 0.42,
        echo: { amount: 1.4, beats: 0.75, feedback: 0.45 },
        fadeOut: 1.2,
        tracks: [
          { kind: 'lead', inst: 'softtri', notes: part(motif(k - 12 + 12, COLOURS.cosmos, m0, { colourBeats: 1.5 }), total), gain: 1.1 },
          { kind: 'lead', inst: 'sine', notes: part(motif(k + 12, COLOURS.cosmos, m0, { vel: 0.5 }), total), gain: 0.4, echo: 0.5, pan: -0.25 },
          { kind: 'harmony', inst: 'bell', notes: part([...range(0, Math.max(1, m0 + 0.01), 0.25).map((b, i) => [b, dust[i % dust.length], 0.25, 0.55]),
            [H, k + 18, 2, 0.5]], total), gain: 0.5, echo: 0.6, pan: 0.35 },
          { kind: 'harmony', inst: 'pad', notes: part([[0, [k - 12, k - 5], m0 + 2.5, 0.6], [m0 + 2.5, [k - 10, k - 6], 1.5, 0.7], [H, [k - 12, k - 8, k - 5, k - 1], total - H, 0.85]], total), pan: 0.15 },
          { kind: 'bass', inst: 'sine', notes: part([[0, k - 24, m0 + 2.5, 0.8], [m0 + 2.5, k - 22, 1.5, 0.8], [H, k - 24, total - H, 0.9]], total) },
          { drums: drums([[0, 'O', 0.45], [Math.max(0.5, H - 2), 'W', 0.8], [H, 'C', 0.5], [C, 'T', 0.4]], total) },
          { drums: drums([[H, 'T', 0.7]], total) },
        ],
      };
    },
  },
  // Strut: F major with swing, "cha-ching" sparkle, a 6/9 chord on the title.
  'money-minute': {
    bpm: 128,
    key: 65,
    build(H, C) {
      const k = 65; // F4
      const m0 = H - 4;
      const total = C + 2;
      const walk = [...range(0, m0, 0.5).map((b, i) => [b, i % 2 ? k - 12 : k - 24, 0.5, 0.85]),
        [m0, k - 24, 1], [m0 + 1, k - 20, 0.5], [m0 + 1.5, k - 17, 1], [m0 + 2.5, k - 26, 1], [m0 + 3.5, k - 17, 0.5], [H, k - 24, 2.5]];
      return {
        bpm: this.tempo,
        swing: 0.18,
        room: 0.18,
        echo: { amount: 0.7, beats: 0.75, feedback: 0.25 },
        fadeOut: 0.8,
        tracks: [
          { kind: 'lead', inst: 'brass', notes: part(motif(k - 12, COLOURS.money, m0), total), gain: 1 },
          { kind: 'lead', inst: 'bell', notes: part([[0, k + 19, 0.25, 0.7], [0.25, k + 24, 0.75, 0.8], [H, [k + 12, k + 16, k + 19, k + 21, k + 26], total - H, 0.75]], total), arp: 0.04, gain: 0.55, echo: 0.3, pan: 0.25 },
          { kind: 'harmony', inst: 'pluck', notes: part([...range(1, m0, 1).map((b) => [b, [k - 8, k - 5], 0.5, 0.6]), [m0, [k - 8, k - 5], 1.5, 0.7], [m0 + 1.5, [k - 10, k - 5], 1, 0.7], [m0 + 2.5, [k - 7, k - 3], 1.5, 0.75], [H, [k - 8, k - 5, k - 3], total - H, 0.8]], total), pan: -0.25 },
          { kind: 'bass', inst: 'tri', notes: part(walk, total) },
          { drums: drums([...range(0, H, 0.5).map((b, i) => [b, 'H', i % 2 ? 0.35 : 0.55]), [H, 'C', 0.8]], total) },
          { drums: drums([...range(0, H, 1).map((b, i) => [b, i % 2 ? 'S' : 'K', 0.85]), [H, 'K'], [C, 'K', 0.8]], total) },
        ],
      };
    },
  },
  // The clock: G major, ticking, the signature leaps to the octave - next story!
  'news-60': {
    bpm: 150,
    key: 67,
    build(H, C) {
      const k = 67; // G4
      const m0 = H - 4;
      const total = C + 1.5;
      const ticks = range(0, m0, 0.5).map((b, i) => [b, i % 2 ? k + 16 : k + 21, 0.25, 0.55]);
      const bass = [...range(0, m0 + 1.5, 0.5).map((b) => [b, k - 24, 0.3, 0.8]), [m0 + 1.5, k - 19, 1], [m0 + 2.5, k - 17, 1.5], [H, k - 24, 2]];
      return {
        bpm: this.tempo,
        room: 0.12,
        echo: { amount: 0.6, beats: 0.5, feedback: 0.25 },
        fadeOut: 0.6,
        tracks: [
          { kind: 'lead', inst: 'pulse50', notes: part(motif(k - 12, COLOURS.sixty, m0, { colourBeats: 1.5 }), total), gain: 1 },
          { kind: 'harmony', inst: 'pluck', notes: part([...ticks, [m0, [k - 8, k - 5], 1.5, 0.7], [m0 + 1.5, [k - 7, k - 3], 1, 0.7], [m0 + 2.5, [k - 5, k - 1], 1.5, 0.75]], total), gain: 0.7, pan: 0.2 },
          { kind: 'lead', inst: 'bell', notes: part([[H, [k, k + 4, k + 7, k + 12], total - H, 0.8]], total), arp: 0.04, gain: 0.6, echo: 0.25 },
          { kind: 'bass', inst: { wave: 'pulse25', preset: 'pulse25', s: 0.5, d: 0.08 }, notes: part(bass, total), gain: 0.65 },
          { drums: drums([...range(0, m0, 1).map((b, i) => [b, 'X', i % 2 ? 0.55 : 0.8]), ...range(m0, H, 0.5).map((b, i) => [b, 'H', i % 2 ? 0.35 : 0.55]), [H, 'C', 0.75]], total) },
          { drums: drums([...range(m0, H, 1).map((b, i) => [b, i % 2 ? 'S' : 'K', 0.9]), [H, 'K'], [C, 'K', 0.8]], total) },
        ],
      };
    },
  },
};

// Unknown programmes: the channel signature in C major.
const GENERIC = {
  bpm: 120,
  key: 60,
  build(H, C) {
    const k = 60;
    const m0 = H - 4;
    const total = C + 2;
    return {
      bpm: this.tempo,
      room: 0.18,
      echo: { amount: 0.8, beats: 0.75, feedback: 0.28 },
      fadeOut: 0.8,
      tracks: [
        { kind: 'lead', inst: 'pulse50', notes: part(motif(k, COLOURS.home, m0), total) },
        { kind: 'harmony', inst: 'pad', notes: part([[m0, [k - 8, k - 5], 1.5, 0.7], [m0 + 1.5, [k - 7, k - 3], 1, 0.75], [m0 + 2.5, [k - 5, k - 1], 1.5, 0.8], [H, [k, k + 4, k + 7], total - H, 0.9]], total) },
        { kind: 'bass', inst: 'tri', notes: part([...range(0, m0, 1).map((b) => [b, k - 24, 0.9, 0.8]), [m0, k - 24, 1.5], [m0 + 1.5, k - 19, 1], [m0 + 2.5, k - 17, 1.5], [H, k - 24, 2.5]], total) },
        { drums: drums([...range(0, H, 0.5).map((b, i) => [b, 'H', i % 2 ? 0.3 : 0.5]), [H, 'C', 0.8]], total) },
        { drums: drums([...range(0, H, 1).map((b, i) => [b, i % 2 ? 'S' : 'K', 0.85]), [H, 'K'], [C, 'K', 0.8]], total) },
      ],
    };
  },
};

/**
 * Theme tune for a programme's open. The final chord lands on the title
 * lock-up (`duration - 0.8` s) and a soft timpani button on the cut.
 * Returns a tune with `meta: { programId, motif, colour, key, bpm, hitAt, cutAt }`.
 */
export function themeFor(programId, { duration = 4 } = {}) {
  const def = OPENS[programId] ?? GENERIC;
  const dur = Math.min(8, Math.max(2.5, Number(duration) || 4));
  const lockAt = Math.max(2.2, dur - 0.8);
  const H = Math.max(5, Math.round((lockAt * def.bpm) / 60));
  const tempo = (H * 60) / lockAt;
  const C = (dur * tempo) / 60;
  const tune = def.build.call({ tempo }, H, C);
  const colourKey = { 'world-now': 'home', 'tech-bytes': 'tech', cosmos: 'cosmos', 'money-minute': 'money', 'news-60': 'sixty' }[programId] ?? 'home';
  return {
    ...tune,
    meta: { programId: OPENS[programId] ? programId : 'generic', motif: MOTIF, colour: colourKey, key: midiToName(def.key), bpm: tempo, hitAt: lockAt, cutAt: dur },
  };
}

export const THEME_IDS = Object.keys(OPENS);

// -------------------------------------------------------------- channel cues

// Ident before every break (~3.2 s): the signature with its home colour, full band.
export const IDENT = (() => {
  const k = D4;
  const H = 4;
  const total = 6.5;
  return {
    bpm: 120,
    room: 0.22,
    echo: { amount: 0.9, beats: 0.75, feedback: 0.3 },
    fadeOut: 0.6,
    tracks: [
      { kind: 'lead', inst: 'brass', notes: part(motif(k, COLOURS.home, 0), total), gain: 1.05 },
      { kind: 'lead', inst: 'pulse12', notes: part(motif(k + 12, COLOURS.home, 0, { vel: 0.5 }), total), gain: 0.45, pan: 0.2, echo: 0.35 },
      { kind: 'harmony', inst: 'pad', notes: part([[0, [k - 8, k - 5], 1.5, 0.7], [1.5, [k - 7, k - 3], 1, 0.75], [2.5, [k - 5, k - 1], 1.5, 0.8], [H, [k, k + 4, k + 7], total - H, 0.9]], total), pan: -0.2 },
      { kind: 'bass', inst: 'tri', notes: part([[0, k - 24, 1.5], [1.5, k - 19, 1], [2.5, k - 17, 1.5], [H, k - 24, 2.5]], total) },
      { kind: 'lead', inst: 'bell', notes: part([[H, k + 12, 0.25, 0.5], [H + 0.25, k + 16, 0.25, 0.5], [H + 0.5, k + 19, 0.25, 0.55], [H + 0.75, k + 24, 0.25, 0.55], [H + 1, k + 26, 1.5, 0.5]], total), gain: 0.45, echo: 0.55, pan: 0.3 },
      { drums: drums([[0, 'K'], [1.5, 'K', 0.85], [2.5, 'S', 0.8], [3.5, 'S', 0.5], [3.75, 'S', 0.7], [H, 'K']], total) },
      { drums: drums([[0, 'O', 0.4], [H, 'C', 0.85]], total) },
    ],
    meta: { cue: 'ident', colour: 'home', key: 'D4' },
  };
})();

// Stinger (0.8 s): a rising hiss with the first notes of the signature glinting on top.
export const STINGER = (() => {
  const k = D4 + 24;
  return {
    bpm: 150,
    room: 0.2,
    echo: { amount: 1.2, beats: 0.5, feedback: 0.35 },
    loudness: -4,
    fadeOut: 0.3,
    tracks: [
      { drums: drums([[0, 'W', 0.9]], 2) },
      { kind: 'lead', inst: 'bell', notes: part(motif(k, null, 0.5, { scale: 0.5, vel: 0.7 }).map(([b, m, d, v], i, a) => [b, m, i === a.length - 1 ? 0.75 : d, v]), 2.5), gain: 0.55, echo: 0.6 },
    ],
    meta: { cue: 'stinger' },
  };
})();

// Breaking news (~2.6 s): the signature in D minor, low brass over timpani.
export const BREAKING = (() => {
  const k = D4 - 12; // D3
  const H = 4;
  const total = 6;
  return {
    bpm: 132,
    room: 0.2,
    echo: { amount: 0.5, beats: 0.75, feedback: 0.25 },
    fadeOut: 0.6,
    tracks: [
      { kind: 'lead', inst: 'brass', notes: part(motif(k, COLOURS.breaking, 0), total), gain: 1.1 },
      { kind: 'lead', inst: 'pulse50', notes: part(motif(k + 12, COLOURS.breaking, 0, { vel: 0.5 }), total), gain: 0.4, pan: 0.15 },
      { kind: 'harmony', inst: 'pad', notes: part([[0, [k - 3, k], 2.5, 0.7], [2.5, [k - 2, k + 2], 1.5, 0.75], [H, [k, k + 3, k + 7], total - H, 0.9]], total), pan: -0.15 },
      { kind: 'bass', inst: 'timpani', notes: part([[0, k - 12, 2.5], [2.5, k - 14, 1.5, 0.8], ...range(3, H, 0.25).map((b, i) => [b, k - 12, 0.25, 0.4 + i * 0.12]), [H, k - 12, 2]], total) },
      { drums: drums([[0, 'K'], [2.5, 'S', 0.7], ...range(3, H, 0.25).map((b, i) => [b, 'S', 0.35 + i * 0.12]), [H, 'K']], total) },
      { drums: drums([[H, 'C', 0.6]], total) },
    ],
    meta: { cue: 'breaking', colour: 'breaking', key: 'D3 minor' },
  };
})();

// Sign-off (~3.2 s): slower, softer, the signature comes home to the tonic.
export const OUTRO = (() => {
  const k = D4;
  const total = 5.5;
  const lead = [...motif(k, COLOURS.home, 0, { colourBeats: 1 }), [3.5, k, 2, 0.85]];
  return {
    bpm: 104,
    room: 0.35,
    echo: { amount: 1.2, beats: 0.75, feedback: 0.4 },
    loudness: -1,
    fadeOut: 0.8,
    tracks: [
      { kind: 'lead', inst: 'softtri', notes: part(lead, total), gain: 1.1 },
      { kind: 'harmony', inst: 'pad', notes: part([[0, [k - 8, k - 5], 1.5, 0.6], [1.5, [k - 7, k - 3], 1, 0.65], [2.5, [k - 5, k - 3], 1, 0.7], [3.5, [k - 12, k - 8, k - 5], 2, 0.75]], total), pan: -0.2 },
      { kind: 'lead', inst: 'bell', notes: part([[3.5, k + 12, 0.5, 0.45], [4, k + 16, 0.5, 0.4], [4.5, k + 19, 1, 0.4]], total), gain: 0.4, echo: 0.6, pan: 0.3 },
      { kind: 'bass', inst: 'tri', notes: part([[0, k - 24, 1.5], [1.5, k - 19, 1], [2.5, k - 17, 1], [3.5, k - 24, 2]], total) },
      { drums: drums([[0, 'O', 0.35], [3.5, 'K', 0.6]], total) },
    ],
    meta: { cue: 'outro', colour: 'home', key: 'D4' },
  };
})();

// "Up next" promo bed (~4.2 s): a light groove; the signature ends on 2 and
// the last bar sits on the dominant - the story is still to come.
export const PROMO = (() => {
  const k = D4;
  const total = 8.4;
  const bassNotes = [[0, k - 24], [2, k - 25], [4, k - 29], [6, k - 17]];
  const bass = bassNotes.flatMap(([b, m]) => range(b, b + 2, 0.5).map((x, i) => [x, i % 2 ? m + 12 : m, 0.45, 0.8]));
  return {
    bpm: 120,
    room: 0.18,
    echo: { amount: 0.9, beats: 0.75, feedback: 0.3 },
    loudness: -2,
    fadeOut: 0.5,
    tracks: [
      { kind: 'lead', inst: 'pulse25', notes: part([...motif(k, COLOURS.next, 2, { colourBeats: 1.5 }), ...motif(k, null, 6, { vel: 0.85 }).slice(0, 3).map(([b, m, d, v], i) => [b, m, i === 2 ? 1.4 : d, v])], total) },
      { kind: 'harmony', inst: 'pad', notes: part([[0, [k - 8, k - 5], 2, 0.55], [2, [k - 10, k - 6], 2, 0.6], [4, [k - 10, k - 5], 2, 0.6], [6, [k - 8, k - 5, k - 1], 2.4, 0.65]], total), gain: 0.8, pan: -0.25 },
      { kind: 'bass', inst: { wave: 'tri', preset: 'tri', s: 0.6, d: 0.12 }, notes: part(bass, total) },
      { drums: drums(range(0, 8, 0.5).map((b, i) => [b, 'H', i % 2 ? 0.3 : 0.5]), total) },
      { drums: drums(range(0, 8, 1).map((b, i) => [b, i % 2 ? 'S' : 'K', i % 2 ? 0.6 : 0.8]), total) },
    ],
    meta: { cue: 'promo', colour: 'next', key: 'D4' },
  };
})();

/** Named channel cues, as played by AudioEngine.sfx(name). */
export const CUES = Object.freeze({
  jingle: IDENT, ident: IDENT, bumper: IDENT,
  whoosh: STINGER, stinger: STINGER,
  breaking: BREAKING,
  outro: OUTRO, signoff: OUTRO,
  promo: PROMO, upnext: PROMO,
});
