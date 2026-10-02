// Client side of the recorded voices: public/js/voice/player.js (which clip
// the director hands to AudioEngine.speak, late clips looked up by voiceId,
// advert voice-overs, the ?voices=browser override, preloading) and the
// AudioEngine hook that drives the jaw from the clip's loudness envelope.
import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { VoicePlayer, validAudio, levelAt, wordAt, forcedBrowser } from '../public/js/voice/player.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const URL1 = '/api/voice/v0123456789abcdef0123.ogg';
const URL2 = '/api/voice/vaaaaaaaaaaaaaaaaaaaa.ogg';
const clip = (url = URL1, extra = {}) => ({ url, duration: 2.5, words: [{ t: 0.4, char: 5, len: 4 }, { t: 0.05, char: 0, len: 4 }], phrases: [{ t: 0.05, dur: 2.3, char: 0, len: 20 }], levels: { rate: 50, values: [0, 0.5, 1] }, ...extra });

function fakeAudio() {
  return { preloads: [], preload(url) { this.preloads.push(url); return Promise.resolve(true); } };
}

function fakeFetch(routes) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    const r = routes[url];
    if (r === 'hang') return new Promise(() => {});
    if (!r) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => r };
  };
  fn.calls = calls;
  return fn;
}

describe('validAudio', () => {
  test('keeps a same-origin clip, sorts words by time, keeps levels and phrases', () => {
    const a = validAudio(clip());
    assert.equal(a.url, URL1);
    assert.equal(a.duration, 2.5);
    assert.deepEqual(a.words.map((w) => w.t), [0.05, 0.4]);
    assert.deepEqual(a.levels, { rate: 50, values: [0, 0.5, 1] });
    assert.equal(a.phrases.length, 1);
  });

  test('refuses foreign urls, junk durations and missing data; drops bad words and levels', () => {
    for (const bad of [null, 'x', {}, { url: 'https://evil.test/x.ogg', duration: 1 }, { url: '/api/voice/../x.ogg', duration: 1 }, clip(URL1, { duration: 0 }), clip(URL1, { duration: NaN }), clip(URL1, { duration: 1e6 })]) {
      assert.equal(validAudio(bad), null, JSON.stringify(bad));
    }
    const a = validAudio(clip(URL1, { words: [{ t: 'x', char: 1 }, { t: 1, char: -1 }, { t: 0.2, char: 3 }, null], levels: { rate: 0, values: [1] } }));
    assert.deepEqual(a.words, [{ t: 0.2, char: 3, len: 0 }]);
    assert.equal(a.levels, undefined);
  });

  test('an AudioBuffer is accepted as is', () => {
    const buffer = { duration: 1.5, getChannelData: () => new Float32Array(1) };
    assert.equal(validAudio({ buffer, words: [] }).duration, 1.5);
  });
});

describe('envelope and word helpers', () => {
  test('levelAt interpolates between frames and is 0 outside the clip', () => {
    const lv = { rate: 10, values: [0, 1, 0.5] };
    assert.equal(levelAt(lv, 0), 0);
    assert.equal(levelAt(lv, 0.05), 0.5);
    assert.equal(levelAt(lv, 0.1), 1);
    assert.equal(levelAt(lv, 0.15), 0.75);
    assert.equal(levelAt(lv, -1), 0);
    assert.equal(levelAt(lv, 5), 0);
    assert.equal(levelAt(null, 1), 0);
  });

  test('wordAt finds the word being said', () => {
    const words = [{ t: 0.1 }, { t: 0.5 }, { t: 0.9 }];
    assert.equal(wordAt(words, 0), -1);
    assert.equal(wordAt(words, 0.1), 0);
    assert.equal(wordAt(words, 0.7), 1);
    assert.equal(wordAt(words, 9), 2);
    assert.equal(wordAt([], 1), -1);
  });

  test('?voices=browser forces the browser voices', () => {
    assert.equal(forcedBrowser('?autostart=1&voices=browser'), true);
    assert.equal(forcedBrowser('?autostart=1&voice=tts'), false);
    assert.equal(forcedBrowser(''), false);
  });
});

describe('VoicePlayer', () => {
  test("a segment's own clip is used and the next two clips are preloaded", async () => {
    const audio = fakeAudio();
    const p = new VoicePlayer({ audio, fetch: fakeFetch({}) });
    const segs = [
      { type: 'intro', audio: clip(URL1) },
      { type: 'story', audio: clip(URL2) },
      { type: 'story' },
      { type: 'chat', audio: clip('/api/voice/vbbbbbbbbbbbbbbbbbbbb.ogg') },
      { type: 'outro', audio: clip('/api/voice/vcccccccccccccccccccc.ogg') },
    ];
    p.episode({ segments: segs });
    assert.deepEqual(audio.preloads, [URL1, URL2], 'the open warms up the first two clips');
    const a = await p.audioFor(segs[1]);
    assert.equal(a.url, URL2);
    assert.deepEqual(audio.preloads.slice(2), ['/api/voice/vbbbbbbbbbbbbbbbbbbbb.ogg', '/api/voice/vcccccccccccccccccccc.ogg']);
  });

  test('a clip that finished after the episode was fetched is looked up by voiceId and kept on the segment', async () => {
    const fetch = fakeFetch({ '/api/voice/vdddddddddddddddddddd.json': clip('/api/voice/vdddddddddddddddddddd.ogg') });
    const p = new VoicePlayer({ audio: fakeAudio(), fetch });
    const seg = { type: 'story', voiceId: 'vdddddddddddddddddddd' };
    const a = await p.audioFor(seg);
    assert.equal(a.url, '/api/voice/vdddddddddddddddddddd.ogg');
    assert.equal(seg.audio, a);
    assert.equal(p.stats.late, 1);
  });

  test('a clip that is not ready (404) or a server that hangs means the browser voice, quickly, and is not asked again at once', async () => {
    const fetch = fakeFetch({ '/api/voice/veeeeeeeeeeeeeeeeeeee.json': 'hang' });
    const p = new VoicePlayer({ audio: fakeAudio(), fetch, lookupMs: 40 });
    const t0 = Date.now();
    assert.equal(await p.audioFor({ type: 'story', voiceId: 'veeeeeeeeeeeeeeeeeeee' }), null);
    assert.ok(Date.now() - t0 < 1000);
    assert.equal(await p.audioFor({ type: 'story', voiceId: 'vffffffffffffffffffff' }), null);
    assert.equal(await p.audioFor({ type: 'story', voiceId: 'vffffffffffffffffffff' }), null);
    assert.equal(fetch.calls.filter((u) => u.includes('vffff')).length, 1, 'a miss is remembered for a while');
    assert.equal(await p.audioFor({ type: 'story', voiceId: '../../etc' }), null);
    assert.equal(fetch.calls.length, 2, 'a malformed id is never fetched');
  });

  test('?voices=browser (enabled: false) never hands over a recording', async () => {
    const p = new VoicePlayer({ audio: fakeAudio(), fetch: fakeFetch({}), enabled: false });
    assert.equal(await p.audioFor({ type: 'story', audio: clip() }), null);
    assert.equal(p.adLine({ id: 'x' }, 'Hello.'), null);
  });

  test('advert voice-overs: manifest fetched at most once a minute, lines matched by exact text', async () => {
    const manifest = { corners: { 'This is not just a crisp.': clip(URL1), 'Corners.': clip(URL2) } };
    const fetch = fakeFetch({ '/api/voice/ads': manifest });
    const audio = fakeAudio();
    const p = new VoicePlayer({ audio, fetch });
    await p.refreshAds();
    await p.refreshAds();
    assert.equal(fetch.calls.length, 1);
    const ad = { id: 'corners', script: [{ at: 0.6, text: 'This is not just a crisp.' }, { at: 4, text: 'Corners.' }] };
    p.prepareAd(ad);
    assert.deepEqual(audio.preloads, [URL1, URL2]);
    assert.equal(p.adLine(ad, 'This is not just a crisp.', 'Corners.').url, URL1);
    assert.equal(p.adLine(ad, 'This is not just a crisp!'), null, 'an edited script line does not get an old recording');
    assert.equal(p.adLine({ id: 'other' }, 'Corners.'), null);
    await p.refreshAds(true);
    assert.equal(fetch.calls.length, 2);
  });

  test('never throws, whatever it is given', async () => {
    const p = new VoicePlayer({ audio: { preload() { throw new Error('no'); } }, fetch: () => { throw new Error('offline'); } });
    p.episode(null);
    p.episode({ segments: [{ audio: clip() }] });
    assert.equal(await p.audioFor(null), null);
    assert.equal(await p.audioFor({ voiceId: 'v0123456789abcdef0123' }), null);
    assert.deepEqual(await p.refreshAds(true), {});
  });
});

// ---------------------------------------------------- AudioEngine: the jaw follows the clip

class Param {
  constructor(value = 0) { this.value = value; }
  setValueAtTime(v) { this.value = v; return this; }
  linearRampToValueAtTime() { return this; }
  exponentialRampToValueAtTime() { return this; }
  setTargetAtTime() { return this; }
  cancelScheduledValues() { return this; }
}
const PARAMS = new Set(['gain', 'frequency', 'detune', 'Q', 'pan', 'delayTime', 'playbackRate', 'offset', 'threshold', 'knee', 'ratio', 'attack', 'release']);
function fakeNode(ctx) {
  const params = {};
  const base = {
    connect(x) { return x; },
    disconnect() {},
    start() {},
    stop() {},
    setPeriodicWave() {},
    getFloatTimeDomainData(a) { a.fill(0.05); }, // what a live analyser would hear: a steady voice
    onended: null,
    buffer: null,
    fftSize: 2048,
  };
  return new Proxy(base, {
    get(t, k) { return k in t ? t[k] : PARAMS.has(k) ? (params[k] ??= new Param(k === 'gain' ? 1 : 0)) : undefined; },
    set(t, k, v) { t[k] = v; return true; },
  });
}
class FakeContext {
  constructor() {
    this.t0 = performance.now();
    this.sampleRate = 48000;
    this.state = 'running';
    this.destination = fakeNode(this);
  }
  get currentTime() { return (performance.now() - this.t0) / 1000; }
  createBuffer(ch, n, sr) {
    const data = Array.from({ length: ch }, () => new Float32Array(n));
    return { numberOfChannels: ch, length: n, sampleRate: sr, duration: n / sr, getChannelData: (i) => data[i] };
  }
  createPeriodicWave() { return {}; }
  resume() { return Promise.resolve(); }
  addEventListener() {}
}
for (const m of ['createGain', 'createOscillator', 'createBiquadFilter', 'createDynamicsCompressor', 'createWaveShaper', 'createConvolver', 'createStereoPanner', 'createDelay', 'createConstantSource', 'createBufferSource', 'createAnalyser']) {
  FakeContext.prototype[m] = function () { return fakeNode(this); };
}

describe('AudioEngine with a recorded voice', () => {
  afterEach(() => {
    delete globalThis.AudioContext;
  });

  async function jaw(levels) {
    globalThis.AudioContext = FakeContext;
    const { AudioEngine } = await import('../public/js/audio.js');
    const e = new AudioEngine();
    await e.unlock();
    const text = 'Good evening and welcome to the news tonight.';
    const buffer = e.context.createBuffer(1, 48000 * 3, 48000);
    const words = [...text.matchAll(/\S+/g)].map((m, i) => ({ t: 0.05 + i * 0.25, char: m.index }));
    const run = e.speak(text, 'A', { audio: { buffer, words, ...(levels ? { levels } : {}) } });
    let sum = 0;
    let n = 0;
    const out = {};
    const t0 = performance.now();
    while (performance.now() - t0 < 1500) {
      await sleep(15);
      const f = e.speechFrame(performance.now(), 'A', out);
      if (f.speaking) {
        sum += f.level;
        n++;
      }
    }
    e.stop();
    await run;
    return { mean: n ? sum / n : 0, n };
  }

  test('the jaw follows the clip envelope when the server sends one (offline renders read no analyser)', async () => {
    const silent = await jaw({ rate: 50, values: new Array(200).fill(0) });
    const loud = await jaw({ rate: 50, values: new Array(200).fill(1) });
    const analyser = await jaw(null);
    assert.ok(silent.n > 10 && loud.n > 10, `${silent.n}/${loud.n} speaking frames`);
    assert.ok(silent.mean < loud.mean * 0.5, `a silent envelope keeps the jaw nearly shut (${silent.mean.toFixed(3)} vs ${loud.mean.toFixed(3)})`);
    assert.ok(Math.abs(analyser.mean - loud.mean) < loud.mean * 0.5, 'without an envelope the live analyser still drives it');
  });
});
