// Lo-fi newsroom proposal: one-shot cues, all sung with the channel signature
// (low 5 - 1 - 2 - high 5 + colour note, see theory.js).
//   bumperIn  - into the break, channel home key (D): the signature with its home
//               colour over I, then an open V9sus that the ident (also in D) resolves.
//   bumperOut - back from a break: a reverse swell into the programme's I and the
//               signature with that programme's colour.
//   upNext    - promo bed (~4 s) in the NEXT programme's key: IV -> V9sus, the
//               signature ending on the "next" colour (the 2nd), left hanging:
//               "stay with us". The next show's open resolves it.
//   replay    - tape-rewind swish, the signature backwards, a little tape stop.
//   breaking  - calm and serious (no siren), D minor like the channel's breaking
//               cue: two soft timpani strokes and the signature with the b3 colour.
//   endcard   - the button: I, the signature, then the sign-off "3 then 1": home.
// Each takes (engine, t, opts) and returns the time it has finished ringing.

import { PALETTES } from './palettes.js';
import { SCALES, COLOUR, parseChord, voiceChord, degreeToMidi, motifVariant, mod } from './theory.js';

const bassOf = (pc) => 36 + mod(pc, 12);

function chord(eng, dest, t, dur, symbol, { inst = 'ep', lo = 55, vel = 0.75, roll = 0.025, p = {} } = {}) {
  const c = parseChord(symbol);
  const v = voiceChord(c, null, lo);
  v.forEach((midi, i) => eng.rig[inst](t + i * roll, midi, dur, vel, dest, { pan: (i - 1.5) * 0.15, ...p }));
  return c;
}

// Stings sing on the programme's lead voice, but a bell stands in for the Rhodes (it carries better alone).
const leadInst = (pal) => (pal.lead.inst === 'chip' || pal.lead.inst === 'pluck' ? pal.lead.inst : 'bell');

function motif(eng, dest, pal, t, spb, kind, { inst, vel = 0.8, oct = 0, scale, colour = pal.colour, p = {} } = {}) {
  const sc = SCALES[scale || pal.scale];
  const notes = motifVariant(kind, 0, colour);
  for (const n of notes) {
    eng.rig[inst || leadInst(pal)](t + n.at * spb, degreeToMidi(pal.tonic + pal.lead.oct + oct, sc, n.d), n.len * spb * 0.95, vel, dest, p);
  }
  return notes;
}

function bus(eng, level) {
  const g = eng.ctx.createGain();
  g.gain.value = level;
  g.connect(eng.stingBus);
  return g;
}

// A tape echo for the signature's last notes.
function echoBus(eng, time, level) {
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

function leadBus(eng, dest, spb) {
  const lead = eng.ctx.createGain();
  lead.connect(dest);
  lead.connect(echoBus(eng, spb * 0.75, 0.42));
  return lead;
}

const bassP = (pal, release) => ({ wave: pal.bass.wave, lp: pal.bass.lp, release });

export const STINGS = {
  bumperIn(eng, t) {
    const pal = PALETTES.channel;
    const spb = 60 / 84;
    const dest = bus(eng, 0.9);
    const lead = leadBus(eng, dest, spb);
    const { I, V } = pal.cadence;
    eng.rig.kick(t, 0.7, dest);
    eng.rig.bass(t, bassOf(parseChord(I).bass), spb * 2.5, 0.49, dest, bassP(pal, 0.15));
    chord(eng, dest, t, spb * 2.5, I, { lo: 54, vel: 0.7 });
    chord(eng, dest, t, spb * 2.6, I, { inst: 'pad', lo: 50, vel: 0.7, roll: 0, p: { attack: 0.25, lpTo: 1200, release: 0.8 } });
    motif(eng, lead, pal, t, spb, 'statement', { inst: 'bell', vel: 0.85 });
    // The colour note lands on beat 3; the V9sus arrives under it and stays open.
    const t2 = t + spb * 2.5;
    eng.rig.snare(t2, 0.3, dest, { brush: true });
    eng.rig.bass(t2, bassOf(parseChord(V).bass), spb * 3, 0.45, dest, bassP(pal, 0.5));
    chord(eng, dest, t2, spb * 3, V, { lo: 54, vel: 0.6 });
    chord(eng, dest, t2, spb * 3, V, { inst: 'pad', lo: 50, vel: 0.6, roll: 0, p: { attack: 0.2, lpTo: 1000, release: 1.2 } });
    return t2 + spb * 3 + 1.5;
  },

  bumperOut(eng, t, { palette } = {}) {
    const pal = PALETTES[palette] || PALETTES.channel;
    const spb = 60 / pal.bpm;
    const dest = bus(eng, 0.9);
    const lead = leadBus(eng, dest, spb);
    const land = t + 1.1;
    const { I } = pal.cadence;
    // Reverse swell of the tonic chord into the landing (a tape played backwards).
    chord(eng, dest, t, land - t, I, { inst: 'pad', lo: pal.pad.lo, vel: 0.85, roll: 0, p: { attack: land - t, release: 0.06, lpFrom: 300, lpTo: 1800 } });
    eng.rig.riser(t + 0.3, land - t - 0.3, 0.5, dest);
    eng.rig.kick(land, 0.75, dest);
    eng.rig.bass(land, bassOf(parseChord(I).bass), spb * 3, 0.49, dest, bassP(pal, 0.45));
    chord(eng, dest, land, spb * 3, I, { lo: pal.keys.lo, vel: 0.7 });
    motif(eng, lead, pal, land, spb, 'statement', { vel: 0.8 });
    return land + spb * 4 + 1.5;
  },

  upNext(eng, t, { palette, seconds = 4.2 } = {}) {
    const pal = PALETTES[palette] || PALETTES.channel;
    // Programme tempo, squeezed if needed so the hanging note has 1.2 s to ring before the cut.
    const spb = Math.min(60 / pal.bpm, (seconds - 1.2) / 4);
    const dest = bus(eng, 0.85);
    const lead = leadBus(eng, dest, spb);
    const { IV, V } = pal.cadence;
    chord(eng, dest, t, spb * 1.5, IV, { inst: 'pad', lo: pal.pad.lo, vel: 0.75, roll: 0, p: { attack: 0.3, lpTo: 1200, release: 0.5 } });
    chord(eng, dest, t, spb * 1.5, IV, { lo: pal.keys.lo, vel: 0.6 });
    eng.rig.bass(t, bassOf(parseChord(IV).bass), spb * 1.5, 0.42, dest, bassP(pal, 0.15));
    for (let i = 0; i < 12; i++) eng.rig.shaker(t + i * spb * 0.25, i % 2 ? 0.35 : 0.55, dest);
    // The signature over IV -> V, its colour note the 2nd ("next"), hanging over V9sus.
    motif(eng, lead, pal, t, spb, 'statement', { vel: 0.8, colour: COLOUR.next });
    const t2 = t + spb * 1.5;
    eng.rig.swell(t, spb * 1.5, 0.45, dest, 0.3);
    eng.rig.kick(t2, 0.6, dest);
    chord(eng, dest, t2, spb * 2.5 + 0.8, V, { lo: pal.keys.lo, vel: 0.62 });
    chord(eng, dest, t2, spb * 2.5 + 0.8, V, { inst: 'pad', lo: pal.pad.lo, vel: 0.7, roll: 0, p: { attack: 0.25, lpTo: 1300, release: 0.9 } });
    eng.rig.bass(t2, bassOf(parseChord(V).bass), spb * 2.5 + 0.6, 0.42, dest, bassP(pal, 0.5));
    return t2 + spb * 2.5 + 2;
  },

  replay(eng, t, { palette } = {}) {
    const pal = PALETTES[palette] || PALETTES.channel;
    const dest = bus(eng, 2.4);
    eng.rig.rewind(t, 0.55, 0.7, dest);
    const t2 = t + 0.5;
    const spb = 0.2;
    motif(eng, dest, pal, t2, spb, 'retrograde', { inst: 'pluck', vel: 0.7, colour: null, p: { wave: 'pulse25', decay: 0.16, bright: 1500 } });
    // Tape stop on the colour note: the pitch sags as the "tape" slows down.
    const midi = degreeToMidi(pal.tonic + pal.lead.oct, SCALES[pal.scale], pal.colour) - 12;
    const ts = t2 + 3 * spb + 0.08;
    const f = 440 * 2 ** ((midi - 69) / 12);
    const o = eng.rig.osc('pulse25', f, ts);
    o.frequency.setValueAtTime(f, ts + 0.14);
    o.frequency.exponentialRampToValueAtTime(f / 2, ts + 0.55);
    const lp = eng.rig.filter('lowpass', 1300, 0.7);
    lp.frequency.setValueAtTime(1300, ts);
    lp.frequency.exponentialRampToValueAtTime(300, ts + 0.55);
    const g = eng.rig.gain(0);
    g.gain.setValueAtTime(0, ts);
    g.gain.linearRampToValueAtTime(0.05, ts + 0.01);
    g.gain.setValueAtTime(0.05, ts + 0.32);
    g.gain.linearRampToValueAtTime(0, ts + 0.56);
    o.connect(lp).connect(g).connect(dest);
    eng.rig.play([o], [lp, g], ts, ts + 0.6);
    return ts + 0.9;
  },

  breaking(eng, t) {
    // D minor, the channel's breaking key: serious, low, never an alarm.
    const pal = { ...PALETTES.channel, scale: 'minor', lead: { ...PALETTES.channel.lead, oct: 0 } };
    const dest = bus(eng, 0.75);
    eng.rig.timpani(t, 38, 0.48, dest);
    eng.rig.timpani(t + 0.45, 38, 0.3, dest);
    chord(eng, dest, t, 2.1, 'Dm9', { inst: 'pad', lo: 48, vel: 0.85, roll: 0, p: { attack: 0.3, lpTo: 800, release: 1.2 } });
    eng.rig.bass(t, 38, 2.2, 0.22, dest, { wave: 'sine', lp: 300, release: 0.45 });
    motif(eng, dest, pal, t + 0.45, 0.3, 'statement', { inst: 'ep', vel: 0.9, colour: COLOUR.breaking, p: { index: 0.5, attack: 0.02, decay: 1.2, release: 0.6 } });
    return t + 3.2;
  },

  endcard(eng, t, { palette } = {}) {
    const pal = PALETTES[palette] || PALETTES.channel;
    const spb = 60 / pal.bpm;
    const dest = bus(eng, 0.78);
    const lead = leadBus(eng, dest, spb);
    const { I } = pal.cadence;
    const c = parseChord(I);
    eng.rig.kick(t, 0.7, dest);
    eng.rig.bass(t, bassOf(c.bass), spb * 3.5, 0.38, dest, bassP(pal, 0.7));
    chord(eng, dest, t, spb * 5, I, { lo: pal.keys.lo, vel: 0.72, roll: 0.03 });
    chord(eng, dest, t, spb * 5, I, { inst: 'pad', lo: pal.pad.lo, vel: 0.7, roll: 0, p: { attack: 0.3, lpTo: 1200, release: 1.6 } });
    eng.rig.swell(t, spb * 0.5, 0.35, dest, 0.6);
    // The signature, then the sign-off it always withholds: 3 then 1, home.
    motif(eng, lead, pal, t + spb * 0.5, spb, 'answer', { vel: 0.85 });
    const tex = eng.rig.texture(t, pal.tex * 0.8, dest);
    tex.stop(t + spb * 5);
    return t + spb * 6 + 2;
  },
};
