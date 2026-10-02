import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { ROOT } from '../server/config.js';
import { NewsDesk, isBreaking, localFeedPath, parseFeed } from '../server/news.js';
import { Producer } from '../server/producer.js';
import { ProviderChain } from '../server/providers/index.js';
import { createMockProvider } from '../server/providers/mock.js';
import { loadChannel } from '../server/channel.js';
import { numbersGrounded } from '../server/facts.js';
import { paint } from '../config/fixtures/make-images.mjs';

// The offline demo (npm run demo:offline) must look like the real channel:
// varied fictional stories with places, figures and quotes, and pictures.

const FEEDS = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'feeds.fixture.json'), 'utf8'));
const IMG_DIR = path.join(ROOT, 'config', 'fixtures', 'img');
const silentLogger = { info() {}, warn() {}, error() {} };

const parsed = FEEDS.map((feed) => {
  const file = localFeedPath(feed.url);
  return { feed, stories: parseFeed(fs.readFileSync(file, 'utf8'), feed, { baseDir: path.dirname(file) }) };
});
const all = parsed.flatMap((p) => p.stories);

/** Width and height from a PNG header, and its raw (inflated) pixel rows. */
function readPng(buf) {
  assert.equal(buf.toString('latin1', 1, 4), 'PNG');
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  const idat = [];
  for (let o = 8; o < buf.length; ) {
    const len = buf.readUInt32BE(o);
    if (buf.toString('latin1', o + 4, o + 8) === 'IDAT') idat.push(buf.subarray(o + 8, o + 8 + len));
    o += 12 + len;
  }
  return { w, h, raw: zlib.inflateSync(Buffer.concat(idat)) };
}

describe('offline fixture feeds', () => {
  test('are all local files from the operator list, with fictional outlet names', () => {
    assert.ok(FEEDS.length >= 5);
    for (const f of FEEDS) {
      assert.ok(localFeedPath(f.url), `${f.name} is local`);
      assert.doesNotMatch(f.name, /fixture/i, 'an on-air outlet name, not a file label');
    }
    assert.deepEqual([...new Set(FEEDS.map((f) => f.category))].sort(), ['business', 'science', 'tech', 'world']);
  });

  test('hold enough varied stories for long demos: 12+ per feed, 60+ in all, unique links, real summaries', () => {
    for (const { feed, stories } of parsed) assert.ok(stories.length >= 12, `${feed.name}: ${stories.length}`);
    assert.ok(all.length >= 60, `${all.length} stories`);
    assert.equal(new Set(all.map((s) => s.id)).size, all.length, 'no two items share a link');
    for (const s of all) assert.ok(s.summary.length >= 60, s.title);
  });

  test('many stories name a place, state a figure, a few quote someone, one is breaking and one is a live blog', async () => {
    const { locate } = await import('../server/gazetteer.js');
    const { extractFigures, quotesIn } = await import('../server/facts.js');
    const placed = all.filter((s) => locate(s.title, s.summary));
    const figures = all.filter((s) => extractFigures(s.summary).length);
    const quotes = all.filter((s) => quotesIn(s.summary).some((q) => q.by));
    assert.ok(placed.length >= 35, `${placed.length} with a place`);
    assert.ok(figures.length >= 35, `${figures.length} with a figure`);
    assert.ok(quotes.length >= 5, `${quotes.length} with an attributed quote`);
    assert.deepEqual(all.filter((s) => isBreaking(s.title)).map((s) => s.title), ['BREAKING: Panama Canal reopens after a day-long closure']);
    assert.equal(all.filter((s) => s.live).length, 1);
  });

  test('two outlets cover some of the same events, so the trending count works offline', () => {
    const desk = new NewsDesk({ log: silentLogger, fetchImpl: async () => assert.fail('no network') });
    for (const s of all) desk.stories.set(s.id, s);
    desk.updateTrending();
    const trending = [...desk.stories.values()].filter((s) => s.outlets > 1);
    assert.ok(trending.length >= 4, trending.map((s) => s.title).join(' | '));
  });
});

describe('offline fixture pictures', () => {
  const referenced = all.filter((s) => s.image).map((s) => fileURLToPath(s.image));

  test('every picture a story refers to exists inside config/fixtures/img and is a 640x360 PNG of reasonable size', () => {
    assert.ok(referenced.length >= 12, `${referenced.length} stories with a picture`);
    for (const file of referenced) {
      assert.ok(file.startsWith(IMG_DIR + path.sep), file);
      const buf = fs.readFileSync(file);
      const { w, h } = readPng(buf);
      assert.deepEqual([w, h], [640, 360], file);
      assert.ok(buf.length < 200_000, `${path.basename(file)} is ${buf.length} bytes`);
    }
  });

  test('no picture is left unused, and none is used twice', () => {
    const files = fs.readdirSync(IMG_DIR).filter((f) => f.endsWith('.png'));
    assert.deepEqual(files.sort(), [...new Set(referenced.map((f) => path.basename(f)))].sort());
    assert.equal(new Set(referenced).size, referenced.length);
  });

  test('pictures are painted by the procedural generator: the committed file matches a fresh paint', () => {
    const fresh = readPng(paint('markets'));
    const disk = readPng(fs.readFileSync(path.join(IMG_DIR, 'markets.png')));
    assert.ok(fresh.raw.equals(disk.raw), 'run: node config/fixtures/make-images.mjs');
  });
});

describe('the offline demo, end to end (fixture feeds -> desk -> mock writer -> episodes)', () => {
  const makeDesk = () => {
    const desk = new NewsDesk({ log: silentLogger, fetchImpl: async (url) => assert.fail(`network access to ${url}`) });
    desk.loadFeeds = () => FEEDS;
    return desk;
  };

  test('a full rotation produces episodes that use places, figures, pictures and the recurring features', async () => {
    const desk = makeDesk();
    await desk.refresh();
    assert.equal(desk.localImageRoots.size, 1);
    const channel = loadChannel();
    const chain = new ProviderChain([createMockProvider()], { record() {} }, { log: silentLogger });
    const producer = new Producer({ config: { candidatePool: 12, minNewStories: 3, reviewPass: true }, newsDesk: desk, chain, log: silentLogger });
    const episodes = [];
    for (const id of channel.rotation) {
      const ep = await producer.produce(channel, id);
      if (ep) episodes.push(ep);
    }
    assert.equal(episodes.length, channel.rotation.length, 'there is enough news for a whole rotation');
    const stories = episodes.flatMap((e) => e.segments.filter((s) => s.type === 'story'));
    assert.ok(stories.filter((s) => s.shot === 'map' && s.location).length >= 10, 'map shots');
    assert.ok(stories.filter((s) => s.fact).length >= 10, 'fact cards');
    assert.ok(stories.filter((s) => s.hasImage).length >= 5, 'pictures');
    assert.ok(stories.some((s) => s.quote));
    assert.ok(stories.some((s) => s.kicker && !s.feature));
    const world = episodes.find((e) => e.program.id === 'world-now');
    assert.ok(world.segments.some((s) => s.feature === 'roundup'), 'WORLD NOW has its round-up');
    assert.equal(world.segments.filter((s) => s.type === 'story').at(-1).feature, 'lighter', 'and closes with "and finally"');
    assert.ok(episodes.some((e) => e.segments.some((s) => s.feature === 'number')), 'a number of the day somewhere');
    // Every figure on air comes from the story it belongs to.
    for (const s of stories) {
      const src = desk.get(s.storyId);
      const text = `${src.title}. ${src.summary}`;
      for (const field of [s.fact, ...(s.numbers || []).map((n) => n.value)]) if (field) assert.ok(numbersGrounded(field, text), `${field} in ${s.storyId}`);
    }
    const ids = episodes.flatMap((e) => e.storyIds);
    assert.equal(new Set(ids).size, ids.length, 'no story airs twice in a rotation');
    for (const e of episodes) assert.equal(e.pipeline.find((p) => p.stage === 'review').reviewed, false);
  });
});
