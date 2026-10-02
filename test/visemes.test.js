import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { VISEMES, buildTimeline, sampleTimeline, speechTokens, wordAtChar, blipPlan, SpeechClock } from '../public/js/audio/visemes.js';

// public/js/audio/visemes.js is the speech timeline behind the presenters'
// mouths (AudioEngine.speechFrame). It is pure, so it is tested here directly.

const shapes = (text, opts) => buildTimeline(text, opts).segs.map((s) => s.v);
const sample = (tl, step = 5) => {
  const out = [];
  for (let t = -100; t <= tl.total + 100; t += step) out.push({ t, ...sampleTimeline(tl, t) });
  return out;
};

describe('buildTimeline: shapes', () => {
  test('only uses the contract viseme names', () => {
    const tl = buildTimeline('The quick brown fox jumps over the lazy dog, then thinks: why?');
    for (const s of tl.segs) assert.ok(VISEMES.includes(s.v), s.v);
  });

  test('m, b and p close the lips; f and v bite the lip; th shows the tongue', () => {
    assert.ok(shapes('mom').includes('MBP'));
    assert.ok(shapes('baby').filter((v) => v === 'MBP').length >= 2);
    assert.ok(shapes('five').includes('FV'));
    assert.ok(shapes('photo').includes('FV'), 'ph is an f');
    assert.ok(shapes('think').includes('TH'));
  });

  test('o, u and w round the lips; ee spreads them; a opens wide', () => {
    assert.ok(shapes('moon').includes('OO'));
    assert.ok(shapes('go home').includes('OH'));
    assert.ok(shapes('we want').includes('WQ'));
    assert.ok(shapes('see').includes('EE'));
    assert.ok(shapes('bat').includes('AH'));
  });

  test('silent letters make no shape: final e, kn-, -mb', () => {
    const make = buildTimeline('make').segs.filter((s) => s.k === 'v');
    assert.equal(make.length, 1, 'one vowel in "make"');
    assert.equal(shapes('knee')[0], 'L');
    assert.equal(shapes('lamb').at(-1), 'MBP');
  });

  test('the lips are fully closed in the middle of an m', () => {
    const tl = buildTimeline('Ma ma');
    const m = tl.segs.find((s) => s.v === 'MBP');
    const f = sampleTimeline(tl, (m.t0 + m.t1) / 2);
    assert.equal(f.viseme, 'MBP');
    assert.ok(f.level < 0.05, `level ${f.level}`);
  });

  test('stressed open vowels open wider than function words', () => {
    const tl = buildTimeline('the father');
    const the = tl.segs.find((s) => s.k === 'v' && s.wi === 0);
    const fa = tl.segs.find((s) => s.k === 'v' && s.wi === 1);
    assert.ok(fa.stress && !the.stress);
    assert.ok(fa.o > the.o + 0.2);
    assert.ok(fa.t1 - fa.t0 > the.t1 - the.t0);
  });

  test('Spanish is read with Spanish rules (z is a lisp in Spain, h is silent)', () => {
    const tl = buildTimeline('Hola, buenos días desde Zaragoza.', { lang: 'es-ES' });
    assert.ok(tl.segs.some((s) => s.v === 'TH'));
    assert.equal(tl.segs[0].v, 'OH', 'the h of "Hola" makes no shape');
    const latam = buildTimeline('Zaragoza', { lang: 'es-MX' });
    assert.ok(!latam.segs.some((s) => s.v === 'TH'));
  });
});

describe('buildTimeline: timing', () => {
  const COPY = 'Oil prices fell for a third day as traders expect weaker demand this winter.';

  test('ordinary news copy runs at a speaking pace of about 13 to 19 characters a second', () => {
    const tl = buildTimeline(COPY);
    assert.ok(tl.cps > 13 && tl.cps < 19, `cps ${tl.cps}`);
  });

  test('rate scales the duration', () => {
    const slow = buildTimeline(COPY, { rate: 1 }).total;
    const fast = buildTimeline(COPY, { rate: 1.5 }).total;
    assert.ok(Math.abs(slow / fast - 1.5) < 0.05, `${slow / fast}`);
  });

  test('commas and dashes are pauses with the mouth at rest', () => {
    const plain = buildTimeline('Yes we can do it now').total;
    const comma = buildTimeline('Yes, we can, do it now').total;
    assert.ok(comma - plain > 250, `${comma - plain}`);
    const tl = buildTimeline('Yes, we can');
    const pause = tl.segs.find((s) => s.k === 'pause');
    assert.ok(pause);
    assert.equal(sampleTimeline(tl, (pause.t0 + pause.t1) / 2).pause, true);
    assert.ok(buildTimeline('Yes — we can').segs.some((s) => s.k === 'pause'));
  });

  test('no pause after the last word: the gap between sentences belongs to the engine', () => {
    const tl = buildTimeline('Good night, everyone.');
    assert.notEqual(tl.segs.at(-1).k, 'pause');
  });

  test('numbers take as long as the words a TTS engine says for them', () => {
    const tokens = speechTokens('In 2026 it cost $1.2bn, up 45% from 1,200 people in 1999.');
    const words = tokens.map((t) => t.words.join(' '));
    assert.ok(words.includes('twenty twenty six'), words.join('|'));
    assert.ok(words.includes('one point two billion dollars'), words.join('|'));
    assert.ok(words.includes('forty five percent'), words.join('|'));
    assert.ok(words.includes('one thousand two hundred'), words.join('|'));
    assert.ok(words.includes('nineteen ninety nine'), words.join('|'));
    assert.ok(buildTimeline('in 2026').total > buildTimeline('in 26').total + 150);
  });

  test('acronyms are spelled letter by letter, pronounceable ones are read', () => {
    assert.deepEqual(speechTokens('BBC')[0].words, ['bee', 'bee', 'see']);
    assert.deepEqual(speechTokens('the U.S. said')[1].words, ['yoo', 'es']);
    assert.deepEqual(speechTokens('NASA')[0].words, ['nasa']);
  });

  test('a Spanish number is read in Spanish', () => {
    assert.deepEqual(speechTokens('25', 'es')[0].words, ['veinticinco']);
    assert.deepEqual(speechTokens('1.500', 'es')[0].words.slice(-2), ['mil', 'quinientos']);
  });
});

describe('buildTimeline: words and characters', () => {
  test('one word per whitespace-separated token, with its position in the text', () => {
    const text = 'Good evening, I’m Paco — and this is “World Now”.';
    const tl = buildTimeline(text);
    const tokens = text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
    assert.equal(tl.words.length, tokens.length);
    for (const w of tl.words) assert.match(text.slice(w.ci), /^[\p{L}\p{N}]/u);
    for (let i = 1; i < tl.words.length; i++) assert.ok(tl.words[i].t0 >= tl.words[i - 1].t0);
  });

  test('charIndex and wordIndex only move forward while speaking', () => {
    const tl = buildTimeline('Scientists say the comet will be visible from Europe next week.');
    let ci = -1;
    let wi = -1;
    for (const f of sample(tl)) {
      if (!f.speaking) continue;
      assert.ok(f.charIndex >= ci && f.wordIndex >= wi);
      ci = f.charIndex;
      wi = f.wordIndex;
    }
    assert.equal(wi, tl.words.length - 1);
  });

  test('wordAtChar maps a TTS boundary charIndex to its word', () => {
    const text = 'Markets rallied on Friday.';
    const tl = buildTimeline(text);
    assert.equal(wordAtChar(tl, 0), 0);
    assert.equal(wordAtChar(tl, text.indexOf('on')), 2);
    assert.equal(wordAtChar(tl, text.indexOf('Friday') + 3), 3);
  });
});

describe('sampleTimeline', () => {
  const tl = buildTimeline('Paco Pixel brings you the very latest from around the world.');
  const frames = sample(tl, 4);

  test('closed and quiet before the first sound and after the last', () => {
    assert.deepEqual([frames[0].viseme, frames[0].level, frames[0].speaking], ['rest', 0, false]);
    const last = frames.at(-1);
    assert.deepEqual([last.viseme, last.level, last.speaking], ['rest', 0, false]);
  });

  test('the jaw never snaps: level moves smoothly between 4 ms samples', () => {
    let worst = 0;
    for (let i = 1; i < frames.length; i++) worst = Math.max(worst, Math.abs(frames[i].level - frames[i - 1].level));
    assert.ok(worst < 0.09, `largest step ${worst}`);
  });

  test('shapes blend: a new viseme is only reached after mixing toward it', () => {
    for (let i = 1; i < frames.length; i++) {
      const a = frames[i - 1];
      const b = frames[i];
      assert.ok(b.mix >= 0 && b.mix <= 1);
      if (a.viseme !== b.viseme) {
        assert.equal(a.next, b.viseme, `at ${b.t}`);
        assert.ok(a.mix > 0.85 || a.viseme === a.next, `mix ${a.mix} at ${a.t}`);
      }
    }
  });

  test('a calm mouth: wide open only part of the time, never fluttering', () => {
    const talking = frames.filter((f) => f.speaking);
    const wide = talking.filter((f) => f.level > 0.62).length / talking.length;
    const closed = talking.filter((f) => f.level < 0.22).length / talking.length;
    assert.ok(wide > 0.03 && wide < 0.35, `wide ${wide}`);
    assert.ok(closed > 0.15 && closed < 0.7, `closed ${closed}`);
    // Mouth-state changes (closed / half / open) per second stay at syllable rate.
    const state = (f) => (f.level > 0.62 ? 2 : f.level > 0.22 ? 1 : 0);
    let changes = 0;
    for (let i = 1; i < talking.length; i++) if (state(talking[i]) !== state(talking[i - 1])) changes++;
    assert.ok(changes / (tl.total / 1000) < 12, `${changes / (tl.total / 1000)} changes/s`);
  });

  test('stressed syllables raise an accent that head motion can follow', () => {
    assert.ok(frames.some((f) => f.accent > 0.9));
  });

  test('fills a given object instead of allocating', () => {
    const out = {};
    assert.equal(sampleTimeline(tl, 200, out), out);
    assert.ok(VISEMES.includes(out.viseme));
  });
});

describe('blipPlan', () => {
  test('one beep per vowel, inside the sentence, louder on open vowels', () => {
    const tl = buildTimeline('Hello and good evening.');
    const beeps = blipPlan(tl);
    assert.equal(beeps.length, tl.segs.filter((s) => s.k === 'v' && !s.glide).length);
    for (const b of beeps) assert.ok(b.at >= 0 && b.at + b.dur <= tl.total + 1);
    assert.ok(beeps.every((b, i) => i === 0 || b.at > beeps[i - 1].at));
  });

  test('questions rise at the end', () => {
    const q = blipPlan(buildTimeline('Is it raining in London today?'));
    const s = blipPlan(buildTimeline('It is raining in London today.'));
    assert.ok(q.at(-1).ratio > s.at(-1).ratio * 1.1);
  });
});

describe('SpeechClock', () => {
  const tl = buildTimeline('Markets rallied on Friday as investors cheered the news.');

  test('null before start, then free-runs at its speed', () => {
    const c = new SpeechClock(tl, { speed: 1, soft: false });
    assert.equal(c.timeAt(0), null);
    c.start(1000);
    assert.equal(c.timeAt(1000), 0);
    assert.ok(Math.abs(c.timeAt(1500) - 500) < 1e-6);
  });

  test('soft mode never runs out before the engine reports the end', () => {
    const c = new SpeechClock(tl, { speed: 1 });
    c.start(0);
    assert.ok(c.timeAt(tl.total * 3) < tl.total);
  });

  test('a boundary ahead of the clock is eased in, not jumped to', () => {
    const c = new SpeechClock(tl, { speed: 1, soft: false });
    c.start(0);
    const w = tl.words[4];
    const before = c.timeAt(100);
    c.anchorWord(4, 100);
    assert.ok(Math.abs(c.timeAt(100) - before) < 1e-6, 'continuous at the anchor');
    assert.ok(c.timeAt(116) - before < 120, 'one frame later it has not jumped');
    assert.ok(Math.abs(c.timeAt(1600) - (w.t0 + 1500 * c.speed)) < 15, 'caught up within 1.5 s');
  });

  test('learns the engine speed from the spacing of word boundaries', () => {
    const c = new SpeechClock(tl, { speed: 1, soft: false });
    c.start(0);
    // The engine speaks 25% slower than predicted.
    for (let i = 0; i < 6; i++) c.anchorWord(i, tl.words[i].t0 * 1.25);
    assert.ok(Math.abs(c.speed - 0.8) < 0.08, `speed ${c.speed}`);
  });

  test('when boundaries arrive late the mouth holds at the end of the word', () => {
    const c = new SpeechClock(tl, { speed: 1, soft: false });
    c.start(0);
    c.anchorWord(0, 0);
    c.anchorWord(1, tl.words[1].t0);
    const next = tl.words[2].t0;
    assert.ok(c.timeAt(next + 300) < next + 25);
    c.anchorWord(2, next + 300);
    assert.ok(c.timeAt(next + 700) > next + 200);
  });

  test('time never runs backwards, even when a boundary says the clock was ahead', () => {
    const c = new SpeechClock(tl, { speed: 1.5, soft: false });
    c.start(0);
    let last = -1;
    for (let now = 0; now < 2000; now += 16) {
      if (now === 800) c.anchorWord(1, now);
      const t = c.timeAt(now);
      assert.ok(t >= last);
      last = t;
    }
  });
});
