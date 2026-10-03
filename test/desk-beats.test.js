// Programme beats, candidate pools and the running order by news value
// (editorial-2 round 3): COSMOS takes science, space and our planet, never a
// games console; a programme due soon keeps its beat; a section served by
// one outlet still fills a long programme; hard news leads over curiosities.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { NewsDesk } from '../server/news.js';
import { Producer } from '../server/producer.js';
import { validateChannel } from '../server/channel.js';
import { topicOf, onBeat, TOPIC_NAMES } from '../server/topics.js';
import { createMockProvider } from '../server/providers/mock.js';
import { extractJson } from '../server/writer.js';

const silent = { info() {}, warn() {}, error() {} };
const NOW = Date.now();
const LONG = 'A reasonably long summary that goes well beyond eighty characters so that it counts as real substance.';
const story = (id, source, extra = {}) => ({
  id,
  title: `${id} dispatch`,
  summary: LONG,
  link: `https://example.test/${id}`,
  source,
  category: 'world',
  weight: 1,
  published: NOW - 60_000,
  image: null,
  ...extra,
});
const deskOf = (stories) => {
  const desk = new NewsDesk({ log: silent, fetchImpl: async () => { throw new Error('no network'); } });
  for (const s of stories) desk.stories.set(s.id, s);
  return desk;
};
const ids = (list) => list.map((s) => s.id);

describe('topics', () => {
  test('topicOf reads the headline first, then the summary, then the section', () => {
    assert.equal(topicOf({ title: 'Rocket launches a probe to study the Sun', summary: '' }), 'SPACE');
    assert.equal(topicOf({ title: 'Handheld games console sells 2 million units', summary: '' }), 'GAMING');
    assert.equal(topicOf({ title: 'Quiet day', summary: 'A telescope in Chile saw it.' }), 'ASTRONOMY');
    assert.equal(topicOf({ title: 'Quiet day', summary: 'Nothing.', category: 'tech' }), 'TECHNOLOGY');
    assert.equal(topicOf({ title: 'Quiet day', summary: 'Nothing.', category: 'tech' }, { section: false }), null);
  });

  test('onBeat filters only the sections the beat names', () => {
    const beat = { tech: ['SPACE', 'ASTRONOMY'] };
    assert.equal(onBeat({ title: 'Rocket reaches orbit', category: 'tech' }, beat), true);
    assert.equal(onBeat({ title: 'Games console sells out', category: 'tech' }, beat), false);
    assert.equal(onBeat({ title: 'Games console sells out', category: 'science' }, beat), true, 'the primary section is always on the beat');
    assert.equal(onBeat({ title: 'Anything', category: 'tech' }, null), true);
  });
});

describe('NewsDesk.candidates: pools and beats', () => {
  test('a section with a single outlet still fills a long programme (variety first, then the rest, in ranking order)', () => {
    const stories = [];
    const words = ['Laptop', 'Router', 'Camera', 'Printer', 'Drone', 'Tablet', 'Headset', 'Keyboard'];
    words.forEach((w, i) => stories.push(story(`t${i}`, 'Only Tech Feed', { category: 'tech', title: `${w} launch`, published: NOW - i * 60_000 })));
    stories.push(story('o1', 'Other Outlet', { category: 'tech', title: 'Other outlet gadget', published: NOW - 20 * 60_000 }));
    const got = deskOf(stories).candidates(9, { categories: ['tech'], fill: true });
    assert.equal(deskOf(stories).candidates(9, { categories: ['tech'] }).length, 4, 'without fill the cap holds: 3 + 1');
    assert.equal(got.length, 9, 'not capped at 3 per outlet when nothing else is left');
    const rank = (s) => NOW - s.published;
    for (let i = 1; i < got.length; i++) assert.ok(rank(got[i - 1]) <= rank(got[i]), `ranking order kept: ${ids(got)}`);
  });

  test('the per-outlet cap still spreads outlets when there is a choice', () => {
    const stories = [];
    ['Harbour', 'Bridge', 'Market', 'Library', 'Stadium'].forEach((w, i) => stories.push(story(`a${i}`, 'A', { title: `${w} reopens`, published: NOW - i * 1000 })));
    ['Orchard', 'Railway', 'Glacier'].forEach((w, i) => stories.push(story(`b${i}`, 'B', { title: `${w} survey`, published: NOW - 600_000 - i * 1000 })));
    const got = deskOf(stories).candidates(6, { perSource: 3, fill: true });
    assert.deepEqual(ids(got).sort(), ['a0', 'a1', 'a2', 'b0', 'b1', 'b2'].sort());
  });

  test('a beat keeps a secondary section\'s stories only on the programme\'s topics (COSMOS: a rocket, not a games console)', () => {
    const stories = [
      story('console', 'Circuit', { category: 'tech', title: 'Handheld games console sells 2 million units' }),
      story('rocket', 'Circuit', { category: 'tech', title: 'Rocket launches a probe to study the Sun' }),
      story('robots', 'Circuit', { category: 'tech', title: 'Barcelona trials a fleet of delivery robots' }),
      story('bees', 'Starfield', { category: 'science', title: 'Bees use the sun as a compass' }),
    ];
    const got = deskOf(stories).candidates(10, { categories: ['science', 'tech'], beat: { tech: ['SPACE', 'ASTRONOMY'] } });
    assert.deepEqual(ids(got).sort(), ['bees', 'rocket']);
  });

  test('avoid may be a function: stories another programme wants weigh less', () => {
    const stories = [story('mine', 'A', { published: NOW - 120_000 }), story('theirs', 'B', { published: NOW })];
    const desk = deskOf(stories);
    assert.deepEqual(ids(desk.candidates(2)), ['theirs', 'mine']);
    assert.deepEqual(ids(desk.candidates(2, { avoid: (s) => (s.id === 'theirs' ? 0.5 : 1) })), ['mine', 'theirs']);
  });
});

describe('Producer.select: beats of the programmes due next', () => {
  const programs = {
    tech: { title: 'TECH BYTES', categories: ['tech', 'science'], stories: 1 },
    cosmos: { title: 'COSMOS DESK', categories: ['science', 'tech'], stories: 1, beat: { tech: ['SPACE', 'ASTRONOMY'] } },
  };
  const stories = [
    story('rocket', 'Circuit', { category: 'tech', title: 'Rocket launches a probe to study the Sun', published: NOW }),
    story('phone', 'Circuit', { category: 'tech', title: 'Phone maker unveils a folding handset', published: NOW - 300_000 }),
    story('comet', 'Starfield', { category: 'science', title: 'Comet will be visible this week', published: NOW - 1000 }),
  ];
  const producer = (desk) => new Producer({ config: { candidatePool: 2, minNewStories: 1 }, newsDesk: desk, chain: null, log: silent });

  test('TECH BYTES leaves COSMOS its science and its space stories when COSMOS airs soon', () => {
    const p = producer(deskOf(stories.map((s) => ({ ...s }))));
    assert.deepEqual(ids(p.select(programs.tech)), ['rocket', 'phone'], 'alone, the freshest first (tech is its own beat)');
    assert.deepEqual(ids(p.select(programs.tech, { upcoming: [programs.cosmos] })), ['phone', 'rocket'], 'the space story weighs half when COSMOS is next');
  });

  test('COSMOS never gets an off-beat tech story', () => {
    const p = producer(deskOf(stories.map((s) => ({ ...s }))));
    assert.deepEqual(ids(p.select({ ...programs.cosmos, stories: 3 })).sort(), ['comet', 'rocket']);
  });
});

describe('channel.json: beat validation', () => {
  const base = () => ({
    presenters: { a: { name: 'A' } },
    rotation: ['p'],
    programs: { p: { title: 'P', tagline: 'T', style: 'S', storyLength: 'L', stories: 3, categories: ['science', 'tech'], presenters: ['a'] } },
  });
  test('a known topic list for one of the programme\'s sections passes', () => {
    const ch = base();
    ch.programs.p.beat = { tech: ['SPACE', 'CLIMATE'] };
    assert.doesNotThrow(() => validateChannel(ch));
  });
  test('typos fail at start: unknown topic, a section the programme does not cover, a non-object', () => {
    for (const beat of [{ tech: ['SPACEE'] }, { sport: ['SPACE'] }, ['SPACE'], { tech: [] }, { tech: 'SPACE' }]) {
      const ch = base();
      ch.programs.p.beat = beat;
      assert.throws(() => validateChannel(ch), /beat/, JSON.stringify(beat));
    }
  });
  test('the real channel config passes and COSMOS has a beat of known topics', async () => {
    const { loadChannel } = await import('../server/channel.js');
    const ch = loadChannel();
    assert.ok(ch.programs.cosmos.beat.tech.every((t) => TOPIC_NAMES.includes(t)));
  });
});

describe('mock: running order by news value', () => {
  const presenters = { A: { id: 'paco', name: 'Paco Pixel' }, B: { id: 'lola', name: 'Lola Byte' } };
  const write = async (stories, program) => extractJson((await createMockProvider().generate({ stories, channelName: 'TEST', presenters, program, count: program.stories })).text);
  const order = (script) => script.segments.filter((s) => s.type === 'story').map((s) => s.storyId);

  test('a grave story a few places down the desk leads over a curiosity', async () => {
    const stories = [
      { id: 'drones', title: 'Seoul festival lights up the river with 1,000 drones', summary: 'A festival in Seoul lit up the sky with 1,000 drones. Organisers said 200,000 people watched.', source: 'Post', category: 'world', image: null },
      { id: 'tunnel', title: 'Norway opens a road tunnel under a fjord', summary: 'Norway has opened a road tunnel under a fjord. The government says it cuts journeys by 40 minutes.', source: 'Herald', category: 'world', image: null },
      { id: 'heat', title: 'Seville records 44 degrees as Spain issues heat alert', summary: 'Temperatures reached 44 degrees in Seville. The weather agency has issued a red alert for the south.', source: 'Herald', category: 'world', image: null },
    ];
    const script = await write(stories, { id: 'tech-bytes', title: 'T', stories: 3, maxChats: 0 });
    assert.equal(order(script)[0], 'heat');
  });

  test('main stories air by news value: hard news before soft', async () => {
    const stories = [
      { id: 'lead', title: 'BREAKING: Canal reopens after closure', summary: 'The canal has reopened after a day. Ships are waiting.', source: 'Post', category: 'world', image: null },
      { id: 'museum', title: 'Museum opens a new wing for old boats', summary: 'A museum has opened a new wing for two old boats. Visitors can see them from Monday.', source: 'Herald', category: 'world', image: null },
      { id: 'strike', title: 'Rail strike halts most trains', summary: 'Most trains have stopped as rail workers strike over pay. Unions say talks have stalled.', source: 'Herald', category: 'world', image: null },
    ];
    const script = await write(stories, { id: 'tech-bytes', title: 'T', stories: 3, maxChats: 0 });
    assert.deepEqual(order(script), ['lead', 'strike', 'museum']);
  });
});
