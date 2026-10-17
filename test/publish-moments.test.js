// The publishing desk's moments (server/publish/moments.js; docs/publishing/clips.md §2): found from the episode's own
// structure, starting on a sentence that stands alone, scored for sense and interest, light or grave by the channel's
// own measures, and only the light ones publishable in Phase 1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectMoments, publishable, hookLines, pickHook, placeRun, momentId, headlineHook } from '../server/publish/moments.js';
import { estimateTimeline } from '../server/publish/timeline.js';
import { dangling, backReference, endsClean, quotesBalanced } from '../server/publish/text.js';

const S = (text, extra = {}) => ({ type: 'story', anchor: 'A', text, ...extra });

const COSMOS = {
  id: 'cos1',
  program: { id: 'cosmos', title: 'COSMOS DESK', theme: 'space' },
  cast: { A: 'nova', B: 'unit8' },
  segments: [
    { type: 'intro', anchor: 'A', text: 'Coming up: barn owls in Manhattan. Later: a new director for a NASA centre.', teases: ['a', 'b'] },
    S('A rare family of barn owls moved into Manhattan this week, and New Yorkers have been gathering in the park every evening to watch the young birds learn to fly between the trees.', { storyId: 's1', headline: 'Barn owls move into Manhattan', kicker: 'NATURE' }),
    S('Cannons are lifted from St Michael\'s Mount by helicopter so they can be taken away for restoration, after two centuries of salt spray on the island\'s battlements wore their iron down.', { storyId: 's2', headline: 'Historic cannons airlifted for restoration', kicker: 'HISTORY', anchor: 'B' }),
    S('NASA will fly low over Texas farmland to measure the gases that crops and cattle give off, in a campaign that runs for six weeks and covers more than two hundred farms across the state.', { storyId: 's3', headline: 'NASA to fly low over Texas farms', kicker: 'SCIENCE' }),
    { type: 'chat', anchor: 'B', text: 'Texas. Logged.' },
    { type: 'chat', anchor: 'A', text: 'Good, UNIT-8. Thank you.' },
    S('Evacuation orders are in place as a fast-moving wildfire burns homes in California, and firefighters say the flames have already destroyed more than forty houses.', { storyId: 's4', headline: 'Wildfire forces evacuations in California', kicker: 'WILDFIRE', emotion: 'sad' }),
    { type: 'outro', anchor: 'A', text: 'That is COSMOS DESK. Thank you for watching.' },
  ],
};

const QUIZ = {
  id: 'quiz1',
  program: { id: 'pay-attention', title: 'PAY ATTENTION', theme: 'quiz' },
  cast: { H: 'qm', A: 'penny', B: 'unit8' },
  quiz: {},
  segments: [
    { type: 'quiz', part: 'open', anchor: 'H', text: 'Welcome to PAY ATTENTION.' },
    { type: 'quiz', part: 'round', anchor: 'H', text: 'Round one is HOW MANY? No options. Just your best guess.', quiz: { round: 'howmany', title: 'HOW MANY?' } },
    { type: 'quiz', part: 'frame', anchor: 'H', text: "How many? Here's the sentence as it aired.", quiz: { question: { type: 'howmany', key: 'k1', words: 'TSMC profit soars', aired: { source: 'Euronews Business' } } } },
    { type: 'quiz', part: 'guess', anchor: 'A', text: '50%. Final answer.' },
    { type: 'quiz', part: 'reveal', anchor: 'H', text: 'The answer: 68.7%. Penny was nearer.' },
    { type: 'quiz', part: 'react', anchor: 'B', text: 'In the black.' },
    { type: 'quiz', part: 'frame', anchor: 'H', text: 'How much? The new blank HomePod mini goes on sale this month.', quiz: { question: { type: 'howmany', key: 'k2', aired: { source: 'TechCrunch' } } } },
    { type: 'quiz', part: 'guess', anchor: 'B', text: 'One hundred and ninety-nine dollars.' },
    { type: 'quiz', part: 'reveal', anchor: 'H', text: 'It is one hundred and forty-nine dollars.' },
  ],
};

test('the text checks: a dangling opener, a back reference, a clean end, a balanced quote', () => {
  assert.ok(dangling('But the plan failed.'));
  assert.ok(dangling('Thanks, UNIT-8.') || dangling('He said it was over.'));
  assert.ok(!dangling('A rare family of barn owls moved into Manhattan.'));
  assert.ok(backReference('As we reported earlier, the vote was delayed.'));
  assert.ok(endsClean('It ended here.') && !endsClean('It ended here and'));
  assert.ok(quotesBalanced('She said "yes" today.') && !quotesBalanced('She said "yes today.'));
});

test('hooks: at most two lines of 16 characters, whole words, a colon or question ends the first line', () => {
  for (const h of ['WHAT WE KNOW: WILDFIRE', 'A RARE FAMILY OF BARN OWLS', 'UNIT-8 HAS A THOUGHT', 'HOW MANY? PLAY ALONG']) {
    const lines = pickHook([h], 'GLOBIT 24');
    assert.ok(lines.length >= 1 && lines.length <= 2, h);
    for (const l of lines) assert.ok(l.length <= 16, `${h}: ${l}`);
  }
  assert.deepEqual(pickHook(['HOW MANY? PLAY ALONG'], 'X'), ['HOW MANY?', 'PLAY ALONG']);
  assert.equal(hookLines('THIS HEADLINE IS FAR TOO LONG TO FIT IN TWO LINES'), null);
  assert.deepEqual(pickHook([['GIVEN', 'LINES']], 'X'), ['GIVEN', 'LINES']);
});

test('a headline hook is always the whole headline (2x when short, else the body face), never a cut one', () => {
  assert.deepEqual(headlineHook('Barn owls move to Manhattan'), ['BARN OWLS MOVE', 'TO MANHATTAN']);
  const long = 'Neanderthal remains may be earliest human ancestor find killed by a spear';
  const h = headlineHook(long);
  assert.equal(h.join(' '), long.toUpperCase(), 'whole');
  assert.ok(h.length <= 3 && h.every((l) => l.length <= 32));
  assert.deepEqual(headlineHook('F1 in Singapore: There is a new fastest car now in the paddock of the world'), ['F1 IN SINGAPORE'], 'its own colon part at 2x');
  const q = headlineHook('Lisa Nandy ‘minded to intervene’ in Sky’s £1.6bn purchase of ITV');
  assert.equal(q.join(' '), 'LISA NANDY ‘MINDED TO INTERVENE’ IN SKY’S £1.6BN PURCHASE OF ITV', 'a quote is never cut open');
  assert.equal(headlineHook('x'.repeat(120)), null);
});

test('placeRun starts a run on its first sentence that stands alone', () => {
  const ep = { segments: [S('Thanks, UNIT-8. And finally: NASA names a new director for its Marshall centre in Alabama.')] };
  const run = placeRun(estimateTimeline(ep), 0, 0);
  assert.ok(run.trimmed);
  assert.match(run.text, /^And finally|^NASA/);
});

test('COSMOS DESK: light stories, UNIT-8 with the story it answers, a run of stories, a grave story never light', () => {
  const ms = detectMoments(COSMOS);
  const unit = ms.find((m) => m.kind === 'unit8');
  assert.ok(unit, 'a UNIT-8 moment');
  assert.equal(unit.from, 3, 'the exchange carries the Texas story it answers');
  assert.match(unit.text, /^NASA will fly low over Texas/);
  const run = ms.find((m) => m.kind === 'stories');
  assert.ok(run, 'a run of light stories');
  assert.ok(run.to - run.from >= 1 && run.duration >= 25 && run.duration <= 75);
  assert.deepEqual(run.hook.length, 2);
  const fire = ms.find((m) => m.kind === 'story' && m.from === 6);
  assert.ok(fire.grave && !fire.light, 'the wildfire is grave');
  for (const m of ms) assert.equal(m.id, momentId('cos1', m.kind, m.from, m.to));
  // best first
  for (let i = 1; i < ms.length; i++) assert.ok(ms[i - 1].scores.total >= ms[i].scores.total);
});

test('a tease ("Still to come: ...") is never part of a clip, even when UNIT-8 reads it', () => {
  const ep = { ...COSMOS, segments: [...COSMOS.segments.slice(0, 3), { type: 'chat', anchor: 'B', text: 'Still to come: NASA names a new director for its Marshall centre.' }, ...COSMOS.segments.slice(3)] };
  const ms = detectMoments(ep);
  assert.ok(!ms.some((m) => m.kind === 'unit8' && m.from <= 3 && m.to >= 3), 'no exchange built on the tease');
  for (const m of ms.filter((x) => x.kind !== 'montage')) assert.ok(!/Still to come/.test(m.text) || m.scores.sense <= 6, m.id);
});

test('Phase 1 publishes light moments only; Phase 2 anything not grave; demo data never', () => {
  const ms = detectMoments(COSMOS);
  const p1 = publishable(ms, { phase: 1 });
  assert.ok(p1.length > 0);
  for (const m of p1) assert.ok(m.light && !m.grave && m.scores.sense >= 7);
  assert.ok(!publishable(ms, { phase: 2 }).some((m) => m.grave));
  const demo = detectMoments({ ...COSMOS, demo: true });
  assert.equal(publishable(demo, { phase: 3 }).length, 0);
  // a news programme is not light in Phase 1
  const news = detectMoments({ ...COSMOS, program: { id: 'world-now', title: 'WORLD NOW' } });
  assert.equal(publishable(news, { phase: 1 }).length, 0);
});

test('PAY ATTENTION: a question from its round title to its reveal and the reaction, and the whole round', () => {
  const ms = detectMoments(QUIZ);
  const qs = ms.filter((m) => m.kind === 'quiz-question').sort((a, b) => a.from - b.from);
  assert.equal(qs.length, 2);
  assert.equal(qs[0].from, 1, 'the round opens on its title card');
  assert.equal(qs[0].to, 5, 'the reaction after the reveal is in');
  assert.equal(qs[1].from, 6);
  assert.deepEqual(qs[0].hook, ['HOW MANY?', 'PLAY ALONG']);
  assert.ok(qs[0].hookTall?.length === 1);
  assert.ok(qs[0].sources.includes('Euronews Business'));
  const round = ms.find((m) => m.kind === 'quiz-round');
  assert.ok(round && round.from === 1 && round.to === 8);
  for (const m of ms) assert.ok(m.light, 'the quiz is light');
});
