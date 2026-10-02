"""Objective checks for voice clips (we cannot listen in CI, so we measure).

- stoi(): Short-Time Objective Intelligibility (Taal et al. 2011), 0..1, used
  to keep UNIT-8's robot effect intelligible against the clean voice.
- sibilance_db(): how far the loudest 's' sounds stick out above the speech.
- band_balance(): long-term level of low / presence / sibilance / air bands
  relative to the core speech band (consistency between presenters).
- clicks(): discontinuities that are much sharper than the local signal.
- edges(): first/last samples and level in the first/last 3 ms.
- f0_median(), speech_rate(): rough pitch and speaking rate for presets.
"""

import math

import numpy as np

from dsp import frame_rms_db
from loudness import next_fast_len


def resample(x, sr_from, sr_to):
    """FFT resampling (band-limited); fine for analysis, not for delivery."""
    if sr_from == sr_to:
        return np.asarray(x, dtype=np.float64)
    n = len(x)
    m = int(round(n * sr_to / sr_from))
    spec = np.fft.rfft(x)
    out = np.zeros(m // 2 + 1, dtype=complex)
    k = min(len(spec), len(out))
    out[:k] = spec[:k]
    return np.fft.irfft(out, m) * (m / n)


def _third_octave_matrix(sr, n_fft, num_bands=15, min_freq=150):
    f = np.linspace(0, sr, n_fft + 1)[:n_fft // 2 + 1]
    k = np.arange(num_bands)
    cf = 2 ** (k / 3) * min_freq
    lo = min_freq * 2 ** ((2 * k - 1) / 6)
    hi = min_freq * 2 ** ((2 * k + 1) / 6)
    obm = np.zeros((num_bands, len(f)))
    for i in range(num_bands):
        a = np.argmin((f - lo[i]) ** 2)
        b = np.argmin((f - hi[i]) ** 2)
        obm[i, a:b] = 1
    return obm, cf


def _frames(x, size, hop):
    n = 1 + max(0, (len(x) - size) // hop)
    idx = np.arange(size)[None, :] + hop * np.arange(n)[:, None]
    return x[idx]


def _remove_silent(x, y, dyn_range=40, size=256, hop=128):
    win = np.hanning(size + 2)[1:-1]
    fx = _frames(x, size, hop) * win
    fy = _frames(y, size, hop) * win
    energy = 20 * np.log10(np.linalg.norm(fx, axis=1) + 1e-12)
    keep = energy > energy.max() - dyn_range
    fx, fy = fx[keep], fy[keep]
    n = (len(fx) - 1) * hop + size
    xs, ys = np.zeros(n), np.zeros(n)
    for i in range(len(fx)):
        xs[i * hop:i * hop + size] += fx[i]
        ys[i * hop:i * hop + size] += fy[i]
    return xs, ys


def stoi(clean, degraded, sr):
    """STOI between two time-aligned signals of (about) the same length."""
    fs, n_fft, frame, hop, seg, beta = 10000, 512, 256, 128, 30, -15
    n = min(len(clean), len(degraded))
    x = resample(np.asarray(clean[:n], dtype=float), sr, fs)
    y = resample(np.asarray(degraded[:n], dtype=float), sr, fs)
    x, y = _remove_silent(x, y)
    win = np.hanning(frame + 2)[1:-1]
    X = np.abs(np.fft.rfft(_frames(x, frame, hop) * win, n_fft)) ** 2
    Y = np.abs(np.fft.rfft(_frames(y, frame, hop) * win, n_fft)) ** 2
    obm, _ = _third_octave_matrix(fs, n_fft)
    tx = np.sqrt(X @ obm.T).T  # bands x frames
    ty = np.sqrt(Y @ obm.T).T
    if tx.shape[1] < seg:
        return float('nan')
    clip = 10 ** (-beta / 20)
    scores = []
    for m in range(seg, tx.shape[1] + 1):
        xs, ys = tx[:, m - seg:m], ty[:, m - seg:m]
        alpha = np.linalg.norm(xs, axis=1, keepdims=True) / (np.linalg.norm(ys, axis=1, keepdims=True) + 1e-12)
        yc = np.minimum(ys * alpha, xs * (1 + clip))
        xc = xs - xs.mean(axis=1, keepdims=True)
        yc = yc - yc.mean(axis=1, keepdims=True)
        num = (xc * yc).sum(axis=1)
        den = np.linalg.norm(xc, axis=1) * np.linalg.norm(yc, axis=1) + 1e-12
        scores.append(np.mean(num / den))
    return float(np.mean(scores))


def _band_signal_db(x, sr, lo, hi, hop=0.005, win=0.01):
    n = next_fast_len(len(x))
    spec = np.fft.rfft(x, n)
    f = np.fft.rfftfreq(n, 1 / sr)
    band = np.fft.irfft(spec * ((f >= lo) & (f < hi)), n)[:len(x)]
    return frame_rms_db(band, sr, hop=hop, win=win)[1]


def sibilance_db(x, sr):
    """99th percentile of 5-11 kHz short-term level minus median speech level (dB)."""
    full = frame_rms_db(x, sr, hop=0.005, win=0.01)[1]
    act = full > full.max() - 30
    hi = _band_signal_db(x, sr, 5000, 11000)
    return float(np.percentile(hi[act], 99) - np.median(full[act]))


def band_balance(x, sr):
    """Long-term band levels (dB) relative to the 300-3000 Hz speech core."""
    n = 2048
    fr = _frames(np.asarray(x, float), n, n // 2) * np.hanning(n)
    lv = 10 * np.log10((fr ** 2).mean(axis=1) + 1e-12)
    fr = fr[lv > lv.max() - 35]
    psd = (np.abs(np.fft.rfft(fr, axis=1)) ** 2).mean(axis=0)
    f = np.fft.rfftfreq(n, 1 / sr)

    def p(lo, hi):
        return psd[(f >= lo) & (f < hi)].sum() + 1e-20
    core = p(300, 3000)
    return {k: round(10 * math.log10(p(lo, hi) / core), 1) for k, (lo, hi) in {
        'sub_100': (20, 100), 'low_100_300': (100, 300), 'presence_2k_5k': (2000, 5000),
        'sib_5k_9k': (5000, 9000), 'air_9k_12k': (9000, 12000)}.items()}


def third_octave_ltas(x, sr, centres):
    """Long-term spectrum (dB) in 1/3-octave bands, relative to 300-3000 Hz."""
    n = 2048
    fr = _frames(np.asarray(x, float), n, n // 2) * np.hanning(n)
    lv = 10 * np.log10((fr ** 2).mean(axis=1) + 1e-12)
    fr = fr[lv > lv.max() - 35]
    psd = (np.abs(np.fft.rfft(fr, axis=1)) ** 2).mean(axis=0)
    f = np.fft.rfftfreq(n, 1 / sr)
    core = psd[(f >= 300) & (f < 3000)].sum()
    out = []
    for c in centres:
        lo, hi = c * 2 ** (-1 / 6), min(c * 2 ** (1 / 6), sr / 2)
        out.append(10 * math.log10(psd[(f >= lo) & (f < hi)].sum() / core + 1e-20))
    return np.array(out)


def clicks(x, sr, ratio=10.0):
    """Count samples whose 2nd difference exceeds `ratio` x the local RMS of it.

    Speech, even sibilants, changes smoothly at sample scale; a splice or a
    hard edit shows up as an isolated spike in the second difference.
    """
    x = np.asarray(x, dtype=float)
    d2 = np.abs(np.diff(x, 2))
    if len(d2) < 64:
        return 0
    w = int(0.01 * sr)
    c = np.concatenate([[0.0], np.cumsum(d2 ** 2)])
    idx = np.arange(len(d2))
    lo, hi = np.clip(idx - w, 0, len(d2)), np.clip(idx + w, 0, len(d2))
    local = np.sqrt((c[hi] - c[lo]) / np.maximum(1, hi - lo))
    floor = 1e-4  # ignore spikes in near-silence below -80 dBFS
    spikes = (d2 > ratio * local) & (d2 > floor)
    # One click spans a few samples; count events, not samples
    events = np.flatnonzero(spikes)
    if len(events) == 0:
        return 0
    return int(1 + np.sum(np.diff(events) > int(0.002 * sr)))


def edges(x, sr):
    n = max(1, int(0.003 * sr))
    head = np.asarray(x[:n], float)
    tail = np.asarray(x[-n:], float)

    def db(v):
        return round(20 * math.log10(max(1e-9, v)), 1)
    return {'first': db(abs(x[0])), 'last': db(abs(x[-1])),
            'head3ms': db(np.sqrt(np.mean(head ** 2))), 'tail3ms': db(np.sqrt(np.mean(tail ** 2)))}


def f0_median(x, sr):
    fl = int(0.04 * sr)
    hop = fl // 2
    res = []
    top = np.max(np.abs(x)) or 1.0
    for i in range(0, len(x) - fl, hop):
        fr = x[i:i + fl] * np.hanning(fl)
        if np.sqrt((fr ** 2).mean()) < 0.03 * top:
            continue
        ac = np.correlate(fr, fr, 'full')[fl - 1:]
        lo, hi = int(sr / 400), int(sr / 60)
        j = lo + int(np.argmax(ac[lo:hi]))
        if ac[j] > 0.45 * ac[0]:
            res.append(sr / j)
    return float(np.median(res)) if res else 0.0


def speech_rate(words, phrases):
    """Words per minute over the time actually spent speaking."""
    talk = sum(p['dur'] for p in phrases)
    return 60 * len(words) / talk if talk > 0 else 0.0
