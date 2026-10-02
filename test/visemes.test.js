import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { VISEMES, buildTimeline, sampleTimeline, sampleCalm, calmTimeline, speechTokens, wordAtChar, wordAtSpoken, blipPlan, SpeechClock } from '../public/js/audio/visemes.js';
import { parseTune, flatten, songSeconds, noteToMidi, resolveInstrument, noteCutoff } from '../public/js/audio/tune.js';
import { themeFor, THEME_IDS, MOTIF, COLOURS, CUES, IDENT, IDENT_NIGHT, STINGER, BREAKING, OUTRO, PROMO, cueFor, CUE_PROGRAMMES } from '../public/js/audio/themes.js';
import { measureLoudness, estimateLoudness, envelopeEnergy, lowpassPower, highshelfPower, TARGET_LUFS, VOICE_LUFS } from '../public/js/audio/loudness.js';
import { resolveVoices, normProfile, voiceQuality } from '../public/js/audio/voices.js';
import { waveTable, WAVE_KINDS } from '../public/js/audio/waves.js';
// The ad registry belongs to the ads stream; its tunes are checked when it loads.
const { ADS } = await import('../public/js/ads/index.js').catch(() => ({ ADS: [] }));

// The audio stream's pure modules (public/js/audio/): the speech timeline
// behind the presenters' mouths (AudioEngine.speechFrame), the tune format,
// the channel's sonic identity, the loudness model and the TTS voice choice.
// The WebAudio side is measured in public/lab/audio.html.

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

  test('common words that spelling gets wrong: four, put, full, I, now, show', () => {
    const vowels = (w) => shapes(w, { normalise: false }).filter((v) => !['MBP', 'FV', 'TH', 'L', 'S', 'WQ', 'rest'].includes(v) || v === 'WQ');
    for (const w of ['four', 'fourth', 'your', 'course', 'court', 'source']) assert.ok(shapes(w, { normalise: false }).includes('OH') && !shapes(w, { normalise: false }).includes('AH'), `${w}: OH, not a wide AH`);
    assert.deepEqual(shapes('hour', { normalise: false }).slice(-3), ['AH', 'OO', 'WQ'], 'hour keeps its glide');
    for (const w of ['put', 'full', 'pull', 'push', 'bush', 'bulletin']) assert.ok(shapes(w, { normalise: false }).includes('OO') && !shapes(w, { normalise: false }).includes('AH'), `${w}: rounded`);
    for (const w of ['now', 'how', 'wow', 'down', 'power', 'crowd']) assert.ok(vowels(w).join(' ').includes('AH OO'), `${w}: AH gliding to OO`);
    for (const w of ['show', 'known', 'bowl', 'below', 'window']) assert.ok(!vowels(w).includes('AH'), `${w}: OH`);
    assert.ok(shapes('journal', { normalise: false }).includes('WQ') && !shapes('journal', { normalise: false }).slice(0, 2).includes('OH'), 'journal is an er');
    assert.deepEqual(shapes('find', { normalise: false }).slice(1, 3), ['AH', 'EE']);
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

  test('numbers take as long as the words a newsreader says for them (speechtext.js)', () => {
    const tl = buildTimeline('In 2026 it cost $1.2bn, up 45% from 1,200 people in 1999.', { lang: 'en-GB' });
    for (const said of ['twenty twenty-six', 'one point two billion dollars', 'forty-five percent', 'one thousand two hundred', 'nineteen ninety-nine']) {
      assert.ok(tl.spoken.includes(said), tl.spoken);
    }
    assert.ok(buildTimeline('in 2026').total > buildTimeline('in 26').total + 150);
    // The timeline still points into the ORIGINAL text.
    const dollars = tl.segs.find((sg) => sg.ci === tl.text.indexOf('$1.2bn'));
    assert.ok(dollars, 'the expansion maps back to "$1.2bn"');
  });

  test('acronyms are spelled letter by letter; brand names and shouted words are read', () => {
    assert.deepEqual(speechTokens('BBC')[0].words, ['bee', 'bee', 'see']);
    assert.deepEqual(speechTokens('the U.S. said')[1].words, ['yoo', 'es']);
    assert.deepEqual(speechTokens('NASA')[0].words, ['nasa']);
    assert.deepEqual(speechTokens('I-M-F')[0].words, ['i', 'em', 'ef']);
    assert.deepEqual(shapes('I-M-F', { normalise: false }).slice(0, 2), ['AH', 'EE'], 'the letter I glides AH -> EE');
    assert.deepEqual(speechTokens('GLOBIT')[0].words, ['globit'], 'never "jee el oh bee eye tee"');
    assert.deepEqual(speechTokens('STOP')[0].words, ['stop']);
    // The channel name takes about as long as "Globit twenty-four" (5 syllables).
    const tl = buildTimeline('This is GLOBIT 24.');
    const name = tl.words.filter((w) => w.wi >= 2);
    assert.ok(name.at(-1).t1 - name[0].t0 < 1500, `${name.at(-1).t1 - name[0].t0} ms`);
    assert.equal(tl.spoken, 'This is Globit twenty-four.');
  });

  test('a Spanish number is read in Spanish', () => {
    assert.match(buildTimeline('25', { lang: 'es' }).spoken, /veinticinco/i);
    assert.match(buildTimeline('1.500 personas', { lang: 'es-ES' }).spoken, /mil quinientas/i);
  });

  test('normalise: false times the raw text (digits read one by one)', () => {
    const tl = buildTimeline('Route 66', { normalise: false });
    assert.equal(tl.spoken, 'Route 66');
    assert.deepEqual(speechTokens('66')[0].words, ['six', 'six']);
  });
});

describe('buildTimeline: words and characters', () => {
  test('every word of the text is said, and word positions point into the original', () => {
    const text = 'Good evening, I’m Paco — and this is “World Now”, with $2bn at 14:30.';
    const tl = buildTimeline(text);
    const tokens = [...text.matchAll(/\S+/g)].map((m, i) => ({ i, at: m.index, w: m[0] })).filter((t) => /[\p{L}\p{N}]/u.test(t.w));
    const said = new Set(tl.words.map((w) => w.wi));
    for (const t of tokens) assert.ok(said.has(t.i), `"${t.w}" is said`);
    for (const w of tl.words) assert.match(text.slice(w.ci), /^[\p{L}\p{N}$£€“"]/u);
    for (const w of tl.words) assert.equal(tl.spoken.slice(w.sci).search(/\S/), 0);
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

  test('wordAtChar maps an original offset to its word, wordAtSpoken a TTS boundary in the spoken text', () => {
    const text = 'Markets rallied on Friday.';
    const tl = buildTimeline(text);
    assert.equal(wordAtChar(tl, 0), 0);
    assert.equal(wordAtChar(tl, text.indexOf('on')), 2);
    assert.equal(wordAtChar(tl, text.indexOf('Friday') + 3), 3);
    const money = buildTimeline('The IMF lent $2bn today.', { lang: 'en-US' });
    const k = money.spoken.indexOf('billion');
    const w = wordAtSpoken(money, k);
    assert.equal(money.spoken.slice(money.words[w].sci).split(' ')[0], 'billion');
    assert.equal(money.text.slice(money.words[w].ci, money.words[w].ci + 1), '$', 'maps back to the original token');
    assert.equal(money.words[wordAtChar(money, money.text.indexOf('$2bn'))].sci, money.spoken.indexOf('two'), 'first spoken word of the token');
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

  test('the calm stream: no tongue shapes, every shape held >= 80 ms, a slow jaw', () => {
    const tl = buildTimeline('Good evening, I am Paco Pixel, and this is World Now on GLOBIT 24. The talks resume on Thursday.');
    const c = calmTimeline(tl);
    assert.equal(calmTimeline(tl), c, 'cached per timeline');
    assert.ok(c.segs.length < tl.segs.length * 0.6, `${c.segs.length} of ${tl.segs.length} shapes`);
    for (const g of c.segs) {
      assert.ok(!['TH', 'L', 'S'].includes(g.v), g.v);
      if (g.v !== 'MBP' && g.k !== 'pause') assert.ok(g.t1 - g.t0 >= 80, `${g.v} held ${g.t1 - g.t0} ms`);
    }
    assert.equal(c.segs.at(-1).t1, tl.total);
    // Sampled at 60 fps: the jaw moves at most ~0.12 per frame and still opens per syllable.
    let prev = null;
    let maxStep = 0;
    let changes = 0;
    let shown = 'rest';
    const out = {};
    for (let t = -80; t < tl.total + 80; t += 1000 / 60) {
      const f = sampleCalm(tl, t, out);
      if (prev !== null) maxStep = Math.max(maxStep, Math.abs(f.level - prev));
      prev = f.level;
      const s = f.mix > 0.5 ? f.next : f.viseme;
      if (s !== shown) { changes++; shown = s; }
    }
    assert.ok(maxStep <= 0.13, `jaw step ${maxStep.toFixed(3)} per frame`);
    assert.ok(changes / (tl.total / 1000) < 7, `${(changes / (tl.total / 1000)).toFixed(1)} shape changes a second`);
    const levels = [];
    for (let t = 0; t < tl.total; t += 10) levels.push(sampleCalm(tl, t, out).level);
    assert.ok(Math.max(...levels) > 0.35, 'it still opens');
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

describe('tune format', () => {
  test('the classic format still parses: lead, bass and drums with their waves', () => {
    const song = parseTune({ bpm: 140, wave: 'square', notes: 'C5:1 E5:1 G5:2 R:1', bass: 'C3:2 G2:2', bassWave: 'triangle', drums: 'K:1 H:0.5 S:1' });
    assert.equal(song.bpm, 140);
    assert.deepEqual(song.tracks.map((t) => t.kind), ['lead', 'bass', 'drums']);
    assert.equal(song.tracks[0].inst.wave, 'pulse50');
    assert.equal(song.tracks[1].inst.wave, 'tri');
    assert.equal(song.beats, 5);
    assert.deepEqual(song.tracks[0].events[0].midis, [72]);
  });

  test('a plain string is a melody; chords, flats and velocities parse', () => {
    const song = parseTune('C4+E4+G4:2 Bb3:1@0.5');
    assert.deepEqual(song.tracks[0].events[0].midis, [60, 64, 67]);
    assert.equal(song.tracks[0].events[1].midis[0], noteToMidi('A#3'));
    assert.equal(song.tracks[0].events[1].vel, 0.5);
  });

  test('bad input never throws: junk tokens become rests, empty tunes are null', () => {
    assert.equal(parseTune(null), null);
    assert.equal(parseTune({ notes: '' }), null);
    const song = parseTune({ notes: 'X9:1 C4:abc ?? D4:1', bpm: 'fast' });
    assert.equal(song.bpm, 120);
    assert.equal(song.tracks[0].events.length, 2);
  });

  test('rich tracks: instruments, kinds, octave and transpose', () => {
    const song = parseTune({ bpm: 100, transpose: 2, tracks: [
      { inst: 'brass', notes: 'C4:1' },
      { kind: 'bass', inst: { wave: 'pulse25', s: 0.5 }, notes: 'C2:1', octave: 1 },
      { drums: 'K:1 W:2' },
    ] });
    assert.equal(song.tracks[0].inst.scoop > 0, true);
    assert.equal(song.tracks[0].events[0].midis[0], 62);
    assert.equal(song.tracks[1].events[0].midis[0], 50);
    assert.equal(song.tracks[1].inst.s, 0.5);
    assert.deepEqual(song.tracks[2].events.map((e) => e.drum), ['k', 'w']);
  });

  test('flatten tiles short tracks and swings off-beat eighths', () => {
    const song = parseTune({ bpm: 120, swing: 0.3, notes: 'C4:0.5 D4:0.5 E4:0.5 F4:0.5', drums: 'H:1' });
    const ev = flatten(song);
    assert.equal(ev.filter((e) => song.tracks[e.track].kind === 'drums').length, 2);
    const d4 = ev.find((e) => e.e.midis?.[0] === 62);
    assert.ok(Math.abs(d4.at - 0.65) < 1e-9);
  });

  test('instrument names resolve, unknown ones fall back', () => {
    assert.equal(resolveInstrument('nonsense').wave, 'pulse50');
    assert.equal(resolveInstrument('sawtooth', 'bass').wave, 'saw');
  });
});

describe('instruments and wave tables', () => {
  test('presets are filtered; tunes may set cutoff, resonance and a filter envelope', () => {
    // Broadcast tilt: leads open to ~6 kHz, pads and keys lower, bass darker.
    for (const name of ['pulse12', 'pulse25', 'pulse50', 'brass', 'bell', 'pluck', 'pad', 'keys', 'square', 'saw']) {
      const c = resolveInstrument(name).cutoff;
      assert.ok(c >= 2000 && c <= 6500, `${name} is low-passed, not muffled (${c} Hz)`);
    }
    assert.ok(resolveInstrument('pad').cutoff <= 3000 && resolveInstrument('pulse25').cutoff >= 5000);
    assert.ok(resolveInstrument('square', 'bass').cutoff <= 1500, 'bass voices are dark');
    // The tunes bus's -3 dB shelf at 8 kHz, in the loudness model too.
    assert.ok(Math.abs(10 * Math.log10(highshelfPower(16000)) + 3) < 0.3 && Math.abs(10 * Math.log10(highshelfPower(500))) < 0.1);
    const inst = resolveInstrument({ wave: 'pulse12', cutoff: 1800, q: 3, fenv: [2, 0.2] });
    assert.deepEqual([inst.cutoff, inst.q, inst.fenv], [1800, 3, [2, 0.2]]);
    assert.equal(resolveInstrument({ preset: 'brass', fenv: false }).fenv, null);
    assert.equal(noteCutoff(resolveInstrument('pad'), noteToMidi('C7')), 3 * 2093.004522404789, 'never below 3x the pitch');
    assert.ok(lowpassPower(100, 1000) > 0.99 && lowpassPower(8000, 1000) < 0.001);
  });

  test('tunes may set their duck depth; F and A are the network drums', () => {
    assert.equal(parseTune({ notes: 'C4:1', duck: -20 }).duck, -20);
    assert.equal(parseTune({ notes: 'C4:1' }).duck, null);
    assert.deepEqual(parseTune({ drums: 'F:1 A:2 felt:1 air:1' }).tracks[0].events.map((e) => e.drum), ['f', 'a', 'f', 'a']);
  });

  test('wave tables are exact and cheap (no stall on the first note)', () => {
    for (const kind of WAVE_KINDS) {
      const t0 = performance.now();
      const t = waveTable(kind);
      assert.ok(performance.now() - t0 < 250, `${kind} built in ${performance.now() - t0} ms`);
      assert.ok(t.peak > 0.5 && t.peak < 1.3, `${kind} peak ${t.peak}`);
    }
    // NES triangle: the closed form matches a numerical transform of its 32 steps.
    const { real, imag } = waveTable('tri');
    const M = 4096;
    const step = (p) => { const k = Math.floor(p * 32) % 32; return ((k < 16 ? 15 - k : k - 16) - 7.5) / 7.5; };
    for (const k of [1, 3, 5, 31, 33]) {
      let re = 0;
      let im = 0;
      for (let m = 0; m < M; m++) {
        re += step((m + 0.5) / M) * Math.cos((2 * Math.PI * k * (m + 0.5)) / M);
        im += step((m + 0.5) / M) * Math.sin((2 * Math.PI * k * (m + 0.5)) / M);
      }
      assert.ok(Math.abs(real[k] - (2 * re) / M) < 2e-3 && Math.abs(imag[k] - (2 * im) / M) < 2e-3, `harmonic ${k}`);
    }
  });
});

describe('sonic identity', () => {
  const leadNotes = (tune) => parseTune(tune).tracks[0].events.map((e) => e.midis[0]);
  const allCues = () => [
    ...THEME_IDS.map((id) => [`open ${id}`, themeFor(id)]), ['open generic', themeFor('nope')],
    ['ident', IDENT], ['ident night', IDENT_NIGHT], ['stinger', STINGER],
    ...CUE_PROGRAMMES.flatMap((id) => ['breaking', 'outro', 'promo'].map((n) => [`${n} ${id}`, cueFor(n, id)])),
  ];
  // Notes sounding at beat b in the given tracks of a parsed song.
  const sounding = (song, b, kinds) => song.tracks.filter((t) => kinds.includes(t.kind)).flatMap((t) => t.events.filter((e) => e.at <= b + 1e-6 && e.at + e.dur > b + 1e-6).flatMap((e) => e.midis));

  test('every programme open states the signature, then its own colour note', () => {
    const colour = { 'world-now': COLOURS.home, 'tech-bytes': COLOURS.tech, cosmos: COLOURS.cosmos, 'money-minute': COLOURS.money, 'news-60': COLOURS.sixty };
    const keys = new Set();
    for (const id of THEME_IDS) {
      const notes = leadNotes(themeFor(id));
      const tonic = notes[1];
      assert.deepEqual(notes.slice(0, 4).map((m) => m - tonic), MOTIF.map(([semi]) => semi), id);
      assert.equal(notes[4] - tonic, colour[id], id);
      keys.add(tonic % 12);
    }
    assert.equal(keys.size, THEME_IDS.length, 'each programme in its own key');
  });

  test('the colour note sounds over a tonic pedal (heard as a degree of the key)', () => {
    for (const id of THEME_IDS) {
      const song = parseTune(themeFor(id));
      const lead = song.tracks[0].events;
      const tonic = lead[1].midis[0] % 12;
      const at = lead[4].at;
      const bass = sounding(song, at + 0.01, ['bass']);
      assert.ok(bass.length && Math.min(...bass) % 12 === tonic, `${id}: bass ${bass} under the colour`);
    }
  });

  test('the final chord lands on the title lock-up and the button on the cut', () => {
    for (const duration of [3.5, 4, 4.5]) {
      for (const id of [...THEME_IDS, 'unknown']) {
        const tune = themeFor(id, { duration });
        const song = parseTune(tune);
        const spb = 60 / song.bpm;
        assert.ok(Math.abs(tune.meta.hitAt - (duration - 0.8)) < 1e-9);
        const starts = new Set(flatten(song).map((e) => Math.round(e.at * spb * 1000)));
        assert.ok(starts.has(Math.round(tune.meta.hitAt * 1000)), `${id} hit at ${tune.meta.hitAt}`);
        assert.ok(starts.has(Math.round(duration * 1000)), `${id} button at ${duration}`);
        assert.ok(tune.fadeOut >= 0.5, 'the chord rings into the studio shot');
      }
    }
  });

  test('tempos follow the bibles', () => {
    const bpm = (id) => themeFor(id).meta.bpm;
    assert.ok(bpm('world-now') >= 88 && bpm('world-now') <= 96, `world ${bpm('world-now')}`);
    assert.ok(bpm('tech-bytes') >= 100 && bpm('tech-bytes') <= 108, `tech ${bpm('tech-bytes')}`);
    assert.ok(bpm('cosmos') >= 72 && bpm('cosmos') <= 88, `cosmos ${bpm('cosmos')}`);
    assert.ok(bpm('money-minute') >= 112 && bpm('money-minute') <= 116, `money ${bpm('money-minute')}`);
    assert.ok(Math.abs(bpm('news-60') - 120) <= 3, `news-60 ${bpm('news-60')}`);
    assert.equal(IDENT.bpm, 100);
    assert.equal(IDENT_NIGHT.bpm, 88);
    assert.equal(cueFor('ident', null, { hour: 23 }).bpm, 88);
    assert.equal(cueFor('ident', null, { hour: 10 }).bpm, 100);
  });

  test('MONEY MINUTE: straight, no brass, no bells above C6 (money-minute.md)', () => {
    const song = parseTune(themeFor('money-minute'));
    assert.ok(song.swing <= 0.05);
    for (const t of song.tracks) {
      if (t.kind === 'drums') continue;
      assert.ok(!(t.inst.wave === 'pulse25' && t.inst.scoop > 0), 'no brass');
      const top = Math.max(...t.events.flatMap((e) => e.midis));
      if (t.inst.d >= 0.4 && t.inst.s === 0) assert.ok(top <= noteToMidi('C6'), 'no bell above C6');
    }
  });

  test('network cues: no chip arpeggios, crashes or whooshes; the stinger is not a tune', () => {
    for (const [name, tune] of allCues()) {
      const song = parseTune(tune);
      for (const t of song.tracks) {
        assert.equal(t.arp, 0, `${name}: arpeggio`);
        if (t.kind === 'drums') assert.ok(!t.events.some((e) => e.drum === 'c' || e.drum === 'w'), `${name}: crash or whoosh`);
      }
    }
    const sting = parseTune(STINGER);
    assert.ok(!sting.tracks.some((t) => t.kind === 'lead'), 'no melody in the stinger');
    assert.ok(songSeconds(sting) <= 1.01, 'stinger fits the 0.8 s wipe');
  });

  test('ident, breaking and sign-offs use the signature; the promo leaves it hanging on 2', () => {
    for (const [name, cue] of [['ident', IDENT], ['breaking', BREAKING], ...CUE_PROGRAMMES.filter((id) => id !== 'news-60').map((id) => [`outro ${id}`, cueFor('outro', id)])]) {
      const notes = leadNotes(cue);
      const tonic = notes[1];
      assert.deepEqual(notes.slice(0, 4).map((m) => m - tonic), MOTIF.map(([semi]) => semi), name);
    }
    assert.equal(leadNotes(BREAKING)[4] - leadNotes(BREAKING)[1], COLOURS.breaking, 'breaking ends on b3');
    for (const id of CUE_PROGRAMMES) {
      const notes = leadNotes(cueFor('promo', id));
      assert.equal(notes.length, 3, 'three notes');
      assert.deepEqual(notes.map((m) => m - notes[1]), [-5, 0, 2], 'low 5, 1, then hanging on 2');
      assert.ok(!parseTune(cueFor('promo', id)).tracks.some((t) => t.kind === 'drums'), 'no drums');
    }
    assert.ok(!parseTune(IDENT).tracks.some((t) => t.kind === 'drums'), 'the ident has no drums');
    assert.ok(songSeconds(parseTune(BREAKING)) <= 3, 'breaking sting at most 3 s');
  });

  test('breaking, sign-off and promo are in the programme\'s own key', () => {
    for (const id of THEME_IDS) {
      const tonic = leadNotes(themeFor(id))[1] % 12;
      assert.equal(leadNotes(cueFor('breaking', id))[1] % 12, tonic, `breaking ${id}`);
      assert.equal(leadNotes(cueFor('promo', id))[1] % 12, tonic, `promo ${id}`);
      const out = parseTune(cueFor('outro', id));
      const bass = out.tracks.find((t) => t.kind === 'bass').events[0].midis[0];
      assert.equal(bass % 12, tonic, `outro ${id}`);
    }
    assert.equal(cueFor('outro', 'news-60').tracks[0].inst, 'bell', 'NEWS IN 60 signs off on a Gadd9 bell chord');
    assert.equal(cueFor('breaking', 'nope'), cueFor('breaking', 'channel'), 'unknown ids use the channel key');
    assert.equal(cueFor('nope'), null);
    for (const name of ['jingle', 'whoosh', 'breaking', 'outro', 'promo', 'upnext', 'signoff', 'bumper']) assert.ok(CUES[name], name);
  });

  test('unknown programmes get the generic theme', () => {
    assert.equal(themeFor('nope').meta.programId, 'generic');
  });
});

describe('loudness', () => {
  test('the meter reads a full-scale 1 kHz sine in both channels as 0 LUFS', () => {
    const fs = 48000;
    const x = new Float32Array(fs * 2);
    for (let i = 0; i < x.length; i++) x[i] = Math.sin((2 * Math.PI * 1000 * i) / fs);
    const L = measureLoudness([x, x], fs);
    assert.ok(Math.abs(L.integrated) < 0.1, `${L.integrated}`);
    assert.ok(Math.abs(L.peakDb) < 0.01);
    assert.ok(Math.abs(measureLoudness([x], fs).integrated + 3.01) < 0.1);
  });

  test('silence is gated out', () => {
    assert.equal(measureLoudness([new Float32Array(48000)], 48000).integrated, -Infinity);
  });

  test('the envelope energy of a held note grows with its length', () => {
    const inst = resolveInstrument('pulse50');
    assert.ok(envelopeEnergy(inst, 1) > envelopeEnergy(inst, 0.5) * 1.6);
    assert.ok(envelopeEnergy(inst, 0.001) > 0);
  });

  test('the level plan is set against the voice', () => {
    assert.equal(TARGET_LUFS, VOICE_LUFS);
    assert.equal(parseTune(STINGER).trim <= -6, true, 'stinger at least 6 LU under the voice');
    for (const cue of [IDENT, BREAKING, OUTRO, PROMO]) assert.ok(parseTune(cue).trim < 0 && parseTune(cue).trim >= -3, 'cues 1-3 LU under the voice');
  });

  // Golden model predictions (ungained LUFS of one pass). The lab
  // (public/lab/audio.html, view "loudness") measured every one of these
  // within 1.1 LU of its target with the gain derived from them (the stinger
  // trim compensates its known -3 LU model error). If a tune or the model
  // changes, re-measure in the lab before updating this table.
  const GOLDEN = {
    'open:world-now': -17.95, 'open:tech-bytes': -15.4, 'open:cosmos': -13.87, 'open:money-minute': -15.81, 'open:news-60': -22.47, 'open:generic': -16.06,
    'ident:day': -21.03, 'ident:night': -21.04, stinger: -25.1, 'breaking:channel': -19.33, 'outro:channel': -18.94, 'outro:world-now': -20.11,
    'outro:cosmos': -15.65, 'outro:news-60': -21.41, 'promo:world-now': -22.66,
  };
  test('model predictions match the golden table (within 0.5 LU)', () => {
    const tunes = {
      ...Object.fromEntries([...THEME_IDS, 'generic'].map((id) => [`open:${id}`, themeFor(id === 'generic' ? 'nope' : id)])),
      'ident:day': IDENT, 'ident:night': IDENT_NIGHT, stinger: STINGER, 'breaking:channel': BREAKING, 'outro:channel': OUTRO,
      'outro:world-now': cueFor('outro', 'world-now'), 'outro:cosmos': cueFor('outro', 'cosmos'), 'outro:news-60': cueFor('outro', 'news-60'), 'promo:world-now': cueFor('promo', 'world-now'),
    };
    for (const [k, want] of Object.entries(GOLDEN)) {
      const est = estimateLoudness(parseTune(tunes[k]));
      assert.ok(Math.abs(est.integrated - want) < 0.5, `${k}: model ${est.integrated.toFixed(2)} vs golden ${want}`);
      assert.ok(Math.abs(est.gainDb) < 12, `${k} inside the correction range`);
    }
  });

  test('every ad tune is levelled within the correction range', () => {
    for (const ad of ADS) {
      const est = estimateLoudness(parseTune(ad.tune));
      assert.ok(Number.isFinite(est.integrated), ad.id);
      assert.ok(Math.abs(est.gainDb) < 12, `${ad.id}: ${est.gainDb} dB`);
    }
  });
});

describe('TTS voice choice', () => {
  const v = (name, lang, localService = true) => ({ name, lang, localService });
  const EDGE = [
    v('Microsoft David - English (United States)', 'en-US'), v('Microsoft Zira - English (United States)', 'en-US'),
    v('Microsoft Ryan Online (Natural) - English (United Kingdom)', 'en-GB', false), v('Microsoft Sonia Online (Natural) - English (United Kingdom)', 'en-GB', false),
    v('Microsoft Guy Online (Natural) - English (United States)', 'en-US', false), v('Microsoft Jenny Online (Natural) - English (United States)', 'en-US', false),
    v('Microsoft Ana Online (Natural) - English (United States)', 'en-US', false),
  ];
  const profiles = (obj) => new Map(Object.entries(obj).map(([k, p]) => [k, normProfile(p)]));

  test('natural voices beat the old desktop ones, in the asked region', () => {
    const res = resolveVoices({ all: EDGE, voices: EDGE, profiles: profiles({ A: { gender: 'male', lang: 'en-GB' }, B: { gender: 'female', lang: 'en-US' } }) });
    assert.match(res.get('A').voice.name, /Ryan/);
    assert.match(res.get('B').voice.name, /Jenny/);
  });

  test('two presenters of the same gender get two different voices; never the child voice', () => {
    const res = resolveVoices({ all: EDGE, voices: EDGE, profiles: profiles({ A: { gender: 'female', lang: 'en-US' }, B: { gender: 'female', lang: 'en-US' }, C: { gender: 'female', lang: 'en-US' } }) });
    const names = ['A', 'B', 'C'].map((k) => res.get(k).voice.name);
    assert.equal(new Set(names.slice(0, 2)).size, 2);
    assert.ok(!names.slice(0, 2).some((n) => /Ana/.test(n)), names.join(' | '));
  });

  test('quality ranks neural > premium > Google > plain > eSpeak', () => {
    const q = (name, local = true) => voiceQuality({ name, localService: local });
    assert.ok(q('Microsoft Libby Online (Natural)', false) > q('Ava (Premium)'));
    assert.ok(q('Ava (Premium)') > q('Google UK English Female', false));
    assert.ok(q('Google UK English Female', false) > q('Samantha'));
    assert.ok(q('Samantha') > q('espeak-ng English'));
  });

  test('the robot presenter gets a natural voice at near-natural pitch, never a novelty one', () => {
    const list = [v('Samantha', 'en-US'), v('Fred', 'en-US'), v('Zarvox', 'en-US'), v('Daniel', 'en-GB'), v('Evan (Enhanced)', 'en-US')];
    const res = resolveVoices({ all: list, voices: list, profiles: profiles({ unit8: { gender: 'robot', lang: 'en-US', pitch: 0.6 } }) });
    assert.ok(!/Fred|Zarvox/.test(res.get('unit8').voice.name), res.get('unit8').voice.name);
    assert.ok(res.get('unit8').pitch >= 0.9, `pitch ${res.get('unit8').pitch}`);
    // Two presenters plus the robot: the robot takes a voice nobody else uses.
    const res2 = resolveVoices({ all: EDGE, voices: EDGE, profiles: profiles({ A: { gender: 'male', lang: 'en-GB' }, B: { gender: 'female', lang: 'en-US' }, unit8: { gender: 'robot', lang: 'en-US' } }) });
    const names = ['A', 'B', 'unit8'].map((k) => res2.get(k).voice.name);
    assert.equal(new Set(names).size, 3, names.join(' | '));
  });

  test('the blips voice is a murmur: fixed speaking pitch, formants, no beeps', () => {
    const res = resolveVoices({ profiles: profiles({ A: { gender: 'male' }, B: { gender: 'female' }, unit8: { gender: 'robot' } }) });
    const [a, b, r] = ['A', 'B', 'unit8'].map((k) => res.get(k).blip);
    assert.ok(a.base > 90 && a.base < 140 && b.base > 170 && b.base < 240, `${a.base} ${b.base}`);
    assert.ok(b.formant > a.formant);
    assert.equal(r.monotone, true);
    for (const x of [a, b, r]) assert.ok(x.cut <= 3000, 'muffled, like a voice through a wall');
  });
});
