"""ITU-R BS.1770-4 loudness and true peak in plain numpy (no scipy).

The voice chain normalises every clip to the same programme loudness, so it
needs the same meter broadcast tools use: K-weighting, 400 ms blocks with 75 %
overlap, absolute gate at -70 LUFS and relative gate at -10 LU. IIR filters are
applied through their exact frequency response on a zero-padded FFT, which is
equivalent to running the recursion when the padding outlasts the impulse
response (these filters ring for a few tens of milliseconds).
The test suite checks the result against ffmpeg's ebur128 filter.
"""

import math

import numpy as np


def next_fast_len(n):
    """Smallest 2^a * 3^b * 5^c >= n, a size numpy's FFT handles quickly."""
    best = 1 << max(0, (int(n) - 1).bit_length())
    f5 = 1
    while f5 < best:
        f35 = f5
        while f35 < best:
            f = f35
            while f < n:
                f *= 2
            best = min(best, f)
            f35 *= 3
        f5 *= 5
    return best


def biquad_response(coeffs, freqs, sr):
    """Complex response of a cascade of biquads [(b0,b1,b2,a0,a1,a2)] at freqs (Hz)."""
    z1 = np.exp(-2j * np.pi * np.asarray(freqs) / sr)
    z2 = z1 * z1
    h = np.ones_like(z1)
    for b0, b1, b2, a0, a1, a2 in coeffs:
        h *= (b0 + b1 * z1 + b2 * z2) / (a0 + a1 * z1 + a2 * z2)
    return h


def fft_filter(x, response, sr, pad=0.25, keep_tail=False):
    """Filter x with a frequency response given as fn(freqs) -> complex array."""
    x = np.asarray(x, dtype=np.float64)
    extra = int(pad * sr)
    n = next_fast_len(len(x) + extra)
    spec = np.fft.rfft(x, n)
    spec *= response(np.fft.rfftfreq(n, 1.0 / sr))
    y = np.fft.irfft(spec, n)
    return y[:len(x) + extra] if keep_tail else y[:len(x)]


def k_weighting(sr):
    """BS.1770 pre-filter (high shelf) and RLB high-pass for any sample rate."""
    f0, gain, q = 1681.974450955533, 3.999843853973347, 0.7071752369554196
    k = math.tan(math.pi * f0 / sr)
    vh = 10 ** (gain / 20)
    vb = vh ** 0.4996667741545416
    a0 = 1 + k / q + k * k
    shelf = ((vh + vb * k / q + k * k) / a0, 2 * (k * k - vh) / a0, (vh - vb * k / q + k * k) / a0,
             1.0, 2 * (k * k - 1) / a0, (1 - k / q + k * k) / a0)
    f0, q = 38.13547087602444, 0.5003270373238773
    k = math.tan(math.pi * f0 / sr)
    a0 = 1 + k / q + k * k
    hp = (1.0, -2.0, 1.0, 1.0, 2 * (k * k - 1) / a0, (1 - k / q + k * k) / a0)
    return [shelf, hp]


def k_weighted(x, sr):
    coeffs = k_weighting(sr)
    return fft_filter(x, lambda f: biquad_response(coeffs, f, sr), sr, pad=0.2)


def block_powers(y, sr, block=0.4, overlap=0.75):
    """Mean square of each gating block of an already K-weighted signal."""
    size = int(round(block * sr))
    step = max(1, int(round(size * (1 - overlap))))
    if len(y) < size:
        return np.array([])
    c = np.concatenate([[0.0], np.cumsum(y * y)])
    starts = np.arange(0, len(y) - size + 1, step)
    return (c[starts + size] - c[starts]) / size


def integrated_loudness(x, sr):
    """Integrated loudness in LUFS (gated). Short clips fall back to ungated."""
    y = k_weighted(x, sr)
    z = block_powers(y, sr)
    if len(z) == 0:
        ms = float(np.mean(y * y)) if len(y) else 0.0
        return -0.691 + 10 * math.log10(ms) if ms > 0 else -math.inf
    with np.errstate(divide='ignore'):
        lj = -0.691 + 10 * np.log10(np.maximum(z, 1e-20))
    gated = z[lj > -70]
    if len(gated) == 0:
        return -math.inf
    rel = -0.691 + 10 * math.log10(float(np.mean(gated))) - 10
    final = z[(lj > -70) & (lj > rel)]
    if len(final) == 0:
        return -math.inf
    return -0.691 + 10 * math.log10(float(np.mean(final)))


def oversample(x, factor=4):
    """Band-limited interpolation by an integer factor (FFT, ideal sinc)."""
    x = np.asarray(x, dtype=np.float64)
    n = len(x)
    if n == 0:
        return x
    m = next_fast_len(n + 64)
    spec = np.fft.rfft(x, m)
    big = np.zeros(m * factor // 2 + 1, dtype=complex)
    big[:len(spec)] = spec
    return np.fft.irfft(big, m * factor)[:n * factor] * factor


def true_peak(x, factor=4):
    """True peak in dBTP (4x oversampled, as BS.1770 asks for 48 kHz and up)."""
    if len(x) == 0:
        return -math.inf
    peak = float(np.max(np.abs(oversample(x, factor))))
    return 20 * math.log10(peak) if peak > 0 else -math.inf


def sample_peak(x):
    peak = float(np.max(np.abs(x))) if len(x) else 0.0
    return 20 * math.log10(peak) if peak > 0 else -math.inf
