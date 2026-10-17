import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { isWomensSport, notSport, sportOf, sportTag } from '../server/sport/desk.js';
import { resultLine, scorelineFrom, scorelinesOf, spokenScore } from '../server/sport/scores.js';
import { retime, withoutJudgement } from '../server/sport/words.js';
import { fixturesIn } from '../server/sport/fixtures.js';

// FULL TIME's desk (docs/programmes/full-time.md §3): items and sentences from the sport feeds of 13 Oct.

describe('the sport desk', () => {
  const NOW = Date.parse('2026-10-13T09:00:00Z');
  test("a story's sport from its link, then its words; the strap's league only when the link says it", () => {
    assert.equal(sportOf({ link: 'https://www.bbc.co.uk/sport/football/articles/c1', title: 'Back in the big time' }), 'football');
    assert.equal(sportOf({ link: 'https://www.skysports.com/rugby-league/news/12040/1', title: 'Lewis left out' }), 'rugby');
    assert.equal(sportOf({ link: 'https://www.theguardian.com/sport/2026/oct/12/x', title: 'Saracens sack player who sparked Stokes captaincy crisis after latest incident', summary: 'The cricketer Ben Stokes was involved.' }), 'rugby', 'the headline outweighs the summary');
    assert.equal(sportOf({ link: 'https://www.theguardian.com/sport/2026/oct/12/y', title: 'Brewers two wins from first World Series since 1982 as Contreras skewers Dodgers', summary: 'in the later innings' }), 'baseball');
    assert.equal(sportTag({ link: 'https://www.espn.com/nfl/story/_/id/1', title: 'Bills, Josh Allen outlast Rams' }), 'NFL');
    assert.equal(sportTag({ link: 'https://www.skysports.com/x', title: 'London Lions given lesson by Portland in historic game for British basketball' }), 'BASKETBALL', 'not NBA: the link does not say the league');
  });

  test("women's sport by link, words or a women's competition", () => {
    assert.equal(isWomensSport({ link: 'https://www.espn.com/wnba/story/_/id/1', title: 'WNBA Finals location for Dream home games still uncertain' }), true);
    assert.equal(isWomensSport({ title: "Women's billion-dollar boom leaves players behind, says Fifpro" }), true);
    assert.equal(isWomensSport({ title: 'History made as Zheng becomes first Chinese woman to win China Open' }), true);
    assert.equal(isWomensSport({ title: 'Coventry thump Newcastle for first home win' }), false);
  });

  test('what never airs, each with its reason', () => {
    const why = (title, link = 'https://www.bbc.co.uk/sport/football/articles/c1', summary = '') => notSport({ title, link, summary }, NOW);
    assert.equal(why('Coventry thrash Newcastle to claim first home win of season', 'https://www.bbc.co.uk/sport/football/videos/c2'), 'video page');
    assert.equal(why('South Africa attempt to deny Australia on final day - Test scorecard'), 'live page');
    assert.equal(why("Man Utd eye Simeone - Tuesday's gossip"), 'gossip or the papers');
    assert.equal(why("Papers: Haaland and father buy properties on Man City's Abu Dhabi development"), 'gossip or the papers');
    assert.equal(why("Who am I? Plus today's other quizzes"), 'quiz or promo');
    assert.equal(why('Champions Day can give Flat season a fitting finale', 'https://www.theguardian.com/sport/2026/oct/12/z', 'He starts the week as a 6-4 shot with Paddy Power'), 'betting');
    assert.equal(why('Why we’re stuck with a Premier League in the clutches of the global mega-rich | Jonathan Wilson'), 'column or opinion');
    assert.equal(why('The Spin | Schrödinger’s six, tiny boundaries and the hollow spectacle of T10 cricket'), 'a series column');
    assert.equal(why('Who has made Troy\'s Premier League team of the week?'), 'Q&A, talking points or ratings');
    assert.equal(why('Takeaways from Guardians\' win over Rays'), 'analysis, list or listing');
    assert.equal(why('Can Texas bounce back? Will the Big 12 go sideways? Connelly on an eventful Week 6'), 'a question');
    assert.equal(why('WWE Money in the Bank takeaways: Everyone wants a shot at Roman Reigns'), 'analysis, list or listing');
    assert.equal(why('2027 five-star fits: UNC\'s two commitments in a week'), 'recruiting');
    assert.equal(why('Find out more here'), 'not a story');
    assert.equal(why('Damilola Taylor\'s shocking murder revisited 26 years on', 'https://www.theguardian.com/uk-news/2026/oct/12/x', 'Police reopened the case.'), 'not about sport');
    assert.equal(why('Back in the big time - Coventry end 25-year wait for top-flight home win'), null);
    assert.equal(why('Zverev secures year-end number one ranking', 'https://www.bbc.co.uk/sport/tennis/articles/c3'), null, '"ranking" as a fact, not a list');
  });
});

describe('scorelines read with certainty', () => {
  const read = (s, sport = 'football') => resultLine(scorelineFrom(s, sport));
  test('the forms of 13 Oct, each with the result line it airs', () => {
    assert.equal(read('Coventry City stun Newcastle United with an emphatic 4-1 victory as they win their first Premier League game at home in 25 years.'), 'Coventry City stunned Newcastle United 4-1.');
    assert.equal(read('In their first match since being found guilty of breaching Premier League financial rules, Manchester City enjoyed a comfortable 3-0 win against Liverpool.'), 'Manchester City beat Liverpool 3-0.');
    assert.equal(read("Speaking on Match of the Day, Alan Shearer explains why the performance of Moises Caicedo was pivotal in Chelsea's 5-1 win against Bournemouth."), 'Chelsea beat Bournemouth 5-1.');
    assert.equal(read('A brilliant goal from Bruno Guimaraes helps Arsenal come from behind to beat Leeds United 2-1 at the Emirates.'), 'Arsenal came from behind to beat Leeds United 2-1.');
    assert.equal(read('Buffalo Bills 37–34 Los Angeles Rams (OT)Allen was 0-7 in overtime coming into game', 'american-football'), 'Buffalo Bills beat Los Angeles Rams 37-34.');
    assert.equal(read('Allen leads Bills to 37-34 victory over Rams.', 'american-football'), 'Bills beat Rams 37-34.', 'the team, never the player');
    assert.equal(read("On the field after the Los Angeles Rams' 37-34 overtime loss to the Buffalo Bills on Monday night, Rams left tackle Alaric Jackson punched Bills outside linebacker.", 'american-football'), 'Buffalo Bills beat Los Angeles Rams 37-34.');
    assert.equal(read('Lens put an end to a four-match winless run by beating Lyon 2-1 on Friday night.'), 'Lens beat Lyon 2-1.');
    const all = scorelinesOf('Elsewhere, Sweden beat Poland 3-1, Bosnia and Herzegovina overcame Romania 4-2, and Northern Ireland held Hungary to a goalless draw.', 'football').map(resultLine);
    assert.deepEqual(all, ['Sweden beat Poland 3-1.', 'Bosnia and Herzegovina overcame Romania 4-2.', 'Northern Ireland drew 0-0 with Hungary.']);
    const two = scorelinesOf('Italy bounced back in style on Monday, thumping Turkey 4-1 in the rain, while France edged Belgium 1-0 in Brussels.', 'football').map(resultLine);
    assert.deepEqual(two.sort(), ['France edged Belgium 1-0.', 'Italy beat Turkey 4-1.']);
  });

  test('who was at home, only when the source says so', () => {
    assert.equal(scorelineFrom('Coventry made it back-to-back Premier League wins with a thumping 4-1 home victory over Newcastle.', 'football').home, 'Coventry');
    assert.equal(scorelineFrom('Senegal secured a 1-0 away victory against Ethiopia thanks to a goal from Ibrahim Mbaye.', 'football').home, 'Ethiopia');
    assert.equal(scorelineFrom('Chelsea thrash Bournemouth 5-1 at Stamford Bridge.', 'football').home, null);
  });

  test('never a score that is not a final result, nor a team that is not a team', () => {
    assert.equal(scorelineFrom("Wales take a 1-0 lead into their play-off semi-final second leg against Albania.", 'football'), null, 'a lead');
    assert.equal(scorelineFrom('He starts the week as a 6-4 shot with Paddy Power, while O’Brien is 1-2.', 'racing'), null, 'odds, and no single score in racing');
    assert.equal(scorelineFrom('Why did the 1-4 Texans make an aggressive trade?', 'american-football'), null, 'a record');
    assert.equal(scorelineFrom('Contreras powers Brewers to 2-0 NLCS lead.', 'baseball'), null, 'a series');
    assert.equal(scorelineFrom('South Africa 105-1 (Markram 45, Mulder 6)', 'cricket'), null, 'cricket has no single score');
    assert.equal(scorelineFrom('La Roja came back from 2-1 down at half-time to see off England.', 'football'), null);
    assert.equal(scorelineFrom('Les Bleus already beat Belgium on September 28 in Matchday 2 (1-0).', 'football'), null, 'a nickname is no team on a board');
    assert.equal(scorelineFrom('Lionel Messi played his final match for Argentina, ending in a 3-0 victory over Benin.', 'football'), null, 'a player is no team');
    assert.equal(scorelineFrom('Jordan Henderson scores twice as his side thrash Bournemouth 5-1.', 'football'), null, '"his side" is no name');
    assert.equal(scorelineFrom('They would need a 3-0 win over Leeds to go top.', 'football'), null, 'a score wished for');
    assert.equal(scorelineFrom('That 1997-98 season was the subject of the Last Dance documentary series.', 'basketball'), null, 'a season');
  });

  test('a score as a results reader says it', () => {
    assert.equal(spokenScore(4, 1, 'football'), 'four one');
    assert.equal(spokenScore(3, 0, 'football'), 'three nil');
    assert.equal(spokenScore(1, 1, 'football'), 'one all');
    assert.equal(spokenScore(0, 0, 'football'), 'nil-nil');
    assert.equal(spokenScore(37, 34, 'american-football'), 'thirty-seven thirty-four');
    assert.equal(spokenScore(119, 66, 'basketball'), 'one hundred and nineteen sixty-six');
  });
});

describe('time words from the day it airs', () => {
  const MON = Date.parse('2026-10-12T19:00:00Z');
  const TUE = Date.parse('2026-10-13T10:00:00Z');
  const WED = Date.parse('2026-10-14T10:00:00Z');
  const at = (now, published = MON) => ({ published, now });
  test('re-anchored, or dropped when the day has passed', () => {
    assert.equal(retime('Coventry face Newcastle tonight at 8pm.', at(MON)), 'Coventry face Newcastle tonight at 8pm.', 'its own day: unchanged');
    assert.equal(retime('Coventry face Newcastle tonight at 8pm.', at(TUE)), 'Coventry face Newcastle on Monday night at 8pm.');
    assert.equal(retime("Tonight's game was Coventry's first home win in 25 years.", at(TUE)), "Monday night's game was Coventry's first home win in 25 years.");
    assert.equal(retime('Coventry beat Newcastle 4-1 last night.', at(WED, Date.parse('2026-10-13T07:00:00Z'))), 'Coventry beat Newcastle 4-1 on Monday night.');
    assert.equal(retime('Wales host Albania on Tuesday in the second leg.', at(TUE)), 'Wales host Albania today in the second leg.');
    assert.equal(retime('Wales host Albania on Tuesday in the second leg.', at(WED)), null, 'played, result unknown');
    assert.equal(retime('The draw will be made tomorrow.', at(TUE)), 'The draw will be made today.');
    assert.equal(retime('The draw will be made tomorrow.', at(WED)), null);
    assert.equal(retime('The squad will be named later today.', at(TUE)), null);
    assert.equal(retime('Lens beat Lyon 2-1 on Friday night.', at(TUE)), 'Lens beat Lyon 2-1 on Friday night.', 'a day past, said of the past, stays');
  });
});

describe('no judgement of a real person', () => {
  test("the outlets' verdicts go, a quotation stays, a result's emphasis stays", () => {
    assert.equal(withoutJudgement('A brilliant goal from Bruno Guimaraes helps Arsenal come from behind to beat Leeds United 2-1.'), 'A goal from Bruno Guimaraes helps Arsenal come from behind to beat Leeds United 2-1.');
    assert.equal(withoutJudgement('An outstanding effort from the goalkeeper kept the score down.'), 'An effort from the goalkeeper kept the score down.');
    assert.equal(withoutJudgement('Coventry made it back-to-back wins with a thumping 4-1 home victory over Newcastle.'), 'Coventry made it back-to-back wins with a thumping 4-1 home victory over Newcastle.');
    assert.equal(withoutJudgement('Lampard said: “It was a brilliant performance from the lads.”'), 'Lampard said: “It was a brilliant performance from the lads.”');
    assert.equal(withoutJudgement('Caicedo was outstanding as Chelsea won.'), null);
    assert.equal(withoutJudgement('Arsenal endured a woeful start to the season.'), null, 'the verdict is all the phrase says');
    assert.equal(withoutJudgement('Peterborough’s new boss has long been a divisive figure.'), null);
    assert.equal(withoutJudgement('The referee got it wrong, according to Iraola.'), null);
  });
});

describe('fixtures ahead', () => {
  const at = { published: Date.parse('2026-10-12T08:00:00Z'), now: Date.parse('2026-10-12T13:00:00Z') };
  test('events written from the sentence, dates still ahead', () => {
    assert.deepEqual(fixturesIn(['Wales host Albania on Tuesday in the second leg of their play-off.'], at).map((f) => [f.event, f.when]), [['WALES V ALBANIA', 'TUESDAY']]);
    assert.deepEqual(fixturesIn(['Tyson Fury and Anthony Joshua will fight for the WBA world heavyweight championship when they box on December 11, confirmed Frank Warren.'], at).map((f) => [f.event, f.when]), [['TYSON FURY V ANTHONY JOSHUA', '11 DECEMBER']]);
    assert.deepEqual(fixturesIn(['Lauren Price will fight Michaela Kotaskova in Cardiff in November.'], at).map((f) => [f.event, f.when]), [['LAUREN PRICE V MICHAELA KOTASKOVA', 'NOVEMBER']]);
    assert.deepEqual(fixturesIn(['The Ashes begins on 21 November in Perth.'], at).map((f) => f.event), ['THE ASHES']);
    assert.deepEqual(fixturesIn(['Norway’s champions, who host Bayern Munich on Tuesday, have excelled.'], at), [], 'a description is no side');
    assert.deepEqual(fixturesIn(['Zinedine Zidane faces Italy again on Friday, this time as France manager.'], at), [], 'a manager is no side');
    assert.deepEqual(fixturesIn(['Lens beat Lyon 2-1 on Friday night.'], at), [], 'a result, not a fixture');
    assert.deepEqual(fixturesIn(['Wales host Albania on Tuesday.'], { ...at, now: Date.parse('2026-10-14T09:00:00Z') }), [], 'played');
  });
});

describe("a club's name on a board", () => {
  test('a nickname is no name; a generic short name takes the full name the story uses', async () => {
    const { scorelinesIn } = await import('../server/sport/scores.js');
    const ctx = "Man City were found guilty last month. City's 3-0 win over Liverpool was the club's first game since.";
    assert.deepEqual(scorelinesIn(["City's 3-0 win over Liverpool was the club's first game since."], 'football', ctx).map(resultLine), ['Man City beat Liverpool 3-0.']);
    assert.deepEqual(scorelinesIn(["City's 3-0 win over Liverpool was the club's first game since."], 'football', 'No full name here.'), [], 'which City?');
    assert.deepEqual(scorelinesIn(['The Gunners beat Leeds 2-1 at the Emirates.'], 'football', 'Arsenal'), [], 'a nickname');
  });
});

// ---- the first real matchday (Saturday 17 Oct, 18:40): every result the edition aired without, and the desk's faults
describe('a Saturday of match reports (17 Oct)', () => {
  const read = (s, sport = 'football') => scorelinesOf(s, sport).map((x) => `${resultLine(x)}${x.home ? ` (home ${x.home})` : ''}`);
  test('the winner as a verb\'s object, a team\'s own clause, a competition\'s label; never a ground', () => {
    assert.deepEqual(read('Greg Kiltie scored twice to lift Kilmarnock off the bottom of the Scottish Premiership with a 3-2 victory over Motherwell.'), ['Kilmarnock beat Motherwell 3-2.']);
    assert.deepEqual(read("Lyall Cameron's 79th-minute strike earned Dundee United a 1-1 draw at St Johnstone."), ['Dundee United drew 1-1 with St Johnstone.']);
    assert.deepEqual(read('Álex Baena struck in the 89th minute to snatch Atlético Madrid a 1-0 win at Espanyol and put pressure on the La Liga leaders, Barcelona.'), ['Atlético Madrid beat Espanyol 1-0. (home Espanyol)'], 'a win at a team is at its ground');
    assert.deepEqual(read("Oliver Arblaster's early strike and a strong defensive display saw Sheffield United take all three points from a 1-0 Championship victory over Bristol City at Ashton Gate."), ['Sheffield United beat Bristol City 1-0.']);
    assert.deepEqual(read('Ulster run in six tries on their way to a 40-21 bonus-point win over Zebre in Parma to open their European Challenge Cup campaign.', 'rugby'), ['Ulster beat Zebre 40-21.']);
    assert.deepEqual(read('Aberdeen returned to winning ways in the Scottish Premiership as a 3-1 victory over St Mirren moved them above their opponents, who have now lost five straight matches.'), ['Aberdeen beat St Mirren 3-1.']);
    assert.deepEqual(read('James Bree, Lewis Dobbin and Leo Scienza all squandered chances as Southampton dropped points at home for the first time this season with a 0-0 draw against Bolton.'), ['Southampton drew 0-0 with Bolton.']);
    assert.deepEqual(read('WXV: Canada 24-21 England.', 'rugby'), ['Canada beat England 24-21.']);
    assert.deepEqual(read('Portsmouth piled on the misery for struggling Norwich as they made it back-to-back Championships victories with a 1-0 triumph at Carrow Road.'), [], 'Carrow Road is a ground');
  });

  test('the result in words in the headline (or the standfirst), its score in a sentence of the copy', async () => {
    const { pairedScorelines, resultInWords, scorelinesIn } = await import('../server/sport/scores.js');
    const pair = (heads, sentences, sport = 'football') => pairedScorelines(heads, sentences, sport).map((x) => `${resultLine(x)}${x.home ? ` (home ${x.home})` : ''}`);
    assert.deepEqual(pair(['Struggling Norwich beaten by Portsmouth'], ['Portsmouth piled on the misery for struggling Norwich as they made it back-to-back Championships victories with a 1-0 triumph at Carrow Road.']), ['Portsmouth beat Norwich 1-0.']);
    assert.deepEqual(pair(['Sorry Derby beaten at home by Stoke'], ['Luke Graham scored his first goal for Stoke as they won 1-0 at Pride Park to pile more pressure on struggling Derby.']), ['Stoke beat Derby 1-0. (home Derby)']);
    assert.deepEqual(pair(['Murrell scores two as Falkirk claim Edinburgh double by beating Hibs'], ['Falkirk registered an Edinburgh double as they put Hibs to the sword with a 2-1 win in an entertaining Scottish Premiership clash at Easter Road.']), ['Falkirk beat Hibs 2-1.']);
    assert.deepEqual(pair(['McDermott seeks fix as England fight to save their World Cup', "Brian McDermott says he can fix the errors that led to England's Rugby League World Cup defeat by Tonga - but is it already too late?"], ["By the time Haumole Olakau'atu crashed over for Tonga's fourth try in their 30-12 victory, it was all over."], 'rugby'), ['Tonga beat England 30-12.']);
    // (never another match's score: an earlier one, or one after its result with another team)
    assert.deepEqual(pair(['Kiltie double helps Kilmarnock beat fellow-strugglers Motherwell'], ['"We signed him for everything," Alonso said after last weekend\'s 5-1 victory over AFC Bournemouth.']), []);
    assert.deepEqual(pair(['Kiltie double helps Kilmarnock beat fellow-strugglers Motherwell'], ['Kilmarnock had lost their previous game, a 2-0 defeat to Hibernian.']), []);
    assert.deepEqual(resultInWords('Cameron equaliser earns a point for Dundee United at St Johnstone', 'football'), { draw: true, a: 'Dundee United', b: 'St Johnstone' });
    assert.deepEqual(resultInWords('Seven-try Connacht beat Saracens in Champions Cup', 'rugby'), { winner: 'Connacht', loser: 'Saracens', home: null });
    assert.equal(resultInWords('Can Arsenal beat City?', 'football'), null, 'a question');
    assert.equal(resultInWords('Kartal reaches Wuhan final as dream week continues', 'tennis'), null, 'no single score in tennis');
    // (a subject read as the winner is a team only when the story never makes it a player)
    const ctx = 'Greg Kiltie led the charge on their way to a 3-0 win over Hibs. Kiltie scored twice.';
    assert.deepEqual(scorelinesIn(['Greg Kiltie led the charge on their way to a 3-0 win over Hibs.'], 'football', ctx), []);
  });

  test('rugby says its code: league on the tag and in the copy', () => {
    assert.equal(sportTag({ link: 'https://www.bbc.co.uk/sport/rugby-league/articles/crwyqgjg5y8wo', title: 'McDermott seeks fix as England fight to save their World Cup' }), 'RUGBY LEAGUE');
    assert.equal(sportTag({ link: 'https://www.bbc.co.uk/sport/rugby-union/articles/cr86zgpyz464o', title: 'Seven-try Connacht beat Saracens in Champions Cup' }), 'RUGBY UNION');
    assert.equal(sportTag({ link: 'https://www.theguardian.com/sport/2026/oct/17/x', title: 'Red Roses’ four-year unbeaten streak ends in a thriller as Canada claim late win', summary: 'England suffer first defeat since 2022 Women’s Rugby World Cup final.' }), 'RUGBY UNION');
    assert.equal(sportOf({ link: 'https://www.bbc.co.uk/sport/rugby-league/articles/x', title: 'x y z w' }), 'rugby', 'one sport for the balance');
  });

  test("a verdict on a result's manner goes, the result stays; a name is no verdict; blame by a verb goes", () => {
    assert.equal(withoutJudgement("Lyall Cameron's 79th-minute strike earned Dundee United a deserved 1-1 draw at St Johnstone."), "Lyall Cameron's 79th-minute strike earned Dundee United a 1-1 draw at St Johnstone.");
    assert.equal(withoutJudgement('Connacht produce a superb attacking performance to beat Saracens in their opening Champions Cup pool game.'), 'Connacht beat Saracens in their opening Champions Cup pool game.');
    assert.equal(withoutJudgement('Ombudsman exacted Qatar Racing Champion Stakes revenge on Calandagan to come out on top with a show-stopping performance at Ascot.'), 'Ombudsman exacted Qatar Racing Champion Stakes revenge on Calandagan to come out on top at Ascot.');
    assert.equal(withoutJudgement('Falkirk registered a stunning Edinburgh double as they put Hibs to the sword with a 2-1 win.'), 'Falkirk registered an Edinburgh double as they put Hibs to the sword with a 2-1 win.');
    assert.match(withoutJudgement('Dream coach Karl Smesko was optimistic that forward Allisha Gray would return.'), /^Dream coach Karl Smesko/, 'the Atlanta Dream, not a dream coach');
    for (const t of ['Kartal took advantage when 34th-ranked Ostapenko stuttered in high-pressure moments.', 'Brentford pressed the self-destruct button when they had Liverpool on the ropes.', 'They had only themselves to blame after tumbling out of the top four.', 'The visitors made a nightmare start.']) assert.equal(withoutJudgement(t), null, t);
  });
});
