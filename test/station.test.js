import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Station, episodeAir } from '../server/station.js';
import { NewsDesk } from '../server/news.js';
import { WeatherDesk } from '../server/weather.js';
import { Producer } from '../server/producer.js';
import { ProviderChain } from '../server/providers/index.js';
import { createMockProvider } from '../server/providers/mock.js';
import { castOf, loadChannel, publicChannel } from '../server/channel.js';

// ---------------------------------------------------------------- helpers

const silentLogger = { info() {}, warn() {}, error() {} };

const NOW = Date.now();
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const CONFIG = { queueSize: 2 };

/** Let pending promise callbacks (such as the fire-and-forget fill() in next()) settle. */
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function settle(station) {
  for (let i = 0; i < 20 && (station.producing || i < 2); i++) await tick();
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}

/** A three-programme channel: a duo (alpha), a solo (bravo) and another solo (charlie). */
const makeChannel = ({ rotation = ['alpha', 'bravo', 'charlie'], breaks = { adsPerBreak: 2, maxExtraAds: 3 } } = {}) => {
  const program = (title, tagline, theme, presenters, maxChats) => ({
    title,
    tagline,
    theme,
    presenters,
    categories: ['world'],
    stories: 3,
    maxChats,
    style: 'Some style.',
    storyLength: 'Some length.',
  });
  const channel = {
    name: 'TEST TV',
    slogan: 'ALL TEST',
    presenters: {
      ann: { name: 'Ann Anchor', personality: 'calm', voice: { gender: 'female', lang: 'en-GB', pitch: 1, rate: 1 } },
      bob: { name: 'Bob Banter', personality: 'funny', voice: { gender: 'male', lang: 'en-US', pitch: 1, rate: 1 } },
      cyd: { name: 'Cyd Solo', personality: 'deadpan', voice: { gender: 'robot', lang: 'en-US', pitch: 0.6, rate: 1 } },
    },
    programs: {
      alpha: program('ALPHA NEWS', 'FIRST', 'world', ['ann', 'bob'], 2),
      bravo: program('BRAVO TECH', 'SECOND', 'tech', ['cyd'], 0),
      charlie: program('CHARLIE MONEY', 'THIRD', 'money', ['ann'], 0),
    },
    rotation,
  };
  if (breaks) channel.breaks = breaks;
  return channel;
};

/** What a break's `next` (and the schedule) says about a programme. */
const metaOf = (channel, id, ready) => {
  const p = channel.programs[id];
  return { id, title: p.title, tagline: p.tagline, theme: p.theme, presenters: p.presenters, ...(ready === undefined ? {} : { ready }) };
};

let episodeSeq = 0;
const makeEpisode = (channel, programId) => {
  const p = channel.programs[programId];
  const n = ++episodeSeq;
  return {
    kind: 'episode',
    id: `e${n}`,
    createdAt: new Date().toISOString(),
    program: { id: programId, title: p.title, tagline: p.tagline, theme: p.theme },
    cast: castOf(channel, programId),
    provider: 'fake',
    pipeline: [],
    title: `${p.title} episode ${n}`,
    segments: [{ type: 'intro' }],
    rundown: [],
    storyIds: [`story-${n}`],
  };
};

/** Fake Producer: records what the station asks for and can be told what to do. */
function makeFakeProducer() {
  const producer = {
    unavailable: new Set(), // programmes canProduce() refuses
    emptyHanded: new Set(), // programmes produce() returns null for
    failWith: null, // Error produce() throws
    gate: null, // promise produce() waits for, to keep a production "in progress"
    canProduceCalls: [],
    produceCalls: [],
    canProduce(channel, id) {
      producer.canProduceCalls.push(id);
      return !producer.unavailable.has(id);
    },
    async produce(channel, id) {
      producer.produceCalls.push(id);
      if (producer.gate) await producer.gate;
      if (producer.failWith) throw producer.failWith;
      if (producer.emptyHanded.has(id)) return null;
      return makeEpisode(channel, id);
    },
  };
  return producer;
}

/** Fake NewsDesk with the surface Station relies on. */
function makeFakeDesk(stories = []) {
  const desk = {
    stories: new Map(stories.map((s) => [s.id, s])),
    covered: new Set(),
    feedStatus: { 'Outlet 1': { ok: true, items: 3 } },
    lastRefresh: 0,
    refreshCalls: 0,
    refreshError: null,
    uncovered: () => [...desk.stories.values()].filter((s) => !desk.covered.has(s.id)).sort((a, b) => b.published - a.published),
    async refresh() {
      desk.refreshCalls++;
      if (desk.refreshError) throw desk.refreshError;
      return 0;
    },
  };
  return desk;
}

const fakeChain = { status: () => [{ name: 'fake', configured: true, cooldownUntil: null, failures: 0 }] };

function makeStation({ channel = makeChannel(), config = CONFIG, stories = [], log = silentLogger } = {}) {
  const state = { channel };
  const desk = makeFakeDesk(stories);
  const producer = makeFakeProducer();
  const station = new Station({ config, newsDesk: desk, producer, chain: fakeChain, channel: () => state.channel, log });
  return { station, producer, desk, state, channel };
}

/** Calls next() `n` times, each time reporting the id of the previous item (a client playing along). */
function walk(station, n, afterId) {
  const items = [];
  for (let i = 0; i < n; i++) {
    const item = station.next(afterId);
    items.push(item);
    afterId = item?.id;
  }
  return items;
}

const describeItem = (item) => (item.kind === 'break' ? (item.filler ? 'filler' : 'break') : item.replay ? `replay:${item.program.id}` : item.program.id);

// ---------------------------------------------------------------- fill()

describe('Station.fill', () => {
  test('produces episodes in the order of channel.rotation until queueSize are ready', async () => {
    const { station, producer } = makeStation();

    await station.fill();

    assert.deepEqual(producer.produceCalls, ['alpha', 'bravo']);
    assert.deepEqual(station.queue.map((e) => e.program.id), ['alpha', 'bravo']);
    assert.equal(station.rotationIndex, 2);
    assert.equal(station.producing, null);
    assert.equal(station.lastError, null);
  });

  test('continues where it stopped and wraps around the rotation', async () => {
    const { station, producer } = makeStation({ config: { queueSize: 2 } });
    await station.fill(); // alpha, bravo
    station.queue.splice(0, 2);
    await station.fill(); // charlie, alpha
    station.queue.splice(0, 2);
    await station.fill(); // bravo, charlie

    assert.deepEqual(producer.produceCalls, ['alpha', 'bravo', 'charlie', 'alpha', 'bravo', 'charlie']);
    assert.equal(station.rotationIndex, 6);
  });

  test('stops after queueSize and does nothing when the queue is already full', async () => {
    const { station, producer } = makeStation({ config: { queueSize: 3 } });
    await station.fill();
    assert.equal(station.queue.length, 3);
    assert.equal(producer.produceCalls.length, 3);

    await station.fill();
    assert.equal(producer.produceCalls.length, 3, 'a full queue is left alone');
    assert.equal(producer.canProduceCalls.length, 3);
  });

  test('a queueSize of 0 produces nothing', async () => {
    const { station, producer } = makeStation({ config: { queueSize: 0 } });
    await station.fill();
    assert.deepEqual(producer.produceCalls, []);
  });

  test('skips programmes that cannot be produced right now and moves on to the next slot', async () => {
    const { station, producer } = makeStation();
    producer.unavailable.add('alpha');

    await station.fill();

    assert.deepEqual(producer.canProduceCalls, ['alpha', 'bravo', 'charlie']);
    assert.deepEqual(producer.produceCalls, ['bravo', 'charlie']);
    assert.deepEqual(station.queue.map((e) => e.program.id), ['bravo', 'charlie']);
    assert.equal(station.rotationIndex, 3, 'the skipped slot is used up');
  });

  test('with only one producible programme the queue fills with that programme, cycling past the others', async () => {
    const { station, producer } = makeStation();
    producer.unavailable.add('alpha');
    producer.unavailable.add('charlie');

    await station.fill();

    assert.deepEqual(producer.produceCalls, ['bravo', 'bravo']);
    assert.deepEqual(station.queue.map((e) => e.program.id), ['bravo', 'bravo']);
  });

  test('gives up after one full circle of the rotation when nothing can be produced', async () => {
    const { station, producer } = makeStation();
    producer.unavailable.add('alpha').add('bravo').add('charlie');

    await station.fill();

    assert.deepEqual(producer.canProduceCalls, ['alpha', 'bravo', 'charlie']);
    assert.deepEqual(producer.produceCalls, []);
    assert.equal(station.queue.length, 0);
    assert.equal(station.rotationIndex, 3);
    assert.equal(station.producing, null);
    assert.equal(station.lastError, null, 'having no news is not an error');
  });

  test('a rotation with repeated programmes is followed slot by slot', async () => {
    const { station, producer } = makeStation({ channel: makeChannel({ rotation: ['alpha', 'alpha', 'bravo'] }), config: { queueSize: 5 } });
    await station.fill();
    assert.deepEqual(producer.produceCalls, ['alpha', 'alpha', 'bravo', 'alpha', 'alpha']);
  });

  test('a produce() that comes back empty-handed is skipped like an unproducible programme', async () => {
    const { station, producer } = makeStation({ channel: makeChannel({ rotation: ['alpha', 'bravo'] }) });
    producer.emptyHanded.add('alpha');

    await station.fill();

    assert.deepEqual(producer.produceCalls, ['alpha', 'bravo', 'alpha', 'bravo']);
    assert.deepEqual(station.queue.map((e) => e.program.id), ['bravo', 'bravo']);
    assert.equal(station.producing, null);
  });

  test('when every produce() is empty-handed it stops after one circle, without an error', async () => {
    const { station, producer } = makeStation();
    producer.emptyHanded.add('alpha').add('bravo').add('charlie');
    await station.fill();
    assert.equal(station.queue.length, 0);
    assert.equal(producer.produceCalls.length, 3);
    assert.equal(station.lastError, null);
  });

  test('a failing production sets lastError, stops filling and keeps the same slot for the next try', async () => {
    const { station, producer } = makeStation();
    producer.failWith = new Error('no AI provider available (codex: boom)');

    await station.fill();

    assert.equal(station.lastError, 'no AI provider available (codex: boom)');
    assert.deepEqual(producer.produceCalls, ['alpha'], 'it does not try the next programme');
    assert.equal(station.queue.length, 0);
    assert.equal(station.rotationIndex, 0, 'the programme that failed is retried');
    assert.equal(station.producing, null);

    producer.failWith = null;
    await station.fill();
    assert.deepEqual(producer.produceCalls, ['alpha', 'alpha', 'bravo']);
    assert.equal(station.lastError, null, 'a later success clears the error');
  });

  test('a failure after some episodes were queued keeps them', async () => {
    const { station, producer } = makeStation({ config: { queueSize: 3 } });
    await station.fill();
    station.queue.length = 1;
    producer.failWith = new Error('boom');
    await station.fill();
    assert.equal(station.queue.length, 1);
    assert.equal(station.lastError, 'boom');
  });

  test('concurrent fill() calls do not produce in parallel; "producing" names the programme being made', async () => {
    const { station, producer } = makeStation();
    const gate = deferred();
    producer.gate = gate.promise;

    const first = station.fill();
    assert.equal(station.producing, 'alpha');
    assert.equal(station.status().producing, 'ALPHA NEWS');
    const second = station.fill(); // returns at once: a production is already running
    await tick();
    assert.deepEqual(producer.produceCalls, ['alpha'], 'the second call did not start another production');

    producer.gate = null;
    gate.resolve();
    await Promise.all([first, second]);

    assert.deepEqual(producer.produceCalls, ['alpha', 'bravo']);
    assert.equal(station.queue.length, 2);
    assert.equal(station.producing, null);
    assert.equal(station.status().producing, null);
  });

  test('emits a "status" event when a production starts and when it ends', async () => {
    const { station } = makeStation({ config: { queueSize: 1 } });
    const events = [];
    station.on((event, data) => event === 'status' && events.push({ producing: data.producing, queue: data.queue }));

    await station.fill();

    assert.deepEqual(events, [
      { producing: 'ALPHA NEWS', queue: [] },
      { producing: null, queue: ['ALPHA NEWS'] },
    ]);
  });

  test('reads the channel on every call, so edits to the rotation take effect live', async () => {
    const { station, producer, state } = makeStation({ config: { queueSize: 1 } });
    await station.fill(); // alpha, index 1
    station.queue.length = 0;

    state.channel = makeChannel({ rotation: ['charlie', 'bravo'] });
    await station.fill(); // index 1 % 2 -> bravo
    station.queue.length = 0;
    await station.fill(); // index 2 % 2 -> charlie

    assert.deepEqual(producer.produceCalls, ['alpha', 'bravo', 'charlie']);
  });

  test('passes the current channel and the programme id to the producer', async () => {
    const { station, producer } = makeStation({ config: { queueSize: 1 } });
    let seen;
    const original = producer.produce.bind(producer);
    producer.produce = async (channel, id) => {
      seen = { channel, id };
      return original(channel, id);
    };
    await station.fill();
    assert.equal(seen.id, 'alpha');
    assert.equal(seen.channel.name, 'TEST TV');
  });
});

// ---------------------------------------------------------------- next() / advance(): the playout

describe('Station playout: episodes and commercial breaks', () => {
  test('the first item is the first ready episode (no break before it); it moves from the queue to history', async () => {
    const { station } = makeStation();
    await station.fill();
    const [first, second] = station.queue;

    const item = station.next(undefined);

    assert.equal(item, first);
    assert.equal(item.replay, undefined);
    assert.deepEqual(station.history, [first]);
    assert.ok(!station.queue.includes(first));
    assert.ok(station.queue.includes(second));
  });

  test('taking an episode refills the queue in the background', async () => {
    const { station, producer } = makeStation();
    await station.fill();
    assert.equal(producer.produceCalls.length, 2);

    station.next(undefined);
    await settle(station);

    assert.equal(station.queue.length, CONFIG.queueSize);
    assert.deepEqual(producer.produceCalls, ['alpha', 'bravo', 'charlie']);
    assert.equal(station.producing, null);
  });

  test('after an episode comes a break, with the ads and what is on next', async () => {
    const { station, channel } = makeStation();
    await station.fill();
    const [e1, e2] = walk(station, 2);

    assert.equal(e1.kind, 'episode');
    assert.equal(e2.kind, 'break');
    assert.match(e2.id, /^k[0-9a-z]+$/);
    assert.equal(e2.filler, false);
    assert.equal(e2.ads, channel.breaks.adsPerBreak);
    assert.deepEqual(e2.next, metaOf(channel, 'bravo', true));
  });

  test('the number of ads in a normal break comes from channel.breaks.adsPerBreak (default 2)', async () => {
    const custom = makeStation({ channel: makeChannel({ breaks: { adsPerBreak: 4, maxExtraAds: 3 } }) });
    await custom.station.fill();
    assert.equal(walk(custom.station, 2)[1].ads, 4);

    const bare = makeStation({ channel: makeChannel({ breaks: null }) });
    await bare.station.fill();
    assert.equal(walk(bare.station, 2)[1].ads, 2);
  });

  test('(editorial-2 fix r2) break cadence: a full break only after minProgrammeBetween s of programme air, light ones between', async () => {
    const probe = makeStation();
    await probe.station.fill();
    const one = episodeAir(walk(probe.station, 1)[0]);
    assert.ok(one > 0);
    // about two and a half episodes of programme air between full breaks
    const { station } = makeStation({ channel: makeChannel({ breaks: { adsPerBreak: 2, maxExtraAds: 3, minProgrammeBetween: Math.round(one * 2.5) } }) });
    await station.fill();
    const items = [];
    let afterId;
    for (let i = 0; i < 12; i++) {
      const item = station.next(afterId);
      items.push(item);
      afterId = item.id;
      await settle(station);
    }
    const breaks = items.filter((i) => i.kind === 'break' && !i.filler);
    assert.ok(breaks.some((b) => b.light) && breaks.some((b) => !b.light), 'both kinds of break air');
    for (const b of breaks) assert.equal(b.ads, b.light ? 1 : 2, 'a light break carries one spot and the UP NEXT promo');
    assert.ok(breaks.every((b) => b.next), 'every break still says what is next');
    assert.equal(items[1].light, true, 'one episode is not enough programme air for a full break');
  });

  test('after a break comes the next ready episode, in rotation order, and the cycle repeats', async () => {
    const { station } = makeStation();
    await station.fill();

    const items = [];
    let afterId;
    for (let i = 0; i < 9; i++) {
      const item = station.next(afterId);
      items.push(item);
      afterId = item.id;
      await settle(station); // let the refill finish, as it does on a real server
    }

    assert.deepEqual(items.map(describeItem), ['alpha', 'break', 'bravo', 'break', 'charlie', 'break', 'alpha', 'break', 'bravo']);
    assert.deepEqual(station.history.map((h) => h.id), items.map((i) => i.id));
    assert.equal(new Set(items.map((i) => i.id)).size, items.length, 'every item has its own id');
  });

  test('a break created while the next episode is still in production announces it as not ready', async () => {
    const { station, channel } = makeStation();
    await station.fill(); // alpha and bravo are ready, charlie is next in the rotation

    // no waiting in between: the refill started by taking alpha has not finished yet
    const [alpha, break1, bravo, break2] = walk(station, 4);

    assert.deepEqual([alpha.program.id, bravo.program.id], ['alpha', 'bravo']);
    assert.deepEqual(break1.next, metaOf(channel, 'bravo', true));
    assert.deepEqual(break2.next, metaOf(channel, 'charlie', false));
  });

  test('with no episode ready after a break the channel plays filler breaks (1 ad each), up to maxExtraAds', async () => {
    const { station, producer } = makeStation();
    producer.unavailable.add('alpha').add('bravo').add('charlie');
    station.queue.push(makeEpisode(station.channel(), 'alpha'));

    const items = walk(station, 6);

    assert.deepEqual(items.map(describeItem), ['alpha', 'break', 'filler', 'filler', 'filler', 'replay:alpha']);
    assert.deepEqual(items.slice(2, 5).map((i) => [i.filler, i.ads]), [[true, 1], [true, 1], [true, 1]]);
    assert.equal(items[1].filler, false);
    assert.equal(items[1].ads, 2);
  });

  test('after maxExtraAds filler breaks the last episode is replayed, with a new id, flagged replay', async () => {
    const { station, producer } = makeStation();
    producer.unavailable.add('alpha').add('bravo').add('charlie');
    const original = makeEpisode(station.channel(), 'bravo');
    station.queue.push(original);

    const items = walk(station, 6);
    const replay = items[5];

    assert.equal(replay.replay, true);
    assert.equal(replay.kind, 'episode');
    assert.notEqual(replay.id, original.id);
    assert.match(replay.id, /^r[0-9a-z]+$/);
    assert.equal(replay.title, original.title);
    assert.deepEqual(replay.program, original.program);
    assert.equal(replay.segments, original.segments, 'same script');
    assert.equal(original.replay, undefined, 'the aired episode is not modified');
    assert.equal(station.history[0].replay, undefined);
  });

  test('a replay is followed by a normal break, then filler breaks again, then another replay', async () => {
    const { station, producer } = makeStation();
    producer.unavailable.add('alpha').add('bravo').add('charlie');
    station.queue.push(makeEpisode(station.channel(), 'alpha'));

    const items = walk(station, 14);

    assert.deepEqual(
      items.map(describeItem),
      ['alpha', 'break', 'filler', 'filler', 'filler', 'replay:alpha', 'break', 'filler', 'filler', 'filler', 'replay:alpha', 'break', 'filler', 'filler']
    );
    assert.equal(new Set(items.map((i) => i.id)).size, items.length, 'replays and breaks all get fresh ids');
  });

  test('a new episode arriving during the filler breaks goes on air at once and restarts the filler count', async () => {
    const { station, producer } = makeStation();
    producer.unavailable.add('alpha').add('bravo').add('charlie');
    const channel = station.channel();
    station.queue.push(makeEpisode(channel, 'alpha'));

    const [e1, brk, filler1] = walk(station, 3);
    assert.deepEqual([e1.kind, brk.kind, filler1.filler], ['episode', 'break', true]);

    const fresh = makeEpisode(channel, 'bravo');
    station.queue.push(fresh);
    const rest = walk(station, 6, filler1.id);

    assert.equal(rest[0], fresh);
    assert.deepEqual(rest.map(describeItem), ['bravo', 'break', 'filler', 'filler', 'filler', 'replay:bravo'], 'three fresh fillers, then a replay of the latest episode');
  });

  test('maxExtraAds 0 means no filler at all: the replay follows the break directly', async () => {
    const { station, producer } = makeStation({ channel: makeChannel({ breaks: { adsPerBreak: 2, maxExtraAds: 0 } }) });
    producer.unavailable.add('alpha').add('bravo').add('charlie');
    station.queue.push(makeEpisode(station.channel(), 'alpha'));
    assert.deepEqual(walk(station, 5).map(describeItem), ['alpha', 'break', 'replay:alpha', 'break', 'replay:alpha']);
  });

  test('without a "breaks" section the defaults are 2 ads per break and 6 filler breaks', async () => {
    const { station, producer } = makeStation({ channel: makeChannel({ breaks: null }) });
    producer.unavailable.add('alpha').add('bravo').add('charlie');
    station.queue.push(makeEpisode(station.channel(), 'alpha'));
    const items = walk(station, 9);
    assert.deepEqual(items.map(describeItem), ['alpha', 'break', ...Array(6).fill('filler'), 'replay:alpha']);
    assert.equal(items[1].ads, 2);
  });

  test('filler breaks announce the next slot that can really be made, "not ready", and promise nothing when none can', async () => {
    const { station, producer, channel } = makeStation();
    producer.unavailable.add('alpha').add('charlie');
    station.queue.push(makeEpisode(channel, 'charlie'));
    const [, brk, filler] = walk(station, 3);

    // nothing in production: alpha (rotation index 0) is short of news, so the promise is bravo, not ready
    assert.deepEqual(brk.next, metaOf(channel, 'bravo', false));
    assert.deepEqual(filler.next, metaOf(channel, 'bravo', false));

    // nothing at all can be made: no "UP NEXT" that would never air
    const dry = makeStation();
    dry.producer.unavailable.add('alpha').add('bravo').add('charlie');
    dry.station.queue.push(makeEpisode(dry.channel, 'charlie'));
    const [, brk2, filler2] = walk(dry.station, 3);
    assert.equal(brk2.next, null);
    assert.equal(filler2.next, null);
  });

  test('a break during a production announces that programme, not ready yet', async () => {
    const { station, producer, channel } = makeStation();
    station.history.push(makeEpisode(channel, 'alpha'));
    const gate = deferred();
    producer.gate = gate.promise;
    station.rotationIndex = 1;
    const filling = station.fill();

    const brk = station.next(station.history[0].id);

    assert.equal(brk.kind, 'break');
    assert.deepEqual(brk.next, metaOf(channel, 'bravo', false));
    producer.gate = null;
    gate.resolve();
    await filling;
  });

  test('with nothing aired and nothing in production there is nothing to show: null, and history stays empty', () => {
    const { station } = makeStation();
    assert.equal(station.next(undefined), null);
    assert.equal(station.next(null), null);
    assert.equal(station.next('whatever'), null);
    assert.deepEqual(station.history, []);
  });

  test('with nothing aired yet but an episode in production the channel plays filler breaks until it is ready', async () => {
    const { station, producer } = makeStation();
    const gate = deferred();
    producer.gate = gate.promise;
    const filling = station.fill();

    const [f1, f2] = walk(station, 2);
    assert.deepEqual([f1.kind, f1.filler, f1.ads], ['break', true, 1]);
    assert.deepEqual([f2.kind, f2.filler, f2.ads], ['break', true, 1]);
    assert.deepEqual(f1.next, metaOf(station.channel(), 'alpha', false));

    // the filler before the first episode is not limited by maxExtraAds
    const many = walk(station, 10, f2.id);
    assert.ok(many.every((i) => i.kind === 'break' && i.filler));

    producer.gate = null;
    gate.resolve();
    await filling;
    const next = station.next(many.at(-1).id);
    assert.equal(next.kind, 'episode');
    assert.equal(next.program.id, 'alpha');
  });

  test('a failed first production leaves the channel on standby (null)', async () => {
    const { station, producer } = makeStation();
    producer.failWith = new Error('boom');
    await station.fill();
    assert.equal(station.next(undefined), null);
  });

  test('refills in the background after every episode, but not after a break', async () => {
    const { station, producer } = makeStation({ config: { queueSize: 1 } });
    await station.fill();
    const episode = station.next(undefined);
    await settle(station);
    assert.equal(producer.produceCalls.length, 2, 'refilled after the episode went on air');

    const brk = station.next(episode.id);
    await settle(station);
    assert.equal(brk.kind, 'break');
    assert.equal(producer.produceCalls.length, 2, 'a break does not trigger a new production');
  });
});

// ---------------------------------------------------------------- next(afterId): clients

describe('Station.next(afterId): several clients, one channel', () => {
  test('a client that is up to date advances the channel; each client gets the item after the one it reports', async () => {
    const { station } = makeStation();
    await station.fill();

    const [a, b, c] = walk(station, 3);

    assert.deepEqual([a.kind, b.kind, c.kind], ['episode', 'break', 'episode']);
    assert.deepEqual(station.history.map((h) => h.id), [a.id, b.id, c.id]);
  });

  test('a client that is behind follows the history and does not consume the queue', () => {
    const { station, channel } = makeStation();
    const h1 = makeEpisode(channel, 'alpha');
    const h2 = { kind: 'break', id: 'k1', filler: false, ads: 2, next: {} };
    const h3 = makeEpisode(channel, 'bravo');
    station.history.push(h1, h2, h3);
    station.queue.push(makeEpisode(channel, 'charlie'));

    assert.equal(station.next(h1.id), h2);
    assert.equal(station.next(h2.id), h3);
    assert.equal(station.queue.length, 1, 'queue untouched');
    assert.equal(station.history.length, 3);
  });

  test('a client that joins later advances the channel; the others catch up from history', async () => {
    const { station } = makeStation();
    await station.fill();

    const first = station.next(undefined); // client A: first episode
    const second = station.next(undefined); // client B joins: the channel moves on to the break
    assert.deepEqual([first.kind, second.kind], ['episode', 'break']);

    assert.equal(station.next(first.id), second, 'A, still on the episode, is given the same break from history');
    assert.deepEqual(station.history.map((h) => h.id), [first.id, second.id]);
  });

  test('an unknown id (a client that reconnected after a restart) advances the channel', async () => {
    const { station } = makeStation();
    await station.fill();
    const item = station.next('gone');
    assert.equal(item.kind, 'episode');
    assert.equal(station.history.length, 1);
  });

  test('next(null) behaves like next(undefined)', async () => {
    const { station } = makeStation();
    await station.fill();
    assert.equal(station.next(null).kind, 'episode');
    assert.equal(station.next(null).kind, 'break');
  });

  test('keeps only the last 30 items in history', () => {
    const { station, producer, channel } = makeStation();
    producer.unavailable.add('alpha').add('bravo').add('charlie');
    station.queue.push(makeEpisode(channel, 'alpha'));

    const items = walk(station, 40);

    assert.equal(station.history.length, 30);
    assert.equal(station.history[0].id, items[10].id);
    assert.equal(station.history.at(-1).id, items.at(-1).id);
  });

  test('a client whose last item has been dropped from history gets the next item of the channel', () => {
    const { station, producer, channel } = makeStation();
    producer.unavailable.add('alpha').add('bravo').add('charlie');
    station.queue.push(makeEpisode(channel, 'alpha'));
    const items = walk(station, 40);

    const resumed = station.next(items[0].id); // long gone from history

    assert.equal(station.history.at(-1), resumed);
    assert.equal(station.history.length, 30);
  });

  test('emits a "schedule" event when the channel advances, but not when a client is served from history', async () => {
    const { station } = makeStation();
    await station.fill();
    const schedules = [];
    station.on((event, data) => event === 'schedule' && schedules.push(data));

    const first = station.next(undefined);
    assert.equal(schedules.length, 1);
    assert.deepEqual(schedules[0].now, { kind: 'episode', ...first.program });

    const second = station.next(first.id);
    assert.equal(schedules.length, 2);
    assert.deepEqual(schedules[1].now, { kind: 'break' });

    station.next(first.id); // behind: from history
    assert.equal(schedules.length, 2);
    assert.equal(station.next(first.id), second);
  });

  test('nothing is emitted or recorded when there is nothing to show', () => {
    const { station } = makeStation();
    const events = [];
    station.on((event) => events.push(event));
    assert.equal(station.next(undefined), null);
    assert.deepEqual(events, []);
    assert.equal(station.history.length, 0);
  });

  test('on() returns an unsubscribe function', () => {
    const { station } = makeStation();
    const seen = [];
    const off = station.on((event) => seen.push(event));
    station.emit('a', 1);
    off();
    station.emit('b', 2);
    assert.deepEqual(seen, ['a']);
  });
});

// ---------------------------------------------------------------- schedule() / upNext()

describe('Station.schedule and upNext', () => {
  test('with nothing queued: no current item, and the upcoming slots come from the rotation, not ready', () => {
    const { station, channel } = makeStation();
    assert.deepEqual(station.schedule(), {
      now: null,
      upcoming: [metaOf(channel, 'alpha', false), metaOf(channel, 'bravo', false), metaOf(channel, 'charlie', false)],
    });
  });

  test('queued episodes come first and are ready; then rotation slots from the production point, up to 4 items', async () => {
    const channel = makeChannel({ rotation: ['alpha', 'bravo', 'charlie', 'alpha', 'bravo', 'charlie', 'alpha'] });
    const { station } = makeStation({ channel });
    await station.fill(); // alpha, bravo queued; rotationIndex 2

    const { upcoming } = station.schedule();

    assert.deepEqual(upcoming, [metaOf(channel, 'alpha', true), metaOf(channel, 'bravo', true), metaOf(channel, 'charlie', false), metaOf(channel, 'alpha', false)]);
  });

  test('the upcoming list wraps around a short rotation, and never has more items than the rotation allows', () => {
    const channel = makeChannel({ rotation: ['alpha', 'bravo'] });
    const { station } = makeStation({ channel });
    station.rotationIndex = 1;
    assert.deepEqual(station.schedule().upcoming, [metaOf(channel, 'bravo', false), metaOf(channel, 'alpha', false)]);
  });

  test('a queue of 4 or more episodes needs no rotation slots', async () => {
    const { station } = makeStation({ config: { queueSize: 5 } });
    await station.fill();
    const { upcoming } = station.schedule();
    assert.equal(upcoming.length, 5);
    assert.ok(upcoming.every((u) => u.ready));
  });

  test('"now" is the programme on air, or a break, or a replay of an episode', async () => {
    const { station, producer, channel } = makeStation();
    producer.unavailable.add('alpha').add('bravo').add('charlie');
    station.queue.push(makeEpisode(channel, 'bravo'));
    const bravoNow = { kind: 'episode', id: 'bravo', title: 'BRAVO TECH', tagline: 'SECOND', theme: 'tech' };

    const episode = station.next(undefined);
    assert.deepEqual(station.schedule().now, bravoNow);

    const brk = station.next(episode.id);
    assert.deepEqual(station.schedule().now, { kind: 'break' });

    const rest = walk(station, 4, brk.id); // three filler breaks, then the replay
    assert.equal(rest.at(-1).replay, true);
    assert.deepEqual(station.schedule().now, bravoNow);
  });

  test('upNext(): the head of the queue is ready', async () => {
    const { station, channel } = makeStation();
    await station.fill();
    assert.deepEqual(station.upNext(channel), metaOf(channel, 'alpha', true));
  });

  test('upNext(): with an empty queue it is the programme in production, not ready', async () => {
    const { station, producer, channel } = makeStation();
    const gate = deferred();
    producer.gate = gate.promise;
    station.rotationIndex = 2;
    const filling = station.fill();
    assert.deepEqual(station.upNext(channel), metaOf(channel, 'charlie', false));
    producer.gate = null;
    gate.resolve();
    await filling;
  });

  test('upNext(): with nothing queued or in production it is the next slot of the rotation, not ready', () => {
    const { station, channel } = makeStation();
    station.rotationIndex = 4; // 4 % 3 = 1
    assert.deepEqual(station.upNext(channel), metaOf(channel, 'bravo', false));
  });

  test('programMeta() describes a programme, or is null for an unknown one', () => {
    const { station, channel } = makeStation();
    assert.deepEqual(station.programMeta(channel, 'alpha'), metaOf(channel, 'alpha'));
    assert.equal(station.programMeta(channel, 'nope'), null);
  });
});

// ---------------------------------------------------------------- ticker, news refresh, breaking news, status

describe('Station ticker and news refresh', () => {
  const makeStory = (i, extra = {}) => ({
    id: `s${i}`,
    title: `Story number ${i} of the day`,
    source: `Outlet ${(i % 3) + 1}`,
    published: NOW - i * MINUTE,
    ...extra,
  });
  const makeStories = (n) => Array.from({ length: n }, (_, k) => makeStory(k + 1));

  test('ticker() lists the 18 newest stories as {source, text}, newest first', () => {
    const { station } = makeStation({ stories: makeStories(25) });
    const ticker = station.ticker();
    assert.equal(ticker.length, 18);
    assert.deepEqual(ticker[0], { source: 'Outlet 2', text: 'Story number 1 of the day' });
    assert.equal(ticker[17].text, 'Story number 18 of the day');
  });

  test('refreshNews() refreshes the desk and emits the ticker', async () => {
    const { station, desk } = makeStation({ stories: makeStories(3) });
    const events = [];
    station.on((event, data) => events.push([event, data]));

    await station.refreshNews();

    assert.equal(desk.refreshCalls, 1);
    assert.deepEqual(events, [['ticker', station.ticker()]]);
  });

  test('refreshNews() swallows desk errors and logs a warning', async () => {
    const warnings = [];
    const { station, desk } = makeStation({ log: { info() {}, error() {}, warn: (m) => warnings.push(m) } });
    desk.refreshError = new Error('feeds are down');
    await assert.doesNotReject(station.refreshNews());
    assert.deepEqual(warnings, ['[news] refresh failed: feeds are down']);
  });

  describe('breaking-news detection', () => {
    const breakingFor = async (title) => {
      const { station } = makeStation({ stories: [makeStory(1, { title, published: NOW - 5 * MINUTE })] });
      const breaking = [];
      station.on((event, data) => event === 'breaking' && breaking.push(data));
      await station.refreshNews();
      return breaking;
    };

    test('announces headlines that say BREAKING or "última hora"', async () => {
      const titles = [
        'BREAKING: Magnitude 7 earthquake hits Japan',
        'Breaking news: minister resigns',
        'Minister resigns, breaking',
        'Minister resigns – BREAKING',
        'Última hora: dimite el ministro',
        'ÚLTIMA HORA: dimite el ministro',
      ];
      for (const title of titles) {
        assert.deepEqual(await breakingFor(title), [{ source: 'Outlet 2', text: title }], title);
      }
    });

    test('does not announce live blogs ("– live", "live updates"): they are rolling coverage, not breaking news', async () => {
      for (const title of ['Iran strikes – live', 'Election night -live', 'Live updates: vote count under way', 'Premier League – live']) {
        assert.deepEqual(await breakingFor(title), [], title);
      }
    });

    test('does not announce ordinary headlines', async () => {
      const titles = ['Minister resigns', 'Live music festival opens in Lisbon', 'Olive harvest begins early', 'Alive and well after ten days at sea', 'Deliver the goods, says union', 'Update on the budget talks'];
      for (const title of titles) assert.deepEqual(await breakingFor(title), [], title);
    });

    test(
      'does not mistake "record-breaking", "ground-breaking" or "breaking into" for breaking news',
      async () => {
        for (const title of ['Record-breaking heatwave hits southern Europe', 'Ground-breaking study on sleep published', 'Man charged with breaking into home']) {
          assert.deepEqual(await breakingFor(title), [], title);
        }
      }
    );

    test('announces each story once, one per refresh, only if it is recent and not yet covered', async () => {
      const stories = [
        makeStory(1, { title: 'BREAKING: first urgent story', published: NOW - 10 * MINUTE }),
        makeStory(2, { title: 'Breaking: second urgent story', published: NOW - 20 * MINUTE }),
        makeStory(3, { title: 'Breaking: far too old', published: NOW - 5 * HOUR }),
        makeStory(4, { title: 'Breaking: already covered', published: NOW - 5 * MINUTE }),
        makeStory(5, { title: 'Ordinary story', published: NOW - MINUTE }),
      ];
      const { station, desk } = makeStation({ stories });
      desk.covered.add('s4');
      const breaking = [];
      station.on((event, data) => event === 'breaking' && breaking.push(data));

      await station.refreshNews();
      assert.equal(breaking.length, 1, 'one per refresh');
      await station.refreshNews();
      await station.refreshNews();

      assert.deepEqual(breaking.map((b) => b.text), ['BREAKING: first urgent story', 'Breaking: second urgent story']);
      assert.equal(breaking[0].source, 'Outlet 2');
    });

    test('a story that is just under 3 hours old is still announced, one over 3 hours is not', async () => {
      const stories = [
        makeStory(1, { title: 'Breaking: just in time', published: NOW - 3 * HOUR + 5 * MINUTE }),
        makeStory(2, { title: 'Breaking: just too late', published: NOW - 3 * HOUR - 5 * MINUTE }),
      ];
      const { station } = makeStation({ stories });
      const breaking = [];
      station.on((event, data) => event === 'breaking' && breaking.push(data.text));
      await station.refreshNews();
      await station.refreshNews();
      assert.deepEqual(breaking, ['Breaking: just in time']);
    });

    test('is not announced when the refresh fails', async () => {
      const { station, desk } = makeStation({ stories: [makeStory(1, { title: 'BREAKING: something', published: NOW - MINUTE })] });
      desk.refreshError = new Error('feeds are down');
      const breaking = [];
      station.on((event) => event === 'breaking' && breaking.push(event));
      await station.refreshNews();
      assert.deepEqual(breaking, []);
    });
  });
});

describe('Station.status and publicChannel', () => {
  test('status() summarises the queue (programme titles), production, history, news desk and providers', async () => {
    const { station, desk } = makeStation({ stories: [{ id: 's1', title: 'x', source: 'Outlet 1', published: NOW }, { id: 's2', title: 'y', source: 'Outlet 1', published: NOW }] });
    assert.equal(station.status().lastRefresh, null);
    assert.deepEqual(station.status().queue, []);
    assert.equal(station.status().producing, null);

    await station.fill();
    station.next(undefined);
    await settle(station);
    desk.lastRefresh = Date.UTC(2026, 9, 2, 12, 0, 0);
    desk.covered.add('s1');

    assert.deepEqual(station.status(), {
      queue: ['BRAVO TECH', 'CHARLIE MONEY'],
      producing: null,
      aired: 1,
      airedTotal: 1,
      lastError: null,
      stories: 2,
      uncovered: 1,
      feeds: desk.feedStatus,
      lastRefresh: '2026-10-02T12:00:00.000Z',
      providers: [{ name: 'fake', configured: true, cooldownUntil: null, failures: 0 }],
    });
  });

  test('status() reports the last error', async () => {
    const { station, producer } = makeStation();
    producer.failWith = new Error('no AI provider available (all paused)');
    await station.fill();
    assert.equal(station.status().lastError, 'no AI provider available (all paused)');
  });

  test('publicChannel() is the browser view of the current channel, with no prompt-only fields', () => {
    const { station, state } = makeStation();
    assert.deepEqual(station.publicChannel(), publicChannel(state.channel));
    const json = JSON.stringify(station.publicChannel());
    assert.ok(!json.includes('personality') && !json.includes('storyLength'));
  });

  test('the LATEST ticker carries news only: never an advice column, a gallery or a deal (9 Oct)', () => {
    const now = Date.now();
    const desk = makeFakeDesk([
      { id: 'a', title: 'My brother-in-law convinced his parents to sign over their home. Do I intervene?', source: 'MarketWatch', published: now },
      { id: 'b', title: 'New-build homes for first-time buyers in England – in pictures', source: 'Guardian', published: now - 1 },
      { id: 'c', title: 'Saudi Arabia reopens Riyadh airport after Houthi attack kills three', source: 'Al Jazeera', published: now - 2 },
    ]);
    const station = new Station({ config: CONFIG, newsDesk: desk, producer: makeFakeProducer(), chain: fakeChain, log: silentLogger });
    assert.deepEqual(station.ticker().map((t) => t.text), ['Saudi Arabia reopens Riyadh airport after Houthi attack kills three']);
  });

  test('without a `channel` option the station uses config/channel.json', () => {
    const station = new Station({ config: CONFIG, newsDesk: makeFakeDesk(), producer: makeFakeProducer(), chain: fakeChain, log: silentLogger });
    assert.equal(station.channel().name, 'GLOBIT 24');
    assert.equal(station.publicChannel().name, 'GLOBIT 24');
    assert.deepEqual(station.channel(), loadChannel());
  });
});

// ---------------------------------------------------------------- the whole thing: real Producer, NewsDesk and mock AI

describe('Station with the real Producer, NewsDesk and mock provider', () => {
  const noNetwork = async (url) => {
    throw new Error(`unexpected network access to ${url}`);
  };
  const WORDS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet', 'kilo', 'lima', 'mike', 'november', 'oscar', 'papa', 'quebec', 'romeo', 'sierra', 'tango'];

  function makeNewsroom({ perCategory = 14, queueSize = 2, channel = loadChannel() } = {}) {
    const desk = new NewsDesk({ log: silentLogger, fetchImpl: noNetwork, lookup: async () => [] });
    let n = 0;
    for (const category of ['world', 'business', 'tech', 'science']) {
      for (let i = 0; i < perCategory; i++, n++) {
        desk.stories.set(`n${n}`, {
          id: `n${n}`,
          title: `${WORDS[n % 20]} ${WORDS[(n * 7 + 3) % 20]}${n} ${category} headline${n}`,
          summary: `Summary of newsroom story number ${n}, long enough to count as a proper summary for the ranking.`,
          link: `https://example.test/n${n}`,
          source: `Outlet ${n % 7}`,
          category,
          weight: 1,
          published: NOW - (n + 1) * MINUTE,
          image: null,
        });
      }
    }
    desk.updateTrending();
    const config = { queueSize, candidatePool: 12, minNewStories: 3, reviewPass: true };
    const chain = new ProviderChain([createMockProvider()], { record() {} }, { log: silentLogger });
    const producer = new Producer({ config, newsDesk: desk, chain, weather: new WeatherDesk({ source: 'fixture', log: silentLogger }), log: silentLogger });
    const station = new Station({ config, newsDesk: desk, producer, chain, channel: () => channel, log: silentLogger });
    return { station, desk, channel };
  }

  test('fills the queue in the order of the real rotation', async () => {
    const { station } = makeNewsroom();
    await station.fill();
    const rotation = loadChannel().rotation;
    assert.deepEqual(station.queue.map((e) => e.program.id), [rotation[0], rotation[1]]);
    assert.ok(station.queue.every((e) => e.kind === 'episode' && e.segments.length >= 3));
  });

  test('plays a full day: episodes in rotation order, a break after each, no story twice', async () => {
    const { station, channel } = makeNewsroom({ perCategory: 20 });
    await station.fill();

    const items = [];
    let afterId;
    for (let i = 0; i < 14; i++) {
      const item = station.next(afterId);
      items.push(item);
      afterId = item.id;
      await settle(station);
    }

    const episodes = items.filter((i) => i.kind === 'episode');
    assert.deepEqual(items.map((i) => i.kind), Array.from({ length: 14 }, (_, i) => (i % 2 ? 'break' : 'episode')));
    assert.deepEqual(episodes.map((e) => e.program.id), channel.rotation.slice(0, 7), 'a whole turn of the rotation');
    const stories = episodes.flatMap((e) => e.storyIds);
    assert.equal(new Set(stories).size, stories.length, 'no story is aired twice');
    // (editorial-2 fix r2, pace's break cadence) a full commercial break only after minProgrammeBetween seconds of
    // programme air since the last one; before that a light break (one spot and the UP NEXT promo)
    let air = 0;
    for (const item of items) {
      if (item.kind === 'episode') {
        air += episodeAir(item);
        continue;
      }
      assert.equal(item.filler, false);
      const light = air < channel.breaks.minProgrammeBetween;
      assert.equal(!!item.light, light, `${Math.round(air)} s of programme air since the last commercial break`);
      assert.equal(item.ads, light ? 1 : channel.breaks.adsPerBreak);
      assert.ok(channel.programs[item.next.id], 'a break always says what is next');
      if (!light) air = 0;
    }
  });

  test('when the news runs out the channel falls back to filler breaks and then replays the last episode', async () => {
    const { station, channel } = makeNewsroom({ perCategory: 3, queueSize: 1 }); // 3 stories per category: only a few episodes can be made
    await station.fill();

    const items = [];
    let afterId;
    for (let i = 0; i < 60; i++) {
      const item = station.next(afterId);
      items.push(item);
      afterId = item.id;
      await settle(station);
    }

    const kinds = items.map(describeItem);
    assert.ok(kinds.includes('filler'), kinds.join());
    assert.ok(kinds.some((k) => k.startsWith('replay:')), kinds.join());
    const firstReplay = kinds.findIndex((k) => k.startsWith('replay:'));
    const fillersBefore = kinds.slice(0, firstReplay).filter((k) => k === 'filler').length;
    assert.ok(fillersBefore >= channel.breaks.maxExtraAds, `${fillersBefore} fillers before the first replay`);
    assert.equal(station.status().lastError, null);
  });
});
