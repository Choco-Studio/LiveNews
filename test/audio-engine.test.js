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
    this.outputLatency = 0.02;
    this.baseLatency = 0.01;
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
}
afterEach(uninstall);

const { AudioEngine, splitSentences, cueFor } = await import('../public/js/audio.js');

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
      assert.ok(took > 800 && took < 5000, `${behaviour}: ${took} ms`);
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
    // The beds bus duck: down to -20 dB (attack tau 40 ms), back up 0.7 s after the end.
    const duck = e.context.nodes.filter((n) => n.kind === 'gain').map((n) => n.gain.events).find((ev) => ev.some(([k, v]) => k === 'target' && Math.abs(v - 0.1) < 1e-3));
    assert.ok(duck, 'a -20 dB duck target');
    const down = duck.find(([k, v]) => k === 'target' && Math.abs(v - 0.1) < 1e-3);
    const up = duck.filter(([k, v]) => k === 'target' && v === 1).at(-1);
    assert.equal(down[3], 0.04);
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

describe('splitSentences', () => {
  test('keeps abbreviations, numbers and initials inside sentences', () => {
    assert.deepEqual(splitSentences('Dr. Smith met U.S. officials. Prices rose 6.1% today. No. 5 is next.'), [
      'Dr. Smith met U.S. officials.', 'Prices rose 6.1% today.', 'No. 5 is next.',
    ]);
    assert.deepEqual(splitSentences(''), []);
  });
});
