#!/usr/bin/env python3
"""Persistent Kokoro voice worker for GLOBIT 24: JSON lines on stdin/stdout.

Start it once (the model loads in ~1-2 s) and send one JSON object per line:

  {"id": "seg-12", "text": "Good evening.", "voice": "bm_george:0.7+bm_lewis:0.3",
   "speed": 1.0, "lang": "en-gb", "out": "/abs/path/seg-12.ogg",
   "effect": "robot", "phrases": [{"text": "Good evening.", "pauseAfter": 0.4}]}

`voice` may also be a presenter preset from presets.json ("paco"), which sets
voice, lang, speed and effect unless the request gives them. Optional extras:
"phones": true (phoneme timeline), "levels": true (50 Hz loudness envelope),
"tone": false (skip the per-voice tonal match), "raw": true (no processing),
"chain": {...} (override dsp.DEFAULTS keys). The output format follows the
extension of `out` (.ogg Opus for the web, .wav, .m4a, .webm, .mp3, .flac).

Every reply is one line with the same id:
  {"id", "ok": true, "out", "duration", "sampleRate", "words": [{"t", "char", "len"}],
   "phrases": [{"t", "dur", "char", "len"}], "voice", "lang", "speed", "effect",
   "lufs", "truePeak", ...}
or {"id", "ok": false, "error": "..."}. Times are seconds from the start of the
file; `char` is an offset into the request's `text`.

Other commands: {"cmd": "ping"}, {"cmd": "voices"} (voices + presets),
{"cmd": "quit"}. On start the worker prints {"ready": true, ...} (or
{"ready": false, "error"} if the model cannot load) before reading requests.
A bad request only fails that request; the worker keeps serving.
Everything else (library chatter, tracebacks) goes to stderr.
Env: KOKORO_MODEL, KOKORO_VOICES, KOKORO_DIR (model location), FFMPEG.
"""

import json
import os
import sys
import time
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def main():
    # The protocol owns the real stdout; anything a library prints (Python or
    # C level) is redirected to stderr so it can never corrupt a reply line.
    proto = os.fdopen(os.dup(1), 'w', buffering=1, encoding='utf-8')
    os.dup2(2, 1)
    sys.stdout = sys.stderr

    def send(obj):
        proto.write(json.dumps(obj, ensure_ascii=False, separators=(',', ':')) + '\n')
        proto.flush()

    try:
        from audio_io import FORMATS, write_audio
        from engine import SAMPLE_RATE, VoiceEngine, log
        engine = VoiceEngine()
    except Exception as error:  # noqa: BLE001 - report any start-up failure
        traceback.print_exc()
        send({'ready': False, 'error': f'{type(error).__name__}: {error}'})
        return 1

    send({'ready': True, 'pid': os.getpid(), 'sampleRate': SAMPLE_RATE,
          'voices': engine.voice_names(), 'presets': sorted(engine.presets),
          'formats': list(FORMATS)})

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            if not isinstance(req, dict):
                raise ValueError('request must be a JSON object')
        except ValueError as error:
            send({'id': None, 'ok': False, 'error': f'bad request: {error}'})
            continue
        rid = req.get('id')
        cmd = req.get('cmd') or 'speak'
        try:
            if cmd == 'ping':
                send({'id': rid, 'ok': True, 'pong': True})
            elif cmd == 'voices':
                send({'id': rid, 'ok': True, 'voices': engine.voice_names(), 'presets': engine.presets})
            elif cmd == 'quit':
                send({'id': rid, 'ok': True, 'bye': True})
                break
            elif cmd == 'speak':
                out = req.get('out')
                if not isinstance(out, str) or not os.path.isabs(out):
                    raise ValueError('"out" must be an absolute path')
                ext = os.path.splitext(out)[1].lower()
                if ext not in FORMATS:
                    raise ValueError(f'unsupported output format {ext!r}')
                t0 = time.time()
                audio, sr, reply = engine.speak(req)
                write_audio(out, audio, sr)
                reply['elapsed'] = round(time.time() - t0, 2)
                send({'id': rid, 'ok': True, 'out': out, **reply})
                log(f'{rid}: {reply["duration"]:.2f}s audio in {reply["elapsed"]:.2f}s '
                    f'({reply.get("lufs")} LUFS, {reply.get("truePeak")} dBTP)')
            else:
                raise ValueError(f'unknown cmd {cmd!r}')
        except Exception as error:  # noqa: BLE001 - one bad request must not kill the worker
            traceback.print_exc()
            send({'id': rid, 'ok': False, 'error': f'{type(error).__name__}: {error}'})
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
