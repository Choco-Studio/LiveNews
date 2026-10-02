import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { NewsDesk } from '../server/news.js';
import { Producer } from '../server/producer.js';
import { ProviderChain } from '../server/providers/index.js';
import { createMockProvider } from '../server/providers/mock.js';
import { loadChannel } from '../server/channel.js';

// ---------------------------------------------------------------- helpers

const silentLogger = { info() {}, warn() {}, error() {} };

const NOW = Date.now();
const MINUTE = 60_000;

/** A small channel: a duo programme, a solo programme and one without a category filter. */
const makeChannel = () => ({
  name: 'TEST TV',
  slogan: 'ALL TEST',
  presenters: {
    ann: { name: 'Ann Anchor', personality: 'calm and sharp', voice: { gender: 'female', lang: 'en-GB', pitch: 1, rate: 1 } },
    bob: { name: 'Bob Banter', personality: 'quick with a joke', voice: { gender: 'male', lang: 'en-US', pitch: 1, rate: 1 } },
    cyd: { name: 'Cyd Solo', personality: 'deadpan robot', voice: { gender: 'robot', lang: 'en-US', pitch: 0.6, rate: 1 } },
  },
  programs: {
    duo: {
      title: 'THE DUO',
      tagline: 'TWO AT A TIME',
      theme: 'world',
      presenters: ['ann', 'bob'],
      categories: ['world', 'business'],
      stories: 3,
      maxChats: 2,
      style: 'A duo bulletin.',
      storyLength: '2 to 4 sentences, max 450 characters',
    },
    solo: {
      title: 'THE SOLO',
      tagline: 'JUST ONE',
      theme: 'flash',
      presenters: ['cyd'],
      categories: ['tech'],
      stories: 2,
      maxChats: 0,
      style: 'A solo round-up.',
      storyLength: '1 or 2 short sentences, max 200 characters',
    },
    anything: {
      title: 'ANYTHING GOES',
      tagline: 'NO FILTER',
      theme: 'space',
      presenters: ['ann'],
      stories: 4,
      maxChats: 0,
      style: 'Everything.',
      storyLength: '2 sentences',
    },
  },
  rotation: ['duo', 'solo', 'anything'],
  breaks: { adsPerBreak: 2, maxExtraAds: 6 },
});

const CONFIG = { candidatePool: 12, minNewStories: 3, reviewPass: true };

/** Story i: a unique title (so no two are "the same event"), minutes apart. */
const makeStory = (i, extra = {}) => ({
  id: `s${i}`,
  title: `Report on topic${i} and subject${i}`,
  summary: `Summary of story ${i}. It has a second sentence.`,
  link: `https://example.test/${i}`,
  source: `Outlet ${(i % 4) + 1}`,
  category: 'world',
  weight: 1,
  published: NOW - i * MINUTE,
  image: null,
  ...extra,
});

const makeStories = (n, extra = {}) => Array.from({ length: n }, (_, k) => makeStory(k + 1, extra));

/** Fake NewsDesk: records what the producer asks for, filters like the real one. */
function makeDesk(stories = []) {
  const desk = {
    stories: new Map(stories.map((s) => [s.id, s])),
    covered: new Set(),
    candidateCalls: [],
    coveredCalls: [],
    offeredCalls: [],
    resolveCalls: [],
    imageFor: {}, // story id -> url that resolveImage() will "find"
    candidates(count, { categories = null } = {}) {
      desk.candidateCalls.push({ count, categories });
      return [...desk.stories.values()].filter((s) => !desk.covered.has(s.id) && (!categories || categories.includes(s.category))).slice(0, count);
    },
    markCovered(ids) {
      desk.coveredCalls.push([...ids]);
      for (const id of ids) desk.covered.add(id);
    },
    markOffered(ids) {
      desk.offeredCalls.push([...ids]);
    },
    get: (id) => desk.stories.get(id),
    async resolveImage(story) {
      desk.resolveCalls.push(story.id);
      if (!story.image && desk.imageFor[story.id]) story.image = desk.imageFor[story.id];
      return story.image;
    },
  };
  return desk;
}

/**
 * Fake chain with scriptable stages. By default "writing" is the offline mock
 * provider and "review" returns the script unchanged. Like the real chain it
 * runs `validate` on the reply, so invalid replies throw.
 */
function makeChain() {
  const mock = createMockProvider();
  const chain = {
    requests: [],
    writeProvider: 'fake',
    reviewProvider: 'fake',
    write: async (request) => (await mock.generate(request)).text,
    review: async (request) => JSON.stringify(request.script),
    async generate(request, validate) {
      chain.requests.push(request);
      const review = request.stage === 'review';
      const text = await (review ? chain.review : chain.write)(request);
      return { provider: review ? chain.reviewProvider : chain.writeProvider, value: validate(text) };
    },
  };
  return chain;
}

const storySeg = (id, extra = {}) => ({
  type: 'story',
  storyId: id,
  anchor: 'A',
  emotion: 'neutral',
  headline: `Caption ${id}`,
  text: `Text of ${id}.`,
  shot: 'wide',
  breaking: false,
  location: null,
  fact: null,
  ...extra,
});
const chatSeg = (extra = {}) => ({ type: 'chat', anchor: 'B', emotion: 'surprised', text: 'Interesting.', ...extra });
const scriptText = (segments, title = 'Scripted title') => JSON.stringify({ title, segments });

function makeProducer({ stories = makeStories(8), config = { ...CONFIG }, log = silentLogger } = {}) {
  const desk = makeDesk(stories);
  const chain = makeChain();
  const producer = new Producer({ config, newsDesk: desk, chain, log });
  return { producer, desk, chain, config };
}

const stageNames = (episode) => episode.pipeline.map((p) => p.stage);
const storyIdsOf = (episode) => episode.segments.filter((s) => s.type === 'story').map((s) => s.storyId);

// ---------------------------------------------------------------- canProduce / select

describe('Producer.canProduce', () => {
  const channel = makeChannel();

  test('needs min(programme stories, minNewStories) candidates', () => {
    // duo airs 3 stories, minNewStories is 3: needs 3
    assert.equal(makeProducer({ stories: makeStories(2) }).producer.canProduce(channel, 'duo'), false);
    assert.equal(makeProducer({ stories: makeStories(3) }).producer.canProduce(channel, 'duo'), true);
    // solo airs 2 stories, which is below minNewStories: needs only 2
    const tech = (n) => makeStories(n, { category: 'tech' });
    assert.equal(makeProducer({ stories: tech(1) }).producer.canProduce(channel, 'solo'), false);
    assert.equal(makeProducer({ stories: tech(2) }).producer.canProduce(channel, 'solo'), true);
    // a programme that airs 4 stories already goes on air with minNewStories = 3 fresh ones
    assert.equal(makeProducer({ stories: makeStories(3) }).producer.canProduce(channel, 'anything'), true);
    assert.equal(makeProducer({ stories: makeStories(2) }).producer.canProduce(channel, 'anything'), false);
    // a bigger minNewStories than the programme size never asks for more than the programme can use
    assert.equal(makeProducer({ stories: tech(2), config: { ...CONFIG, minNewStories: 10 } }).producer.canProduce(channel, 'solo'), true);
  });

  test('only stories in the programme categories count', () => {
    const { producer } = makeProducer({ stories: makeStories(6, { category: 'science' }) });
    assert.equal(producer.canProduce(channel, 'duo'), false);
    assert.equal(producer.canProduce(channel, 'solo'), false);
    assert.equal(producer.canProduce(channel, 'anything'), true, 'a programme with no category filter takes any story');
  });

  test('covered stories do not count', () => {
    const { producer, desk } = makeProducer({ stories: makeStories(4) });
    assert.equal(producer.canProduce(channel, 'duo'), true);
    desk.covered.add('s1');
    desk.covered.add('s2');
    assert.equal(producer.canProduce(channel, 'duo'), false);
  });

  test('has no side effects: nothing is written, covered or offered', () => {
    const { producer, desk, chain } = makeProducer();
    producer.canProduce(channel, 'duo');
    assert.equal(chain.requests.length, 0);
    assert.deepEqual([desk.coveredCalls, desk.offeredCalls, desk.resolveCalls], [[], [], []]);
  });
});

describe('Producer.select', () => {
  test('asks the desk for candidatePool stories in the programme categories', () => {
    const { producer, desk } = makeProducer({ config: { ...CONFIG, candidatePool: 7 } });
    const channel = makeChannel();
    producer.select(channel.programs.duo);
    producer.select(channel.programs.anything);
    assert.deepEqual(desk.candidateCalls, [
      { count: 7, categories: ['world', 'business'] },
      { count: 7, categories: null },
    ]);
  });
});

// ---------------------------------------------------------------- produce: the episode

describe('Producer.produce', () => {
  const channel = makeChannel();

  test('returns null, without writing anything, when there are not enough candidates', async () => {
    const { producer, desk, chain } = makeProducer({ stories: makeStories(2) });

    assert.equal(await producer.produce(channel, 'duo'), null);

    assert.equal(chain.requests.length, 0);
    assert.deepEqual([desk.coveredCalls, desk.offeredCalls, desk.resolveCalls], [[], [], []]);
  });

  test('builds an episode: kind, id, programme, cast, provider, pipeline, title, segments, rundown, storyIds', async () => {
    const { producer } = makeProducer();
    const before = Date.now();

    const episode = await producer.produce(channel, 'duo');

    assert.deepEqual(Object.keys(episode).sort(), ['cast', 'createdAt', 'id', 'kind', 'pipeline', 'program', 'provider', 'rundown', 'segments', 'storyIds', 'title']);
    assert.equal(episode.kind, 'episode');
    assert.match(episode.id, /^e[0-9a-z]+$/);
    assert.ok(Date.parse(episode.createdAt) >= before - 1000 && Date.parse(episode.createdAt) <= Date.now() + 1000);
    assert.deepEqual(episode.program, { id: 'duo', title: 'THE DUO', tagline: 'TWO AT A TIME', theme: 'world' });
    assert.deepEqual(episode.cast, { A: 'ann', B: 'bob' });
    assert.equal(episode.provider, 'fake');
    assert.equal(episode.title, 'THE DUO (demo)');
    assert.equal(episode.segments[0].type, 'intro');
    assert.equal(episode.segments.at(-1).type, 'outro');
    assert.equal(episode.storyIds.length, 3);
    assert.deepEqual(episode.rundown.map((r) => r.storyId), episode.storyIds);
    assert.deepEqual(storyIdsOf(episode), episode.storyIds);
  });

  test('the pipeline lists write, review and assets, each with its duration', async () => {
    const { producer } = makeProducer();
    const episode = await producer.produce(channel, 'duo');
    assert.deepEqual(stageNames(episode), ['write', 'review', 'assets']);
    for (const step of episode.pipeline) assert.ok(Number.isInteger(step.ms) && step.ms >= 0, JSON.stringify(step));
    assert.equal(episode.pipeline[0].provider, 'fake');
    assert.deepEqual([episode.pipeline[1].provider, episode.pipeline[1].reviewed], ['fake', true]);
    assert.equal(episode.pipeline[2].images, 0);
  });

  test('a solo programme has only slot A in its cast', async () => {
    const { producer } = makeProducer({ stories: makeStories(4, { category: 'tech' }) });
    const episode = await producer.produce(channel, 'solo');
    assert.deepEqual(episode.cast, { A: 'cyd' });
    assert.deepEqual(episode.program, { id: 'solo', title: 'THE SOLO', tagline: 'JUST ONE', theme: 'flash' });
    assert.equal(episode.storyIds.length, 2);
  });

  test('episode ids are unique, even within the same millisecond', async () => {
    const { producer } = makeProducer({ stories: makeStories(30) });
    const ids = [];
    for (let i = 0; i < 5; i++) ids.push((await producer.produce(channel, 'anything')).id);
    assert.equal(new Set(ids).size, 5, ids.join());
  });

  test('asks the desk for candidatePool candidates in the programme categories', async () => {
    const { producer, desk } = makeProducer({ config: { ...CONFIG, candidatePool: 9 } });
    await producer.produce(channel, 'duo');
    assert.deepEqual(desk.candidateCalls.at(-1), { count: 9, categories: ['world', 'business'] });
  });

  test('the write request carries the stage, prompt, candidates, channel, programme, presenters and story count', async () => {
    const { producer, chain } = makeProducer();
    await producer.produce(channel, 'duo');

    const write = chain.requests[0];
    assert.equal(write.stage, 'write');
    assert.equal(write.channelName, 'TEST TV');
    assert.equal(write.count, 3);
    assert.equal(write.program.id, 'duo');
    assert.equal(write.program.title, 'THE DUO');
    assert.deepEqual(write.stories.map((s) => s.id), ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8']);
    assert.deepEqual(write.presenters, {
      A: { id: 'ann', ...channel.presenters.ann },
      B: { id: 'bob', ...channel.presenters.bob },
    });
    assert.match(write.prompt, /"TEST TV"/);
    assert.match(write.prompt, /"THE DUO"/);
    assert.match(write.prompt, /Ann Anchor, calm and sharp/);
    assert.match(write.prompt, /Bob Banter, quick with a joke/);
    for (const id of ['s1', 's8']) assert.ok(write.prompt.includes(`"id": "${id}"`));
  });

  test('a solo programme is written with a single presenter', async () => {
    const { producer, chain } = makeProducer({ stories: makeStories(4, { category: 'tech' }) });
    await producer.produce(channel, 'solo');
    const write = chain.requests[0];
    assert.deepEqual(Object.keys(write.presenters), ['A']);
    assert.match(write.prompt, /single presenter/);
    assert.match(write.prompt, /No "chat" segments/);
  });

  test('marks the stories it used as covered, and the candidates it passed over as offered', async () => {
    const { producer, desk } = makeProducer();

    const episode = await producer.produce(channel, 'duo');

    assert.deepEqual(desk.coveredCalls, [episode.storyIds]);
    assert.deepEqual(desk.offeredCalls, [['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'].filter((id) => !episode.storyIds.includes(id))]);
    assert.equal(desk.offeredCalls[0].length, 5);
  });

  test('every candidate used: the offered list is empty', async () => {
    const { producer, desk } = makeProducer({ stories: makeStories(3) });
    await producer.produce(channel, 'duo');
    assert.deepEqual(desk.offeredCalls, [[]]);
  });

  test('resolves a missing image for every story it airs (and only for those) and sets hasImage', async () => {
    const { producer, desk } = makeProducer({ stories: [makeStory(1, { image: 'https://img.test/1.jpg' }), ...makeStories(8).slice(1)] });
    desk.imageFor = { s2: 'https://img.test/2.jpg' };

    const episode = await producer.produce(channel, 'duo');

    assert.deepEqual(episode.storyIds, ['s1', 's2', 's3']);
    assert.deepEqual([...desk.resolveCalls].sort(), ['s1', 's2', 's3']);
    const flags = (list) => list.map((x) => x.hasImage);
    assert.deepEqual(flags(episode.segments.filter((s) => s.type === 'story')), [true, true, false]);
    assert.deepEqual(flags(episode.rundown), [true, true, false]);
    assert.equal(episode.pipeline.at(-1).images, 2);
  });

  test('logs a one-line summary of the pipeline', async () => {
    const info = [];
    const { producer } = makeProducer({ log: { info: (m) => info.push(m), warn() {}, error() {} } });
    await producer.produce(channel, 'duo');
    assert.equal(info.length, 1);
    assert.match(info[0], /^\[producer\] THE DUO e[0-9a-z]+ ready in \d+\.\d s \(write:fake → review:fake → assets\), 3 stories$/);
  });

  test('works with a logger that only has some methods', async () => {
    const { producer } = makeProducer({ log: {} });
    assert.ok(await producer.produce(channel, 'duo'));
  });

  test('keeps the write provider as the episode provider and the editor in the pipeline', async () => {
    const { producer, chain } = makeProducer();
    chain.writeProvider = 'codex';
    chain.reviewProvider = 'openai';
    const episode = await producer.produce(channel, 'duo');
    assert.equal(episode.provider, 'codex');
    assert.deepEqual(episode.pipeline.map((p) => p.provider), ['codex', 'openai', undefined]);
  });
});

// ---------------------------------------------------------------- produce: normalisation of the model script

describe('Producer.produce: the script is normalised with the programme rules', () => {
  const channel = makeChannel();
  const produceWith = async (write, { stories = makeStories(8), programId = 'duo', config } = {}) => {
    const made = makeProducer({ stories, config });
    made.chain.write = async () => write;
    return { ...made, episode: await made.producer.produce(channel, programId) };
  };

  test('never airs more stories than the programme size, whatever the model returns', async () => {
    const { episode, desk } = await produceWith(scriptText(Array.from({ length: 6 }, (_, i) => storySeg(`s${i + 1}`))));
    assert.deepEqual(episode.storyIds, ['s1', 's2', 's3']);
    assert.deepEqual(desk.coveredCalls, [['s1', 's2', 's3']]);
    assert.deepEqual(desk.offeredCalls[0], ['s4', 's5', 's6', 's7', 's8'], 'the stories cut by the cap count as passed over');
  });

  test('caps the chats at the programme maxChats', async () => {
    const { episode } = await produceWith(scriptText([storySeg('s1'), chatSeg({ text: 'A.' }), storySeg('s2'), chatSeg({ text: 'B.' }), chatSeg({ text: 'C.' }), storySeg('s3')]));
    assert.deepEqual(episode.segments.filter((s) => s.type === 'chat').map((c) => c.text), ['A.', 'B.']);
  });

  test('a programme with maxChats 0 has no chats, and a solo programme is always read by anchor A', async () => {
    const { episode } = await produceWith(
      scriptText([{ type: 'intro', anchor: 'B', emotion: 'happy', text: 'Hi.' }, storySeg('s1', { anchor: 'B' }), chatSeg(), storySeg('s2', { anchor: 'B' })]),
      { stories: makeStories(4, { category: 'tech' }), programId: 'solo' }
    );
    assert.ok(!episode.segments.some((s) => s.type === 'chat'));
    assert.ok(episode.segments.every((s) => s.anchor === 'A'), JSON.stringify(episode.segments.map((s) => s.anchor)));
    assert.equal(episode.segments.at(-1).anchor, 'A', 'including the default outro');
  });

  test('a duo programme gets a default outro read by presenter B, using the channel name', async () => {
    const { episode } = await produceWith(scriptText([storySeg('s1')]));
    assert.equal(episode.segments.at(-1).anchor, 'B');
    assert.match(episode.segments.at(-1).text, /TEST TV/);
    assert.match(episode.segments[0].text, /TEST TV/);
  });

  test('falls back to 3 chats when a programme does not say how many', async () => {
    const stories = makeStories(8);
    const made = makeProducer({ stories });
    const open = makeChannel();
    delete open.programs.duo.maxChats;
    made.chain.write = async () => scriptText([storySeg('s1'), ...Array.from({ length: 5 }, (_, i) => chatSeg({ text: `Chat ${'ABCDE'[i]}.` })), storySeg('s2')]);
    const episode = await made.producer.produce(open, 'duo');
    assert.equal(episode.segments.filter((s) => s.type === 'chat').length, 3);
  });

  test('ignores story ids the model made up', async () => {
    const { episode } = await produceWith(scriptText([storySeg('s1'), storySeg('invented'), storySeg('s2')]));
    assert.deepEqual(episode.storyIds, ['s1', 's2']);
  });

  test('a reply without any valid story fails the whole episode', async () => {
    const made = makeProducer();
    made.chain.write = async () => scriptText([storySeg('invented')]);
    await assert.rejects(made.producer.produce(channel, 'duo'), /bulletin has no valid stories/);
  });

  test('map shots without a location are downgraded; locations and facts reach the episode', async () => {
    const stories = [makeStory(1, { summary: 'Some 40,000 people were evacuated in Kyiv.' }), ...makeStories(7).slice(1)];
    const { episode } = await produceWith(
      scriptText([
        storySeg('s1', { shot: 'map', location: { place: 'KYIV, UKRAINE', lat: 50.4501, lon: 30.5234 }, fact: '40,000 EVACUATED', text: 'Some 40,000 people were evacuated in Kyiv.' }),
        storySeg('s2', { shot: 'map' }),
      ]),
      { stories }
    );
    const [a, b] = episode.segments.filter((s) => s.type === 'story');
    assert.deepEqual([a.shot, a.location, a.fact], ['map', { place: 'KYIV, UKRAINE', lat: 50.45, lon: 30.52 }, '40,000 EVACUATED']);
    assert.deepEqual([b.shot, b.location, b.fact], ['close', null, null]);
  });
});

// ---------------------------------------------------------------- produce: the review stage

describe('Producer review stage', () => {
  const channel = makeChannel();

  test('runs after the write stage when config.reviewPass is on, and sends the script and its sources', async () => {
    const { producer, chain } = makeProducer();

    const episode = await producer.produce(channel, 'duo');

    assert.deepEqual(chain.requests.map((r) => r.stage), ['write', 'review']);
    const review = chain.requests[1];
    assert.equal(review.channelName, 'TEST TV');
    assert.equal(review.program.id, 'duo');
    assert.deepEqual(Object.keys(review.presenters), ['A', 'B']);
    assert.deepEqual(review.stories.map((s) => s.id), episode.storyIds, 'only the stories that were used are sources');
    assert.equal(review.script.title, 'THE DUO (demo)');
    assert.match(review.prompt, /standards editor of "TEST TV"/);
    assert.match(review.prompt, /"THE DUO"/);
    for (const id of episode.storyIds) assert.ok(review.prompt.includes(`"id": "${id}"`));
    assert.ok(!review.prompt.includes('"id": "s8"'), 'unused candidates are not sources');
  });

  test('the script sent for review has no source, category or hasImage fields (the editor works on the script, not on our bookkeeping)', async () => {
    const { producer, chain } = makeProducer();
    await producer.produce(channel, 'duo');
    const { script } = chain.requests[1];
    for (const seg of script.segments) {
      for (const key of ['source', 'category', 'hasImage']) assert.ok(!(key in seg), `${seg.type} segment has ${key}`);
    }
    const story = script.segments.find((s) => s.type === 'story');
    for (const key of ['storyId', 'anchor', 'emotion', 'headline', 'text', 'shot', 'breaking', 'location', 'fact']) assert.ok(key in story, key);
    // Stage directions travel inside the text, where the editor can see and keep them.
    assert.ok(!('cues' in story), 'cues are embedded in the text, not sent as a separate array');
  });

  test('stage directions written into the text reach the episode as cues when there is no review pass', async () => {
    const { producer, chain } = makeProducer({ config: { ...CONFIG, reviewPass: false } });
    chain.write = async () =>
      scriptText([
        { type: 'intro', anchor: 'A', emotion: 'happy', text: 'Hello [wave] everyone.' },
        storySeg('s1', { text: 'Big news [B:nod] today.' }),
        { type: 'outro', anchor: 'B', emotion: 'happy', text: 'Bye. [wave]' },
      ]);

    const episode = await producer.produce(channel, 'duo');

    assert.deepEqual(episode.segments.map((s) => [s.text, s.cues]), [
      ['Hello everyone.', [{ char: 5, slot: null, action: 'wave' }]],
      ['Big news today.', [{ char: 8, slot: 'B', action: 'nod' }]],
      ['Bye.', [{ char: 4, slot: null, action: 'wave' }]],
    ]);
  });

  test(
    'the review pass keeps the stage directions of the script it checks',
    async () => {
      const { producer, chain } = makeProducer();
      chain.write = async () =>
        scriptText([
          { type: 'intro', anchor: 'A', emotion: 'happy', text: 'Hello [wave] everyone.' },
          storySeg('s1', { text: 'Big news [B:nod] today.' }),
          storySeg('s2'),
          storySeg('s3'),
          { type: 'outro', anchor: 'B', emotion: 'happy', text: 'Bye. [wave]' },
        ]);

      const episode = await producer.produce(channel, 'duo');

      assert.equal(episode.pipeline[1].reviewed, true);
      assert.deepEqual(episode.segments[0].cues, [{ char: 5, slot: null, action: 'wave' }]);
      assert.deepEqual(episode.segments[1].cues, [{ char: 8, slot: 'B', action: 'nod' }]);
    }
  );

  test('the normaliser gets the programme features and our own names (so "NEWS IN 60" or "UNIT-8" never look like invented numbers)', async () => {
    const { producer, chain } = makeProducer();
    const open = makeChannel();
    open.programs.duo.title = 'DUO 24';
    open.programs.duo.features = ['lighter'];
    open.presenters.bob.name = 'BOB-9';
    chain.write = async () =>
      scriptText([
        { type: 'intro', anchor: 'A', emotion: 'happy', text: 'Welcome to DUO 24. With me, BOB-9.' },
        storySeg('s1'),
        storySeg('s2', { feature: 'lighter', emotion: 'happy' }),
      ]);
    const episode = await producer.produce(open, 'duo');
    assert.equal(episode.segments[0].text, 'Welcome to DUO 24. With me, BOB-9.');
    assert.equal(episode.segments.find((s) => s.storyId === 's2').feature, 'lighter');
    chain.write = async () => scriptText([storySeg('s3', { feature: 'number', fact: null }), storySeg('s4', { feature: 'roundup' })]);
    const other = await producer.produce(open, 'duo');
    assert.ok(other.segments.every((s) => !s.feature), 'features the programme does not list are dropped');
  });

  test('is skipped when config.reviewPass is off', async () => {
    const { producer, chain } = makeProducer({ config: { ...CONFIG, reviewPass: false } });
    const episode = await producer.produce(channel, 'duo');
    assert.deepEqual(stageNames(episode), ['write', 'assets']);
    assert.deepEqual(chain.requests.map((r) => r.stage), ['write']);
  });

  test('follows config.reviewPass live, episode by episode', async () => {
    const { producer, config } = makeProducer({ stories: makeStories(30) });
    assert.deepEqual(stageNames(await producer.produce(channel, 'duo')), ['write', 'review', 'assets']);
    config.reviewPass = false;
    assert.deepEqual(stageNames(await producer.produce(channel, 'duo')), ['write', 'assets']);
    config.reviewPass = true;
    assert.deepEqual(stageNames(await producer.produce(channel, 'duo')), ['write', 'review', 'assets']);
  });

  test('the corrected script replaces the original one', async () => {
    const { producer, chain } = makeProducer();
    chain.review = async ({ script }) =>
      JSON.stringify({
        ...script,
        title: 'Edited title',
        segments: script.segments.map((seg) => (seg.type === 'story' ? { ...seg, text: `Checked: ${seg.text}`, fact: null } : seg)),
      });

    const episode = await producer.produce(channel, 'duo');

    assert.equal(episode.title, 'Edited title');
    assert.ok(episode.segments.filter((s) => s.type === 'story').every((s) => s.text.startsWith('Checked: ')));
    assert.deepEqual(episode.pipeline[1].reviewed, true);
  });

  test('the editor can take out a story it cannot stand behind: it leaves the episode and is offered, not covered', async () => {
    const { producer, chain, desk } = makeProducer();
    chain.review = async ({ script }) => JSON.stringify({ ...script, segments: script.segments.filter((s) => s.storyId !== 's2') });

    const episode = await producer.produce(channel, 'duo');

    assert.deepEqual(episode.storyIds, ['s1', 's3']);
    assert.deepEqual(episode.rundown.map((r) => r.storyId), ['s1', 's3']);
    assert.deepEqual(desk.coveredCalls, [['s1', 's3']]);
    assert.ok(desk.offeredCalls[0].includes('s2'));
    assert.ok(!desk.covered.has('s2'));
  });

  test('the editor cannot add a story that was not in the script', async () => {
    const { producer, chain } = makeProducer();
    chain.review = async ({ script }) => JSON.stringify({ ...script, segments: [...script.segments.slice(0, -1), storySeg('s7'), script.segments.at(-1)] });

    const episode = await producer.produce(channel, 'duo');

    assert.deepEqual(episode.storyIds, ['s1', 's2', 's3']);
  });

  test('a failing review never blocks the show: the original script is kept and the pipeline says so', async () => {
    const warnings = [];
    const { producer, chain, desk } = makeProducer({ log: { info() {}, warn: (m) => warnings.push(m), error() {} } });
    chain.review = async () => {
      throw new Error('no AI provider available (all paused)');
    };

    const episode = await producer.produce(channel, 'duo');

    assert.equal(episode.title, 'THE DUO (demo)');
    assert.equal(episode.storyIds.length, 3);
    assert.deepEqual(stageNames(episode), ['write', 'review', 'assets']);
    const review = episode.pipeline[1];
    assert.equal(review.reviewed, false);
    assert.equal(review.error, 'no AI provider available (all paused)');
    assert.equal(review.provider, undefined);
    assert.deepEqual(warnings, ['[producer] review skipped: no AI provider available (all paused)']);
    assert.deepEqual(desk.coveredCalls, [episode.storyIds], 'the episode is still produced and its stories covered');
    assert.equal(episode.pipeline[2].stage, 'assets', 'and the assets stage still runs');
  });

  test('a review reply that is not valid JSON, or has no valid story, also keeps the original script', async () => {
    for (const reply of ['Sorry, I cannot do that.', '{"title":"x","segments":[]}', '{"title":"x"', scriptText([storySeg('invented')])]) {
      const { producer, chain } = makeProducer();
      chain.review = async () => reply;
      const episode = await producer.produce(channel, 'duo');
      assert.equal(episode.title, 'THE DUO (demo)', reply);
      assert.equal(episode.pipeline[1].reviewed, false, reply);
      assert.equal(typeof episode.pipeline[1].error, 'string', reply);
    }
  });

  test('the editor reply is normalised with the same programme rules (story cap, chats, solo)', async () => {
    const { producer, chain } = makeProducer({ stories: makeStories(4, { category: 'tech' }) });
    chain.review = async ({ script }) =>
      JSON.stringify({ ...script, segments: [...script.segments.slice(0, -1), chatSeg(), storySeg('s3'), storySeg('s4', { anchor: 'B' }), { type: 'outro', anchor: 'B', emotion: 'happy', text: 'Bye.' }] });

    const episode = await producer.produce(channel, 'solo');

    assert.ok(episode.storyIds.length <= 2, episode.storyIds.join());
    assert.ok(!episode.segments.some((s) => s.type === 'chat'));
    assert.ok(episode.segments.every((s) => s.anchor === 'A'));
  });
});

// ---------------------------------------------------------------- produce: failures

describe('Producer.produce: failures', () => {
  const channel = makeChannel();

  test('a failing write stage rejects, logs the error and leaves the desk untouched', async () => {
    const errors = [];
    const { producer, chain, desk } = makeProducer({ log: { info() {}, warn() {}, error: (m) => errors.push(m) } });
    chain.write = async () => {
      throw new Error('no AI provider available (codex: boom)');
    };

    await assert.rejects(producer.produce(channel, 'duo'), { message: 'no AI provider available (codex: boom)' });

    assert.deepEqual(errors, ['[producer] THE DUO: no AI provider available (codex: boom)']);
    assert.deepEqual([desk.coveredCalls, desk.offeredCalls, desk.resolveCalls], [[], [], []]);
    assert.deepEqual(chain.requests.map((r) => r.stage), ['write'], 'no review is attempted');
  });

  test('a write reply without JSON rejects', async () => {
    const { producer, chain } = makeProducer();
    chain.write = async () => 'I am sorry, I cannot help.';
    await assert.rejects(producer.produce(channel, 'duo'), /reply contains no JSON/);
  });

  test('after a failure the next attempt works normally and covers the stories', async () => {
    const { producer, chain, desk } = makeProducer();
    const original = chain.write;
    chain.write = async () => {
      throw new Error('boom');
    };
    await assert.rejects(producer.produce(channel, 'duo'));

    chain.write = original;
    const episode = await producer.produce(channel, 'duo');

    assert.equal(episode.storyIds.length, 3);
    assert.equal(desk.covered.size, 3);
  });
});

// ---------------------------------------------------------------- with the real NewsDesk and ProviderChain

describe('Producer with the real NewsDesk, ProviderChain and mock provider', () => {
  const noNetwork = async (url) => {
    throw new Error(`unexpected network access to ${url}`);
  };
  const CATEGORIES = ['world', 'business', 'tech', 'science'];
  const WORDS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet', 'kilo', 'lima', 'mike', 'november', 'oscar', 'papa', 'quebec', 'romeo', 'sierra', 'tango'];

  /** A desk with `perCategory` unrelated stories in each category. */
  function makeRealDesk(perCategory = 10) {
    const desk = new NewsDesk({ log: silentLogger, fetchImpl: noNetwork, lookup: async () => [] });
    let n = 0;
    for (const category of CATEGORIES) {
      for (let i = 0; i < perCategory; i++, n++) {
        desk.stories.set(`r${n}`, {
          id: `r${n}`,
          title: `${WORDS[n % 20]} ${WORDS[(n * 7 + 3) % 20]}${n} ${category} headline${n}`,
          summary: `Summary of real story number ${n}, long enough to count as a proper summary for the ranking.`,
          link: `https://example.test/r${n}`,
          source: `Outlet ${n % 6}`,
          category,
          weight: 1,
          published: NOW - (n + 1) * MINUTE,
          image: n % 2 ? `https://img.test/r${n}.jpg` : null,
        });
      }
    }
    desk.updateTrending();
    return desk;
  }

  const makeRealProducer = (desk, { reviewPass = true } = {}) => {
    const chain = new ProviderChain([createMockProvider()], { record() {} }, { log: silentLogger });
    return new Producer({ config: { ...CONFIG, reviewPass }, newsDesk: desk, chain, log: silentLogger });
  };

  const realChannel = loadChannel();

  for (const [programId, program] of Object.entries(realChannel.programs)) {
    test(`produces a valid "${program.title}" episode from config/channel.json`, async () => {
      const desk = makeRealDesk();
      const producer = makeRealProducer(desk);

      const episode = await producer.produce(realChannel, programId);

      assert.ok(episode, 'enough stories were available');
      assert.equal(episode.program.id, programId);
      assert.equal(episode.provider, 'mock');
      assert.deepEqual(stageNames(episode), program.timing ? ['pictures', 'write', 'review', 'fit', 'assets'] : ['pictures', 'write', 'review', 'assets']);

      const solo = program.presenters.length === 1;
      assert.deepEqual(Object.keys(episode.cast), solo ? ['A'] : ['A', 'B']);
      assert.equal(episode.segments[0].type, 'intro');
      assert.equal(episode.segments.at(-1).type, 'outro');
      assert.ok(episode.storyIds.length >= 1 && episode.storyIds.length <= program.stories);
      assert.ok(episode.segments.filter((s) => s.type === 'chat').length <= program.maxChats);
      if (solo) assert.ok(episode.segments.every((s) => s.anchor === 'A'));
      for (const seg of episode.segments.filter((s) => s.type === 'story')) {
        assert.ok(program.categories.includes(seg.category), `${seg.category} is not one of ${program.categories}`);
        assert.equal(seg.hasImage, !!desk.get(seg.storyId).image);
      }
      assert.equal(episode.title, `${program.title} (demo)`);
    });
  }

  test('every programme follows its own rules: a breaking story leads, the number of the day is never first, no chat next to grave news', async () => {
    for (const programId of Object.keys(realChannel.programs)) {
      const desk = makeRealDesk();
      const episode = await makeRealProducer(desk).produce(realChannel, programId);
      const stories = episode.segments.filter((s) => s.type === 'story');
      assert.notEqual(stories[0].feature, 'number', programId);
      episode.segments.forEach((s, i) => {
        if (s.type !== 'chat') return;
        const prev = episode.segments.slice(0, i).filter((x) => x.type === 'story').at(-1);
        assert.ok(!['serious', 'sad'].includes(prev.emotion), `${programId}: chat after a grave story`);
      });
      for (const s of stories) assert.ok(s.headline.length <= 80 && !/\b(?:of|to|in|on|for|the|a)$/i.test(s.headline), s.headline);
    }
  });

  test('NEWS IN 60 is fitted to its minute: the fit stage estimates the running time and drops tail stories only if that helps', async () => {
    const desk = makeRealDesk();
    const episode = await makeRealProducer(desk).produce(realChannel, 'news-60');
    const fit = episode.pipeline.find((p) => p.stage === 'fit');
    assert.ok(fit && fit.estimate > 0, JSON.stringify(fit));
    assert.equal(episode.storyIds.length, episode.segments.filter((s) => s.type === 'story').length);
    assert.deepEqual(episode.rundown.map((r) => r.storyId), episode.storyIds);
  });

  test('with only the offline mock the review stage reports reviewed: false (nothing was checked) and keeps the script', async () => {
    const desk = makeRealDesk();
    const logs = [];
    const chain = new ProviderChain([createMockProvider()], { record() {} }, { log: silentLogger });
    const producer = new Producer({ config: { ...CONFIG, reviewPass: true }, newsDesk: desk, chain, log: { info: (m) => logs.push(m), warn: (m) => logs.push(`WARN ${m}`), error() {} } });
    const episode = await producer.produce(realChannel, 'world-now');
    const review = episode.pipeline.find((p) => p.stage === 'review');
    assert.equal(review.reviewed, false);
    assert.match(review.error, /cannot review/);
    assert.ok(!logs.some((l) => l.startsWith('WARN')), 'not a warning: there is simply no editor configured');
    assert.ok(episode.segments.length > 2);
  });

  test('covers what it airs, offers what it passed over, and does not air the same story twice', async () => {
    const desk = makeRealDesk();
    const producer = makeRealProducer(desk);
    const first = await producer.produce(realChannel, 'world-now');
    const second = await producer.produce(realChannel, 'world-now');

    for (const id of first.storyIds) assert.ok(desk.covered.has(id), `${id} covered`);
    assert.deepEqual(first.storyIds.filter((id) => second.storyIds.includes(id)), []);
    const passedOver = [...desk.stories.values()].filter((s) => s.offered);
    assert.ok(passedOver.length > 0, 'candidates the writer did not use were marked as offered');
    assert.ok(passedOver.every((s) => !first.storyIds.includes(s.id)));
  });

  test('a story reported by two outlets is aired once and the other report is covered with it', async () => {
    const desk = new NewsDesk({ log: silentLogger, fetchImpl: noNetwork, lookup: async () => [] });
    const add = (id, source, title, minutesAgo) =>
      desk.stories.set(id, { id, title, summary: 'x'.repeat(100), link: `https://e.test/${id}`, source, category: 'world', weight: 1, published: NOW - minutesAgo * MINUTE, image: null });
    add('q1', 'BBC', 'Earthquake strikes northern Japan', 5);
    add('q2', 'Sky', 'Powerful earthquake hits northern Japan', 8);
    add('a', 'NPR', 'Parliament passes sweeping budget law', 10);
    add('b', 'DW', 'Floods displace thousands across Bangladesh', 12);
    add('c', 'CBC', 'Tech giant announces record quarterly profit', 14);
    desk.updateTrending();
    const producer = makeRealProducer(desk, { reviewPass: false });

    const episode = await producer.produce(realChannel, 'world-now');

    assert.equal(episode.storyIds.filter((id) => id === 'q1' || id === 'q2').length, 1, 'only one of the two reports is aired');
    assert.ok(desk.covered.has('q1') && desk.covered.has('q2'), 'both reports are covered');
    assert.deepEqual(desk.uncovered().map((s) => s.id).filter((id) => id === 'q1' || id === 'q2'), []);
  });

  test('canProduce is false once the desk has run dry for a programme, and produce then returns null', async () => {
    const desk = makeRealDesk(2); // 2 stories per category
    const producer = makeRealProducer(desk);
    assert.equal(producer.canProduce(realChannel, 'money-minute'), false, 'business has only 2 stories and the programme needs 3');
    assert.equal(await producer.produce(realChannel, 'money-minute'), null);
    assert.equal(producer.canProduce(realChannel, 'news-60'), true, 'all categories together are enough');
  });
});

describe('Producer.fit (timed programmes)', () => {
  const seg = (type, words, extra = {}) => ({ type, anchor: 'A', text: Array.from({ length: words }, () => 'word').join(' '), ...extra });
  const ctx = (segments) => ({
    program: { timing: { target: 60, wpm: 170, gap: 0.7, minStories: 2, accept: [55, 65] } },
    episode: {
      segments,
      rundown: segments.filter((s) => s.storyId).map((s) => ({ storyId: s.storyId })),
      storyIds: segments.filter((s) => s.storyId).map((s) => s.storyId),
    },
  });
  const producer = new Producer({ config: {}, newsDesk: {}, chain: {}, log: silentLogger });

  test('drops tail stories (never the lead, a round-up item or breaking news) while that brings the estimate nearer the target', () => {
    const c = ctx([seg('intro', 8), seg('story', 40, { storyId: 'a' }), seg('story', 30, { storyId: 'b' }), seg('story', 30, { storyId: 'c', roundup: { index: 0, count: 2 } }), seg('story', 30, { storyId: 'd' }), seg('story', 30, { storyId: 'e' }), seg('story', 30, { storyId: 'f', breaking: true }), seg('outro', 8)]);
    const note = producer.fit(c);
    assert.deepEqual(c.episode.storyIds, ['a', 'b', 'c', 'f']);
    assert.deepEqual(c.episode.rundown.map((r) => r.storyId), ['a', 'b', 'c', 'f']);
    assert.equal(note.dropped, 2);
    assert.ok(Math.abs(note.estimate - 60) < 8, JSON.stringify(note));
  });

  test('never pads: a short script airs short and says so', () => {
    const c = ctx([seg('intro', 8), seg('story', 20, { storyId: 'a' }), seg('story', 20, { storyId: 'b' }), seg('outro', 8)]);
    const note = producer.fit(c);
    assert.equal(c.episode.storyIds.length, 2);
    assert.equal(note.short, true);
  });
});

describe('Producer: a memory of aired presenter lines (24/7 variety)', () => {
  test('chat lines of produced episodes are passed to the next write request as `recent`, capped', async () => {
    const { producer, chain } = makeProducer({ config: { ...CONFIG, reviewPass: false, recentLines: 3 } });
    chain.write = async ({ stories }) =>
      scriptText([storySeg(stories[0].id), chatSeg({ text: 'Well, there we are. Quite a day.' }), storySeg(stories[1].id), chatSeg({ text: 'Remarkable.' })]);
    await producer.produce(makeChannel(), 'duo');
    assert.deepEqual(chain.requests.at(-1).recent, []);
    await producer.produce(makeChannel(), 'duo');
    assert.deepEqual(chain.requests.at(-1).recent, ['Well, there we are.', 'Quite a day.', 'Remarkable.'].slice(-3));
    assert.equal(producer.recentLines.length, 3);
  });
});
