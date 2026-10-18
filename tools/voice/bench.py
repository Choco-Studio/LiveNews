#!/usr/bin/env python3
"""What the voices cost in CPU: CPU-seconds per second of speech, per character, as the station renders them (dev tool).

  node tools/voice/audit-requests.mjs --out /tmp/b/reqs.jsonl --only paco,lola    # the station's own requests
  python3 tools/voice/bench.py --reqs /tmp/b/reqs.jsonl --threads 1 --cpus 0,1 --hog 1 --json /tmp/b/t1-hog.json
  python3 tools/voice/bench.py --reqs /tmp/b/reqs.jsonl --model fp16 --out /tmp/b/clips   # + the clips, for audit.py

Every request goes through the worker's own path (tools/voice/engine.py VoiceEngine.speak, the loudness envelope the
service asks for, the Ogg/Opus file it writes), one at a time, after a warm-up line. Per character it reports the
seconds of speech, the CPU seconds the process spent on them (all its threads, plus ffmpeg's encode as a child), the
wall time, CPU per speech second and the real-time factor, and where the CPU went: the model (onnxruntime), the
phonemes (espeak), the broadcast chain (dsp.broadcast), the encode, and the rest (trim, timing, melody, levels).

The machine of the station can be imitated: `--cpus 0,1` pins the run to two cores, `--hog N` keeps N busy loops on
the same cores for the whole run (the renderer's browser and encoder, which take about a core). Each run is its own
process, so its session settings are its own:
  --model fp32|fp16|int8|<path>   the weights (VOICE_MODEL; default the engine's default)
  --threads N                     onnxruntime intra-op threads (KOKORO_THREADS; 0 = the engine's default)
  --spin 0|1                      whether idle pool threads spin waiting for work (KOKORO_SPIN)
  --opt all|extended|basic|off    graph optimisation level;  --arena 0|1  the CPU memory arena
`--out DIR` also writes each clip as tools/voice/audit.py render does (<DIR>/<label>/<line>.wav + .json), so the
quality of two settings can be compared with `audit.py measure` on the same lines.
"""

import argparse
import hashlib
import json
import os
import resource
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)


def cpu_now():
    """(process CPU seconds of all threads, resource usage of finished children)."""
    return time.process_time(), resource.getrusage(resource.RUSAGE_CHILDREN)


def _child_cpu(r):
    return r.ru_utime + r.ru_stime


class Meter:
    """Accumulates the CPU and wall time spent inside wrapped functions."""

    def __init__(self):
        self.cpu, self.wall = {}, {}

    def wrap(self, name, fn):
        def inner(*a, **k):
            c0, w0 = time.process_time(), time.perf_counter()
            try:
                return fn(*a, **k)
            finally:
                self.cpu[name] = self.cpu.get(name, 0.0) + time.process_time() - c0
                self.wall[name] = self.wall.get(name, 0.0) + time.perf_counter() - w0
        return inner

    def take(self):
        out = dict(self.cpu)
        self.cpu, self.wall = {}, {}
        return out


def start_hogs(n, cpus):
    procs = []
    for _ in range(n):
        p = subprocess.Popen([sys.executable, '-c', 'while True: pass'],
                             preexec_fn=(lambda: os.sched_setaffinity(0, cpus)) if cpus else None)
        procs.append(p)
    return procs


def stop_hogs(procs):
    for p in procs:
        p.kill()
    for p in procs:
        p.wait()


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--reqs', required=True, help='requests (tools/voice/audit-requests.mjs output)')
    ap.add_argument('--only', default='', help='labels to run, comma-separated')
    ap.add_argument('--per-label', type=int, default=0, help='at most this many lines per label')
    ap.add_argument('--model', default=None)
    ap.add_argument('--threads', type=int, default=None)
    ap.add_argument('--spin', type=int, choices=(0, 1), default=None)
    ap.add_argument('--opt', choices=('all', 'extended', 'basic', 'off'), default=None)
    ap.add_argument('--arena', type=int, choices=(0, 1), default=None)
    ap.add_argument('--cpus', default='', help='pin the run (and the hogs) to these cores, e.g. 0,1')
    ap.add_argument('--hog', type=int, default=0, help='busy loops on the same cores during the run')
    ap.add_argument('--no-encode', action='store_true', help='skip the Ogg/Opus encode')
    ap.add_argument('--extra', default='{}', help='request fields added to every request (JSON)')
    ap.add_argument('--out', help='also write the clips (audit.py layout)')
    ap.add_argument('--json', help='write the summary here')
    ap.add_argument('--tag', default='')
    a = ap.parse_args()

    for key, env in (('model', 'VOICE_MODEL'), ('threads', 'KOKORO_THREADS'), ('spin', 'KOKORO_SPIN'),
                     ('opt', 'KOKORO_OPT'), ('arena', 'KOKORO_ARENA')):
        v = getattr(a, key)
        if v is not None:
            os.environ[env] = str(v)
    cpus = {int(c) for c in a.cpus.split(',') if c.strip()} if a.cpus else None
    if cpus:
        os.sched_setaffinity(0, cpus)

    from audio_io import write_audio
    import engine as engine_mod
    from engine import VoiceEngine

    meter = Meter()
    t_load = time.perf_counter()
    eng = VoiceEngine()
    load_s = time.perf_counter() - t_load
    sess = eng.kokoro.sess
    sess.run = meter.wrap('model', sess.run)
    eng.phonemize_phrase = meter.wrap('phonemes', eng.phonemize_phrase)
    engine_mod.dsp.broadcast = meter.wrap('chain', engine_mod.dsp.broadcast)

    only = set(filter(None, a.only.split(',')))
    extra = json.loads(a.extra)
    rows, per = [], {}
    for line in open(a.reqs, encoding='utf-8'):
        if not line.strip():
            continue
        r = json.loads(line)
        if only and r['label'] not in only:
            continue
        if a.per_label and per.get(r['label'], 0) >= a.per_label:
            continue
        per[r['label']] = per.get(r['label'], 0) + 1
        rows.append(r)
    if not rows:
        sys.exit('no requests')

    tmp = tempfile.mkdtemp(prefix='voice-bench-')
    # warm-up: the first pass pays for allocations and the espeak voice load
    eng.speak({'text': 'Good evening, and welcome.', 'voice': rows[0]['req']['voice'], 'lang': rows[0]['req'].get('lang')})
    meter.take()
    hogs = start_hogs(a.hog, cpus)
    time.sleep(0.3 if hogs else 0)
    clips = []
    try:
        for r in rows:
            req = {**r['req'], **extra, 'levels': True}
            eng._cache.clear()  # every line is new to the engine, as on air
            c0, ch0 = cpu_now()
            w0 = time.perf_counter()
            audio, sr, reply = eng.speak(req)
            c1, ch1 = cpu_now()
            w1 = time.perf_counter()
            parts = meter.take()
            enc_cpu = enc_wall = 0.0
            if not a.no_encode:
                path = os.path.join(tmp, 'clip.ogg')
                write_audio(path, audio, sr)
                c2, ch2 = cpu_now()
                enc_wall = time.perf_counter() - w1
                enc_cpu = (c2 - c1) + (_child_cpu(ch2) - _child_cpu(ch1))
            clip = {'label': r['label'], 'line': r['line'], 'speech': reply['duration'],
                    'cpu': (c1 - c0) + enc_cpu, 'wall': (w1 - w0) + enc_wall,
                    'model': parts.get('model', 0.0), 'phonemes': parts.get('phonemes', 0.0),
                    'chain': parts.get('chain', 0.0), 'encode': enc_cpu}
            clip['other'] = clip['cpu'] - clip['model'] - clip['phonemes'] - clip['chain'] - enc_cpu
            clips.append(clip)
            print(f"{r['label']:10s} {r['line']:14s} {reply['duration']:6.2f}s speech  cpu {clip['cpu']:6.2f}  "
                  f"wall {clip['wall']:6.2f}  cpu/s {clip['cpu'] / reply['duration']:.3f}", flush=True)
            if a.out:
                d = os.path.join(a.out, r['label'])
                os.makedirs(d, exist_ok=True)
                key = hashlib.sha1(json.dumps({**r['req'], **extra}, sort_keys=True).encode()).hexdigest()[:12]
                write_audio(os.path.join(d, r['line'] + '.wav'), audio, sr)
                reply.pop('levels', None)
                with open(os.path.join(d, r['line'] + '.json'), 'w', encoding='utf-8') as f:
                    json.dump({'key': key, 'label': r['label'], 'id': r.get('id'), 'line': r['line'],
                               'set': r.get('set'), 'text': r['text'], 'req': {**r['req'], **extra}, **reply},
                              f, ensure_ascii=False)
    finally:
        stop_hogs(hogs)

    def summary(cs):
        sp = sum(c['speech'] for c in cs)
        out = {'clips': len(cs), 'speech': round(sp, 2), 'cpu': round(sum(c['cpu'] for c in cs), 2),
               'wall': round(sum(c['wall'] for c in cs), 2)}
        out['cpuPerSpeech'] = round(out['cpu'] / sp, 4)
        out['realTime'] = round(sp / out['wall'], 3)
        for k in ('model', 'phonemes', 'chain', 'encode', 'other'):
            out[k + 'PerSpeech'] = round(sum(c[k] for c in cs) / sp, 4)
        return out

    labels = sorted({c['label'] for c in clips}, key=[c['label'] for c in clips].index)
    doc = {
        'tag': a.tag,
        'settings': {'model': os.environ.get('VOICE_MODEL') or 'default', 'modelFile': os.path.basename(eng.model_path),
                     'session': getattr(eng, 'session_settings', None), 'cpus': sorted(cpus) if cpus else None,
                     'hog': a.hog, 'encode': not a.no_encode},
        'loadSeconds': round(load_s, 2),
        'maxRssMb': round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 1),
        'all': summary(clips),
        'labels': {lab: summary([c for c in clips if c['label'] == lab]) for lab in labels},
        'clipsDetail': clips,
    }
    s = doc['all']
    print(f"ALL {s['clips']} clips, {s['speech']:.0f} s of speech: {s['cpuPerSpeech']:.3f} CPU-s per speech-s "
          f"(model {s['modelPerSpeech']:.3f}, phonemes {s['phonemesPerSpeech']:.3f}, chain {s['chainPerSpeech']:.3f}, "
          f"encode {s['encodePerSpeech']:.3f}, other {s['otherPerSpeech']:.3f}), {s['realTime']:.2f}x real time, "
          f"max RSS {doc['maxRssMb']:.0f} MB", flush=True)
    if a.json:
        with open(a.json, 'w', encoding='utf-8') as f:
            json.dump(doc, f, indent=1)
    try:
        os.remove(os.path.join(tmp, 'clip.ogg'))
    except OSError:
        pass
    os.rmdir(tmp)


if __name__ == '__main__':
    main()
