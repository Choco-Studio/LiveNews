// On-screen graphics package (public/js/graphics) and the text/clock helpers it
// relies on. Logic runs under node --test; drawing runs against a recording
// fake 2D context (stub canvases) to prove the context is always left clean.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measureText, wrapText, wrapLines, normalizeText, fontMetrics } from '../public/js/font.js';
import { zoneTime, longDate, mulberry32 } from '../public/js/util.js';
import { THEME_ACCENT } from '../public/js/cast.js';
import { P } from '../public/js/palette.js';
import { paginate, pageAt, CaptionState, CAPTION_TIMING } from '../public/js/graphics/captions.js';
import { StrapState, strapContent, strapPage, categoryLabel, STRAP_TIMING, TEXT_ROOM } from '../public/js/graphics/strap.js';
import { TickerState, makeEntry, makeEntries, TICKER_TIMING, TICKER_ROOM } from '../public/js/graphics/ticker.js';
import { Graphics, OVERLAYS, BREAKING_STRAP } from '../public/js/graphics/index.js';
import { CAPTION, inkOn, clipped } from '../public/js/graphics/layout.js';
import { layoutText, linePages } from '../public/js/graphics/breaks.js';
import { buildTimeline, sampleTimeline } from '../public/js/audio/visemes.js';

// --- a recording 2D context and stub canvases (font.js / bug.js render offscreen) ---
function fakeCtx() {
  const ctx = {
    depth: 0,
    maxDepth: 0,
    globalAlpha: 1,
    fillStyle: '#000',
    imageSmoothingEnabled: false,
    save() {
      this.depth++;
      this.maxDepth = Math.max(this.maxDepth, this.depth);
    },
    restore() {
      this.depth--;
    },
    beginPath() {},
    rect() {},
    clip() {},
    fillRect() {},
    drawImage() {},
  };
  return ctx;
}
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => fakeCtx() }) };

// Reference implementation of the original quadratic wrap, to prove the fast one is identical.
function naiveWrap(text, maxWidth, scale = 1) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (measureText(test, scale) <= maxWidth || !line) line = test;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const LONG =
  'Oil prices fell for a third day as traders expect weaker demand this winter, with analysts warning that a mild season in Europe and slower factory output in Asia could keep prices under pressure well into next year.';

test('font: widths are unchanged for the body face and memoised calls agree', () => {
  assert.equal(measureText('A'), 5);
  assert.equal(measureText('AB'), 11);
  assert.equal(measureText('A B'), 14); // 5 + 1 + 3 + 5
  assert.equal(measureText('A', 2), 10);
  assert.equal(measureText(''), 0);
  assert.equal(measureText('Oil…'), measureText('OIL...'));
  assert.equal(normalizeText('ñandú «x»'), 'ÑANDÚ "X"');
});

test('font: fast wrap matches the reference wrap for many widths and scales', () => {
  const samples = [LONG, 'Hello world', 'Ñandú «quoted» — 6.1% $1.2bn', 'x'.repeat(90), 'a  b   c', ''];
  for (const s of samples) for (const scale of [1, 2, 3]) for (const w of [20, 60, 168, 336]) {
    assert.deepEqual(wrapText(s, w, scale), naiveWrap(s, w, scale), `${s.slice(0, 20)} @${w}x${scale}`);
  }
});

test('font: wrapText returns a fresh array, wrapLines a frozen shared one', () => {
  const a = wrapText(LONG, 100);
  a.length = 1;
  assert.ok(wrapText(LONG, 100).length > 1, 'mutating a result must not corrupt the cache');
  assert.ok(Object.isFrozen(wrapLines(LONG, 100)));
  assert.equal(wrapLines(LONG, 100), wrapLines(LONG, 100));
});

test('font: micro 3x5 face has its own metrics and narrower glyphs', () => {
  const m = fontMetrics('micro');
  assert.equal(m.cap, 5);
  assert.ok(m.lineHeight < fontMetrics('body').lineHeight);
  assert.equal(measureText('A', 1, 'micro'), 3);
  assert.equal(measureText('M', 1, 'micro'), 5);
  assert.equal(measureText('A B', 1, 'micro'), 3 + 1 + 2 + 3);
  assert.ok(measureText('FIXTURE BUSINESS WIRE', 1, 'micro') < measureText('FIXTURE BUSINESS WIRE') * 0.75);
  for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:-/%&') assert.ok(measureText(ch, 1, 'micro') >= 1, ch);
  assert.deepEqual(wrapText('one two three four', 30, 1, 'micro').length > 1, true);
});

test('util: zoneTime is cached per minute and accepts Date or epoch ms', () => {
  const at = Date.UTC(2026, 9, 2, 14, 52, 21);
  const a = zoneTime('Europe/London', at);
  assert.deepEqual({ ...a }, { h: 15, m: 52, label: '15:52' });
  assert.equal(zoneTime('Europe/London', new Date(at + 20000)), a, 'same minute -> same frozen object');
  assert.equal(zoneTime('Asia/Tokyo', at).label, '23:52');
  assert.equal(zoneTime('Europe/London', at + 60000).label, '15:53');
  assert.equal(longDate(at), 'Friday 2 October');
});

test('cast: programme accents follow the art direction', () => {
  assert.deepEqual(THEME_ACCENT, { world: P.red, tech: P.cyan, space: P.magenta, money: P.green, flash: P.yellow });
  assert.equal(inkOn(P.cyan), P.black);
  assert.equal(inkOn(P.yellow), P.black);
  assert.equal(inkOn(P.red), P.white);
});

test('captions: a long sentence is paged two lines at a time and no line is lost', () => {
  const pages = paginate(LONG);
  assert.ok(pages.length >= 2);
  for (const p of pages) assert.ok(p.lines.length >= 1 && p.lines.length <= 2);
  const words = pages.flatMap((p) => p.lines).join(' ');
  assert.equal(words, LONG.split(/\s+/).join(' '));
  for (const p of pages) for (const l of p.lines) assert.ok(measureText(l) <= CAPTION.maxW);
  // page offsets point at the first character of each page
  for (const p of pages) assert.equal(LONG.slice(p.start, p.start + p.lines[0].length), p.lines[0]);
});

test('captions: lines break at phrases, are balanced, and a one-line sentence stays on one line', () => {
  const text = 'Traders expect weaker demand this winter and analysts agree with them.';
  const [page] = paginate(text, 260);
  assert.equal(page.lines.length, 2);
  assert.match(page.lines[1], /^and analysts/, 'the second line starts the new clause');
  const [a, b] = page.lines.map((l) => measureText(l));
  assert.ok(Math.abs(a - b) < 80, `balanced lines (${a} vs ${b})`);
  assert.deepEqual(paginate('Good evening, and welcome to World Now.')[0].lines, ['Good evening, and welcome to World Now.']);
  assert.ok(CAPTION.maxW <= 270, 'about 44 characters a line (subtitle practice)');
  // no line or page of a long sentence ends on an article or a preposition
  const weak = /\b(a|an|the|of|to|in|on|at|by|for|from|with|and)$/i;
  for (const p of paginate(LONG)) for (const l of p.lines) assert.ok(!weak.test(l), `weak line end: "${l}"`);
  // a page breaks at the clause comma
  assert.match(paginate(LONG)[0].lines.at(-1), /winter,$/);
});

test('breaks: numbers stay with their nouns, words are never lost', () => {
  const s = 'Officials said the storm had damaged more than 40 per cent of the crops in the region, and farmers fear the worst.';
  const pages = layoutText(s, { maxW: 200, perPage: 2 });
  const lines = pages.flatMap((p) => p.lines);
  assert.equal(lines.join(' '), s);
  for (const l of lines) assert.ok(!/\b40$|\bper$/.test(l), `number cut from its unit: "${l}"`);
  for (const p of pages) assert.equal(s.slice(p.start, p.start + p.lines[0].length), p.lines[0]);
  assert.deepEqual(layoutText('   ', { maxW: 100 }), []);
});

test('captions: pages follow the speech pace (or a known character index)', () => {
  const pages = paginate(LONG);
  assert.equal(pageAt(pages, 0), 0);
  const second = pages[1].start / CAPTION_TIMING.cps;
  assert.equal(pageAt(pages, second - 1), 0);
  assert.equal(pageAt(pages, second + 0.1), 1);
  assert.equal(pageAt(pages, 0.5, pages[1].start), 0, 'a page stays up for its minimum time');
  assert.equal(pageAt(pages, 5, pages[1].start), 1);
});

test('captions: driven by the real speech timeline, pages only move forward and the last page airs', () => {
  for (const rate of [0.7, 1, 1.4]) {
    const tl = buildTimeline(LONG, { rate });
    const pages = paginate(LONG);
    const s = new CaptionState();
    const frame = {};
    let last = -1;
    const end = tl.total / 1000 + 2;
    for (let t = 0; t < end; t += 1 / 60) {
      const f = sampleTimeline(tl, t * 1000, frame);
      s.update(t, LONG, 0, f.speaking ? f.charIndex : null);
      assert.ok(s.page >= last, `page went back at ${t.toFixed(2)} s (rate ${rate})`);
      last = s.page;
    }
    assert.equal(last, pages.length - 1, `last page reached at rate ${rate}`);
  }
});

test('captions: a whitespace-only subtitle is no caption (and never throws)', () => {
  const s = new CaptionState();
  s.update(0, '   ');
  assert.equal(s.active, false);
  s.update(0.1, 'Hello.');
  s.update(0.2, ' \n ');
  assert.equal(s.active, true, 'the previous caption lingers, then clears');
});

test('captions: state rolls pages, keeps the caption briefly after speech, then clears', () => {
  const s = new CaptionState();
  s.update(0, LONG, 0);
  assert.equal(s.page, 0);
  const second = pages2Time();
  s.update(second, LONG);
  assert.equal(s.page, 1);
  assert.ok(s.prevLines.length >= 1);
  s.update(second + 1, null);
  assert.ok(s.active, 'lingers after speech');
  s.update(second + 1 + CAPTION_TIMING.hold + CAPTION_TIMING.fade + 0.01, null);
  assert.ok(!s.active);
  function pages2Time() {
    return paginate(LONG)[1].start / CAPTION_TIMING.cps + 0.2;
  }
});

test('strap: content picks kicker, category, source and breaking', () => {
  const base = { headline: 'Oil prices slide', source: 'Fixture Business Wire', since: 3 };
  assert.equal(strapContent({ ...base, category: 'business' }).tag, 'BUSINESS');
  assert.equal(strapContent({ ...base, category: 'business', kicker: 'Oil markets' }).tag, 'Oil markets');
  const plain = strapContent(base);
  assert.equal(plain.tag, 'Fixture Business Wire');
  assert.equal(plain.plate, '', 'source is not repeated when it is the tag');
  const br = strapContent({ ...base, breaking: true, category: 'world' }, { accent: P.cyan });
  assert.equal(br.tag, 'BREAKING');
  assert.equal(br.tagColor, P.red);
  assert.equal(strapContent({ ...base, showName: true, anchorName: 'PACO PIXEL' }).name, 'PACO PIXEL');
  assert.equal(categoryLabel('general'), 'NEWS');
});

test('strap: wipes in at `since`, flips on a story change, turns red, and leaves', () => {
  const s = new StrapState();
  const a = strapContent({ headline: 'First story', source: 'Wire', category: 'world', since: 1 });
  const b = strapContent({ headline: 'Second story', source: 'Wire', category: 'world', since: 9 });
  const br = strapContent({ headline: 'Quake', source: 'Wire', breaking: true, since: 12 });
  s.update(0, a);
  assert.equal(s.inAt, 1, 'enters at its scheduled time');
  assert.equal(s.reveal(0.5), 0);
  assert.equal(s.reveal(1 + STRAP_TIMING.in), 1);
  s.update(5, a);
  s.update(8, b);
  assert.equal(s.flipAt, 8);
  assert.equal(s.prev, a);
  assert.equal(s.reveal(8.1), 1, 'the bar stays during a flip');
  s.update(12, br);
  assert.equal(s.redAt, 12);
  assert.equal(s.redFrom, false);
  s.update(20, null);
  assert.equal(s.outAt, 20);
  assert.ok(s.reveal(20.1) > 0 && s.reveal(20.1) < 1);
  s.update(20 + STRAP_TIMING.out, null);
  assert.equal(s.cur, null);
});

test('strap: called back while leaving, it wipes in again from where it is (no pop)', () => {
  const s = new StrapState();
  const a = strapContent({ headline: 'Story', source: 'Wire', since: 0 });
  s.update(0, a);
  s.update(2, null);
  const r = s.reveal(2.15);
  s.update(2.15, a);
  assert.ok(Math.abs(s.reveal(2.15) - r) < 0.02);
  assert.equal(s.outAt, null);
});

test('ticker: flips one item at a time with the documented hold, breaking interrupts', () => {
  const items = [makeEntry({ source: 'A', text: 'one two three' }), makeEntry({ source: 'B', text: 'four five' })];
  assert.equal(items[0].dur, TICKER_TIMING.push + TICKER_TIMING.base + 3 * TICKER_TIMING.perWord);
  const s = new TickerState();
  s.update(0, items, 1);
  assert.equal(s.cur, items[0]);
  s.update(items[0].dur + 0.01, items, 1);
  assert.equal(s.cur, items[1]);
  assert.equal(s.prev, items[0]);
  assert.ok(Math.abs(s.start - items[0].dur) < 1e-9, 'rhythm is exact');
  const br = makeEntry({ label: 'BREAKING', plate: P.red, source: 'W', text: 'quake', breaking: true });
  s.update(3, [br, ...items], 2);
  assert.equal(s.cur, br);
  assert.equal(s.start, 3);
});

test('ticker: a headline wider than the band becomes whole-word pages that fit (no crawl)', () => {
  const text = 'New Zealand city of Wellington trials four-day school week for one term across twelve schools';
  const pages = makeEntries({ source: 'Fixture World Wire', text });
  assert.ok(pages.length >= 2 && pages.length <= 3);
  for (const e of pages) {
    const srcW = e.source ? measureText(e.source, 1, 'micro') + 5 : 0;
    assert.ok(srcW + measureText(e.text) <= TICKER_ROOM, `page fits: ${e.text}`);
    assert.ok(e.dur >= TICKER_TIMING.push + TICKER_TIMING.base);
  }
  for (const e of pages.slice(0, -1)) assert.match(e.text, /\.\.\.$/);
  assert.equal(pages.slice(1).every((e) => !e.source), true, 'source only on the first page');
  assert.equal(pages.map((e) => e.text.replace(/\.\.\.$/, '')).join(' '), text);
  // a short item keeps its source; one that only fits alone drops it rather than paging
  assert.equal(makeEntry({ source: 'Wire', text: 'Short' }).source, 'Wire');
  const alone = makeEntries({ source: 'Fixture Business Wire', text: 'Smartphone battery breakthrough promises a week' });
  assert.equal(alone.length, 1);
  assert.equal(alone[0].source, '');
  assert.deepEqual(makeEntries({ text: '   ' }), []);
});

test('ticker: a breaking item interrupts once; later list rebuilds keep the rotation', () => {
  const items = [makeEntry({ source: 'A', text: 'one two three' }), makeEntry({ source: 'B', text: 'four five' })];
  const br = makeEntry({ label: 'BREAKING', plate: P.red, source: 'W', text: 'quake hits', breaking: true });
  const s = new TickerState();
  s.update(0, [br, ...items], 1);
  assert.equal(s.cur, br);
  s.update(br.dur + 0.01, [br, ...items], 1);
  assert.equal(s.cur, items[0]);
  s.update(br.dur + 0.5, [br, ...items, makeEntry({ label: 'NEXT', text: 'Cosmos Desk' })], 2);
  assert.equal(s.cur, items[0], 'an unrelated rebuild does not jump back to the breaking item');
});

test('strap: a long breaking headline is paged (never scrolled) and every page is read once', () => {
  const text = 'Earthquake of magnitude 7.4 strikes off the coast of central Chile, tsunami warning issued for the Pacific coast';
  const c = strapContent({ headline: text, source: 'Wire', breaking: true, since: 0 });
  assert.ok(c.pages.length >= 2);
  for (const p of c.pages) assert.ok(measureText(p) <= TEXT_ROOM, p);
  const seen = new Set();
  for (let t = 0; t < 20; t += 0.05) seen.add(strapPage(c, t).i);
  assert.equal(seen.size, c.pages.length);
  assert.equal(strapPage(c, 60).i, c.pages.length - 1, 'breaking holds its last page');
  const story = strapContent({ headline: text, source: 'Wire', since: 0 });
  assert.equal(strapPage(story, 60).i, 0, 'a story strap returns to its first page');
  assert.equal(strapContent({ headline: 'Short headline', since: 0 }).pages.length, 1);
});

test('graphics: overlay modes, programme tag hold, breaking takes the strap, captions lift', () => {
  assert.equal(OVERLAYS.wide, 'news');
  assert.equal(OVERLAYS.breakingCard, 'bug');
  const g = new Graphics({ now: () => 0 });
  const lt = { headline: 'Oil prices slide', source: 'Wire', since: 2 };
  const scene = { shot: 'open', ticker: [], lowerThird: null, subtitle: null, subtitles: true, programTagUntil: null };
  const step = (from, to, mut = {}) => {
    Object.assign(scene, mut);
    for (let t = from; t < to; t += 1 / 60) g.update(t, scene);
  };
  step(0, 1);
  assert.equal(g.mode, null);
  step(1, 1.5, { shot: 'wide', programTagUntil: 16 });
  assert.ok(Math.abs(g.onAt - 1) < 0.02);
  assert.ok(g.tagIn > 1 && g.tagIn < 2);
  step(1.5, 11);
  assert.ok(g.tagOut !== null && g.tagOut < 10.5, 'programme name hides after ~8 s');
  step(11, 12, { lowerThird: lt });
  assert.equal(g.strap.cur.headline, 'Oil prices slide');
  step(12, 13, { breaking: { source: 'W', text: 'Quake', since: 12 }, ticker: [{ source: 'A', text: 'Other news' }] });
  assert.equal(g.strap.cur.tag, 'BREAKING');
  assert.equal(g.ticker.cur.breaking, false, 'the ticker does not repeat what the strap shows');
  step(13, 12 + BREAKING_STRAP + 0.1);
  assert.equal(g.strap.cur.headline, 'Oil prices slide', 'story strap returns after the breaking hold');
  assert.equal(g.ticker.cur.breaking, false, 'one push at a time');
  step(12 + BREAKING_STRAP + 0.1, 12 + BREAKING_STRAP + 1.2);
  assert.equal(g.ticker.cur.breaking, true, 'then the ticker takes the breaking item');
  step(12 + BREAKING_STRAP + 1.2, 26);
  step(26, 27, { subtitle: 'Hello there.' });
  assert.equal(g.captionPlace(27, scene).bottom, CAPTION.bottomStrap);
  step(27, 28, { lowerThird: null });
  step(28, 29.5);
  assert.equal(g.captionPlace(29.5, scene).bottom, CAPTION.bottomFree);
  step(29.5, 30, { shot: 'montage' });
  assert.equal(g.captionPlace(30, scene).top, CAPTION.top);
  step(30, 31, { shot: 'ad' });
  assert.equal(g.mode, 'ad');
  assert.equal(g.strap.cur, null);
});

test('graphics: a broken speechFrame never breaks captions', () => {
  const audio = { speechFrame() { throw new Error('boom'); } };
  const g = new Graphics({ audio, now: () => 0 });
  const scene = { shot: 'wide', ticker: [], subtitle: 'Hello.', subtitles: true };
  const warn = console.warn;
  console.warn = () => {};
  try {
    g.update(0, scene);
    g.update(0.1, scene);
  } finally {
    console.warn = warn;
  }
  assert.deepEqual([...g.captions.lines], ['Hello.']);
});

test('graphics: a long live breaking item holds the strap until its last page has been read', () => {
  const g = new Graphics({ now: () => 0 });
  const text = 'Earthquake of magnitude 7.4 strikes off the coast of central Chile, tsunami warning issued for the Pacific coast and residents told to move to higher ground';
  const scene = { shot: 'wide', ticker: [], lowerThird: { headline: 'Story', source: 'Wire', since: 0 }, breaking: { source: 'W', text, since: 1 } };
  for (let t = 0; t < 30; t += 1 / 30) g.update(t, scene);
  const c = g.brContent;
  assert.ok(c.pages.length === 3);
  const lastPageAt = 1 + STRAP_TIMING.in + STRAP_TIMING.textDelay + STRAP_TIMING.textRise + (c.pages.length - 1) * STRAP_TIMING.breakingPage;
  assert.ok(g.brUntil >= lastPageAt + 3, 'the last page stays up for a full read');
});

test('graphics: out of a programme open the top row is already settled (no second wipe or glint)', () => {
  const g = new Graphics({ now: () => 0 });
  const scene = { shot: 'open', ticker: [] };
  g.update(0, scene);
  g.update(4, scene);
  scene.shot = 'wide';
  g.update(4.02, scene);
  assert.ok(g.topAt <= 4.02 - 3);
  assert.ok(Math.abs(g.onAt - 4.02) < 1e-9, 'the programme tag and ticker still enter from the cut');
  const h = new Graphics({ now: () => 0 });
  h.update(0, { shot: 'ad' });
  h.update(1, { shot: 'wide' });
  assert.equal(h.topAt, 1, 'back from a break: wipe in and glint');
});

test('graphics: no kicker and a category that repeats the programme beat -> the tag shows the source', () => {
  const g = new Graphics({ now: () => 0 });
  const lt = { headline: 'Volcano erupts', source: 'Pixelburg Post', since: 0 };
  const scene = { shot: 'wide', ticker: [], program: { title: 'WORLD NOW', theme: 'world' }, storyId: 's1', rundown: [{ storyId: 's1', category: 'world' }], lowerThird: lt };
  g.update(0, scene);
  assert.equal(g.strap.cur.tag, 'Pixelburg Post');
  scene.lowerThird = { ...lt, kicker: 'VOLCANO' };
  g.update(0.1, scene);
  assert.equal(g.strap.cur.tag, 'VOLCANO');
  scene.program = { title: 'NEWS IN 60', theme: 'flash' };
  scene.lowerThird = { ...lt };
  g.update(0.2, scene);
  assert.equal(g.strap.cur.tag, 'WORLD');
});

test('graphics: a caption that only repeats the strap headline is not burnt in', () => {
  const g = new Graphics({ now: () => 0 });
  const scene = { shot: 'wide', ticker: [], lowerThird: { headline: 'Iceland volcano erupts again', source: 'W', since: 0 }, subtitle: null };
  for (let t = 0; t < 1; t += 1 / 30) g.update(t, scene);
  scene.subtitle = "Iceland's volcano erupts again.";
  g.update(1, scene);
  assert.equal(g.captions.active, false);
  scene.subtitle = 'Iceland volcano erupts again on the Reykjanes peninsula.';
  g.update(1.1, scene);
  assert.equal(g.captions.active, true);
});

test('graphics: the ticker band waits for something to say', () => {
  const g = new Graphics({ now: () => 0 });
  const scene = { shot: 'wide', ticker: [] };
  g.update(0, scene);
  assert.equal(g.band.on, false);
  scene.ticker = [{ source: 'A', text: 'Hello' }];
  g.update(2, scene);
  assert.equal(g.band.on, true);
  assert.equal(g.band.inAt, 2);
});

test('layout: clipped() restores the context even when its callback throws', () => {
  const ctx = fakeCtx();
  assert.throws(() => clipped(ctx, 0, 0, 10, 10, () => { throw new Error('boom'); }));
  assert.equal(ctx.depth, 0);
});

test('graphics: fuzzed scenes never throw out of draw() and always leave the context clean', () => {
  const rnd = mulberry32(7);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const str = () => pick(['', ' ', '   \n', 'Hello there.', 'ÑANDÚ MÉXICO élections', 'x'.repeat(300), 'Earthquake strikes, tsunami warning issued for the coast and residents told to move', 42, null, undefined, {}]);
  const shots = ['wide', 'close', 'full', 'map', 'fact', 'montage', 'breakingCard', 'ad', 'open', 'ident', null, 7, 'nonsense'];
  const g = new Graphics({ audio: { speechFrame: () => pick([null, { speaking: true, charIndex: rnd() * 400 }, { speaking: true, charIndex: NaN }, undefined]) }, now: () => pick([0, Date.now(), NaN]) });
  const ctx = fakeCtx();
  const errors = console.error;
  const logged = [];
  console.error = (...a) => logged.push(a);
  try {
    let t = 0;
    for (let i = 0; i < 6000; i++) {
      t += pick([1 / 60, 1 / 60, 1 / 60, 0.5, 3]);
      const scene = {
        shot: pick(shots),
        overlay: pick([undefined, undefined, 'news', 'bug', 'ad', null, 'x']),
        program: pick([null, {}, { title: 'WORLD NOW', theme: 'world' }, { title: str(), theme: pick(['tech', 'money', 'flash', 'zzz']) }]),
        replay: rnd() < 0.2,
        programTagUntil: pick([null, t + 5, 'soon', NaN]),
        lowerThird: pick([null, null, {}, 'oops', { headline: str(), source: str(), since: pick([t, t + 1, NaN, 'x']), breaking: rnd() < 0.2, showName: true, anchorName: str(), kicker: pick([undefined, 'VOLCANO', 5]) }]),
        storyId: pick([null, 's1', 3]),
        rundown: pick([[], [{ storyId: 's1', category: 'world', kicker: 'X' }], 'nope', { find: 1 }, null, [null, 5]]),
        subtitle: str(),
        subtitles: pick([true, false, undefined]),
        subtitleSince: pick([undefined, t, NaN, 'x']),
        breaking: pick([null, null, { text: str(), source: str(), since: pick([t, t - 5, NaN, 'x']) }, 'bad']),
        ticker: pick([[], [{ source: 'A', text: 'Hello' }], [null, 5, {}, { text: str() }], 'x', null]),
        schedule: pick([null, {}, { upcoming: [] }, { upcoming: [{ title: str(), tagline: str() }] }, { upcoming: 'x' }]),
        captionZone: pick([undefined, 'top', 3]),
      };
      g.draw(ctx, t, scene);
      assert.equal(ctx.depth, 0, `save/restore balanced at frame ${i}`);
      assert.equal(ctx.globalAlpha, 1, `globalAlpha restored at frame ${i}`);
    }
  } finally {
    console.error = errors;
  }
  assert.deepEqual(logged, [], 'no element threw');
});

test('graphics: an exception inside a clipped region is contained and the context stays clean', () => {
  const g = new Graphics({ now: () => 0 });
  const ctx = fakeCtx();
  let armed = true;
  const drawImage = ctx.drawImage;
  ctx.drawImage = function (...a) {
    if (armed && this.depth > 0) {
      armed = false;
      throw new Error('injected');
    }
    return drawImage.apply(this, a);
  };
  const scene = { shot: 'wide', ticker: [{ source: 'A', text: 'Hello' }], lowerThird: { headline: 'Story', source: 'W', since: 0 }, subtitle: 'Hi there.' };
  const errors = console.error;
  console.error = () => {};
  try {
    for (let t = 0; t < 3; t += 1 / 30) {
      g.draw(ctx, t, scene);
      assert.equal(ctx.depth, 0);
      assert.equal(ctx.globalAlpha, 1);
    }
  } finally {
    console.error = errors;
  }
  assert.equal(armed, false, 'the injected error fired');
  assert.equal(g.errors.size, 1, 'logged once');
});
