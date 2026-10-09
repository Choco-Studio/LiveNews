// GLOBIT 24's sonic identity. One four-note signature - low 5, 1, 2, high 5
// ("da-da-da-DAH") - rises by a fourth, a step and a fourth: open, confident,
// with no third, so it belongs to no mode until a fifth "colour" note gives
// each use its own mood. The colour always sounds over a tonic pedal (the
// bass stays on 1 while the harmony moves above it), so it is heard as a
// degree of the key, not as a tone of some passing chord:
//   channel / WORLD NOW  -> 3   (D major; resolves 3 -> 1 at the sign-off)
//   TECH BYTES           -> b7  (A dorian: the Am6/9, F# against C)
//   COSMOS DESK          -> #4  (E lydian: Emaj9#11)
//   MONEY MINUTE         -> 6   (F major, F6/9)
//   NEWS IN 60           -> 8   (G: the octave, "the minute starts")
//   BREAKING             -> b3  (the programme's key, minor, low and firm)
//   UP NEXT promo        -> 2   (three notes, left hanging on 2 over IV add9)
// Harmony leans on sevenths, ninths and plagal moves (no V-I fanfares, no
// pentatonic jingles); voices are filtered (tune.js), with no chip arpeggios,
// crashes or whooshes. The motif is reserved for opens, the ident, sign-offs,
// breaking news and promos - the 0.8 s stinger is a felt thump, not a tune.
// Arrangements follow docs/programmes/*.md ("Music and sound").
// Every cue is a plain tune object (see tune.js / CONTRACTS.md).

import { midiToName } from './tune.js';
import { WN_CUES, WN_BPM } from '../scenes/opens/worldcues.js';
import { CUES as SEQ_CUES } from '../scenes/opens/cues.js';

/** The signature as semitones from the tonic and lengths in beats. */
export const MOTIF = Object.freeze([[-5, 0.5], [0, 0.5], [2, 0.5], [7, 1]]);
export const COLOURS = Object.freeze({ home: 4, tech: 10, cosmos: 6, money: 9, sixty: 12, weather: 11, breaking: 3, next: 2 });

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

// Lead voices: each programme carries the motif on its own instrument.
const LEAD = {
  softPulse: { wave: 'pulse25', preset: 'pulse25', a: 0.022, vib: [10, 5.2, 0.35], cutoff: 2700, fenv: [3, 0.1] }, // the channel, generic
  darkPulse: { wave: 'pulse25', preset: 'pulse25', a: 0.015, cutoff: 3300, fenv: [2.4, 0.1] }, // NEWS IN 60
  glass: { wave: 'pulse12', preset: 'pulse12', a: 0.006, d: 0.3, s: 0.45, r: 0.2, cutoff: 2700, fenv: [3.4, 0.07] }, // ident, promo
  techPluck: { wave: 'pulse12', preset: 'pluck', a: 0.003, d: 0.32, s: 0.32, r: 0.14, cutoff: 3300, fenv: [3, 0.07] }, // TECH BYTES
  epiano: { wave: 'pulse50', preset: 'keys', a: 0.005, d: 0.6, s: 0.3, r: 0.22, cutoff: 3200, fenv: [2.6, 0.12] }, // MONEY MINUTE
  tick: { wave: 'pulse25', preset: 'pluck', a: 0.003, d: 0.08, s: 0, r: 0.05, cutoff: 1800, fenv: false },
  halo: { wave: 'pulse12', preset: 'pulse12', a: 0.03, d: 0.4, s: 0.5, r: 0.3, vib: [8, 4.8, 0.3], cutoff: 5000, fenv: [2, 0.2] }, // COSMOS shimmer above the triangle
  breeze: { wave: 'pulse12', preset: 'pulse12', a: 0.02, d: 0.35, s: 0.6, r: 0.28, vib: [9, 5, 0.25], cutoff: 3400, fenv: [2.2, 0.14] }, // WORLD WEATHER, airy
  horn: { wave: 'pulse25', preset: 'brass', cutoff: 3400, fenv: [3, 0.16] }, // the brass octave that carries the melody
  strings: { wave: 'pulse12', preset: 'pad', a: 0.12, d: 0.6, s: 0.85, r: 0.5, vib: [10, 5.2, 0.25], legato: 1, cutoff: 6500 }, // high strings on WORLD NOW's hit
};

// The button on the cut: a short low-mid stab over the felt thump, so the
// cut is heard as a downbeat and not only felt.
const stab = (inst, chord, C, total, vel = 0.65, gain = 0.9) => ({ kind: 'harmony', inst, notes: part([[C, chord, 0.5, vel]], total), gain });

// ------------------------------------------------------------------ opens

// The five title sequences' themes (opens/cues.js). Each is scored to its pictures on the cue sheet
// and voice-led so that no two parts sound a semitone apart: ensembles (tune.js `strings`, `warm`:
// detuned voices spread across the field) for the harmony, a long hall on the ones that travel.
const ENS = {
  // a wide stab: two detuned keys, for the moments that hit
  stab: { wave: 'pulse50', preset: 'keys', a: 0.004, d: 0.3, s: 0.2, r: 0.18, cutoff: 2600, unison: 2, detune: 9, spread: 0.6 },
  // TECH BYTES' data: a pulse12 in sixteenths, low-passed (the bible's arpeggio, written out)
  data: { wave: 'pulse12', preset: 'pulse12', a: 0.003, d: 0.1, s: 0.3, r: 0.08, cutoff: 1800, vib: false, legato: 0.8 },
  // COSMOS DESK's orbit: a soft triangle with a short sustain (not a bell)
  orbit: { wave: 'triangle', preset: 'softtri', a: 0.012, d: 0.4, s: 0.32, r: 0.3, vib: false, cutoff: 3200 },
  // the bell, twice as loud: in a hall it rings against strings, not a bare pad
  bell: { wave: 'pulse12', preset: 'bell', gain: 1.9 },
};

// Deterministic jitter in [0, 1) (the rain).
const hash01 = (i) => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

// COSMOS DESK's title sequence (opens/cues.js): the voyage. E lydian, 82 BPM, strings in a long hall.
// The deep field is Emaj7 on the strings over a sine sub, a soft triangle orbiting in eighths and a
// bell on each star the camera passes (three, with the long echo: never more than four a bar). The
// planet's arrival is a timpani roll into a stroke with a felt thump, the low strings and F#/E (the
// lydian II, the colour #4 in the air); the sun bursting at the limb rings G#+D# high over a warm
// chord; day coming round is C#m9 over the E pedal and a triangle rising through Emaj9; then the
// signature (softtri, halo an octave up, the orbit above it) over E add9 and F#/E, and Emaj9#11 on
// the hit.
function cosmosTitles(tempo, H, C) {
  const k = 64; // E4
  const Qc = SEQ_CUES.cosmos;
  const q = H / Qc.hit;
  const at = (b) => b * q;
  const m0 = H - 4;
  const total = C + 3;
  const fly = at(Qc.flyby);
  const burst = at(Qc.burst);
  const pull = at(Qc.pull);
  const glints = Qc.glints.map(at);
  const ch = {
    emaj7: [k - 12, k - 5, k + 4, k + 11], // E3 B3 G#4 D#5: the deep field
    two: [k - 10, k - 3, k + 2, k + 6], // F#3 C#4 F#4 A#4: F#/E, the planet
    csm9: [k - 8, k - 3, k + 4, k + 7, k + 11], // G#3 C#4 G#4 B4 D#5: C#m9 over E, day comes round
    add9: [k - 12, k - 8, k - 5, k + 2], // E3 G#3 B3 F#4: under the signature
    hit: [k - 12, k - 5, k - 1, k + 4], // E3 B3 D#4 G#4 (+ F#5 A#5 above: Emaj9#11)
  };
  // the orbit: root, fifth, ninth, fifth in eighths; it rests while day comes round and returns an
  // octave up over the signature
  const cell = (b) => {
    if (b < fly) return [k, k + 7, k + 14, k + 7]; // E4 B4 F#5 B4
    if (b < pull) return [k + 2, k + 9, k + 16, k + 9]; // F#4 C#5 G#5 C#5
    if (b < m0) return null;
    if (b < m0 + 2.5) return [k + 12, k + 19, k + 14, k + 19]; // E5 B5 F#5 B5
    return [k + 14, k + 21, k + 18, k + 21]; // F#5 C#6 A#5 C#6
  };
  const orbit = range(0, H, 0.5).flatMap((b, i) => {
    const c = cell(b);
    if (!c) return [];
    const v = b < fly ? 0.18 + 0.1 * (b / fly) : b < pull ? 0.3 : 0.24;
    return [[b, c[i % 4], 0.5, v + (i % 2 ? 0 : 0.05)]];
  });
  // day coming round: E, G#, B, D#, F# rising half a beat apart, into the signature
  const rise = [k - 12, k - 8, k - 5, k - 1, k + 2].map((m, i) => [pull + i * 0.5, m, 0.5, 0.34 + i * 0.04]);
  // the planet's approach: a timpani roll swelling into the stroke
  const roll = range(fly - 1, fly, 0.125).map((b, i, a) => [b, k - 24, 0.125, 0.12 + (0.3 * i) / Math.max(1, a.length - 1)]);
  return {
    bpm: tempo,
    room: 0.3,
    hall: 0.45,
    echo: { amount: 1.2, beats: 0.75, feedback: 0.42 },
    fadeOut: 1.4,
    tracks: [
      { kind: 'lead', inst: 'softtri', notes: part([...motif(k, COLOURS.cosmos, m0, { colourBeats: 1.5 }), [H, k + 7, C - H - 0.25, 0.8]], total), gain: 1 },
      { kind: 'lead', inst: LEAD.halo, notes: part(motif(k + 12, COLOURS.cosmos, m0, { vel: 0.5 }), total), gain: 0.92, echo: 0.6, pan: -0.25 },
      { kind: 'harmony', inst: ENS.orbit, notes: part(orbit, total), gain: 1.6, echo: 0.5, pan: 0.3 },
      { kind: 'harmony', inst: 'softtri', notes: part(rise, total), gain: 1.2, echo: 0.6, pan: -0.15 },
      { kind: 'harmony', inst: ENS.bell, notes: part([
        [glints[0], k + 19, 1, 0.52], [glints[1], k + 23, 1, 0.5], [glints[2], k + 26, 1, 0.48], // the stars: B, D#, F#
        [burst, [k + 20, k + 27], 1.5, 0.58], // the sun at the limb: G# and D#
        [m0 + 3, k + 18, 1, 0.44], // the colour, high (A#)
        [H, [k + 20, k + 27], 2, 0.55],
      ], total), gain: 2, echo: 0.65, pan: 0.35 },
      { kind: 'harmony', inst: 'strings', notes: part([
        [0, ch.emaj7, fly, 0.4],
        [fly, ch.two, pull - fly, 0.5],
        [pull, ch.csm9, m0 - pull, 0.52],
        [m0, ch.add9, 2.5, 0.56],
        [m0 + 2.5, ch.two, 1.5, 0.6],
        [H, ch.hit, total - H, 0.74],
      ], total), gain: 1.8, pan: -0.1 },
      // the planet's mass: low strings from the fly-by
      { kind: 'harmony', inst: 'strings', notes: part([[fly, [k - 24, k - 17], H - fly, 0.5], [H, [k - 24, k - 17], total - H, 0.58]], total), gain: 1.45 },
      // the sun's light: a warm chord high with the burst, and the #11 over the hit
      { kind: 'harmony', inst: 'warm', notes: part([[burst, [k + 9, k + 14, k + 18], pull - burst, 0.4], [H, [k + 14, k + 18], total - H, 0.46]], total), gain: 1.35, pan: 0.2 },
      { kind: 'bass', inst: 'sine', notes: part([[0, k - 24, fly, 0.6], [fly, k - 24, H - fly, 0.75], [H, k - 24, total - H, 0.85]], total), gain: 0.6 },
      { kind: 'bass', inst: 'timpani', notes: part([...roll, [fly, k - 24, 1.5, 0.62], [H, k - 24, 2, 0.6]], total), gain: 0.95 },
      stab('pluck', [k - 12, k - 5, k - 1], C, total, 0.9, 2),
      { drums: drums([[fly, 'F', 0.5], [H, 'F', 0.55], [C, 'F', 0.45]], total), gain: 1.9 },
      { drums: drums([[C, 'T', 0.5]], total), gain: 1.9 },
    ],
  };
}

// MONEY MINUTE's title sequence (opens/cues.js): after the close. F major, 114 BPM, straight, a
// full-time feel without hats. Fmaj9 from silence on a warm pad; the short e-piano chords on the
// "and" of 2 and 4 are the bursts of windows coming on; the tri bass enters in half notes (root and
// fifth) with Dm9, a soft kick and snare with it, and the strings rise as the sun goes down. The
// cut to the tower is Bbmaj9 with a felt thump: the kit stops, and each floor going dark is a
// falling e-piano note on the beat (D, C, A) over a soft felt; the last window is a high F, alone.
// The ledger opens on C9sus4, the kit picks up again with a snare pickup, and the signature on the
// e-piano runs over Bbmaj9, C9sus4 and Bb/F (the colour over the F pedal), the strings holding F
// and Bb above it, into F6/9 on the hit. No swing, brass, bells, coins or arpeggio; nothing above C6.
function moneyTitles(tempo, H, C) {
  const k = 65; // F4
  const Qc = SEQ_CUES['money-minute'];
  const q = H / Qc.hit;
  const at = (b) => b * q;
  const m0 = H - 4;
  const total = C + 2;
  const sun = at(Qc.sun);
  const cut = at(Qc.cut);
  const ledger = at(12);
  const [o9, o10, o11] = Qc.off.map(at);
  const last = at(Qc.last);
  const ch = {
    fmaj9: [k - 8, k - 5, k - 1, k + 2], // A3 C4 E4 G4
    dm9: [k - 12, k - 8, k - 5, k - 1], // F3 A3 C4 E4
    bbmaj9: [k - 8, k - 5, k - 3, k], // A3 C4 D4 F4
    c9sus: [k - 7, k - 3, k, k + 2], // Bb3 D4 F4 G4 (over C)
    bbF: [k - 7, k - 3, k], // Bb3 D4 F4 (over the F pedal)
    f69: [k - 8, k - 3, k + 2, k + 7], // A3 D4 G4 C5
  };
  // the e-piano's voicings, above the pad
  const ep = {
    f: [k - 1, k + 2, k + 4, k + 7], // E4 G4 A4 C5
    dm: [k - 3, k + 4, k + 7, k + 11], // D4 A4 C5 E5 (no F against the pad's E)
    bb: [k - 3, k, k + 4, k + 7], // D4 F4 A4 C5
    c: [k - 3, k, k + 2, k + 5], // D4 F4 G4 Bb4
    bbF: [k - 3, k, k + 5], // D4 F4 Bb4
  };
  const chordAt = (b) => (b < at(4) ? ep.f : b < cut ? ep.dm : b < ledger ? ep.bb : b < m0 + 2.5 ? ep.c : ep.bbF);
  // the keys on the "and" of 2 and 4 (with the bursts of windows); none while the floors go dark
  // until the beat after the bit
  const keys = [...Qc.lights.map(at), at(13.5), m0 + 1.5, m0 + 3.5].map((b, i) => [b, chordAt(b), 0.45, Math.min(0.65, 0.42 + i * 0.03)]);
  // the tri bass in half notes, root and fifth, from Dm9; the signature's bar follows its chords
  const bass = [
    [at(4), k - 27, 2, 0.72], [at(6), k - 20, 2, 0.66], // D A
    [cut, k - 31, 2, 0.8], [at(10), k - 24, 2, 0.72], // Bb F
    [ledger, k - 29, 1, 0.8], [at(13), k - 22, 1, 0.72], // C G
    [m0, k - 31, 1, 0.85], [m0 + 1, k - 29, 1.5, 0.85], [m0 + 2.5, k - 24, 1.5, 0.88], // Bb C F
    [H, k - 24, total - H, 0.88],
  ];
  return {
    bpm: tempo,
    swing: 0,
    room: 0.2,
    hall: 0.18,
    echo: { amount: 0.6, beats: 0.75, feedback: 0.26 },
    fadeOut: 0.9,
    tracks: [
      { kind: 'lead', inst: LEAD.epiano, notes: part([...motif(k, COLOURS.money, m0), [H, k + 12, C - H - 0.25, 0.85]], total), gain: 1.1 },
      // the floors going dark, then the last window
      { kind: 'lead', inst: LEAD.epiano, notes: part([[o9, k + 9, 0.9, 0.52], [o10, k + 7, 0.9, 0.5], [o11, k + 4, 0.5, 0.48], [last, k + 12, 1.2, 0.58]], total), gain: 1.2, echo: 0.55, pan: 0.15 },
      { kind: 'harmony', inst: 'keys', notes: part([...keys, [H, ch.f69, 1.5, 0.75]], total), gain: 2, pan: 0.25, echo: 0.2 },
      { kind: 'harmony', inst: 'warm', notes: part([
        [0, ch.fmaj9, at(4), 0.3], [at(4), ch.dm9, cut - at(4), 0.42], [cut, ch.bbmaj9, ledger - cut, 0.5],
        [ledger, ch.c9sus, m0 - ledger, 0.52], [m0, ch.bbmaj9, 1, 0.55], [m0 + 1, ch.c9sus, 1.5, 0.56], [m0 + 2.5, ch.bbF, 1.5, 0.58],
        [H, ch.f69, total - H, 0.68],
      ], total), gain: 1.36, pan: -0.2 },
      // the strings rise as the sun goes down; over the signature they hold F and Bb above it
      { kind: 'harmony', inst: 'strings', notes: part([
        [sun, [k + 4, k + 7, k + 11], cut - sun, 0.4], // A C E
        [cut, [k + 4, k + 9, k + 12], ledger - cut, 0.46], // A D F
        [ledger, [k + 2, k + 9, k + 12], m0 - ledger, 0.5], // G D F
        [m0, [k + 12, k + 16], 1, 0.52], // F A
        [m0 + 1, [k + 12, k + 17], 3, 0.56], // F Bb
        [H, [k + 16, k + 19], total - H, 0.62], // A C
      ], total), gain: 1.2, pan: 0.1 },
      { kind: 'bass', inst: 'tri', notes: part(bass, total), gain: 0.54 },
      stab('keys', [k - 12, ...ch.f69.slice(0, 3)], C, total, 0.7, 2),
      // a soft kick and snare from the sun to the cut, and again from the ledger; felts on the cut,
      // under each floor going dark, on the hit and the button
      { drums: drums([[at(4), 'K', 0.42], [at(6), 'K', 0.42], [at(7.5), 'K', 0.26], [ledger, 'K', 0.4], [m0, 'K', 0.5], [m0 + 2, 'K', 0.48], [m0 + 2.5, 'K', 0.3], [H, 'K', 0.62]], total), gain: 2 },
      { drums: drums([[at(5), 'S', 0.44], [at(7), 'S', 0.48], [at(13), 'S', 0.44], [at(13.5), 'S', 0.3], [at(13.75), 'S', 0.44], [m0 + 1, 'S', 0.53], [m0 + 3, 'S', 0.57]], total), gain: 2 },
      { drums: drums([[cut, 'F', 0.5], [o9, 'F', 0.3], [o10, 'F', 0.32], [o11, 'F', 0.34], [H, 'F', 0.7], [C, 'F', 0.55]], total), gain: 1.43 },
      { drums: drums([[C, 'T', 0.42]], total), gain: 1.8 },
    ],
  };
}

// NEWS IN 60's title sequence (opens/cues.js): the minute starts. G, 120 BPM, dark, a clock. A warm
// G add9 from silence over the close-up; the pusher going down is one soft click; then the
// tick-tock under the hand's turn (a staccato tri on each beat, a low-passed tick off it, each the
// passing of a five-minute tick) over a sine sub on G, and the strings climb in triads over the G
// pedal, a step every two beats (Em, Am, Bm: G6, G7sus, Gmaj7). The hand stopping at twelve is
// the last tock with a short D chord, and "60" lights in the silence after it. Then the signature on
// the low-passed pulse with its octave over the tick-tock again, the strings above it (G add9, C/G,
// G sus2), and a Gadd9 bell chord with one soft kick on the hit.
function newsTitles(tempo, H, C) {
  const k = 67; // G4
  const Qc = SEQ_CUES['news-60'];
  const q = H / Qc.hit;
  const at = (b) => b * q;
  const m0 = H - 4;
  const total = C + 1.5;
  const press = at(Qc.press);
  const turn = at(Qc.turn);
  // the turn: tock on the beat (the tri), tick off it; then again under the signature
  const tocks = [...range(press, turn + 0.01, 1), ...range(m0, H, 1)];
  const ticks = [...range(press + 0.5, turn, 1), ...range(m0 + 0.5, H, 1)];
  const step = (turn - press) / 3;
  const TICK = { ...LEAD.tick, gain: 1.6 };
  return {
    bpm: tempo,
    room: 0.14,
    hall: 0.16,
    echo: { amount: 0.6, beats: 0.5, feedback: 0.24 },
    fadeOut: 0.7,
    tracks: [
      { kind: 'lead', inst: LEAD.darkPulse, notes: part(motif(k - 12, COLOURS.sixty, m0, { colourBeats: 1.5 }), total), gain: 0.9 },
      { kind: 'harmony', inst: TICK, notes: part([[press - 0.02, k + 5, 0.2, 0.42], ...ticks.map((b, i) => [b, k + 12, 0.25, 0.44 + 0.015 * (i % 6)])], total), gain: 0.85, pan: 0.22, echo: 0.3 },
      { kind: 'harmony', inst: 'warm', notes: part([
        [0, [k - 12, k - 8, k - 5, k + 2], press, 0.4], // G add9, from silence
        [m0, [k - 12, k - 5], 1.5, 0.5], // open fifth under the signature
        [m0 + 1.5, [k - 12, k - 7, k - 3], 1, 0.55], // C/G
        [m0 + 2.5, [k - 12, k - 10, k - 5], 1.5, 0.55], // G sus2 under the octave
        [H, [k - 12, k - 8, k - 5, k + 2], total - H, 0.62],
      ], total), gain: 0.81, pan: -0.18 },
      // the strings climb over the pedal: Em/G, Am/G, Bm/G; D on the stop; above the signature
      { kind: 'harmony', inst: 'strings', notes: part([
        [press, [k - 8, k - 3, k], step, 0.4], // B3 E4 G4
        [press + step, [k - 7, k - 3, k + 2], step, 0.46], // C4 E4 A4
        [press + 2 * step, [k - 5, k - 1, k + 4], step, 0.52], // D4 F#4 B4
        [m0, [k + 4, k + 7, k + 14], 1.5, 0.46], // B4 D5 A5
        [m0 + 1.5, [k + 5, k + 9, k + 12], 1, 0.5], // C5 E5 G5
        [m0 + 2.5, [k + 2, k + 7, k + 12], 1.5, 0.52], // A4 D5 G5
        [H, [k + 4, k + 7, k + 12], total - H, 0.56], // B4 D5 G5
      ], total), gain: 0.95, pan: 0.12 },
      // the hand stops: a short D over the last tock
      { kind: 'harmony', inst: ENS.stab, notes: part([[turn, [k - 5, k - 1, k + 2, k + 7], 0.5, 0.6]], total), gain: 1.5 },
      { kind: 'lead', inst: 'bell', notes: part([[H, [k, k + 4, k + 7, k + 14], total - H, 0.75]], total), gain: 1.07, echo: 0.3, pan: 0.15 },
      { kind: 'bass', inst: { wave: 'tri', preset: 'tri', s: 0.4, d: 0.12 }, notes: part([...tocks.map((b, i) => [b, k - 24, 0.4, b === turn ? 0.85 : 0.7 + (i % 2 ? 0 : 0.05)]), [H, k - 24, total - H, 0.85]], total), gain: 0.74 },
      { kind: 'bass', inst: 'sine', notes: part([[press, k - 36, turn + 0.5 - press, 0.5], [m0, k - 36, H - m0, 0.58], [H, k - 36, total - H, 0.7]], total), gain: 0.44 },
      stab(TICK, [k - 12, k - 5], C, total, 0.75, 1.75),
      { drums: drums([[H, 'K', 0.72], [C, 'F', 0.55]], total) },
      { drums: drums([[C, 'T', 0.4]], total) },
    ],
  };
}

// WORLD WEATHER's title sequence (opens/cues.js): up through the weather. C major, 92 BPM, the 7th as
// its colour (the open sky), strings in a long hall. The storm is A minor: low strings and a dark pad
// under a timpani roll, rain on a soft hat; the lightning is a timpani stroke on a felt thump with
// the strings and the roll swelling after it (the distant sheet, a softer stroke). The rain stops
// and the climb lifts through Fmaj7 and G, a bell line rising and an air swell cresting as the cloud
// pales; the breakout is Cmaj7 with a felt thump, the strings high and bells (the sun); two bells as
// the last cloud rises; then the signature on an airy pulse over Cmaj9, Fmaj7/C and C add9 (its
// colour, B, over the C pedal), resolving to C on the hit with Cmaj9.
function weatherTitles(tempo, H, C) {
  const k = 60; // C4
  const Qc = SEQ_CUES['world-weather'];
  const q = H / Qc.hit;
  const at = (b) => b * q;
  const m0 = H - 4;
  const total = C + 2.5;
  const flash = at(Qc.flash);
  const sheet = at(Qc.sheet);
  const climb = at(Qc.climb);
  const out = at(Qc.breakout);
  const wisp = at(Qc.wisp);
  const g = climb + 1.5; // the climb's second chord
  // the storm's roll: sixteenths on A, swelling into the strike and again after it
  const roll = range(0, climb, 0.25).map((b) => [b, k - 27, 0.25, 0.12 + 0.2 * Math.exp(-Math.abs(b - flash - 0.75) / 0.9) + 0.06 * Math.min(1, b / 2)]);
  // the rain: a soft hat in sixteenths, uneven, thinning out as the camera climbs
  const rain = range(0, climb, 0.25).flatMap((b, i) => (hash01(i) < 0.85 - 0.5 * (b / climb) ? [[b, 'H', 0.3 + 0.35 * hash01(i + 101)]] : []));
  // the climb: a bell line rising as the light comes through
  const rise = [k + 4, k + 7, k + 9, k + 11, k + 12, k + 14].map((m, i) => [climb + i * 0.5, m, 0.5, 0.28 + i * 0.03]);
  return {
    bpm: tempo,
    room: 0.3,
    hall: 0.4,
    echo: { amount: 1, beats: 0.75, feedback: 0.38 },
    fadeOut: 1.2,
    tracks: [
      { kind: 'lead', inst: LEAD.breeze, notes: part([...motif(k, COLOURS.weather, m0), [H, k + 12, C - H - 0.25, 0.85]], total), gain: 1.05 },
      { kind: 'harmony', inst: ENS.bell, notes: part([
        ...rise,
        [out, [k + 11, k + 16, k + 19], 1.5, 0.6], // the sun: B, E, G
        [wisp + 1, k + 14, 1, 0.32], [wisp + 2, k + 16, 1, 0.32],
        [H, [k + 7, k + 14, k + 16], total - H, 0.45],
      ], total), gain: 1.5, echo: 0.6, pan: 0.3 },
      { kind: 'harmony', inst: { wave: 'pulse50', preset: 'warm', cutoff: 1600 }, notes: part([
        [0, [k - 15, k - 8, k - 3], climb, 0.42], // A2 E3 A3: the storm
        [climb, [k - 7, k - 3, k, k + 4], 1.5, 0.44], // Fmaj7
        [g, [k - 5, k - 1, k + 2, k + 4], out - g, 0.48], // G6: up through the cloud
        [out, [k - 12, k - 5, k - 1, k + 4], m0 - out, 0.6], // Cmaj7: above the weather
        [m0, [k - 12, k - 8, k - 5, k + 2], 1.5, 0.56], // Cmaj9 (no B under the signature's C)
        [m0 + 1.5, [k - 12, k - 7, k - 3, k + 4], 1, 0.58], // Fmaj7 over C
        [m0 + 2.5, [k - 12, k - 5, k + 2], 1.5, 0.58], // C add9 under the colour
        [H, [k - 12, k - 8, k - 5, k - 1, k + 2], total - H, 0.7], // Cmaj9
      ], total), gain: 0.91, pan: -0.2 },
      { kind: 'harmony', inst: 'strings', notes: part([
        [0, [k - 15, k - 8], flash, 0.32], // A2 E3: the storm, low
        [flash, [k - 15, k - 8, k], climb - flash, 0.42], // A2 E3 C4: the strike
        [climb, [k + 12, k + 16], 1.5, 0.42], // C5 E5
        [g, [k + 14, k + 16], out - g, 0.48], // D5 E5
        [out, [k + 16, k + 19, k + 23], m0 + 1.5 - out, 0.66], // E5 G5 B5: the sun
        [m0 + 1.5, [k + 16, k + 21], 1, 0.64], // E5 A5
        [m0 + 2.5, [k + 14, k + 19], 1.5, 0.66], // D5 G5
        [H, [k + 16, k + 19, k + 23], total - H, 0.74], // E5 G5 B5
      ], total), gain: 1, pan: 0.1 },
      // above the weather: the low strings open under the sun
      { kind: 'harmony', inst: 'strings', notes: part([[out, [k - 24, k - 17], H - out, 0.52], [H, [k - 24, k - 17], total - H, 0.6]], total), gain: 1.2 },
      { kind: 'bass', inst: 'timpani', notes: part([...roll, [flash, k - 27, 1, 0.75], [sheet, k - 27, 1, 0.45], [out, k - 24, 1.5, 0.8], [H, k - 24, C - H, 0.7]], total), gain: 0.75 },
      { kind: 'bass', inst: 'sine', notes: part([[0, k - 27, climb, 0.6], [climb, k - 31, 1.5, 0.65], [g, k - 29, out - g, 0.7], [out, k - 24, H - out, 0.75], [H, k - 24, total - H, 0.85]], total), gain: 0.39 },
      stab('pluck', [k - 12, k - 5, k - 1], C, total, 0.93, 2),
      { drums: drums(rain, total) },
      { drums: `R:${fmt(at(5))} A:${fmt(out - at(5))}@0.42` }, // the air swell crests on the breakout
      { drums: drums([[flash, 'F', 0.5], [sheet, 'F', 0.26], [out, 'F', 0.62], [H, 'F', 0.65], [C, 'F', 0.5]], total), gain: 1.1 },
      { drums: drums([[C, 'T', 0.42]], total), gain: 1.26 },
    ],
  };
}

// TECH BYTES' title sequence (opens/cues.js): the run over the board, the crane, the boot. A dorian,
// 104 BPM, half-time. The data is a pulse12 in sixteenths (low-passed, dotted echo), three notes
// against four so the accent wanders: the signature's head (E A B) over Am9 on the run, each beat
// leaning on a signal leaving the camera. A soft kick and snare in half time, a light hat, then a
// saw bass (low-passed) in eighths; the wave is a wide Am stab with a kick and a clap. In the crane
// the data climbs an octave of D9 (the dorian IV) as the camera rises, the bass pulsing on D, a high
// warm fifth joining, a snare run into the landing; the die boots on a double kick, and the techPluck
// states the signature (a glass octave above, the data sparkling over it) over Am9, D6/9 and G/A, the
// colour (G) over the A pedal, and lands on Am6/9 with the lock-up. Nothing four-on-the-floor, no
// swooshes, glitches or beeps.
function techTitles(tempo, H, C) {
  const k = 69; // A4
  const Qc = SEQ_CUES['tech-bytes'];
  const q = H / Qc.hit;
  const at = (b) => b * q;
  const m0 = H - 4;
  const total = C + 2.5;
  const wave = at(Qc.wave);
  const crane = at(Qc.crane);
  const land = at(Qc.land);
  const run2 = at(4); // the bass and the kit come in
  const ch = {
    am9: [k - 12, k - 9, k - 5, k - 2, k + 2], // A3 C4 E4 G4 B4
    d9: [k - 12, k - 9, k - 5, k - 3, k], // A3 C4 E4 F#4 A4
    d69: [k - 12, k - 10, k - 5, k - 3, k + 2], // A3 B3 E4 F#4 B4
    ga: [k - 14, k - 10, k - 7, k - 2, k + 2], // G3 B3 D4 G4 B4: G/A under the colour
    am69: [k - 12, k - 9, k - 5, k - 3, k + 2], // A3 C4 E4 F#4 B4
  };
  // the data's three notes at each moment
  const cellAt = (b) => {
    if (b < crane) return [k - 5, k, k + 2]; // E4 A4 B4
    if (b < land) {
      const s = Math.min(3, Math.floor(((b - crane) / (land - crane)) * 4));
      return [[k - 3, k, k + 3], [k, k + 3, k + 7], [k + 3, k + 7, k + 9], [k + 7, k + 9, k + 12]][s]; // up an octave of D9
    }
    if (b < m0 + 1) return [k + 7, k + 12, k + 14]; // E5 A5 B5
    if (b < m0 + 2.5) return [k + 9, k + 12, k + 14]; // F#5 A5 B5
    return [k + 14, k + 17, k + 19]; // B5 D6 E6
  };
  const data = range(0, H, 0.25).map((b, i) => {
    const onBeat = Math.abs(b - Math.round(b)) < 1e-6;
    const v = b < crane ? 0.16 + 0.14 * Math.min(1, b / wave) : b < m0 ? 0.3 + 0.06 * ((b - crane) / (m0 - crane)) : 0.24;
    return [b, cellAt(b)[i % 3], 0.25, Math.min(0.4, v + (onBeat ? 0.06 : 0))];
  });
  // the saw bass: in eighths from the second bar, pulsing on D through the crane, the boot's pickup
  const A2 = k - 24;
  const D3 = k - 19;
  const riff = [
    [run2, A2, 0.8], [run2 + 0.5, A2, 0.45], [run2 + 1, A2 + 12, 0.6], [run2 + 1.5, A2, 0.45], [run2 + 2, A2 + 3, 0.65], [run2 + 2.5, A2 + 5, 0.55],
    [wave, A2, 0.9],
    ...range(crane, land - 0.25, 0.5).map((b, i, a) => [b, D3, 0.4 + (0.35 * i) / Math.max(1, a.length - 1)]),
    [land, A2, 0.85],
    [m0, A2, 0.85], [m0 + 0.5, A2, 0.5], [m0 + 1, D3, 0.8], [m0 + 1.5, D3, 0.5], [m0 + 2, D3 + 12, 0.6],
    [m0 + 2.5, A2, 0.8], [m0 + 3, A2, 0.55], [m0 + 3.5, A2 + 12, 0.6],
  ].map(([b, m, v]) => [b, m, b === land ? 0.25 : 0.5, v]);
  // the hat: sixteenths on the run, eighths in the crane, sixteenths again for the boot
  const hat = [
    ...range(at(2), wave, 0.25).map((b, i) => [b, 'H', i % 4 === 0 ? 0.62 : i % 2 ? 0.32 : 0.45]),
    ...range(crane, land, 0.5).map((b) => [b, 'H', 0.42]),
    ...range(m0, H, 0.25).map((b, i) => [b, 'H', i % 4 === 0 ? 0.6 : i % 2 ? 0.28 : 0.42]),
  ];
  return {
    bpm: tempo,
    room: 0.18,
    hall: 0.14,
    echo: { amount: 1, beats: 0.75, feedback: 0.34 },
    fadeOut: 0.9,
    tracks: [
      { kind: 'lead', inst: LEAD.techPluck, notes: part([...motif(k, COLOURS.tech, m0), [H, k + 12, C - H - 0.25, 0.85]], total), gain: 1.15, echo: 0.45 },
      { kind: 'lead', inst: LEAD.glass, notes: part(motif(k + 12, COLOURS.tech, m0, { vel: 0.42 }), total), gain: 0.55, pan: -0.25, echo: 0.4 },
      { kind: 'harmony', inst: ENS.data, notes: part(data, total), gain: 1.3, pan: 0.3, echo: 0.6 },
      { kind: 'harmony', inst: 'warm', notes: part([
        [0, ch.am9, crane, 0.34], // Am9: the run, from quiet
        [crane, ch.d9, m0 - crane, 0.52], // D9: the crane
        [m0, ch.am9, 1, 0.52], // Am9: the boot
        [m0 + 1, ch.d69, 1.5, 0.56], // D6/9
        [m0 + 2.5, ch.ga, 1.5, 0.58], // G/A under the colour
        [H, ch.am69, total - H, 0.72], // Am6/9
      ], total), gain: 0.68, pan: -0.2 },
      // the crane's high fifth, and the hit's
      { kind: 'harmony', inst: 'warm', notes: part([[at(9), [k + 7, k + 12], m0 - at(9), 0.34], [H, [k + 7, k + 14], total - H, 0.42]], total), gain: 0.63, pan: 0.25 },
      // the wave: a wide Am stab; the hit: a mallet chord
      { kind: 'harmony', inst: ENS.stab, notes: part([[wave, [k - 5, k, k + 7, k + 10], 0.5, 0.62]], total), gain: 1.2 },
      { kind: 'harmony', inst: 'mallet', notes: part([[H, [k, k + 7, k + 14], 2, 0.5]], total), gain: 1.45, echo: 0.4, pan: 0.15 },
      { kind: 'bass', inst: 'synthbass', notes: part([...riff, [H, A2, total - H, 0.85]], total), gain: 0.65 },
      { kind: 'bass', inst: { wave: 'tri', preset: 'tri', legato: 1 }, notes: part([[0, k - 36, crane, 0.55], [crane, k - 31, land - crane, 0.7], [land, k - 36, H - land, 0.75], [H, k - 36, total - H, 0.85]], total), gain: 0.31 },
      stab('pluck', [k - 12, k - 5, k], C, total, 0.8, 1.55),
      { drums: drums([[0, 'K', 0.42], [run2, 'K', 0.5], [at(5.75), 'K', 0.28], [wave, 'K', 0.62], [land, 'K', 0.55], [m0, 'K', 0.5], [m0 + 1.75, 'K', 0.3], [m0 + 2.5, 'K', 0.36], [H, 'K', 0.68]], total), gain: 0.9 },
      { drums: drums([[at(2), 'S', 0.18], [at(6), 'S', 0.24], [at(9.5), 'S', 0.1], [at(10), 'S', 0.14], [at(10.25), 'S', 0.18], [at(10.5), 'S', 0.22], [m0 + 2, 'S', 0.3], [m0 + 3.5, 'S', 0.18], [m0 + 3.75, 'S', 0.24]], total), gain: 2 },
      { drums: drums([[wave, 'P', 0.4], [H, 'P', 0.45]], total), gain: 2 },
      { drums: drums(hat, total) },
      { drums: drums([[land, 'F', 0.36], [C, 'F', 0.44]], total) },
      { drums: drums([[C, 'T', 0.4]], total) },
    ],
  };
}

// WORLD NOW's title sequence (opens/worldcues.js): the same brass statement and final chord as the
// short open, with ten seconds of build under the pictures. Night: four pips from London (B5,
// ~1 kHz, the BBC's pips as a nod) over Bm7 and a felt timpani pulse. Network: each route that lands
// rings a bell, the signature's first three notes, and the bloom its high 5, over a quiet eighth-note
// hat. Sunrise: an air swell crests on it, a bell rings the colour (F#) with B, the strings rise and
// the timpani rolls into the brass, which states the signature (colour 3 over the D pedal) and
// lands on D add9 with the lock-up.
function worldNowTitles(tempo, H, C) {
  const k = D4;
  const q = H / WN_CUES.hit; // the cue sheet's beats on this grid (1 at the designed length)
  const at = (b) => b * q;
  const m0 = H - 4;
  const total = C + 2;
  const [l1, l2, l3] = WN_CUES.land.map(at);
  const bloom = at(WN_CUES.bloom);
  const sun = at(WN_CUES.sunrise);
  const lead = [...motif(k - 12, COLOURS.home, m0), [H, k - 12, total - H, 0.9]];
  const roll = range(sun - 0.5, m0, 0.25).map((b, i, a) => [b, k - 24, 0.25, 0.16 + (0.4 * i) / Math.max(1, a.length - 1)]);
  const PIP = { wave: 'sine', preset: 'sine', a: 0.003, d: 0.2, s: 0.85, r: 0.03, vib: false, legato: 1 };
  return {
    bpm: tempo,
    room: 0.26,
    echo: { amount: 0.7, beats: 0.75, feedback: 0.26 },
    fadeOut: 0.9,
    tracks: [
      // the brass statement first (the signature is the lead's first five notes, as in every open)
      { kind: 'lead', inst: 'brass', notes: part(lead, total), gain: 0.85 },
      { kind: 'lead', inst: LEAD.horn, notes: part([...motif(k, COLOURS.home, m0, { vel: 0.85 }), [H, [k - 3, k + 2, k + 4], total - H, 0.62]], total), gain: 0.85, pan: 0.18, echo: 0.3 },
      // the pips and the bells of the network
      { kind: 'lead', inst: PIP, notes: part(WN_CUES.pings.map((b) => [at(b), k + 21, 0.16, 0.5]), total), gain: 0.42, echo: 0.25 },
      { kind: 'harmony', inst: 'bell', notes: part([[l1, k + 7, 1, 0.56], [l2, k + 12, 1, 0.58], [l3, k + 14, 1, 0.6], [bloom, [k + 12, k + 19], 1.5, 0.66], [sun, [k + 16, k + 21], 1.5, 0.42]], total), gain: 1.45, echo: 0.55, pan: 0.25 },
      { kind: 'harmony', inst: LEAD.strings, notes: part([
        [sun, [k + 7, k + 14], at(11) - sun, 0.34], // the strings rise with the sun
        [at(11), [k + 9, k + 14], m0 + 2.5 - at(11), 0.42],
        [m0 + 2.5, [k + 9, k + 14], 1.5, 0.46],
        [H, [k + 12, k + 16, k + 21], total - H, 0.55],
      ], total), gain: 0.55, pan: 0.3 },
      { kind: 'harmony', inst: 'pad', notes: part([
        [0, [k - 3, k, k + 4, k + 7], at(4), 0.4], // Bm7 over the D pedal: night
        [at(4), [k - 3, k, k + 4, k + 7], at(3), 0.5],
        [at(7), [k - 7, k - 3, k, k + 4], at(3), 0.56], // Gmaj9: the network, then the sun
        [at(10), [k - 7, k - 3, k, k + 4], m0 + 2.5 - at(10), 0.64],
        [m0 + 2.5, [k - 5, k, k + 7], 1.5, 0.66], // open fifth: the colour decides
        [H, [k - 12, k - 5, k + 2, k + 4, k + 7], total - H, 0.8], // D add9
      ], total), pan: -0.2 },
      { kind: 'bass', inst: 'timpani', notes: part([
        [0, k - 24, 2 * q, 0.44], [at(2), k - 24, 2 * q, 0.26], [at(4), k - 24, 2 * q, 0.4], [at(6), k - 24, 2 * q, 0.34], [bloom, k - 24, 1, 0.5],
        ...roll, [m0, k - 24, 2.5, 0.65], [m0 + 2.5, k - 24, 1.5, 0.75], [H, k - 24, C - H], [C, k - 24, 1.5, 0.7],
      ], total), gain: 0.75 },
      // the D pedal: one held drone (legato, no re-attack) until the brass, then the short open's pattern
      { kind: 'bass', inst: { wave: 'tri', preset: 'tri', legato: 1 }, notes: part([[0, k - 24, at(4), 0.42], [at(4), k - 24, at(4), 0.52], [bloom, k - 24, m0 - bloom, 0.62]], total), gain: 0.42 },
      { kind: 'bass', inst: 'tri', notes: part([[m0, k - 24, 2.4, 0.75], [m0 + 2.5, k - 24, 1.4, 0.8], [H, k - 24, total - H, 0.85]], total), gain: 0.42 },
      stab('brass', [k - 12, k - 5], C, total, 0.6, 0.8),
      { drums: drums(range(at(4), sun, 0.5).map((b, i) => [b, 'H', i % 2 ? 0.1 : 0.15]), total) },
      { drums: `R:${fmt(at(8.4))} A:${fmt(at(10.4) - at(8.4))}@0.42` }, // the air swell crests on the sunrise
      { drums: drums([[H, 'F', 0.7], [C, 'F', 0.6]], total) },
      { drums: drums([[C, 'T', 0.4]], total) },
    ],
  };
}

// Each open: preferred tempo, then a builder that receives H (the beat of the
// final chord, landing exactly on the title lock-up) and C (the beat of the
// cut to the studio, possibly fractional) and returns the tune. The motif
// starts at H - 4 so its colour note ends on the hit.
const OPENS = {
  // Flagship, 88-96 BPM: low brass over timpani. Lowe's minor-to-major arc in
  // the pads (Bm7 - Gmaj9 - open fifth) over a D pedal; the colour (F#, the
  // 3rd) sounds against the pedal and the brass falls 3 -> 1 on the hit.
  'world-now': {
    bpm: 94,
    key: D4,
    // the flagship's ten-second title sequence (opens/worldtitles.js) on its own beat grid
    long: { bpm: WN_BPM, maxDuration: 11 },
    build(H, C) {
      if (H >= WN_CUES.hit) return worldNowTitles(this.tempo, H, C);
      const k = D4;
      const m0 = H - 4;
      const total = C + 2;
      const lead = [...motif(k - 12, COLOURS.home, m0), [H, k - 12, total - H, 0.9]];
      const roll = range(0, m0, 0.25).map((b, i, a) => [b, k - 24, 0.25, 0.18 + (0.3 * i) / Math.max(1, a.length - 1)]);
      return {
        bpm: this.tempo,
        room: 0.24,
        echo: { amount: 0.7, beats: 0.75, feedback: 0.26 },
        fadeOut: 0.9,
        tracks: [
          // Low brass for weight, the octave above carries the melody (it is
          // what laptop and phone speakers reproduce).
          { kind: 'lead', inst: 'brass', notes: part(lead, total), gain: 0.85 },
          { kind: 'lead', inst: LEAD.horn, notes: part([...motif(k, COLOURS.home, m0, { vel: 0.85 }), [H, [k - 3, k + 2, k + 4], total - H, 0.62]], total), gain: 0.85, pan: 0.18, echo: 0.3 },
          { kind: 'harmony', inst: LEAD.strings, notes: part([[m0 + 2.5, [k + 9, k + 14], 1.5, 0.45], [H, [k + 12, k + 16, k + 21], total - H, 0.55]], total), gain: 0.55, pan: 0.3 },
          { kind: 'harmony', inst: 'pad', notes: part([
            [0, [k - 3, k, k + 4, k + 7], m0 + 1, 0.55], // Bm7 over the D pedal
            [m0 + 1, [k - 7, k - 3, k, k + 4], 1.5, 0.62], // Gmaj9
            [m0 + 2.5, [k - 5, k, k + 7], 1.5, 0.66], // open fifth: the colour decides
            [H, [k - 12, k - 5, k + 2, k + 4, k + 7], total - H, 0.8], // D add9
          ], total), pan: -0.2 },
          { kind: 'bass', inst: 'timpani', notes: part([...roll, [m0, k - 24, 2.5, 0.65], [m0 + 2.5, k - 24, 1.5, 0.75], [H, k - 24, C - H], [C, k - 24, 1.5, 0.7]], total), gain: 0.75 },
          { kind: 'bass', inst: 'tri', notes: part([[m0, k - 24, 2.4, 0.75], [m0 + 2.5, k - 24, 1.4, 0.8], [H, k - 24, total - H, 0.85]], total), gain: 0.42 },
          stab('brass', [k - 12, k - 5], C, total, 0.6, 0.8),
          { drums: drums([[H, 'F', 0.7], [C, 'F', 0.6]], total) },
          { drums: drums([[C, 'T', 0.4]], total) },
        ],
      };
    },
  },
  // Technological, classy, half-time (100-108 BPM): A dorian. The motif on a
  // glassy pulse12 pluck with a dotted echo, a quiet pulse25 arpeggio in
  // eighths over Am9 -> D9 (the dorian IV); the b7 sounds over the A pedal;
  // the hit is Am6/9 (F# against C).
  'tech-bytes': {
    bpm: 104,
    key: 69,
    // the title sequence (opens/techtitles.js) on its own grid
    long: { bpm: SEQ_CUES['tech-bytes'].bpm, maxDuration: 11 },
    build(H, C) {
      if (H >= SEQ_CUES['tech-bytes'].hit) return techTitles(this.tempo, H, C);
      const k = 69; // A4
      const m0 = H - 4;
      const total = C + 2;
      const am9 = [k - 12, k - 9, k - 5, k - 2, k + 2, k - 2, k - 5, k - 9];
      const d9 = [k - 7, k - 3, k, k + 3, k + 7, k + 3, k, k - 3];
      const arp = range(0, H, 0.5).map((b, i) => [b, (b >= m0 + 1 && b < m0 + 2.5 ? d9 : am9)[i % 8], 0.5, 0.32 + 0.06 * (i % 2 ? 0 : 1)]);
      return {
        bpm: this.tempo,
        room: 0.16,
        echo: { amount: 1, beats: 0.75, feedback: 0.34 },
        fadeOut: 0.8,
        tracks: [
          { kind: 'lead', inst: LEAD.techPluck, notes: part([...motif(k, COLOURS.tech, m0), [H, k + 12, C - H - 0.25, 0.85]], total), gain: 1.1, echo: 0.45 }, // b7 -> 1 on the hit, released before the cut's button
          { kind: 'harmony', inst: { wave: 'pulse25', preset: 'pulse25', a: 0.004, d: 0.2, s: 0.35, r: 0.12, cutoff: 2600, vib: false }, notes: part(arp, total), gain: 0.45, pan: 0.3, echo: 0.55 },
          { kind: 'harmony', inst: 'pad', notes: part([
            [0, [k - 12, k - 9, k - 5, k - 2, k + 2], m0 + 1, 0.55], // Am9
            [m0 + 1, [k - 7, k - 5, k - 3, k + 3], 1.5, 0.6], // D9 (dorian IV)
            [m0 + 2.5, [k - 12, k - 5], 1.5, 0.6], // open fifth under the b7
            [H, [k - 12, k - 9, k - 3, k + 2, k - 5], total - H, 0.75], // Am6/9
          ], total), pan: -0.2 },
          { kind: 'bass', inst: 'tri', notes: part([[0, k - 24, m0 + 1], [m0 + 1, k - 31, 1.5, 0.9], [m0 + 2.5, k - 24, 1.5], [H, k - 24, total - H]], total), gain: 0.45 },
          stab('pluck', [k - 12, k - 5, k], C, total, 0.8, 1.3),
          { drums: drums([[0, 'K', 0.5], [2, 'S', 0.3], [4, 'K', 0.45], [H, 'K', 0.65], [C, 'F', 0.55]], total) },
          { drums: drums([[C, 'T', 0.55]], total) },
          { drums: drums(range(0, H, 0.5).map((b, i) => [b, 'H', i % 2 ? 0.16 : 0.24]), total) },
        ],
      };
    },
  },
  // Wonder, 72-88 BPM: E lydian. A soft triangle with long echo over Emaj7 ->
  // F#/E (lydian II over the I pedal); sparse bells (at most four a bar) and
  // Emaj9#11 on the hit. No sweeps, no cymbals.
  cosmos: {
    bpm: 82,
    key: 64,
    // the title sequence (opens/cosmostitles.js) on its own grid
    long: { bpm: SEQ_CUES.cosmos.bpm, maxDuration: 11 },
    build(H, C) {
      if (H >= SEQ_CUES.cosmos.hit) return cosmosTitles(this.tempo, H, C);
      const k = 64; // E4
      const m0 = H - 4;
      const total = C + 2.5;
      return {
        bpm: this.tempo,
        room: 0.42,
        echo: { amount: 1.3, beats: 0.75, feedback: 0.45 },
        fadeOut: 1.2,
        tracks: [
          { kind: 'lead', inst: 'softtri', notes: part([...motif(k, COLOURS.cosmos, m0, { colourBeats: 1.5 }), [H, k + 7, C - H - 0.25, 0.8]], total), gain: 0.95 }, // #4 rises to 5 on the hit, released before the button
          { kind: 'lead', inst: LEAD.halo, notes: part(motif(k + 12, COLOURS.cosmos, m0, { vel: 0.55 }), total), gain: 0.8, echo: 0.6, pan: -0.25 },
          { kind: 'harmony', inst: 'bell', notes: part([[0, k + 19, 1, 0.4], [m0 + 2, k + 14, 1, 0.34], [m0 + 3, k + 18, 1, 0.36], [H, k + 19, 2, 0.45]], total), gain: 1.2, echo: 0.65, pan: 0.35 },
          { kind: 'harmony', inst: 'pad', notes: part([
            [0, [k - 12, k - 5, k - 1, k + 4], m0 + 2.5, 0.55], // Emaj7
            [m0 + 2.5, [k - 10, k - 6, k - 3, k + 2], 1.5, 0.6], // F#/E: the lydian II
            [H, [k - 12, k - 5, k - 1, k + 2, k + 6], total - H, 0.75], // Emaj9#11
          ], total), pan: 0.15 },
          { kind: 'bass', inst: 'sine', notes: part([[0, k - 24, H, 0.75], [H, k - 24, total - H, 0.85]], total), gain: 0.65 },
          stab('pluck', [k - 12, k - 5, k - 1], C, total, 0.8, 1.4),
          { drums: drums([[H, 'F', 0.55], [C, 'F', 0.45]], total) },
          { drums: drums([[C, 'T', 0.5]], total) },
        ],
      };
    },
  },
  // After the close, 112-116 BPM, straight (money-minute.md): F major. The
  // motif on an electric piano, short keys chords on the "and" of 2 and 4, a
  // tri bass in half notes, a filtered pad; Fmaj9 | Dm9 | Bbmaj9 | C6sus, the
  // 6th over the F pedal and an F6/9 button. No brass, no swing, no bells.
  'money-minute': {
    bpm: 114,
    key: 65,
    // the title sequence (opens/moneytitles.js) on its own grid
    long: { bpm: SEQ_CUES['money-minute'].bpm, maxDuration: 11 },
    build(H, C) {
      if (H >= SEQ_CUES['money-minute'].hit) return moneyTitles(this.tempo, H, C);
      const k = 65; // F4
      const m0 = H - 4;
      const total = C + 2;
      const ch = {
        fmaj9: [k - 8, k - 5, k - 1, k + 2], // A C E G
        dm9: [k - 12, k - 8, k - 5, k - 1], // F A C E
        bbmaj9: [k - 8, k - 5, k - 3, k], // A C D F
        c6sus: [k - 5, k, k + 2, k + 4], // C F G A
        f69: [k - 8, k - 3, k + 2, k + 7], // A D G C
      };
      return {
        bpm: this.tempo,
        swing: 0,
        room: 0.18,
        echo: { amount: 0.5, beats: 0.75, feedback: 0.22 },
        fadeOut: 0.8,
        tracks: [
          { kind: 'lead', inst: LEAD.epiano, notes: part([...motif(k, COLOURS.money, m0), [H, k + 12, C - H - 0.25, 0.85]], total), gain: 1.05 }, // 6 -> 1 on the hit, released before the button
          { kind: 'harmony', inst: 'pad', notes: part([
            [0, ch.fmaj9, 2, 0.5], [2, ch.dm9, 1.5, 0.52], [3.5, ch.bbmaj9, 1, 0.55], [m0 + 2.5, ch.c6sus, 1.5, 0.56], [H, ch.f69, total - H, 0.66],
          ], total), pan: -0.22 },
          { kind: 'harmony', inst: 'keys', notes: part([
            [1.5, ch.fmaj9.slice(1), 0.4, 0.45], [3.5, ch.bbmaj9.slice(1), 0.4, 0.45], [5.5, ch.c6sus.slice(1), 0.4, 0.42], [H, ch.f69, 1.5, 0.7],
          ], total), pan: 0.25, echo: 0.2 },
          { kind: 'bass', inst: 'tri', notes: part([[0, k - 24, 2], [2, k - 27, 1.5], [3.5, k - 31, 1], [m0 + 2.5, k - 24, 1.5], [H, k - 24, total - H]], total), gain: 0.55 },
          stab('keys', [k - 12, ...ch.f69.slice(0, 3)], C, total, 0.7, 1),
          { drums: drums([[H, 'F', 0.75], [C, 'F', 0.55]], total) },
          { drums: drums([[C, 'T', 0.42]], total) },
        ],
      };
    },
  },
  // The clock, 120 BPM (news-60.md): G. A low-passed pulse25 lead, soft ticks
  // on the off-beats only, a staccato bass on each beat, G(add9) -> C/G over
  // the G pedal; the octave colour ("the minute starts") and a Gadd9 bell
  // chord with one soft kick on the hit.
  'news-60': {
    bpm: 120,
    key: 67,
    // the title sequence (opens/newstitles.js) on its own grid: under seven seconds, a minute's show
    long: { bpm: SEQ_CUES['news-60'].bpm, maxDuration: 11, over: 4.5 },
    build(H, C) {
      if (H >= SEQ_CUES['news-60'].hit) return newsTitles(this.tempo, H, C);
      const k = 67; // G4
      const m0 = H - 4;
      const total = C + 1.5;
      const ticks = range(0.5, H, 1).map((b) => [b, k + 12, 0.25, 0.32]);
      return {
        bpm: this.tempo,
        room: 0.14,
        echo: { amount: 0.6, beats: 0.5, feedback: 0.24 },
        fadeOut: 0.6,
        tracks: [
          { kind: 'lead', inst: LEAD.darkPulse, notes: part(motif(k - 12, COLOURS.sixty, m0, { colourBeats: 1.5 }), total), gain: 0.85 },
          { kind: 'harmony', inst: LEAD.tick, notes: part(ticks, total), gain: 0.55, pan: 0.22, echo: 0.3 },
          { kind: 'harmony', inst: 'pad', notes: part([
            [0, [k - 12, k - 8, k - 5, k + 2], m0 + 1.5, 0.52], // G add9
            [m0 + 1.5, [k - 12, k - 7, k - 3, k], 1, 0.55], // C/G
            [m0 + 2.5, [k - 12, k - 10, k - 5], 1.5, 0.55], // G sus2 under the octave
            [H, [k - 12, k - 8, k - 5, k + 2], total - H, 0.62],
          ], total), pan: -0.18 },
          { kind: 'lead', inst: 'bell', notes: part([[H, [k, k + 4, k + 7, k + 14], total - H, 0.75]], total), gain: 0.6, echo: 0.3, pan: 0.15 },
          { kind: 'bass', inst: { wave: 'tri', preset: 'tri', s: 0.4, d: 0.12 }, notes: part([...range(0, H, 1).map((b) => [b, k - 24, 0.4, 0.75]), [H, k - 24, total - H, 0.85]], total), gain: 0.7 },
          stab(LEAD.tick, [k - 12, k - 5], C, total, 0.75, 0.9),
          { drums: drums([[H, 'K', 0.72], [C, 'F', 0.55]], total) },
          { drums: drums([[C, 'T', 0.4]], total) },
        ],
      };
    },
  },
  // The skies over every continent, 88-96 BPM: C major, its 7th the colour (the open sky). The
  // motif on an airy pulse over Cmaj7 -> Fmaj7/C, the B over the C pedal, resolving on a Cmaj9 hit.
  'world-weather': {
    bpm: 92,
    key: 60,
    // the title sequence (opens/weathertitles.js) on its own grid
    long: { bpm: SEQ_CUES['world-weather'].bpm, maxDuration: 11 },
    build(H, C) {
      if (H >= SEQ_CUES['world-weather'].hit) return weatherTitles(this.tempo, H, C);
      const k = 60; // C4
      const m0 = H - 4;
      const total = C + 2;
      return {
        bpm: this.tempo,
        room: 0.3,
        echo: { amount: 0.9, beats: 0.75, feedback: 0.34 },
        fadeOut: 0.9,
        tracks: [
          { kind: 'lead', inst: LEAD.breeze, notes: part([...motif(k, COLOURS.weather, m0), [H, k + 12, C - H - 0.25, 0.85]], total), gain: 1 }, // 7 -> 8 on the hit
          { kind: 'harmony', inst: 'pad', notes: part([
            [0, [k - 12, k - 8, k - 5, k - 1], m0 + 1.5, 0.55], // Cmaj7
            [m0 + 1.5, [k - 12, k - 7, k - 3, k + 4], 1, 0.58], // Fmaj7 over C
            [m0 + 2.5, [k - 12, k - 5, k + 2], 1.5, 0.58], // C add9 under the colour
            [H, [k - 12, k - 8, k - 5, k - 1, k + 2], total - H, 0.72], // Cmaj9
          ], total), pan: -0.2 },
          { kind: 'harmony', inst: 'bell', notes: part([[H, [k + 7, k + 14, k + 16], total - H, 0.45]], total), gain: 0.9, echo: 0.5, pan: 0.3 },
          { kind: 'bass', inst: 'sine', notes: part([[0, k - 24, H, 0.75], [H, k - 24, total - H, 0.85]], total), gain: 0.6 },
          stab('pluck', [k - 12, k - 5, k - 1], C, total, 0.75, 1.2),
          { drums: drums([[H, 'F', 0.65], [C, 'F', 0.5]], total) },
          { drums: drums([[C, 'T', 0.42]], total) },
        ],
      };
    },
  },
};

// Unknown programmes: the channel signature in C major, sober, all major:
// Cadd9 -> Dm9/C -> Fmaj7/C over the C pedal, a C6/9 hit (no minor start,
// unlike WORLD NOW's arc).
const GENERIC = {
  bpm: 100,
  key: 60,
  build(H, C) {
    const k = 60;
    const m0 = H - 4;
    const total = C + 2;
    return {
      bpm: this.tempo,
      room: 0.2,
      echo: { amount: 0.7, beats: 0.75, feedback: 0.26 },
      fadeOut: 0.8,
      tracks: [
        { kind: 'lead', inst: { ...LEAD.softPulse, cutoff: 3400 }, notes: part([...motif(k, COLOURS.home, m0), [H, k, C - H - 0.25, 0.85]], total) },
        { kind: 'harmony', inst: 'pad', notes: part([
          [0, [k - 8, k - 5, k + 2, k + 4], m0 + 1, 0.55], // Cadd9
          [m0 + 1, [k - 10, k - 7, k - 3, k + 4], 1.5, 0.6], // Dm9 over C
          [m0 + 2.5, [k - 7, k - 3, k, k + 4], 1.5, 0.62], // Fmaj7 over C
          [H, [k - 12, k - 3, k + 2, k + 4, k + 7], total - H, 0.75], // C6/9
        ], total) },
        { kind: 'bass', inst: 'tri', notes: part([[0, k - 24, H], [H, k - 24, total - H]], total), gain: 0.5 },
        { kind: 'harmony', inst: 'bell', notes: part([[H, [k + 7, k + 14, k + 16], total - H, 0.45]], total), gain: 0.8, echo: 0.4, pan: 0.2 },
        stab('pluck', [k - 12, k - 5, k], C, total, 0.8, 1.3),
        { drums: drums([[H, 'F', 0.65], [C, 'F', 0.55]], total) },
        { drums: drums([[C, 'T', 0.4]], total) },
      ],
    };
  },
};

const COLOUR_OF = { 'world-now': 'home', 'tech-bytes': 'tech', cosmos: 'cosmos', 'money-minute': 'money', 'news-60': 'sixty', 'world-weather': 'weather' };

/**
 * Theme tune for a programme's open. The final chord lands on the title
 * lock-up (`duration - 0.8` s) and a soft felt/timpani button on the cut.
 * Opens last 2.5-8 s; the programmes' title sequences run to 11 s on their own grids.
 * Returns a tune with `meta: { programId, motif, colour, key, bpm, hitAt, cutAt }`.
 */
export function themeFor(programId, { duration = 4 } = {}) {
  const def = OPENS[programId] ?? GENERIC;
  // a programme with a title sequence has its own grid and length past 8 s (NEWS IN 60's, past 4.5 s)
  const long = def.long && Number(duration) > (def.long.over ?? 8) ? def.long : null;
  const dur = Math.min(long?.maxDuration ?? 8, Math.max(2.5, Number(duration) || 4));
  const lockAt = Math.max(2.2, dur - 0.8);
  // The hit on a whole or half beat, close to the programme's tempo.
  const H = Math.max(4.5, Math.round(((lockAt * (long?.bpm ?? def.bpm)) / 60) * 2) / 2);
  const tempo = (H * 60) / lockAt;
  const C = (dur * tempo) / 60;
  const tune = def.build.call({ tempo }, H, C);
  return {
    ...tune,
    // Opens play at director volume 0.6 (+1 dB): the trim puts them level with
    // the voice (-16 LUFS on air; the model reads opens ~0.6 LU low, measured).
    loudness: (tune.loudness ?? 0) - 1.6,
    meta: { programId: OPENS[programId] ? programId : 'generic', motif: MOTIF, colour: COLOUR_OF[programId] ?? 'home', key: midiToName(def.key), bpm: tempo, hitAt: lockAt, cutAt: dur },
  };
}

export const THEME_IDS = Object.keys(OPENS);

// -------------------------------------------------------------- channel cues

// Key and lead voice of each programme's cues (breaking, sign-off, promo).
const VOICE = {
  'world-now': { key: D4, lead: 'brass', pad: 'pad' },
  'tech-bytes': { key: 69, lead: LEAD.techPluck, pad: 'pad' },
  cosmos: { key: 64, lead: 'softtri', pad: 'pad' },
  'money-minute': { key: 65, lead: LEAD.epiano, pad: 'pad' },
  'news-60': { key: 67, lead: LEAD.darkPulse, pad: 'pad' },
  'world-weather': { key: 60, lead: LEAD.breeze, pad: 'pad' },
  channel: { key: D4, lead: LEAD.softPulse, pad: 'pad' },
};
const keyOf = (programId) => (VOICE[programId] ? programId : 'channel');
// Fold a tonic into the D3-B3 range for low cues.
const low = (k) => { let m = k; while (m > 59) m -= 12; while (m < 48) m += 12; return m; };

/**
 * Break ident (channel-and-breaks.md): the motif once on pulse12 with a
 * dotted echo, over a pad and a triangle pedal, 100 BPM by day and 88 at
 * night; the last motif note lands as the logo's rule finishes drawing
 * (~0.9-1.0 s) and a pad + pluck hold rings to the end of the card (3.6 s).
 * The harmony moves plagally (Gmaj7/D -> D add9): an arrival, not a second
 * cadence right after the programme's own sign-off.
 */
function buildIdent(night) {
  const k = D4;
  const bpm = night ? 88 : 100;
  const total = Math.round(((3.6 * bpm) / 60) * 2) / 2;
  return {
    bpm,
    room: 0.3,
    echo: { amount: 1.2, beats: 0.75, feedback: 0.36 },
    loudness: -1,
    fadeOut: 0.6,
    tracks: [
      { kind: 'lead', inst: LEAD.glass, notes: part(motif(k, null, 0), total), gain: 0.9, echo: 0.6 },
      { kind: 'harmony', inst: 'pad', notes: part([[0, [k - 7, k - 3, k, k + 4], 1.5, 0.5], [1.5, [k - 5, k, k + 2, k + 4], total - 1.5, 0.58]], total), pan: -0.2 },
      { kind: 'harmony', inst: 'pluck', notes: part([[2.5, k + 4, 1, 0.42], [3.5, k + 7, 1, 0.36], [4.5, k + 2, 1, 0.34]].filter(([b]) => b < total - 0.5), total), gain: 0.7, pan: 0.25, echo: 0.4 },
      { kind: 'bass', inst: 'tri', notes: part([[0, k - 24, total, 0.7]], total), gain: 0.5 },
    ],
    meta: { cue: 'ident', colour: 'home', key: 'D4', night },
  };
}

/**
 * Stinger (0.8 s): a soft air swell into a low felt thump on the cut, with a
 * quiet low D. 6 LU under the voice; the trim is set from the lab meter (the
 * note model under-reads such a short, low sound by ~3 LU).
 */
function buildStinger() {
  return {
    bpm: 150,
    room: 0.25,
    loudness: -9,
    fadeOut: 0.3,
    tracks: [
      { drums: drums([[0, 'A', 0.7], [1, 'F', 0.9]], 2) },
      { kind: 'bass', inst: 'timpani', notes: part([[1, D4 - 24, 1, 0.45]], 2) },
    ],
    meta: { cue: 'stinger' },
  };
}

/** Breaking (~2.8 s): the motif with its b3 in the programme's key, low brass over timpani. */
function buildBreaking(programId) {
  const v = VOICE[keyOf(programId)];
  const k = low(v.key); // D3 for the channel
  const total = 5.5;
  return {
    bpm: 116,
    room: 0.2,
    echo: { amount: 0.5, beats: 0.75, feedback: 0.24 },
    loudness: -3,
    fadeOut: 0.6,
    tracks: [
      { kind: 'lead', inst: 'brass', notes: part([...motif(k, COLOURS.breaking, 0)], total), gain: 1.1 },
      { kind: 'lead', inst: LEAD.horn, notes: part(motif(k + 12, COLOURS.breaking, 0, { vel: 0.6 }), total), gain: 0.85, pan: 0.15 },
      { kind: 'harmony', inst: 'pad', notes: part([[0, [k + 7, k + 12], 2.5, 0.55], [2.5, [k + 7, k + 12, k + 15], total - 2.5, 0.65]], total), pan: -0.15 },
      { kind: 'bass', inst: 'timpani', notes: part([[0, k - 12, 2.5, 0.8], [2.5, k - 12, 1.5, 0.7], [4, k - 12, 1.5, 0.55]], total) },
      { kind: 'bass', inst: 'tri', notes: part([[0, k - 12, total, 0.7]], total), gain: 0.55 },
    ],
    meta: { cue: 'breaking', colour: 'breaking', key: `${midiToName(k)} minor`, programId: keyOf(programId) },
  };
}

/** Sign-off on the end card (~3 s): each programme comes home in its own key and voice. */
function buildOutro(programId) {
  const id = keyOf(programId);
  const v = VOICE[id];
  const k = v.key;
  const meta = { cue: 'outro', colour: COLOUR_OF[id] ?? 'home', key: midiToName(k), programId: id };
  if (id === 'news-60') {
    // news-60.md: the sign-off is one Gadd9 bell chord, not the motif.
    return {
      bpm: 120,
      room: 0.3,
      echo: { amount: 0.8, beats: 0.75, feedback: 0.3 },
      loudness: -2,
      fadeOut: 0.8,
      tracks: [
        { kind: 'lead', inst: 'bell', notes: part([[0, [k, k + 4, k + 7, k + 14], 5, 0.62]], 6), gain: 1.15, echo: 0.45 },
        { kind: 'harmony', inst: 'pad', notes: part([[0, [k - 12, k - 8, k - 5, k + 2], 6, 0.55]], 6) },
        { kind: 'bass', inst: 'tri', notes: part([[0, k - 24, 6, 0.7]], 6), gain: 0.35 },
      ],
      meta,
    };
  }
  if (id === 'money-minute') {
    // money-minute.md: the button lands on the end card's first downbeat, then
    // the motif comes home over the F6/9.
    const total = 6;
    return {
      bpm: 114,
      room: 0.22,
      echo: { amount: 0.6, beats: 0.75, feedback: 0.26 },
      loudness: -1,
      fadeOut: 0.8,
      tracks: [
        { kind: 'lead', inst: v.lead, notes: part([...motif(k, COLOURS.money, 1, { colourBeats: 1, vel: 0.8 }), [4.5, k, 1.5, 0.75]], total), gain: 0.9 },
        { kind: 'harmony', inst: 'keys', notes: part([[0, [k - 8, k - 3, k + 2, k + 7], 1.5, 0.5]], total), gain: 0.9 },
        { kind: 'harmony', inst: 'pad', notes: part([[0, [k - 8, k - 3, k + 2, k + 7], total, 0.55]], total), pan: -0.2 },
        { kind: 'bass', inst: 'tri', notes: part([[0, k - 24, total]], total), gain: 0.55 },
        { drums: drums([[0, 'F', 0.6]], total) },
      ],
      meta,
    };
  }
  // The motif with the programme's colour, then home to 1 (the channel and
  // WORLD NOW: 3 -> 1 on brass; COSMOS #4 -> 5 -> 1; TECH b7 -> 1 on a pluck button).
  // 5.5 beats: the last note releases as the 3.4 s end card cuts to the break.
  const colour = COLOURS[meta.colour] ?? COLOURS.home;
  const total = 5.5;
  const pedal = k - 24;
  const tonic = id === 'world-now' ? k - 12 : k; // WORLD NOW: low brass
  const home = id === 'cosmos' ? [[3.5, k + 7, 0.5, 0.8], [4, k, 1.5, 0.85]] : [[3.5, tonic, 2, 0.85]]; // #4 rises to 5 first
  const lead = [...motif(tonic, colour, 0, { colourBeats: 1 }), ...home];
  const padHome = id === 'tech-bytes' ? [k - 12, k - 9, k - 3, k + 2] : id === 'cosmos' ? [k - 12, k - 5, k - 1, k + 2, k + 6] : [k - 12, k - 5, k + 2, k + 4];
  const tracks = [
    { kind: 'lead', inst: v.lead, notes: part(lead, total), gain: id === 'world-now' ? 1.05 : 1 },
    { kind: 'harmony', inst: 'pad', notes: part([[0, [k - 7, k - 3, k, k + 4], 1.5, 0.5], [1.5, [k - 5, k, k + 2], 2, 0.55], [3.5, padHome, 2, 0.62]], total), pan: -0.2 },
    { kind: 'bass', inst: id === 'world-now' ? 'timpani' : 'tri', notes: part(id === 'world-now' ? [[0, pedal, 3.5, 0.55], [3.5, pedal, 2, 0.7]] : [[0, pedal, total, 0.7]], total), gain: id === 'world-now' ? 0.8 : 0.5 },
  ];
  if (id === 'tech-bytes') tracks.push({ kind: 'harmony', inst: 'pluck', notes: part([[3.5, k - 5, 0.5, 0.5], [4, k, 1.5, 0.55]], total), gain: 0.8, pan: 0.25 });
  if (id === 'cosmos') {
    tracks.push({ kind: 'harmony', inst: 'bell', notes: part([[4, k + 19, 1.5, 0.42]], total), gain: 0.9, echo: 0.6, pan: 0.3 });
    tracks.push({ kind: 'lead', inst: LEAD.halo, notes: part(lead.map(([bb, m, d, vv]) => [bb, m + 12, d, vv * 0.55]), total), gain: 0.65, echo: 0.5, pan: -0.25 });
  }
  // WORLD NOW: the low brass is doubled an octave up on the brighter horn (the melody small speakers carry).
  if (id === 'world-now') tracks.push({ kind: 'lead', inst: LEAD.horn, notes: part(lead.map(([bb, m, d, vv]) => [bb, m + 12, d, vv * 0.7]), total), gain: 0.6, pan: 0.18, echo: 0.3 });
  return {
    bpm: id === 'cosmos' ? 84 : id === 'tech-bytes' ? 104 : 96,
    room: id === 'cosmos' ? 0.4 : 0.3,
    echo: { amount: 1, beats: 0.75, feedback: 0.36 },
    loudness: -1,
    fadeOut: 0.8,
    tracks,
    meta,
  };
}

/**
 * "Up next" promo (channel-and-breaks.md: the `promo` cue, 4.2 s card): the
 * motif's first three notes on pulse12 with echo, in the NEXT programme's
 * key, left hanging on 2 over a IV(add9) pad as the trailer's title settles
 * (1.6 s). No drums, no bass line.
 */
function buildPromo(programId) {
  const id = keyOf(programId);
  const k = VOICE[id].key;
  const total = 6;
  const iv = [k - 7, k - 3, k, k + 7]; // IV add9, e.g. G B D A in D
  return {
    bpm: 90,
    room: 0.3,
    echo: { amount: 1.2, beats: 0.75, feedback: 0.38 },
    loudness: -3,
    fadeOut: 0.6,
    tracks: [
      { kind: 'lead', inst: LEAD.glass, notes: part(motif(k, null, 1.4).slice(0, 3).map(([b, m, d, v], i) => [b, m, i === 2 ? 3 : d, v]), total), gain: 0.9, echo: 0.6 },
      { kind: 'harmony', inst: 'pad', notes: part([[0, iv, total, 0.5]], total), pan: -0.2 },
      { kind: 'bass', inst: 'tri', notes: part([[0, k - 19, total, 0.55]], total), gain: 0.45 },
    ],
    meta: { cue: 'promo', colour: 'next', key: midiToName(k), programId: id },
  };
}

// The channel's clock and dayparts run on London time (util.js zoneTime), not
// the viewer's: the night ident follows it. One formatter, made on first use.
let londonFmt;
function londonHour(date = new Date()) {
  try {
    londonFmt ??= new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: 'numeric', hourCycle: 'h23' });
    const h = Number(londonFmt.format(date));
    if (Number.isFinite(h)) return h % 24;
  } catch { /* no Intl time zones */ }
  return date.getUTCHours();
}

const CUE_NAMES = { jingle: 'ident', ident: 'ident', bumper: 'ident', whoosh: 'stinger', stinger: 'stinger', breaking: 'breaking', outro: 'outro', signoff: 'outro', promo: 'promo', upnext: 'promo' };
const cueCache = new Map();

/**
 * A channel cue by name, voiced for a programme where that matters:
 * 'breaking', 'outro'/'signoff' and 'promo'/'upnext' take the programme's key
 * and lead (unknown ids: the channel's D major); 'ident'/'jingle'/'bumper'
 * follows the hour (opts.hour, default London's; 7-20 is day); 'stinger'/'whoosh' is one
 * sound for everything. Returns a tune, or null for an unknown name.
 */
export function cueFor(cue, programId, { hour } = {}) {
  const kind = CUE_NAMES[cue];
  if (!kind) return null;
  const h = Number.isFinite(Number(hour)) && hour !== null ? Number(hour) : londonHour();
  const night = h < 7 || h >= 21;
  const key = kind === 'ident' ? `ident:${night}` : kind === 'stinger' ? 'stinger' : `${kind}:${keyOf(programId)}`;
  let tune = cueCache.get(key);
  if (!tune) {
    tune = kind === 'ident' ? buildIdent(night) : kind === 'stinger' ? buildStinger() : kind === 'breaking' ? buildBreaking(programId) : kind === 'outro' ? buildOutro(programId) : buildPromo(programId);
    cueCache.set(key, tune);
  }
  return tune;
}

export const IDENT = buildIdent(false);
export const IDENT_NIGHT = buildIdent(true);
export const STINGER = buildStinger();
export const BREAKING = buildBreaking(null);
export const OUTRO = buildOutro(null);
export const PROMO = buildPromo(null);
export const CUE_PROGRAMMES = Object.keys(VOICE);

/** Named channel cues (channel voicing), as played by AudioEngine.sfx(name). */
export const CUES = Object.freeze({
  jingle: IDENT, ident: IDENT, bumper: IDENT,
  whoosh: STINGER, stinger: STINGER,
  breaking: BREAKING,
  outro: OUTRO, signoff: OUTRO,
  promo: PROMO, upnext: PROMO,
});
