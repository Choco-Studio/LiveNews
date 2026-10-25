"""Professional voices for GLOBIT 24: a commercial engine reads, the channel's chain finishes (owner, 25 Oct: "ponte con
lo de las voces a nivel profesional"; docs/roadmap/critique/voices-pro.md).

A request that carries `pro` ({"engine": "inworld" | "elevenlabs", "voiceId", "model", "speed", "delivery",
"settings", "chain"}) is read by that engine instead of Kokoro:

  - the whole segment in one request, so the engine reads it as a paragraph (its intonation across sentences is most
    of what it is better at), from the newsreader text the planner already wrote (textnorm.plan_phrases: numbers,
    money and acronyms said the channel's way);
  - the engine's own word timings (Inworld: word alignment; ElevenLabs: character alignment), mapped back to the
    request's words, so captions and lips follow the voice exactly (Kokoro's are estimated);
  - the pauses between the planner's phrases set to the programme's own (the pacing bible), cut from the engine's audio
    at its word boundaries; a breath or a sound between two phrases goes with the cut (the owner's rule: no breaths);
  - then the channel's broadcast chain (dsp.broadcast: the same loudness, peaks and, for UNIT-8, the same robot effect).

Anything that goes wrong (no key, the network, the vendor, words that cannot be matched) raises ProError, and the
worker reads the segment with Kokoro instead (speak_any), saying so in the reply (`fallback`). Keys from the
environment only: INWORLD_API_KEY (the Base64 credential the portal gives), ELEVENLABS_API_KEY. INWORLD_API_BASE and
ELEVENLABS_API_BASE point tests at local stand-ins.

Vendor references, read 25 Oct 2026: docs.inworld.ai (POST /tts/v1/voice, timestampType WORD, deliveryMode, PCM);
elevenlabs.io/docs (POST /v1/text-to-speech/{voice_id}/with-timestamps, output_format pcm_24000).
"""

import base64
import difflib
import json
import os
import re
import time
import urllib.error
import urllib.request

import numpy as np

import dsp
from textnorm import plan_phrases

ENGINES = ('inworld', 'elevenlabs')
# the most a request carries (Inworld takes 2,000 UTF-16 units, ElevenLabs far more): a longer segment goes in pieces,
# cut between the planner's phrases, each told what came before it so the reading runs on
MAX_CHARS = {'inworld': 1800, 'elevenlabs': 4500}
LEAD, TAIL = 0.012, 0.035  # seconds kept before a phrase's first word and after its last (as the Kokoro path keeps)


class ProError(Exception):
    """The professional engine could not read this request (the worker falls back to Kokoro)."""


def _post(url, headers, body, timeout=90, retries=2):
    data = json.dumps(body).encode('utf-8')
    last = None
    for attempt in range(retries + 1):
        req = urllib.request.Request(url, data=data, method='POST',
                                     headers={'Content-Type': 'application/json', 'Accept': 'application/json', **headers})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            detail = e.read().decode('utf-8', 'replace')[:300]
            last = f'HTTP {e.code}: {detail}'
            if e.code not in (408, 429, 500, 502, 503, 504):
                break
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            last = f'network: {e}'
        if attempt < retries:
            time.sleep(min(8, 1.5 * 2 ** attempt))
    raise ProError(last or 'no answer')


def _pcm16(raw):
    return np.frombuffer(raw[: len(raw) - len(raw) % 2], dtype='<i2').astype(np.float64) / 32768.0


def _norm(word):
    return re.sub(r'[^a-z0-9]', '', word.lower())


# ------------------------------------------------------------------ the engines

class Inworld:
    name = 'inworld'

    def __init__(self, env):
        self.key = env.get('INWORLD_API_KEY') or ''
        self.base = (env.get('INWORLD_API_BASE') or 'https://api.inworld.ai').rstrip('/')

    def read(self, text, voice, sr, lang, previous=None):
        """-> (audio at sr, [(word, start s, end s)], characters billed)"""
        if not self.key:
            raise ProError('INWORLD_API_KEY is not set')
        config = {'audioEncoding': 'PCM', 'sampleRateHertz': sr}
        if voice.get('speed'):
            config['speakingRate'] = float(voice['speed'])
        body = {
            'text': text,
            'voiceId': voice['voiceId'],
            'modelId': voice.get('model') or 'inworld-tts-2',
            'audioConfig': config,
            'timestampType': 'WORD',
            # the steadiest reading: news, where every word must be the written one
            'deliveryMode': voice.get('delivery') or 'STABLE',
            # the planner has already written numbers and money as they are said
            'applyTextNormalization': 'OFF',
            'language': {'en-gb': 'en-GB', 'en-us': 'en-US'}.get(lang, 'en-US'),
        }
        if previous:
            body['synthesisContext'] = {'previousRequests': [{'text': previous}]}
        j = _post(f'{self.base}/tts/v1/voice', {'Authorization': f'Basic {self.key}'}, body)
        audio = _pcm16(base64.b64decode(j.get('audioContent') or ''))
        wa = (j.get('timestampInfo') or {}).get('wordAlignment') or {}
        words = list(zip(wa.get('words') or [], wa.get('wordStartTimeSeconds') or [], wa.get('wordEndTimeSeconds') or []))
        chars = (j.get('usage') or {}).get('processedCharactersCount') or len(text)
        return audio, words, chars


class ElevenLabs:
    name = 'elevenlabs'

    def __init__(self, env):
        self.key = env.get('ELEVENLABS_API_KEY') or ''
        self.base = (env.get('ELEVENLABS_API_BASE') or 'https://api.elevenlabs.io').rstrip('/')

    def read(self, text, voice, sr, lang, previous=None):
        if not self.key:
            raise ProError('ELEVENLABS_API_KEY is not set')
        settings = {'stability': 0.6, 'similarity_boost': 0.8, 'style': 0.0, 'use_speaker_boost': True}
        settings.update(voice.get('settings') or {})
        if voice.get('speed'):
            settings['speed'] = float(voice['speed'])
        body = {'text': text, 'model_id': voice.get('model') or 'eleven_v4_turbo', 'voice_settings': settings,
                'apply_text_normalization': 'off', 'language_code': 'en'}
        if voice.get('seed') is not None:
            body['seed'] = int(voice['seed'])
        if previous:
            body['previous_text'] = previous
        url = f'{self.base}/v1/text-to-speech/{voice["voiceId"]}/with-timestamps?output_format=pcm_{sr}'
        j = _post(url, {'xi-api-key': self.key}, body)
        audio = _pcm16(base64.b64decode(j.get('audio_base64') or ''))
        al = j.get('alignment') or {}
        chars = al.get('characters') or []
        starts = al.get('character_start_times_seconds') or []
        ends = al.get('character_end_times_seconds') or []
        # characters back into words: a word is a run of characters that are not spaces
        words, cur = [], None
        for c, s, e in zip(chars, starts, ends):
            if c.isspace():
                if cur:
                    words.append(tuple(cur))
                cur = None
            elif cur is None:
                cur = [c, s, e]
            else:
                cur[0] += c
                cur[2] = e
        if cur:
            words.append(tuple(cur))
        return audio, words, len(text)


def engine_for(name, env=None):
    env = os.environ if env is None else env
    if name == 'inworld':
        return Inworld(env)
    if name == 'elevenlabs':
        return ElevenLabs(env)
    raise ProError(f'unknown professional engine {name!r} (known: {", ".join(ENGINES)})')


# ------------------------------------------------------------------ the words, the pauses, the chain

def match_words(ours, theirs):
    """Our spoken words (strings) against the engine's [(word, start, end)]: -> [(start, end) | None] per ours.

    Matched on letters and digits only, in order (difflib over the two sequences): the engine may split "U.S." or
    join "well-known" its own way (the same letters, shared); a word it did not say is left None (the caller counts
    them, and _fill gives it its neighbours' time).
    """
    a = [_norm(w) for w in ours]
    b = [_norm(w) for w, _, _ in theirs]
    out = [None] * len(a)
    sm = difflib.SequenceMatcher(a=a, b=b, autojunk=False)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == 'equal':
            for k in range(i2 - i1):
                out[i1 + k] = (float(theirs[j1 + k][1]), float(theirs[j1 + k][2]))
        elif tag == 'replace' and j2 > j1 and ''.join(a[i1:i2]) == ''.join(b[j1:j2]):
            # n of ours against m of theirs with the same letters (a split or a join: "US" / "U" "S"): share the span
            t0, t1 = float(theirs[j1][1]), float(theirs[j2 - 1][2])
            n = i2 - i1
            for k in range(n):
                out[i1 + k] = (t0 + (t1 - t0) * k / n, t0 + (t1 - t0) * (k + 1) / n)
    return out


def _fill(times, total):
    """Unmatched words (None) between matched ones: spread evenly; -> list of (start, end), never decreasing."""
    n = len(times)
    out = list(times)
    i = 0
    while i < n:
        if out[i] is not None:
            i += 1
            continue
        j = i
        while j < n and out[j] is None:
            j += 1
        t0 = out[i - 1][1] if i > 0 else 0.0
        t1 = out[j][0] if j < n else total
        span = max(0.0, t1 - t0)
        for k in range(i, j):
            out[k] = (t0 + span * (k - i) / (j - i), t0 + span * (k - i + 1) / (j - i))
        i = j
    prev = 0.0
    fixed = []
    for s, e in out:
        s = max(prev, s)
        e = max(s, e)
        fixed.append((s, e))
        prev = s
    return fixed


def speak_pro(req, sr, env=None, engine=None):
    """req -> (audio float64 at sr, reply dict). The broadcast chain applied; raises ProError on any failure."""
    pro = req.get('pro') or {}
    name = pro.get('engine')
    if not pro.get('voiceId'):
        raise ProError('no professional voice for this character (server/voice/procast.json)')
    vendor = engine or engine_for(name, env)
    text = str(req.get('text') or '')
    lang = str(req.get('lang') or 'en-us').lower()
    pauses = req.get('pauses') if isinstance(req.get('pauses'), dict) else None
    phrases = plan_phrases(text, lang, req.get('phrases'), 1.0, pauses, float(req.get('pauseAdd') or 0.0))
    if not phrases:
        raise ProError('nothing to say')
    # what the engine reads: the planner's spoken words, phrase after phrase, in requests of at most MAX_CHARS
    groups, cur, size = [], [], 0
    for pi, ph in enumerate(phrases):
        n = len(ph.spoken) + 1
        if cur and size + n > MAX_CHARS.get(vendor.name, 1800):
            groups.append(cur)
            cur, size = [], 0
        cur.append(pi)
        size += n
    if cur:
        groups.append(cur)
    t0 = time.time()
    spans = []  # per phrase: (phrase index, its request's audio, the audio's length, start, end, [(token | None, start)])
    chars_total = 0
    previous = None
    for g in groups:
        ours, owner = [], []  # the spoken words, and the (phrase, token) each comes from (None: a token's 2nd+ word)
        for pi in g:
            for tok in phrases[pi].tokens:
                for k, w in enumerate(tok.spoken.split()):
                    if not re.search(r'[A-Za-z0-9]', w):
                        continue
                    ours.append(w)
                    owner.append((pi, tok if k == 0 else None))
        if not ours:
            continue
        sent = ' '.join(phrases[pi].spoken for pi in g)
        audio, theirs, chars = vendor.read(sent, pro, sr, lang, previous=previous)
        previous = sent
        chars_total += int(chars)
        if len(audio) < int(0.1 * sr):
            raise ProError('the engine returned no audio')
        if not theirs:
            raise ProError('the engine returned no word timings')
        total = len(audio) / sr
        matched = match_words(ours, theirs)
        hits = sum(1 for m in matched if m is not None)
        if hits < 0.8 * len(ours):
            raise ProError(f'the engine read other words ({hits} of {len(ours)} matched)')
        times = _fill(matched, total)
        for pi in g:
            idx = [k for k, (p, _) in enumerate(owner) if p == pi]
            if idx:
                spans.append((pi, audio, total, times[idx[0]][0], times[idx[-1]][1], [(owner[k][1], times[k][0]) for k in idx]))
    if not spans:
        raise ProError('nothing to say')

    # each phrase cut from its request's audio at its word boundaries, and the phrases joined with the planned pauses
    pieces, words, phr = [], [], []
    cursor = 0.0
    for n, (pi, audio, total, s, e, toks) in enumerate(spans):
        same = lambda m: 0 <= m < len(spans) and spans[m][1] is audio  # noqa: E731 - a neighbour in the same request
        nxt = spans[n + 1][3] if same(n + 1) else total
        prv = spans[n - 1][4] if same(n - 1) else 0.0
        a = max(prv, s - LEAD, 0.0)
        b = min(nxt, e + TAIL, total)
        seg = dsp.fade(audio[int(a * sr):int(b * sr)], sr, 0.004, 0.012)
        ph = phrases[pi]
        phr.append({'t': round(cursor + (s - a), 3), 'dur': round(e - s, 3), 'char': ph.start, 'len': ph.end - ph.start})
        for tok, ts in toks:
            if tok is not None:
                words.append({'t': round(cursor + (ts - a), 3), 'char': tok.start, 'len': tok.end - tok.start})
        pieces.append(seg)
        cursor += len(seg) / sr
        if n + 1 < len(spans):
            gap = np.zeros(int(round(max(0.0, ph.pause) * sr)))
            pieces.append(gap)
            cursor += len(gap) / sr
    dry = np.concatenate(pieces)
    effect = req.get('effect') or None
    if effect not in (None, 'none') and effect not in dsp.ROBOT_PRESETS:
        raise ProError(f'unknown effect {effect!r}')
    # the voice's own chain if it has one (the Kokoro presets' chains were made for Kokoro's timbre: not used)
    chain = pro.get('chain') if isinstance(pro.get('chain'), dict) else None
    out, stats = dsp.broadcast(dry, sr, tone=None, effect=effect, overrides=chain)
    reply = {
        'duration': round(len(out) / sr, 3),
        'sampleRate': sr,
        'words': words,
        'phrases': phr,
        'voice': f'{vendor.name}:{pro["voiceId"]}',
        'engine': vendor.name,
        'model': pro.get('model') or None,
        'chars': chars_total,
        'lang': lang,
        'speed': float(pro.get('speed') or 1.0),
        'effect': effect if effect != 'none' else None,
        **stats,
        'elapsed': round(time.time() - t0, 2),
    }
    return out, reply


def speak_any(engine, req, env=None, log=None):
    """The worker's entry: a `pro` request read by its engine, else (or when it fails) by Kokoro. -> (audio, sr, reply)"""
    if req.get('pro'):
        try:
            from engine import SAMPLE_RATE, envelope
            audio, reply = speak_pro(req, SAMPLE_RATE, env=env)
            if req.get('levels'):
                reply['levels'] = envelope(audio, SAMPLE_RATE, int(req.get('levelsRate') or 50))
            return audio, SAMPLE_RATE, reply
        except ProError as error:
            if (req.get('pro') or {}).get('fallback') is False:
                raise
            if log:
                log(f'{req.get("id")}: {(req.get("pro") or {}).get("engine")} could not read it ({error}); Kokoro instead')
            plain = {k: v for k, v in req.items() if k != 'pro'}
            audio, sr, reply = engine.speak(plain)
            reply['engine'] = 'kokoro'
            reply['fallback'] = str(error)[:300]
            return audio, sr, reply
    audio, sr, reply = engine.speak(req)
    reply['engine'] = 'kokoro'
    return audio, sr, reply
