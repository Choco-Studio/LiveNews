// The station's one Wikimedia queue (server/wikimedia.js; round 10 of the pictures desk): every desk asks through it,
// one request at a time, the episode being made first; a 429 pauses all of them for what Retry-After asks; background
// work waits the pause out in the queue; every request is counted by host and by desk; the footage desk, the guests'
// identity desk and the election calendar use it, with the same User-Agent. And the event loop's watch.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WikimediaClient, wikimediaAgent } from '../server/wikimedia.js';
import { FootageDesk } from '../server/footage.js';
import { IdentityDesk } from '../server/guests/identity.js';
import { fetchCalendar } from '../server/compliance/elections.js';
import { LoopWatch } from '../server/loopwatch.js';

const reply = (data, status = 200, headers = {}) => ({ ok: status >= 200 && status < 300, status, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, text: async () => JSON.stringify(data), json: async () => data, body: null });

/** A client on a fake clock whose fetch answers from `answer(url)` and records each request (url, agent). */
function client({ answer = () => reply({ ok: true }), gapMs = 0 } = {}) {
  let now = 1_800_000_000_000;
  const asked = [];
  const sleeps = [];
  const wm = new WikimediaClient({
    fetchImpl: async (url, o) => {
      asked.push({ url: String(url), agent: o?.headers?.['user-agent'] });
      return answer(String(url));
    },
    gapMs,
    now: () => now,
    sleep: async (ms) => {
      sleeps.push(ms);
      now += ms;
    },
    log: { warn() {} },
  });
  return { wm, asked, sleeps, advance: (ms) => (now += ms) };
}
const W = (q) => `https://commons.wikimedia.org/w/api.php?q=${q}`;

describe("the station's one Wikimedia queue", () => {
  test('one at a time, the highest priority first, then in the order asked', async () => {
    const { wm, asked } = client();
    // (asked together: the background first, then the episode being made, then the next programme)
    const done = Promise.all([wm.json(W('archive'), { priority: 3, desk: 'pictures' }), wm.json(W('calendar'), { priority: 3, desk: 'elections' }), wm.json(W('footage'), { priority: 0, desk: 'footage' }), wm.json(W('next'), { priority: 1, desk: 'pictures' })]);
    await done;
    // the first was already on its way when the others came; then by priority
    assert.deepEqual(asked.map((a) => new URL(a.url).searchParams.get('q')), ['archive', 'footage', 'next', 'calendar']);
    assert.ok(asked.every((a) => a.agent === wikimediaAgent()), 'one User-Agent for every desk');
    assert.deepEqual(Object.keys(wm.status().desks).sort(), ['elections', 'footage', 'pictures']);
    assert.equal(wm.status().desks.pictures.requests, 2);
  });

  test("a 429 pauses every desk for what Retry-After asks: the episode's requests are refused at once, background work waits", async () => {
    let limited = true;
    const { wm, asked, advance } = client({ answer: () => (limited ? reply({}, 429, { 'retry-after': '30' }) : reply({ ok: true })) });
    await assert.rejects(wm.json(W('first'), { desk: 'pictures' }), /429/);
    limited = false;
    assert.equal(wm.resumeIn(), 30_000);
    // the episode being made: refused at once, nothing sent
    await assert.rejects(wm.json(W('guest'), { desk: 'guests', priority: 0 }), /paused/);
    assert.equal(asked.length, 1);
    // background work: waits in the queue until the pause is over, then goes
    const calendar = wm.json(W('calendar'), { desk: 'elections', priority: 3, waits: true });
    assert.deepEqual(await calendar, { ok: true });
    assert.equal(asked.length, 2);
    assert.ok(wm.resumeIn() === 0);
    const s = wm.status();
    assert.equal(s.desks.guests.refused, 1);
    assert.equal(s.desks.pictures.limited, 1);
    assert.equal(s.hosts['commons.wikimedia.org'].limited, 1);
    advance(1);
  });

  test("a request of the episode being made is refused at once during a pause, never left behind background work the queue sleeps on", async () => {
    let release;
    const { wm } = client();
    // (the queue's sleep through the pause is held open, as a real pause of 30 s would be)
    wm.sleep = () => new Promise((r) => (release = r));
    wm.pausedUntil = wm.now() + 30_000;
    const calendar = wm.json(W('calendar'), { desk: 'elections', priority: 3, waits: true });
    await new Promise((r) => setImmediate(r));
    const t0 = Date.now();
    await assert.rejects(wm.json(W('footage'), { desk: 'footage', priority: 0 }), /paused/);
    assert.ok(Date.now() - t0 < 100, 'at once');
    wm.pausedUntil = 0;
    release();
    assert.deepEqual(await calendar, { ok: true });
  });

  test('within(): every request made inside, however deep, carries its desk and priority', async () => {
    const { wm } = client();
    await wm.within({ desk: 'pictures', priority: 2 }, async () => {
      await Promise.resolve();
      await wm.json(W('a'));
      await new Promise((r) => setImmediate(r));
      await wm.json(W('b'));
    });
    assert.equal(wm.status().desks.pictures.requests, 2);
  });

  test('media files: the same agent, counted for their desk, a pause of their own on a 429', async () => {
    const { wm } = client();
    const seen = [];
    const res = await wm.media('https://upload.wikimedia.org/a.webm', async (headers) => (seen.push(headers['user-agent']), reply({}, 429, { 'retry-after': '20' })), { desk: 'footage' });
    assert.equal(res.status, 429);
    assert.equal(seen[0], wikimediaAgent());
    await assert.rejects(wm.media('https://upload.wikimedia.org/b.webm', async () => reply({})), /paused/);
    assert.equal(wm.resumeIn(), 0, "the API's queue is not paused by a media file");
    assert.equal(wm.status().desks.footage.limited, 1);
  });
});

describe('the desks that ask Wikimedia, through the one queue', () => {
  test("footage: Commons searched through the queue as the episode's (priority 0), the clip fetched with its agent", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'footage-q-'));
    const { wm, asked } = client({ answer: () => reply({ query: { pages: [] } }) });
    const footage = new FootageDesk({ dir, wikimedia: wm, log: { warn() {} } });
    const clip = await footage.find({ place: 'LISBON', kind: 'city', lat: 38.7, lon: -9.1 });
    assert.equal(clip, null);
    assert.ok(asked.length >= 1 && asked.every((a) => /commons\.wikimedia\.org/.test(a.url) && a.agent === wikimediaAgent()));
    assert.ok(wm.status().desks.footage.requests >= 1);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("the guests' identity desk: Wikidata through the queue; a pause refuses at once and is not rested on twice", async () => {
    const { wm, asked } = client({ answer: (url) => (/wbsearchentities/.test(url) ? reply({ search: [{ id: 'Q1' }] }) : reply({ entities: { Q1: { id: 'Q1', claims: { P31: [{ mainsnak: { datavalue: { value: { id: 'Q5' } } } }] }, sitelinks: { enwiki: {} }, descriptions: { en: { value: 'British politician' } } } } })) });
    const desk = new IdentityDesk({ dir: null, wikimedia: wm, log: { warn() {} } });
    const id = await desk.lookup('Jane Doe');
    assert.equal(id.qid, 'Q1');
    assert.equal(asked.length, 2);
    assert.equal(wm.status().desks.guests.requests, 2);
    wm.pausedUntil = wm.now() + 60_000;
    assert.equal(await desk.lookup('John Roe'), null, 'refused while paused');
    assert.equal(desk.pausedUntil, 0, 'no rest of its own on top of the pause');
  });

  test('the election calendar: the last priority, waiting a pause out in the queue', async () => {
    const { wm, asked } = client({ answer: () => reply({ results: { bindings: [{ e: { value: 'http://www.wikidata.org/entity/Q9' }, eLabel: { value: '2026 Brazilian general election' }, date: { value: '2026-10-25T00:00:00Z' }, country: { value: 'http://www.wikidata.org/entity/Q155' }, countryLabel: { value: 'Brazil' } }] } }) });
    wm.pausedUntil = wm.now() + 5_000;
    const cal = await fetchCalendar({ wikimedia: wm, now: Date.parse('2026-10-18T00:00:00Z') });
    assert.equal(cal.elections.length, 1);
    assert.equal(asked.length, 1);
    assert.match(asked[0].url, /query\.wikidata\.org\/sparql/);
    assert.equal(wm.status().desks.elections.requests, 1);
  });
});

describe("the event loop's watch", () => {
  test('the longest hold, its moment, and how many over 100 ms and over a second', () => {
    let t = 0;
    let now = 1_800_000_000_000;
    let cpu = 0;
    const watch = new LoopWatch({ everyMs: 50, clock: () => t, now: () => now, cpu: () => cpu, setTimer: () => ({ unref() {} }), clearTimer() {} });
    // (the third tick late by 130 ms with 20 ms of the thread's own work: the rest it waited for the processor)
    for (const [step, own] of [[50, 1], [52, 2], [180, 20], [50, 1], [1300, 1200], [51, 1]]) {
      t += step;
      now += step;
      cpu += own;
      watch.tick();
    }
    const s = watch.status();
    assert.equal(s.maxMs, 1250);
    assert.equal(s.ownMaxMs, 1200);
    assert.equal(s.over100ms, 2);
    assert.equal(s.over1s, 1);
    assert.ok(s.maxAt);
    assert.deepEqual(s.worst.map((w) => [w.ms, w.ownMs]), [[1250, 1200], [130, 20]]);
  });
});
