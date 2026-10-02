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

  test('the review stage is never handed to a provider that cannot review (reviews: false), which is not paused for it', async () => {
    const writer = makeProvider('writer');
    writer.reviews = false;
    const editor = makeProvider('editor');
    const { chain } = makeChain([writer, editor]);
    const out = await chain.generate({ stage: 'review', prompt: 'p' }, parseJson);
    assert.equal(out.provider, 'editor');
    assert.equal(writer.calls, 0);
    assert.equal(chain.status()[0].cooldownUntil, null);
    assert.equal((await chain.generate({ stage: 'write', prompt: 'p' }, parseJson)).provider, 'writer', 'it still writes');
  });

  test('with no provider able to review, the review fails with code NO_REVIEWER and a clear message', async () => {
    const writer = makeProvider('writer');
    writer.reviews = false;
    const { chain } = makeChain([writer]);
    await assert.rejects(chain.generate({ stage: 'review', prompt: 'p' }, parseJson), (err) => err.code === 'NO_REVIEWER' && /cannot review/.test(err.message));
  });

  test('a reviewer that is merely paused is "no provider available", not NO_REVIEWER', async () => {
    const writer = makeProvider('writer');
    writer.reviews = false;
    const editor = makeProvider('editor', { generate: throwing('boom') });
    const { chain } = makeChain([writer, editor]);
    await assert.rejects(chain.generate({ stage: 'review', prompt: 'p' }, parseJson), /editor: boom/);
    await assert.rejects(chain.generate({ stage: 'review', prompt: 'p' }, parseJson), (err) => err.code !== 'NO_REVIEWER' && /all paused/.test(err.message));
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
  // Stories with places, figures and a quotation, like the offline fixtures.
  const placed = [
    { id: 'p1', title: 'Lisbon opens a new riverside tram line', summary: 'Lisbon has opened a new tram line along the Tagus river. The city says the 9 kilometre route will carry 40,000 passengers a day and cut car traffic in the old town. “This line will change how people move around the old town,” the mayor said.', source: 'Pixelburg Post', category: 'world', image: null },
    { id: 'p2', title: 'Kenya switches on its largest solar farm near Nairobi', summary: 'A solar farm north of Nairobi has started supplying power to the national grid. Officials say it can light around 300,000 homes.', source: 'Harbour Herald', category: 'world', image: null },
    { id: 'p3', title: 'Iceland volcano erupts again on the Reykjanes peninsula', summary: 'A fissure eruption has started again on the Reykjanes peninsula in Iceland. Lava is flowing away from nearby towns.', source: 'Pixelburg Post', category: 'world', image: null },
    { id: 'p4', title: 'Peru archaeologists uncover a 3,000-year-old temple in the Andes', summary: 'Archaeologists in Peru say they have found the remains of a temple in the northern Andes. The team found painted walls.', source: 'Harbour Herald', category: 'world', image: null },
    { id: 'p5', title: 'Committee publishes its annual report', summary: 'The committee published its report on Tuesday. It runs to many pages.', source: 'Pixelburg Post', category: 'world', image: null },
    { id: 'p6', title: 'Paris zoo welcomes twin panda cubs', summary: 'A zoo in Paris says its pandas have had twins. Visitors can see them from next month.', source: 'Harbour Herald', category: 'world', image: null },
  ];
  const MAX = { id: 'max', name: 'Max Circuit', personality: 'excitable gadget geek' };
  const ADA = { id: 'ada', name: 'Ada Volt', personality: 'sharp analyst' };
  const DUO = { A: MAX, B: ADA };
  const SOLO = { A: { name: 'Penny Sterling', personality: 'markets correspondent' } };
  const PROGRAM = { id: 'tech-bytes', title: 'TECH BYTES', stories: 4, maxChats: 2 };
  const FLAGSHIP = { id: 'world-now', title: 'WORLD NOW', stories: 6, maxChats: 2, features: ['roundup', 'number', 'lighter'] };

  const raw = async (request) => extractJson((await createMockProvider().generate({ channelName: 'TEST', presenters: DUO, program: PROGRAM, ...request })).text);
  const kinds = (script) => script.segments.map((s) => s.type);
  const storySegs = (script) => script.segments.filter((s) => s.type === 'story');
  /** The spoken words of a segment: the stage directions in [brackets] taken out. */
  const spoken = (text) => parseCues(text).text;
  const cueTokens = (text) => [...text.matchAll(/\[(?:([AB]):)?([a-z_]+)\]/g)].map((m) => ({ slot: m[1] || null, name: m[2] }));
  const bulletinOf = async (request, opts = {}) => {
    const req = { channelName: 'TEST', presenters: DUO, program: PROGRAM, ...request };
    const { text } = await createMockProvider().generate(req);
    return normalizeBulletin(extractJson(text), req.stories, { channelName: 'TEST', maxStories: req.program?.stories ?? 5, maxChats: req.program?.maxChats ?? 3, solo: !req.presenters.B, features: req.program?.features || [], ...opts });
  };

  test('is always available, named "mock", and says it cannot review', () => {
    const mock = createMockProvider();
    assert.equal(mock.name, 'mock');
    assert.equal(mock.available(), true);
    assert.equal(mock.reviews, false);
  });

  test('generate() returns JSON text plus zeroed usage', async () => {
    const result = await createMockProvider().generate({ stories, channelName: 'TEST' });
    assert.deepEqual(result.usage, { input: 0, output: 0, cached: 0 });
    assert.equal(typeof extractJson(result.text), 'object');
  });

  test('asked to review anyway, it returns the script unchanged and reports that nothing was reviewed', async () => {
    const script = { title: 'Reviewed', segments: [{ type: 'story', storyId: 's1', anchor: 'A', emotion: 'neutral', text: 'Text.', location: null, fact: '7.1 MAGNITUDE' }] };
    const result = await createMockProvider().generate({ stage: 'review', script, stories, channelName: 'TEST', program: PROGRAM, presenters: DUO });
    assert.deepEqual(JSON.parse(result.text), script);
    assert.deepEqual(result.usage, { input: 0, output: 0, cached: 0 });
    assert.equal(result.reviewed, false);
  });

  test('the write stage is the default and the title marks the episode as a demo', async () => {
    const script = await raw({ stories });
    assert.equal(script.title, 'TECH BYTES (demo)');
    assert.equal(kinds(script)[0], 'intro');
  });

  test('cold open: the lead\'s headline, then the second and third stories in running order (as the montage shows them), then the greeting', async () => {
    const script = await raw({ stories: lightStories });
    const intro = script.segments[0];
    const said = spoken(intro.text);
    assert.equal(
      said,
      "New robot learns to cook. Also coming up: NASA telescope spots a new planet. Later in the programme: Scientists discover a talking parrot. This is TECH BYTES. I'm Max Circuit, with Ada Volt."
    );
    assert.deepEqual(intro.teases, ['l1', 'l2', 'l3'], 'which story each sentence is about');
    assert.ok(!intro.text.includes('[wave]'), 'a news channel nods, it does not wave');
    assert.ok(intro.text.includes('[B:nod]'), 'the co-presenter acknowledges the introduction');
  });

  test('intro shapes by programme: WORLD NOW reads three headlines and greets by the London clock; NEWS IN 60 is only its frame', async () => {
    const world = await raw({ stories: placed, program: { ...FLAGSHIP, intro: 'headlines' }, now: new Date('2026-10-02T09:00:00Z') });
    const said = spoken(world.segments[0].text);
    const heads = storySegs(world).slice(0, 3).map((x) => placed.find((p) => p.id === x.storyId).title);
    assert.equal(said, `${heads.map((h) => `${h}.`).join(' ')} Good morning, and welcome to WORLD NOW. I'm Max Circuit, with Ada Volt.`);
    const near = await raw({ stories: placed, program: { ...FLAGSHIP, intro: 'headlines' }, now: new Date('2026-10-02T10:45:00Z') });
    assert.match(spoken(near.segments[0].text), /Hello, and welcome to WORLD NOW/, 'within half an hour of noon it could air on either side: plain hello');
    const quick = await raw({ stories: placed, presenters: SOLO, program: { id: 'news-60', title: 'NEWS IN 60', stories: 5, maxChats: 0, intro: 'frame' } });
    assert.equal(spoken(quick.segments[0].text), "This is NEWS IN 60. I'm Penny Sterling.");
  });

  test('a grave top story opens soberly: no wave, a serious face, a nod', async () => {
    const script = await raw({ stories: stories.filter((x) => x.id !== 's4') });
    const intro = script.segments[0];
    assert.equal(intro.emotion, 'serious');
    assert.ok(!intro.text.includes('[wave]'), intro.text);
    assert.ok(intro.text.includes('[nod]'));
  });

  test('the outro signs off with the programme and the channel, with a nod (no wave), and never "for now"', async () => {
    const outro = (await raw({ stories: lightStories })).segments.at(-1);
    assert.equal(outro.type, 'outro');
    assert.match(spoken(outro.text), /^That's TECH BYTES\./);
    assert.match(spoken(outro.text), /TEST/);
    assert.ok(outro.text.includes('[nod]') && !outro.text.includes('[wave]'));
    for (const id of ['world-now', 'cosmos', 'money-minute', 'news-60']) {
      const o = (await raw({ stories: lightStories, program: { ...PROGRAM, id, title: id.toUpperCase() } })).segments.at(-1);
      assert.ok(!/for now/.test(o.text) && !o.text.includes('[wave]'), o.text);
    }
    const generic = (await raw({ stories: lightStories, program: { ...PROGRAM, id: 'other', title: 'OTHER' } })).segments.at(-1);
    assert.ok(generic.text.includes('[wave]'), 'a programme without its own sign-off keeps the old wave');
    const graveLast = (await raw({ stories: [lightStories[0], stories[0]], count: 2, program: { ...PROGRAM, id: 'other' } })).segments.at(-1);
    assert.ok(!graveLast.text.includes('[wave]'), graveLast.text);
  });

  test('without a programme it falls back to the channel name, and without presenters to a generic presenter', async () => {
    const script = extractJson((await createMockProvider().generate({ stories, channelName: 'TEST' })).text);
    assert.equal(script.title, 'TEST (demo)');
    assert.match(spoken(script.segments[0].text), /I'm the presenter\./);
  });

  test('covers as many stories as asked for, up to what it has: count, then program.stories, then 5', async () => {
    assert.equal(storySegs(await raw({ stories, count: 2 })).length, 2);
    assert.equal(storySegs(await raw({ stories, count: 10 })).length, 4);
    assert.equal(storySegs(await raw({ stories, count: undefined, program: { ...PROGRAM, stories: 3 } })).length, 3);
    const many = Array.from({ length: 8 }, (_, i) => ({ ...stories[0], id: `m${i}` }));
    assert.equal(storySegs(await raw({ stories: many, count: undefined, program: undefined })).length, 5);
  });

  test('end-to-end: generate -> extractJson -> normalizeBulletin gives a valid bulletin that keeps every story', async () => {
    const bulletin = await bulletinOf({ stories, count: 4 });
    const segs = bulletin.segments.filter((s) => s.type === 'story');
    // The breaking story (s4) leads; the rest keep the desk's order.
    assert.deepEqual(segs.map((s) => s.storyId), ['s4', 's1', 's2', 's3']);
    assert.deepEqual(bulletin.rundown.map((r) => r.storyId), ['s4', 's1', 's2', 's3']);
    assert.equal(bulletin.segments[0].type, 'intro');
    assert.equal(bulletin.segments.at(-1).type, 'outro');
    assert.equal(bulletin.title, 'TECH BYTES (demo)');
    for (const seg of segs) {
      const story = stories.find((s) => s.id === seg.storyId);
      assert.ok(seg.headline.length > 0 && seg.headline.length <= 56);
      assert.ok(seg.text.includes(story.source), `text mentions ${story.source}`);
      assert.equal(seg.hasImage, !!story.image);
    }
    assert.deepEqual(segs.map((s) => s.location?.place ?? null), [null, 'VALENCIA, SPAIN', null, null], 'only the fire names a place');
  });

  test('picks the tone from the content and varies the shots: map for a place, the picture or a close-up, else wide', async () => {
    const segs = storySegs(await raw({ stories }));
    const by = Object.fromEntries(segs.map((x) => [x.storyId, x]));
    assert.equal(by.s1.emotion, 'serious'); // fire / injured
    assert.equal(by.s2.emotion, 'happy'); // tech
    assert.equal(by.s3.emotion, 'neutral');
    assert.equal(by.s4.emotion, 'neutral');
    assert.deepEqual(segs.map((s) => s.anchor), ['A', 'B', 'A', 'B']);
    assert.deepEqual(segs.map((s) => s.storyId), ['s4', 's1', 's2', 's3'], 'breaking news leads');
    assert.deepEqual(segs.map((s) => s.shot), ['close', 'map', 'close', 'wide']);
    assert.deepEqual(segs.map((s) => s.breaking), [true, false, false, false]);
    assert.match(spoken(segs[0].text), /^Breaking news\. /);
  });

  test('a story with a place gets its location from the gazetteer (the city rather than its country) and a map shot', async () => {
    const segs = storySegs(await raw({ stories: placed.slice(0, 2), count: 2 }));
    assert.deepEqual(segs[0].location, { place: 'LISBON, PORTUGAL', lat: 38.72, lon: -9.14 });
    assert.deepEqual(segs[1].location, { place: 'NAIROBI, KENYA', lat: -1.29, lon: 36.82 });
    assert.deepEqual(segs.map((s) => s.shot), ['map', 'map']);
    const none = storySegs(await raw({ stories: [placed[4]], count: 1 }))[0];
    assert.equal(none.location, null);
    assert.notEqual(none.shot, 'map');
  });

  test('the fact card and the numbers are figures copied from the summary, and they survive validation', async () => {
    const bulletin = await bulletinOf({ stories: placed.slice(0, 2), count: 2 });
    const [lisbon, kenya] = bulletin.segments.filter((s) => s.type === 'story');
    assert.equal(lisbon.fact, '40,000 PASSENGERS A DAY');
    assert.deepEqual(lisbon.numbers[0], { value: '40,000', label: 'PASSENGERS A DAY' });
    assert.equal(kenya.fact, 'ABOUT 300,000 HOMES', 'the qualifier stays with the figure');
    assert.deepEqual(kenya.numbers[0], { value: '300,000', label: 'HOMES', qualifier: 'ABOUT' });
    const none = storySegs(await raw({ stories: [placed[4]], count: 1 }))[0];
    assert.equal(none.fact, null);
    assert.equal(none.numbers, undefined);
  });

  test('a quotation in the summary is quoted word for word, with its speaker', async () => {
    const bulletin = await bulletinOf({ stories: [placed[0]], count: 1 });
    const seg = bulletin.segments[1];
    assert.deepEqual(seg.quote, { text: 'This line will change how people move around the old town', by: 'the mayor' });
    assert.ok(seg.text.includes('“This line will change how people move around the old town,” the mayor said.'), 'already in the body, it is read as written');
    const later = [{ ...placed[0], id: 'q1', summary: 'Lisbon has opened a new tram line. It runs along the river. Trams run every five minutes. “We waited ten years for this line,” the mayor said.' }];
    const quoted = (await bulletinOf({ stories: later, count: 1 })).segments[1];
    assert.match(quoted.text, /As the mayor put it: “We waited ten years for this line\.”/);
  });

  test('co-presenter reactions always come from the OTHER presenter, whoever is speaking', async () => {
    for (const set of [lightStories, placed, stories]) {
      const script = await raw({ stories: set, program: { ...PROGRAM, stories: set.length } });
      for (const seg of script.segments) {
        for (const t of cueTokens(seg.text)) if (t.slot) assert.notEqual(t.slot, seg.anchor, `${seg.anchor} reacts to itself in "${seg.text}"`);
      }
      const reactions = storySegs(script).flatMap((s) => cueTokens(s.text).filter((t) => t.slot).map((t) => [s.anchor, t.slot]));
      assert.ok(reactions.some(([a]) => a === 'A') && reactions.some(([a]) => a === 'B'), 'both presenters get reactions');
    }
    const bulletin = await bulletinOf({ stories: lightStories, program: { ...PROGRAM, maxChats: 9 } });
    for (const seg of bulletin.segments) for (const c of seg.cues) assert.notEqual(c.slot, seg.anchor, 'after validation a reaction names the other slot (or null = the speaker)');
  });

  test('adds a chat after light stories, but never after the last story, a grave one, or right before a grave one', async () => {
    assert.deepEqual(kinds(await raw({ stories })), ['intro', 'story', 'story', 'story', 'chat', 'story', 'outro']);
    assert.deepEqual(kinds(await raw({ stories: lightStories, program: { ...PROGRAM, maxChats: 9 } })), ['intro', 'story', 'chat', 'story', 'chat', 'story', 'chat', 'story', 'outro']);
    const beforeGrave = [lightStories[0], stories[0], lightStories[1]];
    assert.deepEqual(kinds(await raw({ stories: beforeGrave, count: 3, program: { ...PROGRAM, maxChats: 9 } })), ['intro', 'story', 'story', 'story', 'outro']);
  });

  test('the chat is spoken by the presenter who did not read the story, in their own voice', async () => {
    const script = await raw({ stories: lightStories, program: { ...PROGRAM, maxChats: 9 } });
    script.segments.forEach((seg, i) => {
      if (seg.type !== 'chat') return;
      assert.notEqual(seg.anchor, script.segments[i - 1].anchor);
    });
    const chats = script.segments.filter((s) => s.type === 'chat').map((s) => spoken(s.text));
    assert.ok(new Set(chats).size >= 2, 'the reactions vary');
  });

  test('never writes more chats than program.maxChats', async () => {
    for (const maxChats of [0, 1, 2, 3]) {
      const script = await raw({ stories: lightStories, program: { ...PROGRAM, maxChats } });
      assert.equal(script.segments.filter((s) => s.type === 'chat').length, Math.min(maxChats, 3), `maxChats=${maxChats}`);
    }
  });

  test('solo programmes: only anchor "A", no chats (even with light stories), no hand-overs, outro by "A"', async () => {
    const script = await raw({ stories: lightStories, presenters: SOLO, program: { id: 'money-minute', title: 'MONEY MINUTE', stories: 4, maxChats: 3 } });
    assert.ok(!kinds(script).includes('chat'));
    assert.ok(script.segments.every((s) => s.anchor === 'A'), JSON.stringify(script.segments.map((s) => s.anchor)));
    assert.match(script.segments[0].text, /I'm Penny Sterling\./);
    assert.ok(script.segments.every((s) => !/Thanks,|Over to you/.test(s.text)));
    assert.equal(script.segments.at(-1).type, 'outro');
  });

  test('"news-60" keeps to its word budget (lead up to about 38 words, other items about 28); other programmes say more', async () => {
    const long = placed.map((p) => ({ ...p, summary: `${p.summary} One more detail sentence about it here. And a final remark that is rather long as well.` }));
    const quick = storySegs(await raw({ stories: long, program: { id: 'news-60', title: 'NEWS IN 60', stories: 5, maxChats: 0 }, presenters: SOLO }));
    const words = (t) => spoken(t).split(/\s+/).length;
    assert.ok(words(quick[0].text) <= 40, `lead: ${words(quick[0].text)} words`);
    for (const x of quick.slice(1)) assert.ok(words(x.text) <= 32, `${words(x.text)} words: ${x.text}`);
    const full = storySegs(await raw({ stories: long }));
    assert.ok(words(full[0].text) > words(quick[0].text));
  });

  test('works with a single story whose summary is empty: the headline, attributed', async () => {
    const one = [stories[2]];
    const bulletin = await bulletinOf({ stories: one });
    assert.equal(bulletin.segments.filter((s) => s.type === 'story').length, 1, 'the story stays even though the intro read the same headline');
    assert.match(bulletin.segments[1].text, /City council opens the municipal pool/);
    assert.match(bulletin.segments[1].text, /NPR/);
  });

  test('varies how stories are introduced and attributed', async () => {
    const script = await raw({ stories: [...lightStories, ...placed], count: 8, program: { ...PROGRAM, stories: 8, maxChats: 0 } });
    const openings = storySegs(script).map((s) => spoken(s.text).replace(/^Thanks, \w+\. /, '').split(' ').slice(0, 2).join(' '));
    assert.ok(new Set(openings).size >= 4, openings.join(' | '));
  });

  test('is deterministic: the same news makes the same episode', async () => {
    assert.deepEqual(await raw({ stories: placed, program: FLAGSHIP }), await raw({ stories: placed, program: FLAGSHIP }));
  });

  test('flagship features: lead, a main story, the number of the day (never first), a round-up in different countries and an "and finally"', async () => {
    const bulletin = await bulletinOf({ stories: placed, program: FLAGSHIP });
    const segs = bulletin.segments.filter((s) => s.type === 'story');
    const roundup = segs.filter((s) => s.feature === 'roundup');
    assert.ok(roundup.length >= 2 && roundup.length <= 3, `round-up of ${roundup.length}`);
    const first = segs.indexOf(roundup[0]);
    roundup.forEach((s, i) => {
      assert.equal(segs[first + i], s, 'the round-up items are consecutive');
      assert.deepEqual(s.roundup, { index: i, count: roundup.length });
      assert.equal(s.shot, 'map');
      assert.ok(s.location);
      assert.equal(s.kicker, 'AROUND THE WORLD');
      assert.equal(s.fact, null, 'no fact cards inside the round-up');
    });
    const countries = roundup.map((s) => s.location.place.split(', ').pop());
    assert.equal(new Set(countries).size, countries.length, 'one country per item');
    assert.match(roundup[0].text, /around the world/);
    const last = segs.at(-1);
    assert.equal(last.feature, 'lighter');
    assert.equal(last.storyId, 'p6', 'the panda cubs close the show');
    assert.match(last.text, /And finally: /);
    const number = segs.find((s) => s.feature === 'number');
    assert.ok(number, 'there is a number of the day');
    assert.notEqual(segs.indexOf(number), 0, 'never the lead');
    assert.match(number.text, /^(?:Thanks, \w+\. )?Our number of the day: /);
    assert.equal(number.kicker, 'NUMBER OF THE DAY');
  });

  test('the number of the day is never the lead, never an age, and goes where the programme puts it', async () => {
    for (const program of [FLAGSHIP, { ...PROGRAM, features: ['number'] }, { ...PROGRAM, features: ['number'], numberSlot: 'second' }]) {
      const segs = storySegs(await raw({ stories: placed, program }));
      const i = segs.findIndex((x) => x.feature === 'number');
      assert.ok(i > 0, `${program.id}: number at ${i}`);
      if (program.numberSlot === 'second') assert.equal(i, 1);
      assert.ok(!/years? (?:old|ago)/i.test(segs[i].fact), segs[i].fact);
    }
    const money = storySegs(await raw({ stories: placed, presenters: SOLO, program: { id: 'money-minute', title: 'MONEY MINUTE', stories: 4, maxChats: 0, features: ['number'], numberSlot: 'last' } }));
    assert.equal(money.at(-1).feature, 'number', 'MONEY MINUTE closes on it');
  });

  test('a breaking story always leads, whatever the desk order', async () => {
    const list = [placed[0], placed[1], { ...placed[2], id: 'b1', title: 'BREAKING: Iceland volcano erupts again on the Reykjanes peninsula' }];
    const segs = storySegs(await raw({ stories: list, program: FLAGSHIP }));
    assert.equal(segs[0].storyId, 'b1');
    assert.equal(segs[0].breaking, true);
    assert.ok(!segs[0].feature);
  });

  test('live pages are not read out: their "follow the latest" line is no story', async () => {
    const live = { id: 'lv', title: 'Climate talks in Nairobi – live', summary: 'Follow the latest from the climate talks in Nairobi, where ministers from 40 countries are meeting this week.', source: 'Pixelburg Post', category: 'world', image: null, live: true };
    const script = await raw({ stories: [live, ...placed.slice(0, 3)], count: 3 });
    assert.ok(!storySegs(script).some((x) => x.storyId === 'lv'));
    assert.ok(!script.segments.some((x) => /Follow the latest/.test(x.text)));
  });

  test('no repetition: the lead does not re-read the headline the intro just read, and a summary that restates its headline replaces it', async () => {
    for (const program of [PROGRAM, { ...FLAGSHIP, intro: 'headlines' }]) {
      const script = await raw({ stories: placed, program });
      const introLine = spoken(script.segments[0].text).split('. ')[0];
      const lead = spoken(storySegs(script)[0].text);
      assert.ok(!lead.includes(introLine), `${lead} repeats ${introLine}`);
    }
    const lisbon = storySegs(await raw({ stories: [placed[4], placed[0]], count: 2 }))[1];
    assert.ok(!spoken(lisbon.text).includes('Lisbon opens a new riverside tram line'), 'the richer first sentence says it instead');
    assert.match(spoken(lisbon.text), /Lisbon has opened a new tram line along the Tagus river/);
  });

  test('openings vary: no two stories in a row start with the same attribution template', async () => {
    const script = await raw({ stories: [...lightStories, ...placed], count: 8, program: { ...PROGRAM, stories: 8, maxChats: 0 } });
    const template = (t) => {
      const x = spoken(t).replace(/^Thanks, \w+\. /, '');
      if (/^From [^:]+: /.test(x)) return 'colon';
      if (/^According to /.test(x)) return 'according';
      if (/^[\w ]+ reports that /.test(x)) return 'that';
      if (/^[^.]*, [A-Z][\w ]+ reports\./.test(x)) return 'tail';
      return 'none';
    };
    const kinds = storySegs(script).map((x) => template(x.text));
    for (let i = 1; i < kinds.length; i++) if (kinds[i] !== 'none') assert.notEqual(kinds[i], kinds[i - 1], kinds.join(' '));
    assert.ok(!script.segments.some((x) => /That's according to/.test(x.text)));
  });

  test('chats follow the programme: WORLD NOW only after "And finally" (Paco, then Lola), COSMOS after the lead and the closer, TECH BYTES has THE CATCH', async () => {
    const world = await raw({ stories: placed, program: { ...FLAGSHIP, chats: { after: ['lighter'] } }, presenters: { A: { id: 'paco', name: 'Paco Pixel' }, B: { id: 'lola', name: 'Lola Byte' } } });
    const segsW = world.segments;
    segsW.forEach((x, i) => {
      if (x.type !== 'chat') return;
      const prev = segsW.slice(0, i).filter((y) => y.type === 'story').at(-1);
      assert.equal(prev.feature, 'lighter', 'a WORLD NOW chat only follows And finally');
    });
    assert.deepEqual(segsW.filter((x) => x.type === 'chat').map((x) => x.anchor), ['A', 'B']);
    assert.ok(!segsW.some((x) => /\[laugh\]/.test(x.text)));

    const science = [
      { id: 'c1', title: 'Rover finds layered rocks on Mars', summary: 'A rover found layered rocks. The layers could hold clues about past water.', source: 'Starfield Journal', category: 'science', image: null },
      { id: 'c2', title: 'Swedish plant recovers gold from old phones', summary: 'A plant in Sweden can recover 1 kilogram of gold from 40,000 old phones.', source: 'Circuit Weekly', category: 'tech', image: null },
      { id: 'c3', title: 'Comet will pass close enough to see with binoculars', summary: 'A comet will be visible with binoculars this week.', source: 'Starfield Journal', category: 'science', image: null },
    ];
    const cosmos = await raw({ stories: science, presenters: { A: { id: 'nova', name: 'Dr Nova Reyes' }, B: { id: 'unit8', name: 'UNIT-8' } }, program: { id: 'cosmos', title: 'COSMOS DESK', stories: 3, maxChats: 3, features: ['number', 'lighter'], numberSlot: 'second', chats: { after: ['lead', 'lighter'] } } });
    assert.deepEqual(kinds(cosmos), ['intro', 'story', 'chat', 'chat', 'story', 'story', 'chat', 'outro']);
    assert.equal(storySegs(cosmos)[1].anchor, 'B', 'the number of the day is UNIT-8\'s');
    assert.ok(!cosmos.segments.some((x) => /sky|looking up/i.test(x.text) && x.type === 'chat' && x !== cosmos.segments.at(-2)), 'sky lines only after a sky story');

    const gadget = [
      { id: 't1', title: 'Chipmaker unveils a laptop processor', summary: 'A chipmaker has unveiled a processor that runs for 20 hours on a charge. The first laptops using it will go on sale in the spring.', source: 'Circuit Weekly', category: 'tech', image: null },
      ...lightStories.slice(1),
    ];
    const tech = await raw({ stories: gadget, program: { ...PROGRAM, maxChats: 4, chats: { after: ['lead', 'lighter', 'story'] } } });
    const [ask, answer] = tech.segments.slice(2, 4);
    assert.deepEqual([ask.type, ask.anchor, answer.type, answer.anchor], ['chat', 'B', 'chat', 'A'], 'Ada asks, Max answers');
    assert.match(spoken(ask.text), /\?$/);
    assert.equal(spoken(answer.text), 'The first laptops using it will go on sale in the spring.', 'the answer is the summary\'s own sentence');
    assert.ok(!spoken(storySegs(tech)[0].text).includes('go on sale'), 'the story kept that sentence back for the catch');
  });

  test('WORLD NOW tosses with a name and a full stop, at most twice, never twice in a row', async () => {
    const script = await raw({ stories: placed, program: { ...FLAGSHIP, toss: '{name}.' } });
    const tosses = script.segments.filter((x) => /\[look_partner\] \w+\.$/.test(x.text));
    assert.ok(tosses.length <= 2);
    assert.ok(!script.segments.some((x) => x.type === 'story' && /\w\?\s*$/.test(spoken(x.text))), 'no question-mark tosses');
  });

  test('a figure too weak for a card ("3 years") gets no fact card', async () => {
    const weak = [{ id: 'w1', title: 'Probe sets off for the Sun', summary: 'The journey will take 3 years.', source: 'Starfield Journal', category: 'science', image: null }];
    const [seg] = storySegs(await raw({ stories: weak }));
    assert.equal(seg.fact, null);
    assert.ok(!('numbers' in seg));
  });

  test('a programme without features gets none', async () => {
    const bulletin = await bulletinOf({ stories: placed, program: { ...FLAGSHIP, features: [] } });
    assert.ok(bulletin.segments.every((s) => !s.feature && !s.roundup));
  });

  test('NEWS IN 60 with a round-up runs most of its stories on the map', async () => {
    const program = { id: 'news-60', title: 'NEWS IN 60', stories: 5, maxChats: 0, features: ['roundup'] };
    const bulletin = await bulletinOf({ stories: placed, program, presenters: SOLO });
    const roundup = bulletin.segments.filter((s) => s.feature === 'roundup');
    assert.ok(roundup.length >= 3, `${roundup.length} items`);
    assert.ok(roundup.every((s) => s.anchor === 'A' && spoken(s.text).split(/(?<=\.)\s/).length <= 3));
  });

  test('every [cue] it writes is part of the shared vocabulary (public/js/cues.js)', async () => {
    const scripts = [
      await raw({ stories }),
      await raw({ stories: lightStories, program: { ...PROGRAM, maxChats: 9 } }),
      await raw({ stories: lightStories, presenters: SOLO }),
      await raw({ stories: placed, program: FLAGSHIP }),
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

  test('its stage directions come through normalizeBulletin as cues, and brackets never reach the spoken text', async () => {
    const bulletin = await bulletinOf({ stories: lightStories, program: { ...PROGRAM, maxChats: 9 }, count: 4 });
    assert.ok(bulletin.segments[0].cues.some((c) => c.action === 'nod'));
    assert.ok(bulletin.segments.some((s) => s.cues.some((c) => c.slot === 'B')), 'presenter B reacts somewhere');
    assert.ok(bulletin.segments.at(-1).cues.some((c) => c.action === 'nod'));
    for (const seg of bulletin.segments) assert.ok(!seg.text.includes('['), seg.text);
  });

  test('inside a ProviderChain it writes, but the review stage is never handed to it', async () => {
    const { chain } = makeChain([createMockProvider()]);
    const validate = (text) => normalizeBulletin(extractJson(text), stories, { channelName: 'TEST', maxStories: 4, maxChats: 2 });
    const written = await chain.generate({ stage: 'write', stories, channelName: 'TEST', program: PROGRAM, presenters: DUO, count: 4 }, validate);
    assert.equal(written.provider, 'mock');
    assert.equal(written.value.storyIds.length, stories.length);
    const script = { title: written.value.title, segments: written.value.segments };
    await assert.rejects(chain.generate({ stage: 'review', script, stories, channelName: 'TEST', program: PROGRAM, presenters: DUO }, validate), (err) => err.code === 'NO_REVIEWER');
  });

  test('does not read harmless words that merely contain "die", such as "studies" or "audience", as grave news', async () => {
    const harmless = [{ id: 'h1', title: 'Studies show coffee helps memory', summary: 'A large audience of readers agreed.', source: 'BBC News', category: 'science', image: null }];
    const [seg] = storySegs(await raw({ stories: harmless }));
    assert.notEqual(seg.emotion, 'serious');
  });

  test('only flags a story as breaking when it is breaking news, not for "record-breaking" or "breaking into"', async () => {
    const normal = [{ id: 'b1', title: 'Record-breaking heatwave hits southern Europe', summary: 'Temperatures soared.', source: 'BBC News', category: 'world', image: null }];
    const [seg] = storySegs(await raw({ stories: normal }));
    assert.equal(seg.breaking, false);
  });
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
