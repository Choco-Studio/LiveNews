// SEVEN DAYS's week grouping (round 10 of the pictures desk): the same groups, in the same order, as the grouping it
// replaced (kept here, verbatim), from far fewer calls of sameStory; in slices that hand the event loop back; and in a
// thread of its own (server/weekgrouper.js). tools/pictures/weekdiff.mjs makes the same comparison on a real archive.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { groupWeek, groupWeekAsync, scoreGroups, groupSteps } from '../server/weekgroups.js';
import { Archive } from '../server/archive.js';
import { NewsDesk } from '../server/news.js';
import { WeekGrouper } from '../server/weekgrouper.js';

/** The grouping before round 10, verbatim. */
function oldGroups(entries, { since, now, same }) {
  const groups = [];
  for (const e of entries) {
    if (e.at < since || e.at > now) continue;
    let g = groups.find((x) => x.ids.has(e.id));
    if (!g && same) g = groups.find((x) => x.entries.some((o) => o.category === e.category && same(o, e)));
    if (!g) groups.push((g = { ids: new Set(), entries: [] }));
    g.ids.add(e.id);
    g.entries.push(e);
  }
  return scoreGroups(groups);
}
const fp = (week) => JSON.stringify(week.map((g) => [g.ids, g.entries.map((e) => `${e.id}@${e.at}`), g.score, g.days]));
const clone = (list) => list.map((e) => ({ ...e }));

// A seeded random source and a week of airings: stories told several times (the same words), in five sections.
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const WORDS = 'storm flood quake rates strike election court fire bridge tram reef rocket vote budget port mine oil gas'.split(' ');
function week(seed, n = 160) {
  const r = rng(seed);
  const NOW = 1_800_000_000_000;
  const stories = Array.from({ length: Math.round(n / 3) }, (_, i) => {
    const w = [WORDS[Math.floor(r() * WORDS.length)], WORDS[Math.floor(r() * WORDS.length)], WORDS[Math.floor(r() * WORDS.length)]];
    return { id: `s${i}`, category: ['world', 'tech', 'science', 'business', 'sport'][Math.floor(r() * 5)], source: ['A', 'B', 'C'][Math.floor(r() * 3)], title: `${w.join(' ')} story ${i % 7}`, summary: `${w[0]} and ${w[2]} today` };
  });
  const out = [];
  for (let k = 0; k < n; k++) {
    const s = stories[Math.floor(r() * stories.length)];
    out.push({ ...s, at: NOW - (n - k) * 3_600_000, programId: ['world-now', 'tech-bytes', 'news-60'][k % 3], rank: k % 5, text: 'x'.repeat(Math.floor(r() * 80)), ...(r() < 0.1 ? { breaking: true } : {}) });
  }
  return { entries: out, since: NOW - 8 * 86400_000, now: NOW };
}
// A sameStory-like test: like the real one it keeps what it read on the airing it reads (its keywords), and a rule that
// needs keywords answers no until both were read once; then two shared words make one event
function quirky() {
  const calls = { n: 0 };
  const words = (s) => new Set(String(s.title).split(' ').slice(0, 3));
  const same = (a, b) => {
    calls.n++;
    if (a.kw && b.kw && a.source === b.source && [...a.kw].some((w) => b.kw.has(w) && w === String(b.summary).split(' ')[0])) return true;
    a.kw ??= words(a);
    b.kw ??= words(b);
    let shared = 0;
    for (const w of a.kw) if (b.kw.has(w)) shared++;
    return shared >= 2;
  };
  return { same, calls };
}

describe("SEVEN DAYS's week grouping", () => {
  test('the same groups in the same order as the old grouping, on 40 random weeks, from fewer calls', () => {
    let saved = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const w = week(seed);
      const a = quirky();
      const b = quirky();
      const old = oldGroups(clone(w.entries), { since: w.since, now: w.now, same: a.same });
      const now = groupWeek(clone(w.entries), { since: w.since, now: w.now, same: b.same });
      assert.equal(fp(now), fp(old), `seed ${seed}`);
      assert.ok(b.calls.n <= a.calls.n, `seed ${seed}: ${b.calls.n} calls against ${a.calls.n}`);
      saved += a.calls.n - b.calls.n;
    }
    assert.ok(saved > 0);
  });

  test('the next edition, with the answers kept: the same groups, a fraction of the calls; in slices too', async () => {
    for (const seed of [3, 7, 11]) {
      const w = week(seed, 240);
      const ref = quirky();
      const old = oldGroups(clone(w.entries), { since: w.since, now: w.now, same: ref.same });
      const memo = {};
      const q = quirky();
      const list = clone(w.entries); // (one archive: its airings the same objects edition after edition)
      const first = groupWeek(list, { since: w.since, now: w.now, same: q.same, memo });
      const firstCalls = q.calls.n;
      const second = await groupWeekAsync(list, { since: w.since, now: w.now, same: q.same, memo, sliceMs: 0 });
      assert.equal(fp(first), fp(old));
      assert.equal(fp(second), fp(old), 'the next edition groups as the first after a restart');
      assert.ok(q.calls.n - firstCalls < firstCalls / 2, `${q.calls.n - firstCalls} calls the second time, ${firstCalls} the first`);
    }
  });

  test('an edition never depends on what was read before: airings read by another grouping (the quiz) group the same', () => {
    const w = week(5, 200);
    const a = quirky();
    const old = oldGroups(clone(w.entries), { since: w.since, now: w.now, same: a.same });
    const list = clone(w.entries);
    // (another desk has read every airing: their keywords are set on them)
    for (const e of list) e.kw = new Set(String(e.title).split(' ').slice(0, 3));
    const b = quirky();
    assert.equal(fp(groupWeek(list, { since: w.since, now: w.now, same: b.same })), fp(old));
  });

  test('in slices, the event loop is handed back: no stretch longer than a slice and one call', async () => {
    const w = week(9, 300);
    let calls = 0;
    const slow = (a, b) => {
      calls++;
      const t = performance.now();
      while (performance.now() - t < 1); // (a millisecond a call)
      return a.title.split(' ')[0] === b.title.split(' ')[0];
    };
    let last = performance.now();
    let longest = 0;
    let breaths = 0;
    const breathe = () => {
      longest = Math.max(longest, performance.now() - last);
      breaths++;
      return new Promise((r) => setImmediate(() => r((last = performance.now()))));
    };
    const sliced = await groupWeekAsync(clone(w.entries), { since: w.since, now: w.now, same: slow, sliceMs: 10, breathe });
    // (a millisecond a call, slices of 10 ms: a breath every ten calls or so; the stretch itself is loose here, the test
    // files run side by side and share the machine)
    assert.ok(breaths >= calls / 20, `${breaths} breaths for ${calls} calls of a millisecond`);
    assert.ok(longest < 250, `the longest stretch ${Math.round(longest)} ms`);
    assert.equal(fp(sliced), fp(oldGroups(clone(w.entries), { since: w.since, now: w.now, same: slow })));
  });

  test("with the news desk's own sameStory on real headlines: old, new and the thread agree", async () => {
    const NOW = Date.parse('2026-10-18T09:00:00Z');
    const H = 3_600_000;
    const raw = [
      ['a1', 'world', 'BBC News', 'Hurricane Isaias strengthens as it heads towards land', 'Hurricane Isaias is expected to make landfall in Florida on Sunday.'],
      ['a2', 'world', 'Reuters', 'Isaias becomes major category three storm before landfall', 'The storm Isaias strengthened to a category three hurricane.'],
      ['b1', 'business', 'The Guardian', 'IMF raises UK growth forecast for this year', 'The prediction from the IMF lifts the UK outlook.'],
      ['b2', 'business', 'BBC News', 'UK growth forecast upgraded by IMF', 'The IMF said the UK economy would grow faster than expected.'],
      ['c1', 'world', 'NPR', "India cracks down on youth protests after 'Cockroach' movement grows", "Police detained hundreds linked to the 'Cockroach' movement."],
      ['c2', 'world', 'France 24', "Founder of India's 'Cockroach' movement among hundreds detained", 'The founder of the Cockroach movement was detained in Delhi.'],
      ['d1', 'tech', 'The Verge', 'Apple launches Apple TV 4K with Siri AI and voice commands', 'Apple unveiled a new Apple TV 4K.'],
      ['e1', 'science', 'ESA', 'Mars moon lander set to launch on 19 October', 'The lander will fly to Phobos.'],
      ['f1', 'world', 'Reuters', 'Lisbon opens a new riverside tram line', 'The tram line runs along the Tagus in Lisbon.'],
      ['f2', 'world', 'AP', "Thousands ride Lisbon's new tram", 'Thousands rode the new tram line in Lisbon on its first day.'],
    ];
    const entries = [];
    raw.forEach(([id, category, source, title, summary], i) => {
      for (let k = 0; k < 2; k++) entries.push({ id, category, source, title, summary, at: NOW - (40 - i * 3 - k) * H, programId: 'world-now', rank: k, text: `${title}. ${summary}` });
    });
    const desk = new NewsDesk({ log: { warn() {} } });
    const same = (a, b) => {
      try {
        return desk.sameStory(a, b);
      } catch {
        return false;
      }
    };
    const old = oldGroups(clone(entries), { since: NOW - 7 * 86400_000, now: NOW, same });
    const archive = new Archive({ dir: null, now: () => NOW, log: { warn() {} } });
    for (const e of clone(entries)) archive.keep(e);
    assert.equal(fp(archive.week({ same })), fp(old));
    assert.ok(old.length < 10, `${old.length} events: the storm, the forecast, the movement and the tram are one each`);
    const grouper = new WeekGrouper({ archive, desk, log: { warn() {} } });
    try {
      const threaded = await grouper.week({ now: NOW });
      assert.equal(grouper.status().last.where, 'thread', 'grouped in its thread');
      assert.equal(fp(threaded), fp(old));
      archive.keep({ id: 'g1', category: 'tech', source: 'Wired', title: 'Apple TV 4K review', summary: 'The new Apple TV.', at: NOW - H, programId: 'tech-bytes', rank: 0, text: 'x' });
      const again = await grouper.week({ now: NOW });
      assert.equal(fp(again), fp(oldGroups(clone(archive.entries), { since: NOW - 7 * 86400_000, now: NOW, same })), 'the next edition, with an airing more');
    } finally {
      grouper.close();
    }
  });

  test('a desk that is not the news desk is grouped here, in slices, by its own sameStory', async () => {
    const w = week(13, 90);
    const archive = new Archive({ dir: null, now: () => w.now, log: { warn() {} } });
    for (const e of clone(w.entries)) archive.keep(e);
    const q = quirky();
    const grouper = new WeekGrouper({ archive, desk: { sameStory: q.same }, log: { warn() {} } });
    const got = await grouper.week({ days: 8, now: w.now });
    assert.equal(grouper.status().last.where, 'slices');
    assert.equal(fp(got), fp(oldGroups(clone(w.entries), { since: w.since, now: w.now, same: quirky().same })));
  });

  test('groupSteps yields only when a slice is spent', () => {
    const w = week(2, 50);
    const steps = groupSteps(clone(w.entries), { since: w.since, now: w.now, same: () => false, sliceMs: Infinity });
    assert.equal(steps.next().done, true, 'no slice: done at once');
  });
});
