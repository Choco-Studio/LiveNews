import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLOSSARY, explainTerms, termsIn } from '../server/glossary.js';
import { loadChannel } from '../server/channel.js';

const program = { id: 'tech-bytes', maxChats: 7, terms: { explainer: 'ada' } };
const presenters = { A: { id: 'max' }, B: { id: 'ada' } };
const story = (id, text, extra = {}) => ({ type: 'story', anchor: 'A', storyId: id, emotion: 'neutral', text, ...extra });

test('every definition reads on a card and after "is": a noun phrase, short, no full stop of its own', () => {
  for (const g of GLOSSARY) {
    assert.ok(g.plain.length <= 64, g.term);
    assert.ok(/^(?:a|an|the|[a-z])/.test(g.plain) && !/[.!?]$/.test(g.plain), g.term);
    assert.ok(g.match.test(g.term) || g.match.test(g.term.replace(/^licence/, 'license')), `${g.term} matches itself`);
  }
});

test('the terms a text uses, first mention first; a word inside another never counts', () => {
  assert.deepEqual(termsIn('Google paused its open source bug bounty program after a flood of AI slop.').map((g) => g.term), ['open source', 'bug bounty', 'AI slop']);
  assert.deepEqual(termsIn('The rapper performed in Austin.').map((g) => g.term), [], 'no "API" in "rapper"');
});

test('Ada translates the jargon of a main story, once per term, right after it, with the card', () => {
  const segs = [
    { type: 'intro', anchor: 'A', text: 'Hello.' },
    story('s1', 'Google has paused its open source bug bounty program until next year.'),
    story('s2', 'Another bug bounty programme closed.', { anchor: 'B' }),
    { type: 'outro', anchor: 'A', text: 'Goodbye.' },
  ];
  const { segments, terms } = explainTerms(segs, { program, presenters });
  assert.equal(terms, 1, 'the programme ends after the second story: no chat before the sign-off');
  const chat = segments[2];
  assert.equal(chat.type, 'chat');
  assert.equal(chat.anchor, 'B', 'the explainer is Ada, in her slot');
  assert.deepEqual(chat.term, { term: 'OPEN SOURCE', plain: 'Software whose code anyone can read, change and share' });
  assert.match(chat.text, /open source/i);
  assert.ok(!/\[/.test(chat.text) && chat.cues.length === 1 && chat.cues[0].char === 0, 'the gesture is a cue, never text');
  assert.equal(chat.storyId, 's1');
});

test('never after a grave story, the number, And finally, or a story a chat already follows; never a term heard lately', () => {
  const t = 'A ransomware attack hit the firm.';
  const base = (s) => [story('s0', 'Hello there.'), s, story('s9', 'Next.'), { type: 'outro', anchor: 'A', text: 'Bye.' }];
  for (const s of [story('s1', t, { emotion: 'serious' }), story('s1', t, { feature: 'number' }), story('s1', t, { feature: 'lighter' })]) assert.equal(explainTerms(base(s), { program, presenters }).terms, 0);
  const followed = [story('s1', 'Their bug bounty closed.'), { type: 'chat', anchor: 'B', text: 'Max, why?' }, story('s2', 'Next.')];
  assert.equal(explainTerms(followed, { program, presenters }).terms, 0);
  const heard = ['Translation, for the rest of us: a bug bounty is a reward for reporting security flaws.'];
  assert.equal(explainTerms([story('s1', 'Their bug bounty closed.'), story('s2', 'Next.')], { program, presenters, recent: heard }).terms, 0);
});

test('within the chat budget, at most two, and only on a programme that asks for it', () => {
  const segs = [story('a', 'An open source tool.'), story('b', 'A new GPU.'), story('c', 'A ransomware attack on a data center.'), story('d', 'Robotaxi news.'), story('e', 'End.')];
  assert.equal(explainTerms(segs, { program, presenters }).terms, 2);
  assert.equal(explainTerms(segs, { program: { ...program, maxChats: 1 }, presenters }).terms, 1);
  assert.equal(explainTerms(segs, { program: { id: 'world-now' }, presenters }).terms, 0);
  assert.equal(explainTerms(segs, { program: { ...program, terms: { explainer: 'paco' } }, presenters }).terms, 0, 'the explainer must be in the cast');
});

test('TECH BYTES asks for it, with Ada as the explainer, and WHAT WE KNOW boards', () => {
  const tb = loadChannel().programs['tech-bytes'];
  assert.deepEqual(tb.terms, { explainer: 'ada' });
  assert.deepEqual(tb.boards, ['known']);
});

test('two lines in one programme never share a phrasing', () => {
  const segs = [story('a', 'An open source tool.'), story('b', 'A new GPU.'), story('c', 'End.')];
  // each line without its term and its definition: what is left is the phrasing
  const shape = (c) => c.text.toLowerCase().replace(c.term.plain.toLowerCase(), '').replace(new RegExp(`(?:an? |the )?${c.term.term.toLowerCase()}`), '');
  const lines = explainTerms(segs, { program, presenters }).segments.filter((s) => s.term).map(shape);
  assert.equal(lines.length, 2);
  assert.notEqual(lines[0], lines[1]);
});

test('the explainer keeps the floor into her own story: its "Thanks, Max." goes, its cues move with the text', () => {
  const segs = [story('a', 'An open source tool.'), story('b', 'Thanks, Max. A new phone.', { anchor: 'B', cues: [{ char: 13, slot: null, action: 'nod' }] }), story('c', 'End.')];
  const out = explainTerms(segs, { program, presenters }).segments;
  const next = out.find((s) => s.storyId === 'b');
  assert.equal(next.text, 'A new phone.');
  assert.deepEqual(next.cues, [{ char: 0, slot: null, action: 'nod' }]);
});
