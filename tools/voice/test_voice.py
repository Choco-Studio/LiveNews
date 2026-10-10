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

    def test_softer_robot_presets_keep_targets(self):
        # owner 3 Oct: three softer machines for UNIT-8 (casting.json "effect"); each keeps the delivery targets
        x = speechlike(3.0)
        for name in ('robot-soft', 'robot-cabin', 'robot-warm'):
            self.assertIn(name, dsp.ROBOT_PRESETS)
            y, _ = dsp.broadcast(x, SR, effect=name)
            self.assertTrue(np.all(np.isfinite(y)), name)
            self.assertAlmostEqual(loudness.integrated_loudness(y, SR), -16.0, delta=0.3, msg=name)
            self.assertLessEqual(loudness.true_peak(y), -1.9, name)

    def test_breath_sits_inside_the_pause(self):
        # owner 3 Oct: natural voices, "sin exagerar": a soft inhale ~30 dB under the speech, inside the pause
        silence = np.zeros(int(0.31 * SR))
        out = dsp.breath_into(silence, SR, -20.0, seed=7)
        self.assertEqual(len(out), len(silence))
        nz = np.flatnonzero(np.abs(out) > 0)
        self.assertGreater(len(nz), int(0.12 * SR))
        self.assertLessEqual(nz[-1], len(out) - int(0.06 * SR))  # it ends before the next phrase
        level = 20 * np.log10(np.sqrt(np.mean(out[nz] ** 2)))
        self.assertAlmostEqual(level, -50.0, delta=3.0)
        # a pause too short keeps its silence; the same seed gives the same breath
        self.assertFalse(np.any(dsp.breath_into(np.zeros(int(0.15 * SR)), SR, -20.0)))
        self.assertTrue(np.array_equal(out, dsp.breath_into(silence, SR, -20.0, seed=7)))

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


def vowel(seconds=2.0, f0=140.0, glide=0.0, vibrato=0.0):
    """A sustained vowel: harmonics of f0 (gliding by `glide` semitones, with a 5 Hz vibrato of +-`vibrato`)
    under fixed formants (700, 1200, 2600 Hz)."""
    t = np.arange(int(seconds * SR)) / SR
    f = f0 * 2 ** ((glide * t / seconds + vibrato * np.sin(2 * np.pi * 5 * t)) / 12)
    phase = 2 * np.pi * np.cumsum(f) / SR
    env = lambda h: sum(a / (1 + ((h - fc) / bw) ** 2) for fc, bw, a in ((700, 90, 1.0), (1200, 110, 0.6), (2600, 160, 0.3)))
    offsets = np.random.default_rng(5).random(60) * 2 * np.pi
    y = sum(env(k * f) * np.sin(k * phase + offsets[k]) for k in range(1, 60) if k * f0 < 0.45 * SR)
    return 0.3 * y / np.max(np.abs(y))


def third_octaves(x, lo=400.0, bands=13):
    """Long-term level (dB) in third-octave bands from `lo` (the formant region, above the pitch)."""
    P = np.abs(np.fft.rfft(x)) ** 2
    f = np.fft.rfftfreq(len(x), 1 / SR)
    edges = lo * 2 ** (np.arange(bands + 1) / 3)
    return np.array([10 * np.log10(P[(f >= a) & (f < b)].sum() + 1e-12) for a, b in zip(edges[:-1], edges[1:])])


class MelodyTest(unittest.TestCase):
    """The newsreader melody: pitch and gain curves that keep timing and timbre (no model)."""

    def median_semis(self, y, x):
        return 12 * math.log2(np.median(dsp.pitch_track(y, SR)[1]) / np.median(dsp.pitch_track(x, SR)[1]))

    def test_pitch_track_reads_the_fundamental(self):
        t = np.arange(SR) / SR
        for f0 in (85.0, 140.0, 210.0, 330.0):
            # a 2nd harmonic louder than the fundamental must not read an octave up
            y = 0.3 * np.sin(2 * np.pi * f0 * t) + 0.8 * np.sin(4 * np.pi * f0 * t) + 0.2 * np.sin(6 * np.pi * f0 * t)
            _, f = dsp.pitch_track(y, SR)
            self.assertGreater(len(f), 80)
            self.assertAlmostEqual(float(np.median(f)), f0, delta=f0 * 0.01)
        self.assertEqual(len(dsp.pitch_track(np.zeros(SR), SR)[1]), 0)

    def test_pitch_curve_moves_the_pitch_and_keeps_the_length(self):
        x = vowel(2.0, 140.0, glide=2.0)
        for semis in (-1.5, 1.0, 2.0):
            y = dsp.pitch_curve(x, SR, [0, 2.0], [semis, semis])
            self.assertEqual(len(y), len(x))
            self.assertAlmostEqual(self.median_semis(y, x), semis, delta=0.15)
        # a curve: up at the start, down at the end
        y = dsp.pitch_curve(x, SR, [0, 2.0], [1.5, -1.5])
        t0, f0 = dsp.pitch_track(x, SR)
        t1, f1 = dsp.pitch_track(y, SR)
        early = 12 * math.log2(np.median(f1[t1 < 0.6]) / np.median(f0[t0 < 0.6]))
        late = 12 * math.log2(np.median(f1[t1 > 1.4]) / np.median(f0[t0 > 1.4]))
        self.assertGreater(early, 0.7)
        self.assertLess(late, -0.7)
        # nothing to do: an exact copy
        np.testing.assert_array_equal(dsp.pitch_curve(x, SR, [0, 2.0], [0, 0]), x)

    def test_pitch_curve_keeps_the_formants(self):
        # the resample carries the vowel's formants with the pitch; keep_envelope puts them back: the result
        # is measured against the same vowel sung at the new pitch
        x = vowel(2.0, 140.0)
        for semis in (-2.0, 2.0):
            ref = third_octaves(vowel(2.0, 140.0 * 2 ** (semis / 12)))
            y = dsp.pitch_curve(x, SR, [0, 2.0], [semis, semis])
            d = third_octaves(y) - ref
            kept = float(np.sqrt(np.mean((d - d.mean()) ** 2)))
            original = dsp.keep_envelope
            try:
                dsp.keep_envelope = lambda w, sr, rate, f0=None: w
                z = dsp.pitch_curve(x, SR, [0, 2.0], [semis, semis])
            finally:
                dsp.keep_envelope = original
            d = third_octaves(z) - ref
            carried = float(np.sqrt(np.mean((d - d.mean()) ** 2)))
            self.assertLess(kept, 2.0, f'{semis}: {kept:.2f} dB')
            self.assertLess(kept, carried * 0.6, f'{semis}: {kept:.2f} vs {carried:.2f} dB')

    def test_keep_envelope_at_rate_one_changes_nothing(self):
        x = speechlike(1.5)
        np.testing.assert_allclose(dsp.keep_envelope(x, SR, np.ones(len(x))), x, atol=1e-9)

    def test_gain_curve(self):
        x = np.ones(SR)
        y = dsp.gain_curve(x, SR, [0.0, 1.0], [0.0, -6.0])
        self.assertAlmostEqual(y[0], 1.0)
        self.assertAlmostEqual(y[SR // 2], 10 ** (-3 / 20), places=3)

    def clip(self, audio, pitch=(0.0, 0.0), gain=0.0, accents=()):
        from textnorm import Phrase, Token
        toks = [Token(0, 4, 'Rain', 'Rain'), Token(5, 10, 'fell', 'fell'), Token(11, 15, '4.75', 'four'),
                Token(11, 15, '4.75', 'point'), Token(16, 23, 'inches.', 'inches.')]
        ph = Phrase(0, 23, 'Rain fell 4.75 inches.', 0.0, toks, pitch=pitch, gain=gain, accents=list(accents))
        return {'phrase': ph, 'audio': audio, 'onset': 0.1, 'dur': len(audio) / SR - 0.2, 'tokens': toks,
                'starts': [0.0, 0.3, 0.6, 0.8, 1.0]}

    def test_melody_curve_puts_the_lift_on_the_word(self):
        from engine import melody_curve
        c = self.clip(np.zeros(int(1.6 * SR)), pitch=(1.0, -1.0), gain=0.5, accents=[(11, 15, 2.0, 1.5)])
        grid, semis, db = melody_curve(c, SR)
        at = lambda t: int(round(t / 0.005))
        self.assertAlmostEqual(semis[at(0.05)], 1.0, places=2)   # held before the speech
        self.assertAlmostEqual(semis[at(1.55)], -1.0, places=2)  # and after it
        # the figure's words (four point: 0.7-1.1 s from the start of the audio) carry the lift
        base = lambda t: 1.0 - 2.0 * (t - 0.1) / 1.4
        self.assertAlmostEqual(semis[at(0.9)], base(0.9) + 2.0, places=2)
        self.assertAlmostEqual(db[at(0.9)], 2.0, places=2)
        self.assertAlmostEqual(semis[at(0.3)], base(0.3), places=2)  # "Rain" is left alone
        self.assertAlmostEqual(db[at(0.3)], 0.5, places=2)
        self.assertIsNone(melody_curve(self.clip(np.zeros(SR)), SR))

    def test_shape_melody_steers_to_the_planned_line(self):
        import engine
        # Kokoro left the second phrase 2.4 st above the first; the plan wants it 1 st below
        a = self.clip(vowel(1.6, 130.0), pitch=(0.5, 0.5))
        b = self.clip(vowel(1.6, 130.0 * 2 ** (2.4 / 12)), pitch=(-0.5, -0.5))
        dry = [a['audio'].copy(), b['audio'].copy()]
        engine.shape_melody([a, b], SR)
        for c, x in zip((a, b), dry):
            self.assertEqual(len(c['audio']), len(x))
        after = 12 * math.log2(np.median(dsp.pitch_track(b['audio'], SR)[1]) / np.median(dsp.pitch_track(a['audio'], SR)[1]))
        self.assertAlmostEqual(after, 2.4 * (1 - engine.STEER) - 1.0, delta=0.3)
        self.assertIn('gain', a)

    def test_caller_melody_is_kept_and_clamped(self):
        text = 'Rates rose. Will they fall?'
        ph = plan_phrases(text, 'en-us', [
            {'text': 'Rates rose.', 'pitch': [1.2, 0.8], 'gain': 0.4, 'accents': [{'start': 0, 'end': 5, 'semis': 1.5, 'db': 1.2}]},
            {'text': 'Will they fall?', 'pitch': [9, 'x'], 'gain': 12, 'accents': [{'start': 'a', 'end': 3}, 7, {'start': 12, 'end': 16, 'semis': -9, 'db': 0}]},
        ])
        self.assertEqual(ph[0].pitch, (1.2, 0.8))
        self.assertEqual(ph[0].gain, 0.4)
        self.assertEqual(ph[0].accents, [(0, 5, 1.5, 1.2)])
        self.assertEqual(ph[1].pitch, (0.0, 0.0))  # not a pair of numbers: no line
        self.assertEqual(ph[1].gain, 3.0)
        self.assertEqual(ph[1].accents, [(12, 16, -3.0, 0.0)])


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

    def test_melody_keeps_the_timing(self):
        # the newsreader melody bends the pitch and gain only: same length, same word times
        text = 'Rates rose to 4.75 percent today. Most economists had expected no change.'
        req = {'text': text, 'voice': 'bm_george:0.6+bm_lewis:0.4', 'lang': 'en-gb', 'phrases': [
            {'text': 'Rates rose to 4.75 percent today.', 'pauseAfter': 0.4, 'pitch': [1.4, 1.1], 'gain': 0.5,
             'accents': [{'start': 14, 'end': 18, 'semis': 1.5, 'db': 1.5}]},
            {'text': 'Most economists had expected no change.', 'pitch': [-0.8, -1.1], 'gain': -0.3}]}
        a, _, ra = self.engine.speak({**req, 'melody': False})
        b, _, rb = self.engine.speak(req)
        self.assertEqual(ra['words'], rb['words'])
        self.assertEqual(ra['phrases'], rb['phrases'])
        self.assertLess(abs(len(a) - len(b)) / SR, 0.05)  # only the room tail, trimmed by level, may differ
        self.assertAlmostEqual(rb['lufs'], -16.0, delta=0.3)
        # the lead sits above the close (whatever Kokoro did with each on its own)
        t, f = dsp.pitch_track(b, SR)
        p0, p1 = rb['phrases']
        lead = np.median(f[(t >= p0['t']) & (t < p0['t'] + p0['dur'])])
        close = np.median(f[(t >= p1['t']) & (t < p1['t'] + p1['dur'])])
        self.assertGreater(12 * math.log2(lead / close), 1.0)

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
