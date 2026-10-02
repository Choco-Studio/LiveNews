#!/usr/bin/env python3
"""One-off speech from the command line, through the same engine as the worker.

  python3 tools/voice/say.py --voice paco --text "Good evening." --out /tmp/paco.ogg
  python3 tools/voice/say.py --voice "bf_emma:0.6+bf_isabella:0.4" --lang en-gb \
      --text-file story.txt --out /tmp/story.wav --json

--voice takes a Kokoro voice, a blend "a:0.7+b:0.3" or a presenter preset
(presets.json). Prints a one-line summary; --json prints the full reply
(word and phrase timings, loudness) instead. --list shows voices and presets.
"""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def main(argv=None):
    ap = argparse.ArgumentParser(description='GLOBIT 24 voice: text to a broadcast-ready clip')
    ap.add_argument('--voice', help='voice name, blend "a:0.7+b:0.3" or preset (paco, lola, ...)')
    ap.add_argument('--text', help='text to speak')
    ap.add_argument('--text-file', help='read the text from a file')
    ap.add_argument('--out', help='output file (.ogg, .wav, .m4a, .webm, .mp3, .flac)')
    ap.add_argument('--speed', type=float, help='0.5-2.0 (default: preset or 1.0)')
    ap.add_argument('--lang', help='en-us or en-gb (default: from the voice)')
    ap.add_argument('--effect', choices=['none', 'robot'], help='character effect')
    ap.add_argument('--phrases', help='JSON list of {text, pauseAfter} to synthesise phrase by phrase')
    ap.add_argument('--raw', action='store_true', help='skip the broadcast chain (for comparisons)')
    ap.add_argument('--no-tone', action='store_true', help='skip the per-voice tonal match')
    ap.add_argument('--phones', action='store_true', help='include the phoneme timeline')
    ap.add_argument('--json', action='store_true', help='print the full reply as JSON')
    ap.add_argument('--list', action='store_true', help='list voices and presets')
    args = ap.parse_args(argv)

    from audio_io import write_audio
    from engine import VoiceEngine

    engine = VoiceEngine()
    if args.list:
        print('presets:', ', '.join(f'{k} ({v["voice"]})' for k, v in sorted(engine.presets.items())))
        print('voices:', ' '.join(engine.voice_names()))
        return 0
    text = args.text
    if args.text_file:
        with open(args.text_file, encoding='utf-8') as f:
            text = f.read()
    if not args.voice or not text or not args.out:
        ap.error('--voice, --text (or --text-file) and --out are required')
    req = {'text': text, 'voice': args.voice, 'speed': args.speed, 'lang': args.lang,
           'effect': args.effect, 'raw': args.raw, 'phones': args.phones}
    if args.no_tone:
        req['tone'] = False
    if args.phrases:
        req['phrases'] = json.loads(args.phrases)
    audio, sr, reply = engine.speak(req)
    out = os.path.abspath(args.out)
    write_audio(out, audio, sr)
    reply['out'] = out
    if args.json:
        print(json.dumps(reply, ensure_ascii=False))
    else:
        print(f'{out}: {reply["duration"]:.2f}s, {len(reply["words"])} words, '
              f'{reply.get("lufs", "-")} LUFS, {reply.get("truePeak", "-")} dBTP, '
              f'voice {reply["voice"]} ({reply["lang"]}, x{reply["speed"]}), {reply["elapsed"]}s')
    return 0


if __name__ == '__main__':
    sys.exit(main())
