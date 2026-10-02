// Arranger for the "broadcast" beds: turns a bed definition (packages.js) into
// notes, one bar at a time, on the Web Audio clock. A Bed owns a small mixer
// (layer buses -> pre -> tone filter -> fader, plus reverb and echo sends), so
// the conductor can fade, filter-sweep and echo it out independently of the
// next bed. Bars are generated lazily (pump), so a bed can run for hours: the
// form cycles through its progressions, layers come and go by phrase masks,
// ostinato variants rotate, and a seeded random source adds small variations.

import { MOTIF, motifShapes, parseChord, voice, bassNote, nearest, atOrAbove, rng, hashStr, SCALES, fit, chordPcs } from './theory.js';
import { makeDelay } from './synth.js';

export const db = (x) => 10 ** (x / 20);
const SHAPES = motifShapes(MOTIF);
const chordCache = new Map();
const chord = (sym) => {
  let c = chordCache.get(sym);
  if (!c) chordCache.set(sym, (c = parseChord(sym)));
  return c;
};

// Equal-power fade curve sampled into linear segments (safe to cancel/replace).
function rampTo(param, t, dur, from, to, steps = 10) {
  param.cancelScheduledValues(t);
  param.setValueAtTime(from, t);
  for (let k = 1; k <= steps; k++) {
    const p = k / steps;
    const w = to > from ? Math.sin((p * Math.PI) / 2) : Math.cos(((1 - p) * Math.PI) / 2);
    param.linearRampToValueAtTime(from + (to - from) * w, t + dur * p);
  }
}

export class Bed {
  /**
   * @param cond  the conductor (provides ctx, synth, mix, revIn)
   * @param def   bed definition from packages.bedDef()
   * @param opts  { origin: time of bar 0, entry: 'cut'|'soft'|'fromOpen'|'xfade', phrase, seed, trim }
   */
  constructor(cond, def, { origin, entry = 'cut', phrase = 0, seed = 1, trim = 0 } = {}) {
    this.cond = cond;
    this.def = def;
    this.ctx = cond.ctx;
    this.s = cond.synth;
    this.spb = 60 / def.bpm;
    this.barSec = this.spb * 4;
    this.origin = origin;
    this.entry = entry;
    this.offset = phrase * 8;
    this.seed = seed;
    this.nextBar = 0;
    this.stopAt = Infinity;
    this.endAt = Infinity;
    this.jumpAt = Infinity;
    this.scale = SCALES[def.mode] || SCALES.major;
    this.prev = {}; // voice-leading memory per layer
    this.lastActive = new Map();
    this.gates = []; // gain nodes of layers that play only while nobody speaks
    this.frameIdx = -1; // montage frame driving the frame layers (WORLD NOW headlines)
    this.lastFrameAt = -Infinity;
    this.held = []; // release handles of frame-driven voices
    this.faderLevel = { t: origin, dur: 0, from: 1, to: 1 };

    const c = this.ctx;
    this.pre = c.createGain();
    this.pre.gain.value = db(trim);
    this.tone = c.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 18000;
    this.tone.Q.value = 0.5;
    this.fader = c.createGain();
    this.wetPre = c.createGain();
    this.wetPre.gain.value = db(trim);
    this.wetFader = c.createGain();
    this.dlyIn = c.createGain();
    this.dlyBase = db(trim);
    this.dlyIn.gain.value = this.dlyBase;
    this.echo = makeDelay(c, { time: this.spb * def.delay, feedback: 0.3 });
    this.echoOut = c.createGain();
    this.echoOut.gain.value = 0.8;
    this.pre.connect(this.tone).connect(this.fader).connect(cond.mix);
    this.wetPre.connect(this.wetFader).connect(cond.revIn);
    this.dlyIn.connect(this.echo.input);
    this.echo.output.connect(this.echoOut).connect(cond.mix);
    this.nodes = [this.pre, this.tone, this.fader, this.wetPre, this.wetFader, this.dlyIn, this.echoOut, this.echo.output];

    this.buses = new Map();
    this.fx = this.bus('fx', -8, { rev: 0.35 });

    const solo = cond.solo;
    const muted = cond.mute || [];
    this.layers = def.layers.map((L) => {
      const g = c.createGain();
      const off = (solo && solo !== L.type) || muted.includes(L.type);
      g.gain.value = off ? 0 : db(L.level ?? -12);
      const pump = c.createGain();
      const pan = c.createStereoPanner();
      pan.pan.value = L.pan || 0;
      if (L.gate) g.connect(pump).connect(this.gateNode()).connect(pan);
      else g.connect(pump).connect(pan);
      pan.connect(this.pre);
      if (L.rev) {
        const r = c.createGain();
        r.gain.value = L.rev;
        pan.connect(r).connect(this.wetPre);
        this.nodes.push(r);
      }
      if (L.dly) {
        const d = c.createGain();
        d.gain.value = L.dly;
        pan.connect(d).connect(this.dlyIn);
        this.nodes.push(d);
      }
      this.nodes.push(g, pump, pan);
      g.__layer = L.type; // tag for the note log (synth.note)
      return { L, in: g, pump };
    });
  }

  /** Named extra bus (stings, accents): level in dB, optional pan and sends. */
  bus(name, level = -10, { pan = 0, rev = 0, dly = 0, gate = false } = {}) {
    let b = this.buses.get(name);
    if (b) return b;
    const c = this.ctx;
    b = c.createGain();
    b.gain.value = this.cond.solo && this.cond.solo !== name ? 0 : db(level);
    const p = c.createStereoPanner();
    p.pan.value = pan;
    const gated = gate || this.gated; // a gated one-shot gates every bus it makes
    b.connect(gated ? this.gateNode() : p);
    if (gated) this.gates[this.gates.length - 1].connect(p);
    p.connect(this.pre);
    this.nodes.push(b, p);
    if (rev) {
      const r = c.createGain();
      r.gain.value = rev;
      p.connect(r).connect(this.wetPre);
      this.nodes.push(r);
    }
    if (dly) {
      const d = c.createGain();
      d.gain.value = dly;
      p.connect(d).connect(this.dlyIn);
      this.nodes.push(d);
    }
    this.buses.set(name, b);
    return b;
  }

  // A gate closes while anyone speaks (same look-ahead as the duck) and opens
  // again after the hold: bells, pips and motif peeks live only in the gaps.
  gateNode() {
    const g = this.ctx.createGain();
    if (this.cond.primeGate) this.cond.primeGate(g.gain, this.origin);
    else g.gain.value = this.cond.talking ? 0 : 1;
    this.gates.push(g);
    this.nodes.push(g);
    return g;
  }

  setGate(on, t) {
    for (const g of this.gates) {
      g.gain.cancelScheduledValues(t);
      g.gain.setTargetAtTime(on ? 0 : 1, t, on ? 0.03 : 0.3);
    }
  }

  // Frame-driven harmony: each montage frame moves the held chord on (WORLD NOW
  // headlines: Bm -> G -> D across the three lines). The previous chord
  // releases as the new one swells in.
  frame(k, t) {
    const d = this.def;
    if (!d.frames) return;
    this.frameIdx = k;
    this.lastFrameAt = t;
    const ch = chord(d.frames[k % d.frames.length]);
    this.releaseHeld(t);
    for (const lay of this.layers) {
      const L = lay.L;
      if (!L.frame || !this.active(L, { i: 99, pos: 0, phrase: 0 })) continue;
      const handle = { t, from: this.s.log ? this.s.log.length : 0 };
      if (L.type === 'pad') {
        const notes = voice(L.no7 ? no7(ch) : ch, this.prev.pad, { n: L.n, lo: L.lo, hi: L.hi });
        this.prev.pad = notes;
        // The first chord blooms under the first line (the catch already carried the hit).
        this.s.pad(lay.in, t, 30, notes, L.vel, { wave: L.wave, a: k === 0 ? 1.2 : L.a, r: L.r, cut: L.cut, cutTo: L.cutTo, detune: L.detune, handle });
      } else if (L.type === 'bass') {
        const root = bassNote(ch, this.prev.bass, L.lo, L.hi);
        this.prev.bass = root;
        this.s.tone(lay.in, t, 30, root, 0.75, { wave: L.wave, a: k === 0 ? 0.6 : L.a, d: 0.4, s: L.s, r: L.r, gain: 0.36, handle });
      }
      handle.to = this.s.log ? this.s.log.length : 0;
      this.held.push(handle);
    }
  }

  releaseHeld(t) {
    for (const h of this.held) {
      h.release?.(t);
      // Keep the note log honest for the harmony checker: the held note ended here.
      if (this.s.log) for (let k = h.from; k < h.to; k++) this.s.log[k].dur = Math.max(0.05, t - h.t);
    }
    this.held = [];
  }

  get logicalBar() {
    return this.nextBar + this.offset;
  }

  // Bar index -> chord, through the form (phrases of 8 bars) and harmonic rhythm.
  chordAt(li) {
    const d = this.def;
    const phrase = Math.floor(li / 8);
    const pos = ((li % 8) + 8) % 8;
    const letter = d.form[((phrase % d.form.length) + d.form.length) % d.form.length];
    const prog = d.progs[letter] || Object.values(d.progs)[0];
    const per = Math.max(1, Math.round(8 / prog.length));
    return chord(prog[Math.floor(pos / per) % prog.length]);
  }

  /** Schedules every bar that starts before `until`. */
  pump(until) {
    for (;;) {
      const t = this.origin + this.nextBar * this.barSec;
      if (t >= until || t >= this.stopAt - 1e-6) break;
      if (t >= this.jumpAt - 1e-6) {
        // New story on the same bed: turn the page to the next phrase.
        this.offset += (8 - (this.logicalBar % 8)) % 8 || 8;
        this.jumpAt = Infinity;
      }
      this.bar(this.nextBar, t);
      this.nextBar++;
    }
  }

  bar(i, t0) {
    const li = i + this.offset;
    const b = {
      i,
      li,
      pos: ((li % 8) + 8) % 8,
      phrase: Math.floor(li / 8),
      t0,
      chord: this.chordAt(li),
      prevChord: this.chordAt(li - 1),
      next: this.chordAt(li + 1),
      r: rng(hashStr(this.def.id) ^ Math.imul(li + 1, 2654435761) ^ this.seed),
    };
    b.time = (beat) => this.time(t0, beat, b.r);
    b.motifBusy = this.motifBusy(b);
    // Without montage frames from the director, the frame chords move every two bars.
    if (this.def.frames && t0 - this.lastFrameAt >= this.barSec * 2 - 1e-3) this.frame(this.frameIdx + 1, t0);
    for (const lay of this.layers) {
      if (this.def.frames && lay.L.frame) continue;
      if (!this.active(lay.L, b)) continue;
      if (lay.L.yieldTo === 'motif' && b.motifBusy) continue; // call and response
      const fn = LAYERS[lay.L.type];
      if (fn) fn(this, lay, b);
      this.lastActive.set(lay, i);
    }
    if (i === 0 && this.entry === 'fromOpen') this.catchOpen(t0);
  }

  // True when a motif statement of this bed sounds during bar b: arpeggios and
  // sparkles rest so the signature is heard alone (and nothing rubs against it).
  motifBusy(b) {
    for (const { L } of this.layers) {
      if (L.type !== 'motif' || !this.active(L, b)) continue;
      const len = (SHAPES.total + (L.retro ? 0 : 1.5)) * L.aug + L.beat;
      const bars = Math.ceil(len / 4);
      const rel = ((b.li - L.at) % L.every + L.every) % L.every;
      if (rel < bars) return true;
    }
    return false;
  }

  // Swing moves off-beat 8ths (and 16ths by half as much); a few ms of human
  // timing keep the grid from sounding mechanical.
  time(t0, beat, r) {
    const sw = this.def.swing;
    let b = beat;
    if (sw) {
      const f = beat % 1;
      if (Math.abs(f - 0.5) < 1e-6) b += sw * 0.5;
      else if (Math.abs(f - 0.25) < 1e-6 || Math.abs(f - 0.75) < 1e-6) b += sw * 0.25;
    }
    return Math.max(0, t0 + b * this.spb + (r ? (r() - 0.5) * 0.006 : 0));
  }

  active(L, b) {
    if (L.on && L.on[b.phrase % L.on.length] !== 'x') return false;
    if (L.only === 'even' && b.pos % 2) return false;
    if (this.entry === 'soft' && b.i < (L.enter ?? 0)) return false;
    if (this.entry === 'fromOpen' && b.i < (L.tail ?? 0)) return false;
    return true;
  }

  // The programme open's last chord, caught on the cut: the open itself ends
  // on a timpani button (audio/themes.js), so the bed adds no hit of its own;
  // the home chord (the open's final chord) blooms under the open's ringing
  // fade and the root holds it, then the groove enters bar by bar.
  catchOpen(t) {
    const s = this.s;
    const d = this.def;
    const lay = this.layers.find((l) => l.L.type === 'pad') || this.layers[0];
    const home = chord(d.pkg.home);
    // Short and soft: the presenter's first word comes about half a second after the cut.
    const wave = d.pkg.timbre.lead === 'horn' ? 'horn' : 'soft';
    s.pad(lay.in, t, this.barSec * 0.6, voice(home, null, { n: 4, lo: wave === 'horn' ? 38 : 50, hi: wave === 'horn' ? 55 : 70 }), 0.7, { wave, a: 0.18, r: 1.2, cut: 1100, cutTo: 700 });
    s.tone(this.fx, t, this.barSec * 0.6, bassNote(home, null), 0.6, { wave: 'tri', a: 0.06, d: 0.6, s: 0.6, r: 0.5, gain: 0.5 });
  }

  // ------------------------------------------------------------ fades

  fade(t, dur, to) {
    const f = this.faderLevel;
    const from = valueAt(f, t);
    rampTo(this.fader.gain, t, Math.max(0.01, dur), from, to);
    rampTo(this.wetFader.gain, t, Math.max(0.01, dur), from, to);
    // A faded bed feeds no new echoes (tails already in the loop still ring).
    rampTo(this.dlyIn.gain, t, Math.max(0.01, dur), from * this.dlyBase, to * this.dlyBase);
    this.faderLevel = { t, dur, from, to };
  }

  sweep(t, dur, from, to) {
    const p = this.tone.frequency;
    p.cancelScheduledValues(t);
    p.setValueAtTime(from, t);
    p.exponentialRampToValueAtTime(to, t + Math.max(0.01, dur));
  }

  /** Last notes into the echo, then let the repeats ring and die away. */
  echoOutAt(t) {
    const g = this.dlyIn.gain;
    const base = g.value;
    g.cancelScheduledValues(t);
    g.setValueAtTime(base, t);
    g.linearRampToValueAtTime(base * 1.8, t + 0.05);
    g.setValueAtTime(base * 1.8, t + this.spb);
    g.linearRampToValueAtTime(0, t + this.spb * 1.5);
    this.echo.fb.gain.setValueAtTime(0.42, t);
    const o = this.echoOut.gain;
    o.setValueAtTime(0.8, t + 2.2);
    o.linearRampToValueAtTime(0, t + 4);
  }

  dispose() {
    for (const n of this.nodes) {
      try {
        n.disconnect();
      } catch { /* already gone */ }
    }
  }
}

function valueAt(f, t) {
  if (t <= f.t) return f.from;
  if (t >= f.t + f.dur) return f.to;
  const p = (t - f.t) / f.dur;
  const w = f.to > f.from ? Math.sin((p * Math.PI) / 2) : Math.cos(((1 - p) * Math.PI) / 2);
  return f.from + (f.to - f.from) * w;
}

/** Timpani "do": the tonic between A2 and G#3, where real kettle drums live. */
export function timpDo(tonic) {
  return 45 + ((((tonic - 45) % 12) + 12) % 12);
}

// The chord without its 7th, for a layer that sits under an arpeggio of roots.
const no7 = (c) => {
  // Minor chords become plain triads (their 7th and 9th would sit a semitone
  // from the root or the minor third); on major and sus chords the 9th
  // replaces the 7th, which keeps the colour without the rub.
  if (c.minor) return { ...c, tones: c.tones.filter((t) => ![10, 11, 14, 2].includes(t)) };
  if (!c.tones.some((t) => t === 10 || t === 11)) return c;
  const tones = c.tones.filter((t) => t !== 10 && t !== 11);
  if (!tones.some((t) => t % 12 === 2)) tones.push(14);
  return { ...c, tones };
};
const digit = (ch) => (ch >= '1' && ch <= '9' ? Number(ch) / 9 : 0);
const jit = (r, amt = 0.08) => 1 - amt / 2 + r() * amt;
const matchPos = (f, pos) => f === 'all' || (f === 'even' && pos % 2 === 0) || (f === 'odd' && pos % 2 === 1) || f === pos || (Array.isArray(f) && f.includes(pos));

// Passing note into the next chord's bass: a scale step next to the target,
// preferring one that does not rub (a semitone) against the chord still held.
function approach(bed, from, target, ch) {
  if (target === from) return from + 7;
  const tonicPc = bed.def.tonic % 12;
  const inScale = (m) => bed.scale.includes((((m - tonicPc) % 12) + 12) % 12);
  const pcs = chordPcs(ch);
  const rubs = (m) => pcs.some((pc) => (pc - m + 1200) % 12 === 1 || (m - pc + 1200) % 12 === 1);
  const dir = target > from ? -1 : 1;
  const cands = [target + dir, target + 2 * dir, target - dir, target - 2 * dir].filter(inScale);
  return cands.find((m) => !rubs(m)) ?? (pcs.includes(((target + 7) % 12 + 12) % 12) ? target + 7 : from + 7);
}

// ----------------------------------------------------------------- layers

const INST = {
  horn: (s, out, t, dur, m, v, L = {}) => s.tone(out, t, dur, m, v, { wave: 'horn', a: 0.035, d: 0.35, s: 0.72, r: 0.3, cut: L.cut || 1500, cutEnv: 0.7, vib: 9, vibDelay: 0.22, gain: 0.5 }),
  reed: (s, out, t, dur, m, v, L = {}) => s.tone(out, t, dur, m, v, { wave: 'reed', a: 0.05, d: 0.4, s: 0.7, r: 0.35, cut: L.cut || 1100, vib: 7, gain: 0.5 }),
  square: (s, out, t, dur, m, v, L = {}) => s.tone(out, t, dur, m, v, { wave: 'square', a: 0.006, d: 0.18, s: 0.45, r: 0.2, cut: L.cut || 1500, gain: 0.45 }),
  pulse: (s, out, t, dur, m, v, L = {}) => s.tone(out, t, dur, m, v, { wave: 'pulse25', a: 0.006, d: 0.2, s: 0.5, r: 0.18, cut: L.cut || 1400, gain: 0.45 }),
  glass: (s, out, t, dur, m, v, L = {}) => s.tone(out, t, dur, m, v, { wave: 'glass', a: 0.015, d: 1.2, s: 0.25, r: 1.2, cut: L.cut || 2400, gain: 0.55 }),
  pluck: (s, out, t, dur, m, v, L = {}) => s.pluck(out, t, m, v, { wave: 'warmsq', decay: Math.min(0.9, dur + 0.2), cut: L.cut || 1500, cutEnd: 380 }),
  keys: (s, out, t, dur, m, v, L = {}) => s.tone(out, t, dur, m, v, { wave: 'epiano', a: 0.006, d: 0.5, s: 0.35, r: 0.4, cut: L.cut || 1600, gain: 0.5 }),
  bell: (s, out, t, dur, m, v) => s.bell(out, t, Math.max(0.8, dur + 0.6), m, v, { ratio: 3.5, index: 1.1 }),
  glock: (s, out, t, dur, m, v) => s.bell(out, t, Math.max(0.6, dur + 0.4), m, v, { ratio: 2, index: 0.9, gain: 0.22 }),
  musicbox: (s, out, t, dur, m, v) => s.bell(out, t, 1.3, m, v, { ratio: 4, index: 0.55, gain: 0.3, cut: 3200 }),
  chip: (s, out, t, dur, m, v) => s.pluck(out, t, m, v, { wave: 'pulse12', decay: 0.1, cut: 2600, cutEnd: 900, gain: 1.6 }),
};
export { INST };

const LAYERS = {
  pad(bed, lay, b) {
    const { L } = lay;
    const s = bed.s;
    if (L.pump) {
      // Side-chain feel: the pad breathes on every beat.
      const g = lay.pump.gain;
      const every = L.pumpEvery || 1;
      for (let k = 0; k < 4; k += every) {
        const t = b.t0 + k * bed.spb;
        g.setValueAtTime(1 - L.pump, t);
        g.setTargetAtTime(1, t + 0.012, bed.spb * 0.2 * every);
      }
    }
    const fresh = bed.lastActive.get(lay) !== b.i - 1;
    const per = Math.max(1, bed.def.hr);
    const change = b.pos % per === 0 && (b.chord !== b.prevChord || b.pos === 0);
    if (!fresh && !change) return;
    let k = 1;
    while (k < 8 && bed.chordAt(b.li + k) === b.chord && (b.pos + k) % 8 !== 0) k++;
    const ch = L.power ? { root: b.chord.root, bass: b.chord.bass, tones: [0, 7], minor: b.chord.minor } : L.no7 ? no7(b.chord) : b.chord;
    const notes = voice(ch, bed.prev[L.type], { n: L.n, lo: L.lo, hi: L.hi });
    bed.prev[L.type] = notes;
    s.pad(lay.in, b.t0, k * bed.barSec + 0.06, notes, L.vel * jit(b.r), { wave: L.wave, a: L.a, r: L.r, cut: L.cut, cutTo: L.cutTo, detune: L.detune, s: L.s ?? 1, d: L.d ?? 0.5 });
  },

  bass(bed, lay, b) {
    const { L } = lay;
    const pats = L.patterns || [L.pattern];
    const pat = pats[b.phrase % pats.length];
    const root = bassNote(b.chord, bed.prev.bass, L.lo, L.hi);
    // Degrees are counted from the chord's real root, not a slash bass, and a
    // sus chord has no third: it gets the fifth instead.
    const r0 = nearest(b.chord.root, root);
    const t3 = b.chord.tones.includes(3) ? 3 : b.chord.tones.includes(4) ? 4 : 7;
    const third = r0 + t3 < root ? r0 + t3 + 12 : r0 + t3;
    const fifth = r0 + 7 > L.hi + 5 ? r0 - 5 : r0 + 7;
    for (const [beat, beats, deg, vel] of pat) {
      let m = root;
      if (deg === '5') m = fifth;
      else if (deg === '8') m = root + 12;
      else if (deg === '3') m = third;
      else if (deg === 'a') m = approach(bed, root, bassNote(b.next, root, L.lo, L.hi), b.chord);
      bed.s.tone(lay.in, b.time(beat), beats * bed.spb * 0.92, m, vel * jit(b.r), { wave: L.wave, a: L.a, d: 0.3, s: L.s, r: L.r, cut: L.wave === 'tri' || L.wave === 'sub' ? 0 : L.cut, gain: 0.36 });
    }
    bed.prev.bass = root;
  },

  osti(bed, lay, b) {
    const { L } = lay;
    let v = L.variants[b.phrase % L.variants.length];
    if (L.fill && b.pos === 7 && b.phrase % 2 === 1) v = L.fill;
    const step = 1 / L.rate;
    const base = L.pedal ? bed.def.tonic + (L.oct || 0) : nearest(b.chord.root, L.base ?? bed.def.tonic) + (L.oct || 0);
    for (let k = 0; k < v.notes.length; k++) {
      const vel = digit(v.acc[k % v.acc.length]);
      if (!vel) continue;
      const m = fit(base + v.notes[k], b.chord);
      bed.s.pluck(lay.in, b.time(k * step), m, vel * jit(b.r, 0.12), { wave: L.wave, decay: L.decay, cut: L.cut, cutEnd: L.cutEnd });
    }
  },

  arp(bed, lay, b) {
    const { L } = lay;
    const shape = L.variants ? L.variants[b.phrase % L.variants.length] : L.shape;
    const steps = 4 * L.rate;
    let tones;
    const ch = L.no7 ? no7(b.chord) : b.chord;
    if (shape === 'cell') {
      const r0 = atOrAbove(ch.root, L.lo);
      tones = [0, 2, 7, 12, 14, 19].map((x) => fit(r0 + x, ch)).filter((m) => m < L.lo + 12 * L.span + 3);
    } else {
      const pcs = [...new Set(ch.tones.map((t) => (ch.root + t) % 12))];
      const one = pcs.map((pc) => atOrAbove(pc, L.lo)).sort((x, y) => x - y);
      tones = [];
      for (let o = 0; o < L.span; o++) tones.push(...one.map((m) => m + 12 * o));
    }
    const n = tones.length;
    for (let k = 0; k < steps; k++) {
      let idx;
      if (shape === 'down') idx = n - 1 - (k % n);
      else if (shape === 'updown') {
        const cyc = Math.max(1, 2 * n - 2);
        const q = k % cyc;
        idx = q < n ? q : cyc - q;
      } else if (shape === 'chip') {
        // Classic chip arpeggio: cycle the triad fast, jump an octave per beat.
        idx = (k % 3) + (Math.floor(k / L.rate) % 2 ? Math.min(3, n - 3) : 0);
      } else idx = k % n;
      const m = tones[Math.max(0, Math.min(n - 1, idx))];
      const vel = (k % L.rate === 0 ? 0.8 : 0.55) * (L.vel ?? 1) * jit(b.r, 0.15);
      bed.s.pluck(lay.in, b.time(k / L.rate), m, vel, { wave: L.wave, decay: L.decay, cut: L.cut, cutEnd: L.cutEnd });
    }
  },

  stabs(bed, lay, b) {
    const { L } = lay;
    const notes = voice(L.no7 ? no7(b.chord) : b.chord, bed.prev.stabs, { n: L.n, lo: L.lo, hi: L.hi });
    bed.prev.stabs = notes;
    for (const [beat, beats, vel] of L.pattern) {
      bed.s.pad(lay.in, b.time(beat), beats * bed.spb, notes, vel * jit(b.r), { wave: L.wave, a: L.a, r: L.r, cut: L.cut, detune: 3, spread: 0.35, s: 0.6, d: 0.35, gain: 0.4 });
    }
  },

  timp(bed, lay, b) {
    const { L } = lay;
    const doN = timpDo(bed.def.tonic);
    const pitch = (n) => (n === 'sol' ? doN - 5 : doN);
    for (const [f, beat, n, vel] of L.hits) if (matchPos(f, b.pos)) bed.s.timp(lay.in, b.time(beat), pitch(n), vel * jit(b.r));
    for (const [f, beat, beats, n, v0, v1, ph] of L.rolls || []) {
      if (!matchPos(f, b.pos)) continue;
      if (ph === 'odd' && b.phrase % 2 === 0) continue;
      bed.s.timpRoll(lay.in, b.time(beat), beats * bed.spb, pitch(n), v0, v1);
    }
  },

  kit(bed, lay, b) {
    const { L } = lay;
    const s = bed.s;
    const play = {
      kick: (t, v) => s.kick(lay.in, t, v),
      shaker: (t, v) => s.shaker(lay.in, t, v),
      tick: (t, v) => s.tick(lay.in, t, v),
      tock: (t, v) => s.tick(lay.in, t, v, { tock: true, gain: 0.26 }),
      brush: (t, v) => s.brush(lay.in, t, v),
    };
    for (const key of Object.keys(play)) {
      const p = L[key];
      if (!p) continue;
      for (let k = 0; k < p.length; k++) {
        const v = digit(p[k]);
        if (v) play[key](b.time((k * 4) / p.length), v * jit(b.r, 0.15));
      }
    }
  },

  motif(bed, lay, b) {
    const { L } = lay;
    if (((b.li % L.every) + L.every) % L.every !== L.at) return;
    // Under speech a statement becomes an under-statement: 6 dB softer, and an
    // octave lower if it would sit in the presenter's presence range.
    const talking = bed.cond.talking;
    let doM = nearest(bed.def.tonic % 12, L.oct ?? bed.def.tonic + 12);
    if (talking && doM >= 67) doM -= 12;
    const quiet = talking ? 0.5 : 1;
    const steps = L.retro ? [...SHAPES.retro] : [...SHAPES.steps];
    const beats = (L.retro ? SHAPES.retroBeats : SHAPES.beats).map((x) => x * L.aug);
    // The programme's colour note (audio/themes.js COLOURS) ends a forward statement.
    const colour = L.retro || L.colourNote === false ? null : bed.def.pkg.colour;
    if (colour != null) {
      steps.push(colour);
      beats.push(1.5 * L.aug);
    }
    const play = INST[L.inst] || INST.horn;
    let beat = L.beat;
    for (let k = 0; k < steps.length; k++) {
      const last = k === steps.length - 1;
      const dur = beats[k] * bed.spb * (last ? 1.1 : 0.94);
      const t = b.time(beat);
      const v = quiet * L.vel * (last ? 0.95 : 0.8 + 0.07 * Math.min(k, 3)) * jit(b.r, 0.06);
      play(bed.s, lay.in, t, dur, doM + steps[k], v, L);
      for (const h of L.harm) play(bed.s, lay.in, t, dur, doM + steps[k] + h, v * 0.6, L);
      beat += beats[k];
    }
  },

  sparkle(bed, lay, b) {
    const { L } = lay;
    const play = INST[L.inst] || INST.glock;
    const cell = SHAPES.cell;
    let count = 0;
    const changing = b.next !== b.chord; // a ringing bell must not cross into the next chord
    for (let k = 0; k < 8; k++) {
      if (!b.r.chance(L.chance) || count >= (L.max ?? 8) || (changing && k >= 6)) continue;
      count++;
      const m = fit(atOrAbove((bed.def.tonic + b.r.pick(cell)) % 12, L.lo) + (b.r.chance(0.3) ? 12 : 0), b.chord);
      play(bed.s, lay.in, b.time(k * 0.5), 0.2, m, 0.35 + b.r() * 0.3, L);
    }
  },
};
