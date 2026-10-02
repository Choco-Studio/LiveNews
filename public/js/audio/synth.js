// Chiptune synth on WebAudio, usable with a live AudioContext (the channel)
// or an OfflineAudioContext (the lab renders and measures every tune with the
// exact same code). NES-flavoured voices: pulse waves with 12.5/25/50 % duty,
// the stepped triangle, LFSR noise drums; ADSR envelopes that always start and
// end at zero (no clicks), delayed vibrato, a tempo-synced echo, a small room,
// music ducking under speech and a master bus that never exceeds -1 dBFS.

import { waveTable } from './waves.js';
import { parseTune, flatten, songSeconds, KIND_GAIN } from './tune.js';
import { estimateLoudness } from './loudness.js';

export const DUCK_LEVEL = 0.32; // music under speech: -10 dB
export const CEILING = 0.87; // master peak limit, -1.2 dBFS
const COMP = { threshold: -7, knee: 3, ratio: 12 };
// WebAudio's DynamicsCompressor adds make-up gain, (1 / gain at 0 dBFS) ^ 0.6;
// with its soft knee that is 3.3 dB for these settings (measured in the lab).
export const COMP_MAKEUP = 10 ** (3.3 / 20);
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

// ------------------------------------------------------------------ bank

// Per-context resources: PeriodicWaves, LFSR noise buffers, room impulse.
const banks = new WeakMap();

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The NES noise channel: a 15-bit LFSR. Long mode is hiss; short mode (tap 6)
// repeats every 93 steps and rings metallic - our hats and ticks.
function lfsrBuffer(ctx, short, seconds = 1) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let reg = 1;
  const tap = short ? 6 : 1;
  for (let i = 0; i < n; i++) {
    const bit = (reg ^ (reg >> tap)) & 1;
    reg = (reg >> 1) | (bit << 14);
    d[i] = reg & 1 ? 0.8 : -0.8;
  }
  return buf;
}

// A small room: a few early reflections and an exponential tail of white
// noise with unit energy per channel, so a send of x adds x^2 of the dry
// energy (the loudness model relies on it); the darkness comes from a
// low-pass after the convolver, which leaves the low and mid range at unity.
function roomImpulse(ctx, seconds = 1.1) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, n, sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    const rnd = mulberry(7 + c * 31);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      d[i] = (rnd() * 2 - 1) * Math.exp((-6.9 * t) / seconds) * Math.min(1, t / 0.012);
    }
    for (const [ms, g] of [[11, 0.5], [17, 0.35], [23, 0.28], [31, 0.2]]) d[Math.floor(((ms + c * 2) / 1000) * sr)] += g;
    let e = 0;
    for (let i = 0; i < n; i++) e += d[i] * d[i];
    const k = 1 / Math.sqrt(e || 1);
    for (let i = 0; i < n; i++) d[i] *= k;
  }
  return buf;
}

export function bank(ctx) {
  let b = banks.get(ctx);
  if (b) return b;
  b = { waves: new Map(), noise: null, metal: null, ir: null };
  b.wave = (kind) => {
    let w = b.waves.get(kind);
    if (!w) {
      const t = waveTable(kind);
      w = ctx.createPeriodicWave(t.real, t.imag);
      b.waves.set(kind, w);
    }
    return w;
  };
  b.noise = lfsrBuffer(ctx, false, 1);
  b.metal = lfsrBuffer(ctx, true, 0.5);
  b.ir = roomImpulse(ctx);
  banks.set(ctx, b);
  return b;
}

// ------------------------------------------------------------------ buses

// Linear up to 0.6, then a smooth knee that can never pass CEILING.
function clipCurve(n = 2048) {
  const c = new Float32Array(n);
  const knee = 0.6;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + (CEILING - knee) * Math.tanh((a - knee) / (CEILING - knee));
    c[i] = Math.sign(x) * Math.min(y, CEILING);
  }
  return c;
}

/**
 * The channel's mixer: tunes and sfx -> music (ducked) -> master; blips ->
 * speech -> master; master -> compressor -> soft clipper -> volume -> mute.
 * `raw` skips the dynamics (the lab's envelope probe).
 */
export function buildBuses(ctx, { volume = 0.8, raw = false } = {}) {
  const b = bank(ctx);
  const mute = ctx.createGain();
  mute.connect(ctx.destination);
  const out = ctx.createGain();
  out.gain.value = volume;
  out.connect(mute);
  const master = ctx.createGain();
  let comp = null;
  if (raw) master.connect(out);
  else {
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = COMP.threshold;
    comp.knee.value = COMP.knee;
    comp.ratio.value = COMP.ratio;
    comp.attack.value = 0.002;
    comp.release.value = 0.16;
    // Browsers add automatic make-up gain after the compressor; take it back
    // out so quiet material passes at unity and the loudness targets hold.
    const unmake = ctx.createGain();
    unmake.gain.value = 1 / COMP_MAKEUP;
    const clip = ctx.createWaveShaper();
    clip.curve = clipCurve();
    clip.oversample = 'none';
    master.connect(comp).connect(unmake).connect(clip).connect(out);
  }
  const duck = ctx.createGain();
  duck.connect(master);
  const music = ctx.createGain();
  music.connect(duck);
  const reverb = ctx.createConvolver();
  reverb.normalize = false;
  reverb.buffer = b.ir;
  const dark = ctx.createBiquadFilter();
  dark.type = 'lowpass';
  dark.frequency.value = 3200;
  dark.Q.value = 0.5;
  reverb.connect(dark).connect(duck);
  const speech = ctx.createGain();
  speech.connect(master);
  return { ctx, master, duck, music, reverb, speech, out, mute, comp, raw };
}

// Music down while someone talks (fast), back up slowly after.
export function setDuck(param, on, t) {
  try {
    param.cancelScheduledValues(t);
    param.setTargetAtTime(on ? DUCK_LEVEL : 1, t, on ? 0.06 : 0.35);
  } catch { /* ignore */ }
}

// ----------------------------------------------------------------- voices

// Exponential decay from `peak` that lands exactly on zero at `end`.
// Gain params must start at 0: before its first event an AudioParam sits at
// its default (1), and a source starting one frame early would click.
function envDecay(p, when, peak, attack, tau, end) {
  p.value = 0;
  p.setValueAtTime(0, when);
  p.linearRampToValueAtTime(peak, when + attack);
  p.setTargetAtTime(0, when + attack, tau);
  p.setValueAtTime(peak * Math.exp(-(end - when - attack) / tau), end);
  p.linearRampToValueAtTime(0, end + 0.012);
}

/**
 * Plays parsed songs on a context. One instance per playTune() call; the
 * owner calls scheduleUntil() regularly (or once, offline).
 */
export class TunePlayer {
  constructor(ctx, buses, song, { volume = 0.5, loop = false, probe = false, normalise = true } = {}) {
    this.ctx = ctx;
    this.song = song;
    this.loop = loop;
    this.probe = probe;
    this.bank = bank(ctx);
    this.events = flatten(song, 1);
    this.spb = 60 / song.bpm;
    this.passSec = songSeconds(song);
    this.loudness = normalise ? estimateLoudness(song) : { gain: 1, gainDb: 0, integrated: NaN };
    this.live = new Set();
    this.cursor = 0;
    this.pass = 0;
    this.t0 = null;
    this.done = false;
    this.stopped = false;
    this.hits = 0;
    // Graph: tracks -> panners -> out -> music bus, with echo and room sends.
    this.out = ctx.createGain();
    this.out.gain.value = this.loudness.gain * (Math.max(0, Math.min(1, volume)) / 0.5);
    this.out.connect(buses.music);
    this.nodes = [this.out];
    if (!probe && song.room > 0) {
      const send = ctx.createGain();
      send.gain.value = song.room;
      this.out.connect(send).connect(buses.reverb);
      this.nodes.push(send);
    }
    this.echoIn = null;
    if (!probe && song.echo.send > 0 && song.tracks.some((t) => t.echo > 0)) {
      const input = ctx.createGain();
      const delay = ctx.createDelay(2);
      delay.delayTime.value = Math.min(1.5, song.echo.beats * this.spb);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2600;
      const fb = ctx.createGain();
      fb.gain.value = song.echo.feedback;
      input.connect(delay).connect(lp).connect(fb).connect(delay);
      lp.connect(this.out);
      this.echoIn = input;
      this.nodes.push(input, delay, lp, fb);
    }
    this.tracks = song.tracks.map((track) => {
      const pan = ctx.createStereoPanner();
      pan.pan.value = track.pan;
      pan.connect(this.out);
      this.nodes.push(pan);
      if (this.echoIn && track.echo > 0) {
        const send = ctx.createGain();
        send.gain.value = track.echo * song.echo.send;
        pan.connect(send).connect(this.echoIn);
        this.nodes.push(send);
      }
      return { track, dest: pan };
    });
  }

  start(when) {
    this.t0 = when;
  }

  // Seconds from start until the last note of a non-looping tune has rung out.
  get length() {
    return this.passSec + 0.5;
  }

  scheduleUntil(tEnd) {
    if (this.t0 === null || this.stopped || this.done || !this.events.length) return;
    const lateLimit = this.ctx.currentTime - 0.02;
    for (let guard = 0; guard < 4000; guard++) {
      const ev = this.events[this.cursor];
      const when = this.t0 + (this.pass * this.song.beats + ev.at) * this.spb;
      if (when >= tEnd) return;
      if (when >= lateLimit) this.play(ev, when); // a late timer skips notes rather than clicking them in
      this.cursor++;
      if (this.cursor >= this.events.length) {
        if (!this.loop) {
          this.done = true;
          return;
        }
        this.cursor = 0;
        this.pass++;
      }
    }
  }

  stop(when = this.ctx.currentTime, fade = this.song.fadeOut) {
    if (this.stopped) return;
    this.stopped = true;
    const g = this.out.gain;
    try {
      g.cancelScheduledValues(when);
      g.setValueAtTime(g.value, when);
      g.linearRampToValueAtTime(0, when + fade);
    } catch { /* ignore */ }
    for (const src of this.live) {
      try {
        src.stop(when + fade + 0.02);
      } catch { /* not started yet or already stopped */ }
    }
    const nodes = this.nodes;
    setTimeout(() => {
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch { /* ignore */ }
      }
    }, (when - this.ctx.currentTime + fade + 2.5) * 1000);
  }

  track(src, ...nodes) {
    this.live.add(src);
    src.onended = () => {
      this.live.delete(src);
      try {
        src.disconnect();
        for (const n of nodes) n.disconnect();
      } catch { /* ignore */ }
    };
  }

  play(ev, when) {
    const { track, dest } = this.tracks[ev.track];
    const dur = ev.dur * this.spb;
    if (track.kind === 'drums') this.drum(ev.e.drum, KIND_GAIN.drums * track.gain * ev.e.vel, when, dur, dest);
    else this.note(track, ev.e, when, dur, dest);
  }

  note(track, e, when, dur, dest) {
    const ctx = this.ctx;
    const inst = track.inst;
    const gate = Math.max(0.03, dur * inst.legato);
    const voices = track.arp > 0 && e.midis.length > 1 ? [e.midis] : e.midis.map((m) => [m]);
    const peak = (KIND_GAIN[track.kind] * track.gain * inst.gain * e.vel) / Math.sqrt(voices.length);
    for (const notes of voices) {
      const g = ctx.createGain();
      let src;
      const extra = [g];
      if (this.probe) {
        src = ctx.createConstantSource();
      } else {
        src = ctx.createOscillator();
        src.setPeriodicWave(this.bank.wave(inst.wave));
        if (notes.length > 1) {
          // Chiptune chord: one voice cycling through the notes.
          let k = 0;
          for (let t = when; t < when + gate + inst.r; t += track.arp) src.frequency.setValueAtTime(hz(notes[k++ % notes.length]), t);
        } else src.frequency.setValueAtTime(hz(notes[0]), when);
        if (inst.scoop) {
          src.detune.setValueAtTime(-inst.scoop, when);
          src.detune.linearRampToValueAtTime(0, when + 0.06);
        }
        const vib = inst.vib;
        if (vib && gate > vib[2] + 0.1) {
          const lfo = ctx.createOscillator();
          const depth = ctx.createGain();
          lfo.frequency.value = vib[1];
          depth.gain.value = 0;
          depth.gain.setValueAtTime(0, when);
          depth.gain.setValueAtTime(0, when + vib[2]);
          depth.gain.linearRampToValueAtTime(vib[0], when + vib[2] + 0.18);
          lfo.connect(depth).connect(src.detune);
          lfo.start(when);
          lfo.stop(when + gate + inst.r + 0.02);
          extra.push(depth);
          lfo.onended = () => {
            try {
              lfo.disconnect();
            } catch { /* ignore */ }
          };
        }
      }
      // ADSR, always from zero and back to zero (see envDecay about the 0).
      const p = g.gain;
      p.value = 0;
      p.setValueAtTime(0, when);
      let level;
      if (gate <= inst.a) {
        level = peak * (gate / inst.a);
        p.linearRampToValueAtTime(level, when + gate);
      } else {
        p.linearRampToValueAtTime(peak, when + inst.a);
        const tau = Math.max(0.002, inst.d / 3);
        p.setTargetAtTime(peak * inst.s, when + inst.a, tau);
        level = peak * (inst.s + (1 - inst.s) * Math.exp(-(gate - inst.a) / tau));
        p.setValueAtTime(level, when + gate);
      }
      p.linearRampToValueAtTime(0, when + gate + inst.r);
      src.connect(g).connect(dest);
      src.start(when);
      src.stop(when + gate + inst.r + 0.01);
      this.track(src, ...extra);
    }
  }

  noiseSource(metal, when, rate = 1) {
    const src = this.ctx.createBufferSource();
    src.buffer = metal ? this.bank.metal : this.bank.noise;
    src.playbackRate.value = rate;
    src.loop = true;
    // Deterministic offsets keep offline renders identical run to run.
    this.hits = (this.hits + 1) % 97;
    src.start(when, (this.hits * 0.0103) % (src.buffer.duration * 0.9));
    return src;
  }

  drum(kind, level, when, dur, dest) {
    const ctx = this.ctx;
    const voice = (src, filter, peak, attack, tau, end) => {
      const g = ctx.createGain();
      envDecay(g.gain, when, peak, attack, tau, when + end);
      if (filter) src.connect(filter).connect(g).connect(dest);
      else src.connect(g).connect(dest);
      if (!src.started) src.start?.(when);
      src.stop(when + end + 0.02);
      this.track(src, g, ...(filter ? [filter] : []));
    };
    const filt = (type, f, q = 0.8) => {
      const n = ctx.createBiquadFilter();
      n.type = type;
      n.frequency.value = f;
      n.Q.value = q;
      return n;
    };
    const tone = (type, f0, f1, glide) => {
      const o = this.probe ? ctx.createConstantSource() : ctx.createOscillator();
      if (!this.probe) {
        if (type === 'tri') o.setPeriodicWave(this.bank.wave('tri'));
        else o.type = type;
        o.frequency.setValueAtTime(f0, when);
        if (f1) o.frequency.exponentialRampToValueAtTime(f1, when + glide);
      }
      return o;
    };
    const noise = (metal, rate) => {
      if (this.probe) return ctx.createConstantSource();
      const s = this.noiseSource(metal, when, rate);
      s.started = true;
      return s;
    };
    switch (kind) {
      case 'k':
        voice(tone('sine', 150, 46, 0.11), null, level, 0.0015, 0.07, 0.32);
        voice(noise(false, 1), filt('highpass', 1800), level * 0.25, 0.001, 0.004, 0.02);
        break;
      case 's':
        voice(noise(false, 1), filt('bandpass', 1900, 0.9), level * 0.85, 0.001, 0.05, 0.22);
        voice(tone('tri', 190, 150, 0.08), null, level * 0.45, 0.001, 0.035, 0.12);
        break;
      case 'h':
        voice(noise(true, 1.6), filt('highpass', 6500), level * 0.5, 0.001, 0.014, 0.06);
        break;
      case 'o':
        voice(noise(true, 1.6), filt('highpass', 6000), level * 0.42, 0.002, 0.09, 0.36);
        break;
      case 'c':
        voice(noise(false, 1), filt('highpass', 3800), level * 0.5, 0.002, 0.32, 1.5);
        voice(noise(true, 1.9), filt('highpass', 5000), level * 0.25, 0.002, 0.25, 1.2);
        break;
      case 't':
        voice(tone('tri', 210, 118, 0.2), null, level * 0.9, 0.0015, 0.09, 0.36);
        break;
      case 'p':
        for (const d of [0, 0.011, 0.022]) {
          const at = when + d;
          const g = ctx.createGain();
          const src = this.probe ? ctx.createConstantSource() : this.noiseSource(false, at, 1);
          const f = filt('bandpass', 1150, 1.3);
          envDecay(g.gain, at, level * (d === 0.022 ? 0.8 : 0.55), 0.001, d === 0.022 ? 0.05 : 0.005, at + (d === 0.022 ? 0.2 : 0.009));
          src.connect(f).connect(g).connect(dest);
          if (this.probe) src.start(at);
          src.stop(at + 0.24);
          this.track(src, g, f);
        }
        break;
      case 'x':
        voice(noise(true, 2), filt('bandpass', 3200, 2), level * 0.6, 0.001, 0.006, 0.03);
        break;
      case 'w': {
        // Whoosh: band-passed hiss sweeping up, swelling to 60 % of its length.
        const len = Math.max(0.15, dur);
        const src = noise(false, 1);
        const f = filt('bandpass', 300, 1.4);
        if (!this.probe) {
          f.frequency.setValueAtTime(300, when);
          f.frequency.exponentialRampToValueAtTime(3400, when + len);
        }
        const g = ctx.createGain();
        g.gain.value = 0;
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(level * 0.9, when + len * 0.6);
        g.gain.linearRampToValueAtTime(0, when + len);
        src.connect(f).connect(g).connect(dest);
        if (this.probe) src.start(when);
        src.stop(when + len + 0.02);
        this.track(src, g, f);
        break;
      }
      default:
        break;
    }
  }
}

// ------------------------------------------------------------------ blips

/**
 * One sentence of "Animal Crossing" speech: one oscillator, a gain envelope
 * per beep (6 ms in, 12 ms out, pitch changes only while silent) through a
 * low-pass. `beeps` come from visemes.blipPlan(); `t0` is the context time of
 * the sentence start. Returns a function that cuts it short.
 */
export function scheduleBlips(ctx, dest, blip, beeps, t0, totalSec, rnd = Math.random) {
  if (!beeps.length) return () => {};
  const osc = ctx.createOscillator();
  osc.setPeriodicWave(bank(ctx).wave(blip.wave ?? 'tri'));
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = blip.cut;
  const g = ctx.createGain();
  g.gain.value = 0;
  osc.connect(lp).connect(g).connect(dest);
  osc.frequency.value = blip.base;
  for (const b of beeps) {
    const t = t0 + b.at / 1000;
    const d = Math.max(0.03, (b.dur / 1000) * (blip.len / 0.78));
    const v = blip.gain * b.peak;
    const f = blip.base * (1 + (b.ratio - 1) * (1 - blip.flat)) * (1 - blip.vary / 2 + rnd() * blip.vary);
    osc.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.006);
    g.gain.setValueAtTime(v, t + d - 0.012);
    g.gain.linearRampToValueAtTime(0, t + d);
  }
  osc.start(t0);
  osc.stop(t0 + totalSec + 0.05);
  osc.onended = () => {
    try {
      osc.disconnect();
      lp.disconnect();
      g.disconnect();
    } catch { /* ignore */ }
  };
  return () => {
    try {
      const now = ctx.currentTime;
      g.gain.cancelScheduledValues(now);
      g.gain.setTargetAtTime(0, now, 0.004);
      osc.stop(now + 0.03);
    } catch { /* already stopped */ }
  };
}

// ---------------------------------------------------------------- offline

export const asSong = (tune) => (tune && Array.isArray(tune.tracks) && tune.tracks[0]?.events ? tune : parseTune(tune));

/**
 * Render a tune offline with the channel's own mixer.
 * opts: seconds, sampleRate (48000), volume (0.5), loop, duck: [[from, to], ...]
 * (speech intervals in seconds), probe (envelopes only, no dynamics), normalise.
 * Resolves to { buffer, song, loudness } or null without OfflineAudioContext.
 */
export async function renderTune(tune, opts = {}) {
  const Offline = globalThis.OfflineAudioContext;
  const song = asSong(tune);
  if (!Offline || !song) return null;
  const sampleRate = opts.sampleRate ?? 48000;
  const loop = Boolean(opts.loop);
  const seconds = opts.seconds ?? Math.min(60, songSeconds(song) + 1.6);
  const ctx = new Offline(2, Math.ceil(seconds * sampleRate), sampleRate);
  const buses = buildBuses(ctx, { volume: 1, raw: Boolean(opts.probe) });
  const player = new TunePlayer(ctx, buses, song, { volume: opts.volume ?? 0.5, loop, probe: opts.probe, normalise: opts.normalise !== false });
  player.start(0.05);
  player.scheduleUntil(seconds);
  for (const [a, b] of opts.duck ?? []) {
    setDuck(buses.duck.gain, true, a);
    setDuck(buses.duck.gain, false, b);
  }
  if (opts.stopAt) player.stop(opts.stopAt);
  const buffer = await ctx.startRendering();
  return { buffer, song, loudness: player.loudness };
}
