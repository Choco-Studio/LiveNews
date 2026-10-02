// Picture desk: every discovery path (feed media variants, srcset, article
// pages, AMP, CDN upgrades), the quality gates, the same-event cluster that
// lends a picture to another outlet's report (with its credit), and the
// producer stamping hasImage / imageCredit on what goes on air.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NewsDesk, parseFeed } from '../server/news.js';
import { Producer, planVisuals } from '../server/producer.js';
import {
  GOOD_WIDTH,
  feedCandidates,
  imageSize,
  largestSrcset,
  pageCandidates,
  rankPictures,
  rejectReason,
  resolveRef,
  sizeFromUrl,
  upgradeUrl,
} from '../server/pictures.js';

// ---------------------------------------------------------------- helpers

const quiet = { info() {}, warn() {}, error() {} };
const FEED = { name: 'Wire', category: 'world' };
// Public DNS answer for every host: the private-address guard lets the fake fetch through.
const publicDns = async () => [{ address: '93.184.216.34', family: 4 }];

const rss = (...items) =>
  `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel><title>t</title>${items.join('')}</channel></rss>`;
const item = (title, link, extra = '', description = 'Some text about it.') => `<item><title>${title}</title><link>${link}</link><description>${description}</description>${extra}</item>`;
const one = (extra, description) => parseFeed(rss(item('A picture story', 'https://news.test/a', extra, description)), FEED)[0];

/** Fake fetch over a url -> html/status table; remembers what was asked. */
function routes(table) {
  const asked = [];
  const fetchImpl = async (url) => {
    asked.push(url);
    const spec = table[url];
    if (typeof spec === 'number') return new Response('x', { status: spec });
    if (typeof spec === 'string') return new Response(spec, { status: 200, headers: { 'content-type': 'text/html' } });
    return new Response('not found', { status: 404 });
  };
  fetchImpl.asked = asked;
  return fetchImpl;
}
const noNetwork = async (url) => {
  throw new Error(`unexpected request to ${url}`);
};
const page = (head) => `<!doctype html><html><head><title>x</title>${head}</head><body><p>Body</p></body></html>`;

let n = 0;
/** A desk story; titles share words only when a test wants two reports of one event. */
function story(source, title, extra = {}) {
  n++;
  return { id: `s${String(n).padStart(10, '0')}`, title, summary: 'A summary long enough to count as real substance for the desk ranking here.', link: `https://${source.toLowerCase().replace(/\W/g, '')}.test/${n}`, source, category: 'world', weight: 1, published: Date.now() - n * 1000, image: null, ...extra };
}
function desk(stories = [], fetchImpl = noNetwork) {
  const d = new NewsDesk({ log: quiet, fetchImpl, lookup: publicDns });
  for (const s of stories) d.stories.set(s.id, s);
  return d;
}

// ---------------------------------------------------------------- feed items

describe('pictures: what a feed item offers', () => {
  test('media:group: the widest rendition first, the others kept as fallbacks', () => {
    const s = one('<media:group><media:content url="https://cdn.test/a-320.jpg" width="320" height="180" medium="image"/><media:content url="https://cdn.test/a-1280.jpg" width="1280" height="720" medium="image"/></media:group>');
    assert.equal(s.image, 'https://cdn.test/a-1280.jpg');
    assert.equal(s.imageWidth, 1280);
    assert.equal(s.imageVia, 'feed:media');
    assert.deepEqual(s.images, ['https://cdn.test/a-1280.jpg', 'https://cdn.test/a-320.jpg']);
  });

  test('several media:content tags: the largest width wins whatever the order', () => {
    const s = one('<media:content url="https://cdn.test/big.jpg" width="1024" medium="image"/><media:content url="https://cdn.test/mid.jpg" width="640" medium="image"/>');
    assert.equal(s.image, 'https://cdn.test/big.jpg');
  });

  test('media:thumbnail only: a known CDN thumbnail is upgraded, the original stays as the fallback', () => {
    const s = one('<media:thumbnail url="https://ichef.bbci.co.uk/ace/standard/240/cpsprodpb/abc/live/x.jpg" width="240" height="135"/>');
    assert.equal(s.image, 'https://ichef.bbci.co.uk/ace/standard/976/cpsprodpb/abc/live/x.jpg');
    assert.equal(s.imageVia, 'feed:thumbnail');
    assert.equal(s.images[1], 'https://ichef.bbci.co.uk/ace/standard/240/cpsprodpb/abc/live/x.jpg');
  });

  test('enclosures (RSS and Atom) with an image type', () => {
    assert.equal(one('<enclosure url="https://cdn.test/e.jpg" type="image/jpeg" length="1"/>').image, 'https://cdn.test/e.jpg');
    assert.equal(one('<enclosure url="https://cdn.test/talk.mp3" type="audio/mpeg" length="1"/>').image, null);
    const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom story</title><link href="https://news.test/atom"/><link rel="enclosure" type="image/jpeg" href="https://cdn.test/atom.jpg"/><summary>Text.</summary></entry></feed>`;
    assert.equal(parseFeed(atom, FEED)[0].image, 'https://cdn.test/atom.jpg');
  });

  test('inline HTML: the largest srcset candidate, lazy-load attributes, relative src against the link', () => {
    const s = one('', '<![CDATA[<p><img src="https://cdn.test/s-300.jpg" srcset="https://cdn.test/s-300.jpg 300w, https://cdn.test/s-1200.jpg 1200w" width="300"></p><p>Text.</p>]]>');
    assert.equal(s.image, 'https://cdn.test/s-1200.jpg');
    assert.equal(s.imageVia, 'feed:inline');
    assert.equal(one('', '<![CDATA[<img data-src="https://cdn.test/lazy.jpg" src="data:image/gif;base64,R0lGOD" width="800">]]>').image, 'https://cdn.test/lazy.jpg');
    assert.equal(one('', '<![CDATA[<img src="/media/rel.jpg" width="900">]]>').image, 'https://news.test/media/rel.jpg');
    assert.deepEqual(largestSrcset('a.jpg 1x, b.jpg 2x'), { url: 'b.jpg', w: 800 });
  });

  test('a video item still offers its poster frame (media:thumbnail inside media:content)', () => {
    const s = one('<media:content url="https://cdn.test/v.mp4" medium="video"><media:thumbnail url="https://cdn.test/poster.jpg" width="960" height="540"/></media:content>');
    assert.equal(s.image, 'https://cdn.test/poster.jpg');
  });

  test('itunes:image and content:encoded are read too', () => {
    assert.equal(one('<itunes:image href="https://cdn.test/cover-photo.jpg"/>').image, 'https://cdn.test/cover-photo.jpg');
    assert.equal(one('<content:encoded><![CDATA[<figure><img src="https://cdn.test/fig.jpg" width="1000"></figure>]]></content:encoded>').image, 'https://cdn.test/fig.jpg');
  });

  test('a remote feed never yields a file:, data: or javascript: picture, nor a relative one without a page URL', () => {
    for (const bad of ['file:///etc/passwd.png', 'javascript:alert(1)', 'data:image/png;base64,AAAA', 'img/local.png']) {
      const cands = feedCandidates({ 'media:content': { '@_url': bad, '@_medium': 'image' } });
      assert.deepEqual(cands, [], bad);
    }
    assert.equal(one('<media:content url="file:///etc/x.png" medium="image"/>').image, null);
  });
});

// ---------------------------------------------------------------- article pages

describe('pictures: what an article page declares', () => {
  test('og:image with its width, twitter:image, image_src, itemprop and JSON-LD (an @id into @graph)', () => {
    const html = page(`
      <meta property="og:image" content="https://cdn.test/og.jpg"><meta property="og:image:width" content="1200">
      <meta name="twitter:image" content="https://cdn.test/tw.jpg">
      <link rel="image_src" href="/rel.jpg">
      <meta itemprop="image" content="https://cdn.test/item.jpg">
      <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"NewsArticle","image":{"@id":"https://n.test/#img"}},{"@type":"ImageObject","@id":"https://n.test/#img","url":"https://cdn.test/ld.jpg","width":1600,"height":900}]}</script>`);
    const { candidates } = pageCandidates(html, 'https://n.test/a/b');
    const byVia = Object.fromEntries(candidates.map((c) => [c.via, c]));
    assert.equal(byVia.og.url, 'https://cdn.test/og.jpg');
    assert.equal(byVia.og.w, 1200);
    assert.equal(byVia.twitter.url, 'https://cdn.test/tw.jpg');
    assert.equal(byVia.image_src.url, 'https://n.test/rel.jpg');
    assert.equal(byVia.itemprop.url, 'https://cdn.test/item.jpg');
    assert.deepEqual([byVia.jsonld.url, byVia.jsonld.w], ['https://cdn.test/ld.jpg', 1600]);
    // the JSON-LD picture (1600 px) ranks first
    assert.equal(rankPictures(candidates)[0].url, 'https://cdn.test/ld.jpg');
  });

  test('JSON-LD image as a plain URL, a list, an ImageObject, or thumbnailUrl; other types are ignored', () => {
    const ld = (obj) => pageCandidates(page(`<script type="application/ld+json">${JSON.stringify(obj)}</script>`), 'https://n.test/x').candidates.map((c) => c.url);
    assert.deepEqual(ld({ '@type': 'NewsArticle', image: 'https://cdn.test/1.jpg' }), ['https://cdn.test/1.jpg']);
    assert.deepEqual(ld({ '@type': 'Article', image: ['https://cdn.test/2.jpg', 'https://cdn.test/3.jpg'] }), ['https://cdn.test/2.jpg', 'https://cdn.test/3.jpg']);
    assert.deepEqual(ld({ '@type': ['ReportageNewsArticle'], image: { '@type': 'ImageObject', url: 'https://cdn.test/4.jpg', width: { value: 1400 } } }), ['https://cdn.test/4.jpg']);
    assert.deepEqual(ld({ '@type': 'NewsArticle', thumbnailUrl: 'https://cdn.test/5.jpg' }), ['https://cdn.test/5.jpg']);
    assert.deepEqual(ld({ '@type': 'Organization', logo: 'https://cdn.test/logo.png', image: 'https://cdn.test/org.jpg' }), []);
  });

  test('broken JSON-LD and junk markup are survived', () => {
    const { candidates } = pageCandidates(page('<script type="application/ld+json">{ not json </script><meta property="og:image" content="https://cdn.test/ok.jpg">'), 'https://n.test/x');
    assert.deepEqual(candidates.map((c) => c.url), ['https://cdn.test/ok.jpg']);
    assert.deepEqual(pageCandidates('<'.repeat(50_000), 'https://n.test/x').candidates, []);
  });

  test('a page with no picture names its AMP version, which is read next', () => {
    const { candidates, amp } = pageCandidates(page('<link rel="amphtml" href="/amp/b">'), 'https://n.test/a/b');
    assert.deepEqual(candidates, []);
    assert.equal(amp, 'https://n.test/amp/b');
  });

  test('local fixture pages resolve relative pictures inside the feed folder only', () => {
    const dir = path.join(os.tmpdir(), 'fixture-feeds');
    const html = page('<meta property="og:image" content="../img/scene.png"><meta name="twitter:image" content="../../outside.png">');
    const { candidates } = pageCandidates(html, null, { baseDir: dir, from: path.join(dir, 'articles') });
    assert.deepEqual(candidates.map((c) => [fileURLToPath(c.url), c.local]), [[path.join(dir, 'img', 'scene.png'), true]]);
    assert.equal(resolveRef('/etc/x.png', { baseDir: dir }), null);
    assert.equal(resolveRef('https://cdn.test/x.jpg', { baseDir: dir }).local, false);
  });
});

// ---------------------------------------------------------------- sizes, upgrades, gates

describe('pictures: sizes, safe upgrades and quality gates', () => {
  test('known CDN renditions are upgraded to a larger size; signed URLs are never touched', () => {
    const cases = [
      ['https://ichef.bbci.co.uk/news/240/cpsprodpb/1/x.jpg', 'https://ichef.bbci.co.uk/news/976/cpsprodpb/1/x.jpg'],
      ['https://media.npr.org/assets/img/x.jpg?s=600', 'https://media.npr.org/assets/img/x.jpg?s=1400'],
      ['https://e3.365dm.com/24/10/384x216/skynews-x.jpg', 'https://e3.365dm.com/24/10/768x432/skynews-x.jpg'],
      ['https://s.france24.com/media/display/a/w:320/p:16x9/x.jpg', 'https://s.france24.com/media/display/a/w:1024/p:16x9/x.jpg'],
      ['https://i.cbc.ca/1.1/16x9_460/x.jpg', 'https://i.cbc.ca/1.1/16x9_940/x.jpg'],
      ['https://res.cloudinary.com/x/image/upload/w_400,c_fill/y.jpg', 'https://res.cloudinary.com/x/image/upload/w_1200,c_fill/y.jpg'],
      ['https://site.test/wp-content/uploads/2026/10/pic-300x200.jpg', 'https://site.test/wp-content/uploads/2026/10/pic.jpg'],
      ['https://cdn.test/p.jpg?w=320&h=180', 'https://cdn.test/p.jpg?w=1200&h=675'],
    ];
    for (const [from, to] of cases) assert.equal(upgradeUrl(from)[0]?.url, to, from);
    assert.deepEqual(upgradeUrl('https://i.guim.co.uk/img/x/master/2000.jpg?width=460&quality=85&s=abc'), []);
    assert.deepEqual(upgradeUrl('https://cdn.test/p.jpg?w=320&signature=zz'), []);
    assert.deepEqual(upgradeUrl('https://ichef.bbci.co.uk/news/976/cpsprodpb/1/x.jpg'), [], 'already large');
    assert.deepEqual(sizeFromUrl('https://e3.365dm.com/24/10/768x432/a.jpg'), { w: 768, h: 432 });
  });

  test('logos, placeholders, icons, SVG/GIF, tracking pixels and odd sizes never air', () => {
    const bad = {
      'https://cdn.test/logo.png': 'logo',
      'https://cdn.test/img/placeholder.jpg': 'logo',
      'https://cdn.test/default-share.jpg': 'logo',
      'https://cdn.test/icons/a.png': 'logo',
      'https://cdn.test/brand/apple-touch-icon.png': 'logo',
      'https://cdn.test/a.svg': 'format',
      'https://cdn.test/anim.gif?x=1': 'format',
      'https://cdn.test/1x1.png': 'tracker',
      'https://cdn.test/t/pixel.png': 'tracker',
      'https://stats.wp.com/b.png': 'tracker',
      'https://ad.doubleclick.net/x.jpg': 'tracker',
      'ftp://cdn.test/a.jpg': 'scheme',
      'file:///etc/a.png': 'scheme',
    };
    for (const [url, why] of Object.entries(bad)) assert.equal(rejectReason(url), why, url);
    assert.equal(rejectReason('https://cdn.test/news/storm.jpg'), null);
    assert.equal(rejectReason('https://cdn.test/news/storm.jpg', { w: 150 }), 'small');
    assert.equal(rejectReason('https://cdn.test/news/storm.jpg', { w: 1200, h: 200 }), 'shape');
    assert.equal(rejectReason('https://cdn.test/news/storm.jpg', { w: 400, h: 1200 }), 'shape');
    assert.equal(rejectReason('file:///srv/feeds/img/a.png', { local: true }), null);
  });

  test('ranking: 640 px and wider first, upgrades ahead of their originals, duplicates once, at most five', () => {
    const list = rankPictures([
      { url: 'https://cdn.test/small.jpg', w: 400, via: 'media' },
      { url: 'https://cdn.test/wide.jpg', w: 1280, via: 'media' },
      { url: 'https://cdn.test/wide.jpg', w: 1280, via: 'og' },
      { url: 'https://cdn.test/logo.png', w: 1200, via: 'og' },
      { url: 'https://cdn.test/p.jpg?w=320&h=180', via: 'thumbnail' },
      { url: 'https://cdn.test/a.jpg', w: 700, via: 'og' },
      { url: 'https://cdn.test/b.jpg', w: 800, via: 'og' },
      { url: 'https://cdn.test/c.jpg', w: 900, via: 'og' },
    ]);
    assert.equal(list.length, 5);
    assert.equal(list[0].url, 'https://cdn.test/wide.jpg');
    assert.ok(list.every((c) => c.w >= GOOD_WIDTH));
    assert.ok(list.some((c) => c.upgraded && c.url === 'https://cdn.test/p.jpg?w=1200&h=675'));
    assert.ok(!list.some((c) => /logo|small/.test(c.url)));
  });

  test('imageSize reads PNG, GIF, WebP and JPEG headers', () => {
    const png = Buffer.alloc(32);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    png.writeUInt32BE(1280, 16);
    png.writeUInt32BE(720, 20);
    assert.deepEqual(imageSize(png), { w: 1280, h: 720 });
    const gif = Buffer.concat([Buffer.from('GIF89a', 'latin1'), Buffer.from([0x40, 0x01, 0xf0, 0x00]), Buffer.alloc(20)]);
    assert.deepEqual(imageSize(gif), { w: 320, h: 240 });
    const webp = Buffer.alloc(30);
    webp.write('RIFF', 0, 'latin1');
    webp.write('WEBP', 8, 'latin1');
    webp.write('VP8X', 12, 'latin1');
    webp.writeUIntLE(1023, 24, 3);
    webp.writeUIntLE(575, 27, 3);
    assert.deepEqual(imageSize(webp), { w: 1024, h: 576 });
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0xd0, 0x05, 0x00, 0x03, 0, 0, 0, 0, 0, 0]);
    assert.deepEqual(imageSize(jpeg), { w: 1280, h: 720 });
    assert.equal(imageSize(Buffer.from('not a picture at all, sorry')), null);
  });
});

// ---------------------------------------------------------------- the desk: placeholders, pages, the cluster

describe('pictures: the desk finds, filters and lends pictures', () => {
  test('one outlet putting the same picture on three unrelated items: a logo, dropped from all of them', async () => {
    const xml = rss(
      item('Rail strike halts trains', 'https://w.test/1', '<media:content url="https://cdn.test/share-card.jpg" width="1200" medium="image"/>'),
      item('Harvest festival opens', 'https://w.test/2', '<media:content url="https://cdn.test/share-card.jpg" width="1200" medium="image"/><media:content url="https://cdn.test/festival.jpg" width="900" medium="image"/>'),
      item('Port reopens after storm', 'https://w.test/3', '<media:content url="https://cdn.test/share-card.jpg" width="1200" medium="image"/>')
    );
    const d = desk([], noNetwork);
    d.loadFeeds = () => [{ name: 'Wire', url: 'https://w.test/rss', category: 'world' }];
    d.readFeed = async () => xml;
    await d.refresh();
    const byTitle = Object.fromEntries([...d.stories.values()].map((s) => [s.title, s]));
    assert.equal(byTitle['Rail strike halts trains'].image, null);
    assert.equal(byTitle['Harvest festival opens'].image, 'https://cdn.test/festival.jpg', 'falls back to its next picture');
    assert.ok(d.placeholders.has('https://cdn.test/share-card.jpg'));
  });

  test('a card that appears on more items later is also taken off stories already on the desk', async () => {
    const card = '<media:content url="https://cdn.test/card.jpg" width="1200" medium="image"/>';
    const d = desk([], noNetwork);
    d.loadFeeds = () => [{ name: 'Wire', url: 'https://w.test/rss', category: 'world' }];
    d.readFeed = async () => rss(item('Bridge opens to traffic', 'https://w.test/1', card));
    await d.refresh();
    assert.equal([...d.stories.values()][0].image, 'https://cdn.test/card.jpg');
    d.readFeed = async () => rss(item('Bridge opens to traffic', 'https://w.test/1', card), item('Museum wins award', 'https://w.test/2', card), item('Wheat prices climb', 'https://w.test/3', card));
    await d.refresh();
    assert.ok([...d.stories.values()].every((s) => !s.image));
  });

  test('a story with no picture finds its own on the article page (og:image), and says so', async () => {
    const s = story('Wire', 'Glacier retreat measured in the Alps');
    const fetchImpl = routes({ [s.link]: page('<meta property="og:image" content="https://cdn.test/glacier.jpg"><meta property="og:image:width" content="1600">') });
    const d = desk([s], fetchImpl);
    const out = await d.findPictures([s]);
    assert.equal(s.image, 'https://cdn.test/glacier.jpg');
    assert.equal(s.imageVia, 'page:og');
    assert.equal(s.imageWidth, 1600);
    assert.deepEqual(out, { pictures: 1, of: 1, found: 1, borrowed: 0 });
  });

  test('a small feed picture (< 640 px) is replaced by the page picture when that is wider', async () => {
    const s = story('Wire', 'Ferry service resumes', { image: 'https://cdn.test/ferry-320.jpg', imageWidth: 320 });
    const fetchImpl = routes({ [s.link]: page('<script type="application/ld+json">{"@type":"NewsArticle","image":{"url":"https://cdn.test/ferry-1400.jpg","width":1400}}</script>') });
    await desk([s], fetchImpl).findPictures([s]);
    assert.equal(s.image, 'https://cdn.test/ferry-1400.jpg');
    assert.equal(s.imageVia, 'page:jsonld');
    assert.ok(s.images.includes('https://cdn.test/ferry-320.jpg'), 'the feed picture stays as a fallback');
  });

  test('the AMP page is read when the article page names no picture', async () => {
    const s = story('Wire', 'Wind farm opens offshore');
    const fetchImpl = routes({
      [s.link]: page(`<link rel="amphtml" href="${s.link}/amp">`),
      [`${s.link}/amp`]: page('<meta property="og:image" content="https://cdn.test/wind-amp.jpg">'),
    });
    await desk([s], fetchImpl).resolveImage(s);
    assert.equal(s.image, 'https://cdn.test/wind-amp.jpg');
  });

  test('an outlet whose pages all share one og:image (a generic share card) is caught across stories', async () => {
    const a = story('Wire', 'Court backs cruise ship limit');
    const b = story('Wire', 'Wheat harvest beats forecasts');
    const card = page('<meta property="og:image" content="https://cdn.test/wire-share.jpg">');
    const d = desk([a, b], routes({ [a.link]: card, [b.link]: card }));
    await d.resolveImage(a);
    await d.resolveImage(b);
    assert.equal(a.image, null);
    assert.equal(b.image, null);
    assert.ok(d.placeholders.has('https://cdn.test/wire-share.jpg'));
  });

  test('page fetches that fail leave the story without a picture, tried once only', async () => {
    const s = story('Wire', 'Tram line extended');
    const fetchImpl = routes({ [s.link]: 500 });
    const d = desk([s], fetchImpl);
    await d.findPictures([s]);
    await d.findPictures([s]);
    assert.equal(s.image, null);
    assert.equal(fetchImpl.asked.length, 1);
  });

  test('same-event cluster: a report without a picture borrows another outlet\'s, with the credit', async () => {
    const donor = story('Pixelburg Post', 'Volcano erupts again on Iceland peninsula', { image: 'https://cdn.test/volcano.jpg', imageWidth: 1280, imageVia: 'feed:media' });
    const borrower = story('Bitport Herald', 'Iceland volcano erupts again, lava lights the peninsula sky');
    const unrelated = story('Ledger Line', 'Oil prices slide as demand cools');
    const d = desk([donor, borrower, unrelated]);
    d.updateTrending();
    const out = await d.findPictures([borrower, unrelated]);
    assert.equal(borrower.image, 'https://cdn.test/volcano.jpg');
    assert.equal(borrower.imageCredit, 'Pixelburg Post');
    assert.equal(borrower.imageFrom, donor.id);
    assert.equal(borrower.imageVia, 'cluster');
    assert.equal(unrelated.image, null, 'a different event never gets that picture');
    assert.equal(out.borrowed, 1);
  });

  test('same-event cluster: another outlet\'s article page is read when no report has a feed picture, and lends it', async () => {
    const asked = story('Bitport Herald', 'Hurricane Elena cuts power to homes in Yucatan');
    const sibling = story('Pixelburg Post', 'Hurricane Elena makes landfall on Yucatan coast');
    const fetchImpl = routes({ [asked.link]: page('<title>no picture here</title>'), [sibling.link]: page('<meta property="og:image" content="https://cdn.test/elena.jpg"><meta property="og:image:width" content="1200">') });
    const d = desk([asked, sibling], fetchImpl);
    d.updateTrending();
    const out = await d.findPictures([asked]);
    assert.equal(sibling.image, 'https://cdn.test/elena.jpg', 'the sibling found its own picture');
    assert.equal(asked.image, 'https://cdn.test/elena.jpg');
    assert.equal(asked.imageCredit, 'Pixelburg Post');
    assert.equal(out.borrowed, 1);
    assert.deepEqual(fetchImpl.asked, [asked.link, sibling.link], 'its own page first, then the sibling\'s');
  });

  test('the cluster never lends across countries, from the same outlet, or from a weak keyword match', () => {
    const donor = story('Pixelburg Post', 'Tokyo stocks close at a record high', { image: 'https://cdn.test/tokyo.jpg', imageWidth: 1000 });
    const otherCountry = story('Ledger Line', 'New York stocks close at a record high');
    const sameOutlet = story('Pixelburg Post', 'Tokyo stocks close at record high again');
    const d = desk([donor, otherCountry, sameOutlet]);
    d.borrowPictures();
    assert.equal(otherCountry.image, null);
    assert.equal(sameOutlet.image, null);
  });

  test('the widest picture in the cluster is lent; a borrowed picture follows its donor when the donor loses it', () => {
    const small = story('Alpha', 'Panama Canal reopens after fog closure', { image: 'https://cdn.test/canal-600.jpg', imageWidth: 600 });
    const wide = story('Beta', 'Panama Canal reopens to ships after fog', { image: 'https://cdn.test/canal-1400.jpg', imageWidth: 1400 });
    const borrower = story('Gamma', 'Ships queue as Panama Canal reopens after fog');
    const d = desk([small, wide, borrower]);
    d.borrowPictures([borrower]);
    assert.equal(borrower.image, 'https://cdn.test/canal-1400.jpg');
    assert.equal(borrower.imageCredit, 'Beta');
    // The wide picture would not download: it is forgotten everywhere, the next donor stands in.
    assert.equal(d.pictureFailed(wide), true);
    d.borrowPictures([borrower]);
    assert.equal(borrower.image, 'https://cdn.test/canal-600.jpg');
    assert.equal(borrower.imageCredit, 'Alpha');
  });

  test('an own picture found on the article page replaces a borrowed one (and drops the credit)', async () => {
    const donor = story('Alpha', 'Storm closes ports along the coast', { image: 'https://cdn.test/storm.jpg', imageWidth: 1200 });
    const s = story('Beta', 'Storm closes ports along the northern coast');
    const d = desk([donor, s], routes({}));
    d.borrowPictures([s]);
    assert.equal(s.imageCredit, 'Alpha');
    d.fetch = routes({ [s.link]: page('<meta property="og:image" content="https://cdn.test/beta-storm.jpg"><meta property="og:image:width" content="1000">') });
    await d.findPictures([s]);
    assert.equal(s.image, 'https://cdn.test/beta-storm.jpg');
    assert.equal(s.imageCredit, undefined);
  });

  test('the same headline from two feeds: the kept report takes the other one\'s picture (a duplicate, credited)', async () => {
    const d = desk([], noNetwork);
    d.loadFeeds = () => [
      { name: 'Alpha', url: 'https://a.test/rss', category: 'world' },
      { name: 'Beta', url: 'https://b.test/rss', category: 'world' },
    ];
    d.readFeed = async (url) =>
      url.startsWith('https://a.test')
        ? rss(item('Venice raises its sea barriers in a test', 'https://a.test/1'))
        : rss(item('Venice raises its sea barriers in a test', 'https://b.test/1', '<media:content url="https://cdn.test/venice.jpg" width="1200" medium="image"/>'));
    await d.refresh();
    const kept = [...d.stories.values()];
    assert.equal(kept.length, 1);
    assert.equal(kept[0].image, 'https://cdn.test/venice.jpg');
    assert.equal(kept[0].imageCredit, 'Beta');
  });

  test('the desk view says where each picture came from', () => {
    const s = story('Beta', 'Iceland volcano lights the sky', { image: 'https://cdn.test/v.jpg', imageVia: 'cluster', imageCredit: 'Alpha' });
    const view = desk([s]).deskView();
    assert.equal(view[0].imageVia, 'cluster');
    assert.equal(view[0].imageCredit, 'Alpha');
  });

  test('offline fixtures: a local article page is read for its og:image, inside the feed folder only', async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ed2-fixture-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    fs.mkdirSync(path.join(dir, 'articles'));
    fs.mkdirSync(path.join(dir, 'img'));
    fs.writeFileSync(path.join(dir, 'articles', 'a.html'), page('<meta property="og:image" content="../img/a.png"><meta property="og:image:width" content="1280">'));
    fs.writeFileSync(path.join(dir, 'feed.xml'), rss(item('A local story with a page', 'articles/a.html'), item('A local story with an escaping page', '../outside.html')));
    const d = desk([], noNetwork);
    d.loadFeeds = () => [{ name: 'Local', url: pathToFileURL(path.join(dir, 'feed.xml')).href, category: 'world' }];
    await d.refresh();
    const [withPage, escaping] = ['A local story with a page', 'A local story with an escaping page'].map((title) => [...d.stories.values()].find((s) => s.title === title));
    assert.ok(withPage.page && !escaping.page);
    await d.findPictures([withPage, escaping]);
    assert.equal(fileURLToPath(withPage.image), path.join(dir, 'img', 'a.png'));
    assert.equal(withPage.imageVia, 'page:og');
    assert.equal(escaping.image, null);
  });
});

// ---------------------------------------------------------------- the producer puts them on air

describe('pictures: the producer stamps what airs', () => {
  test('hasImage and imageCredit on story segments and rundown items follow the desk after the picture stages', async () => {
    const own = story('Alpha', 'Lisbon opens a riverside tram line', { image: 'https://cdn.test/tram.jpg', imageWidth: 1200 });
    const borrowed = story('Beta', 'Iceland volcano erupts on the peninsula');
    const donor = story('Gamma', 'Volcano erupts on Iceland peninsula again', { image: 'https://cdn.test/volcano.jpg', imageWidth: 1280 });
    const none = story('Alpha', 'Central bank holds rates');
    const d = desk([own, borrowed, donor, none], routes({}));
    const segs = [own, borrowed, none].map((s) => ({ type: 'story', storyId: s.id, hasImage: false }));
    const ctx = { program: { id: 'world-now' }, episode: { storyIds: [own.id, borrowed.id, none.id], segments: [{ type: 'intro' }, ...segs, { type: 'outro' }], rundown: segs.map((x) => ({ storyId: x.storyId, hasImage: false })) } };
    const producer = new Producer({ config: { pictureBudgetMs: 500 }, newsDesk: d, chain: null, log: quiet });
    const note = await producer.assets(ctx);
    const [a, b, c] = ctx.episode.segments.slice(1, 4);
    assert.deepEqual([a.hasImage, b.hasImage, c.hasImage], [true, true, false]);
    assert.equal(b.imageCredit, 'Gamma');
    assert.equal(a.imageCredit, undefined, 'its own picture: the strap already names the outlet');
    assert.deepEqual(ctx.episode.rundown.map((r) => r.hasImage), [true, true, false]);
    assert.equal(ctx.episode.rundown[1].imageCredit, 'Gamma');
    assert.equal(note.images, 2);
    assert.equal(note.borrowed, 1);
  });

  test('visual hints: map, picture and figure in order, and a locator inset when the text is too short for both', () => {
    const seg = (extra) => ({ type: 'story', storyId: 's1', text: 'One. Two. Three.', ...extra });
    const loc = { place: 'LISBON, PORTUGAL', lat: 38.7, lon: -9.1 };
    const a = seg({ location: loc, hasImage: true, fact: '40,000 PASSENGERS A DAY' });
    planVisuals(a);
    assert.deepEqual(a.visuals, ['map', 'picture', 'fact']);
    assert.equal(a.locator, undefined, 'three sentences: a beat each for the map and the picture');
    const b = seg({ location: loc, hasImage: true, text: 'Lisbon has a new tram. It runs along the river.' });
    planVisuals(b);
    assert.equal(b.locator, true, 'two sentences: the picture full frame with a locator map');
    const c = seg({ location: loc, hasImage: true, roundup: { index: 0, count: 2 }, text: 'In Lisbon, a tram.' });
    planVisuals(c);
    assert.deepEqual(c.visuals, ['map']);
    assert.equal(c.locator, undefined, 'a round-up item stays on its map');
    const d = seg({ hasImage: false });
    planVisuals(d);
    assert.equal(d.visuals, undefined);
  });

  test('the pictures stage runs before the writer, so candidates already carry their picture', async () => {
    const names = new Producer({ config: {}, newsDesk: { findPictures() {} }, chain: null, log: quiet }).stages.map((s) => s.name);
    assert.ok(names.indexOf('pictures') >= 0 && names.indexOf('pictures') < names.indexOf('write'));
  });
});
