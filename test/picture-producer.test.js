// The rights desk in the producer's picture stage, the archive and the episode (docs/pictures/RIGHTS.md): with the
// desk, only pictures with a cleared rights record air; the credit is the record's; the episode lists every picture
// with its attribution; a private preview marks its outlet photos and the episode as not cleared; the archive shows an
// old outlet photo again only in a preview.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Producer } from '../server/producer.js';
import { Archive } from '../server/archive.js';
import { rightsRecord, outletRecord, currentRights } from '../server/rights.js';

const silent = { info() {}, warn() {}, error() {} };
const cleared = (url, extra = {}) => rightsRecord({ source: 'wikimedia-commons', via: 'wikidata:P18', licence: 'CC-BY-SA-4.0', author: 'Jane Doe', title: 'File:Lisbon.jpg', page: 'https://commons.wikimedia.org/wiki/File:Lisbon.jpg', url, ...extra });

/** A stand-in for server/picturedesk.js: decisions by story id (a list of picks, the first not failed is aired). */
function stubDesk(decisions, { mode = 'cleared' } = {}) {
  const failed = new Set();
  const desk = {
    mode,
    failedCalls: [],
    wm: { paused: false },
    async decide() {
      return new Map();
    },
    apply(s) {
      const pick = (decisions[s.id] || []).find((p) => !failed.has(p.url));
      if (s.image && !(currentRights(s)?.source && currentRights(s).source !== 'outlet')) s.outletPicture = { image: s.image, imageCredit: s.imageCredit };
      if (pick) {
        Object.assign(s, { image: pick.url, imageRights: pick, imageCredit: pick.credit, imageFocus: 0.16, imageFit: 'portrait' });
        return pick;
      }
      if (mode === 'preview' && s.outletPicture) {
        Object.assign(s, s.outletPicture);
        s.imageRights = outletRecord(s);
        return null;
      }
      s.image = null;
      delete s.imageRights;
      return null;
    },
    async assign(stories) {
      for (const s of stories) desk.apply(s);
      return { cleared: stories.filter((s) => currentRights(s)?.cleared).length };
    },
    failed(s, reason) {
      desk.failedCalls.push([s.id, reason]);
      failed.add(s.image);
      return desk.apply(s);
    },
  };
  return desk;
}

function setup({ mode = 'cleared', decisions, images = null } = {}) {
  const stories = new Map([
    ['s1', { id: 's1', title: 'Lisbon opens a tram line', source: 'Pixelburg Post', image: 'https://outlet.example/a.jpg', imageCredit: 'Reuters', link: 'https://news.example/1' }],
    ['s2', { id: 's2', title: 'Council approves a budget', source: 'Bitport Herald', image: 'https://outlet.example/b.jpg', imageCredit: 'AP', link: 'https://news.example/2' }],
  ]);
  const found = [];
  const news = {
    stories,
    get: (id) => stories.get(id),
    async findPictures(list) {
      found.push(list.map((s) => s.id));
      return { pictures: list.length };
    },
    pictureFailed(s) {
      s.image = null;
    },
  };
  const desk = stubDesk(decisions || { s1: [cleared('https://thumb.wikimedia.org/a/1280px-Lisbon.jpg')] }, { mode });
  const producer = new Producer({ config: { pictures: { rights: mode }, pictureBudgetMs: 500, pictureVerifyMs: 500 }, newsDesk: news, chain: {}, images, pictureDesk: desk, log: silent });
  const seg = (id) => ({ type: 'story', storyId: id, source: stories.get(id).source, text: 'One. Two. Three.' });
  const ctx = { program: { id: 'world-now' }, candidates: [...stories.values()], episode: { storyIds: ['s1', 's2'], segments: [seg('s1'), seg('s2')], rundown: [{ storyId: 's1', source: 'Pixelburg Post' }, { storyId: 's2', source: 'Bitport Herald' }] } };
  return { producer, ctx, news, desk, found, stories };
}

describe('the picture stage with the rights desk', () => {
  test("by default the outlets' pages are not even read for their photos; the desk assigns before the writer", async () => {
    const { producer, ctx, found, stories } = setup();
    const out = await producer.pictures(ctx);
    assert.deepEqual(found, []);
    assert.equal(out.cleared.cleared, 1);
    assert.equal(stories.get('s1').imageRights.cleared, true);
    assert.equal(stories.get('s2').image, null, "the outlet's photo is kept aside, never offered to the writer");
  });
  test('only a cleared picture airs, with the credit its licence asks and the focus of a portrait', async () => {
    const { producer, ctx } = setup();
    const res = await producer.assets(ctx);
    const [a, b] = ctx.episode.segments;
    assert.equal(a.hasImage, true);
    assert.equal(a.imageCredit, 'FILE · JANE DOE · CC BY-SA 4.0 · PIXELATED');
    assert.equal(a.imageLabel, 'FILE');
    assert.equal(a.imageLicence, 'CC-BY-SA-4.0');
    assert.equal(a.imageFocus, 0.16);
    assert.equal(a.imageFit, 'portrait', 'a portrait keeps the whole head on screen');
    assert.equal(b.hasImage, false);
    assert.equal(b.imageFit, undefined);
    assert.equal(b.imageCredit, undefined);
    assert.equal(ctx.episode.rundown[1].hasImage, false);
    assert.equal(res.cleared, 1);
    assert.equal(res.uncleared, 0);
  });
  test('the episode lists every picture on air with its full attribution, all cleared', async () => {
    const { producer, ctx } = setup();
    await producer.assets(ctx);
    assert.equal(ctx.episode.pictureRights.length, 1);
    assert.equal(ctx.episode.pictureRights[0].storyId, 's1');
    assert.match(ctx.episode.pictureRights[0].attribution, /Pixelated \(modified\) by GLOBIT 24/);
    assert.equal(ctx.episode.picturesCleared, true);
    assert.equal(ctx.episode.picturePreview, undefined);
  });
  test('a private preview: the outlet photo stands in, marked not cleared, and the episode says it must never be published', async () => {
    const { producer, ctx, found } = setup({ mode: 'preview' });
    await producer.pictures(ctx);
    assert.deepEqual(found, [['s1', 's2']], 'the outlets are read in a preview');
    await producer.assets(ctx);
    const b = ctx.episode.segments[1];
    assert.equal(b.hasImage, true);
    assert.equal(b.imageUncleared, true);
    assert.equal(b.imageCredit, 'AP', "the outlet's own credit, never dressed as a licence");
    assert.equal(ctx.episode.picturesCleared, false);
    assert.equal(ctx.episode.picturePreview, true);
  });
  test('never one picture file under two stories of an episode: the second shows its board', async () => {
    const same = 'https://thumb.wikimedia.org/a/1280px-Donald_Trump_official_portrait.jpg';
    const { producer, ctx } = setup({ decisions: { s1: [cleared(same)], s2: [cleared(same)] } });
    await producer.assets(ctx);
    assert.equal(ctx.episode.segments[0].hasImage, true);
    assert.equal(ctx.episode.rundown[0].hasImage, true);
    assert.equal(ctx.episode.segments[1].hasImage, false);
    assert.equal(ctx.episode.rundown[1].hasImage, false);
    assert.equal(ctx.episode.pictureRights.length, 1);
  });
  test('a story with neither a picture nor a place carries its board: its strongest element, never a bare section word', async () => {
    const { producer, ctx, stories } = setup();
    stories.get('s2').title = 'Council approves a £35m budget for schools';
    ctx.episode.rundown[1].headline = 'Council approves a £35m budget for schools';
    ctx.episode.segments[1].quote = { text: 'This is a good day.', by: 'The mayor' };
    await producer.assets(ctx);
    assert.deepEqual(ctx.episode.rundown[1].board, { kind: 'figure', value: '£35M', label: 'BUDGET', qual: null, grave: false });
    // (a story with a picture has no board)
    assert.equal(ctx.episode.rundown[0].board, undefined);
  });
  test('a cleared picture that will not download: the desk gives the next cleared one', async () => {
    const images = {
      sources: new Map(),
      async get(id, urls) {
        return /first/.test(urls[0]) ? { error: 'HTTP 404' } : { type: 'image/jpeg', body: Buffer.alloc(10) };
      },
      forget() {},
    };
    const decisions = { s1: [cleared('https://thumb.wikimedia.org/first.jpg'), cleared('https://thumb.wikimedia.org/second.jpg')] };
    const { producer, ctx, desk, stories } = setup({ decisions, images });
    await producer.assets(ctx);
    assert.deepEqual(desk.failedCalls, [['s1', 'HTTP 404']]);
    assert.equal(stories.get('s1').image, 'https://thumb.wikimedia.org/second.jpg');
    assert.equal(ctx.episode.segments[0].hasImage, true);
  });
});

describe('the archive and the rights', () => {
  const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pictures-archive-'));
  const write = (d, lines) => fs.writeFileSync(path.join(d, `${new Date().toISOString().slice(0, 10)}.jsonl`), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  test("by default an archived outlet photo is never shown again (SEVEN DAYS, PAY ATTENTION); a cleared one is", () => {
    const d = dir();
    const at = Date.now();
    const ok = cleared('https://thumb.wikimedia.org/c.jpg');
    write(d, [
      { at, id: 's1', title: 'Old story', image: 'https://outlet.example/a.jpg' },
      { at, id: 's2', title: 'Cleared story', image: ok.url, imageRights: { url: ok.url, cleared: true, credit: ok.credit } },
      { at, id: 's3', title: 'Offline demo', image: 'file:///srv/feeds/img/canal.png' },
    ]);
    const a = new Archive({ dir: d, pictures: 'cleared', log: silent });
    assert.equal(a.story('s1').image, null);
    assert.equal(a.entries.find((e) => e.id === 's1').outletImage, 'https://outlet.example/a.jpg');
    assert.equal(a.story('s2').image, ok.url);
    assert.equal(a.story('s2').imageCredit, ok.credit);
    assert.equal(a.story('s3').image, 'file:///srv/feeds/img/canal.png', "the operator's own local files");
    assert.equal(new Archive({ dir: d, pictures: 'preview', log: silent }).story('s1').image, 'https://outlet.example/a.jpg');
    assert.equal(new Archive({ dir: d, log: silent }).story('s1').image, 'https://outlet.example/a.jpg', 'no mode (older callers): as written');
  });
  test('the archive records the rights record of the picture each story aired with', () => {
    const d = dir();
    const a = new Archive({ dir: d, pictures: 'cleared', log: silent });
    const s = { id: 's9', title: 'Lisbon opens a tram line', summary: '', source: 'X', image: 'https://thumb.wikimedia.org/c.jpg' };
    s.imageRights = cleared(s.image);
    a.record({ program: { id: 'world-now' }, storyIds: ['s9'], segments: [{ type: 'story', storyId: 's9', headline: 'Tram', text: 'A tram line.' }] }, { get: () => s });
    const e = a.entries.find((x) => x.id === 's9');
    assert.equal(e.imageRights.cleared, true);
    assert.equal(e.imageRights.licence, 'CC-BY-SA-4.0');
    assert.equal(a.story('s9').image, s.image);
  });
});
