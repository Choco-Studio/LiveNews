// Chip waveforms as Fourier series, shared by the synth (which turns them into
// PeriodicWaves) and the loudness model (which needs their harmonic energy).
// Pure math, no WebAudio: NES-style pulses with 12.5 / 25 / 50 % duty, the
// NES 4-bit stepped triangle, a sawtooth, a smooth triangle and a sine.
// Every table is cheap to build (a few ms): the first note of a programme
// must never stall the main thread while an open is animating.

export const HARMONICS = 256; // enough for a full spectrum down to ~80 Hz

const cache = new Map();

// Exact Fourier coefficients of a staircase wave: `steps[j]` holds from phase
// j/n to (j+1)/n. Integrating each flat step in closed form costs n x HARMONICS
// trig calls instead of a numerical transform.
function staircase(steps) {
  const n = steps.length;
  const real = new Float32Array(HARMONICS + 1);
  const imag = new Float32Array(HARMONICS + 1);
  for (let k = 1; k <= HARMONICS; k++) {
    let re = 0;
    let im = 0;
    const w = (2 * Math.PI * k) / n;
    let s0 = 0;
    let c0 = 1;
    for (let j = 0; j < n; j++) {
      const s1 = Math.sin(w * (j + 1));
      const c1 = Math.cos(w * (j + 1));
      re += steps[j] * (s1 - s0);
      im += steps[j] * (c0 - c1);
      s0 = s1;
      c0 = c1;
    }
    real[k] = re / (Math.PI * k);
    imag[k] = im / (Math.PI * k);
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
const NES_TRI_STEPS = Array.from({ length: 32 }, (_, step) => ((step < 16 ? 15 - step : step - 16) - 7.5) / 7.5);

function build(kind) {
  switch (kind) {
    case 'pulse12': return pulse(0.125);
    case 'pulse25': return pulse(0.25);
    case 'pulse50': return pulse(0.5);
    case 'tri': return staircase(NES_TRI_STEPS);
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

// Peak of the summed series over one period, sampled at M points. cos(k p)
// and sin(k p) come from a rotating phasor (complex multiplication), so the
// whole search is M x HARMONICS multiply-adds with no trig in the inner loop.
function seriesPeak(real, imag, M = 2048) {
  let peak = 0;
  const n = real.length;
  for (let m = 0; m < M; m++) {
    const p = (2 * Math.PI * m) / M;
    const cr = Math.cos(p);
    const ci = Math.sin(p);
    let c = cr;
    let s = ci;
    let v = 0;
    for (let k = 1; k < n; k++) {
      v += real[k] * c + imag[k] * s;
      const c2 = c * cr - s * ci;
      s = s * cr + c * ci;
      c = c2;
    }
    if (Math.abs(v) > peak) peak = Math.abs(v);
  }
  return peak;
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
  const peak = key === 'sine' ? 1 : seriesPeak(real, imag);
  const amp2 = new Float32Array(real.length); // squared amplitude of each harmonic after normalisation
  for (let k = 1; k < real.length; k++) amp2[k] = (real[k] * real[k] + imag[k] * imag[k]) / (peak * peak);
  t = { kind: key, real, imag, peak, amp2 };
  cache.set(key, t);
  return t;
}

/**
 * Mean square of the normalised wave at `freq`, each harmonic weighted by
 * `weight(f)` (a power gain such as K-weighting times a filter response);
 * harmonics above Nyquist are dropped as the browser's band-limited tables do.
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
