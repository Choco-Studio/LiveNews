import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Station } from '../server/station.js';
import { createMockProvider } from '../server/providers/mock.js';

// ---------------------------------------------------------------- helpers

const silentLogger = { info() {}, warn() {}, error() {} };

const CONFIG = { queueSize: 2, minNewStories: 3, storiesPerBulletin: 3, channelName: 'TEST' };

const NOW = Date.now();
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Let pending promise callbacks (such as the fire-and-forget fill() in next()) settle. */
const tick = () => new Promise((resolve) => setImmediate(resolve));

const makeStory = (i, extra = {}) => ({
  id: `s${i}`,
  title: `Noticia número ${i} del día`,
  summary: 'Resumen de la noticia. Segunda frase del resumen.',
  link: `https://example.test/${i}`,
  source: `Fuente ${(i % 3) + 1}`,
  category: 'general',
  published: NOW - i * MINUTE,
  image: null,
  ...extra,
});

const makeStories = (n, from = 1) => Array.from({ length: n }, (_, k) => makeStory(from + k));

/** Minimal bulletin object for tests that poke the queue/history directly. */
const makeBulletin = (id) => ({ id, title: `Boletín ${id}`, segments: [], rundown: [], storyIds: [] });

/** Fake NewsDesk with the surface Station relies on, recording what it is asked to do. */
function makeDesk(stories = []) {
  const desk = {
    stories: new Map(stories.map((s) => [s.id, s])),
    covered: new Set(),
    feedStatus: { 'Fuente 1': { ok: true, items: 3 } },
    lastRefresh: 0,
    pickCalls: [],
    resolveCalls: [],
    markCoveredCalls: [],
    refreshCalls: 0,
    refreshError: null,
    uncovered() {
      return [...desk.stories.values()].filter((s) => !desk.covered.has(s.id)).sort((a, b) => b.published - a.published);
    },
    pickStories(count) {
      desk.pickCalls.push(count);
      return desk.uncovered().slice(0, count);
    },
    async resolveImage(story) {
      desk.resolveCalls.push(story.id);
      return story.image;
    },
    markCovered(ids) {
      desk.markCoveredCalls.push([...ids]);
      for (const id of ids) desk.covered.add(id);
    },
    get(id) {
      return desk.stories.get(id);
    },
    async refresh() {
      desk.refreshCalls++;
      if (desk.refreshError) throw desk.refreshError;
      return 0;
    },
  };
  return desk;
}

/** Fake ProviderChain: runs `validate` on a mock-provider reply, like the real chain would. */
function makeChain() {
  const chain = {
    requests: [],
    failWith: null,
    async generate(request, validate) {
      chain.requests.push(request);
      if (chain.failWith) throw new Error(chain.failWith);
      const { text } = await createMockProvider().generate(request);
      return { provider: 'fake', value: validate(text) };
    },
    status: () => [{ name: 'fake', configured: true, cooldownUntil: null, failures: 0 }],
  };
  return chain;
}

function makeStation({ stories = [], config = CONFIG } = {}) {
  const desk = makeDesk(stories);
  const chain = makeChain();
  const station = new Station({ config, newsDesk: desk, chain, log: silentLogger });
  return { station, desk, chain };
}

// ---------------------------------------------------------------- fill()

describe('Station.fill', () => {
  test('fills the queue up to queueSize, one bulletin per batch of fresh stories', async () => {
    const { station, desk, chain } = makeStation({ stories: makeStories(12) });

    await station.fill();

    assert.equal(station.queue.length, CONFIG.queueSize);
    assert.equal(chain.requests.length, CONFIG.queueSize);
    assert.deepEqual(desk.pickCalls, [3, 3]);
    assert.equal(station.generating, false);
    assert.equal(station.lastError, null);

    const [first, second] = station.queue;
    assert.equal(first.storyIds.length, 3);
    assert.equal(second.storyIds.length, 3);
    assert.deepEqual(first.storyIds.filter((id) => second.storyIds.includes(id)), [], 'bulletins never share stories');
  });

  test('builds the request from the config (channel name) and the picked stories', async () => {
    const { station, chain } = makeStation({ stories: makeStories(3) });
    await station.fill();

    const [request] = chain.requests;
    assert.equal(request.channelName, 'TEST');
    assert.deepEqual(request.stories.map((s) => s.id), ['s1', 's2', 's3']);
    assert.match(request.prompt, /"TEST"/);
    for (const id of ['s1', 's2', 's3']) assert.ok(request.prompt.includes(id));
  });

  test('marks the stories of each bulletin as covered', async () => {
    const { station, desk } = makeStation({ stories: makeStories(12) });
    await station.fill();

    assert.deepEqual(desk.markCoveredCalls, station.queue.map((b) => b.storyIds));
    assert.equal(desk.covered.size, 6);
  });

  test('resolves images for every picked story before writing', async () => {
    const { station, desk } = makeStation({ stories: makeStories(3) });
    await station.fill();
    assert.deepEqual(desk.resolveCalls.sort(), ['s1', 's2', 's3']);
  });

  test('produces well-formed bulletins with unique ids', async () => {
    const { station } = makeStation({ stories: makeStories(12) });
    await station.fill();

    const [a, b] = station.queue;
    assert.notEqual(a.id, b.id);
    for (const bulletin of station.queue) {
      assert.match(bulletin.id, /^b[0-9a-z]+$/);
      assert.equal(bulletin.provider, 'fake');
      assert.ok(!Number.isNaN(Date.parse(bulletin.createdAt)));
      assert.equal(bulletin.segments[0].type, 'intro');
      assert.equal(bulletin.segments.at(-1).type, 'outro');
      assert.equal(bulletin.rundown.length, 3);
    }
  });

  test('stops when fewer than minNewStories stories are available (once something is queued)', async () => {
    const { station, desk } = makeStation({ stories: makeStories(4) }); // 3 + 1 left over

    await station.fill();

    assert.equal(station.queue.length, 1);
    assert.deepEqual(desk.pickCalls, [3, 3], 'second pick found only 1 story and gave up');
    assert.equal(desk.covered.size, 3);
  });

  test('still generates one bulletin when nothing has aired yet and only 1 story is available', async () => {
    const { station } = makeStation({ stories: makeStories(1) });

    await station.fill();

    assert.equal(station.queue.length, 1);
    assert.deepEqual(station.queue[0].storyIds, ['s1']);
  });

  test('with nothing aired, 2 stories (below minNewStories) are still enough for the first bulletin, but not for a second', async () => {
    const { station } = makeStation({ stories: makeStories(2) });
    await station.fill();
    assert.equal(station.queue.length, 1);
    assert.equal(station.queue[0].storyIds.length, 2);
  });

  test('does nothing when there are no stories at all', async () => {
    const { station, chain } = makeStation();
    await station.fill();
    assert.equal(station.queue.length, 0);
    assert.equal(chain.requests.length, 0);
    assert.equal(station.generating, false);
  });

  test('once something has aired, fewer than minNewStories new stories do not trigger a bulletin', async () => {
    const { station, chain } = makeStation({ stories: makeStories(2) });
    station.history.push(makeBulletin('old'));

    await station.fill();

    assert.equal(station.queue.length, 0);
    assert.equal(chain.requests.length, 0);
  });

  test('once something has aired, exactly minNewStories new stories are enough', async () => {
    const { station } = makeStation({ stories: makeStories(3) });
    station.history.push(makeBulletin('old'));
    await station.fill();
    assert.equal(station.queue.length, 1);
  });

  test('does not generate when the queue is already full', async () => {
    const { station, chain } = makeStation({ stories: makeStories(9) });
    station.queue.push(makeBulletin('q1'), makeBulletin('q2'));
    await station.fill();
    assert.equal(chain.requests.length, 0);
    assert.equal(station.queue.length, 2);
  });

  test('concurrent fill() calls do not generate in parallel', async () => {
    const { station, chain } = makeStation({ stories: makeStories(12) });

    const first = station.fill();
    assert.equal(station.generating, true);
    const second = station.fill(); // returns immediately: a fill is already running
    await Promise.all([first, second]);

    assert.equal(chain.requests.length, CONFIG.queueSize);
    assert.equal(station.queue.length, CONFIG.queueSize);
  });

  test('a failing provider chain sets lastError, leaves stories uncovered and does not loop forever', async () => {
    const { station, desk, chain } = makeStation({ stories: makeStories(6) });
    chain.failWith = 'ningún proveedor disponible (todos en pausa)';

    await station.fill();

    assert.equal(station.queue.length, 0);
    assert.equal(chain.requests.length, 1);
    assert.equal(station.lastError, 'ningún proveedor disponible (todos en pausa)');
    assert.equal(desk.covered.size, 0, 'a failed bulletin must not use up its stories');
    assert.equal(station.generating, false);

    chain.failWith = null;
    await station.fill();
    assert.equal(station.queue.length, 2);
    assert.equal(station.lastError, null, 'a later success clears the error');
  });

  test('a model reply without any valid story counts as a failure', async () => {
    const { station, desk, chain } = makeStation({ stories: makeStories(3) });
    chain.generate = async (_request, validate) => ({ provider: 'fake', value: validate('{"segments":[{"type":"story","storyId":"nope","text":"x"}]}') });

    await station.fill();

    assert.equal(station.queue.length, 0);
    assert.match(station.lastError, /noticias válidas/);
    assert.equal(desk.covered.size, 0);
  });

  test('emits a "status" event for each bulletin added', async () => {
    const { station } = makeStation({ stories: makeStories(12) });
    const statuses = [];
    station.on((event, data) => event === 'status' && statuses.push(data.queue));

    await station.fill();

    assert.deepEqual(statuses, [1, 2]);
  });
});

// ---------------------------------------------------------------- next()

describe('Station.next', () => {
  test('next(undefined) moves the first queued bulletin to history and returns it', async () => {
    const { station } = makeStation({ stories: makeStories(6) });
    await station.fill();
    const [first, second] = station.queue;

    const aired = station.next(undefined);

    assert.equal(aired, first);
    assert.equal(aired.replay, undefined);
    assert.deepEqual(station.history, [first]);
    assert.deepEqual(station.queue, [second]);
  });

  test('refills the queue in the background after taking a bulletin', async () => {
    const { station, chain } = makeStation({ stories: makeStories(12) });
    await station.fill();
    assert.equal(chain.requests.length, 2);

    station.next(undefined);
    await tick();

    assert.equal(station.queue.length, CONFIG.queueSize);
    assert.equal(chain.requests.length, 3);
    assert.equal(station.generating, false);
  });

  test('plays bulletins in order and gives each client the following one when it reports its last id', async () => {
    const { station } = makeStation();
    station.queue.push(makeBulletin('b1'), makeBulletin('b2'), makeBulletin('b3'));

    assert.equal(station.next(undefined).id, 'b1');
    assert.equal(station.next('b1').id, 'b2');
    assert.equal(station.next('b2').id, 'b3');
    assert.deepEqual(station.history.map((b) => b.id), ['b1', 'b2', 'b3']);
    assert.equal(station.queue.length, 0);
  });

  test('a client that is behind gets the following history item and does not consume the queue', () => {
    const { station } = makeStation();
    station.history.push(makeBulletin('h1'), makeBulletin('h2'), makeBulletin('h3'));
    station.queue.push(makeBulletin('q1'));

    const next = station.next('h1');

    assert.equal(next.id, 'h2');
    assert.equal(next.replay, undefined);
    assert.equal(station.queue.length, 1, 'queue untouched');
    assert.equal(station.history.length, 3);
    assert.equal(station.next('h2').id, 'h3');
    assert.equal(station.queue.length, 1);

    // Only a client that is up to date consumes the queue.
    assert.equal(station.next('h3').id, 'q1');
    assert.equal(station.queue.length, 0);
    assert.deepEqual(station.history.map((b) => b.id), ['h1', 'h2', 'h3', 'q1']);
  });

  test('a client joining later is served the next queued bulletin, and a client still on the old one follows the history to it', () => {
    const { station } = makeStation();
    station.queue.push(makeBulletin('b1'), makeBulletin('b2'));

    const clientA = station.next(undefined); // consumes b1
    const clientB = station.next(undefined); // a new client (no id yet) consumes b2
    assert.deepEqual([clientA.id, clientB.id], ['b1', 'b2']);
    assert.equal(station.next('b1').id, 'b2', 'A is behind B: it gets b2 from history, not from the queue');
    assert.deepEqual(station.history.map((b) => b.id), ['b1', 'b2']);
  });

  test('with an empty queue and >= 2 bulletins in history, returns a replay of a different bulletin', () => {
    const { station } = makeStation();
    const h1 = makeBulletin('h1');
    const h2 = makeBulletin('h2');
    station.history.push(h1, h2);

    const replay = station.next('h2');

    assert.equal(replay.replay, true);
    assert.equal(replay.id, 'h1', 'not the one the client just watched');
    assert.equal(h1.replay, undefined, 'history entries are copied, never flagged in place');
    assert.equal(station.history.length, 2);
  });

  test('replay picks the most recent bulletin other than the one just watched', () => {
    const { station } = makeStation();
    station.history.push(makeBulletin('h1'), makeBulletin('h2'), makeBulletin('h3'));
    assert.equal(station.next('h3').id, 'h2');
    assert.equal(station.next('h3').replay, true);
  });

  test('next(undefined) with an empty queue replays the latest bulletin', () => {
    const { station } = makeStation();
    station.history.push(makeBulletin('h1'), makeBulletin('h2'));
    const replay = station.next(undefined);
    assert.equal(replay.id, 'h2');
    assert.equal(replay.replay, true);
  });

  test('with only one bulletin in history the replay can only be that same bulletin', () => {
    const { station } = makeStation();
    station.history.push(makeBulletin('h1'));
    const replay = station.next('h1');
    assert.equal(replay.id, 'h1');
    assert.equal(replay.replay, true);
  });

  test('returns null when there is nothing queued and nothing has aired', () => {
    const { station } = makeStation();
    assert.equal(station.next(undefined), null);
    assert.equal(station.next('whatever'), null);
  });

  test('an id that is not in history (e.g. a client that reconnected after a restart) is served from the queue', () => {
    const { station } = makeStation();
    station.history.push(makeBulletin('h1'));
    station.queue.push(makeBulletin('q1'));
    assert.equal(station.next('gone').id, 'q1');
  });

  test('keeps only the last 20 bulletins in history', () => {
    const { station } = makeStation();
    for (let i = 1; i <= 25; i++) station.queue.push(makeBulletin(`b${i}`));

    for (let i = 0; i < 25; i++) station.next(undefined);

    assert.equal(station.history.length, 20);
    assert.equal(station.history[0].id, 'b6');
    assert.equal(station.history.at(-1).id, 'b25');
  });

  test('bulletins taken by next() have had their stories marked as covered', async () => {
    const { station, desk } = makeStation({ stories: makeStories(6) });
    await station.fill();
    const aired = station.next(undefined);

    assert.ok(aired.storyIds.length > 0);
    assert.ok(desk.markCoveredCalls.some((ids) => ids.join() === aired.storyIds.join()));
    for (const id of aired.storyIds) assert.ok(desk.covered.has(id));
  });

  test('next(null) (what the HTTP layer passes when there is no ?after=) behaves like next(undefined)', () => {
    const { station } = makeStation();
    station.queue.push(makeBulletin('b1'));
    assert.equal(station.next(null).id, 'b1');
    assert.equal(station.next(null).replay, true, 'queue is empty now: replay of the latest');
  });

  test('end-to-end: generate, air, then replay once the news has run out', async () => {
    const { station } = makeStation({ stories: makeStories(3) });

    assert.equal(station.next(undefined), null, 'nothing generated yet');
    await station.fill();

    const first = station.next(undefined);
    await tick(); // let the background fill() triggered by next() finish
    assert.equal(first.storyIds.length, 3);
    assert.equal(station.queue.length, 0, 'no more fresh stories, so nothing new is queued');

    const again = station.next(first.id);
    assert.equal(again.replay, true);
    assert.equal(again.id, first.id);
  });
});

// ---------------------------------------------------------------- ticker / news / status

describe('Station ticker, news refresh and status', () => {
  test('ticker() lists the 18 newest stories as {source, text}, newest first', () => {
    const { station } = makeStation({ stories: makeStories(25) });
    const ticker = station.ticker();
    assert.equal(ticker.length, 18);
    assert.deepEqual(ticker[0], { source: 'Fuente 2', text: 'Noticia número 1 del día' });
    assert.equal(ticker[17].text, 'Noticia número 18 del día');
  });

  test('refreshNews() refreshes the desk and emits the ticker', async () => {
    const { station, desk } = makeStation({ stories: makeStories(3) });
    const events = [];
    station.on((event, data) => events.push([event, data]));

    await station.refreshNews();

    assert.equal(desk.refreshCalls, 1);
    assert.deepEqual(events, [['ticker', station.ticker()]]);
  });

  test('refreshNews() swallows desk errors', async () => {
    const { station, desk } = makeStation();
    desk.refreshError = new Error('feeds caídos');
    await assert.doesNotReject(station.refreshNews());
  });

  test('announces "última hora" stories once, one per refresh, only if recent and uncovered', async () => {
    const stories = [
      makeStory(1, { title: 'ÚLTIMA HORA: primera noticia urgente', published: NOW - 10 * MINUTE }),
      makeStory(2, { title: 'Última hora: segunda noticia urgente', published: NOW - 20 * MINUTE }),
      makeStory(3, { title: 'Última hora: demasiado antigua', published: NOW - 5 * HOUR }),
      makeStory(4, { title: 'Última hora: ya contada', published: NOW - 5 * MINUTE }),
      makeStory(5, { title: 'Noticia normal', published: NOW - MINUTE }),
    ];
    const { station, desk } = makeStation({ stories });
    desk.covered.add('s4');
    const breaking = [];
    station.on((event, data) => event === 'breaking' && breaking.push(data));

    await station.refreshNews();
    await station.refreshNews();
    await station.refreshNews();

    assert.deepEqual(breaking.map((b) => b.text), ['ÚLTIMA HORA: primera noticia urgente', 'Última hora: segunda noticia urgente']);
    assert.equal(breaking[0].source, 'Fuente 2');
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

  test('status() summarises queue, history, news desk and providers', async () => {
    const { station, desk } = makeStation({ stories: makeStories(7) });
    assert.equal(station.status().lastRefresh, null);

    await station.fill();
    station.next(undefined);
    await tick();
    desk.lastRefresh = Date.UTC(2026, 9, 2, 12, 0, 0);

    const status = station.status();
    assert.equal(status.queue, station.queue.length);
    assert.equal(status.aired, 1);
    assert.equal(status.generating, false);
    assert.equal(status.lastError, null);
    assert.equal(status.stories, 7);
    assert.equal(status.uncovered, desk.uncovered().length);
    assert.deepEqual(status.feeds, desk.feedStatus);
    assert.equal(status.lastRefresh, '2026-10-02T12:00:00.000Z');
    assert.deepEqual(status.providers, [{ name: 'fake', configured: true, cooldownUntil: null, failures: 0 }]);
  });
});
