// IN THEIR WORDS, re-staged (owner 12 Oct; docs/roadmap/WAVE3.md §6): a public figure a story quotes says their own
// sourced words as a labelled recreation. The adversarial cases: who may never be re-staged, grave stories, the
// balance rule, words that are not the source's, and the booking (a generic look and voice, never an imitation).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { speakerProfile, politicalSides, restageCheck, bookGuest, guestLook, guestVoice, provenanceLine, GUEST_VOICES } from '../server/guests/restage.js';
import { pickIdentity, ageBracket, IdentityDesk } from '../server/guests/identity.js';
import { castFor } from '../server/voice/plan.js';
import { Producer } from '../server/producer.js';

const quote = (text, by) => ({ text, by });
const Q = 'This line will change how people move around the old town';

test('who said it: a name takes its role from the source, a role alone is a role, a body is not a person', () => {
  const src = 'Ana Silva, the mayor of Lisbon, opened the line on Monday. “This line will change how people move,” she said.';
  assert.deepEqual(speakerProfile('Ana Silva', src), { name: 'Ana Silva', role: 'mayor of Lisbon', org: 'Lisbon', kind: 'politician', presentation: 'woman' });
  assert.equal(speakerProfile('Prime Minister Mark Carney', '').kind, 'politician');
  const t = speakerProfile('Mark Carney', 'Canadian Prime Minister Mark Carney said on Tuesday that he would sign. He added more.');
  assert.equal(t.kind, 'politician');
  assert.equal(t.presentation, 'man');
  assert.deepEqual(speakerProfile('the mayor', ''), { name: null, role: 'mayor', org: null, kind: 'politician', presentation: 'neutral' });
  assert.equal(speakerProfile('a spokesperson', '').kind, 'official');
  assert.equal(speakerProfile('a lead researcher', '').kind, 'scientist');
  assert.equal(speakerProfile('the chief executive', '').kind, 'executive');
  for (const body of ['the company', 'the agency', 'police', 'the government', 'officials']) assert.equal(speakerProfile(body, '').kind, 'body', body);
  for (const who of ['a victim', "the victim's mother", 'a witness', 'a local resident', 'a passenger', 'a 15-year-old student', 'the suspect', 'the accused', 'one survivor']) {
    assert.equal(speakerProfile(who, '').kind, 'private', who);
  }
  assert.equal(speakerProfile('', ''), null);
});

test('never re-staged: private people, bodies, unknown roles, grave stories, short or long lines; the balance rule', () => {
  const ok = restageCheck({ quote: quote(Q, 'the mayor'), source: `“${Q},” the mayor said.`, story: { title: 'New tram line opens in Lisbon', summary: '' } });
  assert.equal(ok.ok, true, ok.reasons.join('; '));
  const no = (q, story = { title: 'A day in town', summary: '' }, source = '') => restageCheck({ quote: q, story, source });
  assert.match(no(quote(Q, 'a witness')).reasons.join(), /private person/);
  assert.match(no(quote(Q, 'the company')).reasons.join(), /organisation/);
  assert.match(no(quote(Q, 'Jane Doe')).reasons.join(), /no public role/);
  assert.match(no(quote(Q, null)).reasons.join(), /no speaker/);
  assert.match(no(quote('We are sad', 'the mayor')).reasons.join(), /too short/);
  assert.match(no(quote(Array(70).fill('word').join(' '), 'the mayor')).reasons.join(), /longer than/);
  assert.match(no(quote(Q, 'the mayor'), { title: 'Three people killed as tram derails in Lisbon', summary: 'Three people died.' }).reasons.join(), /grave story/);
  assert.equal(no(quote(Q, 'the mayor'), { title: 'Tram line opens', summary: '' }, 'x').ok, true);
  // a story naming two political sides needs both sides' words: one politician's quote stays a quote card
  assert.equal(politicalSides('Labour and the Conservatives clashed over the budget'), 2);
  const balance = no(quote(Q, 'the prime minister'), { title: 'Budget row', summary: '' }, 'Labour and the Conservatives clashed over the budget.');
  assert.match(balance.reasons.join(), /balance/);
  // an official is not a side
  assert.equal(no(quote(Q, 'a spokesperson'), { title: 'Budget row', summary: '' }, 'Labour and the Conservatives clashed.').ok, true);
});

test('the booking: the same person the same look and voice, labelled RECREATION with the source, never a cast voice', () => {
  const sp = speakerProfile('Ana Silva', 'Ana Silva, the mayor of Lisbon, spoke. “Words here for the test,” she said.');
  const a = bookGuest(sp, { outlet: 'Pixelburg Post' });
  const b = bookGuest(sp, { outlet: 'Another Paper' });
  assert.equal(a.id, b.id, 'a named person is the same guest whoever reports them');
  assert.deepEqual(a.look, b.look);
  assert.deepEqual(a.voice, b.voice);
  assert.equal(a.kind, 'restaged');
  assert.equal(a.likeness, 'none');
  assert.equal(a.label.line, 'RECREATION — WORDS FROM PUBLIC STATEMENTS');
  assert.equal(a.label.credit, 'SOURCE: PIXELBURG POST');
  assert.deepEqual(a.strap, { name: 'ANA SILVA', role: 'MAYOR OF LISBON' });
  assert.equal(a.look.presentation, 'woman');
  assert.ok(GUEST_VOICES.woman.some((v) => v.voice === a.voice.voice));
  // no guest voice is a blend the channel's people already speak with
  const casting = JSON.parse(fs.readFileSync(new URL('../server/voice/casting.json', import.meta.url), 'utf8'));
  const cast = new Set(Object.values(casting).map((c) => c?.voice).filter(Boolean));
  for (const v of Object.values(GUEST_VOICES).flat()) assert.ok(!cast.has(v.voice), v.voice);
  // an unnamed speaker is labelled by role, per outlet
  const mayor = bookGuest(speakerProfile('the mayor', ''), { outlet: 'Pixelburg Post' });
  assert.deepEqual(mayor.strap, { name: 'MAYOR', role: '' });
  assert.notEqual(mayor.id, bookGuest(speakerProfile('the mayor', ''), { outlet: 'Other' }).id);
  // the identity's facts shape the look
  assert.equal(guestLook('x', { presentation: 'man', age: 'senior' }).age, 'senior');
  assert.ok(['bm_daniel:0.5+am_adam:0.5', 'am_santa:0.35+bm_george:0.65', 'am_fenrir:0.45+bm_lewis:0.55'].includes(guestVoice('y', 'man').voice));
  // the hand-over says where the words come from
  const line = provenanceLine(a, 'Pixelburg Post', 's1');
  assert.match(line, /Ana Silva/);
  assert.match(line, /Pixelburg Post/);
  assert.match(provenanceLine(mayor, 'Pixelburg Post', 's2'), /the mayor/);
});

test('identity (Wikidata): a human with an article; the dead and minors refused; the cache answers next time', async () => {
  const now = Date.parse('2026-10-12T00:00:00Z');
  const human = (id, extra = {}) => ({ id, sitelinks: { enwiki: {} }, descriptions: { en: { value: 'Mayor of Lisbon since 2021' } }, claims: { P31: [{ mainsnak: { datavalue: { value: { id: 'Q5' } } } }], P21: [{ mainsnak: { datavalue: { value: { id: 'Q6581072' } } } }], P569: [{ mainsnak: { datavalue: { value: { time: '+1971-03-02T00:00:00Z' } } } }], ...extra } });
  assert.deepEqual(pickIdentity([{ id: 'Q1', claims: {} }, human('Q2')], { role: 'mayor', now }), { qid: 'Q2', presentation: 'woman', age: 'middle', born: '1971-03-02', description: 'Mayor of Lisbon since 2021' });
  assert.equal(pickIdentity([human('Q3', { P570: [{ mainsnak: { datavalue: { value: { time: '+2026-01-01T00:00:00Z' } } } }] })], { now }).refused, 'deceased');
  assert.equal(pickIdentity([human('Q4', { P569: [{ mainsnak: { datavalue: { value: { time: '+2012-01-01T00:00:00Z' } } } }] })], { now }).refused, 'under 18');
  assert.equal(pickIdentity([human('Q5')], { role: 'footballer', now }), null, 'a namesake in another role is not them');
  assert.equal(ageBracket(Date.parse('2000-01-01'), now), 'adult');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ident-'));
  let calls = 0;
  const fetchImpl = async (url) => {
    calls++;
    const q = new URL(url).searchParams;
    const body = q.get('action') === 'wbsearchentities' ? { search: [{ id: 'Q2' }] } : { entities: { Q2: human('Q2') } };
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  };
  const desk = new IdentityDesk({ dir, fetchImpl, now: () => now, log: { warn() {} } });
  assert.equal((await desk.lookup('Ana Silva', { role: 'mayor' })).qid, 'Q2');
  assert.equal((await desk.lookup('Ana Silva', { role: 'mayor' })).qid, 'Q2');
  assert.equal(calls, 2, 'the second lookup is the cache');
  const limited = new IdentityDesk({ dir, fetchImpl: async () => ({ ok: true, status: 200, text: async () => 'You are making too many requests' }), now: () => now, log: { warn() {} } });
  assert.equal(await limited.lookup('Someone Else'), null);
  assert.ok(limited.pausedUntil > now, 'a rate limit rests the desk');
});

test('the producer: the person says the words after the story, the presenter hands over; the rules hold', async () => {
  const stories = new Map([
    ['s1', { id: 's1', title: 'New tram line opens in the old town', summary: `The city opened a new tram line on Monday. “${Q},” the mayor said. Trams run every ten minutes.` }],
    ['s2', { id: 's2', title: 'Two killed as storm hits coast', summary: '“We are doing everything we can to help people,” the governor said.' }],
    ['s3', { id: 's3', title: 'App launches translation', summary: '“Travel should not stop at the language barrier,” the company said.' }],
  ]);
  const seg = (id, text, q) => ({ type: 'story', anchor: 'A', emotion: 'neutral', storyId: id, headline: stories.get(id).title, source: 'Pixelburg Post', category: 'world', hasImage: false, text, cues: [], quote: q });
  const episode = () => ({
    segments: [
      { type: 'intro', anchor: 'A', text: 'Hello.' },
      seg('s1', `The city opened a new tram line on Monday. “${Q},” the mayor said. Trams run every ten minutes.`, quote(Q, 'the mayor')),
      seg('s2', 'A storm hit the coast. “We are doing everything we can to help people,” the governor said.', quote('We are doing everything we can to help people', 'the governor')),
      seg('s3', 'An app now translates. “Travel should not stop at the language barrier,” the company said.', quote('Travel should not stop at the language barrier', 'the company')),
      { type: 'outro', anchor: 'A', text: 'Goodbye.' },
    ],
    correspondents: { R1: 'rhea' },
    storyIds: ['s1', 's2', 's3'],
  });
  const logged = [];
  const producer = new Producer({ config: { restage: true }, newsDesk: { get: (id) => stories.get(id) }, chain: null, audit: (e) => logged.push(e), log: { info() {}, warn() {}, error() {} } });
  const ctx = { program: { id: 'world-now', restage: 1 }, presenters: { A: { id: 'paco' } }, episode: episode() };
  const note = await producer.guests(ctx);
  assert.equal(note.restaged, 1);
  const segs = ctx.episode.segments;
  const at = segs.findIndex((s) => s.type === 'cross' && s.kind === 'restage');
  assert.equal(at, 2, 'right after its story');
  const piece = segs[at];
  assert.equal(piece.text, `${Q}.`, 'the source\'s words, exactly');
  assert.equal(piece.anchor, 'R2', 'the next free voice slot');
  assert.equal(piece.recreation, true);
  assert.equal(piece.backdrop, 'press');
  const story = segs[at - 1];
  assert.ok(!story.text.includes('old town'), 'the presenter no longer reads the words the person says');
  assert.match(story.text, /Trams run every ten minutes\. .*Pixelburg Post/);
  assert.equal(story.link, 'R2');
  assert.equal(ctx.episode.correspondents.R2, piece.reporter);
  const booking = ctx.episode.guests[piece.reporter];
  assert.equal(booking.kind, 'restaged');
  assert.deepEqual(ctx.presenters.R2.cast, booking.voice);
  assert.deepEqual(castFor('rp_x', ctx.presenters.R2, {}), booking.voice, 'the voice service casts the booked voice');
  assert.equal(logged.length, 1);
  assert.equal(logged[0].words, piece.text);
  // the grave story and the company kept their quote cards
  assert.ok(!segs.some((s) => s.type === 'cross' && (s.storyId === 's2' || s.storyId === 's3')));
  // two allowed: still only the eligible one
  const ctx2 = { program: { id: 'world-now', restage: 2 }, presenters: { A: { id: 'paco' } }, episode: episode() };
  assert.equal((await producer.guests(ctx2)).restaged, 1);
  // an identity the check rules out (dead, a minor) keeps the quote card
  const named = { ...episode() };
  named.segments[1] = seg('s1', `The city opened a line. “${Q},” Ana Silva said.`, quote(Q, 'Ana Silva'));
  stories.set('s1', { ...stories.get('s1'), summary: `Ana Silva, the mayor of Lisbon, opened a line. “${Q},” she said.` });
  const refusing = new Producer({ config: {}, newsDesk: { get: (id) => stories.get(id) }, chain: null, identity: { lookup: async () => ({ refused: 'deceased' }) }, log: { info() {}, warn() {} } });
  assert.equal((await refusing.guests({ program: { id: 'world-now', restage: 1 }, presenters: {}, episode: named })).restaged, 0);
});
