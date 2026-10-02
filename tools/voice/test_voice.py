"""Tests for the GLOBIT 24 voice engine.

  python3 -m unittest discover -s tools/voice -p 'test_*.py' -v

Model-dependent tests are skipped when the Kokoro files are not installed
(tools/voice/fetch-models.sh); the rest needs only numpy and ffmpeg.
"""

import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import dsp  # noqa: E402
import loudness  # noqa: E402
import metrics  # noqa: E402
from audio_io import read_wav, write_audio  # noqa: E402
from textnorm import plan_phrases, say_year, spell_number  # noqa: E402

SR = 24000


def have_models():
    try:
        from engine import find_models
        find_models()
        import kokoro_onnx  # noqa: F401
        return True
    except Exception:  # noqa: BLE001
        return False


def speechlike(seconds=3.0, seed=1):
    """Deterministic voiced/unvoiced test signal with syllable-rate envelope."""
    rng = np.random.default_rng(seed)
    t = np.arange(int(seconds * SR)) / SR
    f0 = 120 + 20 * np.sin(2 * np.pi * 0.7 * t)
    phase = 2 * np.pi * np.cumsum(f0) / SR
    # Random harmonic phases: a real voice is not a phase-aligned pulse train
    offsets = rng.random(30) * 2 * np.pi
    voiced = sum(np.sin(k * phase + offsets[k]) / k for k in range(1, 30))
    hiss = rng.standard_normal(len(t)) * 0.3
    syll = 0.5 + 0.5 * np.sin(2 * np.pi * 4 * t)
    # Fricative stretches fade in and out like real speech (no hard switches)
    fric = np.clip((np.sin(2 * np.pi * 1.3 * t) - 0.7) / 0.2, 0, 1)
    mix = fric * hiss + (1 - fric) * voiced
    return 0.2 * mix * syll


class TextNormTest(unittest.TestCase):
    def spoken(self, text, lang='en-us'):
        return ' '.join(p.spoken for p in plan_phrases(text, lang))

    def test_numbers_and_years(self):
        self.assertEqual(spell_number(105, 'en-gb'), 'one hundred and five')
        self.assertEqual(spell_number(105, 'en-us'), 'one hundred five')
        self.assertEqual(spell_number(2_500_000), 'two million five hundred thousand')
        self.assertEqual(say_year(2026), 'twenty twenty-six')
        self.assertEqual(say_year(1905), 'nineteen oh five')
        self.assertEqual(say_year(2007, 'en-gb'), 'two thousand and seven')
        self.assertIn('twenty twenty-six', self.spoken('In 2026, prices rose.'))

    def test_money_and_scales(self):
        self.assertIn('five billion dollars', self.spoken('It spent $5bn.'))
        self.assertIn('five billion dollars', self.spoken('Some $5 billion was spent.'))
        self.assertIn('three point five million pounds', self.spoken('It cost £3.5m.'))
        self.assertIn('fifty cents', self.spoken('Only $0.50 each.'))
        self.assertIn('two trillion euros', self.spoken('A €2tn plan.'))

    def test_ranges_times_units_acronyms(self):
        s = self.spoken('Shares rose 10-15% at 9:30am; the IMF and the US met; the rover did 15km at 30°C.')
        for part in ('ten to fifteen percent', 'nine thirty A-M', 'I-M-F', 'U-S',
                     'fifteen kilometres', 'thirty degrees Celsius'):
            self.assertIn(part, s)
        self.assertIn('NASA', self.spoken('NASA said so.'))
        self.assertIn('nineteen nineties', self.spoken('Back in the 1990s.'))
        # Shouted headlines are not spelled letter by letter
        self.assertNotIn('W-O-R-L-D', self.spoken('WORLD NOW TONIGHT'))

    def test_offsets_point_at_original_text(self):
        text = 'Hello there. It cost $5bn, they said.'
        for ph in plan_phrases(text, 'en-us'):
            self.assertEqual(text[ph.start:ph.end], ph.text)
            for tok in ph.tokens:
                self.assertEqual(text[tok.start:tok.end], tok.original)

    def test_sentences_and_pauses(self):
        phrases = plan_phrases('Dr. Smith arrived. Was it late? No! It was 3.5 hours early.', 'en-gb')
        self.assertEqual([p.text for p in phrases],
                         ['Dr. Smith arrived.', 'Was it late?', 'No!', 'It was 3.5 hours early.'])
        self.assertGreater(phrases[1].pause, phrases[0].pause)  # questions breathe longer
        self.assertEqual(phrases[-1].pause, 0.0)

    def test_long_sentence_is_split_at_a_clause(self):
        text = ('The ministers, who had been negotiating through the night in a cold conference '
                'hall, finally agreed on a package of measures; critics said it was too little, '
                'too late, and that the real test would come when the money had to be found.')
        phrases = plan_phrases(text, 'en-gb')
        self.assertGreater(len(phrases), 1)
        self.assertTrue(phrases[0].text.endswith(';'))

    def test_dates(self):
        self.assertIn('the second of October', self.spoken('It opens on 2 October.', 'en-gb'))
        self.assertIn('October twenty-first', self.spoken('It opens on October 21, they said.'))

    def test_caller_say_maps_back_to_original_words(self):
        text = 'The IMF lent $2bn on 2 October, officials said.'
        phrases = plan_phrases(text, 'en-gb', [
            {'text': 'The IMF lent $2bn on 2 October,', 'pauseAfter': 0.15, 'speedFactor': 0.95,
             'say': 'The I-M-F lent two billion dollars on the second of October,'},
            {'text': 'officials said.', 'say': 'officials said.'}])
        self.assertEqual(phrases[0].speed, 0.95)
        primary = [text[t.start:t.end] for p in phrases for t in p.tokens if t.primary]
        self.assertEqual(primary, text.split())
        self.assertEqual(' '.join(t.spoken for t in phrases[0].tokens),
                         'The I-M-F lent two billion dollars on the second of October,')

    def test_caller_phrases(self):
        text = 'Good evening. Here is the news.'
        phrases = plan_phrases(text, 'en-us', [{'text': 'Good evening.', 'pauseAfter': 0.7},
                                               {'text': 'Here is the news.'}])
        self.assertEqual(phrases[0].pause, 0.7)
        self.assertEqual(phrases[1].start, text.index('Here'))


class LoudnessTest(unittest.TestCase):
    @unittest.skipUnless(shutil.which('ffmpeg'), 'ffmpeg missing')
    def test_matches_ffmpeg_ebur128(self):
        x = speechlike(6.0) * 0.8
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, 'x.wav')
            write_audio(path, x, SR)
            y, _ = read_wav(path)
            out = subprocess.run(['ffmpeg', '-nostats', '-hide_banner', '-i', path, '-af',
                                  'ebur128=peak=true', '-f', 'null', '-'],
                                 capture_output=True, text=True).stderr
            summary = out[out.rfind('Summary:'):]
            ff_i = float(summary.split('I:')[1].split()[0])
            ff_tp = float(summary.split('Peak:')[1].split()[0])
        self.assertAlmostEqual(loudness.integrated_loudness(y, SR), ff_i, delta=0.2)
        self.assertAlmostEqual(loudness.true_peak(y), ff_tp, delta=0.3)

    def test_sine_reference(self):
        # A 1 kHz sine at -20 dBFS peak reads about -23 LUFS (BS.1770 reference: -3.01 dB)
        t = np.arange(SR * 3) / SR
        x = 0.1 * np.sin(2 * np.pi * 1000 * t)
        self.assertAlmostEqual(loudness.integrated_loudness(x, SR), -23.0, delta=0.15)


class ChainTest(unittest.TestCase):
    def test_broadcast_hits_targets(self):
        for gain in (0.05, 0.4, 1.6):  # quiet, normal and clipping input
            y, stats = dsp.broadcast(speechlike(4.0) * gain, SR)
            self.assertAlmostEqual(loudness.integrated_loudness(y, SR), -16.0, delta=0.3)
            self.assertLessEqual(loudness.true_peak(y), -1.9)
            self.assertLess(abs(y[0]), 1e-3)
            self.assertLess(abs(y[-1]), 1e-3)
            self.assertEqual(stats['lufs'], round(loudness.integrated_loudness(y, SR), 2))

    def test_robot_keeps_length_and_targets(self):
        x = speechlike(3.0)
        y, _ = dsp.broadcast(x, SR, effect='robot')
        self.assertAlmostEqual(loudness.integrated_loudness(y, SR), -16.0, delta=0.3)
        self.assertLessEqual(loudness.true_peak(y), -1.9)

    def test_limiter_never_overshoots(self):
        x = speechlike(2.0) * 3.0
        y = dsp.limit(x, SR, -2.0)
        self.assertLessEqual(loudness.true_peak(y), -1.95)

    def test_sliding_min(self):
        rng = np.random.default_rng(3)
        x = rng.random(1000)
        r = 7
        ref = np.array([x[max(0, i - r):i + r + 1].min() for i in range(len(x))])
        np.testing.assert_allclose(dsp.sliding_min(x, r), ref)

    def test_tone_curve_interpolates(self):
        curve = dsp.tone_curve([(1000, 0.0), (4000, 6.0)])
        mags = curve(np.array([500.0, 2000.0, 8000.0]))
        np.testing.assert_allclose(20 * np.log10(mags), [0.0, 3.0, 6.0], atol=1e-6)


class TimingTest(unittest.TestCase):
    """Gap tightening and word alignment, on synthetic phrases (no model)."""

    def test_tighten_gaps_cuts_only_the_quiet_core(self):
        from engine import VoiceEngine, tighten_gaps
        tone = 0.3 * np.sin(2 * np.pi * 220 * np.arange(int(0.3 * SR)) / SR)
        seg = np.concatenate([tone, np.zeros(int(0.45 * SR)), tone])
        gaps = VoiceEngine._gaps(seg, SR)
        self.assertEqual(len(gaps), 1)
        out, removed = tighten_gaps(seg, SR, gaps, 0.15)
        self.assertAlmostEqual(len(out) / SR, len(seg) / SR - removed, places=3)
        new_gap = VoiceEngine._gaps(out, SR)[0]
        self.assertAlmostEqual(new_gap[1] - new_gap[0], 0.15, delta=0.03)
        np.testing.assert_allclose(out[:len(tone)], tone)  # the word before is untouched
        np.testing.assert_allclose(out[-len(tone):], tone)  # and the word after

    def test_alignment_skips_silence_and_pins_commas(self):
        from engine import VoiceEngine
        from textnorm import Token
        toks = [(Token(0, 5, 'Hello', 'Hello,'), 'həlˈoʊ,'), (Token(7, 12, 'world', 'world'), 'wˈɜːld'),
                (Token(13, 16, 'and', 'and'), 'ænd'), (Token(17, 21, 'more', 'more.'), 'mˈɔːɹ.')]
        hop = 0.005
        ft = np.arange(0, 2.0, hop) + hop / 2
        active = np.ones(len(ft), bool)
        active[(ft > 0.5) & (ft < 0.7)] = False   # comma pause
        active[(ft > 1.2) & (ft < 1.5)] = False   # a silence inside the second clause
        starts, phones = VoiceEngine.align_phrase(None, toks, 2.0, [(0.5, 0.7)], (ft, active))
        self.assertEqual(starts[0], 0.0)
        self.assertAlmostEqual(starts[1], 0.7, delta=0.011)  # pinned to the end of the comma pause
        self.assertEqual(starts, sorted(starts))
        for t in starts[2:]:
            self.assertFalse(1.205 < t < 1.495, f'word starts inside a silence at {t}')
        self.assertEqual([t for t, _ in phones], sorted(t for t, _ in phones))


class MetricsTest(unittest.TestCase):
    def test_stoi_identity_and_noise(self):
        x = speechlike(3.0)
        self.assertGreater(metrics.stoi(x, x, SR), 0.99)
        noisy = x + np.random.default_rng(0).standard_normal(len(x)) * 0.3
        self.assertLess(metrics.stoi(x, noisy, SR), 0.8)

    def test_click_detector(self):
        x = speechlike(2.0)
        base = metrics.clicks(x, SR)
        x2 = x.copy()
        x2[SR // 2:] += 0.3  # hard step = click
        self.assertGreater(metrics.clicks(x2, SR), base)


@unittest.skipUnless(have_models(), 'Kokoro model files not installed')
class EngineTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from engine import VoiceEngine
        cls.engine = VoiceEngine()

    def test_blend_and_words(self):
        text = 'Good evening. Markets rose 1.2%, and the pound gained.'
        audio, sr, reply = self.engine.speak({'text': text, 'voice': 'bm_george:0.7+bm_fable:0.3',
                                              'lang': 'en-gb'})
        self.assertEqual(sr, 24000)
        self.assertAlmostEqual(reply['duration'], len(audio) / sr, places=2)
        times = [w['t'] for w in reply['words']]
        self.assertEqual(times, sorted(times))
        self.assertEqual(len(reply['words']), len(text.split()))
        self.assertTrue(all(text[w['char']:w['char'] + w['len']] == text.split()[i]
                            for i, w in enumerate(reply['words'])))
        self.assertEqual(len(reply['phrases']), 2)
        self.assertLess(reply['words'][-1]['t'], reply['duration'])
        # The second phrase starts after the first one plus its planned pause
        p0, p1 = reply['phrases']
        self.assertGreater(p1['t'], p0['t'] + p0['dur'] + 0.25)
        self.assertAlmostEqual(reply['lufs'], -16.0, delta=0.3)
        self.assertLessEqual(reply['truePeak'], -1.9)

    def test_preset_and_robot(self):
        _, _, reply = self.engine.speak({'text': 'Affirmative.', 'voice': 'unit8'})
        self.assertEqual(reply['effect'], 'robot')
        self.assertIn('am_echo', reply['voice'])

    def test_bad_voice(self):
        with self.assertRaises(ValueError):
            self.engine.speak({'text': 'Hi.', 'voice': 'nobody'})


@unittest.skipUnless(have_models(), 'Kokoro model files not installed')
class WorkerTest(unittest.TestCase):
    def test_protocol_survives_bad_requests(self):
        with tempfile.TemporaryDirectory() as d:
            proc = subprocess.Popen([sys.executable, os.path.join(HERE, 'kokoro_worker.py')],
                                    stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                    stderr=subprocess.DEVNULL, text=True, bufsize=1)
            try:
                def ask(obj):
                    proc.stdin.write((obj if isinstance(obj, str) else json.dumps(obj)) + '\n')
                    proc.stdin.flush()
                    return json.loads(proc.stdout.readline())
                ready = json.loads(proc.stdout.readline())
                self.assertTrue(ready['ready'])
                self.assertIn('paco', ready['presets'])
                self.assertEqual(ask({'id': 1, 'cmd': 'ping'}), {'id': 1, 'ok': True, 'pong': True})
                bad = ask('{not json')
                self.assertFalse(bad['ok'])
                r = ask({'id': 2, 'text': 'Hello.', 'voice': 'nobody', 'out': os.path.join(d, 'a.wav')})
                self.assertEqual((r['id'], r['ok']), (2, False))
                r = ask({'id': 3, 'text': 'Hello.', 'voice': 'af_heart', 'out': 'relative.wav'})
                self.assertFalse(r['ok'])
                out = os.path.join(d, 'b.ogg')
                r = ask({'id': 4, 'text': 'Hello there, viewers.', 'voice': 'lola', 'out': out,
                         'phrases': [{'text': 'Hello there,', 'pauseAfter': 0.2}, {'text': 'viewers.'}]})
                self.assertTrue(r['ok'], r.get('error'))
                self.assertTrue(os.path.getsize(out) > 1000)
                self.assertEqual([w['char'] for w in r['words']], [0, 6, 13])
                self.assertEqual(len(r['phrases']), 2)
                self.assertEqual(ask({'id': 5, 'cmd': 'quit'})['bye'], True)
                proc.wait(timeout=10)
                self.assertEqual(proc.returncode, 0)
            finally:
                if proc.poll() is None:
                    proc.kill()
                    proc.wait(timeout=10)
                proc.stdin.close()
                proc.stdout.close()


if __name__ == '__main__':
    unittest.main()
