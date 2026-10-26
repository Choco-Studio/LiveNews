// The publishing desk's moments (server/publish/moments.js; docs/publishing/clips.md §2): found from the episode's own
// structure, starting on a sentence that stands alone, scored for sense and interest, light or grave by the channel's
// own measures, and only the light ones publishable in Phase 1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectMoments, publishable, hookLines, pickHook, placeRun, momentId, headlineHook, markCopied, ownHook, CLIP_MIN_SECONDS } from '../server/publish/moments.js';
import { estimateTimeline, buildTimeline } from '../server/publish/timeline.js';
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

test('a clip starts on the news, never on a running-order label (the first seconds decide the scroll)', () => {
  const tl = (text) => estimateTimeline({ segments: [S(text)] });
  assert.match(placeRun(tl('Thanks, UNIT-8. And finally: NASA names a new director for its Marshall centre.'), 0, 0).text, /^NASA names/);
  assert.match(placeRun(tl('Our number of the day: 2 million. A new console sold 2 million units in a week.'), 0, 0).text, /^2 million/);
  assert.match(placeRun(tl('Now, around the world in 30 seconds. Heavy rain has flooded streets in Kerala.'), 0, 0).text, /^Heavy rain/, 'a label alone is never the first sentence');
  assert.match(placeRun(tl('Now you can call anyone with WhatsApp, even without the app.'), 0, 0).text, /^Now you can call/, 'a "now" that is part of the sentence stays');
  assert.match(placeRun(tl('From Circuit Weekly: a chipmaker has unveiled a new laptop processor.'), 0, 0).text, /^From Circuit Weekly/, 'the attribution is never cut');
  // with the recording's word marks, the clip starts at the first word after the label
  const seg = { ...S('And finally: astronomers found water vapour on a distant planet.') };
  const text = seg.text;
  const at = (w) => text.indexOf(w);
  seg.audio = { duration: 4, words: ['And', 'finally:', 'astronomers', 'found', 'water'].map((w, i) => ({ char: at(w), len: w.length, t: i * 0.4 })) };
  const run = placeRun(buildTimeline({ segments: [seg] }, { events: [{ type: 'speak', v: 10, text }] }), 0, 0);
  assert.ok(run, 'the run is placed on the recording');
  assert.match(run.text, /^astronomers/);
  assert.ok(Math.abs(run.start - 10.8) < 0.05, `starts at the word: ${run.start}`);
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

test('PAY ATTENTION: a question from its frame to its reveal and the reaction, never from the round\'s card; the whole round from it', () => {
  const ms = detectMoments(QUIZ);
  const qs = ms.filter((m) => m.kind === 'quiz-question').sort((a, b) => a.from - b.from);
  assert.equal(qs.length, 2);
  // (shorts-v2.md A2: the round's card, its name and its rules, was the first four seconds of its first question)
  assert.equal(qs[0].from, 2, 'the round\'s first question opens on its own frame, not on the round\'s card');
  assert.equal(qs[0].quiz.opensRound, true);
  assert.equal(qs[0].to, 5, 'the reaction after the reveal is in');
  assert.equal(qs[1].from, 6);
  assert.deepEqual(qs[0].hook, ['HOW MANY?', 'PLAY ALONG']);
  assert.ok(qs[0].hookTall?.length === 1);
  assert.ok(qs[0].sources.includes('Euronews Business'));
  const round = ms.find((m) => m.kind === 'quiz-round');
  assert.ok(round && round.from === 1 && round.to === 8, 'the whole round still opens on its card');
  assert.equal(round.quiz.title, "2 questions from this week's news", 'its words: how many questions it plays');
  for (const m of ms) assert.ok(m.light, 'the quiz is light');
});

test('PAY ATTENTION: a HOW MANY? question asks what it counts, never its answer (scenes/quiz-ask.js)', async () => {
  const { askOf, askLines, askSentence } = await import('../public/js/scenes/quiz-ask.js');
  const { quizWords } = await import('../server/publish/moments.js');
  // the questions of 24 Oct
  const ponies = { type: 'howmany', masked: 'Tippbarlake Exmoor Pony Herd has about ▮▮▮ ponies, which are being gathered in Brendon Barton on Sunday, BBC Science reports.', figure: { value: '100', label: 'PONIES', qualifier: 'ABOUT', exact: false } };
  const webb = { type: 'howmany', masked: 'NASA’s Webb has revealed the wild weather of a mysterious world ▮▮ light-years away.', figure: { value: '20', label: 'LIGHT-YEARS', qualifier: '', exact: true } };
  const legion = { type: 'howmany', masked: 'The Legion Go S with SteamOS is a pretty solid alternative to the ▮▮▮▮ Steam Deck OLED, according to The Verge.', figure: { value: '$789', label: 'STEAM', qualifier: '', exact: true } };
  assert.deepEqual(askOf(ponies.figure), { ask: 'HOW MANY PONIES?', short: 'HOW MANY?', answer: 'ABOUT 100 PONIES', value: 'ABOUT 100', counted: 'PONIES' });
  assert.equal(askOf(webb.figure).ask, 'HOW MANY LIGHT-YEARS?');
  assert.equal(askOf(legion.figure).ask, 'HOW MUCH?', 'a sum is HOW MUCH?, whatever its label (STEAM, from "the $789 Steam Deck")');
  assert.equal(askOf({ value: '68.7%', label: 'NET PROFIT UP' }).short, 'WHAT PERCENT?');
  // a label that is no plain plural gives the round's own question
  for (const label of ['STEAM', 'MAGNITUDE', '-YEAR-OLD', 'NEWS', '', 'MILLION CONSOLES SOLD']) assert.equal(askOf({ value: '42', label }).ask, 'HOW MANY?', label);
  for (const label of ['RED SQUIRRELS', 'PASSENGERS A DAY', 'YEARS AGO', 'PEOPLE']) assert.equal(askOf({ value: '42', label }).ask, `HOW MANY ${label}?`, label);
  assert.equal(askOf({ value: 'many' }), null);
  // never the figure: no digit of the answer in the ask
  for (const q of [ponies, webb, legion]) assert.ok(!/\d/.test(askOf(q.figure).ask));
  // the board's lines at 2x in the glass's column (156 px), whole words, else null
  assert.deepEqual(askLines('HOW MANY PONIES?', 156), ['HOW MANY', 'PONIES?']);
  assert.equal(askLines('HOW MANY PASSENGERS A DAY?', 156), null, 'three lines: the board asks HOW MANY? instead');
  // the words for the posts: the counted words as the sentence writes them after its mask
  assert.equal(askSentence(askOf(webb.figure), webb.masked), 'How many light-years?');
  assert.equal(askSentence(askOf({ value: '3', label: 'EVS' }), 'it sold ▮ EVs last year'), 'How many EVs?');
  const w = quizWords(ponies);
  assert.equal(w.ask, 'How many ponies?');
  assert.match(w.title, /^How many ponies\? Tippbarlake Exmoor Pony Herd has about ___ ponies/);
  assert.ok(!/100/.test(JSON.stringify(w)), 'never the answer');
  assert.equal(quizWords(legion).ask, 'How much?');
  // the topic: the first name the board's words give, never the outlet, a day or a title case headline's words
  const { quizTopic } = await import('../public/js/scenes/quiz-ask.js');
  const topics = {
    'NASA’s Webb has revealed the wild weather of a mysterious world ___ light-years away.': 'NASA’s Webb',
    'Elon Musk reveals ‘world’s first flying car’': 'Elon Musk',
    'Tippbarlake Exmoor Pony Herd has about ___ ponies, which are being gathered in Brendon Barton on Sunday, BBC Science reports.': 'Exmoor Pony Herd',
    'The Legion Go S with SteamOS is a pretty solid alternative to the ___ Steam Deck OLED, according to The Verge.': 'Legion Go',
    'Taiwanese chip giant TSMC said on Thursday that net profit soared ___ to a record high in the third quarter.': 'TSMC',
    'Lufthansa is buying a 44.9% stake in TAP Air Portugal in a deal valued at ___ dollars.': 'TAP Air Portugal',
    'The new ___ HomePod mini with Siri AI and a ‘SoundGlow’ visual feature will be available starting October 30.': 'HomePod',
    'A barn owl and ___ chicks are ringed to see if conservation-focused farming is working, according to BBC Science.': '',
    'Apple Refreshes Its HomePod Mini With New Colors': '',
    'Two damselfly species return to restored woodland.': '',
    'Shares fell on Monday after the bank cut its forecast.': '',
  };
  for (const [text, topic] of Object.entries(topics)) assert.equal(quizTopic(text), topic, text);
  // the horizontal clip's hook: the question when it fits a line of the hook
  const ep = { ...QUIZ, segments: QUIZ.segments.map((s, i) => (i === 2 ? { ...s, quiz: { question: { ...s.quiz.question, masked: ponies.masked, figure: ponies.figure } } } : s)) };
  const q0 = detectMoments(ep).find((m) => m.kind === 'quiz-question' && m.from === 2);
  assert.deepEqual(q0.hook, ['HOW MANY PONIES?', 'PLAY ALONG']);
  assert.equal(q0.quiz.ask, 'How many ponies?');
});

test('a moment whose story copies its source is not publishable in any phase (the gate would hold its clip)', () => {
  const m = (id, storyIds) => ({ id, kind: 'story', storyIds, light: true, grave: false, scores: { sense: 9 } });
  const all = markCopied([m('a', ['s1']), m('b', ['s2']), m('c', ['s2', 's3'])], new Set(['s3']));
  for (const phase of [1, 2, 3]) assert.deepEqual(publishable(all, { phase }).map((x) => x.id), ['a', 'b'], `phase ${phase}`);
  assert.equal(all[2].refused, 'verbatim: its aired words copy the source');
  assert.equal(all[0].copied, undefined);
});

test('a moment whose story has no sources at hand is not publishable either (its words cannot be checked)', () => {
  const m = (id, storyIds) => ({ id, kind: 'story', storyIds, light: true, grave: false, scores: { sense: 9 } });
  const all = markCopied([m('a', ['s1']), m('b', ['s2'])], new Set(), { unverified: new Set(['s2']) });
  assert.deepEqual(publishable(all, { phase: 1 }).map((x) => x.id), ['a']);
  assert.equal(all[1].refused, 'verbatim: its sources are not at hand, its words cannot be checked');
});

test('a moment that shows a picture not cleared is never chosen nor queued, in any phase; nor any moment of a private preview', async () => {
  const { markUncleared, picturesShown } = await import('../server/publish/moments.js');
  const { auditItem } = await import('../server/compliance/credits.js');
  const cleared = (id) => ({ source: 'commons', licence: 'CC-BY-4.0', author: 'Jane Doe', url: `https://upload.wikimedia.org/${id}.jpg`, credit: 'FILE · JANE DOE · CC BY 4.0 · PIXELATED', label: 'FILE', cleared: true });
  const outlet = { source: 'outlet', licence: null, credit: 'BBC', cleared: false, why: "an outlet's own photo" };
  const episode = {
    segments: [
      { type: 'intro', text: 'Tonight.', teases: ['s2', 's3'] },
      { type: 'story', storyId: 's1', hasImage: true, imageRights: cleared('a') },
      { type: 'story', storyId: 's2', hasImage: true, imageRights: outlet, imageUncleared: true },
      { type: 'story', storyId: 's3', hasImage: false, stillToCome: [{ storyId: 's2' }] },
      { type: 'story', storyId: 's4', hasImage: false },
    ],
    rundown: [{ storyId: 's1', hasImage: true, imageRights: cleared('a') }, { storyId: 's2', hasImage: true, imageRights: outlet, imageUncleared: true }, { storyId: 's3', hasImage: false }],
  };
  // what each part shows: the montage's teased stories, a story's own picture, a STILL TO COME's
  assert.deepEqual(picturesShown(episode, 0, 0).map((x) => x.storyId), ['s2']);
  assert.deepEqual(picturesShown(episode, 1, 1).map((x) => x.storyId), ['s1']);
  assert.deepEqual(picturesShown(episode, 3, 3).map((x) => x.storyId), ['s2']);
  assert.deepEqual(picturesShown(episode, 4, 4), []);
  const m = (id, from, to) => ({ id, kind: 'story', from, to, storyIds: [], light: true, grave: false, scores: { sense: 9 } });
  for (const audit of [auditItem, null]) {
    const all = markUncleared([m('open', 0, 0), m('s1', 1, 1), m('s2', 2, 2), m('tease', 3, 3), m('plain', 4, 4)], episode, { audit });
    for (const phase of [1, 2, 3]) assert.deepEqual(publishable(all, { phase }).map((x) => x.id), ['s1', 'plain'], `phase ${phase}${audit ? '' : ' (no audit)'}`);
    assert.match(all[2].refused, /^pictures: a picture not cleared for publication \(story s2\)/);
  }
  // PAY ATTENTION's PICTURE THIS: the archived story's picture with the record it aired with (none: refused; and the
  // gate's own audit counts it too)
  const pic = (imageRights) => ({ type: 'quiz', part: 'frame', text: 'Which headline goes with this picture?', quiz: { round: 'picture', question: { type: 'picture', key: 'k1', imageId: 'a1', image: 'https://upload.wikimedia.org/x.jpg', ...(imageRights ? { imageRights } : {}), aired: { source: 'BBC News' } } } });
  const quiz = { segments: [pic(null), pic(cleared('x'))], rundown: [] };
  const qs = markUncleared([m('bare', 0, 0), m('cleared', 1, 1)], quiz, { audit: auditItem });
  assert.deepEqual(qs.map((x) => !!x.uncleared), [true, false]);
  assert.equal(auditItem({ segments: [pic(null)] }).missing.filter((a) => a.kind === 'picture').length, 1);
  assert.equal(auditItem({ segments: [pic(cleared('x'))] }).missing.length, 0);
  // a private preview: nothing from it is ever published, whatever it shows
  const preview = markUncleared([m('s1', 1, 1), m('plain', 4, 4)], { ...episode, picturePreview: true }, { audit: auditItem });
  assert.equal(publishable(preview, { phase: 3 }).length, 0);
  assert.match(preview[1].refused, /private preview/);
});

test('a clip\'s burned-in title is never the outlet\'s headline passed off as the channel\'s (ownHook)', () => {
  const title = 'Evacuation orders as fast-moving California wildfire burns homes';
  const sources = [title, 'Evacuation orders in California are in effect due to a rapidly growing wildfire.'];
  const story = { kicker: 'WILDFIRE', location: { place: 'CALIFORNIA, USA' } };
  const copied = { headline: title, hook: headlineHook(title), programme: 'COSMOS DESK' };
  assert.deepEqual(ownHook(copied, story, sources), ['WILDFIRE:', 'CALIFORNIA, USA']);
  // the channel's own headline stays; a kind's own hook stays; nothing to check against: as it was
  const own = { headline: 'Thirteen fires burn across California as winds rise', hook: headlineHook('Thirteen fires burn across California as winds rise'), programme: 'COSMOS DESK' };
  assert.deepEqual(ownHook(own, story, sources), own.hook);
  const kind = { headline: title, hook: ['4 STORIES', 'IN 55 SECONDS'], programme: 'COSMOS DESK' };
  assert.deepEqual(ownHook(kind, story, sources), kind.hook);
  assert.deepEqual(ownHook(copied, story, []), copied.hook);
  // no label the story bears out: the longest run of the things it names, never the headline (and never the programme's
  // name, which says nothing of the clip: the owner's COSMOS shorts titled COSMOS DESK)
  assert.deepEqual(ownHook(copied, { kicker: 'VOLCANO' }, sources), ['CALIFORNIA', 'WILDFIRE']);
  // nothing named twice over: the programme's name
  const bare = 'Fire forces families out as it spreads';
  assert.deepEqual(ownHook({ ...copied, headline: bare, hook: headlineHook(bare) }, { kicker: 'VOLCANO' }, [bare, `${bare} across the valley.`]), ['COSMOS DESK']);
});

test('the 10-second floor: a moment shorter than YouTube\'s and TikTok\'s minimum is never published (round 7: a 3-second story)', () => {
  const m = (id, duration) => ({ id, kind: 'story', storyIds: [id], light: true, grave: false, duration, scores: { sense: 8 } });
  const all = [m('short', 3.22), m('edge', 10), m('long', 24.8), m('unknown', undefined)];
  assert.equal(CLIP_MIN_SECONDS, 10);
  for (const phase of [1, 2, 3]) assert.deepEqual(publishable(all, { phase }).map((x) => x.id), ['edge', 'long', 'unknown'], `phase ${phase}`);
});
