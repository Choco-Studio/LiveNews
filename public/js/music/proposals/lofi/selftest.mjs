// Self-test for the lo-fi music proposal's pure parts (no WebAudio):
//   node public/js/music/proposals/lofi/selftest.mjs
// Not named *.test.js on purpose: it is a proposal-local check, outside the repo's suite.
import assert from 'node:assert/strict';
import { MOTIF as SHARED_MOTIF, COLOURS as SHARED_COLOURS } from '../../../audio/themes.js';
import { SIGNATURE, SIGNATURE_SEMITONES, COLOUR, SCALES, degreeToMidi, motifVariant, parseChord, voiceChord, chordPcs } from './theory.js';
import { PALETTES, MOMENTS, LAYERS, DUCK_GROUP, arrangementFor } from './palettes.js';
import { barEvents, chordAt } from './arranger.js';
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

test('each palette colour note is the semitone the audio stream uses', () => {
  const want = { 'world-now': 'home', 'tech-bytes': 'tech', cosmos: 'cosmos', 'money-minute': 'money', 'news-60': 'sixty', channel: 'home' };
  for (const [id, key] of Object.entries(want)) {
    const pal = PALETTES[id];
    assert.equal(degreeToMidi(0, SCALES[pal.scale], pal.colour), SHARED_COLOURS[key], id);
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
    for (const sym of [...Object.values(pal.sections).flat(), ...Object.values(pal.cadence)]) {
      const c = parseChord(sym);
      assert.ok(c.quality && c.tones.length >= 2, `${id} ${sym}`);
      const v = voiceChord(c, null, pal.keys.lo);
      assert.ok(v[0] >= pal.keys.lo && v.at(-1) <= pal.keys.lo + 26, `${id} ${sym} ${v}`);
    }
  }
});

test('arranger is deterministic (live == offline) and varies across passes', () => {
  for (const id of Object.keys(PALETTES)) {
    const pal = PALETTES[id];
    const arr = arrangementFor(id, id === 'channel' ? 'standby' : 'headlines');
    const a = barEvents(pal, id, arr, arr, 7, {}).events;
    const b = barEvents(pal, id, arr, arr, 7, {}).events;
    assert.deepEqual(a, b, id);
    const formBars = 4 * pal.form.length;
    // Same position in the form, next pass: not a carbon copy.
    let differs = 0;
    for (let bar = 0; bar < formBars; bar++) {
      const x = JSON.stringify(barEvents(pal, id, arr, arr, bar, {}).events);
      const y = JSON.stringify(barEvents(pal, id, arr, arr, bar + formBars, {}).events);
      if (x !== y) differs++;
    }
    assert.ok(differs >= formBars * 0.9, `${id}: only ${differs}/${formBars} bars differ on the second pass`);
  }
});

test('under-speech moments never carry a lead melody and are low-passed below 3.1 kHz', () => {
  for (const m of ['headlines', 'story', 'storyNeutral', 'chat', 'map']) {
    assert.equal(MOMENTS[m].layers.lead, 0, m);
    assert.ok(MOMENTS[m].lp <= 3100, m);
  }
  for (const l of LAYERS) assert.ok(DUCK_GROUP[l], l);
});

test('melody notes fit the chord (signature lands on a chord tone or a 9th)', () => {
  for (const id of Object.keys(PALETTES)) {
    const pal = PALETTES[id];
    const arr = arrangementFor(id, 'standby');
    const sc = SCALES[pal.scale];
    for (let bar = 0; bar < 64; bar++) {
      const { events, chord } = barEvents({ ...pal, lead: { ...pal.lead, inst: 'bell' } }, id, { ...arr, lead: 'generative' }, arr, bar, {});
      const lead = events.filter((e) => e.layer === 'lead');
      if (!lead.length) continue;
      const last = lead.reduce((a, e) => (e.at > a.at ? e : a));
      const pcs = chordPcs(chord);
      pcs.add((chord.root + 2) % 12);
      // The colour note of an unshifted statement may be a deliberate tension (b7, #4): allow scale notes then.
      const inScale = sc.includes((((last.midi - pal.tonic) % 12) + 12) % 12);
      assert.ok(pcs.has(last.midi % 12) || inScale, `${id} bar ${bar}`);
    }
    assert.ok(chordAt(pal, 0, id).symbol, id);
  }
});

test('cue sheet: grave is silence by default, pad on request; breaking is a sting then silence', () => {
  assert.deepEqual(resolveCue('story', { programId: 'world-now', emotion: 'serious' }), { kind: 'silence', fade: 2.5 });
  assert.equal(resolveCue('story', { programId: 'world-now', emotion: 'sad' }, { gravePad: true }).kind, 'gravePad');
  assert.equal(resolveCue('story', { programId: 'news-60', breaking: true }).name, 'breaking');
  assert.equal(resolveCue('story', { programId: 'news-60', breaking: true }, { sharedStings: true }).kind, 'silence');
  assert.equal(resolveCue('story', { programId: 'tech-bytes', emotion: 'happy' }).moment, 'story');
  assert.equal(resolveCue('story', { programId: 'world-now', emotion: 'neutral' }).moment, 'storyNeutral');
  assert.equal(resolveCue('ad', {}).kind, 'silence');
  assert.equal(resolveCue('standby', {}).palette, 'channel');
  assert.equal(resolveCue('upNext', { next: 'cosmos' }).palette, 'cosmos');
  assert.ok(CUE_SHEET.length >= 15);
});

console.log(`# ${n} passed`);
