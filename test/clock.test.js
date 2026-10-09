import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadSchedule, slotsFrom, localHour } from '../server/clock.js';
import { Station } from '../server/station.js';

const file = (obj) => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'clock-')), 'schedule.json');
  fs.writeFileSync(f, JSON.stringify(obj));
  return f;
};
const SCHEDULE = {
  clock: true,
  timezone: 'Europe/London',
  hour: [
    { at: '00:00', program: 'news-60', fixed: true },
    { at: '01:30', program: 'world-now' },
    { at: '30:00', program: 'news-60', fixed: true },
    { at: '31:30', rotate: ['tech-bytes', 'cosmos', 'world-weather'] },
    { at: '47:30', program: 'money-minute', days: [1, 2, 3, 4, 5], hours: [6, 22] },
  ],
};
// Wednesday 7 Oct 2026, 10:00 UTC = 11:00 in London (BST)
const T = Date.parse('2026-10-07T10:00:00Z');
const min = (m) => m * 60_000;

test('the real config/schedule.json loads; "clock": false or a broken file means the rotation', () => {
  const real = loadSchedule();
  assert.ok(real && real.hour.length >= 4);
  assert.equal(loadSchedule(file({ ...SCHEDULE, clock: false })), null);
  assert.equal(loadSchedule(path.join(os.tmpdir(), 'no-such-schedule.json')), null);
});

test('slots: the minutes of the hour, the rotating slot hour by hour, weekdays and hours honoured, in London time', () => {
  const s = loadSchedule(file(SCHEDULE));
  assert.equal(localHour(T, 'Europe/London').hour, 11);
  const slots = slotsFrom(s, T, 5);
  // the rotating slot at 11:00 London takes the programme at index 11 % 3 of its list
  assert.deepEqual(slots.map((x) => [new Date(x.at).toISOString().slice(11, 16), x.program, !!x.fixed]), [
    ['10:00', 'news-60', true],
    ['10:01', 'world-now', false],
    ['10:30', 'news-60', true],
    ['10:31', 'world-weather', false],
    ['10:47', 'money-minute', false],
  ]);
  // the next hour gives the rotating slot to the next programme
  assert.notEqual(slotsFrom(s, T + min(60), 4)[3].program, slots[3].program);
  // MONEY MINUTE: weekdays, 06-22 London only (a Sunday has none; 23:00 London has none)
  const sunday = Date.parse('2026-10-11T10:00:00Z');
  assert.ok(!slotsFrom(s, sunday, 5).some((x) => x.program === 'money-minute'));
  const late = Date.parse('2026-10-07T22:00:00Z'); // 23:00 London
  assert.ok(!slotsFrom(s, late, 5).some((x) => x.program === 'money-minute'));
});

// a station whose producer makes every programme instantly as a one-story episode of known length
function station(schedule) {
  const made = [];
  const producer = {
    canProduce: () => true,
    async produce(channel, programId) {
      made.push(programId);
      return { kind: 'episode', id: `e${made.length}`, program: { id: programId, title: programId }, segments: [{ type: 'story', text: 'word '.repeat(270) }], storyIds: [], rundown: [] };
    },
  };
  const channel = { name: 'G', rotation: ['world-now'], programs: Object.fromEntries(['news-60', 'world-now', 'tech-bytes', 'cosmos', 'world-weather', 'money-minute'].map((id) => [id, { title: id }])), breaks: { adsPerBreak: 2, maxExtraAds: 6 } };
  const st = new Station({ config: { queueSize: 2 }, newsDesk: { stories: new Map(), uncovered: () => [] }, producer, chain: { status: () => ({}) }, channel: () => channel, schedule, log: { warn() {}, info() {} } });
  return { st, made };
}

test('the station makes the programmes of the clock, in order, each with its slot', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: T - min(3) });
  const { st, made } = station(loadSchedule(file(SCHEDULE)));
  await st.fill();
  assert.deepEqual(made, ['news-60', 'world-now']);
  assert.equal(st.queue[0].slot.at, '2026-10-07T10:00:00.000Z');
  assert.equal(st.queue[0].slot.fixed, true);
});

test('a fixed slot is landed within the tolerance: early, short breaks; then it airs', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: T - min(5) });
  const { st } = station(loadSchedule(file({ ...SCHEDULE, tolerance: 90 })));
  await st.fill();
  // 5 minutes before :00, NEWS IN 60 is ready: the channel holds it with short breaks until 90 s before
  const first = st.next();
  assert.equal(first.kind, 'break');
  assert.equal(first.early, true);
  assert.equal(first.ads, 1);
  t.mock.timers.setTime(T - min(1));
  const second = st.next(first.id);
  assert.equal(second.kind, 'episode');
  assert.equal(second.program.id, 'news-60');
});

test('running late, a slot the channel cannot reach is skipped (never made and then aired late)', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: T + min(10) }); // 10:10: the :00 and :01:30 slots are gone
  const { st, made } = station(loadSchedule(file(SCHEDULE)));
  await st.fill();
  assert.deepEqual(made, ['news-60', made[1]]);
  assert.equal(st.queue[0].slot.at, '2026-10-07T10:30:00.000Z', 'the next reachable slot is the :30 NEWS IN 60');
});
