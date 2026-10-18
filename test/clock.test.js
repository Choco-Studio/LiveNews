// The channel's clock (owner decision 1, a schedule by the hour): NEWS IN 60 pinned to :00 and :30 London time, the
// rotation between the marks, MONEY MINUTE left out overnight and at weekends (config/channel.json `clock`,
// server/station.js clockPin / rotationAllows). The station runs on a fake clock here: every item airs for its
// expected length and the clock moves on by as much.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Station, episodeAir, breakAir, localTime } from '../server/station.js';
import { loadChannel, validateChannel } from '../server/channel.js';

const silent = { info() {}, warn() {}, error() {} };
const tick = () => new Promise((resolve) => setImmediate(resolve));

/** Episodes as long as the middle of each programme's targetSeconds (WORLD NOW ~9.5 min, NEWS IN 60 ~1 min). */
function fakeProducer({ can = () => true } = {}) {
  let n = 0;
  return {
    made: [],
    canProduce: (channel, id) => can(id),
    async produce(channel, id) {
      const [lo, hi] = channel.programs[id].targetSeconds || [300, 300];
      this.made.push(id);
      return { kind: 'episode', id: `e${n++}`, program: { id, title: channel.programs[id].title }, segments: [{ audio: { duration: (lo + hi) / 2 - 12 } }] };
    },
  };
}

/** Run the channel from `start` for `hours` on a fake clock: what aired and when (ms). */
async function runDay(start, hours, { channel = loadChannel(), producer = fakeProducer(), clock = true } = {}) {
  let t = start;
  const station = new Station({
    config: { queueSize: 2, clock, now: () => t },
    newsDesk: { stories: new Map(), uncovered: () => [], feedStatus: {}, lastRefresh: 0 },
    producer,
    chain: { status: () => [] },
    channel: () => channel,
    log: silent,
  });
  await station.fill();
  const aired = [];
  while (t < start + hours * 3600_000) {
    const item = station.next();
    assert.ok(item, 'the channel never goes dark');
    aired.push({ at: t, kind: item.kind, id: item.program?.id, replay: !!item.replay, hold: item.hold || 0, mark: item.at || 0 });
    t += (item.kind === 'episode' ? episodeAir(item) : breakAir(item)) * 1000;
    for (let i = 0; i < 10; i++) await tick(); // the fill() next() starts
  }
  return { aired, station, producer };
}

const LONDON = 'Europe/London';
// Monday 12 Oct 2026 and Saturday 10 Oct 2026, London summer time (UTC+1)
const MONDAY_5AM = Date.parse('2026-10-12T05:00:00+01:00');
const SATURDAY_9AM = Date.parse('2026-10-10T09:00:00+01:00');

/** Seconds from the nearest :00 or :30 mark (negative: before it). */
function offMark(t) {
  const { minute, second } = localTime(t, LONDON);
  const s = (minute % 30) * 60 + second;
  return s > 900 ? s - 1800 : s;
}

describe('the clock', () => {
  test('London time: hour, minute and weekday', () => {
    assert.deepEqual(localTime(Date.parse('2026-10-12T05:07:09Z'), LONDON), { hour: 6, minute: 7, second: 9, day: 1 });
    assert.deepEqual(localTime(Date.parse('2026-12-12T23:30:00Z'), LONDON), { hour: 23, minute: 30, second: 0, day: 6 });
    assert.equal(localTime(0, 'Not/AZone').hour, 0, 'a bad zone falls back to UTC');
  });

  test('a weekday: NEWS IN 60 at every :00 and :30, the rotation in between', async () => {
    const { aired } = await runDay(MONDAY_5AM, 24);
    const episodes = aired.filter((a) => a.kind === 'episode' && !a.replay);
    const news = episodes.filter((a) => a.id === 'news-60');
    // every mark from 05:30 to 04:30 the next morning: 47 marks, each exactly once
    const marks = new Map();
    for (const a of news) {
      const off = offMark(a.at);
      assert.ok(off >= -300 && off <= 660, `NEWS IN 60 lands near its mark (${off} s at ${new Date(a.at).toISOString()})`);
      const key = Math.round((a.at - off * 1000) / 60_000);
      assert.ok(!marks.has(key), 'one NEWS IN 60 per mark');
      marks.set(key, off);
    }
    assert.ok(marks.size >= 46, `NEWS IN 60 at (almost) every mark of the day (${marks.size})`);
    const offs = [...marks.values()];
    const close = offs.filter((x) => Math.abs(x) <= 120).length;
    assert.ok(close >= 0.8 * offs.length, `at least 80 % within two minutes of the mark (${close} of ${offs.length})`);
    // (right on it: the countdown clock held the break. Half of them were before 18 Oct; the channel's ident now airs
    // before every programme, 6 s more each, and the planner's runs land a few of them seconds off: 21 of 48 here)
    assert.ok(offs.filter((x) => x === 0).length >= 0.4 * offs.length, `many of them right on it (${offs.filter((x) => x === 0).length} of ${offs.length})`);
    // the countdown: only before NEWS IN 60, at most clock.hold, and it names the mark
    const holds = aired.filter((a) => a.hold);
    assert.ok(holds.length >= 10, `the countdown clock holds breaks (${holds.length})`);
    for (const h of holds) {
      const next = aired[aired.indexOf(h) + 1];
      if (!next) continue; // the day's run ended on the countdown, before its mark
      assert.equal(next.id, 'news-60', 'the countdown leads into NEWS IN 60');
      assert.ok(h.hold <= 90 && offMark(h.mark) === 0, 'at most 90 s, up to a :00 or :30');
    }
    // the rest of the rotation still plays, in its own order
    for (const id of ['world-now', 'tech-bytes', 'cosmos', 'world-weather', 'money-minute']) assert.ok(episodes.some((a) => a.id === id), `${id} airs`);
    for (const a of episodes.filter((x) => x.id === 'money-minute')) {
      const { hour } = localTime(a.at, LONDON);
      assert.ok(hour >= 6 && hour < 22, `MONEY MINUTE only 06-22 on weekdays (one at ${hour}h)`);
    }
    assert.ok(!aired.some((a) => a.replay), 'never a replay: there is always something to make');
  });

  test('a weekend: no MONEY MINUTE at all', async () => {
    const { aired } = await runDay(SATURDAY_9AM, 10);
    const ids = aired.filter((a) => a.kind === 'episode').map((a) => a.id);
    assert.ok(!ids.includes('money-minute'), 'MONEY MINUTE stays off on Saturday');
    assert.ok(ids.includes('world-now') && ids.includes('news-60'));
  });

  test('short of news for the round-up: the rotation carries on, nothing stalls', async () => {
    const producer = fakeProducer({ can: (id) => id !== 'news-60' });
    const { aired } = await runDay(MONDAY_5AM, 3, { producer });
    const ids = aired.filter((a) => a.kind === 'episode').map((a) => a.id);
    assert.ok(!ids.includes('news-60'));
    assert.ok(ids.length >= 6, `the rotation fills the hours (${ids.length} episodes)`);
    assert.ok(!aired.some((a) => a.replay));
  });

  test('clock off (STATION_CLOCK=0, every test station): the bare rotation, NEWS IN 60 in its slots', async () => {
    const { producer } = await runDay(MONDAY_5AM, 2, { clock: false });
    const rotation = loadChannel().rotation;
    assert.deepEqual(producer.made.slice(0, rotation.length), rotation);
  });

  test('UP NEXT and the schedule promise what the clock will make', async () => {
    const channel = loadChannel();
    let t = Date.parse('2026-10-12T09:57:30+01:00'); // the next airing (after one break) reaches 10:00
    const station = new Station({
      config: { queueSize: 2, clock: true, now: () => t },
      newsDesk: { stories: new Map(), uncovered: () => [], feedStatus: {}, lastRefresh: 0 },
      producer: fakeProducer(),
      chain: { status: () => [] },
      channel: () => channel,
      log: silent,
    });
    assert.equal(station.upNext(channel).id, 'news-60');
    assert.equal(station.schedule().upcoming[0].id, 'news-60');
    assert.ok(!station.schedule().upcoming.slice(1).some((p) => p.id === 'news-60'), 'the rotation never promises the pinned round-up');
    // (10:11, past the 10:00 mark's ten late minutes: WORLD NOW then TECH BYTES, each with the channel's ident before it,
    // bring NEWS IN 60 in close to 10:30. At 10:12 they would run 109 s past the countdown's window, and TECH BYTES then
    // COSMOS land closer for one swap: the planner's own choice since the ident's 6 s)
    t = Date.parse('2026-10-12T10:11:00+01:00');
    assert.equal(station.upNext(channel).id, 'world-now', 'between marks: the rotation');
    t = Date.parse('2026-10-12T23:10:00+01:00');
    station.rotationIndex = channel.rotation.indexOf('money-minute');
    assert.notEqual(station.upNext(channel).id, 'money-minute', 'overnight: MONEY MINUTE is skipped');
  });

  test('channel.json: a bad clock is refused with a clear reason', () => {
    const base = loadChannel();
    const bad = (clock, re) => assert.throws(() => validateChannel({ ...base, clock }), re);
    bad([], /"clock" is not an object/);
    bad({ timezone: 'Mars/Olympus' }, /time zone/);
    bad({ pins: [{ minute: 60, program: 'news-60' }] }, /clock\.pins/);
    bad({ pins: [{ minute: 0, program: 'nope' }] }, /clock\.pins/);
    bad({ hold: 900 }, /clock\.hold/);
    bad({ late: -1 }, /clock\.late/);
    bad({ dayparts: [{ from: 22, to: 6, skip: ['nope'] }] }, /clock\.dayparts/);
    bad({ dayparts: [{ from: 0, to: 24, days: [7], skip: [] }] }, /clock\.dayparts/);
    assert.throws(() => validateChannel({ ...base, rotation: ['news-60'], clock: base.clock }), /pins every programme/);
    assert.doesNotThrow(() => validateChannel(base));
  });
});
