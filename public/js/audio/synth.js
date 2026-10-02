// Chip synth on WebAudio, usable with a live AudioContext (the channel) or an
// OfflineAudioContext (the lab renders and measures every tune with the exact
// same code). NES-derived voices - pulse waves with 12.5/25/50 % duty, the
// stepped triangle, LFSR noise drums - but every note goes through its own
// low-pass (with an optional filter envelope), so the result reads as a warm
// analogue synth rather than an 8-bit game. ADSR envelopes always start and
// end at zero (no clicks); delayed vibrato, a tempo-synced echo and a small
// room. Music ducks under speech with a hold (no pumping between sentences)
// and a presence dip; the master bus never exceeds -1.2 dBFS.

import { waveTable } from './waves.js';
import { parseTune, flatten, songSeconds, KIND_GAIN, noteCutoff } from './tune.js';
import { estimateLoudness } from './loudness.js';

export const CEILING = 0.87; // master peak limit, -1.2 dBFS
// Peak control only: voices and tunes sit at -16 LUFS with their peaks around
// -5..-3 dBFS, so the compressor (a limiter here) leaves normal material alone.
const COMP = { threshold: -5, knee: 3, ratio: 12 };
// WebAudio's DynamicsCompressor adds make-up gain, (1 / gain at 0 dBFS) ^ 0.6;
// with its soft knee that is 2.2 dB for these settings (measured in the lab:
// the mixer passes a -30 dBFS tone at 0.00 dB).
export const COMP_MAKEUP = 10 ** (2.2 / 20);
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const dbToGain = (db) => 10 ** (db / 20);

/**
 * Ducking under speech. Depths are in dB below the music's own level:
 * programme beds on audio.musicBus -20, tunes -18 (opens, cues), a looping
 * tune (a commercial's music bed under its voice-over) -14; a tune may set
 * its own `duck`. Attack/release are time constants (about 120 ms / 500 ms to
 * settle); the duck is held 0.7 s after the last word so the 300 ms gaps
 * between sentences and segments never let the music swell back. While
 * anyone speaks a -6 dB dip around 2.8 kHz clears the consonants.
 */
export const DUCK = Object.freeze({ attack: 0.04, release: 0.17, hold: 0.7, dipDb: -6, dipHz: 2800, bedsDb: -20, tunesDb: -18, loopDb: -14 });
export const DUCK_LEVEL = dbToGain(DUCK.tunesDb); // kept for old imports

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

// Linear up to 0.7 (-3.1 dBFS), then a smooth knee that can never pass CEILING.
function clipCurve(n = 2048) {
  const c = new Float32Array(n);
  const knee = 0.7;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + (CEILING - knee) * Math.tanh((a - knee) / (CEILING - knee));
    c[i] = Math.sign(x) * Math.min(y, CEILING);
  }
  return c;
}

function presenceDip(ctx) {
  const f = ctx.createBiquadFilter();
  f.type = 'peaking';
  f.frequency.value = DUCK.dipHz;
  f.Q.value = 0.7;
  f.gain.value = 0;
  return f;
}

/**
 * The channel's mixer:
 *   tunes (each player ducks itself) -> tunesDip -> master;  room returns -> tunes
 *   music (programme beds, audio.musicBus) -> duck -> bedsDip -> master
 *   speech (blips/murmur, recorded voices) -> master
 *   master -> compressor -> soft clipper -> volume (out) -> mute -> speakers
 * `raw` skips the dynamics (the lab's envelope probe). `ducker` (a Ducker)
 * drives the bed duck and both presence dips.
 */
export function buildBuses(ctx, { volume = 0.8, raw = false, ducker = null, bedsDb = DUCK.bedsDb } = {}) {
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
  const tunesDip = presenceDip(ctx);
  tunesDip.connect(master);
  const tunes = ctx.createGain();
  tunes.connect(tunesDip);
  const bedsDip = presenceDip(ctx);
  bedsDip.connect(master);
  const duck = ctx.createGain();
  duck.connect(bedsDip);
  const music = ctx.createGain();
  music.connect(duck);
  const reverb = ctx.createConvolver();
  reverb.normalize = false;
  reverb.buffer = b.ir;
  const dark = ctx.createBiquadFilter();
  dark.type = 'lowpass';
  dark.frequency.value = 3200;
  dark.Q.value = 0.5;
  reverb.connect(dark).connect(tunes);
  const speech = ctx.createGain();
  speech.connect(master);
  const buses = { ctx, master, tunes, tunesDip, music, duck, bedsDip, reverb, speech, out, mute, comp, raw, ducker, bedTarget: null };
  if (ducker) {
    const t = ctx.currentTime;
    buses.bedTarget = ducker.add({ param: duck.gain, on: dbToGain(bedsDb), off: 1 }, t);
    ducker.add({ param: tunesDip.gain, on: DUCK.dipDb, off: 0 }, t);
    ducker.add({ param: bedsDip.gain, on: DUCK.dipDb, off: 0 }, t);
  }
  return buses;
}

/**
 * Shared duck state for a context. `start(t)` when a voice becomes audible,
 * `end(t)` when it stops: the release waits DUCK.hold and is cancelled by
 * the next start, all on the audio clock (sample-accurate, offline too).
 * Targets are { param, on, off } (gain or dB values).
 */
export class Ducker {
  constructor() {
    this.speaking = false;
    this.releaseAt = -Infinity;
    this.targets = new Set();
  }

  add(target, t) {
    this.targets.add(target);
    const p = target.param;
    try {
      p.cancelScheduledValues(t);
      if (this.speaking) p.setValueAtTime(target.on, t);
      else if (t < this.releaseAt) {
        p.setValueAtTime(target.on, t);
        p.setTargetAtTime(target.off, this.releaseAt, DUCK.release);
      } else p.setValueAtTime(target.off, t);
    } catch { /* ignore */ }
    return target;
  }

  remove(target) {
    this.targets.delete(target);
  }

  // Change a target's ducked value (e.g. audio.musicDuckDb) and re-apply.
  retarget(target, on, t) {
    target.on = on;
    if (this.targets.has(target)) this.add(target, t);
  }

  start(t) {
    if (this.speaking) return;
    this.speaking = true;
    for (const x of this.targets) {
      try {
        x.param.cancelScheduledValues(t);
        x.param.setTargetAtTime(x.on, t, DUCK.attack);
      } catch { /* ignore */ }
    }
  }

  end(t, hold = DUCK.hold) {
    if (!this.speaking) return;
    this.speaking = false;
    this.releaseAt = t + hold;
    for (const x of this.targets) {
      try {
        x.param.setTargetAtTime(x.off, this.releaseAt, DUCK.release);
      } catch { /* ignore */ }
    }
  }

  /** Speech intervals [[from, to], ...] in seconds (offline renders). */
  apply(intervals) {
    for (const [a, b] of [...intervals].sort((x, y) => x[0] - y[0])) {
      this.start(a);
      this.end(b);
    }
  }
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

/** Duck depth (dB) a tune gets: its own `duck`, else by role. */
export function duckDbFor(song, { loop = false, duckDb } = {}) {
  if (Number.isFinite(Number(duckDb)) && duckDb !== null) return Math.max(-40, Math.min(0, Number(duckDb)));
  if (song?.duck != null) return song.duck;
  return loop ? DUCK.loopDb : DUCK.tunesDb;
}

/** Linear gain for a playTune volume: 0.5 is the reference, at most +1 dB above it. */
export const volumeGain = (volume) => Math.max(0, Math.min(dbToGain(1), (Number.isFinite(Number(volume)) ? Number(volume) : 0.5) / 0.5));

const LATE_OK = 0.35; // a note up to this late (s) still plays from now, shortened

/**
 * Plays parsed songs on a context. One instance per playTune() call; the
 * owner calls scheduleUntil() regularly (or once, offline). `start(when)`
 * may be in the past (a tune synced to a picture that already started):
 * notes already due play at once, shortened, and older ones are skipped.
 */
export class TunePlayer {
  constructor(ctx, buses, song, { volume = 0.5, loop = false, probe = false, normalise = true, duckDb } = {}) {
    this.ctx = ctx;
    this.song = song;
    this.loop = loop;
    this.probe = probe;
    this.bank = bank(ctx);
    this.events = flatten(song, 1);
    this.spb = 60 / song.bpm;
    this.passSec = songSeconds(song);
    this.loudness = normalise ? songLoudness(song) : { gain: 1, gainDb: 0, integrated: NaN };
    this.live = new Set();
    this.cursor = 0;
    this.pass = 0;
    this.t0 = null;
    this.done = false;
    this.stopped = false;
    this.hits = 0;
    this.buses = buses;
    // Graph: tracks -> panners -> out -> duck -> tunes bus, with echo inside
    // and the room send after the duck (so the reverb ducks too).
    this.out = ctx.createGain();
    this.out.gain.value = this.loudness.gain * volumeGain(volume);
    this.duckGain = ctx.createGain();
    this.out.connect(this.duckGain);
    this.duckGain.connect(buses.tunes ?? buses.music);
    this.nodes = [this.out, this.duckGain];
    this.duckTarget = null;
    if (buses.ducker && !probe) {
      this.duckTarget = buses.ducker.add({ param: this.duckGain.gain, on: dbToGain(duckDbFor(song, { loop, duckDb })), off: 1 }, ctx.currentTime);
    }
    if (!probe && song.room > 0) {
      const send = ctx.createGain();
      send.gain.value = song.room;
      this.duckGain.connect(send).connect(buses.reverb);
      this.nodes.push(send);
    }
    this.echoIn = null;
    if (!probe && song.echo.send > 0 && song.tracks.some((t) => t.echo > 0)) {
      const input = ctx.createGain();
      const delay = ctx.createDelay(2);
      delay.delayTime.value = Math.min(1.5, song.echo.beats * this.spb);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2400;
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
    const now = this.ctx.currentTime;
    for (let guard = 0; guard < 4000; guard++) {
      const ev = this.events[this.cursor];
      const when = this.t0 + (this.pass * this.song.beats + ev.at) * this.spb;
      if (when >= tEnd) return;
      this.schedule(ev, when, now);
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

  // On time, or late: a few ms late plays as is; a held note further behind
  // plays its remainder with a soft 30 ms fade-in; a late drum is dropped.
  schedule(ev, when, now) {
    const soon = now + 0.006;
    const late = soon - when;
    if (late <= 0) return this.play(ev, when);
    if (late < 0.03) return this.play(ev, soon);
    const isDrum = this.tracks[ev.track].track.kind === 'drums';
    const rest = ev.dur * this.spb - late;
    if (isDrum || late > LATE_OK || rest < 0.12) return undefined;
    return this.play(ev, soon, rest / this.spb, 0.03);
  }

  stop(when = this.ctx.currentTime, fade = this.song.fadeOut) {
    if (this.stopped) return;
    this.stopped = true;
    // A fading tail is no longer ducked: the open's last chord rings over the
    // first words of the studio shot as it fades.
    if (this.duckTarget) this.buses.ducker?.remove(this.duckTarget);
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

  play(ev, when, beats = ev.dur, fadeIn = 0) {
    const { track, dest } = this.tracks[ev.track];
    const dur = beats * this.spb;
    if (track.kind === 'drums') this.drum(ev.e.drum, KIND_GAIN.drums * track.gain * ev.e.vel, when, dur, dest);
    else this.note(track, ev.e, when, dur, dest, fadeIn);
  }

  note(track, e, when, dur, dest, fadeIn = 0) {
    const ctx = this.ctx;
    const inst = track.inst;
    const gate = Math.max(0.03, dur * inst.legato);
    const voices = track.arp > 0 && e.midis.length > 1 ? [e.midis] : e.midis.map((m) => [m]);
    const peak = (KIND_GAIN[track.kind] * track.gain * inst.gain * e.vel) / Math.sqrt(voices.length);
    const attack = Math.max(inst.a, fadeIn);
    for (const notes of voices) {
      const g = ctx.createGain();
      let src;
      const extra = [g];
      let head = g;
      if (this.probe) {
        src = ctx.createConstantSource();
      } else {
        src = ctx.createOscillator();
        src.setPeriodicWave(this.bank.wave(inst.wave));
        if (notes.length > 1) {
          // Chord as one voice cycling through the notes (only when asked).
          let k = 0;
          for (let t = when; t < when + gate + inst.r; t += track.arp) src.frequency.setValueAtTime(hz(notes[k++ % notes.length]), t);
        } else src.frequency.setValueAtTime(hz(notes[0]), when);
        if (inst.scoop) {
          src.detune.setValueAtTime(-inst.scoop, when);
          src.detune.linearRampToValueAtTime(0, when + 0.07);
        }
        const vib = inst.vib;
        if (vib && gate > vib[2] + 0.1) {
          const lfo = ctx.createOscillator();
          const depth = ctx.createGain();
          lfo.frequency.value = vib[1];
          depth.gain.value = 0;
          depth.gain.setValueAtTime(0, when);
          depth.gain.setValueAtTime(0, when + vib[2]);
          depth.gain.linearRampToValueAtTime(vib[0], when + vib[2] + 0.25);
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
        // Each note through its own low-pass; the filter envelope opens it
        // at the attack and lets it close (brass bite, pluck, bell).
        const cut = noteCutoff(inst, Math.max(...notes));
        if (cut < 19000) {
          const f = ctx.createBiquadFilter();
          f.type = 'lowpass';
          f.Q.value = inst.q ?? 0;
          if (inst.fenv) {
            f.frequency.setValueAtTime(Math.min(18000, cut * inst.fenv[0]), when);
            f.frequency.setTargetAtTime(cut, when + attack, inst.fenv[1] / 3);
          } else f.frequency.value = cut;
          f.connect(g);
          head = f;
          extra.push(f);
        }
      }
      // ADSR, always from zero and back to zero (see envDecay about the 0).
      const p = g.gain;
      p.value = 0;
      p.setValueAtTime(0, when);
      let level;
      if (gate <= attack) {
        level = peak * (gate / attack);
        p.linearRampToValueAtTime(level, when + gate);
      } else {
        p.linearRampToValueAtTime(peak, when + attack);
        const tau = Math.max(0.002, inst.d / 3);
        p.setTargetAtTime(peak * inst.s, when + attack, tau);
        level = peak * (inst.s + (1 - inst.s) * Math.exp(-(gate - attack) / tau));
        p.setValueAtTime(level, when + gate);
      }
      p.linearRampToValueAtTime(0, when + gate + inst.r);
      src.connect(head);
      g.connect(dest);
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
    const chain = (src, filters, g) => {
      let n = src;
      for (const f of filters) n = n.connect(f);
      n.connect(g).connect(dest);
    };
    const voice = (src, filter, peak, attack, tau, end) => {
      const g = ctx.createGain();
      envDecay(g.gain, when, peak, attack, tau, when + end);
      const filters = !filter ? [] : Array.isArray(filter) ? filter : [filter];
      chain(src, filters, g);
      if (!src.started) src.start?.(when);
      src.stop(when + end + 0.02);
      this.track(src, g, ...filters);
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
        voice(tone('sine', 140, 46, 0.11), null, level, 0.002, 0.07, 0.32);
        voice(noise(false, 1), [filt('highpass', 1600), filt('lowpass', 5000)], level * 0.18, 0.001, 0.004, 0.02);
        break;
      case 's':
        voice(noise(false, 1), [filt('bandpass', 1800, 0.9), filt('lowpass', 6000)], level * 0.8, 0.001, 0.05, 0.22);
        voice(tone('tri', 190, 150, 0.08), null, level * 0.45, 0.001, 0.035, 0.12);
        break;
      case 'h':
        // Band-limited (5-9 kHz) and soft: a brushed hat, not a sizzle.
        voice(noise(true, 1.6), [filt('highpass', 5000), filt('lowpass', 9000)], level * 0.36, 0.0015, 0.014, 0.06);
        break;
      case 'o':
        voice(noise(true, 1.6), [filt('highpass', 4800), filt('lowpass', 8500)], level * 0.32, 0.003, 0.09, 0.36);
        break;
      case 'c':
        voice(noise(false, 1), [filt('highpass', 3800), filt('lowpass', 9000)], level * 0.45, 0.003, 0.32, 1.5);
        voice(noise(true, 1.9), [filt('highpass', 5000), filt('lowpass', 9500)], level * 0.2, 0.003, 0.25, 1.2);
        break;
      case 't':
        voice(tone('tri', 210, 118, 0.2), filt('lowpass', 1600), level * 0.9, 0.002, 0.09, 0.36);
        break;
      case 'f':
        // Felt thump: a soft low sine with a dark breath of noise on top.
        voice(tone('sine', 86, 48, 0.16), null, level, 0.008, 0.12, 0.55);
        voice(noise(false, 1), filt('lowpass', 420, 0.5), level * 0.22, 0.004, 0.03, 0.12);
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
        voice(noise(true, 2), [filt('bandpass', 2600, 2), filt('lowpass', 4000)], level * 0.5, 0.001, 0.006, 0.03);
        break;
      case 'w':
      case 'a': {
        // W: band-passed hiss sweeping up (kept for old tunes). A: a soft,
        // low-passed air swell with no sweep - the network's transitions.
        const len = Math.max(0.15, dur);
        const air = kind === 'a';
        const src = noise(false, 1);
        const f = filt(air ? 'lowpass' : 'bandpass', air ? 700 : 300, air ? 0.3 : 1.4);
        if (!this.probe) {
          f.frequency.setValueAtTime(air ? 700 : 300, when);
          f.frequency.exponentialRampToValueAtTime(air ? 1500 : 3400, when + len);
        }
        const g = ctx.createGain();
        g.gain.value = 0;
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(level * (air ? 0.7 : 0.9), when + len * (air ? 0.75 : 0.6));
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

// ----------------------------------------------------------------- murmur

// Rough vowel formants (Hz) per mouth shape for an adult voice; the voice's
// `formant` factor shifts them (female voices sit ~15 % higher).
const FORMANTS = {
  AH: [730, 1150], OH: [520, 900], OO: [340, 820], WQ: [360, 860], EE: [330, 2000], L: [380, 1300],
  TH: [420, 1500], S: [420, 1600], FV: [420, 1400], MBP: [280, 900], rest: [420, 1200],
};
const SEG_AMP = { MBP: 0.14, L: 0.32, TH: 0.1, S: 0.08, FV: 0.08, rest: 0.18 };

/**
 * One sentence of the "blips" voice: a low, muffled murmur, like a newsreader
 * heard through a studio wall - never pitched beeps. A soft pulse at a fixed
 * pitch per presenter (gentle declination, no random jitter, no rising
 * question tail) through two vowel formants that follow the same mouth
 * timeline as the lips, then a low-pass. `tl` comes from
 * visemes.buildTimeline(); `t0` is the context time of the sentence start.
 * Returns a function that cuts it short.
 */
export function scheduleMurmur(ctx, dest, voice, tl, t0) {
  const segs = tl?.segs ?? [];
  if (!segs.length) return () => {};
  const total = tl.total / 1000;
  const osc = ctx.createOscillator();
  osc.setPeriodicWave(bank(ctx).wave(voice.wave ?? 'pulse25'));
  const f1 = ctx.createBiquadFilter();
  f1.type = 'bandpass';
  f1.Q.value = 3.2;
  const f2 = ctx.createBiquadFilter();
  f2.type = 'bandpass';
  f2.Q.value = 4.5;
  const g2 = ctx.createGain();
  g2.gain.value = 0.5;
  const amp = ctx.createGain();
  amp.gain.value = 0;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = voice.cut ?? 2400;
  lp.Q.value = -3;
  osc.connect(f1).connect(amp);
  osc.connect(f2).connect(g2).connect(amp);
  amp.connect(lp).connect(dest);
  const k = voice.formant ?? 1;
  const base = voice.base ?? 120;
  const decl = voice.monotone ? 0 : 0.07;
  osc.frequency.setValueAtTime(base, t0);
  if (decl) osc.frequency.linearRampToValueAtTime(base * (1 - decl), t0 + total);
  const a = amp.gain;
  a.setValueAtTime(0, t0 - 0.01);
  const [F1, F2] = FORMANTS[segs[0].v] ?? FORMANTS.rest;
  f1.frequency.setValueAtTime(F1 * k, t0);
  f2.frequency.setValueAtTime(F2 * k, t0);
  for (const s of segs) {
    const t = t0 + s.t0 / 1000;
    const [fa, fb] = FORMANTS[s.v] ?? FORMANTS.rest;
    f1.frequency.setTargetAtTime(fa * k, t, 0.02);
    f2.frequency.setTargetAtTime(fb * k, t, 0.025);
    const level = s.k === 'pause' ? 0 : s.k === 'v' ? 0.3 + 0.7 * Math.min(1, s.o / 0.8) : (SEG_AMP[s.v] ?? 0.12);
    a.setTargetAtTime(level * voice.gain, t, s.k === 'v' ? 0.018 : 0.025);
  }
  a.setTargetAtTime(0, t0 + total, 0.03);
  osc.start(t0 - 0.01);
  osc.stop(t0 + total + 0.25);
  osc.onended = () => {
    try {
      osc.disconnect();
      f1.disconnect();
      f2.disconnect();
      g2.disconnect();
      amp.disconnect();
      lp.disconnect();
    } catch { /* ignore */ }
  };
  return () => {
    try {
      const now = ctx.currentTime;
      a.cancelScheduledValues(now);
      a.setTargetAtTime(0, now, 0.012);
      osc.stop(now + 0.1);
    } catch { /* already stopped */ }
  };
}

// ---------------------------------------------------------------- offline

// Parsed songs and their loudness, cached per tune object (ads, opens and
// cues are module constants, so each is parsed and levelled once).
const songs = new WeakMap();
const loudnessOf = new WeakMap();
export function asSong(tune) {
  if (tune && Array.isArray(tune.tracks) && tune.tracks[0]?.events) return tune;
  if (!tune || typeof tune !== 'object') return parseTune(tune);
  let song = songs.get(tune);
  if (song === undefined) {
    song = parseTune(tune);
    songs.set(tune, song);
  }
  return song;
}
function songLoudness(song) {
  let l = loudnessOf.get(song);
  if (!l) {
    l = estimateLoudness(song);
    loudnessOf.set(song, l);
  }
  return l;
}

/**
 * Render a tune offline with the channel's own mixer.
 * opts: seconds, sampleRate (48000), volume (0.5), loop, duck: [[from, to], ...]
 * (speech intervals in seconds, with the live hold and time constants),
 * duckDb, startAt (s; may be negative = synced to a picture that started
 * earlier), probe (envelopes only, no dynamics), raw (no dynamics),
 * normalise, stopAt.
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
  const ducker = opts.probe ? null : new Ducker();
  const buses = buildBuses(ctx, { volume: 1, raw: Boolean(opts.probe || opts.raw), ducker });
  const player = new TunePlayer(ctx, buses, song, { volume: opts.volume ?? 0.5, loop, probe: opts.probe, normalise: opts.normalise !== false, duckDb: opts.duckDb });
  player.start(opts.startAt ?? 0.05);
  player.scheduleUntil(seconds);
  if (ducker && opts.duck) ducker.apply(opts.duck);
  if (opts.stopAt) player.stop(opts.stopAt);
  const buffer = await ctx.startRendering();
  return { buffer, song, loudness: player.loudness };
}
