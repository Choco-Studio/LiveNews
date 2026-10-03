import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// The AudioEngine (public/js/audio.js) end to end in Node, with a fake
// speechSynthesis and a fake AudioContext that records what the engine asks
// of WebAudio (no sound is made). The pure modules it builds on are tested in
// test/visemes.test.js; levels and spectra are measured in public/lab/audio.html.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------- fake WebAudio

class Param {
  constructor(value = 0) {
    this.value = value;
    this.events = [];
  }
  setValueAtTime(v, t) { this.events.push(['set', v, t]); this.value = v; return this; }
  linearRampToValueAtTime(v, t) { this.events.push(['linear', v, t]); return this; }
  exponentialRampToValueAtTime(v, t) { this.events.push(['exp', v, t]); return this; }
  setTargetAtTime(v, t, tau) { this.events.push(['target', v, t, tau]); return this; }
  cancelScheduledValues(t) { this.events.push(['cancel', t]); return this; }
}
const PARAMS = new Set(['gain', 'frequency', 'detune', 'Q', 'pan', 'delayTime', 'playbackRate', 'offset', 'threshold', 'knee', 'ratio', 'attack', 'release']);
const DEFAULTS = { gain: 1, frequency: 440, Q: 1, playbackRate: 1, offset: 1 };

function fakeNode(ctx, kind) {
  const params = {};
  const base = {
    kind,
    started: false,
    connect(x) { return x; },
    disconnect() {},
    start(when) { this.startedAt = when ?? ctx.currentTime; ctx.started.push(this); },
    stop() {},
    setPeriodicWave() {},
    getFloatTimeDomainData(a) { a.fill(0.05); },
    onended: null,
    buffer: null,
    fftSize: 2048,
  };
  return new Proxy(base, {
    get(t, k) {
      if (k in t) return t[k];
      if (PARAMS.has(k)) return (params[k] ??= new Param(DEFAULTS[k] ?? 0));
      return undefined;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

class FakeContext {
  constructor() {
    this.t0 = performance.now();
    this.sampleRate = 48000;
    this.state = FakeContext.initialState;
    this.outputLatency = FakeContext.outputLatency ?? 0.02;
    this.baseLatency = FakeContext.baseLatency ?? 0.01;
    this.counts = {};
    this.started = [];
    this.resumes = 0;
    this.destination = fakeNode(this, 'destination');
    FakeContext.last = this;
  }
  get currentTime() { return (performance.now() - this.t0) / 1000; }
  make(kind) {
    this.counts[kind] = (this.counts[kind] ?? 0) + 1;
    const n = fakeNode(this, kind);
    (this.nodes ??= []).push(n);
    return n;
  }
  createGain() { return this.make('gain'); }
  createOscillator() { return this.make('osc'); }
  createBiquadFilter() { return this.make('filter'); }
  createDynamicsCompressor() { return this.make('comp'); }
  createWaveShaper() { return this.make('shaper'); }
  createConvolver() { return this.make('convolver'); }
  createStereoPanner() { return this.make('panner'); }
  createDelay() { return this.make('delay'); }
  createConstantSource() { return this.make('constant'); }
  createBufferSource() { return this.make('bufferSource'); }
  createAnalyser() { return this.make('analyser'); }
  createPeriodicWave() { return {}; }
  createBuffer(ch, n, sr) {
    const data = Array.from({ length: ch }, () => new Float32Array(n));
    return { numberOfChannels: ch, length: n, sampleRate: sr, duration: n / sr, getChannelData: (i) => data[i] };
  }
  // Like a browser without an autoplay flag: resume() only works inside a gesture.
  resume() {
    this.resumes++;
    const activation = globalThis.navigator?.userActivation;
    if (activation && !activation.isActive) return Promise.resolve();
    this.state = 'running';
    this.onstate?.();
    return Promise.resolve();
  }
  addEventListener(type, fn) { if (type === 'statechange') this.onstate = fn; }
  getOutputTimestamp() { return { contextTime: this.currentTime - this.outputLatency, performanceTime: performance.now() }; }
}
FakeContext.initialState = 'running';

// ------------------------------------------------------- fake speechSynthesis

function installTts({ voices = true, behaviour = 'normal', cps = 40, boundaries = true } = {}) {
  const log = { spoken: [], cancels: 0 };
  class Utterance { constructor(text) { this.text = text; } }
  const list = voices ? [
    { name: 'Microsoft Ryan Online (Natural) - English (United Kingdom)', lang: 'en-GB', localService: false },
    { name: 'Microsoft Jenny Online (Natural) - English (United States)', lang: 'en-US', localService: false },
  ] : [];
  let timers = [];
  const synth = {
    speaking: false, pending: false, paused: false,
    getVoices: () => list,
    addEventListener() {}, removeEventListener() {},
    cancel() { log.cancels++; timers.forEach(clearTimeout); timers = []; this.speaking = false; },
    resume() { this.paused = false; },
    speak(u) {
      log.spoken.push(u.text);
      this.speaking = true;
      if (behaviour === 'error') { timers.push(setTimeout(() => u.onerror?.({}), 10)); return; }
      if (behaviour === 'instant') { timers.push(setTimeout(() => { u.onstart?.(); u.onend?.(); }, 5)); return; }
      timers.push(setTimeout(() => u.onstart?.(), 20));
      if (boundaries) for (const m of u.text.matchAll(/\S+/g)) timers.push(setTimeout(() => u.onboundary?.({ name: 'word', charIndex: m.index }), 20 + (m.index / cps) * 1000));
      if (behaviour !== 'noend') timers.push(setTimeout(() => { this.speaking = false; u.onend?.(); }, 40 + (u.text.length / cps) * 1000));
    },
  };
  globalThis.speechSynthesis = synth;
  globalThis.SpeechSynthesisUtterance = Utterance;
  return log;
}

function uninstall() {
  delete globalThis.speechSynthesis;
  delete globalThis.SpeechSynthesisUtterance;
  delete globalThis.AudioContext;
  delete globalThis.window;
  delete globalThis.localStorage;
  if (globalThis.navigator && Object.getOwnPropertyDescriptor(globalThis.navigator, 'userActivation')) delete globalThis.navigator.userActivation;
  FakeContext.initialState = 'running';
  FakeContext.outputLatency = undefined;
  FakeContext.baseLatency = undefined;
}
afterEach(uninstall);

const { AudioEngine, splitSentences, cueFor } = await import('../public/js/audio.js');
const { DUCK } = await import('../public/js/audio/synth.js');

// Oscillators the engine started after index `from`, with the first frequency each was given.
// (Vibrato LFOs get no frequency event and are left out.)
const oscFrom = (ctx, from) => ctx.started.slice(from).filter((n) => n.kind === 'osc').map((n) => ({ at: n.startedAt, hz: n.frequency.events.find(([k]) => k === 'set')?.[1] })).filter((o) => o.hz !== undefined);
const midiOf = (hz) => Math.round(69 + 12 * Math.log2(hz / 440));

// Sample the mouth every 10 ms while `promise` runs.
async function sampleWhile(engine, promise, slot) {
  const frames = [];
  let done = false;
  promise.then(() => (done = true));
  while (!done) {
    frames.push(engine.speechFrame(performance.now(), slot));
    await sleep(10);
  }
  return frames;
}

// ------------------------------------------------------------------- tests

describe('AudioEngine: modes', () => {
  test('every mode once in V-key order; the label says when tts has no system voice', () => {
    const e = new AudioEngine();
    assert.deepEqual(e.modes, ['tts', 'blips', 'mute']);
    assert.equal(e.mode, 'tts');
    assert.match(e.modeLabel, /no system voices/);
    e.setMode('blips');
    assert.equal(e.mode, 'blips');
    assert.match(e.modeLabel, /murmur/);
    e.setMode('nonsense');
    assert.equal(e.mode, 'blips');
  });

  test('tts without any voice speaks silently: captions and lips, never beeps', async () => {
    installTts({ voices: false });
    const e = new AudioEngine();
    const said = [];
    const frames = await sampleWhile(e, e.speak('Good evening. Markets fell.', 'A', { onSentence: (s) => said.push(s) }), 'A');
    assert.deepEqual(said, ['Good evening.', 'Markets fell.']);
    assert.ok(frames.some((f) => f.speaking && f.level > 0.2), 'the lips move');
    assert.equal(e.voiced, false, 'nothing audible, nothing ducked');
  });

  test('mute still moves the lips', async () => {
    const e = new AudioEngine();
    e.setMode('mute');
    const frames = await sampleWhile(e, e.speak('Lips move in mute mode.', 'B'), 'B');
    assert.ok(frames.filter((f) => f.speaking).length > 5);
    assert.ok(Math.max(...frames.map((f) => f.level)) > 0.3);
  });
});

describe('AudioEngine: speaking with browser TTS', () => {
  test('the engine is given what a newsreader says, and the mouth stays in original units', async () => {
    const log = installTts({ cps: 60 });
    const e = new AudioEngine();
    const text = 'The IMF lent $2bn at 14:30.';
    const frames = await sampleWhile(e, e.speak(text, 'A'), 'A');
    assert.match(log.spoken.join(' '), /two billion dollars/);
    assert.match(log.spoken.join(' '), /I-M-F/);
    const chars = frames.filter((f) => f.speaking).map((f) => f.charIndex);
    assert.ok(chars.length > 3 && Math.max(...chars) < text.length, `charIndex within the original text: ${Math.max(...chars)}`);
    for (let i = 1; i < chars.length; i++) assert.ok(chars[i] >= chars[i - 1], 'charIndex only moves forward');
  });

  test('a failing or instant engine still keeps the show\'s pace', async () => {
    for (const behaviour of ['error', 'instant']) {
      installTts({ behaviour });
      const e = new AudioEngine();
      const t0 = performance.now();
      await e.speak('Hello there, this keeps pace.', 'A');
      const took = performance.now() - t0;
      // The sentence is squeezed into the show's pace (15 chars/s) from when the engine gave up.
      const pace = ('Hello there, this keeps pace.'.length / 15) * 1000;
      assert.ok(took > pace * 0.9 && took < pace * 1.25, `${behaviour}: ${took.toFixed(0)} ms (pace ${pace.toFixed(0)})`);
      uninstall();
    }
  });

  test('a new speak() interrupts the old one, whose promise resolves', async () => {
    installTts({ cps: 20 });
    const e = new AudioEngine();
    let first = false;
    e.speak('This is a long sentence that will be cut short by the next one.', 'A').then(() => (first = true));
    await sleep(150);
    const second = e.speak('Short.', 'B');
    await sleep(30);
    assert.equal(first, true);
    await second;
  });

  test('stop() closes the mouth smoothly over ~130 ms', async () => {
    const e = new AudioEngine();
    e.setMode('mute');
    const p = e.speak('Paco Pixel brings you the very latest from around the world tonight.', 'A');
    let f = e.speechFrame(performance.now(), 'A');
    for (let i = 0; i < 100 && f.level < 0.3; i++) {
      await sleep(5);
      f = e.speechFrame(performance.now(), 'A');
    }
    assert.ok(f.level >= 0.3);
    const at = performance.now();
    e.stop();
    await p;
    const mid = e.speechFrame(at + 40, 'A');
    const end = e.speechFrame(at + 140, 'A');
    assert.ok(mid.level > 0 && mid.level < f.level, `release ${mid.level}`);
    assert.equal(end.level, 0);
  });

  test('marks fire on their words, in order; marks after the last word fire at the end', async () => {
    const e = new AudioEngine();
    e.setMode('mute');
    const text = 'First we wave. Then we point at the screen.';
    const fired = [];
    const t0 = performance.now();
    await e.speak(text, 'A', { marks: [text.indexOf('point'), 0, text.length + 5], onMark: (i) => fired.push([i, performance.now() - t0]) });
    assert.deepEqual(fired.map(([i]) => i), [1, 0, 2]);
    assert.ok(fired[1][1] > fired[0][1] + 500, 'the "point" cue waits for its word');
  });

  test('speechFrame fills a given object, and survives junk input', () => {
    const e = new AudioEngine();
    const out = {};
    assert.equal(e.speechFrame(performance.now(), 'A', out), out);
    assert.equal(out.viseme, 'rest');
    const f = e.speechFrame(NaN, 'A');
    assert.equal(f.level, 0);
  });

  test('the learned TTS pace is kept per voice across sessions', async () => {
    const store = new Map();
    globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
    installTts({ cps: 12, boundaries: false });
    const e = new AudioEngine();
    await e.speak('A sentence long enough to learn the pace from.', 'A');
    const saved = JSON.parse(store.get('globit24.ttsSpeed'));
    assert.ok(Object.keys(saved).some((k) => /Ryan|Jenny/.test(k)), Object.keys(saved).join(','));
  });
});

describe('AudioEngine: mixer', () => {
  test('a voice ducks the music, and the duck is held 0.7 s after the last word', async () => {
    globalThis.AudioContext = FakeContext;
    const e = new AudioEngine();
    await e.unlock();
    e.setMode('blips');
    const p = e.speak('Short line.', 'A');
    await sleep(80);
    assert.equal(e.voiced, true);
    await p;
    const end = e.context.currentTime;
    assert.equal(e.voiced, false, 'released after the run');
    // The beds bus duck: down to -20 dB (attack tau DUCK.attack), back up 0.7 s after the end.
    const duck = e.context.nodes.filter((n) => n.kind === 'gain').map((n) => n.gain.events).find((ev) => ev.some(([k, v]) => k === 'target' && Math.abs(v - 0.1) < 1e-3));
    assert.ok(duck, 'a -20 dB duck target');
    const down = duck.find(([k, v]) => k === 'target' && Math.abs(v - 0.1) < 1e-3);
    const up = duck.filter(([k, v]) => k === 'target' && v === 1).at(-1);
    assert.equal(down[3], DUCK.attack);
    assert.ok(DUCK.attack <= 0.03, 'settled (~3 tau) before the first syllable, 120 ms after the duck starts');
    assert.ok(Math.abs(up[2] - (end + 0.7)) < 0.08, `release at ${up[2]} (end ${end})`);
  });

  test('musicDuckDb retargets the bed duck', async () => {
    globalThis.AudioContext = FakeContext;
    const e = new AudioEngine();
    await e.unlock();
    assert.equal(e.musicDuckDb, -20);
    e.musicDuckDb = -12;
    assert.equal(e.musicDuckDb, -12);
    e.musicDuckDb = 'x';
    assert.equal(e.musicDuckDb, -12);
  });

  test('playTune with startAt in the past skips in and keeps the picture clock', async () => {
    globalThis.AudioContext = FakeContext;
    const e = new AudioEngine();
    await e.unlock();
    const ctx = e.context;
    const before = ctx.started.length;
    const handle = e.playTune(cueFor('promo', 'world-now'), { startAt: performance.now() - 300 });
    try {
      assert.ok(handle.song);
      const starts = ctx.started.slice(before).map((n) => n.startedAt).filter(Number.isFinite);
      assert.ok(starts.length > 0);
      assert.ok(Math.min(...starts) >= ctx.currentTime - 0.01, 'nothing scheduled in the past');
    } finally {
      handle.stop();
    }
  });

  test('mute keeps an ad\'s looping music alive: it is back after unmuting', async () => {
    globalThis.AudioContext = FakeContext;
    const e = new AudioEngine();
    await e.unlock();
    const ctx = e.context;
    const handle = e.playTune({ bpm: 240, notes: 'C4:1 E4:1 G4:1 C5:1' }, { loop: true });
    try {
      e.setMode('mute');
      await sleep(150);
      e.setMode('tts');
      const n = ctx.counts.osc;
      await sleep(1200);
      assert.ok(ctx.counts.osc > n, 'still scheduling notes after unmute');
    } finally {
      handle.stop();
    }
  });

  test('autostart: no resume() storm before a gesture; the first gesture starts the music', async () => {
    globalThis.AudioContext = FakeContext;
    FakeContext.initialState = 'suspended';
    globalThis.window = new EventTarget();
    Object.defineProperty(globalThis.navigator, 'userActivation', { value: { isActive: false, hasBeenActive: false }, configurable: true });
    const e = new AudioEngine();
    await e.unlock();
    const ctx = e.context;
    assert.equal(ctx.state, 'suspended');
    const resumesAtUnlock = ctx.resumes;
    const handles = [0, 1, 2].map(() => e.playTune({ bpm: 120, notes: 'C4:1 D4:1' }, { loop: true }));
    e.sfx('stinger');
    try {
      assert.equal(ctx.resumes, resumesAtUnlock, 'no resume() per tune outside a gesture (each one is a console warning)');
      assert.equal(ctx.counts.osc ?? 0, 0, 'nothing plays while locked');
      globalThis.navigator.userActivation.isActive = true;
      globalThis.navigator.userActivation.hasBeenActive = true;
      globalThis.window.dispatchEvent(new Event('pointerdown'));
      await sleep(50);
      assert.equal(ctx.state, 'running');
      assert.ok((ctx.counts.osc ?? 0) > 0, 'the pending loops started on the first gesture');
    } finally {
      handles.forEach((h) => h.stop());
    }
  });

  test('a recorded voice that cannot load falls back to speech', async () => {
    globalThis.AudioContext = FakeContext;
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: false, status: 404 });
    try {
      const e = new AudioEngine();
      await e.unlock();
      e.setMode('mute');
      const said = [];
      await e.speak('Fallback works. Second sentence.', 'A', { audio: { url: '/nope.wav', words: [] }, onSentence: (s) => said.push(s) });
      assert.deepEqual(said, ['Fallback works.', 'Second sentence.']);
      assert.equal(await e.preload('/nope.wav'), false);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test('a recorded voice buffer plays with subtitles at its word times', async () => {
    globalThis.AudioContext = FakeContext;
    const e = new AudioEngine();
    await e.unlock();
    const text = 'Good evening. Markets fell.';
    const buffer = e.context.createBuffer(1, 48000 * 2, 48000);
    const subs = [];
    const t0 = performance.now();
    const words = [{ t: 0.1, char: 0 }, { t: 0.4, char: 5 }, { t: 1.0, char: 14 }, { t: 1.3, char: 22 }];
    const run = e.speak(text, 'A', { audio: { buffer, words }, onSentence: (s, i) => subs.push([i, performance.now() - t0]) });
    // The fake buffer never ends by itself: stop after the second subtitle.
    await sleep(1400);
    e.stop();
    await run;
    assert.deepEqual(subs.map(([i]) => i), [0, 1]);
    // Word at 1.0 s + 0.12 s scheduling lead + 0.03 s output latency: onSentence fires as it is heard.
    assert.ok(subs[1][1] > 1050 && subs[1][1] < 1300, `second sentence at ${subs[1][1]} ms`);
  });
});

describe('AudioEngine: sync, lateness and robustness', () => {
  test('blips: the music starts ducking 120 ms before the first syllable is heard', async () => {
    globalThis.AudioContext = FakeContext;
    const e = new AudioEngine();
    await e.unlock();
    e.setMode('blips');
    const ctx = e.context;
    const from = ctx.started.length;
    const p = e.speak('Good evening.', 'A');
    await sleep(20);
    const duck = ctx.nodes.filter((n) => n.kind === 'gain').flatMap((n) => n.gain.events).find(([k, v]) => k === 'target' && Math.abs(v - 0.1) < 1e-3);
    const voice = oscFrom(ctx, from)[0];
    e.stop();
    await p;
    assert.ok(duck && voice, 'a duck and a murmur');
    assert.ok(voice.at + 0.01 - duck[2] >= 0.11, `first sound ${((voice.at + 0.01 - duck[2]) * 1000).toFixed(0)} ms after the duck starts`);
  });

  test('a cue asked for "now" with 95 ms of output latency plays its beat 0 at once, whole', async () => {
    globalThis.AudioContext = FakeContext;
    FakeContext.outputLatency = 0.095;
    FakeContext.baseLatency = 0;
    const e = new AudioEngine();
    await e.unlock();
    const ctx = e.context;
    // Warm the cues' parse and loudness caches first (a cold start is not what is measured).
    e.sfx('stinger', { startAt: performance.now() });
    e.sfx('outro', { programId: 'money-minute', startAt: performance.now() });
    e.stopAll();
    // The stinger: an air swell on beat 0 (a noise source) into a felt thump on beat 1, heard on the cut.
    let from = ctx.started.length;
    let now = ctx.currentTime;
    e.sfx('stinger', { startAt: performance.now() });
    const swell = ctx.started.slice(from).filter((n) => n.kind === 'bufferSource');
    assert.ok(swell.length >= 1, 'the swell is not dropped');
    assert.ok(swell[0].startedAt >= now && swell[0].startedAt - now < 0.15, `swell at +${((swell[0].startedAt - now) * 1000).toFixed(0)} ms`);
    const thump = oscFrom(ctx, from).find((o) => Math.abs(o.hz - 86) < 0.5);
    assert.ok(thump, 'the thump is scheduled');
    // Beat 0 sounds 6 ms after the cue is scheduled; beat 1 (150 BPM: 0.4 s) stays on
    // the clock of a beat 0 that would be heard on the call, 95 ms earlier.
    const gap = thump.at - swell[0].startedAt;
    assert.ok(Math.abs(gap - (0.4 - 0.095 - 0.006)) < 0.03, `swell -> thump ${(gap * 1000).toFixed(0)} ms`);
    // MONEY MINUTE's sign-off: its button (a felt thump) is ON beat 0; the motif starts on beat 1.
    from = ctx.started.length;
    now = ctx.currentTime;
    e.sfx('outro', { programId: 'money-minute', startAt: performance.now() });
    const outro = oscFrom(ctx, from);
    const button = outro.find((o) => Math.abs(o.hz - 86) < 0.5);
    assert.ok(button && button.at >= now && button.at - now < 0.15, 'the beat-0 button is not dropped');
    const lead = outro.filter((o) => o.at > button.at + 0.2).sort((x, y) => x.at - y.at)[0];
    assert.ok(lead && Math.abs(lead.at - button.at - (60 / 114 - 0.095 - 0.006)) < 0.03, `button -> beat 1 ${lead && ((lead.at - button.at) * 1000).toFixed(0)} ms`);
    e.stopAll();
  });

  test('a tune started 0.5 s late still sounds its first long chord (an ad bed after a late timer)', async () => {
    globalThis.AudioContext = FakeContext;
    const e = new AudioEngine();
    await e.unlock();
    const ctx = e.context;
    const from = ctx.started.length;
    const now = ctx.currentTime;
    const h = e.playTune({ bpm: 60, tracks: [{ kind: 'harmony', inst: 'pad', notes: 'C4+E4+G4:4 R:4' }] }, { loop: true, startAt: performance.now() - 500 });
    try {
      const chord = oscFrom(ctx, from).filter((o) => o.at - now < 0.03).map((o) => midiOf(o.hz)).sort();
      assert.deepEqual(chord, [60, 64, 67], 'the held chord plays its remainder at once');
    } finally {
      h.stop();
    }
  });

  test('while locked, waiting tunes are capped (newest kept) and expired one-shots are dropped', async () => {
    globalThis.AudioContext = FakeContext;
    FakeContext.initialState = 'suspended';
    globalThis.window = new EventTarget();
    Object.defineProperty(globalThis.navigator, 'userActivation', { value: { isActive: false, hasBeenActive: false }, configurable: true });
    const tune = (n) => ({ bpm: 120, tracks: [{ kind: 'lead', inst: 'sine', notes: `${n}:1` }] });
    // (1) A one-shot whose moment has passed is dropped; the loops asked later still start.
    const e1 = new AudioEngine();
    await e1.unlock();
    const shot = e1.playTune(tune('C6'));
    await sleep(450);
    const keep = [e1.playTune(tune('E3'), { loop: true }), e1.playTune(tune('G3'), { loop: true })];
    // (2) At most 8 tunes wait; the newest win.
    const e2 = new AudioEngine();
    await e2.unlock();
    const names = ['C3', 'C#3', 'D3', 'Eb3', 'E3', 'F3', 'F#3', 'G3', 'Ab3', 'A3', 'Bb3', 'B3'];
    const handles = names.map((n) => e2.playTune(tune(n), { loop: true }));
    try {
      globalThis.navigator.userActivation.isActive = true;
      globalThis.navigator.userActivation.hasBeenActive = true;
      globalThis.window.dispatchEvent(new Event('pointerdown'));
      await sleep(50);
      assert.equal(e1.context.state, 'running');
      const played1 = new Set(oscFrom(e1.context, 0).map((o) => midiOf(o.hz)));
      assert.ok(!played1.has(84), 'the late one-shot was dropped');
      assert.ok(played1.has(52) && played1.has(55), 'the loops started');
      const played2 = new Set(oscFrom(e2.context, 0).map((o) => midiOf(o.hz)));
      const loops = names.map((n, i) => 48 + i).filter((m) => played2.has(m));
      assert.deepEqual(loops, [52, 53, 54, 55, 56, 57, 58, 59], 'the newest 8 loops start');
    } finally {
      [...handles, ...keep, shot].forEach((h) => h.stop());
    }
  });

  test('speechFrame().voice follows a recorded clip, and is -1 without one', async () => {
    globalThis.AudioContext = FakeContext;
    const e = new AudioEngine();
    await e.unlock();
    assert.equal(e.speechFrame(performance.now(), 'A').voice, -1);
    const text = 'Good evening. Markets fell.';
    const buffer = e.context.createBuffer(1, 48000 * 2, 48000);
    const words = [{ t: 0.1, char: 0 }, { t: 0.4, char: 5 }, { t: 1.0, char: 14 }, { t: 1.3, char: 22 }];
    const levels = { rate: 100, values: Array.from({ length: 200 }, (_, i) => (i > 60 && i < 90 ? 0 : 0.9)) };
    const run = e.speak(text, 'A', { audio: { buffer, words, levels } });
    const seen = [];
    for (let i = 0; i < 60; i++) {
      await sleep(20);
      seen.push(e.speechFrame(performance.now(), 'A').voice);
    }
    e.stop();
    await run;
    assert.ok(seen.some((v) => v > 0.6), 'loud while the clip speaks');
    assert.ok(seen.every((v) => v === -1 || (v >= 0 && v <= 1)), 'a loudness 0..1 (or -1)');
    assert.ok(seen.some((v, i) => i > 0 && v >= 0 && v < seen[i - 1] - 0.05), 'it falls in the clip\'s quiet stretch');
    assert.equal(e.speechFrame(performance.now(), 'A').voice, -1, 'no clip, no voice');
    e.setMode('mute');
    const p = e.speak('Muted words.', 'A');
    await sleep(80);
    assert.equal(e.speechFrame(performance.now(), 'A').voice, -1, 'mute has no recording');
    e.stop();
    await p;
  });

  test('fuzz: random calls never throw, every speak() settles, and the engine ends quiet', async () => {
    globalThis.AudioContext = FakeContext;
    installTts({ cps: 80 });
    const e = new AudioEngine();
    await e.unlock();
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const junk = [undefined, null, NaN, -1, 1e9, '', 'x', {}, [], 'A', 'B', 'ad'];
    const runs = [];
    const handles = [];
    for (let i = 0; i < 160; i++) {
      const op = Math.floor(rnd() * 9);
      if (op === 0) runs.push(e.speak(pick(['Hello there.', 'One. Two? Three!', '', '$2bn at 14:30.', null]), pick(junk), { marks: [0, 5, 'x'], onMark() {} }));
      else if (op === 1) e.stop();
      else if (op === 2) e.setMode(pick(['tts', 'blips', 'mute', 'bogus']));
      else if (op === 3) handles.push(e.playTune(pick([{ bpm: 200, notes: 'C4:1 E4:1' }, null, 'junk', { tracks: 'x' }, cueFor('ident')]), { loop: rnd() < 0.3, startAt: pick([undefined, performance.now() - 200, NaN]) }));
      else if (op === 4) e.sfx(pick(['stinger', 'jingle', 'breaking', 'nope', 'blip', 'promo']), { programId: pick(junk), startAt: pick(junk) });
      else if (op === 5) e.speechFrame(pick(junk), pick(junk), pick([undefined, {}, null]), pick([undefined, { calm: true }]));
      else if (op === 6) e.volume = pick(junk);
      else if (op === 7) e.setVoices(pick([null, { A: { gender: 'robot' } }, 'x', { B: null }]));
      else e.musicDuckDb = pick(junk);
      if (i % 20 === 0) await sleep(5);
    }
    e.stopAll();
    handles.forEach((h) => h?.stop?.());
    const settled = await Promise.race([Promise.all(runs).then(() => true), sleep(4000).then(() => false)]);
    assert.equal(settled, true, 'every speak() promise settled');
    await sleep(20);
    assert.equal(e.speaking, false);
  });
});

describe('splitSentences', () => {
  test('keeps abbreviations, numbers and initials inside sentences', () => {
    assert.deepEqual(splitSentences('Dr. Smith met U.S. officials. Prices rose 6.1% today. No. 5 is next.'), [
      'Dr. Smith met U.S. officials.', 'Prices rose 6.1% today.', 'No. 5 is next.',
    ]);
    assert.deepEqual(splitSentences(''), []);
  });
});
