#!/usr/bin/env python3
"""Showcase mixer: voices + captured WebAudio + music beds -> broadcast mix.

  python3 tools/showcase/mix.py manifest.json   (prints one JSON report line)

The manifest (written by record-show.mjs) gives the sample rate, the length,
the WebAudio render of the channel page (interleaved float32 stereo: open
themes, ad beds, stingers, idents, sfx, already ducked by the channel's own
mixer), the music beds (same format, rendered offline from a music proposal),
and every voice clip with its start time on the recording clock (and its cut
time when the page cancelled it). Steps:

  1. voices: each Kokoro clip (24 kHz mono) is upsampled to the mix rate,
     placed sample-exactly, truncated with a 10 ms fade where it was cut;
  2. beds: trimmed, then an extra speech duck (on top of the engine's own
     per-layer duck) so the bed sits >= 15 dB lower under every voice, with a
     short lead, a hold that bridges sentence gaps and a slow release;
  3. sum, measure (ffmpeg ebur128), gain to the target loudness, true-peak
     limit (4x oversampled detection, look-ahead, smooth release), encode AAC
     and re-measure the decoded AAC until -16 LUFS +- 0.5 and TP <= target;
  4. report: loudness before/after, the effective bed duck under speech
     (vs. the same beds rendered without speech), bed level inside grave
     stories and ads (should be silence), clip counts.
Stems are written next to the mix for listening and for the sync checks.
"""

import json
import math
import os
import re
import subprocess
import sys
import wave

import numpy as np

FFMPEG = os.environ.get('FFMPEG', 'ffmpeg')


def db(x):
    return 20 * math.log10(max(1e-12, float(x)))


def rms_db(x):
    return db(math.sqrt(float(np.mean(np.square(x)))) if x.size else 0.0)


def read_f32(path, n):
    """Interleaved stereo float32 -> (n, 2), zero-padded or cut to n frames."""
    out = np.zeros((n, 2), dtype=np.float64)
    if not path or not os.path.exists(path):
        return out
    a = np.fromfile(path, dtype='<f4')
    a = a[: (len(a) // 2) * 2].reshape(-1, 2)
    m = min(n, len(a))
    out[:m] = a[:m]
    return out


def read_wav(path):
    with wave.open(path, 'rb') as w:
        sr = w.getframerate()
        ch = w.getnchannels()
        width = w.getsampwidth()
        raw = w.readframes(w.getnframes())
    if width == 2:
        x = np.frombuffer(raw, dtype='<i2').astype(np.float64) / 32768.0
    elif width == 4:
        x = np.frombuffer(raw, dtype='<i4').astype(np.float64) / 2147483648.0
    else:
        raise ValueError(f'unsupported sample width {width}')
    if ch > 1:
        x = x.reshape(-1, ch).mean(axis=1)
    return x, sr


def write_wav_f32(path, y, sr):
    """Float32 WAV (IEEE) without extra deps."""
    y = np.asarray(y, dtype='<f4')
    if y.ndim == 1:
        y = y[:, None]
    n, ch = y.shape
    data = y.tobytes()
    with open(path, 'wb') as f:
        f.write(b'RIFF')
        f.write((4 + 26 + 12 + 8 + len(data)).to_bytes(4, 'little'))
        f.write(b'WAVE')
        f.write(b'fmt ')
        f.write((18).to_bytes(4, 'little'))
        f.write((3).to_bytes(2, 'little'))  # IEEE float
        f.write(ch.to_bytes(2, 'little'))
        f.write(int(sr).to_bytes(4, 'little'))
        f.write((int(sr) * ch * 4).to_bytes(4, 'little'))
        f.write((ch * 4).to_bytes(2, 'little'))
        f.write((32).to_bytes(2, 'little'))
        f.write((0).to_bytes(2, 'little'))
        f.write(b'fact')
        f.write((4).to_bytes(4, 'little'))
        f.write(n.to_bytes(4, 'little'))
        f.write(b'data')
        f.write(len(data).to_bytes(4, 'little'))
        f.write(data)


_FIR = {}


def polyphase(L, taps_per_phase=32, cutoff=0.9):
    """Windowed-sinc interpolation filter for integer upsampling by L, split into L phases."""
    key = (L, taps_per_phase, cutoff)
    if key in _FIR:
        return _FIR[key]
    n = L * taps_per_phase
    t = (np.arange(n) - (n - 1) / 2) / L
    h = np.sinc(t * cutoff) * cutoff * np.kaiser(n, 8.0)
    h *= L / h.sum()
    _FIR[key] = [h[p::L] for p in range(L)]
    return _FIR[key]


def upsample(x, L):
    """Integer upsampling (24 kHz voices -> 48 kHz; 4x true-peak detection)."""
    if L == 1:
        return x
    phases = polyphase(L)
    d = len(phases[0]) // 2
    y = np.zeros(len(x) * L)
    for p, h in enumerate(phases):
        c = np.convolve(x, h)[d:d + len(x)]
        y[p::L] = c
    return y


def resample(x, sr_in, sr_out):
    if sr_in == sr_out:
        return x
    if sr_out % sr_in == 0:
        return upsample(x, sr_out // sr_in)
    # General ratio: ffmpeg's resampler through pipes.
    p = subprocess.run([FFMPEG, '-v', 'error', '-f', 'f64le', '-ar', str(sr_in), '-ac', '1', '-i', '-',
                        '-af', f'aresample={sr_out}:resampler=soxr', '-f', 'f64le', '-'],
                       input=np.asarray(x, dtype='<f8').tobytes(), capture_output=True, check=True)
    return np.frombuffer(p.stdout, dtype='<f8').copy()


def ebur128(path):
    p = subprocess.run([FFMPEG, '-hide_banner', '-nostats', '-i', path, '-af', 'ebur128=peak=true:framelog=quiet', '-f', 'null', '-'],
                       capture_output=True, text=True)
    s = p.stderr.split('Summary:')[-1]

    def pick(rx):
        m = re.search(rx, s)
        return float(m.group(1)) if m else float('nan')
    return {'I': pick(r'I:\s+(-?[\d.]+) LUFS'), 'LRA': pick(r'LRA:\s+(-?[\d.]+) LU'), 'TP': pick(r'Peak:\s+(-?[\d.]+) dBFS')}


def duck_curve(n, sr, regions, depths, attack, hold, release):
    """Gain curve: 1 outside speech, 10^(depth/20) under each region (lead `attack`, `hold` after, `release` back)."""
    g = np.ones(n)
    for (a, b), depth_db in zip(regions, depths):
        if depth_db >= 0:
            continue
        floor = 10 ** (depth_db / 20)
        s0 = int(max(0, (a - attack) * sr))
        s1 = int(max(0, a * sr))
        e0 = int(min(n, (b + hold) * sr))
        e1 = int(min(n, (b + hold + release) * sr))
        if s1 > s0:
            k = np.linspace(0, 1, s1 - s0)
            g[s0:s1] = np.minimum(g[s0:s1], 1 - (1 - floor) * (0.5 - 0.5 * np.cos(np.pi * k)))
        g[s1:e0] = np.minimum(g[s1:e0], floor)
        if e1 > e0:
            k = np.linspace(0, 1, e1 - e0)
            g[e0:e1] = np.minimum(g[e0:e1], floor + (1 - floor) * (0.5 - 0.5 * np.cos(np.pi * k)))
    return g


def engine_duck(wet, dry, sr, a, b):
    """dB the bed engine itself ducked [a, b] (wet = with speech, dry = same cues without), or None."""
    s0, s1 = int((a + 0.35) * sr), int(b * sr)
    if s1 - s0 < int(0.3 * sr) or dry is None:
        return None
    ref = rms_db(dry[s0:s1])
    if ref < -62:
        return None
    return rms_db(wet[s0:s1]) - ref


# ITU-R BS.1770 K-weighting at 48 kHz (pre-filter shelf + RLB high-pass), run by ffmpeg's biquad
# (numpy has no IIR filter and a Python loop over 20M samples is far too slow).
KW_48K = ('biquad=b0=1.53512485958697:b1=-2.69169618940638:b2=1.19839281085285:a0=1:a1=-1.69065929318241:a2=0.73248077421585,'
          'biquad=b0=1:b1=-2:b2=1:a0=1:a1=-1.99004745483398:a2=0.99007225036621')
HOP = 0.01  # s: resolution of the loudness rider


def kweight(x, sr):
    """K-weighted copy of a mono signal (unweighted when the rate is not 48 kHz)."""
    if sr != 48000 or not len(x):
        return np.asarray(x, dtype=np.float64)
    p = subprocess.run([FFMPEG, '-v', 'error', '-f', 'f64le', '-ar', str(sr), '-ac', '1', '-i', '-', '-af', KW_48K, '-f', 'f64le', '-'],
                       input=np.asarray(x, dtype='<f8').tobytes(), capture_output=True, check=True)
    y = np.frombuffer(p.stdout, dtype='<f8')
    return y[:len(x)].copy() if len(y) >= len(x) else np.pad(y, (0, len(x) - len(y)))


def hop_power(k, sr, channels=1.0):
    """Mean square of a K-weighted signal per HOP, times the channel count it is heard on (BS.1770 sums channel powers)."""
    h = int(round(HOP * sr))
    m = len(k) // h
    return np.mean(np.square(k[:m * h]).reshape(m, h), axis=1) * channels


def lufs(p):
    """Loudness (LUFS) of a run of hop powers; -inf for nothing."""
    p = np.asarray(p)
    return -0.691 + 10 * math.log10(float(np.mean(p))) if p.size and float(np.mean(p)) > 1e-14 else float('-inf')


def raised(k):
    return 0.5 - 0.5 * np.cos(np.pi * np.clip(k, 0.0, 1.0))


def ride_bed(beds, ref, sr, regions, cfg):
    """Level the bed against the real voice (owner 17:05, WORLD NOW bible): under speech the bed's
    loudness sits `underDb` LU below the voice (each speech region kept inside `window`), and in every
    pause of `gapMin` s or more (the regions are built from the voice's own envelope, so these are real
    gaps between words, sentences and segments) it rises towards `gapDb` LU below the voice, never
    above `ceilDb` (short peaks such as pips), with gentle raised-cosine ramps that are down again
    before the next word. Silence stays silence (grave stories, ads, opens: the cue sheet's choice).
    Returns (gain per sample, report)."""
    n = len(beds)
    kb = hop_power(kweight(beds[:, 0], sr), sr) + hop_power(kweight(beds[:, 1], sr), sr)
    kv = hop_power(kweight(ref, sr), sr, channels=2.0)  # the mono voice is heard on both channels
    H = len(kb)
    hop = lambda t: int(min(H, max(0, round(t / HOP))))
    under, window, gap_db = float(cfg.get('underDb', 18)), cfg.get('window', [-20, -16]), float(cfg.get('gapDb', 11))
    gap_min, max_lift, ceil_db = float(cfg.get('gapMin', 0.6)), float(cfg.get('maxLift', 8)), float(cfg.get('ceilDb', 6))
    regs = [(a, b) for a, b in regions if b - a > 0.05]
    # Voice level: per region, gated like BS.1770 (absolute -70, relative -10), then the median.
    lv_r = []
    for a, b in regs:
        p = kv[hop(a):hop(b)]
        p = p[p > 10 ** ((-70 + 0.691) / 10)]
        if p.size > 50:
            rel_gate = 10 ** ((lufs(p) - 10 + 0.691) / 10)
            lv_r.append(lufs(p[p > rel_gate]))
    if not lv_r:
        return np.ones(n), {'skipped': 'no voice'}
    lv = float(np.median(lv_r))
    # The bed under each speech region (only where a bed really plays, and steadily: not a fade).
    rel = []
    for a, b in regs:
        if b - a < 1.5:
            rel.append(None)
            continue
        p = kb[hop(a + 0.1):hop(b)]
        half = len(p) // 2
        lb = lufs(p)
        steady = half > 10 and abs(lufs(p[:half]) - lufs(p[half:])) < 10
        rel.append(lb - lv if lb > lv - 45 and steady else None)
    known = [r for r in rel if r is not None]
    if not known:
        return np.ones(n), {'skipped': 'no bed under speech', 'voiceLUFS': round(lv, 1)}
    base = max(-10.0, min(20.0, -under - float(np.median(known))))
    corr = []
    for r in rel:
        if r is None:
            corr.append(0.0)
            continue
        x = r + base
        corr.append(window[1] - x if x > window[1] else (min(4.0, window[0] - x) if x < window[0] else 0.0))
    # Correction curve: each region's value over the region, interpolated across the gaps, smoothed 0.2 s.
    g = np.zeros(H)
    t_hops = np.arange(H) * HOP
    xs, ys = [], []
    for (a, b), c in zip(regs, corr):
        xs += [a, b]
        ys += [c, c]
    if xs:
        g += np.interp(t_hops, xs, ys)
    k = max(1, int(0.2 / HOP))
    g = np.convolve(g, np.ones(k) / k, mode='same') + base
    # Lift in the real pauses.
    lift = np.zeros(H)
    lifted = []
    bounds = [(-1e9, -1e9)] + regs + [(1e9, 1e9)]
    for (pa, pb), (na, nb) in zip(bounds[:-1], bounds[1:]):
        g0, g1 = max(0.0, pb), min(n / sr, na)
        if g1 - g0 < gap_min or pb < 0 or na > n / sr:
            continue  # only pauses between speech (before the first word / after the last: no voice to sit under)
        c0, c1 = hop(g0 + 0.12), hop(g1 - 0.12)
        if c1 - c0 < 20:
            c0, c1 = hop((g0 + g1) / 2 - 0.1), hop((g0 + g1) / 2 + 0.1)
        seg = kb[c0:c1] * 10 ** (g[c0:c1] / 10)
        lg = lufs(seg)
        if lg < lv - 50:
            continue  # nothing plays here: silence stays silence
        want = max(0.0, min(max_lift, (lv - gap_db) - lg))
        # ceiling on 100 ms peaks (pips, stings): never above voice - ceilDb
        w = max(1, int(0.1 / HOP))
        p100 = np.convolve(seg, np.ones(w) / w, mode='valid') if len(seg) >= w else seg
        peak = -0.691 + 10 * math.log10(max(1e-14, float(np.max(p100))))
        want = max(0.0, min(want, (lv - ceil_db) - peak))
        if want < 0.5:
            continue
        up, down, s0, s1 = 0.3, 0.25, g0 + 0.10, g1 - 0.08
        T = s1 - s0
        scale = min(1.0, T / (up + down))
        u, d = up * scale, down * scale
        x = t_hops[hop(s0):hop(s1)]
        env = np.minimum(raised((x - s0) / max(u, 1e-3)), raised((s1 - x) / max(d, 1e-3)))
        lift[hop(s0):hop(s0) + len(env)] = np.maximum(lift[hop(s0):hop(s0) + len(env)], want * scale * env)
        lifted.append(round(want * scale, 1))
    g_db = g + lift
    # Measure the result on the same grid: bed vs voice under speech and in the pauses.
    kb2 = kb * 10 ** (g_db / 10)
    after, gaps_after = [], []
    for (a, b), r in zip(regs, rel):
        if r is not None:
            after.append(lufs(kb2[hop(a + 0.1):hop(b)]) - lv)
    for (pa, pb), (na, nb) in zip(bounds[:-1], bounds[1:]):
        g0, g1 = max(0.0, pb), min(n / sr, na)
        if g1 - g0 >= gap_min and pb >= 0 and na <= n / sr:
            lg = lufs(kb2[hop(g0 + 0.2):hop(g1 - 0.1)])
            if lg > lv - 50:
                gaps_after.append(lg - lv)
    q = lambda v, p: round(float(np.percentile(v, p)), 1) if v else None
    report = {
        'voiceLUFS': round(lv, 1), 'baseGainDb': round(base, 1), 'targetUnderDb': -under, 'window': window,
        'underSpeech': {'regions': len(after), 'median': q(after, 50), 'p10': q(after, 10), 'p90': q(after, 90),
                        'outsideWindow': int(sum(1 for v in after if v < window[0] - 0.5 or v > window[1] + 0.5))},
        'pauses': {'lifted': len(lifted), 'medianLiftDb': q(lifted, 50), 'withBed': len(gaps_after), 'median': q(gaps_after, 50), 'p90': q(gaps_after, 90)},
    }
    t_s = (np.arange(H) + 0.5) * HOP
    return 10 ** (np.interp(np.arange(n) / sr, t_s, g_db) / 20), report


def room_tone(n, sr, windows, level_db, fade=0.5):
    """Studio air under the studio segments (open to end card), so a pause is never digital silence:
    band-limited pink noise, decorrelated L/R, `level_db` dBFS RMS, faded in and out over `fade` s."""
    wins = [(max(0.0, a), min(n / sr, b)) for a, b in windows if min(n / sr, b) - max(0.0, a) > 0.5]
    if not wins:
        return None
    dur = n / sr + 0.5

    def noise(seed):
        p = subprocess.run([FFMPEG, '-v', 'error', '-f', 'lavfi', '-i', f'anoisesrc=color=pink:seed={seed}:sample_rate={sr}:duration={dur:.3f}:amplitude=0.5',
                            '-af', 'highpass=f=90,lowpass=f=4500', '-f', 'f64le', '-ac', '1', '-'], capture_output=True, check=True)
        x = np.frombuffer(p.stdout, dtype='<f8')[:n]
        return np.pad(x, (0, n - len(x)))
    tone = np.stack([noise(7), noise(19)], axis=1)
    tone *= 10 ** (level_db / 20) / max(1e-9, math.sqrt(float(np.mean(np.square(tone)))))
    env = np.zeros(n)
    for a, b in wins:
        s0, s1 = int(a * sr), int(b * sr)
        env[s0:s1] = 1.0
        f = min(int(fade * sr), (s1 - s0) // 2)
        env[s0:s0 + f] = np.minimum(env[s0:s0 + f], raised(np.arange(f) / f))
        env[s1 - f:s1] = np.minimum(env[s1 - f:s1], raised((f - np.arange(f)) / f))
    return tone * env[:, None]


def silent_runs(y, sr, windows, floor_db=-70.0, min_len=0.25):
    """Runs longer than `min_len` s where the mix is below `floor_db` dBFS (10 ms RMS) inside `windows`."""
    h = int(0.01 * sr)
    mono = y.mean(axis=1)
    m = len(mono) // h
    lv = 10 * np.log10(np.mean(np.square(mono[:m * h]).reshape(m, h), axis=1) + 1e-20)
    out = []
    for a, b in windows:
        i, e = int(max(0, a) / 0.01), int(min(m * 0.01, b) / 0.01)
        run = None
        for k in range(i, e):
            if lv[k] < floor_db:
                run = k if run is None else run
            elif run is not None:
                if (k - run) * 0.01 > min_len:
                    out.append([round(run * 0.01, 2), round(k * 0.01, 2)])
                run = None
        if run is not None and (e - run) * 0.01 > min_len:
            out.append([round(run * 0.01, 2), round(e * 0.01, 2)])
    return out


def true_peak_limit(y, sr, ceiling_db, lookahead=0.004, release=0.12):
    """Look-ahead limiter on 4x-oversampled peaks; touches only the moments that overshoot."""
    ceiling = 10 ** (ceiling_db / 20)
    peak = np.zeros(len(y))
    for c in range(y.shape[1]):
        up = np.abs(upsample(y[:, c], 4)).reshape(-1, 4).max(axis=1)
        peak = np.maximum(peak, up)
    need = np.where(peak > ceiling, ceiling / np.maximum(peak, 1e-12), 1.0)
    over = np.where(need < 1.0)[0]
    g = np.ones(len(y))
    if len(over):
        la = max(1, int(lookahead * sr))
        rl = max(1, int(release * 5 * sr))
        # Group overshooting samples into runs; each run gets one gain envelope.
        breaks = np.where(np.diff(over) > la)[0]
        starts = np.concatenate(([over[0]], over[breaks + 1]))
        ends = np.concatenate((over[breaks], [over[-1]]))
        for s, e in zip(starts, ends):
            r = need[s:e + 1].min()
            a0 = max(0, s - la)
            k = np.linspace(0, 1, s - a0 + 1)
            g[a0:s + 1] = np.minimum(g[a0:s + 1], 1 - (1 - r) * (0.5 - 0.5 * np.cos(np.pi * k)))
            g[s:e + 1] = np.minimum(g[s:e + 1], r)
            r1 = min(len(y), e + rl)
            k = np.arange(r1 - e) / sr
            g[e:r1] = np.minimum(g[e:r1], 1 - (1 - r) * np.exp(-k / release))
    return y * g[:, None], int(len(over)), float(g.min())


def main():
    man = json.load(open(sys.argv[1], encoding='utf-8'))
    sr = int(man['sr'])
    n = int(round(float(man['seconds']) * sr))
    stems_dir = man.get('stems') or os.path.dirname(man['out'])
    os.makedirs(stems_dir, exist_ok=True)
    report = {'seconds': n / sr, 'sampleRate': sr}

    web = read_f32(man.get('webaudio'), n)
    # The channel's speech bus alone (recorded voices it played itself; they are
    # already inside `web`): only a reference for the bed level and the duck.
    web_speech = read_f32(man.get('webSpeech'), n).mean(axis=1) if man.get('webSpeech') else None
    beds = read_f32(man.get('beds'), n)
    dry = read_f32(man.get('bedsDry'), n) if man.get('bedsDry') else None
    bed_gain = 10 ** (float(man.get('bedGainDb', 0)) / 20)
    beds *= bed_gain
    if dry is not None:
        dry *= bed_gain

    # 1. Voices.
    voice = np.zeros(n)
    vg = float(man.get('voiceGain', 1.0))
    placed = 0
    cache = {}
    for v in man.get('voices', []):
        path = v['path']
        if path not in cache:
            x, csr = read_wav(path)
            cache[path] = resample(x, csr, sr)
        x = cache[path]
        start = int(round(float(v['start']) * sr))
        length = len(x)
        if v.get('cut') is not None:
            length = min(length, int(round((float(v['cut']) - float(v['start'])) * sr)))
        if length <= 0:
            continue
        clip = x[:length].copy()
        if length < len(x):
            f = min(length, int(0.01 * sr))
            clip[-f:] *= np.linspace(1, 0, f)
        a, b = max(0, start), min(n, start + length)
        if b <= a:
            continue
        voice[a:b] += clip[a - start:b - start] * vg * float(v.get('gain', 1.0))
        placed += 1
    report['voiceClips'] = placed

    regions = man.get('speech', [])
    rider = man.get('bedRider')
    if rider:
        # 2'. The bed rider levels the (engine-ducked) bed against the real voice, in place of
        # the fixed extra duck below: under speech -18 LU, risen in the real pauses.
        ref = voice + web_speech if web_speech is not None else voice
        gain, report['bedRider'] = ride_bed(beds, ref, sr, regions, rider)
        beds *= gain[:, None]
        if dry is not None:
            dry *= gain[:, None]
        regions_duck = []
    else:
        regions_duck = regions
    # 2. Extra bed duck under speech: at least `extraDuckDb`, and deeper where the
    # engine's own duck is shallow, so the total is >= `minDuckDb` everywhere.
    extra = float(man.get('extraDuckDb', 0))
    min_duck = float(man.get('minDuckDb', 16))
    depths = []
    for a, b in regions_duck:
        e = engine_duck(beds, dry, sr, a, b)
        need = -(min_duck + (e if e is not None else 0.0))  # e is negative (dB the engine already ducked)
        depths.append(max(-24.0, min(extra, need)))
    g = duck_curve(n, sr, regions_duck, depths, float(man.get('duckAttack', 0.12)),
                   float(man.get('duckHold', 0.35)), float(man.get('duckRelease', 0.7)))
    beds *= g[:, None]

    # Bed level: the bed under speech sits `bedUnderVoiceDb` below the voice
    # (median over speech regions where a bed plays), so between sentences and
    # in pauses it comes up by the duck depth. Voices: the clips placed here plus
    # the recorded voices the channel played through its own speech bus.
    ref = voice + web_speech if web_speech is not None else voice
    rels = []
    for a, b in regions:
        s0, s1 = int((a + 0.35) * sr), int(min(b, n / sr) * sr)
        if s1 - s0 < int(0.8 * sr):
            continue
        v = rms_db(ref[s0:s1])
        bd = rms_db(beds[s0:s1])
        if v > -45 and bd > -75:
            rels.append(bd - v)
    target_rel = None if rider else man.get('bedUnderVoiceDb')
    level = {'regions': len(rels)}
    if rels and target_rel is not None:
        auto = max(-6.0, min(9.0, float(target_rel) - float(np.median(rels))))
        beds *= 10 ** (auto / 20)
        if dry is not None:
            dry *= 10 ** (auto / 20)
        level.update({'autoGainDb': round(auto, 1), 'underVoiceDb': round(float(np.median(rels)) + auto, 1)})
    # Where the bed sits against the voice in the clear (outside speech, where a
    # bed plays): the composer's calibration, reported for the record.
    if rels:
        mask = np.ones(n, dtype=bool)
        for a, b in regions:
            mask[int(max(0, a - 0.2) * sr):int(min(n / sr, b + 1.2) * sr)] = False
        bed_mono = beds.mean(axis=1)
        clear = []
        for k in range(0, n - sr // 2, sr // 2):
            if mask[k:k + sr // 2].all():
                lv = rms_db(bed_mono[k:k + sr // 2])
                if lv > -70:
                    clear.append(lv)
        voice_lv = float(np.median([rms_db(ref[int((a + 0.35) * sr):int(min(b, n / sr) * sr)]) for a, b in regions if b - a > 1.2]))
        if clear:
            level['clearVsVoiceDb'] = round(float(np.median(clear)) - voice_lv, 1)
        level['underVoiceDb'] = level.get('underVoiceDb', round(float(np.median(rels)), 1))
    report['bedLevel'] = level

    # Bed duck measurement: final bed vs the same cues rendered without speech.
    if dry is not None:
        ducks = []
        for a, b in regions:
            s0, s1 = int((a + 0.35) * sr), int(min(b, n / sr) * sr)
            if s1 - s0 < int(0.8 * sr):
                continue
            ref = rms_db(dry[s0:s1])
            if ref < -62:
                continue  # no bed playing there (grave story, ad, open)
            ducks.append(round(rms_db(beds[s0:s1]) - ref, 1))
        report['bedDuckDb'] = {'regions': len(ducks), 'median': float(np.median(ducks)) if ducks else None,
                               'weakest': max(ducks) if ducks else None}
    quiet = []
    for q in man.get('quiet', []):
        s0, s1 = int(max(0, q['from']) * sr), int(min(n / sr, q['to']) * sr)
        if s1 - s0 > sr // 2:
            quiet.append({**q, 'bedRmsDb': round(rms_db(beds[s0:s1]), 1)})
    report['quiet'] = quiet

    mix = web + beds + voice[:, None]
    studio = man.get('studio') or []
    rt = man.get('roomTone')
    if rt and studio:
        tone = room_tone(n, sr, studio, float(rt.get('db', -58)), float(rt.get('fade', 0.5)))
        if tone is not None:
            mix += tone
            report['roomTone'] = {'db': float(rt.get('db', -58)), 'windows': [[round(a, 2), round(b, 2)] for a, b in studio]}
    # Fades: 10 ms in (no click on the first sample), `fadeOut` s out at the end of the recording.
    fi = min(n, int(0.01 * sr))
    mix[:fi] *= np.linspace(0, 1, fi)[:, None]
    fo = min(n, int(float(man.get('fadeOut', 0) or 0) * sr))
    if fo > 1:
        mix[n - fo:] *= (0.5 + 0.5 * np.cos(np.pi * np.arange(fo) / (fo - 1)))[:, None]
        report['fadeOut'] = round(fo / sr, 2)
    write_wav_f32(os.path.join(stems_dir, 'voice.wav'), voice, sr)
    write_wav_f32(os.path.join(stems_dir, 'webaudio.wav'), web, sr)
    if web_speech is not None:
        write_wav_f32(os.path.join(stems_dir, 'speechbus.wav'), web_speech, sr)
    write_wav_f32(os.path.join(stems_dir, 'beds.wav'), beds, sr)
    raw_path = os.path.join(stems_dir, 'mix-raw.wav')
    write_wav_f32(raw_path, mix, sr)
    report['stemsLUFS'] = {k: ebur128(os.path.join(stems_dir, f'{k}.wav'))['I'] for k in ('voice', 'webaudio', 'beds')}
    raw = ebur128(raw_path)
    report['raw'] = raw

    # 3. Loudness: gain + true-peak limit, verified on the decoded AAC.
    target = float(man.get('lufs', -16))
    tp_max = float(man.get('tp', -1.5))
    ceiling = tp_max - 0.7
    gain_db = target - raw['I'] if math.isfinite(raw['I']) else 0.0
    out_wav = man['out']
    out_aac = man.get('aac') or os.path.splitext(out_wav)[0] + '.m4a'
    final = None
    for attempt in range(5):
        y = mix * 10 ** (gain_db / 20)
        y, overs, gmin = true_peak_limit(y, sr, ceiling)
        write_wav_f32(out_wav, y, sr)
        subprocess.run([FFMPEG, '-v', 'error', '-y', '-i', out_wav, '-c:a', 'aac', '-b:a', str(man.get('bitrate', '192k')), out_aac], check=True)
        final = ebur128(out_aac)
        final.update({'gainDb': round(gain_db, 2), 'ceilingDb': round(ceiling, 2), 'limitedSamples': overs, 'maxGainReductionDb': round(db(gmin), 2), 'attempt': attempt + 1})
        ok_i = abs(final['I'] - target) <= 0.4
        ok_tp = final['TP'] <= tp_max
        if ok_i and ok_tp:
            break
        if not ok_tp:
            ceiling -= (final['TP'] - tp_max) + 0.15
        if not ok_i:
            gain_db += target - final['I']
    report['final'] = final
    report['aac'] = out_aac
    if studio:
        runs = silent_runs(y, sr, studio)
        report['silentRuns'] = {'floorDb': -70, 'minSeconds': 0.25, 'count': len(runs), 'runs': runs[:20]}
    print(json.dumps(report))


if __name__ == '__main__':
    main()
