// On-screen graphics package (public/js/graphics) and the text/clock helpers it
// relies on: pure logic only (no canvas), so it runs under node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measureText, wrapText, wrapLines, normalizeText, fontMetrics } from '../public/js/font.js';
import { zoneTime, longDate } from '../public/js/util.js';
import { THEME_ACCENT } from '../public/js/cast.js';
import { P } from '../public/js/palette.js';
import { paginate, pageAt, CaptionState, CAPTION_TIMING } from '../public/js/graphics/captions.js';
import { StrapState, strapContent, categoryLabel, STRAP_TIMING } from '../public/js/graphics/strap.js';
import { TickerState, makeEntry, TICKER_TIMING } from '../public/js/graphics/ticker.js';
import { Graphics, OVERLAYS } from '../public/js/graphics/index.js';
import { CAPTION, inkOn } from '../public/js/graphics/layout.js';

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

test('captions: two-line captions are balanced', () => {
  const text = 'Traders expect weaker demand this winter and analysts agree with them.';
  const [page] = paginate(text, 260);
  assert.equal(page.lines.length, 2);
  const [a, b] = page.lines.map((l) => measureText(l));
  assert.ok(Math.abs(a - b) < 60, `balanced lines (${a} vs ${b})`);
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

test('captions: state rolls pages, keeps the caption briefly after speech, then clears', () => {
  const s = new CaptionState();
  s.update(0, LONG, { since: 0 });
  assert.equal(s.page, 0);
  const second = pages2Time();
  s.update(second, LONG);
  assert.equal(s.page, 1);
  assert.equal(s.prevLines.length, 2);
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

test('ticker: a headline wider than the band holds long enough to glide to its end', () => {
  const long = makeEntry({ source: 'Fixture World Wire', text: 'New Zealand city of Wellington trials four-day school week for one term across twelve schools' });
  const short = makeEntry({ text: 'Short' });
  assert.ok(long.width > 300);
  assert.ok(long.dur > TICKER_TIMING.glideWait + (long.width - 300) / TICKER_TIMING.glideSpeed);
  assert.ok(short.dur < long.dur);
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
  step(12, 13, { breaking: { source: 'W', text: 'Quake', since: 12 } });
  assert.equal(g.strap.cur.tag, 'BREAKING');
  assert.equal(g.ticker.cur.breaking, true);
  step(13, 26);
  assert.equal(g.strap.cur.headline, 'Oil prices slide', 'story strap returns after the breaking hold');
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
