#!/usr/bin/env python3
"""Pure checks of the mixer's bed rider, room tone and silence check (no browser, no voices):

  python3 tools/showcase/selftest-mix.py

A synthetic 'voice' (band-limited noise bursts at speech level, with short 0.3 s pauses inside
sentences and 1.2 s pauses between them) over a steady bed far too quiet for the bible: the rider
must bring the bed to 18 LU under the voice while someone speaks (short-term windows inside speech in
the -20..-16 LU window), lift it in the 1.2 s pauses but not in the 0.3 s ones, leave a silent bed
silent, and the room tone must fill digital silence above -70 dBFS.
"""

import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mix  # noqa: E402

SR = 48000
passed = 0


def ok(cond, name):
    global passed
    if not cond:
        print(f'not ok - {name}')
        sys.exit(1)
    passed += 1
    print(f'ok - {name}')


def band_noise(n, seed, lo=200, hi=4000):
    rng = np.random.default_rng(seed)
    spec = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    spec[(f < lo) | (f > hi)] = 0
    x = np.fft.irfft(spec, n)
    return x / math.sqrt(float(np.mean(np.square(x))))


# voice: 4 sentences of 4 s, each split by a 0.3 s pause, 1.2 s between sentences
n = int(24 * SR)
voice = np.zeros(n)
regions_true = []
t = 1.0
for s in range(4):
    for part in range(2):
        a, b = t, t + 1.85
        voice[int(a * SR):int(b * SR)] = band_noise(int(b * SR) - int(a * SR), 10 + 2 * s + part) * 0.1
        t = b + (0.3 if part == 0 else 1.2)
    regions_true.append(None)
# regions as the recorder builds them: activity, pauses < 0.6 s bridged
h = int(0.01 * SR)
env = 10 * np.log10(np.mean(np.square(voice[: (n // h) * h]).reshape(-1, h), axis=1) + 1e-20)
spans, on = [], None
for k, v in enumerate(env):
    if v > -48 and on is None:
        on = k
    elif v <= -48 and on is not None:
        spans.append([on * 0.01, k * 0.01])
        on = None
regions = []
for a, b in spans:
    if regions and a - regions[-1][1] < 0.6:
        regions[-1][1] = b
    else:
        regions.append([a, b])
ok(len(regions) == 4, 'speech regions bridge the 0.3 s pauses and keep the 1.2 s ones (4 regions)')

bed = np.stack([band_noise(n, 1, 60, 8000), band_noise(n, 2, 60, 8000)], axis=1) * 0.002  # ~ -54 dBFS
gain, rep = mix.ride_bed(bed.copy(), voice, SR, regions, {'underDb': 18, 'window': [-20, -16], 'gapDb': 11, 'gapMin': 0.6, 'maxLift': 8, 'ceilDb': 6})
ok(abs(rep['underSpeech']['median'] + 18) <= 0.6, f"bed sits 18 LU under the voice while speaking (median {rep['underSpeech']['median']})")
ok(rep['underSpeech']['outsideWindow'] == 0, 'every speech region inside the -20..-16 LU window')
ok(rep['pauses']['lifted'] == 3, f"the 3 pauses of 1.2 s are lifted ({rep['pauses']['lifted']})")
g_db = 20 * np.log10(gain)
mid_long = g_db[int((regions[0][1] + 0.6) * SR)]
mid_short = g_db[int((1.0 + 1.85 + 0.15) * SR)]
base = rep['baseGainDb']
ok(mid_long - base > 4, f'the bed rises in a long pause (+{mid_long - base:.1f} dB)')
ok(abs(mid_short - base) < 0.5, f'no lift inside a 0.3 s pause ({mid_short - base:+.1f} dB)')
ok(g_db[int((regions[1][0] - 0.07) * SR)] - base < 0.5, 'the lift is back down before the next word')
ok(-13.5 <= rep['pauses']['median'] <= -10, f"in the pauses the bed sits near -11 LU ({rep['pauses']['median']})")

# a silent bed stays silent (grave stories, ads)
silent = np.zeros((n, 2))
g2, rep2 = mix.ride_bed(silent.copy(), voice, SR, regions, {'underDb': 18})
ok('skipped' in rep2 and float(np.max(np.abs(silent * g2[:, None]))) == 0.0, 'a silent bed stays silent')

# room tone fills digital silence; the silence check finds what is left
tone = mix.room_tone(n, SR, [[0.5, 20.0]], -58)
lv = 20 * math.log10(math.sqrt(float(np.mean(np.square(tone[int(2 * SR):int(18 * SR)])))))
ok(abs(lv + 58) < 1.0, f'room tone at -58 dBFS RMS ({lv:.1f})')
ok(mix.silent_runs(tone, SR, [[1.0, 19.0]]) == [], 'no silent run under the room tone')
ok(len(mix.silent_runs(np.zeros((n, 2)), SR, [[1.0, 3.0]])) == 1, 'digital silence is reported as a silent run')
print(f'{passed} passed')
