import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
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
  // Every way a picture reaches a story offline: the feed item (media, media:group, media:thumbnail, enclosure,
  // inline srcset), the item's local article page (og:image, twitter:image, JSON-LD), and the same-event cluster.
  const PAGES_DIR = path.join(ROOT, 'config', 'fixtures', 'pages');
  const pageRefs = fs
    .readdirSync(PAGES_DIR)
    .flatMap((f) => [...fs.readFileSync(path.join(PAGES_DIR, f), 'utf8').matchAll(/(?:content="|"url":"|\[")(\.\.\/img\/[^"]+\.png)"/g)].map((m) => path.resolve(PAGES_DIR, m[1])));
  const feedRefs = all.flatMap((s) => s.images || (s.image ? [s.image] : [])).map((u) => fileURLToPath(u));
  const PLACEHOLDER = path.join(IMG_DIR, 'cw-card.png'); // an outlet's generic share card: never aired

  test('every picture a feed item or an article page refers to exists inside config/fixtures/img: 640x360 PNGs, 320x180 thumbnails', () => {
    assert.ok(feedRefs.length >= 15 && pageRefs.length >= 5, `${feedRefs.length} feed and ${pageRefs.length} page references`);
    for (const file of [...feedRefs, ...pageRefs]) {
      assert.ok(file.startsWith(IMG_DIR + path.sep), file);
      const buf = fs.readFileSync(file);
      const { w, h } = readPng(buf);
      assert.deepEqual([w, h], path.dirname(file).endsWith('thumbs') ? [320, 180] : [640, 360], file);
      assert.ok(buf.length < 450_000, `${path.basename(file)} is ${buf.length} bytes`);
    }
  });

  test('every painted picture is found by the desk, airs only on one event, and the share card never airs', async () => {
    const desk = new NewsDesk({ log: silentLogger, fetchImpl: async (url) => assert.fail(`network access to ${url}`) });
    desk.loadFeeds = () => FEEDS;
    await desk.refresh();
    const stories = [...desk.stories.values()];
    await desk.findPictures(stories, { budgetMs: 20_000 });
    const files = fs.readdirSync(IMG_DIR).filter((f) => f.endsWith('.png') && f !== 'cw-card.png');
    const used = new Map();
    for (const s of stories.filter((x) => x.image)) {
      const f = fileURLToPath(s.image);
      assert.notEqual(f, PLACEHOLDER, `the share card airs on "${s.title}"`);
      used.set(path.basename(f), [...(used.get(path.basename(f)) || []), s]);
    }
    assert.deepEqual(files.filter((f) => !used.has(f)), [], 'pictures no story ends up with');
    for (const [f, list] of used) for (const s of list.slice(1)) assert.ok(desk.samePictureEvent(list[0], s), `${f} on two events: "${list[0].title}" / "${s.title}"`);
    assert.ok(desk.placeholders.has(pathToFileURL(PLACEHOLDER).href), 'the share card is recognised as a placeholder');
    const via = new Set(stories.filter((x) => x.image).map((x) => x.imageVia));
    for (const v of ['feed:media', 'feed:enclosure', 'feed:inline', 'page:og', 'page:twitter', 'page:jsonld', 'cluster']) assert.ok(via.has(v), `no picture found via ${v}`);
    assert.ok(stories.filter((x) => x.image).length / stories.length >= 0.5, `${stories.filter((x) => x.image).length} of ${stories.length} stories with a picture`);
  });

  test('pictures are painted by the procedural generator: the committed file matches a fresh paint', () => {
    const fresh = readPng(paint('tram'));
    const disk = readPng(fs.readFileSync(path.join(IMG_DIR, 'tram.png')));
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

  test('two rotations of offline copy pass the critics\' audits: clean captions, no repeats, varied openings, rules kept', async () => {
    const desk = makeDesk();
    await desk.refresh();
    const channel = loadChannel();
    const chain = new ProviderChain([createMockProvider()], { record() {} }, { log: silentLogger });
    const producer = new Producer({ config: { candidatePool: 12, minNewStories: 3, reviewPass: true }, newsDesk: desk, chain, log: silentLogger });
    const episodes = [];
    for (let r = 0; r < 2; r++) for (const id of channel.rotation) {
      const ep = await producer.produce(channel, id);
      if (ep) episodes.push(ep);
    }
    const STOP_END = /\b(?:a|an|the|of|to|in|on|at|for|from|by|with|and|or|as)$/i;
    const opener = (t) => (/^From [^:]+: /.test(t) ? 'colon' : /^According to /.test(t) ? 'according' : / reports that /.test(t.split('. ')[0]) ? 'that' : / reports\.$/.test(t.split('. ')[0] + '.') ? 'tail' : 'none');
    for (const e of episodes) {
      const stories = e.segments.filter((x) => x.type === 'story');
      const title = (id) => desk.get(id).title;
      for (const x of stories) {
        assert.ok(!STOP_END.test(x.headline), `caption "${x.headline}" ends mid-phrase`);
        if (/\d$/.test(x.headline)) assert.ok(title(x.storyId).endsWith(x.headline.split(' ').pop()), `caption "${x.headline}" cuts a figure from its unit`);
        assert.ok(!/Follow the latest/i.test(x.text));
        if (x.fact && /\d/.test(x.fact)) {
          const n = x.fact.match(/[\d,.]+/)[0].replace(/[.,]$/, '');
          assert.ok(x.text.includes(n), `${e.program.title}: fact ${x.fact} is never said in "${x.text}"`);
        }
        for (const n of x.numbers || []) assert.ok(n.label, 'no figure without a label');
        if (x.roundup) assert.ok(x.fact === null && !x.numbers, 'no fact card inside the round-up');
      }
      assert.notEqual(stories[0].feature, 'number', `${e.program.title}: the number of the day leads`);
      const introFirst = e.segments[0].text.split('. ')[0];
      assert.ok(!stories[0].text.includes(introFirst), `${e.program.title}: the lead repeats the cold open "${introFirst}"`);
      // Consecutive stories on air (a feature item has its own fixed lead-in, so it counts as a break).
      const kinds = stories.map((x) => (x.feature ? 'none' : opener(x.text.replace(/^Thanks, \w+\. /, ''))));
      for (let i = 1; i < kinds.length; i++) if (kinds[i] !== 'none') assert.notEqual(kinds[i], kinds[i - 1], `${e.program.title}: two openings in a row: ${kinds.join(' ')}`);
      e.segments.forEach((x, i) => {
        if (x.type !== 'chat') return;
        const prev = e.segments.slice(0, i).filter((y) => y.type === 'story').at(-1);
        assert.ok(!['serious', 'sad'].includes(prev.emotion), 'no chat after grave news');
        if (e.program.id === 'world-now') assert.equal(prev.feature, 'lighter', 'WORLD NOW chats only after And finally');
        // A chat adds no figure of its own; THE CATCH (TECH BYTES) answers with a sentence of the story itself.
        const told = `${desk.get(prev.storyId).title}. ${desk.get(prev.storyId).summary}`;
        const own = x.text.split(/(?<=[.!?])\s+/).filter((t) => /\d/.test(t)).every((t) => told.includes(t));
        assert.ok(!/\d/.test(x.text) || e.program.id === 'cosmos' || own, `a chat states a figure: ${x.text}`);
      });
      if (e.program.id === 'world-now') {
        assert.ok(!e.segments.some((x) => x.type !== 'chat' && /\?/.test(x.text)), 'WORLD NOW: no question marks outside chats');
        assert.ok(!stories.some((x) => x.emotion === 'happy' && x.feature !== 'lighter'), 'WORLD NOW: no smiles outside And finally');
        assert.ok(e.segments.filter((x) => /\bThanks, \w+\./.test(x.text)).length <= 1);
      }
      if (e.program.id === 'news-60') assert.equal(e.segments[0].text, "This is NEWS IN 60. I'm Sam Night.");
    }
  });
});
