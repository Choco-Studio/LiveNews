import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Archive } from '../server/archive.js';
import { excludedKind, entryOut, labelLike, quizWords, usablePlace, usableFigure, quizEvents, realEntry, maskPlace, countryOf, regionOf, MASK, shareName, quizRefuses } from '../server/quiz/desk.js';
import { graveDay } from '../server/quiz/grave.js';
import { letterReveal, seeded, londonDayStart, ROUND_TYPES, buildQuestions } from '../server/quiz/rounds.js';
import { planEdition, contestantsFrom, historyOf, pairings } from '../server/quiz/planner.js';
import { loadChannel } from '../server/channel.js';

// PAY ATTENTION's question desk (docs/programmes/pay-attention.md §3, §4, §7; build step 1): what the quiz may use,
// the grave-day rule, the rounds and the edition planner.

const H = 3600_000;
const DAY = 24 * H;
const NOW = Date.parse('2026-10-15T15:00:00Z'); // Thursday 16:00 London
const entry = (o) => ({ at: NOW - H, programId: 'world-now', rank: 3, link: 'https://www.bbc.co.uk/news/x', source: 'BBC News', category: 'world', image: 'https://ichef.bbci.co.uk/x.jpg', ...o, id: o.id || `s${Math.random().toString(36).slice(2, 10)}`, headline: o.headline ?? o.title, summary: o.summary ?? o.text ?? '' });

describe('what is never asked (§3.1)', () => {
  const out = (headline, text = '') => entryOut(entry({ title: headline, text: `${headline}. ${text}` }));
  test('every excluded kind, on real headlines of 12–13 Oct', () => {
    assert.ok(out('Two climbers killed on Mont Blanc'));
    assert.ok(out('Fire destroys historic covered food market')); // grave by text before it is a disaster
    assert.equal(out('Roofing scammers con homeowners out of thousands of pounds'), 'crime');
    assert.equal(out('Ethiopian forces enter strategic Tigray town of Adwa'), 'conflict');
    assert.equal(out('Both Russia, Ukraine are using AI-powered drones'), 'conflict');
    assert.equal(out('UK PM Andy Burnham met Man City chairman'), 'politics');
    assert.equal(out('Pope Leo XIV will have surgery'), 'politics');
    assert.equal(out('I earn £120,000 a year making social media videos go viral'), 'money of people');
    assert.equal(out('Atletico Madrid vs Manchester United: Champions League – Predictions, teams'), 'betting');
    assert.equal(out('HMV to close Oxford Street store'), 'hardship');
    assert.equal(out("Tom Cruise film Digger forecast to become one of Hollywood's biggest flops"), 'failure of a person');
    assert.equal(out('TechCrunch Disrupt 2026 starts tomorrow: Your final chance to secure up to $100 ticket savings'), 'promotion');
    assert.equal(out('OnePlus 16 is firm’s most interesting phone'), 'opinion');
    assert.equal(out('Mechanism’s first Switch 2 case is as awesome as I hoped it would be'), 'opinion');
    assert.equal(out('Pupils return to school after the summer'), 'children');
    assert.equal(entryOut(entry({ title: 'Museum reopens its doors', grave: true })), 'read grave or serious');
    // found in the step-2 reading (13 Oct): a politician named in the headline, censorship, a flood without victims
    assert.equal(out('Enter the Zachbot: Trump’s new press secretary malfunctions on podium debut'), 'politics');
    assert.equal(out('BBC FM radio transmissions suspended in Afghanistan'), 'conflict');
    assert.equal(out('Iconic Iguazu Falls walkway dismantled amid record water levels'), 'disaster');
    // found on air (step 7, the editions of 12–13 Oct): an execution asked as LETTER BY LETTER, a state's fee policy,
    // a firm's falling revenue in HOW MANY?'s own sentence, a luxury group's missed forecasts
    assert.equal(out('Emergency calls from botched Christa Pike execution released', 'A series of calls, obtained by the Associated Press, reveal emergency services were delayed in reaching Pike.'), 'crime');
    assert.ok(out('Inmate on death row granted a new hearing')); // (grave by text first)
    assert.equal(excludedKind('Inmate granted a new hearing before execution date'), 'crime');
    // a layoff in any form (the step-1 gate, 16 Oct: "Netflix is laying off around 1,000 employees" as a tie-break)
    for (const h of ['Netflix is laying off around 1,000 employees', 'Studio lays off half its staff']) assert.equal(excludedKind(h), 'hardship', h);
    // a programme's episode is no story (the step-1 gate, 16 Oct: a Guardian podcast as PICTURE THIS's answer)
    for (const h of ['Is your boss watching you? The rise of AI surveillance at work – podcast', 'Podcast: the week in science', 'Volcano erupts again – video']) assert.equal(excludedKind(h), 'promotion', h);
    for (const h of ['Live music venues close at record rate', 'Video game sales rise again', 'Scientists map ocean floor']) assert.notEqual(excludedKind(h), 'promotion', h);
    // judged as an archive entry too, where the title is followed by its headline and summary
    assert.equal(entryOut(entry({ title: 'Is your boss watching you? The rise of AI surveillance at work – podcast', headline: 'Is your boss watching you', text: 'A conversation about workplace monitoring.' })), 'promotion');
    assert.equal(out('India delays digital payments fee rollout', 'India has delayed digital payments fee rollout, TechCrunch reports.'), 'politics');
    assert.equal(entryOut(entry({ title: 'India delays digital payments fee rollout amid retailer pushback', headline: 'India delays digital payments fee rollout', text: 'The NPCI said it was postponing the rollout.' })), 'politics');
    assert.equal(out('France to tax private jet flights'), 'politics');
    assert.equal(entryOut(entry({ title: 'Bumble agrees to a $1.3B acquisition deal as online dating faces a reset', headline: 'Bumble agrees to a $1.3B acquisition deal', summary: 'After years of declining subscriber numbers and falling revenue, Bumble just agreed to a $1.3 billion acquisition.', text: 'Our number of the day: $1.3 billion. After years of declining subscriber numbers and falling revenue, Bumble just agreed to a $1.3 billion acquisition.' })), 'hardship');
    assert.equal(out('LVMH sales miss growth forecasts as China luxury demand slows'), 'hardship');
    // found on air (step 7, round 14, 14 Oct): a player's sending-off with a mocking quote shown as an option, staff
    // quitting under a firm's cuts asked in TODAY OR NOT TODAY, a flight's incident as the tie-break
    assert.equal(out('Bayern’s Michael Olise sent off for ‘super dumb’ yellows within seconds'), 'failure of a person');
    assert.equal(out('Striker booed off after penalty miss'), 'failure of a person');
    assert.equal(out('Hundreds of Royal Mail staff quitting each week under new efficiency plans'), 'hardship');
    assert.equal(out('Royal Mail losing 400 postal workers a week, says union'), 'hardship');
    assert.equal(out('BA flight forced to turn back over cracked window'), 'disaster');
    assert.equal(out('Plane makes emergency landing after engine failure'), 'disaster');
    // found in round 15's reading (14 Oct): a state's deal its aired text puts in a president's mouth, behind a
    // presenter's handoff; trade frictions
    const taiwan = entry({ title: 'Taiwan plans to buy liquefied natural gas from Alaska pipeline project', headline: 'Taiwan plans to buy liquefied natural gas', summary: 'Taiwan planned to buy liquefied natural gas from a U.S. project after extraction and could invest up to $4.4 billion in it', text: 'Thanks, Lola. Taiwan planned to buy liquefied natural gas from a U.S. project, according to ABC News. Under the current plan, the annual purchase and participation in the Alaska project development. This is what Donald Trump, the U.S. President, said, as reported by ABC News.' });
    assert.equal(entryOut(taiwan), 'politics'); // (a country that plans to buy is its government)
    assert.equal(entryOut(entry({ title: 'Shipyard wins an order for liquefied gas carriers', summary: 'The yard will build four carriers.', text: 'Thanks, Lola. The yard will build four carriers, according to ABC News. This is what Donald Trump, the U.S. President, said, as reported by ABC News.' })), 'politics (a politician named)');
    assert.equal(out('China’s trade surplus hits $938 billion for Jan-Sep as pressure ramps up to rebalance trade'), 'politics');
    assert.equal(out("'I'd talk to the TV': The paid companions bringing warmth to China's lonely"), 'hardship');
    assert.equal(out('Skydance’s Discovery+ prices increase by up to 20%'), 'hardship');
    // under the game on round 15's recordings (14 Oct's feeds): what the quiz refuses, by title alone as the ticker has it
    const refused = {
      'Taiwan plans to buy liquefied natural gas from Alaska pipeline project': 'politics',
      'Netflix to cut 1,000 jobs as subscriptions slow': 'hardship',
      "What this year's final four says about the labor battle -- and the game's future": 'politics',
      'Prismm helps banks keep inherited money in-house': 'money of people',
      'Matchup rankings for Week 6: Upgrade Tony Pollard, fade Trevor Lawrence': 'betting',
      'Espada not returning as Astros manager after winning AL West': 'failure of a person',
      'College Football Bottom 10: Texas takes major fall': 'failure of a person',
      "NFL suspends Rams' Jackson for striking Bills' Chubb in face after game": 'failure of a person',
      'Wilcox the target again in another damaging Man Utd fallout': 'failure of a person',
      'Pakistan has locked down Imran Khan\'s stronghold - but it could backfire': 'politics',
      // (round 15's final bands, 14 Oct, and 16 Oct's feeds)
      'Sir Trevor Phillips encouraged CBS News colleagues to tell critics to ‘fuck off’': 'offensive language',
      'The Archers cast ‘angry’ at BBC decision to scrap new Birmingham studio': 'failure of a person',
      "Darnold owns up to mistakes in OT loss: Late picks 'not fair' to Seahawks": 'failure of a person',
      'Eagles QB Hurts ruled out vs. Panthers with blood clot in calf': 'health',
      "Tough loss for Sabalenka as Britain's Kartal earns big win over Bencic in Wuhan": 'failure of a person',
      'UK’s ‘incoherent’ approach to China plagued by lack of expertise, report says': 'politics',
    };
    for (const [title, kind] of Object.entries(refused)) assert.equal(quizRefuses({ title, summary: '' }), kind, title);
    for (const title of ['Mattingly stays on as Phillies manager, reaching 2-year deal', 'Now you can call anyone with WhatsApp, even if they don’t have WhatsApp', 'Peralta stars as Rays even series against Guardians']) assert.equal(quizRefuses({ title, summary: '' }), null, title);
    // the opening sentence is the story's, never the handoff before it
    assert.equal(entryOut(entry({ title: 'Lisbon opens a riverside tram line', summary: '', text: 'Thanks, Lola. The government opens a riverside tram line in Lisbon. It runs every ten minutes.' })), 'politics');
  });
  test('senses that only look excluded', () => {
    assert.equal(out('Roman fort found in Wales could prove myth of emperor’s camp is real', 'The Roman emperor led his troops against the Picts and set up a military camp, folklore says.'), null);
    assert.equal(out('New injection makes fat cells self-destruct', 'Scientists have developed an injection that destroys fat cells.'), null);
    assert.equal(out('NASA spots patch of Moon-like rock on Earth', 'The formation dates back at least 600 million years and bears the scars of ancient collisions.'), null);
    assert.equal(out('Electric car sales overtake diesel in Europe'), null); // "diesel" is not "dies"
    assert.equal(out('Late goal earns City a draw at the Bowl'), null);
    assert.equal(out('Carmaker bets on nostalgia with its electric classic'), null);
    // a country that launches or builds is news, not a government's policy; sales that grow are no hardship
    assert.equal(out('Japan launches a probe to the Moon’s far side'), null);
    assert.equal(out('Electric car sales surge across Europe'), null);
    assert.equal(out('Citroën’s iconic 2CV returns as all-electric model', 'The iconic 2CV returns at the Paris Motor Show as a fully electric city car.'), null);
    // a passing mention after the opening does not make a tunnel story politics
    assert.equal(entryOut(entry({ title: 'Norway opens a 27 kilometre road tunnel', summary: 'A 27 kilometre road tunnel under a fjord has opened on the west coast of Norway. The government says it cuts the journey by 40 minutes.', text: 'Now to Western Norway. A 27 kilometre road tunnel under a fjord has opened on the west coast of Norway.' })), null);
    assert.equal(excludedKind('A space probe reaches the asteroid'), null);
  });
  test('fixture stories are never real', () => {
    assert.equal(realEntry({ link: 'https://fixtures.globit.invalid/world/3' }), false);
    assert.equal(realEntry({ link: 'pages/world-3.html' }), false);
    assert.equal(realEntry({ link: 'http://127.0.0.1:8080/x' }), false);
    assert.equal(realEntry({ link: 'https://www.theverge.com/x' }), true);
  });
});

describe('one story once an edition', () => {
  test('two headlines opening on one name are one story when their sources open on a shared name (on air, 13 Oct: Facebook\'s "Your Algorithm" asked twice)', () => {
    const ev = (words, title, summary) => ({ words, latest: { title, summary } });
    const verge = ev('Facebook will let you customize your feed algorithm using AI', 'Facebook will let you customize your feed algorithm using AI', 'Facebook\'s new "Your Algorithm" feature will let you directly add and manage topics you want to see in your feed and Facebook Reels. Meta says your recommendations will update.');
    const tc = ev('Facebook is giving users more control', 'Facebook is giving users more control over their algorithm', 'Meta announced the launch of its new AI-powered feature, “Your Algorithm,” a feature it first launched on Instagram.');
    assert.equal(shareName(verge, tc), true);
    assert.equal(shareName(tc, verge), true);
    // the same opening word alone is not one story: two museums, two programmes' fixtures with no summary
    const m1 = ev('Museum reopens its glass hall', 'Museum reopens its glass hall', 'The hall was closed for two years.');
    const m2 = ev('Museum finds a lost Turner sketch', 'Museum finds a lost Turner sketch', 'The sketch was in a drawer.');
    assert.equal(shareName(m1, m2), false);
    assert.equal(shareName(ev('Telescope opens a quiet new wing number 1', 'Telescope opens a quiet new wing number 1', ''), ev('Telescope opens a quiet new wing number 13', 'Telescope opens a quiet new wing number 13', '')), false);
    // or a coined compound both use, from one opening name (13 and 14 Oct: two sources' takes, asked on two days)
    assert.equal(shareName(ev('Google makes it easier to launch your vibe-coded apps', '', ''), ev('Google wants to host your personal vibe-coded apps', '', '')), true);
    assert.equal(shareName(ev('Google makes it easier to launch your vibe-coded apps', '', ''), ev('Apple ships vibe-coded apps', '', '')), false);
    // a name inside both headlines, as before
    assert.equal(shareName(ev('Citroën unveils electric version of its 2CV', '', ''), ev('Citroën’s iconic 2CV returns as all-electric model', '', '')), true);
  });
  test('one story never shows as a wrong option in two questions (round 15\'s reading, 14 Oct: Citroën\'s 2CV under two pictures)', () => {
    const mk = (key, words, category) => ({ key, words, category, image: 'https://x/y.jpg', imageId: key, programmes: ['world-now'], first: NOW - H, last: NOW - H, source: 'BBC News', latest: { programId: 'world-now', title: words, summary: '' } });
    const asked = [mk('a1', 'Lufthansa to buy a stake in TAP Air Portugal', 'business'), mk('a2', 'Energy bills through roof', 'business')];
    const options = [mk('o1', 'Citroën’s iconic 2CV returns as all-electric model', 'world'), mk('o2', 'Revival of classic: Citroën unveils electric version of its 2CV', 'world'), mk('o3', 'Pollinating insects flock to plants gardeners call weeds', 'science'), mk('o4', 'Driving test waits fall to a two-year low', 'world'), mk('o5', 'Owls ringed to measure benefits of wildlife farming', 'science')];
    for (let i = 0; i < 40; i++) {
      const qs = buildQuestions('picture', asked, options, seeded(`c${i}`), {});
      if (!qs) continue;
      const shown = qs.flatMap((q) => q.options.map((o) => o.key));
      assert.ok(!(shown.includes('o1') && shown.includes('o2')), `seed c${i}: the 2CV twice`);
    }
  });
});

describe('the words on screen are the channel’s own (§3.2)', () => {
  test('a cut that stops at a clause boundary is kept, a broken one is not', () => {
    assert.equal(quizWords({ headline: 'Carmaker to close Turin plant', title: 'Carmaker to close Turin plant, putting 2,400 jobs at risk' }), 'Carmaker to close Turin plant');
    assert.equal(quizWords({ headline: 'HMV to close Oxford Street store', title: 'HMV to close Oxford Street store after three years' }), 'HMV to close Oxford Street store');
    assert.equal(quizWords({ headline: 'Chinese carmakers increasingly rely', title: 'Chinese carmakers increasingly rely on overseas markets as September exports surge' }), null);
    assert.equal(quizWords({ headline: 'Museum finds a lost', title: 'Museum finds a lost Turner sketch' }), 'Museum finds a lost Turner sketch');
    // a comma between two adjectives is no clause boundary (TechCrunch, 13 Oct)
    assert.equal(quizWords({ headline: 'Google Play now lets anyone build private', title: 'Google Play now lets anyone build private, vibe-coded apps that run on Android' }), null);
    assert.equal(quizWords({ headline: 'Scientists turn to', title: 'Scientists turn to bees to map pollution in the parks and gardens of every city in the whole of Denmark' }), null);
    // a cut that also dropped the title's articles is still a cut (the step-1 gate, 16 Oct): the whole title, not the
    // broken "…helped pave way"
    assert.equal(quizWords({ headline: 'This tiny jurassic predator helped pave way', title: 'This tiny jurassic predator helped pave the way for the human brain' }), 'This tiny jurassic predator helped pave the way for the human brain');
    assert.equal(quizWords({ headline: 'Museum finds lost Turner sketch', title: 'Museum finds a lost Turner sketch' }), 'Museum finds lost Turner sketch');
  });
});

describe('a headline says what happened', () => {
  test('picture captions, notices and fixtures are no headlines', () => {
    for (const h of ['Transporter-18 SmallSats Encapsulation', 'Comparing Off-World Rover Driving Distances', "Today's results"]) assert.equal(labelLike(h), true, h);
    for (const h of ['Antarctic Sea Ice Grows to Its 2026 Maximum', 'Scientists map ocean floor', "F1 in Singapore: There's new fastest car now", 'New glowing mushroom species found', 'Owls ringed to measure benefits of wildlife farming']) assert.equal(labelLike(h), false, h);
    assert.equal(entryOut(entry({ title: 'Job opportunities: NASA office of general counsel' })), 'promotion');
    assert.equal(entryOut(entry({ title: '48 hours to TechCrunch Disrupt 2026' })), 'promotion');
  });
});

describe('places and figures (§4.1)', () => {
  test('where the story happens, with the place masked when the headline names it', () => {
    const iceland = entry({ title: 'Volcano erupts again on a peninsula', text: 'In Iceland, a fissure eruption has started again.', location: { place: 'ICELAND', lat: 64.9, lon: -18.6 } });
    const p = usablePlace(iceland, 'Volcano erupts again on a peninsula');
    assert.equal(p.label, 'ICELAND');
    assert.equal(p.masked, null);
    assert.equal(p.region, 'europe');
    // where a product is sold is no "where" either
    const google = entry({ title: 'Google makes it easier to launch your vibe-coded apps', text: 'The feature is available in the US from today.', location: { place: 'USA', lat: 39.8, lon: -98.6 } });
    assert.equal(usablePlace(google, google.title), null);
    // "launches in US" said in the headline itself (the step-1 gate, 16 Oct: a WHERE question on a product's launch)
    const cart = entry({ title: 'Google’s Universal Cart shopping tool launches in US', text: 'The shopping tool launches in US today.', location: { place: 'USA', lat: 39.8, lon: -98.6 } });
    assert.equal(usablePlace(cart, cart.title), null);
    // a company's home country is no "where"
    const cmf = entry({ title: 'CMF’s first wireless speakers look like musical milk cartons', text: 'Indian brand CMF has unveiled its first wireless speakers.', location: { place: 'INDIA', lat: 22, lon: 79 } });
    assert.equal(usablePlace(cmf, cmf.title), null);
    // the headline names it: masked, possessive and people included
    const egypt = entry({ title: 'Egypt’s Fayoum mummy portraits to travel abroad', text: 'The portraits will leave Egypt for the first time.', location: { place: 'EGYPT', lat: 26.8, lon: 30.8 } });
    const e = usablePlace(egypt, egypt.title);
    assert.equal(e.masked, `${MASK}’s Fayoum mummy portraits to travel abroad`);
    const f1 = entry({ title: "F1 in Singapore: There's new fastest car now", text: 'The race in Singapore.', location: { place: 'SINGAPORE', lat: 1.35, lon: 103.8 } });
    assert.equal(usablePlace(f1, f1.title).masked, `F1 in ${MASK}: There's new fastest car now`);
    assert.equal(maskPlace('Chile', countryOf({ place: 'CHILE' }), 'CHILE'), null); // nothing left to read
    assert.equal(regionOf({ lat: 40, lon: -100 }), 'north-america');
    assert.equal(regionOf({ lat: -25, lon: 134 }), 'oceania');
  });
  test('a figure aired verbatim with its label; never a model name; the qualifier stays', () => {
    const f = usableFigure(entry({ title: 'Wind farm powers homes', text: 'The developer says its 140 turbines can power about 1.2 million homes.', numbers: [{ value: '1.2 million', label: 'HOMES', qualifier: 'ABOUT' }] }));
    assert.equal(f.value, '1.2 million');
    assert.equal(f.exact, false);
    assert.match(f.masked, /about ▮+ homes/);
    assert.equal(usableFigure(entry({ title: 'AI chip', text: 'We expect Maia 300 to deliver 40 percent more tokens.', numbers: [{ value: '300', label: 'NOT' }] })), null);
    const owls = usableFigure(entry({ title: 'Barn owls ringed', text: 'A barn owl and 15 chicks are ringed to see if the farming works.', numbers: [{ value: '15', label: 'CHICKS' }] }));
    assert.equal(owls.exact, true);
    assert.equal(owls.masked, 'A barn owl and ▮▮ chicks are ringed to see if the farming works.');
  });
});

describe('the grave-day rule (§3.3)', () => {
  const airings = (n, o = {}) => Array.from({ length: n }, (_, i) => entry({ title: `Story ${i}`, at: NOW - (i % 5) * H - 1000, ...o }));
  test('an ordinary heavy day airs; a grave one does not', () => {
    const ordinary = [...airings(36), ...airings(4, { grave: true })]; // 10 % grave, as 12 Oct's 9–14 %
    assert.equal(graveDay(ordinary, { now: NOW }).grave, false);
    const heavy = [...airings(28), ...airings(12, { grave: true })]; // 30 %
    assert.equal(graveDay(heavy, { now: NOW }).grave, true);
    const breaking = [...airings(30), entry({ title: 'Earthquake kills dozens in the capital', breaking: true, at: NOW - 2 * H })];
    assert.equal(graveDay(breaking, { now: NOW }).grave, true);
    const harmlessBreaking = [...airings(30), entry({ title: 'Panama Canal reopens after a day-long closure', breaking: true, at: NOW - 2 * H })];
    assert.equal(graveDay(harmlessBreaking, { now: NOW }).grave, false);
  });
  test('the same harmful story leading four times stops it; twice does not', () => {
    const lead = (k) => Array.from({ length: k }, (_, i) => entry({ id: 'quake', title: 'Earthquake kills 40 and injures hundreds', rank: 0, programId: i % 2 ? 'news-60' : 'world-now', at: NOW - i * H - 1000 }));
    assert.equal(graveDay([...airings(30), ...lead(4)], { now: NOW }).grave, true);
    assert.equal(graveDay([...airings(30), ...lead(2)], { now: NOW }).grave, false);
  });
  test('too little aired to judge: the quiz does not air', () => {
    assert.equal(graveDay(airings(5), { now: NOW }).thin, true);
  });
});

describe('LETTER BY LETTER’s reveal', () => {
  test('first letters, digits and punctuation at once; every word gets another letter by the second stage', () => {
    const words = 'Norway opens a 27 kilometre road tunnel';
    const r = letterReveal(words, seeded('x'));
    const chars = [...words];
    for (const i of [0, 7, 13, 18, 28, 33]) assert.ok(r.shown.includes(i), `first letter at ${i}`);
    assert.ok(r.shown.includes(15) && r.shown.includes(16)); // the digits
    const upTo2 = new Set([...r.shown, ...r.order.slice(0, r.stages[1])]);
    let start = 0;
    for (const w of words.split(' ')) {
      const idx = [...w].map((_, k) => start + k).filter((i) => /\p{L}/u.test(chars[i]));
      if (idx.length >= 2) assert.ok(idx.filter((i) => upTo2.has(i)).length >= 2, `"${w}" shows two letters by stage 2`);
      start += w.length + 1;
    }
    assert.ok(r.stages[0] <= r.stages[1] && r.stages[1] <= r.stages[2]);
  });
});

// A rich week of real-looking archive: benign stories on every desk and programme, with places in every region and figures
const PLACES = [
  ['FRANCE', 46.6, 2.2], ['JAPAN', 36.2, 138.3], ['BRAZIL', -10.8, -52.9], ['KENYA', 0.2, 37.9], ['CANADA', 56.1, -106.3],
  ['AUSTRALIA', -25.3, 133.8], ['INDIA', 22, 79], ['MEXICO', 23.6, -102.5], ['NORWAY', 60.5, 8.5], ['CHILE', -35.7, -71.5],
  ['VIETNAM', 14.1, 108.3], ['MOROCCO', 31.8, -7.1], ['ITALY', 41.9, 12.6], ['PERU', -9.2, -75], ['NEW ZEALAND', -40.9, 174.9],
];
const COUNTRY_NAMES = { FRANCE: 'France', JAPAN: 'Japan', BRAZIL: 'Brazil', KENYA: 'Kenya', CANADA: 'Canada', AUSTRALIA: 'Australia', INDIA: 'India', MEXICO: 'Mexico', NORWAY: 'Norway', CHILE: 'Chile', VIETNAM: 'Vietnam', MOROCCO: 'Morocco', ITALY: 'Italy', PERU: 'Peru', 'NEW ZEALAND': 'New Zealand' };
const SUBJECTS = ['telescope', 'museum', 'garden', 'robot', 'orchestra', 'library', 'bridge', 'satellite', 'festival', 'glacier', 'coral reef', 'train line', 'chip plant', 'wind farm', 'ferry', 'zoo', 'observatory', 'bakery', 'airline', 'startup'];
const VERBS = ['unveils', 'opens', 'launches', 'celebrates', 'tests', 'restores', 'maps', 'finds', 'builds', 'records'];
const OBJECTS = ['a new wing', 'its largest dish', 'a rare orchid', 'a quiet engine', 'a floating stage', 'an old map', 'a glass walkway', 'a weather sensor', 'a lantern parade', 'a hidden cave'];
const PROGRAMMES = [['world-now', 'world'], ['tech-bytes', 'tech'], ['cosmos', 'science'], ['money-minute', 'business'], ['news-60', 'world']];
function richWeek() {
  const a = new Archive({ dir: null, days: 14, now: () => NOW });
  let n = 0;
  for (let d = 9; d >= 0; d--) {
    for (let k = 0; k < 12; k++) {
      const at = NOW - d * DAY - (k + 1) * 50 * 60_000;
      const [programId, category] = PROGRAMMES[n % PROGRAMMES.length];
      const subj = SUBJECTS[n % SUBJECTS.length];
      const title = `${subj[0].toUpperCase()}${subj.slice(1)} ${VERBS[(n * 3) % VERBS.length]} ${OBJECTS[(n * 7) % OBJECTS.length]} number ${n + 1}`;
      const placed = n % 3 === 0;
      const [place, lat, lon] = PLACES[n % PLACES.length];
      const fig = n % 4 === 1;
      a.keep(entry({
        id: `e${n}`, at, programId, category, rank: k % 6, title,
        text: `${title}${placed ? ` in ${COUNTRY_NAMES[place]}` : ''}. The project took ${fig ? `${120 + n} days` : 'many months'} to finish, its makers say.`,
        ...(placed ? { location: { place, lat, lon } } : {}),
        ...(fig ? { numbers: [{ value: String(120 + n), label: 'DAYS' }] } : {}),
      }));
      n++;
    }
  }
  // the day's programmes re-air the latest stories through the afternoon (the grave-day rule needs six hours of airings)
  a.entries.slice(-24).forEach((e, i) => a.keep({ ...e, at: NOW - ((i * 37) % 300) * 60_000 - 60_000 }));
  a.entries.sort((x, y) => x.at - y.at);
  return a;
}
const channel = loadChannel();
const CONTESTANTS = contestantsFrom(channel, ['paco', 'lola', 'max', 'ada', 'nova', 'unit8', 'penny', 'sam']);

describe('the edition planner (§2, §4, §7)', () => {
  const archive = richWeek();
  const { events } = quizEvents(archive, { now: NOW, days: 7 });
  const entries = archive.entries;
  const plan = planEdition({ events, entries, now: NOW, contestants: CONTESTANTS, history: [] });

  test('a rich week fills a whole edition', () => {
    assert.equal(plan.air, true, plan.reason);
    assert.equal(plan.rounds.length, 3);
    assert.equal(new Set(plan.types).size, 3);
    assert.ok(plan.tieBreak?.words);
    assert.ok(plan.don.offers.length >= 1);
    assert.ok(plan.recent >= 5);
  });

  test('two players from different programmes; nothing from their programmes, as question or option', () => {
    const [a, b] = plan.pair.map((id) => CONTESTANTS.find((c) => c.id === id));
    assert.ok(!a.own.some((p) => b.own.includes(p)));
    const own = new Set([...a.own, ...b.own]);
    const byKey = new Map(events.map((e) => [e.key, e]));
    const keys = [];
    for (const r of plan.rounds) for (const q of r.questions) {
      if (q.key) keys.push(q.key);
      for (const o of q.options || []) if (o.key) keys.push(o.key); // a neutral country pin has no story
      for (const it of q.items || []) keys.push(it.key);
    }
    for (const k of keys) assert.ok(!byKey.get(k).programmes.some((p) => own.has(p)), `${k} is from a player's programme`);
  });

  test('every option is a real headline or place of an eligible event; the answer is among them', () => {
    const byKey = new Map(events.map((e) => [e.key, e]));
    for (const r of plan.rounds) for (const q of r.questions) {
      if (q.type === 'picture') {
        assert.equal(q.options.length, 3);
        for (const o of q.options) assert.equal(o.words, byKey.get(o.key).words);
        assert.ok(new Set(q.options.map((o) => o.desk)).size >= 2, 'at most two from one desk');
        assert.equal(q.options.find((o) => o.letter === q.answer).key, q.key);
      }
      if (q.type === 'where') {
        assert.equal(new Set(q.options.map((o) => o.country)).size, 3);
        for (const o of q.options) if (o.key) assert.equal(o.country, byKey.get(o.key).optionPlace.country);
        assert.equal(new Set(q.options.map((o) => o.region)).size, 3, 'three regions');
        assert.equal(q.options.find((o) => o.letter === q.answer).country, byKey.get(q.key).place.country);
      }
      if (q.type === 'today') {
        const dayStart = londonDayStart(NOW);
        for (const it of q.items) {
          const ev = byKey.get(it.key);
          if (it.answer === 'TODAY') assert.ok(ev.first >= dayStart + 6 * H);
          else assert.ok(ev.last < dayStart - DAY, 'EARLIER is never yesterday');
        }
        assert.equal(q.items.filter((i) => i.answer === 'TODAY').length, 3);
      }
      if (q.type === 'howmany') assert.match(q.masked, /▮/);
    }
  });

  test('no story is asked twice, and none is an option in its own edition', () => {
    assert.equal(new Set(plan.asked).size, plan.asked.length);
    const asked = new Set(plan.asked);
    for (const r of plan.rounds) for (const q of r.questions) for (const o of q.options || []) if (o.key && o.key !== q.key) assert.ok(!asked.has(o.key));
  });

  test('DOUBLE OR NOTHING plays a type not played tonight, or PICTURE THIS', () => {
    assert.ok(!plan.types.includes(plan.don.type) || plan.don.type === 'picture');
    assert.ok(ROUND_TYPES.includes(plan.don.type));
  });

  test('the same edition always gets the same plan', () => {
    const again = planEdition({ events, entries, now: NOW, contestants: CONTESTANTS, history: [] });
    assert.deepEqual(again.pair, plan.pair);
    assert.deepEqual(again.asked, plan.asked);
  });

  test('the evening edition: new players, a different set of rounds, nothing asked again', () => {
    const later = NOW + 4.5 * H;
    const history = [historyOf(plan)];
    const next = planEdition({ events: quizEvents(archive, { now: later, days: 7 }).events, entries: entries.map((e) => ({ ...e })), now: later, contestants: CONTESTANTS, history, minArchiveDays: 0 });
    // the archive's last airing is hours before `later`, so the grave-day check finds it thin: plan with fresh airings
    const fresh = [...entries, ...Array.from({ length: 24 }, (_, i) => entry({ title: `Evening item ${i}`, at: later - (i + 1) * 10 * 60_000 }))];
    const evening = next.air ? next : planEdition({ events: quizEvents(archive, { now: later, days: 7 }).events, entries: fresh, now: later, contestants: CONTESTANTS, history });
    assert.equal(evening.air, true, evening.reason);
    assert.ok(!evening.pair.some((id) => plan.pair.includes(id)), 'nobody plays twice in a day while others can');
    assert.notDeepEqual([...evening.types].sort(), [...plan.types].sort());
    assert.ok(!evening.asked.some((k) => plan.asked.includes(k)));
  });

  test('Paco and Lola never play each other, nor Max and Ada, nor Nova and UNIT-8', () => {
    const all = pairings(CONTESTANTS, [], NOW, seeded('p'));
    for (const [x, y] of [['paco', 'lola'], ['max', 'ada'], ['nova', 'unit8']]) assert.ok(!all.some((p) => [p.a.id, p.b.id].includes(x) && [p.a.id, p.b.id].includes(y)));
    assert.equal(all.length, 25);
  });

  test('the quiz does not air overnight, on a young archive or on a grave day', () => {
    const night = Date.parse('2026-10-15T23:30:00Z');
    assert.match(planEdition({ events, entries, now: night, contestants: CONTESTANTS }).reason, /overnight/);
    const young = entries.filter((e) => e.at > NOW - 2 * DAY);
    assert.match(planEdition({ events, entries: young, now: NOW, contestants: CONTESTANTS }).reason, /needs 3/);
    const grave = [...entries, ...Array.from({ length: 30 }, (_, i) => entry({ title: `Grave ${i}`, grave: true, at: NOW - (i + 1) * 5 * 60_000 }))];
    assert.match(planEdition({ events, entries: grave, now: NOW, contestants: CONTESTANTS }).reason, /grave news day/);
  });

  test('a wrong pin is never a country the week’s left-out stories name', () => {
    const avoid = new Set(['Japan', 'Kenya', 'Peru', 'Norway', 'Italy', 'Vietnam']);
    const p = planEdition({ events: events.map((e) => ({ ...e, optionPlace: null })), entries, now: NOW, contestants: CONTESTANTS, history: [], avoid });
    for (const r of p.rounds || []) for (const q of r.questions) if (q.type === 'where') for (const o of q.options) if (o.letter !== q.answer) assert.ok(!avoid.has(o.country), o.country);
  });

  test('a thin week does not air rather than air a poor edition', () => {
    const thin = events.slice(0, 8);
    assert.equal(planEdition({ events: thin, entries, now: NOW, contestants: CONTESTANTS }).air, false);
  });
});
