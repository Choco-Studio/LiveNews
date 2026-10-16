#!/usr/bin/env python3
"""The voice audit: every cast voice reading the channel's own copy, rendered and measured (dev tool).

  node tools/voice/audit-requests.mjs --out /tmp/a/reqs.jsonl            # what the station would ask for
  python3 tools/voice/audit.py render --reqs /tmp/a/reqs.jsonl --out /tmp/a/clips
  python3 tools/voice/audit.py measure --dir /tmp/a/clips --json /tmp/a/audit.json [--scorer my_scorer.py]
  python3 tools/voice/audit.py measure --dir /tmp/a/clips --write        # tools/voice/voice-audit.json

`render` goes through the same engine as the worker (tools/voice/engine.py) and writes <out>/<voice>/<line>.wav
plus the engine's reply; `--extra '{"melody": false}'` adds request fields (A/B tests). Clips already rendered
from the same request are kept.

`measure` reads every clip and reports per voice:
  - pace: characters a second (the writers' timing unit, clip edges included), words a minute;
  - pitch: median F0, the spread (IQR, semitones) and the frame-to-frame jumps of more than 1.5 st;
  - voicing quality: YIN aperiodicity at the period and the harmonics-to-noise ratio of the voiced frames (both
    move when processing smears the harmonics: a pitch shift's splices, a vocoder);
  - timbre: the voice's signature (metrics.timbre_signature) on the 'common' lines, which every voice reads, and
    its distance to every other voice (metrics.timbre_distance), with the closest pairs inside each programme
    (config/channel.json: its presenters, contestants, experts and correspondents);
  - with `--scorer FILE`: whatever the scorer returns per clip, averaged (word error rate of a speech recogniser
    against the text, a predicted listening score). A scorer is a Python file defining
    `Scorer().score(audio_16k: numpy array, text: str, have: dict, clip: dict) -> dict` with numeric fields ('wer' as
    {'errors', 'words'} so it is weighted by words) and a `fields` list (a clip is scored again while one of them is
    missing; `have` is what the clip already has); none ships with the channel (they need model downloads).
`--write` stores the summary in tools/voice/voice-audit.json, which the tests read: the casting sheet must match
what was measured.
"""

import argparse
import glob
import hashlib
import importlib.util
import json
import os
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import dsp  # noqa: E402
import metrics  # noqa: E402

AUDIT_FILE = os.path.join(HERE, 'voice-audit.json')
LINES_FILE = os.path.join(HERE, 'audit-lines.json')
PLAN_FILE = os.path.join(HERE, '..', '..', 'server', 'voice', 'plan.js')


def plan_recipe():
    """The station's rendering recipe (server/voice/plan.js RECIPE): bumped whenever the rendering changes, so a
    summary measured under another recipe is known to be stale."""
    import re
    m = re.search(r'export const RECIPE = (\d+);', open(PLAN_FILE, encoding='utf-8').read())
    return int(m.group(1)) if m else None


# ------------------------------------------------------------------ render

def cmd_render(a):
    from audio_io import write_audio
    from engine import VoiceEngine
    extra = json.loads(a.extra)
    only = set(filter(None, a.only.split(',')))
    eng = VoiceEngine()
    t0, n = time.time(), 0
    for row in open(a.reqs, encoding='utf-8'):
        if not row.strip():
            continue
        r = json.loads(row)
        if only and r['label'] not in only:
            continue
        req = {**r['req'], **extra}
        key = hashlib.sha1(json.dumps(req, sort_keys=True).encode()).hexdigest()[:12]
        d = os.path.join(a.out, r['label'])
        os.makedirs(d, exist_ok=True)
        wav, meta = os.path.join(d, r['line'] + '.wav'), os.path.join(d, r['line'] + '.json')
        if os.path.exists(wav) and os.path.exists(meta):
            try:
                if json.load(open(meta, encoding='utf-8')).get('key') == key:
                    continue
            except ValueError:
                pass
        audio, sr, reply = eng.speak(req)
        write_audio(wav, audio, sr)
        reply.pop('levels', None)
        with open(meta, 'w', encoding='utf-8') as f:
            json.dump({'key': key, 'label': r['label'], 'id': r['id'], 'line': r['line'], 'set': r['set'],
                       'text': r['text'], 'req': req, **reply}, f, ensure_ascii=False)
        n += 1
        print(f"{r['label']:14s} {r['line']:12s} {reply['duration']:5.2f}s in {reply['elapsed']:.2f}s", flush=True)
    print(f'{n} clips rendered in {time.time() - t0:.0f}s', flush=True)


# ------------------------------------------------------------------ measures

def aperiodicity(x, sr, fmin=60.0, fmax=400.0, frame=0.04, hop=0.01):
    """Median YIN aperiodicity (cumulative-mean-normalised difference at the period) of the voiced frames."""
    x = np.asarray(x, dtype=np.float64)
    fl, hp = int(frame * sr), int(hop * sr)
    maxlag = min(int(sr / fmin) + 2, fl // 2)
    minlag = max(2, int(sr / fmax))
    win = fl - maxlag
    if len(x) < fl + hp:
        return 1.0
    idx = np.arange(0, len(x) - fl, hp)
    frames = x[idx[:, None] + np.arange(fl)]
    nfft = 1 << int(np.ceil(np.log2(fl + win)))
    head = np.zeros_like(frames)
    head[:, :win] = frames[:, :win]
    cross = np.fft.irfft(np.conj(np.fft.rfft(head, nfft)) * np.fft.rfft(frames, nfft), nfft)[:, :maxlag + 1]
    c = np.concatenate([np.zeros((len(idx), 1)), np.cumsum(frames ** 2, axis=1)], axis=1)
    lags = np.arange(maxlag + 1)
    d = np.maximum(c[:, win][:, None] + c[:, lags + win] - c[:, lags] - 2 * cross, 0.0)
    cum = np.cumsum(d[:, 1:], axis=1)
    dn = d[:, 1:] * np.arange(1, maxlag + 1) / np.maximum(cum, 1e-12)
    best = dn[:, minlag - 1:maxlag - 1].min(axis=1)
    rms = np.sqrt(np.mean(frames ** 2, axis=1))
    voiced = (rms > 0.1 * rms.max()) & (best < 0.35)
    return float(np.median(best[voiced])) if voiced.any() else 1.0


def hnr(x, sr, frame=0.04, hop=0.01, fmin=70.0, fmax=400.0):
    """Mean harmonics-to-noise ratio (dB) of the voiced frames, by normalised autocorrelation (Boersma 1993)."""
    x = np.asarray(x, dtype=np.float64)
    fl, hp = int(frame * sr), int(hop * sr)
    if len(x) < fl + hp:
        return 0.0
    w = np.hanning(fl)
    n = 1 << int(np.ceil(np.log2(2 * fl)))
    rw = np.fft.irfft(np.abs(np.fft.rfft(w, n)) ** 2, n)[:fl]
    rw = np.maximum(rw / rw[0], 1e-3)
    lo, hi = int(sr / fmax), int(sr / fmin)
    idx = np.arange(0, len(x) - fl, hp)
    frames = x[idx[:, None] + np.arange(fl)]
    rms = np.sqrt(np.mean(frames ** 2, axis=1))
    keep = rms > 0.1 * rms.max()
    f = (frames[keep] - frames[keep].mean(axis=1, keepdims=True)) * w
    ac = np.fft.irfft(np.abs(np.fft.rfft(f, n, axis=1)) ** 2, n, axis=1)[:, :fl]
    ok = ac[:, 0] > 0
    ac = ac[ok] / ac[ok, :1] / rw
    peak = ac[:, lo:hi].max(axis=1)
    peak = peak[(peak > 0.5) & (peak < 0.9999)]
    return float(np.mean(10 * np.log10(peak / (1 - peak)))) if len(peak) else 0.0


def clip_measures(x, sr, meta):
    """Pace, pitch, pauses and voicing quality of one rendered clip (see the module docstring)."""
    out = {}
    t, f0 = dsp.pitch_track(x, sr)
    if len(f0) >= 10:
        st = 12 * np.log2(f0 / np.median(f0))
        out['f0'] = float(np.median(f0))
        out['iqrSt'] = float(np.percentile(st, 75) - np.percentile(st, 25))
        d = np.abs(np.diff(st))
        cont = np.diff(t) < 0.015
        out['jumps'] = float(np.mean(d[cont] > 1.5)) if cont.any() else 0.0
    out['aper'] = aperiodicity(x, sr)
    out['hnr'] = hnr(x, sr)
    dur = meta.get('duration') or len(x) / sr
    out['cps'] = len(meta['text']) / dur
    out['wpm'] = 60 * len(meta.get('words', [])) / dur
    return out


def load_scorer(path):
    spec = importlib.util.spec_from_file_location('voice_audit_scorer', path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.Scorer()


def to16k(x, sr):
    if sr == 16000:
        return np.asarray(x, dtype=np.float64)
    return metrics.resample(x, sr, 16000)


def programme_groups():
    """The people heard on each programme (config/channel.json, the programmes and the drafts: presenters,
    contestants, experts and correspondents), the voices that must sound most unlike each other: {title: [ids]}."""
    channel = json.load(open(os.path.join(os.path.dirname(os.path.dirname(HERE)), 'config', 'channel.json'), encoding='utf-8'))
    out = {}
    # the programmes on air and the drafts still being built (FULL TIME, PAY ATTENTION): their people are cast already
    progs = {**channel.get('programs', {}), **{k: v for k, v in (channel.get('drafts') or {}).items() if isinstance(v, dict)}}
    for pid, p in progs.items():
        people = []
        for key in ('presenters', 'contestants', 'experts', 'correspondents'):
            for who in p.get(key) or []:
                if who not in people:
                    people.append(who)
        if len(people) > 1:
            out[p.get('title') or pid] = people
    return out


def group_pairs(dist, groups):
    """Each group's pairs, closest first: {group: [[a, b, distance], ...]}."""
    out = {}
    for name, members in groups.items():
        m = [x for x in members if x in dist]
        pairs = sorted(([x, y, dist[x][y]] for i, x in enumerate(m) for y in m[i + 1:]), key=lambda p: p[2])
        out[name] = pairs
    return out


def cmd_measure(a):
    import soundfile as sf
    scorer = load_scorer(a.scorer) if a.scorer else None
    voices, sigs = {}, {}
    for d in a.dir:
        for lab_dir in sorted(glob.glob(os.path.join(d, '*'))):
            metas = [json.load(open(p, encoding='utf-8')) for p in sorted(glob.glob(os.path.join(lab_dir, '*.json')))
                     if not p.endswith('.measure.json')]
            metas = [m for m in metas if isinstance(m, dict) and 'req' in m and 'line' in m]
            if not metas:
                continue
            label = metas[0]['label']
            clips, common = [], []
            for m in metas:
                wav = os.path.join(lab_dir, m['line'] + '.wav')
                cache = os.path.join(lab_dir, m['line'] + '.measure.json')
                got = {}
                if os.path.exists(cache):
                    got = json.load(open(cache, encoding='utf-8'))
                    if got.get('key') != m['key']:
                        got = {}
                x, sr = sf.read(wav, dtype='float64')
                if 'aper' not in got:
                    got.update(clip_measures(x, sr, m))
                if scorer and any(f not in got for f in getattr(scorer, 'fields', ['scored'])):
                    got.update(scorer.score(to16k(x, sr), m['text'], got, m))
                    got['scored'] = True
                got['key'] = m['key']
                with open(cache, 'w', encoding='utf-8') as f:
                    json.dump(got, f, ensure_ascii=False)
                clips.append(got)
                if m['set'] == 'common':
                    common.append((x, sr))
            req = metas[0]['req']
            row = {'voice': req['voice'], 'speed': req['speed'], 'lang': req['lang'], 'effect': req.get('effect'),
                   'clips': len(clips)}
            for k in ('cps', 'wpm', 'f0', 'iqrSt', 'jumps', 'aper', 'hnr'):
                v = [c[k] for c in clips if c.get(k) is not None]
                if v:
                    row[k] = round(float(np.median(v)), 4 if k in ('jumps', 'aper') else 2)
            # error rates ({'errors', 'words'} per clip), weighted by words: 'wer' and any other recogniser's
            rates = {k for c in clips for k, v in c.items() if isinstance(v, dict) and {'errors', 'words'} <= set(v)}
            for k in sorted(rates):
                w = [c[k] for c in clips if isinstance(c.get(k), dict)]
                row[k] = round(sum(x['errors'] for x in w) / max(1, sum(x['words'] for x in w)), 4)
            numeric = {k for c in clips for k, v in c.items() if isinstance(v, (int, float)) and not isinstance(v, bool)}
            for k in sorted(numeric - set(row) - {'scored'}):
                v = [c[k] for c in clips if isinstance(c.get(k), (int, float))]
                row[k] = round(float(np.mean(v)), 3)
                row[k + 'Min'] = round(float(np.min(v)), 3)
            voices[label] = row
            if common:
                sigs[label] = metrics.timbre_signature(common)
    labels = [k for k in voices if k in sigs]
    dist = {x: {y: round(metrics.timbre_distance(sigs[x], sigs[y]), 1) for y in labels if y != x} for x in labels}
    base = lambda lab: lab.split(':')[0]  # noqa: E731 - 'qm' and its candidates 'qm:A'... are one character
    for x in labels:
        voices[x]['nearest'] = sorted(([y, d] for y, d in dist[x].items() if base(y) != base(x)), key=lambda p: p[1])[:3]
    doc = {
        'note': 'Written by tools/voice/audit.py measure --write: every cast voice on the audit copy '
                '(tools/voice/audit-lines.json), as the station renders it. See docs/roadmap/critique/voices-naturalness.md.',
        'measuredAt': time.strftime('%Y-%m-%d'),
        'recipe': plan_recipe(),
        'timbreScale': metrics.TIMBRE_SCALE,
        'voices': voices,
        'distance': dist,
        'groups': group_pairs(dist, programme_groups()),
    }
    for g, pairs in doc['groups'].items():
        if pairs:
            print(f"{g}: closest {', '.join(f'{x}-{y} {d}' for x, y, d in pairs[:3])}")
    for k, r in voices.items():
        extra = ' '.join(f'{f} {r[f]}' for f in ('wer', 'mos') if f in r)
        print(f"{k:12s} {r['voice'][:36]:36s} {r['speed']:.2f} {r['lang']} cps {r.get('cps')} f0 {r.get('f0')} "
              f"iqr {r.get('iqrSt')} aper {r.get('aper')} hnr {r.get('hnr')} {extra} near {r.get('nearest')}")
    target = AUDIT_FILE if a.write else a.json
    if target:
        with open(target, 'w', encoding='utf-8') as f:
            json.dump(doc, f, indent=1, ensure_ascii=False)
            f.write('\n')
        print('wrote', target)


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    r = sub.add_parser('render')
    r.add_argument('--reqs', required=True)
    r.add_argument('--out', required=True)
    r.add_argument('--extra', default='{}')
    r.add_argument('--only', default='')
    m = sub.add_parser('measure')
    m.add_argument('--dir', action='append', required=True)
    m.add_argument('--scorer')
    m.add_argument('--json')
    m.add_argument('--write', action='store_true')
    a = ap.parse_args()
    {'render': cmd_render, 'measure': cmd_measure}[a.cmd](a)


if __name__ == '__main__':
    main()
