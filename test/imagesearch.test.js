// Image search (server/imagesearch.js): the file-photo query policy, the providers' replies, the gates,
// and the news desk's last step for stories still without a picture (owner 22:40: on air only real photos).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ImageSearch, fileQuery, fileCredit, usableResult, parseCommons, parseGoogle, parseBing, shortLicence, siteName, MIN_SEARCH_WIDTH } from '../server/imagesearch.js';
import { NewsDesk } from '../server/news.js';
import { sourceWithCredit, creditLine, SOURCE_MAX } from '../server/producer.js';

const commonsPage = (index, title, { licence = 'CC BY-SA 4.0', artist = '<a href="//commons.wikimedia.org/wiki/User:Jane">Jane Doe</a>', w = 1280, h = 853, mime = 'image/jpeg', description = '' } = {}) => ({
  pageid: 1000 + index,
  ns: 6,
  title: `File:${title}.jpg`,
  index,
  imageinfo: [
    {
      thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${encodeURIComponent(title)}.jpg/1280px-${encodeURIComponent(title)}.jpg`,
      thumbwidth: w,
      thumbheight: h,
      url: `https://upload.wikimedia.org/wikipedia/commons/a/ab/${encodeURIComponent(title)}.jpg`,
      width: w * 3,
      height: h * 3,
      mime,
      descriptionurl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(title)}.jpg`,
      extmetadata: { Artist: { value: artist }, LicenseShortName: { value: licence }, ImageDescription: { value: description } },
    },
  ],
});

describe('the file-photo query: the story\'s place (and its structure), never the event, never a person', () => {
  test('a place and the structure the story is about', () => {
    assert.equal(fileQuery({ title: 'Panama Canal reopens after a day-long closure' }).q, 'Panama canal');
    assert.equal(fileQuery({ title: 'Lisbon opens a new riverside tram line' }).q, 'Lisbon tram');
    assert.equal(fileQuery({ title: 'Ships queue outside the port of Rotterdam' }).q, 'Rotterdam port');
    assert.equal(fileQuery({ title: 'Germany rail strike leaves stations empty' }).q, 'Germany station');
  });
  test('grave stories get the place alone; event words never reach a query', () => {
    for (const title of ['Heavy rain floods streets in Kerala', 'Wildfire near Marseille forces thousands to evacuate', 'Iceland volcano erupts again', 'Storm hits the port of Lagos']) {
      const fq = fileQuery({ title });
      assert.ok(fq, title);
      assert.ok(!/flood|fire|volcano|erupt|storm|evacuat/i.test(fq.q), `${title} -> "${fq.q}"`);
    }
    assert.equal(fileQuery({ title: 'Heavy rain floods streets in Kerala' }).subject, null);
  });
  test('no named place (a product, a person): no search', () => {
    assert.equal(fileQuery({ title: 'Chipmaker unveils a laptop processor' }), null);
    assert.equal(fileQuery({ title: 'Taylor Swift announces a world tour' }), null);
    assert.equal(fileQuery({ title: '' }), null);
    assert.equal(fileQuery(null), null);
  });
});

describe('providers and gates', () => {
  test('Commons: free licences only, in search order, credited FILE · author · licence (no markup)', () => {
    const data = { query: { pages: [commonsPage(2, 'Lisbon tram 28'), commonsPage(1, 'Lisbon Alfama', { licence: 'CC0' }), commonsPage(3, 'Lisbon promo', { licence: 'All rights reserved' })] } };
    const out = parseCommons(data);
    assert.deepEqual(out.map((p) => p.title), ['Lisbon Alfama', 'Lisbon tram 28']);
    assert.equal(out[1].credit, 'FILE · Jane Doe · CC BY-SA');
    assert.equal(out[0].credit, 'FILE · Jane Doe · CC0');
    assert.equal(out[1].width, 1280);
    assert.ok(out[1].url.startsWith('https://upload.wikimedia.org/'));
    assert.equal(out[1].kind, 'file');
    assert.equal(out[1].via, 'search:commons');
    // the formatversion 1 shape (pages keyed by id) reads the same
    assert.equal(parseCommons({ query: { pages: { 7: commonsPage(1, 'Lisbon Alfama') } } }).length, 1);
    assert.deepEqual(parseCommons(null), []);
  });
  test('credits fit the credit line and never carry a domain', () => {
    assert.ok(fileCredit('Jane Quentin Photographer-Longname (talk), via Flickr', 'CC BY-SA 4.0').length <= 40);
    assert.equal(shortLicence('Public domain'), 'PD');
    assert.equal(shortLicence('CC BY 2.0'), 'CC BY');
    assert.equal(siteName('www.flickr.com/photos/abc'), 'FLICKR');
    const g = parseGoogle({ items: [{ link: 'https://example.org/a.jpg', mime: 'image/jpeg', title: 'Lisbon tram', displayLink: 'www.example.org', image: { width: 1600, height: 900, contextLink: 'https://example.org/p' } }] });
    assert.equal(g[0].credit, 'FILE · EXAMPLE · CC');
    const b = parseBing({ value: [{ contentUrl: 'https://img.example.net/b.jpg', width: 1500, height: 900, encodingFormat: 'jpeg', name: 'Rotterdam port', hostPageDisplayUrl: 'https://www.portnews.example.net/x' }] });
    assert.equal(b[0].credit, 'FILE · PORTNEWS · CC');
    assert.equal(b[0].mime, 'image/jpeg');
  });
  test('gates: big enough, landscape, a photograph, not of an event, https only', () => {
    const ok = { url: 'https://upload.wikimedia.org/x.jpg', width: 1280, height: 720, mime: 'image/jpeg', title: 'Lisbon tram 28' };
    assert.equal(usableResult(ok), true);
    assert.equal(usableResult({ ...ok, width: MIN_SEARCH_WIDTH - 1, height: 300 }), false, 'too small');
    assert.equal(usableResult({ ...ok, width: 720, height: 1280 }), false, 'portrait');
    assert.equal(usableResult({ ...ok, title: 'Map of Lisbon' }), false, 'a map');
    assert.equal(usableResult({ ...ok, title: 'Coat of arms of Lisbon' }), false, 'a coat of arms');
    assert.equal(usableResult({ ...ok, title: 'Lisbon flood 1967' }), false, 'another event');
    assert.equal(usableResult({ ...ok, mime: 'image/svg+xml' }), false, 'a drawing');
    assert.equal(usableResult({ ...ok, url: 'http://upload.wikimedia.org/x.jpg' }), false, 'not https');
  });
});

describe('ImageSearch', () => {
  const reply = (data, status = 200) => ({ ok: status === 200, status, json: async () => data });
  test('find(): the result that names the place first; one request per query (cached)', async () => {
    const urls = [];
    const fetchImpl = async (url) => {
      urls.push(url);
      return reply({ query: { pages: [commonsPage(1, 'Tram in a city'), commonsPage(2, 'Lisbon tram 28 at Graca')] } });
    };
    const search = new ImageSearch({ fetchImpl, log: { warn() {} } });
    const story = { id: 's1', title: 'Lisbon opens a new riverside tram line', summary: '' };
    const p = await search.find(story);
    assert.equal(p.title, 'Lisbon tram 28 at Graca');
    assert.equal(p.query, 'Lisbon tram');
    assert.ok(new URL(urls[0]).searchParams.get('gsrsearch').startsWith('Lisbon tram'));
    await search.find(story);
    assert.equal(urls.length, 1, 'cached');
  });
  test('a provider that fails or a story with no place gives no picture, and never throws', async () => {
    const search = new ImageSearch({ fetchImpl: async () => reply({}, 503), log: { warn() {} } });
    assert.equal(await search.find({ title: 'Lisbon opens a new riverside tram line' }), null);
    assert.equal(await search.find({ title: 'Chipmaker unveils a laptop processor' }), null);
    const throwing = new ImageSearch({ fetchImpl: async () => { throw new Error('ENOTFOUND'); }, log: { warn() {} } });
    assert.deepEqual(await throwing.search('Lisbon tram'), []);
  });
  test('google and bing only with their keys; none at all when turned off', () => {
    assert.deepEqual(new ImageSearch({ providers: ['commons', 'google', 'bing'] }).providers, ['commons']);
    assert.deepEqual(new ImageSearch({ providers: ['google', 'bing'], google: { key: 'k', cx: 'c' }, bing: { key: 'b' } }).providers, ['google', 'bing']);
    assert.equal(new ImageSearch({ providers: [] }).enabled, false);
  });
});

describe('the news desk\'s last picture step', () => {
  test('a story still without a picture gets a FILE photo of its place, credited; the offline desk never searches', async () => {
    const desk = new NewsDesk({ fetchImpl: async () => ({ ok: false, status: 404 }), log: { warn() {}, info() {} } });
    const asked = [];
    desk.imageSearch = {
      enabled: true,
      async find(s) {
        asked.push(s.id);
        return { url: 'https://upload.wikimedia.org/lisbon.jpg', width: 1280, height: 720, credit: 'FILE · Jane Doe · CC BY-SA', license: 'CC BY-SA 4.0', page: 'https://commons.wikimedia.org/wiki/File:Lisbon.jpg', via: 'search:commons', kind: 'file' };
      },
    };
    const live = { id: 's1', title: 'Lisbon opens a new riverside tram line', summary: '', source: 'Pixelburg Post', link: 'https://news.example/lisbon', imageChecked: true };
    const local = { id: 's2', title: 'Lisbon opens a new riverside tram line', summary: '', source: 'Pixelburg Post', local: true };
    const res = await desk.findPictures([live, local], { budgetMs: 2000 });
    assert.deepEqual(asked, ['s1']);
    assert.equal(live.image, 'https://upload.wikimedia.org/lisbon.jpg');
    assert.equal(live.imageKind, 'file');
    assert.equal(live.imageCredit, 'FILE · Jane Doe · CC BY-SA');
    assert.equal(local.image, undefined, 'the offline fixture desk keeps its own pictures');
    assert.equal(res.searched, 1);
    // searched once an hour at most
    await desk.findPictures([{ ...live, image: undefined, imageKind: undefined, imageSearched: Date.now() }], { budgetMs: 500 });
    assert.deepEqual(asked, ['s1']);
  });
});

test('a FILE photo always says FILE on the source plate and the credit line, whatever the outlet\'s length', () => {
  for (const outlet of ['Pixelburg Post', 'The Pixelburg Evening Chronicle and Courier', 'AP']) {
    const line = sourceWithCredit(outlet, 'FILE · Jane Doe · CC BY-SA');
    assert.ok(/\bFile\b/.test(line), `${outlet}: "${line}"`);
    assert.ok(line.length <= SOURCE_MAX, `${outlet}: "${line}" (${line.length})`);
  }
  assert.equal(sourceWithCredit('Pixelburg Post', 'FILE · Jane Doe · CC BY-SA'), 'Pixelburg Post / File: Jane Doe');
  assert.equal(creditLine('FILE · Jane Doe · CC BY-SA'), 'FILE: JANE DOE · CC BY-SA');
  assert.ok(creditLine('FILE · Jane Quentin Photographer · CC BY-SA').startsWith('FILE'));
});

