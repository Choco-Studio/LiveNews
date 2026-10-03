// Editorial-2 fix round 2 (critics r2): what aired broken on the offline
// channel, and the accuracy checks that dropped good broadcast copy. Each case
// here is one that reached the screen or the voice in a 28-slot rotation.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeBulletin, trimClause } from '../server/writer.js';
import { inventedClaim, leansOnPrevious, numbersGrounded } from '../server/facts.js';
import { createMockProvider } from '../server/providers/mock.js';
import { loadChannel } from '../server/channel.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const channel = loadChannel(path.join(ROOT, 'config', 'channel.json'));
const programOf = (id) => ({ id, ...channel.programs[id] });

const FOOTPRINTS = {
  id: 's0000000014',
  title: 'Ancient footprints found on a beach in Wales',
  summary:
    'Storms have uncovered footprints left on a beach in Wales about 7,000 years ago. Researchers say adults and children walked there together. The prints are preserved in a layer of hardened mud that is usually covered by sand.',
  source: 'Starfield Journal',
  category: 'science',
  link: 'https://fixtures.globit.invalid/science/14',
  published: Date.now(),
};
const REEF = {
  id: 's0000000011',
  title: 'Coral reef off Queensland shows signs of recovery',
  summary:
    'Scientists surveying a section of reef off Queensland, Australia, say coral cover has increased for the third year in a row. The survey team says fast-growing branching corals account for most of the gain. Marine heatwaves remain the main threat to the reef.',
  source: 'Starfield Journal',
  category: 'science',
  link: 'https://fixtures.globit.invalid/science/11',
  published: Date.now(),
};
const QUAKE = {
  id: 's0000000002',
  title: 'Earthquake hits southern Turkey, 12 killed',
  summary: 'An earthquake of magnitude 6.1 hit southern Turkey, killing 12 people, officials say. Rescue teams are searching collapsed buildings.',
  source: 'Channel 4 News',
  category: 'world',
  link: 'https://x.test/quake',
  published: Date.now(),
};

const storiesOf = (out) => out.segments.filter((s) => s.type === 'story');
const bulletin = (story, text, program = programOf('news-60')) =>
  normalizeBulletin({ segments: [{ type: 'intro', text: 'This is the news.' }, { type: 'story', storyId: story.id, text }, { type: 'outro', text: 'Goodbye.' }] }, [story, QUAKE.id === story.id ? FOOTPRINTS : QUAKE], { program, solo: true });

describe('fix r2: sentences that aired broken', () => {
  test('trimClause never cuts between a place and its country, nor after an adverb, nor leaves a verbless head', () => {
    // "Scientists surveying a section of reef off Queensland, Australia." has no verb: no cut at all
    assert.equal(trimClause(REEF.summary.split('. ')[0], 18, 6), null);
    const comet = 'A comet discovered last year will pass close to Earth this week and should be visible with binoculars just after sunset.';
    const cut = trimClause(comet, 20, 6);
    assert.ok(cut && !/\bjust\.$/.test(cut), cut);
    assert.equal(cut, 'A comet discovered last year will pass close to Earth this week.');
    // an attribution keeps the verb of what it reports ("Officials said the old bridge over the river." is not a sentence)
    assert.equal(trimClause('Officials said the old bridge over the river, which opened in 1960, will close for repairs next month.', 12, 6), null);
    // a relative clause stays whole when the main clause is kept
    assert.equal(trimClause('The museum, which opened in 1960, will close for repairs next month after a flood damaged its basement.', 12, 6), 'The museum, which opened in 1960, will close for repairs next month.');
  });

  test('a story never airs on what is left after its opener was dropped', () => {
    // the writer's first sentence names a place the source does not: it goes, and the outlet's own opener comes back
    const out = bulletin(FOOTPRINTS, 'In France, storms have uncovered footprints on a beach. Researchers say adults and children walked there together.');
    const text = storiesOf(out)[0].text;
    assert.match(text, /^Storms have uncovered footprints left on a beach in Wales/);
    assert.match(text, /walked there together/);
    // a writer that opens on a sentence leaning on nothing gets the source's opener in front
    const lean = storiesOf(bulletin(FOOTPRINTS, 'Researchers say adults and children walked there together.'))[0].text;
    assert.match(lean, /^Storms have uncovered/);
    // a grave story reduced to its colour line gets its news back
    const grave = storiesOf(bulletin(QUAKE, 'A cyberattack caused an earthquake in southern Turkey. Rescue teams are searching collapsed buildings.', programOf('world-now')))[0].text;
    assert.match(grave, /^An earthquake of magnitude 6\.1 hit southern Turkey/);
    assert.ok(!/cyberattack/.test(grave));
  });

  test('"there" pointing back at a place leans on the sentence before; the existential one does not', () => {
    assert.equal(leansOnPrevious('Researchers say adults and children walked there together.'), true);
    assert.equal(leansOnPrevious('There are about 30 ships waiting to cross.'), false);
    assert.equal(leansOnPrevious('Rangers say there is hope for the species.'), false);
  });

  test('the offline writer fronts the source’s own place, never a parent country the source does not name', async () => {
    const mock = createMockProvider();
    const program = programOf('news-60');
    const presenters = { A: { id: 'sam', ...channel.presenters.sam } };
    const { text } = await mock.generate({ stage: 'write', stories: [FOOTPRINTS, REEF, QUAKE], channelName: channel.name, program, presenters, count: 3, now: new Date('2026-10-03T10:00:00Z') });
    const ep = JSON.parse(text);
    const fp = ep.segments.find((s) => s.storyId === FOOTPRINTS.id);
    assert.ok(fp, 'the footprints story airs');
    assert.ok(!/United Kingdom/.test(fp.text), fp.text);
    assert.equal(inventedClaim('In the United Kingdom, storms have uncovered footprints in Wales.', `${FOOTPRINTS.title}. ${FOOTPRINTS.summary}`), null, 'the country of a named place is no invented name');
    assert.match(inventedClaim('In France, storms have uncovered footprints.', `${FOOTPRINTS.title}. ${FOOTPRINTS.summary}`) || '', /place/);
  });
});

describe('fix r2: the figure check reads broadcast copy', () => {
  const src = 'An earthquake of magnitude 6.1 hit southern Turkey on Monday.';
  test('a verb after a figure counts nothing; quake ~ earthquake', () => {
    for (const ok of [
      'An earthquake of magnitude 6.1 has hit southern Turkey.',
      'An earthquake of magnitude 6.1 was felt in southern Turkey.',
      'An earthquake of magnitude 6.1 struck southern Turkey.',
      'A 6.1 magnitude earthquake has hit southern Turkey.',
      'A 6.1 quake hit southern Turkey.',
    ])
      assert.equal(numbersGrounded(ok, src, { words: true }), true, ok);
    for (const bad of ['A 6.1 storm hit southern Turkey.', 'An earthquake of magnitude 6.4 hit southern Turkey.', '6.1 people died in southern Turkey.'])
      assert.equal(numbersGrounded(bad, src, { words: true }), false, bad);
    // the counted thing still has to agree when both name one
    assert.equal(numbersGrounded('120 people were moved.', 'Officials opened 120 relief camps for 3,000 people.', { words: true }), false);
  });
});

describe('fix r2: fixtures', () => {
  test('the slate names its central bank', () => {
    const xml = fs.readFileSync(path.join(ROOT, 'config', 'fixtures', 'business.xml'), 'utf8');
    assert.ok(!/<description>The central bank has kept/.test(xml), 'which central bank?');
  });
});

// ---------------------------------------------------------------- hostile and broken feeds (critic 2)

import { NewsDesk, parseFeed } from '../server/news.js';
import { cleanCredit, CREDIT_MAX } from '../server/pictures.js';
import { CREDIT_LINE_MAX, SOURCE_MAX, creditLine, sourceWithCredit } from '../server/producer.js';
import { behindProxy } from '../server/net.js';
import { isGrave, notForFeatures } from '../server/facts.js';

const quiet = { info() {}, warn() {}, error() {} };
const rss = (items) => `<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>t</title>${items.join('')}</channel></rss>`;
const TOPICS = ['harbour', 'library', 'bridge', 'museum', 'orchard', 'stadium'];
const item = (n, extra = '', date = '') => `<item><title>Story about the ${TOPICS[n % TOPICS.length]} number ${n}</title><link>https://feed.test/${n}</link><description>Summary of story ${n}, long enough to be a real summary.</description>${date ? `<pubDate>${date}</pubDate>` : ''}${extra}</item>`;

describe('fix r2: a broken item never costs the feed', () => {
  test('a malformed escape in one picture URL drops at most that item, never the other four', () => {
    const xml = rss([item(1), item(2, '<enclosure url="https://cdn.test/prices-up-100%.jpg" type="image/jpeg"/>'), item(3, '<media:content url="https://cdn.test/50%-off.jpg" medium="image"/>'), item(4), item(5)]);
    const stories = parseFeed(xml, { name: 'Bad Escapes', category: 'world' }, { log: quiet });
    assert.ok(stories.length >= 4, `${stories.length} stories`);
    assert.ok(stories.some((s) => s.title.endsWith('number 1')) && stories.some((s) => s.title.endsWith('number 5')));
  });

  test('a date in the future is never later than now; more than a day ahead it counts as undated', () => {
    const now = Date.parse('2026-10-03T04:00:00Z');
    const xml = rss([item(1, '', 'Fri, 01 Jan 2100 00:00:00 GMT'), item(2, '', new Date(now + 3600_000).toUTCString()), item(3, '', new Date(now - 3600_000).toUTCString())]);
    const [far, soon, past] = parseFeed(xml, { name: 'Clock', category: 'world' }, { now });
    assert.ok(far.published <= now && far.undated, 'the year 2100 is a broken clock: undated');
    assert.equal(soon.published, now, 'an hour ahead: clamped to now');
    assert.equal(past.published, now - 3600_000);
  });

  test('undated items of a feed that still lists them never age out all at once (the offline slate after 36 h)', async () => {
    const desk = new NewsDesk({ log: quiet, fetchImpl: async () => { throw new Error('no network'); } });
    const xml = rss([item(1), item(2), item(3)]);
    desk.loadFeeds = () => [{ name: 'Local', url: 'https://feed.test/rss', category: 'world' }];
    desk.readFeed = async () => xml;
    const realNow = Date.now;
    try {
      await desk.refresh();
      assert.equal(desk.stories.size, 3);
      const start = realNow();
      Date.now = () => start + 37 * 3600_000;
      await desk.refresh();
      assert.equal(desk.stories.size, 3, 'still on the desk 37 hours later');
    } finally {
      Date.now = realNow;
    }
  });

  test('three reports of one developing story keep their shared lead photo; a card on unrelated items goes', () => {
    const desk = new NewsDesk({ log: quiet });
    const mk = (n, title, image) => ({ id: `s${n}`, title, summary: '', source: 'Herald', category: 'world', image, published: Date.now() });
    const live = [mk(1, 'Storm Ana hits Lisbon coast', 'https://cdn.test/ana.jpg'), mk(2, 'Storm Ana: Lisbon ferries cancelled', 'https://cdn.test/ana.jpg'), mk(3, 'Storm Ana leaves Lisbon without power', 'https://cdn.test/ana.jpg')];
    desk.dropPlaceholders(live);
    assert.ok(live.every((s) => s.image === 'https://cdn.test/ana.jpg'), 'one event, one lead photo');
    const card = [mk(4, 'Lisbon opens tram line', 'https://cdn.test/card.jpg'), mk(5, 'Tokyo stocks close higher', 'https://cdn.test/card.jpg'), mk(6, 'Cairo museum opens wing', 'https://cdn.test/card.jpg')];
    desk.dropPlaceholders(card);
    assert.ok(card.every((s) => !s.image), 'a share card on three unrelated stories is no news picture');
  });

  test('a picture refused for what it is waits a day; a passing network error half an hour', () => {
    const desk = new NewsDesk({ log: quiet });
    const t0 = Date.now();
    const a = { id: 'a', title: 'A', image: 'https://cdn.test/a.jpg', source: 'X' };
    const b = { id: 'b', title: 'B', image: 'https://cdn.test/b.jpg', source: 'X' };
    desk.pictureFailed(a, { reason: 'HTTP 404', now: t0 });
    desk.pictureFailed(b, { reason: 'timeout', now: t0 });
    assert.equal(desk.failed('https://cdn.test/a.jpg', t0 + 3600_000), true);
    assert.equal(desk.failed('https://cdn.test/b.jpg', t0 + 3600_000), false, 'tried again after half an hour');
    assert.equal(desk.failed('https://cdn.test/a.jpg', t0 + 25 * 3600_000), false);
  });
});

describe('fix r2: credits on air', () => {
  test('the stop-gap credit always fits the source plate whole; the credit line is ready to draw', () => {
    assert.equal(sourceWithCredit('Bitport Herald', 'Ledger Line'), 'Bitport Herald / Photo: Ledger Line');
    assert.equal(sourceWithCredit('The Guardian', 'Getty Images/AFP via Getty Images'), 'The Guardian / Photo: Getty Images');
    assert.equal(sourceWithCredit('Pixelburg Post', 'Pixel Wire Agency'), 'Pixelburg Post / Photo: Pixel Wire');
    assert.equal(sourceWithCredit('The Washington Post', 'Associated Press'), 'The Washington Post', 'no room: the credit stays in imageCredit');
    assert.equal(sourceWithCredit('Ledger Line', 'Ledger Line'), 'Ledger Line', 'an outlet’s own picture');
    for (const [o, c] of [['Al Jazeera English', 'Reuters'], ['Starfield Journal', 'Ana Ruiz/Galápagos Trust'], ['Channel 4 News', 'PA Media']]) assert.ok(sourceWithCredit(o, c).length <= SOURCE_MAX);
    assert.equal(creditLine('Pixel Wire Agency'), 'PHOTO: PIXEL WIRE AGENCY');
    assert.ok(creditLine('Getty Images/AFP via Getty Images').length <= CREDIT_LINE_MAX);
  });

  test('a credit is cleaned like on-air text: no emoji, cue tokens, bidi isolates; at most 40 characters', () => {
    assert.equal(cleanCredit('📸 Jane Doe'), 'Jane Doe');
    assert.equal(cleanCredit('[wave] Bob Smith'), 'Bob Smith');
    assert.equal(cleanCredit('⁦Ana Ruiz⁩'), 'Ana Ruiz');
    const long = cleanCredit('Photograph: Somebody With A Very Long Name Indeed For A Credit Line');
    assert.ok(long.length <= CREDIT_MAX, `${long.length}`);
  });
});

describe('fix r2: tone of the features', () => {
  test('storm damage is grave; a harmless quake, a closure or job losses are never a feature number', () => {
    assert.equal(isGrave('Storm damage across coast'), true);
    assert.equal(notForFeatures('Moderate earthquake shakes northern Chile, no damage reported. The quake had a magnitude of 5.8.'), true);
    assert.equal(notForFeatures('Carmaker to close Turin plant, putting 2,400 jobs at risk'), true);
    assert.equal(notForFeatures('Airline orders 100 new fuel-efficient jets'), false);
  });

  test('the proxy only counts when fetch really uses it (NODE_USE_ENV_PROXY)', () => {
    const saved = { p: process.env.HTTPS_PROXY, u: process.env.NODE_USE_ENV_PROXY };
    try {
      process.env.HTTPS_PROXY = 'http://proxy.test:3128';
      delete process.env.NODE_USE_ENV_PROXY;
      assert.equal(behindProxy(), false);
      process.env.NODE_USE_ENV_PROXY = '1';
      assert.equal(behindProxy(), true);
    } finally {
      if (saved.p === undefined) delete process.env.HTTPS_PROXY;
      else process.env.HTTPS_PROXY = saved.p;
      if (saved.u === undefined) delete process.env.NODE_USE_ENV_PROXY;
      else process.env.NODE_USE_ENV_PROXY = saved.u;
    }
  });
});
