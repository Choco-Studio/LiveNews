// One-shot cues of the "broadcast" package: end card, break bumpers, up-next
// promo, replay tag, breaking-news sting, and the small accents the director
// can fire (montage frame, round-up item). Every sting is the channel motif in
// a different dress, and each ends in a way that tells the viewer what comes
// next: bumper-in hangs on the dominant ("don't go away"), bumper-out and the
// end card resolve, up-next plays only three of the four notes and leaves the
// last one to the programme's own open.

import { MOTIF, motifShapes, parseChord, voice, nearest, hz } from './theory.js';
import { INST, timpDo } from './arranger.js';

const SHAPES = motifShapes(MOTIF);
const chord = (sym) => parseChord(sym);
// Dominant suspension of a key: sol do re fa above sol (the "to be continued" chord).
const domSus = (tonic) => ({ root: (tonic + 7) % 12, bass: (tonic + 7) % 12, tones: [0, 5, 7, 10], minor: false });

// Lead instruments per programme timbre (motif statements).
function lead(pkg) {
  return INST[pkg.timbre.lead] || INST.horn;
}

/**
 * Plays a motif statement. `beats` scale the rhythm; returns the time of the
 * last note.
 */
function statement(bed, out, t, doM, spb, { steps = SHAPES.steps, beats = SHAPES.beats, count = steps.length, inst, harm = [], vel = 0.8, hold = 1, L = {} } = {}) {
  let at = t;
  let last = t;
  for (let k = 0; k < count; k++) {
    const isLast = k === count - 1;
    const dur = beats[k] * spb * (isLast ? hold : 0.92);
    const v = vel * (isLast ? 1 : 0.82 + 0.06 * k);
    inst(bed.s, out, at, dur, doM + steps[k], v, L);
    for (const h of harm) inst(bed.s, out, at, dur, doM + steps[k] + h, v * 0.6, L);
    last = at;
    at += beats[k] * spb;
  }
  return last;
}

export const STINGS = {
  // End card: the full motif, timpani on the first and last notes, and the
  // programme's final chord (tonic with the added 2nd: the motif's own colour).
  endcard(bed, t, pkg) {
    const s = bed.s;
    const spb = 60 / 132;
    const doM = nearest(pkg.tonic % 12, 62);
    const L = bed.bus('lead', -9, { rev: 0.45, dly: pkg.timbre.lead === 'square' ? 0.3 : 0.12 });
    const P = bed.bus('pad', -10, { rev: 0.5 });
    const X = bed.bus('perc', -8, { rev: 0.4 });
    const B = bed.bus('bass', -9, { rev: 0.1 });
    const end = statement(bed, L, t, doM, spb, { inst: lead(pkg), harm: pkg.timbre.harm, vel: 0.85, hold: 2, L: { cut: 1700 } });
    const fin = chord(pkg.final);
    s.timp(X, t, timpDo(pkg.tonic) - 5, 0.45);
    s.timp(X, end, timpDo(pkg.tonic), 0.85, { decay: 2 });
    s.cymbal(X, end, 0.45, { decay: 2.4 });
    s.tone(B, t, spb * 1.9, doM - 24, 0.7, { wave: 'tri', a: 0.01, d: 0.3, s: 0.7, r: 0.1, cut: 800, gain: 0.6 });
    s.tone(B, end, 1.5, nearest(fin.root, doM - 24), 0.9, { wave: 'tri', a: 0.01, d: 0.6, s: 0.5, r: 0.9, cut: 800, gain: 0.6 });
    s.pad(P, end, 1.4, voice(fin, null, { n: 5, lo: 50, hi: 74 }), 0.95, { wave: 'soft', a: 0.03, r: 1.4, cut: 1900, cutTo: 900 });
    const sp = INST[pkg.timbre.sparkle] || INST.glock;
    const G = bed.bus('sparkle', -20, { rev: 0.6, dly: 0.4, pan: 0.3 });
    sp(s, G, end + spb * 0.5, 0.4, doM + 24 + 7, 0.5);
    sp(s, G, end + spb, 0.6, doM + 24 + 12, 0.45);
    return end + 2.6 - t;
  },

  // Into the break (station ident, 3.2 s): a swell, the motif, and it hangs on
  // the dominant: "we'll be right back".
  bumperIn(bed, t, pkg) {
    const s = bed.s;
    const spb = 60 / 120;
    const doM = nearest(pkg.tonic % 12, 62);
    const L = bed.bus('lead', -10, { rev: 0.45, dly: 0.2 });
    const P = bed.bus('pad', -11, { rev: 0.5 });
    const X = bed.bus('perc', -9, { rev: 0.4 });
    const G = bed.bus('sparkle', -19, { rev: 0.6, dly: 0.35, pan: 0.35 });
    s.swell(X, t, 0.5, 0.7, { gain: 0.14 });
    const t1 = t + 0.5;
    const end = statement(bed, L, t1, doM, spb, { inst: INST.horn, harm: [-7], vel: 0.8, hold: 1.4 });
    statement(bed, G, t1, doM + 24, spb, { inst: INST.glock, vel: 0.5 });
    s.pad(P, t1, spb * 2, voice(chord(pkg.home), null, { n: 4, lo: 50, hi: 70 }), 0.8, { a: 0.05, r: 0.5, cut: 1500 });
    s.pad(P, end, 1.2, voice(domSus(pkg.tonic), null, { n: 4, lo: 52, hi: 72 }), 0.9, { a: 0.05, r: 1.1, cut: 1700, cutTo: 900 });
    s.timp(X, t1, timpDo(pkg.tonic) - 5, 0.4);
    s.timp(X, end, timpDo(pkg.tonic) - 5, 0.75, { decay: 1.8 }); // ends on sol
    s.tone(X, end, 1.2, timpDo(pkg.tonic) - 17, 0.8, { wave: 'tri', a: 0.01, d: 0.5, s: 0.5, r: 0.8, cut: 700, gain: 0.5 });
    return end + 2.2 - t;
  },

  // Back from the break: the motif resolves home with a soft timpani.
  bumperOut(bed, t, pkg) {
    const s = bed.s;
    const spb = 60 / 126;
    const doM = nearest(pkg.tonic % 12, 62);
    const L = bed.bus('lead', -10, { rev: 0.45, dly: 0.15 });
    const P = bed.bus('pad', -11, { rev: 0.5 });
    const X = bed.bus('perc', -9, { rev: 0.4 });
    const end = statement(bed, L, t, doM, spb, { inst: INST.horn, harm: [-7], vel: 0.8, hold: 1.8 });
    s.pad(P, t, spb * 2, voice(domSus(pkg.tonic), null, { n: 4, lo: 52, hi: 72 }), 0.7, { a: 0.05, r: 0.4, cut: 1300 });
    s.pad(P, end, 1.2, voice(chord(pkg.final), null, { n: 5, lo: 50, hi: 74 }), 0.9, { a: 0.03, r: 1.3, cut: 1800, cutTo: 900 });
    s.timp(X, end, timpDo(pkg.tonic), 0.8, { decay: 1.8 });
    s.cymbal(X, end, 0.35, { decay: 1.8 });
    return end + 2 - t;
  },

  // "Up next" promo (4.2 s) in the NEXT programme's colours: its groove for two
  // bars, then sol-do-re of the motif hanging on the dominant. The fourth note
  // is the programme open's job.
  upNext(bed, t, pkg) {
    const s = bed.s;
    const spb = 60 / pkg.bpm;
    const beats = Math.max(6, Math.min(8, Math.round(4.2 / spb)));
    const half = Math.floor(beats / 2);
    const doM = nearest(pkg.tonic % 12, 62);
    const L = bed.bus('lead', -11, { rev: 0.45, dly: 0.2 });
    const P = bed.bus('pad', -12, { rev: 0.45 });
    const O = bed.bus('osti', -15, { dly: 0.15, pan: -0.25 });
    const X = bed.bus('perc', -10, { rev: 0.3 });
    const home = chord(pkg.home);
    s.pad(P, t, half * spb + 0.05, voice(home, null, { n: 4, lo: 50, hi: 70 }), 0.8, { a: 0.15, r: 0.5, cut: 800, cutTo: 1300 });
    s.pad(P, t + half * spb, (beats - half) * spb + 0.3, voice(domSus(pkg.tonic), null, { n: 4, lo: 52, hi: 72 }), 0.85, { a: 0.1, r: 0.9, cut: 1000, cutTo: 1600 });
    // The programme's pulse, a tonic pedal from the motif cell.
    const cell = [0, 0, 12, 0, 7, 0, 12, 14];
    for (let k = 0; k < beats * 2; k++) {
      const v = (k % 2 ? 0.45 : 0.7) * (0.6 + (0.4 * k) / (beats * 2));
      s.pluck(O, t + k * spb * 0.5, pkg.tonic - 12 + cell[k % 8], v, { wave: 'pulse25', decay: 0.15, cut: 1700, cutEnd: 420 });
    }
    s.timp(X, t, timpDo(pkg.tonic), 0.55);
    const t2 = t + half * spb;
    statement(bed, L, t2, doM, spb, { count: 3, inst: lead(pkg), harm: pkg.timbre.harm, vel: 0.75, hold: (beats - half - 1) * 0.9 + 0.5, L: { cut: 1600 } });
    s.timp(X, t + (beats - 1) * spb, timpDo(pkg.tonic) - 5, 0.4);
    s.timp(X, t + (beats - 0.5) * spb, timpDo(pkg.tonic) - 5, 0.55);
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

  // Breaking news (<= 3 s, then silence for the presenter): a timpani roll
  // into a low hit, the motif quick and firm on a horn in fifths over the
  // tonic minor with the added 2nd. Calm authority, not a siren.
  breaking(bed, t, pkg) {
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
    s.cymbal(X, hit, 0.3, { decay: 1.6 });
    s.tone(B, hit, 1.3, tonic - 12, 0.9, { wave: 'tri', a: 0.008, d: 0.6, s: 0.6, r: 0.5, cut: 600, gain: 0.6 });
    s.pad(P, hit, 1.3, voice(chord('Dmadd9'), null, { n: 5, lo: 50, hi: 72 }), 0.8, { a: 0.02, r: 0.7, cut: 1500, cutTo: 700 });
    const spb = 60 / 150;
    statement(bed, L, hit, 62, spb, { beats: [0.5, 0.5, 1, 2], inst: INST.horn, harm: [-7], vel: 0.85, hold: 1.1, L: { cut: 1600 } });
    return 2.9;
  },

  // Montage frame accent: a soft timpani "do" with a motif note on top.
  frame(bed, t, pkg, n = 0) {
    const X = bed.bus('accent', -14, { rev: 0.4, dly: 0.2 });
    bed.s.timp(X, t, timpDo(pkg.tonic), 0.45, { decay: 1 });
    bed.s.pluck(X, t, nearest(pkg.tonic % 12, 62) + SHAPES.steps[n % SHAPES.steps.length], 0.5, { wave: 'pulse25', decay: 0.35, cut: 1500, cutEnd: 400 });
    return 1;
  },

  // Round-up item: the next motif note, chimed lightly, one per place.
  item(bed, t, pkg, n = 0) {
    const X = bed.bus('accent', -16, { rev: 0.5, dly: 0.3, pan: 0.2 });
    bed.s.bell(X, t, 0.9, nearest(pkg.tonic % 12, 74) + SHAPES.steps[n % SHAPES.steps.length], 0.5, { ratio: 2, index: 0.8, gain: 0.25, cut: 3000 });
    bed.s.timp(X, t, timpDo(pkg.tonic), 0.3, { decay: 0.8 });
    return 1;
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

export { hz };
