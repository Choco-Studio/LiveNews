// Self-test for the lo-fi music proposal's pure parts (no WebAudio), including
// the music rules of the programme style bibles (docs/programmes/*.md):
//   node public/js/music/proposals/lofi/selftest.mjs
// Not named *.test.js on purpose: it is a proposal-local check, outside the repo's suite.
import assert from 'node:assert/strict';
import { MOTIF as SHARED_MOTIF, COLOURS as SHARED_COLOURS } from '../../../audio/themes.js';
import { SIGNATURE, SIGNATURE_SEMITONES, COLOUR, SCALES, degreeToMidi, motifVariant, parseChord, voiceChord, QUALITIES } from './theory.js';
import { PALETTES, PROGRAMMES, LAYERS, DUCK_GROUP, arrangementFor } from './palettes.js';
import { barEvents, formBars } from './arranger.js';
import { resolveCue, CUE_SHEET } from './cuesheet.js';

let n = 0;
const test = (name, fn) => {
  fn();
  n++;
  console.log(`ok ${n} - ${name}`);
};

test('signature equals the audio stream MOTIF (one network, one signature)', () => {
  assert.deepEqual(SIGNATURE.map((s, i) => [SIGNATURE_SEMITONES[i], s.len]), SHARED_MOTIF.map(([s, l]) => [s, l]));
  for (const [name, scale] of Object.entries(SCALES)) {
    assert.deepEqual(SIGNATURE.map((s) => degreeToMidi(60, scale, s.d) - 60), [...SIGNATURE_SEMITONES], name);
  }
});

test('each programme colour note is the semitone the audio stream uses, in the open\'s key', () => {
  const want = { 'world-now': ['home', 62], 'tech-bytes': ['tech', 57], cosmos: ['cosmos', 64], 'money-minute': ['money', 65], 'news-60': ['sixty', 67], channel: ['home', 62] };
  for (const [id, [key, tonic]] of Object.entries(want)) {
    const p = PROGRAMMES[id];
    assert.equal(degreeToMidi(0, SCALES[p.scale], p.colour), SHARED_COLOURS[key], id);
    assert.equal(p.tonic % 12, tonic % 12, `${id} key`);
  }
  assert.equal(degreeToMidi(0, SCALES.minor, COLOUR.breaking), SHARED_COLOURS.breaking);
  assert.equal(degreeToMidi(0, SCALES.major, COLOUR.next), SHARED_COLOURS.next);
});

test('statement is exactly one bar; variants stay within two bars', () => {
  const st = motifVariant('statement');
  assert.equal(st.at(-1).at + st.at(-1).len, 4);
  for (const k of ['head', 'answer', 'displaced', 'retrograde', 'echo', 'augmented']) {
    const v = motifVariant(k);
    assert.ok(v.length >= 3 && v.at(-1).at + v.at(-1).len <= 8, k);
  }
});

test('every chord symbol parses to a known quality and voices inside a sane register', () => {
  for (const [id, pal] of Object.entries(PALETTES)) {
    for (const sym of Object.values(pal.sections).flat()) {
      const c = parseChord(sym);
      const q = /^[A-G][#b]?([^/]*)/.exec(sym)[1] || 'maj7';
      assert.ok(QUALITIES[q], `${id} ${sym}: unknown quality ${q}`);
      const v = voiceChord(c, null, pal.keys.lo);
      assert.ok(v[0] >= pal.keys.lo && v.at(-1) <= pal.keys.lo + 26, `${id} ${sym} ${v}`);
    }
  }
});

test('arranger is deterministic (live == offline) and long songs vary across passes', () => {
  for (const [id, pal] of Object.entries(PALETTES)) {
    for (const m of Object.keys(pal.moments)) {
      const arr = arrangementFor(id, m);
      assert.deepEqual(barEvents(pal, id, arr, arr, 7, {}).events, barEvents(pal, id, arr, arr, 7, {}).events, `${id}:${m}`);
    }
    const bars = formBars(pal);
    if (bars < 8) continue;
    const arr = arrangementFor(id, Object.keys(pal.moments)[0]);
    let differs = 0;
    for (let bar = 0; bar < bars; bar++) {
      if (JSON.stringify(barEvents(pal, id, arr, arr, bar, {}).events) !== JSON.stringify(barEvents(pal, id, arr, arr, bar + bars, {}).events)) differs++;
    }
    assert.ok(differs >= bars * 0.75, `${id}: only ${differs}/${bars} bars differ on the second pass`);
  }
  for (const l of LAYERS) assert.ok(DUCK_GROUP[l], l);
});

// ---- the programme bibles' music rules
const notesOf = (id, m, bars = 16) => {
  const pal = PALETTES[id];
  const arr = arrangementFor(id, m);
  const st = {};
  return Array.from({ length: bars }, (_, b) => barEvents(pal, id, arr, arr, b, st).events).flat();
};

test('WORLD NOW: round-up 96-104 BPM, muted pluck ostinato + triangle, no melody, no drums; And finally 84-92', () => {
  const r = PALETTES['world-now/roundup'];
  assert.ok(r.bpm >= 96 && r.bpm <= 104);
  const ev = notesOf('world-now/roundup', 'roundup');
  assert.ok(ev.every((e) => ['arp', 'bass'].includes(e.layer)), 'only the ostinato and the bass');
  assert.ok(ev.filter((e) => e.layer === 'arp').every((e) => e.inst === 'pluck'));
  const f = PALETTES['world-now/finally'];
  assert.ok(f.bpm >= 84 && f.bpm <= 92);
  assert.ok(notesOf('world-now/finally', 'finally').every((e) => (e.layer === 'lead' && e.inst === 'softtri') || (e.layer === 'arp' && e.inst === 'pluck')));
});

test('TECH BYTES: 100-108 BPM, no swing, triangle roots, pad, pulse-12 arp (vel <= 0.45, LP <= 1.8 kHz), no kick/snare, hats only on light beds', () => {
  const t = PALETTES['tech-bytes'];
  assert.ok(t.bpm >= 100 && t.bpm <= 108 && t.swing === 0.5);
  assert.ok(t.arp.vel <= 0.45 && t.arp.bright <= 1800 && t.arp.wave === 'pulse125');
  for (const m of Object.keys(t.moments)) {
    const ev = notesOf('tech-bytes', m);
    assert.ok(!ev.some((e) => e.inst === 'kick' || e.inst === 'snare'), m);
    assert.equal(ev.some((e) => e.inst === 'hat'), m === 'headlines' || m === 'finally', `${m}: hats on light beds only`);
  }
  assert.equal(resolveCue('story', { programId: 'tech-bytes', emotion: 'neutral' }).kind, 'silence', 'story links have no bed');
});

test('COSMOS: 68-84 BPM, pad + sub under voice low-passed <= 1.2 kHz, bells muted under voice, no drums, no stings', () => {
  for (const id of ['cosmos', 'cosmos/finally']) {
    const c = PALETTES[id];
    assert.ok(c.bpm >= 68 && c.bpm <= 84);
    assert.equal(c.duck.melody, 0);
    for (const m of Object.keys(c.moments)) {
      assert.ok(arrangementFor(id, m).lp <= 1200, `${id}:${m} LP`);
      assert.ok(notesOf(id, m).every((e) => ['pad', 'bass', 'lead'].includes(e.layer)));
      assert.ok(notesOf(id, m, 32).filter((e) => e.layer === 'lead').length <= 32 * 4, 'at most 4 bells a bar');
    }
  }
  assert.equal(resolveCue('greeting', { programId: 'cosmos' }).kind, 'silence');
  assert.equal(resolveCue('number', { programId: 'cosmos' }).kind, 'silence', 'the Reading');
  assert.equal(resolveCue('shot', { programId: 'cosmos', kind: 'picture' }).show, true);
});

test('MONEY MINUTE: 112-116 BPM straight, intro vamp Fmaj9 | Dm9 | Bbmaj9 | C6sus, chords on the "and" of 2 and 4, no drums/arp/lead, tape beds', () => {
  const v = PALETTES['money-minute/intro'];
  assert.ok(v.bpm >= 112 && v.bpm <= 116 && v.swing <= 0.53);
  assert.deepEqual(v.sections.A, ['Fmaj9', 'Dm9', 'Bbmaj9', 'C6sus']);
  const ev = notesOf('money-minute/intro', 'intro');
  assert.ok(ev.filter((e) => e.layer === 'keys').every((e) => e.at === 1.5 || e.at === 3.5));
  assert.ok(ev.every((e) => ['pad', 'bass', 'keys'].includes(e.layer)));
  assert.ok(ev.filter((e) => e.layer === 'keys').every((e) => e.vel <= 0.5), 'Rhodes velocity 0.5 or less');
  assert.deepEqual(PALETTES['money-minute/tape-up'].sections.A, ['Fmaj9', 'Bbmaj9']);
  assert.deepEqual(PALETTES['money-minute/tape-down'].sections.A, ['Dm9', 'Bbmaj9']);
  assert.deepEqual(PALETTES['money-minute/tape-mixed'].sections.A, ['Gm9', 'C9sus']);
  assert.equal(resolveCue('story', { programId: 'money-minute' }).kind, 'silence');
  assert.equal(resolveCue('number', { programId: 'money-minute', tape: 'down' }).song, 'money-minute/tape-down');
});

test('NEWS IN 60: 120 BPM, pad + staccato bass on every beat + tock (1, 3) / tick (2, 4), no melody; grave = pad only', () => {
  const s = PALETTES['news-60'];
  assert.equal(s.bpm, 120);
  const ev = notesOf('news-60', 'bed', 4);
  const clock = ev.filter((e) => e.inst === 'clock');
  assert.equal(clock.length, 16);
  assert.ok(clock.every((e) => e.tok === (e.at % 2 === 0)));
  assert.equal(ev.filter((e) => e.layer === 'bass').length, 16);
  assert.ok(!ev.some((e) => e.layer === 'lead' || e.layer === 'arp'));
  assert.ok(notesOf('news-60', 'grave').every((e) => e.layer === 'pad'));
  assert.equal(resolveCue('story', { programId: 'news-60', grave: true }).moment, 'grave');
  assert.equal(resolveCue('item', { programId: 'news-60' }).kind, 'accent');
});

test('grave: silence in the segment and the next one; lead-ins and bumpers per the channel bible', () => {
  assert.deepEqual(resolveCue('story', { programId: 'world-now', emotion: 'serious' }), { kind: 'silence', fade: 2.5 });
  assert.equal(resolveCue('story', { programId: 'tech-bytes', emotion: 'sad' }, { gravePad: true }).kind, 'gravePad');
  assert.equal(resolveCue('roundup', { programId: 'world-now' }, { afterGrave: true }).kind, 'silence');
  assert.equal(resolveCue('chat', { programId: 'tech-bytes' }, { afterGrave: true }).kind, 'silence');
  assert.equal(resolveCue('roundup', { programId: 'world-now' }).song, 'world-now/roundup');
  assert.equal(resolveCue('leadin', { programId: 'world-now' }).name, 'countdown');
  assert.equal(resolveCue('leadin', { programId: 'news-60' }).name, 'countdown');
  assert.equal(resolveCue('leadin', { programId: 'cosmos' }).name, 'identFilm');
  assert.equal(resolveCue('bumper', { kind: 'cards' }).song, 'channel/bumper');
  assert.equal(resolveCue('bumper', { grave: true }).name, 'sombreIdent');
  assert.equal(resolveCue('ad', {}).fade, 0.15);
  const b = PALETTES['channel/bumper'];
  assert.ok(b.bpm >= 80 && b.bpm <= 88 && b.swing > 0.5);
  assert.ok(CUE_SHEET.length >= 25);
});

console.log(`# ${n} passed`);
