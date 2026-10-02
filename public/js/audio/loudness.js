// Loudness: an ITU-R BS.1770 meter for rendered audio (the lab measures
// every tune with it) and a model that predicts a tune's loudness from its
// notes alone, so the player can level tunes from different authors to one
// target before the first note sounds. Pure math, no WebAudio.

import { waveEnergy } from './waves.js';
import { flatten, songSeconds, KIND_GAIN } from './tune.js';

export const TARGET_LUFS = -17; // channel music level for a tune played at volume 0.5
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

// ----------------------------------------------------------- K-weighting

// The two BS.1770 pre-filter stages designed for any sample rate (at 48 kHz
// this reproduces the published coefficients).
export function kFilters(fs = 48000) {
  const shelf = (() => {
    const f0 = 1681.974450955533;
    const G = 3.999843853973347;
    const Q = 0.7071752369554196;
    const K = Math.tan((Math.PI * f0) / fs);
    const Vh = 10 ** (G / 20);
    const Vb = Vh ** 0.4996667741545416;
    const a0 = 1 + K / Q + K * K;
    return {
      b: [(Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0],
      a: [1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0],
    };
  })();
  const hp = (() => {
    const f0 = 38.13547087602444;
    const Q = 0.5003270373238773;
    const K = Math.tan((Math.PI * f0) / fs);
    const a0 = 1 + K / Q + K * K;
    return { b: [1, -2, 1], a: [1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0] };
  })();
  return [shelf, hp];
}

// Power gain of the K filter at frequency f.
const K48 = kFilters(48000);
export function kWeight(f, fs = 48000) {
  const filters = fs === 48000 ? K48 : kFilters(fs);
  const w = (2 * Math.PI * f) / fs;
  let g = 1;
  for (const { b, a } of filters) {
    const num = (re, im) => re * re + im * im;
    const c1 = Math.cos(w);
    const s1 = Math.sin(w);
    const c2 = Math.cos(2 * w);
    const s2 = Math.sin(2 * w);
    const nb = num(b[0] + b[1] * c1 + b[2] * c2, -(b[1] * s1 + b[2] * s2));
    const na = num(a[0] + a[1] * c1 + a[2] * c2, -(a[1] * s1 + a[2] * s2));
    g *= nb / na;
  }
  return g;
}

function biquad(x, { b, a }) {
  const y = new Float32Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}

const lufs = (ms) => (ms > 0 ? -0.691 + 10 * Math.log10(ms) : -Infinity);

/**
 * BS.1770-4 measurement of channel data (Float32Arrays, L/R weight 1).
 * @returns {{ integrated, momentary: number[] (400 ms blocks every 100 ms), shortTerm: number[] (3 s every 100 ms), peak, peakDb }}
 */
export function measureLoudness(channels, fs = 48000) {
  const filters = kFilters(fs);
  const weighted = channels.map((ch) => filters.reduce((x, f) => biquad(x, f), ch));
  const hop = Math.round(fs * 0.1);
  const n = weighted[0]?.length ?? 0;
  // Mean square per 100 ms hop, summed over channels.
  const hops = Math.floor(n / hop);
  const hopMs = new Float64Array(hops);
  for (const ch of weighted) {
    for (let h = 0; h < hops; h++) {
      let s = 0;
      for (let i = h * hop; i < (h + 1) * hop; i++) s += ch[i] * ch[i];
      hopMs[h] += s / hop;
    }
  }
  const windowed = (len) => {
    const out = [];
    for (let h = 0; h + len <= hops; h++) {
      let s = 0;
      for (let k = 0; k < len; k++) s += hopMs[h + k];
      out.push(s / len);
    }
    return out;
  };
  const blocks = windowed(4);
  const above = blocks.filter((ms) => lufs(ms) > -70);
  let integrated = -Infinity;
  if (above.length) {
    const rel = lufs(above.reduce((a, b) => a + b, 0) / above.length) - 10;
    const gated = above.filter((ms) => lufs(ms) > rel);
    if (gated.length) integrated = lufs(gated.reduce((a, b) => a + b, 0) / gated.length);
  }
  let peak = 0;
  for (const ch of channels) for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
  return {
    integrated,
    momentary: blocks.map(lufs),
    shortTerm: windowed(30).map(lufs),
    peak,
    peakDb: peak > 0 ? 20 * Math.log10(peak) : -Infinity,
  };
}

// ----------------------------------------------------------- the model

// K-weighted energy of one drum hit at unit gain (measured offline in
// public/lab/audio.html with the synth's own drum voices).
export const DRUM_ENERGY = { k: 0.03, s: 0.012, h: 0.0009, o: 0.004, c: 0.03, t: 0.025, p: 0.01, x: 0.0004, w: 0.02 };

// Integral of the squared ADSR envelope over a note gated for `gate` seconds.
export function envelopeEnergy(inst, gate) {
  const a = Math.min(inst.a, gate);
  const lvlA = gate < inst.a ? gate / inst.a : 1;
  let e = (lvlA * lvlA * a) / 3;
  const T = Math.max(0, gate - inst.a);
  const tau = Math.max(1e-3, inst.d / 3);
  const S = inst.s;
  e += S * S * T + 2 * S * (1 - S) * tau * (1 - Math.exp(-T / tau)) + (1 - S) ** 2 * (tau / 2) * (1 - Math.exp((-2 * T) / tau));
  const lvl = gate < inst.a ? lvlA : S + (1 - S) * Math.exp(-T / tau);
  e += (lvl * lvl * inst.r) / 3;
  return e;
}

const energyCache = new Map();
function noteEnergy(wave, midi) {
  const key = `${wave}:${midi}`;
  let e = energyCache.get(key);
  if (e === undefined) {
    e = waveEnergy(wave, hz(midi), (f) => kWeight(f));
    energyCache.set(key, e);
  }
  return e;
}

/**
 * Predicted integrated loudness (LUFS) of one pass of a parsed song played
 * at gain 1, plus the gain that brings it to TARGET_LUFS. Note energy is
 * spread over 100 ms bins and gated like the real meter.
 */
export function estimateLoudness(song) {
  const secs = songSeconds(song);
  const spb = 60 / song.bpm;
  const bins = new Float64Array(Math.max(1, Math.ceil(secs / 0.1) + 4));
  const echoGain = (send) => (send * send * 0.7) / (1 - song.echo.feedback ** 2 * 0.7);
  const room = song.room * song.room * 0.5;
  const deposit = (t0, len, energy) => {
    // Energy spread evenly over the time the note is audible.
    const a = Math.max(0, Math.floor(t0 / 0.1));
    const b = Math.min(bins.length - 1, Math.floor((t0 + Math.max(0.05, len)) / 0.1));
    const per = energy / (b - a + 1);
    for (let i = a; i <= b; i++) bins[i] += per / 0.1;
  };
  for (const ev of flatten(song, 1)) {
    const track = song.tracks[ev.track];
    const t0 = ev.at * spb;
    const level = KIND_GAIN[track.kind] * track.gain * ev.e.vel;
    const extra = 1 + echoGain(track.echo * song.echo.send) + room;
    if (track.kind === 'drums') {
      const len = ev.e.drum === 'w' ? ev.dur * spb : 0.15;
      deposit(t0, len, level * level * (DRUM_ENERGY[ev.e.drum] ?? 0.01) * (ev.e.drum === 'w' ? len : 1) * extra);
      continue;
    }
    const inst = track.inst;
    const g = level * inst.gain;
    const gate = Math.max(0.03, ev.dur * spb * inst.legato);
    const env = envelopeEnergy(inst, gate);
    const midis = ev.e.midis;
    // A chord shares one note's energy (each voice at 1/sqrt(n)); an arpeggio is one voice.
    let w = 0;
    for (const m of midis) w += noteEnergy(inst.wave, m);
    w /= midis.length;
    deposit(t0, gate + inst.r, g * g * w * env * extra);
  }
  // The panner splits a mono voice equally (power) between L and R, so the
  // channel sum equals the mono energy.
  const blocks = [];
  for (let i = 0; i + 4 <= bins.length; i++) blocks.push((bins[i] + bins[i + 1] + bins[i + 2] + bins[i + 3]) / 4);
  const above = blocks.filter((ms) => lufs(ms) > -70);
  let integrated = -Infinity;
  if (above.length) {
    const rel = lufs(above.reduce((a, b) => a + b, 0) / above.length) - 10;
    const gated = above.filter((ms) => lufs(ms) > rel);
    integrated = lufs(gated.reduce((a, b) => a + b, 0) / Math.max(1, gated.length));
  }
  const gainDb = Number.isFinite(integrated) ? Math.max(-12, Math.min(12, TARGET_LUFS + song.trim - integrated)) : 0;
  return { integrated, gainDb, gain: 10 ** (gainDb / 20) };
}
