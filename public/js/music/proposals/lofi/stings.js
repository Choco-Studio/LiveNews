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
//   FULL TIME   scoreSting(): the lead's scoreline card (the A/B's pick of scoreCrowd, a crowd swell, and
//               scoreBrass, a brass stab and a timpani hit), ducked under the voice it lands on.
//   PAY ATTENTION  quizRight() (two bright notes), quizWrong() (a soft low note, never a buzzer's sneer), quizDrumroll()
//               (DOUBLE OR NOTHING: two bars of snare and timpani roll, rising, landing on the key), quizTick() (the
//               countdown's tick, on the bed's half notes: LofiEngine.countdown). Named for the director: QUIZ_STINGS.
//   CHANNEL     countdown() (10.5 s), identFilm() (3 bars + hold), shortIdent(),
//               sombreIdent(), upNext(), replay() (the signature backwards on the
//               REPLAY plate: "we have heard this before").
// Each takes (engine, t, opts) and returns the time it has finished ringing.

import { PROGRAMMES } from './palettes.js';
import { SCALES, COLOUR, parseChord, voiceChord, guideTones, hasClash, degreeToMidi, motifVariant, mod } from './theory.js';
import { targetTo } from './automation.js';

const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
/**
 * FULL TIME's scoreline sting: the bible's A/B (full-time.md §6: "a crowd swell, if the A/B test says it sounds like a
 * crowd and not like rain; otherwise a brass stab and a timpani hit"). The evidence and the pick are in
 * docs/roadmap/critique/full-time-sound.md; both candidates stay here (scoreCrowd, scoreBrass) for the owner to hear.
 */
export const SCORE_STING = 'scoreCrowd';
/**
 * PAY ATTENTION's stings for the director (pay-attention.md §6), by what they mark. Cue them by moment through
 * music/live.js (cue('right'), cue('wrong'), cue('double')); the countdown's ticks come with LiveMusic.countdown().
 */
export const QUIZ_STINGS = Object.freeze({ right: 'quizRight', wrong: 'quizWrong', drumroll: 'quizDrumroll', tick: 'quizTick' });
const QUIZ_SPB = 60 / 112; // the quiz's beat (its bed, its open)
const bassOf = (pc, octave = 2) => 12 * (octave + 1) + mod(pc, 12);

// `avoid`: the notes a melody plays over the chord; the chord is voiced round them (on its guide
// tones if its colour would still rub a semitone on one). Returns the voicing.
function chord(eng, dest, t, dur, symbol, { inst = 'ep', lo = 55, vel = 0.75, roll = 0.025, p = {}, avoid = null } = {}) {
  const c = parseChord(symbol);
  let v = voiceChord(c, null, lo, { avoid });
  if (avoid && hasClash(v, avoid)) v = voiceChord(guideTones(c), null, lo, { avoid });
  v.forEach((midi, i) => eng.rig[inst](t + i * roll, midi, dur, vel, dest, { pan: (i - 1.5) * 0.15, ...p }));
  return v;
}

/** The notes (MIDI) of a signature variant from tonic `base`. */
const motifMidis = (kind, base, scale = 'major', colour = COLOUR.home) => motifVariant(kind, 0, colour).map((n) => degreeToMidi(base, SCALES[scale], n.d));

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
    const I = { 'tech-bytes': 'Am9', cosmos: 'Emaj9', 'money-minute': 'Fmaj9', 'world-weather': 'Cmaj9', 'seven-days': 'Bbmaj9' }[programme] || 'Dmaj9';
    const align = t + spb * 12;
    const holdEnd = align + 5.2;
    const sig = sombre ? null : motifMidis('statement', prog.tonic, prog.scale, prog.colour);
    const padV = chord(eng, dest, t, holdEnd - t, I, { inst: 'pad', lo: 50, vel: 0.85, roll: 0, p: { attack: 2.5, lpTo: 1100, release: 0.6 }, avoid: sig });
    eng.rig.bass(t, bassOf(prog.tonic), holdEnd - t, 0.55, dest, { wave: 'triangle', lp: 420, release: 0.6 });
    if (!sombre) {
      motif(eng, lead, align - spb * 2.5, spb, 'statement', { inst: 'pulse12', base: prog.tonic, scale: prog.scale, colour: prog.colour, vel: 0.8, p: { lp: 1500 } });
      // Hold: pad + a slow pluck loop on the chord.
      const v = voiceChord(parseChord(I), null, 62, { avoid: padV });
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
    chord(eng, dest, t, 5.3, 'Dmaj9', { inst: 'pad', lo: 50, vel: 0.85, roll: 0, p: { attack: 1.2, lpTo: 1200, release: 0.8 }, avoid: motifMidis('statement', prog.tonic, 'major', prog.colour) });
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
    chord(eng, dest, t, 2.4, `${NAMES[IV]}add9`, { inst: 'pad', lo: 50, vel: 0.7, roll: 0, p: { attack: 0.5, lpTo: 1000, release: 0.9 }, avoid: motifMidis('retrograde', prog.tonic, prog.scale, COLOUR.next) });
    eng.rig.bass(t, bassOf(IV), 2.4, 0.45, dest, { wave: 'triangle', lp: 480, release: 0.8 });
    const notes = motifVariant('retrograde', 0, COLOUR.next);
    notes.forEach((n, i) => eng.rig.ep(t + n.at * spb * 0.8, degreeToMidi(prog.tonic, SCALES[prog.scale], n.d), n.len * spb * 0.75, 0.6 - i * 0.04, lead, { index: 0.7, attack: 0.012, release: 0.35, bend: i === notes.length - 1 ? -22 : 0 }));
    return t + 4;
  },

  /**
   * FULL TIME's scoreline sting, candidate A (full-time.md §6): a crowd swell, the roar of a ground at a goal. Thirty
   * voices, each its own pitch (men and women, 100-340 Hz, never in tune with one another) and its own open vowel (mostly
   * "aah", some "uh" and "oh": F1 560-750 Hz, F2 1-1.2 kHz) through formants of its own size (a woman's a little higher
   * than a man's, every throat a little different), drifting at random and lifting with the excitement, each panned and
   * coming and going at random (never in a common pulse: no laughter, which the owner rejected); a few shouts stand out
   * of the roar at random moments, and four callers break out of it at the peak, one after another at uneven moments,
   * each sliding from "eh" to "ah" with a rising pitch; the crowd's breath (pink noise through the vowels) and the
   * ground's low rumble under it, all in the ground's own space (a dark 1.5 s tail). It swells for 0.6 s, holds a breath
   * and falls away over two seconds. Ducked under the voice it lands on (the card is cut to inside a sentence).
   */
  scoreCrowd(eng, t) {
    const ctx = eng.ctx;
    const rig = eng.rig;
    const out = eng.duckedSting ? eng.duckedSting(3.3, 1.2) : bus(eng, 3.3);
    let seed = 2417;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const nodes = [];
    const srcs = [];
    const stopAt = t + 4.6;
    // (an open "aah" for most voices, the rest "uh" and "oh": a crowd's roar is mostly open vowels)
    const VOWELS = [[750, 1220, 2600], [750, 1220, 2600], [720, 1150, 2550], [640, 1080, 2500], [560, 980, 2450]];
    // the swell
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.3, t + 0.2);
    env.gain.linearRampToValueAtTime(1, t + 0.6);
    env.gain.setValueAtTime(1, t + 0.82);
    env.gain.setTargetAtTime(0, t + 0.82, 0.55);
    // no hiss: the top of a crowd is its consonants, gently rolled off above 4 kHz
    const shelf = ctx.createBiquadFilter();
    shelf.type = 'highshelf';
    shelf.frequency.value = 4000;
    shelf.gain.value = -10;
    env.connect(shelf).connect(out);
    nodes.push(env, shelf);
    // the ground's space: a dark stereo tail (1.5 s to -60 dB, 20 ms before it starts), under the dry roar
    const sr = ctx.sampleRate;
    const n = Math.round(1.8 * sr);
    const ir = ctx.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      let lp = 0;
      for (let i = Math.round(0.02 * sr); i < n; i++) {
        lp += 0.35 * ((rnd() * 2 - 1) - lp); // (a one-pole low-pass: a dark tail, no fizz)
        d[i] = lp * Math.exp((-6.9 * i) / (1.5 * sr));
      }
    }
    const room = ctx.createConvolver();
    room.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.3;
    env.connect(room).connect(wet).connect(shelf);
    nodes.push(room, wet);
    // a slow random wobble (a noise buffer read very slowly and low-passed): pitch drift and voices coming and going
    const wobble = (rate, hz, depth, dest) => {
      const nz = ctx.createBufferSource();
      nz.buffer = rig.white;
      nz.loop = true;
      nz.playbackRate.value = rate;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = hz;
      lp.Q.value = 0.5;
      const g = ctx.createGain();
      g.gain.value = depth;
      nz.connect(lp).connect(g).connect(dest);
      nz.__offset = rnd() * 1.8;
      srcs.push(nz);
      nodes.push(lp, g);
    };
    // a vowel's three formants; `glide`: [time, the vowel it slides to, seconds] (a caller's "eh" opening to "ah")
    const vowel = (input, dest, [f1, f2, f3], q, k = 1, glide = null) => {
      [[f1, 1, q], [f2, 0.7, q * 1.15], [f3, 0.22, q * 1.5]].forEach(([f, gain, qq], j) => {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = f * k;
        if (glide) {
          bp.frequency.setValueAtTime(f * k, glide[0]);
          bp.frequency.linearRampToValueAtTime(glide[1][j] * k, glide[0] + glide[2]);
        }
        bp.Q.value = qq;
        const g = ctx.createGain();
        g.gain.value = gain;
        input.connect(bp).connect(g).connect(dest);
        nodes.push(bp, g);
      });
    };
    const VOICES = 30;
    const level = 0.034 * Math.sqrt(22 / VOICES); // (the roar as loud as ever, from more throats)
    for (let i = 0; i < VOICES; i++) {
      const f0 = 100 * 2 ** (rnd() * 1.77);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.linearRampToValueAtTime(f0 * (1.06 + 0.08 * rnd()), t + 0.65); // the excitement lifts the voices
      o.frequency.linearRampToValueAtTime(f0 * (1 + 0.04 * rnd()), t + 2.8);
      wobble(0.0016 + 0.0009 * rnd(), 10, f0 * 0.04, o.frequency);
      const amp = ctx.createGain();
      const on = t + rnd() * 0.35;
      amp.gain.setValueAtTime(0, t);
      amp.gain.setValueAtTime(0, on);
      amp.gain.linearRampToValueAtTime(level, on + 0.22 + rnd() * 0.2);
      // a shout now and then: one voice's level jumps for a moment and its pitch glides up (at random, never in step)
      if (rnd() < 0.3) {
        const at = t + 0.3 + rnd() * 1.1;
        const len = 0.14 + rnd() * 0.18;
        amp.gain.setValueAtTime(level, at);
        amp.gain.linearRampToValueAtTime(level * 2.2, at + 0.04);
        amp.gain.linearRampToValueAtTime(level, at + len);
        o.frequency.setValueAtTime(f0 * 1.08, at);
        o.frequency.linearRampToValueAtTime(f0 * 1.2, at + len);
        o.frequency.linearRampToValueAtTime(f0 * 1.05, at + len + 0.2);
      }
      // each voice comes and goes at random (a slow wobble on its level)
      const lvl = ctx.createGain();
      lvl.gain.value = 0.65;
      wobble(0.0011 + 0.0008 * rnd(), 3.5, 0.6, lvl.gain);
      const pan = ctx.createStereoPanner();
      pan.pan.value = (rnd() * 2 - 1) * 0.85;
      const pre = ctx.createGain();
      o.connect(pre);
      // (the formants' size follows the voice: higher for the higher voices, every throat a little different)
      const k = 0.93 + 0.14 * (Math.log2(f0 / 100) / 1.77) + (rnd() - 0.5) * 0.05;
      vowel(pre, amp, VOWELS[Math.floor(rnd() * VOWELS.length)], 9, k);
      amp.connect(lvl).connect(pan).connect(env);
      srcs.push(o);
      nodes.push(amp, lvl, pan, pre);
    }
    // the callers: four voices breaking out of the roar at its peak, one after another at uneven moments, each a rising
    // "eh-AAH" (the vowel opening, the pitch climbing, then falling back into the crowd)
    let at = t + 0.46;
    for (let i = 0; i < 4; i++) {
      at += 0.06 + rnd() * 0.13;
      const f0 = 150 * 2 ** (rnd() * 0.9);
      const len = 0.38 + rnd() * 0.24;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0, at);
      o.frequency.linearRampToValueAtTime(f0 * (1.16 + 0.06 * rnd()), at + 0.12);
      o.frequency.linearRampToValueAtTime(f0 * 1.04, at + len);
      wobble(0.002 + 0.001 * rnd(), 12, f0 * 0.025, o.frequency);
      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0, t);
      amp.gain.setValueAtTime(0, at);
      amp.gain.linearRampToValueAtTime(0.05, at + 0.05);
      amp.gain.setValueAtTime(0.05, at + len * 0.6);
      amp.gain.linearRampToValueAtTime(0, at + len);
      const pan = ctx.createStereoPanner();
      pan.pan.value = (i % 2 ? 1 : -1) * (0.3 + 0.4 * rnd());
      const pre = ctx.createGain();
      o.connect(pre);
      const k = 0.95 + 0.1 * rnd();
      vowel(pre, amp, [530, 1840, 2480], 8, k, [at, [760, 1220, 2600], 0.16]);
      amp.connect(pan).connect(env);
      srcs.push(o);
      nodes.push(amp, pan, pre);
    }
    // the crowd's breath: pink noise through two of the vowels, and the ground's low rumble
    for (const [v, off, g] of [[VOWELS[0], 0.7, 0.17], [VOWELS[3], 1.9, 0.1]]) {
      const air = ctx.createBufferSource();
      air.buffer = rig.pink;
      air.loop = true;
      air.__offset = off;
      const airIn = ctx.createGain();
      airIn.gain.value = g;
      air.connect(airIn);
      vowel(airIn, env, v, 3);
      srcs.push(air);
      nodes.push(airIn);
    }
    const rumble = ctx.createBufferSource();
    rumble.buffer = rig.pink;
    rumble.loop = true;
    rumble.__offset = 2.3;
    const rlp = ctx.createBiquadFilter();
    rlp.type = 'lowpass';
    rlp.frequency.value = 260;
    const rg = ctx.createGain();
    rg.gain.value = 0.07;
    rumble.connect(rlp).connect(rg).connect(env);
    srcs.push(rumble);
    nodes.push(rlp, rg);
    rig.play(srcs, nodes, t, stopAt);
    return stopAt;
  },

  /**
   * FULL TIME's scoreline sting, candidate B (full-time.md §6): a brass stab and a timpani hit. The section in E-flat
   * (Eb G Bb over C and F: Eb6/9, the theme's hit chord) on the rig's brass, a hard bite and a quick fall-off, doubled an
   * octave up by a brighter pair; a timpani on E-flat and a felt kick under it. Ducked under the voice it lands on.
   */
  scoreBrass(eng, t) {
    const out = eng.duckedSting ? eng.duckedSting(0.5, 0.19) : bus(eng, 0.5);
    const dest = eng.ctx.createGain();
    dest.connect(out);
    // a short room after it (the stab rings into the hall, then it is gone)
    const d = eng.ctx.createDelay(1);
    d.delayTime.value = 0.155;
    const fb = eng.ctx.createGain();
    fb.gain.value = 0.22;
    const wet = eng.ctx.createGain();
    wet.gain.value = 0.18;
    dest.connect(d).connect(wet).connect(out);
    d.connect(fb).connect(d);
    const stab = [63, 67, 70, 72, 77]; // Eb4 G4 Bb4 C5 F5
    stab.forEach((m, i) => eng.rig.brass(t + i * 0.004, m, 0.3, 0.92, dest, { bright: 2300, attack: 0.012, release: 0.24, pan: (i - 2) * 0.15 }));
    [75, 79].forEach((m, i) => eng.rig.brass(t + 0.006, m, 0.26, 0.62, dest, { bright: 3200, attack: 0.01, release: 0.2, pan: i ? 0.3 : -0.3 })); // Eb5 G5
    eng.rig.timpani(t, 39, 0.85, dest); // Eb2
    eng.rig.kick(t, 0.75, dest, { punch: true });
    eng.rig.bass(t, 39, 0.5, 0.6, dest, { wave: 'triangle', lp: 420, release: 0.4 });
    return t + 2.4;
  },

  /**
   * PAY ATTENTION's right answer (pay-attention.md §6: "a right sting of two bright notes"): the 5th then the octave of
   * A-flat high up (Eb6, Ab6), each a pluck doubled by a bell, the second ringing; a short room. It lands on the reveal,
   * often with the host's line: ducked under the voice like a bed. 1.2 s.
   */
  quizRight(eng, t) {
    const out = eng.duckedSting ? eng.duckedSting(1.0, 0.48) : bus(eng, 1.0);
    const dest = eng.ctx.createGain();
    dest.connect(out);
    const d = eng.ctx.createDelay(1);
    d.delayTime.value = QUIZ_SPB * 0.375;
    const wet = eng.ctx.createGain();
    wet.gain.value = 0.16;
    dest.connect(d).connect(wet).connect(out);
    const gap = QUIZ_SPB * 0.25; // a sixteenth apart
    eng.rig.pluck(t, 87, 0.12, 0.85, dest, { wave: 'pulse25', decay: 0.08, bright: 3400, pan: -0.1 });
    eng.rig.bell(t, 87, 0.3, 0.55, dest, { decay: 0.22, pan: -0.1 });
    eng.rig.pluck(t + gap, 92, 0.4, 0.9, dest, { wave: 'pulse25', decay: 0.2, bright: 3600, pan: 0.1 });
    eng.rig.bell(t + gap, 92, 0.9, 0.68, dest, { decay: 0.55, pan: 0.1 });
    return t + 1.2;
  },

  /**
   * PAY ATTENTION's wrong answer (pay-attention.md §6: "a soft low note, never a buzzer's sneer"): one note, D-flat (the
   * key's 4th: not home, not a clash), soft and round: a felt electric piano on D-flat 4, its gentle harmonics the part a
   * phone's speaker plays (a bare low note lost 18 dB there), over the round D-flat 3 body of a triangle and its sine;
   * no saw, no square, no bend, no dissonance; well under the right sting. Ducked under the voice. 0.9 s.
   */
  quizWrong(eng, t) {
    const out = eng.duckedSting ? eng.duckedSting(0.42, 0.22) : bus(eng, 0.42);
    eng.rig.ep(t, 61, 0.42, 1, out, { index: 0.85, tine: 0, attack: 0.012, decay: 0.7, release: 0.18 }); // Db4, felt
    eng.rig.bass(t, 49, 0.42, 0.45, out, { wave: 'triangle', lp: 520, release: 0.12 }); // Db3
    return t + 0.9;
  },

  /**
   * PAY ATTENTION's DOUBLE OR NOTHING (pay-attention.md §6: "a drumroll"): two bars at the quiz's tempo, a snare roll in
   * thirty-seconds and a timpani roll in sixteenths on E-flat (the 5th: the question still open), both rising from soft;
   * on the next downbeat the landing: a timpani on A-flat, a felt kick, Ab add9 on a bell and a pluck (no crash). The bed
   * steps out on the beat before it (the cue sheet). 6.3 s with its ring.
   */
  quizDrumroll(eng, t) {
    const dest = bus(eng, 0.37);
    const spb = QUIZ_SPB, bars = 2, end = t + bars * 4 * spb;
    const n = bars * 4 * 8;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      eng.rig.snare(t + (i * spb) / 8, 0.1 + 0.55 * u * u, dest, { brush: false });
      if (i % 2 === 0) eng.rig.timpani(t + (i * spb) / 8, 39, 0.12 + 0.4 * u * u, dest); // Eb2
    }
    eng.rig.timpani(end, 44, 0.8, dest); // Ab2
    eng.rig.kick(end, 0.7, dest);
    [80, 82, 84, 87].forEach((m, i) => eng.rig.bell(end + i * 0.006, m, 1.4, 0.55, dest, { decay: 0.7, pan: (i - 1.5) * 0.2 })); // Ab5 Bb5 C6 Eb6
    [68, 75, 80].forEach((m, i) => eng.rig.pluck(end + i * 0.004, m, 0.4, 0.7, dest, { wave: 'pulse25', decay: 0.18, bright: 2800, pan: (i - 1) * 0.2 }));
    eng.rig.bass(end, 44, 0.8, 0.7, dest, { wave: 'triangle', lp: 520, release: 0.3 });
    return end + 2;
  },

  /**
   * PAY ATTENTION's countdown tick (pay-attention.md §6: "countdown ticks on the bed's half notes"): a dry high pluck on
   * the key's 5th (Eb6) with a click under it, the last one on the octave (Ab6: time). Placed on the bed's grid by
   * LofiEngine.countdown; ducked under the voice like a bed. 0.15 s.
   */
  quizTick(eng, t, { last = false } = {}) {
    const out = eng.duckedSting ? eng.duckedSting(2.0, 1.1) : bus(eng, 2.0);
    eng.rig.pluck(t, last ? 92 : 87, 0.05, 0.75, out, { wave: 'pulse25', decay: 0.028, bright: 4200 });
    eng.rig.tick(t, 0.55, out, true);
    return t + 0.15;
  },

  /** FULL TIME's scoreline sting on air: the A/B's pick (docs/roadmap/critique/full-time-sound.md). */
  scoreSting(eng, t, o) {
    return STINGS[SCORE_STING](eng, t, o);
  },

  /** UP NEXT (only without sharedStings: audio.js has its own promo cue): IV -> V9sus, the signature hanging on the 2nd. */
  upNext(eng, t, { programme = 'world-now', seconds = 4.2 } = {}) {
    const prog = PROGRAMMES[programme] || PROGRAMMES['world-now'];
    const spb = Math.min(60 / prog.bpm, (seconds - 1.2) / 4);
    const dest = bus(eng, 0.8);
    const lead = bus(eng, 0.8, { echo: 0.4, time: spb * 0.75 });
    const IV = degreeToMidi(prog.tonic, SCALES[prog.scale], 3) % 12;
    const V = degreeToMidi(prog.tonic, SCALES[prog.scale], 4) % 12;
    const sig = motifMidis('statement', prog.tonic, prog.scale, COLOUR.next);
    chord(eng, dest, t, spb * 1.5, `${NAMES[IV]}maj9`, { inst: 'pad', lo: 50, vel: 0.75, roll: 0, p: { attack: 0.3, lpTo: 1200, release: 0.5 }, avoid: sig });
    eng.rig.bass(t, bassOf(IV), spb * 1.5, 0.45, dest, { wave: 'triangle', lp: 560, release: 0.15 });
    motif(eng, lead, t, spb, 'statement', { inst: 'pulse12', base: prog.tonic, scale: prog.scale, colour: COLOUR.next, vel: 0.8, p: { lp: 1500 } });
    const t2 = t + spb * 1.5;
    chord(eng, dest, t2, spb * 2.5 + 0.8, `${NAMES[V]}9sus`, { inst: 'pad', lo: 50, vel: 0.7, roll: 0, p: { attack: 0.25, lpTo: 1300, release: 0.9 }, avoid: sig });
    eng.rig.bass(t2, bassOf(V), spb * 2.5 + 0.6, 0.45, dest, { wave: 'triangle', lp: 560, release: 0.5 });
    return t2 + spb * 2.5 + 2;
  },
};
