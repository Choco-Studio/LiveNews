// Audio for the show. English by default; `new AudioEngine({ lang: 'es' })` uses
// Spanish voices. Sentence-by-sentence Web Speech TTS (or a recorded neural
// voice played through WebAudio), a low murmur for the "blips" mode, a silent
// mode that still moves the presenters' lips, and the channel's music and
// cues. Nothing here may throw: a missing API just means less sound, never a
// broken broadcast.
//
// Pieces (public/js/audio/): visemes.js turns each sentence into a mouth
// timeline (speechFrame), synth.js is the synth and mixer (ducking, dips,
// limiter), tune.js the tune format, themes.js the channel's sonic identity,
// voices.js the TTS voice choice and loudness.js the level plan and the model
// that levels tunes from different authors.

import { buildTimeline, sampleTimeline, SpeechClock, wordAtChar } from './audio/visemes.js';
import { splitSentences } from './audio/sentences.js';
import { buildBuses, Ducker, TunePlayer, asSong, scheduleMurmur, bank } from './audio/synth.js';
import { CUES, cueFor, themeFor, THEME_IDS } from './audio/themes.js';
import { langPlan, normProfile, resolveVoices } from './audio/voices.js';
import { WAVE_KINDS } from './audio/waves.js';
import { estimateLoudness } from './audio/loudness.js';

export { themeFor, cueFor, CUES, MOTIF } from './audio/themes.js';
export { VISEMES } from './audio/visemes.js';
export { splitSentences } from './audio/sentences.js';

const MODES = ['tts', 'blips', 'mute'];
const MUTE_CPS = 15; // characters per second a failed TTS sentence is squeezed into
// Silence after a sentence, by how it ends (ms). A newsreader leaves ~0.4-0.6 s
// after a full stop; TTS engines already add ~0.15-0.25 s of their own.
function gapAfter(sentence, mode) {
  const end = /([.!?…:;])["'’”»)\]]*\s*$/.exec(sentence)?.[1] ?? '';
  const tts = mode === 'tts';
  if (end === '?') return tts ? 220 : 480;
  if (end === '…') return tts ? 300 : 560;
  if (end === '.' || end === '!') return tts ? 180 : 430;
  if (end === ':' || end === ';') return tts ? 120 : 300;
  return tts ? 60 : 160; // a long sentence cut at a comma: keep going
}

// Where each sentence starts in the text (the same rule the director uses).
function sentenceStarts(text, sentences) {
  const starts = [];
  let from = 0;
  for (const sentence of sentences) {
    const at = text.indexOf(sentence.slice(0, 12), from);
    starts.push(at >= 0 ? at : from);
    from = (at >= 0 ? at : from) + sentence.length;
  }
  return starts;
}

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
    this.perf0 = null; // blips: performance.now() at which the first sound is heard
    this.sentence = -1;
    this.anchors = null; // recorded voice: [{ perf, w }] word starts still to apply
    this.nextAnchor = 0;
    this.loud = null; // recorded voice: analyser for the real loudness
    this.marks = null; // [{ char (in text), sentence, rel, fired }]
    this.markCursor = 0;
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
    if (!Number.isFinite(l.value)) l.value = 0;
    if (now - l.at < 8) return l.value;
    let target;
    if (l.env) {
      // The clip's own loudness envelope (voice service, 0..1 over the clip's
      // top 40 dB, frame i at i/rate s): exact in any context, offline renders
      // included, where an analyser reads silence. Mapped like the analyser.
      const x = ((now - l.env.perf0) / 1000) * l.env.rate;
      const i = Math.floor(x);
      const vals = l.env.values;
      const a = i >= 0 && i < vals.length ? Number(vals[i]) || 0 : 0;
      const b = i + 1 >= 0 && i + 1 < vals.length ? Number(vals[i + 1]) || 0 : 0;
      target = Math.min(1, Math.max(0, (a + (b - a) * (x - i) - 0.2) / 0.75));
    } else {
      l.analyser.getFloatTimeDomainData(l.data);
      let sum = 0;
      for (let i = 0; i < l.data.length; i++) {
        const v = l.data[i];
        if (Number.isFinite(v)) sum += v * v;
      }
      const dbv = 10 * Math.log10(sum / l.data.length + 1e-10);
      target = Math.min(1, Math.max(0, (dbv + 48) / 30));
    }
    const dt = l.at < 0 ? 1000 : Math.max(0, now - l.at);
    // Fast to open, a little slower to close, like a jaw.
    l.value += (target - l.value) * (1 - Math.exp(-dt / (target > l.value ? 25 : 60)));
    if (!Number.isFinite(l.value)) l.value = 0;
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

const RELEASE_MS = 130; // an interrupted mouth closes over this long
const LOOKAHEAD = 1.6; // seconds of music scheduled ahead (timers may be throttled)
const SPEED_KEY = 'globit24.ttsSpeed'; // learned TTS pace per voice, kept across sessions
const clamp01 = (x) => (x > 0 ? (x < 1 ? x : 1) : 0);

function loadSpeeds() {
  try {
    const raw = globalThis.localStorage?.getItem(SPEED_KEY);
    const obj = raw ? JSON.parse(raw) : null;
    if (obj && typeof obj === 'object') {
      return new Map(Object.entries(obj).filter(([, v]) => Number.isFinite(v) && v >= 0.5 && v <= 2).slice(0, 64));
    }
  } catch { /* private window, blocked storage */ }
  return new Map();
}

// ------------------------------------------------------------------- engine

export class AudioEngine {
  #synth = null;
  #ctx = null;
  #buses = null;
  #ducker = null;
  #volume = 0.8;
  #requested = 'tts';
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
  #speed = loadSpeeds(); // voice name (or slot) -> learned TTS speed (timeline ms per wall ms)
  #last = new Map(); // slot -> { at, viseme, level } last sampled mouth, for releases
  #scratch = {};
  #markScratch = {};
  #levelFrame = {};
  #voiceCache = new Map(); // url -> Promise<AudioBuffer> (decoded recorded voices)
  #musicDuckDb = -20;
  #warmed = false;
  #lastResume = -Infinity;

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

  /** Gain node for programme beds: routed to the master, ducked under speech (musicDuckDb). */
  get musicBus() {
    return this.#buses?.music ?? null;
  }

  /** Gain node every playTune() tune and cue plays into (each ducks itself); for taps and recorders. */
  get tunesBus() {
    return this.#buses?.tunes ?? null;
  }

  /** Gain node for voice audio played through WebAudio (not ducked, limited). */
  get speechBus() {
    return this.#buses?.speech ?? null;
  }

  /**
   * How far beds on musicBus drop while a voice is heard, in dB (default -20;
   * 0 = no duck, for a bed engine that ducks itself). Held 0.7 s after the
   * last word, ~120 ms attack, ~500 ms release, plus a -6 dB dip at 2.8 kHz.
   */
  get musicDuckDb() {
    return this.#musicDuckDb;
  }

  set musicDuckDb(db) {
    const n = Number(db);
    if (!Number.isFinite(n)) return;
    this.#musicDuckDb = Math.max(-40, Math.min(0, n));
    try {
      if (this.#buses?.bedTarget) this.#ducker.retarget(this.#buses.bedTarget, 10 ** (this.#musicDuckDb / 20), this.#ctx.currentTime);
    } catch { /* ignore */ }
  }

  /** True while anyone is speaking (between their sentences too), heard or not. */
  get speaking() {
    return Boolean(this.#run && !this.#run.cancelled);
  }

  /** True while a voice is actually heard (music is ducked for it). */
  get voiced() {
    return Boolean(this.#ducker?.speaking);
  }

  get ttsAvailable() {
    if (!this.#synth) return false;
    if (!this.#voices.length && performance.now() - this.#lastRefresh > 1000) this.#refreshVoices();
    return this.#voices.length > 0;
  }

  // The requested mode. 'tts' without any system voice plays recorded voices
  // when a segment has one and otherwise speaks silently (lips + captions,
  // like a muted broadcast) - never a fallback to beeps.
  get mode() {
    return this.#requested;
  }

  /** The selectable modes, in V-key order. */
  get modes() {
    return [...MODES];
  }

  /** Human label of the current mode (main.js shows it on the V key). */
  get modeLabel() {
    if (this.#requested === 'tts') return this.ttsAvailable ? 'tts' : 'tts (no system voices: captions)';
    return this.#requested === 'blips' ? 'blips (murmur)' : this.#requested;
  }

  setMode(mode) {
    if (!MODES.includes(mode)) return;
    const before = this.#requested;
    this.#requested = mode;
    // Mute silences the output but keeps every tune running, so an ad's music
    // comes back when sound is switched on again.
    this.#applyMute();
    if (mode === before) return;
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
        if (ctx.state !== 'running') {
          this.#lastResume = performance.now();
          resumed = ctx.resume();
        }
        this.#warm(ctx);
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

  /**
   * Start fetching and decoding a recorded voice now (e.g. the next segment's
   * `audio.url`), so speak() can start it without a gap. Returns a promise
   * (never rejects) resolving true when the buffer is ready.
   */
  preload(url) {
    if (typeof url !== 'string' || !url) return Promise.resolve(false);
    if (!this.#ctx) this.#ensureContext();
    return this.#loadVoiceBuffer({ url }).then((b) => Boolean(b), () => false);
  }

  // `anchor` is any slot key. Resolves when the text has been spoken or stop() ran.
  // opts.onSentence(sentence, i) fires as each sentence starts. opts.audio is a
  // recorded voice for the whole text: { url | buffer (AudioBuffer), words:
  // [{ t: seconds, char: index into text }], levels?: { rate, values: [0..1] }
  // (loudness envelope: the jaw follows it) }; it is played through WebAudio
  // unless blips were asked for, and browser TTS is the fallback.
  // opts.marks: [char offsets into text] and opts.onMark(i) fire when the
  // voice reaches each offset (gestures on the right word, in every mode);
  // marks after the last word fire when the speech ends.
  speak(text, anchor = 'A', opts = {}) {
    const onSentence = opts?.onSentence;
    const audio = opts?.audio && typeof opts.audio === 'object' ? opts.audio : null;
    this.#stopSpeech();
    const src = String(text ?? '');
    const sentences = splitSentences(src);
    if (!sentences.length) {
      this.#voiceOff();
      return Promise.resolve();
    }
    const run = new Run(typeof anchor === 'string' && anchor ? anchor : 'A');
    const starts = sentenceStarts(src, sentences);
    if (Array.isArray(opts?.marks) && typeof opts.onMark === 'function') {
      run.marks = opts.marks
        .map((c, i) => ({ i, char: Number(c) }))
        .filter((m) => Number.isFinite(m.char))
        .sort((a, b) => a.char - b.char)
        .map((m) => {
          let s = 0;
          while (s + 1 < starts.length && starts[s + 1] <= m.char) s++;
          return { ...m, sentence: s, rel: m.char - starts[s], fired: false };
        });
      run.onMark = opts.onMark;
    }
    this.#run = run;
    return this.#play(run, sentences, onSentence, audio ? { audio, text: src, starts } : null);
  }

  stop() {
    this.#stopSpeech();
    this.#voiceOff();
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
   * Pass `out` (any object) to have it filled instead of a new one allocated.
   */
  speechFrame(now = performance.now(), slot, out) {
    const run = this.#run;
    const key = slot ?? (run && !run.cancelled ? run.key : null);
    const f = out && typeof out === 'object' ? out : {};
    f.slot = key;
    f.speaking = false;
    f.level = 0;
    f.viseme = 'rest';
    f.next = 'rest';
    f.mix = 0;
    f.wordIndex = -1;
    f.charIndex = -1;
    f.sentenceIndex = -1;
    f.accent = 0;
    f.pause = false;
    if (key === null || key === undefined || !Number.isFinite(now)) return f;
    const live = run && !run.cancelled && run.key === key ? run : null;
    const t = live ? live.timeAt(now) : null;
    if (live && t !== null && Number.isFinite(t)) {
      const s = sampleTimeline(live.tl, t, this.#scratch);
      f.speaking = s.speaking;
      // A recorded voice: the jaw also follows what is actually heard.
      const level = live.loud ? s.level * Math.min(1, 0.25 + live.loudness(now) * 0.9) : s.level;
      f.level = clamp01(level);
      f.viseme = s.viseme;
      f.next = s.next;
      f.mix = clamp01(s.mix);
      f.wordIndex = s.wordIndex;
      f.charIndex = s.charIndex;
      f.accent = clamp01(s.accent);
      f.pause = s.pause;
      f.sentenceIndex = live.sentence;
      const shown = s.mix > 0.5 ? s.next : s.viseme;
      const last = this.#last.get(key);
      if (last) {
        if (now >= last.at) {
          last.at = now;
          last.viseme = shown;
          last.level = f.level;
        }
      } else this.#last.set(key, { at: now, viseme: shown, level: f.level });
      return f;
    }
    // Interrupted (sentence ended early, stop(), mode change): close smoothly.
    const last = this.#last.get(key);
    if (!last) return f;
    const since = Math.max(0, now - last.at);
    if (since < RELEASE_MS && last.level > 0.01) {
      const k = since / RELEASE_MS;
      const ease = k * k * (3 - 2 * k);
      f.viseme = last.viseme;
      f.next = 'rest';
      f.mix = ease;
      f.level = clamp01(last.level * (1 - ease));
      if (live) f.sentenceIndex = live.sentence;
    }
    return f;
  }

  // Mouth openness 0..1 for the existing presenters (studio.js); kept until the
  // new face system reads speechFrame() directly.
  level(anchor) {
    return this.speechFrame(performance.now(), anchor, this.#levelFrame).level;
  }

  isSpeaking(anchor) {
    const run = this.#run;
    return Boolean(run && !run.cancelled && run.key === anchor);
  }

  /**
   * Channel cues: jingle/ident, stinger (whoosh), breaking, outro/signoff,
   * promo/upnext, blip. opts: { programId (per-programme key and voicing for
   * breaking/outro/promo), startAt (performance.now() ms at which the cue's
   * first beat should be heard, e.g. the shot change it belongs to), hour }.
   */
  sfx(name, opts = {}) {
    try {
      if (name === 'blip') return this.#blip();
      const cue = cueFor(name, opts?.programId, { hour: opts?.hour }) ?? CUES[name];
      if (cue) this.playTune(cue, { volume: 0.5, startAt: opts?.startAt });
    } catch { /* never break the show over a sound effect */ }
    return undefined;
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

  // A voice is heard: duck the music (attack ~120 ms).
  #voiceOn() {
    try {
      if (this.#ctx && this.#ducker) this.#ducker.start(this.#ctx.currentTime);
    } catch { /* ignore */ }
  }

  // The voice stopped: the duck is held 0.7 s before the music comes back.
  #voiceOff() {
    try {
      if (this.#ctx && this.#ducker) this.#ducker.end(this.#ctx.currentTime);
    } catch { /* ignore */ }
  }

  // Fire the marks the speech has reached (polled while a run has marks).
  #pollMarks(run, final = false) {
    const marks = run.marks;
    if (!marks || run.markCursor >= marks.length) return;
    let reached = -1;
    let sentence = run.sentence;
    if (final) sentence = Infinity;
    else {
      const t = run.timeAt(performance.now());
      if (t === null) return;
      const f = sampleTimeline(run.tl, t, this.#markScratch);
      if (!f.speaking && t < 0) return;
      reached = f.charIndex >= 0 ? f.charIndex : t > 0 ? Infinity : -1;
    }
    while (run.markCursor < marks.length) {
      const m = marks[run.markCursor];
      if (m.sentence < sentence || (m.sentence === sentence && m.rel <= reached)) {
        run.markCursor++;
        try {
          run.onMark(m.i);
        } catch (err) {
          console.warn('[audio] onMark failed', err);
        }
      } else break;
    }
  }

  async #play(run, sentences, onSentence, recorded = null) {
    const poll = run.marks ? setInterval(() => !run.cancelled && this.#pollMarks(run), 25) : 0;
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
        else await this.#saySilent(run, sentences[i]);
        run.clearTimeline();
        if (i < sentences.length - 1 && !run.cancelled) await run.sleep(gapAfter(sentences[i], mode));
      }
    } catch (err) {
      console.warn('[audio] speech failed', err);
    } finally {
      clearInterval(poll);
      // Reactions placed after the last word still play when speech ends.
      if (!run.cancelled) this.#pollMarks(run, true);
      run.cancel();
      if (this.#run === run) {
        this.#run = null;
        this.#voiceOff();
      }
    }
  }

  // ---------------------------------------------------------- recorded voice

  // AudioBuffer for a recorded line (decoded once, a few kept), or null. The
  // decode promise itself is cached, so a slow decode that outlives the 4 s
  // wait still lands in the cache for the next time.
  async #loadVoiceBuffer(audio) {
    const ctx = this.#ctx;
    if (!ctx) return null;
    if (audio.buffer && typeof audio.buffer.getChannelData === 'function') return audio.buffer;
    const url = typeof audio.url === 'string' ? audio.url : null;
    if (!url) return null;
    let job = this.#voiceCache.get(url);
    if (!job) {
      job = (async () => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`voice ${res.status}`);
        return ctx.decodeAudioData(await res.arrayBuffer());
      })();
      job.catch(() => this.#voiceCache.delete(url));
      this.#voiceCache.set(url, job);
      if (this.#voiceCache.size > 8) this.#voiceCache.delete(this.#voiceCache.keys().next().value);
    }
    let timer = 0;
    try {
      return await Promise.race([job, new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('voice timeout')), 4000); })]);
    } finally {
      clearTimeout(timer);
    }
  }

  // Plays a recorded voice for the whole text. Each sentence gets its own mouth
  // timeline, anchored to the recording's word times, and the jaw also follows
  // the real loudness. Returns false (nothing played) if the audio is unusable.
  async #playRecorded(run, { audio, text, starts }, sentences, onSentence) {
    const ctx = this.#ctx;
    if (!ctx || !this.#buses || ctx.state !== 'running') return false;
    let buffer = null;
    try {
      buffer = await this.#loadVoiceBuffer(audio);
    } catch (err) {
      console.warn('[audio] recorded voice unavailable, using TTS', err?.message ?? err);
    }
    if (!buffer || run.cancelled) return Boolean(run.cancelled);
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
      // Several recorded words on one original token ("$2bn" -> "two billion
      // dollars") step through that token's spoken words.
      const anchors = [];
      for (const w of mine) {
        let wi = wordAtChar(tl, w.char - a);
        const prev = anchors[anchors.length - 1];
        if (prev && wi <= prev.w && tl.words[prev.w + 1] && tl.words[prev.w + 1].ci === tl.words[prev.w].ci) wi = prev.w + 1;
        if (!prev || wi > prev.w) anchors.push({ at: w.t, w: wi });
      }
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
    // 120 ms lead: the music's duck is settled when the first word arrives.
    this.#voiceOn();
    const t0 = ctx.currentTime + 0.12;
    const perf0 = this.#heardAt(t0);
    const lv = audio.levels;
    const env = lv && Array.isArray(lv.values) && lv.values.length && Number(lv.rate) > 0 ? { rate: Number(lv.rate), values: lv.values, perf0 } : null;
    run.loud = { analyser, data: new Float32Array(analyser.fftSize), at: -1, value: 0, env };
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
        // onSentence fires as the sentence's first recorded word is HEARD (output
        // latency included): v2 planners use onSentence(0) as the speech start.
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

  // `paced`: no engine sets the pace (silent, murmur): keep half of the
  // profile's rate offset, so the timeline stays at a broadcast 150-170 wpm.
  #timeline(key, sentence, { paced = false } = {}) {
    const cfg = this.#config(key);
    const rate = paced ? 1 + (cfg.rate - 1) * 0.5 : cfg.rate;
    return buildTimeline(sentence, { lang: cfg.voice?.lang || cfg.lang || this.#lang.base, rate });
  }

  // No sound: the mouth follows the timeline on the wall clock (mute, or tts
  // with no system voice). `ms` squeezes it into the time left when a TTS
  // engine failed mid-sentence.
  async #saySilent(run, sentence, ms, tl = this.#timeline(run.key, sentence, { paced: true })) {
    const speed = ms ? Math.min(2, Math.max(0.5, tl.total / Math.max(250, ms))) : 1;
    const clock = new SpeechClock(tl, { speed, soft: false });
    clock.start(performance.now());
    run.setTimeline(tl, clock);
    await run.sleep(tl.total / clock.speed + 40);
  }

  // Learned TTS speed for a voice: its own, else the mean of the voices
  // learned so far (a new voice starts from the engine-wide pace).
  #speedFor(voiceKey) {
    const own = this.#speed.get(voiceKey);
    if (own) return own;
    if (!this.#speed.size) return 1;
    let sum = 0;
    for (const v of this.#speed.values()) sum += v;
    return sum / this.#speed.size;
  }

  async #sayTts(run, sentence) {
    const synth = this.#synth;
    const Utter = globalThis.SpeechSynthesisUtterance;
    if (!synth || !Utter || !this.ttsAvailable) return this.#saySilent(run, sentence);
    if (!run.reset) {
      // Fresh start for every speak(); the short wait avoids Chrome swallowing
      // an utterance queued right after cancel().
      run.reset = true;
      try {
        synth.cancel();
        if (synth.paused) synth.resume();
      } catch { /* ignore */ }
      await run.sleep(60);
      if (run.cancelled || this.mode !== 'tts') return undefined;
    }
    const cfg = this.#config(run.key);
    const tl = this.#timeline(run.key, sentence);
    const voiceKey = cfg.voice?.name ?? `slot:${run.key}`;
    const clock = new SpeechClock(tl, { speed: this.#speedFor(voiceKey), soft: true });
    run.setTimeline(tl, clock);
    const t0 = performance.now();
    this.#voiceOn();
    const how = await new Promise((resolve) => {
      let settled = false;
      let timeout = 0;
      let startTimer = 0;
      // The engine says what a newsreader would: "$2bn" as "two billion dollars".
      const u = new Utter(tl.spoken || sentence);
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
        // Word boundaries (offsets in the spoken text) re-synchronise the mouth.
        clock.anchorSpoken(Number(e.charIndex) || 0, performance.now());
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
      }, ((tl.spoken || sentence).length / 9 + 4) * 1000);
      try {
        synth.speak(u);
      } catch {
        finish('error');
      }
    });
    const end = performance.now();
    clock.end(end);
    if (how === 'end' && clock.started) this.#learnSpeed(voiceKey, tl, clock, end);
    run.clearTimeline();
    if (how === 'cancel' || run.cancelled) return undefined;
    const elapsed = end - t0;
    if (how === 'error' || (how === 'end' && elapsed < sentence.length * 22)) {
      // Engine failed or "finished" implausibly fast (no output device?): keep the show's pace.
      await this.#saySilent(run, sentence, (sentence.length / MUTE_CPS) * 1000 - elapsed, tl);
    }
    return undefined;
  }

  // The voice's real pace: from word boundaries when the engine sends them,
  // else from how long the sentence took; kept per voice across sessions so
  // voices without boundary events start right from the first sentence.
  #learnSpeed(voiceKey, tl, clock, end) {
    const prev = this.#speedFor(voiceKey);
    let next = prev;
    if (clock.boundaries >= 3) next = clock.speed;
    else {
      const took = end - clock.startR;
      if (took > 400) next = prev + (tl.total / took - prev) * 0.5;
    }
    if (!Number.isFinite(next)) return;
    this.#speed.set(voiceKey, Math.min(2, Math.max(0.5, next)));
    if (this.#speed.size > 64) this.#speed.delete(this.#speed.keys().next().value);
    try {
      globalThis.localStorage?.setItem(SPEED_KEY, JSON.stringify(Object.fromEntries(this.#speed)));
    } catch { /* storage blocked */ }
  }

  // The "blips" mode: a soft murmur from the same timeline as the lips.
  async #sayBlips(run, sentence) {
    const lead = 40;
    const cfg = this.#config(run.key);
    const tl = this.#timeline(run.key, sentence, { paced: true });
    const ctx = this.#ctx;
    let perf0 = performance.now() + lead;
    let silence = null;
    if (ctx && this.#buses && ctx.state === 'running') {
      try {
        const t0 = ctx.currentTime + lead / 1000;
        this.#voiceOn();
        silence = scheduleMurmur(ctx, this.#buses.speech, cfg.blip, tl, t0);
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

  // Inverse of #heardAt: the context time whose sound is heard at
  // performance.now() time `perf` (ms).
  #contextTimeHeardAt(perf) {
    const ctx = this.#ctx;
    const naive = ctx.currentTime + (perf - performance.now()) / 1000;
    let t = naive - ((Number(ctx.outputLatency) || 0) + (Number(ctx.baseLatency) || 0));
    try {
      const ts = ctx.getOutputTimestamp?.();
      if (ts && ts.performanceTime > 0 && ts.contextTime > 0) {
        const v = ts.contextTime + (perf - ts.performanceTime) / 1000;
        if (v <= naive + 0.005 && v >= naive - 0.4) t = v;
      }
    } catch { /* ignore */ }
    return t;
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
      this.#ducker = new Ducker();
      this.#buses = buildBuses(ctx, { volume: this.#volume, ducker: this.#ducker, bedsDb: this.#musicDuckDb });
      this.#applyMute();
      ctx.addEventListener?.('statechange', () => this.#onState());
    } catch {
      this.#ctx = null;
      this.#buses = null;
      this.#ducker = null;
    }
    return this.#ctx;
  }

  // Build the expensive one-off tables (noise, room, wave tables, the speech
  // normaliser, the loudness model of the opens) in idle slices right after
  // unlock, one per tick, so nothing is computed during the first open.
  #warm(ctx) {
    if (this.#warmed) return;
    this.#warmed = true;
    const langs = [...new Set([this.#lang.pref[0] ?? this.#lang.base, 'en-GB', 'en-US'])];
    const jobs = [
      () => bank(ctx),
      ...WAVE_KINDS.map((k) => () => bank(ctx).wave(k)),
      ...langs.map((lang) => () => buildTimeline('Good evening, the IMF lent $2bn at 14:30.', { lang })),
      ...THEME_IDS.map((id) => () => estimateLoudness(asSong(themeFor(id)))),
      ...['ident', 'stinger', 'breaking', 'outro', 'promo'].map((n) => () => estimateLoudness(asSong(cueFor(n)))),
    ];
    const idle = globalThis.requestIdleCallback ? (fn) => globalThis.requestIdleCallback(fn, { timeout: 400 }) : (fn) => setTimeout(fn, 16);
    const step = () => {
      const job = jobs.shift();
      if (!job) return;
      try {
        job();
      } catch { /* warming is best effort */ }
      idle(step);
    };
    idle(step);
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

  // ------------------------------------------------------------------ tunes

  /**
   * Plays a tune (classic or rich format, see tune.js) on the tunes bus,
   * levelled to the channel's level plan (loudness.js); `volume` 0.5 is the
   * reference, at most +1 dB above it. opts: { loop, volume, duckDb (dB under
   * a voice; default -18, -14 when looping, or the tune's own `duck`),
   * startAt (performance.now() ms at which beat 0 should be HEARD: output
   * latency is compensated, and a start already in the past skips in so the
   * tune stays on the picture's clock) }. Returns { stop(), song } and never
   * throws. If the context is still locked, a looping tune starts as soon as
   * it unlocks.
   */
  playTune(tune, opts = {}) {
    const none = { stop() {}, song: null };
    try {
      const ctx = this.#ensureContext();
      const song = asSong(tune);
      if (!ctx || !this.#buses || !song) return none;
      const loop = Boolean(opts?.loop);
      const volume = Number.isFinite(Number(opts?.volume)) ? Number(opts.volume) : 0.5;
      const startAt = opts?.startAt != null && Number.isFinite(Number(opts.startAt)) ? Number(opts.startAt) : null;
      let player = null;
      let stopped = false;
      const asked = performance.now();
      const begin = () => {
        this.#pending.delete(begin);
        if (stopped) return;
        const now = performance.now();
        // A one-shot that could not start in time would land out of sync:
        // skip it (a synced one may skip in while most of it is still ahead).
        if (!loop) {
          if (startAt === null && now - asked > 400) return;
          if (startAt !== null && now - startAt > Math.max(400, (60 / song.bpm) * song.beats * 1000 - 600)) return;
        }
        player = new TunePlayer(ctx, this.#buses, song, { volume, loop, duckDb: opts?.duckDb });
        const t0 = startAt !== null ? this.#contextTimeHeardAt(startAt) : ctx.currentTime + 0.05;
        player.start(t0);
        player.scheduleUntil(ctx.currentTime + LOOKAHEAD);
        if (!loop) player.endAt = t0 + player.passSec + 1.2;
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
        // Ask to resume inside a user gesture (anything else is refused with a
        // console warning; the armed gesture listener resumes later), or at
        // most every 10 s - an OBS source has no gestures but may autoplay.
        const activation = globalThis.navigator?.userActivation;
        const now = performance.now();
        if (!activation || activation.isActive || now - this.#lastResume > 10000) {
          this.#lastResume = now;
          Promise.resolve(ctx.resume()).catch(() => {});
        }
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

  // UI blip: a short soft rising tone.
  #blip() {
    const ctx = this.#ctx;
    if (!ctx || !this.#buses || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.01;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(660, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.05);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.006);
    g.gain.linearRampToValueAtTime(0, t + 0.07);
    osc.connect(g).connect(this.#buses.tunes);
    osc.start(t);
    osc.stop(t + 0.08);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }
}
