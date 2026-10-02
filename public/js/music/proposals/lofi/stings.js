// Lo-fi newsroom proposal: one-shot cues, all built from the channel motif.
//   bumperIn  - into the break: the motif on bells in the channel key (F), ending
//               on an open sus chord ("to be continued").
//   bumperOut - back from the break: a reverse swell into the next programme's
//               key and the motif's resolved "answer".
//   upNext    - promo bed (~4 s): IV - V - I in the next programme's key, the
//               motif landing its long note on the tonic.
//   replay    - tape-rewind swish, the motif backwards, a little tape stop.
//   breaking  - calm and serious (no siren): two soft timpani strokes and the
//               motif in the minor mode, low; then silence for the presenter.
//   endcard   - the button: tonic chord, the motif, then the resolution to "do".
// Each takes (engine, t, opts) and returns the time it has finished ringing.

import { PALETTES } from './palettes.js';
import { SCALES, parseChord, voiceChord, degreeToMidi, motifVariant, mod } from './theory.js';

const bassOf = (pc) => 36 + mod(pc, 12);

function chord(eng, dest, t, dur, symbol, { inst = 'ep', lo = 55, vel = 0.75, roll = 0.025, p = {} } = {}) {
  const c = parseChord(symbol);
  const v = voiceChord(c, null, lo);
  v.forEach((midi, i) => eng.rig[inst](t + i * roll, midi, dur, vel, dest, { pan: (i - 1.5) * 0.15, ...p }));
  return c;
}

function motif(eng, dest, pal, t, spb, kind, { inst, vel = 0.8, oct = 0, scale, shift = 0, p = {} } = {}) {
  const sc = SCALES[scale || pal.scale];
  const notes = motifVariant(kind, shift);
  for (const n of notes) {
    eng.rig[inst || pal.lead.inst](t + n.at * spb, degreeToMidi(pal.tonic + pal.lead.oct + oct, sc, n.d), n.len * spb * 0.95, vel, dest, p);
  }
  return notes;
}

function bus(eng, level) {
  const g = eng.ctx.createGain();
  g.gain.value = level;
  g.connect(eng.stingBus);
  return g;
}

// Sting bus echo: a quarter-note-ish throw for the motif's last note.
function echoBus(eng, t, time, level) {
  const ctx = eng.ctx;
  const inp = ctx.createGain();
  const d = ctx.createDelay(2);
  d.delayTime.value = time;
  const fb = ctx.createGain();
  fb.gain.value = 0.38;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2000;
  const wet = ctx.createGain();
  wet.gain.value = level;
  inp.connect(d).connect(lp).connect(wet).connect(eng.stingBus);
  lp.connect(fb).connect(d);
  return inp;
}

function tonicChord(pal) {
  return pal.sections.A[0];
}

export const STINGS = {
  bumperIn(eng, t) {
    const pal = PALETTES.channel;
    const spb = 60 / 84;
    const dest = bus(eng, 0.9);
    const echo = echoBus(eng, t, spb * 0.75, 0.45);
    const lead = eng.ctx.createGain();
    lead.connect(dest);
    lead.connect(echo);
    eng.rig.kick(t, 0.7, dest);
    eng.rig.bass(t, bassOf(5), spb * 2, 0.49, dest, { lp: 600, release: 0.15 });
    chord(eng, dest, t, spb * 2, 'Fmaj9', { lo: 53, vel: 0.7 });
    chord(eng, dest, t, spb * 2.2, 'Fmaj9', { inst: 'pad', lo: 48, vel: 0.7, roll: 0, p: { attack: 0.25, lpTo: 1200, release: 0.8 } });
    motif(eng, lead, pal, t, spb, 'statement', { inst: 'bell', vel: 0.85 });
    const t2 = t + spb * 2;
    eng.rig.snare(t2, 0.35, dest, { brush: true });
    eng.rig.bass(t2, bassOf(0), spb * 3, 0.45, dest, { lp: 600, release: 0.45 });
    chord(eng, dest, t2, spb * 3, 'C9sus', { lo: 53, vel: 0.62 });
    chord(eng, dest, t2, spb * 3, 'C9sus', { inst: 'pad', lo: 48, vel: 0.6, roll: 0, p: { attack: 0.2, lpTo: 1000, release: 1.2 } });
    return t2 + spb * 3 + 1.5;
  },

  bumperOut(eng, t, { palette } = {}) {
    const pal = PALETTES[palette] || PALETTES.channel;
    const spb = 60 / pal.bpm;
    const dest = bus(eng, 0.9);
    const echo = echoBus(eng, t, spb * 0.75, 0.4);
    const lead = eng.ctx.createGain();
    lead.connect(dest);
    lead.connect(echo);
    const land = t + 1.1;
    const tonic = parseChord(tonicChord(pal));
    // Reverse swell of the tonic chord into the landing (a tape played backwards).
    chord(eng, dest, t, land - t, tonicChord(pal), { inst: 'pad', lo: pal.pad.lo, vel: 0.85, roll: 0, p: { attack: land - t, release: 0.06, lpFrom: 300, lpTo: 1800 } });
    eng.rig.riser(t + 0.3, land - t - 0.3, 0.5, dest);
    eng.rig.kick(land, 0.75, dest);
    eng.rig.bass(land, bassOf(tonic.bass), spb * 3, 0.49, dest, { wave: pal.bass.wave, lp: pal.bass.lp, release: 0.45 });
    chord(eng, dest, land, spb * 3, tonicChord(pal), { lo: pal.keys.lo, vel: 0.7 });
    const inst = pal.lead.inst === 'chip' || pal.lead.inst === 'pluck' ? pal.lead.inst : 'bell';
    motif(eng, lead, pal, land, spb, 'answer', { inst, vel: 0.8 });
    return land + spb * 4 + 1.5;
  },

  upNext(eng, t, { palette, seconds = 4.2 } = {}) {
    const pal = PALETTES[palette] || PALETTES.channel;
    // Programme tempo, squeezed if needed so the landing leaves 1.1 s of ring before the cut.
    const spb = Math.min(60 / pal.bpm, (seconds - 1.1) / 4);
    const dest = bus(eng, 0.85);
    const echo = echoBus(eng, t, spb * 0.75, 0.4);
    const lead = eng.ctx.createGain();
    lead.connect(dest);
    lead.connect(echo);
    const [I, , IV, V] = pal.sections.A;
    chord(eng, dest, t, spb * 2, IV, { inst: 'pad', lo: pal.pad.lo, vel: 0.75, roll: 0, p: { attack: 0.35, lpTo: 1200, release: 0.5 } });
    chord(eng, dest, t, spb * 2, IV, { lo: pal.keys.lo, vel: 0.6 });
    eng.rig.bass(t, bassOf(parseChord(IV).bass), spb * 2, 0.42, dest, { wave: pal.bass.wave, lp: pal.bass.lp, release: 0.15 });
    // A rising arpeggio on the IV: the "coming up" lift.
    const arpV = voiceChord(parseChord(IV), null, pal.keys.lo + 7);
    const arpInst = pal.arp.inst;
    for (let i = 0; i < 4; i++) eng.rig[arpInst](t + i * spb * 0.5, arpV[i % arpV.length] + (i >= arpV.length ? 12 : 0), spb * 0.45, 0.45, dest, { wave: pal.arp.wave, decay: 0.2, bright: 1500 });
    for (let i = 0; i < 16; i++) eng.rig.shaker(t + i * spb * 0.25, i % 2 ? 0.35 : 0.55, dest);
    const t2 = t + spb * 2;
    chord(eng, dest, t2, spb * 2, V, { lo: pal.keys.lo, vel: 0.62 });
    chord(eng, dest, t2, spb * 2, V, { inst: 'pad', lo: pal.pad.lo, vel: 0.7, roll: 0, p: { attack: 0.3, lpTo: 1300, release: 0.4 } });
    eng.rig.bass(t2, bassOf(parseChord(V).bass), spb * 2, 0.42, dest, { wave: pal.bass.wave, lp: pal.bass.lp, release: 0.15 });
    const inst = pal.lead.inst === 'chip' || pal.lead.inst === 'pluck' ? pal.lead.inst : 'bell';
    motif(eng, lead, pal, t2, spb, 'statement', { inst, vel: 0.8 });
    eng.rig.swell(t2 + spb, spb, 0.5, dest, 0.4);
    const land = t + spb * 4;
    eng.rig.kick(land, 0.7, dest);
    eng.rig.bass(land, bassOf(parseChord(I).bass), 1.2, 0.45, dest, { wave: pal.bass.wave, lp: pal.bass.lp, release: 0.45 });
    chord(eng, dest, land, 1.2, I, { lo: pal.keys.lo, vel: 0.65 });
    chord(eng, dest, land, 1.0, I, { inst: 'pad', lo: pal.pad.lo, vel: 0.6, roll: 0, p: { attack: 0.08, lpTo: 1100, release: 0.5 } });
    return land + 1.6;
  },

  replay(eng, t, { palette } = {}) {
    const pal = PALETTES[palette] || PALETTES.channel;
    const dest = bus(eng, 2.4);
    eng.rig.rewind(t, 0.55, 0.7, dest);
    const t2 = t + 0.5;
    const spb = 0.2;
    const notes = motif(eng, dest, pal, t2, spb, 'retrograde', { inst: 'pluck', vel: 0.7, p: { wave: 'pulse25', decay: 0.16, bright: 1500 } });
    // Tape stop on the last note: the pitch sags as the "tape" slows down.
    const last = notes[notes.length - 1];
    const midi = degreeToMidi(pal.tonic + pal.lead.oct, SCALES[pal.scale], last.d) - 12;
    const ts = t2 + 4 * spb + 0.1;
    const o = eng.rig.osc('pulse25', 440 * 2 ** ((midi - 69) / 12), ts);
    o.frequency.setValueAtTime(440 * 2 ** ((midi - 69) / 12), ts + 0.12);
    o.frequency.exponentialRampToValueAtTime(440 * 2 ** ((midi - 81) / 12), ts + 0.5);
    const lp = eng.rig.filter('lowpass', 1200, 0.7);
    lp.frequency.setValueAtTime(1200, ts);
    lp.frequency.exponentialRampToValueAtTime(300, ts + 0.5);
    const g = eng.rig.gain(0);
    g.gain.setValueAtTime(0, ts);
    g.gain.linearRampToValueAtTime(0.05, ts + 0.01);
    g.gain.setValueAtTime(0.05, ts + 0.3);
    g.gain.linearRampToValueAtTime(0, ts + 0.52);
    o.connect(lp).connect(g).connect(dest);
    eng.rig.play([o], [lp, g], ts, ts + 0.55);
    return ts + 0.8;
  },

  breaking(eng, t, { palette } = {}) {
    const pal = PALETTES[palette] || PALETTES.channel;
    const dest = bus(eng, 0.75);
    const root = pal.tonic - 24;
    eng.rig.timpani(t, root, 0.6, dest);
    eng.rig.timpani(t + 0.45, root, 0.38, dest);
    const minorPc = pal.tonic % 12;
    const names = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
    const sym = `${names[minorPc]}m9`;
    chord(eng, dest, t, 2.1, sym, { inst: 'pad', lo: 48, vel: 0.85, roll: 0, p: { attack: 0.3, lpTo: 800, release: 1.2 } });
    eng.rig.bass(t, 36 + mod(minorPc, 12), 2.2, 0.39, dest, { wave: 'sine', lp: 300, release: 0.45 });
    // The motif in the minor mode, in the middle register, on a dark Rhodes.
    const dark = { ...pal, lead: { ...pal.lead, oct: 0 } };
    motif(eng, dest, dark, t + 0.45, 0.3, 'statement', { inst: 'ep', scale: 'minor', vel: 0.75, oct: 0, p: { index: 0.35, attack: 0.02, decay: 1.2, release: 0.6 } });
    return t + 3.2;
  },

  endcard(eng, t, { palette } = {}) {
    const pal = PALETTES[palette] || PALETTES.channel;
    const spb = 60 / pal.bpm;
    const dest = bus(eng, 0.9);
    const echo = echoBus(eng, t, spb * 0.75, 0.45);
    const lead = eng.ctx.createGain();
    lead.connect(dest);
    lead.connect(echo);
    const I = tonicChord(pal);
    const c = parseChord(I);
    eng.rig.kick(t, 0.7, dest);
    eng.rig.bass(t, bassOf(c.bass), spb * 4, 0.49, dest, { wave: pal.bass.wave, lp: pal.bass.lp, release: 0.45 });
    chord(eng, dest, t, spb * 4.5, I, { lo: pal.keys.lo, vel: 0.72, roll: 0.03 });
    chord(eng, dest, t, spb * 4.5, I, { inst: 'pad', lo: pal.pad.lo, vel: 0.7, roll: 0, p: { attack: 0.3, lpTo: 1200, release: 1.6 } });
    eng.rig.swell(t, spb * 0.5, 0.35, dest, 0.6);
    const inst = pal.lead.inst === 'chip' || pal.lead.inst === 'pluck' ? pal.lead.inst : 'bell';
    motif(eng, lead, pal, t + spb * 0.5, spb, 'statement', { inst, vel: 0.85 });
    // ...and the full stop the motif always withholds: back home to "do".
    const home = t + spb * 4.5;
    eng.rig.bell(home, pal.tonic + pal.lead.oct, spb * 2, 0.55, lead, { decay: 0.9 });
    eng.rig.bass(home, bassOf(c.root), spb * 2, 0.36, dest, { wave: pal.bass.wave, lp: pal.bass.lp, release: 0.45 });
    const tex = eng.rig.texture(t, pal.tex * 0.8, dest);
    tex.stop(home + 1.2);
    return home + 3;
  },
};
