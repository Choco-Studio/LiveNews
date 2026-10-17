// The channel's own words (server/ownwords.js; docs/publishing/verbatim.md §7): the AI writer's stories measured against
// their sources after the writer and after the editor, the rewrite loop with the copied passages named, the cut and the
// drop, the paraphrase traps (a figure changed, an attribution moved, a hedge dropped), and the offline fallback writer's
// path (measured only; the publish gate holds it). Everything runs against a fake model (test/fixtures/fake-model.js):
// no key, no network.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Producer } from '../server/producer.js';
import { ProviderChain } from '../server/providers/index.js';
import { createMockProvider } from '../server/providers/mock.js';
import { createInboxProvider } from '../server/providers/inbox.js';
import { lintEpisode, storyReport, MAX_RUN } from '../server/compliance/verbatim.js';
import { preflight } from '../server/compliance/index.js';
import { RULE_ES, itemView } from '../server/publish/approval.js';
import { buildPrompt, buildReviewPrompt } from '../server/writer.js';
import { numbersGrounded } from '../server/facts.js';
import {
  storySources, hedgeDropped, attributionMoved, truthFaults, rewriteFaults, rewritePrompt, parseRewrite, mergeRewrite, trimStory, dropStory, editorChanges, asProse, MAX_REWRITES,
} from '../server/ownwords.js';
import { createFakeModel, STORIES, GOOD, COPIED, TRAPS, seg, script } from './fixtures/fake-model.js';

const byId = (id) => STORIES.find((s) => s.id === id);
const prose = (id) => asProse(storySources(byId(id)));

// ---------------------------------------------------------------- the paraphrase traps, one by one

describe('own words: the paraphrase traps', () => {
  test('a hedge dropped: "may close" said as "will close", "may have been caused" as "was caused", "allegedly stole" as "stole"', () => {
    assert.deepEqual(hedgeDropped(TRAPS.hedge, prose('lis')), { said: 'will close', source: 'may close' });
    assert.equal(hedgeDropped('Next spring the council may close the old bridge over the harbour to cars.', prose('lis')), null, 'the hedge kept');
    assert.deepEqual(hedgeDropped(TRAPS.caution, prose('sev')), { said: 'stole', source: 'allegedly stole' });
    assert.equal(hedgeDropped('Police say a man is accused of stealing copper cable from the solar site during construction.', prose('sev')), null, 'the caution kept');
    const fire = 'Firefighters were called to the depot at night. The fire may have been caused by a faulty heater, officials said.';
    assert.ok(hedgeDropped('The depot fire was caused by a faulty heater.', fire));
    assert.equal(hedgeDropped('The depot fire may have been caused by a faulty heater.', fire), null);
    // a "will" the source says too is no hedge dropped
    assert.equal(hedgeDropped('Train drivers in the city will strike on Friday over pay.', prose('gda')), null);
  });

  test('an attribution moved: one person\'s words given to another, in reported speech and in a quotation', () => {
    assert.deepEqual(attributionMoved(TRAPS.attribution, prose('lis')), { speaker: 'Rui Costa', source: 'Mayor Ana Silva' });
    assert.equal(attributionMoved('Ana Silva said about 40 million euros is what the closure would cost over two years.', prose('lis')), null, 'the right speaker');
    assert.equal(attributionMoved('The mayor said about 40 million euros is what the closure would cost over two years.', prose('lis')), null, 'the same person by her role');
    assert.equal(attributionMoved('Officials said about 40 million euros is what the closure would cost over two years.', prose('lis')), null, 'officials stand for the mayor');
    const quote = '"We cannot ask people to drive over a bridge we no longer trust," Costa told reporters.';
    assert.deepEqual(attributionMoved(quote, prose('lis')), { speaker: 'Costa', source: 'Silva' });
    assert.equal(attributionMoved(quote.replace('Costa', 'Silva'), prose('lis')), null);
  });

  test('a figure changed: a rewrite never gives a figure another value (even one from the same source) nor turns it around', () => {
    assert.deepEqual(rewriteFaults(GOOD.sev, TRAPS.swapped), ['a figure changed ("40,000 homes" became "60,000 homes")']);
    assert.deepEqual(rewriteFaults(GOOD.sev, GOOD.sev.replace('Power from a new', 'Electricity from a new')), []);
    assert.deepEqual(rewriteFaults(COPIED.lis, GOOD.lis), [], 'a rewrite may tell more of the source\'s facts');
    assert.deepEqual(rewriteFaults(GOOD.osl, GOOD.osl.replace('were up 12 percent', 'were down 12 percent')), ['a figure turned around ("up 12 percent" became "down 12 percent")']);
    // the writer's validator drops a figure the source does not give at all, or gives for another thing
    assert.equal(numbersGrounded(TRAPS.figure, prose('sev'), { words: true }), false, '45,000 homes is not in the source');
    assert.equal(numbersGrounded(TRAPS.swapped, prose('sev'), { words: true }), false, 'the source\'s 60,000 counts tonnes, not homes');
  });

  test('a rise told as a fall is a fault in any aired sentence', () => {
    const faults = truthFaults('Visits to the library were down 12 percent last year, the city says.', prose('osl'));
    assert.deepEqual(faults.map((f) => [f.rule, f.message]), [['direction', 'says "down 12 percent" where the source says "up 12 percent"']]);
    assert.deepEqual(truthFaults(GOOD.osl, prose('osl')), []);
  });

  test('truthFaults names the sentence and the trap', () => {
    const faults = truthFaults(`${GOOD.lis} ${TRAPS.hedge}`, prose('lis'));
    assert.equal(faults.length, 1);
    assert.equal(faults[0].rule, 'hedge');
    assert.equal(faults[0].sentence, TRAPS.hedge);
    assert.deepEqual(truthFaults(GOOD.lis, prose('lis')), []);
  });
});

// ---------------------------------------------------------------- the pieces of the loop

describe('own words: sources, the rewrite request, the cut and the drop', () => {
  test('a story is measured against its title, summary, article and feed text', () => {
    const s = { title: 'T', summary: 'S', body: 'B '.repeat(50), feedText: 'F '.repeat(50) };
    const src = storySources(s);
    for (const t of ['T', 'S']) assert.ok(src.includes(t));
    assert.ok(src.some((t) => t.startsWith('B B')) && src.some((t) => t.startsWith('F F')));
    assert.deepEqual(storySources(null), []);
  });

  test('the rewrite prompt names the copied passages, the faults and the source, and keeps quotes exact', () => {
    const p = rewritePrompt({ channelName: 'TEST TV', program: { title: 'THE DUO' }, items: [{ storyId: 'lis', story: byId('lis'), current: { text: COPIED.lis }, copied: ['The city council may close the old harbour bridge'], faults: ['"x" says "will close" where the source says "may close"'] }] });
    assert.match(p, /in your own words/);
    assert.match(p, /copiedFromSource/);
    assert.match(p, /The city council may close the old harbour bridge/);
    assert.match(p, /will close/);
    assert.match(p, /A quotation stays exactly as the source quotes it/);
    assert.match(p, new RegExp(`No run of more than ${MAX_RUN} words`));
    assert.match(p, /untrusted feed text/);
    assert.match(p, /"article": "The city council may close/);
  });

  test('a rewrite reply: only the stories asked, only their aired lines; none is an error', () => {
    const reply = JSON.stringify({ stories: [{ storyId: 'lis', text: GOOD.lis, cross: { piece: 'P.', ask: 'never taken' } }, { storyId: 'nope', text: 'x' }] });
    const got = parseRewrite(reply, ['lis', 'sev']);
    assert.deepEqual([...got.keys()], ['lis']);
    assert.deepEqual(got.get('lis'), { text: GOOD.lis, cross: { piece: 'P.' } });
    assert.throws(() => parseRewrite('{"stories": []}', ['lis']), /none of the stories/);
    assert.throws(() => parseRewrite('no json here', ['lis']));
    const sc = JSON.parse(script([seg('lis', COPIED.lis, { cross: { piece: 'Old piece.', ask: 'What next?', answer: 'Old answer.' } })]));
    const merged = mergeRewrite(sc, 'lis', got.get('lis'));
    const s = merged.segments.find((x) => x.storyId === 'lis');
    assert.deepEqual([s.text, s.cross.piece, s.cross.ask, s.cross.answer], [GOOD.lis, 'P.', 'What next?', 'Old answer.']);
  });

  test('the shorter compliant version: the copied sentence goes, the story stays; a copied opening drops it', () => {
    const extra = 'Librarians said the change could be extended to branch libraries if demand stays high.';
    const sc = JSON.parse(script([seg('osl', `${GOOD.osl} ${extra}`)]));
    const cut = trimStory(sc, 'osl', storySources(byId('osl')));
    const text = cut.segments.find((x) => x.storyId === 'osl').text;
    assert.equal(text, GOOD.osl);
    assert.deepEqual(storyReport(text, storySources(byId('osl'))).violations, []);
    assert.equal(trimStory(JSON.parse(script([seg('lis', COPIED.lis)])), 'lis', storySources(byId('lis'))), null, 'nothing of its own left');
    // a sentence with a paraphrase fault goes too
    const faulty = trimStory(JSON.parse(script([seg('lis', `${GOOD.lis} ${TRAPS.hedge}`)])), 'lis', storySources(byId('lis')), [TRAPS.hedge]);
    assert.equal(faulty.segments.find((x) => x.storyId === 'lis').text, GOOD.lis);
  });

  test('a dropped story takes the chat that reacted to it', () => {
    const sc = { title: 't', segments: [{ type: 'intro', text: 'Hi.' }, seg('lis', 'a'), { type: 'chat', text: 'Wow.' }, seg('sev', 'b'), { type: 'outro', text: 'Bye.' }] };
    assert.deepEqual(dropStory(sc, 'lis').segments.map((s) => s.storyId || s.type), ['intro', 'sev', 'outro']);
    assert.equal(dropStory(sc, 'zzz'), sc);
  });

  test('the editor\'s changes: stories taken out, sentences changed, graphics fields taken off', () => {
    const ep = (segs) => ({ storyIds: segs.map((s) => s.storyId), segments: segs });
    const before = ep([seg('lis', 'One. Two.', { fact: '40 MILLION EUROS' }), seg('sev', 'Three.'), seg('osl', 'Four.')]);
    const after = ep([seg('lis', 'One. Two changed.', { fact: null }), seg('osl', 'Four.')]);
    assert.deepEqual(editorChanges(before, after), { stories: 1, dropped: ['sev'], sentences: 1, fields: 1 });
  });

  test('the writer\'s and the editor\'s prompts ask for the channel\'s own words and keep every accuracy rule', () => {
    const program = { id: 'duo', title: 'THE DUO', tagline: 'T', style: 'x', storyLength: '2 to 4 sentences', stories: 3, maxChats: 0 };
    const p = buildPrompt({ channelName: 'TEST TV', program, presenters: { A: { name: 'Ann Anchor', personality: 'calm' } }, stories: STORIES });
    assert.match(p, /ACCURACY RULES/);
    assert.match(p, /IN OUR OWN WORDS \(mandatory\)/);
    assert.match(p, /no run of more than 12 words/);
    assert.match(p, /"may", "could", "plans to", "is expected to", "allegedly" stay as uncertain as the source/);
    assert.match(p, /copied exactly from a quotation in the source, with its speaker named/);
    assert.match(p, /Never invent numbers, names, quotes/, 'the truth rules are all still there');
    const r = buildReviewPrompt({ channelName: 'TEST TV', program, script: { segments: [] }, stories: STORIES });
    assert.match(r, /Paraphrase traps/);
    assert.match(r, /never paste the source's sentence/);
    assert.match(r, /Check every story segment against its SOURCE/);
  });
});

// ---------------------------------------------------------------- through the producer

const channel = () => ({
  name: 'TEST TV',
  presenters: { ann: { name: 'Ann Anchor', personality: 'calm' }, bob: { name: 'Bob Banter', personality: 'dry' } },
  programs: {
    duo: { title: 'THE DUO', tagline: 'TWO', theme: 'world', presenters: ['ann', 'bob'], categories: ['world'], stories: 3, maxChats: 0, style: 'A bulletin.', storyLength: '2 to 4 sentences' },
    four: { title: 'THE FOUR', tagline: 'FOUR', theme: 'world', presenters: ['ann'], categories: ['world'], stories: 4, maxChats: 0, style: 'A bulletin.', storyLength: '2 to 4 sentences' },
  },
  rotation: ['duo'],
  breaks: {},
});

function setup({ write, rewrite = null, review = null, fail = {}, reviewPass = true } = {}) {
  const stories = STORIES.map((s) => ({ ...s }));
  const desk = {
    stories: new Map(stories.map((s) => [s.id, s])),
    offered: [],
    covered: [],
    candidates: (n) => stories.slice(0, n),
    markCovered: (ids) => desk.covered.push(...ids),
    markOffered: (ids) => desk.offered.push(...ids),
    resolveImage: async () => null,
    get: (id) => desk.stories.get(id),
  };
  const fake = createFakeModel({ write, rewrite, review, fail });
  const mock = createMockProvider();
  const mockCalls = [];
  const watchedMock = { ...mock, generate: (req) => (mockCalls.push(req.stage), mock.generate(req)) };
  const logs = [];
  const log = { info: (m) => logs.push(m), warn: (m) => logs.push(`WARN ${m}`), error: (m) => logs.push(`ERROR ${m}`) };
  const chain = new ProviderChain([fake, watchedMock], { record() {} }, { log });
  const producer = new Producer({ config: { candidatePool: 12, minNewStories: 3, reviewPass }, newsDesk: desk, chain, log });
  return { producer, desk, fake, mockCalls, logs };
}

const told = (ep, id) => ep.segments.filter((s) => s.storyId === id && (s.type === 'story' || s.type === 'cross')).map((s) => s.text).join(' ');
const gate = (ep, desk) => lintEpisode(ep, { getStory: (id) => desk.get(id) });

describe('own words through the producer', () => {
  test('a script in our own words airs as written: no rewrite asked, the gate\'s own measure passes, the editor still checks it against the sources', async () => {
    const { producer, desk, fake } = setup({ write: script([seg('lis', GOOD.lis), seg('sev', GOOD.sev, { anchor: 'B' }), seg('osl', GOOD.osl)]) });
    const ep = await producer.produce(channel(), 'duo');
    assert.deepEqual(ep.storyIds, ['lis', 'sev', 'osl']);
    assert.deepEqual(fake.calls.map((c) => c.stage), ['write', 'review']);
    const write = ep.pipeline.find((p) => p.stage === 'write');
    assert.equal(write.own.violating, 0);
    assert.ok(write.own.share <= 0.2 && write.own.longest <= MAX_RUN, JSON.stringify(write.own));
    assert.equal(gate(ep, desk).ok, true, JSON.stringify(gate(ep, desk).violations));
    // the truth check stays: the editor gets the script and every story's source, article included
    const review = fake.calls.find((c) => c.stage === 'review');
    assert.match(review.prompt, /SOURCES/);
    assert.match(review.prompt, /engineers found corrosion in its steel supports/);
    assert.equal(ep.pipeline.find((p) => p.stage === 'review').reviewed, true);
  });

  test('a copied story goes back to the model with its copied passages named, and airs in our own words', async () => {
    const { producer, desk, fake, mockCalls, logs } = setup({
      write: script([seg('lis', COPIED.lis), seg('sev', GOOD.sev, { anchor: 'B' }), seg('osl', COPIED.osl)]),
      rewrite: JSON.stringify({ stories: [{ storyId: 'lis', text: GOOD.lis }, { storyId: 'osl', text: GOOD.osl }] }),
    });
    const ep = await producer.produce(channel(), 'duo');
    assert.deepEqual(ep.storyIds, ['lis', 'sev', 'osl']);
    const rw = fake.calls.filter((c) => c.stage === 'rewrite');
    assert.equal(rw.length, 1);
    assert.deepEqual(rw[0].request.storyIds, ['lis', 'osl']);
    assert.match(rw[0].prompt, /"copiedFromSource"/);
    assert.match(rw[0].prompt, /The city council may close the old harbour bridge to cars next spring, after engineers found corrosion in its steel supports/);
    assert.ok(!mockCalls.includes('rewrite'), 'the offline writer is never asked to rewrite');
    assert.equal(told(ep, 'osl'), GOOD.osl);
    assert.equal(gate(ep, desk).ok, true, JSON.stringify(gate(ep, desk).violations));
    const own = ep.pipeline.find((p) => p.stage === 'write').own;
    assert.deepEqual([own.rounds, own.rewritten, own.violating], [1, ['lis', 'osl'], 0]);
    assert.ok(logs.some((l) => /story lis rewritten \(round 1, fakeai\): copied 84 % -> /.test(l)), logs.join('\n'));
  });

  test('a story still copied after the rewrites is cut to its own sentences, or dropped; it never airs as a copy', async () => {
    const extra = 'Librarians said the change could be extended to branch libraries if demand stays high.';
    const { producer, desk, fake, logs } = setup({
      write: script([seg('lis', COPIED.lis), seg('sev', GOOD.sev), seg('osl', `${GOOD.osl} ${extra}`), seg('gda', GOOD.gda)]),
      // the model copies again, twice
      rewrite: (req) => JSON.stringify({ stories: req.storyIds.map((id) => ({ storyId: id, text: id === 'lis' ? COPIED.lis : `${GOOD.osl} ${extra}` })) }),
    });
    const ep = await producer.produce(channel(), 'four');
    assert.equal(fake.calls.filter((c) => c.stage === 'rewrite').length, MAX_REWRITES);
    assert.deepEqual(ep.storyIds, ['sev', 'osl', 'gda'], 'the copied story is out');
    assert.equal(told(ep, 'osl'), GOOD.osl, 'the copied sentence is cut, the rest airs');
    assert.equal(gate(ep, desk).ok, true);
    const own = ep.pipeline.find((p) => p.stage === 'write').own;
    assert.deepEqual([own.trimmed, own.dropped], [['osl'], ['lis']]);
    assert.ok(desk.offered.includes('lis'), 'the dropped story is offered (it sinks), not covered');
    assert.ok(!desk.covered.includes('lis'));
    assert.ok(logs.some((l) => /WARN \[own words\] THE FOUR: story lis dropped: a run of 21 words copied/.test(l)), logs.join('\n'));
    assert.ok(logs.some((l) => /story osl cut to its own sentences/.test(l)));
  });

  test('below the programme\'s floor the slot is skipped: no episode rather than a copy', async () => {
    const { producer, desk, logs } = setup({ write: script([seg('lis', COPIED.lis), seg('sev', COPIED.sev), seg('osl', GOOD.osl)]), rewrite: '{"stories": []}' });
    assert.equal(await producer.produce(channel(), 'duo'), null);
    assert.deepEqual(desk.offered.sort(), ['lis', 'sev']);
    assert.deepEqual(desk.covered, []);
    assert.ok(logs.some((l) => /THE DUO: only 1 stories left in the channel's own words \(the floor is 3\); slot skipped/.test(l)), logs.join('\n'));
  });

  test('an unreadable rewrite reply does not pause the provider: the editor still reviews, the copy is dropped', async () => {
    const { producer, fake, logs } = setup({ write: script([seg('lis', GOOD.lis), seg('sev', GOOD.sev), seg('osl', GOOD.osl), seg('gda', COPIED.gda)]), rewrite: 'Sorry, I cannot help with that.' });
    const ep = await producer.produce(channel(), 'four');
    assert.deepEqual(fake.calls.map((c) => c.stage), ['write', 'rewrite', 'rewrite', 'review']);
    assert.equal(ep.pipeline.find((p) => p.stage === 'review').reviewed, true);
    assert.deepEqual(ep.storyIds, ['lis', 'sev', 'osl']);
    assert.ok(logs.some((l) => /the rewrite reply holds none of the stories \(reply contains no JSON\)/.test(l)), logs.join('\n'));
    assert.ok(!logs.some((l) => /fakeai failed/.test(l)));
  });

  test('paraphrase traps in the first draft: a changed figure never airs; a moved attribution and a dropped hedge go back to the model and air put right', async () => {
    const { producer, fake } = setup({
      write: script([seg('lis', `${GOOD.lis} ${TRAPS.attribution} ${TRAPS.hedge}`), seg('sev', `${GOOD.sev} ${TRAPS.figure}`), seg('osl', GOOD.osl)]),
      rewrite: JSON.stringify({ stories: [{ storyId: 'lis', text: `${GOOD.lis} Next spring the council may close the old bridge over the harbour to cars.` }] }),
    });
    const ep = await producer.produce(channel(), 'duo');
    assert.ok(!told(ep, 'sev').includes('45,000'), 'the writer\'s validator drops the changed figure');
    assert.match(told(ep, 'sev'), /about 40,000 homes/);
    const rw = fake.calls.find((c) => c.stage === 'rewrite');
    assert.deepEqual(rw.request.storyIds, ['lis']);
    assert.match(rw.prompt, /gives to Rui Costa words the source gives to Mayor Ana Silva/);
    assert.match(rw.prompt, /says \\"will close\\" where the source says \\"may close\\"/);
    assert.ok(!told(ep, 'lis').includes('Rui Costa'));
    assert.match(told(ep, 'lis'), /the council may close the old bridge/);
    assert.ok(!/will close/.test(told(ep, 'lis')));
  });

  test('a rewrite that turns a figure around is refused; a figure the source does not give never airs; the faulty sentence is cut', async () => {
    const extra = 'Librarians said the change could be extended to branch libraries if demand stays high.';
    const { producer, logs } = setup({
      write: script([seg('lis', GOOD.lis), seg('sev', `${GOOD.sev} ${TRAPS.caution}`), seg('osl', `${GOOD.osl} ${extra}`)]),
      rewrite: JSON.stringify({ stories: [
        { storyId: 'osl', text: GOOD.osl.replace('were up 12 percent', 'were down 12 percent') },
        { storyId: 'sev', text: `${GOOD.sev.replace('about 40,000 homes', 'about 4,000 homes')} ${TRAPS.caution}` },
      ] }),
    });
    const ep = await producer.produce(channel(), 'duo');
    assert.ok(logs.some((l) => /rewrite of story osl refused \(round 1\): a figure turned around \("up 12 percent" became "down 12 percent"\)/.test(l)), logs.join('\n'));
    assert.ok(!told(ep, 'sev').includes('4,000 homes') || told(ep, 'sev').includes('40,000 homes'), 'the validator drops a figure the source does not give');
    assert.ok(!told(ep, 'sev').includes('a man stole'), 'the dropped caution never airs');
    assert.equal(told(ep, 'osl'), GOOD.osl, 'cut to its own sentences, the rise kept a rise');
    assert.equal(told(ep, 'sev'), GOOD.sev);
    assert.deepEqual(ep.pipeline.find((p) => p.stage === 'write').own.trimmed.sort(), ['osl', 'sev']);
  });

  test('the editor\'s corrections are held to our own words too: a correction that pastes the source goes back once more', async () => {
    const pasted = (req) => {
      const sc = JSON.parse(JSON.stringify(req.script));
      sc.segments.find((s) => s.storyId === 'osl').text = COPIED.osl;
      return JSON.stringify(sc);
    };
    const { producer, desk, fake } = setup({
      write: script([seg('lis', GOOD.lis), seg('sev', GOOD.sev), seg('osl', GOOD.osl)]),
      review: pasted,
      rewrite: JSON.stringify({ stories: [{ storyId: 'osl', text: GOOD.osl }] }),
    });
    const ep = await producer.produce(channel(), 'duo');
    assert.deepEqual(fake.calls.map((c) => c.stage), ['write', 'review', 'rewrite']);
    assert.equal(fake.calls[2].request.phase, 'review');
    const review = ep.pipeline.find((p) => p.stage === 'review');
    assert.equal(review.reviewed, true);
    assert.deepEqual(review.changes, { stories: 1, dropped: [], sentences: 3, fields: 0 }, 'the editor\'s changes are counted');
    assert.deepEqual(review.own.rewritten, ['osl']);
    assert.equal(gate(ep, desk).ok, true);
  });

  test('the provider down or out of quota: the chain falls back to the offline writer, which is measured, never cut or rewritten', async () => {
    const quota = Object.assign(new Error('fakeai HTTP 429: insufficient_quota'), { status: 429 });
    const { producer, desk, fake, mockCalls, logs } = setup({ write: null, fail: { write: quota, review: quota, rewrite: quota } });
    const ep = await producer.produce(channel(), 'duo');
    assert.equal(ep.provider, 'mock');
    assert.deepEqual(fake.calls.map((c) => c.stage), ['write'], 'paused after the quota error: not asked again');
    assert.ok(!mockCalls.includes('rewrite') && !mockCalls.includes('review'));
    const own = ep.pipeline.find((p) => p.stage === 'write').own;
    assert.equal(own.offline, true);
    assert.ok(!('dropped' in own) && !('rewritten' in own));
    assert.equal(ep.pipeline.find((p) => p.stage === 'review').reviewed, false);
    assert.ok(logs.some((l) => /fakeai failed \(fakeai HTTP 429/.test(l)));
    // ...and the publish gate holds it, whatever its clip shows, with the reason in Spanish on the approval page
    const pf = preflight({ id: 'c1', kind: 'clip', episode: ep, storyIds: ep.storyIds, platforms: ['youtube'], flags: { youtube: { containsSyntheticMedia: true, selfDeclaredMadeForKids: false } } }, { getStory: (id) => desk.get(id), calendar: { generatedAt: new Date().toISOString(), elections: [] }, env: { EDITORIAL_CONTACT: 'x@example.org' }, requireReview: false });
    assert.equal(pf.ok, false);
    assert.ok(pf.violations.some((v) => v.rule === 'offline-writer'));
    assert.match(RULE_ES['offline-writer'], /^Escrito sin IA: copia demasiado de la fuente/);
    const view = itemView({ id: 'c1', kind: 'clip', platform: 'youtube', status: 'held', compliance: { ok: false, violations: pf.violations } });
    assert.ok(view.compliance.violations.some((v) => v.rule === 'offline-writer' && /^Escrito sin IA/.test(v.es)));
  });

  test('an AI-written episode is not held for its writer, nor an offline one\'s clip that tells no story', () => {
    const opts = { getStory: () => null, calendar: { generatedAt: new Date().toISOString(), elections: [] }, env: { EDITORIAL_CONTACT: 'x@example.org' }, requireReview: false };
    const flags = { youtube: { containsSyntheticMedia: true, selfDeclaredMadeForKids: false } };
    const ep = { id: 'e1', provider: 'openai', program: { id: 'world-now' }, storyIds: ['lis'], segments: [{ type: 'intro', text: 'Hello.' }, seg('lis', GOOD.lis)] };
    assert.ok(!preflight({ id: 'e1', kind: 'episode', episode: ep, platforms: ['youtube'], flags }, opts).violations.some((v) => v.rule === 'offline-writer'));
    const offline = { ...ep, provider: 'mock' };
    assert.ok(preflight({ id: 'e1', kind: 'episode', episode: offline, platforms: ['youtube'], flags }, opts).violations.some((v) => v.rule === 'offline-writer'));
    // a clip of the presenters' own chat, no story of the outlet's in it
    assert.ok(!preflight({ id: 'c1', kind: 'clip', episode: offline, storyIds: [], platforms: ['youtube'], flags }, opts).violations.some((v) => v.rule === 'offline-writer'));
  });

  test('the chain never hands a rewrite to the offline writer: with no AI configured it says so', async () => {
    const mock = createMockProvider();
    const chain = new ProviderChain([mock], { record() {} }, { log: { warn() {} } });
    await assert.rejects(chain.generate({ stage: 'rewrite', prompt: 'x' }, (t) => t), (err) => err.code === 'NO_REWRITER');
  });

  test('the inbox provider carries a rewrite request for a manual run (an agent or a person answers it)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ownwords-inbox-'));
    try {
      const inbox = createInboxProvider({ dir, timeoutMs: 5000 }, { pollMs: 10, log: { info() {}, warn() {}, error() {} } });
      const prompt = rewritePrompt({ channelName: 'TEST TV', program: { id: 'duo', title: 'THE DUO' }, items: [{ storyId: 'lis', story: byId('lis'), current: { text: COPIED.lis }, copied: ['x'] }] });
      const pending = inbox.generate({ stage: 'rewrite', prompt, program: { id: 'duo', title: 'THE DUO' }, stories: [byId('lis')], channelName: 'TEST TV' });
      let stem = null;
      for (let i = 0; i < 300 && !stem; i++) {
        stem = fs.readdirSync(dir).find((n) => /-rewrite-duo\.prompt\.md$/.test(n))?.replace(/\.prompt\.md$/, '') || null;
        if (!stem) await new Promise((r) => setTimeout(r, 10));
      }
      assert.ok(stem, 'the request is in the inbox');
      assert.equal(fs.readFileSync(path.join(dir, `${stem}.prompt.md`), 'utf8').trim(), prompt.trim());
      fs.writeFileSync(path.join(dir, `${stem}.response.json`), JSON.stringify({ stories: [{ storyId: 'lis', text: GOOD.lis }] }));
      const out = await pending;
      assert.equal(parseRewrite(out.text, ['lis']).get('lis').text, GOOD.lis);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
