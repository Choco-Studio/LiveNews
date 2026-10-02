// Audio for the show. English by default; `new AudioEngine({ lang: 'es' })` uses
// Spanish voices. Sentence-by-sentence Web Speech TTS, Animal Crossing style
// "blips" through WebAudio, a silent mode that still moves the presenters' lips,
// and chiptune jingles built from oscillators only. Nothing here may throw: a
// missing API just means less sound, never a broken broadcast.

const MODES = ['tts', 'blips', 'mute'];
const MAX_CHUNK = 180;
const MIN_CHUNK = 12;
const MUTE_CPS = 15; // characters per second when nothing is audible
const BLIP_STEP = 1000 / 16; // ms per character in blips mode (~15 cps with the pauses)
const GAP = { tts: 60, blips: 120, mute: 220 }; // ms of closed mouth between sentences

// ---------------------------------------------------------------- sentences

// Abbreviations whose dot does not end a sentence ("Dr. Smith", "EE. UU.").
// Single letters ("U.S.", "e.g.", "J. K.") are handled separately.
const ABBREV = new Set([
  // English
  'mr', 'mrs', 'ms', 'dr', 'prof', 'st', 'jr', 'sr', 'inc', 'ltd', 'co', 'corp', 'bros', 'gen', 'gov',
  'sen', 'rep', 'lt', 'col', 'sgt', 'capt', 'cmdr', 'mt', 'ft', 'vs', 'dept', 'govt', 'approx',
  // Spanish
  'sra', 'srta', 'dra', 'ud', 'uds', 'vd', 'vds', 'sta', 'sto', 'ing', 'lic', 'gral', 'av', 'avda',
  'pág', 'págs', 'núm', 'aprox', 'ee', 'cc', 'ej', 'tel', 'excmo', 'excma', 'ilmo', 'ilma', 'mons',
]);
// Only abbreviations when a number follows: "No. 5", "Oct. 12" (but "No. He left." splits).
const NUM_ABBREV = new Set([
  'no', 'nos', 'fig', 'vol', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
]);

function isBoundary(src, from, to, run) {
  // `to` is the index of the whitespace after the terminator run.
  const next = src[to + 1];
  if (next && /\p{Ll}/u.test(next)) return false; // "U.S. officials", "bueno… vamos", '"Stop." he said'
  if (run === '.') {
    const word = /(\p{L}+)$/u.exec(src.slice(Math.max(0, from - 12), from))?.[1];
    if (word) {
      const w = word.toLowerCase();
      if (word.length === 1 || ABBREV.has(w)) return false; // initials and dotted acronyms too
      if (NUM_ABBREV.has(w) && /\d/.test(next ?? '')) return false;
    }
  }
  return true;
}

function cutLong(text) {
  const out = [];
  let rest = text;
  while (rest.length > MAX_CHUNK) {
    // The window leaves at least MIN_CHUNK chars for the tail so it is not a stub.
    const win = rest.slice(0, Math.min(MAX_CHUNK + 1, rest.length - MIN_CHUNK));
    let cut = Math.max(win.lastIndexOf(', '), win.lastIndexOf('; '), win.lastIndexOf(': ')) + 1;
    if (cut < MAX_CHUNK * 0.4) cut = win.lastIndexOf(' ');
    if (cut <= 0) cut = Math.min(MAX_CHUNK, win.length); // unbroken text: hard cut
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

// Splits English and Spanish text on . ! ? … (keeping the punctuation) without
// breaking numbers ("6.1", "$1.2bn"), abbreviations ("Dr.", "U.S.", "EE. UU.") or
// lower-case continuations; glues fragments shorter than 12 chars to their
// neighbour and cuts anything over ~180 chars at a comma or space.
export function splitSentences(text) {
  const src = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!src) return [];
  const parts = [];
  const re = /[.!?…]+["'’”»)\]]*(?=\s|$)/g;
  let start = 0;
  let m;
  while ((m = re.exec(src))) {
    const end = m.index + m[0].length;
    if (end >= src.length) break;
    if (!isBoundary(src, m.index, end, m[0])) continue;
    parts.push(src.slice(start, end).trim());
    start = end;
  }
  const tail = src.slice(start).trim();
  if (tail) parts.push(tail);

  const merged = [];
  for (const p of parts) {
    const prev = merged[merged.length - 1];
    if (prev && p.length < MIN_CHUNK && prev.length + 1 + p.length <= MAX_CHUNK) {
      merged[merged.length - 1] = `${prev} ${p}`;
    } else {
      merged.push(p);
    }
  }
  if (merged.length > 1 && merged[0].length < MIN_CHUNK && merged[0].length + 1 + merged[1].length <= MAX_CHUNK) {
    merged.splice(0, 2, `${merged[0]} ${merged[1]}`);
  }
  return merged.flatMap((p) => (p.length > MAX_CHUNK ? cutLong(p) : [p]));
}

// ------------------------------------------------------------------- voices

// Name hints for the voice's gender, English and Spanish together (a voice list
// only ever holds one language in practice). The first group matches as a
// substring, the second only as a whole word so "Tom" does not hit "Tomás".
const MALE_RE = new RegExp(
  'jorge|pablo|alvaro|álvaro|diego|enrique|carlos|juan|raul|raúl|hombre|' +
  '(?<!\\p{L})(?:male|eddy|reed|rocko|grandpa|alonso|tomás|tomas|miguel|ricardo|sergio|óscar|oscar|' +
  'jesús|jesus|darío|dario|elías|elias|saúl|saul|teo|yago|pelayo|gerardo|cecilio|liberto|luciano|' +
  'daniel|george|arthur|ryan|thomas|oliver|guy|christopher|eric|david|mark|alex|tom|aaron|evan|gordon|' +
  'lee|rishi|james|brian|roger|steffan|davis|jason|tony|andrew|william|liam|connor|luke|noah|alfie|' +
  'ethan|prabhat|mitchell|fred)(?!\\p{L})',
  'iu',
);
const FEMALE_RE = new RegExp(
  'helena|laura|lucia|lucía|elvira|monica|mónica|paulina|sabina|conchita|female|mujer|elena|dalia|' +
  '(?<!\\p{L})(?:flo|sandy|shelley|grandma|marisol|lupe|paloma|abril|estrella|irene|laia|triana|' +
  'vera|beatriz|candela|carlota|marina|nuria|renata|ximena|' +
  'samantha|ava|allison|susan|serena|kate|libby|sonia|jenny|aria|michelle|hazel|zira|maisie|mia|emma|' +
  'jane|sara|nancy|ana|amy|joanna|karen|moira|tessa|fiona|victoria|martha|nicky|catherine|natasha|' +
  'neerja|clara|emily|leah|heather|zoe)(?!\\p{L})',
  'iu',
);
// Robotic / novelty voices that macOS lists next to the real ones.
const NOVELTY_RE = new RegExp(
  '(?<!\\p{L})(?:albert|agnes|bad news|bahh|bells|boing|bubbles|bruce|cellos|deranged|good news|' +
  'hysterical|jester|junior|kathy|organ|princess|ralph|superstar|trinoids|vicki|whisper|wobble|zarvox)(?!\\p{L})',
  'iu',
);

// Regional variants to prefer, best first. A region in the engine option goes in front.
const LANG_PREF = { en: ['en-gb', 'en-us'], es: ['es-es'] };

function langPlan(option) {
  const [head, region] = String(option || 'en').toLowerCase().split(/[-_]/);
  const base = (head || '').replace(/[^a-z]/g, '') || 'en';
  const pref = [...new Set([...(region ? [`${base}-${region}`] : []), ...(LANG_PREF[base] ?? [])])];
  return { base, pref, match: new RegExp(`^${base}(?:[-_]|$)`, 'i') };
}

// Legacy macOS voices that sound robotic: what the 'robot' gender looks for.
const ROBOT_RE = /(?<!\p{L})(?:zarvox|trinoids|fred|ralph|junior|albert|robot)(?!\p{L})/iu;

const voiceName = (v) => String(v?.name ?? '');

// 'male' | 'female' | null from the voice name alone.
function voiceGender(v) {
  const name = voiceName(v);
  const male = MALE_RE.test(name);
  const female = FEMALE_RE.test(name);
  return male && !female ? 'male' : female && !male ? 'female' : null;
}

// Language variant first (en-GB, then en-US, then any en-*), gender hint second.
function voiceScore(v, gender, pref) {
  const rank = pref.indexOf(String(v.lang ?? '').toLowerCase().replace('_', '-'));
  let s = rank >= 0 ? Math.max(10, 30 - rank * 10) : 10;
  const name = voiceName(v);
  const g = voiceGender(v);
  const robotic = gender === 'robot' && ROBOT_RE.test(name);
  if (gender === 'male' || gender === 'female') s += g === gender ? 50 : g ? -50 : 0;
  else if (gender === 'robot') s += robotic ? 60 : g === 'male' ? 20 : 0;
  if (gender !== 'robot' && /natural|neural/i.test(name)) s += 12; // Edge's neural voices beat the old SAPI ones
  if (NOVELTY_RE.test(name) && !robotic) s -= 60;
  return s;
}

// Best voice for a slot. Prefers voices of the right gender that no other slot
// has taken yet, so two female presenters do not share one voice unless they must.
function chooseVoice(pool, gender, pref, used) {
  const scored = pool.map((v) => ({ v, s: voiceScore(v, gender, pref), g: voiceGender(v) }));
  const fits = scored.filter((c) => !((gender === 'male' && c.g === 'female') || (gender === 'female' && c.g === 'male')));
  const fresh = fits.filter((c) => !used.has(c.v));
  const list = fresh.length ? fresh : fits.length ? fits : scored;
  return list.reduce((best, c) => (c.s > best.s ? c : best)).v;
}

// ----------------------------------------------------------- voice profiles

const GENDER_DEFAULTS = {
  male: { pitch: 0.95, rate: 1.02 },
  female: { pitch: 1.08, rate: 1.08 },
  robot: { pitch: 0.5, rate: 1.15 },
  neutral: { pitch: 1, rate: 1.05 },
};

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const numOr = (v, fallback, lo, hi) => (v == null || v === '' || !Number.isFinite(Number(v)) ? fallback : clamp(Number(v), lo, hi));

// Forgiving: { gender: 'male'|'female'|'robot', lang, pitch, rate } or just a gender string.
function normProfile(p, explicit = true) {
  const src = typeof p === 'string' ? { gender: p } : p ?? {};
  const g = String(src.gender ?? '').trim().toLowerCase();
  const gender = /^(f|w|girl)/.test(g) ? 'female' : /^(m|boy)/.test(g) ? 'male' : /^(r|bot|android)/.test(g) ? 'robot' : 'neutral';
  const d = GENDER_DEFAULTS[gender];
  return {
    gender,
    lang: typeof src.lang === 'string' && src.lang.trim() ? src.lang.trim() : null,
    pitch: numOr(src.pitch, d.pitch, 0.1, 2),
    rate: numOr(src.rate, d.rate, 0.5, 2),
    explicit,
  };
}

// Without a profile: 'A' is the male anchor, 'B' the female one, anything else a neutral announcer.
const DEFAULT_PROFILES = new Map([['A', normProfile('male', false)], ['B', normProfile('female', false)]]);
const NEUTRAL_PROFILE = normProfile('neutral', false);

// Blip timbres per gender. Robots are low, flat, staccato and heavily filtered.
const BLIP_KINDS = {
  male: { base: 200, type: 'square', gain: 0.12, cut: 2600, vary: 0.16, flat: 0, len: 0.78 },
  female: { base: 350, type: 'triangle', gain: 0.28, cut: 2600, vary: 0.16, flat: 0, len: 0.78 },
  neutral: { base: 270, type: 'triangle', gain: 0.26, cut: 2600, vary: 0.16, flat: 0, len: 0.78 },
  robot: { base: 130, type: 'square', gain: 0.13, cut: 1400, vary: 0.03, flat: 0.8, len: 0.55 },
};

function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

// Slots with their own profile get a pitch from it plus a small per-slot offset,
// so two presenters of the same gender do not beep alike either.
function blipFor(key, prof) {
  const kind = BLIP_KINDS[prof.gender];
  if (!prof.explicit && (key === 'A' || key === 'B')) return { ...kind };
  const pitch = prof.gender === 'robot' ? 1 : clamp(prof.pitch, 0.6, 1.6);
  return { ...kind, base: Math.max(90, kind.base * pitch * (1 + (hash01(key) - 0.5) * 0.14)) };
}

// -------------------------------------------------------------- mouth level

// Web Speech exposes no audio, so fake plausible syllable flapping: two sines
// around 9 and 12 Hz, a slow phrase envelope, noise, and a kick on every word.
function synthLevel(run, now) {
  const t = now / 1000 + run.phase;
  const syl = 0.5 + 0.3 * Math.sin(t * 56.5) + 0.2 * Math.sin(t * 73.9 + 1.3);
  const phrase = 0.8 + 0.2 * Math.sin(t * 14.5);
  const kick = 0.35 * Math.exp(-Math.max(0, now - run.boundaryAt) / 120);
  const attack = Math.min(1, (now - run.talkAt) / 90);
  const v = (syl * phrase + (Math.random() - 0.5) * 0.22) * attack + kick;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// -------------------------------------------------------------------- blips

// [letters, mouth openness, pitch ratio]: open vowels beep louder and lower.
const VOWEL = new Map();
for (const [chars, open, pitch] of [['aá', 1, 1], ['eé', 0.8, 1.12], ['ií', 0.6, 1.26], ['oó', 0.9, 0.94], ['uúü', 0.7, 0.84]]) {
  for (const c of chars) VOWEL.set(c, { open, pitch });
}
const Y_VOWEL = { open: 0.6, pitch: 1.2 }; // "city", "my", "system"; not "yes" or "play"
const isVowel = (c) => VOWEL.has(c?.toLowerCase());

// Timeline for one sentence: vowels are beeps, consonants silent ticks, spaces
// and punctuation pauses. Times are ms from the start of the sentence.
function planBlips(sentence, blip) {
  const beeps = [];
  let t = 0;
  let stop = false;
  const chars = [...sentence];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const lc = ch.toLowerCase();
    // A 'y' with no vowel next to it sounds like one.
    const vowel = VOWEL.get(lc) ?? (lc === 'y' && !isVowel(chars[i - 1]) && !isVowel(chars[i + 1]) ? Y_VOWEL : undefined);
    const long = /[.!?…]/.test(ch);
    if (long || /[,;:]/.test(ch)) {
      if (!stop) t += BLIP_STEP * (long ? 4 : 3); // "..." or "?!" count once
      stop = true;
      continue;
    }
    stop = false;
    if (vowel) {
      beeps.push({
        at: t,
        dur: BLIP_STEP * blip.len,
        freq: blip.base * (1 + (vowel.pitch - 1) * (1 - blip.flat)) * (1 - blip.vary / 2 + Math.random() * blip.vary),
        peak: 0.65 + 0.35 * vowel.open,
      });
      t += BLIP_STEP;
    } else if (/[\s\-–—]/.test(ch)) {
      t += BLIP_STEP * 0.8;
    } else if (/[\p{L}\p{N}]/u.test(ch)) {
      t += BLIP_STEP;
    } // quotes, brackets and ¿¡ take no time
  }
  if (blip.flat < 0.5 && /\?[\s"'’”»)\]]*$/.test(sentence)) {
    beeps.slice(-6).forEach((b, i) => { b.freq *= 1 + 0.05 * (i + 1); }); // questions rise
  }
  return { beeps, total: Math.max(t, 300) };
}

// ---------------------------------------------------------------------- run

// State of one speak() call. `wakers` holds everything currently waiting
// (timers, utterances) so stop() can release them all at once.
class Run {
  constructor(key) {
    this.key = key; // voice slot: 'A', 'B', 'announcer', 'ad2'...
    this.cancelled = false;
    this.talking = false; // tts / mute: mouth is flapping
    this.talkAt = 0;
    this.boundaryAt = -1e9;
    this.phase = Math.random() * 6.28;
    this.beeps = null; // blips: timeline of the current sentence
    this.beepIdx = -1;
    this.t0 = 0;
    this.reset = false;
    this.utter = null; // keeps the utterance alive: Chrome may GC it before onend
    this.wakers = new Set();
  }

  sleep(ms) {
    return new Promise((resolve) => {
      if (this.cancelled) return resolve();
      const wake = () => {
        clearTimeout(id);
        this.wakers.delete(wake);
        resolve();
      };
      const id = setTimeout(wake, Math.max(0, ms));
      this.wakers.add(wake);
    });
  }

  wake() {
    for (const w of [...this.wakers]) w();
  }

  cancel() {
    this.cancelled = true;
    this.talking = false;
    this.beeps = null;
    this.wake();
  }
}

// -------------------------------------------------------------------- tunes

// Tune data comes from other people's files, so parsing never throws: bad
// tokens simply become rests and missing fields get defaults.
//   { bpm, wave, notes: 'C5:1 E5:1 G5:2 R:1', bass: 'C3:2 G2:2', bassWave, drums: 'K:1 H:0.5 S:1' }
const SEMITONE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const NOTE_RE = /^([A-Ga-g])([#b♯♭]?)(-?\d)?$/;
const REST_RE = /^(r|rest|-|_|\.)$/i;
const DRUM_KEYS = { k: 'k', kick: 'k', bd: 'k', s: 's', snare: 's', sd: 's', h: 'h', hat: 'h', hh: 'h', o: 'h' };
const WAVES = new Set(['square', 'triangle', 'sawtooth', 'sine']);
const WAVE_GAIN = { square: 1, triangle: 1.4, sawtooth: 0.7, sine: 1.3 }; // evens out loudness
const MAX_EVENTS = 1500;
const TUNE_LOOKAHEAD = 2.5; // seconds of music scheduled ahead of the clock (timers may be throttled)
const DUCK_LEVEL = 0.4; // music level while someone talks: 60% lower

// Octave 4 when omitted: 'C' is middle C (MIDI 60).
function noteToMidi(name) {
  const m = NOTE_RE.exec(name);
  if (!m) return null;
  const accidental = m[2] === '#' || m[2] === '♯' ? 1 : m[2] ? -1 : 0;
  return 12 * ((m[3] === undefined ? 4 : Number(m[3])) + 1) + SEMITONE[m[1].toLowerCase()] + accidental;
}

// Beats as '1', '0.5', '.5' or '1/2'.
function parseBeats(text) {
  const m = /^(\d*\.?\d+)(?:\/(\d*\.?\d+))?$/.exec(text ?? '');
  const n = m ? Number(m[1]) / (m[2] ? Number(m[2]) : 1) : NaN;
  return Number.isFinite(n) && n > 0 ? clamp(n, 0.0625, 64) : 1;
}

// 'C4+E4+G4:2' is a chord. Returns the events and the track length in beats.
function parseTrack(src, drums = false) {
  const text = Array.isArray(src) ? src.join(' ') : typeof src === 'string' ? src : '';
  const events = [];
  let at = 0;
  for (const token of text.split(/[\s,|]+/)) {
    if (!token || events.length >= MAX_EVENTS) continue;
    const [name, dur] = token.split(':');
    const len = parseBeats(dur);
    if (drums) {
      const drum = DRUM_KEYS[name.toLowerCase()];
      if (drum) events.push({ at, dur: len, drum });
    } else if (!REST_RE.test(name)) {
      const midis = name.split('+').map(noteToMidi).filter((m) => m !== null);
      if (midis.length) events.push({ at, dur: len, midis });
    }
    at += len;
  }
  return { events, beats: at };
}

function parseTune(tune) {
  const t = typeof tune === 'string' ? { notes: tune } : tune;
  if (!t || typeof t !== 'object') return null;
  const get = (...keys) => keys.map((k) => t[k]).find((v) => v != null);
  const wave = (v, fallback) => (WAVES.has(String(v).toLowerCase()) ? String(v).toLowerCase() : fallback);
  const lead = wave(get('wave', 'waveform'), 'square');
  const tracks = [
    { kind: 'lead', wave: lead, ...parseTrack(get('notes', 'melody', 'lead')) },
    { kind: 'bass', wave: wave(get('bassWave'), 'triangle'), ...parseTrack(get('bass')) },
    { kind: 'drums', wave: lead, ...parseTrack(get('drums', 'percussion'), true) },
  ].filter((track) => track.events.length);
  if (!tracks.length) return null;
  return {
    bpm: clamp(Number(get('bpm', 'tempo')) || 120, 30, 400),
    tracks,
    beats: Math.max(...tracks.map((track) => track.beats)),
  };
}

// ------------------------------------------------------------------- engine

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

export class AudioEngine {
  #synth = null;
  #ctx = null;
  #master = null;
  #noiseBuf = null;
  #volume = 0.8;
  #requested = 'tts';
  #music = null; // bus for playTune(): ducked while someone talks
  #ducked = false;
  #tunes = new Set();
  #lang;
  #all = []; // every installed voice
  #voices = []; // the ones in the engine's language
  #profiles = new Map(); // slot -> normalized profile from setVoices()
  #seen = []; // other slots that have spoken ('announcer', 'ad2'...)
  #resolved = new Map(); // slot -> { voice, pitch, rate, lang, blip }
  #lastRefresh = 0;
  #primed = false;
  #run = null;

  // `lang` picks the voice language ('en', 'es', or 'en-AU' to prefer a region).
  constructor(opts) {
    const { lang = 'en' } = opts ?? {};
    this.#lang = langPlan(lang);
    try {
      const synth = globalThis.speechSynthesis;
      if (synth && typeof globalThis.SpeechSynthesisUtterance === 'function') this.#synth = synth;
      this.#synth?.addEventListener?.('voiceschanged', () => this.#refreshVoices());
    } catch {
      this.#synth = null;
    }
    this.#refreshVoices();
    this.#resolve();
  }

  get volume() {
    return this.#volume;
  }

  set volume(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    this.#volume = Math.min(1, Math.max(0, n));
    try {
      this.#master?.gain.setTargetAtTime(this.#volume, this.#ctx.currentTime, 0.01);
    } catch { /* no audio */ }
  }

  get ttsAvailable() {
    if (!this.#synth) return false;
    if (!this.#voices.length && performance.now() - this.#lastRefresh > 1000) this.#refreshVoices();
    return this.#voices.length > 0;
  }

  // The requested mode wins unless it is 'tts' without a voice for the language.
  get mode() {
    return this.#requested === 'tts' && !this.ttsAvailable ? 'blips' : this.#requested;
  }

  setMode(mode) {
    if (!MODES.includes(mode)) return;
    const before = this.mode;
    this.#requested = mode;
    if (mode === 'mute') this.#stopTunes();
    if (this.mode === before) return;
    // Cut what is sounding now; a running speak() carries on with its next sentence.
    try {
      this.#synth?.cancel();
    } catch { /* ignore */ }
    this.#run?.wake();
  }

  // Call from a user gesture. Everything async is bounded so it can never hang.
  async unlock() {
    let resumed = null;
    try {
      const ctx = this.#ensureContext();
      if (ctx) {
        this.#primeAudio(ctx);
        if (ctx.state !== 'running') resumed = ctx.resume();
      }
      this.#primeSpeech();
    } catch { /* ignore */ }
    try {
      if (resumed) await Promise.race([resumed, new Promise((r) => setTimeout(r, 1000))]);
    } catch { /* ignore */ }
    try {
      await this.#loadVoices();
    } catch { /* ignore */ }
  }

  // Voice profiles per slot, replacing any previous set:
  //   { host1: { gender: 'female', lang: 'en-GB', pitch: 1.1, rate: 1.05 }, robo: { gender: 'robot' } }
  // Slots without a profile keep the defaults ('A' male, 'B' female, others neutral).
  setVoices(map) {
    const next = new Map();
    try {
      const entries = map instanceof Map ? map.entries() : Object.entries(map ?? {});
      for (const [key, profile] of entries) next.set(String(key), normProfile(profile));
    } catch { /* keep what parsed */ }
    this.#profiles = next;
    this.#resolve();
  }

  // `anchor` is any slot key. Resolves when the text has been spoken or stop() ran.
  speak(text, anchor = 'A', opts = {}) {
    const onSentence = opts?.onSentence;
    this.#stopSpeech();
    const sentences = splitSentences(text);
    if (!sentences.length) {
      this.#duck(false);
      return Promise.resolve();
    }
    const run = new Run(typeof anchor === 'string' && anchor ? anchor : 'A');
    this.#run = run;
    this.#duck(true);
    return this.#play(run, sentences, onSentence);
  }

  stop() {
    this.#stopSpeech();
    this.#duck(false);
  }

  // Speech and every tune.
  stopAll() {
    this.stop();
    this.#stopTunes();
  }

  level(anchor) {
    const run = this.#run;
    if (!run || run.cancelled || run.key !== anchor) return 0;
    const now = performance.now();
    if (run.beeps) return this.#blipLevel(run, now);
    return run.talking ? synthLevel(run, now) : 0;
  }

  isSpeaking(anchor) {
    const run = this.#run;
    return Boolean(run && !run.cancelled && run.key === anchor);
  }

  sfx(name) {
    try {
      const ctx = this.#ctx;
      if (!ctx || this.#requested === 'mute') return;
      if (ctx.state !== 'running') {
        Promise.resolve(ctx.resume()).catch(() => {});
        return;
      }
      const t = ctx.currentTime + 0.02;
      switch (name) {
        case 'jingle': this.#jingle(t); break;
        case 'outro': this.#outro(t); break;
        case 'whoosh': this.#whoosh(t); break;
        case 'breaking': this.#breaking(t); break;
        case 'blip': this.#tone('square', 880, t, 0.05, 0.08, { to: 1320 }); break;
        default: break;
      }
    } catch { /* never break the show over a sound effect */ }
  }

  // ---------------------------------------------------------------- speaking

  #stopSpeech() {
    const run = this.#run;
    this.#run = null;
    run?.cancel();
    try {
      const synth = this.#synth;
      if (synth && (synth.speaking || synth.pending || synth.paused)) synth.cancel();
    } catch { /* ignore */ }
  }

  async #play(run, sentences, onSentence) {
    try {
      for (let i = 0; i < sentences.length && !run.cancelled; i++) {
        try {
          onSentence?.(sentences[i], i);
        } catch (err) {
          console.warn('[audio] onSentence failed', err);
        }
        const mode = this.mode;
        if (mode === 'tts') await this.#sayTts(run, sentences[i]);
        else if (mode === 'blips') await this.#sayBlips(run, sentences[i]);
        else await this.#sayMute(run, sentences[i]);
        run.talking = false;
        if (i < sentences.length - 1 && !run.cancelled) await run.sleep(GAP[mode]);
      }
    } catch (err) {
      console.warn('[audio] speech failed', err);
    } finally {
      run.cancel();
      if (this.#run === run) {
        this.#run = null;
        this.#duck(false);
      }
    }
  }

  async #sayMute(run, sentence, ms = (sentence.length / MUTE_CPS) * 1000) {
    run.talking = true;
    run.talkAt = performance.now();
    await run.sleep(Math.max(250, ms));
  }

  async #sayTts(run, sentence) {
    const synth = this.#synth;
    const Utter = globalThis.SpeechSynthesisUtterance;
    if (!synth || !Utter) return this.#sayMute(run, sentence);
    if (!run.reset) {
      // Fresh start for every speak(); the short wait avoids Chrome swallowing
      // an utterance queued right after cancel().
      run.reset = true;
      try {
        synth.cancel();
        if (synth.paused) synth.resume();
      } catch { /* ignore */ }
      await run.sleep(60);
      if (run.cancelled || this.mode !== 'tts') return;
    }
    const cfg = this.#config(run.key);
    const t0 = performance.now();
    const how = await new Promise((resolve) => {
      let settled = false;
      let timeout = 0;
      let startTimer = 0;
      const u = new Utter(sentence);
      u.lang = cfg.voice?.lang || cfg.lang;
      if (cfg.voice) u.voice = cfg.voice;
      u.pitch = cfg.pitch;
      u.rate = cfg.rate;
      u.volume = this.#volume;
      run.utter = u;
      const begin = () => {
        if (run.talking) return;
        run.talking = true;
        run.talkAt = performance.now();
      };
      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        clearTimeout(startTimer);
        run.wakers.delete(wake);
        u.onstart = u.onend = u.onerror = u.onboundary = null;
        resolve(result);
      };
      const wake = () => finish('cancel');
      run.wakers.add(wake);
      u.onstart = begin;
      u.onboundary = (e) => {
        begin();
        if (!e.name || e.name === 'word') run.boundaryAt = performance.now();
      };
      u.onend = () => finish('end');
      u.onerror = () => finish('error');
      startTimer = setTimeout(begin, 700); // some engines never fire onstart
      // Chrome sometimes never fires onend: move on after a generous deadline.
      timeout = setTimeout(() => {
        try {
          synth.cancel();
        } catch { /* ignore */ }
        finish('timeout');
      }, (sentence.length / 9 + 4) * 1000);
      try {
        synth.speak(u);
      } catch {
        finish('error');
      }
    });
    run.talking = false;
    if (how === 'cancel' || run.cancelled) return;
    const elapsed = performance.now() - t0;
    if (how === 'error' || (how === 'end' && elapsed < sentence.length * 22)) {
      // Engine failed or "finished" implausibly fast (no output device?): keep the show's pace.
      await this.#sayMute(run, sentence, (sentence.length / MUTE_CPS) * 1000 - elapsed);
    }
  }

  async #sayBlips(run, sentence) {
    const lead = 40;
    const blip = this.#config(run.key).blip;
    const plan = planBlips(sentence, blip);
    run.t0 = performance.now() + lead;
    run.beepIdx = -1;
    run.beeps = plan.beeps;
    const silence = this.#scheduleBlips(blip, plan, lead);
    try {
      await run.sleep(lead + plan.total);
    } finally {
      run.beeps = null;
      silence?.();
    }
  }

  // Beeps are put on the AudioContext clock up front (one oscillator per
  // sentence, gain automation per beep). The returned function cuts it short.
  #scheduleBlips(blip, plan, lead) {
    const ctx = this.#ctx;
    if (!ctx || !this.#master || ctx.state !== 'running') return null;
    try {
      const osc = ctx.createOscillator();
      const lp = ctx.createBiquadFilter();
      const g = ctx.createGain();
      osc.type = blip.type;
      osc.frequency.value = plan.beeps[0]?.freq ?? blip.base;
      lp.type = 'lowpass';
      lp.frequency.value = blip.cut;
      g.gain.value = 0;
      osc.connect(lp).connect(g).connect(this.#master);
      const t0 = ctx.currentTime + lead / 1000;
      for (const b of plan.beeps) {
        const t = t0 + b.at / 1000;
        const d = b.dur / 1000;
        const v = blip.gain * b.peak;
        osc.frequency.setValueAtTime(b.freq, t);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(v, t + 0.006);
        g.gain.setValueAtTime(v, t + d - 0.012);
        g.gain.linearRampToValueAtTime(0, t + d);
      }
      osc.start();
      osc.stop(t0 + plan.total / 1000 + 0.05);
      osc.onended = () => {
        try {
          osc.disconnect();
          lp.disconnect();
          g.disconnect();
        } catch { /* ignore */ }
      };
      return () => {
        try {
          const now = ctx.currentTime;
          g.gain.cancelScheduledValues(now);
          g.gain.setTargetAtTime(0, now, 0.004);
          osc.stop(now + 0.03);
        } catch { /* already stopped */ }
      };
    } catch {
      return null;
    }
  }

  // ~1 while a beep sounds, then a fast exponential fall. The index only moves
  // forward, so each call is O(1) amortised.
  #blipLevel(run, now) {
    const beeps = run.beeps;
    const t = now - run.t0;
    if (t < 0) return 0;
    let i = run.beepIdx;
    while (i + 1 < beeps.length && beeps[i + 1].at <= t) i++;
    run.beepIdx = i;
    if (i < 0) return 0;
    const b = beeps[i];
    const end = b.at + b.dur;
    const v = t <= end ? b.peak : b.peak * Math.exp(-(t - end) / 55);
    return v < 0.02 ? 0 : v;
  }

  // ------------------------------------------------------------------ voices

  #refreshVoices() {
    const synth = this.#synth;
    if (!synth) return;
    this.#lastRefresh = performance.now();
    let all = [];
    try {
      all = Array.from(synth.getVoices() ?? []);
    } catch { /* ignore */ }
    this.#all = all.filter((v) => v && typeof v === 'object');
    this.#voices = this.#all.filter((v) => this.#lang.match.test(String(v.lang ?? '')));
    this.#resolve();
  }

  // Slot config, resolving a first-seen key on the spot.
  #config(key) {
    let cfg = this.#resolved.get(key);
    if (!cfg) {
      this.#seen.push(key);
      if (this.#seen.length > 24) this.#seen.shift();
      this.#resolve();
      cfg = this.#resolved.get(key);
    }
    return cfg;
  }

  // Assigns a voice, pitch, rate and blip timbre to every known slot, in a fixed
  // order (profiles, then A and B, then the rest) so assignments stay stable.
  #resolve() {
    const used = new Map(); // voice -> slots using it
    const out = new Map();
    for (const key of new Set([...this.#profiles.keys(), 'A', 'B', ...this.#seen])) {
      const prof = this.#profiles.get(key) ?? DEFAULT_PROFILES.get(key) ?? NEUTRAL_PROFILE;
      // Profile language family first; if nothing is installed, the engine's language.
      const plan = prof.lang ? langPlan(prof.lang) : this.#lang;
      const family = this.#all.filter((v) => plan.match.test(String(v.lang ?? '')));
      const pool = family.length ? family : this.#voices;
      const voice = pool.length ? chooseVoice(pool, prof.gender, plan.pref, used) : null;
      let pitch = prof.pitch;
      if (voice) {
        const g = voiceGender(voice);
        if (prof.gender === 'male' && g === 'female') pitch *= 0.85;
        else if (prof.gender === 'female' && g === 'male') pitch *= 1.2;
        // Same voice already used by another slot of this gender: nudge the pitch apart.
        const twins = (used.get(voice) ?? []).filter((k) => out.get(k).gender === prof.gender).length;
        if (twins) pitch *= twins % 2 ? 1.12 : 0.88;
        used.set(voice, [...(used.get(voice) ?? []), key]);
      }
      out.set(key, {
        gender: prof.gender,
        voice,
        pitch: clamp(pitch, 0.1, 2),
        rate: prof.rate,
        lang: prof.lang ?? plan.pref[0] ?? plan.base,
        blip: blipFor(key, prof),
      });
    }
    // Default anchors forced onto one voice: split them well apart by pitch.
    const a = out.get('A');
    const b = out.get('B');
    if (!this.#profiles.has('A') && !this.#profiles.has('B') && a.voice && a.voice === b.voice) {
      a.pitch = 0.85;
      b.pitch = 1.2;
    }
    this.#resolved = out;
  }

  // Voices load asynchronously in Chrome: wait for 'voiceschanged', at most 1.5 s.
  #loadVoices() {
    const synth = this.#synth;
    if (!synth) return Promise.resolve();
    this.#refreshVoices();
    if (this.#voices.length) return Promise.resolve();
    return new Promise((resolve) => {
      let timer = 0;
      const done = () => {
        clearTimeout(timer);
        try {
          synth.removeEventListener('voiceschanged', onChange);
        } catch { /* ignore */ }
        this.#refreshVoices();
        resolve();
      };
      const onChange = () => {
        this.#refreshVoices();
        if (this.#voices.length) done();
      };
      timer = setTimeout(done, 1500);
      try {
        synth.addEventListener('voiceschanged', onChange);
      } catch {
        done();
      }
    });
  }

  // ------------------------------------------------------------ audio context

  #ensureContext() {
    if (this.#ctx) return this.#ctx;
    const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctor) return null;
    try {
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = this.#volume;
      master.connect(ctx.destination);
      const music = ctx.createGain();
      music.gain.value = this.#ducked ? DUCK_LEVEL : 1;
      music.connect(master);
      // One second of white noise, shared by every hat / whoosh.
      const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.#ctx = ctx;
      this.#master = master;
      this.#music = music;
      this.#noiseBuf = buf;
    } catch {
      this.#ctx = null;
    }
    return this.#ctx;
  }

  // iOS only unlocks audio after something plays inside the gesture.
  #primeAudio(ctx) {
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, 22050);
    src.connect(ctx.destination);
    src.start(0);
  }

  // Same for speech: a silent utterance inside the gesture unlocks later speak() calls.
  #primeSpeech() {
    const synth = this.#synth;
    if (!synth || this.#primed) return;
    this.#primed = true;
    const u = new globalThis.SpeechSynthesisUtterance(' ');
    u.volume = 0;
    synth.speak(u);
  }

  // ------------------------------------------------------------------ tunes

  // Chiptune player for jingles and ad music. Notes are scheduled on the
  // AudioContext clock a couple of seconds ahead, so loops are seamless even if
  // timers lag. Shorter tracks repeat to fill the longest one.
  playTune(tune, opts = {}) {
    const none = { stop() {} };
    try {
      const ctx = this.#ctx;
      if (!ctx || !this.#music || this.#requested === 'mute') return none;
      if (ctx.state !== 'running') {
        Promise.resolve(ctx.resume()).catch(() => {});
        return none;
      }
      const song = parseTune(tune);
      if (!song) return none;
      const loop = Boolean(opts?.loop);
      const gain = ctx.createGain();
      gain.gain.value = numOr(opts?.volume, 0.5, 0, 1);
      gain.connect(this.#music);
      const live = new Set();
      const passSec = Math.max(0.05, (song.beats * 60) / song.bpm);
      let next = ctx.currentTime + 0.05;
      let timer = 0;
      let stopped = false;

      const stop = () => {
        if (stopped) return;
        stopped = true;
        clearInterval(timer);
        clearTimeout(timer);
        this.#tunes.delete(handle);
        const now = ctx.currentTime;
        try {
          gain.gain.cancelScheduledValues(now);
          gain.gain.setValueAtTime(gain.gain.value, now);
          gain.gain.linearRampToValueAtTime(0, now + 0.08);
        } catch { /* ignore */ }
        for (const rec of live) {
          try {
            rec.src.stop(now + 0.1);
          } catch { /* not started or already stopped */ }
        }
        setTimeout(() => {
          try {
            gain.disconnect();
          } catch { /* ignore */ }
        }, 300);
      };
      const pump = () => {
        try {
          while (!stopped && next < ctx.currentTime + TUNE_LOOKAHEAD) {
            this.#schedulePass(song, next, gain, live);
            next += passSec;
            if (!loop) {
              timer = setTimeout(stop, (next - ctx.currentTime) * 1000 + 600); // let the tail ring out
              return;
            }
          }
        } catch {
          stop();
        }
      };
      const handle = { stop };
      this.#tunes.add(handle);
      pump();
      if (loop && !stopped) timer = setInterval(pump, 250);
      return handle;
    } catch {
      return none;
    }
  }

  #stopTunes() {
    for (const tune of [...this.#tunes]) tune.stop();
  }

  // One pass of the song starting at `t`; each track tiles to the song length.
  #schedulePass(song, t, dest, live) {
    const sec = 60 / song.bpm;
    let budget = 4000;
    for (const track of song.tracks) {
      for (let off = 0; off < song.beats - 1e-6; off += track.beats) {
        for (const e of track.events) {
          const at = off + e.at;
          if (at >= song.beats - 1e-6) break;
          if (--budget < 0) return;
          const when = t + at * sec;
          if (track.kind === 'drums') {
            this.#drum(e.drum, when, dest, live);
            continue;
          }
          const dur = Math.min(e.dur, song.beats - at) * sec;
          const gain = ((track.kind === 'bass' ? 0.2 : 0.15) * WAVE_GAIN[track.wave]) / Math.sqrt(e.midis.length);
          for (const midi of e.midis) {
            this.#tone(track.wave, hz(midi), when, Math.max(0.04, dur * 0.94), gain, {
              release: Math.min(0.04, dur * 0.3), dest, live,
            });
          }
        }
      }
    }
  }

  #drum(kind, t, dest, live) {
    if (kind === 'k') {
      this.#tone('sine', 160, t, 0.16, 0.5, { to: 42, attack: 0.002, release: 0.1, dest, live });
    } else if (kind === 's') {
      this.#noise(t, 0.14, 0.13, { from: 1800, dest, live });
      this.#tone('triangle', 200, t, 0.08, 0.12, { to: 120, dest, live });
    } else {
      this.#noise(t, 0.045, 0.05, { dest, live });
    }
  }

  // Music drops to 40% while anyone is talking and comes back slowly.
  #duck(on) {
    if (this.#ducked === on) return;
    this.#ducked = on;
    try {
      const g = this.#music?.gain;
      if (!g) return;
      const now = this.#ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.setTargetAtTime(on ? DUCK_LEVEL : 1, now, on ? 0.08 : 0.4);
    } catch { /* ignore */ }
  }

  // ------------------------------------------------------------------- sfx

  // One oscillator note: short attack, hold, release. `to` slides the pitch.
  // `dest` defaults to the master bus; `live` collects nodes so a tune can cut them.
  #tone(type, freq, t, dur, gain, { to = 0, attack = 0.004, release = 0.03, dest = null, live = null } = {}) {
    const ctx = this.#ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const rec = { src: osc };
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.setValueAtTime(gain, Math.max(t + attack, t + dur - release));
    g.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(g).connect(dest ?? this.#master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    live?.add(rec);
    osc.onended = () => {
      live?.delete(rec);
      osc.disconnect();
      g.disconnect();
    };
  }

  // Filtered noise: a hi-hat when `hit`, a sweep when `swell`.
  #noise(t, dur, gain, { type = 'highpass', from = 6500, to = 0, q = 0.7, swell = false, dest = null, live = null } = {}) {
    const ctx = this.#ctx;
    const src = ctx.createBufferSource();
    const rec = { src };
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    src.buffer = this.#noiseBuf;
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(from, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    if (swell) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(gain, t + dur * 0.4);
      g.gain.linearRampToValueAtTime(0, t + dur);
    } else {
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    }
    src.connect(f).connect(g).connect(dest ?? this.#master);
    src.start(t, Math.random() * Math.max(0, this.#noiseBuf.duration - dur - 0.05));
    src.stop(t + dur + 0.02);
    live?.add(rec);
    src.onended = () => {
      live?.delete(rec);
      src.disconnect();
      f.disconnect();
      g.disconnect();
    };
  }

  // ~2.5 s news intro: rising C and G arpeggios (square), bass (triangle),
  // off-beat hats, and a big C major chord with a crash on the last beat.
  #jingle(t) {
    const S = 0.12;
    const lead = [
      [0, 72, 1], [1, 76, 1], [2, 79, 1], [3, 84, 1], [4, 88, 2], [6, 84, 1], [7, 88, 1],
      [8, 79, 1], [9, 83, 1], [10, 86, 1], [11, 91, 1], [12, 89, 2], [14, 86, 1], [15, 83, 1],
    ];
    const bass = [[0, 48, 2], [2, 48, 2], [4, 43, 2], [6, 48, 2], [8, 43, 2], [10, 43, 2], [12, 50, 2], [14, 43, 2]];
    for (const [step, note, len] of lead) this.#tone('square', hz(note), t + step * S, len * S * 0.95, 0.09);
    for (const [step, note, len] of bass) this.#tone('triangle', hz(note), t + step * S, len * S * 0.9, 0.22);
    for (let i = 1; i < 16; i += 2) this.#noise(t + i * S, 0.04, 0.04);
    const end = t + 16 * S;
    for (const note of [60, 64, 67, 72, 76]) this.#tone('square', hz(note), end, 0.6, 0.05, { release: 0.35 });
    this.#tone('triangle', hz(36), end, 0.65, 0.28, { release: 0.3 });
    this.#noise(end, 0.5, 0.06, { from: 5000 });
  }

  // ~2 s calmer sign-off: soft descending line (triangle) landing on a chord.
  #outro(t) {
    const S = 0.14;
    const lead = [[0, 88, 2], [2, 86, 2], [4, 84, 2], [6, 79, 2], [8, 76, 2]];
    const bass = [[0, 48, 4], [4, 43, 4], [8, 43, 2]];
    for (const [step, note, len] of lead) {
      this.#tone('triangle', hz(note), t + step * S, len * S * 0.95, 0.2, { release: 0.08 });
      this.#tone('square', hz(note - 12), t + step * S, len * S * 0.8, 0.025, { release: 0.08 });
    }
    for (const [step, note, len] of bass) this.#tone('triangle', hz(note), t + step * S, len * S * 0.9, 0.2);
    const end = t + 10 * S;
    for (const note of [60, 64, 67, 72]) this.#tone('square', hz(note), end, 0.7, 0.04, { release: 0.5 });
    this.#tone('triangle', hz(48), end, 0.7, 0.22, { release: 0.45 });
  }

  // ~0.35 s noise sweep for shot transitions, kept quiet.
  #whoosh(t) {
    this.#noise(t, 0.35, 0.16, { type: 'bandpass', from: 300, to: 3200, q: 1.4, swell: true });
  }

  // ~1.2 s two-tone alert, eight notes alternating high / low with a pulsing bass.
  #breaking(t) {
    for (let i = 0; i < 8; i++) {
      const at = t + i * 0.15;
      this.#tone('square', i % 2 ? 740 : 988, at, 0.13, 0.1);
      this.#tone('triangle', i % 2 ? 98 : 123, at, 0.13, 0.25);
      this.#noise(at, 0.04, 0.04);
    }
  }
}
