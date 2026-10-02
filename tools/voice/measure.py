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

# One line per presenter, written in character (see config/channel.json).
LINES = {
    'paco': "Good evening. Leaders from forty nations met in Geneva today and agreed, at last, "
            "on a plan to protect the world's oceans. It took nine years. Nobody said diplomacy was quick.",
    'lola': "Thanks, Paco! Now, here's a story that made the whole newsroom smile: a retired teacher "
            "in Lisbon has knitted more than two thousand hats for newborn babies, and she says she's "
            "only getting started.",
    'max': "Okay, this one is wild. A start-up in Seoul has built a phone battery that charges in "
           "ninety seconds. Ninety! I've had toast that took longer. Ada, tell me you're not impressed.",
    'ada': "I'm impressed, Max, but cautiously. The company hasn't published independent tests yet, "
           "and fast charging usually means more heat. So the question is simple: how long does the "
           "battery actually last?",
    'nova': "Tonight, the James Webb telescope has spotted water vapour around a planet 120 light "
            "years away. Think of it like seeing the steam from a cup of tea, from the other side "
            "of the country.",
    'unit8': "Correction. The planet is 120 light years away. At current rocket speeds, the trip "
             "would take two million years. I have added it to my calendar.",
    'penny': "Markets closed higher today. The FTSE 100 rose 1.2%, and the pound gained against the "
             "dollar. For households, the headline is simpler: mortgage rates are expected to fall "
             "slightly from next month.",
    'sam': "Here are the headlines at nine o'clock. Heavy rain has closed schools across northern "
           "Italy, Japan's new bullet train has set a speed record, and in sport, Brazil are through "
           "to the final.",
}

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


def cmd_rates(args):
    eng = make_engine()
    for pid in sorted(eng.presets):
        _, _, reply = eng.speak({'text': CALIBRATION_TEXT, 'voice': pid, 'raw': True})
        print(f'{pid:6s} {eng.presets[pid]["voice"]:32s} speed {reply["speed"]:.2f} '
              f'{metrics.speech_rate(reply["words"], reply["phrases"]):5.0f} wpm (speaking time)')


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
            'wpm': round(metrics.speech_rate(reply['words'], reply['phrases'])),
            'f0': round(metrics.f0_median(audio, sr)),
            'sibilanceDb': round(metrics.sibilance_db(audio, sr), 1),
            'rawSibilanceDb': round(metrics.sibilance_db(raw, sr), 1),
            'balance': metrics.band_balance(audio, sr),
            'rawBalance': metrics.band_balance(raw, sr),
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
              f"(raw {entry['rawSibilanceDb']})  clicks {entry['clicks']}  wpm {entry['wpm']}  "
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
