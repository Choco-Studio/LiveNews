// The election rule (server/compliance/elections.js; compliance.md §5.4) and its place in IN THEIR WORDS
// (server/guests/restage.js restageHold, the producer's guests stage): candidates and every politician of a country
// about to vote keep the quote card for 30 days before the vote; silence periods hold anything about the vote; a
// stale calendar stops every politician's recreation; the server's opt-out register holds a person who asked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { electionHold, silenceHold, activeElections, levelOf, calendarFromRows, loadCalendar, countriesOf, countryName, ELECTION_RULE, isStale } from '../server/compliance/elections.js';
import { restageCheck, restageHold, configureRestage, speakerProfile } from '../server/guests/restage.js';
import { ComplianceRegister } from '../server/compliance/registry.js';

const DAY = 86400_000;
const NOW = Date.parse('2026-10-17T12:00:00Z');
const CAL = {
  generatedAt: new Date(NOW).toISOString(),
  elections: [
    { name: '2026 United States elections', date: '2026-11-03', country: 'United States', countryQid: 'Q30', level: 'national', candidates: [] },
    { name: '2026 Spanish general election', date: '2026-11-29', country: 'Spain', countryQid: 'Q29', level: 'national', candidates: [] },
    { name: '2026 Raleigh mayoral election', date: '2026-10-27', country: 'United States', countryQid: 'Q30', level: 'local', candidates: ['Jane Placeholder'] },
    { name: '2026 Bulgarian presidential election', date: '2026-10-25', country: 'Bulgaria', countryQid: 'Q219', level: 'national', candidates: [] },
  ],
};
const politician = (by, src) => speakerProfile(by, src);

test('who is held: a US senator 17 days before the midterms, a Spanish minister only from 30 days before 29 November', () => {
  const senator = politician('Mark Kelly', 'US Senator Mark Kelly said the bill would pass. He added more.');
  const h = electionHold({ speaker: senator, now: NOW, calendar: CAL });
  assert.equal(h.hold, true);
  assert.match(h.reasons[0], /United States 17 days before 2026 United States elections/);
  const minister = politician('Ana Ruiz', 'Spanish minister Ana Ruiz said the plan was ready. She added more.');
  assert.equal(electionHold({ speaker: minister, now: NOW, calendar: CAL }).hold, false, '43 days before: not yet');
  assert.equal(electionHold({ speaker: minister, now: Date.parse('2026-10-31T09:00:00Z'), calendar: CAL }).hold, true, '29 days before');
  assert.equal(electionHold({ speaker: minister, now: Date.parse('2026-12-02T00:00:00Z'), calendar: CAL }).hold, false, 'after the vote, the day after and its time zones');
  // not a politician: a central bank's official, a scientist, an executive are never held by an election
  for (const by of ['Fed chair Jerome Powell', 'a lead researcher', 'the chief executive']) assert.equal(electionHold({ speaker: politician(by, ''), now: NOW, calendar: CAL }).hold, false, by);
});

test('the country from the role, a demonym, the Wikidata citizenship, else the story (fail closed)', () => {
  assert.ok(countriesOf('Bulgarian President Rumen Radev').has('Bulgaria'));
  assert.ok(countriesOf('the mayor of Lisbon').has('Portugal'));
  assert.equal(countryName('United States of America'), 'United States');
  // a politician whose role names no country: their citizenship decides
  const p = { name: 'Rumen Radev', role: 'president', kind: 'politician' };
  assert.equal(electionHold({ speaker: p, identity: { citizenship: ['Q219'] }, now: NOW, calendar: CAL }).hold, true);
  assert.equal(electionHold({ speaker: p, identity: { citizenship: ['Q142'] }, now: NOW, calendar: CAL }).hold, false, 'a French citizen');
  // nothing at all about them: the story's countries stand in
  assert.equal(electionHold({ speaker: p, story: { title: 'Sofia protests', summary: 'Thousands marched in Bulgaria.' }, now: NOW, calendar: CAL }).hold, true);
  assert.equal(electionHold({ speaker: p, story: { title: 'Paris talks', summary: 'Talks in France.' }, now: NOW, calendar: CAL }).hold, false);
});

test('named candidates of any vote (local ones for 14 days), and a stale calendar holds every politician', () => {
  const cand = { name: 'Jane Placeholder', role: 'city council member', kind: 'politician' };
  assert.equal(electionHold({ speaker: cand, now: NOW, calendar: { ...CAL, elections: CAL.elections.slice(2, 3) } }).hold, true);
  assert.equal(electionHold({ speaker: { name: 'Jane Placeholder', role: 'chief executive', kind: 'executive' }, now: NOW, calendar: CAL }).hold, true, 'a candidate whatever the story calls them');
  const stale = { generatedAt: new Date(NOW - 20 * DAY).toISOString(), elections: [] };
  assert.equal(isStale(stale, NOW), true);
  const r = electionHold({ speaker: { name: 'A Person', role: 'prime minister', kind: 'politician' }, now: NOW, calendar: { ...stale, stale: true } });
  assert.equal(r.hold, true);
  assert.match(r.reasons[0], /out of date/);
  assert.equal(ELECTION_RULE.windowDays, 30);
});

test('silence: the day before polling day and polling day (Serbia two days), only for words about the vote', () => {
  const eve = Date.parse('2026-10-24T10:00:00Z');
  const a = activeElections(CAL, eve).find((x) => x.election.country === 'Bulgaria');
  assert.equal(a.phase, 'silence');
  const s = silenceHold({ text: 'Bulgaria votes on Sunday: the candidates made their last appeals.', now: eve, calendar: CAL });
  assert.equal(s.hold, true);
  assert.match(s.until, /^2026-10-26/);
  assert.equal(silenceHold({ text: 'A new bridge opens in Bulgaria.', now: eve, calendar: CAL }).hold, false, 'not about the vote');
  assert.equal(silenceHold({ text: 'Bulgaria votes on Sunday.', now: Date.parse('2026-10-20T10:00:00Z'), calendar: CAL }).hold, false, 'before the silence');
  const serbia = { generatedAt: CAL.generatedAt, elections: [{ name: 'Serbian vote', date: '2026-10-25', country: 'Serbia', level: 'national', candidates: [] }] };
  assert.equal(activeElections(serbia, Date.parse('2026-10-23T10:00:00Z'))[0].phase, 'silence', 'two days in Serbia');
});

test('Wikidata\'s rows to the calendar: levels, one entry per country and day, candidates kept', () => {
  assert.equal(levelOf('2026 Spanish general election'), 'national');
  assert.equal(levelOf('2026 Michigan House of Representatives election'), 'regional');
  assert.equal(levelOf('2026 Ottawa municipal election'), 'local');
  assert.equal(levelOf('2026 Calverley and Farsley by-election'), 'by-election');
  assert.equal(levelOf('2026 Swiss referendum on housing'), 'referendum');
  const row = (e, label, date, country, cand = '') => ({ e: { value: `http://www.wikidata.org/entity/${e}` }, eLabel: { value: label }, date: { value: `${date}T00:00:00Z` }, country: { value: 'http://www.wikidata.org/entity/Q30' }, countryLabel: { value: country }, types: { value: '' }, cands: { value: cand } });
  const cal = calendarFromRows([
    row('Q1', '2026 United States Senate election in Ohio', '2026-11-03', 'United States of America', 'A One|B Two'),
    row('Q2', '2026 Texas gubernatorial election', '2026-11-03', 'United States of America', 'C Three'),
    row('Q3', '2026 United States elections', '2026-11-03', 'United States of America'),
  ], { now: NOW });
  const us = cal.elections.filter((e) => e.country === 'United States');
  assert.deepEqual(us.map((e) => e.level).sort(), ['national', 'regional']);
  const reg = us.find((e) => e.level === 'regional');
  assert.deepEqual(reg.candidates.sort(), ['A One', 'B Two', 'C Three']);
  assert.match(reg.name, /state and regional elections/);
});

test('the committed calendar reads, and the server\'s newer copy wins', () => {
  const cal = loadCalendar({ now: Date.parse(JSON.parse(fs.readFileSync(new URL('../server/compliance/elections.json', import.meta.url), 'utf8')).generatedAt) });
  assert.ok(cal.elections.length > 10 && cal.stale === false);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cal-'));
  fs.mkdirSync(path.join(dir, 'compliance'));
  fs.writeFileSync(path.join(dir, 'compliance', 'elections.json'), JSON.stringify({ generatedAt: '2099-01-01T00:00:00Z', elections: [{ name: 'x', date: '2099-01-02', country: 'Spain', level: 'national', candidates: [] }] }));
  assert.equal(loadCalendar({ dataDir: dir }).elections[0].name, 'x');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('IN THEIR WORDS: with the server\'s calendar a US politician keeps the quote card; without one (a test, a tool) nothing changes', () => {
  const quote = { text: 'This bill will lower costs for every family in the state', by: 'Mark Kelly' };
  const source = `US Senator Mark Kelly backed the bill. “${quote.text},” he said.`;
  const story = { title: 'Senate bill on costs advances', summary: 'A bill moved forward.' };
  configureRestage({});
  assert.equal(restageCheck({ quote, source, story }).ok, true, 'no calendar configured: as before');
  configureRestage({ calendar: () => ({ ...CAL, stale: false }) });
  try {
    const r = restageCheck({ quote, source, story });
    assert.equal(r.ok, false);
    assert.match(r.reasons.join(), /election|before 2026 United States/);
    // a scientist in the same story is not held
    const sci = restageCheck({ quote: { text: quote.text, by: 'a lead researcher' }, source: `A lead researcher said: “${quote.text}.”`, story });
    assert.equal(sci.ok, true, sci.reasons.join('; '));
  } finally {
    configureRestage({});
  }
});

test('the opt-out register: a person who asked is held on air (restageHold) whatever the calendar', () => {
  const reg = new ComplianceRegister({});
  const c = reg.fileComplaint({ category: 'privacy-likeness', about: { person: { name: 'Ana Silva' } }, text: 'Do not recreate me.' });
  reg.triage(c.id, { decision: 'block-person', reason: 'her request' });
  const speaker = speakerProfile('Ana Silva', 'Ana Silva, the mayor of Lisbon, spoke.');
  const held = restageHold({ speaker, calendar: null, blocked: (w) => reg.isBlocked(w) });
  assert.equal(held.length, 1);
  assert.match(held[0], /asked not to be re-staged/);
  assert.deepEqual(restageHold({ speaker: speakerProfile('Rui Costa', 'Rui Costa, the mayor of Porto, spoke.'), calendar: null, blocked: (w) => reg.isBlocked(w) }), []);
});

test('the producer\'s guests stage: the Wikidata citizenship brings the hold; outside the window the same person is re-staged', async () => {
  const { Producer } = await import('../server/producer.js');
  const Q = 'This bill will lower costs for every family in the state';
  const stories = new Map([['s1', { id: 's1', title: 'Cost bill advances', summary: `Senator Kai Moana backed the bill. “${Q},” he said.` }]]);
  const episode = () => ({
    segments: [
      { type: 'intro', anchor: 'A', text: 'Hello.' },
      { type: 'story', anchor: 'A', emotion: 'neutral', storyId: 's1', headline: 'Cost bill advances', source: 'Pixelburg Post', category: 'world', hasImage: false, text: `The bill advanced. “${Q},” Kai Moana said. A vote is due.`, cues: [], quote: { text: Q, by: 'Kai Moana' } },
      { type: 'outro', anchor: 'A', text: 'Goodbye.' },
    ],
    storyIds: ['s1'],
  });
  // the role names no country; the identity says a US citizen (Wikidata Q30)
  const identity = { lookup: async () => ({ qid: 'Q1', presentation: 'man', age: 'middle', citizenship: ['Q30'] }) };
  const make = () => new Producer({ config: { restage: true }, newsDesk: { get: (id) => stories.get(id) }, chain: null, identity, log: { info() {}, warn() {}, error() {} } });
  configureRestage({ calendar: () => ({ ...CAL, stale: false }) });
  try {
    const held = await make().guests({ program: { id: 'world-now', restage: 1 }, presenters: {}, episode: episode() });
    assert.equal(held.restaged, 0, 'held: 17 days before the US vote');
    assert.equal(held.declined, 1);
    configureRestage({ calendar: () => ({ generatedAt: new Date().toISOString(), elections: [], stale: false }) });
    const free = await make().guests({ program: { id: 'world-now', restage: 1 }, presenters: {}, episode: episode() });
    assert.equal(free.restaged, 1, 'no vote in the window: re-staged');
  } finally {
    configureRestage({});
  }
});
