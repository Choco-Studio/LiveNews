// The picture desk ahead of air (server/pictureahead.js; round 9): stories decided in the background in the order they
// air, a 429's pause waited out to the end, a batch it cut asked again right after, other failures later and later, the
// stories that need nothing from a rate-limited Wikipedia first, a fresh story's wait measured, and the producer reading
// only the decisions that are ready.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PictureAhead } from '../server/pictureahead.js';
import { Producer } from '../server/producer.js';
import { Archive } from '../server/archive.js';
import { rightsRecord, compactRights } from '../server/rights.js';

const MIN = 60_000;
const silent = { info() {}, warn() {}, error() {} };

/** A stand-in desk: `plan` says what each story's decision is ({ picks, complete }) or 'fail' (nothing kept). */
function fakeDesk({ plan = {}, wiki = new Set(), clock }) {
  const kept = new Map();
  const desk = {
    calls: [],
    wm: { stats: { requests: 0, limited: 0 }, pausedUntil: 0, resumeIn: () => Math.max(0, desk.wm.pausedUntil - clock()), limitedHost: null, limitedAt: 0 },
    kept: { saved: 0, save() { this.saved++; } },
    async decide(stories, opts) {
      desk.calls.push({ ids: stories.map((s) => s.id), opts });
      desk.wm.stats.requests += stories.length;
      for (const s of stories) {
        const p = typeof plan[s.id] === 'function' ? plan[s.id](desk) : plan[s.id];
        if (p === 'fail' || p === undefined) continue;
        kept.set(s.id, { at: clock(), ...p });
      }
      return new Map();
    },
    decisionOf: (s) => kept.get(s.id) || null,
    ready: (s) => !!kept.get(s.id) && (kept.get(s.id).complete !== false || kept.get(s.id).picks?.length > 0),
    needs: (s) => !s.local && (!kept.get(s.id) || kept.get(s.id).complete === false),
    asksWikipedia: (s) => wiki.has(s.id),
    kept_: kept,
  };
  return desk;
}
const st = (id, extra = {}) => ({ id, title: `Story ${id}`, ...extra });
const pic = { picks: [{ url: 'https://upload.wikimedia.org/x.jpg' }], complete: true };
const none = { picks: [], complete: true };

function setup({ plan = {}, tiers = [], wiki, batch = 3, watch = () => [] } = {}) {
  let now = 1_800_000_000_000;
  const clock = () => now;
  const desk = fakeDesk({ plan, wiki, clock });
  const offered = [];
  const ahead = new PictureAhead({ desk, tiers: () => tiers, watch, onDecided: (s, tier) => offered.push([s.id, tier]), now: clock, batch, log: silent, freshAfterMs: 0 });
  ahead.startedAt = now - 1;
  return { ahead, desk, offered, advance: (ms) => (now += ms), clock };
}

describe('the picture desk ahead of air', () => {
  test('the order things air: urgent, the next programmes, the fresh stories, the rest; the archive alone, in a small batch', async () => {
    const ids = ['u1', 'n1', 'n2', 'f1', 'p1', 'p2', 'a1', 'a2', 'a3'];
    const plan = Object.fromEntries(ids.map((id) => [id, pic]));
    const S = Object.fromEntries(ids.map((id) => [id, st(id)])); // (the news desk's own story objects, the same at every look)
    const tiers = [
      { name: 'next', stories: () => [S.n1, S.n2] },
      { name: 'fresh', stories: () => [S.f1, S.n1] },
      { name: 'pool', stories: () => [S.p1, S.p2, S.f1] },
      { name: 'archive', alone: true, batch: 2, stories: () => [S.a1, S.a2, S.a3] },
    ];
    const { ahead, desk, offered } = setup({ plan, tiers, batch: 3 });
    ahead.urgent([S.u1]);
    await ahead.step();
    assert.deepEqual(desk.calls[0].ids, ['u1', 'n1', 'n2'], 'the episode in production, then the next programme');
    assert.equal(desk.calls[0].opts.lean, true, 'lean: a rotation waits until a person recurs');
    await ahead.step();
    assert.deepEqual(desk.calls[1].ids, ['f1', 'p1', 'p2']);
    await ahead.step();
    assert.deepEqual(desk.calls[2].ids, ['a1', 'a2'], 'the archive in a batch of its own, two at a time');
    await ahead.step();
    assert.deepEqual(desk.calls[3].ids, ['a3']);
    assert.equal((await ahead.step()).kind, 'idle');
    assert.equal(desk.kept.saved, 1, 'idle: the answers written to disk');
    assert.deepEqual(offered.slice(0, 3), [['u1', 'urgent'], ['n1', 'next'], ['n2', 'next']], 'each decision offered once, with its tier');
    assert.equal(offered.length, 9);
  });

  test('an archive story never rides in a batch with the news desk\'s', async () => {
    const tiers = [
      { name: 'pool', stories: () => [st('p1')] },
      { name: 'archive', alone: true, batch: 4, stories: () => [st('a1'), st('a2')] },
    ];
    const { ahead, desk } = setup({ plan: { p1: pic, a1: pic, a2: pic }, tiers, batch: 8 });
    await ahead.step();
    assert.deepEqual(desk.calls[0].ids, ['p1']);
    await ahead.step();
    assert.deepEqual(desk.calls[1].ids, ['a1', 'a2']);
  });

  test("a 429's pause is waited out to the end: nothing is asked during it, then the cut batch comes first", async () => {
    let cut = true;
    const plan = { s1: () => (cut ? 'fail' : pic), s2: () => (cut ? 'fail' : pic) };
    const { ahead, desk, advance, clock } = setup({ plan, tiers: [{ name: 'pool', stories: () => [st('s1'), st('s2')] }] });
    const decide = desk.decide;
    desk.decide = async (stories, opts) => {
      await decide(stories, opts);
      if (cut) {
        desk.wm.stats.limited++;
        desk.wm.pausedUntil = clock() + 51_000;
      }
    };
    await ahead.step();
    assert.equal(desk.calls.length, 1);
    const turn = await ahead.step();
    assert.deepEqual(turn, { kind: 'paused', ms: 51_000 }, 'the pause Retry-After asked, to the millisecond');
    assert.equal(desk.calls.length, 1, 'nothing asked while paused');
    cut = false;
    advance(51_000);
    await ahead.step();
    assert.deepEqual(desk.calls[1].ids, ['s1', 's2'], 'right after the pause, not minutes later');
    assert.ok(ahead.desk.ready(st('s1')));
  });

  test('a story that fails otherwise is asked again later and later (1, 2, 4 minutes); an urgent one after a minute', async () => {
    const { ahead, desk, advance } = setup({ plan: { s1: 'fail' }, tiers: [{ name: 'pool', stories: () => [st('s1')] }] });
    await ahead.step();
    assert.equal((await ahead.step()).kind, 'idle', 'not again at once');
    advance(MIN);
    await ahead.step();
    assert.equal(desk.calls.length, 2, 'after a minute');
    advance(MIN);
    assert.equal((await ahead.step()).kind, 'idle', 'then two minutes');
    advance(MIN);
    await ahead.step();
    assert.equal(desk.calls.length, 3);
    advance(2 * MIN);
    assert.equal((await ahead.step()).kind, 'idle', 'then four');
    ahead.urgent([st('s1')]);
    advance(MIN);
    await ahead.step();
    assert.equal(desk.calls.length, 4, 'urgent: a minute after the last try');
  });

  test('after a 429 from Wikipedia, the stories that need nothing from it go first; the others when nothing else is left', async () => {
    const { ahead, desk, clock } = setup({ plan: { w1: pic, c1: pic, c2: pic }, wiki: new Set(['w1']), tiers: [{ name: 'pool', stories: () => [st('w1'), st('c1'), st('c2')] }] });
    desk.wm.limitedHost = 'en.wikipedia.org';
    desk.wm.limitedAt = clock();
    await ahead.step();
    assert.deepEqual(desk.calls[0].ids, ['c1', 'c2']);
    await ahead.step();
    assert.deepEqual(desk.calls[1].ids, ['w1'], 'then Wikipedia again, its pause long over');
  });

  test("a fresh story's wait, from the news desk's first sight of it to its decision; the requests a story", async () => {
    const stories = [st('old')];
    const { ahead, advance } = setup({ plan: { old: pic, new1: none }, tiers: [{ name: 'pool', stories: () => stories }], watch: () => stories });
    await ahead.step();
    advance(5 * MIN);
    stories.push(st('new1'));
    ahead.stamp();
    advance(40_000);
    await ahead.step();
    const s = ahead.status();
    assert.equal(s.freshWait.n, 2);
    assert.equal(s.freshWait.maxS, 40);
    assert.equal(s.ready, 2);
    assert.equal(s.pictured, 1);
    assert.equal(s.requestsPerStory, 1);
    assert.deepEqual(s.waiting, { urgent: 0, pool: 0 });
  });

  test('settle waits for the batch in flight that holds the story, never longer than asked, never for another', async () => {
    let release;
    const { ahead, desk } = setup({ plan: { s1: pic }, tiers: [{ name: 'pool', stories: () => [st('s1')] }] });
    desk.decide = (stories) => new Promise((r) => (release = () => r(new Map())));
    const turn = ahead.step();
    await new Promise((r) => setImmediate(r));
    assert.equal(await ahead.settle([st('other')], { maxMs: 10 }), false, 'not for a story outside the batch');
    const t0 = Date.now();
    assert.equal(await ahead.settle([st('s1')], { maxMs: 30 }), true);
    assert.ok(Date.now() - t0 < 1000, 'within its time');
    release();
    await turn;
  });
});

describe('the producer reads what the queue decided', () => {
  const cleared = (url) => rightsRecord({ source: 'wikimedia-commons', via: 'wikidata:P18', licence: 'CC-BY-SA-4.0', author: 'Jane Doe', title: 'File:Lisbon.jpg', page: 'https://commons.wikimedia.org/wiki/File:Lisbon.jpg', url, subject: { kind: 'place', qid: 'Q597', label: 'Lisbon' } });
  function world({ archive = null } = {}) {
    const stories = new Map([
      ['s1', { id: 's1', title: 'Lisbon opens a tram line', source: 'Pixelburg Post', link: 'https://news.example/1', published: Date.now() }],
      ['s2', { id: 's2', title: 'Council approves a budget', source: 'Bitport Herald', link: 'https://news.example/2', published: Date.now() - 5 * 3600_000 }],
    ]);
    const news = { stories, get: (id) => stories.get(id), candidates: () => [...stories.values()] };
    const decided = new Map();
    const desk = {
      calls: [],
      wm: { stats: { requests: 0, limited: 0 }, resumeIn: () => 0 },
      kept: { save() {} },
      async decide(list) {
        desk.calls.push(['decide', list.map((s) => s.id)]);
        return new Map();
      },
      async assign(list, opts) {
        desk.calls.push(['assign', list.map((s) => s.id), opts]);
        for (const s of list) desk.apply(s);
        return { cleared: list.filter((s) => s.imageRights?.cleared).length };
      },
      apply(s) {
        const p = decided.get(s.id)?.picks?.[0];
        if (p) Object.assign(s, { image: p.url, imageRights: p.rights });
        return p || null;
      },
      pickFor: (s) => decided.get(s.id)?.picks?.[0] || null,
      decisionOf: (s) => decided.get(s.id) || null,
      ready: (s) => decided.has(s.id),
      needs: (s) => !decided.has(s.id),
    };
    const ahead = new PictureAhead({ desk, log: silent });
    const producer = new Producer({ config: { pictures: { rights: 'cleared' }, pictureBudgetMs: 50 }, newsDesk: news, chain: {}, pictureDesk: desk, pictureAhead: ahead, archive, log: silent });
    return { producer, desk, ahead, decided, stories, news };
  }

  test('the picture stage asks nothing: the ready decisions applied, the rest put first in the queue', async () => {
    const { producer, desk, ahead, decided, stories } = world();
    decided.set('s1', { at: 1, complete: true, picks: [{ url: 'https://upload.wikimedia.org/l.jpg', rights: cleared('https://upload.wikimedia.org/l.jpg'), subject: { kind: 'place', label: 'Lisbon' } }] });
    const out = await producer.pictures({ candidates: [...stories.values()], program: { id: 'world-now' } });
    assert.equal(out.cleared.cleared, 1);
    assert.deepEqual(desk.calls, [['assign', ['s1', 's2'], { ready: true }]], 'no decision within the budget');
    assert.deepEqual([...ahead.urgentList.keys()], ['s2'], 'the undecided story is urgent');
  });

  test('the queue in the order things air: the next programmes, the fresh, the rest, then the archive without the news desk\'s', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ahead-'));
    const archive = new Archive({ dir, now: () => Date.now(), log: silent });
    const at = Date.now() - 3600_000;
    archive.entries.push({ id: 'old1', at, title: 'An old story', summary: '' }, { id: 's1', at, title: 'Lisbon opens a tram line' }, { id: 'old2', at: at + 1, title: 'A shown story', image: 'https://upload.wikimedia.org/o.jpg', imageRights: { cleared: true, url: 'https://upload.wikimedia.org/o.jpg' } });
    const { producer } = world({ archive });
    producer.lookAhead({ programs: { 'world-now': { title: 'WORLD NOW', stories: 2, categories: ['world'] }, weather: { kind: 'weather' } } }, ['world-now', 'weather']);
    const tiers = producer.pictureTiers();
    assert.deepEqual(tiers.map((t) => t.name), ['next', 'fresh', 'pool', 'archive']);
    assert.deepEqual(tiers[0].stories().map((s) => s.id), ['s1', 's2'], "the next programme's candidates (never the weather's)");
    assert.deepEqual(tiers[1].stories().map((s) => s.id), ['s1'], 'fresh: the last three hours');
    assert.deepEqual(tiers[3].stories().map((s) => s.id), ['old1'], 'the archive: neither a story still on the desk nor one with a picture already');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("a decision for a story that aired without a picture puts it on the archive's entries (and on the desk's story)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ahead-'));
    const archive = new Archive({ dir, now: () => Date.now(), log: silent, pictures: 'cleared' });
    archive.keep({ id: 's1', at: Date.now() - 3600_000, title: 'Lisbon opens a tram line', image: null });
    const { producer, decided, stories } = world({ archive });
    const url = 'https://upload.wikimedia.org/l.jpg';
    decided.set('s1', { at: 1, complete: true, picks: [{ url, rights: cleared(url), subject: { kind: 'place', label: 'Lisbon' } }] });
    producer.pictureDecided(stories.get('s1'), 'pool');
    assert.equal(stories.get('s1').image, url, "applied to the news desk's story");
    const e = archive.entries[0];
    assert.equal(e.image, url);
    assert.equal(e.imageRights.cleared, true);
    assert.deepEqual(e.imageSubject, { kind: 'place', label: 'Lisbon' });
    assert.equal(e.pictureLater, true);
    // kept beside the days' files, read again by the next archive
    const again = new Archive({ dir, now: () => Date.now(), log: silent, pictures: 'cleared' });
    again.keep({ id: 's1', at: Date.now() - 3600_000, title: 'Lisbon opens a tram line', image: null });
    again.loadAmends();
    assert.equal(again.entries[0].image, url);
    assert.equal(again.story('s1').image, url, '/api/img serves it');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('the archive takes only a cleared record for that very picture, and never over a picture it may show', () => {
    const archive = new Archive({ dir: null, log: silent });
    const url = 'https://upload.wikimedia.org/l.jpg';
    archive.entries.push({ id: 'a', at: Date.now(), image: null }, { id: 'b', at: Date.now(), image: 'https://upload.wikimedia.org/b.jpg', imageRights: { cleared: true, url: 'https://upload.wikimedia.org/b.jpg' } });
    assert.equal(archive.amendPicture('a', { image: url, imageRights: { cleared: false, url } }), 0, 'not cleared');
    assert.equal(archive.amendPicture('a', { image: url, imageRights: compactRights(cleared('https://upload.wikimedia.org/other.jpg')) }), 0, 'another picture');
    assert.equal(archive.amendPicture('b', { image: url, imageRights: compactRights(cleared(url)) }), 0, 'b keeps its own');
    assert.equal(archive.amendPicture('a', { image: url, imageRights: compactRights(cleared(url)) }), 1);
  });
});

describe("the station's event loop (round 9: Wikimedia's answers timed out unread)", () => {
  test("SEVEN DAYS's readiness counts a big week, never groups it: canProduce runs at every /api/next", () => {
    const now = Date.now();
    let grouped = 0;
    const entries = Array.from({ length: 40 }, (_, i) => ({ id: `s${i}`, at: now - (i % 4) * 86400_000 - 1000, title: `Story ${i}` }));
    const archive = { entries, now: () => now, week: () => (grouped++, []) };
    const producer = new Producer({ config: {}, newsDesk: { get: () => null, sameStory: () => false }, chain: null, archive, log: silent });
    assert.equal(producer.weeklyReady({ minGapHours: 3 }), true);
    assert.equal(grouped, 0, 'no quadratic grouping for the check');
    archive.entries = entries.filter((e) => e.at > now - 2 * 86400_000);
    assert.equal(producer.weeklyReady({ minGapHours: 3 }), false, 'two days told: no week');
    archive.entries = entries.slice(0, 8);
    producer.weeklyReady({ minGapHours: 3 });
    assert.equal(grouped, 1, 'a small week is grouped as before');
  });
});
