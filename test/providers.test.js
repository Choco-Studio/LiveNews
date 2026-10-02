import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ProviderChain, createProviders } from '../server/providers/index.js';
import { createMockProvider } from '../server/providers/mock.js';
import { createOpenAICompatProvider } from '../server/providers/openaiCompat.js';
import { UsageTracker } from '../server/usage.js';
import { extractJson, normalizeBulletin } from '../server/writer.js';
import { ACTIONS, EMOTIONS as CUE_EMOTIONS, parseCues } from '../public/js/cues.js';

// ---------------------------------------------------------------- helpers

const silentLogger = { info() {}, warn() {}, error() {} };

const SECOND = 1000;
const MINUTE = 60 * SECOND;

/** Controllable clock: `clock()` is `now`, `clock.advance(ms)` moves it forward. */
function makeClock(start = 1_700_000_000_000) {
  let t = start;
  const clock = () => t;
  clock.advance = (ms) => {
    t += ms;
  };
  return clock;
}

/** Usage stub that remembers every record() call. */
function makeUsage() {
  return {
    records: [],
    record(name, entry) {
      this.records.push({ name, ...entry });
    },
  };
}

const goodResult = (name) => ({ text: JSON.stringify({ from: name }), usage: { input: 10, output: 20, cached: 5 } });

/**
 * Fake provider. `generate(request, callNumber)` defaults to a valid JSON
 * result. Flip `provider.enabled` to change what available() returns.
 */
function makeProvider(name, { generate, available = true } = {}) {
  const provider = {
    name,
    enabled: available,
    calls: 0,
    requests: [],
    available: () => provider.enabled,
    async generate(request) {
      provider.calls++;
      provider.requests.push(request);
      return generate ? generate(request, provider.calls) : goodResult(name);
    },
  };
  return provider;
}

const throwing = (message, extra = {}) => async () => {
  throw Object.assign(new Error(message), extra);
};

function makeChain(providers, { usage = makeUsage(), clock = makeClock(), log = silentLogger } = {}) {
  const chain = new ProviderChain(providers, usage, { log, now: clock });
  return { chain, usage, clock };
}

const parseJson = (text) => JSON.parse(text);
const cooldownOf = (chain, clock, i = 0) => chain.status()[i].cooldownUntil - clock();

// ---------------------------------------------------------------- ProviderChain

describe('ProviderChain', () => {
  test('returns the first provider result, validated, with the provider name', async () => {
    const a = makeProvider('a');
    const b = makeProvider('b');
    const { chain } = makeChain([a, b]);

    const out = await chain.generate({ prompt: 'p' }, parseJson);

    assert.deepEqual(out, { provider: 'a', value: { from: 'a' } });
    assert.equal(b.calls, 0, 'later providers are not touched after a success');
  });

  test('passes the request through to the provider', async () => {
    const a = makeProvider('a');
    const { chain } = makeChain([a]);
    const request = { prompt: 'hola', stories: [{ id: 's1' }], channelName: 'TEST' };
    await chain.generate(request, parseJson);
    assert.deepEqual(a.requests, [request]);
  });

  test('falls through to the next provider when the first throws', async () => {
    const a = makeProvider('a', { generate: throwing('boom A') });
    const b = makeProvider('b');
    const { chain } = makeChain([a, b]);

    const out = await chain.generate({}, parseJson);

    assert.equal(out.provider, 'b');
    assert.deepEqual(out.value, { from: 'b' });
    assert.equal(a.calls, 1);
    assert.equal(b.calls, 1);
  });

  test('a failed provider is skipped during its cooldown and retried once it has passed', async () => {
    const a = makeProvider('a', { generate: throwing('boom A') });
    const b = makeProvider('b');
    const { chain, clock } = makeChain([a, b]);

    await chain.generate({}, parseJson);
    assert.equal(a.calls, 1);

    clock.advance(30 * SECOND - 1);
    assert.equal((await chain.generate({}, parseJson)).provider, 'b');
    assert.equal(a.calls, 1, 'still cooling down 1 ms before the end');

    clock.advance(1);
    await chain.generate({}, parseJson);
    assert.equal(a.calls, 2, 'retried as soon as the cooldown has elapsed');
  });

  test('a provider that recovers after its cooldown wins again, being first in the chain', async () => {
    const a = makeProvider('a', { generate: (_req, n) => (n === 1 ? Promise.reject(new Error('boom')) : goodResult('a')) });
    const b = makeProvider('b');
    const { chain, clock } = makeChain([a, b]);

    assert.equal((await chain.generate({}, parseJson)).provider, 'b');
    clock.advance(31 * SECOND);
    assert.equal((await chain.generate({}, parseJson)).provider, 'a');
    assert.equal(chain.status()[0].failures, 0, 'success resets the failure count');
    assert.ok(chain.status()[0].cooldownUntil <= clock(), 'the old cooldown has expired');
  });

  test('generic errors get a growing cooldown, capped at 15 minutes', async () => {
    const a = makeProvider('a', { generate: throwing('boom') });
    const { chain, clock } = makeChain([a]);
    const seen = [];
    for (let i = 0; i < 8; i++) {
      await assert.rejects(chain.generate({}, parseJson));
      seen.push(cooldownOf(chain, clock));
      clock.advance(seen.at(-1)); // wait out the cooldown
    }
    assert.deepEqual(seen, [30 * SECOND, 60 * SECOND, 120 * SECOND, 240 * SECOND, 480 * SECOND, 15 * MINUTE, 15 * MINUTE, 15 * MINUTE]);
    assert.equal(chain.status()[0].failures, 8);
  });

  test('a success resets the failure counter, so the next failure starts from the short cooldown again', async () => {
    let mode = 'fail';
    const a = makeProvider('a', { generate: () => (mode === 'fail' ? Promise.reject(new Error('boom')) : goodResult('a')) });
    const { chain, clock } = makeChain([a]);

    await assert.rejects(chain.generate({}, parseJson));
    clock.advance(30 * SECOND);
    await assert.rejects(chain.generate({}, parseJson));
    assert.equal(cooldownOf(chain, clock), 60 * SECOND);
    clock.advance(60 * SECOND);

    mode = 'ok';
    await chain.generate({}, parseJson);
    assert.equal(chain.status()[0].failures, 0);

    mode = 'fail';
    await assert.rejects(chain.generate({}, parseJson));
    assert.equal(cooldownOf(chain, clock), 30 * SECOND);
  });

  test('HTTP 429 earns a longer cooldown (30 min) than a generic error (30 s)', async () => {
    const limited = makeProvider('limited', { generate: throwing('too many requests', { status: 429 }) });
    const flaky = makeProvider('flaky', { generate: throwing('boom') });
    const { chain, clock } = makeChain([limited, flaky]);

    await assert.rejects(chain.generate({}, parseJson));

    const rateLimited = cooldownOf(chain, clock, 0);
    const generic = cooldownOf(chain, clock, 1);
    assert.equal(rateLimited, 30 * MINUTE);
    assert.equal(generic, 30 * SECOND);
    assert.ok(rateLimited > generic);
  });

  test('an HTTP 429 status is a rate limit even when the message does not say so', async () => {
    const a = makeProvider('a', { generate: throwing('upstream said no', { status: 429 }) });
    const { chain, clock } = makeChain([a]);
    await assert.rejects(chain.generate({}, parseJson));
    assert.equal(cooldownOf(chain, clock), 30 * MINUTE);

    const other = makeProvider('b', { generate: throwing('upstream said no', { status: 503 }) });
    const second = makeChain([other]);
    await assert.rejects(second.chain.generate({}, parseJson));
    assert.equal(cooldownOf(second.chain, second.clock), 30 * SECOND, 'other statuses are ordinary errors');
  });

  test('quota-style error messages are also treated as rate limits (30 min)', async () => {
    const messages = [
      'You exceeded your current quota',
      'Rate limit reached',
      'rate-limit exceeded',
      'ratelimit hit',
      'rate_limit_exceeded',
      'You have hit your usage limit',
      'Too Many Requests',
      'HTTP 429 from upstream',
      'error 429',
    ];
    for (const message of messages) {
      const a = makeProvider('a', { generate: throwing(message) });
      const { chain, clock } = makeChain([a]);
      await assert.rejects(chain.generate({}, parseJson));
      assert.equal(cooldownOf(chain, clock), 30 * MINUTE, message);
    }
  });

  test('a plain error that merely contains the letters "rate" (e.g. "generate") is not a rate limit', async () => {
    for (const message of ['failed to generate a response', 'could not separate the segments', 'integrate step failed']) {
      const a = makeProvider('a', { generate: throwing(message) });
      const { chain, clock } = makeChain([a]);
      await assert.rejects(chain.generate({}, parseJson));
      assert.equal(cooldownOf(chain, clock), 30 * SECOND, message);
    }
  });

  test('other messages that mention "limit" or a number close to 429 are not rate limits either', async () => {
    for (const message of ['request body size limit exceeded', 'unlimited', 'error 4290', 'port 1429 refused', 'HTTP 500']) {
      const a = makeProvider('a', { generate: throwing(message) });
      const { chain, clock } = makeChain([a]);
      await assert.rejects(chain.generate({}, parseJson));
      assert.equal(cooldownOf(chain, clock), 30 * SECOND, message);
    }
  });

  test('a rate-limited provider is retried only after its 30 minutes are over', async () => {
    const a = makeProvider('a', { generate: (_req, n) => (n === 1 ? Promise.reject(new Error('usage limit reached')) : goodResult('a')) });
    const b = makeProvider('b');
    const { chain, clock } = makeChain([a, b]);

    assert.equal((await chain.generate({}, parseJson)).provider, 'b');
    clock.advance(30 * MINUTE - 1);
    assert.equal((await chain.generate({}, parseJson)).provider, 'b');
    assert.equal(a.calls, 1);
    clock.advance(1);
    assert.equal((await chain.generate({}, parseJson)).provider, 'a');
  });

  test('providers whose available() is false are skipped, and may come back later', async () => {
    const a = makeProvider('a', { available: false });
    const b = makeProvider('b');
    const { chain } = makeChain([a, b]);

    assert.equal((await chain.generate({}, parseJson)).provider, 'b');
    assert.equal(a.calls, 0);
    assert.equal(chain.status()[0].configured, false);

    a.enabled = true;
    assert.equal((await chain.generate({}, parseJson)).provider, 'a');
  });

  test('throws when every provider is unavailable', async () => {
    const { chain } = makeChain([makeProvider('a', { available: false }), makeProvider('b', { available: false })]);
    await assert.rejects(chain.generate({}, parseJson), /no AI provider available \(all paused\)/);
  });

  test('throws an Error mentioning each provider when all of them fail', async () => {
    const a = makeProvider('alpha', { generate: throwing('boom A') });
    const b = makeProvider('beta', { generate: throwing('boom B') });
    const { chain } = makeChain([a, b]);

    await assert.rejects(chain.generate({}, parseJson), (err) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /^no AI provider available \(alpha: boom A \| beta: boom B\)$/);
      return true;
    });
  });

  test('providers still cooling down are not called again and not listed as failures', async () => {
    const a = makeProvider('a', { generate: throwing('boom A') });
    const { chain } = makeChain([a]);
    await assert.rejects(chain.generate({}, parseJson), /a: boom A/);

    await assert.rejects(chain.generate({}, parseJson), (err) => {
      assert.match(err.message, /^no AI provider available \(all paused\)$/);
      assert.ok(!/boom A/.test(err.message));
      return true;
    });
    assert.equal(a.calls, 1);
  });

  test('a validate() that throws counts as a provider failure, so garbage falls through to the next provider', async () => {
    const a = makeProvider('a', { generate: async () => ({ text: 'esto no es JSON', usage: {} }) });
    const b = makeProvider('b');
    const { chain, clock, usage } = makeChain([a, b]);

    const out = await chain.generate({}, parseJson);

    assert.equal(out.provider, 'b');
    assert.equal(a.calls, 1);
    assert.equal(chain.status()[0].failures, 1);
    assert.ok(cooldownOf(chain, clock, 0) > 0, 'the garbage provider is put on cooldown');
    const aRecord = usage.records.find((r) => r.name === 'a');
    assert.equal(aRecord.ok, false);
    assert.match(aRecord.error, /JSON/);
  });

  test('when validate() rejects every provider the error lists all of them', async () => {
    const a = makeProvider('a', { generate: async () => ({ text: 'basura A' }) });
    const b = makeProvider('b', { generate: async () => ({ text: 'basura B' }) });
    const { chain } = makeChain([a, b]);
    const validate = (text) => {
      throw new Error(`inválido: ${text}`);
    };

    await assert.rejects(chain.generate({}, validate), /a: inválido: basura A \| b: inválido: basura B/);
  });

  test('validate() receives the raw text and its return value is what the caller gets', async () => {
    const a = makeProvider('a', { generate: async () => ({ text: 'raw text' }) });
    const { chain } = makeChain([a]);
    const out = await chain.generate({}, (text) => ({ wrapped: text.toUpperCase() }));
    assert.deepEqual(out.value, { wrapped: 'RAW TEXT' });
  });

  test('a provider result without usage is accepted', async () => {
    const a = makeProvider('a', { generate: async () => ({ text: '{}' }) });
    const { chain, usage } = makeChain([a]);
    await chain.generate({}, parseJson);
    assert.deepEqual(usage.records, [{ name: 'a', ok: true, ms: 0 }]);
  });

  test('status() reports configured, cooldown and failures for every provider', async () => {
    const a = makeProvider('a', { generate: throwing('boom') });
    const b = makeProvider('b', { available: false });
    const { chain, clock } = makeChain([a, b]);
    assert.deepEqual(chain.status(), [
      { name: 'a', configured: true, cooldownUntil: null, failures: 0 },
      { name: 'b', configured: false, cooldownUntil: null, failures: 0 },
    ]);

    await assert.rejects(chain.generate({}, parseJson));
    assert.deepEqual(chain.status()[0], { name: 'a', configured: true, cooldownUntil: clock() + 30 * SECOND, failures: 1 });
  });

  test('logs a warning in English when a provider fails, with the length of its pause', async () => {
    const warnings = [];
    const log = { info() {}, error() {}, warn: (message) => warnings.push(message) };
    const a = makeProvider('a', { generate: throwing('boom A') });
    const limited = makeProvider('limited', { generate: throwing('Too Many Requests', { status: 429 }) });
    const { chain } = makeChain([a, limited], { log });

    await assert.rejects(chain.generate({}, parseJson));

    assert.deepEqual(warnings, ['[ai] a failed (boom A); pausing it for 30 s', '[ai] limited failed (Too Many Requests); pausing it for 1800 s']);
  });

  test('works with a logger that has no warn()', async () => {
    const a = makeProvider('a', { generate: throwing('boom') });
    const { chain } = makeChain([a], { log: {} });
    await assert.rejects(chain.generate({}, parseJson), /no AI provider available \(a: boom\)/);
  });

  test('the request, including its stage, reaches the provider untouched, for write and review alike', async () => {
    const a = makeProvider('a');
    const { chain } = makeChain([a]);
    const write = { stage: 'write', prompt: 'p', stories: [], channelName: 'TEST', program: { id: 'x' }, presenters: { A: { name: 'Ann' } }, count: 3 };
    const review = { stage: 'review', prompt: 'p', script: { title: 'T', segments: [] }, stories: [], channelName: 'TEST' };
    await chain.generate(write, parseJson);
    await chain.generate(review, parseJson);
    assert.deepEqual(a.requests, [write, review]);
  });
});

describe('ProviderChain usage tracking', () => {
  test('records ok calls with duration and token usage', async () => {
    const clock = makeClock();
    const a = makeProvider('a', {
      generate: async () => {
        clock.advance(250);
        return goodResult('a');
      },
    });
    const { chain, usage } = makeChain([a], { clock });

    await chain.generate({}, parseJson);

    assert.deepEqual(usage.records, [{ name: 'a', ok: true, ms: 250, input: 10, output: 20, cached: 5 }]);
  });

  test('records failed calls with the error message and no token usage', async () => {
    const clock = makeClock();
    const a = makeProvider('a', {
      generate: async () => {
        clock.advance(40);
        throw new Error('kaput');
      },
    });
    const b = makeProvider('b');
    const { chain, usage } = makeChain([a, b], { clock });

    await chain.generate({}, parseJson);

    assert.deepEqual(usage.records, [
      { name: 'a', ok: false, ms: 40, error: 'kaput' },
      { name: 'b', ok: true, ms: 0, input: 10, output: 20, cached: 5 },
    ]);
  });

  test('works with a real UsageTracker (no persistence)', async () => {
    const tracker = new UsageTracker(null);
    const a = makeProvider('a', { generate: throwing('boom') });
    const b = makeProvider('b');
    const { chain } = makeChain([a, b], { usage: tracker });

    await chain.generate({}, parseJson);

    const [today] = Object.values(tracker.data.days);
    assert.deepEqual(today.a, { calls: 1, errors: 1, input: 0, output: 0, cached: 0, ms: 0 });
    assert.deepEqual(today.b, { calls: 1, errors: 0, input: 10, output: 20, cached: 5, ms: 0 });
    assert.equal(tracker.data.lastError.a.error, 'boom');
  });
});

// ---------------------------------------------------------------- createProviders

describe('createProviders', () => {
  const cfg = (providers) => ({
    providers,
    codex: { bin: 'codex', model: 'm', extraArgs: [], timeoutMs: 1000 },
    openai: { apiKey: 'k', model: 'gpt', baseUrl: 'https://api.openai.test/v1' },
    deepseek: { apiKey: '', model: 'ds', baseUrl: 'https://api.deepseek.test/v1' },
  });

  test('builds providers in the configured order and ignores unknown names', () => {
    const providers = createProviders(cfg(['mock', 'openai', 'bogus', 'deepseek', 'codex']));
    assert.deepEqual(providers.map((p) => p.name), ['mock', 'openai', 'deepseek', 'codex']);
  });

  test('availability follows the configuration (api keys)', () => {
    const byName = Object.fromEntries(createProviders(cfg(['mock', 'openai', 'deepseek'])).map((p) => [p.name, p]));
    assert.equal(byName.mock.available(), true);
    assert.equal(byName.openai.available(), true);
    assert.equal(byName.deepseek.available(), false);
  });

  test('returns an empty list when nothing valid is configured', () => {
    assert.deepEqual(createProviders(cfg([])), []);
    assert.deepEqual(createProviders(cfg(['nope'])), []);
  });
});

// ---------------------------------------------------------------- mock provider

describe('mock provider', () => {
  const stories = [
    { id: 's1', title: 'Fire leaves three injured in Valencia', summary: 'Firefighters put out the blaze. Several people were evacuated. Third sentence.', source: 'BBC News', category: 'world', image: null },
    { id: 's2', title: 'Apple unveils new chip for the phone', summary: 'The chip is faster. It arrives in autumn.', source: 'The Verge', category: 'tech', image: 'https://img.test/chip.jpg' },
    { id: 's3', title: 'City council opens the municipal pool', summary: '', source: 'NPR', category: 'world', image: null },
    { id: 's4', title: 'BREAKING: train timetable changes', summary: 'New timetable from tomorrow.', source: 'Sky News', category: 'world', image: 'https://img.test/train.jpg' },
  ];
  const lightStories = [
    { id: 'l1', title: 'New robot learns to cook', summary: 'The robot can make omelettes. It is slow.', source: 'Wired', category: 'tech', image: null },
    { id: 'l2', title: 'NASA telescope spots a new planet', summary: 'Astronomers are thrilled. More data is due.', source: 'NASA', category: 'science', image: null },
    { id: 'l3', title: 'Scientists discover a talking parrot', summary: 'The bird knows 50 words. It is very polite.', source: 'ScienceDaily', category: 'science', image: null },
    { id: 'l4', title: 'Software update fixes the app', summary: 'Users are relieved. It took a week.', source: 'TechCrunch', category: 'tech', image: null },
  ];
  const MAX = { name: 'Max Circuit', personality: 'excitable gadget geek' };
  const ADA = { name: 'Ada Volt', personality: 'sharp analyst' };
  const DUO = { A: MAX, B: ADA };
  const SOLO = { A: { name: 'Penny Sterling', personality: 'markets correspondent' } };
  const PROGRAM = { id: 'tech-bytes', title: 'TECH BYTES', stories: 4, maxChats: 2 };

  const raw = async (request) => extractJson((await createMockProvider().generate({ channelName: 'TEST', presenters: DUO, program: PROGRAM, ...request })).text);
  const kinds = (script) => script.segments.map((s) => s.type);
  const storySegs = (script) => script.segments.filter((s) => s.type === 'story');
  /** The spoken words of a segment: the stage directions in [brackets] taken out. */
  const spoken = (text) => parseCues(text).text;
  const cueTokens = (text) => [...text.matchAll(/\[(?:([AB]):)?([a-z_]+)\]/g)].map((m) => ({ slot: m[1] || null, name: m[2] }));

  test('is always available and named "mock"', () => {
    const mock = createMockProvider();
    assert.equal(mock.name, 'mock');
    assert.equal(mock.available(), true);
  });

  test('generate() returns JSON text plus zeroed usage', async () => {
    const result = await createMockProvider().generate({ stories, channelName: 'TEST' });
    assert.deepEqual(result.usage, { input: 0, output: 0, cached: 0 });
    assert.equal(typeof extractJson(result.text), 'object');
  });

  test('the review stage returns the script it was given, unchanged', async () => {
    const script = { title: 'Reviewed', segments: [{ type: 'story', storyId: 's1', anchor: 'A', emotion: 'neutral', text: 'Text.', location: null, fact: '7.1 MAGNITUDE' }] };
    const result = await createMockProvider().generate({ stage: 'review', script, stories, channelName: 'TEST', program: PROGRAM, presenters: DUO });
    assert.deepEqual(JSON.parse(result.text), script);
    assert.deepEqual(result.usage, { input: 0, output: 0, cached: 0 });
  });

  test('the write stage is the default', async () => {
    const script = await raw({ stories });
    assert.equal(script.title, 'TECH BYTES (demo)');
    assert.equal(kinds(script)[0], 'intro');
  });

  test('is programme-aware: the intro, outro and title use the programme, the channel and the presenter', async () => {
    const script = await raw({ stage: 'write', stories });
    assert.equal(script.title, 'TECH BYTES (demo)');
    assert.equal(spoken(script.segments[0].text), "Hello and welcome to TECH BYTES on TEST. I'm Max Circuit. Here's what's making news.");
    assert.equal(spoken(script.segments.at(-1).text), "That's TECH BYTES for now. Stay with us here on TEST.");
  });

  test('writes stage directions into the text: the intro and outro wave, the intro points at the viewer', async () => {
    const script = await raw({ stories });
    assert.equal(script.segments[0].text, "Hello [wave] and welcome to TECH BYTES on TEST. I'm Max Circuit. [point_camera] Here's what's making news.");
    assert.equal(script.segments.at(-1).text, "That's TECH BYTES for now. [wave] Stay with us here on TEST.");
  });

  test('without a programme it falls back to the channel name, and without presenters to a generic presenter', async () => {
    const script = extractJson((await createMockProvider().generate({ stories, channelName: 'TEST' })).text);
    assert.equal(script.title, 'TEST (demo)');
    assert.equal(spoken(script.segments[0].text), "Hello and welcome to TEST on TEST. I'm the presenter. Here's what's making news.");
  });

  test('covers as many stories as asked for, up to what it has: count, then program.stories, then 5', async () => {
    assert.equal(storySegs(await raw({ stories, count: 2 })).length, 2);
    assert.equal(storySegs(await raw({ stories, count: 10 })).length, 4);
    assert.equal(storySegs(await raw({ stories, count: undefined, program: { ...PROGRAM, stories: 3 } })).length, 3);
    const many = Array.from({ length: 8 }, (_, i) => ({ ...stories[0], id: `m${i}` }));
    assert.equal(storySegs(await raw({ stories: many, count: undefined, program: undefined })).length, 5);
  });

  test('end-to-end: generate -> extractJson -> normalizeBulletin gives a valid bulletin', async () => {
    const { text } = await createMockProvider().generate({ stories, channelName: 'TEST', program: PROGRAM, presenters: DUO, count: 4 });
    const bulletin = normalizeBulletin(extractJson(text), stories, { channelName: 'TEST', maxStories: 4, maxChats: 2 });

    const segs = bulletin.segments.filter((s) => s.type === 'story');
    assert.equal(segs.length, stories.length, 'one story segment per input story');
    assert.deepEqual(segs.map((s) => s.storyId), stories.map((s) => s.id));
    assert.deepEqual(bulletin.storyIds, stories.map((s) => s.id));
    assert.deepEqual(bulletin.rundown.map((r) => r.storyId), stories.map((s) => s.id));

    assert.equal(bulletin.segments[0].type, 'intro');
    assert.match(bulletin.segments[0].text, /TECH BYTES/);
    assert.equal(bulletin.segments.at(-1).type, 'outro');
    assert.match(bulletin.segments.at(-1).text, /TEST/);
    assert.equal(bulletin.title, 'TECH BYTES (demo)');

    for (const seg of segs) {
      const story = stories.find((s) => s.id === seg.storyId);
      assert.ok(seg.headline.length > 0 && seg.headline.length <= 56);
      assert.ok(seg.text.includes(story.source), `text mentions ${story.source}`);
      assert.equal(seg.hasImage, !!story.image);
      assert.equal(seg.source, story.source);
      assert.equal(seg.category, story.category);
      assert.equal(seg.location, null);
      assert.equal(seg.fact, null);
    }
  });

  test('picks the tone from the content, alternates the anchors and varies the shots', async () => {
    const segs = storySegs(await raw({ stories }));
    assert.equal(segs[0].emotion, 'serious'); // fire / injured
    assert.equal(segs[1].emotion, 'happy'); // tech
    assert.equal(segs[2].emotion, 'neutral');
    assert.deepEqual(segs.map((s) => s.anchor), ['A', 'B', 'A', 'B']);
    assert.deepEqual(segs.map((s) => s.shot), ['wide', 'full', 'wide', 'close']);
    assert.deepEqual(segs.map((s) => s.breaking), [false, false, false, true]);
  });

  test('adds a chat after light stories, but never after the last story or a grave one', async () => {
    assert.deepEqual(kinds(await raw({ stories })), ['intro', 'story', 'story', 'chat', 'story', 'story', 'outro']);
    // l1..l4 are all light: a chat after each except the last
    assert.deepEqual(kinds(await raw({ stories: lightStories, program: { ...PROGRAM, maxChats: 9 } })), ['intro', 'story', 'chat', 'story', 'chat', 'story', 'chat', 'story', 'outro']);
  });

  test('the chat is spoken by the other presenter', async () => {
    const script = await raw({ stories: lightStories, program: { ...PROGRAM, maxChats: 1 } });
    const idx = script.segments.findIndex((s) => s.type === 'chat');
    assert.notEqual(script.segments[idx].anchor, script.segments[idx - 1].anchor);
  });

  test('never writes more chats than program.maxChats', async () => {
    for (const maxChats of [0, 1, 2, 3]) {
      const script = await raw({ stories: lightStories, program: { ...PROGRAM, maxChats } });
      assert.equal(script.segments.filter((s) => s.type === 'chat').length, Math.min(maxChats, 3), `maxChats=${maxChats}`);
    }
  });

  test('solo programmes: only anchor "A", no chats (even with light stories), outro by "A"', async () => {
    const script = await raw({ stories: lightStories, presenters: SOLO, program: { id: 'money-minute', title: 'MONEY MINUTE', stories: 4, maxChats: 3 } });
    assert.ok(!kinds(script).includes('chat'));
    assert.ok(script.segments.every((s) => s.anchor === 'A'), JSON.stringify(script.segments.map((s) => s.anchor)));
    assert.match(script.segments[0].text, /I'm Penny Sterling/);
    assert.equal(script.segments.at(-1).type, 'outro');
  });

  test('"news-60" gets one sentence per story, other programmes two', async () => {
    const quick = storySegs(await raw({ stories, program: { id: 'news-60', title: 'NEWS IN 60', stories: 4, maxChats: 0 }, presenters: SOLO }));
    const full = storySegs(await raw({ stories }));
    assert.equal(spoken(quick[0].text), 'BBC News reports: Fire leaves three injured in Valencia. Firefighters put out the blaze.');
    assert.equal(spoken(full[0].text), 'BBC News reports: Fire leaves three injured in Valencia. Firefighters put out the blaze. Several people were evacuated.');
  });

  test('works with a single story whose summary is empty', async () => {
    const one = [stories[2]];
    const { text } = await createMockProvider().generate({ stories: one, channelName: 'TEST', program: PROGRAM, presenters: DUO });
    const bulletin = normalizeBulletin(extractJson(text), one, { channelName: 'TEST' });
    assert.equal(bulletin.segments.filter((s) => s.type === 'story').length, 1);
    assert.equal(bulletin.segments[1].text, 'NPR reports: City council opens the municipal pool.');
  });

  test('every [cue] it writes is part of the shared vocabulary (public/js/cues.js)', async () => {
    const scripts = [
      await raw({ stories }),
      await raw({ stories: lightStories, program: { ...PROGRAM, maxChats: 9 } }),
      await raw({ stories: lightStories, presenters: SOLO }),
    ];
    let seen = 0;
    for (const script of scripts) {
      for (const seg of script.segments) {
        for (const { name } of cueTokens(seg.text)) {
          seen++;
          assert.ok(name in ACTIONS || CUE_EMOTIONS.includes(name), `unknown cue [${name}] in "${seg.text}"`);
        }
      }
    }
    assert.ok(seen > 10, `only ${seen} cues were written`);
  });

  test('gives no light gestures to a grave story, and no cue at presenter B in a solo programme', async () => {
    const script = await raw({ stories });
    const grave = storySegs(script).find((s) => s.emotion === 'serious');
    assert.ok(grave, 'there is a grave story');
    for (const { name } of cueTokens(grave.text)) assert.ok(!ACTIONS[name]?.light, `[${name}] in a grave story`);

    const solo = await raw({ stories: lightStories, presenters: SOLO });
    assert.ok(solo.segments.every((s) => cueTokens(s.text).every((t) => t.slot !== 'B')), 'no [B:...] cue');
    const duo = await raw({ stories: lightStories });
    assert.ok(duo.segments.some((s) => cueTokens(s.text).some((t) => t.slot === 'B')), 'a duo programme does use [B:...] cues');
  });

  test('its stage directions come through normalizeBulletin as cues (those without an underscore in their name)', async () => {
    const { text } = await createMockProvider().generate({ stories: lightStories, channelName: 'TEST', program: { ...PROGRAM, maxChats: 9 }, presenters: DUO, count: 4 });
    const bulletin = normalizeBulletin(extractJson(text), lightStories, { channelName: 'TEST', maxStories: 4, maxChats: 9 });
    const [intro, firstStory, chat] = [bulletin.segments[0], bulletin.segments[1], bulletin.segments[2]];
    assert.ok(intro.cues.some((c) => c.action === 'wave'));
    assert.ok(!intro.text.includes('['), 'the brackets never reach the spoken text');
    assert.ok(firstStory.cues.some((c) => c.action === 'nod' && c.slot === 'B'), 'presenter B nods at the first story');
    assert.deepEqual(chat.cues.map((c) => c.action), ['wow', 'papers']);
    assert.equal(chat.text, 'Fascinating stuff. Let us move on.');
    assert.ok(bulletin.segments.at(-1).cues.some((c) => c.action === 'wave'));
    for (const seg of bulletin.segments) assert.ok(!seg.text.includes('['), seg.text);
  });

  test('plugs into a ProviderChain with the same validate step the producer uses, for both stages', async () => {
    const { chain } = makeChain([createMockProvider()]);
    const validate = (text) => normalizeBulletin(extractJson(text), stories, { channelName: 'TEST', maxStories: 4, maxChats: 2 });

    const written = await chain.generate({ stage: 'write', stories, channelName: 'TEST', program: PROGRAM, presenters: DUO, count: 4 }, validate);
    assert.equal(written.provider, 'mock');
    assert.equal(written.value.storyIds.length, stories.length);

    const script = { title: written.value.title, segments: written.value.segments.map(({ source, category, hasImage, ...seg }) => seg) };
    const reviewed = await chain.generate({ stage: 'review', script, stories, channelName: 'TEST', program: PROGRAM, presenters: DUO }, validate);
    // (stage directions are compared in test/producer.test.js: the review round trip currently loses them)
    const words = (bulletin) => ({ ...bulletin, segments: bulletin.segments.map(({ cues, ...seg }) => seg) });
    assert.deepEqual(words(reviewed.value), words(written.value), 'the mock editor changes no words');
  });

  test(
    'does not read harmless words that merely contain "die", such as "studies" or "audience", as grave news',
    {
      todo:
        'BUG server/providers/mock.js:4 - GRAVE has no word boundaries: /die[sd]?/ matches inside "studies", "audience", "soldiers" and /fire/ inside "fireworks", so "Studies show coffee helps memory" gets emotion "serious" (and no chat)',
    },
    async () => {
      const harmless = [{ id: 'h1', title: 'Studies show coffee helps memory', summary: 'A large audience of readers agreed.', source: 'BBC News', category: 'science', image: null }];
      const [seg] = storySegs(await raw({ stories: harmless }));
      assert.notEqual(seg.emotion, 'serious');
    }
  );

  test(
    'only flags a story as breaking when it is breaking news, not for "record-breaking" or "breaking into"',
    {
      todo:
        'BUG server/providers/mock.js:43 (same regex as server/station.js:3) - /\\bbreaking\\b/i matches "Record-breaking heatwave" and "Man charged with breaking into home", so they are marked breaking: true',
    },
    async () => {
      const normal = [{ id: 'b1', title: 'Record-breaking heatwave hits southern Europe', summary: 'Temperatures soared.', source: 'BBC News', category: 'world', image: null }];
      const [seg] = storySegs(await raw({ stories: normal }));
      assert.equal(seg.breaking, false);
    }
  );
});

// ---------------------------------------------------------------- OpenAI-compatible provider

describe('createOpenAICompatProvider', () => {
  const CFG = { apiKey: 'k', model: 'm', baseUrl: 'https://x.test/v1/' };

  const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  const completion = (content, usage) => ({ choices: [{ message: { content } }], ...(usage ? { usage } : {}) });

  /** Fake fetch that records each call and answers with `respond()`. */
  function fakeFetch(respond = () => jsonResponse(completion('{"ok":true}'))) {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      return respond();
    };
    fetchImpl.calls = calls;
    return fetchImpl;
  }

  test('POSTs to <baseUrl>/chat/completions without a double slash', async () => {
    for (const baseUrl of ['https://x.test/v1/', 'https://x.test/v1']) {
      const f = fakeFetch();
      await createOpenAICompatProvider('openai', { ...CFG, baseUrl }, f).generate({ prompt: 'hola' });
      assert.equal(f.calls.length, 1);
      assert.equal(f.calls[0].url, 'https://x.test/v1/chat/completions', baseUrl);
      assert.equal(f.calls[0].init.method, 'POST');
    }
  });

  test('sends the bearer token and a JSON content type', async () => {
    const f = fakeFetch();
    await createOpenAICompatProvider('openai', CFG, f).generate({ prompt: 'hola' });
    assert.equal(f.calls[0].init.headers.authorization, 'Bearer k');
    assert.equal(f.calls[0].init.headers['content-type'], 'application/json');
  });

  test('requests a json_object response with the model, a system message and the prompt', async () => {
    const f = fakeFetch();
    await createOpenAICompatProvider('openai', CFG, f).generate({ prompt: 'escribe el boletín' });
    const { body, init } = f.calls[0];
    assert.equal(body.model, 'm');
    assert.deepEqual(body.response_format, { type: 'json_object' });
    assert.deepEqual(body.messages.map((m) => m.role), ['system', 'user']);
    assert.equal(body.messages[1].content, 'escribe el boletín');
    assert.ok(init.signal instanceof AbortSignal, 'requests must have a timeout');
  });

  test('the system message is in English and asks for a single JSON object', async () => {
    const f = fakeFetch();
    await createOpenAICompatProvider('openai', CFG, f).generate({ prompt: 'write the bulletin' });
    const [system] = f.calls[0].body.messages;
    assert.equal(system.content, 'You write scripts for a TV news channel. Always reply with a single valid JSON object.');
  });

  test('returns the message content and maps usage (prompt/completion/cached tokens)', async () => {
    const f = fakeFetch(() =>
      jsonResponse(completion('{"title":"T"}', { prompt_tokens: 120, completion_tokens: 45, prompt_tokens_details: { cached_tokens: 100 } }))
    );
    const result = await createOpenAICompatProvider('openai', CFG, f).generate({ prompt: 'p' });
    assert.deepEqual(result, { text: '{"title":"T"}', usage: { input: 120, output: 45, cached: 100 } });
  });

  test('maps the DeepSeek-style prompt_cache_hit_tokens to cached', async () => {
    const f = fakeFetch(() => jsonResponse(completion('{}', { prompt_tokens: 10, completion_tokens: 2, prompt_cache_hit_tokens: 7 })));
    const { usage } = await createOpenAICompatProvider('deepseek', CFG, f).generate({ prompt: 'p' });
    assert.deepEqual(usage, { input: 10, output: 2, cached: 7 });
  });

  test('tolerates a response without usage or without choices', async () => {
    const noUsage = await createOpenAICompatProvider('openai', CFG, fakeFetch(() => jsonResponse(completion('{}')))).generate({ prompt: 'p' });
    assert.deepEqual(noUsage.usage, { input: 0, output: 0, cached: 0 });

    const noChoices = await createOpenAICompatProvider('openai', CFG, fakeFetch(() => jsonResponse({ choices: [] }))).generate({ prompt: 'p' });
    assert.equal(noChoices.text, '');
  });

  test('throws an error carrying the HTTP status on a 429', async () => {
    const f = fakeFetch(() => new Response('{"error":{"message":"Rate limit exceeded"}}', { status: 429 }));
    const provider = createOpenAICompatProvider('openai', CFG, f);
    await assert.rejects(provider.generate({ prompt: 'p' }), (err) => {
      assert.ok(err instanceof Error);
      assert.equal(err.status, 429);
      assert.match(err.message, /openai HTTP 429/);
      assert.match(err.message, /Rate limit exceeded/);
      return true;
    });
  });

  test('other HTTP errors also carry their status, and the body in the message is truncated', async () => {
    const f = fakeFetch(() => new Response('x'.repeat(5000), { status: 503 }));
    await assert.rejects(createOpenAICompatProvider('deepseek', CFG, f).generate({ prompt: 'p' }), (err) => {
      assert.equal(err.status, 503);
      assert.match(err.message, /^deepseek HTTP 503: x+$/);
      assert.ok(err.message.length < 250);
      return true;
    });
  });

  test('available() is false with an empty or missing apiKey and true otherwise', () => {
    assert.equal(createOpenAICompatProvider('openai', { ...CFG, apiKey: '' }, fakeFetch()).available(), false);
    assert.equal(createOpenAICompatProvider('openai', { ...CFG, apiKey: undefined }, fakeFetch()).available(), false);
    assert.equal(createOpenAICompatProvider('openai', CFG, fakeFetch()).available(), true);
  });

  test('uses the given name', () => {
    assert.equal(createOpenAICompatProvider('deepseek', CFG, fakeFetch()).name, 'deepseek');
  });

  test('a 429 from the provider puts it on the long (30 min) cooldown inside a ProviderChain', async () => {
    const limited = createOpenAICompatProvider('openai', CFG, fakeFetch(() => new Response('slow down', { status: 429 })));
    const { chain, clock } = makeChain([limited, createMockProvider()]);

    const out = await chain.generate({ prompt: 'p', stories: [], channelName: 'TEST' }, (text) => extractJson(text));

    assert.equal(out.provider, 'mock');
    assert.equal(cooldownOf(chain, clock, 0), 30 * MINUTE);
  });

  test('inside a ProviderChain, token usage from the API is recorded', async () => {
    const f = fakeFetch(() => jsonResponse(completion('{"a":1}', { prompt_tokens: 3, completion_tokens: 4, prompt_tokens_details: { cached_tokens: 1 } })));
    const { chain, usage } = makeChain([createOpenAICompatProvider('openai', CFG, f)]);
    await chain.generate({ prompt: 'p' }, parseJson);
    assert.deepEqual(usage.records, [{ name: 'openai', ok: true, ms: 0, input: 3, output: 4, cached: 1 }]);
  });
});

// ---------------------------------------------------------------- UsageTracker

describe('UsageTracker', () => {
  const tempDir = (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'livenews-usage-test-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return dir;
  };
  const dayKey = (offsetDays = 0) => new Date(Date.now() - offsetDays * 86_400_000).toISOString().slice(0, 10);

  test('with dataDir=null it keeps everything in memory and never writes a file', () => {
    const tracker = new UsageTracker(null);
    assert.equal(tracker.file, null);
    tracker.record('a', { ok: true });
    tracker.save();
    assert.equal(Object.values(tracker.data.days)[0].a.calls, 1);
  });

  test('accumulates calls, errors, tokens and time per provider', () => {
    const tracker = new UsageTracker(null);
    tracker.record('a', { ok: true, ms: 100, input: 10, output: 5, cached: 2 });
    tracker.record('a', { ok: true, ms: 50, input: 1, output: 1 });
    tracker.record('a', { ok: false, ms: 7, error: 'boom' });
    tracker.record('b', { ok: true });

    const today = tracker.data.days[dayKey()];
    assert.deepEqual(today.a, { calls: 3, errors: 1, input: 11, output: 6, cached: 2, ms: 157 });
    assert.deepEqual(today.b, { calls: 1, errors: 0, input: 0, output: 0, cached: 0, ms: 0 });
  });

  test('remembers the last error per provider', () => {
    const tracker = new UsageTracker(null);
    tracker.record('a', { ok: false, error: 'first' });
    tracker.record('a', { ok: false, error: 'second' });
    tracker.record('b', { ok: true });
    assert.equal(tracker.data.lastError.a.error, 'second');
    assert.ok(!Number.isNaN(Date.parse(tracker.data.lastError.a.at)));
    assert.equal(tracker.data.lastError.b, undefined);
  });

  test('summary() returns today, this month and the last errors', () => {
    const tracker = new UsageTracker(null);
    tracker.data.days['2000-01-01'] = { a: { calls: 99, errors: 9, input: 1, output: 1, cached: 1, ms: 1 } }; // other month
    tracker.record('a', { ok: true, input: 4, output: 2 });
    tracker.record('a', { ok: false, error: 'x' });

    const s = tracker.summary();
    assert.equal(s.today.a.calls, 2);
    assert.deepEqual(s.month.a, { calls: 2, errors: 1, input: 4, output: 2, cached: 0 });
    assert.equal(s.lastError.a.error, 'x');
  });

  test('summary() of an empty tracker is empty', () => {
    assert.deepEqual(new UsageTracker(null).summary(), { today: {}, month: {}, lastError: {} });
  });

  test('keeps about 60 days of history', () => {
    const tracker = new UsageTracker(null);
    for (let i = 1; i <= 70; i++) {
      tracker.data.days[new Date(Date.UTC(2000, 0, i)).toISOString().slice(0, 10)] = { a: { calls: 1 } };
    }
    tracker.record('a', { ok: true });
    const days = Object.keys(tracker.data.days).sort();
    assert.equal(days.length, 60);
    assert.ok(days.includes(dayKey()), 'today is kept');
    assert.ok(!days.includes('2000-01-01'), 'oldest days are dropped');
  });

  test('persists to <dataDir>/usage.json and reloads it (creating the directory if needed)', (t) => {
    const dir = path.join(tempDir(t), 'nested', 'data');
    const first = new UsageTracker(dir);
    first.record('a', { ok: true, input: 3, output: 4 });

    const file = path.join(dir, 'usage.json');
    assert.ok(fs.existsSync(file));
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), first.data);

    const second = new UsageTracker(dir);
    assert.deepEqual(second.data, first.data);
    second.record('a', { ok: true, input: 1 });
    assert.equal(second.data.days[dayKey()].a.calls, 2);
    assert.equal(second.data.days[dayKey()].a.input, 4);
  });

  test('starts fresh when the file is corrupt, and overwrites it on the next record', (t) => {
    const dir = tempDir(t);
    fs.writeFileSync(path.join(dir, 'usage.json'), '{ this is not json');
    const tracker = new UsageTracker(dir);
    assert.deepEqual(tracker.data, { days: {}, lastError: {} });
    tracker.record('a', { ok: true });
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'usage.json'), 'utf8')).days[dayKey()].a.calls, 1);
  });

  test('starts fresh when the file is valid JSON but not a usage document', (t) => {
    for (const content of ['{}', 'null', '[]', '{"days":null}', '{"days":[]}', '{"days":"x"}', '{"days":42}', '"text"', '42']) {
      const dir = tempDir(t);
      fs.writeFileSync(path.join(dir, 'usage.json'), content);
      const tracker = new UsageTracker(dir);
      assert.deepEqual(tracker.data, { days: {}, lastError: {} }, content);
      assert.doesNotThrow(() => tracker.record('a', { ok: true }), content);
      assert.equal(tracker.data.days[dayKey()].a.calls, 1, content);
      assert.deepEqual(Object.keys(tracker.summary()), ['today', 'month', 'lastError'], content);
    }
  });

  test('a usage document without a valid lastError keeps its days and starts an empty lastError', (t) => {
    const day = { a: { calls: 7, errors: 1, input: 1, output: 2, cached: 0, ms: 5 } };
    for (const lastError of [undefined, null, 'oops', 5]) {
      const dir = tempDir(t);
      fs.writeFileSync(path.join(dir, 'usage.json'), JSON.stringify({ days: { '2026-01-01': day }, lastError }));
      const tracker = new UsageTracker(dir);
      assert.deepEqual(tracker.data, { days: { '2026-01-01': day }, lastError: {} }, String(lastError));
    }
  });

  test('a wrong-shaped file does not stop the chain from recording usage', async (t) => {
    const dir = tempDir(t);
    fs.writeFileSync(path.join(dir, 'usage.json'), '{}');
    const { chain } = makeChain([makeProvider('a')], { usage: new UsageTracker(dir) });
    assert.equal((await chain.generate({}, parseJson)).provider, 'a');
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'usage.json'), 'utf8')).days[dayKey()].a.calls, 1);
  });

  test('an unwritable data dir is non-fatal', (t) => {
    const dir = tempDir(t);
    const blocker = path.join(dir, 'file-not-dir');
    fs.writeFileSync(blocker, 'x');
    const tracker = new UsageTracker(path.join(blocker, 'sub')); // mkdir under a regular file fails
    assert.doesNotThrow(() => tracker.record('a', { ok: true }));
    assert.equal(Object.values(tracker.data.days)[0].a.calls, 1);
  });
});
