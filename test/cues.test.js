import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, EMOTIONS, describeActions, parseCues } from '../public/js/cues.js';
import { EMOTIONS as WRITER_EMOTIONS } from '../server/writer.js';

// public/js/cues.js is shared by the server (validation in writer.js) and the
// browser (playback). It has no DOM code, so it can be tested here directly.

const act = (action, char, slot = null) => ({ char, slot, action });

describe('parseCues', () => {
  test('text without cues is returned as it is', () => {
    assert.deepEqual(parseCues('Just a normal sentence. Another one!'), { text: 'Just a normal sentence. Another one!', cues: [] });
  });

  test('takes a cue out of the text and gives the offset where it happens', () => {
    assert.deepEqual(parseCues('Good evening [wave] and welcome.'), { text: 'Good evening and welcome.', cues: [act('wave', 12)] });
  });

  test('a cue at the very start happens at 0, one at the very end at the end of the text', () => {
    assert.deepEqual(parseCues('[nod] Yes.'), { text: 'Yes.', cues: [act('nod', 0)] });
    assert.deepEqual(parseCues('Bye for now [wave]'), { text: 'Bye for now', cues: [act('wave', 11)] });
  });

  test('several cues keep their order; adjacent cues share an offset', () => {
    const { text, cues } = parseCues('One [nod][shrug] two [wave] three');
    assert.equal(text, 'One two three');
    assert.deepEqual(cues, [act('nod', 3), act('shrug', 3), act('wave', 7)]);
  });

  test('the offsets point into the clean text', () => {
    const { text, cues } = parseCues('[nod] Alpha [shrug] beta [wave] gamma');
    assert.equal(text, 'Alpha beta gamma');
    assert.deepEqual(cues.map((c) => text.slice(0, c.char)), ['', 'Alpha', 'Alpha beta']);
  });

  test('spacing left by removed cues is tidied, also before punctuation', () => {
    assert.equal(parseCues('Hello [nod], world [nod]!').text, 'Hello, world!');
    assert.equal(parseCues('Hello   [nod]   world').text, 'Hello world');
    assert.equal(parseCues('  [nod]  Start').text, 'Start');
  });

  test('"[B:action]" and "[A:action]" name the slot; unslotted cues have slot null', () => {
    const { cues } = parseCues('a [nod] b [B:shrug] c [A:wave] d [b:chin]');
    assert.deepEqual(cues, [act('nod', 1), act('shrug', 3, 'B'), act('wave', 5, 'A'), act('chin', 7, 'B')]);
  });

  test('names are case-insensitive and tolerate spaces inside the brackets', () => {
    const { text, cues } = parseCues('a [ WAVE ] b [ B : Nod ] c');
    assert.equal(text, 'a b c');
    assert.deepEqual(cues, [act('wave', 1), act('nod', 3, 'B')]);
  });

  test('an emotion name in brackets is an expression cue', () => {
    assert.deepEqual(parseCues('Well [surprised] then.'), { text: 'Well then.', cues: [{ char: 4, slot: null, emotion: 'surprised' }] });
    assert.deepEqual(parseCues('[B:happy] Hi').cues, [{ char: 0, slot: 'B', emotion: 'happy' }]);
  });

  test('names with an underscore are understood', () => {
    assert.deepEqual(parseCues('[point_screen] Look at this.'), { text: 'Look at this.', cues: [act('point_screen', 0)] });
    assert.deepEqual(parseCues('a [look_partner] b').cues, [act('look_partner', 1)]);
  });

  test('unknown names are removed from the text and ignored', () => {
    assert.deepEqual(parseCues('Hello [dance] there [world].'), { text: 'Hello there.', cues: [] });
  });

  test('brackets that are not a single word (numbers, phrases, ellipses) are left alone', () => {
    const text = 'He said [1] and [Apple Inc] and […] and [x-y] too.';
    assert.deepEqual(parseCues(text), { text, cues: [] });
  });

  test('on a grave story the light gestures are dropped and the other gestures are kept', () => {
    const text = 'a [wave] b [thumbs_up] c [fist_pump] d [facepalm] e [laugh] f [wow] g [nod] h [steeple]';
    const grave = parseCues(text, { grave: true });
    assert.equal(grave.text, 'a b c d e f g h');
    assert.deepEqual(grave.cues.map((c) => c.action), ['nod', 'steeple']);
    const normal = parseCues(text, { grave: false });
    assert.deepEqual(normal.cues.map((c) => c.action), ['wave', 'thumbs_up', 'fist_pump', 'facepalm']);
  });

  test('emotion cues are not "light gestures": a grave story may still change expression', () => {
    assert.deepEqual(parseCues('a [happy] b', { grave: true }).cues, [{ char: 1, slot: null, emotion: 'happy' }]);
  });

  test('keeps at most maxCues cues (4 by default) and removes the extra ones from the text', () => {
    const text = '[nod] a [shrug] b [wave] c [wow] d [chin] e [glasses] f';
    assert.deepEqual(parseCues(text).cues.map((c) => c.action), ['nod', 'shrug', 'wave', 'wow']);
    assert.equal(parseCues(text).text, 'a b c d e f');
    assert.deepEqual(parseCues(text, { maxCues: 2 }).cues.map((c) => c.action), ['nod', 'shrug']);
    assert.deepEqual(parseCues(text, { maxCues: 0 }).cues, []);
  });

  test('unknown cues and cues dropped for being light do not count towards maxCues', () => {
    const { cues } = parseCues('[dance] [wave] [nod] [shrug] [chin] [glasses] [papers]', { grave: true, maxCues: 3 });
    assert.deepEqual(cues.map((c) => c.action), ['nod', 'shrug', 'chin']);
  });

  test('no offset is ever beyond the end of the text', () => {
    for (const input of ['[nod]', 'x [nod]', '[nod] [wave]', 'a [nod]   ', 'a. [wave]  ']) {
      const { text, cues } = parseCues(input);
      for (const cue of cues) assert.ok(cue.char >= 0 && cue.char <= text.length, `${input} -> ${JSON.stringify({ text, cue })}`);
    }
  });

  test('a text that is only cues becomes an empty string', () => {
    assert.deepEqual(parseCues('[wave] [nod]'), { text: '', cues: [act('wave', 0), act('nod', 0)] });
  });

  test('does not mutate shared state between calls (global regex)', () => {
    const first = parseCues('a [nod] b');
    const second = parseCues('a [nod] b');
    assert.deepEqual(first, second);
  });
});

describe('the action vocabulary', () => {
  test('every action has a duration, a body part, a description, and optionally the "light" flag', () => {
    for (const [name, action] of Object.entries(ACTIONS)) {
      assert.match(name, /^[a-z]+(_[a-z]+)*$/, name);
      assert.ok(action.dur > 0 && action.dur <= 3, `${name}.dur`);
      assert.ok(['arm', 'head', 'both'].includes(action.kind), `${name}.kind`);
      assert.ok(typeof action.desc === 'string' && action.desc.length > 3, `${name}.desc`);
      assert.ok(action.light === undefined || action.light === true, `${name}.light`);
    }
  });

  test('no action has the name of an emotion (a cue name must mean one thing)', () => {
    for (const emotion of EMOTIONS) assert.ok(!(emotion in ACTIONS), emotion);
  });

  test('the light gestures are the cheerful ones', () => {
    assert.deepEqual(Object.entries(ACTIONS).filter(([, a]) => a.light).map(([name]) => name).sort(), ['facepalm', 'fist_pump', 'laugh', 'thumbs_up', 'wave', 'wow']);
  });

  test('the emotions are the same ones the writer validates', () => {
    assert.deepEqual(EMOTIONS, WRITER_EMOTIONS);
  });

  test('describeActions() lists every action with its description for the writer prompt', () => {
    const text = describeActions();
    for (const [name, action] of Object.entries(ACTIONS)) assert.ok(text.includes(`${name} (${action.desc})`), name);
  });
});
