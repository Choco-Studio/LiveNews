"""English text normalisation and phrase planning for the GLOBIT 24 voice engine.

espeak (Kokoro's phonemiser) reads raw newsroom copy badly: "$5bn" becomes
"dollar five b n", "10-15" becomes "ten dash fifteen", "IMF" is read as a word
and "2026" as "two thousand and twenty six". Bulletins are full of money,
years and acronyms, so every token is rewritten into what a presenter would
actually say, while remembering where it came from in the original text: word
timings must point at characters of the text the captions show, not at the
rewritten one.

Public API:
  plan_phrases(text, lang, phrases=None, speed=1.0) -> [Phrase]
  normalize_tokens(text, base, lang) -> [Token]
  spell_number(n, lang), say_year(y, lang), say_decimal(s, lang)
"""

import re
from dataclasses import dataclass, field

# ---------------------------------------------------------------- numbers

_ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
         'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
         'nineteen']
_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
_SCALES = [(10 ** 12, 'trillion'), (10 ** 9, 'billion'), (10 ** 6, 'million'), (1000, 'thousand')]


def _below_100(n):
    if n < 20:
        return _ONES[n]
    tens, ones = divmod(n, 10)
    return _TENS[tens] + ('-' + _ONES[ones] if ones else '')


def _below_1000(n, british):
    hundreds, rest = divmod(n, 100)
    parts = []
    if hundreds:
        parts.append(_ONES[hundreds] + ' hundred')
    if rest:
        if hundreds and british:
            parts.append('and')
        parts.append(_below_100(rest))
    return ' '.join(parts)


def spell_number(n, lang='en-us'):
    """Cardinal number in words ("one hundred and five" in British English)."""
    n = int(n)
    if n < 0:
        return 'minus ' + spell_number(-n, lang)
    if n == 0:
        return 'zero'
    british = lang.startswith('en-gb')
    parts = []
    for value, name in _SCALES:
        if n >= value:
            count, n = divmod(n, value)
            parts.append(_below_1000(count, british) + ' ' + name)
    if n:
        if parts and n < 100 and british:
            parts.append('and')
        parts.append(_below_1000(n, british))
    return ' '.join(parts)


def say_decimal(text, lang='en-us'):
    """'3.25' -> 'three point two five'; '1,200' -> 'one thousand two hundred'."""
    text = text.replace(',', '')
    if '.' in text:
        whole, frac = text.split('.', 1)
        head = spell_number(int(whole or '0'), lang)
        return head + ' point ' + ' '.join(_ONES[int(d)] for d in frac if d.isdigit())
    return spell_number(int(text), lang)


def say_year(y, lang='en-us'):
    """Years the way presenters say them: 'nineteen oh five', 'twenty twenty-six'."""
    y = int(y)
    if 2000 <= y <= 2009:
        if y == 2000:
            return 'two thousand'
        return 'two thousand ' + ('and ' if lang.startswith('en-gb') else '') + _ONES[y - 2000]
    if 1100 <= y <= 2099:
        hi, lo = divmod(y, 100)
        if lo == 0:
            return _below_100(hi) + ' hundred'
        if lo < 10:
            return _below_100(hi) + ' oh ' + _ONES[lo]
        return _below_100(hi) + ' ' + _below_100(lo)
    return spell_number(y, lang)


def _plural_of_tens(words):
    """'nineteen ninety' -> 'nineteen nineties' (for decades like 1990s)."""
    if words.endswith('y'):
        return words[:-1] + 'ies'
    return words + 's'


# ---------------------------------------------------------------- lexicon

# All-caps names read as words; every other 2-5 letter all-caps token is spelled
# out letter by letter ("I-M-F"), which also stops "US" and "WHO" being read as
# "us" and "who".
WORD_ACRONYMS = {
    'NASA', 'NATO', 'UNESCO', 'UNICEF', 'OPEC', 'COVID', 'CERN', 'ESA', 'FIFA', 'UEFA',
    'NAFTA', 'ASEAN', 'BRICS', 'AIDS', 'SARS', 'MERS', 'LIDAR', 'RADAR', 'LASER', 'SONAR',
    'SCUBA', 'IKEA', 'LEGO', 'ISIS', 'OFCOM', 'OFGEM', 'OFSTED', 'BAFTA', 'JAXA', 'ISRO',
    'NOAA', 'SETI', 'TESS', 'DART', 'GLOBIT', 'WORLD', 'NOW', 'TECH', 'BYTES', 'COSMOS',
    'DESK', 'MONEY', 'MINUTE', 'NEWS', 'UNIT', 'NEO', 'ACAS', 'INTERPOL', 'EUROPOL', 'FTSE',
    'NASDAQ', 'SAT', 'GIF', 'JPEG', 'WIFI', 'PIN', 'AWOL', 'ZIP', 'RAM', 'ROM', 'SIM',
}
# Read with a fixed pronunciation hint.
LEXICON = {
    'FTSE': 'footsie', 'NOAA': 'Noah', 'GIF': 'gif', 'WIFI': 'wifi', 'ISRO': 'iss-ro',
    'JWST': 'J-W-S-T', 'SpaceX': 'Space X', 'OpenAI': 'Open A-I', 'vs': 'versus',
    'vs.': 'versus', 'v.': 'versus', 'approx.': 'approximately', 'approx': 'approximately',
    'e.g.': 'for example', 'i.e.': 'that is', 'etc.': 'et cetera', 'etc': 'et cetera',
    'Mt': 'Mount', 'Mt.': 'Mount', 'Prof.': 'Professor', 'Prof': 'Professor', 'Govt': 'government',
    '&': 'and', '+': 'plus', '@': 'at', '#': 'number', 'U.S.': 'U-S', 'U.K.': 'U-K',
    'U.N.': 'U-N', 'E.U.': 'E-U', 'Ltd': 'limited', 'Ltd.': 'limited', 'Inc.': 'Inc',
    'km/h': 'kilometres per hour', 'kph': 'kilometres per hour', 'mph': 'miles per hour',
}
_ROMAN = {'II': 'the second', 'III': 'the third', 'IV': 'the fourth', 'VI': 'the sixth',
          'VII': 'the seventh', 'VIII': 'the eighth', 'IX': 'the ninth', 'XIV': 'the fourteenth'}

_CURRENCY = {
    '$': ('dollar', 'dollars', 'cent', 'cents'),
    '£': ('pound', 'pounds', 'penny', 'pence'),
    '€': ('euro', 'euros', 'cent', 'cents'),
    '¥': ('yen', 'yen', None, None),
    '₹': ('rupee', 'rupees', None, None),
}
_SCALE_WORDS = {'k': 'thousand', 'thousand': 'thousand', 'm': 'million', 'mn': 'million',
                'million': 'million', 'bn': 'billion', 'b': 'billion', 'billion': 'billion',
                'tn': 'trillion', 'trn': 'trillion', 'trillion': 'trillion'}
# Units after a number: (singular, plural). British spelling is fine for both
# accents: espeak pronounces "metres" and "meters" the same way.
_UNITS = {
    'km': ('kilometre', 'kilometres'), 'cm': ('centimetre', 'centimetres'),
    'mm': ('millimetre', 'millimetres'), 'kg': ('kilogram', 'kilograms'),
    'g': ('gram', 'grams'), 'mg': ('milligram', 'milligrams'), 't': ('tonne', 'tonnes'),
    'lb': ('pound', 'pounds'), 'lbs': ('pounds', 'pounds'), 'ft': ('foot', 'feet'),
    'mi': ('mile', 'miles'), 'ha': ('hectare', 'hectares'), 'l': ('litre', 'litres'),
    'ml': ('millilitre', 'millilitres'), 'gw': ('gigawatt', 'gigawatts'),
    'mw': ('megawatt', 'megawatts'), 'kw': ('kilowatt', 'kilowatts'),
    'kwh': ('kilowatt hour', 'kilowatt hours'), 'gwh': ('gigawatt hour', 'gigawatt hours'),
    'twh': ('terawatt hour', 'terawatt hours'), 'gb': ('gigabyte', 'gigabytes'),
    'tb': ('terabyte', 'terabytes'), 'mb': ('megabyte', 'megabytes'),
    'ghz': ('gigahertz', 'gigahertz'), 'mhz': ('megahertz', 'megahertz'),
    'km/h': ('kilometre per hour', 'kilometres per hour'), 'mph': ('mile per hour', 'miles per hour'),
    'kph': ('kilometre per hour', 'kilometres per hour'), '°c': ('degree Celsius', 'degrees Celsius'),
    '°f': ('degree Fahrenheit', 'degrees Fahrenheit'), '°': ('degree', 'degrees'),
}
# "<number>m" means metres before these words, millions otherwise ("1.5m people").
_METRE_CONTEXT = {'tall', 'high', 'long', 'deep', 'wide', 'away', 'sprint', 'race', 'above',
                  'below', 'up', 'down', 'final', 'freestyle', 'hurdles', 'metres', 'under'}
_YEAR_CONTEXT = {'in', 'since', 'of', 'by', 'from', 'until', 'till', 'to', 'year', 'early',
                 'late', 'mid', 'before', 'after', 'during', 'around', 'summer', 'spring',
                 'autumn', 'fall', 'winter', 'january', 'february', 'march', 'april', 'may',
                 'june', 'july', 'august', 'september', 'october', 'november', 'december',
                 'circa', 'between', 'and', 'season', 'class', 'election', 'budget', 'than'}
_SENTENCE_ABBREV = {'dr', 'mr', 'mrs', 'ms', 'prof', 'st', 'mt', 'no', 'vs', 'v', 'gen', 'gov',
                    'sen', 'rep', 'col', 'lt', 'sgt', 'capt', 'inc', 'ltd', 'co', 'corp', 'jr',
                    'sr', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct',
                    'nov', 'dec', 'approx', 'est', 'fig', 'u.s', 'u.k', 'e.g', 'i.e', 'etc'}

_NUM = r'\d+(?:,\d{3})*(?:\.\d+)?'
_RE_MONEY = re.compile(rf'^(US|A|C|NZ|HK)?([$£€¥₹])({_NUM})(k|m|mn|bn|b|tn|trn)?$', re.I)
_RE_NUM_SCALE = re.compile(rf'^({_NUM})(bn|tn|trn|k)$', re.I)
_RE_NUM_M = re.compile(rf'^({_NUM})m$')
_RE_NUM_UNIT = re.compile(rf'^({_NUM})(km/h|kph|mph|kwh|gwh|twh|km|cm|mm|kg|mg|lbs|lb|ft|mi|ha|ml|gw|mw|kw|gb|tb|mb|ghz|mhz|°c|°f|°)$', re.I)
_RE_RANGE = re.compile(rf'^([$£€]?)({_NUM})[-–]({_NUM})(%|bn|m|k|tn)?$')
_RE_TIME = re.compile(r'^(\d{1,2}):(\d{2})(am|pm|a\.m\.|p\.m\.)?$', re.I)
_RE_AMPM = re.compile(r'^(\d{1,2})(am|pm|a\.m\.|p\.m\.)$', re.I)
_RE_DECADE = re.compile(r"^(?:(\d{2})|['’])(\d)0s$")
_RE_YEAR = re.compile(r'^(1[1-9]\d\d|20\d\d)$')
_RE_YEARS_POSS = re.compile(r"^(1[1-9]\d\d|20\d\d)(['’]s)$")
_RE_ACRONYM = re.compile(r"^([A-Z]{2,5})((?:['’]s)|s)?$")
_RE_SPLIT_PUNCT = re.compile(r'^([\"“‘(\[«]*)(.*?)([\"”’)\]».,;:!?…]*)$', re.S)


# ---------------------------------------------------------------- tokens

@dataclass
class Token:
    """One whitespace-separated chunk of the original text and what is said for it."""
    start: int          # char offset in the original text
    end: int
    original: str
    spoken: str         # may be empty (pure symbols), or several words
    words: int = 0      # spoken word count, filled by the engine


@dataclass
class Phrase:
    """A stretch of text synthesised in one model pass, then a planned pause."""
    start: int
    end: int
    text: str
    pause: float
    tokens: list = field(default_factory=list)

    @property
    def spoken(self):
        return ' '.join(t.spoken for t in self.tokens if t.spoken)


def _unit(value_text, unit_key):
    singular, plural = _UNITS[unit_key.lower()]
    try:
        one = float(value_text.replace(',', '')) == 1
    except ValueError:
        one = False
    return singular if one else plural


def _money(prefix, sym, amount, scale, lang, next_scale=None):
    one, many, sub1, subn = _CURRENCY[sym]
    scale_word = _SCALE_WORDS.get((scale or '').lower()) or next_scale
    if prefix and prefix.upper() == 'US':
        many, one = 'US dollars', 'US dollar'
    if scale_word:
        return f'{say_decimal(amount, lang)} {scale_word} {many}'
    clean = amount.replace(',', '')
    if '.' in clean:
        whole, frac = clean.split('.', 1)
        frac = (frac + '0')[:2]
        whole_n, frac_n = int(whole or '0'), int(frac)
        if sub1 and whole_n == 0 and frac_n:
            return f'{spell_number(frac_n, lang)} {sub1 if frac_n == 1 else subn}'
        head = f'{spell_number(whole_n, lang)} {one if whole_n == 1 else many}'
        return head + (f' {spell_number(frac_n, lang)}' if frac_n else '')
    n = int(clean)
    return f'{spell_number(n, lang)} {one if n == 1 else many}'


def _say_core(core, prev_word, next_core, lang, shouting):
    """Spoken form of one token core. Returns (spoken, consumed_next_scale)."""
    if not core:
        return '', None
    if core in LEXICON:
        return LEXICON[core], None
    low = core.lower()
    if low in LEXICON:
        return LEXICON[low], None

    m = _RE_MONEY.match(core)
    if m:
        prefix, sym, amount, scale = m.groups()
        nxt = (next_core or '').lower()
        if not scale and nxt in ('thousand', 'million', 'billion', 'trillion'):
            # "$5 billion": say "five", and the next token becomes "billion dollars"
            return say_decimal(amount, lang), (nxt, sym, prefix)
        return _money(prefix, sym, amount, scale, lang), None

    m = _RE_RANGE.match(core)
    if m:
        sym, a, b, suffix = m.groups()
        if _RE_YEAR.match(a) and _RE_YEAR.match(b) and not sym and not suffix:
            return f'{say_year(a, lang)} to {say_year(b, lang)}', None
        if not _RE_YEAR.match(b) or sym or suffix:
            tail = ''
            if suffix == '%':
                tail = ' percent'
            elif suffix:
                tail = ' ' + _SCALE_WORDS[suffix.lower()]
            if sym:
                tail += ' ' + _CURRENCY[sym][1]
            return f'{say_decimal(a, lang)} to {say_decimal(b, lang)}{tail}', None

    m = _RE_TIME.match(core)
    if m:
        h, mins, ampm = int(m.group(1)), int(m.group(2)), m.group(3)
        if h <= 24 and mins < 60:
            hour = spell_number(h, lang)
            if mins == 0:
                said = hour if ampm else f"{hour} o'clock"
            elif mins < 10:
                said = f'{hour} oh {_ONES[mins]}'
            else:
                said = f'{hour} {_below_100(mins)}'
            if ampm:
                said += ' A-M' if ampm.lower().startswith('a') else ' P-M'
            return said, None

    m = _RE_AMPM.match(core)
    if m:
        return spell_number(m.group(1), lang) + (' A-M' if m.group(2).lower().startswith('a') else ' P-M'), None

    m = _RE_DECADE.match(core)
    if m:
        century, decade = m.groups()
        if decade == '0' and century:
            # 1900s / 2000s: "the nineteen hundreds", "the two thousands"
            base = 'two thousands' if century == '20' else _below_100(int(century)) + ' hundreds'
            return base, None
        tens = _plural_of_tens(_TENS[int(decade)]) if int(decade) >= 2 else 'tens'
        return ((_below_100(int(century)) + ' ') if century else '') + tens, None

    m = _RE_YEARS_POSS.match(core)
    if m:
        return say_year(m.group(1), lang) + "'s", None

    if _RE_YEAR.match(core):
        prev = (prev_word or '').lower().strip('.,;:!?()"“”')
        end_of_clause = next_core is None
        if prev in _YEAR_CONTEXT or end_of_clause or (next_core or '').lower() in _YEAR_CONTEXT:
            return say_year(core, lang), None
        return say_decimal(core, lang), None

    # Plain numbers and percentages: the same words espeak would say, but
    # written out so the spoken word count is known for timing
    if re.fullmatch(_NUM, core) and len(core.replace(',', '').split('.')[0]) <= 15:
        return say_decimal(core, lang), None
    m = re.fullmatch(rf'({_NUM})%', core)
    if m:
        return say_decimal(m.group(1), lang) + ' percent', None

    m = _RE_NUM_SCALE.match(core)
    if m:
        return f'{say_decimal(m.group(1), lang)} {_SCALE_WORDS[m.group(2).lower()]}', None

    m = _RE_NUM_M.match(core)
    if m:
        if (next_core or '').lower() in _METRE_CONTEXT:
            return f'{say_decimal(m.group(1), lang)} {"metre" if m.group(1) == "1" else "metres"}', None
        return f'{say_decimal(m.group(1), lang)} million', None

    m = _RE_NUM_UNIT.match(core)
    if m:
        return f'{say_decimal(m.group(1), lang)} {_unit(m.group(1), m.group(2))}', None

    if not shouting:
        if core in _ROMAN and prev_word and prev_word[:1].isupper():
            return _ROMAN[core], None
        m = _RE_ACRONYM.match(core)
        if m:
            letters, suffix = m.groups()
            if letters in LEXICON:
                return LEXICON[letters] + (suffix or ''), None
            if letters not in WORD_ACRONYMS:
                spelled = '-'.join(letters)
                return spelled + (suffix or ''), None
        if '-' in core:
            # "IMF-backed", "UN-led": spell the acronym part of a compound
            parts = core.split('-')
            spelled = []
            for part in parts:
                m = _RE_ACRONYM.match(part)
                if m and m.group(1) not in WORD_ACRONYMS and m.group(1) not in LEXICON:
                    part = '-'.join(m.group(1)) + (m.group(2) or '')
                spelled.append(part)
            return '-'.join(spelled), None
    # Units written as separate tokens: "15 km", "30 °C"
    if prev_word and re.fullmatch(_NUM, prev_word.strip('.,;:')) and low in _UNITS and low not in ('t', 'l', 'g', 'mi', 'ha', '°'):
        return _unit(prev_word.strip('.,;:'), low), None
    return core, None


def _is_shouting(text):
    letters = [c for c in text if c.isalpha()]
    return bool(letters) and sum(c.isupper() for c in letters) > 0.6 * len(letters)


def normalize_tokens(text, base=0, lang='en-us'):
    """Split `text` into tokens (offsets relative to base) with spoken forms."""
    english = lang.startswith('en')
    chunks = [(m.start(), m.end(), m.group()) for m in re.finditer(r'\S+', text)]
    shouting = _is_shouting(text)
    tokens = []
    carry = None  # (scale word, currency symbol, prefix) from "$5" + "billion"
    for i, (s, e, raw) in enumerate(chunks):
        if not english:
            tokens.append(Token(base + s, base + e, raw, raw))
            continue
        if raw in LEXICON or raw.lower() in LEXICON:
            lead, core, trail = '', raw, ''
        else:
            # Keep dotted abbreviations (U.S., e.g.) whole; peel other punctuation
            m = re.match(r'^([\"“‘(\[«]*)((?:[A-Za-z]\.){2,})([,;:!?\"”’)\]»]*)$', raw)
            if m:
                lead, core, trail = m.groups()
            else:
                lead, core, trail = _RE_SPLIT_PUNCT.match(raw).groups()
        prev_word = chunks[i - 1][2] if i else None
        nxt = chunks[i + 1][2] if i + 1 < len(chunks) else None
        next_core = _RE_SPLIT_PUNCT.match(nxt).group(2) if nxt and not trail else None
        if carry and core.lower() == carry[0]:
            _, sym, prefix = carry
            plural = _CURRENCY[sym][1] if not (prefix and prefix.upper() == 'US') else 'US dollars'
            spoken_core = f'{carry[0]} {plural}'
            carry = None
        else:
            carry = None
            spoken_core, carry = _say_core(core, prev_word, next_core, lang, shouting)
        # The model has no apostrophes, quotes or brackets that would help it;
        # drop the ones it cannot say and keep the punctuation that shapes prosody
        lead_kept = ''.join(c for c in lead if c in '"“(')
        trail_kept = ''.join(c for c in trail if c in '.,;:!?…"”)')
        spoken = (lead_kept + spoken_core + trail_kept).strip() if spoken_core else trail_kept.strip()
        if spoken and not re.search(r'[A-Za-z0-9]', spoken):
            # Pure punctuation (a lone dash): keep a comma-like mark, no word
            spoken = '—' if '—' in raw or '–' in raw or raw == '-' else trail_kept
        tokens.append(Token(base + s, base + e, raw, spoken))
    return tokens


# ---------------------------------------------------------------- phrases

# Planned silence after a phrase, by its final mark, in seconds at speed 1.
# Defaults follow the programme style bibles (docs/programmes/*.md): comma
# 0.15 s, full stop 0.35 s; requests can override them per programme/story.
PAUSE_KEYS = {'.': 'sentence', '!': 'exclaim', '?': 'question', '…': 'ellipsis', ';': 'semicolon',
              ':': 'colon', '—': 'dash', '–': 'dash', ',': 'comma', '\n': 'paragraph'}
DEFAULT_PAUSES = {'sentence': 0.35, 'exclaim': 0.35, 'question': 0.40, 'ellipsis': 0.45,
                  'semicolon': 0.25, 'colon': 0.25, 'dash': 0.20, 'comma': 0.15, 'paragraph': 0.60}
# The trimmed phrase edges keep ~40 ms of decay/pre-roll, which is heard as pause
EDGE_ALLOWANCE = 0.035
_MAX_PHRASE = 220   # chars of original text; longer sentences are split at clauses
_MIN_SPLIT = 55


def _sentence_spans(text):
    """Offsets [(start, end)] of sentences, robust to abbreviations and decimals."""
    spans, start = [], 0
    for m in re.finditer(r'[.!?…]+[\"”’)\]]*(?=\s+|$)|\n\s*\n|\n', text):
        end = m.end()
        before = text[start:m.start()].split()
        last = before[-1].lower().rstrip('.') if before else ''
        if m.group().startswith('.') and len(m.group()) == 1 and last in _SENTENCE_ABBREV:
            continue
        # "3. Then" is rare in copy; "No. 10" handled above. Next char lowercase
        # means the dot was not a sentence end ("approx. ten").
        nxt = text[end:].lstrip()[:1]
        if m.group().startswith('.') and nxt and nxt.islower():
            continue
        if text[start:end].strip():
            spans.append((start, end))
        start = end
    if text[start:].strip():
        spans.append((start, len(text)))
    return spans


def _split_long(text, s, e):
    """Split a long sentence at clause marks near its middle."""
    seg = text[s:e]
    if e - s <= _MAX_PHRASE:
        return [(s, e)]
    best, best_score = None, None
    for m in re.finditer(r'(?:[;:]|\s[—–]|,)(?=\s)', seg):
        cut = m.end()
        if cut < _MIN_SPLIT or len(seg) - cut < _MIN_SPLIT:
            continue
        weight = {';': 0, ':': 0}.get(m.group()[-1], 1 if '—' in m.group() or '–' in m.group() else 2)
        score = abs(cut - len(seg) / 2) + weight * 25
        if best_score is None or score < best_score:
            best, best_score = cut, score
    if best is None:
        return [(s, e)]
    return _split_long(text, s, s + best) + _split_long(text, s + best, e)


def _trailing_mark(chunk):
    stripped = chunk.rstrip()
    if chunk.endswith('\n\n') or re.search(r'\n\s*\n\s*$', chunk):
        return '\n'
    stripped = stripped.rstrip('"”’)]')
    return stripped[-1:] if stripped else ''


def pause_table(pauses=None, pause_add=0.0):
    """Pause per mark (seconds of planned silence) from defaults + overrides."""
    table = dict(DEFAULT_PAUSES)
    for key, value in (pauses or {}).items():
        if key in table and isinstance(value, (int, float)) and 0 <= value <= 3:
            table[key] = float(value)
    return {k: v + float(pause_add or 0.0) for k, v in table.items()}


def plan_phrases(text, lang='en-us', phrases=None, speed=1.0, pauses=None, pause_add=0.0):
    """Cut text into phrases with planned pauses, each with normalised tokens.

    `phrases` (optional) is the caller's own list of {text, pauseAfter}; each
    phrase text is located in `text` so word offsets still point at the
    original. Without it, text is cut at sentences (and long sentences at
    clauses), and pauses follow the punctuation (`pauses` overrides
    DEFAULT_PAUSES by name, `pause_add` lengthens every pause, e.g. +0.1 s for
    grave stories).
    """
    table = pause_table(pauses, pause_add)

    def pause_for(chunk, fallback):
        key = PAUSE_KEYS.get(_trailing_mark(chunk))
        value = table[key] if key else fallback
        return max(0.03, value / max(0.5, speed) ** 0.5 - EDGE_ALLOWANCE)

    out = []
    if phrases:
        cursor = 0
        for p in phrases:
            ptext = str(p.get('text', '') if isinstance(p, dict) else p)
            if not ptext.strip():
                continue
            at = text.find(ptext, cursor)
            if at < 0:
                at = text.find(ptext.strip(), cursor)
                ptext = ptext.strip()
            if at < 0:
                at = cursor  # caller text differs; offsets become approximate
            pause = p.get('pauseAfter') if isinstance(p, dict) else None
            if pause is None:
                pause = pause_for(ptext, 0.1)
            ph = Phrase(at, at + len(ptext), ptext, float(max(0.0, min(3.0, pause))))
            ph.tokens = normalize_tokens(ptext, at, lang)
            out.append(ph)
            cursor = at + len(ptext)
    else:
        for s, e in _sentence_spans(text):
            for ss, ee in _split_long(text, s, e):
                chunk = text[ss:ee]
                lead = len(chunk) - len(chunk.lstrip())
                body = chunk.strip()
                if not body:
                    continue
                pause = pause_for(chunk, 0.12)
                ph = Phrase(ss + lead, ss + lead + len(body), body, pause)
                ph.tokens = normalize_tokens(body, ss + lead, lang)
                out.append(ph)
    out = [p for p in out if p.spoken.strip(' .,;:!?…—"“”()')]
    if out:
        out[-1].pause = 0.0
    return out
