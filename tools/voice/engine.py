"""GLOBIT 24 voice engine: Kokoro synthesis, word timing and broadcast processing.

One VoiceEngine loads the model once and turns a request into a finished
clip plus a timeline the client can lip-sync to:

  text -> phrases (sentences, or the caller's own) -> normalised tokens
       -> espeak phonemes in context -> Kokoro, one pass per phrase
       -> trim + level each phrase -> join with planned pauses
       -> word/phoneme times (phoneme weights, snapped to audible pauses)
       -> broadcast chain (dsp.py) -> file (audio_io.py)

Kokoro v1.0's ONNX export reports no durations, so timings come from the
structure we control: phrase boundaries are exact (each phrase is its own
pass), pauses are ours, and inside a phrase words are spread by phoneme
weight and pinned to the silences the model leaves at commas.

Voices: a Kokoro name ("bm_george"), a blend ("bm_george:0.7+bm_lewis:0.3",
weighted average of the style embeddings), or a presenter preset from
presets.json ("paco").
"""

import json
import math
import os
import re
import sys
import time

import numpy as np

import dsp
from textnorm import pause_table, plan_phrases

try:  # espeak-ng is process-global; share kokoro-onnx's lock when it has one
    from kokoro_onnx.tokenizer import _espeak_lock
except ImportError:  # older kokoro-onnx
    import threading
    _espeak_lock = threading.Lock()

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
SAMPLE_RATE = 24000
MAX_TEXT = 6000
MAX_PHONEMES = 500

_VOWELS = set('aeiouæɑɒɔəɛɜɪʊʌɐᵻɚɝʉɨøœɘɵɤy')
_PHONE_WEIGHT = {**{c: 0.65 for c in 'pbtdkɡg'}, **{c: 0.85 for c in 'fvθðzhçx'},
                 's': 1.0, 'ʃ': 1.0, 'ʒ': 0.9, **{c: 0.7 for c in 'mnŋ'},
                 **{c: 0.6 for c in 'lɹrwj'}, 'ɾ': 0.3, 'ʔ': 0.3, 'ɫ': 0.6}
_PUNCT = set(';:,.!?—…"()“”')
_CLAUSE_END = re.compile(r'[,;:—…]["”)]*$')


def log(*args):
    print('[voice]', *args, file=sys.stderr, flush=True)


def find_models():
    """(model, voices) paths: env overrides, then data/models, then ~/.cache/kokoro."""
    model = os.environ.get('KOKORO_MODEL')
    voices = os.environ.get('KOKORO_VOICES')
    dirs = [os.environ.get('KOKORO_DIR'), os.path.join(REPO, 'data', 'models'),
            os.path.expanduser('~/.cache/kokoro')]
    for d in dirs:
        if not d:
            continue
        if not model and os.path.exists(os.path.join(d, 'kokoro-v1.0.onnx')):
            model = os.path.join(d, 'kokoro-v1.0.onnx')
        if not voices and os.path.exists(os.path.join(d, 'voices-v1.0.bin')):
            voices = os.path.join(d, 'voices-v1.0.bin')
    if not model or not voices:
        raise FileNotFoundError('Kokoro model files not found; run tools/voice/fetch-models.sh '
                                'or set KOKORO_MODEL / KOKORO_VOICES')
    return model, voices


def _default_vocab():
    from kokoro_onnx.config import get_vocab
    return get_vocab()


def lang_for(voice_name):
    return {'a': 'en-us', 'b': 'en-gb', 'e': 'es', 'f': 'fr-fr', 'h': 'hi', 'i': 'it',
            'p': 'pt-br', 'j': 'ja', 'z': 'cmn'}.get(voice_name[:1], 'en-us')


_REDUCED = set('əɐᵻɚɪ')  # vowels Kokoro says short when unstressed


def phone_weights(ph):
    """Relative duration weight of each phoneme symbol in an espeak IPA string.

    Stressed vowels are longest, unstressed reduced vowels (schwa) shortest,
    so function words ("on a", "of the") take the little time they really
    take in connected speech.
    """
    out = []
    stress = 0.0
    prev_vowel = False
    for c in ph:
        if c == 'ˈ':
            stress, w = 0.35, 0.0
        elif c == 'ˌ':
            stress, w = 0.15, 0.0
        elif c == 'ː':
            w = 0.0
            if out:
                out[-1] = (out[-1][0], out[-1][1] + 0.55)
            out.append((c, w))
            continue
        elif c in _VOWELS:
            if prev_vowel:
                w = 0.45  # second half of a diphthong
            elif stress == 0.0 and c in _REDUCED:
                w = 0.5
            else:
                w = 0.95 + stress
            stress = 0.0
        elif c in _PUNCT or c.isspace() or c == '-':
            w = 0.0
        else:
            w = _PHONE_WEIGHT.get(c, 0.6)
        prev_vowel = c in _VOWELS
        out.append((c, w))
    return out


class VoiceEngine:
    def __init__(self, model=None, voices=None):
        t0 = time.time()
        from kokoro_onnx import Kokoro  # heavy import, only when an engine is made
        if not model or not voices:
            fm, fv = find_models()
            model, voices = model or fm, voices or fv
        self.model_path, self.voices_path = model, voices
        threads = int(os.environ.get('KOKORO_THREADS') or 0)
        if threads > 0 and hasattr(Kokoro, 'from_session'):
            # Cap CPU use so a live channel (browser/OBS) keeps its cores
            import onnxruntime as rt
            opts = rt.SessionOptions()
            opts.intra_op_num_threads = threads
            opts.inter_op_num_threads = 1
            sess = rt.InferenceSession(model, sess_options=opts, providers=['CPUExecutionProvider'])
            self.kokoro = Kokoro.from_session(sess, voices)
        else:
            self.kokoro = Kokoro(model, voices)
        self.vocab = getattr(self.kokoro.tokenizer, 'vocab', None) or _default_vocab()
        self._backends = {}
        self._styles = {}
        self._cache = {}
        self.presets = self._load_json('presets.json').get('presets', {})
        tone = self._load_json('tone.json')
        self.tone_bands = tone.get('bands', [])
        self.tone_voices = tone.get('voices', {})
        log(f'kokoro ready in {time.time() - t0:.1f}s ({len(self.kokoro.voices)} voices)')

    @staticmethod
    def _load_json(name):
        path = os.path.join(HERE, name)
        try:
            with open(path, encoding='utf-8') as f:
                return json.load(f)
        except FileNotFoundError:
            return {}

    # ------------------------------------------------------------ voices

    def voice_names(self):
        return sorted(self.kokoro.voices.keys())

    def parse_voice(self, spec):
        """'a:0.7+b:0.3' -> [('a', 0.7), ('b', 0.3)] (weights normalised)."""
        parts = []
        for chunk in str(spec).replace(' ', '').split('+'):
            if not chunk:
                continue
            name, _, w = chunk.partition(':')
            weight = float(w) if w else 1.0
            if name not in self.kokoro.voices:
                raise ValueError(f'unknown voice {name!r}')
            if not (weight > 0 and math.isfinite(weight)):
                raise ValueError(f'bad weight for {name!r}')
            parts.append((name, weight))
        if not parts:
            raise ValueError('empty voice')
        total = sum(w for _, w in parts)
        return [(n, w / total) for n, w in parts]

    def style(self, spec):
        parts = self.parse_voice(spec)
        key = '+'.join(f'{n}:{w:.4f}' for n, w in parts)
        if key not in self._styles:
            blend = sum(self.kokoro.get_voice_style(n).astype(np.float64) * w for n, w in parts)
            self._styles[key] = blend.astype(np.float32)
        return self._styles[key], parts

    def tone_for(self, parts):
        """Per-voice tonal match (dB per band), blended like the voice."""
        if not self.tone_bands:
            return None
        acc = np.zeros(len(self.tone_bands))
        known = 0.0
        for name, w in parts:
            curve = self.tone_voices.get(name)
            if curve:
                acc += w * np.asarray(curve, dtype=float)
                known += w
        if known == 0:
            return None
        return list(zip(self.tone_bands, (acc / known).tolist()))

    def resolve(self, req):
        """Apply a preset (by 'preset' or a presenter id given as 'voice')."""
        out = dict(req)
        name = req.get('preset') or (req.get('voice') if req.get('voice') in self.presets else None)
        if name:
            if name not in self.presets:
                raise ValueError(f'unknown preset {name!r}')
            p = self.presets[name]
            if not req.get('voice') or req.get('voice') == name:
                out['voice'] = p['voice']
            for key in ('lang', 'speed', 'effect'):
                if out.get(key) is None and p.get(key) is not None:
                    out[key] = p[key]
            if 'chain' in p:
                out['chain'] = {**p['chain'], **(req.get('chain') or {})}
            if 'pauses' in p:
                out['pauses'] = {**p['pauses'], **(req.get('pauses') or {})}
        if not out.get('voice'):
            raise ValueError('missing voice')
        return out

    # ------------------------------------------------------------ text

    def _backend(self, lang):
        if lang not in self._backends:
            # Same espeak settings Kokoro uses itself (its Tokenizer already
            # pointed phonemizer at the bundled espeak-ng library)
            from phonemizer.backend import EspeakBackend
            self._backends[lang] = EspeakBackend(lang, preserve_punctuation=True, with_stress=True)
        return self._backends[lang]

    def _clean(self, ph):
        return ''.join(c for c in ph if c in self.vocab)

    def phonemize_phrase(self, phrase, lang):
        """Phonemes for Kokoro plus each token's phonemes (for timing weights)."""
        from phonemizer.separator import Separator
        tokens = [t for t in phrase.tokens if t.spoken]
        backend = self._backend(lang)
        with _espeak_lock:
            ctx = backend.phonemize([phrase.spoken], separator=Separator(word='|', phone=None))[0]
        words = [self._clean(w) for w in ctx.split('|')]
        words = [w for w in words if w.strip()]
        counts = [len(t.spoken.split()) for t in tokens]
        per_token = []
        if sum(counts) == len(words):
            i = 0
            for c in counts:
                per_token.append(' '.join(words[i:i + c]))
                i += c
        else:
            # espeak merged or split words: fall back to citation forms for weights
            with _espeak_lock:
                cites = backend.phonemize([t.spoken for t in tokens])
            per_token = [self._clean(c).strip() for c in cites]
        phonemes = ' '.join(' '.join(words).split())
        return phonemes, list(zip(tokens, per_token))

    # ------------------------------------------------------------ synthesis

    def _infer(self, phonemes, style, speed):
        # Kokoro is deterministic: identical passes (retries, the raw/processed
        # pair in measure.py, a re-requested segment) come from a small cache
        key = (phonemes, style.tobytes().__hash__(), round(float(speed), 4))
        hit = self._cache.pop(key, None)
        if hit is None:
            audio, _ = self.kokoro.create(phonemes, voice=style, speed=speed, is_phonemes=True, trim=False)
            hit = np.asarray(audio, dtype=np.float64)
        self._cache[key] = hit
        while len(self._cache) > 48:
            self._cache.pop(next(iter(self._cache)))
        return hit.copy()

    def synth_phrase(self, phonemes, style, speed):
        """Synthesise one phrase; split at a word gap if it exceeds the model context."""
        if len(phonemes) <= MAX_PHONEMES:
            return self._infer(phonemes, style, speed)
        cut = phonemes.rfind(' ', 0, MAX_PHONEMES)
        for mark in (', ', '; ', ': ', '— '):
            at = phonemes.rfind(mark, len(phonemes) // 4, MAX_PHONEMES)
            if at > 0:
                cut = at + 1
                break
        if cut <= 0:
            cut = MAX_PHONEMES
        a = self.synth_phrase(phonemes[:cut].strip(), style, speed)
        b = self.synth_phrase(phonemes[cut:].strip(), style, speed)
        a = a[:dsp.speech_bounds(a, SAMPLE_RATE)[1] + int(0.02 * SAMPLE_RATE)]
        b = b[max(0, dsp.speech_bounds(b, SAMPLE_RATE)[0] - int(0.01 * SAMPLE_RATE)):]
        return np.concatenate([dsp.fade(a, SAMPLE_RATE, 0, 0.01), np.zeros(int(0.06 * SAMPLE_RATE)),
                               dsp.fade(b, SAMPLE_RATE, 0.004, 0)])

    @staticmethod
    def _gaps(seg, sr):
        """Silent runs inside a phrase as [(start_s, end_s)] (pauses at commas)."""
        centres, level = dsp.frame_rms_db(seg, sr, hop=0.005, win=0.012)
        if len(level) < 3:
            return []
        quiet = level < level.max() - 30
        gaps, i = [], 0
        while i < len(quiet):
            if quiet[i]:
                j = i
                while j + 1 < len(quiet) and quiet[j + 1]:
                    j += 1
                if i > 0 and j < len(quiet) - 1 and (j - i + 1) * 0.005 >= 0.05:
                    gaps.append((centres[i] / sr, centres[j] / sr))
                i = j + 1
            else:
                i += 1
        return gaps

    def align_phrase(self, token_ph, dur, gaps, env=None):
        """Start time (s, from phrase onset) of each token and of its phonemes.

        Words are spread by phoneme weight over the time the phrase is actually
        sounding (`env` = (frame times, active mask)), so stop closures and
        micro-pauses consume no weight and a word that would land in a silence
        starts at the next sound onset. Clause marks are pinned to the pauses
        the model leaves at them.
        """
        weights, phones = [], []
        for tok, ph in token_ph:
            pw = phone_weights(ph) if ph else []
            w = sum(x for _, x in pw)
            if w <= 0:
                w = 0.25 * max(1, len(re.sub(r'[^A-Za-z0-9]', '', tok.spoken)))
            weights.append(w + 0.08)
            phones.append(pw)
        if weights:
            weights[-1] *= 1.2  # phrase-final lengthening
        n = len(weights)
        cum = np.concatenate([[0.0], np.cumsum(weights)])
        total = cum[-1] or 1.0
        speech = max(1e-3, dur - sum(e - s for s, e in gaps))

        def expected(i):
            return cum[i + 1] / total * speech

        # Pin clause marks to the pauses the model leaves at them
        anchors = []  # (token index after which the gap falls, gap)
        free = list(gaps)
        for i, (tok, _) in enumerate(token_ph[:-1]):
            if _CLAUSE_END.search(tok.spoken) or tok.spoken in ('—', '–'):
                passed = sum(e - s for s, e in gaps if e <= expected(i))
                t_exp = expected(i) + passed
                best = min(free, key=lambda g: abs((g[0] + g[1]) / 2 - t_exp), default=None)
                if best and abs((best[0] + best[1]) / 2 - t_exp) < max(0.35, 0.25 * dur):
                    if not anchors or best[0] > anchors[-1][1][1]:
                        anchors.append((i, best))
                        free.remove(best)

        # Active-time clock: t -> seconds of sound before t, and back
        if env is not None and len(env[0]) > 1:
            ft, active = env
            hop = float(ft[1] - ft[0])
            acc = np.concatenate([[0.0], np.cumsum(active.astype(float) * hop)])
            edges = np.concatenate([ft - hop / 2, [ft[-1] + hop / 2]])

            def to_active(t):
                i = int(np.clip(np.searchsorted(edges, t), 0, len(acc) - 1))
                return acc[i]

            def from_active(a, t_min):
                # First instant at which `a` seconds of sound have passed;
                # silent frames add nothing, so this lands on a sound onset
                i = int(np.searchsorted(acc, a, side='left'))
                if i <= 0:
                    return max(t_min, edges[0])
                if i >= len(acc):
                    return max(t_min, edges[-1])
                return max(t_min, min(edges[i], edges[i - 1] + (a - acc[i - 1])))
        else:
            def to_active(t):
                return t

            def from_active(a, t_min):
                return max(t_min, a)

        def spread(t0, t1, fracs):
            """Times in [t0, t1) at the given fractions of the sounding time."""
            a0, a1 = to_active(t0), to_active(t1)
            if a1 - a0 <= 1e-6:
                return [t0 + f * (t1 - t0) for f in fracs]
            return [min(t1, from_active(a0 + f * (a1 - a0), t0)) for f in fracs]

        starts = [0.0] * n
        seg_tok, seg_t = 0, 0.0
        for last, (g0, g1) in anchors + [(n - 1, (dur, dur))]:
            span_w = cum[last + 1] - cum[seg_tok] or 1.0
            fracs = [(cum[k] - cum[seg_tok]) / span_w for k in range(seg_tok, last + 1)]
            for k, t in zip(range(seg_tok, last + 1), spread(seg_t, g0, fracs)):
                starts[k] = t
            starts[seg_tok] = seg_t
            seg_tok, seg_t = last + 1, g1
            if seg_tok >= n:
                break
        for k in range(1, n):
            starts[k] = max(starts[k], starts[k - 1])
        ends = starts[1:] + [dur]
        timeline = []
        for k in range(n):
            pw = [(c, w) for c, w in phones[k] if w > 0]
            if not pw:
                continue
            tot = sum(w for _, w in pw)
            fracs, acc_w = [], 0.0
            for _, w in pw:
                fracs.append(acc_w / tot)
                acc_w += w
            for (c, _), t in zip(pw, spread(starts[k], ends[k], fracs)):
                timeline.append((t, c))
        return starts, timeline

    # ------------------------------------------------------------ main entry

    def speak(self, req):
        """Synthesise req -> (audio float64, sample rate, reply dict without id/ok)."""
        t0 = time.time()
        req = self.resolve(req)
        text = str(req.get('text') or '')
        if not text.strip():
            raise ValueError('empty text')
        if len(text) > MAX_TEXT:
            raise ValueError(f'text too long ({len(text)} > {MAX_TEXT} chars)')
        style, parts = self.style(req['voice'])
        lang = (req.get('lang') or lang_for(parts[0][0])).lower()
        speed = float(req.get('speed') or 1.0)
        if not (0.5 <= speed <= 2.0):
            raise ValueError('speed must be between 0.5 and 2.0')
        pauses = req.get('pauses') if isinstance(req.get('pauses'), dict) else None
        pause_add = float(req.get('pauseAdd') or 0.0)
        if not (-0.2 <= pause_add <= 2.0):
            raise ValueError('pauseAdd must be between -0.2 and 2.0 seconds')
        phrases = plan_phrases(text, lang, req.get('phrases'), speed, pauses, pause_add)
        if not phrases:
            raise ValueError('nothing to say')
        # Silences Kokoro leaves inside a phrase (0.3-0.4 s at commas) are cut
        # down to the comma pause of the programme's style; false disables it
        gap_max = req.get('gapMax')
        if gap_max is None:
            gap_max = pause_table(pauses, pause_add)['comma'] / max(0.5, speed) ** 0.5
        gap_max = float(gap_max) if gap_max else 0.0
        sr = SAMPLE_RATE
        lead, tail = int(0.012 * sr), int(0.025 * sr)

        clips = []
        for ph in phrases:
            phonemes, token_ph = self.phonemize_phrase(ph, lang)
            if not phonemes.strip(' .,;:!?—…"“”()'):
                continue
            raw = self.synth_phrase(phonemes, style, min(2.0, max(0.5, speed * ph.speed)))
            s, e = dsp.speech_bounds(raw, sr)
            if e <= s:
                continue
            seg = dsp.fade(raw[max(0, s - lead):min(len(raw), e + tail)], sr, 0.004, 0.012)
            onset = (s - max(0, s - lead)) / sr
            dur = (e - s) / sr
            if gap_max > 0:
                seg, cut = tighten_gaps(seg, sr, self._gaps(seg, sr), gap_max)
                dur -= cut
            gaps = [(a - onset, b - onset) for a, b in self._gaps(seg, sr)]
            centres, level = dsp.frame_rms_db(seg, sr, hop=0.005, win=0.012)
            env = (centres / sr - onset, level > level.max() - 32)
            starts, timeline = self.align_phrase(token_ph, dur, gaps, env)
            clips.append({'phrase': ph, 'audio': seg, 'onset': onset, 'dur': dur,
                          'tokens': [t for t, _ in token_ph], 'starts': starts,
                          'timeline': timeline, 'level': dsp.active_level_db(seg, sr)})
        if not clips:
            raise ValueError('nothing audible was synthesised')

        # Level phrases toward the median: separate passes can differ by a few dB
        if len(clips) > 1:
            median = float(np.median([c['level'] for c in clips]))
            for c in clips:
                c['audio'] = c['audio'] * 10 ** (float(np.clip((median - c['level']) * 0.75, -4, 4)) / 20)

        pieces, words, phr, phones = [], [], [], []
        cursor = 0
        for i, c in enumerate(clips):
            base = cursor / sr + c['onset']
            phr.append({'t': round(base, 3), 'dur': round(c['dur'], 3),
                        'char': c['phrase'].start, 'len': c['phrase'].end - c['phrase'].start})
            for tok, st in zip(c['tokens'], c['starts']):
                if tok.primary and re.search(r'[A-Za-z0-9]', tok.spoken):
                    words.append({'t': round(base + st, 3), 'char': tok.start,
                                  'len': tok.end - tok.start})
            phones.extend([round(base + t, 3), p] for t, p in c['timeline'])
            pieces.append(c['audio'])
            cursor += len(c['audio'])
            if i < len(clips) - 1:
                gap = int(c['phrase'].pause * sr)
                pieces.append(np.zeros(gap))
                cursor += gap
        dry = np.concatenate(pieces)

        tone = None if req.get('tone') is False else self.tone_for(parts)
        effect = req.get('effect') or None
        if effect not in (None, 'none', 'robot'):
            raise ValueError(f'unknown effect {effect!r}')
        chain = req.get('chain') if isinstance(req.get('chain'), dict) else None
        if req.get('raw'):
            audio, stats = dry, {}
        else:
            audio, stats = dsp.broadcast(dry, sr, tone=tone, effect=effect, overrides=chain)
        duration = len(audio) / sr
        reply = {
            'duration': round(duration, 3),
            'sampleRate': sr,
            'words': words,
            'phrases': phr,
            'voice': '+'.join(f'{n}:{w:.2f}' if len(parts) > 1 else n for n, w in parts),
            'lang': lang,
            'speed': speed,
            'effect': effect if effect != 'none' else None,
            **stats,
            'elapsed': round(time.time() - t0, 2),
        }
        if req.get('phones'):
            reply['phones'] = phones
        if req.get('levels'):
            reply['levels'] = envelope(audio, sr, int(req.get('levelsRate') or 50))
        return audio, sr, reply


def tighten_gaps(seg, sr, gaps, target, keep=0.03, xfade=0.006):
    """Shorten silent runs longer than `target` seconds by cutting their quiet core.

    Only the middle of a run already 30 dB below the phrase peak is removed,
    with a short crossfade, so the decay of the word before and the onset of
    the word after stay intact. Returns (audio, seconds removed).
    """
    pieces, cursor, removed = [], 0, 0
    nx = int(xfade * sr)
    for g0, g1 in gaps:
        length = g1 - g0
        if length <= target + 0.03 or length - 2 * keep <= 0:
            continue
        cut = min(length - max(target, 2 * keep), length - 2 * keep)
        if cut * sr < 2 * nx:
            continue
        a = int((g0 + (length - cut) / 2) * sr)
        b = a + int(cut * sr)
        head = seg[cursor:a + nx].copy()
        tail_start = b
        ramp = np.linspace(1.0, 0.0, nx)
        head[-nx:] = head[-nx:] * ramp + seg[tail_start:tail_start + nx] * (1 - ramp)
        pieces.append(head)
        cursor = tail_start + nx
        removed += b - a
    if not pieces:
        return seg, 0.0
    pieces.append(seg[cursor:])
    return np.concatenate(pieces), removed / sr


def envelope(audio, sr, rate=50):
    """Loudness per frame, 0..1 (for mouths that follow the real signal)."""
    _, level = dsp.frame_rms_db(audio, sr, hop=1.0 / rate, win=2.0 / rate)
    top = level.max() if len(level) else 0.0
    vals = np.clip((level - (top - 40)) / 40, 0, 1)
    return {'rate': rate, 'values': [round(float(v), 2) for v in vals]}
