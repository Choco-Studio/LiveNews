import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { balance, leansOnCount, prepareStory, sameEvent, together } from '../server/sport/prepare.js';
import { BANKS, ROSA_MEMORIES, ROSA_NEEDLES, cutMidThought, fullNames, shapeEpisode, wholeThought } from '../server/sport/shape.js';
import { chalkOf, headlineContradicts, scorelinesIn } from '../server/sport/scores.js';
import { notSport, sportApart } from '../server/sport/desk.js';
import { withoutJudgement } from '../server/sport/words.js';
import { isGrave, sentencesIn } from '../server/facts.js';
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
    assert.equal(why('Christian Pulisic is no longer a focal point for the US or Milan – and that’s OK', 'The winger is 28, and younger teammates are rising into the high-pressure spots he has usually occupied.'), 'column or opinion', 'a headline that ends on its writer\'s verdict');
    assert.equal(why('Why Arteta keeps faith in a back three', 'Arsenal have used three centre-backs in four games.'), 'column or opinion');
    assert.equal(why('Coventry beat Newcastle - and stay top', 'Coventry beat Newcastle 4-1.'), null, 'a dash and "and" is not a verdict');
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

  test('any other sport a quarter of the edition at most: three rugby stories of twelve, not four in a row', () => {
    const rugby = ['Lewis left out of World Cup opener', 'Smith insists England have winner mentality', 'Saracens sack player after fracas', 'Four Super League clubs back NRL deal', 'Wales name squad for Tonga Test'].map((title, i) => prep({ id: `r${i}`, title, sport: 'rugby' }));
    const others = ['Norris accepts blame for collision', 'Renshaw stars in Durban', 'Suljovic faces darts probe', 'Fury and Joshua title fight confirmed', 'Vela wins Pixelburg Open', 'Bloom backs Hearts', 'Coventry thump Newcastle', 'Quist breaks 400m record'].map((title, i) => prep({ id: `o${i}`, title, sport: ['f1', 'cricket', 'darts', 'boxing', 'tennis', 'football', 'football', 'athletics'][i] }));
    const out = balance([...rugby, ...others], { count: 12 });
    assert.equal(out.slice(0, out.edition).filter((s) => s.sport === 'rugby').length, 3);
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
    assert.ok(BANKS.follow.some((l) => oka.text.startsWith(l)), oka.text);
    assert.doesNotMatch(stories[0].text, /Rosa\?/, 'the writer\'s toss goes');
    // Kai the lead, then in turn: Rosa the story that follows it on, Kai the rugby, Rosa the cricket
    assert.deepEqual(stories.map((s) => s.anchor), ['A', 'B', 'A', 'B']);
    // the rugby is Kai's after Rosa's football: she hands it over by name, and Kai needs no "Rugby now"
    const handed = (n, sport) => new RegExp(`(?:${BANKS.handover.map((l) => l.replace('{N}', n).replace('{S}', sport).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`);
    assert.match(oka.text, handed('Kai', 'the rugby'));
    assert.doesNotMatch(stories[2].text, /^(?:Rugby now|To the rugby|In rugby|Some rugby|On to the rugby|Rugby next)\./);
    // never two hand-overs by name in a row (step 7: five in a row were a relay of tosses): Rosa takes the cricket up
    // in her own words
    assert.doesNotMatch(stories[2].text, handed('Rosa', 'the cricket'));
    assert.ok(BANKS.transition.cricket.some((l) => stories[3].text.startsWith(l)), stories[3].text);
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

describe('FULL TIME: the light touches', () => {
  const presenters = { A: { name: 'Kai Sprite' }, B: { name: 'Rosa Rally' } };
  const cand = (id, title, summary) => ({ id, title, sport: 'football', summary, scorelines: [], fixtures: [], source: 'Pixelburg Sport', published: NOW - 3600_000, sportTag: 'FOOTBALL' });
  const edition = (last) => ({
    segments: [
      { type: 'intro', anchor: 'A', text: 'Harbour Cup draw made. Good morning, and welcome to FULL TIME.', cues: [] },
      { type: 'story', anchor: 'A', storyId: 'a', headline: 'Harbour Cup draw made', text: 'Glimmerford will meet Lanternhill in the quarter-finals of the Harbour Cup.', cues: [] },
      { type: 'story', anchor: 'B', storyId: 'b', headline: last.title, text: last.summary, cues: [] },
      { type: 'outro', anchor: 'A', text: 'That is FULL TIME.', cues: [] },
    ],
  });
  const lines = (ep) => ep.segments.filter((x) => x.type === 'chat').map((x) => x.text);
  const all = [...ROSA_MEMORIES, ...ROSA_NEEDLES];

  test('an edition without a moment still has one of Rosa\'s memories or needles before the sign-off, its gestures read', () => {
    const last = cand('b', 'Quaywick Albion open new training ground', 'Quaywick Albion have opened a new training ground.');
    const ep = edition(last);
    shapeEpisode(ep, { candidates: [cand('a', 'Harbour Cup draw made', 'Glimmerford will meet Lanternhill in the quarter-finals.'), last], program: { title: 'FULL TIME' }, presenters, now: NOW, tz: 'Europe/London', seed: 'm' });
    const chat = lines(ep);
    assert.ok(all.some((p) => chat.includes(p[0].replace(/\[[^\]]*\]\s*/g, ''))), chat.join(' | '));
    assert.ok(chat.every((t) => !/\[/.test(t)), 'no stage direction left in the words');
    assert.equal(ep.segments.at(-1).type, 'outro');
    assert.equal(ep.segments.at(-2).type, 'chat');
  });

  test('never after a serious story: a misconduct charge, a court, a ban, a death', () => {
    for (const [title, summary] of [['Darts player faces probe over sexist comments', 'He has been referred to the regulator.'], ['Former striker dies aged 70', 'Tributes have been paid.'], ['Captain banned for six matches', 'The ban was confirmed on Monday.']]) {
      const last = cand('b', title, summary);
      const ep = edition(last);
      shapeEpisode(ep, { candidates: [cand('a', 'Harbour Cup draw made', 'Glimmerford will meet Lanternhill.'), last], program: { title: 'FULL TIME' }, presenters, now: NOW, tz: 'Europe/London', seed: 'g' });
      assert.ok(!lines(ep).some((t) => all.some((p) => t === p[0].replace(/\[[^\]]*\]\s*/g, ''))), title);
    }
  });

  test('the banks are deep enough for a day of editions (none repeats within six hours)', () => {
    assert.ok(Object.values(BANKS.hello).flat().length >= 12 && ROSA_MEMORIES.length >= 12 && ROSA_NEEDLES.length >= 12);
    for (const part of ['morning', 'afternoon', 'evening']) assert.ok(BANKS.hello[part].length + BANKS.hello.any.length >= 12, part);
    for (const part of ['morning', 'afternoon', 'evening']) assert.ok(BANKS.greeting[part].length >= 6 && BANKS.signoff[part].length >= 6, part);
    for (const shape of ['MATCHDAY', 'MIDWEEK']) assert.ok(BANKS.results[shape].length >= 8, shape);
    // no real club, player or number in Rosa's stories
    for (const [a, b] of all) assert.doesNotMatch(`${a} ${b}`, /\d|United|City|Rovers|Arsenal|Chelsea|Liverpool|Madrid|Barcelona/);
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

describe('FULL TIME: THE MOMENT ON THE BOARD', () => {
  test('the distance of a goal or a kick that scored, as said on air; nothing for a miss, a run, a pass, two distances or another sport', () => {
    assert.deepEqual(chalkOf('Mfuni curled in from 30 yards to seal it.', 'football'), { yards: 30, sport: 'football' });
    assert.deepEqual(chalkOf('From thirty yards, he found the top corner.', 'football'), { yards: 30, sport: 'football' });
    assert.deepEqual(chalkOf('Rice scored a 25-yard strike.', 'football'), { yards: 25, sport: 'football' });
    assert.deepEqual(chalkOf('He converted from the spot in the 90th minute.', 'football'), { yards: 12, sport: 'football', label: 'THE PENALTY SPOT' });
    assert.deepEqual(chalkOf('Bass kicked a 45-yard field goal as time expired.', 'american-football'), { yards: 45, sport: 'american-football' });
    assert.deepEqual(chalkOf('Farrell landed a penalty from 45 metres.', 'rugby'), { metres: 45, sport: 'rugby' });
    assert.deepEqual(chalkOf('Russell kicked a 40m penalty.', 'rugby'), { metres: 40, sport: 'rugby' });
    for (const [text, sport] of [
      ['He missed from the spot.', 'football'],
      ['His 52-yard field goal was blocked.', 'american-football'],
      ['Smith ran 45 yards for a touchdown.', 'american-football'],
      ['He passed from 40 yards to set up the goal.', 'football'],
      ['The keeper was beaten from 40 yards.', 'football'],
      ['He scored from 20 yards and then from 25 yards.', 'football'],
      ['A 75-yard field goal and a 45-yard field goal.', 'american-football'],
      ['A 75-yard field goal.', 'american-football'],
      ['She holed a putt from 30 feet.', 'golf'],
      ['He scored from 30 yards.', 'basketball'],
    ]) assert.equal(chalkOf(text, sport), null, text);
  });
});

// ---- the first real matchday: Saturday 17 Oct, 18:40 (the outlets' own sentences; their stories as the desk read them)
describe('FULL TIME: the first real matchday (17 Oct)', () => {
  const SAT = Date.parse('2026-10-17T18:40:00Z');
  const real = (id, source, link, title, summary, body) => ({ id, source, link, title, summary, body, published: SAT - 600_000, category: 'sport' });
  const STORIES = [
    real('mart', 'ESPN', 'https://www.espn.com/soccer/story/_/id/50200995/emi-martinez-hospital', "GK Martínez taken to hospital for 'precautionary' head injury tests", "Emi Martínez suffered a worrying-looking head injury during Chelsea's Premier League win over Everton on Saturday.", "Emi Martínez has been taken to hospital after he suffered a head injury during Chelsea 's Premier League match against Everton on Saturday. Chelsea coach Xabi Alonso told reporters that the Argentina international was conscious when leaving the stadium and has been taken to hospital for \"precautionary tests,\" adding: \"For now, we need to wait.\" He added: \"It was a concussion, but more than that. I saw just one clip, but we'll have to wait.\" Martínez, 34, collided with Everton's Jarrad Branthwaite when rushing from his goal to attempt to punch an Everton free kick out of his penalty area in the 67th minute of Saturday's match at the Hill Dickinson Stadium. Both players received treatment on the pitch, with the Everton defender recovering quickly. Martínez, however, received extended treatment from the Chelsea physios and paramedics before being stretchered from the field while receiving oxygen. Two goals from Pedro Neto ensured Chelsea took all three points from their trip to Merseyside."),
    real('lough', 'BBC Sport', 'https://www.bbc.co.uk/sport/horse-racing/articles/cv98zwz4y2w4o', 'Loughnane, 20, becomes youngest champion jockey since 1923', "Billy Loughnane becomes the youngest rider in over a century to be crowned Britain's champion jockey as he collects his trophy at Ascot.", "Billy Loughnane became the youngest rider in over a century to be crowned Britain's champion jockey when he collected his trophy at Ascot on Saturday. Aged 20, the Irishman beat five-time champion Oisin Murphy to the title, becoming its youngest holder since Charlie Elliott in 1923. Four years after his racing debut, Loughnane won his first Classic in May, the 2,000 Guineas, and rode to four further Group One victories among more than 220 wins this year. \"I love my job and I love riding horses – it's all I ever wanted to do,\" said Loughnane, nicknamed 'Billy the Kid'."),
    real('mares', 'ESPN', 'https://www.espn.com/soccer/story/_/id/50202449/enzo-maresca-haaland', 'Maresca plays down Haaland injury fears after City star limps off', "Enzo Maresca has played down fears over Erling Haaland's fitness after the striker limped off at the end of Manchester City's 3-2 win over Ipswich.", "Enzo Maresca has played down fears over Erling Haaland 's fitness after the striker limped off at the end of Manchester City 's 3-2 win over Ipswich on Saturday. Haaland, who scored twice, looked in pain after a heavy challenge with Jack Clarke in stoppage time. The Norwegian was already heading off the pitch before the full-time whistle was blown and went straight down the tunnel at the end of the game. \"We will see,\" Maresca said afterward. \"Erling said he was OK. I don't have any news at the moment.\" Haaland was one of a number of injury worries for City during the game."),
    real('omb', 'Sky Sports', 'https://www.skysports.com/racing/news/12040/13600297/ascot-ombudsman-simply-supreme', 'Ombudsman simply supreme in Champion Stakes', 'Ombudsman exacted Qatar Racing Champion Stakes revenge on Calandagan to come out on top with a show-stopping performance at Ascot.', "Ombudsman exacted Qatar Racing Champion Stakes revenge on Calandagan to come out on top with a show-stopping performance at Ascot. It was Francis-Henri Graffard's French raider who took home the spoils 12 months ago, but this time around there was a decisive verdict in favour of John and Thady Gosden's home favourite, who obliged as the 5-4 market leader. With the six-strong field heading into the home straight grouped tightly, the stage was set for Ombudsman to demonstrate the blistering turn of foot that has often been a hallmark of his career. When William Buick asked him to quicken, he scorched past eventual third Bay City Roller before seeing off Calandagan to banish Juddmonte International disappointment and prove he is truly one of the best middle-distance horses on the planet. Ombudsman strikes Champion Stakes gold | Full replay Almeraq proves his class in British Champions Sprint John Gosden said: \"I thought William was riding him very confidently in the straight.\""),
    real('cam', 'Sky Sports', 'https://www.skysports.com/football/st-johnstone-vs-dundee-united/report/558386', 'Cameron equaliser earns a point for Dundee United at St Johnstone', "Lyall Cameron's 79th-minute strike earned Dundee United a deserved 1-1 draw at St Johnstone.", "Lyall Cameron's 79th-minute strike earned Dundee United a deserved 1-1 draw at St Johnstone. United trailed at half-time to a Josh Fowler goal, the striker's sixth of the Scottish Premiership campaign. The league's top scorer did not make it out for the second half due to illness and Simo Valakari's side were unable to repeat the trick of last Sunday in Aberdeen when they successfully defended a 1-0 lead."),
    real('rl', 'BBC Sport', 'https://www.bbc.co.uk/sport/rugby-league/articles/crwyqgjg5y8wo', 'McDermott seeks fix as England fight to save their World Cup', "Brian McDermott says he can fix the errors that led to England's Rugby League World Cup defeat by Tonga - but is it already too late?", "As Tonga's deliriously happy supporters celebrated in their thousands in Perth, England knew they only had themselves to blame. They had passed up plenty of chances to win their 2026 Rugby League World Cup opener and had arguably been the better side for the opening 20 minutes of both halves. By the time Haumole Olakau'atu crashed over for Tonga's fourth try in their 30-12 victory, it was all over. The question is whether England's World Cup hopes are also over already."),
    real('golf', 'Sky Sports', 'https://www.skysports.com/golf/news/12040/13600134/dp-world-india-championship', 'McIlroy drops out of contention at DP World India Championship', "Spain's Eugenio Chacarra holds the lead at the DP World India Championship with Rory McIlroy dropping out of contention as the third round was halted by fading light.", "Spain's Eugenio Chacarra holds the lead at the DP World India Championship with Rory McIlroy dropping out of contention as the third round was halted by fading light. Chacarra leads by two strokes on 14 under with most of the field yet to finish their third round. The Spaniard was four under for his round after 11 holes, having started out in the halfway lead after completing a second-round 67 earlier on Saturday. Patrick Reed and McIlroy - battling with Chacarra for the season-long Race to Dubai title - were eight and 10 shots off the lead respectively."),
  ];
  const prepared = () => STORIES.map((s) => prepareStory(s, { now: SAT })).filter(Boolean);
  const byId = (id) => prepared().find((s) => s.id === id);

  test("the desk: a result in words and its score, the people's whole names, the outlet's question and its furniture gone", async () => {
    const { peopleIn } = await import('../server/sport/prepare.js');
    assert.deepEqual(byId('rl').scorelines.map((x) => `${x.winner} ${x.sa}-${x.sb} ${x.loser}`), ['Tonga 30-12 England']);
    assert.deepEqual(byId('rl').result, { winner: 'Tonga', loser: 'England', home: null });
    assert.equal(byId('rl').code, 'league');
    assert.match(byId('rl').summary, /^Brian McDermott says he can fix the errors that led to England's Rugby League World Cup defeat by Tonga\./, 'the statement without its question');
    assert.doesNotMatch(byId('rl').summary + byId('rl').body, /The question is whether/);
    assert.deepEqual(byId('cam').scorelines.map((x) => `${x.a} ${x.sa}-${x.sb} ${x.b}`), ['Dundee United 1-1 St Johnstone']);
    assert.doesNotMatch(byId('cam').summary, /deserved/);
    assert.doesNotMatch(byId('omb').body, /Full replay|British Champions Sprint|market leader/, 'a video link run into the text, and a price, go');
    assert.equal(byId('lough').people.Loughnane, 'Billy');
    assert.equal(byId('mares').people.Maresca, 'Enzo');
    assert.match(byId('mares').body, /Erling Haaland's fitness/, 'no space before a possessive');
    const people = peopleIn("Separate Saracens and England cricket nights out had converged. Once Al-Nassr went ahead. Goalkeeper Alex Paulsen misplaced a pass. Goals from Alex Lowry. If X, they owe a debt to Yehor Yarmolyuk. John and Thady Gosden's home favourite. John Gosden said.");
    assert.deepEqual(people, { Lowry: 'Alex', Yarmolyuk: 'Yehor' }, "never a sentence's common first word, a role, a middle name or a name shared by two people");
    // (a first name that is a place too, or ends like an adjective, is still one inside a sentence: ESPN 17 Oct)
    assert.deepEqual(peopleIn("At 36 years old, Jordan Henderson is the elder statesman. Fears over Erling Haaland's fitness. Paris Saint-Germain won."), { Henderson: 'Jordan', Haaland: 'Erling' });
    // (a one-line report is no story, but its result counts for SCORE CENTRE)
    const one = prepareStory(real('soton', 'Sky Sports', 'https://www.skysports.com/football/southampton-vs-bolton-wanderers/report/560625', 'Southampton frustrated at home by Bolton', 'James Bree, Lewis Dobbin and Leo Scienza all squandered chances as Southampton dropped points at home for the first time this season with a 0-0 draw against Bolton.'), { now: SAT });
    assert.equal(one.resultOnly, true);
    assert.deepEqual(one.scorelines.map((x) => `${x.a} ${x.sa}-${x.sb} ${x.b}`), ['Southampton 0-0 Bolton']);
    const list = balance([one, ...prepared()], { count: 6 });
    assert.equal(list.slice(0, list.edition).some((s) => s.resultOnly), false, 'never told');
    // (an undated story is dated by when the desk first saw it)
    assert.equal(prepareStory({ ...STORIES[1], published: SAT + 9 * 3600_000, firstSeen: SAT }, { now: SAT + 10 * 3600_000 }).published, SAT);
  });

  test('the writer: each story opens on what happened, says who won and the score, names people whole, points back to nothing untold', async () => {
    const channel = loadChannel(undefined, { drafts: true });
    const program = { id: 'full-time', ...channel.programs['full-time'] };
    const presenters = { A: { id: 'kai', ...channel.presenters.kai }, B: { id: 'rosa', ...channel.presenters.rosa } };
    const stories = prepared();
    const { text } = await createMockProvider().generate({ stories, channelName: 'GLOBIT 24', program, presenters, count: stories.length, now: new Date(SAT), recent: new Set() });
    const ep = JSON.parse(text);
    const said = (id) => String(ep.segments.find((s) => s.storyId === id)?.text || '').replace(/\[[^\]]*\]\s*/g, '');
    assert.match(said('mart'), /^(?:And finally: )?Emi Martínez suffered a worrying-looking head injury/, 'the lead that says what happened, never "Chelsea coach Xabi Alonso told reporters that the Argentina international was conscious" first');
    assert.match(said('lough'), /Billy Loughnane/);
    assert.doesNotMatch(said('lough'), /(?<!Billy )Loughnane, 20, has become/);
    assert.match(said('mares'), /Enzo Maresca has played down fears over Erling Haaland's fitness[^.]*3-2 win over Ipswich/);
    assert.match(said('omb'), /come out on top/);
    assert.match(said('omb'), /William Buick/, "a race's winner with who rode it");
    assert.match(said('cam'), /1-1 draw/);
    assert.match(said('rl'), /defeat by Tonga/);
    assert.match(said('rl'), /30-12/);
    for (const id of ['mart', 'golf']) {
      const parts = sentencesIn(said(id));
      parts.forEach((x, j) => {
        if (/^(?:Both players|The Spaniard)\b/.test(x)) assert.ok(j > 0 && /Branthwaite|Chacarra/.test(parts.slice(0, j).join(' ')), `${id}: ${x}`);
      });
    }
  });

  test('the shape: rugby league said so, a strap that ends its thought, whole names, a result with its score, nothing that points back to the untold', () => {
    const presenters = { A: { name: 'Kai Sprite' }, B: { name: 'Rosa Rally' } };
    const cands = prepared();
    const seg = (id, anchor, headline, text) => ({ type: 'story', anchor, storyId: id, headline, text, cues: [] });
    // the faulty texts of the first reading, as a writer gave them
    const ep = { segments: [
      { type: 'intro', anchor: 'A', text: "GK Martínez taken to hospital for 'precautionary' head injury tests. Good evening, and welcome to FULL TIME.", cues: [] },
      seg('mart', 'A', "GK Martínez taken to hospital for 'precautionary' head injury tests", 'Chelsea coach Xabi Alonso told reporters that the Argentina international was conscious. Both players received treatment on the pitch, with the Everton defender recovering quickly. Two goals from Pedro Neto ensured Chelsea took all three points from their trip to Merseyside.'),
      seg('lough', 'B', 'Loughnane, 20, becomes youngest champion jockey', 'Loughnane, 20, has become youngest champion jockey since 1923, BBC Sport reports. "I love my job and I love riding horses – it\'s all I ever wanted to do," said Loughnane, nicknamed \'Billy the Kid\'.'),
      seg('cam', 'A', 'Cameron equaliser earns point for Dundee United', "Cameron equaliser earns a point for Dundee United at St Johnstone. United trailed at half-time to a Josh Fowler goal, the striker's sixth of the Scottish Premiership campaign."),
      seg('golf', 'B', 'McIlroy drops out of contention', "The Spaniard was four under for his round after 11 holes, having started out in the halfway lead after completing a second-round 67 earlier on Saturday. Spain's Eugenio Chacarra holds the lead at the DP World India Championship with Rory McIlroy dropping out of contention as the third round was halted by fading light. Chacarra leads by two strokes on 14 under with most of the field yet to finish their third round."),
      seg('rl', 'A', 'McDermott seeks fix as England fight', "Due to the vagaries of the international rugby league calendar, this was McDermott's first match in charge of England. By the time Haumole Olakau'atu crashed over for Tonga's fourth try in their 30-12 victory, it was all over."),
      seg('omb', 'B', 'Ombudsman simply supreme in Champion Stakes', 'Ombudsman exacted Qatar Racing Champion Stakes revenge on Calandagan to come out on top at Ascot. When William Buick asked him to quicken, he scorched past eventual third Bay City Roller before seeing off Calandagan to banish Juddmonte International disappointment.'),
      { type: 'outro', anchor: 'A', text: 'That is FULL TIME.', cues: [] },
    ] };
    shapeEpisode(ep, { candidates: cands, program: { title: 'FULL TIME', headlineMax: 45 }, presenters, now: SAT, tz: 'Europe/London', seed: 'r' });
    const story = (id) => ep.segments.find((s) => s.storyId === id && s.type === 'story');
    const words = (id) => story(id).text.replace(/\[[^\]]*\]\s*/g, '');
    // (a story that opened on what leans on its lede once got the outlet's lede pasted back; since 25 Oct only a short
    // one is, the rest is the channel's own words or nothing: the long one copied the outlet and held the programme)
    if (story('mart')) assert.doesNotMatch(words('mart'), /Both players|^Emi Martínez suffered a worrying-looking head injury/, 'the collision it points back to was never told; the outlet\'s lede is not pasted');
    assert.match(words('lough'), /Billy Loughnane, 20, has become/);
    assert.match(words('cam'), /drew 1-1 with/, 'a result story says its score when the source has it (in the desk\'s words)');
    assert.doesNotMatch(sentencesIn(words('golf'))[0], /The Spaniard/, 'never "The Spaniard" before his name');
    assert.equal(story('rl').kicker, 'RUGBY LEAGUE');
    assert.match(`${words('rl')} ${ep.segments[ep.segments.indexOf(story('rl')) - 1].text}`, /rugby league/i);
    assert.equal(story('rl').headline, 'McDermott seeks fix', 'the strap ends where its thought does');
    assert.match(words('rl'), /Brian McDermott's first match/);
    assert.equal(cutMidThought('McDermott seeks fix as England fight', 'McDermott seeks fix as England fight to save their World Cup'), true);
    assert.equal(cutMidThought('Kartal reaches Wuhan final', 'Kartal reaches Wuhan final as dream week continues'), false);
    assert.equal(wholeThought('McDermott seeks fix as England fight', 'McDermott seeks fix as England fight to save their World Cup'), 'McDermott seeks fix');
    // (Rosa greets Kai by name, by the hour; never "Hello. Let's get started.")
    const hello = ep.segments[1];
    assert.equal(hello.type, 'chat');
    assert.doesNotMatch(hello.text, /Let's get started/);
    assert.match(hello.text, /Kai|everyone|all/);
    // (transitions name their sport: never "Something else now." nor "Some basketball.")
    for (const lines of Object.values(BANKS.transition)) for (const l of lines) assert.doesNotMatch(l, /^(?:Some \w+\.|Something else now\.)$/);
    assert.ok(BANKS.transition.racing.length >= 6 && BANKS.transition['rugby-league'].length >= 6);
    assert.equal(fullNames('Loughnane, 20, has become youngest. "I love it," said Loughnane.', { Loughnane: 'Billy' }), 'Billy Loughnane, 20, has become youngest. "I love it," said Loughnane.');
  });

  test('a story left with fewer than two sentences is not told', () => {
    const presenters = { A: { name: 'Kai Sprite' }, B: { name: 'Rosa Rally' } };
    const cands = prepared();
    const ids = ['mart', 'lough', 'mares', 'omb', 'cam', 'golf'];
    const first2 = (id) => sentencesIn(`${cands.find((c) => c.id === id).summary} ${cands.find((c) => c.id === id).body}`).slice(0, 2).join(' ');
    const ep = { segments: [
      { type: 'intro', anchor: 'A', text: 'Good evening, and welcome to FULL TIME.', cues: [] },
      ...ids.map((id, i) => ({ type: 'story', anchor: i % 2 ? 'B' : 'A', storyId: id, headline: cands.find((c) => c.id === id).title, text: id === 'lough' ? 'Loughnane, 20, has become youngest champion jockey since 1923, BBC Sport reports.' : id === 'mares' ? 'Maresca plays down Haaland injury fears after City star limps off, ESPN reports.' : first2(id), cues: [] })),
      { type: 'outro', anchor: 'A', text: 'That is FULL TIME.', cues: [] },
    ] };
    shapeEpisode(ep, { candidates: cands, program: { title: 'FULL TIME', headlineMax: 45 }, presenters, now: SAT, tz: 'Europe/London', seed: 'o' });
    assert.ok(!ep.segments.some((s) => s.storyId === 'lough' && s.type === 'story'), 'the headline alone is no story');
    // (a result story's headline alone takes its score's sentence, and is told)
    assert.match(ep.segments.find((s) => s.storyId === 'mares' && s.type === 'story').text, /beat Ipswich 3-2/, 'the score in the desk\'s words, not the outlet\'s sentence');
  });

  test("the women's game named when the copy never says it; a whole name before a headline's noun takes an article", () => {
    const presenters = { A: { name: 'Kai Sprite' }, B: { name: 'Rosa Rally' } };
    const rr = prepareStory(real('rr', 'Guardian Sport', 'https://www.theguardian.com/sport/2026/oct/17/canada-england-wxv-rugby-union-match-report', 'Red Roses’ four-year unbeaten streak ends in thriller', 'England have lost a rugby game after four years and 41 games unbeaten. Canada beat England 24-21 in Vancouver.', 'Canada had already ended England’s winning streak with a 26-26 draw in Exeter last month but that was not vengeance enough.'), { now: SAT });
    assert.equal(rr.womens, true);
    const cands = [...prepared(), rr];
    const ep = { segments: [
      { type: 'intro', anchor: 'A', text: 'Cameron equaliser earns a point for Dundee United at St Johnstone. Red Roses’ four-year unbeaten streak ends in thriller. Loughnane, 20, becomes youngest champion jockey since 1923. Good evening, and welcome to FULL TIME.', cues: [] },
      { type: 'story', anchor: 'A', storyId: 'cam', headline: 'Cameron equaliser earns point for Dundee United', text: "Lyall Cameron's 79th-minute strike earned Dundee United a 1-1 draw at St Johnstone. United trailed at half-time to a Josh Fowler goal.", cues: [] },
      { type: 'story', anchor: 'B', storyId: 'rr', headline: 'Red Roses’ four-year unbeaten streak ends in thriller', text: 'England have lost a rugby game after four years and 41 games unbeaten. Canada beat England 24-21 in Vancouver.', cues: [] },
      { type: 'story', anchor: 'A', storyId: 'lough', headline: 'Loughnane, 20, becomes youngest champion jockey', text: "Billy Loughnane becomes the youngest rider in over a century to be crowned Britain's champion jockey. Aged 20, the Irishman beat five-time champion Oisin Murphy to the title.", cues: [] },
      { type: 'outro', anchor: 'A', text: 'That is FULL TIME.', cues: [] },
    ] };
    shapeEpisode(ep, { candidates: cands, program: { title: 'FULL TIME', headlineMax: 45 }, presenters, now: SAT, tz: 'Europe/London', seed: 'w' });
    assert.match(ep.segments.find((s) => s.storyId === 'rr' && s.type === 'story').text, /In women's rugby(?: union)?, England have lost a rugby game/);
    const intro = ep.segments.find((s) => s.type === 'intro').text;
    assert.match(intro, /\bA Lyall Cameron equaliser earns/, intro);
    assert.match(intro, /Billy Loughnane, 20, becomes/, intro);
    // (a story that says it, or whose sport does, is left alone)
    assert.doesNotMatch(ep.segments.find((s) => s.storyId === 'lough' && s.type === 'story').text, /women's/);
  });

  test("the article page's own headline gives the score its feed title says in words, and the story says it", async () => {
    const { scoreInto } = await import('../server/sport/shape.js');
    const con = real('con', 'BBC Sport', 'https://www.bbc.co.uk/sport/rugby-union/articles/c0con', 'Seven-try Connacht beat Saracens in Champions Cup', 'Connacht beat Saracens in their opening Champions Cup pool game.', 'Captain Cian Prendergast and fly-half Ciaran Frawley scored two tries apiece as Connacht crossed seven times against the three-time Champions Cup winners at a raucous Dexcom Stadium. Saracens had the chance to leave with a losing bonus point.');
    const page = 'Champions Cup: Connacht 45-36 Saracens - Hosts score seven tries in pool victory';
    const read = (pageTitle) => prepareStory({ ...con, pageTitle }, { now: SAT }).scorelines.map((x) => `${x.a} ${x.sa}-${x.sb} ${x.b}`);
    assert.deepEqual(read(page), ['Connacht 45-36 Saracens']);
    // (never a live page's, nor one whose winner the feed's words do not name)
    assert.deepEqual(read('Champions Cup: Connacht 24-17 Saracens - live'), []);
    assert.deepEqual(read('Champions Cup: Connacht 36-45 Saracens - report'), []);
    assert.deepEqual(read(undefined), []);
    // (the first sentence that says the result in words takes the score)
    const sl = prepareStory({ ...con, pageTitle: page }, { now: SAT }).scorelines[0];
    assert.equal(scoreInto('Connacht beat Saracens in their opening Champions Cup pool game, according to BBC Sport.', sl), 'Connacht beat Saracens 45-36 in their opening Champions Cup pool game, according to BBC Sport.');
    assert.equal(scoreInto('Dundee United drew with St Johnstone on Saturday.', { draw: true, a: 'Dundee United', b: 'St Johnstone', sa: 1, sb: 1 }), 'Dundee United drew 1-1 with St Johnstone on Saturday.');
    assert.equal(scoreInto('Saracens had the chance to leave with a losing bonus point.', sl), null);
  });
});
