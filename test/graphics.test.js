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
import { StrapState, strapContent, strapPage, categoryLabel, drawStrap, STRAP_TIMING, TEXT_ROOM, BAR_TOP } from '../public/js/graphics/strap.js';
import { TickerState, makeEntry, makeEntries, makeFigureEntry, makeNextEntry, TICKER_TIMING, TICKER_ROOM } from '../public/js/graphics/ticker.js';
import { Graphics, OVERLAYS, BREAKING_STRAP, BREAKING_TICKER, BREAKING_MAX_AGE, PROGRAM_TAG, programGraphics, sameStory } from '../public/js/graphics/index.js';
import { FrameGuard, GUARD_HOLD } from '../public/js/graphics/guard.js';
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
  assert.deepEqual(THEME_ACCENT, { world: P.red, tech: P.cyan, space: P.magenta, money: P.green, flash: P.yellow, weather: P.blue });
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
  s.update(second + 1 + CAPTION_TIMING.hold + CAPTION_TIMING.out + 0.01, null);
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
  assert.equal(plain.tag, 'NEWS', 'no kicker, category or place: a neutral tag, never the outlet');
  assert.equal(plain.plate, 'Fixture Business Wire', 'the outlet always sits in the micro plate');
  assert.equal(strapContent({ ...base, place: 'ITALY' }).tag, 'ITALY');
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
  for (const e of pages.slice(1)) assert.match(e.text, /^\.\.\./, 'a continuation page reads as one');
  assert.equal(pages.slice(1).every((e) => !e.source), true, 'source only on the first page');
  assert.equal(pages.map((e) => e.text.replace(/\.\.\.$/, '').replace(/^\.\.\./, '')).join(' '), text);
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

test('graphics: no kicker and a category that repeats the programme beat -> place, else NEWS; outlet stays in the plate', () => {
  const g = new Graphics({ now: () => 0 });
  const lt = { headline: 'Volcano erupts', source: 'Pixelburg Post', since: 0 };
  const scene = { shot: 'wide', ticker: [], program: { title: 'WORLD NOW', theme: 'world' }, storyId: 's1', rundown: [{ storyId: 's1', category: 'world' }], lowerThird: lt };
  g.update(0, scene);
  assert.equal(g.strap.cur.tag, 'NEWS');
  assert.equal(g.strap.cur.plate, 'Pixelburg Post');
  scene.lowerThird = { ...lt, location: { place: 'Grindavik, Iceland' } };
  g.update(0.05, scene);
  assert.equal(g.strap.cur.tag, 'ICELAND');
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

// --- fix round 2 ---------------------------------------------------------------

// Real subtitling probes (critic 1, round 2): each must break at a phrase. Golden layouts.
const CAPTION_GOLDEN = [
  ['The Panama Canal has reopened to ships after fog closed it for a day, Ledger Line reports.',
    'The Panama Canal has reopened / to ships after fog closed it for a day, || Ledger Line reports.'],
  ['And finally: coral recovers on parts of the Great Barrier Reef, Bitport Herald reports.',
    'And finally: coral recovers / on parts of the Great Barrier Reef, || Bitport Herald reports.'],
  ['Officials in New Zealand say the trial will run until the end of the school year in December.',
    'Officials in New Zealand say the trial will run / until the end of the school year in December.'],
  ['The company said the new chip would be available before Christmas in the United States and Europe.',
    'The company said the new chip would be available / before Christmas in the United States and Europe.'],
  ['Rescue teams worked through the night after the storm, which hit the coast during high tide.',
    'Rescue teams worked / through the night after the storm, || which hit the coast during high tide.'],
  ['Prime Minister Ana Silva said the deal was signed in São Paulo on Tuesday after months of talks.',
    'Prime Minister Ana Silva said the deal was signed / in São Paulo on Tuesday after months of talks.'],
  ['Prices rose 4.5 per cent in September, the highest rate since 2023, the statistics office said.',
    'Prices rose 4.5 per cent in September, || the highest rate since 2023, / the statistics office said.'],
  ['It is the third eruption since December, and lava has reached the edge of the town of Grindavik.',
    'It is the third eruption since December, || and lava has reached the edge / of the town of Grindavik.'],
  ['Scientists say the water vapour was found using the James Webb Space Telescope over several nights.',
    'Scientists say the water vapour was found / using the James Webb Space Telescope || over several nights.'],
];
const show = (pages) => pages.map((p) => p.lines.join(' / ')).join(' || ');

test('captions r2: realistic sentences break at phrases (golden layouts), names and modifiers stay whole', () => {
  for (const [text, want] of CAPTION_GOLDEN) assert.equal(show(paginate(text)), want);
  // one line at a time (a strap is up) keeps the same phrase breaks
  assert.equal(show(paginate(CAPTION_GOLDEN[6][0], CAPTION.maxW, 1)), 'Prices rose 4.5 per cent in September, || the highest rate since 2023, || the statistics office said.');
  const lines = CAPTION_GOLDEN.flatMap(([text]) => [...paginate(text), ...paginate(text, CAPTION.maxW, 1)].flatMap((p) => p.lines));
  for (const l of lines) {
    assert.doesNotMatch(l, /\b(the|a|of|to|in|after|before|through|during|across)$/i, `no line ends on a weak word: ${l}`);
    assert.doesNotMatch(l, /\b(Great|New|United|James Webb Space)$/, `names stay whole: ${l}`);
  }
});

test('captions r2: one line per page while a strap is up; a strap arriving mid-sentence re-pages forward', () => {
  const s = new CaptionState();
  s.update(0, LONG, 0, null, 2);
  assert.equal(s.lines.length, 2);
  const first = s.pages[0].lines.join(' ');
  s.update(3, LONG, 0, null, 1); // the strap came on: same sentence, one line at a time
  assert.equal(s.perPage, 1);
  assert.equal(s.lines.length, 1);
  // the line shown is still inside what was on screen (nothing skipped)
  assert.ok(first.includes(s.lines[0]) || s.pages[s.page].start <= paginate(LONG)[1].start, s.lines[0]);
  let last = s.page;
  for (let t = 3; t < 20; t += 0.1) {
    s.update(t, LONG, 0, null, 1);
    assert.ok(s.page >= last, 'pages only move forward');
    last = s.page;
  }
  assert.equal(s.page, s.pages.length - 1, 'the last line airs');
});

test('captions r2: white on black, and the caption goes off whole after its hold (no alpha, no roll)', async () => {
  const { CAPTION_COLOR, drawCaptions, CAPTION_TIMING: CT } = await import('../public/js/graphics/captions.js');
  assert.equal(CAPTION_COLOR, P.white);
  const s = new CaptionState();
  s.update(0, 'Hello there.', 0);
  s.update(2, null);
  const ctx = fakeCtx();
  const alphas = [];
  const fill = ctx.fillRect;
  ctx.fillRect = function (...a) {
    alphas.push(this.globalAlpha);
    return fill.apply(this, a);
  };
  for (let t = 2; t < 2 + CT.hold + CT.out; t += 0.02) drawCaptions(ctx, t, s, { bottom: 196 });
  assert.ok(alphas.length > 0 && alphas.every((a) => a === 1));
  assert.equal(ctx.depth, 0);
});

test('captions: a new page wipes in diagonally from the bottom-left, erasing the old one with the same front', async () => {
  const { drawCaptions, CAPTION_TIMING: CT } = await import('../public/js/graphics/captions.js');
  const { CAPTION } = await import('../public/js/graphics/layout.js');
  const s = new CaptionState();
  const text = 'The storm weakened slightly as it moved inland over the Yucatan Peninsula, forecasters said on Sunday.';
  s.update(0, text, 0, null, 1); // a strap is up: one line per page
  const first = s.lines.slice();
  let t = 0;
  while (s.lines[0] === first[0]) {
    t += 0.05;
    s.update(t, text, 0, null, 1);
    assert.ok(t < 20, 'the caption reaches a second page');
  }
  const at = s.changeAt;
  const bottom = 160;
  const frame = (dt) => {
    const ctx = fakeCtx();
    const clips = [];
    let cur = null;
    ctx.beginPath = () => (cur = []);
    ctx.rect = (x, y, w, h) => cur.push({ x, y, w, h });
    ctx.clip = () => clips.push(cur);
    const boxes = [];
    const fill = ctx.fillRect;
    ctx.fillRect = function (x, y, w, h) {
      if (this.fillStyle === P.black) boxes.push({ y, h });
      return fill.call(this, x, y, w, h);
    };
    drawCaptions(ctx, at + dt, s, { bottom });
    assert.equal(ctx.depth, 0, 'every clip is restored');
    return { clips, boxes };
  };
  // mid-wipe: old and new are clipped by a whole-pixel staircase; the new page shows on the left first, from the bottom
  const mid = frame(CT.wipe * 0.4);
  assert.equal(mid.clips.length, 2, 'old page (not yet reached) and new page (passed)');
  for (const r of mid.clips.flat()) assert.ok([r.x, r.y, r.w, r.h].every(Number.isInteger) && r.w === 2, 'staircase of 2 px columns');
  const passed = mid.clips[1];
  assert.ok(passed.length > 0);
  const left = Math.min(...passed.map((r) => r.x));
  const right = Math.max(...passed.map((r) => r.x));
  const hOf = (x) => passed.find((r) => r.x === x).h;
  assert.ok(hOf(left) >= hOf(right), 'the front rises towards the right: more of the left is revealed');
  for (const r of passed) assert.equal(r.y + r.h, bottom, 'revealed from the bottom up');
  // after the wipe: just the new page, whole, no clip
  const done = frame(CT.wipe + 0.01);
  assert.equal(done.clips.length, 0);
  assert.equal(done.boxes.length, s.lines.length);
  for (const bx of done.boxes) assert.ok(bx.h === CAPTION.pitch && bx.y + bx.h <= bottom);
});

test('graphics r2: a caption that only repeats the strap tag is not burnt in', () => {
  const g = new Graphics({ now: () => 0 });
  const scene = { shot: 'close', ticker: [], subtitles: true, lowerThird: { headline: 'Canada and Mexico sign water deal', kicker: 'AROUND THE WORLD', source: 'W', since: 0 }, subtitle: 'Around the world.' };
  g.update(0, scene);
  assert.equal(g.captions.active, false);
  scene.subtitle = 'Canada and Mexico have signed an agreement.';
  g.update(0.1, scene);
  assert.equal(g.captions.active, true);
});

test('graphics r2: a caption repeating the montage card headline is not burnt in', () => {
  const g = new Graphics({ now: () => 0 });
  const rundown = [{ storyId: 'c1', headline: 'Wellington schools trial a four-day week' }];
  const scene = { shot: 'montage', rundown, card: { index: 0 }, ticker: [], subtitle: 'Wellington schools trial a four-day week.', subtitles: true };
  g.update(0, scene);
  assert.equal(g.captions.active, false);
  scene.subtitle = 'Parents are split on the idea.';
  g.update(0.1, scene);
  assert.equal(g.captions.active, true);
});

test('ticker r2: continuation pages start with an ellipsis, no page is a scrap, plates fit their label', () => {
  const titles = [
    'Telescope in Chile spots water vapour on a distant planet',
    'Moderate earthquake shakes northern Chile, no damage reported',
    'Kerala floods: thousands moved to relief camps as heavy rain continues',
    'Tech giants agree on a common charger standard for laptops',
    'Bees use the sun as a compass even on cloudy days, study says',
  ];
  for (const text of titles) {
    const pages = makeEntries({ source: 'Starfield Journal', text });
    for (const [i, e] of pages.entries()) {
      const bare = e.text.replace(/^\.\.\./, '').replace(/\.\.\.$/, '');
      if (pages.length > 1) assert.ok(bare.split(/\s+/).length >= 3, `no scrap page: ${e.text}`);
      if (i > 0) assert.match(e.text, /^\.\.\./);
      assert.ok(e.x + measureText(e.text) <= 371, `inside action-safe: ${e.text}`);
    }
  }
  // the split follows the phrase: a compass word stays with its name, the comma is the break
  assert.deepEqual(makeEntries({ text: titles[1] }).map((e) => e.text), ['Moderate earthquake shakes northern Chile...', '...no damage reported']);
  // the plate is sized to its label: LATEST items get more room than BREAKING ones
  const latest = makeEntry({ text: 'Short' });
  const breaking = makeEntry({ text: 'Short', label: 'BREAKING', plate: P.red, breaking: true });
  assert.ok(latest.x < breaking.x);
  // an editorial ticker-length `short` headline is used first
  assert.equal(makeEntry({ text: 'A very long headline that would never fit the band in one piece at all, really', short: 'Short version' }).text, 'Short version');
});

test('ticker r2: a single entry never pushes itself; a full-screen card holds the flipper', () => {
  const s = new TickerState();
  const only = makeEntries({ text: 'Only item' });
  s.update(0, only, 1);
  for (let t = 0; t < 30; t += 0.1) s.update(t, only, 1);
  assert.equal(s.prev, null, 'no push of the same entry');
  const list = [...makeEntries({ text: 'One' }), ...makeEntries({ text: 'Two' })];
  const h = new TickerState();
  h.update(0, list, 1);
  for (let t = 0; t < 10; t += 0.1) h.update(t, list, 1, true); // held for 10 s
  assert.equal(h.cur.text, 'One', 'nothing pushed while held');
  h.update(10, list, 1);
  assert.equal(h.cur.text, 'One', 'time held does not count');
  h.update(10 + list[0].dur + 0.01, list, 1);
  assert.equal(h.cur.text, 'Two');
});

test('graphics r2: the ticker never repeats the story on the strap, and keeps its rotation', () => {
  assert.ok(sameStory('Lisbon opens a new riverside tram line', 'LISBON OPENS A NEW RIVERSIDE TRAM LINE'));
  assert.ok(!sameStory('Lisbon opens a new riverside tram line', 'Oil prices slide as demand cools'));
  const g = new Graphics({ now: () => 0 });
  const ticker = [
    { source: 'A', text: 'Lisbon opens a new riverside tram line' },
    { source: 'B', text: 'Robot vacuum learns to climb stairs' },
    { source: 'C', text: 'Coffee futures reach a ten-year high' },
  ];
  const scene = { shot: 'wide', ticker, lowerThird: { headline: 'Lisbon opens riverside tram line', source: 'A', since: 0 } };
  for (let t = 0; t < 60; t += 0.1) {
    g.update(t, scene);
    assert.ok(!/LISBON/i.test(g.ticker.cur?.text || ''), `t=${t.toFixed(1)}: ${g.ticker.cur?.text}`);
  }
});

test('graphics r2: a breaking item that arrives during an ad takes the strap when the news returns', () => {
  const g = new Graphics({ now: () => 0 });
  const br = { source: 'W', text: 'Quake strikes off northern Japan', since: 5 };
  const lt = { headline: 'Oil prices slide', source: 'Wire', since: 41 };
  const scene = { shot: 'ad', ticker: [{ source: 'A', text: 'Other news' }], breaking: br, lowerThird: null };
  for (let t = 0; t < 40; t += 1 / 30) g.update(t, scene);
  assert.equal(g.brAir, null, 'not on air during the ad');
  scene.shot = 'wide';
  scene.lowerThird = lt;
  g.update(40.05, scene);
  assert.equal(g.strap.cur.breaking, true, 'the strap carries it first');
  for (let t = 40.05; t < 40 + BREAKING_STRAP - 0.5; t += 1 / 30) g.update(t, scene);
  assert.equal(g.strap.cur.breaking, true, 'held for its full on-air time');
  for (let t = 40 + BREAKING_STRAP - 0.5; t < 40 + BREAKING_STRAP + 2; t += 1 / 30) g.update(t, scene);
  assert.equal(g.strap.cur.breaking, false);
  assert.equal(g.ticker.cur.breaking, true, 'then the ticker takes it');
  assert.ok(g.tickerList.some((e) => e.breaking));
  for (let t = 42 + BREAKING_STRAP; t < 40 + BREAKING_TICKER + 1; t += 0.5) g.update(t, scene);
  assert.ok(!g.tickerList.some((e) => e.breaking), 'and drops it after its on-air window');
  // an item that could never air within BREAKING_MAX_AGE is dropped
  const old = new Graphics({ now: () => 0 });
  const s2 = { shot: 'ad', ticker: [], breaking: { source: 'W', text: 'Old news', since: 0 }, lowerThird: lt };
  old.update(0, s2);
  s2.shot = 'wide';
  old.update(BREAKING_MAX_AGE + 1, s2);
  assert.equal(old.strap.cur.breaking, false);
});

test('strap r2: a story headline wider than the bar gets two balanced lines (no ellipsis, no paging)', () => {
  const c = strapContent({ headline: 'PERU ARCHAEOLOGISTS UNCOVER 3,000-YEAR-OLD TEMPLE IN THE ANDES', source: 'Pixelburg Post', since: 0 });
  assert.equal(c.pages.length, 1);
  assert.equal(c.pages[0].length, 2);
  assert.equal(c.twoLine, true);
  assert.equal(c.barY, BAR_TOP.two);
  assert.ok(!c.pages[0].join(' ').includes('...'));
  for (const l of c.pages[0]) assert.ok(measureText(l) <= TEXT_ROOM);
  assert.equal(c.pages[0].join(' '), 'PERU ARCHAEOLOGISTS UNCOVER 3,000-YEAR-OLD TEMPLE IN THE ANDES');
  const one = strapContent({ headline: 'OIL PRICES SLIDE', since: 0 });
  assert.equal(one.barY, BAR_TOP.one);
  // the bar top eases between the two heights on the flip, and captions follow it
  const s = new StrapState();
  s.update(0, one);
  s.update(5, c);
  assert.equal(s.barY(5), BAR_TOP.one);
  const mid = s.barY(5 + STRAP_TIMING.flip / 2);
  assert.ok(mid < BAR_TOP.one && mid > BAR_TOP.two);
  assert.equal(s.barY(5 + STRAP_TIMING.flip), BAR_TOP.two);
  assert.equal(s.top(6), BAR_TOP.two - 11);
  // breaking items still page, every page but the first reads as a continuation
  const br = strapContent({ headline: 'Earthquake of magnitude 7.4 strikes off the coast of central Chile, tsunami warning issued for the Pacific coast', breaking: true, since: 0 });
  assert.ok(br.pages.length >= 2);
  for (const p of br.pages.slice(1)) assert.match(p[0], /^\.\.\./);
});

test('strap r2: tag-row type sits 2 px down (3 with accented capitals); text lands with the wipe', () => {
  assert.equal(strapContent({ headline: 'X', kicker: 'OIL MARKETS' }).tagY, 2);
  assert.equal(strapContent({ headline: 'X', kicker: 'MÉXICO' }).tagY, 3);
  const s = new StrapState();
  s.update(0, strapContent({ headline: 'Oil', since: 0 }));
  assert.ok(s.textAt <= STRAP_TIMING.in + 0.1, 'text is fully up within 0.1 s of the bar settling');
});

test('graphics r2: NEWS IN 60 keeps its tag, shows a never-shrinking progress rule and a static UP NEXT plate', () => {
  assert.equal(programGraphics({ id: 'news-60' }).ticker, 'next');
  assert.equal(programGraphics({ theme: 'flash' }).progressRule, true);
  assert.equal(programGraphics({ id: 'world-now', theme: 'world' }).tagHold, PROGRAM_TAG.hold);
  const g = new Graphics({ now: () => 0 });
  const scene = {
    shot: 'wide', program: { id: 'news-60', title: 'NEWS IN 60', theme: 'flash' }, programTagUntil: 15, progress: 0,
    schedule: { upcoming: [{ title: 'Cosmos Desk', tagline: 'Science' }] }, ticker: [{ source: 'A', text: 'Other news' }],
    lowerThird: { headline: 'Oil prices slide', source: 'W', since: 0 }, rundown: [],
  };
  let lastW = 0;
  for (let t = 0; t < 50; t += 0.1) {
    scene.progress = t < 20 ? t / 40 : 0.3; // a late estimate may go back: the rule never does
    g.update(t, scene);
    assert.ok(g.strap.progress >= lastW);
    lastW = g.strap.progress;
  }
  assert.equal(g.tagOut, null, 'programme tag held for the whole episode');
  assert.equal(g.tickerList.length, 1);
  assert.equal(g.tickerList[0].label, 'UP NEXT');
  assert.equal(g.tickerList[0].text, 'COSMOS DESK');
  assert.equal(g.ticker.prev, null, 'nothing flips');
  // the rule is drawn in whole pixels: slate track + yellow fill
  const ctx = fakeCtx();
  const fills = [];
  const fr = ctx.fillRect;
  ctx.fillRect = function (x, y, w, h) {
    fills.push([this.fillStyle, x, y, w, h]);
    return fr.call(this, x, y, w, h);
  };
  drawStrap(ctx, 50, g.strap);
  const rule = fills.filter(([c, , y, , h]) => c === P.yellow && h === 1 && y === BAR_TOP.one);
  assert.equal(rule.length, 1);
  assert.equal(rule[0][3], Math.floor(346 * lastW));
});

test('graphics r2: MONEY MINUTE flips aired figures with shape glyphs (market figures only)', () => {
  const e = makeFigureEntry({ value: '$82', label: 'Brent crude' }, { dir: 'down', market: true });
  assert.equal(e.glyph, 'down');
  assert.equal(makeFigureEntry({ value: '4.5%', label: 'Inflation' }, { dir: 'up', market: false }).glyph, null);
  const rundown = [
    { storyId: 'm1', headline: 'Oil slides', numbers: [{ value: '$82', label: 'BRENT', dir: 'down', market: true }] },
    { storyId: 'm2', headline: 'Pound up', numbers: [{ value: '$1.27', label: 'STERLING', dir: 'up', market: true }] },
    { storyId: 'm3', headline: 'Coffee high', numbers: [{ value: '$3.10', label: 'ARABICA', dir: 'flat', market: true }] },
  ];
  const g = new Graphics({ now: () => 0 });
  const scene = { shot: 'wide', program: { id: 'money-minute', title: 'MONEY MINUTE', theme: 'money' }, rundown, storyId: 'm2', ticker: [{ source: 'A', text: 'Other news' }], lowerThird: null };
  g.update(0, scene);
  assert.ok(g.tickerList.every((x) => !x.value), 'fewer than two aired figures: headlines');
  scene.storyId = 'm3';
  g.update(1, scene);
  const figs = g.tickerList.filter((x) => x.value);
  assert.deepEqual(figs.map((x) => x.text), ['BRENT', 'STERLING'], 'only stories already aired, never the one on air');
  assert.equal(figs[0].label, 'BOTTOM LINE');
});

test('guard: a persistently throwing shot shows the last good frame, then a slate; context reset; logged once', () => {
  const log = [];
  const ctx = fakeCtx();
  ctx.reset = function () {
    this.depth = 0;
    this.globalAlpha = 1;
    log.push('reset');
  };
  const canvas = { width: 384, height: 216, getContext: () => ctx };
  ctx.canvas = canvas;
  const stage = { width: 384, height: 216, getContext: () => ({ reset() {}, imageSmoothingEnabled: false }) };
  let broken = false;
  const renderer = {
    canvas,
    stage,
    ctx,
    drawShot() {
      if (broken) {
        ctx.save();
        ctx.globalAlpha = 0.2;
        throw new Error('shot boom');
      }
    },
  };
  const guard = new FrameGuard();
  const draws = [];
  const di = ctx.drawImage;
  ctx.drawImage = function (img, ...a) {
    draws.push(img);
    return di.call(this, img, ...a);
  };
  const fills = [];
  const fr = ctx.fillRect;
  ctx.fillRect = function (...a) {
    fills.push(this.fillStyle);
    return fr.apply(this, a);
  };
  assert.equal(guard.shot(renderer, 0, {}), true);
  assert.ok(guard.has, 'the clean frame was kept');
  broken = true;
  const errors = console.error;
  let logged = 0;
  console.error = () => logged++;
  try {
    for (let t = 1; t < 1 + GUARD_HOLD - 0.1; t += 0.1) {
      draws.length = 0;
      assert.equal(guard.shot(renderer, t, {}), false);
      assert.equal(ctx.depth, 0, 'state reset after the throw');
      assert.equal(ctx.globalAlpha, 1);
      assert.ok(draws.includes(guard.last), 'held frame repainted');
    }
    fills.length = 0;
    guard.shot(renderer, 1 + GUARD_HOLD + 0.5, {});
    assert.ok(fills.includes(P.ink), 'then the slate');
  } finally {
    console.error = errors;
  }
  assert.equal(logged, 1, 'logged once');
  broken = false;
  assert.equal(guard.shot(renderer, 10, {}), true);
  assert.equal(guard.failSince, null, 'recovers when the shot draws again');
});
