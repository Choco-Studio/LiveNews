// The publish-time check of a clip, a Short or a programme (server/compliance/clips.js; compliance.md §5): it
// refuses a clip that starts after the presenter's provenance line, cuts inside a quotation or a sentence, loses
// the AI RECREATION label or the AI mark in its crop or shrinks them past legibility, misses a platform's
// synthetic-media flag, re-stages a politician in an election window, publishes about a vote in its silence, or
// touches what the register has taken down; and it builds the clip's timeline from a recording's report.
import { test } from 'node:test';
import assert from 'node:assert/strict';

function fakeCtx() {
  return { save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, fillRect() {}, drawImage() {}, putImageData() {} };
}
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => fakeCtx() }) };

const { checkClip, timelineFromRecording, frameGeometry, legibleCap } = await import('../server/compliance/clips.js');
const { bookGuest, speakerProfile, provenanceLine } = await import('../server/guests/restage.js');
const { ComplianceRegister } = await import('../server/compliance/registry.js');

const DAY = 86400_000;
const NOW = Date.parse('2026-10-17T12:00:00Z');
const QUIET = { generatedAt: new Date(NOW).toISOString(), elections: [] };

/** An episode the way the producer builds one: a story, the presenter's hand-over, the recreation, the next story. */
function episode({ name = 'Ana Silva', role = 'the mayor of Lisbon', outlet = 'Harbour Herald', words = 'We will publish the full plan for the old town next week.' } = {}) {
  const src = `${name}, ${role}, opened the line. "${words}" she said.`;
  const booking = bookGuest(speakerProfile(name, src), { outlet });
  const hand = provenanceLine(booking, outlet, 's1');
  return {
    id: 'e1',
    provider: 'mock',
    program: { id: 'world-now', title: 'WORLD NOW' },
    storyIds: ['s1', 's2'],
    guests: { [booking.id]: booking },
    segments: [
      { type: 'story', storyId: 's1', headline: 'Tram line opens in Lisbon', text: `Lisbon has opened its new tram line. ${hand}`, linkKind: 'restage', link: 'R1', source: outlet },
      { type: 'cross', part: 'piece', kind: 'restage', anchor: 'R1', reporter: booking.id, recreation: true, text: words, quoteRef: { outlet, by: name }, storyId: 's1', source: outlet },
      { type: 'story', storyId: 's2', headline: 'Rain on the way', text: 'Rain is forecast across the north. It will clear by the weekend.', source: 'Weather Desk' },
    ],
    hand,
  };
}

/** The timeline the recorder gives that episode: presenter 0-6 s (hand-over 4-6 s), recreation 6.5-10 s, next story 11-17 s. */
function timeline(ep) {
  const id = ep.segments[1].reporter;
  return [
    { start: 0, end: 4, text: 'Lisbon has opened its new tram line.', segIndex: 0, kind: 'speech', quote: false },
    { start: 4, end: 6, text: ep.hand, segIndex: 0, kind: 'provenance', recreationId: id, quote: false },
    { start: 6.5, end: 10, text: ep.segments[1].text, segIndex: 1, kind: 'recreation', recreationId: id, quote: true },
    { start: 11, end: 14, text: 'Rain is forecast across the north.', segIndex: 2, kind: 'speech', quote: false },
    { start: 14, end: 17, text: 'It will clear by the weekend.', segIndex: 2, kind: 'speech', quote: false },
  ];
}
const FLAGS = { youtube: { containsSyntheticMedia: true }, tiktok: { is_aigc: true }, instagram: { is_ai_generated: true } };
const reviewed = () => {
  const reg = new ComplianceRegister({});
  reg.recordReview('e1', { by: 'owner', checks: { quoteAgainstSource: true, factsChecked: true }, verdict: 'approve' });
  return reg;
};
const rules = (r) => r.violations.map((v) => v.rule).sort();

test('a clip with a recreation from the hand-over to the end of the words, flagged and reviewed: it passes', () => {
  const ep = episode();
  const r = checkClip({ id: 'c1', kind: 'clip', episode: ep, range: { start: 4, end: 10.4 }, timeline: timeline(ep), platforms: ['youtube', 'tiktok', 'instagram'], flags: FLAGS }, { now: NOW, calendar: QUIET, register: reviewed() });
  assert.deepEqual(r.violations, []);
  assert.equal(r.recreations.length, 1);
  assert.equal(r.disclosure.platforms.youtube.containsSyntheticMedia, true);
  assert.equal(r.disclosure.platforms.youtube.required, true, 'with a recreation the flag is required');
});

test('no hand-over, a cut inside the words or inside a sentence: refused, and it says where to cut', () => {
  const ep = episode();
  const tl = timeline(ep);
  const base = { id: 'c1', kind: 'clip', episode: ep, timeline: tl, platforms: ['youtube'], flags: FLAGS };
  const opts = { now: NOW, calendar: QUIET, register: reviewed() };
  const late = checkClip({ ...base, range: { start: 6.2, end: 10.5 } }, opts);
  assert.deepEqual(rules(late), ['provenance-missing']);
  assert.equal(late.violations[0].startAt, 4);
  assert.ok(rules(checkClip({ ...base, range: { start: 4, end: 8 } }, opts)).includes('quote-cut'), 'ends inside the words');
  assert.ok(rules(checkClip({ ...base, range: { start: 7, end: 10.5 } }, opts)).includes('quote-cut'), 'starts inside the words');
  assert.deepEqual(rules(checkClip({ ...base, range: { start: 11, end: 15.5 } }, opts)), ['sentence-cut'], 'half a sentence of the next story');
  assert.deepEqual(rules(checkClip({ ...base, range: { start: 11, end: 17 } }, opts)), [], 'a clip of the next story alone needs no recreation rules');
  // without a timeline a clip from an episode with a recreation cannot be verified
  assert.ok(rules(checkClip({ ...base, timeline: null, range: { start: 4, end: 10.5 } }, opts)).includes('timeline-missing'));
});

test('the label in a 9:16 crop: refused from a 16:9 render, accepted when recorded in the window', () => {
  const ep = episode({ outlet: 'Associated Press' });
  const base = { id: 'c1', kind: 'short', episode: ep, range: { start: 4, end: 10.4 }, timeline: timeline(ep), platforms: ['youtube'], flags: FLAGS };
  const opts = { now: NOW, calendar: QUIET, register: reviewed() };
  const crop = { x: 132, y: 0, w: 121, h: 216 };
  const out = { w: 1080, h: 1920 };
  const cropped = checkClip({ ...base, frame: { crop, output: out } }, opts);
  assert.ok(rules(cropped).includes('label-out-of-frame'), 'the 16:9 label sits top right, outside a centred 9:16 crop');
  assert.ok(rules(cropped).includes('mark-out-of-frame'), 'and the AI mark top left');
  const windowed = checkClip({ ...base, frame: { crop, output: out, window: '9x16' } }, opts);
  assert.deepEqual(rules(windowed), [], 'recorded with ?frame=9x16: everything inside, legible');
  // the whole 16:9 frame shrunk into a 9:16 picture: inside, but too small to read on a phone
  const letterbox = checkClip({ ...base, frame: { output: out, place: { x: 0, y: 656, w: 1080, h: 608 } } }, opts);
  assert.deepEqual(rules(letterbox), ['label-illegible']);
  assert.ok(legibleCap(1920) > 7 * frameGeometry({ output: out, place: { x: 0, y: 656, w: 1080, h: 608 } }).scale);
  // a plain 16:9 upload of the whole frame is fine
  assert.deepEqual(rules(checkClip({ ...base, frame: { output: { w: 1920, h: 1080 } } }, opts)), []);
});

test('the platforms\' flags: missing ones refuse; Facebook has none, so a recreation goes there only labelled by hand', () => {
  const ep = episode();
  const base = { id: 'c1', kind: 'clip', episode: ep, range: { start: 4, end: 10.4 }, timeline: timeline(ep) };
  const opts = { now: NOW, calendar: QUIET, register: reviewed() };
  const r = checkClip({ ...base, platforms: ['youtube', 'tiktok', 'instagram'], flags: {} }, opts);
  assert.equal(r.violations.filter((v) => v.rule === 'flag-missing').length, 3);
  assert.deepEqual(rules(checkClip({ ...base, platforms: ['facebook'], flags: {} }, opts)), ['flag-unavailable']);
  assert.deepEqual(rules(checkClip({ ...base, platforms: ['facebook'], flags: { facebook: { manualLabel: true } } }, opts)), []);
  // a clip without a recreation still carries the flags on YouTube (our policy: every upload)
  const plain = checkClip({ ...base, range: { start: 11, end: 17 }, platforms: ['youtube'], flags: {} }, opts);
  assert.deepEqual(rules(plain), ['flag-missing']);
});

test('election periods: a politician of a country inside its window is held; a scientist is not; silence holds a clip about the vote', () => {
  const cal = { generatedAt: new Date(NOW).toISOString(), elections: [{ name: '2026 Portuguese legislative election', date: '2026-10-30', country: 'Portugal', countryQid: 'Q45', level: 'national', candidates: [] }] };
  const ep = episode();
  const base = { id: 'c1', kind: 'clip', episode: ep, range: { start: 4, end: 10.4 }, timeline: timeline(ep), platforms: ['youtube'], flags: FLAGS };
  const held = checkClip(base, { now: NOW, calendar: cal, register: reviewed() });
  assert.deepEqual(rules(held), ['election-hold']);
  assert.match(held.violations[0].message, /Portugal 13 days before/);
  const sci = episode({ name: 'Rui Costa', role: 'a lead researcher at the University of Lisbon' });
  assert.deepEqual(rules(checkClip({ ...base, episode: sci, timeline: timeline(sci) }, { now: NOW, calendar: cal, register: reviewed() })), []);
  // the day before the vote: anything about it is held until polls close
  const eve = Date.parse('2026-10-29T12:00:00Z');
  const vote = { ...episode({ name: 'Rui Costa', role: 'a lead researcher at the University of Lisbon' }) };
  vote.segments[2] = { ...vote.segments[2], headline: 'Portugal votes on Sunday', text: 'Voters in Portugal go to the polls on Sunday in a snap election.' };
  const tl = timeline(vote);
  tl[3].text = 'Voters in Portugal go to the polls on Sunday in a snap election.';
  const silent = checkClip({ ...base, episode: vote, timeline: tl, range: { start: 11, end: 17 } }, { now: eve, calendar: cal, register: reviewed() });
  assert.deepEqual(rules(silent), ['election-silence']);
  assert.match(silent.violations[0].until, /^2026-10-31/);
  // a stale calendar fails closed for politicians
  const stale = { generatedAt: new Date(NOW - 30 * DAY).toISOString(), elections: [] };
  assert.deepEqual(rules(checkClip(base, { now: NOW, calendar: { ...stale, stale: true }, register: reviewed() })), ['election-hold']);
});

test('the register: a person who asked not to be re-staged, a story withdrawn, an unreviewed recreation, demo data', () => {
  const ep = episode();
  const base = { id: 'c1', kind: 'clip', episode: ep, range: { start: 4, end: 10.4 }, timeline: timeline(ep), platforms: ['youtube'], flags: FLAGS };
  const reg = reviewed();
  const c = reg.fileComplaint({ category: 'privacy-likeness', about: { person: { name: 'Ana Silva' } }, text: 'Please remove the recreation of me.' });
  reg.triage(c.id, { decision: 'block-person', reason: 'asked to be left out' });
  assert.ok(rules(checkClip(base, { now: NOW, calendar: QUIET, register: reg })).includes('blocked'));
  const reg2 = new ComplianceRegister({});
  assert.deepEqual(rules(checkClip(base, { now: NOW, calendar: QUIET, register: reg2 })), ['review-missing']);
  assert.deepEqual(rules(checkClip(base, { now: NOW, calendar: QUIET, register: reg2, requireReview: false })), []);
  const demo = { ...episode(), weather: { demo: true, source: 'DEMO DATA' } };
  assert.ok(rules(checkClip({ ...base, episode: demo }, { now: NOW, calendar: QUIET, register: reviewed() })).includes('demo'));
});

test('a whole programme: every recreation counted, no timeline needed, the same flags and holds', () => {
  const ep = episode();
  const r = checkClip({ id: 'e1', kind: 'episode', episode: ep, platforms: ['youtube'], flags: FLAGS }, { now: NOW, calendar: QUIET, register: reviewed() });
  assert.deepEqual(r.violations, []);
  assert.equal(r.recreations.length, 1);
});

test('the timeline from a recording: segments matched by their words, the hand-over found, the recreation marked', () => {
  const ep = episode();
  const words = ep.segments[0].text.split(/(?<=\.)\s+/);
  const report = {
    events: [
      { type: 'speak', slot: 'A', text: ep.segments[0].text.slice(0, 60), v: 0 },
      { type: 'sentence', slot: 'A', i: 0, text: words[0].slice(0, 40), v: 0.1 },
      { type: 'sentence', slot: 'A', i: 1, text: words[1].slice(0, 40), v: 3.2 },
      { type: 'speak', slot: 'R1', text: ep.segments[1].text.slice(0, 60), v: 6.4 },
      { type: 'sentence', slot: 'R1', i: 0, text: ep.segments[1].text.slice(0, 40), v: 6.5 },
      { type: 'clip', va: 6.45, duration: 3.6 },
      { type: 'speak', slot: 'A', text: ep.segments[2].text.slice(0, 60), v: 11 },
      { type: 'sentence', slot: 'A', i: 0, text: 'Rain is forecast across the north.', v: 11.05 },
      { type: 'sentence', slot: 'A', i: 1, text: 'It will clear by the weekend.', v: 14 },
    ],
  };
  const tl = timelineFromRecording(ep, report);
  assert.deepEqual(tl.map((t) => t.kind), ['speech', 'provenance', 'recreation', 'speech', 'speech']);
  assert.equal(tl[2].recreationId, ep.segments[1].reporter);
  assert.ok(Math.abs(tl[2].end - (6.45 + 3.6)) < 1e-9, 'the voice clip ends the recreation');
  const r = checkClip({ id: 'c1', kind: 'clip', episode: ep, range: { start: 3.2, end: 10.4 }, recording: report, platforms: ['youtube'], flags: FLAGS }, { now: NOW, calendar: QUIET, register: reviewed() });
  assert.deepEqual(r.violations, []);
});
