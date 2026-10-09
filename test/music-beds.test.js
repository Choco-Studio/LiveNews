// The programmes' beds (music/proposals/lofi, live through music/live.js): voiced without semitone
// rubs, each in its programme's key, WORLD WEATHER on its own song.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTES, PROGRAMMES, arrangementFor } from '../public/js/music/proposals/lofi/palettes.js';
import { barEvents } from '../public/js/music/proposals/lofi/arranger.js';
import { QUALITIES, parseChord, voiceChord } from '../public/js/music/proposals/lofi/theory.js';
import { resolveCue } from '../public/js/music/proposals/lofi/cuesheet.js';
import { openSeconds } from '../public/js/music/proposals/lofi/render.js';
import { themeFor } from '../public/js/audio/themes.js';
import { parseTune } from '../public/js/audio/tune.js';
import { durationOf } from '../public/js/scenes/opens/cues.js';
import { WN_DURATION } from '../public/js/scenes/opens/worldcues.js';

// Pitched notes sounding together a semitone apart over `bars` bars of a song's moment.
function rubs(song, moment, bars = 64) {
  const pal = PALETTES[song];
  const arr = arrangementFor(song, moment);
  const state = {};
  let prev = null;
  let count = 0;
  for (let n = 0; n < bars; n++) {
    const { events } = barEvents(pal, `${song}#test`, arr, prev, n, state);
    prev = arr;
    const notes = events.filter((e) => e.midi != null && (arr.layers[e.layer] || 0) > 0);
    for (let t = 0; t < 4; t += 0.125) {
      const on = notes.filter((e) => e.at <= t + 1e-6 && e.at + (e.dur ?? 0.25) > t + 0.01);
      for (let i = 0; i < on.length; i++) for (let j = i + 1; j < on.length; j++) if (Math.abs(on[i].midi - on[j].midi) === 1) count++;
    }
  }
  return count;
}

test('no programme bed sounds two notes a semitone apart (within a chord or between layers)', () => {
  for (const [song, pal] of Object.entries(PALETTES)) {
    for (const moment of Object.keys(pal.moments)) assert.equal(rubs(song, moment), 0, `${song} ${moment}`);
  }
});

test('voicings: no two voices a semitone or a minor ninth apart, low voices spaced, near the register asked', () => {
  for (const q of Object.keys(QUALITIES)) {
    for (let root = 0; root < 12; root++) {
      for (const lo of [48, 52, 55, 60]) {
        const chord = parseChord(`${'C C# D Eb E F F# G Ab A Bb B'.split(' ')[root]}${q}`);
        const v = voiceChord(chord, null, lo);
        for (let i = 0; i < v.length; i++) {
          for (let j = i + 1; j < v.length; j++) {
            const d = v[j] - v[i];
            assert.ok(d !== 1 && (d !== 13 || q === '7b9'), `${chord.symbol} at ${lo}: ${v}`);
          }
          if (i > 0 && v[i - 1] < 55) assert.ok(v[i] - v[i - 1] >= 3, `${chord.symbol} at ${lo}: a second below G3 (${v})`);
        }
        assert.ok(v[0] >= lo - 5 && v.at(-1) <= lo + 26, `${chord.symbol} at ${lo}: ${v}`);
      }
    }
  }
  // a layer voiced round another doubles its notes rather than rubbing a semitone on them
  const keys = voiceChord(parseChord('Am9'), null, 55);
  const pad = voiceChord(parseChord('Am9'), null, 50, { avoid: keys });
  for (const p of pad) for (const k of keys) assert.ok(Math.abs(p - k) !== 1 && Math.abs(p - k) !== 13, `${pad} / ${keys}`);
});

test('each programme\'s beds are in its open\'s key, WORLD WEATHER on its own song', () => {
  const tonicOf = (id) => parseTune(themeFor(id)).tracks[0].events[1].midis[0] % 12;
  for (const [song, pal] of Object.entries(PALETTES)) {
    if (pal.programme === 'channel') continue;
    assert.equal(pal.tonic % 12, tonicOf(pal.programme), `${song} in the key of the ${pal.programme} open`);
  }
  const w = PALETTES['world-weather'];
  assert.equal(PROGRAMMES['world-weather'].tonic % 12, 0, 'C major');
  assert.ok(w.bpm >= 88 && w.bpm <= 96 && w.drums === 'none' && w.swing === 0.5);
  const cue = (kind) => resolveCue('weather', { programId: 'world-weather', kind }, {});
  for (const kind of ['intro', 'zone']) assert.deepEqual([cue(kind).song, cue(kind).moment], ['world-weather', 'forecast'], kind);
  assert.equal(cue('tomorrow').moment, 'tomorrow');
  assert.equal(cue('outro').moment, 'signoff');
  assert.equal(cue('warning').kind, 'silence', 'a storm is not a jingle');
});

test('the lab renders each open as long as the director plays it', () => {
  for (const id of ['tech-bytes', 'cosmos', 'money-minute', 'news-60', 'world-weather']) assert.equal(openSeconds(id), durationOf(id), id);
  assert.equal(openSeconds('world-now'), WN_DURATION);
});

test('no sting sounds two notes a semitone apart (each chord voiced round its melody)', async () => {
  const { STINGS } = await import('../public/js/music/proposals/lofi/stings.js');
  // a stand-in engine: any audio node is a chainable no-op; the rig records the notes it is asked for
  const node = () => new Proxy(function () {}, { get: (t, k) => (k === 'value' ? 0 : node()), apply: () => node(), set: () => true });
  const notes = [];
  const rig = new Proxy({}, { get: (t, inst) => (time, midi, third) => {
    if (typeof midi === 'number' && midi > 20 && midi < 110) notes.push({ inst, t: time, midi, dur: inst === 'timpani' ? 0.8 : typeof third === 'number' ? third : 0.5 });
  } });
  const eng = { ctx: node(), stingBus: node(), rig, registerSting() {} };
  const progs = ['world-now', 'tech-bytes', 'cosmos', 'money-minute', 'news-60', 'world-weather'];
  const cases = [
    ...[0, 1, 2].map((line) => ['headline', { line, lines: 3 }]), ...['pip', 'signoffBrass', 'breaking', 'techNumber', 'techButton', 'moneyNumber', 'moneySignoff', 'moneyButton', 'sixtyBell', 'shortIdent', 'sombreIdent'].map((n) => [n, {}]),
    ...progs.flatMap((programme) => [['countdown', { programme }], ['identFilm', { programme, hour: 12 }], ['identFilm', { programme, hour: 23 }], ['replay', { programme }], ['upNext', { programme }]]),
  ];
  for (const [name, o] of cases) {
    notes.length = 0;
    STINGS[name](eng, 0, o);
    for (let i = 0; i < notes.length; i++) for (let j = i + 1; j < notes.length; j++) {
      const [a, b] = [notes[i], notes[j]];
      const together = a.t < b.t + b.dur && b.t < a.t + a.dur;
      assert.ok(!(together && Math.abs(a.midi - b.midi) === 1), `${name} ${o.programme ?? ''}: ${a.inst} ${a.midi} / ${b.inst} ${b.midi}`);
    }
  }
});
