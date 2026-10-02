import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { VISEMES, buildTimeline, sampleTimeline, speechTokens, wordAtChar, blipPlan, SpeechClock } from '../public/js/audio/visemes.js';
import { parseTune, flatten, songSeconds, noteToMidi, resolveInstrument } from '../public/js/audio/tune.js';
import { themeFor, THEME_IDS, MOTIF, COLOURS, CUES, IDENT, STINGER, BREAKING, OUTRO, PROMO } from '../public/js/audio/themes.js';
import { measureLoudness, estimateLoudness, envelopeEnergy, TARGET_LUFS } from '../public/js/audio/loudness.js';
import { resolveVoices, normProfile, voiceQuality } from '../public/js/audio/voices.js';
import { ADS } from '../public/js/ads/index.js';

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

describe('sonic identity', () => {
  const leadNotes = (tune) => parseTune(tune).tracks[0].events.map((e) => e.midis[0]);

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

  test('unknown programmes get the generic theme', () => {
    assert.equal(themeFor('nope').meta.programId, 'generic');
  });

  test('channel cues: ident, stinger, breaking, sign-off and promo all use the signature', () => {
    for (const cue of [IDENT, STINGER, BREAKING, OUTRO, PROMO]) {
      const lead = cue.tracks.find((t) => t.notes && t.kind === 'lead');
      const notes = parseTune({ bpm: cue.bpm, notes: lead.notes }).tracks[0].events.map((e) => e.midis[0]);
      const tonic = notes[1];
      assert.deepEqual(notes.slice(0, 4).map((m) => m - tonic), MOTIF.map(([semi]) => semi));
    }
    for (const name of ['jingle', 'whoosh', 'breaking', 'outro', 'promo']) assert.ok(CUES[name], name);
    assert.ok(songSeconds(parseTune(STINGER)) <= 1.01, 'stinger fits the 0.8 s wipe');
    assert.ok(songSeconds(parseTune(BREAKING)) <= 3, 'breaking sting at most 3 s');
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

  test('the model levels every theme, cue and ad tune to the channel target', () => {
    const tunes = [...THEME_IDS.map((id) => themeFor(id)), IDENT, BREAKING, OUTRO, ...ADS.map((ad) => ad.tune)];
    for (const tune of tunes) {
      const song = parseTune(tune);
      const est = estimateLoudness(song);
      assert.ok(Number.isFinite(est.integrated));
      assert.ok(Math.abs(est.integrated + est.gainDb - (TARGET_LUFS + song.trim)) < 0.01, 'within the ±12 dB correction range');
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

  test('a robot presenter gets a robotic voice when there is one', () => {
    const list = [v('Samantha', 'en-US'), v('Fred', 'en-US'), v('Daniel', 'en-GB')];
    const res = resolveVoices({ all: list, voices: list, profiles: profiles({ unit8: { gender: 'robot', lang: 'en-US' } }) });
    assert.equal(res.get('unit8').voice.name, 'Fred');
  });
});
