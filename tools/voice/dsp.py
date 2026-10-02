"""Broadcast voice processing for GLOBIT 24 (numpy only, offline, deterministic).

Raw Kokoro output is clean but uneven: loudness differs by ~10 LU between
voices, some voices clip, the female voices carry harsh 8-11 kHz sibilance,
some male voices rumble below 100 Hz, and clips end with a few hundred ms of
low-level junk. A presenter on a real channel goes through a processing chain
before air; this module is that chain, run once per clip:

  1. high-pass 70 Hz (4th order), notches on the vocoder whistles, per-voice
     tonal match, mud cut, presence, air; adaptive boom/chest control; top
     octave restored (SBR-style) on voices trained without one
  2. optional character effect (UNIT-8's robot)
  3. gentle compressor (RMS, soft knee, ~2-4 dB on vowels)
  4. de-esser (split-band, only the 5 kHz+ band is turned down, only on 's')
  5. very short, low-level studio room (synthetic IR, -22 dB wet)
  6. loudness to -16 LUFS integrated, true-peak limiter at -2.5 dBTP so lossy
     encoding stays under -1.5 dBTP (Opus overshot by up to 0.7 dB in tests)
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
    'notch_hz': (4800.0, 9600.0), 'notch_db': -24.0, 'notch_sigma': 9.0,
    'mud_hz': 290.0, 'mud_db': -1.5, 'mud_q': 1.0,
    'presence_hz': 3300.0, 'presence_db': 1.0, 'presence_q': 0.9,
    'boom_max_db': 4.0, 'boom_ref_db': -10.0, 'chest_max_db': 3.0, 'chest_ref_db': 1.5,
    'air_restore': True, 'air_gap_db': 10.0, 'air_fill_db': -8.0,
    'air_hz': 9000.0, 'air_db': 1.5,
    'deess_from': 4800.0, 'deess_to': 6200.0, 'deess_rel_db': -10.0, 'deess_ratio': 3.0,
    'deess_max_db': 10.0,
    'comp_threshold': -21.0, 'comp_ratio': 2.2, 'comp_knee': 8.0,
    'comp_attack': 0.004, 'comp_release': 0.09,
    'room_db': -22.0, 'room_rt60': 0.26,
    'target_lufs': -16.0, 'ceiling_dbtp': -2.5,
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


def notch_curve(centres, depth_db, sigma):
    """Zero-phase Gaussian dips (dB) at the given frequencies.

    Kokoro's iSTFT vocoder works at a 5-sample hop (4800 frames/s at 24 kHz),
    which leaves steady whistles at 4800 and 9600 Hz, 7-17 dB above the voice
    around them. They are a few Hz wide, so notches this narrow (applied on the
    whole-clip spectrum) take them out without touching the voice.
    """
    def magnitude(freqs):
        db = np.zeros_like(freqs, dtype=np.float64)
        for c in centres:
            # Higher whistles are smeared a little wider by the speech envelope
            width = sigma * math.sqrt(c / 4800.0)
            db += depth_db * np.exp(-0.5 * ((freqs - c) / width) ** 2)
            db += 0.25 * depth_db * np.exp(-0.5 * ((freqs - c) / (3 * width)) ** 2)
        return 10 ** (np.maximum(db, depth_db) / 20)
    return magnitude


def equalise(x, sr, o, tone=None):
    """High-pass, whistle notches, broadcast EQ and tonal match in one FFT pass."""
    coeffs = [
        biquad('highpass', o['hp_hz'], sr, q=0.5412),
        biquad('highpass', o['hp_hz'], sr, q=1.3066),
        biquad('peak', o['mud_hz'], sr, q=o['mud_q'], gain_db=o['mud_db']),
        biquad('peak', o['presence_hz'], sr, q=o['presence_q'], gain_db=o['presence_db']),
        biquad('highshelf', min(o['air_hz'], sr * 0.42), sr, gain_db=o['air_db'], slope=0.8),
    ]
    curve = tone_curve(tone)
    notches = [f for f in o['notch_hz'] if f < sr / 2 - 100]
    notch = notch_curve(notches, o['notch_db'], o['notch_sigma']) if notches and o['notch_db'] < 0 else None

    def response(freqs):
        h = biquad_response(coeffs, freqs, sr)
        if curve:
            h = h * curve(freqs)
        if notch:
            h = h * notch(freqs)
        return h
    return fft_filter(x, response, sr, pad=0.3)


def band_powers(x, sr, bands, gate=None, n=2048):
    """Long-term power (dB) of each (lo, hi) band of x, averaged over the speech
    frames of `gate` (default x itself: frames within 35 dB of the loudest)."""
    x = np.asarray(x, dtype=np.float64)
    if len(x) < 2 * n:
        return [-120.0] * len(bands)
    g = x if gate is None else np.asarray(gate, dtype=np.float64)
    hop = n // 2
    count = 1 + (len(x) - n) // hop
    idx = np.arange(n)[None, :] + hop * np.arange(count)[:, None]
    win = np.hanning(n)
    lv = 10 * np.log10(((g[idx] * win) ** 2).mean(axis=1) + 1e-12)
    fr = x[idx][lv > lv.max() - 35] * win
    psd = (np.abs(np.fft.rfft(fr, axis=1)) ** 2).mean(axis=0)
    f = np.fft.rfftfreq(n, 1 / sr)
    return [10 * math.log10(psd[(f >= lo) & (f < hi)].sum() + 1e-20) for lo, hi in bands]


def band_levels(x, sr, bands, n=2048):
    """Band powers (dB) relative to the 300-3000 Hz speech core."""
    powers = band_powers(x, sr, [(300, 3000)] + list(bands), n=n)
    return [p - powers[0] for p in powers[1:]]


def low_end(x, sr, o):
    """Adaptive low-end control: cut only what sticks out.

    Deep blends (e.g. Sam) carry boom below 100 Hz, and some (Paco) a thick
    100-300 Hz chest. Measured against the speech core, the excess over a
    reference is cut with a low shelf (boom) and a broad bell (chest), so
    every presenter sits in the same tonal window without thinning anyone.
    """
    sub, chest = band_levels(x, sr, [(20, 100), (100, 300)])
    boom_cut = -min(o['boom_max_db'], max(0.0, sub - o['boom_ref_db']))
    chest_cut = -min(o['chest_max_db'], max(0.0, (chest - o['chest_ref_db']) * 0.7))
    coeffs = []
    if boom_cut < -0.2:
        coeffs.append(biquad('lowshelf', 110, sr, gain_db=boom_cut, slope=0.8))
    if chest_cut < -0.2:
        coeffs.append(biquad('peak', 200, sr, q=0.8, gain_db=chest_cut))
    if not coeffs:
        return x, 0.0, 0.0
    y = fft_filter(x, lambda f: biquad_response(coeffs, f, sr), sr, pad=0.2)
    return y, boom_cut, chest_cut


def air_restore(x, sr, o):
    """Give band-limited voices back their top octave (spectral band replication).

    Some Kokoro voices were trained on audio with nothing above ~10 kHz (e.g.
    bm_george, Paco's base), which sounds dull next to the others. Harmonic
    exciters would alias at 24 kHz, so, like HE-AAC's SBR, the 5.5-7.5 kHz band
    is copied up by 4.5 kHz with a single-sideband shift (its own envelope, so
    it follows the 's' and 't' sounds), only the part above the voice's cutoff
    is kept, and it is mixed ~8 dB under the 5-9 kHz band. Voices that already
    have air are left alone.
    """
    if not o['air_restore'] or sr < 22000:
        return x, 0.0
    sib, air = band_levels(x, sr, [(5000, 9000), (9500, min(12000, sr / 2))])
    if air > sib - o['air_gap_db']:
        return x, 0.0
    n = next_fast_len(len(x) + int(0.05 * sr))
    spec = np.fft.rfft(x, n)
    f = np.fft.rfftfreq(n, 1 / sr)
    shift = 4500.0
    # Raised-cosine edges: a hard-edged mask on a whole-clip spectrum rings
    # through the entire clip as a steady tone at the edge frequency
    rise = np.clip((f - 5300) / 500, 0, 1)
    fall = np.clip((7700 - f) / 500, 0, 1)
    src = (0.5 - 0.5 * np.cos(np.pi * rise)) * (0.5 - 0.5 * np.cos(np.pi * fall))
    # Analytic band (positive frequencies only) shifted up = single sideband
    full = np.zeros(n, dtype=complex)
    full[:len(spec)] = spec * src * 2
    band = np.fft.ifft(full)[:len(x)]
    t = np.arange(len(x)) / sr
    shifted = np.real(band * np.exp(2j * np.pi * shift * t))
    # Keep only what lands above the cutoff, with a soft edge
    lo = 9600.0
    shifted = fft_filter(shifted, lambda fr: 0.5 - 0.5 * np.cos(np.pi * np.clip((fr - lo) / 700.0, 0, 1)),
                         sr, pad=0.02)
    top = min(12000, sr / 2)
    have, sib_abs = band_powers(x, sr, [(9500, top), (5000, 9000)])
    got = band_powers(shifted, sr, [(9500, top)], gate=x)[0]
    # Fill the top band up to air_fill_db under the 5-9 kHz band (power sum)
    want = 10 ** ((sib_abs + o['air_fill_db']) / 10) - 10 ** (have / 10)
    if want <= 0:
        return x, 0.0
    gain_db = 10 * math.log10(want) - got
    return x + shifted * 10 ** (gain_db / 20), round(sib + o['air_fill_db'] - air, 1)


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
    g_db = target - lufs
    y = x
    prev = None  # (gain dB, loudness) of the previous pass
    for _ in range(8):
        y = _limit_to(x * 10 ** (g_db / 20), sr, ceiling_db)
        got = integrated_loudness(y, sr)
        if abs(got - target) < 0.08:
            break
        # Secant step: when the limiter absorbs part of each dB, loudness
        # rises less than the gain, and the measured slope says by how much
        slope = 1.0
        if prev and abs(got - prev[1]) > 1e-3 and abs(g_db - prev[0]) > 1e-3:
            slope = min(1.0, max(0.15, (got - prev[1]) / (g_db - prev[0])))
        prev = (g_db, got)
        g_db += min(6.0, (target - got) / slope)
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


ROBOT = {
    'f0': 100.0,         # monotone pitch of the machine layer (Hz)
    'split': 2400.0,     # below: pitch lives here -> mostly machine; above: consonants -> mostly dry
    'low_machine': 0.85,
    'high_machine': 0.30,
    'comb_ms': 2.7, 'comb_g': 0.22,   # short metallic body
    'crush_mix': 0.04, 'crush_bits': 8, 'crush_hz': 9000,
}


def robot(x, sr, **params):
    """UNIT-8: an instrument that speaks. Robotic by monotone, not by gimmick.

    The style bible (docs/programmes/cosmos.md) asks for an even, clipped
    delivery with a narrow pitch range, "not a cartoon pitch shift". So the
    band where pitch is heard (< 2.4 kHz) comes mostly from a fixed-pitch
    vocoder carrying the voice's formants, while the consonant band stays
    mostly dry for intelligibility (checked with STOI in measure.py). A short,
    faint comb gives a metal body and a trace of bit-crush a digital edge.
    """
    p = {**ROBOT, **params}
    voc = vocode(x, sr, f0=p['f0'])
    xl, xh = band_split(x, sr, p['split'] - 300, p['split'] + 300)
    vl, vh = band_split(voc, sr, p['split'] - 300, p['split'] + 300)
    y = ((1 - p['low_machine']) * xl + p['low_machine'] * vl
         + (1 - p['high_machine']) * xh + p['high_machine'] * vh)
    d = max(1, int(p['comb_ms'] / 1000 * sr))
    g = p['comb_g']
    y = fft_filter(y, lambda f: (1 - g) / (1 - g * np.exp(-2j * np.pi * f * d / sr)), sr, pad=0.05)
    if p['crush_mix'] > 0:
        hold = max(1, int(round(sr / p['crush_hz'])))
        held = np.repeat(y[::hold], hold)[:len(y)]
        peak = np.max(np.abs(held)) or 1.0
        q = 2 ** (p['crush_bits'] - 1)
        crushed = np.round(held / peak * q) / q * peak
        crushed = fft_filter(crushed, lambda f: biquad_response(
            [biquad('highpass', 1500, sr), biquad('lowpass', 6000, sr)], f, sr), sr, pad=0.02)
        y = y + p['crush_mix'] * crushed
    return fft_filter(y, lambda f: biquad_response([biquad('highpass', 110, sr, q=0.6)], f, sr), sr, pad=0.05)


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
    y, boom_cut, chest_cut = low_end(y, sr, o)
    y, air_added = air_restore(y, sr, o)
    if effect == 'robot':
        y = robot(y, sr)
    # Work at a known level so thresholds mean the same for every voice
    lufs = integrated_loudness(y, sr)
    if math.isfinite(lufs):
        y = y * 10 ** ((-20.0 - lufs) / 20)
    # De-ess after compression: the compressor turns vowels down more than the
    # quieter fricatives, which would bring the 's' sounds back up
    y, comp_max, comp_mean = compress(y, sr, o)
    y, deess_max = deess(y, sr, o, active_level_db(y, sr))
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
        'lowCutDb': [round(boom_cut, 1), round(chest_cut, 1)],
        'airAddedDb': air_added,
    }
    return y, stats
