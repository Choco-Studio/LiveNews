// A clip's end card promises a stream only when there is one (docs/publishing/compliance.md §3.2, vertical.md §5): WATCH
// LIVE only when the channel streams live (its address set, CHANNEL_LIVE_URL, and real-time air), "24 hours a day" for
// the pre-rendered stream, and nothing about where to watch without one (the manual beta has no stream: beta.md). The
// factory and the whole-programme upload ask the lab page for the card with that mode (airmode.js streamOf).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/** A context that counts what is drawn (the pixel face draws each glyph's runs). */
function countingCtx() {
  return {
    ops: 0,
    depth: 0,
    fillStyle: '#000',
    globalAlpha: 1,
    imageSmoothingEnabled: false,
    save() {
      this.depth++;
    },
    restore() {
      this.depth--;
    },
    beginPath() {},
    translate() {},
    rect() {},
    clip() {},
    putImageData() {},
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    fillRect() {
      this.ops++;
    },
    drawImage() {
      this.ops++;
    },
  };
}
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => countingCtx() }) };

const { streamOf, watchLine, falseLive } = await import('../public/js/airmode.js');
const cards = await import('../public/js/clip/cards.js');

test('streamOf: a stream only with its address; live only when the channel does not air pre-rendered', () => {
  const URL_ = 'https://www.youtube.com/@globit24/live';
  assert.equal(streamOf(), 'none', 'the manual beta: no address, no stream');
  assert.equal(streamOf({ url: '', recorded: false }), 'none');
  assert.equal(streamOf({ url: '  ', recorded: true }), 'none');
  assert.equal(streamOf({ url: null, recorded: true }), 'none', 'pre-rendered playout with no public stream: nothing to point to');
  assert.equal(streamOf({ url: URL_ }), 'live');
  assert.equal(streamOf({ url: URL_, recorded: true }), 'recorded');
  assert.equal(streamOf({ url: URL_, recorded: 'playout' }), 'recorded');
});

test('watchLine: WATCH LIVE for a live stream alone; 24 hours a day for the pre-rendered one; nothing without a stream', () => {
  for (const vertical of [true, false]) {
    assert.match(watchLine('live', { vertical }), /WATCH LIVE$/);
    assert.equal(falseLive(watchLine('recorded', { vertical })), null, 'pre-rendered: never LIVE');
    assert.match(watchLine('recorded', { vertical }), /^NEWS 24/);
    assert.equal(watchLine('none', { vertical }), null);
    assert.equal(watchLine(undefined, { vertical }), null, 'unknown: no promise');
  }
});

test('the end card: no stream, no promise (and no LIVE anywhere on it); a live stream alone says WATCH LIVE', () => {
  for (const format of ['vertical', 'horizontal']) {
    const none = cards.endCardText({ format, programme: 'WORLD NOW' });
    assert.equal(none.watch, null, `${format}: the default is no stream`);
    const all = (x) => [x.slogan, x.from, x.watch, ...x.rows].filter(Boolean).join(' / ');
    assert.equal(falseLive(all(none)), null, `${format}: ${all(none)}`);
    assert.doesNotMatch(all(none), /24 HOURS|24\/7|WATCH/, `${format}: nothing about where to watch`);
    const rec = cards.endCardText({ format, programme: 'WORLD NOW', stream: 'recorded' });
    assert.equal(falseLive(all(rec)), null, `${format}: pre-rendered`);
    assert.match(rec.watch, /^NEWS 24/);
    assert.match(cards.endCardText({ format, programme: 'WORLD NOW', stream: 'live' }).watch, /WATCH LIVE/);
    // the drawing follows the words: the watch line is drawn only when there is one
    const count = (stream) => {
      const c = countingCtx();
      cards.drawEndCard(c, 2.5, { format, programme: 'WORLD NOW', stream });
      assert.equal(c.depth, 0);
      return c.ops;
    };
    assert.ok(count('live') > count('none'), `${format}: WATCH LIVE drawn for a live stream`);
    assert.ok(count('recorded') > count('none'), `${format}: the 24-hour line drawn for the pre-rendered stream`);
    assert.equal(count(undefined), count('none'), `${format}: no mode given, no line`);
  }
});

test('the factory and the whole-programme upload ask for the card with the stream mode from CHANNEL_LIVE_URL', () => {
  const lab = fs.readFileSync(new URL('../public/lab/clip.html', import.meta.url), 'utf8');
  assert.match(lab, /stream: qs\.get\('stream'\) \|\| 'none'/, 'the lab page: none unless told');
  assert.doesNotMatch(lab, /live: /, 'no live switch left on the lab page');
  for (const f of ['../tools/publish/factory.mjs', '../tools/publish/upload.mjs']) {
    const src = fs.readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.match(src, /streamOf\(\{ url: process\.env\.CHANNEL_LIVE_URL \|\| null, recorded \}\)/, f);
    assert.match(src, /run=end&format=.*&stream=\$\{stream\}/, f);
    assert.doesNotMatch(src, /&live=0/, f);
  }
  // the factory's cache of rendered end cards is per mode, so a card made for one never serves another
  assert.match(fs.readFileSync(new URL('../tools/publish/factory.mjs', import.meta.url), 'utf8'), /endcard-\$\{prog\}-\$\{fmt\}-\$\{stream\}\.mkv/);
});

test('the vertical end card shows one globe: the emblem over the wordmark\'s plate, not over the bug and its own globe', async () => {
  const src = fs.readFileSync(new URL('../public/js/clip/cards.js', import.meta.url), 'utf8');
  assert.match(src, /\{ variant: 'mark', scale: mark, y: 46 \}, \{ variant: 'wordmark', scale: 2,/);
  // (the emblem at 4x; at 3x when the card carries an invitation: shorts-v2.md A5)
  assert.match(src, /const mark = vertical && text\.cta \? 3 : 4;/);
  const { measureLogo } = await import('../public/js/logo.js');
  assert.ok(measureLogo({ variant: 'wordmark' }).w < measureLogo({ variant: 'bug' }).w, 'the bug without its globe');
  assert.equal(measureLogo({ variant: 'wordmark' }).h, measureLogo({ variant: 'bug' }).h);
});
