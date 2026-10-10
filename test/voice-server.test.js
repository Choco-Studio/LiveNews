// Server-side neural voices (server/voice): what the Kokoro worker is asked
// for each segment (casting + the newsreader planner), the clip cache, the
// voice service with a fake worker (attach, cache hits, late clips, failures
// that fall back to browser voices without errors), its HTTP endpoints, the
// producer's 'voice' stage and the JSON-lines worker client.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import * as speech from '../public/js/voice/speechtext.js';
import { segmentRequest, segmentType, isSpoken, castFor, clipId, adLineRequest, clientAudio, plannerLang, ID_RE } from '../server/voice/plan.js';
import { VoiceCache } from '../server/voice/cache.js';
import { VoiceService } from '../server/voice/service.js';
import { KokoroWorker } from '../server/voice/worker.js';
import { Producer } from '../server/producer.js';
import { createMockProvider } from '../server/providers/mock.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CASTING = JSON.parse(fs.readFileSync(path.join(REPO, 'server', 'voice', 'casting.json'), 'utf8'));
const PRESETS = JSON.parse(fs.readFileSync(path.join(REPO, 'tools', 'voice', 'presets.json'), 'utf8')).presets;
const CHANNEL = JSON.parse(fs.readFileSync(path.join(REPO, 'config', 'channel.json'), 'utf8'));
const silent = { info() {}, warn() {}, error() {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function recorder() {
  const lines = [];
  return { lines, info: (m) => lines.push(['info', m]), warn: (m) => lines.push(['warn', m]), error: (m) => lines.push(['error', m]) };
}

const tmpdir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'voice-test-'));

/** A fake Kokoro worker: writes a few bytes to `out` and replies with plausible timings. */
function fakeWorkerFactory({ delayMs = 0, failStart = null, failText = null, die = null } = {}) {
  const made = [];
  const factory = (opts) => {
    const w = {
      opts,
      alive: false,
      requests: [],
      closed: false,
      info: { ready: true, voices: ['bm_george', 'af_heart'] },
      async start() {
        if (failStart) throw new Error(failStart);
        w.alive = true;
        return w.info;
      },
      async request(body) {
        w.requests.push(body);
        if (delayMs) await sleep(delayMs);
        if (die && die(body)) {
          w.alive = false;
          throw new Error('voice worker exited (code 1)');
        }
        if (failText && body.text.includes(failText)) throw new Error('synthesis failed');
        fs.writeFileSync(body.out, Buffer.from('OggS fake clip'));
        const words = [...body.text.matchAll(/\S+/g)].map((m, i) => ({ t: 0.05 + i * 0.3, char: m.index, len: m[0].length }));
        return { ok: true, out: body.out, duration: 0.3 * words.length + 0.2, sampleRate: 24000, words, phrases: [{ t: 0.05, dur: 0.3 * words.length, char: 0, len: body.text.length }], levels: { rate: 50, values: [0, 0.5, 1, 0.5, 0] }, voice: body.voice, lang: body.lang, speed: body.speed, effect: body.effect === 'none' ? null : body.effect, lufs: -16, truePeak: -2.6 };
      },
      close() {
        w.closed = true;
        w.alive = false;
      },
      kill() {
        w.closed = true;
        w.alive = false;
      },
    };
    made.push(w);
    return w;
  };
  factory.made = made;
  return factory;
}

function makeService({ dir = tmpdir(), engine = 'kokoro', budgetSeconds = 5, firstBudgetSeconds = 0, factory = fakeWorkerFactory(), log = silent, root = REPO, ads = [] } = {}) {
  const service = new VoiceService({
    config: { engine, dir, budgetSeconds, firstBudgetSeconds, cacheMb: 50 },
    root,
    log,
    createWorker: factory,
    loadSpeech: async () => speech,
    loadAds: async () => ads,
  });
  return { service, dir, factory };
}

const presenters = (a, b) => ({ A: { id: a, ...CHANNEL.presenters[a] }, ...(b ? { B: { id: b, ...CHANNEL.presenters[b] } } : {}) });

function episodeCtx(segments, cast = ['paco', 'lola']) {
  return { program: { id: 'world-now', title: 'WORLD NOW' }, presenters: presenters(...cast), episode: { segments } };
}

const SEGMENTS = () => [
  { type: 'intro', anchor: 'A', emotion: 'neutral', text: 'Good evening. The IMF lent $2bn to Kenya on 2 October 2026.', cues: [] },
  { type: 'story', anchor: 'B', emotion: 'serious', text: 'A 7.1 magnitude quake struck at 14:30, killing at least 40,000 people.', cues: [{ char: 0, slot: null, action: 'lean_in' }] },
  { type: 'chat', anchor: 'A', emotion: 'happy', text: 'A good note to end on.', cues: [] },
  { type: 'chat', anchor: 'B', emotion: 'happy', text: '   ', cues: [] },
  { type: 'outro', anchor: 'A', emotion: 'neutral', text: "That's WORLD NOW. Stay with us on GLOBIT 24.", cues: [] },
];

// ---------------------------------------------------------------- plan.js

describe('voice plan: what the worker is asked', () => {
  test('segment types follow the planner: features, breaking, chat, intro, outro', () => {
    assert.equal(segmentType({ type: 'story' }), 'story');
    assert.equal(segmentType({ type: 'story', breaking: true, feature: 'number' }), 'breaking');
    assert.equal(segmentType({ type: 'story', feature: 'roundup' }), 'roundup');
    assert.equal(segmentType({ type: 'story', feature: 'lighter' }), 'lighter');
    assert.equal(segmentType({ type: 'chat' }), 'chat');
    assert.equal(segmentType({ type: 'outro' }), 'outro');
  });

  test('only intro, story, chat and outro segments with words are spoken', () => {
    assert.ok(isSpoken({ type: 'story', text: 'Hello.' }));
    assert.ok(!isSpoken({ type: 'story', text: ' ... ' }));
    assert.ok(!isSpoken({ type: 'ad', text: 'Buy now.' }));
    assert.ok(!isSpoken({ type: 'chat' }));
    assert.ok(!isSpoken(null));
  });

  test('every presenter of config/channel.json has a cast voice', () => {
    for (const id of Object.keys(CHANNEL.presenters)) {
      assert.ok(CASTING[id]?.voice, `${id} is not in server/voice/casting.json`);
      assert.match(CASTING[id].voice, /^[a-z]{2}_[a-z]+(:\d*\.?\d+)?(\+[a-z]{2}_[a-z]+:\d*\.?\d+)*$/);
      assert.ok(CASTING[id].speed >= 0.7 && CASTING[id].speed <= 1.3, id);
    }
    assert.equal(CASTING.unit8.effect, 'robot-soft'); // the owner's pick (3 Oct)
    assert.ok(CASTING.unit8.speed >= 0.82, 'UNIT-8 must stay at Kokoro speed >= 0.82');
  });

  test('an unknown presenter still gets a neural voice of the right gender and accent', () => {
    assert.match(castFor('zed', { voice: { gender: 'female', lang: 'en-GB' } }, CASTING).voice, /^bf_/);
    assert.match(castFor('zed', { voice: { gender: 'male', lang: 'en-US' } }, CASTING).voice, /^am_/);
    assert.equal(castFor('zed', { voice: { gender: 'robot' } }, CASTING).effect, 'robot-soft');
    assert.equal(castFor('paco', {}, CASTING), CASTING.paco);
  });

  test('the request carries the cast voice, speed, accent and newsreader phrases', () => {
    const seg = SEGMENTS()[0];
    const req = segmentRequest(seg, { presenterId: 'paco', presenter: CHANNEL.presenters.paco, casting: CASTING, presets: PRESETS, speech });
    assert.equal(req.text, seg.text);
    assert.equal(req.voice, CASTING.paco.voice);
    assert.equal(req.speed, CASTING.paco.speed);
    assert.equal(req.lang, 'en-gb');
    assert.equal(req.effect, 'none');
    assert.deepEqual(req.pauses, CASTING.paco.pauses);
    assert.ok(req.phrases.length >= 2);
    // phrases are slices of the text, in order, said the way a newsreader reads them
    let from = 0;
    for (const p of req.phrases) {
      const at = seg.text.indexOf(p.text, from);
      assert.ok(at >= 0, p.text);
      from = at + p.text.length;
      assert.ok(!/\d|\$/.test(p.say), p.say);
    }
    assert.match(req.phrases.map((p) => p.say).join(' '), /two billion dollars/);
    assert.match(req.phrases.map((p) => p.say).join(' '), /the second of October/);
  });

  test("the planner's persona pace is not counted twice: casting already calibrated it", () => {
    const seg = { type: 'story', anchor: 'A', emotion: 'neutral', text: 'Officials met in the capital today. They agreed on a new plan for the river.' };
    for (const id of ['sam', 'max', 'paco']) {
      const req = segmentRequest(seg, { presenterId: id, presenter: CHANNEL.presenters[id], casting: CASTING, presets: PRESETS, speech });
      for (const p of req.phrases) assert.ok(p.speedFactor > 0.94 && p.speedFactor < 1.06, `${id}: ${p.speedFactor}`);
    }
    const grave = segmentRequest({ ...seg, emotion: 'sad' }, { presenterId: 'paco', presenter: CHANNEL.presenters.paco, casting: CASTING, presets: PRESETS, speech });
    assert.ok(grave.phrases.every((p) => p.speedFactor < 1), 'grave stories read slower');
  });

  test('the newsreader melody rides along to the worker (never for UNIT-8)', () => {
    const seg = { type: 'story', anchor: 'A', emotion: 'neutral', text: 'Rates rose to 4.75 percent today. Most economists had expected no change, according to analysts. The bank would not say more.' };
    const req = segmentRequest(seg, { presenterId: 'lola', presenter: CHANNEL.presenters.lola, casting: CASTING, presets: PRESETS, speech });
    assert.equal(req.phrases.length, 3);
    for (const p of req.phrases) {
      assert.equal(p.pitch.length, 2);
      assert.equal(typeof p.gain, 'number');
    }
    assert.ok(req.phrases[0].pitch[0] > req.phrases[2].pitch[0], 'the lead above the close');
    const lift = req.phrases[0].accents.find((a) => seg.text.slice(a.start, a.end) === '4.75');
    assert.ok(lift && lift.semis > 0, JSON.stringify(req.phrases[0].accents));
    assert.ok(req.phrases[1].accents.some((a) => a.semis < 0 && seg.text.slice(a.start, a.end).startsWith('according to')));
    // the melody is part of the clip's identity
    const flat = { ...req, phrases: req.phrases.map(({ pitch, gain, accents, ...p }) => p) };
    assert.notEqual(clipId(req, 'fp'), clipId(flat, 'fp'));
    const robot = segmentRequest(seg, { presenterId: 'unit8', presenter: CHANNEL.presenters.unit8, casting: CASTING, presets: PRESETS, speech });
    assert.ok(robot.phrases.every((p) => p.pitch === undefined && p.accents === undefined));
  });

  test('UNIT-8 keeps the robot effect, its tuned chain and never drops below speed 0.82', () => {
    const seg = { type: 'outro', anchor: 'B', emotion: 'sad', text: 'Observation complete. Signing off, with regret, at the end of this transmission.' };
    const req = segmentRequest(seg, { presenterId: 'unit8', presenter: CHANNEL.presenters.unit8, casting: CASTING, presets: PRESETS, speech });
    assert.equal(req.effect, 'robot-soft');
    assert.deepEqual(req.chain, PRESETS.unit8.chain);
    for (const p of req.phrases) assert.ok(req.speed * p.speedFactor >= 0.819, String(req.speed * p.speedFactor));
  });

  test('without the planner the worker phrases the text itself', () => {
    const req = segmentRequest(SEGMENTS()[0], { presenterId: 'lola', presenter: CHANNEL.presenters.lola, casting: CASTING, speech: null });
    assert.equal(req.phrases, undefined);
    assert.equal(req.voice, CASTING.lola.voice);
  });

  test('clip ids are stable content hashes', () => {
    const base = segmentRequest(SEGMENTS()[2], { presenterId: 'paco', presenter: CHANNEL.presenters.paco, casting: CASTING, speech });
    const id = clipId(base, 'fp1');
    assert.match(id, ID_RE);
    assert.equal(clipId(structuredClone(base), 'fp1'), id);
    assert.notEqual(clipId({ ...base, text: `${base.text} ` }, 'fp1'), id);
    assert.notEqual(clipId({ ...base, voice: 'bm_george' }, 'fp1'), id);
    assert.notEqual(clipId(base, 'fp2'), id, 'a new voice engine renders again');
  });

  test('advert lines use the advert voice at its own pace', () => {
    const req = adLineRequest('Notes of oak, caramel... and dial-up.', { cast: { voice: 'bm_fable:0.7+am_onyx:0.3', speed: 0.9, lang: 'en-gb' }, speech });
    assert.equal(req.voice, 'bm_fable:0.7+am_onyx:0.3');
    assert.equal(req.speed, 0.9);
    assert.ok(req.phrases.every((p) => p.speedFactor === 1));
  });

  test('client audio and planner language helpers', () => {
    const a = clientAudio('v0123456789abcdef0123', { duration: 2, words: [{ t: 0, char: 0 }], phrases: [], levels: { rate: 50, values: [0] } });
    assert.deepEqual(a, { url: '/api/voice/v0123456789abcdef0123.ogg', duration: 2, words: [{ t: 0, char: 0 }], phrases: [], levels: { rate: 50, values: [0] } });
    assert.equal(plannerLang('en-gb'), 'en-GB');
    assert.equal(plannerLang('en-US'), 'en-US');
  });
});

// ---------------------------------------------------------------- cache

describe('voice cache', () => {
  test('get needs both files; put writes atomically; prune removes the least recently used', () => {
    const dir = tmpdir();
    const cache = new VoiceCache({ dir, maxBytes: 2500, minAgeMs: 0 });
    const ids = ['v00000000000000000001', 'v00000000000000000002', 'v00000000000000000003'];
    assert.equal(cache.get(ids[0]), null);
    ids.forEach((id, i) => {
      fs.writeFileSync(cache.audioPath(id), Buffer.alloc(1000));
      cache.put(id, { duration: 1 + i });
      const t = new Date(Date.now() - (10 - i) * 60_000);
      fs.utimesSync(cache.audioPath(id), t, t);
      fs.utimesSync(cache.metaPath(id), t, t);
    });
    assert.equal(cache.get('nope'), null);
    assert.equal(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp')).length, 0);
    const r = cache.prune(new Set([ids[0]]));
    assert.equal(r.removed, 1);
    assert.ok(fs.existsSync(cache.audioPath(ids[0])), 'kept: pinned');
    assert.ok(!fs.existsSync(cache.audioPath(ids[1])), 'removed: oldest unpinned');
    assert.equal(cache.get(ids[2]).duration, 3);
    assert.throws(() => cache.audioPath('../etc/passwd'));
  });

  test('recently used clips are never pruned, whatever the size', () => {
    const dir = tmpdir();
    const cache = new VoiceCache({ dir, maxBytes: 10 });
    fs.writeFileSync(cache.audioPath('v0000000000000000000a'), Buffer.alloc(1000));
    cache.put('v0000000000000000000a', { duration: 1 });
    assert.equal(cache.prune().removed, 0);
  });
});

// ---------------------------------------------------------------- service

describe('voice service', () => {
  test('voices every spoken segment: audio + voiceId, words in the segment text, skips silent ones', async () => {
    const { service, factory } = makeService();
    const ctx = episodeCtx(SEGMENTS());
    const note = await service.voiceEpisode(ctx);
    assert.deepEqual(note, { voice: 'kokoro', clips: 4, cached: 0, ready: 4 });
    const segs = ctx.episode.segments;
    for (const seg of [segs[0], segs[1], segs[2], segs[4]]) {
      assert.match(seg.voiceId, ID_RE);
      assert.equal(seg.audio.url, `/api/voice/${seg.voiceId}.ogg`);
      assert.ok(seg.audio.duration > 0);
      assert.ok(seg.audio.words.length > 0);
      for (const w of seg.audio.words) assert.ok(w.char >= 0 && w.char < seg.text.length);
      assert.deepEqual(seg.audio.levels.rate, 50);
    }
    assert.equal(segs[3].audio, undefined);
    assert.equal(segs[3].voiceId, undefined);
    const reqs = factory.made[0].requests;
    assert.equal(reqs.length, 4);
    assert.equal(reqs[0].voice, CASTING.paco.voice);
    assert.equal(reqs[1].voice, CASTING.lola.voice);
    assert.ok(reqs.every((r) => r.levels === true && path.isAbsolute(r.out) && r.out.endsWith('.ogg')));
    service.close();
    assert.ok(factory.made[0].closed);
  });

  test('a second episode with the same lines is served from the cache, without the worker', async () => {
    const dir = tmpdir();
    const first = makeService({ dir });
    await first.service.voiceEpisode(episodeCtx(SEGMENTS()));
    const second = makeService({ dir });
    const ctx = episodeCtx(SEGMENTS());
    const note = await second.service.voiceEpisode(ctx);
    assert.deepEqual(note, { voice: 'kokoro', clips: 4, cached: 4, ready: 4 });
    assert.equal(second.factory.made[0].requests.length, 0);
  });

  test('the same line twice in one episode is synthesised once', async () => {
    const { service, factory } = makeService();
    const segs = [
      { type: 'chat', anchor: 'A', emotion: 'neutral', text: 'Indeed.' },
      { type: 'chat', anchor: 'A', emotion: 'neutral', text: 'Indeed.' },
    ];
    await service.voiceEpisode(episodeCtx(segs));
    assert.equal(factory.made[0].requests.length, 1);
    assert.equal(segs[0].audio.url, segs[1].audio.url);
  });

  test('clips that miss the budget attach themselves to their segments when done', async () => {
    const { service } = makeService({ budgetSeconds: 0.05, factory: fakeWorkerFactory({ delayMs: 40 }) });
    const ctx = episodeCtx(SEGMENTS());
    const note = await service.voiceEpisode(ctx);
    assert.equal(note.voice, 'kokoro');
    assert.ok(note.late >= 1, JSON.stringify(note));
    assert.ok(ctx.episode.segments.every((s) => !isSpoken(s) || s.voiceId), 'every spoken segment knows its clip id at once');
    await sleep(400);
    assert.ok(ctx.episode.segments.filter(isSpoken).every((s) => s.audio), 'and gets its audio later');
  });

  test('a cold start waits for every clip of the first episode (owner 07:45); the next episode keeps the normal budget', async () => {
    const { service } = makeService({ budgetSeconds: 0.05, firstBudgetSeconds: 5, factory: fakeWorkerFactory({ delayMs: 40 }) });
    const first = episodeCtx(SEGMENTS());
    const n1 = await service.voiceEpisode(first);
    assert.equal(n1.late, undefined, JSON.stringify(n1));
    assert.ok(first.episode.segments.filter(isSpoken).every((s) => s.audio), 'the first programme airs with all its voices');
    const second = episodeCtx(SEGMENTS().map((s) => ({ ...s, text: `${s.text} Again.` })));
    const n2 = await service.voiceEpisode(second);
    assert.ok(n2.late >= 1, JSON.stringify(n2));
  });

  test('a clip that fails leaves that segment to the browser voice; the others are voiced', async () => {
    const log = recorder();
    const { service } = makeService({ log, factory: fakeWorkerFactory({ failText: 'quake' }) });
    const ctx = episodeCtx(SEGMENTS());
    const note = await service.voiceEpisode(ctx);
    assert.equal(note.failed, 1);
    assert.equal(ctx.episode.segments[1].audio, undefined);
    assert.ok(ctx.episode.segments[0].audio && ctx.episode.segments[2].audio);
    assert.equal(log.lines.filter(([lvl]) => lvl === 'warn').length, 1);
  });

  test('Kokoro missing: logs once, returns browser, never throws, and retries later', async () => {
    const log = recorder();
    const factory = fakeWorkerFactory({ failStart: "No module named 'kokoro_onnx'" });
    const { service } = makeService({ log, factory });
    const a = episodeCtx(SEGMENTS());
    assert.deepEqual(await service.voiceEpisode(a), { voice: 'browser', error: "No module named 'kokoro_onnx'" });
    assert.ok(a.episode.segments.every((s) => !s.audio && !s.voiceId));
    await service.voiceEpisode(episodeCtx(SEGMENTS()));
    assert.equal(factory.made.length, 1, 'no new start before the retry time');
    const warns = log.lines.filter(([lvl]) => lvl === 'warn');
    assert.equal(warns.length, 1);
    assert.match(warns[0][1], /Kokoro unavailable .*browser voices/);
    service.disabledUntil = 0; // ten minutes later
    await service.voiceEpisode(episodeCtx(SEGMENTS()));
    assert.equal(factory.made.length, 2);
    assert.equal(log.lines.filter(([lvl]) => lvl === 'warn').length, 1, 'still unavailable: not logged again');
  });

  test('a worker that dies is restarted for the next clip; three deaths rest the engine', async () => {
    let n = 0;
    const factory = fakeWorkerFactory({ die: () => ++n <= 1 });
    const { service } = makeService({ factory });
    const ctx = episodeCtx(SEGMENTS());
    const note = await service.voiceEpisode(ctx);
    assert.equal(note.failed, 1);
    assert.equal(factory.made.length, 2, 'a fresh worker took over');
    assert.equal(note.ready, 3);

    const always = fakeWorkerFactory({ die: () => true });
    const down = makeService({ factory: always, log: recorder() });
    const n2 = await down.service.voiceEpisode(episodeCtx(SEGMENTS()));
    assert.equal(n2.ready, 0);
    assert.equal(down.service.state, 'unavailable');
    assert.ok(always.made.length <= 3);
  });

  test('VOICE_WORKERS=2 shares the queue between two worker processes', async () => {
    const factory = fakeWorkerFactory({ delayMs: 30 });
    const service = new VoiceService({ config: { engine: 'kokoro', dir: tmpdir(), budgetSeconds: 5, workers: 2 }, root: REPO, log: silent, createWorker: factory, loadSpeech: async () => speech, loadAds: async () => [] });
    const ctx = episodeCtx(SEGMENTS());
    const note = await service.voiceEpisode(ctx);
    assert.equal(note.ready, 4);
    assert.equal(factory.made.length, 2);
    assert.ok(factory.made.every((w) => w.requests.length >= 1), factory.made.map((w) => w.requests.length).join('/'));
    service.close();
    assert.ok(factory.made.every((w) => w.closed));
  });

  test('VOICE_ENGINE=browser, or no worker script on disk, switches the service off', async () => {
    assert.equal(makeService({ engine: 'browser' }).service.enabled, false);
    assert.equal(makeService({ root: tmpdir() }).service.enabled, false);
    assert.equal(makeService().service.enabled, true);
    const off = makeService({ engine: 'browser' });
    assert.deepEqual(await off.service.voiceEpisode(episodeCtx(SEGMENTS())), { voice: 'browser' });
    assert.equal(off.factory.made.length, 0);
  });

  test('advert voice-overs render after the episode, keyed by advert id and line text', async () => {
    const ads = [
      { id: 'bitfizz-cola', voice: { gender: 'male', lang: 'en-GB' }, duration: 6, script: [{ at: 0.5, text: 'Some things cannot be rushed.' }, { at: 4, text: 'BitFizz Reserve.' }] },
      { id: 'brand-new', voice: { gender: 'female', lang: 'en-US' }, duration: 3, script: [{ at: 0.2, text: 'Stay offline.' }] },
    ];
    const log = recorder();
    const { service, factory } = makeService({ ads, log });
    await service.voiceEpisode(episodeCtx(SEGMENTS().slice(0, 1)));
    await sleep(50);
    const m = service.adManifest();
    assert.deepEqual(Object.keys(m).sort(), ['bitfizz-cola', 'brand-new']);
    assert.match(m['bitfizz-cola']['Some things cannot be rushed.'].url, /^\/api\/voice\/v[0-9a-f]{20}\.ogg$/);
    assert.equal(m['bitfizz-cola']['Some things cannot be rushed.'].levels, undefined);
    const reqs = factory.made[0].requests;
    assert.equal(reqs[0].text, SEGMENTS()[0].text, 'the episode goes first');
    const adcast = JSON.parse(fs.readFileSync(path.join(REPO, 'server', 'voice', 'adcast.json'), 'utf8'));
    assert.equal(reqs.find((r) => r.text === 'BitFizz Reserve.').voice, adcast['bitfizz-cola'].voice);
    assert.equal(reqs.find((r) => r.text === 'Stay offline.').voice, adcast.default['female-us'].voice);
    // fit check: the fake 'Some things cannot be rushed.' (5 words, 1.7 s) fits its 3.5 s slot
    assert.equal(service.adFit['bitfizz-cola'][0].over, undefined);
  });

  test('every advert voice in adcast.json avoids the presenters’ dominant voices', () => {
    const adcast = JSON.parse(fs.readFileSync(path.join(REPO, 'server', 'voice', 'adcast.json'), 'utf8'));
    const dominant = (spec) => spec.split('+')[0].split(':')[0];
    const anchors = new Set(Object.entries(CASTING).filter(([id]) => id !== 'continuity').map(([, c]) => dominant(c.voice)));
    for (const [id, c] of Object.entries(adcast)) {
      if (!c.voice) continue;
      assert.ok(!anchors.has(dominant(c.voice)), `${id} leads with a presenter's voice`);
    }
  });
});

// ---------------------------------------------------------------- http

function fakeRes() {
  const res = new PassThrough();
  res.status = 0;
  res.headers = {};
  res.chunks = [];
  res.writeHead = (status, headers) => {
    res.status = status;
    res.headers = headers;
  };
  res.on('data', (c) => res.chunks.push(c));
  res.done = new Promise((r) => res.on('finish', r));
  res.body = () => Buffer.concat(res.chunks);
  return res;
}

describe('voice endpoints', () => {
  test('clip audio, clip timing, adverts and status; anything else is not ours', async () => {
    const { service } = makeService();
    const ctx = episodeCtx(SEGMENTS().slice(0, 1));
    await service.voiceEpisode(ctx);
    const id = ctx.episode.segments[0].voiceId;

    const ogg = fakeRes();
    assert.equal(service.handle({}, ogg, `/api/voice/${id}.ogg`), true);
    await ogg.done;
    assert.equal(ogg.status, 200);
    assert.equal(ogg.headers['content-type'], 'audio/ogg');
    assert.match(ogg.headers['cache-control'], /immutable/);
    assert.equal(ogg.body().toString(), 'OggS fake clip');

    const meta = fakeRes();
    service.handle({}, meta, `/api/voice/${id}.json`);
    await meta.done;
    assert.equal(meta.status, 200);
    assert.deepEqual(JSON.parse(meta.body()), ctx.episode.segments[0].audio);

    const missing = fakeRes();
    service.handle({}, missing, '/api/voice/vffffffffffffffffffff.json');
    await missing.done;
    assert.equal(missing.status, 404);

    const absent = fakeRes();
    service.handle({}, absent, '/api/voice/vffffffffffffffffffff.ogg');
    await absent.done;
    assert.equal(absent.status, 404);

    const ads = fakeRes();
    service.handle({}, ads, '/api/voice/ads');
    await ads.done;
    assert.deepEqual(JSON.parse(ads.body()), {});

    const st = fakeRes();
    service.handle({}, st, '/api/voice/status');
    await st.done;
    assert.equal(JSON.parse(st.body()).state, 'ready');

    for (const bad of ['/api/voice/../../etc/passwd', '/api/voice/v123.ogg', '/api/voice/VABCDEF0123456789ABCD.ogg', '/api/voice/x']) {
      assert.equal(service.handle({}, fakeRes(), bad), false, bad);
    }
  });
});

// ---------------------------------------------------------------- producer stage

describe("producer 'voice' stage", () => {
  const channel = {
    name: 'TEST TV',
    presenters: { paco: CHANNEL.presenters.paco, lola: CHANNEL.presenters.lola },
    programs: {
      duo: { title: 'THE DUO', tagline: 'TWO', theme: 'world', presenters: ['paco', 'lola'], categories: ['world'], stories: 3, maxChats: 1, style: 'A duo.', storyLength: '2 sentences' },
    },
    rotation: ['duo'],
  };
  const stories = Array.from({ length: 6 }, (_, k) => ({
    id: `s${k + 1}`,
    title: `Report on topic${k + 1} and subject${k + 1}`,
    summary: `Summary of story ${k + 1}. It has a second sentence.`,
    link: `https://example.test/${k + 1}`,
    source: 'Outlet 1',
    category: 'world',
    weight: 1,
    published: Date.now() - k * 60_000,
    image: null,
  }));
  const desk = () => ({
    stories: new Map(stories.map((s) => [s.id, s])),
    candidates: (n) => stories.slice(0, n),
    markCovered() {},
    markOffered() {},
    get: (id) => stories.find((s) => s.id === id),
    resolveImage: async () => null,
  });
  const chain = () => {
    const mock = createMockProvider();
    return { generate: async (request, validate) => ({ provider: 'mock', value: validate((await mock.generate(request)).text) }) };
  };
  const config = { candidatePool: 12, minNewStories: 3, reviewPass: false };

  test('runs after assets and voices the episode', async () => {
    const { service } = makeService();
    const producer = new Producer({ config, newsDesk: desk(), chain: chain(), voice: service, log: silent });
    const episode = await producer.produce(channel, 'duo');
    assert.deepEqual(episode.pipeline.map((p) => p.stage), ['write', 'assets', 'voice']);
    const note = episode.pipeline.at(-1);
    assert.equal(note.voice, 'kokoro');
    assert.ok(note.clips >= 3 && note.ready === note.clips, JSON.stringify(note));
    for (const seg of episode.segments.filter(isSpoken)) assert.ok(seg.audio?.url, seg.type);
  });

  test('is skipped without a voice service or when it is off', async () => {
    const plain = new Producer({ config, newsDesk: desk(), chain: chain(), log: silent });
    assert.deepEqual((await plain.produce(channel, 'duo')).pipeline.map((p) => p.stage), ['write', 'assets']);
    const off = new Producer({ config, newsDesk: desk(), chain: chain(), voice: makeService({ engine: 'browser' }).service, log: silent });
    assert.deepEqual((await off.produce(channel, 'duo')).pipeline.map((p) => p.stage), ['write', 'assets']);
  });

  test('an exception inside the voice service never fails the episode', async () => {
    const broken = { enabled: true, voiceEpisode: async () => { throw new Error('boom'); } };
    const producer = new Producer({ config, newsDesk: desk(), chain: chain(), voice: broken, log: silent });
    const episode = await producer.produce(channel, 'duo');
    assert.deepEqual(episode.pipeline.at(-1), { stage: 'voice', ms: episode.pipeline.at(-1).ms, voice: 'browser', error: 'boom' });
  });
});

// ---------------------------------------------------------------- worker client

function fakeSpawn(script) {
  const calls = [];
  const spawn = (cmd, args, opts) => {
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.killed = false;
    child.kill = (sig) => {
      child.killed = sig;
      setImmediate(() => child.emit('exit', null, sig));
    };
    calls.push({ cmd, args, opts, child });
    let buf = '';
    child.stdin.on('data', (d) => {
      buf += d;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        script.onLine?.(JSON.parse(line), child);
      }
    });
    setImmediate(() => script.onStart?.(child));
    return child;
  };
  spawn.calls = calls;
  return spawn;
}

describe('Kokoro worker client', () => {
  test('waits for ready, matches replies by id, ignores stray lines', async () => {
    const spawn = fakeSpawn({
      onStart: (c) => c.stdout.write('not json\n{"ready":true,"voices":["a"]}\n'),
      onLine: (msg, c) => {
        if (msg.cmd === 'quit') return;
        // answer out of order is impossible for the real worker, but ids must still match
        setImmediate(() => c.stdout.write(`${JSON.stringify({ id: msg.id, ok: msg.text !== 'bad', duration: 1, error: 'nope' })}\n`));
      },
    });
    const w = new KokoroWorker({ python: 'py', script: '/x/kokoro_worker.py', env: { KOKORO_THREADS: '2' }, spawn });
    const info = await w.start();
    assert.deepEqual(info.voices, ['a']);
    assert.equal(spawn.calls[0].cmd, 'py');
    assert.deepEqual(spawn.calls[0].args, ['/x/kokoro_worker.py']);
    assert.equal(spawn.calls[0].opts.env.KOKORO_THREADS, '2');
    const [a, b] = await Promise.allSettled([w.request({ text: 'hello' }), w.request({ text: 'bad' })]);
    assert.equal(a.value.duration, 1);
    assert.match(b.reason.message, /nope/);
    w.close();
  });

  test('ready:false or an early exit rejects start; an exit rejects what is pending', async () => {
    const bad = new KokoroWorker({ script: 's', spawn: fakeSpawn({ onStart: (c) => c.stdout.write('{"ready":false,"error":"no model"}\n') }) });
    await assert.rejects(bad.start(), /no model/);
    const gone = new KokoroWorker({ script: 's', spawn: fakeSpawn({ onStart: (c) => { c.stderr.write('Traceback: boom\n'); setImmediate(() => c.emit('exit', 1, null)); } }) });
    await assert.rejects(gone.start(), /exited \(code 1\): Traceback: boom/);
    const dies = new KokoroWorker({ script: 's', spawn: fakeSpawn({ onStart: (c) => c.stdout.write('{"ready":true}\n'), onLine: (m, c) => c.emit('exit', 1, null) }) });
    await dies.start();
    await assert.rejects(dies.request({ text: 'x' }), /exited/);
    assert.equal(dies.alive, false);
    await assert.rejects(dies.request({ text: 'y' }), /not running/);
  });

  test('a request that hangs times out and the worker is stopped', async () => {
    const spawn = fakeSpawn({ onStart: (c) => c.stdout.write('{"ready":true}\n') });
    const w = new KokoroWorker({ script: 's', spawn });
    await w.start();
    await assert.rejects(w.request({ text: 'slow' }, { timeoutMs: 30 }), /longer than/);
    assert.equal(spawn.calls[0].child.killed, 'SIGTERM');
  });

  test('a model that never loads times out', async () => {
    const w = new KokoroWorker({ script: 's', readyTimeoutMs: 30, spawn: fakeSpawn({}) });
    await assert.rejects(w.start(), /did not load/);
  });
});
