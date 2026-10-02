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

    # 2. Extra bed duck under speech: at least `extraDuckDb`, and deeper where the
    # engine's own duck is shallow, so the total is >= `minDuckDb` everywhere.
    regions = man.get('speech', [])
    extra = float(man.get('extraDuckDb', -6))
    min_duck = float(man.get('minDuckDb', 16))
    depths = []
    for a, b in regions:
        e = engine_duck(beds, dry, sr, a, b)
        need = -(min_duck + (e if e is not None else -10.0))  # e is negative (dB the engine already ducked)
        depths.append(max(-18.0, min(extra, need)))
    g = duck_curve(n, sr, regions, depths, float(man.get('duckAttack', 0.12)),
                   float(man.get('duckHold', 0.35)), float(man.get('duckRelease', 0.7)))
    beds *= g[:, None]

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
    write_wav_f32(os.path.join(stems_dir, 'voice.wav'), voice, sr)
    write_wav_f32(os.path.join(stems_dir, 'webaudio.wav'), web, sr)
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
    print(json.dumps(report))


if __name__ == '__main__':
    main()
