// Instrument voices for the "broadcast" beds, on any BaseAudioContext (live
// AudioContext or OfflineAudioContext). The palette is chiptune by ancestry —
// pulse waves, a triangle bass, noise percussion — but every wave is band-
// limited with a soft harmonic taper, every note has an envelope (no clicks),
// and plucks get a closing low-pass so attacks are bright and tails are warm.
// Timbres are chosen to leave the 1-5 kHz speech band mostly empty.

import { hz } from './theory.js';

// Harmonic recipes for PeriodicWaves. `nc` is the taper: harmonic n is scaled
// by exp(-(n/nc)^2), so low nc = rounder, warmer; high nc = more "8-bit".
const N = 48;
const taper = (n, nc) => Math.exp(-((n / nc) ** 2));
const RECIPES = {
  pulse12: (r, i) => pulse(r, 0.125, 15),
  pulse25: (r, i) => pulse(r, 0.25, 13),
  square: (r, i) => pulse(r, 0.5, 13),
  warmsq: (r, i) => pulse(r, 0.5, 6),
  horn: (r, i) => pulse(r, 0.3, 8),
  reed: (r, i) => pulse(r, 0.18, 7),
  tri: (r, i) => { for (let n = 1; n < N; n += 2) i[n] = ((8 / (Math.PI ** 2 * n * n)) * (((n - 1) / 2) % 2 ? -1 : 1)) * taper(n, 22); },
  soft: (r, i) => { for (let n = 1; n < N; n++) i[n] = ((2 / (Math.PI * n)) * (n % 2 ? 1 : -1)) * taper(n, 5); },
  saw: (r, i) => { for (let n = 1; n < N; n++) i[n] = ((2 / (Math.PI * n)) * (n % 2 ? 1 : -1)) * taper(n, 11); },
  epiano: (r, i) => { i[1] = 1; i[2] = 0.32; i[3] = 0.1; i[4] = 0.12; i[6] = 0.03; },
  glass: (r, i) => { i[1] = 1; i[2] = 0.12; i[3] = 0.28; i[5] = 0.08; },
  organ: (r, i) => { i[1] = 1; i[2] = 0.45; i[3] = 0.18; i[4] = 0.16; i[6] = 0.05; i[8] = 0.03; },
  sub: (r, i) => { i[1] = 1; i[2] = 0.18; i[3] = 0.05; },
};
function pulse(real, duty, nc) {
  for (let n = 1; n < N; n++) real[n] = ((2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty)) * taper(n, nc);
}

const tableCache = new WeakMap();
const noiseCache = new WeakMap();

const E = 1e-4; // floor for exponential ramps

export class Synth {
  constructor(ctx) {
    this.ctx = ctx;
    if (!tableCache.has(ctx)) tableCache.set(ctx, new Map());
    this.tables = tableCache.get(ctx);
    if (!noiseCache.has(ctx)) {
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let s = 12345;
      for (let k = 0; k < len; k++) {
        s = (s * 1103515245 + 12345) >>> 0; // deterministic noise: identical renders
        d[k] = (s / 4294967296) * 2 - 1;
      }
      noiseCache.set(ctx, buf);
    }
    this.noiseBuf = noiseCache.get(ctx);
    this.noiseSeed = 0;
  }

  wave(name) {
    if (name === 'sine') return null;
    let w = this.tables.get(name);
    if (!w) {
      const real = new Float32Array(N);
      const imag = new Float32Array(N);
      (RECIPES[name] || RECIPES.square)(real, imag);
      w = this.ctx.createPeriodicWave(real, imag);
      this.tables.set(name, w);
    }
    return w;
  }

  osc(name, freq, t) {
    const o = this.ctx.createOscillator();
    const w = this.wave(name);
    if (w) o.setPeriodicWave(w);
    else o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    return o;
  }

  noise(t, dur) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    // Walk through the buffer so consecutive hits never share a grain.
    this.noiseSeed = (this.noiseSeed + 0.6180339) % 1;
    const off = this.noiseSeed * Math.max(0, this.noiseBuf.duration - dur - 0.05);
    src.start(t, off);
    src.stop(t + dur + 0.02);
    return src;
  }

  filter(type, freq, q = 0.7) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  // ADSR on a gain param; returns the time the voice is silent.
  adsr(g, t, dur, { a = 0.01, d = 0.2, s = 0.7, r = 0.2, peak = 1 } = {}) {
    const p = Math.max(peak, E);
    const sv = Math.max(p * s, E);
    const off = t + Math.max(dur, a + 0.004);
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(p, t + a);
    if (t + a + d <= off) {
      g.exponentialRampToValueAtTime(sv, t + a + d);
      g.setValueAtTime(sv, off);
    } else {
      // Released during the decay: land where the decay would be by then.
      const k = (off - t - a) / d;
      g.exponentialRampToValueAtTime(Math.max(p * (sv / p) ** k, E), off);
    }
    g.exponentialRampToValueAtTime(E, off + r);
    g.linearRampToValueAtTime(0, off + r + 0.006);
    return off + r + 0.01;
  }

  // Percussive: instant-ish attack, exponential decay to silence.
  perc(g, t, decay, peak, a = 0.002) {
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(Math.max(peak, E), t + a);
    g.exponentialRampToValueAtTime(E, t + a + decay);
    g.linearRampToValueAtTime(0, t + a + decay + 0.006);
    return t + a + decay + 0.01;
  }

  // ------------------------------------------------------------------ voices

  /** Plucked pulse: bright attack closing to a warm tail (ostinatos, arps). */
  pluck(dest, t, m, vel, { wave = 'pulse25', decay = 0.22, cut = 2200, cutEnd = 500, q = 1, detune = 0, gain = 0.5 } = {}) {
    const c = this.ctx;
    const o = this.osc(wave, hz(m), t);
    if (detune) o.detune.setValueAtTime(detune, t);
    const f = this.filter('lowpass', cut, q);
    f.frequency.setValueAtTime(cut, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(60, cutEnd), t + decay * 0.9);
    const g = c.createGain();
    const end = this.perc(g.gain, t, decay, vel * gain, 0.003);
    o.connect(f).connect(g).connect(dest);
    o.start(t);
    o.stop(end);
    return end;
  }

  /** Sustained tone with optional delayed vibrato and glide (horn, lead, bass). */
  tone(dest, t, dur, m, vel, { wave = 'tri', a = 0.01, d = 0.2, s = 0.7, r = 0.15, cut = 0, cutEnv = 0, q = 0.7, vib = 0, vibRate = 5.2, vibDelay = 0.25, glide = 0, detune = 0, gain = 0.5 } = {}) {
    const c = this.ctx;
    const o = this.osc(wave, hz(m), t);
    if (glide) {
      o.frequency.setValueAtTime(hz(m + glide), t);
      o.frequency.exponentialRampToValueAtTime(hz(m), t + Math.min(0.08, dur * 0.4));
    }
    if (detune) o.detune.setValueAtTime(detune, t);
    const g = c.createGain();
    const end = this.adsr(g.gain, t, dur, { a, d, s, r, peak: vel * gain });
    let node = o;
    if (cut) {
      const f = this.filter('lowpass', cut, q);
      if (cutEnv) {
        // Brass-like "blat": the filter opens with the attack then settles.
        f.frequency.setValueAtTime(cut * 0.55, t);
        f.frequency.linearRampToValueAtTime(cut * (1 + cutEnv), t + a + 0.02);
        f.frequency.exponentialRampToValueAtTime(cut, t + a + 0.25);
      }
      node = node.connect(f);
    }
    if (vib && dur > vibDelay + 0.1) {
      const lfo = c.createOscillator();
      const lg = c.createGain();
      lfo.frequency.value = vibRate;
      lg.gain.setValueAtTime(0, t);
      lg.gain.setValueAtTime(0, t + vibDelay);
      lg.gain.linearRampToValueAtTime(vib, t + vibDelay + 0.3);
      lfo.connect(lg).connect(o.detune);
      lfo.start(t);
      lfo.stop(end);
    }
    node.connect(g).connect(dest);
    o.start(t);
    o.stop(end);
    return end;
  }

  /**
   * Chord pad: two detuned oscillators per note spread left/right through one
   * low-pass that can open over the note ("rising pad").
   */
  pad(dest, t, dur, notes, vel, { wave = 'soft', a = 0.8, r = 1.4, cut = 900, cutTo = 0, q = 0.5, detune = 7, spread = 0.7, gain = 0.32, s = 1, d = 0.5 } = {}) {
    const c = this.ctx;
    const f = this.filter('lowpass', cut, q);
    f.frequency.setValueAtTime(cut, t);
    if (cutTo) f.frequency.exponentialRampToValueAtTime(cutTo, t + Math.max(a, dur));
    const g = c.createGain();
    const end = this.adsr(g.gain, t, dur, { a, d, s, r, peak: (vel * gain) / Math.sqrt(notes.length) });
    const pl = c.createStereoPanner();
    const pr = c.createStereoPanner();
    pl.pan.value = -spread;
    pr.pan.value = spread;
    pl.connect(f);
    pr.connect(f);
    f.connect(g).connect(dest);
    for (const m of notes) {
      for (const side of [-1, 1]) {
        const o = this.osc(wave, hz(m), t);
        o.detune.setValueAtTime(side * detune + (m % 3) * 1.3, t);
        o.connect(side < 0 ? pl : pr);
        o.start(t);
        o.stop(end);
      }
    }
    return end;
  }

  /** Soft timpani: settling pitch, an inharmonic partial and a felt-mallet thump. */
  timp(dest, t, m, vel, { decay = 1.5, gain = 0.9 } = {}) {
    const c = this.ctx;
    const f0 = hz(m);
    const out = c.createGain();
    out.gain.value = vel * gain;
    out.connect(dest);
    const parts = [[1, 1, decay], [1.504, 0.32, decay * 0.45], [1.995, 0.12, decay * 0.3]];
    let end = t;
    for (const [ratio, lvl, dk] of parts) {
      const o = this.osc('sine', f0 * ratio * 1.035, t);
      o.frequency.exponentialRampToValueAtTime(f0 * ratio, t + 0.09);
      const g = c.createGain();
      end = Math.max(end, this.perc(g.gain, t, dk, lvl, 0.004));
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + dk + 0.05);
    }
    const n = this.noise(t, 0.12);
    const lp = this.filter('lowpass', 380, 0.8);
    const ng = c.createGain();
    this.perc(ng.gain, t, 0.08, 0.5, 0.002);
    n.connect(lp).connect(ng).connect(out);
    return end;
  }

  /** A roll that swells into the next downbeat. */
  timpRoll(dest, t, dur, m, v0, v1, opts = {}) {
    const step = 0.055;
    for (let x = 0, k = 0; x < dur - 0.01; x += step, k++) {
      const p = x / dur;
      this.timp(dest, t + x + (k % 2 ? 0.006 : 0), m, (v0 + (v1 - v0) * p * p) * (k % 2 ? 0.85 : 1), { decay: 0.35, ...opts });
    }
  }

  /** Round, short kick that stays under 120 Hz (no click in the speech band). */
  kick(dest, t, vel, { gain = 0.9, decay = 0.32, f0 = 120, f1 = 46 } = {}) {
    const c = this.ctx;
    const o = this.osc('sine', f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + 0.1);
    const g = c.createGain();
    const end = this.perc(g.gain, t, decay, vel * gain, 0.003);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(end);
    return end;
  }

  /** Air: high-passed noise grain (shaker / hat), above the speech band. */
  shaker(dest, t, vel, { len = 0.045, hp = 7500, gain = 0.25, a = 0.004 } = {}) {
    const c = this.ctx;
    const n = this.noise(t, len + 0.02);
    const f = this.filter('highpass', hp, 0.6);
    const g = c.createGain();
    this.perc(g.gain, t, len, vel * gain, a);
    n.connect(f).connect(g).connect(dest);
    return t + len;
  }

  /** Clock tick: a very short band of noise up at 8-10 kHz. */
  tick(dest, t, vel, { f = 9000, gain = 0.3 } = {}) {
    const c = this.ctx;
    const n = this.noise(t, 0.03);
    const bp = this.filter('bandpass', f, 4);
    const g = c.createGain();
    this.perc(g.gain, t, 0.014, vel * gain, 0.001);
    n.connect(bp).connect(g).connect(dest);
    return t + 0.03;
  }

  /** Soft brushed snare/clap, low-passed so it never cracks at 3 kHz. */
  brush(dest, t, vel, { gain = 0.22, len = 0.16, cut = 2400 } = {}) {
    const c = this.ctx;
    const n = this.noise(t, len + 0.02);
    const bp = this.filter('bandpass', 1300, 0.6);
    const lp = this.filter('lowpass', cut, 0.5);
    const g = c.createGain();
    this.perc(g.gain, t, len, vel * gain, 0.006);
    n.connect(bp).connect(lp).connect(g).connect(dest);
    return t + len;
  }

  /** FM bell / glockenspiel. ratio 2 = glock, 3.5 = bell, 1.4 = music box. */
  bell(dest, t, dur, m, vel, { ratio = 2, index = 1.6, gain = 0.28, cut = 3800 } = {}) {
    const c = this.ctx;
    const f = hz(m);
    const car = this.osc('sine', f, t);
    const mod = this.osc('sine', f * ratio, t);
    const mg = c.createGain();
    mg.gain.setValueAtTime(f * index, t);
    mg.gain.exponentialRampToValueAtTime(f * index * 0.05, t + Math.min(dur, 0.9));
    mod.connect(mg).connect(car.frequency);
    const lp = this.filter('lowpass', cut, 0.5);
    const g = c.createGain();
    const end = this.perc(g.gain, t, dur, vel * gain, 0.003);
    car.connect(lp).connect(g).connect(dest);
    car.start(t);
    mod.start(t);
    car.stop(end);
    mod.stop(end);
    return end;
  }

  /** Reverse-cymbal swell into a downbeat (only where nobody speaks). */
  swell(dest, t, dur, vel, { hp = 3000, gain = 0.18, cut = 9000 } = {}) {
    const c = this.ctx;
    const n = this.noise(t, dur + 0.02);
    const f = this.filter('highpass', hp, 0.5);
    const lp = this.filter('lowpass', cut, 0.5);
    const g = c.createGain();
    g.gain.setValueAtTime(E, t);
    g.gain.exponentialRampToValueAtTime(vel * gain, t + dur - 0.012);
    g.gain.linearRampToValueAtTime(0, t + dur);
    n.connect(f).connect(lp).connect(g).connect(dest);
    return t + dur;
  }

  /** Soft cymbal wash after a hit. */
  cymbal(dest, t, vel, { decay = 2.2, gain = 0.1, hp = 5200 } = {}) {
    const c = this.ctx;
    const n = this.noise(t, decay + 0.02);
    const f = this.filter('highpass', hp, 0.4);
    const g = c.createGain();
    this.perc(g.gain, t, decay, vel * gain, 0.01);
    n.connect(f).connect(g).connect(dest);
    return t + decay;
  }

  /** Pitch glide (tape rewind / power-down). */
  glide(dest, t, dur, m0, m1, vel, { wave = 'pulse25', gain = 0.2, cut = 1600 } = {}) {
    const c = this.ctx;
    const o = this.osc(wave, hz(m0), t);
    o.frequency.exponentialRampToValueAtTime(hz(m1), t + dur);
    const f = this.filter('lowpass', cut, 0.7);
    const g = c.createGain();
    const end = this.adsr(g.gain, t, dur, { a: 0.02, d: dur, s: 0.4, r: 0.08, peak: vel * gain });
    o.connect(f).connect(g).connect(dest);
    o.start(t);
    o.stop(end);
    return end;
  }
}

// --------------------------------------------------------------------- FX

/**
 * Synthetic plate/room: decaying stereo noise that darkens as it decays (a
 * one-pole low-pass whose cutoff falls over time), with a short pre-delay.
 */
export function makeReverb(ctx, { seconds = 2.4, predelay = 0.018, bright = 0.55 } = {}) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, len, sr);
  let s = 987654321;
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let y = 0;
    const pre = Math.floor(predelay * sr) + ch * 37;
    for (let k = pre; k < len; k++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      const x = (s / 4294967296) * 2 - 1;
      const p = (k - pre) / (len - pre);
      const a = bright * (1 - p) ** 1.6 + 0.04; // cutoff falls with time
      y += a * (x - y);
      d[k] = y * (1 - p) ** 2.4 * Math.exp(-p * 3);
    }
  }
  const conv = ctx.createConvolver();
  conv.buffer = buf;
  return conv;
}

/** Tape echo: feedback through a band-limited loop so repeats get darker. */
export function makeDelay(ctx, { time = 0.4, feedback = 0.32, low = 280, high = 2600 } = {}) {
  const input = ctx.createGain();
  const delay = ctx.createDelay(2.5);
  delay.delayTime.value = time;
  const fb = ctx.createGain();
  fb.gain.value = feedback;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = low;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = high;
  const output = ctx.createGain();
  input.connect(delay);
  delay.connect(hp).connect(lp);
  lp.connect(fb).connect(delay);
  lp.connect(output);
  return { input, output, delay, fb };
}
