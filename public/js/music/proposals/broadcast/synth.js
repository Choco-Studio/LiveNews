// Instrument voices for the "broadcast" beds, on any BaseAudioContext (live
// AudioContext or OfflineAudioContext). The palette is chiptune by ancestry —
// pulse waves, a triangle bass, noise percussion — but every wave is band-
// limited with a soft harmonic taper, every note has an envelope (no clicks),
// and plucks get a closing low-pass so attacks are bright and tails are warm.
// Timbres are chosen to leave the 1-5 kHz speech band mostly empty.

import { hz } from './theory.js';
import { Baker } from './baker.js';

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
const bakerCache = new WeakMap();

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
    if (!bakerCache.has(ctx)) bakerCache.set(ctx, new Baker(ctx));
    this.bake = bakerCache.get(ctx);
    this.hits = 0;
  }

  /** Plays a baked buffer through a velocity gain; the pair is freed when done. */
  play(buf, dest, t, gain) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(g).connect(dest);
    src.start(t);
    src.onended = () => {
      src.disconnect();
      g.disconnect();
    };
    return t + buf.duration;
  }

  // Frees a live voice's nodes once its source has ended (long sessions on air).
  free(src, ...nodes) {
    src.onended = () => {
      for (const n of [src, ...nodes]) {
        try {
          n.disconnect();
        } catch { /* gone */ }
      }
    };
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
  pluck(dest, t, m, vel, { wave = 'pulse25', decay = 0.22, cut = 2200, cutEnd = 500, q = 1, gain = 0.5 } = {}) {
    const d = Math.round(decay * 100) / 100;
    return this.play(this.bake.pluck(wave, Math.round(m), d, Math.round(cut), Math.round(Math.max(60, cutEnd)), q), dest, t, vel * gain);
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
    this.free(o, g, node === o ? null : node);
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
    let last = null;
    for (const m of notes) {
      for (const side of [-1, 1]) {
        const o = this.osc(wave, hz(m), t);
        o.detune.setValueAtTime(side * detune + (m % 3) * 1.3, t);
        o.connect(side < 0 ? pl : pr);
        o.start(t);
        o.stop(end);
        this.free(o);
        last = o;
      }
    }
    if (last) {
      const prev = last.onended;
      last.onended = () => {
        prev?.();
        for (const n of [pl, pr, f, g]) n.disconnect();
      };
    }
    return end;
  }

  /** Soft timpani: settling pitch, an inharmonic partial and a felt-mallet thump. */
  timp(dest, t, m, vel, { decay = 1.5, gain = 0.9 } = {}) {
    return this.play(this.bake.timp(Math.round(m), Math.round(decay * 10) / 10), dest, t, vel * gain);
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
  kick(dest, t, vel, { gain = 0.9, decay = 0.32 } = {}) {
    return this.play(this.bake.kick(decay), dest, t, vel * gain);
  }

  /** Air: high-passed noise grain (shaker / hat), above the speech band. */
  shaker(dest, t, vel, { gain = 0.25 } = {}) {
    return this.play(this.bake.noise('shaker', this.hits++ % 4), dest, t, vel * gain);
  }

  /** Clock tick: a very short band of noise up at 9 kHz ('tock' at 6.8 kHz). */
  tick(dest, t, vel, { tock = false, gain = 0.3 } = {}) {
    return this.play(this.bake.noise(tock ? 'tock' : 'tick', this.hits++ % 3), dest, t, vel * gain);
  }

  /** Soft brushed snare/clap, low-passed so it never cracks at 3 kHz. */
  brush(dest, t, vel, { gain = 0.22 } = {}) {
    return this.play(this.bake.noise('brush', this.hits++ % 3), dest, t, vel * gain);
  }

  /** FM bell / glockenspiel. ratio 2 = glock, 3.5 = bell, 4 = music box. */
  bell(dest, t, dur, m, vel, { ratio = 2, index = 1.6, gain = 0.28, cut = 3800 } = {}) {
    const d = Math.round(dur * 10) / 10;
    return this.play(this.bake.bell(Math.round(m), d, ratio, index / ratio, cut), dest, t, vel * gain);
  }

  /** Reverse-cymbal swell into a downbeat (only where nobody speaks). */
  swell(dest, t, dur, vel, { hp = 3000, gain = 0.18, cut = 9000 } = {}) {
    return this.play(this.bake.wash(Math.round(dur * 20) / 20, { hp, swell: true, cut }), dest, t, vel * gain);
  }

  /** Soft cymbal wash after a hit. */
  cymbal(dest, t, vel, { decay = 2.2, gain = 0.1, hp = 5200 } = {}) {
    return this.play(this.bake.wash(Math.round(decay * 10) / 10, { hp }), dest, t, vel * gain);
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
    this.free(o, f, g);
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
