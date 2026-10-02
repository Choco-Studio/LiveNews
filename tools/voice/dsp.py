"""Broadcast voice processing for GLOBIT 24 (numpy only, offline, deterministic).

Raw Kokoro output is clean but uneven: loudness differs by ~10 LU between
voices, some voices clip, the female voices carry harsh 8-11 kHz sibilance,
some male voices rumble below 100 Hz, and clips end with a few hundred ms of
low-level junk. A presenter on a real channel goes through a processing chain
before air; this module is that chain, run once per clip:

  1. high-pass 70 Hz (4th order), per-voice tonal match, mud cut, presence, air
  2. optional character effect (UNIT-8's robot)
  3. de-esser (split-band, only the 5 kHz+ band is turned down, only on 's')
  4. gentle compressor (RMS, soft knee, ~2-4 dB on vowels)
  5. very short, low-level studio room (synthetic IR, -22 dB wet)
  6. loudness to -16 LUFS integrated, true-peak limiter at -2 dBTP so lossy
     encoding stays under -1.5 dBTP
  7. tail trim and raised-cosine fades at both edges (no clicks)

Every filter runs through an FFT (exact IIR responses on zero-padded spectra),
so a 20 s clip is processed in well under a second.
"""

import math

import numpy as np

from loudness import (biquad_response, fft_filter, integrated_loudness, next_fast_len,
                      oversample, true_peak)

# Tuned by ear-proxies (see measure.py): LUFS spread, true peak, sibilance
# index, spectral tilt and STOI for the robot. Change with care.
DEFAULTS = {
    'hp_hz': 70.0,
    'mud_hz': 290.0, 'mud_db': -1.5, 'mud_q': 1.0,
    'presence_hz': 3300.0, 'presence_db': 1.5, 'presence_q': 0.9,
    'air_hz': 9000.0, 'air_db': 1.5,
    'deess_from': 4800.0, 'deess_to': 6200.0, 'deess_rel_db': -9.0, 'deess_ratio': 3.0,
    'deess_max_db': 8.0,
    'comp_threshold': -21.0, 'comp_ratio': 2.2, 'comp_knee': 8.0,
    'comp_attack': 0.004, 'comp_release': 0.09,
    'room_db': -22.0, 'room_rt60': 0.26,
    'target_lufs': -16.0, 'ceiling_dbtp': -2.0,
    'fade_in': 0.006, 'fade_out': 0.045, 'tail_max': 0.30,
}


# ---------------------------------------------------------------- filters

def biquad(kind, f0, sr, q=0.7071, gain_db=0.0, slope=1.0):
    """RBJ cookbook biquad as (b0, b1, b2, a0, a1, a2)."""
    a = 10 ** (gain_db / 40)
    w0 = 2 * math.pi * f0 / sr
    cw, sw = math.cos(w0), math.sin(w0)
    alpha = sw / (2 * q)
    if kind == 'highpass':
        return ((1 + cw) / 2, -(1 + cw), (1 + cw) / 2, 1 + alpha, -2 * cw, 1 - alpha)
    if kind == 'lowpass':
        return ((1 - cw) / 2, 1 - cw, (1 - cw) / 2, 1 + alpha, -2 * cw, 1 - alpha)
    if kind == 'peak':
        return (1 + alpha * a, -2 * cw, 1 - alpha * a, 1 + alpha / a, -2 * cw, 1 - alpha / a)
    alpha = sw / 2 * math.sqrt((a + 1 / a) * (1 / slope - 1) + 2)
    sa = 2 * math.sqrt(a) * alpha
    if kind == 'lowshelf':
        return (a * ((a + 1) - (a - 1) * cw + sa), 2 * a * ((a - 1) - (a + 1) * cw),
                a * ((a + 1) - (a - 1) * cw - sa), (a + 1) + (a - 1) * cw + sa,
                -2 * ((a - 1) + (a + 1) * cw), (a + 1) + (a - 1) * cw - sa)
    if kind == 'highshelf':
        return (a * ((a + 1) + (a - 1) * cw + sa), -2 * a * ((a - 1) + (a + 1) * cw),
                a * ((a + 1) + (a - 1) * cw - sa), (a + 1) - (a - 1) * cw + sa,
                2 * ((a - 1) - (a + 1) * cw), (a + 1) - (a - 1) * cw - sa)
    raise ValueError(f'unknown biquad {kind}')


def tone_curve(points):
    """Zero-phase magnitude from [(hz, dB)] points, interpolated in log frequency."""
    if not points:
        return None
    pts = sorted((float(f), float(g)) for f, g in points)
    lf = np.log([p[0] for p in pts])
    gd = np.array([p[1] for p in pts])

    def magnitude(freqs):
        f = np.maximum(freqs, 1.0)
        db = np.interp(np.log(f), lf, gd, left=gd[0], right=gd[-1])
        return 10 ** (db / 20)
    return magnitude


def equalise(x, sr, o, tone=None):
    """High-pass + broadcast EQ (+ per-voice tonal match) in a single FFT pass."""
    coeffs = [
        biquad('highpass', o['hp_hz'], sr, q=0.5412),
        biquad('highpass', o['hp_hz'], sr, q=1.3066),
        biquad('peak', o['mud_hz'], sr, q=o['mud_q'], gain_db=o['mud_db']),
        biquad('peak', o['presence_hz'], sr, q=o['presence_q'], gain_db=o['presence_db']),
        biquad('highshelf', min(o['air_hz'], sr * 0.42), sr, gain_db=o['air_db'], slope=0.8),
    ]
    curve = tone_curve(tone)

    def response(freqs):
        h = biquad_response(coeffs, freqs, sr)
        return h * curve(freqs) if curve else h
    return fft_filter(x, response, sr, pad=0.3)


def band_split(x, sr, f_from, f_to):
    """Zero-phase complementary split: returns (low, high) with low + high == x."""
    def mask(freqs):
        m = np.clip((freqs - f_from) / max(1.0, f_to - f_from), 0, 1)
        return 0.5 - 0.5 * np.cos(np.pi * m)
    high = fft_filter(x, mask, sr, pad=0.05)
    return x - high, high


# ---------------------------------------------------------------- envelopes

def frame_rms_db(x, sr, hop=0.001, win=0.005):
    """RMS level (dBFS) on a hop grid, each frame centred on its hop instant."""
    h = max(1, int(hop * sr))
    w = max(2, int(win * sr))
    c = np.concatenate([[0.0], np.cumsum(np.asarray(x, dtype=np.float64) ** 2)])
    centres = np.arange(0, len(x), h)
    lo = np.clip(centres - w // 2, 0, len(x))
    hi = np.clip(centres + w // 2, 0, len(x))
    ms = (c[hi] - c[lo]) / np.maximum(1, hi - lo)
    return centres, 10 * np.log10(ms + 1e-12)


def smooth_gain_db(target, hop, attack, release):
    """One-pole attack/release smoothing of a gain-reduction curve (dB, <= 0)."""
    aa, ar = math.exp(-hop / attack), math.exp(-hop / release)
    out = np.empty_like(target)
    s = 0.0
    for i, g in enumerate(target.tolist()):
        coef = aa if g < s else ar
        s = coef * s + (1 - coef) * g
        out[i] = s
    return out


def sliding_min(x, radius):
    """Minimum over [i - radius, i + radius] in O(n) (van Herk / Gil-Werman)."""
    if radius <= 0:
        return x.copy()
    w = 2 * radius + 1
    n = len(x)
    extra = (-(n + 2 * radius)) % w
    pad = np.concatenate([np.full(radius, np.inf), x, np.full(radius + extra, np.inf)])
    blocks = pad.reshape(-1, w)
    pre = np.minimum.accumulate(blocks, axis=1).ravel()
    suf = np.minimum.accumulate(blocks[:, ::-1], axis=1)[:, ::-1].ravel()
    i = np.arange(n)
    return np.minimum(suf[i], pre[i + w - 1])


def box_smooth(x, radius):
    if radius <= 0:
        return x.copy()
    w = 2 * radius + 1
    c = np.concatenate([[0.0], np.cumsum(np.pad(x, (radius, radius), mode='edge'))])
    return (c[w:] - c[:-w]) / w


# ---------------------------------------------------------------- dynamics

def deess(x, sr, o, ref_db):
    """Turn down only the 5 kHz+ band, only while it is louder than it should be."""
    low, high = band_split(x, sr, o['deess_from'], o['deess_to'])
    hop = 0.001
    centres, lh = frame_rms_db(high, sr, hop=hop, win=0.004)
    thr = ref_db + o['deess_rel_db']
    over = np.maximum(0.0, lh - thr)
    gr = -np.minimum(o['deess_max_db'], over * (1 - 1 / o['deess_ratio']))
    gr = smooth_gain_db(gr, hop, 0.0006, 0.028)
    gain = 10 ** (np.interp(np.arange(len(x)), centres, gr) / 20)
    return low + high * gain, float(-gr.min()) if len(gr) else 0.0


def compress(x, sr, o):
    """RMS soft-knee compressor; returns (y, max gain reduction dB, mean GR on speech)."""
    hop = 0.001
    centres, level = frame_rms_db(x, sr, hop=hop, win=0.005)
    over = level - o['comp_threshold']
    knee, slope = o['comp_knee'], 1 / o['comp_ratio'] - 1
    gr = np.where(over <= -knee / 2, 0.0,
                  np.where(over >= knee / 2, slope * over, slope * (over + knee / 2) ** 2 / (2 * knee)))
    gr = smooth_gain_db(gr, hop, o['comp_attack'], o['comp_release'])
    gain = 10 ** (np.interp(np.arange(len(x)), centres, gr) / 20)
    active = level > (level.max() - 30) if len(level) else level
    mean_gr = float(-gr[active].mean()) if np.any(active) else 0.0
    return x * gain, float(-gr.min()) if len(gr) else 0.0, mean_gr


def limit(x, sr, ceiling_db, radius_s=0.012):
    """Look-ahead true-peak limiter (offline, zero-phase gain curve).

    The gain is a sliding minimum of the required gain, then a box average no
    wider than that minimum, so it is never above what any sample in reach
    needs: no overs. The 12 ms radius keeps gain changes slower than a pitch
    period, so peaks are turned down instead of being clipped into buzz.
    """
    ceiling = 10 ** (ceiling_db / 20)
    n = len(x)
    if n == 0:
        return x
    peaks = np.abs(oversample(x, 4)).reshape(n, 4).max(axis=1)
    need = np.minimum(1.0, ceiling / np.maximum(peaks, 1e-9))
    if need.min() >= 1.0:
        return x
    r = max(1, int(radius_s * sr))
    gain = box_smooth(sliding_min(need, 2 * r), r)
    return x * np.minimum(gain, 1.0)


def _limit_to(x, sr, ceiling_db):
    y = x
    for _ in range(3):
        if true_peak(y) <= ceiling_db + 0.02:
            break
        y = limit(y, sr, ceiling_db - 0.15)
    return y


def loudness_normalise(x, sr, target, ceiling_db):
    """Gain to target LUFS with the true peak held under the ceiling.

    The limiter always works on the unlimited signal times a gain, and only the
    gain is iterated (limiting costs a little loudness, the next pass makes it
    up), so limiting never compounds into distortion.
    """
    lufs = integrated_loudness(x, sr)
    if not math.isfinite(lufs):
        return x
    gain = 10 ** ((target - lufs) / 20)
    y = x
    for _ in range(8):
        y = _limit_to(x * gain, sr, ceiling_db)
        got = integrated_loudness(y, sr)
        if abs(got - target) < 0.08:
            break
        gain *= 10 ** ((target - got) / 20)
    return y


# ---------------------------------------------------------------- room

_IR_CACHE = {}


def room_ir(sr, rt60=0.26, seed=24):
    """Small, damped studio: a few early reflections and a short dark tail."""
    key = (sr, round(rt60, 3), seed)
    if key in _IR_CACHE:
        return _IR_CACHE[key]
    rng = np.random.default_rng(seed)
    n = int((rt60 * 1.3 + 0.02) * sr)
    t = np.arange(n) / sr
    noise = rng.standard_normal(n)
    nf = next_fast_len(n)
    spec = np.fft.rfft(noise, nf)
    freqs = np.fft.rfftfreq(nf, 1 / sr)
    tail = np.zeros(n)
    # Highs die faster than lows in a treated room; three bands, three decays
    for lo, hi, scale in ((0, 500, 1.1), (500, 3000, 1.0), (3000, sr / 2 + 1, 0.55)):
        band = np.fft.irfft(spec * ((freqs >= lo) & (freqs < hi)), nf)[:n]
        tail += band * np.exp(-6.91 * t / (rt60 * scale))
    tail *= 1 - np.exp(-t / 0.006)
    early = np.zeros(n)
    for ms, g in ((2.9, 0.42), (4.7, 0.35), (7.3, -0.30), (9.8, 0.25), (12.6, -0.20), (15.1, 0.16)):
        i = int(ms / 1000 * sr)
        if i < n:
            early[i] += g
    tail *= 0.9 * math.sqrt(np.sum(early ** 2) / max(1e-12, np.sum(tail ** 2)))
    ir = np.concatenate([np.zeros(int(0.004 * sr)), early + tail])
    # Keep the room out of the lows (mud) and the top (sibilance smear)
    ir = fft_filter(ir, lambda f: biquad_response([biquad('highpass', 220, sr), biquad('lowpass', 6500, sr)], f, sr), sr, pad=0.02)
    ir /= math.sqrt(np.sum(ir ** 2))
    _IR_CACHE[key] = ir
    return ir


def add_room(x, sr, wet_db, rt60):
    if wet_db <= -60:
        return x
    ir = room_ir(sr, rt60)
    n = next_fast_len(len(x) + len(ir))
    wet = np.fft.irfft(np.fft.rfft(x, n) * np.fft.rfft(ir, n), n)[:len(x)]
    return x + wet * 10 ** (wet_db / 20)


# ---------------------------------------------------------------- edges

def fade(x, sr, fade_in, fade_out):
    y = np.array(x, dtype=np.float64)
    ni, no = min(len(y), int(fade_in * sr)), min(len(y), int(fade_out * sr))
    if ni > 1:
        y[:ni] *= 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, ni))
    if no > 1:
        y[-no:] *= 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, no))
    return y


def speech_bounds(x, sr, lead_db=-38.0, tail_db=-48.0):
    """(start, end) samples of the audible part, relative to the loudest 5 ms."""
    centres, level = frame_rms_db(x, sr, hop=0.0025, win=0.005)
    if len(level) == 0 or level.max() < -90:
        return 0, 0
    top = level.max()
    lead = np.flatnonzero(level > top + lead_db)
    tail = np.flatnonzero(level > top + tail_db)
    start = int(centres[lead[0]]) if len(lead) else 0
    end = int(centres[tail[-1]]) if len(tail) else len(x)
    return max(0, start), min(len(x), end)


def trim_tail(x, sr, speech_end, tail_max, floor_db=-60.0):
    """Cut the room/decay tail where it falls below floor_db of the peak level."""
    centres, level = frame_rms_db(x, sr, hop=0.0025, win=0.01)
    top = level.max() if len(level) else 0.0
    loud = np.flatnonzero(level > top + floor_db)
    end = int(centres[loud[-1]]) + int(0.01 * sr) if len(loud) else len(x)
    end = min(end, speech_end + int(tail_max * sr), len(x))
    return x[:max(end, min(len(x), speech_end))]


# ---------------------------------------------------------------- robot

def _stft(x, n_fft, hop):
    win = np.hanning(n_fft + 1)[:-1]
    pad = np.concatenate([np.zeros(n_fft), x, np.zeros(n_fft)])
    frames = 1 + (len(pad) - n_fft) // hop
    idx = np.arange(n_fft)[None, :] + hop * np.arange(frames)[:, None]
    return np.fft.rfft(pad[idx] * win, axis=1), win


def _istft(spec, win, hop, length):
    n_fft = len(win)
    frames = np.fft.irfft(spec, n_fft, axis=1) * win
    total = n_fft + hop * (len(frames) - 1)
    out = np.zeros(total)
    norm = np.zeros(total)
    for i, fr in enumerate(frames):
        out[i * hop:i * hop + n_fft] += fr
        norm[i * hop:i * hop + n_fft] += win ** 2
    out /= np.maximum(norm, 1e-6)
    return out[n_fft:n_fft + length]


def vocode(x, sr, f0=104.0, n_fft=512, hop=128, lifter_ms=1.4, seed=8):
    """Monotone channel vocoder: the voice's formants on a fixed-pitch buzz.

    The spectral envelope comes from a liftered cepstrum (formants without the
    harmonics); the carrier is a band-limited pulse train for voiced frames and
    noise for fricatives, so consonants stay crisp.
    """
    n = len(x)
    t = np.arange(n) / sr
    harmonics = np.arange(1, int((sr / 2 - 200) / f0) + 1)
    pulse = np.zeros(n)
    # Schroeder phases: same harmonic spectrum as a pulse train but a flat
    # envelope, so the buzz does not add peaks the limiter has to fight
    count = len(harmonics)
    for k in harmonics:
        pulse += np.cos(2 * np.pi * k * f0 * t + np.pi * k * (k - 1) / count)
    pulse /= math.sqrt(len(harmonics) / 2)
    noise = np.random.default_rng(seed).standard_normal(n)
    X, win = _stft(x, n_fft, hop)
    P, _ = _stft(pulse, n_fft, hop)
    N, _ = _stft(noise, n_fft, hop)
    mag = np.abs(X) + 1e-9
    cep = np.fft.irfft(np.log(mag), n_fft, axis=1)
    lift = max(4, int(lifter_ms / 1000 * sr))
    cep[:, lift:n_fft - lift + 1] = 0.0
    env = np.exp(np.fft.rfft(cep, n_fft, axis=1).real)
    freqs = np.fft.rfftfreq(n_fft, 1 / sr)
    low = (mag[:, freqs < 1500] ** 2).sum(axis=1)
    high = (mag[:, freqs >= 3000] ** 2).sum(axis=1)
    voiced = np.clip((low / (low + high + 1e-12) - 0.35) / 0.4, 0, 1)[:, None]
    pn = P / (np.sqrt(np.mean(np.abs(P) ** 2, axis=1, keepdims=True)) + 1e-9)
    nn = N / (np.sqrt(np.mean(np.abs(N) ** 2, axis=1, keepdims=True)) + 1e-9)
    carrier = voiced * pn + (1 - voiced) * nn
    y = _istft(env * carrier, win, hop, n)
    # Match the dry level frame by frame so the blend keeps the voice's dynamics
    _, ld = frame_rms_db(x, sr, hop=0.005, win=0.02)
    centres, lv = frame_rms_db(y, sr, hop=0.005, win=0.02)
    corr = np.clip(ld - lv, -24, 24)
    return y * 10 ** (np.interp(np.arange(n), centres, corr) / 20)


def robot(x, sr, mix=0.42, f0=104.0, comb_ms=3.1, comb_g=0.32, wobble_hz=33.0,
          wobble=0.22, crush_mix=0.10, crush_bits=7, crush_hz=8000):
    """UNIT-8: friendly robot, never at the cost of the words.

    Dry voice (keeps prosody and consonants) + monotone vocoder layer (the
    'machine' timbre) -> short metallic comb (tin-can body) -> light amplitude
    wobble (servo buzz) -> a touch of bit-crushed grit in the mid band only.
    """
    voc = vocode(x, sr, f0=f0)
    y = (1 - mix) * x + mix * voc
    d = max(1, int(comb_ms / 1000 * sr))
    y = fft_filter(y, lambda f: 1 / (1 - comb_g * np.exp(-2j * np.pi * f * d / sr)), sr, pad=0.05)
    y *= 1 - comb_g * 0.5  # comb adds ~+3 dB at its peaks
    t = np.arange(len(y)) / sr
    y = y * ((1 - wobble) + wobble * (0.5 + 0.5 * np.sin(2 * np.pi * wobble_hz * t)))
    if crush_mix > 0:
        hold = max(1, int(round(sr / crush_hz)))
        held = np.repeat(y[::hold], hold)[:len(y)]
        peak = np.max(np.abs(held)) or 1.0
        q = 2 ** (crush_bits - 1)
        crushed = np.round(held / peak * q) / q * peak
        crushed = fft_filter(crushed, lambda f: biquad_response(
            [biquad('highpass', 1200, sr), biquad('lowpass', 5500, sr)], f, sr), sr, pad=0.02)
        y = y + crush_mix * crushed
    return fft_filter(y, lambda f: biquad_response([biquad('highpass', 120, sr, q=0.6)], f, sr), sr, pad=0.05)


# ---------------------------------------------------------------- chain

def active_level_db(x, sr):
    """Median 5 ms RMS level of the speech frames (within 30 dB of the peak)."""
    _, level = frame_rms_db(x, sr, hop=0.005, win=0.02)
    if len(level) == 0:
        return -90.0
    act = level[level > level.max() - 30]
    return float(np.median(act)) if len(act) else -90.0


def broadcast(x, sr, tone=None, effect=None, overrides=None):
    """Full chain on a mono float clip. Returns (audio float64, stats dict).

    The clip should already be trimmed so speech starts within ~15 ms; the
    chain adds the room tail at the end and fades both edges.
    """
    o = dict(DEFAULTS)
    if overrides:
        o.update({k: v for k, v in overrides.items() if k in DEFAULTS})
    x = np.asarray(x, dtype=np.float64)
    if len(x) < int(0.02 * sr):
        x = np.concatenate([x, np.zeros(int(0.02 * sr) - len(x))])
    x = x - float(np.mean(x))
    speech_end = len(x)
    y = equalise(x, sr, o, tone)
    if effect == 'robot':
        y = robot(y, sr)
    # Work at a known level so thresholds mean the same for every voice
    lufs = integrated_loudness(y, sr)
    if math.isfinite(lufs):
        y = y * 10 ** ((-20.0 - lufs) / 20)
    y, deess_max = deess(y, sr, o, active_level_db(y, sr))
    y, comp_max, comp_mean = compress(y, sr, o)
    y = np.concatenate([y, np.zeros(int((o['tail_max'] + 0.05) * sr))])
    y = add_room(y, sr, o['room_db'], o['room_rt60'])
    y = trim_tail(y, sr, speech_end, o['tail_max'])
    y = loudness_normalise(y, sr, o['target_lufs'], o['ceiling_dbtp'])
    y = fade(y, sr, o['fade_in'], o['fade_out'])
    stats = {
        'lufs': round(integrated_loudness(y, sr), 2),
        'truePeak': round(true_peak(y), 2),
        'deessMaxDb': round(deess_max, 1),
        'compMaxDb': round(comp_max, 1),
        'compMeanDb': round(comp_mean, 1),
    }
    return y, stats
