// The offline channel runs 24/7 (editorial-2 fix round 1, critic blocker): the
// fixture desk is a closed slate of ~80 stories, so after one rotation the
// stories aired longest ago come back (NewsDesk.recycle), never those of the
// last few episodes. Four rotations through the real Station, Producer and
// mock writer: every slot is produced with at least its floor, no replay,
// and every break promises the programme that really airs next.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NewsDesk } from '../server/news.js';
import { Producer, SOURCE_MAX, sourceWithCredit } from '../server/producer.js';
import { Station } from '../server/station.js';
import { ProviderChain } from '../server/providers/index.js';
import { createMockProvider } from '../server/providers/mock.js';
import { loadChannel } from '../server/channel.js';
import { onBeat } from '../server/topics.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const silent = { info() {}, warn() {}, error() {} };

async function offlineStation() {
  const feeds = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/feeds.fixture.json'), 'utf8')).map((f) => ({ ...f, url: path.join(ROOT, f.url) }));
  const desk = new NewsDesk({ log: silent, fetchImpl: async (url) => { throw new Error(`no network in tests: ${url}`); } });
  desk.loadFeeds = () => feeds;
  await desk.refresh();
  const channel = loadChannel();
  const config = { queueSize: 1, candidatePool: 12, minNewStories: 3, reviewPass: true };
  const chain = new ProviderChain([createMockProvider()], { record() {} }, { log: silent });
  const producer = new Producer({ config, newsDesk: desk, chain, log: silent });
  const station = new Station({ config, newsDesk: desk, producer, chain, channel: () => channel, log: silent });
  return { desk, channel, producer, station };
}

test('offline: four rotations, every slot produced with at least its floor, no replay, honest UP NEXT', async () => {
  const { desk, channel, producer, station } = await offlineStation();
  assert.equal(desk.localOnly, true, 'the fixture desk is all local feeds');
  await station.fill();
  const slots = channel.rotation.length * 4;
  const episodes = [];
  const breaks = [];
  const lastAired = new Map();
  let after;
  for (let i = 0; episodes.length < slots && i < slots * 3; i++) {
    const item = station.next(after);
    assert.ok(item, 'the channel always has something to air');
    after = item.id;
    if (item.kind === 'episode') {
      const n = episodes.push(item);
      for (const id of item.storyIds) {
        if (lastAired.has(id)) assert.ok(n - lastAired.get(id) >= 5, `${id} back after ${n - lastAired.get(id)} episodes`);
        lastAired.set(id, n);
      }
    } else breaks.push({ item, before: episodes.length });
    // let the background production finish, then make sure the next one is ready
    for (let k = 0; k < 200 && station.producing; k++) await new Promise((r) => setTimeout(r, 2));
    await station.fill();
  }
  assert.equal(episodes.length, slots);
  assert.deepEqual(
    episodes.map((e) => e.program.id),
    Array.from({ length: slots }, (_, i) => channel.rotation[i % channel.rotation.length]),
    'every slot of four rotations airs, in order'
  );
  assert.ok(episodes.every((e) => !e.replay), 'no replay');
  for (const e of episodes) {
    const program = { id: e.program.id, ...channel.programs[e.program.id] };
    assert.ok(e.storyIds.length >= producer.floorOf(program), `${e.program.title}: ${e.storyIds.length} stories, floor ${producer.floorOf(program)}`);
  }
  assert.ok(breaks.every(({ item }) => !item.filler), 'no filler break: the queue was always ready');
  for (const { item, before } of breaks) {
    const nextEpisode = episodes[before];
    if (nextEpisode) assert.equal(item.next?.id, nextEpisode.program.id, 'the break promises what airs next');
  }
  // the second time round, programmes are not the first rotation again in the same order
  const heads = (e) => e.rundown.map((r) => r.headline).join('|');
  const same = channel.rotation.filter((_, i) => heads(episodes[i]) === heads(episodes[i + channel.rotation.length])).length;
  assert.ok(same <= 1, `${same} programmes repeated their running order one rotation later`);

  // (fix r2) 24/7 variety: no presenter line (chat, button, signpost) airs twice in four rotations
  const lines = new Map();
  for (const [n, e] of episodes.entries())
    for (const seg of e.segments.filter((x) => x.type === 'chat'))
      for (const line of seg.text.split(/(?<=[.!?])\s+/).filter(Boolean)) {
        assert.ok(!lines.has(line), `"${line}" aired in episodes ${lines.get(line) + 1} and ${n + 1}`);
        lines.set(line, n);
      }
  // (fix r2) two outlets' reports of one event never air within six slots of each other (no "second year" then
  // "third year" of the same reef in back-to-back programmes)
  const aired = [];
  for (const [n, e] of episodes.entries())
    for (const id of e.storyIds) {
      const s = desk.get(id);
      for (const o of aired) if (n - o.n <= 6 && o.s.id !== id && desk.sameStory(o.s, s)) assert.fail(`same event within ${n - o.n} slots: ${o.s.title} // ${s.title}`);
      aired.push({ n, s });
    }
  // (fix r2) NEWS IN 60 puts a picture on every item while the desk holds pictured stories (it always does offline)
  for (const e of episodes.filter((x) => x.program.id === 'news-60')) assert.ok(e.segments.filter((x) => x.type === 'story').every((x) => x.hasImage), `${e.id}: an item without a picture`);
  // (fix r2) programme beats hold on re-runs too: TECH BYTES takes science only on its tech-adjacent topics
  for (const e of episodes.filter((x) => channel.programs[x.program.id].beat))
    for (const id of e.storyIds) assert.ok(onBeat(desk.get(id), channel.programs[e.program.id].beat), `${e.program.title}: ${desk.get(id).title} is off its beat`);
});

test('recycle: oldest first, never a story of the last `gap` episodes, and a re-run is not breaking news', () => {
  const desk = new NewsDesk({ log: silent, fetchImpl: async () => { throw new Error('no network'); } });
  const add = (id, title) => desk.stories.set(id, { id, title, summary: 'x'.repeat(100), link: `https://e.test/${id}`, source: 'Outlet', category: 'world', weight: 1, published: Date.now(), image: null });
  add('a', 'BREAKING: Canal reopens after fog');
  add('b', 'Bridge opens to traffic');
  add('c', 'Museum opens new wing');
  desk.markCovered(['a']);
  desk.markCovered(['b']);
  desk.markCovered(['c']);
  assert.equal(desk.recycle(5, { gap: 3 }), 0, 'all three aired within the last 3 episodes');
  desk.markCovered([]);
  desk.markCovered([]);
  assert.equal(desk.recycle(1, { gap: 3 }), 1);
  assert.deepEqual(desk.uncovered().map((s) => s.id), ['a'], 'the oldest comes back first');
  assert.equal(desk.get('a').title, 'Canal reopens after fog');
  assert.equal(desk.get('a').recycled, 1);
  assert.equal(desk.recycle(5, { gap: 3, filter: (s) => s.id !== 'c' }), 1, 'b only: c is filtered out');
});

test('live desks never recycle by default; with recycle "all" only stories aired long enough ago come back', async () => {
  const desk = new NewsDesk({ log: silent, fetchImpl: async () => { throw new Error('no network'); } });
  const titles = ['Oil prices slide on weak demand', 'Retailer posts record holiday sales', 'Airline orders new jets', 'Coffee futures reach a high'];
  for (let i = 0; i < 4; i++) desk.stories.set(`s${i}`, { id: `s${i}`, title: titles[i], summary: 'x'.repeat(100), link: `https://e.test/${i}`, source: `O${i}`, category: 'business', weight: 1, published: Date.now() - i * 60_000, image: null });
  desk.markCovered(['s0', 's1', 's2', 's3']);
  for (let i = 0; i < 6; i++) desk.markCovered([]);
  const channel = loadChannel();
  const chain = new ProviderChain([createMockProvider()], { record() {} }, { log: silent });
  const live = new Producer({ config: { candidatePool: 12, minNewStories: 3 }, newsDesk: desk, chain, log: silent });
  assert.equal(live.canProduce(channel, 'money-minute'), false, 'a live desk does not re-run its stories by default');
  const all = new Producer({ config: { candidatePool: 12, minNewStories: 3, recycle: 'all', recycleAfterHours: 4 }, newsDesk: desk, chain, log: silent });
  assert.equal(all.canProduce(channel, 'money-minute'), false, 'aired minutes ago: too recent to re-run');
  for (const id of desk.covered.keys()) desk.covered.set(id, Date.now() - 5 * 3600_000);
  assert.equal(all.canProduce(channel, 'money-minute'), true, 'aired five hours ago: back in a new bulletin');
});

test('every picture on air carries a credit; a picture that is not the outlet’s own shows it where the source is drawn', async () => {
  const { channel, producer } = await offlineStation();
  let lent = 0;
  for (const [k, id] of channel.rotation.entries()) {
    const upcoming = [1, 2, 3].map((j) => channel.rotation[(k + j) % channel.rotation.length]).filter((x) => x !== id);
    const ep = await producer.produce(channel, id, { upcoming });
    for (const item of [...ep.segments.filter((s) => s.type === 'story'), ...ep.rundown]) {
      assert.ok(item.outlet, `${item.headline}: the outlet's own name is kept`);
      if (!item.hasImage) {
        assert.equal(item.imageCredit, undefined);
        assert.equal(item.source, item.outlet);
        continue;
      }
      assert.ok(item.imageCredit, `${item.headline}: a picture with no credit`);
      assert.ok(['media:credit', 'jsonld', 'site_name', 'outlet'].includes(item.imageCreditVia), item.imageCreditVia);
      if (item.imageCredit !== item.outlet) {
        lent++;
        // (fix r2) the stop-gap fits the source plate whole (the credit's first part when the whole one does not)
        assert.equal(item.source, sourceWithCredit(item.outlet, item.imageCredit));
        assert.ok(item.source.length <= SOURCE_MAX, item.source);
        assert.match(item.imageCreditLine || '', /^PHOTO: /);
      } else assert.equal(item.source, item.outlet);
    }
  }
  assert.ok(lent > 0, 'the offline slate exercises lent pictures');
});

test('headlines: no strap over 56 characters, 90% of the slate within 45; NEWS IN 60: 90% within 36 and a picture on nearly every item', async () => {
  const { shortHeadline } = await import('../server/writer.js');
  const titles = [];
  for (const f of ['world', 'world2', 'business', 'tech', 'science']) {
    const xml = fs.readFileSync(path.join(ROOT, 'config/fixtures', `${f}.xml`), 'utf8');
    for (const m of xml.matchAll(/<item><title>([^<]*)<\/title>/g)) titles.push(m[1].replace(/&amp;/g, '&'));
  }
  const at45 = titles.map((t) => shortHeadline(t, 45));
  assert.ok(at45.every((h) => h.length <= 56), at45.filter((h) => h.length > 56).join(' | '));
  assert.ok(at45.filter((h) => h.length <= 45).length / titles.length >= 0.9, `${at45.filter((h) => h.length <= 45).length}/${titles.length} within 45`);
  assert.ok(at45.every((h) => shortHeadline(h, 45) === h), 'stable on a second pass');

  const { channel, producer } = await offlineStation();
  let items = 0;
  let fit = 0;
  let pictures = 0;
  for (let r = 0; r < 2; r++) {
    for (const [k, id] of channel.rotation.entries()) {
      const upcoming = [1, 2, 3].map((j) => channel.rotation[(k + j) % channel.rotation.length]).filter((x) => x !== id);
      const ep = await producer.produce(channel, id, { upcoming });
      if (id !== 'news-60') continue;
      for (const s of ep.segments.filter((x) => x.type === 'story')) {
        items++;
        if (s.headline.length <= 36) fit++;
        if (s.hasImage) pictures++;
      }
    }
  }
  assert.ok(fit / items >= 0.9, `NEWS IN 60 straps within 36: ${fit}/${items}`);
  assert.ok(pictures / items >= 5 / 6, `NEWS IN 60 items with a picture: ${pictures}/${items}`);
});

test('round-up items say the news in a summary sentence, not the headline read aloud', async () => {
  const { contentWords } = await import('../server/facts.js');
  const { channel, producer } = await offlineStation();
  let items = 0;
  for (let r = 0; r < 2; r++) {
    for (const [k, id] of channel.rotation.entries()) {
      const upcoming = [1, 2, 3].map((j) => channel.rotation[(k + j) % channel.rotation.length]).filter((x) => x !== id);
      const ep = await producer.produce(channel, id, { upcoming });
      for (const s of ep.segments.filter((x) => x.type === 'story' && x.roundup)) {
        items++;
        const title = new Set(contentWords(s.headline));
        const said = contentWords(
          s.text
            .replace(/^(?:Now, around the world in 30 seconds\.|Around the world\.)\s*/, '')
            .replace(/^(?:First|Now to) [^.]+\.\s*/, '')
            .replace(/,? (?:according to [A-Z][\w ]+|[A-Z][\w ]+ reports)\.$/, '')
        );
        const share = said.filter((w) => title.has(w)).length / (said.length || 1);
        assert.ok(share < 0.8, `round-up item reads its headline: ${s.text}`);
      }
    }
  }
  assert.ok(items >= 8, `${items} round-up items`);
});
