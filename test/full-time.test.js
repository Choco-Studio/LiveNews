import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { balance, leansOnCount, prepareStory, sameEvent, together } from '../server/sport/prepare.js';
import { shapeEpisode } from '../server/sport/shape.js';
import { headlineContradicts, scorelinesIn } from '../server/sport/scores.js';
import { notSport, sportApart } from '../server/sport/desk.js';
import { withoutJudgement } from '../server/sport/words.js';
import { isGrave } from '../server/facts.js';
import { isNavRun } from '../server/transcript.js';
import { hasFiniteVerb, trimClause } from '../server/writer.js';
import { NewsDesk } from '../server/news.js';
import { Producer } from '../server/producer.js';
import { ProviderChain } from '../server/providers/index.js';
import { createMockProvider } from '../server/providers/mock.js';
import { loadChannel } from '../server/channel.js';

// FULL TIME's writing stages (docs/programmes/full-time.md §3–5): the stories made ready before a writer sees them, the
// running order's balance, and the shape after the writer. Sentences from the sport feeds of 13 Oct and the offline
// fixture desk (config/fixtures/sport.xml, fictional clubs).

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const silent = { info() {}, warn() {}, error() {}, log() {} };
const NOW = Date.parse('2026-10-13T09:00:00Z');
const story = (id, title, summary, extra = {}) => ({ id, title, summary, link: `https://www.bbc.co.uk/sport/football/articles/${id}`, source: 'BBC Sport', published: NOW - 3600_000, category: 'sport', ...extra });

describe('FULL TIME: the stories made ready', () => {
  test('a headline and a copy that name different results: the story is not told (Sky Sports, 13 Oct)', () => {
    const copy = 'Josh Allen racked up 331 total yards and two touchdowns, while Tyler Bass drilled a 45-yard field goal with 1:55 remaining in overtime after Greg Rousseau blocked a field goal attempt, lifting the Buffalo Bills to a thrilling 37-34 victory over the Los Angeles Chargers on Monday night.';
    const sl = scorelinesIn([copy], 'american-football', copy);
    assert.deepEqual(sl.map((x) => `${x.a} ${x.sa}-${x.sb} ${x.b}`), ['Buffalo Bills 37-34 Los Angeles Chargers']);
    assert.equal(headlineContradicts('Allen has monster day as Bills beat Rams in overtime thriller', sl), true);
    assert.equal(headlineContradicts('Coventry thump Newcastle for first home win', [{ a: 'Coventry', b: 'Newcastle', winner: 'Coventry', sa: 4, sb: 1 }]), false);
    assert.equal(headlineContradicts('Newcastle thump Coventry', [{ a: 'Coventry', b: 'Newcastle', winner: 'Coventry', sa: 4, sb: 1 }]), true, 'the winner the other way round');
    const s = prepareStory({ ...story('bills', 'Allen has monster day as Bills beat Rams in overtime thriller', `${copy} Allen passed for 210 yards.`), link: 'https://www.skysports.com/nfl/news/1' }, { now: NOW });
    assert.equal(s, null);
  });

  test('a sentence that points back to one that went goes with it; an "also" with nothing to add to loses the word', () => {
    // "That was despite topping the table since September…" (Sky Sports 13 Oct) after a sentence the desk dropped
    const s = prepareStory(story('hearts', 'Bloom reiterates Hearts title ambition', 'Tony Bloom has reiterated that he would be "really disappointed" if Hearts fail to win the Scottish Premiership within a decade. Read more on the Sky Sports app. That was despite topping the table since September. Brad Smith also returns to the squad after injury.'), { now: NOW });
    assert.doesNotMatch(s.summary, /That was despite/);
    assert.doesNotMatch(s.summary, /Sky Sports app/);
    assert.match(s.summary, /Brad Smith returns to the squad/);
    // "He was named the Finals' Most Valuable Player in all six" stands only straight after the sentence with its six
    assert.equal(leansOnCount("He was named the Finals' Most Valuable Player in all six.", 'Jordan wore the Chicago Bulls jersey during game two of the 1998 NBA Finals.'), true);
    assert.equal(leansOnCount("He was named the Finals' Most Valuable Player in all six.", 'He ended his last season with the Bulls with his sixth and final NBA Championship.'), false);
  });

  test("the outlets' verdicts go: an adverb on an act, a team by name, a comparative, a verdict noun, a state", () => {
    assert.equal(withoutJudgement('Mfuni superbly added a fourth.'), 'Mfuni added a fourth.');
    assert.equal(withoutJudgement('A stunning Sven Botman strike had given Newcastle hope.'), 'A Sven Botman strike had given Newcastle hope.');
    assert.equal(withoutJudgement('The team produced a brilliant late winner.'), 'The team produced a late winner.');
    for (const t of ['A wasteful Newcastle lost at Coventry despite having 19 shots.', "Botman's goal, however, was even better as he thundered home.", 'Coventry then punished their profligacy.', 'Mfuni hit his first senior goal to cap off a fine evening for the side.', 'The visitors made a nightmare start.', 'He played poorly.', 'Max King starts following another impressive season in Australia.']) {
      assert.equal(withoutJudgement(t), null, t);
    }
    assert.equal(withoutJudgement('Coventry made it back-to-back wins with a thumping 4-1 home victory over Newcastle.'), 'Coventry made it back-to-back wins with a thumping 4-1 home victory over Newcastle.', 'words about a result alone stay');
    assert.equal(withoutJudgement('"It was a brilliant goal," Lampard said.'), '"It was a brilliant goal," Lampard said.', "inside a quotation, the speaker's words");
  });

  test('never airs: transfer talk (American spelling too), an interview feature, a piece that "looks at how"', () => {
    const why = (title, summary = '', link = 'https://www.espn.com/soccer/story/_/id/1') => notSport({ title, summary, link }, NOW);
    assert.equal(why('Transfer rumors, news: Barcelona, Real Madrid keep tabs on Haaland', 'Barcelona and Real Madrid continue to keep tabs on Erling Haaland.'), 'gossip or the papers');
    assert.equal(why('Viking’s two head coaches on Champions League adventure: ‘For us, it’s the best team in the world’', '“When we recruit players, we say something bold.” The morning’s training session has finished.'), 'interview feature');
    assert.equal(why('The star is Luis Enrique - inside the plans to keep PSG on top', 'As Luis Enrique bids to guide PSG to a third successive Champions League triumph, Guillem Balague looks at how the coach keeps his side at the top.'), 'analysis, list or listing');
    assert.equal(why('Arsenal sweat over Saka fitness', 'Arsenal are monitoring Saka after he limped off.'), null, 'monitoring an injury is not a rumour');
  });

  test("sport's own senses are not grave news; a death stays grave", () => {
    assert.equal(isGrave('Lille considering legal action after Santos injury. Defender Tiago Santos suffered a knee injury from a tackle.'), false);
    assert.equal(isGrave('Haaland fires City to victory'), false);
    assert.equal(isGrave('Arsenal sweat over Saka hamstring injury'), false);
    assert.equal(isGrave('Footballer dies after collapsing on the pitch.'), true);
    assert.equal(isGrave('Striker injured in car crash'), true);
  });

  test('the desk keeps sentences a menu-cleaner or a list once lost', () => {
    assert.equal(isNavRun('Bitport Athletic host Copperfold Town on Saturday.'), false, 'a fixture is news, not a menu');
    assert.equal(isNavRun('Home News Sport Weather iPlayer Sounds Bitesize CBeebies'), true);
    assert.equal(hasFiniteVerb('teenager Sidiki Cherif and substitutes Ellis Simms'), false, 'substitutes before a name is a role');
    assert.equal(trimClause('Goals from Jack Rudoni, teenager Sidiki Cherif and substitutes Ellis Simms and Stephen Mfuni gave the Sky Blues their first home win of the season.', 22, 8), null, 'never cut into a list with no verb left');
  });
});

describe('FULL TIME: the running order', () => {
  const prep = (s) => ({ sport: 'football', scorelines: [], fixtures: [], ...s });
  test('two stories about one match are one event; a women\'s and a men\'s match, two scores or a preview are not', () => {
    const cov = prep({ id: 'c', title: 'Coventry thump Newcastle for first home win', scorelines: [{ a: 'Coventry', b: 'Newcastle' }] });
    const jai = prep({ id: 'j', title: "Jaissle sorry for Coventry loss as Carra says Newcastle 'beaten up' again" });
    const pix = prep({ id: 'p', title: 'Pixelburg United beat Bitport Athletic 3-1 to go top of the Pixel League' });
    const oka = prep({ id: 'o', title: 'Bitport manager Okafor apologises to fans after defeat at Pixelburg' });
    const wom = prep({ id: 'w', title: 'Pixelburg United Women beat Bitport Athletic Women 2-0', womens: true });
    assert.equal(sameEvent(cov, jai), true);
    assert.equal(sameEvent(pix, oka), true, '"Bitport" is "Bitport Athletic"');
    assert.equal(sameEvent(pix, wom), false);
    assert.equal(sameEvent(cov, { ...jai, sport: 'rugby' }), false);
    assert.deepEqual(together([cov, pix, jai, oka]).map((s) => s.id), ['c', 'j', 'p', 'o']);
    assert.equal(sportApart({ title: 'Pixelburg United Women beat Starfield City Women 2-0' }, { title: 'Pixelburg United beat Starfield City 3-1' }), true);
    assert.equal(sportApart({ title: 'Coventry thump Newcastle', summary: 'Coventry beat Newcastle 4-1.' }, { title: 'Jaissle sorry', summary: 'Jaissle apologised after the 4-1 loss at Coventry.' }), false);
    assert.equal(sportApart({ title: 'Pixelburg United beat Quaywick Albion 2-0', summary: 'United won 2-0.' }, { title: 'Pixelburg United and Quaywick Albion meet with top spot at stake', summary: 'Pixelburg United will host Quaywick Albion on Saturday.' }), true);
  });

  test('the lead is the story most told; football at most half; three sports when the desk has them', () => {
    const list = [
      prep({ id: 'lewis', title: 'Lewis left out of England’s World Cup opener', sport: 'rugby' }),
      prep({ id: 'cov', title: 'Coventry thump Newcastle for first home win', scorelines: [{ a: 'Coventry', b: 'Newcastle' }] }),
      prep({ id: 'f1', title: 'Arsenal beat Spurs 2-0' }),
      prep({ id: 'jai', title: "Jaissle sorry for Coventry loss as Carra says Newcastle 'beaten up' again" }),
      prep({ id: 'f2', title: 'Lille considering legal action after Santos injury' }),
      prep({ id: 'f3', title: 'Bloom reiterates Hearts title ambition' }),
      prep({ id: 'f4', title: 'Asian Cup concerns grow' }),
      prep({ id: 'f5', title: 'Glimmerford reach quarter-finals' }),
      prep({ id: 'f6', title: 'Quaywick thrash Copperfold' }),
      prep({ id: 'cr', title: 'Renshaw stars as Australia close in', sport: 'cricket' }),
      prep({ id: 'f7', title: 'Northgate win at Saltmarsh' }),
      prep({ id: 'mlb', title: 'Contreras powers Brewers to 2-0 NLCS lead', sport: 'baseball' }),
    ];
    const out = balance(list, { count: 8 });
    assert.equal(out[0].id, 'cov', 'the match told twice leads');
    assert.equal(out[1].id, 'jai', 'its reaction straight after');
    const top = out.slice(0, out.edition);
    assert.ok(out.edition >= 5 && out.edition <= 8);
    assert.ok(top.filter((s) => s.sport === 'football').length <= 4, 'football at most half');
    assert.ok(new Set(top.map((s) => s.sport)).size >= 3, 'three sports');
    assert.equal(balance(list, { count: 8, ledLately: (id) => id === 'cov' })[0].id !== 'cov', true, 'never the lead of the last three hours');
  });
});

describe('FULL TIME: the shape', () => {
  const presenters = { A: { name: 'Kai Sprite' }, B: { name: 'Rosa Rally' } };
  const program = { title: 'FULL TIME', headlineMax: 45 };
  const cand = (id, title, sport, summary, extra = {}) => ({ id, title, sport, summary, scorelines: [], fixtures: [], source: 'Pixelburg Sport', published: NOW - 3600_000, sportTag: sport.toUpperCase(), ...extra });
  const candidates = [
    cand('lead', 'Pixelburg United beat Bitport Athletic 3-1', 'football', 'Pixelburg United beat Bitport Athletic 3-1 at the Riverside Ground. United are now top.', { scorelines: [{ a: 'Pixelburg United', b: 'Bitport Athletic', sa: 3, sb: 1, winner: 'Pixelburg United', sport: 'football' }] }),
    cand('rugby', 'Harbourside Hawks beat Millbrook Foxes', 'rugby', 'Harbourside Hawks beat Millbrook Foxes 24-17. The Hawks are unbeaten in six games.'),
    cand('oka', 'Bitport manager Okafor apologises to fans after defeat at Pixelburg', 'football', 'Bitport Athletic manager Amara Okafor has apologised to the fans.'),
    cand('cricket', 'Menon century puts Coastlanders on course', 'cricket', 'Opener Ravi Menon made 141 as the Coastlanders took control.'),
    cand('res', 'Northgate County win at Saltmarsh', 'football', 'Northgate County beat Saltmarsh 3-2.', { scorelines: [
      { a: 'Northgate County', b: 'Saltmarsh', sa: 3, sb: 2, winner: 'Northgate County', loser: 'Saltmarsh', verb: 'beat', sport: 'football', published: NOW - 3600_000, storyId: 'res' },
      { a: 'Brightwater Wanderers', b: 'Kestrel Vale', sa: 0, sb: 0, draw: true, sport: 'football', published: NOW - 3600_000, storyId: 'res' },
      { a: 'Millbrook', b: 'Ashcombe', sa: 2, sb: 1, winner: 'Millbrook', loser: 'Ashcombe', verb: 'beat', sport: 'football', published: NOW - 3600_000, storyId: 'res' },
    ], fixtures: [
      { event: 'STARFIELD CITY V GLIMMERFORD', when: 'WEDNESDAY', date: '2026-10-14', sport: 'football', storyId: 'res' },
      { event: 'BITPORT COMETS V LANTERNHILL LYNX', when: 'THURSDAY', date: '2026-10-15', sport: 'basketball', storyId: 'res' },
    ] }),
  ];
  const episode = () => ({
    segments: [
      { type: 'intro', anchor: 'A', text: 'Pixelburg United beat Bitport Athletic 3-1. Harbourside Hawks beat Millbrook Foxes. Bitport manager Okafor apologises to fans. Good morning, and welcome to FULL TIME.', cues: [] },
      { type: 'story', anchor: 'A', storyId: 'lead', headline: 'Pixelburg United beat Bitport Athletic 3-1', text: 'Pixelburg United beat Bitport Athletic 3-1 at the Riverside Ground. United are now top. Rosa?', cues: [] },
      { type: 'story', anchor: 'B', storyId: 'rugby', headline: 'Harbourside Hawks beat Millbrook Foxes', text: 'Harbourside Hawks beat Millbrook Foxes 24-17. The Hawks are unbeaten in six games.', cues: [] },
      { type: 'chat', anchor: 'A', text: 'Still to come: Menon century puts Coastlanders on course.', cues: [] },
      { type: 'story', anchor: 'A', storyId: 'oka', headline: 'Bitport manager Okafor apologises to fans', text: 'Thanks, Rosa. Bitport Athletic manager Amara Okafor has apologised to the fans.', cues: [] },
      { type: 'story', anchor: 'B', storyId: 'cricket', headline: 'Menon century puts Coastlanders on course', text: 'Opener Ravi Menon made 141 as the Coastlanders took control.', cues: [] },
      { type: 'outro', anchor: 'A', text: 'That is FULL TIME.', cues: [] },
    ],
  });

  test('the same match told together; the sports in groups; hand-overs where the sport and the presenter change', () => {
    const ep = episode();
    const note = shapeEpisode(ep, { candidates, program, presenters, now: NOW, tz: 'Europe/London', seed: 't' });
    const stories = ep.segments.filter((s) => s.type === 'story' && !s.feature);
    assert.deepEqual(stories.map((s) => s.storyId), ['lead', 'oka', 'rugby', 'cricket']);
    const oka = stories[1];
    assert.ok(oka.follows);
    assert.doesNotMatch(oka.text, /Thanks, Rosa/, 'the writer\'s pick-up was for its own order');
    assert.match(oka.text, /^(?:Staying with that story|More on that now|There is more on that one|Staying with that one|And there is more on that|More from that one)\./);
    assert.doesNotMatch(stories[0].text, /Rosa\?/, 'the writer\'s toss goes');
    // the rugby is Rosa's after Kai's football: Kai hands it over by name, and Rosa needs no "Rugby now"
    assert.match(oka.text, /(?:Rosa has the rugby|Over to Rosa for the rugby|Rosa now, with the rugby|Here's Rosa with the rugby)\./);
    assert.doesNotMatch(stories[2].text, /^(?:Rugby now|To the rugby|In rugby|Some rugby|On to the rugby|Rugby next)\./);
    // three different stories in the headlines, never the match and its reaction both
    assert.doesNotMatch(ep.segments[0].text, /Okafor/);
    assert.match(ep.segments[0].text, /Menon century/);
    // the signpost promised the cricket, which still comes later (not the very next story) or it goes
    const sign = ep.segments.findIndex((s) => /Still to come/.test(s.text || ''));
    if (sign >= 0) assert.ok(ep.segments.slice(sign + 2).some((s) => s.storyId === 'cricket'));
    assert.equal(note.results, 3);
    const sc = ep.segments.find((s) => s.feature === 'scores');
    assert.deepEqual(sc.scores.map((r) => `${r.a} ${r.sa}-${r.sb} ${r.b}`), ['Northgate County 3-2 Saltmarsh', 'Brightwater Wanderers 0-0 Kestrel Vale', 'Millbrook 2-1 Ashcombe']);
    assert.match(sc.text, /Northgate County beat Saltmarsh 3-2\. Brightwater Wanderers drew 0-0 with Kestrel Vale\. Millbrook beat Ashcombe 2-1\./);
    const cu = ep.segments.find((s) => s.feature === 'fixtures');
    assert.match(cu.text, /Tomorrow, it's Starfield City against Glimmerford\. And on Thursday, Bitport Comets against Lanternhill Lynx\./);
    assert.equal(stories[0].score?.sa, 3, 'the lead says its result: its scoreline card');
  });

  test('SCORE CENTRE in MATCHDAY comes after the lead and the story that follows it on', () => {
    const ep = episode();
    const sat = Date.parse('2026-10-17T18:00:00Z');
    const c = candidates.map((s) => ({ ...s, published: sat - 3600_000, scorelines: s.scorelines.map((r) => ({ ...r, published: sat - 3600_000 })) }));
    shapeEpisode(ep, { candidates: c, program, presenters, now: sat, tz: 'Europe/London', seed: 's' });
    const ids = ep.segments.map((s) => s.feature === 'scores' ? 'SCORES' : s.storyId).filter(Boolean);
    assert.deepEqual(ids.slice(0, 3), ['lead', 'oka', 'SCORES']);
  });

  test('THE NUMBER is Rosa\'s, with no scoreline card; a result it says is not read again in SCORE CENTRE', () => {
    const ep = episode();
    ep.segments.splice(5, 0, { type: 'story', anchor: 'A', storyId: 'res', feature: 'number', headline: 'Northgate County win at Saltmarsh', text: 'Our number of the day: 6,000. Northgate County beat Saltmarsh 3-2. [B:nod]', cues: [] });
    shapeEpisode(ep, { candidates, program, presenters, now: NOW, tz: 'Europe/London', seed: 'n' });
    const num = ep.segments.find((s) => s.feature === 'number');
    assert.equal(num.anchor, 'B');
    assert.equal(num.score, undefined);
    assert.ok(!(ep.segments.find((s) => s.feature === 'scores')?.scores || []).some((r) => r.a === 'Northgate County'));
  });
});

describe('FULL TIME: an edition from the offline desk (a draft until it airs)', () => {
  test('the stages run; the edition has its lead, THE BREAKDOWN, SCORE CENTRE, COMING UP and the moment; nobody is judged', async () => {
    const feeds = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/feeds.fixture.json'), 'utf8')).map((f) => ({ ...f, url: path.join(ROOT, f.url) }));
    const desk = new NewsDesk({ log: silent, fetchImpl: async (u) => assert.fail(`network access to ${u}`) });
    desk.loadFeeds = () => feeds;
    await desk.refresh();
    const channel = loadChannel(undefined, { drafts: true });
    assert.ok(!loadChannel().programs['full-time'], 'not on air yet: a draft');
    assert.ok(!channel.rotation.includes('full-time'));
    const chain = new ProviderChain([createMockProvider()], { record() {} }, { log: silent });
    const producer = new Producer({ config: { candidatePool: 12, minNewStories: 3, reviewPass: false }, newsDesk: desk, chain, log: silent });
    const ep = await producer.produce(channel, 'full-time');
    assert.ok(ep, 'an edition');
    assert.deepEqual(ep.pipeline.map((p) => p.stage).filter((s) => ['sport-desk', 'write', 'sport'].includes(s)), ['sport-desk', 'write', 'sport']);
    const segs = ep.segments;
    const stories = segs.filter((s) => s.type === 'story');
    assert.ok(stories.length >= 8, `${stories.length} stories`);
    assert.equal(stories[0].score?.a, 'Pixelburg United', 'the lead with its scoreline card');
    assert.equal(segs[segs.indexOf(stories[0]) + 1].type, 'chat', 'THE BREAKDOWN after the lead');
    assert.ok(segs.some((s) => s.feature === 'scores' && s.scores.length >= 3), 'SCORE CENTRE');
    assert.ok(segs.some((s) => s.feature === 'fixtures' && s.fixtures.length >= 2), 'COMING UP');
    assert.ok(segs.some((s) => s.kicker === 'MOMENT OF THE DAY'), 'the moment of the day');
    assert.ok(segs.filter((s) => s.type === 'chat').length <= 10);
    assert.ok(new Set(stories.map((s) => s.sport).filter(Boolean)).size >= 3, 'three sports');
    const all = segs.map((s) => s.text).join(' ');
    assert.doesNotMatch(all.replace(/"[^"]*"/g, ' '), /\b(?:brilliant|stunning|superb|woeful|dismal|poor|sloppy|wasteful|impressive)\b/i);
    assert.doesNotMatch(stories.map((s) => s.text).join(' '), /\bRosa\?|\bKai\?/, 'no toss left from the writer\'s order');
    // every scoreline on a board is a sentence of its story
    for (const s of stories.filter((x) => x.score)) {
      const src = desk.get(s.storyId);
      assert.ok(new RegExp(`${s.score.sa}\\s*[-–]\\s*${s.score.sb}`).test(`${src.title} ${src.summary}`), s.headline);
    }
  });
});
