// Server hardening (editorial-2 fix round 1, the critics' probes): pictures are
// verified before air (a failing one is replaced by a cluster mate's), the file
// name gates keep real news slugs, a hostile feed cannot flood the desk or stall
// the event loop, feed text is cleaned for the voice and the strap, and the
// public status says what failed without paths or internals.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { NewsDesk, parseFeed, MAX_FEED_ITEMS, onAirText } from '../server/news.js';
import { Producer } from '../server/producer.js';
import { ImageCache } from '../server/images.js';
import { rejectReason, pageCandidates, feedCandidates } from '../server/pictures.js';
import { publicError } from '../server/usage.js';

const quiet = { info() {}, warn() {}, error() {} };
const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];
const pngOf = (w, h) => {
  const b = Buffer.alloc(64);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
};
const story = (id, source, title, extra = {}) => ({ id, title, summary: 'x'.repeat(100), link: `https://news.test/${id}`, source, category: 'world', weight: 1, published: Date.now(), image: null, ...extra });

describe('pictures are verified before air', () => {
  test('a picture that fails to download is dropped and a cluster mate\'s stands in; a picture too small is dropped too', async () => {
    const d = new NewsDesk({ log: quiet, fetchImpl: async () => { throw new Error('no network'); } });
    const a = story('a', 'Alpha', 'Storm closes ports along the coast of Portugal', { image: 'https://img.test/broken.jpg', imageWidth: 1200 });
    const b = story('b', 'Beta', 'Storm closes ports along the northern coast of Portugal', { image: 'https://img.test/good.png', imageWidth: 1000 });
    const c = story('c', 'Gamma', 'Museum opens a new wing in Lisbon', { image: 'https://img.test/tiny.png', imageWidth: 800 });
    for (const s of [a, b, c]) d.stories.set(s.id, s);
    const bodies = { 'https://img.test/good.png': pngOf(1000, 560), 'https://img.test/tiny.png': pngOf(120, 80) };
    const fetchImpl = async (url) => (bodies[url] ? new Response(bodies[url], { headers: { 'content-type': 'image/png' } }) : new Response('gone', { status: 404 }));
    const images = new ImageCache({ fetchImpl, lookup: publicLookup, log: quiet });
    const producer = new Producer({ config: { pictureVerifyMs: 5000 }, newsDesk: d, chain: null, images, log: quiet });
    const note = await producer.verifyPictures([a, c]);
    assert.equal(a.image, 'https://img.test/good.png', 'the other outlet\'s picture of the same event stands in');
    assert.equal(a.imageCredit, 'Beta');
    assert.equal(c.image, null, 'a 120 px picture never airs');
    assert.ok(note.dropped >= 2);
    assert.equal(note.verified, 1);
  });

  test('the verification has a budget: a picture still downloading keeps its place', async () => {
    const d = new NewsDesk({ log: quiet, fetchImpl: async () => { throw new Error('no network'); } });
    const s = story('s', 'Alpha', 'Slow picture', { image: 'https://img.test/slow.png', imageWidth: 1200 });
    d.stories.set(s.id, s);
    const fetchImpl = (url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
    const images = new ImageCache({ fetchImpl, lookup: publicLookup, log: quiet });
    const producer = new Producer({ config: { pictureVerifyMs: 50 }, newsDesk: d, chain: null, images, log: quiet });
    const t0 = Date.now();
    await producer.verifyPictures([s]);
    assert.ok(Date.now() - t0 < 2000);
    assert.equal(s.image, 'https://img.test/slow.png');
  });
});

describe('file name gates', () => {
  test('news slugs with ordinary words stay; logos, placeholders and bare generic names go', () => {
    for (const name of ['missing-hiker-found-alive.jpg', 'avatar-3-box-office-record.jpg', 'icon-of-the-seas-docks-in-miami.jpg', 'generic-view-of-parliament.jpg', 'badge-police-chief.jpg', 'photo.jpg', 'image-1200.jpg']) {
      assert.equal(rejectReason(`https://cdn.test/2026/10/${name}`), null, name);
    }
    for (const name of ['default.jpg', 'icon-512.png', 'avatar_2.jpg', 'site-logo-dark.png', 'placeholder_16x9.jpg', 'default-share.jpg', 'user.png']) {
      assert.equal(rejectReason(`https://cdn.test/2026/10/${name}`), 'logo', name);
    }
    assert.equal(rejectReason('https://cdn.test/logos/outlet.png'), 'logo');
  });
});

describe('hostile feeds and pages', () => {
  test('a feed of 12,000 items brings at most MAX_FEED_ITEMS stories, and the desk counts outlets fast', () => {
    const item = (i) => `<item><title>Story ${i} about the topic number ${i % 997}</title><link>https://a.test/${i}</link><description>Summary ${i}</description></item>`;
    const xml = `<rss><channel>${Array.from({ length: 12000 }, (_, i) => item(i)).join('')}</channel></rss>`;
    const stories = parseFeed(xml, { name: 'Flood' });
    assert.equal(stories.length, MAX_FEED_ITEMS);
    const d = new NewsDesk({ log: quiet });
    for (let i = 0; i < 3000; i++) d.stories.set(`s${i}`, story(`s${i}`, `Outlet ${i % 9}`, `Headline ${i} on subject ${i % 211} and theme ${i % 97}`));
    // (fix r2) counted, not timed: on a loaded machine the clock says nothing; the number of same-event tests
    // says whether the desk compares each story with a few candidates (keyword index) or with the whole desk
    d.updateTrending();
    assert.ok(d.comparisons < 3000 * 20, `trending ran ${d.comparisons} same-event tests for 3000 stories`);
    let calls = 0;
    const sameStory = d.sameStory.bind(d);
    d.sameStory = (a, b) => (calls++, sameStory(a, b));
    for (const s of [...d.stories.values()].slice(0, 1500)) s.image = `https://cdn.test/${s.id}.jpg`;
    d.borrowPictures();
    assert.ok(calls < 3000 * 20, `lending ran ${calls} same-event tests for 1500 stories without a picture`);
    d.markCovered([...d.stories.keys()].slice(0, 10));
    assert.ok(calls < 3000 * 21, 'covering an episode compares its stories with their candidates only');
  });

  test('a page of unclosed <meta / <link / <img tags is scanned in one linear pass', () => {
    for (const junk of ['<meta ', '<link ', '<img ']) {
      const t0 = Date.now();
      pageCandidates(junk.repeat(130_000), 'https://a.test/');
      feedCandidates({ description: junk.repeat(40_000) });
      assert.ok(Date.now() - t0 < 500, `${junk}: ${Date.now() - t0} ms`);
    }
  });

  test('control, bidi and zero-width characters, emoji and cue tokens never reach the strap or the voice', () => {
    assert.equal(onAirText('Storm ‮hits​ coast \u0007[wave] 🔥🔥 now'), 'Storm hits coast now');
    const xml = '<rss><channel><item><title>🔥🔥🔥</title><link>https://a.test/1</link></item><item><title>Bell rings [nod]</title><link>https://a.test/2</link><description>Real text 🔥.</description></item></channel></rss>';
    const stories = parseFeed(xml, { name: 'A' });
    assert.deepEqual(stories.map((s) => [s.title, s.summary]), [['Bell rings', 'Real text .']]);
  });
});

describe('public status', () => {
  test('errors say what kind of failure, never a path or a program\'s internals', () => {
    assert.equal(publicError("ENOENT: no such file or directory, open '/home/user/LiveNews/config/x.xml'"), 'internal error');
    assert.equal(publicError("Cannot read properties of undefined (reading 'x')"), 'internal error');
    assert.equal(publicError('HTTP 429'), 'HTTP 429');
    assert.equal(publicError('quota exceeded for the month'), 'quota exceeded for the month');
  });
});
