import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { editionChecks } from '../tools/sport/checks.mjs';
import { prepareStory } from '../server/sport/prepare.js';

// FULL TIME's gate (docs/roadmap/critique/full-time-writing.md): the automatic checks of an edition, taught by the first real
// matchday. Every fault class the hand reading of 17 Oct found, and the checks of rounds 2 and 3 had missed, from the faulty
// texts as they aired then (the outlets' own sentences, the stories as the desk read them).

const SAT = Date.parse('2026-10-17T18:40:00Z');
const raw = (id, source, link, title, summary, body = '') => ({ id, source, link, title, summary, body, published: SAT - 600_000, category: 'sport' });
const STORIES = [
  raw('isak', 'Guardian Sport', 'https://www.theguardian.com/football/2026/oct/17/brentford-liverpool-premier-league-match-report', 'Isak completes Liverpool’s comeback win as Brentford finish with nine', 'If Liverpool’s spluttering forwards end up remembering this as the day when their luck turned then they will owe a big debt of gratitude to Yehor Yarmolyuk. This was a game with a very clear before and after.', 'Brentford, who later lost Vitaly Janelt to a second yellow card, could not hold out. They raged at John Brooks’s officiating after their unbeaten start ended. Brentford pressed the self-destruct button when they had Liverpool on the ropes. The clever pass to release Victor Muñoz for a sharp equaliser was his second assist of the season, the French winger’s header teeing up Alexander Isak to complete the turnaround.'),
  raw('cam', 'Sky Sports', 'https://www.skysports.com/football/st-johnstone-vs-dundee-united/report/558386', 'Cameron equaliser earns a point for Dundee United at St Johnstone', "Lyall Cameron's 79th-minute strike earned Dundee United a deserved 1-1 draw at St Johnstone.", "United trailed at half-time to a Josh Fowler goal, the striker's sixth of the Scottish Premiership campaign. The league's top scorer did not make it out for the second half due to illness."),
  raw('mart', 'ESPN', 'https://www.espn.com/soccer/story/_/id/50200995/emi-martinez-hospital', "GK Martínez taken to hospital for 'precautionary' head injury tests", "Emi Martínez suffered a worrying-looking head injury during Chelsea's Premier League win over Everton on Saturday.", "Chelsea coach Xabi Alonso told reporters that the Argentina international was conscious when leaving the stadium. Martínez, 34, collided with Everton's Jarrad Branthwaite when rushing from his goal. Both players received treatment on the pitch, with the Everton defender recovering quickly."),
  raw('golf', 'Sky Sports', 'https://www.skysports.com/golf/news/12040/13600134/dp-world-india-championship', 'McIlroy drops out of contention at DP World India Championship', "Spain's Eugenio Chacarra holds the lead at the DP World India Championship with Rory McIlroy dropping out of contention as the third round was halted by fading light.", 'Chacarra leads by two strokes on 14 under with most of the field yet to finish their third round. The Spaniard was four under for his round after 11 holes, having started out in the halfway lead after completing a second-round 67 earlier on Saturday.'),
  raw('lough', 'BBC Sport', 'https://www.bbc.co.uk/sport/horse-racing/articles/cv98zwz4y2w4o', 'Loughnane, 20, becomes youngest champion jockey since 1923', "Billy Loughnane becomes the youngest rider in over a century to be crowned Britain's champion jockey as he collects his trophy at Ascot.", "Aged 20, the Irishman beat five-time champion Oisin Murphy to the title. \"I love my job and I love riding horses – it's all I ever wanted to do,\" said Loughnane, nicknamed 'Billy the Kid'."),
  raw('rl', 'BBC Sport', 'https://www.bbc.co.uk/sport/rugby-league/articles/crwyqgjg5y8wo', 'McDermott seeks fix as England fight to save their World Cup', "Brian McDermott says he can fix the errors that led to England's Rugby League World Cup defeat by Tonga - but is it already too late?", "By the time Haumole Olakau'atu crashed over for Tonga's fourth try in their 30-12 victory, it was all over. Due to the vagaries of the international rugby league calendar, this was McDermott's first match in charge of England since being appointed in April as Shaun Wane's successor."),
  raw('kil', 'Sky Sports', 'https://www.skysports.com/football/kilmarnock-vs-motherwell/report/558385', 'Kiltie double helps Kilmarnock beat fellow-strugglers Motherwell', 'Greg Kiltie scored twice to lift Kilmarnock off the bottom of the Scottish Premiership with a 3-2 victory over Motherwell.', "Motherwell had a dominant spell after recovering from Kiltie's second-minute opener and goals from Alex Lowry and Seb Palmer-Houlden turned the game on its head. Goalkeeper Alex Paulsen misplaced a short pass into central midfield."),
  raw('port', 'Sky Sports', 'https://www.skysports.com/football/norwich-city-vs-portsmouth/report/560624', 'Struggling Norwich beaten by Portsmouth', 'Portsmouth piled on the misery for struggling Norwich as they made it back-to-back Championships victories with a 1-0 triumph at Carrow Road.', 'It was a fifth successive league defeat for the hosts.'),
  raw('abe', 'Sky Sports', 'https://www.skysports.com/football/aberdeen-vs-st-mirren/report/558381', 'Improved second-half display helps Aberdeen beat St Mirren', 'Aberdeen returned to winning ways in the Scottish Premiership as a 3-1 victory over St Mirren moved them above their opponents, who have now lost five straight matches.', 'Brad Lyons gave the hosts the lead in spectacular fashion after just two minutes.'),
];
const byId = new Map(STORIES.map((s) => [s.id, s]));
const getStory = (id) => byId.get(id);
const story = (id, anchor, kicker, headline, text, extra = {}) => ({ type: 'story', anchor, storyId: id, kicker, headline, text, sport: kicker === 'GOLF' ? 'golf' : kicker === 'RACING' ? 'racing' : /RUGBY/.test(kicker) ? 'rugby' : 'football', cues: [], ...extra });
const edition = (stories, sport = { shape: 'MATCHDAY', results: 0, fixtures: 0 }) => ({ sport, segments: [{ type: 'intro', anchor: 'A', text: 'Hello and good evening.', cues: [] }, ...stories, { type: 'outro', anchor: 'A', text: "And that's FULL TIME.", cues: [] }] });
const faultsOf = (ep, pool = []) => editionChecks(ep, { getStory, air: SAT, pool }).faults;
const has = (faults, re) => faults.some((f) => re.test(f));

describe('FULL TIME: the checks the first real matchday taught (17 Oct)', () => {
  test('a matchday with no SCORE CENTRE while the desk has results to show', () => {
    const pool = ['kil', 'port', 'abe', 'cam'].map((id) => prepareStory(getStory(id), { now: SAT }));
    const faults = faultsOf(edition([story('mart', 'A', 'FOOTBALL', 'GK Martínez taken to hospital', "Emi Martínez suffered a worrying-looking head injury during Chelsea's Premier League win over Everton on Saturday. Chelsea coach Xabi Alonso told reporters that the Argentina international was conscious.")]), pool);
    assert.ok(has(faults, /^MATCHDAY without SCORE CENTRE: the desk has 4 results/), faults.join('\n'));
    assert.ok(!has(faultsOf(edition([], { shape: 'MATCHDAY', results: 4, fixtures: 0 }), pool), /SCORE CENTRE/), 'with its results, none');
  });

  test('a result story without who won, or without the score its source gives', () => {
    const isak = story('isak', 'B', 'FOOTBALL', 'Isak completes Liverpool’s comeback win', 'Brentford, who later lost Vitaly Janelt to a second yellow card, could not hold out. They raged at John Brooks’s officiating after their unbeaten start ended. Brentford pressed the self-destruct button when they had Liverpool on the ropes.');
    const cam = story('cam', 'A', 'FOOTBALL', 'Cameron equaliser earns point for Dundee United', "Cameron equaliser earns a point for Dundee United at St Johnstone. United trailed at half-time to a Josh Fowler goal, the striker's sixth of the Scottish Premiership campaign.");
    const faults = faultsOf(edition([isak, cam]));
    assert.ok(has(faults, /^result story never says who won: «Isak completes/), faults.join('\n'));
    assert.ok(has(faults, /^result without its score \(Dundee United 1-1 St Johnstone in the source\): «Cameron/), faults.join('\n'));
    const fixed = faultsOf(edition([story('cam', 'A', 'FOOTBALL', 'Cameron equaliser earns point for Dundee United', "Lyall Cameron's 79th-minute strike earned Dundee United a 1-1 draw at St Johnstone. United trailed at half-time to a Josh Fowler goal, the striker's sixth of the Scottish Premiership campaign.")]));
    assert.ok(!has(fixed, /result/), fixed.join('\n'));
  });

  test('a pronoun, a demonym or a description before what it points back to', () => {
    const faults = faultsOf(edition([
      story('mart', 'A', 'FOOTBALL', 'GK Martínez taken to hospital', 'Chelsea coach Xabi Alonso told reporters that the Argentina international was conscious. Both players received treatment on the pitch, with the Everton defender recovering quickly.'),
      story('golf', 'B', 'GOLF', 'McIlroy drops out of contention', "Golf now. The Spaniard was four under for his round after 11 holes, having started out in the halfway lead. Spain's Eugenio Chacarra holds the lead at the DP World India Championship with Rory McIlroy dropping out of contention as the third round was halted by fading light."),
      story('isak', 'A', 'FOOTBALL', 'Isak completes Liverpool’s comeback win', 'Brentford, who later lost Vitaly Janelt to a second yellow card, could not hold out. Alexander Isak completed the turnaround.'),
    ]));
    assert.ok(has(faults, /^points back to what was not told: «GK Martínez taken to hospital» Both players/), faults.join('\n'));
    assert.ok(has(faults, /^a description before its name: «McIlroy drops out of contention» The Spaniard/), faults.join('\n'));
    assert.ok(has(faults, /^points back to what was not told: «Isak completes Liverpool’s comeback win» Brentford, who later lost/), faults.join('\n'));
    // (told after its name, a description is fine)
    const fine = faultsOf(edition([story('golf', 'B', 'GOLF', 'McIlroy drops out of contention', "Spain's Eugenio Chacarra holds the lead at the DP World India Championship with Rory McIlroy dropping out of contention as the third round was halted by fading light. Chacarra leads by two strokes on 14 under. The Spaniard was four under for his round after 11 holes.")]));
    assert.ok(!has(fine, /description|points back/), fine.join('\n'));
  });

  test("a person's first mention without the whole name the source gives, and a name the source never gives", () => {
    const faults = faultsOf(edition([
      story('lough', 'B', 'RACING', 'Loughnane, 20, becomes youngest champion jockey', 'Loughnane, 20, has become youngest champion jockey since 1923, BBC Sport reports. "I love my job and I love riding horses – it\'s all I ever wanted to do," said Loughnane, nicknamed \'Billy the Kid\'.'),
      story('rl', 'A', 'RUGBY LEAGUE', 'McDermott seeks fix', "Rugby league now. Due to the vagaries of the international rugby league calendar, this was McDermott's first match in charge of England. By the time Haumole Olakau'atu crashed over for Tonga's fourth try in their 30-12 victory, it was all over."),
      story('kil', 'B', 'FOOTBALL', 'Kiltie double helps Kilmarnock beat fellow-strugglers Motherwell', 'Greg Kiltie scored twice to lift Kilmarnock off the bottom of the Scottish Premiership with a 3-2 victory over Motherwell. Motherwell had a dominant spell after recovering from the opener and goals from Goalkeeper Alex Lowry and Seb Palmer-Houlden turned the game on its head.'),
    ]));
    assert.ok(has(faults, /^first mention without a first name: Loughnane \(Billy Loughnane\)/), faults.join('\n'));
    assert.ok(has(faults, /^first mention without a first name: McDermott \(Brian McDermott\)/), faults.join('\n'));
    assert.ok(has(faults, /^a name the source never gives: Goalkeeper Alex Lowry/), faults.join('\n'));
    // (and the first time the edition says it, in the headlines or a signpost before the story)
    const told = 'Billy Loughnane has become the youngest champion jockey since 1923, BBC Sport reports. Aged 20, the Irishman beat five-time champion Oisin Murphy to the title.';
    const early = edition([story('lough', 'B', 'RACING', 'Loughnane, 20, becomes youngest champion jockey', told)]);
    early.segments[0].text = 'Loughnane, 20, becomes youngest champion jockey. Hello and good evening.';
    assert.ok(has(faultsOf(early), /^first mention without a first name: Loughnane \(Billy Loughnane\) before «Loughnane/), faultsOf(early).join('\n'));
    early.segments[0].text = 'Billy Loughnane, 20, becomes youngest champion jockey. Hello and good evening.';
    assert.ok(!has(faultsOf(early), /first mention/), faultsOf(early).join('\n'));
  });

  test('a headline cut mid-thought, and rugby league tagged or told as rugby', () => {
    const faults = faultsOf(edition([story('rl', 'A', 'RUGBY', 'McDermott seeks fix as England fight', "Some rugby. Brian McDermott says he can fix the errors that led to England's World Cup defeat by Tonga. By the time Haumole Olakau'atu crashed over for Tonga's fourth try in their 30-12 victory, it was all over.")]));
    assert.ok(has(faults, /^headline cut mid-thought: «McDermott seeks fix as England fight»/), faults.join('\n'));
    assert.ok(has(faults, /^rugby league tagged RUGBY:/), faults.join('\n'));
    assert.ok(has(faults, /^rugby league never said:/), faults.join('\n'));
    const fixed = faultsOf(edition([story('rl', 'A', 'RUGBY LEAGUE', 'McDermott seeks fix', "Rugby league now. Brian McDermott says he can fix the errors that led to England's Rugby League World Cup defeat by Tonga. By the time Haumole Olakau'atu crashed over for Tonga's fourth try in their 30-12 victory, it was all over.")]));
    assert.ok(!has(fixed, /headline|rugby league/), fixed.join('\n'));
    // (and the women's game, never said: the Red Roses' defeat told as "England have lost a rugby game…")
    byId.set('rr', raw('rr', 'Guardian Sport', 'https://www.theguardian.com/sport/2026/oct/17/canada-england-wxv-rugby-union-match-report', 'Red Roses’ four-year unbeaten streak ends in thriller', 'England have lost a rugby game after four years and 41 games unbeaten. Canada beat England 24-21 in Vancouver.'));
    const rr = (text) => faultsOf(edition([story('rr', 'B', 'RUGBY UNION', 'Red Roses’ four-year unbeaten streak ends in thriller', text)]));
    assert.ok(has(rr('England have lost a rugby game after four years and 41 games unbeaten. Canada beat England 24-21 in Vancouver.'), /^the women's game never said/));
    assert.ok(!has(rr("In women's rugby union, England have lost a rugby game after four years and 41 games unbeaten. Canada beat England 24-21 in Vancouver."), /women's game/));
  });

  test('a story of one sentence, or one that opens on someone\'s words; and its verbatim share is measured', () => {
    const { faults, verbatim } = editionChecks(edition([story('lough', 'B', 'RACING', 'Loughnane becomes youngest champion jockey', '"I love my job and I love riding horses – it\'s all I ever wanted to do," said Loughnane, nicknamed \'Billy the Kid\'.')]), { getStory, air: SAT });
    assert.ok(has(faults, /^a story of one sentence:/), faults.join('\n'));
    assert.ok(has(faults, /^opens on a quotation:/), faults.join('\n'));
    assert.equal(verbatim.length, 1);
    assert.ok(verbatim[0].share >= 0 && verbatim[0].share <= 1);
  });
});
