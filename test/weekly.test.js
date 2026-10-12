// SEVEN DAYS (owner 12 Oct: "Resumen semanal: sí, pero cúrratelo"): the archive of what aired (server/archive.js) and
// the weekly written from it (server/weeklywriter.js): only the channel's own aired words, the day they aired.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Archive } from '../server/archive.js';
import { writeWeekly, relabelTime, cleanAired, weekdayOf } from '../server/weeklywriter.js';
import { Producer } from '../server/producer.js';
import { loadChannel } from '../server/channel.js';

const DAY = 86400_000;
const MON = Date.parse('2026-10-05T09:00:00Z'); // a Monday

test('the aired words a few days later: today is the day they aired; furniture is never retold', () => {
  assert.equal(relabelTime('Prices rose today. Today\'s rise was sharp.', 'Tuesday'), 'Prices rose on Tuesday. Tuesday\'s rise was sharp.');
  assert.equal(relabelTime('Talks resume tomorrow after a pause yesterday.', 'Friday'), 'Talks resume the next day after a pause the day before.');
  assert.equal(relabelTime('Today the canal reopened.', 'Monday'), 'On Monday the canal reopened.');
  assert.equal(relabelTime('Crews worked this morning and will work tonight.', 'Sunday'), 'Crews worked on Sunday morning and will work on Sunday night.');
  assert.equal(cleanAired('Our number of the day: 7,000. Storms uncovered footprints in Wales.'), 'Storms uncovered footprints in Wales.');
  assert.equal(cleanAired('And finally: rangers filmed a snow leopard. Thanks, Paco.'), 'Rangers filmed a snow leopard.');
  assert.equal(cleanAired('Hospitals are full. Let\'s bring in our Health Correspondent, Dr Amara Pulse. Amara, what happens now?'), 'Hospitals are full.');
  assert.equal(cleanAired('Rates rose. Lola.'), 'Rates rose.');
  assert.equal(cleanAired('Breaking news. The canal has reopened.'), 'The canal has reopened.', 'a week later it is not breaking');
  assert.equal(cleanAired('Breaking news: the canal has reopened.'), 'The canal has reopened.');
  assert.equal(weekdayOf(MON, 'Europe/London'), 'Monday');
});

test('the archive: one entry per aired story with its words, boards, quote and expert; kept on disk; pruned', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-'));
  let now = MON;
  const a = new Archive({ dir, now: () => now, log: { warn() {} } });
  const ep = {
    program: { id: 'world-now' }, storyIds: ['s1', 's2'],
    segments: [
      { type: 'intro', text: 'Hello.' },
      { type: 'story', storyId: 's1', headline: 'Canal reopens', source: 'Ledger Line', category: 'world', text: 'The canal reopened today.', numbers: [{ value: '30', label: 'SHIPS' }], quote: { text: 'We are open again for business', by: 'the canal authority' }, emotion: 'neutral', link: 'R1', linkKind: 'expert' },
      { type: 'cross', kind: 'expert', part: 'piece', storyId: 's1', reporter: 'omar', text: 'The key detail is this: thirty ships wait.', backdrop: 'markets', desk: 'ECONOMICS EDITOR' },
      { type: 'story', storyId: 's2', headline: 'Quake hits coast', source: 'Pixel Post', category: 'world', text: 'A quake hit the coast.', emotion: 'sad' },
      { type: 'story', storyId: 's1', headline: 'Canal reopens', text: 'More on the canal.' },
    ],
  };
  const stories = { s1: { title: 'Panama Canal reopens', summary: 'The canal reopened.', image: 'http://x/1.jpg', kw: ['canal'] }, s2: { title: 'Quake', summary: 'A quake.' } };
  assert.equal(a.record(ep, { get: (id) => stories[id] }), 2, 'one entry per story, the first telling');
  const [e1, e2] = a.entries;
  assert.equal(e1.text, 'The canal reopened today.');
  assert.deepEqual(e1.analysis, { expert: 'omar', text: 'The key detail is this: thirty ships wait.', backdrop: 'markets', desk: 'ECONOMICS EDITOR' });
  assert.equal(e1.image, 'http://x/1.jpg');
  assert.equal(e2.grave, true);
  assert.equal(a.story('s1').title, 'Panama Canal reopens');
  assert.equal(a.record({ weather: {}, segments: ep.segments }), 0, 'the weather is not news');
  assert.equal(a.record({ ...ep, program: { id: 'seven-days', kind: 'weekly' } }), 0, 'nor the weekly itself');
  // a restart reads the days back; past the 14 days they go
  const b = new Archive({ dir, now: () => now });
  assert.equal(b.entries.length, 2);
  now = MON + 20 * DAY;
  const c = new Archive({ dir, now: () => now });
  assert.equal(c.entries.length, 0);
  assert.equal(fs.readdirSync(dir).length, 0);
});

// a synthetic week: stories told on several days, one with a moving headline, figures, a quote and a lighter one
function weekArchive() {
  let now = MON;
  const a = new Archive({ now: () => now });
  const story = (id, day, hour, over) => ({ type: 'story', storyId: id, source: 'Ledger Line', category: 'world', emotion: 'neutral', ...over });
  const air = (day, hour, segs) => {
    now = MON + day * DAY + hour * 3600_000;
    a.record({ program: { id: 'world-now' }, storyIds: segs.map((s) => s.storyId), segments: segs }, { get: () => null });
  };
  const canal = (h, t) => story('canal', 0, 0, { headline: h, text: t });
  air(0, 0, [canal('Canal closes in thick fog', 'Thick fog closed the Panama Canal today. About 30 ships are waiting to cross, the authority says.'), story('rates', 0, 0, { category: 'business', headline: 'Norway raises rates', text: 'Norway’s central bank raised its main rate to 4.75 percent today. Most economists did not expect the move.', numbers: [{ value: '4.75%', label: 'MAIN RATE' }] })]);
  air(1, 3, [canal('Canal still shut on day two', 'The Panama Canal stayed shut for a second day. More than 50 ships are now waiting, the authority says.'), story('chips', 1, 0, { category: 'tech', headline: 'New laptop chip', text: 'A chipmaker unveiled a laptop processor it says runs for 20 hours on one charge. Reviewers have not tested the claim yet.', numbers: [{ value: '20', label: 'HOURS' }] })]);
  air(2, 3, [canal('Canal reopens after fog lifts', 'The Panama Canal reopened today after the fog lifted. Shipping companies say the delays should clear within days.'), story('bees', 2, 0, { category: 'science', headline: 'Bees see through clouds', text: 'A new study shows honeybees can find the sun through clouds using polarised light. The finding explains how they navigate in poor weather.' })]);
  air(3, 3, [story('strike', 3, 0, { category: 'business', headline: 'Rail strike in Germany', text: 'A 24-hour strike by rail workers halted most long-distance trains in Germany today. Unions say talks over pay have stalled.' }), story('leopard', 3, 0, { headline: 'Snow leopard with cubs', text: 'Rangers in Nepal filmed a rare snow leopard with two cubs. “It is a very hopeful sign for the species,” a park official said.', quote: { text: 'It is a very hopeful sign for the species', by: 'a park official' } })]);
  air(4, 3, [story('tunnel', 4, 0, { headline: 'Fjord tunnel opens', text: 'A 27 kilometre road tunnel under a fjord opened in Norway today. It cuts a ferry crossing from the journey.', numbers: [{ value: '27 km', label: 'TUNNEL' }] }), story('eclipse', 4, 0, { category: 'science', headline: 'Eclipse over Spain', text: 'A total solar eclipse will cross northern Spain next August, astronomers say. Hotels on the path are already booked.' })]);
  air(5, 3, [story('wildfire', 5, 0, { headline: 'Wildfire near Marseille', text: 'A wildfire north of Marseille forced about 3,000 people from three villages, officials say. Crews worked through the night.', numbers: [{ value: '3,000', label: 'PEOPLE MOVED' }] }), story('planet', 5, 0, { category: 'science', headline: 'Water on a distant planet', feature: 'lighter', text: 'And finally: astronomers found water vapour in the air of a planet 120 light years away. It is about twice the size of Earth.' })]);
  air(6, 3, [story('oil', 6, 0, { category: 'business', headline: 'Oil falls again', text: 'Oil prices fell for a third day as traders expect weaker demand this winter. Brent crude ended lower.' })]);
  now = MON + 6 * DAY + 10 * 3600_000;
  return a;
}

test('SEVEN DAYS: the story of the week and how it unfolded, the week in a minute, the desks, numbers, words, And finally', () => {
  const a = weekArchive();
  const week = a.week();
  assert.equal(week[0].key, 'canal', 'the most told story first');
  const ep = writeWeekly(week, { seed: 'x', now: MON + 6 * DAY, timeZone: 'UTC' });
  const kinds = ep.segments.map((s) => s.kicker || s.feature || s.type);
  assert.equal(kinds[0], 'intro');
  assert.equal(kinds[1], 'STORY OF THE WEEK');
  assert.equal(kinds.at(-1), 'outro');
  assert.equal(kinds.at(-2), 'lighter');
  assert.ok(kinds.includes('WORDS OF THE WEEK'));
  assert.ok(kinds.includes('THE WEEK IN NUMBERS'));
  // the intro teases three stories (the montage), then greets
  const intro = ep.segments[0];
  assert.deepEqual(intro.teases.length, 4);
  assert.match(intro.text, /SEVEN DAYS/);
  // how the week unfolded: one point a day the headline moved on
  const sotw = ep.segments[1];
  assert.deepEqual(sotw.timeline.map((x) => x.when), ['MON', 'TUE', 'WED']);
  assert.ok(sotw.timeline.every((x) => x.what.length <= 40));
  // our coverage, a fact of the archive
  assert.match(ep.segments[2].text, /three days/);
  // the week in a minute: the days in order, each its day's story
  const days = ep.segments.filter((s) => s.roundup).map((s) => s.kicker);
  const order = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
  assert.deepEqual(days, [...days].sort((x, y) => order.indexOf(x) - order.indexOf(y)));
  // never "today" or "tomorrow" in a weekly: the day it aired
  for (const s of ep.segments) assert.doesNotMatch(s.text, /\btoday\b|\btomorrow\b|number of the day|Thanks,/i, s.text);
  assert.match(ep.segments.map((s) => s.text).join(' '), /on Monday|on Wednesday|on Thursday|on Friday|on Sunday/);
  // the words of the week carry the quote the guests stage may re-stage
  const words = ep.segments.find((s) => s.kicker === 'WORDS OF THE WEEK');
  assert.equal(words.quote.by, 'a park official');
  // the numbers: every figure on the board is said
  const nums = ep.segments.find((s) => s.kicker === 'THE WEEK IN NUMBERS');
  for (const n of nums.numbers) assert.ok(nums.text.replace(/,/g, '').includes(String(n.value).replace(/[^\d.]/g, '')), n.value);
  // nothing said twice
  const sentences = ep.segments.flatMap((s) => s.text.split(/(?<=[.!?])\s+/));
  const counts = new Map();
  for (const t of sentences) counts.set(t, (counts.get(t) || 0) + 1);
  for (const [t, n] of counts) assert.ok(n === 1 || t.length < 20, `said twice: ${t}`);
  // the running order lists every story once
  assert.deepEqual(ep.rundown.map((r) => r.storyId), ep.storyIds);
  assert.equal(new Set(ep.storyIds).size, ep.storyIds.length);
});

test('a thin week is no programme; the producer airs it only with the week in hand, every 3 hours at most', async () => {
  assert.equal(writeWeekly([]), null);
  const a = weekArchive();
  // the programme as config/channel.json will carry it (kind 'weekly'; weekends only through the clock's dayparts)
  const ch = loadChannel();
  ch.programs['seven-days'] = { kind: 'weekly', title: 'SEVEN DAYS', tagline: 'THE WEEK ON GLOBIT 24', theme: 'world', presenters: ['paco', 'lola'], categories: ['world'], stories: 16, minGapHours: 3, style: 'The week retold.' };
  const p = new Producer({ config: {}, newsDesk: { get: (id) => a.story(id), resolveImage: async () => {} }, chain: null, archive: a, log: { info() {}, warn() {}, error() {} } });
  assert.equal(p.canProduce(ch, 'seven-days'), true);
  const ep = await p.produce(ch, 'seven-days');
  assert.equal(ep.program.id, 'seven-days');
  assert.equal(ep.provider, 'weekly');
  assert.ok(ep.weekly.stories >= 6);
  assert.equal(p.canProduce(ch, 'seven-days'), false, 'not again within 3 hours');
  const empty = new Producer({ config: {}, newsDesk: { get: () => null }, chain: null, archive: new Archive(), log: { info() {} } });
  assert.equal(empty.canProduce(ch, 'seven-days'), false);
});
