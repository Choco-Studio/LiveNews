import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FootageDesk, footageQuery, parseCommonsVideos, usableFootage, bestFootage, FOOTAGE_LIMITS } from '../server/footage.js';
import { FOOTAGE, gradeInto, paletteOf, paletteFrom, lutOf, quantise } from '../public/js/footage/pixel.js';

// Footage of a correspondent link's place (owner 4 Oct: "cargar vídeos, pixelarlos con nuestro estilo"): the
// server finds a FILE clip of the PLACE on Wikimedia Commons, the client turns it into the channel's pixel style.

const page = (title, { mime = 'video/webm', w = 1920, h = 1080, size = 50_000_000, duration = 60, licence = 'CC BY-SA 4.0', artist = 'Jane Doe', ders = ['240p.vp9.webm', '360p.vp9.webm'], description = '' } = {}) => ({
  title: `File:${title}`,
  index: 0,
  videoinfo: [
    {
      url: `https://upload.wikimedia.org/wikipedia/commons/a/ab/${encodeURIComponent(title)}`,
      descriptionurl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(title)}`,
      mime,
      width: w,
      height: h,
      size,
      duration,
      extmetadata: { LicenseShortName: { value: licence }, Artist: { value: `<a href="x">${artist}</a>` }, ImageDescription: { value: description } },
      derivatives: ders.map((key) => ({ src: `https://upload.wikimedia.org/wikipedia/commons/transcoded/a/ab/${encodeURIComponent(title)}/${encodeURIComponent(title)}.${key}`, type: 'video/webm', transcodekey: key, width: Number(key.split('p')[0]) * (16 / 9), height: Number(key.split('p')[0]) })),
    },
  ],
});
const reply = (...pages) => ({ query: { pages: pages.map((p, i) => ({ ...p, index: i + 1 })) } });

describe('what footage may show', () => {
  test('the query is the place alone: never on a grave story, a broad region films as its country', () => {
    assert.deepEqual(footageQuery({ place: 'MARSEILLE, FRANCE' }), { q: 'Marseille', name: 'Marseille' });
    assert.deepEqual(footageQuery({ place: 'YUCATÁN PENINSULA, MEXICO' }), { q: 'Mexico', name: 'Mexico' });
    assert.equal(footageQuery({ place: 'NORTHERN ANDES' }), null, 'no country to fall back on');
    assert.equal(footageQuery({ place: 'MARSEILLE, FRANCE' }, { grave: true }), null, 'a grave story shows no tourist footage');
    assert.equal(footageQuery(null), null);
  });

  test('a clip: free licence, a WebM the browser plays (a small transcode first), credited FILE', () => {
    const [c] = parseCommonsVideos(reply(page('Marseille par drone.webm')));
    assert.match(c.src, /\.240p\.vp9\.webm$/);
    assert.equal(c.credit, 'FILE · Jane Doe · CC BY-SA');
    assert.equal(c.title, 'Marseille par drone');
    assert.equal(parseCommonsVideos(reply(page('Marseille.webm', { licence: 'All rights reserved' }))).length, 0);
    assert.equal(parseCommonsVideos(reply(page('Marseille.ogv', { mime: 'application/ogg', ders: [] }))).length, 0, 'an Ogg original with no WebM transcode is no use to Chromium');
    const small = parseCommonsVideos(reply(page('Marseille.webm', { w: 426, h: 240, size: 3_000_000, ders: [] })))[0];
    assert.match(small.src, /Marseille\.webm$/, 'a small WebM original plays as it is');
  });

  test('the gates: the place named, landscape, long enough, never an event, a speech or a production', () => {
    const clip = (title, extra = {}) => parseCommonsVideos(reply(page(`${title}.webm`, extra)))[0];
    assert.ok(usableFootage(clip('Vieux-Port de Marseille'), 'Marseille'));
    assert.ok(!usableFootage(clip('Vieux-Port de Marseille'), 'Lisbon'), 'another place');
    assert.ok(!usableFootage(clip('Marseille wildfire 2026'), 'Marseille'), 'an event');
    assert.ok(!usableFootage(clip('Interview with the mayor of Marseille'), 'Marseille'), 'a person speaking');
    assert.ok(!usableFootage(clip('Marseille vs Lyon match highlights'), 'Marseille'), 'a production');
    assert.ok(!usableFootage(clip('Marseille street', { duration: 4 }), 'Marseille'), 'too short');
    assert.ok(!usableFootage(clip('Marseille street', { w: 1080, h: 1920, ders: [] }), 'Marseille'), 'portrait (no transcode either)');
    // a shot of the place, said in its title: never people, an occasion or just the place's name
    assert.ok(!usableFootage(clip('President Trump Greets the Chancellor of the Federal Republic of Germany'), 'Germany'), 'people the story is not about');
    assert.ok(!usableFootage(clip('Germany 2019'), 'Germany'), 'the name alone says nothing of the shot');
    assert.ok(!usableFootage(clip('Berlin street', { description: 'Children playing in the street' }), 'Berlin'), 'never children');
    assert.ok(!usableFootage(clip('Berlin street festival'), 'Berlin'), 'an occasion');
    assert.ok(usableFootage(clip('Berlin street', { description: 'Visit our channel for more' }), 'Berlin'), 'an occasion word in the description is no person');
    for (const [title, name] of [['Luftaufnahme Berlin', 'Berlin'], ['Vue aérienne de Marseille', 'Marseille'], ['Hauptstraße in Heidelberg', 'Heidelberg'], ['Kerala backwaters boat ride', 'Kerala']]) assert.ok(usableFootage(clip(title), name), title);
    const best = bestFootage([clip('Marseille 2019'), clip('Marseille old town walk'), clip('Marseille aerial view'), clip('Marseille protest')], 'Marseille');
    assert.equal(best.title, 'Marseille aerial view', 'a good kind of shot first');
    assert.ok(FOOTAGE_LIMITS.maxBytes <= 16 * 1024 * 1024);
  });
});

// a minimal WebM (EBML magic + padding)
const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(2048, 7)]);
function fakeFetch(log, { status = 200, retryAfter = null } = {}) {
  return async (url) => {
    log.push(String(url));
    const headers = new Map([['content-length', String(WEBM.length)]]);
    if (retryAfter) headers.set('retry-after', String(retryAfter));
    const h = { get: (k) => headers.get(k.toLowerCase()) ?? null };
    if (status !== 200) return { ok: false, status, headers: h, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };
    if (/api\.php/.test(url)) return { ok: true, status: 200, headers: h, json: async () => reply(page('Vieux-Port de Marseille.webm', { duration: 90 })) };
    return { ok: true, status: 200, headers: h, arrayBuffer: async () => WEBM.buffer.slice(WEBM.byteOffset, WEBM.byteOffset + WEBM.length) };
  };
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'footage-'));

describe('the footage desk', () => {
  test('finds, downloads once, serves the kept file and remembers the place across a restart', async () => {
    const dir = tmp();
    const log = [];
    const desk = new FootageDesk({ dir, fetchImpl: fakeFetch(log), gapMs: 0, log: { warn() {} } });
    const clip = await desk.find({ place: 'MARSEILLE, FRANCE', lat: 43.3, lon: 5.37 });
    assert.match(clip.id, /^f[0-9a-f]{16}$/);
    assert.equal(clip.credit, 'FILE · Jane Doe · CC BY-SA');
    assert.equal(clip.start, 18, 'a fifth in, past the opening titles');
    assert.ok(fs.existsSync(desk.file(clip.id)));
    assert.equal(desk.file('fnothing'), null);
    assert.equal(desk.file('../../etc/passwd'), null);
    const n = log.length;
    assert.deepEqual(await desk.find({ place: 'MARSEILLE, FRANCE', lat: 43.3, lon: 5.37 }), clip);
    assert.equal(log.length, n, 'cached: Commons is asked once');
    const again = new FootageDesk({ dir, fetchImpl: fakeFetch(log), gapMs: 0 });
    assert.deepEqual(await again.find({ place: 'MARSEILLE, FRANCE', lat: 43.3, lon: 5.37 }), clip);
    assert.equal(log.length, n, 'a restart asks nothing it answered in the last day');
    assert.equal(await desk.find({ place: 'MARSEILLE, FRANCE' }, { grave: true }), null);
  });

  test("a 429 pauses the desk for what Commons asks (a minute at least); off, it answers null at once", async () => {
    let now = 1_000_000;
    const log = [];
    const desk = new FootageDesk({ dir: tmp(), fetchImpl: fakeFetch(log, { status: 429, retryAfter: 17 }), gapMs: 0, now: () => now, log: { warn() {} } });
    assert.equal(await desk.find({ place: 'LISBON, PORTUGAL', lat: 38.7, lon: -9.1 }), null);
    assert.equal(desk.pausedUntil, now + 60_000);
    const calls = log.length;
    assert.equal(await desk.find({ place: 'PARIS, FRANCE', lat: 48.9, lon: 2.35 }), null);
    assert.equal(log.length, calls, 'paused: nothing asked');
    now += 61_000;
    await desk.find({ place: 'PARIS, FRANCE', lat: 48.9, lon: 2.35 });
    assert.ok(log.length > calls, 'asks again once the pause is over');
    const off = new FootageDesk({ dir: tmp(), fetchImpl: fakeFetch(log), enabled: false });
    assert.equal(await off.find({ place: 'PARIS, FRANCE', lat: 48.9, lon: 2.35 }), null);
  });
});

describe('the pixel style of moving pictures (footage/pixel.js)', () => {
  // a synthetic frame: a sky gradient over a dark ground with a bright block (a building)
  const W = 192, H = 108, N = W * H;
  const frame = (shift = 0) => {
    const u = new Uint32Array(N);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let r = 90 + y, g = 140 + y / 2, b = 220 - y;
        if (y > 70) [r, g, b] = [60, 50, 40];
        if (x > 60 + shift && x < 100 + shift && y > 40) [r, g, b] = [230, 200, 150];
        u[y * W + x] = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
      }
    return u;
  };

  test('every pixel is one of the shot’s colours (at most FOOTAGE.colours), the table agreeing with a full search', () => {
    const rgb = gradeInto(frame(), N, new Uint8Array(N * 3));
    const pal = paletteOf(rgb, N, FOOTAGE.colours);
    assert.ok(pal.k >= 4 && pal.k <= FOOTAGE.colours);
    const lut = lutOf(pal);
    const out = quantise(rgb, W, H, pal, lut, new Uint32Array(N));
    const colours = new Set(pal.u32);
    for (const c of out) assert.ok(colours.has(c));
    // the lookup table is the nearest colour by the eye's weights at each cell's centre
    for (const [r, g, b] of [[4, 4, 4], [252, 252, 252], [100, 150, 220], [60, 50, 40]]) {
      let best = 0, bd = Infinity;
      for (let c = 0; c < pal.k; c++) {
        const e = (r - pal.rgb[c * 3]) ** 2 * 0.3 + (g - pal.rgb[c * 3 + 1]) ** 2 * 0.59 + (b - pal.rgb[c * 3 + 2]) ** 2 * 0.11;
        if (e < bd) [bd, best] = [e, c];
      }
      const cell = lut[((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)];
      assert.equal(pal.u32[cell], pal.u32[best], `${r},${g},${b}`);
    }
  });

  test('a still part of the picture keeps its pixels from one frame to the next (fixed palette, screen-fixed dither)', () => {
    const a = gradeInto(frame(0), N, new Uint8Array(N * 3));
    const pal = paletteOf(a, N, FOOTAGE.colours), lut = lutOf(pal);
    const qa = quantise(a, W, H, pal, lut, new Uint32Array(N));
    const b = gradeInto(frame(6), N, new Uint8Array(N * 3)); // the building moved 6 px
    const qb = quantise(b, W, H, pal, lut, new Uint32Array(N));
    let same = 0, still = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < 55 || x > 110) {
      still++;
      if (qa[y * W + x] === qb[y * W + x]) same++;
    }
    assert.equal(same, still, 'nothing outside the moving block changes: no shimmer');
  });

  test('a fixed palette (the channel’s) maps too', () => {
    const pal = paletteFrom(['#181425', '#ffffff', '#e43b44']);
    assert.equal(pal.k, 3);
    const rgb = new Uint8Array([20, 20, 30, 250, 250, 250, 220, 60, 70]);
    const out = quantise(rgb, 3, 1, pal, lutOf(pal), new Uint32Array(3), 0);
    assert.deepEqual([...out], [...pal.u32]);
  });
});

describe('which stories get footage (producer)', () => {
  test('the links, and the montage’s teased stories with no picture of their own (never a grave one)', async () => {
    const { Producer } = await import('../server/producer.js');
    const asked = [];
    const desk = { find: async (loc, { grave }) => (asked.push(loc.place), grave ? null : { id: `f${String(asked.length).padStart(16, '0')}`, credit: `FILE · ${loc.place} · CC0`, duration: 60, width: 426, height: 240, start: 12 }) };
    const loc = (place) => ({ place, lat: 1, lon: 2 });
    const episode = {
      segments: [
        { type: 'intro', teases: ['a', 'b', 'c', 'd', null] },
        { type: 'story', storyId: 'a', emotion: 'neutral', text: 'Rail workers began a strike.', link: 'R1' },
        { type: 'cross', part: 'piece', storyId: 'a', location: loc('GERMANY'), grave: false },
        { type: 'cross', part: 'ask', storyId: 'a' },
        { type: 'story', storyId: 'b', emotion: 'neutral', text: 'Lisbon opened a tram line.' },
        { type: 'story', storyId: 'c', emotion: 'serious', text: 'A ferry fire killed two people.' },
        { type: 'story', storyId: 'd', emotion: 'neutral', text: 'Coral recovers.' },
      ],
      rundown: [
        { storyId: 'a', hasImage: true, location: loc('GERMANY') },
        { storyId: 'b', hasImage: false, location: loc('LISBON, PORTUGAL') },
        { storyId: 'c', hasImage: false, location: loc('CRETE, GREECE') },
        { storyId: 'd', hasImage: true, location: loc('QUEENSLAND, AUSTRALIA') },
      ],
    };
    const out = await Producer.prototype.footage.call({ footageDesk: desk, config: {} }, { episode });
    assert.deepEqual(asked, ['GERMANY', 'LISBON, PORTUGAL'], 'the link first; never the grave story, never one with its own picture');
    assert.deepEqual(out, { links: 1, footage: 1, montage: 1 });
    assert.equal(episode.segments[2].footage.id, episode.segments[3].footage.id, 'every part of the link');
    assert.match(episode.rundown[1].footage.credit, /^FILE · LISBON/);
    assert.equal(episode.rundown[2].footage, undefined);
  });
});
