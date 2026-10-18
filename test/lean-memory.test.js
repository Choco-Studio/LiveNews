// The long-lived channel page's memory (docs/publishing/playout.md §12): what the page keeps from one programme to the
// next must stay bounded however many programmes air. Measured 18 Oct (tools/leak/watch.mjs): the pictures decoded
// through <img> stayed in the renderer's image cache, +100 MB every time a programme's pictures loaded; the rendered
// strings grew past two thousand canvases (each ~20 kB of renderer memory whatever its size); the locator boards kept
// their pixels twice. These tests count canvases and decoded pictures across programme changes with a fake DOM.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

// a fake DOM: every canvas made is counted, and its 2D context does just enough for pixelate() and the boards
let made = 0;
function fakeCanvas() {
  made++;
  const cv = { width: 300, height: 150 };
  const ctx = {
    canvas: cv,
    fillStyle: '#000',
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).map((_, i) => (i * 37) & 255) }),
    putImageData() {},
    drawImage() {},
    fillRect() {},
    save() {},
    restore() {},
    beginPath() {},
    rect() {},
    clip() {},
    measureText: () => ({ width: 0 }),
  };
  cv.getContext = () => ctx;
  return cv;
}

// decoded pictures: what createImageBitmap made and what was closed
const bitmaps = { made: 0, closed: 0, open: new Set() };
const saved = {};
before(() => {
  for (const k of ['document', 'fetch', 'createImageBitmap']) saved[k] = globalThis[k];
  globalThis.document = { createElement: fakeCanvas };
  globalThis.fetch = async () => ({ ok: true, status: 200, blob: async () => ({}) });
  globalThis.createImageBitmap = async () => {
    bitmaps.made++;
    const bm = {
      width: 1280,
      height: 853,
      close() {
        if (bitmaps.open.delete(bm)) bitmaps.closed++;
      },
    };
    bitmaps.open.add(bm);
    return bm;
  };
});
after(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete globalThis[k];
    else globalThis[k] = v;
  }
});

test('pictures are decoded into ImageBitmaps and freed at once; the page keeps only their pixelated canvases', async () => {
  const { loadPicture, releasePicture } = await import('../public/js/pixelate.js');
  const pic = await loadPicture('/api/img/s0123456789');
  assert.equal(pic.width, 1280, 'an ImageBitmap, not an <img>');
  releasePicture(pic);
  releasePicture(pic); // (twice is harmless)
  assert.equal(bitmaps.open.size, 0);
});

test('across programme changes the director closes every decoded picture and keeps a bounded set of canvases', async () => {
  const { Director } = await import('../public/js/director.js');
  const d = new Director({ audio: {}, channel: { name: 'T', slogan: '', presenters: {} } });
  const episode = (n, stories) => ({
    rundown: Array.from({ length: stories }, (_, i) => ({ storyId: `s${String(n * 100 + i).padStart(10, '0')}`, hasImage: true })),
    segments: [],
  });
  const before0 = bitmaps.made;
  const perProgramme = [];
  for (let n = 0; n < 7; n++) {
    const m0 = made;
    await d.prepareImages(episode(n, n % 3 === 0 ? 10 : 3)); // a long programme every third, short ones between
    perProgramme.push(made - m0);
    assert.equal(bitmaps.open.size, 0, `programme ${n}: every decoded picture closed`);
    assert.ok(d.images.size <= 24 + 18, `programme ${n}: ${d.images.size} pictures kept`);
    for (const r of episode(n, n % 3 === 0 ? 10 : 3).rundown) assert.ok(d.images.has(r.storyId), 'the programme on air keeps all its pictures');
  }
  // (7 programmes: 3 of 10 stories and 4 of 3: 42 pictures, each decoded once and closed)
  assert.equal(bitmaps.made - before0, 42, 'one decode per new picture');
  assert.ok(bitmaps.closed >= 42);
  assert.ok(d.images.size < 42, `older programmes' pictures went (${d.images.size} kept)`);
  // the canvases a programme makes do not pile up: the director holds at most KEEP_PICTURES programmes' worth
  const held = [...d.images.values()].reduce((a, x) => a + 3 + (x.tile ? 1 : 0), 0);
  assert.ok(held <= (24 + 18) * 4, `${held} picture canvases held`);
});

test('the rendered strings are bounded as a whole, whatever the fonts, scales and colours drawn', async () => {
  const font = await import('../public/js/font.js');
  const ctx = fakeCanvas().getContext('2d');
  const m0 = made;
  // a day of clocks, tickers and captions in their colours: thousands of distinct strings
  for (let i = 0; i < 3000; i++) font.drawText(ctx, `LONDON ${String(i % 24).padStart(2, '0')}:${String(i % 60).padStart(2, '0')} STORY ${i}`, 0, 0, { color: ['#ffffff', '#ff004d', '#29adff', '#ffec27'][i % 4], scale: 1 + (i % 2), font: i % 3 ? 'body' : 'micro' });
  assert.ok(font.renderCacheSize() <= font.RENDER_LIMIT, `${font.renderCacheSize()} strings kept`);
  assert.equal(made - m0, 3000, 'each new string rendered once');
  // a string drawn every frame stays (least recently drawn goes first)
  font.drawText(ctx, 'GLOBIT 24', 0, 0, { color: '#ffffff' });
  const hot = made;
  for (let i = 0; i < 2000; i++) {
    font.drawText(ctx, `TICKER ${i}`, 0, 0, { color: '#ffffff' });
    font.drawText(ctx, 'GLOBIT 24', 0, 0, { color: '#ffffff' });
  }
  assert.equal(made - hot, 2000, 'the string drawn every frame never rendered again');
  assert.ok(font.renderCacheSize() <= font.RENDER_LIMIT);
});

test('a locator board keeps its pixels once (on its canvas), and the cache of boards is bounded', async () => {
  const wm = await import('../public/js/scenes/worldmap.js');
  wm.warmMapData();
  const { prepareLocator } = await import('../public/js/graphics/locator.js');
  const board = prepareLocator({ place: 'KYIV', lat: 50.45, lon: 30.52, scope: 'city' });
  assert.ok(board?.canvas);
  assert.equal(board.plan.pixels, null, 'the pixels live on the canvas only');
  assert.ok(board.plan.pin && Number.isFinite(board.plan.w), 'the plan keeps what drawing needs');
  assert.equal(prepareLocator({ place: 'KYIV', lat: 50.45, lon: 30.52, scope: 'city' }), board, 'a place drawn again soon is the same board');
  for (let i = 0; i < 40; i++) prepareLocator({ place: `P${i}`, lat: -30 + i, lon: 10 + i * 3, scope: 'city' });
  const m0 = made;
  prepareLocator({ place: 'KYIV', lat: 50.45, lon: 30.52, scope: 'city' });
  assert.equal(made - m0, 1, 'the oldest boards went: Kyiv was drawn again');
});
