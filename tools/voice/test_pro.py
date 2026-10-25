"""Tests for the professional voices (pro.py), against local stand-ins for Inworld and ElevenLabs.

  python3 -m unittest discover -s tools/voice -p 'test_pro.py' -v

No key and no network: each stand-in answers as its vendor's API does (read 25 Oct 2026), with a tone for every word
at known times, so the word timings, the pauses and the fallback can be checked exactly.
"""

import base64
import json
import os
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import pro  # noqa: E402
from textnorm import plan_phrases  # noqa: E402

SR = 24000
TEXT = 'Good evening. The bridge reopens on Monday, the council says. Traffic will be light.'


def voice_for(text, word_dur=0.30, gap=0.08, sentence_gap=0.45):
    """A tone per word (a breath-like hiss in each sentence gap) -> (pcm16 bytes, [(word, start, end)])."""
    words, t, parts = [], 0.05, [np.zeros(int(0.05 * SR))]
    for w in text.split():
        n = int(word_dur * SR)
        parts.append(0.3 * np.sin(2 * np.pi * 220 * np.arange(n) / SR))
        words.append((w, round(t, 3), round(t + word_dur, 3)))
        t += word_dur
        pause = sentence_gap if w.endswith('.') else gap
        hiss = np.random.default_rng(1).normal(0, 0.02, int(pause * SR)) if w.endswith('.') else np.zeros(int(pause * SR))
        parts.append(hiss)
        t += pause
    audio = np.concatenate(parts)
    return (np.clip(audio, -1, 1) * 32767).astype('<i2').tobytes(), words


class Vendor(BaseHTTPRequestHandler):
    seen = []
    mode = 'ok'

    def log_message(self, *a):
        pass

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])).decode())
        Vendor.seen.append({'path': self.path, 'headers': dict(self.headers), 'body': body})
        if Vendor.mode == 'fail':
            self.send_response(500)
            self.end_headers()
            self.wfile.write(b'{"error":"down"}')
            return
        text = body.get('text', '')
        if Vendor.mode == 'garbage':
            text = 'something else entirely was read here instead of the news'
        pcm, words = voice_for(text)
        if self.path.startswith('/tts/v1/voice'):
            out = {'audioContent': base64.b64encode(pcm).decode(), 'usage': {'processedCharactersCount': len(body['text']), 'modelId': body['modelId']},
                   'timestampInfo': {'wordAlignment': {'words': [w for w, _, _ in words], 'wordStartTimeSeconds': [s for _, s, _ in words], 'wordEndTimeSeconds': [e for _, _, e in words]}}}
        else:
            chars, starts, ends = [], [], []
            for i, (w, s, e) in enumerate(words):
                for k, c in enumerate(w):
                    chars.append(c)
                    starts.append(s + (e - s) * k / len(w))
                    ends.append(s + (e - s) * (k + 1) / len(w))
                if i < len(words) - 1:
                    chars.append(' ')
                    starts.append(e)
                    ends.append(words[i + 1][1])
            out = {'audio_base64': base64.b64encode(pcm).decode(), 'alignment': {'characters': chars, 'character_start_times_seconds': starts, 'character_end_times_seconds': ends}}
        data = json.dumps(out).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)


class ProVoices(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = HTTPServer(('127.0.0.1', 0), Vendor)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        base = f'http://127.0.0.1:{cls.srv.server_address[1]}'
        cls.env = {'INWORLD_API_KEY': 'aWQ6c2VjcmV0', 'INWORLD_API_BASE': base, 'ELEVENLABS_API_KEY': 'xi-test', 'ELEVENLABS_API_BASE': base}

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def setUp(self):
        Vendor.seen.clear()
        Vendor.mode = 'ok'

    def req(self, engine, **extra):
        return {'text': TEXT, 'lang': 'en-gb', 'effect': 'none', 'pro': {'engine': engine, 'voiceId': 'v-paco', **extra}}

    def check_reply(self, audio, reply, engine):
        self.assertEqual(reply['engine'], engine)
        self.assertGreater(len(audio), SR)
        phrases = plan_phrases(TEXT, 'en-gb', None, 1.0, None, 0.0)
        self.assertEqual(len(reply['phrases']), len(phrases))
        # every word of the text, in order, at the place it is said: the first word near the start
        firsts = [w['char'] for w in reply['words']]
        self.assertEqual(firsts, sorted(firsts))
        self.assertEqual(TEXT[reply['words'][0]['char']:reply['words'][0]['char'] + reply['words'][0]['len']], 'Good')
        self.assertLess(reply['words'][0]['t'], 0.05)
        self.assertEqual(len(reply['words']), len(TEXT.split()))
        # the pauses are the planner's, not the engine's (its 0.45 s gaps, with the hiss in them, are cut out)
        for a, b, ph in zip(reply['phrases'], reply['phrases'][1:], phrases):
            between = b['t'] - (a['t'] + a['dur'])
            self.assertAlmostEqual(between, ph.pause + pro.LEAD + pro.TAIL, delta=0.03)
        # the broadcast chain ran (the channel's loudness)
        self.assertIn('lufs', reply)

    def test_inworld(self):
        audio, reply = pro.speak_pro(self.req('inworld', model='inworld-tts-2'), SR, env=self.env)
        self.check_reply(audio, reply, 'inworld')
        call = Vendor.seen[0]
        self.assertEqual(call['path'], '/tts/v1/voice')
        self.assertEqual(call['headers']['Authorization'], 'Basic aWQ6c2VjcmV0')
        self.assertEqual(call['body']['audioConfig'], {'audioEncoding': 'PCM', 'sampleRateHertz': SR})
        self.assertEqual(call['body']['timestampType'], 'WORD')
        self.assertEqual(call['body']['deliveryMode'], 'STABLE')
        self.assertEqual(call['body']['language'], 'en-GB')
        self.assertEqual(len(Vendor.seen), 1, 'the whole segment in one request')
        self.assertEqual(reply['voice'], 'inworld:v-paco')
        self.assertEqual(reply['chars'], len(call['body']['text']))

    def test_elevenlabs(self):
        audio, reply = pro.speak_pro(self.req('elevenlabs', model='eleven_v4_turbo', speed=1.05), SR, env=self.env)
        self.check_reply(audio, reply, 'elevenlabs')
        call = Vendor.seen[0]
        u = urlparse(call['path'])
        self.assertEqual(u.path, '/v1/text-to-speech/v-paco/with-timestamps')
        self.assertEqual(parse_qs(u.query)['output_format'], [f'pcm_{SR}'])
        self.assertEqual(call['headers']['Xi-Api-Key'], 'xi-test')
        self.assertEqual(call['body']['model_id'], 'eleven_v4_turbo')
        self.assertEqual(call['body']['voice_settings']['speed'], 1.05)

    def test_a_long_segment_goes_in_pieces_that_run_on(self):
        long_text = ' '.join(f'Story number {i} is about the harbour bridge and the council budget for next year.' for i in range(40))
        audio, reply = pro.speak_pro({**self.req('inworld'), 'text': long_text}, SR, env=self.env)
        self.assertGreater(len(Vendor.seen), 1, 'more than one request')
        self.assertTrue(all(len(c['body']['text']) <= pro.MAX_CHARS['inworld'] for c in Vendor.seen))
        self.assertNotIn('synthesisContext', Vendor.seen[0]['body'])
        self.assertEqual(Vendor.seen[1]['body']['synthesisContext']['previousRequests'][0]['text'], Vendor.seen[0]['body']['text'])
        self.assertEqual(len(reply['words']), len(long_text.split()), 'every word timed, across the pieces')
        ts = [w['t'] for w in reply['words']]
        self.assertEqual(ts, sorted(ts))
        self.assertEqual(reply['chars'], sum(len(c['body']['text']) for c in Vendor.seen))

    def test_robot_effect_still_applies(self):
        audio, reply = pro.speak_pro({**self.req('inworld'), 'effect': 'robot-soft'}, SR, env=self.env)
        self.assertEqual(reply['effect'], 'robot-soft')

    def test_failures_fall_back_to_kokoro(self):
        class FakeKokoro:
            def __init__(self):
                self.calls = []

            def speak(self, req):
                self.calls.append(req)
                return np.zeros(SR), SR, {'duration': 1.0, 'words': [], 'phrases': []}

        k = FakeKokoro()
        # no key
        audio, sr, reply = pro.speak_any(k, self.req('inworld'), env={})
        self.assertEqual(reply['engine'], 'kokoro')
        self.assertIn('INWORLD_API_KEY', reply['fallback'])
        self.assertNotIn('pro', k.calls[-1], 'Kokoro reads the plain request')
        # the vendor down (after its retries)
        Vendor.mode = 'fail'
        _, _, reply = pro.speak_any(k, self.req('elevenlabs'), env=self.env)
        self.assertIn('HTTP 500', reply['fallback'])
        # the engine read other words than the text: never aired
        Vendor.mode = 'garbage'
        _, _, reply = pro.speak_any(k, self.req('inworld'), env=self.env)
        self.assertIn('read other words', reply['fallback'])
        # an unknown engine, and a character without a professional voice
        _, _, reply = pro.speak_any(k, {**self.req('inworld'), 'pro': {'engine': 'acme', 'voiceId': 'x'}}, env=self.env)
        self.assertIn('unknown professional engine', reply['fallback'])
        _, _, reply = pro.speak_any(k, {**self.req('inworld'), 'pro': {'engine': 'inworld'}}, env=self.env)
        self.assertIn('no professional voice', reply['fallback'])
        # a request without `pro` never leaves Kokoro
        _, _, reply = pro.speak_any(k, {'text': TEXT}, env=self.env)
        self.assertEqual(reply['engine'], 'kokoro')
        self.assertNotIn('fallback', reply)

    def test_matching_survives_splits_and_joins(self):
        theirs = [('The', 0.0, 0.2), ('U', 0.2, 0.3), ('S', 0.3, 0.4), ('economy', 0.4, 0.9), ('well-known', 0.9, 1.4)]
        ours = ['The', 'US', 'economy', 'well', 'known']
        m = pro._fill(pro.match_words(ours, theirs), 1.5)
        self.assertEqual(len(m), 5)
        self.assertAlmostEqual(m[0][0], 0.0)
        self.assertAlmostEqual(m[2][0], 0.4)
        self.assertGreaterEqual(m[3][0], 0.9)
        self.assertGreater(m[4][0], m[3][0])
        self.assertEqual([s for s, _ in m], sorted(s for s, _ in m))


if __name__ == '__main__':
    unittest.main()
