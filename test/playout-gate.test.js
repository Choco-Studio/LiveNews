// Pre-rendered playout's check before air (server/playout/gate.js; docs/publishing/playout.md §3): every programme
// passes the compliance desk's preflight as the stream's output (kind 'live') before it may enter the playout queue:
// rights and demo data, verbatim copying, the register, the recreations (the owner's review, elections) and the
// no-LIVE rule. What fails is held with its reasons: the station never queues it (no voices are made for it) and the
// renderer never queues a rendered one; the next programme fills its place. Rules about uploads, not the picture,
// are reported as skipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';

function fakeCtx() {
  return { save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, fillRect() {}, drawImage() {}, putImageData() {}, measureText: () => ({ width: 5 }) };
}
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => fakeCtx() }) };

const { airGate, liveClaims, gateOptionsFromEnv, NOT_FOR_AIR } = await import('../server/playout/gate.js');
const { bookGuest, speakerProfile, provenanceLine } = await import('../server/guests/restage.js');
const { ComplianceRegister } = await import('../server/compliance/registry.js');
const { Station } = await import('../server/station.js');
const { loadChannel } = await import('../server/channel.js');

const NOW = Date.parse('2026-10-17T19:30:00Z');
const QUIET = { generatedAt: new Date(NOW).toISOString(), elections: [] };
const SOURCES = {
  s1: { title: 'Lisbon tram line opens', summary: 'The Portuguese capital inaugurated a riverside tram route on Saturday, officials said, after years of works along the Tagus.' },
  s2: { title: 'Rain for the north', summary: 'Forecasters expect heavy rain across northern regions from Sunday into early next week.' },
};
const getStory = (id) => SOURCES[id] || null;
const opts = (extra = {}) => ({ getStory, calendar: QUIET, now: NOW, register: new ComplianceRegister({}), env: {}, ...extra });
const rules = (v) => [...new Set(v.violations.map((x) => x.rule))].sort();

function episode(extra = {}) {
  return {
    kind: 'episode',
    id: 'e1',
    provider: 'mock',
    program: { id: 'world-now', title: 'WORLD NOW' },
    storyIds: ['s1', 's2'],
    segments: [
      { type: 'intro', anchor: 'A', text: '[wave] Good evening, and welcome to WORLD NOW.' },
      { type: 'story', storyId: 's1', headline: 'A new tram for Lisbon', text: 'Trams are running again beside the river in Lisbon. The new route took years to build.', source: 'Harbour Herald' },
      { type: 'story', storyId: 's2', headline: 'Wet days ahead', text: 'It will be a wet start to the week up north. Take an umbrella.', source: 'Weather Desk' },
      { type: 'outro', anchor: 'A', text: "That's WORLD NOW. [nod] Stay with us." },
    ],
    ...extra,
  };
}
function restaged() {
  const name = 'Ana Silva';
  const words = 'We will publish the full plan for the old town next week.';
  const booking = bookGuest(speakerProfile(name, `${name}, the mayor of Lisbon, opened the line. "${words}" she said.`), { outlet: 'Harbour Herald' });
  const hand = provenanceLine(booking, 'Harbour Herald', 's1');
  const ep = episode({ guests: { [booking.id]: booking } });
  ep.segments.splice(2, 0, { type: 'cross', part: 'piece', kind: 'restage', anchor: 'R1', reporter: booking.id, recreation: true, text: words, quoteRef: { outlet: 'Harbour Herald', by: name }, storyId: 's1', source: 'Harbour Herald' });
  ep.segments[1].text += ` ${hand}`;
  return ep;
}

test('a programme in its own words, with nothing held against it, passes (upload-only rules are skipped, not holding)', () => {
  const v = airGate(episode(), opts());
  assert.equal(v.ok, true, JSON.stringify(v.violations));
  assert.deepEqual(rules(v), []);
  // no EDITORIAL_CONTACT here: a description rule, reported as skipped with why
  assert.ok(v.skipped.some((x) => x.rule === 'editorial-contact-missing' && x.why === NOT_FOR_AIR['editorial-contact-missing']));
});

test('verbatim: a story that copies its source is held (block), or passes with a warning (warn, a test switch)', () => {
  const ep = episode();
  ep.segments[1].text = 'The Portuguese capital inaugurated a riverside tram route on Saturday, officials said, after years of works along the Tagus.';
  const held = airGate(ep, opts());
  assert.equal(held.ok, false);
  assert.ok(rules(held).includes('verbatim'));
  const warned = airGate(ep, opts({ verbatim: 'warn' }));
  assert.equal(warned.ok, true);
  assert.ok(warned.warnings.some((w) => /copied|words in a row/.test(w)));
});

test('demo data (the offline forecast) never airs from playout', () => {
  const v = airGate(episode({ weather: { demo: true, source: 'DEMO DATA' } }), opts());
  assert.ok(rules(v).includes('demo'));
});

test('a recreation waits for the owner\'s review (strict default); PLAYOUT_REVIEW=0 airs it unreviewed', () => {
  const ep = restaged();
  assert.deepEqual(rules(airGate(ep, opts())), ['review-missing']);
  assert.deepEqual(rules(airGate(ep, opts({ requireReview: false }))), []);
  const reg = new ComplianceRegister({});
  reg.recordReview('e1', { by: 'owner', checks: { quoteAgainstSource: true, factsChecked: true }, verdict: 'approve' });
  assert.equal(airGate(ep, opts({ register: reg })).ok, true, 'reviewed: it airs');
});

test('the register: a story withdrawn holds the programme that tells it', () => {
  const reg = new ComplianceRegister({});
  const c = reg.fileComplaint({ category: 'accuracy', about: { storyId: 's2' }, text: 'The forecast was wrong.' });
  // (a complaint keeps the story off air at once, as a precaution; the decision to remove keeps it off)
  assert.deepEqual(rules(airGate(episode(), opts({ register: reg }))), ['blocked']);
  reg.triage(c.id, { decision: 'remove', reason: 'wrong' });
  assert.deepEqual(rules(airGate(episode(), opts({ register: reg }))), ['blocked']);
});

test('the no-LIVE rule: a pre-recorded programme that says it is live is held; the live channel is not judged by it', () => {
  const ep = episode();
  ep.segments[0].text = "[wave] Good evening, we're live in the studio with WORLD NOW.";
  const v = airGate(ep, opts());
  assert.deepEqual(rules(v), ['false-live']);
  assert.match(v.violations[0].message, /segment 0 words says "we're live"/);
  assert.equal(airGate(ep, opts({ recorded: false })).ok, true);
  assert.equal(liveClaims(episode({ title: 'WORLD NOW LIVE' }))[0].where, 'title');
  assert.deepEqual(liveClaims(episode()), [], 'people who live somewhere, a live page: not claims');
});

test('a break holds nothing; a check that cannot run holds the programme (nothing airs unchecked)', () => {
  assert.equal(airGate({ kind: 'break', ads: 2 }).ok, true);
  const bad = airGate({ kind: 'episode', id: 'x', get segments() { throw new Error('boom'); } }, opts());
  assert.equal(bad.ok, false);
  assert.equal(bad.violations[0].rule, 'gate-error');
});

test('the gate settings: strict unless a test relaxes them (PLAYOUT_VERBATIM=warn, PLAYOUT_REVIEW=0)', () => {
  assert.deepEqual(gateOptionsFromEnv({}), { verbatim: 'block', requireReview: true });
  assert.deepEqual(gateOptionsFromEnv({ PLAYOUT_VERBATIM: 'warn', PLAYOUT_REVIEW: '0' }), { verbatim: 'warn', requireReview: false });
  assert.deepEqual(gateOptionsFromEnv({ PLAYOUT_VERBATIM: 'nonsense' }), { verbatim: 'block', requireReview: true });
});

test('the station holds an episode the gate fails: never queued, recorded, and the next programme made in its place', async () => {
  const channel = loadChannel();
  let n = 0;
  const made = [];
  const producer = {
    canProduce: () => true,
    async produce(ch, programId) {
      n++;
      const ep = { kind: 'episode', id: `e${n}`, program: { id: programId, title: ch.programs[programId].title }, segments: [{ type: 'intro', text: n === 1 ? "We're live." : 'Hello.' }], storyIds: [] };
      made.push(ep.id);
      return ep;
    },
  };
  const heldSeen = [];
  const st = new Station({
    config: { queueSize: 1, clock: false, playout: true },
    newsDesk: { stories: new Map(), uncovered: () => [] },
    producer,
    chain: { status: () => [] },
    channel: () => channel,
    log: { warn() {} },
    gate: (ep) => ({ ok: !liveClaims(ep).length, violations: liveClaims(ep) }),
    onHeld: (ep, v) => heldSeen.push([ep.id, v.violations[0].rule]),
  });
  await st.fill();
  assert.deepEqual(made, ['e1', 'e2']);
  assert.deepEqual(st.queue.map((e) => e.id), ['e2'], 'the held episode never reaches the queue');
  assert.deepEqual(heldSeen, [['e1', 'false-live']]);
  assert.equal(st.held[0].id, 'e1');
  assert.equal(st.status().held, 1);
});

test('nextReady waits for a finished programme instead of airing filler ads, then follows the station\'s order', async () => {
  const channel = loadChannel();
  let release;
  const gateOpen = new Promise((r) => (release = r));
  let n = 0;
  const producer = {
    canProduce: () => true,
    async produce(ch, programId) {
      await gateOpen;
      n++;
      return { kind: 'episode', id: `e${n}`, program: { id: programId, title: ch.programs[programId].title }, segments: [{ type: 'intro', text: 'Hello.' }], storyIds: [] };
    },
  };
  const st = new Station({ config: { queueSize: 1, clock: false, playout: true }, newsDesk: { stories: new Map(), uncovered: () => [] }, producer, chain: { status: () => [] }, channel: () => channel, log: { warn() {} } });
  const asked = st.nextReady(null, { poll: 5, timeoutMs: 5000 });
  await new Promise((r) => setTimeout(r, 30));
  release();
  const first = await asked;
  assert.equal(first.kind, 'episode', 'the first item is a programme, not a filler break');
  const brk = await st.nextReady(first.id, { poll: 5, timeoutMs: 5000 });
  assert.equal(brk.kind, 'break');
  assert.equal(brk.filler, false);
  assert.equal(brk.next?.ready, true, 'the break promotes a finished programme ("UP NEXT")');
  // a timeout goes on as the live channel would
  const stuck = new Station({ config: { queueSize: 1, clock: false, playout: true }, newsDesk: { stories: new Map(), uncovered: () => [] }, producer: { canProduce: () => false, produce: async () => null }, chain: { status: () => [] }, channel: () => channel, log: { warn() {} } });
  const none = await stuck.nextReady(null, { poll: 5, timeoutMs: 30 });
  assert.equal(none, null, 'nothing at all: the renderer asks again');
});

test('the approval page lists what the playout held, in the owner\'s words, read only', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { playoutView, RULE_ES } = await import('../server/publish/approval.js');
  const { PlayoutStore } = await import('../server/playout/queue.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playout-held-'));
  try {
    const st = new PlayoutStore(dir);
    st.hold({ id: 'u1', stage: 'air', airAt: Date.parse('2026-10-17T19:30:00Z'), title: 'WORLD NOW', violations: [{ rule: 'false-live', message: 'segment 0 words says "we\'re live"' }, { rule: 'verbatim', message: 'copied' }], files: [] });
    st.status('render', { bufferMinutes: 42.5, targetMinutes: 60, speed: 1.3 });
    const v = playoutView(dir);
    assert.equal(v.held.length, 1);
    assert.equal(v.held[0].title, 'WORLD NOW');
    assert.equal(v.held[0].stage, 'air');
    assert.equal(v.held[0].time.endsWith('20:30'), true, 'its air time, London');
    assert.deepEqual(v.held[0].violations.map((x) => x.es), [RULE_ES['false-live'], RULE_ES.verbatim]);
    assert.deepEqual(v.buffer, { minutes: 42.5, target: 60, speed: 1.3 });
    assert.equal(playoutView(null), null, 'no playout: no section');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
