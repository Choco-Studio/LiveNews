import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { expertsOf, pickExpert, groundCall, introLine, thanksLine, OPINION } from '../server/experts.js';
import { normalizeBulletin, collapseCrosses, buildPrompt } from '../server/writer.js';

const channel = JSON.parse(fs.readFileSync(new URL('../config/channel.json', import.meta.url), 'utf8'));
const roster = expertsOf({ id: 'world-now' }, channel.presenters);
const program = { id: 'world-now', title: 'WORLD NOW', calls: 1 };
const presenters = { A: { name: 'Paco Pixel', personality: 'calm' }, B: { name: 'Lola Byte', personality: 'warm' } };
const story = {
  id: 's1',
  title: 'Central bank raises interest rates to 5 percent',
  summary: 'The central bank raised its main interest rate to 5 percent to fight inflation, which reached 7 percent in September. Higher rates make mortgages and loans more expensive for households.',
  source: 'Ledger',
  category: 'business',
};
const call = (o = {}) => ({ expert: 'iris', ask: 'What does this mean for households with loans?', answer: 'Higher rates make mortgages and loans more expensive for households. The bank raised its main rate to fight inflation, which reached 7 percent in September.', ...o });
const raw = (c) => ({ segments: [{ type: 'intro', anchor: 'A', text: 'Good evening.' }, { type: 'story', storyId: 's1', anchor: 'A', headline: 'Bank raises rates to 5%', text: 'The central bank has raised its main interest rate to 5 percent. It wants to fight inflation. Ledger reports it.', call: c }, { type: 'outro', anchor: 'A', text: 'Good night.' }] });
const norm = (c, p = program) => normalizeBulletin(raw(c), [story], { channelName: 'G', program: p, presenters, experts: roster });

test('the roster: six fictional experts, each with a title, a city and a room', () => {
  assert.deepEqual(roster.map((e) => e.id), ['iris', 'omar', 'tess', 'ravi', 'noor', 'elena']);
  for (const e of roster) assert.ok(e.title && e.from && ['office', 'study', 'lab', 'home'].includes(e.room), e.id);
  assert.equal(pickExpert(story, roster).id, 'iris');
  // "West Bank" is no bank, a botched execution no health story (the keywords are a guard, the writer chooses)
  assert.notEqual(pickExpert({ title: 'Settlers attack village in the West Bank', category: 'world' }, roster)?.id, 'iris');
});

test('a call becomes the presenter\'s introduction and question, the expert\'s answer, the thanks', () => {
  const ep = norm(call());
  const types = ep.segments.map((s) => `${s.type}${s.call ? `:${s.call}` : ''}`);
  assert.deepEqual(types, ['intro', 'story', 'chat:ask', 'call', 'chat:thanks', 'outro']);
  const [ask, answer, thanks] = ep.segments.slice(2, 5);
  assert.match(ask.text, /Dr Iris Kernel, an economist/);
  assert.match(ask.text, /What does this mean for households with loans\?$/);
  assert.equal(answer.anchor, 'X1');
  assert.deepEqual(ep.experts, { X1: 'iris' });
  assert.match(thanks.text, /Dr Kernel/);
  // the review sees the call folded back into its story, and the review's script expands the same way
  const folded = collapseCrosses(ep.segments);
  assert.deepEqual(folded.find((s) => s.type === 'story').call, { expert: 'iris', ask: 'What does this mean for households with loans?', answer: answer.text });
  assert.equal(folded.filter((s) => s.call === 'ask' || s.type === 'call').length, 0);
});

test('what an expert never says, and calls that never air', () => {
  // an opinion, advice, a claim to have been told something: the sentence goes; fewer than two left, no call
  assert.equal(norm(call({ answer: 'I think the bank should stop now. Households must cut their spending.' })).segments.some((s) => s.type === 'call'), false);
  assert.equal(norm(call({ answer: 'Officials told me the rate will rise again. Higher rates make loans more expensive for households.' })).segments.some((s) => s.type === 'call'), false);
  // an invented fact is not grounded
  assert.equal(norm(call({ answer: 'Unemployment will double next year. The housing market will crash by 40 percent.' })).segments.some((s) => s.type === 'call'), false);
  // the wrong expert for the story, an unknown expert, a question with a figure or too long
  assert.equal(norm(call({ expert: 'noor' })).segments.some((s) => s.type === 'call'), false);
  assert.equal(norm(call({ expert: 'nobody' })).segments.some((s) => s.type === 'call'), false);
  assert.equal(norm(call({ ask: 'Is 5 percent too high?' })).segments.some((s) => s.type === 'call'), false);
  // a programme without calls
  assert.equal(norm(call(), { ...program, calls: 0 }).segments.some((s) => s.type === 'call'), false);
  assert.ok(OPINION.test('They ought to resign.'));
  assert.equal(groundCall({ ask: 'Why?', answer: 'One. Two.' }, '', () => true), null, 'the question must share a word with the answer');
});

test('never on a story of crime or violence; the prompt names the roster only when the programme has calls', () => {
  const violent = { ...story, title: 'Gunman shot three people outside a bank' };
  const ep = normalizeBulletin(raw(call()), [violent], { channelName: 'G', program, presenters, experts: roster });
  assert.equal(ep.segments.some((s) => s.type === 'call'), false);
  const stories = [story];
  assert.match(buildPrompt({ channelName: 'G', program: { ...program, tagline: 't', style: 's', stories: 1, storyLength: 'x' }, presenters, stories, experts: roster }), /VIDEO CALL[\s\S]*"id":"iris"/);
  assert.doesNotMatch(buildPrompt({ channelName: 'G', program: { ...program, calls: 0, tagline: 't', style: 's', stories: 1, storyLength: 'x' }, presenters, stories, experts: roster }), /VIDEO CALL/);
  assert.match(introLine(roster[0], 'x'), /London/);
  assert.match(thanksLine(roster[2], 'y'), /Prof Contour/);
});
