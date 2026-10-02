// Audio for the show. English by default; `new AudioEngine({ lang: 'es' })` uses
// Spanish voices. Sentence-by-sentence Web Speech TTS, Animal Crossing style
// "blips" through WebAudio, a silent mode that still moves the presenters' lips,
// and the channel's chiptune music and cues. Nothing here may throw: a missing
// API just means less sound, never a broken broadcast.
//
// Pieces (public/js/audio/): visemes.js turns each sentence into a mouth
// timeline (speechFrame), synth.js is the chip synth and mixer, tune.js the
// tune format, themes.js the channel's sonic identity, voices.js the TTS voice
// choice and loudness.js levels tunes from different authors.

import { buildTimeline, sampleTimeline, blipPlan, SpeechClock, wordAtChar } from './audio/visemes.js';
import { buildBuses, setDuck, TunePlayer, asSong, scheduleBlips, DUCK_LEVEL } from './audio/synth.js';
import { CUES } from './audio/themes.js';
import { langPlan, normProfile, resolveVoices } from './audio/voices.js';

export { themeFor, CUES, MOTIF } from './audio/themes.js';
export { VISEMES } from './audio/visemes.js';

const MODES = ['tts', 'blips', 'mute'];
const MAX_CHUNK = 180;
const MIN_CHUNK = 12;
const MUTE_CPS = 15; // characters per second a failed TTS sentence is squeezed into
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

// ---------------------------------------------------------------------- run

// State of one speak() call. `wakers` holds everything currently waiting
// (timers, utterances) so stop() can release them all at once. The current
// sentence's mouth timeline lives here too.
class Run {
  constructor(key) {
    this.key = key; // voice slot: 'A', 'B', 'announcer', 'ad2'...
    this.cancelled = false;
    this.reset = false;
    this.utter = null; // keeps the utterance alive: Chrome may GC it before onend
    this.wakers = new Set();
    this.tl = null; // speech timeline of the sentence being said
    this.clock = null; // tts / mute: wall clock -> timeline time
    this.perf0 = null; // blips: performance.now() at which the first beep is heard
    this.sentence = -1;
    this.anchors = null; // recorded voice: [{ perf, w }] word starts still to apply
    this.nextAnchor = 0;
    this.loud = null; // recorded voice: analyser for the real loudness
  }

  setTimeline(tl, clock, perf0 = null) {
    this.tl = tl;
    this.clock = clock;
    this.perf0 = perf0;
  }

  clearTimeline() {
    this.tl = null;
    this.clock = null;
    this.perf0 = null;
    this.anchors = null;
  }

  // Recorded voice: smoothed loudness 0..1 of what is playing right now.
  loudness(now) {
    const l = this.loud;
    if (!l) return 1;
    if (now - l.at < 8) return l.value;
    l.analyser.getFloatTimeDomainData(l.data);
    let sum = 0;
    for (let i = 0; i < l.data.length; i++) sum += l.data[i] * l.data[i];
    const dbv = 10 * Math.log10(sum / l.data.length + 1e-10);
    const target = Math.min(1, Math.max(0, (dbv + 48) / 30));
    const dt = l.at < 0 ? 1000 : now - l.at;
    // Fast to open, a little slower to close, like a jaw.
    l.value += (target - l.value) * (1 - Math.exp(-dt / (target > l.value ? 25 : 60)));
    l.at = now;
    return l.value;
  }

  timeAt(now) {
    if (!this.tl) return null;
    const a = this.anchors;
    while (a && this.clock && this.nextAnchor < a.length && a[this.nextAnchor].perf <= now) {
      const { w, perf } = a[this.nextAnchor++];
      this.clock.anchorWord(w, perf);
    }
    if (this.clock) return this.clock.timeAt(now);
    return this.perf0 === null ? null : now - this.perf0;
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
    this.clearTimeline();
    this.wake();
  }
}

const REST_FRAME = Object.freeze({ viseme: 'rest', level: 0 });
const RELEASE_MS = 130; // an interrupted mouth closes over this long
const LOOKAHEAD = 1.6; // seconds of music scheduled ahead (timers may be throttled)

// ------------------------------------------------------------------- engine

export class AudioEngine {
  #synth = null;
  #ctx = null;
  #buses = null;
  #volume = 0.8;
  #requested = 'tts';
  #ducked = false;
  #players = new Set(); // live tune handles
  #pending = new Set(); // tunes waiting for the context to start
  #pump = 0;
  #lang;
  #all = []; // every installed voice
  #voices = []; // the ones in the engine's language
  #profiles = new Map(); // slot -> normalized profile from setVoices()
  #seen = []; // other slots that have spoken ('announcer', 'ad2'...)
  #resolved = new Map(); // slot -> { voice, pitch, rate, lang, blip }
  #lastRefresh = 0;
  #primed = false;
  #armed = null;
  #run = null;
  #speed = new Map(); // slot -> learned TTS speed (timeline ms per wall ms)
  #last = new Map(); // slot -> { at, viseme, level } last sampled mouth, for releases
  #scratch = {};
  #voiceCache = new Map(); // url -> decoded recorded voice

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
      this.#buses?.out.gain.setTargetAtTime(this.#volume, this.#ctx.currentTime, 0.01);
    } catch { /* no audio */ }
  }

  /** The AudioContext (null until unlock()); for other audio modules. */
  get context() {
    return this.#ctx;
  }

  /** Gain node for background music: routed to the master, ducked under speech. */
  get musicBus() {
    return this.#buses?.music ?? null;
  }

  /** Gain node for voice audio played through WebAudio (not ducked, limited). */
  get speechBus() {
    return this.#buses?.speech ?? null;
  }

  /** True while anyone is speaking (between their sentences too). */
  get speaking() {
    return Boolean(this.#run && !this.#run.cancelled);
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

  /** The modes that can actually be selected right now, in V-key order. */
  get modes() {
    return this.ttsAvailable ? [...MODES] : MODES.filter((m) => m !== 'tts');
  }

  setMode(mode) {
    if (!MODES.includes(mode)) return;
    const before = this.mode;
    this.#requested = mode;
    // Mute silences the output but keeps every tune running, so an ad's music
    // comes back when sound is switched on again.
    this.#applyMute();
    if (this.mode === before) return;
    // Cut what is sounding now; a running speak() carries on with its next sentence.
    try {
      this.#synth?.cancel();
    } catch { /* ignore */ }
    this.#run?.wake();
  }

  // Call from a user gesture. Everything async is bounded so it can never hang.
  // Without one (autostart) it also listens for the first gesture and retries.
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
    if (!this.#unlocked()) this.#armUnlock();
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

  /** Which voice each slot got (for the control panel and the lab). */
  voiceInfo() {
    return [...this.#resolved].map(([slot, c]) => ({ slot, voice: c.voice?.name ?? null, lang: c.voice?.lang ?? c.lang, gender: c.gender, pitch: c.pitch, rate: c.rate }));
  }

  // `anchor` is any slot key. Resolves when the text has been spoken or stop() ran.
  // opts.onSentence(sentence, i) fires as each sentence starts. opts.audio is a
  // recorded voice for the whole text: { url | buffer (AudioBuffer), words:
  // [{ t: seconds, char: index into text }] }; it is played through WebAudio
  // unless blips were asked for, and browser TTS is the fallback.
  speak(text, anchor = 'A', opts = {}) {
    const onSentence = opts?.onSentence;
    const audio = opts?.audio && typeof opts.audio === 'object' ? opts.audio : null;
    this.#stopSpeech();
    const sentences = splitSentences(text);
    if (!sentences.length) {
      this.#duck(false);
      return Promise.resolve();
    }
    const run = new Run(typeof anchor === 'string' && anchor ? anchor : 'A');
    this.#run = run;
    this.#duck(true);
    return this.#play(run, sentences, onSentence, audio ? { audio, text: String(text) } : null);
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

  /**
   * The mouth of `slot` (default: whoever is speaking) at `now`:
   * { slot, speaking, level 0..1, viseme, next, mix 0..1, wordIndex, charIndex,
   *   sentenceIndex, accent 0..1 (stressed syllable), pause (comma pause) }.
   * Visemes: rest MBP FV TH L EE AH OH OO WQ S. Works in tts, blips and mute.
   */
  speechFrame(now = performance.now(), slot) {
    const run = this.#run;
    const key = slot ?? (run && !run.cancelled ? run.key : null);
    const f = { slot: key, speaking: false, level: 0, viseme: 'rest', next: 'rest', mix: 0, wordIndex: -1, charIndex: -1, sentenceIndex: -1, accent: 0, pause: false };
    if (key === null) return f;
    const live = run && !run.cancelled && run.key === key ? run : null;
    const t = live ? live.timeAt(now) : null;
    if (live && t !== null) {
      const s = sampleTimeline(live.tl, t, this.#scratch);
      f.speaking = s.speaking;
      // A recorded voice: the jaw also follows what is actually heard.
      f.level = live.loud ? s.level * Math.min(1, 0.25 + live.loudness(now) * 0.9) : s.level;
      f.viseme = s.viseme;
      f.next = s.next;
      f.mix = s.mix;
      f.wordIndex = s.wordIndex;
      f.charIndex = s.charIndex;
      f.accent = s.accent;
      f.pause = s.pause;
      f.sentenceIndex = live.sentence;
      const shown = s.mix > 0.5 ? s.next : s.viseme;
      const last = this.#last.get(key);
      if (last) {
        last.at = now;
        last.viseme = shown;
        last.level = s.level;
      } else this.#last.set(key, { at: now, viseme: shown, level: s.level });
      return f;
    }
    // Interrupted (sentence ended early, stop(), mode change): close smoothly.
    const last = this.#last.get(key) ?? REST_FRAME;
    const since = now - (last.at ?? -1e9);
    if (since < RELEASE_MS && last.level > 0.01) {
      const k = since / RELEASE_MS;
      const ease = k * k * (3 - 2 * k);
      f.viseme = last.viseme;
      f.next = 'rest';
      f.mix = ease;
      f.level = last.level * (1 - ease);
      if (live) f.sentenceIndex = live.sentence;
    }
    return f;
  }

  // Mouth openness 0..1 for the existing presenters (studio.js); kept until the
  // new face system reads speechFrame() directly.
  level(anchor) {
    return this.speechFrame(performance.now(), anchor).level;
  }

  isSpeaking(anchor) {
    const run = this.#run;
    return Boolean(run && !run.cancelled && run.key === anchor);
  }

  /** Channel cues: jingle/ident, whoosh/stinger, breaking, outro, promo, blip. */
  sfx(name) {
    try {
      if (name === 'blip') return this.#blip();
      const cue = CUES[name];
      if (cue) this.playTune(cue, { volume: 0.5 });
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

  async #play(run, sentences, onSentence, recorded = null) {
    try {
      if (recorded && this.#requested !== 'blips' && (await this.#playRecorded(run, recorded, sentences, onSentence))) return;
      for (let i = 0; i < sentences.length && !run.cancelled; i++) {
        run.sentence = i;
        try {
          onSentence?.(sentences[i], i);
        } catch (err) {
          console.warn('[audio] onSentence failed', err);
        }
        const mode = this.mode;
        if (mode === 'tts') await this.#sayTts(run, sentences[i]);
        else if (mode === 'blips') await this.#sayBlips(run, sentences[i]);
        else await this.#sayMute(run, sentences[i]);
        run.clearTimeline();
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

  // ---------------------------------------------------------- recorded voice

  // AudioBuffer for a recorded line (decoded once, a few kept), or null.
  async #loadVoiceBuffer(audio) {
    const ctx = this.#ctx;
    if (!ctx) return null;
    if (audio.buffer && typeof audio.buffer.getChannelData === 'function') return audio.buffer;
    const url = typeof audio.url === 'string' ? audio.url : null;
    if (!url) return null;
    const hit = this.#voiceCache.get(url);
    if (hit) return hit;
    const job = (async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`voice ${res.status}`);
      return ctx.decodeAudioData(await res.arrayBuffer());
    })();
    const buf = await Promise.race([job, new Promise((_, rej) => setTimeout(() => rej(new Error('voice timeout')), 4000))]);
    this.#voiceCache.set(url, buf);
    if (this.#voiceCache.size > 8) this.#voiceCache.delete(this.#voiceCache.keys().next().value);
    return buf;
  }

  // Plays a recorded voice for the whole text. Each sentence gets its own mouth
  // timeline, anchored to the recording's word times, and the jaw also follows
  // the real loudness. Returns false (nothing played) if the audio is unusable.
  async #playRecorded(run, { audio, text }, sentences, onSentence) {
    const ctx = this.#ctx;
    if (!ctx || !this.#buses || ctx.state !== 'running') return false;
    let buffer = null;
    try {
      buffer = await this.#loadVoiceBuffer(audio);
    } catch (err) {
      console.warn('[audio] recorded voice unavailable, using TTS', err?.message ?? err);
    }
    if (!buffer || run.cancelled) return Boolean(run.cancelled);
    // Where each sentence starts in the text, and which recorded words fall in it.
    const starts = [];
    let from = 0;
    for (const sentence of sentences) {
      const at = text.indexOf(sentence.slice(0, 12), from);
      starts.push(at >= 0 ? at : from);
      from = (at >= 0 ? at : from) + sentence.length;
    }
    const words = (Array.isArray(audio.words) ? audio.words : [])
      .map((w) => ({ t: Number(w?.t) * 1000, char: Number(w?.char) }))
      .filter((w) => Number.isFinite(w.t) && Number.isFinite(w.char))
      .sort((a, b) => a.t - b.t);
    const durMs = buffer.duration * 1000;
    const plan = sentences.map((sentence, i) => {
      const a = starts[i];
      const b = i + 1 < starts.length ? starts[i + 1] : Infinity;
      const tl = this.#timeline(run.key, sentence);
      const mine = words.filter((w) => w.char >= a && w.char < b);
      // Sentence start: its first recorded word, else proportional to the text.
      const begin = mine.length ? mine[0].t : (a / Math.max(1, text.length)) * durMs;
      const anchors = mine.map((w) => ({ at: w.t, w: wordAtChar(tl, w.char - a) }));
      // Sentence end: the last word plus the rest of the timeline at the pace
      // the recording showed (the gap after it is silence, mouth at rest).
      let end = begin + tl.total;
      if (anchors.length >= 2) {
        const f = anchors[0];
        const l = anchors[anchors.length - 1];
        const span = tl.words[l.w].t0 - tl.words[f.w].t0;
        const pace = span > 50 ? Math.min(2, Math.max(0.5, (l.at - f.at) / span)) : 1;
        end = l.at + (tl.total - tl.words[l.w].t0) * pace;
      }
      return { sentence, tl, begin, end, anchors };
    });
    for (let i = 0; i + 1 < plan.length; i++) plan[i].end = Math.min(plan[i].end, plan[i + 1].begin);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    src.connect(analyser);
    analyser.connect(this.#buses.speech);
    const t0 = ctx.currentTime + 0.06;
    const perf0 = this.#heardAt(t0);
    run.loud = { analyser, data: new Float32Array(analyser.fftSize), at: -1, value: 0 };
    let ended = false;
    src.onended = () => {
      ended = true;
      run.wake();
    };
    src.start(t0);
    const stopSource = () => {
      try {
        src.stop();
      } catch { /* already stopped */ }
    };
    try {
      for (let i = 0; i < plan.length && !run.cancelled && !ended; i++) {
        const p = plan[i];
        const startPerf = perf0 + p.begin;
        if (startPerf > performance.now()) await run.sleep(startPerf - performance.now());
        if (run.cancelled || ended) break;
        run.sentence = i;
        try {
          onSentence?.(p.sentence, i);
        } catch (err) {
          console.warn('[audio] onSentence failed', err);
        }
        const clock = new SpeechClock(p.tl, { speed: p.anchors.length ? 1 : p.tl.total / Math.max(200, p.end - p.begin), soft: false });
        clock.start(startPerf);
        run.setTimeline(p.tl, clock);
        run.anchors = p.anchors.map((x) => ({ perf: perf0 + x.at, w: x.w }));
        run.nextAnchor = 0;
        const endPerf = perf0 + p.end;
        while (!run.cancelled && !ended && performance.now() < endPerf - 1) await run.sleep(endPerf - performance.now());
        run.clearTimeline(); // silence until the next sentence: the mouth rests
        const next = i + 1 < plan.length ? perf0 + plan[i + 1].begin : perf0 + durMs + 40;
        while (!run.cancelled && !ended && performance.now() < next - 1) await run.sleep(next - performance.now());
      }
      while (!run.cancelled && !ended) await run.sleep(Math.max(20, perf0 + durMs + 300 - performance.now()));
    } finally {
      if (run.cancelled) stopSource();
      run.clearTimeline();
      run.loud = null;
      setTimeout(() => {
        try {
          analyser.disconnect();
          src.disconnect();
        } catch { /* ignore */ }
      }, 200);
    }
    return true;
  }

  #timeline(key, sentence, rate) {
    const cfg = this.#config(key);
    return buildTimeline(sentence, { lang: cfg.voice?.lang || cfg.lang || this.#lang.base, rate: rate ?? cfg.rate });
  }

  // No sound: the mouth follows the timeline on the wall clock. `ms` squeezes
  // it into the time left when a TTS engine failed mid-sentence.
  async #sayMute(run, sentence, ms) {
    const tl = this.#timeline(run.key, sentence);
    const speed = ms ? Math.min(2, Math.max(0.5, tl.total / Math.max(250, ms))) : 1;
    const clock = new SpeechClock(tl, { speed, soft: false });
    clock.start(performance.now());
    run.setTimeline(tl, clock);
    await run.sleep(tl.total / clock.speed + 40);
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
    const tl = this.#timeline(run.key, sentence);
    const clock = new SpeechClock(tl, { speed: this.#speed.get(run.key) ?? 1, soft: true });
    run.setTimeline(tl, clock);
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
      const begin = () => clock.start(performance.now());
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
        if (e.name && e.name !== 'word') return;
        // Word boundaries re-synchronise the mouth with the voice.
        clock.anchorChar(Number(e.charIndex) || 0, performance.now());
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
    const end = performance.now();
    clock.end(end);
    if (how === 'end' && clock.started) this.#learnSpeed(run.key, tl, clock, end);
    run.clearTimeline();
    if (how === 'cancel' || run.cancelled) return;
    const elapsed = end - t0;
    if (how === 'error' || (how === 'end' && elapsed < sentence.length * 22)) {
      // Engine failed or "finished" implausibly fast (no output device?): keep the show's pace.
      await this.#sayMute(run, sentence, (sentence.length / MUTE_CPS) * 1000 - elapsed);
    }
  }

  // The voice's real pace: from word boundaries when the engine sends them,
  // else from how long the sentence took; used to start the next sentence right.
  #learnSpeed(key, tl, clock, end) {
    const prev = this.#speed.get(key) ?? 1;
    let next = prev;
    if (clock.boundaries >= 3) next = clock.speed;
    else {
      const took = end - clock.startR;
      if (took > 400) next = prev + (tl.total / took - prev) * 0.5;
    }
    if (Number.isFinite(next)) this.#speed.set(key, Math.min(2, Math.max(0.5, next)));
  }

  async #sayBlips(run, sentence) {
    const lead = 40;
    const cfg = this.#config(run.key);
    const tl = this.#timeline(run.key, sentence);
    const beeps = blipPlan(tl);
    const ctx = this.#ctx;
    let perf0 = performance.now() + lead;
    let silence = null;
    if (ctx && this.#buses && ctx.state === 'running') {
      try {
        const t0 = ctx.currentTime + lead / 1000;
        silence = scheduleBlips(ctx, this.#buses.speech, cfg.blip, beeps, t0, tl.total / 1000);
        perf0 = this.#heardAt(t0);
      } catch { /* the mouth still moves */ }
    }
    run.setTimeline(tl, null, perf0);
    try {
      await run.sleep(perf0 - performance.now() + tl.total);
    } finally {
      silence?.();
    }
  }

  // performance.now() at which context time `t` reaches the listener's ears:
  // the output timestamp when the browser gives a sane one, else the stated
  // output + base latency.
  #heardAt(t) {
    const ctx = this.#ctx;
    const now = performance.now();
    const naive = now + (t - ctx.currentTime) * 1000;
    let heard = naive + ((Number(ctx.outputLatency) || 0) + (Number(ctx.baseLatency) || 0)) * 1000;
    try {
      const ts = ctx.getOutputTimestamp?.();
      if (ts && ts.performanceTime > 0 && ts.contextTime > 0) {
        const v = ts.performanceTime + (t - ts.contextTime) * 1000;
        if (v >= naive - 5 && v <= naive + 400) heard = v;
      }
    } catch { /* ignore */ }
    return heard;
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

  #resolve() {
    this.#resolved = resolveVoices({ all: this.#all, voices: this.#voices, profiles: this.#profiles, seen: this.#seen, lang: this.#lang });
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
      const ctx = new Ctor({ latencyHint: 'playback' });
      this.#ctx = ctx;
      this.#buses = buildBuses(ctx, { volume: this.#volume });
      this.#buses.duck.gain.value = this.#ducked ? DUCK_LEVEL : 1;
      this.#applyMute();
      ctx.addEventListener?.('statechange', () => this.#onState());
    } catch {
      this.#ctx = null;
      this.#buses = null;
    }
    return this.#ctx;
  }

  #unlocked() {
    const ctxOk = !this.#ctx || this.#ctx.state === 'running';
    const gesture = globalThis.navigator?.userActivation;
    return ctxOk && (gesture ? gesture.hasBeenActive : true);
  }

  // Autostart has no gesture to unlock audio with: wait for the first one
  // (click, key, touch) and unlock then, as often as needed.
  #armUnlock() {
    const win = globalThis.window;
    if (this.#armed || !win?.addEventListener) return;
    const events = ['pointerdown', 'keydown', 'touchend', 'click'];
    const handler = () => {
      this.unlock();
      if (this.#ctx?.state === 'running') {
        for (const e of events) win.removeEventListener(e, handler, true);
        this.#armed = null;
      }
    };
    this.#armed = handler;
    for (const e of events) win.addEventListener(e, handler, true);
  }

  #onState() {
    if (this.#ctx?.state !== 'running') return;
    for (const start of [...this.#pending]) start();
  }

  // iOS only unlocks audio after something plays inside the gesture.
  #primeAudio(ctx) {
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, 22050);
    src.connect(ctx.destination);
    src.start(0);
  }

  // Same for speech: a silent utterance inside the gesture unlocks later speak() calls.
  // Outside a gesture (autostart) it would not count, so it waits for the real one.
  #primeSpeech() {
    const synth = this.#synth;
    if (!synth || this.#primed || synth.speaking || synth.pending) return;
    const activation = globalThis.navigator?.userActivation;
    if (activation && !activation.isActive) return;
    this.#primed = true;
    const u = new globalThis.SpeechSynthesisUtterance(' ');
    u.volume = 0;
    synth.speak(u);
  }

  #applyMute() {
    try {
      const g = this.#buses?.mute.gain;
      if (!g) return;
      const now = this.#ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setTargetAtTime(this.#requested === 'mute' ? 0 : 1, now, 0.015);
    } catch { /* ignore */ }
  }

  // Music drops 10 dB while anyone is talking and comes back slowly.
  #duck(on) {
    if (this.#ducked === on) return;
    this.#ducked = on;
    if (this.#buses) setDuck(this.#buses.duck.gain, on, this.#ctx.currentTime);
  }

  // ------------------------------------------------------------------ tunes

  /**
   * Plays a tune (classic or rich format, see tune.js) on the music bus,
   * levelled to the channel loudness; `volume` 0.5 is the reference level.
   * opts: { loop, volume }. Returns { stop(), song } and never throws. If the
   * context is still locked, a looping tune starts as soon as it unlocks.
   */
  playTune(tune, opts = {}) {
    const none = { stop() {}, song: null };
    try {
      const ctx = this.#ensureContext();
      const song = asSong(tune);
      if (!ctx || !this.#buses || !song) return none;
      const loop = Boolean(opts?.loop);
      const volume = Number.isFinite(Number(opts?.volume)) ? Number(opts.volume) : 0.5;
      let player = null;
      let stopped = false;
      const asked = performance.now();
      const begin = () => {
        this.#pending.delete(begin);
        // A one-shot that could not start within 0.4 s would land out of sync: skip it.
        if (stopped || (!loop && performance.now() - asked > 400)) return;
        player = new TunePlayer(ctx, this.#buses, song, { volume, loop });
        player.start(ctx.currentTime + 0.05);
        player.scheduleUntil(ctx.currentTime + LOOKAHEAD);
        if (!loop) player.endAt = player.t0 + player.passSec + 1.2;
        this.#players.add(player);
        this.#startPump();
      };
      const handle = {
        song,
        stop: () => {
          if (stopped) return;
          stopped = true;
          this.#pending.delete(begin);
          if (player) {
            this.#players.delete(player);
            player.stop(ctx.currentTime);
          }
        },
      };
      if (ctx.state === 'running') begin();
      else {
        this.#pending.add(begin);
        Promise.resolve(ctx.resume()).catch(() => {});
      }
      return handle;
    } catch {
      return none;
    }
  }

  #startPump() {
    if (this.#pump) return;
    this.#pump = setInterval(() => {
      const ctx = this.#ctx;
      if (!ctx) return;
      const now = ctx.currentTime;
      for (const p of [...this.#players]) {
        try {
          p.scheduleUntil(now + LOOKAHEAD);
          if (p.endAt && now > p.endAt) {
            this.#players.delete(p);
            p.stop(now, 0.3);
          }
        } catch {
          this.#players.delete(p);
          try {
            p.stop(now);
          } catch { /* ignore */ }
        }
      }
      if (!this.#players.size) {
        clearInterval(this.#pump);
        this.#pump = 0;
      }
    }, 120);
  }

  #stopTunes() {
    const now = this.#ctx?.currentTime ?? 0;
    for (const p of [...this.#players]) {
      try {
        p.stop(now);
      } catch { /* ignore */ }
    }
    this.#players.clear();
    this.#pending.clear();
  }

  // UI blip: a short rising pulse.
  #blip() {
    const ctx = this.#ctx;
    if (!ctx || !this.#buses || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.01;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(1320, t + 0.05);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.004);
    g.gain.linearRampToValueAtTime(0, t + 0.06);
    osc.connect(g).connect(this.#buses.music);
    osc.start(t);
    osc.stop(t + 0.07);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }
}
