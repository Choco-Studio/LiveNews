#!/usr/bin/env python3
"""Showcase voice worker: Kokoro speech for tools/showcase/record-show.mjs.

JSON lines on stdin/stdout (stdout carries replies only; library chatter goes
to stderr). One request per utterance the channel page speaks:

  {"id": 7, "text": "Good evening.", "voice": "paco", "speed": null,
   "lang": null, "effect": null, "cache": "/abs/cache/dir"}

  -> {"id": 7, "ok": true, "out": "/abs/cache/dir/<hash>.wav", "duration": 1.02,
      "words": [{"t": 0.012, "char": 0, "len": 4}, ...], "voice": "...",
      "engine": "tools/voice" | "fallback", "cached": false, "elapsed": 3.1}

`voice` is a presenter preset of tools/voice/presets.json ("paco"), a Kokoro
voice ("bm_lewis") or a blend ("bm_george:0.7+bm_fable:0.3"). `char`/`len`
index the request text, so the page's boundary events point at the words it
gave the engine.

Engine: the voice stream's VoiceEngine (tools/voice/engine.py: presets,
phrase planning, broadcast chain at -16 LUFS, phoneme-weighted word times)
when it loads; otherwise a self-contained fallback (plain kokoro-onnx, one
pass per sentence/clause, words spread by phoneme weight, RMS levelled). Any
request that fails in VoiceEngine is retried in the fallback, so a mid-edit
voice stream never stops a recording. Clips are cached on disk by
(engine, presets, text, voice, speed, lang, effect): re-recording the same
episodes costs nothing.
"""

import hashlib
import json
import os
import re
import sys
import time
import traceback
import wave

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
VOICE_DIR = os.path.join(REPO, 'tools', 'voice')
VERSION = 'showcase-voice-2'
SR = 24000


def log(*args):
    print('[showcase-voice]', *args, file=sys.stderr, flush=True)


def load_presets():
    try:
        with open(os.path.join(VOICE_DIR, 'presets.json'), encoding='utf-8') as f:
            return json.load(f).get('presets', {})
    except (OSError, ValueError):
        return {}


def write_wav(path, audio, sr):
    y = np.clip(np.asarray(audio, dtype=np.float64), -1.0, 1.0)
    pcm = (y * 32767.0).astype('<i2')
    tmp = path + '.tmp'
    with wave.open(tmp, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(int(sr))
        w.writeframes(pcm.tobytes())
    os.replace(tmp, path)


def find_models():
    dirs = [os.environ.get('KOKORO_DIR'), os.path.join(REPO, 'data', 'models'), os.path.expanduser('~/.cache/kokoro')]
    model = os.environ.get('KOKORO_MODEL')
    voices = os.environ.get('KOKORO_VOICES')
    for d in dirs:
        if not d:
            continue
        if not model and os.path.exists(os.path.join(d, 'kokoro-v1.0.onnx')):
            model = os.path.join(d, 'kokoro-v1.0.onnx')
        if not voices and os.path.exists(os.path.join(d, 'voices-v1.0.bin')):
            voices = os.path.join(d, 'voices-v1.0.bin')
    if not model or not voices:
        raise FileNotFoundError('Kokoro models not found (KOKORO_MODEL / KOKORO_VOICES / ~/.cache/kokoro)')
    return model, voices


# ---------------------------------------------------------------- fallback

_VOWELS = set('aeiouyAEIOUY')
_CLAUSE = re.compile(r'(?<=[.!?…;:])\s+|(?<=,)\s+(?=\S{3,})')


def word_weight(word):
    letters = re.sub(r'[^A-Za-z0-9]', '', word)
    if not letters:
        return 0.3
    vowels = sum(1 for c in letters if c in _VOWELS)
    digits = sum(1 for c in letters if c.isdigit())
    return 0.4 + 0.12 * len(letters) + 0.35 * max(1, vowels) + 0.5 * digits


class Fallback:
    """Plain kokoro-onnx: one pass per sentence or long clause, our own pauses."""

    def __init__(self, presets):
        from kokoro_onnx import Kokoro
        model, voices = find_models()
        self.k = Kokoro(model, voices)
        self.presets = presets
        self.styles = {}

    def style(self, spec):
        if spec in self.styles:
            return self.styles[spec]
        parts = []
        for chunk in str(spec).split('+'):
            name, _, w = chunk.partition(':')
            parts.append((name.strip(), float(w) if w else 1.0))
        total = sum(w for _, w in parts) or 1.0
        vec = sum(np.asarray(self.k.get_voice_style(n), dtype=np.float32) * (w / total) for n, w in parts)
        self.styles[spec] = (vec.astype(np.float32), parts[0][0])
        return self.styles[spec]

    def speak(self, req):
        voice = req.get('voice') or 'bm_george'
        preset = self.presets.get(voice)
        spec = preset['voice'] if preset else voice
        style, first = self.style(spec)
        lang = (req.get('lang') or (preset or {}).get('lang') or ('en-gb' if first.startswith('b') else 'en-us')).lower()
        speed = float(req.get('speed') or (preset or {}).get('speed') or 1.0)
        text = str(req['text'])
        # Phrases: sentences and long clauses, located in the original text.
        spans = []
        pos = 0
        for piece in _CLAUSE.split(text):
            piece = piece.strip()
            if not piece:
                continue
            at = text.find(piece, pos)
            at = pos if at < 0 else at
            spans.append((at, piece))
            pos = at + len(piece)
        out = []
        words = []
        t = 0.0
        for idx, (at, piece) in enumerate(spans):
            if not re.search(r'[A-Za-z0-9]', piece):
                continue
            audio, sr = self.k.create(piece, voice=style, speed=min(1.5, max(0.6, speed)), lang=lang, trim=True)
            audio = np.asarray(audio, dtype=np.float64)
            # Tight trim: 12 ms before the first and 40 ms after the last frame above -40 dB.
            frame = int(0.01 * sr)
            env = np.array([np.sqrt(np.mean(audio[i:i + frame] ** 2) + 1e-12) for i in range(0, max(1, len(audio) - frame), frame)])
            if len(env) and env.max() > 0:
                on = np.where(env > env.max() * 0.01)[0]
                s = max(0, on[0] * frame - int(0.012 * sr))
                e = min(len(audio), (on[-1] + 1) * frame + int(0.04 * sr))
                audio = audio[s:e]
            n = len(audio)
            fade = min(n // 4, int(0.006 * sr))
            if fade > 0:
                audio[:fade] *= np.linspace(0, 1, fade)
                audio[-fade:] *= np.linspace(1, 0, fade)
            dur = n / sr
            toks = [(m.start() + at, m.group()) for m in re.finditer(r'\S+', piece)]
            weights = [word_weight(w) for _, w in toks]
            total = sum(weights) or 1.0
            acc = 0.0
            for (c, w), wt in zip(toks, weights):
                words.append({'t': round(t + 0.012 + (acc / total) * max(0.0, dur - 0.05), 3), 'char': c, 'len': len(w)})
                acc += wt
            out.append(audio)
            t += dur
            end = piece.rstrip('"”)’')[-1:] if piece else ''
            pause = 0.38 if end in '.!?…' else 0.24 if end in ';:' else 0.14
            if idx < len(spans) - 1:
                out.append(np.zeros(int(pause * sr)))
                t += pause
        audio = np.concatenate(out) if out else np.zeros(int(0.2 * SR))
        # Level: active-speech RMS to -19 dBFS (about -16 LUFS for speech), peak-safe.
        active = audio[np.abs(audio) > 1e-3]
        rms = np.sqrt(np.mean(active ** 2)) if len(active) else 0
        if rms > 0:
            audio = audio * (10 ** (-19 / 20) / rms)
        peak = np.max(np.abs(audio)) if len(audio) else 0
        if peak > 0.79:
            audio = audio * (0.79 / peak)
        return audio, SR, {'duration': round(len(audio) / SR, 3), 'words': words, 'voice': spec, 'lang': lang, 'speed': speed}


# ------------------------------------------------------------------ worker

def main():
    proto = os.fdopen(os.dup(1), 'w', buffering=1, encoding='utf-8')
    os.dup2(2, 1)
    sys.stdout = sys.stderr

    def send(obj):
        proto.write(json.dumps(obj, ensure_ascii=False, separators=(',', ':')) + '\n')
        proto.flush()

    presets = load_presets()
    engine = None
    engine_name = 'fallback'
    if os.environ.get('SHOWCASE_VOICE_ENGINE', 'auto') != 'fallback':
        try:
            sys.path.insert(0, VOICE_DIR)
            from engine import VoiceEngine  # the voice stream's engine (presets + broadcast chain)
            engine = VoiceEngine()
            engine_name = 'tools/voice'
        except Exception as error:  # noqa: BLE001 - any start-up failure -> fallback
            traceback.print_exc()
            log(f'tools/voice engine unavailable ({type(error).__name__}: {error}); using the fallback')
            engine = None
    fallback = None

    def get_fallback():
        nonlocal fallback
        if fallback is None:
            fallback = Fallback(presets)
        return fallback

    if engine is None:
        try:
            get_fallback()
        except Exception as error:  # noqa: BLE001
            traceback.print_exc()
            send({'ready': False, 'error': f'{type(error).__name__}: {error}'})
            return 1
    preset_tag = hashlib.sha1(json.dumps(presets, sort_keys=True).encode()).hexdigest()[:10]
    send({'ready': True, 'engine': engine_name, 'presets': sorted(presets), 'pid': os.getpid()})

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except ValueError as error:
            send({'id': None, 'ok': False, 'error': f'bad request: {error}'})
            continue
        rid = req.get('id')
        if req.get('cmd') == 'quit':
            send({'id': rid, 'ok': True, 'bye': True})
            break
        if req.get('cmd') == 'ping':
            send({'id': rid, 'ok': True, 'pong': True, 'engine': engine_name})
            continue
        t0 = time.time()
        try:
            text = str(req.get('text') or '')
            if not text.strip():
                raise ValueError('empty text')
            cache = req.get('cache') or os.path.join(REPO, 'data', 'showcase-voice-cache')
            os.makedirs(cache, exist_ok=True)
            key_src = json.dumps([VERSION, engine_name, preset_tag, text, req.get('voice'), req.get('speed'),
                                  req.get('lang'), req.get('effect')], ensure_ascii=False)
            key = hashlib.sha1(key_src.encode('utf-8')).hexdigest()[:20]
            out = os.path.join(cache, f'{key}.wav')
            meta_path = os.path.join(cache, f'{key}.json')
            if os.path.exists(out) and os.path.exists(meta_path):
                with open(meta_path, encoding='utf-8') as f:
                    meta = json.load(f)
                send({'id': rid, 'ok': True, 'out': out, 'cached': True, 'elapsed': round(time.time() - t0, 3), **meta})
                continue
            sreq = {'text': text, 'voice': req.get('voice') or 'bm_george'}
            for k in ('speed', 'lang', 'effect'):
                if req.get(k) is not None:
                    sreq[k] = req[k]
            used = engine_name
            audio = None
            if engine is not None:
                try:
                    audio, sr, reply = engine.speak(dict(sreq))
                    reply = {'duration': reply.get('duration'), 'words': reply.get('words', []), 'voice': reply.get('voice'),
                             'lang': reply.get('lang'), 'speed': reply.get('speed'), 'effect': reply.get('effect'),
                             'lufs': reply.get('lufs'), 'truePeak': reply.get('truePeak')}
                except Exception as error:  # noqa: BLE001 - retry in the fallback
                    traceback.print_exc()
                    log(f'{rid}: tools/voice failed ({error}); fallback')
                    audio = None
            if audio is None:
                used = 'fallback'
                audio, sr, reply = get_fallback().speak(sreq)
            write_wav(out, audio, sr)
            meta = {**reply, 'engine': used, 'sampleRate': sr,
                    'duration': round(len(audio) / sr, 3)}
            meta['words'] = [{'t': float(w['t']), 'char': int(w['char']), 'len': int(w.get('len') or 0)} for w in meta.get('words') or []]
            with open(meta_path + '.tmp', 'w', encoding='utf-8') as f:
                json.dump(meta, f, ensure_ascii=False)
            os.replace(meta_path + '.tmp', meta_path)
            elapsed = round(time.time() - t0, 2)
            log(f'{rid}: {meta["duration"]:.2f}s of {sreq["voice"]} in {elapsed}s ({used})')
            send({'id': rid, 'ok': True, 'out': out, 'cached': False, 'elapsed': elapsed, **meta})
        except Exception as error:  # noqa: BLE001 - one bad request must not stop the worker
            traceback.print_exc()
            send({'id': rid, 'ok': False, 'error': f'{type(error).__name__}: {error}'})
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
