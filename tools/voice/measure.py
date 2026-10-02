#!/usr/bin/env python3
"""Calibrate and measure the GLOBIT 24 voices (dev tool).

  python3 tools/voice/measure.py calibrate          # rewrite tone.json
  python3 tools/voice/measure.py samples --out DIR  # 8 presenter lines + report
  python3 tools/voice/measure.py rates              # speaking rate per preset

`samples` writes, per presenter: <id>.m4a (to listen to), <id>.ogg (what the
web gets), wav/<id>.wav, <id>.png (spectrogram) and raw/<id>.* (Kokoro before
processing, for comparison), plus spectrograms.png and report.json with
ffmpeg ebur128 loudness, true peak, LRA and the metrics.py checks.
"""

import argparse
import json
import os
import re
import subprocess
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import metrics  # noqa: E402
from audio_io import write_audio  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))

CALIBRATION_TEXT = (
    'The committee met on Thursday to discuss the budget. Experts warned that rising prices '
    'could squeeze household spending this winter, while officials insisted the economy '
    'remains strong. Scientists say the results are surprising, and they will publish the '
    'full study next month.'
)

# One line per presenter, in character and in the channel's adult, dry register
# (see the owner's tone correction and docs/programmes/*.md).
LINES = {
    'paco': "Good evening. Leaders from forty nations have agreed, after nine years of talks, on a "
            "treaty to protect the high seas. It covers almost half the planet's surface. Nobody ever "
            "said diplomacy was quick.",
    'lola': "Thanks, Paco. In Lisbon, a retired teacher has knitted more than two thousand hats for "
            "newborn babies in the city's hospitals. She says the secret is simple: one row every "
            "evening, and never on a Sunday.",
    'max': "A start-up in Seoul says its new phone battery charges fully in ninety seconds. It has "
           "shown the demo, but not the independent tests. If it works, the slowest part of your "
           "morning will be the kettle.",
    'ada': "Ninety seconds is the headline. The small print says the battery was tested in a lab, at "
           "room temperature, for two weeks. So the question is the one nobody has answered yet: how "
           "long does it actually last?",
    'nova': "The James Webb Space Telescope has found water vapour around a planet 120 light years "
            "away. Think of it as seeing the steam from a cup of tea on the other side of the country. "
            "It does not mean life. It means we know where to look.",
    'unit8': "Number of the day: 120. That is the distance to the planet, in light years. At current "
             "rocket speeds, the journey would take two million years. I have cleared my calendar.",
    'penny': "Markets closed higher today. The FTSE 100 rose 1.2%, and the pound gained half a cent "
             "against the dollar. For households, the headline is simpler: mortgage rates are expected "
             "to fall slightly from next month.",
    'sam': "The headlines at nine o'clock. Heavy rain has closed schools across northern Italy. Japan's "
           "new bullet train has set a speed record of 443 kilometres an hour. And in football, Brazil "
           "are through to the final.",
}

# Overall reading pace (words per minute, pauses included) from the style
# bibles: world-now (Paco 165-175, Lola 172-185), tech-bytes (stories 165-175,
# Max ~10 above Ada), cosmos (Nova 140-150, UNIT-8 125-135); money and
# news-60 have no bible yet: crisp 172 and rapid-fire 185.
TARGET_WPM = {'paco': 170, 'lola': 178, 'max': 175, 'ada': 166, 'nova': 145, 'unit8': 130,
              'penny': 172, 'sam': 185}

TONE_BANDS = [1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 11200]
LTAS_BANDS = [100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000] + TONE_BANDS[:-1]


def ebur128(path):
    """Integrated loudness, LRA and true peak as measured by ffmpeg."""
    proc = subprocess.run(['ffmpeg', '-nostats', '-hide_banner', '-i', path, '-af',
                           'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True)
    summary = proc.stderr[proc.stderr.rfind('Summary:'):]

    def grab(label):
        m = re.search(label + r':\s+(-?[\d.]+|-inf)', summary)
        return float(m.group(1)) if m else None
    return {'I': grab('I'), 'LRA': grab('LRA'), 'TP': grab('Peak')}


def spectrogram(src, png, title=None):
    vf = 'showspectrumpic=s=1000x260:legend=1:scale=log:fscale=lin:color=intensity:gain=1'
    subprocess.run(['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', src,
                    '-lavfi', vf, png], check=True)


def timing_png(wav, reply, text, png, width=1600):
    """Spectrogram + waveform with a line and label at every word start (to eyeball sync)."""
    dur = reply['duration']
    font = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    marks = []
    for i, w in enumerate(reply['words']):
        x = int(w['t'] / dur * width)
        word = text[w['char']:w['char'] + w['len']].replace("'", '’').replace(':', r'\:').replace(',', r'\,')
        y = 4 + (i % 3) * 16
        marks.append(f"drawbox=x={x}:y=0:w=1:h=ih:color=cyan@0.8:t=fill")
        marks.append(f"drawtext=fontfile={font}:text='{word}':x={x + 2}:y={y}:fontsize=13:fontcolor=white:box=1:boxcolor=black@0.6")
    for p in reply['phrases']:
        x0, x1 = int(p['t'] / dur * width), int((p['t'] + p['dur']) / dur * width)
        marks.append(f"drawbox=x={x0}:y=ih-6:w={max(1, x1 - x0)}:h=6:color=yellow@0.9:t=fill")
    graph = (f"[0:a]showspectrumpic=s={width}x300:legend=0:scale=log:fscale=lin:color=intensity[s];"
             f"[0:a]showwavespic=s={width}x120:colors=white[w];[s][w]vstack=2[v];[v]{','.join(marks)}[out]")
    subprocess.run(['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', wav,
                    '-filter_complex', graph, '-map', '[out]', '-frames:v', '1', png], check=True)


def make_engine():
    from engine import VoiceEngine
    return VoiceEngine()


def cmd_calibrate(args):
    eng = make_engine()
    names = [v for v in eng.voice_names() if v[:2] in ('af', 'am', 'bf', 'bm')]
    curves = {}
    for name in names:
        audio, sr, _ = eng.speak({'text': CALIBRATION_TEXT, 'voice': name, 'raw': True, 'tone': False})
        curves[name] = metrics.third_octave_ltas(audio, sr, TONE_BANDS)
        print(f'{name:12s}', ' '.join(f'{v:6.1f}' for v in curves[name]), flush=True)
    target = np.median(np.array(list(curves.values())), axis=0)
    out = {}
    for name, ltas in curves.items():
        corr = np.clip(0.7 * (target - ltas), -4.0, 3.0)
        corr[0] = 0.0  # 1.25 kHz anchor: below it the voice is left alone
        smooth = corr.copy()
        smooth[1:-1] = 0.25 * corr[:-2] + 0.5 * corr[1:-1] + 0.25 * corr[2:]
        smooth[0] = 0.0
        out[name] = [round(float(v), 1) for v in smooth]
    doc = {
        'note': 'Per-voice tonal match (dB) applied before the broadcast EQ: 70% of the '
                'difference to the median long-term spectrum of the English Kokoro voices, '
                'clamped to -4..+3 dB, from 1.6 kHz up. Generated by measure.py calibrate.',
        'bands': TONE_BANDS,
        'target': [round(float(v), 1) for v in target],
        'voices': out,
    }
    with open(os.path.join(HERE, 'tone.json'), 'w', encoding='utf-8') as f:
        json.dump(doc, f, indent=1)
        f.write('\n')
    print('wrote tone.json')


def overall_wpm(reply):
    return 60 * len(reply['words']) / reply['duration'] if reply['duration'] else 0.0


def cmd_rates(args):
    """Measured pace per preset on the calibration text and on its own line, and
    the speed that would hit the bible's target (pace scales ~linearly with speed)."""
    eng = make_engine()
    for pid in sorted(eng.presets):
        speed = float(eng.presets[pid].get('speed') or 1.0)
        rates = []
        for text in (CALIBRATION_TEXT, LINES.get(pid, CALIBRATION_TEXT)):
            _, _, reply = eng.speak({'text': text, 'voice': pid, 'raw': True})
            rates.append(overall_wpm(reply))
        wpm = sum(rates) / len(rates)
        target = TARGET_WPM.get(pid, 175)
        print(f'{pid:6s} {eng.presets[pid]["voice"]:30s} speed {speed:.2f} -> '
              f'{rates[0]:5.0f} / {rates[1]:5.0f} wpm (calib / line), target {target}, '
              f'suggest speed {speed * target / wpm:.2f}', flush=True)


def cmd_samples(args):
    out = os.path.abspath(args.out)
    for sub in ('', 'wav', 'raw'):
        os.makedirs(os.path.join(out, sub), exist_ok=True)
    eng = make_engine()
    only = args.only.split(',') if args.only else list(LINES)
    report = {}
    for pid in only:
        text = LINES[pid]
        audio, sr, reply = eng.speak({'text': text, 'voice': pid, 'phones': True})
        raw, _, _ = eng.speak({'text': text, 'voice': pid, 'raw': True, 'tone': False})
        wav = os.path.join(out, 'wav', pid + '.wav')
        write_audio(wav, audio, sr)
        write_audio(os.path.join(out, pid + '.m4a'), audio, sr)
        write_audio(os.path.join(out, pid + '.ogg'), audio, sr)
        write_audio(os.path.join(out, 'raw', pid + '.wav'), raw, sr)
        write_audio(os.path.join(out, 'raw', pid + '.m4a'), raw, sr)
        spectrogram(wav, os.path.join(out, pid + '.png'))
        spectrogram(os.path.join(out, 'raw', pid + '.wav'), os.path.join(out, 'raw', pid + '.png'))
        timing_png(wav, reply, text, os.path.join(out, 'wav', pid + '-words.png'))
        with open(os.path.join(out, 'wav', pid + '.json'), 'w', encoding='utf-8') as f:
            json.dump({'text': text, **reply}, f, ensure_ascii=False)
        entry = {
            'voice': reply['voice'], 'lang': reply['lang'], 'speed': reply['speed'],
            'effect': reply['effect'], 'duration': reply['duration'],
            'engine': {'lufs': reply['lufs'], 'truePeak': reply['truePeak'],
                       'deessMaxDb': reply['deessMaxDb'], 'compMeanDb': reply['compMeanDb']},
            'm4a': ebur128(os.path.join(out, pid + '.m4a')),
            'ogg': ebur128(os.path.join(out, pid + '.ogg')),
            'raw': ebur128(os.path.join(out, 'raw', pid + '.wav')),
            'wpm': round(overall_wpm(reply)),
            'paceWpm': round(metrics.syllable_wpm(reply['phones'], reply['duration'])),
            'targetWpm': TARGET_WPM.get(pid),
            'f0': round(metrics.f0_median(audio, sr)),
            'sibilanceDb': round(metrics.sibilance_db(audio, sr), 1),
            'rawSibilanceDb': round(metrics.sibilance_db(raw, sr), 1),
            'balance': metrics.band_balance(audio, sr),
            'rawBalance': metrics.band_balance(raw, sr),
            'whistleDb': metrics.whistle_db(audio, sr),
            'rawWhistleDb': metrics.whistle_db(raw, sr),
            'clicks': metrics.clicks(audio, sr),
            'rawClicks': metrics.clicks(raw, sr),
            'edges': metrics.edges(audio, sr),
        }
        if reply.get('effect') == 'robot':
            clean, _, _ = eng.speak({'text': text, 'voice': pid, 'effect': 'none'})
            entry['stoiVsClean'] = round(metrics.stoi(clean, audio, sr), 3)
            write_audio(os.path.join(out, 'raw', pid + '-no-robot.m4a'), clean, sr)
        report[pid] = entry
        print(f"{pid:6s} {entry['voice']:30s} dur {entry['duration']:5.2f}s  m4a I {entry['m4a']['I']} "
              f"TP {entry['m4a']['TP']}  ogg I {entry['ogg']['I']} TP {entry['ogg']['TP']}  "
              f"raw I {entry['raw']['I']} TP {entry['raw']['TP']}  sib {entry['sibilanceDb']} "
              f"(raw {entry['rawSibilanceDb']})  clicks {entry['clicks']}  wpm {entry['wpm']} pace {entry['paceWpm']}  "
              f"f0 {entry['f0']}" + (f"  STOI {entry['stoiVsClean']}" if 'stoiVsClean' in entry else ''),
              flush=True)
    with open(os.path.join(out, 'report.json'), 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=1)
    pngs = [os.path.join(out, p + '.png') for p in only if os.path.exists(os.path.join(out, p + '.png'))]
    if len(pngs) > 1:
        cmd = ['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-y']
        for p in pngs:
            cmd += ['-i', p]
        cmd += ['-filter_complex', f'vstack=inputs={len(pngs)}', os.path.join(out, 'spectrograms.png')]
        subprocess.run(cmd, check=True)


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    sub.add_parser('calibrate')
    sub.add_parser('rates')
    s = sub.add_parser('samples')
    s.add_argument('--out', required=True)
    s.add_argument('--only', help='comma-separated presenter ids')
    args = ap.parse_args()
    {'calibrate': cmd_calibrate, 'rates': cmd_rates, 'samples': cmd_samples}[args.cmd](args)


if __name__ == '__main__':
    main()
