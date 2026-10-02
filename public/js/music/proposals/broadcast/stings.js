// One-shot cues of the "broadcast" package, written to the style bibles: the
// programme sign-offs and end-card buttons, the number-of-the-day stings, the
// WORLD NOW headline pips, the NEWS IN 60 item tick and sign-off bell, the
// channel's ident film, countdown and lead-ins, the up-next motif, the replay
// tag and the breaking sting. Every one is the channel motif (or its head) in
// the programme's own dress, and each ends by telling the viewer what comes
// next: the ident and up-next hang open, sign-offs resolve home.
// Signature: fn(bed, t, pkg, opts) -> length in seconds.

import { MOTIF, COLOURS, motifShapes, parseChord, voice, nearest } from './theory.js';
import { INST, timpDo } from './arranger.js';

const SHAPES = motifShapes(MOTIF);
const chord = (sym) => parseChord(sym);
// Dominant suspension of a key: sol do re fa above sol (the "to be continued" chord).
const domSus = (tonic) => ({ root: (tonic + 7) % 12, bass: (tonic + 7) % 12, tones: [0, 5, 7, 10], minor: false });

const lead = (pkg) => INST[pkg.timbre.lead] || INST.horn;

/**
 * Plays a motif statement (optionally with a colour note and an extra tail of
 * notes) and returns the time of its last note.
 */
function statement(bed, out, t, doM, spb, { steps: st = SHAPES.steps, beats: bt = SHAPES.beats, colour = null, tail = [], count, inst, harm = [], vel = 0.8, hold = 1, L = {} } = {}) {
  const steps = [...st, ...(colour == null ? [] : [colour]), ...tail.map(([s]) => s)];
  const beats = [...bt, ...(colour == null ? [] : [1.5]), ...tail.map(([, b]) => b)];
  const n = count ?? steps.length;
  let at = t;
  let last = t;
  for (let k = 0; k < n; k++) {
    const isLast = k === n - 1;
    const dur = beats[k] * spb * (isLast ? hold : 0.92);
    const v = vel * (isLast ? 1 : 0.82 + 0.05 * Math.min(k, 3));
    inst(bed.s, out, at, dur, doM + steps[k], v, L);
    for (const h of harm) inst(bed.s, out, at, dur, doM + steps[k] + h, v * 0.6, L);
    last = at;
    at += beats[k] * spb;
  }
  return last;
}

export const STINGS = {
  // WORLD NOW sign-off on the end card: the motif on low brass over timpani,
  // resolving through the colour (3) to the tonic, on a low D major chord.
  // MONEY MINUTE: a motif fragment on the keys in the gap after the last word.
  signoff(bed, t, pkg) {
    const s = bed.s;
    if (pkg.id === 'money-minute') {
      const K = bed.bus('lead', -12, { rev: 0.35, dly: 0.15 });
      const spb = 60 / pkg.bpm;
      statement(bed, K, t, nearest(pkg.tonic % 12, 65), spb, { count: 3, inst: INST.keys, vel: 0.6, hold: 1.6 });
      return 2;
    }
    const spb = 60 / 96;
    const doM = nearest(pkg.tonic % 12, 50); // low: D3
    const L = bed.bus('lead', -9, { rev: 0.4, dly: 0.1 });
    const X = bed.bus('perc', -9, { rev: 0.35 });
    const B = bed.bus('bass', -10, { rev: 0.1 });
    const P = bed.bus('pad', -12, { rev: 0.45 });
    const end = statement(bed, L, t, doM, spb, { colour: pkg.colour, tail: [[0, 2]], inst: INST.horn, harm: [-12], vel: 0.8, hold: 1.6, L: { cut: 1300 } });
    s.timp(X, t, timpDo(pkg.tonic) - 5, 0.4);
    s.timp(X, end, timpDo(pkg.tonic), 0.75, { decay: 1.8 });
    s.tone(B, end, 1.6, doM - 12, 0.85, { wave: 'tri', a: 0.01, d: 0.6, s: 0.6, r: 0.9, gain: 0.6 });
    s.pad(P, end, 1.4, voice(chord(pkg.final), null, { n: 3, lo: 38, hi: 52 }), 0.9, { wave: 'horn', a: 0.05, r: 1.3, cut: 900, cutTo: 600 });
    return end + 2.4 - t;
  },

  // Generic end card (TECH BYTES): the motif plucked, the colour, a soft Am9.
  endcard(bed, t, pkg) {
    const s = bed.s;
    if (pkg.id === 'money-minute') return STINGS.button(bed, t, pkg);
    const spb = 60 / Math.max(96, pkg.bpm);
    const doM = nearest(pkg.tonic % 12, 62);
    const L = bed.bus('lead', -10, { rev: 0.4, dly: 0.3 });
    const P = bed.bus('pad', -12, { rev: 0.5 });
    const B = bed.bus('bass', -10, { rev: 0.1 });
    const end = statement(bed, L, t, doM, spb, { colour: pkg.colour, inst: lead(pkg), harm: pkg.timbre.harm, vel: 0.75, hold: 1.4, L: { cut: 1600 } });
    const fin = chord(pkg.final);
    s.tone(B, end, 1.5, nearest(fin.root, doM - 24), 0.8, { wave: 'tri', a: 0.01, d: 0.6, s: 0.5, r: 0.9, gain: 0.6 });
    s.pad(P, end, 1.4, voice(fin, null, { n: 4, lo: 50, hi: 72 }), 0.85, { a: 0.03, r: 1.4, cut: 1500, cutTo: 800 });
    return end + 2.6 - t;
  },

  // MONEY MINUTE: the button on the end card's first downbeat (F6/9 + low F).
  button(bed, t, pkg) {
    const s = bed.s;
    const K = bed.bus('keys', -11, { rev: 0.35 });
    const B = bed.bus('bass', -10, { rev: 0.1 });
    s.pad(K, t, 0.5, voice(chord(pkg.final), null, { n: 4, lo: 57, hi: 76 }), 0.6, { wave: 'epiano', a: 0.006, r: 0.6, s: 0.4, d: 0.3, cut: 1600, detune: 3, spread: 0.3 });
    s.tone(B, t, 0.5, nearest(pkg.tonic % 12, 41), 0.8, { wave: 'tri', a: 0.008, d: 0.3, s: 0.5, r: 0.4, gain: 0.6 });
    return 1.4;
  },

  // Number of the day. TECH: the motif's head (low 5 -> 1) on a dry pluck,
  // 0.8 s, landing on the card's figure. MONEY: the whole motif at double speed
  // with the colour (about 0.79 s at 114 BPM), on the keys.
  number(bed, t, pkg) {
    if (pkg.id === 'money-minute') {
      const K = bed.bus('lead', -11, { rev: 0.25 });
      const spb = 60 / pkg.bpm;
      statement(bed, K, t, nearest(pkg.tonic % 12, 65), spb, { beats: SHAPES.beats.map((b) => b / 2), colour: pkg.colour, inst: INST.keys, vel: 0.65, hold: 0.33 });
      return 1;
    }
    const P = bed.bus('lead', -10, { rev: 0.05 });
    const doM = nearest(pkg.tonic % 12, 57);
    bed.s.pluck(P, t, doM - 5, 0.7, { wave: 'warmsq', decay: 0.25, cut: 1500, cutEnd: 400 });
    bed.s.pluck(P, t + 0.2, doM, 0.85, { wave: 'warmsq', decay: 0.6, cut: 1500, cutEnd: 400 });
    return 0.8;
  },

  // TECH: end of a feature, a two-note pluck button resolving b7 -> 1 (G -> A).
  featureEnd(bed, t, pkg) {
    const P = bed.bus('lead', -11, { rev: 0.1 });
    const doM = nearest(pkg.tonic % 12, 57);
    bed.s.pluck(P, t, doM - 2, 0.65, { wave: 'warmsq', decay: 0.22, cut: 1400, cutEnd: 400 });
    bed.s.pluck(P, t + 0.18, doM, 0.8, { wave: 'warmsq', decay: 0.42, cut: 1400, cutEnd: 400 });
    return 0.6;
  },

  // NEWS IN 60 sign-off: one Gadd9 bell chord, rolled a touch (not the motif).
  bellchord(bed, t, pkg) {
    const G = bed.bus('bell', -13, { rev: 0.5, dly: 0.2 });
    const notes = voice(chord('Gadd9'), null, { n: 4, lo: 67, hi: 81 });
    notes.forEach((m, k) => bed.s.bell(G, t + k * 0.03, 2.2, m, 0.55, { ratio: 3.5, index: 0.9, gain: 0.28, cut: 3000 }));
    return 2.4;
  },

  // WORLD NOW headline gap: one timpani hit, then the pip (two bell notes, low
  // 5 then 1: the motif's first two notes).
  pip(bed, t, pkg) {
    const X = bed.bus('pip', -13, { rev: 0.45 });
    const doM = nearest(pkg.tonic % 12, 74);
    bed.s.timp(X, t, timpDo(pkg.tonic), 0.5, { decay: 1.2 });
    bed.s.bell(X, t + 0.24, 0.6, doM - 5, 0.5, { ratio: 3.5, index: 0.9, gain: 0.26, cut: 3000 });
    bed.s.bell(X, t + 0.48, 1.1, doM, 0.55, { ratio: 3.5, index: 0.9, gain: 0.26, cut: 3000 });
    return 1.6;
  },

  // NEWS IN 60 item change: the bed's own tick, once, 4 dB above its regular ticks.
  tick(bed, t) {
    const X = bed.bus('tick', -9, { rev: 0.05 });
    bed.s.tick(X, t, 0.7);
    return 0.2;
  },

  // Ident film (~3.2 s, the network): the motif once on a pulse-12 with echo,
  // over a pad and a triangle pedal, 96 BPM; the last note lands on the logo's
  // alignment, then the hold loops pad + pluck. Banned: boings, pops, pentatonic.
  bumperIn(bed, t, pkg) {
    const s = bed.s;
    const spb = 60 / 96;
    const doM = nearest(pkg.tonic % 12, 62);
    const L = bed.bus('lead', -9, { rev: 0.4, dly: 0.45 });
    const P = bed.bus('pad', -10, { rev: 0.5 });
    const B = bed.bus('bass', -9, { rev: 0.1 });
    const K = bed.bus('pluck', -15, { rev: 0.3, dly: 0.2, pan: 0.2 });
    s.pad(P, t, 3.3, voice(chord('Dadd9'), null, { n: 4, lo: 50, hi: 70 }), 0.85, { a: 0.25, r: 1.2, cut: 900, cutTo: 1400 });
    s.tone(B, t, 3.3, doM - 24, 0.8, { wave: 'tri', a: 0.05, d: 0.6, s: 0.7, r: 0.8, gain: 0.6 });
    const t1 = t + 0.35;
    const end = statement(bed, L, t1, doM, spb, { colour: pkg.colour, inst: (s2, out, at, dur, m, v) => s2.tone(out, at, dur, m, v, { wave: 'pulse12', a: 0.005, d: 0.25, s: 0.5, r: 0.2, cut: 1800, gain: 0.45 }), vel: 0.8, hold: 1 });
    for (let k = 0; k < 4; k++) s.pluck(K, end + 0.3 + k * spb * 0.5, doM + [0, 7, 12, 7][k], 0.5 - k * 0.07, { wave: 'warmsq', decay: 0.35, cut: 1300, cutEnd: 400 });
    return 3.6;
  },

  // Back from the break (lead-in): the motif resolving home, a soft timpani.
  bumperOut(bed, t, pkg) {
    const s = bed.s;
    const spb = 60 / 100;
    const doM = nearest(pkg.tonic % 12, 62);
    const L = bed.bus('lead', -10, { rev: 0.45, dly: 0.15 });
    const P = bed.bus('pad', -11, { rev: 0.5 });
    const X = bed.bus('perc', -9, { rev: 0.4 });
    const end = statement(bed, L, t, doM, spb, { colour: COLOURS.home, tail: [[0, 2]], inst: INST.horn, harm: [-12], vel: 0.8, hold: 1.2 });
    s.pad(P, t, spb * 2, voice(domSus(pkg.tonic), null, { n: 4, lo: 52, hi: 72 }), 0.7, { a: 0.05, r: 0.4, cut: 1300 });
    s.pad(P, end, 1.2, voice(chord(pkg.final), null, { n: 5, lo: 50, hi: 74 }), 0.9, { a: 0.03, r: 1.3, cut: 1600, cutTo: 900 });
    s.timp(X, end, timpDo(pkg.tonic), 0.75, { decay: 1.8 });
    return end + 2 - t;
  },

  // Countdown lead-in (channel-and-breaks.md): a quiet bell tick every second,
  // triangle eighths at 120 BPM, a pad that resolves minor to major at 0:00.
  // The sombre version (opts.grave) drops the ticks.
  countdown(bed, t, pkg, opts = {}) {
    const s = bed.s;
    const secs = Math.max(2, Math.min(10, Math.round(opts.seconds || 5)));
    const doM = nearest(pkg.tonic % 12, 50);
    const P = bed.bus('pad', -11, { rev: 0.45 });
    const B = bed.bus('bass', -11, { rev: 0.05 });
    const G = bed.bus('bell', -17, { rev: 0.4 });
    s.pad(P, t, secs, voice(chord('Dmadd9'), null, { n: 4, lo: 50, hi: 70 }), 0.75, { a: 0.6, r: 0.4, cut: 700, cutTo: 1100 });
    for (let k = 0; k < secs * 4; k++) s.tone(B, t + k * 0.25, 0.18, doM - 12, k % 2 ? 0.45 : 0.6, { wave: 'tri', a: 0.005, d: 0.1, s: 0.5, r: 0.06, gain: 0.5 });
    if (!opts.grave) for (let k = 0; k < secs; k++) s.bell(G, t + k, 0.4, doM + 36, 0.4, { ratio: 3.5, index: 0.6, gain: 0.2, cut: 3000 });
    const end = t + secs;
    s.pad(P, end, 1.6, voice(chord(pkg.final), null, { n: 5, lo: 50, hi: 74 }), 0.9, { a: 0.03, r: 1.4, cut: 1500, cutTo: 900 });
    s.tone(B, end, 1.4, doM - 12, 0.8, { wave: 'tri', a: 0.01, d: 0.5, s: 0.6, r: 0.8, gain: 0.6 });
    return secs + 2.4;
  },

  // "Up next" promo (4.2 s): the conductor plays the NEXT programme's own bed;
  // this adds its motif ending on the "next" colour (2) over its dominant:
  // left hanging, for the programme's open to resolve.
  upNext(bed, t, pkg) {
    const s = bed.s;
    const spb = 60 / pkg.bpm;
    const beats = Math.max(6, Math.min(9, Math.round(4.2 / spb)));
    const half = Math.floor(beats / 2);
    const doM = nearest(pkg.tonic % 12, pkg.id === 'world-now' ? 50 : 62);
    const L = bed.bus('lead', -11, { rev: 0.45, dly: 0.2 });
    const P = bed.bus('pad', -13, { rev: 0.45 });
    s.pad(P, t + half * spb, (beats - half) * spb + 0.3, voice(domSus(pkg.tonic), null, { n: 4, lo: 52, hi: 72 }), 0.7, { a: 0.3, r: 0.9, cut: 900, cutTo: 1300 });
    statement(bed, L, t + (half - 1) * spb, doM, spb, { colour: COLOURS.next, inst: lead(pkg), harm: pkg.timbre.harm, vel: 0.7, hold: Math.max(0.6, (beats - half - 1.5) / 1.5), L: { cut: 1500 } });
    return beats * spb + 0.6;
  },

  // Replay tag: a tape-rewind glide, then the motif backwards on a music box.
  replay(bed, t, pkg) {
    const s = bed.s;
    const R = bed.bus('lead', -14, { rev: 0.5, dly: 0.25 });
    const doM = nearest(pkg.tonic % 12, 74);
    s.glide(R, t, 0.45, doM + 12, doM - 12, 0.5, { wave: 'pulse25', cut: 1800 });
    s.glide(R, t + 0.02, 0.43, doM + 19, doM - 5, 0.3, { wave: 'pulse12', cut: 1800 });
    statement(bed, R, t + 0.55, doM, 0.24, { steps: SHAPES.retro, beats: SHAPES.retroBeats.map(() => 0.5), inst: INST.musicbox, vel: 0.7, hold: 2 });
    return 2.4;
  },

  // Breaking news (<= 3 s, then silence for the presenter): a timpani roll into
  // a low hit, the motif with its minor-third colour on brass in octaves over
  // D minor(add9). Calm authority, not a siren; no cymbal, no noise.
  breaking(bed, t) {
    const s = bed.s;
    const tonic = 50; // D minor: the flagship's key, whatever is on air
    const doT = timpDo(tonic);
    const L = bed.bus('lead', -9, { rev: 0.45, dly: 0.1 });
    const P = bed.bus('pad', -11, { rev: 0.5 });
    const X = bed.bus('perc', -7, { rev: 0.35 });
    const B = bed.bus('bass', -8, { rev: 0.1 });
    s.timpRoll(X, t, 0.85, doT, 0.06, 0.6);
    const hit = t + 0.85;
    s.timp(X, hit, doT, 0.95, { decay: 1.8 });
    s.timp(X, hit, doT - 12, 0.5, { decay: 1.6 });
    s.tone(B, hit, 1.3, tonic - 12, 0.9, { wave: 'tri', a: 0.008, d: 0.6, s: 0.6, r: 0.5, gain: 0.6 });
    s.pad(P, hit, 1.3, voice(chord('Dmadd9'), null, { n: 5, lo: 50, hi: 72 }), 0.8, { a: 0.02, r: 0.7, cut: 1500, cutTo: 700 });
    statement(bed, L, hit, 62, 60 / 150, { colour: COLOURS.breaking, inst: INST.horn, harm: [-12], vel: 0.85, hold: 0.9, L: { cut: 1500 } });
    return 2.9;
  },
};

// Almost inaudible low drone for grave stories (only when grave = 'pad'):
// an open fifth on the tonic that fades out over ~10 s.
export function graveDrone(bed, t, pkg) {
  const P = bed.bus('pad', -30, { rev: 0.5 });
  const doN = nearest(pkg.tonic % 12, 38);
  bed.s.pad(P, t, 6, [doN, doN + 7, doN + 12], 0.8, { wave: 'soft', a: 2.5, r: 6, cut: 360, detune: 5 });
  return 12;
}
