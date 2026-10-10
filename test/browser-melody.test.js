// The browser voice (no recorded clip) reads with the newsreader's arc too: one pitch per sentence, the lead high
// and the close low, a question lifted, a reporting line lower (public/js/audio/sentences.js sentenceMelody; the
// neural voices get the full plan from speechtext.js planMelody).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sentenceMelody } from '../public/js/audio/sentences.js';

test('the lead opens high and the close lands low, within two semitones either way', () => {
  const m = sentenceMelody(['The storm hit the coast overnight.', 'Thousands lost power.', 'Roads were closed.', 'Repairs start today.']);
  assert.equal(m.length, 4);
  assert.ok(m[0] > m[1] && m[1] > m[2] && m[2] > m[3], JSON.stringify(m));
  assert.ok(m.every((x) => Math.abs(x) <= 2));
  assert.deepEqual(sentenceMelody(['Just one line.']), [0.4]);
});

test('a question lifts, a line that ends on who said it sits lower', () => {
  const [q] = sentenceMelody(['Is it safe?', 'It is.']);
  const [p] = sentenceMelody(['It is safe.', 'It is.']);
  assert.ok(q > p);
  const said = sentenceMelody(['Rates rose.', 'More rises are likely, analysts said.', 'Markets fell.']);
  const plain = sentenceMelody(['Rates rose.', 'More rises are likely.', 'Markets fell.']);
  assert.ok(said[1] < plain[1]);
});
