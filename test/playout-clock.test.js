// Pre-rendered playout's air clock (server/playout/clock.js; docs/publishing/playout.md §2): the station lives at the
// time its programmes AIR, so what they say and show by the clock reads right for then, not for when they were made.
// The clock follows the renderer's word and runs on at real speed for at most its cap; installed, the process's Date
// reads it; the writers' greetings, the station's clock marks and the page's on-screen clock follow it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAirClock, installAirClock, RealDate } from '../server/playout/clock.js';
import { createMockProvider } from '../server/providers/mock.js';
import { loadChannel } from '../server/channel.js';
import { Station, localTime } from '../server/station.js';
import { zoneTime } from '../public/js/util.js';

const CH = loadChannel();
const WN = { id: 'world-now', ...CH.programs['world-now'] };
const DUO = { A: { id: 'paco', ...CH.presenters.paco }, B: { id: 'lola', ...CH.presenters.lola } };
const story = (id, title, summary) => ({ id, title, summary, source: 'Pixelburg Post', category: 'world', image: null, published: Date.now() - 3600_000, weight: 1 });
const STORIES = [
  story('a1', 'Norway raises interest rates', 'Norway’s central bank has raised its main interest rate to 4.75 percent.'),
  story('a2', 'Carmaker to close Turin plant', 'A carmaker says it will close its plant near Turin by the end of next year.'),
  story('a3', 'Lisbon opens a new tram line', 'Lisbon has opened a new tram line along the Tagus river with 40,000 riders a day.'),
  story('a4', 'Ferry fire off Crete', 'A fire on a ferry off Crete has injured passengers, the coastguard says.'),
];

test('the air clock: the renderer sets it, it runs on at real speed up to its cap, and never further', () => {
  let real = 1_000_000;
  const c = createAirClock({ realNow: () => real, cap: 60_000 });
  const air = Date.parse('2026-10-17T19:00:00Z');
  c.set(air);
  assert.equal(c.now(), air);
  real += 20_000;
  assert.equal(c.now(), air + 20_000, 'runs on with real time');
  real += 600_000;
  assert.equal(c.now(), air + 60_000, 'but no more than its cap past the last word');
  c.set(air + 33);
  assert.equal(c.now(), air + 33, 'a new word moves it, forward or back');
  assert.equal(c.lead(), air + 33 - real);
  assert.equal(c.set('nonsense'), false);
  assert.equal(c.now(), air + 33);
});

test('installed, the process reads the air clock (Date.now, new Date, Date()); uninstalled, the real one', () => {
  const c = createAirClock({ realNow: () => 0, cap: 0 });
  c.set(Date.parse('2026-12-24T23:59:00Z'));
  const un = installAirClock(c);
  try {
    assert.equal(Date.now(), Date.parse('2026-12-24T23:59:00Z'));
    assert.equal(new Date().toISOString(), '2026-12-24T23:59:00.000Z');
    assert.equal(new Date(0).toISOString(), '1970-01-01T00:00:00.000Z', 'an explicit time is kept');
    assert.ok(new Date() instanceof RealDate);
    assert.match(Date(), /Dec 24 2026/);
    assert.equal(Date.parse('2026-01-01T00:00:00Z'), 1767225600000);
    assert.equal(globalThis.__airClock, c);
  } finally {
    un();
  }
  assert.ok(Math.abs(Date.now() - RealDate.now()) < 1000);
  assert.equal(globalThis.__airClock, undefined);
});

test('the writer greets for the time the programme airs (good evening at 20:10, good morning at 08:40 London)', async () => {
  const c = createAirClock({ realNow: () => 0, cap: 0 });
  const un = installAirClock(c);
  const greet = async (iso) => {
    c.set(Date.parse(iso));
    const r = await createMockProvider().generate({ stories: STORIES, channelName: 'GLOBIT 24', program: WN, presenters: DUO, count: 4 });
    return JSON.parse(r.text).segments.map((s) => s.text).join(' ').match(/Good (?:morning|afternoon|evening)|Hello/)?.[0];
  };
  try {
    assert.equal(await greet('2026-10-17T19:10:00Z'), 'Good evening'); // 20:10 BST
    assert.equal(await greet('2026-10-18T07:40:00Z'), 'Good morning'); // 08:40 BST
    assert.equal(await greet('2026-10-18T13:10:00Z'), 'Good afternoon'); // 14:10 BST
    assert.equal(await greet('2026-10-18T16:45:00Z'), 'Hello', 'within half an hour of a boundary (18:00) it says hello');
  } finally {
    un();
  }
});

test('the station places NEWS IN 60 by the air clock: made at 19:10 real time for 20:28 on air, it is due at 20:30', () => {
  const channel = CH;
  const c = createAirClock({ realNow: () => 0, cap: 0 });
  c.set(Date.parse('2026-10-17T19:28:00Z')); // 20:28 London, on air
  const un = installAirClock(c);
  try {
    const st = new Station({ config: { clock: true, queueSize: 2, playout: true }, newsDesk: { stories: new Map(), uncovered: () => [] }, producer: { canProduce: () => true }, chain: { status: () => [] }, channel: () => channel, log: { warn() {} } });
    const ahead = st.markAhead(channel);
    assert.equal(ahead.programId, 'news-60');
    assert.equal(new RealDate(ahead.mark).toISOString(), '2026-10-17T19:30:00.000Z');
    assert.equal(st.nextToMake(channel), 'news-60', 'the next airing is within the countdown hold of the :30 mark');
    assert.deepEqual(localTime(st.now(), 'Europe/London').hour, 20);
    assert.equal(st.publicChannel().airMode, 'recorded', 'and the page is told the programmes air from files');
  } finally {
    un();
  }
});

test('the page reads its on-screen clock from Date: the recorder fake clock set to the air time shows the air time', () => {
  // (tools/playout/render.mjs sets the page's wall clock to the item's air time; zoneTime is what the clock draws)
  const at = Date.parse('2026-10-17T19:30:00Z');
  assert.equal(zoneTime('Europe/London', at).label, '20:30');
  assert.equal(zoneTime('Europe/London', at + 59_000).label, '20:30');
  assert.equal(zoneTime('Europe/London', at + 60_000).label, '20:31');
});
