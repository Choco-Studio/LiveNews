// Lo-fi newsroom proposal: the instrument rig. Oscillators only (no samples),
// but shaped to sound warm: FM Rhodes with a soft bark, band-limited pulse pads
// with slow filter swells, triangle/sine bass, a celesta-like bell for the motif,
// brushed drums, vinyl hiss and crackle, a tape wow shared by every pitched
// voice, a small room reverb and per-bed tape echo. Every voice has an attack
// and a release (no clicks) and the whole kit is voiced low: the 1-4 kHz band
// belongs to the presenters.

import { hz, rng } from './theory.js';

/** Band-limited pulse wave: |c_n| = 2/(n pi) sin(n pi duty), softened with a Lanczos taper and a gentle tilt. */
function pulseWave(ctx, duty, harmonics, tilt = 0.25) {
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  for (let n = 1; n <= harmonics; n++) {
    const sigma = Math.sin((Math.PI * n) / (harmonics + 1)) / ((Math.PI * n) / (harmonics + 1));
    imag[n] = ((2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty) * sigma) / n ** tilt;
  }
  return ctx.createPeriodicWave(real, imag);
}

/** Additive wave from partial amplitudes [h1, h2, ...]. */
function additiveWave(ctx, partials) {
  const real = new Float32Array(partials.length + 1);
  const imag = new Float32Array(partials.length + 1);
  partials.forEach((a, i) => (imag[i + 1] = a));
  return ctx.createPeriodicWave(real, imag);
}

function noiseBuffer(ctx, seconds, seed) {
  const r = rng(seed);
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
  return buf;
}

// Paul Kellet's pink filter: hiss with the gentle top end of old tape.
function pinkBuffer(ctx, seconds, seed) {
  const r = rng(seed);
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < d.length; i++) {
    const w = r() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  // Cross-fade the loop point so the looping hiss never ticks.
  const fade = Math.floor(ctx.sampleRate * 0.05);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    d[i] = d[i] * k + d[d.length - fade + i] * (1 - k);
  }
  return buf;
}

// Vinyl crackle: sparse damped blips of three sizes, softened by a one-pole low-pass.
function crackleBuffer(ctx, seconds, seed) {
  const r = rng(seed);
  const sr = ctx.sampleRate;
  const buf = ctx.createBuffer(1, Math.floor(sr * seconds), sr);
  const d = buf.getChannelData(0);
  const kinds = [
    { rate: 38, amp: [0.015, 0.06], tau: [2, 5] },
    { rate: 3, amp: [0.1, 0.32], tau: [4, 9] },
    { rate: 0.2, amp: [0.45, 0.7], tau: [6, 14] },
  ];
  const scale = sr / 48000;
  for (const k of kinds) {
    let i = 0;
    for (;;) {
      i += Math.floor((-Math.log(1 - r()) / k.rate) * sr);
      if (i >= d.length - 64) break;
      const a = r.range(k.amp[0], k.amp[1]) * (r() < 0.5 ? -1 : 1);
      const tau = r.range(k.tau[0], k.tau[1]) * scale;
      for (let j = 0; j < 48 * scale && i + j < d.length; j++) d[i + j] += a * (j === 0 ? 1 : -0.55) * Math.exp(-j / tau);
    }
  }
  let y = 0;
  for (let i = 0; i < d.length; i++) {
    y += 0.55 * (d[i] - y);
    d[i] = y;
  }
  const fade = Math.floor(sr * 0.02);
  for (let i = 0; i < fade; i++) d[i] *= i / fade;
  for (let i = 0; i < fade; i++) d[d.length - 1 - i] *= i / fade;
  return buf;
}

// Small warm room: pre-delay, three early reflections, a tail that darkens as it decays.
function roomIR(ctx, seconds, tc, seed) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const r = rng(seed + ch * 7919);
    const d = buf.getChannelData(ch);
    const pre = Math.floor(sr * 0.014);
    let y = 0;
    for (let i = pre; i < len; i++) {
      const time = (i - pre) / sr;
      const a = 0.85 - 0.72 * Math.min(1, time / seconds);
      y += a * (r() * 2 - 1 - y);
      d[i] = y * Math.exp(-time / tc);
    }
    for (const [ms, g] of [[19, 0.5], [27 + ch * 4, 0.35], [43 - ch * 3, 0.25]]) {
      const i = Math.floor((sr * ms) / 1000);
      if (i < len) d[i] += g * (ch ? -1 : 1);
    }
    const fade = Math.floor(sr * 0.2);
    for (let i = 0; i < fade; i++) d[len - 1 - i] *= i / fade;
  }
  return buf;
}

export class Rig {
  constructor(ctx, { seed = 24 } = {}) {
    this.ctx = ctx;
    this.waves = {
      pulse25: pulseWave(ctx, 0.25, 16),
      pulse125: pulseWave(ctx, 0.125, 16),
      square: pulseWave(ctx, 0.5, 13, 0.35),
      glass: additiveWave(ctx, [1, 0.32, 0.16, 0.05, 0.035, 0.012]),
      // Brass: a saw-like series (1/n) but band-limited and tapered: warm, never buzzy.
      brass: additiveWave(ctx, Array.from({ length: 14 }, (_, i) => (1 / (i + 1)) * Math.cos((Math.PI * i) / 30))),
    };
    this.white = noiseBuffer(ctx, 2, seed);
    this.pink = pinkBuffer(ctx, 5, seed + 1);
    this.crackle = crackleBuffer(ctx, 7, seed + 2);

    // Music sum -> speech pocket (dynamic EQ dip where speech lives) -> low shelf
    // -> gentle top shelf -> glue compressor -> output.
    this.sum = ctx.createGain();
    this.pocket = ctx.createBiquadFilter();
    this.pocket.type = 'peaking';
    this.pocket.frequency.value = 2400;
    this.pocket.Q.value = 0.7;
    this.pocket.gain.value = 0;
    this.shelf = ctx.createBiquadFilter();
    this.shelf.type = 'highshelf';
    this.shelf.frequency.value = 5500;
    this.shelf.gain.value = -2;
    // Low shelf: the triangle / sine basses carried most of the energy below 120 Hz (8-17 dB over the
    // parts); -4 dB there lets laptops and phones hear the ostinatos and chords, and eases the glue.
    this.lowShelf = ctx.createBiquadFilter();
    this.lowShelf.type = 'lowshelf';
    this.lowShelf.frequency.value = 110;
    this.lowShelf.gain.value = -4;
    this.glue = ctx.createDynamicsCompressor();
    this.glue.threshold.value = -22;
    this.glue.knee.value = 12;
    this.glue.ratio.value = 2.2;
    this.glue.attack.value = 0.03;
    this.glue.release.value = 0.3;
    this.out = ctx.createGain();
    this.out.gain.value = 1;
    this.sum.connect(this.pocket).connect(this.lowShelf).connect(this.shelf).connect(this.glue).connect(this.out);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = roomIR(ctx, 2.6, 0.27, seed + 3);
    this.reverbIn = ctx.createGain();
    const verbHp = ctx.createBiquadFilter();
    verbHp.type = 'highpass';
    verbHp.frequency.value = 220;
    const verbLp = ctx.createBiquadFilter();
    verbLp.type = 'lowpass';
    verbLp.frequency.value = 3800;
    this.reverbIn.connect(verbHp).connect(this.reverb).connect(verbLp).connect(this.sum);

    // Tape wow (slow) + flutter (fast), in cents, shared by every pitched voice.
    this.wowOut = ctx.createGain();
    this.wowOut.gain.value = 1;
    this.lfos = [];
    for (const [f, cents] of [[0.31, 5.5], [5.3, 1.3]]) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = cents;
      lfo.connect(g).connect(this.wowOut);
      lfo.start(0);
      this.lfos.push(lfo);
    }
    this.live = new Set(); // sources still playing (so stopAll can cut them)
  }

  // ---------------------------------------------------------------- helpers

  osc(type, freq, t, wow = true) {
    const o = this.ctx.createOscillator();
    if (this.waves[type]) o.setPeriodicWave(this.waves[type]);
    else o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (wow) {
      this.wowOut.connect(o.detune);
      o.__wow = true;
    }
    return o;
  }

  gain(v = 0) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    return g;
  }

  filter(type, freq, q = 0.7) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  noise(t, buf = this.white) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    return s;
  }

  // Start/stop sources and free every node when the last one ends (24/7 safe).
  play(sources, nodes, t, stopAt) {
    let left = sources.length;
    const all = [...sources, ...nodes];
    for (const s of sources) {
      const rec = { src: s };
      this.live.add(rec);
      s.onended = () => {
        this.live.delete(rec);
        if (--left > 0) return;
        for (const n of all) {
          try {
            if (n.__wow) this.wowOut.disconnect(n.detune);
          } catch { /* already gone */ }
          try {
            n.disconnect();
          } catch { /* already gone */ }
        }
      };
      if (s.buffer) {
        const off = s.__offset || 0;
        s.start(t, off);
      } else s.start(t);
      s.stop(stopAt);
    }
  }

  stopAll(at) {
    for (const rec of this.live) {
      try {
        rec.src.stop(at);
      } catch { /* not started */ }
    }
  }

  // ------------------------------------------------------------ instruments

  /** FM electric piano (Rhodes-ish): carrier + detuned twin, ratio-1 modulator whose index decays (the soft "bark"). */
  ep(t, midi, dur, vel, dest, p = {}) {
    const f = hz(midi);
    const idx = (p.index ?? 0.8) * (0.55 + 0.6 * vel);
    const car = this.osc('sine', f, t);
    const car2 = this.osc('sine', f, t);
    car2.detune.setValueAtTime(6, t);
    if (p.bend) {
      // Tape slowing down under the note (cents over its length): the replay marker's last note.
      car.detune.setValueAtTime(0, t + dur * 0.3);
      car.detune.linearRampToValueAtTime(p.bend, t + dur);
      car2.detune.setValueAtTime(6, t + dur * 0.3);
      car2.detune.linearRampToValueAtTime(6 + p.bend, t + dur);
    }
    const mod = this.osc('sine', f, t, false);
    const mg = this.gain(0);
    mg.gain.setValueAtTime(f * idx, t);
    mg.gain.setTargetAtTime(f * idx * 0.34, t + 0.004, 0.45);
    mod.connect(mg);
    mg.connect(car.frequency);
    mg.connect(car2.frequency);
    const twin = this.gain(0.55);
    const srcs = [car, car2, mod];
    const extra = [];
    // Tine: a quick high partial on the attack, only when the music plays alone (p.tine > 0).
    if (p.tine > 0) {
      const tine = this.osc('sine', f * 7.02, t, false);
      const tg = this.gain(0);
      tg.gain.setValueAtTime(0, t);
      tg.gain.linearRampToValueAtTime(0.03 * vel * Math.min(1, p.tine * 2.5), t + 0.002);
      tg.gain.setTargetAtTime(0, t + 0.002, 0.04);
      tine.connect(tg);
      srcs.push(tine);
      extra.push(tg);
    }
    const amp = this.gain(0);
    const peak = 0.1 * vel;
    const atk = p.attack ?? 0.012;
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + atk);
    amp.gain.setTargetAtTime(peak * 0.38, t + atk, p.decay ?? 0.9);
    amp.gain.setTargetAtTime(0, t + dur, p.release ?? 0.16);
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = p.pan ?? 0;
    car.connect(amp);
    car2.connect(twin).connect(amp);
    for (const tg of extra) tg.connect(amp);
    amp.connect(pan).connect(dest);
    this.play(srcs, [mg, twin, amp, pan, ...extra], t, t + dur + (p.release ?? 0.16) * 6);
  }

  /** Slow pulse pad: two detuned band-limited pulses, low-pass that opens with the swell. */
  pad(t, midi, dur, vel, dest, p = {}) {
    const f = hz(midi);
    const atk = Math.max(0.02, p.attack ?? 1);
    const rel = p.release ?? 1.4;
    const o1 = this.osc(p.wave || 'pulse25', f, t);
    const o2 = this.osc(p.wave || 'pulse25', f, t);
    o1.detune.setValueAtTime(-7, t);
    o2.detune.setValueAtTime(7, t);
    const lp = this.filter('lowpass', p.lpFrom ?? 260, 0.5);
    lp.frequency.setValueAtTime(p.lpFrom ?? 260, t);
    lp.frequency.setTargetAtTime(p.lpTo ?? 1100, t, atk / 2.2);
    const amp = this.gain(0);
    const peak = 0.06 * vel;
    amp.gain.setValueAtTime(0, t);
    if (atk >= dur) {
      amp.gain.linearRampToValueAtTime(peak, t + dur); // reverse swell: cut right at the downbeat
      amp.gain.linearRampToValueAtTime(0, t + dur + rel);
    } else {
      amp.gain.linearRampToValueAtTime(peak, t + atk);
      amp.gain.setTargetAtTime(0, t + dur, rel / 3);
    }
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = p.pan ?? 0;
    o1.connect(lp);
    o2.connect(lp);
    lp.connect(amp).connect(pan).connect(dest);
    const end = atk >= dur ? t + dur + rel + 0.05 : t + dur + rel * 2.2;
    this.play([o1, o2], [lp, amp, pan], t, end);
  }

  /** Round bass: triangle (or sine) with a sine body, low-passed. */
  bass(t, midi, dur, vel, dest, p = {}) {
    const f = hz(midi);
    const o = this.osc(p.wave || 'triangle', f, t);
    const body = this.osc('sine', f, t);
    const bg = this.gain(0.4);
    const lp = this.filter('lowpass', p.lp ?? 650, 0.6);
    const amp = this.gain(0);
    const peak = 0.1 * vel;
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + 0.014);
    amp.gain.setTargetAtTime(peak * 0.72, t + 0.014, 0.3);
    const rel = p.release ?? 0.06;
    amp.gain.setTargetAtTime(0, t + dur, rel);
    o.connect(lp);
    body.connect(bg).connect(lp);
    lp.connect(amp).connect(dest);
    this.play([o, body], [bg, lp, amp], t, t + dur + rel * 7);
  }

  /** Celesta-like bell (the motif's voice): FM ratio 2 with a fast-decaying index. */
  bell(t, midi, dur, vel, dest, p = {}) {
    const f = hz(midi);
    const car = this.osc('sine', f, t);
    const mod = this.osc('sine', f * 2, t, false);
    const mg = this.gain(0);
    mg.gain.setValueAtTime(f * 0.9 * vel, t);
    mg.gain.setTargetAtTime(f * 0.12, t + 0.002, 0.06);
    mod.connect(mg).connect(car.frequency);
    const amp = this.gain(0);
    const peak = 0.1 * vel;
    const ring = p.decay ?? 0.55;
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + 0.008); // 8 ms: a soft mallet, no tick at the onset
    amp.gain.setTargetAtTime(0, t + 0.008, ring);
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = p.pan ?? 0;
    car.connect(amp).connect(pan).connect(dest);
    this.play([car, mod], [mg, amp, pan], t, t + Math.max(dur, ring * 6) + 0.05);
  }

  /** Chip pluck: a pulse through a resonant low-pass that snaps shut. */
  pluck(t, midi, dur, vel, dest, p = {}) {
    const f = hz(midi);
    const o = this.osc(p.wave || 'pulse25', f, t);
    const lp = this.filter('lowpass', p.bright ?? 2000, 2.2);
    lp.frequency.setValueAtTime(p.bright ?? 2000, t);
    lp.frequency.setTargetAtTime(Math.min(380, f * 1.2), t + 0.002, 0.05);
    const amp = this.gain(0);
    const peak = 0.075 * vel;
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + 0.004);
    amp.gain.setTargetAtTime(0, t + 0.004, p.decay ?? 0.18);
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = p.pan ?? 0;
    o.connect(lp).connect(amp).connect(pan).connect(dest);
    this.play([o], [lp, amp, pan], t, t + Math.min(dur + 0.6, (p.decay ?? 0.18) * 7));
  }

  /** Short pulse stab (news-60 off-beats). */
  stab(t, midi, dur, vel, dest, p = {}) {
    const f = hz(midi);
    const o = this.osc(p.wave || 'pulse25', f, t);
    const lp = this.filter('lowpass', 1500, 0.8);
    const amp = this.gain(0);
    const peak = 0.06 * vel;
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + 0.008);
    amp.gain.setTargetAtTime(peak * 0.4, t + 0.008, p.decay ?? 0.12);
    amp.gain.setTargetAtTime(0, t + dur, 0.035);
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = p.pan ?? 0;
    o.connect(lp).connect(amp).connect(pan).connect(dest);
    this.play([o], [lp, amp, pan], t, t + dur + 0.25);
  }

  /** Soft square lead with delayed vibrato (the chiptune voice, filtered warm). */
  chip(t, midi, dur, vel, dest, p = {}) {
    const f = hz(midi);
    const o = this.osc('square', f, t);
    const vib = this.ctx.createOscillator();
    vib.frequency.value = 5.2;
    const vg = this.gain(0);
    vg.gain.setValueAtTime(0, t);
    vg.gain.linearRampToValueAtTime(0, t + 0.18);
    vg.gain.linearRampToValueAtTime(11, t + 0.45);
    vib.connect(vg).connect(o.detune);
    const lp = this.filter('lowpass', p.lp ?? 1700, 0.6);
    const amp = this.gain(0);
    const peak = 0.05 * vel;
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + 0.02);
    amp.gain.setTargetAtTime(peak * 0.75, t + 0.02, 0.4);
    amp.gain.setTargetAtTime(0, t + dur, 0.07);
    o.connect(lp).connect(amp).connect(dest);
    this.play([o, vib], [vg, lp, amp], t, t + dur + 0.5);
  }

  /**
   * Low brass section (WORLD NOW): two detuned brass waves through a low-pass
   * that "speaks" open in 90 ms and settles, a slow swell and a late, small vibrato.
   */
  brass(t, midi, dur, vel, dest, p = {}) {
    const f = hz(midi);
    const o1 = this.osc('brass', f, t);
    const o2 = this.osc('brass', f, t);
    o1.detune.setValueAtTime(-5, t);
    o2.detune.setValueAtTime(5, t);
    const vib = this.ctx.createOscillator();
    vib.frequency.value = 4.8;
    const vg = this.gain(0);
    vg.gain.setValueAtTime(0, t);
    vg.gain.setValueAtTime(0, t + 0.4);
    vg.gain.linearRampToValueAtTime(6, t + 0.9);
    vib.connect(vg);
    vg.connect(o1.detune);
    vg.connect(o2.detune);
    const peakHz = p.bright ?? 900;
    const lp = this.filter('lowpass', 220, 0.9);
    lp.frequency.setValueAtTime(220, t);
    lp.frequency.linearRampToValueAtTime(peakHz, t + 0.09);
    lp.frequency.setTargetAtTime(peakHz * 0.7, t + 0.09, 0.25);
    const amp = this.gain(0);
    const peak = 0.07 * vel;
    const atk = p.attack ?? 0.08;
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + atk);
    amp.gain.setTargetAtTime(peak * 0.85, t + atk, 0.4);
    const rel = p.release ?? 0.35;
    amp.gain.setTargetAtTime(0, t + dur, rel / 3);
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = p.pan ?? 0;
    o1.connect(lp);
    o2.connect(lp);
    lp.connect(amp).connect(pan).connect(dest);
    this.play([o1, o2, vib], [vg, lp, amp, pan], t, t + dur + rel * 2.5);
  }

  /** Soft triangle lead: rounded, a breath of attack and a gentle late vibrato. */
  softtri(t, midi, dur, vel, dest, p = {}) {
    const f = hz(midi);
    const o = this.osc('triangle', f, t);
    const o2 = this.osc('sine', f * 2, t);
    const g2 = this.gain(0.12);
    const vib = this.ctx.createOscillator();
    vib.frequency.value = 5;
    const vg = this.gain(0);
    vg.gain.setValueAtTime(0, t + 0.3);
    vg.gain.linearRampToValueAtTime(5, t + 0.7);
    vib.connect(vg).connect(o.detune);
    const lp = this.filter('lowpass', p.lp ?? 1800, 0.5);
    const amp = this.gain(0);
    const peak = 0.075 * vel;
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + 0.03);
    amp.gain.setTargetAtTime(peak * 0.7, t + 0.03, 0.6);
    amp.gain.setTargetAtTime(0, t + dur, 0.1);
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = p.pan ?? 0;
    o.connect(lp);
    o2.connect(g2).connect(lp);
    lp.connect(amp).connect(pan).connect(dest);
    this.play([o, o2, vib], [g2, vg, lp, amp, pan], t, t + dur + 0.7);
  }

  /** Sustained pulse-12 lead (the ident's signature), low-passed and echoed by its bus. */
  pulse12(t, midi, dur, vel, dest, p = {}) {
    const f = hz(midi);
    const o = this.osc('pulse125', f, t);
    const lp = this.filter('lowpass', p.lp ?? 1600, 0.7);
    const amp = this.gain(0);
    const peak = 0.07 * vel;
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + 0.012);
    amp.gain.setTargetAtTime(peak * 0.6, t + 0.012, 0.35);
    amp.gain.setTargetAtTime(0, t + dur, 0.08);
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = p.pan ?? 0;
    o.connect(lp).connect(amp).connect(pan).connect(dest);
    this.play([o], [lp, amp, pan], t, t + dur + 0.6);
  }

  /** Soft clock (NEWS IN 60): a woodblock "tock" (beats 1, 3) or "tick" (2, 4), low-passed under 2 kHz. */
  clock(t, vel, dest, tock = false) {
    const f = tock ? 640 : 960;
    const o = this.osc('sine', f, t, false);
    const o2 = this.osc('sine', f * 2.71, t, false);
    const g2 = this.gain(0.18);
    const lp = this.filter('lowpass', 1900, 0.6);
    const amp = this.gain(0);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(0.08 * vel, t + 0.0015);
    amp.gain.setTargetAtTime(0, t + 0.0015, tock ? 0.03 : 0.022);
    o.connect(amp);
    o2.connect(g2).connect(amp);
    amp.connect(lp).connect(dest);
    this.play([o, o2], [g2, lp, amp], t, t + 0.3);
  }

  kick(t, vel, dest) {
    const o = this.osc('sine', 118, t, false);
    o.frequency.setValueAtTime(118, t);
    o.frequency.exponentialRampToValueAtTime(54, t + 0.09);
    const amp = this.gain(0);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(0.24 * vel, t + 0.004);
    amp.gain.setTargetAtTime(0, t + 0.004, 0.085);
    o.connect(amp).connect(dest);
    // A felt "knock" so the kick reads on small speakers, kept below 1 kHz.
    const n = this.noise(t);
    n.__offset = (t * 7.3) % 1.5;
    const lp = this.filter('lowpass', 900, 0.7);
    const ng = this.gain(0);
    ng.gain.setValueAtTime(0, t);
    ng.gain.linearRampToValueAtTime(0.05 * vel, t + 0.002);
    ng.gain.setTargetAtTime(0, t + 0.002, 0.012);
    n.connect(lp).connect(ng).connect(dest);
    this.play([o, n], [amp, lp, ng], t, t + 0.7);
  }

  /** Soft snare (tight kits) or brush swish (brush kits). */
  snare(t, vel, dest, p = {}) {
    const brush = p.brush;
    const n = this.noise(t);
    n.__offset = (t * 3.1) % 1.5;
    const bp = this.filter('bandpass', brush ? 1900 : 1600, brush ? 0.45 : 0.7);
    const lp = this.filter('lowpass', brush ? 3600 : 4200, 0.5);
    const amp = this.gain(0);
    const peak = (brush ? 0.19 : 0.22) * vel;
    const atk = brush ? 0.014 : 0.002;
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + atk);
    amp.gain.setTargetAtTime(0, t + atk, brush ? 0.085 : 0.055);
    n.connect(bp).connect(lp).connect(amp).connect(dest);
    const body = this.osc('triangle', 185, t, false);
    body.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    const bg = this.gain(0);
    bg.gain.setValueAtTime(0, t);
    bg.gain.linearRampToValueAtTime((brush ? 0.05 : 0.11) * vel, t + 0.003);
    bg.gain.setTargetAtTime(0, t + 0.003, 0.045);
    body.connect(bg).connect(dest);
    this.play([n, body], [bp, lp, amp, bg], t, t + 0.6);
  }

  /** Woodblock-ish rim, pitched low (780 Hz) so it stays out of the speech band's core. */
  rim(t, vel, dest) {
    const o = this.osc('sine', 780, t, false);
    const o2 = this.osc('sine', 1490, t, false);
    const g2 = this.gain(0.3);
    const amp = this.gain(0);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(0.07 * vel, t + 0.002);
    amp.gain.setTargetAtTime(0, t + 0.002, 0.022);
    o.connect(amp);
    o2.connect(g2).connect(amp);
    amp.connect(dest);
    this.play([o, o2], [g2, amp], t, t + 0.25);
  }

  hat(t, vel, dest, open = false) {
    const n = this.noise(t);
    n.__offset = (t * 5.7) % 1.5;
    const hp = this.filter('highpass', 7200, 0.6);
    const lp = this.filter('lowpass', 12000, 0.5);
    const amp = this.gain(0);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(0.15 * vel, t + 0.002);
    amp.gain.setTargetAtTime(0, t + 0.002, open ? 0.11 : 0.022);
    n.connect(hp).connect(lp).connect(amp).connect(dest);
    this.play([n], [hp, lp, amp], t, t + (open ? 0.8 : 0.2));
  }

  shaker(t, vel, dest) {
    const n = this.noise(t);
    n.__offset = (t * 2.3) % 1.5;
    const bp = this.filter('bandpass', 7400, 1.3);
    const amp = this.gain(0);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(0.12 * vel, t + 0.014);
    amp.gain.setTargetAtTime(0, t + 0.014, 0.03);
    n.connect(bp).connect(amp).connect(dest);
    this.play([n], [bp, amp], t, t + 0.25);
  }

  /** Clock tick for News in 60: a tiny high click, alternating tik / tok. */
  tick(t, vel, dest, tok = false) {
    const n = this.noise(t);
    n.__offset = (t * 4.1) % 1.5;
    const bp = this.filter('bandpass', tok ? 6200 : 8200, 2.5);
    const amp = this.gain(0);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(0.09 * vel, t + 0.001);
    amp.gain.setTargetAtTime(0, t + 0.001, 0.006);
    n.connect(bp).connect(amp).connect(dest);
    this.play([n], [bp, amp], t, t + 0.12);
  }

  /** Soft mallet timpani for the breaking sting (no siren). */
  timpani(t, midi, vel, dest) {
    const f = hz(midi);
    const srcs = [];
    const nodes = [];
    const amp = this.gain(0);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(0.3 * vel, t + 0.014); // a felt mallet: firm, but no click
    amp.gain.setTargetAtTime(0, t + 0.014, 0.55);
    for (const [ratio, g] of [[1, 1], [1.5, 0.35], [1.98, 0.18]]) {
      const o = this.osc('sine', f * ratio * 1.04, t, false);
      o.frequency.setTargetAtTime(f * ratio, t, 0.04);
      const og = this.gain(g);
      o.connect(og).connect(amp);
      srcs.push(o);
      nodes.push(og);
    }
    amp.connect(dest);
    this.play(srcs, [...nodes, amp], t, t + 3.2);
  }

  /** Filtered noise riser into a downbeat (cut right on the beat). */
  riser(t, dur, vel, dest) {
    const n = this.noise(t);
    n.loop = true;
    const bp = this.filter('bandpass', 260, 2.2);
    bp.frequency.setValueAtTime(260, t);
    bp.frequency.exponentialRampToValueAtTime(1900, t + dur);
    const amp = this.gain(0);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(0.05 * vel, t + dur - 0.01);
    amp.gain.linearRampToValueAtTime(0, t + dur + 0.05);
    n.connect(bp).connect(amp).connect(dest);
    this.play([n], [bp, amp], t, t + dur + 0.1);
  }

  /** Soft cymbal swell for endings (high band only). */
  swell(t, dur, vel, dest, ring = 0.5) {
    const n = this.noise(t);
    n.loop = true;
    const hp = this.filter('highpass', 4500, 0.5);
    const lp = this.filter('lowpass', 10000, 0.5);
    const amp = this.gain(0);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(0.03 * vel, t + dur);
    amp.gain.setTargetAtTime(0, t + dur, ring);
    n.connect(hp).connect(lp).connect(amp).connect(dest);
    this.play([n], [hp, lp, amp], t, t + dur + ring * 7);
  }

  /** Tape-rewind swish (replay marker): band-pass noise that falls then shoots up. */
  rewind(t, dur, vel, dest) {
    const n = this.noise(t);
    n.loop = true;
    const bp = this.filter('bandpass', 1800, 3);
    bp.frequency.setValueAtTime(1800, t);
    bp.frequency.exponentialRampToValueAtTime(320, t + dur * 0.45);
    bp.frequency.exponentialRampToValueAtTime(2600, t + dur);
    const amp = this.gain(0);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(0.06 * vel, t + 0.06);
    amp.gain.setValueAtTime(0.06 * vel, t + dur - 0.12);
    amp.gain.linearRampToValueAtTime(0, t + dur);
    n.connect(bp).connect(amp).connect(dest);
    this.play([n], [bp, amp], t, t + dur + 0.05);
  }

  /** Vinyl bed: pink hiss + looping crackle. Returns { stop(at) }. */
  texture(t, amount, dest) {
    const hiss = this.noise(t, this.pink);
    hiss.loop = true;
    hiss.__offset = (t * 1.7) % 4;
    const hhp = this.filter('highpass', 600, 0.5);
    const hlp = this.filter('lowpass', 6500, 0.5);
    const hg = this.gain(0.012 * amount);
    hiss.connect(hhp).connect(hlp).connect(hg).connect(dest);
    const cr = this.noise(t, this.crackle);
    cr.loop = true;
    cr.__offset = (t * 2.9) % 6;
    cr.playbackRate.value = 0.94;
    const chp = this.filter('highpass', 700, 0.5);
    const clp = this.filter('lowpass', 7000, 0.5);
    const cg = this.gain(0.24 * amount);
    cr.connect(chp).connect(clp).connect(cg).connect(dest);
    const far = 1e6;
    this.play([hiss, cr], [hhp, hlp, hg, chp, clp, cg], t, t + far);
    return {
      stop: (at) => {
        try {
          hg.gain.setTargetAtTime(0, at, 0.3);
          cg.gain.setTargetAtTime(0, at, 0.3);
          hiss.stop(at + 2);
          cr.stop(at + 2);
        } catch { /* ignore */ }
      },
    };
  }
}
