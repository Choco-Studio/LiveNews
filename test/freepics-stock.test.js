import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePixabayHit, parseNasaItem } from '../server/freepics/stock.js';
import { FreePictureDesk, keywords } from '../server/freepics/desk.js';

const hit = (o = {}) => ({ id: 1, type: 'photo', tags: 'solar farm, solar panels, renewable energy', largeImageURL: 'https://pixabay.com/get/x_1280.jpg', imageWidth: 3000, imageHeight: 2000, user: 'Kev', pageURL: 'https://pixabay.com/photos/solar-farm-1/', isAiGenerated: false, isLowQuality: false, ...o });
const item = (o = {}, data = {}) => ({ data: [{ nasa_id: 'X1', media_type: 'image', title: 'Webb telescope mirror', description: 'The James Webb Space Telescope mirror', center: 'GSFC', date_created: '2025-01-01T00:00:00Z', keywords: ['Webb'], ...data }], links: [{ rel: 'preview', render: 'image', href: 'https://images-assets.nasa.gov/image/X1/X1~thumb.jpg' }], ...o });

test('Pixabay: never an AI-generated or low-quality picture; the licence and the size are read', () => {
  const f = parsePixabayHit(hit());
  assert.equal(f.licence.id, 'pixabay');
  assert.deepEqual([f.width, f.height, f.fullWidth], [1280, 853, 3000]);
  assert.equal(parsePixabayHit(hit({ isAiGenerated: true })), null);
  assert.equal(parsePixabayHit(hit({ isLowQuality: true })), null);
  assert.equal(parsePixabayHit(hit({ type: 'illustration' })), null);
});

test('NASA: public domain, the large rendition, and nothing credited to anyone else', () => {
  const f = parseNasaItem(item());
  assert.equal(f.licence.id, 'pd-usgov');
  assert.equal(f.url, 'https://images-assets.nasa.gov/image/X1/X1~large.jpg');
  assert.equal(parseNasaItem(item({}, { description: 'Photo courtesy of Getty Images' })), null);
  assert.equal(parseNasaItem(item({}, { photographer: '© ESA/Someone' })), null);
  // round 5 (8 Oct): a partner's picture in NASA's library, and an artist's concept
  assert.equal(parseNasaItem(item({}, { secondary_creator: 'ESA/ATG medialab' })), null);
  assert.equal(parseNasaItem(item({}, { title: 'Titan Subsurface Reservoirs Artist Concept' })), null);
  assert.ok(parseNasaItem(item({}, { photographer: 'NASA/Bill Ingalls' })));
});

test('keywords: what a stock query keeps from the brief', () => {
  assert.deepEqual(keywords("the canal's locks or ships in transit", 3), ['canal', 'locks', 'ships']);
});

const desk = (stockFiles, nasaFiles = []) =>
  new FreePictureDesk({
    wikidata: { resolve: async () => null },
    commons: { files: async () => [], search: async () => [] },
    stock: { enabled: true, search: async () => stockFiles },
    nasa: { enabled: true, search: async () => nasaFiles },
    log: { warn() {} },
  });
const brief = (o) => ({ subjects: [], never: [], tone: 'neutral', show: 'solar farm panels', stock: 'solar farm', ...o });

test('stock: on the query, without people, never under a grave story', async () => {
  const sun = parsePixabayHit(hit());
  const p = await desk([sun]).find({ id: 'a', title: 'Spain opens a big solar farm', summary: '' }, { brief: brief() });
  assert.equal(p.via, 'free:stock');
  assert.equal(p.credit, 'FILE · Kev · PIXABAY');
  assert.equal(p.record.source, 'Pixabay');
  assert.equal(await desk([sun]).find({ id: 'b', title: 'Fire at solar farm kills two', summary: '' }, { brief: brief({ tone: 'grave' }) }), null);
  const people = parsePixabayHit(hit({ tags: 'solar panels, woman, engineer, solar farm' }));
  assert.equal(await desk([people]).find({ id: 'c', title: 'Solar farm', summary: '' }, { brief: brief() }), null);
  const off = parsePixabayHit(hit({ tags: 'beach, sunset, sea' }));
  assert.equal(await desk([off]).find({ id: 'd', title: 'Solar farm', summary: '' }, { brief: brief() }), null);
});

test('NASA for a science story: the thing itself, not a press briefing', async () => {
  const mirror = { ...parseNasaItem(item()), width: 1920, height: 1080, fullWidth: 4000 };
  const briefing = { ...parseNasaItem(item({}, { nasa_id: 'X2', title: 'Webb first images media briefing', description: 'Officials at the media briefing' })), width: 1920, height: 1080, fullWidth: 4000 };
  const story = { id: 'w', title: 'Webb finds a lava world', summary: '', category: 'science' };
  const b = { subjects: [{ name: 'James Webb Space Telescope', kind: 'structure', role: 'main' }], never: [], tone: 'neutral' };
  assert.equal((await desk([], [briefing, mirror]).find(story, { brief: b })).record.file, 'nasa:X1');
});

test('round 5 (8 Oct): stock comes only from the generic query, every word must be tagged, never for one product', async () => {
  const sun = parsePixabayHit(hit());
  // no generic query in the brief: no stock, whatever "show" says
  assert.equal(await desk([sun]).find({ id: 'e', title: 'Solar farm', summary: '' }, { brief: brief({ stock: null }) }), null);
  // a story about one product: another product would mislead
  assert.equal(await desk([sun]).find({ id: 'f', title: 'Surface laptop', summary: '' }, { brief: brief({ subjects: [{ name: 'Surface Laptop', kind: 'product', role: 'main' }] }) }), null);
  // a partial tag match is not enough ("pebble flow electric" vs stacked pebbles)
  const pebbles = parsePixabayHit(hit({ tags: 'pebble, stones, balance' }));
  assert.equal(await desk([pebbles]).find({ id: 'g', title: 'Pebble Flow trailer', summary: '' }, { brief: brief({ stock: 'pebble electric trailer' }) }), null);
});

test('round 6 (8 Oct): "lion" in "sea lion" is another animal; a stock picture tagged with a place is that place', async () => {
  const sea = parsePixabayHit(hit({ tags: 'sea lion, feeding, zoo, animal' }));
  assert.equal(await desk([sea]).find({ id: 'h', title: 'Zoo lions', summary: '' }, { brief: brief({ stock: 'zoo lions feeding' }) }), null);
  const lions = parsePixabayHit(hit({ tags: 'lion, zoo, feeding, big cat' }));
  assert.ok(await desk([lions]).find({ id: 'i', title: 'Zoo lions', summary: '' }, { brief: brief({ stock: 'zoo lions feeding' }) }));
  const warsaw = parsePixabayHit(hit({ tags: 'poland, warsaw, office, government' }));
  assert.equal(await desk([warsaw]).find({ id: 'j', title: 'NASA contractors', summary: '' }, { brief: brief({ stock: 'government office' }) }), null);
  const track = parsePixabayHit(hit({ tags: 'tartan track, athletics, track and field' }));
  assert.ok(await desk([track]).find({ id: 'k', title: 'Athletes', summary: '' }, { brief: brief({ stock: 'athletics track' }) }));
});

test('round 6 (8 Oct): an earthly picture of a generic concept never stands for Mars', async () => {
  const yardang = { name: 'File:Yardang in Xinjiang.jpg', url: 'https://upload.wikimedia.org/y.jpg', width: 1280, height: 720, fullWidth: 3000, mime: 'image/jpeg', title: 'Yardang in Xinjiang', description: 'Wind-eroded ridge', licence: { id: 'cc-by', version: '4.0', label: 'CC BY 4.0' }, author: 'X', credit: 'Own work', categories: [], restrictions: [], assessments: [], uploaded: '2020-01-01T00:00:00Z' };
  const d = new FreePictureDesk({
    wikidata: { resolve: async () => ({ qid: 'Q1', label: 'yardang', description: 'wind-eroded landform', classes: [], image: 'Yardang in Xinjiang.jpg', sitelinks: 30 }) },
    commons: { files: async () => [yardang], search: async () => [] },
    log: { warn() {} },
  });
  const b = { subjects: [{ name: 'yardang', kind: 'phenomenon', role: 'main' }], never: [], tone: 'neutral' };
  assert.equal(await d.find({ id: 'm', title: "NASA's Curiosity captures dawn on wind-carved cliffs", summary: '' }, { brief: b }), null);
  assert.ok(await d.find({ id: 'n', title: 'Wind carves new yardangs in the Gobi', summary: '' }, { brief: b }));
});
