// Lo-fi newsroom proposal: cue-driven pieces and one-shots, all sung with the
// channel signature (low 5 - 1 - 2 - high 5 + colour, theory.js) and placed by
// the programme style bibles (docs/programmes/*.md):
//   WORLD NOW   headline(): low brass + triangle root, one chord per headline
//               line (Bm -> G -> D, D3 and below); pip(): one soft timpani hit
//               then two bell notes, low 5 -> 1, in each gap; signoffBrass():
//               the signature resolving 3 -> 1 on low brass; breaking(): one
//               b3 signature sting.
//   TECH BYTES  techNumber(): pluck, dry, low 5 -> 1 (0.8 s); techButton():
//               two plucks resolving to A (0.6 s).
//   MONEY       moneyNumber(): the signature at double speed + the 6th (0.8 s);
//               moneySignoff(): a fragment after the last word; moneyButton():
//               the end card's first downbeat.
//   NEWS IN 60  sixtyBell(): one Gadd9 bell chord on the sign-off's last word.
//   CHANNEL     countdown() (10.5 s), identFilm() (3 bars + hold), shortIdent(),
//               sombreIdent(), upNext(), replay() (the signature backwards on the
//               REPLAY plate: "we have heard this before").
// Each takes (engine, t, opts) and returns the time it has finished ringing.

import { PROGRAMMES } from './palettes.js';
import { SCALES, COLOUR, parseChord, voiceChord, degreeToMidi, motifVariant, mod } from './theory.js';
import { targetTo } from './automation.js';

const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const bassOf = (pc, octave = 2) => 12 * (octave + 1) + mod(pc, 12);

function chord(eng, dest, t, dur, symbol, { inst = 'ep', lo = 55, vel = 0.75, roll = 0.025, p = {} } = {}) {
  const c = parseChord(symbol);
  const v = voiceChord(c, null, lo);
  v.forEach((midi, i) => eng.rig[inst](t + i * roll, midi, dur, vel, dest, { pan: (i - 1.5) * 0.15, ...p }));
  return c;
}

/** The signature (a variant) from tonic `base` (MIDI of degree 0) on instrument `inst`. */
function motif(eng, dest, t, spb, kind, { inst, base, scale = 'major', colour = COLOUR.home, vel = 0.8, p = {} }) {
  const sc = SCALES[scale];
  const notes = motifVariant(kind, 0, colour);
  for (const n of notes) eng.rig[inst](t + n.at * spb, degreeToMidi(base, sc, n.d), n.len * spb * 0.95, vel, dest, p);
  const last = notes[notes.length - 1];
  return t + (last.at + last.len) * spb;
}

/** A sting bus: its own gain, optional tape echo, registered so cue('cut') can stop it. */
function bus(eng, level, { echo = 0, time = 0.4 } = {}) {
  const ctx = eng.ctx;
  const g = ctx.createGain();
  g.gain.value = level;
  g.connect(eng.stingBus);
  eng.registerSting?.(g);
  if (!echo) return g;
  const inp = ctx.createGain();
  inp.connect(g);
  const d = ctx.createDelay(2);
  d.delayTime.value = time;
  const fb = ctx.createGain();
  fb.gain.value = 0.36;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2000;
  const wet = ctx.createGain();
  wet.gain.value = echo;
  inp.connect(d).connect(lp).connect(wet).connect(g);
  lp.connect(fb).connect(d);
  return inp;
}

// WORLD NOW headline arc: minor to major across the lines (Lowe's arc).
const ARC = { 1: ['D'], 2: ['Bm', 'D'], 3: ['Bm', 'G', 'D'] };
// Close low-brass voicings, top note D3 (MIDI 50) while anyone speaks; triangle root below.
const BRASS = { Bm: { notes: [42, 47, 50], root: 35 }, G: { notes: [43, 47, 50], root: 31 }, D: { notes: [42, 45, 50], root: 38 } };

export const STINGS = {
  /** One sustained chord per headline line, on the engine's ducked headline bus. */
  headline(eng, t, { line = 0, lines = 3 } = {}) {
    const arc = ARC[Math.max(1, Math.min(3, lines))];
    const name = arc[Math.min(line, arc.length - 1)];
    const v = BRASS[name];
    const prev = eng.headlineVoice;
    if (prev) targetTo(prev.gain.gain, 0, t, 0.12);
    const g = eng.ctx.createGain();
    g.gain.value = 1;
    g.connect(eng.headBus);
    const hold = 14;
    v.notes.forEach((m, i) => eng.rig.brass(t + i * 0.012, m, hold, 0.8, g, { bright: 800, pan: (i - 1) * 0.25, attack: 0.12 }));
    eng.rig.bass(t, v.root, hold, 0.7, g, { wave: 'triangle', lp: 420, release: 0.3 });
    eng.headlineVoice = { gain: g, name };
    return t + hold;
  },

  /** In each headline gap: one soft timpani hit, then the pip (bell low 5 -> 1). */
  pip(eng, t, { line = 0, lines = 3 } = {}) {
    const dest = bus(eng, 0.42, { echo: 0.25, time: 0.33 });
    const name = eng.headlineVoice?.name || 'D';
    eng.rig.timpani(t, BRASS[name].root + 12, 0.42, dest);
    const spb = 60 / 92;
    const a = t + 0.22;
    eng.rig.bell(a, 69, spb * 0.45, 0.6, dest, { decay: 0.35 }); // A4: low 5
    eng.rig.bell(a + spb * 0.5, 74, spb * 0.9, 0.65, dest, { decay: 0.5 }); // D5: 1 (the last pip lands on 1)
    return a + spb * 1.5 + (line + 1 >= lines ? 0.3 : 0);
  },

  /** Release the headline chord (the bed is gone 0.3 s after the cut to the greeting). */
  headlineOff(eng, t, fade = 0.3) {
    const v = eng.headlineVoice;
    if (!v) return t;
    targetTo(v.gain.gain, 0, t, fade / 4);
    eng.headlineVoice = null;
    return t + fade;
  },

  /** WORLD NOW sign-off: low brass sings the signature resolving 3 -> 1, over a triangle D. */
  signoffBrass(eng, t) {
    const dest = bus(eng, 0.6, { echo: 0.2, time: 0.49 });
    const spb = 60 / 92;
    // Nobody speaks over it (the 1.5 s hold): the brass may open up a little; the triangle stays under it.
    const end = motif(eng, dest, t, spb, 'answer', { inst: 'brass', base: 50, colour: COLOUR.home, vel: 0.85, p: { bright: 1300, attack: 0.07, release: 0.5 } });
    eng.rig.bass(t + spb * 1.5, 38, spb * 4.5, 0.42, dest, { wave: 'triangle', lp: 420, release: 0.6 });
    return end + 1.5;
  },

  /** Breaking (WORLD NOW / channel): one b3 signature sting in D minor, low brass over one timpani. */
  breaking(eng, t) {
    const dest = bus(eng, 0.6, { echo: 0.15, time: 0.45 });
    const spb = 60 / 96;
    eng.rig.timpani(t, 38, 0.55, dest);
    const end = motif(eng, dest, t, spb, 'statement', { inst: 'brass', base: 50, scale: 'minor', colour: COLOUR.breaking, vel: 0.85, p: { bright: 1150, attack: 0.06, release: 0.45 } });
    eng.rig.bass(t, 38, (end - t) + 0.5, 0.4, dest, { wave: 'triangle', lp: 380, release: 0.5 });
    return end + 1.2;
  },

  /** TECH BYTES number of the day: pluck, dry, low 5 -> 1 (the 1 lands on the figure, 0.29 s after the cue). */
  techNumber(eng, t) {
    const dest = bus(eng, 0.9);
    const spb = 60 / 104;
    eng.rig.pluck(t, 64, spb * 0.45, 0.85, dest, { wave: 'pulse25', decay: 0.13, bright: 1700 }); // E4
    eng.rig.pluck(t + spb * 0.5, 69, spb, 0.9, dest, { wave: 'pulse25', decay: 0.2, bright: 1700 }); // A4
    return t + 0.8;
  },

  /** TECH BYTES end of a feature: a two-note pluck button resolving to A. */
  techButton(eng, t) {
    const dest = bus(eng, 0.9);
    eng.rig.pluck(t, 67, 0.22, 0.75, dest, { wave: 'pulse25', decay: 0.12, bright: 1600 }); // G4 (b7)
    eng.rig.pluck(t + 0.25, 69, 0.4, 0.85, dest, { wave: 'pulse25', decay: 0.18, bright: 1600 }); // A4
    return t + 0.6;
  },

  /** MONEY MINUTE into the number: the signature at double speed with the 6th, Rhodes (<= 1.0 s). */
  moneyNumber(eng, t) {
    const dest = bus(eng, 0.75);
    const spb = (60 / 114) * 0.5;
    const notes = motifVariant('statement', 0, COLOUR.money).map((n, i, a) => ({ ...n, len: i === a.length - 1 ? 0.5 : n.len }));
    for (const n of notes) eng.rig.ep(t + n.at * spb, degreeToMidi(65, SCALES.major, n.d), n.len * spb * 0.9, 0.75, dest, { index: 0.9, attack: 0.006, release: 0.1 });
    return t + 0.95;
  },

  /** MONEY MINUTE sign-off: a fragment of the signature in the gap after the last word. */
  moneySignoff(eng, t) {
    const dest = bus(eng, 0.6);
    const spb = 60 / 114;
    return motif(eng, dest, t, spb, 'head', { inst: 'ep', base: 65, colour: COLOUR.money, vel: 0.65, p: { index: 0.8, release: 0.3 } }) + 0.5;
  },

  /** MONEY MINUTE end card: a button on its first downbeat (the end card is one of the two full-level places). */
  moneyButton(eng, t) {
    const dest = bus(eng, 1);
    chord(eng, dest, t, 0.9, 'Fmaj9', { lo: 53, vel: 0.8, roll: 0.015, p: { index: 1, release: 0.4 } });
    eng.rig.bass(t, 41, 1.2, 0.7, dest, { wave: 'triangle', lp: 600, release: 0.5 });
    eng.rig.ep(t + 0.02, degreeToMidi(77, SCALES.major, 5), 1, 0.6, dest, { index: 0.9, release: 0.5 }); // the 6th on top
    return t + 2;
  },

  /** NEWS IN 60 sign-off: one Gadd9 bell chord (G B D A) on the last word. */
  sixtyBell(eng, t) {
    const dest = bus(eng, 0.7, { echo: 0.2, time: 0.375 });
    [67, 71, 74, 81].forEach((m, i) => eng.rig.bell(t + i * 0.008, m, 2, 0.6, dest, { decay: 0.9, pan: (i - 1.5) * 0.2 }));
    return t + 4;
  },

  /**
   * Lead-in countdown (WORLD NOW, NEWS IN 60), 10.5 s: a quiet bell tick every second,
   * triangle eighths at 120 BPM, a pad that resolves minor -> major at 0:00 (t + 10),
   * a hard cut at t + 10.5. Sombre: no ticks, no eighths; the pad and a triangle pedal.
   */
  countdown(eng, t, { programme = 'world-now', sombre = false } = {}) {
    const prog = PROGRAMMES[programme] || PROGRAMMES['world-now'];
    const root = NAMES[prog.tonic % 12];
    const dest = bus(eng, 0.35); // >= 18 LU under the continuity voice
    const cut = t + 10.5;
    chord(eng, dest, t, 10, `${root}m9`, { inst: 'pad', lo: 50, vel: 0.85, roll: 0, p: { attack: 1.5, lpTo: 900, release: 0.25 } });
    chord(eng, dest, t + 10, 0.5, `${root}add9`, { inst: 'pad', lo: 50, vel: 0.95, roll: 0, p: { attack: 0.05, lpTo: 1300, release: 0.03 } });
    const pedal = bassOf(prog.tonic);
    if (sombre) {
      eng.rig.bass(t, pedal, 10.45, 0.55, dest, { wave: 'triangle', lp: 400, release: 0.03 });
    } else {
      for (let i = 0; i < 42; i++) eng.rig.bass(t + i * 0.25, pedal, 0.16, i % 2 ? 0.42 : 0.6, dest, { wave: 'triangle', lp: 450, release: 0.03 });
      for (let s = 0; s < 10; s++) eng.rig.bell(t + s, prog.tonic + 19, 0.12, 0.4, dest, { decay: 0.1 });
    }
    // The hard cut: everything off in 25 ms at 10.5 s.
    const g = dest.gain;
    g.setValueAtTime(g.value, cut - 0.025);
    g.linearRampToValueAtTime(0, cut);
    return cut;
  },

  /**
   * Lead-in ident film (TECH, COSMOS, MONEY): 3 bars of movement at the daypart
   * tempo (84-92 BPM at night, 96-104 by day); the signature once on pulse-12 with
   * echo over a pad and triangle pedal, its colour note landing on the alignment
   * (bar 4, beat 1); then the hold loops pad + pluck until cue('cut') (<= 5 s).
   */
  identFilm(eng, t, { programme = 'tech-bytes', sombre = false, hour = 12 } = {}) {
    const prog = PROGRAMMES[programme] || PROGRAMMES['tech-bytes'];
    const day = hour >= 7 && hour < 19;
    const spb = 60 / (day ? 100 : 88);
    const dest = bus(eng, 0.35); // >= 18 LU under the continuity voice
    const lead = bus(eng, 0.35, { echo: 0.45, time: spb * 0.75 });
    const I = { 'tech-bytes': 'Am9', cosmos: 'Emaj9', 'money-minute': 'Fmaj9' }[programme] || 'Dmaj9';
    const align = t + spb * 12;
    const holdEnd = align + 5.2;
    chord(eng, dest, t, holdEnd - t, I, { inst: 'pad', lo: 50, vel: 0.85, roll: 0, p: { attack: 2.5, lpTo: 1100, release: 0.6 } });
    eng.rig.bass(t, bassOf(prog.tonic), holdEnd - t, 0.55, dest, { wave: 'triangle', lp: 420, release: 0.6 });
    if (!sombre) {
      motif(eng, lead, align - spb * 2.5, spb, 'statement', { inst: 'pulse12', base: prog.tonic, scale: prog.scale, colour: prog.colour, vel: 0.8, p: { lp: 1500 } });
      // Hold: pad + a slow pluck loop on the chord.
      const v = voiceChord(parseChord(I), null, 62);
      for (let i = 0; align + spb + i * spb * 0.5 < holdEnd - 0.4; i++) {
        eng.rig.pluck(align + spb + i * spb * 0.5, v[[0, 2, 1, 3][i % 4] % v.length], spb * 0.45, i % 2 ? 0.4 : 0.55, dest, { wave: 'pulse25', decay: 0.18, bright: 1500 });
      }
    }
    return holdEnd;
  },

  /** Short locked-off ident (bumper, or a client's first filler item): 5.5 s, no voice. */
  shortIdent(eng, t) {
    const prog = PROGRAMMES.channel;
    const spb = 60 / 96;
    const dest = bus(eng, 1.35); // no voice: about -16 LUFS like the bumper cards
    const lead = bus(eng, 1.35, { echo: 0.45, time: spb * 0.75 });
    const align = t + 2.6;
    chord(eng, dest, t, 5.3, 'Dmaj9', { inst: 'pad', lo: 50, vel: 0.85, roll: 0, p: { attack: 1.2, lpTo: 1200, release: 0.8 } });
    eng.rig.bass(t, 38, 5.3, 0.6, dest, { wave: 'triangle', lp: 420, release: 0.8 });
    motif(eng, lead, align - spb * 2.5, spb, 'statement', { inst: 'pulse12', base: prog.tonic, colour: prog.colour, vel: 0.85, p: { lp: 1600 } });
    return t + 6.2;
  },

  /** Sombre short ident (grave mode): locked off, a pad only, no signature. */
  sombreIdent(eng, t) {
    const dest = bus(eng, 1.6);
    chord(eng, dest, t, 5.2, 'Bm9', { inst: 'pad', lo: 47, vel: 0.85, roll: 0, p: { attack: 1.4, lpTo: 800, release: 1 } });
    eng.rig.bass(t, 35, 5.2, 0.5, dest, { wave: 'sine', lp: 300, release: 1 });
    return t + 6.5;
  },

  /**
   * REPLAY marker (a replayed episode's plate, before its open): the signature in retrograde
   * (high 5 - 2 - 1 - low 5, then the 2 left open) on a soft Rhodes through a long tape echo, over
   * a held IV(add9) pad; the tape slows a few cents at the end. 2.6 s, no voice over it.
   */
  replay(eng, t, { programme = 'channel' } = {}) {
    const prog = PROGRAMMES[programme] || PROGRAMMES.channel;
    const spb = 60 / 84;
    const dest = bus(eng, 0.8);
    const lead = bus(eng, 0.75, { echo: 0.5, time: spb * 0.75 });
    const IV = degreeToMidi(prog.tonic, SCALES[prog.scale], 3) % 12;
    chord(eng, dest, t, 2.4, `${NAMES[IV]}add9`, { inst: 'pad', lo: 50, vel: 0.7, roll: 0, p: { attack: 0.5, lpTo: 1000, release: 0.9 } });
    eng.rig.bass(t, bassOf(IV), 2.4, 0.45, dest, { wave: 'triangle', lp: 480, release: 0.8 });
    const notes = motifVariant('retrograde', 0, COLOUR.next);
    notes.forEach((n, i) => eng.rig.ep(t + n.at * spb * 0.8, degreeToMidi(prog.tonic, SCALES[prog.scale], n.d), n.len * spb * 0.75, 0.6 - i * 0.04, lead, { index: 0.7, attack: 0.012, release: 0.35, bend: i === notes.length - 1 ? -22 : 0 }));
    return t + 4;
  },

  /** UP NEXT (only without sharedStings: audio.js has its own promo cue): IV -> V9sus, the signature hanging on the 2nd. */
  upNext(eng, t, { programme = 'world-now', seconds = 4.2 } = {}) {
    const prog = PROGRAMMES[programme] || PROGRAMMES['world-now'];
    const spb = Math.min(60 / prog.bpm, (seconds - 1.2) / 4);
    const dest = bus(eng, 0.8);
    const lead = bus(eng, 0.8, { echo: 0.4, time: spb * 0.75 });
    const IV = degreeToMidi(prog.tonic, SCALES[prog.scale], 3) % 12;
    const V = degreeToMidi(prog.tonic, SCALES[prog.scale], 4) % 12;
    chord(eng, dest, t, spb * 1.5, `${NAMES[IV]}maj9`, { inst: 'pad', lo: 50, vel: 0.75, roll: 0, p: { attack: 0.3, lpTo: 1200, release: 0.5 } });
    eng.rig.bass(t, bassOf(IV), spb * 1.5, 0.45, dest, { wave: 'triangle', lp: 560, release: 0.15 });
    motif(eng, lead, t, spb, 'statement', { inst: 'pulse12', base: prog.tonic, scale: prog.scale, colour: COLOUR.next, vel: 0.8, p: { lp: 1500 } });
    const t2 = t + spb * 1.5;
    chord(eng, dest, t2, spb * 2.5 + 0.8, `${NAMES[V]}9sus`, { inst: 'pad', lo: 50, vel: 0.7, roll: 0, p: { attack: 0.25, lpTo: 1300, release: 0.9 } });
    eng.rig.bass(t2, bassOf(V), spb * 2.5 + 0.6, 0.45, dest, { wave: 'triangle', lp: 560, release: 0.5 });
    return t2 + spb * 2.5 + 2;
  },
};
