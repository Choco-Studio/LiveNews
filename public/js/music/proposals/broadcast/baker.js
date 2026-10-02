// Baked one-shots for the "broadcast" beds. Plucks, percussion, timpani and
// bells are synthesised once in plain JS (band-limited wavetables, RBJ biquads
// with moving cutoffs, exponential envelopes) into AudioBuffers and cached per
// context, so a hit on air is one AudioBufferSourceNode and one GainNode. Same
// sound as a live node chain, a fraction of the CPU: the bed runs next to a
// 60 fps canvas inside OBS. Noise is a fixed LCG, so renders are repeatable.

const TABLE = 2048;
const tables = new Map(); // `${wave}:${harmonics}` -> Float32Array cycle

// Harmonic amplitudes (sine phase) per wave, matching synth.js RECIPES.
const taper = (n, nc) => Math.exp(-((n / nc) ** 2));
const pulse = (duty, nc) => (n) => ({ c: ((2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty)) * taper(n, nc), s: 0 });
const SERIES = {
  pulse12: pulse(0.125, 15),
  pulse25: pulse(0.25, 13),
  square: pulse(0.5, 13),
  warmsq: pulse(0.5, 6),
  horn: pulse(0.3, 8),
  reed: pulse(0.18, 7),
  tri: (n) => ({ c: 0, s: n % 2 ? ((8 / (Math.PI ** 2 * n * n)) * (((n - 1) / 2) % 2 ? -1 : 1)) * taper(n, 22) : 0 }),
  saw: (n) => ({ c: 0, s: ((2 / (Math.PI * n)) * (n % 2 ? 1 : -1)) * taper(n, 11) }),
  glass: (n) => ({ c: 0, s: { 1: 1, 2: 0.12, 3: 0.28, 5: 0.08 }[n] || 0 }),
  sine: (n) => ({ c: 0, s: n === 1 ? 1 : 0 }),
};

/** One normalised cycle of `wave` with harmonics below `maxHarm` (no aliasing). */
function table(wave, maxHarm) {
  const h = Math.max(1, Math.min(48, maxHarm));
  const key = `${wave}:${h}`;
  let t = tables.get(key);
  if (t) return t;
  t = new Float32Array(TABLE + 1);
  const f = SERIES[wave] || SERIES.square;
  for (let n = 1; n <= h; n++) {
    const { c, s } = f(n);
    if (!c && !s) continue;
    for (let i = 0; i < TABLE; i++) {
      const ph = (2 * Math.PI * n * i) / TABLE;
      t[i] += c * Math.cos(ph) + s * Math.sin(ph);
    }
  }
  let peak = 0;
  for (let i = 0; i < TABLE; i++) peak = Math.max(peak, Math.abs(t[i]));
  for (let i = 0; i < TABLE; i++) t[i] /= peak || 1;
  t[TABLE] = t[0];
  tables.set(key, t);
  return t;
}

// RBJ biquad, coefficients refreshed every 16 samples while the cutoff moves.
class Biquad {
  constructor(type, sr) {
    this.type = type;
    this.sr = sr;
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
  }

  set(freq, q) {
    const w = (2 * Math.PI * Math.min(freq, this.sr * 0.45)) / this.sr;
    const cw = Math.cos(w);
    const a = Math.sin(w) / (2 * q);
    let b0;
    let b1;
    let b2;
    if (this.type === 'lowpass') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; }
    else if (this.type === 'highpass') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; }
    else { b0 = a; b1 = 0; b2 = -a; } // band-pass, 0 dB peak
    const a0 = 1 + a;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = (-2 * cw) / a0; this.a2 = (1 - a) / a0;
  }

  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

let seed = 22222;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) >>> 0;
  return (seed / 4294967296) * 2 - 1;
};
const hz = (m) => 440 * 2 ** ((m - 69) / 12);

export class Baker {
  constructor(ctx) {
    this.ctx = ctx;
    this.sr = ctx.sampleRate;
    this.cache = new Map();
  }

  buffer(key, seconds, fill) {
    let b = this.cache.get(key);
    if (b) return b;
    const n = Math.max(1, Math.ceil(seconds * this.sr));
    b = this.ctx.createBuffer(1, n, this.sr);
    fill(b.getChannelData(0), this.sr);
    // Tiny fade at both ends: never a click, whatever was baked.
    const d = b.getChannelData(0);
    const f = Math.min(32, n >> 2);
    for (let i = 0; i < f; i++) {
      d[i] *= i / f;
      d[n - 1 - i] *= i / f;
    }
    this.cache.set(key, b);
    return b;
  }

  /** Plucked wavetable note with a closing low-pass (bright attack, warm tail). */
  pluck(wave, m, decay, cut, cutEnd, q = 1) {
    const key = `p:${wave}:${m}:${decay}:${cut}:${cutEnd}:${q}`;
    const len = decay + 0.02;
    return this.buffer(key, len, (d, sr) => {
      const f = hz(m);
      const t = table(wave, Math.floor((sr * 0.45) / f));
      const inc = (f * TABLE) / sr;
      const lp = new Biquad('lowpass', sr);
      const fd = Math.max(0.01, decay * 0.9);
      const att = Math.floor(0.003 * sr);
      const k = Math.log(1e-4) / (decay * sr); // amplitude: -80 dB over `decay`
      let ph = 0;
      for (let i = 0; i < d.length; i++) {
        if ((i & 15) === 0) {
          const p = Math.min(1, i / sr / fd);
          lp.set(cut * (cutEnd / cut) ** p, q);
        }
        const ip = ph | 0;
        const s = t[ip] + (t[ip + 1] - t[ip]) * (ph - ip);
        ph += inc;
        if (ph >= TABLE) ph -= TABLE;
        const env = i < att ? i / att : Math.exp(k * (i - att));
        d[i] = lp.run(s) * env;
      }
    });
  }

  /** Soft timpani: settling pitch, inharmonic partials, felt-mallet thump. */
  timp(m, decay) {
    return this.buffer(`t:${m}:${decay}`, decay + 0.05, (d, sr) => {
      const f0 = hz(m);
      const parts = [[1, 1, decay], [1.504, 0.32, decay * 0.45], [1.995, 0.12, decay * 0.3]];
      const lp = new Biquad('lowpass', sr);
      lp.set(380, 0.8);
      const ph = [0, 0, 0];
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const bend = 1 + 0.035 * Math.exp(-t / 0.03);
        let s = 0;
        for (let p = 0; p < 3; p++) {
          const [r, lvl, dk] = parts[p];
          ph[p] += (2 * Math.PI * f0 * r * bend) / sr;
          s += Math.sin(ph[p]) * lvl * Math.exp((Math.log(1e-4) * t) / dk);
        }
        const att = Math.min(1, t / 0.004);
        const thump = t < 0.1 ? lp.run(rnd()) * 0.5 * Math.exp(-t / 0.018) : 0;
        d[i] = (s * att + thump) * 0.9;
      }
    });
  }

  /** Round kick: 120 -> 46 Hz sine sweep, nothing above 200 Hz. */
  kick(decay = 0.32) {
    return this.buffer(`k:${decay}`, decay + 0.02, (d, sr) => {
      let ph = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const f = 46 + 74 * Math.exp(-t / 0.035);
        ph += (2 * Math.PI * f) / sr;
        d[i] = Math.sin(ph) * Math.min(1, t / 0.003) * Math.exp((Math.log(1e-4) * t) / decay);
      }
    });
  }

  /** Filtered noise grain: shaker, tick, tock, brush (n variants to avoid machine-gunning). */
  noise(kind, variant = 0) {
    const spec = {
      shaker: { len: 0.05, a: 0.004, filters: [['highpass', 7500, 0.6]] },
      tick: { len: 0.016, a: 0.001, filters: [['bandpass', 9200, 4]] },
      tock: { len: 0.016, a: 0.001, filters: [['bandpass', 6800, 4]] },
      brush: { len: 0.16, a: 0.006, filters: [['bandpass', 1300, 0.6], ['lowpass', 2400, 0.5]] },
    }[kind];
    return this.buffer(`n:${kind}:${variant}`, spec.len + 0.01, (d, sr) => {
      seed = 9000 + variant * 7919 + kind.length * 104729;
      const fs = spec.filters.map(([type, f, q]) => {
        const b = new Biquad(type, sr);
        b.set(f, q);
        return b;
      });
      const att = spec.a * sr;
      const k = Math.log(1e-4) / (spec.len * sr);
      for (let i = 0; i < d.length; i++) {
        let s = rnd();
        for (const b of fs) s = b.run(s);
        d[i] = s * (i < att ? i / att : Math.exp(k * (i - att))) * 2;
      }
    });
  }

  /** Cymbal wash (decay) or reverse swell (rising, cut at the end). */
  wash(decay, { hp = 5200, swell = false, cut = 0 } = {}) {
    return this.buffer(`w:${decay}:${hp}:${swell}:${cut}`, decay + 0.02, (d, sr) => {
      seed = 31337;
      const h = new Biquad('highpass', sr);
      h.set(hp, 0.5);
      const l = cut ? new Biquad('lowpass', sr) : null;
      l?.set(cut, 0.5);
      const n = d.length;
      for (let i = 0; i < n; i++) {
        let s = h.run(rnd());
        if (l) s = l.run(s);
        const p = i / n;
        d[i] = s * (swell ? 1e-4 ** (1 - p) * Math.min(1, (n - i) / (0.012 * sr)) : Math.min(1, i / (0.01 * sr)) * 1e-4 ** p);
      }
    });
  }

  /** FM bell / glockenspiel / music box, low-passed. */
  bell(m, dur, ratio, index, cut) {
    return this.buffer(`b:${m}:${dur}:${ratio}:${index}:${cut}`, dur + 0.02, (d, sr) => {
      const f = hz(m);
      const lp = new Biquad('lowpass', sr);
      lp.set(cut, 0.5);
      let pc = 0;
      let pm = 0;
      const k = Math.log(1e-4) / (dur * sr);
      const ki = Math.log(0.05) / (Math.min(dur, 0.9) * sr);
      for (let i = 0; i < d.length; i++) {
        pm += (2 * Math.PI * f * ratio) / sr;
        const idx = index * Math.exp(ki * i);
        pc += (2 * Math.PI * f) / sr;
        const s = Math.sin(pc + idx * Math.sin(pm));
        d[i] = lp.run(s) * Math.min(1, i / (0.003 * sr)) * Math.exp(k * i);
      }
    });
  }
}
