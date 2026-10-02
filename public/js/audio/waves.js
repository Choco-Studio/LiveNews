// Chip waveforms as Fourier series, shared by the synth (which turns them into
// PeriodicWaves) and the loudness model (which needs their harmonic energy).
// Pure math, no WebAudio: NES-style pulses with 12.5 / 25 / 50 % duty, the
// NES 4-bit stepped triangle, a sawtooth, a smooth triangle and a sine.

export const HARMONICS = 256; // enough for a full spectrum down to ~80 Hz

const cache = new Map();

// Fourier coefficients of a periodic signal given by `fn(phase 0..1)`,
// computed numerically (M points), as PeriodicWave real/imag arrays.
function series(fn, n = HARMONICS, M = 8192) {
  const x = new Float64Array(M);
  for (let m = 0; m < M; m++) x[m] = fn((m + 0.5) / M);
  const real = new Float32Array(n + 1);
  const imag = new Float32Array(n + 1);
  for (let k = 1; k <= n; k++) {
    let re = 0;
    let im = 0;
    const w = (2 * Math.PI * k) / M;
    for (let m = 0; m < M; m++) {
      re += x[m] * Math.cos(w * m);
      im += x[m] * Math.sin(w * m);
    }
    real[k] = (2 * re) / M;
    imag[k] = (2 * im) / M;
  }
  return { real, imag };
}

function pulse(duty) {
  const real = new Float32Array(HARMONICS + 1);
  const imag = new Float32Array(HARMONICS + 1);
  for (let k = 1; k <= HARMONICS; k++) {
    real[k] = Math.sin(2 * Math.PI * k * duty) / (Math.PI * k);
    imag[k] = (1 - Math.cos(2 * Math.PI * k * duty)) / (Math.PI * k);
  }
  return { real, imag };
}

// The NES triangle channel steps through 15..0..15 (32 steps): a soft tone
// with a faint buzz that reads as "chip" rather than "flute".
const NES_TRI = (p) => {
  const step = Math.floor(p * 32) % 32;
  const v = step < 16 ? 15 - step : step - 16;
  return (v - 7.5) / 7.5;
};

function build(kind) {
  switch (kind) {
    case 'pulse12': return pulse(0.125);
    case 'pulse25': return pulse(0.25);
    case 'pulse50': return pulse(0.5);
    case 'tri': return series(NES_TRI);
    case 'triangle': {
      const real = new Float32Array(HARMONICS + 1);
      const imag = new Float32Array(HARMONICS + 1);
      for (let k = 1; k <= HARMONICS; k += 2) imag[k] = (8 / (Math.PI * Math.PI * k * k)) * (((k - 1) / 2) % 2 ? -1 : 1);
      return { real, imag };
    }
    case 'saw': {
      const real = new Float32Array(HARMONICS + 1);
      const imag = new Float32Array(HARMONICS + 1);
      for (let k = 1; k <= HARMONICS; k++) imag[k] = ((k % 2 ? 1 : -1) * 2) / (Math.PI * k);
      return { real, imag };
    }
    default: { // sine
      const real = new Float32Array(2);
      const imag = new Float32Array(2);
      imag[1] = 1;
      return { real, imag };
    }
  }
}

export const WAVE_KINDS = ['pulse12', 'pulse25', 'pulse50', 'tri', 'triangle', 'saw', 'sine'];

/**
 * Coefficients plus the peak of the summed waveform (WebAudio normalises a
 * PeriodicWave to peak 1, so the loudness model divides by it too).
 */
export function waveTable(kind) {
  const key = WAVE_KINDS.includes(kind) ? kind : 'sine';
  let t = cache.get(key);
  if (t) return t;
  const { real, imag } = build(key);
  let peak = 0;
  const M = 4096;
  for (let m = 0; m < M; m++) {
    let v = 0;
    const p = (2 * Math.PI * m) / M;
    for (let k = 1; k < real.length; k++) if (real[k] || imag[k]) v += real[k] * Math.cos(k * p) + imag[k] * Math.sin(k * p);
    peak = Math.max(peak, Math.abs(v));
  }
  const amp2 = new Float32Array(real.length); // squared amplitude of each harmonic after normalisation
  for (let k = 1; k < real.length; k++) amp2[k] = (real[k] * real[k] + imag[k] * imag[k]) / (peak * peak);
  t = { kind: key, real, imag, peak, amp2 };
  cache.set(key, t);
  return t;
}

/**
 * Mean square of the normalised wave at `freq`, each harmonic weighted by
 * `weight(f)` (a power gain such as K-weighting); harmonics above Nyquist are
 * dropped as the browser's band-limited tables do.
 */
export function waveEnergy(kind, freq, weight = () => 1, nyquist = 24000) {
  const { amp2 } = waveTable(kind);
  let e = 0;
  for (let k = 1; k < amp2.length; k++) {
    const f = k * freq;
    if (f >= nyquist) break;
    if (amp2[k]) e += (amp2[k] / 2) * weight(f);
  }
  return e;
}
