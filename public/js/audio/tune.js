// Tune format: parsing and instruments. Tune data comes from other people's
// files (ads, opens), so parsing never throws: bad tokens become rests and
// missing fields get defaults. Pure (no WebAudio), shared by the synth, the
// loudness model and the tests.
//
// Classic format (still fully supported):
//   { bpm, wave, notes: 'C5:1 E5:1 G5:2 R:1', bass: 'C3:2 G2:2', bassWave, drums: 'K:1 H:0.5 S:1' }
//   wave / bassWave: 'square' | 'triangle' | 'sawtooth' | 'sine'; 'C4+E4+G4:2' is a chord.
//
// Richer format (optional, may be mixed with the classic fields): see CONTRACTS.md.
//   {
//     bpm, swing: 0..0.5, transpose: semitones, loudness: dB trim, fadeOut: s, room: 0..1,
//     echo: 0..1 | { beats: 0.75, feedback: 0.3 },
//     tracks: [
//       { inst: 'brass' | { wave: 'pulse25', a, d, s, r, vib, scoop, legato }, notes: 'A3:0.5 D4:0.5@0.8',
//         kind: 'lead' | 'bass' | 'harmony', gain: 1, pan: -1..1, echo: 0..1, octave: 0, arp: 0.05 },
//       { drums: 'K:1 S:1 H:0.5 O:0.5 C:2 T:1 P:1 X:0.25 W:2 F:1 A:2' },
//     ],
//     duck: dB under a voice (-40..0; default -18, -14 for a looping ad bed),
//     hall: 0..1 (a send to a long hall, 2.6 s, besides the room),
//   }
//   A token may end in @velocity (0..1): 'C5:1@0.6'.
//   Instruments may set cutoff (Hz, low-pass), q (resonance in dB) and
//   fenv: [amount, seconds] (the filter opens to cutoff x amount and closes),
//   and play as an ensemble: unison (1..4 detuned voices a note), detune (cents
//   between the outer voices and the middle) and spread (0..1 across the field).
//   W is a noise sweep lasting its length, F a low felt thump, A a soft air swell.

export const MAX_EVENTS = 1500;
export const MAX_TRACKS = 16; // tracks past this are dropped
const SEMITONE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const NOTE_RE = /^([A-Ga-g])([#b♯♭]?)(-?\d)?$/;
const REST_RE = /^(r|rest|-|_|\.)$/i;
export const DRUM_KEYS = {
  k: 'k', kick: 'k', bd: 'k', s: 's', snare: 's', sd: 's', h: 'h', hat: 'h', hh: 'h', o: 'o', open: 'o', oh: 'o',
  c: 'c', crash: 'c', cy: 'c', t: 't', tom: 't', p: 'p', clap: 'p', cp: 'p', x: 'x', tick: 'x', rim: 'x',
  w: 'w', whoosh: 'w', sweep: 'w', f: 'f', felt: 'f', thump: 'f', a: 'a', air: 'a', swell: 'a',
};

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const num = (v, fallback, lo, hi) => (v == null || v === '' || !Number.isFinite(Number(v)) ? fallback : clamp(Number(v), lo, hi));

// --------------------------------------------------------------- instruments

// a/d/s/r: attack (s), decay time constant x3 (s), sustain level, release (s).
// vib: [depth in cents, rate Hz, delay s] on notes long enough to notice.
// scoop: cents below pitch the note starts at (brass), legato: gate fraction.
// cutoff: low-pass corner in Hz (never below 3x the note's pitch), q: its
// resonance in dB (WebAudio's lowpass Q), fenv: [amount, s] the filter opens
// to cutoff x amount at the attack and settles back (brass bite, pluck).
// Every preset is filtered with a broadcast tilt: the top octaves of a raw NES
// pulse read as an 8-bit game, so each voice is rolled off above its own
// register (leads ~5.5-6 kHz, pads ~2.8 kHz, bass ~1.5 kHz), attacks open the
// filter further (brass to ~4.6 kHz, bells to ~9.5 kHz), and the tunes bus adds
// one gentle -3 dB shelf at 8 kHz (synth.js) instead of steep per-note cuts.
export const INSTRUMENTS = {
  pulse50: { wave: 'pulse50', a: 0.006, d: 0.12, s: 0.7, r: 0.06, vib: [12, 5.4, 0.25], gain: 0.62, cutoff: 6000 },
  pulse25: { wave: 'pulse25', a: 0.006, d: 0.14, s: 0.68, r: 0.07, vib: [11, 5.4, 0.25], gain: 0.78, cutoff: 6000 },
  pulse12: { wave: 'pulse12', a: 0.005, d: 0.12, s: 0.6, r: 0.07, vib: [10, 5.6, 0.22], gain: 0.95, cutoff: 5500 },
  brass: { wave: 'pulse25', a: 0.03, d: 0.22, s: 0.78, r: 0.12, vib: [12, 5.2, 0.3], scoop: 35, gain: 0.78, cutoff: 2200, q: 1, fenv: [3, 0.16] },
  bell: { wave: 'pulse12', a: 0.003, d: 0.5, s: 0, r: 0.16, legato: 1, gain: 0.95, cutoff: 5000, fenv: [2, 0.12] },
  pluck: { wave: 'pulse25', a: 0.003, d: 0.18, s: 0.2, r: 0.07, gain: 0.8, cutoff: 3600, fenv: [2.4, 0.1] },
  keys: { wave: 'pulse50', a: 0.004, d: 0.35, s: 0.25, r: 0.12, gain: 0.7, cutoff: 3400, fenv: [2.2, 0.15] },
  pad: { wave: 'pulse50', a: 0.14, d: 0.5, s: 0.82, r: 0.4, vib: [7, 4.6, 0.2], legato: 1, gain: 0.55, cutoff: 3000 },
  tri: { wave: 'tri', a: 0.004, d: 0.08, s: 0.92, r: 0.05, gain: 1, cutoff: 5000 },
  triangle: { wave: 'tri', a: 0.004, d: 0.08, s: 0.92, r: 0.05, gain: 1, cutoff: 5000 },
  softtri: { wave: 'triangle', a: 0.014, d: 0.2, s: 0.85, r: 0.14, vib: [9, 5, 0.22], gain: 1, cutoff: 6000 },
  timpani: { wave: 'tri', a: 0.003, d: 0.55, s: 0, r: 0.1, legato: 1, gain: 1.1, cutoff: 2000 },
  saw: { wave: 'saw', a: 0.006, d: 0.12, s: 0.7, r: 0.06, vib: [11, 5.4, 0.25], gain: 0.62, cutoff: 5000 },
  sawtooth: { wave: 'saw', a: 0.006, d: 0.12, s: 0.7, r: 0.06, vib: [11, 5.4, 0.25], gain: 0.62, cutoff: 5000 },
  sine: { wave: 'sine', a: 0.008, d: 0.18, s: 0.82, r: 0.09, vib: [8, 5.2, 0.22], gain: 1 },
  square: { wave: 'pulse50', a: 0.006, d: 0.12, s: 0.7, r: 0.06, vib: [12, 5.4, 0.25], gain: 0.62, cutoff: 6000 },
  // Ensembles (the title themes): several detuned voices per note, spread across the stereo field,
  // at the loudness of one (each voice at 1/sqrt(n)).
  strings: { wave: 'saw', a: 0.22, d: 0.6, s: 0.86, r: 0.55, vib: [7, 5, 0.35], legato: 1, gain: 0.85, cutoff: 2600, unison: 3, detune: 13, spread: 0.7 },
  warm: { wave: 'pulse50', a: 0.18, d: 0.5, s: 0.84, r: 0.5, vib: [6, 4.4, 0.3], legato: 1, gain: 0.55, cutoff: 2400, unison: 2, detune: 9, spread: 0.6 },
  mallet: { wave: 'tri', a: 0.002, d: 0.42, s: 0, r: 0.14, legato: 1, gain: 1.05, cutoff: 4200, fenv: [1.6, 0.06] },
  synthbass: { wave: 'saw', a: 0.003, d: 0.22, s: 0.55, r: 0.07, gain: 0.6, cutoff: 700, q: 2, fenv: [3.2, 0.11] },
};
// Bass versions: no vibrato, firmer sustain, shorter release, darker.
const BASS = {
  pulse50: { wave: 'pulse50', a: 0.004, d: 0.1, s: 0.8, r: 0.05, gain: 0.55, cutoff: 1300 },
  pulse25: { wave: 'pulse25', a: 0.004, d: 0.1, s: 0.8, r: 0.05, gain: 0.68, cutoff: 1400 },
  tri: { wave: 'tri', a: 0.004, d: 0.1, s: 0.9, r: 0.05, gain: 1, cutoff: 1500 },
  saw: { wave: 'saw', a: 0.004, d: 0.1, s: 0.78, r: 0.05, gain: 0.55, cutoff: 1300 },
  sine: { wave: 'sine', a: 0.005, d: 0.12, s: 0.9, r: 0.06, gain: 1 },
};
const CLASSIC_WAVE = { square: 'pulse50', triangle: 'tri', sawtooth: 'saw', sine: 'sine' };

// Relative level of each kind of part in the mix (before loudness normalisation).
export const KIND_GAIN = { lead: 0.3, harmony: 0.16, bass: 0.36, drums: 0.42 };
const KIND_ECHO = { lead: 0.22, harmony: 0.16, bass: 0, drums: 0.03 };

export function resolveInstrument(inst, kind = 'lead', fallback = 'pulse50') {
  const pick = (name) => {
    const key = String(name ?? '').toLowerCase();
    if (kind === 'bass') {
      const w = CLASSIC_WAVE[key] ?? (BASS[key] ? key : null);
      if (w && BASS[w]) return BASS[w];
    }
    return INSTRUMENTS[key] ?? null;
  };
  let base = typeof inst === 'string' ? pick(inst) : null;
  if (!base && inst && typeof inst === 'object') {
    const from = pick(inst.preset ?? inst.wave) ?? pick(fallback) ?? INSTRUMENTS.pulse50;
    const w = String(inst.wave ?? '').toLowerCase();
    const wave = CLASSIC_WAVE[w] && kind !== 'bass' ? INSTRUMENTS[w].wave : ['pulse12', 'pulse25', 'pulse50', 'tri', 'triangle', 'saw', 'sine'].includes(w) ? w : from.wave;
    const vib = Array.isArray(inst.vib) ? inst.vib.map(Number) : inst.vib === false || inst.vib === 0 ? null : from.vib;
    base = {
      ...from,
      wave,
      a: num(inst.a, from.a, 0.001, 2),
      d: num(inst.d, from.d, 0.005, 4),
      s: num(inst.s, from.s, 0, 1),
      r: num(inst.r, from.r, 0.01, 3),
      vib: vib && vib.length >= 2 && vib.every(Number.isFinite) ? [clamp(vib[0], 0, 100), clamp(vib[1], 0.5, 12), clamp(vib[2] ?? 0.2, 0, 2)] : null,
      scoop: num(inst.scoop, from.scoop ?? 0, 0, 400),
      legato: num(inst.legato, from.legato ?? 0.92, 0.2, 1),
      gain: num(inst.gain, from.gain ?? 1, 0, 2),
      cutoff: num(inst.cutoff, from.cutoff ?? 20000, 200, 20000),
      q: num(inst.q, from.q ?? 0, -6, 12),
      fenv: inst.fenv === false || inst.fenv === 0 ? null : fenvOf(inst.fenv) ?? from.fenv ?? null,
      unison: Math.round(num(inst.unison, from.unison ?? 1, 1, 4)),
      detune: num(inst.detune, from.detune ?? 0, 0, 60),
      spread: num(inst.spread, from.spread ?? 0, 0, 1),
    };
  }
  if (!base) base = pick(fallback) ?? INSTRUMENTS.pulse50;
  return { legato: 0.92, scoop: 0, vib: null, cutoff: 20000, q: 0, fenv: null, unison: 1, detune: 0, spread: 0, ...base };
}

// [amount, seconds] -> a valid filter envelope, or null.
function fenvOf(v) {
  if (!Array.isArray(v) || v.length < 2 || !v.every((x) => Number.isFinite(Number(x)))) return null;
  return [clamp(Number(v[0]), 1, 8), clamp(Number(v[1]), 0.01, 2)];
}

/** The low-pass corner a note actually gets: never below 3x its pitch. */
export const noteCutoff = (inst, midi) => Math.min(20000, Math.max(inst.cutoff ?? 20000, 3 * 440 * 2 ** ((midi - 69) / 12)));

// ------------------------------------------------------------------- tokens

// Octave 4 when omitted: 'C' is middle C (MIDI 60).
export function noteToMidi(name) {
  const m = NOTE_RE.exec(name);
  if (!m) return null;
  const accidental = m[2] === '#' || m[2] === '♯' ? 1 : m[2] ? -1 : 0;
  return 12 * ((m[3] === undefined ? 4 : Number(m[3])) + 1) + SEMITONE[m[1].toLowerCase()] + accidental;
}

const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
export function midiToName(midi) {
  const m = Math.round(midi);
  return `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
}

// Beats as '1', '0.5', '.5' or '1/2'.
export function parseBeats(text) {
  const m = /^(\d*\.?\d+)(?:\/(\d*\.?\d+))?$/.exec(text ?? '');
  const n = m ? Number(m[1]) / (m[2] ? Number(m[2]) : 1) : NaN;
  return Number.isFinite(n) && n > 0 ? clamp(n, 0.0625, 64) : 1;
}

// 'C4+E4+G4:2@0.8' is a chord with a velocity. Returns events and length in beats.
export function parseTrack(src, drums = false, shift = 0) {
  const text = Array.isArray(src) ? src.join(' ') : typeof src === 'string' ? src : '';
  const events = [];
  let at = 0;
  for (const token of text.split(/[\s,|]+/)) {
    if (!token || events.length >= MAX_EVENTS) continue;
    const [body, velRaw] = token.split('@');
    const [name, dur] = body.split(':');
    const len = parseBeats(dur);
    const vel = num(velRaw, 1, 0, 1);
    if (drums) {
      const drum = DRUM_KEYS[name.toLowerCase()];
      if (drum) events.push({ at, dur: len, drum, vel });
    } else if (!REST_RE.test(name)) {
      const midis = name.split('+').map(noteToMidi).filter((m) => m !== null).map((m) => clamp(m + shift, 12, 120));
      if (midis.length) events.push({ at, dur: len, midis, vel });
    }
    at += len;
  }
  return { events, beats: at };
}

// ------------------------------------------------------------------- tunes

/** Normalised song, or null if the tune has nothing playable. */
export function parseTune(tune) {
  const t = typeof tune === 'string' ? { notes: tune } : tune;
  if (!t || typeof t !== 'object') return null;
  const get = (...keys) => keys.map((k) => t[k]).find((v) => v != null);
  const transpose = Math.round(num(t.transpose, 0, -24, 24));
  const tracks = [];
  const add = (spec, kind, fallbackInst) => {
    const drums = kind === 'drums';
    const parsed = parseTrack(spec.src, drums, transpose + 12 * Math.round(num(spec.octave, 0, -3, 3)));
    if (!parsed.events.length) return;
    tracks.push({
      kind,
      inst: drums ? null : resolveInstrument(spec.inst, kind, fallbackInst),
      gain: num(spec.gain, 1, 0, 2),
      pan: num(spec.pan, kind === 'drums' ? 0.08 : 0, -1, 1),
      echo: num(spec.echo, KIND_ECHO[kind], 0, 1),
      arp: num(spec.arp, 0, 0, 0.25),
      ...parsed,
    });
  };
  // Classic fields.
  const wave = String(get('wave', 'waveform') ?? '').toLowerCase();
  const leadInst = t.inst ?? (CLASSIC_WAVE[wave] ? wave : 'square');
  add({ src: get('notes', 'melody', 'lead'), inst: leadInst }, 'lead', 'square');
  const bassWave = String(get('bassWave') ?? '').toLowerCase();
  add({ src: get('bass'), inst: t.bassInst ?? (CLASSIC_WAVE[bassWave] ? bassWave : 'tri') }, 'bass', 'tri');
  add({ src: get('drums', 'percussion') }, 'drums');
  // Richer tracks.
  if (Array.isArray(t.tracks)) {
    for (const tr of t.tracks.slice(0, MAX_TRACKS)) {
      if (!tr || typeof tr !== 'object') continue;
      const isDrums = tr.drums != null || tr.kind === 'drums';
      const kind = isDrums ? 'drums' : ['lead', 'bass', 'harmony'].includes(tr.kind) ? tr.kind : 'lead';
      add({ src: isDrums ? tr.drums ?? tr.notes : tr.notes, inst: tr.inst, gain: tr.gain, pan: tr.pan, echo: tr.echo, arp: tr.arp, octave: tr.octave }, kind, kind === 'bass' ? 'tri' : 'pulse50');
    }
  }
  if (!tracks.length) return null;
  const echo = t.echo && typeof t.echo === 'object' ? t.echo : { amount: t.echo };
  return {
    bpm: num(get('bpm', 'tempo'), 120, 30, 400),
    tracks,
    beats: Math.max(...tracks.map((track) => track.beats)),
    swing: num(t.swing, 0, 0, 0.5),
    echo: { send: num(echo.amount, 1, 0, 2), beats: num(echo.beats, 0.75, 0.125, 4), feedback: num(echo.feedback, 0.3, 0, 0.7) },
    room: num(t.room, 0.16, 0, 1),
    hall: num(t.hall, 0, 0, 1),
    fadeOut: num(t.fadeOut, 0.08, 0.02, 3),
    trim: num(t.loudness, 0, -12, 12),
    duck: t.duck == null || t.duck === '' || !Number.isFinite(Number(t.duck)) ? null : clamp(Number(t.duck), -40, 0),
  };
}

/**
 * Every note of `passes` passes of the song in time order, with shorter
 * tracks repeating to fill the longest one (as the classic player did).
 * Times in beats; swing delays off-beat eighths.
 */
export function flatten(song, passes = 1) {
  const out = [];
  const swingShift = song.swing * 0.5;
  for (let pass = 0; pass < passes; pass++) {
    const base = pass * song.beats;
    song.tracks.forEach((track, ti) => {
      for (let off = 0; off < song.beats - 1e-6; off += track.beats) {
        for (const e of track.events) {
          const at = off + e.at;
          if (at >= song.beats - 1e-6) break;
          const frac = at % 1;
          const swung = swingShift && Math.abs(frac - 0.5) < 1e-6 ? at + swingShift : at;
          out.push({ at: base + swung, dur: Math.min(e.dur, song.beats - at), track: ti, e });
          if (out.length > 20000) return;
        }
      }
    });
  }
  out.sort((a, b) => a.at - b.at || a.track - b.track);
  return out;
}

export const songSeconds = (song) => (song.beats * 60) / song.bpm;
